# DSH 插件设计开发文档 · 上下文领域（Context Domains）

| 项 | 值 |
|---|---|
| 插件包名 | `@local/dsh-context-domains` |
| 目标运行时 | `@deepseek-ai/dsh` 0.2.2-rc.1（Node 26 / Web 客户端） |
| 形态 | 一个 bundle：Host 半边 + Client 半边，无构建步骤（纯 ESM + `window.__ModuleLoader__`） |
| 原型 | OpenDesign 项目 `dsh-context-domains`（`index.html`），本文档是实现依据 |
| 状态 | 设计已冻结，待实现 |

---

## 0. 摘要

插件把 skill / tool 的**逐条开关**换成**按领域整块开关**：

- 设置页里用户自己把一批 skill、一批 tool 归纳成「领域」（例如「飞书」= 32 个 skill）。
- 新会话页在 preset 控件旁并排两个下拉（技能领域 / 工具领域），勾选即整块加载。
- 会话期间，会话头右侧常驻一条领域芯片带（`● 名称 数量`，绿点=已加载、灰点=未加载），点击即切换，右侧实时显示「已加载 x/y 领域 · n skill + m tool」。

**受支持的机制**（全部为公开契约，不打补丁）：

| 面 | 机制 | 性质 |
|---|---|---|
| tool 屏蔽 | `ctx.tools.restrict({ deny })`（agent scope） | 原生：从 schema、查找、执行三处一致移除 |
| tool 兜底deny | `ctx.tools.guard()`（agent scope，同步） | 原生：顺序无关的单调拒绝 |
| skill 从模型目录移除 | 在 **agent scope** 注册一个「遮罩 provider」，把被关领域的 skill 重投为 `modelInvocable:false` | 原生：注册表「就近层覆盖同名」语义 |
| skill 执行兜底 | `tools.guard('skill')` 按名拒绝 | 原生 |
| 全部 skill 关闭 | 额外 `restrict({ deny: ['skill'] })` | 原生（顺带省掉目录消息） |

唯一的“技巧”是 skill 遮罩 provider：它借用注册表的层级覆盖（`global → scope 链，最近的层赢同名`），把一个已有 skill 重新投递成“用户可调、模型不可调”，从而让 `dsh-tool-skill` 的目录自然不含它，同时 `/name` 手动调用仍然可用。§4.5.2 给出验证路径与降级方案。

---

## 1. 目标与非目标

### 目标
1. 领域 CRUD（设置页）：名称、图标、说明、新会话默认、成员多选（skill / tool 两页）。
2. 新会话两个领域下拉，与 preset 控件同排。
3. 会话头领域芯片带：绿/灰点由**实际生效集合**派生，而不是开关状态。
4. 切换只影响本会话，下一轮组提示词时生效；运行中的调用不中断。
5. 未归入任何领域的项维持原有逐条开关行为（零迁移成本）。
6. 全部关闭时给出可量化的上下文节省。

### 非目标
- 不替代 `skills/list` 与现有 skill 管理页；领域只做归纳。
- 不做「按 token 预算自动选域」的智能推荐（v2 议题）。
- 不写会话事件、不改 profile patch、不 monkey patch 任何 Harness 内部方法。

---

## 2. 数据模型

```ts
// 一个领域
interface Domain {
  id: string                  // 稳定 id（nanoid），改名不改 id
  name: string                // 下拉/芯片显示名，<= 12 字符建议
  icon?: string               // emoji 或内置图标名
  description?: string
  members: Member[]
  defaultOn: boolean          // 新会话默认加载
  order: number
  /** 只影响显示：mixed 时芯片里分别列 skill / tool */
  kind: 'skill' | 'tool' | 'mixed'
}

interface Member {
  type: 'skill' | 'tool'
  name: string                // skill: kebab-case 名；tool: 线上 wire 名
  /** 仅用于设置页分组展示与失效提示，不参与解算 */
  source?: string             // skill: provider；tool: 归属猜测（见 §4.3.2）
}

// 持久化文档
interface StoreDocument {
  version: 1
  domains: Domain[]
  /** 会话级覆盖；key = SessionId */
  sessions: Record<string, { skills: string[]; tools: string[]; at: number }>
}
```

**解算口径**

```
loadedDomains(session) = session.skills ?? domains.filter(d => d.defaultOn && d.kind !== 'tool')
loadedTools(session)   = session.tools  ?? domains.filter(d => d.defaultOn && d.kind !== 'skill')

requestedSkills = ∪ members(skill) of loadedDomains,  沿用原单开关的项不动
requestedTools  = ∪ members(tool) of loadedTools

effectiveSkills = requestedSkills ∩ liveSkillCatalog
effectiveTools  = requestedTools  ∩ liveToolCatalog
missing         = requested − effective          // 设置页标红 / 芯片角标
```

**冲突规则**：同一 skill 落在多个领域，任一领域加载即加载（并集）；删除领域不影响成员本体，只影响引用。

---

## 3. 包结构

```
dsh-context-domains/
├─ package.json          # dsh.bundle.patch + dsh.client
├─ cordis.patch.yml      # 一行 insert
├─ index.js              # Host 入口（apply）
├─ lib/
│  ├─ config.js          # schemastery Config
│  ├─ store.js           # 原子 JSON 持久化 + 变更广播
│  ├─ catalog.js         # skill / tool 发现与归属
│  ├─ resolve.js         # 领域 → 请求集合 → 生效集合
│  ├─ apply.js           # restrict / guard / 遮罩 provider 的施加与撤销
│  ├─ http.js            # /context-domains/api/* 路由 + 信任栅栏
│  └─ catalog-cache.js   # 目录缓存与失效（skills/change、tools/change、preset 切换）
├─ client.js             # Client 入口（window.__ModuleLoader__）
├─ client/               # 客户端源码（同 client.js 内联或拆文件后拼接，见 §5.6）
│  ├─ parts/strip.js     # 芯片带
│  ├─ parts/picker.js    # 两个下拉
│  ├─ parts/settings.js  # 设置页
│  └─ parts/styles.js    # 样式（token，运行时注入 <style data-plugin-css>）
├─ locale/{en,zh,...}.json
└─ icon.svg
```

`package.json`：

```json
{
  "name": "@local/dsh-context-domains",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["index.js", "lib/**", "client.js", "cordis.patch.yml", "locale/*.json", "icon.svg"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-settings"
      ]
    }
  }
}
```

`cordis.patch.yml`：

```yaml
- insert:
    - id: context-domains
      name: '@local/dsh-context-domains'
      config:
        barPlacement: header      # header | dock | off
        skillGate: shadow         # shadow | coarse | off
        protectedTools: [present]
```

依赖说明：`@deepseek-ai/*` 由 dsh 安装解析，bundle 不声明这些依赖；本插件除 Node 内置模块外**不引入任何第三方依赖**（理由见 §4.2）。

---

## 4. Host 设计

### 4.1 入口与 Config

```js
// index.js
export const name = 'context-domains'
export const inject = ['webServer', 'connection']   // 路由必需
export { Config } from './lib/config.js'
import { applyDomains } from './lib/apply.js'

export function apply(ctx, config) {
  ctx.inject(['tools', 'agents'], toolsCtx => applyDomains(toolsCtx, config))
  // skills 可选：没有它时 skill 域退化为 off（见 §7 降级矩阵）
}
```

`lib/config.js`（schemastery，字段全部 `.volatile()` 之外的可持久化项）：

```js
import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  barPlacement: z.union([z.const('header'), z.const('dock'), z.const('off')]).default('header'),
  skillGate: z.union([z.const('shadow'), z.const('coarse'), z.const('off')]).default('shadow'),
  protectedTools: z.array(z.string()).default(['present']),   // 永不被领域关掉的工具
  allowEmptyToolSet: z.boolean().default(false),              // 允许把工具全关（默认留 bash 等核心）
  tokenEstimate: z.union([z.const('chars'), z.const('off')]).default('chars'),
})
```

设置页写入领域数据**不走 Config**（Config 是部署者可调的旋钮，领域是用户数据，体量大且频繁变更）。Config 变更会重启插件，领域变更不会。

### 4.2 持久化

选型：**插件自有 JSON 文件**，`$DSH_HOME/context-domains/state.json`（`DSH_HOME` 缺失时 `~/.dsh`）。

理由：
- `ctx.storageDomain` 需要引入 `zod` 与 `@deepseek-ai/dsh-storage-domain` 的 spec，给一个纯手写 bundle 增加两条解析风险；领域数据是单文档、低频写，不需要 KV 表与变更事件。
- 与既有第三方插件（`dsh-file-activity` 自己的 JSON Lines 存储）一致，属架构允许的“插件自有数据”。
- 若将来体积变大，可平滑迁移到 `storageDomain`（`StoreDocument.version` 已留位）。

写入协议（`lib/store.js`）：

```
read:  fs.readFile -> JSON.parse -> 校验 version/shape -> 失败则备份为 state.json.bad-<ts> 并回落空文档
write: 串行队列；临时文件 <file>.tmp-<pid>-<seq> 写入 -> fsync? 不 fsync（与 dsh-atomic-write 同口径）
       -> fs.rename 原子替换 -> 广播 'changed'
并发: 单进程内串行；跨进程加 <file>.lock（O_EXCL，5s 过期）避免两个 dsh 实例互相覆盖
损坏: 任何写失败只 reject 本次调用，内存不变（读内存、写磁盘同序）
```

会话记录清理：`session/disposed` 时保留记录（fork/resume 需要），但每 200 次写入或 24h 触发一次修剪：删掉 `at` 早于 30 天且 `domains` 已不存在的会话条目。

### 4.3 目录发现

#### 4.3.1 Skill

```js
// lib/catalog.js
export async function readSkills(ctx, { scope, cwd, signal }) {
  if (!ctx.get('skills')) return { items: [], complete: false, available: false }
  const snap = await ctx.skills.snapshot({ scope, cwd, signal })
  return {
    complete: snap.complete,
    available: true,
    items: snap.skills.map(s => ({
      name: s.name,
      description: s.description,
      whenToUse: s.whenToUse,
      source: s.provider,                       // 真实归属：skill-filesystem / office / bundle 名
      provider: s.provider,
      origin: s.source,                         // project-dsh / user-dsh / bundled / runtime…
      modelInvocable: s.invocation.modelInvocable,
      userInvocable: s.invocation.userInvocable,
      path: s.path,
      costChars: s.description.length + (s.whenToUse?.length ?? 0),
    })),
  }
}
```

- **分层已合并**：`global + scope 链`，最近层赢同名 → 我们不需要自己合并多来源。
- `snapshot.complete === false` 表示某 provider 未就绪：结果**不进缓存**，沿用上次 good 值，并在设置页显示「发现不完整」。
- 设置页（无会话）用 `readSkills(ctx, { cwd: defaultDirectory })`：只读全局层 + 不激活任何 agent；需要看 preset 层时用 `agentPresets.list()` 逐个 `acquireScope(id)` 再读一次，UI 标注「仅 <preset> 可见」。
- 冷会话（新会话页）**不激活 agent**：下拉走 HTTP API，Host 用同一函数并带 `scope: presetScopeKey`。

#### 4.3.2 Tool

```js
export function readTools(ctx, { scope }) {
  if (!ctx.get('tools')) return { items: [], available: false }
  return {
    available: true,
    items: ctx.tools.definitions(scope).map(d => ({
      name: d.name,
      description: d.description,
      costChars: JSON.stringify(d.parameters).length + d.description.length,
      owner: attribution.get(d.name),           // 见下
    })),
  }
}
```

`ToolSchema` **没有 owner 字段**（`name / description / parameters / deferLoading`），归属只有三条路：

1. **按前缀建议**（默认）：`mcp__<server>__*`、`cordis_*`、`terminal_*`、`job_*`、`schedule_*`、`team_*`、`subagent*`、`goal_*`。设置页「新建领域」时把同前缀的候选一次勾好，用户删改后即成事实。
2. **跨 scope 差分**（免费）：在 `definitions(undefined)`（全局）与 `definitions(presetScopeKey)` 之间做差，得到“只属于某 preset 的工具”，设置页显示来源 preset。这能解决「哪个工具是创造者模式带的」，不能解决「哪个包带的」。
3. **注册时记账**（可选，默认关闭，config `attribution: 'patch'`）：在 `apply` 中包装一次 `ctx.tools.register`，把 `name → 调用方 fiber 的包名` 记进内存 Map，`dispose` 时还原原方法。包装是**单点、可还原、失败即弃用**的，仅用于改善设置页分组文案；任何异常都不影响开关逻辑。归入 v1.1，不阻塞 v1。

缓存与失效（`lib/catalog-cache.js`）：

| 事件 | 动作 |
|---|---|
| `skills/change` | 清 skills 缓存 |
| `tools/change` | 清 tools 缓存（**注意**：我们自己调 `restrict` 也会触发，需要 `applying` 标志位去抖，否则自激） |
| `plugin-manager/changed` | 全清 |
| `agent-preset/selected` | 清该 session 的 scope 视图 |
| `connection/reset`（Client 侧） | 客户端丢弃本地快照重新拉取 |

TTL：全局目录 5s 内复用；带 `scope` 的视图按 `scopeKey` 分桶，不跨会话复用。

### 4.4 生效解算

`lib/resolve.js` 是纯函数，可单测：

```js
export function resolveSelection(domains, sessionState) {
  const skillDomains = sessionState?.skills ?? domains.filter(d => d.defaultOn && d.kind !== 'tool').map(d => d.id)
  const toolDomains  = sessionState?.tools  ?? domains.filter(d => d.defaultOn && d.kind !== 'skill').map(d => d.id)
  const byId = new Map(domains.map(d => [d.id, d]))
  const pick = (ids, type) => {
    const out = new Set()
    for (const id of ids) for (const m of byId.get(id)?.members ?? []) if (m.type === type) out.add(m.name)
    return [...out].sort()
  }
  return { loadedDomains: skillDomains, loadedToolDomains: toolDomains,
           skills: pick(skillDomains, 'skill'), tools: pick(toolDomains, 'tool') }
}

export function planToolRestriction({ allToolNames, requestedTools, protectedTools, allowEmptyToolSet }) {
  const live = new Set(allToolNames)
  let deny = allToolNames.filter(n => !requestedTools.includes(n))   // 语义：领域是白名单
  deny = deny.filter(n => !protectedTools.includes(n))
  if (!allowEmptyToolSet && deny.length === allToolNames.length) {
    // 至少保留一个可执行工具，否则会话会被锁死
    const keep = allToolNames.filter(n => protectedTools.includes(n)).slice(0, 1)
    deny = deny.filter(n => !keep.includes(n))
  }
  return { deny: deny.filter(n => live.has(n)) }                     // restrict 遇未知名会抛错，先过滤
}
```

> `restrict` 的语义坑：`deny` 里出现未注册名会整调用失败，`allow` 与 `deny` 同时给会取交集后再匹配。因此本项目**只用 deny 白名单差集**，并且每次施加前用当次 `definitions()` 过滤。

### 4.5 施加

#### 4.5.1 生命周期

```js
// lib/apply.js（核心）
export function applyDomains(ctx, config) {
  const store = openStore(ctx)                    // §4.2
  const registry = new Map()                      // sessionId -> { agent, dispose, restriction }

  ctx.on('agent/created', ({ agent }) => {
    const entry = { agent, dispose: undefined, restriction: undefined, skillMask: undefined }
    registry.set(agent.id, entry)
    // 所有 agent 级注册都落在 agent.ctx，随 agent 释放一起消失
    const undo = agent.ctx.effect(() => {
      applyToAgent(ctx, agent, entry, config, store)
      return () => { revoke(entry) }
    })
    entry.dispose = undo
    // 插件自己的 effect 也持有它：卸载插件时不依赖 agent.ctx 是否还在
    ctx.effect(() => () => { undo?.(); registry.delete(agent.id) })
  })

  ctx.on('agent/disposed', ({ agent }) => { revoke(registry.get(agent.id)); registry.delete(agent.id) })

  // 领域/会话选择变更 → 重算 + 重新施加
  store.on('changed', () => { for (const [, e] of registry) reapply(ctx, e, config, store) })

  registerHttp(ctx, { store, config })            // §4.7
}
```

`applyToAgent` 三步，顺序固定：

1. 读目录（带 scope）→ `resolveSelection` → `planToolRestriction`
2. **skill 遮罩**：先注册（目录消息在下一步组装，越早越好）
3. **tool restrict**：`agent.ctx.tools.restrict({ deny })`；`deny` 为空则跳过（空过滤器会抛错）

`reapply` 是「撤销 + 重建」：先 dispose 上一次的 restrict 与 provider，再用新集合注册；不做增量合并（restrict 之间取交，增量会越限制越死）。

#### 4.5.2 Skill 遮罩（关键实现）

事实链（已核对 `dsh-skill` / `dsh-tool-skill` 的实现）：

1. `dsh-tool-skill` 在 `agent/pre-step` 里发布目录，仅当 `ctx.tools.get('skill', agent) === skillTool`；条目来自 `ctx.skills.snapshot({ scope: agent, cwd })`，再用 `isModelInvocable` 过滤。
2. `ctx.skills` 合并顺序：`global → scope 链（远→近）`，`merged.set(name, ...)` 后者覆盖前者 → **agent scope 里的同名条目赢**。
3. `skills.registerProvider(create)` 注册进调用方 ctx 所属的层；`agent.ctx` 即 agent scope。

于是遮罩 provider：

```js
// 注册在 agent.ctx —— 只影响这个会话
const control = { invalidate: () => {} }
agent.ctx.skills.registerProvider((c) => {
  control.invalidate = c.invalidate
  return {
    name: 'context-domains-mask',
    async list(opts) {                       // opts: { cwd, signal }
      if (disabled.size === 0) return []
      const base = await ctx.skills.list({ cwd: opts.cwd, signal: opts.signal })  // 无 scope = 只看 global 层
      return base
        .filter(s => disabled.has(s.name))
        .map(s => ({
          ...s,
          rank: 900,                          // 同层排序；跨层覆盖与 rank 无关
          locator: { name: s.name },
          invocation: { modelInvocable: false, userInvocable: s.invocation.userInvocable },
        }))
    },
    async get(candidate, opts) {
      const real = await ctx.skills.get(candidate.name, { cwd: opts.cwd, signal: opts.signal })
      if (!real) return undefined
      return { ...real, invocation: { ...real.invocation, modelInvocable: false } }
    },
  }
})
```

要点：

- `list/get` 里**不带 scope** 读取，只看 global 层 → 不会读到自己的遮罩，无递归。
- 遮罩只改 `modelInvocable`：模型目录里消失（省 token），用户 `/name` 仍可调用（`isUserInvocable` 保持原值），符合“关领域=不给模型用，不是不让我用”。
- `control.invalidate()` 在切换时调用，让注册表丢弃快照缓存。
- 目录 digest 变化会让 `dsh-tool-skill` 发布一条**替换目录**消息 —— 正好就是「下一轮生效」。

**验证关卡**（必须实现期实测，不达标就降级）：

| 检查 | 期望 | 不达标的降级 |
|---|---|---|
| `snapshot({scope: agent})` 里被遮罩的名字 `modelInvocable === false` | ✔ | `skillGate: 'coarse'` |
| 目录消息不再列出被遮罩 skill（看会话里的「系统提示词 / 工具定义」行） | ✔ | 同上 |
| `/被遮罩名` 仍能加载真实正文 | ✔ | 保留（只影响体验） |
| 关闭 32 个飞书 skill 后，目录消息长度显著下降 | ✔ | 同上 |

**`skillGate: 'coarse'`**：完全不遮罩；只在“技能域一个都没开”时 `restrict({ deny: ['skill'] })`（工具与整份目录一起消失，真省），部分关闭时仅用 guard 拦调用、不省 token，UI 上该域芯片显示「省不了 token」的黄色标记。

#### 4.5.3 兜底 guard

```js
agent.ctx.tools.guard((exec) => {
  if (exec.name === 'skill') {
    const name = typeof exec.arguments?.name === 'string' ? exec.arguments.name : undefined
    if (name && disabled.has(name)) return `领域未加载：skill "${name}" 不可用`
  }
  if (disabledTools.has(exec.name)) return `领域未加载：工具 "${exec.name}" 不可用`
  return undefined
})
```

guard 是同步、顺序无关的单调拒绝，用来兜住两条 restrict 管不到的缝：**preset scoped 注册的工具**（restrict 只作用于 global 工具）和**模型凭记忆调用的旧名**。

### 4.6 事件清单（Host）

| 事件 | 用途 |
|---|---|
| `agent/created` | 建立每会话条目，取 `agent.ctx` |
| `agent/disposed` | 撤销条目（双保险之一） |
| `tools/change` / `skills/change` | 清缓存；若生效集合变化则 reapply（带 `applying` 去抖） |
| `plugin-manager/changed` | 清全部缓存 |
| `agent-preset/selected` | 清该会话 scope 视图（目录属于 preset） |
| `session/disposed` | 会话状态修剪（延迟，不立即删） |

### 4.7 HTTP API（Client ↔ Host）

手写 bundle 没有 typert 代码生成，因此走 **`ctx.webServer.register` 前缀路由 + 同源 fetch**（`dsh-file-activity` / `horon-web` 同款）。全部端点前置信任栅栏：

```js
const rejection = ctx.connection.requestRejection(req)   // 401 | 403 | undefined
if (rejection !== undefined) { res.statusCode = rejection; res.end(); return }
```

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/context-domains/api/snapshot?sessionId=` | 一次拿全：domains、selection、catalog（skills/tools）、effective、missing、cost |
| POST | `/context-domains/api/toggle` | `{ sessionId, kind:'skill'|'tool', domainId, enabled }` → 写会话覆盖 + reapply |
| POST | `/context-domains/api/defaults` | 改 `defaultOn`（设置页用） |
| POST | `/context-domains/api/domains` | 领域 CRUD（`op:'create'|'update'|'delete'|'reorder'`） |
| GET | `/context-domains/api/catalog` | 设置页全量目录（含 preset 差分） |
| GET | `/context-domains/api/health` | `{ version, skillGate, skillGateVerified, storePath }` |

响应统一 `{ ok:true, value } | { ok:false, error:{ code, message } }`，`cache-control: no-store`。请求体上限 256 KiB（领域成员最多几千条）。写操作按 `sessionId` 串行（`Map<sessionId, Promise>` 队列），避免连点产生交错的 restrict。

**快照示例**

```json
{
  "ok": true,
  "value": {
    "version": 1,
    "domains": [
      { "id": "d_dev", "name": "日常编码", "icon": "🛠", "kind": "skill", "defaultOn": true,
        "members": [{ "type": "skill", "name": "code-review", "source": "dsh-agent-preset" }] }
    ],
    "session": { "skills": ["d_dev"], "tools": ["d_fs"] },
    "catalog": {
      "skills": [{ "name": "code-review", "source": "dsh-agent-preset", "modelInvocable": true }],
      "tools": [{ "name": "bash", "owner": "dsh-tool-bash" }]
    },
    "effective": { "skills": ["code-review"], "tools": ["bash", "read"] },
    "missing": { "skills": [], "tools": ["team_task_list"] },
    "cost": { "skillsChars": 1840, "toolsChars": 9602, "savedChars": 4310 }
  }
}
```

---

## 5. Client 设计

### 5.1 挂载点（已核对 live 槽位）

| 界面 | 槽位 | kind / scope | 用途原文 |
|---|---|---|---|
| 新会话两个下拉 | `conversation.hero.options` | list / session | 「New Session 行里 workspace 与 preset 控件之后、右对齐的紧凑选项；有 Session 才渲染」 |
| 会话头芯片带 | `conversation.session.header.utilities` | list / session | 「会话头右对齐的 utilities，按 order 升序」 |
| 设置页 | `settings.section` | list / root | 「每个 list 条目一页设置」；ownerProps `{ close }` |
| （可选）整行芯片带 | `conversation.input.dock` | list / session | 「composer 卡片上方的整行条目」——底部，仅当 `barPlacement: 'dock'` |

**为什么不是“会话头下方一条整行横带”**：当前 DSH 没有“transcript 之上的整行插槽”。`conversation.session`、`conversation.chat.flow` 都是 `single` 且已被官方占用（`replaceRisk: shadows-shipped-ui`，替换即接管官方 UI）。所以 v1 的“顶栏”落在**会话头右侧**（固定、不随滚动），交互等价：所有领域芯片 + 悬停成员面板 + 右侧汇总；`barPlacement: 'dock'` 提供整行方案（位于 composer 上方）。若将来上游给出 transcript 之前的 list 槽位，只需加一个注册点，不改数据层。

注册形态：

```js
ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
  name: 'conversation.session.header.utilities',
  id: 'context-domains.strip',
  order: 20,                       // 排在 open-in-app(-10)、schedule(-5)、session-log(0) 之后
  locale: NS,
}, DomainStrip))

ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
  name: 'conversation.hero.options', id: 'context-domains.picker', order: 10, locale: NS,
}, DomainPicker))
```

### 5.2 组件树

```
<DomainsRuntime>                      // 每 session 一份快照 + 乐观更新 + 串行化写
 ├─ <DomainPicker kind="skill" />     // hero.options：一个小胶囊 + 下拉（多选）
 ├─ <DomainPicker kind="tool" />
 ├─ <DomainStrip />                   // header.utilities：芯片带 + 溢出菜单 + 汇总
 │   ├─ <DomainChip domain state />   // ● 名称 n ；hover → <MemberPopover>
 │   └─ <MemberPopover />             // 成员列表（每组带 switch）、全部/全不选、管理领域
 └─ <DomainsSettings />               // settings.section：左列表 + 右编辑
     ├─ <DomainList />               // 拖拽排序、默认徽标、未归入领域行
     ├─ <DomainEditor />             // 名称/图标/说明/默认加载
     └─ <MemberGrid tab="skill|tool"/> // 搜索、全选、反向、来源标注、失效标红
```

### 5.3 数据流

- `DomainsRuntime` 用 `sessionId`（标准 prop）挂载：`GET snapshot` → 订阅 `visibilitychange` 与自身写操作后重取；写操作**乐观更新**芯片点色，失败回滚 + Toast。
- 芯片点色只认 `value.effective`，不认 `selection`（避免“开关开着其实没挂上”）。
- 写串行：同一 session 的 toggle 请求排队（客户端也排队，减少 Host 端竞争）。
- 图标/文案全部走 `ctx.locale.register(NS, { zh, en })` + `locale.bind(NS)`；`label` 用 thunk（`() => t('sectionTitle')`）以便切语言时重投影。

### 5.4 样式

- 只用 `--dsw-alias-*` token（`bg-layer-1/2`、`border-l1/l2`、`label-primary/secondary/tertiary`、`state-success-primary`、`state-idle-primary`、`brand-primary`）。
- 芯片：`height:22px; padding:0 7px; border-radius:999px; font-size:11px; gap:5px`；绿点 `6px`（`state-success-primary`）+ `box-shadow: 0 0 0 3px color-mix(...)`；灰点用 `state-idle-primary`。
- 类名前缀 `cdx-`，样式以 `<style data-plugin-css="context-domains/…">` 注入（重复挂载判重，与 `dsh-context` 同法）。
- 溢出：芯片带 `max-width` + 横向滚动（`scrollbar-width:none`），右侧汇总固定不滚。

### 5.5 交互与可达性

- 芯片 = `<button role="switch" aria-checked>`；`Space`/`Enter` 切换；`←/→` 在芯片间移动。
- 下拉 = 受控 popover，`Escape` 关闭并归还焦点；点击外部关闭。
- 悬停成员面板 300ms 延迟打开、离开 150ms 关闭；面板内可逐条切换（写 `sessions[].members` 排除集，见 §5.7）。
- `prefers-reduced-motion` 下取消过渡。

### 5.6 Client 模块格式

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-context-domains',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    // …组件
    return {
      name: 'context-domains',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'context-domains: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
          { name: 'conversation.session.header.utilities', id: 'context-domains.strip', order: 20, locale: NS },
          DomainStrip))
        // …其余注册
      },
    }
  },
})
```

约束：factory 无副作用；样式/定时器/监听器都在 `apply` 里用 `ctx.effect` 注册并返回清理；**不 import 任何 Harness Client 包**（只 `require('react')`），按钮/开关/弹层照抄宿主样式自写。

### 5.7 逐条覆盖（v1 实现，`sessions[].excluded`）

领域是批量开关，但总有人要「整块开、只关其中一个」。数据加一层：`sessions[id].excluded = { skills: [], tools: [] }`，解算时从并集里减去：

```
effective = (∪ loadedDomains.members − excluded) ∩ live
```

UI：成员面板里每行一个 switch；关掉的成员进 `excluded`。这样“整块开 + 精确关”不打架，也不需要用户回头拆领域。

---

## 6. 设置页

一页两块（`settings.section`, id `context-domains`, order 35）：

1. **左列 200px · 领域清单**：48px 表头（`n 个领域` + `＋ 新建` + 紧邻的 `✦` AI 图标按钮）、每行 `<名称> / <总数> 项 [默认] / <技能>/<工具>`，选中行左侧 2px accent 条，底栏「未归入领域 · n skill · m tool」。
2. **右列 · 编辑器**：`名称` 单行、`说明` 两行 textarea（label 在上）、`默认启用` 真开关行（上下 1px 分隔线）、成员区、底部 `删除领域`（危险色描边）。
3. **成员区**：`搜索（右端内嵌 已选 n 项）→ 一行 [全部|技能|工具] + [显示：全部成员|已选|未选] → 260px 双列成员表`。类型页签只决定看哪一类；显示开关只筛视图，不改成员（勾选框才是加/删）。列表扁平、技能在前工具在后，类型由页签承担，空态给「清除筛选」。
4. **AI 归类弹窗**：`✦` 打开 520px 居中卡片，含说明、等宽 prompt（**点一下就复制**，hover 出「点击复制」、复制后变成功色的「已复制」）与底部 `复制 prompt`。prompt 不常驻右栏——它是低频操作，长期占用编辑区只会挤掉真正天天用的成员列表。归类是判断活，交给 AI 比自己一条条勾更省事，也比插件内置启发式更准（内置只按前缀建议，见 §4.3）。
5. 视觉稿：OpenDesign 项目 `cdx-settings-v2`（`index.html`，深/浅两套 `--cdx-*` 变量）。插件里颜色一律换成宿主 token（`--dsw-alias-*`），间距 8px 栅格、圆角 6/8/10/14、字号 11/12/13/15。
6. 页脚提示：「保存后：新会话立即生效；已有会话在下一轮生效（进行中的调用不受影响）」。
7. 首次进入空态：扫描现有 skill 的 `provider` 与 tool 前缀，给出 3~5 个建议领域（飞书 / 记忆 / 逆向 / 办公…），点一下即创建。这是解决“从零建领域太累”的关键一步。

设置页数据走 `GET /context-domains/api/catalog` + `POST /domains`；保存后广播，所有已开会话的芯片带随之刷新。

`ctx.settings.configure({ auto: false })`：不要为本插件自动生成 Config 表单（领域不是 Config）。

---

## 7. 降级矩阵

| 缺失/失败 | 行为 | 用户可见 |
|---|---|---|
| 无 `ctx.skills` | skill 域整体禁用，只保留 tool 域 | 设置页顶部提示「本部署没有 skill 服务」 |
| 遮罩验证不通过 | 自动降级 `skillGate: 'coarse'` | 芯片带出现琥珀点 + 提示「该 Harness 版本无法按域过滤 skill 目录」 |
| `snapshot.complete === false` | 不缓存，沿用上次 good；成员标「发现中」 | 设置页横幅「skill 发现不完整」 |
| `restrict` 抛错（未知名/越权） | 过滤后重试一次；仍失败则该会话只用 guard（不省 token） | Toast「工具限制未生效，已降级为调用拦截」 |
| 状态文件损坏/不可写 | 备份坏文件、内存态继续跑 | Toast「领域配置无法保存：<原因>」 |
| HTTP 栅栏拒绝 | 客户端显示空态 + 重试按钮 | 「需要登录」 |
| 领域引用了已卸载成员 | 忽略并计入 `missing` | 设置页标红；芯片角标 `!n` |

---

## 8. 版本与兼容

- `StoreDocument.version = 1`；迁移函数表 `migrations[from] → to`，未知高版本只读不写并提示升级插件。
- 依赖的公开契约（`tools.restrict/definitions/guard`、`skills.registerProvider/snapshot`、槽位名）在 `lib/contract-check.js` 启动时做形状自检：方法存在 + 参数个数，缺一项就走降级矩阵，不抛到用户面前。
- 不读、不写别的插件的 DOM / 样式 / 内部模块。

---

## 9. 测试与验收

**单元**（node:test，不依赖 dsh）

| 用例 | 断言 |
|---|---|
| `resolveSelection` 并集/去重/默认域 | 结果集合稳定、排序稳定 |
| `planToolRestriction` | 未知名被过滤、protected 永不进 deny、全关时保留核心工具 |
| 存储 | 并发 200 次写后文件合法；坏 JSON 触发备份并回落空文档 |
| 遮罩候选 | `disabled` 为空返回 `[]`；`modelInvocable` 被改写、`userInvocable` 保持 |

**集成**（临时 profile，`DSH_HOME=$(mktemp -d)`）

1. 装 bundle → `list_plugins` 观察到 `context-domains` 行 `applied`。
2. 开两个会话 A/B：A 关「逆向」域，B 保持默认 → B 的目录仍含该域 skill，A 不含。
3. 关掉全部技能域 → 会话里 `skill` 工具消失、目录消息消失。
4. 设置页删掉一个域 → 两处界面同步，会话 effective 回落默认。
5. 插件卸载 → 所有限制撤销，工具集恢复。

**人工核对清单**

- [ ] 新会话页两个下拉与 preset 同排、文案本地化、无 JS 报错
- [ ] 芯片带在深/浅两套主题下都用 token 呈现，无硬编码色
- [ ] 键盘可完成一次切换
- [ ] 切换后下一轮：目录消息替换为该域的集合（看「系统提示词 / 工具定义」）
- [ ] 关掉飞书域后 `savedChars` 与目测的目录长度变化一致

---

## 10. 里程碑

| 阶段 | 内容 | 完成判据 |
|---|---|---|
| M1 | Host：Config、store、catalog、resolve、tool restrict、HTTP snapshot/toggle | curl 拿到正确 snapshot；切换后 `definitions(agent)` 变化 |
| M2 | Client：`DomainsRuntime` + hero 两个下拉 + 芯片带 | 页面上可见、可切、点色随 effective 变 |
| M3 | 设置页（列表/编辑/成员网格/空态建议） | 建域 → 新会话默认生效 |
| M4 | Skill 遮罩 + guard + 降级矩阵 | 关飞书域后目录消息显著变短；`/名` 仍可用 |
| M5 | 打磨：locale 全量、图标、键盘、逐条 excluded、成本估算、测试 | 验收清单全绿 |

M1~M2 是可交付的最小可用版本；M4 才有真正的 token 收益。

---

## 11. 风险与未决

1. **遮罩依赖“就近层覆盖同名”语义**（`dsh-skill` 的 `collectFresh` 合并顺序）。若上游改成“全局优先”或缓存不失效，遮罩静默失效 → 必须有 §4.5.2 的验证关卡，并且验证失败要显式降级，不能假装省了 token。
2. **`tools.restrict` 只作用于 global 工具**：preset 内注册的工具关不掉（只能 guard 拦执行，schema 仍占上下文）。设计上接受，并在设置页把这类工具标「由预设提供，不可按域关闭」。
3. **每次切换都会引起目录消息替换**，会在会话里留下一条替换记录；频率极高时可能干扰模型对历史的判断 → 客户端对同一域 500ms 内合并，Host 端对同一 session 串行。
4. **归属无法从 API 取得**：tool 前缀归组是启发式；`attribution: 'patch'` 是可选增强，不做默认。
5. **每会话 head 空间有限**：`barPlacement: 'dock'` 是整行方案的后备；若上游新增 transcript 前插槽，直接迁移。
6. **多实例**：同一 `DSH_HOME` 下两个 dsh 进程共享状态文件 → 文件锁 + 只做整文档写；不接受跨进程实时同步（`domain/changed` 类事件不可用）。

---

## 附：一次完整调用的时序

```
用户点芯片「飞书」
  └─ Client: 乐观把点变绿，写队列
      └─ POST /context-domains/api/toggle {sessionId, kind:'skill', domainId:'d_fs', enabled:true}
          ├─ fence: requestRejection(req)
          ├─ store.setSessionSelection()  → 原子写盘 → 'changed'
          ├─ reapply(agent)
          │   ├─ catalog: readSkills({scope:agent, cwd})   （缓存命中）
          │   ├─ resolveSelection → requested.skills 增加 32 个
          │   ├─ revoke: 上次 restrict / 遮罩 provider
          │   ├─ mask provider: disabled 集合移除这 32 个（其实它们本来没被遮罩，改为不遮罩）
          │   └─ tools.restrict({deny: 差集 − protected})
          └─ 200 { ok, value: snapshot }
      └─ Client 用返回的 effective 校正点色与计数
下一轮模型请求
  └─ dsh-tool-skill: snapshot → 目录 digest 变化 → 发布替换目录（含飞书 32 条）
```
## 12. 实现记录（2026-11-09，dsh-dev 容器实测）

这一节记录「设计稿 → 跑通」之间被实测推翻或加固的三处，后续维护以本节为准。

### 12.1 遮罩不能走 provider，走 agent scope 的 runtime 注册

设计稿原本用 `skills.registerProvider()` 在 agent scope 注册一个「重投成 modelInvocable:false」的 provider。实测不可行，原因有二：

1. provider 的 `list()` 若要看到「会话视角」的 skill，必须带 `scope` 读注册表 —— 那会再次进入自己（无限递归），只能靠重入标志，还会污染注册表的收集缓存。
2. 不带 `scope` 读只命中**全局层**；本机 dsh 0.2.2-rc.1 里 skill 提供方挂在 **preset 层**（cordis preset 的 `skill-filesystem`），全局层是 0 条 → 遮罩候选恒为空。实测 `/probe` 返回 `providerListed: 0`。

改成：**在 agent scope 用同名 runtime 注册重投**。注册表按 `global → scope 链（远→近）` 合并、最近层赢同名，`skills.register()` 写在 agent 层正好盖住 preset/全局的原条目；注册表内部走 `scopeOf(this.ctx)`，实测 `registerVisible: true`（agent scope 可见）、`registerVisibleGlobal: false`（不污染全局）。

代价：遮罩时要先把真实定义取出来（`skills.get(name, { scope: agent })`），也就是**会读一次被关掉那些 skill 的正文**。只影响 I/O，不进上下文；换来 `/name` 手动调用仍然拿到真实正文。

### 12.2 重算必须按会话串行

领域变更（`store.onChange`）、HTTP 切换、CLI/设置页写入会并发触发重算。交错执行时后一次 `install()` 会**覆盖** `entry.disposers`，前一次的 `restrict` disposer 丢失 → 限制永远撤不掉（实测：关掉域后工具消失，再打开也回不来）。

修法：每个 entry 一条 `queue`，`revoke → 读目录 → 规划 → 注册` 全程串行；`detach` 也排进队列。

### 12.3 `restrict` 在本 build 对 preset 挂的工具同样生效

设计稿按文档假设「restrict 只管全局工具，preset 工具关不掉」。实测相反：`agent.ctx.tools.restrict({ deny })` 能让预设挂的 `workflow` / `subagent_fork` / `create_goal` 从 `definitions(agent)` 里消失（34 → 27 个工具），撤销后恢复。`guard` 仍保留作为兜底（preset scoped 注册与模型凭记忆调旧名）。

### 12.4 端到端证据（容器内 dsh 0.2.2-rc.1）

| 检查 | 结果 |
|---|---|
| 插件加载 | `/context-domains/api/health` 200，`stateFile=/data/dsh/context-domains/state.json` |
| 目录发现 | 36 个 tool（跨 6 个 preset）、5 个 skill，全部带 `scopes` 归属 |
| 新会话下拉 | `conversation.hero.options` 渲染「技能领域 1/2」「工具领域 0/3」，两个下拉互斥 |
| 会话头芯片带 | `conversation.session.header.utilities` 渲染 5 枚芯片 + 「已加载 2/5 · 4 skill + 29 tool」 |
| 工具限制 | 关掉「工作流与子智能体」域：29 → 26 个工具；再打开回 29 |
| skill 遮罩 | 关掉技能域后 `maskProbe` 四条全部 `modelInvocable:false`；`effective.skills` 为空 |
| 目录消息 | 域关闭时**整条不发布**（0 字节）；域打开时发布 1920 字符的 `<available_skills>`（4 条） |
| 设置页 | `settings.section` 出现「上下文领域」，5 个领域 + 成员多选 + 建域建议可用 |
| 单元 / 集成 | `node --test test/` 13 项全绿（8 纯函数 + 5 HTTP） |
| 端到端脚本 | `test/e2e/mask.mjs` 通过 |

### 12.5 容器内的安装与验证

```bash
docker exec dsh-dev dsh plugin --profile web add link:/workspace/dsh-context-domains
docker compose restart dsh
curl -s -b <cookie> http://127.0.0.1:3080/context-domains/api/health
node --test test/                                  # 单元 + HTTP 集成
node test/e2e/mask.mjs http://127.0.0.1:3080       # 端到端遮罩验证（宿主侧 puppeteer）
```

无构建步骤：Host 与 Client 都是纯 ESM（Client 走 `window.__ModuleLoader__`，只 `require('react')` / `require('react-dom')`），改完重启容器即生效。

---

## 13. v0.2 原型调整：领域控制收到顶部一条带子

原型改动（OpenDesign `dsh-context-domains/index.html`，v0.2）与它对实现的约束：

1. **单一顶部注册点**：新会话与对话共用一条整窗宽横条（左：技能/工具多选入口；中：全部领域芯片；右：汇总 + 会话锁）。不再使用 `conversation.hero.options`（右对齐、与 preset 抢行）与 `conversation.session.header.utilities`（只能挤在标题行右侧）。
2. **横条是整窗宽的**，跨过侧栏 —— 这正是 `shell.overlay` 能做的事：`position: fixed; top: var(--dsh-frame-top-clearance); left: 0; right: 0`，在 click-through 层里自己开 `pointer-events`。它不依赖会话列几何，也不需要读别的插件的 DOM。
3. **下拉与成员浮层 portal 到 body**（`createPortal`），避免被 header / composer 的 overflow 裁切。
4. **黑白双主题**：所有颜色走 `--dsw-alias-*`，芯片的绿/灰点、选中态、弹层阴影各有一组亮暗值；原型右上角可切换验收。

对现有实现的迁移量：删掉 `conversation.hero.options` 与 `conversation.session.header.utilities` 两处注册，改为在 `shell.overlay` 注册一条横条；`DomainsRuntime`、HTTP API、限流/遮罩逻辑全部不动（它们与落点无关）。

---

## 14. v0.3 调整：会话内的领域条 + 领域不分类型

### 14.1 数据模型简化（会影响现有 state.json）

```diff
  Domain {
    id, name, icon, description, defaultOn, order
-   kind: 'skill' | 'tool' | 'mixed'          // 删掉：领域没有类型
    members: { type: 'skill' | 'tool', name, source }[]
  }
- sessions[id] = { skills: string[], tools: string[], excluded: {...} }
+ sessions[id] = { domains: string[], excluded: { skills: string[], tools: string[] } }
```

- 选择语义从「两串领域 id」合并成「一串领域 id」；成员类型仍在 member 上，供加载时分流。
- 迁移：`normalizeDocument` 读旧文档时把 `skills` 与 `tools` 合并去重成 `domains`，写回时丢弃 `kind`；
  `excluded` 保留（成员级覆盖仍然按类型存，因为要按类型施加）。
- HTTP 跟着简化：`POST /toggle { sessionId, domainId, enabled }`（不再有 `kind`）；
  `/snapshot` 的 `domains[].loaded` 变成单值。

### 14.2 加载仍按类型分通道

```
loadedDomains → members
  skill 子集 → agent scope 重投同名 runtime skill（modelInvocable:false）
  tool  子集 → tools.restrict({ deny: 不在集合里的受管 tool }) + tools.guard 兜底
```

**这就是「概念不分类型、实现分类型」**：用户只有一个开关，通道各走各的，互不干扰。
未归入任何领域的成员继续走原来的逐条开关。

### 14.3 条子放在会话里

- 位置：会话头之下、正文之上，只在有会话时渲染（新会话＝空白会话，同一个位置）。
- 内容：只有领域，`● 名称`+点色；点击即开关；悬停出成员面板。
- 落点：DSH 目前没有「transcript 之前」的 additive 槽位。实现取
  `shell.overlay` 固定横条 + 在自己注册的 `conversation.session.header.utilities` 锚点读取顶边，
  左/宽取会话列几何；测量失败时降级为「芯片内联进会话头」，功能不变、观感退一档。
  若上游后续提供会话顶部 list 槽位，替换这一处即可。

### 14.4 需要改的代码点

| 文件 | 改动 |
|---|---|
| `lib/store.js` | `normalizeDomain` 去掉 `kind`；`normalizeSession` 合并 `domains` |
| `lib/resolve.js` | `selectionFor` 返回 `string[]`；`requestedMembers` 按成员类型切两半 |
| `lib/apply.js` | plan 只算一次成员集合，再按类型分给 `restrict` 与 skill 遮罩 |
| `lib/http.js` | `/toggle` 去掉 `kind`；`/snapshot` 的 loaded 单值；`/domains` 计数改为 `N 项（a 技能 / b 工具）` |
| `client.js` | 去掉两个 `DomainPicker` 与 hero 注册；只保留一条 `DomainStrip` |

### 14.5 成员级开关从界面去掉（v0.3.1）

悬停面板与设置页都只显示名字、按 `技能 / 工具` 两段分组，不再有逐条加载开关：

- 理由：成员是用户自己挑进领域的，多一个开关只增加误操作与视觉噪音。
- 影响：`POST /exclude`（会话级成员排除）保留实现但不再暴露入口，作为后续「临时豁免」的预留能力；
  `sessions[].excluded` 仍参与解算（空集时不产生任何效果）。
- 设置页的行内复选框只用于「往领域里加/删成员」，不是加载开关，文案要写清楚。

---

## 15. v0.3 实现记录（容器实测）

### 15.1 两个锚点、一条条子

领域条要同时出现在「新会话」和「已有会话」，而这两态渲染的槽位不同：
新会话只有 `conversation.hero.options`，已有会话才有 `conversation.session.header.utilities`。
做法是**同一个组件注册两处**，组件本身只做两件事：交出 `sessionId`（以及一个测量用的锚点），
然后把真正的条子 `createPortal` 到 body、`position: fixed` 贴在会话头下沿。

`useBarOwnership()` 用模块级互斥令牌保证同一时刻只有一个实例真正画条子，另一个只留 0×0 锚点，
避免两态切换瞬间出现两条。

### 15.2 几何与占位

- 位置：`[data-slot="conversation.session"]` 的父元素给左边缘与宽度；`conversation.session.header`
  给下沿（新会话没有会话头时退回会话列顶边）。
- 占位：条子是 fixed，会盖住正文首行，所以按几何找到会话的滚动容器
  （与会话列同左缘、同宽、`overflow-y:auto`、高 > 300），给它加 `padding-top: 34px` 内联样式，
  卸载时还原。**只改一个内联样式，不动 DOM 结构、不读 class 名。**
- 兜底：量不到几何时降级为「芯片内联进会话头」，功能不变。

### 15.3 数据模型与接口（v0.3）

- `Domain` 去掉 `kind`；`sessions[id]` 从 `{skills,tools}` 合并成 `domains: string[]`，读取旧文档时自动迁移。
- `POST /toggle` 去掉 `kind`；`/snapshot` 的 `session.domains` 是单串、`domains[].loaded` 是单值。
- 成员级开关从界面移除，`POST /exclude` 保留为预留能力。
- 配置里删掉 `barPlacement`（条子只有一个位置了）。

### 15.4 实测

| 检查 | 结果 |
|---|---|
| 新会话 | 条子在 `y=40`（会话列顶），5 枚芯片，只有一条 |
| 已有会话 | 条子在 `y=76`（会话头下沿），宽度 1158 与会话列一致 |
| 占位 | 正文首行不再被压住（滚动容器 padding-top=34） |
| 悬停 | 成员面板：`技能 4` + 名字顿号连写，`工具 0` 段自动省略 |
| 开关 | 点芯片 → `POST /toggle`（无 kind）→ 会话 `domains` 变化 → agent 侧 restrict/遮罩重算 |
| 设置页 | 左列 `4 项`，右侧 `技能 4 / 工具 0` 两段，行内只有名字 + 复选框 |
| 测试 | `node --test test/` 14 项全绿（含迁移用例）；`test/e2e/mask.mjs` 通过 |

### 15.5 悬停面板的高度上限（v0.4 手感修补）

面板按内容自然撑高，一个装了三十来个 skill 的领域（比如「插件维护」）会把弹窗拉到盖住半个对话区，
而它的用途只是「看一眼这个域里有啥」。改成有上限、内部滚动：

- `max-height = min(视口高 − 弹窗顶 − 12, 55% 视口高)`，下限 132px；`top` 仍然是芯片下沿 + 6。
- 弹窗本身 `display:flex; flex-direction:column`，头（`.cdx-pop-hd`）和尾（`.cdx-pop-ft`）`flex:0 0 auto`，
  中间的 `.cdx-pop-body` 装两段成员名并 `overflow-y:auto`，滚动条颜色用宿主
  `--dsw-alias-scrollbar-bg-l2` / `-hover-l2`，与设置页成员表同一套。
- `resize` 只在弹窗打开期间监听（`openId !== null`），窗口缩放后重算上限，不留下被切掉的底边。
- 实测（无头 Chrome + CDP，同一段 CSS 拼的独立页）：60 个名字在 1000×700 / 1280×1000 / 900×420
  三档视口下弹窗高 385 / 550 / 231px，成员区 `scrollHeight 725` 恒大于可视高，尾注始终在视口内。

### 17. 第三方来源验收（做完即撤）

2026-11-09 在容器里临时挂了 `dsh-mcp-client` × 2（memory / fsdemo）、`dsh-skill-office`、`dsh-skill-badge`，
验证领域能同时管住 MCP 工具与外部 skill：

- 目录：13 skill + 64 tool（含 25 个 `mcp__*`）。
- 混装领域（3 skill + 4 `mcp__memory__*`）：开启 → `effective` 两边都在；关闭 → 4 个 MCP 工具进 `deniedTools`、
  3 个 skill `maskProbe.modelInvocable=false`。
- 规模：16 个 `mcp__fsdemo__*` 关闭后 visible 0 / denied 16，开启后 visible 16。
- 自动化：`test/e2e/mcp.mjs`（自建领域→开关→断言→自删）。

验收完按计划撤除：profile patch 的四行删掉、容器重启，`catalog` 回到 5 skill / 36 tool，`mcp__*` 为 0，
状态文件里也没有残留成员（`grep mcp__ state.json` 为 0）；验收期间建的「记忆图谱」「文件系统 MCP」两个领域也一并删除。

顺带修掉一个冷会话缺陷：没有 live agent 时 `/snapshot` 的 `visible` 为空，导致新会话页读不到任何可见集合。
现在冷会话会读全局层给出 `visible`，`effective` 仍按「请求 ∩ 线上」计算。

---

## 16. 接入 Archify（架构建模）时踩到并修掉的一个真缺陷

### 16.1 现象

把本插件仓库登记成 archify 项目（`repoPath=/workspace/dsh-context-domains`）后，出图会话跑了 59 步、
两个图都 `failed`：`没有找到这次运行的产物文件`，5M tokens 打水漂。会话日志里唯一的错误是：

```
tool/result  isError: true
content: "Error: 本会话未加载蕴含该 skill 的领域：archify"
```

也就是说 **我的 guard 把 archify 自己的 skill 拦了**。

### 16.2 根因

`dsh-archify-projects` 为自己的受限 agent 声明了 `preset-archify-projects`，preset 里带一份**私有的
skill-filesystem**（只供应 `archify` 一个 skill）与工具白名单。本插件对所有 agent 一视同仁地装
`tools.restrict({deny})` + `tools.guard`，于是：
「archify 不在我的任何领域里」→ 判成违规 → 拒绝 `skill: archify` → agent 拿不到画图口径 →
一路读文件但从不产出。

这是我们一方的错误：领域的职责是治理「用户自己的会话」，不是去管别人插件给自己的受限 agent
定好的供应口径。

### 16.3 修法：preset 治理门

```js
// config：默认只治理随包发布的四个内置 preset
managedPresets: ['standard', 'ptc', 'minimal', 'cordis']
manageUnknownPresets: false

// apply.manages(agent)：查 agentPresets.presetForSession(agent.session)
//   在名单里 → 治理；不在名单里、或认不出 preset → 完全不装 restrict/guard/mask
```

配套：
- `/snapshot` 新增 `session.managed`；`status.skillGate = 'unmanaged'` 表示这个会话不归本插件管。
- 认不出 preset（服务缺失、查询抛错、空 id）一律按「不治理」处理 —— 宁可不管，也不能把别人的会话弄坏。

### 16.4 修复前后对照（同一个仓库，同一个 archify preset）

| | 修复前 | 修复后 |
|---|---|---|
| 工具错误 | 1（`skill: archify` 被领域 guard 拒绝） | 0 |
| 领域拦截 | 1 | 0 |
| 产物 | 无 | `structure-context-domains-20261109-155842/context-domains.html`（782 KB） |
| 概念表 | 无 | 23 条（领域 / DomainMember / SessionSelection / Excluded / Resolver / 工具 deny 名单…） |

结构图在页面里显示「已就绪」，点开可以看到它把 `lib/{apply,catalog,config,http,resolve,runtime,store}.js`
与 `client.js` 都建了节点。

### 16.5 遗留：领域图（domain）两轮都没产出

修复后 `structure` 一次成功，但 `domain` 连续两轮 `没有找到这次运行的产物文件`：

- 第一轮是 **宿主重启**打断的（跑图期间我重启了容器，`reconcileArtifacts` 把它收成 failed，属预期行为）。
- 第二轮跑了 15 步、**0 个工具错误**、`write` 工具在请求里确实存在，但 agent 读完 12 个文件后
  直接 `turn/end(completed)`，没有执行写入 —— 这是**模型行为**（这一轮只思考不出件），
  不是插件拦的。要复现只需在 Archify 页面点「更新图册」重跑，不必改这边。

结论：本插件与 archify 的冲突已消除（`managed: false`，完全不介入它的 preset）；剩下的失败是
「模型没写文件」与「重启打断」，与领域机制无关。

---

## 17. 压缩阈值：运行期接管 compaction-basic 的压力线（v0.4）

### 17.1 需求与约束

技能与工具把每轮的固定开销抬高，所以「什么时候压缩」不该由模型窗口的固定比例决定，
而该由用户按「模型能力 / token 花费 / 任务性质 / 会话现状」现场调。约束三条：

1. 调完**不重启 dsh**立刻生效；
2. 与模型无关（换模型不用重新调）；
3. 界面只是顶栏最右边一个 `− 数字 +`（单位 10 万，最低 2）。

### 17.2 静态改阈值为什么不行

`compaction-basic` 的判定链只有一句：

```js
thresholdTokens = floor(min(contextWindow * thresholdRatio, contextWindow - reservedOutput - headroomTokens))
if (measurement.totalTokens < thresholdTokens) return null      // 不压
```

它的 config 在 `resolveConfig()` 里被 `deepFreeze`，而且这行挂在 preset
（`@deepseek-ai/dsh-agent-preset` → registry `mountPreset`）的 `isolate: { compaction: true }`
组里 —— profile 的 `cordis.patch.yml` 只能按 id 命中顶层或 `group: true` 节点，够不到 preset
内部子节点（同 id 的顶层节点是 web-app 关掉的那份副本，写上去静默无效）。所以静态改阈值
只能改 preset 声明文件，然后重启；`~/.dsh/compaction-threshold.py` 就是那条路。

### 17.3 运行期接管：把预算写成一条精确的 modelPolicies 覆盖

关键事实：`modelPolicies` 不是装载时算完就固化的 —— `compactPressure()` 每次都调
`resolveTargetPolicy(this.config, target)` 现查。于是只要重写引擎实例的 `config`：

| 字段 | 取值 | 解得 |
|---|---|---|
| `thresholdRatio` | `1` | `window × 1 = window` |
| `headroomTokens` | `window - reservedOutput - budget`（下限 0） | `window - out - headroom = budget` |
| `retainTokens` | `budget × 0.25`（必须 < 阈值，原生会抛） | 压缩后保留的原文尾巴 |

`min(window, budget)` 就是预算本身；预算超过 `window - 输出预留` 时自然贴住物理上限。
`reservedOutput` 取 `header.config.maxTokens ?? info.defaultMaxTokens`，与原生同一口径
（这里用 `defaultMaxTokens` 近似：会话级 `maxTokens` 极少被显式设过，设了就少算这几十 k，
不影响「到数就压」的语义）。

### 17.4 引擎怎么找到（isolate realm）

preset 是**按需挂载**的：一个 preset 定义挂一次（`createScope(owner, key)`），所有选它的会话共用
同一个引擎实例。引擎在 isolate realm 的符号里，`ctx.get('compaction')` 从宿主平面拿不到
（realm 私有符号），所以按服务表扫：

```js
for (const key of Object.getOwnPropertySymbols(ctx.reflect.store)) {
  const impl = bag[key]
  if (impl?.name !== 'compaction') continue
  if (impl.ctx?.fiber?.state !== 2) continue        // cordis 的「已激活」
  impl.value.compactPressure                        // 就是引擎
}
```

`impl.value` 只在该 fiber 激活后才有值，所以扫描天然跳过未挂载/已卸载的行。
`ctx.reflect.store` 是整个 runtime 共用的一张表（`ReflectService` 只在 root 构造，子 ctx 原型继承），
isolate realm 只是不同的符号键 —— 这也是 registry 自己的 `leakedServices()` 用的同一套读法。

### 17.5 为什么包 `compactPressure` 而不是换引擎

引擎被三处调用：`agent/pre-step`（自动压缩）、`agent/request`（模型切换，`requireBelowThreshold = true`）、
`compactIfNeeded`（overflow 恢复）。三条都走 `this.compactPressure(...)`，包一层全覆盖；
而且这是唯一能拿到 `header.config`（真实路由的 provider/model）的地方 —— 模型的
`contextWindow` 只能在走到这一步时才知道，所以「按目标解析窗口」这个动作只能放在这里：

```
compactPressure(agent, header, signal, requireBelowThreshold)
  → 第一次见到该 target：await llm.resolveModelInfo()，学窗口，重写所有引擎的 config（同步）
  → 原方法照跑
```

窗口学到之后进缓存，后续调用零开销；模型切换那条路也照样走（阈值同样被钉住，所以切到小窗口
模型时会按该模型的上限先压，安全语义不变）。

### 17.6 降级矩阵

| 情形 | 行为 | 用户看到 |
|---|---|---|
| 冷启动、还没有会话 | 没有引擎可接管 | `degraded: 没有在线的 compaction 引擎（preset 还没挂载）`，数字琥珀色 |
| 模型没声明 `contextWindow` | 该 target 回落原生判定 | `degraded: 模型没有声明 contextWindow` |
| `llm` 服务不可见 | 不接管 | `degraded: llm 服务不可见，预算未接管` |
| 预算 > 模型窗口 | 贴住 `window - 输出预留` | `targets[].clamped = true`，悬停提示「实际按窗口上限压」 |
| 预算 < 原生比例阈值 | 照样提前压 | 无（这是正常路径） |

### 17.7 真机验证（独立实例，不碰在跑的 dsh）

在 `/tmp/dshprobe` 起了一个独立 dsh 实例（`--port 13999`，profile 用 `link:` 指到本仓库，
LLM patch 抄在跑的 profile），实测：

| 观察 | 结果 |
|---|---|
| 引擎扫描 | `engines: 4`（web-app 的 standard / minimal / ptc / cordis 各挂一个） |
| 目标解析 | `zifei/deepseek-v4.1-flash` → `contextWindow 1000000`、`defaultMaxTokens 64000` |
| `POST {tokens:3}` | 每个引擎 `modelPolicies`: `{thresholdRatio:1, headroomTokens:636000, retainTokens:75000}` → `thresholdTokens = 300000` |
| `POST {tokens:12}` | `headroomTokens:0, retainTokens:234000` → `thresholdTokens = 936000`，`clamped: true` |
| `POST {tokens:1}` | 收成 200000（下限）；`{tokens:"x"}` → 400 bad-request |
| 持久化 | 预算写进 `state.json` 的 `compaction`，重启后仍在 |
| 降级 | 适配器未注册时 `degraded: [{provider, model, reason: 'no adapter registered for provider "zifei"'}]`，配置保持原生 |

没验到的只有「阈值到点真的压了一次」：那需要一个真实会话跑满预算，属于模型/网络侧的动作，
换算链已由上面 + `test/compaction.test.js` 覆盖。

### 17.8 落点

- `lib/compaction.js`：控制器（扫描 / 包装 / 换算 / 状态）。
- `lib/runtime.js`：`budget.start()`（`ctx.effect` 持有，卸载时还原原生 config、清掉定时器）。
- `lib/http.js`：`POST /compaction`，`/snapshot`、`/health` 多一个 `compaction` 块。
- `lib/store.js`：`compaction = { budgetTokens, at }`（读侧缺省 50 万，等于原来 0.5 × 1M 的口径）。
- `client.js`：`CompactionCounter`，渲染在 `.cdx-bar` 最右侧（`chips` 之后）。
