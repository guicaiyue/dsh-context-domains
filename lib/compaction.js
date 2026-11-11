// 上下文压缩阈值（compaction-basic 的压力线）的运行期接管。
//
// 为什么不是「改配置」：compaction-basic 的 config 在装载时被 deepFreeze，而且它挂在
// preset（@deepseek-ai/dsh-agent-preset）的 isolate 组里 —— profile 的 cordis.patch.yml
// 只能按 id 命中顶层/group 节点，够不到 preset 内部子节点（详见 ~/.dsh/compaction-threshold.py
// 的说明）。所以静态改阈值只有两条路：改 preset 文件（要重启）或该脚本（要重启）。
//
// 真正决定「压不压」的是 resolveCompactSpec() 算出的 thresholdTokens：
//   thresholdTokens = floor(min(window * thresholdRatio, window - reservedOutput - headroomTokens))
// 判定是 `measurement.totalTokens >= thresholdTokens` 就压。于是只要给每个
// (provider, model) 造一条精确的 modelPolicies 覆盖：
//   thresholdRatio = 1、headroomTokens = (window - reservedOutput) - budget
// 解出来就是 min(window, budget) —— 阈值被钉死在用户给的预算上。modelPolicies 在每次
// compactPressure 里现查（resolveTargetPolicy），所以运行期重写 engine.config 立刻生效：
// 不重启 dsh、不动 preset 文件、不依赖模型。
//
// 预算存在自身 state.json（用户数据，不是部署配置），counter 在会话顶栏最右边。
const MIN_TOKENS = 200_000
const MAX_TOKENS = 10_000_000
const STEP_TOKENS = 100_000
const DEFAULT_TOKENS = 500_000
/** 压缩后保留的原文尾巴占阈值的比例（太小等于每轮全summarize，太大压不动）。 */
const RETAIN_SHARE = 0.25
/** 引擎扫描周期：preset 是懒挂载的，新会话选到新 preset 时才会出现新引擎。 */
const SCAN_INTERVAL_MS = 4000
/** cordis fiber 的「已激活」状态值（与 cordis 内部 _getImpl(strict) 同一判据）。 */
const FIBER_ACTIVE = 2

export { MIN_TOKENS, MAX_TOKENS, STEP_TOKENS, DEFAULT_TOKENS }

/** 收进 [20 万, 1000 万]，并按千位取整（UI 只以 10 万为步进）。 */
export function clampBudgetTokens(value) {
  if (!Number.isFinite(value)) return DEFAULT_TOKENS
  const rounded = Math.round(value / 1000) * 1000
  return Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, rounded))
}

/** 文档里的预算；没写过就是默认值（不静默关掉接管）。 */
export function budgetOf(doc) {
  const raw = doc?.compaction?.budgetTokens
  return Number.isFinite(raw) ? clampBudgetTokens(raw) : DEFAULT_TOKENS
}

function keyOf(provider, model) {
  return `${provider}\u0000${model}`
}

export function createCompactionBudget({ ctx, store, logger }) {
  const log = (level, message) => {
    const fn = logger?.[level]
    if (typeof fn === 'function') fn.call(logger, `[context-domains] ${message}`)
  }

  /** engine -> 接管前的原生 config（deepFrozen，只读参照）。 */
  const patched = new Map()
  /** "provider\0model" -> {window, reserved} | {error} */
  const targets = new Map()
  /** engine -> 上次写进去的签名（预算 + policy 表没变就不重写，避免每 4s 换一次 config 对象） */
  const signatures = new WeakMap()
  let timer

  const llm = () => {
    try {
      return ctx.get('llm')
    } catch {
      return undefined
    }
  }

  /** 服务表里所有活着的 compaction 引擎（跨 isolate realm，所以按符号扫 store）。 */
  function liveEngines() {
    const bag = ctx.reflect?.store
    const live = new Set()
    if (bag === undefined || bag === null) return live
    for (const key of Object.getOwnPropertySymbols(bag)) {
      const impl = bag[key]
      if (impl === undefined || impl.name !== 'compaction') continue
      if (impl.ctx?.fiber?.state !== FIBER_ACTIVE) continue
      const value = impl.value
      if (value === undefined || typeof value.compactPressure !== 'function') continue
      live.add(value)
    }
    return live
  }

  /** 把预算翻译成该模型的一条精确 policy。 */
  function policyFor(key, entry, budget) {
    if (entry.error !== undefined) return undefined
    const capacity = entry.window - entry.reserved
    if (!(capacity > 0)) return undefined
    const [provider, model] = key.split('\u0000')
    const threshold = Math.min(budget, capacity)
    const retain = Math.max(1, Math.floor(threshold * RETAIN_SHARE))
    return {
      provider,
      model,
      thresholdRatio: 1,
      headroomTokens: Math.max(0, capacity - budget),
      retainTokens: Math.min(retain, Math.max(1, threshold - 1)),
    }
  }

  function apply(engine) {
    const base = patched.get(engine)
    if (base === undefined) return
    const budget = budgetOf(store.document())
    const policies = []
    for (const [key, entry] of targets) {
      const policy = policyFor(key, entry, budget)
      if (policy !== undefined) policies.push(policy)
    }
    const signature = `${budget}|${JSON.stringify(policies)}`
    if (signatures.get(engine) === signature) return
    signatures.set(engine, signature)
    const ours = new Set(policies.map((policy) => keyOf(policy.provider, policy.model)))
    const inherited = Array.isArray(base.modelPolicies)
      ? base.modelPolicies.filter((policy) => !ours.has(keyOf(policy.provider, policy.model)))
      : []
    engine.config = { ...base, modelPolicies: [...inherited, ...policies] }
  }

  function applyAll() {
    for (const engine of patched.keys()) apply(engine)
  }

  /** 学一条 (provider, model) 的窗口；学不到就记下原因，降级回该模型的原生阈值。 */
  async function learn(target) {
    if (target === null || typeof target !== 'object') return
    const provider = target.provider
    const model = target.model
    if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') return
    const key = keyOf(provider, model)
    const known = targets.get(key)
    // 失败过的目标给 30s 冷却后重试（适配器可能只是暂时没就绪）
    if (known !== undefined) {
      if (known.error === undefined) return
      if (Date.now() - (known.at ?? 0) < 30_000) return
      targets.delete(key)
    }
    const service = llm()
    if (service === undefined) {
      targets.set(key, { error: 'llm 服务不可见，无法解析模型窗口', at: Date.now() })
      return
    }
    try {
      const info = await service.resolveModelInfo(provider, model)
      const window = info?.context?.contextWindow
      if (!Number.isInteger(window) || window <= 0) {
        targets.set(key, { error: '模型没有声明 contextWindow', at: Date.now() })
        return
      }
      targets.set(key, { window, reserved: Number.isFinite(info.defaultMaxTokens) ? info.defaultMaxTokens : 0 })
      applyAll()
    } catch (error) {
      targets.set(key, { error: error?.message ?? String(error), at: Date.now() })
    }
  }

  /**
   * 装上包装，一次就够。
   *
   * 包 compactPressure 而不是换个引擎实现：它同时被自动压缩（isBeforeStep）、模型切换
   * 和 compactIfNeeded 三处调用，包一层就全覆盖；而且这里是唯一能拿到 header.config
   * 的地方 —— 模型路由只有走到这一步才知道，窗口也因此才能按需解析。
   */
  function patch(engine) {
    if (patched.has(engine)) return false
    const original = engine.compactPressure
    if (typeof original !== 'function') return false
    patched.set(engine, engine.config)
    engine.compactPressure = async function compactPressureWithBudget(agent, header, signal, requireBelowThreshold) {
      try {
        await learn(header?.config)
      } catch (error) {
        log('warn', `compaction budget: model info lookup failed: ${error?.message ?? error}`)
      }
      return original.call(engine, agent, header, signal, requireBelowThreshold)
    }
    return true
  }

  /** 扫一遍：摘掉死引擎、装上新引擎、按当前预算重写所有引擎的 policy 表。 */
  function refresh() {
    const live = liveEngines()
    for (const engine of [...patched.keys()]) if (!live.has(engine)) patched.delete(engine)
    let added = 0
    for (const engine of live) if (patch(engine)) added += 1
    applyAll()
    if (added > 0) log('info', `compaction budget: installed on ${patched.size} engine(s)`)
    return status()
  }

  function status() {
    const budget = budgetOf(store.document())
    const rows = []
    const degraded = []
    for (const [key, entry] of targets) {
      const [provider, model] = key.split('\u0000')
      if (entry.error !== undefined) {
        degraded.push({ provider, model, reason: entry.error })
        continue
      }
      const capacity = entry.window - entry.reserved
      rows.push({
        provider,
        model,
        contextWindow: entry.window,
        reservedTokens: entry.reserved,
        thresholdTokens: Math.min(budget, Math.max(0, capacity)),
        clamped: budget > capacity,
      })
    }
    if (patched.size === 0) degraded.push({ reason: '没有在线的 compaction 引擎（preset 还没挂载）' })
    if (llm() === undefined) degraded.push({ reason: 'llm 服务不可见，预算未接管' })
    return {
      budgetTokens: budget,
      tokens: Math.round(budget / STEP_TOKENS),
      stepTokens: STEP_TOKENS,
      minTokens: MIN_TOKENS,
      maxTokens: MAX_TOKENS,
      engines: patched.size,
      targets: rows,
      degraded,
    }
  }

  return {
    status,
    refresh,
    /** 会话起来就重扫一次：新 preset 的引擎是随会话挂载的。 */
    kick() {
      try {
        refresh()
      } catch (error) {
        log('warn', `compaction budget refresh failed: ${error?.message ?? error}`)
      }
    },
    start() {
      refresh()
      timer = setInterval(() => {
        try {
          refresh()
        } catch (error) {
          log('warn', `compaction budget scan failed: ${error?.message ?? error}`)
        }
      }, SCAN_INTERVAL_MS)
      if (typeof timer?.unref === 'function') timer.unref()
      return () => {
        if (timer !== undefined) clearInterval(timer)
        // 还回原生 config：插件被卸载/热更时不留一个「预算已接管」的假象
        for (const [engine, base] of patched) {
          try {
            engine.config = base
          } catch {
            /* 引擎可能已经跟着 preset 一起没了 */
          }
        }
        patched.clear()
      }
    },
  }
}
