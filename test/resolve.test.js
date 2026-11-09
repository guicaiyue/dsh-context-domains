import assert from 'node:assert/strict'
import test from 'node:test'
import {
  domainCounts, planDeniedTools, planMaskedSkills, requestedMembers, selectionFor, unassigned,
} from '../lib/resolve.js'
import { normalizeDocument } from '../lib/store.js'

const domains = [
  { id: 'dev', defaultOn: true, members: [{ type: 'skill', name: 'code-review' }, { type: 'tool', name: 'bash' }] },
  { id: 'feishu', defaultOn: false, members: [{ type: 'skill', name: 'a' }, { type: 'skill', name: 'b' }, { type: 'tool', name: 'doc' }] },
]

test('默认选择只取 defaultOn（单一领域列表）', () => {
  assert.deepEqual(selectionFor(domains, undefined), ['dev'])
})

test('会话覆盖优先于默认', () => {
  assert.deepEqual(selectionFor(domains, { domains: [] }), [])
  assert.deepEqual(selectionFor(domains, { domains: ['feishu'] }), ['feishu'])
})

test('一个领域里可以同时有 skill 与 tool', () => {
  const merged = requestedMembers(domains, ['dev', 'feishu'])
  assert.deepEqual(merged.skills, ['a', 'b', 'code-review'])
  assert.deepEqual(merged.tools, ['bash', 'doc'])
})

test('deny 只针对受管工具，且与线上目录求交', () => {
  const deny = planDeniedTools({
    domains: [{ id: 'x', members: [{ type: 'tool', name: 'team_task_list' }, { type: 'tool', name: 'ghost' }] }],
    requested: [],
    liveNames: ['team_task_list', 'bash'],
    protectedTools: ['bash'],
  })
  assert.deepEqual(deny, ['team_task_list'])
})

test('全关时保留受保护工具，避免锁死会话', () => {
  const deny = planDeniedTools({
    domains: [{ id: 'x', members: [{ type: 'tool', name: 'a' }, { type: 'tool', name: 'present' }] }],
    requested: [],
    liveNames: ['a', 'present'],
    protectedTools: ['present'],
  })
  assert.deepEqual(deny, ['a'])
})

test('遮罩只覆盖受管且未请求的 skill', () => {
  const masked = planMaskedSkills({ domains, requested: ['code-review'], liveNames: ['code-review', 'a', 'b', 'outside'] })
  assert.deepEqual(masked, ['a', 'b'])
})

test('未归入领域的项不计入', () => {
  const result = unassigned({ domains, liveSkills: ['code-review', 'a', 'outside'], liveTools: ['bash', 'read'] })
  assert.deepEqual(result.skills, ['outside'])
  assert.deepEqual(result.tools, ['read'])
})

test('计数包含缺失成员', () => {
  const counts = domainCounts(domains[1], { skills: new Set(['a']), tools: new Set() })
  assert.deepEqual(counts, { skills: 2, tools: 1, total: 3, missing: 2 })
})

test('旧文档迁移：skills + tools 合并成 domains，kind 被丢弃', () => {
  const doc = normalizeDocument({
    version: 1,
    domains: [{ id: 'd1', name: '老领域', kind: 'mixed', defaultOn: true, members: [{ type: 'skill', name: 's' }, { type: 'tool', name: 't' }] }],
    sessions: { 'session-1': { skills: ['d1'], tools: ['d2', 'd1'], excluded: { skills: ['s'], tools: [] }, at: 1 } },
  })
  assert.equal('kind' in doc.domains[0], false)
  assert.deepEqual(doc.sessions['session-1'].domains, ['d1', 'd2'])
  assert.deepEqual(doc.sessions['session-1'].excluded.skills, ['s'])
})

test('preset 治理门：只认 managedPresets', async () => {
  const { managesPreset } = await import('../lib/config.js')
  const config = { managedPresets: ['standard', 'ptc', 'minimal', 'cordis'], manageUnknownPresets: false }
  assert.equal(managesPreset('cordis', config), true)
  assert.equal(managesPreset('standard', config), true)
  // 第三方插件的受限 preset 不归本插件管：叠 restrict 会把它的 skill 供给判成违规
  assert.equal(managesPreset('archify-projects', config), false)
  assert.equal(managesPreset('archify-projects-ask', config), false)
  // 认不出 preset 时宁可不治理
  assert.equal(managesPreset(undefined, config), false)
  assert.equal(managesPreset('', config), false)
  // 显式放开时才治理一切
  assert.equal(managesPreset('archify-projects', { ...config, manageUnknownPresets: true }), true)
})
