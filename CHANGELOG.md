# 变更记录

版本号对应 `package.json` 的 `version`，标签固定为 `v<version>`。
设计迭代号（DESIGN.md 里的 v0.1 / v0.2 / v0.3 领域模型）与发布版本号不同：
模型定稿在 v0.3，所以**第一个公开版本直接从 0.3.0 起**，不再往回发 0.1 / 0.2。

## 0.3.1

只动发布链路，插件代码与 0.3.0 完全一致：npm 发布步骤改成幂等（版本已存在就跳过，
rerun 不会 `EPUBLISHCONFLICT`）并在发布后轮询 registry 元数据；Release 建完后自检
稳定别名 `releases/latest/download/dsh-context-domains.tgz` 是否 200（这次就是它静默
404 —— 删标签重建把 Release 变成了 untagged draft，而 CI 全绿）。

## 0.3.0 — 首个公开发布

**领域模型不再分类型**：一个领域里可以同时装 skill 和 tool，`Domain.members` 是
`{ type, name }` 的平铺列表，没有 `kind`；类型只在加载/卸载时才分流——skill 用同名
runtime skill 重投并标 `modelInvocable:false`（从模型目录消失、`/名字` 仍可用），
tool 走 `tools.restrict({ deny })` + `tools.guard`。

**会话顶部一条横条**：`● 名称`，绿点=已加载、灰点=未加载，点一下开关；悬停展开成员，
技能/工具两段、名字用顿号连起来。新会话页与对话页是同一个组件、同一个位置
（`conversation.hero.options` 与 `conversation.session.header.utilities` 注册同一个组件，
模块级互斥保证任何时刻只有一条），整条走 portal 固定定位，并给消息列表补 34px 顶部内边距，
不遮第一条消息。

**设置页**：`设置 → 上下文领域` 维护领域清单与成员，成员列表只有名字 + 复选框，
不区分类型的操作界面；另有「建域建议」（按 skill 目录 / 工具前缀自动分堆）。

**preset 治理门**：只在 `managedPresets`（默认 `standard` / `ptc` / `minimal` / `cordis`，
可用配置扩展）里的会话上安装限制；会话属于别的插件自己的 preset 时一律不动，
`/snapshot` 的 `session.managed` 与 `skillGate: 'unmanaged'` 如实反映。
这条是硬约束：越界限制会把别人的私有 skill 供给一起摘掉（archify 就是这样坏的）。

**数据**：`$DSH_HOME/context-domains/state.json` 单一文档，串行写 + 临时文件 rename，
坏文件自动备份为 `state.json.bad-<时间戳>`；v0.2 的 `{ skills, tools }` 两串在读取时自动合并成 `domains`。

**已知边界**：
- 只治理本插件认得的 preset；不认识的就退出治理，不猜。
- skill 屏蔽靠重投同名 stub，`skills.get()` 拿不到定义的 skill 不会被伪装（`degraded` 里会记）。
- 会话结束时不清状态，`sessions` 条目 30 天后清理。
