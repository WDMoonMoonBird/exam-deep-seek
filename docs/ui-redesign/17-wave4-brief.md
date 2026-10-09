# Wave 4 任务书（收尾清扫波）

> **工作根目录**：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`，HEAD `0d80c9c`）
> ⛔ 严禁修改主工作区 `/Users/you/My Projects/My Vue/Exam-DeepSeek-ui` 之外的任何仓库
> 前序：Wave 1/2/3 验收报告 `10-`/`12-`/`14-`/`15-wave*.md`；契约 `13-wave3-contract.md`（含 §7 captain 修订）

## 0. 本批性质
**不新增功能、不改业务语义**。全部是收口：页面迁移尾巴、令牌纯度、组件参数、文案规范、全局格式化、以及三类整体复核（legacy / 暗色 / 移动端）。

## 1. 硬约束（沿用）
一律令牌；禁 `!important`；禁新增依赖；Chrome 69 限制同前；不自启 dev server（复核用 5175，captain 管端口）；执行 bash 必须显式 cd。

## 2. 分工与文件边界（互不重叠，越界即回滚）

| 任务 | 负责 | 可写文件 | 内容 |
|---|---|---|---|
| **t24** 对话框与宽度收口 | shell-dev | `composables/useConfirm.js`、以及持有对话框的页面：`views/teacher/{QuestionEdit,ProjectQuestionEdit,ReviewDetail,ProjectReviewNew,Students,Classes,Teams}.vue`、`views/admin/{Classes,Teachers,Students}.vue`、`views/student/Submit.vue` | R-12 useConfirm 增可选 `width/maskClosable/closable`；R-14 全站 Modal 宽度收敛到 **480/640/820** 并消除 `"820px"` 字符串写法；R-15 对话框文案动词化（7 处 `ok-text="确定"`/「确定切换」+ QuestionEdit 2 处 popconfirm） |
| **t25** 文档/登录页迁移 + 令牌残留 | nav-dev | `views/Doc.vue`、`views/Login.vue`、`styles/style.css`、`views/{teacher,admin,student}/Layout.vue` | Doc.vue（44 hex / 6 `!important`）与 Login.vue 迁到设计语言（PageShell/令牌）；style.css 旧 `:root` 块与 18 处 hex 清理（**不得改变任何现有选择器行为**）；R-2 顶栏令牌化（评估后实施或书面结案，须过 legacy 验证）；三个 Layout 的 Modal 宽度/文案一并收口 |
| **t26** 编辑器组件与会话区令牌 | admin-dev | `components/RichEditor.vue`、`components/ProjectZipUploader.vue`、`views/admin/Monitor.vue` | R-11 字号令牌化（RichEditor 6 + ProjectZipUploader 6，等值才换、off-scale 列清单）；R-6 深色日志区令牌评估（`--bg-inverse`/`--text-inverse-muted` 复用是否足够，不够则提出新增方案交 captain） |
| **t27** 全局时间格式 R-4 | teacher-dev | `domain/format.js` | 统一为 `YYYY-MM-DD HH:mm`（现为 `2026/8/24 19:01`）；**只改格式化函数**，页面不得改动；须全站抽验（列表/详情/相对时间/倒计时文案不回归） |
| **t28** 独立验收 + 三类整体复核 | verifier | `docs/ui-redesign/18-wave4-verify.md` + 截图 | 见下 |

**谁都不要碰**：`styles/tokens.css`（captain 独占）、`components/{PageShell,ListPage,StatusTag,FormPage}.vue`、`composables/useDraftAutosave.js`、`server/**`。

## 3. t28 必做的三类整体复核（Wave 1–3 都没做）
1. **legacy Chrome 69 逐页扫描（R-3）**：`html.legacy` 下三端抽页，确认无阻断（对照 `04-interaction-a11y.md` 的 legacy 约定）
2. **暗色模式全站复核**：`data-theme=dark` 下三端各抽 2 页（含列表/表单/工作台），检查令牌驱动的对比度与硬编码残留
3. **移动端复核**：768/1024 下三端抽页无横向溢出、抽屉/折叠正常

外加：本批四个任务的逐项验收、R-4 抽验（时间格式在 20+ 页的呈现）、硬检查数值与 captain 台账交叉还原、**bundle 体积记录**（`client/dist`，注明无改动前基线）。

## 4. 两个 captain 已决的收口口径
- **R-13（10px/11px 字阶）**：**不新增令牌**——字阶下沿为 12px，10/11px 属历史微标签，按「off-scale 保留并登记」规则处理，本批结案。
- **R-4 的副作用**：时间格式全局变化会让 Wave 1–3 的截图基线里日期串**全部过时**，这是预期，不计为回归；t28 需在报告里注明。
