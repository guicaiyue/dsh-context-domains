// 设置页成员连点：同一瞬间点两个成员，后一个改动不能被吞掉。
//
//   node test/e2e/settings-race.mjs http://127.0.0.1:3080
//   CDX_COOKIE_FILE=... CDX_CHROME=... node test/e2e/settings-race.mjs http://127.0.0.1:13080
//
// 验的是用户路径，不是纯函数：打开 设置 → 上下文领域，在一个临时领域里同一任务连点
// 两个复选框。旧实现第一下就把 busy 拉满、复选框 disabled，浏览器把第二下吞掉；
// 或者两次写各拿一份旧 members，后写的覆盖先写的。两条路都表现为「只勾上一个」。
//
// 这一轮把性能预算也写进来：
//   点下去到打勾 ≤ 16ms（乐观更新，不等网络）
//   同一批连点 = 1 个 POST + 1 个 GET /domains，目录不在写后重拉
//   改一次名字 = 1 个 update；关掉再打开设置页，有缓存时 ≤ 50ms 且不再拉目录
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'
import { guardDomains } from './guard.mjs'

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
let uiCreatedId
let guard

const api = async (body) => {
  const response = await fetch(`${BASE}/context-domains/api/domains`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie: `${cookie.name}=${cookie.value}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return response.json()
}
const readDomain = async () => {
  const payload = await api()
  return payload.value.domains.find((domain) => domain.id === id)
}

try {
  const page = await browser.newPage()
  await browser.setCookie({ ...cookie, domain: new URL(BASE).hostname, path: '/' })

  const requests = []
  let delayMemberWrite = false
  let failMemberWrite = false
  page.on('request', (request) => {
    const url = request.url()
    if (!url.includes('/context-domains/api/')) return
    requests.push({ method: request.method(), path: new URL(url).pathname, body: request.postData() ?? '' })
  })
  // 拦一次成员写，让「保存中」真的持续一会儿，才能验证复选框不等保存。
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const body = request.postData() ?? ''
    if (failMemberWrite && request.method() === 'POST' && request.url().includes('/context-domains/api/domains') && body.includes('"members"')) {
      failMemberWrite = false
      void request.respond({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'boom', message: '成员保存失败' } }),
      })
      return
    }
    if (delayMemberWrite && request.method() === 'POST' && request.url().includes('/context-domains/api/domains') && body.includes('"members"')) {
      delayMemberWrite = false
      setTimeout(() => void request.continue(), 300)
      return
    }
    void request.continue()
  })

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60_000 })
  await wait(3000)

  const created = await api({ op: 'create', name, members: [] })
  id = created.value.id

  // 从这一刻起盯着别人的领域：只许自己建的临时领域变化。
  // 2026-11-23 两次事故（点坏、删掉「创造者技能」）都是这里漏了护栏。
  guard = await guardDomains(async () => (await api()).value.domains, { note: 'settings-race' })

  // 账号菜单 → 设置 → 上下文领域。菜单项文案随语言变，两种都认。
  await page.evaluate(() => document.querySelector('[data-slot="settings.launcher"] button')?.click())
  await wait(300)
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')]
      .find((el) => ['设置', 'Settings'].includes(el.innerText.trim()))
    item?.click()
  })
  await wait(800)

  const openMs = await page.evaluate(async () => {
    const tab = [...document.querySelectorAll('button')]
      .find((el) => ['上下文领域', 'Context domains'].includes(el.innerText.trim()))
    const started = performance.now()
    tab?.click()
    await new Promise((resolve) => {
      const check = () => {
        if (document.querySelectorAll('.cdx-domain').length > 0) resolve()
        else requestAnimationFrame(check)
      }
      check()
    })
    return performance.now() - started
  })
  assert.ok(openMs <= 500, `冷打开设置页太慢：${openMs.toFixed(1)}ms`)

  await page.evaluate((domainName) => {
    const row = [...document.querySelectorAll('.cdx-domain')].find((el) => el.innerText.includes(domainName))
    row?.click()
  }, name)
  await wait(300)

  const beforeClick = requests.length
  delayMemberWrite = true
  const picked = await page.evaluate(async () => {
    const boxes = [...document.querySelectorAll('.cdx-member input[type="checkbox"]')].slice(0, 2)
    if (boxes.length < 2) throw new Error('成员列表不足两项，无法验证连点')
    const labels = boxes.map((box) => box.closest('.cdx-member')?.innerText.trim() ?? '')
    const started = performance.now()
    // 同一任务里连点：不给 React 在两次点击之间提交 busy/重渲染的机会。
    boxes[0].click()
    const firstChecked = boxes[0].checked
    const firstMs = performance.now() - started
    boxes[1].click()
    const secondChecked = boxes[1].checked
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return {
      labels,
      firstChecked,
      secondChecked,
      stillChecked: boxes[0].checked && boxes[1].checked,
      disabled: boxes.some((box) => box.disabled),
      ms: firstMs,
    }
  })
  assert.equal(picked.firstChecked, true, '第一下点完当帧没有打勾（乐观更新没生效）')
  assert.equal(picked.secondChecked, true, '第二下点完当帧没有打勾（第二下被吞了）')
  assert.equal(picked.stillChecked, true, '两个动画帧后勾选又被服务端旧快照按回去了')
  assert.equal(picked.disabled, false, '保存成员时复选框被禁用了，下一次点击会被浏览器吞掉')
  assert.ok(picked.ms <= 16, `点击到打勾超过一帧：${picked.ms.toFixed(1)}ms`)

  // 保存中仍可继续操作：再等一拍，复选框必须没被锁住。
  await wait(120)
  const duringSave = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.cdx-member input[type="checkbox"]')]
    return { disabled: boxes.some((box) => box.disabled), hint: document.querySelector('.cdx-main-foot .cdx-hint')?.innerText.trim() ?? '' }
  })
  assert.equal(duringSave.disabled, false, '成员保存在飞的时候复选框被禁用了')

  let after
  for (let attempt = 0; attempt < 40; attempt += 1) {
    after = await readDomain()
    if ((after?.members.length ?? 0) >= 2) break
    await wait(100)
  }
  assert.equal(after?.members.length, 2, '连点两项后只落了一项')
  assert.deepEqual(
    after.members.map((member) => member.name).sort(),
    [...picked.labels].sort(),
    '落盘的成员和点选的两项不一致',
  )

  // 写完成 ≠ 写队列收尾：等页脚从「保存中…」回到常态，再数这一批的请求。
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const saving = await page.evaluate(() => (document.querySelector('.cdx-main-foot .cdx-hint')?.innerText ?? '').includes('保存中'))
    if (!saving) break
    await wait(100)
  }

  const burst = requests.slice(beforeClick)
  const posts = burst.filter((request) => request.method === 'POST' && request.path.endsWith('/domains'))
  const domainGets = burst.filter((request) => request.method === 'GET' && request.path.endsWith('/domains'))
  const catalogGets = burst.filter((request) => request.method === 'GET' && request.path.endsWith('/catalog'))
  assert.equal(posts.length, 1, `同一批连点发了 ${posts.length} 个写请求，应该合并成 1 个`)
  assert.equal(domainGets.length, 1, `一次成员写后重拉了 ${domainGets.length} 次领域，应该只 1 次`)
  assert.equal(catalogGets.length, 0, '成员写完不该重拉目录')

  const stillSelected = await page.evaluate(() => document.querySelector('.cdx-domain[aria-selected="true"]')?.innerText ?? '')
  assert.ok(stillSelected.includes(name), `成员写触发 reload 后选中跳走了：${stillSelected}`)

  // 改名字：连打三次只在暂停后写一次，落最后一个值。
  const renameBefore = requests.length
  const typed = await page.evaluate(async () => {
    const input = document.querySelector('.cdx-field input.cdx-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    for (const value of ['甲', '甲乙', '甲乙丙']) {
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    input.blur()
    return input.value
  })
  assert.equal(typed, '甲乙丙')
  let renamed
  for (let attempt = 0; attempt < 40; attempt += 1) {
    renamed = await readDomain()
    if (renamed?.name === '甲乙丙') break
    await wait(100)
  }
  assert.equal(renamed?.name, '甲乙丙', '名字没有落成最后一个输入值')
  const renamePosts = requests.slice(renameBefore).filter((request) => request.method === 'POST' && request.body.includes('"name"'))
  assert.equal(renamePosts.length, 1, `一次改名的连打发了 ${renamePosts.length} 个写请求，应该只有 1 个`)

  // 写失败要回滚：乐观打上的勾必须退回，并显示错误。
  failMemberWrite = true
  const rollback = await page.evaluate(async () => {
    const box = [...document.querySelectorAll('.cdx-member input[type="checkbox"]')].find((item) => !item.checked)
    if (box === undefined) throw new Error('找不到未勾选的成员，无法验证回滚')
    box.click()
    const optimistic = box.checked
    await new Promise((resolve) => setTimeout(resolve, 800))
    return {
      optimistic,
      after: box.checked,
      error: document.querySelector('.cdx-error')?.innerText ?? '',
    }
  })
  assert.equal(rollback.optimistic, true, '失败场景下没有先乐观打勾')
  assert.equal(rollback.after, false, '写失败后勾选没有回滚')
  assert.match(rollback.error, /成员保存失败/, '写失败后没有显示错误')

  // 有缓存时再打开设置页：立即出内容，且目录不重复拉。
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('[class*="navCell"]')]
      .find((el) => el.innerText.trim() === '通用设置')
    tab?.click()
  })
  await wait(250)
  const reopenBefore = requests.length
  const reopenMs = await page.evaluate(async () => {
    const tab = [...document.querySelectorAll('[class*="navCell"]')]
      .find((el) => el.innerText.trim() === '上下文领域')
    const started = performance.now()
    tab?.click()
    await new Promise((resolve) => {
      const check = () => {
        if (document.querySelectorAll('.cdx-domain').length > 0) resolve()
        else requestAnimationFrame(check)
      }
      check()
    })
    return performance.now() - started
  })
  assert.ok(reopenMs <= 50, `有缓存时再打开设置页还是慢：${reopenMs.toFixed(1)}ms`)
  const reopenGets = requests.slice(reopenBefore).filter((request) => request.method === 'GET' && request.path.endsWith('/catalog'))
  assert.equal(reopenGets.length, 0, '连续打开设置页时目录被重复拉取')

  const selected = await page.evaluate(() => document.querySelector('.cdx-search-meta')?.innerText.trim() ?? '')
  assert.match(selected, /2/, '页面显示已选数量不是 2')

  // 界面新建：建完必须选中新领域，不能跳回列表第一个；删掉自己建的这个。
  const knownIds = new Set((await api()).value.domains.map((domain) => domain.id))
  const createdUi = await page.evaluate(async () => {
    const before = document.querySelectorAll('.cdx-domain').length
    document.querySelector('.cdx-side-actions .cdx-btn')?.click()
    await new Promise((resolve) => setTimeout(resolve, 800))
    return {
      before,
      after: document.querySelectorAll('.cdx-domain').length,
      selected: document.querySelector('.cdx-domain[aria-selected="true"]')?.innerText ?? '',
    }
  })
  assert.equal(createdUi.after, createdUi.before + 1, '界面新建后列表没有多出领域')
  assert.match(createdUi.selected, /新领域/, `界面新建后没有选中新领域：${createdUi.selected}`)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const fresh = (await api()).value.domains.find((domain) => !knownIds.has(domain.id))
    if (fresh !== undefined) {
      uiCreatedId = fresh.id
      break
    }
    await wait(100)
  }
  assert.notEqual(uiCreatedId, undefined, '界面新建的领域没有落盘')
  await page.evaluate(() => document.querySelector('.cdx-btn-danger')?.click())
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const gone = !(await api()).value.domains.some((domain) => domain.id === uiCreatedId)
    if (gone) break
    await wait(100)
  }
  const stillThere = (await api()).value.domains.some((domain) => domain.id === uiCreatedId)
  assert.equal(stillThere, false, '界面删除没有落盘')
  uiCreatedId = undefined

  console.log(JSON.stringify({
    openMs: Number(openMs.toFixed(1)),
    reopenMs: Number(reopenMs.toFixed(1)),
    clickToCheckedMs: Number(picked.ms.toFixed(1)),
    picked: picked.labels,
    burst: { posts: posts.length, domainGets: domainGets.length, catalogGets: catalogGets.length },
    renamePosts: renamePosts.length,
  }, null, 1))
  console.log('E2E OK：连点不丢、写合并、乐观打勾、失败回滚、改名防抖、缓存首屏、界面新建选中')
} finally {
  // 先核别人的领域有没有被碰过，再收拾自己的临时领域。
  if (guard !== undefined) await guard.verify()
  if (id !== undefined) {
    await api({ op: 'delete', id }).catch(() => {})
  }
  if (uiCreatedId !== undefined) {
    await api({ op: 'delete', id: uiCreatedId }).catch(() => {})
  }
  await browser.close()
}
