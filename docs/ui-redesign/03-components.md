# Exam-DeepSeek 组件规范（Component Specs）

> 分支 `feat/ui-redesign` · 对应 skill `afrexai-ui-design-system` Phase 4 · 配套 `02-design-tokens.css`
>
> **事实来源**：`00-design-brief.md`（原则与约束）· `02-design-tokens.css`（唯一取值来源）· `02-design-tokens.md`（antd 映射）。
> **本文不发明任何颜色 / 尺寸 / 圆角**。文中出现的每个数值都必须能指回令牌名；指不回去的，先回令牌文件补令牌，再使用。
> 落地顺序：ConfigProvider 主题 → 覆盖层 CSS → 逐页替换 → 用 §6 清单验收。

---

## 0. 全局约定（所有组件共享，不再逐条重复）

### 0.1 覆盖优先级 —— 只用这 4 层，禁止新增第 5 层

| 优先级 | 手段 | 管什么 | 落地位置 |
|---|---|---|---|
| 1 | `ConfigProvider :theme.token` | 全局色 / 圆角 / 字号 / 控件高 / 动效时长 | `client/src/styles/antd-theme.js` |
| 2 | `ConfigProvider :theme.components` | 单组件默认态（Table 表头、Menu dark、Card padding…） | 同上 |
| 3 | `styles/overrides/*.css`（全局，**禁用 `!important`**） | 令牌够不到的结构：菜单药丸、表格去竖线、分页间距 | `client/src/styles/overrides/` |
| 4 | 组件内 `<style scoped> :deep()` | 仅该页特例，**必须写注释说明为何不改令牌** | 业务 `.vue` |

引用顺序：`styles/tokens.css` → ConfigProvider 主题 → antd 样式 → `styles/overrides/*.css` → `style.css`（旧变量别名过渡层）。
> 顺序原因：`style.css` 现有 `--radius-sm: 8px` / `--radius-md: 11px` 与新令牌（6px / 8px）**同名不同值**，必须让令牌文件晚于旧定义生效，并在 `style.css` 顶部保留别名映射。

### 0.2 七态基线（每个交互组件逐态实现，缺一即不通过验收）

| 状态 | 触发 | 统一表达 |
|---|---|---|
| default | — | 组件令牌默认值 |
| hover | 指针悬停 | 背景升一档（`--bg-hover` / `--*-bg-hover`），边框转 `--input-bd-hover` |
| active | 按下 / 选中 | 再深一档（`--btn-primary-bg-active` / `--bg-active` / `--bg-selected`） |
| focus | Tab 键或点击 | `box-shadow: var(--ring-focus)`；危险元素用 `--ring-danger` |
| disabled | 无权限 / 流程已终结 | `--bg-disabled` + `--text-disabled` + 原生 `disabled` + `cursor:not-allowed` |
| loading | 请求进行中 | **保留原尺寸**，图标位换 `a-spin`，文案改进行时（"保存中…"），禁止整块消失 |
| error | 校验失败 / 请求失败 | 边框 `--border-danger` + `--ring-danger` + `--status-danger-fg` 文案，**不得只靠颜色传意** |

动效：交互反馈 `--duration-fast` + `--ease-out`；浮层进出 `--duration-base`。组件内**不得**再写时长常量（`prefers-reduced-motion` 已由令牌统一降到 1ms）。

### 0.3 密度档位

`data-density="compact"` 挂在 `<a-config-provider>` 的**父容器**上：教师端 / 管理端 = `compact`，学生端 / 使用文档 = `comfortable`。

| 用途 | 令牌（comfortable → compact） |
|---|---|
| 控件高 | `--control-h` 36 → 32；`--control-h-sm` 28 → 26；`--control-h-lg` 44 → 38 |
| 表格行高 | `--table-row-h` 52 → 44；单元格内距 `--table-cell-pad-y/x` 12/16 → 9/12 |
| 页面留白 | `--page-pad-y/x` 28/32 → 20/24 |
| 卡片内距 | `--card-pad`（= `--panel-pad`）20 → 16 |

**任何组件不得写死 32px / 36px / 12px 行高。**

### 0.4 ⚠️ 落地前必须先修的令牌缺陷（否则表格全部失准）

`02-design-tokens.css` 第 3 节「表格」块内有三行**自引用**，按 CSS 规范（自定义属性循环）判定为 guaranteed-invalid，会让 `var(--table-row-h)` 等全部失效：

| 行 | 现值 | 处理 |
|---|---|---|
| `--table-row-h` | `var(--table-row-h)` | **删除该行**（第 2 节已定义 52 / 44px） |
| `--table-cell-pad-y` | `var(--table-cell-pad-y)` | **删除该行** |
| `--table-cell-pad-x` | `var(--table-cell-pad-x)` | **删除该行** |

修法是**删行**而非改名（第 2 节 `:root` / `[data-density="compact"]` 已有同名令牌）。本文档按「已删除」书写。

### 0.5 组件总览索引

| # | 组件 | antd 对应 | 主要覆盖手段 | 关键令牌 |
|---|---|---|---|---|
| 1 | Button | `a-button` | ConfigProvider `Button` | `--btn-*` `--control-h` |
| 2 | Input / Textarea | `a-input` `a-textarea` `a-input-password` `a-input-number` | ConfigProvider `Input` + CSS placeholder | `--input-*` |
| 3 | Select | `a-select` | ConfigProvider `Select` | `--input-*` `--bg-selected` |
| 4 | DatePicker / RangePicker | `a-date-picker` `a-range-picker` | ConfigProvider `DatePicker`（继承 Input） | `--input-*` `--radius-md` |
| 5 | Form | `a-form` `a-form-item` | ConfigProvider `Form` | `--space-*` `--status-danger-fg` |
| 6 | Checkbox / Radio / Switch | `a-checkbox` `a-radio-group` `a-switch` | ConfigProvider 三组件 | `--brand-600` `--control-h-sm` |
| 7 | Upload | `a-upload-dragger` | ConfigProvider `Upload` + CSS 结构 | `--border-strong` `--bg-selected` |
| 8 | Tooltip / Popover | `a-tooltip` `a-popover` | ConfigProvider + CSS | `--shadow-lg` `--radius-lg` `--z-tooltip` |
| 9 | Table | `a-table` `a-pagination` | ConfigProvider `Table/Pagination` + 去竖线 CSS | `--table-*` |
| 10 | Stat / KPI 卡 | `a-card` + `a-statistic` | ConfigProvider `Card` + CSS | `--fs-display-2` `--score-*` |
| 11 | Progress | `a-progress` | ConfigProvider `Progress` | `--score-*` `--score-track` |
| 12 | Tag / StatusBadge | `a-tag` `a-badge` | ConfigProvider `Tag` + 变体类 | `--tag-*` `--status-*` |
| 13 | Timeline | `a-timeline` | ConfigProvider `Timeline` + CSS | `--status-*` `--border-subtle` |
| 14 | Tree / FileTree | `a-tree` | ConfigProvider `Tree` + CSS | `--bg-selected` `--fs-body-sm` |
| 15 | Card / Panel | `a-card` | ConfigProvider `Card` | `--card-*` |
| 16 | PageHeader | 无（v5 已弃用 `a-page-header`） | 自建 `AppPageHeader.vue` | `--page-*` |
| 17 | Tabs | `a-tabs` | ConfigProvider `Tabs` | `--brand-600` `--layout-subnav-h` |
| 18 | Sidebar 菜单 | `a-layout-sider` `a-menu` | ConfigProvider `Layout/Menu` + 药丸 CSS | `--sider-*` `--layout-sider-w` |
| 19 | Topbar / 用户菜单 | `a-layout-header` `a-dropdown` `a-avatar` | ConfigProvider `Layout` + CSS | `--topbar-*` `--z-topbar` |
| 20 | Steps | `a-steps` | ConfigProvider `Steps` | `--brand-600` `--status-success-fg` |
| 21 | Modal | `a-modal` `Modal.confirm` | ConfigProvider `Modal` | `--radius-xl` `--shadow-xl` `--z-modal` |
| 22 | Drawer | `a-drawer` | ConfigProvider `Drawer` | `--radius-lg` `--z-drawer` |
| 23 | Message / Notification | `message` `notification` | CSS + `ConfigProvider` 全局配置 | `--shadow-lg` `--z-message` |
| 24 | Alert | `a-alert` | CSS（组件令牌不全） | `--status-*-fg/bg/bd` |
| 25 | EmptyState | `a-empty` | CSS + 自建封装 | `--empty-*` |
| 26 | Skeleton | `a-skeleton` | ConfigProvider `Skeleton` | `--skeleton-*` |
| 27 | Lightbox | 无 | 自建 `AppLightbox.vue` | `--bg-mask-strong` `--z-lightbox` |
| 28 | ScorePanel | 无 | 自建（`a-card` + `a-progress` + `a-input-number`） | `--score-*` `--score-value-fs` |
| 29 | CodeViewer 外壳 | Monaco Editor | CSS + Monaco 主题文件 | `--font-mono` `--fs-code` `--bg-sunken` |
| 30 | RichEditor 工具栏 | TipTap | CSS + 图标替换 | `--bg-hover` `--bg-selected` |
| 31 | ProjectZipUploader | `a-tree` `a-alert` | CSS + 自建 | `--border-strong` `--status-danger-*` |

---

## 1. 基础控件

### 1.1 Button 按钮

| 维度 | 规范 |
|---|---|
| **① 用途** | 触发一个明确、可预期的动作：提交表单、进入审核、导出成绩、触发 AI 重评。 |
| **② Anatomy** | `按钮容器 > [前导图标?] + 文本标签 + [loading 指示器]`；IconButton 只有图标，文字按钮（link）无容器背景。 |
| **③ 尺寸 / 变体** | 尺寸：`large` = `--control-h-lg`、`middle` = `--control-h`（默认）、`small` = `--control-h-sm`。变体：**primary**（页面唯一主操作，`--btn-primary-bg`）、**default**（次要，`--btn-default-bg/-bd`）、**text/link**（表内跳转，`--btn-text-fg`）、**danger**（删除/退回，`--btn-danger-bg`）、**IconButton**（无文字，`--btn-pad-x` 归零、命中区 ≥ `--control-h`）。圆角 `--btn-radius`，内距 `--btn-pad-x`，字重 `--btn-font-weight`。 |
| **④ 状态** | default `--btn-*-bg` ｜ hover：primary → `--btn-primary-bg-hover`、default → `--btn-default-bg-hover` ｜ active → `--btn-primary-bg-active` ｜ focus `--ring-focus` ｜ disabled `--btn-disabled-bg/-fg/-bd` ｜ loading 保留宽度 + `a-spin`，文案转进行时 ｜ error 不适用于按钮本体，用 `--ring-danger` 标记危险确认入口。 |
| **⑤ Do / Don't** | **Do**：① 一屏一个 primary —— 评分审核页只有「保存审核」是 primary，「发布成绩」保持 default 直到审核完成；② 破坏性动作写动词 ——「删除题目」而非「确定」，并配 `Modal.confirm`；③ 批量动作在选中前 disabled，选中数写进文案「导出 12 条成绩」。 **Don't**：① 表内每行都放 primary（现状审核页每行「审核」都是 primary，应降级为 link 或每行仅 1 个 default）；② 用 `loading` 冒充 disabled；③ 图标按钮不带 `title` / `aria-label`。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Button = { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', paddingInline: 16, contentFontSize: 14 }`；`token.controlHeight` 已统一三档高度。CSS 覆盖：仅补 `.ant-btn-text` 的 hover 背景（`--bg-hover`）与 IconButton 正方形尺寸，禁用阴影。 |
| **⑦ A11y** | 全键盘可达，顺序 = 视觉顺序；`loading` 时加 `aria-busy="true"` 并禁用重复提交；IconButton 必须有 `aria-label`（如「折叠侧栏」）；`danger` 按钮不得只靠红色区分，必须写清动词；焦点环用 `--ring-focus`，不得 `outline:none` 后不补环。 |

### 1.2 Input / Textarea

| 维度 | 规范 |
|---|---|
| **① 用途** | 录入单行文本（题目标题、班级名、学号）或多行文本（题目描述、评分标准、教师评语）。 |
| **② Anatomy** | `字段容器 > [Label] + 输入框（[前导图标?] + 值 + [清除按钮] + [后缀/字数]） + [帮助或错误文案]`；Textarea 额外含右下角字数计数。 |
| **③ 尺寸 / 变体** | 高度 `--input-h`（= `--control-h`），内距 `--input-pad-x`，圆角 `--input-radius`，占位色 `--input-ph`。变体：单行 `a-input`、密码 `a-input-password`、数字 `a-input-number`（分数用，必须带 `:min` / `:max`）、多行 `a-textarea`（默认 3 行；教师评语 3 行、评分标准 6 行）。 |
| **④ 状态** | default `--input-bg` + `--input-bd` ｜ hover `--input-bd-hover` ｜ active（输入中）`--input-bd-focus` ｜ focus `--input-ring` ｜ disabled `--input-bg-disabled` + `--text-disabled` ｜ loading 不适用于输入框本体，改用只读 + 右侧 `a-spin` ｜ error `--border-danger` + `--ring-danger` + 下方 `--status-danger-fg` 文案。 |
| **⑤ Do / Don't** | **Do**：① 分数输入一律 `a-input-number` + `:min=0 :max=满分`，禁用自由文本（现状审核页最终分已用 input-number，保持并补齐 min/max 提示）；② 学号 / 工号用 `.text-mono` + `.tnum`，避免表格数字跳动；③ 长文本给字数上限与实时计数（题目描述 ≤ 2000 字）。 **Don't**：① 用 placeholder 当 label（占位符一输入即消失）；② 用 input 当选择器（班级 / 难度用 Select）；③ 同一表单里混用 3 种高度。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Input = { paddingBlock: 6, paddingInline: 12, activeShadow: 'none', errorActiveShadow: 'none' }`（焦点环统一由 `--ring-focus` 提供，避免 antd 双层阴影）；`token.colorBgContainer`、`colorBorder`、`controlHeight` 已从令牌取。CSS 覆盖：`::placeholder` 色、`a-textarea` 的 resize 手柄与计数排版。 |
| **⑦ A11y** | Label 必须用 `a-form-item label` 关联（antd 自动生成 `for` / `id`）；错误提示通过 `aria-describedby` 关联到输入框并加 `aria-invalid="true"`；数字输入支持 ↑↓ 步进；禁用状态用原生 `disabled` 而非仅视觉置灰；对比度：输入文字用 `--text-primary`（16.9:1），占位符 `--text-tertiary`（4.6:1，达 AA，仅用于提示）。 |

### 1.3 Select

| 维度 | 规范 |
|---|---|
| **① 用途** | 从有限集合中选一个（或少数几个）值：班级、难度、题型、语言、评分状态。 |
| **② Anatomy** | `选择器（当前值 + [标签] + 箭头）→ 下拉面板（[搜索框] + 选项列表 + [全选/清空]）`；多选时选择器内含 Tag 区。 |
| **③ 尺寸 / 变体** | 高度 `--input-h`；下拉面板对齐选择器左边，最小宽度 = 选择器宽度；选项行高 `--control-h`（compact 32px）。变体：单选、多选（`maxTagCount="responsive"`）、`showSearch`（班级 / 学生，> 15 项必须开）、`allowClear`（筛选场景）。 |
| **④ 状态** | default ｜ hover `--input-bd-hover` ｜ active（展开）`--input-bd-focus` ｜ focus `--ring-focus` ｜ disabled ｜ loading `loading` 属性（下拉内转圈，选择器保持可读） ｜ error 同 Input；**选中项**用 `--bg-selected` + `--text-link`，**悬停项**用 `--bg-hover`。 |
| **⑤ Do / Don't** | **Do**：① 筛选项固定宽度（现状审核页班级选择 260px，保持全站一致：筛选器宽 200 / 260 两档）；② 选项超过 15 条开 `showSearch` + 中文拼音首字母过滤（现有 `filterOption` 已做，保留）；③ 多选默认显示前 2 个 + 「+N」。 **Don't**：① 把 `a-select` 当菜单用（导航用 Menu）；② 选项文案带长句子（只用名词，≤ 12 字）；③ 空结果不给提示（必须给「无匹配班级」）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Select = { optionSelectedBg: <--bg-selected>, optionSelectedColor: <--text-primary>, optionSelectedFontWeight: 500, optionHeight: <--control-h>, optionPadding: '0 12px', zIndexPopup: 1000 }`（对应 `--z-dropdown`）。CSS 覆盖：下拉面板圆角 `--radius-lg` + `--shadow-lg`；多选标签用 `--tag-*`。 |
| **⑦ A11y** | 原生键盘：↑↓ 移动、Enter 选中、Esc 关闭、输入即过滤；展开时 `aria-expanded="true"`，列表 `role="listbox"`、选项 `role="option" aria-selected`（antd 内置，覆盖层不得破坏）；必须有可见 label 或 `aria-label`；筛选用 Select 时清空需可键盘触发（`allowClear` 的清除图标需可聚焦）。 |

### 1.4 DatePicker / RangePicker

| 维度 | 规范 |
|---|---|
| **① 用途** | 选择作业起止时间、截止时间、成绩发布时间点，或按时间范围筛选提交记录。 |
| **② Anatomy** | `选择器（日期文本 + 日历图标 + [清除]）→ 面板（头部导航 + 星期行 + 日期网格 + [时间列] + [预设侧栏]）`；RangePicker 为双输入 + 双面板 + 区间高亮。 |
| **③ 尺寸 / 变体** | 输入框同 `--input-h`；单元格 `--control-h` 见方（compact 32 / comfortable 36）；面板圆角 `--radius-lg`、阴影 `--shadow-lg`、层级 `--z-dropdown`。变体：单日、日期区间、日期 + 时间（作业起止必须 `showTime`）、快捷预设（今天 / 本周 / 本学期）。 |
| **④ 状态** | default ｜ hover `--input-bd-hover` ｜ active（面板展开）`--input-bd-focus` ｜ focus `--ring-focus` ｜ disabled（已发布作业的起止时间必须 disabled） ｜ loading 不适用 ｜ error：**结束时间早于开始时间**不进 error 态，由 Form 校验拦截并提示「结束时间需晚于开始时间」。 |
| **⑤ Do / Don't** | **Do**：① 作业起止统一 `YYYY-MM-DD HH:mm`，表格同格式展示，禁止 ISO 原串（现状题库列表显示 `2026-06-01T17:02:35.065Z`，必须改）；② 提供「本学期」等预设，减少教师点选；③ 显示按浏览器本地时区，服务端存 UTC。 **Don't**：① 用 RangePicker 做单日筛选（用单 DatePicker）；② 禁用日期不给出原因；③ 直接在 `change` 里发请求（需与筛选表单一起提交）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.DatePicker = { cellHeight: <--control-h>, cellWidth: <--control-h>, presetsWidth: 120, zIndexPopup: 1000 }`，其余继承 `Input` 令牌。CSS 覆盖：面板圆角 / 阴影；`.ant-picker-cell-inner` 圆角 `--radius-sm`；区间高亮改 `--bg-selected`。 |
| **⑦ A11y** | 键盘完整可用：Tab 进入 → 方向键选日 → Enter 确认 → Esc 关闭；`aria-label` 明确「开始时间」/「结束时间」；面板单元格用 `aria-selected`；时间列支持直接键入；日期文本对比度用 `--text-primary`（不得用 `--text-tertiary`）。 |

### 1.5 Form（label 布局与校验反馈）

| 维度 | 规范 |
|---|---|
| **① 用途** | 编排字段、约束与提交，承载建题、建班、AI 配置、作业发布等录入流程。 |
| **② Anatomy** | `表单 > FormItem（Label + 必填星号 + 控件 + 帮助文案 / 错误文案）`；底部为动作区（次要在左、主操作在右）。 |
| **③ 尺寸 / 变体** | Label 布局三选一：**vertical**（默认，弹窗内与窄栏表单）；**horizontal** 固定 `labelCol`（长表单，标签列固定 6 或 8 栅格）；**inline**（筛选条，不换行、控件高 `--control-h`）。字段纵向间距：`itemMarginBottom` = `--stack-gap`（16 / compact 12）；分区间距 `--space-6`；区块标题 `--fs-title-3` + `--fw-semibold`。 |
| **④ 状态** | default ｜ hover 由各控件自管 ｜ active 由各控件自管 ｜ focus 字段获得焦点时 label 转 `--text-strong` ｜ disabled 整组 `disabled` 并降低不透明度 ｜ loading 提交按钮 loading + 全表单 `disabled`（防重复提交） ｜ error 字段边框 `--border-danger`，错误文案 `--fs-caption` + `--status-danger-fg`。 |
| **⑤ Do / Don't** | **Do**：① 文本字段 `validateTrigger="blur"`、选择类 `"change"`，避免打字过程中报错；② 一次提交只报「第一个错误并滚动聚焦」（`scrollToFirstError`）；③ 错误文案给约束而非复述——「满分需为 1–100 的整数」优于「满分不合法」。 **Don't**：① 用 tooltip 承载错误（键盘 / 触屏不可达，必须行内展示）；② 提交前才校验全部（长表单体验崩坏）；③ 同一弹窗塞超过 12 个字段（改两栏或抽屉）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Form = { itemMarginBottom: 16, labelColor: <--text-secondary>, labelFontSize: 14, labelHeight: 22, verticalLabelPadding: '0 0 4px', labelRequiredMarkColor: <--status-danger-fg> }`。CSS 覆盖：`.ant-form-item-explain-error` 字号 `--fs-caption`、色 `--status-danger-fg`、上间距 `--space-1`；必填星号固定在 label 前。 |
| **⑦ A11y** | 每个控件都要有可见 label（禁止仅 placeholder）；错误文案与控件 `aria-describedby` 关联；提交失败后焦点移到第一个错误字段（antd 的 `scrollToFirstError` 只滚动不聚焦，需补 `focus()`）；必填字段加 `aria-required="true"`；表单用 `<form>` 语义并支持 Enter 提交（多行文本除外）。 |

### 1.6 Checkbox / Radio / Switch

| 维度 | 规范 |
|---|---|
| **① 用途** | Checkbox 多选（批量勾选、选项类小问）；Radio 单选（题型、模式）；Switch 即时开关（启用 / 停用、练习模式）。 |
| **② Anatomy** | `控件（勾选框 / 圆点 / 轨道）+ 标签文本 + [说明文案]`；Switch 为 `轨道 + 滑块 + [内嵌文字]`。 |
| **③ 尺寸 / 变体** | 控件 16×16；Switch 轨道高 22px、宽 44px（compact 用 `small`，高 18px）。整行可点区域高度 ≥ `--control-h-sm`；选项组纵向间距 `--space-2`，横向 `--space-4`。 |
| **④ 状态** | default ｜ hover 边框 `--input-bd-hover` ｜ active / 选中 填充 `--brand-600` ｜ focus `--ring-focus`（环须包住控件而非标签） ｜ disabled `--bg-disabled` + `--text-disabled` ｜ loading 用 `a-spin` 包住整组，禁止禁用后再变可用 ｜ error 选项组整体加 `--status-danger-fg` 文案（不单独标红某一项）。 |
| **⑤ Do / Don't** | **Do**：① 需要「保存」才生效的用 Checkbox / Radio，立即生效且可回滚的用 Switch；② 危险开关（关闭 AI 评分）必须二次确认；③ 选项 ≤ 5 用横向 Radio，> 5 用纵向或 Select。 **Don't**：① 用 Switch 表示「提交表单」（语义错，应用 Checkbox）；② 只有「启用 / 停用」两态却用 Checkbox；③ 把 Switch 混用成主操作按钮。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Checkbox = { borderRadiusSM: <--radius-xs> }`、`components.Radio = { radioSize: 16, dotSize: 6 }`、`components.Switch = { trackHeight: 22, trackMinWidth: 44, handleSize: 18 }`；色值全部走 `token.colorPrimary`。CSS 覆盖：标签与控件的水平间距（`--space-2`）、Switch 焦点环。 |
| **⑦ A11y** | 键盘：Space 切换、Radio 组内 ↑↓ 移动；`role` / `aria-checked` 由 antd 提供，覆盖层不得移除；Switch 必须有 `aria-label`（"启用 AI 自动评分"）；不得只用颜色表示开关状态（滑块位置 + 文字标签双通道）；禁用态用原生 `disabled`。 |

### 1.7 Upload

| 维度 | 规范 |
|---|---|
| **① 用途** | 上传题目材料图、附件、学生作答截图等**非工程包**文件（工程包见 §5.4）。 |
| **② Anatomy** | `拖拽区（图标 + 主文案 + 约束说明 + 选择按钮）→ 文件列表（缩略图 / 图标 + 文件名 + 体积 + 进度 + 删除）`。 |
| **③ 尺寸 / 变体** | 拖拽区最小高度 160px（compact 132px），圆角 `--radius-lg`，虚线边框 1px `--border-strong`；内距 `--space-6`。变体：拖拽区、按钮触发、图片墙（`list-type="picture-card"`，仅材料图）。 |
| **④ 状态** | default 虚线 `--border-strong` + 底 `--bg-surface-2` ｜ hover / dragover 边框 `--input-bd-hover` + 底 `--bg-selected` ｜ active 边框实线 `--border-focus` ｜ focus `--ring-focus` ｜ disabled `--bg-disabled` ｜ uploading 单文件进度条 `--brand-600`，可取消 ｜ error 超限 / 类型不符：文件条目标 `--status-danger-*`，并在拖拽区下方常驻一行约束。 |
| **⑤ Do / Don't** | **Do**：① **约束前置**——选文件之前就写清「支持 jpg / png / webp，单个 ≤ 5MB，最多 9 张」；② 前端先校验类型与体积再发请求，失败不占配额；③ 上传中显示文件名与百分比，允许单文件取消。 **Don't**：① 上传失败只弹「上传失败」（要说明是体积还是格式）；② 允许"任意类型"（材料图必须白名单）；③ 成功后自动清空列表导致教师无法核对。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Upload = { actionsColor: <--text-tertiary> }`（组件令牌很少，主要靠 CSS）。CSS 覆盖：`.ant-upload-drag` 的边框样式与 hover 底色、圆角、内距；`.ant-upload-list-item` 的行高与删除按钮命中区。 |
| **⑦ A11y** | 拖拽必须有等价键盘路径（Tab 到选择按钮 → Enter 打开文件对话框）；隐藏的 `input[type=file]` 不能 `display:none` 后失去可聚焦性，需由 `a-upload` 的按钮触发；错误提示 `role="alert"`；进度条 `role="progressbar"` + `aria-valuenow`；删除按钮 `aria-label` 含文件名（"删除 材料1.png"）。 |

### 1.8 Tooltip / Popover

| 维度 | 规范 |
|---|---|
| **① 用途** | Tooltip 补充一句解释（图标含义、截断全称）；Popover 承载小段结构化内容（评分规则说明、提示词预览、更多操作）。 |
| **② Anatomy** | Tooltip：`触发元素 + 气泡（纯文本，无标题）`。Popover：`触发元素 + 浮层（[标题] + 正文 + [操作]）`；可含箭头。 |
| **③ 尺寸 / 变体** | 浮层圆角：Tooltip `--radius-md`、Popover `--radius-lg`；内距 `--space-3` / `--space-4`；最大宽度 320px（Popover 480px），超出换行；层级 `--z-tooltip`（1400），**不得被 Drawer / Modal 遮挡**（依靠 Portal 保证）。 |
| **④ 状态** | default 隐藏 ｜ hover / focus 显示（`mouseenter` + `focus` 双触发） ｜ active 不适用 ｜ focus 触发元素保留 `--ring-focus` ｜ disabled 触发元素仍可悬停显示原因（"已发布作业不可修改"） ｜ loading 不适用 ｜ error 不适用（错误用行内文案，不用 Tooltip）。 |
| **⑤ Do / Don't** | **Do**：① 表格里被 `.truncate` 的长文本用 Tooltip 显示全称（如完整题目名）；② 用 Popover 承载「AI 评分标准」这类只读说明，避免跳页；③ 气泡内容 ≤ 2 行，超长改 Drawer。 **Don't**：① 把必经信息（校验错误、权限原因）塞进 Tooltip；② 在 Tooltip 里放按钮（需可交互 → 用 Popover）；③ 中文文案末尾不加句号（保持轻量）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Tooltip = { zIndexPopup: 1400, colorBgSpotlight: <--gray-900>, colorTextLightSolid: <--text-inverse> }`、`components.Popover = { zIndexPopup: 1400, titleMinWidth: 120 }`。CSS 覆盖：圆角、内距、`max-width`；深色主题下气泡背景改用 `--bg-surface-2` + `--border-default`。 |
| **⑦ A11y** | 触发元素需可聚焦（`tabindex="0"` 或原生按钮），Tooltip 内容与触发元素 `aria-describedby` 关联；Popover 支持 Esc 关闭且焦点可进入与归还；不得用 Tooltip 承载唯一关键信息（悬停才可见 = 键盘 / 触屏用户丢失）；气泡文字对比度 ≥ 4.5:1。 |

---

## 2. 数据展示

### 2.1 Table

| 维度 | 规范 |
|---|---|
| **① 用途** | 全站主视图：题库、作业、班级学生、评分审核列表、系统监控，承载排序 / 筛选 / 批量 / 分页。 |
| **② Anatomy** | `工具栏（左：筛选 / 搜索 · 右：列设置 / 刷新 / 导出）→ 表头（含排序箭头、筛选图标）→ 表体（行 + 单元格 + 展开行）→ 空态 / 骨架 → 底部分页栏`。 |
| **③ 尺寸 / 变体** | 行高 `--table-row-h`（52 / compact 44），表头高 `--table-header-h`（44），单元格内距 `--table-cell-pad-y/x`；表头底 `--table-header-bg`、字色 `--table-header-fg`、字重 `--table-header-fw`；边框 `--table-bd`；悬停行 `--table-row-hover`、选中行 `--table-row-selected`；粘性表头阴影 `--table-sticky-shadow`。**变体**：标准表（默认）、紧凑表（compact 密度）、卡片列表（< 768px 时替代表格）。 |
| **④ 状态** | default ｜ hover 行底 `--table-row-hover`、操作列按钮显形 ｜ active 行按下 `--bg-active` ｜ focus 行可聚焦 + `--ring-focus`（批量键盘勾选） ｜ disabled 单元格用 `--text-disabled`（不可编辑的分数） ｜ loading 见下方「加载 / 空 / 错误 三态」 ｜ error 表格区整体替换为错误态 + 重试按钮。 |
| **⑤ Do / Don't** | **Do**：① **列宽策略**见下表，主标识列弹性、其余定宽，禁止全部自动宽度；② **粘性表头**必开（`sticky`），滚动投影用 `--table-sticky-shadow`；③ **批量选择**：选中后工具栏切换为「已选 12 项 ｜ 清空 ｜ 批量动作」，导出 / 删除按钮文案带数量。 **Don't**：① 表内每行放多个 primary 按钮（现状评分审核每行一个 primary「审核」，改为 link 或单 default）；② 表头 / 内容居中（`02-design-tokens.md` 明确要求「表头不居中」；现状 `DataTable.vue` 的 `centerContent` 默认 `true` + `text-align: center !important` 必须改为左对齐并删除该规则）；③ 用 `!important` 覆盖 antd（现状 `DataTable.vue` 4 处，属验收项）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Table = { headerBg, headerColor, headerSplitColor: 'transparent', rowHoverBg, borderColor, cellPaddingBlock, cellPaddingInline, cellFontSize: 14 }`（对应 `--table-*`）；`components.Pagination = { itemSize: 32, itemActiveBg: <--bg-selected> }`。CSS 覆盖：去掉竖线、去掉外框粗边、粘性表头阴影、分页栏与表格同卡片贴合。 |
| **⑦ A11y** | `<table>` 语义由 antd 提供，覆盖层不得改成 div 布局；排序表头用 `aria-sort`；批量勾选的表头复选框需 `aria-label="全选本页"`；粘性表头滚动时不得遮挡聚焦元素（`scroll-margin-top` = 表头高）；操作列按钮 `aria-label` 要含行标识（"审核 张三 的作业"）。 |

**列宽策略（强制）**

| 列类型 | 宽度 | 对齐 | 规则 |
|---|---|---|---|
| 选择列 | 48px 固定 | 居中 | 仅在存在批量动作时出现 |
| 序号 / 学号 | 88–120px | 左 | `.text-mono` + `.tnum` |
| 主标识（题目名 / 学生名） | 弹性，最小 240px | 左 | 单行 `.truncate` + Tooltip 全称 |
| 状态 | 120px 固定 | 左 | StatusBadge（§2.4） |
| 时间 | 168px 固定 | 左 | `YYYY-MM-DD HH:mm` + `.tnum` |
| 分数 | 96px 固定 | 右 | `.tnum`，副行「/ 满分」用 `--text-tertiary` |
| 操作 | 160–200px 固定（`fixed: 'right'`） | 左 | ≤ 2 个按钮 + 「更多」下拉 |

**加载 / 空 / 错误 三态**

| 态 | 触发 | 呈现 |
|---|---|---|
| loading（首屏） | 首次请求 | 表格骨架：1 行表头 + 8 行占位，列数 = 实际列数（`--skeleton-bg`） |
| loading（翻页 / 筛选） | 已有数据 | `a-spin` 包裹 + **保留旧数据**（禁止清空后闪白） |
| empty | 请求成功且为空 | EmptyState（§4.5），按「无数据 / 无搜索结果 / 无权限」三选一 |
| error | 请求失败 | 表体区替换为错误提示 + 「重试」按钮，表头保留 |

**分页**

| 项 | 规范 |
|---|---|
| 默认页大小 | 20 条；选项 20 / 50 / 100（`showSizeChanger` 仅在 total > 100 时开启） |
| 总数文案 | 统一「共 N 条」，`.tnum`，`--text-secondary` |
| 位置 | 固定在卡片底部（`--bg-surface-2` 底 + `--table-bd` 上边框，**不得硬编码 `#fafafa` / `#f0f0f0`**，现状 `DataTable.vue` 须替换） |
| 翻页行为 | 翻页后滚动回表体顶部；动效 ≤ `--duration-base` 且只动 `opacity` / `transform` |

### 2.2 Stat / KPI 卡片

| 维度 | 规范 |
|---|---|
| **① 用途** | 一屏给出关键数字：待审核人数、AI 评分完成率、班级平均分、评分异常数。 |
| **② Anatomy** | `卡片 > 标签（`--fs-caption` + `--text-secondary`） + 数值（`--fs-display-2` + `--fw-semibold` + `.tnum`） + [单位 / 满分] + [环比 delta] + [迷你趋势或进度]`。 |
| **③ 尺寸 / 变体** | 卡片高 ≥ 96px（compact）/ 112px，内距 `--card-pad`，圆角 `--card-radius`；数值字号 `--fs-display-2`（26px），**不用** `--score-value-fs`（40px 留给 ScorePanel）。变体：点击型（可跳转，hover 抬升 `--card-shadow-raised`）、只读型、带进度型。 |
| **④ 状态** | default `--card-bd` 描边、无阴影 ｜ hover 可点击卡：`--card-shadow-raised` + 边框 `--border-strong` ｜ active 压下 1px ｜ focus `--ring-focus`（整卡可聚焦） ｜ disabled 数据未就绪：数值显示 `—` 且 `--text-disabled` ｜ loading 数值位用骨架条（宽 60%、高 = 数值行高） ｜ error 数值位显示 `—` + 右上角「重试」小图标，禁止显示 0 冒充。 |
| **⑤ Do / Don't** | **Do**：① 数值永远配 `.tnum`，实时刷新时不跳动；② delta 用状态色 + 箭头 + 文字（"较上次 +8.2%"），不只给颜色；③ 4 个以内一行（栅格 4 等分），超过分两行或折叠。 **Don't**：① 把图表塞进 KPI 卡（用独立面板）；② 无数据时显示「0」（歧义：真 0 还是没加载）；③ 用 KPI 卡承载长文案。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Card = { paddingLG: 20, borderRadiusLG: 12, headerFontSize: 16 }` + `components.Statistic = { contentFontSize: 26, titleFontSize: 12 }`。CSS 覆盖：数值字重 600 与 `.tnum`、delta 行排版、可点击卡 hover 阴影过渡（`--transition-surface`）。 |
| **⑦ A11y** | 可点击卡必须用 `<a>` / `<button>` 语义而非 `@click` 的 div；整卡可聚焦并显示 `--ring-focus`；数字变化用 `aria-live="polite"`，且**不要**卡片整体 live（会刷屏），只标注数值节点；数值含义不能只靠位置（标签与数值同组并 `aria-labelledby`）。 |

### 2.3 Progress

| 维度 | 规范 |
|---|---|
| **① 用途** | 表达进度：AI 评分完成率、班级提交率、单题得分占满分比。 |
| **② Anatomy** | `轨道 + 填充条 + [百分比文字 / 分数文字]`；线形、环形两种。 |
| **③ 尺寸 / 变体** | 线形高度 6px（列表内）/ 8px（详情内），圆角 `--radius-pill`；轨道 `--score-track`；环形直径 80px（KPI 内）/ 120px（详情）。变体：确定进度（`percent`）、不确定进度（`status="active"`，用于「评分中」）、分数条（按 `--score-*` 取色）。 |
| **④ 状态** | default 填充 `--status-info-fg` ｜ hover 不适用 ｜ active 不确定态流动动画（reduced-motion 下降级为静态） ｜ focus 不适用（非交互） ｜ disabled 轨道灰化 `--score-track` ｜ loading = 不确定进度 ｜ error 填充 `--score-fail` 并配文字「评分异常」。 |
| **⑤ Do / Don't** | **Do**：① 分数条按阈值取色：≥ 90 `--score-excellent`、75–89 `--score-good`、60–74 `--score-pass`、< 60 `--score-fail`；② 进度旁必须有数字（"128 / 156 人"）；③ 不确定进度只用于真·未知时长（AI 评分轮询），一旦拿到总数即切为确定进度。 **Don't**：① 用纯色条但无阈值语义；② 用 Progress 做装饰性加载（用 Skeleton）；③ 百分比与分数同时出现却互相矛盾。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Progress = { defaultColor: <--status-info-fg>, remainingColor: <--score-track>, lineBorderRadius: 999, circleTextFontSize: 20 }`。CSS 覆盖：分数条分级着色用变体类（`.score-band--excellent` 等）映射 `--score-*`；轨道高度与 `.tnum` 文字。 |
| **⑦ A11y** | `role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax` + `aria-label`（"AI 评分进度"）；不确定态不设 `aria-valuenow` 并加 `aria-busy="true"`；颜色不能是唯一区分（等级必须同时有文字或阈值说明）；填充色与轨道色差 ≥ 3:1。 |

### 2.4 Tag / StatusBadge

| 维度 | 规范 |
|---|---|
| **① 用途** | 用统一视觉语言表达状态（待评分 / 评分中 / 已审核 / 已发布 / 评分异常），以及题型、语言、练习模式等分类。 |
| **② Anatomy** | `[状态点 / 图标?] + 文本`；StatusBadge = 8px 圆点 + 文本（表格内轻量场景）；Tag = 有底色块 + 文本（详情页与徽标）。 |
| **③ 尺寸 / 变体** | Tag 高 `--tag-h`（22px），圆角 `--tag-radius`，内距 `--tag-pad-x`，字号 `--tag-fs`（12px）。变体按语义取三元组：`--tag-neutral/brand/success/warning/danger/accent-{fg,bg}`；边框用对应 `--status-*-bd`。**禁止使用 antd 预设色名**（现状 `Review.vue` / `ReviewDetail.vue` 的 `color="green / orange / red / purple / blue"` 必须替换为 StatusBadge 变体类）。 |
| **④ 状态** | default 静态 ｜ hover 仅可点击 Tag（筛选标签）：底加深一档 ｜ active 选中筛选标签：底 `--brand-600` + 字 `--text-on-brand` ｜ focus `--ring-focus` ｜ disabled 不适用 ｜ loading「评分中」：文本前加 8px 脉冲点（`--duration-slow` 循环，reduced-motion 下静态） ｜ error「评分异常」走 `--tag-danger-*`。 |
| **⑤ Do / Don't** | **Do**：① 全站唯一状态字典（见下表），新状态必须先入字典再上屏；② 同屏出现多个「已 / 待」时靠色相区分——「已审核」用 accent（紫）、「已发布」用 success（绿），避免两个绿色混淆；③ 数量写进标签（"待评分 12 人"）。 **Don't**：① 直接用 `color="green"`（脱离令牌，暗色主题会崩）；② 一行超过 4 个标签（改用文字或折叠）；③ 用标签承载可点击的主操作。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Tag = { defaultBg: <--status-neutral-bg>, defaultColor: <--status-neutral-fg>, borderRadiusSM: 6, fontSizeSM: 12, lineHeightSM: 1.8 }`。CSS 覆盖：6 个语义变体类（`.tag--success` 等）映射 `--tag-*`；脉冲点关键帧；可点击 Tag 的 hover / active / focus。 |
| **⑦ A11y** | 纯展示标签无需交互语义；**可点击的筛选标签**必须是 `<button>` 或带 `tabindex` 且支持 Enter / Space，并给 `aria-pressed`；状态不能只靠颜色（文本必须自解释）；「评分中」的脉冲点加 `aria-label="评分中"`；标签文字与底色对比度 ≥ 4.5:1（`--status-*-fg` 在 `--status-*-bg` 上均已按 AA 选定）。 |

**状态字典（唯一事实来源，新增状态须先登记）**

| 业务状态 | 变体 | 令牌 | 出现位置 |
|---|---|---|---|
| 草稿 / 未提交 | neutral | `--tag-neutral-*` | 学生作业列表、题库 |
| 待评分 | neutral + 脉冲点 | `--tag-neutral-*` | 评分审核列表、审核详情 |
| 评分中 | brand + 脉冲点 | `--tag-brand-*` | 审核详情、监控 |
| AI 已评分（待审核） | brand | `--tag-brand-*` | 审核详情 |
| 待审核 | warning | `--tag-warning-*` | 评分审核列表 |
| 已审核 | accent（紫） | `--tag-accent-*` | 评分审核列表、审核详情 |
| 已发布 | success | `--tag-success-*` | 学生成绩、审核详情 |
| 评分异常 / 超时缺交 | danger | `--tag-danger-*` | 监控、评分审核 |
| 练习模式 | success | `--tag-success-*` | 题目顶栏 |
| 题型：编程题 / 客观题 | brand / accent | `--tag-brand-*` / `--tag-accent-*` | 建题、审核 |

### 2.5 Timeline（评分流程，可选但推荐）

| 维度 | 规范 |
|---|---|
| **① 用途** | 展示单份提交的评分轨迹：学生提交 → Worker 领取 → AI 返回 → 教师终审 → 成绩发布。 |
| **② Anatomy** | `轴线 + 节点（圆点 / 图标） + 标题 + 时间戳 + 描述 + [折叠详情]`。 |
| **③ 尺寸 / 变体** | 节点直径 10px（未到达，空心 1px 边框）/ 12px（当前 / 完成）；轴线宽 2px `--border-subtle`；项间距 `--space-4`；时间戳 `--fs-caption` + `--text-tertiary` + `.tnum`。变体：`pending` / `active` / `done` / `error` 四态节点。 |
| **④ 状态** | default 未到达：空心点 + `--text-tertiary` ｜ hover 描述过长可展开 ｜ active 当前步：实心 `--brand-600` + 外环 `--ring-focus` ｜ focus 不适用 ｜ disabled 不适用 ｜ loading 最后一步显示 `a-spin`（"AI 评分中，已等待 42s"） ｜ error 失败步：`--status-danger-fg` 点 + 「重试评分」动作。 |
| **⑤ Do / Don't** | **Do**：① 只用于**单条记录的纵向轨迹**（Steps 用于用户当前操作的横向流程）；② 每个节点带时间戳，「评分中」带已耗时；③ 失败节点直接给恢复动作。 **Don't**：① 用 Timeline 替代审计日志表格（超过 8 条折叠）；② 节点文案超过 2 行；③ 用它承载跨记录的对比。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Timeline = { tailColor: <--border-subtle>, tailWidth: 2, dotBg: <--bg-surface>, dotBorderWidth: 1, itemPaddingBottom: 16 }`。CSS 覆盖：四态节点的颜色与尺寸变体、时间戳排版、进行中指示器位置。 |
| **⑦ A11y** | 用有序列表语义（`<ol>`）；当前步加 `aria-current="step"`；失败节点内容 `role="alert"`；时间戳用 `<time datetime>`；颜色之外必须有图标 / 文字（✓ 完成 / ● 进行中 / ✗ 失败）区分状态。 |

### 2.6 Tree / FileTree（工程包资源管理器）

| 维度 | 规范 |
|---|---|
| **① 用途** | 浏览 zip 工程包的文件结构，并在 CodeViewer 中打开选中文件。 |
| **② Anatomy** | `面板标题（"资源管理器"）→ 树（展开箭头 + 文件类型图标 + 名称）→ [底部统计]`。 |
| **③ 尺寸 / 变体** | 节点行高 26px（compact）/ 30px；缩进 `--space-4`（16px）/ 级；图标 14px；字号 `--fs-body-sm`（13px）；目录 `--fw-medium`、文件 `--fw-regular`。变体：可选中（编辑态）、只读回看（`treeData` 外部传入，默认全展开）。 |
| **④ 状态** | default 透明 ｜ hover 行底 `--bg-hover` ｜ active / 选中 行底 `--bg-selected` + 文字 `--text-link` ｜ focus `--ring-focus`（环绕行） ｜ disabled 不适用 ｜ loading 5 行骨架（带缩进阶梯） ｜ error 面板内替换为「工程包解析失败」+ 重新上传。 |
| **⑤ Do / Don't** | **Do**：① 目录图标色必须令牌化（现状 `ProjectZipUploader.vue` 硬编码 `#dcb67a` → 新增 `--icon-folder` 或复用 `--amber-400`）；② 长路径用 `.truncate` + Tooltip 全名，禁止换行撑高行；③ 过滤后的树要显示统计「已保留 128 个文件 · 3.2 MB」。 **Don't**：① 让教师在树里做文件管理（只读浏览）；② 默认全部收起（回看态默认全展开，减少点击）；③ 用 emoji 当文件图标（用 `file-icons-js` + 后缀兜底）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Tree = { titleHeight: 26, nodeHoverBg: <--bg-hover>, nodeSelectedBg: <--bg-selected>, indentSize: 16, titleFontSize: 13, directoryNodeSelectedBg: <--bg-selected>, directoryNodeSelectedColor: <--text-link> }`。CSS 覆盖：图标与文字间距、行 `.truncate`、骨架缩进阶梯。 |
| **⑦ A11y** | 键盘：↑↓ 移动、→ 展开 / 进入、← 收起 / 回退、Home / End 首尾、Enter / Space 选中（`a-tree` 已内置，覆盖层不得破坏）；容器 `role="tree"`、节点 `role="treeitem"` + `aria-expanded` + `aria-selected`；选中文件变化需播报（`aria-live="polite"` 区域报「已打开 main.cpp」）。 |

---

## 3. 容器与导航

### 3.1 Card / Panel

| 维度 | 规范 |
|---|---|
| **① 用途** | 把相关内容归组为一块可辨识的区域（表单区、评分区、监控区）。 |
| **② Anatomy** | `卡片（[头部：标题 + 描述 + 右侧操作] + 主体 + [底部动作条]）`；Panel 为无头部、只有描边与内距的轻量变体。 |
| **③ 尺寸 / 变体** | 底 `--card-bg`、描边 `--card-bd`、圆角 `--card-radius`（12px）、内距 `--card-pad`；默认**无阴影**（`--card-shadow: none`，平面优先靠边框分层），仅「悬浮 / 可点击」变体用 `--card-shadow-raised`。变体：标准卡、可点击卡、面板（无头）、内嵌卡。 |
| **④ 状态** | default 描边 1px ｜ hover 仅可点击卡：`--card-shadow-raised` + 边框 `--border-strong` ｜ active 压下 1px（`--transition-surface`） ｜ focus 可点击卡 `--ring-focus` ｜ disabled 不适用 ｜ loading 主体换 Skeleton，**头部保留**（标题不闪） ｜ error 主体换错误提示 + 重试。 |
| **⑤ Do / Don't** | **Do**：① 卡片间纵向间距用 `--stack-gap`（16 / compact 12）；② 卡内不嵌套卡片（用 `--border-subtle` 分隔线代替）；③ 审核页左右栏各自成卡，滚动互不影响。 **Don't**：① 用卡片堆出「卡片墙」（教师端列表页大片留白即反例，改为一整块表格卡）；② 给静态卡加阴影（阴影只表示层级抬升）；③ 卡片内距随手改（必须用 `--card-pad`）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Card = { paddingLG: 20, borderRadiusLG: 12, headerFontSize: 16, headerHeight: 48, headerBg: 'transparent', bodyPadding: <--card-pad> }`。CSS 覆盖：`style.css` 现有 `.ant-card { border: 1px solid var(--hairline); box-shadow: none; }` 改为令牌版（`--card-bd`），并在覆盖层统一卡片过渡（`--transition-surface`）。 |
| **⑦ A11y** | 可点击卡用 `<a>` / `<button>` 或 `role="link"` + `tabindex` + Enter / Space；卡片标题用真实标题元素（`h2` / `h3`）维持大纲层级；加载态 `aria-busy="true"`；错误态 `role="alert"`；不得靠阴影变化传达唯一状态。 |

### 3.2 PageHeader（含面包屑与主操作）

| 维度 | 规范 |
|---|---|
| **① 用途** | 说明「这是哪个页面、我在哪、能做什么」，并安置页面唯一主操作。 |
| **② Anatomy** | `面包屑（可选，层级 ≥ 3 时出现）→ 主行（返回箭头? + 标题 + [状态标签] + 右侧主 / 次操作）→ 描述行（可选）→ [子导航条 / Tabs]`。 |
| **③ 尺寸 / 变体** | 标题 `--page-title-fs`（22px）+ `--page-title-fw`（600）；描述 `--page-desc-fs` + `--page-desc-fg`；标题与描述间距 `--page-header-gap`（16）；面包屑 `--fs-body-sm` + `--text-tertiary`；带 Tabs 时子导航条高 `--layout-subnav-h`（44px）。变体：标准页头、带子导航页头、详情页头（返回箭头 + 记录标识）。 |
| **④ 状态** | default 静态 ｜ hover 面包屑链接 `--text-link` ｜ active 当前页面包屑不可点、`--text-primary` ｜ focus 主操作按钮 `--ring-focus` ｜ disabled 主操作在数据未就绪时 disabled 并给原因（"请先选择班级"） ｜ loading 标题旁次要信息（学生数 / 题量）用骨架条 ｜ error 不适用。 |
| **⑤ Do / Don't** | **Do**：① 主操作永远**右侧、优先 primary、全页唯一**（现状审核详情页把「保存审核 / 发布成绩」放在底部动作条，是对的，页头就不要重复）；② 面包屑只到可点击的父级，最深 3 级；③ 详情页头带记录标识（学生姓名 / 学号，学号用 `.text-mono`）。 **Don't**：① 把筛选器堆进标题行（设计原则 2：筛选靠边收拢，用表格工具栏）；② 标题过长换行（`.truncate` + Tooltip）；③ 使用 antd 已弃用的 `a-page-header`（自建 `AppPageHeader.vue`）。 |
| **⑥ antd 覆盖** | 无对应组件（v5 移除 `PageHeader`）→ 自建 `AppPageHeader.vue`，内部只用令牌；面包屑用 `a-breadcrumb` 并 CSS 覆盖分隔符色（`--text-tertiary`）与字号（`--fs-body-sm`）。 |
| **⑦ A11y** | 标题为 `<h1>`（每页唯一）；面包屑用 `<nav aria-label="面包屑">` + `<ol>`，末项 `aria-current="page"`；返回按钮 `aria-label="返回上一页"`；主操作按钮文案含对象（"发布 期中作业 成绩"）。 |

### 3.3 Tabs

| 维度 | 规范 |
|---|---|
| **① 用途** | 在同一页内切换 2–4 个平级视图（"学生提交 / 标准答案包"、题目编辑分区）。 |
| **② Anatomy** | `标签条（标签项 + 活动指示条） + [右侧附加操作] + 面板`。 |
| **③ 尺寸 / 变体** | 标签条高 `--layout-subnav-h`（44px）；标签字号 `--fs-body`；水平内距 `--space-4`；指示条高 2px、色 `--brand-600`；标签条底边 `--border-subtle`。变体：下划线型（默认，页面级）、卡片型（面板内嵌，谨慎使用）。 |
| **④ 状态** | default 文字 `--text-secondary` ｜ hover 文字 `--text-primary` ｜ active 选中：文字 `--text-strong` + `--fw-medium` + 指示条 `--brand-600` ｜ focus `--ring-focus`（环沿标签矩形） ｜ disabled `--text-disabled` 且不可点 ｜ loading 面板内 Skeleton，标签条保留 ｜ error 面板内错误提示。 |
| **⑤ Do / Don't** | **Do**：① 标签数 ≤ 5；② 切换面板时保留各面板滚动位置与已填数据；③ 标签文案为等长名词短语（避免指示条跳动明显）。 **Don't**：① 用 Tabs 做主导航（用 Sidebar）；② 标签文案写成长句；③ 把「保存 / 删除」放在标签条右侧（与页面主操作冲突）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Tabs = { horizontalItemPadding: '10px 0', titleFontSize: 14, inkBarColor: <--brand-600>, itemColor: <--text-secondary>, itemSelectedColor: <--text-strong>, itemHoverColor: <--text-primary>, horizontalItemGutter: 24 }`。CSS 覆盖：标签条高度对齐 `--layout-subnav-h`、底边框色、指示条圆角。 |
| **⑦ A11y** | `role="tablist"` / `role="tab"` / `role="tabpanel"`（antd 内置）；← → 切换、Home / End 首尾、Enter / Space 激活；选中标签 `aria-selected="true"` + `tabindex="0"`，其余 `tabindex="-1"`；面板 `aria-labelledby` 指向标签；切换后焦点保持在标签上。 |

### 3.4 Sidebar 菜单（深色、选中药丸态）

| 维度 | 规范 |
|---|---|
| **① 用途** | 教师端 / 管理端的一级导航，替代现状「整行高亮 + 无分组」的菜单。 |
| **② Anatomy** | `侧栏（Logo 区 + [分组标题] + 菜单项（图标 + 文字 + [徽标]） + [底部用户 / 折叠]）`。 |
| **③ 尺寸 / 变体** | 宽度 `--layout-sider-w`（232px）/ 折叠 `--layout-sider-w-collapsed`（64px）；底 `--sider-bg`；菜单项高 `--sider-item-h`（40px）、圆角 `--sider-item-radius`、水平内距 `--sider-item-pad-x`、项间距 `--sider-item-gap`（2px）、图标 `--sider-icon-size`（16px）；分组标题 `--sider-group-fg` + `--fs-caption` + `--tracking-wide`；Logo 区高 = `--layout-topbar-h`（56px）以对齐顶栏。**现状 `:width="160" :collapsedWidth="80"` 与令牌冲突，必须改为 232 / 64。** |
| **④ 状态** | default 文字 `--sider-fg`（白 72%） ｜ hover 底 `--sider-item-hover-bg` + 文字 `--sider-fg-active` ｜ active（选中）底 `--sider-item-active-bg`（brand-600）圆角药丸 + **左侧 3px 强调条** + 文字 `--sider-fg-active` ｜ focus `--ring-focus` ｜ disabled 不适用 ｜ loading 徽标位显示小圆点 ｜ error 徽标用状态 danger 三元组（深色变体）。 |
| **⑤ Do / Don't** | **Do**：① 选中态改为**圆角药丸 + 左侧 3px 强调条**（现状是整行色块，且 `::after` 被 `display:none`，须移除 `style.css` 里对 `.ant-menu-dark` 的 `!important` 黑底覆盖）；② 子页面（`/teacher/questions/:id`）保持父级菜单选中（现状 `watch(route.path)` 已做，保留）；③ 分组不超过 3 组，每组 ≤ 7 项。 **Don't**：① 在深色侧栏上放浅色卡片；② 用 `!important` 覆盖 antd 菜单（现状 4 处，属验收项）；③ 折叠态丢失图标 hover 提示（必须有 Tooltip）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Layout = { siderBg: <--sider-bg>, headerBg: <--topbar-bg>, bodyBg: <--bg-canvas>, headerHeight: 56 }`、`components.Menu = { darkItemBg: <--sider-bg>, darkItemSelectedBg: <--brand-600>, darkItemColor: <--sider-fg>, darkItemHoverBg: <--sider-item-hover-bg>, itemHeight: 40, itemBorderRadius: 8, itemMarginInline: 8 }`。CSS 覆盖：药丸态（首末项外边距）、3px 强调条（`::before`）、分组标题排版、折叠宽度 64。 |
| **⑦ A11y** | `<nav>` 包裹；当前项 `aria-current="page"`；键盘：Tab 进入、↑↓ 移动、Enter 进入；折叠态 Tooltip 需 `aria-describedby`；深色下文字对比度：`--sider-fg`（白 72% on `--bg-inverse`）≈ 10:1，达标；选中态文字与药丸底对比 ≥ 4.5:1；折叠触发器带 `aria-expanded` + `aria-label="展开 / 收起侧栏"`。 |

### 3.5 Topbar 与用户菜单

| 维度 | 规范 |
|---|---|
| **① 用途** | 提供全局上下文（当前学校 / 角色）与账户操作入口，并承载侧栏折叠开关。 |
| **② Anatomy** | `顶栏（左：折叠触发器 + [面包屑 / 页面标题] · 右：[全局提示] + 用户区（头像 + 姓名 / 角色 + caret））→ 下拉菜单`。 |
| **③ 尺寸 / 变体** | 高 `--topbar-h`（56px，**现状硬编码 52px 须改**）；底 `--topbar-bg`、下边框 `--topbar-bd`；滚动后加 `--topbar-shadow-scrolled`；水平内距 `--space-6`（compact `--space-4`）；用户区命中区高 ≥ `--control-h`，圆角 `--radius-md`。 |
| **④ 状态** | default ｜ hover 用户区底 `--bg-hover`；触发器底 `--bg-hover` ｜ active 底 `--bg-active` ｜ focus `--ring-focus`（用户区与触发器各自成焦点） ｜ disabled 不适用 ｜ loading 姓名位骨架条 ｜ error 不适用。 |
| **⑤ Do / Don't** | **Do**：① 用户菜单项固定顺序：我的信息 / 切换单位（多单位时）/ AI 评分流程 / 使用文档 / 退出登录；② 「退出登录」用 `Modal.confirm` 并写清后果（现状已做，保留文案），菜单项本身用 `--status-danger-fg`；③ 「切换单位」仅在 `teacherSchools.length > 1` 时出现（现状已做）。 **Don't**：① 在顶栏塞页面级主操作（归属 PageHeader）；② 用 `position:absolute` 脱离布局（现状 `absolute` + 内容区 `padding-top:80px` 的耦合要改为 Layout 流式布局）；③ 用毛玻璃作为唯一分层手段（Chrome 69 兜底已有 `@supports not`，保留但补一层实色底）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Layout` 的 `headerHeight: 56`、`headerBg`、`headerPadding`；`components.Dropdown = { paddingBlock: 6, borderRadiusLG: 12, zIndexPopup: 1000 }`；`components.Avatar = { containerSize: 28, containerSizeSM: 24 }`。CSS 覆盖：`rgba(255,255,255,0.92)` 硬编码 → `--topbar-bg`；`box-shadow: 0 1px 6px rgba(0,0,0,.15)` → `--topbar-shadow-scrolled`。 |
| **⑦ A11y** | 用户区为 `<button>` + `aria-haspopup="menu"` + `aria-expanded`；下拉菜单 ↑↓ 移动、Esc 关闭并把焦点归还触发元素；折叠触发器 `aria-label`（"折叠侧栏"）+ `aria-expanded`；头像必须有文字姓名（不能只有首字母）；退出确认弹窗初始焦点落在「取消」上（防误触）。 |

### 3.6 Steps（AI 评分流程）

| 维度 | 规范 |
|---|---|
| **① 用途** | 表达用户当前所处的**线性流程位置**（6 步 AI 评分流程说明、建题向导）。 |
| **② Anatomy** | `步骤项（序号 / 图标 + 标题 + [描述] + 连接线）…`；横向或纵向。 |
| **③ 尺寸 / 变体** | 图标 24px（`size="small"` 时 20px）；标题 `--fs-body-sm`；描述 `--fs-caption` + `--text-tertiary`；步骤间距 `--space-6`；横向 Steps 在容器宽度 < 720px 时自动转纵向。变体：横向（页头下方）、纵向（抽屉内）。 |
| **④ 状态** | wait 未开始：底 `--bg-surface-2` + 边框 `--border-default` + 文字 `--text-tertiary` ｜ process 进行中：底 `--brand-600` + 文字 `--text-on-brand` + 标题 `--fw-medium` ｜ finish 已完成：`--status-success-fg` + ✓ ｜ error：`--status-danger-fg`；hover / focus / disabled 不适用（Steps 非交互）。 |
| **⑤ Do / Don't** | **Do**：① 6 步以内；② 进入某步时**内容区随之切换**（现状「AI 评分流程」弹窗用 `flowStep` 控制内容 + 上一步 / 下一步按钮，是推荐范式，需补齐：步骤可点击回看、内容区高度稳定不跳动）；③ 当前步说明块用 `--bg-sunken` 底 + `--border-subtle` 虚线（现状 `#fafafa` / `#e9e9e9` 硬编码须改令牌）。 **Don't**：① 用 Steps 展示历史轨迹（用 Timeline）；② 步骤标题超 6 字；③ 在弹窗里放超宽 Steps 导致断行（宽度 ≥ 720px 或转纵向）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Steps = { iconSize: 24, iconFontSize: 14, titleLineHeight: 24, descriptionMaxWidth: 160, dotSize: 8, navArrowColor: <--border-strong>, finishIconBg: <--status-success-fg>, waitIconColor: <--text-tertiary> }`。CSS 覆盖：当前步内容块的底色 / 虚线边框、纵向模式行距。 |
| **⑦ A11y** | 用 `<ol>` 语义；当前步 `aria-current="step"`；每步可见文字须含序号语义（"第 3 步：构建提示词"，而非仅数字圆圈）；不要用颜色作为唯一进度信号（图标形态 + 文字状态并用）。 |

---

## 4. 反馈

### 4.1 Modal

| 维度 | 规范 |
|---|---|
| **① 用途** | 需要用户聚焦决策或完成一段短录入时阻断当前上下文（确认删除、发布成绩、修改密码、AI 流程说明）。 |
| **② Anatomy** | `遮罩 + 面板（[头部：标题 + 关闭按钮] + 主体 + [底部：次要操作 / 主操作]）`。 |
| **③ 尺寸 / 变体** | 宽度阶梯（强制）：确认类 **420px**（现状资料弹窗 420 ✓）、短表单 **640px**、长表单 **840px**、表格 / 流程 **1040px**（现状流程弹窗 `max-width:1040px` ✓）；`< 768px` 时 `calc(100vw - 24px)`。圆角 `--radius-xl`（16px，见 `02-design-tokens.md`），阴影 `--shadow-xl`，遮罩 `--bg-overlay`，层级 `--z-modal-mask` / `--z-modal`；头部内距 `--space-6`，主体 `--space-6`，底部 `--space-4`；标题 `--fs-title-2`（18px）+ `--fw-semibold`。 |
| **④ 状态** | default ｜ hover 按钮各自处理 ｜ active 同上 ｜ focus 打开时焦点移入面板（首个可聚焦元素或「取消」），**焦点陷阱**在面板内 ｜ disabled 主操作在表单未通过时 disabled ｜ loading 主操作 `loading` + 遮罩禁止关闭（`maskClosable=false` + `closable=false`） ｜ error 错误提示渲染在主体顶部（`--status-danger-*`），**不关闭弹窗**。 |
| **⑤ Do / Don't** | **Do**：① 危险操作 `okType="danger"` + 按钮文案写动词（"删除题目"而非"确定"），`Modal.confirm` 的 `cancelText` / `okText` 必须中文化；② 页脚按钮顺序固定：次要在左、主操作在右；③ 关闭时重置表单与滚动位置（现状 `resetPwdForm` 是正确做法，推广到所有表单弹窗）。 **Don't**：① 用 Modal 做长表单（> 12 字段 → 整页或 Drawer）；② 弹窗里再开弹窗（层级 `--z-modal` 冲突）；③ 校验失败就关闭弹窗（教师输入全丢）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Modal = { titleFontSize: 18, paddingContentHorizontalLG: 24, borderRadiusLG: 16, contentBg: <--bg-surface>, headerBg: <--bg-surface>, footerBg: 'transparent', footerMarginTop: 16 }`。CSS 覆盖：`style.css` 移动端 `max-width: calc(100vw - 24px) !important` 改为无 `!important` 的媒体查询；关闭按钮命中区 ≥ 32px。 |
| **⑦ A11y** | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` 指向标题；打开时焦点进入、Esc 关闭（loading 时禁用）、关闭后焦点**归还触发元素**；Tab 循环限制在面板内；背景内容加 `aria-hidden="true"`（antd 已做，覆盖层不得移除）；标题不得为空。 |

### 4.2 Drawer

| 维度 | 规范 |
|---|---|
| **① 用途** | 展示或编辑单条记录明细（学生详情、题目预览、某次 AI 评分的提示词与回复），不离开列表上下文。 |
| **② Anatomy** | `遮罩 + 抽屉面板（头部：标题 + 副标题 + 关闭；主体；底部动作条）`。 |
| **③ 尺寸 / 变体** | 宽度阶梯：420px（只读详情）/ 560px（小表单）/ 720px（含代码或表格）/ 100%（`< 768px`）。圆角仅左侧 `--radius-lg`；阴影 `--shadow-lg`；遮罩 `--bg-overlay`；层级 `--z-drawer`（1250，高于 Modal 1200 —— **因此抽屉内不得再开 Modal**，需要确认时用 `a-popconfirm`）。底部动作条用 `--actionbar-*`。 |
| **④ 状态** | default ｜ hover 同上 ｜ active 同上 ｜ focus 打开时焦点入面板 + 陷阱 ｜ disabled 主操作在只读态隐藏 ｜ loading 主体 Skeleton、动作按钮 loading ｜ error 主体内 Alert + 重试。 |
| **⑤ Do / Don't** | **Do**：① 选择标准：**焦点决策用 Modal，上下文浏览用 Drawer**；② 抽屉头部固定显示记录标识（学号 / 题目名），主体独立滚动；③ 关闭前若有未保存修改，用 `a-popconfirm` 而不是 Modal（层级安全）。 **Don't**：① 用 Drawer 承载需要跨记录对比的内容（用表格）；② 在 Drawer 内再开 Modal / Drawer；③ 抽屉宽度随手写（必须取 420 / 560 / 720）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Drawer = { footerPaddingBlock: 16, footerPaddingInline: 24, paddingLG: 24, zIndexPopup: 1250 }`。CSS 覆盖：左侧圆角、头部下边框 `--border-subtle`、底部动作条贴合。 |
| **⑦ A11y** | 同 Modal：`role="dialog"` + `aria-modal` + `aria-labelledby`；Esc 关闭；焦点归还；顶部提供**显式关闭按钮**（不能只靠点遮罩）；主体滚动区域需可键盘滚动（`tabindex="0"`）。 |

### 4.3 Message / Notification

| 维度 | 规范 |
|---|---|
| **① 用途** | Message：一次性操作结果反馈（保存成功、复制成功）；Notification：需要留痕或带后续动作的异步事件（批量 AI 评分完成、评分异常汇总）。 |
| **② Anatomy** | Message：`图标 + 一句话`。Notification：`图标 + 标题 + 描述 + [操作链接] + 关闭按钮`。 |
| **③ 尺寸 / 变体** | Message 圆角 `--radius-lg`、阴影 `--shadow-lg`、层级 `--z-message`（1300）、停留 3s；Notification 宽 384px、圆角 `--radius-lg`、停留 4.5s（带操作时 8s）、右上角距 `--space-6`。成功 / 失败 / 警告 / 信息四态图标取 `--status-*-fg`。 |
| **④ 状态** | default 进入动画 `translateY(-8px)` + opacity，`--duration-base` ｜ hover 悬停暂停自动关闭计时 ｜ active 不适用 ｜ focus 可聚焦「关闭」与操作链接 ｜ disabled 不适用 ｜ loading 用 `message.loading` 并保留关闭句柄，完成后替换为结果 ｜ error 用 `--status-danger-*`，**必须写清失败原因与下一步**。 |
| **⑤ Do / Don't** | **Do**：① 文案模板「动词 + 对象 + 结果」≤ 20 字（"已保存审核结果"、"AI 评分完成 128 份"）；② 批量评分完成后用 Notification 带「查看异常」链接；③ 同一操作连点只出一条（去重）。 **Don't**：① 用 message 承载需要阅读的错误详情（用 Alert 内嵌或 Modal）；② 用 message 报校验错误（应行内显示）；③ 用 message 替代 loading 态（短暂闪现无法感知）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Message = { contentBg: <--bg-surface>, contentPadding: '10px 16px', zIndexPopup: 1300 }`、`components.Notification = { width: 384, paddingMD: 20, zIndexPopup: 1300 }`。CSS 覆盖：圆角 `--radius-lg`、阴影 `--shadow-lg`、图标色三元组、深色主题下的底 / 边（`--bg-surface-2` + `--border-default`）。 |
| **⑦ A11y** | Message 容器 `role="status"` + `aria-live="polite"`（成功）；错误用 `role="alert"` + `aria-live="assertive"`；Notification 按是否含操作使用 `role="alertdialog"` 或 `role="status"`；停留时间可被悬停 / 聚焦暂停（键盘用户也能读到）；关闭按钮 `aria-label="关闭通知"`；不得只靠图标色区分结果类型（图标形态不同 + 文字）。 |

### 4.4 Alert 提示条

| 维度 | 规范 |
|---|---|
| **① 用途** | 在内容区内常驻说明重要信息：评分规则提示、依赖被过滤的说明、评分异常与重试入口。 |
| **② Anatomy** | `图标 + [标题] + 描述文本 + [操作链接 / 按钮] + [关闭按钮]`；可带边框、可带描述块。 |
| **③ 尺寸 / 变体** | 内距 `--space-3`（无描述）/ `--space-4`（有描述）；圆角 `--radius-md`；四类变体取三元组：`--status-info-*`（说明 / 规则）、`--status-success-*`（成功留痕）、`--status-warning-*`（需注意但可继续）、`--status-danger-*`（阻断性错误）；底 `-bg`、边 `-bd`、字 / 图标 `-fg`。 |
| **④ 状态** | default 常驻 ｜ hover 操作链接下划线 ｜ active 链接按下 ｜ focus 关闭按钮与操作链接 `--ring-focus` ｜ disabled 不适用 ｜ loading 不适用（用 Skeleton） ｜ error 即 danger 变体，**必须带「重试」动作**。 |
| **⑤ Do / Don't** | **Do**：① 用 info 变体承载「AI 评分标准」「工程包已过滤依赖（保留 128 个文件 · 3.2MB）」这类说明；② 错误提示不自动消失、必须给恢复路径（现状 `ProjectZipUploader` 用 `a-alert type="error" closable` 承载超限 / 解析失败，方向正确，补齐"重新选择"按钮）；③ 一屏最多 1 条常驻提示条。 **Don't**：① 用 Alert 替代表单字段级错误；② 用 `warning` 表达失败（用 danger）；③ 可关闭的提示承载必经信息。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Alert` 在 v5 中组件令牌不全 —— 仅设 `defaultPadding: 12`、`withDescriptionPadding: 16`、`withDescriptionIconSize: 20`。CSS 覆盖为主：四类变体的 `background` / `border` / `color` 映射到 `--status-*-bg/bd/fg`；关闭按钮命中区 ≥ 28px；有描述时标题字重 `--fw-semibold`。 |
| **⑦ A11y** | 阻断性错误用 `role="alert"`（即时播报），说明性提示用 `role="status"`；图标 `aria-hidden="true"`，语义靠文本；关闭按钮 `aria-label="关闭提示"`；操作链接文案含对象（"重试评分"）；不得只靠底色区分类型（图标形态 + 文案并用）。 |

### 4.5 EmptyState（含三种场景文案模板）

| 维度 | 规范 |
|---|---|
| **① 用途** | 集合为空时说明**为什么空**并给出下一步，替代现状裸文案 `description="暂无数据" :image="false"`（全站 10+ 处）。 |
| **② Anatomy** | `容器（线性 SVG 插画 + 标题 + 描述 + [主操作按钮] + [次操作链接]）`。 |
| **③ 尺寸 / 变体** | 插画 `--empty-icon-size`（56px），线性单色 `--empty-fg`；标题 `--empty-title-fs`（16px）+ `--fw-medium`；描述 `--fs-body-sm` + `--text-tertiary`；整体垂直居中，**占位高度 = 数据区高度**（避免页面塌陷）；面板内空态最小高度 200px。变体：页面级（居中于内容区）、面板内（紧凑，插画 40px）、表格内（无插画，仅文案 + 操作）。 |
| **④ 状态** | default 静态 ｜ hover 主操作按钮 ｜ active 同上 ｜ focus 操作可聚焦 ｜ disabled 主操作在无权限时隐藏 ｜ loading 不适用（此时用 Skeleton） ｜ error 用「加载失败」变体而非空态。 |
| **⑤ Do / Don't** | **Do**：① 严格按下方模板写文案（**禁止"暂无数据"**）；② 无数据给"创建"入口，无搜索结果给"清空筛选"（**两者操作不同，不能混用**）；③ 空态出现在表格卡内部，表头与工具栏保留。 **Don't**：① 用 `:image="false"` 的裸文案（现状必须全部替换）；② 用插画占满整屏；③ 空态里放两个以上操作按钮。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Empty` 令牌很少。CSS 覆盖：`--empty-*` 四令牌（插画尺寸、字色、标题字号）；`.ant-empty-image` 替换为项目统一线性 SVG（三种场景各一张：空盒子 / 空搜索 / 锁）。 |
| **⑦ A11y** | 插画 `aria-hidden="true"`（装饰性）或提供 `role="img"` + `aria-label`；标题用 `<h3>` 维持大纲；空态出现时用 `role="status"` 播报「没有符合条件的题目」；主操作按钮可键盘直达（空态出现后焦点不自动移动）。 |

**三种场景文案模板（唯一措辞来源）**

| 场景 | 判定条件 | 标题 | 描述 | 主操作 | 次操作 |
|---|---|---|---|---|---|
| **无数据** | 集合为空 **且无任何筛选 / 关键词** | 还没有{对象} | 创建{对象}后即可在此管理；也可从已有{对象}导入。 | 新建{对象} | 查看使用文档 |
| **无搜索结果** | 存在筛选 / 关键词且结果为空 | 没有符合条件的{对象} | 试试清空「{当前筛选名}」，或换个关键词。 | 清空筛选 | — |
| **无权限** | 403 / 角色不匹配 | 你没有查看该{对象}的权限 | 该{对象}属于其他教师或已被转移；如需访问请联系管理员。 | 返回我的{上级} | — |
| **加载失败**（补充） | 请求失败 / 超时 | 加载失败 | 网络或服务异常，请稍后重试；若持续失败请联系管理员。 | 重试 | — |

> 示例填充：无数据 →「还没有题库题目」/「新建题目」；无搜索 →「没有符合条件的题目」/「清空筛选」；无权限 →「你没有查看该班级的权限」/「返回我的班级」。

### 4.6 Skeleton

| 维度 | 规范 |
|---|---|
| **① 用途** | 首屏加载时保留布局骨架，避免白屏与布局跳动。 |
| **② Anatomy** | `标题条 + 段落行（多行，末行 60% 宽） + [头像 / 缩略图块]`；表格骨架为 `表头行 + N 行 × M 列`。 |
| **③ 尺寸 / 变体** | 底 `--skeleton-bg`、流光 `--skeleton-sheen`；行高 = 目标文字行高（正文 22px、标题 28px）；圆角 `--radius-sm`；块级用 `--radius-md`。变体：段落、表格（8 行）、卡片（KPI 数值位）、图表（矩形占位）。**骨架形状必须匹配真实内容尺寸**（列数、行高）。 |
| **④ 状态** | default 流光动画（1.4s 循环） ｜ hover / active / focus / disabled 不适用（非交互） ｜ loading 即自身 ｜ error 不适用（换错误态）。`prefers-reduced-motion` 下流光停止，改为静态底色。 |
| **⑤ Do / Don't** | **Do**：① 加载 < 300ms 不显示骨架（防闪烁），用延时显示；② 翻页 / 筛选时**保留旧数据 + 骨架叠加**，不整块替换；③ 骨架数量与布局要和真实内容一致（表格 8 行、KPI 一行）。 **Don't**：① 整页一个大骨架（要按区块分别骨架）；② 用全屏 `a-spin` 遮罩代替骨架（阻塞感强）；③ 骨架动效节奏超过 `--duration-slow`（显得卡）。 |
| **⑥ antd 覆盖** | ConfigProvider：`components.Skeleton = { color: <--skeleton-bg>, gradientFromColor: <--skeleton-sheen>, borderRadiusSM: 6, paragraphMarginTop: 12, titleHeight: 20 }`。CSS 覆盖：深色主题下 `--skeleton-bg` / `--skeleton-sheen` 由令牌自动切换（`[data-theme="dark"]` 已定义），组件内不得判断主题；补 reduced-motion 分支。 |
| **⑦ A11y** | 容器 `aria-busy="true"` + `aria-live="polite"`；骨架本身 `aria-hidden="true"`；加载完成后播报「已加载 N 条」；骨架内不得放可聚焦元素；超过 5s 仍在加载时补充可见文字「仍在加载…」（不能只靠动画表达）。 |

### 4.7 Lightbox（图片放大）

| 维度 | 规范 |
|---|---|
| **① 用途** | 放大查看题目材料图、学生作答截图、AI 评分附带的图片证据。 |
| **② Anatomy** | `全屏遮罩 + 图片容器 + 工具条（缩放 − / 百分比 / + / 适应 / 1:1 / 下载）+ 关闭按钮 + [左右切换箭头 + 计数]`。 |
| **③ 尺寸 / 变体** | 遮罩 `--bg-mask-strong`（rgba(11,15,22,.72)），层级 `--z-lightbox`（1500，全站最高）；图片最大 90vw × 85vh；工具条高 `--control-h-lg`，底半透明白 + 圆角 `--radius-pill`，距底 `--space-6`；关闭按钮 32×32，距右上 `--space-4`。变体：单图、多图（带 ← → 与 "3 / 9" 计数）。 |
| **④ 状态** | default 适应窗口 ｜ hover 工具条按钮底提亮 ｜ active 按下加深 ｜ focus 所有按钮 `--ring-focus`（深色底上需加 1px 白边保证可见） ｜ disabled 缩放至边界时 ± 按钮 disabled ｜ loading 图片加载中显示浅色 `a-spin` ｜ error 图片加载失败显示「图片加载失败」+ 重试。 |
| **⑤ Do / Don't** | **Do**：① 图片可缩放（100%–400%）与拖拽平移；② 多图时支持 ← → 与 Esc 关闭，计数器常显；③ 关闭后焦点**归还到原缩略图**。 **Don't**：① 用 `a-modal` 实现（遮罩透明度与层级不够，`--z-modal` 1200 会被 message 压住）；② 只支持点击遮罩关闭（键盘用户无出口，必须有显式关闭按钮）；③ 放大后丢失原始 alt 文本。 |
| **⑥ antd 覆盖** | 无对应组件 → 自建 `AppLightbox.vue`（`Teleport to="body"`）。内部只用令牌：遮罩 `--bg-mask-strong`、层级 `--z-lightbox`、按钮 `--btn-*`、圆角 `--radius-md` / `--radius-pill`、过渡 `--transition-surface`。 |
| **⑦ A11y** | `role="dialog"` + `aria-modal="true"` + `aria-label="图片预览"`；打开时焦点入面板、Tab 限制在工具条内、Esc 关闭；← → 切换图片并播报（`aria-live="polite"` 报「第 3 张，共 9 张」）；图片 `alt` 沿用原图说明；深色遮罩上的按钮图标对比度 ≥ 3:1（白色 + 半透明底）。 |

---

## 5. 业务专用

### 5.1 ScorePanel（AI 评分面板）

| 维度 | 规范 |
|---|---|
| **① 用途** | 教师审核单份提交时的决策核心：一屏看清 AI 给的总分、分项依据、要点命中情况，并落定教师终分与评语。 |
| **② Anatomy** | `面板 > ① 总分区（总分 + 满分 + 等级徽标 + [AI 分 vs 教师分对比]） ② 分项列表（名称 + 权重 + 得分 + 分数条） ③ 要点列表（✓ / △ / ✗ + 要点文本 + [依据引用]） ④ 教师终分区（a-input-number + 「使用 AI 评语」快捷） ⑤ 评语区（AI 评语只读块 / 教师评语可编辑） ⑥ 底部动作条（保存审核 / 发布成绩）`。 |
| **③ 尺寸 / 变体** | 面板宽度固定 **360px**（compact 320px），内部独立滚动；总分字号 `--score-value-fs`（40px）+ `--score-value-fw`（600）+ `.tnum`；分区之间 `--stack-gap`；分数条高 6px、轨道 `--score-track`；AI 评语块底 `--bg-sunken` + 圆角 `--radius-md` + 内距 `--space-3`；底部动作条 `--actionbar-*`（高 `--actionbar-h`）。 |
| **④ 状态** | **未评分**：总分位显示 `—`，要点列表隐藏，终分输入可用 ｜ **评分中**：总分位换不确定进度条 + 脉冲文案「AI 评分中，已等待 42s」，终分输入禁用 ｜ **已评分**：正常渲染，AI 分与教师分并列 ｜ **异常**：总分位 `--score-fail` + 「评分异常」+ 「重试评分」按钮 ｜ **已审核 / 已发布**：进入只读锁，教师分覆盖显示并标「已终审」，输入框 disabled ｜ hover / focus / active 由内部控件自管 ｜ loading（保存中）动作条按钮 loading + 输入区 disabled。 |
| **⑤ Do / Don't** | **Do**：① 分数永远配 `.tnum` 并按阈值取色（见下表），色彩之外必须有数字与文字等级；② 要点三态**符号 + 文字并存**（"✓ 满足 / △ 部分满足 / ✗ 未满足"），并提供「依据」引用（可跳转到学生代码行）；③ 教师终分默认预填 AI 分（教师只改差异），修改后视觉标记「已调整」；④ 底部动作条常驻，保存与发布分离（现状 `rp-submit-bar` 已如此，保留并确保全页唯一 primary）。 **Don't**：① 用颜色块代表分数等级而无数字；② AI 评语与教师评语混排在同一块（必须分栏，现状左右两栏是对的）；③ 面板内再嵌套卡片（用分隔线）。 |
| **⑥ antd 覆盖** | 无对应组件 → 自建 `ScorePanel.vue`。组合件覆盖：`a-input-number`（终分，`:min=0 :max=满分`，宽 96px，`.tnum`）、`a-progress`（分项条，高 6px）、`a-textarea`（教师评语，3 行）、`a-tag`（等级徽标）。所有色值走 `--score-*` 与 `--status-*`，禁止组件内硬编码。 |
| **⑦ A11y** | 总分与等级变化用 `aria-live="polite"` 播报（"AI 评分 78 分，等级 良好"）；分数条 `role="progressbar"` + `aria-valuenow/min/max` + `aria-label="分项得分"`；要点三态用 `<ul>` + 每项 `aria-label` 含状态词；终分输入与 AI 分用 `aria-describedby` 关联；锁定态用 `aria-readonly` 而非仅视觉置灰。 |

**分数阈值与色板（强制）**

| 区间 | 等级 | 令牌 |
|---|---|---|
| ≥ 90 | 优秀 | `--score-excellent` |
| 75 – 89 | 良好 | `--score-good` |
| 60 – 74 | 及格 | `--score-pass` |
| < 60 | 不及格 | `--score-fail` |
| 轨道 | — | `--score-track` |

**要点三态**

| 符号 | 含义 | 令牌 | 附加要求 |
|---|---|---|---|
| ✓ | 满足 | `--status-success-fg` | 必须带文字「满足」，并给依据（代码行 / 答案片段） |
| △ | 部分满足 | `--status-warning-fg` | 必须写清缺什么 |
| ✗ | 未满足 | `--status-danger-fg` | 必须写清期望与实际的差异 |

### 5.2 CodeViewer 外壳（Monaco 只读查看器）

| 维度 | 规范 |
|---|---|
| **① 用途** | 只读展示学生代码 / 参考答案 / 工程包内文件，并在多文件间切换。 |
| **② Anatomy** | `查看器 > 文件标签条（标签 + 关闭 + [溢出下拉]） + 工具条（语言标识 + 格式化 + 复制 + 下载 + 全屏） + Monaco 主体 + [状态条（行数 / 字节）]`。 |
| **③ 尺寸 / 变体** | 内联高度：审核页单题 **220px**（现状 `CodeEditor` 的 `height=220`，保留）；全屏模式撑满内容区（上限 `--layout-content-max`）。标签条高 32px；工具条高 `--control-h`；标签宽 ≤ 160px（`.truncate` + `title`），最多 8 个（超出显示 "+N" 下拉）；字体 `--font-mono` 13px / 行高 `--lh-code`（1.6）；外层圆角 `--radius-md`、边框 `--border-default`。 |
| **④ 状态** | default 标签底 `--bg-surface-2` ｜ hover 标签底 `--bg-hover` ｜ active 当前标签底 `--bg-surface` + 顶边 2px `--brand-600` ｜ focus 标签与工具条按钮 `--ring-focus` ｜ disabled 不适用（只读即常态） ｜ loading Monaco 初始化时显示等宽行条骨架 ｜ error 加载失败显示「代码加载失败」+ 重试。 |
| **⑤ Do / Don't** | **Do**：① 只读用 `readOnly: true`（保留选中与复制），**禁止** `disabled`（丢失复制能力）；② Monaco 选项对齐现状：`minimap: false`、`scrollBeyondLastLine: false`、`lineNumbers: 'on'`、`tabSize: 4`、`automaticLayout: true`；③ 全屏切换保留滚动位置与当前文件；④ 「格式化」按钮收进工具条（现状散落在每题标签行）。 **Don't**：① 在教学场景暴露 Monaco 全部功能（不要 minimap、不要命令面板）；② 每个小题都新建 Monaco 实例而不复用模型（性能）；③ 在只读区放编辑类按钮（保存 / 撤销）。 |
| **⑥ antd 覆盖** | Monaco 不属 antd → 通过 `monaco.editor.defineTheme` 定义项目主题（`styles/monaco-theme.js`），关键字 / 注释 / 字符串色对齐 `--brand-*` / `--gray-*`；**该文件是 §0.1 硬规则的唯一白名单**（允许出现色值字面量）。外壳的标签条 / 工具条用令牌 CSS；「复制」用 `a-tooltip` 反馈「已复制」。 |
| **⑦ A11y** | Monaco 对屏幕阅读器支持有限 → 必须提供**「复制代码」与「下载文件」**作为等价获取路径；标签条用 `role="tablist"` + roving `tabindex`，← → 切换、`Ctrl/Cmd+W` 关闭当前、`Delete` 关闭（焦点移到相邻标签）；工具条按钮 `aria-label` 含文件名；编辑器容器 `role="region"` + `aria-label="{文件名} 代码查看器"`；字号不得小于 `--fs-code`（13px）。 |

### 5.3 RichEditor 工具栏

| 维度 | 规范 |
|---|---|
| **① 用途** | 题目描述 / 评分标准 / 材料说明的富文本录入（TipTap）。 |
| **② Anatomy** | `工具条（分组：行内格式 · 颜色 · 标题 · 对齐 · 列表 · 块 · 插入 · 历史；组间竖线分隔） + 编辑区 + [表格插入弹窗]`。 |
| **③ 尺寸 / 变体** | 按钮 28×28（compact）/ 30×30，圆角 `--radius-sm`，图标 16px；组内间距 `--space-1`，组间 `--space-2` + 1px `--border-subtle` 竖线；工具条高 = `--control-h` + 上下 `--space-2` 内距；编辑区最小高度 200px，内距 `--space-3`；聚焦时整块边框 `--input-bd-focus` + `--input-ring`。 |
| **④ 状态** | default 按钮透明 + 图标 `--text-secondary` ｜ hover 底 `--bg-hover` + 图标 `--text-primary` ｜ active（该格式当前生效）底 `--bg-selected` + 图标 `--text-link` ｜ focus `--ring-focus` ｜ disabled 不适用 ｜ loading 不适用 ｜ error 由外层 Form 处理（边框 `--border-danger`）。 |
| **⑤ Do / Don't** | **Do**：① **图标替换为 `@ant-design/icons-vue` 的线性图标**（`BoldOutlined` / `ItalicOutlined` / `OrderedListOutlined` / `LinkOutlined` / `PictureOutlined` / `TableOutlined` / `UndoOutlined` / `RedoOutlined` 等）—— 现状用 emoji 与字符（🔗 🖼 ⊞ ☑ ❝ ≡）跨平台字形不一致，必须全部替换；② 表格插入弹窗改用 `a-modal`（`--z-modal`）—— 现状自绘 `Teleport` overlay 缺少 Esc 关闭与焦点陷阱；③ 颜色选择器替换原生 `input[type=color]`（其弹层不受控），或把高亮色收进令牌白名单（现状内联 `background:#fff3cd` 需令牌化）。 **Don't**：① 工具条超过 2 行（超出部分收进「更多」）；② 提供字号 / 字体族选择（教学场景不需要，破坏排版一致性）；③ 用图片 base64 直塞内容（走上传，见 §1.7）。 |
| **⑥ antd 覆盖** | TipTap 不属 antd → 工具条为自建组件，全部用令牌；仅「插入表格」弹窗复用 `a-modal`、颜色浮层复用 `--z-dropdown` + `--shadow-lg`。颜色按钮的触发态用 `aria-pressed`，不做自定义下拉时需保证 Esc 可关。 |
| **⑦ A11y** | 工具条 `role="toolbar"` + `aria-label="富文本工具栏"`；每个按钮 `aria-label`（"加粗"）+ `aria-pressed`（格式生效为 true）；`Alt+F10` 从编辑区进入工具条，← → 在组间移动，Esc 返回编辑区；编辑区 `role="textbox"` + `aria-multiline="true"` + `aria-label`；粘贴富文本时保留纯文本兜底；正文允许色对比度不得低于 4.5:1（色板需白名单约束）。 |

### 5.4 ProjectZipUploader 上传区

| 维度 | 规范 |
|---|---|
| **① 用途** | 上传工程包（zip），前端过滤依赖后重打包，产出文件树与体积统计 —— 教师标准答案包与学生提交共用。 |
| **② Anatomy** | `上传区 > ① 选择区（选择按钮 + 约束提示） ② 处理中（脉冲 + "正在解析中…"） ③ 错误 Alert（超限 / 无代码文件 / 解析失败） ④ 资源管理器（标题 + a-tree，见 §2.6） ⑤ 统计行（"已保留 128 个代码文件 · 3.2 MB"）`。 |
| **③ 尺寸 / 变体** | 选择按钮 56×56 圆形（现状），边框 2px 虚线 `--border-strong`，默认底 `--bg-surface-2`、图标 `--text-tertiary`；提示文案 `--fs-body-sm` + `--text-secondary`；面板内距 `--space-3`；文件树区最小高度 120px。变体：**教师态**（提示"点击上传标准工程包"）/ **学生态**（提示"点击上传项目文件"）/ **回看态**（`treeData` 外部传入，只读、无选择按钮、默认全展开）。 |
| **④ 状态** | default 虚线 `--border-strong` ｜ hover 边框 `--input-bd-hover` + 图标同色 + 底 `--bg-selected` ｜ active 边框实线 `--border-focus` ｜ focus `--ring-focus`（环在圆形按钮上） ｜ disabled 不适用 ｜ processing 按钮禁用 + 不透明度降低 + 脉冲动画（reduced-motion 下静态）+ 文案「正在解析中…」 ｜ error 虚线转 `--status-danger-bd`、Alert `--status-danger-*`、按钮解锁允许重选。 |
| **⑤ Do / Don't** | **Do**：① **约束前置** —— 选择前就写清「仅支持 .zip；将自动过滤 node_modules / .git / build / dist / __pycache__ / venv 等依赖；过滤后代码体积上限 **50MB**」；② 过滤后给出**可核对的统计**（保留文件数 + 体积，现状 `ready` 事件已带 `keptCount` / `keptBytes`，必须上屏）；③ 超限文案给出实际值（现状已给「过滤后仍超过 50MB（62.3MB，共 1842 个文件）」，保留并对齐令牌配色）；④ 教师「标准答案包」与学生「项目文件」只换 hint 文案，交互一致。 **Don't**：① 上传失败后仍显示可继续的空按钮而无错误说明；② 把 50MB 限制藏在错误里（必须前置）；③ 硬编码色值（现状 `#d9d9d9` / `#fafafa` / `#999` / `#1677ff` / `#e6f4ff` / `#dcb67a` 六处必须替换为 `--border-strong` / `--bg-surface-2` / `--text-tertiary` / `--input-bd-hover` / `--bg-selected` / `--icon-folder`）。 |
| **⑥ antd 覆盖** | 内部组件：`a-tree`（§2.6 覆盖）、`a-alert`（§4.4 覆盖，`type="error"` + `closable` 保留）。选择按钮为原生 `<button>`（保留以支持键盘与圆形样式），CSS 统一走令牌；隐藏的 `input[type=file]` 保留但补 `aria-label`。 |
| **⑦ A11y** | 圆形选择按钮为 `<button type="button">` + `aria-label="上传工程包（zip）"`，Enter / Space 触发文件选择；处理中加 `aria-busy="true"` 且 `disabled`；错误 Alert `role="alert"`；文件树用 §2.6 的键盘与 `role="tree"` 规范；统计行用 `aria-live="polite"` 播报「已保留 128 个代码文件」；焦点环在浅色底上必须可见。 |

---

## 6. 落地验收清单（改完逐条自检）

| # | 检查项 | 命令 / 方法 | 通过标准 |
|---|---|---|---|
| 1 | 组件内无硬编码色值 | `grep -rnE '#[0-9a-fA-F]{3,8}\b' client/src/views client/src/components` | 0 行（白名单：`styles/monaco-theme.js`、`nodes/`、`file-icons-js`） |
| 2 | 无 `!important` | `grep -rn '!important' client/src --include='*.vue'` | 0 行（现状 `DataTable.vue` 4 处、`style.css` 3 处须清理） |
| 3 | 无写死尺寸 | 人工审阅 32px / 36px / 52px 等控件高与行高 | 全部改为 `--control-h*` / `--table-row-h` |
| 4 | antd 预设 `color=` 清零 | `grep -rn 'a-tag color=' client/src` | 0 行，改用 StatusBadge 变体 |
| 5 | 空态统一 | `grep -rn ':image="false"' client/src` | 0 行，改用 §4.5 模板 |
| 6 | 表格对齐 | 目视评分审核 / 题库列表 | 表头与内容左对齐，无竖线，行底 1px `--table-bd` |
| 7 | 侧栏宽度 | 目视 | 232px / 折叠 64px，选中为药丸 + 3px 强调条 |
| 8 | 顶栏高度 | 目视 | 56px，与侧栏 Logo 区对齐 |
| 9 | 键盘可达 | 仅用 Tab 走完「新建题目 → 保存」 | 无焦点丢失、焦点环可见、Esc 关闭所有浮层 |
| 10 | 对比度 | 抽查正文 / 次要文本 / 状态标签 | ≥ 4.5:1（`--text-tertiary` 仅用于 ≥ 14px 的辅助信息） |
| 11 | 令牌缺陷已修 | 打开 `02-design-tokens.css` 第 3 节 | §0.4 的三行自引用已删除 |
| 12 | 三态齐全 | 断网 + 清空数据 + 造 403 | 每页可见 loading / empty / error 三态，文案符合模板 |
