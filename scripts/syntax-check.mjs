#!/usr/bin/env node
// 质量门里最便宜的一关：把仓库里所有 .js / .mjs 过一遍 `node --check`。
// 这个插件没有构建步骤（Host 与 Client 都是纯 ESM 直接跑），所以「能不能解析」
// 就是最接近编译的那一步；语法错会在插件激活阶段变成 cannot activate，早查早省事。
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['node_modules', '.git', 'coverage', 'dist'])

/** 递归收集待检查文件。 */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) collect(full, out)
    else if (/\.(?:js|mjs|cjs)$/.test(entry)) out.push(full)
  }
  return out
}

const files = collect(root)
let failed = 0
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    failed += 1
    console.error(`✗ ${path.relative(root, file)}`)
    console.error(String(error.stderr ?? error.message).trim())
  }
}

if (failed > 0) {
  console.error(`\n语法检查失败：${failed}/${files.length} 个文件无法解析`)
  process.exit(1)
}
console.log(`语法检查通过：${files.length} 个文件`)
