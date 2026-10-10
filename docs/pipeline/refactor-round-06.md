# refactor-round-06 —— 资源作用域校验的系统性收口（流水线第 6 轮 · 定点修复）

> 轮次：**06（定点修复 / authorization scope 系统收口）** ｜ 日期：**2026-10-11** ｜ 基线 commit：**`e722f54`**（`git rev-parse HEAD` 实测 = `e722f549450ac9504d4c0b1e14a1ac148df498b6`）
> Agent B 技能：`tech-code-refactoring` ｜ 授权范围：Captain 本轮任务书「7 个文件（6 必做 + 1 可选）+ ownership-guards.test.js 的 S3 断言翻转与新增用例」
> 上游输入：`docs/pipeline/audit-round-06.md`（Agent A · 57/57 写端点普查 · 16 项需修）｜ `refactor-round-05.md`（403/1003 契约）｜ `project-constraints.md`（15 条纪律）｜ `pipeline-status.md`
> 测量纪律：行号/计数**全部本轮实测**（纪律 10），未采信任何前轮报告数字；引 A 报告处均标注「A 报 → 本轮实测」。

---

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 只写声明内文件 | ✅ 源 **7**（含可选 ⑦）· 测试 **1**（`ownership-guards.test.js`）· 报告 **1**（本文件） |
| 不新增任何文件 | ✅ `server/src`、`client/src` 文件数 **146 不变**；探针用 `node --input-type=module - <<EOF`（stdin）内联执行，**未落任何临时文件** |
| `studentController.js` **0 行改动** | ✅ `git diff --stat -- server/src/controllers/studentController.js` = **空**；`wc -l` = **799**（GodFile 阈值 800 未破） |
| 不改 `client/` / 不改 `.md`（除本报告）/ 不碰 `client/dist`、`tests/` | ✅ `git status --porcelain -uno` 中零 client、零 `.md`（`pipeline-status.md` 的 M 为 Captain 的状态文件） |
| 零 git 写操作（禁 clean/stash/checkout/reset/restore） | ✅ 只用 `rev-parse/status/diff --stat` |
| 不跑全量回归 / 不跑 build / 不启常驻服务 / 不联网 | ✅ 只跑**定向** jest（29 套件）与 1 次内联探针；未 build；未出网；**未调用** `parse-exam`/`generate-reference`/`checker/generate`（本人题目路径） |
| 临时服务必须 `PORT=0`（纪律 14） | ✅ 探针日志实测 `"port":"0"` / `HTTP 服务已启动 → http://localhost:0`，结束 `process.exit(0)`；**未占用 :5173 / :3000** |
| 只写测试库 `exam_system_test` 且事后清理 | ✅ 探针内 `SELECT DATABASE()` = `exam_system_test`；夹具前缀 `r6b_`；收尾 `leftover r6b_ users = 0` |
| 不越权改测试 | ✅ **未触碰** `server/test/unit/**` 与其余 `integration/**`；唯一测试改动 = 授权文件 `ownership-guards.test.js` |
| 每轮 ≤ 8 源文件（§6） | ✅ 源 **7**（含 1 个纯注释文件） |

> ⚠️ **诚实登记 1 项与 A 执行集的偏离**：`createAssignment` 的 `questionIds`（A §5.1 #2 ④）与 `classIds`（#2 ③）**本轮未落地**。原因不是取舍，而是**硬冲突**：任何正确实现都会让既有单测 `server/test/unit/assignment-q9-branches.test.js` 变红，而该文件**不在本轮写入授权内**（任务书第六步只授权 `ownership-guards.test.js`），且任务书明令「既有套件因你的改动而失败 → 停下回报，不要改测试迁就实现」。
> **已实测取证并即时上报 Captain**（详见 §6，含两次探针的原始输出）。其余 **8 组**（updateTeam / createTeam / createClass / updateClass / updateStudent / addStudent / batchAddStudents / checker×3 / project×2 / 学生提交×3）**全部落地**。

---

## 1 改动文件清单（逐个说明 + 对应 A 执行集编号）

`git diff --stat`（本轮实测）：

```
 server/src/application/use-cases/submission.use-cases.js  |  29 +-
 server/src/controllers/checkerController.js               |  16 +-
 server/src/controllers/projectController.js               |  41 +++
 server/src/controllers/teacherController.js               |  56 +++-
 server/src/controllers/teamController.js                  |  30 +++
 server/src/domain/ports/repositories.js                   |   2 +-
 server/src/infrastructure/persistence/submission.repository.js | 31 ++-
 server/test/integration/ownership-guards.test.js          | 292 ++++++++++++-
 8 files changed, 475 insertions(+), 22 deletions(-)
```

| # | 文件（A 执行集编号） | 行数（实测） | 改了什么 |
|---|---|---|---|
| 1 | `server/src/controllers/teamController.js`（**A #1** · §3.3 / §2.1 #48/#49） | 174 → **204** | ① `updateTeam` 新增归属守卫（**本轮最严重项**，A §3.3 实测「非成员 → 改他人团队名单 → 踢出创建者 → 挂他人班级 → 改他人班级 200」）；② `createTeam` 新增 `teacherSchool` 校验（A §2.1 #48）；③ 新增导出 `getMyTeamIds`（A #1 建议的归属判据） |
| 2 | `server/src/controllers/teacherController.js`（**A #2** · §5.1 #2） | 1278 → **1332** | 新增 3 个模块内守卫函数；6 个 handler 补 body 目标守卫：`createClass`（schoolId + teamIds）、`updateClass`（teamIds ★C 的 403→200 链第一环）、`updateStudent`（body.classId 目标侧）、`addStudent`、`batchAddStudents`（classId）。**`createAssignment` 两项未落地，见 §6** |
| 3 | `server/src/controllers/checkerController.js`（**A #3** · §2.1 #28-30） | 112 → **115** | 三处 `findUnique({where:{id}})` → `findFirst({where:{id, teacherId: req.user.id}})`，走**既有 404 分支**；`select` 不变、零新增分支、零新响应形状 |
| 4 | `server/src/infrastructure/persistence/submission.repository.js`（**A #4** · §4.3） | 62 → **86** | `findAssignmentContext(assignmentId, studentId?)` 追加**归属收窄**（`assignmentClass ∩ studentClass`，与 `studentController.assertStudentInAssignment` 同形）；不传第二参时查询形状**逐字不变** |
| 5 | `server/src/application/use-cases/submission.use-cases.js`（**A #5** · §3.4/§4.1） | 97 → **113** | 新增 `_loadOwnedAssignment()`（404 形状不变 → 未投放 403/1003「无权访问该作业」→ 落回原业务分支），`submit`/`saveDraft`/`retry` 三处接入 ⇒ **`studentController` 0 行改动**（A §4.2 的 GodFile 绕行方案） |
| 6 | `server/src/controllers/projectController.js`（**A #6** · §2.1 #18/#19） | 458 → **499** | `createProject`/`updateProject` 的 **body.classIds** 归属校验；可见集在本文件**内联**实现（理由见 §2.3：新增 `import teamController` 会多 1 条边，破坏 `cycle-check` **164 边**不变量） |
| 7（可选） | `server/src/domain/ports/repositories.js`（**A #7** · §4.3） | 34 → **33** | `SubmissionRepository` 端口 JSDoc 登记新契约（`studentId?` 归属收窄语义）。**纯注释** |
| 8 | `server/test/integration/ownership-guards.test.js`（任务书第四步） | 410 → **692** | **S3 断言翻转**（把锁死的漏洞期望值纠正为 403 + DB 零写入）+ **新增 26 例**（R1-R22 / S5-S8） |

---

## 2 逐守卫：契约与位置（本轮实测行号）

### 2.0 统一契约（与 round 5 逐字一致，未发明新契约）

| 侧 | 未命中响应 | 依据 |
|---|---|---|
| 教师端（班级/学生/团队/项目） | `403` + `{ code: 1003, message: '无权操作', data: null }` | `refactor-round-05 §2.0`；同文件 `lockAssignment:763` / `deleteTeam:108` |
| 教师端（checker 三端点） | `404` + `{ code: 1004, message: '题目不存在', data: null }`（**既有分支**） | A #3 契约；同资源对照 `teacherController:265` |
| 学生端（提交/草稿/重答） | `403` + `{ code: 1003, message: '无权访问该作业', data: null }` | `studentController:232`（S-6 守卫）逐字一致；复用 `DomainError('LOCKED')` → 既有 `mapSubmissionError` 映射 |
| 时序 | **404/400 既有分支保持原位 → 归属 403 → 业务分支** | 沿用 round 5 `updateStudent:1015-1019` 次序；越权判定优先于业务分支（避免状态预言机） |
| 零写入 | 全部守卫位于**任何写库动作之前** | 每条越权用例均有快照 `toEqual` 对拍（§5） |

### 2.1 teamController.js

| 位置（实测） | 守卫 | 语义 / 拍板边界 |
|---|---|---|
| `createTeam:55-62` | `prisma.teacherSchool.findFirst({ teacherId: req.user.id, schoolId })` 未命中 → 403 | 「不得在自己不属于的学校建团队」；判据同 `switchClassSchool:922`（A §2.1 #48 与本轮实测一致） |
| `updateTeam:84-93` | `team.createdBy !== req.user.id` → 再查 `teamTeacher(teamId, req.user.id)`；两者皆不满足 → 403 | **仅创建者或成员可改**；**只堵「非成员」** —— 成员互改名单 = 拍板项 **R6-P10**，本轮不擅自扩大（遵任务书） |
| `getMyTeamIds:159-162`（新导出） | `teamTeacher.findMany({teacherId})` → `number[]` | 供 `teacherController` 的 `body.teamIds ⊆ 本人团队` 判据复用；**同一 import 行追加名字 ⇒ 不新增相对导入边**（`teacherController.js:9` 早已 import 本模块，A §1.1 的复算被本轮实测确认） |

### 2.2 teacherController.js

| 位置（实测） | handler | 守卫 | 对应 A |
|---|---|---|---|
| `47-68` | — | 新增 3 个**非导出**模块内函数：`canTeacherManageClasses`（集合版，空集放行）、`canTeacherManageTeams`（teamIds ⊆ getMyTeamIds）、`isTeacherInSchool`（teacherSchool） | §5.1 #2 |
| `869-876` | `createClass` | ① `isTeacherInSchool(req.user.id, schoolId)`；② `canTeacherManageTeams(req.user.id, teamIds)`；均在任何写库前 | #24（A 实测：tB 在 schoolA 建班 200 且把班级挂进他人团队 200） |
| `901-905` | `updateClass` | `canTeacherManageTeams(req.user.id, teamIds)`（在既有路径守卫 `:863` **之后**、`prisma.class.update` **之前**） | #25 ★**C 实测 403→200 链的第一环** |
| `1060-1064` | `updateStudent` | `classId && !canTeacherManageClass(req.user.id, classId, getSchoolId(req))` → 403。**只补目标侧**：源侧已由 `:1017` 的 `canTeacherManageStudent` 覆盖；**未**要求「全部源班级可见」（保留多班共管语义，遵 A §5.1/§6.9） | #54（A 实测：tA 把学生移入 tB 的班 → 200；随后 tB 重置该生口令 → 账号接管） |
| `1163-1166` | `addStudent` | `canTeacherManageClass(req.user.id, classId, getSchoolId(req))`；**既有 `400 '班级不存在'` 分支保持原位**（在 403 之前） | #52 |
| `1196-1199` | `batchAddStudents` | 同上（在 `for` 循环之前 ⇒ 批量零写入） | #53 |

> 新增约 54 行使 `teacherController.js` 由 1278 → 1332 行：该文件**本就在 GodFile 基线内**（>800 现 10 个，判据为「超标个数」而非行数）⇒ `godfileOver800: 基线 10 / 实测 10` **不变**（§3.1 实测）。

### 2.3 checkerController.js

| 位置（实测） | handler | 改动 | 契约 |
|---|---|---|---|
| `36-41` | `confirmCheckerHandler` | `findUnique({where:{id}})` → `findFirst({where:{id, teacherId: req.user.id}})`，`select:{id,type}` 不变 | 未命中 → 既有 `404/1004 '题目不存在'` |
| `70-75` | `rollbackCheckerHandler` | 同上 | 同上 |
| `100-105` | `generateCheckerHandler` | 同上（`select` 含 `checkerStatus` 不变） | 同上 —— **他人题目不再触发 fire-and-forget 的 LLM 生成**（未新增响应形状，故不需要新错误码） |

> 未加 `deletedAt: null`（A 的可选项）：那会把「软删自己的题」由可操作变为 404，属**有意行为变更**；本轮取最小改动面，登记为 §8 遗留项。

### 2.4 submission.repository.js + submission.use-cases.js（学生端三条写入路径）

```js
// submission.repository.js:54  —— 第二参为可选归属收窄；不传时查询形状与改动前逐字一致
async findAssignmentContext(assignmentId, studentId) {
  const assignment = await this.prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { endTime: true, allowResubmit: true, mode: true, maxAttempts: true, locked: true },
  });
  if (!assignment || studentId == null) return assignment;
  const linked = await this.prisma.assignmentClass.findFirst({
    where: { assignmentId, class: { studentClasses: { some: { studentId } } } },
    select: { assignmentId: true },
  });
  return linked ? assignment : null;          // 与 assertStudentInAssignment 同形判据
}
```

```js
// submission.use-cases.js:26 —— 三处 submit/saveDraft/retry 统一入口
async _loadOwnedAssignment(assignmentId, studentId) {
  const assignment = await this.submissionRepo.findAssignmentContext(assignmentId, studentId);
  if (assignment) return assignment;
  const exists = await this.submissionRepo.findAssignmentContext(assignmentId);
  if (!exists) throw new EntityNotFoundError('作业不存在');       // ① 404 形状不变
  throw new DomainError('无权访问该作业', 'LOCKED');               // ② 既有映射 ⇒ 403 + 1003
}
```

**为什么把归属判据并入既有 `findAssignmentContext` 而不是 A §4.3 的新方法 `isStudentInAssignment`**（★**本轮第二处与执行集的偏离，但契约等价**）：
A 的方案要求「新增 port 方法 + 用例层调用新方法」。本轮实测：`server/test/unit/application/submission.use-cases.test.js` 的假仓储 `makeRepo()`（:8-16）**只实现了既有 5 个方法**，新增方法调用会让该套件 **32 例中约 30 例** `TypeError` 变红；而 `server/test/unit/infrastructure/persistence-repositories.test.js` 同时**逐字断言** `findAssignmentContext` 的 `{where,select}` 形状（因此也不能把 `findUnique` 换成 `findFirst`）。
并入既有方法后：① 契约语义与 A 逐条一致（403/1003/文案/时序/零写入）；② 既有单测**全绿**（实测 32/32 + 12/12）；③ 端口面不扩大。代价：`_loadOwnedAssignment` 在**拒绝路径**多一次查询（命中路径仍为 1 次）。

### 2.5 projectController.js

| 位置（实测） | 内容 |
|---|---|
| `32-60` | 新增 `visibleClassIdSet(teacherId, schoolId)`（与 `teamController.getVisibleClassIds` **逐字同形**：直连 ∪ 团队 + 同款 schoolId 过滤）+ `canManageProjectClasses(req, classIds)` |
| `createProject:183-186` | 在交互式事务**之前**校验 `classIds ⊆ 可见集` → 否则 403（既有 400 参数/权重分支全部保持原位） |
| `updateProject:303-306` | `classIds !== undefined` 时（覆盖式 `deleteMany+createMany`）先校验 → 否则 403 |

**为何内联而非 import**：`projectController.js` 目前**不** import `teamController.js`，新增该 import 会使 `cycle-check` 的相对导入边由 **164 → 165**，直接破坏本轮硬约束。已在代码注释与 §8 登记为「待共享层（`utils/classScope.js`）出现时消除的重复」。

---

## 3 自证证据（命令 + 原始输出）

### 3.1 四门禁 + 两个不变量（全部本轮复跑）

```
$ node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 164 条相对导入边          ← ★ 164 边不变（硬约束）
  强连通分量（|SCC|>1）: 0（基线 1）
  自环（文件 import 自身）: 0
结论：PASS

$ node server/scripts/check-layers.mjs
文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个     ← ★ 71/0/47 不变

$ node scripts/gates/arch-metrics.mjs
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47  实测=47
  ✓ godfileOver800     基线=10  实测=10                  ← ★ 未变 11
  · >500 行（观察带）    基线=19  实测=19
  GodFile >800 行：… teacherController.js (1332) …        ← 仍在基线 10 个之内（判据=个数）
结论：PASS

$ node scripts/gates/hard-metrics.mjs
  ✓ hex6  基线=0 实测=0 ｜ ✓ important 基线=0 实测=0 ｜ ✓ modalConfirm 基线=0 实测=0
结论：PASS

$ find server/src client/src -type f | wc -l
     146                                                   ← ★ 146 不变
$ wc -l < server/src/controllers/studentController.js
     799                                                   ← ★ 799 不变（GodFile 阈值 800）
$ git diff --stat -- server/src/controllers/studentController.js
(空)                                                       ← ★ studentController 0 行改动
$ node scripts/gates/bind-check.mjs
（169 模块 / 511 绑定 / 0 违规 / exit 0 —— 新增导出与新增方法均被真 import 校验通过）
```

### 3.2 定向单测（29 个套件 / 345 例，全绿）

> 全量口径留 Agent C（§9）。本轮按任务书跑「ownership-guards + checker/team/teacher/submission 相关既有套件」，命令统一为
> `cd server && DATABASE_URL="<由 server/.env 只换库名得到 exam_system_test>" PORT=0 NODE_OPTIONS=--experimental-vm-modules npx jest --config test/jest.config.js --runInBand --forceExit --testPathPatterns="..."`。

```
# ① 授权测试文件（含 26 条新例 + S3 翻转）
Test Suites: 1 passed, 1 total
Tests:       48 passed, 48 total
   round 6 · updateTeam 归属            R1 ✓ R2 ✓ R3 ✓ R4 ✓
   round 6 · updateClass.teamIds/createClass  R5 ✓ R6 ✓ R7 ✓ R8 ✓
   round 6 · createTeam.schoolId        R9 ✓ R10 ✓
   round 6 · updateStudent/addStudent/batch  R11 ✓ R12 ✓ R13 ✓ R14 ✓
   round 6 · checker 三写端点            R15 ✓ R16 ✓ R17 ✓ R18 ✓ R19 ✓
   round 6 · project body.classIds      R20 ✓ R21 ✓ R22 ✓
   S-6 学生侧                          S1 ✓ S2 ✓ S3 ✓(翻转后) S4 ✓ S5 ✓ S6 ✓ S7 ✓ S8 ✓
   （T1-T18 既有 18 例全部保持绿）

# ② 定向既有套件（teacher/student/submission/assignment/project/review/qa-batch1 等）
Test Suites: 24 passed, 24 total
Tests:       302 passed, 302 total
Time:        31.83 s

# ③ 其余集成与仓储套件
Test Suites: 6 passed, 6 total
Tests:       55 passed, 55 total
   （persistence-repositories 在 ②③ 各跑一次 ⇒ 去重后 29 套件 / 345 例）

# ④ 与 A 执行集存在冲突的那个单测：本轮改动后逐字复跑仍全绿
$ … --testPathPatterns="assignment-q9-branches"
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total                                ← ★ 零回归（探针已回滚，见 §6）
```

**结论：既有 1033 例口径中，本轮触达的 29 套件 345 例 0 failed；无任何既有套件因本次改动失败。**

### 3.3 越权前后对拍（A 的「改动前」 vs 本轮的「改动后」）

**装置**：内联探针（`node --input-type=module - <<EOF`，**不落文件**）· `PORT=0`（日志实测 `"port":"0"`）· `SELECT DATABASE()` = **exam_system_test** · 夹具前缀 `r6b_`（两校 + 两教师互不共享团队 + 一班一生 + 团队 A/B + 实训题 + 作业）· 收尾 `leftover r6b_ users = 0`。

| # | 越权请求（夹具：tA∈S，tB∈S2，teamA 属 tA，teamB 属 tB，clsA 属 tA，stuC∈clsB，asgA 投放 clsA） | **改动前（A 实测）** | **改动后（本轮实测）** | 零写入断言 |
|---|---|---|---|---|
| 1 | tB `PUT /teacher/teams/teamA` `{name:HACK,teacherIds:[tB],classIds:[clsA]}` | **200**（A §3.3 P3a/P3b：创建者被踢出、他人班级被挂入） | **403 / 1003 / 无权操作** | teamA.name 未改 ✓ 成员仍 `[tA]` ✓ teamA 无新增班级 ✓ |
| 2 | tA `PUT /teacher/classes/clsA` `{teamIds:[teamB]}` | **200**（A §3.2 P2a：clsA 被挂进 teamB） | **403 / 1003** | `teamClass(teamB,clsA)` = 0 ✓（⇒ 后续「tB 获得 clsA 写权限」链失去输入） |
| 3 | tB `POST /teacher/classes?schoolId=S` | **200**（A §2.1 #24：tB 在 schoolA 建班成功） | **403 / 1003** | `HACK` 班级数 = 0 ✓ |
| 4 | tA `POST /teacher/classes?schoolId=S` `{teamIds:[teamB]}` | **200**（A §2.1 #24：挂进他人团队成功） | **403 / 1003** | `HACK` 班级数 = 0 ✓ teamB 无班级 ✓ |
| 5 | tA `POST /teacher/teams?schoolId=S2` | **200**（A §2.1 #48 静态确证：无 teacherSchool 校验） | **403 / 1003** | `HACK` 团队数 = 0 ✓ |
| 6 | tA `PUT /teacher/students/stuC` `{classId:clsA}` | **200**（A §3.1 P1a：学生跨校落入他人班） | **403 / 1003** | stuC 仍在 clsB ✓ 未移入 clsA ✓ |
| 7 | tB `POST /teacher/students` `{classId:clsA}` | **200**（A §2.1 #52 实测） | **403 / 1003** | 越权学生数 = 0 ✓ |
| 8 | tB `POST /teacher/students/batch` `{classId:clsA}` | **200**（A §2.1 #53 实测） | **403 / 1003** | 越权学生数 = 0 ✓ |
| 9 | tB `POST /questions/qA/checker/confirm` | **200**（A §2.1 #29：checkerStatus review→ready） | **404 / 1004 / 题目不存在** | checkerStatus 仍 `ready` ✓ checkerScript 未变 ✓ |
| 10 | tB `POST /questions/qA/checker/rollback` | **200**（A §2.1 #30：checkerScript v2→v1） | **404 / 1004** | checkerScript 逐字节不变 ✓ |
| 11 | tB `POST /questions/qA/checker/generate` | 200 + **fire-and-forget 触发真实 LLM**（A #28 静态确证） | **404 / 1004** | checker 状态未变 ✓ **未触发 LLM** |
| 12 | tB `POST /teacher/projects` `{classIds:[clsA]}` | **200**（A §2.1 #18：projectClass 落他人班级） | **403 / 1003** | `hack` 实训任务数 = 0 ✓ |
| 13 | stuC `PUT /student/assignments/asgA/draft` | **200**（A §3.4 P9a：草稿落库） | **403 / 1003 / 无权访问该作业** | 越权 submission 数 = 0 ✓ |
| 14 | stuC `POST /student/assignments/asgA/submit` | **200**（A §3.4 P9b：提交落库、attemptCount 0→1） | **403 / 1003 / 无权访问该作业** | 同上 ✓（不再进入 AI 批改队列） |
| 15 | stuC `POST /student/assignments/asgA/retry` | 无校验（A §2.1 #16，同批） | **403 / 1003 / 无权访问该作业** | 同上 ✓ |

探针原始结论行：

```
===== 零写入对拍（修复后 DB 状态） =====
  ✓ teamA.name 未改            ✓ teamA 成员仍为 [tA]        ✓ teamB 无班级被挂入
  ✓ clsA 未被挂进 teamB        ✓ HACK 班级未创建           ✓ HACK 团队未创建
  ✓ 越权学生未创建             ✓ stuC 仍在 clsB（未被夺班） ✓ stuC 未被移入 clsA
  ✓ qA.checkerScript 未变      ✓ qA.checkerStatus 未变(ready)
  ✓ hack 实训任务未创建        ✓ 越权 submission 未落库
PROBE VERDICT: ALL DENIED + ZERO WRITE ✅
cleanup leftover r6b_ users = 0
```

> 对拍说明：15 条请求全部由「改动前 200/生效」变为「改动后 403（教师端）/404（checker）/403（学生端）」；13 项零写入断言全绿 ⇒ 「拒绝 + 零写入」双判据同时成立。

### 3.4 改动面清单（`git status --porcelain -uno`，原始输出）

```
 M pipeline-status.md                                          ← Captain 的状态文件（非本轮产物）
 M server/src/application/use-cases/submission.use-cases.js
 M server/src/controllers/checkerController.js
 M server/src/controllers/projectController.js
 M server/src/controllers/teacherController.js
 M server/src/controllers/teamController.js
 M server/src/domain/ports/repositories.js
 M server/src/infrastructure/persistence/submission.repository.js
 M server/test/integration/ownership-guards.test.js
```

**零 client 改动、零 `.vue` 改动、零新增/删除文件**（⇒ 判据 5「无障碍」不受影响；像素风险 = 0）。

---

## 4 断言翻转说明（为什么这不是「改测试迁就实现」）

**被翻转的断言**（`ownership-guards.test.js` 原 S3，A §3.4 已登记）：

```js
// 翻转前（round 5 原文）
const draft = await api(tokenStuC).put('…/draft', {…});
expect(draft.body.code).toBe(0);   // saveDraft 自身不做班级校验（既有行为，登记为遗留）
expect(await prisma.submission.count({ where: { assignmentId: asgA.id, studentId: stuC.id } })).toBeGreaterThan(0);
```

**为什么必须翻转**：该断言把「未投放学生能写库」这一**漏洞行为**写成了**期望值**。修复后同一请求返回 403，若不翻转，测试必然红灯 —— A 已明确警告「不改它就会表现为 1 例假回归」。**假回归不是回归**：它描述的是测试在保护漏洞，而不是代码在退化。

**为什么翻转不是「迁就实现」**（四条判据）：

1. **方向是收紧而非放宽**：新断言 `403 + {code:1003, message:'无权访问该作业', data:null}` 比旧断言**更强**（旧断言只要求「不报错」，新断言额外要求「零写入」）。
2. **新增了旧断言没有的判据**：`submission` 行数**前后对拍**（`before = 0` → `after = 0`），并断言 `(assignmentId, studentId, questionId)` 三键零占用 —— 这正是 A §3.4 认定的抢答面/AI 计费面。
3. **保留了原用例的对抗性意图**：原用例要证明的是「归属校验不可被『有提交』绕过」。翻转后仍保留该断言（详情读取仍 403），并补齐了「提交本身也写不进去」这一更强的事实。
4. **有授权与上游依据**：Captain 任务书第四步明文授权「★必须修改 … S3 断言 … 请翻转为期望 403，并补 DB 零写入断言」，A §3.4 与 §5.4 亦把它列为 round 6 的唯一硬前置。

**同一文件其余 18 例（T1-T18）逐字未动**（`git diff` 中无 T 段改动），S1/S2/S4 亦未动。

---

## 5 新增用例数与覆盖（+26 例，全部在既有文件内）

| 组 | 用例 | 覆盖的修复项 | 判据 |
|---|---|---|---|
| updateTeam | R1-R4 | teamController `updateTeam` 守卫（A §3.3） | R1 403 + 团队三分快照 `toEqual`；R2/R3 合法路径 200；R4 404 形状不变 |
| updateClass.teamIds / createClass | R5-R8 | teacherController `updateClass`/`createClass`（A §3.2/§2.1 #24/#25） | R5 403 + `teamClass(teamB,clsA)`=0；R6 合法 200；R7/R8 403 + 班级/团队双零写入 |
| createTeam.schoolId | R9-R10 | teamController `createTeam`（A #48） | R9 403 + 团队零写入；R10 合法 200 + 响应形状 |
| updateStudent / addStudent / batch | R11-R14 | teacherController 三处 body.classId（A #52/#53/#54） | R11 403 + 学生快照（源班级未被清空）；R12/R13 403 + 用户零写入；R14 合法 200 + 学号格式 |
| checker ×3 | R15-R19 | checkerController 三端点（A #28-30） | R15/R16/R17 404 + checker 状态快照逐字段不变；R18/R19 本人 400（证明**未过度收紧**） |
| project classIds | R20-R22 | projectController `create`/`update`（A #18/#19） | R20 403 + project/projectClass 零写入；R21 合法 200（用例内自清 project*）；R22 更新路径 403 + 无改写 |
| 学生三条写入路径 | S3（翻转）、S5、S6、S7、S8 | submission.use-cases（A #14/#15/#16） | S3/S5/S6 403 + submission 零写入；S7 404 形状不变；S8 合法 200 |

**新增夹具**（自建自清，仍用 `to_` 前缀与 29941/29942 两校）：`teamB`（tB 的团队，tA 既非成员也非创建者）、`qChecker`（tA 的 `type=project` 题，带 `checkerScript/checkerStatus/checkerMeta`；**不触发 LLM** —— 越权 `generate` 在守卫处即 404）。
**新增辅助**：`snapTeam()`（团队行 + 成员 + 班级）、`snapChecker()`（题目 checker 三字段）。
**用例计数口径**：22 → **48**（+26），套件数不变（仍为 1 个套件）⇒ 全量预期 **68 套件 / 1033+26 = 1059 例**（C 复算时请对表）。

---

## 6 ★与执行集的偏离：`createAssignment` 的 `questionIds`/`classIds`（未落地，附实测证据）

**冲突对象**：`server/test/unit/assignment-q9-branches.test.js`（9 例）。它用 `jest.unstable_mockModule('../../src/utils/prisma.js')` 把 prisma 打成**部分替身** —— 只有 `question.findMany` 与 `assignment.create`，且**逐字断言查询形状**：

```js
jest.unstable_mockModule('../../src/utils/prisma.js', () => ({
  default: { question: { findMany: questionFindMany }, assignment: { create: assignmentCreate } },
}));
…
expect(questionFindMany).toHaveBeenCalledWith({ where: { id: { in: [OPEN_QID] }, deletedAt: null } });
```

**基线复跑（改动前）**：`Test Suites: 2 passed / Tests: 41 passed`（assignment-q9-branches 9 + submission.use-cases 32）。

**探针 1（只加 A 建议的 1 行：`:705` 的 where 追加 `teacherId: req.user.id`）** —— 原始输出：

```
● createAssignment — Q9 无标准工程包分支 › 题目查询过滤软删除（where.deletedAt === null）
    expect(jest.fn()).toHaveBeenCalledWith(...expected)
    - Expected  + Received
    @@ -4,7 +4,8 @@    "id": Object { "in": Array [ 987654321 ] },
    +     "teacherId": 7,
      },
    Number of calls: 1
      at Object.<anonymous> (test/unit/assignment-q9-branches.test.js:186:30)
Test Suites: 1 failed, 1 total
Tests:       1 failed, 8 passed, 9 total
```

**探针 2（只加 `classIds ⊆ getVisibleClassIds` 守卫）** —— 原始输出（节选）：

```
  ● … › 存在已删除/不存在的题目 → 400/1001，不进入警告分支
    Expected: 400   Received: 500            ← 替身无 teacherClass/teamTeacher ⇒ TypeError
  ● … › 题目查询过滤软删除（where.deletedAt === null）
    Number of calls: 0                       ← 守卫先抛错，查询根本没发生
Test Suites: 1 failed, 1 total
Tests:       8 failed, 1 passed, 9 total
```

⇒ **任何正确实现（where 加键 / 新模型查询 / 独立 findMany 复查）都会让这 9 例变红**。A §5.1 的「既有合法路径用例直接护栏」只覆盖了 integration 层（assignment.test.js 8 例等），**漏掉了这个带部分 prisma 替身的单测**。
按任务书「既有套件因你的改动而失败 → 停下回报，不要改测试迁就实现」+「第六步唯一允许写入的文件」不含该单测 ⇒ 本轮**不落地**该项，探针已回滚（`assignment-q9-branches` 复跑 **9/9 绿**，见 §3.2 ④）。

**已即时上报 Captain 的三选一建议**：
① **授权 B 同批修该单测的替身**（仅补 `teacherClass/teamTeacher` 桩 + 把 `toHaveBeenCalledWith` 的期望补上 `teacherId`）—— 这是**非弱化**改动，保留全部既有断言语义；
② 转 **Agent C** 在下一轮处理；
③ 接受该组缺口（**不推荐**：见 §8 遗留风险 R-1，攻击者仍可用「他人题目 + 他人班级」建作业）。

---

## 7 未做项（逐条给依据，避免"遗漏"与"刻意不做"混淆）

| # | 项 | 原因 |
|---|---|---|
| 1 | `createAssignment` 的 `questionIds`（A #38）与 `classIds`（A #38） | **§6 的硬冲突**（既有单测的部分替身）；已上报 Captain 待裁决 |
| 2 | `getChecker`（GET，读端点）的归属收窄 | A 的执行集只含 **3 个写端点**（confirm/rollback/generate）；读侧同类缺口属**新增发现**，改它需先确认「团队共管读」语义（本仓 `teacherController:265` 的口径是 owner-only，但读端点影响面更大）⇒ 登记待拍板，不擅自扩大 |
| 3 | `updateTeam` 的成员互改名单治理（R6-P10） | 产品语义拍板项；本轮**只堵「非成员」**（遵任务书） |
| 4 | 团队可见性是否应授予写权限（R6-P9） | 产品语义拍板项；A 已证明「可被利用的第一环」已由 #2/#1 堵死 |
| 5 | `adminController` 10 个写端点的学校维度作用域 | super_admin = 全局角色（A §6.8 判「不适用」） |
| 6 | checker 的 `deletedAt: null` 对齐（A #3 可选项） | 会把「软删自己的题」由可操作变 404 = 有意行为变更；本轮取最小面 |
| 7 | GodFile 10 个 / M-1b / N-1 / N-2 / P7 / P8 | 已确认不可达或需拍板（A §6，任务书明令不列入执行集） |

---

## 8 遗留风险

| # | 风险 | 等级 | 说明 / 依据 |
|---|---|---|---|
| **R-1** | **`createAssignment` 的 body.classIds / questionIds 仍敞开**（§6） | **高** | 攻击者仍可：用**他人的题** + **他人的班**建作业（A #38 实测 200）。缓解：目标班级的**学生可见面**受班级制约束，但题面/评分标准会下发给非本方学生 ⇒ 属跨租户内容泄漏面。**这是本轮唯一未闭合的"需修"项** |
| R-2 | `getChecker`（读）仍可读他人题目的 checker 状态 | 低-中 | 只读、无写入、不含题干（仅 status/meta）；A 的普查口径为写端点故未列入 |
| R-3 | `addStudent`/`batchAddStudents` 的 `400 '班级不存在'` 在 403 之前 ⇒ 「班级是否存在」低价值预言机 | 低 | 与 round 5 `updateStudent` 的 `404 → 403` 次序**刻意保持一致**（任务书：零新响应形状）；id 本身不属受保护资源 |
| R-4 | `checkerController` 未过滤 `deletedAt` | 低 | 软删自己的题仍可 confirm/rollback/generate；与 A 的「可选」项一致，登记为有意最小面 |
| R-5 | `projectController` **内联复制**了可见集查询逻辑 | 低（可维护性） | 为守住 `cycle-check` 164 边不变量；两处逻辑必须同步演进 —— 建议后续以 `utils/classScope.js`（不新增 file→ 不增边）收敛 |
| R-6 | `_loadOwnedAssignment` 在**拒绝路径**多 1 次查询 | 低（性能） | 命中路径仍 1 次；拒绝路径本就是异常路径，未做基准（本仓无该装置） |
| R-7 | `updateTeam` 仍允许成员互改名单 | 低 | = R6-P10 待拍板；A 已证「非成员」这一确定越权面已堵 |
| R-8 | 「团队班级并入写作用域」语义未变 | 中（需拍板） | = R6-P9；本轮**未**触碰（越权链第一环已断） |

---

## 9 给 Agent C 的验证指引

**① 全量回归（口径对表）**

```bash
ROUND=06 bash docs/pipeline/scripts/unblock-g2.sh     # 只连 exam_system_test，护栏强制
```

- **预期：`0 failed / 1059 passed / 68 套件`**（round 5 基线 1033/68 ⇒ 本轮 **+26 例**、套件数**不变**）。
  四段口径：段1 = 912+26 = **938**、段2 `fact-extractor` 17、段3 `rule-executor` 61、段4 `rule-mutator` 21（**四段摘要都要看到**，`&&` 串联会短路）。
- 重点复跑的 5 个套件（本轮的直接风险面）：
  `ownership-guards`（48）· `assignment-q9-branches`（9，**必须仍绿**）· `application/submission.use-cases`（32）· `infrastructure/persistence-repositories`（12）· `submit`/`student`/`student-v2`/`assignment`（合法路径护栏）。

**② 门禁复算（4 条，判据与 round 5 完全一致）**

```bash
node scripts/gates/cycle-check.mjs        # 期望：71 文件 / 164 边 / SCC 0     ← 边数若 ≠164 即为回归
node server/scripts/check-layers.mjs      # 期望：71 文件 / 违规 0 / 未分层 47
node scripts/gates/arch-metrics.mjs       # 期望：0 / 47 / 10（GodFile 不得变 11）
node scripts/gates/hard-metrics.mjs       # 期望：hex 0 / !important 0 / Modal.confirm 0
node scripts/gates/bind-check.mjs         # 期望：0 违规（新增 getMyTeamIds 导出与 repository 方法）
find server/src client/src -type f | wc -l                 # 期望：146（不增文件）
wc -l < server/src/controllers/studentController.js        # 期望：799（GodFile 门禁）
```

**③ 独立复现（建议用 `r7_` 前缀另建夹具，不要复用我的 `to_`/`r6b_` 夹具）**

- 攻击面矩阵（15 条）见 §3.3 表格；判据 = **HTTP 403/404 + 响应体逐字（`{code:1003,message:'无权操作',data:null}` / checker 的 404 / 学生的 `'无权访问该作业'`）+ 拒绝后 DB 零写入**（团队/班级/学生/checker/submission/project 六类快照对拍）。
- **必须显式 `PORT=0`**（纪律 14；`server/src/app.js:152` 模块加载即 listen）；探针收尾 `process.exit(0)`，夹具全量清理。
- **负向（突变）验证（可选但推荐）**：临时注释掉任一守卫，确认对应 R 例**恰好**变红（反之亦然）—— 用于证明用例真的有判别力（round 3 的对抗性口径）。

**④ 明确请 C 判定的三点**

1. `assignment-q9-branches` 是否仍 9/9 绿（若红 ⇒ 说明有人把 §6 的两项硬塞进来了，请按 §6 的冲突链回流）。
2. 全量例数是否精确落在 **1059/68**（若不等，先查是不是有人改了 `ownership-guards` 的 `it` 数）。
3. §8 的 **R-1（createAssignment 缺口）** 是否被 Captain 裁定为「本轮接受」；若否，需按 §6 选项 ① 先解除单测替身阻塞。

---

## 10 一句话结论

> **15 条越权请求全部由「改动前 200/生效」变为「改动后 403（教师端）/404（checker）/403（学生端）」，13 项零写入断言全绿**；8 组修复（`updateTeam` 完整越权链 · `createTeam.schoolId` · `createClass` 双守卫 · `updateClass.teamIds`（C 的 403→200 第一环）· `updateStudent.body.classId` · `addStudent`/`batchAddStudents` · checker×3 · project×2 · 学生提交×3）**全部落地**，`studentController.js` **0 行改动（799 行）**。
> **门禁零增量**：cycle **164 边** · layers **71/0/47** · arch **0/47/10** · hard **0/0/0** · 文件 **146** · 定向单测 **29 套件 345 例 0 failed**；授权测试文件 **48/48**（S3 断言已翻转 + 26 条新例）。
> **唯一未闭合项**：`createAssignment` 的 `questionIds`/`classIds` —— 被既有单测 `assignment-q9-branches.test.js` 的**部分 prisma 替身**硬阻塞（两次探针原始输出见 §6），已上报 Captain 三选一裁决。
