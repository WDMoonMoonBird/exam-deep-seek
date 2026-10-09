# Wave 3 独立验收报告（t21）

> 验收人：verifier（独立于全部实现者）｜ 对象：Wave 3 全部产出（t19 工作台两页 + CodeEditor、t20 作答页）
> worktree：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`，HEAD `e1eed89`；Wave 3 实现为工作区未提交状态，本报告针对该状态）
> 验收时间：2026-10-09 21:02–21:45 ｜ 依据：`13-wave3-contract.md` §0–§7（含 §7.1/§7.2 修订与 §7.4 既有缺陷登记）+ `05-page-specs.md`
> 方法：独立复跑（自起 vite :5175 + 真实后端 :3000；**非 GET 一律 Playwright route 拦截，开发库零写**）
> 复跑脚本：`/tmp/wave3-verify/{p-submit,p-review,p-project,p-shots,diag-s6,diag-submit,diag-review}.cjs`；原始数据 `/tmp/wave3-verify/{submit,reviewdetail,projectreviewnew,shots}.json`

## 0. 结论摘要

| 维度 | 结论 | 证据 |
|---|---|---|
| 契约 §1 Submit S1–S13 | ✅ 13/13 一致（S3/S6b 为**基线既有缺口**，与基线逐字相同） | §3 |
| 契约 §2 ReviewDetail R1–R8 | ✅ 8/8 一致（R3 基线未跑，本次补测通过） | §4 |
| 契约 §3 ProjectReviewNew P1–P10 | ✅ 10/10 一致（P4/P6/P7/P9/P10 基线部分未跑，本次补测通过） | §5 |
| 契约 §4 跨页 X1–X4 | ✅ 全通过（Modal.confirm 全仓 0；接口集合逐字不变；无写污染） | §6 |
| §7.1 P8 | ✅ 按修订口径通过（可折叠 + 内容不丢；几何按新壳记录：宽 564→904、高不变） | §5 |
| §7.2 R5 | ✅ 按语义口径通过（第 1 小题 AI 评语 → 该小题「教师评语」框；序号 1→2 已确认） | §4 |
| §7.3 V1 轮询节拍 | ✅ 已复现并解释（POLL_INTERVAL=5000 生效；t19 观察到「仅 1 次」= 首轮即命中 done → stopPolling） | §7.1 |
| §7.3 V2 「评分中」标签 | ✅ 已构造复现（status=submitted 且无 aiResult → 面板出现「评分中」） | §7.2 |
| §7.4 V3/V4 既有缺陷 | ✅ 独立复现，登记为**改前既有缺陷**；A/B 证明与 Wave 3 无关 | §7.3 |
| 硬检查 | ✅ Wave 3 四文件 hex=0/!important=0；全仓 vue hex 179→**71**、!important 16→**6**（差值可逐文件还原） | §2 |
| 未新增功能 | ✅ 作答页无倒计时元素/文案；草稿语义（1500ms 防抖、30s 兜底、visibilitychange、keepalive）与基线逐字一致 | §8 |
| **回归（Wave 3 引入）** | **0 项** | §9 |
| 未达标项 / 待 captain 决策 | 5 项（2 项既有缺陷已登记 + 3 项低风险） | §9 |

**判定：通过（Pass）**，建议 Wave 3 冻结；§9 的既有缺陷 V3/V4/V5 建议按 captain 既定派单修复。

---

## 1. 验收环境与方法

| 项 | 值 |
|---|---|
| 前端 | worktree 工作区，vite dev `:5175`（http://localhost:5175/exam/） |
| 后端 | 主工作区 :3000（真实库，**仅 GET**；非 GET 全部 route fulfill） |
| 账号 | 教师 `test_teacher`；学生 `10001@4145013830` |
| 目标页 | Submit `/student/assignments/306`；ReviewDetail `/teacher/review/9102`（exam）与 `10293`（practice）；PRN `/teacher/review/project/10297` |
| 可写态构造 | 改写 `GET /student/assignments/306` 响应：`endTime=now+30h`、`submissions[].status='draft'`；四类控件用 `objectiveItems[].type` 轮换改写 |
| 浏览器 | Playwright 1.60 + Chromium，1440×900（另跑 1024 / 768 壳形态） |

> 与契约 §0 一致的三条纪律：非 GET 全拦截并记录；route handler 全 try/catch；不使用 `networkidle`。

---

## 2. 硬检查（与 captain 台账交叉还原）

| 指标 | Wave 2 后基线 | Wave 3 后实测 | 差值可还原性 |
|---|---|---|---|
| `*.vue` 六位 hex | 179 | **71** | −108 = Submit 45 + ReviewDetail 41 + PRN 22（逐文件核对一致） |
| `*.vue` `!important` | 16 | **6** | −10 = ReviewDetail 4 + Submit 4 + PRN 2 ✓ |
| `Modal.confirm`（views） | 3 | **0** | X1 三处全部迁移 ✓ |
| `grep -n 'countdown\|倒计时' student/Submit.vue` | 0 | **0** | 未新增 ✓ |
| Submit hex / !important / var(--) | 45 / 4 / — | **0 / 0 / 115** | |
| ReviewDetail hex / !important / var(--) | 41 / 4 / — | **0 / 0 / 102** | |
| PRN hex / !important / var(--) | 22 / 2 / — | **0 / 0 / 61** | |
| CodeEditor hex / !important | 0 / 0 | **0 / 0** | 仅追加可选 props |

**残留清单（全部属 Wave 4 未迁移页）**：hex — `Doc.vue` 44、`RichEditor.vue` 23、`ProjectZipUploader.vue` 3、`Login.vue` 1；`!important` — `Doc.vue` 6。

**接口调用集合逐字比对（HEAD vs 现在）**：Submit 6→6、ReviewDetail 5→5、PRN 1→1，全部 *identical call sites*（脚本 `/tmp/wave1-verify/apicalls.cjs`）。

**CodeEditor 变更核对**：新增可选 `fontSize`(默认 14)/`fontFamily`(默认 'MonacoDSH, monospace')，默认值 = 改前硬编码值；三个消费方（QuestionEdit / Submit / ReviewDetail）均未传新 props → 行为不变。实测 QuestionEdit Monaco 挂载且 `font-size = 14px`、字体族含 MonacoDSH，0 控制台错误（截图 `questionedit-codeeditor-regression-1440.png`）。

---

## 3. 契约 §1 Submit 逐条复核（基线 vs 现在）

| # | 断言 | 基线 | 本次实测 | 判定 |
|---|---|---|---|---|
| S1 | 结构计数 | sections=6 / nHead=6 / nGrid=6 / nBox=35 / radio=100 / checkbox=0 / 「共 6 题，6 题未提交」/「草稿已同步」 | 逐字相同 | ✅ |
| S2 | 点方块切题 | Δ5594 / active=30 / 0 请求 | Δ5071 / active=30 / 0 请求 | ✅ |
| S3 | 键盘切题 | ❌ 缺口（div 无 tabindex/role，ArrowRight 无效） | 完全相同（DIV / tabindex=null / role=null / active 不变） | ✅（与基线一致，非新增） |
| S4 | 1500ms 防抖落盘 | 3 条，+1520 级；body `{questionId,subQuestionId,answer}` | 3 条，+1557/1558/1559；body 形状逐字相同 | ✅ |
| S5 | 30s 兜底 | ❌ 失败仍清脏 → 无 30s 节拍 | ❌ 相同（34s 内仅 3 次防抖尝试） | ✅（既有缺陷 V4） |
| S6 | visibilitychange 立即落盘 | ✅ 3 条 PUT，+3ms（需先「可存」） | ✅ 3 条 PUT，**+3ms**（客观题 30 问全答后 dispatch） | ✅ |
| S6b | beforeunload keepalive | ❌ 0 PUT / 3 GET | ❌ 0 PUT / 3 GET | ✅（既有缺陷 V3） |
| S7 | Monaco 懒挂载 | 0 → 1 | **0 → 2**（滚到底部，2 个编辑器进入视口；前提见 §9-V5） | ✅ |
| S8 | 四类客观题控件 | radio 34 / checkbox 20 / text 7 / oi-card 30（响应改写） | 同值 | ✅ |
| S9 | 提交校验弹窗 | title + 明细 + [返回继续作答, 仍要提交] | 逐字相同（走 useConfirm，DOM 仍 `.ant-modal-confirm`） | ✅ |
| S10 | 提交后只读 | disabled 0→100 / 3× POST /submit | disabled 0→**102** / 3× POST /submit（body 形状相同） | ✅ |
| S11 | 轮询节拍 | 无评分中 → 20s 内 0 次 | 34s 内 0 次 | ✅ |
| S12 | 倒计时 UI | 不存在 | 不存在（元素 0、文案 0） | ✅ |
| S13 | 参考答案可见条件 | 可写 0 / published 2 可见 | 0 / 2 可见（visible=true） | ✅ |

**首屏接口集合**：GET `/student/assignments/306`、`/student/profile`；写集合 `PUT /draft`、`POST /submit`（+ practice 的 `POST /retry`）——与基线逐字一致。
**错误基线**：pageerror 0；console error 3 条全部来自本次注入的 /draft 500 探针（正常路径 0）。

---

## 4. 契约 §2 ReviewDetail 逐条复核

| # | 断言 | 基线 | 本次实测 | 判定 |
|---|---|---|---|---|
| R1 | 只读 Monaco + 页脚条 | practice：monaco=2、textarea=4、无 `.rp-submit-bar`；exam：页脚在 | practice：2 / 4 / 0；exam：submitBar=1，文案「共 3 题，AI 总分 0 / 100 保存审核 发布成绩」 | ✅ |
| R2 | 章节折叠 | `[…, …]` → `[… collapsed, …]` | 逐字一致 | ✅ |
| R3 | 点题号方块 | 基线未跑 | ✅ 补测：`.rp-content` scrollTop 0→**437**，active 索引 1 | ✅（补测通过） |
| R4 | 重新评分 | `POST /teacher/submissions/10293/regrade`（1 次，body 空） | 逐字一致（body 空） | ✅ |
| R5 | 使用 AI 评语 | 基线：第 2 个 textarea 被写入 | ✅ **语义指向**：第 1 个评分盒内 placeholder「教师评语（选填）」的 textarea 被写入 88 字 AI 评语全文（扁平序号 1→2，符合 §7.2） | ✅（按 §7.2 口径） |
| R6 | 保存审核 | body `{"finalScore":0,"teacherFeedback":"学生未提交任何答案，无法评分。请补交代码。"}` | 逐字相同 | ✅ |
| R7 | 发布成绩 | 确认框原文 + `PUT /publish` body `{"submissionIds":[9102]}` | 文案逐字相同；body 逐字相同；ok 按钮 `rgb(217,45,32)`=`--red-600`（R-15 有意变更） | ✅ |
| R8 | 参考答案对照 | 10293 上 0 块 | 0 块 / 0 材料条 | ✅ |

**壳形态**：1440 三栏（left 220 / mid / right 384）；1024 右栏初始 x=1024（离屏）→ 点浮动开关滑入 x=640，无横向溢出（截图 `reviewdetail-1024-shell.png`、`reviewdetail-1024-drawer-open.png`）。
**错误基线**：pageerror 0、console error 0（与基线一致）。

---

## 5. 契约 §3 ProjectReviewNew 逐条复核

| # | 断言 | 基线 | 本次实测 | 判定 |
|---|---|---|---|---|
| P1 | 双源 tabs | `["学生提交","标准答案包"]` | 逐字相同；壳 1440：left 260 / mid 564 / right 384，无溢出 | ✅ |
| P2 | 无标准包 | tabs=1，active=学生提交 | 逐字相同（响应改写 standardFiles=[]） | ✅ |
| P3 | 点文件树节点 | tabs=[Dog.java]、monaco=1 | 逐字相同 | ✅ |
| P4 | 关标签 | 空态 `.pr-code-empty` | 关唯一标签 → tabs=[]、empty=1 | ✅（补测通过） |
| P5 | 双源隔离 | 学生源标签保留 ✓ | ✅ 且补上基线未跑通的「标准包源内打开文件」（标准包源打开 Dog.java → 切回学生源仍 [Dog.java]） | ✅ |
| P6 | 树展开/折叠 | 9 treenode（默认展开） | 9 → 折叠首目录 → **2** | ✅（补测通过） |
| P7 | 重评后轮询 | 基线部分：pending 时 13s 未复现 5s 节拍 | ✅ 见 §7.1（真实态 1 次即停；pending 态 5s 节拍 4 次） | ✅ |
| P8 | 折叠评分面板（§7.1 修订口径） | 高度方向 479→729 | ✅ 可折叠/展开：`.panel-body` 1→0→1；右栏 384→44→384；**内容不丢**；几何按新壳记录：Monaco 宽 564→**904**、高 802 不变 | ✅（按 §7.1） |
| P9 | 更新审核 | 基线未跑 | ✅ 补测：改写 status=reviewed → 按钮「更新审核」→ `PUT /teacher/submissions/10297/project/review` body `{"finalScore":88,"teacherFeedback":""}` | ✅（补测通过） |
| P10 | 评分中呈现 | 基线未跑 | ✅ 见 §7.2（构造 status=submitted + aiResult=null → 面板「评分中」标签 + 空态文案「暂无 AI 评语（评分中或尚未完成…）」） | ✅（补测通过） |

**P8 焦点补充说明（与 t19 声明的差异）**：本次探针用「点击面板头」触发折叠，折叠后 `document.activeElement = BODY`（面板头是 `div`，点击本身会移走焦点）；**未发现任何其它控件窃取焦点、无报错、内容不丢**。t19 报告的「焦点仍在 Monaco 内部」应是未点击（程序化折叠）时的状态；两种观察不矛盾，均满足 §7.1「Monaco 不失焦」的语义（不引入焦点抢占）。

**错误基线**：pageerror 0；console error 均为 Vite `/@fs/` 字体 403（开发环境专属，与基线同一类，非业务）✓。

---

## 6. 契约 §4 跨页

| # | 项 | 结果 |
|---|---|---|
| X1 | `Modal.confirm` 残留 | ✅ 全仓 views **0**（原 3 处：Submit:349/802、ReviewDetail:513 已全部改 useConfirm） |
| X2 | 错误基线 | ✅ Submit pageerror 0 / 正常路径 console 0；ReviewDetail 0/0；PRN pageerror 0 + console 仅 `/@fs/` 字体 403（与基线同因） |
| X3 | 接口调用集合 | ✅ 三页读/写集合逐字不变（§2 末） |
| X4 | 写操作零污染 | ✅ 全部非 GET（draft/submit/retry/regrade/review/publish/project/regrade/project/review）在 route 层 fulfill；**验收后只读复核**：PRN 10297 = published / finalScore 88 / grading done、RPD 9102 = ai_graded / final_score NULL / feedback NULL、RPD 10293 = ai_graded、assignment 306 的 3 条提交仍全为 published —— 与探针前完全一致 |

---

## 7. §7 修订与 §7.3/§7.4 专项

### 7.1 V1：P7 轮询节拍（复现 + 解释）

| 场景 | 实测 | 结论 |
|---|---|---|
| (a) 真实态 `grading.state='done'`，点「重新评分」 | `POST …/project/regrade` 1 次；随后 **GET 轮询 1 次（t+5s）后停止**，20s 窗口内无更多请求 | **解释了 t19 的「13.5s 仅 1 次」**：第一次轮询在 5s 时命中 `state='done'` → `stopPolling()`（代码 514–518），与节拍常量无关 |
| (b) 改写 `grading.state='pending'` + `status='submitted'` + `aiResult=null` | GET 轮询 **4 次，间隔 5002 / 5001 / 4998 ms** | **POLL_INTERVAL=5000 生效**；`POLL_MAX=72` 未触发（未到限） |

**判定：V1 不是缺陷**——节拍正确，t19 的观察是「评分已完成 → 首个轮询即停止」的正常行为。

### 7.2 V2：P10「评分中」标签（构造复现）

- 构造：`submission.status='submitted'`、`submission.grading.state='pending'`、`aiResult=null`、`aiScore=null`
- 实测：面板头部出现 **「评分中」** 标签（`ai-head` = 「AI 评分 — 评分中 重新评分 查看提示词」）；空态文案「暂无 AI 评语（评分中或尚未完成，可人工评分）」
- 判定：**可复现**，标签条件为 `status==='submitted' && !aiResult`（与代码 95 行一致）；t19 未复现的原因是只改了 `grading.state` 而未清 `aiResult`/`aiScore`
- 截图：`projectreviewnew-grading-label-1440.png`

### 7.3 V3/V4（既有缺陷）+ V5（本次新发现）

| # | 缺陷 | 本次独立复现证据 | 归属判定 |
|---|---|---|---|
| V3 | beforeunload keepalive 落盘失效（同类内 `fetch` 声明提升遮蔽） | dispatch `beforeunload` 后 **0 次 PUT /draft、3 次 GET /student/assignments/306**（与 §1 S11 基线记录的 4 次 GET 同因） | **改前既有**（Wave 3 未触碰草稿语义）；A/B 另证：HEAD 版行为相同 |
| V4 | 30s 定时兜底失效（失败仍 `clearDirty()`） | `/draft` 全 500 保持脏：34s 内**仅 3 次防抖尝试**（+1533/1534/1534ms），无任何 30s 重试 | **改前既有**（同上） |
| **V5** | **Monaco 懒挂载存在首帧注册竞态**：`setupEditorObserve(el, sqId)` 在 `editorObserver` 尚未创建时直接 return；若此后组件无任何重渲染，占位块永不进入观察 → Monaco 永不挂载 | 无交互直接加载：5 个 `.sq-editor-placeholder` 全部 `_sqId=undefined`、滚到底部 `.monaco-editor=0`；**点一次题号方块（触发重渲染）后** `_sqId=5`、滚动即挂载 `.monaco-editor=2` | **改前既有**：把 `Submit.vue` 换成 HEAD（Wave 2 冻结版）在同一探针下复现完全相同的 `withSqId=0 / monaco=0`，随后已恢复原文件（sha256 校验一致） |

> V5 的实际影响：教师端/学生端在部分加载时序下「滚动到编程题不出现编辑器」，但**点任意题号后即恢复**；基线（t18）与 t20 之所以观察到 0→1，是因为其探针在此之前发生过重渲染。建议与 V3/V4 一并列入修复单（1 行：`setupEditorObserve` 记录待观察元素，observer 创建后统一 observe）。

---

## 8. 「未新增功能」与草稿语义证明

| 断言 | 证据 |
|---|---|
| 作答页无倒计时 UI | `grep -n 'countdown\|倒计时' client/src/views/student/Submit.vue` = **0**；DOM 探针：`[class*=countdown|count-down|timer]` 0 个、正文无「倒计时」字样 |
| 草稿节拍未改 | S4 实测 +1557ms（基线 +1520）＝仍是 1500ms 防抖；30s 定时器仍在（`setInterval(...,30000)`，S5 负面结论与基线相同） |
| 落盘请求形状未改 | `PUT /draft` body `{questionId,subQuestionId,answer}`（客观题 answer 为 `[{key,answer}…]` JSON 串）；提交 `POST /submit` 同形 |
| 轮询语义未改 | S11（无评分中）34s 0 次；`setInterval(pollStatus,2000)`、`if(!anyGrading) stopPolling()` 未改动 |
| 两页阅卷页未新增功能 | 接口集合逐字不变（X3）；按钮/标签集合与基线一致（R1/R5/R7、P1–P10 实测值） |

---

## 9. 未达标项 / 需要 captain 决策

| # | 项 | severity | 说明与建议 |
|---|---|---|---|
| ① | V3 beforeunload keepalive 失效 | **high（既有）** | 学生关页/切后台时草稿不落盘；修复=本地加载器改名（1 行），**已由 captain 登记 §7.4**，待派单 |
| ② | V4 30s 兜底失效 | **medium（既有）** | 弱网下草稿静默丢失；修复=失败不清脏（需改 `clearDirty` 语义），**已登记 §7.4** |
| ③ | V5 Monaco 懒挂载首帧注册竞态 | medium（既有，本次新发现） | 见 §7.3；建议并入同一修复单（observer 创建后补 observe） |
| ④ | S3 键盘切题缺口 | low（既有） | 05-page-specs T4 要求题号方块 `<button>` + 方向键；Wave 3 红线「未新增功能」故未实现，现状与基线一致 → 建议列 Wave 4 |
| ⑤ | P8 折叠后 activeElement=BODY | info | 点面板头触发折叠时焦点落 body（面板头不可聚焦）；无焦点抢占、无报错。若要求「折叠后焦点必须留在编辑器」，需给面板头加 `tabindex` 或程序化折叠（建议登记为设计取舍） |

---

## 10. 截图与证据索引

### 10.1 截图（`docs/ui-redesign/preview/shots/wave3/`，全部 1440×900，另含 1024/768）

| 文件 | 内容 |
|---|---|
| `submit-1440.png` / `submit-1024.png` / `submit-768.png` | 作答页三档（1440 两栏 / 1024 导航收顶部条 / 768 无溢出） |
| `reviewdetail-10293-1440.png` / `reviewdetail-9102-1440.png` | 逐题批改（practice / exam，页脚动作条仅 exam） |
| `reviewdetail-ai-feedback-1440.png` | R5 使用 AI 评语后的教师评语框 |
| `reviewdetail-publish-confirm-1440.png` | R7 发布确认框（ok 危险色） |
| `reviewdetail-1024-shell.png` / `reviewdetail-1024-drawer-open.png` | 1024 右栏抽屉形态 |
| `projectreviewnew-10297-1440.png` | 三栏工作台 + 双源树 + Monaco |
| `projectreviewnew-no-standard-1440.png` | P2 无标准包（单源） |
| `projectreviewnew-collapsed-1440.png` | P8 折叠评分面板（宽度方向） |
| `projectreviewnew-grading-label-1440.png` | **V2「评分中」标签** |
| `projectreviewnew-polling-pending-1440.png` | **V1(b) pending 态 5s 节拍轮询** |
| `projectreviewnew-regrade-done-1440.png` | V1(a) done 态首轮即停 |
| `projectreviewnew-1024-shell.png` / `projectreviewnew-1024-drawer-open.png` | 1024 抽屉形态 |
| `questionedit-codeeditor-regression-1440.png` | CodeEditor 回归（默认 14px 生效） |

### 10.2 原始数据（`/tmp/wave3-verify/`）

| 文件 | 内容 |
|---|---|
| `submit.json` / `submit.log` | S1–S13 + V3/V4 逐条结果与请求时序 |
| `reviewdetail.json` / `review.log` | R1–R8 + 壳形态 |
| `projectreviewnew.json` / `project.log` | P1–P10 + V1/V2 + 壳形态 |
| `shots.json` | 截图探针 + CodeEditor 回归 |
| `diag-submit.cjs` 输出 | V5 竞态证据（含 HEAD 版 A/B） |
| `diag-s6.cjs` 输出 | S6 +3ms / S4 +1488ms |

**A/B 与恢复校验**：V5 的 HEAD 对照实验用 `git show HEAD:client/src/views/student/Submit.vue` 临时替换工作区文件，实验后已恢复，sha256 = `4ae2d96c…` 与实验前一致（`git status` 显示该文件仍为 Wave 3 的未提交修改）。

---

**签名**：verifier ｜ 本报告为独立复跑结论；实现者自测仅用于确定「应核对哪些断言」，不作为通过依据。
