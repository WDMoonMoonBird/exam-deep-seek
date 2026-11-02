# 后端接口盘点（只读事实清单）

> **盘点对象**：git worktree `Exam-DeepSeek-ui`，分支 `feat/ui-redesign`，HEAD `efadb2a`（代码快照 = `cd8cabc`，`efadb2a` 仅追加 `docs/ui-redesign/` 设计文档）。
> **盘点范围**：`server/src/**`（只读）+ `client/src/**`（只读，仅用于判断字段是否已被前端消费）。
> **未读取**主工作区 `Exam-DeepSeek`。本文只做事实盘点：不写实现代码、不给改造建议。
> **行号**均为本 worktree 当前行号；字段名一律照抄源码，未做意译。
> **接口口径**：路由文件内注册 92 个处理器（admin 16 + teacher 54 + projects 11 + student 9 + auth 2）+ `app.js` 内联 2 个（`/api/health`、`/api/internal/graded`）= **94 个**。任务描述中的「92 个」与路由文件内 92 个一致。
> **挂载前缀**：见 `server/src/app.js:95-99`（`/api/auth`、`/api/admin`、`/api/teacher`、`/api/teacher/projects`、`/api/student`）。

---

## A. 接口总表

### A.0 公共 / 认证 / 内部

| 模块 | 方法 | 完整路径 | 权限中间件 | 控制器文件:行号 | 一句话用途 |
|---|---|---|---|---|---|
| 公共/认证 | POST | `/api/auth/login` | 无（app.js:51 登录失败限流） | authController.js:6 | 登录签发 JWT；多学校返回学校列表 |
| 公共/认证 | PUT | `/api/auth/password` | auth | authController.js:102 | 修改本人密码 |
| 公共/认证 | GET | `/api/health` | 无 | app.js:78 | 健康检查（data.status='running'） |
| 内部 | POST | `/api/internal/graded` | 无中间件；校验 `Authorization: Bearer <INTERNAL_SECRET>`（app.js:83-88） | app.js:84 | Worker 评分完成回调 → notifyGraded 广播 |

### A.1 管理端（挂载 `/api/admin`，整个路由组 `router.use(auth, requireRole('super_admin'))` — `routes/admin.js:7`）

| 模块 | 方法 | 完整路径 | 权限中间件 | 控制器文件:行号 | 一句话用途 |
|---|---|---|---|---|---|
| 管理端 admin | GET | `/api/admin/schools` | auth + requireRole('super_admin') | adminController.js:7 | 学校列表（全量，无分页） |
| 管理端 admin | GET | `/api/admin/classes` | auth + requireRole('super_admin') | adminController.js:65 | 班级列表（可按 schoolId 过滤） |
| 管理端 admin | POST | `/api/admin/classes` | auth + requireRole('super_admin') | adminController.js:81 | 新建班级 |
| 管理端 admin | PUT | `/api/admin/classes/:id` | auth + requireRole('super_admin') | adminController.js:103 | 更新班级名称 |
| 管理端 admin | DELETE | `/api/admin/classes/:id` | auth + requireRole('super_admin') | adminController.js:128 | 删除班级并清理关联 |
| 管理端 admin | GET | `/api/admin/teachers` | auth + requireRole('super_admin') | adminController.js:146 | 教师列表（含所属学校） |
| 管理端 admin | POST | `/api/admin/teachers` | auth + requireRole('super_admin') | adminController.js:160 | 新建教师 |
| 管理端 admin | PUT | `/api/admin/teachers/:id` | auth + requireRole('super_admin') | adminController.js:181 | 更新教师与学校关联 |
| 管理端 admin | PUT | `/api/admin/teachers/:id/reset-password` | auth + requireRole('super_admin') | adminController.js:208 | 重置教师密码为工号 |
| 管理端 admin | DELETE | `/api/admin/teachers/:id` | auth + requireRole('super_admin') | adminController.js:224 | 软删除教师 |
| 管理端 admin | GET | `/api/admin/students` | auth + requireRole('super_admin') | adminController.js:246 | 学生列表（可按班级过滤） |
| 管理端 admin | POST | `/api/admin/students` | auth + requireRole('super_admin') | adminController.js:268 | 新建学生 |
| 管理端 admin | GET | `/api/admin/monitor` | auth + requireRole('super_admin') | adminController.js:319 | 服务器监控（PM2 进程 + 日志 + 系统信息） |
| 管理端 admin | GET | `/api/admin/settings` | auth + requireRole('super_admin') | adminController.js:397 | 读取 AI 配置（API Key 脱敏） |
| 管理端 admin | PUT | `/api/admin/settings` | auth + requireRole('super_admin') | adminController.js:437 | 保存 AI 配置 |
| 管理端 admin | POST | `/api/admin/settings/test-connection` | auth + requireRole('super_admin') | adminController.js:480 | AI 连接探活（返回延迟） |

> 备注：`adminController.js` 中 `createSchool:17` / `updateSchool:31` / `deleteSchool:44` 三个导出函数**未在 `routes/admin.js` 注册**（学校为只读，`routes/admin.js:9-10` 注释「数据来自教育部」）。

### A.2 教师端（挂载 `/api/teacher`，整个路由组 `router.use(auth, requireRole('teacher'))` — `routes/teacher.js:10`）

| 模块 | 方法 | 完整路径 | 权限中间件 | 控制器文件:行号 | 一句话用途 |
|---|---|---|---|---|---|
| 教师端 teacher | PUT | `/api/teacher/switch-school` | auth + requireRole('teacher') | teacherController.js:17 | 切换教师当前学校（写 lastSchoolId） |
| 教师端 teacher | GET | `/api/teacher/my-schools` | auth + requireRole('teacher') | teacherController.js:532 | 我的学校列表 |
| 教师端 teacher | GET | `/api/teacher/classes` | auth + requireRole('teacher') | teacherController.js:545 | 我的可见班级（直连 + 团队） |
| 教师端 teacher | POST | `/api/teacher/classes` | auth + requireRole('teacher') | teacherController.js:570 | 新建班级 |
| 教师端 teacher | PUT | `/api/teacher/classes/:id` | auth + requireRole('teacher') | teacherController.js:591 | 更新班级与团队归属 |
| 教师端 teacher | DELETE | `/api/teacher/classes/:id` | auth + requireRole('teacher') | teacherController.js:610 | 删除班级及关联 |
| 教师端 teacher | PUT | `/api/teacher/classes/:id/switch-school` | auth + requireRole('teacher') | teacherController.js:626 | 班级跨校迁移（自动退出团队） |
| 教师端 teacher | GET | `/api/teacher/questions` | auth + requireRole('teacher') | teacherController.js:31 | 题库列表（分页/难度/关键字） |
| 教师端 teacher | GET | `/api/teacher/questions/:id/project-files` | auth + requireRole('teacher') | teacherController.js:70 | 实训题标准包文件树 + 文件内容 |
| 教师端 teacher | GET | `/api/teacher/questions/:id/prompt-preview` | auth + requireRole('teacher') | reviewController.js:704 | 编程题 AI 提示词模板预览 |
| 教师端 teacher | GET | `/api/teacher/questions/:id/project-prompt-preview` | auth + requireRole('teacher') | projectReviewController.js:218 | 实训题 AI 提示词模板预览 |
| 教师端 teacher | GET | `/api/teacher/questions/:id` | auth + requireRole('teacher') | teacherController.js:56 | 题目详情（含小题） |
| 教师端 teacher | POST | `/api/teacher/questions` | auth + requireRole('teacher') | teacherController.js:161 | 新建题目 |
| 教师端 teacher | PUT | `/api/teacher/questions/:id` | auth + requireRole('teacher') | teacherController.js:231 | 更新题目 |
| 教师端 teacher | DELETE | `/api/teacher/questions/:id` | auth + requireRole('teacher') | teacherController.js:297 | 软删除题目 |
| 教师端 teacher | POST | `/api/teacher/parse-exam` | auth + requireRole('teacher') | teacherController.js:313 | 解析试卷文本为题目 |
| 教师端 teacher | POST | `/api/teacher/parse-exam-stream` | auth + requireRole('teacher') | teacherController.js:334 | 流式解析试卷（带进度回调） |
| 教师端 teacher | POST | `/api/teacher/generate-reference` | auth + requireRole('teacher') | teacherController.js:980 | AI 生成参考答案 |
| 教师端 teacher | POST | `/api/teacher/upload-material` | auth + requireRole('teacher') | teacherController.js:969 | 上传题面素材 |
| 教师端 teacher | GET | `/api/teacher/assignments` | auth + requireRole('teacher') | teacherController.js:365 | 作业列表（含题目数、已提交人数） |
| 教师端 teacher | GET | `/api/teacher/assignments/:id` | auth + requireRole('teacher') | teacherController.js:418 | 作业详情（题目 + 班级） |
| 教师端 teacher | POST | `/api/teacher/assignments` | auth + requireRole('teacher') | teacherController.js:437 | 布置作业 |
| 教师端 teacher | PUT | `/api/teacher/assignments/:id/lock` | auth + requireRole('teacher') | teacherController.js:492 | 锁定/解锁作业 |
| 教师端 teacher | GET | `/api/teacher/review-summary` | auth + requireRole('teacher') | reviewController.js:277 | 审核汇总（班级×作业：应交/已交/待评分/待审核/异常） |
| 教师端 teacher | GET | `/api/teacher/review-class/:classId` | auth + requireRole('teacher') | reviewController.js:345 | 班级成绩明细（分页/筛选/排序） |
| 教师端 teacher | GET | `/api/teacher/review-questions` | auth + requireRole('teacher') | reviewController.js:74 | 可审题目列表（去重） |
| 教师端 teacher | GET | `/api/teacher/submissions` | auth + requireRole('teacher') | reviewController.js:46 | 提交列表（分页/状态/班级/题目筛选） |
| 教师端 teacher | GET | `/api/teacher/submissions/:id` | auth + requireRole('teacher') | reviewController.js:95 | 提交详情（通用题，含全部小题提交） |
| 教师端 teacher | GET | `/api/teacher/submissions/:id/prompt` | auth + requireRole('teacher') | reviewController.js:735 | 本次评分实际提示词（编程题） |
| 教师端 teacher | GET | `/api/teacher/submissions/:id/project/prompt` | auth + requireRole('teacher') | projectReviewController.js:248 | 本次评分实际提示词（实训题） |
| 教师端 teacher | PUT | `/api/teacher/submissions/:id/score` | auth + requireRole('teacher') | reviewController.js:147 | 行内修改最终分 |
| 教师端 teacher | PUT | `/api/teacher/submissions/:id/review` | auth + requireRole('teacher') | reviewController.js:162 | 单份提交审核 |
| 教师端 teacher | GET | `/api/teacher/project-submission/:id` | auth + requireRole('teacher') | projectReviewController.js:91 | 实训题三栏审核数据（标准包 + 学生版本 + AI 评语） |
| 教师端 teacher | POST | `/api/teacher/submissions/:id/regrade` | auth + requireRole('teacher') | reviewController.js:134 | 重新触发 AI 评分 |
| 教师端 teacher | PUT | `/api/teacher/submissions/publish` | auth + requireRole('teacher') | reviewController.js:262 | 批量发布成绩（reviewed→published） |
| 教师端 teacher | POST | `/api/teacher/submissions/batch-review` | auth + requireRole('teacher') | reviewController.js:173 | 批量审核并发布 |
| 教师端 teacher | POST | `/api/teacher/submissions/batch-publish` | auth + requireRole('teacher') | reviewController.js:221 | 按班级/题目批量发布 |
| 教师端 teacher | GET | `/api/teacher/export-review` | auth + requireRole('teacher') | reviewController.js:432 | 导出审核数据（JSON：rows + headerCells） |
| 教师端 teacher | GET | `/api/teacher/submissions/:id/project` | auth + requireRole('teacher') | reviewController.js:604 | 实训题审核数据（旧体系B 版） |
| 教师端 teacher | PUT | `/api/teacher/submissions/:id/project/review` | auth + requireRole('teacher') | reviewController.js:661 | 实训题审核通过（写 finalScore/teacherFeedback） |
| 教师端 teacher | POST | `/api/teacher/submissions/:id/project/regrade` | auth + requireRole('teacher') | projectReviewController.js:163 | 实训题重新评分（异步投递） |
| 教师端 teacher | GET | `/api/teacher/teams` | auth + requireRole('teacher') | teamController.js:7 | 我的教学团队列表 |
| 教师端 teacher | GET | `/api/teacher/teams/:id` | auth + requireRole('teacher') | teamController.js:31 | 团队详情 |
| 教师端 teacher | POST | `/api/teacher/teams` | auth + requireRole('teacher') | teamController.js:50 | 新建团队 |
| 教师端 teacher | PUT | `/api/teacher/teams/:id` | auth + requireRole('teacher') | teamController.js:73 | 更新团队成员/班级 |
| 教师端 teacher | DELETE | `/api/teacher/teams/:id` | auth + requireRole('teacher') | teamController.js:103 | 解散团队 |
| 教师端 teacher | POST | `/api/teacher/teams/:id/leave` | auth + requireRole('teacher') | teamController.js:119 | 退出团队 |
| 教师端 teacher | GET | `/api/teacher/teachers` | auth + requireRole('teacher') | teacherController.js:513 | 同校教师列表 |
| 教师端 teacher | GET | `/api/teacher/students` | auth + requireRole('teacher') | teacherController.js:685 | 我的学生列表（可按班级/关键字） |
| 教师端 teacher | POST | `/api/teacher/students` | auth + requireRole('teacher') | teacherController.js:821 | 新增单个学生 |
| 教师端 teacher | POST | `/api/teacher/students/batch` | auth + requireRole('teacher') | teacherController.js:850 | 批量导入学生 |
| 教师端 teacher | PUT | `/api/teacher/students/:id` | auth + requireRole('teacher') | teacherController.js:734 | 更新学生（姓名/学号/班级） |
| 教师端 teacher | PUT | `/api/teacher/students/:id/reset-password` | auth + requireRole('teacher') | teacherController.js:799 | 重置学生密码为学号 |
| 教师端 teacher | DELETE | `/api/teacher/students/:id` | auth + requireRole('teacher') | teacherController.js:783 | 删除学生及其提交 |

### A.3 教师端·实训 legacy（挂载 `/api/teacher/projects`，鉴权在 `app.js:98`：`auth, requireRole('teacher')`；`routes/projects.js` 自身无 `router.use`）

| 模块 | 方法 | 完整路径 | 权限中间件 | 控制器文件:行号 | 一句话用途 |
|---|---|---|---|---|---|
| 教师端 实训（legacy 体系B） | POST | `/api/teacher/projects/upload-package` | auth + requireRole('teacher') | projectController.js:345 | 上传标准工程包（zip 解压入库） |
| 教师端 实训（legacy 体系B） | GET | `/api/teacher/projects` | auth + requireRole('teacher') | projectController.js:35 | 实训任务列表（legacy） |
| 教师端 实训（legacy 体系B） | POST | `/api/teacher/projects` | auth + requireRole('teacher') | projectController.js:122 | 新建实训任务 |
| 教师端 实训（legacy 体系B） | GET | `/api/teacher/projects/:id` | auth + requireRole('teacher') | projectController.js:91 | 实训任务详情（含文件树） |
| 教师端 实训（legacy 体系B） | PUT | `/api/teacher/projects/:id` | auth + requireRole('teacher') | projectController.js:219 | 更新实训任务 |
| 教师端 实训（legacy 体系B） | DELETE | `/api/teacher/projects/:id` | auth + requireRole('teacher') | projectController.js:325 | 软删除实训任务 |
| 教师端 实训（legacy 体系B） | GET | `/api/teacher/projects/:id/submissions` | auth + requireRole('teacher') | projectSubmissionController.js:14 | 实训提交列表（含 stats 汇总） |
| 教师端 实训（legacy 体系B） | GET | `/api/teacher/projects/:id/submissions/:submissionId` | auth + requireRole('teacher') | projectSubmissionController.js:86 | 实训提交详情（含文件树） |
| 教师端 实训（legacy 体系B） | GET | `/api/teacher/projects/:id/submissions/:submissionId/file` | auth + requireRole('teacher') | projectSubmissionController.js:130 | 读取提交内单个文件内容 |
| 教师端 实训（legacy 体系B） | PUT | `/api/teacher/projects/:id/submissions/:submissionId/review` | auth + requireRole('teacher') | projectSubmissionController.js:201 | 保存实训评分 |
| 教师端 实训（legacy 体系B） | POST | `/api/teacher/projects/:id/submissions/:submissionId/regrade` | auth + requireRole('teacher') | projectSubmissionController.js:245 | 实训提交重新评分 |

### A.4 学生端（挂载 `/api/student`，整个路由组 `router.use(auth, requireRole('student'))` — `routes/student.js:7`）

| 模块 | 方法 | 完整路径 | 权限中间件 | 控制器文件:行号 | 一句话用途 |
|---|---|---|---|---|---|
| 学生端 student | GET | `/api/student/assignments` | auth + requireRole('student') | studentController.js:51 | 我的作业列表 |
| 学生端 student | GET | `/api/student/assignments/:assignmentId/project/:questionId` | auth + requireRole('student') | studentController.js:468 | 实训题作答页数据（题面 + 本人提交 + 文件树） |
| 学生端 student | POST | `/api/student/assignments/:assignmentId/project/:questionId/submit` | auth + requireRole('student') | studentController.js:535 | 提交实训题工程包（zip） |
| 学生端 student | GET | `/api/student/assignments/:id` | auth + requireRole('student') | studentController.js:129 | 作业详情（含题目与本人提交） |
| 学生端 student | POST | `/api/student/assignments/:id/submit` | auth + requireRole('student') | studentController.js:188 | 提交答案 |
| 学生端 student | PUT | `/api/student/assignments/:id/draft` | auth + requireRole('student') | studentController.js:207 | 保存草稿 |
| 学生端 student | POST | `/api/student/assignments/:id/retry` | auth + requireRole('student') | studentController.js:225 | 重做作业 |
| 学生端 student | GET | `/api/student/scores` | auth + requireRole('student') | studentController.js:243 | 我的成绩（按作业聚合） |
| 学生端 student | GET | `/api/student/profile` | auth + requireRole('student') | studentController.js:293 | 个人信息（姓名/学号/班级） |

---

## B. 关键接口的响应字段

> 统一响应外壳：`{ code, message, data }`（成功 `code: 0`）。下表的「顶层字段」指 `data` 内部结构。

### B.1 教师端

**① 作业列表 `GET /api/teacher/assignments`**（`teacherController.js:365`，select 见 374-380，追加字段见 388-409）
- data：`list`、`total`、`page`、`pageSize`
- `list[]`：`id`、`title`、`startTime`、`endTime`、`createdAt`、`mode`、`maxAttempts`、`locked`
- `list[].teacher`：`realName`
- `list[].assignmentClasses[]`：`assignmentId`、`classId`、`class{ id, name }`
- `list[]._count`：`assignmentQuestions`
- `list[].submissionCount`（服务端去重统计，排除 `status='draft'`，405 行注入）

**② 作业详情 `GET /api/teacher/assignments/:id`**（`teacherController.js:418`，返回 `Assignment` 全字段 + include）
- data 顶层：`id`、`teacherId`、`title`、`description`、`startTime`、`endTime`、`allowResubmit`、`mode`、`maxAttempts`、`locked`、`createdAt`、`deletedAt`
- `assignmentQuestions[]`：`id`、`assignmentId`、`questionId`、`sortOrder` + `question{ Question 全字段 }`（`id, teacherId, title, maxScore, difficulty, type, material, attachmentUrl, objectiveSettings, scoringRubric, createdAt, deletedAt`）
- `assignmentClasses[]`：`assignmentId`、`classId` + `class{ Class 全字段 }`
- 注意：软删除题目在 JS 层被过滤（429 行）

**③ 班级列表 `GET /api/teacher/classes`**（`teacherController.js:545`；query `schoolId` 缺省直接返回 `[]`，548 行）
- data：数组（无分页外壳）
- 每项：`id`、`name`、`schoolId`、`createdAt`
- `school`：`id`、`name`、`officialCode`、`province`、`city`、`level`、`createdAt`
- `teacherClasses[]`：`teacherId`、`classId` + `teacher{ id, username, realName }`
- `teamClasses[]`：`teamId`
- `_count`：`studentClasses`
- 追加：`isTeamClass`（boolean）、`ownerTeacherName`（string）— 558-562 行

**④ 学生列表 `GET /api/teacher/students`**（`teacherController.js:685`；query `schoolId`、`classId`、`keyword`；无分页）
- data：数组；每项 `id`、`username`、`realName`、`createdAt`
- `studentClasses[]`：`studentId`、`classId` + `class{ Class 全字段 + school{ School 全字段 } }`

**⑤ 题库列表 `GET /api/teacher/questions`**（`teacherController.js:31`）
- data：`list`、`total`、`page`、`pageSize`
- `list[]`：`id`、`title`、`type`、`difficulty`、`maxScore`、`createdAt`、`_count.subQuestions`

**⑥ 评分审核列表 / 待审核队列**
- `GET /api/teacher/review-summary`（`reviewController.js:277`；query `schoolId` 必填、`classId` 可选）：data = 行数组（每行 = 班级 × 作业），字段 `assignmentId`、`title`、`classId`、`className`、`startTime`、`endTime`、`mode`、`locked`、`totalStudents`、`submittedCount`、`aiPending`、`reviewPending`、`abnormal`、`aiCompleted`、`allAiDone`、`allReviewed`（325-333 行）
- `GET /api/teacher/submissions`（`reviewController.js:46`；query `schoolId`、`classId`、`questionId`、`status`（逗号分隔）、`page`、`pageSize`）：data = `list`、`total`、`page`、`pageSize`；`list[]` = `id`、`status`、`aiScore`、`finalScore`、`submittedAt`、`student{ id, username, realName }`、`question{ id, title, maxScore }`、`assignment{ id, title }`、`schoolName`（43 行 enrichWithSchool 追加）
- `GET /api/teacher/review-questions`（`reviewController.js:74`）：data = `[{ id, title }]`（按 `questionId` 去重）

**⑦ 班级成绩明细 `GET /api/teacher/review-class/:classId`**（`reviewController.js:345`；query `assignmentId`、`keyword`、`page`、`pageSize`、`filter`、`sortField`、`sortOrder`）
- data：`list`、`total`
- 已交行（388-396）：`id`、`studentId`、`studentName`、`studentNo`、`schoolName`、`className`、`assignmentTitle`、`mode`、`aiScore`、`finalScore`、`status`、`submitted`、`projectSubmissionId`
- 未交行（398-404）：`id`（值形如 `ns-{studentId}`）、`studentId`、`studentName`、`studentNo`、`schoolName`、`className`、`assignmentTitle`（空串）、`mode`（`'exam'`）、`aiScore`（null）、`finalScore`（null）、`status`（`'not_submitted'`）、`submitted`（false）
- `status` 可能取值：`draft` / `submitted` / `ai_graded` / `reviewed` / `published` / `abnormal`（382-384 行合成）/ `not_submitted`
- `studentNo` 为**展示用纯学号**（评分审核接口出口已去 `@院校代码` 后缀）；账号真值仍是 `users.username`，登录/唯一性不受影响

**⑧ 提交详情（通用题）`GET /api/teacher/submissions/:id`**（`reviewController.js:95-127`）
- data = `Submission` 全字段：`id`、`assignmentId`、`studentId`、`questionId`、`subQuestionId`、`answer`、`aiScore`、`aiFeedback`、`finalScore`、`teacherFeedback`、`status`、`submittedAt`、`reviewedAt`、`attemptCount`、`bestScore`
- `student`：`id`、`username`（**展示用纯学号**，已去 `@院校代码` 后缀；账号真值仍存于 `users.username`）、`realName`
- `question`：`Question` 全字段 + `subQuestions[]`（`SubQuestion` 全字段：`id`、`questionId`、`sortOrder`、`title`、`type`、`score`、`content`、`referenceAnswer`、`language`、`objectiveItems`、`scoringCriteria`）
- `subQuestion`：`SubQuestion` 或 null
- `assignment`：`id`、`title`、`mode`
- `allSubmissions[]`：同一 `assignmentId`+`studentId`+`questionId` 的所有小题提交行（含 `subQuestion`）
- `schoolName`：string

**⑨ 实训题提交详情 `GET /api/teacher/project-submission/:id`**（`projectReviewController.js:91`）
- `submission`：走 `toTeacherView` 白名单（`utils/projectView.js:79-95`）→ `id`、`questionId`、`assignmentId`、`studentId`、`status`、`submittedAt`、`attemptCount`、`version`、`aiScore`、`aiFeedback`、`finalScore`、`teacherFeedback`、`grading{ state, version, attempts, error, prevStatus }`
- `question`：`id`、`title`、`material`、`scoringRubric`、`maxScore`
- `assignment`：`id`、`title`、`mode`；`student`：`id`、`username`、`realName`
- `version`：number
- `standardFiles` / `studentFiles`：各为 `{ tree, contents }`（`contents` 为「相对路径 → 文件正文」映射）
- `aiResult`：null 或 `JSON.parse(aiFeedback)` → `breakdown[{ item, score, maxScore, comment }]`、`highlights[]`、`issues[]`、`overallComment`
- 旧体系B 版 `GET /api/teacher/submissions/:id/project`（`reviewController.js:604`）字段同构，`question` 额外含 `attachmentUrl`、`type`

**⑩ 实训任务 / 实训提交（legacy 体系B）**
- `GET /api/teacher/projects`（`projectController.js:35`）：data = `list`、`total`、`page`、`pageSize`；`list[]` = `id`、`title`、`startTime`、`endTime`、`status`、`createdAt`、`classes[]`、`_count.submissions`、`submissionCount`、`totalStudents`（58-80 行注入）
- `GET /api/teacher/projects/:id/submissions`（`projectSubmissionController.js:14`）：data = `list`、`total`、`page`、`pageSize`、`stats{ submitted, unsubmitted, graded, totalStudents }`；`list[]` = `id`、`projectId`、`studentId`、`machineScore`、`astScore`、`aiScore`、`totalScore`、`finalScore`、`teacherFeedback`、`status`、`submittedAt`、`reviewedAt`、`student{ id, username, realName }`
- `GET /api/teacher/projects/:id/submissions/:submissionId`（`:86`）：`ProjectSubmission` 全字段 + `student` + `files`（响应中被置为 `undefined`）+ `project{ id, title, machineWeight, astWeight, aiWeight }` + `fileTree`

### B.2 学生端

**① 我的作业列表 `GET /api/student/assignments`**（`studentController.js:51`）
- data：`list`、`total`、`page`、`pageSize`
- `list[]`：`id`、`title`、`description`、`startTime`、`endTime`、`allowResubmit`、`createdAt`、`deletedAt`、`mode`、`locked`
- `list[]._count`：`assignmentQuestions`
- `list[].assignmentQuestions[]`：`question{ id, type }`（仅两字段，用于判定是否含实训题）
- `list[].submissions[]`：`status`、`id`（**仅此两字段**，570-101 行 select）

**② 作业详情 `GET /api/student/assignments/:id`**（`studentController.js:129`）
- data：`assignment`、`submissions`
- `assignment`：`Assignment` 全字段 + `assignmentQuestions[]`（`AssignmentQuestion` 全字段 + `question{ Question 全字段 + subQuestions[] }`）
- `submissions[]`：`Submission` 全字段；未发布时 `aiScore`/`aiFeedback`/`finalScore`/`teacherFeedback` 被置 null（158 行）
- 未达到看答案条件时，`subQuestions[].referenceAnswer`、`scoringCriteria`、`objectiveItems[].answer` 被置 null（168-179 行）

**③ 我的成绩 `GET /api/student/scores`**（`studentController.js:243`，服务端按作业聚合）
- data：数组；每项 `assignmentId`、`assignmentTitle`、`mode`、`questionTitle`、`totalScore`、`maxScore`、`bestScore`、`attemptCount`、`subItems[]`
- `subItems[]`：`title`、`score`、`feedback`（280-284 行）
- 取数范围：`status='published'` 或（练习模式且 `status in ['ai_graded','reviewed']`）（249-252 行）

**④ 实训题作答页 `GET /api/student/assignments/:assignmentId/project/:questionId`**（`studentController.js:468`）
- data：`question{ id, title, difficulty, maxScore, material, scoringRubric }`、`submission`（走 `toStudentView`，`utils/projectView.js:54-75`：`id`、`questionId`、`assignmentId`、`status`、`submittedAt`、`version`、`score`、`feedback`、`gradingState`）、`files{ tree, contents }`

**⑤ 个人信息 `GET /api/student/profile`**（`studentController.js:293`）：`realName`、`username`、`classes[{ className, schoolName }]`

### B.3 管理端

- `GET /api/admin/schools`（`adminController.js:7`）：`School` 全字段 → `id`、`name`、`officialCode`、`province`、`city`、`level`、`createdAt`
- `GET /api/admin/classes`（`:65`）：`Class` 全字段 + `school{ School 全字段 }`
- `GET /api/admin/teachers`（`:146`）：`id`、`username`、`realName`、`createdAt` + `teacherSchools[]{ teacherId, schoolId, school{ School 全字段 } }`
- `GET /api/admin/students`（`:246`）：`id`、`username`、`realName`、`createdAt` + `studentClasses[]{ studentId, classId, class{ Class 全字段 } }`
- `GET /api/admin/monitor`（`:319`）：`processes[]`（`name`、`status`、`cpu`、`memory`、`uptime`、`restarts`、`pid`）、`logs`（字符串，PM2 日志尾部）、`errors[]`、`system{ hostname, platform, cpus, totalMem, freeMem, uptime, loadAvg }`
- `GET /api/admin/settings`（`:397`）：`deepseek_api_key`（脱敏）、`deepseek_model`、`deepseek_base_url`、`ai_concurrency`、`has_key`、`cpus`、`totalMemGB`、`recommended_concurrency`
- `POST /api/admin/settings/test-connection`（`:480`）：`ok`、`latency`、`error`

---

## C. 统计与聚合能力现状

**全仓检索结果**（范围 `server/src`，正则 `aggregate(` / `groupBy(` / `_count` / `prisma.*.count(` / `.reduce(`）：
- `aggregate(`：**0 处**（Prisma 聚合 API 完全未使用）。
- `groupBy(`：**1 处** — `projectController.js:61`（按 `projectId` 统计 `projectSubmission` 条数，`_count: { id: true }`，服务 legacy 实训任务列表）。
- `_count`：**8 处** — `teacherController.js:41`（题目的小题数）、`:379`（作业的题目数）、`:554`（班级学生数）、`teamController.js:19`（团队教师数/班级数）、`studentController.js:97`（作业题目数）、`projectController.js:49/64/67`（实训任务提交数）。
- `prisma.*.count(`：**10 处** — 分页总数（`teacherController.js:46/385`、`reviewController.js:64`、`studentController.js:108`、`projectController.js:55`、`projectSubmissionController.js:43`）与阶段计数（`projectSubmissionController.js:48/49`「已提交/已评分」、`projectController.js:74` 应交学生数、`projectSubmissionController.js:57` 应交学生数）。
- `.reduce(`：**6 处** — `domain/services/scoring.service.js:27`、`utils/scoring.js:13`（小题分值求和）、`reviewController.js:379/380/383`（按学生汇总 AI 分/终分/最差状态）、`projectController.js:370`（标准包总字节数）。

**已由接口直接返回的计数/汇总字段**（字段名照抄）：
| 字段 | 出处 |
|---|---|
| `list[].submissionCount` | `teacherController.js:405`（作业列表：去重已提交学生数） |
| `list[]._count.assignmentQuestions` | `teacherController.js:379`、`studentController.js:97` |
| `_count.subQuestions` | `teacherController.js:41`（题库列表） |
| `_count.studentClasses` | `teacherController.js:554`（班级列表） |
| `_count.teachers` / `_count.classes` | `teamController.js:19`（团队列表） |
| `totalStudents` / `submittedCount` / `aiPending` / `reviewPending` / `abnormal` / `aiCompleted` / `allAiDone` / `allReviewed` | `reviewController.js:325-333`（review-summary） |
| `total`（分页总数） | `teacherController.js:46/385`、`reviewController.js:64`、`studentController.js:108`、`projectController.js:55`、`projectSubmissionController.js:43` |
| `stats{ submitted, unsubmitted, graded, totalStudents }` | `projectSubmissionController.js:69-74`（legacy 实训提交列表） |
| `submissionCount` / `totalStudents` | `projectController.js:78-79`（legacy 实训任务列表） |
| `totalScore`（按作业聚合，含 `subItems`） | `studentController.js:266-286`（学生成绩） |
| `aiScore` / `finalScore`（按学生跨小题求和） | `reviewController.js:379-380`（班级成绩明细） |
| `totalScore` / `headerCells` | `reviewController.js:555-571`（导出审核数据） |
| `system{ cpus, totalMem, freeMem, uptime, loadAvg }` | `adminController.js:324-332`（系统监控） |

**在前端自己算的**（`client/src`）：
- `views/teacher/ReviewClass.vue:189-193` `reviewSummary`：`total = list.filter(r => r.submitted).length`、`pending = list.filter(r => r.status === 'ai_graded' || r.status === 'submitted').length`（只统计当前页已加载的 list）。
- `views/teacher/Review.vue:64`：`{{ record.totalStudents - record.submittedCount }} 未交`（未交人数用两个服务端字段相减）。
- `views/student/Assignments.vue:96-148`：`isNotStarted` / `isExpired` / `hasRealSubmit` / `statusColor` / `statusText` 全部前端计算；四态筛选 `filteredList` 在已加载列表上 `filter`。
- `views/student/Submit.vue:514-541`：`totalScored`（`subScores` 求和）、`unsubmittedCount`（遍历 `subQuestions` 判 `draft`）、`allSubmitted`、`submitDisabled`；`:893-902` 统计 `bestScore` / `maxAttemptCount`。
- `views/teacher/ReviewDetail.vue:386`：`totalAiScore` 由当前 `subMap` 求和。
- `views/teacher/QuestionEdit.vue:346/810`：`computedMaxScore` / `totalScore` 由小题分值求和。
- `views/teacher/Assignments.vue:25`：`record.submissionCount ?? record._count?.submissions ?? 0`（`_count.submissions` 在该接口 select 中并不存在，回退分支恒为 0）。

**是否存在「总览/看板/概览」类接口**：
- 全仓无 `dashboard` / `overview` / `stats` / `summary` 命名的**独立总览接口**（唯一带 summary 语义的是 `GET /api/teacher/review-summary`，粒度是「班级 × 作业」行，且 `schoolId` 必填，277-280 行；内部对每个「班级 × 作业」各发一次 `submission.findMany`，303 行）。
- 管理端唯一近似「总览」的是 `GET /api/admin/monitor`（系统/进程维度，不含业务计数）。
- 教师端无「我的作业数 / 待审核总数 / 学生总数」这类单值总览接口。

---

## D. 列表分页与筛选现状

### D.1 支持服务端分页（`page` / `pageSize`）
| 接口 | 分页参数 | 其它筛选 | 证据 |
|---|---|---|---|
| `GET /api/teacher/questions` | `page`、`pageSize`(默认 20) | `difficulty`、`keyword`(title contains) | `teacherController.js:33-47` |
| `GET /api/teacher/assignments` | `page`、`pageSize` | 无（隐式按教师可见班级过滤） | `teacherController.js:367-386` |
| `GET /api/teacher/submissions` | `page`、`pageSize` | `schoolId`、`classId`、`questionId`、`status`（支持逗号分隔多值） | `reviewController.js:14-28, 48-65` |
| `GET /api/teacher/review-class/:classId` | `page`、`pageSize`（内存分页 `slice`，424 行） | `assignmentId`、`keyword`(realName)、`filter`(submitted/not_submitted/pending_review/abnormal)、`sortField`+`sortOrder` | `reviewController.js:345-425` |
| `GET /api/teacher/projects` | `page`、`pageSize` | `keyword`(title)、`status` | `projectController.js:37-56` |
| `GET /api/teacher/projects/:id/submissions` | `page`、`pageSize` | `status` | `projectSubmissionController.js:17-44` |
| `GET /api/student/assignments` | `page`、`pageSize`（**前端未传**，见下） | 无 | `studentController.js:53, 105-108` |

### D.2 一次性全量返回（无分页参数）
`GET /api/teacher/classes`（`:545`）、`GET /api/teacher/students`（`:685`）、`GET /api/teacher/teachers`（`:513`）、`GET /api/teacher/my-schools`（`:532`）、`GET /api/teacher/teams`（`teamController.js:7`）、`GET /api/teacher/review-summary`（`reviewController.js:287`，返回全部班级×作业行）、`GET /api/teacher/review-questions`（`:82`）、`GET /api/teacher/export-review`（`:443`）、`GET /api/admin/schools` / `classes` / `teachers` / `students`（`adminController.js:9/69/148/253`）、`GET /api/student/scores`（`studentController.js:246`）、`GET /api/student/profile`（`:295`）。

### D.3 已声明但未生效的筛选（事实记录）
- `GET /api/student/assignments` 只解构 `page`、`pageSize`（`studentController.js:53`）；前端 `views/student/Assignments.vue:162` 却传 `params: { keyword }`，服务端**不读取 `keyword`**；同时前端不传 `page`/`pageSize`，只取默认第 1 页 20 条，并在本地做四态筛选与分页（`:136-148`、`:12` `clientPagination`）。
- `GET /api/teacher/assignments` 除分页外不接受 `keyword`/`status`/`mode` 筛选（`teacherController.js:367`）。
- `getVisibleClassIds(teacherId, schoolId)`（`teamController.js:135-146`）形参含 `schoolId` 但函数体未使用该参数（136-145 行），可见班级为「直连班级 ∪ 团队班级」全集。
- `GET /api/teacher/submissions` 在不传 `schoolId`/`classId` 时不加学生范围条件（`buildFilter` 14-28 行），返回全库提交；标准用法由前端传 `schoolId`。

---

## E. 实时能力（`server/src/socket.js`）

Socket.IO 初始化：`initSocket(server)`（`socket.js:6`，在 `app.js:146` 调用），CORS `origin: '*' `（`socket.js:8`），`pingTimeout: 60000`。

| 事件名 | 方向 | payload | 证据 |
|---|---|---|---|
| `join-school` | 客户端 → 服务端 | `schoolId`（number/string；falsy 直接忽略）。服务端执行 `socket.join(\`school-\${schoolId}\`)` | `socket.js:15-20` |
| `leave-school` | 客户端 → 服务端 | `schoolId`；执行 `socket.leave(\`school-\${schoolId}\`)` | `socket.js:22-26` |
| `disconnect` | 客户端 → 服务端（Socket.IO 内建） | 无 | `socket.js:28-30` |
| `graded` | 服务端 → 客户端（房间 `school-{schoolId}`） | `{ id, aiScore, aiFeedback, status, assignmentId, classId }`。生产者为 `gradingWorker.js:109` 通过 HTTP 回调 `POST /api/internal/graded`（`app.js:84-92`，校验 `Bearer INTERNAL_SECRET`），随后 `notifyGraded(schoolId, data)` → `io.to(\`school-\${schoolId}\`).emit('graded', data)`（`socket.js:36-39`） | `socket.js:36-39`、`gradingWorker.js:109`、`app.js:84-92` |

补充事实：
- 事件总数 = 4（3 个客户端事件 + 1 个服务端事件）；无房间级进度事件、无「待审核数变化」事件。
- `graded` 仅由**编程题/客观题**评分链路触发（`gradingWorker.js`）；实训题评分链路（`services/projectGrading.js`）未调用该回调（全仓 `notifyGraded` 调用点仅 `gradingWorker.js:109`）。
- 前端消费点：`views/teacher/Review.vue:139-145`（收到 `graded` 后 3s 节流重取 review-summary）、`views/teacher/ReviewClass.vue:268`。
- 另有 `infrastructure/notifier/socket-notifier.js:10` 实现 `notifyGraded(schoolId, payload)` 端口，转发到同一 `socket.js:notifyGraded`。

---

## F. 定向问答

### F1. 作业列表是否返回「已提交人数 / 应交人数 / 提交进度」？—— **部分有**
- 已提交人数：**有**。`GET /api/teacher/assignments` 返回 `list[].submissionCount`，服务端按 `(assignmentId, studentId)` 去重、排除 `status='draft'`（`teacherController.js:388-409`，注入语句 405 行）。
- 应交人数：**没有**。该接口 select 只有 `_count.assignmentQuestions`（379 行），不返回班级人数；`assignmentClasses[].class` 只含 `{ id, name }`（378 行），无 `_count.studentClasses`。
- 提交进度：**没有**。无 `progress` / `percent` / `submittedRate` 类字段（全仓检索 `server/src` 无匹配）。
- 对照：应交/已交同时存在的是 `GET /api/teacher/review-summary`（`totalStudents` + `submittedCount`，`reviewController.js:329`）。

### F2. 作业列表是否返回题目数量？—— **有**
- 教师端：`GET /api/teacher/assignments` → `list[]._count.assignmentQuestions`（`teacherController.js:379`）。
- 学生端：`GET /api/student/assignments` → `list[]._count.assignmentQuestions`（`studentController.js:97`）。
- 详情接口另有完整题目数组：`GET /api/teacher/assignments/:id` → `assignmentQuestions[]`（423 行）、`GET /api/student/assignments/:id` → `assignment.assignmentQuestions[]`（135 行）。

### F3. 是否存在「待审核提交数」的接口或字段（教师维度 / 全局）？—— **部分有**
- 教师维度（按班级 × 作业）：**有**。`GET /api/teacher/review-summary` 返回 `reviewPending`（等待教师审核）与 `aiPending`（等待 AI 评分）、`abnormal`（异常），`reviewController.js:314-333`；练习模式下 `reviewPending` 恒为 0（330 行）。
- 教师维度（单一数字、可直接挂侧栏徽标）：**没有**。无 `pending-count` / `review-count` / `badge` 类接口（全仓路由表中无匹配路径）。
- 全局：**没有**。无跨校/全站计数接口；`GET /api/teacher/submissions` 返回的 `total`（`reviewController.js:64`）可配合 `status=ai_graded` 得到数量，但该接口默认不做学校/教师范围限制（见 D.3）。
- 前端现状：`views/teacher/ReviewClass.vue:191` 用已加载列表 `filter(r => r.status === 'ai_graded' || r.status === 'submitted').length` 自行计算待审核数（只覆盖当前页）。

### F4. 是否存在「作业平均分 / 已发布数 / 本周已发布」等统计接口？—— **没有**
- 平均分：全仓 `server/src` 检索 `avg` / `average` / `平均分` → **0 处**；无任何接口返回均分、最高分、及格率。`studentController.js:279` 只对单个学生的分数做加法聚合。
- 已发布数：无 `publishedCount` 类字段；发布动作 `PUT /api/teacher/submissions/publish`（`reviewController.js:262-270`）用 `updateMany` 且不返回受影响计数（响应 `data: null`）。
- 本周已发布 / 时间维度统计：全仓无按周/日聚合（无 `startOfWeek` / `groupBy` 时间字段的用法）。
- 现有最接近的聚合仅到「班级 × 作业」行级：`review-summary`（`reviewController.js:325-333`）。

### F5. 学生「我的作业」列表是否返回下列字段？—— 逐项：**部分有**
| 需要的字段 | 结论 | 证据 |
|---|---|---|
| 每份作业的总题数 | **有** `_count.assignmentQuestions` | `studentController.js:97` |
| 每份作业的已答题数 | **没有**（无 `answeredCount`；仅有 `submissions[]` 的 `{ status, id }` 数组，100-102 行，可按条数自行推断，行内不含 `questionId`） | `studentController.js:99-102` |
| 截止时间 | **有** `endTime` | `studentController.js:96` |
| 剩余时间 | **没有**（无 `remainingMs` 类字段，前端用 `endTime` 与本地 `now` 计算，`views/student/Assignments.vue:96-97`） | `studentController.js:96` |
| 提交时间 | **没有**（`submittedAt` 不在该接口 select 中） | `studentController.js:99-102` |
| 工程包大小 / 文件数 | **没有**（作业列表不返回文件树；需另调 `GET /api/student/assignments/:assignmentId/project/:questionId` 取 `files{ tree, contents }`，`studentController.js:503-517`。文件节点自带 `size`（`utils/fileTree.js:166`），但无服务端汇总字段：文件数需数节点、总大小需自行求和；客户端检索 `.size` 为 0 处） | `studentController.js:96-103, 468-518` |
| 得分 | **没有**（该接口不含 `aiScore`/`finalScore`；成绩走 `GET /api/student/scores`） | `studentController.js:96-103 vs 243-286` |
| 状态 | **部分有** `submissions[].status`（原始枚举 `draft/submitted/ai_graded/reviewed/published`），「未开始/已过期/已出分」等语义由前端合成 | `studentController.js:101`、`views/student/Assignments.vue:104-126` |

### F6. 提交详情是否返回 AI 评分的分项明细（每条要点 + 判定）？字段名是什么？—— **按题型分三类**
- **实训题（`Question.type='project'`）：有结构化分项。** 存储于 `Submission.aiFeedback`（JSON 字符串，`services/projectGrading.js:402-407` 序列化），审核接口解析为 `data.aiResult`（`projectReviewController.js:119-124`）。字段名：`breakdown[]`（每项 `item`、`score`、`maxScore`、`comment`）、`highlights[]`、`issues[]`、`overallComment`。上限：`breakdown` ≤ 8 项、`highlights`/`issues` ≤ 5 条、`overallComment` ≤ 300 字（`projectGrading.js:403-406`；提示词约束见 `services/deepseek.js:584-589`）。
- **客观题（`SubQuestion.type='objective'`）：无结构化分项，只有格式化文本。** `aiFeedback` 为字符串，形如「N/M 正确，得分 X / Y」+ 逐问行「第N问：✓/✗/△ 部分正确（…）」（`domain/services/objective-grading.service.js:29/38/41/47/49/55/70/75`）。逐项判定以 **✓ / ✗ / △** 字符嵌在文本里，没有 `items[]` 之类的结构化数组落库。
- **编程题 / 主观题（AI 评分分支）：无分项。** AI 只返回 `{ score, feedback }`，`feedback` 为整段评语字符串（`services/deepseek.js:135-143`；写入见 `services/gradingWorker.js:101-104`）。教师端逐小题读的是 `allSubmissions[].aiFeedback` 纯文本（`views/teacher/ReviewDetail.vue:121`）。
- 另：管理端/教师端可查看真实提示词：编程题 `GET /api/teacher/submissions/:id/prompt`（`reviewController.js:735`）、实训题 `GET /api/teacher/submissions/:id/project/prompt`（`projectReviewController.js:248`）。

### F7. 审核队列是否支持「上一条/下一条」按队列顺序取相邻提交？—— **没有**
- 全仓无 `next` / `prev` / `adjacent` / `neighbor` 类路由或查询参数（路由表见 A 节，均无此语义）。
- `GET /api/teacher/submissions/:id` 返回的 `allSubmissions[]` 是**同一学生、同一作业、同一题**下的全部小题提交行（`reviewController.js:108-115`），不是队列邻居。
- 队列数据只能整页取：`GET /api/teacher/review-class/:classId?page&pageSize`（`reviewController.js:422-425`，内存分页）或 `GET /api/teacher/submissions?page&pageSize`（`:61-62`，按 `submittedAt desc` 排序）。
- 前端现状：`views/teacher/ReviewDetail.vue` 只有「题号方块」在本份提交的小题间跳转（`:21-44`），无跨提交导航。

### F8. 学生成绩页的数据来源接口与字段？—— **`GET /api/student/scores`**
- 调用点：`views/student/Scores.vue:51` `request.get('/student/scores')`，直接把 `r.data` 作为列表（`:52`）。
- 服务端：`studentController.js:243-286`。取数条件 `status='published'` 或（`mode='practice'` 且 `status in ['ai_graded','reviewed']`）（249-252 行），`orderBy: { reviewedAt: 'desc' }`（259 行），按 `assignmentId` 在内存聚合（262-285 行）。
- 返回字段（顶层数组项）：`assignmentId`、`assignmentTitle`、`mode`、`questionTitle`、`totalScore`、`maxScore`、`bestScore`、`attemptCount`、`subItems[]`；`subItems[]` = `{ title, score, feedback }`（280-284 行）。
- 页面当前实际使用：`assignmentTitle`、`mode`、`attemptCount`、`totalScore`、`maxScore`、`bestScore`（`views/student/Scores.vue:19-27, 43-47`）。

### F9. 导出 Excel / 成绩的接口有哪些？—— **服务端仅 1 个，且不产出 xlsx**
- `GET /api/teacher/export-review`（`reviewController.js:432-577`，路由 `routes/teacher.js:59`）：入参 `classId` + `assignmentId`（缺一 400，435 行），返回 **JSON**：`data.rows[]`（`studentName`、`studentNo`、`schoolName`、`className`、`submitted`、`cellScores[{ label, maxScore, score, submitted }]`、`totalScore`）+ `data.headerCells[{ label, maxScore }]`（566-572 行）。客观题小问得分在服务端用 `scoreItem` 重新比对答案算出（496-519 行）。
- `rows[].studentNo` 为**展示用纯学号**（不含 `@院校代码` 后缀）；前端 xlsx 的「学号」列直接写入该值，供上传学校教务系统按纯学号匹配学生。
- xlsx 文件由**前端**生成：`client/src/infrastructure/export.js:3-48`（`xlsx` 库 `json_to_sheet` → `writeFile`，文件名 `${className}-${assignmentTitle}.xlsx`），调用点 `views/teacher/Review.vue:126-129`。
- 其余导出/导入均为前端本地处理，无对应后端接口：学生导入模板 `views/teacher/Students.vue:279-286`（`XLSX.writeFile`）；测试卷解析走 `POST /api/teacher/parse-exam` / `parse-exam-stream`（`teacherController.js:313/334`），前端也可本地解析 docx/xlsx（`views/teacher/QuestionEdit.vue:310, 531-535`）。
- 服务端无任何 xlsx 生成依赖（`server/src` 检索 `exceljs|sheetjs|xlsx` 仅命中文件后缀白名单 `utils/fileTree.js:42`、`utils/projectFiles.js:21`）。

### F10. 是否存在「返回了但前端未使用」的字段？—— **存在，且可直接复用**
判定方法：对 `client/src` 全量检索字段名（词边界匹配）。以下字段返回但 **0 引用**：

| 字段（照抄） | 出处接口（证据行） | 客户端检索结果 |
|---|---|---|
| `aiCompleted` | `GET /api/teacher/review-summary`（`reviewController.js:331`） | 0 处 |
| `allAiDone` | 同上（`:332`） | 0 处 |
| `allReviewed` | 同上（`:332`） | 1 处（`Review.vue:55` 仅用于文案判断） |
| `subItems`（`title`/`score`/`feedback`） | `GET /api/student/scores`（`studentController.js:280-284`） | 0 处（成绩页只用了总分/次数） |
| `reviewedAt` | `GET /api/teacher/submissions`（`reviewController.js:55`）、legacy 实训提交列表（`projectSubmissionController.js:36`） | 0 处 |
| `machineScore` / `astScore` / `machineFeedback` / `astFeedback` | legacy `GET /api/teacher/projects/:id/submissions`（`projectSubmissionController.js:34-35`） | 0 处 |
| `stats{ submitted, unsubmitted, graded, totalStudents }` | legacy 同上（`projectSubmissionController.js:69-74`） | `unsubmitted` 0 处；`stats` 仅在 `Review.vue` 作为列 key 字符串 |
| `_count.subQuestions` | `GET /api/teacher/questions`（`teacherController.js:41`） | 0 处（题库页用 `maxScore`） |
| `size`（文件树节点字段） | `GET /api/student/assignments/:assignmentId/project/:questionId`（`studentController.js:503-517`）、`GET /api/teacher/questions/:id/project-files`（`teacherController.js:98`） | 客户端检索 `\.size` 0 处 |
| `deletedAt` | `GET /api/student/assignments`（`studentController.js:96`） | 0 处 |
| `lastSchoolId` | `PUT /api/teacher/switch-school` 写；`User` 模型字段 | 0 处 |
| `studentId`（审核行/toTeacherView 内） | `reviewController.js:388/399`、`projectView.js:85` | 0 处 |
| `attemptCount`（实训审核返回） | `projectView.js:88` | 实训审核页 0 处（仅学生页使用） |

整体闲置的接口组：legacy 体系B 的 `GET /api/teacher/projects`、`POST /api/teacher/projects`、`GET/PUT/DELETE /api/teacher/projects/:id`、`GET /:id/submissions`、`GET /:id/submissions/:submissionId`、`GET .../file`、`PUT .../review`、`POST .../regrade`（共 10 个）在前端**无页面调用**：`client/src/api/projects.js:9-65` 定义了这些封装函数，但全仓检索仅 `uploadPackage` 被 `views/teacher/ProjectQuestionEdit.vue:154` 引用，其余无 import。

---

## G. 结论摘要：新 UI 需要但后端缺失的数据

> 依据：`docs/ui-redesign/01-information-architecture.md`（侧栏徽标、工作台、状态贯通）、`docs/ui-redesign/05-page-specs.md`（T1 KPI 行、T3 上一位/下一位、T4 进度环）。分类只陈述事实与缺口，不含实现方案。

### ① 现有接口加字段即可

| # | 缺的数据 | 涉及页面 | 现状证据 |
|---|---|---|---|
| 1 | 作业「应交人数」（班级学生数聚合） | teacher/Assignments 提交进度列 | `teacherController.js:374-380` select 无 `totalStudents`；同数据的 `totalStudents` 在 `reviewController.js:329` 已存在 |
| 2 | 作业「提交进度 / 完成率」派生值 | teacher/Assignments、学生 Assignments | 只有 `submissionCount`（`teacherController.js:405`）与 `endTime` |
| 3 | 学生作业列表的 `submittedAt`、`finalScore`/`aiScore` | student/Assignments 状态列、成绩贯通（IA 第 71 行「行内显示未开始/进行中/已提交/已评分」） | `studentController.js:99-102` 仅 select `{ status, id }` |
| 4 | 学生作业列表的「已答题数 / 题目明细」 | student/Assignments、student/Submit 题号网格 | `submissions[]` 无 `questionId`/`subQuestionId`（`studentController.js:99-102`） |
| 5 | 实训提交的「工程包大小 / 文件数」汇总值 | student 实训提交页、teacher 实训审核 | `GET /student/assignments/:assignmentId/project/:questionId` 只回 `files{tree, contents}`，文件节点带 `size`（`studentController.js:503-517`、`utils/fileTree.js:166`），无 `fileCount` / `totalBytes` 汇总字段 |
| 6 | `review-summary` 行的「作业题目数」 | teacher/Review 行内信息 | `reviewController.js:290` 的 assignment select 无 `_count.assignmentQuestions` |
| 7 | 列表行「最新提交时间」 | teacher/Assignments | `teacherController.js:391-394` 取 `submission` 时未 select `submittedAt` |
| 8 | 发布动作的受影响条数 | teacher/ReviewClass 批量发布确认文案（IA 第 160 行「影响范围：N 名学生」） | `reviewController.js:266-270` `updateMany` 后响应 `data: null` |
| 9 | AI 评分进度语义（排队中/评分中/已完成） | teacher/Review 行内（IA 第 159 行） | `graded` 仅推送完成事件（`socket.js:38`）；实训侧有 `grading.state`（`projectView.js:94`），编程题侧无对应状态字段 |
| 10 | 客观题逐项判定的结构化数据 | teacher/ReviewDetail 题号网格、ScorePanel 分项 | 判定以 ✓/△/✗ 文本嵌在 `aiFeedback` 字符串（`objective-grading.service.js:75`） |

### ② 需要新增接口

| # | 缺的能力 | 涉及页面 | 现状证据 |
|---|---|---|---|
| 1 | 教师待审核总数（单值与侧栏徽标） | 侧栏「评分审核」徽标（IA 第 61、170 行） | 无对应路由；现只能取 `review-summary` 全量行后自加（`reviewController.js:277-338`） |
| 2 | 审核队列「上一条 / 下一条」 | teacher/ReviewDetail、ProjectReviewNew 标题栏（05-page-specs 第 60、72 行） | 无 `next`/`prev` 语义接口（A 节路由表全表核对） |
| 3 | 「已发布」提交列表视图 | teacher/Review 增设 Tabs：待审核 / 按班级 / 已发布（IA 第 173 行） | `GET /teacher/submissions` 可传 `status=published`（`reviewController.js:16`），但无「已发布」聚合/视图接口 |
| 4 | 作业平均分 / 已发布数 / 本周已发布 | teacher/Assignments、Review 的 KPI 行（05-page-specs 第 15 行） | 全仓无 `avg`/`average`；无时间维度聚合（F4） |
| 5 | 全站/跨班业务总览（作业数、学生数、待办数等单值） | 各列表页 KPI 行（05-page-specs 第 15 行） | 教师端只有 `review-summary`（班级×作业粒度）；管理端只有 `/admin/monitor`（系统维度） |
| 6 | 分类目录/列表的服务端分页与筛选 | admin 四个列表页、teacher/Classes、teacher/Students、teacher/Teams | 均为全量数组（D.2）；前端 `clientPagination`（如 `views/teacher/Classes.vue:14`） |
| 7 | 学生作业列表的关键字检索 | student/Assignments 搜索框 | 前端传 `keyword`（`views/student/Assignments.vue:162`），服务端未读取（`studentController.js:53`） |
| 8 | 实训题评分完成推送 | ProjectReviewNew（现为 3s 轮询，05-page-specs 第 70 行） | `graded` 事件仅由 `gradingWorker.js:109` 触发；实训链路无推送（E 节） |

### ③ 前端可自行计算，无需后端

| # | 数据 | 涉及页面 | 依据 |
|---|---|---|---|
| 1 | 剩余时间 / 倒计时 | student/Assignments、student/Submit | `endTime` 已返回（`studentController.js:96`）；现实现 `views/student/Submit.vue:495, 884-891` |
| 2 | 未交人数 | teacher/Review | `totalStudents - submittedCount`（`views/teacher/Review.vue:64`） |
| 3 | 单份提交的 AI 总分（跨小题求和） | teacher/ReviewDetail | `views/teacher/ReviewDetail.vue:386-390`（源字段 `allSubmissions[].aiScore`，`reviewController.js:127`） |
| 4 | 小题满分合计 / 已答小题数 | teacher/QuestionEdit、student/Submit | `subQuestions[].score` 求和（`views/teacher/QuestionEdit.vue:346`）；已答判定 `views/student/Submit.vue:520-527` |
| 5 | 学生作业状态四态语义（未开始/进行中/已提交/已评分） | student/Assignments、student/Scores | `startTime`/`endTime`/`locked`/`submissions[].status` 均已返回（`studentController.js:96-102`）；合成逻辑 `views/student/Assignments.vue:104-126` |
| 6 | 提交次数与最高分 | student/Submit | `attemptCount`/`bestScore` 在作业详情提交行中返回（`studentController.js:149-151`，`Submission` 全字段）；`views/student/Submit.vue:893-902` |
| 7 | 待审核数（当前页口径） | teacher/ReviewClass | `views/teacher/ReviewClass.vue:189-193` |
| 8 | 学生成绩页逐题明细展示 | student/Scores | `subItems[]` 已返回但当前 0 引用（F10），可直接渲染 |
