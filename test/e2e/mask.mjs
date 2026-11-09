// 端到端验收（宿主侧跑，需要本机 puppeteer-core 与已登录的 chromium profile）
//   node test/e2e/mask.mjs http://127.0.0.1:3080
// 验的是「关掉领域 → agent 视角的 snapshot 里那些 skill 变成 modelInvocable:false」，
// 也就是 dsh-tool-skill 过滤目录时读的同一份输入。
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3080'
const PROFILE = process.env.CDX_CHROME_PROFILE ?? `${process.env.HOME}/.local/state/dsh-dev/chrome-profile`

const browser = await puppeteer.launch({
  executablePath: process.env.CDX_CHROME ?? '/usr/bin/google-chrome-stable',
  headless: 'new',
  userDataDir: PROFILE,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 950 },
})
const page = await browser.newPage()
const snaps = []
page.on('request', (request) => {
  if (request.url().includes('/context-domains/api/snapshot?sessionId=')) snaps.push(request.url())
})
await page.goto(BASE, { waitUntil: 'networkidle2' })
await new Promise((resolve) => setTimeout(resolve, 3000))
const sessionId = snaps.at(-1)?.split('sessionId=')[1]
if (sessionId === undefined) throw new Error('页面上没有出现插件的 snapshot 请求，插件可能没加载')

const get = (path) => page.evaluate(async (url) => (await fetch(url)).json(), `/context-domains/api${path}`)
const post = (path, body) =>
  page.evaluate(
    async (url, payload) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })).json(),
    `/context-domains/api${path}`,
    body,
  )

const before = await get(`/snapshot?sessionId=${sessionId}`)
const skillDomain = before.value.domains.find((domain) => (domain.counts?.skills ?? 0) > 0)
if (skillDomain === undefined) throw new Error('没有可用的技能领域做遮罩验证')

// 关掉该领域
const off = await post('/toggle', { sessionId, domainId: skillDomain.id, enabled: false })
const probe = await get('/probe')
const after = await get(`/snapshot?sessionId=${sessionId}`)

const masked = after.value.cost.maskedSkills
const allMasked = after.value.maskProbe.every((entry) => entry.modelInvocable === false)
console.log(JSON.stringify({
  sessionId,
  domain: skillDomain.name,
  masked,
  maskProbe: after.value.maskProbe,
  effectiveSkills: after.value.effective.skills,
  registerVisible: probe.value?.registerVisible,
}, null, 1))

// 复原
await post('/toggle', { sessionId, domainId: skillDomain.id, enabled: true })

if (masked.length === 0) throw new Error('没有成员被遮罩，验证失败')
if (!allMasked) throw new Error('遮罩没有生效：仍读到 modelInvocable=true')
console.log('E2E OK：领域关闭后 ' + masked.length + ' 个 skill 在会话视角里 modelInvocable=false')
await browser.close()
