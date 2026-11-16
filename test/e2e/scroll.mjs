// 顶部条不把会话弹离底部：真机验证（宿主侧跑，需要本机 Chrome 与已登录的 dsh-dev cookie）
//
//   node test/e2e/scroll.mjs http://127.0.0.1:3080
//
// 验的是三件事：
//   1. 条子盖上正文后，会话滚动容器补了 padding-top（第一条消息不被压住）；
//   2. 贴底之后跨过多个测量周期，scrollTop 仍停在 floor，padding 一直是同一个值
//      —— 老实现每秒「摘掉 padding 再补上」，摘的瞬间 scrollHeight 抖掉 34px，
//      浏览器把 scrollTop 夹回去，视图就弹上去了；
//   3. 内容增长（等价于「会话内容更新」）后重新贴底，仍然稳。
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3080'
const COOKIE_FILE = process.env.CDX_COOKIE_FILE ?? `${process.env.HOME}/.local/state/dsh-dev/cookies.txt`
const CHROME = process.env.CDX_CHROME ?? '/usr/bin/google-chrome-stable'

/** 读 Netscape cookie 文件里第一条 dsh-auth（HttpOnly 行以 #HttpOnly_ 开头，仍要认）。 */
function readAuthCookie(file) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((entry) => entry.includes('\tdsh-auth') && (entry.startsWith('#HttpOnly_') || !entry.startsWith('#')))
  if (line === undefined) throw new Error(`cookie 文件里没有 dsh-auth：${file}`)
  const fields = line.split('\t')
  return { name: fields[5], value: fields[6] }
}

/** 读会话滚动容器的几何。 */
const readScroll = () => {
  const el = document.querySelector('[data-conversation-scroll]')
  if (el === null) return null
  return {
    top: Math.round(el.scrollTop),
    height: el.clientHeight,
    floor: Math.max(0, el.scrollHeight - el.clientHeight),
    paddingTop: getComputedStyle(el).paddingTop,
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  // 视口压小，让已有会话内容必然溢出，才能测「贴底」
  defaultViewport: { width: 1280, height: 520 },
})

try {
  const page = await browser.newPage()
  await browser.setCookie({ ...readAuthCookie(COOKIE_FILE), domain: new URL(BASE).hostname, path: '/' })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60_000 })
  await new Promise((resolve) => setTimeout(resolve, 5000))

  // 打开侧栏里第一个已有会话（URL 不带 session，只能点）
  const opened = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[class*="sessionRow"]')]
    if (rows.length === 0) return false
    rows[0].click()
    return true
  })
  if (!opened) throw new Error('侧栏里没有可打开的会话')
  await new Promise((resolve) => setTimeout(resolve, 6000))

  const bar = await page.evaluate(() => {
    const el = document.querySelector('.cdx-bar')
    if (el === null) return null
    const rect = el.getBoundingClientRect()
    return { top: Math.round(rect.top), height: Math.round(rect.height) }
  })
  if (bar === null) throw new Error('顶部条没渲染，插件可能没加载')

  const initial = await page.evaluate(readScroll)
  if (initial === null) throw new Error('找不到会话滚动容器 [data-conversation-scroll]')

  // 1. padding 补上了
  const paddingPx = Number.parseFloat(initial.paddingTop)
  if (!(paddingPx >= bar.height)) {
    throw new Error(`滚动容器没补 padding：${initial.paddingTop}，条高 ${bar.height}px`)
  }

  // 2. 造出溢出（等价于「会话内容增长到需要滚动」），贴底后跨过多个 1s 测量周期
  await page.evaluate(() => {
    const el = document.querySelector('[data-conversation-scroll]')
    const filler = document.createElement('div')
    filler.id = 'cdx-e2e-filler'
    filler.style.height = `${el.clientHeight * 3}px`
    filler.style.flex = '0 0 auto'
    el.appendChild(filler)
    el.scrollTop = el.scrollHeight
  })
  await new Promise((resolve) => setTimeout(resolve, 500))

  const samples = []
  for (let index = 0; index < 6; index += 1) {
    samples.push(await page.evaluate(readScroll))
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  samples.push(await page.evaluate(readScroll))

  if (samples[0].floor <= 0) throw new Error(`造不出溢出（floor=${samples[0].floor}）`)

  const drifted = samples.filter((sample) => sample.floor - sample.top > 1)
  const paddingChanged = samples.filter((sample) => sample.paddingTop !== initial.paddingTop)

  // 3. 再长一段内容、重新贴底，仍然稳（连续的内容更新）
  await page.evaluate(() => {
    const el = document.querySelector('[data-conversation-scroll]')
    const filler = document.getElementById('cdx-e2e-filler')
    filler.style.height = `${el.clientHeight * 4}px`
    el.scrollTop = el.scrollHeight
  })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const afterGrowth = await page.evaluate(readScroll)
  await page.evaluate(() => document.getElementById('cdx-e2e-filler')?.remove())

  const report = {
    base: BASE,
    bar,
    paddingTop: initial.paddingTop,
    samples: samples.map((sample) => ({ top: sample.top, floor: sample.floor, paddingTop: sample.paddingTop })),
    afterGrowth: { top: afterGrowth.top, floor: afterGrowth.floor, paddingTop: afterGrowth.paddingTop },
  }
  console.log(JSON.stringify(report, null, 1))

  if (drifted.length > 0) {
    throw new Error(`贴底后被弹离底部：${drifted.length}/${samples.length} 次采样里 scrollTop 小于 floor（回弹 ${drifted.map((s) => s.floor - s.top).join('/')}px）`)
  }
  if (paddingChanged.length > 0) {
    throw new Error(`padding-top 在测量周期里被改动：${paddingChanged.map((s) => s.paddingTop).join(' → ')}`)
  }
  if (afterGrowth.floor - afterGrowth.top > 1) {
    throw new Error(`内容增长后贴不到底：top=${afterGrowth.top} floor=${afterGrowth.floor}`)
  }

  console.log(`E2E OK：贴底稳定 ${samples.length} 个周期不回弹，padding 恒为 ${initial.paddingTop}，内容增长后仍贴底`)
} finally {
  await browser.close()
}
