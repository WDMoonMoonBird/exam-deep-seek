# refactor-round-07 —— C6-1 阻断修复（updateTeam 内容校验）+ R-1 收口（createAssignment 归属）

| 项 | 值 |
|---|---|
| 轮次 | **round 7 / 8**（Agent B · 定点修复 · **round 6 回流**） |
| 日期 | 2026-10-11 |
| 基线 commit | **`50dbc66`**（round 6 WIP 已提交；`git log --oneline -1` 实测） |
| 技能 | `tech-code-refactoring` |
| 上游输入 | `test-round-06.md`（V3 阻断 C6-1 · §4.3 最小修法契约）｜`audit-round-06.md`（57/57 普查 · #38 = R-1）｜`refactor-round-06.md` §6｜`project-constraints.md`（**17 条**）｜`pipeline-status.md` |
| 授权边界 | 任务书第三步：teamController.js（+ teacherController.js 的 createAssignment）｜`ownership-guards.test.js` 新增用例｜`assignment-q9-branches.test.js` **仅「补桩 + 加键」**｜本报告 |
| 口径声明 | 行号/计数**全部本轮实测**（纪律 10）；探针 `PORT=0`（纪律 14）、库 `exam_system_test`、夹具 `r7_` 自建自清 |

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 不新增任何文件 | ✅ `find server/src client/src -type f | wc -l` = **146 不变**；探针落在 `/tmp`（仓库外），未落仓库内临时文件 |
| `studentController.js` **0 行改动** | ✅ `wc -l` = **799**；`git diff --stat` **空** |
| 不改 `client/`、`.md`（除本报告）、`client/dist`、`tests/` | ✅ `git status --porcelain -uno` 仅 4 个源/测试文件 + `pipeline-status.md`（Captain 的状态文件） |
| 零 git 写操作 | ✅ 只用 `log/status/diff --stat/--numstat/diff`；禁用的 clean/stash/checkout/reset/restore 一律未用 |
| 不跑全量回归 / 不 build / 不启常驻服务 / 不联网 | ✅ 只跑定向 jest（本轮共 4 组定向批次）+ 1 个自建探针（3 次运行：修复后 / 变异后 / 复原后）；未触发任何 LLM 路径 |
| 探针 `PORT=0`（纪律 14） | ✅ 探针首行 `process.env.PORT='0'`；日志实打印 `PORT = "0"`；**未占用 :5173 / :3000**；收尾 `process.exit(0)` |
| 只写测试库且事后清理 | ✅ 探针内 `SELECT DATABASE()` = **exam_system_test**（非白名单即 exit 3）；`cleanup leftover r7_ users = 0 schools = 0 teams = 0 classes = 0` |
| 既有套件失败即停下回报 | ✅ 无「未授权」失败：全部改动引发的红灯均落在**任务书已授权**的 `assignment-q9-branches.test.js` 与自建新用例内（详见 §3.2、§6） |
| 每轮 ≤ 8 源文件 | ✅ 源 **2** 文件 |
| 任务 2 的测试改动边界 | ✅ 只有「补桩 + 加键」；**无删除/无放宽/无 objectContaining/无 expect.any**（完整 diff 见 §3） |

---

## 1 改动文件清单（`git diff --numstat` 实测）

```
7	1	server/src/controllers/teacherController.js      （+7 / −1）
12	0	server/src/controllers/teamController.js         （+12 / −0）
224	0	server/test/integration/ownership-guards.test.js （+224 / −0，纯新增 14 例）
39	11	server/test/unit/assignment-q9-branches.test.js  （+39 / −11）
```

| # | 文件 | 改了什么 | 对应 |
|---|---|---|---|
| 1 | `server/src/controllers/teamController.js` | `updateTeam` 新增 **classIds 内容校验**（`classIds ⊆ getVisibleClassIds(req.user.id, getSchoolId(req))`），**前置到全部写库动作之前** | **C6-1（阻断）** |
| 2 | `server/src/controllers/teacherController.js` | ① `createAssignment` 新增 **classIds 可见集校验**（403/1003，前置）；② `question.findMany` 的 where **追加 `teacherId: req.user.id`**（复用既有 400/1001） | **R-1（A #38）** |
| 3 | `server/test/integration/ownership-guards.test.js` | 新增 **14 例**（R23-R36）：updateTeam 内容校验 7 例 + createAssignment 归属 7 例 | 任务 3 |
| 4 | `server/test/unit/assignment-q9-branches.test.js` | **仅补桩（4 处）+ 加键（1 处断言）** | 任务 2 边界 |

---

## 2 两项修复：契约与前置位置

### 2.1 ★C6-1（阻断）：`updateTeam` 的 `classIds` 零内容校验

**修法**（`teamController.js:94-107`，本轮实测行号）：

```js
    const { name, teacherIds, classIds } = req.body;
    // 内容校验（round 7 · 阻断 C6-1）……
    if (classIds?.length) {
      const visibleIds = await getVisibleClassIds(req.user.id, getSchoolId(req));
      if (!classIds.every(cid => visibleIds.includes(+cid))) {
        return res.status(403).json({ code: 1003, message: '无权操作', data: null });
      }
    }
    if (name !== undefined) { await prisma.team.update(...); }      // ← 写库段从这里才开始
```

**四个契约要点**

| 要点 | 取值 | 依据 |
|---|---|---|
| 判据 | `classIds ⊆ getVisibleClassIds(req.user.id, getSchoolId(req))`（直连 ∪ 团队） | C §4.3 最小修法契约；与 `teacherController.canTeacherManageClasses` 同源同形 |
| **前置位置** | **成员/创建者判定之后 → 整个写库段（`team.update` / `teamTeacher.deleteMany` / `teamClass.deleteMany`）之前** | **这是本轮的关键**：修复前 `team.update({name})` 在 `:95-97`，若守卫放在末尾，越权请求会「先改名成功再 403」＝部分写入。实测 R24/R25 断言 `name` 未被改写 |
| 空数组语义 | `classIds = []` ⇒ 放行（=「清空团队班级关联」，**只减不增**，不引入他人资源） | 与 `canTeacherManageClasses` 的 `if (!classIds?.length) return true` 一致；C 的 L15 实测语义 |
| 响应契约 | `403 + { code: 1003, message: '无权操作', data: null }` | 与 round 5/6 全量教师端守卫逐字一致（同文件 `deleteTeam:123` / `lockAssignment`） |

**为什么它不是「过度收紧」**（三条，与 C 的判据一致）：① 前端 `TeamEdit.vue` 的候选班级来自 `GET /teacher/classes`（本人可见集）⇒ 合法流程恒满足；② 与 `updateClass.teamIds` 的既有守卫**完全对称**（round 6 已落地）——本轮补的是同一契约缺失的另一半；③ 成员/创建者能否改名单**未动**（R6-P10 拍板项），实测 R23/R27 证明成员合法路径仍 200。

### 2.2 R-1：`createAssignment` 的 `questionIds` / `classIds`

| 目标 | 修法 | 契约 | 为什么零新响应形状 |
|---|---|---|---|
| `questionIds`（A §5.1 #2 ④） | `prisma.question.findMany({ where: { id: { in: questionIds }, deletedAt: null, **teacherId: req.user.id** } })` | 归属过滤后 `questions.length !== questionIds.length` ⇒ 落**既有** `400 + { code: 1001, message: '部分题目不存在或已删除，无法布置' }` | 复用既有分支 ⇒ **零新错误码、零存在性预言机**（他人题目与不存在题目同形） |
| `classIds`（A §5.1 #2 ③） | `if (!(await canTeacherManageClasses(req.user.id, classIds, getSchoolId(req)))) return 403/1003`，置于**参数校验之后、任何查库/写库之前** | `403 + { code: 1003, message: '无权操作', data: null }` | 与同文件其余 body 目标守卫（`createClass`/`updateProject`…）逐字一致 |

**跨文件 import 边**：**未新增**。`teacherController.js:9` 早已 `import { getVisibleClassIds, getTeamTeacherIds, getMyTeamIds } from './teamController.js'`，本轮只**复用既有 import**（`canTeacherManageClasses` 是同文件 :47 的既有函数）⇒ `cycle-check` 边数 **164 不变**（实测）。

**顺带说明（诚实记录）**：`classIds` 守卫放在 `:727`、`questionIds` 过滤在 `:739` ⇒ 两个守卫**各自独立生效**（R35 证明「本人题目 + 他人班级」仍 403；R33 证明「他人题目 + 本人班级」仍 400）。**未**把二者合并到第一次查库之后——那会让「班级越权」先触发一次 note 查询，不利于零写入取证。

---

## 3 被修改的既有测试文件：完整 diff + 逐条「为何未弱化」

### 3.1 `server/test/unit/assignment-q9-branches.test.js`（**任务 2 唯一授权文件**）

**完整 diff**（`git diff -- server/test/unit/assignment-q9-branches.test.js` 原文）：

```diff
diff --git a/server/test/unit/assignment-q9-branches.test.js b/server/test/unit/assignment-q9-branches.test.js
index d3a69d4..eae30c9 100644
--- a/server/test/unit/assignment-q9-branches.test.js
+++ b/server/test/unit/assignment-q9-branches.test.js
@@ -19,10 +19,21 @@ import { standardDir } from '../../src/utils/projectPaths.js';
 const questionFindMany = jest.fn();
 const assignmentCreate = jest.fn();
 
+// round 7：createAssignment 的 classIds 归属守卫（classIds ⊆ getVisibleClassIds）会经
+// teamController.getVisibleClassIds 查询 teacherClass / teamTeacher / teamClass 三个模型。
+// 本套件原先是「部分替身」（只桩 question/assignment）⇒ 必须补齐这三个桩，
+// 否则缺失模型会抛 TypeError（探针实测 8 failed/9）。
+const teacherClassFindMany = jest.fn();
+const teamTeacherFindMany = jest.fn();
+const teamClassFindMany = jest.fn();
+
 jest.unstable_mockModule('../../src/utils/prisma.js', () => ({
   default: {
     question: { findMany: questionFindMany },
     assignment: { create: assignmentCreate },
+    teacherClass: { findMany: teacherClassFindMany },
+    teamTeacher: { findMany: teamTeacherFindMany },
+    teamClass: { findMany: teamClassFindMany },
   },
 }));
 
@@ -36,6 +47,15 @@ const STD_QID = 987654322;
 /** 非 project 题型 */
 const CODE_QID = 987654323;
 
+/**
+ * 请求替身：补 `query` 桩。
+ *
+ * createAssignment 在入口用 getSchoolId(req)（= req.query.schoolId）做班级可见集的学校过滤；
+ * 原套件只构造了 { body, user } ⇒ req.query 为 undefined。这是**替身缺件**（与 prisma 部分替身同源），
+ * 不是期望值放宽：query 为空对象 ⇒ getSchoolId 返回 null ⇒ 学校过滤维度不启用（与改动前行为一致）。
+ */
+const mockReq = (body, userId, query = {}) => ({ body, user: { id: userId }, query });
+
 function mockRes() {
   const res = {
     statusCode: 200,
@@ -64,7 +84,15 @@ const rowsFor = (ids, rows) => rows.filter(r => ids.includes(r.id));
 beforeEach(() => {
   questionFindMany.mockReset();
   assignmentCreate.mockReset();
+  teacherClassFindMany.mockReset();
+  teamTeacherFindMany.mockReset();
+  teamClassFindMany.mockReset();
   assignmentCreate.mockImplementation(async ({ data }) => ({ id: 4242, ...data }));
+  // 可见集桩：教师 7 直连 classId=1（= baseBody 的 classIds[0]）、不属任何团队。
+  // 与下方「teacherId: 7」一致 —— 用例显式声明「这些题目与班级都属于发起教师」。
+  teacherClassFindMany.mockImplementation(async () => [{ classId: 1 }]);
+  teamTeacherFindMany.mockImplementation(async () => []);
+  teamClassFindMany.mockImplementation(async () => []);
   expect(fs.existsSync(standardDir(OPEN_QID))).toBe(false);
   expect(fs.existsSync(standardDir(STD_QID))).toBe(false);
 });
@@ -73,7 +101,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
   it('无包 + 未确认 → 400 + code=1007 软警告，且不创建作业', async () => {
     questionFindMany.mockImplementation(async ({ where }) => rowsFor(where.id.in, [openRow]));
     const res = mockRes();
-    await createAssignment({ body: baseBody([OPEN_QID]), user: { id: 7 } }, res);
+    await createAssignment(mockReq(baseBody([OPEN_QID]), 7), res);
@@ -95,7 +123,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const body = { ...baseBody([OPEN_QID]), confirmWithoutStandardPackage: true };
-    await createAssignment({ body, user: { id: 7 } }, res);
+    await createAssignment(mockReq(body, 7), res);
@@ -115,7 +143,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
       if (v !== undefined) body.confirmWithoutStandardPackage = v;
-      await createAssignment({ body, user: { id: 7 } }, res);
+      await createAssignment(mockReq(body, 7), res);
@@ -125,7 +153,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const res = mockRes();
-    await createAssignment({ body: baseBody([STD_QID]), user: { id: 7 } }, res);
+    await createAssignment(mockReq(baseBody([STD_QID]), 7), res);
@@ -136,7 +164,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const res = mockRes();
-    await createAssignment({ body: baseBody([CODE_QID]), user: { id: 7 } }, res);
+    await createAssignment(mockReq(baseBody([CODE_QID]), 7), res);
@@ -145,7 +173,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const res = mockRes();
-    await createAssignment({ body: baseBody([STD_QID, OPEN_QID]), user: { id: 7 } }, res);
+    await createAssignment(mockReq(baseBody([STD_QID, OPEN_QID]), 7), res);
@@ -155,7 +183,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const res2 = mockRes();
-    await createAssignment({ body: { ...baseBody([STD_QID, OPEN_QID]), confirmWithoutStandardPackage: true }, user: { id: 7 } }, res2);
+    await createAssignment(mockReq({ ...baseBody([STD_QID, OPEN_QID]), confirmWithoutStandardPackage: true }, 7), res2);
@@ -163,7 +191,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const res = mockRes();
-    await createAssignment({ body: { questionIds: [], classIds: [] }, user: { id: 7 } }, res);
+    await createAssignment(mockReq({ questionIds: [], classIds: [] }, 7), res);
@@ -173,7 +201,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const res = mockRes();
-    await createAssignment({ body: baseBody([OPEN_QID, 999999999]), user: { id: 7 } }, res);
+    await createAssignment(mockReq(baseBody([OPEN_QID, 999999999]), 7), res);
@@ -182,7 +210,7 @@ describe('createAssignment — Q9 无标准工程包分支', () => {
     const res = mockRes();
-    await createAssignment({ body: { ...baseBody([OPEN_QID]), confirmWithoutStandardPackage: true }, user: { id: 7 } }, res);
-    expect(questionFindMany).toHaveBeenCalledWith({ where: { id: { in: [OPEN_QID] }, deletedAt: null } });
+    await createAssignment(mockReq({ ...baseBody([OPEN_QID]), confirmWithoutStandardPackage: true }, 7), res);
+    expect(questionFindMany).toHaveBeenCalledWith({ where: { id: { in: [OPEN_QID] }, deletedAt: null, teacherId: 7 } });
   });
 });
```

**逐条说明：三类改动、零弱化**

| 类别 | 位置 | 内容 | 为何**不是**弱化 |
|---|---|---|---|
| **(a) 补模型桩**（授权范围） | `:22-35`（mockModule）+ `:87-95`（beforeEach） | 新增 `teacherClass/teamTeacher/teamClass` 三个 `findMany` 桩；默认返回 `teacherClass=[{classId:1}]`（= `baseBody` 的 classIds[0]）、`teamTeacher=[]`、`teamClass=[]` | 这三者正是新守卫**必需**的替身缺件（原套件是「部分替身」＝纪律 16 的成因）。桩数据与用例既有事实**一致**（教师 7、classId 1），未改变任何既有断言的期望值 |
| **(b) 补请求桩** `query`（同类补桩） | `:50-57` 新增 `mockReq` 帮助函数；10 处调用点改写为 `mockReq(body, 7)` | 旧代码 `{ body, user }` 缺 `req.query` ⇒ 新守卫的 `getSchoolId(req)` 抛 `TypeError`（实测 8/9 变红） | 仅补上 `query: {}` 一个字段；`body`/`user.id` 的取值与改写前**逐字相同**。`query:{}` ⇒ `schoolId = null` ⇒ 学校维度不启用 = **改动前的行为**（不是把断言调宽）。**未**改用例语义、**未**删用例、**未**改夹具装配方式（仍是内联 `{body,user}` 对象，只是多了一个字段） |
| **(c) 既有期望里加键**（明确授权） | `:214` | `toHaveBeenCalledWith({ where: { id: {...}, deletedAt: null, **teacherId: 7** } })` | **断言更强**：由「只断言 where 的 2 个键」变为「断言 3 个键」；原键 `id`/`deletedAt` 逐字保留 ⇒ **仍是对完整 where 子句的断言**，无子集化 |

**弱化写法扫描（全文件，实测）**：

```
$ grep -c "objectContaining\|expect.any\|expect.anything\|toMatchObject\|toBeTruthy\|toBeDefined" \
    server/test/unit/assignment-q9-branches.test.js
0
$ grep -c "not.toHaveBeenCalled\|toHaveBeenCalledTimes" server/test/unit/assignment-q9-branches.test.js
5        ← 「未确认 → 绝不落库」「参数缺失不查库不落库」等负向断言逐字未动
$ git diff --numstat -- server/test/unit/assignment-q9-branches.test.js
39	11      ← 11 处删除 == 10 处调用点改写 + 1 处断言加键（**无一条断言行被删**）
```

**用例数与判别力**：**仍 9 例、9/9 绿**；且**断言更强**——变异测试（§5.4）证明：移除 `teacherId` 后该套件**恰好 1 例变红**（`where.deletedAt === null`），其余 8 例仍绿 ⇒ 该断言真的在守新增的安全过滤条件。

### 3.2 `server/test/integration/ownership-guards.test.js`

**diff 全部为「+」行（`+224 / −0`）——即纯新增，无任何既有断言行被触及。** 逐项：

| 维度 | 结论 |
|---|---|
| 既有 48 例是否被改 | ❌ 未改。`git diff` 中 `@@ -619,6 +619,230 @@` 是**唯一 hunk**，且它是纯插入（插入点位于 §1c 的 R22 与 §2 S-6 之间）；T1-T18 / R1-R22 / S1-S8 **逐字未动** |
| 是否有删除/放宽 | ❌ 无。`git diff --numstat` = `224	0`（**0 删除**）；`objectContaining`/`expect.any`/`toMatchObject` 在本轮新增的 224 行内 = **0** |
| 用例数 | 48 → **62**（+14），`grep -c "  it("` = 62（本轮实测） |
| 新增断言强度 | 每条越权用例都是 **状态码 + 整 body `toEqual` + DB 快照 `toEqual`/count**；混合数组用例额外断言「本人班级也未被写入」＝整体拒绝 |

---

## 4 自证证据

### 4.1 五门禁 + 三个不变量（全部本轮复跑，原始输出）

```
$ node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 164 条相对导入边            ← ★ 164 边不变
  强连通分量（|SCC|>1）: 0（基线 1） ｜ 自环: 0
结论：PASS

$ node server/scripts/check-layers.mjs
文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个     ← ★ 71/0/47 不变

$ node scripts/gates/arch-metrics.mjs
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47  实测=47
  ✓ godfileOver800     基线=10  实测=10                  ← ★ 未变 11
  · >500 行（观察带）    基线=19 实测=19
  GodFile >800 行：… teacherController.js (1338) …        ← 仍在基线 10 个之内（判据=个数）
结论：PASS

$ node scripts/gates/hard-metrics.mjs
  ✓ hex6 0/0 ｜ ✓ important 0/0 ｜ ✓ modalConfirm 0/0
结论：PASS

$ node scripts/gates/bind-check.mjs --self-test
SELF-TEST PASSED: 3/3 合成坏绑定被检出，合法绑定零误报
$ node scripts/gates/bind-check.mjs
modules scanned: 169 ｜ named import bindings checked: 512 ｜ BINDING VIOLATIONS: 0
（4 条 unresolved / 1 条 external 仅登记，均为既有）

$ find server/src client/src -type f | wc -l        → 146      ← ★ 146 不变
$ wc -l < server/src/controllers/studentController.js → 799     ← ★ 0 行改动（git diff --stat 空）
```

### 4.2 定向单测（任务书要求的三类套件，全绿）

```
# ① 授权测试文件 + 与 R-1 冲突的那个单测
PASS test/integration/ownership-guards.test.js     Tests: 62 passed（48 既有 + 14 新）
PASS test/unit/assignment-q9-branches.test.js      Tests:  9 passed   ← ★ 仍 9/9
# ② 合法路径护栏（本次改动的直接风险面）
PASS test/integration/assignment.test.js
PASS test/integration/open-project-flow.test.js
PASS test/integration/submit.test.js
PASS test/integration/student-v2.test.js
PASS test/integration/t2-teacher-scope.test.js
PASS test/integration/t5-t4-idor-review.test.js
PASS test/integration/t7-t6-classid-review.test.js
PASS test/integration/r2-fixes.test.js
PASS test/integration/compose.test.js
PASS test/integration/admin-teacher-delete.test.js
PASS test/integration/auth.test.js
PASS test/integration/repositories.test.js
PASS test/integration/project-context.test.js
PASS test/unit/infrastructure/persistence-repositories.test.js
PASS test/unit/application/submission.use-cases.test.js
PASS test/unit/infrastructure/checker-service.test.js
PASS test/unit/infrastructure/project-context-builder.test.js
PASS test/unit/open-project-prompt.test.js
…
批1：Test Suites: 13 passed, 13 total ｜ Tests: 205 passed, 205 total
批2：Test Suites: 18 passed, 18 total ｜ Tests: 241 passed, 241 total
合计（去重后）28 套件 / 0 failed（其中 ownership-guards 与 assignment-q9 在 §4.1 另跑一次均绿）
```

**无任何「未授权」的既有套件失败** ⇒ 无需停下回报。唯一两处红灯出现在**任务书已授权**的场景内：
① `assignment-q9-branches`（授权文件，已按「补桩+加键」修复，见 §3.1）；
② 我自己新写的用例有 2 处**初始夹具假设错误**（`clsA` 已被既有 T13 改名为 `to_class_a_renamed`；`qChecker` 是 `type=project` 题会落 Q9 的 400/1007 分支）——已改为「不写死名字 + 用 `qS6`（type=code）」，属**新用例自身的修正**，与实现无关。

### 4.3 改动面清单（`git status --porcelain -uno` 原始输出）

```
 M pipeline-status.md                                       ← Captain 的状态文件（非本轮产物）
 M server/src/controllers/teacherController.js
 M server/src/controllers/teamController.js
 M server/test/integration/ownership-guards.test.js
 M server/test/unit/assignment-q9-branches.test.js
```

**零 client 改动、零新增/删除跟踪文件**；探针落 `/tmp/r7b-probe.mjs`（仓库外）⇒ `146` 文件数不变。

---

## 5 越权前后对拍（★含 C6-1 链的「斩断」证明）

### 5.1 装置与纪律

- 脚本：**`/tmp/r7b-probe.mjs`**（仓库外，不入库）；命令 `cd server && DATABASE_URL="<只换库名>" PORT=0 node /tmp/r7b-probe.mjs`
- `process.env.PORT='0'` 显式设置，日志实打印 `PORT = "0"`；`DATABASE = exam_system_test`（内建白名单，否则 exit 3）
- 夹具**完全自建**（前缀 `r7_`：2 校 / 3 教师（tB 双校）/ 3 班 / 1 团队（tA 创建 + tC 成员）/ 1 生 / 2 题），**未复用 A/C 的 `to_`/`c6_` 夹具**
- 零写入判据 = **请求前后字段级快照**（team.name / clsA.name / stuA.password 的 bcrypt 哈希 / 越权学生 count / `teamClass(team,clsA)` count / assignment count）
- 收尾：`cleanup leftover r7_ users = 0 schools = 0 teams = 0 classes = 0` ✅

### 5.2 对拍表（同一个探针脚本跑三次：修复后 / 变异后 / 复原后）

| # | 请求（夹具：tC 是 team 成员、clsA 属 tA、clsHidden 属 tC、stuA ∈ clsA、qA 属 tA、qB 属 tB） | **改动前**（变异后实测＝复现 C 的 BY 链） | **改动后**（本轮交付） | 改动后零写入证据 |
|---|---|---|---|---|
| BY1 | `PUT /teacher/teams/<team> {name:HACK, classIds:[clsA]}` | **200 code=0「更新成功」+ `teamClass(team,clsA)` 落库 count=1** | **403 / 1003 / 无权操作** | `team.name` 未改 `"r7_team"→"r7_team"`；`teamClass` count = **0** |
| BY2 | 随后 `PUT /teacher/classes/<clsA> {name:HACK_CLS}` | **200 code=0** | **403 / 1003** | `clsA.name` `"r7_cls_a"→"r7_cls_a"` |
| BY3 | 随后 `PUT /teacher/students/<stuA>/reset-password`（账号接管） | **200 code=0「密码已重置为学号（r7_sta）」** | **403 / 1003** | `stuA.password` bcrypt 哈希**逐字节未变** |
| BY5 | 随后 `POST /teacher/students {classId:clsA}`（越权建学生） | **200 code=0「新增成功」** | **403 / 1003** | 越权学生 count `0→0` |
| BY4b | `PUT /teacher/teams/<team> {classIds:[clsHidden, clsA]}`（混合） | **200 code=0** | **403 / 1003** | `teamClass(team,clsA)` = **0**（**整体拒绝，无部分成功**） |
| R30 | `POST /teacher/assignments {questionIds:[qA], classIds:[clsHidden]}` | **200 code=0「创建成功」** | **403 / 1003 / 无权操作** | HACK 标题 assignment count = **0** |
| R33 | `POST /teacher/assignments {questionIds:[qB], classIds:[clsA]}`（他人题） | **200 code=0「创建成功」** | **400 / 1001 / 部分题目不存在或已删除，无法布置** | HACK 标题 assignment count = **0** |
| R36 | `POST /teacher/assignments {questionIds:[qA], classIds:[clsA]}`（合法） | 200 | **200 / code=0「创建成功」** | assignment count = **1**（**未误伤**） |
| L1 | `PUT /teacher/teams/<team> {classIds:[clsHidden]}`（成员挂本人班级） | 200 | **200 / code=0「更新成功」** | — |
| L2 | `PUT /teacher/teams/<team> {classIds:[]}`（清空） | 200 | **200 / code=0「更新成功」** | — |
| L3 | `PUT /teacher/teams/<team> {classIds:[clsA]}`（同一入口挂他人班级） | 200 | **403 / 1003** | `teamClass(team,clsA)` = 0 |

**探针原始结论行**：

```
PRECHECK teamClass(team, clsA) 无关联 = true (= true 表示越权链第一环当前不存在)
PRECHECK tC 可见集 = [6390] | contains clsA = false      ← 修复后 tC 的可见集不含 clsA（链的放大面不存在）
PROBE VERDICT: ALL DENIED + ZERO WRITE ✅（C6-1 链已斩断 / R-1 已收口）
cleanup leftover r7_ users = 0 schools = 0 teams = 0 classes = 0
```
（变异后同一脚本的结论行：`PROBE VERDICT: FAIL ❌` + 5 项 `FAIL` 零写入对拍 —— 见 §5.4）

### 5.3 「斩断」的因果说明（为什么 BY1 被拒就等于整条链消失）

C 的链条是：**① 挂班（写 `teamClass`）→ ② `getVisibleClassIds` = 直连 ∪ 团队班级 ⇒ 他人班级进入攻击者可见集 → ③ round-5/6 的全部写守卫对该班级一律放行**。
本轮在 **①** 处斩断（**唯一的输入源**，攻击者无法通过其他端点写 `teamClass`——`updateClass.teamIds` 早在 round 6 已被 `canTeacherManageTeams` 收口）：探针 `PRECHECK tC 可见集 = [clsHidden]` 且不含 clsA，**②的输入恒为空集**；BY2/BY3/BY5 因此各自独立 403（三层纵深，不只靠第一环）。

### 5.4 ★变异（负向）验证 —— 证明用例真的有判别力，且红灯位置精确

临时把两处守卫与一处 where 改回改动前形态（`if (false && …)` / 去掉 `teacherId`），**同一探针 + 同一 jest**：

```
--- 探针（改动前形态）---
BY1 http=200 code=0 「更新成功」   BY2 http=200 code=0   BY3 http=200 code=0「密码已重置为学号（r7_sta）」
BY5 http=200 code=0「新增成功」     BY4b http=200 code=0
FAIL team.name 未改            : "r7_team" -> "r7_HACK_TEAM"
FAIL clsA.name 未改            : "r7_cls_a" -> "r7_HACK_CLS"
FAIL stuA.password 逐字节未变  （哈希已变）
FAIL 越权学生未创建            : count 0 -> 1
FAIL teamClass(team, clsA) 未落库: count = 1
R30 http=200   R33 http=200 「创建成功」   assignment 落库数(HACK) = 2
PROBE VERDICT: FAIL ❌

--- jest（改动前形态）---  Test Suites: 2 failed ｜ Tests: 12 failed, 59 passed, 71 total
变红清单（精确命中，无溢出）：
  unit/assignment-q9-branches → 「题目查询过滤软删除（where.deletedAt === null）」×1
  ownership-guards → R24 R25 R26 R28 R29（updateTeam 段）
                     R30 R31 R32 R33 R34 R35（createAssignment 段）
 未变红（应然）：R23/R27（合法路径 200）· R36（合法路径 200）· 既有 48 例
```

**复原**：`grep -rn "MUTATION-PROBE\|if (false" server/src/` → **零残留**；复原后 `ownership-guards + assignment-q9` 复跑 **71/71 绿**，探针恢复 **ALL DENIED + ZERO WRITE**。

> 意义：这组变异同时证明了三件事 —— ① 新用例不是「永远绿灯」；② 红灯精确对应被移除的守卫（R29 在变异后仍红是因为它同时也被 round-6 的成员守卫拦截，属**双重保护**，不是误报）；③ 合法路径用例（R23/R27/R36）在两种形态下都绿 ⇒ 守卫没有把合法流程锁死。

---

## 6 未做项（含 **teacherIds 的分析结论**）

### 6.1 ★任务 1 的第二个要求：`updateTeam.teacherIds` 是否也应限制可加入的教师范围？

**结论：技术上应当限制，但**不属本次授权**（= 拍板项 R6-P10 的组成部分），本轮**未改**，移交用户拍板。**

**(a) 现状与危害面**：`teamController.js:98-103` 只做「调用者是不是成员/创建者」的判定，**对 `teacherIds` 的内容零校验** ⇒ 成员/创建者可把**任意教师**（含其他学校、乃至与该团队毫无关系的教师）写入 `teamTeacher`。

**(b) 为什么危害面 **小于** `classIds`（与 C 的 C6-2 判断一致）**：

| 维度 | `classIds`（已修） | `teacherIds`（未修） |
|---|---|---|
| 对**攻击者**的收益 | 把他人的班拉进自己的可见集 ⇒ round-5/6 全部写守卫对该班放行 ⇒ 跨租户改班/重置口令/建学生 | **零收益**（被加入者不是攻击者本人） |
| 对**受害者**的收益 | — | 被拉入者获得「该团队全部班级」的**可见性**（读 + 经团队写） |
| 放大条件 | 独立成立（C 实测无需受害者配合） | **依赖 C6-1**：修复后团队班级恒 ⊆ 邀请者可见集 ⇒ 最多是「把 A 可见、B 不可见的班暴露给 B」，且范围受学校维度约束（`teamSchool` 与邀请者学校一致才有意义） |
| UI 可否产生 | 不能（候选来自本人可见集） | 不能（`TeamEdit.vue` 的候选教师来自 `GET /teacher/teachers`，带 `schoolId`） |

**(c) 若拍板「要限制」，建议的最小判据（本轮**未**实施，仅备选）**：
```js
// 被加入者必须与团队同校（复用本文件已有 prisma，无需新增 import）
const ok = await prisma.teacherSchool.findMany({
  where: { teacherId: { in: teacherIds.map(Number) }, schoolId: team.schoolId }, select: { teacherId: true } });
// ok.length === new Set(teacherIds.map(Number)).size  ⇒ 否则 403/1003
```
**成本**：+1 次查询、**零新增 import、零新响应形状**（复用 403/1003）；**风险**：会改变「跨校协作团队」这一可能存在的既有用法 ⇒ **必须由用户确认产品语义**（这正是 R6-P10 的内容）。**故本轮不动。**

**(d) 另需用户一并拍板的**（属同一治理语义簇）：① 成员（非创建者）可否增删名单（R23/R27 实测现状 = **可以**）；② 团队班级是否应授予**写**权限（R6-P9）。C6-1 修复后，② 的最坏放大面已被消除，可独立拍板。

### 6.2 其余未做项（逐条给依据）

| # | 项 | 原因 |
|---|---|---|
| 1 | 全量回归（四段 1011+ 口径） | **留 Agent C**（任务书第四步：定向单测允许且要求，全量留 C） |
| 2 | `getChecker`（读端点）归属收窄 | A/B 已登记的读侧缺口，不在本轮授权面 |
| 3 | `C6-3`（非数组 teamIds → 500 / 重复 id → 500） | 本轮授权面只含 C6-1 与 R-1；`C6-3` 已证**零写入、无越权**，属参数类型前置校验（建议下一轮顺手做，不影响判据） |
| 4 | `C6-6`（`projectController` 内联复制可见集） | 收敛形态需在「+1 import 边」与「安全漂移」间取舍，属 Captain 拍板项；本轮**未新增任何 import 边**（164 不变） |
| 5 | 软删维度（classes/teams 无 `deletedAt` 列） | schema 实测无该列 ⇒ 不可构造，非「已防御」 |
| 6 | 性能基准 | 本仓无该装置；新增守卫为每请求 1-2 次索引查询（`updateTeam` 仅在 `classIds?.length` 时查，`createAssignment` 恒定 1-3 次） |

---

## 7 遗留风险

| # | 风险 | 等级 | 说明 |
|---|---|---|---|
| **R7-1** | `updateTeam.teacherIds` 仍可增删任意教师（**C6-2**） | 低-中 | §6.1 已给出分析 + 备选判据；**等 R6-P10 拍板**。C6-1 修复后其放大面被显著压缩 |
| R7-2 | 成员互改名单（R6-P10 ①） | 低（语义） | 现状：成员可改（R23/R27 实测 200）；**刻意保留**，未擅自收紧 |
| R7-3 | 团队班级是否授予写权限（R6-P9 ②） | 中（语义） | 未触碰；C6-1 修复后团队内容恒 ⊆ 成员可见集 |
| R7-4 | `createAssignment` 归属过滤把「他人题」与「不存在题」合并为同一 400 | 低（有意） | 这正是**零存在性预言机**的设计目标（A 的契约）；代价：合法用户误传他人题 id 时无法区分两种原因 |
| R7-5 | `createAssignment` 的 classIds 守卫在参数校验之后 | 低 | 空 `classIds` 仍走既有 400/1001（语义未变）；非空但越权 ⇒ 403 前置，**任何写库之前** |
| R7-6 | `assignment-q9-branches` 的替身需随实现演进而补桩 | 低（维护） | 纪律 16 的固有成本：该套件是**部分替身**，未来任何新模型查询都要同批补桩 —— 判据是「补桩 + 加键」，**不得**用 `objectContaining` 弱化 |
| R7-7 | `teacherController.js` 1332 → **1338** 行 | 低 | 已在 GodFile >800 基线 10 个之内，判据=个数 ⇒ `godfileOver800` 实测仍 **10** |

---

## 8 给 Agent C 的验证指引

**① 复跑同一探针（最快判据）**

```bash
cd server
TEST_URL="$(node -e '<从 server/.env 只换库名为 exam_system_test>')"
DATABASE_URL="$TEST_URL" PORT=0 node /tmp/r7b-probe.mjs        # 或你自建 r8_ 夹具的等价脚本
# 期望：BY1/BY2/BY3/BY5/BY4b 全 403/1003；R30 403；R33 400/1001；R36 200；L1/L2 200；L3 403
#      零写入对拍 5/5 OK；PROBE VERDICT: ALL DENIED + ZERO WRITE ✅；leftover r7_ = 0
```
> ⚠️ **必须显式 `PORT=0`**（纪律 14）；探针已 `process.exit(0)`，**不占 :5173/:3000**。

**② 全量回归（口径对表）**

```bash
ROUND=07 bash docs/pipeline/scripts/unblock-g2.sh
```
- 预期：**0 failed**；套件 **68**（未新增文件）；例数 = round 6 的 **1059** + **14（本轮新增 R23-R36）** = **1073**。
- 四段口径：段1 = 960 + 14 = **974**、段2 `fact-extractor` 17、段3 `rule-executor` 61、段4 `rule-mutator` 21（**四处摘要都要看到**）。
  ⚠️ 纪律 17：段1 **不是固定值**，请以本轮日志实测为准，勿沿用旧数字。
- 重点复跑：`ownership-guards`（**62**）· `assignment-q9-branches`（**9**）· `assignment` / `open-project-flow` / `submit` / `student-v2` / `t2-teacher-scope`。

**③ 门禁复算（期望值与 round 6 完全一致）**

```bash
node scripts/gates/cycle-check.mjs        # 71 文件 / 164 边 / SCC 0      ← 边数 ≠164 即回归
node server/scripts/check-layers.mjs      # 71 / 0 / 47
node scripts/gates/arch-metrics.mjs       # 0 / 47 / 10（GodFile 不得变 11）
node scripts/gates/hard-metrics.mjs       # 0 / 0 / 0
node scripts/gates/bind-check.mjs         # 169 模块 / 512 绑定 / 0 违规
find server/src client/src -type f | wc -l              # 146
wc -l < server/src/controllers/studentController.js     # 799（+ git diff --stat 空）
```

**④ 明确请 C 判定的四点**

1. **C6-1 是否被斩断**：§5.2 的 BY1-BB5 是否全 403 + 零写入；**尤其是 BY1 是否不再写 `teamClass(team, 他人班级)`**（这是整条链的唯一输入源）。
2. **`assignment-q9-branches.test.js` 的改动是否只在「补桩 + 加键」边界内**：请按 §3.1 的完整 diff 独立复核——**判据 = 改动后断言不得更弱**（`objectContaining`/`expect.any`/`子集断言` 应为 0；`where` 断言键数由 2 → 3）。
3. **例数是否精确落在 1073/68**（若不等，先查 `ownership-guards` 的 `it` 数是否为 62）。
4. **是否判 `teacherIds`（C6-2）为「随 R6-P10 拍板」**：本轮已给出 §6.1 的分析与最小判据但**未实施**；若你判定它应构成阻断，请按规范回流，不要由你代改。

---

## 9 一句话结论

> **C6-1（阻断）已斩断**：`updateTeam` 在**成员判定之后、全部写库动作之前**新增 `classIds ⊆ getVisibleClassIds(req.user.id, getSchoolId(req))` 内容校验 ⇒ 探针实测 BY1-BB5（挂他人班级 → 改他人班 → 重置他生口令 → 越权建学生 → 混合数组）**全部由「改动前 200 + 真实落库」变为「403/1003 + 5/5 零写入」**；变异测试证明红灯精确对应被移除的守卫且合法路径不误伤。
> **R-1 已收口**：`createAssignment` 的 `classIds` 走可见集校验（403/1003）、`questionIds` 在既有 where 上追加 `teacherId`（复用既有 400/1001，零新响应形状、零存在性预言机）——为此按 Captain 授权**只做「补 4 处桩 + 加 1 处断言键」**修改 `assignment-q9-branches.test.js`（**9/9 仍绿且断言更强**，完整 diff 见 §3.1）。
> **门禁零增量**：cycle **164 边** · layers **71/0/47** · arch **0/47/10** · hard **0/0/0** · bind **0 违规** · 文件 **146** · `studentController` **799 行 0 改动**；定向单测 **28 套件 0 failed**，授权测试文件 **62/62**。
> **`teacherIds` 结论**：技术上应当限制（备选判据见 §6.1(c)，零新增 import/零新响应形状），但属**团队治理语义（R6-P10）** ⇒ 本轮**未改**，移交用户拍板。
