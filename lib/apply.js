// 施加层：把「本会话该加载什么」变成三件事 —— 工具 restrict、兜底 guard、skill 遮罩 provider。
//
// 全部注册在 agent.ctx 上：agent 释放时自动撤销，插件卸载时也不会留下悬空注册。
// 每次重算走「撤销 + 重建」，不做增量合并 —— restrict 之间取交，增量只会越限越死。
import { readSkills, readTools } from './catalog.js'
import { managesPreset } from './config.js'
import { planDeniedTools, planMaskedSkills, requestedMembers, selectionFor } from './resolve.js'

/**
 * 遮罩：在 agent scope 里用同名 runtime skill 重投一遍，只把 modelInvocable 改成 false。
 *
 * 为什么不用 provider：provider 的 list 若要看到「会话视角」的 skill，必须带 scope 读注册表，
 * 而那会再进自己（递归），只能靠重入标志，还会污染注册表的收集缓存。runtime 注册这条路更直：
 * 先把会话视角的真实定义全部取出来（此刻自己还没注册，不会读到自己），再逐个注册 stub。
 * 注册表按「global → scope 链（远→近）」合并，最近层赢同名 —— 所以 stub 一定能盖住原条目；
 * 而 dsh-tool-skill 用 isModelInvocable 过滤目录，于是被关领域的 skill 从模型目录里消失，
 * 用户 /name 仍能拿到真实正文（stub 里存的就是真实 content）。
 */
async function materializeMask(agent, maskedSet, skillsService, cwd) {
  const view = await skillsService.list({ scope: agent, cwd })
  const targets = view.filter((summary) => maskedSet.has(summary.name))
  const definitions = []
  for (const summary of targets) {
    const definition = await skillsService.get(summary.name, { scope: agent, cwd })
    if (definition !== undefined) definitions.push(definition)
  }
  return definitions
}

export function createApplier({ ctx, config, store, logger }) {
  const entries = new Map() // sessionId -> entry
  const log = (level, message) => {
    const fn = logger?.[level]
    if (typeof fn === 'function') fn.call(logger, `[context-domains] ${message}`)
  }

  const cwdOf = (agent) => {
    try {
      return ctx.get('workingDirectory')?.get(agent)
    } catch {
      return undefined
    }
  }

  /** 读该会话视角下的线上目录（不受我们自己的遮罩影响：调用前先撤销旧遮罩）。 */
  async function readLive(agent) {
    const cwd = cwdOf(agent)
    const [skills, tools] = [await readSkills(ctx, { scope: agent, cwd }), readTools(ctx, { scope: agent })]
    return { skills, tools, cwd }
  }

  function plan(agent, live) {
    const doc = store.document()
    const selection = selectionFor(doc.domains, doc.sessions[agent.id]) // string[]
    const union = requestedMembers(doc.domains, selection)
    // 成员级覆盖：即使领域开着，用户也可以单独关掉某个成员
    const excluded = doc.sessions[agent.id]?.excluded ?? { skills: [], tools: [] }
    const offSkills = new Set(excluded.skills ?? [])
    const offTools = new Set(excluded.tools ?? [])
    const requested = {
      skills: union.skills.filter((name) => !offSkills.has(name)),
      tools: union.tools.filter((name) => !offTools.has(name)),
    }
    const liveToolNames = live.tools.items.map((item) => item.name)
    const liveSkillNames = live.skills.items.map((item) => item.name)
    const governedSkills = new Set(doc.domains.flatMap((d) => d.members.filter((m) => m.type === 'skill').map((m) => m.name)))
    return {
      selection,
      requested,
      // 一个技能都没请求、但确实存在受管技能域 → 连 skill 工具一起摘掉（目录本来也会是空的）
      dropSkillTool: requested.skills.length === 0 && governedSkills.size > 0,
      deniedTools: planDeniedTools({
        domains: doc.domains,
        requested: requested.tools,
        liveNames: liveToolNames,
        protectedTools: config.protectedTools,
        allowEmptyToolSet: config.allowEmptyToolSet,
      }),
      maskedSkills: planMaskedSkills({
        domains: doc.domains,
        requested: requested.skills,
        liveNames: liveSkillNames,
      }),
    }
  }

  function guardFor(entry, execution) {
    if (execution.name === 'skill') {
      const name = execution.arguments?.name
      if (typeof name === 'string' && entry.masked.has(name)) {
        return `本会话未加载蕴含该 skill 的领域：${name}`
      }
      return undefined
    }
    if (entry.denied.has(execution.name)) return `本会话未加载蕴含该工具「${execution.name}」的领域`
    return undefined
  }

  function revoke(entry) {
    for (const dispose of (entry.disposers ?? []).reverse()) {
      try {
        dispose()
      } catch (error) {
        log('warn', `revoke failed: ${error?.message ?? error}`)
      }
    }
    entry.disposers = []
  }

  /** 注册一次；任何一步失败都记录并以「降级」收场，绝不把会话弄坏。 */
  async function install(entry, planned) {
    const agentCtx = entry.agent.ctx
    const disposers = []
    entry.denied = new Set(planned.deniedTools)
    entry.masked = new Set(config.skillGate === 'shadow' ? planned.maskedSkills : [])

    const toolsService = agentCtx.get('tools')
    if (toolsService !== undefined) {
      if (planned.deniedTools.length > 0) {
        try {
          disposers.push(agentCtx.effect(() => toolsService.restrict({ deny: planned.deniedTools })))
        } catch (error) {
          entry.degraded.push(`restrict: ${error?.message ?? error}`)
          log('warn', `tool restriction unavailable: ${error?.message ?? error}`)
        }
      }
      try {
        disposers.push(agentCtx.effect(() => toolsService.guard((execution) => guardFor(entry, execution))))
      } catch (error) {
        log('warn', `guard unavailable: ${error?.message ?? error}`)
      }
    }

    const skillsService = agentCtx.get('skills')
    if (skillsService !== undefined && entry.masked.size > 0 && config.skillGate === 'shadow') {
      const maskedSet = entry.masked
      try {
        const definitions = await materializeMask(entry.agent, maskedSet, skillsService, entry.cwd)
        for (const definition of definitions) {
          const stub = {
            name: definition.name,
            description: definition.description,
            ...(definition.whenToUse !== undefined ? { whenToUse: definition.whenToUse } : {}),
            content: definition.content,
            ...(definition.resourceBase !== undefined ? { resourceBase: definition.resourceBase } : {}),
            ...(definition.path !== undefined ? { path: definition.path } : {}),
            invocation: { ...definition.invocation, modelInvocable: false },
            provider: definition.provider,
            source: definition.source ?? 'custom',
          }
          disposers.push(agentCtx.effect(() => skillsService.register(stub)))
        }
        entry.skillGate = definitions.length > 0 ? 'shadow' : config.skillGate
        entry.maskedCount = definitions.length
      } catch (error) {
        entry.degraded.push(`skill mask: ${error?.message ?? error}`)
        log('warn', `skill mask unavailable, catalog keeps these entries: ${error?.message ?? error}`)
        entry.skillGate = 'coarse'
      }
    } else if (skillsService !== undefined) {
      entry.skillGate = config.skillGate === 'shadow' ? 'shadow' : config.skillGate
    } else {
      entry.skillGate = 'off'
    }

    // 一个技能都没请求时，连 skill 工具本身一起摘掉（工具与整份目录一起消失，真省）
    if (planned.dropSkillTool && config.skillGate !== 'off' && toolsService !== undefined) {
      try {
        disposers.push(agentCtx.effect(() => toolsService.restrict({ deny: ['skill'] })))
      } catch (error) {
        log('warn', `skill tool could not be removed: ${error?.message ?? error}`)
      }
    }

    entry.disposers = disposers
    entry.plan = planned
  }

  /**
   * 每个会话一条重算队列：领域变更与 HTTP 切换会并发触发重算，
   * 交错执行会把上一次的 disposer 覆盖掉 → 限制永远撤不掉。串行必须有。
   */
  function enqueue(entry, task) {
    const run = () => task()
    entry.queue = entry.queue.then(run, run).catch((error) => {
      entry.error = error?.message ?? String(error)
      log('warn', `queue failed for ${entry.agent.id}: ${entry.error}`)
    })
    return entry.queue
  }

  /**
   * 这个会话归不归本插件治理。
   *
   * 只治理 managedPresets 里的 preset：别的插件为自己的受限 agent 声明的 preset
   * 自带 skill 供给与工具白名单，再叠一层 restrict/guard 会把它的供应判成违规
   * （实测 archify 的出图会话里 `skill: archify` 被拒、整轮跑空）。
   * 认不出 preset 时按「不治理」处理 —— 宁可不管，也不能把别人的会话弄坏。
   */
  function manages(agent) {
    const presets = ctx.get('agentPresets')
    if (presets === undefined) return true
    let id
    try {
      id = presets.presetForSession?.(agent.session) ?? presets.composedPreset?.(agent.ctx)
    } catch (error) {
      log('warn', `preset lookup failed for ${agent.id}: ${error?.message ?? error}`)
      return false
    }
    const managed = managesPreset(id, config)
    if (!managed) log('info', `skipping ${id} session ${agent.id}: preset is not managed by context-domains`)
    return managed
  }

  function reapply(entry) {
    return enqueue(entry, async () => {
      revoke(entry)
      entry.degraded = []
      try {
        if (!manages(entry.agent)) {
          entry.managed = false
          entry.error = undefined
          return entry
        }
        entry.managed = true
        const live = await readLive(entry.agent)
        entry.cwd = live.cwd
        const planned = plan(entry.agent, live)
        await install(entry, planned)
        entry.error = undefined
      } catch (error) {
        entry.error = error?.message ?? String(error)
        log('warn', `reapply failed for ${entry.agent.id}: ${entry.error}`)
      }
      return entry
    })
  }

  const applier = {
    entries,
    async attach(agent) {
      const entry = {
        agent,
        disposers: [],
        degraded: [],
        masked: new Set(),
        denied: new Set(),
        skillGate: 'off',
        queue: Promise.resolve(),
      }
      entries.set(agent.id, entry)
      await reapply(entry)
      return entry
    },
    detach(agentId) {
      const entry = entries.get(agentId)
      if (entry === undefined) return
      entries.delete(agentId)
      void enqueue(entry, async () => revoke(entry))
    },
    entry(agentId) {
      return entries.get(agentId)
    },
    async reapplySession(agentId) {
      const entry = entries.get(agentId)
      if (entry === undefined) return undefined
      return reapply(entry)
    },
    async reapplyAll() {
      await Promise.all([...entries.values()].map((entry) => reapply(entry)))
    },
    /** 会话视角的完整状态（HTTP snapshot 用）。 */
    async statusOf(agentId) {
      const doc = store.document()
      const entry = entries.get(agentId)
      const selection = selectionFor(doc.domains, doc.sessions[agentId]) // string[]
      const excluded = doc.sessions[agentId]?.excluded ?? { skills: [], tools: [] }
      const offSkills = new Set(excluded.skills ?? [])
      const offTools = new Set(excluded.tools ?? [])
      const allRequested = requestedMembers(doc.domains, selection)
      const requested = {
        skills: allRequested.skills.filter((name) => !offSkills.has(name)),
        tools: allRequested.tools.filter((name) => !offTools.has(name)),
      }
      if (entry === undefined) {
        // 冷会话（还没创建 agent）：只能读全局层，用它给出可见集合与缺失项
        const live = await readSkills(ctx, {}).then(async (skills) => ({ skills, tools: readTools(ctx, {}) }))
        return {
          live: false,
          visible: {
            skills: live.skills.items.filter((item) => item.modelInvocable).map((item) => item.name),
            tools: live.tools.items.map((item) => item.name),
          },
          selection,
          requested,
          effective: {
            skills: skillsEffective(requested.skills, live.skills.items),
            tools: requested.tools.filter((name) => live.tools.items.some((item) => item.name === name)),
          },
          missing: {
            skills: requested.skills.filter((name) => !live.skills.items.some((item) => item.name === name)),
            tools: requested.tools.filter((name) => !live.tools.items.some((item) => item.name === name)),
          },
          deniedTools: [],
          maskedSkills: [],
          degraded: [],
          skillGate: 'n/a',
        }
      }
      // 现场读一次（受我们自己遮罩影响 → effective 就是模型真正看到的那一份）
      const view = await readSkills(ctx, { scope: entry.agent, cwd: cwdOf(entry.agent) })
      const liveTools = readTools(ctx, { scope: entry.agent })
      const effectiveSkills = skillsEffective(requested.skills, view.items)
      if (entry.managed === false) {
        return {
          live: true,
          managed: false,
          selection,
          requested: { skills: [], tools: [] },
          effective: { skills: [], tools: [] },
          visible: { skills: [], tools: [] },
          missing: { skills: [], tools: [] },
          deniedTools: [],
          maskedSkills: [],
          degrade: [],
          degraded: [],
          skillGate: 'unmanaged',
        }
      }
      return {
        live: true,
        managed: true,
        selection,
        requested,
        effective: {
          // 口径统一：只报「本会话请求到、且线上真有」的成员；不是全部可见工具
          skills: effectiveSkills,
          tools: requested.tools.filter((name) => liveTools.items.some((item) => item.name === name)),
        },
        visible: {
          skills: view.items.filter((item) => item.modelInvocable).map((item) => item.name),
          tools: liveTools.items.map((item) => item.name),
        },
        missing: {
          skills: requested.skills.filter((name) => !view.items.some((item) => item.name === name)),
          tools: requested.tools.filter((name) => !liveTools.items.some((item) => item.name === name)),
        },
        deniedTools: entry.plan?.deniedTools ?? [],
        maskedSkills: [...(entry.masked ?? [])],
        // 遮罩验证：这些名字在同一次 snapshot 里必须读到 modelInvocable=false
        maskProbe: [...(entry.masked ?? [])].map((name) => ({
          name,
          modelInvocable: view.items.find((item) => item.name === name)?.modelInvocable ?? null,
          present: view.items.some((item) => item.name === name),
        })),
        degraded: entry.degraded ?? [],
        skillGate: entry.skillGate ?? 'n/a',
        discoverComplete: view.complete,
      }
    },
  }

  function skillsEffective(requested, liveSkills) {
    const byName = new Map(liveSkills.map((item) => [item.name, item]))
    return requested.filter((name) => byName.get(name)?.modelInvocable === true)
  }

  return applier
}
