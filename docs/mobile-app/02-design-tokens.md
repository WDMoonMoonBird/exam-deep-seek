# 设计令牌说明与移动端落法（Design Tokens）

> 上游契约：[SCREENS.md](./preview/SCREENS.md) §2.2（视觉与令牌）｜[02-design-tokens.css](./02-design-tokens.css)（移动令牌层，181 行）｜[client/src/styles/tokens.css](../../client/src/styles/tokens.css)（桌面令牌，448 行，唯一事实来源）
> 下游：[03-components.md](./03-components.md)（组件如何消费令牌）、[07-implementation-plan.md](./07-implementation-plan.md)（M0 落地清单）。
> 本文只写规范、映射与验收命令；实现代码在生产阶段落，本阶段不改 client/src。

---

## 1. 两个令牌文件的定位（先分清主从）

| 文件 | 角色 | 作用域 | 维护方 |
|---|---|---|---|
| client/src/styles/tokens.css | **桌面令牌，唯一事实来源**：品牌色、状态三元组、评分色、字号、间距、圆角、阴影、动效、深色主题 | 全局（main.js 在 style.css 之后引入） | 桌面重构线 |
| docs/mobile-app/02-design-tokens.css | **移动令牌层**：安全区、触控尺寸、App 骨架高度、移动字号档、移动表面/浮层色、手势动效、层级 | 设计稿全部 37 屏 + 生产 /m 路由 chunk | 移动设计线（本文件配套） |
| client/src/styles/mobile-tokens.css（M0 新增） | 上者的**生产副本**（逐字一致）。Vite root 为 client/，不能直接 import 仓库 docs/ 目录，故复制而不是软链 | 仅 /m chunk | 移动实现 |
| client/src/styles/mobile-vant-theme.css（M0 新增） | Vant 4 的 --van-* 变量映射 + 少量生产补充令牌；不进设计稿 | 仅 /m chunk | 移动实现 |

**硬规则**

1. 移动端**不重新定义**品牌色、状态色、评分色、深色主题底色 —— 一律通过 var(--brand-*) / var(--status-*) / var(--score-*) / var(--bg-*) 继承桌面令牌。移动层只做「桌面没有的维度」与「语义别名」。
2. 移动层只新增两类东西：
   - **移动维度**：安全区、触控尺寸、Tab/ActionBar 高度与页面底部让位、移动字号档、移动表面色（半透明 AppBar/TabBar、Sheet、scrim）、手势动效（sheet/ease-sheet）。
   - **语义别名**：--m-text / --m-brand / --m-border 等，保证 /m 业务样式只面对一层语义。
3. /m 业务样式（views/m、components/m）禁止写死 hex 色值、圆角、阴影、时长；白名单只有三处：代码高亮 token（tk-*）、二维码白底（.qr）、令牌文件自身。
4. 桌面端唯一事实来源是 tokens.css：改品牌色/状态色只改它；移动层不得出现第二份 #0066cc 之类的品牌字面量。

---

## 2. 三层结构在移动端的落法

| 层 | 桌面来源 | 移动层新增 | 允许谁使用 | 例子 |
|---|---|---|---|---|
| 1 Primitive 原始值 | --gray-* --brand-* --green-* --amber-* --red-* --violet-* --space-* --radius-* --shadow-* --duration-* --ease-* | --m-fs-* / --m-lh-* / --m-touch-* / --m-gutter / --m-radius-* / --m-duration-* / --m-ease-* | **仅令牌文件内部** | --m-touch-min: 44px |
| 2 Semantic 语义 | --bg-* --text-* --border-* --status-* --score-* --code-* | 别名：--m-text-strong/--m-text/--m-text-muted/--m-text-subtle、--m-brand/-strong/-tint、--m-border/-strong、--m-bg-gutter/-elevated/-sunken/-tint-brand、--m-on-brand；表面：--m-appbar-bg/-solid、--m-tabbar-bg/-solid、--m-sheet-bg、--m-actionbar-bg、--m-scrim、--m-pressed、--m-hairline-color、--m-shadow-* | 所有移动业务样式 | color: var(--m-text) |
| 3 Component 组件/结构 | --btn-* --input-* --card-* --tag-* --actionbar-h --empty-* --skeleton-* | --m-appbar-h、--m-tabbar-h、--m-actionbar-h、--m-tabbar-total、--m-page-bottom-tabbar、--m-page-bottom-actionbar、--m-control-h、--m-btn-h、--m-btn-h-sm、--m-icon-btn、--m-row-h、--m-grabber-w、--m-hairline、--m-z-* | 移动组件、Vant 映射 | height: var(--m-appbar-h) |

**为什么 --m-* 同时包含语义色与结构令牌**：命名空间按「桌面有没有」划分，不按三层强行切。判断标准只有一句：桌面同名令牌能否直接复用？能（颜色/字号刻度）→ 别名；不能（安全区/骨架高度/触控）→ 新增。

**组件层令牌必须成组维护**：改 --m-appbar-h 必须同步 --m-page-bottom-* 的消费方（滚动区 padding-bottom）；只改高度不改让位 = 内容被 Tab/ActionBar 遮住（37 屏自检的第 1 类高频问题）。同理 --m-tabbar-h 与 --m-tabbar-total、--m-actionbar-h 与 --m-actionbar-total。

### 2.1 桌面令牌 ↔ 移动层对照（节选）

| 桌面令牌 | 移动层 | 移动端用途 |
|---|---|---|
| --bg-canvas | --m-bg-gutter / body.screen 背景 | 页面底色 |
| --bg-surface | --m-bg-elevated、--m-tabbar-solid、--m-sheet-bg、--m-actionbar-bg | 卡片/浮层/固定条 |
| --bg-surface-2 | --m-bg-elevated 的次级场景（ai-note、card--tint 直接用 --bg-surface-2） | 次级面板 |
| --bg-sunken | --m-bg-sunken | 内嵌区、搜索框、骨架、图例 |
| --bg-selected / --brand-50 | --m-bg-tint-brand | 选中态、快捷入口图标底 |
| --text-strong/primary/secondary/tertiary | --m-text-strong / --m-text / --m-text-muted / --m-text-subtle | 四级文本 |
| --border-subtle/default/strong | --m-hairline-color / --m-border / --m-border-strong | 三级描边 |
| --brand-600/700 | --m-brand / --m-brand-strong | 主色/按下色 |
| --text-on-brand | --m-on-brand | 品牌底上的文字（深色主题为 #06121f） |
| --duration-*/--ease-* | --m-duration-press/fast/base/sheet/page、--m-ease-out/sheet/spring | 移动手势动效（新增 sheet 专用缓动） |
| --z-* | --m-z-appbar/tabbar/actionbar/sheet-mask/sheet/toast/toast-above-sheet | 移动固定层叠顺序（与桌面 z 刻度独立，避免相互污染） |
| （无） | --m-safe-top/bottom、--m-statusbar-h、--m-touch-min/comfort、--m-appbar-h、--m-tabbar-h、--m-actionbar-h、--m-page-bottom-* | 桌面不存在的移动骨架维度 |

**注意**：--m-fs-body = 15px 与桌面 --fs-body = 14px 不同。移动正文有独立字号档，**不是**桌面 14px 的缩放；落地时不允许用桌面 --fs-body 兜底移动正文（中文 14px 在手机上偏小，SCREENS.md 已定 15px 底线）。

### 2.2 移动字体档速查（来自 02-design-tokens.css）

| 令牌 | 值 | 用途 | 落地注意 |
|---|---|---|---|
| --m-fs-display / --m-lh-display | 28 / 1.25 | 首页问候、成绩总分 | 小屏（≤374）降为 26px |
| --m-fs-title-1 / --m-lh-title-1 | 22 / 1.3 | 页面大标题 | 与 h1 对应 |
| --m-fs-title-2 / --m-lh-title-2 | 18 / 1.4 | 区块标题、导航栏标题 | AppBar 标题设计稿为 17px，见 §4.4 常量白名单 |
| --m-fs-title-3 / --m-lh-title-3 | 16 / 1.45 | 卡片标题 | 列表主文本用 15px 而非 16px |
| --m-fs-body / --m-lh-body | 15 / 1.6 | 正文、列表主文本、输入框 | 移动端正文字号底线 |
| --m-fs-body-sm / --m-lh-body-sm | 13 / 1.55 | 辅助说明、元信息 | 不得用于关键结论 |
| --m-fs-caption / --m-lh-caption | 12 / 1.5 | 时间、计数、标签 | 状态标签文字下限 |
| --m-fs-micro | 10.5 | Tab 文字、角标 | 系统字号放大时重点检查截断 |
| --m-fs-code / --m-lh-code | 12.5 / 1.75 | 只读代码面板 | 不允许缩小换列宽 |

---

## 3. 引入顺序与作用域

### 3.1 设计稿（预览）

SCREENS.md §2.1 已固定三条 link 的顺序，**不得调换**：

~~~html
<link rel="stylesheet" href="../../../../client/src/styles/tokens.css">
<link rel="stylesheet" href="../../02-design-tokens.css">
<link rel="stylesheet" href="../assets/screen.css">
~~~

原因：02-design-tokens.css 的语义别名大量 var(--bg-*) / var(--brand-*) 引用桌面令牌；顺序反了会得到空值（var 回退为空 → 颜色失效），在深色主题下尤其明显。

### 3.2 生产（采纳方案：只在 /m chunk 引入）

~~~js
// main.js —— 基本不动（保持桌面令牌全局且先执行）
import './style.css';
import './styles/tokens.css';      // 桌面令牌先
// ...桌面应用照旧

// client/src/views/m/Layout.vue —— 移动壳，仅进入 /m 时加载
<script setup>
import '../../styles/mobile-tokens.css';      // 移动令牌层（设计源的生产副本）
import '../../styles/mobile-vant-theme.css';  // Vant 4 映射（紧随其后，保证覆盖顺序）
~~~

选择理由：

| 方案 | 结论 | 理由 |
|---|---|---|
| **/m Layout 内 import（采纳）** | ✅ | 桌面用户不下载移动令牌与 Vant 映射；顺序天然正确（tokens.css 已在入口先执行，chunk CSS 后注入）；删两行 import 即回滚 |
| main.js 全局 import | ❌ | 桌面也加载；移动层与桌面样式在同一加载顺序里耦合，后续难拆 |
| 直接从 docs 路径 import | ❌ | Vite root 是 client/，dev 触发 fs.allow 拦截；构建路径也不稳定 |
| 内联进 Layout 的 style 块 | ❌ | 5KB+ 变量进 SFC，来源分裂，无法与设计源做 cmp 校验 |

### 3.3 同步与校验

- client/src/styles/mobile-tokens.css 是 docs/mobile-app/02-design-tokens.css 的**逐字副本**；
- 改动顺序：先改设计源 → 复制到生产 → 跑 §5 的 --tokens 校验；
- 校验不通过 = 阻断合并（本地门禁 / CI）。
- 生产专属补充（Vant 映射常量、AppBar 标题字号等）一律写在 mobile-vant-theme.css 的「生产补充段」，**不要**改设计源文件，否则同步永远失败。

### 3.4 桌面端会不会被影响

1. 02-design-tokens.css 没有一条选择器命中桌面元素：:root 只新增 --m-*；html[data-platform="android"] 只在 /m 设置；[data-theme="dark"] 只覆盖 --m-*。
2. Vant 组件只允许出现在 /m；mobile-vant-theme.css 作用在 :root（原因见 §4.3），但没有 Vant 组件的桌面页面读不到 --van-*，无渲染影响。
3. 唯一真实风险：进过 /m 再回桌面（SPA 内）时，Vant base.css 的全局 reset 仍在内存里（详见 §4.3 的 a:focus 问题）。对策：**布局切换一律整页跳转**（见 07 §2.3），不在一个 SPA 生命周期里复用两套壳。

---

## 4. 安全区 / 触控 / 动效 / 深色表面

### 4.1 安全区

| 令牌 | iOS 基准 | Android（WebView/壳） | 用法 |
|---|---|---|---|
| --m-safe-top | 44px（真机由 env 覆盖为 max(44px, env(safe-area-inset-top))） | 24px（壳内以状态栏实际高度注入，见 06 §5.5） | body 顶部内边距、AppBar 之上 |
| --m-safe-bottom | 34px（真机 max(20px, env(...))） | 16px | TabBar/ActionBar 底部内边距、Sheet 底部 |
| --m-statusbar-h | 等于 --m-safe-top | 同 | 仅设计稿状态栏；生产用系统状态栏 |

规则：

1. 页面高度写两次降级：min-height: 100vh; 再写 min-height: 100dvh;（Android 老 WebView 不识别 dvh，保留 vh 兜底）。
2. 固定元素 bottom 用 calc(var(--m-safe-bottom) + N)；滚动容器底部让位用 --m-page-bottom-tabbar / --m-page-bottom-actionbar，不要写死 56/64。
3. env() 只出现在 02-design-tokens.css；业务样式不再写 env()。壳内状态栏高度由插件注入到 --m-safe-top（真机验收项，06 §5.5）。
4. 横屏左右刘海：只在 /m 壳层统一加一次 padding-left/right: env(safe-area-inset-left/right)（@supports 内），不在每屏重复。
5. 不支持 env() 的内核：--m-safe-top/bottom 用基准值，页面仍可用（iOS WebView 6.2+ / Chrome 69+ 均支持 env，属兜底）。

### 4.2 触控与间距

| 令牌 | 值 | 用途 | 强制规则 |
|---|---|---|---|
| --m-touch-min | 44 | 所有可点元素的最小热区 | 行内 32–38px 小按钮必须用透明伪元素把热区扩到 44×44（视觉尺寸不变） |
| --m-touch-comfort | 48 | 次级按钮、图标按钮默认 | 图标按钮 44–48 均可，但热区不得小于 44 |
| --m-btn-h | 50 | 底部主按钮 | 拇指热区中心；与 ActionBar 底部安全区叠加 |
| --m-btn-h-sm | 38 | 卡内次级按钮 | 只能用于非主要动作，且左右间距 ≥8 |
| --m-control-h | 48 | 输入框、选择器 | 表单页所有控件 |
| --m-row-h | 56 | 列表行最小高 | 两行行高 64，不压缩到 48 |
| --m-gutter | 16（≤374px 为 14） | 页面左右留白 | 不使用 margin 0 auto + max-width 模拟桌面 |
| --m-icon-btn | 44 | 图标按钮热区 | aria-label 必填（SCREENS.md §2.4） |
| --m-grabber-w | 36 | Sheet 拖拽把手宽 | 把手区域高度 ≥32（可拖） |

布局间距规则：移动端统一用 CSS Grid 的 gap（Chrome 66+ 可用）或子元素 margin；**禁用 flex gap**（Chromium <84 不支持，与桌面 Chrome 69 兼容清单一致）。相邻可点元素间距 ≥8px；卡片之间用 --m-stack(12px)，区块之间用 --m-section-gap(24px)。

### 4.3 Vant 4 主题变量映射

**版本事实**（2026-10-17 查询 npm registry 与包内容）：vant 4.10.2；组件样式入口 es/<comp>/style/index.mjs 会引入 es/style/base.css（其中包含全局 --van-* 变量表 + 全局 reset）；各组件的局部变量定义在 es/<comp>/index.css（如 --van-button-default-height）；旧版的 es/style/var.css 在 4.10 已拆为 base.css 与 css-variables.css。

**三条落地约束**

1. **映射必须落在 :root（浅色）/ [data-theme="dark"]（深色）**，不能只写在 .m-app：Vant 的 Popup / Toast / Dialog / ActionSheet 默认 teleport 到 body，挂在 .m-app 上的变量继承不到，会出现「页面内是深色、弹层是浅色」。
2. **不启用 Vant 自带暗色类**（.van-theme-dark）：我们的主题由 html[data-theme] 驱动；两套暗色同时存在会互相覆盖，排查成本高。深色只通过本文件的 [data-theme="dark"] 映射表实现。
3. **不直接改 Vant 组件类选择器**（.van-cell 等）：一律用变量；确需改结构/间距时，在 /m 的业务包裹层写作用域样式并加注释说明原因（白名单见 07 §4）。

#### 4.3.1 全局与颜色（浅色 :root）

| Vant 变量 | 映射 | 说明 |
|---|---|---|
| --van-primary-color | var(--m-brand) | 主色（深色自动 brand-300） |
| --van-success-color | var(--green-600) | |
| --van-warning-color | var(--amber-600) | |
| --van-danger-color | var(--red-600) | |
| --van-text-color | var(--text-primary) | |
| --van-text-color-2 | var(--text-secondary) | |
| --van-text-color-3 | var(--text-tertiary) | **深色必须重映射**，Vant 默认暗色 2/3 档在近黑底上不足 4.5:1 |
| --van-active-color | var(--bg-hover) | 按下态 |
| --van-active-opacity / --van-disabled-opacity | 保留默认 0.6 / 0.5 | 禁用文字另用 --text-disabled |
| --van-background | var(--bg-canvas) | 页面底 |
| --van-background-2 | var(--bg-surface) | 卡片/弹层底 |
| --van-background-3 | var(--bg-surface-2) | 次级面板 |
| --van-border-color | var(--border-default) | |
| --van-border-width | 1px | 移动端不做 0.5px 发丝线（Android 渲染不稳） |
| --van-radius-sm/md/lg/max | 8px / 12px / 16px / 999px | 与 --m-radius-* 的对应：sm≈chip 内小圆角、md=--m-radius-card-sm、lg=--m-radius-card、max=--m-radius-chip |
| --van-base-font | var(--font-sans) | 覆盖 Vant 默认字体栈 |
| --van-font-size-xs/sm/md/lg | 12px / 13px / 15px / 16px | 对齐 --m-fs-caption/body-sm/body/title-3 |
| --van-line-height-md | var(--m-lh-body) | 中文 1.6 |
| --van-duration-fast / --van-duration-base | var(--m-duration-fast) / var(--m-duration-base) | 统一动效刻度 |
| --van-ease-out / --van-ease-in | var(--m-ease-out) / ease-in | |

#### 4.3.2 导航与骨架

| Vant 变量 | 映射 | 说明 |
|---|---|---|
| --van-nav-bar-height | var(--m-appbar-h) | 52 / 56（Android） |
| --van-nav-bar-background | var(--m-appbar-solid) | 移动端 AppBar 用实色（设计稿的毛玻璃只在设计预览用，生产避免 blur 性能与合成对比度问题） |
| --van-nav-bar-title-text-color | var(--text-strong) | |
| --van-nav-bar-icon-color | var(--text-primary) | |
| --van-nav-bar-title-font-size | var(--m-fs-appbar) | 生产补充令牌 17px（见 §4.4） |
| --van-tabbar-height | var(--m-tabbar-h) | 开启 Vant 的 safe-area-inset-bottom 后总高 = content + safe |
| --van-tabbar-background | var(--m-tabbar-solid) | 实色，不用半透明 |
| --van-tabs-bottom-bar-color | var(--m-brand) | 下划线 Tab |
| --van-tab-text-color / --van-tab-active-text-color | var(--text-secondary) / var(--text-primary) | |
| --van-tab-font-size | var(--m-fs-body) | |
| --van-tab-line-height | 46px | 设计稿 .tabs button 高（常量，来源见 §4.4） |
| --van-search-background | transparent | 设计稿 searchbar 是页面内嵌块 |
| --van-search-content-background | var(--bg-sunken) | |
| --van-search-input-height | 40px | 设计稿 searchbar 高（常量） |
| --van-search-action-text-color | var(--text-link) | |
| --van-skeleton-paragraph-background | var(--skeleton-bg) | |
| --van-skeleton-paragraph-height | 13px | 与设计稿 sk-line 一致 |
| --van-skeleton-duration | 1.35s | 与设计稿 msheen 一致；reduced-motion 下用 var 归零机制见 04 §2.4 |

#### 4.3.3 表单与选择

| Vant 变量 | 映射 | 说明 |
|---|---|---|
| --van-cell-font-size | var(--m-fs-body) | 列表行 15px |
| --van-cell-line-height | var(--m-lh-body) | |
| --van-cell-vertical-padding | 12px | 设计稿 rowitem 上下 11–12 |
| --van-cell-horizontal-padding | var(--m-card-pad) | 16 |
| --van-cell-background | var(--bg-surface) | |
| --van-cell-border-color | var(--border-subtle) | |
| --van-cell-text-color / --van-cell-value-color | var(--text-primary) | |
| --van-cell-label-color | var(--text-secondary) | |
| --van-field-label-color | var(--text-secondary) | |
| --van-field-input-text-color | var(--text-primary) | |
| --van-field-placeholder-text-color | var(--text-tertiary) | 仅当输入框底为白/卡面；底为 sunken 时改用 --text-secondary（对比度 4.24 不达标，见 04 §7） |
| --van-field-error-message-color | var(--status-danger-fg) | |
| --van-field-error-message-font-size | var(--m-fs-caption) | |
| --van-field-text-area-min-height | 110px | 设计稿 textarea 最小高（常量） |
| --van-switch-on-background | var(--green-600) | 设计稿「开启 = 成功绿」，不是品牌蓝 |
| --van-switch-background | var(--gray-300) | |
| --van-switch-height / --van-switch-width | 31px / 51px | 设计稿 switch 尺寸（常量） |
| --van-checkbox-size | 22px | |
| --van-checkbox-checked-icon-color | var(--m-brand) | |
| --van-checkbox-border-color | var(--gray-450) | 非文本对比度 ≥3:1（--border-strong 只有 1.49，禁用） |
| --van-radio-size | 22px | |
| --van-radio-checked-icon-color | var(--m-brand) | |
| --van-radio-border-color | var(--gray-450) | 同上 |

#### 4.3.4 反馈与浮层

| Vant 变量 | 映射 | 说明 |
|---|---|---|
| --van-popup-background | var(--m-sheet-bg) | |
| --van-popup-round-radius | var(--m-radius-sheet) | 24px |
| --van-overlay-background | var(--m-scrim) | 浅色 rgba(11,15,22,.45) / 深色 rgba(0,0,0,.62) |
| --van-toast-background | var(--gray-950) | 与设计稿 .toast 一致 |
| --van-toast-radius | 12px | 常量 |
| --van-toast-font-size | 14px | |
| --van-toast-max-width | 82% | |
| --van-dialog-radius | var(--m-radius-card) | 16 |
| --van-dialog-background | var(--bg-surface) | |
| --van-dialog-confirm-button-text-color | var(--m-brand) | 按钮顺序「取消在左、确认在右」用 Vant 默认 |
| --van-action-sheet-item-height | 56px | 设计稿 .action-row 最小高 |
| --van-action-sheet-item-font-size | var(--m-fs-title-3) | 16 |
| --van-action-sheet-max-height | 90% | 与 .sheet max-height 一致 |
| --van-pull-refresh-head-height | 50px | 下拉刷新指示区 |
| --van-pull-refresh-head-text-color | var(--text-tertiary) | |
| --van-list-text-color | var(--text-tertiary) | 加载更多文案 |
| --van-loading-spinner-color | var(--m-brand) | |
| --van-empty-description-color | var(--text-tertiary) | 空态描述（卡面上 4.83:1 达标） |
| --van-empty-padding | 44px 24px | 与设计稿 .empty 一致 |
| --van-tag-radius | 6px | 默认给 6，非 Vant 胶囊（.tag 是 6px 圆角） |
| --van-badge-background | var(--red-600) | 角标 |
| --van-badge-font-size | 10.5px | |

#### 4.3.5 深色主题

在 [data-theme="dark"] 下必须**显式重声明**下列映射（不能依赖 Vant 的 .van-theme-dark）：

| Vant 变量 | 深色映射 |
|---|---|
| --van-background | var(--bg-canvas) |
| --van-background-2 | var(--m-bg-elevated)（= --gray-900） |
| --van-background-3 | var(--bg-surface-2) |
| --van-text-color | var(--text-primary) |
| --van-text-color-2 | var(--text-secondary) |
| --van-text-color-3 | var(--text-tertiary) |
| --van-border-color | var(--m-border)（rgba(255,255,255,.12)） |
| --van-active-color | var(--bg-hover)（rgba(255,255,255,.06)） |
| --van-popup-background / --van-dialog-background / --van-nav-bar-background / --van-tabbar-background | var(--gray-900) |
| --van-overlay-background | var(--m-scrim)（rgba(0,0,0,.62)） |
| --van-field-placeholder-text-color | var(--text-tertiary)（深色 5.62:1 达标） |

#### 4.3.6 生产补充令牌与常量白名单（写在 mobile-vant-theme.css 顶部）

| 名称 | 值 | 来源 | 为什么不能直接用设计令牌 |
|---|---|---|---|
| --m-fs-appbar | 17px | 设计稿 .appbar-title 17px | 设计源未定义该档，且 18px 会改变 AppBar 视觉；放生产补充段避免改设计源破坏同步 |
| --m-fs-tabbar | 10.5px（= --m-fs-micro） | SCREENS/设计稿 | 直接映射 --m-fs-micro 即可，无需新常量（列出以防误用 12px） |
| 46px / 51px / 31px / 40px / 110px / 12px | Tabs 行高 / Switch 宽高 / 搜索框高 / 文本域最小高 / Toast 圆角 | screen.css 对应组件 | 设计源的组件尺寸是字面量，未升格为令牌；生产映射文件集中登记，业务样式禁止再写字面量 |

**校验命令**（M0 固化进 verify-mobile.mjs）：

~~~bash
# 映射表缺项检查：Vant 变量清单 vs 我们的映射覆盖
grep -oE '(^|;)?--van-[a-z0-9-]+' client/node_modules/vant/es/style/css-variables.css | sort -u > /tmp/van-vars.txt
grep -oE -- '--van-[a-z0-9-]+' client/src/styles/mobile-vant-theme.css | sort -u > /tmp/van-mapped.txt
comm -23 /tmp/van-vars.txt /tmp/van-mapped.txt
# 期望：只输出「刻意不映射」清单中的项（如 --van-black/--van-white/--van-gray-* primitive）
~~~

### 4.4 深色主题的移动表面

| 令牌 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| --m-appbar-bg | rgba(246,247,249,.86) | rgba(11,15,22,.82) | 设计稿毛玻璃；生产建议用 --m-appbar-solid（实色） |
| --m-appbar-solid | var(--bg-canvas) | var(--bg-canvas) | 生产 AppBar 实色底 |
| --m-tabbar-bg | rgba(255,255,255,.92) | rgba(20,25,34,.92) | 设计稿毛玻璃 |
| --m-tabbar-solid | var(--bg-surface) | var(--gray-900) | 生产 TabBar 实色底 |
| --m-sheet-bg | var(--bg-surface) | var(--gray-900) | 底部 Sheet |
| --m-actionbar-bg | var(--bg-surface) | var(--gray-900) | 底部动作条 |
| --m-scrim | rgba(11,15,22,.45) | rgba(0,0,0,.62) | 遮罩 |
| --m-pressed | rgba(11,15,22,.06) | rgba(255,255,255,.08) | 按下态 |
| --m-hairline-color | var(--border-subtle) | rgba(255,255,255,.10) | 列表分隔线 |
| --m-bg-sunken | var(--bg-sunken=#eef0f4) | #0f131a | 内嵌区（令牌文件内的字面量属例外层） |
| --m-shadow-* | 低透明冷黑 | 更高不透明度纯黑 | 移动端优先描边分层，阴影只给浮层 |

规则：

1. 深色下禁止出现「亮色孤岛」：代码面板（--code-bg）与二维码白底（.qr）是仅有的两个刻意固定深/白的面，必须保持并加说明文字。
2. 半透明表面（若生产启用毛玻璃）必须实测文字与合成后底色的对比度（≥4.5:1）；不满足时立即切 --m-appbar-solid / --m-tabbar-solid。生产默认实色，毛玻璃只在设计稿保留。
3. 深色主题切换走 useTheme（localStorage 键 ui-theme，system/light/dark），与桌面完全一致；/m Profile 的「深色主题 switch」只写 ui-theme，不另建存储键。

---

## 5. 验收命令（落地阶段每次合并前跑）

~~~bash
# 1) 令牌同步：设计源与生产副本逐字一致（期望输出 TOKENS_SYNC_OK）
cmp -s docs/mobile-app/02-design-tokens.css client/src/styles/mobile-tokens.css && echo TOKENS_SYNC_OK

# 2) 移动端业务样式禁止硬编码色值（期望 0 行；白名单仅 tk-* 代码高亮与 .qr）
grep -rnE '#[0-9a-fA-F]{3,8}' client/src/views/m client/src/components/m client/src/styles/mobile-vant-theme.css | grep -vE 'tk-|qr|生产补充' ; true

# 3) 业务样式不得直接引用 primitive（期望 0 行；令牌文件与映射文件除外）
grep -rnE 'var\(--(gray|brand|red|green|amber|violet)-[0-9]' client/src/views/m client/src/components/m ; true

# 4) 触控目标审计（M0 交付 verify-mobile.mjs；遍历可点元素断言 >=44x44 与间距 >=8）
node client/scripts/verify-mobile.mjs --touch --base http://127.0.0.1:5173/exam/

# 5) chunk 隔离：Vant 不得进入口 chunk；移动令牌 CSS 不得进桌面 chunk
npm --prefix client run build
grep -l 'van-' client/dist/assets/index-*.js | head          # 期望无输出
grep -l -- '--m-appbar-h' client/dist/assets/index-*.css | head  # 期望无输出
grep -l -- '--m-appbar-h' client/dist/assets/*.css | head        # 期望命中 /m 的异步 CSS chunk

# 6) 深色/Android/360 档截图（shot.mjs 的参数必须用等号形式）
python3 -m http.server 8123 --bind 127.0.0.1
node docs/mobile-app/preview/tools/shot.mjs teacher-home docs/mobile-app/preview/shots/teacher-home-dark-360.png --theme=dark --width=360 --height=800
node docs/mobile-app/preview/tools/shot.mjs student-home docs/mobile-app/preview/shots/student-home-android.png --platform=android

# 7) 对比度抽查（Chrome DevTools 取计算样式 + 实算；或 M0 的 axe 子命令）
node client/scripts/verify-mobile.mjs --a11y --base http://127.0.0.1:5173/exam/
~~~

注意：shot.mjs 的用法注释写的是空格形式（--theme dark），但脚本实际用 split('=') 解析，**必须写 --theme=dark / --width=360**；写成空格形式会静默退回默认值（浅色/390）——这是本仓真实坑，写屏 agent 已踩过。

**验收判定**：1–3 必须零输出/OK；4 失败项 ≤0（触控）；5 三条符合期望；6 每屏浅/深/Android 三张截图人工确认；7 WCAG AA 对比度表（04 §7）全项通过或有书面豁免。

---

## 6. 维护规则

1. **新增令牌**：先判断属于「移动维度」还是「桌面已有」。桌面已有 → 在 02-design-tokens.css 加 --m-* 别名；仅移动 → 加新令牌并登记到本文 §2 表格 + 03-components.md 消费关系。未登记的令牌视为死令牌，评审时删除。
2. **修改品牌色/状态色**：只改 client/src/styles/tokens.css（桌面唯一来源），移动层不动；改后在 /m 下截图抽查深色与浅色。
3. **删除令牌**：先 grep 全仓（含设计稿 screen.css 与 docs/mobile-app/preview）确认 0 引用，再删；删除后跑本文 §5。
4. **Vant 升级**：升级后重跑 §4.3 的映射缺项检查；新增组件若引入新 --van-* 引用，必须补齐映射或书面登记「使用 Vant 默认值」。
5. **本文与 02-design-tokens.css 不一致时**：以 CSS 文件为准并当日修文档；CI 门禁会比对令牌同步（见 §5 第 1 条）。


---

## 7. 评审修正记录（移动设计线）

| 日期 | 修正 | 原因 |
|---|---|---|
| 2026-10-17 | 浅色 `--text-tertiary` 由 `#6b7280` 加深为 `#5f6773` | `#6b7280` 在 `brand-50` 选中底上实测 4.44:1，未达 AA；加深后 5.27:1（独立评审 P1-2） |
