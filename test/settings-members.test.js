// 设置页成员勾选：同一瞬间连点两项时，旧实现两次都从同一份渲染快照算 members，
// 后发的那次整份覆盖先发的，用户看到「只勾上一个」。
//
// client.js 是宿主里跑的 classic bundle，这里用假 window 接住它的注册，再执行工厂拿
// 出纯写队列（createMemberWriter），不渲染 React。测试盯的是队列行为：连点不漏、写串行。
import assert from 'node:assert/strict'
import test from 'node:test'

let registration
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      registration = value
    },
  },
}

await import('../client.js')

// 工厂只用到 React.createElement；组件要等渲染时才碰 hooks，这里不会执行到。
const plugin = registration.factory((name) => (name === 'react' ? { createElement() {} } : {}))
const { createMemberWriter, metaPayload, windowRange, pickSelected, createLoadGate, debounce } = plugin.__test

const key = (member) => `${member.type}:${member.name}`
const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms))

test('同一瞬间连点两个成员，两次改动都保留，且写不并发', async () => {
  const writes = []
  let active = 0
  let maxActive = 0
  const writer = createMemberWriter({
    write: async (_id, members) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      writes.push(members.map(key))
      await tick()
      active -= 1
    },
    reload: async () => {},
  })

  // 两次点击都基于同一份渲染快照（[]）——这就是用户连点的真实时序。
  await Promise.all([
    writer.toggle('d1', [], 'skill', 'cdx-dev', true),
    writer.toggle('d1', [], 'tool', 'bash', true),
  ])

  assert.deepEqual(writes.at(-1), ['skill:cdx-dev', 'tool:bash'], '后一次写必须带上先一次改动')
  assert.equal(maxActive, 1, '写必须串行，不能两个 update 同时在飞')
})

test('取消勾选只移除目标成员，重复勾选不会加出第二份', async () => {
  const run = async (base, type, name, on) => {
    const writes = []
    const writer = createMemberWriter({
      write: async (_id, members) => { writes.push(members.map(key)) },
      reload: async () => {},
    })
    await writer.toggle('d1', base, type, name, on)
    return writes.at(-1)
  }

  assert.deepEqual(
    await run([{ type: 'skill', name: 'a' }, { type: 'tool', name: 'b' }], 'skill', 'a', false),
    ['tool:b'],
  )
  assert.deepEqual(
    await run([{ type: 'skill', name: 'a' }], 'skill', 'a', true),
    ['skill:a'],
  )
  assert.deepEqual(await run([], 'skill', 'a', true), ['skill:a'])
})

test('同一批连点压成一次写，且一次只重拉一次领域', async () => {
  const writes = []
  const reloads = []
  const writer = createMemberWriter({
    write: async (_id, members) => { writes.push(members.map(key)) },
    reload: async (id) => { reloads.push(id) },
  })

  await Promise.all([
    writer.toggle('d1', [], 'skill', 'a', true),
    writer.toggle('d1', [], 'tool', 'b', true),
    writer.toggle('d1', [], 'skill', 'c', true),
  ])

  assert.deepEqual(writes, [['skill:a', 'tool:b', 'skill:c']], '三个连点必须合并成一次提交')
  assert.deepEqual(reloads, ['d1'], '一次提交后只重拉一次领域，目录不跟着刷')
})

test('勾选先回调界面，再走网络；乐观列表包含前面没写完的改动', async () => {
  const seen = []
  const writes = []
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const writer = createMemberWriter({
    write: async (_id, members) => { writes.push(members.map(key)); await gate },
    reload: async () => {},
    onMembers: (_id, members) => seen.push(members.map(key)),
    coalesceMs: 0,
  })

  const first = writer.toggle('d1', [], 'skill', 'a', true)
  assert.deepEqual(seen.at(-1), ['skill:a'], '点击当帧就要能拿到新的勾选状态')
  assert.equal(writes.length, 0, '合并窗口内还没发请求')

  const second = writer.toggle('d1', [], 'tool', 'b', true)
  assert.deepEqual(seen.at(-1), ['skill:a', 'tool:b'], '第二次点击基于队列里的最新成员，不是旧快照')
  assert.equal(writes.length, 0, '两次点击都还在合并窗口里')
  release()
  await Promise.all([first, second])
  assert.deepEqual(writes, [['skill:a', 'tool:b']])
})

test('写失败时清掉未落盘意图，下一次从页面快照重新起算', async () => {
  const writes = []
  const errors = []
  let failures = 1
  const writer = createMemberWriter({
    write: async (_id, members) => {
      writes.push(members.map(key))
      if (failures > 0) {
        failures -= 1
        throw new Error('network down')
      }
    },
    reload: async () => {},
    onError: (cause) => errors.push(cause.message),
  })

  await writer.toggle('d1', [], 'skill', 'ghost', true)
  assert.deepEqual(errors, ['network down'])

  // 下一次点击拿页面快照（空）起算，失败那次不该变成幽灵成员继续写上去。
  await writer.toggle('d1', [], 'tool', 'real', true)
  assert.deepEqual(writes.at(-1), ['tool:real'])
})

test('旧加载的响应不能覆盖新加载', () => {
  const gate = createLoadGate()
  const first = gate.begin()
  const second = gate.begin()
  assert.equal(gate.isCurrent(first), false, '先发后到的响应必须作废')
  assert.equal(gate.isCurrent(second), true)
})

test('大目录窗口只覆盖视口附近，上下占位补满总高度', () => {
  const range = windowRange({ scrollTop: 26 * 500, viewportHeight: 260, totalLines: 1000 })
  assert.ok(range.start <= 500 && range.start > 480, `起点应落在视口附近：${range.start}`)
  assert.ok(range.end >= 510 && range.end <= 1000, `终点应覆盖视口：${range.end}`)
  assert.equal(range.padTop, range.start * 26)
  assert.equal(range.padBottom, (1000 - range.end) * 26)
  assert.deepEqual(
    windowRange({ scrollTop: 0, viewportHeight: 260, totalLines: 0 }),
    { start: 0, end: 0, padTop: 0, padBottom: 0 },
  )
})

test('reload 后保留选中；领域被删时选原位置的邻居', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  assert.equal(pickSelected([a, b, c], 'b', [a, b, c]), 'b')
  assert.equal(pickSelected([a, c], 'b', [a, b, c]), 'c', '删中间选后一个')
  assert.equal(pickSelected([a, b], 'c', [a, b, c]), 'b', '删最后一个选新的最后一个')
  assert.equal(pickSelected([b, c], 'a', [a, b, c]), 'b', '删第一个选新的第一个')
  assert.equal(pickSelected([], 'a', [a]), null)
  assert.equal(pickSelected([a], null, []), 'a')
})

test('搜索防抖：连打五个字只过滤最后一次，flush 立即提交', async () => {
  const calls = []
  const run = debounce((value) => calls.push(value), 30)
  for (const value of ['a', 'ab', 'abc', 'abcd', 'abcde']) run(value)
  assert.deepEqual(calls, [], '防抖窗口内不应触发')
  await tick(60)
  assert.deepEqual(calls, ['abcde'])

  run('x')
  run('xy')
  run.flush()
  assert.deepEqual(calls, ['abcde', 'xy'])
  run.cancel()
})

test('改名/说明和已落盘值相同就不发；不同才带对应字段', () => {
  const stored = [{ id: 'd1', name: '旧名', description: '旧说明' }]
  assert.equal(metaPayload({ id: 'd1', name: '旧名' }, stored), null, '同名不该发 update')
  assert.equal(metaPayload({ id: 'd1', description: '旧说明' }, stored), null, '同说明不该发 update')
  assert.equal(metaPayload({ id: 'd1' }, stored), null, '没有字段不该发 update')
  assert.deepEqual(metaPayload({ id: 'd1', name: '新名' }, stored), { op: 'update', id: 'd1', name: '新名' })
  assert.deepEqual(
    metaPayload({ id: 'd1', name: '新名', description: '' }, stored),
    { op: 'update', id: 'd1', name: '新名', description: '' },
    '清空说明要写成空字符串',
  )
})

test('结果变少时旧滚动位置不会把窗口算到列表外', () => {
  const tail = windowRange({ scrollTop: 99_999, viewportHeight: 260, totalLines: 1 })
  assert.deepEqual(tail, { start: 0, end: 1, padTop: 0, padBottom: 0 })
})
