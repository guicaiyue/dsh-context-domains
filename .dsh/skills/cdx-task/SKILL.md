---
name: cdx-task
description: 在 dsh-context-domains 里从零做完一件事：自己分析需求、出实现方案、拆 todo、逐条开发自测、检查、上线。中台把「上下文领域」规则的活派过来时使用——一个事件进来，你负责整件事走到底。用户说「修一下设置页卡顿」「给这个插件加个功能」「发一版」时也用。
---

# dsh-context-domains：一件事从头做到上线

这个仓库是 DSH 插件：会话顶部的领域条 + 设置 → 上下文领域。设计在 `DESIGN.md`，契约在 `SPEC.md`，发版见 `docs/PUBLISH.md`。

**一个事件进来，四段你自己走完**：分析 → 开发自测 → 检查 → 上线。没有别人替你拆 todo，也没有别的规则接你的话。

## 这个仓库只有一道门禁

```bash
npm run verify   # lint（node --check）+ node --test "test/**/*.test.*"
```

没有 `typecheck`、没有 `format:check`、没有 tsconfig。CI 的 `release.yml` 里 `Verify` 那一步跑的也是它。基线数字以 `AGENTS.md`「提交前必须绿」那节为准，别用记忆里的旧数字判成败。

改 `client.js` 走热更；改 `index.js` / `lib/**` / `cordis.patch.yml` / `package.json` 的 `dsh` 段必须重启 dsh。

## 第一段：分析 —— 自己把要求翻成能验收的东西

**不要跳。** 下面这些先读，别凭印象：

1. `git log --oneline -8`、`git status`：现在在哪一版、有没有别人的未提交改动
2. `AGENTS.md` 的四条硬约束——任何一条被碰到就先说出来
3. `DESIGN.md` 里和这件事有关的段落（`grep -n "<关键词>" DESIGN.md`）
4. 涉及的代码：`client.js`（浏览器端）、`lib/`（服务端）、`index.js`

产出三样，**写进 `docs/plan/<事项>.md`**，不要只写在正文里（下一轮就看不见了）：

```markdown
# <事项>

## 用户目标
1. 可验收的一条（把「卡顿」翻成「单次操作 p95 ≤ 50ms」，把「不好用」翻成「点一次只发 1 个写请求」）

## 基线（先量再改）
| 项目 | 实测 |
| 打开设置页 | ... ms |

## 实现方案
按收益排序，每步写清改哪个文件的哪个函数、预期收益、风险点

## todo
1. [ ] **一句话说清要做什么**：做法 + 验收条件 + 测试放哪
2. [ ] ...
```

**说「慢了」之前要有数字。** 跑一次计时、数一次请求。没有数字不许写「性能问题」。

## 第二段：开发自测 —— 逐条做，先写会红的测试

按 `docs/plan/<事项>.md` 的 todo 往下做。**每条都走这个循环**：

1. 写一个**会失败的测试**，跑一次，确认它红了，**而且红在预期的地方**（读报错，别只看 `✖`）
2. 改代码
3. 跑那个测试，绿了
4. 补边角：这条改动还可能怎么坏？加一条测试锁住
5. 在 plan 里把这条打 `[x]`

**测试写错了比没写更糟。** 发现测试的预期本身不对（断言了一个本来不该成立的行为），改测试，别改实现去迁就它。

**临时探针用完就删。** 复现用的 `probe-*.mjs` 不进仓库（`.gitignore` 已挡），要么删掉，要么写成 `test/` 下的正式测试。

## 第三段：检查 —— 全部 todo 打勾才进下一段

- plan 里 19 条全 `[x]`，一条没打勾就不能说完成
- `npm run verify` 全绿
- 改了 `client.js` 的话，**光有单测不够，要看真页面**：`test/e2e/*.mjs`（需要跑着的 DSH，不在 CI 里）
- 逐条对「用户目标」：那几条可验收的，现在真的成立吗

**没验收的不许说成已完成。** 卡上写着「已完成」但仓库里没有对应改动，那就是没做——按仓库事实重写 plan 和卡片。

## 第四段：上线 —— 一次 tag 推送

**上线 = 一次 tag 推送。** `release.yml` 只认 `push: tags: ['v*']`，只 commit + push main 会让 CI 绿但 npm 和 Release 资产都不动——看起来成功，其实没上线。

发之前：

1. `git status --short` 必须空
2. `git fetch && git log --oneline origin/main..main` 必须空
3. `npm run verify` 全绿
4. **版本号对得上**：`node -p "require('./package.json').version"` 和 `git tag --list "v*" | tail -1` 比。**已存在的版本号不能重发**——`release.yml` 先校验 `tag == v<package.json version>`，推同名 tag 不会触发新发布

bump 级别看 `git log --oneline v<上一版>..HEAD`：全是文档/CI/注释 → `patch`；有 `feat` → `minor`；有破坏性改动 → `major`（且先读 `AGENTS.md` 第 2 条，preset 治理不许放宽）。

```bash
# 1. 顶部插一条 ## <新版本> 写清这版改了什么（npm version 不会做这件事）
# 2. bump，不建 tag 不提交
npm version patch --no-git-tag-version
# 3. 提交 + 打标签 + 一次推上去（别分两次）
git add -A
git commit -m "chore: release v<版本>"
git tag v<版本>
git push origin main --tags
```

**等 CI，按日志核四行，不看绿勾。** 绿勾只说明 job 没报错，不说明东西发出去了：

```bash
gh run watch $(gh run list --workflow=release.yml -L1 --json databaseId --jq '.[0].databaseId')
```

日志里必须有：`Resolve version and check the tag matches`（版本与 tag 一致）、`Publish to npm`（有 `npm notice Publishing` 和 `dsh-context-domains@<版本>`）、`Verify the stable download URL`（200）、`Summary`（版本号）。

然后**独立复核**，不看 CI 自己的结论：

```bash
npm view dsh-context-domains@<版本> version --registry=https://registry.npmjs.org
curl -sIL -o /dev/null -w '%{http_code}\n' \
  https://github.com/guicaiyue/dsh-context-domains/releases/latest/download/dsh-context-domains.tgz
```

`npm view` 前几十秒可能 404——registry 元数据延迟，不是失败。

**市场条目**：`git diff v<上一版>..v<新版本> -- docs/market/` 非空才跑 `scripts/market-submit.sh`。**这是唯一要人先同意的事**：它 fork 公共仓库 `awesome-dsh-plugin` 并开 PR，是往别人的仓库写东西。开 PR 之前先用 `ask` 问一次。

**发坏了不删 tag 重建。** 删了重建会让 Release 变 untagged draft、稳定别名静默 404。**bump 到下一个版本再发一版**，这就是全部恢复手段。

## 一轮做不完就约下一轮

19 条不是一轮干完的。**用 `later` 约自己**，key 用事项名，别用事件：

```json
{"later":[{"key":"settings-lag-next","at":"<30 分钟后，带时区>","about":"接着做 plan 里第 5–8 条；上一轮做完 1–4，verify 用过 25/25"}]}
```

下一轮回来时，资料里的 `waiting` 有这条复查的 key，`open` 里有进度卡，`events` 里有原来的事。**按 plan 文件接着做，不要重头数。**

全部做完、检查通过、上线完成之后，**取消没到期的复查**：

```json
{"later":[{"key":"settings-lag-next","cancel":true}]}
```

## 进度卡

用 `autoloop-todo` 那个 skill：固定 key（如 `cdx-settings-lag`），每轮更新同一条 Telegram 消息。

标题带计数（`设置页卡顿 · 6/19`），正文只放当前一屏（做完的压成一行计数 + 正在做 + 接下来两三条 + 指针「全部 19 条见 docs/plan/settings-lag.md」）。别把 19 条塞进卡片正文，通道会在 1500 字截断。

## 每一轮怎么汇报

正文第一行就是结论，从第一个字开始写做成了什么。**不写**「我先读一下」「分析完毕」「下面是这一轮的报告」。

- 做完了、上线了：`请求头签名已加：v0.4.3 已发，npm 与 Release 资产都核对过`
- 做了一部分：`设置页连点丢改动已修（第 1/19 条），verify 25/25，接着做第 2 条`
- 卡住要人定：首行写 `待你处理：<原因>`，用 `ask`

提交号、版本号放括号里，别当主语。**「已通过」「核对完毕」单独出现等于没说。**

## 不要碰

- `$DSH_HOME/context-domains/state.json` 的结构（用户手写的领域都在里面），改结构必须写迁移（`lib/store.js` 的 `normalizeDocument`）
- `assets/` 里的截图（是真机跑出来的）
- `docs/market/*.yml` 里手写 `npm:` 字段（市场校验会拒）
- `tools.restrict` / `guard` 装到别人的 preset 上（`managesPreset()` 是判据）

## 高危，先问人

删数据、停服、花钱、对外发消息、改产品方向、新建或轮换密钥、修改权限、**往别人的仓库提 PR 或写入**。其余能自己处理的直接做完。
