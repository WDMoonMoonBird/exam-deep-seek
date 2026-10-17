# 后端接口对账与「零后端改造」UI 裁剪建议（08）

> 目的：回答「这套移动 UI 里哪些数据必须后端开接口、哪些接口难、现阶段不改后端时 UI 砍哪些」。
> 复核基线：分支 `feat/mobile-app`（commit `1777f94`）+ 当前后端源码（`server/src/routes/*`、controllers、`server/prisma/schema.prisma`）。
> 上游文档：[05-page-specs.md](./05-page-specs.md) §6（G1–G14 初版缺口）、[07-implementation-plan.md](./07-implementation-plan.md)。

---

## 0. 结论（先看这段）

1. **现有后端已经能支撑移动端主流程的绝大部分**：学生作业/作答/草稿/提交/成绩列表、教师待办/作业列表/详情/审核队列/审核详情/逐条审核/发布、班级与学生、题库、实训题提交与审核，全部有现成接口；**37 屏里 34 屏不需要新增接口即可实现**（管理端 3 屏建议后置）。
2. **真正“必须有新后端”的只有 4 类数据 + 3 类动作**：数据 = 学生成绩聚合（班均/排名/百分位/等级分布）、成绩构成（客观/编程/过程分）、通用题的 AI 结构化分项、管理端业务监控指标（在线/评分队列/平均响应/异常汇总）；动作/基础设施 = 催交推送、打回/重做、免登录接力 token。其余“缺口”都能用现有接口重算、换字段或直接砍。
3. **真正“比较难”的 5 项**：① 班级排名/百分位/均分（聚合口径 + 隐私 + 性能）；② 通用题 AI 分项（AI 输出 schema + 存储）；③ 管理端业务监控（需要埋点/聚合，不是查现成表）；④ 催交/推送（通知渠道）；⑤ 打回/重做（状态机 + 学生重交）。这些**现阶段不建议动后端**。
4. **零后端改造 v1 可行**：保留「公共 6 + 学生 11 + 教师 14 + 平台状态 3」共 34 屏；管理端 3 屏改为「只读系统监控」或直接后置桌面端。需要砍掉/降级的 UI 见 §4，合计约 **8 类数据组件**；学生与教师的核心闭环不受影响。
5. 唯一需要产品拍板、但**不需要新接口**的是「审核通过（reviewed，学生不可见）」与「发布（published，学生可见）」两步语义；现有 `PUT /submissions/:id/review` + `PUT /submissions/publish {submissionIds}` 已够用。

---

## 1. 复核方法与证据

- 路由清单：`server/src/routes/student.js`、`teacher.js`、`admin.js`、`projects.js`。
- 关键控制器：
  - 学生：`server/src/interface/http/controllers/student/{assignments,scores,view,submission,project-question,project-submit}.js`
  - 教师：`.../teacher/{assignments,questions,classes,students}.js`；`.../review/{list,summary,batch}.js`；`server/src/infrastructure/review/{submission,project}.js`；`server/src/controllers/projectReviewController.js`
  - 管理：`server/src/controllers/adminController.js`
- 数据模型：`server/prisma/schema.prisma` 的 `Submission / Assignment / Question / SubQuestion`。
- 已逐项确认的字段（不是只看文档）：
  - 学生作业列表已返回 `submittedAt / answeredCount / finalScore / maxScore`（`student/assignments.js:109-112`）。
  - 学生成绩只返回 `published`，聚合项含 `totalScore / subItems[{title,score,feedback}]`（`student/scores.js:18-58`）。
  - 教师 `pending-summary` 返回 `pendingReview / aiPending / abnormal`（`teacher/assignments.js:118`）。
  - 教师作业列表返回 `submissionCount / expectedCount / pendingReviewCount / latestSubmittedAt`（`teacher/assignments.js:279-283`）。
  - 教师提交列表返回 `aiScore / bestScore / finalScore / status / submittedAt / student / question / assignment`，**不含 aiFeedback/teacherFeedback**（`review/list.js:65`）。
  - 教师提交详情返回整行 Submission + `question.subQuestions` + `allSubmissions`（`infrastructure/review/submission.js:23-59`）。
  - 实训题专属 `GET /teacher/submissions/:id/project` 返回 `aiResult`（`breakdown/highlights/issues/overallComment`，`projectReviewController.js:128-153`）；**通用题没有结构化分项，只有整段 `aiFeedback`**。
  - 批量：`batchReview` 是「班级×作业」全量（`review/batch.js:42`）；`publishScores` 接受 `submissionIds`（`batch.js:138-153`）→ **选中 N 份发布可复用**。
  - 管理：`GET /admin/monitor` 只有 system/processes/logs/errors（`adminController.js:331`）；学校/班级/教师/学生列表为全量数组、无分页（`adminController.js:256`）。

---

## 2. 现有接口直接支撑的 UI（零新增）

> 下表只列“数据来源”；前端需要做的派生计算标「前端算」。

| 屏幕/组件 | 数据 | 复用接口 | 判定 |
|---|---|---|---|
| 登录 / 角色跳转 | token/user/teacherSchools/currentSchool/mustChangePassword | `POST /auth/login` | ✅ 直接 |
| 登录多学校选择 | 同一学号多校时返回 `code:1002 + schools` | 同上 | ✅ 接口已有；UI 仅少一个选择态（前端补） |
| 学生首页 | 待办/截止/进行中/最近成绩 | `GET /student/assignments` + `/scores` | ✅ 前端算 |
| 学生作业列表 | 状态/截止/已答/已出分/满分 | `GET /student/assignments`（含 `submittedAt/answeredCount/finalScore/maxScore`） | ✅（见 §6 口径注意） |
| 学生作业详情 | 题目/小题/已存答案/参考解析（发布后） | `GET /student/assignments/:id` | ✅ |
| 学生作答（客观/简答/代码） | 题目内容、草稿、提交、计时 | `GET assignment`、`PUT draft`、`POST submit` | ✅ 计时前端算 |
| 学生实训题提交 | 题面/文件树/上传/版本 | `GET project`、`POST project submit` | ✅（37 屏未单列，接口已有） |
| 学生成绩列表 | 已发布作业 + 分数 | `GET /student/scores` | ✅ |
| 学生成绩详情 | 逐题得分 + 评语（无满分/题型） | `GET /student/scores` 的 `subItems` | ⚠️ 降级（见 §4） |
| 学生我的 | 姓名/学号/班级/学校；主题/字号本地；改密 | `GET /student/profile`、`PUT /auth/password` | ✅（通知偏好砍） |
| 教师首页 | 待审核/AI 待评/异常/最近作业 | `GET /teacher/pending-summary` + `/assignments` | ✅ 文案需对齐（aiPending ≠“AI 评分中”） |
| 教师作业列表 | 提交进度/应交/待审/截止/锁定 | `GET /teacher/assignments` | ✅ |
| 教师作业详情 | 作业+题目+班级；进度/学生状态 | `GET /teacher/assignments/:id` + `review-summary` / `review-class` / `submissions?assignmentId` | ✅ 多一次读；无新接口 |
| 教师审核队列 | 待审列表/分数/学生/提交时间/总数 | `GET /teacher/submissions?status=ai_graded&assignmentId=` | ✅（分项需详情） |
| 教师审核详情 | AI 分/整段评语/答案/改分/审核 | `GET /teacher/submissions/:id` + `PUT review` + `PUT score` | ✅（通用题无分项） |
| 实训题审核 | 标准包/学生文件/AI breakdown | `GET /teacher/submissions/:id/project` + `PUT .../project/review` | ✅ 仅实训题 |
| 手机编辑说明/接力 | 复制链接、二维码 | 前端生成 URL | ✅（登录后可用；无免登录 token） |
| 批量选择/确认 | 选中 N 份 → 逐条审核 → 按 ids 发布 | `GET submissions` + N×`PUT review` + `PUT submissions/publish {submissionIds}` | ✅ 无新接口（非原子，需进度/重试） |
| 布置作业 | 题库/班级/创建/1007 软警告 | `GET questions/classes` + `POST assignments` | ✅（type 筛选前端做） |
| 题库/班级/我的 | 列表/详情/锁定/改密 | `GET questions/classes/students`、`PUT lock`、`PUT auth/password` | ✅（使用次数/最近使用无接口 → 砍） |
| 管理端监控 | 主机/进程/日志/错误 | `GET /admin/monitor` | ✅ 只读系统监控 |
| 管理端概览/目录 | 学校/班级/教师/学生列表（全量、无分页） | `GET /admin/{schools,classes,teachers,students}` | ⚠️ 可读但重；建议后置 |
| 公共页/平台页 | 静态/本地 | 无 | ✅ |

---

## 3. 必须新增/扩展后端才能保留的数据（按“真缺口”排序）

> 这里的“必须”指：**若保留现有设计稿中的对应视觉/数据，不做裁剪**。

| # | 数据 | 用在哪 | 现有后端为什么不够 | 难度 | 建议 |
|---|---|---|---|---|---|
| B1 | 班级均分、排名、百分位、等级分布、学期平均分 | 学生成绩页、成绩详情、教师审核对比（“高于班均 9.6”） | `/student/scores` 只返回本人 published 分数；无跨学生聚合；排名/均分涉及班级隐私口径 | **高**（聚合+隐私+并列规则+性能） | **砍**：成绩页只列分数；不做排名/均分 |
| B2 | 分数构成：客观题/编程题/过程分；逐题满分/题型 | 学生成绩详情“分数构成”、逐题 x/y | `subItems` 只有 title/score/feedback，无 maxScore/questionType；过程分无模型 | 中（补字段+口径） | **砍**：只显示逐题得分与评语，不显示构成/分母 |
| B3 | 通用题 AI 结构化分项（功能/规范/异常等） | 教师审核队列/详情的分项条 | 通用题 `aiFeedback` 是整段文本；只有实训题有 `aiResult.breakdown` | **高**（AI 输出 schema + 存储 + 兼容） | **砍**：通用题只显示 AI 总分 + 整段评语；实训题保留分项 |
| B4 | 管理端业务指标：在线人数、今日评分、评分队列、平均响应、今日异常数 | 管理概览/监控 | `/admin/monitor` 只有主机/PM2/日志；无业务统计/埋点 | **高**（需要监控/聚合体系） | **砍/后置**：只做系统监控，或管理端整体放到桌面 |
| B5 | 催交/通知（站内信/推送） | 教师作业详情“催交 7 人” | 无催交接口，也无通知渠道/表 | **高**（外部渠道+基础设施） | **砍**：改为“复制提醒文案”；推送不进 v1 |
| B6 | 打回/退回重做状态 | 教师审核详情“打回” | 状态机只有 draft/submitted/ai_graded/reviewed/published，无 reject/rework | 中高（状态机+重交规则+权限） | **砍**：只保留“保存评语/审核通过”；不合并不通过语义 |
| B7 | 管理端列表分页/总数 | 组织目录 | `/admin/*` 全量数组（学生 1,286 条） | 中（后端分页+前端窗口化） | **砍/后置**：管理端移动版只读少量，或不做 |
| B8 | 题库 type 筛选、使用次数、最近使用 | 题库 chips/题目卡 | `/teacher/questions` 只有 keyword/difficulty；无 usage 聚合 | 易（type）/中（usage） | **砍**：题型在当前页前端过滤；使用次数不显示 |
| B9 | 教师作业均分 | 作业卡“均分 82.4” | 列表无 averageScore；需按提交聚合 | 易/中 | **砍**：列表不显示均分 |
| B10 | 教师评语进入提交列表 | 批量影响范围“含教师评语 4 份” | `/teacher/submissions` 未选 `aiFeedback/teacherFeedback` | 易（补字段） | **砍**：影响范围只保留“AI 分 <60 的 N 份” |
| B11 | 免登录接力 token（10 分钟有效） | 学生编程题/教师编辑的二维码接力 | 无 token/短链/文件同步接口 | 中（安全+过期+权限） | **砍**：二维码只编码当前 URL；电脑登录后可用；不承诺免登录/10 分钟 |
| B12 | 500 requestId | 错误页错误编号 | 后端 500 不带 requestId | 易 | **砍/前端生成**：不展示伪造编号 |
| B13 | 按 submissionIds 的原子批量审核 | 批量确认一次提交 | `batchReview` 是班级×作业全量；无 ids 版 | 中 | **不必做**：逐条 review（并发 3–5）+ `publishScores(ids)` 已可覆盖 |
| B14 | 作业编辑/删除 | 作业卡左滑“编辑/删除” | 仅 `PUT /assignments/:id/lock` | 中 | **已砍**：左滑改为锁定/复制链接（设计稿已改） |
| B15 | 通知偏好（站内/推送开关） | 教师/学生“我的” | 无接口也无推送通道 | 易接口/无渠道 | **砍**：设置项隐藏或只读“暂未开放” |
| B16 | 学生“已答 X 题”精确题数 | 学生首页/列表进度 | `answeredCount` 是提交行数（按题目/小题），不是去重题数 | 易（补 distinct 统计） | **前端口径**：显示“已提交 N 项”或进详情精确算；不新增接口 |
| B17 | 学生成绩满分 | 成绩列表/详情得分率 | `/student/scores.maxScore` 取的是“第一条提交的题目满分”，多题时不可靠 | 易（修字段） | **前端**：用 `/student/assignments.maxScore` 映射；或只显示分数 |

---

## 4. 建议砍掉/降级的 UI（零后端改造 v1）

> 原则：**不改变核心任务**（学生能作答/提交/看分；教师能看进度/审核/发布），只删除“需要新聚合/新状态机/新通道”的辅助信息。
> 图例：保留 = 不改；降级 = 换字段/换文案/少显示；砍 = 直接移除；后置 = 桌面端/下阶段。

### 4.1 学生端（11 屏）

| 屏 | 保留 | 砍/降级 |
|---|---|---|
| student-home | 待办、截止倒计时、继续作答、快捷入口、最近成绩条目 | 砍“学期平均分/排名/百分位”；最近成绩只显示分数与“已发布”，不显示等级 A（等级映射未定义；如要保留，需产品定义等第表） |
| student-assignments | 状态筛选、截止、提交进度、已出分分数、未开始 | 进度文案改为「已提交 N 项」（`answeredCount` 口径，见 §6）；不显示均分/排名 |
| student-assignment-detail | 作业信息、题目类型/题数、已存答案、开始/继续 | 无（“已用时”前端算；参考答案按发布可见性由后端裁剪） |
| student-answer-objective | 题目/选项/标记/答题卡/交卷/倒计时 | 无 |
| student-answer-code | 题面、草稿保存、提交；复制电脑端链接 | 砍“免登录二维码/10 分钟有效/已同步到电脑端”；改为「复制链接（电脑登录后继续）」；手机端不做代码编辑 |
| student-answer-sheet / submit-confirm | 已答/未答/标记/交卷确认 | 无（全部前端算） |
| student-assignment-done | 提交回执、状态、时间线（按 status 推导） | 未 published 时不显示分数/评语（后端已不返回）；不显示 AI 具体分 |
| student-scores | 已出分作业列表（分数/满分）、待出分/进行中/未开始分组 | 砍学期平均分、班级排名、超过百分比、等级分布、A/B/C 等级 |
| student-score-detail | 总分/满分、逐题得分、AI/教师评语 | 砍分数构成（客观/编程/过程分）、班级均分/最高/排名、逐题满分分母（可显示“得分 X”） |
| student-profile | 姓名/学号/班级/学校、主题/字号、退出 | 砍“学期平均分/排名”数据条；通知开关隐藏或标“暂未开放” |

### 4.2 教师端（14 屏）

| 屏 | 保留 | 砍/降级 |
|---|---|---|
| teacher-home | 待审核、AI 待评、异常、最近作业、快捷入口 | “AI 评分中”改“AI 待评”（`aiPending` 语义）；砍“今天已审核 5 份/平均 1.8 分钟”（无接口）；砍作业卡均分 |
| teacher-assignments | 状态筛选、提交进度、待审数、锁定/复制链接 | 编辑/删除（已改锁定/复制链接）；均分 |
| teacher-assignment-detail | 进度（list 字段）、学生状态（review-class）、底部“查看评分” | 砍“催交”（改复制提醒文案）；“导出成绩”改为电脑端提示；均分 |
| teacher-review-queue | 队列进度（list total）、AI 总分、学生/提交时间、改分/审核通过 | 砍“高于班均 9.6”（无聚合）；砍队列卡上的 AI 分项/评语（移到详情，列表无此字段）；队列“审核通过”只做 reviewed，不承诺学生已可见 |
| teacher-review-detail | AI 总分 + 整段评语、答案/参考、改分、教师评语、审核 | 通用题砍分项条（仅实训题用 `/submissions/:id/project` 的 breakdown）；砍班均/排名；砍“打回”（无状态机），只保留“保存评语/审核通过” |
| teacher-review-code / diff | 只读代码、标准答案/参考、逐块 diff（前端算）、引用到评语 | 无接口新增；diff 是前端工作量（可先隐藏 diff，只做只读代码） |
| teacher-batch-select / confirm | 筛选、选中 N、逐条 review、进度/失败重试、按 ids 发布 | 砍“含教师评语 4 份”（列表无此字段；要显示需逐条详情）；“一键发布”拆成“审核 N 份 → 发布 N 份”两步；不承诺原子 |
| teacher-assign-wizard | 选择题/班级/时间/创建、1007 软警告 | 题型筛选前端当前页过滤；题库“使用次数/最近使用”无接口 → 不显示；打乱顺序前端做 |
| teacher-questions | 标题/题型/分值/更新时间、搜索 | 砍使用次数/最近用于；题型 chips 仅当前页过滤（或加载全部页后前端过滤） |
| teacher-class | 班级人数、作业进度（review-summary）、学生列表（getMyStudents）、按作业看状态（review-class） | 无平均分/排名；未选作业时只展示学生名单 |
| teacher-profile | 身份、字号/主题、改密、桌面版提示 | 砍通知偏好；保留本地设置 |
| teacher-code-unsupported | 原因说明、复制链接、导出/上传提示 | 砍免登录/10 分钟承诺；二维码编码当前 URL，登录后可用 |

### 4.3 管理端（3 屏）— 建议后置

| 屏 | 处置 | 理由 |
|---|---|---|
| admin-home | **砍业务 KPI**（在线/今日评分/队列/响应/异常）；如需保留，仅展示 `/admin/monitor` 的主机/进程状态 | 无任何业务聚合接口；伪造数据不可接受 |
| admin-directory | **后置桌面端**（或只读前 50 条 + 本地搜索） | 全量数组、无分页；用户 1,286 条，移动端无收益 |
| admin-monitor | **保留**为只读系统监控（主机内存/负载/PM2 进程/日志尾部） | `/admin/monitor` 真实存在；在线/队列/响应等业务指标砍 |

> v1 结论：管理端 3 屏可以整体后置；若必须保留，只保留 admin-monitor 的“系统监控”版本。学生/教师/公共/平台共 34 屏在现有接口下可交付。

---

## 5. 零后端改造 v1 的功能边界（可直接给开发/产品）

**保留（P0）**
- 登录（含多学校分支的前端选择态；不需要改后端）与角色路由。
- 学生：作业列表/详情、客观题/简答题作答、代码题只读+复制链接接力、草稿、提交、交卷确认、提交回执、成绩列表（分数/满分/待出分）、成绩详情（逐题分数+评语）、我的。
- 教师：工作台待办、作业列表（进度/待审/锁定）、作业详情、审核队列、审核详情（AI 总分+整段评语+改分+教师评语）、逐条审核、按 ids 发布、批量选择（逐条审核+进度/重试）、布置作业、题库/班级/学生、我的。
- 平台：PWA 安装引导/启动屏/状态四态。

**降级**
- 学生成绩页与详情：只保留“分数 + 满分/得分 + 逐题反馈”，不显示均分/排名/等级/构成。
- 教师审核：通用题只显示 AI 总分 + 整段评语；实训题保留 breakdown。
- 教师工作台：AI 待评/待审核/异常三个真实指标；不显示“今日审核耗时”等无接口数据。
- 批量：逐条审核 + 按 ids 发布（两步，显示进度/失败重试）；不承诺原子或一键发布。
- 接力：复制 URL/二维码（电脑需登录）；不承诺免登录、10 分钟、文件双向同步。

**砍掉**
- 成绩排名/班级均分/百分位/等级分布/学期平均分。
- 分数构成（客观/编程/过程分）与逐题满分分母（先显示得分）。
- 通用题 AI 分项条。
- 教师作业均分、题库使用次数/最近使用、批量“含教师评语 N 份”。
- 催交、打回/重做、通知偏好/推送、作业编辑/删除、管理端业务 KPI。
- 500 requestId（不伪造）。

**后置**
- 管理端 3 屏（或只保留系统监控）。
- 免登录接力 token、按 ids 的原子批量审核、管理端分页。
- 实训题提交/审核两屏（接口已有，属于 UI 补页，不是后端缺口；可在 v1.1 补）。

---

## 6. 现有接口的「口径坑」与前端处理

1. **成绩只返回 published**（后端强约束）：未发布前不要在前端缓存/显示 AI 分；`reviewed` 仍对学生不可见。
2. **`/student/scores` 的 `maxScore` 不可靠**：代码取的是第一条提交的 `question.maxScore`（`scores.js:38`），多题作业会错。前端用 `/student/assignments` 的作业级 `maxScore` 映射；不要用它算满分/得分率。
3. **`subItems` 只有 title/score/feedback**：没有题型、没有单题满分；所以成绩详情的“构成/分母”必须砍或未来补字段。
4. **`answeredCount` 是提交行数**：`realSubs.length`（`assignments.js:110`），不是去重题数；有小题/多题的作业会大于题数。列表文案用“已提交 N 项”或在详情按 `submissions` 去重算。
5. **教师列表无 aiFeedback/teacherFeedback**：审核队列卡只能显示 AI 分；评语/分项需点进详情（或实训题项目接口）再取。批量影响范围也不能算“含教师评语 N 份”。
6. **`getAssignment` 不含统计**：作业详情的进度/待审数从 `/teacher/assignments` 列表或 `/review-summary` 取；学生行从 `/review-class` 取（含未提交）。
7. **审核 ≠ 发布**：`PUT /submissions/:id/review` 置 reviewed（学生不可见），body 传 `finalScore + teacherFeedback`（审核通过可传当前 aiScore）；`PUT /submissions/publish {submissionIds}` 才 published。批量需先逐条 review，再 publish ids；publish 只处理 reviewed，部分 review 失败会导致发布数变少——UI 必须显示逐条结果。
8. **通用题 AI 无分项**：只有 `aiScore + aiFeedback` 文本；实训题的 `aiFeedback` 才是 JSON（breakdown/highlights/issues/overallComment）。前端解析要按 `question.type==='project'` 条件分支。
9. **登录多学校**：`code:1002 + schools` 已返回；需要前端补一个学校选择态（无需后端）。
10. **管理端列表全量**：`/admin/students` 一次 1,286 条；移动端若保留必须客户端切片/搜索，不要假设有分页。
11. **题库无 type/使用次数**：`getQuestions` 只支持 keyword/difficulty（`teacher/questions.js`）；题型 chips 只能前端过滤当前页，使用次数/最近使用砍掉。批量按 AI 分筛选同理：`/teacher/submissions` 无 aiScore 区间参数，需拉取 ai_graded 列表后前端过滤。
12. **500 无 requestId**：错误页用错误码/时间即可，不要伪造“ERR-…”编号。
13. **public-landing 的评分审核片段是静态品牌示意**，不是接口数据；上线可保留（需标注示意）或换成真实脱敏截图。

---

14. **交卷没有单独的 finalize 接口**：桌面既有实现是前端逐题 POST /student/assignments/:id/submit，全部题成功即视为交卷；移动端交卷确认页沿用该编排，无需新接口。
15. **考试限时/倒计时**：后端只有 startTime/endTime，没有「开始考试/记录开始时间」接口；倒计时由前端按 endTime 与进入时间计算。刷新页面后如需精确续算，需要本地保存开始时间或后续补接口（v1 可只按 endTime 倒计时）。
16. **学生剩余次数/已交次数**：maxAttempts / attemptCount 已在作业列表/详情返回，UI 可显示；无需新接口。

## 7. 如果以后要把完整设计“加回来”：最小后端改动包（按性价比）

| 优先级 | 改动 | 类型 | 难度 | 能换回的 UI |
|---|---|---|---|---|
| 1（便宜） | `/student/scores` 的 `subItems` 补 `maxScore/questionType`；修聚合 `maxScore` | 字段扩展 | S | 成绩详情逐题分母、分数构成（客观/编程） |
| 2（便宜） | `/teacher/submissions` 列表补 `aiFeedback/teacherFeedback`（或批量影响字段） | 字段扩展 | S | 队列卡 AI 评语、批量“含评语 N 份” |
| 3（便宜） | `/teacher/assignments` 补 `averageScore`；`/teacher/questions` 补 `type` 参数与 `usageCount` | 字段/参数 | S | 作业均分、题库题型/使用次数 |
| 4（中） | `/teacher/submissions/batch-review {submissionIds}`（原子或部分成功回执） | 新接口 | M | 一次点击批量审核（当前可逐条） |
| 5（中） | 打回/重做状态机（reject/rework + 学生重交规则） | 状态机 | M | 审核“打回” |
| 6（中） | 接力 token/短链（过期、免登录、文件回传） | 新接口+安全 | M | 二维码接力完整版 |
| 7（高） | 班级/学期成绩聚合（均分/排名/百分位/分布） | 聚合接口 | L | 成绩页/审核对比的完整数据 |
| 8（高） | 通用题 AI 结构化分项（输出 schema + 存储） | AI 管线 | L | 审核详情分项条 |
| 9（高） | 管理端业务概览（埋点/聚合/异常） | 监控体系 | L | admin-home/monitor 业务 KPI |
| 10（高） | 催交/通知（站内信/推送） | 基础设施 | L | 催交按钮、通知开关 |

**建议节奏**：v1 零后端交付；只有产品确认“成绩排名/构成、通用题分项、管理端 KPI、催交/打回”是刚需时，再按上表 1→3（低成本）逐项补，避免一次性大改。

---

## 8. 最终建议（给决策）

- **现在不要动后端**：v1 用现有接口即可覆盖学生/教师主流程；先验证移动端使用率与真实诉求。
- **先砍 8 类组件**：成绩聚合（均分/排名/百分位/等级分布）、成绩构成、通用题 AI 分项、教师作业均分、题库使用次数、批量含评语数、催交/打回/通知、管理端业务 KPI。
- **保留 3 个“以后可补”的接口扩展位**：成绩 subItems 字段、提交列表反馈字段、题库 type/usage；它们都是 S 级，等有明确需求再动。
- **管理端整体后置**：3 屏接口最不完整（无业务聚合、无分页），移动端价值最低；桌面端继续承担。
