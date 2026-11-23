# 设置页卡顿 · 19 条

事项：`settings-lag`（arch-desktop / 上下文领域：开发）
进度卡：`cdx-settings-lag`
本轮范围：卡片第 1 条「同一瞬间连点两个成员会丢改动」。其余 18 条不在本轮做。

> 本轮开始时卡片把 1–3 标成完成，但当前 `main` 的 `client.js` 仍是旧的 `setMember`
> （每次从渲染快照算整份 members），仓库里也没有 2/3 的对应改动。本轮按仓库事实重做
> 第 1 项；2/3 放回待做，卡片计数从 4/19 校正为 1/19。

## 基线（2026-11-23，本机 DSH `127.0.0.1:3080`）

数据量：5 个领域 / 15 个成员；目录 5 个 skill + 36 个 tool（41 行）。

| 项目 | 实测 |
|---|---|
| `GET /domains` | 29.5 ms，1.5 KB |
| `GET /catalog` | 2.7 ms，19.2 KB |
| 设置页打开（点「上下文领域」→ `.cdx-set` 有领域） | 70 ms |
| 连点两项后第一项打勾 | 32 ms |
| 连点两项后两项都打勾 | 45 ms |
| 同一任务连点两项的请求 | 2 × POST `/domains` + 4 × GET（每次写完都重拉 domains + catalog） |
| 旧实现并发两次 update | 6 ms，最终只剩 1 项（`lost: true`） |

旧实现的复现：`probe-tmp.mjs`（两次 update 都基于同一份旧 members）。
真页面复现/回归：`test/e2e/settings-race.mjs`。
纯函数回归：`test/settings-members.test.js`。

## 19 条

### 写路径

1. [x] **锁住丢写**：同一瞬间连点两项，后一项不再覆盖前一项。
   做法：`createMemberWriter` 按「领域 + 最新意图」串行写；成员写不再跟全局 `busy` 走，
   否则第二次点击会被 disabled 吞掉。测试：`test/settings-members.test.js`（2 条）、
   `test/e2e/settings-race.mjs`（真页面连点两项，两项落盘）。
2. [ ] **单次写请求**：同一轮连点合并成 1 个 POST（现在是 2 个 POST + 4 个 GET）。
   做法：writer 内加一个 30–50 ms 的合并窗口/微任务，把同一批 toggle 压成一次提交；
   验收：连点两项只看到 1 个 `op=update`，最终 members 正确。
3. [ ] **勾选立刻打勾**：复选框和「已选 n 项」由 pending members 驱动，点击当帧变；
   失败再回滚到服务端快照。验收：真页面 click → checked ≤ 16 ms，失败时回滚并报错。
4. [ ] **busy 分流**：把「首次加载 / 成员保存 / 改名 / 删除」拆成不同状态；
   只有删除等破坏性操作禁用整页，成员保存不挡下一次勾选。验收：保存成员时改名/删除
   仍可按状态禁用，但成员复选框始终可点。

### 读路径

5. [ ] **写后只刷领域**：拆 `loadDomains()` / `loadCatalog()`，成员写完只重拉 domains。
   验收：一次成员写从 2 个 GET 降到 1 个 GET；目录不变时不重建成员行。
6. [ ] **打开设置先出缓存**：模块级缓存上一份 domains/catalog，打开设置先渲染，
   后台再校验。验收：有缓存时首屏 ≤ 16 ms，不出现空列表闪一下。
7. [ ] **目录只拉一次**：catalog 跨设置页打开复用，skill/tool 变化或超过 TTL 才失效。
   验收：连续开关设置页，catalog 只请求一次；目录变化后能看到新成员。
8. [ ] **并发 load 取最新**：给 load 加序号或 AbortController，切领域/连续写时旧响应
   不能覆盖新状态。验收：快速切两个领域，最后显示的是后选中的那个。

### 渲染

9. [ ] **搜索防抖**：输入 100–150 ms 后才过滤，避免每敲一个字全量重算。
   验收：连打 5 个字只过滤 1 次；输入框无掉字。
10. [ ] **过滤结果 memo**：`memberSet` / `pool` / `rows` 用 `useMemo`，依赖
    domains/selected/query/tab/filter。验收：勾选一项不重算搜索过滤。
11. [ ] **页签只算一类**：tab 是 skill/tool 时只过滤那一类，不再同时建两个 pool。
    验收：工具页签下不遍历 skills。
12. [ ] **成员行 memo**：抽 `MemberRow`，props 稳定（type/name/checked/onChange），
    勾选一行不重渲染其余 40 行。验收：React DevTools 或渲染计数测试。
13. [ ] **大目录虚拟化**：成员行超过 200 时只渲染视口附近；保留键盘/读屏语义。
    验收：1000 行目录滚动仍流畅，搜索/勾选可用。
14. [ ] **领域行计数缓存**：`counts(domain)` 在 domains 变化时算一次，不在每次
    keystroke/toggle 重算。验收：勾选成员不重算 5 个领域的计数。

### 交互与可靠性

15. [ ] **名称/说明防抖保存**：输入暂停后再写，一次编辑只发一个 update；
    避免 onBlur + load 连击。验收：快速改三次只落最后一个值、只发一次写。
16. [ ] **加载骨架与空态**：首次加载显示骨架，不再用「还没有领域」冒充加载中；
    验收：慢网下不闪空态、不跳布局。
17. [ ] **错误局部化与重试**：domains 失败不拖垮 catalog；错误显示在对应区块并带重试。
    验收：单独打挂一个接口，另一块仍可用。
18. [ ] **选中领域稳定**：reload 后保留 selectedId；领域被删时选相邻项，不回到第一个。
    验收：勾选成员触发 reload 后左侧选中不跳。
19. [ ] **性能预算与 e2e 断言**：把「打开 ≤ 50 ms、click→checked ≤ 16 ms、连点 1 个写」
    写进 `test/e2e/settings-race.mjs` 的请求计数与计时断言，防止后续回退。

## 本轮验收

```bash
npm run verify                 # 25/25 通过（lint + node --test）
node test/e2e/settings-race.mjs
```

`npm run typecheck` / `npm run format:check` 在本仓库没有定义（没有 tsconfig / prettier
配置），本轮无法执行；`npm run verify` 的 lint 已覆盖全部 `.js` / `.mjs` 的语法检查。

## 自审：这次改动最可能怎么坏

- **成员写不再设全局 busy**：如果以后有人把 `onBusy` 加回来，复选框又会被 disabled，
  第二次连点会被浏览器吞掉。`settings-race.mjs` 锁的是用户路径，能抓住这个回退。
- **writer 按领域重置**：切领域时用新领域的页面快照；旧领域的在飞请求完成后会先 reload，
  再提交新领域的 pending。若将来支持多领域同时编辑，需要把 writer 改成每领域一条队列。
- **失败处理**：写失败会清掉 pending 并显示错误，下一次勾选从页面快照重算；不会把
  未落盘的「幽灵成员」继续写上去。
