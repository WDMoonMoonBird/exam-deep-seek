# Wave 1 独立验收报告（T6）

> 验收人：verifier（独立于全部实现者）｜ 对象：Wave 1 全部产出（T1/T2/T3/T4/T5/T8/T9/T10）
> worktree：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`，HEAD `6e22742`；实现改动为工作区未提交状态，本报告针对该状态）
> 验收时间：2026-10-09 17:00–19:20 ｜ 依据：`09-wave1-brief.md` §1/§2/§4/§6 + `05-page-specs.md` §1/§2
> 所有结论来自**独立复跑**：真实后端（:3000，未 mock /api）+ 真实浏览器（Playwright/Chromium 1440×900）

## 0. 结论摘要

| 维度 | 结论 | 证据 |
|---|---|---|
| 构建 | ✅ `npm run build` exit 0 | `/tmp/wave1-verify/final-build.log` |
| 3 个组件契约 | ✅ 与 09-brief §2 一致；另有 2 处 **captain 建单授权的新增**（`change` 事件、`stickyContainer` prop） | §3 |
| 14 个页面迁移 | ✅ 逐页通过（0 页不通过） | §5 |
| 页面运行期错误 | ✅ 14/14 页 pageerror 0、console error 0、HTTP ≥400 = 0 | `final-report.json` |
| 硬编码色值 / `!important` | ✅ 14 页 + 3 组件全部 **0 命中** | §2 |
| 令牌覆盖率 | ✅ 每页 `var(--` 引用 1–57 处（组件 11/27/16） | §2 |
| 侧栏骨架 + 全局尺度 | ✅ 232/64、compact/comfortable、22px 标题 / 14px 正文 / 卡片 12 / 标签 6 / 弹窗 16 / 按钮 8 | §6 |
| captain 指定 4 个高风险点 | ✅ 4/4 实测通过（粘性表头、徽标同源、学生四态/倒计时/点击、排序服务端参数） | §4 |
| **回归（阻断项）** | **0 项** | §7 |
| 未达标项 / 待 captain 决策 | 5 项，均为低风险收尾项 | §8 |

**判定：通过（Pass）**，建议进入 Wave 2；§8 的 5 项建议并入收口池处理。

---

## 1. 验收环境与方法

| 项 | 值 |
|---|---|
| 前端 | worktree 工作区，自起 vite dev：`npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`，访问 `http://localhost:5175/exam/`（用 127.0.0.1 会被后端 CORS 拒） |
| 后端 | 主工作区 :3000（真实库 `exam_system`），**未 mock 任何 /api** |
| 账号 | 教师 `test_teacher`；管理 `admin`；学生 `10001@4145013830`（20 份作业/3 条成绩，数据量最大） |
| 浏览器 | Playwright 1.60 + Chromium，视口 1440×900 |
| 对照基线 | 旧 UI = 主工作区 :5173（同账号同数据），仅比对「数据行数 / 表头 / 接口调用」，不比对样式 |
| 复跑脚本 | `/tmp/wave1-verify/{verify,scale,interactions,probes,sticky,static-check2,apicalls}.cjs` |

```bash
# 1) 构建（契约 verify）
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run build
# 2) 起验收用 dev server
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
# 3) 逐页截图 + 页面级错误
node /tmp/wave1-verify/verify.cjs --base http://localhost:5175 --out docs/ui-redesign/preview/shots/wave1 --json /tmp/wave1-verify/final-report.json
# 4) 侧栏/尺度、交互、定向探针、粘性表头
node /tmp/wave1-verify/scale.cjs        --base http://localhost:5175 --json /tmp/wave1-verify/final-scale.json
node /tmp/wave1-verify/interactions.cjs --base http://localhost:5175 --json /tmp/wave1-verify/final-interactions.json
node /tmp/wave1-verify/probes.cjs       --base http://localhost:5175
node /tmp/wave1-verify/sticky.cjs       --base http://localhost:5175
```

---

## 2. 静态度量（硬编码色值 / `!important` / 令牌覆盖率 / Chrome 69）

### 2.1 逐文件（Wave 1 范围）

| 文件 | `var(--` 引用 | hex | `rgba(` | `!important` | Chrome 69 禁用特性 | 备注 |
|---|---|---|---|---|---|---|
| components/PageShell.vue | 11 | 0 | 0 | 0 | 0 | |
| components/ListPage.vue | 27 | 0 | 0 | 0 | 0 | T10 粘性表头后新增若干令牌引用 |
| components/StatusTag.vue | 16 | 0 | 0 | 0 | 0 | 唯一数字圆角 `border-radius:50%`（圆点，合法） |
| teacher/Classes.vue | 8 | 0 | 0 | 0 | 0 | |
| teacher/Students.vue | 34 | 0 | 0 | 0 | 0 | 2 处 `font-size:48px` 装饰图标（§8-①） |
| teacher/Teams.vue | 2 | 0 | 0 | 0 | 0 | 无状态列，未用 StatusTag（有意） |
| teacher/Assignments.vue | 57 | 0 | 0 | 0 | 0 | 2 处 `font-size:14px/12px`（§8-①） |
| teacher/Review.vue | 9 | 0 | 0 | 0 | 0 | |
| teacher/ReviewClass.vue | 6 | 0 | 0 | 0 | 0 | |
| teacher/Questions.vue | 3 | 0 | 0 | 0 | 0 | 参考页 |
| admin/Schools.vue | 1 | 0 | 0 | 0 | 0 | |
| admin/Classes.vue | 4 | 0 | 0 | 0 | 0 | |
| admin/Teachers.vue | 6 | 0 | 0 | 0 | 0 | |
| admin/Students.vue | 3 | 0 | 0 | 0 | 0 | |
| admin/Monitor.vue | 17 | 0 | 0 | 0 | 0 | 深色日志区复用反色令牌（R-6） |
| student/Assignments.vue | 51 | 0 | 0 | 0 | 0 | 卡片变体 |
| student/Scores.vue | 10 | 0 | 0 | 0 | 0 | |
| teacher/Layout.vue | 74 | 0 | 0 | 0 | 0 | `data-density="compact"` |
| admin/Layout.vue | 40 | 0 | 0 | 0 | 0 | `data-density="compact"` |
| student/Layout.vue | 49 | 0 | 0 | 0 | 0 | `data-density="comfortable"` |
| styles/antd-theme.js | – | 0 | 0 | 0 | 0 | WAVE1：fontSize 14 / card 12 / modal 16 / tag 6 |
| styles/overrides.css | 14 | 0 | 0 | 0（1 处仅注释） | 0 | |
| style.css | 13 | 19（旧令牌定义，非本轮） | 1 | 0 | 2 | T7 已清 4 处 `!important` |
| legacy-patch.css | 14 | 1（注释） | 2 | 19 | 1 | Chrome 69 兜底文件，`!important` 按设计保留（§7-②） |

### 2.2 全仓横向（含未迁移页，用于扣基线）

| 指标 | 改造前（HEAD 树解包统计） | 现在 | 结论 |
|---|---|---|---|
| `views/`+`components/` 六位 hex | 260 | **238** | 净 −22，14 个 Wave 1 文件全部 0 |
| `#1677ff` 旧主色 | 45 | 41 | 剩余全在未迁移页（Submit/Doc/ReviewDetail…） |
| `views/`+`components/` `!important` | 24 | 24 | Wave 1 文件 0；残留全部在未迁移页（Wave 2/3） |
| `components/DataTable.vue` 引用 | 15 页 | **0**（仅注释提及） | 佐证收口池 R-7「已成死代码」 |

> 契约 verify 命令实测：`grep -rnE '#[0-9a-fA-F]{6}\b' client/src/views client/src/components | wc -l` = **238**。
> 09-brief 写的「改造前基线 49 处 #1677ff」经复核为**旧主色出现次数**（HEAD 实测 45 处），并非全量 hex 数（HEAD 全量 260 处）。

---

## 3. 三个组件 API ↔ 09-brief §2 逐条核对

| 契约项 | PageShell | ListPage | StatusTag |
|---|---|---|---|
| props | `title`(必填)/`description`/`maxWidth` ✅ | `columns`(必填)/`dataSource`(必填)/`loading`/`rowKey`(默认 id)/`total`/`current`/`pageSize`(默认 20)/`emptyTitle`/`emptyDesc`/`emptyActionText` ✅（11 个） | `tone`(白名单 6 值，默认 neutral)/`text`(必填)/`dot`(默认 false) ✅ |
| slots | `actions`/`kpi`/默认 ✅ | `toolbar`/`toolbar-right`/`bodyCell`（`v-bind` 原样透传） ✅ | — |
| emits | — | `page-change`/`empty-action` ✅ ＋ **新增 `change`**（T9） | — |
| 结构/样式来源 | `.page/.page-head/.page-title/.page-desc/.page-actions`，22px/600 + 右侧 actions ✅ | `.card`(1px `--card-bd`+`--card-radius`)/`.toolbar`/`a-table :pagination="false"`/`.table-foot`(「第 N 页 · 每页 M 条」+ a-pagination small)/`.empty` 三件套 ✅；表格样式全 `:deep()` ✅ | `<span class="tag tag-{tone}">[<i class="tag-dot">]text` ✅；6 色调全走 `--status-*` |
| 不内置请求 | — | ✅ `@page-change` 只抛页码 | — |

**契约差异（2 处，均为 captain 建单的加法，不破坏既有契约）**

1. **ListPage `change` 事件**（T9 建单）：`emit('change', pagination, filters, sorter)` 三参原样透传，用于 ReviewClass 官方排序（替换 T3 的 DOM 观察适配层，适配层已 0 残留）。
2. **ListPage `stickyContainer` prop**（T10 建单，默认 null → 解析 `.content`）：粘性表头滚动宿主；13 页零配置生效，既有 prop 默认值未变。

> 次要说明：`rowKey` 类型 `[String, Function]`（契约未限定类型，不算偏差）；`emptyActionText` 为空时不渲染按钮（三件套降级）。

---

## 4. captain 指定 4 个高风险点（实测结论）

| # | 风险点 | 实测方法 | 结果 |
|---|---|---|---|
| 1 | **粘性表头是否真粘住且不被顶栏遮挡** | admin/Schools（120 条、每页 50），把 `.content` 滚 400px 后读几何 | ✅ 粘性层 `top=56`，顶栏 `bottom=56` → **严丝合缝、无遮挡无缝隙**；`.card` 带 `is-stuck`，`.ant-table-sticky-holder` 阴影 `rgba(16,24,40,0.18) 0 6px 12px -8px`（`--table-sticky-shadow`）；回顶后阴影消失。证据截图 `evidence/sticky-header-scrolled.png` |
| 2 | **侧栏「评分审核」徽标与审核页同源** | 同一次会话读 `.sider-badge` 与 `/teacher/pending-summary` | ✅ 徽标 = **3** = 接口 `pendingReview` = 3；审核页同屏出现「待审核 3 人」。教师端「作业管理」KPI 待审核提交也同为 4/3（与徽标同源、随数据实时变化） |
| 3 | **学生端四态筛选 / 倒计时 / 行点击真可用** | 真人操作（无 mock） | ✅ 四态计数 全部 20 / 未完成 4 / 已完成 14 / 已出分 2；倒计时 20 个 `.countdown`（「（已截止）」走 `tone-overdue` 红色）；点击卡片 → `/student/assignments/308/project/355`；键盘 Enter 同效；关键词搜索 → `/student/assignments?keyword=测试` 且卡片数变化；0 页面错误 |
| 4 | **表格 @change 排序真带动服务端参数** | ReviewClass 点「学号」表头 | ✅ 重新取数：`/teacher/review-class/123?assignmentId=272&page=1&pageSize=20&filter=all&sortField=studentNo&sortOrder=ascend&schoolId=3453`（T9 后走 antd 官方 `@change`，DOM 适配层已删） |

---

## 5. 逐页核对（14 页）

「功能未变核对」三件套：① **接口调用集合** HEAD 版 vs 当前版逐字比对（脚本 `apicalls.cjs`，结论均为 *identical call sites*，Questions 为参数对象重构 + 可选 keyword）② 真实后端关键交互实测 ③ 旧 UI(:5173) 同账号数据行数对照（两版都含 `.ant-table-measure-row` 1 行，下表按**数据行**计）。

| # | 页面 | 改动点 | 功能未变核对项（实测） | 截图 | 结论 |
|---|---|---|---|---|---|
| 1 | teacher/Questions（T1 参考页） | DataTable → PageShell+ListPage+StatusTag；服务端关键字搜索；空态双文案；「共 N 道」 | 接口 2→2；4 行数据、表头 6 列、类型/难度 StatusTag 色正确；搜索「zzz-verify-keyword」→ 空态「没有符合条件的题目」+ 清空筛选；0 错误 | `teacher-questions.png` | ✅ |
| 2 | teacher/Classes | 三件套；前端切片分页（TODO P1-7）；操作列右对齐；团队共享 StatusTag(accent)；切换学校弹窗 | 接口 6→6（identical）；1 行数据（该账号本班数）；行操作「编辑 / 删除(popconfirm)」；团队共享班级按钮 disabled 原逻辑；0 错误 | `teacher-classes.png` | ✅ |
| 3 | teacher/Students | 三件套；班级必选 + 空态「请先选择班级」；姓名搜索（服务端 keyword）；批量导入弹窗；待补全 StatusTag(warning)；12 处内联色令牌化 | 接口 8→8；选班后 11 行、再搜「张」→ `/teacher/students?classId=123&keyword=张&schoolId=3453`；导入弹窗含「下载模板 + 拖拽区」；编辑弹窗 label [学号/姓名/班级/重置密码] + 「重置为学号」二次确认文案；未选班时按钮禁用；0 错误 | `teacher-students.png`、`evidence/teacher-students-import.png`、`evidence/teacher-students-edit-modal.png` | ✅ |
| 4 | teacher/Teams | PageShell+ListPage（无状态列→不造 StatusTag）；操作列右对齐；前端切片 | 接口 4→4；空态「还没有教学团队」+ 主操作「创建团队」；行操作 管理/删除/退出 两分支（T3 实测）；0 错误 | `teacher-teams.png` | ✅ |
| 5 | teacher/Assignments | 试点页内联实现迁到 ListPage；#kpi 三卡；筛选/搜索/分页；锁定/解锁；状态 StatusTag(dot)；截止 deadlineInfo | 接口 6→6；5 行数据（旧 UI 5 行）；KPI 5/4/0（待审核与徽标同源）；锁定按钮 → `PUT /teacher/assignments/272/lock?schoolId=3453`（拦截验证，未改数据）；3 步向导 [选题/选班/设置时间]；0 错误 | `teacher-assignments.png`、`evidence/teacher-assignments-wizard.png` | ✅ |
| 6 | teacher/Review | 三件套；表头左对齐；中列宽调整；状态 StatusTag；socket 保留；空态「查看所有班级」 | 接口 3→3；5 行数据（旧 UI 5 行）；5 个 `.info-cell` 三行信息块；「审 核 / 导 出」按钮；WebSocket `ws://localhost:3000/socket.io/?EIO=4&transport=websocket` 已连；0 错误 | `teacher-review.png` | ✅ |
| 7 | teacher/ReviewClass | 三件套；页头副标题「班级名 · 练习模式」；排序回官方 `@change`（T9）；行内改分保留；批量审核/发布；socket | 接口 5→5；11 行数据（total=11）；标题=作业名「宠物实训」、副标题=班级名；点表头 → 服务端 `sortField/sortOrder`；`.score-val` 点击进入编辑态；「一键发布」二次确认「发布后学生将能看到分数和评语…」；socket 已连；0 错误 | `teacher-reviewclass.png`、`evidence/teacher-reviewclass-score-edit.png`、`evidence/teacher-reviewclass-publish-confirm.png` | ✅ |
| 8 | admin/Schools | 三件套；层次 StatusTag（本科 brand/专科 neutral）；每页条数切换保留（toolbar-right a-select）；前端切片 | 接口 1→1；50 行数据（旧 UI 50 行）、分页 58 页、翻页为前端切片；每页 50→100 切换后 100 行且回第 1 页；0 错误 | `admin-schools.png` | ✅ |
| 9 | admin/Classes | 三件套；学校 StatusTag(neutral)；新增/编辑弹窗；删除 popconfirm；前端切片 | 接口 6→6；16 行数据（旧 UI 16 行）；0 错误 | `admin-classes.png` | ✅ |
| 10 | admin/Teachers | 三件套；学校 StatusTag；新增/编辑弹窗；重置密码/删除 popconfirm；自删保护；前端切片 | 接口 6→6；6 行数据（旧 UI 6 行）；「确定重置该教师密码？」popconfirm；0 错误 | `admin-teachers.png` | ✅ |
| 11 | admin/Students | 三件套；班级 StatusTag；新增弹窗；空态三件套；前端切片 | 接口 3→3；20 行数据（旧 UI 20 行）、翻页正常；0 错误 | `admin-students.png` | ✅ |
| 12 | admin/Monitor | PageShell + StatusTag（自动刷新态、PM2 状态）；日志区令牌化（旧 5 处 hex 清零） | 接口 1→1；PM2 7 列表格保留；`a-switch` 切换「自动刷新 开→关」；「手动刷新」触发第 2 次 `/admin/monitor`；0 错误 | `admin-monitor.png` | ✅ |
| 13 | student/Assignments | **卡片变体**（预批准）；四态筛选；倒计时；共 N 项；空态主操作；卡片键盘可达 | 接口 1→1；20 张卡片、5 种 StatusTag 色；四态筛选 20/4/14/2；倒计时 20 处；关键词搜索服务端参数；点击/Enter 进入 `/student/assignments/308/project/355`；0 错误 | `student-assignments.png` | ✅ |
| 14 | student/Scores | 三件套（DataTable+a-empty → ListPage）；前端切片；分数语义色（--score-*） | 接口 1→1；3 行数据（旧 UI 3 行）；分数档位色 `is-fail` 等命中；0 错误 | `student-scores.png` | ✅ |

**合计：14/14 通过。**

### 5.1 页面运行期健康度（`final-report.json`）

- 14 页 × (`pageerror` / `console error` / HTTP ≥400) = **全 0**。
- 空态：13 个列表页至少 1 处空态三件套；实测命中 3 类文案——「请先选择班级」（无前置条件）、「还没有教学团队 / 还没有收到作业」（无数据 + 主操作）、「没有符合条件的…」+「清空筛选」（无搜索结果）。
- 加载态：ListPage `loading` 透传 a-table（13 页均传）；学生卡片列表用 `a-spin`。

---

## 6. 侧栏骨架与全局尺度（T2 / T7 / T8 / T10）

| 检查项 | 期望 | 实测（三端分别登录） | 结论 |
|---|---|---|---|
| 侧栏宽度 / 折叠 | 232 / 64，令牌驱动 | `width=232`（`style.width=var(--layout-sider-w)`），折叠后 64 | ✅ |
| 密度分档 | 教师/管理 compact，学生 comfortable | `[data-density]` = compact / compact / comfortable | ✅ |
| 页面标题 / 正文 | 22px / 14px | `.page-title` 22px、`.page-desc` 14px、`.page` 14px | ✅ |
| 圆角尺度 | 卡片 12 / 标签 6 / 弹窗 16 / 按钮·输入 8 | 12px / 6px / 16px（教师向导 + admin 新增教师两处弹窗）/ 8px | ✅ |
| 侧栏分组 | 教师「教学/组织」，管理「组织/系统」，学生按 IA 保持 2 项 | 实测一致（教师 6 项、管理 6 项、学生 2 项） | ✅ |
| 待审核徽标 | 与 `/teacher/pending-summary` 同源 | 徽标 3 = 接口 `pendingReview` 3（同屏复核） | ✅ |
| 标签几何 | `--tag-h` 22px / `--tag-radius` 6px | 22px / 6px | ✅ |
| `!important` 收口（T7） | style.css = 0 | 0（原 4 处已清） | ✅ |

> 三端 shell 截图：`evidence/shell-teacher-badge.png`、`evidence/modal-scale-teacher.png`、`evidence/modal-scale-admin.png`。

---

## 7. 有意变更 vs 回归

### 7.1 有意变更（captain **预批准**，不计回归）

| 范围 | 变更 | 判定依据 |
|---|---|---|
| 全局 | 数据密度分档（教师/管理 compact、学生 comfortable）改变行高/内距 | captain 预批准 ⑥ |
| 全局 | 尺度切换：正文 14px、卡片圆角 12、弹窗 16、标签 6 | captain 预批准 ⑦（本报告 §6 实测一致） |
| T5 学生端 | ① Assignments 表格→卡片列表（05-page-specs #21「T1 卡片变体」）② 练习标记 a-tag green→StatusTag accent ③ 状态徽标移至卡片标题行 ④ 去掉装饰性 FieldTimeOutlined ⑤ 新增「共 N 项」/空态主操作/截止倒计时/卡片键盘可达（Enter/Space） | captain 预批准 ①–⑤ |
| T3 教师端 | ① 表格列 align:center → 左对齐 ② 状态列 a-tag → StatusTag tone（green→success/blue→brand/red→danger/default→neutral 语义一一对应）③ ReviewClass 副标题承载「班级名 · 练习模式」④ Teams 无状态列故不使用 StatusTag ⑤ ReviewClass「待评分」自绘 spinner → StatusTag dot | captain 预批准（补发清单 ①–⑤） |

### 7.2 有意变更（实现方声明、**未在预批准清单逐条列出**，建议 captain 追认）

| 来源 | 变更 | 影响评估 |
|---|---|---|
| T3 (e) | 前端切片页当 `total ≤ pageSize` 时仍显示底部「第 N 页 · 每页 M 条」栏（改前 DataTable 会整栏隐藏） | 纯视觉；翻页能力不变。建议 Wave 2 给 ListPage 加 `hideFooterWhenSinglePage` 之类开关，或接受现状 |
| T3 (d)/T4 (b) | 操作列/numerical 列右对齐；关联实体（学校/班级）由纯文本或 a-tag → StatusTag(neutral) | 符合 05-page-specs「行操作右对齐」；无功能影响 |
| T4 (a)/T3 | 页头新增一句 description（Classes/Teachers/Students/Monitor 等） | 纯文案，符合 T1 模板「标题 + 一句话描述」 |
| T4 (c) | Schools 在 #toolbar-right 用 a-select 保留「每页 20/50/100/200」切换（ListPage 契约无 size changer） | 保住改前能力，实测 50→100 生效；建议 Wave 2 把 size changer 纳入 ListPage |
| T1 | Questions 新增服务端关键字搜索 + 两类空态 + 「共 N 道」 | 属 09-brief §3「参考页要演示筛选控件」的示范实现，非额外功能 |
| T5 | Scores 分数语义色档位（≥90/75/60） | 05-page-specs #23 明确要求「分数用 `--score-*` + `.tnum`」 |

### 7.3 回归（阻断项）

**0 项。** 判定依据：

1. **接口调用集合逐字一致**：14 页的 `request.*` 调用（方法 + URL + 参数对象）HEAD vs 当前逐条比对，除 Questions 的 `params` 变量重构（新增可选 keyword）外全部 *identical*。
2. **数据行数与旧 UI 一致**（同账号同后端，两版各含 1 行 `.ant-table-measure-row`）：questions 4=4、classes 1=1、teams 1=1、assignments 5=5、review 5=5、admin schools 50=50、classes 16=16、teachers 6=6、students 20=20、monitor 1=1、student scores 3=3；student/Assignments 为**有意**的卡片变体（旧 21 行表格 → 20 张卡片，卡片化已预批准）。
3. **交互/能力保留实测**：删除确认（popconfirm 文案与 okText 保留）、锁定/解锁、行内改分、批量审核/发布确认、导入导出入口、socket 实时刷新、排序持久化（reviewStore）、权限分支（Teams 管理/退出、Students 团队班只读、Teachers 自删保护）、分页能力（服务端分页页 2 取数 + 前端切片页）。
4. **0 页面错误**：14 页 `pageerror`/`console error`/HTTP ≥400 全 0。

---

## 8. 未达标项 / 需要 captain 决策的事项

> 均**不阻断** Wave 1 判定；建议按标注归属处理（部分已进收口池）。

| # | 项 | severity | 说明与建议 |
|---|---|---|---|
| ① | 令牌纯度残留 4 处 | low | `teacher/Students.vue` 2 处 `font-size:48px`（装饰图标尺寸，无对应令牌）；`teacher/Assignments.vue` 2 处 `font-size:14px/12px`（`.pick-panel-title`/`.pick-check`，可换 `--fs-body`/`--fs-caption`）。不影响验收口径（无 hex/无 !important/无写死圆角） |
| ② | 全仓 `!important` 仍 24 处（Wave 1 范围 0） | low | 分布在未迁移页：Doc 6、ReviewDetail 4、Submit 4、DataTable 4（死代码，R-7）、ProjectReviewNew 2、QuestionEdit/ProjectQuestionEdit/AiConfig 各 1；另有 `legacy-patch.css` 19 处（Chrome 69 兜底文件，文件头明确以 `!important` 为手段）。与 05-page-specs「目标 0」的差距属 Wave 2/3 |
| ③ | 时间格式未统一（**R-4**） | low | 14 页仍呈现 `2026/8/24 19:01`（`formatDateTime`）；Wave 0 计划「Wave 1 统一为 2026-08-24 19:01」。因 `client/src/domain/**` 属本轮「谁都不要碰」边界，实现者无权改。**请 captain 决策**：并入 Wave 1 收尾（一次性切 formatDateTime）或留 Wave 4 |
| ④ | 「错」态未做页面级处理 | low | 05-page-specs §4 Wave 1 验收写「空/载/错三态齐备」；实测 14 页空态/加载态齐备，但**列表请求失败仍是全局 `message.error`**（与改前一致，非新增回归）。建议 captain 明确「错态」是否纳入 Wave 2（ListPage 加 `error` 插槽） |
| ⑤ | student/Assignments 前端切片缺 `TODO(P1-7)` 标记 | info | 其余 9 处前端切片页均有该注释，学生页用的是等价文字说明；1 行注释统一即可（不影响功能） |

---

## 9. 证据索引

### 9.1 截图（`docs/ui-redesign/preview/shots/wave1/`，全部 1440×900）

| 文件 | 内容 |
|---|---|
| `teacher-questions.png` / `teacher-classes.png` / `teacher-students.png` / `teacher-teams.png` / `teacher-assignments.png` / `teacher-review.png` / `teacher-reviewclass.png` | 教师端 7 页 |
| `admin-schools.png` / `admin-classes.png` / `admin-teachers.png` / `admin-students.png` / `admin-monitor.png` | 管理端 5 页 |
| `student-assignments.png` / `student-scores.png` | 学生端 2 页 |
| `evidence/sticky-header-scrolled.png` | **粘性表头**：滚动 400px 后表头停在 y=56（顶栏下沿）+ 投影 |
| `evidence/teacher-assignments-wizard.png` | 布置作业 3 步向导 |
| `evidence/teacher-students-import.png` / `evidence/teacher-students-edit-modal.png` | 批量导入弹窗 / 编辑弹窗（重置密码二次确认） |
| `evidence/teacher-reviewclass-score-edit.png` / `evidence/teacher-reviewclass-publish-confirm.png` | 行内改分编辑态 / 一键发布确认 |
| `evidence/modal-scale-teacher.png` / `evidence/modal-scale-admin.png` | 弹窗尺度（圆角 16px） |
| `evidence/shell-teacher-badge.png` | 教师端侧栏分组 + 待审核徽标 |

### 9.2 原始数据（`/tmp/wave1-verify/`，可复跑）

| 文件 | 内容 |
|---|---|
| `final-report.json` | 14 页 DOM/网络/控制台/交互采集（含每页 headers、tags、KPI、分页、错误） |
| `final-scale.json` | 三端 shell/尺度/密度/徽标 |
| `final-interactions.json` | 13 项交互断言（全通过） |
| `final-probes.json` | 9 项定向探针（全通过） |
| `final-static.json` | 逐文件 hex/rgba/!important/var/Chrome69 统计 |
| `final-build.log` | 构建输出（exit 0） |
| `report-old.json` | 旧 UI(:5173) 对照采集 |
| `final4-sticky.log` | 粘性表头几何证据 |

---

**签名**：verifier ｜ 本报告为独立复跑结论，未采纳任何实现者的自测结果作为通过依据（实现者结论仅用于确定「应核对哪些交互」）。

---

## 10. captain 最终验收（独立于本报告）

> 原则：**不采信验收结论本身**，只采信可复算的数字与可复看的证据。

### 10.1 数字交叉校验（口径还原）

captain 与 verifier 两套独立测量结果**完全对得上**，差异只来自统计口径：

| 指标 | captain 测（全量） | verifier 报 | 还原 |
|---|---|---|---|
| hex 命中 | 309（`.vue` + `.css`） | 238 | 309 − 71（`tokens.css` 52 + `style.css` 18 + `legacy-patch.css` 1）= **238** ✅ 即「仅 .vue」 |
| `!important` | 45（含注释与 legacy） | 24 | 45 − 19（`legacy-patch.css`，by design）− 2（`overrides.css`/`App.vue` 的**注释文字**）= 24；captain 另计 1 处 = `tokens.css` 的 `prefers-reduced-motion` 强制降级（可访问性必需，非债） |

**14 页 + 3 组件逐文件复核：hex=0、!important=0**（captain 独立跑，与报告 §2 一致）。

### 10.2 设计向验收（报告未覆盖的维度）

报告验的是「功能与回归」，captain 另抽看截图做设计一致性核对：

| 截图 | 核对点 | 结论 |
|---|---|---|
| `wave1/admin-schools.png` | 侧栏分组（组织/系统）、表头左对齐无竖线、`StatusTag` 层次标签、底部「第 1 页 · 每页 50 条」+ 分页、`#0b0f16` 侧栏 | ✅ 与设计稿一致 |
| `wave1/student-assignments.png` | 卡片变体、四态标签（已出分/已批改/已提交/已过期）、元信息行（共 N 题 / 起止时间 / 已截止红字）、工具栏（搜索+四态筛选+共 20 项） | ✅ 与设计稿一致 |

### 10.3 追认报告 §7.2 的 6 项（未在预批准清单内）

全部**追认**：单页仍显示分页栏（记入 R-9 评估）、操作列右对齐、关联实体用 StatusTag(neutral)、页头新增 description、Schools 保留每页条数切换（记入 R-9）、Questions 的搜索/空态/计数（属参考页示范）、Scores 分数语义色（05-page-specs #23 要求）。

### 10.4 captain 对报告 §8 五项决策

| # | 项 | 决策 |
|---|---|---|
| ① | 令牌纯度 4 处 | 12/14px 两处（`teacher/Assignments.vue`）**并入 T11 令牌化**；48px 装饰图标**保留字面量**（无对应语义令牌，属一次性尺寸，不为它扩令牌表） |
| ② | 全仓 `!important` 24 处 | 确认为 **Wave 2/3 范围**（全部在未迁移页 + `legacy-patch.css` by design），不阻断 |
| ③ | 时间格式 R-4 | 定为 **Wave 4**：跨 20+ 页的横切变更，且未迁移页仍是旧格式，现在切会造成新旧混杂并给 Wave 2/3 每轮视觉验收叠加噪声 |
| ④ | 「错态」口径 | **纳入 Wave 2**，与 R-1（`request.js` silent 选项）同批——两者同属「请求与反馈层」，一次做完 |
| ⑤ | student/Assignments 缺 `TODO(P1-7)` | **并入 T11**（1 行注释，与其余 9 页措辞统一） |

### 10.5 最终判定

**通过（Pass）。** 依据：① 构建 exit 0；② 14 页 + 3 组件硬约束全 0；③ 4 个高风险点实测通过（粘性表头真实吸附、徽标与审核页同源、学生端四态可用、排序真正带参）；④ 回归 0；⑤ 数字与 captain 独立测量完全可还原；⑥ 设计向抽验一致。

**遗留归属**：R-4 → Wave 4；R-8（令牌纯度剩余）→ 已并入 T11；R-9（分页栏单页显示 + ListPage 纳入 size changer）→ Wave 2；「错态」→ Wave 2；`!important` 24 处 → Wave 2/3。

**签名**：captain ｜ 17:2x
