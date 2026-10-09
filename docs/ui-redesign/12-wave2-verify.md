# Wave 2 独立验收报告（T16）

> 验收人：verifier（独立于全部实现者）｜ 对象：Wave 2 全部产出（t11 收尾 / t12 构件 / t13 共享层收口 / t14 教师端表单页 / t15 对话框统一 / t17 locale 修复）
> worktree：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`，HEAD `7ea684f`；Wave 2 实现为工作区未提交状态，本报告针对该状态）
> 验收时间：2026-10-09 19:38–20:00 ｜ 依据：`11-wave2-brief.md` §1/§2（含 rev2）/§3/§5 + `05-page-specs.md`
> 方法：独立复跑（自起 vite :5175 + 真实后端 :3000，**未 mock 业务接口**；仅在「避免改数据」时才用 Playwright 路由拦截，且拦截点已逐条注明）

## 0. 结论摘要

| 维度 | 结论 | 证据 |
|---|---|---|
| 构建 | ✅ `npm run build` exit 0 | `/tmp/wave2-verify/build.log` |
| 3 个构件 API（rev2） | ✅ 与 11-wave2-brief §2 一致（含 `schedule()`、`saveNow(): Promise<boolean>`、useConfirm 的 thenable 代理与 danger 显式绑 `--red-600`） | §3 |
| useConfirm 行为等价性 | ✅ async onOk loading、失败保持打开、danger 红、无 unhandled rejection | §4 |
| useDraftAutosave 节拍 | ✅ QuestionEdit 2s / TeamEdit 300ms（与改前一致），状态机 idle/saving/saved/error 可用 | §5 |
| request.js silent | ✅ 失败不弹提示但仍 reject；401/鉴权/schoolId 注入不变；非静默对照仍弹提示 | §6 |
| ListPage 新能力 | ✅ 三开关默认关闭 → 13 个列表页现状不变；admin/Schools 每页条数已收回组件 | §7 |
| DataTable 删除 | ✅ 文件已从仓库删除（HEAD `7ea684f`，-322 行），全仓 0 引用 | §8 |
| 11 页 Modal 规范化 | ✅ 宽度 ∈ {480,640,820}（t15 范围）、危险操作 danger、popconfirm 文案规范 | §9 |
| **antd 中文 locale（rev2 新增）** | ✅ 「N 条/页」、Select「暂无数据」、Table「暂无数据」、DatePicker「开始日期/结束日期」 | §10 |
| 逐页回归 | ✅ 20/20 页 pageerror 0 / console error 0 / HTTP≥400 0；13 个 Wave 1 列表页行数与标题逐页不变 | §11 |
| **回归（阻断项）** | **0 项** | §12 |
| 未达标项 / 待 captain 决策 | 6 项，均为低风险一致性项 | §13 |

**判定：通过（Pass）**，建议进入 Wave 3；§13 的 6 项建议并入收口池。

---

## 1. 验收环境与方法

| 项 | 值 |
|---|---|
| 前端 | worktree 工作区，自起 `npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`，访问 `http://localhost:5175/exam/` |
| 后端 | 主工作区 :3000（真实库 `exam_system`） |
| 账号 | 教师 `test_teacher`；管理 `admin`；团队页（唯一有团队的可用账号）`e2e_teacher`（团队 16） |
| 浏览器 | Playwright 1.60 + Chromium，1440×900 |
| 复跑脚本 | `/tmp/wave2-verify/{pages,locale,interactions,fix2,fix3,fix4,static-w2,apicalls}.cjs` |

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run build
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
node /tmp/wave2-verify/pages.cjs       --base http://localhost:5175 --out docs/ui-redesign/preview/shots/wave2 --json /tmp/wave2-verify/report.json
node /tmp/wave2-verify/locale.cjs      --base http://localhost:5175
node /tmp/wave2-verify/interactions.cjs --base http://localhost:5175
node /tmp/wave2-verify/fix4.cjs        --base http://localhost:5175   # 自动保存节拍 + silent 对照
```

> 数据安全说明：涉及写操作的验证一律用 Playwright 路由拦截（mock 响应），不落库。其中两次拦截因 glob 未匹配到带 `?schoolId=3453` 的 URL 而打到真实后端：`POST /teacher/submissions/batch-publish`（x2）与 `PUT /teacher/teams/16`（x1）。已逐条核验无数据变更：前者后端只在「全部 reviewed」时才写（该作业唯一提交状态为 published，返回「已发布 0 名学生」，实测提交行 reviewed_at 未变）；后者 payload 与库中现状同为 `{teacherIds:[1286,2310]}`（幂等）。核验 SQL 见 §14。

---

## 2. 静态度量（与 captain 台账交叉还原）

### 2.1 全仓横向

| 指标 | Wave 1 后基线 | Wave 2 后实测 | 差值 | 说明 |
|---|---|---|---|---|
| `*.vue` 六位 hex | 238 | **179** | −59 | 残留全在 Wave 3 文件（Submit 45 / Doc 44 / ReviewDetail 41 / ProjectReviewNew 22 / Login 1）与 RichEditor 23、ProjectZipUploader 3 |
| `*.vue` `!important` | 24 | **16** | −8 | 残留全在 Wave 3：Doc 6 / ReviewDetail 4 / Submit 4 / ProjectReviewNew 2；Wave 2 改动文件全 0 |
| `*.vue`+`*.css` `!important` | 45 | **37** | −8 | 另含 `legacy-patch.css` 19（Chrome 69 兜底，按设计保留）、`tokens.css` 1、`overrides.css` 1（注释） |
| `Modal.confirm` 残留 | 11 处 | **3 处** | −8 | 全部位于 Wave 3 文件：`student/Submit.vue:349/802`、`teacher/ReviewDetail.vue:513`（与 captain 口径一致） |
| `components/DataTable.vue` | 死代码 | **已删除** | — | HEAD `7ea684f` 删除 322 行；全仓 0 引用 |
| `components/FormPage.vue` | — | 新增 116 行 | — | 令牌引用 11 |
| `composables/useConfirm.js` | — | 新增 65 行 | — | 令牌引用 2（`--red-600` ×2） |
| `composables/useDraftAutosave.js` | — | 新增 139 行 | — | 纯逻辑 composable，**不适用令牌检查**（captain 口径修正） |

### 2.2 逐文件（Wave 2 改动面，hex / rgba / `!important` / `Modal.confirm` 全 0）

FormPage.vue、ListPage.vue、useConfirm.js、useDraftAutosave.js、request.js、App.vue、三端 Layout.vue、teacher/{QuestionEdit, ProjectQuestionEdit, TeamEdit, Assignments, Students, Teams, Classes, Questions, ReviewClass}.vue、admin/{AiConfig, Classes, Schools, Students, Teachers}.vue、student/{Assignments}.vue —— **全部 0 命中**。

（唯一告警为 ProjectQuestionEdit 第 304 行注释里出现 `:where()` 字样，非实际代码；Chrome 69 禁用特性 0 处。）

---

## 3. 三个构件 API ↔ 11-wave2-brief §2 / rev2 逐条核对

| 契约项 | useConfirm | useDraftAutosave | FormPage |
|---|---|---|---|
| 导出/用法 | `useConfirm()` → `{ confirm }` ✅ | `useDraftAutosave(opts)` → `{ status, lastSavedAt, saveNow, schedule }` ✅ | `<FormPage …>` ✅ |
| 入参 | `title/content/okText/cancelText/danger/onOk` ✅（`danger` 默认 false） | `save/delay(默认1500)/interval(默认0)/enabled` ✅ | props：`title`(必填)/`description`/`back:{text,to}` ✅ |
| 关键行为 | onOk 返回 Promise → ok 按钮 loading、失败不关闭（由 antd ActionButton 触发，见 §4 实测）✅；**thenable 代理** `silenceDerivedRejection` 消除 antd 派生 Promise 的 unhandled rejection ✅；`danger:true` → `okButtonProps.style` 显式绑 `var(--red-600)` ✅ | `schedule()` 防抖入口 ✅；`saveNow()` 跳过防抖返回 `Promise<boolean>` ✅；`status` 四态 ✅；`visibilitychange` 立即落盘 ✅；`onBeforeUnmount` 清理监听/定时器 ✅ | 复用 PageShell ✅；两栏 ≥1200px + `#panel` 320px sticky ✅；`<1200px` 单列 ✅；`#actionbar` 可选 sticky 动作条 ✅；`#back` 插槽与 `back` prop 双通道 ✅ |
| 槽位 | — | — | `actions / back / panel / actionbar` + 默认 ✅ |

**差异：0 处。**两处「未使用」事实（非契约违反）：`saveNow()` 全仓暂无页面调用；`#panel` 三页均未使用（captain 已裁决接受）。

---

## 4. useConfirm 行为等价性（真实页面实测）

| 断言 | 实测结果 |
|---|---|
| `danger:true` → ok 按钮用 `--red-600` | ✅ `getComputedStyle(okBtn).backgroundColor = rgb(217, 45, 32)`（ReviewClass「确认一键发布全班？」）；弹窗标题/okText「发布全班成绩」 |
| async `onOk` → ok 按钮 loading 且弹窗保持 | ✅ 拦截请求延时 3s：点击后 700ms 时 `.ant-btn-loading` = 1、`.ant-modal-confirm` 仍存在 |
| `onOk` 成功 → 弹窗关闭 | ✅ 延时结束后 `.ant-modal-confirm` = 0 |
| `onOk` 失败（HTTP 500）→ 弹窗保持打开 + loading 复位 | ✅ 2.5s 后弹窗仍在、无 `.ant-btn-loading`、无 pageerror |
| 无 unhandled rejection（thenable 代理） | ✅ 失败路径控制台无 `Uncaught (in promise)`（仅 1 条 500 资源加载错误） |
| 三端 Layout 退出登录改 useConfirm | ✅ teacher/admin 实测弹窗标题/内容不变、okText 由「确定」→「退出登录」，取消后不退出 |

---

## 5. useDraftAutosave 节拍与状态机

| 断言 | 实测结果 |
|---|---|
| QuestionEdit：delay 2s 原样保留 | ✅ 触发后 **2046ms** 出现「已保存」（状态文本来自 `status`，`role="status" aria-live="polite"`） |
| QuestionEdit：改前 `!draftChanged` 闸门语义保留 | ✅ 仅输入（未先发生 saveDraft）→ 状态保持空、0 次网络写、0 次本地保存（与改前 `autoSave(){if(!draftChanged)return;}` 等价） |
| QuestionEdit：无新增网络写 | ✅ 全流程 0 个非 GET 请求（草稿仍是本地「左栏 → 当前小题」同步） |
| TeamEdit：两个通道 delay 300ms | ✅ 选中未选教师后 **447ms** 内发出 PUT，payload `{"teacherIds":[1286,2310,1274]}`（与改前 `[createdBy, ...selectedTeachers]` 口径一致，经 mock 未落库）；状态文本「已同步 19:50」 |
| TeamEdit：取消选中拦截确认 | ✅ 由 watch 触发 useConfirm（title「移除团队教师」、说明影响范围、`danger:true`、okText「移除教师」） |

---

## 6. request.js silent（R-1）

| 断言 | 实测结果 |
|---|---|
| silent 请求失败不弹全局 toast | ✅ 拦截 `/teacher/pending-summary` 500：页面加载后 `.ant-message-notice` = 0，无 pageerror |
| silent 仍 reject（调用方可处理） | ✅ 源码 `businessError()` 构造与 axios 同形状 Error（`err.response.data` 可读）；Layout 侧 try/catch 静默 |
| 非静默对照仍弹 toast（silent 是 opt-in） | ✅ 拦截 `/teacher/classes` 500 → 轮询捕获到 1 条 toast |
| 401 跳登录 / Authorization / schoolId 注入不变 | ✅ 源码逐条核对；三端 Layout 徽标请求实测带 `?schoolId=3453` 与 Authorization（统一入口注入） |
| 三端徽标仍与审核页一致 | ✅ 侧栏徽标 3 = `/teacher/pending-summary` `pendingReview` 3 = 审核页「待审核 3 人」 |
| 派生 axios 实例已删 | ✅ `grep -c 'request.create'` 三端 Layout = 0（teacher Layout 改为 `request.get(..., { silent: true })`，接口集合 2→3 仅此一处新增） |

---

## 7. ListPage 新能力与 13 页现状

| 断言 | 实测结果 |
|---|---|
| 三开关默认关闭 | ✅ 源码 `showSizeChanger=false / hideOnSinglePage=false / error=''`（均为新增 prop 且默认关闭） |
| 13 个列表页分页栏常显、无每页条数切换 | ✅ teacher/questions 4 行数据时 `.table-foot` 仍在、`.ant-pagination-options` = 0；13 页逐页行数/标题与 Wave 1 报告完全一致（§11） |
| 无错误态渲染（未传 error） | ✅ `.errored` = 0 |
| admin/Schools 每页条数收回组件 | ✅ 选项 20/50/100/200「N 条/页」；选 100 → 100 行 + 页脚「第 1 页 · 每页 100 条」+ 回第 1 页；页面内兜底 a-select 已删 |
| 错误态/重试（组件层） | ✅ 由 t13 自测 + 源码核对：`error` 传值 → `role="alert"` + 重试按钮 + 表头保留 + `data-source` 置空；本报告未在真实页面强制造错（无页面传 error） |

---

## 8. DataTable 删除与残留

| 断言 | 实测结果 |
|---|---|
| 文件已删除 | ✅ `client/src/components/DataTable.vue` 不存在；HEAD `7ea684f` 记录删除 322 行 |
| 全仓 0 引用 | ✅ `grep -rn 'components/DataTable' client/src` = 0（仅剩 3 处注释型提及「与改前 DataTable 行为一致」） |

---

## 9. 对话框规范化（t15 的 11 页）

| 断言 | 实测结果 |
|---|---|
| Modal.confirm → useConfirm | ✅ `grep -rn 'Modal.confirm' client/src/views` = 3，全部在 Wave 3 文件（Submit×2、ReviewDetail×1）；Wave 2 的 11 页为 0 |
| `a-popconfirm` 文案规范（title「确认…？」+ description 影响范围 + okText 动词 + 危险 danger） | ✅ 9 处逐一核对（teacher Students/Teams/Classes/Questions、admin Classes/Teachers 等）；ok 按钮 danger 用 `:ok-button-props="{ danger: true }"` |
| Modal 宽度档位 ∈ {480,640,820} | ✅ t15 范围内实测：admin/Teachers 640、admin/Students 480、teacher/Students 480/640、teacher/Assignments 820（原 1040 收敛） |
| 危险操作 danger 用法 | ✅ 删除班级/教师/学生/题目/团队、重置密码、批量发布均 danger；破坏性文案写明影响范围 |

---

## 10. antd 中文 locale（captain rev2 新增断言）

| 断言 | 实测结果 |
|---|---|
| **分页「每页条数」下拉为中文**（核心断言） | ✅ `20 条/页 | 50 条/页 | 100 条/页 | 200 条/页`（admin/Schools，截图 `evidence/locale-pagesize-cn.png`） |
| Table 空态中文 | ✅ 原生 Empty 描述「暂无数据」（TeamEdit 班级管理 tab 空表，`evidence/locale-table-empty-cn.png`） |
| Select 无数据中文 | ✅ 「暂无数据」（admin/Teachers 新增弹窗搜索不存在学校，`evidence/locale-select-empty-cn.png`） |
| DatePicker 占位中文 | ✅ RangePicker 两个占位 = 「开始日期」「结束日期」（教师端向导第 3 步，页面自带 `es/date-picker/locale/zh_CN`，`evidence/locale-datepicker-cn.png`） |
| 修复根因 | ✅ `App.vue` 由 `ant-design-vue/locale/zh_CN` 改为 `ant-design-vue/es/locale/zh_CN`（CJS interop 包装对象导致 ConfigProvider 取不到 `locale.Pagination`） |

---

## 11. 逐页核对（Wave 2 改动页 + 回归抽验）

> 截图目录 `docs/ui-redesign/preview/shots/wave2/`（20 张 1440×900）＋ `evidence/`（12 张关键行为证据）。
> 「接口不变」= HEAD 版 script 段 `request.*` 调用集合 vs 当前版逐字比对（`apicalls.cjs`）。

| # | 页面 | 改动点 | 功能未变核对项（实测） | 截图 | 结论 |
|---|---|---|---|---|---|
| 1 | teacher/QuestionEdit | FormPage 外壳（title/back/actionbar 状态文本）；2 处 Modal.confirm→useConfirm；自动保存改 useDraftAutosave(delay 2000)；删原满屏容器改 `calc(100vh-300px)` | 接口 5→5 identical；动作条 [取消/查看 AI 提示词/保存] 齐全；小题标签 3 个可切换；状态文本 2s 节拍「已保存」；0 错误 | `teacher-questions-edit.png`、`teacher-questions-edit-new.png` | ✅ |
| 2 | teacher/ProjectQuestionEdit | FormPage；原页头左组→`.meta-row`、右组→`#actions`；`.ide-stage` 高度收敛；双角色（学生模式 :back=null） | 接口 7→7 identical；0 处 Modal.confirm（原本就无）；新建/编辑两态渲染正常；0 错误 | `teacher-project-edit.png`、`teacher-project-edit-new.png` | ✅ |
| 3 | teacher/TeamEdit | FormPage；两条 300ms 通道各接 useDraftAutosave；2 处 watch 拦截取消选中改 useConfirm(danger) | 接口 5→5 identical；PUT payload 口径 `[createdBy, ...selected]` 不变（mock 实测 `{"teacherIds":[1286,2310,1274]}`）；状态文本「改动会自动保存 → 已同步 HH:mm」；0 错误 | `teacher-teamedit.png`、`evidence/teamedit-autosave-300ms.png` | ✅ |
| 4 | admin/AiConfig | FormPage 单栏；保存反馈改页内 aria-live；内联字号/死令牌清理；`.concurrency-active-row` 全局样式改 scoped；测试连接弹窗 480 | 接口 4→4 identical；`role="status" aria-live="polite"` 存在；保存（mock 响应）后文本「模型配置已保存，1 分钟内生效」且全局 toast = 0；`.fp-panel` = 0（单栏）；0 错误 | `admin-aiconfig.png`、`evidence/aiconfig-aria-live-saved.png` | ✅ |
| 5 | teacher/Assignments | 2 处 Modal.confirm→useConfirm（开放性布置/练习模式，danger 仅练习模式）；向导 Modal 1040→820 | 接口 6→6 identical；向导三步正常；0 错误 | `teacher-assignments.png` | ✅ |
| 6 | teacher/Students | 1 处 useConfirm（修改学号）；popconfirm 文案规范（删除学生/重置密码 danger） | 接口 8→8 identical；0 错误 | `teacher-students.png` | ✅ |
| 7 | teacher/ReviewClass | 批量发布改 useConfirm（okText「发布全班成绩」+ danger） | 接口 5→5 identical；12 行；排序/行内改分入口不变；0 错误 | `teacher-reviewclass.png`、`evidence/confirm-danger-red600.png` | ✅ |
| 8 | teacher/Questions | popconfirm 文案规范（删除题目 danger） | 接口 2→2 identical；4 行；搜索空态不变；0 错误 | `teacher-questions.png` | ✅ |
| 9 | teacher/Teams / teacher/Classes | popconfirm 文案规范（删除/退出团队、删除班级 danger） | 接口 4→4 / 6→6 identical；0 错误 | `teacher-teams.png`、`teacher-classes.png` | ✅ |
| 10 | admin/Classes / admin/Teachers / admin/Students | popconfirm 文案规范；Modal 宽度 640/640/480 | 接口 6→6 / 6→6 / 3→3 identical；0 错误 | `admin-classes.png`、`admin-teachers.png`、`admin-students.png` | ✅ |
| 11 | admin/Schools | 页面内兜底 a-select 删除，改用 ListPage 每页条数能力 | 接口 1→1 identical；50→100 切换生效、回第 1 页；0 错误 | `admin-schools.png`、`evidence/schools-pagesize-100.png` | ✅ |
| 12 | admin/Monitor | 本批无改动（T15 核对后确认无需改） | 接口 1→1；页面渲染/开关不变；0 错误 | `admin-monitor.png` | ✅ |
| 13 | 三端 Layout | 徽标派生实例删除改 silent；退出登录改 useConfirm | teacher Layout 接口集合 2→3（新增 silent 参数）；admin/student Layout 接口不变；0 错误 | 见 §6 | ✅ |
| 14 | student/Assignments / student/Scores / student/Layout | 仅 Wave 1 收尾（TODO 注释）与本批 Layout 确认 | 接口 1→1 / 1→1 / 3→3 identical；渲染与 Wave 1 一致；0 错误 | `student-assignments.png`、`student-scores.png` | ✅ |
| 15 | 13 个 Wave 1 列表页（回归抽验） | 无结构改动，但受 ListPage/静默/locale 影响 | **行数与标题逐页与 Wave 1 报告完全一致**（questions 5 / classes 2 / students 2 / teams 2 / assignments 6 / review 6 / reviewclass 12 / admin schools 51 / classes 17 / teachers 7 / students 21 / monitor 1 / student scores 4，均为含 measure-row 的 tbody 行数）；0 错误 | 同名截图 | ✅ |

---

## 12. 有意变更 vs 回归

### 12.1 有意变更（本批目标或实现方声明，不计回归）

| 来源 | 变更 | 说明 |
|---|---|---|
| 本批目标 | Modal.confirm → useConfirm、自动保存节拍统一到构件、FormPage 外壳、AiConfig 单栏、分页栏能力、silent、DataTable 删除 | 11-wave2-brief §0/§2/§4 |
| t14 声明 | QuestionEdit 满屏容器改 `calc(100vh - 300px)`；页头信息重组为 `.meta-row`/`#actions`；`#panel` 三页未用（captain 已裁决接受） | 页面壳迁移的必然结果，非功能变化 |
| t14 声明 | QuestionEdit 状态文本不再 2s 后自动清空（改前 `setTimeout(()=>status='')`） | 视觉差异，状态文本常驻；建议追认 |
| t15 声明 | popconfirm title/description/okText 全量规范化；Modal 宽度三档化；AiConfig 保存反馈由全局 toast 改页内 aria-live | 符合 05-page-specs 与 brief §2 文案规范 |
| t17 声明 | `App.vue` locale 改 `es/` 路径 | 修复全站 antd 内置文案英文（本报告 §10 独立复验） |

### 12.2 回归（阻断项）

**0 项。** 判定依据：

1. **接口调用与参数不变**：17 个改动文件逐个比对 `request.*` 调用集合，除 teacher/Layout 新增 `{ silent: true }` 选项（R-1 目标）外**全部 identical**。
2. **13 个 Wave 1 列表页数据/标题不变**（§11-15）。
3. **自动保存语义等价**：QuestionEdit 的 `!draftChanged` 闸门与改前逐字一致；TeamEdit 两通道 delay 300ms 与 PUT payload 口径不变。
4. **对话框行为等价**：useConfirm 的 loading/保持打开/关闭/取消行为与 antd Modal.confirm 一致（§4），失败路径无 unhandled rejection。
5. **0 运行期错误**：20 页 × (pageerror/console error/HTTP≥400) 全 0。

---

## 13. 未达标项 / 需要 captain 决策的事项

| # | 项 | severity | 说明与建议 |
|---|---|---|---|
| ① | 6 个 `a-modal` 的 `ok-text="确定"` 未动词化 | low | `admin/Students:37`、`admin/Teachers:48`、`admin/Classes:43`、`teacher/Students:67`、`teacher/Classes:51`、`teacher/Teams:51`；另 `teacher/Classes:62` 为「确定切换」。t15 声明「Modal 全部规范化」，但这些是声明式 a-modal 的 ok-text（brief 的「禁止确定」写在 useConfirm 契约下）。建议：Wave 3 收口时一并改动词短语 |
| ② | QuestionEdit 2 处 popconfirm 仍是旧文案 | low | `QuestionEdit:66/135` `title="确定删除？" ok-text="确定"`（t14 文件，不在 t15 范围）。同类删除操作在其它页已统一为「确认删除…？/删除」，建议一并统一 |
| ③ | Modal 宽度未覆盖 t14 两页 | low | QuestionEdit 760/520、ProjectQuestionEdit 720px/820px 不在 480/640/820 三档（t14 的 brief 未要求宽度统一）。建议列入收口池或明确「编辑页宽档允许 520/720/760」 |
| ④ | QuestionEdit 自动保存状态文本不再自动清空 | info | 见 §12.1；如需与改前视觉一致，可在页面侧加 2s 清空（构件不改） |
| ⑤ | `saveNow()` 契约已实现但全仓 0 调用 | info | 页面保存按钮仍走各自的 `doSave`；构件 API 已提供，Wave 3 的 Submit 迁移时再评估是否需要页面接入 |
| ⑥ | 令牌纯度收尾（Wave 1 遗留 R-4/§8）未在本批处理 | info | 时间格式仍为 `2026/8/24 19:01`（R-4，需 captain 决定批次）；`teacher/Assignments` 字号字面量已全部清零（复核 grep `font-size:\s*[0-9]+px` = 0），仅 `teacher/Students` 保留 2 处 `48px` 装饰图标字号（无对应令牌） |

---

## 14. 证据索引

### 14.1 截图（`docs/ui-redesign/preview/shots/wave2/`，全部 1440×900）

| 文件 | 内容 |
|---|---|
| `teacher-questions-edit.png` / `teacher-questions-edit-new.png` | 题目编辑页（编辑/新建态，FormPage 两栏 + 动作条） |
| `teacher-project-edit.png` / `teacher-project-edit-new.png` | 实训题编辑页（编辑/新建态） |
| `teacher-teamedit.png` | 团队编辑页（FormPage + 两个表 + 状态文本） |
| `admin-aiconfig.png` | AI 配置（FormPage 单栏 + aria-live 状态） |
| `teacher-questions.png` / `teacher-classes.png` / `teacher-students.png` / `teacher-teams.png` / `teacher-assignments.png` / `teacher-review.png` / `teacher-reviewclass.png` | 教师端列表页回归抽验 |
| `admin-schools.png` / `admin-classes.png` / `admin-teachers.png` / `admin-students.png` / `admin-monitor.png` | 管理端列表页回归抽验 |
| `student-assignments.png` / `student-scores.png` | 学生端回归抽验 |
| `evidence/confirm-danger-red600.png` | useConfirm danger=true → ok 按钮 `--red-600` |
| `evidence/confirm-async-loading.png` | async onOk → ok 按钮 loading、弹窗保持 |
| `evidence/confirm-fail-keeps-open.png` | onOk 失败 → 弹窗保持、loading 复位 |
| `evidence/questionedit-autosave-saved.png` | QuestionEdit 2s 后「已保存」 |
| `evidence/teamedit-autosave-300ms.png` | TeamEdit 自动保存 + 「已同步 HH:mm」 |
| `evidence/locale-pagesize-cn.png` / `locale-select-empty-cn.png` / `locale-table-empty-cn.png` / `locale-datepicker-cn.png` | antd 中文 locale 四处抽验 |
| `evidence/schools-pagesize-100.png` | 每页 100 条切换（回第 1 页） |
| `evidence/aiconfig-aria-live-saved.png` | AiConfig 页内 aria-live 保存反馈（无全局 toast） |
| `evidence/silent-no-toast.png` | silent 请求失败：无 toast |

### 14.2 原始数据（`/tmp/wave2-verify/`）

| 文件 | 内容 |
|---|---|
| `report.json` | 20 页 DOM/网络/控制台采集（`pages.cjs`） |
| `locale.json` / `locale.log` | antd 中文 locale 断言 |
| `interactions.json` | useConfirm / autosave / silent / ListPage 断言（含首轮失败项与原因） |
| `fix2.json` / `fix3.json` / `fix4.json` | 修正测试路径后的复核结果（全部通过） |
| `static.json` / `build.log` | 逐文件静态检查 / 构建输出（exit 0） |
| `cmp.cjs` 输出 | Wave 1 ↔ Wave 2 逐页行数/标题对照 |

**数据完整性核验 SQL（只读）**

```sql
-- 批量发布是幂等 no-op：该作业唯一提交仍为 published，reviewed_at 未变（11:08:49）
SELECT id, student_id, status, reviewed_at FROM submissions WHERE assignment_id = 272;
-- 团队 16 成员未变
SELECT tt.teacher_id, u.username FROM team_teachers tt JOIN users u ON u.id = tt.teacher_id WHERE tt.team_id = 16;
```

---

**签名**：verifier ｜ 本报告为独立复跑结论；实现者自测仅用于确定「应核对哪些交互」，不作为通过依据。
