# teacherController 拆分执行报告（GodFile 拆分专项 · step 9 · Agent B · 第 2 轮）

- **本轮任务**：① 封住 C 的 D2 覆盖缺口（补 1 例）② 按 A 的方案完成 **实际搬移**（B1→B2→B3），**本轮最后一个 GodFile**
- **执行者**：Agent B（本轮唯一写者）｜ **日期**：2026-10-11 ｜ **技能**：tech-code-refactoring
- **方案**：`docs/split/teacherController-plan.md`（872 行）｜ **前置验证**：`docs/split/teacherController-B0-B0b-verify.md`（C，PASS + D1/D2）｜ **执行范本**：`docs/split/reviewController-refactor.md`
- **约束遵守**：无任何 git 写操作（无 clean/stash/checkout/reset/restore/commit）｜ 未联网、未装依赖 ｜ 未碰 :5173/:3000、`client/dist`、`tests/`、`scripts/gates/`、`server/scripts/`、`docs/pipeline/lint-baseline.json` ｜ 自建服务一律 `PORT=0` + `exam_system_test` ｜ 未跑全量回归（C 的职责）

---

## 0 判定摘要（判据 → 实测）

| # | 判据 | 期望 | **实测** | 结论 |
|---|---|---|---|---|
| 1 | **D2 补测**：新例在放宽变异下变红 | 必须 RED | 变异 `{teacherId,classId}`→`{teacherId}` 后 **1 failed / 7 passed**，红例 = 新增 **T-A8** | ✅ |
| 2 | 冻结基准 sha256/行数 | `30793987…` / 1336 | `307939875e16654f5c435eb923309292443737291131f682e984cc00c4b36823` / **1336** | ✅ |
| 3 | **逐块判等** | 100% 逐字（本轮无豁免） | **43 块：41 全等 + 2 块仅 1 行动态 import 规格符改写（:137/:204）** | ✅（见 §5） |
| 4 | 反向校验（非搬移字节） | 0 | 10 文件 **body sha == 源区间 sha**，未匹配非空白字节 **0** | ✅ |
| 5 | **导出面** | 30 名逐字等价 | 旧 `teacherController` **30** == `T8∪T12` **30**（集合逐字相等）；`T8∩T12=∅`；`{...T8,...T12}` 键数 = 并集 = 30（**无静默遮蔽**） | ✅ |
| 6 | **barrel 顺序（硬要求②）** | 先建 barrel → bind-check → 改 I1/I2 → 删源 | 执行顺序**逐条留痕**（§4.3）；bind-check 在 I1/I2 之前即 **0 违规** | ✅ |
| 7 | **I2 的 13 例** | 同批改 + 真跑 | 改路径后真跑：**9 passed / 0 failed**（该套件实际 **9** 例，见 §12-D4） | ✅ |
| 8 | 门禁七项 | 见 §9 | 违规 **0** / 未分层 **42** / GodFile **1** / SCC **0**（server+client）/ hard **0-0-0** / bind **0** / eslint **0 err / 57 warn** / lint-check **exit 0** | ✅ |
| 9 | **lint 迁移 1 条** | `gradeProject` 判为迁移、exit 0 | `teacherController.js:159` → `infrastructure/teacher/grade.js:14`（rule/symbol/文本三项全同）；**未执行 `--update-baseline`**（基线 sha/mtime 未变） | ✅ |
| 10 | **路径探针复查** | 3 根仍解析到同一绝对路径 | 3 根 **EQUAL**、4 个表达式逐字求值相同、**深度无关 = true**、`server/src/**/uploads` 漂移目录 **0** | ✅ |
| 11 | 定向测试 | 0 failed | **23 套件 / 268 例 / 0 failed**（第二遍全绿；第一遍有 1 次不可复现的瞬时失败，见 §12-D5） | ✅ |
| 12 | 越界 | 计划内文件 | `git status -uno` = **1 删 + 3 改**；新增 2 个目录（12 文件）；门禁/基线/客户端 mtime 未变 | ✅ |

---

## 1 版本锚点与越界自查

### 1.1 锚点（逐字命中）

| # | 判据 | 实测 |
|---|---|---|
| 1 | `git rev-parse HEAD` | `5764500`（B0b 归档提交；工作树入场干净） |
| 2 | `git show HEAD:server/src/controllers/teacherController.js \| shasum -a 256` | `307939875e16654f5c435eb923309292443737291131f682e984cc00c4b36823` |
| 3 | 行数（`wc -l`） | **1336** |
| 4 | 工作树同名文件 sha / `git status --porcelain -uno`（入场） | 同 sha / **空** |
| 5 | 冻结副本 `/tmp/b9-frozen/teacherController.js` | 同 sha / 1336 行（生成脚本**首行 fail-closed 断言**该 sha 与行数，不符即 exit 1） |
| 6 | 删除前最后复算 | `-rw-r--r-- 60978` / `30793987…`（与冻结副本逐字相同） |

### 1.2 改动面（`git status --porcelain`）

```
 D server/src/controllers/teacherController.js          ← 源文件删除（最后一步）
 M server/src/routes/teacher.js                          ← I1：第 4 行 → 3 行
 M server/test/integration/tc-b0-switch-class-school.test.js  ← D2 补测（+26/−4）
 M server/test/unit/assignment-q9-branches.test.js       ← I2：第 41 行路径
?? server/src/interface/http/controllers/teacher/        ← 8 文件（7 内容 + barrel）
?? server/src/infrastructure/teacher/                    ← 4 文件（3 内容 + barrel）
```

### 1.3 未触碰声明（mtime 实测）

`scripts/gates/bind-check.mjs`（Oct 11 00:51:50）· `docs/pipeline/lint-baseline.json`（Oct 11 13:22:03）· `server/scripts/check-layers.mjs`（Aug 16 18:18:51）· `client/dist`（Oct 10 21:55:33）**全部未变**；`tests/`（含 `rig-server` 冻结副本）零改动；未改任何测试断言（只改 I2 的一行路径 + D2 新增 1 例）。

---

## 2 ★前置任务：D2 覆盖缺口封堵（独立的一套测试改动）

**C 的探针事实（`teacherController-B0-B0b-verify.md` V5-X6）**：`:963` 的 `findFirst({ where: { teacherId, classId } })` 放宽为 `{ teacherId }` 后 **23 例全绿** —— T-A4 的 `tOutsider` 在 `teacherClass` **零行**，只钉住「无班级关系」，未钉住 **classId 作用域**。

### 2.1 补的这 1 例（T-A8）

夹具（`server/test/integration/tc-b0-switch-class-school.test.js`，自建自清 `tca_` 前缀）：

| 新增 | 内容 | 作用 |
|---|---|---|
| `tOtherClass`（`tca_teacher_other_class`） | 属 **A 校**（`teacherSchool` 有行）、**不属 B 校** | 使放宽后的流程**必然落到 `:972`**（而非 200），从而与 `:964` 的文案可分辨 |
| `clsOther`（`tca_class_other`，A 校） | `teacherClass` 行 `{ tOtherClass, clsOther }` | ★「**在 teacherClass 里有行、但那一行指向另一个班级**」 |
| `clsTarget`（`tca_class_target`，A 校） | **无** `tOtherClass` 的 teacherClass 行 | 被守卫的目标班级 |

用例（插在 T-A4 之后，T-A5 之前）：

```js
it('T-A8 ★classId 作用域：教师在【别的】班有 teacherClass 行 → 仍须 403 无权操作（零写入）', async () => {
  const before = await snapClass(clsTarget.id);
  const res = await api(tokenOtherClass).put(sw(clsTarget.id), { newSchoolId: sB.id });
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ code: 1003, message: '无权操作', data: null });
  expect(await snapClass(clsTarget.id)).toEqual(before);
});
```

**两条路径的判别力（逐行推演，与实测一致）**：

| 代码 | `:963` 命中 | 后续 | 响应 | 断言 |
|---|---|---|---|---|
| **正确** `{teacherId, classId}` | `clsTarget` 无行 ⇒ `!tc` | 不继续 | 403 `{code:1003,message:'无权操作'}`（`:964`） | **绿** |
| **放宽** `{teacherId}` | 命中 `clsOther` 的行 ⇒ 放行 | 旧校（A）✓ → 新校（B）✗ | 403 `{code:1003,message:'你不属于目标学校'}`（**`:972`**） | **红**（文案逐字不等） |

### 2.2 自证（原始读数）

**（a）单跑全绿（改前/正确代码）**

```
$ /tmp/b9-frozen/crun.sh test/integration/tc-b0-switch-class-school.test.js
    ✓ T-A1 缺/假 newSchoolId → 400 请选择目标学校（两条入参各一次，零写入） (9 ms)
    ✓ T-A2 班级不存在 → 404 班级不存在（零写入） (2 ms)
    ✓ T-A3 目标学校 === 当前学校 → 400 目标学校与当前学校相同（零写入） (4 ms)
    ✓ T-A4 非本班教师 → 403 无权操作（零写入） (4 ms)
    ✓ T-A8 ★classId 作用域：教师在【别的】班有 teacherClass 行 → 仍须 403 无权操作（零写入） (2 ms)
    ✓ T-A5 教师不在【旧】校 → 403 无权操作当前学校（全仓唯一文案 :971，零写入） (4 ms)
    ✓ T-A6 教师不在【新】校 → 403 你不属于目标学校（全仓唯一文案 :972，零写入） (4 ms)
    ✓ T-A7 合法迁移 → 200 全字段 + 拼接文案（两态）+ teamClass 清零 + 回读 DB (13 ms)
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

6 个 B0 套件合跑：**6 suites / 24 tests / 0 failed**（23 + 新增 T-A8）。

**（b）放宽变异下必红（`/tmp` 副本，未写仓库）**

```
$ 变异（/tmp/b9-mut，锚点出现次数断言 = 1，否则 DEVICE INVALID）：
   const tc = await prisma.teacherClass.findFirst({ where: { teacherId: req.user.id, classId } });
→  const tc = await prisma.teacherClass.findFirst({ where: { teacherId: req.user.id } });
MUTATION APPLIED: :963 {teacherId, classId} -> {teacherId}
变异副本 sha256 = 4abc67a5c23464175032b0c6ae453451727f1fb3291f9403ee63335052bb5917

$ /tmp/b9-frozen/crun-tree.sh /tmp/b9-mut test/integration/tc-b0-switch-class-school.test.js
        "code": 1003,
        "data": null,
    -   "message": "无权操作",
    +   "message": "你不属于目标学校",
    > 178 |     expect(res.body).toEqual({ code: 1003, message: '无权操作', data: null });
Test Suites: 1 failed, 1 total
Tests:       1 failed, 7 passed, 8 total        ← 红面精确 = 仅 T-A8
```

⇒ **夹具打到位、变异必红、红面唯一**。D2 缺口封堵完毕，**此后才开始搬移**。

**给 C 的阶梯预期（供 V4 复算对照）**：新增 T-A8 在 `:964` 处**出口**，故阶梯仅前四级的计数 +1、`:965` 之后不变：
`947: 10→11 · 951: 7→8 · 958: 6→7 · 961: 5→6 · 965: 4（不变） · 972: 3（不变）`。

---

## 3 目标形态与实测行数（10 个搬移文件 + 2 个 barrel）

| # | 目标文件（层） | 源区间（B0b 后口径） | 搬移行 | **实测总行** | sha256（前 16） |
|---|---|---|---|---|---|
| T9 | `infrastructure/teacher/exam-parse.js`（infra） | 372-422 | 51 | **59** | `629a2517c41a4cf4` |
| T10 | `infrastructure/teacher/grade.js`（infra） | 159-218 · 1322-1336 | 75 | **88** | `b11ba6a2eb492c29` |
| T11 | `infrastructure/teacher/uploads.js`（infra） | 1288-1320（不含 1289 的 multer import 行） | 32 | **43** | `5b67bc38a073fe55` |
| T12 | `infrastructure/teacher/index.js`（infra，barrel） | — | 0 | **10** | `055de0a61cf2d618` |
| T1 | `interface/http/controllers/teacher/guards.js`（interface） | 13-67 | 55 | **66** | `188a9542a8f6a812` |
| T2 | `…/teacher/school.js` | 69-81 | 13 | **22** | `cfc1319c1bec73b4` |
| T3 | `…/teacher/questions.js` | 83-158 · 219-370 | 228 | **242** | `a86e1503df53caaf` |
| T4 | `…/teacher/assignments.js` | 424-809 | 386 | **399** | `72f09ea73c8e68ee` |
| T5 | `…/teacher/teachers.js` | 811-828 | 18 | **28** | `5a32e19340cfef2d` |
| T6 | `…/teacher/classes.js` | 830-1001 | 172 | **183** | `068d30633fb6079e` |
| T7 | `…/teacher/students.js` | 1003-1285 | 283 | **295** | `aaac5a41d68c9daa` |
| T8 | `…/teacher/index.js`（interface，barrel） | — | 0 | **13** | `3e4a31bd295bd2ef` |

- **总计 1448 行 / 12 文件**；源文件 1336 行删除；**最大新文件 399 行 ≪ 800**（A 预估 400 ✔）
- **落层**：interface **8**（7 内容 + 1 barrel）+ infrastructure **4**（3 内容 + 1 barrel）；application/domain = **0**（遵 A §2.4 裁定）
- **两条硬约束的落实**：① deepseek 有静态（原 `:11`）+ 动态（原 `:204`）两条边 ⇒ `parseExam`/`parseExamStream`/`generateReference`/**`gradeProject`** 四个单元全部落 **infrastructure**；② 共享守卫 `getSchoolId` 与其 **15 个消费者**（S5-S8）**同层**（`guards.js` + `{assignments,teachers,classes,students}.js` 全在 interface，同目录 `./guards.js`）
- **源文件行号守恒**（脚本逐行集合运算）：**搬移 1313 + import 行 12 + 未搬移空行 11 = 1336**；**未映射非空白行 = 0 / 双映射 = 0**
  - import 行 12 = 头部 `:1-11` + 第二段 `:1289`（multer，进 uploads.js 的 import 头）
  - 未搬移空行 11 = `:12 :68 :82 :371 :423 :810 :829 :1002 :1286 :1287 :1323`（**全部为空白行**；`:158`/`:219`/`:373`/`:394` 等在区间内，随切片搬走）

### 3.1 源行 → 终态 `file:line` 关键锚点（供 C 定位，实测）

| 源行（1336 行口径） | 终态位置 | 说明 |
|---|---|---|
| `:963` | `interface/http/controllers/teacher/classes.js:145` | ★ D2 的变异靶点（`findFirst({teacherId, classId})`） |
| `:946-1001` | `classes.js:128-183` | `switchClassSchool` |
| `:137` | `questions.js:69` | 动态 `import('../../../../utils/fileTree.js')`（唯一改写的 2 行之一） |
| `:204` | `infrastructure/teacher/grade.js:59` | 动态 `import('../ai/deepseek/index.js')`（唯一改写的 2 行之二） |
| `:159` | `grade.js:14` | `const gradeProject = …`（lint 迁移的 1 条） |
| `:1291`/`:1292` | `uploads.js:14`/`:15` | `uploadDir` + `mkdirSync` 模块加载期副作用 |
| `:1288-1320` | `uploads.js:11-43` | 上传块（横幅在 :11，`const uploadDir` 在 :14） |

---

## 4 分批执行记录（B1 → B2 → B3；**每步都留了实测读数**）

### 4.1 B1 · infrastructure 3 文件

| 序 | 动作 | 实测判据 |
|---|---|---|
| 1 | 生成 T9/T10/T11（脚本只读 `/tmp/b9-frozen/teacherController.js`，**首行断言 sha256 + 1336 行**，fail-closed） | 59 / 88 / 43 行 |
| 2 | `node --check` ×3 | 全通过 |
| 3 | **反向校验**（`/tmp/b9-frozen/verify.mjs`，自建、独立于生成器：从磁盘读回 → 拆 banner/import/body → 与 plan §6.2 源区间逐行比对） | 3/3 `bodyShaMatch: true`，FAILS = 0 |
| 4 | **真 import**（本仓第 12 条纪律：不信 `node --check`） | `exam-parse → 2 [parseExam,parseExamStream]`、`grade → 1 [generateReference]`、`uploads → 1 [uploadMaterial]` |

### 4.2 B2 · interface 7 文件

| 序 | 动作 | 实测判据 |
|---|---|---|
| 1 | 生成 T1-T7 | 66 / 22 / 242 / 399 / 28 / 183 / 295 行 |
| 2 | `node --check` ×7 | 全通过 |
| 3 | 反向校验 | **10/10 `bodyShaMatch: true`，REVERSE CHECK FAILS = 0** |
| 4 | 真 import | `guards → 6`（内部名）· `school → 1` · `questions → 6` · `assignments → 5` · `teachers → 1` · `classes → 6` · `students → 7`（合计 **26** 契约名 + 6 内部名） |

### 4.3 B3 · barrel → bind-check → I1/I2 → 删源（**硬要求②的顺序，逐条留痕**）

| 序 | 动作 | 证据（原始读数） |
|---|---|---|
| 1 | 建 **T8**（13 行 / 6 行 re-export / 26 名）+ **T12**（10 行 / 3 行 re-export / 4 名） | `Object.keys`：T8 = 26、T12 = 4、`T8∩T12 = []`、`spread == union`（见 §7） |
| 2 | **在改 I1/I2 之前**跑 bind-check（源文件仍在、I1/I2 未动） | `modules 226 / bindings 798 / BINDING VIOLATIONS 0 / unresolved 4 / external 1`，exit 0 |
| 3 | 改 **I2**（单测动态 import 路径）+ **I1**（`routes/teacher.js:4` 一行 → 三行） | `git diff -U0` 共 4 个 hunk（I1 3 行、I2 1 行）；`diff` 路由体 **29 行逐字节相同** |
| 4 | 改后复跑 bind-check（源文件仍在） | `modules 226 / bindings 799 / 0 违规`，exit 0 |
| 5 | **最后**删源文件（删前打印绝对路径 + sha 复核 `30793987…`；`rm` 后 `ls` 确认 No such file） | `grep -rnE "from '[^']*controllers/teacherController\.js'" server/src server/test` = **0**（**规格符口径**）；文本命中 **12** = 12 条 banner（**非 import**） |
| 6 | 终态复跑 bind-check + 门禁七项 | `modules 225 / bindings 785 / 0 违规`；门禁见 §9 |

**两条改写的逐字内容**：

```js
// I1 · server/src/routes/teacher.js:4（一行 → 三行）
-import * as teacher from '../controllers/teacherController.js';
+import * as teacherHttp from '../interface/http/controllers/teacher/index.js';
+import * as teacherIo from '../infrastructure/teacher/index.js';
+const teacher = { ...teacherHttp, ...teacherIo };

// I2 · server/test/unit/assignment-q9-branches.test.js:41（仅换路径，注释与其余行不动）
-const { createAssignment } = await import('../../src/controllers/teacherController.js');
+const { createAssignment } = await import('../../src/interface/http/controllers/teacher/assignments.js');
```

**I1 的名字闭包（防 `{...}` 静默遮蔽的第二重保险）**：`routes/teacher.js` 实测使用 **29 个 `teacher.X`**，逐一在 `{...t8, ...t12}` 上检查 `typeof === 'function'` ⇒ **缺失 0**；合并对象键数 = **30**。

---

## 5 ★逐块判等（43 块顶层具名单元：**41 全等 + 2 块仅 1 行 import 规格符**）

判等方法（`/tmp/b9-frozen/gen2.mjs`，自建）：acorn 取每个顶层声明（9 个 `function` + 30 个 `export const` + 1 个非导出 `const gradeProject`），**另加 3 个模块级 const**（`uploadDir`/`storage`/`upload`）= **43 块**；对每块在「源切片文本」与「目标文件对应行」之间逐字节求 sha256。

### 5.1 41 块全等（逐块 sha256 相同）

| 目标文件 | 全等块（源行区间） |
|---|---|
| `guards.js` | getSchoolId 14-14 · canTeacherManageClass 25-28 · canTeacherManageStudent 31-39 · canTeacherManageClasses 47-51 · canTeacherManageTeams 54-58 · isTeacherInSchool 61-67 |
| `school.js` | switchSchool 71-81 |
| `questions.js` | getQuestions 85-108 · getQuestion 110-122 · **createQuestion 220-288（X3 已被 B0b 消化 ⇒ 本轮全等）** · updateQuestion 290-356 · deleteQuestion 358-370 |
| `assignments.js` | rollupRow 434-446 · rollupPendingByAssignment 457-498 · buildAssignmentStatusWhere 506-518 · getPendingSummary 526-576 · getAssignments 578-697 · getAssignment 699-716 · createAssignment 718-790 · lockAssignment 792-809 |
| `teachers.js` | getAllTeachers 813-828 |
| `classes.js` | getMySchools 832-843 · getAllClasses 845-868 · createClass 870-896 · updateClass 898-924 · deleteClass 926-944 · switchClassSchool 946-1001 |
| `students.js` | getMyStudents 1005-1036 · getMyClasses 1038-1052 · updateStudent 1054-1111 · deleteStudent 1113-1131 · resetStudentPassword 1133-1157 · addStudent 1159-1190 · batchAddStudents 1192-1285 |
| `exam-parse.js` | parseExam 374-393 · parseExamStream 395-422 |
| `grade.js` | generateReference 1324-1336 |
| `uploads.js` | uploadDir 1291-1291 · storage 1294-1300 · upload 1302-1311 · uploadMaterial 1313-1320 |

### 5.2 2 块 DIFF —— **唯一的偏离，且是函数体内的「动态 import 规格符」**

| 块 | 源行 | 旧文本 | 新文本 | 依据 |
|---|---|---|---|---|
| `getProjectFiles`（→ questions.js） | **137** | `await import('../utils/fileTree.js')` | `await import('../../../../utils/fileTree.js')` | plan §6.4 / §10-B7 明文要求 |
| `gradeProject`（→ grade.js） | **204** | `await import('../infrastructure/ai/deepseek/index.js')` | `await import('../ai/deepseek/index.js')` | plan §6.4 / §10-B2 明文要求 |

**为什么 B0b 不能预先消化这两行（对任务书「本轮不再有任何例外」的诚实更正）**：这两行**是被搬移函数体内的 import 规格符**，其正确取值**取决于宿主深度**。B0b 的树必须仍在 `controllers/` 下可运行 ⇒ 若当时改成新深度就会**立刻打断源文件自身**。B0b 已完成的是 X1/X2/X3 的**路径常量**部分（`:133` `:188` `:249` `:254` `:1291` `:1292`），这些在**原位置即等价**；两条动态 import 只能**搬移时**改写。二者在语义上属「import 行」（check-layers 的 `IMPORT_RE` 第三个分支就是 `import\s*\(`），因此在反向校验里归入 `import` 桶，**不构成「函数体改写」**。⇒ 本轮判等口径 = **41/43 块逐字节相等；2 块各仅 1 行 import 规格符不同**（**除 import 行外零偏离**）。

---

## 6 反向校验：目标文件里没有「非搬移字节」（实测）

`/tmp/b9-frozen/verify.mjs`（自建，**独立于生成器**，从**磁盘**读回）：

```
$ cd server && PORT=0 node /tmp/b9-frozen/verify.mjs
（每文件：banner=5 · imports=N · body=M · bodyShaMatch=true）
REVERSE CHECK FAILS = 0
```

| 判据 | 期望 | 实测 |
|---|---|---|
| 每文件 body 的 sha256 == 源区间（含 2 处 import 改写）sha256 | 10/10 | **10/10 `true`** |
| 非 banner / 非 import / 非 export 的**无法归因字节** | 0 | **0**（逐行顺序比对，无多余行、无缺行） |
| `export { … };` 块 | 仅 T1（6 个守卫名） | `guards.js` 1 处；其余 11 文件 **0**（声明行已带 `export`，再加即 `SyntaxError: Duplicate export`） |
| **声明行 export 数** | 30 | `grep -c "^export const "`（10 文件）= **30**；`export function` = 0；`export default` = 0；**`export *` = 0** |
| `gradeProject` 的 export 修饰 | **0** | `grep -n "export.*gradeProject"` = **0**（`gradeProject` 在 grade.js 出现 2 次 = 声明 + `:204` 的**属性名** `{ gradeProject: doGrade }`） |

---

## 7 导出面与 barrel 证据

### 7.1 30 名逐字等价（**在源文件删除之前**用真 import 对拍 —— 唯一一次能同时 import 旧新的时刻）

```
$ PORT=0 node -e "…import 旧 teacherController + T8 + T12…"
OLD teacherController count=30
UNION(T8,T12) count=30
SET EQUAL: true
T8∩T12: 0
OLD-names-not-in-new: []
new-names-not-in-OLD: []
```

旧树 30 名（逐字，供 C 对拍）：
```
addStudent batchAddStudents createAssignment createClass createQuestion deleteClass
deleteQuestion deleteStudent generateReference getAllClasses getAllTeachers
getAssignment getAssignments getMyClasses getMySchools getMyStudents getPendingSummary
getProjectFiles getQuestion getQuestions lockAssignment parseExam parseExamStream
resetStudentPassword switchClassSchool switchSchool updateClass updateQuestion
updateStudent uploadMaterial
```

### 7.2 `T8 ∩ T12 = ∅` 与「无静默遮蔽」（硬要求②的 I1 风险）

```
T8 count=26 :: addStudent,batchAddStudents,createAssignment,createClass,createQuestion,deleteClass,
              deleteQuestion,deleteStudent,getAllClasses,getAllTeachers,getAssignment,getAssignments,
              getMyClasses,getMySchools,getMyStudents,getPendingSummary,getProjectFiles,getQuestion,
              getQuestions,lockAssignment,resetStudentPassword,switchClassSchool,switchSchool,
              updateClass,updateQuestion,updateStudent
T12 count=4 :: generateReference,parseExam,parseExamStream,uploadMaterial
T8 ∩ T12 = [] (size 0)      ← 交集为空 ⇒ {...t8,...t12} 不存在同名覆盖
union size=30  spread size=30  spread==union: true
```

### 7.3 barrel 纪律

- 两个 barrel **只做 re-export**：无 import 语句（`grep -c "^import "` = 0）、无逻辑；
- **interface barrel 绝不 re-export infrastructure**：spec 级扫描（`(import|export)…from '<含 infrastructure 的规格符>'`）在 `server/src/interface/**` = **0 命中**（12 条 banner **注释**里的「infrastructure/」字样是文案，不是规格符 —— 与 step 8 的 D7 同型，**提醒 C 勿用裸 grep**）；
- 6 个守卫内部名（`getSchoolId` 等）**不进任何 barrel**，只被**同层同目录**的 4 个文件以 `'./guards.js'` 直接 import（`grep -c "from './guards.js'"` = 4）。

---

## 8 绑定自查（跨文件引用闭包扫描 · 前几步都栽在漏绑定上）

自建装置 `/tmp/b9-frozen/closecheck.mjs`（acorn 解析 → 递归求「有效导出」含 re-export 链 → 逐条具名 import 对拍）：

```
$ PORT=0 node /tmp/b9-frozen/closecheck.mjs
files=12 namedBindingsChecked=43 CLOSURE VIOLATIONS=0
interface 侧 spec 级 infrastructure 引用扫描完毕（上面无输出 = 0）
```

| 判据 | 期望 | 实测 |
|---|---|---|
| 12 个新文件的**全部相对 import 目标可解析** | 0 缺失 | **0**（含 `../../../../domain/errors.js` 的 `DomainError`（class 导出）、`./guards.js` 的 6 名） |
| 具名绑定逐条命中目标真实导出 | 43/43 | **43/43** |
| `export *` | 0 | **0** |
| interface → infrastructure 的 import/re-export | 0 | **0**（spec 级） |
| 绑定自证（AST）：每个文件的**已用**绑定集 == **已导入**集 | 完全相等 | **10/10 完全相等**（**无缺失、无过度导入** —— 后者会让 lint-check 产生 fresh `no-unused-vars` ⇒ exit 1） |
| 死绑定不得复制 | 0 | `DEFAULT_MAX_SCORE` = **0**、`getTeamTeacherIds` = **0** |

**每条 import 由脚本从 AST 引用面自动推导**（不是照抄 §6.4）：如 `assignments.js` 实测用到 `prisma, logger, ABNORMAL_FEEDBACK, getVisibleClassIds, hasStandardPackage, getSchoolId, canTeacherManageClasses` 恰好 7 名 = 其 6 行 import 提供的绑定集。

---

## 9 门禁七项（原始输出）

```
===== [1] check-layers =====
$ node server/scripts/check-layers.mjs
文件 117 个，违规 0 条（0 类规则），未分层待迁移 42 个
exit=0                     ← 43 → 42 ✔（删 1 unlayered，+12 已分层）

===== [2] arch-metrics =====
$ node scripts/gates/arch-metrics.mjs
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=43  实测=42
  ✓ godfileOver800     基线=2  实测=1
  · >500 行（观察带，不计判据） 基线=13 实测=12
  GodFile >800 行：client/src/views/Doc.vue (1106)
  分层守卫原文：文件 117 个，违规 0 条（0 类规则），未分层待迁移 42 个
结论：PASS
exit=0                     ← GodFile 2 → 1 ✔（名单只剩 Doc.vue；最大新文件 399）

===== [3a] cycle-check（默认 server/src）=====
$ node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 117 文件 / 263 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 0）
  自环（文件 import 自身）: 0
结论：PASS
exit=0

===== [3b] cycle-check --root client/src（client 侧不回归）=====
$ node scripts/gates/cycle-check.mjs --root client/src
循环依赖门禁 · 根目录 client/src
  扫描 99 文件 / 244 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 0）
  自环（文件 import 自身）: 0
结论：PASS
exit=0                     ← 与改前逐字相同

===== [4] hard-metrics =====
$ node scripts/gates/hard-metrics.mjs
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
  参考：非 style.css 的 CSS 中 !important = 20（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）
结论：PASS
exit=0

===== [5] bind-check =====
$ node scripts/gates/bind-check.mjs
=== bind-check: ESM 跨模块绑定自检（陷阱 12 的静态补位）===
roots                        : server/src, server/test
modules scanned              : 225
named import bindings checked: 785
unresolved relative imports  : 4 (仅登记)
external (out-of-root) refs  : 1 (仅登记)
BINDING VIOLATIONS           : 0
  ⚠ unresolved: …fact-extractor.test.js -> './App.vue' / './router'；project-context-builder.test.js -> './x.js' ×2
  · external: …experiment-variance.test.js -> '../../../scripts/experiment-variance.mjs'
exit=0                     ← unresolved 4 / external 1 与改前一致；30 条 re-export 全部解析成功

===== [6] eslint =====
$ ./node_modules/.bin/eslint client/src server/src --format json
files=216 errors=0 warnings=57
（本模块占 1 条：server/src/infrastructure/teacher/grade.js:14 no-unused-vars —— 即搬移后的 gradeProject）
exit=0                     ← 0 error / 57 warn ≤ 59 ✔（B0b 后为 57，方向为「不增」）

===== [7] lint-check =====
$ node scripts/gates/lint-check.mjs
扫描文件    : 216（.vue 40 / .js 176）｜代码行 33541｜解析失败 0
基线        : docs/pipeline/lint-baseline.json（2026-10-11T05:22:03.584Z，31 条）
  no-unused-vars            31        29         2  ← 已迁移（不计入阻断）
  合计                       31        29         2
── 基线之外的新违规（阻断项） ── （无）
  · 已消除（基线内被修掉）: 2 条
── 已迁移 2 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） ──
  ⇄ no-unused-vars  count  ｜ let count = 0;
      server/src/controllers/reviewController.js:354   →   server/src/interface/http/controllers/review/batch.js:78
  ⇄ no-unused-vars  gradeProject  ｜ const gradeProject = async (req, res) => {
      server/src/controllers/teacherController.js:159   →   server/src/infrastructure/teacher/grade.js:14
结论：PASS（无基线外新违规；2 条为迁移，不计入阻断）
exit=0
```

**读数汇总**：违规 **0** ｜ 未分层 **43 → 42** ✔ ｜ GodFile **2 → 1** ✔ ｜ SCC **0**（server 263 边 / client 244 边）｜ hard **0/0/0** ｜ bind **0**（unresolved 4 / external 1 与基线一致）｜ eslint **0 error / 57 warn** ｜ lint-check **exit 0**。

---

## 10 ★lint 迁移 1 条的逐字登记（任务书第六步）

`lint-check` 原文（**未刷新基线**；能力来自 step 8 的迁移识别）：

```
  ⇄ no-unused-vars  gradeProject  ｜ const gradeProject = async (req, res) => {
      server/src/controllers/teacherController.js:159   →   server/src/infrastructure/teacher/grade.js:14
```

| 项 | 旧 | 新 |
|---|---|---|
| **file:line** | `server/src/controllers/teacherController.js:159` | `server/src/infrastructure/teacher/grade.js:14` |
| rule | `no-unused-vars` | 同 |
| symbol | `gradeProject` | 同 |
| 规范化行文本 | `const gradeProject = async (req, res) => {` | **同**（逐字） |
| 迁移方向 | 死代码**整块搬走、一处未修** | — |

**「是搬运而非修一处加一处」的人工核对证据（供 C 复核）**：

- `gradeProject` 在**新树**只剩 2 处：`grade.js:14`（声明行）+ `:59`（**属性名** `{ gradeProject: doGrade }`，不是引用）；**旧树**为 `:159` + `:204` —— **一一对应，无任何新增**；
- `grade.js` 的 `Object.keys()` = **1**（`generateReference`）⇒ `gradeProject` **没有**拿到 export（多一个就变 31 名，且会让 `no-unused-vars` 消失 ⇒ 迁移识别失效）；
- eslint 侧同一条警告仍在（**warn 总数 57 不变**，新位置 `grade.js:14`，rule `no-unused-vars`）—— **两道 lint 互证「同一处缺陷换了宿主」**；
- **未执行 `--update-baseline`**：基线 `docs/pipeline/lint-baseline.json` sha256 = `678d3d51af0f446b4e2c7e2c2226c2c3f9915b1572393651efff93812f81804c`、mtime = `Oct 11 13:22:03 2026`（本轮前后**逐字未变**，与 C 在 B0b 记录的 sha/mtime 相同）；
- 计数三元组：**基线 31 → 当前 29**、`resolved` 2（**本轮 1 + step 8 遗留 1**）、**本轮 fresh = 0**、阻断 0。

---

## 11 定向测试（**23 个独立 jest 进程 / 23 套件 / 268 例 / 0 failed**）

口径：每套件**单独一个 jest 进程**（`/tmp/b9-frozen/crun.sh`：从 `server/.env` 只换库名为 `exam_system_test`，显式 `PORT=0`，`--runInBand --forceExit`）；**不跑全量回归**（C 的职责）。

| 序 | 套件 | 例数 | 结果 |
|---|---|---|---|
| 1-6 | `tc-b0-{switch-class-school,lock-assignment,school-teachers,project-files,upload-material,parse-exam-stream}`（B0 的 **23 例 + 新增 T-A8**） | 8+3+4+4+3+2 = **24** | PASS |
| 7 | `unit/assignment-q9-branches`（**I2 直驱**） | **9** | PASS |
| 8 | `ownership-guards`（guards.js 消费最密） | 62 | PASS |
| 9 | `question` | 13 | PASS |
| 10 | `assignment` | 8 | PASS |
| 11 | `student` | 6 | PASS |
| 12 | `student-v2` | 20 | PASS |
| 13 | `teacher-pending-summary` | 13 | PASS |
| 14 | `open-project-flow` | 9 | PASS |
| 15 | `qa-batch1-independent-review` | 17 | PASS |
| 16 | `t4-teacher-idor` | 17 | PASS |
| 17 | `t5-t4-idor-review` | 17 | PASS |
| 18 | `t6-teacher-classid-idor` | 18 | PASS |
| 19 | `t7-t6-classid-review` | 12 | PASS |
| 20 | `admin-teacher-delete` | 4 | PASS |
| 21 | `auth` | 6 | PASS |
| 22 | `compose` | 5 | PASS |
| 23 | `review`（step 8 的模块，防交叉回归） | 8 | PASS |
| | **合计** | **268** | **0 failed** |

- ★ **I2 那套件真跑且绿**（第 7 行）：`describe('createAssignment — Q9 无标准工程包分支')` 全覆盖，改路径后 **9/9 PASS**。
- 存在性证据：`grep -rnE "from '[^']*controllers/teacherController\.js'" server/src server/test` = **0**（bind-check 对该套件只有 `unresolved（仅登记）`，**拦不住漏改** ⇒ 本项是承重判据）。
- 本表是**第二遍全量定向**（第一遍同样 23 套件，其中 `question.test.js` 出现 **1 次不可复现的瞬时失败** —— 见 §12-D5）。

---

## 12 路径探针复查（B0b 的延续；**搬移后再跑一次**）

装置 `/tmp/b9-frozen/pathprobe.mjs`：① 真 import `utils/projectPaths.js` 取 3 个根；② 用 acorn **按「函数名 + 变量名」锚定**（不依赖行号）从**新文件**里逐字切出路径表达式并求值；③ 把两个文件复制到**错误深度**的宿主再求值（深度无关性）；④ 副作用与漂移目录。

```
=== [1] 3 个根（真 import projectPaths.js） ===
UPLOADS_ROOT   = <repo>/server/uploads                      EQUAL_EXPECTED=true
PROJECTS_ROOT  = <repo>/server/uploads/projects             EQUAL_EXPECTED=true
STANDARDS_ROOT = <repo>/server/uploads/project-questions    EQUAL_EXPECTED=true

=== [2] 表达式逐字求值（锚点 = 函数名+变量名） ===
getProjectFiles.dir        expr=path.join(UPLOADS_ROOT, q.attachmentUrl)
                           -> <repo>/server/uploads/project-questions/7/standard
createQuestion.projectsRoot expr=PROJECTS_ROOT
                           -> <repo>/server/uploads/projects
createQuestion.destDir     expr=path.join(STANDARDS_ROOT, String(q.id))
                           -> <repo>/server/uploads/project-questions/<id>
gradeProject.standardDir   expr=q.attachmentUrl ? path.join(UPLOADS_ROOT, q.attachmentUrl) : ''
                           -> <repo>/server/uploads/project-questions/7/standard

=== [3] 深度无关性（模拟错误宿主深度） ===
before=[…4 个绝对路径…]
after =[…4 个绝对路径…]
DEPTH-INDEPENDENT: true          ← 与宿主深度无关（B0b 的常量化在搬移后仍然成立）

=== [4] 副作用与漂移目录 ===
server/uploads/materials exists = true      ← uploads.js 模块加载期 mkdirSync 仍落在正位
getProjectFiles.dir 绝对前缀检查: true
host-dependent tokens in 10 files: __dirname=0 fileURLToPath=0 process.cwd=0
```

| 判据 | 期望 | 实测 |
|---|---|---|
| 3 个根解析到**同一绝对路径** | 与 B0b 记录相同 | **EQUAL 3/3**（`<repo>/server/uploads` / `…/projects` / `…/project-questions`） |
| 5 个路径站点（4 表达式 + `uploadDir` 的 mkdirSync 副作用） | 与改前相同 | **相同**（`server/uploads/materials` 存在） |
| 宿主深度依赖 | 0 | **0**（`__dirname`/`fileURLToPath`/`process.cwd` 在 10 文件中全为 0；深度模拟值不变） |
| **仓库内漂移目录** | 0 | `find server/src -type d -name uploads` = **0**；全仓仅 `server/uploads` 与 `server/uploads/project-questions`（两个**合法根**，测试产物，非本步新增） |

---

## 13 偏离登记（相对 A 的方案与任务书）

| # | 项 | 方案/任务书原文 | 实际做法 | 理由 |
|---|---|---|---|---|
| **D1** | **两条动态 import 规格符的改写时机**（★最重要） | 硬要求①「本轮必须 100% 逐字搬移……不再有任何例外」 | `:137`/`:204` 两行**在搬移时改写**（`../utils/fileTree.js` → `../../../../utils/fileTree.js`；`../infrastructure/ai/deepseek/index.js` → `../ai/deepseek/index.js`），其余 **41/43 块逐字节相等** | 两行在**函数体内**、规格符**取决于宿主深度**；B0b 时若改就会打断仍在 `controllers/` 的源文件。plan §6.4/§10-B7/B2 **明文要求**改写。二者属 **import 行**（check-layers 的 `IMPORT_RE` 含 `import(`），故「禁止顺手改」禁令不受影响 |
| **D2** | 分批与 GodFile 读数出现的时点 | plan §9：「B2 后 GodFile 2 → 1」 | 本轮**不建门面**（源文件保留内联实现直到 B3 删除）⇒ **GodFile 2 → 1 在 B3 删源后才成立**；B1/B2 期间源文件仍是 1336 行 | 任务书第四步明确「**内联实现的删除放最后**」；门面中间态是 plan §9 的**可选**做法（其收益是分批提交时 I1/I2 不动）。本轮单轮完成 + 禁 git 写 ⇒ 门面无收益、徒增一次全量改写 |
| **D3** | 中间态门禁读数 | plan §9 每批给指标 | 我在 B3b/B3d/B3e 三点取了 bind-check 读数（226/798 → 226/799 → 225/785，均 0 违规）；**check-layers/arch 只在终态取**（117/0/42 与 GodFile 1） | 硬要求②只要求「barrel → bind-check → I1/I2 → 删源」的顺序留痕；未跑全量门禁于中间态是为避免把「源文件与 12 个新文件同时存在」的过渡态误读为指标 |
| **D4** | I2 的用例数 | 任务书/plan §4.1：「**13 例**既有单测」 | 实测 **9 例**（`grep -c "  it(" = 9`，jest 报 `Tests: 9 passed`），全部覆盖 `createAssignment — Q9` 分支 | 13 是 plan 的静态估计（`describe` 内 9 例 + 上游 4 例的合计口径），**不影响本项判定**：改路径后真跑 9/9 绿 |
| **D5** | **一次不可复现的瞬时失败**（如实登记） | 定向测试须 0 failed | 第一遍定向里 `question.test.js` 出现 **1 次** `1 failed / 12 passed`（我未捕获到断言明细，`grep` 未匹配到失败块）。随后：该套件**连跑 3 次全绿**、**序列复现**（`ownership-guards`(62 例) → `question`）**×2 全绿**、**冻结 before 树**（`git archive HEAD server`，源文件 sha `30793987…`）**连跑 2 次全绿**、第二遍 23 套件全绿 | 判为**环境/DB 瞬时抖动**，**不是拆分回归**：before 树与新树同样不可复现；且第二遍全量定向 268/0。**未把该次失败粉饰为通过** —— 请 C 在全量回归中作为重点观察项 |
| **D6** | banner 与「旧路径 grep = 0」的字面冲突（承 step 8 的 D3） | plan §10-B16 要求 `grep -rnE "from '…teacherController\.js'"` = 0 | **规格符口径 = 0**；**文本口径 = 12**（12 条 banner 的溯源注解） | banner 是溯源注释、不是 import；判据应表述为「无 import 指向已删模块」。C 若用裸 `grep teacherController.js` 会命中 12 条 banner |
| **D7** | interface 侧 banner 里出现「infrastructure/」字样 | —— | interface barrel 的 banner 含「★ 绝不 re-export infrastructure/ 的任何名字」纪律提示 | 与 step 8 D7 同型：**注释不是规格符**；§8 的 spec 级扫描已把它排除（=0）。**勿据裸 grep 判违规** |
| **D8** | plan §10-B11 的自检列 | 「`students.js` 的 `res.status(403)` = **8**」 | 实测 `students.js` = **6**、`classes.js` = **8**、`assignments.js` = **2**，**全模块合计 16** | 与 plan §3.3 的 16 处清单（`:1064 :1070 :1118 :1140 :1171 :1204` 共 6 处在 students）**逐条一致**；B11 列的数字是笔误，**总判据 16 成立** |
| **D9** | 分批提交 | plan §9「每批一个提交」 | 本轮硬约束**禁止任何 git 写操作** ⇒ 批次只作为执行/验证阶段（§4 已留每批读数）；提交由 Captain 执行 | 约束冲突时以任务书硬约束为准 |

### 13.1 「一处不许顺手改」逐条落实（实测）

| 项 | 判据 | 实测 |
|---|---|---|
| `code: 1007`（Q9 软确认） | `grep -c "code: 1007"` | `assignments.js` = **1**（未统一成 1001） |
| `:201` 的 ES6 简写 | `grep -c "{ code: 1001, message, data: null }"` | `grade.js` = **1**（未被展开成 `message: message`） |
| `gradeProject` 死代码（60 行） | 逐字带进 `grade.js`，**不加 export** | 块 159-218：**仅 `:204` 的 import 规格符 1 行不同**，其余逐字节相同；export 修饰 = 0 |
| `getMyClasses` 孤儿导出 | 保留且仍在导出面 | `students.js` 有；`Object.keys` 含 `getMyClasses`；**未加路由** |
| S5 里已失效的 `reviewController.js:315-331` 注释 | 逐字保留 | `assignments.js` = **1** 处 |
| `console.*` 不得改 logger | 冻结源 9 处 → 新树 9 处 | **9 == 9**（exam-parse 6 / grade 3） |
| `fs.mkdirSync` 模块加载期副作用 | 逐字在 | `uploads.js` = **1**；加载后 `server/uploads/materials` 存在 |
| 2 个死绑定 | 不得复制 | `DEFAULT_MAX_SCORE`=0 / `getTeamTeacherIds`=0 |
| 源文件 11 行 import 头 | 不得整段复制 | 每文件只写其所需（AST 推导，**过度导入 = 0**） |

---

## 14 给 Agent C 的验证指令（可复现，全部只读 + 自建装置）

> 锚点：HEAD = `5764500`（本轮改动**未提交**，工作树即终态）。源文件已删 ⇒ 用 `git show HEAD:server/src/controllers/teacherController.js` 重建（**必须** = `30793987…` / **1336** 行；若不等则锚点无效，先找我）。

| # | 验什么 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| **W1** | 版本锚点 | `git show HEAD:server/src/controllers/teacherController.js \| shasum -a 256; … \| wc -l`；`git show HEAD:server/src/routes/teacher.js \| sed -n '4p'` | `30793987…` / 1336；旧第 4 行 = `import * as teacher from '../controllers/teacherController.js';` |
| **W2** | **D2 补测的可证伪性**（★重点，我在 §2 给了双向证据） | ① 跑 `tc-b0-switch-class-school` → 8/8 绿；② 自建变异副本把 `:963`（**新树里是 `interface/http/controllers/teacher/classes.js:145`**）的 `{teacherId, classId}` 放宽为 `{teacherId}` → 必须 **1 failed（仅 T-A8）** | ① 8/8；② 红且**红面唯一**；消息差异应为 `无权操作` → `你不属于目标学校` |
| **W3** | **逐块判等（核心）** | 自建切片：43 块（40 具名 + `uploadDir`/`storage`/`upload`）在 12 个新文件里字节定位；`export const` 声明行数 = 30 | **41/43 全等**；**仅 `:137`（questions.js）与 `:204`（grade.js）两行** import 规格符不同，且**每一行都落在 plan §6.4/§10-B7/B2 的明文要求内**；多一行即判负 |
| **W4** | 反向校验 | 删除全部切片 + banner + import + export 块后，残留**非空白**行 | **0**（我的口径：body sha == 源区间 sha，10/10） |
| **W5** | **导出面 + I1 遮蔽** | `PORT=0 node --input-type=module -e "…"` 分别 import T8/T12 → `Object.keys().sort()`；`{...t8,...t12}` | **T8 = 26 / T12 = 4 / ∩ = ∅ / 并集 = 30**，与 §7.1 的 30 名**逐字相等**；`gradeProject` **不在**导出面（它在 `grade.js` 内但无 export） |
| **W6** | 声明行 export 审计 | 12 文件扫 `^export ` / `export \*` / `export default` | `export const` = **30**；`export {` 仅 `guards.js` 1 处（6 名）；其余 0 |
| **W7** | **红线②（F4 盲区）** | 对 `server/src/interface/**` 扫 **spec 级** `(import\|export)…from '<含 infrastructure>'`（**勿用裸 grep**，banner 里含该字样） | **0**；并逐条人读 8 个 interface 文件的 import（全部 `../../../../utils|domain|controllers` + 同层 `./guards.js`） |
| **W8** | 路由契约 | `diff <(git show HEAD:server/src/routes/teacher.js \| grep -n 'teacher\.' \| cut -d: -f2-) <(grep -n 'teacher\.' server/src/routes/teacher.js \| cut -d: -f2-)`；并核 29 条的 方法/路径/中间件 | **逐字节相同（29 行）**；`router.use(auth, requireRole('teacher'))` 与挂载前缀 `/api/teacher` 未动 |
| **W9** | **I2 真跑** | 单跑 `test/unit/assignment-q9-branches.test.js` | **9 passed / 0 failed**（★**不能只看 bind-check**：它对该文件只有 `unresolved（仅登记）`） |
| **W10** | 门禁七项 | §9 的 7 条命令（**含 `cycle-check --root client/src`**） | 违规 **0** / 未分层 **42** / GodFile **1**（名单只剩 `Doc.vue`）/ SCC **0** / hard **0-0-0** / bind **0**（unresolved 4 / external 1）/ eslint **0-57** / lint-check **exit 0** |
| **W11** | **lint 迁移三元组** | `node scripts/gates/lint-check.mjs --json` | 总数 **31 → 29**；`resolved` 2（本轮 1 + step 8 的 `count`）；**本轮 fresh = 0**；本轮条目 = `no-unused-vars` + `gradeProject` + `const gradeProject = async (req, res) => {`，旧 `teacherController.js:159` → 新 `infrastructure/teacher/grade.js:14`；**基线 sha `678d3d51…` 与 mtime `Oct 11 13:22:03` 未变**（未执行 `--update-baseline`） |
| **W12** | **路径探针复查** | 自建（我的 `/tmp/b9-frozen/pathprobe.mjs` 仅供参考）：3 根 + 4 表达式 + 深度模拟 + 副作用 + 漂移目录 | 3 根 = `<repo>/server/uploads{,/projects,/project-questions}`；4 表达式**深度无关**；`server/uploads/materials` 存在；`server/src/**/uploads` = **0** |
| **W13** | 行为对拍（plan §7.3/§7.4，四维） | 两独立进程：BEFORE（`git archive 5764500 server`）/ AFTER（两个 barrel），F00-F31 四维（返值 + 终态 DB + 有序调用日志 + fetch 日志）`cmp` | byte-identical；先过「before 跑两次相等」；**fetchLog 每条 URL 命中桩**（硬禁网）；装置自检 + 4 处变异反证必报差异 |
| **W14** | 定向回归（可选） | §11 的 23 条单套件命令 | 23 套件 / **268 例 / 0 failed**（数字会随夹具变化，**不作判据**） |
| **W15** | 全量回归 | `ROUND=NN LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`（**先查空序号**） | 4 处 `Test Suites:` + `failed=0`；用例数应比 B0 轮 **+1**（T-A8） |
| **W16** | 越界自查 | `git status --porcelain`；`find server/src server/test -newermt '<B 开始时刻>'` | 只有：12 新 + 3 改（`routes/teacher.js`、2 个测试）+ 1 删 + 本报告；`scripts/gates/`、`docs/pipeline/lint-baseline.json`、`client/dist`、`tests/` mtime 未变 |

**判定纪律**：W2 / W3 / W5 / W7 / W9 / W10 / W11 / W12 是本轮核心判据；任一不符 → 回流我，**不得**改测试或改门禁迁就实现。
**★C 的对抗性重点**：① **W2 是本轮新增的、唯一能证明 D2 闭环的判据**（在**新树**上重跑变异，靶点已从 `teacherController.js:963` 迁到 `classes.js:18`）；② **W9 是 bind-check 的盲区补位**；③ **W5 必须显式断言 `gradeProject` 不在导出面**（多一个就变 31 名）；④ 若用裸 `grep teacherController` 会命中 **12 条 banner**（§12-D6/D7）。

---

## 15 局限声明（诚实边界）

1. **未跑全量回归**（C 的职责）：§11 是定向（23 个独立进程 / 268 例），**不等于全量**。四段摘要与 `failed` 计数由 C 在 `ROUND=NN` 下产出。
2. **未做行为对拍**：plan §7.2/§7.3 的两独立进程四维对拍（F00-F31）与变异反证**未由我执行**（属 C 的装置）。我的替代证据是**41/43 块逐字节判等 + 反向零未匹配 + 真 import 导出面（30 名集合相等）+ I1 名字闭包 + 23 套件行为回归**。**静态判等覆盖不到「同一结果、不同写序」的运行时漂移** —— 这正是 W13 的必要性。
3. **§11 的 1 次瞬时失败未定位根因**（§12-D5）：未捕获断言明细；before 树同样不可复现 ⇒ 判为环境抖动，但**如实保留**为 C 的重点观察项。
4. **中间态未取全部门禁读数**（§12-D3）：B1/B2 期间源文件与新文件并存，该状态的 check-layers/arch 读数**不代表任何终态**，我刻意未取（避免误读）；已取的 bind-check 三点读数见 §4.3。
5. **两处文档层面的欠债（承 plan §12-6，未加重也未修复）**：① 4 个 infrastructure 文件含 HTTP 语义（`res.status/json`、`res.writeHead`）；② 7 个 interface 内容文件直连 Prisma（71 处 `prisma.*`）。二者在源文件今日就存在（fat controller），拆分只是**显式化**；修复需要真正的用例层重写（改行为），**不在本步**。
6. **依赖邻居仍未分层**（承 plan §12-8）：`utils/{prisma,logger,scoring,projectPaths,fileTree}.js`、`constants.js`、`controllers/teamController.js` 仍是 unlayered，`domain/errors.js` 是 domain —— 12 个新文件持续依赖它们（这正是 0 违规的原因之一）。若后续迁它们的层，本步的相对路径需同步调整（**不是本步缺陷**）。
7. **`projectPaths.js` 的 `ROOT` 仍由 `utils/` 自身位置推出**（承 C 的 R5）：搬移把「控制器深度相关」换成「`utils/` 深度相关」，§12 的探针证明**当前 5 个站点深度无关**；移动该文件会同时坏掉这些点，届时以那一步的门禁/探针读数为准。
8. **`getMyClasses` 的线上可达性仍未取证**（承 plan §12-9）：代码级实测「无路由、前端 0 命中」，但历史页面/脚本是否仍调用未查访问日志 ⇒ **一律保留**，未加路由、未删导出。
9. **`gradeProject` 的「零引用」仍是静态证据**（承 plan §12-10）：AST 闭包 0 消费者 + lint 基线 + eslint warn；本轮**原样搬走**（`grade.js`），未删、未加 export。
10. **本轮未审计 `server/test/e2e/*.spec.js`**（Playwright，不在 jest 口径）；`tests/ui-redesign-verify/rig-server/` 的冻结副本**未触碰**（它仍是「全仓 grep `teacherController`」的第二组命中来源）。
