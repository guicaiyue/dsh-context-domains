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

当前基线：**23 项，18 passed / 5 skipped / 0 failed**（那 5 项是 `test/api.test.mjs`，没有 dsh-dev 的 cookie jar 就跳过；
本机有 jar 时是 23 passed）。`test/compaction.test.js` 把 `compaction-basic` 的
`resolveTargetPolicy` / `resolveCompactSpec` 抄了一份，测的是「预算 → thresholdTokens」的真实换算。
端到端脚本（`test/e2e/*.mjs`）要一台跑着的 DSH，不在 CI 里：

- `test/e2e/mask.mjs`：关领域后 skill 在会话视角里 `modelInvocable:false`。
- `test/e2e/scroll.mjs`：顶部条不把会话弹离底部（贴底跨多个测量周期不回弹、`padding-top` 不变）。

## 发版

一次发布 = 一次标签推送。标签必须是 `v<package.json 的 version>`，否则 release workflow 直接失败。

```bash
npm version patch --no-git-tag-version
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z && git push origin main --tags
```

**推完不用再手工补什么。** 插件没有「装在机器上跑」的形态，「上线」= 三个交付面同时成立：

1. GitHub Release 建好，资产齐（带版本 tgz + 稳定别名 `dsh-context-domains.tgz` + `SHA256SUMS.txt`），
   别名地址 200 —— `release.yml` 自己做；
2. npm 上有这个版本 —— `release.yml` 有 `NPM_TOKEN` 就自己发；
3. 插件市场条目（awesome-dsh-plugin 的 `data/plugins/guicaiyue__dsh-context-domains.yml`）与这一版一致。

2、3 两面由 autoloop 中台的规则「上下文领域：自动上线」收尾：`release.yml` 的 `notify` job 在资产挂好后
POST `context-domains.release`（来源 github，subject 是 tag）→ NAS 的 `nas-ops` 跑
`xrznas/context-domains/release/run.sh`。缺 npm 就从 Release 的 tgz 补发；条目与这一版不同就在
fork 上开 `market/v<版本>` 分支提 PR（字节相同就不提）。三面齐了才算一版上线，任何一面没齐，
那张卡片和 workflow 都会红。

所以**别把 tag 当重试按钮**：删标签重建会让 Release 变 untagged draft、稳定别名 404（那一轮会被判「没跑成」）。
发坏了就 bump 版本再发一版。

## 不要碰

- `$DSH_HOME/context-domains/state.json` 是唯一真相（用户手写的领域都在里面），
  改结构必须写迁移（`lib/store.js` 的 `normalizeDocument`），v0.2 的 `{skills,tools}` 两串
  就是靠迁移合进 `domains` 的。
- `assets/` 里的截图是真机跑出来的，别用设计稿替换。
- `docs/market/guicaiyue__dsh-context-domains.yml` 里**不能**手写 `npm:` 字段
  （awesome-dsh-plugin 的校验会拒绝），描述必须与代码一致。
