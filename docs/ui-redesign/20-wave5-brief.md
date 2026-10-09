# Wave 5 任务书（暗色模式落地 + 无障碍/响应式收尾）

> 工作根目录 `/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`，HEAD `350c9df`）
> 前置：Wave 0–4 已完成并验收（硬指标：全站 .vue 与 style.css 的 hex=0、!important=0）
> Wave 4 验收报告 `18-wave4-verify.md` §8 是本源：R-21（暗色不可用 high）、R-22（Doc 灯箱 a11y medium）、R-23（1024 宽表 medium）

## 0. 背景（为什么现在做）
令牌层**早已支持暗色**（`tokens.css` 里有 `[data-theme="dark"]` 两段：语义层 + 组件级修正块），但：
1. **全仓没有 `data-theme` 入口** —— 没有任何 UI 能切到暗色，令牌是"永不生效的代码"；
2. **antd 组件未适配** —— Wave 0 只把我们的 CSS 变量映射给 antd，未接 `theme.darkAlgorithm`，故表格/弹窗等仍是浅色逻辑；
3. 实测缺陷：暗色下富文本正文 `rgba(0,0,0,.88)` 落在深底上，**对比度 1.19**（不可读）。

## 1. 硬约束
沿用全部既有约束（令牌、禁 `!important`、禁新增依赖、Chrome 69 兼容、不自启 dev server）。
**本批新增两条**：
- **令牌仍是单一真源**：antd 主题必须继续从 CSS 变量派生（`getComputedStyle`），不得把颜色值硬编码进 JS。
- **切换主题后必须重新派生 antd 令牌**：因为同一个 CSS 变量在两种主题下取值不同，映射必须在主题变化时重算（否则切到暗色后 antd 仍用浅色值）。

## 2. 技术方案（captain 定，实现按此写）

### 2.1 主题状态（`composables/useTheme.js`）
```js
const { mode, resolved, setMode, toggle } = useTheme();
// mode: 'light' | 'dark' | 'system'（默认 system，持久化到 localStorage['ui-theme']）
// resolved: 'light' | 'dark'（system 时跟随 matchMedia('(prefers-color-scheme: dark)')，需监听变化）
// 应用方式：document.documentElement.dataset.theme = resolved
```
- 首帧防闪：在 `index.html` 内联一小段脚本，按 localStorage/系统偏好**先**设置 `data-theme`，再做 Vue 挂载（否则暗色用户会看到白闪）。
- `` 元素也要设 `color-scheme: light|dark`（原生控件/滚动条）。

### 2.2 antd 接线（`App.vue` + `styles/antd-theme.js`）
- `algorithm: resolved === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm`（`ant-design-vue` 具名导出 `theme`）
- 其余 token 继续由 `createAntdTheme()` 从 CSS 变量读取；**主题切换后重新执行一次**（用 `resolved` 作为 `computed` 依赖，或监听变化后重算）。
- 现有 Wave 0 决策保持：不接管 `colorError` 等语义色（组件层已显式绑定）。

### 2.3 暗色面清单（t32 负责）
| 面 | 现状问题 | 修法 |
|---|---|---|
| 富文本正文/工具栏（RichEditor） | 正文 `rgba(0,0,0,.88)`（对比度 1.19） | 改用 `--text-primary`/`--text-secondary` 等令牌 |
| 表格（ListPage + antd table） | 依赖 darkAlgorithm | 组件级样式全部走令牌；表头/行/hover/空态/错误态逐一核对 |
| teleport 面（Modal/Dropdown/Select 下拉） | `overrides.css` 里的规则可能写死浅色 | 逐条改为令牌 |
| 代码面 | 已是 `--code-bg/--code-fg`（恒定深色） | 不变，核对即可 |
| Doc/Login 自定义面 | Wave 4 已令牌化 | 核对暗色下的对比度 |

**判据**：正文与次要文字在各自底色上的对比度 **≥ 4.5:1 / ≥ 3:1**（WCAG AA），用实测计算值证明。

## 3. 分工与文件边界（互不重叠）

| 任务 | 负责 | 可写文件 | 内容 |
|---|---|---|---|
| **t31** 主题基础设施与入口 | nav-dev | `composables/useTheme.js`（新）、`App.vue`、`styles/antd-theme.js`、`index.html`、`views/{teacher,admin,student}/Layout.vue` | 2.1 + 2.2 + 三端切换入口（放用户下拉菜单，选项「浅色/深色/跟随系统」） |
| **t32** 暗色面适配 | shell-dev | `components/{RichEditor,ListPage,PageShell,StatusTag,FormPage,CodeEditor,ProjectZipUploader}.vue`、`styles/overrides.css` | 2.3 的组件面 + **R-23 组件侧**：表格容器窄屏可横向滚动且不外溢到 `.content` |
| **t33** 无障碍与响应式收尾 | teacher-dev | `views/Doc.vue` + 各列表页（admin 4 页、teacher 7 页） | **R-22**：Doc 灯箱补 Esc 关闭 + 焦点返回（打开时聚焦、关闭后回到触发元素）；**R-23 页面侧**：给 P2 列标注 antd `responsive` 断点（1024 档隐藏次要列） |
| **t34** 独立验收 | verifier | `docs/ui-redesign/21-wave5-verify.md` + 截图 | 暗色全站复核（三端 × 关键页 × 对比度实测）、R-22/R-23 复现、Wave 5 回归 0、`data-theme` 入口可用性与持久化 |

**谁都不要碰**：`styles/tokens.css`（captain 独占；若确需增删令牌，在 output 提出）。t33 不得改 `views/*/Layout.vue`（属 t31）；t32 不得改 `views/**`。

## 4. 验收口径
- 暗色下三端关键页（列表/表单/工作台/作答/Doc/Login）**无不可读文字**（对比度实测达标）
- 主题切换**即时生效**且刷新后保持；`system` 模式跟随系统变化
- 首帧不闪白（暗色用户刷新页面不应先白后暗）
- 切换主题不产生 console error；legacy（Chrome 69）下入口可用且不报错
- 既有硬指标不回退（hex=0、!important=0、Modal.confirm=0）
