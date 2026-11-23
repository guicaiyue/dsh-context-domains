// 复现「同一瞬间连点两项，后一个改动丢」：客户端每次从同一份旧快照算出整份 members 再提交
const BASE = 'http://127.0.0.1:3080/context-domains/api'
const cookie = (await import('node:fs')).readFileSync(`${process.env.HOME}/.local/state/dsh-dev/cookies.txt`, 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#') || l.startsWith('#HttpOnly_'))
  .map((l) => l.replace(/^#HttpOnly_/, '').split('\t')).filter((f) => f.length >= 7)
  .map((f) => `${f[5]}=${f[6]}`).join('; ')
const api = async (path, body) => {
  const r = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return r.json()
}
const created = await api('/domains', { op: 'create', name: `probe-丢写-${Date.now()}`, members: [] })
const id = created.value.id
// 两次点击都基于同一份快照（这就是用户连点的真实时序）
const snapshot = (await api('/domains')).value.domains.find((d) => d.id === id).members
const t0 = performance.now()
const [r1, r2] = await Promise.all([
  api('/domains', { op: 'update', id, members: [...snapshot, { type: 'skill', name: 'cdx-dev' }] }),
  api('/domains', { op: 'update', id, members: [...snapshot, { type: 'tool', name: 'bash' }] }),
])
const elapsed = performance.now() - t0
const after = (await api('/domains')).value.domains.find((d) => d.id === id).members.map((m) => `${m.type}:${m.name}`)
console.log(JSON.stringify({ elapsedMs: Math.round(elapsed), after, lost: after.length !== 2 }, null, 1))
await api('/domains', { op: 'delete', id })
