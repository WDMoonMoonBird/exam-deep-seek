# Batch 1 后端交付验收报告（独立复核）

> 被验对象：`docs/api/2026-10-09-ui-api-batch1-delivery.md`（分支 `feat/ui-api-batch1`）
> 对账基准：`06-api-gap.md` 的 P0 三项
> 复核方式：**不采信文档自述** —— 读 diff、读实现、独立复跑全量测试、核对前端调用点兼容性

## 0. 结论

**验收通过。** P0 三项全部可用、契约与设计稿一致、安全红线有字段级断言保护；独立复跑 **59 suites / 830 tests 全绿（169s）**，与交付说明一致。

需要处理的有 **3 项**（均不影响接口可用性）：① 交付物**尚未提交**（流程风险）；② 学生端有 **4 处死引用** `aiScore/aiFeedback`（当前无功能影响，但是隐患）；③ 三处**口径/文案**需要前端按正确语义使用。

---

## 1. 复核方法与证据

| 动作 | 结果 |
|---|---|
| 读交付文档 | 10 节，含契约、行为变更登记、越权台账、curl 与验证命令 |
| 逐条读代码 diff | 6 个文件，+601 / −63（`teacherController` +250、`reviewController` +269、`studentController` +99、`projectReviewController` 20、`teamController` 24、`routes/teacher.js` +2） |
| **独立复跑全量测试** | `Test Suites: 59 passed` / `Tests: 830 passed` / 168.8s —— 与交付说明的「59 suites / 830 tests」**完全一致** |
| 核对 schema | `server/prisma/schema.prisma` **未改动** → 「无数据库迁移」属实 |
| 核对前端调用点 | 4 处行为变更风险点逐个 grep 验证（见 §4） |
| 核对学生端字段消费 | 发现 4 处死引用（见 §5.2） |

---

## 2. P0 逐条核验

### P0-1 `GET /api/teacher/pending-summary` ✅

| 核验点 | 结论 | 证据 |
|---|---|---|
| 契约字段 | `{ pendingReview, aiPending, abnormal, updatedAt }`，与文档一致 | `teacherController.getPendingSummary` |
| 口径与审核页一致 | **是**，且**有测试断言**：`pendingReview === review-summary 各行 reviewPending 之和`（含 practice 用例） | `teacher-pending-summary.test.js:226-247` |
| practice 恒 0 | 是（`row.mode === 'practice' ? 0 : r.reviewPending`） | `rollupPendingByAssignment` |
| 不传 schoolId 不退化为全库 | 是；且非法 `schoolId`（abc / 0 / 小数）**fail-closed 返回全 0** | `getPendingSummary` 首个分支 |
| 不可见 classId | 返回全 0（不报错、不越权） | `scopeClassIds = visibleIds.includes(cid) ? [cid] : []` |
| 性能 | 单次 IN 查询 + 内存 rollup，未调用 review-summary 全量接口 | `rollupPendingByAssignment` |

### P0-2 `GET /api/teacher/assignments` 补字段 + 筛选 ✅

| 核验点 | 结论 |
|---|---|
| `expectedCount`（应交人数，去重） | 交付，按「作业**全部关联班级**」花名册去重 |
| `pendingReviewCount` | 交付，按「**仅教师可见班级**」逐行 rollup |
| `latestSubmittedAt` | 交付，SQL `MAX(submitted_at)`，无则 `null` |
| `submissionCount` 改聚合 | 由「拉全表内存去重」改为 `groupBy(assignmentId, studentId)`，**口径不变** |
| 筛选 `classId / status / keyword` | 交付；status 支持 ongoing / upcoming / not_started / ended / locked，未识别值忽略并 warn（灰度友好） |
| ⚠️ 两个计数范围不同 | **刻意为之**：expectedCount = 全部关联班级、pendingReviewCount = 可见班级。团队共享作业下两者会不等 —— 前端**不要**把二者相除或放进同一个分式 |

### P0-3 `GET /api/student/assignments` 补 5 字段 ✅

| 核验点 | 结论 |
|---|---|
| 5 字段 | submittedAt / answeredCount / finalScore / maxScore / attemptCount 全部交付 |
| 🔒 安全红线 | **响应体不出现 aiScore / aiFeedback 的字段名**，测试用 JSON 文本扫描断言（`t2-student-fields.test.js:214-227`）；列表 `submissions[]` 仅 `{id,status}` |
| finalScore 可见性 | exam：仅 `published`；practice：`ai_graded`/`reviewed` 亦可见（沿用既有规则）；其余为 null（字段存在） |
| 顺带修复 | 详情端点旧的「published 整行下发」已改为白名单 `toStudentSubmissionView`（**修掉了此前的 aiScore 泄漏**） |
| keyword | 服务端现已生效（此前前端传了但被忽略） |

---

## 3. 交付文档未写、但代码里有的加分项

- 注释里写明了「改动这里必须同步 reviewController.getReviewSummary，否则徽标与审核页对不上」——把**跨文件不变量**固化在代码旁。
- 白名单注释解释了**为什么必须显式拷贝**（黑名单写法在新增敏感列时会静默泄漏）。
- 修复范围（12 处越权）与「有意接受」项（404/403 可区分但响应体零内容）都做了明示登记。

---

## 4. 行为变更 × 现有前端：逐个核验（无破坏）

| 行为变更 | 前端调用点 | 结论 |
|---|---|---|
| 批量审核/发布缺 classId → 403 | `ReviewClass.vue:236/249` 均传 schoolId + classId + assignmentId | ✅ 不破坏 |
| `PUT /teacher/submissions/publish` 需可见范围 | `ReviewDetail.vue:522` 只传 submissionIds；实现为**整批可见性校验**（不传 schoolId 时按全部可见班级），调用点来源即在可见列表内 | ✅ 不破坏（注意：任一 id 越界会**整批 403**，前端应处理 code 1003 并提示刷新） |
| `review-questions` 收敛范围 | 前端 **0 处引用** | ✅ 无影响（建议评估该端点下线） |
| 提示词预览 owner-only | 4 处调用均在教师自己的题目/提交上下文 | ✅ 不破坏 |
| `review-class` / `export-review` 范围校验 | 调用点均传 classId 且来源为可见列表 | ✅ 不破坏 |

---

## 5. 需要处理的问题

### 5.1 【流程 · 请后端立即处理】交付物尚未提交

`git status` 显示 batch1 的**全部改动都还在工作区**，没有任何提交：

```
 M server/src/controllers/{projectReview,review,student,teacher,team}Controller.js
 M server/src/routes/teacher.js
?? server/test/integration/{teacher-pending-summary,t2-student-fields,t2-teacher-scope,
     t4-teacher-idor,t5-t4-idor-review,t6-teacher-classid-idor,t7-t6-classid-review,
     qa-batch1-independent-review}.test.js
?? docs/api/
```

分支 `feat/ui-api-batch1` 的 HEAD 上没有这些内容（`git log` 看不到），**切分支 / 清理工作区 / 并行会话操作都会丢或串**。请先提交再进入下一批。

### 5.2 【前端清理 · 建议随 Wave 2 一起做】4 处死引用

`views/student/Submit.vue`（865、867、939、941 行）仍在读已被白名单移除的字段：

```js
subScores[key]    = s.finalScore ?? s.aiScore;        // s.aiScore 现在恒为 undefined
subFeedbacks[key] = s.teacherFeedback || s.aiFeedback || '';
```

**当前不产生功能问题**（服务端已把 aiScore 折叠进 finalScore、aiFeedback 折叠进 teacherFeedback），但这是隐患：一旦服务端不再折叠，界面会静默变空。建议改成只读 `finalScore` / `teacherFeedback`。

### 5.3 【前端语义 · 写代码时必须按这个来】

| 字段 | 正确语义 | 别写成 |
|---|---|---|
| `answeredCount` | **已答「小题」数**（Submission 的粒度是 `(student × question × subQuestion)`，见 schema 唯一键） | ❌ 不能和 `_count.assignmentQuestions`（**题数**）拼成「4/6 题」——两个分母不同 |
| `expectedCount` | 作业**全部关联班级**的去重学生数 | ❌ 不要与 pendingReviewCount 放进同一分式 |
| `pendingReviewCount` | **仅教师可见班级**的待审核数（= 审核页 Tab = 侧栏徽标） | ❌ 不要用来做「提交进度」分母 |
| practice 模式的 finalScore / teacherFeedback | 名义是教师分/评语，**实际可能来自 AI**（服务端折叠） | ❌ 界面上不要标注成「教师评分」 |

---

## 6. 未交付项对设计稿的影响（P1-4/5/6/7）

| 未交付 | 交付说明给的理由 | 我对设计的处置 |
|---|---|---|
| P1-4 KPI 聚合（均分/环比） | 设计稿标为「可选」，口径需产品定 | KPI 行改为**能拿到什么显示什么**（作业数、待审核数已有；均分位先留空或删） |
| P1-5 队列「上一条/下一条」 | 前端页内缓存可覆盖 | 工作台先做**页内相邻跳转**，跨页处显示「返回列表」 |
| P1-6 客观题分项结构化 | 涉及 AI 输出结构 + 存量回填 | 客观题评分面板退化为「总分 + 整段评语」，分项列表仅实训题可用（实训题本来就有 breakdown[]） |
| P1-7 七个列表服务端分页 | 改动面大，建议独立批次 | 列表页仍用前端切片（现状），模板里的「统一服务端分页」改为「分页能力就绪后切换」 |

---

## 7. 建议的下一步

1. **后端**：把工作区改动提交到 `feat/ui-api-batch1`（§5.1）。
2. **前端**：Wave 0–2 不受影响，可继续；接入 P0 时按 §5.3 的语义写。
3. **顺手**：把 `Submit.vue` 的 4 处死引用清掉（§5.2），并给 publishScores 的 403（code 1003）补一个用户提示。
4. **下一批接口**（若要做）：P1-4 KPI 需要产品先定口径（按提交 or 按学生、是否含 practice），否则后端无法开工。
