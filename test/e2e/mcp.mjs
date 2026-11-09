// 端到端：第三方来源（MCP 工具 + 外部 skill 提供方）能否被同一个领域统一维护。
//   node test/e2e/mcp.mjs http://127.0.0.1:3080
// 前置：容器 profile 里挂了 mcp-client（memory / fsdemo）与 skill-office / skill-badge。
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3080'
const PROFILE = process.env.CDX_CHROME_PROFILE ?? `${process.env.HOME}/.local/state/dsh-dev/chrome-profile`
const browser = await puppeteer.launch({
  executablePath: process.env.CDX_CHROME ?? '/usr/bin/google-chrome-stable',
  headless: 'new', userDataDir: PROFILE, args: ['--no-sandbox', '--disable-application-cache'],
  defaultViewport: { width: 1440, height: 950 },
})
const page = await browser.newPage()
await page.setCacheEnabled(false)
const snaps = []
page.on('request', (request) => {
  if (request.url().includes('/context-domains/api/snapshot?sessionId=')) snaps.push(request.url())
})
await page.goto(BASE, { waitUntil: 'networkidle2' })
await new Promise((resolve) => setTimeout(resolve, 3500))
const sessionId = snaps.at(-1)?.split('sessionId=')[1]
if (sessionId === undefined) throw new Error('页面上没有出现插件的 snapshot 请求')

const get = (path) => page.evaluate(async (url) => (await fetch(url)).json(), `/context-domains/api${path}`)
const post = (path, body) => page.evaluate(
  async (url, payload) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })).json(),
  `/context-domains/api${path}`, body)

const catalog = await get('/catalog')
const mcpTools = catalog.value.tools.filter((tool) => tool.name.startsWith('mcp__')).map((tool) => tool.name)
const extSkills = catalog.value.skills.filter((skill) => ['dsh-office', 'dsh-badge'].includes(skill.provider)).map((skill) => skill.name)
console.log(`发现：${mcpTools.length} 个 MCP 工具、${extSkills.length} 个外部 skill`)
if (mcpTools.length === 0) throw new Error('没有发现 MCP 工具，先确认容器 profile 挂了 mcp-client')
if (extSkills.length === 0) throw new Error('没有发现外部 skill 提供方')

// 只挑「当前没被任何已加载领域占着」的工具，否则关闭本领域后它们仍会因别的领域而生效
const baseline = await get(`/snapshot?sessionId=${sessionId}`)
const alreadyOn = new Set([...baseline.value.effective.tools, ...baseline.value.effective.skills])
const pick = mcpTools.filter((name) => !alreadyOn.has(name)).slice(0, 3)
if (pick.length === 0) throw new Error('所有 MCP 工具都已被其它领域占用，无法验证本领域的开关')
const freshSkills = extSkills.filter((name) => !alreadyOn.has(name)).slice(0, 2)
const members = [
  ...freshSkills.map((name) => ({ type: 'skill', name })),
  ...pick.map((name) => ({ type: 'tool', name })),
]
const created = await post('/domains', { op: 'create', name: `e2e-混装-${Date.now()}`, members })
const domain = created.value
console.log(`建领域 ${domain.name}：${members.length} 项（${members.filter((m) => m.type === 'skill').length} skill / ${members.filter((m) => m.type === 'tool').length} tool）`)

const on = (await post('/toggle', { sessionId, domainId: domain.id, enabled: true })).value
const onTools = on.effective.tools.filter((name) => pick.includes(name))
const onSkills = on.effective.skills.filter((name) => members.some((m) => m.name === name))
if (onTools.length !== pick.length) throw new Error(`开启后 MCP 工具未全部生效：${onTools.length}/${pick.length}`)
if (onSkills.length === 0) throw new Error('开启后外部 skill 未生效')

const off = (await post('/toggle', { sessionId, domainId: domain.id, enabled: false })).value
const offTools = off.effective.tools.filter((name) => pick.includes(name))
const masked = off.cost.maskedSkills.filter((name) => members.some((m) => m.name === name))
const denied = off.cost.deniedTools.filter((name) => pick.includes(name))
console.log(JSON.stringify({ onTools, onSkills, offTools, masked, denied, maskProbe: off.maskProbe }, null, 1))
if (offTools.length !== 0) throw new Error('关闭后 MCP 工具仍在生效集合里')
if (denied.length !== pick.length) throw new Error(`关闭后 MCP 工具没进 deny：${denied.length}/${pick.length}`)
if (masked.length === 0) throw new Error('关闭后外部 skill 没被遮罩')
if (!off.maskProbe.every((entry) => entry.modelInvocable === false)) throw new Error('遮罩未生效（modelInvocable 仍为 true)')

await post('/domains', { op: 'delete', id: domain.id })
console.log('E2E OK：一个领域同时管住了 MCP 工具与外部 skill，开启/关闭双向可逆')
await browser.close()
