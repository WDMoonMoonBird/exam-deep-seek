# Exam-DeepSeek 移动端设计 · Phase 1 设计简报（Design Brief）

> 分支 `feat/mobile-app`（独立 worktree）· 方法 skill `afrexai-ui-design-system` Phase 1–10 · 阶段：**设计稿先行**
> **本阶段不改 `client/` 任何生产代码**：只产出 37 屏高保真设计稿 + 9 篇设计文档（见 §7）。
>
> 事实来源：`docs/mobile-app/preview/SCREENS.md`（37 屏唯一契约）· `docs/mobile-app/02-design-tokens.css`（移动令牌层 `--m-*`）· `client/src/styles/tokens.css`（桌面令牌）· `client/src/**` 实测（2026-10-17，命令见 §2）。
> 上游参考：`docs/ui-redesign/00-design-brief.md`（桌面端深度参照）· `docs/ui-redesign/teacher-app/design.md` · `docs/ui-redesign/teacher-app/mobile-plan.md`（上一轮教师端手机稿与计划：卡片替代表格 / 逐份审核 / 代码只读 / ≥768 回退桌面 / Android 优先，本节继承并扩展）。

---

## 0. 一句话目标

让「教师在碎片时间审核、学生在手机上作答与查分、管理员出差时只读巡检」在 **390×844** 上各自成为**完整的工作流**——而不是把桌面表格缩窄。

---

## 1. 设计简报（结构化 YAML）

```yaml
design_brief:
  project: "Exam-DeepSeek / Deadpan 判题 · 移动端"
  branch: "feat/mobile-app（基于 master 的独立 worktree；桌面端文件零改动）"
  type: "responsive_saas_product + progressive_web_app + android_shell（规划）"
  phase: "设计稿先行：37 屏高保真 + 9 篇设计文档；生产代码零改动"

  platform_targets:
    web_mobile: { status: "now —— 设计稿完成，待实施 /m 路由区", primary: true }
    android:    { status: "now_plan + later_implement —— Capacitor 壳 / 启动屏 / 返回手势 / PWA 安装", primary: false }
    ios:        { status: "plan_only —— 苹果侧构建与审核限制，暂不出包（理由见 §6）", primary: false }

  target_users:
    primary:   "高校计算机教师（周子轩）：碎片时间看进度、审一两份、临时布置作业"
    secondary: "学生（李明）：宿舍/教室用手机做客观题、查截止、看成绩"
    tertiary:  "管理员（王建国）：出差时确认系统是否正常，只读"
    technical_level: "advanced（教师为计算机专业教师）| novice（部分学生）"
    age_range: "18–55"
    context: "单手拇指操作；地铁/教室弱网；宿舍夜间深色环境；教工会议间隙"
    devices: "390×844 基准（iPhone 14/15），360–430 自适应；Android 优先"

  goals:
    business: "教师不打开电脑也能清空待办；移动端定位为桌面端的『值班台』，不是桌面端缩水版"
    user: "教师 30 秒内知道今天要做什么、20 秒内审完一份；学生 3 步内完成一次客观题提交并看懂分数"
    success_metric:
      - "学生完成一次客观题作答 + 提交 ≤ 3 步（首页待办 → 作答 → 交卷确认）"
      - "教师完成一次单份审核 ≤ 20 秒（进入队列 → 看 AI 分与评语 → 通过）"
      - "37 屏 100% 覆盖适用的 loading / empty / error / offline 四态"
      - "触控目标 100% ≥ 44×44px（WCAG 2.5.5 / Apple HIG）"
      - "深色主题正文对比度 ≥ 4.5:1；状态不只靠颜色（标签带文字/图标）"
      - "首屏 LCP ≤ 2.5s（4G 中端 Android）；首屏无大图、无第三方请求"
      - "同一条数据跨屏一致（共享演示数据见 SCREENS.md §3）"

  brand:
    personality: "专业、克制、可信；有工程感但不冷硬（沿用桌面端）"
    existing_guidelines: "yes —— client/src/styles/tokens.css（448 行，primitive→semantic→component 三层）+ docs/mobile-app/02-design-tokens.css（移动层 --m-*）"
    competitors: ["学习通", "超星/雨课堂", "GitHub Classroom 移动版", "Linear Mobile（交互密度参考）"]

  constraints:
    tech_stack: "现状：Vue 3.5 + Vite 8 + ant-design-vue 4.2 + Pinia + Vue Router + Monaco + TipTap；移动端拟新增 /m 路由区 + Vant 4 按需（见 07-implementation-plan.md，待实施）"
    component_library: "设计稿用 preview/assets/screen.css 的 Mobile Screen Kit；生产落地再拆 Vant + 自有组件（本阶段不引入依赖）"
    browser_support: "仓库 browserslist 为 chrome >= 69；CSS 兼容底线沿用令牌文件：不用 color-mix() / oklch() / :is() / 容器查询；可用 CSS 变量 / env() / calc() / grid gap"
    accessibility: "WCAG_AA；触控 ≥44px；四态完整；状态不只靠颜色；表单 label 关联"
    must_support: ["中文（唯一语言）", "深色主题（已有 ui-theme 持久化）", "弱网/断网提示", "安全区（刘海/手势条）", "单手拇指热区", "代码只读（不提供手机编辑）", "二维码/链接接力到电脑"]
    deploy: "自部署，nginx 静态托管，Vue Router base=/exam/；实时通道 socket.io 路径 /exam/socket.io"
    no_touch: ["桌面端页面与路由", "server/** 接口契约", "现有令牌取值（移动端只新增 --m-* 层）"]

  scope:
    screens: "37 屏（公共与认证 6 / 学生 11 / 教师 14 / 管理 3 / 平台与状态 3），清单见 SCREENS.md §4"
    docs: "README + 00 / 01 / 02（令牌说明） / 03 / 04 / 05 / 06 / 07 + SCREENS.md + 02-design-tokens.css + preview/（Gallery、Screen Kit、截图工具）"
    not_now: "不产出生产 Vue/CSS 代码；不新增后端接口；不做推送；不出 iOS 包"

  non_goals:
    - "不替换 ant-design-vue、不在桌面端引入第二套 UI 语言"
    - "不在手机端做代码编辑（Monaco / TipTap 内核不迁移）"
    - "不重做桌面端 IA / 路由 / 权限模型"
    - "不做多语言、不做换肤系统（只保留浅/深两套）"
    - "本阶段不接真实接口、不做离线数据缓存（PWA 离线壳在 M4 阶段评估）"
```

---

## 2. 现状证据（决定了要解决什么）

> 所有数字均来自本仓库 `feat/mobile-app` 工作区实测；桌面端已重构过一轮（`docs/ui-redesign/`），但**响应式层面未做移动端设计**。

### 2.1 响应式只是「桌面缩小」

| 指标 | 实测 | 含义 |
|---|---|---|
| `client/src` 下 `.vue` | **57 个**（views 30 + `App.vue` 1 + components 26） | 桌面端规模 |
| 含 `@media` 的 `.vue` | **11 / 57**（其中宽度断点 9 个，另 2 个仅 `prefers-reduced-motion`）；views 下 **7 / 30** | 多数业务页零断点 |
| 断点取值 | 480 / 640 / 768 / 992 / 1080 / 1100 / 1199 / 1200px | 全是 `max-width` 收窄，无移动优先 |
| 窄屏实际改动 | 侧栏收起、`.user-meta` 隐藏、工具栏换行、弹窗全屏化（`client/src/views/teacher/Assignments.vue` L440-465 是窄屏处理最完整的表单页） | **没有一页把表格重排成卡片** |
| `viewport` | `client/index.html` L6：`width=device-width, initial-scale=1.0`，无 `viewport-fit=cover` | 刘海屏/手势条无法进入安全区布局 |
| 安全区引用 | `safe-area-inset` **0 处** | 底部固定元素会被 Home Indicator 覆盖 |
| 动态视口 | `100dvh` **0 处**（全站 `100vh`） | 移动浏览器地址栏伸缩时页面跳动 |
| 触控令牌 | `--control-h: 36px` / `--control-h-sm: 28px`（`client/src/styles/tokens.css`） | 按钮/输入默认低于 44px 底线 |
| 悬停依赖 | `:hover` 规则 **42 处**（views 内）；`cursor: pointer` 21 处 | 触摸端无 hover，状态提示会丢失 |
| 手势能力 | 下拉刷新/左滑/长按多选 **0 处**；`touch-action` 仅 1 处 | 移动交互尚未建立 |

### 2.2 表格与固定宽度在 390px 必然溢出

| 证据 | 位置 | 后果 |
|---|---|---|
| **13 个** `<a-table>`，分布在 **10 个**文件 | `grep -rc '<a-table' client/src` | 列表页主视图全是表格 |
| 教师评分审核 5 列固定宽 380 + 190 + 160 + 170 + 140 = **1040px** | `client/src/views/teacher/Review.vue` L137-143 | 390px 下需横向滚动约 2.7 屏才能看全 |
| 批改记录表 `:scroll="{ x: 1780 }"` | `client/src/views/admin/GradingRuns.vue` L26 | 需横向滚动约 4.5 屏 |
| 系统监控 7 列合计 640px | `client/src/views/admin/Monitor.vue` L75-81 | 手机上看不到右侧进程信息 |
| 通用列表 `TABLE_SCROLL = { x: 'max-content' }` | `client/src/components/ListPage.vue` L137 | **所有**通用列表页默认横向滚动 |
| 固定宽浮层 480 / 520 / 560 / 640 / 820 / 880 / 920 / 1040px | 如 `admin/GradingRuns.vue` L96（920px 抽屉）、`teacher/Layout.vue` L133（1040px 弹窗） | 手机上内容被压缩或需全屏化重排 |

**结论：表格 + 固定宽浮层必须重排，不能靠 CSS 缩放。** 这是「卡片替代表格、Sheet 替代居中弹窗、分步表单替代一页两栏」三条决策的直接依据。

### 2.3 移动端基础设施缺位

| 能力 | 现状 | 影响 |
|---|---|---|
| PWA | `client/public` 无 `manifest.webmanifest` / `sw.js`；`index.html` 无 manifest 链接 | 无安装、无离线壳、无启动屏 |
| Android 壳 | `client/package.json` 无 Capacitor 依赖 | 无法分发 APK / 上架 |
| `theme-color` | `index.html` 无该 meta | 状态栏颜色不随主题 |
| 返回键/手势 | 无 Capacitor、无物理返回键处理 | Android 返回键行为不可控 |
| 实时通道 | **已有** socket.io（`client/src/composables/socketConfig.js`，路径 `/exam/socket.io`，`teacher/Review.vue` 与 `ReviewClass.vue` 监听 `graded` 事件） | 移动端可复用「评分完成即刷新队列」 |
| 深色主题 | **已有** `data-theme` + `useTheme` + 首帧防闪脚本（`client/index.html`） | 移动端直接复用，不另造 |
| 代码/富文本编辑 | Monaco + TipTap；Monaco 已本地化（`client/vite.config.js`） | 手机端不迁移编辑器，只做只读渲染 |
| 兼容性 | `browserslist: chrome >= 69`，仓库有 legacy 分流与 `monaco-legacy` | 移动端 CSS 不能用现代特性，需按令牌文件的兼容底线书写 |

### 2.4 真实能力盘点（设计只能落在这些能力上）

| 角色 | 真实页面 / 路由（`client/src/router/index.js`） | 移动端可用能力 |
|---|---|---|
| 公共 | `/` Landing、`/login`（**多学校二次选择**、401 过期提示 `?expired=1`）、`/doc`（使用文档 + 交互演示） | 品牌页、登录、文档 |
| 学生 | `/student/assignments`（搜索 + 4 筛选 + 截止倒计时）；`/student/assignments/:id`（Submit：**分题提交、草稿提示、剩余时间、答案可见性策略、次数限制**）；`/student/assignments/:assignmentId/project/:questionId`（工程包上传）；`/student/scores`（`totalScore` / `maxScore` / `attemptCount`，只返回已出分） | 作业列表、作答（客观题/编程题）、工程包提交、成绩 |
| 教师 | `/teacher/assignments`（服务端分页/筛选、两步新建弹窗、草稿恢复）；`/teacher/review`（`GET /teacher/review-summary`）；`/teacher/review/:id`（逐题 AI 分/终分/教师评语、AI 重评、保存审核、发布）；`/teacher/review/class/:classId`（**一键审核全班 / 一键发布全班**：`POST /teacher/submissions/batch-review` 与 `POST /teacher/submissions/batch-publish`、导出 Excel）；`/teacher/questions`；`/teacher/classes`；`/teacher/students`；`/teacher/teams`；题目编辑页（Monaco） | 作业、审核、题库只读、班级；编辑类引导电脑 |
| 管理 | `/admin/schools`、`/admin/classes`、`/admin/teachers`、`/admin/students`；`/admin/monitor`（系统信息 / PM2 进程表 / 错误日志 / 30s 自动刷新）；`/admin/grading-runs`；`/admin/ai-config` | 只读概览/目录/监控；高风险配置引导电脑 |
| 横向 | `/doc` 使用文档 | 文档阅读 |

**真实状态枚举**（前端出现频次）：`published`(28) · `submitted`(23) · `reviewed`(23) · `ai_graded`(14) · `failed`(10) · `pending`(8) · `draft`(8) · `expired`(8) · `locked`(1)。移动端状态文案必须映射到这套枚举，不得自造。

> ⚠️ **诚实边界**：桌面端**当前没有**代码 diff 视图、答题卡、逐份审核队列、二维码接力、催交、管理员在线/队列 KPI。对应设计屏（`teacher-review-diff`、`student-answer-sheet`、`teacher-review-queue`、接力卡、催交、`admin-home` 监控 KPI）属于**移动端新增设计（待实施）**，落地依赖新能力（见 01 §9 与 03 §9）。

### 2.5 结论（5 条，直接转成设计动作）

1. **重排，不缩放**：表格 → 卡片；居中弹窗 → 底部 Sheet / 全屏流程；侧栏 6 项 → 底部 4 Tab。
2. **触控是硬指标**：`--control-h` 36px 在手机上不可用，移动层统一 `--m-control-h: 48px` / `--m-btn-h: 50px` / `--m-touch-min: 44px`。
3. **状态必须显性**：现有的 `loading/empty/error` 四态补齐 + 断网态；AI 评分中、待审核、未提交要有明确的 partial 语义。
4. **能力有边界**：手机不写代码、不做复杂配置；用「只读 + 二维码/链接接力」把用户送到电脑，而不是给一个残缺的编辑器。
5. **安全区与主题是基线**：`viewport-fit=cover` + `env(safe-area-inset-*)` + `100dvh` + 深色令牌，全部进移动层，不再逐页补丁。

---

## 3. 设计原则（移动端专用，取舍时的优先级从高到低）

| # | 原则 | 意味着 | 反例（明确禁止） |
|---|---|---|---|
| 1 | **场景重排** | 每屏只服务一个移动场景：走廊里看截止、地铁里审一份、被窝里查分 | 把桌面三栏审核页等比缩到 390px |
| 2 | **拇指优先** | 主操作固定在底部（`.actionbar`）或 Tab 高度内；屏幕上半部放只读信息 | 主按钮放 AppBar 右上角、离拇指 600px |
| 3 | **一屏一事** | 一屏只有一个 primary；次级操作降为 secondary / ghost / 文字链 | 审核页每张卡都放一个 primary「审核」 |
| 4 | **数据先行 + 四态完整** | 首屏先给能决策的 4 个字段；loading / empty / error / offline 缺一不可 | 一直转圈没有骨架；错误只弹 toast 不留在页面 |
| 5 | **诚实边界** | 手机做不了的事直说，并给可执行的接力路径（二维码 / 复制的链接） | 手机上塞一个 12px 的代码编辑器假装能写作业 |
| 6 | **原生感** | 底部 Tab / 底部 Sheet / 分步表单 / 返回栈 / 安全区 / 手势反馈；动效只做状态变化 | 网页式居中弹窗、悬停高亮、双击缩放延迟 |
| 7 | **克制与可访问** | 动效 90–320ms（`--m-duration-*`）；正文 15px 起；对比度 AA；触控 ≥44px | 用颜色当唯一状态；12px 正文；红色/绿色单独表意 |

---

## 4. 目标与成功度量（可验收）

| 指标 | 目标 | 设计稿阶段验收方法 | 实施后验收方法 |
|---|---|---|---|
| 屏幕完整性 | 37 / 37，且每屏符合 SCREENS.md §4 的「必须包含」 | 逐屏对照 SCREENS.md；`preview/index.html` 计数 | Playwright 遍历 |
| 关键流程步数 | 学生客观题作答 ≤ 3 步；教师单份审核 ≤ 20s | 流程走查（01 §4） | 埋点 / 可用性测试 |
| 触控目标 | 100% ≥ 44×44px；相邻间距 ≥ 8px | 屏内 `.iconbtn`/`.btn`/`.rowitem` 抽查 | Playwright boundingBox |
| 对比度 | 深/浅主题正文 ≥ 4.5:1；非文本 ≥ 3:1 | 令牌保证 + 抽查 | axe-core |
| 令牌覆盖 | 设计稿不写死颜色/圆角/时长（QR 与代码高亮除外） | `grep` 预览 CSS/页面内联样式 | 代码评审 |
| 四态覆盖 | 所有列表/详情屏具备适用四态 | states-overview + 逐屏状态矩阵（01 §6.2） | 失败注入 |
| 性能预算 | LCP ≤ 2.5s（4G 中端 Android）；首屏无第三方请求 | 设计上排除大图/外链 | Lighthouse |
| 一致性 | 人名/数字/日期跨屏一致 | 共享演示数据（SCREENS.md §3） | 截图比对 |

---

## 5. 约束

### 5.1 设计约束（本阶段）

- 37 屏是**唯一契约**：不增不减；认为缺页只在「待确认」提出（见 §9 / 01 §9）。
- 只用两套令牌：桌面 `tokens.css` + 移动 `02-design-tokens.css`；不发明令牌、不硬编码 hex（QR 与代码高亮除外）。
- 屏幕骨架与交互钩子由 `preview/assets/screen.js` 注入（状态栏、TabBar、Sheet、Sheet 遮罩、Toast、二维码）；页面不手写状态栏。
- 基准 390×844，支持 360–430；≥768 不作为移动设计目标（回退桌面视图）。

### 5.2 实施约束（下一阶段，见 07-implementation-plan.md）

- 只**新增** `/m/*` 路由区与 `views/m/`、`components/m/`，桌面路由与页面零改动；共享文件改动面限定 `router/index.js`、`main.js`、`package.json`。
- Vant 4 按需引入且只在 /m chunk；移动端不再引入第二套图标库（用内联 SVG / `data-icon` 方案）。
- 接口不新增；批量能力按现有 `batch-review` / `batch-publish`（班级级）设计，客户端并发与逐条进度见 07。

### 5.3 兼容与降级

- CSS 兼容底线（Chrome 69 / 老 WebView）：CSS 变量、`env()`、`calc()`、grid gap 可用；禁用 color-mix / oklch / :is / 容器查询。
- 不支持 `backdrop-filter` 时 AppBar/TabBar 回落实色（令牌已用 `@supports` 处理）。
- `prefers-reduced-motion: reduce` 时动效时长降为 0（令牌已处理）。
- 键盘：手机软键盘弹起可能遮挡底部动作条；实施需用 `visualViewport` 处理（见 04-interaction-a11y.md）。

---

## 6. 三类端策略：Web 移动端（现在做）/ Android（现在规划 + 后续做）/ iOS（只规划）

| 维度 | Web 移动端（现在做） | Android（现在规划 + 后续做） | iOS（只规划，暂不出包） |
|---|---|---|---|
| 载体 | 浏览器打开 `/m/*`（同一套 Vue 产物） | Capacitor 壳内加载同一 Web 产物 + 原生能力桥 | 理论同上，当前不排期 |
| 本次交付 | 37 屏设计稿 + 9 篇文档（**本分支**） | 平台策略与实施计划（06 / 07，**设计稿**） | 仅平台策略章节（06，**规划**） |
| 入口 | 手机宽度自动进 /m；可手动切换 | APK 启动屏 → 工作台；PWA 可作为过渡 | PWA「添加到主屏」是唯一当前可用路径 |
| 状态栏/安全区 | `viewport-fit=cover` + `env()`；`?platform=android` 参数在预览中模拟 24px 状态栏 | 系统栏插件提供真实高度；启动屏 `platform-splash` | 刘海/HIG 安全区，若解禁再评估 |
| 离线 | 不承诺离线数据；PWA 只承诺壳与静态资源（M4） | 壳可离线打开，数据仍需网络 | PWA 缓存限制更严，不承诺 |
| 分发 | 域名直接访问 | APK / 应用市场 / 内部分发（签名与升级提示见 06） | 需 Apple Developer 账号 + Xcode 构建 + App Store 审核 |
| 关键风险 | 弱网、微信内置浏览器、旧 WebView | 厂商杀后台、WebView 版本碎片、签名管理 | **Guideline 4.2（最低功能）**、审核周期、构建链缺失、成本 |
| 不做的理由 / 时机 | — | 先设计后实施；M4 排期（见 07） | 当前环境无 Xcode/发布链，且产品核心是「Web 可用」；PWA 已能覆盖「加到桌面」诉求 → **暂不出包**，待 Android 验证后再评估 |

> iOS 决策口径：不是「不能做」，而是「**现在不做**」——避免为审核与构建链投入，先以 PWA 安装引导（`platform-install`）承接 iOS 用户；若后续确需上架，再按 06 的清单补开发者账号、构建机与审核合规材料。

---

## 7. 交付物清单

| 文件 / 目录 | 内容 | Phase | 状态 |
|---|---|---|---|
| `docs/mobile-app/README.md` | 评审入口：交付物、37 屏清单、核心决策、下一步 | — | ✅ 已产出 |
| `docs/mobile-app/00-design-brief.md` | 设计简报（本文） | 1 | ✅ 已产出 |
| `docs/mobile-app/01-information-architecture.md` | 角色导航、37 屏地图、关键流程、桌面映射、状态策略 | 2 | ✅ 已产出 |
| `docs/mobile-app/02-design-tokens.css` | 移动令牌层（`--m-*`，181 行，可直接引入） | 3 / 10 | ✅ 已产出 |
| `docs/mobile-app/02-design-tokens.md` | 令牌说明 + 与桌面令牌关系 + 落地用法 | 3 / 10 | ✅ 已产出 |
| `docs/mobile-app/03-components.md` | 移动组件规范 + 屏幕→组件矩阵 | 4 | ✅ 已产出 |
| `docs/mobile-app/04-interaction-a11y.md` | 手势 / 动效 / 安全区 / 键盘 / 无障碍 | 5 / 6 / 7 | 🔄 并行任务产出 |
| `docs/mobile-app/05-page-specs.md` | 37 屏逐屏 handoff 规范 | 9 | 🔄 并行任务产出 |
| `docs/mobile-app/06-platform-strategy.md` | Web / PWA / Android / iOS 平台策略 | 8 | 🔄 并行任务产出 |
| `docs/mobile-app/07-implementation-plan.md` | /m 架构、文件清单、组件映射、人日、测试矩阵 | 10 | 🔄 并行任务产出 |
| `docs/mobile-app/preview/SCREENS.md` | 37 屏契约 + 共享演示数据 | 9 | ✅ 已产出 |
| `docs/mobile-app/preview/index.html` | 设计总览 Gallery（37 屏导航 / 主题与平台切换） | 9 | ✅ 已产出 |
| `docs/mobile-app/preview/screens/*.html` | 37 屏高保真设计稿（逐屏以 SCREENS.md 为准） | 9 | ✅ 已产出 |
| `docs/mobile-app/preview/shots/*.png` | 逐屏截图（浅色 iOS / 深色 / Android 抽查） | 9 | ✅ 已产出 |
| `docs/mobile-app/preview/assets/screen.css` `screen.js` `screens.js` | Mobile Screen Kit（组件库 + 运行时 + 屏幕注册表） | 9 | ✅ 已产出 |
| `docs/mobile-app/preview/tools/shot.mjs` | 逐屏截图工具（Playwright，2× DPR） | 9 | ✅ 已产出 |
| `docs/mobile-app/qa-report.md` | 独立设计评审与 QA 报告 | 8 | ⏳ 待评审任务产出 |

> 状态图例：✅ 已产出 ｜ 🔄 并行 agent 产出中 ｜ ⏳ 尚未开始。**所有设计稿均为「设计稿/待实施」，不代表生产代码已改。**

---

## 8. 非目标（明确不做）

1. 不改桌面端任何页面、路由、权限与接口。
2. 不做手机端代码编辑（Monaco / TipTap 不迁移），题库编辑、题目/班级/团队/学生管理、AI 配置、批改记录全部引导电脑。
3. 不做原生重写（不用 React Native / Flutter）；Android 走 Capacitor 壳复用 Web 产物。
4. 不做推送通知、不做离线提交队列、不做多语言、不做换肤系统。
5. 不引入新的后端接口；批量能力沿用现有班级级接口（对齐方式见 01/07）。
6. 本分支不写生产代码、不跑生产构建、不发包。

---

## 9. 待确认（进评审，不擅自扩范围）

| # | 问题 | 现状 / 影响 | 建议 |
|---|---|---|---|
| 1 | **缺屏：学生实训题工程包提交** | 真实路由存在（`/student/assignments/:assignmentId/project/:questionId`，工程包上传），37 屏未覆盖 | 补 1 屏 `student-project-submit`，或在 `student-assignment-detail` 内做分支状态；**未擅自加屏** |
| 2 | **缺屏：教师实训题审核（工程包）** | 真实路由存在（`/teacher/review/project/:submissionId`，文件树 + 评价式评分）；37 屏的 `teacher-review-code` 只画了编程题代码 | 确认是否单列 `teacher-review-project`，或复用代码屏的文件树头部 |
| 3 | **登录多学校二次选择** | 真实能力（`Login.vue` 的 `schoolOptions` 分支），`public-login` 未覆盖 | 建议作为 `public-login` 的同屏状态，不新增屏 |
| 4 | **批量语义** | 真实接口是**班级级** `batch-review` / `batch-publish`；设计稿是「筛选命中 N 份」 | 确认按班级批量（一期）或改后端支持按筛选；影响 `teacher-batch-confirm` 文案与计数来源 |
| 5 | **新增能力范围** | diff、答题卡、逐份队列、二维码接力、催交 均为新增设计，桌面无对应 | 确认哪些进一期；催交还需后端通知能力 |
| 6 | **管理员 KPI 数据源** | 桌面无 dashboard；`/admin/monitor` 返回系统/进程/日志，**不含在线人数/评分队列/平均响应** | 确认新接口或前端聚合；否则 `admin-home`/`admin-monitor` 的 KPI 只能标「示意」 |
| 7 | **≥768 回退口径** | 宽度 only 还是宽度 + `pointer: coarse` | 建议沿用 mobile-plan：`max-width: 767px` 且 `pointer: coarse` 才进 /m |
| 8 | **设置项范围** | `记住我`、字号三档在 UI 上可见，但当前登录无「记住我」逻辑、无字号设置 | 确认是否进首版；若不做，设计稿保留为禁用态或删除 |
