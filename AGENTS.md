# 给接手这个仓库的 agent

这个目录是 DSH 插件 `dsh-context-domains`（会话顶部的领域条 + 设置 → 上下文领域）。
设计与实现记录在 [`DESIGN.md`](DESIGN.md)，契约在 [`SPEC.md`](SPEC.md)，发版见
[`docs/PUBLISH.md`](docs/PUBLISH.md)，上架见 [`docs/market/README.md`](docs/market/README.md)。

## 四条硬约束

1. **改 `index.js` / `lib/**` / `cordis.patch.yml` / `package.json` 的 `dsh` 段 → 必须重启 dsh。**
   只改 `client.js` 走热更。改完先 `npm run verify`。
2. **`tools.restrict` / `guard` 只能装在自家 preset 的会话上。** 装到别人的 preset
   （例如 `archify-projects`）上会把它私有的 skill 供给一起判成违规，出图会话直接跑空。
   判据是 `managesPreset()`（`lib/config.js`）+ `agentPresets.presetForSession()`，
   认不出的 preset 一律不动。放宽这条就是改变插件定位，先问维护者。
3. **只用宿主 token（`--dsw-alias-*` / `--dsv-*`）上色，禁止硬编码颜色。**
4. **降级必须说出来。** skill 拿不到定义、preset 不归管、`skillGate` 不是 `shadow`，
   都要在 `/snapshot` 里如实显示，不许静默宣称「已经省了 token」。

## 提交前必须绿

```bash
npm run verify     # scripts/syntax-check.mjs（全部 .js/.mjs 过 node --check）+ node --test "test/**/*.test.*"
```

当前基线：**47 项，42 passed / 5 skipped / 0 failed**（那 5 项是 `test/api.test.mjs`，没有 dsh-dev 的 cookie jar 就跳过；
本机有 jar 时是 47 passed）。`test/compaction.test.js` 把 `compaction-basic` 的
`resolveTargetPolicy` / `resolveCompactSpec` 抄了一份，测的是「预算 → thresholdTokens」的真实换算。
端到端脚本（`test/e2e/*.mjs`）要一台跑着的 DSH，不在 CI 里：

- `test/e2e/mask.mjs`：只建一个 `__cdx-e2e-mask-*` 临时领域，验「关→遮罩、开→可调用、再关→遮罩」；
  真实领域一个都不碰。动手前写 `.cdx-e2e-journal.json`，收尾按账本恢复并核实。
- `test/e2e/restore.mjs`（`npm run e2e:restore`）：硬杀 / 断电后按账本收尾，不跑测试也能用。
- `test/e2e/scroll.mjs`：顶部条不把会话弹离底部（贴底跨多个测量周期不回弹、`padding-top` 不变）。

## 发版

一次发布 = 一次标签推送。标签必须是 `v<package.json 的 version>`，否则 release workflow 直接失败。

```bash
npm version patch --no-git-tag-version
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z && git push origin main --tags
```

**推完之后只有一件手工事**：如果这一版改了插件的能力描述，跑一次

```bash
scripts/market-submit.sh
```

它把插件市场条目（`awesome-dsh-plugin` 的 `data/plugins/guicaiyue__dsh-context-domains.yml`）与仓库里
`docs/market/…yml` 对齐并提 PR，幂等、可重复跑；条目没变时什么都不做。
Release 资产、稳定别名 200、npm 这三件 `release.yml` 自己做，不用人管。

**别把 tag 当重试按钮**：删标签重建会让 Release 变 untagged draft、稳定别名 404。
发坏了就 bump 版本再发一版。

## e2e 与探针：只许碰自己建的临时领域

`test/e2e/*.mjs` 和任何一次性探针都跑在**真实运行中的 DSH 上**，那里有用户手写的领域。
2026-11-23 两次事故：探针点了已有领域「创造者技能」的复选框，先把它从 4 个成员点到 12 个，
后把它整个删掉，两次都是从旧日志里手工找回数据才恢复。

硬规矩：

- 测试只在自己的临时领域上点。临时领域名字以 `__cdx-e2e-` 开头，跑完删掉。
- **不许**勾已有领域的成员、不许切它的默认开关、不许删它、不许改名。
- 每个碰领域的 e2e 都要用 `test/e2e/guard.mjs` 的 `guardDomains()`：建完临时领域拍快照，
  `finally` 里先 `verify()` 再删临时领域。别人的领域任何一项变了就抛错中止。
- 开关类 e2e 必须能自己收尾：动手前先写账本（`test/e2e/safety.mjs`），`finally` + SIGINT/SIGTERM/SIGHUP
  都要恢复，最后重新读快照核实。**Puppeteer 默认会接管信号**：`@puppeteer/browsers` 的 SIGINT 处理器
  先 kill 浏览器再 `process.exit(130)`，异步收尾来不及跑；`puppeteer.launch()` 要传
  `handleSIGINT:false` / `handleSIGTERM:false` / `handleSIGHUP:false`。
- 恢复不了就保留 `.cdx-e2e-journal.json`，逐个点名哪个真实领域没恢复，非零退出，不许静默通过。
  下次运行或 `npm run e2e:restore` 会按账本重试。
- 要量真实数据的基线（比如「打开设置页多少毫秒」），只读不改：`GET /domains`、`GET /catalog`、
  DOM 测量。读数不产生副作用。

## 不要碰

- `$DSH_HOME/context-domains/state.json` 是唯一真相（用户手写的领域都在里面），
  改结构必须写迁移（`lib/store.js` 的 `normalizeDocument`），v0.2 的 `{skills,tools}` 两串
  就是靠迁移合进 `domains` 的。
- `assets/` 里的截图是真机跑出来的，别用设计稿替换。
- `docs/market/guicaiyue__dsh-context-domains.yml` 里**不能**手写 `npm:` 字段
  （awesome-dsh-plugin 的校验会拒绝），描述必须与代码一致。
