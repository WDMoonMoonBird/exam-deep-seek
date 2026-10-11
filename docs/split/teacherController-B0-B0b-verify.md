# teacherController B0 / B0b 独立验证报告（Agent C · step 9 第 1 轮）

- **被验对象**：`c3b9e3f`（B0 · 6 套件 / 23 例契约测试）＋ `c285022`（B0b · 路径常量化 + 删两个死绑定；1338 → 1336 行）
- **验证者**：Agent C（独立验证 / 对抗性）｜ **立场**：不采信 Agent B 自测，全部判据自建装置复算；主动证伪
- **日期**：2026-10-11 ｜ **技能**：tech-test-automation
- **装置**：全部落在 `/tmp`（`c-cov.mjs` `c-covmatrix.mjs` `c-sens2.mjs` `c-deadbind.mjs` `c-probe.mjs` `c-probe-cmp3.mjs` `c-mut*.sh` `c-sideeffect.sh`），**仓库内零新增脚本**；唯一写入 = 本报告 + `docs/split/test-round-22.log`
- **约束遵守**：纯只读（除本报告与回归日志）｜ 无任何 git 写操作（无 clean/stash/checkout/reset/restore/commit）｜ **未联网**、未装依赖 ｜ 未碰 :5173 / :3000 / `client/dist` / `tests/` ｜ 测试显式 `PORT=0` + `DATABASE_URL=…exam_system_test` ｜ **未刷新 lint 基线**

---

## V1 版本锚点（自证）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | `git rev-parse HEAD` | `c285022…` | `c285022717585a659eec6516b810fae13e01b15f` | ✅ |
| 2 | `git status --porcelain -uno` | 空 | **空** | ✅ |
| 3 | `c3b9e3f` 内容 | 仅 6 个测试文件 | 6 文件 / **+846** 行，无产品代码 | ✅ |
| 4 | `c285022` 内容 | 产品代码 + 报告 | `teacherController.js`(+8/−10) + `docs/split/teacherController-B0-B0b.md`(+557) | ✅ |
| 5 | **B0b 前产品代码 sha256** | `729a83b0…` | `729a83b064bdac822bf52f5713ecfc3893d842c57754dcd7eebb076d30a60764`（`git show c3b9e3f:server/src/controllers/teacherController.js`） | ✅ **基准成立** |
| 6 | 工作树 sha256 / 行数 | `30793987…` / 1336 | `307939875e16654f5c435eb923309292443737291131f682e984cc00c4b36823` / **1336**（前 1338） | ✅ |
| 7 | `git diff HEAD -- server/test/integration/` | 空（测试未被追改） | 空；6 个 tc-b0 文件均 `git ls-files` 已跟踪 | ✅ |
| 8 | 文本计数（次要口径） | `__dirname`/`fileURLToPath`/`DEFAULT_MAX_SCORE`/`getTeamTeacherIds` = 0 | **0 / 0 / 0 / 0**（改前分别 6 / 2 / 1 / 1） | ✅ |

---

## V2 B0 单跑（我执行）

```
cd server && PORT=0 DATABASE_URL=…exam_system_test NODE_OPTIONS=--experimental-vm-modules \
  ./node_modules/.bin/jest --config test/jest.config.js --runInBand --forceExit test/integration/tc-b0-
Test Suites: 6 passed, 6 total
Tests:       23 passed, 23 total      ← 0 failed ；jest exit = 0
```

**逐套件单跑复核**（6 次独立进程）：6/6 全部 `exit=0`，每次产出 1 个 coverage/结果文件。
静态计数：6 个文件共 **23 个 `it(`**（7+3+4+3+2+4）＝ jest 报的 23；共 **123 个 `expect(`**。
`test/integration/helpers.js` = `supertest(app)` **直连真实 app**，**无任何控制器替身** ⇒ 用例走的是真实 HTTP + 中间件 + 路由栈。

| 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|
| suites / tests / failed | 6 / 23 / 0 | **6 / 23 / 0**，exit 0 | ✅ |

---

## V3 ★独立覆盖自证（自建装置，未复用 B 的脚本）

**装置**：`NODE_V8_COVERAGE=/tmp/c-cov` 跑 6 套件 → 自写解析器 `/tmp/c-cov.mjs`（acorn 重解析磁盘源码取行号；**逐 context 独立建 range 树**，再跨 context 取 max）。

### 3.1 ★「最内层 range」说法的独立判定 —— **成立，且量级被实测确认**

B 称：「用外层 range 判定会把 1338 行全算成已覆盖」。我用**同一份 coverage 数据**跑两种口径对照：

| 口径 | 全文件「已覆盖」行数 | 说明 |
|---|---|---|
| **A｜任一包含该行的 range 的 `count>0`**（B 所说的错误口径） | **1336 / 1336**（唯一未覆盖 = 末尾空行） | 模块顶层 range 覆盖全文件 ⇒ **每一行都"已覆盖"** |
| **B｜最内层 range 的 `count`**（正确口径） | **325 / 1336** | 有分辨力 |

- **判据：A 口径确实产出「全文件已覆盖」的假象（1336/1336）**，B 的说法**成立**，不是夸大。
- 补充加严：即便把口径放宽到「行内任意字符的最内层 count>0」（`B2`，见 3.5），也只有 **364/1336** —— **离"全部"差 972 行**。⇒ 该说法在两种最内层变体下都成立。
- **★跨 context 取 max 的必要性（我独立复现）**：本文件在 6 个 VM context 中各加载一次，**单 context 的内层覆盖行数 = 217 / 193 / 179 / 193 / 189 / 179**（最多 217/1336）。**不取 max 会漏掉约 2/3 的目标行**；而 6 个 context 的「外层口径」全部是 1336。⇒ B 的两条口径缺一不可，实测支持。

### 3.2 8 个目标函数逐行命中（我的实测，跨 6 context 取 max，最内层口径）

| 函数 | 行区间 | 行数 | **命中行** | fnMax | 未命中行 |
|---|---|---|---|---|---|
| `switchSchool` | L71-81 | 11 | **8** | 1 | 78,79,80 |
| `getProjectFiles` | L124-157 | 34 | **29** | 6 | 148,149,154,155,156 |
| `lockAssignment` | L792-809 | 18 | **15** | 4 | 806,807,808 |
| `getAllTeachers` | L813-828 | 16 | **13** | 3 | 825,826,827 |
| `getMySchools` | L832-843 | 12 | **9** | 2 | 840,841,842 |
| `switchClassSchool` | L946-1001 | 56 | **53** | **10** | 998,999,1000 |
| `uploadMaterial` | L1313-1320 | 8 | **8/8** | 3 | **无** |
| `parseExamStream` | L395-422 | 28 | **25** | 4 | 417,418,419 |

合计 **183 行 / 命中 160 行 / 未命中 23 行**。**逐行核对：23 行未命中 100% 落在 `catch` / 错误兜底分支**（5 处 500 catch + `getProjectFiles` 内层 `:148-149` 与外层 `:154-156` catch + `parseExamStream` SSE `phase:'error'` `:417-419`）。⇒ **可达的业务分支行全部真执行过**。

### 3.3 逐套件归因矩阵（6 次独立单跑，我自建）—— 与 B §3.3 **逐格一致**

`fnMax(命中行/总行)`：

| 套件 | switchSchool | getProjectFiles | lockAssignment | getAllTeachers | getMySchools | switchClassSchool | uploadMaterial | parseExamStream |
|---|---|---|---|---|---|---|---|---|
| switch-class-school | 1(1/11) | 1(1/34) | 1(1/18) | 1(1/16) | 1(1/12) | **10(53/56)** | 1(1/8) | 1(1/28) |
| lock-assignment | 1(1/11) | 1(1/34) | **4(15/18)** | 1(1/16) | 1(1/12) | 1(1/56) | 1(1/8) | 1(1/28) |
| project-files | 1(1/11) | **6(29/34)** | 1(1/18) | 1(1/16) | 1(1/12) | 1(1/56) | 1(1/8) | 1(1/28) |
| upload-material | 1(1/11) | 1(1/34) | 1(1/18) | 1(1/16) | 1(1/12) | 1(1/56) | **3(8/8)** | 1(1/28) |
| parse-exam-stream | 1(1/11) | 1(1/34) | 1(1/18) | 1(1/16) | 1(1/12) | 1(1/56) | 1(1/8) | **4(25/28)** |
| school-teachers | **1(8/11)** | 1(1/34) | 1(1/18) | **3(13/16)** | **2(9/12)** | 1(1/56) | 1(1/8) | 1(1/28) |

**归因干净**：每个目标函数只被它自己的套件打亮，无跨套件溢出；`1(1/N)` = 仅函数声明行被模块顶层计数命中 ⇒ 该套件**确实没打到**该函数。⇒ **23 例真执行到 8 个目标函数**，不是"状态码对"。

### 3.4 阴性对照（解析器有牙）

| 未打靶函数 | 行区间 | 命中行/总行 |
|---|---|---|
| `gradeProject`（死代码） | L159-218 | **1/60** |
| `createAssignment` | L718-790 | **1/73** |
| `getAssignments` | L578-697 | **1/120** |
| `updateStudent` / `addStudent` / `batchAddStudents` / `deleteStudent` | — | 1/58 · 1/32 · 1/94 · 1/19 |

### 3.5 判据敏感性（我加做）：行首口径 vs 行内最大口径

| 口径 | 全文件覆盖 | 8 目标的未命中集合 |
|---|---|---|
| **B1｜行首非空白字符偏移**（B 与 v8-to-istanbul 口径） | 325/1336 | 见 3.2 |
| **B2｜行内任意偏移的最大最内层 count** | 364/1336 | 与 B1 **仅差「`}` 收尾行」**（如 switchClassSchool 由 [998,999,1000] 变 [998,999]） |

⇒ 两种口径下**未覆盖的可执行语句行完全相同**，「逐行命中」结论**不依赖口径选择**。

### 3.6 ⚠️ 发现的**报告缺陷**（非实现缺陷，不阻断）

B §3.2 表的「**命中行**」一列**误填为总行数**（11 / 34 / 18 / 16 / 12 / 56 / 8 / 28），与同行「未命中行」自相矛盾，也与它自己 §3.3 的 `8/11 · 29/34 · 15/18 · 13/16 · 9/12 · 53/56 · 8/8 · 25/28` 矛盾。正确值 = **8 / 29 / 15 / 13 / 9 / 53 / 8 / 25**（合计 **160**），未命中 = **23**；§3.5 那句「合计 183 行，未命中 23 行」里的 183 是**总行数**。
⇒ **我的独立实测与 §3.3 矩阵逐格相同**，数据本身无误；仅 §3.2 表列标签/取值错位。列为 **D1（低·文档）**。

---

## V4 ★守卫阶梯复算（`switchClassSchool`，我自建装置）

我的装置对 946–1001 逐行取最内层 count，得到：

```
947:10  951:7   958:6   961:5   965:4   972:3   973:2 … 994:2   （995:10 = catch 行外层计数；998,999,1000 = 0）
```

| 级 | 守卫行 | 差额 | B 的对应用例归因 | 我的复算 |
|---|---|---|---|---|
| 入口 | :947 = **10** | — | A1×3 + A2..A6×5 + A7×2 = 10 | ✅ 一致 |
| ① | :950 10 → :951 **7** | **3** | `:950` 请选择目标学校 ← T-A1 三次入参 | ✅ |
| ② | :957 7 → :958 **6** | **1** | `:957` 班级不存在 ← T-A2 | ✅ |
| ③ | :960 6 → :961 **5** | **1** | `:960` 目标学校与当前学校相同 ← T-A3 | ✅ |
| ④ | :964 5 → :965 **4** | **1** | `:964` 无权操作 ← T-A4 | ✅ |
| ⑤ | :971 4 → :972 **3** | **1** | `:971` 无权操作当前学校 ← T-A5 | ✅ |
| ⑥ | :972 3 → :973 **2** | **1** | `:972` 你不属于目标学校 ← T-A6 | ✅ |
| ⑦ | :973–:994 = **2** | — | 200 分支往返 2 次 ← T-A7 | ✅ |

**⇒ 阶梯 10→7→6→5→4→3→2 完全复现，每级差额 = 对应用例数；单调递减、无跳级、无被前置分支兜住。** 该函数被**同一套件内 7 例逐条打到 6 层守卫 + 2 次成功**。
（另：阶梯**只**在 `switch-class-school` 套件出现，其余 5 套件的该函数 fnMax=1 ⇒ 归因唯一。）

---

## V5 ★自建变异反证（7 处，**与 B 的 6 处无一重复**）

**装置**：`/tmp/c-mutbase`（`server` 全量副本，排除 `node_modules` 后软链；控制器 sha 前置断言 `307939875e16654f`）+ **每次变异前从 `/tmp/c-pristine.js` 复位**（先断言靶点出现次数**恰为 1**，否则报 `DEVICE INVALID` 并跳过）。每个变异**跑全部 6 个套件**。

| # | 变异（我设计） | 靶点 | 预期 | **实测** | 结论 |
|---|---|---|---|---|---|
| X0 | 无（pristine 基线） | — | 23 绿 | **23 passed / 0 failed** | ✅ 装置自证 |
| **X1** | `:950` `if (!newSchoolId)` → `if (newSchoolId === undefined)` | T-A1 | 只红 T-A1 | **1 failed / 22 passed**，红面 = `switch-class-school` **仅此 1 套件**；红例 = **T-A1** | ✅ 精确 |
| **X2** | `:134` `if (!fs.existsSync(dir))` → `if (!dir)` | T-C4 | 只红 T-C4 | **1 failed**，红面 = `project-files` 仅此；红例 = **T-C4** | ✅ 精确 |
| **X3** | `:1316` `if (!req.file)` → `if (!req.file && !req.body)` | T-D2 | 只红 T-D2 | **1 failed**，红面 = `upload-material` 仅此；红例 = **T-D2** | ✅ 精确 |
| **X4′** | `:404` `'Content-Type': 'text/event-stream'` → `'application/json'` | T-E2 | 只红 T-E2 | **1 failed**，红面 = `parse-exam-stream` 仅此；红例 = **T-E2** | ✅ 精确 |
| **X5** | `:817` `{ some: { schoolId } }` → `{ some: {} }` | T-F4 | 只红 T-F4 | **1 failed**，红面 = `school-teachers` 仅此；红例 = **T-F4** | ✅ 精确 |
| **X7** | `:986` `teamClass.deleteMany({where:{classId}})` → `{classId, teamId:-1}` | T-A7 | 只红 T-A7 | **1 failed**，红面 = `switch-class-school` 仅此；红例 = **T-A7** | ✅ 精确 |
| **X6** | `:963` `findFirst({where:{teacherId, classId}})` → `{where:{teacherId}}` | — | **我刻意设计为"存活探针"** | **23 passed / 0 failed ⇒ 存活（未 RED）** | ⚠️ **见 D2** |

- **6/6 期望 RED 的变异全部 RED，且每一处都只打红 1 个套件 / 1 条用例**（B 的 M4 会红 2 例；我的 6 处全部是单例红面，分辨力更强）。
- **X6 是"哑牙"实证**：把「必须是**本班**教师」放宽成「只要是**任一班的**教师」，23 例**全绿**。原因是 T-A4 的 `tOutsider` 在 `teacherClass` 表里**一行都没有**（`!tc` 仍成立），因此该用例只钉住"完全无班级关系"，**未钉住 classId 作用域**。⇒ 见 **D2**。
  ⚠️ 该变异**未联网、未写仓库**（在 /tmp 副本内，跑完即复位并断言 sha 回到 `307939875e16654f`）。

---

## V6 ★B0b 等价性复核（自建探针 + 反向对照 + 变异正控 + 副作用正控）

**装置**：`/tmp/c-before-tree` = `git archive c3b9e3f server`（控制器 sha **前置断言 = 729a83b0…✅**）；`/tmp/c-after-tree` = 工作树 `server` 副本（**30793987…✅**）。探针用 **acorn 定位 5 个站点**（按"被赋值变量名 + 所属顶层函数"锚定，**不依赖行号**），表达式**逐字切片**后在真 `path` + **该树自己的** `utils/projectPaths.js` 常量 + 可替换 `__dirname` 下求值。

站点（两树各 5 个，锚点与 B 一致但装置独立）：

| 站点 | before 表达式（含行号） | after 表达式（含行号） | usesDirname |
|---|---|---|---|
| `getProjectFiles.dir` | `:133` `path.join(__dirname,'../../uploads',q.attachmentUrl)` | `:133` `path.join(UPLOADS_ROOT,q.attachmentUrl)` | true → **false** |
| `gradeProject.standardDir` | `:188` `q.attachmentUrl ? path.join(__dirname,'../../uploads',q.attachmentUrl) : ''` | `:188` `q.attachmentUrl ? path.join(UPLOADS_ROOT,q.attachmentUrl) : ''` | true → **false** |
| `createQuestion.projectsRoot` | `:249` `path.resolve(__dirname,'../../uploads/projects')` | `:249` `PROJECTS_ROOT` | true → **false** |
| `createQuestion.destDir` | `:254` `path.join(__dirname,'../../uploads/project-questions',String(q.id))` | `:254` `path.join(STANDARDS_ROOT,String(q.id))` | true → **false** |
| `uploadDir.uploadDir` | `:1293` `path.join(__dirname,'../../uploads/materials')` | `:1291` `path.join(UPLOADS_ROOT,'materials')` | true → **false** |

| 判据 | 期望 | **实测** | 结论 |
|---|---|---|---|
| **A｜before.real vs after.real**（树根归一化为 `<TREE>`） | 5/5 相等 | **EQUAL = 5 / DIFF = 0** | ✅ |
| **B｜after 深度无关性**（宿主换成 `interface/http/controllers/teacher` 与 `infrastructure/teacher`） | 5/5 不变 | **EQUAL = 5 / DIFF = 0**，5 个表达式 `usesDirname` 全 false | ✅ |
| **C｜★反向对照：同探针在 before 树上"真实宿主 vs 模拟宿主"** | **必须报差异**（否则 = 恒等装置） | **DIFF = 5 / EQUAL = 0** | ✅ **探针有牙** |
| **D｜变异正控（我自建 3 处，非照抄 B）** | 见下 | 见下 | ✅ |

**C 的漂移形态**（与 plan §1.3 的预测**逐字相同**）：

| 模拟宿主 | before 树解析结果 |
|---|---|
| `interface/http/controllers/teacher` | `<TREE>/server/src/**interface/http**/uploads/…` ⇒ **多 4 层** ❌ |
| `infrastructure/teacher` | `<TREE>/server/src/uploads/…` ⇒ **多 2 层** ❌ |

**D 的 3 处变异（设计为"2 处必报差异 + 1 处等价改写必不报"）**：

| 变异 | 内容 | real 宿主 | 深度模拟 | 判定 |
|---|---|---|---|---|
| **MUT-a** | `getProjectFiles`：`UPLOADS_ROOT` → `PROJECTS_ROOT`（**用错常量**） | **DIFF** | **DIFF** | ✅ 差异**只**落在该站点（其余 4 站点 same） |
| **MUT-b** | `uploadDir`：改回 `path.join(__dirname,'../../uploads/materials')`（**重新引入宿主依赖**） | same | **DIFF** | ✅ 证明**判据 B 有牙**；差异只落在该站点 |
| **MUT-c** | `destDir`：`path.join(STANDARDS_ROOT,String(q.id))` → `path.join(UPLOADS_ROOT,'project-questions',String(q.id))`（**语义等价改写**） | same | same | ✅ 探针**不误报**等价改写 |

**E｜副作用正控（我实测，两棵树各真 import 一次）**：

| 检查 | before 树 | after 树 |
|---|---|---|
| import 前 `server/uploads` 是否存在 | NO | NO |
| import 后 `<tree>/server/uploads/materials` | **YES ✅** | **YES ✅**（模块加载期 `mkdirSync` 落点未漂移） |
| 真 import 的导出面 `Object.keys().length` | **30** | **30**（且**名字集合逐字相同**，见 V7） |
| `<tree>/server/src` 下漂移目录数 | **0** | **0** |
| **仓库** `server/src/**/uploads` | — | **0 ✅** |
| 仓库 `server/uploads/materials` | 存在、**空**（T-D3 自清成功） | — |
| 仓库 `server/uploads/project-questions` 新增残留 | **0**（父目录 mtime 更新但无新增子目录 ⇒ T-C3 自清成功） | — |

**B 请我重点复核的 3 处 —— 逐条结论**：
1. **`path.resolve(绝对路径) === 该绝对路径` 是否成立**：**成立**。探针在 `PROJECTS_ROOT`（由 `path.join` 产出、已是绝对规范路径）上实测 `path.resolve` 与裸常量**取值相同**（判据 A 的 `createQuestion.projectsRoot` = EQUAL）。⇒ 裸常量替换**等价**。
2. **「最内层 range」口径是否成立**：**成立**，且我量化了错误口径的后果（1336/1336 vs 325/1336，见 V3.1）。
3. **守卫阶梯可否独立复现**：**可以，逐级一致**（见 V4）。

---

## V7 ★两个死绑定的裁决复核（Captain 五条硬条件，逐条独立核）

### 7.1 条件 1 —— AST 引用计数（**自写 acorn 装置，未用 grep**）

装置 `/tmp/c-deadbind.mjs`：遍历 AST 统计标识符引用，**排除** import/export 说明符、成员表达式属性名、非简写对象键名、声明位、标签；**简写属性 `{ message }` 计为引用**。在 **B0b 前的冻结源码（`729a83b0…`）** 上复算：

| 名字 | AST 引用计数 | 引用行 | 判定 |
|---|---|---|---|
| `DEFAULT_MAX_SCORE` | **0** | — | **死绑定** ✅ |
| `getTeamTeacherIds` | **0** | — | **死绑定** ✅ |
| `ABNORMAL_FEEDBACK`（同语句） | 1 | `:442` | 在用 |
| `getVisibleClassIds`（同语句） | 7 | `:26,32,49,537,582,849,1012` | 在用 |
| `getMyTeamIds`（同语句） | 1 | `:56` | 在用 |

⇒ **与 B、与 plan §1.5-2、与 lint 基线三方一致**。

### 7.2 ★条件 2 —— 两条 import 语句删名后**是否变空**（本轮最关键的裁决点）

我的 AST 装置直接判定"删掉死名后剩余说明符数"：

| 语句 | 原说明符 | 删名后剩余 | 剩余名的引用数 | **语句是否变空？** |
|---|---|---|---|---|
| `:7` `import { DEFAULT_MAX_SCORE, ABNORMAL_FEEDBACK } from '../constants.js'` | 2 | **`ABNORMAL_FEEDBACK`（1 个）** | **1**（`:442`） | **否 —— 保留** ✅ |
| `:9` `import { getVisibleClassIds, getTeamTeacherIds, getMyTeamIds } from './teamController.js'` | 3 | **`getVisibleClassIds` + `getMyTeamIds`（2 个）** | **7 / 1** | **否 —— 保留** ✅ |

**补充（B 未见的一层，我加做）**：AST 证明 `../constants.js` 在本文件中**只有 `:7` 一条** import 语句、`./teamController.js` **只有 `:9` 一条**。⇒ 由于两条语句**都不变空**，**两个模块的加载副作用边完全保留**，条件 2 的「语句会变空 → 可能改变模块加载副作用」分支**在本轮确实不适用**。
改后源码的 AST 复核：`:7` 剩 1 个说明符、`:9` 剩 2 个说明符，两个名字（`DEFAULT_MAX_SCORE`/`getTeamTeacherIds`）在改后文件中**引用计数 = 0 且已无绑定**。

### 7.3 条件 3 —— 预期读数（我实测）

| 判据 | 期望 | **实测** | 结论 |
|---|---|---|---|
| lint (b) 基线总数 | 31 → **29** | `baseline.total=31`、`counts['no-unused-vars']=29` | ✅ |
| `resolved` | 恰为本轮 2 条 | **3 条** = 本轮 2 条（`DEFAULT_MAX_SCORE` / `getTeamTeacherIds`）**＋ step 8 遗留 1 条**（`reviewController.js · count`）⇒ **非本轮产物 0 条，无意外条目** | ✅ |
| `newViolations` 中属于本轮 | **0** | 仅 **1 条** = `server/src/interface/http/controllers/review/batch.js:78 · count`（**step 8 迁移项，非本轮**） ⇒ **本轮 fresh = 0** | ✅ |
| `blockingViolations` / `verdict` / exit | 0 / PASS / 0 | **0 / `PASS` / exit 0** | ✅ |
| **是否刷新基线** | 否 | `lint-baseline.json` sha256 = **`678d3d51af0f446b4e2c7e2c2226c2c3f9915b1572393651efff93812f81804c`**、mtime **`2026-10-11 13:22:03`**（本轮前后逐字未变） | ✅ **未刷新** |
| eslint | 0 error / **57** warn | **205 文件 / error 0 / warn 57**；本文件仅剩 **1 条**（`:159 no-unused-vars · gradeProject`） | ✅ |

### 7.4 条件 4 / 5

| 判据 | 实测 | 结论 |
|---|---|---|
| 条件 4：死名未被复制进新文件 | 本轮**未新建任何产品文件**；改后源文件中两死名出现次数 **0 / 0** | ✅ |
| 条件 5：登记完整 | B §6.3 / §8 已逐条登记名字、原行号、引用计数证据、语句构成、处置理由 | ✅ |

---

## V8 门禁与全量回归

### 8.1 五连门禁 + 两道 lint（我执行）

| 门禁 | 命令 | 期望（入场基线） | **实测** | 结论 |
|---|---|---|---|---|
| 分层守卫 | `node server/scripts/check-layers.mjs` | 违规 0 / 未分层 **43** 不变 | 文件 **106** / **违规 0** / 未分层 **43**；exit 0 | ✅ |
| 架构门禁 | `node scripts/gates/arch-metrics.mjs` | **GodFile 2** 不变 | layerViolations **0/0**、unmigrated **43/43**、**godfileOver800 2/2**、观察带 13/13；名单 `teacherController.js (1336)` / `Doc.vue (1106)`；**结论 PASS** | ✅ |
| 循环依赖 | `node scripts/gates/cycle-check.mjs` | SCC 0 | 106 文件 / **238** 边 / **SCC 0** / 自环 0；PASS | ✅ |
| 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0 | **0/0/0**；PASS | ✅ |
| 绑定门禁 | `node scripts/gates/bind-check.mjs` | 违规 0 | modules **214** / bindings **725** / **BINDING VIOLATIONS 0**；unresolved 4 / external 1（仅登记） | ✅ |
| **lint (a)** | `./node_modules/.bin/eslint client/src server/src -f json` | 0 error / ≤59 warn | **0 error / 57 warn**（205 文件） | ✅ |
| **lint (b)** | `node scripts/gates/lint-check.mjs --json` | 31→29 / 阻断 0 / exit 0 | **31→29**、blocking 0、**verdict PASS**、exit 0、基线 sha 未变 | ✅ |

### 8.2 全量回归

`ROUND=22 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`（**空序号已先查**：`docs/split/` 现有 `test-round-08..21` ⇒ 22 为空）

（判据 = **4 处 `Test Suites:` 摘要 + `failed=0`**，不拿用例数当判据）

| 判据 | 期望 | **实测** | 结论 |
|---|---|---|---|
| 4 处 `Test Suites:` 摘要 | **4 处** | **4 处**（`docs/split/test-round-22.log` L1559 / L1599 / L1688 / L1736） | ✅ |
| `failed` 数 | **0** | **0**（`grep -E '^Tests:.*failed'` 无输出；`^FAIL` = 0） | ✅ |
| 四段读数 | 段1 75 suites / 1021 tests；段2 1/17；段3 1/61；段4 1/21 | **75/1021 · 1/17 · 1/61 · 1/21**（逐字相同） | ✅ |
| 脚本退出码 | 0 | **0** | ✅ |
| 6 个新套件在日志中 | 6 | `grep -c '^PASS test/integration/tc-b0-'` = **6** | ✅ |
| 与 B 的 ROUND=20 / ROUND=21 对比 | 与 B0b 前逐字相同 | **1021 / 17 / 61 / 21，均 0 failed**，与 B 归档读数**逐字一致** | ✅ |

- **用例数变化**：段1 `998 → 1021`（**+23** = 本轮 B0 新增）⇒ **只有新增，既有用例零改动、零删除**（B 的 ROUND=20 归档同为 1021，故 B0b 亦为等价变换）。
- 段1 用时 186.0 s；日志 78 条 `PASS`，无 `FAIL`。

---

## 缺陷分级

| # | 级别 | 位置 | 现象 | 处置建议 |
|---|---|---|---|---|
| **D1** | **低（文档）** | B 报告 §3.2 表 | 「**命中行**」列误填为**总行数**（11/34/18/16/12/56/8/28），与同行「未命中行」及 §3.3 矩阵自相矛盾；正确值 **8/29/15/13/9/53/8/25**（合计 160，未命中 23） | **不改实现**；B 更正该列即可。**不阻断**（我的独立实测与 §3.3 逐格一致） |
| **D2** | **中低（覆盖缺口）** | `teacherController.js:963` 与 `tc-b0-switch-class-school.test.js` T-A4 | 自建变异 **X6**（把 `findFirst({where:{teacherId, classId}})` 放宽为 `{where:{teacherId}}`，即「本班教师」→「任一班教师」）后 **23 例全绿**。T-A4 的 `tOutsider` 在 `teacherClass` 表**无任何行**，故只钉住"完全无班级关系"，未钉住 **classId 作用域** | **不阻断本轮**（B0 的契约面已覆盖 8 条零覆盖路由的主干分支）。建议：后续给 T-A4 补一个"教师在**别的**班有 `teacherClass` 行、但不是本班"的夹具（或在 step 9 搬移后由 C 的 F 项补），使该守卫的作用域可被证伪 |
| **D3** | 低（我方装置） | 我的 X4 首次尝试 | 锚点串含 `\n`，经 shell 传参后 Python 收到字面 `\n` ⇒ `DEVICE INVALID: 0 次`，**装置正确拒绝执行**（未产生假结论） | 已改用 `:404` SSE header 锚点重跑（X4′），结论见 V5。**记录在案以示装置自证有效** |

**无阻断级缺陷**：未发现实现与 plan 契约不符、未发现 B0b 的等价性反例、未发现门禁/基线被软化。

---

## 未做项与残留风险

| # | 项 | 说明 |
|---|---|---|
| R1 | `parseExamStream` 的 SSE `phase:'error'` 分支（`:417-419`）仍零覆盖 | 需 AI 替身抛错。plan §7.4-F11 派给 C；**本轮未补**，登记为下一轮（搬移后）复核项 |
| R2 | `getProjectFiles` 的「文件存在但不可读」兜底（`:148-149`）仍零覆盖 | 需 `chmod 000` 级夹具，稳定性差。plan §7.4-F05；登记 |
| R3 | 5 处 500 `catch`（`switchSchool`/`lockAssignment`/`getAllTeachers`/`getMySchools`/`switchClassSchool`）零覆盖 | 需构造 DB 故障；**同意 B 不为此写脆弱用例**，登记 |
| R4 | `:188`（`gradeProject` 死代码）、`:249`/`:254`（`createQuestion` tempId 分支）**无 B0 行为覆盖** | B0b 对这三处的等价性**仅由我的静态表达式对拍支撑**（V6-A/B）。**无运行时落点证据** ⇒ plan §7.4-F06 的复核仍然必要 |
| R5 | `projectPaths.js` 的 `ROOT` 仍由 `utils/` 自身位置推出 | B0b 把「控制器深度相关」换成「`utils/` 深度相关」：**移动 `projectPaths.js` 会同时坏掉 5 处**。B 已登记（§L6），我确认属实；本步不移动该文件 ⇒ **不构成本轮风险** |
| R6 | D2 的 `classId` 作用域缺口 | 见缺陷表 |
| R7 | 我未逐一复跑「B0b 前」的对应用例（等价性靠 V6 静态对拍 + B0b 后 23/23 绿 + 全量回归逐段数字比对） | 已用 B 自己的 ROUND=20/21 归档做交叉参考；如需更强证据可另跑一次 detached-worktree（本轮未做，**未使用 git 写操作**） |

---

## 结论

### ✅ **PASS** —— 建议**不回流** B，直接进入 step 9 的搬移轮（附 2 项非阻断登记）

**通过判据逐条**：

| # | 判据 | 结果 |
|---|---|---|
| 1 | 源文件 sha `30793987…` / 1336 行 / `__dirname`·`fileURLToPath`·`DEFAULT_MAX_SCORE`·`getTeamTeacherIds` 计数 **0** | ✅ |
| 2 | 6 套件 **23/23 绿**，`failed=0`（我单跑 + 6 次逐套件单跑） | ✅ |
| 3 | **覆盖自证**：8 目标函数除 catch 外逐行命中（跨 6 context 取 max + **最内层 range**，我独立判定该口径**成立** 1336/1336 vs 325/1336）＋ 阴性对照有牙 ＋ 逐套件归因与 B 矩阵**逐格一致** | ✅ |
| 4 | **反证**：自建 **7 处**变异，6 处必红**全部 RED 且各只红 1 例**（比 B 的单例精度更细）；1 处刻意设计为存活探针 ⇒ 挖出 **D2** | ✅ |
| 5 | **B0b**：`before.real vs after.real` **5/5 相等** ＋ after **深度无关 5/5** ＋ **before 反向对照 5/5 报差异**（多 4 层 / 多 2 层，与 plan §1.3 逐字相同）＋ 自建 **3 处变异正控**（2 处差异精确落点 / 1 处等价改写不误报）＋ 副作用正控（两树均建出 `server/uploads/materials`、`server/src/**/uploads` = **0**） | ✅ |
| 6 | 全量回归 **4 处摘要 + `failed=0`** | ✅ **4 处**（75/1021 · 1/17 · 1/61 · 1/21）、**0 failed**、exit 0；与 B 的 ROUND=20/21 逐字相同 |
| 7 | 门禁五连 + 两道 lint 与 B §10 表**逐字相同**（GodFile **2** / 未分层 **43** / 违规 **0** / SCC **0** / bind **0**；eslint **0/57**；lint-check **31→29** exit 0、基线 sha `678d3d51…` **未刷新**） | ✅ |
| 8 | `git status --porcelain -uno` 只有 `M server/src/controllers/teacherController.js`（= B0b，已提交）+ 6 个新增测试（已提交） | ✅ |

**唯一需要 B 动作的事**：更正报告 §3.2 的「命中行」列（D1，文档级，**无需重跑、无需改代码**）。
**建议带入下一轮的登记**：D2（`switchClassSchool` 守卫的 `classId` 作用域未被任何用例证伪）。
