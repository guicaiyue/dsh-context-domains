// HTTP API：Client 半边没有 typert 代码生成，所以走同源 fetch + 前缀路由
// （dsh-file-activity / horon-web 同款）。全部端点前置信任栅栏。
import { randomUUID } from 'node:crypto'
import { domainCounts, requestedMembers, selectionFor, unassigned } from './resolve.js'
import { estimateTokens } from './config.js'
import { VERSION } from './version.js'
import { readCatalogAll, readSkills, readTools, suggestDomains } from './catalog.js'

const PREFIX = '/context-domains/api'
const MAX_BODY_BYTES = 512 * 1024

function sendJson(res, status, payload) {
  if (res.headersSent) return
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(payload))
}

const ok = (res, value) => sendJson(res, 200, { ok: true, value })
const fail = (res, status, code, message) => sendJson(res, status, { ok: false, error: { code, message } })

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body too large'), { status: 413 })
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error('body is not valid JSON'), { status: 400 })
  }
}

function normalizeMembers(raw) {
  const members = []
  const seen = new Set()
  for (const item of Array.isArray(raw) ? raw : []) {
    const type = item?.type === 'tool' ? 'tool' : item?.type === 'skill' ? 'skill' : undefined
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    if (type === undefined || name === '') continue
    const key = `${type}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    members.push(item.source ? { type, name, source: String(item.source) } : { type, name })
  }
  return members
}

export function registerHttp(ctx, deps) {
  const { store, config, applier, logger } = deps
  const log = (level, message) => {
    const fn = logger?.[level]
    if (typeof fn === 'function') fn.call(logger, `[context-domains] ${message}`)
  }

  /** 一次拿全：领域、选择、目录、生效集合、缺失、成本。 */
  async function snapshot(sessionId) {
    const doc = store.document()
    const selection = selectionFor(doc.domains, doc.sessions[sessionId])
    const requested = requestedMembers(doc.domains, selection)
    const merged = await readCatalogAll(ctx)
    const live = { skills: { items: merged.skills, complete: merged.complete, available: merged.available }, tools: { items: merged.tools } }
    const status = await applier.statusOf(sessionId)
    const liveSkills = new Set(live.skills.items.map((item) => item.name))
    const liveTools = new Set(live.tools.items.map((item) => item.name))
    const costSkills = new Map(live.skills.items.map((item) => [item.name, item.chars]))
    const costTools = new Map(live.tools.items.map((item) => [item.name, item.chars]))
    const loadedSkills = new Set(status.effective.skills)
    const loadedTools = new Set(status.effective.tools)
    const domains = doc.domains.map((domain) => {
      const counts = domainCounts(domain, { skills: liveSkills, tools: liveTools })
      const loadedCount = domain.members.filter(
        (member) => (member.type === 'skill' ? loadedSkills : loadedTools).has(member.name),
      ).length
      return {
        id: domain.id,
        name: domain.name,
        icon: domain.icon ?? null,
        description: domain.description ?? null,
        defaultOn: domain.defaultOn,
        order: domain.order,
        loaded: selection.includes(domain.id),
        presentMembers: domain.members.length - counts.missing,
        loadedMembers: loadedCount,
        counts,
        members: domain.members.map((member) => ({
          type: member.type,
          name: member.name,
          source: member.source ?? null,
          present: member.type === 'skill' ? liveSkills.has(member.name) : liveTools.has(member.name),
        })),
      }
    })
    const managedSkills = doc.domains.flatMap((domain) => domain.members.filter((m) => m.type === 'skill').map((m) => m.name))
    const managedTools = doc.domains.flatMap((domain) => domain.members.filter((m) => m.type === 'tool').map((m) => m.name))
    const managedSkillSet = new Set(managedSkills)
    const managedToolSet = new Set(managedTools)
    const maskedSkills = status.maskedSkills ?? []
    const deniedTools = status.deniedTools ?? []
    const savedChars = maskedSkills.reduce((sum, name) => sum + (costSkills.get(name) ?? 0), 0)
      + deniedTools.reduce((sum, name) => sum + (costTools.get(name) ?? 0), 0)
    return {
      version: 1,
      config: {
        skillGate: status.skillGate ?? config.skillGate,
        tokenEstimate: config.tokenEstimate,
      },
      session: {
        id: sessionId,
        live: status.live === true,
        managed: status.managed !== false,
        domains: selection,
        excluded: doc.sessions[sessionId]?.excluded ?? { skills: [], tools: [] },
        overridden: doc.sessions[sessionId] !== undefined,
      },
      domains,
      requested: status.requested,
      effective: status.effective,
      visible: status.visible ?? { skills: [], tools: [] },
      missing: status.missing,
      maskProbe: status.maskProbe ?? [],
      cost: {
        savedChars,
        savedTokens: estimateTokens(savedChars, config),
        maskedSkills,
        deniedTools,
      },
      unmanaged: {
        skills: live.skills.items.filter((item) => !managedSkillSet.has(item.name)).length,
        tools: live.tools.items.filter((item) => !managedToolSet.has(item.name)).length,
      },
      discoverComplete: live.skills.complete === true,
      degraded: status.degraded ?? [],
    }
  }

  /** 设置页全量目录：成员选择器 + 建域建议。 */
  async function catalog() {
    const merged = await readCatalogAll(ctx)
    const skills = { items: merged.skills, complete: merged.complete, available: merged.available }
    const tools = { items: merged.tools, available: true }
    return {
      skills: skills.items,
      tools: tools.items,
      discoverComplete: skills.complete === true,
      skillsAvailable: skills.available,
      toolsAvailable: tools.available,
      suggestions: suggestDomains({ skills: skills.items, tools: tools.items }),
      unassigned: unassigned({
        domains: store.document().domains,
        liveSkills: skills.items.map((item) => item.name),
        liveTools: tools.items.map((item) => item.name),
      }),
    }
  }

  /** 写会话级选择；第一次写时把当前默认值落成基线，避免“只勾一个域”丢掉其它默认域。 */
  function writeSelection(doc, sessionId, mutate) {
    const existing = doc.sessions[sessionId]
    const base = selectionFor(doc.domains, existing)
    const next = {
      domains: [...base],
      excluded: {
        skills: [...(existing?.excluded?.skills ?? [])],
        tools: [...(existing?.excluded?.tools ?? [])],
      },
      at: Date.now(),
    }
    mutate(next)
    doc.sessions[sessionId] = next
  }

  const handlers = {
    async 'GET /health'(_req, res) {
      ok(res, {
        plugin: 'context-domains',
        version: VERSION,
        stateFile: store.file,
        config,
        domains: store.document().domains.length,
        sessions: Object.keys(store.document().sessions).length,
        agents: applier.entries.size,
      })
    },

    async 'GET /snapshot'(_req, res, url) {
      const sessionId = url.searchParams.get('sessionId') ?? ''
      if (sessionId === '') return fail(res, 400, 'missing-session', 'sessionId is required')
      ok(res, await snapshot(sessionId))
    },

    async 'GET /catalog'(_req, res) {
      ok(res, await catalog())
    },

    /** 设置页用：领域列表 + 每个领域的在线成员数（不需要 sessionId）。 */
    /**
     * 探针：遮罩依赖「agent.ctx 里注册的东西会出现在 snapshot({scope: agent}) 中」。
     * 这里直接实测两条路径（runtime register / provider list），不靠文档推断。
     */
    async 'GET /probe'(_req, res) {
      const entry = [...applier.entries.values()][0]
      if (entry === undefined) return fail(res, 409, 'no-agent', 'no live agent to probe')
      const agentCtx = entry.agent.ctx
      const skills = agentCtx.get('skills')
      if (skills === undefined) return fail(res, 409, 'no-skills', 'no skills service')
      const out = { masked: [...(entry.masked ?? [])], gate: entry.skillGate }

      // A. runtime register 能否被 agent scope 的 snapshot 看见
      const marker = `cdx-probe-${Date.now()}`
      let dispose
      try {
        dispose = skills.register({ name: marker, description: 'probe', content: 'probe' })
        const snapshot = await skills.snapshot({ scope: entry.agent })
        out.registerVisible = snapshot.skills.some((item) => item.name === marker)
        const globalOnly = await skills.snapshot({})
        out.registerVisibleGlobal = globalOnly.skills.some((item) => item.name === marker)
        out.markerSeen = snapshot.skills.filter((item) => entry.masked.has(item.name)).map((item) => ({
          name: item.name,
          modelInvocable: item.invocation?.modelInvocable,
        }))
      } catch (error) {
        out.registerError = error?.message ?? String(error)
      } finally {
        try {
          dispose?.()
        } catch {
          /* ignore */
        }
      }

      // B. 我们的 provider 自己 list 出来什么
      if (entry.provider !== undefined) {
        try {
          const listed = await entry.provider.list({ cwd: undefined })
          out.providerListed = listed.length
          out.providerFirst = listed[0]?.name
          out.providerInvocation = listed[0]?.invocation
        } catch (error) {
          out.providerError = error?.message ?? String(error)
        }
      } else {
        out.providerMissing = true
      }
      ok(res, out)
    },

    async 'GET /domains'(_req, res) {
      const doc = store.document()
      const merged = await readCatalogAll(ctx)
      const live = { skills: { items: merged.skills, complete: merged.complete, available: merged.available }, tools: { items: merged.tools } }
      const liveSkills = new Set(live.skills.items.map((item) => item.name))
      const liveTools = new Set(live.tools.items.map((item) => item.name))
      ok(res, {
        domains: doc.domains.map((domain) => ({
          ...domain,
          counts: domainCounts(domain, { skills: liveSkills, tools: liveTools }),
        })),
        presetCount: merged.presetCount ?? 0,
        skillsAvailable: live.skills.available,
        toolsAvailable: live.tools.available,
        discoverComplete: live.skills.complete === true,
      })
    },

    async 'POST /toggle'(_req, res, _url, body) {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      const domainId = typeof body.domainId === 'string' ? body.domainId : ''
      const enabled = body.enabled === true
      if (sessionId === '' || domainId === '') return fail(res, 400, 'bad-request', 'sessionId and domainId are required')
      const domain = store.document().domains.find((item) => item.id === domainId)
      if (domain === undefined) return fail(res, 404, 'unknown-domain', `domain ${domainId} not found`)
      await store.mutate((doc) => {
        writeSelection(doc, sessionId, (next) => {
          const index = next.domains.indexOf(domainId)
          if (enabled && index < 0) next.domains.push(domainId)
          if (!enabled && index >= 0) next.domains.splice(index, 1)
        })
      }, 'toggle')
      await applier.reapplySession(sessionId)
      ok(res, await snapshot(sessionId))
    },

    async 'POST /exclude'(_req, res, _url, body) {
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
      const type = body.type === 'tool' ? 'tool' : 'skill'
      const name = typeof body.name === 'string' ? body.name : ''
      if (sessionId === '' || name === '') return fail(res, 400, 'bad-request', 'sessionId and name are required')
      await store.mutate((doc) => {
        writeSelection(doc, sessionId, (next) => {
          const list = type === 'tool' ? next.excluded.tools : next.excluded.skills
          const index = list.indexOf(name)
          if (body.off === true && index < 0) list.push(name)
          if (body.off !== true && index >= 0) list.splice(index, 1)
        })
      }, 'exclude')
      await applier.reapplySession(sessionId)
      ok(res, await snapshot(sessionId))
    },

    async 'POST /domains'(_req, res, _url, body) {
      const op = body.op
      if (typeof op !== 'string') return fail(res, 400, 'bad-request', 'op is required')
      let result
      await store.mutate((doc) => {
        if (op === 'create') {
          const members = normalizeMembers(body.members)
          const domain = {
            id: `d_${randomUUID().slice(0, 8)}`,
            name: typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : '新领域',
            icon: typeof body.icon === 'string' ? body.icon : undefined,
            description: typeof body.description === 'string' ? body.description : undefined,
            members,
            // 新建默认启用：建域的意图就是「要用它」，默认值别再让人多勾一次
            defaultOn: typeof body.defaultOn === 'boolean' ? body.defaultOn : true,
            order: doc.domains.length,
          }
          doc.domains.push(domain)
          result = domain
          return
        }
        const id = typeof body.id === 'string' ? body.id : ''
        const domain = doc.domains.find((item) => item.id === id)
        if (domain === undefined) throw Object.assign(new Error(`domain ${id} not found`), { status: 404 })
        if (op === 'update') {
          if (typeof body.name === 'string' && body.name.trim() !== '') domain.name = body.name.trim()
          if (typeof body.icon === 'string') domain.icon = body.icon
          if (typeof body.description === 'string') domain.description = body.description
          if (Array.isArray(body.members)) domain.members = normalizeMembers(body.members)
          if (typeof body.defaultOn === 'boolean') domain.defaultOn = body.defaultOn
          result = domain
          return
        }
        if (op === 'delete') {
          doc.domains = doc.domains.filter((item) => item.id !== id)
          doc.domains.forEach((item, index) => {
            item.order = index
          })
          for (const session of Object.values(doc.sessions)) {
            session.domains = session.domains.filter((domainId) => domainId !== id)
          }
          result = { id }
          return
        }
        if (op === 'reorder') {
          const ids = Array.isArray(body.ids) ? body.ids : []
          const rank = new Map(ids.map((value, index) => [value, index]))
          doc.domains.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
          doc.domains.forEach((item, index) => {
            item.order = index
          })
          result = { ids }
          return
        }
        throw Object.assign(new Error(`unknown op ${op}`), { status: 400 })
      }, `domains:${op}`)
      await applier.reapplyAll()
      ok(res, result ?? {})
    },
  }

  const disposer = ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: async (req, res) => {
          const rejection = ctx.connection.requestRejection(req)
          if (rejection !== undefined) {
            res.statusCode = rejection
            res.end()
            return
          }
          try {
            const url = new URL(req.url ?? '/', 'http://dsh.invalid')
            const route = url.pathname.slice(PREFIX.length) || '/'
            const key = `${req.method ?? 'GET'} ${route}`
            const handler = handlers[key]
            if (handler === undefined) return fail(res, 404, 'not-found', `no route for ${key}`)
            const body = req.method === 'POST' ? await readJson(req) : {}
            await handler(req, res, url, body)
          } catch (error) {
            const status = Number.isInteger(error?.status) ? error.status : 500
            log('warn', `${req.method} ${req.url} failed: ${error?.message ?? error}`)
            fail(res, status, status === 500 ? 'internal' : 'bad-request', error?.message ?? String(error))
          }
        },
      }),
    'context-domains: api routes',
  )

  return { disposer, snapshot, catalog }
}
