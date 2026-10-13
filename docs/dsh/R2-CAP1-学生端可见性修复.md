# R2-CAP1 · 学生端「题目描述 / 评分标准」可见性修复（队长直接修复）

**结论**：不是数据缺失、也不是接口缺失 —— 是**前端入口被教师模式条件挡住**。修复=在学生模式补两个只读入口按钮（2 行级）。

## 1. 现象（用户报告）
教师 `test_teacher` 布置《Spring MVC 数据绑定和响应》期末实践考试后，学生端查看时**看不到题目描述与评分标准**。

## 2. 定位证据（云上真机，作业 id=13 / 题 id=15 / 班级 18,19）
| 层 | 证据 | 结论 |
|---|---|---|
| 数据库 | `questions.id=15`：`material` 12313 字；`scoring_rubric` 9618 字 | 数据在 ✓ |
| 快照 | `assignment_questions.rubric_snapshot = {"rubric": "…"}`、`material_snapshot` 12313 字、`snapshot_origin=publish` | 快照在 ✓ |
| 接口 | 真实学生账号（`test_s1_01`）`GET /api/student/assignments/13/project/15` ⇒ 200/code 0，`question.material`=12313 字、`question.scoringRubric`=9618 字 | 接口在 ✓ |
| 前端数据映射 | `useLoadQuestion.js:53-54`（学生分支）`form.description = question.material`、`form.scoringRubric = question.scoringRubric` | 映射正确 ✓ |
| **前端入口** | `ProjectQuestionEdit.vue` 中 `.meta-actions` 整块 `v-if="isTeacher"`，而「题目描述」「评分标准」两个按钮就在其中 | ★**根因**：学生模式不渲染入口 |
| 模态框 | 同文件：题目描述 `v-else class="readonly-desc" v-html="safeDescriptionHtml"`；评分标准 `v-else class="readonly-rubric"` | 只读展示**早已支持学生** ✓ |

## 3. 修复（本文件）
`client/src/views/teacher/ProjectQuestionEdit.vue` 的学生 `#actions` 槽内补两个按钮：
```html
<template v-if="!isTeacher" #actions>
  <a-button @click="openDescModal">题目描述</a-button>
  <a-button @click="openRubricModal">评分标准</a-button>
  <a-button type="primary" …>提交答案</a-button>
</template>
```
不改模态框、不改接口、不改数据；教师端行为零变化。

## 4. 影响面与边界
- 覆盖：**项目题**的学生作答页（`/student/assignments/:aid/project/:qid` → 本组件 `mode: student`）。
- 未覆盖（可选后续）：非项目题的学生页（`views/student/Submit.vue`）—— 题目材料在**默认折叠**的「题目材料」条中（点一下才展开），且该页无评分标准展示。如需统一，另开小改。
- 未做：把题面**默认展开内联**展示（当前仍为弹窗式）。若要改成"打开即见"，需产品口径确认后再动版式。

## 5. 验证方式
1. 构建 + 部署后，学生用 `test_s1_01` / `123456` 登录 ⇒ 进入「测试 1 班」的该作业 ⇒ 页头右上应出现「题目描述」「评分标准」两个按钮；
2. 点开分别显示 12313 字题面与 9618 字评分标准（只读，含「关闭」按钮）；
3. 教师端同样两个按钮行为不变（可编辑 + 保存）。

## 6. 交付与回滚
- 构建：`client && npm run build` ⇒ `dist/index.html` md5 变化；部署备份见部署输出（`/root/backups/exam-frontend-*.tar.gz`）。
- 回滚：恢复上一个前端 tar 包即可（静态资源，无数据库/接口变更）。