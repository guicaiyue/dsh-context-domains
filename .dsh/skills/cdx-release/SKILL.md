---
name: cdx-release
description: 给 dsh-context-domains 发一版并确认真的上线了。中台把「上下文领域：上线」规则的活派过来、收到 context-domains.ready 事件时使用；用户说「发一版」「发布」「打个 tag」「上线这个插件」时也用。
---

# dsh-context-domains 上线

**上线 = 一次 tag 推送。** `release.yml` 只认 `push: tags: ['v*']`，只 commit + push main 会让 `verify.yml` 绿但 npm 和 Release 资产都不动——看起来成功，其实没上线。

## 发之前先确认

1. **工作树干净**：`git status --short` 必须空。有未提交改动就停下问。
2. **本地没落后**：`git fetch && git log --oneline origin/main..main` 必须空。有就是没推，先推。
3. **检查全绿**：`npm run verify`。**只有这一道**——这个仓库没有 `typecheck`、没有 `format:check`、没有 tsconfig。CI 的 `release.yml` 里 `Verify` 那一步跑的也是它。
4. **版本号对得上**：`node -p "require('./package.json').version"` 和 `git tag --list "v*" | tail -1` 比一比。**已经存在的版本号不能重发**：`release.yml` 先校验 `tag == v<package.json version>`，推同名 tag 不会触发新发布，只会再打印一次「跳过发布」。

## bump 级别

看 `git log --oneline v<上一版>..HEAD`：

- 全是文档 / CI / 注释 / 资产 → `patch`
- 有 `feat` / 新能力 → `minor`
- 有破坏性改动 → `major`，**且先读 `AGENTS.md` 第 2 条**（preset 治理不许放宽，放宽等于改插件定位）

## 步骤

```bash
# 1. 补 CHANGELOG：在顶部插一条 ## <新版本>，写清这版改了什么
#    npm version 不会做这件事，得手写

# 2. bump（不建 tag 不提交）
npm version patch --no-git-tag-version

# 3. 提交 + 打标签 + 一次推上去
git add -A
git commit -m "chore: release v<版本>"
git tag v<版本>
git push origin main --tags
```

`main` 和 tag **一次推**，别分两次。没有 `package-lock.json`，不用担心 lock 里的 version 不一致。

## 等 CI，按日志核四行

**不看 `gh run list` 的绿勾就收工。** 绿勾只说明 job 没报错，不说明东西发出去了。

```bash
gh run watch $(gh run list --workflow=release.yml -L1 --json databaseId --jq '.[0].databaseId')
```

日志里必须有这四行，缺一行就是没上线：

```
Resolve version and check the tag matches   → package.json version: <版本> / ref/tag: v<版本>
Publish to npm (optional)                   → npm notice Publishing to https://registry.npmjs.org/
                                              + dsh-context-domains@<版本>
Verify the stable download URL              → try 1: 200 .../releases/latest/download/dsh-context-domains.tgz
Summary                                     → 版本：<版本>
```

然后**独立复核**，不看 CI 自己的结论：

```bash
npm view dsh-context-domains@<版本> version --registry=https://registry.npmjs.org
curl -sIL -o /dev/null -w '%{http_code}\n' \
  https://github.com/guicaiyue/dsh-context-domains/releases/latest/download/dsh-context-domains.tgz
```

`npm view` 前几十秒可能 404——registry 元数据有延迟，不是失败。CI 里那 12×15s 的轮询就是干这个的。

## 市场条目

```bash
git diff v<上一版>..v<新版本> -- docs/market/
```

空就不管。非空才跑 `scripts/market-submit.sh`（幂等，可重复跑）。

**这是唯一需要人先同意的事**：它会 fork 公共仓库 `awesome-dsh-plugin` 并开 PR，是往别人的仓库写东西。开 PR 之前先用 `ask` 问一次。

## 发坏了怎么办

**不删 tag 重建。** 删了重建会把 GitHub Release 变成 untagged draft，资产还在、`gh release view` 看不出异常，但稳定别名静默 404。

**bump 到下一个版本再发一版。** 这就是全部恢复手段。

## 汇报

`tell: always`，每一轮的第一行都会推成人看的卡片。写清「哪个项目 + 上线了什么」：

- 上线了：`上下文领域 上线：<改了什么>（v<版本>），npm 与 Release 资产都核对过`
- 没上线东西：`上下文领域 这次没上线东西：<改了什么>，检查全绿`
- 发坏了：`上下文领域 发版失败：<哪一步红的>，v<版本> 已推出，下一版修`

提交号、版本号放括号里，别当主语。**「已通过」「核对完毕」单独出现等于没说。**
