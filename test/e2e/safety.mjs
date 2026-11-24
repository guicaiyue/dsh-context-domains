// e2e 的安全收尾：账本 + 恢复 + 会话指纹。
//
// 为什么有它（2026-11-24 arch-desktop 报障）：`mask.mjs` 原来会挑一个真实领域，关掉、
// 验完再打开。中间任何一步崩了（页面超时、选择器改了、进程被杀），「再打开」就到不了，
// 那个领域会一直是关着的。`guardDomains()` 只看领域字段（members/defaultOn/order），
// 看不到会话级 `loaded`，所以连护栏也发现不了。
//
// 现在的规矩：
//   1. 任何写操作之前先写账本（`.cdx-e2e-journal.json`，原子写 + fsync）；
//   2. 只许 toggle 名字以 `__cdx-e2e-` 开头的临时领域；
//   3. 收尾时按账本恢复真实领域的 loaded 与 excluded，重新读快照核实；
//   4. 恢复不了就保留账本、逐个点名、非零退出。
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardDomains } from './guard.mjs'

export const TEST_DOMAIN_PREFIX = '__cdx-e2e-'
export const DEFAULT_JOURNAL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.cdx-e2e-journal.json',
)

export const isTestDomain = (name) => typeof name === 'string' && name.startsWith(TEST_DOMAIN_PREFIX)

export class SafetyError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'SafetyError'
    Object.assign(this, details)
  }
}

const messageOf = (error) => error?.message ?? String(error)

// ---------------------------------------------------------------------------
// 账本

/** 原子写：先写临时文件、fsync，再 rename；半截文件不会顶替上一份好账本。 */
export function writeJournal(journal, file = DEFAULT_JOURNAL) {
  const text = `${JSON.stringify(journal, null, 1)}\n`
  const tmp = `${file}.${process.pid}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeFileSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
  // 目录项也刷一次，断电后 rename 才算数；失败不影响主流程（有的文件系统不支持）。
  try {
    const dir = openSync(path.dirname(file), 'r')
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
  } catch {
    /* ignore */
  }
}

export function readJournal(file = DEFAULT_JOURNAL) {
  if (!existsSync(file)) return null
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new SafetyError(`账本读不出来：${file}（${messageOf(error)}）`, { journalPath: file })
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new SafetyError(
      `账本不是合法 JSON：${file}（${messageOf(error)}）。先别跑 e2e，照文件里的内容手工恢复，或确认没有残留后删掉它。`,
      { journalPath: file },
    )
  }
}

export function clearJournal(file = DEFAULT_JOURNAL) {
  if (!existsSync(file)) return
  unlinkSync(file)
  // 顺手清掉上次写到一半留下的临时文件
  try {
    for (const entry of readdirSync(path.dirname(file))) {
      if (entry.startsWith(`${path.basename(file)}.`) && entry.endsWith('.tmp')) {
        unlinkSync(path.join(path.dirname(file), entry))
      }
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// 会话指纹

/**
 * 只记真实领域的开关状态 + 会话级 excluded。临时领域（`__cdx-e2e-`）不参与，
 * 因为那本来就是测试自己的东西。
 */
export function sessionFingerprint(snapshot, options = {}) {
  const { isOurs = isTestDomain } = options
  const domains = (snapshot?.domains ?? [])
    .filter((domain) => !isOurs(domain.name))
    .map((domain) => ({ id: domain.id, name: domain.name, loaded: domain.loaded === true }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const excluded = snapshot?.session?.excluded ?? {}
  return {
    selection: [...new Set(snapshot?.session?.domains ?? [])].sort(),
    domains,
    excluded: {
      skills: [...new Set(excluded.skills ?? [])].sort(),
      tools: [...new Set(excluded.tools ?? [])].sort(),
    },
  }
}

/** 返回人话问题列表；空数组表示真实领域一个都没变。 */
export function compareSession(baseline, current) {
  const problems = []
  const byId = new Map((current?.domains ?? []).map((row) => [row.id, row]))
  const baselineIds = new Set()
  for (const row of baseline?.domains ?? []) {
    baselineIds.add(row.id)
    const now = byId.get(row.id)
    if (now === undefined) {
      problems.push(`真实领域「${row.name}」已经不在了（跑之前是${row.loaded ? '打开' : '关闭'}）`)
      continue
    }
    if (now.loaded !== row.loaded) {
      problems.push(`真实领域「${row.name}」应该是${row.loaded ? '打开' : '关闭'}的，现在是${now.loaded ? '打开' : '关闭'}`)
    }
  }
  for (const row of current?.domains ?? []) {
    if (!baselineIds.has(row.id)) problems.push(`跑完多出一个真实领域「${row.name}」`)
  }
  for (const type of ['skills', 'tools']) {
    const want = new Set(baseline?.excluded?.[type] ?? [])
    const got = new Set(current?.excluded?.[type] ?? [])
    for (const name of want) if (!got.has(name)) problems.push(`「${name}」应该被单独关掉，现在没有`)
    for (const name of got) if (!want.has(name)) problems.push(`「${name}」被多关了一次`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// 挑一个能验证遮罩的 skill

/**
 * 优先「没归入任何领域」的 skill —— 建临时领域后它才第一次被治理，遮罩变化最干净。
 * 没有的话退到「本来就没被本会话请求、也没被单独排除」的领域成员；这种 skill 通常
 * 已经处于遮罩状态，断言就看「打开临时领域后恢复可调用、再关又遮罩」。
 * 绝不允许为了造出变化去关真实领域。
 */
export function pickMaskSkill(snapshot, catalog, options = {}) {
  const { isOurs = isTestDomain } = options
  if (snapshot?.session?.live !== true) {
    throw new SafetyError('当前会话没有活着的 agent，读不到遮罩结果；先在页面上打开一个会话再跑')
  }
  const gate = snapshot?.config?.skillGate
  if (gate !== 'shadow') {
    throw new SafetyError(`遮罩没开（skillGate=${gate ?? '未知'}），这次验证证明不了任何东西；先确认插件没有降级`)
  }

  const requested = new Set(snapshot.requested?.skills ?? [])
  const excluded = new Set(snapshot.session?.excluded?.skills ?? [])
  const masked = new Set(snapshot.cost?.maskedSkills ?? [])
  const live = new Set((catalog?.skills ?? []).map((skill) => skill.name))
  const usable = (name) => live.has(name) && !requested.has(name) && !excluded.has(name)

  const unassigned = (catalog?.unassigned?.skills ?? []).filter(usable)
  if (unassigned.length > 0) {
    const name = unassigned[0]
    return { name, alreadyMasked: masked.has(name), source: 'unassigned' }
  }

  const members = []
  for (const domain of snapshot.domains ?? []) {
    if (isOurs(domain.name)) continue
    for (const member of domain.members ?? []) {
      if (member.type !== 'skill' || member.present === false || !usable(member.name)) continue
      members.push({ name: member.name, source: member.source ?? null })
    }
  }
  // preset 私有 skill（带 source）不一定出现在当前会话的视图里，优先挑没有 source 的
  const unsourced = members.filter((member) => member.source === null)
  const unique = [...new Set((unsourced.length > 0 ? unsourced : members).map((member) => member.name))]
  if (unique.length > 0) {
    const name = unique[0]
    return { name, alreadyMasked: masked.has(name), source: 'domain' }
  }

  throw new SafetyError(
    '没有可验证遮罩的 skill：在线 skill 都已经被本会话加载或单独排除。'
    + '这时只有关掉一个真实领域才能造出变化——不能在真实领域上做开关验证，这条 e2e 明令禁止。'
    + '请先在一个没有加载全部 skill 的会话里跑。',
  )
}

// ---------------------------------------------------------------------------
// 恢复

function failureText(journal, problems, file) {
  return [
    'e2e 没把领域恢复原样：',
    ...problems.map((line) => `  - ${line}`),
    '',
    `账本：${file}`,
    '再跑一次 `npm run e2e:restore` 会重试；也可以照上面的名字在设置页手工改回去。',
    '在恢复完成之前，别把这当成「测试通过」。',
  ].join('\n')
}

function assertJournal(journal) {
  if (journal === null || typeof journal !== 'object') throw new SafetyError('账本为空，没法恢复')
  if (typeof journal.sessionId !== 'string' || journal.sessionId === '') throw new SafetyError('账本缺少 sessionId，没法恢复')
  if (typeof journal.domainName !== 'string' || journal.domainName === '') throw new SafetyError('账本缺少临时领域名，没法恢复')
  if (journal.baseline === undefined || !Array.isArray(journal.baseline.domains)) {
    throw new SafetyError('账本缺少真实领域基线，没法恢复')
  }
}

/**
 * 按账本收尾：删临时领域 → 恢复真实领域 loaded → 恢复 excluded → 重新读快照核实。
 * 成功返回报告；失败抛 SafetyError（消息里点名），账本保持不动，交给下次或 restore 命令。
 */
export async function recoverJournal(api, journal, options = {}) {
  const { isOurs = isTestDomain, log = () => {}, journalPath = DEFAULT_JOURNAL } = options
  assertJournal(journal)
  if (!isOurs(journal.domainName)) {
    throw new SafetyError(
      `账本里的领域名不是临时领域（${journal.domainName}），拒绝删除。`
      + '只许删名字以 __cdx-e2e- 开头的领域；这个账本可能被改坏了，请人工核对。',
      { journalPath },
    )
  }
  log(`恢复账本：${journal.domainName}`)

  const steps = []
  const restoredReal = []
  const problems = []

  // 1. 删临时领域（按 id 或确切名字，二者都来自账本）
  let domains = (await api.getDomains()).domains
  const temp = domains.filter(
    (domain) => domain.name === journal.domainName || (journal.domainId && domain.id === journal.domainId),
  )
  for (const domain of temp) {
    if (!isOurs(domain.name)) {
      problems.push(`账本指向的真实领域「${domain.name}」拒绝删除`)
      continue
    }
    try {
      await api.deleteDomain(domain.id)
      steps.push(`删除临时领域「${domain.name}」`)
    } catch (error) {
      problems.push(`临时领域「${domain.name}」没删掉：${messageOf(error)}`)
    }
  }
  domains = (await api.getDomains()).domains
  const known = new Set(domains.map((domain) => domain.id))

  // 2. 真实领域的开关回到跑前
  let snapshot = await api.snapshot(journal.sessionId)
  const currentById = new Map((snapshot.domains ?? []).map((domain) => [domain.id, domain]))
  for (const row of journal.baseline.domains) {
    if (!known.has(row.id)) {
      problems.push(`真实领域「${row.name}」已经不在了，没法恢复`)
      continue
    }
    const now = currentById.get(row.id)
    if (now === undefined) {
      problems.push(`快照里读不到真实领域「${row.name}」，没法确认状态`)
      continue
    }
    if (now.loaded === row.loaded) continue
    try {
      await api.toggle(journal.sessionId, row.id, row.loaded)
      steps.push(`${row.loaded ? '重新打开' : '关闭'}「${row.name}」`)
      if (!isOurs(now.name)) {
        restoredReal.push({ id: row.id, name: row.name, from: now.loaded, to: row.loaded })
      }
    } catch (error) {
      problems.push(`真实领域「${row.name}」没恢复：${messageOf(error)}`)
    }
  }

  // 3. 成员级排除项回到跑前
  snapshot = await api.snapshot(journal.sessionId)
  const have = snapshot.session?.excluded ?? {}
  const want = journal.baseline.excluded ?? { skills: [], tools: [] }
  for (const [plural, singular] of [['skills', 'skill'], ['tools', 'tool']]) {
    const wantSet = new Set(want[plural] ?? [])
    const haveSet = new Set(have[plural] ?? [])
    for (const name of wantSet) {
      if (haveSet.has(name)) continue
      try {
        await api.exclude(journal.sessionId, singular, name, true)
        steps.push(`重新单独关掉「${name}」`)
      } catch (error) {
        problems.push(`「${name}」没恢复成单独关掉：${messageOf(error)}`)
      }
    }
    for (const name of haveSet) {
      if (wantSet.has(name)) continue
      try {
        await api.exclude(journal.sessionId, singular, name, false)
        steps.push(`取消多出来的单独关闭「${name}」`)
      } catch (error) {
        problems.push(`「${name}」多出来的单独关闭没取消：${messageOf(error)}`)
      }
    }
  }

  // 4. 独立核实，不信上一步的返回值
  snapshot = await api.snapshot(journal.sessionId)
  domains = (await api.getDomains()).domains
  const current = sessionFingerprint(snapshot, { isOurs })
  problems.push(...compareSession(journal.baseline, current))

  const leftover = domains.filter(
    (domain) => domain.name === journal.domainName || (journal.domainId && domain.id === journal.domainId),
  )
  if (leftover.length > 0) problems.push(`临时领域「${leftover[0].name}」还在`)

  const baselineSelection = new Set(journal.baseline.selection ?? [])
  const currentSelection = new Set(snapshot.session?.domains ?? [])
  for (const id of currentSelection) {
    if (!baselineSelection.has(id)) problems.push(`会话里多出一个领域选择 ${id}`)
  }

  if (problems.length > 0) {
    throw new SafetyError(failureText(journal, problems, journalPath), {
      problems,
      steps,
      restoredReal,
      journalPath,
    })
  }

  return { steps, restoredReal, problems: [] }
}

// ---------------------------------------------------------------------------
// 一轮 e2e 的生命周期

/**
 * 开始一轮：
 *   1. 有旧账本就先恢复（上次 SIGKILL / 断电留下的）；
 *   2. 拍真实领域与会话选择基线；
 *   3. 先写账本，再允许测试动任何东西。
 * 返回的 finish() 幂等；成功才清账本。
 */
export async function startMaskRun(api, options = {}) {
  const {
    note = 'mask',
    sessionId,
    domainName,
    skill,
    journalPath = DEFAULT_JOURNAL,
    isOurs = isTestDomain,
    log = () => {},
  } = options
  if (typeof sessionId !== 'string' || sessionId === '') throw new SafetyError('startMaskRun 缺少 sessionId')
  if (!isOurs(domainName)) throw new SafetyError(`临时领域名必须以 ${TEST_DOMAIN_PREFIX} 开头：${domainName}`)

  let recovery = null
  const stale = readJournal(journalPath)
  if (stale !== null) {
    log(`发现上一次运行留下的账本，先恢复：${stale.domainName}`)
    recovery = await recoverJournal(api, stale, { isOurs, journalPath, log })
    clearJournal(journalPath)
  }

  const before = await api.snapshot(sessionId)
  const guard = await guardDomains(async () => (await api.getDomains()).domains, { note })
  const journal = {
    version: 1,
    tool: note,
    base: options.base ?? null,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    sessionId,
    domainName,
    domainId: null,
    skill,
    baseline: sessionFingerprint(before, { isOurs }),
  }
  writeJournal(journal, journalPath)

  let finishPromise = null
  const finish = () => {
    finishPromise ??= (async () => {
      let report
      try {
        report = await recoverJournal(api, journal, { isOurs, journalPath, log })
      } catch (error) {
        // 会话恢复不了时也核一次领域字段，两个问题一起报，别让后一个盖住前一个
        let guardError
        try {
          await guard.verify()
        } catch (next) {
          guardError = next
        }
        if (guardError === undefined) throw error
        throw new SafetyError(`${messageOf(error)}\n\n另外，领域字段护栏也报了问题：\n${messageOf(guardError)}`, {
          journalPath,
          cause: error,
        })
      }
      await guard.verify()
      clearJournal(journalPath)
      report.recovery = recovery
      if (report.restoredReal.length > 0) {
        const names = report.restoredReal.map((row) => `「${row.name}」`).join('、')
        throw new SafetyError(
          `本轮动过真实领域${names}（已经恢复）。这是脚本 bug：遮罩 e2e 只许开关 __cdx-e2e- 临时领域。`,
          { report, journalPath },
        )
      }
      return report
    })()
    return finishPromise
  }

  return {
    journal,
    before,
    recovery,
    guard,
    save: () => writeJournal(journal, journalPath),
    finish,
  }
}

// ---------------------------------------------------------------------------
// API 适配

export function unwrap(payload, action = '请求') {
  if (payload?.ok !== true) {
    const code = payload?.error?.code
    throw new SafetyError(`${action} 失败：${payload?.error?.message ?? '没有返回 ok'}${code ? `（${code}）` : ''}`)
  }
  return payload.value
}

function cookieFromJar(jar) {
  if (!existsSync(jar)) return undefined
  const pairs = []
  for (const line of readFileSync(jar, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    const normalised = line.startsWith('#HttpOnly_') ? line.slice('#HttpOnly_'.length) : line
    if (normalised.startsWith('#')) continue
    const parts = normalised.split('\t')
    if (parts.length >= 7) pairs.push(`${parts[5]}=${parts[6]}`)
  }
  return pairs.length > 0 ? pairs.join('; ') : undefined
}

export function defaultCookieJar() {
  return process.env.CDX_COOKIE_FILE
    ?? path.join(process.env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state'), 'dsh-dev', 'cookies.txt')
}

/** 宿主侧 HTTP 适配：恢复命令用，不依赖浏览器。 */
export function createHttpApi({ base, cookie, fetchImpl = fetch }) {
  const root = `${String(base).replace(/\/$/, '')}/context-domains/api`
  const headers = cookie === undefined ? {} : { cookie }
  const call = async (method, route, body) => {
    let response
    try {
      response = await fetchImpl(`${root}${route}`, {
        method,
        headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      throw new SafetyError(`${method} ${route} 发不出去：${messageOf(error)}`)
    }
    let payload
    try {
      payload = await response.json()
    } catch {
      throw new SafetyError(`${method} ${route} 返回的不是 JSON（HTTP ${response.status}）`)
    }
    if (response.status === 401 || response.status === 403) {
      throw new SafetyError('没有登录态（HTTP ' + response.status + '）。设置 CDX_COOKIE_FILE 指向 dsh-dev 的 cookie 文件。')
    }
    return payload
  }
  const get = async (route) => unwrap(await call('GET', route), `GET ${route}`)
  const post = async (route, body) => unwrap(await call('POST', route, body), `POST ${route}`)
  return {
    getDomains: () => get('/domains'),
    getCatalog: () => get('/catalog'),
    snapshot: (sessionId) => get(`/snapshot?sessionId=${encodeURIComponent(sessionId)}`),
    createDomain: (body) => post('/domains', { op: 'create', ...body }),
    async deleteDomain(id) {
      try {
        return await post('/domains', { op: 'delete', id })
      } catch (error) {
        // 已经被别人删掉，目的达到了
        if (/unknown-domain|not found/i.test(messageOf(error))) return { id }
        throw error
      }
    },
    toggle: (sessionId, domainId, enabled) => post('/toggle', { sessionId, domainId, enabled }),
    exclude: (sessionId, type, name, off) => post('/exclude', { sessionId, type, name, off }),
  }
}

/** 页内 fetch 适配：mask.mjs 用 page.evaluate 发请求时走这里。 */
export function createJsonApi({ get, post }) {
  return {
    getDomains: async () => unwrap(await get('/domains'), 'GET /domains'),
    getCatalog: async () => unwrap(await get('/catalog'), 'GET /catalog'),
    snapshot: async (sessionId) => unwrap(await get(`/snapshot?sessionId=${encodeURIComponent(sessionId)}`), 'GET /snapshot'),
    createDomain: async (body) => unwrap(await post('/domains', { op: 'create', ...body }), 'POST /domains'),
    async deleteDomain(id) {
      try {
        return unwrap(await post('/domains', { op: 'delete', id }), 'POST /domains')
      } catch (error) {
        if (/unknown-domain|not found/i.test(messageOf(error))) return { id }
        throw error
      }
    },
    toggle: async (sessionId, domainId, enabled) =>
      unwrap(await post('/toggle', { sessionId, domainId, enabled }), 'POST /toggle'),
    exclude: async (sessionId, type, name, off) =>
      unwrap(await post('/exclude', { sessionId, type, name, off }), 'POST /exclude'),
  }
}

export function createJarCookie(jar = defaultCookieJar()) {
  return cookieFromJar(jar)
}
