# reviewController 拆分 · step 8 独立验证报告（Agent C）

- **step**: 8 ｜ **角色**: Agent C（独立验证者，对抗性立场：**不采信 B 的自测**，装置全部自建，**未复用 B 的 `/tmp/splitB/*` 任何脚本**）
- **日期**: 2026-10-11 ｜ **分支**: master ｜ **技能**: tech-test-automation
- **被验对象**: **工作树（未提交状态）** —— 11 个新文件（interface 6 + infrastructure 5，含 2 barrel）+ I1(`routes/teacher.js`) + I2(`projectReviewController.js`) + 删除源文件
- **版本锚点**: `HEAD = 286438bd508d31752a840f6aea3a0f0f881c780f`（B0b 提交）；**基线锚点自证** = `git show HEAD:server/src/controllers/reviewController.js` → sha256 `62ec56ed4c647687a09bcd2329c5ceeca1968610e9495a7fa1a31d4fb1481add`、965 行、**43827 字节**（三项全中）
- **基线正确性的第二重证据**: `diff <(git show HEAD:…reviewController.js) <(git show 1b713b8:…reviewController.js)` = **空** ⇒ HEAD 的版本与 A 方案锚点提交逐字节相同；该文件最后一次被改是 `152ec99`（早于本步）
- **一句话结论**: **PASS —— 拆分行为等价、契约完好、门禁全部优于基线**；发现 **1 处纯文档行号笔误**（B 报告 §10 第四处旧行号 `:413` 应为 `:415`），**无阻断缺陷**。

> **硬边界**：本轮除本报告 + 回归日志 `docs/split/test-round-19.log` 外，**未写入/创建/删除任何仓库内文件**；全部装置在 `/tmp/cv8/`；**零 git 写操作**（只有 rev-parse / show / log / status / diff / archive）；测试只跑 `exam_system_test`、显式 `PORT=0`；**未联网**（探针 61 例 × 3 次运行 = **0 次真实外网请求**，见 §7.4）；未碰 `:5173`/`:3000`、`client/dist`、`tests/`；**未刷新任何基线**。

---

## 0 判据总表（期望 vs 实测）

| # | 判据（来源） | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V-1 | 版本锚点（W1） | `62ec56ed…` / 965 行 / 43827 B | 三项逐字命中；且 = 方案锚点 `1b713b8` 版本 | ✅ |
| V-2 | **25 块切片判等**（W2） | 0 块不等 | **25/25 逐字节命中**，每块命中数恰 **1**；复算哈希与 B 表 **25/25 相同** | ✅ |
| V-3 | **反向校验**（W2） | 未匹配字节 = 0 | **GRAND UNMATCHED = 0**（11 文件全部 0，且无「未覆盖行」） | ✅ |
| V-4 | 块序保持（我加的对抗项） | 同源相对顺序不变 | 11/11 文件 **ORDER-OK** | ✅ |
| V-5 | **导出面**（W4） | 17 名逐字等价 | BEFORE 17 == AFTER 契约面 17（集合逐字相等）；唯一多出内部名 `resolveVisibleClassScope` | ✅ |
| V-6 | **T6 ∩ T11 = ∅ / 无静默遮蔽**（W4） | 交集空、键 = 并集 | 交集 **[]**；`Object.keys({...T6,...T11})` **== 并集**（18） | ✅ |
| V-7 | 函数源文本等价（我加的对抗项） | —— | 17/17 名 `sha256(fn.toString())` **前后相同** | ✅ |
| V-8 | 路由面（W6） | 16 行不动 + 名字可解析 | `review.` 行**逐字相同**、`router.` 计数 60 == 60、**16/16 handler 在合并命名空间中可解析** | ✅ |
| V-9 | **interface 红线**（W5） | interface→infrastructure = 0 | **AST 判定 = 0**（import 与 export-from 两类都算）；且我的装置在**注入违规的副本上能报 1** | ✅ |
| V-10 | F4 盲区复现（W5 证伪） | 门禁看不见非法 re-export | 注入后 `check-layers` 仍「违规 0 条」、`cycle-check` 仍 PASS ⇒ **盲区属实** | ✅ |
| V-11 | **lint 迁移三元组**（W9） | 搬运而非修一处加一处 | `{rule:no-unused-vars, symbol:count, text:'let count = 0;', count:1}`；`:354 → batch.js:78`；31→31；`blockingViolations=[]`、exit 0 | ✅ |
| V-12 | 基线未被刷新（W9） | sha256 不变 | `678d3d51…` == `git show HEAD:` 同值；mtime 13:22（早于 B 的 13:41 写入窗） | ✅ |
| V-13 | **B0b 假阳性防御**（W10） | 改替身文案必红 | 原样 **2 passed**；替身文案→`提交不存在` **2 failed/exit 1**；改抛出文案同样 **2 failed**；恢复 **2 passed** | ✅ |
| V-14 | **四维对拍**（W11） | byte-identical | **61 例 / 16 条路由全覆盖**；before 连跑两次相等；before == after **逐字节相同**（仅 mode 标签）；**0 自检失败** | ✅ |
| V-15 | 硬禁网（W11） | 0 次真实外网 | `totalFetch = 0`（每例 `fetch` 数组为空；3 次运行合计 0） | ✅ |
| V-16 | **变异反证**（W11） | ≥3 处必须报差异 | **7 处语义变异全部报差异**（含 3 处与 B 的目标不同）；**2 处惰性对照 0 差异** | ✅ |
| V-17 | 门禁七项 | 见 §10 | 违规 0 / 未分层 **43** / GodFile **2** / SCC 0（server 238 边、client 244 边）/ hard 0-0-0 / bind 0（208 modules, 710 bindings）/ eslint **0-59** / lint-check **exit 0** | ✅ |
| V-18 | 未修项逐字保留 | 一处未修 | 死变量 `count`、`export.js:87` 空答早退、12×1003 / 11×403 / 全部 15 条文案、3+1 处无 message 成功体、`req.app.locals` ×3 —— **逐字在** | ✅ |
| V-19 | V-D1 最终树干净 | 无残留/无半成品 | 无 `.bak/.orig/.rej/~/.tmp`；仅 2 处一行改 + 1 处整体删 + 11 新文件；保护路径 mtime 全部早于 13:41 | ✅ |
| V-20 | 全量回归 | 4 处摘要 + failed 0 | exit 0；**4 处 `Test Suites:`**；四段 69/998 · 1/17 · 1/61 · 1/21 = **1097 passed / 0 failed**；`^FAIL` = 0 | ✅ |

---

## 1 工作树状态与方法总述

### 1.1 工作树（`git status --porcelain -uno` 原文）

```
 M server/src/controllers/projectReviewController.js
 D server/src/controllers/reviewController.js
 M server/src/routes/teacher.js
```

`git diff -U0 -- server/src/routes/teacher.js server/src/controllers/projectReviewController.js` **只有 2 个 hunk，各 1 行**：

```diff
@@ -18 +18 @@
-import { isStudentVisibleToTeacher } from './reviewController.js';
+import { isStudentVisibleToTeacher } from '../infrastructure/review/scope.js';
@@ -5 +5,3 @@
-import * as review from '../controllers/reviewController.js';
+import * as reviewHttp from '../interface/http/controllers/review/index.js';
+import * as reviewIo from '../infrastructure/review/index.js';
+const review = { ...reviewHttp, ...reviewIo };
```

`git diff --stat -- server/src` = `3 files changed, 4 insertions(+), 967 deletions(-)`（−965 源文件 −1 旧 import +1 新 import … 逐项对得上）。

### 1.2 我自建的装置（仓库外，`/tmp/cv8/`）

| 装置 | 路径 | 用途 |
|---|---|---|
| 冻结基线 | `/tmp/cv8/before/`（`git archive HEAD server`） | W2 切片基准、W11 BEFORE 树（先自证 sha256 / 行数 / 字节数） |
| 切片脚本 | `w2-slice2.mjs`（acorn 8.19.0） | 25 块边界**自行推导**、哈希复算、双向校验 |
| 导出面探针 | `w4-export.mjs` | 两独立进程真 import，`Object.keys` + `fn.toString()` 哈希 |
| 红线扫描器 | `w5-ast.mjs` | 只读 AST 的 import / export-from 规格符（注释天然排除） |
| 对拍探针 | `probe/run.mjs`（+ `probe/prisma-stub.js`） | 三桩 + req/res 探针；61 例四维对拍 |
| 覆盖统计 | `coverage.mjs`（V8 coverage，跨 VM context 取 max、realpath 归一） | 被执行的函数 / 未执行的函数两张清单 |
| 变异装置 | `mutate.sh` / `mutate2.sh` / `casediff.mjs` | 9 处变异（含 2 处惰性对照）+ 逐例红集定位 |
| 假阳性复现 | `w10.sh` | B0b 用例的变异副本复跑（沙盒 `/tmp/cv8/w10/server`） |

---

## 2 ★W2 —— 25 块切片判等（自建实现）

**基准**：`git archive HEAD server` → `/tmp/cv8/before/server/src/controllers/reviewController.js`，实测 `sha256 = 62ec56ed…`、`965` 行、`43827` 字节 ✔。

**方法（与 B 无关）**：

1. 用 **acorn** 解析冻结副本，取**顶层语句**（`FunctionDeclaration` / `ExportNamedDeclaration`，后者含 `const + 箭头` 形态）的 `loc` 区间 —— 实测顶层语句 **恰 25 个**（24 个顶层声明 + 嵌套 `scoreItem`）；
2. 起点向上吞并**紧邻注释行**；若再上方是「空行 + `// ==== 段落横幅 ====`」，则把横幅一并纳入（这是 plan §6.2 对 T9/T10 的口径）；
3. 逐块求 sha256，再在 **11 个新文件**里做**字节子串定位**（`split().length-1`）。

**结果**：

| 项 | 实测 |
|---|---|
| 25 块逐块命中 | **25/25 命中**，**每块命中数恰为 1**（无一块缺失、无一块重复） |
| 复算 sha256 vs B 报告 §5 的 25 个哈希 | **25/25 完全相同**（0 处不符） |
| 块归属（命中文件） | 与 B 的 T1–T11 分配表**逐块一致**（见下两行汇总） |
| 每文件块数 | batch 4 · class-scope 1 · export 2 · list 4 · summary 2 ｜ project 3 · prompts 2 · scope 3 · submission 4 ｜ 两个 barrel **0**（合计 25） |

**边界口径的一处差异（不是缺陷）**：`scoreItem` 的上一行 `:679` 是紧邻注释 `// 计算每道客观小问的学生得分`。

- 我按「吞并紧邻注释」推出 `679-703`（sha `cb55179a…`）；
- plan / B 用 `680-703`（sha `04989aa9…`）；
- **两者都在 `export.js` 里逐字存在**（命中数各 1）⇒ B 携带了该注释且未改一字；复算 plan 区间的哈希与 B 表**相同**。

### 2.1 反向校验（每个非空白字节的归因）

**方法**：用 AST 求「已覆盖字符区间」的并集 = ① 25 块的全部出现区间 ∪ ② **全部 `Import/Export*` 语句区间**（acorn 节点范围）∪ ③ 文件头 banner 注释区间；然后扫描**每一个非空白字符**是否被覆盖，并额外列出「未覆盖的整行」。

**结果（11 个文件全部 0）**：

| 文件 | import/export 语句 | banner 注释 | 块出现数 | **未匹配非空白字符** | 未覆盖行 |
|---|---|---|---|---|---|
| interface/…/batch.js | 6 | 1 | 4 | **0** | 0 |
| interface/…/class-scope.js | 2 | 1 | 1 | **0** | 0 |
| interface/…/export.js | 4 | 1 | 2 | **0** | 0 |
| interface/…/index.js | 5 | 1 | 0 | **0** | 0 |
| interface/…/list.js | 6 | 1 | 4 | **0** | 0 |
| interface/…/summary.js | 7 | 1 | 2 | **0** | 0 |
| infrastructure/review/index.js | 4 | 1 | 0 | **0** | 0 |
| infrastructure/review/project.js | 10 | 1 | 3 | **0** | 0 |
| infrastructure/review/prompts.js | 6 | 1 | 2 | **0** | 0 |
| infrastructure/review/scope.js | 4 | 1 | 3 | **0** | 0 |
| infrastructure/review/submission.js | 7 | 1 | 4 | **0** | 0 |
| **合计** | | | **25** | **0** | **0** |

⇒ **每一个非空白字节都可归因于「源切片 / banner / import 行 / export 行」**，无夹带改写。（注：我的 block 集合是「吞并注释后的极大块」，因此 B 口径下被单列的 `:679` 注释也被自然覆盖。）

### 2.2 我额外加的对抗项

- **块序保持**：在每个新文件内按出现偏移排序，其「源行号」序列必须单调递增 —— **11/11 文件 ORDER-OK**（无跨文件调序、无倒序拼接）。
- **无重复副本**：全仓（排除 node_modules/.git）搜「405 行批处理 403 文案」只命中 `batch.js` + 文档/测试；预拆分文件的**唯一另一份完整副本**是 `tests/ui-redesign-verify/rig-server/src/controllers/reviewController.js`（mtime **2026-10-10 02:05**、sha 前缀 `62ec56ed4c64`、965 行）—— **步骤前既有、未被本步触碰**（`tests/` 未跟踪，用 mtime 旁证）。

---

## 3 ★W4 —— 导出面（真 import，两独立进程）

**BEFORE**：`/tmp/cv8/before/server/src/controllers/reviewController.js`（冻结副本+node_modules 软链，`PORT=0`）
**AFTER**：工作树 `interface/…/review/index.js` + `infrastructure/review/index.js`（**直接 import 被验工作树**）

```
BEFORE count = 17 :: batchPublish,batchReview,exportReviewData,getProjectReview,getQuestionPromptPreview,
                     getReviewByClass,getReviewQuestions,getReviewSummary,getSubmissionDetail,getSubmissionPrompt,
                     getSubmissions,isStudentVisibleToTeacher,publishScores,regradeSubmission,
                     reviewProjectSubmission,reviewSubmission,updateScore
T6  count = 9 :: batchPublish,batchReview,exportReviewData,getReviewByClass,getReviewQuestions,getReviewSummary,
                 getSubmissions,publishScores,resolveVisibleClassScope
T11 count = 9 :: getProjectReview,getQuestionPromptPreview,getSubmissionDetail,getSubmissionPrompt,
                 isStudentVisibleToTeacher,regradeSubmission,reviewProjectSubmission,reviewSubmission,updateScore
T6 ∩ T11 = []                       ← 独立复算（B 报 ①）
SPREAD keys == UNION ? true         ← 独立复算（B 报 ②「无静默遮蔽」）
CONTRACT (spread 去掉 resolveVisibleClassScope) == BEFORE ? true   （17 == 17，逐名相等）
names only in BEFORE = []   |   names only in AFTER = ["resolveVisibleClassScope"]
non-function exports = []
fn.toString() sha256 identical for 17 / 17 | differing: []
```

**我对 B 两条论证的独立复核结论**：

1. **`T6 ∩ T11 = ∅` 成立** —— 我用**两个命名空间对象**自己求交集（不读 B 的结论），为空；
2. **无静默遮蔽成立** —— 判据不是「我看了名字」，而是 **`Object.keys({...http, ...io})` 的键集合 == `new Set([...T6, ...T11])` 的并集**（18 == 18）；若存在同名，展开结果的键数会**小于**并集基数，实测相等 ⇒ **不存在被覆盖的导出**。
3. **我加的证据**：对 17 个名字逐个比 `sha256(fn.toString())`，**17/17 相同** ⇒ 不只是名字一致，**函数源码文本也逐字相同**（与 §2 的块判等互相印证）。
4. 唯一多出的 `resolveVisibleClassScope`（T1 的同层共享名）**不在 I1 的契约面**：见下。

**路由面端到端**（比 bind-check 更贴近运行时）：从 `routes/teacher.js` 抽出全部 `review.<name>`（**16 个**），在 `{...reviewHttp, ...reviewIo}` 上解析 → **missing = []**；`review.` 行与 HEAD **逐字相同**；`router.` 声明数 **60 == 60**（无增删路由）。

---

## 4 ★W5 —— interface 红线（我用的方法与结果）

**方法（明确排除 banner 文本干扰）**：**不用 grep**。用 acorn 解析 `server/src/interface/**` 的每个 `.js`，**只取 AST 里的 `ImportDeclaration.source` 与 `ExportNamedDeclaration/ExportAllDeclaration.source`**（注释在 AST 中不构成 source，结构上不可能被误判），对相对规格符 `path.resolve(dirname(file), spec)` 求真实目标，再按 `server/src` 首段判层。

**结果**：

| 侧 | 相对边 | import | export-from | 目标层分布 |
|---|---|---|---|---|
| interface（6 文件） | **18** | 13 | 5 | unlayered **15**（`utils/*`、`constants.js`、`controllers/teamController.js`）+ **同层 interface 3**（`./class-scope.js`） |
| infrastructure/review（5 文件） | **16** | 12 | 4 | unlayered 11 + **同层 infrastructure 5** |

- **`interface → infrastructure`（import 与 export-from 两类合计）= 0** ✅
- **`infrastructure → {interface, application}`（本步新文件）= 0** ✅（全仓另有 3 条 `infrastructure/bootstrap/compose.js → application/use-cases/*`，属**组合根**且**本步未触碰**——`git status` 可证）
- 相对规格符全部可解析（unresolved = 0）
- 两个 barrel 的 **9 行 re-export 全部同层**（T6→interface 5 文件、T11→infrastructure 4 文件）

**证伪（证明门禁确有盲区、我的装置有牙）**：把整棵 `server/src` + `check-layers.mjs` + `cycle-check.mjs` + 基线复制到 `/tmp/cv8/ctl`，**向副本的 interface barrel 追加一行非法 re-export**：

```js
export { getProjectReview } from '../../../../infrastructure/review/project.js';
```

| 装置 | 干净副本 | 注入违规后 |
|---|---|---|
| `node server/scripts/check-layers.mjs`（官方） | 违规 0 / 未分层 43 | **违规 0 条（0 类规则）** ← 全盲 |
| `node scripts/gates/cycle-check.mjs`（官方） | SCC 0 / PASS | **SCC 0 / PASS** ← 全盲 |
| **我的 AST 扫描器** | 0 | **1（interface-imports-infra，stmt=ExportNamedDeclaration）** |

源码级原因（读门禁正文确认）：`check-layers.mjs:28` 的 `IMPORT_RE` 与 `cycle-check.mjs:42` 的 `IMPORT_RE` 都要求字面量 `import` / `require(` / `import(` ⇒ `export … from` 不可见（plan §2.1-F4 属实）。
⇒ **B 的 D7 提醒成立**：裸 `grep infrastructure` 会命中 banner 注释；本报告的红线结论完全基于 AST，不依赖文本匹配。

---

## 5 ★W9 —— lint 迁移三元组的人工核对

**`node scripts/gates/lint-check.mjs --json`（exit 0）**：

```json
{"gate":"lint-check","scannedFiles":205,"scannedLines":33418,"parseFailedFiles":0,
 "counts":{"no-undef":0,"no-unused-vars":31,"no-unresolved-import":0,"no-dupe-keys":0,"no-redeclare":0,"no-const-assign":0,"parse-error":0},
 "baseline":{"path":"docs/pipeline/lint-baseline.json","total":31},
 "newViolations":[{"rule":"no-unused-vars","file":"server/src/interface/http/controllers/review/batch.js","line":78,"symbol":"count"}],
 "resolved":[{"key":"server/src/controllers/reviewController.js\u0000no-unused-vars\u0000count","delta":1}],
 "blockingViolations":[],
 "migrations":[{"rule":"no-unused-vars","symbol":"count","text":"let count = 0;","count":1,
                "from":[{"file":"server/src/controllers/reviewController.js","line":354}],
                "to":[{"file":"server/src/interface/http/controllers/review/batch.js","line":78}]}],
 "verdict":"PASS"}
```

**人工核对（这一步才是判据，exit 0 不算过）**：

| 核对项 | 实测 |
|---|---|
| `from` → `to` | `reviewController.js:354` → `review/batch.js:78` —— 与 B 登记**逐字相同** |
| `rule` / `symbol` / 规范化文本 | `no-unused-vars` / `count` / `let count = 0;` —— **三项全同**，`count = 1`（两侧各 1 条，数量一一相等） |
| 旧树 `count` 出现位置 | `354` `let count = 0;` · `365` `count = toReview.length;` · `367` 响应体 `data:{count:…}` · **`415`** 响应体 `data:{count:…}`（另 `:188`、`:462`、`:504` 是 `submission.count/_count`，与死变量无关） |
| 新树 `count` 出现位置 | `batch.js:78` · `:89` · `:91` · `:139` —— **与旧树按块偏移 −276 一一对应**（354−276=78、365−276=89、367−276=91、415−276=139） |
| 是否新增 `count` | 旧树 `let count = 0;` **1 处**、新树 **1 处**；无第二条同类违规 |
| 基线文件是否被改 | `shasum -a 256 docs/pipeline/lint-baseline.json` = `678d3d51af0f446b4e2c7e2c2226c2c3f9915b1572393651efff93812f81804c`，与 `git show HEAD:` **同值**；`git status` 对其为空；mtime `13:22`（**早于 B 的 13:41 写入窗**）⇒ **未刷新** |
| 两道 lint 互证 | eslint `warn 59`（总数不变），唯一新树命中 = `batch.js:89 no-unused-vars 'count' is assigned a value but never used` |

**「搬运而非修一处 / 加一处」的完整论证**（针对约束包第 18 条点名的固有等价类）：迁移识别无法从键上区分这两者，但它**可以被字节判等排除**：

1. `batchReview`（含 `:354/:365`）与 `batchPublish`（含 `:415`）两个搬移块与冻结源**逐字节相同**（§2，sha 命中）⇒ 旧处**没有被修**；
2. 源文件是**整文件删除**（`git diff --stat`：`reviewController.js | 965 -----`，−965 行）⇒ 旧键必然 `resolved`；
3. 新树 `count` 的位置集合与旧树**按块内偏移严格一一对应**，且总出现数不变 ⇒ 新处**不是新加的违规**。
⇒ **判定：真实的「同一处缺陷换宿主」**，与 B 登记一致，不构成阻断。

> **需更正的 B 文档事实（纯文档，低）**：B 报告 §10 写「旧树为 `:354 / :365 / :367 / :413`」——**第四处应为 `:415`**（`:413` 是 `batchPublish` 循环体内的另一行）。代码侧无影响。

---

## 6 ★W10 —— B0b 假阳性防御的独立复现

**装置**：`/tmp/cv8/w10/server` = 当前**拆分后**工作树的 rsync 副本（真实 app + 真实 MySQL `exam_system_test` + `PORT=0`）；被测文件 `test/integration/rc-usecase-404-contract.test.js`（sha `e2c7ccf8…`）。

| 轮次 | 变异 | 结果 |
|---|---|---|
| ① 原样 | 无 | `Test Suites: 1 passed` / **`Tests: 2 passed, 2 total`** / exit 0 |
| ② **MUT-A** | 两条替身常量 → 守卫文案 `'提交不存在'`（即任务书要求的「把替身文案改成提交不存在」） | **`Tests: 2 failed, 2 total`** / exit **1**（T-Z7、T-Z8 双红） |
| ③ **MUT-B** | 常量不动，只把**实际抛出的**文案改成 `GUARD_MESSAGE`（更强的一刀：绕过常量断言，直打响应体断言） | **`Tests: 2 failed, 2 total`** / exit **1** |
| ④ 恢复 | 还原原文件（sha 复核 `e2c7ccf8…`） | `Tests: 2 passed` / exit 0 |

**结论**：该用例**有分辨力** —— 它对「替身文案 == 守卫文案」这一 C4 陷阱**必须变红**（两处断言各拦一刀：`expect(REGRADE_404).not.toBe(GUARD_MESSAGE)` 与 `expect(res.body.message).not.toBe(GUARD_MESSAGE)`），并辅以「替身被调用恰 1 次 + cmd 逐字」；**B0b 的防假阳性落地有效**，不构成「补了一例其实打在守卫上的假阳性」。

**额外收获**：第 ①/④ 轮的绿色是在**拆分后的树**上、经真实 HTTP + 真实守卫 + 真实用例层端口替身跑出来的 ⇒ 这条链路在拆分后依然可用（`req.app.locals.reviewUseCases` 间接层未被拆分改掉）。

---

## 7 ★W11 —— 四维行为对拍（本轮最核心的行为证据）

### 7.1 装置（三桩 + 两探针，两侧逐字相同）

| 桩 | 实现 |
|---|---|
| **S-A 网络** | 探针**第一行**（早于任何 import）装 `globalThis.fetch = (url,opts) => { fetchLog.push(...); return 599 }`，并置 `DEEPSEEK_BASE_URL=http://127.0.0.1:9` |
| **S-B DB** | **自建内存 prisma**（`prisma-stub.js`）：支持 `where`（等值 / `in` / `not` / 比较 / `startsWith` / `AND·OR·NOT` / **关系过滤 `some·none·every`**）、`select/include`（含 `_count`）、`orderBy`（含**关系路径**排序）、`skip/take/distinct`、`findUnique/findFirst/findMany/count/update/updateMany/create/deleteMany`、`$transaction(promises)`（按 plan §12-10 的语义：入参是**已被调用的 Promise 数组**，`update` 在调用时**立即记账**）；暴露 `__db/__log/__reset` —— **两棵树注入同一份** |
| **S-C 时钟** | `globalThis.Date` 冻结为 `F=1760000000000`（否则 `reviewedAt:new Date()` 必致边界不等） |
| 探针 req/res | `res` 复刻 `status(x).json(y)` 链式；**逐例断言「json 恰被调用 1 次」**（防拆分把分支变成双写）；`req.app.locals.reviewUseCases` 为记录型替身（三方法记账 + 可抛 `EntityNotFoundError`） |
| 两独立进程 | BEFORE = `/tmp/cv8/before/server`（冻结树，sha 已自证）；AFTER = `/tmp/cv8/after/server`（工作树 rsync）；两侧 `uploads/` 夹具**逐字节相同** |

**四维**：① 返值 `{status, jsonCalls, body}`（键序即插入序，不 sort —— §1.4-4 的「无 message」形状本身就是契约）；② **终态 DB** 快照；③ **有序调用日志**（每次 prisma 操作的 `{model,op,args}` 按序 + 用例替身调用序）；④ **fetch 请求体**。

### 7.2 覆盖（61 例，**16/16 条路由全覆盖**）

| 组 | 路由 | 例子要点 |
|---|---|---|
| R1 | `GET /submissions` | 无参 / schoolId+classId+分页 / **不可见 classId 收敛为空** / 多值 status + page=0 |
| R2 | `GET /review-questions` | 正例 · **403/1003 '无权访问该班级'** |
| R3 | `GET /submissions/:id` | 200 · **403 '无权访问该提交'** · 404 · **400 '参数错误'（id=abc）** |
| R4 | `POST /:id/regrade` | 200（替身返值 + cmd 逐字） · **404/1004 替身 EntityNotFoundError** · 403 且**替身零调用** |
| R5 | `PUT /:id/score` | 200 · **404/1004（Z8）** |
| R6 | `PUT /:id/review` | 200 · 403 |
| R7 | `POST /batch-review` | 200（**$transaction 5 条 update、reviewedAt=冻结时钟**）· **400 '请选择学校'** · **400 '练习模式无需审核'** · **403 '无权操作该班级'** |
| R8 | `POST /batch-publish` | 200（updateMany id 序逐字）· **400 '练习模式无需发布'** |
| R9 | `PUT /publish` | **空数组 → 400 '请选择提交'** · 缺字段 → 400 · **部分不可见 → 403 + rejectedIds** · 200 |
| R10 | `GET /review-summary` | **非法 schoolId fail-closed 且响应体无 message** · 正常行 · **不可见 classId 收敛为空** |
| R11 | `GET /review-class/:classId` | 200（无 message）· 403 · **filter 四态 × sort × keyword 四例** |
| R12 | `GET /export-review` | 400 缺参 · 400 非整数 assignmentId · 403 · **200（主观题 + 客观题四型 choice/multi_choice/judge/fill）** · 全未提交 → `totalScore:null` · **空参考答案+空答 → 早退 0** |
| R13 | `GET /:id/project` | 200 有标准包 / 200 无标准包 / 200 历史 attachmentUrl / **aiFeedback 非法 JSON → {overallComment}** / currentVersion=0 / 404 / 400 非实训题 / 403 无权操作 |
| R14 | `PUT /:id/project/review` | 钳制上限/下限 · `'abc'`→NaN 直通 · 不传 finalScore · **R3 评语不回退 AI（保留既有）** · 403 双态（无写入） |
| R15 | `GET /questions/:id/prompt-preview` | 200（system/user 存在）· 404 · 403 |
| R16 | `GET /submissions/:id/prompt` | 200 · 400 '该提交不是编程题' · 404 |

### 7.3 对拍结果

```
SELF-CHECK OK : before1.json == before2.json           （装置确定性）
CROSS-CHECK OK: before == after（仅 mode 标签不同）    （byte-identical, cmp 无差异）
checkFailures : before 0 / after 0                     （61×5 条自检：status/code/message 期望、json 恰一次、无未捕获异常、无网络）
GRAND: 61 例 × 4 维 全部相等
```

### 7.4 硬禁网证据

| 项 | 实测 |
|---|---|
| `DEEPSEEK_BASE_URL` | `http://127.0.0.1:9`（不可路由） |
| `fetchLog` 合计 | **0**（61 例，两侧各 1 次 + 1 次自检运行 = **3 次全量运行，总计 0 次请求**） |
| 逐例断言 | 每例都有 `ck('no network', fetchLog.length === 0)`，无一失败 |

### 7.5 变异反证（9 处：7 处语义 + 2 处惰性对照）

| # | 变异（目标文件） | 语义 | 结果 | 红集（逐例定位） |
|---|---|---|---|---|
| M1 | `batch.js` `isProject ? s.teacherFeedback : s.aiFeedback` **三元互换** | 实训题评语来源反转 | **DIFF** | R7a（db+log） |
| M2 | `project.js` 去掉 `Math.max(0, Math.min(max, …))` 钳制 | 分值钳制失效 | **DIFF** | R14a/R14b（ret+db+log） |
| M3 | `summary.js` `reviewPending: isPractice ? 0 : reviewPending` → `reviewPending` | practice 特判失效 | **DIFF** | R10b（ret） |
| M4 | `export.js` `:87 if(!sAns) return 0;` → `if(false)…` | 空答早退失效 | **DIFF** | R12f（ret） |
| **M6** | `class-scope.js` 去掉 `visibleClassIds.includes(cid)` 判定 | 跨班放行 | **DIFF** | R2b / R11b / R12c（ret+log）**3 例** |
| **M7** | `summary.js` R5 fail-closed 分支失效 | 非法 schoolId 不再收敛 | **DIFF** | R10a（**仅 log 维**） |
| **M8** | `export.js` fill 判分改大小写敏感 | 判分口径变化 | **DIFF** | R12d（ret） |
| M5 | `list.js` 插入一行纯注释 | **惰性对照** | **NO-DIFF** ✅ | —— |
| M9 | `list.js` 纯空白/换行改动 | **惰性对照** | **NO-DIFF** ✅ | —— |

**要点**：

- 变异全部施加在 `/tmp/cv8/mut`（每次 `rsync` 全新副本），**仓库内产品代码零改动**。
- M1/M2/M3 与 B 方案 §7.4 的三处**目标相同但装置独立**；**M4/M6/M7/M8 是我另选的四处**（覆盖空答早退、班级可见集、fail-closed、判分等价类），全部报差异 ⇒ 装置有分辨力。
- **M7 只被「有序调用日志」这一维抓到**（返回值与 DB 都相同：因为 `schoolId=NaN` 的 where 在全表匹配下同样收敛为空）——这是「四维不可减维」的实测证据。
- **M4 值得单独记**：B0 轮（22 例网）该行是**唯一幸存者（CM9）**；本轮我**先**在 57 例版本上复现了同样的幸存（NO-DIFF），**再**补了 R12f 夹具（空参考答案 + 空答）后它才变成可观测 ⇒ 与 B0 的登记完全一致，且**现在有了钉住它的用例**。
- **惰性对照 M5/M9 → 0 差异** ⇒ 装置不会对无副作用改动假报差异（非恒真装置）。

### 7.6 两张清单（V8 coverage，跨 VM context 取 max，realpath 归一）

**AFTER 树（11 文件）—— 顶层单元 25/25 全部被执行，嵌套函数 53/53 全部被执行，未执行 = 0**：

| 单元 | 文件 | 行 | 调用次数 | 单元 | 文件 | 行 | 次数 |
|---|---|---|---|---|---|---|---|
| getSubmissions | list.js | 53-79 | 4 | batchReview | batch.js | 42-96 | 4 |
| getReviewQuestions | list.js | 81-104 | 2 | batchPublish | batch.js | 98-144 | 2 |
| buildFilter | list.js | 20-36 | 4 | publishScores | batch.js | 146-168 | 4 |
| enrichWithSchool | list.js | 39-51 | 4 | getReviewSummary | summary.js | 13-83 | 3 |
| getSubmissionDetail | submission.js | 11-52 | 4 | getReviewByClass | summary.js | 85-173 | 2 |
| regradeSubmission | submission.js | 54-69 | 3 | exportReviewData | export.js | 11-164 | 6 |
| updateScore | submission.js | 71-89 | 2 | scoreItem | export.js | 83-106 | 9 |
| reviewSubmission | submission.js | 91-104 | 2 | readStandardTree | project.js | 22-33 | 4 |
| isStudentVisibleToTeacher | scope.js | 21-29 | 19 | getProjectReview | project.js | 41-94 | 7 |
| loadVisibleSubmission | scope.js | 47-63 | 14 | reviewProjectSubmission | project.js | 102-141 | 6 |
| sendScopeError | scope.js | 66-68 | 6 | getQuestionPromptPreview | prompts.js | 18-47 | 3 |
| resolveVisibleClassScope | class-scope.js | 22-32 | 13 | getSubmissionPrompt | prompts.js | 52-86 | 3 |
| filterRejectedSubmissionIds | batch.js | 19-40 | 2 | | | | |

**「未执行的函数」清单（如实交付）**：

- **顶层单元：无（0 个）**。
- **嵌套/匿名函数：无（0 个）** —— 我第一版 57 例时曾遗留 6 个未执行的匿名函数，全部位于 `getReviewByClass`：`keyword` 过滤箭头、`filter` 四态各自的箭头、`sortField/sortOrder` 比较器箭头；**已补 R11c–R11f 四例（filter 四态 × sort × keyword）后清零**。
- **BEFORE 树对照**：同为 **25/25 被执行**，且 **25/25 的调用次数与 AFTER 逐字相同**（`identical execution counts = 25/25`）—— 这是四维之外的第 5 个等价性指纹。
- **残余未覆盖的「非函数」结构（不影响判等，登记）**：若干 500 catch 分支、`scoreItem` 的未知 type 兜底（需要现网不存在的第五种题型）、`readStandardTree` 的「目录存在但为空」子分支 —— 与 B0 轮的登记一致。

---

## 8 V-D1 —— B 自报事故的复核（最终树是否干净 / 基准是否正确）

**B 自报**：首次 B2 生成脚本**误读工作树（当时已是 B1 门面，375 行）**切出错块，靠行数异常发现，改用「`git show HEAD` 冻结副本 + fail-closed sha256」重跑。

**我的独立复核（不看 B 的中间态，只看最终树与基线）**：

| 复核项 | 实测 | 判定 |
|---|---|---|
| 最终树是否有残留/半成品 | `find server/src -name '*.bak' -o -name '*.orig' -o -name '*.rej' -o -name '*~' -o -name '*.tmp'` → **空**；11 个新文件行数 = 11/141/86/70/104/168/34/164/12/104/173（与 B 表一致，全部 <800，最大 173） | ✅ 干净 |
| 是否有「门面」残迹 | 源文件**整体不存在**（`ls` 报 No such file）；全仓只有 I1/I2 两处 import 新模块 | ✅ |
| 25 块判等是否在**正确基准**上做 | 我的基准 = `git archive HEAD server` 的冻结副本，**先自证** sha `62ec56ed…` / 965 行 / 43827 B；且该内容与方案锚点 `1b713b8` **逐字节相同** | ✅ |
| B 的表是否可信 | 用**我的**切片复算 25 个区间哈希 → 与 B 表 **25/25 相同**；反向未匹配字节 **0** | ✅ 事故未留痕 |
| 是否只动了该动的文件 | `git status -uno` = 2 改 + 1 删；保护路径（`scripts/gates/*`、`docs/pipeline/lint-baseline.json`、`client/src`、`tests/`、`client/dist`）mtime **全部早于 13:41**（B 的写入窗）且 git 无改动 | ✅ |
| 删除前状态是否是 B2 门面快照 | **不可直接验证**（B 的快照在 `/tmp/splitB`，本轮明令不复用）—— 但**结论等价**：最终树 25 块与冻结源逐字节相同 + 反向 0 未匹配 ⇒ 无论中间态如何，**终态正确** | ✅（可接受） |

---

## 9 「一处未修」的逐字确认

| 项 | 旧（冻结源） | 新（工作树） | 结论 |
|---|---|---|---|
| **死变量 `count`** | `:354` `let count = 0;` · `:365` `count = toReview.length;` | `batch.js:78` · `:89`（块内偏移 −276 对应） | 逐字在，未删未改 |
| **`:684` 空答早退**（B0 认定的「拆分敏感行」） | `:684 if (!sAns) return 0;` | `export.js:87` 同文 | ✅ 逐字在（且本轮 R12f 使其**可观测**） |
| **无 message 的成功体（3+1）** | `:450 {code:0,data:[]}` · `:511 {code:0,data:rows}` · `:601 {code:0,data:{list:paged,total}}` · `:751` 多行 `{code:0,data:{rows,headerCells}}` | `summary.js:17 / :78 / :168` · `export.js:154`（多行） | 逐字在，**未补 message** |
| **文案与码** | `code: 1003`=12 · `res.status(403)`=11 · `code: 1001`=11 · `code: 1004`=8 · `code: 2001`=16 · `message:`=61 | **逐项相同**（12 / 11 / 11 / 8 / 16 / 61） | ✅ |
| **15 条中文文案** | `提交不存在`5 · `无权访问该提交`3 · `无权访问该班级`3 · `无权操作`2 · `无权操作该班级`2 · `非实训题提交`2 · `请选择学校`2 · `参数错误`3 · `无权访问该题目`1 · `题目不存在`1 · `请选择提交`1 · `练习模式无需审核`1 · `练习模式无需发布`1 · `该提交不是编程题`1 · `部分提交不在可见范围内，已整批拒绝`1 · `服务器内部错误`16 | **全部同数** | ✅ |
| **`req.app.locals.reviewUseCases`** | 旧文件 **4 处**：`:272`/`:292`/`:310` 三处调用 + **`:5` 的文件头注释** | `submission.js:60 / :80 / :98` **三处调用逐字在** | ✅ 3 处调用保留；第 4 处是**随源文件删除的头注释**（非调用点丢失，B 已按「3 处调用」登记） |
| 无前端调用方的路由 13 | `GET /submissions/:id/project` | 仍在路由表内（16 条不变） | ✅ 未删 |

---

## 10 门禁七项（我实跑的原始读数）

| # | 门禁 | 实测 | 判据 | 结论 |
|---|---|---|---|---|
| 1 | `node server/scripts/check-layers.mjs` | 文件 **106** / 违规 **0** / 未分层待迁移 **43** | 违规 0、未分层 ≤44 | ✅ |
| 2 | `node scripts/gates/arch-metrics.mjs` | layerViolations 0/0 · unmigrated **43/44** · **godfileOver800 2/3** · 观察带 13/14；名单只剩 `teacherController.js (1338)` / `Doc.vue (1106)`；PASS | GodFile 3→2、不劣化 | ✅ |
| 3a | `node scripts/gates/cycle-check.mjs` | server/src：106 文件 / **238 边** / SCC **0** / 自环 0 | SCC 0 | ✅ |
| 3b | `node scripts/gates/cycle-check.mjs --root client/src` | client/src：99 文件 / **244 边** / SCC **0** / 自环 0 | client 侧不回归 | ✅ |
| 4 | `node scripts/gates/hard-metrics.mjs` | hex6 **0** · important **0** · modalConfirm **0**；PASS | 0/0/0 | ✅ |
| 5 | `node scripts/gates/bind-check.mjs` | modules **208** / named bindings **710** / **VIOLATIONS 0**；unresolved 4、external 1（与基线一致）；exit 0 | 0 违规 | ✅ |
| 6 | `./node_modules/.bin/eslint client/src server/src --format json` | files **205** / errors **0** / warnings **59**；新树唯一命中 `review/batch.js:89 no-unused-vars 'count'` | error 0 / warn ≤59 | ✅（零余量） |
| 7 | `node scripts/gates/lint-check.mjs --json` | 205 文件 / 33418 行 / 解析失败 0；基线 31 → 当前 31；新增 1（**已迁移**）、blocking **[]**、`verdict PASS`、**exit 0** | exit 0 且三元组等价（§5） | ✅ |

---

## 11 全量回归

空序号核查：`test-round-08..18.log` 已存在 ⇒ **19 空闲** ✅。

**执行**：`ROUND=19 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh` → **exit 0**；日志 `docs/split/test-round-19.log`（172996 B / 1607 行）。

| 判据 | 实测 |
|---|---|
| **4 处 `Test Suites:` 摘要** | ✅ 日志 `:1425` `:1465` `:1554` `:1602`（**4 处**，无短路） |
| **failed = 0** | ✅ 四段摘要全为 `N passed, N total`：**69 suites / 998 tests** ｜ 1 / **17** ｜ 1 / **61** ｜ 1 / **21**（合计 **1097 passed / 0 failed**） |
| `^FAIL` 行 | **0** |
| 段1 规模变化 | 68→**69** 套件、996→**998** 例（= +1 套件 +2 例，即 B0b 的 `rc-usecase-404-contract` 两例，属**预期新增**，不是回归） |
| 4 个 rc-* 套件（B0/B0b） | 全部 `PASS`：rc-project-review(:589) · rc-export-objective(:689) · rc-batch-guard(:748) · **rc-usecase-404(:829)** |
| 三个 tree-sitter 套件 | 分段独立进程：fact-extractor(:1438) · rule-executor(:1481) · rule-mutator(:1576) **全 PASS** ⇒ **无同进程假红**（约束包第 18 条未触发） |
| `grep -c failed` = 5 的逐条核对 | **全部是日志文本**：1 条 `projectGrading.js:709` 的 Prisma **P2025 日志**（失败处理的被测路径）+ 4 条 trustjudge 的 `fetch failed`（**被 mock 的** fetch，:1163-1166）—— **与 jest 判据无关，分段摘要 failed = 0 成立** |
| 本轮允许的两处写入 | `docs/split/reviewController-verify.md`（本报告）+ `docs/split/test-round-19.log`；`git status --porcelain -uno` 仍只有 V-D1 的 2 改 + 1 删 |

---

## 12 缺陷分级

| # | 级别 | 对象 | 事实 | 处置 |
|---|---|---|---|---|
| 1 | **信息（文档）** | B 报告 §10 的旧行号 | 写「旧树 `:354 / :365 / :367 / :413`」，**第四处实为 `:415`**（`:413` 是 batchPublish 循环体内另一行） | 仅需更正文档；**代码零影响**（新树 `:139` 与旧 `:415` 按 −276 严格对应） |
| 2 | **信息** | 计数口径 | `req.app.locals.reviewUseCases` 旧 4 → 新 3：**第 4 处是源文件头注释（`:5`）**，随文件删除，**3 处调用全部保留** | 无需处置（B 的登记口径正确） |
| 3 | **信息** | 切片边界约定 | `scoreItem` 的极大块是 `679-703`（含紧邻注释），plan/B 用 `680-703`；**两者都在新树中逐字存在**，B 表哈希对应 plan 口径、可复现 | 无需处置（口径差异，非改写） |
| 4 | **低（残留风险）** | `export.js:87 if(!sAns) return 0;` | B0 的 22 例网对它零分辨力（CM9）；本轮先复现幸存、再补 R12f 夹具才有牙 | 拆分**未触碰**该行；建议把 R12f 类夹具长期保留 |
| 5 | **低（残留风险）** | 三条 500 catch / `scoreItem` 未知 type 兜底 / `readStandardTree` 空目录子分支 | 无断言（与 B0 登记一致） | 非阻断；拆分为逐字搬移，未改这些分支 |
| — | **无** | 行为 / 契约 / 分层 / 循环依赖 / 绑定 / lint | **未发现任何阻断或中等缺陷** | —— |

---

## 13 未做项与残留风险（诚实边界）

**未做**：

1. **未做真库（MySQL）的四维对拍**：§7 用**自建内存 prisma 替身**（不支持原生 SQL / 嵌套写 / create 语义之外的 Prisma 细节）。因此「**Prisma 语义保真度**」不由本装置保证 —— 但两侧共用**同一份替身**，差异只可能来自被测代码；**真库 + 真实 HTTP** 路径由 §11 全量回归覆盖。
2. **未复跑 A 方案 §2.6 的四条反向陷阱**（只跑了其中的第 ④ 条——F4 盲区，且用的是我自己的副本）：另三条（把 prompt handler 放进 interface 会命中 `interface-imports-infra` 等）本轮**未实测**，因为它们证明的是「门禁有牙」，而本步的实测结论是**门禁读数全绿 + 我的 AST 红线为 0**，不依赖该证伪。
3. **未验证生产/线上数据与真实访问日志**（`getProjectReview` 是否仍有线上调用方）—— 超出只读范围。
4. **未审计 11 个新文件的依赖邻居**（`utils/*`、`teamController.js`、`constants.js` 仍是 unlayered）—— 与 B 的登记一致，属后续步骤。
5. **未跑 client 侧任何构建/像素/axe**（本步不动 client；`--root client/src` 只作「不回归」证据）。
6. **未复核 B 的定向测试清单**（§11 的 18 进程 23 套件）—— 判据是全量回归，且 B 的数字**不作判据**。

**残留风险（按对后续步骤的威胁排序）**：

- **R1（低）**：`export.js:87` 的必要性在**全量回归网**里同样无用例钉住，只有我自建的 R12f 类夹具能发现；若后续步骤再动该行，请注意这一点。
- **R2（低）**：三条 500 catch 与 `scoreItem` 的未知 type 兜底零覆盖（错误兜底，间接路径可发现）。
- **R3（低）**：`getReviewByClass` 的 `filter`/`sort`/`keyword` 分支在我补 R11c–R11f 之前零覆盖（现已补；但**它们原本由 t7 覆盖**，属"网内"而非真空白）。
- **R4（信息）**：`req.app.locals.reviewUseCases` 是 Z7/Z8 唯一可测入口；本步保留（`submission.js` 三处逐字），**后续若改为直接 import 用例实例，这条可测性会消失**。
- **R5（信息，设计边界）**：惰性对照证明装置对「纯注释/空白改动」不敏感（正确）；但它对**语义等价的重排/等价改写**同样不敏感 —— 这是四维对拍（而非 AST 判等）的固有边界，本步由 §2 的字节判等补足。

---

## 14 结论

> ### **PASS —— 拆分行为等价、HTTP 契约完好、门禁全部达标且优于基线；无需回流 B。**

**支持 PASS 的硬证据**：

1. **静态（最严）**：25/25 搬移块与冻结源**逐字节相同**（每块命中数恰 1，B 表 25 个哈希全部复算命中）；11 个新文件的**每一个非空白字节**都可归因于「源切片 / banner / import / export」，**未匹配 = 0**；块序 11/11 保持；块内无重复副本。
2. **契约面**：导出面 **17 名前后逐字相等**，且 **17/17 的函数源码文本哈希也相同**；`T6 ∩ T11 = ∅`、展开键 == 并集（**无静默遮蔽**）；路由 16 行逐字不动、16/16 handler 在合并命名空间可解析。
3. **红线**：`interface → infrastructure`（import + export-from）**= 0**（AST 判定，且装置在注入违规的副本上能报 1 —— 证明官方两道门禁对该类违规确实全盲，而我的判据有牙）。
4. **动态（最全）**：**61 例 / 16 条路由 / 四维对拍 byte-identical**（含 403/1003 越权族、practice 400、空 submissionIds、客观题四型判分、钳制与 NaN、无 message 形状）；**0 次外网请求**；**7 处语义变异全部报差异**（其中 M7 **只被调用日志维抓到**）、**2 处惰性对照 0 差异**；**25/25 顶层单元 + 53/53 嵌套函数全部被执行**，且前后调用次数逐字相同。
5. **lint 迁移**：`no-unused-vars/count/let count = 0;` 三元组全同、`:354 → batch.js:78`、31→31、`blockingViolations=[]`、exit 0；并由「两处块字节判等 + 源文件整体删除 + 位置一一对应」证明**是搬运而非修一处加一处**；基线 sha 未变。
6. **假阳性防御**：B0b 的两例在「替身文案 == 守卫文案」时**必红**（两刀独立断言），原样必绿。
7. **门禁七项**：违规 0 / 未分层 **43** / GodFile **2** / SCC 0（server 238 边、client 244 边）/ hard 0-0-0 / bind 0（208 modules、710 bindings）/ eslint 0-59 / lint-check exit 0。
8. **唯一发现**为 B 报告中的一处**旧行号笔误**（`:413` 应为 `:415`），**不影响任何判据**。

**给后续步骤的两条建议（非阻断）**：① 更正 B 报告的该处行号；② 把「空参考答案 + 空答」这类等价类夹具（本轮 R12f）长期保留，它是 `export.js:87` 唯一的分辨力来源。

---

### 附：本轮装置与产物

- 仓库内新增（允许项）：本报告、`docs/split/test-round-19.log`
- `/tmp/cv8/` 下装置：`w2-slice2.mjs` · `w4-export.mjs` · `w5-ast.mjs` · `coverage.mjs` · `countcmp.mjs` · `casediff.mjs` · `unfixed.mjs` · `probe/run.mjs` · `probe/prisma-stub.js` · `mutate.sh` · `mutate2.sh` · `w10.sh` · `before/` · `after/` · `mut/` · `ctl/`（盲区证伪）· `w10/`（假阳性复现）· `cov-*/` · `out/*.json`
- 仓库内**零写入**：无 `git add/commit/clean/stash/checkout/reset/restore`，无 `rm`/`mv`；未刷新任何基线
