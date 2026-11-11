# 变更记录

版本号对应 `package.json` 的 `version`，标签固定为 `v<version>`。
设计迭代号（DESIGN.md 里的 v0.1 / v0.2 / v0.3 领域模型）与发布版本号不同：
模型定稿在 v0.3，所以**第一个公开版本直接从 0.3.0 起**，不再往回发 0.1 / 0.2。

## 未发布

### 文档：README 里两张过时截图换成当前 UI，市场条目补上压缩阈值

只动文档与图片，插件代码不变（版本仍是 0.4.1）。

- `assets/shot-members-zoom.png` 是 v0.3 的浅色弹层（「记忆图谱 7 项」那版），既不是现在的深色弹层，
  也没有 0.4.1 的限高与内部滚动 —— 0.4.1 的 CHANGELOG 写着「成员浮层与设置页这版没改」是错的：设置页在 0.4.0 已经整版重做。
  重拍为真机深色弹层（`DSH 插件开发 · cordis`，技能 4 + 工具 3，`720×600`，2× 抓的，连带着上方那条领域条，看得出弹层是从哪个芯片展开的）。
- `assets/shot-settings-zoom.png` 是设置页重做前的样子（`名称 / 说明 / 新会话默认` + 一列复选框）。
  重拍为 0.4.0 重做后的编辑器：左列领域清单（项数、已选/总数、默认标记），右列名称、说明、默认启用、
  搜索成员 + `全部 / 技能 / 工具` 页签 + `全部成员 / 已选 / 未选` 筛选（`1000×1000`）。
- 两张图的 URL 加 `?v=4` 绕开 camo 缓存，alt 文字按画面重写；`screenshots.json` 的 5 张不变。
- 市场条目 `docs/market/guicaiyue__dsh-context-domains.yml` 的 `description.en/zh` 原来停在 v0.3 的能力清单，
  完全没有压缩阈值计数器。两个语种都补上「条最右端 `− 5 +`，单位 10 万 token，改完下一轮生效、
  不用重启」，以及降级时的琥珀色数字与 `snapshot.compaction.degraded`；设置页描述也换成
  现在的搜索/页签/筛选/AI prompt 口径。`docs/market/README.md` 补一节「描述读的是条目，不是 README」。

## 0.4.1

### 悬停成员面板加高度上限与内部滚动

改了 `client.js` 一处样式和一处几何计算：

- **上限**：`max-height = min(视口 − 弹窗顶 − 12, 55% 视口高)`，下限 132px。原来只固定宽 310px、
  高度随内容长，一个装了三十来个 skill 的领域能把弹窗拉到遮住半个对话区。
- **滚动**：头（领域名 + 项数）和尾（那条操作提示）固定，中间的成员清单包进 `.cdx-pop-body`
  自己滚（`overflow-y:auto` + 细滚动条，颜色照旧走宿主 token）。
- 弹窗开着时窗口缩放会重算上限（`resize` 只在打开期间监听），不会出现窗口变小后底部被切掉。
- **测量**（无头 Chrome + CDP，`/tmp/cdx-pop-check.html` 是用 `client.js` 里的同一段 CSS 拼的）：
  60 个名字的领域在 1000×700 / 1280×1000 / 900×420 三档视口下，弹窗高 385 / 550 / 231px，
  内容区 `scrollHeight 725 > clientHeight 313/478/159`，尾注始终在视口内。

### 文档：README 换成新 UI 的截图

计数器上线后重拍了真机截图（同一个 dsh、深色主题、`1500×1000`，用 CDP 无头 Chrome 抓的）：

- `assets/shot-bar.png` → 会话领域条的右端，能看到绿/灰点与最右边的 `− 5 +`（1926×70，2× 抓的）；
- `assets/shot-session.png` → 真实会话里条的位置（1500×1000）；
- `assets/shot-bar-blank.png` → 新会话页（1500×1000）；
- `assets/shot-budget.png`（新）→ 计数器 4× 特写，插在「压缩阈值」小节；
- `shot-members-zoom.png` / `shot-settings-zoom.png` 不动（成员浮层与设置页这版没改）。
- 图片 URL 都加了 `?v=3` 绕开 GitHub camo 缓存；`screenshots.json` 补上第 5 张。

## 0.4.0

### 顶栏压缩阈值计数器

上下文压缩的触发线现在能在会话顶栏最右边直接改，**改完下一轮生效，不用重启 dsh**。

- **计数器**：领域条最右端 `− 数字 +`，单位 10 万 token，最低 2（20 万），每格 10 万。
  值是全局的（压缩引擎按 preset 一个、多会话共用），所以任何会话上改都立刻对全场生效，
  悬停能看到「换算成多少万 / 已接管几个引擎 / 降级原因」。
- **怎么生效**：`compaction-basic` 的 config 装载即 deepFreeze，且挂在 preset 的 isolate 组里
  （`cordis.patch.yml` 够不到），所以不碰它的 config 文件：给每个 `(provider, model)` 生成一条
  精确的 `modelPolicies` 覆盖（`thresholdRatio: 1`、`headroomTokens = 窗口 − 输出预留 − 预算`），
  解出来 `thresholdTokens` 就等于预算；`modelPolicies` 每次 `compactPressure` 现查，
  于是重写引擎实例的 `config` 就是「立即生效」。
- **引擎发现**：preset 按需挂载、引擎在 isolate realm 里，`ctx.get('compaction')` 拿不到 ——
  按 `ctx.reflect.store` 扫 `name === 'compaction'` 且 fiber 激活的实现，启动 + 每 4s + 会话创建时重扫。
- **降级说清楚**：模型没声明 `contextWindow`、`llm` 不可见、冷启动还没挂引擎时回落原生阈值，
  原因写进 `snapshot.compaction.degraded`，条上数字转琥珀色；预算高于窗口时贴住物理上限并标 `clamped`。
- **新端点**：`POST /context-domains/api/compaction`（`{tokens}` 或 `{budgetTokens}`）；
  `GET /snapshot`、`GET /health` 多一个 `compaction` 块。预算随 `state.json` 一起持久化
  （`compaction.budgetTokens`，缺失回落 50 万 = 原来 0.5 × 1M 的口径）。
- **测试**：`test/compaction.test.js` 照抄 `compaction-basic` 的 `resolveTargetPolicy` /
  `resolveCompactSpec`，验证「预算 < 原生阈值 / > 原生阈值 / 超窗口 / 解析失败降级 / 模型切换路径」
  五条换算，21 passed。
- **真机验证**（`/tmp/dshprobe` 起的独立实例，`link:` 到本仓库，不碰在跑的 dsh）：
  `engines: 4`（web-app 的 4 个 preset 各挂一个引擎，扫 `reflect.store` 全部拿到）、
  `zifei/deepseek-v4.1-flash` 解析出 `1000000 / 64000`；`POST {tokens:3}` 后每个引擎的 policy 变成
  `thresholdRatio:1, headroomTokens:636000, retainTokens:75000` → `thresholdTokens = 300000`；
  `{tokens:12}`（1.2M > 936k 容量）→ `headroomTokens:0`、`thresholdTokens:936000`、`clamped:true`；
  `{tokens:1}` 收到 200000；预算随 `state.json` 跨重启保留。


### 设置页三处手感问题

都在 `client.js`（另有一行 `lib/http.js` 的建域默认值）：

- **技能 / 工具拆成页签**：原来两段成员挤在同一个滚动区里，滚到下面已经忘了在看哪一类。
  页签放在搜索框**下面**、紧贴成员网格（`搜索 → 页签 → 列表`），单类页签内容单列排布。
- **显示范围三态开关**：页签同一行右侧 `显示：全部成员 | 已选 | 未选`，只筛视图不改成员；
  窄面板下自动隐去「显示」二字保证同一行，第一项写成「全部成员」以免和页签的「全部」撞名。
- **新建即默认启用**：`＋ 新建` 与建域建议都带 `defaultOn: true`，字段也从「新会话默认」
  改名「默认启用」（勾上 = 新会话自动点亮）。服务端 `POST /domains` 的 create 缺省值同步改成
  true（AI 直接调接口建域也一样），显式 `defaultOn: false` 仍然照办。
- **AI 归类改走弹窗**：`＋ 新建` 后面加一个 `✦` 图标按钮，点开居中弹窗看 prompt 并
  `复制 prompt`；原来常驻右栏的 prompt 块撤掉，把版面还给天天用的成员列表。提示词是
  「读 catalog → 按用途归 6~8 个领域 → 先出清单、确认后逐个 create」。
- **弹窗点开不显示**：宿主设置页是 `z-index:1000` 的 fixed 全屏层（提示层 1100），
  我们的遮罩原来在 400，被压在设置对话框底下。现在提到 1200，并在捕获阶段截住 Esc、
  在遮罩上截住点击，免得关弹窗时把设置页一起关掉。
- **设置页整版重做**（视觉稿来自 OpenDesign 项目 `cdx-settings-v2`）：左列 200px 领域清单
  （48px 表头 + 名称/项数/`默认` 徽标 + `技能/工具` 比例 + 选中行 2px accent 条），右列
  名称→说明 textarea→`默认启用` 真开关→成员区→`删除领域`；成员区改成「搜索（内嵌已选数）→
  页签 + 显示开关同一行 → 260px 双列成员表」，扁平列表、技能在前工具在后，空态带「清除筛选」。
  颜色全部换成宿主 token，间距 8px 栅格，圆角 6/8/10/14。
- **真机验证**：在 `dsh-dev` 容器（`http://127.0.0.1:3080`）里用 puppeteer 走了一遍真实点击 ——
  打开设置 → 上下文领域 → 点 `✦`（弹窗 `z-index:1200` 真的盖住设置页）→ 点 prompt（`已复制`）→
  Esc（只关弹窗、设置页留着）→ 切技能页签 / 已选筛选，全绿无 console 报错。
  截图存在 `assets/v2/`（深色、浅色各一套）。

## 0.3.6

README 两张 hero 图的 URL 加 `?v=2`：GitHub 的 camo 图片代理按 URL 缓存，
同名文件换了字节仍返回旧图（页面里还挂着 1002px 的旧版）。插件代码不变。

## 0.3.5

hero 截图裁成横条本身（492px 装下全部 5 个领域），GitHub/npm 列宽下相当于放大 1.5 倍，
绿点灰点和名字都读得清。插件代码不变。

## 0.3.4

把 README 的截图裁到能看清：整窗截图缩到列宽后主题条只剩 40px 高，字是糊的。
现在 hero 是 1:1 裁切的领域条本身，效果区依次是「真实会话里的位置 → 新会话 →
悬停弹层（1.6 倍）→ 设置页（裁到对话框）」，每张都读得出字。插件代码不变。

## 0.3.3

README 的截图改用 `raw.githubusercontent.com` 绝对地址，并在标题下加了一张 hero
（真实会话里的领域条）。相对路径只有 GitHub 仓页能解析，npmjs.com 上是坏图；
顺手补了 `assets/shot-session.png` 与 `screenshots.json` 四张。插件代码不变。

## 0.3.2

**`/health` 不再写死版本号。** 它一直回报 `'0.1.0'`（硬编码常量），发到 0.3.x 之后
排障会先被骗一次；现在从 `package.json` 读（`lib/version.js`），读不到就报 `0.0.0`。

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
