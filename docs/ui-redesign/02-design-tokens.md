# 设计令牌说明与落地映射（Design Tokens）

配套文件：[`02-design-tokens.css`](./02-design-tokens.css)（可直接 `import` 的单一事实来源）

---

## 1. 三层结构

| 层 | 前缀 | 谁可以用 | 例子 |
|---|---|---|---|
| Primitive 原始值 | `--gray-*` `--brand-*` `--space-*` `--fs-*` `--duration-*` | **只有令牌文件自己** | `--brand-600: #0066cc` |
| Semantic 语义 | `--bg-*` `--text-*` `--border-*` `--status-*` `--score-*` | 所有业务样式 | `--bg-surface`、`--text-secondary` |
| Component 组件 | `--btn-*` `--input-*` `--table-*` `--card-*` `--tag-*` `--sider-*` … | 组件样式 / antd 覆盖 | `--table-row-hover` |

**硬规则**：`.vue` 文件里不允许出现 `#` 开头的色值、`px` 写死的圆角/阴影/时长。需要新值时先加令牌，再使用。

---

## 2. 与现有样式的关系

现状：`client/src/style.css` 已有 111 行「Apple-Inspired Design System」，但只覆盖颜色（`--blue`/`--canvas`/`--ink`/`--hairline`）、圆角（`--radius-*`）、两个字体族。

落地时的替换策略（**渐进、可回滚**）：

1. 新增 `client/src/styles/tokens.css`（本文件），在 `main.js` 中**先于** antd 样式引入。
2. 在 `style.css` 顶部保留旧变量并建立别名过渡：
   ```css
   :root {
     --blue: var(--brand-600);
     --blue-focus: var(--brand-500);
     --canvas: var(--bg-surface);
     --canvas-parchment: var(--bg-canvas);
     --ink: var(--text-primary);
     --hairline: var(--border-default);
   }
   ```
   逐页替换完成后删除别名。
3. antd 通过 `ConfigProvider :theme` 对齐（见第 5 节），剩下的边角用 `styles/` 下的覆盖层处理。

**字体修复**：现有 `--font-display: 'SF Pro Display'` 在 Windows 上不存在，导致字重/行高失控。新令牌统一为一条 `--font-sans` 栈（`-apple-system → Segoe UI → 苹方 → 微软雅黑`），标题与正文的差异只靠字号/字重表达。

---

## 3. 语义令牌速查

### 背景与文本

| 令牌 | 浅色值 | 用途 |
|---|---|---|
| `--bg-canvas` | `#f6f7f9` | 页面底色 |
| `--bg-surface` | `#ffffff` | 卡片 / 表格 / 面板 |
| `--bg-surface-2` | `#fbfcfd` | 表头、次级面板 |
| `--bg-sunken` | `#eef0f4` | 代码块底、只读内嵌区 |
| `--bg-inverse` | `#0b0f16` | 深色侧栏（沿用现有黑侧栏） |
| `--text-strong` / `--text-primary` / `--text-secondary` / `--text-tertiary` | `#0b0f16` / `#141922` / `#545c69` / `#78808d` | 四级文本层次 |
| `--border-subtle` / `--border-default` / `--border-strong` | `#eef0f4` / `#e2e5ea` / `#cfd4dc` | 三级描边 |

**对比度实测（白底，WCAG 2.1 公式手算）**

| 令牌 | 值 | 对比度 | 判定 |
|---|---|---|---|
| `--text-primary` | `#141922` | **17.6:1** | AAA |
| `--text-secondary` | `#545c69` | **6.7:1** | AAA（正文可用） |
| `--text-tertiary` | `#6b7280`（原 #78808d 只有 3.98:1 → **已修正**） | **4.8:1** | AA |
| `--text-disabled` | `#a5acb8` | 2.3:1 | 禁用态豁免，不可用于正常内容 |
| `--input-bd` | `#8b929e`（新增 `--gray-450`，原 `--border-strong` 只有 1.49:1 → **已修正**） | **3.1:1** | 满足 WCAG 1.4.11 非文本对比度 |
| `--ring-focus` | 3px rgba(31,122,224,.28) | 环本身约 1.4:1 | 见下方 R-3：聚焦时必须同时把边框改为 `--border-focus`（4.27:1） |

### 5.1 令牌缺陷与处置（R-1 ~ R-4）

| 编号 | 问题 | 处置 |
|---|---|---|
| R-1 | `--text-tertiary`(#78808d) 实测 **3.98:1**，未达 AA 正文 4.5:1 | ✅ 已修：`--gray-500` 改为 `#6b7280`（4.8:1） |
| R-2 | `--input-bd`(#cfd4dc) 对白仅 **1.49:1**，不满足 1.4.11 的 3:1 | ✅ 已修：新增 `--gray-450: #8b929e`（3.13:1）作为输入框边界 |
| R-3 | 焦点环单独使用只有约 **1.44:1** 合成对比度 | ⚠️ 规则：聚焦态必须「边框 → `--border-focus` + 环」，两者同时出现 |
| R-4 | 行 hover 1.07:1 / 选中底 1.09:1，不足以单独表意 | ⚠️ 规则：选中态必须叠加勾选框 + 左侧 3px 强调条（详见 `03-components.md` 表格节） |
| — | `:focus{outline:none}` 使 **Chrome 69 完全失去焦点指示**（不识别 `:focus-visible`） | ✅ 已修：令牌文件补 `@supports not selector(:focus-visible)` 与 `html.legacy :focus` 双兜底 |

### 状态与评分

六个状态色板（`neutral / info(brand) / success / warning / danger / accent(violet)`），每个都有 `-fg / -bg / -bd` 三元组，用于标签、徽标、提示条、图表。

评分专用：`--score-excellent`(≥90) / `--score-good`(75–89) / `--score-pass`(60–74) / `--score-fail`(<60) —— 分数永远配 `.tnum`（等宽数字），避免表格跳动。

### 密度

`:root` 默认 comfortable，`[data-density="compact"]` 切换：

| 令牌 | comfortable | compact | 用在哪 |
|---|---|---|---|
| `--control-h` | 36px | 32px | 输入框、按钮、选择器 |
| `--table-row-h` | 52px | 44px | 表格行高 |
| `--page-pad-y/x` | 28/32px | 20/24px | 页面留白 |
| `--panel-pad` | 20px | 16px | 卡片内边距 |

落地方式：`<a-config-provider>` 外层容器按角色加 `data-density`：教师端/管理端 = `compact`，学生端/文档 = `comfortable`。

---

## 4. 字号与排版

| 角色 | 令牌 | 值 | 用途 |
|---|---|---|---|
| 展示 | `--fs-display-1/2` | 32 / 26px | 登录页主标题、文档首页 |
| 标题 | `--fs-title-1/2/3` | 22 / 18 / 16px | 页面标题 / 区块标题 / 卡片标题 |
| 正文 | `--fs-body-lg` / `--fs-body` / `--fs-body-sm` | 15 / 14 / 13px | 说明文本 / 表格正文 / 辅助信息 |
| 注释 | `--fs-caption` | 12px | 时间戳、计数、标签 |
| 代码 | `--fs-code` | 13px | Monaco / 代码块 / 学号工号 |

中文排版补充：正文行高统一 1.6（西文 1.5 偏挤）；大标题用 `--tracking-tight`；全大写英文小标签用 `--tracking-wide`。

---

## 5. antd（ant-design-vue 4）映射表

`ant-design-vue 4.x` 使用 antd v5 的 token 体系，直接用 `ConfigProvider :theme` 对齐，避免大量 CSS 覆盖：

```js
import { theme as antdTheme } from 'ant-design-vue';
import { readCssVar } from '@/utils/tokens';   // 落地时新增：从 :root 读回令牌值

const v = (name) => readCssVar(name);          // 例：v('--brand-600') -> '#0066cc'

export const antdThemeConfig = {
  token: {
    colorPrimary:         v('--brand-600'),
    colorSuccess:         v('--green-600'),
    colorWarning:         v('--amber-600'),
    colorError:           v('--red-600'),
    colorInfo:            v('--brand-600'),
    colorTextBase:        v('--text-primary'),
    colorBgBase:          v('--bg-surface'),
    colorBgLayout:        v('--bg-canvas'),
    colorBgContainer:     v('--bg-surface'),
    colorBorder:          v('--border-strong'),
    colorBorderSecondary: v('--border-default'),
    colorTextSecondary:   v('--text-secondary'),
    colorTextTertiary:    v('--text-tertiary'),
    colorTextDisabled:    v('--text-disabled'),
    colorLink:            v('--text-link'),
    borderRadius:         v('--radius-md'),
    borderRadiusLG:       v('--radius-lg'),
    borderRadiusSM:       v('--radius-sm'),
    controlHeight:        v('--control-h'),
    controlHeightLG:      v('--control-h-lg'),
    controlHeightSM:      v('--control-h-sm'),
    fontFamily:           v('--font-sans'),
    fontSize:             14,
    fontSizeLG:           16,
    fontSizeSM:           13,
    lineHeight:           1.6,
    boxShadow:            v('--shadow-md'),
    boxShadowSecondary:   v('--shadow-lg'),
    motionDurationFast:   '0.15s',
    motionDurationMid:    '0.22s',
    motionDurationSlow:   '0.32s',
    motionEaseOut:        'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  components: {
    Layout: { headerBg: v('--topbar-bg'), siderBg: v('--sider-bg'), bodyBg: v('--bg-canvas'), headerHeight: 56 },
    Menu:   { darkItemBg: v('--sider-bg'), darkItemSelectedBg: v('--brand-600'), darkItemColor: v('--sider-fg'),
              itemHeight: 40, itemBorderRadius: 8, itemMarginInline: 8 },
    Table:  { headerBg: v('--table-header-bg'), headerColor: v('--table-header-fg'), headerSplitColor: 'transparent',
              rowHoverBg: v('--table-row-hover'), borderColor: v('--table-bd'), cellPaddingBlock: 12, cellPaddingInline: 16 },
    Card:   { paddingLG: 20, borderRadiusLG: 12 },
    Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none' },
    Input:  { paddingBlock: 6, paddingInline: 12 },
    Tag:    { defaultBg: v('--status-neutral-bg'), defaultColor: v('--status-neutral-fg') },
    Modal:  { titleFontSize: 18, paddingContentHorizontalLG: 24 },
    Tabs:   { horizontalItemPadding: '10px 0', titleFontSize: 14 },
  },
};
```

> 说明：`readCssVar` 让「令牌只有一份」。若不想引入读取工具，也可以把同一个对象同时导出为 JS 常量与 CSS，但必须保证**只有一个文件是事实来源**。

### 仍需 CSS 覆盖的组件（令牌覆盖不到的部分）

| 组件 | 覆盖点 | 目标令牌 |
|---|---|---|
| `a-table` | 去掉竖线边框、表头不居中、行高、粘性表头阴影 | `--table-*` |
| `a-menu`（dark） | 选中态从整行色块改为**圆角药丸 + 左侧 3px 强调条** | `--sider-item-*` |
| `a-pagination` | 尺寸与间距对齐 `--space-2` | `--space-*` |
| `a-modal` | 圆角 16px、标题字重 600、页脚按钮顺序（次要在左） | `--radius-xl` `--shadow-xl` |
| `a-empty` | 统一空态插画（线性 SVG）+ 主操作按钮 | `--empty-*` |
| `a-message/notification` | 圆角 12、阴影 `--shadow-lg`、图标色用状态三元组 | `--shadow-lg` |

---

## 6. 验收方式（落地阶段自检）

```bash
# 1) 组件里不应再出现硬编码色值（应输出 0 行，白名单：Monaco 主题、第三方覆盖）
grep -rnE '#[0-9a-fA-F]{3,8}\b' client/src/views client/src/components | grep -v 'nodes/'

# 2) 不应再出现 !important（除第三方覆盖文件）
grep -rn '!important' client/src --include='*.vue' --include='*.css'

# 3) 令牌覆盖率
grep -rn 'var(--' client/src --include='*.vue' | wc -l
```

---

## 7. Chrome 69 兜底注意

| 特性 | Chrome 最低版本 | 令牌中的处理 |
|---|---|---|
| `gap`（Flexbox） | 84 | 布局用 `margin`，或改用 Grid 的 `gap`（69 支持 grid-gap） |
| `:is()` / `:where()` | 88 | 不使用 |
| `:focus-visible` | 86 | 已提供 `:focus` + 环状阴影兜底 |
| `aspect-ratio` | 88 | 用 padding-top 百分比 |
| `color-mix()` / `oklch()` | 111 | 不使用，颜色全部写成具体值 |
| 逻辑属性（`margin-inline-start`） | 69 ✅ | 可用 |
| CSS 变量 | 49 ✅ | 可用（整套令牌的基础） |
| 容器查询 | 105 | 不使用，响应式走媒体查询 |
