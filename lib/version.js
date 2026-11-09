// 插件自报版本：只从 package.json 读，绝不手写常量。
// 之前 /health 里写死 '0.1.0'，发到 0.3.x 之后它仍报 0.1.0，排障时先被骗一次。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readVersion() {
  try {
    const file = fileURLToPath(new URL('../package.json', import.meta.url))
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export const VERSION = readVersion()
