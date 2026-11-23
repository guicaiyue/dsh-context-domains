// 设置页大目录：1000+ 成员时只渲染视口附近，滚动到底仍能看到最后一行；
// 搜索防抖后只过滤一次；页签只算一类；首次加载先出骨架，不冒充「还没有领域」。
//
//   node test/e2e/settings-perf.mjs http://127.0.0.1:3080
//
// 目录用请求拦截喂假数据（真实环境只有 41 行，触发不了虚拟化），领域也是假的；
// 不写任何真实数据。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3080'
const COOKIE_FILE = process.env.CDX_COOKIE_FILE ?? `${process.env.HOME}/.local/state/dsh-dev/cookies.txt`
const CHROME = process.env.CDX_CHROME ?? '/usr/bin/google-chrome-stable'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readAuthCookie(file) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.includes('\tdsh-auth') && (entry.startsWith('#HttpOnly_') || !entry.startsWith('#')))
  if (line === undefined) throw new Error(`cookie 文件里没有 dsh-auth：${file}`)
  const fields = line.split('\t')
  return { name: fields[5], value: fields[6] }
}

const skills = Array.from({ length: 1000 }, (_, index) => ({ name: `skill-${String(index).padStart(4, '0')}`, chars: 100 }))
const tools = Array.from({ length: 200 }, (_, index) => ({ name: `tool-${String(index).padStart(4, '0')}`, chars: 100 }))
const fakeCatalog = { skills, tools, suggestions: [], unassigned: { skills: [], tools: [] } }
const fakeDomain = {
  id: 'd_fake', name: '大目录', description: '', defaultOn: false, order: 0, members: [], counts: { skills: 0, tools: 0, total: 0 },
}
const fakeDomains = {
  domains: [fakeDomain], presetCount: 0, skillsAvailable: true, toolsAvailable: true, discoverComplete: true,
}
const json = (request, value) => request.respond({
  status: 200,
  contentType: 'application/json',
  headers: { 'cache-control': 'no-store' },
  body: JSON.stringify({ ok: true, value }),
})

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1440, height: 900 },
})
const cookie = readAuthCookie(COOKIE_FILE)
try {
  const page = await browser.newPage()
  await browser.setCookie({ ...cookie, domain: new URL(BASE).hostname, path: '/' })
  await page.setRequestInterception(true)
  let catalogAttempts = 0
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/context-domains/api/catalog') {
      catalogAttempts += 1
      // 第一次故意打挂目录：领域照常可用，错误只落在成员区，带就地重试。
      if (catalogAttempts === 1) {
        void request.respond({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: { code: 'boom', message: '目录暂时不可用' } }),
        })
        return
      }
      void json(request, fakeCatalog)
      return
    }
    if (url.pathname === '/context-domains/api/domains' && request.method() === 'GET') {
      // 故意慢 250ms：先看到骨架，再看到内容。
      setTimeout(() => void json(request, fakeDomains).catch(() => {}), 250)
      return
    }
    void request.continue()
  })

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60_000 })
  await wait(3000)
  await page.evaluate(() => document.querySelector('[data-slot="settings.launcher"] button')?.click())
  await wait(300)
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')]
      .find((el) => ['设置', 'Settings'].includes(el.innerText.trim()))
    item?.click()
  })
  await wait(800)

  const skeleton = await page.evaluate(async () => {
    const tab = [...document.querySelectorAll('button')]
      .find((el) => ['上下文领域', 'Context domains'].includes(el.innerText.trim()))
    const started = performance.now()
    tab?.click()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const ms = performance.now() - started
    await new Promise((resolve) => setTimeout(resolve, 50))
    return {
      ms,
      mounted: document.querySelector('.cdx-set') !== null,
      skeletonRows: document.querySelectorAll('.cdx-skel').length,
      fakeEmpty: document.body.innerText.includes('还没有领域，可以从建议开始'),
    }
  })
  assert.equal(skeleton.mounted, true, '点开设置页后没有挂载')
  assert.ok(skeleton.ms <= 50, `设置页首次响应超过 50ms：${skeleton.ms.toFixed(1)}ms`)
  assert.ok(skeleton.skeletonRows > 0, '数据没回来时没有骨架')
  assert.equal(skeleton.fakeEmpty, false, '加载中把「还没有领域」当成空态显示了')

  // 目录打挂时：领域列表照常出来，错误只出现在成员区，并且能就地重试。
  await page.waitForFunction(() => document.querySelector('.cdx-error') !== null && document.querySelectorAll('.cdx-domain').length > 0, { timeout: 10_000 })
  const isolated = await page.evaluate(() => {
    const error = document.querySelector('.cdx-error')
    return {
      domains: document.querySelectorAll('.cdx-domain').length,
      members: document.querySelectorAll('.cdx-member').length,
      error: error?.innerText ?? '',
      retry: [...(error?.querySelectorAll('button') ?? [])].map((el) => el.innerText.trim()),
    }
  })
  assert.ok(isolated.domains > 0, '目录失败把领域列表也拖垮了')
  assert.equal(isolated.members, 0, '目录失败却渲染出了成员')
  assert.match(isolated.error, /目录暂时不可用/, '目录错误没有显示在成员区')
  assert.deepEqual(isolated.retry, ['重试'], '错误旁边没有就地重试')
  await page.evaluate(() => document.querySelector('.cdx-error button')?.click())

  await page.waitForFunction(() => document.querySelectorAll('.cdx-member').length > 0, { timeout: 10_000 })
  const initial = await page.evaluate(() => ({
    rendered: document.querySelectorAll('.cdx-member').length,
    empty: document.querySelector('.cdx-empty-text')?.innerText ?? '',
  }))
  assert.ok(initial.rendered < 80, `1200 行目录一次渲染了 ${initial.rendered} 行，虚拟化没生效`)
  assert.equal(initial.empty, '', '有成员时仍显示空态')

  // 滚到底：最后一行必须出现，DOM 行数仍保持在一屏附近。
  const bottom = await page.evaluate(async () => {
    const list = document.querySelector('.cdx-list')
    const started = performance.now()
    list.scrollTop = list.scrollHeight
    list.dispatchEvent(new Event('scroll', { bubbles: true }))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const names = [...document.querySelectorAll('.cdx-member-name')].map((el) => el.textContent)
    return {
      rendered: names.length, last: names.at(-1), scrollTop: list.scrollTop, scrollHeight: list.scrollHeight,
      ms: performance.now() - started,
    }
  })
  assert.equal(bottom.last, 'tool-0199', `滚动到底没渲染最后一行：${bottom.last}`)
  assert.ok(bottom.rendered < 80, `滚到底后 DOM 行数涨到 ${bottom.rendered}，虚拟化没保持`)
  assert.ok(bottom.ms <= 100, `滚到底到新行出现用了 ${bottom.ms.toFixed(1)}ms`)

  // 搜索防抖：刚敲完仍显示旧结果，120ms 后只剩匹配项，输入框不掉字。
  const search = await page.evaluate(async () => {
    const input = document.querySelector('.cdx-search-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    const before = document.querySelectorAll('.cdx-member').length
    setter.call(input, '0999')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const immediate = document.querySelectorAll('.cdx-member').length
    await new Promise((resolve) => setTimeout(resolve, 250))
    return { before, immediate, after: document.querySelectorAll('.cdx-member').length, value: input.value }
  })
  assert.equal(search.value, '0999', '搜索框掉字了')
  assert.equal(search.immediate, search.before, '输入后立刻全量重算，防抖没生效')
  assert.equal(search.after, 1, `搜索过滤结果不对：${search.after}`)

  // 清空搜索，切到「工具」页签：只渲染工具，不混技能。
  const tabbed = await page.evaluate(async () => {
    const input = document.querySelector('.cdx-search-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 250))
    const tab = [...document.querySelectorAll('.cdx-seg-btn')].find((el) => el.innerText.trim() === '工具')
    tab?.click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const rows = [...document.querySelectorAll('.cdx-member')]
    return {
      count: rows.length,
      types: [...new Set(rows.map((el) => el.dataset.type))],
      names: rows.map((el) => el.innerText.trim()).slice(0, 3),
    }
  })
  assert.deepEqual(tabbed.types, ['tool'], `工具页签下混进了别的类型：${tabbed.types}`)
  assert.ok(tabbed.count > 0, '工具页签下没有成员')

  console.log(JSON.stringify({
    skeletonMs: Number(skeleton.ms.toFixed(1)),
    skeletonRows: skeleton.skeletonRows,
    initialRendered: initial.rendered,
    bottomRendered: bottom.rendered,
    lastRow: bottom.last,
    search,
    tabbed: { count: tabbed.count, types: tabbed.types },
  }, null, 1))
  console.log('E2E OK：骨架、虚拟化、滚动到底、搜索防抖、单页签')
} finally {
  await browser.close()
}
