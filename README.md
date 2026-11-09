# dsh-context-domains

把一组 skill / tool 归成一个「领域」，在会话顶部一条横条里整块开关。

- **领域**：一个领域里可以同时装 skill 和 tool，概念上不区分类型；加载时才按类型分流
  （skill 从模型目录里摘掉、tool 从工具表里移除）。
- **领域条**：会话里、会话头正下方一行，`● 名称`，绿点=已加载、灰点=未加载，点一下开关；
  悬停展开成员（技能/工具两段，名字用顿号连起来）。新会话与对话是同一个位置。
- **设置 → 上下文领域**：领域清单 + 成员名单（按技能/工具两段、只有名字 + 复选框），另有建域建议。

## 机制

| 面 | 做法 |
|---|---|
| tool 屏蔽 | `agent.ctx.tools.restrict({ deny })`，schema / 查找 / 执行三处一致移除 |
| tool 兜底 | `agent.ctx.tools.guard(...)`，同步、顺序无关地拒绝 |
| skill 屏蔽 | 在 agent scope 用同名 runtime skill 重投，`modelInvocable:false` → 从模型目录消失，`/名字` 仍可用 |
| skill 兜底 | `guard` 按名拒绝 `skill` 调用 |
| 技能全关 | 额外摘掉 `skill` 工具（目录本来也会是空的） |

会话级选择存在 `$DSH_HOME/context-domains/state.json`（原子写、串行写、坏文件自动备份）。
数据结构：`Domain { id, name, icon?, description?, defaultOn, members[{type,name}] }`、
`sessions[id] = { domains: string[], excluded: {skills,tools} }`；v0.2 的 `skills/tools` 两串会在读取时自动合并。

## 开发（dsh-dev 容器）

```bash
docker exec dsh-dev dsh plugin --profile web add link:/workspace/dsh-context-domains
docker compose restart dsh
curl -s -b <cookie> http://127.0.0.1:3080/context-domains/api/health
```

无构建步骤（Host 与 Client 都是纯 ESM）。

## 测试

```bash
node --test test/                                  # 14 项：纯函数 + 迁移 + HTTP 集成
node test/e2e/mask.mjs http://127.0.0.1:3080       # 端到端：关领域 → maskProbe 全为 false
```

## API

`/context-domains/api/{health,snapshot,catalog,domains,toggle,exclude,probe}`，全部经 `requestRejection` 栅栏。
`POST /toggle` 只需要 `{ sessionId, domainId, enabled }`（v0.3 起没有 `kind`）。

## 配置

| 键 | 默认 | 说明 |
|---|---|---|
| `skillGate` | `shadow` | `shadow`=按域过滤目录；`coarse`=只在全关时摘 `skill` 工具；`off`=不干预 |
| `protectedTools` | `["present"]` | 永不被领域关掉的工具 |
| `allowEmptyToolSet` | `false` | 是否允许把工具全关 |
| `tokenEstimate` | `chars` | 成本估算口径（字符/4），只影响 API 里的数字 |

## 验收：第三方来源（MCP / 外部 skill 提供方）

一次性验收用的第三方来源已撤除（profile patch 里那 4 行已删，容器重启后 `mcp__*` 与 office/badge 技能都不再出现）。
要复跑这套验收，把下面几行加进 `/data/dsh/profiles/web/cordis.patch.yml` 的 **`insert:` 下面**
（直接放顶层会被当成「按 id 覆盖已有条目」而报 `patch: entry "..." not found`）：

```yaml
- insert:
    - id: mcp-memory
      name: "@deepseek-ai/dsh-mcp-client"
      config: { serverName: memory, transport: stdio, command: npx,
                args: ["-y", "@modelcontextprotocol/server-memory"],
                env: { MEMORY_FILE_PATH: /data/dsh/mcp-memory.jsonl } }
    - id: mcp-fs
      name: "@deepseek-ai/dsh-mcp-client"
      config: { serverName: fsdemo, transport: stdio, command: npx,
                args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"] }
    - id: skill-office
      name: "@deepseek-ai/dsh-skill-office"
    - id: skill-badge
      name: "@deepseek-ai/dsh-skill-badge"
```

```bash
docker compose restart dsh
node test/e2e/mcp.mjs http://127.0.0.1:3080   # 建混装领域 → 开关 → 断言 → 自动删除
```

当时的实测（领域 = 3 skill + 4 MCP 工具）：

| 检查 | 结果 |
|---|---|
| 目录发现 | 13 skill（filesystem 4 / dsh-office 7 / dsh-badge 1 / archify 1）+ 64 tool（含 25 个 `mcp__*`） |
| 开启 | `effective.tools` 出现 4 个 `mcp__memory__*`，`effective.skills` 含 3 个 skill，`missing` 为空 |
| 关闭 | 4 个 MCP 工具进 `deniedTools` 且从 `visible.tools` 消失；3 个 skill `maskProbe.modelInvocable=false` |
| 规模 | 16 个 `mcp__fsdemo__*`：关闭 → visible 0 / denied 16；开启 → visible 16 |
| 界面 | 点芯片双向切换，`masked` 从 `[]` → 三个 skill 名 → `[]` |

## 只管自己的会话：preset 治理门

第三方插件会为自己的受限 agent 声明 preset（例如 `dsh-archify-projects` 的 `archify-projects`，
preset 里带私有的 skill 供给与工具白名单）。领域插件若对它也装 `restrict`/`guard`，
就会把它自带的那份供应按「我的领域没开」判成违规 —— 实测 archify 的出图会话里
`skill: archify` 被拒、整轮跑空。

所以默认**只治理随包发布的四个内置 preset**：

```yaml
config:
  managedPresets: [standard, ptc, minimal, cordis]   # 默认值
  manageUnknownPresets: false                        # 认不出的 preset 一律不管
```

`/snapshot` 的 `session.managed` 会告诉界面这个会话归不归领域管；不归管时条子照常显示（只读状态），
`skillGate` 为 `unmanaged`。
