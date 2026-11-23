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
const { createMemberWriter } = plugin.__test

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
