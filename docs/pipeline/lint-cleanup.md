# lint-cleanup —— 两套 lint 基线清零（死代码清理）

> 执行者：Agent B（本仓唯一写者）｜轮次：lint 清零专项
> 原则：**只删「引用计数 = 0」的声明，不改任何逻辑**；每处删除均附 AST 口径引用计数证据（不使用 grep / 文本匹配作为判据）。
> 判据来源：① `npx eslint client/src server/src -f json`；② `node scripts/gates/lint-check.mjs --json --list`

---

## 0. 结论速览

| 判据 | 清理前 | 清理后 | 目标 | 状态 |
| --- | --- | --- | --- | --- |
| **ESLint** | error **0** / warn **57** | error **0** / warn **2** | 0 / 0 | ⚠️ 剩 2 条，均为**不可擅改项**（见 §6.1 / §6.2） |
| **lint-check 门禁** | 当前 **29** 条（基线文件 31 条） | 当前 **1** 条（exit 0 / PASS） | 0 | ⚠️ 剩 1 条，为 §四② **强制保留项**（见 §6.1） |
| 合并去重清单 | **49 组 / 62 处** | 已清零 **47 组 / 60 处** | — | 组 95.9% ／ 处 96.8% |

- 变更规模：**38 个文件，+51 / −75 行（净 −24 行）**，无新增依赖、无新增文件（本报告除外）。
- 门禁侧：**30/31 条基线违规已真实消除**（门禁自报「已消除 30 条」），仅剩 1 条为「同一处缺陷换宿主」的历史遗留（见 §6.1）。
- 全量回归：见 §5。

---

## 1. 清单口径与合并去重

两条判据的**原始读数**：

| 来源 | 原始条数 | 规则分布 |
| --- | --- | --- |
| ESLint（`client/src` + `server/src`） | 57 | `no-unused-vars` 56 ／ `no-constant-condition` 1 |
| lint-check 门禁（`--list`，扫描面同上） | 29 | `no-unused-vars` 29 |
| 合计（未去重） | **86** | — |

**合并去重结果**（键 = `file + rule + symbol`，并保留 `line` 明细）：

| 口径 | 条数 |
| --- | --- |
| 原始行数（86 = 57 + 29） | 86 |
| 唯一 `(file, rule, symbol)` 组 | **49** |
| 唯一 `(file, line, rule, symbol)` 处 | **62** |

> 差异来源：① 同一符号在**同一文件多处**出现（如 `useTheme.js` 的 `e` 出现在 5 行、`ruleMutator.js` 的 `err` 出现在 3 行、`deepseek-gateway.js` 的 `controller` 出现在 3 行）——按「组」计 1 条、按「处」计多条；② 两条判据对同一违规**报在不同行**（`batch.js` 的 `count`：门禁报声明行 78、ESLint 报写点行 89）；③ 两条判据的**参数策略不同**——ESLint 配的是 `args: 'none'`（完全不查函数形参），门禁用的是 `args: 'after-used'`，故 `seq` / `schoolId` / `language`×2 **只有门禁报**。

### 1.1 分类（按「49 组」口径）

| # | 分类 | 组数 | 明细处数 | 处置结果 |
| --- | --- | --- | --- | --- |
| ① | **未使用的 import 绑定** | 14 | 14 | 14 组全部清零（8 组「语句不变空」只删名；6 组「语句会变空」改副作用导入，见 §3） |
| ② | **未使用的 catch 形参** | 21 | 31 | 31 处全部清零（`catch (e) {` → `catch {`，可选 catch 绑定） |
| ③ | **未使用的局部变量** | 5 | 11 | 全部清零（`draftTimer` / `deadlineTimer` / `controller`×3 / `count`×2 / `mapping`） |
| ④ | **未使用的顶层常量** | 4 | 4 | 3 组清零（`TEMPLATES` / `reviewSummary` / `nodeRequire`）；**`gradeProject` 保留**（§6.1） |
| ⑤ | **未使用的函数参数** | 4 | 4 | 全部清零（`seq` / `schoolId` / `language`×2） |
| ⑥ | **非 no-unused-vars** | 1 | 1 | `no-constant-condition` —— **保留**（§6.2） |
| | **合计** | **49** | **62** | 清零 47 组 / 60 处 |

---

## 2. 逐条处置表（含引用计数证据）

**证据口径**：`@babel/parser` + `@babel/traverse` 解析源码（`.vue` 用 `@vue/compiler-sfc` 取 `<script>`/`<script setup>` 块并按行映射回原文件），读取 **`binding.references`（引用计数）**、`binding.kind`（绑定种类）、`binding.constantViolations.length`（写入次数）、以及该绑定是否被 `export`。**`refs=0` 是唯一的删除判据**。

### ① 未使用的 import 绑定（14 组）

| 文件:行 | 符号 | import 源 | 该语句具名数 | 处置 | 依据 |
| --- | --- | --- | --- | --- | --- |
| `client/src/components/checker/CheckerWizard.vue:166` | `getHealthReport` | `../../api/checker.js` | 9（余 7 在用） | 只删名 | refs=0；语句不变空 |
| `client/src/components/checker/CheckerWizard.vue:166` | `getRuleVersions` | `../../api/checker.js` | 9（余 7 在用） | 只删名 | refs=0；语句不变空 |
| `client/src/views/teacher/Layout.vue:145` | `ExperimentOutlined` | `@ant-design/icons-vue` | 18（余 17 在用） | 只删名 | refs=0；语句不变空 |
| `client/src/views/teacher/ProjectQuestionEdit.vue:199` | `CheckCircleOutlined` | `@ant-design/icons-vue` | 4（余 3 在用） | 只删名 | refs=0；语句不变空 |
| `server/src/controllers/projectReviewController.js:13` | `readDirFiles` | `../services/projectGrading.js` | 2（余 1 在用） | 只删名 | refs=0；语句不变空 |
| `server/src/domain/entities.js:4` | `EntityNotFoundError` | `./errors.js` | 4（余 3 在用） | 只删名 | refs=0；语句不变空 |
| `server/src/infrastructure/ai/checker/llm.js:7` | `getModel` | `../deepseek/index.js` | 3（余 2 在用） | 只删名 | refs=0；语句不变空 |
| `server/src/infrastructure/ai/deepseek/submission-grading.js:7` | `DEFAULT_MAX_SCORE` | `../../../constants.js` | 2（余 1 在用） | 只删名 | refs=0；语句不变空（**与 step 9 先例同型**） |
| `client/src/views/admin/Monitor.vue:57` | `message` | `ant-design-vue` | **1（删后为空）** | **改副作用导入** | refs=0；见 §3 |
| `server/src/infrastructure/ai/deepseek/config.js:6` | `logger`（default） | `../../../utils/logger.js` | **1（删后为空）** | **改副作用导入** | refs=0；见 §3 |
| `server/src/services/projectGrader.js:8` | `fs`（default） | `fs` | **1（删后为空）** | **改副作用导入** | refs=0；见 §3 |
| `server/src/services/projectGrader.js:9` | `path`（default） | `path` | **1（删后为空）** | **改副作用导入** | refs=0；见 §3 |
| `server/src/services/projectGrader.js:11` | `getLanguageByExt` | `../utils/fileTree.js` | **2（两个都死 ⇒ 删后为空）** | **改副作用导入** | refs=0；见 §3 |
| `server/src/services/projectGrader.js:11` | `isIgnored` | `../utils/fileTree.js` | **2（两个都死 ⇒ 删后为空）** | **改副作用导入** | refs=0；见 §3 |

> `projectGrader.js` 的 `logger`（第 10 行）**在用**（`new CompileExecutor({ logger })` / `new AstAnalyzer({ logger })`），故其语句原样保留。

### ② 未使用的 catch 形参（21 组 / 31 处）

统一处置：`catch (e) {` → `catch {`（**可选 catch 绑定**，ES2019）。全部 `refs=0`、`constantViolations=0`。

| 文件 | 行 | 符号 |
| --- | --- | --- |
| `client/src/components/checker/CheckerWizard.vue` | 301, 485 | `e` |
| `client/src/components/checker/RuleSummaryCard.vue` | 72 | `e` |
| `client/src/composables/project/useChecker.js` | 65, 137 | `e` |
| `client/src/composables/project/useLoadQuestion.js` | 70 | `e` |
| `client/src/composables/useDraftAutosave.js` | 45 | `e` |
| `client/src/composables/useMonacoTheme.js` | 33 | `e` |
| `client/src/composables/useTheme.js` | 24, 29, 37, 105, 115 | `e` |
| `client/src/domain/browserCompat.js` | 23 | `e` |
| `client/src/router/index.js` | 72 | `e` |
| `client/src/styles/antd-theme.js` | 34 | `e` |
| `client/src/views/teacher/Assignments.vue` | 278 | `e` |
| `client/src/views/teacher/Layout.vue` | 211 | `e` |
| `client/src/views/teacher/ProjectReviewNew.vue` | 556 | `e` |
| `server/src/domain/services/checker/parsers.js` | 56, 67, 72 | `err` |
| `server/src/infrastructure/ai/checker/generator.js` | 368 | `err` |
| `server/src/infrastructure/ai/checker/legacy-script.js` | 54 | `e` |
| `server/src/infrastructure/ai/checker/package-inspect.js` | 24, 104 | `err`, `e` |
| `server/src/infrastructure/ai/checker/review.js` | 65 | `e` |
| `server/src/services/projectGrading.js` | 659 | `e` |
| `server/src/services/ruleMutator.js` | 236, 267, 277 | `err` |

**行为无损论证**：`catch { … }` 与 `catch (e) { … }` 在 ECMAScript 规范中语义完全相同（`CatchClause` 的 `BindingIdentifier` 可省略；异常对象在两种写法下都不可被访问）。绑定既然 `refs=0`，删除它不改变任何可观测行为。该文件其余 catch 子句未受影响。
> 附：门禁本身对 catch 形参**一律豁免**（`caughtErrors:none` 口径），故这 31 处只影响 ESLint 读数、不影响门禁读数。

### ③ 未使用的局部变量（5 组 / 11 处）

| 文件:行 | 符号 | 绑定 | 引用/写入 | 初始化式副作用 | 处置 |
| --- | --- | --- | --- | --- | --- |
| `client/src/composables/submit/useAnswerState.js:34` | `draftTimer` | `let` | refs=0 / writes=0 | `null`（无） | 删声明 |
| `client/src/composables/submit/useAnswerState.js:35` | `deadlineTimer` | `let` | refs=0 / writes=0 | `null`（无） | 删声明 |
| `server/src/infrastructure/ai/deepseek-gateway.js:69,125,177` | `controller` | `const`（解构） | refs=0 / writes=0 | 来自 `await this.#request(…)`，**调用本身未被删除** | 从解构模式中移除 `controller` |
| `server/src/interface/http/controllers/review/batch.js:78,89` | `count` | `let` | refs=0 / **writes=1** | `0`（无） | 删声明 **+ 删其唯一死写**（见下） |
| `server/src/services/defectScoring.js:60` | `mapping` | `const` | refs=0 / writes=0 | 数组字面量（无） | 删声明 |

**`count` 的特殊说明（唯一一处「声明 + 死写」成对删除）**：`batch.js` 的 `count` 是**只写不读**变量（`binding.references === 0`、`constantViolations.length === 1`）。只删 `let count = 0;` 会让第 89 行的 `count = toReview.length;` 变成给未声明标识符赋值（ESM 严格模式下抛 `ReferenceError`，且会被门禁的 `no-undef` 判为新违规）。因此必须成对删除：
```js
let count = 0;              // ← 删（第 78 行）
…
count = toReview.length;    // ← 删（第 89 行，右值 toReview.length 无副作用、结果从不被读取）
```
响应体里的 `data: { count: reviewedStudentIds.size }` 是**对象键**、与局部变量 `count` 无关，未改动。

### ④ 未使用的顶层常量（4 组）

| 文件:行 | 符号 | 引用 | 初始化式 | 处置 |
| --- | --- | --- | --- | --- |
| `client/src/api/checker.js:71` | `TEMPLATES` | refs=0 | 数组字面量（3 个字面量对象） | 删声明（5 行） |
| `client/src/views/teacher/ReviewClass.vue:203` | `reviewSummary` | refs=0；模板未提及 | `computed(() => …)`，回调不求值 | 删声明（5 行） |
| `server/src/infrastructure/rule/syntax.js:20` | `nodeRequire` | refs=0（全仓仅出现于该声明处） | `createRequire(import.meta.url)`，无副作用 | 删声明 + 级联（见 §3.6） |
| `server/src/infrastructure/teacher/grade.js:14` | `gradeProject` | refs=0；从未 `export` | 箭头函数，函数体不求值 | **保留**（见 §6.1） |

> `syntax.js` 同时删除了**仅用于描述该声明**的 2 行注释（原文：「…统一走 createRequire 惰性加载…」）——该注释描述的惰性加载策略随 `nodeRequire` 一起失效，保留会变成悬空且与代码不符的描述。这是本次唯一一处触及注释的改动。

### ⑤ 未使用的函数参数（4 组）

| 文件:行 | 符号 | 位置 | 处置 | 依据 |
| --- | --- | --- | --- | --- |
| `client/src/api/checker.js:138` | `seq` | `mockEvidence(ruleType, seq)` —— **末位形参** | 收窄为 `mockEvidence(ruleType)` | refs=0；调用点仍传 2 实参，多余实参被忽略 |
| `server/src/controllers/teamController.js:211` | `schoolId` | `getTeamTeacherIds(teacherId, schoolId)` —— **末位形参** | 收窄为 `getTeamTeacherIds(teacherId)` | refs=0；全仓无生产调用点 |
| `server/src/infrastructure/execution/ast-analyzer.js:21` | `language` | `analyze(dir, language = 'java')` —— **末位形参** | 收窄为 `analyze(dir)` | refs=0；调用点 `astAnalyzer.analyze(dir, language)` 多余实参被忽略 |
| `server/src/services/factExtractors/python.js:164` | `language` | `extractPythonFacts({ … , language })` —— 解构**末位键** | 从解构模式移除 | refs=0；对象解构忽略多余键 |

> 4 处**全部是末位**（其后无在用形参）⇒ 调用方按位置传参的绑定关系不变，仅 `fn.length` 减少；全仓未发现任何依赖 `.length` 的调用点。ESLint 因 `args: 'none'` 不查形参，故这 4 组只影响门禁读数。
> 注：按硬约束「不得改名」，**未**采用 `_language` 之类的下划线改名方案（虽然门禁对 `^`_` 前缀豁免）。

### ⑥ 非 no-unused-vars（1 组）

| 文件:行 | 规则 | 判定 | 处置 |
| --- | --- | --- | --- |
| `client/src/composables/question/questionPure.js:71:6` | `no-constant-condition` | **真实缺陷，非有意为之** | **保留不动**，登记 + 回报（见 §6.2） |

---

## 3. ★「语句会变空」专项判定

对每条「删除死名后 import 语句会变空」的语句，逐一执行 §四② 的判定流程。

### 3.1 判定流程与结果

| # | 文件:行 | 原语句 | 本文件是否另有该模块的导入 | §四② 归属 | 实际处置 |
| --- | --- | --- | --- | --- | --- |
| 1 | `client/src/views/admin/Monitor.vue:57` | `import { message } from 'ant-design-vue';` | **无** | 「没有 ⇒ 保留原样（或改副作用导入）」 | **改副作用导入** |
| 2 | `server/src/infrastructure/ai/deepseek/config.js:6` | `import logger from '../../../utils/logger.js';` | **无** | 同上 | **改副作用导入** |
| 3 | `server/src/services/projectGrader.js:8` | `import fs from 'fs';` | **无** | 同上 | **改副作用导入** |
| 4 | `server/src/services/projectGrader.js:9` | `import path from 'path';` | **无** | 同上 | **改副作用导入** |
| 5 | `server/src/services/projectGrader.js:11` | `import { getLanguageByExt, isIgnored } from '../utils/fileTree.js';` | **无** | 同上（两个名字**都**死 ⇒ 等价于全空） | **改副作用导入** |
| 6 | `server/src/infrastructure/rule/syntax.js:8` | `import { createRequire } from 'node:module';` | **无** | 同上（**级联**：删 `nodeRequire` 后才变空） | **改副作用导入** |

**注意：这 6 条中没有任何一条走到「可删该语句」分支** —— 每一处在**本文件内**都没有该模块的第二条 import 语句，因此**没有删除任何 import 语句**（也就没有切断任何模块执行边）。

### 3.2 改写结果（6 条，逐字）

```diff
# 1) client/src/views/admin/Monitor.vue:57
-import { message } from 'ant-design-vue';
+import 'ant-design-vue';

# 2) server/src/infrastructure/ai/deepseek/config.js:6
-import logger from '../../../utils/logger.js';
+import '../../../utils/logger.js';

# 3) server/src/services/projectGrader.js:8
-import fs from 'fs';
+import 'fs';

# 4) server/src/services/projectGrader.js:9
-import path from 'path';
+import 'path';

# 5) server/src/services/projectGrader.js:11
-import { getLanguageByExt, isIgnored } from '../utils/fileTree.js';
+import '../utils/fileTree.js';

# 6) server/src/infrastructure/rule/syntax.js:8
-import { createRequire } from 'node:module';
+import 'node:module';
```

### 3.3 为什么「改副作用导入」是行为无损的（三条独立论证）

1. **模块执行边被完整保留**：语句仍在**原位置**、**原顺序**、**原模块说明符**上；ESM 语义下 `import { X } from 'm'` 与 `import 'm'` 对 `m` 而言都是「模块请求 + 求值」。这正是 §四② 要保护的性质。
2. **客户端侧（仅 Monitor.vue）不存在 tree-shaking 差异**：`ant-design-vue@4.2.6` 的 `package.json` 声明
   `"sideEffects": ["site/*","*.vue","*.md","dist/*","*.css"]` —— **不含** ESM 入口 `es/index.js`，即 Rollup 将它视为**无副作用模块**。
   ⇒ dev（Vite 直出 ESM）：两种写法**都**会加载并求值 `ant-design-vue`；build（Rollup）：两种写法**都**会被摇掉。
   （`@ant-design/icons-vue@7.0.1` 同样是 `sideEffects: false`，但 Layout.vue / ProjectQuestionEdit.vue 的语句删名后**仍有 17 / 3 个在用名**，语句整体保留，不涉及本判定。）
3. **服务端侧不经打包**：`server/package.json` 的启动方式是 `node src/app.js` / `node src/worker.js`（纯 Node ESM，**无打包器、无 tree-shaking**）。故 5 条服务端语句里「裸导入」与「未使用的具名/默认导入」在运行时**完全等价**。
4. **不引入新判据违规**：门禁的 `no-unresolved-import` 只检查以 `.` 开头的相对说明符，裸模块名（`ant-design-vue` / `fs` / `path` / `node:module`）不在其扫描范围；相对路径 `../../../utils/logger.js` / `../utils/fileTree.js` 均可解析。清理后两条判据实测均未出现新违规（§4）。
5. **本仓既有惯例**：裸副作用导入在本仓已是既有写法（`server/src/app.js:1`、`server/src/worker.js:1` 的 `import 'dotenv/config'`；client 侧的 CSS / `dayjs/locale/zh-cn`）。

### 3.4 与 step 9 先例的一致性

题述先例：「step 9 删除 `DEFAULT_MAX_SCORE` / `getTeamTeacherIds` 两个死绑定时，两条语句删名后都不变空、且两模块各仅此一条 import，才确认加载副作用边保留」。
本轮两处都再次命中，且**结论一致**：

- `DEFAULT_MAX_SCORE`（`submission-grading.js:7`）——语句中 `ABNORMAL_FEEDBACK` **在用** ⇒ 只删名、语句保留 ⇒ 加载边保留。**与先例完全同型**。
- `getTeamTeacherIds`（`teamController.js:211`）——它是**函数**，不是 import 绑定；门禁报的是它的**形参** `schoolId` ⇒ 只收窄形参，未动函数、未动任何 import。**与先例同型**。

---

## 4. 门禁七项（清理后实测）

| # | 门禁 | 命令 | 实测 | 判据 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | **check-layers** | `cd server && node scripts/check-layers.mjs` | 文件 117 个，**违规 0 条**（0 类规则），**未分层待迁移 42 个** | 违规 0 / 未分层 42 **持平** | ✅ PASS（exit 0） |
| 2 | **arch-metrics** | `node scripts/gates/arch-metrics.mjs` | layerViolations 0=0；unmigrated 42=42；**godfileOver800 1=1**；>500 观察带 12=12（`client/src/views/Doc.vue` 1106 行） | **GodFile 1 持平** | ✅ PASS（exit 0） |
| 3 | **cycle-check** | `node scripts/gates/cycle-check.mjs` | server/src：117 文件 / 263 边，**SCC 0**，自环 0 | SCC 0 | ✅ PASS（exit 0） |
| 3b | **cycle-check（client）** | `node scripts/gates/cycle-check.mjs --root client/src` | client/src：99 文件 / 244 边，**SCC 0**，自环 0 | SCC 0 | ✅ PASS（exit 0） |
| 4 | **hard-metrics** | `node scripts/gates/hard-metrics.mjs` | `hex6 0` / `important 0` / `modalConfirm 0` | **0/0/0** | ✅ PASS（exit 0） |
| 5 | **bind-check** | `node scripts/gates/bind-check.mjs` | 225 模块 / 776 具名绑定，**BINDING VIOLATIONS 0**（另登记 4 条 unresolved + 1 条 external，均在 `server/test` 且为既有） | 违规 0 | ✅ PASS（exit 0） |
| 6 | **ESLint** | `npx eslint client/src server/src` | **error 0 / warn 2** | 目标 0/0 | ⚠️ 剩 2 条（§6） |
| 7 | **lint-check** | `node scripts/gates/lint-check.mjs` | **exit 0 / PASS**；当前 **1 条**（基线 31 条，已消除 30 条） | 目标 0 条 | ⚠️ 剩 1 条（§6.1） |

> 门禁自报原文（关键行）：
> ```
> · 已消除（基线内被修掉）: 30 条
> ── 已迁移 1 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） ──
>   ⇄ no-unused-vars  gradeProject  ｜ const gradeProject = async (req, res) => {
>       server/src/controllers/teacherController.js:159   →   server/src/infrastructure/teacher/grade.js:14
> 结论：PASS（无基线外新违规；1 条为迁移，不计入阻断）
> ```

### 4.1 基线文件（`docs/pipeline/lint-baseline.json`）**未刷新**

- 现状：基线仍为 **31 条**（2026-10-11T05:22:03.584Z 生成）。
- **未执行 `--update-baseline`** —— 按题述 §六.7「不要在清理过程中执行 `--update-baseline` 去掩盖任何残留项」。当前仍有 1 条残留（§6.1），刷新会把「基线 31 → 1」写成既成事实，掩盖该项仍需裁决的事实。
- 门禁判决不受影响：比对键 `file + rule + symbol` 按「出现次数」比对，已消除的 30 条属于 `resolved`（只减不增），不产生 `fresh`，故**当前 exit 0 / PASS 是真实判决，不是靠基线放水**。
- 待 §6.1 裁决后即可安全刷新（届时为 0 条）。

---

## 5. 全量回归

命令（先查空序号：`docs/split` 已占用 08–24，故从 **25** 起取号）：

```bash
ROUND=25 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh
# 首跑出现 1 例环境偶发（见 §5.2）→ 整套复跑：
ROUND=26 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh
```

### 5.1 第 26 轮（终态判据）—— ✅ **4 处 Test Suites 摘要 / failed = 0**

`docs/split/test-round-26.log`（`npm test` 由 **4 段 jest** 串联而成，故应有 4 处摘要；`&&` 链要求前一段全绿才会跑下一段——只跑出 1 处摘要本身就是失败信号）：

| # | Test Suites | Tests | Time |
| --- | --- | --- | --- |
| 1 | **75 passed**, 75 total | **1022 passed**, 1022 total | 185.098 s |
| 2 | **1 passed**, 1 total | **17 passed**, 17 total | 0.504 s |
| 3 | **1 passed**, 1 total | **61 passed**, 61 total | 0.525 s |
| 4 | **1 passed**, 1 total | **21 passed**, 21 total | 0.712 s |
| **合计** | **78 suites / 0 failed** | **1121 tests / 0 failed** | — |

`→ 退出码: 0` ✅ **判据满足：4 处 Test Suites 摘要 + failed = 0**。

### 5.2 第 25 轮（首跑）—— 1 例**环境偶发**，已按本仓既有纪律复跑判定

第 25 轮 `Test Suites: 1 failed, 74 passed` / `Tests: 1 failed, 1021 passed`，失败用例：

```
FAIL test/integration/t2-student-fields.test.js
  ● Batch1 · T2 学生作业详情白名单（整行泄露修复） › 契约2b: 详情 practice ai_graded → …
    SyntaxError: Unexpected token 'N', "No mapping"... is not valid JSON
```

**判定：环境偶发，与本次清理无关。** 依据五条：

1. **响应体不是本应用的**：`No mapping found for HTTP request with URI` 是 **Spring 风格 404**；全仓源码（含 `trustjudge-server/`）grep 不到该字符串 —— 说明该响应由**本机其它监听进程**抢占临时端口后返回（测试服务 `PORT=0`，端口由 OS 分配）。
2. **本仓已有同签名的登记偶发**：`.agent-teams/archive/merge-branches/` 的既有记录写明「响应体为 Spring 风格 404 … 疑似本机其他监听服务占用临时端口」，且当时的纪律正是「**先单独复跑该例再判定，不得直接记为失败**」。本轮照此执行。
3. **单例复跑 2/2 全绿**：`PASS test/integration/t2-student-fields.test.js`，两次均 `Tests: 9 passed, 9 total`。
4. **整套复跑（第 26 轮）全绿 1022/1022**；且该用例与本次改动**零交集**（本次未触碰任何 `/api/student/assignments*` 路由、控制器或字段白名单 —— 见 §附 改动文件清单）。
5. **该项目全量回归本就有零星偶发历史**：第 09/10 轮失败的是 `t5-t4-idor-review.test.js` / `ownership-guards.test.js`，第 23 轮失败的是 `rc-project-review-contract.test.js`（本轮同文件单跑 12/12 全绿）。

### 5.3 定向测试（本专项新增 10 个测试文件，**独立进程**逐个跑）

```bash
cd server
for f in test/integration/tc-b0-*.test.js test/integration/rc-*.test.js; do
  DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules \
    npx --no-install jest --config test/jest.config.js --runInBand --forceExit "$f"
done
```

| 文件 | 结果 |
| --- | --- |
| `tc-b0-lock-assignment.test.js` | ✅ 1 suite / 3 tests |
| `tc-b0-parse-exam-stream.test.js` | ✅ 1 suite / 2 tests |
| `tc-b0-project-files.test.js` | ✅ 1 suite / 4 tests |
| `tc-b0-school-teachers.test.js` | ✅ 1 suite / 4 tests |
| `tc-b0-switch-class-school.test.js` | ✅ 1 suite / 8 tests |
| `tc-b0-upload-material.test.js` | ✅ 1 suite / 3 tests |
| `rc-batch-guard-contract.test.js` | ✅ 1 suite / 7 tests |
| `rc-export-objective-contract.test.js` | ✅ 1 suite / 3 tests |
| `rc-project-review-contract.test.js` | ✅ 1 suite / 12 tests |
| `rc-usecase-404-contract.test.js` | ✅ 1 suite / 2 tests |
| **汇总** | ✅ **10/10 文件全绿，0 failed**（共 48 tests） |

### 5.4 回归产出的归档文件（声明）

`docs/split/test-round-25.log`、`docs/split/test-round-26.log` —— 由题述指定的 `unblock-g2.sh`（`LOG_DIR=docs/split`）**按运行手册自身生成**，非手工改动 `docs/`；两轮均在空序号上新建，未覆盖任何历史归档。

---

## 6. 残留项与理由（2 条）

### 6.1 残留 ①：`server/src/infrastructure/teacher/grade.js:14` —— `gradeProject` 死函数（ESLint warn 1 条 + 门禁 1 条）

**它是什么**：一个 **60 行的 HTTP 处理函数**（`const gradeProject = async (req, res) => { … }`，第 14–73 行），内部做「查题 → 读标准包文件 → 动态 import `../ai/deepseek/index.js` 的 `gradeProject` → 返回试评结果」。

**是否被引用（AST 证据）**：

| 证据 | 结果 |
| --- | --- |
| `binding.references` | **0** |
| `binding.constantViolations.length` | **0** |
| 是否 `export` | **否**（`refs=0` 且无 export ⇒ 文件外不可能引用） |
| 全仓 `gradeProject` 符号引用 | 仅出现在 `grade.js` 自身、以及 deepseek 侧**同名但无关**的 `project-grading.js:35` / `deepseek-gateway.js:170` |
| 路由注册 | `server/src/routes/teacher.js` 无对应路由；`infrastructure/teacher/index.js:9` 只再导出 `generateReference` |
| 客户端调用 | `client/src/api` 无对应接口 |
| **git 历史** | 回溯到最早可见版本（`152ec99`），`teacherController.js` 中**始终**是 `const gradeProject = …`（**从未** `export`）⇒ 本次拆分没有引入它，它是**先于拆分就存在的死代码** |
| **门禁自身的迁移台账** | 门禁独立判定它是「同一处缺陷换宿主」：`teacherController.js:159 → grade.js:14` |

**结论**：它在语义上**确实是死代码**，删除本身行为无损。

**为什么本轮保留 —— 三条理由**：

1. **§四② 会把这次删除变成「制造新的死代码」**。删除它会让该文件 6 个 import 绑定同时失去唯一消费者：`fs`(7)、`path`(8)、`prisma`(9)、`logger`(10)、`{hasStandardPackage, UPLOADS_ROOT}`(11)；而 `generateReference` 只用 `generateReferenceAnswer`（第 12 行，保留）。这 **5 条语句全部变空**，且在本文件内均无第二处导入 ⇒ 按 §四② **只能改写成 5 条副作用导入**：

   ```js
   import 'fs';
   import 'path';
   import '../../utils/prisma.js';
   import '../../utils/logger.js';
   import '../../utils/projectPaths.js';
   ```

   其中 `fs` / `path` 是 Node 内建模块，副作用导入**没有任何语义**。以「删 1 条死声明」为代价换取「新增 5 条（3 条纯噪音的）副作用导入」，**产出的代码严格劣于现状** —— 这正是 §四② 用「保留原样」兜底的场景。
   （对比：§3 那 6 条是**清理前就已经全名皆死**的既有死重，改写成副作用导入只是**保留现状语义**；而本项是**由我的删除动作新造出来**的死重，两者性质不同。）
2. **它不像其它项那样「无功能含义」**：它是一个完整的 HTTP 端点处理器。虽然从未接线，但「该端点是被有意废弃，还是漏接线」属于**产品/契约决策**，不是清理专项该单方面拍板的。
3. 因此按题述「拿不准就只登记 + 回报 Captain，不要擅自改」处理。

**给 Captain 的一键解法（授权后 2 分钟）**：

```bash
# 方案 A（推荐，最干净）：删函数 + 连带删除 5 条已无消费者的 import 语句（整条删，不留裸导入）
#   删除 grade.js 第 7-11 行（5 条 import）与第 14-73 行（gradeProject 全体）
#   结果：grade.js 只剩 import { generateReferenceAnswer } + generateReference
#   ⇒ 门禁 0 条、ESLint warn 1 条（只剩 §6.2 的 no-constant-condition）
# 方案 B（严格守 §四②）：只删函数体，5 条语句改裸导入 ⇒ 门禁 0 条，但文件多 5 条噪音导入
# 方案 C：确认该端点应当存在 ⇒ 改为 export + 在 routes/teacher.js 注册（属功能变更，另立任务）
```

> 回滚参考：本次全部改动均未提交，`git diff` 可见；`gradeProject` 原文完整保留在 `git show HEAD:server/src/infrastructure/teacher/grade.js`。

### 6.2 残留 ②：`client/src/composables/question/questionPure.js:71:6` —— `no-constant-condition`（ESLint warn 1 条）

**它是什么**：`detectCodeLang()` 里的一行**恒真判断**：

```js
  // C++ (含 C 特征但有 class/namespace/template)
  if(/#include\s*<|std::|cout\s*<</)return'cpp';     // ← 第 71 行
  // Swift
  if(/\b(func|var|let)\s+\w+\s*[:\(]|import\s+Foundation/.test(c))return'swift';
  …
```

**为什么报 `no-constant-condition`**：正则字面量是对象，**恒为真值**。ESLint 的 `isConstant` 对非字符串 `Literal` 判定为常量，故 `if(/`…`/)` 恒真。

**是否有意 → 判定：不是有意的，这是一个真实缺陷（漏写 `.test(c)`）**。三条旁证：

1. **同文件其它 16 处**同类判断**全部**写成 `if(/…/.test(c) …)`（第 42、43、51、53、55、57、59、61、63、65、67、69、73、75、77、79 行），只有第 71 行漏了 `.test(c)`；
2. **它使 4 种语言的检测成为死代码**：恒真 ⇒ 第 73–79 行的 Swift / Kotlin / Shell / SQL 分支**永不执行**；而紧随其后的第 81 行 `return'cpp';` 是**同一个兜底返回值** —— 两个相邻的 `return 'cpp'` 之一可达、之一不可达，是典型的漏改特征；
3. 注释「（含 C 特征但有 class/namespace/template）」表明作者**本意是加条件**，但条件没写出来。

**为什么不修**：修复方式（补 `.test(c)`）会**改变 `detectCodeLang` 的返回值**（Swift/Kotlin/Shell/SQL 工程将不再被误判为 `cpp`），属于**行为变更**，与本次专项的硬约束「不得改任何逻辑（只删未被引用的声明）」直接冲突；用 `eslint-disable` 注释压制则属于**掩盖真实缺陷**，更不可取。故**按题述要求登记 + 回报 Captain，不擅自改**。

**影响面**：`detectCodeLang` 用于按语言给代码块上色 / 选编辑器语言；被误判的输入只会落到 `cpp`。属**既有产品行为**，本轮不动。

---

## 7. 给 C 的验证指令

> 工作目录：`/Users/you/My Projects/My Vue/Exam-DeepSeek`（路径含空格，务必加引号）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"

# ── 1) 两道判据读数（期望：ESLint error 0 / warn **2**；lint-check exit 0 / 当前 **1** 条）
npx eslint client/src server/src -f json | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let e=0,w=0,out=[];
  for(const f of JSON.parse(s))for(const m of f.messages){m.severity===2?e++:w++;
    out.push(f.filePath+":"+m.line+" "+m.ruleId+" "+m.message);}
  console.log("errors="+e+" warnings="+w);out.forEach(x=>console.log("  "+x));});'
# 期望输出：errors=0 warnings=2
#   …/questionPure.js:71 no-constant-condition Unexpected constant condition.
#   …/teacher/grade.js:14 no-unused-vars 'gradeProject' is assigned a value but never used…

node scripts/gates/lint-check.mjs; echo "lint-check exit=$?"
# 期望：PASS；「已消除（基线内被修掉）: 30 条」；当前违规 1 条（gradeProject）；exit=0
node scripts/gates/lint-check.mjs --json --list | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const g=JSON.parse(s);
  console.log("counts:",JSON.stringify(g.counts));
  console.log("violations:",(g.violations||[]).length);
  (g.violations||[]).forEach(v=>console.log("  "+v.file+":"+v.line+" "+v.rule+" "+v.symbol));
  console.log("blocking:",(g.blockingViolations||[]).length);});'
# 期望：no-unused-vars=1，其余全 0；violations=1（grade.js:14 gradeProject）；blocking=0

# ── 2) 五道结构门禁（期望全 PASS，且与基线持平）
( cd server && node scripts/check-layers.mjs )          # 违规 0 / 未分层 42
node scripts/gates/arch-metrics.mjs                     # layerViolations 0 · unmigrated 42 · godfileOver800 1 → PASS
node scripts/gates/cycle-check.mjs                      # server/src SCC 0 → PASS
node scripts/gates/cycle-check.mjs --root client/src    # client/src SCC 0 → PASS
node scripts/gates/hard-metrics.mjs                     # hex6 0 / important 0 / modalConfirm 0 → PASS
node scripts/gates/bind-check.mjs                       # BINDING VIOLATIONS 0 → exit 0

# ── 3) 行为无损复核：改动只允许出现三类形态
git diff --stat                                          # 38 files, +51 / -75
git diff -U0 | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)" | sort | uniq -c | sort -rn | head -40
#   期望看到的只有：
#     · catch (e|err) {   →   catch {
#     · 具名/默认导入整行   →   裸副作用导入（6 条，见 §3.2）
#     · 纯删除行（TEMPLATES / draftTimer / deadlineTimer / reviewSummary / mapping /
#                nodeRequire+其注释 / batch.js 的 let count 与 count = … / controller 解构项）
#     · 4 处形参收窄（mockEvidence / getTeamTeacherIds / analyze / extractPythonFacts）
#     · 8 处具名导入删名（语句仍在）
#   任何一处「逻辑行被改写」都是异常，请直接驳回。

# ── 4) 关键行为抽查（不依赖数据库）
node -e 'import("./client/src/composables/question/questionPure.js").then(m=>{
  console.log("detectCodeLang 未被改动，样例：", m.detectCodeLang("fun main(){}",""));
});'
#   期望：'cpp'（既有行为，本专项刻意未修，见 §6.2）

# ── 5) 全量回归（本轮已归档，勿覆盖）
grep -E "^Test Suites:|^Tests:|^Time:" docs/split/test-round-25.log
#   期望：4 处 Test Suites 摘要行（server 的 npm test 由 4 段 jest 组成）+ failed=0

# ── 6) 定向测试（本专项新增的 10 个文件，独立进程、互不共享进程状态）
#    先按 unblock-g2.sh 的口径派生测试库 URL（只换库名，凭据不回显）
TEST_URL="$(node -e '
const fs=require("fs");const t=fs.readFileSync("server/.env","utf8");
const m=t.match(/^DATABASE_URL=(.*)$/m);const u=new URL(m[1].trim().replace(/^"|"$/g,""));
u.pathname="/exam_system_test";process.stdout.write(u.toString());')"
cd server
for f in test/integration/tc-b0-*.test.js test/integration/rc-*.test.js; do
  echo "── $f"
  DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules \
    npx --no-install jest --config test/jest.config.js --runInBand --forceExit "$f" 2>&1 | tail -6
done
#   期望：10 个文件各自 Test Suites: 1 passed, 1 total ／ Tests: … failed=0

# ── 7) 基线刷新（⚠️ 仅在 §6.1 裁决并清零之后执行）
# node scripts/gates/lint-check.mjs --update-baseline   # 期望输出「违规总数: 0」
```

---

## 附：本轮改动文件（38 个）

全部为「删除死声明 / catch 收窄 / 具名导入→裸导入 / 形参收窄」四类，**无一行逻辑被改写**。

| 目录 | 文件数 |
| --- | --- |
| `client/src` | 16（`.vue` 8 / `.js` 8） |
| `server/src` | 22 |
| `docs/pipeline/lint-cleanup.md` | 1（本报告） |

未改动：`client/dist`、`tests/`、`scripts/gates/`（判据未动）、其它 `docs/`、`eslint.config.mjs`、`docs/pipeline/lint-baseline.json`（未刷新）、`package.json`（无新增依赖）。
