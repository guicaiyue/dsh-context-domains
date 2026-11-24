// 端到端验收（宿主侧跑，需要本机 puppeteer-core 与已登录的 chromium profile）
//   node test/e2e/mask.mjs http://127.0.0.1:3080
//
// 验的是「关掉领域 → agent 视角的 snapshot 里那些 skill 变成 modelInvocable:false」，
// 也就是 dsh-tool-skill 过滤目录时读的同一份输入。
//
// 2026-11-24 改法：原来会挑一个真实领域关掉再打开；中途崩了「再打开」就到不了，
// 真实领域会一直关着（arch-desktop 报障）。现在只建一个 __cdx-e2e-mask-* 临时领域，
// 只开关它；动手前先把基线写进 .cdx-e2e-journal.json，收尾按账本恢复并核实。
// 硬杀后下次运行会先恢复旧账本，也可以单独跑 `npm run e2e:restore`。
import puppeteer from 'puppeteer-core'
import {
  DEFAULT_JOURNAL,
  SafetyError,
  createJsonApi,
  pickMaskSkill,
  startMaskRun,
} from './safety.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3080'
const PROFILE = process.env.CDX_CHROME_PROFILE ?? `${process.env.HOME}/.local/state/dsh-dev/chrome-profile`
const JOURNAL = process.env.CDX_E2E_JOURNAL ?? DEFAULT_JOURNAL

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let browser
let run
let exiting = false

async function openPage() {
  browser = await puppeteer.launch({
    executablePath: process.env.CDX_CHROME ?? '/usr/bin/google-chrome-stable',
    headless: 'new',
    userDataDir: PROFILE,
    args: ['--no-sandbox'],
    defaultViewport: { width: 1440, height: 950 },
    // 别让 @puppeteer/browsers 接管信号：它的 SIGINT 处理器会先 kill 浏览器再 process.exit(130)，
    // 我们的异步收尾（删临时领域、核实真实领域）根本来不及跑。收尾由下面的 stop() 负责。
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  })
  const page = await browser.newPage()
  const snaps = []
  page.on('request', (request) => {
    if (request.url().includes('/context-domains/api/snapshot?sessionId=')) snaps.push(request.url())
  })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60_000 })
  await wait(3000)
  const sessionId = snaps.at(-1)?.split('sessionId=')[1]
  if (sessionId === undefined) throw new Error('页面上没有出现插件的 snapshot 请求，插件可能没加载')

  const get = (path) => page.evaluate(async (url) => (await fetch(url)).json(), `/context-domains/api${path}`)
  const post = (path, body) =>
    page.evaluate(
      async (url, payload) => (await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })).json(),
      `/context-domains/api${path}`,
      body,
    )
  return { sessionId, api: createJsonApi({ get, post }) }
}

const probeOf = (snapshot, name) => (snapshot.maskProbe ?? []).find((entry) => entry.name === name)

async function main() {
  const { sessionId, api } = await openPage()

  const before = await api.snapshot(sessionId)
  const catalog = await api.getCatalog()
  const picked = pickMaskSkill(before, catalog)
  if (picked.alreadyMasked) {
    console.log(`注意：「${picked.name}」跑前就已经在遮罩里（它属于一个没开的领域），本轮主要验开关两个方向`)
  }

  const domainName = `__cdx-e2e-mask-${Date.now()}-${process.pid}`
  run = await startMaskRun(api, {
    note: 'mask',
    base: BASE,
    sessionId,
    domainName,
    skill: picked.name,
    journalPath: JOURNAL,
  })
  if (run.recovery !== null) {
    console.log(`上一次运行没正常收尾，已先恢复：${run.recovery.steps.join('；') || '没有需要恢复的东西'}`)
  }

  const created = await api.createDomain({
    name: domainName,
    defaultOn: false,
    description: 'e2e 临时领域，跑完即删',
    members: [{ type: 'skill', name: picked.name }],
  })
  run.journal.domainId = created.id
  run.save()

  // 临时领域默认关闭 → 它的成员应该被遮罩
  const off = await api.snapshot(sessionId)
  const offProbe = probeOf(off, picked.name)
  if (!off.cost.maskedSkills.includes(picked.name)) {
    throw new Error(`临时领域关着，但「${picked.name}」没进遮罩名单：${JSON.stringify(off.cost.maskedSkills)}`)
  }
  if (offProbe === undefined || offProbe.modelInvocable !== false || offProbe.present !== true) {
    throw new Error(`遮罩没有生效：「${picked.name}」的 probe 是 ${JSON.stringify(offProbe)}`)
  }
  if (!off.maskProbe.every((entry) => entry.modelInvocable === false)) {
    throw new Error(`遮罩名单里还有 modelInvocable=true 的条目：${JSON.stringify(off.maskProbe)}`)
  }

  // 打开临时领域 → 同一个 skill 应恢复可调用
  const on = await api.toggle(sessionId, created.id, true)
  if (!on.session.domains.includes(created.id)) throw new Error('打开临时领域后，会话选择里没有它')
  if (!on.effective.skills.includes(picked.name)) {
    throw new Error(`打开临时领域后「${picked.name}」没有恢复可调用：effective=${JSON.stringify(on.effective.skills)}`)
  }
  if (on.cost.maskedSkills.includes(picked.name)) throw new Error(`打开临时领域后「${picked.name}」还在遮罩名单里`)
  if (probeOf(on, picked.name) !== undefined) throw new Error(`打开临时领域后「${picked.name}」仍留着遮罩探针`)

  // 再关掉 → 重新遮罩
  const offAgain = await api.toggle(sessionId, created.id, false)
  if (offAgain.session.domains.includes(created.id)) throw new Error('关掉临时领域后，会话选择里还留着它')
  const againProbe = probeOf(offAgain, picked.name)
  if (!offAgain.cost.maskedSkills.includes(picked.name)) throw new Error(`再关掉后「${picked.name}」没重新进遮罩名单`)
  if (againProbe === undefined || againProbe.modelInvocable !== false) {
    throw new Error(`再关掉后「${picked.name}」的 probe 不对：${JSON.stringify(againProbe)}`)
  }

  console.log(JSON.stringify({
    sessionId,
    domain: domainName,
    domainId: created.id,
    skill: picked.name,
    alreadyMasked: picked.alreadyMasked,
    source: picked.source,
    masked: offAgain.cost.maskedSkills,
    maskProbe: offAgain.maskProbe,
    effectiveSkills: offAgain.effective.skills,
  }, null, 1))

  return {
    sessionId,
    api,
    skill: picked.name,
    alreadyMasked: picked.alreadyMasked,
  }
}

/** 超时就别让 Ctrl-C 永远挂着；账本还在，下次还能接着恢复。 */
async function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new SafetyError(`恢复超时（${ms}ms）`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function stop(reason, code) {
  if (exiting) return
  exiting = true
  console.error(`\n收到 ${reason}，先恢复领域状态…`)
  let failure
  try {
    if (run !== undefined) {
      // 正在飞的 POST /toggle 可能还没落盘；先让它落地，别和恢复在服务端交错
      await wait(200)
      await withTimeout(run.finish(), 15_000)
    }
  } catch (error) {
    failure = error
  }
  await browser?.close().catch(() => {})
  if (failure !== undefined) {
    console.error(failure.message ?? failure)
    console.error(`没收拾干净，账本还在：${JOURNAL}\n下一步：npm run e2e:restore`)
    process.exit(1)
  }
  process.exit(code)
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => void stop(signal, code))
}
process.on('uncaughtException', (error) => {
  console.error(error)
  void stop('未捕获错误', 1)
})
process.on('unhandledRejection', (error) => {
  console.error(error)
  void stop('未处理的 Promise 拒绝', 1)
})

let summary
let failure
try {
  summary = await main()
} catch (error) {
  failure = error
}

let cleanupFailure
try {
  if (run !== undefined) await run.finish()
} catch (error) {
  cleanupFailure = error
}

// 收尾后独立再读一次：临时领域删掉后，这个 skill 的遮罩状态应回到跑前
if (failure === undefined && cleanupFailure === undefined && summary !== undefined) {
  try {
    const finalSnapshot = await summary.api.snapshot(summary.sessionId)
    const stillMasked = finalSnapshot.cost.maskedSkills.includes(summary.skill)
    if (stillMasked !== summary.alreadyMasked) {
      throw new Error(
        `清理后「${summary.skill}」的遮罩状态没回到跑前：跑前 ${summary.alreadyMasked}，现在 ${stillMasked}`,
      )
    }
  } catch (error) {
    failure = error
  }
}

await browser?.close().catch(() => {})

if (cleanupFailure !== undefined) {
  console.error(`\n${cleanupFailure.message ?? cleanupFailure}`)
  console.error(`没收拾干净，账本还在：${JOURNAL}\n下一步：npm run e2e:restore`)
}
if (failure !== undefined) {
  console.error(`\n${failure.stack ?? failure.message ?? failure}`)
}

if (cleanupFailure !== undefined || failure !== undefined) {
  process.exitCode = 1
} else {
  console.log('E2E OK：临时领域关闭时成员 skill 在会话视角 modelInvocable=false，打开后恢复可调用，再关又遮罩；真实领域与会话选择已核实未变')
}
