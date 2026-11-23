---
name: cdx-dev
description: 在 dsh-context-domains 里做开发——分析用户要求、定用户目标、写实现方案与 todo、开发自测、检查、自审。中台把「上下文领域：开发」规则的活派过来时使用；用户说要改这个插件的设置页、会话顶栏、领域解算、目录发现，或者说「修一下这个 bug」「加个功能」时也用。
---

# dsh-context-domains 开发

这个仓库是 DSH 插件：会话顶部的领域条 + 设置 → 上下文领域。设计在 `DESIGN.md`，契约在 `SPEC.md`，发版见 `docs/PUBLISH.md`。

**你的权限是 `edit`，推不了 tag。** 上线是另一条规则的事，你只管把它做到「可以上线」。

## 四段，一轮里连着做完

**先读这一轮的 `detail`。** 它是派活的人写的这一轮范围，就按它做，别扩大。要它只做分析，就只做分析；要它只改一处，就只改那一处。`open` 里开着的进度卡说明这件事到哪了，不是这一轮要做完全部。

### 一、分析：把要求翻译成能验收的东西

先读现状，再下判断，不要凭印象：

1. `git log --oneline -8`、`git status`：现在在哪一版、有没有别人的未提交改动
2. `DESIGN.md` 里和这件事有关的段落（`grep -n "<关键词>" DESIGN.md`）
3. 涉及的代码：`client.js`（浏览器端，1144 行）、`lib/`（服务端）、`index.js`
4. `AGENTS.md` 的四条硬约束，**任何一条被碰到就先说**

产出三样，写进这一轮的正文（不是文件）：

- **用户目标**：3–5 条，每条可验收。把「卡顿」翻成「单次操作 p95 ≤ 50ms」，把「不好用」翻成「点一次只发 1 个写请求」
- **实现方案**：按收益排序的步骤，每步写清改哪个文件的哪个函数、预期收益、风险点
- **todo**：`[ ]` 列表，每条是一个能独立验证的改动

**先量基线再改。** 说「慢了」之前要有数字（跑一次计时、数一次请求）。没有数字就不许写「性能问题」。

### 二、开发自测：先写会红的测试

这个仓库的规矩是**测试写在实现之前**，每个测试文件开头先写它防的失败方式（见 `AGENTS.md` 和现有 `tests/` 的写法）。

1. 写一个**会失败的测试**，跑一次，确认它红了，**而且红在预期的地方**（读报错，别只看 `✖`）
2. 改代码
3. 跑那个测试，绿了
4. 补边角：这个改动还可能怎么坏？加一条测试锁住

**测试写错了比没写更糟。** 如果你发现测试的预期本身不对（比如断言了一个本来就不该成立的行为），改测试，别改实现去迁就它。

### 三、检查：全绿才算过

**这个仓库只有一道门禁**，就是 `npm run verify`（= `lint` 的 `node --check` + `node --test "test/**/*.test.*"`）。没有 `typecheck`、没有 `format:check`、没有 tsconfig——`npm run` 列一遍就知道：

```bash
npm run verify
```

基线写在这里会过期（现在是 25 项）。**以 `AGENTS.md` 里「提交前必须绿」那一节的数字为准**，跑出来多了少了都对一下，别用旧数字判成败。

`test/api.test.mjs` 那 5 项要 dsh-dev 的 cookie jar，没有就跳过，属正常。

端到端脚本要一台跑着的 DSH，不在 CI 里：

- `node test/e2e/mask.mjs http://127.0.0.1:3080`：关领域后 skill 变 `modelInvocable:false`
- `node test/e2e/scroll.mjs`：顶栏不把会话弹离底部
- 需要 puppeteer-core + 已登录 profile（默认 `~/.local/state/dsh-dev/chrome-profile`）

改了 `client.js` 的话，**光有单测不够**，要看真页面。

### 四、自审：这次改动最可能怎么坏

改 `lib/apply.js` 的 `revoke` / `install` 时机是最危险的：撤 disposer 撤早了，在线会话会静默失去工具限制和 skill 遮罩，表现是「关掉的领域全开了」，**不报错**。这类改动必须有一条测试断言 `entry.disposers.length` 或 `masked.size` 在预期路径上不变。

改 `lib/store.js` 的 `normalizeDocument`：`state.json` 是用户手写领域的唯一副本，写坏了 `load()` 会把它改名成 `.bad-<ts>` 从空文档起步。

## 每一轮怎么汇报

正文第一行就是结论，从第一个字开始写做成了什么。**不要**写「我先读一下」「分析完毕」「下面是这一轮的报告」。

- 做完了、可以上线：`上下文领域 开发完成：<改了什么>，verify 23/23 全绿`，然后在回执里发 `context-domains.ready`
- 还在做：`上下文领域 做到一半：<到哪一步>`
- 卡住要人定：首行写 `待你处理：<原因>`，用 `ask`

## 进度卡

这个仓库的活通常很多步。**用 `autoloop-todo` 那个 skill**：固定 key，每轮更新同一条 Telegram 消息。

标题带计数（`设置页卡顿 · 6/19`），正文只放当前一屏，详细的 19 条写进 `docs/plan/<事项>.md`。别把全部 todo 塞进卡片正文，通道会在 1500 字截断。

## 不要碰

- `$DSH_HOME/context-domains/state.json` 的结构，除非写迁移
- `assets/` 里的截图（是真机跑出来的）
- `docs/market/*.yml` 里手写 `npm:` 字段（市场校验会拒）
- `tools.restrict` / `guard` 装到别人的 preset 上（`managesPreset()` 是判据）

## 要上线时

**不自己推 tag。** 发一条 `context-domains.ready` 事件（回执的 `events`，规则写了 `emits` 才能发），带 `subject`（事项名）和 `summary`（这一轮做成了什么、版本建议 patch/minor/major）。上线是「上下文领域：上线」那条规则的事。
