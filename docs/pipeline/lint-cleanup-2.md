# lint-cleanup-2 —— lint 清零收尾（执行 Captain 两条裁决）

> 执行者：Agent B（本仓唯一写者）｜轮次：lint 清零收尾
> 输入：`docs/pipeline/lint-cleanup.md`（上一轮，残留 2 项）+ Captain 对两条残留的裁决
> 原则：**只删死代码与已无消费者的 import**；零逻辑改动、零新增依赖、零 git 写操作。
> 技能：`tech-code-refactoring`（已加载）

---

## 0. 结论速览

| 判据 | 本轮前 | 本轮后 | 目标 | 状态 |
| --- | --- | --- | --- | --- |
| **ESLint**（client/src + server/src） | error 0 / warn **2** | error **0** / warn **1** | 0 / 1（仅 D7） | ✅ 达标 |
| **lint-check 门禁** | 当前 **1** 条（exit 0） | 当前 **0** 条（exit 0 / PASS） | 0 | ✅ 达标 |
| **lint 基线** | 31 条（2026-10-11T05:22:03Z） | **0 条**（2026-10-11T07:41:39Z） | 刷为 0 | ✅ 已刷新 |
| 源码改动规模 | — | **3 文件 / 0 增 / 68 删** | 纯删除 | ✅ |
| diff 形态 | — | **只有「纯删除行」一类**（源码侧） | ≤ 2 类 | ✅ |
| 结构门禁七项 | 基线 | 全部持平 PASS | 持平 | ✅ |
| 全量回归 | — | **4 段摘要 / failed=0**（round-28） | failed=0 | ✅ |
| 定向测试 | — | **10/10 文件全绿**（48 tests） | 10/10 | ✅ |

- 唯一保留的 ESLint 警告 = `client/src/composables/question/questionPure.js:71`（**D7**，Captain 已登记，属行为变更，**本轮未动**）。
- 未提交（硬约束「不做任何 git 写操作」）；回滚参考：`git diff` / `git show HEAD:<path>`。

---

## 1. ★裁决 1 的执行：删除 `gradeProject` 死处理器 + 5 条失去消费者的 import

### 1.1 位置与规模

文件 `server/src/infrastructure/teacher/grade.js`：**88 行 → 23 行**（−65 行）。

| 删除块 | 行区间（删前） | 行数 | 说明 |
| --- | --- | --- | --- |
| 5 条 import | 7–11 | 5 | `fs` / `path` / `prisma` / `logger` / `{hasStandardPackage, UPLOADS_ROOT}` |
| `gradeProject` 处理器 | 14–73 | 60 | `const gradeProject = async (req, res) => { … };` |
| **合计** | | **65** | |

**5 条 import 均为「整条删除」，未改写成裸导入**（按 Captain 裁决 + 对 §四② 的修正：`fs` / `path` 是 Node 内建，裸导入毫无语义 ⇒ 整条删）。

删后该文件**完整的对外/对内面孔**（逐字）：

```js
import { generateReferenceAnswer } from '../ai/deepseek/index.js';   // 唯一 import

// ===================== AI 生成参考答案 =====================

export const generateReference = async (req, res) => { … };          // 唯一 export
```

> 头部注释（第 2 行）仍写着「源行 159-218 · 1322-1336」，其中 `159-218` 正是被删的 `gradeProject` 区间，现已失真。本轮硬约束是「纯删除」，未顺手改注释 —— 见 §8 残留观察。

### 1.2 删除为何行为无损（四条独立证据）

| 证据 | 结果 |
| --- | --- |
| AST 引用计数（上一轮） | `binding.references = 0`、`constantViolations = 0`、无 `export` |
| 路由注册 | `server/src/routes/teacher.js` 无对应端点；barrel `infrastructure/teacher/index.js:9` 只再导出 `generateReference` |
| 客户端 | `client/src` 无对应接口（仅 `regradeProjectSubmission`，属另一条已接线的链） |
| **真 import 探针（本轮新增）** | 见 §3 —— 导出面**逐字等价** |

### 1.3 ⚠️ 对裁决依据的事实更正（**不改结论**）

裁决书写的是「**git 回溯到最早版本就从未 export**、路由/客户端均无端点 ⇒ **死于出生**」。前半句**与史实不符**，据实更正如下：

| 时点 | 提交 | 状态 | 证据 |
| --- | --- | --- | --- |
| **出生（曾接线）** | `2d1188d`（2026-08-15，实训题模块交付） | `export const gradeProject` @ `teacherController.js:104` **＋** 路由 `router.post('/questions/:id/grade-project', teacher.gradeProject)` @ `routes/teacher.js:26` | `git show 2d1188d:server/src/controllers/teacherController.js | grep -n gradeProject` → `104:export const gradeProject …`；`git show 2d1188d:server/src/routes/teacher.js` → `26:router.post('/questions/:id/grade-project', teacher.gradeProject);` |
| **死亡（断线）** | `9c4a2fc`（2026-08-16，次日） | 该**路由行被删**、`export` 关键字被摘 ⇒ 降级为文件私有且无人调用 | `git show 9c4a2fc -- server/src/routes/teacher.js` → `-router.post('/questions/:id/grade-project', teacher.gradeProject);`；同提交控制器 diff → `-export const gradeProject …` / `+const gradeProject …` |
| **搬尸** | `67a0053`（step-9 拆分） | 已死的 `const gradeProject` 被**逐字搬入** `grade.js:14` | `git show 67a0053:server/src/infrastructure/teacher/grade.js` |
| **入土（本轮）** | 未提交 | 删除 | `git diff` |

**结论**：它不是「死于出生」，而是**出生即接线、次日被断线、两个月后被拆分搬进新家**。但**处置不变**：它自 `9c4a2fc`（2026-08-16）起已不可达，跨 3 个提交、约 2 个月，删除仍是零行为变更。（上一轮报告 §6.1 写的「最早可见版本 `152ec99` 起始终是 `const`」同样不准确 —— `152ec99` 是**晚于** `9c4a2fc` 的提交，当时早已摘掉 `export`；本轮以 `-S` 全历史回溯纠正。）

---

## 2. ★裁决 2 的执行：内建模块裸导入整条删除

按 Captain 对 §四② 的修正 —— 「语句会变空时保留执行边」**只在该模块确有加载期副作用时成立**；Node 内建与纯工具模块的裸导入是**毫无语义的噪音**。

| # | 文件 | 删前语句 | 处置 | 依据 |
| --- | --- | --- | --- | --- |
| 1 | `server/src/services/projectGrader.js:8` | `import 'fs';` | **整条删除** | Node 内建，无加载期副作用 |
| 2 | `server/src/services/projectGrader.js:9` | `import 'path';` | **整条删除** | 同上 |
| 3 | `server/src/infrastructure/rule/syntax.js:8` | `import 'node:module';` | **整条删除** | 同上 |
| — | `server/src/services/projectGrader.js:11` | `import '../utils/fileTree.js';` | **保留** | 非内建、非纯工具，保留执行边合理 |
| — | `client/src/views/admin/Monitor.vue:57` | `import 'ant-design-vue';` | **保留** | 真实模块加载边 |
| — | `server/src/infrastructure/ai/deepseek/config.js:6` | `import '../../../utils/logger.js';` | **保留** | 同上 |

**行为无损论证**：`fs` / `path` / `node:module` 是 Node **内建模块**，在任何 Node 进程中都已完成注册与初始化；`import 'fs'` 既不执行用户代码、也不改变任何状态，最多产生一次已被缓存的模块记录查询 ⇒ 删除**零可观测差异**。
**复核**：删后全仓已无任何内建模块裸导入残留（`grep -rn "import 'fs'\|import 'path'\|import 'node:module'" client/src server/src` → 无输出）。

---

## 3. ★导出面自证（真 import，非文本比对）

**方法**：把 `git show HEAD:server/src/infrastructure/teacher/grade.js`（删前原文）落到**同目录**的临时探针 `__probe-grade-old.mjs`（保证 `../ai/deepseek/index.js` 解析基准与被测文件完全一致），用**真实动态 import** 同时加载「删前」与「删后」两个模块，比对 `Object.keys(ns)`；跑完**立即删除两份探针**（已复核目录无残留）。

**原始输出**：

```
CURRENT exports (1): ["generateReference"]
BEFORE  exports (1): ["generateReference"]
  cur.generateReference typeof=function name=generateReference length=2
IDENTICAL_EXPORT_SURFACE=true
generateReference SAME_SOURCE=true
gradeProject still exported? false
```

**barrel 链路复核**（证明没有切断任何东西）：

```bash
cd server && node --input-type=module -e "const ns=await import('./src/infrastructure/teacher/index.js');
console.log(JSON.stringify(Object.keys(ns).sort()), typeof ns.generateReference);"
# → ["generateReference","parseExam","parseExamStream","uploadMaterial"] function
```

**判读**：
1. 删前删后导出面**均为 1 项且逐字相同** —— 这本身就是「`gradeProject` 从未被导出」的运行时铁证（若它曾被导出，删前应为 2 项）；
2. `generateReference` 的**函数源码逐字相同**（`SAME_SOURCE=true`）；
3. 文件面孔 = **1 条 import（`generateReferenceAnswer`）+ 1 条 export（`generateReference`）**，与裁决书「只剩 `generateReferenceAnswer` + `generateReference`」一致；
4. barrel 四个导出**一个不少**，路由 `POST /api/teacher/generate-reference` 的链路完好。

---

## 4. diff 形态复核（只允许「纯删除」）

### 4.1 源码侧：**68 行删除、0 行新增、只有一类形态**

```bash
git diff --numstat -- server/src
```
```
0       1       server/src/infrastructure/rule/syntax.js
0       65      server/src/infrastructure/teacher/grade.js
0       2       server/src/services/projectGrader.js
```

| 形态 | 出现处数 | 明细 |
| --- | --- | --- |
| **纯删除行** | 68 | 60 行 `gradeProject` 全体 + 8 条整行 import（grade.js 5 / projectGrader.js 2 / syntax.js 1） |
| 删名后保留语句（8 处具名导入删名那一类） | **0** | 本轮无 |
| 改写行 | **0** | 本轮无 |

> 即：`gradeProject` 的 5 条 import 与另 3 条内建裸导入**都是整条语句删除**，因此源码侧只落成「纯删除行」**一类**形态（比题述允许的两类更窄）。

### 4.2 基线文件侧（生成物，非手改）

`docs/pipeline/lint-baseline.json`：`5 增 / 223 删`，5 条新增全部是**门禁生成器自身的快照字段**，无一行源码：

```diff
-  "createdAt": "2026-10-11T05:22:03.584Z",
+  "createdAt": "2026-10-11T07:41:39.760Z",
-  "scannedFiles": 195,
-  "scannedLines": 33304,
+  "scannedFiles": 216,
+  "scannedLines": 33449,
-    "no-unused-vars": 31,
+    "no-unused-vars": 0,
-  "violations": [ …223 行… ],
+  "violations": []
```

### 4.3 改动文件清单（tracked）

```
 M docs/pipeline/lint-baseline.json
 M server/src/infrastructure/rule/syntax.js
 M server/src/infrastructure/teacher/grade.js
 M server/src/services/projectGrader.js
```
**4 个**，与预期完全一致；`client/`、`scripts/gates/`、其它 `docs/`、`package.json` 均未改动。

---

## 5. 两道 lint 的读取与基线新 sha256

### 5.1 ESLint（`npx eslint client/src server/src -f json`）

```
errors=0 warnings=1
  client/src/composables/question/questionPure.js:71:6 no-constant-condition
```
**ESLint = 0 error / 1 warning**，唯一残留即 **D7**（本轮按裁决保留不动）。

### 5.2 lint-check 门禁

清理后（刷新基线**前**）：
```
no-unused-vars            31         0         0     ← 当前 0 条
合计                       31         0         0
· 已消除（基线内被修掉）: 31 条
结论：PASS（无基线外新违规）      LINT_CHECK_EXIT=0
```
`--json --list` 复核：`violations: 0`、`blocking: 0`、`scannedFiles: 216`、`scannedLines: 33449`。

### 5.3 基线刷新（步骤六.2）

```
=== lint-check --update-baseline：基线已刷新 ===
文件        : docs/pipeline/lint-baseline.json
扫描        : 216 文件 / 33449 行
违规总数    : 0（旧基线 31）
```

| 项 | 值 |
| --- | --- |
| 刷新前 sha256 | `678d3d51af0f446b4e2c7e2c2226c2c3f9915b1572393651efff93812f81804c` |
| **刷新后 sha256** | **`623f4f0f00673054df6b99d2ae32b414d4e6973f30912558b401c3a5f3b3b624`** |
| 计数 | `no-undef 0 / no-unused-vars 0 / no-unresolved-import 0 / no-dupe-keys 0 / no-redeclare 0 / no-const-assign 0 / parse-error 0` |
| violations | `[]`（空数组） |

**复跑确认**：`node scripts/gates/lint-check.mjs` → 基线「0 条」、当前「0 条」、新增 0、`PASS`、**exit 0**。
**合法性说明**：这是把**已清零的现状固化为新基线**（棘轮收紧），不是消红 —— 刷新后门禁对**任何**新违规都会阻断（基线为空 ⇒ 无豁免空间），严格度单调上升。

---

## 6. 门禁七项（全部 PASS，全部与基线持平）

| # | 门禁 | 命令 | 实测读数 | 与基线 | 结论 |
| --- | --- | --- | --- | --- | --- |
| G1 | check-layers | `cd server && node scripts/check-layers.mjs` | 文件 117、**违规 0**、**未分层 42** | 持平 | PASS |
| G2 | arch-metrics | `node scripts/gates/arch-metrics.mjs` | layerViolations 0 / unmigrated 42 / **godfileOver800 1** / >500 行 12 | 持平 | PASS |
| G3 | cycle-check（server） | `node scripts/gates/cycle-check.mjs` | 117 文件 / 259 边 / **SCC 0** / 自环 0 | 持平 | PASS |
| G4 | cycle-check（client） | `node scripts/gates/cycle-check.mjs --root client/src` | 99 文件 / 244 边 / **SCC 0** / 自环 0 | 持平 | PASS |
| G5 | hard-metrics | `node scripts/gates/hard-metrics.mjs` | **hex6 0 / important 0 / modalConfirm 0** | 持平 | PASS |
| G6 | bind-check | `node scripts/gates/bind-check.mjs` | 225 模块 / 773 具名绑定 / **BINDING VIOLATIONS 0** | 持平 | PASS |
| G7 | ESLint + lint-check | 见 §5 | **0 error / 1 warning（D7）**；lint-check 当前 0 条 exit 0 | 收紧 | PASS |

> GodFile >800 行唯一项仍是 `client/src/views/Doc.vue (1106)`（未动 `client/`）。
> bind-check 的 4 条 `unresolved`（测试内构造路径）与 1 条 `external` 为**登记项、不计违规**，与上轮逐字相同。

---

## 7. 全量回归 + 定向测试

### 7.1 全量回归（`ROUND=NN LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`）

**空序号检查**：`docs/split` 现有 `test-round-08…26`，**27 为空序号**（未覆盖任何历史归档）。

**round-27（首跑）—— 1 处抖动，非本轮改动所致**：
```
→ 退出码: 1
Test Suites: 1 failed, 74 passed, 75 total
Tests:       1 failed, 1021 passed, 1022 total
```
失败项：`test/integration/t6-teacher-classid-idor.test.js` › `R-D3: 实训题实际提示词——他人提交 → 403 且无标准包/学生工程内容`，错误 `read ECONNRESET`（连接被对端重置，非断言失败）。因 `npm test` 用 `&&` 串联 4 段，段 1 失败导致段 2–4 未执行（这正是句柄只出现 1 处摘要的原因）。

**抖动定性证据**：
1. 该文件**独立进程连跑两次**：`PASS`、`18 passed / 18 total`、耗时 1.5s —— 两次全绿，说明**不是确定性失败**；
2. 同类抖动在本专项**已发生过一次**：`test-round-25.log` 同样是「1 failed / 74 passed」（失败项为 `t2-student-fields`，错误为响应体非 JSON 的 `SyntaxError`，同属非断言类的传输层失败），而 `test-round-26.log` 复跑即 4 段全绿；
3. 本轮源码改动为「删除不可达处理器 + 删除内建裸导入」，与 `t6` 用例路径（`regrade` / 越权 403）**无任何交集**。

**round-28（复跑）—— 判据达成**：
```
→ 退出码: 0 ｜ 完整日志: docs/split/test-round-28.log
   Test Suites: 75 passed, 75 total        Tests: 1022 passed, 1022 total
   Test Suites: 1 passed, 1 total           Tests: 17 passed, 17 total
   Test Suites: 1 passed, 1 total           Tests: 61 passed, 61 total
   Test Suites: 1 passed, 1 total           Tests: 21 passed, 21 total
```
**4 处 Test Suites 摘要齐备、failed = 0**（合计 1121 tests，全绿）。

> 归档声明：`docs/split/test-round-27.log` 与 `test-round-28.log` 均由题述运行手册**自行生成**，两轮都在空序号上新建，**未覆盖任何历史归档**，也非手工改动 `docs/`。

### 7.2 定向：10 个测试文件独立进程（应 10/10）

```bash
cd server
for f in test/integration/tc-b0-*.test.js test/integration/rc-*.test.js; do
  DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules \
    npx --no-install jest --config test/jest.config.js --runInBand --forceExit "$f"
done
```

| # | 文件 | 结果 |
| --- | --- | --- |
| 01 | `tc-b0-lock-assignment.test.js` | ✅ 1 suite / 3 tests |
| 02 | `tc-b0-parse-exam-stream.test.js` | ✅ 1 suite / 2 tests |
| 03 | `tc-b0-project-files.test.js` | ✅ 1 suite / 4 tests |
| 04 | `tc-b0-school-teachers.test.js` | ✅ 1 suite / 4 tests |
| 05 | `tc-b0-switch-class-school.test.js` | ✅ 1 suite / 8 tests |
| 06 | `tc-b0-upload-material.test.js` | ✅ 1 suite / 3 tests |
| 07 | `rc-batch-guard-contract.test.js` | ✅ 1 suite / 7 tests |
| 08 | `rc-export-objective-contract.test.js` | ✅ 1 suite / 3 tests |
| 09 | `rc-project-review-contract.test.js` | ✅ 1 suite / 12 tests |
| 10 | `rc-usecase-404-contract.test.js` | ✅ 1 suite / 2 tests |
| | **汇总** | ✅ **10/10 文件全绿，0 failed**（48 tests） |

---

## 8. 本轮刻意**未做**的事

| # | 项 | 原因 |
| --- | --- | --- |
| 1 | `client/src/composables/question/questionPure.js:71` 恒真正则（D7） | 修复会**改变 `detectCodeLang` 返回值** = 行为变更，属产品决策；Captain 已登记，**等用户拍板**。本轮**只保留该 ESLint 警告**。 |
| 2 | `scripts/gates/` 任何逻辑 | 硬约束；门禁脚本一行未动 |
| 3 | `client/` 任何文件 | 硬约束 |
| 4 | `grade.js` 头部注释的失真源行区间（§8 残留观察） | 硬约束是「纯删除」，改注释会引入第三类 diff 形态 |
| 5 | 任何 git 写操作 | 硬约束（未 commit / 未 add / 未 stash / 未 checkout） |

### 残留观察（供 Captain 记账，非本轮产物）

`server/src/infrastructure/teacher/grade.js:2` 的拆分溯源注释仍写「源行 159-218 · 1322-1336」。其中 `159-218` 描述的正是已删的 `gradeProject`；该区间现已无对应内容。**改动成本 1 行注释、零行为影响**，建议并入下一次触碰该文件的任务，不单独开轮。

---

## 9. 给 C 的验证指令

> 工作目录：`/Users/you/My Projects/My Vue/Exam-DeepSeek`（路径含空格，务必加引号）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"

# ── 1) 两道判据（期望：ESLint 0 error / 1 warning；lint-check 当前 0 条、exit 0）
npx eslint client/src server/src -f json | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let e=0,w=0,out=[];
  for(const f of JSON.parse(s))for(const m of f.messages){m.severity===2?e++:w++;
    out.push(f.filePath.split("/Exam-DeepSeek/")[1]+":"+m.line+" "+m.ruleId);}
  console.log("errors="+e+" warnings="+w);out.forEach(x=>console.log("  "+x));});'
#   期望：errors=0 warnings=1
#     client/src/composables/question/questionPure.js:71 no-constant-condition   ← D7，刻意保留

node scripts/gates/lint-check.mjs; echo "lint-check exit=$?"
#   期望：基线「0 条」/ 当前「0 条」/ 新增 0 / 结论 PASS / exit=0

node scripts/gates/lint-check.mjs --json --list | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const g=JSON.parse(s);
  console.log("counts:",JSON.stringify(g.counts));
  console.log("violations:",(g.violations||[]).length,"blocking:",(g.blockingViolations||[]).length);});'
#   期望：counts 全 0；violations: 0 blocking: 0

# ── 2) 基线新指纹（期望与报告 §5.3 逐字一致）
shasum -a 256 docs/pipeline/lint-baseline.json
#   期望：623f4f0f00673054df6b99d2ae32b414d4e6973f30912558b401c3a5f3b3b624
node -e 'const j=require("./docs/pipeline/lint-baseline.json");
console.log(j.createdAt, JSON.stringify(j.counts), "violations:", j.violations.length);'
#   期望：2026-10-11T07:41:39.760Z {全 0} violations: 0

# ── 3) diff 形态复核（期望：源码侧 0 增 / 68 删，只有「纯删除行」一类）
git diff --numstat -- server/src
#   期望：0 1 syntax.js ｜ 0 65 teacher/grade.js ｜ 0 2 services/projectGrader.js
git diff -- server/src | grep -cE '^+[^+]'
#   期望：0（源码侧零新增行）
git status --short | grep -v '^??'
#   期望：恰好 4 个 M（3 个 server/src 文件 + docs/pipeline/lint-baseline.json）

# ── 4) ★导出面自证（真 import：删前 vs 删后逐字等价，且只剩 generateReference）
GRADE=server/src/infrastructure/teacher/grade.js
git show HEAD:$GRADE > server/src/infrastructure/teacher/__probe-grade-old.mjs
node --input-type=module -e '
const cur = await import("./server/src/infrastructure/teacher/grade.js");
const old = await import("./server/src/infrastructure/teacher/__probe-grade-old.mjs");
const kc=Object.keys(cur).sort(), ko=Object.keys(old).sort();
console.log("CURRENT:",JSON.stringify(kc)," BEFORE:",JSON.stringify(ko));
console.log("IDENTICAL_EXPORT_SURFACE="+(JSON.stringify(kc)===JSON.stringify(ko)));
console.log("generateReference SAME_SOURCE="+(String(cur.generateReference)===String(old.generateReference)));'
rm server/src/infrastructure/teacher/__probe-grade-old.mjs   # ⚠️ 复核后务必删除探针
ls server/src/infrastructure/teacher/
#   期望：IDENTICAL_EXPORT_SURFACE=true ／ SAME_SOURCE=true
#         CURRENT 与 BEFORE 均为 ["generateReference"]
#         探针删除后目录只剩 exam-parse.js grade.js index.js uploads.js

# ── 5) 「删 gradeProject 未切断任何东西」的链路复核
cd server && node --input-type=module -e '
const ns=await import("./src/infrastructure/teacher/index.js");
console.log(JSON.stringify(Object.keys(ns).sort()), typeof ns.generateReference);'
#   期望：["generateReference","parseExam","parseExamStream","uploadMaterial"] function

# ── 6) 内建裸导入已整条删除且无残留
grep -rn "import 'fs'|import 'path'|import 'node:module'" client/src server/src   # 期望：无输出
sed -n '5,12p' server/src/services/projectGrader.js   # 期望：import '../utils/fileTree.js'; 仍在（保留）

# ── 7) 门禁七项（期望全 PASS、与基线持平）
( cd server && node scripts/check-layers.mjs )            # 违规 0 / 未分层 42
node scripts/gates/arch-metrics.mjs                       # 0 / 42 / GodFile 1 → PASS
node scripts/gates/cycle-check.mjs                        # server/src SCC 0
node scripts/gates/cycle-check.mjs --root client/src      # client/src SCC 0
node scripts/gates/hard-metrics.mjs                       # 0/0/0
node scripts/gates/bind-check.mjs                         # BINDING VIOLATIONS 0

# ── 8) 全量回归（本轮已归档，勿覆盖；期望 4 处摘要 + failed=0）
grep -E "^Test Suites:|^Tests:" docs/split/test-round-28.log
#   期望：75/75 · 17/17 · 61/61 · 21/21，全部 passed，无 failed

# ── 9) 定向 10 文件（独立进程；先派生测试库 URL，只换库名、凭据不回显）
TEST_URL="$(node -e '
const fs=require("fs");const t=fs.readFileSync("server/.env","utf8");
const m=t.match(/^DATABASE_URL=(.*)$/m);const u=new URL(m[1].trim().replace(/^"|"$/g,""));
u.pathname="/exam_system_test";process.stdout.write(u.toString());')"
cd server
for f in test/integration/tc-b0-*.test.js test/integration/rc-*.test.js; do
  printf "── %s : " "$f"
  DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules     npx --no-install jest --config test/jest.config.js --runInBand --forceExit "$f" 2>&1 \
    | grep -E "^(Test Suites:|Tests:)" | tr '\n' ' '; echo
done
#   期望：10 个文件均 Test Suites: 1 passed, 1 total ／ Tests 全 passed、failed=0

# ── 10) 抖动复核（可选：验证 round-27 的失败确为连接级抖动）
DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules \
  npx --no-install jest --config test/jest.config.js --runInBand --forceExit \
  test/integration/t6-teacher-classid-idor.test.js
#   期望：PASS ／ 18 passed, 18 total
```

**驳回条件（任一命中即请驳回本轮）**：
1. 源码侧 `git diff` 出现**任何新增行**（`git diff -- server/src | grep -cE '^\+[^+]'` ≠ 0）；
2. 导出面自证出现 `IDENTICAL_EXPORT_SURFACE=false`，或 `BEFORE` 不是 `["generateReference"]`；
3. ESLint warning ≠ 1，或那条不是 `questionPure.js:71 no-constant-condition`；
4. lint-check 当前 ≠ 0 条，或基线 sha256 ≠ `623f4f0f…`；
5. 门禁七项任一读数低于基线（尤其 check-layers 违规 ≠ 0 / arch GodFile ≠ 1）；
6. `test-round-28.log` 出现任何 failed，或摘要不足 4 处；
7. 定向 10 文件任一未通过。

---

## 附：产物清单

| 类型 | 路径 | 规模 |
| --- | --- | --- |
| 改 | `server/src/infrastructure/teacher/grade.js` | −65 行（88 → 23） |
| 改 | `server/src/services/projectGrader.js` | −2 行 |
| 改 | `server/src/infrastructure/rule/syntax.js` | −1 行 |
| 改 | `docs/pipeline/lint-baseline.json` | 31 → 0 条（生成器刷新） |
| 新 | `docs/pipeline/lint-cleanup-2.md` | 本报告 |
| 新（运行手册生成） | `docs/split/test-round-27.log`、`docs/split/test-round-28.log` | 回归归档 |

新增依赖：**无**。联网：**无**。git 写操作：**无**。
