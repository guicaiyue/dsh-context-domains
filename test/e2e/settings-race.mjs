// 设置页成员连点：同一瞬间点两个成员，后一个改动不能被吞掉。
//
//   node test/e2e/settings-race.mjs http://127.0.0.1:3080
//   CDX_COOKIE_FILE=... CDX_CHROME=... node test/e2e/settings-race.mjs http://127.0.0.1:13080
//
// 验的是用户路径，不是纯函数：打开 设置 → 上下文领域，在一个临时领域里同一任务连点
// 两个复选框。旧实现第一下就把 busy 拉满、复选框 disabled，浏览器把第二下吞掉；
// 或者两次写各拿一份旧 members，后写的覆盖先写的。两条路都表现为「只勾上一个」。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3080'
const COOKIE_FILE = process.env.CDX_COOKIE_FILE ?? `${process.env.HOME}/.local/state/dsh-dev/cookies.txt`
const CHROME = process.env.CDX_CHROME ?? '/usr/bin/google-chrome-stable'

function readAuthCookie(file) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.includes('\tdsh-auth') && (entry.startsWith('#HttpOnly_') || !entry.startsWith('#')))
  if (line === undefined) throw new Error(`cookie 文件里没有 dsh-auth：${file}`)
  const fields = line.split('\t')
  return { name: fields[5], value: fields[6] }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1440, height: 900 },
})
const cookie = readAuthCookie(COOKIE_FILE)
const name = `__cdx-e2e-${Date.now()}`
let id

try {
  const page = await browser.newPage()
  await browser.setCookie({ ...cookie, domain: new URL(BASE).hostname, path: '/' })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60_000 })
  await wait(3000)

  const created = await page.evaluate(async (domainName) => {
    const response = await fetch('/context-domains/api/domains', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'create', name: domainName, members: [] }),
    })
    return response.json()
  }, name)
  id = created.value.id

  // 账号菜单 → 设置 → 上下文领域。菜单项文案随语言变，两种都认。
  await page.evaluate(() => document.querySelector('[data-slot="settings.launcher"] button')?.click())
  await wait(300)
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')]
      .find((el) => ['设置', 'Settings'].includes(el.innerText.trim()))
    item?.click()
  })
  await wait(800)
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button')]
      .find((el) => ['上下文领域', 'Context domains'].includes(el.innerText.trim()))
    tab?.click()
  })
  await wait(800)
  await page.evaluate((domainName) => {
    const row = [...document.querySelectorAll('.cdx-domain')].find((el) => el.innerText.includes(domainName))
    row?.click()
  }, name)
  await wait(300)

  const picked = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.cdx-member input[type="checkbox"]')].slice(0, 2)
    if (boxes.length < 2) throw new Error('成员列表不足两项，无法验证连点')
    const labels = boxes.map((box) => box.closest('.cdx-member')?.innerText.trim() ?? '')
    // 同一任务里连点：不给 React 在两次点击之间提交 busy/重渲染的机会。
    boxes[0].click()
    boxes[1].click()
    return labels
  })

  const readDomain = async () => {
    const payload = await page.evaluate(async () => {
      const response = await fetch('/context-domains/api/domains')
      return response.json()
    })
    return payload.value.domains.find((domain) => domain.id === id)
  }

  let after
  for (let attempt = 0; attempt < 20; attempt += 1) {
    after = await readDomain()
    if ((after?.members.length ?? 0) >= 2) break
    await wait(250)
  }

  const selected = await page.evaluate(() => document.querySelector('.cdx-search-meta')?.innerText.trim() ?? '')
  console.log(JSON.stringify({ picked, after: after?.members.map((member) => member.name), selected }, null, 1))

  assert.equal(after?.members.length, 2, '连点两项后只落了一项')
  assert.deepEqual(
    after.members.map((member) => member.name).sort(),
    [...picked].sort(),
    '落盘的成员和点选的两项不一致',
  )
  assert.match(selected, /2/, '页面显示已选数量不是 2')
  console.log('E2E OK：同一瞬间连点两个成员，两项都保存')
} finally {
  if (id !== undefined) {
    await fetch(`${BASE}/context-domains/api/domains`, {
      method: 'POST',
      headers: { cookie: `${cookie.name}=${cookie.value}`, 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'delete', id }),
    }).catch(() => {})
  }
  await browser.close()
}
