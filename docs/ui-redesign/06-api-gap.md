# 设计稿 ↔ 后端接口对账（API Gap）

> 输入：[`_api-inventory.md`](./_api-inventory.md)（全量只读接口盘点，证据到 文件:行）· [`05-page-specs.md`](./05-page-specs.md)（逐页设计规范）
> 结论口径：**设计稿里出现的每个数字，都要能回答「后端给不给得出」。** 本文把新 UI 的数据需求分成四类：✅ 已有 / ➕ 补字段 / 🆕 新接口 / 🧮 前端自算，另有一类是 ⚠️ 我在预览里放的**示意数据**，需要产品先拍板要不要做。

> ✅ **2026-10-09 交付状态**：**P0 三项 + 部分 P1 已由后端 Batch 1 交付并独立验收通过** —— 见 [07-api-batch1-verify.md](./07-api-batch1-verify.md)（复跑 59 suites / 830 tests 全绿）。
> P1-4/5/6/7 未交付（理由见交付说明 §8），对设计稿的处置见验收报告 §6。⚠️ 交付物当时仍在后端工作区未提交，接入前请确认已 commit。

---

## 0. 先回答你的问题

**要 review，而且已经 review 完了。** 结论是：**新 UI 的绝大部分数据现有接口已经能给**，真正需要后端动手的是 **3 个必做项 + 6 个增强项**，其中只有 **2 个是「非做不可」**，其余可以不做或延后——不做也能上线，只是设计稿里的某些增强信息会退化成现状。

| 分类 | 数量 | 说明 |
|---|---|---|
| ✅ 现有接口已满足 | 14 项 | 直接照设计稿做，后端零改动 |
| ➕ 现有接口补字段 | 10 项 | 不动接口形状，只加字段（改动小、风险低） |
| 🆕 需要新接口 | 8 项 | 需要后端团队排期 |
| 🧮 前端可自行计算 | 8 项 | **不要麻烦后端**（很多是现状前端已经在做的事） |
| ⚠️ 示意数据（需产品确认） | 6 项 | 我在预览里编的数字，先确认要不要，避免后端白做 |

**一句话给后端团队**：优先做「**P0 三项**」（作业应交人数、教师待审核总数、学生作业列表补 4 个字段），这三项直接决定新 UI 的核心承诺能不能兑现；其余按 P1/P2 排期即可。

---

## 1. 逐页对账表

### 1.1 教师端 · 作业管理（新 UI 改动最大的一页）

| 设计稿元素 | 数据项 | 现状 | 判定 |
|---|---|---|---|
| 表格「提交进度 38/45」 | 已提交人数 | `GET /api/teacher/assignments` → `submissionCount`（去重、排除 draft） | ✅ 已有 |
| 同上 | **应交人数（分母）** | 该接口无；同数据的 `totalStudents` 只在 `review-summary` 里有 | ➕ **P0** |
| 表格「题数」 | 题目数 | `_count.assignmentQuestions` | ✅ 已有 |
| 表格「状态」（已发布/待审核 N/AI 评分中 N/草稿） | 聚合状态 | 只有 `mode`/`locked`/`startTime`/`endTime`，需前端合成；「待审核 N」需要按作业的计数 | ➕ 需要 `pendingReviewCount`（P1，可先用 KPI 口径） |
| 表格「截止时间 + 剩 3 天 14 小时」 | 剩余时间 | `endTime` | 🧮 前端算 |
| KPI「进行中作业 3」 | 时间维度计数 | 无任何聚合接口 | 🆕 **P1** |
| KPI「待审核提交 12」 | 教师维度待审核总数 | 只能拉 `review-summary` 全量行自加（班级×作业粒度） | 🆕 **P0**（同时用于侧栏徽标） |
| KPI「本周已发布 8」 | 时间维度计数 | 无 | 🆕 P1 |
| KPI「平均分 82.4 / ↑2.1 较上次」 | 均分、环比 | 全仓无 `avg`/`average` | 🆕 P2（环比更靠后） |
| 侧栏「评分审核 ⑫」徽标 | 单一数字 | 无；且每次路由切换都要刷新，不能拉全量 review-summary | 🆕 **P0**（与 KPI 同一个接口） |
| 搜索/筛选（班级、状态） | 服务端筛选 | 作业列表除分页外**不接受任何筛选参数** | ➕ P1 |

### 1.2 教师端 · 审核工作台（ReviewDetail / ProjectReviewNew）

| 设计稿元素 | 数据项 | 现状 | 判定 |
|---|---|---|---|
| 提交人 / 学号 / 提交时间 | 学生与提交信息 | `GET /api/teacher/submissions/:id` 已含 | ✅ 已有 |
| 文件树 + 源码查看 | 工程包内容 | `GET /api/teacher/questions/:id/project-files`、`/submissions/:id/project` | ✅ 已有 |
| 评分面板「AI 95/100 + 分项明细 ✓△✗」**实训题** | 结构化分项 | `aiResult.breakdown[]`（item/score/maxScore/comment）+ `highlights[]` + `issues[]` + `overallComment` | ✅ **已有，设计稿直接对得上** |
| 同上 **客观题** | 逐项判定 | 只有文本，✓/✗/△ 是字符串里的字符 | ➕ **P1**（结构化后才能做分项列表） |
| 同上 **编程题/主观题** | 分项 | 只有 `{ score, feedback }` 整段评语 | ⚠️ 需产品确认：是否要为编程题也做分项 |
| 「上一位 / 下一位」 | 队列相邻导航 | 全仓无 next/prev 语义 | 🆕 P1 |
| 「发布成绩」二次确认写「影响 N 名学生」 | 受影响条数 | `updateMany` 后响应 `data: null` | ➕ P2 |
| 评分中进度（排队/评分中/已完成） | 状态语义 | socket `graded` 只在完成时推；实训侧有 `grading.state`，编程题侧没有 | ➕ P1（编程题补状态字段） |
| 实训题实时刷新 | 推送 | `graded` 事件只由编程/客观题链路触发，**实训链路无推送** | 🆕 P2 |

### 1.3 学生端 · 作业列表 / 作答页

| 设计稿元素 | 数据项 | 现状 | 判定 |
|---|---|---|---|
| 卡片标题 + 状态四态（未开始/进行中/已提交/已评分） | 原始字段 | `submissions[].status` + `startTime`/`endTime`/`locked` | 🧮 前端合成（现状已在做） |
| 「截止 … 剩 14 小时」 | 倒计时 | `endTime` | 🧮 前端算 |
| 「6 题 · 已完成 4 题」 | 总题数 / **已答题数** | 总题数有；已答数无（`submissions[]` 只 select `{status,id}`，不含 questionId） | ➕ **P0** |
| 「提交于 2026-10-08 21:14」 | `submittedAt` | 该接口未 select | ➕ **P0** |
| 「工程包 6.3MB · 368 个文件」 | 文件数 / 总大小 | 文件树节点有 `size`，但无汇总字段，且要另调接口 | ➕ P2 |
| 得分（92 / 满分 100） | 分数 | 列表接口不含分数；成绩走 `/student/scores` | ➕ **P0**（⚠️ 见 §4 的可见性要求） |
| 「用时 96 分钟」 | 作答时长 | 无开始作答时间字段 | ⚠️ 需产品确认 |
| 搜索作业 | 关键字 | 前端已传 `keyword`，**服务端不读**（这是个现存 bug） | ➕ P1（顺手修） |
| 作答页题号网格（已答/未答） | 每题作答状态 | 作业详情接口返回题目数组 + 提交行 | 🧮 前端算 |

### 1.4 管理端 / 全局

| 设计稿元素 | 数据项 | 现状 | 判定 |
|---|---|---|---|
| 列表页统一「服务端分页 + 搜索 + 状态筛选」 | 服务端分页 | admin 学校/班级/教师/学生、teacher 班级/学生/团队 **全是全量返回**，前端本地切片 | 🆕 P1（7 个接口） |
| 列表页表头/状态标签 | 字段 | 均已返回 | ✅ 已有 |
| 系统监控 | 队列与健康 | `/api/admin/monitor` 已有 | ✅ 已有 |

---

## 2. 🆕 需要后端开放的接口（可直接贴进 issue 的清单）

> 以下是**建议契约**，不是硬性要求；后端团队可按现有代码风格调整，但请保持响应形状与 `{ code, message, data }` 约定一致。

### P0-1 · 教师待审核总数（侧栏徽标 + KPI 共用）

```
GET /api/teacher/pending-summary?schoolId=&classId=
→ { code: 0, data: {
      pendingReview: 12,   // status = ai_graded，等待教师审核
      aiPending: 3,        // 排队 / 评分中
      abnormal: 0,         // 异常（沿用 review-summary 口径）
      updatedAt: "2026-10-09T09:12:00+08:00"
  } }
```
- **为什么必须新接口**：侧栏徽标在任何页面都要显示，不能为了一个数字拉 `review-summary`（返回全部班级 × 作业行）。
- **口径**：必须与 `review-summary` 的 `reviewPending` 一致（练习模式恒为 0），否则徽标数字和审核页对不上。
- **验收**：与审核页「待审核」Tab 的 `total` 完全相等；响应 < 100ms（现有 review-summary 是全量遍历）。

### P0-2 · 作业列表补「应交人数」

```
GET /api/teacher/assignments  →  list[] 增加：
  expectedCount: 45,        // 该作业涉及班级的学生去重数
  pendingReviewCount: 12,   // 可选：该作业待审核数（用于状态列「待审核 12」）
  latestSubmittedAt: "..."  // 可选：最新提交时间
```
- **为什么**：设计稿的「提交进度 38/45」分母来自这里；`review-summary` 里已有同口径 `totalStudents`，可复用其算法。
- **注意**：现有实现是「先查全部 submissions 再在内存里去重计数」，班级多了会变慢；建议改成 SQL 聚合。

### P0-3 · 学生作业列表补字段

```
GET /api/student/assignments  →  list[] 增加：
  submittedAt: "2026-10-08T21:14:00+08:00" | null,
  answeredCount: 4,          // 该生在此作业下已答（非 draft）的小题数
  finalScore: 92 | null,     // ⚠️ 仅 status = published（practice 模式按现有规则）
  maxScore: 100,
  attemptCount: 1
```
- **为什么**：新 UI 的学生作业卡片要在一个列表里说清「未开始 / 进行中 / 已提交 / 已评分」，现在必须额外请求 `/student/scores` 再前端拼。
- **⚠️ 可见性红线**：`finalScore` 只能在 **已发布**（或 practice 模式的既有规则）时返回，`aiScore`/`aiFeedback` **一律不下发**——之前评审已发现 `published` 查询曾返回整行含 `aiScore/aiFeedback`，这次补字段不要再引入同类问题。

### P1-4 · 作业 KPI 聚合（可整体延后）

```
GET /api/teacher/assignment-stats?schoolId=&classId=
→ { code: 0, data: {
      activeCount: 3,          // 进行中（endTime > now 且未锁定/未删除）
      publishedThisWeek: 8,    // 近 7 天发布数
      avgScore: 82.4,          // 已发布提交的平均分（口径需产品确认：按提交 or 按学生）
      avgScorePrev: 80.3       // 可选：上一次作业均分，用于「↑2.1」
  } }
```
- 若不做：新 UI 里的 KPI 行**直接删掉**即可（`05-page-specs.md` 里 KPI 行本来就标为「可选，数据量足够时才出现」），页面依然完整。

### P1-5 · 审核队列相邻导航

```
GET /api/teacher/submissions/:id/neighbors?scope=status|class&status=ai_graded
→ { code: 0, data: { prevId: 123 | null, nextId: 125 | null, index: 4, total: 12 } }
```
- 替代方案（后端零改动）：前端把当前页列表缓存在 store 里做相邻跳转——**只覆盖页内**，跨页会断。如果接受这个限制，可以不新增接口。

### P1-6 · 客观题分项结构化

```
提交详情（客观题）→ aiResult 增加：
  items: [ { label: "第1问", result: "correct" | "partial" | "wrong", comment: "…" } ]
```
- **为什么**：现在 ✓/✗/△ 是评语字符串里的字符，新 UI 的评分面板要渲染成带色标的列表，靠前端解析字符串太脆。
- 若不做：客观题评分面板退化为「整段评语 + 总分行」。

### 不需要新接口（澄清，避免白做）

| 设计稿元素 | 复用方式 |
|---|---|
| 评分审核页「已发布」Tab（IA 里新增的分栏） | 复用 `GET /api/teacher/submissions?status=published`，**不需要新接口**；只需确认该筛选口径与「按班级」视图一致 |
| 学生成绩页的逐题明细 | `/student/scores` 的 `subItems[]` **已返回、前端 0 引用**，直接渲染 |
| 审核页题目数、未交人数 | 前者在 `review-summary` 补一个 `_count`，后者前端相减 |

### P1-7 · 列表服务端分页（7 个接口）

```
GET /api/admin/{schools,classes,teachers,students}?page=&pageSize=&keyword=&status=
GET /api/teacher/{classes,students,teams}?page=&pageSize=&keyword=
→ 统一返回 { code: 0, data: { list, total, page, pageSize } }
```
- **为什么**：新 UI 的 T1 列表页模板统一用服务端分页；现在这 7 个接口全量返回，学校规模大了会一次性灌几百上千行。
- 排序/筛选字段请一并支持（新 UI 的工具栏有搜索框与状态筛选）。

### P2-8 · 其余三项（低优先）

| 接口 | 说明 |
|---|---|
| 实训题评分完成推送 | `projectGrading` 完成后同样触发 `notifyGraded`（带 `type:'project'`），前端就能从 3s 轮询改成推送 |
| 工程包汇总字段 | 工程包详情响应增加 `fileCount`、`totalBytes`（现需前端递归求和） |
| 发布动作返回受影响条数 | `PUT /teacher/submissions/publish` 返回 `{ affected: N }`，用于确认弹窗文案 |

---

## 3. ➕ 现有接口补字段清单（汇总）

| # | 接口 | 补什么 | 优先级 |
|---|---|---|---|
| 1 | `GET /teacher/assignments` | `expectedCount`、`pendingReviewCount`、`latestSubmittedAt`；支持筛选参数 | **P0** |
| 2 | `GET /student/assignments` | `submittedAt`、`answeredCount`、`finalScore`、`maxScore`、`attemptCount`；修 `keyword` 不生效 | **P0** |
| 3 | `GET /teacher/submissions/:id`（客观题） | `aiResult.items[]` 结构化判定 | P1 |
| 4 | `GET /teacher/review-summary` | 行内增加 `_count.assignmentQuestions`（题目数） | P1 |
| 5 | `GET /teacher/submissions` | 增加 `reviewedAt` 使用说明；补「已发布」视图口径 | P2 |
| 6 | `PUT /teacher/submissions/publish` | 返回 `affected` | P2 |
| 7 | 编程题提交详情 | 增加评分中状态字段（用于「AI 评分中」行内语义） | P1 |
| 8 | 工程包详情 | `fileCount` / `totalBytes` | P2 |
| 9 | `GET /teacher/assignments/:id` | 可选：`expectedCount`（详情页同口径） | P2 |
| 10 | `GET /student/assignments/:id` | 可选：与列表一致的 `finalScore` 可见性规则 | P2 |

---

## 4. 🧮 前端可以自己算的（**不要**让后端做）

| 数据 | 依据 |
|---|---|
| 倒计时 / 剩余时间 | `endTime` 已返回，现状 `Submit.vue` 已在算 |
| 未交人数 | `totalStudents - submittedCount`，现状 `Review.vue` 已在算 |
| 学生作业状态四态语义 | `startTime/endTime/locked/submissions[].status` 组合，现状已在算 |
| 单份提交的 AI 总分（跨小题求和） | `allSubmissions[].aiScore` |
| 小题满分合计、已答小题数 | 题目数组里的 `score` |
| 提交次数与最高分 | `attemptCount` / `bestScore` 已返回 |
| 成绩页逐题明细 | `/student/scores` 的 `subItems[]` **已返回但前端 0 引用**，直接渲染即可 |
| 表格排序、列宽、分页展示态 | 纯 UI |

---

## 5. ⚠️ 设计稿里的示意数据（产品先拍板，别急着让后端做）

这些数字是我在 `preview/index.html` 里为展示效果放的，**不代表真实需求**：

| 示意内容 | 出现在 | 需要产品回答 |
|---|---|---|
| 「3 份已等待超过 24 小时」 | KPI 副文案 | 要不要做「超时未审」提醒？（需按 `submittedAt` 计算，后端可给计数） |
| 「↑ 2.1 较上次作业」 | KPI 副文案 | 要不要环比？（需要 `avgScorePrev` 或按作业返回均分） |
| 「覆盖 3 个班级 · 128 名学生」 | KPI 副文案 | 要不要在 KPI 上显示覆盖范围？ |
| 「共 4 份作业 · 最近更新 09:12」 | 表尾 | 表尾信息保留还是删掉？ |
| 「用时 96 分钟」 | 学生作业卡片 | **需要新增「开始作答时间」字段**才能算——要做吗？ |
| 「9 项分项 · 3 项待改进」 | 评分面板 | 分项数量口径（现有实训题上限 8 项/各 5 条）要不要调整？ |

> 建议：**先按 P0 做，KPI 行先按「能拿到什么就显示什么」实现**，示意项等有真实数据再补，避免后端为一个装饰性数字排期。

---

## 6. 顺带发现的现存问题（不是新 UI 引入的，但与本次对账相关）

| 问题 | 证据 | 建议 |
|---|---|---|
| 学生作业列表传了 `keyword`，服务端不读 | `views/student/Assignments.vue:162` vs `studentController.js:53` | 要么后端支持，要么前端去掉该参数 |
| `GET /teacher/submissions` 不传 `schoolId` 时**不做范围限制**，返回全库提交 | `reviewController.js:14-28` | 安全项，建议强制按当前教师可见范围过滤（与 UI 无关但顺手提） |
| `getVisibleClassIds(teacherId, schoolId)` 的 `schoolId` 形参未使用 | `teamController.js:135-146` | 多校教师可见范围可能跨校 |
| legacy 体系 B 的 10 个接口前端已无人调用 | `client/src/api/projects.js` 仅 `uploadPackage` 被引用 | 新 UI 不会使用，可评估下线 |
| `graded` 推送只覆盖编程/客观题 | `gradingWorker.js:109` | 实训题审核页只能轮询 |

---

## 7. 建议的对接节奏

| 批次 | 内容 | 阻塞谁 |
|---|---|---|
| **第 1 批（P0）** | pending-summary 新接口、作业应交人数、学生列表 4 字段 | 阻塞新 UI 的「待办徽标 / 提交进度 / 学生状态贯通」三个核心变化；不阻塞其余页面落地 |
| **第 2 批（P1）** | KPI 聚合、队列相邻导航、客观题分项、7 个列表分页、编程题评分中状态 | 不阻塞 Wave 0–2 的落地（基础 + 列表页 + 表单页） |
| **第 3 批（P2）** | 实训推送、工程包汇总、发布返回条数 | 只有 Wave 3（工作台）晚期才用到 |

**与前端落地的关系**：`05-page-specs.md` 的 Wave 0–2（令牌基础、13 个列表页、表单与确认）**完全不依赖任何新接口**，可以先做；等 P0 接口好了再接教师作业管理、学生作业列表这两个页面。

---

## 附：验收自查方式

```bash
# 盘点报告中的证据行号可复核（在 worktree 根目录执行）
sed -n '374,380p' server/src/controllers/teacherController.js   # 作业列表 select，确认无应交人数
sed -n '53,103p'  server/src/controllers/studentController.js    # 学生作业列表 select，确认缺 4 字段
grep -rn "router.get" server/src/routes/teacher.js | grep -c .   # 教师端路由总数
grep -rn "avg\|average" server/src --include='*.js'             # 应为 0 处：确认无均分聚合
```
