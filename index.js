// 上下文领域（context-domains）Host 半边。
//
// 领域 = 一批 skill / 一批 tool 的命名集合，用户只勾领域；会话级的加载选择存在
// 插件自有 JSON 里，不在会话事件流里（DSH 不允许插件追加新事件类型）。
//
// 施加手段全部走公开契约：
//   - tool：agent.ctx.tools.restrict({ deny })      （schema/查找/执行三处一致移除）
//   - 兜底：agent.ctx.tools.guard(...)              （顺序无关的单调拒绝，兜住 preset 内工具与旧名调用）
//   - skill：agent scope 注册「遮罩 provider」，把被关领域的 skill 重投成
//            modelInvocable:false —— 注册表「就近层覆盖同名」让 dsh-tool-skill 的
//            目录自然不含它们，而 /name 手动调用仍可用。
import { createRuntime } from './lib/runtime.js'

export const name = 'context-domains'

/** 没有这两个服务就挂不上 HTTP 路由，直接不激活而不是抛错。 */
export const inject = ['webServer', 'connection']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} config - 行内配置（cordis.patch.yml 的 config）
 */
export function apply(ctx, config) {
  return createRuntime(ctx, config)
}
