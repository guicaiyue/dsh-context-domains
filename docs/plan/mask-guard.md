# mask 检查不再把真实领域留在关闭状态

事项：`mask-guard`（arch-desktop / 上下文领域：开发）
进度卡：`cdx-mask-guard`
本轮范围：`test/e2e/mask.mjs` 的领域开关安全。只改测试与文档，不改插件运行时。

## 用户目标

1. **不碰真实领域**：遮罩 e2e 只在名字以 `__cdx-e2e-` 开头的临时领域上开关；
   跑完（正常、断言失败、Ctrl-C）真实领域的「打开/关闭」状态与跑前一致。
2. **崩了能收拾**：进程被硬杀后，下一次运行或 `npm run e2e:restore` 能删掉遗留的临时领域、
   把会话选择恢复成跑前状态，并打印恢复了什么。
3. **收拾不了要大声说**：无法恢复时，消息里逐个点名「哪个真实领域没恢复」，退出码非零；
   不许静默地当成通过。
4. **遮罩本身还有效**：临时领域关闭时它的 skill 在会话视角 `modelInvocable:false`，
   打开时可调用，再关闭又遮罩。
5. `npm run verify` 全绿。

## 基线（2026-11-24，本机 DSH `127.0.0.1:3080`，插件 0.4.2）

| 项目 | 实测 |
|---|---|
| `npm run verify` | 34 tests / 34 passed / 0 failed；语法检查 23 个文件 |
| 在线领域 | 5 个（4 skill 在默认开启的「创造者技能」；`archify` 在默认关闭的「架构建模」） |
| 在线 skill / tool | 5 / 36；`skillGate: shadow` |
| 当前会话 | `session-96f9…` 冷会话，覆盖选择 `['d_11a77588']`（只有 3 个 workflow 工具） |
| 旧 `mask.mjs` 选域 | `domains.find(d => d.counts.skills > 0)`，**不看 `loaded`**，可能选到本来关着的域，再把它打开 |
| 旧 `mask.mjs` 复原 | 第 56 行一次 `POST /toggle enabled:true`，**没有 try/finally、没有信号处理**；前面任一步抛错就到不了 |
| `guardDomains` 视野 | 只比对 `GET /domains` 的 `members/defaultOn/order/description`，**不看会话级 `loaded`** → 领域被留成关闭也发现不了 |

旧脚本不执行：它正是会把真实领域关掉的那一个。基线来自代码阅读与只读 API。

## 实现方案

按收益排序：

1. **临时领域替掉真实领域**（收益最大）：从 `/catalog` 的 `unassigned.skills` 或
   「本会话没请求、也没被单独排除」的 skill 里挑一个，建 `__cdx-e2e-mask-<时间戳>` 临时领域，
   只 toggle 它。真实领域的开关从此不参与测试。
   风险：临时领域会让该 skill 在所有未加载它的会话里短暂被遮罩；删掉即恢复，和 `mcp.mjs` 同一套做法。
2. **先记账再动手**：任何写操作前把「会话选择、excluded、真实领域 loaded 清单、临时领域名」
   写进 `.cdx-e2e-journal.json`（原子写 + fsync）。崩了以后靠它恢复，而不是靠内存里的 `finally`。
3. **三层收尾**：`try/finally` 覆盖正常与断言失败；`SIGINT/SIGTERM/SIGHUP` 处理器覆盖 Ctrl-C；
   下次启动先 `recover()` 覆盖 `SIGKILL`/断电。恢复后重新读快照验证，验不过就保留日志并点名。
4. **真实领域状态护栏**：`guardDomains()` 之外再加一层会话指纹（真实领域 `loaded` +
   excluded 集合），跑完必须与跑前完全一致；不一致先按账本恢复，恢复过也判本轮失败（说明脚本有 bug）。
5. **单独恢复命令**：`test/e2e/restore.mjs` + `npm run e2e:restore`，用 cookie 直接打 API，
   不依赖浏览器；供硬杀后手工收尾。

## todo

1. [x] **安全模块与单测**：`test/e2e/safety.mjs` 提供账本读写、会话指纹、
   `recoverJournal()`、`pickMaskSkill()`；`test/e2e-safety.test.mjs` 用假 API 覆盖
   正常清理、断言失败、恢复失败、硬杀后恢复、本来关着的领域不被误开。
   验收：先跑红，再全绿；测试不再碰真实 DSH。
2. [x] **重写遮罩 e2e**：`mask.mjs` 只建/删 `__cdx-e2e-mask-*`，先记账再建域，
   `try/finally` + 信号处理收尾；断言临时域关→遮罩、开→可调用、关→再遮罩。
   验收：不出现任何真实领域 id 的 toggle；真实领域 loaded 快照前后一致。
3. [x] **恢复命令**：`restore.mjs` + `npm run e2e:restore`，读账本、删临时域、恢复选择与排除、
   验证并打印；失败点名领域并非零退出。验收：单测里模拟一次「账本 + 残留」能清干净。
4. [x] **文档对齐**：`AGENTS.md` 的 e2e 规矩与测试基线、`DESIGN.md` 的遮罩验收段落、
   `CHANGELOG.md` 记一条。验收：文档里的命令能照着跑。
5. [x] **真机验收**：`npm run verify` + `node test/e2e/mask.mjs http://127.0.0.1:3080`；
   跑前跑后 `GET /domains` 与会话选择一致；再跑一次确认账本已清空。
6. [x] **交棒检查**：发 `context-domains.check` 事件，附 plan 路径、改动文件、verify 与 e2e 输出。

## 结果（2026-11-24）

- `test/e2e/safety.mjs`：账本原子写、`sessionFingerprint()` / `compareSession()`、
  `recoverJournal()`、`startMaskRun()`、`pickMaskSkill()`、HTTP/页内 API 适配。
- `test/e2e/mask.mjs`：只建 `__cdx-e2e-mask-*`；正常跑成功，真实领域与会话选择前后一致；
  `handleSIGINT/SIGTERM/SIGHUP:false` 关掉 Puppeteer 的信号接管。
- `test/e2e/restore.mjs` + `npm run e2e:restore`：硬杀后用 cookie 直接打 API 收尾。
- 单测 `test/e2e-safety.test.mjs` 13 项全绿（`node --test test/e2e-safety.test.mjs`）。
- `npm run verify`：47 tests / 47 passed / 0 failed；语法检查 26 个文件。
- 真机三条路径：
  - 正常跑：`E2E OK`，`GET /domains` 前后一致，会话仍是 `['d_11a77588']`，无账本残留。
  - Ctrl-C（临时领域已建）：退出 130，临时领域删除，会话选择回跑前，账本清空。
  - 模拟硬杀 + 下次运行：先打印「上一次运行没正常收尾，已先恢复…」再继续；
    `npm run e2e:restore` 单独也能清干净。
- 恢复失败的路径由假 API 单测覆盖：账本保留、消息点名「技能」、非零退出。
