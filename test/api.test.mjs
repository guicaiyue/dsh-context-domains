// 集成测试：打到跑着的 dsh 容器（DSH_DEV_BASE + 登录 cookie）。
// 用法：DSH_DEV_BASE=http://127.0.0.1:3080 node --test test/api.test.mjs
// 没有 cookie 时整组跳过（单元测试不受影响）。
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = process.env.DSH_DEV_BASE ?? 'http://127.0.0.1:3080'
const JAR = process.env.DSH_DEV_COOKIE_JAR
  ?? path.join(process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state'), 'dsh-dev', 'cookies.txt')

function cookieHeader() {
  if (!fs.existsSync(JAR)) return undefined
  const lines = fs.readFileSync(JAR, 'utf8').split('\n')
  const pairs = []
  for (const line of lines) {
    if (line.trim() === '') continue
    // curl 把 HttpOnly cookie 写成 "#HttpOnly_domain..."，前缀要剥掉而不是跳过
    const normalised = line.startsWith('#HttpOnly_') ? line.slice('#HttpOnly_'.length) : line
    if (normalised.startsWith('#')) continue
    const parts = normalised.split('\t')
    if (parts.length >= 7) pairs.push(`${parts[5]}=${parts[6]}`)
  }
  return pairs.length > 0 ? pairs.join('; ') : undefined
}

const cookie = cookieHeader()
const skip = cookie === undefined ? 'no dsh-dev cookie jar; integration tests skipped' : false

async function api(path, body) {
  const response = await fetch(`${BASE}/context-domains/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json()
  return { status: response.status, payload }
}

test('health', { skip }, async () => {
  const { status, payload } = await api('/health')
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.value.plugin, 'context-domains')
  assert.ok(payload.value.config.skillGate)
})

test('catalog 列出 skill 与 tool，并标出作用域', { skip }, async () => {
  const { status, payload } = await api('/catalog')
  assert.equal(status, 200)
  assert.ok(payload.value.tools.length > 0, '至少应发现一个 tool')
  for (const tool of payload.value.tools) assert.ok(Array.isArray(tool.scopes))
  assert.ok(Array.isArray(payload.value.suggestions))
})

test('领域 CRUD 往返', { skip }, async () => {
  const created = await api('/domains', {
    op: 'create',
    name: '__cdx-test',
    members: [{ type: 'tool', name: 'no_such_tool' }],
  })
  assert.equal(created.status, 200)
  const id = created.payload.value.id
  assert.ok(id)

  const updated = await api('/domains', { op: 'update', id, name: '__cdx-test2', defaultOn: true })
  assert.equal(updated.status, 200)
  assert.equal(updated.payload.value.name, '__cdx-test2')

  const listed = await api('/domains')
  const found = listed.payload.value.domains.find((domain) => domain.id === id)
  assert.equal(found.name, '__cdx-test2')
  assert.equal(found.defaultOn, true)

  const removed = await api('/domains', { op: 'delete', id })
  assert.equal(removed.status, 200)
  const after = await api('/domains')
  assert.equal(after.payload.value.domains.some((domain) => domain.id === id), false)
})

test('快照对冷会话也成立（不激活 agent）', { skip }, async () => {
  const { status, payload } = await api('/snapshot?sessionId=session-00000000-0000-0000-0000-000000000000')
  assert.equal(status, 200)
  const value = payload.value
  assert.equal(value.session.live, false)
  assert.ok(Array.isArray(value.domains))
  assert.ok(value.cost && typeof value.cost.savedChars === 'number')
})

test('未登录一律 401/403', { skip: false }, async () => {
  const response = await fetch(`${BASE}/context-domains/api/health`)
  assert.ok([401, 403].includes(response.status), `expected fence, got ${response.status}`)
})
