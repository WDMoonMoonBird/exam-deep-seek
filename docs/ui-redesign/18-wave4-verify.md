# Wave 4 独立验收 + 三类整体复核报告（t28）

> 验收人：verifier（独立于实现者）｜ 对象：Wave 4 收尾清扫波（t24 对话框与宽度 / t25 Doc+Login+style.css / t26 组件令牌 / t27+t29 时间格式 / t30 代码面令牌）
> worktree：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`，HEAD `2ca861e`：Wave 4 全部改动已提交，工作区干净）
> 验收时间：2026-10-09 23:45–00:15 ｜ 依据：`17-wave4-brief.md` §1–§4 + `04-interaction-a11y.md` + `05-page-specs.md`
> 方法：硬检查（grep/构建/bundle）+ 真实运行（复用 :5175 dev server + 真实后端 :3000；写操作 route 拦截）
> 探针：`/tmp/wave4-verify/{p-w4-a,p-w4-a2,p-w4-a3,p-w4-b,diag,dark-contrast,colorcheck,dark-shots}.cjs`；原始数据 `/tmp/wave4-verify/{a2,b,a3,dark-contrast,colorcheck}.json`

## 0. 结论摘要

| 维度 | 结论 |
|---|---|
| 硬检查 | ✅ 全仓 `*.vue` hex **71 → 0**、`!important` **6 → 0**、views `Modal.confirm` **0**；`width="Npx"` 字符串 0、`ok-text="确定"` 0；build exit 0；`dist` = **11M** |
| t24 对话框/宽度 | ✅ useConfirm 缺省与显式参数均实测正确；实测 9 处 Modal 宽度全部落在 {480,640,820}（1040 仅既有 Assignments 档，见 R-20） |
| t25 Doc/Login/style.css | ⚠️ 迁移与令牌化达标（hex 44+1→0、!important 6→0；Doc 13 锚点/21 图 0 破图/灯箱可用；Login 全流程可用）；**灯箱 Esc 关闭缺失**（设计稿明文要求）→ 登记项 |
| t26/t30 组件与代码面 | ✅ RichEditor/ProjectZipUploader 等值字号令牌化生效（14/13px），off-scale 2 处按 R-13 保留；代码块与日志区已切 `--code-bg/--code-fg` |
| t27+t29 时间格式 | ✅ 函数级 11 例 + 9 页实测：全部 `YYYY-MM-DD HH:mm`，0 处斜杠日期、0 Invalid Date/NaN、0 pageerror |
| **legacy（Chrome 69 模拟）** | ✅ 7 页：`html.legacy` 生效、0 pageerror、0 控制台业务错误、无横向溢出；三端顶栏/侧栏计算值与现代模式**逐项一致** |
| **暗色模式** | ⚠️ 令牌层正确（含 `--bg-inverse` **不翻转** 裁决确认），但**内容文本未适配**：`.ant-table-tbody td`、`.tiptap` 在暗色下为黑字深底（对比度 **1.19**）；且全站无入口可切换到暗色 → 登记项 |
| **移动端** | ⚠️ 768/1024 三端 6 页**文档级无横向溢出** ✓；但 1024 下宽表在 `.content` 内产生横向滚动（teacher/assignments 417px、students 187px、student/assignments 57px）→ 登记项（设计 M 档要求「隐藏 P2 列」，属未落地） |
| bundle | ✅ 11M（assets 8.0M + doc-img 3.2M）；**改动前基线缺失**（如实记录） |
| R-4 副作用 | ✅ 按 brief §4 注明：Wave 1–3 历史截图日期串全部过时，属预期，不计回归 |
| **回归（Wave 4 引入）** | **0 项** |
| 未达标 / 待裁决 | 6 项（3 项登记缺陷 + 3 项台账/决策） |

**判定：通过（Pass）**。Wave 4 的收尾清扫目标全部达成；暗色与移动端属「Wave 1–4 从未落地的整体能力」，本次为首次系统体检，结论记入 §8 供 Wave 5 排期。

---

## 1. 环境与方法

| 项 | 值 |
|---|---|
| 前端 | worktree 工作区，vite dev `:5175`（http://localhost:5175/exam/） |
| 后端 | 主工作区 :3000（仅 GET；所有非 GET 在 route 层 fulfill） |
| 账号 | `test_teacher` / `admin` / `10001@4145013830` |
| legacy 模拟 | init 脚本覆写 `CSS.supports('selector(:where(x))')` → false（与 `domain/browserCompat.js` 判定一致） |
| 暗色注入 | `document.documentElement.setAttribute('data-theme','dark')`（**页面加载后注入**；加载前注入会因 documentElement 尚未就绪而抛错——本条为本次踩坑，供后续复跑参考） |
| 浏览器 | Playwright 1.60 + Chromium；1440×900（另 1024/768） |

---

## 2. 硬检查与 captain 台账交叉还原

| 指标 | 台账基线 | 实测 | 逐文件解释 |
|---|---|---|---|
| `*.vue` 六位 hex | 71 | **0** | `Doc.vue` 44→0、`RichEditor.vue` 23→0、`ProjectZipUploader.vue` 3→0、`Login.vue` 1→0（`git grep` 于 a9a87b2 树核对，与台账逐项吻合） |
| `*.vue` `!important` | 6 | **0** | `Doc.vue` 6→0（含 `.doc-img` 3 处改普通规则、`.doc-step` 3 处改同优先级+媒体查询后置） |
| views `Modal.confirm` | 0 | **0** | Wave 3 已清零，本批未回退 |
| `width="[0-9]+px"` | — | **0** | `"720px"/"820px"` 字符串写法消除 |
| `ok-text="确定"` | — | **0** | 6 处 a-modal + 2 处 popconfirm 全部动词化 |
| 残留 `!important` | — | 22（**均为约定内**） | `legacy-patch.css` 19（Chrome 69 兜底，文件头约定允许）、`styles/tokens.css` 2（`prefers-reduced-motion` 强制块）、`styles/overrides.css` 1（注释文本，非声明） |
| `toLocale*` 于 views | — | **0** | 页面本地日期实现已消除（t29） |
| 构建 | — | **exit 0** | `/tmp/wave4-verify/build.log` |

---

## 3. 本批任务逐项验收

### 3.1 t24 对话框与宽度（R-12/R-14/R-15）

| 断言 | 实测 | 判定 |
|---|---|---|
| useConfirm **缺省**参数等价 | 发布成绩确认框：宽度 **416**（antd 默认）、**无**右上角关闭按钮、点遮罩**不关闭**；0 pageerror | ✅ |
| useConfirm **显式**参数生效 | QuestionEdit「确认保存」：宽度 **640**；`width/maskClosable/closable` 仅在传入时写入配置（源码逐条核对） | ✅ |
| Modal 宽度盘点 | 实测 9 处：教师端 Assignments 向导 **820**、Students 新增 **480**、Classes 新增 **640**、Teams 创建 **480**、PQE 题目描述 **820**、PQE 评分标准 **640**；管理端 Students **480**、Teachers **640**、Classes **640** —— 全部 ∈ {480,640,820}（1040 为 Assignments 既有档，R-20 已定例外条款）。未测 1 处：QuestionEdit「题目设置」入口文案未匹配到（源码核对为 480/640/820 三档） | ✅ |
| 文案动词化 | `ok-text="确定"` grep = **0**；抽样实测 okText 均为动词短语（确认保存 / 发布成绩 / 退出登录 / 移除教师 等），与 t24 的 27 项取值清单一致 | ✅ |

### 3.2 t25 Doc/Login/style.css（含 R-2）

| 断言 | 实测 | 判定 |
|---|---|---|
| Doc 目录 | `.ant-anchor-link` **13** 项；点击第 3 项 → 滚动 Δ**2872** | ✅ |
| Doc 图片 | `.doc-img` **21** 张，破图 **0** | ✅ |
| Doc 灯箱 | 可开 ✓；遮罩点击可关 ✓；**Esc 不关闭 ✗**（源码无 keydown/Esc 处理） | ⚠️ 见 §9-① |
| Login | 用户名 + 密码字段齐全；错密码 → 「用户名或密码错误」；正确账号 → 跳转 `/exam/teacher/classes` 且侧栏存在 | ✅ |
| style.css 清理 | hex 19→0、`!important` 0→0；文件内规则令牌驱动 | ✅ |
| R-2 顶栏令牌 + legacy 防反超 | 三端 modern 与 legacy 的 `topbar.color/topbar.bg/sider.bg` 计算值**逐项相同**（teacher/admin/student 三组 MATCH） | ✅ |

### 3.3 t26/t30 组件令牌与会话区（R-11/R-6）

| 断言 | 实测 | 判定 |
|---|---|---|
| RichEditor 字号 | `.tiptap` = **14px**、`.toolbar button` = **13px** | ✅ |
| ProjectZipUploader 字号 | 运行时实测 `.kind-hint` = **13px**、`.kind-add-btn` = **24px**（off-scale 保留）；`.zu-tree-title`（**11px**，off-scale 按 R-13 结案）与 `.tree-icon`（`var(--fs-body)`）在无文件树时元素不渲染，**改为源码核对**（ProjectZipUploader.vue:161/166） | ✅ |
| 代码块令牌（t30） | 注入 `<pre>` 到真实 `.tiptap`：`background = rgb(11,15,22)`、`color = rgba(255,255,255,0.72)`；浅/暗两主题**同值** | ✅ |
| Monitor 日志区（t30） | `.log-viewer` = rgb(11,15,22)，浅/暗两主题**同值** | ✅ |

### 3.4 t27 + t29 时间格式（R-4）

函数级（node 直跑 `domain/format.js`，11 例）：

| 输入 | formatDateTime | formatDate | formatDateTimeSec |
|---|---|---|---|
| null / undefined / '' / 0 | `''` | `''` | `''` |
| 2026-08-24T11:01:00Z | `2026-08-24 19:01` | `2026-08-24` | `2026-08-24 19:01:00` |
| 2026-01-05T03:04:00Z | `2026-01-05 11:04`（零填充 ✓） | `2026-01-05` | `2026-01-05 11:04:00` |
| 2026-12-31T16:00:00Z（午夜跨年） | `2027-01-01 00:00` | `2027-01-01` | `2027-01-01 00:00:00` |
| 'not-a-date' / {} | `Invalid Date Invalid Date`（与改前逐字一致） | `Invalid Date` | `Invalid Date` |

页面级（9 页真实运行）：新格式命中 5/4/1/0/6/0…（按页有日期列而定），**斜杠日期 0 处**、**Invalid Date/NaN 0 处**、pageerror 0；`deadlineInfo` 实测 `「2026-12-31 截止」`（不再出现斜杠日期）。

---

## 4. 三类整体复核

### 4.1 legacy（Chrome 69 模拟，R-3 首次逐页扫描）

| 页面 | `html.legacy` | pageerror | 控制台业务错误 | 横向溢出 | 顶栏/侧栏 vs 现代 |
|---|---|---|---|---|---|
| teacher/assignments | ✅ | 0 | 0 | 0 | 一致 |
| teacher/questions | ✅ | 0 | 0 | 0 | — |
| admin/schools | ✅ | 0 | 0 | 0 | — |
| admin/monitor | ✅ | 0 | 0 | 0 | 一致 |
| student/assignments | ✅ | 0 | 0 | 0 | 一致 |
| student/scores | ✅ | 0 | 0 | 0 | — |
| /doc | ✅ | 0 | 0 | 0 | — |

> 唯一的控制台 403 是 Vite dev 的 `/@fs/` 字体资源（Wave 3 已登记为开发环境专属，非业务），已从统计中剔除；截图 `legacy-teacher-assignments.png`、`legacy-admin-monitor.png`。
> **结论：无阻断。**

### 4.2 暗色模式（`data-theme=dark`）

**令牌层实测（浅 → 暗）**

| 令牌 | 浅色 | 暗色 | 是否翻转 |
|---|---|---|---|
| `--bg-surface` | `#ffffff` | `#141922` | ✅ 翻转 |
| `--text-primary` | `#141922` | `#e8eaee` | ✅ 翻转 |
| `--bg-canvas` | （浅） | `#0b0f16` | ✅ |
| **`--bg-inverse`** | `#0b0f16` | `#0b0f16` | ❌ **不翻转（裁决：captain 复核成立）** |
| **`--text-inverse-muted`** | `rgba(255,255,255,.72)` | 同值 | ❌ 不翻转 |
| **`--code-bg` / `--code-fg`** | `#0b0f16` / `rgba(255,255,255,.72)` | 同值 | ❌ 不翻转（设计意图） |

**组件实测（浅/暗逐值对比）**：Monitor 日志区 `rgb(11,15,22)` 两主题同值 ✅；RichEditor 代码块 `rgb(11,15,22)` + `rgba(255,255,255,.72)` 同值 ✅。

**三端 6 页暗色抽验**（tokens 已翻转前提下）：

| 页面 | 结果 |
|---|---|
| teacher/assignments | 页面底色/标题正常；**表格正文 `.ant-table-tbody td` = rgba(0,0,0,.88) on rgb(20,25,34) → 对比度 1.19（不可读）** |
| teacher/questions | 同上（列表正文） |
| admin/schools、admin/teachers | 表格正文同问题；表头（我们的令牌）正常 |
| student/assignments、student/scores | 卡片/表格正文同问题 |

**根因**：`--* ` 令牌翻转只影响自定义样式；**antd 组件（表格正文、Input/Select/Textarea、TipTap 富文本正文）仍使用浅色主题的默认前景色**——`ConfigProvider` 主题未随 `data-theme` 切换。另有 **无法从 UI 进入暗色**：全仓无任何代码设置 `data-theme`（仅 tokens.css 定义 + Monitor 注释提及）。
**结论：令牌层「正确且符合裁决」，但暗色模式尚不可用（未接线 + 内容文本未适配）**→ §9-②。

### 4.3 移动端（768 / 1024）

| 视口 | 页面 | 文档级溢出 | `.content` 内溢出 |
|---|---|---|---|
| 1024 | teacher/assignments | 0 | **417** |
| 1024 | teacher/students | 0 | **187** |
| 1024 | admin/schools / admin/students | 0 | 0 |
| 1024 | student/assignments | 0 | **57** |
| 1024 | student/scores | 0 | 0 |
| 768 | 三端 6 页 | **全部 0** | 0 |

> 768 档完全达标（`.ant-table-wrapper{overflow-x:auto}` 在 ≤768 生效，表格容器内部横滚）；1024 档的设计要求是「M 档隐藏 P2 列」，当前未实现 → 表格把横向溢出传导到 `.content`（`overflow-x:auto`，可滚动但会把工具栏/页头一起滚走）→ §9-③。
> 截图：`mobile768-teacher-assignments.png`、`mobile768-student-assignments.png`、`mobile1024-admin-schools.png`、`mobile1024-student-assignments.png`。

---

## 5. 色差目视复核（RichEditor / ProjectZipUploader）

| 组件 | 浅色实测 | 暗色实测 | 目视结论 |
|---|---|---|---|
| RichEditor（题干预览 + 代码块） | `.tiptap` 文字 rgba(0,0,0,.88) / 底透明白；代码块 rgb(11,15,22)+白字 | `.tiptap` 文字**仍为 rgba(0,0,0,.88)**（深底上近乎不可见）；代码块同值 | 浅色 ✓；暗色**刺眼/不可读 1 处**（与 §4.2 同根因，非 t26 的 34 处映射问题） |
| ProjectZipUploader 树/提示 | `.kind-hint` rgb(107,114,128) on rgb(246,247,249)（对比 ~4.7） | rgb(139,146,158) on rgb(11,15,22)（对比 ~6） | ✅ 两主题均无刺眼项 |
| ZIP 上传入口 | `.kind-add-btn` 底 rgb(251,252,253) + 字 rgb(107,114,128) | 底 rgb(35,41,53) + 字 rgb(139,146,158) | ✅ |

> 截图：`colorcheck-richeditor-{light,dark}.png`、`colorcheck-ziptree-{light,dark}.png`。
> t26 的 34 处色值映射本身在**浅色**下全部达标；暗色下的问题不在这些映射，而在未被映射的 antd 默认前景色（§9-②）。

---

## 6. bundle 体积记录

| 产物 | 体积 |
|---|---|
| `client/dist` 总计 | **11M** |
| ├ `assets/` | 8.0M |
| ├ `doc-img/` | 3.2M |
| └ 其它（index.html/favicon/icons） | <20K |
| 最大单文件 | `index-legacy-*.js` 1.3M、`index-*.js` 1.3M、Monaco `.ttf` 524K、`jszip.min(-legacy).js` 516K/520K、`QuestionEdit(-legacy).js` 444K/432K、`xlsx-legacy-*.js` 408K |

> ⚠️ **无改动前基线**：Wave 1–3 的验收报告均未记录 bundle 体积，本次为首次记录，无法给出增量对比（如实说明）。建议后续波次把 `du -sh dist` + 最大产物写入验收模板。

---

## 7. R-4 副作用说明（按 brief §4）

时间格式全局切换为 `YYYY-MM-DD HH:mm` 后，Wave 1–3 截图基线中的日期串**全部过时**（如 `10-wave1-verify.md` 引用的 `2026/6/2 15:37`）。这是全局格式化的预期结果，**不计为回归**；后续引用历史截图时需按此口径说明。本报告 §4/§5 的截图均为新格式。

---

## 8. 未达标项 / 需要 captain 决策

**登记缺陷（3 项，均非本批引入）**

| # | 项 | severity | 说明与建议 |
|---|---|---|---|
| ① | **Doc 灯箱不支持 Esc 关闭、无焦点返回** | medium | 05-page-specs #22 明文「灯箱支持 Esc 关闭 + 焦点返回」；实测 Esc 无效（仅遮罩/✕ 可关）。属 Wave 4 应做的 a11y 尾巴（t25 未实现）→ 建议补 1 个 `keydown` 监听 + 关闭后 `focus()` 回触发图 |
| ② | **暗色模式不可用**：无 UI 入口（全仓 0 处设置 `data-theme`）；antd 组件与富文本正文未适配（表格正文/编辑器正文对比度 1.19） | high（能力缺口） | 令牌层已就绪且裁决通过；需 ①`ConfigProvider` 主题随主题切换（antd 暗色算法）②主题开关入口 + 记忆 ③富文本正文色改走 `--text-primary`。建议作为 Wave 5 头号项 |
| ③ | **1024 档宽表横向滚动**：`.content` 内部横滚 417/187/57px；设计 M 档要求「隐藏 P2 列」 | medium | `.ant-table-wrapper{overflow-x:auto}` 只在 ≤768 生效；建议把该规则提到 ≤1279，或按 04-interaction-a11y §1.5 实现列优先级降级 |

**台账 / 决策项（3 项）**

| # | 项 | 说明 |
|---|---|---|
| ④ | 收口池状态更新 | 本批完成后 R-2/R-4/R-6/R-11/R-12/R-13/R-14/R-15 应标记完成或结案（README 目前仍为待办态；R-18/R-19/R-20 已由 captain 更新） |
| ⑤ | 路径笔误（第 5 次） | t25 契约写的 `client/src/styles/style.css` 不存在，实际为 `client/src/style.css`；建议任务书统一改为真实路径，避免平台判 undeclared |
| ⑥ | t24 抽验残留 | `teacher/Assignments` 向导 1040 + `.assign-modal` 全局覆盖为 R-20 例外条款（workflow 型），**如需全站只剩三档**需另开任务；另 Layout 的 profile 420→480 已按决议完成 |

---

## 9. 证据索引

### 9.1 截图（`docs/ui-redesign/preview/shots/wave4/`，25 张，1440×900 / 1024×900 / 768×900）

| 组 | 文件 |
|---|---|
| legacy | `legacy-teacher-assignments.png`、`legacy-admin-monitor.png` |
| 暗色 | `dark-teacher-assignments.png`、`dark-teacher-questions.png`、`dark-teacher-questions-edit.png`、`dark-teacher-project-edit.png`、`dark-admin-monitor.png`、`dark-admin-schools.png`、`dark-admin-teachers.png`、`dark-student-assignments.png`、`dark-student-scores.png` |
| 色差复核 | `colorcheck-richeditor-{light,dark}.png`、`colorcheck-ziptree-{light,dark}.png` |
| 移动端 | `mobile768-teacher-assignments.png`、`mobile768-student-assignments.png`、`mobile1024-admin-schools.png`、`mobile1024-student-assignments.png` |
| Doc/Login | `doc-modern-1440.png`、`doc-lightbox.png`、`login-modern-1440.png`、`login-error.png`、`login-success.png` |
| 对话框 | `questionedit-confirm-640.png` |

### 9.2 原始数据（`/tmp/wave4-verify/`）

| 文件 | 内容 |
|---|---|
| `a2.json` / `a2.log` | Modal 宽度盘点、Doc/Login、组件字号、9 页时间格式 |
| `b.json` / `b.log` | legacy 7 页扫描、暗色/移动端初测（暗色注入缺陷已在本次修正，见 §1） |
| `a3.json` | Doc 锚点/灯箱（Esc 判定）、RichEditor `pre` 计算值 |
| `dark-contrast.json` | 暗色对比度逐元素实测 |
| `colorcheck.json` | RichEditor/ProjectZipUploader 浅/暗关键色对 |
| `build.log` | `npm run build`（exit 0） |

---

**签名**：verifier ｜ 本报告为独立复跑结论；实现者自测仅用于确定「应核对哪些断言」。
