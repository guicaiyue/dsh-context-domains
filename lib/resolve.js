// 解算：领域 + 会话覆盖 → 请求的成员集合 → 与线上目录求交 → 要施加的 deny / mask 名单。
// 全部是纯函数，便于单测（不碰 ctx）。
//
// v0.3：领域不再区分 skill / tool —— 选择是一串领域 id，成员集合按类型内部切开，
// 只在「施加」那一步分流（skill 走目录遮罩、tool 走 restrict）。

/** 会话级选择：有覆盖用覆盖，否则用「默认加载」的领域。 */
export function selectionFor(domains, session) {
  return Array.isArray(session?.domains)
    ? session.domains
    : domains.filter((domain) => domain.defaultOn).map((domain) => domain.id)
}

/** 已加载领域 → 请求的成员（并集、去重、按类型切开、各自排序）。 */
export function requestedMembers(domains, selection) {
  const byId = new Map(domains.map((domain) => [domain.id, domain]))
  const skills = new Set()
  const tools = new Set()
  for (const id of selection) {
    for (const member of byId.get(id)?.members ?? []) {
      if (member.type === 'tool') tools.add(member.name)
      else skills.add(member.name)
    }
  }
  return { skills: [...skills].sort(), tools: [...tools].sort() }
}

/** 某个类型下所有「被领域管着」的成员名 —— 只有这些才会被领域开关影响。 */
export function governedMembers(domains, type) {
  const out = new Set()
  for (const domain of domains) for (const member of domain.members) if (member.type === type) out.add(member.name)
  return out
}

/**
 * tool 的 deny 名单：被领域管着、本会话没请求、不是受保护工具，且确实存在。
 * restrict 遇到未注册名会整个调用失败，所以必须与线上目录求交。
 */
export function planDeniedTools({ domains, requested, liveNames, protectedTools = [], allowEmptyToolSet = false }) {
  const governed = governedMembers(domains, 'tool')
  const requestedSet = new Set(requested)
  const protectedSet = new Set(protectedTools)
  const live = new Set(liveNames)
  let deny = [...governed]
    .filter((name) => !requestedSet.has(name))
    .filter((name) => !protectedSet.has(name))
    .filter((name) => live.has(name))
  if (!allowEmptyToolSet && live.size > 0 && deny.length >= live.size) {
    // 把工具全关掉会锁死会话：留一个受保护/核心工具
    const keep = liveNames.filter((name) => protectedSet.has(name))
    const fallback = keep.length > 0 ? keep : liveNames.slice(0, 1)
    deny = deny.filter((name) => !fallback.includes(name))
  }
  return deny.sort()
}

/**
 * 要从模型目录里摘掉的 skill：被领域管着、本会话没请求、且确实存在。
 * 未归入任何领域的 skill 不在此列 —— 它们继续走原来的逐条开关。
 */
export function planMaskedSkills({ domains, requested, liveNames, excluded = [] }) {
  const governed = governedMembers(domains, 'skill')
  const keep = new Set([...requested, ...excluded])
  const live = new Set(liveNames)
  return [...governed].filter((name) => !keep.has(name) && live.has(name)).sort()
}

/** 设置页「未归入领域」统计。 */
export function unassigned({ domains, liveSkills = [], liveTools = [] }) {
  const skills = governedMembers(domains, 'skill')
  const tools = governedMembers(domains, 'tool')
  return {
    skills: liveSkills.filter((name) => !skills.has(name)).sort(),
    tools: liveTools.filter((name) => !tools.has(name)).sort(),
  }
}

/** 芯片角标：这个领域装了哪些东西（只用于展示，不参与解算）。 */
export function domainCounts(domain, live) {
  let skills = 0
  let tools = 0
  let missing = 0
  for (const member of domain.members) {
    const present = member.type === 'skill' ? live.skills.has(member.name) : live.tools.has(member.name)
    if (member.type === 'skill') skills += 1
    else tools += 1
    if (!present) missing += 1
  }
  return { skills, tools, total: skills + tools, missing }
}
