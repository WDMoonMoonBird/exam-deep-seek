# audit-round-06 —— 资源作用域校验（authorization scope）系统性普查

| 项 | 值 |
|---|---|
| 轮次 | **round 6 / 8**（A 增量审查 · 本轮主题 = authorization scope 系统普查） |
| 日期 | 2026-10-11 |
| 基线 commit | **e722f54**（`pipeline(round-5): 修复教师端跨校越权（S-2）+ 学生作业详情归属校验（S-6）`） |
| 测量时刻工作树 | `git status --porcelain -uno` = **仅 `pipeline-status.md` 有改动**（Captain 的状态文件）⇒ **`server/src`、`client/src` 与 HEAD 逐字节相同**，本报告所有行号 = 冻结树实测行号（纪律 10） |
| 角色 | Agent A（`code-analyzer`）· **纯只读**：本轮只创建 `docs/pipeline/audit-round-06.md` 一个文件 |
| 输入 | constraints 15 条纪律 · audit-round-04 §2.1 S-2/S-6 · test-round-05 §4.4/§6/§8.2/§10 · refactor-round-05 §2.0 契约 · pipeline-status.md |

## 0 范围、方法与约束遵守

### 0.1 本轮为什么允许"全仓写端点枚举"

规范「第二轮起禁止全仓重扫」针对的是**重复扫描**。round 4 的 S-2 只覆盖 `class/student` 两条写路径（其普查口径是"教师端 5 个 handler"），
**资源作用域校验是一个新维度**（目标资源是否落在调用者作用域内），故本轮对 **全部路由的写方法端点（POST/PUT/PATCH/DELETE）** 做一次穷尽枚举。
枚举口径与复算命令（可逐字复跑）：

```bash
# 全量写端点注册（57 条，无遗漏口径：路由注册点 + 唯一内联注册点）
grep -rnE "(router|app)\.(post|put|patch|delete)\s*\(" server/src | wc -l   # → 57
grep -rn "app\.use\('/api" server/src/app.js                                 # → 95-99 行 5 个挂载点
```

- 挂载点实测：`app.js:95` `/api/auth` · `:96` `/api/admin` · `:97` `/api/teacher` · `:98` `/api/teacher/projects`（**自带 `auth, requireRole('teacher')`**）· `:99` `/api/student`；另有 `app.js:84` 内联端点 `POST /api/internal/graded`。
- **未发现任何"漏挂中间件"的路由组**：`routes/admin.js:7`（super_admin）、`routes/teacher.js:11`（teacher）、`routes/student.js:7`（student）、`app.js:98`（teacher）四处组级守卫齐备；`routes/auth.js` 只有公开 `login` 与 `auth` 保护的 `password`。
- **假阳性拦截纪律**：凡判「缺口」者，均在 §3 给出**运行时实测**（自建夹具、自建探针）或明确的**推理链**；仅静态可判定者已标注。
- 判定档位：**需修 / 需拍板 / 不适用**（"不适用"含两个子情形：① 无资源归属概念；② **已有正确的归属校验**（= 无缺口）。普查表必须完整，故合规行不省略，统一落在"不适用"并注明"已校验"）。

### 0.2 约束遵守（逐条自证）

| 约束 | 遵守情况 |
|---|---|
| 纯只读，仅写本报告 | ✅ 本轮唯一写入 = `docs/pipeline/audit-round-06.md`；探针用 `node --input-type=module -e` **内联执行，未创建任何临时脚本文件** |
| 禁 git 写操作 / 禁 clean-stash-checkout-reset-restore | ✅ 只跑 `git status` / `git diff --stat` / `git rev-parse`（只读） |
| 不跑 jest、不跑 build、不起常驻服务 | ✅ 未跑 jest / 未 build |
| 临时服务必须 `PORT=0`（纪律 14） | ✅ 两次探针均显式 `PORT=0`，日志实测 `"port":"0"`、`"HTTP 服务已启动 → http://localhost:0"`；**未占用 :5173 / :3000**（进程 `process.exit(0)` 结束） |
| 不碰 `client/dist`、`tests/` | ✅ 零写入（`client/src` 仅读取） |
| 只写测试库 `exam_system_test` 且事后清理 | ✅ 探针内 `SELECT DATABASE()` → `exam_system_test`；夹具前缀 `r6_`/`r6b_`；**收尾实测 `leftover r6_ users = 0` / `r6b_ users = 0`** |
| 禁止联网 / 禁真实外部 API | ✅ 未调用 `parse-exam`/`generate-reference`/`checker/generate`（这三条会真发 DeepSeek）；checker 缺口改用 **不触发 LLM 的 `confirm`/`rollback`** 复现 |
| 禁重跑 `ledger-check.mjs --out=raw/ledger.json` | ✅ 未运行 |
| 报告不打印密钥/口令/token 明文 | ✅ `INTERNAL_SECRET` 兜底字面量与默认超管口令一律脱敏引用 |

---

## 1 任务 5｜终止条件对照表（截至 round 6）+ 全部拍板项结算

### 1.1 判据对照（constraints §5 六项）

| # | 判据 | 达标线 | 截至 round 6 实测（本轮自跑门禁，original output） | 能达成？ |
|---|---|---|---|---|
| 1 | 分层违规 | 0，且未分层不增（基线 47） | `node server/scripts/check-layers.mjs` → **文件 71 个，违规 0 条，未分层待迁移 47** | ✅ **已达成** |
| 2 | GodFile | >800 行 = 超标（基线 10） | `node scripts/gates/arch-metrics.mjs` → **godfileOver800 基线 10 实测 10**；>500 观察带 19 | ❌ **结构性不可达成**（拍板项 **P1**，双向硬阻断：server 拆分必增 unlayered 撞判据 1；client 拆分撞视觉铁律） |
| 3 | 硬指标（去注释） | hex(6)=0、!important=0、views 内 Modal.confirm=0 | `node scripts/gates/hard-metrics.mjs` → **0 / 0 / 0**（参考：非 style.css 的 20 处 !important 为 legacy-patch 19 + tokens 1，按设计使用） | ✅ **已达成** |
| 4 | 后端回归 | failed ≤ baseline（目标 0） | round 5 收尾基线 = **0 failed / 1033 passed / 68 套件**（Captain 提供；本轮为只读审查，**未复跑 jest**，见 §7 局限） | ✅ **已达成**（本轮若有 round-6 修复需 C 复跑维持） |
| 5 | 无障碍 | 不得引入新的 axe 违规 | round 6 拟定执行集**零 client 改动** ⇒ 条件维持 round 5 状态 | ⚠️ **条件达成**（依赖"本轮不改 client"） |
| 6 | 轮次上限 | ≤ 8 轮 | 本轮 = 第 6 轮 | ✅ **已达成**（余 2 轮） |

**附加达成**：全仓循环依赖 **SCC = 0**（`node scripts/gates/cycle-check.mjs` → 扫描 71 文件 / **164 条相对导入边** / SCC 0 / 自环 0）。

**结论：六项中 5 项能达成（4 项已达成 + 1 项条件达成），仅判据 2（GodFile）结构性不可达成** → 收尾按「**部分达标**」出报告（与 pipeline-status.md 既定判断一致，本轮独立复算加固）。

> **本轮复算还确认了一条对执行集有约束力的性质（新）**：`server/src/controllers/teacherController.js:9` **已 import `./teamController.js`** ⇒ 在 teamController 新增导出（如 `getMyTeamIds`）并在该 import 行追加名字，**不新增跨模块 import 边** ⇒ cycle-check **164 边不变**、check-layers **47 不变**（执行集的门禁零增量前提，见 §5.3）。

### 1.2 全部拍板项结算（P1–P8 + 本轮新增）

| 编号 | 拍板项 | 现状 | 本轮是否新增/变化 | 建议（A 的立场） |
|---|---|---|---|---|
| **P1** | GodFile 10 个如何处置（拆=撞门禁/撞铁律，不拆=判据 2 永远不达标） | 未决 | — | 三选一：① 判据 2 放宽为「不劣化」（基线保持 10）；② 先解 unlayered 分层再拆；③ 接受部分达标 |
| **P2** | 是否引入 ui-guard（无它则 client 侧改动不可验证） | 未决 | — | ① 固化 round 2 的像素 sha1 + axe 装置到 `scripts/gates/`；② 明确"像素全等"是否等价于 ui-guard 授权 |
| **P3** | N-1 `--duration-page` 契约悬空 | 未决 | — | 交设计侧（实现过渡 or 退休该行） |
| **P4** | N-2 12 个 `--tag-*` 与设计文档矛盾 | 未决 | — | 交设计侧对齐（改 `03-components.md`） |
| **P5** | M-1b（RuleQuality `.ant-statistic-title` 对比度）是否破例 | 未决 | — | 不破例（不阻断任何判据） |
| **P6** | 288 行生产死代码（`defectPrecheck`+`defectScoring`）处置 | 未决 | — | 保留（删会动 `server/test/` → 改 1011 基线） |
| **P7 = S-1** | `INTERNAL_SECRET` 兜底字面量（`app.js:83`，兜底值脱敏引用）+ `/api/internal/graded` 无 JWT 鉴权 | 未决 | — | 先确认生产是否已配该密钥；未配置则 fail-closed 会**让服务起不来**（影响用户实例可用性），且**零测试覆盖** ⇒ 不可由 A/B/C 自决 |
| **P8 = S-3** | 默认超管口令初值（`app.js:141`，字面量脱敏引用） | 未决 | — | 本地 bcrypt 比对已确证生效；upsert `update:{}` = 已存在不改 ⇒ 轮换过即安全。改它 = 改登录/初始化语义 |
| **R6-P9（新）** | **团队可见性模型是否应授予写权限**：`getVisibleClassIds` 把「团队班级」并入**写**作用域（refactor-round-05 T14 已把该语义锁为契约）；本轮证明该语义可被"把任意班级挂进任意团队"放大为跨租户写 | **本轮新增** | **需用户拍板产品语义**；但**可被利用的那一半是漏做的守卫，本轮判「需修」**（见 §3.2/§3.3） |
| **R6-P10（新）** | **团队治理语义**：`updateTeam` 允许**任一成员**改教师名单/班级名单（建议先只堵"非成员"，成员互踢/互加属产品治理） | **本轮新增** | 推荐最小收口 = 非成员一律 403；"仅创建者可改名单"若要收紧，属产品决策 |
| **R6-P11（新，可选）** | `studentController.js` 距 800 行仅 **1 行**：Task 3 的守卫若写在控制器层必然破门禁（判据 2 的 10 → 11） | **本轮新增（阻碍项）** | **A 的解法**：把守卫下沉到 repository + use-case（§4.3）——**控制器 0 行改动**，两难被绕开；若用户坚持控制器层实现，则与 P1 合并拍板 |

> **给 Captain 的一条硬提醒**：**R6-P9 不阻塞本轮修复**。C 记录的"同一调用 403→200"里，**可被利用的因果链的第一环是漏做的守卫**（body 的 `teamIds`/`updateTeam` 完全无归属校验），把第一环堵上，C 的复现链即整体失效；"团队班级是否该给写权限"是**第二环**，属产品语义，可独立拍板而不必等。

---

## 2 任务 1｜写端点资源作用域校验完整普查表（57 / 57）

### 2.1 逐端点判定（端点 / 方法 / 文件:行号 / 目标资源 / 校验有无 / 契约 / 判定）

**A. `routes/admin.js`（挂载 `/api/admin`，组级 `requireRole('super_admin')` @ `routes/admin.js:7`）**

| # | 端点 | 方法 | 文件:行号 | 目标资源 | 校验 | 契约 | 判定 |
|---|---|---|---|---|---|---|---|
| 1 | `/api/admin/classes` | POST | `adminController.js:81-101` | 班级（新建，`schoolId` 来自 body） | 无（不需要） | 组级 super_admin = 全局作用域 | 不适用 |
| 2 | `/api/admin/classes/:id` | PUT | `adminController.js:103-126` | 班级 | 无（不需要） | 同上 | 不适用 |
| 3 | `/api/admin/classes/:id` | DELETE | `adminController.js:128-144` | 班级 | 无（不需要） | 同上 | 不适用 |
| 4 | `/api/admin/teachers` | POST | `adminController.js:160-179` | 教师账号 | 无（不需要） | 同上 | 不适用 |
| 5 | `/api/admin/teachers/:id` | PUT | `adminController.js:181-206` | 教师账号 + 学校关联 | 无（不需要） | 同上 | 不适用 |
| 6 | `/api/admin/teachers/:id/reset-password` | PUT | `adminController.js:208-222` | 教师凭据 | 无（不需要） | 同上 | 不适用 |
| 7 | `/api/admin/teachers/:id` | DELETE | `adminController.js:224-242` | 教师账号（软删） | 仅"不能删自己"（`:231`，自保护） | 同上 | 不适用 |
| 8 | `/api/admin/students` | POST | `adminController.js:268-317` | 学生账号 | 无（不需要） | 同上 | 不适用 |
| 9 | `/api/admin/settings` | PUT | `adminController.js:437-478` | 全局 SystemConfig（LLM key/模型/并发） | 无（不需要） | 同上 | 不适用 |
| 10 | `/api/admin/settings/test-connection` | POST | `adminController.js:480-517` | 无持久化资源（出网探测） | 不适用 | 同上 | 不适用 |

**B. `routes/auth.js`（`/api/auth`）**

| # | 端点 | 方法 | 文件:行号 | 目标资源 | 校验 | 契约 | 判定 |
|---|---|---|---|---|---|---|---|
| 11 | `/api/auth/login` | POST | `authController.js:6-100` | 无（公开端点） | — | 公开 | 不适用 |
| 12 | `/api/auth/password` | PUT | `authController.js:102-122` | **调用者自己的凭据**（`:105`/`:113` 均用 `req.user.id`） | 自资源 | 无他人资源可影响 | 不适用 |

**C. `routes/student.js`（`/api/student`，组级 `requireRole('student')` @ `:7`）**

| # | 端点 | 方法 | 文件:行号 | 目标资源 | 校验 | 契约 | 判定 |
|---|---|---|---|---|---|---|---|
| 13 | `/api/student/assignments/:assignmentId/project/:questionId/submit` | POST | `studentController.js:616-628` → `submitProjectCore:634` | 作业/提交（本人） | **有** `:643` | `assertStudentInAssignment`（`:482-511`）→ 404 或 `403/1003 '无权访问该作业'` | **不适用（已校验）** ← 同文件正确对照 |
| 14 | `/api/student/assignments/:id/submit` | POST | `studentController.js:269-286` → `submission.use-cases.js:27-56` | **作业（须已投放给本生班级）** | **无** | 用例只校验「存在/锁定/截止/重复/练习次数」，**零班级归属** | **🔴 需修** |
| 15 | `/api/student/assignments/:id/draft` | PUT | `studentController.js:288-304` → `submission.use-cases.js:64-81` | 同上 | **无** | 同上 | **🔴 需修**（C 的 V5，独立复现 ✔） |
| 16 | `/api/student/assignments/:id/retry` | POST | `studentController.js:306-320` → `submission.use-cases.js:89-96` | 本人提交行（`resetByAssignment`） | **无** | 同上；仅影响本人行 ⇒ 无跨用户写入 | **🟡 需修（低）**（同批加守卫，防"未来复用"） |

**D. `routes/projects.js`（挂载 `/api/teacher/projects`，`app.js:98` 带 `auth, requireRole('teacher')`）**

| # | 端点 | 方法 | 文件:行号 | 目标资源 | 校验 | 契约 | 判定 |
|---|---|---|---|---|---|---|---|
| 17 | `/api/teacher/projects/upload-package` | POST | `projectController.js:345-…` | 无（临时目录文件） | 无归属概念 | — | 不适用 |
| 18 | `/api/teacher/projects` | POST | `projectController.js:122-216`（`classIds` 落库 `:173-177`） | 实训任务（本人）+ **body.classIds** | **部分**：任务归属由 `teacherId` 保证；**body 目标班级无校验** | — | **🟠 需修（低-中）**（实测 ✔） |
| 19 | `/api/teacher/projects/:id` | PUT | `projectController.js:219-322`（`classIds` 落库 `:273-280`） | 任务（`:222` 有 `teacherId` 收窄）+ **body.classIds** | **部分**：路径资源有（`:222-225`）；**body 目标无** | — | **🟠 需修（低-中）**（实测 ✔） |
| 20 | `/api/teacher/projects/:id` | DELETE | `projectController.js:325-340` | 实训任务 | **有** `:328-331` | `findFirst({id, teacherId: req.user.id, deletedAt: null})` → 404 | 不适用（已校验） |
| 21 | `…/:id/submissions/:submissionId/review` | PUT | `projectSubmissionController.js:201-240` | 项目提交 | **有** `:213` | `project.teacherId !== req.user.id` → `403/1003 '无权操作'` | 不适用（已校验） |
| 22 | `…/:id/submissions/:submissionId/regrade` | POST | `projectSubmissionController.js:245-…` | 项目提交 | **有** `:256` | 同 `:213` | 不适用（已校验） |

**E. `routes/teacher.js`（`/api/teacher`，组级 `auth, requireRole('teacher')` @ `:11`）**

| # | 端点 | 方法 | 文件:行号 | 目标资源 | 校验 | 契约 | 判定 |
|---|---|---|---|---|---|---|---|
| 23 | `/api/teacher/switch-school` | PUT | `teacherController.js:43-53` | **调用者自身** `lastSchoolId` | 无，但**自资源** | `lastSchoolId` 不参与任何授权判定（实测 grep：仅 `adminController.js:197` 清理、`authController.js:73` 登录回显） | 不适用 |
| 24 | `/api/teacher/classes` | POST | `teacherController.js:836-855`（`teamIds` `:844-848`；`schoolId` `:839`） | 班级（新建）+ **body.teamIds** + **query.schoolId** | **无**（既无 teacherSchool 校验，也无 teamIds 归属校验） | — | **🔴 需修（中）**（实测 ✔：tB 在 schoolA 建班成功；把班级挂进他人团队成功） |
| 25 | `/api/teacher/classes/:id` | PUT | `teacherController.js:857-878`（守卫 `:863`；`teamIds` 落库 `:867-871`） | 班级（路径，**已校验**）+ **body.teamIds**（**未校验**） | **部分** | 路径 = `403/1003 '无权操作'`（`:864`）；body 目标 = 无 | **🔴 需修（高）**（§3.2 实测 ✔：403 → 200） |
| 26 | `/api/teacher/classes/:id` | DELETE | `teacherController.js:880-898` | 班级 | **有** `:884` | `403/1003 '无权操作'`，校验在 `$transaction` 之外 | 不适用（已校验） |
| 27 | `/api/teacher/classes/:id/switch-school` | PUT | `teacherController.js:900-955` | 班级 + 新旧两校 | **有（三重）** | `:917` 班级归属 → `403/1003`；`:925`/`:926` `teacherSchool` 双校成员 → `403/1003` | 不适用（已校验，**本轮作为 schoolId 契约的范本引用**） |
| 28 | `/api/teacher/questions/:id/checker/generate` | POST | `checkerController.js:94-111`（`findUnique` `:97-100`） | **他人的题目**（触发 LLM 生成） | **无** | `findUnique({where:{id}})` **无 teacherId** | **🟠 需修（中-高，静态确证）** |
| 29 | `/api/teacher/questions/:id/checker/confirm` | POST | `checkerController.js:33-59`（`:36-39`） | 他人题目的 checker 规则 | **无** | 同上 | **🔴 需修（高）**（实测 ✔：tB → 200，checkerStatus `review`→`ready`） |
| 30 | `/api/teacher/questions/:id/checker/rollback` | POST | `checkerController.js:65-87`（`:68-71`） | 同上 | **无** | 同上 | **🔴 需修（高）**（实测 ✔：tB → 200，checkerScript `v2`→`v1`） |
| 31 | `/api/teacher/questions` | POST | `teacherController.js:192-261` | 题目（新建，`teacherId`=`req.user.id`） | 写入目标即调用者 | — | 不适用 |
| 32 | `/api/teacher/questions/:id` | PUT | `teacherController.js:262-328`（守卫 `:265-266`） | 题目 | **有** | `findFirst({id, teacherId: req.user.id, deletedAt: null})` → `404/1004` | 不适用（已校验；实测 tB → 404，**同资源对照证据**） |
| 33 | `/api/teacher/questions/:id` | DELETE | `teacherController.js:330-342`（`:333-334`） | 题目 | **有** | 同 `:265` | 不适用（已校验） |
| 34 | `/api/teacher/parse-exam` | POST | `teacherController.js:346-366` | 无持久化资源（LLM 解析） | 不适用 | — | 不适用 |
| 35 | `/api/teacher/parse-exam-stream` | POST | `teacherController.js:367-428` | 同上 | 不适用 | — | 不适用 |
| 36 | `/api/teacher/generate-reference` | POST | `teacherController.js:1266-1278` | 同上 | 不适用 | — | 不适用 |
| 37 | `/api/teacher/upload-material` | POST | `teacherController.js:1255-1262` | 无资源归属概念（本人上传文件） | 不适用 | — | 不适用 |
| 38 | `/api/teacher/assignments` | POST | `teacherController.js:690-756`（questionIds 查询 `:705`；classIds 落库 `:745-747`） | 作业（本人）+ **body.classIds** + **body.questionIds** | **无**（`:705` 题目查询**无 teacherId**；`:745` 班级**无归属校验**） | — | **🔴 需修（高）**（实测 ✔：tB 把作业投放进 tA 班级 + 载入 tA 的题，tA 班学生立即可见） |
| 39 | `/api/teacher/assignments/:id/lock` | PUT | `teacherController.js:758-775`（守卫 `:763`） | 作业 | **有** | `a.teacherId !== req.user.id` → `403/1003 '无权操作'` | 不适用（已校验） |
| 40 | `/api/teacher/submissions/:id/score` | PUT | `reviewController.js:283-301`（守卫 `:289`） | 提交/分数 | **有** | `loadVisibleSubmission`（`:91-107`）→ `403/1003 '无权访问该提交'` | 不适用（已校验） |
| 41 | `/api/teacher/submissions/:id/review` | PUT | `reviewController.js:303-316`（`:306`） | 提交 | **有** | 同上 | 不适用（已校验） |
| 42 | `/api/teacher/submissions/:id/regrade` | POST | `reviewController.js:266-281`（`:269`） | 提交 | **有** | 同上 | 不适用（已校验） |
| 43 | `/api/teacher/submissions/publish` | PUT | `reviewController.js:422-444`（`:429-432`） | 提交（批量） | **有** | `filterRejectedSubmissionIds`（`:122-…`）→ **整批拒绝** `403/1003` | 不适用（已校验） |
| 44 | `/api/teacher/submissions/batch-review` | POST | `reviewController.js:318-372`（`:324-328`） | 可见班级内的提交 | **有**（班级作用域） | `classId ∈ getVisibleClassIds` → 否则 `403/1003 '无权操作该班级'` | 不适用（已校验；`assignmentId` 未校验但写入行被"本班学生集"收窄 ⇒ 不构成越权写入） |
| 45 | `/api/teacher/submissions/batch-publish` | POST | `reviewController.js:374-420`（`:380-384`） | 同上 | **有** | 同 `:382` | 不适用（已校验） |
| 46 | `/api/teacher/submissions/:id/project/review` | PUT | `reviewController.js:849-888`（`:864` + `:866`） | 实训提交 | **有（双重）** | `assignment.teacherId !== req.user.id` **且** `isStudentVisibleToTeacher` | 不适用（已校验） |
| 47 | `/api/teacher/submissions/:id/project/regrade` | POST | `projectReviewController.js:169-220`（`:181`） | 实训提交 | **有** | `isStudentVisibleToTeacher`（`reviewController.js:65`）→ `403/1003 '无权访问该提交'` | 不适用（已校验；未额外校验 `assignment.teacherId`，与 `:269`/`:289` 同口径 ⇒ 团队教师可重评本班学生提交，属既定可见集语义） |
| 48 | `/api/teacher/teams` | POST | `teamController.js:50-70`（`schoolId` `:53-54`） | 团队（新建）+ **query.schoolId** | **无 teacherSchool 校验** | — | **🟠 需修（中，与 #24 同批；静态等价于 #24 的实测）** |
| 49 | `/api/teacher/teams/:id` | PUT | `teamController.js:73-100`（name `:80-82`、teacherIds `:83-88`、classIds `:89-94`） | **任意学校、任意团队**的名单 | **完全没有校验** | — | **🔴 需修（高 · 本轮最严重）**（实测 ✔：非成员改他人团队教师名单、踢出创建者、把他人班级挂进团队 → 随后越权改班级 200） |
| 50 | `/api/teacher/teams/:id` | DELETE | `teamController.js:103-116`（守卫 `:108`） | 团队 | **有** | `team.createdBy !== req.user.id` → `403/1003 '仅创建者可删除团队'` | 不适用（已校验；实测 403 ⇒ **同文件对照证据**：`updateTeam` 是漏做而非设计） |
| 51 | `/api/teacher/teams/:id/leave` | POST | `teamController.js:119-132`（`:124`/`:126`） | **自己的**成员行 | 只删自己的行 + 创建者不可退出 | — | 不适用 |
| 52 | `/api/teacher/students` | POST | `teacherController.js:1107-1134`（`classId` `:1109`/`:1115`/`:1123`） | 学生（新建）+ **body.classId** | **无** | — | **🔴 需修（中-高）**（实测 ✔：tB 在 tA 班级内新建学生成功） |
| 53 | `/api/teacher/students/batch` | POST | `teacherController.js:1136-1225`（`:1138`/`:1144`） | 学生（批量）+ **body.classId** | **无** | — | **🔴 需修（中-高）**（实测 ✔） |
| 54 | `/api/teacher/students/:id` | PUT | `teacherController.js:1008-1059`（守卫 `:1017`；**目标班级落库 `:1049-1052`**） | 学生（路径，**已校验**）+ **body.classId**（**未校验**） | **部分** | 路径 = `403/1003 '无权操作'`；body 目标 = 无 | **🔴 需修（高）**（§3.1 实测 ✔） |
| 55 | `/api/teacher/students/:id/reset-password` | PUT | `teacherController.js:1081-1105`（守卫 `:1087`） | 学生凭据 | **有** | `403/1003 '无权操作'`（越权判定先于业务分支） | 不适用（已校验） |
| 56 | `/api/teacher/students/:id` | DELETE | `teacherController.js:1061-1079`（守卫 `:1065`） | 学生 | **有** | 同上，校验在 `$transaction` 之外 | 不适用（已校验） |

**F. `app.js` 内联端点**

| # | 端点 | 方法 | 文件:行号 | 目标资源 | 校验 | 契约 | 判定 |
|---|---|---|---|---|---|---|---|
| 57 | `/api/internal/graded` | POST | `app.js:83-92` | 无用户资源（socket 推送） | 共享密钥 `:86` | `Bearer <INTERNAL_SECRET>`（兜底字面量脱敏引用） | **不适用**（= 拍板项 **P7/S-1**，本轮不动） |

### 2.2 判定汇总（穷尽性证明）

| 判定 | 数量 | 端点编号 |
|---|---|---|
| **🔴🟠 需修** | **16** | 14, 15, 16, 18, 19, 24, 25, 28, 29, 30, 38, 48, 49, 52, 53, 54 |
| **需拍板（端点级）** | **0** | —（团队可见性语义的新拍板项 R6-P9 落在**语义层**，不改变上述 16 条的"需修"判定，见 §1.2） |
| **不适用（无归属概念）** | 20 | 1-12, 17, 23, 31, 34, 35, 36, 37, 57 |
| **不适用（已校验，无缺口）** | 21 | 13, 20, 21, 22, 26, 27, 32, 33, 39, 40, 41, 42, 43, 44, 45, 46, 47, 50, 51, 55, 56 |
| **合计** | **57** | 与 `grep -rnE "(router|app)\.(post|put|patch|delete)\(" server/src` 的 57 条**逐条对号**（无 PATCH 端点） |

> **对 round 4 S-2 的复核结论**：S-2 报告的"6 个教师端写操作"中，`updateClass`/`deleteClass`/`updateStudent`/`deleteStudent`/`resetStudentPassword` 5 条**路径参数**归属校验**已于 round 5 修复且本轮实测有效**（P0 对照 `403/1003`）。
> **但 S-2 与 round 5 都只覆盖了"路径参数"这一个入口** —— 本轮证明**同一批 handler 的 body 目标资源仍是敞开的**（#25/#54），且**另有 11 个端点从未被任何一轮报告触及**（#14-16, 18, 19, 24, 28-30, 38, 48, 49, 52, 53）。`S-2` 的原始表述"**全仓归属校验点 13 处，其中 0 处在 class/student 写路径上**"在本轮被修正为：**"路径参数入口已收口；body 目标资源入口与 team/question 写路径仍有 16 处缺口"**。

---

## 3 任务 2 / 3｜深入结论（全部附独立复现）

### 3.0 复现装置（自建，未复用 B/C 的脚本或产物）

- 方式：`node --input-type=module -e` **内联**执行（不落任何临时文件），`import { request } from './test/integration/helpers.js'`（supertest）
- `PORT=0`（纪律 14）· `DATABASE_URL` → `exam_system_test`（探针内 `SELECT DATABASE()` 确证）· 夹具前缀 `r6_`/`r6b_` · 收尾 `leftover = 0`
- 夹具：两校（A/B）+ 两教师（tA∈A、tB∈B，**互不共享团队**）+ 两班（cA1∈A 挂 tA、cB1∈B 挂 tB）+ 两生（sA∈cA1、sB∈cB1）+ 两团队（teamA/tB 各一，**tA 不是 teamB 成员**）+ 题 qA(tA, 含 checker 版本) + 作业 asgA(tA→cA1)
- **基线对照（P0）**：`tB PUT /api/teacher/classes/cA1?schoolId=A` → **`403/1003 无权操作`**（round 5 守卫有效，后文所有"由 403 变 200"均以本行为基线）

### 3.1 `updateStudent.body.classId`（C 的保留意见① 之一）——判定：**需修（高）**，且**必须同时校验源班级与目标班级**

**实测（原始输出摘录）**

```
### P1a tA PUT /students/sA {classId: classB1} :: {"http":200,"code":0,"msg":"更新成功"}
    db sA class links before = [6099]          ← cA1（tA 自己的班）
    db sA class links after  = [6100]          ← cB1（tB 的班，跨校）
### P1b tB now resets sA password   :: {"http":200,"code":0,"msg":"密码已重置为学号（r6_sA）"}
### P1c tA can no longer manage own former student :: {"http":403,"code":1003,"msg":"无权操作"}
```

**定性**：这是**纯守卫漏做**，不是设计后果。判据链：
1. `updateStudent` 的**路径资源**（学生）**有**归属校验（`:1017`，实测 tB 改 tA 的学生 → 403 且零写入，见 round-5 T6）；
2. 同一 handler 的 **body 目标资源**（`classId`）在 `:1049-1052` **直写**：`deleteMany({studentId})` + `create({studentId, classId:+classId})` ⇒ **目标班级从未进入任何校验**；
3. 危害是**复合**的：① 把学生**移出全部原班级**（`deleteMany` 无 where 限定班级）⇒ **源班级的教师立即失去该生**（P1c 实测 403，且**不可逆**——因为该生已不在其可见集内）；② 学生落入**他人班级** ⇒ 目标班教师**即刻获得该生全部管理权**（P1b 实测：重置其口令为学号，即**账号接管**）；
4. UI 侧 `client/src/views/teacher/Students.vue:271` 的合法载荷就是 `{realName, classId}`，且 `classId` 选项来自 `loadClasses()`（本师可见班）⇒ **"目标班级 ∈ 可见集"对合法流程零影响**。

**修法契约（两侧都要）**

| 侧 | 现状 | 建议 |
|---|---|---|
| **源班级** | `canTeacherManageStudent`（`:31-39`）=「学生是否在**任一**可见班级内」 | **保留**（等价于"至少一个源班级在校验范围内"）。**不建议**要求"全部源班级都可见"——多班学生跨师共管是本仓既有语义（`studentClass` 为多对多） |
| **目标班级** | 无 | **新增**：`classId ∈ getVisibleClassIds(req.user.id, getSchoolId(req))`，否则 `403 / 1003 / '无权操作' / data:null`；**必须在 `prisma.user.update` 与 `studentClass` 改写之前**（保证零写入），且**先于**既有的 404 分支之后（保持 404 形状不变，与 `:1015-1019` 现有顺序一致） |

> **一句话**：**必须同时有两侧**，但"源侧"已经存在（`:1017`），本轮只需补"目标侧"一行守卫 —— 这也解释了为什么它被误认为"已修好"。

### 3.2 `updateClass.body.teamIds` ——★定性：**第一环是漏洞（守卫漏覆盖 body 目标资源），第二环才是设计后果**

**先复现 C 的现象（独立复现 ✔）**

```
### P0  tB PUT /classes/cA1（基线）                                  :: {"http":403,"code":1003,"msg":"无权操作"}
### P2a tA PUT /classes/cA1 {teamIds:[teamB]}  ← tA 不是 teamB 成员  :: {"http":200,"code":0,"msg":"更新成功"}
    db teamB classes = [6099]                                     ← 他人班级被挂进 teamB
### P2b tB（teamB 成员）PUT /classes/cA1                            :: {"http":200,"code":0,"msg":"更新成功"}
    db cA1 name = "r6_HACK2"                                      ← 403 → 200，tB 改了 tA 的班
```

**因果链拆解（这是本轮最重要的定性依据）**

```
① tA 调用 PUT /teacher/classes/cA1 {teamIds:[teamB]}
   ├─ 守卫 :863 只校验【路径资源 cA1】→ 通过（cA1 确属 tA）
   └─ :867-871 直写 teamClass{teamId:+tid, classId:+id}，tid 来自 body，**零校验**
        ⇒ tA 修改了【它并不属于的 teamB】的成员名单  ← 第一环：纯漏洞

② 此后 tB 调用 PUT /teacher/classes/cA1
   └─ 守卫 :863 调 getVisibleClassIds(tB) = 直连 ∪ 团队班级（teamController.js:146-166）
        ⇒ cA1 因 ① 而进入 tB 的可见集 ⇒ 守卫放行 ⇒ 200  ← 第二环：可见性模型的既定后果
```

| 环 | 性质 | 依据 | 该谁定 |
|---|---|---|---|
| **① body 目标资源无校验** | **漏洞（需修）** | 同文件对照：`:884`（deleteClass 路径资源有校验）、`:917`/`:922-926`（switchClassSchool 对**两个**目标学校都有 `teacherSchool` 校验）——**证明本仓已有"校验 body/次要目标资源"的既有做法**，`teamIds` 属于漏做 | A 判定：**需修** |
| **② 团队班级并入写作用域** | **产品语义（需拍板）** | `teamController.js:146-166` 的注释与 refactor-round-05 §2.0 明确该语义，且 round-5 用例 **T14** 把它**锁成了契约**（"团队班级 updateClass → 200，直连 ∪ 团队 语义未被过度收窄"） | **R6-P9 需用户拍板**（A 不擅自改团队语义） |

**结论（直接回答任务 2 的第二问）**：
1. **C 的复现里"可被利用"的必要条件是 ①，不是 ②**。把 ① 堵上（`teamIds ⊆ 本人团队`），C 的复现链**整体失效** —— 因为 tA 再也无法把 cA1 挂进 teamB，"tB 随即获得写权限"这一步失去输入。
2. **② 单独存在时不构成越权**：若某班级是**本人所属团队**的班级，团队成员改它本就是本仓既定语义（T14 锁定），且 round 5 的 `getAllClasses` 也会把它下发给教师（UI 能看到 ⇒ 能改，契约自洽）。
3. **因此：修 ①（本轮执行集），② 交用户拍板**。若用户认为"团队只应共享读、不应共享写"，那是**产品语义变更**，会同时影响 `getVisibleClassIds` 的 4 处读端点与 6 处写端点 + 需翻转 T14 —— **属 P9，不在本轮授权内**。

### 3.3 ★附带发现（本轮新，比 ①② 更直接）：`updateTeam` **完全没有归属校验** —— 一条不依赖任何协作的完整越权链

**实测（原始输出摘录）**

```
### P3a tB PUT /teams/teamA {teacherIds:[tB]}   ← tB 既非成员也非创建者 :: {"http":200,"code":0,"msg":"更新成功"}
    db teamA teachers = [24570]                ← 只剩 tB，创建者 tA 被踢出
### P3b tB PUT /teams/teamA {classIds:[cA1]}                                 :: {"http":200,...}
### P3c tB PUT /classes/cA1                                                  :: {"http":200,...}
    db cA1 name = "r6_HACK3"                   ← 完整越权：改他人班级成功
### P3d tB PUT /teams/teamA {teacherIds:[]}    ← 清空创建者的团队                    :: {"http":200,...}
    db teamA teachers = []
### P3e tB DELETE /teams/teamA（对照）                                        :: {"http":403,"code":1003,"msg":"仅创建者可删除团队"}
```

**判定：需修（高）**。理由（防误报的三重证据）：
1. **同文件反差**：`deleteTeam:108` 有 `createdBy` 校验、`leaveTeam:124/126` 只动自己 → `updateTeam` 是**漏做**，不是"团队无归属概念"；
2. **测试覆盖为空**：`grep -rn "put('/api/teacher/teams" server/test` → **0 命中**（因此无既有回归护栏，修复必须由 C 新增用例，见 §5.4）；
3. **语义无害性可证**：`getTeams`（`:12-16`）只返回"我所属"的团队，`TeamEdit.vue` 的入口来自该列表 ⇒ **"成员可改"对合法流程零影响**；建议最小收口 = **非成员一律 403**（成员互改名单 = R6-P10 产品治理，另行拍板）。
4. 该端点是 `updateClass.teamIds`（§3.2 第一环）的**同类更宽入口**：即使修好 `teamIds`，不修 `updateTeam` 则**同一越权链仍可一步完成**（P3a→P3b→P3c）。

### 3.4 `saveDraft` / `submit`（任务 3）——判定：**需修（高）**，且**已被一条现有用例锁成"期望值"**

**请求形态与精确位置（全部实测）**

| 项 | 值 |
|---|---|
| 端点 | `PUT /api/student/assignments/:id/draft`（`routes/student.js:19`）· `POST /api/student/assignments/:id/submit`（`:18`）· `POST /api/student/assignments/:id/retry`（`:20`） |
| 控制器 | `studentController.js:288-304`（字段透传 `:290-296`）· `:269-286`（`:271-278`）· `:306-320`（`:308-311`） |
| **根因层** | `server/src/application/use-cases/submission.use-cases.js`：`submit` **:27-56**、`saveDraft` **:64-81**、`retry` **:89-96** —— 只校验「作业存在/锁定/截止/重复/练习次数」，**零班级归属** |
| 仓储层 | `server/src/infrastructure/persistence/submission.repository.js:36-41` `findAssignmentContext` = `findUnique({where:{id}})`，**无 studentId 维度** |
| 请求体 | `{questionId, subQuestionId?, answer}`（`studentController.js:274-276`/`:293-295`） |

**独立复现（自建夹具：sA∈cA1；asgB 仅投放 cB1）**

```
### P9a sA PUT /student/assignments/asgB/draft  :: {"http":200,"code":0,"msg":"草稿已保存"}
    db submission = {"id":19354,"status":"draft","answer":"r6b_CROSS_DRAFT","attemptCount":0,"aiScore":null}
### P9b sA POST /student/assignments/asgB/submit :: {"http":200,"code":0,"msg":"提交成功"}
    db submission = {"id":19354,"status":"submitted","answer":"r6b_CROSS_SUBMIT","attemptCount":1,"submittedAt":"2026-10-10T17:15:53.863Z"}
### P9c 对照：sA GET /student/assignments/asgB   :: {"http":403,"code":1003}   ← S-6 守卫有效
### P9d tB GET /teacher/submissions?assignmentId=asgB :: {"containsStray":false,"rows":0}
### P9e tB pending-summary :: {"pendingReview":0,"aiPending":0,"abnormal":0}
### P9f tA pending-summary :: {"pendingReview":0,"aiPending":0,"abnormal":0}
### P9g worker 扫描判据（gradingWorker.js:128）: strayStatus="submitted"，非 project 题 ⇒ wouldBePickedUp=true
```

**影响面评估（数据后果，逐条给依据，避免夸大）**

| 后果 | 有/无 | 依据 |
|---|---|---|
| 产生 `submission` 行（**真实落库**） | **有** | P9a/P9b：同一条 id=19354 由 `draft` 被改写为 `submitted`，`attemptCount` 0→1 |
| 占用/抢答面（同一 (assignmentId,studentId,questionId) 唯一键被非投放学生占位） | **有** | `findByAssignmentAndQuestion`（`submission.repository.js:44-48`）按三键查找 ⇒ 该生**先占**该题行；且 `submitProjectCore:670-685` 也用同一键 ⇒ 与实训提交流程互相影响 |
| **进入 AI 批改队列 ⇒ 消耗真实 LLM 调用并写 `aiScore`** | **有（推理链确证，非运行时实测）** | `gradingWorker.js:124-135` 的 `scanSubmissions` 判据 = **`status:'submitted'` 且题目非 project——全库、无班级/作业作用域** ⇒ 跨班提交行**必然被捞出并评分**。本轮**未启动 worker**（不联网、不写生产），故未实测 `aiScore` 落值；该推论的另一半由 P9g 的 DB 状态（`status='submitted'`）直接支撑 |
| 进入**教师批改队列**（徽标/KPI/审核列表可见） | **无（实测）** | P9d 教师审核列表 `rows:0`（`loadVisibleSubmission` 按 `isStudentVisibleToTeacher` 收窄）；P9e/P9f 两侧 `pending-summary` 全 0（`rollupPendingByAssignment:441-448` 的 `studentId ∈ 可见班级花名册` 收窄）⇒ 产生的是**孤儿提交行**：**被 AI 评分、但任何教师都看不到** |
| 学生可借此**读到**该作业内容 | **无** | P9c：`getAssignmentDetail:231-232` 的 S-6 守卫返回 403（round 5 修复有效） |
| 可篡改他人提交/成绩 | **无** | 写入行恒以 `studentId: req.user.id` 收窄（`:273`/`:292`/`:310`） |

> **判定修正（相对 C 的 V5 表述）**：C 写"污染数据、占位/抢答面"，本轮**逐项落实为**：① 落库 + 占位（有）；② **AI 评分资源消耗**（有，判据在 `gradingWorker.js:128`，**这是比"污染数据"更实的成本面**）；③ **教师侧完全不可见**（实测，所以它不会"进入教师批改队列"——C 的该句在本轮被**收窄**为"AI 队列"）；④ 读侧无泄漏（S-6 已封）。

**★ 对执行集的关键约束（本轮最重要的一条工程发现）**：**修它会翻转一条既有用例的断言**

`server/test/integration/ownership-guards.test.js:395-402`（round 5 新增的 S3 用例）当前**把漏洞行为写成了期望值**：

```js
it('S3: 对抗性 —— 先自行落一条草稿再取详情，仍 403（归属校验不可被「有提交」绕过）', async () => {
  const draft = await api(tokenStuC).put('/api/student/assignments/' + asgA.id + '/draft', {...});
  expect(draft.body.code).toBe(0);   // saveDraft 自身不做班级校验（既有行为，登记为遗留）  ← ★
  ...
```

⇒ round-6 的执行集**必须把"改 `server/test/` 这一条断言"显式交给 C**（`expect(draft.body.code).toBe(0)` → `expect(draft.status).toBe(403)` + 新增"DB 零写入"断言）。`server/test/` 属 C 的授权域，A/B 均不得触碰；**若不翻转该断言，修复必然表现为 1 例红灯（假回归）**。

---

## 4 任务 3（续）｜`saveDraft`/`submit` 的最小修法契约（**不改变合法响应形状**）

### 4.1 契约

| 项 | 取值 | 依据 |
|---|---|---|
| 未命中响应 | `403` + `{ code: 1003, message: '无权访问该作业', data: null }` | **与 `studentController.js:232`（S-6 守卫）逐字一致**；也与 `assertStudentInAssignment:501/508` 同码同文案 |
| 判定语义 | 学生 ∈ 该作业**已投放班级**之一（`assignment_classes ∩ student_classes`） | 与 `assertStudentInAssignment:495-508` 同一查询形态（本轮**不发明新语义**） |
| 校验时机 | ① 作业不存在 → `404/1004 '作业不存在'`（**形状不变**）；② **归属校验**；③ 锁定/截止/重复/次数（原样） | 顺序对齐 round 5 的 `resetStudentPassword:1086-1089`（**越权判定优先于业务分支**，避免"该作业已锁定/已截止"成为存在性与投放状态的预言机） |
| 合法路径 | **零变化**：已投放作业 → 直接落回原代码路径，状态码/文案/字段一律不变 | `ownership-guards.test.js` 的 S2/T13–T18 整 body `toEqual` 断言可作护栏 |
| 覆盖端点 | `saveDraft` / `submit` / `retry` **三条同批** | 三者在同一用例类、共用 `findAssignmentContext`；`retry` 虽只动本人行，同批修改成本≈0，且避免"未来复用 `retry` 路径"重新打开 |

### 4.2 为什么**不能**写在控制器层（GodFile 硬约束）

`studentController.js` 实测 **799 行**（GodFile 阈值 800，`arch-metrics.mjs` 基线 10）⇒ **控制器加 ≥2 行即破判据 2**（10 → 11）。
`mapSubmissionError`（`:160-167`）只把 `DomainError('LOCKED')` 映射为 403/1003，**其他 DomainError 一律 400/1001**；若想新增独立错误码，需在 `:162-164` 加分支 ⇒ **+2 行 = 破门禁**。

### 4.3 推荐实现（控制器 0 行改动，2 个文件 + 1 处 JSDoc）

1. `server/src/infrastructure/persistence/submission.repository.js`：新增
   ```js
   /** 学生是否在该作业投放的班级内（归属判据与 studentController.assertStudentInAssignment 同形） */
   isStudentInAssignment(assignmentId, studentId) {
     return this.prisma.assignmentClass.findFirst({
       where: { assignmentId, class: { studentClasses: { some: { studentId } } } },
       select: { assignmentId: true },
     });
   }
   ```
2. `server/src/application/use-cases/submission.use-cases.js`：在 `submit`/`saveDraft`/`retry` 的 `findAssignmentContext` **之后、业务分支之前**插入
   ```js
   if (!(await this.submissionRepo.isStudentInAssignment(assignmentId, studentId))) {
     throw new DomainError('无权访问该作业', 'LOCKED');   // 复用既有 403/1003 映射，控制器零改动
   }
   ```
3. `server/src/domain/ports/repositories.js:12` 附近：补 `isStudentInAssignment` 的 `@property` 契约（纯注释，零风险，可裁剪）。

> **诚实登记**：`'LOCKED'` 这个 code 字符串被复用于"无权访问"语义，是为了**不改控制器**（GodFile 硬约束下的最优解）。
> 代价：`mapSubmissionError` 的 403 分支同时承担"锁定"与"越权"两种消息（**消息文本不同、状态码与 code 相同**，与 `assertStudentInAssignment:492` vs `:508` 的既有做法同型）。若用户愿意接受判据 2 变为「GodFile 11 个」（= P1 的选项①），则可改为独立 code + 控制器显式分支，语义更干净。**A 推荐前者**（不破门禁）。

---

## 5 round 6 执行集（6 个必做文件 + 1 个可选注释文件 ≤ 预算 8）

### 5.1 清单（每条含：文件:行号 / 问题 / 依据 / 改法 / 风险 / 验证）

| # | 文件（本轮实测行号） | 问题 | 依据 | 建议改法（统一契约） | 风险 | 验证方法 |
|---|---|---|---|---|---|---|
| **1** | `server/src/controllers/teamController.js`（`updateTeam:73-100`；`createTeam:50-70`；新增导出 `getMyTeamIds`） | `updateTeam` **零归属校验**：可改任意团队名单（踢人/加人/挂任意班级 → 放大可见集） | §3.3 实测 P3a–P3d；同文件 `deleteTeam:108` 对照 | 提交前：`const t = await prisma.team.findUnique({where:{id}})`（已存在 `:76`）→ 若非 `createdBy===req.user.id` **且** 非 `teamTeacher(teamId,req.user.id)` → `403/1003 '无权操作'`；`createTeam` 增 `teacherSchool.findFirst({teacherId, schoolId})` 校验（同 `switchClassSchool:922`） | **中**（行为收紧；合法路径 = 成员/创建者，零影响） | ① 门禁：cycle-check **164 边不变**（`teacherController.js:9` 已 import 本模块）；② **须 C 新增用例**（现覆盖 = 0，见 §5.4）；③ 全量 1033 例不回归 |
| **2** | `server/src/controllers/teacherController.js`（`createClass:836-855`；`updateClass:857-878`；`createAssignment:690-756`；`updateStudent:1008-1059`；`addStudent:1107-1134`；`batchAddStudents:1136-1225`） | **body 目标资源全线未校验**：`teamIds`（`:844-848`/`:867-871`）、`schoolId`（`:839`）、`classIds`（`:745-747`/`:1049-1052`/`:1123`）、`questionIds`（`:705`） | §3.1/§3.2/§3.4 实测；`createAssignment` 实测 P4 | ① `teamIds`：`import { getMyTeamIds }`（`:9` 同一行追加，**不新增 import 边**）→ `teamIds ⊆ getMyTeamIds(req.user.id)`，否则 `403/1003 '无权操作'`；② `createClass.schoolId`：`teacherSchool.findFirst({teacherId, schoolId})`（同 `:922`）；③ `classIds`：`classIds ⊆ getVisibleClassIds(req.user.id, getSchoolId(req))`，否则 `403/1003 '无权操作'`；④ `questionIds`：**在 `:705` 的 where 追加 `teacherId: req.user.id`**（1 行，复用既有 `:706-708` 的 `400/1001 '部分题目不存在或已删除，无法布置'` ⇒ **零新响应形状、零存在性预言机**） | **中**（该文件已 1278 行，属既有 GodFile ⇒ **不改变 GodFile 计数**；新增约 20–25 行） | ① 既有合法路径用例直接护栏：`ownership-guards.test.js` T13/T14/T15、`assignment.test.js` 8 例、`student.test.js`/`student-v2.test.js`（全部使用本师班级/本师题目，实测 grep 确认）⇒ **过严即红**；② 越权面须 C 新增用例；③ 门禁 164/47 不变 |
| **3** | `server/src/controllers/checkerController.js`（`confirmCheckerHandler:33-59`、`rollbackCheckerHandler:65-87`、`generateCheckerHandler:94-111`；三处 `findUnique` = `:36`/`:68`/`:97`） | 三个写端点都能对**他人题目**生效（实测 confirm/rollback 均 200 + 真实写库；generate 为 **fire-and-forget 触发 LLM**，静态确证） | §2.1 #28-30 实测；`teacherController.js:265` **同资源**对照（tB → 404） | 把三处 `findUnique({where:{id}})` 改为 `findFirst({where:{ id, teacherId: req.user.id }})` → 未命中走**既有** `404/1004 '题目不存在'` 分支（**零新增分支、零新响应形状**）。**可选对齐**：再加 `deletedAt: null`（与 `:265` 完全一致；注意这会把"软删自己的题"由 200 变 404，属有意变更，须登记） | **低**（3 处 where 收窄 + select 不变） | 静态：三处 `findUnique` 归零；运行时**须 C 新增用例**（现覆盖 = 0）；不触发 LLM 的 `confirm`/`rollback` 可直接断言 403/404 + DB 零写入 |
| **4** | `server/src/infrastructure/persistence/submission.repository.js`（`findAssignmentContext:36-41` 之后） | 仓储层无 student 维度 ⇒ 应用层无从校验班级归属 | §3.4/§4.2 | 新增 `isStudentInAssignment(assignmentId, studentId)`（`assignmentClass.findFirst` + `class.studentClasses.some`，见 §4.3 代码块） | **低**（纯新增方法） | 门禁：`bind-check.mjs`（导出/绑定自检）+ cycle-check 164 边不变 |
| **5** | `server/src/application/use-cases/submission.use-cases.js`（`submit:27-56`、`saveDraft:64-81`、`retry:89-96`） | 三个用例零班级归属 ⇒ `saveDraft`/`submit`/`retry` 可对未投放作业落库 | §3.4 实测 P9a/P9b | 三处插入 §4.3 的守卫（`DomainError('无权访问该作业','LOCKED')`）⇒ `403/1003`，**控制器 0 行改动**（回避 `studentController.js` 799 行 → 800 门禁） | **中**（涉及学生端核心写入路径；但合法路径完全不变） | ① **会翻转 `ownership-guards.test.js:395-402` 的 S3 断言** ⇒ **必须由 C 同批修改**（§3.4 末）；② `submit.test.js` + `auth.test.js:56` 的合法提交路径作护栏；③ 全量 1033 例 |
| **6** | `server/src/controllers/projectController.js`（`createProject:122-216` 的 `:173-177`；`updateProject:219-322` 的 `:273-280`） | `body.classIds` 未校验（实测：`projectClass` 落他人班级） | §2.1 #18/#19 实测 P7/P11 | `classIds ⊆ getVisibleClassIds(req.user.id, getSchoolId(req))`，否则 `403/1003 '无权操作'` | **低**（影响面仅 `listSubmissions:51-58` 的 `totalStudents` 统计 + 极弱的班级规模信息泄漏） | 既有 `project` 相关用例（若用本师班级则不受影响）+ C 的新用例；门禁不变 |
| **7（可选）** | `server/src/domain/ports/repositories.js`（`:12` 的 JSDoc） | 端口契约未登记新方法 | §4.3 | 追加 `@property {(assignmentId: number, studentId: number) => Promise<object|null>} isStudentInAssignment` | **零**（纯注释） | 无（可裁剪以省预算） |

> **预算核算**：必做 **6** 个文件（1–6）+ 可选 **1** 个（7）= **7 文件 ≤ 8**。`server/test/` 的改动**不计入 B 的 8 文件预算**（C 的授权域，与本流水线历轮一致）。

### 5.2 为什么这样排序（对齐任务书的三个优先级）

| 优先级 | 满足情况 |
|---|---|
| ① 能被现有 1033 例或门禁验证 | #2（`ownership-guards` T13/T14/T15 + `assignment.test.js` 8 例 + `student*.test.js` 全部走本师资源 ⇒ 过严即红）；#4/#5（`submit.test.js`、`auth.test.js:56` 合法路径 + **1 条既有断言的定向翻转**）；#1/#3/#6（**无既有覆盖 ⇒ 必须 C 新增**，已在 §5.4 显式交接）；全部 7 项受 4 项门禁约束（cycle 164 边 / layers 47 / GodFile 10 / hard-metrics 0/0/0 + `bind-check`） |
| ② 零视觉风险 | 执行集 **7 个文件全部在 `server/src`**（+0 client 文件）⇒ 判据 5（无障碍）不受影响、像素风险 = 0 |
| ③ 收口一个工作流 | **收口「资源作用域校验」这一条工作流**：把 round 4 S-2 建立、round 5 落地的"路径参数归属契约"**扩展到 body 目标资源 + team/question 写路径**，形成**单一契约**（`403 + 1003 + '无权操作'`；学生侧 `'无权访问该作业'`） |

### 5.3 门禁零增量前提（可复算）

| 门禁 | 预期 | 理由 |
|---|---|---|
| `cycle-check` | **164 边 / SCC 0 不变** | `teacherController.js:9` **已** import `teamController.js`；`checkerController`/`projectController`/`submission.repository`/`submission.use-cases` 均**不新增跨模块 import**（校验所需函数已在各自模块或同层） |
| `check-layers` | **违规 0 / 未分层 47 不变** | 不新增文件；`submission.use-cases.js` 已在 application 层、repository 已在 infrastructure 层 |
| `arch-metrics` | **GodFile 10 不变**（文件数 146 不变） | `teacherController.js`（1278）与 `checkerController.js`（111）等**均非新增**；`studentController.js` **0 行改动**（§4.2 的关键设计） |
| `hard-metrics` | **0 / 0 / 0 不变** | 纯 server 改动 |
| `bind-check` | PASS | 新增 1 个 repository 方法（类成员）+ teamController 新增 1 个具名导出（`getMyTeamIds`）⇒ 属该门禁专治的"导入但未导出"面 |

### 5.4 交接给 C 的新增用例清单（**否则 #1/#3/#6 不可验证**）

> 判据 ① 的诚实界定：**#1（updateTeam）、#3（checker×3）在现有测试中覆盖为 0**（实测 `grep -rn "put('/api/teacher/teams" server/test` → 0；checker 写端点无命中）。按 round 4 的既定判据，**"无测试覆盖 = 不可验证 = 需拍板"**；本轮用户既已授权"资源作用域系统普查 + 修复"，故 A **把"新增用例"作为执行集的前置条件显式交接**，请 Captain 按 P7 的先例授权 C 在**既有测试文件内**追加（避免改 68 套件口径）：
1. `ownership-guards.test.js`（既有文件）：**翻转 S3 断言**（`code 0` → `403/1003` + DB 零写入）+ 新增「他人团队挂班级 / 非成员改团队 / 用他人班级 id 建学生 / 用他人题目布置作业」四组；
2. checker 三端点：跨师 `confirm`/`rollback` → 403/404 且 `checkerScript`/`checkerStatus` 逐字节不变（`generate` 用**未登录/跨师**路径断言拒绝，**不得真发 LLM**）。

---

## 6 本轮不做清单

| # | 项 | 原因 |
|---|---|---|
| 1 | **R6-P9 团队可见性语义变更**（把团队班级移出**写**作用域，或改为"团队只读共享"） | **产品语义**：会同时改 4 处读端点 + 6 处写端点，并翻转 round-5 的 T14 契约 ⇒ **需用户拍板**（A 不擅自改团队语义，遵任务书） |
| 2 | **R6-P10 团队治理语义**（成员可否互相增删） | 产品决策；本轮只堵"**非成员**"这一确定越权面 |
| 3 | **P7/S-1** `INTERNAL_SECRET` fail-closed | 需先确认生产是否已配密钥；改启动语义 + 零测试覆盖 ⇒ 需拍板 |
| 4 | **P8/S-3** 默认超管口令 | 改登录/初始化语义；生产状态不可判定 ⇒ 需拍板 |
| 5 | **S-4** `deepseek.js:274/364` LLM 完整响应落盘 | 日志口径专项，round 4 已裁定"观察"；本轮主题为 authorization scope |
| 6 | **S-5** `getMonitor` 日志回吐 | 已有正确 `super_admin` 门禁，round 4 已定级"低/设计意图" |
| 7 | **GodFile 10 个 / M-1b / N-1 / N-2** | 已确认不可达（4 类），按任务书**不重新论证、不列入执行集** |
| 8 | `adminController` 的 10 个写端点加学校维度作用域 | super_admin 是**全局角色**（`routes/admin.js:7`），引入"管理员只能管某校"= 新增产品概念/权限模型 ⇒ 需拍板（本轮判"不适用"，**不是**缺口） |
| 9 | `updateStudent` 要求"全部源班级可见" | 会破坏多班共管语义（`studentClass` 多对多）⇒ 属过度收紧，**明确不做** |
| 10 | 门禁脚本自身加固（子串误报等） | 末轮改门禁有风险，round 3 已登记不做 |

---

## 7 局限声明

1. **未复跑 jest**：本轮为只读审查，**1033 passed / 0 failed / 68 套件**沿用 Captain 提供的 round-5 收尾基线，A **未独立复算**（该口径属 C 的职责；constraints §4 明确 `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` 由 C 执行）。本报告引用的"既有用例"证据均来自**源码阅读**（`ownership-guards.test.js`、`assignment.test.js`、`student*.test.js` 的断言与夹具），**未运行**。
2. **未启动 worker**：`saveDraft/submit` 缺口的"进入 AI 批改队列"结论来自 `gradingWorker.js:124-135` 的**扫描判据推理链**（该判据为全库无作用域），**未运行时实测**；这也是本轮唯一一条"推理链而非实测"的缺口证据，已在 §3.4 的表格中单独标注。
3. **#48 `createTeam.schoolId` 未运行时复现**：其代码形态与 **#24 `createClass.schoolId`（已实测 200）** 逐行等价（`getSchoolId(req)` → `prisma.team.create({data:{schoolId}})`，无 `teacherSchool` 查询）⇒ 按"等价形态"判定。**同类判定的其余端点**（#28 `checker/generate`）同理，仅静态确证。
4. **未做渗透/未联网**：无生产环境访问权；S-1/S-3 的"生产是否已配置/已轮换"仍不可判定（沿用 round 4 §2.7 的边界声明）。
5. **未评估修复后的性能影响**：新增的可见集查询是每请求 1–2 次索引查询，与 round 5 已落地的 6 处守卫同形；**未做基准测试**（本仓无该装置）。
6. **本轮不重扫 round 0–5 的既有结论**（规范 §六.3）：除 S-2/S-6/V5 三条被本轮**显式复核并扩展**外，其余历史发现（依赖、日志、分层、令牌、死代码）**未复查**，时效性以对应轮次报告为准。
7. **探针的环境边界**：两次探针各自 `PORT=0` 内联执行、结束即 `process.exit(0)`（实测日志 `port 0`）；因未绑定固定端口，**端口残留风险为 0**，但未做额外的 `lsof` 复核。夹具已全量清理（`leftover r6_/r6b_ users = 0`），但**未对 `exam_system_test` 做全库快照对拍**（该库是 jest 的共享测试库，历史上由 `setup.js` 反复清理，全库对拍无意义）。
8. **#16 `retry` 的危害边界**：仅"重置本人提交行"，**无跨用户写入**；本轮未单独运行时复现（与 `saveDraft` 共用同一守卫方法，故归入同批）。若 Captain 要求逐条实测，可交 C 在用例中一并覆盖。
9. **模板/语料未覆盖的写端点**：本报告口径 = **路由注册点**。若未来出现"路由由配置/循环动态生成"的写法，本口径会漏；本轮实测（`grep` 57 条 + 5 个挂载点 + 1 处内联）**未见动态注册**，该风险当前为空。

---

## 8 一句话结论

> **写端点普查 57/57 穷尽**：16 条**需修**（body 目标资源 8 条 · team 写路径 2 条 · checker 写路径 3 条 · 学生提交写路径 3 条），21 条已校验无缺口，20 条无归属概念，0 条需端点级拍板。
> **两条 body 绕过的定性**：`updateStudent.body.classId` = **纯守卫漏做**（需同时校验源/目标两侧，源侧已有）；`updateClass.body.teamIds` = **第一环漏洞 + 第二环设计后果**——可被利用的是第一环（修 ①，本轮执行集），"团队班级是否该给写权限"是第二环（**R6-P9 需拍板**，不阻塞修复）。
> **本轮最严重的新发现**：`teamController.js:73-100` `updateTeam` **零归属校验**，构成一条不依赖受害者配合的**完整跨租户越权链**（实测：非成员 → 改他人团队名单 → 挂他人班级 → 改他人班级 200），而**同文件 `deleteTeam:108` 有正确的创建者校验** ⇒ 判定为漏做而非设计。
> **执行集 = 6 必做 + 1 可选文件（预算 8），全部在 `server/src`，零视觉风险，门禁零增量**；**唯一硬前置** = C 同批翻转 `ownership-guards.test.js:395-402` 的 S3 断言并新增 team/checker 用例。
> **新增拍板项 3 条**：R6-P9（团队可见性写权限语义）· R6-P10（团队治理语义）· R6-P11（`studentController` 799/800 行结构性两难 —— A 已用"守卫下沉用例层"绕开，仅在用户否决该方案时成立）。
