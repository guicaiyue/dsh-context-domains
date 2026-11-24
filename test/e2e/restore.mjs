// 手工恢复 mask e2e 的账本：硬杀 / 断电后下一次 e2e 会自动调同一套逻辑，
// 这个命令是不想再跑测试、只想把领域收拾干净时用的。
//
//   npm run e2e:restore
//   CDX_BASE=http://127.0.0.1:3080 CDX_COOKIE_FILE=... npm run e2e:restore
import {
  DEFAULT_JOURNAL,
  clearJournal,
  createHttpApi,
  createJarCookie,
  defaultCookieJar,
  readJournal,
  recoverJournal,
} from './safety.mjs'

const file = process.env.CDX_E2E_JOURNAL ?? DEFAULT_JOURNAL
let journal
try {
  journal = readJournal(file)
} catch (error) {
  console.error(error.message ?? error)
  process.exit(1)
}
if (journal === null) {
  console.log(`没有待恢复的账本（${file}）。`)
  process.exit(0)
}

const base = process.env.CDX_BASE ?? journal.base ?? 'http://127.0.0.1:3080'
const cookie = process.env.CDX_COOKIE ?? createJarCookie(process.env.CDX_COOKIE_FILE ?? defaultCookieJar())
if (cookie === undefined) {
  console.error(`没有登录 cookie：${process.env.CDX_COOKIE_FILE ?? defaultCookieJar()}`)
  console.error('用 CDX_COOKIE_FILE 指向 dsh-dev 的 cookie 文件，或 CDX_COOKIE 传整条 cookie。')
  process.exit(1)
}

const api = createHttpApi({ base, cookie })
try {
  const report = await recoverJournal(api, journal, { journalPath: file, log: (line) => console.log(line) })
  clearJournal(file)
  console.log(`恢复完成：${report.steps.length > 0 ? report.steps.join('；') : '没有需要恢复的东西'}`)
  if (report.restoredReal.length > 0) {
    console.log(
      `真实领域已恢复：${report.restoredReal.map((row) => `「${row.name}」${row.to ? '打开' : '关闭'}`).join('、')}`,
    )
  }
} catch (error) {
  console.error(error.message ?? error)
  console.error(`账本保留在：${file}`)
  process.exitCode = 1
}
