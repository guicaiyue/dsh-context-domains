# 上架到 DSH 插件市场

市场（[dsh-market](https://github.com/dsh-market/dsh-market)）本身不放列表：它的目录来自
[curated registry `awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。
所以「让别人在市场里看到这个插件」= 往那个仓库提一个 YAML 文件的 PR。

本仓库的条目已经写好：[`guicaiyue__dsh-context-domains.yml`](guicaiyue__dsh-context-domains.yml)。
`scripts/market-submit.sh` 会把下面的事一次做完（幂等，可重复跑）。

## 一次性准备

1. **发一个版本**（Release 由 GitHub Actions 自动建，不用手工上传）：

   ```bash
   npm version patch --no-git-tag-version    # 或手工改 package.json 的 version
   git commit -am "chore: release v0.3.1"
   git tag v0.3.1
   git push origin main --tags
   ```

   `.github/workflows/release.yml` 会在标签推送后：跑 `npm run verify` → `npm pack`
   → 建 Release（自动生成 release notes）→ 挂三类资产：
   - `dsh-context-domains-<version>.tgz`（带版本号）
   - `dsh-context-domains.tgz`（**稳定别名**，市场条目指向它，发版不用改 YAML）
   - `SHA256SUMS.txt`

   标签与 `package.json` 的 version 不一致时任务直接失败，不会发出错版。

2. **npm 也可以自动发**：仓库 Settings → Secrets 里加 `NPM_TOKEN`，workflow 会多跑一步
   `npm publish --access public`；没配这个 secret 就跳过，不会变红。
   首次发布与 2FA 的处理见 [`../PUBLISH.md`](../PUBLISH.md)。

3. 仓库必须带 GitHub topic **`dsh-plugin`**（评审硬性要求，`market-submit.sh` 会加）。

## 提 PR

文件名必须是 `<owner>__<repo>.yml`，放到那个仓库的 `data/plugins/` 下：

```bash
scripts/market-submit.sh          # 会自动 fork、加 topic、建分支、开 PR
```

手工做的话：

```bash
git clone https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
cd awesome-dsh-plugin
cp /path/to/dsh-context-domains/docs/market/guicaiyue__dsh-context-domains.yml data/plugins/
git checkout -b add-dsh-context-domains
git add data/plugins/guicaiyue__dsh-context-domains.yml
git commit -m "Add guicaiyue/dsh-context-domains"
git push origin add-dsh-context-domains
```

**不要手改 README**：两个 README 由 `data/plugins/*.yml` 生成，合并后 CI 自动重生成。

## CI 会检查什么（都过了才轮得到人看）

| 检查 | 本仓库状态 |
|---|---|
| 一个 PR 最多 3 条 | 只加 1 条 |
| `package.json` 声明 `dsh.bundle.patch` | ✅ `dsh.bundle.patch: ./cordis.patch.yml` |
| 仓库创建满 1 天 | 建于 2026-11-09 10:33Z，**2026-11-10 10:33Z 起才达标**；在此之前门禁会卡这一条 |
| `awesome-lint` + 站点构建 | 双语齐全、无手写 `npm:` 字段 |

仓库年龄这条是自动判定，不针对插件本身。PR 已提：[#13622](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13622)
（2026-11-09）：`PR check` 18 分钟通过（条目、lint、站点构建全绿），`Submission gate`
只差年龄这一条，原文是「repository is 0.0 days old (needs 1) — nothing to do: this check
re-runs by itself and should clear in about 23h」，即 2026-11-10 10:33Z 前后自己转绿，
不用重开 PR、不用推空提交。

## npm 版本号与下载量：不要加字段

市场卡片上的「npm 版本 / 下载量」**不是条目字段**。校验会拒绝手写的 `npm:` 键，
映射由 nightly 的 `scripts/probe-npm.mjs` 自动采集：

1. 从仓库 `package.json` 读包名（`dsh-context-domains`）；
2. 去 registry 查这个包；
3. **要求该包的 `repository` 字段指回同一个 GitHub 仓库**（防抢注）。

`package.json` 里 `repository` 已经指向
`git+https://github.com/guicaiyue/dsh-context-domains.git`，所以下一次 nightly
（`build-site.yml`，每天 `02:23 UTC` ≈ 北京 10:23）会自动补上版本号与下载量。

## 图标与截图：声明在自己仓库里

- 图标：`assets/icon-180.png`（180×180 位图；SVG 会被拒），条目里用 `icon:` 指向它。
- 截图：根目录 `screenshots.json` 列 3 张，路径相对该文件，图在 `assets/` 里。
  换图只推自己的仓库，不用再回来提 PR，下一次构建自动生效。

## 会不会自动出现

- 合并后，`awesome-dsh-plugin.com/plugins.json` 与 npm 上的 `dsh-plugin-catalog` 索引
  会在一天内刷新，dsh-market 的 Discover 页、`plugin_market` 工具都会读到。
- 在你自己机器上，dsh-market 打开时会实时拉 `plugins.json`；如果拉不到，可在
  **插件 → 发现 → 索引源**里加 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`。
- 没合并之前，dsh-market 里搜不到 —— 它只显示 curated 列表里的条目。
