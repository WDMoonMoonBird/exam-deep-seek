# lint-check 常驻静态检查门禁 —— 设计 · 自检 · 基线报告

| 项 | 值 |
| --- | --- |
| 门禁脚本 | `scripts/gates/lint-check.mjs`（新建，958 行） |
| 基线文件 | `docs/pipeline/lint-baseline.json`（31 条 / 21 个文件 / 5.4 KB） |
| 建立时间 | 2026-10-11 |
| 扫描规模 | 195 文件 / 33 304 行（`client/src` 99 个：`.vue` 40 + `.js` 59；`server/src` 96 个 `.js`） |
| 全量耗时 | **0.55 s**（3 次实测 0.55 / 0.57 / 0.55，预算「十几秒」的 5%） |
| 新增依赖 | **0**（只用仓库内已有的 `client/node_modules` 包，不装包、不联网） |
| 退出码 | `0` = 无基线外新违规 / `1` = 有新违规 / `2` = 执行错误或基线缺失 |
| 产品代码改动 | **0**（本轮只建门禁 + 记录基线） |

> **基线快照口径**：本轮的扫描期间仓库里有并行的产品代码改动（`client/src/composables/review/` 新增、`ReviewDetail.vue` 修改），文件数一度从 92 涨到 99。基线是在 **195 文件 / 33 304 行**这一稳定状态上冻结的，此后重复运行结果一致（新增 0）。若后续再有产品代码改动，请按 §9.3 的纪律决定是「修掉」还是「评审后刷基线」，**不要习惯性刷基线**。

---

## 0. TL;DR

- 自检 **8/8 正控全部命中**，干净树 **0 误报**（6 个样本文件覆盖全部已知假阳性写法）。
- 全量首跑 67 条 no-unused-vars，人工复核后定位并修掉 **36 条假阳性**（详见 §5），最终基线 **31 条，逐条复核均为真阳性**。
- 现有代码 **no-undef = 0**：不是规则没生效，而是白名单恰好完备（§6 用独立探针证明：全仓 1 524 次未绑定引用共 49 个不同名字，**100% 落在白名单里，白名单外 0 个**）。
- 门禁对自己所在的 `scripts/gates/` 目录跑了一次，抓到 `arch-metrics.mjs:49` 的 `layerExit`（声明后只赋值、从未读取）——第三方代码上的真阳性，佐证规则不是橡皮图章。

---

## 1. 动机：四类「机器本可以拦住」的缺陷

2026-10-11 的 GodFile 拆分连续踩到四类缺陷，其中①潜伏了 3 个 step + 2 次提交才被自建扫描器抓到：

| # | 缺陷类别 | 现场后果 | 为什么既有检查拦不住 | 本门禁对应规则 |
| --- | --- | --- | --- | --- |
| ① | **自由标识符**：引用但未声明 / 未 import / 未注入 | 学生答题页一按键盘即抛 `ReferenceError` | `node --check` 只看语法；`vite build` 不做作用域绑定校验；既有 5 道门禁都不查标识符 | `no-undef` |
| ② | **未绑定名进入 return 面** | 构建全绿，运行到那一行才炸 | 同上（表达式位置的名字不参与任何静态校验） | `no-undef`（覆盖任意表达式位置，含 `return` 操作数） |
| ③ | **相对 import 指向已被删除的模块** | 拆分后残留 3 处 | `bind-check.mjs` 对「解析不到文件」只登记不判负（它有它的边界④） | `no-unresolved-import` |
| ④ | **未使用的声明 / 拼写错的引用** | 全靠人工阅读发现 | 无任何工具覆盖 | `no-unused-vars`（+ `no-dupe-keys` / `no-redeclare` / `no-const-assign`） |

设计目标因此非常具体：**把这四类变成每次都能自动拦住**，同时**不制造新的噪声**（噪声化的门禁会被绕过，等于没有门禁）。

---

## 2. 设计

### 2.1 扫描面

| 纳入 | 说明 |
| --- | --- |
| `client/src/**/*.js` | 全文分析 |
| `client/src/**/*.vue` | **只分析 `<script>` / `<script setup>` 脚本块**；`<template>` 不查 |
| `server/src/**/*.js` | 全文分析（`.mjs` / `.cjs` 也一并纳入，实测 7 个） |

**排除**：`tests/`、`node_modules`、`client/dist`、`docs/`、`coverage`、`uploads`、`.vite`。

Vue SFC 的处理细节：

- 用 `client/node_modules/@vue/compiler-sfc` 的 `parse()` 取 `descriptor.script` / `descriptor.scriptSetup`；
- 行号用 **offset 反推**（`sfcSource.slice(0, block.loc.start.offset).split('\n').length`）而不是直接信 `loc.start.line`，实测两者一致但前者不依赖 API 语义稳定性；
- **同时存在 `<script>` 与 `<script setup>` 时按行拼接后一次性分析**（Vue 会把两块合并进同一模块作用域）。分开分析会把「A 块声明、B 块使用」误报成 `no-undef` —— 自检样本 `clean/BothBlocks.vue` 专门钉住这个行为。

### 2.2 六条规则（离线 AST 实现，`+1` 条防御性附加项）

| 规则 | 判据 | 实现要点 |
| --- | --- | --- |
| **`no-undef`** | 标识符被引用但 `path.scope.getBinding()` 找不到绑定，且不在全局白名单 | 核心规则。Babel 的 `ReferencedIdentifier` 覆盖读取位置；**赋值目标不是 ReferencedIdentifier**（`ghost = 1` 不会被它报出），因此额外挂 `AssignmentExpression` 显式检查 `Identifier` / 解构模式目标。`typeof x` 按 ESLint 默认放行（它不会抛 ReferenceError）。`arguments` 沿函数父链判定：非箭头函数内合法，模块顶层报错。 |
| **`no-unused-vars`** | 作用域 `bindings` 里 `binding.referenced === false` | 豁免规则见 §2.2.1。`export` 的声明不算未使用（含 `export default function f(){}` 的具名形式）。形参按 ESLint 默认 `args: 'after-used'` 处理。 |
| **`no-unresolved-import`** | 相对说明符解析不到磁盘上的文件 | 覆盖 `import ... from` / 副作用 `import '...'` / **`export { x } from './y'`** / `export * from` / `import()` 静态串 / `require()` 静态串。候选落点 27 种扩展名 + 6 种 `index.*`；先剥掉 Vite 的 `?raw` / `?url` / `#hash` 后缀。 |
| **`no-dupe-keys`** | 对象字面量同一键出现多次 | 静态键名（标识符 / 字符串 / 数字 / BigInt）归一化后比较；`computed` 键跳过；**`get x()` + `set x(v)` 配对合法**；数字键与等值字符串键视为同一键（`1` ≡ `'1'`）。 |
| **`no-redeclare`** | 同一绑定作用域内同名声明 ≥ 2 次 | 「绑定作用域」交给 Babel 判定（`getBinding(name).scope`），不自己重实现作用域提升。`var` 提升到函数作用域、`function` 提升到声明所在作用域。全为 `param` 的组跳过（宽松模式重复形参）。解析器本身会先拦掉 `let/const` 的非法重复。 |
| **`no-const-assign`** | 对 `const` 绑定 **或 `import` 绑定**赋值 | 只覆盖写位置（`AssignmentExpression` / 解构目标）。把「给 import 绑定赋值」并入本规则：ESM 下同样是 `TypeError`，与给 const 赋值是同一缺陷类。 |
| `parse-error`【附加】 | 文件解析失败 | **该文件的所有规则都会被静默跳过** —— 这是最危险的盲区，必须显式暴露并同样适用「新增即阻断」。 |

#### 2.2.1 `no-unused-vars` 的豁免清单（**全部是有意的、且方向一律是「宁可漏报」**）

| 豁免 | 理由 |
| --- | --- |
| `_` 前缀 | 显式「故意不用」的仓库约定 |
| `export` 的声明 | 对外 API，用不用不由本文件决定 |
| `<script setup>` 顶层声明出现在模板文本里 | 本门禁只查脚本；见 §2.2.2 |
| `...rest` 元素 | `const { a, ...rest } = obj` 的「取出剩余字段」是刻意写法 |
| `catch` 形参 | 对齐 ESLint v8 默认 `caughtErrors: 'none'`；实测本仓 31 处 |
| 具名函数表达式的自名 | `(function bindSystemWatcher(){ ... })()` 是自文档化 IIFE，不是缺陷 |
| `args: 'after-used'` 之前的形参 | 对齐 ESLint 默认 |

#### 2.2.2 `<script setup>` 的模板使用判定（本门禁唯一的「非精确」判定，必须说清）

`<script setup>` 的顶层声明可能**只被模板使用**，脚本内看起来就是「未使用」。本门禁的判定方式是：**在 `<template>` 的原始文本里做词边界匹配**，命中即宽免。

- 匹配时**同时尝试 kebab-case 形式**：模板里写 `<inbox-outlined />` 会解析到 `InboxOutlined` 绑定（Vue 的 `hyphenate` 就是 `\B([A-Z])` → `-$1` 再小写）。实测本仓有 **4 处**属于这种写法，漏掉这条会产生 4 条误报。
- 这是**文本匹配，不是语义分析**：名字恰好出现在注释/字符串里也会宽免。方向是「宁可漏报」——对一个被误报毁掉信任的门禁，这个方向的误差是可接受的。
- 反面同样是硬要求：模板里**没有**引用的 `<script setup>` 顶层声明**必须照报**。自检正控 `ctl/setup-unused-other.vue` 专门钉住这一点，防止宽免被写成「setup 一律不报」。

### 2.3 ★ 基线对比模式（沿用 `arch-metrics.mjs` 的既有范式）

**为什么必须这样**：本仓 3.4 万行代码从未跑过 lint。一次性清零不现实 —— 那意味着几十处产品代码改写，而**大面积改写本身就是行为变更风险**，正是这一轮重构要避免的东西。

判定规则：

```text
只有「基线之外的新违规」才 exit 1；已存在的违规只统计、不阻断。
```

**比对键 = `file + rule + symbol`，并按「出现次数」比对**：

| 情形 | 判定 | 理由 |
| --- | --- | --- |
| 同一处违规因上方增删行而挪位（10 行 → 40 行） | **不算新违规** | 纯行号比对会让任何一次编辑都把整份基线判成「全红」，门禁会立刻被绕过 |
| 某文件同类违规从 1 条变 2 条（多出一处 `no-undef:foo`） | **算 1 条新违规**，并优先定位到「行号也不在基线里」的那条 | 行号漂移免疫的前提下仍能抓住真新增 |
| 出现全新的 `file\|rule\|symbol` 组合 | **算新违规** | |
| 基线里的违规被修掉 | 记入「已消除 N 条」，仅作信息展示 | 让基线**只减不增**这件事可见 |

**基线缺失时的行为**：打印醒目错误并 **exit 2**（「门禁无法给出判决」），而不是静默 pass。基线是随仓库提交的文件，删掉它应当是一次响亮的失败，而不是一次安静的放行。

```
⚠️ `--update-baseline` 使用纪律：它是「把当前违规吸收进基线」的动作，必须在评审知情下运行。
   建议 DoD 里先跑默认模式；FAIL 就停下来看新违规是什么，而不是直接刷基线消红。
```

### 2.4 用法

```bash
node scripts/gates/lint-check.mjs                     # 默认：基线对比（DoD 用这一条）
node scripts/gates/lint-check.mjs --update-baseline   # 生成/刷新基线
node scripts/gates/lint-check.mjs --self-test         # 正控自检（改动门禁后必跑）
node scripts/gates/lint-check.mjs --json              # 机器可读
node scripts/gates/lint-check.mjs --list              # 打印全量违规清单
node scripts/gates/lint-check.mjs --rule=no-undef     # 只看某条规则
node scripts/gates/lint-check.mjs --root <dir>        # 换扫描根（自测/试验用）
```

### 2.5 离线依赖（不装任何包、不联网）

```js
// scripts/gates/lint-check.mjs —— 依赖解析用 createRequire 指向仓库内已有的 node_modules
createRequire(ROOT/client/package.json).resolve('@babel/parser')      // 7.29.8
createRequire(ROOT/client/package.json).resolve('@babel/traverse')    // 7.29.8
createRequire(ROOT/client/package.json).resolve('@vue/compiler-sfc')  // 3.5.34
// 找不到时依次回退 server/package.json、根 package.json；三者都找不到才 exit 2
```

解析器参数：`sourceType: 'module'` 优先，失败回退 `'unambiguous'`（给可能的 CJS 文件留路）。全仓 195 文件 **解析失败 0 个**。

### 2.6 性能

| 阶段 | 实测 |
| --- | --- |
| 全量（parse + traverse + 6 条规则 + 基线比对 + 报告） | **0.55 s** |
| 扫描吞吐 | 195 文件 / 33 304 行 / 20 673 次标识符引用 |

余量极大：即使代码量翻 10 倍也远在「十几秒」预算内。

---

## 3. `--self-test` 原始输出

```
（原始输出，未编辑；临时目录跑完即删）
```

下面是逐字复制的运行结果（临时目录名由 mkdtemp 随机生成，每次运行只有那一行不同）：

```text
=== lint-check --self-test（正控自检：注入的缺陷必须被检出，干净样本必须零误报）===
临时树    : /var/folders/s_/43wwq7nd1n37cw5n7d8sp6vr0000gn/T/lint-check-selftest-piBCem（跑完即删）

── ① 干净树（6 个文件，逐条覆盖已知假阳性写法） ────────────────────────────────────────────────────────
  ✓ clean/BothBlocks.vue                0 条
  ✓ clean/ChildWidget.vue               0 条
  ✓ clean/Clean.vue                     0 条
  ✓ clean/KebabUse.vue                  0 条
  ✓ clean/main.js                       0 条
  ✓ lib/dep.js                          0 条
  小计：干净树 6 文件 / 误报 0 条

── ② 正控树（8 条正控，每条必须被精确检出） ──────────────────────────────────────────────────────────
  ✓ no-undef                  ctl/no-undef.js
        命中 no-undef  freeIdentifierNeverDeclared   — 引用但未声明 + 赋值给未声明的标识符
        命中 no-undef  alsoFreeAssignTarget   — 引用但未声明 + 赋值给未声明的标识符
  ✓ no-unused-vars            ctl/no-unused-vars.js
        命中 no-unused-vars  declaredButNeverUsed   — 声明但从未使用（export 的不算）
  ✓ no-unresolved-import      ctl/no-unresolved-import.js
        命中 no-unresolved-import  ./module-deleted-by-refactor.js   — 相对 import 指向已删除模块（含 export ... from）
        命中 no-unresolved-import  ./also-deleted.js   — 相对 import 指向已删除模块（含 export ... from）
  ✓ no-dupe-keys              ctl/no-dupe-keys.js
        命中 no-dupe-keys  retries   — 对象字面量重复键
  ✓ no-redeclare              ctl/no-redeclare.js
        命中 no-redeclare  duplicated   — 同一作用域重复声明
  ✓ no-const-assign           ctl/no-const-assign.js
        命中 no-const-assign  frozen   — 对 const 绑定赋值
  ✓ 是否宽免过头                    ctl/setup-unused-other.vue
        命中 no-unused-vars  hiddenAndUnused   — 模板未引用的 <script setup> 顶层声明仍须报未使用
  ✓ parse-error【附加】           ctl/parse-error.js
        命中 parse-error  <syntax>   — 解析失败必须显式暴露（否则该文件所有规则静默跳过）
  小计：8/8 条正控命中

── ③ 注入后干净样本复检 ───────────────────────────────────────────────────────────
  ✓ 干净样本仍为 0 条误报

── ④ 基线对比逻辑（行号漂移 vs 真新增） ─────────────────────────────────────────────────
  ✓ 行号漂移（10→40 行）不算新违规
  ✓ 同类净增一条 ⇒ 恰好 1 条新违规，且定位到新增的 99 行
  ✓ 全新 file|rule|symbol ⇒ 判为新违规
  ✓ 基线内违规被修掉 ⇒ 记入「已消除」

SELF-TEST PASSED: 8/8 正控命中，干净树 0 误报（门禁非「永远绿灯」）
```

自检做了三件事，缺一不可：

1. **① 干净树零误报**：6 个样本文件把「已知会诱发假阳性的写法」逐条钉死 —— 对象方法简写形参绑定、函数体内前向引用（先用后声明）、正则字面量、模板字符串字面量、浏览器/Node 全局、`import.meta`、`typeof` 豁免、`...rest` 豁免、`export` 的声明不算未使用、`export { x } from './y'` 解析、`<script setup>` 顶层声明只被模板使用（含 **kebab-case** 写法）、`<script>` + `<script setup>` 双块合并。任一条被判违规即 **FAIL**。
2. **② 正控逐条命中**：为 6 条规则各注入一处真实缺陷（外加 2 条附加正控），**每条都必须被精确检出（规则名 + 符号名都对得上）**，并额外断言「不该报的没报」（例如 `export const keep` 不得被判未使用）。
3. **④ 基线对比逻辑**：4 个纯逻辑用例，钉住「行号漂移不算新违规 / 同类净增才算 / 全新组合算 / 已消除可统计」。

> **没有负向自检的门禁等于永远绿灯。** 这一节是本门禁可信的全部依据；任何对规则实现或豁免清单的改动，都必须让 `--self-test` 重新全绿。

自检过程中它真的抓到过一次我自己的错误：我给 `clean/KebabUse.vue` 写样本时手滑留了一个模板里没用到的 `const unusedOk`，第 ① 步立刻 FAIL 并指出 `clean/KebabUse.vue:7 no-unused-vars unusedOk`。这说明这套自检不是装饰。

---

## 4. 基线统计

基线文件：`docs/pipeline/lint-baseline.json`（31 条 / 21 个文件 / 5 436 字节）。

### 4.1 分类统计

| 规则 | 基线条数 | 说明 |
| --- | ---: | --- |
| `no-undef` | **0** | 见 §6：不是规则没生效，而是白名单恰好完备 |
| `no-unused-vars` | **31** | 全部为真阳性，逐条人工复核过 |
| `no-unresolved-import` | **0** | 拆分后残留的 3 处已在历史步骤中修掉 |
| `no-dupe-keys` | **0** | |
| `no-redeclare` | **0** | |
| `no-const-assign` | **0** | |
| `parse-error` | **0** | 195 个文件全部解析成功 |
| **合计** | **31** | |

> 解读：本仓在 no-undef / 未解析 import 上的「历史欠账」实际已经还清；剩下 31 条全是**死代码**（导入后不用的图标与函数、声明后不用的变量、解构后不用的字段）。它们不影响运行，但是真实的维护负担与「重构后残留」的信号，值得作为后续独立步骤清理。

### 4.2 全部 21 个文件

| # | 文件 | 条数 |
| ---: | --- | ---: |
| 1 | `server/src/services/projectGrader.js` | 4 |
| 2 | `server/src/controllers/teacherController.js` | 3 |
| 3 | `server/src/infrastructure/ai/deepseek-gateway.js` | 3 |
| 4 | `client/src/api/checker.js` | 2 |
| 5 | `client/src/components/checker/CheckerWizard.vue` | 2 |
| 6 | `client/src/composables/submit/useAnswerState.js` | 2 |
| 7 | `client/src/views/admin/Monitor.vue` | 1 |
| 8 | `client/src/views/teacher/Layout.vue` | 1 |
| 9 | `client/src/views/teacher/ProjectQuestionEdit.vue` | 1 |
| 10 | `client/src/views/teacher/ReviewClass.vue` | 1 |
| 11 | `server/src/controllers/projectReviewController.js` | 1 |
| 12 | `server/src/controllers/reviewController.js` | 1 |
| 13 | `server/src/controllers/teamController.js` | 1 |
| 14 | `server/src/domain/entities.js` | 1 |
| 15 | `server/src/infrastructure/ai/checker/llm.js` | 1 |
| 16 | `server/src/infrastructure/ai/deepseek/config.js` | 1 |
| 17 | `server/src/infrastructure/ai/deepseek/submission-grading.js` | 1 |
| 18 | `server/src/infrastructure/execution/ast-analyzer.js` | 1 |
| 19 | `server/src/infrastructure/rule/syntax.js` | 1 |
| 20 | `server/src/services/defectScoring.js` | 1 |
| 21 | `server/src/services/factExtractors/python.js` | 1 |

抽样复核（每条都回源码确认过，不是靠规则输出自证）：

- `server/src/services/projectGrader.js:8` `fs`、`:9` `path`、`:11` `getLanguageByExt` / `isIgnored` —— P6 拆分后遗留的 import，文件内确实没有第二处引用。
- `server/src/infrastructure/ai/deepseek-gateway.js:69/125/177` `controller` —— `const { res, controller, timer } = await this.#request(...)` 里 `controller` 解构出来就没再用（`timer` 有用）。
- `server/src/controllers/reviewController.js:354` `count` —— `let count = 0` 之后只有 `count = toReview.length` 这一处**写**，响应体用的是 `reviewedStudentIds.size`。这正是 ESLint 的 "assigned a value but never used"。
- `client/src/composables/submit/useAnswerState.js:34/35` `draftTimer` / `deadlineTimer` —— `let draftTimer = null; let deadlineTimer = null;` 之后再无引用。

---

## 5. 假阳性治理记录（本轮实际踩到并修掉的）

第一版全量跑出 **67 条** no-unused-vars。人工复核后定位 **36 条假阳性**并全部修掉，最终 **31 条**：

| 陷阱 | 现象 | 处理 | 影响 |
| --- | --- | ---: | ---: |
| **`catch` 形参** | Babel 把 `catch (e)` 的 binding kind 记为 `let`（**不是** `catch`），按 kind 写的豁免代码从未生效 | 在 `CatchClause` 访问器里把该 binding **对象**记进 `WeakSet`，按绑定身份豁免（不用名字，避免与同名的普通 `let` 混淆） | −31 条 |
| **具名函数表达式自名** | `(function bindSystemWatcher(){ ... })()` 的自文档化 IIFE | `FunctionExpression.id` 的 own binding 记进 `WeakSet` 豁免 | −1 条 |
| **模板 kebab-case** | `<inbox-outlined />` / `<editor-content />` / `<lock-outlined />` 解析到 `InboxOutlined` / `EditorContent` / `LockOutlined` 绑定，但模板文本里匹配不到 PascalCase 名字 | `templateMentions()` 增加 Vue `hyphenate` 形式的第二次匹配 | −4 条 |
| 其余 31 条 | 回源码逐条确认（见 §4.2 抽样） | 保留在基线里 | — |

**方向上的一贯取舍**：所有不确定的地方一律选择「宁可漏报，不可误报」。理由很直接 —— 一条误报会让使用者学会「这个门禁会瞎报」，然后整个门禁被无视；一次漏报只是回到没有门禁的状态。

---

## 6. 白名单完备性审计（证明 `no-undef = 0` 是真的）

`no-undef = 0` 有两种可能：规则没生效，或者代码确实干净。为了区分，用一个独立探针（**不走门禁代码**，直接复用 Babel 遍历 + 从门禁源码里正则抽出白名单）重算了一遍：

```text
whitelist: ES=61  NODE=50  BROWSER=174  VUE=8  =>  total 284 unique

referenced identifiers total=20673   bound=19130   vue-macro=19   free(whitelisted)=1524 over 49 distinct
★ FREE AND **NOT** IN WHITELIST  =>  (none)  ← 白名单恰好完备

未被任何文件使用的白名单条目: 235 / 284（冗余但无害，为后续代码留余量）
```

结论：

- 全仓 20 673 次标识符引用里，19 130 次解析到真实绑定、19 次是 Vue 编译器宏、**1 524 次落在全局白名单**（49 个不同名字）。
- **白名单之外仍未绑定的标识符 = 0 个** ⇒ `no-undef = 0` 是「真的干净」，不是「规则哑了」。
- 白名单分三档：ES 内建 61 + Node 运行时 50 + 浏览器 174；Vue 编译器宏（`defineProps` / `defineEmits` / `defineExpose` / `defineOptions` / `defineSlots` / `defineModel` / `defineRender` / `withDefaults`）**只在 `.vue` 文件里生效** —— 放进全局会掩盖 `.js` 文件里把 `defineProps` 拼错之类的真缺陷。
- 实测高频使用的前几名：`String`(195) `Number`(126) `Set`(119) `Math`(116) `Array`(100) `Date`(90) `undefined`(82) `JSON`(73) `Promise`(71) `Error`(70) `document`(51) `Object`(46) `setTimeout`(45) `window`(41) `process`(40)。

---

## 7. 证据：四类历史缺陷的复现检出

把 `client/src` + `server/src` 整树复制到 `/tmp`，在**真实代码**上注入历史缺陷，用门禁复跑：

| 场景 | 注入 | 门禁反应 |
| --- | --- | --- |
| ① 自由标识符 | 在 `client/src/views/student/Submit.vue`（**历史事故现场**：学生答题页）末尾加入 `function __demoKeyboardHandler(ev) { return ev.key + notDeclaredAnywhereSymbol; }` | ✗ `Submit.vue:320  no-undef  notDeclaredAnywhereSymbol` —— 精确命中，且该标识符正处在 **return 面的表达式里**（同时覆盖缺陷类别 ②） |
| ③ 模块被删 | `rm client/src/domain/format.js` | ✗ **11 处** `no-unresolved-import` 同时报出（`useStudentSubmission.js:11`、`admin/Classes.vue:69`、`teacher/Students.vue:168` …），全部指向 `../../domain/format.js` |
| ④ 死代码 | 无需注入 | 基线里 31 条；另外把门禁指向 `scripts/gates/` 时抓到 `arch-metrics.mjs:49  no-unused-vars  layerExit` |
| ② 未绑定名进 return 面 | 同场景 ① | `no-undef` 覆盖任意表达式位置，不区分语句/返回/条件 |

> 补充说明：`export { x } from './y'` 这一形式的未解析 import 由自检正控 `ctl/no-unresolved-import.js` 覆盖（门禁确实报了 `./also-deleted.js`）；顺带一提，`export { ghostLocal }`（引用本模块未声明的名字）会被 Babel 直接判为解析错误，被 `parse-error` 规则接住。

---

## 8. ★ 本门禁查不到什么（明确的边界）

这一节是刻意写全的：**知道门禁不查什么，和知道它查什么一样重要**，否则会把「lint-check 绿了」误读成「代码没问题」。

### 8.1 模板（最大的空白）

`<template>` **完全不查**。模板需要 Vue 专用规则（`eslint-plugin-vue`），超出本门禁范围。因此下列问题**一律查不到**：

- 模板语法错误、指令拼写（`v-if` / `v-for` / `v-model` 写错）；
- **模板里引用了脚本中不存在的变量**（例如把 `{{ message }}` 写成 `{{ messge }}`）——脚本这边看不到任何东西；
- 组件用了但没 import / 没注册；
- `v-for` / `v-slot` 作用域变量、事件名、props 名、`key` 缺失。

由此产生一个**有意的宽免**：`<script setup>` 顶层声明只要在模板文本里出现（含 kebab-case）就判为「已使用」（§2.2.2）。代价是**漏报**：一个只被模板注释提到的名字，或模板局部变量与脚同名，都会被误宽免。

### 8.2 类型

不做任何类型推断与检查。`a.b` 里 `b` 不存在、参数类型不匹配、`null` 解引用 —— 全部查不到。JS 项目需要别的工具（TS 项目需要 `tsc` / `vue-tsc`）。

### 8.3 跨文件接线错配（**重点**）

`no-unresolved-import` 只能证明**路径指向的文件存在**，不能证明**里面导出的名字存在**：

- `import { foo } from './bar.js'` 而 `bar.js` 只导出 `baz` —— 这是 `bind-check.mjs` 的职责，不是本门禁的；
- **字符串契约全部查不到**：props 名、emit 事件名、Socket 事件名、REST 路径、路由 name/path、Pinia store id、localStorage 键、i18n key、数据库字段名 —— 拼错一个字母，本门禁一句话都不会说；
- 函数签名/参数顺序错配、返回值形状错配。

### 8.4 代码风格

缩进、引号、分号、行宽、命名约定、import 排序、空行、注释规范、圈复杂度、文件长度 —— **一律不管**（文件长度是 `arch-metrics.mjs` 的事）。

### 8.5 运行时语义

未 `await` 的 Promise、竞态、缺 `try/catch`、边界条件、闭包捕获错误、内存泄漏、并发问题。

更本质地说：**`no-undef` 只能证明「这个名字有绑定」，不能证明「绑定的是对的东西」**。一个拼写完全正确、绑定完全正确、但逻辑用错了变量，本门禁 100% 沉默。

### 8.6 解析层面的盲区

- **非相对模块不解析**：npm 包名、`/@ 别名`、Vite alias、`virtual:` 模块一律跳过（没实现模块解析器）；
- **动态说明符**：`import(someVar)`、`require(expr)` 静态不可判定，跳过；
- 只处理 JS/Vue，不处理 `.ts` / `.tsx` / `.jsx`。

### 8.7 扫描面之外

`tests/`、`scripts/`、`trustjudge-server/`、根目录 `.js`、`client/dist`、`docs/` **都不在扫描面**。测试代码里的错误不会被拦（实测 `scripts/gates/` 下就有 1 条真违规，见 §7 —— 它不在扫描面内，所以不影响基线）。

### 8.8 输出粒度

只报 **位置 + 规则 + 符号 + 一句话**，不报根因、不报修复建议、不给自动修复。

---

## 9. 接入每一步 DoD 的建议

### 9.1 最小接入（推荐立刻采用）

在每个 step 的 DoD 清单末尾加一行：

```markdown
- [ ] `node scripts/gates/lint-check.mjs` 退出码为 0（无基线之外的新违规）
```

理由：这条命令 0.55 s、零依赖、离线可跑，加进 DoD 的边际成本接近于零，而它拦住的正是**本轮已经付出过代价**的那四类缺陷。

### 9.2 与既有门禁并列

本门禁是 `scripts/gates/` 下的第 6 个（`arch-metrics` / `cycle-check` / `hard-metrics` / `bind-check` / `pixel-diff` / `lint-check`）。建议的完整序列（每条各自 exit 0 才算过）：

```bash
node scripts/gates/arch-metrics.mjs
node scripts/gates/cycle-check.mjs
node scripts/gates/hard-metrics.mjs
node scripts/gates/bind-check.mjs
node scripts/gates/pixel-diff.mjs      # 需要视觉基线时
node scripts/gates/lint-check.mjs
```

它们的分工是互补而非重叠：

| 门禁 | 拦什么 | 与 lint-check 的关系 |
| --- | --- | --- |
| `arch-metrics` | GodFile / 分层违规 | 文件级 |
| `cycle-check` | 循环依赖 | 模块图级 |
| `hard-metrics` | `!important` / hex 硬编码 | 样式级 |
| `bind-check` | **导入的名字对方没导出** | 跨模块绑定级（lint-check 的 8.3 空白由它补） |
| `pixel-diff` | 视觉回归 | 像素级 |
| **`lint-check`** | **自由标识符 / 死代码 / 未解析 import / 重复键 / 重复声明 / const 赋值** | **文件内作用域级 ← 此前完全空白的层级** |

### 9.3 两条纪律（否则门禁会退化）

1. **`--update-baseline` 不是「消红按钮」。** 它把当前违规吸收进基线，会让门禁**永久失去**对这 31 条的拦截力。只在「本轮确实没有产品代码改动」或「改动已评审、新违规已被确认可接受」时运行；运行后必须把新增吃进去的条目写进 step 报告。
2. **基线只减不增。** 默认模式会打印「已消除 N 条」——每修掉一条死代码，这个数字就涨一点。建议把它当作一个**单调向好的进度指标**记录进 step 报告；当它归零时，可以考虑把基线收紧成「零容忍」（即 `BASELINE` 为空）。

### 9.4 建议的后续独立步骤

本轮**不改任何产品代码**。清理那 31 条死代码应当是**后续的独立步骤**（例如 `step7-deadcode-cleanup`），理由：

- 死代码清理是**行为不变**的改动，风险低、可逐个文件验证；
- 但它会让基线变小，需要一个干净的、可单独回滚的提交边界；
- 每个文件清完后立刻跑 `lint-check` + `bind-check` + 相关门禁，确保「已消除」在涨而「新增」恒为 0。

---

## 10. 如何过渡到真正的 ESLint

本轮因为**本机无 ESLint 且禁网**而选择离线 AST 方案。将来若能联网安装，迁移路径如下。

### 10.1 接入点（代码里唯一需要改的地方）

`scripts/gates/lint-check.mjs` 的结构被刻意切成三段，只有第一段与 ESLint 相关：

| 层 | 函数 | 迁移时 |
| --- | --- | --- |
| **引擎** | `analyzeBlock()` / `scanFile()` | **唯一需要替换的部分** |
| 采集 | `collectFiles()` / `scanTree()` | 若换 ESLint 的 `--ext` / flat config，可保留或薄封装 |
| 判定 + 报告 | `diffBaseline()` / `formatReport()` / `buildBaselineJson()` | **原样保留** —— 它们只消费 `{file, line, rule, symbol, message}` 这个形状 |

具体做法：加一个 `--engine=eslint` 分支，跑 `npx eslint --format json`，把 ESLint 的 message 数组映射成同一个 `{file, line, rule, symbol}` 形状，**后面的基线与报告逻辑一行不改**。这样两种引擎可以并行跑、输出可逐条比对。

### 10.2 规则映射表

| 本门禁规则 | ESLint 对应 | 备注 |
| --- | --- | --- |
| `no-undef` | 核心 `no-undef` | 需自带 `globals`（`globals` 包 `browser` / `node` 两套） |
| `no-unused-vars` | 核心 `no-unused-vars` | 需配 `argsIgnorePattern: '^_'` / `varsIgnorePattern: '^_'`；模板使用需 `eslint-plugin-vue` 的 `vue/script-setup-uses-vars` |
| `no-unresolved-import` | `eslint-plugin-import-x/no-unresolved` | 需配 resolver 与 Vite alias |
| `no-dupe-keys` | 核心 `no-dupe-keys` | 语义几乎一致 |
| `no-redeclare` | 核心 `no-redeclare` | |
| `no-const-assign` | 核心 `no-const-assign` + `no-import-assign` | 本门禁把两者合并了 |
| `parse-error` | ESLint 自身的解析失败（会直接报 fatal） | |
| **模板（本门禁的空白）** | **`eslint-plugin-vue`** 的 `vue/no-undef-components` / `vue/no-undef-properties` / `vue/valid-v-*` 等 | **这是迁移最大的收益点** |

### 10.3 迁移步骤（建议）

1. 安装 `eslint` + `eslint-plugin-vue` + `eslint-plugin-import-x` + `globals`，写 flat config，只开上表这 7 条规则（**不要一次开 `eslint:recommended`**，否则会涌入几百条风格类违规，把基线冲垮）；
2. **影子运行一个 step**：`lint-check` 与 ESLint 并行跑，逐条比对差集。差集应该是三类：ESLint 多出来的（多为模板规则）、本门禁多出来的（多为豁免口径差异）、两边都有的；
3. 差集确认无回归后，把 DoD 命令切到 ESLint；
4. 若 ESLint 9.24+，可用 **bulk suppressions**（`eslint --suppress-all` 生成 `eslint-suppressions.json`）**替代自建基线**，语义与 `--update-baseline` 同构（存量豁免、新增阻断），迁移时基线可以直接换算过去；
5. 保留 `lint-check.mjs` 作为**兜底**：零依赖、0.55 s、离线可跑，在断网/依赖损坏时仍能给出判决。

### 10.4 为什么不直接等 ESLint

- 本机无 ESLint 且禁网，等不起；
- 本门禁的**判定模式**（基线比对 + file/rule/symbol 计数 + 行号漂移免疫）与 ESLint 的 suppressions 是同一套思想，迁移时**判定层可以整体保留**；
- 真正难写的是「作用域绑定 + 全局白名单 + 模板宽免」这些**口径决策**（§2.2.2 / §5），这部分知识无论用哪个引擎都得重新校准一遍 —— 现在做完，迁移时照抄口径即可。

---

## 11. 维护与不变量

改动本门禁时，以下不变量必须保持：

1. **`--self-test` 必须 8/8 全绿、干净树 0 误报** —— 任何规则或豁免的改动都要重跑；
2. **不装依赖、不联网** —— 依赖只能来自 `client/node_modules` / `server/node_modules` / 根 `node_modules`；
3. **不改产品代码** —— 本门禁只读 `client/src` 与 `server/src`，任何规则调整都只能改门禁自己，不能为了让门禁变绿去改产品代码；
4. **退出码语义固定**：`0` 通过 / `1` 有新违规 / `2` 执行错误或基线缺失；
5. **基线只减不增** —— 修掉违规就让它从基线消失，不要为了消红刷基线；
6. 新增豁免必须**同时**在 §2.2.1 / §5 与 `--self-test` 的干净样本里留痕（有豁免就有对应的假阳性回归样本）。
