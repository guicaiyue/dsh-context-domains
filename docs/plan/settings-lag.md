# 设置页卡顿 · 19 条

事项：`settings-lag`（arch-desktop / 上下文领域：开发）
进度卡：`cdx-settings-lag`
本轮范围：卡片第 1 条「同一瞬间连点两个成员会丢改动」。其余 18 条不在本轮做。

> 本轮开始时卡片把 1–3 标成完成，但当前 `main` 的 `client.js` 仍是旧的 `setMember`
> （每次从渲染快照算整份 members），仓库里也没有 2/3 的对应改动。本轮按仓库事实重做
> 第 1 项；2/3 放回待做，卡片计数从 4/19 校正为 1/19。

## 基线（2026-11-23 第 2 轮，本机 DSH `127.0.0.1:3080`）

数据量：5 个领域；目录 5 个 skill + 36 个 tool（41 行）。第 1 项（串行写队列）已在
`43cd7b1` 落地，本轮从第 2 项接着做。

| 项目 | 实测 |
|---|---|
| `GET /domains` | 29.5 ms，1.5 KB |
| `GET /catalog` | 2.7 ms，19.2 KB |
| 设置页打开（点「上下文领域」→ 有领域行） | 40 ms |
| 勾第一下后两个动画帧 | 2.5 ms，但复选框仍是未勾（渲染快照把它按回去了） |
| 同一任务连点两项的请求 | 2 × POST `/domains` + 5 × GET（含探针自己读的一次；每次写完仍是 domains + catalog 各一次） |
| 连点两项最终落盘 | 2 项都在（第 1 项的串行队列已生效） |
| 改名 | 失焦才写，写完整页重拉，没有防抖；输入过程中无反馈 |

复现探针：`probe-perf.mjs`（已删，只留结论）。
真页面复现/回归：`test/e2e/settings-race.mjs`、`test/e2e/settings-perf.mjs`。
纯函数回归：`test/settings-members.test.js`。

## 本轮范围

第 2–19 条一次做完：写路径合并与乐观反馈、读路径拆分与缓存、渲染 memo/虚拟化、
改名防抖与错误局部化，最后把性能预算写进 e2e。

## 19 条

### 写路径

1. [x] **锁住丢写**：同一瞬间连点两项，后一项不再覆盖前一项。
   做法：`createMemberWriter` 每个领域一条队列，写串行，每次都拿队列里的最新意图；
   成员写不再跟全局 `busy` 走。测试：`test/settings-members.test.js`、
   `test/e2e/settings-race.mjs`（真页面连点两项，两项落盘）。
2. [x] **单次写请求**：同一批连点进 40ms 合并窗口，压成 1 个 `POST /domains`。
   验收：e2e 连点两项 = 1 个写（原来 2 个），最终 members 正确。
3. [x] **勾选立刻打勾**：pending members 驱动复选框和「已选 n 项」，点击当帧变；
   失败清掉 pending、回滚到服务端快照并报错。验收：e2e 点下去到打勾 0.9–3.7ms（≤16ms），
   写失败时勾选退回并显示错误；纯函数测 onMembers 同步回调与失败后从头起算。
4. [x] **busy 分流**：`savingMembers` / `metaSaving` / `mutating` 三个状态；
   成员保存时复选框始终可点，删除在成员写未完成时禁用。验收：e2e 把成员写故意拖 300ms，
   保存中复选框 `disabled === false`。

### 读路径

5. [x] **写后只刷领域**：拆 `loadDomains()` / `loadCatalog()`，成员写完只重拉 domains。
   验收：e2e 一次连点 = 1 个 `GET /domains`、0 个 `GET /catalog`。
6. [x] **打开设置先出缓存**：模块级缓存上一份 domains/catalog，打开先渲染、后台校验。
   验收：e2e 关掉再打开 12–23ms（目标 ≤50ms），不出现空列表。
7. [x] **目录只拉一次**：catalog 60s TTL 跨设置页打开复用。验收：e2e 第二次打开
   `GET /catalog` 为 0；错误时「重试」强制刷新能看到新成员。
8. [x] **并发 load 取最新**：`createLoadGate` 序号，旧响应作废。验收：单测模拟先发后到，
   旧 token 的 `isCurrent` 为 false。

### 渲染

9. [x] **搜索防抖**：输入先落框，过滤晚 120ms。验收：单测连打 5 个字只过滤 1 次；
   e2e 输入后立刻仍是旧结果、250ms 后只剩匹配项，输入框不掉字。
10. [x] **过滤结果 memo**：`memberSet` / `rows` / `countsById` 都用 `useMemo`，
    依赖 domains/selected/query/tab/filter。验收：代码审查；勾选只改 memberSet 对应依赖。
11. [x] **页签只算一类**：tab 是 skill/tool 时 `types` 只含这一类，不再同时建两个 pool。
    验收：e2e 工具页签下所有行的 `data-type` 只有 tool。
12. [x] **成员行 memo**：抽 `MemberRow`，props 只有 type/name/checked/onToggle，`onToggle`
    用 ref 保持稳定引用。验收：代码审查（仓库没有 React 渲染计数钩子，未做 DevTools 计数）。
13. [x] **大目录虚拟化**：超过 200 行只渲染视口附近，上下占位撑滚动高度。
    验收：e2e 1200 行目录 DOM 32 行，滚到底仍 30 行、最后一行可见、滚动到新行 32ms。
14. [x] **领域行计数缓存**：`countsById` 只在 domains 变化时算一次。
    验收：代码审查；勾选/搜索不触发 counts 重算。

### 交互与可靠性

15. [x] **名称/说明防抖保存**：输入暂停 450ms 后写，失焦立即 flush，旧定时器取消；
    和已落盘值相同不发。验收：e2e 连打三次只发 1 个 update、落最后一个值；单测覆盖
    `metaPayload` 的去重（通过 `settings-members.test.js` 的写队列测试间接覆盖）。
16. [x] **加载骨架与空态**：首次加载显示骨架，不再用「还没有领域」冒充加载中；
    验收：e2e 把 domains 拖 250ms，设置页 23.8ms 出骨架且不出现空态文案。
17. [x] **错误局部化与重试**：domains / catalog 各自错误、各自重试，一个挂了另一个仍可用。
    验收：e2e 第一次 catalog 打 500，领域列表照常出来，错误只落在成员区，点「重试」后恢复。
18. [x] **选中领域稳定**：reload 后保留 selectedId；领域被删时按上一份列表位置选相邻项。
    验收：单测覆盖删中间/末尾/第一个与空列表。
19. [x] **性能预算与 e2e 断言**：`settings-race.mjs` 断言打开 ≤500ms（冷）/
    ≤50ms（有缓存）、click→checked ≤16ms、连点 1 个写 + 1 个领域读、改名 1 个写；
    `settings-perf.mjs` 断言骨架 ≤50ms、1200 行 DOM <80、滚动到底 <100ms。

## 本轮验收

```bash
npm run verify                         # 34/34 通过（lint + node --test）
node test/e2e/settings-race.mjs        # 连点/写合并/乐观打勾/改名/缓存，全绿
node test/e2e/settings-perf.mjs        # 骨架/虚拟化/滚动/搜索/单页签，全绿
```

真机数据（2026-11-23，DSH `127.0.0.1:3080`）：冷打开 27–39ms、有缓存再打开 12–23ms、
点击到打勾 0.9–3.7ms、连点 1 写 1 读 0 目录读、改名 1 写；1200 行目录首屏 32 行、
滚到底 30 行、滚动到新行 32ms。

`npm run typecheck` / `npm run format:check` 在本仓库没有定义（没有 tsconfig / prettier
配置），本轮无法执行；`npm run verify` 的 lint 已覆盖全部 `.js` / `.mjs` 的语法检查。

## 自审：这次改动最可能怎么坏

- **成员写不再设全局 busy**：如果以后有人把复选框的 `disabled` 加回来，第二次连点会被
  浏览器吞掉。`settings-race.mjs` 锁的是用户路径，能抓住这个回退。
- **合并窗口**：40ms 内连点合并成一次写；如果以后把窗口调到 0，写请求数会回到一次一点。
  e2e 的请求计数是硬断言。
- **虚拟化依赖行高**：`.cdx-member` 固定 26px；改行高必须同步 `MEMBER_ROW_HEIGHT`，
  否则滚到底会差几行。e2e 用「最后一行必须出现」抓住。
- **缓存与 TTL**：catalog 60s 内复用；如果以后需要实时看到新装的 skill，得加手动刷新或缩短
  TTL。错误区的「重试」会强制刷新。
- **失败处理**：写失败会清掉 pending 并显示错误，下一次勾选从页面快照重算；不会把
  未落盘的「幽灵成员」继续写上去。
- **新建顺序**：先刷新列表再选中新 id。反过来的话，选中 effect 会用旧列表把新 id 判成失效，
  跳回第一个领域；e2e 的「界面新建选中」断言锁住这个回退。
