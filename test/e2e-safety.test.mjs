// 遮罩 e2e 的收拾逻辑：不碰真实领域、崩了能恢复、恢复不了要点名。
//
// 这组测试不连真实 DSH：假 API 复刻 /domains、/snapshot、/toggle、/exclude、delete 的语义，
// 专门盯「跑完以后真实领域的开关有没有回到原样」。
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  SafetyError,
  clearJournal,
  compareSession,
  pickMaskSkill,
  readJournal,
  recoverJournal,
  sessionFingerprint,
  startMaskRun,
  writeJournal,
} from './e2e/safety.mjs'

const tmpJournal = () => path.join(mkdtempSync(path.join(tmpdir(), 'cdx-safety-')), 'journal.json')

/** 假 API：只实现安全模块用到的那几个端点，语义对齐 lib/http.js。 */
function fakeApi(options = {}) {
  const state = {
    domains: structuredClone(options.domains ?? []),
    session: {
      domains: [...(options.selection ?? [])],
      excluded: {
        skills: [...(options.excluded?.skills ?? [])],
        tools: [...(options.excluded?.tools ?? [])],
      },
    },
    calls: [],
    fail: options.fail ?? {},
  }

  const selectedMembers = () => {
    const skills = []
    const tools = []
    for (const id of state.session.domains) {
      const domain = state.domains.find((item) => item.id === id)
      for (const member of domain?.members ?? []) {
        if (member.type === 'skill') skills.push(member.name)
        else tools.push(member.name)
      }
    }
    const offSkills = new Set(state.session.excluded.skills)
    const offTools = new Set(state.session.excluded.tools)
    return {
      skills: [...new Set(skills)].filter((name) => !offSkills.has(name)).sort(),
      tools: [...new Set(tools)].filter((name) => !offTools.has(name)).sort(),
    }
  }

  const snapshot = (sessionId) => {
    const requested = selectedMembers()
    return {
      session: {
        id: sessionId,
        live: true,
        managed: true,
        domains: [...state.session.domains],
        excluded: structuredClone(state.session.excluded),
        overridden: true,
      },
      config: { skillGate: 'shadow' },
      domains: state.domains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        loaded: state.session.domains.includes(domain.id),
        defaultOn: domain.defaultOn === true,
        order: domain.order ?? 0,
        members: domain.members.map((member) => ({ ...member, present: true })),
        counts: { skills: 0, tools: 0, total: domain.members.length, missing: 0 },
      })),
      requested,
      effective: { skills: requested.skills, tools: requested.tools },
      visible: { skills: requested.skills, tools: requested.tools },
      cost: { maskedSkills: [] },
      maskProbe: [],
      degraded: [],
    }
  }

  return {
    state,
    snapshot,
    async getDomains() {
      return { domains: structuredClone(state.domains) }
    },
    async toggle(sessionId, domainId, enabled) {
      state.calls.push(['toggle', domainId, enabled])
      if (state.fail.toggle === domainId) throw new Error(`toggle ${domainId} failed`)
      if (!state.domains.some((domain) => domain.id === domainId)) throw new Error(`unknown-domain ${domainId}`)
      const next = new Set(state.session.domains)
      if (enabled) next.add(domainId)
      else next.delete(domainId)
      state.session.domains = [...next]
      return snapshot(sessionId)
    },
    async deleteDomain(domainId) {
      state.calls.push(['delete', domainId])
      if (state.fail.delete === domainId) throw new Error(`delete ${domainId} failed`)
      state.domains = state.domains.filter((domain) => domain.id !== domainId)
      state.session.domains = state.session.domains.filter((id) => id !== domainId)
      return { id: domainId }
    },
    async exclude(sessionId, type, name, off) {
      state.calls.push(['exclude', type, name, off])
      const list = type === 'skill' ? state.session.excluded.skills : state.session.excluded.tools
      const index = list.indexOf(name)
      if (off && index < 0) list.push(name)
      if (!off && index >= 0) list.splice(index, 1)
      return snapshot(sessionId)
    },
  }
}

const realDomains = () => [
  {
    id: 'd_skill',
    name: '技能',
    defaultOn: true,
    order: 0,
    members: [{ type: 'skill', name: 'agent-experience' }],
  },
  {
    id: 'd_off',
    name: '建模',
    defaultOn: false,
    order: 1,
    members: [{ type: 'skill', name: 'archify' }],
  },
]

function baselineOf(api, sessionId = 's1') {
  return sessionFingerprint(api.snapshot(sessionId))
}

function journalFrom(api, extra = {}) {
  const baseline = baselineOf(api)
  return {
    version: 1,
    tool: 'test',
    base: 'http://127.0.0.1:3080',
    pid: 1,
    startedAt: '2026-11-24T00:00:00.000Z',
    sessionId: 's1',
    domainName: '__cdx-e2e-mask-1',
    domainId: null,
    skill: 'agent-experience',
    baseline,
    ...extra,
  }
}

test('会话指纹只看真实领域，临时领域不进对比', () => {
  const fp = sessionFingerprint({
    session: { domains: ['d_skill', 't_temp'], excluded: { skills: ['x'], tools: [] } },
    domains: [
      { id: 'd_skill', name: '技能', loaded: true },
      { id: 't_temp', name: '__cdx-e2e-mask-1', loaded: true },
    ],
  })
  assert.deepEqual(fp.domains, [{ id: 'd_skill', name: '技能', loaded: true }])
  assert.deepEqual(fp.excluded.skills, ['x'])
})

test('真实领域被留成关闭时，对比能直接点出名字', () => {
  const before = sessionFingerprint({
    session: { domains: ['d_skill'], excluded: { skills: [], tools: [] } },
    domains: [{ id: 'd_skill', name: '技能', loaded: true }],
  })
  const after = sessionFingerprint({
    session: { domains: [], excluded: { skills: [], tools: [] } },
    domains: [{ id: 'd_skill', name: '技能', loaded: false }],
  })
  const problems = compareSession(before, after)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /「技能」/)
  assert.match(problems[0], /关闭/)
})

test('账本：原子写入、读回、清掉', () => {
  const file = tmpJournal()
  writeJournal({ version: 1, hello: 'world' }, file)
  assert.deepEqual(readJournal(file), { version: 1, hello: 'world' })
  clearJournal(file)
  assert.equal(readJournal(file), null)
})

test('恢复：删临时领域、把被关掉的真实领域重新打开、清掉多出来的排除项', async () => {
  const api = fakeApi({ domains: realDomains(), selection: ['d_skill'] })
  const journal = journalFrom(api)

  // 模拟崩在半路：真实领域被关了，临时领域还开着，还多排除了一个 skill
  api.state.domains.push({
    id: 't_temp',
    name: '__cdx-e2e-mask-1',
    defaultOn: false,
    order: 2,
    members: [{ type: 'skill', name: 'agent-experience' }],
  })
  api.state.session.domains = ['t_temp']
  api.state.session.excluded.skills = ['agent-experience']

  const report = await recoverJournal(api, journal)
  assert.deepEqual(report.restoredReal.map((row) => row.name), ['技能'])
  assert.ok(api.state.calls.some((call) => call[0] === 'delete' && call[1] === 't_temp'))
  assert.ok(api.state.calls.some((call) => call[0] === 'toggle' && call[1] === 'd_skill' && call[2] === true))
  assert.ok(api.state.calls.some((call) => call[0] === 'exclude' && call[2] === 'agent-experience' && call[3] === false))
  assert.equal(api.state.domains.some((domain) => domain.id === 't_temp'), false)
  assert.deepEqual(api.state.session.domains, ['d_skill'])
  assert.deepEqual(api.state.session.excluded.skills, [])
})

test('恢复：本来关着的领域不会被顺手打开', async () => {
  const api = fakeApi({ domains: realDomains(), selection: ['d_skill'] })
  const journal = journalFrom(api)

  api.state.domains.push({
    id: 't_temp',
    name: '__cdx-e2e-mask-1',
    defaultOn: false,
    order: 2,
    members: [{ type: 'skill', name: 'agent-experience' }],
  })
  api.state.session.domains = ['t_temp'] // 两个真实领域都关着；只有 d_skill 是跑前开着的

  await recoverJournal(api, journal)
  const toggles = api.state.calls.filter((call) => call[0] === 'toggle')
  assert.deepEqual(toggles, [['toggle', 'd_skill', true]], '只该恢复跑前开着的那个，不能把「建模」也打开')
  assert.equal(api.state.session.domains.includes('d_off'), false)
})

test('恢复失败：点名哪个领域没恢复，且不假装成功', async () => {
  const api = fakeApi({ domains: realDomains(), selection: ['d_skill'], fail: { toggle: 'd_skill' } })
  const journal = journalFrom(api)
  api.state.domains.push({
    id: 't_temp',
    name: '__cdx-e2e-mask-1',
    defaultOn: false,
    order: 2,
    members: [{ type: 'skill', name: 'agent-experience' }],
  })
  api.state.session.domains = ['t_temp']

  await assert.rejects(recoverJournal(api, journal), (error) => {
    assert.ok(error instanceof SafetyError)
    assert.match(error.message, /「技能」/)
    assert.match(error.message, /没恢复|恢复/)
    assert.match(error.message, /npm run e2e:restore/)
    return true
  })
})

test('恢复拒绝删除账本里写的真实领域名', async () => {
  const api = fakeApi({ domains: realDomains(), selection: ['d_skill'] })
  const journal = journalFrom(api, { domainName: '技能' })
  await assert.rejects(recoverJournal(api, journal), /拒绝删除/)
  assert.equal(api.state.calls.some((call) => call[0] === 'delete'), false)
})

test('挑 skill：优先未归入领域、且本会话没请求的', () => {
  const snapshot = {
    session: { live: true, excluded: { skills: [], tools: [] } },
    config: { skillGate: 'shadow' },
    requested: { skills: ['already-on'] },
    domains: [],
    cost: { maskedSkills: [] },
  }
  const catalog = {
    skills: [{ name: 'already-on' }, { name: 'free-skill' }],
    unassigned: { skills: ['already-on', 'free-skill'] },
  }
  const picked = pickMaskSkill(snapshot, catalog)
  assert.equal(picked.name, 'free-skill')
  assert.equal(picked.alreadyMasked, false)
})

test('挑 skill：没有未归入领域时，退到本来关着的领域成员，并标出它已遮罩', () => {
  const snapshot = {
    session: { live: true, excluded: { skills: [], tools: [] } },
    config: { skillGate: 'shadow' },
    requested: { skills: [] },
    domains: [
      { id: 'd_off', name: '建模', loaded: false, members: [{ type: 'skill', name: 'archify', present: true }] },
    ],
    cost: { maskedSkills: ['archify'] },
  }
  const catalog = { skills: [{ name: 'archify' }], unassigned: { skills: [] } }
  const picked = pickMaskSkill(snapshot, catalog)
  assert.equal(picked.name, 'archify')
  assert.equal(picked.alreadyMasked, true)
  assert.equal(picked.source, 'domain')
})

test('挑 skill：同一个领域里优先没有 source 的成员，别挑 preset 私有 skill', () => {
  const snapshot = {
    session: { live: true, excluded: { skills: [], tools: [] } },
    config: { skillGate: 'shadow' },
    requested: { skills: [] },
    domains: [
      {
        id: 'd_mix',
        name: '混合',
        loaded: false,
        members: [
          { type: 'skill', name: 'preset-skill', present: true, source: 'archify-projects' },
          { type: 'skill', name: 'plain-skill', present: true },
        ],
      },
    ],
    cost: { maskedSkills: ['preset-skill', 'plain-skill'] },
  }
  const catalog = { skills: [{ name: 'preset-skill' }, { name: 'plain-skill' }], unassigned: { skills: [] } }
  const picked = pickMaskSkill(snapshot, catalog)
  assert.equal(picked.name, 'plain-skill')
})

test('挑 skill：没有候选就明确报错，绝不去关真实领域', () => {
  const snapshot = {
    session: { live: true, excluded: { skills: [], tools: [] } },
    config: { skillGate: 'shadow' },
    requested: { skills: ['only-skill'] },
    domains: [{ id: 'd1', name: '技能', loaded: true, members: [{ type: 'skill', name: 'only-skill', present: true }] }],
    cost: { maskedSkills: [] },
  }
  const catalog = { skills: [{ name: 'only-skill' }], unassigned: { skills: [] } }
  assert.throws(() => pickMaskSkill(snapshot, catalog), /不能在真实领域上/)
})

test('startMaskRun：开跑先恢复上一次崩溃留下的账本，再记自己的账', async () => {
  const file = tmpJournal()
  const api = fakeApi({ domains: realDomains(), selection: ['d_skill'] })
  const stale = journalFrom(api, { domainName: '__cdx-e2e-mask-old' })
  api.state.domains.push({
    id: 't_old',
    name: '__cdx-e2e-mask-old',
    defaultOn: false,
    order: 2,
    members: [{ type: 'skill', name: 'agent-experience' }],
  })
  api.state.session.domains = ['t_old']
  writeJournal(stale, file)

  const run = await startMaskRun(api, {
    sessionId: 's1',
    domainName: '__cdx-e2e-mask-new',
    skill: 'agent-experience',
    journalPath: file,
  })
  assert.ok(run.recovery, '应当报告恢复了旧账本')
  assert.equal(api.state.domains.some((domain) => domain.id === 't_old'), false)
  assert.equal(api.state.session.domains.includes('d_skill'), true)
  assert.equal(readJournal(file).domainName, '__cdx-e2e-mask-new')

  const report = await run.finish()
  assert.deepEqual(report.restoredReal, [])
  assert.equal(readJournal(file), null)
})

test('startMaskRun：跑动过真实领域时先恢复，再判本轮失败', async () => {
  const file = tmpJournal()
  const api = fakeApi({ domains: realDomains(), selection: ['d_skill'] })
  const run = await startMaskRun(api, {
    sessionId: 's1',
    domainName: '__cdx-e2e-mask-new',
    skill: 'agent-experience',
    journalPath: file,
  })

  // 模拟脚本 bug：误把真实领域关了
  await api.toggle('s1', 'd_skill', false)
  await assert.rejects(run.finish(), (error) => {
    assert.ok(error instanceof SafetyError)
    assert.match(error.message, /「技能」/)
    assert.match(error.message, /动过真实领域/)
    return true
  })
  assert.equal(api.state.session.domains.includes('d_skill'), true, '必须先把真实领域恢复')
  assert.equal(readJournal(file), null, '恢复并核实过才清账本')
})
