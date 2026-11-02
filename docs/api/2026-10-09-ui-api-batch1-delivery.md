# UI 重构接口交付说明 · Batch 1

> 交付分支：`feat/ui-api-batch1`（基于 `master` / `f3b3489`）｜日期：2026-10-09
> 对应设计稿对账：`Exam-DeepSeek-ui/docs/ui-redesign/06-api-gap.md`（P0 三项 + 部分 P1）
> 验证：全量 **59 suites / 830 tests 全绿**（captain 独立执行，非实现者自述）｜**无数据库迁移**

---

## 0. 一句话

06-api-gap.md 的 **P0 三项全部交付**；此外顺带收敛了 **12 处「按 id / classId 直取」的越权入口**（含可导出他班答案的 `export-review`）。所有接口均为**增量**，前端可安全对接。

---

## 1. 接口清单

| # | 接口 | 变更 | 交付类型 |
|---|---|---|---|
| 1 | `GET /api/teacher/pending-summary` | **新增** | P0-1 |
| 2 | `GET /api/teacher/assignments` | 补 3 字段 + 3 筛选 | P0-2（含 P1 筛选） |
| 3 | `GET /api/student/assignments` | 补 5 字段 + keyword 修复 | P0-3 |
| 4 | `GET /api/teacher/submissions` | **范围强制收敛**（行为变更） | 安全 |
| 5 | `GET /api/teacher/review-summary` | 行内补题目数 | P1 |
| 6 | `GET /api/student/assignments/:id` | 分数口径对齐 R14 | 一致性 |
| 7 | 12 处越权入口 | 范围校验（行为变更） | 安全 |

---

## 2. `GET /api/teacher/pending-summary`（新增）

**用途**：侧栏「评分审核 ⑫」徽标 + KPI「待审核提交 12」。

```
GET /api/teacher/pending-summary?schoolId=&classId=
→ 200 { code: 0, message: 'ok', data: {
    pendingReview: 12,   // 待教师审核（status=ai_graded 且非 practice）
    aiPending: 3,        // AI 排队/评分中（status=submitted）
    abnormal: 0,         // 评分异常（aiFeedback 为异常标记）
    updatedAt: "2026-10-09T09:12:00.000Z"
  } }
```

**口径（重要，必须与审核页一致）**
- 逐 **(作业 × 班级)** 行按**学生 rollup**：该生存在 `submitted` → 计入 `aiPending`；否则存在异常反馈 → `abnormal`；否则存在 `ai_graded` → `pendingReview`（**不重复计入**）
- `draft` 不计；**practice 模式**行 `pendingReview` **恒为 0**
- **范围恒为该教师可见班级**（直连班 + 团队共享班）；不传 `schoolId` 也不会退化为全库
- `classId` 只在可见集合内收窄；**传不可见班级 → 全 0**（fail-closed，不报错）
- 性能：单校规模实测 3–8ms（<100ms 要求）

---

## 3. `GET /api/teacher/assignments`（补字段 + 筛选）

**新增字段**

| 字段 | 类型 | 语义 | 范围 |
|---|---|---|---|
| `expectedCount` | number | 应交人数（**去重学生数**） | **作业全部关联班级** |
| `pendingReviewCount` | number | 待审核数（同 rollup 口径） | **仅教师可见班级** |
| `latestSubmittedAt` | ISO string \| null | 最新一次非 draft 提交时间 | 全部关联班级 |

> ⚠️ **两个字段范围不同，是刻意的**：
> - 「提交进度 **38/45**」→ 分子 `submissionCount` 与分母 `expectedCount` **同 population（全部关联班级）**，否则分式不正确
> - 「待审核 **12**」→ 是**我的待办队列**，只统计可见班级，**与审核页 Tab、侧栏徽标严格一致**
> - 单教师作业下两者范围相同；团队共享作业下才会出现差异

**新增筛选参数**

| 参数 | 合法值 | 说明 |
|---|---|---|
| `classId` | 可见班级 id | 不可见/非法 → **空集**（fail-closed） |
| `status` | `ongoing` \| `upcoming`(= `not_started`) \| `ended` \| `locked` | 前三个仅按时间判定；`locked` 仅看锁定。**未识别值不筛选**并记 warn（前端灰度兼容） |
| `keyword` | 字符串 | 按 `title` 模糊 |

**改造**：`submissionCount` 由"拉全部提交再内存去重"改为**聚合查询**，数值口径不变。

---

## 4. `GET /api/student/assignments`（补 5 字段）

| 字段 | 类型 | 语义 |
|---|---|---|
| `submittedAt` | ISO string \| null | 最近一次非 draft 提交时间 |
| `answeredCount` | number | 已答（非 draft）小题数 |
| `finalScore` | number \| null | **多小题求和**；可见性见下表 |
| `maxScore` | number | 该作业小题满分合计 |
| `attemptCount` | number | 尝试次数（提交行 `attemptCount` 求和） |

**可见性规则（安全红线）**

| 状态 | finalScore | 说明 |
|---|---|---|
| `published` | 返回（`finalScore ?? aiScore`） | 已发布 |
| practice + `ai_graded`/`reviewed` | 返回（同上） | 练习模式既有规则 |
| 其余（submitted / ai_graded 非练习 / reviewed 非练习） | `null` | 未放分 |

- 🔒 **响应体不出现 `aiScore` / `aiFeedback` 字段名**（字段级断言，非"值为 null"）
- 🔒 列表 `submissions[]` 行**恰为** `{ id, status }`
- ⚠️ practice 模式下 AI 分/评语以 `finalScore`/`teacherFeedback` **名义**下发（渲染结果与改造前等价；**请勿把它当作教师给的分**）
- 修复：`keyword` 现在服务端生效（此前前端传了但服务端未读）

---

## 5. 其他改动

| 接口 | 改动 |
|---|---|
| `GET /api/teacher/submissions` | **始终**收敛到教师可见班级（不传 `schoolId` 也不再返回全库）；不可见 `classId` → 空集 |
| `GET /api/teacher/review-summary` | 每行新增 `_count.assignmentQuestions`（题目数）；`classId` 与可见集合求交（不可见 → 空集） |
| `GET /api/student/assignments/:id` | 分数口径跟随 R14（与列表/成绩页一致） |

---

## 6. 行为变更登记（**发布说明需登记**）

| # | 变更 | 旧行为 | 新行为 |
|---|---|---|---|
| 1 | 批量审核/发布端点 | 缺 `classId` → 200 零写入 | 缺/非法 `classId` → **403**；`schoolId` 缺/非法 → 400 |
| 2 | `review-questions` 不可见 classId | 返回该班题目 | **403** |
| 3 | `review-questions` 不传 classId | **全局**返回（含跨校教师题目） | 仅该教师可见范围 |
| 4 | 题目级提示词预览 | 任一教师可预览任一题目 | **owner-only**（题库/编辑页本就 owner-only） |
| 5 | 跨教师访问他人提交详情/改分/审核/发布 | 允许 | **403**（响应体零内容） |
| 6 | 评分审核类接口 `studentNo` 出口（2026-11-02） | `学号@院校代码` | **纯学号**（展示投影；`users.username`/登录/唯一性不变，导出 Excel 学号列可直接对接教务系统） |

> 第 1 项已核对：client 端所有调用均传 `classId`，**无即时破坏**。

---

## 7. 越权治理台账（本次累计收敛 12 处）

| 端点 | 修复前风险 |
|---|---|
| `GET /teacher/submissions` | 不传范围参数 → 全库提交 |
| `GET /teacher/submissions/:id` 等 6 个 submissionId 入口 | 按 id 直取（含参考答案） |
| `GET /teacher/export-review` | 🔴 **可导出任意班级的姓名/学号/答案/分数** |
| `GET /teacher/review-class/:classId` | 🔴 任意班级花名册 + 分数 |
| `GET /teacher/review-questions` | 🔴 不传 classId → 全平台题目 |
| 3 个提示词预览端点 | 他人题目的标准包内容 + 参考答案 |
| `GET /student/assignments`（published 整行） | 🔴 含 `aiScore/aiFeedback` 整行下发学生 |
| `getVisibleClassIds` | `schoolId` 形参未生效（多校教师可见范围跨校） |

**有意接受**：`404 不存在` 与 `403 不可见` 可区分（存在性可探测，但**响应体零内容**）；如需统一为 404 请提需求。

---

## 8. 与你对账文档的差异说明

| 你的建议 | 实际交付 | 原因 |
|---|---|---|
| P0-1 口径"与 review-summary 一致" | ✅ 完全一致（含 practice 恒 0、rollup 优先序） | 侧栏徽标必须与审核页数字相同 |
| P0-2 `expectedCount` | ✅ 交付 | — |
| P0-3 `finalScore` 仅 published | ✅ 交付（practice 按既有规则） | 沿用现网语义 |
| P1-4 KPI 聚合（均分/环比） | ⏸ 未做 | 设计稿标注"可选"，口径需产品定 |
| P1-5 队列相邻导航 | ⏸ 未做 | 前端页内缓存可覆盖 |
| P1-6 客观题分项结构化 | ⏸ 未做 | 涉及 AI 输出结构变更 + 存量回填 |
| P1-7 七个列表服务端分页 | ⏸ 未做 | 改动面大，建议独立批次 |

---

## 9. curl 示例

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"test_teacher","password":"test_teacher"}' | jq -r .data.token)

# 待审核汇总
curl -s "http://localhost:3000/api/teacher/pending-summary" -H "Authorization: Bearer $TOKEN" | jq

# 作业列表（含新字段 + 筛选）
curl -s "http://localhost:3000/api/teacher/assignments?status=ongoing&keyword=用户" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.list[0] | {expectedCount,pendingReviewCount,latestSubmittedAt,submissionCount}'
```

---

## 10. 验证与回归

```bash
cd server && npm run check:layers     # 违规 0
# 全量（需指向测试库，否则 setup.js 白名单护栏会静默 exit 1）
cd server && URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed 's#/exam_system#/exam_system_test#') \
  && DATABASE_URL="$URL" NODE_OPTIONS=--experimental-vm-modules \
     npx jest --config test/jest.config.js --runInBand --forceExit
```

**新增测试（8 文件，共 100 例）**：`teacher-pending-summary`(13) · `t2-teacher-scope` · `t2-student-fields`(19) · `qa-batch1-independent-review`(17, 独立复核) · `t4-teacher-idor`(17) · `t5-t4-idor-review`(17, 独立复核) · `t6-teacher-classid-idor`(18) · `t7-t6-classid-review`(12, 独立复核)
