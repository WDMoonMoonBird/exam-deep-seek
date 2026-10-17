# Exam-DeepSeek 移动端组件规范（Mobile Component Specs）

> Phase 4 · 方法 skill `afrexai-ui-design-system` · 配套 `docs/mobile-app/02-design-tokens.css` + `docs/mobile-app/preview/assets/screen.css`
>
> **事实来源**：`00-design-brief.md`（原则与约束）· `02-design-tokens.css`（移动层 `--m-*` 唯一取值来源）· `client/src/styles/tokens.css`（桌面令牌，颜色/字号/语义色继续复用）· `preview/SCREENS.md` §5（可用 class 速查）· `preview/assets/screen.css`（Screen Kit 实现）。
> **本文不发明颜色 / 尺寸 / 圆角 / 时长**：每个数值要么指回令牌名，要么标注「预览字面量（L）」并进入 §0.4 收口清单。
> 落地顺序（待实施）：令牌层 → Vant 主题/按需组件 → `components/m/*` 封装 → 逐屏接入 → 用 §8 清单验收。生产 Vue 组件映射见 `07-implementation-plan.md`（不在本文展开）。

---

## 0. 全局约定（所有组件共享）

### 0.1 引用顺序与命名

| 层 | 文件 | 提供什么 | 使用规则 |
|---|---|---|---|
| 1 桌面令牌 | `client/src/styles/tokens.css` | 颜色 `--brand-*` / `--gray-*`、文本 `--text-*`、表面 `--bg-*` / `--card-*`、状态 `--status-*`、评分 `--score-*`、焦点 `--ring-focus`、字体 | 禁止在移动组件里重定义 |
| 2 移动令牌 | `docs/mobile-app/02-design-tokens.css` | 安全区、骨架/触控尺寸、`--m-fs-*`、`--m-radius-*`、`--m-duration-*`、`--m-z-*`、移动表面色 | 移动端尺寸/动效/层级**只用**这一层 |
| 3 Screen Kit | `docs/mobile-app/preview/assets/screen.css` | 组件 class 与默认视觉（设计稿实现，非生产代码） | 生产落地按 `07` 拆成 Vant + `components/m/*` |

- 组件内**禁止**写死颜色、圆角、阴影、时长；例外只有两处（SCREENS.md §7 明确允许）：**二维码图案**与**代码高亮 token 色**。
- 类名以 `preview/assets/screen.css` 为准；本文档中「预览类」列出的 class 均为已存在实现，不自造。
- 图标统一 `data-icon="name"`（线性 1.8，`.icon` 22px）；纯图标按钮必须 `aria-label`。

### 0.2 移动端状态基线（替代桌面的 hover 七态）

| 状态 | 触发 | 移动端统一表达 |
|---|---|---|
| default | — | 组件令牌默认值 |
| **pressed** | 手指按下 | `transform: scale(.97~.99)` + 背景 `--m-pressed` / 主色 `--brand-700`；动效 `--m-duration-press` 90ms |
| **selected** | 选中（Tab/分段/选项/勾选） | 底色 `--bg-selected` / `--brand-600` + 描边 + 勾/粗体/指示条；**不只靠颜色** |
| focus | 外接键盘 / 读屏 | `:focus-visible` 2px `--border-focus` + offset 2px（Screen Kit 已全局提供） |
| disabled | 无权限 / 流程终结 | 透明度 .45 或 `--text-disabled`；必须原生 `disabled` 或 `aria-disabled="true"`；禁止只置灰仍可点 |
| loading | 请求进行中 | 保留原尺寸：按钮内 `.spinner` + `aria-busy="true"`；内容区用骨架/局部 loading，不清空已有数据 |
| error | 校验失败 / 请求失败 | 行内 `.error-text`（字段）或 `.errorbox`（页面）；`--status-danger-*`；**文案说明怎么改** |
| offline | 断网 | 全局 `.banner--warning` + 列表灰化 + 主操作禁用并给原因 |

> **移动端不实现 hover 态**：触摸设备没有悬停；≥768px 时回退桌面视图，由桌面组件承担 hover。移动组件不得写出「必须悬停才能看到」的信息或操作。

### 0.3 触控与尺寸硬指标

| 指标 | 值 | 令牌 | 说明 |
|---|---|---|---|
| 最小触控目标 | 44×44px | `--m-touch-min` | 视觉可以小于 44，但命中区必须补到 44（padding/伪元素均可） |
| 舒适触控目标 | 48px | `--m-touch-comfort` | 列表行、输入、主要按钮 |
| 图标按钮 | 44×44 | `--m-icon-btn` | `.iconbtn` 默认尺寸 |
| 主按钮高 | 50px | `--m-btn-h` | 拇指热区中心 |
| 输入控件高 | 48px | `--m-control-h` | 输入框 / 选择器 |
| 列表行高 | 56px 起 | `--m-row-h` | 单行 56，两行按内容撑高 |
| 相邻可点元素间距 | ≥8px | — | 避免误触（WCAG 2.5.8 Target Size 最小 24 的更高要求） |
| 正文最小字号 | 15px | `--m-fs-body` | 手机正文不得低于 15px；辅助 ≥12px |

### 0.4 预览字面量收口清单（实施前必须收敛）

> 下表是 `preview/assets/screen.css` 中**尚未令牌化**的尺寸/时长。设计稿允许使用（标注 L），但生产落地前必须：补 `--m-*` 令牌，或收敛到已有令牌。不允许在业务组件里继续散落。

| 预览字面量（L） | 位置 | 建议处置 |
|---|---|---|
| AppBar 标题 17px / 左对齐 20px | `.appbar-title` / `.appbar--left .appbar-title` | 收敛到 `--m-fs-title-2` 18px，或补 `--m-fs-appbar-title` |
| 标签高 23px、大标签 27px | `.tag` / `.tag--lg` | 补 `--m-tag-h` / `--m-tag-h-lg`（桌面 `--tag-h` 为 22px） |
| 徽标 18px、Tab 角标 17px | `.badge` / `.tabbar-badge` | 补 `--m-badge-h` |
| 胶囊/分段高 34px、小分段 30px | `.chip` / `.seg button` / `.seg--sm` | 补 `--m-chip-h`；命中区需在容器补到 `--m-touch-min` |
| 下划线 Tab 高 46px | `.tabs button` | 补 `--m-tabs-h`（≥44 可作触控目标） |
| 按钮 32 / 38 / 54px | `.btn--xs` / `.btn--sm` / `.btn--lg` | 38 已对 `--m-btn-h-sm`；补 `--m-btn-h-xs` / `--m-btn-h-lg` |
| 圆角 14px（提示条/选项/AI 卡/列表卡） | `.banner` / `.option` / `.ai-note` / `.diffcard` / `.option-card` | 收敛到 `--m-radius-card-sm` 12 或 `--m-radius-card` 16，或补 `--m-radius-md-14` |
| 进度环 78/62、54/44 | `.ring` / `.ring--sm` | 补 `--m-ring-size` / `--m-ring-inner` |
| 分数主数 46px | `.score-hero b` | 补 `--m-fs-score-hero`（或用 `--m-fs-display` 28 + 独立展示规则） |
| Diff 正文 12px | `.diffbody` | 收敛到 `--m-fs-code` 12.5px / `--m-lh-code` 1.75 |
| 代码工具 32px、选区菜单 36px | `.codetoolbar .tool` / `.selmenu button` | 补命中区到 44（工具栏可换行，不缩小字号） |
| Sheet 关闭按钮 32px | `.sheet-close` | 视觉 32 + 命中 44（`--m-touch-min`） |
| 搜索框高 40px | `.searchbar` | 收敛到 `--m-control-h` 48 或补 `--m-search-h` |
| 步骤点 26px | `.stepdot` | 纯展示元素可保留；可点击时命中区补 44 |
| 骨架动画 1.35s | `.sk` `animation` | 复用桌面 `--duration-loop-pulse` 1200ms，或在 `prefers-reduced-motion` 下停用 |
| 输入字号 15px | `.input` / `.textarea` | **iOS Safari 焦点自动缩放阈值 16px**：生产输入控件用 16px（建议补 `--m-fs-input` 16px） |

### 0.5 组件总览索引

| # | 组件 | 预览类 | 关键令牌 | 主要屏（示例） |
|---|---|---|---|---|
| 1 | AppBar | `.appbar` `.appbar-title` `.appbar-side` | `--m-appbar-h` `--m-appbar-bg` `--m-z-appbar` | 全部二级页 |
| 2 | TabBar | `.tabbar` `.tabbar-item` `.tabbar-badge` | `--m-tabbar-h` `--m-tabbar-total` `--m-z-tabbar` | 11 个 Tab 首屏 |
| 3 | ActionBar | `.actionbar` `.actionbar-hint` | `--m-actionbar-h` `--m-actionbar-total` `--m-btn-h` | 作答、审核、向导、详情 |
| 4 | IconButton | `.iconbtn` `.iconbtn--text` | `--m-icon-btn` `--m-pressed` | 全部 AppBar |
| 5 | Card | `.card` `.card-head` `.card-foot` `.card--press` | `--m-radius-card` `--m-card-pad` `--card-bg` | 全部内容页 |
| 6 | Stats | `.stats` `.stat` | `--m-stack` `--score-*` `--status-*` | 教师工作台、管理概览 |
| 7 | List / RowItem | `.list` `.rowitem` `.row-title` `.chevron` | `--m-row-h` `--m-card-pad` `--bg-hover` | 目录、学生列表、题库 |
| 8 | Avatar / KV | `.avatar` `.kv` | — | 身份卡、详情 |
| 9 | SearchBar | `.searchbar` | `--m-control-h`（收敛） | 作业列表、题库、目录 |
| 10 | Seg / Chips / Tabs | `.seg` `.chips` `.tabs` | `--m-radius-chip` `--brand-600` | 筛选、分段切换 |
| 11 | Tag / Badge | `.tag` `.badge` `.tag--*` | `--status-*-bg/fg` `--m-fs-caption` | 全部状态 |
| 12 | Button | `.btn` `.btn--*` `.btn-row` | `--m-btn-h` `--m-radius-btn` `--m-touch-min` | 全部 |
| 13 | Form Field | `.field` `.input` `.textarea` `.help` `.error-text` | `--m-control-h` `--m-radius-input` `--input-bd` | 登录、布置作业、评语 |
| 14 | Choice | `.switch` `.check` `.radio` `.option` `.option-card` | `--brand-600` `--m-touch-min` | 作答、设置、选题 |
| 15 | Upload | `.upload` `.upload-icon` | `--border-strong` `--m-radius-card` | 工程包/附件（待确认） |
| 16 | Progress | `.bar` `.ring` | `--score-track` `--score-*` | 作业进度、提交进度 |
| 17 | Score | `.score-hero` `.score-line` `.score-chip` | `--score-*` `--m-fs-display` | 成绩、审核 |
| 18 | AI Note | `.ai-note` `.quote` | `--bg-surface-2` `--border-subtle` | 成绩详情、审核 |
| 19 | QGrid | `.qgrid` `.qnum` `.qlegend` | `--m-touch-min` `--brand-600` | 答题卡 |
| 20 | Steps | `.steps` `.step` `.stepdot` | `--brand-600` `--m-fs-caption` | 布置作业向导 |
| 21 | CodeBox | `.codebox` `.codeline` `.selmenu` | `--code-bg` `--m-fs-code` `--m-lh-code` | 代码只读、提交查看 |
| 22 | Diff | `.diffcard` `.diffline` `.diffhead` | `--status-success-*` `--status-danger-*` | 代码差异 |
| 23 | QR / Handoff | `.qr` `.handoff` | —（图案例外） | 接力页 |
| 24 | Banner | `.banner` `.banner--*` | `--status-*-bg/fg/bd` | 全局提示、风险提示 |
| 25 | Bottom Sheet | `.mask` `.sheet` `.grabber` | `--m-radius-sheet` `--m-duration-sheet` `--m-z-sheet` | 答题卡、交卷确认 |
| 26 | ActionSheet | `.actionsheet` `.action-row` | `--m-radius-sheet` `--m-z-sheet` | 更多操作（按需） |
| 27 | Toast | `.toast` `.toast--sheet` | `--m-shadow-toast` `--m-z-toast` | 复制成功、发布成功 |
| 28 | Empty | `.empty` `.empty-icon` | `--bg-sunken` `--text-tertiary` | 全部列表 |
| 29 | Skeleton | `.sk` `.sk-card` `.sk-line` | `--skeleton-bg` `--skeleton-sheen` | 全部列表/详情 |
| 30 | Error | `.errorbox` `.error-code` `.error-text` | `--text-tertiary` `--status-danger-fg` | 错误页、表单 |
| 31 | ReadonlyTip | `.readonly-tip` | `--bg-surface-2` `--border-strong` | 只读/引导电脑 |

### 0.6 通用无障碍底线（每个组件都必须满足，后文不再重复）

1. 可交互元素用原生 `<button>` / `<a>` / `<input>`，禁止 `div onclick`；整卡可点时用 `role="button" tabindex="0"` + Enter/Space（参考 `student/Assignments.vue` 做法）。
2. 纯图标按钮必须有 `aria-label`（「返回」「更多」「关闭」「搜索」）；不使用 `title` 替代。
3. 表单：`label for` 关联；错误用 `aria-invalid` + `aria-describedby`；必填 `aria-required`。
4. 状态不只靠颜色：选中 = 底色 + 勾/描边；状态标签 = 图标 + 文字；新增/删除行 = 颜色 + `+/-` 前缀。
5. 装饰性 SVG / 图标 `aria-hidden="true"`；图标库（`screen.js` 的 `ICONS`）输出已带 `aria-hidden`，业务侧不要移除。
6. 焦点可见：可使用 `:focus-visible`（Screen Kit 全局 2px `--border-focus`）；Sheet 打开时焦点移入、关闭时归还触发元素。
7. 动态提示用 `role="status"`（成功/信息）或 `role="alert"`（错误）；不要用视觉 toast 承载唯一关键信息。
8. 触控目标 ≥44×44；读屏顺序 = 视觉顺序；不要用 `user-select: none` 屏蔽整页文字选中。

---

## 1. 骨架与导航

### 1.1 AppBar 顶部导航栏

| 维度 | 规范 |
|---|---|
| **用途** | 二级页/流程页的顶部导航：返回、页面标题、1–2 个页面级操作；Tab 首屏也可用大标题变体（`.appbar--left` + `.hero`）。 |
| **Anatomy** | `header.appbar > .appbar-side（返回/占位） + .appbar-title（标题 + 可选 small 副标题） + .appbar-actions（≤2 个 iconbtn）`。 |
| **尺寸 / 令牌** | 高 `--m-appbar-h` 52px（Android 56px）；背景 `--m-appbar-bg`（`saturate(180%) blur(18px)`，不支持毛玻璃回落 `--m-appbar-solid`）；标题字号 17px（L，见 §0.4）600；副标题 12px `--text-tertiary`；左右各留 `--m-icon-btn` 44px；层级 `--m-z-appbar` 40。 |
| **变体** | `.appbar--solid`（滚动后）、`.appbar--bordered`（1px `--border-subtle` 底边）、`.appbar--transparent`（首页大图/启动屏）、`.appbar--inverse`（深色背景白字）、`.appbar--left`（左对齐大标题）。 |
| **状态** | default 毛玻璃 ｜ scrolled → 加 `--bordered` 或 `--solid` ｜ pressed：触发的 iconbtn 按下态 `--m-pressed` ｜ focus：`:focus-visible` 焦点环 ｜ disabled：无（返回永远可用；无权限动作才禁用） ｜ loading：标题右侧可放 `.spinner`（仅刷新当前页时） ｜ error：标题保留，错误用页面内 `.errorbox`。 |
| **无障碍** | 用 `<header>`；页面标题用 `<h1>` 或 `role="heading" aria-level="1"`；返回按钮 `aria-label="返回"`；当前页标题可配 `aria-current="page"`（Tab 首屏）；不把标题拆成多个文本节点。 |
| **使用规则** | ① 二级页必须给返回；② 标题 ≤ 8 个汉字，超长 `.ellipsis`；③ 右侧图标按钮 ≤ 2 个，更多操作收进 `.actionsheet`；④ 滚动后加底边，避免内容与标题混在一起。 |
| **反例** | 标题居中 + 左右各 3 个按钮（拇指够不到、易误触）；用「返回」文字按钮替代 44px 图标；无 `aria-label` 的「⋯」按钮；标题里塞状态 tag。 |

### 1.2 TabBar 底部主导航

| 维度 | 规范 |
|---|---|
| **用途** | 角色主工作域的持久导航（学生 4 / 教师 4 / 管理员 3）；只承载 L1 首屏。 |
| **Anatomy** | `nav.tabbar[aria-label="主导航"] > button.tabbar-item × N`；每项 = 24px 图标 + 文案（`--m-fs-micro` 10.5px）+ 可选 `.tabbar-badge`。 |
| **尺寸 / 令牌** | 内容高 `--m-tabbar-h` 56px + 底部安全区 `--m-safe-bottom` = `--m-tabbar-total`；图标 24px，激活 `stroke-width: 2.2`；文案 10.5px；背景 `--m-tabbar-bg` + `--m-shadow-tabbar`；层级 `--m-z-tabbar` 50；页面为 TabBar 预留 `--m-page-bottom-tabbar`。 |
| **状态** | default `--text-tertiary` ｜ active `--text-brand` + 图标加粗 + `aria-current="page"` ｜ pressed `opacity: .7` ｜ focus `:focus-visible` ｜ disabled：Tab 不设 disabled（不可见能力直接不放 Tab） ｜ badge：数字（>99 显示 `99+`）或 `.tabbar-badge--dot` 红点。 |
| **无障碍** | `<nav aria-label="主导航">` + 原生按钮；每项可访问名 = 文案（图标 `aria-hidden`）；角标 `aria-label="12 项待办"`（参考 `screen.js` 实现）；选中态不能只靠颜色（加粗 + aria-current）。 |
| **使用规则** | ① 2–5 项；② 只放 L1；③ 角标 = 待办数，0 不显示；④ Tab 文案 2–4 字；⑤ 切 Tab 不堆返回栈，保留滚动位置；⑥ TabBar 与安全区一起做背景，不能出现「白条」。 |
| **反例** | 把「新建/布置作业」做成 Tab 中间凸起按钮（语义错，用 ActionBar/FAB）；6 个 Tab 挤成图标墙；角标显示 100+ 不截断；选中态只换颜色。 |

### 1.3 ActionBar 底部固定动作条

| 维度 | 规范 |
|---|---|
| **用途** | 二级页/流程页的底部主操作区，让主按钮落在拇指热区；可 2 按钮并排或 1 个通栏主按钮。 |
| **Anatomy** | `div.actionbar > .btn--secondary + .btn--primary`（次要左、主要右）；或 `.actionbar--col` 纵向（主 + 危险）；可带 `.actionbar-hint` 小字提示。 |
| **尺寸 / 令牌** | 内容高 `--m-actionbar-h` 64px；内距 10px + 安全区 = `--m-actionbar-total`；背景 `--m-actionbar-bg` + `--m-shadow-tabbar`；按钮高 `--m-btn-h` 50px；双按钮时次要按钮占 34%；层级 `--m-z-actionbar` 50；页面预留 `--m-page-bottom-actionbar`。 |
| **叠加场景** | 审核队列是 Tab 页但需要常驻动作：在 TabBar 之上叠一条固定条（预览页内 `.t-queuebar`，`bottom: var(--m-tabbar-total)`），页面 `scroll` 预留 `calc(var(--m-tabbar-total) + 72px)`。该条属于**页内布局**，不是全局组件。 |
| **状态** | 主按钮 default / pressed（`--brand-700`）/ focus / disabled（未满足条件时置灰并给原因）/ loading（`.spinner` + 进行时文案，如「发布中…」）；危险动作 `.btn--danger-soft` 或 `.btn--danger`。 |
| **无障碍** | 动作条不遮挡内容（滚动底部预留）；按钮可访问名写动词（「审核通过」「确认发布 12 份」）；危险动作用 `aria-describedby` 关联不可撤销说明；键盘弹出时动作条需上移（见 §6.3）。 |
| **使用规则** | ① 一屏最多 2 个动作；② 主操作唯一；③ 破坏性动作写清后果与对象数量；④ 不可撤销动作必须在动作条上方有常驻提示。 |
| **反例** | 双主按钮（两个都 primary）；动作条挡住最后一条内容；「确定/取消」这种无对象动词；loading 时按钮宽度跳动。 |

### 1.4 IconButton 图标按钮

| 维度 | 规范 |
|---|---|
| **用途** | AppBar 的返回/更多/关闭，卡片右上角菜单，输入框后缀（密码可见、清除）。 |
| **Anatomy** | `button.iconbtn[data-icon="back"][aria-label="返回"]`；文字变体 `.iconbtn--text`。 |
| **尺寸 / 令牌** | 44×44（`--m-icon-btn` = `--m-touch-min`）；圆形；图标 22px（`.icon`）；pressed 背景 `--m-pressed`；文字变体高自适应、圆角 10px、字号 14px、色 `--text-link`。 |
| **状态** | default ｜ pressed 背景 ｜ focus 焦点环 ｜ disabled `--text-disabled` + `aria-disabled` ｜ loading：图标换 `.spinner`（如刷新）。 |
| **无障碍** | 必须 `aria-label`（动作 + 对象，如「删除 陈嘉懿 的提交」）；不使用 `<i>` 承载点击；按下态给出视觉反馈。 |
| **使用规则** | ① AppBar 右侧 ≤2 个；② 同一页图标含义一致（`more` 永远是更多）；③ 危险图标操作（删除）必须二次确认。 |
| **反例** | 无 `aria-label` 的纯图标；用图标代替文字表达「提交/发布」；44px 命中区被缩成 24px。 |

---

## 2. 容器与内容

### 2.1 Card 卡片

| 维度 | 规范 |
|---|---|
| **用途** | 移动端最基本的信息容器：作业卡、审核卡、成绩卡、设置组、空态容器。 |
| **Anatomy** | `.card > .card-head(.card-title + tag) + .card-sub + .card-meta + .card-foot`；可整卡可点（`.card--press`）。 |
| **尺寸 / 令牌** | 圆角 `--m-radius-card` 16px；内距 `--m-card-pad` 16px；背景 `--card-bg`；描边 1px `--card-bd`；卡片间距 `--m-stack` 12px；标题 `--m-fs-title-3` 16px / 600；说明 13px `--text-secondary`；meta 12px `--text-tertiary`；foot 上边框 `--border-subtle` + 上内距 12px。 |
| **变体** | `.card--tight` 12px 内距 + 12px 圆角；`.card--flush` 无内距（列表/图片）；`.card--tint` 下沉底 `--bg-surface-2`；`.card--brand` 品牌浅底 `--bg-selected`；`.card--press` 按下缩放 .985。 |
| **状态** | default ｜ pressed（可点卡）｜ selected（选中卡，如批量）→ 边框 `--brand-600` + 底色 `--bg-selected` + `.check.on` ｜ disabled（已结束/锁定）→ 文字降为 `--text-disabled`，不可点 ｜ loading 用骨架卡替代 ｜ error 用行内 `.banner--danger` 或 `.errorbox`。 |
| **无障碍** | 整卡可点时用 `role="button" tabindex="0"` + Enter/Space（真实实现参考 `student/Assignments.vue`）；卡内不再嵌套多个同级可点元素；状态标签带文字；标题层级用 `<h3>`。 |
| **使用规则** | ① 一卡一对象；② 只放 4 个决策字段（01 §7.2）；③ 卡内最多 2 个操作，主操作优先放 ActionBar；④ 描边分层，不加阴影；⑤ 卡内分隔用 `.card-foot` 或 `.divider--inset`。 |
| **反例** | 卡片套卡片；一张卡 3 个 primary 按钮；用阴影堆叠层级；整卡可点但内部又有 4 个独立按钮（点击冲突）。 |

### 2.2 Stats / Stat 数据卡

| 维度 | 规范 |
|---|---|
| **用途** | 教师工作台待办三卡、管理概览 KPI、成绩概览数字（平均分/排名/已出分）。 |
| **Anatomy** | `.stats > .stat > .v（数字 + 可选 small 单位） + .k（指标名）`；`.stats--2` / `.stats--4` 变列数。 |
| **尺寸 / 令牌** | 3 列默认，gap 10px；单卡内距 12px/10px、圆角 14px（L）；数字 24px / 650 / `font-variant-numeric: tabular-nums`；指标名 12px `--text-tertiary`、单行截断；语义色变体 `--warn` / `--info` / `--success` / `--danger` / `--hero`。 |
| **状态** | 静态展示为主；可点卡（点进列表）需加按下态与「可点」提示（箭头或按压反馈）；loading 用骨架块；空值显示 «—» 而非 0。 |
| **无障碍** | 数字与指标名连读（`aria-label="待审核 12 份"` 或视觉文本足够）；颜色不单独承载语义（«待审核 12» 已带文字）；`.tnum` 防止数字跳动。 |
| **使用规则** | ① 一行 2–4 个，不换行成 1 列大卡；② 一个卡一个指标；③ 数字不写死单位颜色；④ 指标名 ≤ 8 字。 |
| **反例** | 4 个指标写成 2×2 大小不一；数字用大段说明抢占首屏；指标名被截断到不可读。 |

### 2.3 List / RowItem 列表行

| 维度 | 规范 |
|---|---|
| **用途** | 组织目录、学生列表、题库列表、设置项、分段页内的行列表；比卡片更紧凑。 |
| **Anatomy** | `.list > .rowitem > [.rowicon] + .row-main(.row-title + .row-sub) + .row-side + .chevron`；`.rowitem--stack` 顶部对齐。 |
| **尺寸 / 令牌** | 行高 ≥ `--m-row-h` 56px；内距 11px `--m-card-pad`；行间分隔 `inset 0 1px 0 --border-subtle`；标题 15px/500；副标题 13px `--text-secondary`；右侧 13px `--text-tertiary`；`.rowicon` 34px 圆角 10px；容器圆角 `--m-radius-card` + 描边。 |
| **状态** | default ｜ pressed 背景 `--bg-hover`（预览 `.rowitem--tap:active`）｜ selected `--bg-selected` ｜ disabled `--text-disabled` + `aria-disabled` ｜ loading 用 `.sk-card` 或行骨架 ｜ error 行内替换为提示行。 |
| **无障碍** | `<ul>/<li>` 或 `role="list"`；可点行用 `<button>` 或 `role="button"`；行内不要嵌第二个可点元素（需要时用右侧独立按钮并阻止冒泡）；右侧箭头 `aria-hidden`。 |
| **使用规则** | ① 两行以内；② 每行一个主信息 + 一个辅助信息 + 右侧状态/箭头；③ 设置类行用 `.switch` 或 `.chevron` 区分「开关」与「进入」；④ 行内数字用 `.tnum`。 |
| **反例** | 一行塞 3 行文字导致触控目标不清；左右两个可点区域无分隔；行高 <48px。 |

### 2.4 Avatar / KV 键值行

| 维度 | 规范 |
|---|---|
| **用途** | Avatar：身份卡/学生卡/审核对象；KV：详情页「截止 / 满分 / 题数 / 任课教师」等只读字段。 |
| **Anatomy** | `.avatar`（姓名首字或字母，42px；变体 sm 30 / lg 56 / xl 68，`--brand` / `--gray`）；`.kv > .k + .v`。 |
| **尺寸 / 令牌** | 头像圆形，字号 16px/600；KV 字号 13.5px、上下 7px、键 `--text-secondary`、值 500 `--text-primary`、行间 `--border-subtle` 分隔。 |
| **状态** | 头像无状态（离线状态用 `.badge--dot` 叠加）；KV 只读，无 hover；长值换行不截断。 |
| **无障碍** | 头像 `alt` 或 `aria-label="李明"`；KV 用 `<dl><dt><dd>` 语义（无 dl 时用可见文本即可）；不要用「:」拼接。 |
| **使用规则** | ① 头像不用真实照片（仓库无头像资源，用姓名首字/字母）；② 详情页 KV ≤ 6 行，超出改列表；③ 值右对齐但长文本左对齐换行。 |
| **反例** | 头像用 emoji；KV 值被 `.ellipsis` 截断导致看不到截止时间。 |

### 2.5 Seg / Chips / Tabs 三类「切换」

| 维度 | 规范 |
|---|---|
| **用途** | `.seg`：页内互斥视图切换（评分/代码/参考）；`.chips`：横向筛选胶囊（全部/进行中/待评分/已评分，带计数）；`.tabs`：页面级内容切换（提交/题目/概况，最多 5 个）。 |
| **尺寸 / 令牌** | `.seg`：容器 `--bg-sunken` 圆角 12px、内距 3px；按钮高 34px（L）、选中 `--bg-surface` + `--shadow-sm`；`.seg--sm` 30px。`.chips`：高 34px（L）、圆角 `--m-radius-chip`、间距 8px、可横滑（`.chips`）或换行（`.chips--wrap`），选中 `--brand-600` 底 + 白字，计数 `.count`。`.tabs`：按钮高 46px（L）、下划线 2.5px `--brand-600`、间距 22px、可横向滚动。 |
| **状态** | default ｜ pressed 缩放 .98 ｜ selected（active）：底色 + 字重 + 指示条（`.tabs` 下划线 / `.seg` 卡片抬升）｜ disabled：筛选无结果时保持可见但禁用并给说明（或隐藏）。 |
| **无障碍** | `.seg` 用 `role="tablist"` + `aria-selected`（或按钮组 `aria-pressed`）；`.chips` 用 `role="group" aria-label="筛选"`；`.tabs` 用 `<button role="tab" aria-selected aria-controls>` + `role="tabpanel"`；**34px 控件必须在容器补足 44px 命中区**（上下 padding）。 |
| **使用规则** | ① 互斥视图用 seg，筛选条件用 chips，页面级切换用 tabs；② 一组不超过 5–7 个，超出用横向滚动并保留右侧渐隐提示；③ 选中项必须文字可见（emoji/纯色块不行）。 |
| **反例** | 用 chips 做互斥视图（语义不清晰）；seg 里塞 8 个选项；tabs 做筛选；只有颜色没有下划线/加粗。 |

### 2.6 Tag / Badge 状态标签与徽标

| 维度 | 规范 |
|---|---|
| **用途** | Tag：状态（进行中/待评分/已发布/草稿）、题型（编程题/实训题/客观题）、等级（A/B）；Badge：数量（待办 12、未答 2）。 |
| **Anatomy** | `span.tag.tag--success .dot + 文案`；`span.badge` / `.badge--on-dot`。 |
| **尺寸 / 令牌** | Tag 高 23px（L）、内距 0 8px、圆角 6px（`--radius-sm`）、字号 12px（`--m-fs-caption`）、`.dot` 5px；大标签 `.tag--lg` 27px；Badge 最小 18px（L）、红底白字、`.badge--neutral` / `--brand` / `--dot`。 |
| **变体** | `.tag--neutral / --success / --warning / --danger / --info / --accent / --solid`；语义映射：成功=已发布/已完成，信息=进行中/评分中，警告=待审核/待评分/标记，危险=未提交/已截止/异常，中性=草稿/已锁定，accent=实训题。 |
| **状态** | 静态；可点标签（如筛选）应改用 `.chip`；loading 不适用；无 error 态。 |
| **无障碍** | 文字必须可读（不要只给颜色）；tag 不是按钮时不要加可点样式；数量徽标需 `aria-label`（「12 项待办」）；对比度用 `--status-*-fg/bg` 令牌保证 ≥4.5:1。 |
| **使用规则** | ① 一屏状态色 ≤3 种；② 状态文案用动词/名词短语（「待审核」「AI 评分中」「未提交」）；③ 卡片上 ≤2 个标签，其余进详情；④ 等级徽标（A）必须并列分数。 |
| **反例** | 用 tag 做按钮；一个卡片 5 个标签；红色表示「正常」；仅用绿/红区分及格/不及格。 |

---

## 3. 操作

### 3.1 Button 按钮

| 维度 | 规范 |
|---|---|
| **用途** | 触发明确动作：提交、交卷、审核通过、布置作业、重试、复制链接。 |
| **Anatomy** | `button.btn > [.icon] + 文本 + [.spinner]`；通栏 `.btn--block`；并排 `.btn-row`。 |
| **尺寸 / 令牌** | 高 `--m-btn-h` 50px；圆角 `--m-radius-btn` 14px；字号 16px/600；内距 0 18px；图标 19px；小号 38px（`--m-btn-h-sm`）、超小 32px（L）、大号 54px（L）；最小宽度 `--m-touch-min`。 |
| **变体** | primary（页面唯一主操作，`--brand-600`）/ secondary（白底描边 `--border-strong`）/ soft（`--bg-selected` 底 + 品牌字）/ ghost（纯文字）/ danger（`--red-600`）/ danger-soft（浅红底）/ pill（胶囊）。 |
| **状态** | default ｜ pressed `scale(.98)` + primary 转 `--brand-700` ｜ focus 2px `--border-focus` ｜ disabled opacity .45 + `pointer-events:none` + 原生 `disabled` ｜ loading 保留宽度 + `.spinner` + 文案进行时（「提交中…」）+ `aria-busy` ｜ error 不适用于按钮本体（用表单/页面错误态）。 |
| **无障碍** | 全键盘可达；`loading` 时禁止重复提交；危险按钮写动词（「删除题目」「打回重做」）；按钮文本说明对象或后果。 |
| **使用规则** | ① 一屏一个 primary；② 底部动作条最多 2 个；③ 危险动作用 `danger`/`danger-soft` + 二次确认；④ loading 文案用进行时；⑤ 触控区不缩小（`btn--xs` 仅用于卡内次要动作，命中区需补 44）。 |
| **反例** | 4 个按钮全是 primary；「确定/取消」；loading 时按钮变矮导致布局跳动；禁用态只是变灰但仍可点。 |

### 3.2 SearchBar 搜索栏

| 维度 | 规范 |
|---|---|
| **用途** | 作业列表、题库、组织目录的本地/服务端搜索。 |
| **Anatomy** | `.searchbar > [icon search] + input + [清除按钮]`。 |
| **尺寸 / 令牌** | 高 40px（L，收敛到 `--m-control-h` 48）；圆角 12px（`--m-radius-input`）；背景 `--bg-sunken`；字号 14px；图标 18px `--text-tertiary`；清除按钮 44px 命中区。 |
| **状态** | default ｜ focus 边框/焦点环 ｜ filled 显示清除按钮 ｜ loading（搜索中）右侧 `.spinner` ｜ empty 结果由空态组件承担（「没有找到…」）｜ disabled 不适用。 |
| **无障碍** | 可见 `<label>` 或 `aria-label="搜索作业"`；`type="search"` + `enterkeyhint="search"`；清除按钮 `aria-label="清除搜索"`；搜索建议数量用 `aria-live="polite"` 播报。 |
| **使用规则** | ① 输入防抖 ≥300ms；② 进入页面不自动聚焦（避免键盘弹起）；③ 搜索态与空态文案区分（无结果 vs 无数据）；④ 清空后恢复全量并保留筛选。 |
| **反例** | 每输入一个字符就发请求；无清除按钮；placeholder 代替 label；搜索框吸顶后遮挡标题。 |

### 3.3 Form Field 表单字段

| 维度 | 规范 |
|---|---|
| **用途** | 登录（账号/密码）、布置作业（标题/时间/描述）、教师评语（多行）、分数修改（数字）。 |
| **Anatomy** | `.field > label.label + (input/textarea) + [.help 或 .error-text] + [.counter]`。 |
| **尺寸 / 令牌** | 输入高 `--m-control-h` 48px；圆角 `--m-radius-input` 12px；边框 1px `--input-bd`；聚焦边框 `--input-bd-focus` + `--ring-focus`；字号 15px（L）→ **生产输入用 16px 防 iOS 缩放**（§0.4）；textarea 最小高 110px、`resize:none`；label 13px/500 `--text-secondary`；帮助 12px；错误 12px `--status-danger-fg` + 图标；字数 12px 右对齐。 |
| **状态** | default ｜ focus 焦点环 ｜ filled ｜ disabled `--input-bg-disabled` + `--text-disabled` ｜ error `.input-error`（`--red-500` 边框）+ 字段下方错误文案 + `aria-invalid` ｜ loading：字段只读 + 右侧 `.spinner`（如校验中）。 |
| **无障碍** | `label for/id` 关联；错误 `aria-describedby` 指向错误文案；`aria-required="true"`；错误文案说明如何修正（「满分需为 1–100 的整数」）；密码可见切换按钮 `aria-label="显示密码"` + `aria-pressed`。 |
| **使用规则** | ① 一次提交只提示第一个错误并滚动聚焦；② 校验时机：文本 `blur`、选择 `change`；③ 数字输入用 `inputmode="numeric"`；④ 长文本给字数上限并实时计数；⑤ 软键盘弹起时字段不隐藏在动作条下（§6.3）。 |
| **反例** | placeholder 当 label；错误只标红不给文案；输入框 12px 字号触发 iOS 缩放；同一表单混用 3 种高度。 |

### 3.4 Choice 选择控件（Switch / Check / Radio / Option）

| 维度 | 规范 |
|---|---|
| **用途** | Switch：设置项即时开关（深色主题、通知）；Check：批量多选、答题卡标记；Radio：单选（考试选项）；Option：作答选项卡与向导选题卡（`.option-card`）。 |
| **Anatomy** | Switch `.switch`（51×31 轨道 + 滑块）；Check `.check`（22px 圆角 7）；Radio `.radio`（22px 圆）；`.option` / `.option-card` 整行卡片 + 控件 + 文案。 |
| **尺寸 / 令牌** | Switch 轨道 51×31（L），整行命中 ≥56px（`--m-row-h`）；Check/Radio 视觉 22px，整行/整卡可点补 44px；`.option` 内距 14px、圆角 14px（L）、选中边框 `--brand-600` + 底 `--bg-selected`；`.option-card` 同上。 |
| **状态** | default ｜ pressed（整行背景反馈）｜ selected/on（`--brand-600` 填充 + 勾/圆点；Switch `--green-600` 轨道）｜ focus 焦点环包住控件 ｜ disabled `--text-disabled` + `aria-disabled` ｜ error 选项组整体给错误文案（不单独标红某项）。 |
| **无障碍** | Switch：`role="switch" aria-checked`（Screen Kit 已实现）；Check：`role="checkbox" aria-checked` 或原生 input；Radio：`role="radiogroup"` + 每项 `role="radio" aria-checked`；选项组用 `aria-labelledby` 指向题干；**整行可点**（点击文字也能选中）；选中态 = 颜色 + 勾/填充，不只颜色。 |
| **使用规则** | ① 立即生效且可回滚用 Switch；需要保存才生效用 Check/Radio；② 选项 ≤5 用纵向排列；③ 作答选项高度 ≥56px，长选项换行；④ 多选题必须显式提示「多选」。 |
| **反例** | 用 Switch 当提交按钮；只有控件可点、文字不可点；选中只描边不填充；无线组 `aria-labelledby` 导致读屏不知道在答哪题。 |

### 3.5 Upload 上传卡

| 维度 | 规范 |
|---|---|
| **用途** | 工程包/附件上传（学生实训题提交、教师题库材料）；移动端只做「选择文件 + 进度 + 结果」，不提供拖拽。 |
| **Anatomy** | `.upload > .upload-icon + h4 + p（约束说明）+ .btn（选择文件）`；上传后列表行（文件名 + 大小 + 进度 + 删除）。 |
| **尺寸 / 令牌** | 卡内距 26px/16px；虚线边框 1.5px `--border-strong`；圆角 `--m-radius-card` 16px；图标圆 52px；标题 15px；说明 12.5px `--text-tertiary`；按钮在主操作位。 |
| **状态** | idle 虚线框 ｜ pressed 边框 `--input-bd-hover` ｜ uploading 进度条 + 百分比 + 可取消 ｜ error 文件行红色 + 原因（类型/大小/网络）｜ success 文件名 + 大小 + 替换/删除。 |
| **无障碍** | 选择按钮可聚焦（不要隐藏 `input[type=file]` 导致不可达）；进度 `role="progressbar" aria-valuenow`；删除按钮 `aria-label="删除 工程包.zip"`；约束文案在选择前可见。 |
| **使用规则** | ① 约束前置（类型/大小/数量）；② 上传中显示文件名与百分比；③ 失败给可执行原因与重试；④ 成功后允许核对，不自动清空。 |
| **反例** | 只写「上传失败」；允许任意类型；成功后列表消失无法核对；拖拽区在手机上不可用。 |

## 4. 数据展示

### 4.1 Progress 进度条 / 进度环

| 维度 | 规范 |
|---|---|
| **用途** | 作业提交进度、答题进度、分数构成、队列完成度。 |
| **Anatomy** | 条：`.bar > i[style="width:84%"]`；环：`.ring[style="--p:84"] > .ring-in > b + span`。 |
| **尺寸 / 令牌** | 条高 8px（`.bar--sm` 6px、`.bar--lg` 10px），轨道 `--score-track`，填充 `--brand-600`；语义变体 `.bar--success`（`--score-excellent`）/`--warning`（`--score-pass`）/`--danger`（`--score-fail`）。环 78px（内 62）/ 小环 54px（内 44）（L，见 §0.4），数值 19px/700。 |
| **状态** | 静态为主；loading 时条用骨架（可保留数值 + 宽度动画 220ms）；数据缺失显示灰色轨道 + «—»；不提供 error 态（由外层卡片承担）。 |
| **无障碍** | 条：`role="progressbar"` + `aria-valuenow/min/max` + `aria-label="提交进度 84%"`；环：同样加 `aria-label`；**数值必须可读**，不能只有环。 |
| **使用规则** | ① 进度必须有数字（`38/45` 或 `84%`）；② 一屏内进度条不超过 3 条；③ 环只用于首屏主指标（作业详情），列表用条。 |
| **反例** | 只有颜色无数字；进度 84% 却画成 100% 的环；轨道与页面底色对比不足。 |

### 4.2 Score 分数展示

| 维度 | 规范 |
|---|---|
| **用途** | 审核队列 AI 分、成绩详情总分、逐题得分、分项得分。 |
| **Anatomy** | 大分：`.score-hero > b + .total + .tag`；行：`.score-line > .k + .v`；小分：`.score-chip.score-chip--excellent`。 |
| **尺寸 / 令牌** | 大分 46px（L）700、行高 .95、`.tnum`；满分 14px `--text-tertiary`；等级 tag 与分数同排；行分 13.5px；语义色 `--score-excellent / good / pass / fail`（浅色/深色均已定义）。 |
| **状态** | 未出分显示 «—» + `--text-tertiary`（不要显示 0）；待评分用 `.tag--warning`；已发布用 `.tag--success`；改分输入时分数用普通文本 + 输入框，不双重强调。 |
| **无障碍** | 分数文本 = 数字 + 满分（「92 / 100」）读屏可读；等级不只靠颜色（「等级 A」文字）；`.tnum` 防跳动；颜色对比度 ≥4.5:1（用 `--score-*` 令牌）。 |
| **使用规则** | ① 分数必须配满分与等级/状态；② 一屏最多一个「大分」；③ 分项分用列表，不再用大分；④ 分数颜色按档位：优秀/良好/及格/不及格（阈值口径待确认，见 §9）。 |
| **反例** | 92 分显示绿色但无「/100」；用红绿表示排名；待评分显示 0 分；分数与标签颜色相互冲突。 |

### 4.3 AI Note AI 评语卡

| 维度 | 规范 |
|---|---|
| **用途** | 展示 AI 评分依据/评语（学生成绩详情、教师审核队列/详情）；教师评语另用普通卡片，不混排。 |
| **Anatomy** | `.ai-note > .ai-note-head（图标 + 「AI 评语」）+ p + .ai-foot（时间/模型）`；引用式 `.quote`（代码/评语引用）。 |
| **尺寸 / 令牌** | 背景 `--bg-surface-2`、描边 `--border-subtle`、圆角 14px（L）、内距 14px；head 13px/600 `--text-secondary` + 16px 品牌图标；正文 14px/1.65；foot 12px `--text-tertiary`；`.quote` 左边框 3px `--brand-400`。 |
| **状态** | 静态；AI 评分中显示 `.tag--info` + 进度文案（「AI 评分中，预计 1 分钟」）；失败显示 `.banner--warning` + 重试入口；折叠态用 `.clamp-3` + 「展开」。 |
| **无障碍** | 区块 `aria-label="AI 评语"`；AI 生成内容与教师内容必须有明确文字来源（读屏可分辨）；展开/收起按钮 `aria-expanded`；长文本可选中复制。 |
| **使用规则** | ① AI 内容只读、不可编辑；② 教师改分/评语放独立区域；③ 折叠时保留首行结论；④ 引用代码片段用 `.quote` 并标注行号。 |
| **反例** | 把 AI 评语伪装成教师评语；AI 内容无来源标识；长评语一屏铺满、没有折叠。 |

### 4.4 QGrid 答题卡

| 维度 | 规范 |
|---|---|
| **用途** | 作答页底部 Sheet：题号宫格 + 图例 + 交卷入口；一屏完成「检查 + 跳题」。 |
| **Anatomy** | `.qgrid > button.qnum` × N + `.qlegend`（已答/当前/未答/标记）+ Sheet 底部主按钮。 |
| **尺寸 / 令牌** | 5 列网格，gap 10px；每格 44px 高（=`--m-touch-min`）、圆角 10px；字号 14px；已答 `--bg-selected` + `--status-info-bd`；当前 `--brand-600` 实底白字；标记 `--status-warning-bg`；图例色块 10px。 |
| **状态** | 四态：已答 / 当前 / 未答 / 标记（互斥优先级：当前 > 标记 > 已答 > 未答；当前题若已标记，仍以「当前」实底 + 角标圆点提示）；点击题号跳转并关闭 Sheet。 |
| **无障碍** | 宫格容器 `role="group" aria-label="答题卡"`；每格 `aria-label="第 3 题，已答"` / 「当前题」「已标记」；当前题 `aria-current="true"`；44px 触控原生达标；图例文字说明四态。 |
| **使用规则** | ① 题号 ≤40 一屏；>40 时允许 Sheet 内滚动；② 四态必须配图例；③ 交卷按钮固定在 Sheet 底部；④ Sheet 打开时背景内容不可滚动。 |
| **反例** | 只用颜色区分四态；当前题与已答题同色；宫格挤成 30px 高；图例缺失。 |

### 4.5 Steps 步骤条

| 维度 | 规范 |
|---|---|
| **用途** | 布置作业向导（4 步）：基本信息 → 选题 → 班级 → 确认。 |
| **Anatomy** | `.steps > .step(.stepdot) + .steplabel + .stepline`。 |
| **尺寸 / 令牌** | 步骤点 26px（L，纯展示）；标签 12.5px；连接线 2px `--border-default`，完成段 `--brand-400`；激活点 `--brand-600` 白字；完成点 `--bg-selected` + 品牌字。 |
| **状态** | done / active / todo 三态；步骤可点跳转时（仅允许回退）命中区需补 44px；不允许跳未来步骤。 |
| **无障碍** | `<ol>` 或 `role="list"`；当前步 `aria-current="step"`；完成/未完成用文字（「第 2 步，共 4 步」）辅助读屏；步骤名可见。 |
| **使用规则** | ① 2–4 步；② 每步只有一个主题；③ 底部固定「上一步/下一步」；④ 离开向导要提示存草稿。 |
| **反例** | 6 步向导（手机应合并）；步骤名被截断；点步骤直接跳到未完成步骤。 |

### 4.6 CodeBox 代码只读面板

| 维度 | 规范 |
|---|---|
| **用途** | 教师查看学生代码、学生查看参考代码；**只读，无编辑、无 Monaco**。 |
| **Anatomy** | `.codebox > .codebar（文件名 + 文件类型徽标）+ .codebody > .codeline（.ln + 代码）+ .codetoolbar（字号/换行/复制）+ .selmenu（长按选区菜单）`。 |
| **尺寸 / 令牌** | 背景 `--code-bg`、圆角 14px；代码字号 `--m-fs-code` 12.5px、行高 `--m-lh-code` 1.75、字体 `--font-mono`；行号列宽 36px、`sticky left`、`user-select:none`；`.codebody` 最大高 340px 内滚动，横向可滑；高亮行 `.codeline.hl` 用 `--brand-400` 左侧 3px 条；语法色为 SCREENS.md 允许的固定色（不随主题翻转）。 |
| **状态** | default / 加载（`.sk-card` 或代码骨架）/ error（行内 `.banner--danger` + 重试）/ 选中行（`.codeline.hl`）/ 字号档（小/标准/大）；无 disabled（只读即默认）；无 hover。 |
| **无障碍** | 用 `<pre><code>`；行号 `aria-hidden="true"`；选区菜单必须同时提供非手势入口（工具栏「复制代码」/「引用到评语」），否则键盘/读屏用户不可达；字号调节按钮 `aria-label="增大字号"`。 |
| **使用规则** | ① 只读；② 行号固定不随横滑；③ 长文件内滚动，不撑高页面；④ 代码复制/引用后给 Toast 反馈；⑤ 深色面板固定深色（浅色主题也是深色，属预期）。 |
| **反例** | 手机上嵌 Monaco 可编辑；行号随内容滚走；代码字号 <12px；红色/绿色单靠颜色表示增删。 |

### 4.7 Diff 代码差异

| 维度 | 规范 |
|---|---|
| **用途** | 教师对比「学生提交 vs 参考/上一次提交」，逐块折叠；390px 无法并排，因此采用**上下行内 diff**。 |
| **Anatomy** | `.diffcard > .diffhead（文件名 + 差异处数 + 只看差异开关）+ .diffbody > .diffline（.dln + 内容）+ .diffmore（折叠的相同行）`。 |
| **尺寸 / 令牌** | 卡圆角 14px（L）、描边 `--border-subtle`；头 13px `--bg-surface-2`；正文 mono 12px（L，收敛到 `--m-fs-code` 12.5）、行高 1.72；新增行 `--status-success-bg` + `--status-success-fg`，删除行 `--status-danger-bg` + `--status-danger-fg`；行号列 30px。 |
| **状态** | default / 只看差异（折叠相同行）/ 展开块（`.diffmore` 可点）/ 选中引用；加载与错误由外层卡片承担；无 hover。 |
| **无障碍** | 增删行必须有 `+/-` 前缀（不能只靠底色）；折叠条用 `button aria-expanded`；文件差异数进入 `aria-label="App.vue，4 处差异"`；引用按钮可键盘触发。 |
| **使用规则** | ① 只做行内 diff；② 默认折叠相同行；③ 提供「只看差异」开关；④ 一处差异引用到评语后给反馈；⑤ 超大 diff 分块懒加载。 |
| **反例** | 手机上画并排双栏 diff；增删只改底色无符号；相同行全部展开导致找不到差异。 |

### 4.8 QR / Handoff 二维码接力

| 维度 | 规范 |
|---|---|
| **用途** | 手机做不了的事（写代码、编辑标准答案）→ 扫码/复制链接到电脑继续；学生编程题、教师编辑说明页。 |
| **Anatomy** | `.handoff > .qr[data-qr] + .handoff-main（h4 + p + .btn 复制链接）`；可加有效期倒计时。 |
| **尺寸 / 令牌** | 二维码 108×108px、白底、内距 6px、圆角 10px（L）；说明标题 15px/600、正文 12.5px `--text-tertiary`；复制按钮 `.btn--soft` 或 `.btn--sm`（命中区 44）。 |
| **状态** | default / 生成中（骨架方块）/ 过期（二维码灰化 + 「已过期，重新生成」）/ 复制成功（Toast「链接已复制」）；无 error 时也要有备用入口。 |
| **无障碍** | 二维码必须有等价文字（「扫码在电脑打开」+ 可复制链接）；复制按钮 `aria-label="复制电脑端链接"`；倒计时用 `role="status"` 播报但不过度打扰。 |
| **使用规则** | ① 永远提供「复制链接」作为二维码的替代；② 说明有效期（设计约定 10 分钟，待实施确认）；③ 链接打开后落到电脑端对应页面；④ 不在二维码里塞登录凭据（需一次性 token，待实施）。 |
| **反例** | 只有二维码没有链接；二维码有效期不提示；扫码后落 404；把密码/长期 token 编码进链接。 |

---

## 5. 反馈与浮层

### 5.1 Banner 提示条

| 维度 | 规范 |
|---|---|
| **用途** | 页面级提示：不可撤销警告、只读说明、截止提醒、网络错误、AI 评分中。 |
| **Anatomy** | `.banner.banner--warning > icon + 文本 + [.banner-link]`。 |
| **尺寸 / 令牌** | 内距 12px 14px、圆角 14px（L）、字号 13px/1.55、图标 17px；变体 `--info / --warning / --danger / --success / --neutral` 使用 `--status-*-bg/fg/bd`；危险不可撤销提示用 `--danger` 或 `--warning`。 |
| **状态** | 静态；可带操作链接（`.banner-link`）；成功类可 3s 自动消失，错误/风险类**不自动消失**；loading 不适用。 |
| **无障碍** | 成功/信息 `role="status"`，错误/风险 `role="alert"`；链接可键盘聚焦；不要只靠颜色（图标 + 文案）。 |
| **使用规则** | ① 一屏同类 banner ≤1 条；② 文案 = 发生了什么 + 怎么办；③ 不可撤销操作前必须常驻，不能只放 Toast；④ 不放在滚动区之外的空隙里被遮挡。 |
| **反例** | 用 banner 做广告/装饰；错误只弹 Toast 不留在页面；红色 banner 放「操作成功」。 |

### 5.2 Bottom Sheet 底部弹层

| 维度 | 规范 |
|---|---|
| **用途** | 答题卡、交卷确认、筛选、快捷评语等轻量浮层；替代桌面居中 Modal。 |
| **Anatomy** | `.mask[data-for]` + `.sheet > .grabber + .sheet-head(.sheet-title/.sheet-close) + .sheet-body + .sheet-foot`。 |
| **尺寸 / 令牌** | 顶部圆角 `--m-radius-sheet` 24px；最大高度 90%；底部内距 `--m-safe-bottom`；grabber 36×5px；标题 17px/600；遮罩 `--m-scrim`；动效 `--m-duration-sheet` 320ms + `--m-ease-sheet`；层级 70/80；页面 `data-bottom="sheet"` 预留。 |
| **状态** | closed / opening / open / closing；内容 loading（骨架）；错误（行内 banner）；主按钮 loading；打开时背景不可滚动；关闭三选一（遮罩/按钮/下滑）。 |
| **无障碍** | `role="dialog" aria-modal="true"` + `aria-labelledby` 指向标题；打开时焦点移入、关闭归还；Esc 关闭；遮罩不可作为唯一关闭方式；关闭按钮 `aria-label="关闭"`；焦点陷阱内循环。 |
| **使用规则** | ① 只放「选择/确认/轻量编辑」，完整表单用二级页；② 一屏只开一个 Sheet；③ 底部必须有主操作；④ 关闭按钮视觉 32 + 命中 44。 |
| **反例** | Sheet 里放 4 步表单；没有关闭按钮只能点遮罩；Sheet 打开后背景仍可滚动；标题为空。 |

### 5.3 ActionSheet 操作面板

| 维度 | 规范 |
|---|---|
| **用途** | 低频操作的收纳：更多（编辑/删除/批量）、导出方式选择。 |
| **Anatomy** | `.mask` + `.actionsheet > .action-row × N + .action-row--cancel`。 |
| **尺寸 / 令牌** | 左右 8px、距底部安全区 +8px、圆角 20px；每行最小 56px；危险行动作 `--status-danger-fg`；取消行加粗并独立分组；层级同 Sheet（70/80）；动效 `--m-duration-sheet`。 |
| **状态** | 打开/关闭；行 pressed 背景；danger 行有二次确认（或直接进确认页）；loading 不适用。 |
| **无障碍** | `role="dialog" aria-label="更多操作"`；行是按钮；危险动作加 `aria-describedby` 说明；Esc 关闭；焦点移入第一项、关闭归还。 |
| **使用规则** | ① 2–5 个动作；② 破坏性动作放最后且红色；③ 与 Sheet 不同时使用；④ 每个动作写对象（「删除这份作业」）。 |
| **反例** | 用 ActionSheet 做导航菜单；8 个动作塞一屏；危险动作与取消行混在一起。 |

### 5.4 Toast 轻提示

| 维度 | 规范 |
|---|---|
| **用途** | 一次性反馈：链接已复制、已通过审核 12 份、草稿已保存。 |
| **Anatomy** | `.toast.show > [icon] + 文本`；Sheet 之上用 `.toast--sheet`。 |
| **尺寸 / 令牌** | 最大宽 82%、内距 10px 16px、圆角 12px、背景 `--gray-950`、白字 14px/1.45、阴影 `--m-shadow-toast`；位置：距底部安全区 +82px（动作条/TabBar 之上），Sheet 场景 +16px；层级 `--m-z-toast` 90 / 上方 95；动效 `--m-duration-base` 220ms。 |
| **状态** | 显示 2–3s 自动消失；同一时刻最多 1 条（新替旧）；可手动点击关闭（可选）；错误 toast 不替代页面错误态。 |
| **无障碍** | 成功/信息 `role="status" aria-live="polite"`，错误 `role="alert"`；不长驻；重复触发合并而不是堆叠。 |
| **使用规则** | ① 只用于「已完成」的确认；② 不承载需要用户决策或操作的信息；③ 错误必须同时有页面内可恢复入口；④ 文案 ≤ 20 字。 |
| **反例** | 用 Toast 展示表单校验错误；Toast 停留 8s；同时弹 3 条；Toast 挡住底部主按钮。 |

### 5.5 Empty 空态

| 维度 | 规范 |
|---|---|
| **用途** | 请求成功但无数据；筛选无结果；权限不足导致的不可见。 |
| **Anatomy** | `.empty > .empty-icon + h3 + p + .btn`。 |
| **尺寸 / 令牌** | 内距 44px 24px；图标圆 88px `--bg-sunken` + 36px 图标 `--text-tertiary`；标题 16px/600；说明 13px、最大宽 250px；主按钮最小宽 160px。 |
| **状态** | 静态；区分四种文案：无数据 / 无筛选结果 / 无权限 / 已结束；可带次操作。 |
| **无障碍** | 标题用 `h3` 或 `role="heading"`；图标 `aria-hidden`；说明不要只写「暂无数据」，要说明下一步；主操作可键盘聚焦。 |
| **使用规则** | ① 三件套：原因 + 下一步 + 主操作；② 无数据与无筛选结果必须文案不同；③ 空态不显示分页/筛选器之外的空白控件；④ 空态高度让滚动区自然居中，不写死 100vh。 |
| **反例** | 「暂无数据」一句话；空态主按钮跳转到无关页；空态与错误态混用。 |

### 5.6 Skeleton 骨架屏

| 维度 | 规范 |
|---|---|
| **用途** | 首次加载且无缓存内容时的占位（列表 3 张卡、详情 2–3 块）。 |
| **Anatomy** | `.sk-card > .sk.sk-line × n`；圆形占位 `.sk.sk-circle`；列表用 `.sk-card + .sk-card`。 |
| **尺寸 / 令牌** | 卡片骨架与真实卡同圆角/内距；行高 13px（`.sk-line--sm` 10px）；渐变 `--skeleton-bg` → `--skeleton-sheen` → `--skeleton-bg`，动画 1.35s（L，见 §0.4）。 |
| **状态** | 仅 loading；加载完成即替换；超过 5s 建议追加「仍在加载…」文字；`prefers-reduced-motion` 下停用扫光（实施必须补，见 §9）。 |
| **无障碍** | 骨架容器 `aria-busy="true"` + `aria-label="加载中"`；骨架块加 `aria-hidden="true"`；不要把骨架内容当真实内容朗读。 |
| **使用规则** | ① 骨架形状 ≈ 真实内容布局；② 首屏 3 张卡足够，不铺满 10 屏；③ 有旧数据时用局部 loading（保留旧内容），不清空换骨架。 |
| **反例** | 骨架与真实布局差异大导致跳动；一直转圈没有骨架；骨架本身可点击。 |

### 5.7 Error 错误态 / 错误页 / 字段错误

| 维度 | 规范 |
|---|---|
| **用途** | 页面级错误（`.errorbox` / `error-404/403/500`）、区块错误（行内 banner）、字段错误（`.error-text`）。 |
| **Anatomy** | 页面：`.errorbox > .error-code + h3 + p + .btn×2`；字段：`.error-text > icon + 文案`。 |
| **尺寸 / 令牌** | 错误码 52px/700 `--text-tertiary`；标题 18px/600；说明 13px/1.65、最大宽 260px；图标/字段错误 12px `--status-danger-fg`；重试按钮 primary，返回 secondary。 |
| **状态** | error → 可重试时给 loading；不可重试（403/404）给出口按钮；5xx 显示错误编号；离线态用 banner 不用错误页。 |
| **无障碍** | 页面错误标题用 `h1`；`role="alert"` 用于出现即播报的错误；错误文案说明「发生了什么 + 我能做什么」；错误编号可复制但不作为唯一信息。 |
| **使用规则** | ① 不白屏：任何请求失败都要有可读错误与重试；② 保留登录态与返回路径（403 不踢登录）；③ 错误文案不暴露技术栈；④ 5xx 显示编号便于支持定位。 |
| **反例** | 失败后一直转圈；只弹 Toast 然后空白；403 把用户踢回登录页；错误页没有返回入口。 |

### 5.8 ReadonlyTip 只读提示

| 维度 | 规范 |
|---|---|
| **用途** | 明确「此处只读 / 请用电脑」：题库预览、组织目录、监控配置、手机编辑说明。 |
| **Anatomy** | `.readonly-tip > [icon lock] + 文案`。 |
| **尺寸 / 令牌** | 内距 10px 12px、圆角 12px、背景 `--bg-surface-2`、虚线边框 `--border-strong`、字号 12.5px `--text-tertiary`、图标 15px。 |
| **状态** | 静态；可带链接（「在电脑打开」）。 |
| **无障碍** | 文本可读；链接可聚焦；图标 `aria-hidden`；不要用 disabled 控件表达（说明必须文字化）。 |
| **使用规则** | ① 靠近被限制的控件放置；② 说明原因与替代路径；③ 不用于错误提示。 |
| **反例** | 只把按钮置灰不说明原因；用只读提示承载错误；提示藏在页面底部看不见。 |

---

## 6. 交互模式（非组件，但必须遵守）

### 6.1 四态编排（全屏 vs 局部）

| 场景 | 表达 | 禁止 |
|---|---|---|
| 首次进入列表 | 骨架（3 张卡） | 全屏空白 + 转圈 |
| 已有数据后刷新 | 保留旧数据 + 顶部细进度 / 局部 spinner | 清空列表换骨架 |
| 请求成功无数据 | Empty 三件套 | 显示「暂无数据」无操作 |
| 请求失败 | 行内 `.errorbox` / banner + 重试 | 白屏 / 只 Toast |
| 断网 | 全局离线 banner + 列表灰化 + 禁用提交 | 静默失败 |
| 部分完成 | 状态 tag + 进度 + 说明（AI 评分中 / 待评分） | 假装完成 |

### 6.2 手势模式（有手势必须有按钮替代）

| 手势 | 用在哪 | 规范 | 无障碍替代 |
|---|---|---|---|
| 左滑行操作 | 教师作业列表（锁定/复制链接）、学生作业卡 | 滑动阈值 40% 宽度；一次只露出一行；滑开时点其他行先收起 | 「更多」按钮或详情页操作（手势必须可发现、可绕过） |
| 长按多选 | 批量审核选择、代码选区 | 长按 400ms + 触觉反馈（若支持）；长按后进入多选模式并显示「已选 N」 | 顶部「选择」按钮进入多选 |
| 上下滑切换 | 教师审核队列 | 一次一份，带吸附；切换后焦点/标题更新 | 「上一份/下一份」按钮 + 队列列表入口 |
| 下拉刷新 | 列表页 | 仅在顶部且页面滚动到顶时触发；刷新中不阻塞滚动 | 顶部「刷新」按钮（或错误态重试） |
| 上拉加载 | 长列表 | 触底 200px 预加载；加载中显示行内 loading；无更多显示「没有更多了」 | 分页按钮（若产品坚持） |

> 左滑/长按/下拉刷新在预览 Screen Kit 中**未实现**（0 处手势代码）；本规范是设计要求，实施阶段按 `04-interaction-a11y.md` 落地，且**任何手势都必须有按钮替代**。

### 6.3 键盘与输入

| 项 | 规范 |
|---|---|
| 软键盘遮挡 | 用 `visualViewport` 监听高度变化；底部 ActionBar 随键盘上移或隐藏，字段滚动到可视区 |
| 输入类型 | 学号/数字 `inputmode="numeric"`；搜索 `type="search"`；密码 `autocomplete="current-password"`；验证码 `autocomplete="one-time-code"` |
| 回车键 | `enterkeyhint` 取值 done / next / search / send，按场景设置；单行回车不触发提交（除非明确） |
| iOS 缩放 | 输入控件字号 ≥16px（§0.4）；禁止用 `user-scalable=no` 全局禁缩放 |
| 文本选择 | 代码/评语可选中复制；普通列表不禁止选择 |

### 6.4 焦点与读屏

| 项 | 规范 |
|---|---|
| 焦点环 | 全局 `:focus-visible` 2px `--border-focus`；不得 `outline:none` 后不补 |
| Sheet/对话框 | 打开焦点移入、Esc 关闭、关闭归还触发元素；焦点陷阱 |
| 页面切换 | 路由切换后焦点移到 `h1` 或主标题，并 `aria-live` 播报页面名 |
| Tab 选中 | `aria-current="page"`；分段 `aria-selected` |
| 动态内容 | 列表刷新、评分完成用 `role="status"` 播报摘要，不逐条朗读 |
| 图标 | 纯装饰 `aria-hidden="true"`；语义图标配 `aria-label` |

---

## 7. 屏幕 → 组件使用矩阵

> 图例：● 主要使用 ｜ ○ 少量/局部 ｜ — 不使用。
> 导航骨架 = AppBar + TabBar/ActionBar；状态反馈 = Banner/Empty/Skeleton/Error/Toast 的编排。

| # | 屏幕 | 导航骨架 | 内容容器 | 操作 | 表单/输入 | 状态反馈 | 专用组件 |
|---|---|---|---|---|---|---|---|
| 1 | `public-landing` | — | Card | Button | — | — | BrandBar / 能力卡 |
| 2 | `public-login` | — | Card | Button | Field / Switch（记住我） | Banner（错误） | BrandBar |
| 3 | `public-doc` | AppBar | Card / List | Button | SearchBar | Empty / Skeleton | 文章目录 |
| 4 | `error-404` | — | ErrorBox | Button ×2 | — | ErrorCode | 复制地址 |
| 5 | `error-403` | — | ErrorBox | Button | — | ErrorBox | 身份卡 |
| 6 | `error-500` | — | ErrorBox | Button | — | ErrorCode / loading | 错误编号 |
| 7 | `student-home` | TabBar | Card / Stats | Button | — | Skeleton / Banner | 今日待办卡、成绩条 |
| 8 | `student-assignments` | TabBar | Card / Chips | Button | SearchBar | Skeleton / Empty / Error | 截止 banner、进度 |
| 9 | `student-assignment-detail` | AppBar + ActionBar | Card / KV / List | Button | — | Banner | Tag（题型）、题目列表 |
| 10 | `student-answer-objective` | AppBar + ActionBar | Option | Button | Radio（Option） | Banner（计时） | 倒计时、答题卡入口 |
| 11 | `student-answer-code` | AppBar + ActionBar | Card / CodeBox | Button | — | Banner / 草稿提示 | QR + Handoff |
| 12 | `student-answer-sheet` | Sheet | QGrid | Button | — | QLegend | Sheet |
| 13 | `student-submit-confirm` | Sheet | Stats / KV | Button | — | Banner（warning） | Sheet |
| 14 | `student-assignment-done` | AppBar | Card / Steps（时间线） | Button | — | Banner（info） | 成功图标、时间线 |
| 15 | `student-scores` | TabBar | Card / Stats / List | Button | — | Skeleton / Empty | 分数、等级 Tag |
| 16 | `student-score-detail` | AppBar | Card / Score / Bar / List | Button | — | Error | AI Note、逐题分 |
| 17 | `student-profile` | TabBar | Card / List | Button（退出） | Switch | — | 身份卡 |
| 18 | `teacher-home` | TabBar | Stats / Card | Button | — | Skeleton / Banner | 待办三卡 |
| 19 | `teacher-assignments` | TabBar | Card / Chips | Button | SearchBar | Skeleton / Empty / Error | 进度条、左滑（待实施） |
| 20 | `teacher-assignment-detail` | AppBar + ActionBar | Card / Ring / Seg / List | Button | — | Banner | 进度环、提交分段 |
| 21 | `teacher-review-queue` | TabBar + queuebar | Card / AI Note | Button | — | Banner / Toast | 队列进度、分项分 |
| 22 | `teacher-review-detail` | AppBar + ActionBar | Card / Score / AI Note / Seg | Button | Field（评语/改分） | Error | 分项、快捷评语 |
| 23 | `teacher-review-code` | AppBar + ActionBar | CodeBox / SelMenu | Button | — | Banner | 代码只读 |
| 24 | `teacher-review-diff` | AppBar + ActionBar | DiffCard | Button | — | Banner | 行内 diff |
| 25 | `teacher-batch-select` | AppBar + ActionBar | List / Check | Button | Check | — | 全选本页 |
| 26 | `teacher-batch-confirm` | AppBar + ActionBar | Card / Chips / Banner | Button | — | Toast / Banner（danger） | 影响范围摘要 |
| 27 | `teacher-assign-wizard` | AppBar + ActionBar | Card / Steps / OptionCard | Button | Field / SearchBar / Chips | Error | 步骤条、已选摘要 |
| 28 | `teacher-questions` | AppBar | List / Chips | Button | SearchBar | Empty / ReadonlyTip | 题目卡 |
| 29 | `teacher-class` | AppBar | Card / List / Stats | Button | SearchBar | Empty | 班级进度 |
| 30 | `teacher-profile` | TabBar | Card / List | Button（退出） | Switch | Toast（桌面版） | 身份卡 |
| 31 | `teacher-code-unsupported` | AppBar + ActionBar | Card / Handoff / QR | Button | — | Banner | QR 接力 |
| 32 | `admin-home` | TabBar | Stats / Card / List | Button | — | Skeleton / Banner | 系统状态卡 |
| 33 | `admin-directory` | TabBar | Seg / List | Button | SearchBar | Empty / Error / ReadonlyTip | 只读目录 |
| 34 | `admin-monitor` | TabBar | Stats / Card | Button（刷新） | — | Loading / 实时 Tag | 日志流 |
| 35 | `platform-install` | — | Card / Handoff | Button | — | — | 平台指引 |
| 36 | `platform-splash` | — | Brand | — | — | Progress | 启动屏 |
| 37 | `states-overview` | — | Seg / 面板 | Button（示例） | — | 四态全部 | 四态对照 |

---

## 8. 组件验收清单（每个组件逐项打勾）

- [ ] 尺寸/圆角/间距全部来自令牌（或已在 §0.4 登记为待收敛字面量）。
- [ ] 触控目标 ≥44×44；相邻可点元素间距 ≥8px。
- [ ] 无 hover 依赖；pressed/selected/focus/disabled/loading 五态齐备（适用时）。
- [ ] 状态不只靠颜色（标签带文字、选中带勾/指示条、增删带 +/-）。
- [ ] 浅色/深色两套主题下对比度 ≥4.5:1（正文）、≥3:1（非文本）。
- [ ] 纯图标按钮有 `aria-label`；表单 `label for/id` 关联；错误 `aria-describedby`。
- [ ] 动画尊重 `prefers-reduced-motion`（令牌已处理 90% 场景，骨架扫光需单独处理）。
- [ ] 安全区：固定元素（AppBar/TabBar/ActionBar/Sheet/Toast）与 `--m-safe-*` 配合，不被刘海/手势条遮挡。
- [ ] 键盘：Sheet 焦点陷阱、Esc 关闭、关闭归还焦点。
- [ ] 文案：状态与按钮写对象和动词，不出现「确定/取消」裸词。

---

## 9. 待确认（组件层面）

| # | 问题 | 说明 | 建议 |
|---|---|---|---|
| 1 | 34px 级控件（chips/seg/工具条/关闭按钮）的命中区 | 视觉 34px 低于 44px 底线 | 统一「视觉不变 + 容器 padding 补 44」；若产品不接受，放大到 40–44 |
| 2 | iOS 输入 16px | 令牌正文 15px，Safari 聚焦会自动放大 | 生产输入控件改 16px，补 `--m-fs-input` |
| 3 | 骨架扫光在 reduced-motion 下 | Screen Kit 的 `.sk` 动画未受 `prefers-reduced-motion` 控制 | 生产实现加停用规则（或复用 `--duration-loop-pulse`） |
| 4 | Toast 时长与并发 | 预览无自动消失逻辑 | 2–3s、最多 1 条、新替旧；错误不替代页面错误态 |
| 5 | 左滑/长按/下拉刷新是否引入 | 预览 0 处手势实现；Vant 可提供 | 一期只做「左滑 + 长按多选」；下拉刷新按 04 评估；都必须有按钮替代 |
| 6 | Diff 正文字号 | 预览 12px，令牌 `--m-fs-code` 12.5px | 收敛到 12.5px，避免 12px 中文/等宽混排拥挤 |
| 7 | 二维码真实生成与有效期 | 预览为确定性伪随机图案；接力为新增能力 | 实施用 QRCode 库 + 一次性签名链接（10 分钟），待后端支持 |
| 8 | 时间线组件（已提交详情） | 预览无独立 timeline class，SCREENS 要求「评分进度时间线」 | 用 `.rowitem` + 左侧竖线组合，或补 `.timeline` 组件（不擅自加） |
| 9 | 字号设置（我的） | 学生/教师「我的」有字号设置项，预览未给控件 | 三档（标准/较大/特大）作为可选期需求，见 README 待确认 |
| 10 | 空态插图 | 仓库无插画资源，Screen Kit 用圆形图标 | 继续用图标 + 文案，不引入外部图片 |
| 11 | 新增组件缺口 | `SwipeCell`、`PullRefresh`、`Timeline` 在预览中无独立组件 | 由 `07-implementation-plan.md` 决定用 Vant 现成组件还是自研 |

