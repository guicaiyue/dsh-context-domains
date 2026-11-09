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

当前基线：**10 passed / 5 skipped / 0 failed**（15 项里那 5 项是 `test/api.test.mjs`，没有 dsh-dev 的 cookie jar 就跳过）。
端到端脚本（`test/e2e/*.mjs`）要一台跑着的 DSH，不在 CI 里。

## 发版

一次发布 = 一次标签推送。标签必须是 `v<package.json 的 version>`，否则 release workflow 直接失败。

```bash
npm version patch --no-git-tag-version
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z && git push origin main --tags
```

## 不要碰

- `$DSH_HOME/context-domains/state.json` 是唯一真相（用户手写的领域都在里面），
  改结构必须写迁移（`lib/store.js` 的 `normalizeDocument`），v0.2 的 `{skills,tools}` 两串
  就是靠迁移合进 `domains` 的。
- `assets/` 里的截图是真机跑出来的，别用设计稿替换。
- `docs/market/guicaiyue__dsh-context-domains.yml` 里**不能**手写 `npm:` 字段
  （awesome-dsh-plugin 的校验会拒绝），描述必须与代码一致。
