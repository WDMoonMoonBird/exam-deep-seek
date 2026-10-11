> ⚠️ **Captain 注记（2026-10-11，依据 C 的独立验证）**：
> **D1（低·文档）**：本报告 §3.2 的「命中行」列**误填了总行数**，应为 **8 / 29 / 15 / 13 / 9 / 53 / 8 / 25**。结论不受影响。
> ★另：C 已独立证实**本轮的覆盖口径告警成立** —— 同一份 V8 数据下，**外层口径会报 1336/1336 行「全已覆盖」**，而最内层口径为 **325/1336**；
> 跨 context 也必须取 max（单 context 仅 179–217 行）。⇒ B 在 §3.2 加严口径的做法**是必要的，不是过度谨慎**。
> 独立验证报告：`docs/split/teacherController-B0-B0b-verify.md`。
# teacherController 拆分 · B0 补契约测试 + B0b 等价前置重构报告（step 9，B0/B0b 子步）

- **step**: 9（`server/src/controllers/teacherController.js`，1338 行，**最后一个 GodFile**）｜ **子步**: B0（补契约测试）+ B0b（等价前置重构）｜ **日期**: 2026-10-11
- **角色**: Agent B（唯一写者）｜ **方案依据**: `docs/split/teacherController-plan.md` §2.7 / §5.3 / §5.4 / §6.5 / §7.2 / §9-B0/B0b / §10 逐文件执行单 ｜ **范本**: `docs/split/reviewController-B0-tests.md`
- **本轮范围**: **只做 B0 + B0b，不做任何搬移**（未建新模块、未改路由、未删源文件）
- **硬边界遵守**: 未动 `client/`、`tests/`、`scripts/gates/`、`server/scripts/`、`docs/pipeline/lint-baseline.json`、任何既有测试断言；无任何 git 写操作（无 add/commit/clean/stash/checkout/reset/restore）；未新增依赖；未联网（AI 出网路径全部走 `globalThis.fetch` 替身）；自建服务一律 `PORT=0` + 只跑 `exam_system_test`

## 0 一句话结论

A 点名的 **10 条零覆盖路由**中的 **8 条用户面 + 1 条纯磁盘路由 + 1 条 SSE 路由**共 **6 组 / 23 例**已由 6 个新套件钉住（`T-A…T-F`）；
覆盖自证显示 **8 个目标函数逐行命中**（未命中的 23 行**全部**是 500/错误 `catch` 分支），**6 处变异全部 RED 且只打红该打红的用例**；
B0b 的 `__dirname` 等价重构经 **专项路径探针 5/5 逐字相等 + 深度无关性 5/5** 证明，**变异正控 2/2 报差异**、**副作用正控**证明 `mkdirSync` 仍落在 `server/uploads/materials` 且**未产生任何漂移目录**；
两个死绑定按 Captain 五条硬条件删除（**AST 引用计数 = 0、两条语句均不变空**），读数**恰为 lint(a) 59→57 / lint(b) 31→29 exit 0**（与裁决预测逐字一致）；
五道门禁读数与入场**逐字相同**（GodFile **2**、未分层 **43**、违规 0、SCC 0、bind 0），全量回归 **2 次（ROUND=20 / 21）各 4 处摘要 + 0 failed**。

---

## 1 版本锚点与产物清单

| 项 | 值 |
|---|---|
| 起点 HEAD | `c5632b0`（`split(step-8): reviewController.js 拆为 11 文件并落层…`），分支 `master` |
| ★本轮中途 HEAD 位移（并行事实，如实登记） | 本轮进行中，另一 Agent 提交了 `ee2dec6 docs(step9): teacherController 接缝分析（854 行）+ Captain 对 lint 死绑定的裁决`。`git diff --name-only c5632b0 ee2dec6` = **只有 `docs/split/status.md` 与 `docs/split/teacherController-plan.md`**（**纯文档**）；`git show ee2dec6:server/src/controllers/teacherController.js | shasum -a 256` = `729a83b0…` ⇒ **产品代码未变，本轮 B0 基线与冻结树（`/tmp/splitT-before`、`/tmp/tcb0-mut`）的前置断言仍然成立** |
| 源文件（B0 期，未触碰） | sha256 = `729a83b064bdac822bf52f5713ecfc3893d842c57754dcd7eebb076d30a60764`、`wc -l` = **1338** ⇒ 与 plan §版本锚点**逐字相同** |
| 源文件（B0b 后） | sha256 = `307939875e16654f5c435eb923309292443737291131f682e984cc00c4b36823`、`wc -l` = **1336**（−2 = 删除的两行） |
| B0b diff 规模 | `8 insertions(+), 10 deletions(-)`（1 文件） |
| 产物 1 | `server/test/integration/tc-b0-switch-class-school.test.js`（7 例） |
| 产物 2 | `server/test/integration/tc-b0-lock-assignment.test.js`（3 例） |
| 产物 3 | `server/test/integration/tc-b0-project-files.test.js`（4 例） |
| 产物 4 | `server/test/integration/tc-b0-upload-material.test.js`（3 例） |
| 产物 5 | `server/test/integration/tc-b0-parse-exam-stream.test.js`（2 例） |
| 产物 6 | `server/test/integration/tc-b0-school-teachers.test.js`（4 例） |
| 产物 7 | `server/src/controllers/teacherController.js`（B0b 改动：5 处路径常量化 + 2 行删除 + 2 死绑定移除） |
| 产物 8 | 本报告 |

**夹具纪律**：6 个套件全部**自建自清**（前缀 `tca_ / tcb_ / tcc_ / tcd_ / tce_ / tcf_`，独立学校院校代码 `29601-29603 / 29611-29612 / 29621-29622 / 29631 / 29641 / 29651-29653`），不依赖 setup seed、不与其他套件共享行；未修改任何既有测试文件。

---

## 2 B0 新增用例清单（逐条：路由 / 场景 / 断言口径）

> 断言口径 = **状态码 + 响应体形状（`toEqual` 整体对拍，含 `code` 与中文文案逐字）+ 关键 DB 终态**；越权路径额外断言**零写入**（请求前后快照 `toEqual`）。文案断言一律整体对拍（不是 `toContain`），多一个字段即红。

### 2.1 T-A · `PUT /api/teacher/classes/:id/switch-school`（打靶 **Z1**，7 例）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-A1** | 缺 / 假 `newSchoolId`（`{}`、`{newSchoolId:0}`、`{newSchoolId:null}` 三次） | 均 400 `{code:1001,message:'请选择目标学校',data:null}`；班级 `schoolId` 与 `teamClass` 行数**前后相等**（零写入） |
| **T-A2** | 班级不存在（id=999999999） | 404 `{code:1004,message:'班级不存在',data:null}` |
| **T-A3** | `newSchoolId === cls.schoolId`（**数值**相等，保证命中 `===`） | 400 `{code:1001,message:'目标学校与当前学校相同',data:null}`；零写入 |
| **T-A4** | 教师同属新旧两校但**非本班教师**（无 `teacherClass` 行） | 403 `{code:1003,message:'无权操作',data:null}`；零写入 —— 刻意的负控设计：该教师**同属 B 校**，确保命中的是 `:964` 的「非本班教师」，而不是更靠后的新校校验 |
| **T-A5** | 教师是本班教师、但**不在旧校** | 403 `{code:1003,message:'无权操作当前学校',data:null}`（**全仓唯一文案 :971**）；零写入 |
| **T-A6** | 教师是本班教师且属旧校、但**不在新校** | 403 `{code:1003,message:'你不属于目标学校',data:null}`（**全仓唯一文案 :972**）；零写入（同时反证 `:971` 已先通过） |
| **T-A7** | 合法迁移（clsA 挂 1 个团队班）→ 再迁回 | 200：`Object.keys(body)` 恰 `[code,message,data]`；`message` 逐字 `已从「tca_school_a」迁移至「tca_school_b」，已退出团队：tca_team_one`；`data` 键序恰 `[oldSchoolId,newSchoolId,school,removedTeams]` 且整体 `toEqual`；**回读 DB**：`class.schoolId` 已改、该班 `teamClass` 行数 = **0**、team 本身仍存在；**迁回**时命中三元的**假分支**：`message` 恰 `已从「…b」迁移至「…a」`、`not.toContain('已退出团队')`、`removedTeams === []` |

### 2.2 T-B · `PUT /api/teacher/assignments/:id/lock`（打靶 **Z2**，3 例）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-B1** | 作业不存在 | 404 `{code:1004,message:'作业不存在',data:null}` |
| **T-B2** | 他人作业（`teacherId` 不符） | 403 `{code:1003,message:'无权操作',data:null}`；DB `locked` **仍为 false** |
| **T-B3** | 本人作业**连续两次** | ① 200 `{code:0,message:'已锁定',data:{id,locked:true}}` + DB `locked=true`；② 200 `{code:0,message:'已解锁',data:{id,locked:false}}` + DB `locked=false` ⇒ `:804` 三元两态全覆盖 |

### 2.3 T-C · `GET /api/teacher/questions/:id/project-files`（打靶 **Z3**，4 例）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-C1** | 不存在 / **他人 project 题** / 本人 **非 project 题** 三态 | 均 404 `{code:1004,message:'题目不存在',data:null}`（他人题与非 project 题**同码同文案** ⇒ 不泄漏存在性） |
| **T-C2** | project 题且 `attachmentUrl` 为空 | 200 `{code:0,message:'ok',data:{tree:[]}}`；`Object.keys(data)` 恰 `['tree']` ⇒ 钉住 `:131` 的**早退形状**（不得「顺手补齐」contents） |
| **T-C3** | project 题 + **真实标准包目录**（`uploads/project-questions/{id}/standard`，含 `spec.md` 与 `src/app.js`） | 200；`data` 键序恰 `['tree','contents']`；`tree` **整体 `toEqual`** 两节点（目录在前、`language`/`size` 逐值）；`contents` 逐字等于写入磁盘的内容 ⇒ 证明 `:152` 真命中 + `fs.readFileSync` 真读（**不是全走 :134 早退**） |
| **T-C4** | `attachmentUrl` 有值但目录不存在 | 200 `{tree:[]}`，键集合仍恰 `['tree']` ⇒ `:134` 分支（与 C2 同形但**成因不同**） |

**磁盘夹具自清**：`createdDirs` 登记后 `afterAll` 逐目录 `fs.rmSync`，**删除前断言路径严格位于 `STANDARDS_ROOT` 之内**（越界即抛错，与 `open-project-flow` 同款防护）。

### 2.4 T-D · `POST /api/teacher/upload-material`（打靶 **Z7**，3 例；**唯一写磁盘**）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-D1** | 非 zip（`.txt`） | 400 `{code:1001,message:'仅支持 zip 文件',data:null}`（multer `fileFilter` 的 `new Error` 文案，`:1310`）；**materials 目录条目数前后相等**（未落盘） |
| **T-D2** | 不带文件（`field('other','x')`，非 multipart file） | 400 `{code:1001,message:'未选择文件',data:null}`（`:1318`） |
| **T-D3** | 合法 zip | 200；`Object.keys(body)` 恰 `[code,message,data]`、`Object.keys(data)` 恰 `[url,name]`；`url` 匹配 `/^\/uploads\/materials\/\d+_[a-z0-9]+\.zip$/`；`name` **逐字**等于原始文件名；**落盘断言**：`fs.existsSync(path.join(UPLOADS_ROOT,'materials',basename(url)))` 为真且 `readFileSync` 与上传字节**逐字节相等**；`finally` 删除并断言已不存在 |

**两类 fs 副作用都覆盖**：模块加载期的 `mkdirSync`（`:1294`，由 B0b 副作用正控专门取证，见 §7.3）+ 请求期 multer `diskStorage` 落盘（本用例）。

### 2.5 T-E · `POST /api/teacher/parse-exam-stream`（打靶 **Z5**，SSE，2 例）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-E1** | 空内容三态（`{}` / `''` / 纯空白） | 均 400 `{code:1001,message:'请提供试卷内容',data:null}`（`:397` 在 `writeHead` **之前** ⇒ 仍是 json，不是 SSE） |
| **T-E2** | 合法内容（`globalThis.fetch` 替身返回 SSE 流） | ① **四 header 逐字**：`content-type: text/event-stream` / `cache-control: no-cache` / `connection: keep-alive` / `x-accel-buffering: no`；② 原始响应体按 `\n\n` 切分后**每片以 `data: ` 开头**并逐片 `JSON.parse`：首片 `{phase:'start',totalChars:N}` 且 N 逐字等于请求体长度、末片 `{phase:'done',questions:<替身原对象>,count:1}`；`phases[0]==='start'`、`phases[last]==='done'`、中间含 `connecting/streaming/token/parsing`，`token` 片累计 `contentLength` 终值等于模型回答长度；③ **替身被调用 ≥1 次**，URL 含 `/v1/chat/completions`、请求体 `stream:true`、`messages[1].content` 含原文 ⇒ **硬禁网自证** |

### 2.6 T-F · 学校切换 / 教师列表（打靶 **Z8 + Z9 + Z10**，4 例）

| 用例 | 场景 | 关键断言 |
|---|---|---|
| **T-F1** | `PUT /switch-school` `{schoolId}` | 200 `code:0`、`message:'切换成功'`、`data` **整体等于** DB 里的 school 全行（JSON 往返）；**回读 DB** `user.lastSchoolId` 已改 |
| **T-F2** | `GET /my-schools`（tA 两校 / tB 一校） | 200；tA 的 `data` id 集合恰 `{sA,sB}`、**含 C 校**为假；其中 `sA` 项**整体等于** DB school 全行（不是投影）；tB 的 `data` 恰 `[sB]`（负控） |
| **T-F3** | `GET /teachers`（不带 `schoolId`） | 200；id 集合**包含**三个跨校教师（未按校收窄）；每项键集合恰 `['createdAt','id','realName','username']`；`createdAt` **非递增**（降序契约）；**不含学生**（`role:'teacher'` 过滤） |
| **T-F4** | `GET /teachers?schoolId=` | 200；`schoolId=sA` 的 id 集合**恰等于** `{tA,tC}`（集合相等），且**不含** B 校教师 tB；`schoolId=sB` 恰 `{tA,tB}` 且不含 tC ⇒ 双向负控 |

**未补的 T-G / T-H**：与 plan §5.4 一致 —— `getMyClasses` **无路由**（集成测试到不了，直调只能锁住不可达函数）不补；`createAssignment` 的 `code:1007` **已由 `unit/assignment-q9-branches.test.js` 13 例覆盖**，不重复补。

---

## 3 B0 覆盖自证（证明「真执行到目标函数」，而非只拿到状态码）

### 3.1 方法（可复现，装置在 /tmp，未进仓库）

```bash
rm -rf /tmp/tcb0-nodcov && mkdir -p /tmp/tcb0-nodcov
NODE_V8_COVERAGE=/tmp/tcb0-nodcov /tmp/tcb0-jest.sh <6 个 tc-b0 套件>   # PORT=0 + DATABASE_URL=…exam_system_test
node /tmp/tcb0-cov.mjs /tmp/tcb0-nodcov                                # B 自建解析器（仓库外）
```

- **★口径（沿用 step 8 的教训并加严）**：jest 给**每个测试文件一个独立 VM context**，同一模块被加载 6 次 ⇒ **必须跨 context 取 max**（取「最后一个 context」会得到假 0）。
- **★本轮新增的必要加严**：V8 的 range 是**嵌套**的，模块顶层 range 覆盖全文件且 count ≥ 1。若按「任一包含该行的 range count>0」判定，**1338 行会全部显示为已覆盖**（本轮 v1 解析器就一度产出 `每 context 覆盖 1338 行` 的假象）。**正确口径 = 逐行取「最内层 range」的 count**。
- 行号由 acorn 对**磁盘源码**重新解析得到（函数名口径，B0b 后自动适应行号位移）。

### 3.2 阳性靶：8 个目标函数逐行命中（跨 6 context 取 max）

| 函数 | 行区间 | 行数 | 命中行 | fnMax | 未命中行 |
|---|---|---|---|---|---|
| `switchSchool` | L71-81 | 11 | 11 | 1 | 78,79,80（`catch` 500） |
| `getProjectFiles` | L124-157 | 34 | 34 | 6 | 148,149（`readFileSync` 内层 catch）、154,155,156（外层 catch） |
| `lockAssignment` | L792-809 | 18 | 18 | 4 | 806,807,808（`catch` 500） |
| `getAllTeachers` | L813-828 | 16 | 16 | 3 | 825,826,827（`catch` 500） |
| `getMySchools` | L832-843 | 12 | 12 | 2 | 840,841,842（`catch` 500） |
| `switchClassSchool` | L946-1001 | 56 | 56 | **10** | 998,999,1000（`catch` 500） |
| `uploadMaterial` | L1315-1322（B0b 后 L1313-1320） | 8 | **8/8** | 3 | **无** |
| `parseExamStream` | L395-422 | 28 | 28 | 4 | 417,418,419（SSE `catch` 错误分支） |

**合计 183 行，未命中 23 行，全部且仅为 `catch`/错误兜底分支** —— 即：**每一条可达的业务分支行都真的执行过**。

### 3.3 逐套件归因矩阵（证明覆盖面不是靠某一个套件堆出来的）

`fnMax(命中行/总行)`；`1(1/N)` = 仅函数声明行被外层语句计数命中 ⇒ **该套件未打到该函数**：

| 套件 | switchSchool | getProjectFiles | lockAssignment | getAllTeachers | getMySchools | switchClassSchool | uploadMaterial | parseExamStream |
|---|---|---|---|---|---|---|---|---|
| switch-class-school | 1(1/11) | 1(1/34) | 1(1/18) | 1(1/16) | 1(1/12) | **10(53/56)** | 1(1/8) | 1(1/28) |
| lock-assignment | 1(1/11) | 1(1/34) | **4(15/18)** | 1(1/16) | 1(1/12) | 1(1/56) | 1(1/8) | 1(1/28) |
| project-files | 1(1/11) | **6(29/34)** | 1(1/18) | 1(1/16) | 1(1/12) | 1(1/56) | 1(1/8) | 1(1/28) |
| upload-material | 1(1/11) | 1(1/34) | 1(1/18) | 1(1/16) | 1(1/12) | 1(1/56) | **3(8/8)** | 1(1/28) |
| parse-exam-stream | 1(1/11) | 1(1/34) | 1(1/18) | 1(1/16) | 1(1/12) | 1(1/56) | 1(1/8) | **4(25/28)** |
| school-teachers | **1(8/11)** | 1(1/34) | 1(1/18) | **3(13/16)** | **2(9/12)** | 1(1/56) | 1(1/8) | 1(1/28) |

**归因干净**：每个函数只被它自己的套件打亮，无跨套件溢出。

### 3.4 阴性对照（证明解析器「不是什么都算覆盖」）

| 未打靶函数 | 行区间 | 命中行/总行 |
|---|---|---|
| `gradeProject`（死代码） | L159-218 | **1/60** |
| `createAssignment` | L718-790 | **1/73** |
| `getAssignments` | L578-697 | **1/120** |
| `updateStudent` / `addStudent` / `batchAddStudents` / `deleteStudent` | — | 1/58 · 1/32 · 1/94 · 1/19 |

⇒ 解析器对「未执行」给出 0（只有函数声明行被外层语句计 1），**具备分辨力**。

### 3.5 ★臂级证据：`switchClassSchool` 的守卫阶梯（每一级恰好减 1）

```
950:10 → 951:7   ⇒ :950 '请选择目标学校'      被取走 3 次（T-A1 的三次入参）
957:7  → 958:6   ⇒ :957 '班级不存在'          被取走 1 次（T-A2）
960:6  → 961:5   ⇒ :960 '目标学校与当前学校相同' 被取走 1 次（T-A3）
964:5  → 965:4   ⇒ :964 '无权操作'            被取走 1 次（T-A4）
971:4  → 972:3   ⇒ :971 '无权操作当前学校'     被取走 1 次（T-A5）
972:3  → 973:2   ⇒ :972 '你不属于目标学校'     被取走 1 次（T-A6）
973..994 = 2     ⇒ 抵达并完成 200 分支 2 次（T-A7 的往返两次）
```

函数入口共 10 次调用（7 例中 A1 三次、A7 两次），阶梯**单调且每级差额恰好等于该分支的用例数** ⇒ 6 条守卫 + 2 次成功**逐条命中**，非「被某个更靠前的分支兜住」。

### 3.6 未覆盖行登记（诚实披露，非阻断）

**23 行全部位于错误兜底分支**：5 处 500 `catch`（`switchSchool`/`lockAssignment`/`getAllTeachers`/`getMySchools`/`switchClassSchool`）、`getProjectFiles` 的内层 `catch`（`:148-149`，需要「文件存在但不可读」）+ 外层 `catch`、`parseExamStream` 的 `phase:'error'` 分支（`:417-419`，需要 AI 替身抛错）。
**处置**：不为此写脆弱用例（构造 DB 故障 / `chmod 000` 级夹具的稳定性差）；`parseExamStream` 的错误分支与 `getProjectFiles` 的「不可读文件」兜底**已在 plan §7.4 派给 C 的 F05/F11**。**登记为 C 的复核项**。

---

## 4 B0 反证（变异必须 RED，且只打红该打红的用例）

- **装置**：`git archive HEAD server` → `/tmp/tcb0-mut`（冻结副本，控制器 sha256 前置断言 = `729a83b0…`）+ `server/node_modules` 软链 + 6 个新套件拷入；`/tmp/tcb0-mut.sh` 做**单点文本替换**（替换前断言靶点出现次数**恰为 1**，否则报「装置无效」），每个变异**从零重新导出干净副本**后只做一处替换。
- **产品代码全程零改动**：变异只写在 `/tmp/tcb0-mut/server/src/controllers/teacherController.js`；仓库内该文件 sha256 在反证前后恒为 `729a83b0…`（已复核）。
- **每个变异都跑全部 6 个套件**（不是只跑目标套件）⇒ 可验证「只打红该打红的」。

| # | 注入的变异（源行） | 命中用例 | jest 结果 |
|---|---|---|---|
| **M1** | `:971` `'无权操作当前学校'` → `'无权操作'` | **T-A5** | **RED ✓** 1 failed / 23（其余 5 套件全 PASS） |
| **M2** | `:801` `locked: !a.locked` → `locked: a.locked` | **T-B3** | **RED ✓** 1 failed / 23 |
| **M3** | `:131` 早退形状加一个键 `{tree:[],contents:{}}` | **T-C2** | **RED ✓** 1 failed / 23 |
| **M4** | `:1310` 白名单 `ext !== '.zip'` → `ext !== '.txt'` | **T-D1 + T-D3** | **RED ✓** 2 failed / 23 |
| **M5** | `:415` `count: result.questions.length` → `count: 0` | **T-E2** | **RED ✓** 1 failed / 23 |
| **M6** | `:76` `'切换成功'` → `'切换成功!'` | **T-F1** | **RED ✓** 1 failed / 23 |

**6/6 全红，且失败面精确**：
- M1/M2/M3/M5/M6 **各只红 1 例**（且都在其所属套件内）—— 分辨力来自该条用例的精确断言，不是整片崩；
- M4 红 2 例（**T-D1 与 T-D3**）：白名单变异同时反转「负例被拒」与「正例被收」两个方向，**这两条正是钉住白名单两个方向的用例**（D1 断言 .txt 被拒、D3 断言 .zip 被收），其余 5 个套件全 PASS ⇒ 属「该打红的」，非假牙。
- 无「改了不红」的哑牙，也无「一改全红」的假牙。

---

## 5 B0 单跑与全量回归（B0 期，产品代码零改动）

### 5.1 六套件单跑（全绿）

```
PASS test/integration/tc-b0-switch-class-school.test.js    7 passed
PASS test/integration/tc-b0-lock-assignment.test.js        3 passed
PASS test/integration/tc-b0-project-files.test.js          4 passed
PASS test/integration/tc-b0-upload-material.test.js        3 passed
PASS test/integration/tc-b0-parse-exam-stream.test.js      2 passed
PASS test/integration/tc-b0-school-teachers.test.js        4 passed
Test Suites: 6 passed, 6 total
Tests:       23 passed, 23 total          ← 0 failed，jest exit = 0
```

### 5.2 全量回归 `ROUND=20 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`

（**先查空序号**：`docs/split/` 下已有 `test-round-08..19.log` ⇒ 从 **20** 起）

| 判据 | 结果 |
|---|---|
| 4 处 `Test Suites:` 摘要 | ✅ **4 处**（`docs/split/test-round-20.log`） |
| `failed` 数 | ✅ **0**（`grep -E 'Tests:.*failed'` 无输出） |
| 读数 | 段1 **75 suites / 1021 tests** · 段2 **1/17** · 段3 **1/61** · 段4 **1/21** |
| 6 个新套件在日志中 | ✅ `grep -c "^PASS test/integration/tc-b0-"` = **6** |
| 用例数变化 | 段1 `998 → 1021`（**+23** = 本轮新增）⇒ 只有新增，无既有用例被改动或删除 |

---

## 6 B0b 改动逐行登记（`server/src/controllers/teacherController.js`）

`git diff --stat` = `1 file changed, 8 insertions(+), 10 deletions(-)`；行数 **1338 → 1336**；sha256 `729a83b0… → 30793987…`。

### 6.1 五处路径 → 与目录深度无关的常量（对应 plan §7.7 X1/X2/X3 + 上传块）

| # | 源行（改前） | 改前表达式 | 改后表达式 | 归属 |
|---|---|---|---|---|
| 1 | `:133` | `path.join(__dirname, '../../uploads', q.attachmentUrl)` | `path.join(UPLOADS_ROOT, q.attachmentUrl)` | X1（T3） |
| 2 | `:188` | 同上 | `path.join(UPLOADS_ROOT, q.attachmentUrl)` | X2（T10，`gradeProject` 死代码） |
| 3 | `:249` | `path.resolve(__dirname, '../../uploads/projects')` | `PROJECTS_ROOT` | X3（T3） |
| 4 | `:254` | `path.join(__dirname, '../../uploads/project-questions', String(q.id))` | `path.join(STANDARDS_ROOT, String(q.id))` | X3（T3） |
| 5 | `:1293`（B0b 后 `:1291`） | `path.join(__dirname, '../../uploads/materials')` | `path.join(UPLOADS_ROOT, 'materials')` | T11 上传块 |

### 6.2 两行删除 + 一行 import 合并

| # | 源行 | 动作 |
|---|---|---|
| 6 | `:1290` | **删除** `import { fileURLToPath } from 'url';`（全文件唯一消费者是下一行，删除后 `grep -c fileURLToPath` = **0**） |
| 7 | `:1292` | **删除** `const __dirname = path.dirname(fileURLToPath(import.meta.url));`（删除后 `grep -c __dirname` = **0**，其余 5 处消费点已全部改常量） |
| 8 | `:10` | `import { hasStandardPackage } from '../utils/projectPaths.js';` → `import { hasStandardPackage, UPLOADS_ROOT, PROJECTS_ROOT, STANDARDS_ROOT } from '../utils/projectPaths.js';`（**与既有名字合并为一行**，不新增 import 语句） |

**约束校验**：`grep -c "__dirname"` = **0**、`grep -c "fileURLToPath"` = **0**、`grep -c "DEFAULT_MAX_SCORE\|getTeamTeacherIds"` = **0**；真 `import` 一次（不是 `node --check`）→ **`Object.keys().length` = 30**，30 名与改前**逐字相同**。

### 6.3 两个死绑定（Captain 裁决五条硬条件，逐条落地）

| # | 源行 | 名字 | 语句 | 处置 |
|---|---|---|---|---|
| 9 | `:7` | `DEFAULT_MAX_SCORE` | `import { DEFAULT_MAX_SCORE, ABNORMAL_FEEDBACK } from '../constants.js';` | **只删名字、保留语句** → `import { ABNORMAL_FEEDBACK } from '../constants.js';` |
| 10 | `:9` | `getTeamTeacherIds` | `import { getVisibleClassIds, getTeamTeacherIds, getMyTeamIds } from './teamController.js';` | **只删名字、保留语句** → `import { getVisibleClassIds, getMyTeamIds } from './teamController.js';` |

---

## 7 B0b 三条证据

### 7.1 证据①：专项路径探针（5 个站点，两棵冻结树对拍）

- **装置**：`before` 树 = `git archive HEAD server` → `/tmp/splitT-before`（控制器 sha256 前置断言 = `729a83b0…`，**不读活工作树**）；`after` 树 = B0b 之后的 `server` 副本（sha256 = `30793987…`）。两树各自的常量由**它自己的** `utils/projectPaths.js` 提供，`__dirname` 由站点宿主目录提供。
- **站点定位用稳定锚点**（`const dir = ` / `const standardDir = ` / `const projectsRoot = ` / `const destDir = ` / `const uploadDir = `），不依赖行号（两树行号相差 2）；表达式**逐字提取**（括号配平 + 裸常量回退）后求值。

| 站点（plan §7.2 的 5 个常量） | before 表达式 | after 表达式 | before.real | after.real | 判定 |
|---|---|---|---|---|---|
| `uploadsRootForGetProjectFiles` | `path.join(__dirname,'../../uploads',q.attachmentUrl)` | `path.join(UPLOADS_ROOT,q.attachmentUrl)` | `<TREE>/server/uploads/project-questions/1/standard` | 同左 | **EQUAL** |
| `uploadsRootForGradeProject` | 同上 | 同上 | 同上 | 同左 | **EQUAL** |
| `projectsRoot` | `path.resolve(__dirname,'../../uploads/projects')` | `PROJECTS_ROOT` | `<TREE>/server/uploads/projects` | 同左 | **EQUAL** |
| `projectQuestionsDirForQ7` | `path.join(__dirname,'../../uploads/project-questions',String(q.id))` | `path.join(STANDARDS_ROOT,String(q.id))` | `<TREE>/server/uploads/project-questions/7` | 同左 | **EQUAL** |
| `materialsDir` | `path.join(__dirname,'../../uploads/materials')` | `path.join(UPLOADS_ROOT,'materials')` | `<TREE>/server/uploads/materials` | 同左 | **EQUAL** |

**⇒ 判据 ①-A：`before.real` vs `after.real`（归一化树根为 `<TREE>`）= `EQUAL=5 / DIFF=0`（plan 预期 5/5，实测 5/5 ✅）**

**⇒ 判据 ①-B（本轮加严）：深度无关性 —— `after` 树把 `__dirname` 换成「模拟搬迁后宿主目录」(`interface/http/controllers/teacher` 与 `infrastructure/teacher`) 再求值 = `EQUAL=5 / DIFF=0`，且 5 个表达式的 `usesDirname` 全为 `false`。**

**⇒ 判据 ①-C（装置自身的正控）：同一探针在 `before` 树上「真实宿主 vs 模拟宿主」= `EQUAL=0 / DIFF=5`，且漂移方向与 A 的预测逐字相同**：
```
interface/http/controllers/teacher 宿主 → <TREE>/server/src/interface/http/uploads/project-questions/1/standard   （多 4 层）
infrastructure/teacher 宿主           → <TREE>/server/src/uploads/materials                                    （多 2 层）
```
⇒ **探针不是恒等装置**，它确实能看见 B0b 所消除的那种静默漂移。

### 7.2 证据②：变异正控（故意把常量改错 → 探针必须报差异）

在 `after` 副本上注入 **2 处**「常量用错」的变异（先断言靶点出现次数：A 恰 2 次、B 恰 1 次）：

| 变异 | 注入内容 | 探针结果 |
|---|---|---|
| **V-a** | `:133` `path.join(UPLOADS_ROOT, q.attachmentUrl)` → `path.join(UPLOADS_ROOT, '../../uploads', q.attachmentUrl)`（**错误的深度表达式**，正是 A 警告的形态） | `uploadsRootForGetProjectFiles`：`after=<TREE>/server/uploads/…` vs `mut=<TREE>/uploads/…` ⇒ **★DIFF** |
| **V-b** | `:254` `path.join(STANDARDS_ROOT, String(q.id))` → `path.join(UPLOADS_ROOT, String(q.id))`（**用错常量**） | `projectQuestionsDirForQ7`：`after=<TREE>/server/uploads/project-questions/7` vs `mut=<TREE>/server/uploads/7` ⇒ **★DIFF** |

**⇒ 判定：`EQUAL=3 / DIFF=2` —— 差异恰好落在被注入的两个站点，其余 3 站点不受影响 ⇒ 探针有牙且分辨力精确。**

### 7.3 证据③：副作用正控（模块加载期 `mkdirSync` 不得漂移）

| 检查 | 结果 |
|---|---|
| `before` 树 import **前** `server/uploads` 是否存在 | **NO**（`git archive` 冻结树本就没有） |
| `before` 树真 import 一次后 | **`/tmp/splitT-before/server/uploads/materials` 存在**（`materialsBeforeImport:false → materialsAfterImport:true`，exports=30） |
| `after` 树（先 `rm -rf server/uploads`）真 import 一次后 | **`/tmp/splitT-after/server/uploads/materials` 存在**（同样 `false → true`，exports=30） |
| `after` 树是否在**错误位置**建出 uploads | `server/src/interface/http/uploads` **不存在** ✅ ｜ `server/src/infrastructure/uploads` **不存在** ✅ |
| **仓库** `server/src` 下的漂移目录 | `find server/src -type d -name uploads` 命中 **0** ✅ |
| 仓库既有上传根 | `server/uploads/materials` 仍在（未新增、未迁移） |

⇒ **模块加载期副作用仍落在 `<repo>/server/uploads/materials`，全仓无任何 `server/src/**/uploads` 漂移目录。**

### 7.4 补充：`after` 树的运行期路径证据（B0 复跑即证据）

B0 的 **T-C3**（磁盘上造 `STANDARDS_ROOT/{id}/standard` 并断言 handler 读回的 `contents` 逐字相等）与 **T-D3**（断言 multer 落盘文件确实出现在 `UPLOADS_ROOT/materials`）在 **B0b 之后仍全绿** ⇒ 对 **`:133`（经 :152 的真命中）与 `:1291`（模块级 `uploadDir`）** 而言，除了静态表达式对拍之外，还有**真运行时的落点证据**。
**诚实局限**：`:188`（`gradeProject` 死代码）、`:249`/`:254`（`createQuestion` 的 `tempId` 分支）**没有 B0 行为覆盖**，其等价性**只由 §7.1 的表达式对拍支撑**（plan 已把 F06 派给 C）。已登记。

---

## 8 两个死绑定的 AST 证据与语句构成判定（Captain 五条硬条件逐条回应）

### 8.1 条件 1：AST 证明引用计数恰为 1（**不得用 grep**）

装置：`/tmp/tcb0-ast-deadbindings.mjs` —— **acorn AST 遍历**统计绑定标识符在**非 import 绑定位**的出现次数（同时排除成员表达式属性名与非简写对象键名；**简写属性 `{ message }` 计为引用**，避免 step 8 那类漏计）。

| 名字 | AST 标识符引用计数 | 独立方法二（剥离注释/字符串后的文本扫描，排除 import 行） | 结论 |
|---|---|---|---|
| `DEFAULT_MAX_SCORE` | **0** | **0**（全部命中都在 import 行 `:7`） | **死绑定** |
| `getTeamTeacherIds` | **0** | **0**（全部命中都在 import 行 `:9`） | **死绑定** |
| `ABNORMAL_FEEDBACK`（同语句） | 1（`:442`） | 1（`:442`） | 在用 |
| `getVisibleClassIds`（同语句） | 7（`:26,32,49,537,582,849,1012`） | 7（同行号） | 在用 |
| `getMyTeamIds`（同语句） | 1（`:56`） | 1（`:56`） | 在用 |

**两套机理独立的方法给出同一结果**（AST 标识符计数 + 文本法行计数），且与 plan §1.5-2、`docs/pipeline/lint-baseline.json` 的第 1/2 条（`no-unused-vars` 命中同名同文件）**三方一致**。

### 8.2 条件 2：★每条语句是否还提供其它在用名（A 未见此层）

| 语句 | 其它在用名 | 判定 |
|---|---|---|
| `:7` `import { DEFAULT_MAX_SCORE, ABNORMAL_FEEDBACK } from '../constants.js';` | `ABNORMAL_FEEDBACK` **在用**（1 处，`:442`） | **只删名字、保留语句** ✅ |
| `:9` `import { getVisibleClassIds, getTeamTeacherIds, getMyTeamIds } from './teamController.js';` | `getVisibleClassIds`（7 处）+ `getMyTeamIds`（1 处）**在用** | **只删名字、保留语句** ✅ |

**⇒ ★两条语句都【不会】变空 ⇒ 条件 2 的「语句会变空」分支在本轮【不适用】，无需就「ESM import 会执行模块」的问题回报 Captain。**
（附：为完整性我仍查了目标模块的其它导入语句 —— `../constants.js` 在本文件内只有 `:7` 一条、`./teamController.js` 只有 `:9` 一条；但因语句均不变空，该事实**不构成任何处置依据**，仅登记。）

### 8.3 条件 3：预期读数（实测与预测**逐字一致**）

| 判据 | 预测 | 实测 | 判定 |
|---|---|---|---|
| lint (b) 基线总数 | 31 → **29** | **31 → 29** | ✅ |
| resolved 条目 | 恰 2 条（旧 file、`no-unused-vars`、symbol=`DEFAULT_MAX_SCORE`/`getTeamTeacherIds`） | `resolved` 数组**恰含这两条 + step 8 的 `count` 迁移 1 条** | ✅ |
| `fresh`（新增）中属于本轮 | **0** 条 | `newViolations` 只有 1 条 = step 8 迁移的 `review/batch.js:78 count`（**非本轮产物**） | ✅ |
| `blockingViolations` | 0 | **`[]`**、`verdict: "PASS"`、exit **0** | ✅ |
| 是否执行 `--update-baseline` | **否** | **未执行**：`lint-baseline.json` sha256 = `678d3d51af0f446b4e2c7e2c2226c2c3f9915b1572393651efff93812f81804c`、mtime `2026-10-11 13:22:03`（**改动前后逐字未变**） | ✅ |
| eslint warn | 59 → **57** | **59 → 57**；本文件从 3 条降到 **1 条**（只剩 `:159 gradeProject`） | ✅ |

### 8.4 条件 4 / 5：反向禁令与登记

- **条件 4**：两个死绑定**未复制进任何新文件**（本轮未建任何新文件；`grep -c "DEFAULT_MAX_SCORE\|getTeamTeacherIds"` 在源文件 = **0**）。
- **条件 5**：见 §6.3 与本节 —— 名字 / 原行号 / 引用计数证据 / 语句构成 / 处置理由**逐条已登记**。

---

## 9 B0b 后复跑 B0（等价性证明）

```
PASS test/integration/tc-b0-switch-class-school.test.js
PASS test/integration/tc-b0-school-teachers.test.js
PASS test/integration/tc-b0-lock-assignment.test.js
PASS test/integration/tc-b0-project-files.test.js
PASS test/integration/tc-b0-upload-material.test.js
PASS test/integration/tc-b0-parse-exam-stream.test.js
Test Suites: 6 passed, 6 total
Tests:       23 passed, 23 total          ← 0 failed，jest exit = 0
```

**覆盖自证复算**（B0b 后重跑 V8 采集）：8 个目标函数**仍逐行命中**，未命中行**仍是同一批 23 行 catch**；`uploadMaterial` 行号随 AST 重算为 **L1313-1320**（−2 = 删除两行）仍 **8/8 命中**，其余区间行号不变。
⇒ **B0b 是行为等价的**：同一组契约用例在改动前后**逐条同结果**。

---

## 10 门禁读数（五连 + 两道 lint）

| 门禁 | 命令 | 实测 | 入场基线 | 判定 |
|---|---|---|---|---|
| 分层守卫 | `node server/scripts/check-layers.mjs` | 文件 **106** / **违规 0** / 未分层待迁移 **43** | 0 / 43 | ✅ 不变 |
| 架构门禁 | `node scripts/gates/arch-metrics.mjs` | layerViolations **0/0**、unmigrated **43/43**、**godfileOver800 2/2**、观察带 13/13；名单 = `teacherController.js (1336)` / `Doc.vue (1106)`；**结论 PASS** | 同 | ✅ PASS |
| 循环依赖 | `node scripts/gates/cycle-check.mjs` | 106 文件 / **238** 条相对导入边 / **SCC 0** / 自环 0 | 0 | ✅ PASS |
| 硬指标 | `node scripts/gates/hard-metrics.mjs` | **0/0/0**（只扫 client/src，逐字不变） | 0/0/0 | ✅ PASS |
| 绑定门禁 | `node scripts/gates/bind-check.mjs` | modules **214**（= 208 + 6 个新测试文件）/ bindings 725 / **BINDING VIOLATIONS 0**；unresolved 4 / external 1（仅登记） | 0 / 4 / 1 | ✅ PASS |
| **lint (a)** | `./node_modules/.bin/eslint client/src server/src --format json` | 205 文件、**error 0**、**warn 57**（59 → 57）；本文件仅剩 `:159 gradeProject` 1 条 | 0 / ≤59 | ✅ 达标（且方向为降） |
| **lint (b)** | `node scripts/gates/lint-check.mjs` | 合计 **31 → 29**、阻断 **0**、resolved 含本轮 **2** 条、迁移 1 条（step 8 的 `count`）、**exit 0 / PASS** | 31 | ✅ 达标（**未执行 `--update-baseline`**） |

**GodFile 2 不变、未分层 43 不变、违规 0 不变** —— 与「本轮不搬移」的预期一致。

---

## 11 全量回归（B0b 后）

`ROUND=21 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`（序号 20 已被 §5.2 占用，21 为空序号）

| 判据 | 结果 |
|---|---|
| 4 处 `Test Suites:` 摘要 | ✅ **4 处**（`docs/split/test-round-21.log`） |
| `failed` 数 | ✅ **0** |
| 读数 | 段1 **75 suites / 1021 tests** · 段2 **1/17** · 段3 **1/61** · 段4 **1/21** |
| 与 ROUND=20（B0b 前）对比 | **逐字相同**（1021 / 17 / 61 / 21，均 0 failed）⇒ B0b 在全量口径下亦为等价变换 |
| 6 个新套件 | ✅ `grep -c "^PASS test/integration/tc-b0-"` = **6** |

---

## 12 改动面（`git status --porcelain -uno`）

```
$ git status --porcelain -uno
 M server/src/controllers/teacherController.js        ← 唯一已跟踪文件改动（= B0b）

$ git status --porcelain | grep -E 'tc-b0'
?? server/test/integration/tc-b0-switch-class-school.test.js
?? server/test/integration/tc-b0-lock-assignment.test.js
?? server/test/integration/tc-b0-project-files.test.js
?? server/test/integration/tc-b0-upload-material.test.js
?? server/test/integration/tc-b0-parse-exam-stream.test.js
?? server/test/integration/tc-b0-school-teachers.test.js
```

- **改动面只有**：`server/src/controllers/teacherController.js`（B0b）+ 6 个新测试文件 + 本报告。
- **旁证**：`docs/split/test-round-20.log` / `test-round-21.log` 是本报告 §5.2 / §11 要求的回归归档（`git status` 中**不出现** ⇒ 该目录的 `*.log` 已被 `.gitignore` 覆盖）；`server/uploads/materials` 检查为**空目录**（T-D3 的产物业已自清，无残留）。
- 未动 `client/**`、`tests/**`（含 `tests/ui-redesign-verify/rig-server/` 那棵冻结副本）、`scripts/gates/**`、`server/scripts/**`、`docs/pipeline/**`、`server/.env`、`server/package.json`。
- 未执行任何 git 写操作；**未新增依赖**；**未联网**。

---

## 13 登记项 / 局限声明（**一律未改实现**）

| # | 位置 | 现象 | 处置 |
|---|---|---|---|
| **L1** | `switchClassSchool:951` 起的守卫链 | `newSchoolId` 的类型敏感：`oldSchoolId === newSchoolId` 是**严格相等**，前端若传字符串 `"5"` 会绕过 `:960` 的「同一学校」判定并继续走后续守卫。B0 **按实测契约**写断言（数值入参），**不放宽、也不改实现** | 登记（既有行为，plan §10-9 明令不得顺手加类型防护） |
| **L2** | `parseExamStream:417-419` | SSE `phase:'error'` 分支**零覆盖**（需替身抛错）。plan §7.4-F11 已派给 C | 登记为 C 的复核项 |
| **L3** | `getProjectFiles:148-149` | 「文件存在但不可读 → `'// 无法读取文件内容'`」兜底**零覆盖**（需 `chmod 000` 级夹具）。plan §7.4-F05 已派给 C | 登记为 C 的复核项 |
| **L4** | 5 处 500 `catch` | 需构造 DB 故障，**不写脆弱用例** | 登记 |
| **L5** | `:188 / :249 / :254` | 无 B0 行为覆盖，B0b 等价性**只由 §7.1 表达式对拍支撑**（plan §7.4-F06 派给 C） | 登记（§7.4 已披露） |
| **L6** | `utils/projectPaths.js` | B0b 把「由本文件位置推路径」换成「由 `utils/` 位置推路径」⇒ 依赖面从 2 处扩大到 5 处；**若将来移动 `projectPaths.js` 会同时坏掉**。这是 plan §12-5 已披露的既有脆弱性，非本轮引入 | 登记（与 plan 一致） |
| **L7** | 夹具学校院校代码 | 本轮占用 `29601-29603 / 29611-29612 / 29621-29622 / 29631 / 29641 / 29651-29653`（已核对与既有 12 个测试代码不冲突） | 登记，供后续步避让 |

**本轮未发现「实现与 plan 契约不符」的阻断缺陷**：23 条用例的断言在**以实测口径书写**后即全绿（唯一两次红都是**我自己的夹具/假设**错：T-A4 初版误给「非本班教师」建了 `teacherClass` 行；探针 v1 用「任一外层 range」判定导致假覆盖，已按最内层 range 口径修正）。

---

## 14 给 Agent C 的验证指令（只读复核，临时产物一律 /tmp）

> 目标：独立证明 ①B0 的 23 例**真的**覆盖了 Z1/Z2/Z3/Z5/Z7/Z8/Z9/Z10（不是只在守卫处短路）；②B0b 的路径替换**真的等价且与深度无关**。

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"

# 0) 版本锚点：源文件应为 30793987… / 1336 行；__dirname 与 fileURLToPath 计数应为 0
shasum -a 256 server/src/controllers/teacherController.js && wc -l server/src/controllers/teacherController.js
grep -c "__dirname\|fileURLToPath" server/src/controllers/teacherController.js   # 期望 0

# 1) 单跑 6 个新套件（期望 6 passed / 23 passed / 0 failed）
#    注意：必须显式 PORT=0 且 DATABASE_URL 指向 exam_system_test（否则 setup.js 护栏 exit 1 且无摘要）
TEST_URL="$(node -e 'const fs=require("fs");const m=fs.readFileSync("server/.env","utf8").match(/^DATABASE_URL=(.*)$/m);const u=new URL(m[1].trim().replace(/^"|"$/g,""));u.pathname="/exam_system_test";process.stdout.write(u.toString())')"
( cd server && PORT=0 DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules ./node_modules/.bin/jest \
    --config test/jest.config.js --runInBand --forceExit test/integration/tc-b0- )
#    另请在 /tmp 冻结副本（git archive HEAD server + cp 新测试）上复跑一次并 cmp 结果（B0b 前后同结果）

# 2) ★覆盖自证（C 自建装置，不复用 B 的脚本）
#    NODE_V8_COVERAGE=<dir> 同上单跑 → 解析 teacherController.js 条目
#    ★两条口径缺一不可：① 跨 VM context 取 max（jest 每测试文件一个 context）；
#                       ② 逐行取【最内层 range】的 count（否则模块顶层 range 会把全文件算成已覆盖）
#    判据：switchSchool L71-81 / getProjectFiles L124-157 / lockAssignment L792-809 / getAllTeachers L813-828 /
#          getMySchools L832-843 / switchClassSchool L946-1001 / uploadMaterial L1313-1320 / parseExamStream L395-422
#          **除 catch 行外逐行 count>0**；并用阴性对照（gradeProject/createAssignment/getAssignments 应几乎全 0）证明解析器有牙
#    路线 B（更硬）：/tmp 副本里给 8 个函数各插一行计数探针，跑完断言计数 >0

# 3) 反证（C 自建 ≥3 处变异，不必复用 B 的 6 处）：/tmp 副本 + 单点替换，判据 = 必须 RED
#    ① :971 '无权操作当前学校' → '无权操作'           → T-A5 必红
#    ② :801 locked: !a.locked → a.locked              → T-B3 必红
#    ③ :131 早退形状加 contents 键                     → T-C2 必红
#    ④ :1310 白名单 ext !== '.zip' → '.txt'            → T-D1 与 T-D3 必红（其余套件必须全绿）
#    ⑤ :415 count → 0                                  → T-E2 必红
#    ⑥ :76 '切换成功' → '切换成功!'                     → T-F1 必红

# 4) ★B0b 路径等价（本步独有，最高优先；C 自建探针，不复用 B 的 /tmp/tcb0-pathprobe.mjs）
#    before 树：git archive <B0 之前的 commit> server（控制器 sha256 必须 = 729a83b0…）
#    after  树：当前工作树 server 副本（sha256 = 30793987…）
#    判据 A：5 个路径表达式解析出的绝对路径（归一化树根后）**逐一相等**（B 实测 5/5）
#    判据 B（关键）：after 树把 __dirname 换成模拟新宿主（interface/http/controllers/teacher 与 infrastructure/teacher）
#                    再求值 → **必须 5/5 不变**（证明与目录深度无关）
#    判据 C：同一探针在 before 树上「真实宿主 vs 模拟宿主」**必须报差异**（B 实测 5/5 DIFF；不报 = 恒等装置，判负）
#    判据 D（变异正控）：把某处常量改成错的深度表达式/换错常量 → 探针**必须报差异**

# 5) 副作用正控
rm -rf /tmp/c-after && mkdir -p /tmp/c-after && cp -R server /tmp/c-after/server && rm -rf /tmp/c-after/server/uploads
#    真 import 一次 /tmp/c-after/server/src/controllers/teacherController.js（PORT=0）
#    判据：<tree>/server/uploads/materials 被建出；<repo>/server/src/**/uploads 不存在；
#          ls -d /tmp/c-after/server/src/interface/http/uploads /tmp/c-after/server/src/infrastructure/uploads 均不存在
find server/src -type d -name uploads | wc -l      # 期望 0

# 6) 死绑定复核（AST 口径，不得只 grep）
#    断言 DEFAULT_MAX_SCORE / getTeamTeacherIds 在源文件中出现次数 = 0；
#    并在 git show <B0 之前的 commit>:server/src/controllers/teacherController.js 上
#    用 acorn 复算两者引用计数 = 0、且 :7/:9 两条语句删名后**各仍剩 ≥1 个在用名**（ABNORMAL_FEEDBACK / getVisibleClassIds+getMyTeamIds）

# 7) 全量回归（判据 = 4 处 Test Suites 摘要 + failed=0，不得拿用例数当判据）
ROUND=22 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh
grep -nE '^Test Suites:|^Tests:' docs/split/test-round-22.log ; grep 'failed' docs/split/test-round-22.log

# 8) 门禁五连 + 两道 lint（读数为：GodFile 2 / 未分层 43 / 违规 0 / SCC 0 / bind 0 / eslint 0-57 / lint-check 31→29）
node server/scripts/check-layers.mjs
node scripts/gates/arch-metrics.mjs
node scripts/gates/cycle-check.mjs
node scripts/gates/hard-metrics.mjs
node scripts/gates/bind-check.mjs
./node_modules/.bin/eslint client/src server/src -f json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("errors",j.reduce((a,f)=>a+f.errorCount,0),"warnings",j.reduce((a,f)=>a+f.warningCount,0))})'
node scripts/gates/lint-check.mjs --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("baseline",j.baseline.total,"current",j.counts["no-unused-vars"],"resolved",j.resolved.map(r=>r.key.split("\u0000").slice(1).join("/")),"blocking",j.blockingViolations.length,"verdict",j.verdict)})'
shasum -a 256 docs/pipeline/lint-baseline.json   # 必须恒为 678d3d51…（证未刷新基线）
```

**C 的通过判据（逐条）**
1. 源文件 sha256 = `30793987…`、1336 行、`__dirname`/`fileURLToPath`/`DEFAULT_MAX_SCORE`/`getTeamTeacherIds` 计数均为 **0**；
2. 6 个新套件 **23/23 绿**、`failed=0`；且 B0b 前后**同结果**；
3. **覆盖自证**：8 个目标函数除 `catch` 外逐行命中（跨 context 取 max + 最内层 range 口径），并有阴性对照 —— **只凭「状态码对」不算过**；
4. **反证**：自建 ≥3 处变异**全部 RED**，且失败面精确（≥1 处变异必须只打红 1 例）；
5. **B0b**：路径探针 `before.real vs after.real` 5/5 相等 + after 深度无关 5/5 + before 装置自身 5/5 报差异 + 变异正控报差异 + 无漂移目录；
6. 全量回归 4 处摘要 + `failed=0`；
7. 门禁五连 + 两道 lint 与 §10 表**逐字相同**（GodFile **2**、未分层 **43**、违规 **0**、SCC **0**、bind 0；eslint 0 error / **57** warn；lint-check **31→29** exit 0 且**基线文件 sha256 未变**）；
8. `git status --porcelain -uno` 只有 `M server/src/controllers/teacherController.js`（= B0b）+ `server/test/**` 的 6 个新增 + 本报告。

**C 需要重点复核的三处（我可能错的地方）**
- `:249` 我用**裸常量** `PROJECTS_ROOT` 替换 `path.resolve(__dirname,'../../uploads/projects')`（plan §7.7-X3 的写法）；请独立确认「`path.resolve(绝对路径) === 该绝对路径`」在本仓的 `PROJECTS_ROOT` 上成立（我实测 EQUAL，且 `PROJECTS_ROOT` 由 `path.join` 产出、已是绝对规范路径）；
- 覆盖解析器的**「最内层 range」口径**是否成立（v1 用「任一外层 range」时得到「1338 行全命中」的假象，是本轮唯一一次险些误判）；
- `switchClassSchool` 的守卫阶梯（§3.5）是否可由独立装置复现同一条 10→7→6→5→4→3→2 的递减链。

---

## 15 本轮自证清单（全绿）

- [x] B0：6 个新套件 / **23 例**，单跑 `6 passed / 23 passed / 0 failed`
- [x] B0：覆盖自证 —— 8 个目标函数除 catch 外逐行命中（跨 6 context 取 max + 最内层 range），阴性对照证明解析器有牙
- [x] B0：`switchClassSchool` 臂级阶梯证据（10→7→6→5→4→3→2，每级差额 = 对应用例数）
- [x] B0：反证 **6/6 RED**，失败面精确（5 处只红 1 例；白名单变异红 D1+D3，其余套件全绿）
- [x] B0：全量回归 **ROUND=20** —— 4 处摘要 + **0 failed**（段1 75/1021）
- [x] B0b：5 处路径常量化 + 2 行删除 + 2 死绑定移除；**1338 → 1336**；真 import 后导出面仍 **30 名**
- [x] B0b 证据①：路径探针 **5/5 EQUAL**（plan 预期 5/5）+ 深度无关性 **5/5** + 装置自身正控 **5/5 报差异**（漂移方向与 A 预测逐字相同）
- [x] B0b 证据②：变异正控 **2/2 报差异**且差异恰好落在被变异站点
- [x] B0b 证据③：副作用正控 —— 两树 import 后均建出 `server/uploads/materials`；**仓库 `server/src/**/uploads` = 0**
- [x] B0b：**复跑 B0 全绿**（6/23，0 failed）⇒ 等价性证明
- [x] 死绑定：AST 引用计数 = **0**（两法一致）+ **两条语句均不变空**（只删名字、保留语句）+ 未复制进任何新文件
- [x] 门禁：check-layers 违规 **0** / 未分层 **43** 不变 ｜ arch **PASS（GodFile 2）** ｜ cycle **SCC 0** ｜ hard **0/0/0** ｜ bind **0**
- [x] 两道 lint：eslint **0 error / 57 warn**（59→57）｜ lint-check **31→29 / 阻断 0 / exit 0 / 未刷新基线**（sha256 恒 `678d3d51…`）
- [x] 全量回归 **ROUND=21**（B0b 后）—— 4 处摘要 + **0 failed**，与 ROUND=20 逐字相同
- [x] 改动面：仅 `M server/src/controllers/teacherController.js` + 6 个新测试文件 + 本报告
- [x] 无 git 写操作；未触碰 client / tests / scripts/gates / 既有测试断言 / 依赖
