import os from 'node:os'
import path from 'node:path'

/** DSH_HOME：容器里是 /data/dsh，宿主是 ~/.dsh。 */
export function dshHome(env = process.env) {
  const raw = env.DSH_HOME
  if (typeof raw === 'string' && raw.trim() !== '') return raw
  return path.join(os.homedir(), '.dsh')
}

/** 插件自有数据目录（不是 profile，也不是会话存储）。 */
export function dataDir(env = process.env) {
  return path.join(dshHome(env), 'context-domains')
}

export function stateFile(env = process.env) {
  return path.join(dataDir(env), 'state.json')
}
