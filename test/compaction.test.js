// 压缩阈值接管：用假 store / 假引擎实测「预算 → thresholdTokens」这条换算。
//
// 这里不 mock 我们自己的实现，而是把 compaction-basic 里真正决定压不压的两段
// （resolveTargetPolicy / resolveCompactSpec）照抄一份，喂给我们的控制器算出来的
// engine.config。这样测的是「重写 config 之后原生判定会怎么走」，而不是自说自话。
import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompactionBudget, clampBudgetTokens, budgetOf, MIN_TOKENS, MAX_TOKENS } from '../lib/compaction.js'

const WINDOW = 1_000_000
const RESERVED = 64_000

/** compaction-basic: resolveTargetPolicy 的等价实现（按 exact provider/model 合并）。 */
function resolveTargetPolicy(config, target) {
  const override = (config.modelPolicies ?? []).find((p) => p.provider === target.provider && p.model === target.model)
  const retention = override?.retainTokens !== undefined
    ? { retainTokens: override.retainTokens }
    : config.retainTokens !== undefined
      ? { retainTokens: config.retainTokens }
      : { retainRatio: override?.retainRatio ?? config.retainRatio }
  return {
    target,
    thresholdRatio: override?.thresholdRatio ?? config.thresholdRatio,
    headroomTokens: override?.headroomTokens ?? config.headroomTokens,
    ...retention,
  }
}

/** compaction-basic: resolveCompactSpec 的等价实现（含它的两条硬校验）。 */
function resolveCompactSpec(policy, contextWindow, reserved) {
  const messageBudget = contextWindow - reserved
  const pressureBudget = messageBudget - policy.headroomTokens
  if (pressureBudget <= 0) throw new Error('no pressure budget')
  const thresholdTokens = Math.floor(Math.min(contextWindow * policy.thresholdRatio, pressureBudget))
  const retainTokens = policy.retainTokens ?? Math.floor(messageBudget * policy.retainRatio)
  if (retainTokens >= thresholdTokens) throw new Error(`retainTokens ${retainTokens} >= threshold ${thresholdTokens}`)
  return { thresholdTokens, retainTokens, contextWindow }
}

/** 原生默认（profile 里 thresholdRatio 0.5 / retainRatio 0.16，headroom 走默认 65536）。 */
function nativeConfig() {
  return { thresholdRatio: 0.5, headroomTokens: 65536, retainRatio: 0.16, maxTokens: 65536, auto: true, modelPolicies: [] }
}

class FakeEngine {
  constructor() {
    this.config = nativeConfig()
    this.seen = []
  }
  compactPressure(_agent, header, signal, requireBelowThreshold) {
    const policy = resolveTargetPolicy(this.config, header.config)
    const spec = resolveCompactSpec(policy, WINDOW, RESERVED)
    this.seen.push({ requireBelowThreshold, ...spec })
    return null
  }
}

function fakeCtx(engine, { llm } = {}) {
  const store = {
    [Symbol('compaction')]: { name: 'compaction', ctx: { fiber: { state: 2 } }, value: engine },
    [Symbol('tools')]: { name: 'tools', ctx: { fiber: { state: 2 } }, value: {} },
  }
  return {
    reflect: { store },
    get(name) {
      if (name === 'llm') return llm
      return undefined
    },
    logger: { info() {}, warn() {} },
  }
}

function fakeStore(budgetTokens) {
  let doc = budgetTokens === undefined ? {} : { compaction: { budgetTokens, at: 0 } }
  return {
    document: () => doc,
    set(next) {
      doc = next === undefined ? {} : { compaction: { budgetTokens: next, at: 0 } }
    },
  }
}

const header = { config: { provider: 'zifei', model: 'deepseek-v4.1-flash', maxTokens: undefined } }
const llm = {
  async resolveModelInfo() {
    return { context: { contextWindow: WINDOW }, defaultMaxTokens: RESERVED }
  },
}

test('预算就是触发线：低于原生的 0.5 也能压，高于原生的 0.5 就晚压', async () => {
  const engine = new FakeEngine()
  const store = fakeStore(300_000)
  const budget = createCompactionBudget({ ctx: fakeCtx(engine, { llm }), store, logger: null })
  const stop = budget.start()
  try {
    await engine.compactPressure({}, header, undefined, false)
    assert.equal(engine.seen.at(-1).thresholdTokens, 300_000)
    // 原生是 500000：预算调到 800000 后必须真的晚压
    store.set(800_000)
    budget.refresh()
    await engine.compactPressure({}, header, undefined, false)
    assert.equal(engine.seen.at(-1).thresholdTokens, 800_000)
    assert.equal(engine.seen.at(-1).requireBelowThreshold, false)
    // 预算低于原生的方向同样成立
    store.set(MIN_TOKENS)
    budget.refresh()
    await engine.compactPressure({}, header, undefined, false)
    assert.equal(engine.seen.at(-1).thresholdTokens, MIN_TOKENS)
    // 保留尾巴必须小于阈值，否则原生直接抛「retainTokens >= threshold」
    for (const seen of engine.seen) assert.ok(seen.retainTokens >= 0 && seen.retainTokens < seen.thresholdTokens)
  } finally {
    stop()
  }
})

test('预算没变就不重写 config 对象；变了必须重写', async () => {
  const engine = new FakeEngine()
  const store = fakeStore(400_000)
  const budget = createCompactionBudget({ ctx: fakeCtx(engine, { llm }), store, logger: null })
  const stop = budget.start()
  try {
    await engine.compactPressure({}, header, undefined, false)
    const afterFirst = engine.config
    assert.equal(afterFirst.modelPolicies.length, 1)
    budget.refresh()
    budget.refresh()
    assert.equal(engine.config, afterFirst, '重复扫描不该换 config 对象')
    store.set(600_000)
    budget.refresh()
    assert.notEqual(engine.config, afterFirst, '预算变了必须重写')
    assert.equal(engine.config.modelPolicies[0].headroomTokens, WINDOW - RESERVED - 600_000)
  } finally {
    stop()
  }
})

test('插件卸载后把原生 config 还回去', async () => {
  const engine = new FakeEngine()
  const native = engine.config
  const budget = createCompactionBudget({ ctx: fakeCtx(engine, { llm }), store: fakeStore(300_000), logger: null })
  const stop = budget.start()
  await engine.compactPressure({}, header, undefined, false)
  assert.notEqual(engine.config, native)
  stop()
  assert.equal(engine.config, native)
})

test('预算超过模型窗口时贴住物理上限，并在 status 里标出来', async () => {
  const engine = new FakeEngine()
  const store = fakeStore(2_000_000)
  const budget = createCompactionBudget({ ctx: fakeCtx(engine, { llm }), store, logger: null })
  const stop = budget.start()
  try {
    await engine.compactPressure({}, header, undefined, false)
    assert.equal(engine.seen.at(-1).thresholdTokens, WINDOW - RESERVED)
    const status = budget.status()
    assert.equal(status.engines, 1)
    assert.equal(status.targets[0].clamped, true)
    assert.equal(status.targets[0].thresholdTokens, WINDOW - RESERVED)
  } finally {
    stop()
  }
})

test('模型窗口解析不到时降级回原生阈值，并如实写进 degraded', async () => {
  const engine = new FakeEngine()
  const store = fakeStore(300_000)
  const broken = { async resolveModelInfo() { throw new Error('NO_ADAPTER') } }
  const budget = createCompactionBudget({ ctx: fakeCtx(engine, { llm: broken }), store, logger: null })
  const stop = budget.start()
  try {
    await engine.compactPressure({}, header, undefined, false)
    // 原生：min(1e6 * 0.5, 936000 - 65536) = 500000
    assert.equal(engine.seen.at(-1).thresholdTokens, 500_000)
    const status = budget.status()
    assert.equal(status.targets.length, 0)
    assert.ok(status.degraded.some((item) => /NO_ADAPTER/.test(item.reason)))
  } finally {
    stop()
  }
})

test('模型切换那条路（requireBelowThreshold）照旧走原生判定', async () => {
  const engine = new FakeEngine()
  const store = fakeStore(800_000)
  const budget = createCompactionBudget({ ctx: fakeCtx(engine, { llm }), store, logger: null })
  const stop = budget.start()
  try {
    await engine.compactPressure({}, header, undefined, true)
    assert.equal(engine.seen.at(-1).requireBelowThreshold, true)
    assert.equal(engine.seen.at(-1).thresholdTokens, 800_000)
  } finally {
    stop()
  }
})

test('没有在线引擎时 refresh 不炸，并且 status 说明「还没挂载」', () => {
  const store = fakeStore(500_000)
  const ctx = { reflect: { store: {} }, get: () => undefined, logger: null }
  const budget = createCompactionBudget({ ctx, store, logger: null })
  const status = budget.refresh()
  assert.equal(status.engines, 0)
  assert.ok(status.degraded.some((item) => /compaction 引擎/.test(item.reason)))
})

test('预算归一：最低 20 万、最高 1000 万、千位取整；文档缺失回落默认 50 万', () => {
  assert.equal(clampBudgetTokens(1), MIN_TOKENS)
  assert.equal(clampBudgetTokens(99_000_000), MAX_TOKENS)
  assert.equal(clampBudgetTokens(512_345), 512_000)
  assert.equal(clampBudgetTokens(Number.NaN), 500_000)
  assert.equal(budgetOf({}), 500_000)
  assert.equal(budgetOf({ compaction: { budgetTokens: 1_000_000 } }), 1_000_000)
})
