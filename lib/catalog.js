// 目录发现：skill 走 ctx.skills.snapshot()，tool 走 ctx.tools.definitions()。
// 两者都是「合并 + 遮蔽 + 限制之后」的那一份，按 scope 读。

/** skill 目录。scope 省略=只看全局层；传 agent/preset scope 才包含该层。 */
export async function readSkills(ctx, { scope, cwd, signal } = {}) {
  const skills = ctx.get?.('skills')
  if (skills === undefined) return { available: false, complete: false, items: [] }
  const snapshot = await skills.snapshot({ scope, cwd, signal })
  const items = snapshot.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    provider: skill.provider,
    origin: skill.source,
    path: skill.path,
    modelInvocable: skill.invocation?.modelInvocable !== false,
    userInvocable: skill.invocation?.userInvocable !== false,
    chars: (skill.description?.length ?? 0) + (skill.whenToUse?.length ?? 0) + skill.name.length,
  }))
  return { available: true, complete: snapshot.complete !== false, items }
}

/** tool 目录。scope 省略=全局视图（不受任何 agent 的 restrict 影响）。 */
export function readTools(ctx, { scope } = {}) {
  const tools = ctx.get?.('tools')
  if (tools === undefined) return { available: false, items: [] }
  const definitions = tools.definitions(scope)
  const items = definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    chars: definition.name.length + (definition.description?.length ?? 0) + JSON.stringify(definition.parameters ?? {}).length,
  }))
  return { available: true, items: items.sort((a, b) => a.name.localeCompare(b.name)) }
}

/** 归属猜测：tool 没有 owner 字段，只能按前缀归组（设置页建议用，不参与解算）。 */
const PREFIX_GROUPS = [
  { prefix: 'mcp__', group: (name) => `MCP · ${name.split('__')[1] ?? 'server'}` },
  { prefix: 'cordis_', group: () => 'Cordis 运行时' },
  { prefix: 'terminal_', group: () => '终端' },
  { prefix: 'job_', group: () => '后台任务' },
  { prefix: 'schedule_', group: () => '自动化任务' },
  { prefix: 'team_', group: () => '智能体团队' },
  { prefix: 'subagent', group: () => '子智能体' },
  { prefix: 'goal', group: () => '目标' },
  { prefix: 'workflow', group: () => '工作流' },
]

export function guessToolGroup(name) {
  const hit = PREFIX_GROUPS.find((entry) => name.startsWith(entry.prefix))
  return hit === undefined ? undefined : hit.group(name)
}

/** skill 归属直接用 provider（真实归属）；provider 缺失时用 origin 兜底。 */
export function groupSkill(item) {
  return item.provider ?? item.origin ?? '未知来源'
}

/** 建域建议：按 skill provider / tool 前缀归堆，给设置页空态一次生成候选。 */
export function suggestDomains({ skills, tools, limit = 6 }) {
  const buckets = new Map()
  const push = (key, member) => {
    if (key === undefined) return
    const bucket = buckets.get(key) ?? { name: key, members: [], skills: 0, tools: 0 }
    bucket.members.push(member)
    if (member.type === 'skill') bucket.skills += 1
    else bucket.tools += 1
    buckets.set(key, bucket)
  }
  for (const skill of skills) push(groupSkill(skill), { type: 'skill', name: skill.name, source: groupSkill(skill) })
  for (const tool of tools) push(guessToolGroup(tool.name), { type: 'tool', name: tool.name })
  return [...buckets.values()]
    .filter((bucket) => bucket.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, limit)
}

/** 预设作用域：全局层看不到 preset 挂的工具与 skill，设置页要按预设逐个读。 */
let scopeCache = { at: 0, value: null }

export async function presetScopes(ctx) {
  const now = Date.now()
  if (scopeCache.value !== null && now - scopeCache.at < 60_000) return scopeCache.value
  const presets = ctx.get?.('agentPresets')
  const scopes = []
  if (presets !== undefined) {
    let list = []
    try {
      list = await presets.list()
    } catch (error) {
      ctx.logger?.warn?.(`[context-domains] preset list failed: ${error?.message ?? error}`)
    }
    for (const preset of list ?? []) {
      const id = typeof preset?.id === 'string' ? preset.id : undefined
      if (id === undefined) continue
      try {
        const lease = await presets.acquireScope(id)
        scopes.push({
          id,
          key: lease.key,
          async dispose() {
            try {
              await lease[Symbol.asyncDispose]?.()
            } catch {
              /* 释放失败不影响本次读取 */
            }
          },
        })
      } catch (error) {
        ctx.logger?.warn?.(`[context-domains] scope ${id} unavailable: ${error?.message ?? error}`)
      }
    }
  }
  scopeCache = { at: now, value: scopes }
  return scopes
}

/**
 * 全局 + 各 preset 作用域的合并目录。同名只留一份，`scopes` 记录它出现在哪些范围
 * （'*' = 全局，其他 = preset id），设置页据此提示「仅某模式可见」。
 */
export async function readCatalogAll(ctx, { cwd } = {}) {
  const globalSkills = await readSkills(ctx, { cwd })
  const globalTools = readTools(ctx, {})
  const skills = new Map(globalSkills.items.map((item) => [item.name, { ...item, scopes: ['*'] }]))
  const tools = new Map(globalTools.items.map((item) => [item.name, { ...item, scopes: ['*'] }]))
  const scopes = await presetScopes(ctx)
  const touched = []
  for (const scope of scopes) {
    touched.push(scope)
    try {
      const scopedSkills = await readSkills(ctx, { scope: scope.key, cwd })
      for (const item of scopedSkills.items) {
        const existing = skills.get(item.name)
        if (existing === undefined) skills.set(item.name, { ...item, scopes: [scope.id] })
        else if (!existing.scopes.includes(scope.id)) existing.scopes.push(scope.id)
      }
      for (const item of readTools(ctx, { scope: scope.key }).items) {
        const existing = tools.get(item.name)
        if (existing === undefined) tools.set(item.name, { ...item, scopes: [scope.id] })
        else if (!existing.scopes.includes(scope.id)) existing.scopes.push(scope.id)
      }
    } catch (error) {
      ctx.logger?.warn?.(`[context-domains] scope ${scope.id} read failed: ${error?.message ?? error}`)
    }
  }
  return {
    skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
    tools: [...tools.values()].sort((a, b) => a.name.localeCompare(b.name)),
    complete: globalSkills.complete === true,
    available: globalSkills.available === true || scopes.length > 0,
    presetCount: scopes.length,
  }
}
