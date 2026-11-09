// 组装：store ↔ 目录 ↔ 施加层 ↔ HTTP。这里是唯一知道所有部件的地方。
import { normalizeConfig } from './config.js'
import { createStore } from './store.js'
import { createApplier } from './apply.js'
import { registerHttp } from './http.js'
import { stateFile, dataDir } from './paths.js'

export async function createRuntime(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const store = createStore({ file: stateFile(), logger: ctx.logger })
  await store.load()

  const applier = createApplier({ ctx, config, store, logger: ctx.logger })
  const http = registerHttp(ctx, { store, config, applier, logger: ctx.logger })

  // 会话生命周期：agent 出现就装，消失就撤（插件自己的 effect 也持有它，双保险）
  ctx.on('agent/created', async ({ agent }) => {
    await applier.attach(agent)
    ctx.effect(() => () => applier.detach(agent.id))
  })
  ctx.on('agent/disposed', ({ agent }) => applier.detach(agent.id))

  // 领域/选择变更 → 所有在线会话重算
  store.onChange(() => {
    void applier.reapplyAll()
  })

  ctx.effect(
    () => () => {
      for (const entry of [...applier.entries.values()]) applier.detach(entry.agent.id)
    },
    'context-domains: detach agents',
  )

  ctx.logger?.info?.(`[context-domains] ready · state=${stateFile()} · dir=${dataDir()}`)

  return { store, applier, http, config }
}
