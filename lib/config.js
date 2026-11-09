// 行内配置：只放部署者可调的旋钮；领域数据是用户数据，不入 Config。
export const DEFAULTS = {
  /** skill 屏蔽方式：shadow=遮罩 provider（能省 token）；coarse=只在全关时摘掉 skill 工具；off=不干预 */
  skillGate: 'shadow',
  /** 永不被领域关掉的工具（避免把会话锁死） */
  protectedTools: ['present'],
  /** 允许把工具全关；默认 false 时至少留一个受保护工具 */
  allowEmptyToolSet: false,
  /** 成本估算口径：chars=字符数/4；off=不算 */
  tokenEstimate: 'chars',
  /**
   * 只治理这些 preset 的会话。默认只含随包发布的四个内置 preset。
   *
   * 为什么需要这道门：第三方插件（如 dsh-archify-projects）会为自己的受限 agent 声明
   * 一个 preset —— 它自带 skill 供给与工具白名单。领域插件如果再叠一层
   * restrict/guard，就会把它自带的那份供应按「我的领域没开」判成违规：
   * 实测 archify 的出图会话里 `skill: archify` 被拒，整轮跑空。
   * 领域的职责是治理「我自己的会话」，别人的 preset 有自己的口径。
   */
  managedPresets: ['standard', 'ptc', 'minimal', 'cordis'],
  /** true = 也治理 managedPresets 之外的 preset（不推荐，仅在明确知道后果时开） */
  manageUnknownPresets: false,
}

const SKILL_GATES = new Set(['shadow', 'coarse', 'off'])

/** 宽松归一：非法值回落默认，不让一个坏配置把插件打挂。 */
export function normalizeConfig(raw) {
  const config = { ...DEFAULTS }
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  if (SKILL_GATES.has(input.skillGate)) config.skillGate = input.skillGate
  if (Array.isArray(input.protectedTools)) {
    config.protectedTools = input.protectedTools.filter((name) => typeof name === 'string' && name.length > 0)
  }
  if (typeof input.allowEmptyToolSet === 'boolean') config.allowEmptyToolSet = input.allowEmptyToolSet
  if (Array.isArray(input.managedPresets)) {
    const list = input.managedPresets.filter((name) => typeof name === 'string' && name.length > 0)
    if (list.length > 0) config.managedPresets = list
  }
  if (typeof input.manageUnknownPresets === 'boolean') config.manageUnknownPresets = input.manageUnknownPresets
  if (input.tokenEstimate === 'off') config.tokenEstimate = 'off'
  return config
}

/** 字符 → 估算 token（4 字符/token，粗估即可，UI 上标明「估算」）。 */
export function estimateTokens(chars, config) {
  if (config.tokenEstimate === 'off') return null
  return Math.round(chars / 4)
}

/**
 * 这个 preset 归不归本插件治理。
 *
 * 第三方插件为自己的受限 agent 声明的 preset（例如 archify-projects）自带 skill 供给
 * 与工具白名单；再叠一层 domain 的 restrict/guard 会把它的供应按「我的领域没开」判成违规
 * —— 实测会让对方会话的 `skill` 调用被拒、整轮跑空。认不出 preset 时一律不治理。
 */
export function managesPreset(presetId, config) {
  if (config.manageUnknownPresets === true) return true
  if (typeof presetId !== 'string' || presetId === '') return false
  return config.managedPresets.includes(presetId)
}
