# 交互 · 响应式 · 无障碍规范

> 分支 `feat/ui-redesign`（worktree `Exam-DeepSeek-ui`）· 对应 skill `afrexai-ui-design-system` Phase 5 / 6 / 7
> 上游：[00-design-brief.md](./00-design-brief.md) · [02-design-tokens.css](./02-design-tokens.css) · [02-design-tokens.md](./02-design-tokens.md)
> 本文只定义规范，**不含实现代码**。落地顺序建议：断点骨架 → 四态 → 动效 → 无障碍 → Chrome 69 收口。

## 0. 范围与硬约束

| 项 | 约定 |
|---|---|
| 适用对象 | 26 个视图 + 4 个通用组件（10040 行 `.vue`），三种布局壳 |
| 令牌来源 | `02-design-tokens.css` 是**唯一事实来源**；本文所有时长/缓动/颜色均引用令牌，不新增硬编码值 |
| 响应式事实来源 | **CSS 媒体查询**。JS 只在"行为必须切换"时用 `matchMedia`，禁止用 `window.innerWidth` 推算布局 |
| 兼容基线 | 现代浏览器 + Chrome 69 兜底（§6）。兜底靠**能力检测**，不靠 UA 嗅探 |
| 不做什么 | 不引第二套组件库、不做 PWA 离线、不重写 Monaco/TipTap 内核、不做移动端原生 App |
| 术语 | **Console 壳** = 侧栏 + 顶栏 + 内容（教师/学生/管理端）；**Workbench 壳** = 三栏审核工作台（`ReviewDetail` / `ReviewClass` / `ProjectReviewNew`）；**Reading 壳** = 文档 `/doc` 与登录 `/login` |

## 1. 断点与响应式策略

### 1.1 断点定义

| 代号 | 区间 | 媒体查询（必须用 min/max-width 写法） | 目标场景 | 内容区策略 |
|---|---|---|---|---|
| **XL** | ≥1600 | `(min-width: 1600px)` | 教师办公室大屏、双屏副屏 | 内容最大 1560px 居中（`--layout-content-max`），左右 gutter 24px |
| **L** | 1280–1599 | `(min-width: 1280px)` | 主流笔记本 1440/1536 | 内容撑满（减侧栏与 gutter） |
| **M** | 1024–1279 | `(min-width: 1024px)` | 老笔记本 1366 缩放后、机房宽屏 | 侧栏折叠；开始丢低优先列 |
| **S** | 768–1023 | `(min-width: 768px)` | 平板横屏、窄窗口 | 侧栏抽屉化；表格横向滚动 |
| **XS** | <768 | `(max-width: 767px)` | 手机、机房窄窗口 | 单列；表格改卡片列表 |

**硬规则**

1. 必须用 `(min-width: …)` / `(max-width: …)`；**禁用 MQ Level 4 区间语法** `(width >= 1600px)`（Chrome 104+，Chrome 69 直接失效）。向上叠加 min-width（移动优先），不写重叠区间，避免 1279/1280 边界抖动。
2. CSS 媒体查询是唯一事实来源；`matchMedia` 只用于"抽屉是否可用""是否需要全屏编辑器"这类**行为**切换。禁止在 resize 回调里做布局计算（现存量三端 Layout 的 resize 监听需替换）。
3. 现存量 `breakpoint="lg"`（992px）与 `window.innerWidth < 992`（三端 Layout 各一处）属于**未登记断点**，落地时统一收敛到本表。
4. 断点只控制**布局与信息取舍**，不控制字号。任何断点下正文字号 ≥ `--fs-body-sm`（13px），**禁止用缩放字号换列宽**。
5. 200% 浏览器缩放时，等效断点按 CSS 像素变化，页面**不得出现横向滚动**（表格容器内部横滚除外）。

### 1.2 Console 壳（侧栏 + 顶栏 + 内容）

| 断点 | 侧栏 | 顶栏 | 内容区 | 表格 |
|---|---|---|---|---|
| XL ≥1600 | 展开 232px 常驻（`--layout-sider-w`），可手动折叠到 64px 并记忆 | 56px 常驻，面包屑 + 页面主操作 | max 1560px 居中 | 全列，无横向滚动 |
| L 1280–1599 | 展开 232px 常驻 | 同上 | 撑满 | 全列 |
| M 1024–1279 | **默认折叠为 64px 图标条**（`--layout-sider-w-collapsed`）；点击展开为**浮层 232px**，overlay 不挤压内容 | 56px；折叠态菜单项需 tooltip 显示名称 | 撑满；页面多列栅格 3 列 → 2 列 | 隐藏 P2 列（见 1.5） |
| S 768–1023 | **移除，改抽屉**：左侧滑出 280px + 遮罩 `--bg-overlay`；汉堡按钮在顶栏左 | 56px；省略面包屑（只留当前页名） | 单列或 2 列 | P0 + P1，容器横向滚动 |
| XS <768 | 抽屉同 S；路由跳转后**自动关闭** | 56px；标题截断 | 一律单列 | **卡片列表**（见 1.5） |

补充：抽屉打开时锁定背景滚动，关闭后**焦点返回汉堡按钮**（§5.2）。侧栏折叠状态写入本地存储并跨刷新保持；抽屉开合状态**不**持久化。底部动作条（`--actionbar-h: 64px`）在 S/XS 下固定于视口底部，内容区补足等高内边距，避免遮住最后一行。

### 1.3 Workbench 壳（三栏审核工作台）

现状参考：`ReviewDetail.vue` 的 `.rp-nav`(220px) + `.rp-content`；`ProjectReviewNew.vue` 的 `.sidebar`(260px) + `.editor-area` + `.pr-panel`（`ai-section` + `teacher-section` 460px）。规范统一为三段式：**左栏（题目导航 / 文件树）+ 中栏（题目与代码 / Monaco）+ 右栏（AI 评分与教师评语）**。

| 断点 | 列数 | 左栏 | 中栏 | 右栏（评分面板） |
|---|---|---|---|---|
| XL ≥1600 | 3 | 240px 常驻 | flex，≥ 720px | 400px 常驻 |
| L 1280–1599 | 3 | 220px 常驻 | flex，≥ 600px | 360px 常驻 |
| M 1024–1279 | **2** | 折叠为 48px 图标条，可展开浮层 | flex | **下移为底部面板**，高 240px，可折叠，默认展开 |
| S 768–1023 | 2 | **改抽屉**（顶栏"题目导航"按钮触发） | flex | 底部面板，高 200px |
| XS <768 | **1 + 抽屉** | 抽屉 | 单列：题目 → 代码 → 评语顺序堆叠 | **底部固定动作条** + "查看评分"抽屉 |

**降级判据（硬约束）**：中栏可用宽度 < 480px 时必须降级到下一档。Monaco 在 <480px 下代码可读性不可接受，宁可用底部面板也不并排挤压 —— 这一条优先于"尽量保留三栏"的直觉。

### 1.4 Reading 壳（文档 / 登录）

| 断点 | 登录页 | 文档页 `/doc` |
|---|---|---|
| XL / L / M | 卡片居中 400px，垂直居中 | 左侧目录 240px（sticky）+ 正文 max 720px |
| S 768–1023 | 卡片宽 90%，max 400px | 目录 → **顶部"目录"按钮 + 抽屉**；正文 100%（max 720px 居中） |
| XS <768 | 卡片 100% − 24px padding；软键盘弹起时卡片可滚动不被遮挡 | 单列；代码块横向滚动，**不换行** |

登录页错误提示（账号/密码错误）在卡片内展示，`role="alert"`，不用顶部全局 message。

### 1.5 表格列的优先级与降级

先给列分级，再按断点取舍，避免每个页面各判断一次。

| 优先级 | 内容 | 何时可见 |
|---|---|---|
| **P0** | 行标识（学号/姓名/作业标题）+ 主状态（状态标签）+ 行操作入口 | **所有断点** |
| **P1** | 分数、提交时间、班级 | ≥768 |
| **P2** | 创建时间、内部 ID、AI 模型名、尝试次数 | ≥1280 |

| 断点 | 表格策略 |
|---|---|
| ≥1280 | 全列展示，不横向滚动；行操作列 sticky right |
| 1024–1279 | 隐藏 P2；`table-layout: fixed` + 省略号，被截断内容必须有 `title` 或展开入口 |
| 768–1023 | P0 + P1；容器 `overflow-x: auto`，**首列 sticky left、操作列 sticky right、表头 sticky top**；滚动区域可键盘聚焦（`tabindex="0"` + `role="region"` + `aria-label`） |
| <768 | **卡片列表**：每卡为"标题行（含状态标签）+ 2 列 key-value + 右下主操作"；分页器改"加载更多"（每页 20 → 10） |

**何时必须卡片化**：某表 P0 列 > 4 列，或单元格内含 Monaco / 多行富文本 → <768 必须卡片列表。
**可保留表格的例外**：纯 2–3 列只读小表（如学生成绩）可保留表格，但需保证 320px 下不横向溢出。

## 2. 学生端移动策略（<768）

学生端在机房 Windows 机器与较窄窗口是**真实使用场景**，不是降级容错，必须可用。

### 2.1 三页降级总表

| 页面 | 路由 | 现状 | <768 目标 | 主操作位置 |
|---|---|---|---|---|
| 作业列表 | `/student/assignments` | 表格 | **卡片列表**：作业名 + 状态标签 + 截止时间（相对时间 + 绝对时间并存）+ 分数（已评分时）；整卡可点 | 卡片右下「去作答 / 查看结果」 |
| 提交页 | `/student/assignments/:id` | 题目流 + CodeEditor | 单列题目流；题号导航改顶部下拉或抽屉；客观题不变；编程题走 2.2/2.3 | **底部固定动作条**「提交」 |
| 成绩 | `/student/scores` | 表格 | **卡片列表**：作业名 + 总分（`--score-value-fs` 由 40px 降到 28px）+ 次数/最高分；点击展开明细（抽屉） | 只读，无主操作 |

截止时间必须给**相对时间**（"还有 3 小时"），危险态用 `--status-danger-*`；不得只给 ISO 字符串（现状问题，见 00-design-brief §3.1）。

### 2.2 Monaco 只读查看（看参考代码、看已提交代码、看评语中的代码）

| 项 | 要求 |
|---|---|
| 只读开关 | <768 进入时切 `readOnly: true` + `domReadOnly: true`（后者避免点击弹软键盘遮挡） |
| 高度 | **不用 CSS `min()`**（Chrome 79+）；写 `height: 60vh; max-height: 420px;` 并保留 `min-height: 200px` |
| 换行与字号 | `wordWrap: 'off'` —— 代码语义依赖不换行，**横向滚动是正确行为**；字号保持 `--fs-code`（13px），**不缩小** |
| 行号 | 保留（教师评语会引用行号），可缩短行号栏宽度 |
| 容器 | 外层必须 `overflow: hidden; min-width: 0`，防止 Monaco 撑破 320px 布局 |
| 主要诉求 | 移动端首要是**看**和**复制**：提供「复制代码」按钮（图标 + `aria-label`），编辑是次要 |
| 读屏 | 只读态不进 Tab 序列（`tabindex="-1"`），避免被无操作价值的代码块困住；同时提供「查看代码（文本版）」展开纯文本 `<pre>` 供读屏与复制 |

### 2.3 代码编辑的最小可用方案

**P0（必须做）**

- 保留 Monaco 可编辑，但改为**全屏编辑模式**：点击编辑区进入全屏，顶栏只留「完成 / 取消」。理由：320px 下代码区仅剩约 200px，行内编辑不可用，全屏是唯一可行解。
- `automaticLayout: true`（现状已有）必须保留；软键盘弹起导致可视高度 < 400px 时自动进入全屏编辑。
- 触屏无 hover：关闭依赖 hover 的自动补全触发，改为显式「补全」按钮或仅键盘触发。

**P1（增强）**：编辑工具条（撤销 / 重做 / 缩进 / 括号配对，图标按钮各带 `aria-label`，移动端无快捷键）；语言选择器在全屏模式下仍可切换；草稿保护 —— 每 30s 写 localStorage，提交失败**不丢内容**（§4.5）。

**P2（明确不做）**：不做移动端专属编辑器 / 块编辑 / 跳转重构多文件；不做横屏强制或方向锁定提示；不缩小字号换列宽；不改造 Monaco 内核（沿用 `@monaco-editor/loader`，Chrome 69 由 `legacyLoaderCompat` 走 0.24 降级）。

### 2.4 触控与输入细节

| 项 | 要求 |
|---|---|
| 触控目标 | ≥44×44 CSS px（`--control-h-lg`）；表格行内图标按钮 ≥40px，相邻间距 ≥8px |
| hover-only 交互 | **禁止**。行内操作必须是显式按钮，不能是 hover 才出现的图标 |
| 滚动冲突 | 表格/代码的横向滚动容器不得吞掉页面纵向滚动；容器需有可见滚动提示（右侧渐隐或滚动条） |
| 表单输入 | 学号/手机号用 `inputmode="numeric"`，邮箱用 `type="email"`，避免每次弹全键盘 |
| 抽屉与动作条 | 不得被软键盘遮挡；动作条在软键盘弹起时上移或隐藏 |

## 3. 动效规范

设计原则（00-design-brief §4.5）：**动效服务于"状态变化被看见"，不做装饰。** 全部时长 90–380ms，只动 `transform` / `opacity` 与颜色类属性。

### 3.1 令牌速查（来源：`02-design-tokens.css` 第 98–114 行）

| 令牌 | 值 | 使用边界 |
|---|---|---|
| `--duration-instant` / `--duration-fast` / `--duration-base` / `--duration-slow` / `--duration-page` | 90 / 150 / 220 / 320 / 380ms | 依次用于：按下勾选反馈 / 控件态与同级页面切换 / 面板进出与提示条与层级切换 / 骨架→内容与高亮淡出 / **仅**首次进入与登录跳转等低频场景 |
| `--ease-out` / `--ease-in-out` / `--ease-emphasized` / `--ease-spring` | (0.16,1,0.3,1) / (0.4,0,0.2,1) / (0.2,0,0,1) / (0.34,1.4,0.64,1) | 依次用于：**默认进入/出现** / 位移较大的过渡 / Drawer·Modal 面板本体 / 仅提示类 toast 入场（有一次轻微过冲） |
| `--transition-control` / `--transition-surface` | 预置组合 | 按钮/输入框、卡片/面板直接复用，避免逐处重写 |

### 3.2 动效场景表

| # | 场景 | 时长令牌 | 缓动令牌 | 动的属性 | 边界与备注 |
|---|---|---|---|---|---|
| 1 | 按钮与控件反馈（hover / active / focus） | `--duration-fast`（按下用 `--duration-instant`） | `--ease-out` | color, background-color, border-color, box-shadow | 用 `--transition-control`。**焦点环不做过渡**，必须立即出现（延迟的焦点指示等于没有） |
| 2 | 下拉 / 气泡 / Select 面板 | `--duration-fast` | `--ease-out` | opacity + transform(scale 0.96→1, translateY −4px) | 位移 ≤4px；**不用 height 动画**展开 |
| 3a | Drawer / Modal 打开 | 遮罩 `--duration-base`；面板 `--duration-base` | `--ease-emphasized` | 遮罩 opacity；面板 transform + opacity | 面板不参与布局，不动 width/left |
| 3b | Drawer / Modal 关闭 | `--duration-fast` | `--ease-out` | 同上 | **关闭必须比打开快**（退出更快符合感知） |
| 4a | 页面切换 · 同级（表格↔表格） | `--duration-fast` | `--ease-out` | **仅 opacity** | 高频场景，不做位移，避免密集切换的视觉疲劳 |
| 4b | 页面切换 · 层级推进（列表→详情） | `--duration-base` | `--ease-out` | opacity + transform(translateY 8px) | `mode="out-in"`，总时长 ≤220ms |
| 4c | 页面切换 · 首次进入（登录→首页） | `--duration-page` | `--ease-in-out` | opacity + transform(translateY 12px) | 仅低频场景，**不得用于日常导航** |
| 5a | 列表进入 | `--duration-base` | `--ease-out` | opacity + transform(translateY 4px) | 逐行延迟 20ms，**最多前 10 行**，全部结束 ≤300ms；滚动中不触发；筛选/分页时**不重播** |
| 5b | 骨架 → 内容 | `--duration-slow` | `--ease-out` | opacity 交叉淡入 | 骨架与真实内容**尺寸必须一致**，否则出现跳动（§4.2） |
| 6 | AI 评分完成提示 | toast 入场 `--duration-base`；行级高亮保持 1600ms 后淡出 `--duration-slow` | 入场 `--ease-spring`；淡出 `--ease-out` | toast: transform(translateY −8px)+opacity；行级: background-color | 必须同时有**状态标签文字**与 `aria-live` 播报，不能只靠高亮 |
| 7 | WebSocket「有新数据」提示 | `--duration-base` | `--ease-out` | opacity + transform(translateY −4px) | 提示条**不得改变内容高度**（用浮层或预留槽位）；**不得自动插入行**（§4.3） |
| 8 | 表格排序 / 筛选 / 分页切换 | `--duration-fast` | `--ease-out` | 整表 opacity 交叉淡入 | **不做行位移重排动画**，行位置变化用瞬时替换 |
| 9 | 行 hover / 选中 | `--duration-fast` | `--ease-out` | background-color, box-shadow | 选中态**不能只靠底色**（`--table-row-hover` 仅 1.07:1、`--bg-selected` 仅 1.09:1），必须叠加勾选框 + 左侧 3px 强调条 |

### 3.3 禁止项

| 禁止 | 原因 / 替代 |
|---|---|
| 视差滚动、滚动劫持、自动轮播 | 装饰性且伤害可用性；一律不做 |
| **循环/无限装饰动画**（呼吸灯、漂浮、闪烁图标） | 唯一允许的循环动画是**骨架屏微光**，且周期 ≥1s、幅度低 |
| 动 `width` / `height` / `top` / `left` / `margin` | 触发 layout/reflow，机房旧机明显掉帧；只用 `transform` / `opacity` / `color` / `background-color` / `box-shadow` / `border-color` |
| `transition: all` | 会连带动到布局属性，且新旧浏览器行为差异难排查；必须逐属性列出 |
| 常驻 `will-change` | 仅动画期间添加，结束移除，避免常驻合成层吃显存 |
| 任何交互反馈 >400ms；过渡期间阻塞输入 | 拖慢教师高频操作；动画播放时控件必须已可响应，不得用动画掩盖异步等待 |
| 闪烁 >3 次/秒 | WCAG 2.3.1 硬红线；本规范不使用频闪 |
| 滚动驱动动画（scroll-driven animations） | Chrome 115+，且与"不做视差"冲突 |

### 3.4 `prefers-reduced-motion` 降级

令牌层已实现（`02-design-tokens.css` 第 371–378 行）：`reduce` 时所有 `--duration-*` 置 1ms，并对 `*` 强制 `animation-duration` / `transition-duration` 为 1ms。因此**无需逐处改写业务样式**，只需保证下列行为：

| 场景 | 降级行为 |
|---|---|
| 全部过渡 | 1ms（**是"瞬时"而非"取消"**，避免依赖过渡结束事件的逻辑失效） |
| 页面切换 / 列表进入 | 保留 opacity 0→1，位移量置 0；列表取消逐行延迟，直接显示 |
| 骨架微光 | 停止动画，改为静态 `--skeleton-bg`；骨架→内容切换仍保留 |
| 行级高亮 | 保留**静态底色** + 状态标签文字，取消淡出 |
| WebSocket 提示条 | 保留（瞬时出现），不得因降级而丢信息 |
| 平滑滚动 | `scroll-behavior: smooth` 关闭，改 `behavior: 'auto'` |

**总原则：降级只能去掉"动"，不能去掉"信息"。** 每条动效承载的信息都必须有非动效载体（文字 / 图标 / 形状）。
**兼容说明**：`prefers-reduced-motion` 为 Chrome 74+；Chrome 69 永不匹配 → 走完整动效。因本规范全部动效 ≤380ms、位移 ≤12px 且无视差，可接受。

## 4. 加载与状态反馈

### 4.1 四态定义

| 态 | 触发条件 | 视觉 | 文案 | 无障碍 |
|---|---|---|---|---|
| **loading** | 请求在途且无可用缓存数据 | 首屏骨架；局部用 spinner（预期 ≤2s） | spinner 可无文字，容器需 `aria-busy="true"` | `aria-busy="true"` + `role="status"` |
| **empty** | 请求成功且结果为空 | `--empty-*` 令牌 + 线性 SVG 插画 + 主操作按钮 | **区分两种**：① 无数据 →「还没有班级，先创建一个」；② 筛选无结果 →「没有符合条件的记录」+「清除筛选」 | 插画 `aria-hidden="true"`；文案是真实文本而非图片 |
| **error** | 请求失败 / 权限不足 / 超时 | `--status-danger-*` 提示块 + 图标 | 可读中文原因（**不显示 stack、不显示英文原始错误**）；可选给请求 ID | `role="alert"`；**「重试」必给**，权限问题给「返回」，重试按钮可键盘聚焦 |
| **partial** | 部分资源失败（多接口聚合页、批量操作部分失败、AI 评分部分完成） | 顶部 `--status-warning-*` 条 + 失败项行级标记 | 「N 项中有 M 项加载失败」+「仅重试失败项」 | `role="status"`（非阻断，不用 alert 打断） |

**规则**：① 任何异步对象四态必须齐全 —— **不允许"只有 loading 和成功"**（当前 26 个视图的通病，见 00-design-brief §3.4）；② error 态**不得清空已成功的部分数据**，应降级为 partial（顶部警示条 + 保留旧数据）；③ 权限不足（403）与资源不存在（404）文案必须区分，不能统一"加载失败"。

### 4.2 骨架屏使用矩阵

| 页面 | 首次加载 | 二次加载（切页/筛选/排序） | 局部刷新 |
|---|---|---|---|
| 教师端列表（班级/学生/题库/作业） | 表格骨架：表头 + 8 行，行高 = `--table-row-h` | 表格自带 loading 遮罩（**不闪骨架**） | 行内 spinner |
| 教师端 `Review` / `ReviewClass`（审核列表） | 列表骨架 + 统计卡骨架 | 列表遮罩 | 行级状态点 |
| 教师端 `ReviewDetail` / `ProjectReviewNew`（工作台） | **三栏骨架**（左导航 + 中内容 + 右评分面板） | — | 评分面板局部 spinner |
| 教师端 `QuestionEdit` / `ProjectQuestionEdit` | 表单骨架（label 行 + 输入块） | — | Monaco 区独立占位（**不得整页 loading**） |
| 学生端 作业列表 / 提交页 / 成绩 | 卡片骨架 3–5 张 | 列表遮罩 | — |
| 管理端 六个页面 | 同教师端列表 | 同 | — |
| 登录页 / 文档页 | **不用骨架**（内容静态或极快） | — | — |

**骨架规则**：① 行数 = 默认分页大小与 8 的较小值；② 骨架的列宽、行高、卡片高度必须与真实内容**逐项对齐**，否则骨架→内容会出现跳动（违反 §3.2 场景 5b 的意图）；③ 骨架是"形状"不是"内容"，不得用灰块冒充真实文本长度；④ 微光周期 ≥1s，reduced-motion 下停止（§3.4）。

### 4.3 WebSocket 实时刷新规则

背景：`Review.vue` / `ReviewClass.vue` 通过 socket.io 接收"评分完成"推送。教师正在阅读时，**静默插入或重排行会造成锚点丢失与误点**。

| 规则 | 要求 |
|---|---|
| **禁止静默插入/重排** | 只允许两种模式：**A. 提示条模式（默认）** —— 顶部浮层「有 N 条新数据，点击刷新」，不改变现有 DOM，点击后更新并**保持滚动位置**；**B. 行级高亮模式** —— 仅当更新**不改变行数与行序**时，原地更新该行字段 + 高亮淡出 |
| 选择判据 | 更新会改变行数或行序 → **必须 A**；仅更新已有行的状态字段 → 可用 B |
| 抑制时机 | Monaco 有焦点 / Modal 打开 / 用户正在输入 → **暂缓应用**，仅累积计数，关闭后再提示 |
| 焦点与状态 | 提示条 `aria-live="polite"`；点击刷新后焦点留在原位置或列表首个可聚焦元素，**不跳到页面顶部**；滚动位置、筛选、排序、分页**不得**被重置 |
| 断线 | 静默指数退避重连；连接状态点 `--status-success-fg` → `--status-neutral-fg`；>30s 未恢复显示「实时更新已断开」+「重新连接」 |
| 状态点 | 不能只用颜色，必须有文字或 `aria-label`（如「实时更新：已连接」） |

### 4.4 长任务（AI 评分）进度语义与超时

| 阶段 | 展示 | 令牌 / 元素 | 文案示例 |
|---|---|---|---|
| 待评分 | neutral 标签 | `--status-neutral-*` | 「待评分」 |
| **评分中** | info 标签 + **不确定**进度条 + 已用时 | `--status-info-*`；`role="progressbar"` 且**不设** `aria-valuenow`（不确定态用 `aria-valuetext`） | 「AI 评分中 · 已用 12s」 |
| 已完成 | success 标签 + 分数（`.tnum`） | `--status-success-*` / `--score-*` | 「AI 评分 85 / 100」 |
| 评分失败 | danger 标签 + 原因 + 重试 | `--status-danger-*` | 「评分失败：模型超时」+「重新评分」 |

**规则**：① **不显示伪百分比**；只有后端返回「第 n / 共 m 题」时才显示确定进度，此时给 `aria-valuenow` / `aria-valuemin` / `aria-valuemax`；② 不阻塞教师其他操作，**离开页面不中断评分**（后端 worker 轮询，现状 2s/批、8 并发）；③ 批量评分用顶部汇总进度「已完成 12 / 30」，单条仍各自显示状态；④ 完成时遵循 §3.2 场景 6（行级高亮 + `aria-live` 播报，如「张三的作业已完成 AI 评分，85 分」）。

超时提示（**阈值为建议值，落地前需与 server 侧常量对齐**）：

| 已用时长 | 提示 |
|---|---|
| >30s | 「仍在评分中，可离开此页，完成后会在审核页提示」 |
| >120s | 「耗时较长，请检查评分服务（AI 配置 / Worker）」+ 超管可见「查看监控」入口 |
| >5min 仍无结果 | 按失败处理，给「重新评分」；提交记录保持可重试，**不自动删除** |

### 4.5 乐观更新与回滚

| 操作类型 | 是否乐观 | 说明 |
|---|---|---|
| 行内开关（如"练习模式"）、状态标签切换、表格勾选、评语草稿自动保存、筛选/排序（纯前端） | **允许** | 低风险、可秒回滚 |
| 删除任何实体、发布/撤回作业、**最终定分 / 提交成绩**、账号与权限变更、批量操作（>1 条）、AI 重新评分 | **禁止** | 必须等服务端确认后再改 UI |

**回滚规则**：① 流程为「立即改本地状态 → 在途标记（按钮 loading / 行内 spinner）→ 成功静默 → 失败**回滚旧值** + `message.error`（含可读原因）+ 该行 320ms danger 底色一次性提示」；② 回滚**不得丢失用户输入**（已填写的评语保留在输入框，只回滚提交状态）；③ 同一实体同时只允许一个在途变更，在途期间禁用重复触发，后发请求需取消前一个；④ 乐观更新须在 5s 内确认，否则视为失败回滚并提示「网络较慢，请重试」；⑤ **不做离线队列**（PWA 离线属明确非目标）。

## 5. 无障碍（WCAG 2.1 AA）清单

标注方式：SC 编号 + 可在浏览器中验证的验收点。

### 5.1 键盘可达、Tab 顺序与焦点管理

| 项 | 要求 | SC |
|---|---|---|
| 全交互元素可达 | 侧栏菜单、表格排序、分页、Modal 内按钮、Monaco 外层工具条、抽屉均须可 Tab 到达 | 2.1.1 |
| Tab 顺序 = 视觉顺序 | 侧栏 → 顶栏（用户区）→ 页面标题/主操作 → 内容 → 分页/动作条 | 2.4.3 |
| 无键盘陷阱 | 表格横向滚动容器、Monaco 不得吞掉 Tab（能 Tab 进也能 Tab 出） | 2.1.2 |
| 焦点可见 | `:focus-visible` + `--ring-focus`；Chrome 69 用 `:focus` 回落（§6.2） | 2.4.7 |
| Skip link | 页面首个可聚焦元素是「跳到主内容」，指向 `#main`，首次 Tab 即出现 | 2.4.1 |
| Modal / Drawer 打开 | 焦点移入容器首个可聚焦元素或标题；Tab 循环限制在容器内；Esc 关闭 | 2.4.3 |
| Modal / Drawer 关闭 | 焦点返回**打开它的触发元素**；`destroyOnClose` 场景必须显式记录触发元素（antd 不保证） | 2.4.3 |
| 抽屉导航跳转 / 路由切换 | 跳转后焦点移到新页面主标题（`tabindex="-1"`），不留在已移除的抽屉或已卸载组件 | 2.4.3 |
| 表格排序 / 分页后 | 焦点保持在被点击的控件上，不回到 body | 2.4.3 |
| WebSocket 提示条 | **不主动抢焦点**，仅 `aria-live` 播报 | 3.2.1 |
| Monaco | Esc 后 Tab 可离开编辑器（利用 Monaco 默认行为），并在文档中说明快捷键 | 2.1.2 |

### 5.2 表格语义

| 项 | 要求 | SC |
|---|---|---|
| 表名 | 每张表有 `<caption>`（可视觉隐藏）或 `aria-label`，说明内容与范围 | 1.3.1 |
| 表头 | 真实 `<th scope="col">`；antd 表格需确认渲染出 `th` 而非 `td` | 1.3.1 |
| 排序 | 可排序列头是 `<button>`，带 `aria-sort="ascending\|descending\|none"`；排序方向**同时用图标**表达，不只靠颜色 | 1.3.1 / 4.1.2 |
| 行选择 | 每行 checkbox 有 `aria-label`（含行标识，如「选择 张三 的提交」）；表头全选同样有标签 | 4.1.2 |
| 空表 | 无数据时用 empty 态（§4.1），不渲染空 `<table>` | 1.3.1 |
| 粘性表头 | sticky 表头不得遮挡获得焦点的单元格 → 行加 `scroll-margin-top` ≥ 表头高 | 2.4.11（参考） |
| 长内容 | 单元格截断时必须可通过 `title` 或展开查看全文 | 1.3.1 |

### 5.3 表单：label 与错误关联

| 项 | 要求 | SC |
|---|---|---|
| 标签 | 每个控件有可见 `<label for>`；搜索框等无标签场景用 `aria-label` | 1.3.1 / 3.3.2 |
| 必填 | `aria-required="true"` + 视觉星号 + 图例说明星号含义 | 3.3.2 |
| 错误关联 | 错误文案在字段下方，控件 `aria-describedby` 指向该错误元素 id，且 `aria-invalid="true"` | 3.3.1 |
| 错误可识别 | 错误前有图标 + 文字，**不只用红色边框** | 1.4.1 |
| 帮助文本 | 提示/格式说明也用 `aria-describedby`，与错误**不共用同一 id** | 3.3.2 |
| 提交失败 | 焦点移到第一个错误字段 | 3.3.1 |
| 分组 | 多字段组用 `fieldset` + `legend`（如"修改密码"三连框） | 1.3.1 |

### 5.4 状态提示的 `aria-live`

| 场景 | 角色 / 属性 | 强度 |
|---|---|---|
| `message.success`（保存成功等） | `role="status"` / `aria-live="polite"` | 不打断 |
| `message.error`（操作失败） | `role="alert"` / `aria-live="assertive"` | 打断 |
| WebSocket「有新数据」提示条、AI 评分完成播报 | `aria-live="polite"` | 不打断 |
| 表格加载中 | 容器 `aria-busy="true"` + `role="status"` | 不打断 |
| 长任务进度 | `role="progressbar"`；不确定态不设 `aria-valuenow`，用 `aria-valuetext` 给「已用 12 秒」 | 不打断 |

**规则**：同屏 `aria-live` 区域 ≤2 个；短时间多条必须合并（「3 项已更新」），避免刷屏。antd 的 message/notification 渲染容器是否带 role 需在落地时确认并补齐。

### 5.5 对比度要求（基于令牌色值的实算值）

下表按 WCAG 2.1 相对亮度公式对 `02-design-tokens.css` 中的色值实算（背景 #ffffff，除注明外）。

| 组合 | 令牌 | 实测 | 判定 |
|---|---|---|---|
| 正文 / 次要 / 链接 | `--text-primary` #141922 · `--text-secondary` #545c69 · `--text-link` #0066cc | **17.62 / 6.75 / 5.57:1** | AA ✓ |
| 三级文本 | `--text-tertiary` #78808d | **3.98:1** | **不达 AA 正文** → R-1 |
| 主按钮 | 白字 on `--btn-primary-bg` #0066cc | **5.57:1** | AA ✓ |
| 状态标签（成功 / 警告 / 危险） | #027a48 on #ecfdf3 · #b54708 on #fffaeb · #b42318 on #fef3f2 | **5.13 / 5.20 / 6.05:1** | AA ✓ |
| 状态标签（信息 / 中性 / 强调） | #0055ab on #eff6ff · #545c69 on #eef0f4 · #6938ef on #f4f3ff | **6.68 / 5.91 / 5.60:1** | AA ✓ |
| 深色侧栏文本 / 分组标题 | ≈#b9bcc3（rgba 255,.72）· ≈#7f8288（rgba 255,.48）on #0b0f16 | **10.09 / 4.98:1** | AA ✓ |
| 深色主题 正文 / 次要 / 三级 / 链接 | #e8eaee · #a9b0bb · #8b929e · #8ec5ff on #141922 | **14.63 / 8.07 / 5.62 / 9.72:1** | AA ✓ |
| 分数 优秀 / 及格 | `--score-excellent` #039855 · `--score-pass` #dc6803 | **3.73 / 3.49:1** | 仅大字（40px）✓；小字号须配文字 |
| 分数 良好 / 不及格 | `--score-good` #0066cc · `--score-fail` #d92d20 | **5.57 / 4.83:1** | AA ✓ |
| 禁用文本 | `--text-disabled` #a5acb8 | 2.28:1 | **豁免**（1.4.3 非活动组件例外） |

**待确认项（需在令牌评审时处理，本文不改令牌文件）**

| 编号 | 问题 | 建议 |
|---|---|---|
| **R-1** | `--text-tertiary` #78808d 实测 **3.98:1**，低于 AA 正文 4.5:1；`02-design-tokens.md` 第 58 行记为 4.6:1，与该色值不符 | A（建议）：限定为「≥19px 粗体或 ≥24px 常规」的大字辅助信息（此时 3:1 达标），并在组件规范中禁止用于关键内容；B：需 AA 时改用 `--text-secondary`（6.75:1）；C：调深 `--gray-500`（影响面大，需设计确认） |
| **R-2** | 表单控件边界 `--input-bd: --border-strong` #cfd4dc 对白底仅 **1.49:1**，低于 1.4.11 的 3:1 | 输入框边界改用 `--gray-500` #78808d（**3.98:1**）。注：`--border-subtle`/`--border-default` 作表格分隔线属装饰，不受 1.4.11 约束 |
| **R-3** | 焦点环 `--ring-focus` rgba(31,122,224,.28) 合成后约 **1.44:1**，满足 2.4.7（可见）但偏弱 | 聚焦时同时把边框改为 `--border-focus` #1f7ae0（对白 **4.27:1**），双重指示 |
| **R-4** | `--table-row-hover` 仅 1.07:1、`--bg-selected` 仅 1.09:1，不足以单独表意 | 选中态必须叠加勾选框 + 左侧 3px 强调条（已写入 §3.2 场景 9） |

### 5.6 图标按钮、图片与媒体

| 项 | 要求 |
|---|---|
| 图标按钮 | 必须有 `aria-label`（中文，动词 + 对象，如「刷新列表」「删除该班级」）；**仅图标且无可访问名称 = 缺陷** |
| 装饰图标 | `aria-hidden="true"`（antd 图标默认不带，需逐处确认） |
| 头像 | `a-avatar` 显示姓名首字母时必须 `aria-hidden="true"`（旁边已有姓名文本），否则读屏会读成无意义单字 |
| Logo | `alt` 必须是站点名「Deadpan 判题」；现状 `client/src/views/teacher/Layout.vue:6` 为 `alt="logo"`，需修正（三端 Layout 同） |
| 题目材料图片 | 必须有 `alt`：教师上传时提供「图片描述」输入；缺省用文件名兜底，**不允许空 alt** |
| 文档页 | 不使用图片承载文本（Doc.vue 正文须为真实文本） |
| 颜色不单独表意 | 状态标签同时有文字；分数同时有数字；错误同时有图标；连接状态同时有文字（1.4.1） |

### 5.7 200% 缩放、320px 宽、语言与标题

| 项 | 要求 | SC |
|---|---|---|
| 200% 浏览器缩放（等效 640px 逻辑宽） | 页面无横向滚动；数据表格允许**容器内**横向滚动 | 1.4.4 / 1.4.10 |
| 320px 宽 | 全部功能可用，无横向滚动，文案不截断成无意义片段；Monaco 走 §2.2 / §2.3 | 1.4.10 |
| 文本间距 | 不写死行高导致用户自定义字号时文字被裁切；正文不得设 `user-select: none` | 1.4.12 |
| 语言声明 | `<html lang="zh-CN">` —— 现状 `client/index.html` 已正确 ✓；英文术语/代码片段用 `lang="en"` 包裹 | 3.1.1 |
| 页面标题 | 每页**唯一一个 `<h1>`**。现状多为 `<h2 class="page-title">`（如 `student/Assignments.vue:3`、`student/Scores.vue:3`），落地时改为 `h1`，其余层级不得跳级；路由切换后更新 `document.title` | 1.3.1 / 2.4.2 |
| 地标 | `<header>` / `<nav aria-label="主导航">` / `<main id="main">` / `<aside aria-label="题目导航">`；skip link 指向 `#main` | 1.3.1 |

### 5.8 动效、闪烁与时间

| 项 | 要求 | SC |
|---|---|---|
| 闪烁 | ≤3 次/秒；本项目无频闪元素；骨架微光周期 ≥1s | 2.3.1 |
| 自动播放 | 无自动播放媒体、无 >5s 自动更新轮播 | 2.2.2 |
| 会话超时 | 登录态失效应**提前提示并可延长**；现状路由守卫直接跳 `/login`，落地时建议改为提示后跳转 | 2.2.1（参考） |
| 动效可关 | 走系统 `prefers-reduced-motion`（§3.4）；Chrome 69 不支持但动效均 ≤380ms 且无视差，可接受 | 2.3.3（AAA 参考） |

## 6. Chrome 69 兼容清单

分支 `feat/chrome69-legacy-adaptation` 已建立适配。本章只约束 **UI 层写法**；构建层（`@vitejs/plugin-legacy` 双产物 + `nomodule`）由该分支负责，本文不重复。

### 6.1 能力检测优先于 UA 嗅探

| 项 | 约定 |
|---|---|
| 禁止 | 不使用 `navigator.userAgent` 判定布局或功能降级 |
| 判定入口 | `client/src/domain/browserCompat.js` 的 `isLegacyBrowser()`：`CSS.supports('selector(:where(x))')` 为假 **或** `new Function('a?.b')` 抛错 → legacy |
| 结果落地 | 首帧前在根元素挂 `html.legacy` 类；CSS 侧以 `html.legacy` 为前缀做回落（现状见 `client/src/legacy-patch.css`） |
| 自举约束 | `browserCompat.js` 自身必须保持 **ES5/ES2015 写法**（禁用 `?.` / `??`），否则旧内核解析该文件即失败，检测逻辑根本不会执行 |
| 布局降级 | 优先用 **CSS 自身能力**（`@supports`）而非 JS 分支：能 CSS 表达就不进 JS |
| 分层 | 该文件是 domain 纯检测层，不得引入 IO 或副作用 |

### 6.2 CSS 特性禁用表

| 特性 | Chrome 最低 | 现状命中 | 处置 | 替代方案 |
|---|---|---|---|---|
| **flex `gap`** | 84 | **88 处（全部为 flex；项目 `display: grid` 为 0 处）** | **必须处理** | 首选改用 `display: grid` + `gap`（Grid gap 自 Chrome 66 可用）；否则用子元素 `margin` + 容器负 margin 抵消 |
| **`inset` 简写** | 87 | **4 处**（`RichEditor.vue`、`Doc.vue`、`ProjectReviewNew.vue`、`ProjectQuestionEdit.vue`） | **必须处理**（功能性破坏：绝对定位整体失效，遮罩/空态层错位） | 展开为 `top` / `right` / `bottom` / `left` |
| `:focus-visible` | 86 | 0 处 | **不得作为唯一手段** | 必须同时提供 `:focus` + `--ring-focus` 兜底（令牌已双写，但见 §6.4 风险项） |
| 容器查询 `@container` / `container-type` | 105 | 0 处 | 禁用 | 一律用媒体查询（§1） |
| MQ Level 4 区间语法 `(width >= 1600px)` | 104 | — | 禁用 | `(min-width: …)` / `(max-width: …)` |
| CSS 函数 `min()` / `max()` / `clamp()` | 79 | 0 处 | 禁用 | `max-width` + `height` 组合（如 `height: 60vh; max-height: 420px;`） |
| `:is()` / `:where()` · `aspect-ratio` · `color-mix()` / `oklch()` / `lab()` | 88 / 88 / 111 | 0 处 | 禁用 | 分别替换为：展开完整选择器列表（`,` 分隔）；`padding-top` 百分比占位盒；颜色写具体值（令牌已是具体值，保持现状） |
| `backdrop-filter` | 76 | 顶栏、`Doc.vue` | 保留 + 降级 | 已用 `@supports not` 提供不透明底色兜底，**必须保持** |
| 以下特性 Chrome 69 **可用**，无需处理 | — | — | 可用 | `scroll-behavior: smooth`(61)、`position: sticky`(56)、逻辑属性长写 `margin-inline-*` / `padding-block` / `inset-inline-start`(69)、Grid `gap`(66)、CSS 自定义属性(49)、`@supports`(28)、`will-change`(36)、`transform`/`opacity` 过渡。**注意区分**：逻辑属性**长写**可用，`inset` **简写**不可用，勿混淆 |

### 6.3 JS 侧

| 项 | Chrome 最低 | 现状 | 处置 |
|---|---|---|---|
| 可选链 `?.` / 空值合并 `??` | 80 | `?.` 0 处；**`??` 27 处** | 源码可继续写，但**必须确认 `plugin-legacy` 已开启且经 Babel 转译**，产物中不得残留（见下方验收） |
| 逻辑赋值 `??=` / `\|\|=` | 85 | — | 禁用；展开为 `x = x ?? y` |
| `globalThis` | 71 | 依赖包（vue / socket.io-client / engine.io-client / ant-design-vue） | core-js polyfill 覆盖，无需改代码 |
| `Promise.allSettled` | 76 | 3 处（`student/Submit.vue` ×2、`teacher/ReviewDetail.vue`） | core-js polyfill，**不要求改写** |
| `MediaQueryList.addEventListener` | 84 | 断点 JS 切换会用到 | 用 `addListener` / `removeListener` 兜底；或优先做到不用 JS 切布局 |
| `ResizeObserver` / `IntersectionObserver` | 64 / 51 | Monaco `automaticLayout`；懒加载 | 可用；IntersectionObserver **必须有兜底**（直接显示内容） |
| `Element.scrollTo({ behavior: 'smooth' })` / `window.visualViewport` | 61 | §2.3 全屏编辑判定 | 可用；reduced-motion 下 `behavior` 改 `'auto'`，visualViewport 需 `resize` 事件兜底 |
| `Object.fromEntries` · `String.matchAll` · `Array.prototype.at` · `structuredClone` · `crypto.randomUUID` · `queueMicrotask` | 73 / 73 / 92 / 98 / 92 / 71 | 0 处 | **全部禁用**；替代：`Object.entries` 循环、`RegExp.exec` 循环、`arr[arr.length - 1]`、JSON 深拷贝、自增 id、`Promise.resolve().then()` |
| `Array.prototype.flat` | 69 ✅ | — | 可用 |

**构建后验收**

```bash
# 1) legacy 产物不得残留可选链 / 空值合并（期望 0）
grep -rE '\?\.|\?\?' client/dist/assets/*legacy*.js | wc -l
# 2) 源码不得出现禁用的 CSS 特性（期望 0）
grep -rnE ':is\(|:where\(|aspect-ratio|color-mix|oklch|@container|clamp\(' client/src --include='*.vue' --include='*.css' | wc -l
# 3) inset 简写（期望 0）；4) flex gap 存量（目标 0）
grep -rnE '(^|[^-])inset:' client/src --include='*.vue' | wc -l
grep -rn 'gap:' client/src --include='*.vue' | wc -l
```

### 6.4 已知存量风险（落地时必须处理）

| 风险 | 位置 | 影响 | 处理 |
|---|---|---|---|
| flex `gap` 88 处 | 全站 `.vue` | 间距全部消失（视觉降级，非功能破坏） | 优先逐处改 grid；**至少保证 §1 的断点骨架用 margin / grid** |
| `inset: 0` 4 处 | 见 §6.2 | 遮罩 / 空态层错位（**功能破坏**） | 展开长写 |
| 断点 JS 监听 | `teacher` / `student` / `admin` Layout 的 `window.innerWidth < 992` | 未登记断点 + resize 抖动 | 统一到 §1 断点，改用 matchMedia 或纯 CSS |
| 侧栏宽度不一致 | `:width="160"` + collapsedWidth 80/0 | 与令牌 `--layout-sider-w: 232px` / `--layout-sider-w-collapsed: 64px` 冲突 | 落地时对齐令牌 |
| **`:focus { outline: none }` 无旧浏览器兜底** | `02-design-tokens.css` 第 368–369 行 | Chrome 69 不识别 `:focus-visible` → 该规则整条被丢弃 → **完全没有焦点指示**（2.4.7 失败） | 必须在 `html.legacy` 下补 `:focus { box-shadow: var(--ring-focus); }` |
| 标题层级无 `h1` | 各列表页用 `<h2 class="page-title">` | 标题层级不完整 | 落地时首屏标题改 `h1` |
| `alt="logo"` | 三端 Layout 的 logo 图 | 读屏播报无意义 | 改为 `alt="Deadpan 判题"` |

## 7. 交付前自测清单

> 全部可在浏览器中直接验证；E 组需在旧机房镜像或 Chrome 69 便携版上验证。

**A. 断点与响应式**

- [ ] A1 窗口从 1920 拖到 320，页面**不出现横向滚动条**（表格容器内部横滚除外）
- [ ] A2 1024–1279 下侧栏默认折叠为 64px，点击后以**浮层**展开且不挤压内容
- [ ] A3 768–1023 下侧栏变为抽屉，跳转路由后**自动关闭**，焦点回到汉堡按钮
- [ ] A4 <768 下为单列布局，表格已变卡片列表（或属于允许的 2–3 列只读小表）
- [ ] A5 工作台中栏宽度 <480px 时，评分面板已下移为底部面板（不再并排）
- [ ] A6 文档页 <1024 下目录已收入抽屉，正文可读
- [ ] A7 全站正文字号在任何断点下 ≥13px

**B. 动效**

- [ ] B1 开启系统「减少动态效果」后，页面切换、列表进入、抽屉均**瞬时完成**且内容完整可见
- [ ] B2 上述降级后骨架微光已停止，骨架仍可见（不是空白）
- [ ] B3 任意交互反馈目视不超过 400ms，且抽屉/Modal 关闭明显快于打开
- [ ] B4 全站无循环装饰动画（骨架微光除外），无视差、无滚动劫持

**C. 加载与状态反馈**

- [ ] C1 断网后刷新列表页，出现 error 态且带「重试」按钮，点击后能恢复
- [ ] C2 空数据账号看到 empty 文案与「创建」按钮；筛选无结果时看到「清除筛选」
- [ ] C3 首次进入列表页出现与真实内容**尺寸一致**的骨架，骨架→内容无跳动
- [ ] C4 审核页停留时收到 WebSocket 推送：列表**不自动跳动**，出现「有新数据，点击刷新」或行级高亮
- [ ] C5 点击刷新后滚动位置与筛选条件保持不变；断开服务后 30s 内出现「实时更新已断开」
- [ ] C6 AI 评分中显示「评分中 + 已用时」而非伪百分比；离开页面再回来状态仍正确

**D. 无障碍**

- [ ] D1 只用 Tab / Shift+Tab / Enter / Esc 走完「登录 → 列表 → 打开 Modal → 关闭 → 提交表单」全流程
- [ ] D2 每个获得焦点的控件都有**可见**焦点环（含 Chrome 69）
- [ ] D3 首次按 Tab 出现「跳到主内容」，回车后焦点落到主内容区
- [ ] D4 Modal 关闭后焦点回到打开它的按钮；抽屉关闭后回到汉堡按钮
- [ ] D5 表格排序表头有 `aria-sort` 且方向有图标；排序/分页后焦点不丢
- [ ] D6 表单提交失败时焦点跳到第一个错误字段，且该字段被读出错误文案（`aria-describedby`）
- [ ] D7 保存成功 / WebSocket 新数据 / 评分完成三者均被读屏播报（`aria-live`）
- [ ] D8 浏览器 200% 缩放与 320px 宽下主要页面无横向滚动，学生端三页功能完整可用

**E. Chrome 69 兜底**

- [ ] E1 Chrome 69 打开教师端列表页，**无白屏**、无控制台语法错误
- [ ] E2 Chrome 69 下页面骨架布局正常（间距未整体塌陷），遮罩层 / 空态层位置正确
- [ ] E3 Chrome 69 下键盘 Tab 有可见焦点指示（`:focus` 兜底已生效）
- [ ] E4 现代浏览器下 `html` 元素**没有** `legacy` 类，且样式与未加兼容层前一致

**合计 29 项**（A7 + B4 + C6 + D8 + E4）。落地评审时按此清单出验收记录，逐条标记通过/不通过并附截图或录屏。
