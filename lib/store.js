// 领域数据持久化：单文档 JSON，串行写入，原子替换，坏文件备份后回落空文档。
//
// 为什么不用 ctx.storageDomain：领域数据是单文档、低频写，引入 zod + storage-domain
// 的 spec 会给一个零依赖的手写 bundle 增加两条解析风险；插件自有 JSON 是架构允许的
// 做法（dsh-file-activity 同样自管数据）。StoreDocument.version 已为将来迁移留位。
import fs from 'node:fs/promises'
import path from 'node:path'

const VERSION = 1
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000 // 会话覆盖保留 30 天

export function emptyDocument() {
  return { version: VERSION, domains: [], sessions: {}, updatedAt: 0 }
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function normalizeMember(raw, type) {
  if (raw === null || typeof raw !== 'object') return undefined
  if (typeof raw.name !== 'string' || raw.name === '') return undefined
  const kind = raw.type === 'skill' || raw.type === 'tool' ? raw.type : type
  if (kind === undefined) return undefined
  const member = { type: kind, name: raw.name }
  if (typeof raw.source === 'string' && raw.source !== '') member.source = raw.source
  return member
}

function normalizeDomain(raw, index) {
  if (raw === null || typeof raw !== 'object') return undefined
  if (typeof raw.id !== 'string' || raw.id === '') return undefined
  const members = []
  const seen = new Set()
  for (const item of Array.isArray(raw.members) ? raw.members : []) {
    const member = normalizeMember(item)
    if (member === undefined) continue
    const key = `${member.type}:${member.name}`
    if (seen.has(key)) continue
    seen.add(key)
    members.push(member)
  }
  return {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : raw.id,
    icon: typeof raw.icon === 'string' ? raw.icon : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    // 领域没有类型：成员自带 type，加载时才按类型分流（v0.3）
    members,
    defaultOn: raw.defaultOn === true,
    order: Number.isFinite(raw.order) ? raw.order : index,
  }
}

function normalizeSession(raw) {
  if (raw === null || typeof raw !== 'object') return undefined
  // v0.2 及更早：skills / tools 两条领域 id 列表；v0.3 起合并成 domains 一条
  const merged = Array.isArray(raw.domains)
    ? asStringArray(raw.domains)
    : [...new Set([...asStringArray(raw.skills), ...asStringArray(raw.tools)])]
  const excluded = raw.excluded !== null && typeof raw.excluded === 'object' ? raw.excluded : {}
  const at = Number.isFinite(raw.at) ? raw.at : 0
  return {
    domains: merged,
    excluded: { skills: asStringArray(excluded.skills), tools: asStringArray(excluded.tools) },
    at,
  }
}

export function normalizeDocument(raw) {
  const doc = emptyDocument()
  if (raw === null || typeof raw !== 'object') return doc
  // 高于当前版本的文档：只读不写（未知字段会被丢掉，所以标记 readOnly，由调用方拒绝写入）
  if (Number.isFinite(raw.version) && raw.version > VERSION) doc.readOnly = true
  const domains = []
  const ids = new Set()
  for (const [index, item] of (Array.isArray(raw.domains) ? raw.domains : []).entries()) {
    const domain = normalizeDomain(item, index)
    if (domain === undefined || ids.has(domain.id)) continue
    ids.add(domain.id)
    domains.push(domain)
  }
  domains.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  doc.domains = domains.map((domain, index) => ({ ...domain, order: index }))
  const sessions = raw.sessions !== null && typeof raw.sessions === 'object' ? raw.sessions : {}
  for (const [sessionId, value] of Object.entries(sessions)) {
    const normalized = normalizeSession(value)
    if (normalized !== undefined) doc.sessions[sessionId] = normalized
  }
  doc.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0
  return doc
}

/** 修剪：删掉 30 天未动、且不再被任何领域引用的会话覆盖。 */
export function pruneDocument(doc, now = Date.now()) {
  const referenced = new Set()
  for (const domain of doc.domains) for (const member of domain.members) {
    referenced.add(`${member.type}:${member.name}`)
  }
  let removed = 0
  for (const [sessionId, value] of Object.entries(doc.sessions)) {
    if (now - value.at > SESSION_TTL_MS) {
      delete doc.sessions[sessionId]
      removed += 1
    }
  }
  return removed
}

export function createStore({ file, logger, now = () => Date.now() }) {
  const listeners = new Set()
  let doc = emptyDocument()
  let chain = Promise.resolve()
  let writes = 0

  const log = (level, message) => {
    const fn = logger?.[level]
    if (typeof fn === 'function') fn.call(logger, `[context-domains] ${message}`)
  }

  const emit = (reason) => {
    for (const listener of listeners) {
      try {
        listener(doc, reason)
      } catch (error) {
        log('warn', `listener failed: ${error?.message ?? error}`)
      }
    }
  }

  async function persist(next) {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.tmp-${process.pid}-${now()}`
    await fs.writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
    await fs.rename(temp, file)
  }

  const store = {
    get file() {
      return file
    },
    /** 只读快照（不要改返回值）。 */
    document() {
      return doc
    },
    async ready() {
      return doc
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** 串行读-改-写；fn 收到可变副本，返回值不需要。失败时内存与磁盘都不变。 */
    mutate(fn, reason = 'update') {
      const run = async () => {
        const next = structuredClone(doc)
        const result = await fn(next)
        if (next.readOnly === true) throw Object.assign(new Error('领域配置由更高版本的插件写入，只读'), { code: 'read-only' })
        next.updatedAt = now()
        writes += 1
        if (writes % 40 === 0) pruneDocument(next, now())
        await persist(next)
        doc = next
        emit(reason)
        return result
      }
      const next = chain.then(run, run)
      chain = next.then(
        () => undefined,
        () => undefined,
      )
      return next
    },
    async load() {
      try {
        const text = await fs.readFile(file, 'utf8')
        doc = normalizeDocument(JSON.parse(text))
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          // 坏文件：留证后从空文档起步，插件不至于整体不可用
          try {
            await fs.rename(file, `${file}.bad-${now()}`)
          } catch {
            /* 备份失败也要继续启动 */
          }
          log('warn', `state file unusable (${error?.code ?? error?.message}), started empty`)
        }
        doc = emptyDocument()
      }
      return doc
    },
  }
  return store
}
