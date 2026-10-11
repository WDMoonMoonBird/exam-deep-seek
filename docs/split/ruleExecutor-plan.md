# ruleExecutor 拆分方案（接缝与护航分析）

- **step**: 1 ｜ **phase**: A（接缝与护航分析）｜ **日期**: 2026-10-11
- **目标文件**: `server/src/services/ruleExecutor.js`（**1010 行**；`wc -l` 与 `read` 口径一致，arch-metrics 的换行符口径亦为 1010）
- **方案来源**: `docs/plan/2026-10-11-godfile-split-plan.md` §3 / §4-S1 / §5 / §8 / §8.1 ｜ 状态机 `docs/split/status.md`
- **版本锚点（本方案全部实测数据的取值时刻）**:
  - HEAD = `c7dbd75`（"split(step0): GodFile 拆分方案 + 执行状态机 + 自动驱动"）
  - 目标文件 sha256 = `449d6db663bc22a1cc435d0d33248bd9bbcdf205fb529aac0833cf1880965155`
  - `git status --porcelain` 对目标文件、其 3 个 src 导入方、`server/test/unit/infrastructure/` = **空**
  - `node server/scripts/check-layers.mjs` 实测：**文件 71 个 / 违规 0 条 / 未分层待迁移 47 个**
  - 我自建 import 图扫描器实测：`server/src` **71 文件 / 164 条相对 import 边**（与 round 3 记录的 164 独立吻合）

## 0 约束遵守声明

| 约束 | 遵守方式 |
|---|---|
| 纯只读 | 仅写入本文件 `docs/split/ruleExecutor-plan.md`；未创建/修改/删除任何其它文件 |
| 禁止 git 写操作 | 只执行 `git log / status / rev-parse`；无 clean / stash / checkout / reset / restore |
| 不跑 jest / build / 服务 | 未执行任何 jest、build、服务启动；未触碰 :5173 / :3000 / `client/dist` / `tests/` |
| 禁止联网 | 未调用任何网络工具 |
| 行号与计数自测 | 本文所有行号 / 行数 / 函数数 / 导入站点 / 测试例数均在本轮由我实测（方法与依据随表给出），未照抄任务书或历史报告 |
| 不改对外契约 | 全部搬移单元 = 源码切片位移 + import 重排 + 文件末尾 export 块；对外导出面**逐字保持今日的 10 个名字** |

---

## 1 段落接缝图谱（逐段实测）

实测方法：读全文 1010 行 → 定位 7 条 `// ==== ====` 段落横幅 → 定位 41 个顶层声明（**33 函数 + 8 常量**，与任务书一致）的起止（含紧邻 JSDoc）→ 逐函数人读判定 fs / npm / logger 依赖。

| # | 段落 | 起止行（实测） | 行数 | 本段导出的符号 | 依赖的本文件段落 | 依赖的外部包 / 其它文件 | 纯函数？ |
|---|---|---|---|---|---|---|---|
| **S0** | 文件头 · 导入面 · 再导出 | 1–33 | 33 | `resolveProjectRoot`（:27-29 纯再导出） | — | `node:fs` `node:path` `node:module` `tree-sitter` `tree-sitter-javascript` `./factExtractor.js` `./factExtractors/{common,java,python}.js` `../utils/logger.js` | 否（声明区） |
| **S1** | 常量 | 35–124 | 90 | `RULE_TYPES`(:41-54) `FACT_OPS`(:69) | — | 无 | 是（纯数据） |
| **S2** | 内部工具 | 126–275 | 150 | `extOf`(:144) `globToRegExp`(:157) `collectFiles`(:168) `resolveWithinRoot`(:199) `readFileUtf8`(:212) | S1（`SKIP_DIRS`） | `node:fs` `node:path` | **混合**（见下注） |
| **S3** | 规则执行器（6 个 file/text 类规则） | 277–431 | 155 | 无（6 个 `exec*` 全私有） | S2 | `node:fs` `node:path` | 否（每个都读盘） |
| **S4** | tree-sitter 语法检查 | 433–564 | 132 | 无（6 个全私有） | S1 `CHECKABLE_EXTS`；S2 | `node:fs` `node:path` `tree-sitter` `../utils/logger.js` | 否 |
| **S5** | fact 规则 | 566–634 | 69 | 无（`factValueText` / `execFact` 私有） | S1 `FACT_LABELS` `INVERSE_OPS` | 无（`facts` 由入参传入） | **是**（唯一的纯规则求值段） |
| **S6** | P0-2 语义级规则（+ 分派 + 汇总） | 636–831 | 196 | 无（7 个全私有） | S2（`extOf` / `readFileUtf8` / `resolveWithinRoot`）；S4（`getJSParser`） | `node:fs` `tree-sitter` `./factExtractors/{java,python}.js` | 混合（见下注） |
| **S7** | 导出函数（校验 + 执行） | 833–1010 | 178 | `validateRules`(:849) `runRules`(:950) | S1；S2 `clampScore` `errorSummary`；S3/S4/S5/S6 全部 `exec*` | `./factExtractor.js` `./factExtractors/common.js` `../utils/logger.js` | `validateRules` **纯**；`runRules` 否 |

注（S2 混合）：纯 = `clampScore` `globToRegExp` `countMatches` `extractVueScriptWithOffset` `lineNumberOf` `errorSummary`；用 `node:path` = `extOf` `resolveWithinRoot`；用 `node:fs` = `collectFiles` `readFileUtf8`。
注（S6 混合）：纯 = `countAstPatternMatches` `buildGroupSummary`；用 fs+npm = `parserForFile` `execAstPattern`；用 fs = `execCountImports` `execNormalizedText`。

段落行数合计 1003 + 7 个空行分隔（34 / 125 / 276 / 432 / 565 / 635 / 832）= **1010** ✔

**接缝判决**：7 条横幅把函数切得很干净，但有 **2 处「物理位置 ≠ 逻辑归属」**：
1. `executeItem`(:778-814) 与 `buildGroupSummary`(:821-831) 物理上在 S6 横幅之下，逻辑上属 S7 的分派 / 汇总；
2. `countAstPatternMatches`(:661-692) 是**纯**函数，却夹在 `parserForFile`(fs+npm) 与 `execAstPattern`(fs+npm) 之间。

→ 按横幅「整段」搬移会产出「一个文件同时含纯函数与 tree-sitter」的杂糅模块。§2.2 因此**按函数归属**而非按段划分（这是与 plan §S1「6 段 → 6 文件」唯一的实质偏离）。

### 1.1 段落之外的两处暗礁（实测）

1. **`nodeRequire` 是死变量**：`:33 const nodeRequire = createRequire(import.meta.url);` 全文件**仅出现 1 次**（仅声明行，零消费）。round 4 审计曾判 `:18 createRequire` 为「假阳性 —— 实为在用」，该结论**只对 import 语句成立**：`createRequire` 被调用，但其结果从未被使用。→ 搬移时**必须逐字保留**（顺手删属「同一提交里既搬移又改行为」，plan §6 明令禁止）。登记为后续独立项。
2. **`getVueParser()` 恒返回 null**（:450-452）→ `checkSyntaxOfFile` 的 :511-515 真值分支是**不可达代码**。它不是垃圾（:446-449 记录了 tree-sitter-vue ABI 冲突史与回退理由），逐字保留。

---

## 2 目标模块划分（源文件 → 目标文件 → 搬移内容）

### 2.1 落层设计（本方案相对 plan §S1 的核心修正）

**核心矛盾（任务书第三步，此处给出实测依据）**：plan §S1 拟把 `{constants,internals,executor,syntax,facts,semantic}.js` **整文件塞进 `domain/services/rule/`**。该方案**必然产生分层违规**：

- domain 禁令（`check-layers.mjs:63-65`）：**任何非相对 import 即违规**；相对 import 的目标层必须是 `domain`。
- 本文件**顶层就有 10 条 import 规格符**（实测），其中 `node:fs` / `node:path` / `node:module` / `tree-sitter` / `tree-sitter-javascript` 5 条命中 `domain-imports-external`；`./factExtractor.js` / `./factExtractors/{common,java,python}.js` / `../utils/logger.js` 5 条命中 `domain-imports-outside`（目标层名为 `unlayered`，`!== 'domain'`）。
- 更关键：**33 个顶层函数里 18 个直接读盘或触达第三方**（`readFileSync` / `readdirSync` / `existsSync` / `statSync` / `tree-sitter` / `logger`）—— 逐函数数过。真正的「纯规则求值」只占全文件约 **1/3 行数**。若要把 `execContainsText` 这类「读文件 + 判包含」拆成「infra 读 → domain 判」，那是**改代码结构**（引入端口 / 参数注入），违反「同一提交里不改行为」→ **A 明确否决该做法**。

**本方案（推荐）**：按「该函数体是否已有 fs / npm 依赖」二分，**不做任何函数内部再分解**：

```
server/src/
├── domain/services/rule/          # 零外部 import（用 node 内置即违规）
│   ├── constants.js               # 纯数据
│   ├── evaluators.js              # 纯求值（数值 / 字符串 / 正则 / 事实 / 汇总）
│   └── validate.js                # 规则 JSON 校验
└── infrastructure/rule/           # 允许 node:* 与 npm
    ├── file-access.js             # 扩展名 / 遍历 / 防穿越 / 读文件
    ├── executors.js               # 6 个 file/text 类规则 + 2 个文本语义规则
    ├── syntax.js                  # tree-sitter 语法检查族 + 语义级 AST 规则 + nodeRequire
    ├── executor.js                # executeItem 分派 + runRules 编排
    └── index.js                   # ★ 对外导出面（唯一入口）
```

**为什么 `runRules` 必须落 infrastructure**（三条硬规则，前两条否决、第三条放行）：
- 落 **domain** → 它依赖 `resolveProjectRoot` / `extractFacts` / `logger`（三者均为 unlayered）→ `domain-imports-outside`。
- 落 **application** → application 禁止相对 import 指向 `infrastructure`（`:69-70`）；`runRules` 必须 import `infrastructure/rule/*` → `application-imports-infra`。
- 落 **infrastructure** → infra 只禁止反向依赖 application / interface（`:75-77`），依赖 domain 与 unlayered 均合法 → **唯一合规落点**。

### 2.2 对照表（源行号 = §1 实测；预估行数 = 搬移行数 + 新增头 / import / export 块；全部 <800）

| # | 目标文件（层） | 搬移内容（**源文件行号，逐字**） | 搬移行数 | 预估总行数 |
|---|---|---|---|---|
| T1 | `domain/services/rule/constants.js`（**domain**） | 37-54, 56-59, 61-66, 68-69, 71-118, 120-121, 123-124 | 82 | **≈92** |
| T2 | `domain/services/rule/evaluators.js`（**domain**） | 128-137, 151-161, 221-235, 237-248, 250-263, 265-275, 568-577, 579-634, 816-831 | 155 | **≈172** |
| T3 | `domain/services/rule/validate.js`（**domain**） | 835-928 | 94 | **≈101** |
| T4 | `infrastructure/rule/file-access.js`（infra） | 139-149, 163-190, 192-205, 207-219 | 66 | **≈75** |
| T5 | `infrastructure/rule/executors.js`（infra） | 279-299, 301-327, 329-347, 349-376, 378-401, 403-431, 726-759, 761-776 | 198 | **≈220** |
| T6 | `infrastructure/rule/syntax.js`（infra） | 31-33, 435-443, 445-452, 454-474, 476-490, 492-529, 531-564, 638-659, 661-692, 694-724 | 213 | **≈240** |
| T7 | `infrastructure/rule/executor.js`（infra） | 778-814, 930-1010 | 118 | **≈135** |
| T8 | `infrastructure/rule/index.js`（infra，**新建**） | 1-14（文件头 JSDoc 逐字）+ 27-29（再导出语义） | 17 | **≈35** |
| — | 源文件 `server/src/services/ruleExecutor.js` | **整体删除** | −1010 | 0 |
|  |  | 15-26 的 10 条 import 规格符**重排**到 T2–T8（清单见 §2.4）；7 条段落横幅与 55 个空行**不搬**（各目标文件自带 banner） |  |  |

**预估总行数 ≈ 1070**（8 个文件，最大 T6 ≈240 行 ≪ 800）→ GodFile 计数 **10 → 9**；未分层 **47 → 46**（源文件本身 unlayered，删除即净 −1；8 个新文件全部落层）。

### 2.3 index.js 汇总导出（对外导出面 = 今日实测的 **10 个名字**，一个不多一个不少）

今日实测导出面（`export function|const` 9 个 + :27-29 再导出 1 个；与 round 3 记录的 10 名清单独立吻合）：
`RULE_TYPES` `FACT_OPS` `extOf` `globToRegExp` `collectFiles` `resolveWithinRoot` `readFileUtf8` `validateRules` `runRules` `resolveProjectRoot`

```js
// server/src/infrastructure/rule/index.js（新建；相对路径写全 .js）
export { RULE_TYPES, FACT_OPS } from '../../domain/services/rule/constants.js';
export { globToRegExp } from '../../domain/services/rule/evaluators.js';
export { validateRules } from '../../domain/services/rule/validate.js';
export { extOf, collectFiles, resolveWithinRoot, readFileUtf8 } from './file-access.js';
export { runRules } from './executor.js';
export { resolveProjectRoot } from '../../services/factExtractors/common.js';   // 保持 :27-29 的再导出语义
```

- **不导出**任何内部名（`CHECKABLE_EXTS` / `SKIP_DIRS` / `clampScore` / `exec*` …）→ 保持「导出面逐字不变」纪律（round 2 先例）。
- **不要**用 `export * from`（bind-check 的已知盲区，`scripts/gates/bind-check.mjs:22`）。
- `infrastructure/rule/` 与 `domain/services/rule/` 均为**新建目录**（`git ls-files` 实测不存在）。命名对齐既有层文件（kebab-case）。

### 2.4 import 重排清单（唯一允许「不逐字」的 12 行 → 32 行）

| 目标文件 | 新 import 行 |
|---|---|
| T1 | **（无）** |
| T2 | `import { ERROR_SUMMARY_LEN, FACT_LABELS, INVERSE_OPS } from './constants.js';` |
| T3 | `import { FACT_OPS, RULE_TYPES } from './constants.js';` |
| T4 | `import fs from 'node:fs';` / `import path from 'node:path';` / `import { SKIP_DIRS } from '../../domain/services/rule/constants.js';` |
| T5 | `import path from 'node:path';` / `import { globToRegExp } from '../../domain/services/rule/evaluators.js';` / `import { collectFiles, readFileUtf8, resolveWithinRoot } from './file-access.js';` |
| T6 | `import fs` / `import path` / `import { createRequire } from 'node:module';` / `import Parser from 'tree-sitter';` / `import JS from 'tree-sitter-javascript';` / `import { getJavaParser } from '../../services/factExtractors/java.js';` / `import { getPythonParser } from '../../services/factExtractors/python.js';` / `import logger from '../../utils/logger.js';` / `import { CHECKABLE_EXTS } from '../../domain/services/rule/constants.js';` / `import { errorSummary, extractVueScriptWithOffset, lineNumberOf } from '../../domain/services/rule/evaluators.js';` / `import { extOf, readFileUtf8 } from './file-access.js';` |
| T7 | `import { extractFacts } from '../../services/factExtractor.js';` / `import { resolveProjectRoot } from '../../services/factExtractors/common.js';` / `import logger from '../../utils/logger.js';` / `import { buildGroupSummary, clampScore, execFact } from '../../domain/services/rule/evaluators.js';` / `import { validateRules } from '../../domain/services/rule/validate.js';` / `import { execAstPattern, execSyntaxCheck } from './syntax.js';` / `import { execContainsRegex, execContainsText, execCountImports, execCountRegex, execDirContainsFile, execFileCountInDir, execFileExists, execNormalizedText } from './executors.js';` |
| T8 | 见 §2.3（6 条 re-export） |

**边保持性**：今日的 5 条相对出边（→ `factExtractor.js`、→ `factExtractors/common.js`、→ `factExtractors/java.js`、→ `factExtractors/python.js`、→ `utils/logger.js`）**全部保留**，只换宿主文件。不新增第三方适配器边、不新增反向边。

---

## 3 层禁令合规预判（逐条对照 `server/scripts/check-layers.mjs`）

预判方法（**诚实声明**：A 为只读角色，我没有写任何临时文件去真跑门禁）：在内存中**从真实门禁脚本里正则提取** `EXTERNAL_BLACKLIST`（实测 23 项）与 `NODE_IO` 正则，再**逐字复刻** :55-83 的分支判定，喂入 §2.4 的 11 个文件 × 全部 import 规格符 → **违规 0 条**。真跑仍必须由 C 执行（V6 / V7）。

| 规则（门禁原文） | 判定式（实测行号） | 预判 | 依据 |
|---|---|---|---|
| `domain-imports-external` | :63-64（domain 的任何非相对 import） | **0** | T1 / T2 / T3 **零外部 import**；T2 / T3 只 import `./constants.js` |
| `domain-imports-outside` | :65（相对目标层 `!== 'domain'`，**含 unlayered**） | **0** | T2→T1、T3→T1 目标均在 `domain/services/rule/`；无 domain 文件指向 `services/` / `utils/` / `infrastructure/` |
| `application-imports-external` / `application-imports-infra` | :67-71 | **0（不适用）** | 本步**不新增任何 application 文件** |
| `infrastructure-imports-upper` | :72-77（非组合根禁止指向 application / interface） | **0** | T4–T8 的相对目标只有：`domain/**`（合法向下）、`infrastructure/rule/*`（同层）、`services/factExtractor*.js` 与 `utils/logger.js`（**unlayered**，既非 application 也非 interface → 不命中） |
| `interface-imports-infra` | :78-81 | **0（不适用）** | 不新增 interface 文件；3 个导入方（`checkerService` / `ruleMutator` / `projectGrading`）**均为 unlayered** → 门禁对 unlayered 文件**不施加任何规则**（实测 :46-56 只在 layer ∈ 四层时判） |
| 未分层待迁移 | :86 `layerOf() === 'unlayered'` | **47 → 46** | 删 `services/ruleExecutor.js`（−1）；8 个新文件首段均为 `domain` / `infrastructure` |
| 门禁退出码 | :140（违规 >0 即 exit 1） | **0 → exit 0** | 上述合计 |

**三条反向陷阱（给 C 反证用）**：① T4 若放错到 `domain/` → 立刻 ≥2 条 `domain-imports-external`；② domain 文件若 import 回 `services/` → `domain-imports-outside`；③ `runRules` 若移到 `application/` → `application-imports-infra`。C 可用「故意错层」的 /tmp 副本验证门禁**真的有分辨力**（不进仓库）。

---

## 4 护航分析

### 4.1 测试覆盖矩阵（例数全部实测）

- `rule-executor.test.js`：`it(` **61** + `describe(` 10 ✔（与约束包 §4 的 61 一致）
- `fact-extractor.test.js`：`it(` **17** ✔
- `rule-mutator.test.js`：`it(` **10** + `it.each` **×11** = **21** ✔（`:112-124` 的 11 条 case，逐条数过）
- `experiment-variance.test.js`：`it(` **8**（属段 1）

| 源段落 | 主覆盖套件 | 关键用例（实测行号） | 直接断言 evidence？ |
|---|---|---|---|
| S0 | `rule-executor`(:11-16 导 4 名) · `rule-mutator`(:18 导 1 名) · `experiment-variance`(:42 **mock 路径**) · `fact-extractor`(:10, :444 断言 resolveProjectRoot 同语义) | :202-283 工程根探测 7 例 | 否 |
| S1 | `rule-executor` | :127 `RULE_TYPES` **逐项 toEqual**；`FACT_OPS` 经 :144-200 校验矩阵间接 | — |
| S2 | `rule-executor`（间接）+ `rule-mutator`（**直接**：`ruleMutator.js:39` 复用 5 个辅助函数） | 防穿越 :788 / :803 / :815；读失败 :430（`toContain('无法读取')`）；`clampScore` :323 | 部分 |
| S3 | `rule-executor` :382 / :397 / :417 / :436 / :453 / :470 / :488 + `rule-mutator` `it.each` 前 6 例 | 6 类规则成功 / 失败 / partial 全覆盖 | **是**（逐字断言） |
| S4 | `rule-executor` :509-622（6 例）+ `rule-mutator` `it.each` 第 7 例 | js / mjs / ts / vue 合法 + 错误、空目录 | 部分（`toContain`） |
| S5 | `rule-executor` :625-786（9 例）+ `rule-mutator` `it.each` 后 4 例 | 数字比较 / 失败反关系 / includes / not_includes / boolean / 字段不存在 / 混用 | **是** |
| S6 | `rule-executor` :897-996（4 例，**仅 Java**） | `ast_pattern` 只用 `UserController.java` | 部分 |
| S7 | `rule-executor` :68-200（16 例校验）+ :284-380（6 例约束）+ :828-895（4 例集成） | 抛错拒绝 / 确定性 / 钳制 / groupSummary | **是** |

**影响面（自建 import 图实测）**：`server/test` 中 **27 个测试文件**传递加载 `ruleExecutor.js`（3 直接 + 24 个 integration 经 `helpers.js → app.js → controllers → checkerService`）。段 1 内就有 `checker-service.test.js`（直接 import `checkerService.js` → 顶层 tree-sitter）→ **段 1 今天本来就在主进程加载 tree-sitter 原生模块**。这降低了「拆分后 tree-sitter 进主进程」的担忧，也说明 `experiment-variance` 的 mock 是**冗余保险**而非唯一屏障（见 H1）。

### 4.2 零覆盖清单（**最高风险区，搬移前必须先补对拍**）

口径：**分支级**。凡「从未被任何套件执行」或「执行到但无断言」逐条列出（用 §4.3 的 F06–F17 补齐）。

| # | 零覆盖单元（源行号） | 类型 | 证据（实测） |
|---|---|---|---|
| Z1 | `getVueParser` 真值分支 :511-515 | **不可达（死代码）** | `getVueParser` 恒 `return null`（:450-452），全文件仅 :510 一处调用，恒走 else |
| Z2 | `parserForFile` **python 分支** :657 | 零覆盖 | `ast_pattern` 唯一用例 :915 只用 `.java`；全仓无 `.py` + `ast_pattern`（fact-extractor 的 Python 例测的是**另一模块** `factExtractors/python.js`） |
| Z3 | `parserForFile` **vue 分支** :645-652 与 `execAstPattern` 的 `pff.source !== null` 分支 :710-711 | 零覆盖 | 无 `.vue` + `ast_pattern` 用例 |
| Z4 | `parserForFile` **null 分支** :658 → `'不支持解析该文件类型：'` | 零覆盖 | 无非源码扩展名 + `ast_pattern` 用例 |
| Z5 | `execAstPattern` 的 `catch` :721-723 | 零覆盖 | 需 `parser.parse` 抛错，无造错夹具 |
| Z6 | `runRules` **facts 提取失败路径** :970-977 | 零覆盖且**夹具不可达** | `extractFacts` 内部全 catch，公共 API 无法触发；全仓无 `'事实提取失败'` 断言 |
| Z7 | `errorSummary`（:270-275）**两处调用点** :506 / :972 | 零覆盖 | :506 需 `collectFiles` 给出的文件读取时消失 / 无权（TOCTOU 或 `chmod 000`）；:972 同 Z6 → **该函数整体无行为护航** |
| Z8 | `checkSyntaxOfFile` **读失败分支** :505-507 | 零覆盖 | 同上（非 root 下 `chmod 000` 可触发） |
| Z9 | `collectFiles` 的 `readdirSync` catch :172-176（`dir` 指向**普通文件**） | 零覆盖 | 现有用例 `dir` 均为目录或越界（:815 走的是 `resolveWithinRoot` 为 null 的另一条路） |
| Z10 | `collectSyntaxErrors` 的 `isMissing` 分支 :466-469 | 零覆盖 | 现有语法错误夹具（:598 `const a = ;`）产出 ERROR 节点，未覆盖 missing 节点 |
| Z11 | `extractVueScriptWithOffset` **无 script 分支** :245 → `'未找到 <script> 内容'` | 零覆盖 | 无「`.vue` 无 `<script>` + syntax_check」用例 |
| Z12 | `execFileExists` 的 `statSync` 抛错分支 :296-298（`'无法访问'`） | 零覆盖 | 需 existsSync 真、statSync 抛 |
| Z13 | `execFact` 数组型 value 执行路径 :603-605；`execCountRegex` 的 `partial && min<=0` :372 | 零覆盖（仅校验层有覆盖） | :181 只测校验；:470 只测 `partial + min>0` |
| Z14 | `lineNumberOf` 的行号映射结果 :521-523 | **执行到但零断言** | :590-608 只断言 `toContain('src/App.vue')`，不断言行号 |
| Z15 | `nodeRequire` :33 | 死变量（零消费） | 全文件出现 1 次 |

→ 这些行（约 :243-263、:270-275、:439-529 的多分支、:603-608、:638-659、:661-724 的多分支、:970-977）**没有任何行为断言兜底**，其搬移正确性**只能靠 §4.3 的 F 系列夹具 + §4.3④ 的切片判等**，不能靠「61 例全绿」自证。

### 4.3 C 的可执行行为对拍配方（改前 vs 改后，逐字节相等）

**装置纪律**：① 同源两次运行必须 byte-identical 才可用于判等；② 每个模块**各起一个 node 进程**（禁止同进程同时 import 改前 / 改后 —— tree-sitter ABI 污染是本仓真实事故，见 `docs/reports/batch-a-round-1.md` BUG-A-01）；③ 夹具目录**同一份**被两侧复用（否则 evidence 里的路径差异会造成假阳性）。

**① 冻结改前源（不污染工作树）**
```bash
cd "<repo>"
ANCHOR=c7dbd75          # ← 本方案实测 HEAD；C 执行时应重新 git rev-parse HEAD 并记录
rm -rf /tmp/splitA-before /tmp/splitA-fix && mkdir -p /tmp/splitA-before
git archive "$ANCHOR" server | tar -x -C /tmp/splitA-before
ln -s "<repo>/node_modules" /tmp/splitA-before/node_modules    # 让 tree-sitter 裸导入可解析
shasum -a 256 /tmp/splitA-before/server/src/services/ruleExecutor.js   # 前置断言 == 449d6db6…
```
> 冻结树里 `utils/logger.js` 的 `LOG_DIR` 解析为 `/tmp/splitA-before/server/logs`（**不会污染仓库` server/logs `**）。

**② 夹具集 F01–F20（C 自建，不复用 B 的脚本）**

| # | 夹具 | 打靶的段落 / 分支 |
|---|---|---|
| F01 | 空目录 / 不存在目录 | `resolveProjectRoot`、`runRules` 不抛错 |
| F02 | 标准 JS 工程（`package.json` + `src/router/index.js` + 顶层 `public/`） | S7 基线 |
| F03 | 嵌套单子目录工程（`root/demo/src/…`） | `resolveProjectRoot` 下钻 |
| F04 | **11 种 `rule_type` 全覆盖**的合法规则集（objective 11 项 + 2 主观项，总和 = max_score） | S3 / S4 / S5 / S6 全执行器 |
| F05 | 防穿越 3 例（`../secret` / `/etc/hosts` / `dir:'..'`） | `resolveWithinRoot` 越界分支 |
| F06 | `.vue` × {合法 script, `const a = ;`, **无 `<script>`**} | S4 + **Z11** |
| F07 | `.java` × {类, 类>方法, 不存在节点} | S6（`getJavaParser`） |
| F08 | **`.py` + `ast_pattern`** + `count_imports` | **Z2** |
| F09 | **`.vue` + `ast_pattern`** | **Z3** |
| F10 | **`.txt` + `ast_pattern`** | **Z4** |
| F11 | 5 个文本类规则的 `path` 指向**一个目录** | `readFileUtf8` 的 EISDIR 分支（`'无法读取'`） |
| F12 | `dir` 指向**普通文件**（`dir_contains_file` / `file_count_in_dir` / `syntax_check`） | **Z9** |
| F13 | `count_regex` / `file_count_in_dir`：`partial:true` 且 `min:0`；`min:3` 且实际 1 | **Z13** 边界 |
| F14 | `fact`：`includes` **数组 value** / `not_includes` / 数值比较失败（`INVERSE_OPS` 文案）/ 字段不存在 / 字段非数字 | **Z13** + S5 全分支 |
| F15 | `validateRules` 16 组入参矩阵（合法 / 103 分 / 缺字段 / fact op-value 类型 / 空数组 / 非对象） | S7 校验全分支 |
| F16 | `chmod 000` 的 `.js` + `syntax_check`（**仅当 `process.getuid() !== 0`**，否则跳过并记录） | **Z8 / Z7** |
| F17 | 约 10 个畸形 JS 片段（`function f(` / `class A {` / `if (x` …）逐个单独成文件 | **Z10**（isMissing vs ERROR） |
| F18 | 5 个导出辅助函数**直接调用**：`extOf`（无扩展名 / 隐藏文件 / `.VUE` 大小写）· `globToRegExp`（`* ? . + ^ $ [ ] { }` 转义）· `collectFiles`（`node_modules` / `.git` / 隐藏项 / 空目录）· `resolveWithinRoot`（根自身 / 相对 / 绝对 / 空串 / 非字符串）· `readFileUtf8`（正常 / EISDIR / 不存在） | S2 的 5 个导出面 |
| F19 | `Object.keys(mod).sort()` 导出面对拍 | §2.3 的 10 个名字 |
| F20 | 同一夹具连续执行 2 次（确定性） | `runRules` 幂等 |

**③ 执行与判等（两个进程，只比 JSON 字节）**
```bash
PORT=0 node /tmp/splitA-fix/run.mjs /tmp/splitA-before/server/src/services/ruleExecutor.js > /tmp/splitA-fix/before.json
PORT=0 node /tmp/splitA-fix/run.mjs "<repo>/server/src/infrastructure/rule/index.js"    > /tmp/splitA-fix/after.json
cmp /tmp/splitA-fix/before.json /tmp/splitA-fix/after.json && echo BYTE-IDENTICAL
shasum -a 256 /tmp/splitA-fix/before.json /tmp/splitA-fix/after.json
```
- `run.mjs` 约定：`await import(pathToFileURL(argv[2]))` → 依次执行 F01–F20 → `process.stdout.write(JSON.stringify(结果))`（键序即插序，天然确定；**禁止**把时间戳 / 随机数 / 绝对路径写进输出）。
- **装置自检（先做，否则不许判负）**：`before.json` 跑两次必须 `cmp` 相等；且用 F06 / F07 的 evidence 非空反证 tree-sitter **真的在跑**（避免「静默回退」造成的假绿）。
- **反证（必须有分辨力）**：在 /tmp 复制改后树，注入 2 处变异（① `execFileExists` 的 `item.max_score` → `3`；② `describeSyntaxErrors` 的 `'；'` → `','`），确认 `cmp` **报差异**。做不到即恒等装置，判负。

**④ 逐字搬移的静态判等（覆盖 Z6 / Z7 这类夹具不可达的分支）**
```bash
node /tmp/splitA-fix/slice-equal.mjs   # C 自建：从改前 / 改后两侧按「JSDoc + 声明」切块，逐块 sha256 对拍
# 期望：33 个函数 + 8 个常量，每块 sha256 完全相同（= 0 处改写）
```
（可行性前提：§7 要求**不得在函数声明行加 `export`**，跨模块暴露一律用文件末尾 `export { … };` 块 → 切片可与源文件逐字节相等。）

### 4.4 测试总量口径的未解冲突（C 必须用实跑数字）

- constraints §4 写「全量 = **1011** 例 / 67 套件；段 1 = 912」，§3-17 又写「段 1 = **960**（round 6）= 全量 − 17 − 61 − 21」→ **两处自相矛盾**（1059 vs 1011）。
- 我的静态实测（**不作判据**）：`server/test/**/*.test.js` = **68 个**文件；`it(` 出现 **990** 次（含 7 个 `it.each` 块）。
- → 本步一律以 C 的实跑四段摘要为准；判据只有一条：**`failed = 0` 且日志里出现 4 处 `Test Suites:`**。套件 / 用例数变化如实记录（新增测试则数增，属预期）。

---

## 5 import 改写清单（全仓实测）

实测方式：全仓正则扫 `ruleExecutor`（排除 `node_modules`）→ 逐条人读 + 自建 import 图解析 → 得「3 个 src 直接导入方 + 4 个测试侧引用 + 1 个脚本 + 1 处门禁基线注释」。

| # | 文件:行（实测） | 今日写法 | 拆分后 | 必须改？ | 风险 |
|---|---|---|---|---|---|
| I1 | `server/src/services/checkerService.js:35` | `{ validateRules, runRules, resolveProjectRoot } from './ruleExecutor.js'` | `from '../infrastructure/rule/index.js'` | **是** | 低（名字不变） |
| I2 | `server/src/services/ruleMutator.js:39` | `{ collectFiles, extOf, globToRegExp, readFileUtf8, resolveWithinRoot, runRules, resolveProjectRoot }` | `from '../infrastructure/rule/index.js'` | **是** | 低（7 名全在 §2.3 面内） |
| I3 | `server/src/services/projectGrading.js:30` | `{ runRules } from './ruleExecutor.js'` | `from '../infrastructure/rule/index.js'` | **是** | 低 |
| I4 | `server/test/unit/infrastructure/rule-executor.test.js:11-16` | `{ validateRules, resolveProjectRoot, runRules, RULE_TYPES }` | `'../../../src/infrastructure/rule/index.js'` | **是** | 中 |
| I5 | `server/test/unit/infrastructure/rule-mutator.test.js:18` | `{ runRules } from '…/ruleExecutor.js'` | `'…/infrastructure/rule/index.js'` | **是** | 低 |
| I6 | `server/test/unit/infrastructure/experiment-variance.test.js:42` | `jest.unstable_mockModule('…/services/ruleExecutor.js', () => ({ runRules: jest.fn() }))` | 路径改 `'…/infrastructure/rule/index.js'`（**必须与 I3 同址**），工厂体不变 | **是（最高优先）** | **高** → H1 |
| I7 | `server/scripts/experiment-variance.mjs:196` | `await import('../src/services/ruleExecutor.js')` | `await import('../src/infrastructure/rule/index.js')` | **是** | 低 |
| I8 | `server/src/services/ruleMutator.js:49` 注释 | 「与 ruleExecutor.CHECKABLE_EXTS 一致」 | 纯注释，可保留 | 否 | 无 |
| I9 | `scripts/gates/cycle-check.mjs:17` | `BASELINE = { cycles: 1, members: ['…factExtractor.js','…ruleExecutor.js'] }` | **不改** | **否** | 无 —— 判定只用 `BASELINE.cycles`（实测 :143）；改门禁属越界。登记后续清理 |
| I10 | 文档引用（`docs/plan/2026-08-18-*.md`、`KNOWN_ISSUES.md`、`docs/pipeline/*`） | 提到 `ruleExecutor.js` | **不改**（历史归档） | 否 | 文档漂移登记，不阻塞 |

**影响面实测**：`server/src` 中传递依赖目标文件的共 **9 个**（3 直接 + `app.js` + 2 controllers + 2 routes + 1）；`server/test` 中传递加载它的 **27 个**（24 integration 经 `helpers.js`）。→ **I1–I7 是全部需要改写的站点，一个不多**。

---

## 6 风险分级

| # | 搬移单元 | 等级 | 理由（依赖复杂度 / 测试覆盖 / 是否在评分链路） |
|---|---|---|---|
| R1 | T1 `constants.js` | **低** | 0 import、纯数据、无分支；`RULE_TYPES` 被 :127 逐项断言 |
| R2 | T2 `evaluators.js` | **中** | 1 条同层 import；9 函数里 `errorSummary` **零覆盖且夹具不可达（Z7）**；`execFact` 的 evidence 被逐字断言 |
| R3 | T3 `validate.js` | **低** | 1 条同层 import；16 例覆盖全部校验分支；纯函数无 IO |
| R4 | T4 `file-access.js` | **中** | fs 语义敏感（防穿越 / 目录 vs 文件 / 权限）；4 函数**无直接单测**；`collectFiles` catch 零覆盖（Z9） |
| R5 | T5 `executors.js` | **中** | 8 函数分支族全有测试，但 evidence 文案被**逐字断言**（一个空格错位即红）；`statSync` 抛错与 `partial/min<=0` 零覆盖（Z12 / Z13） |
| R6 | T6 `syntax.js` | **高** | ① 唯一直接依赖 **tree-sitter 原生模块**（本仓发生过 ABI / 进程污染事故）；② **零覆盖分支最密集**（Z1–Z5 / Z8 / Z10 / Z11）；③ 跨模块依赖最多；④ 在评分链路上（`syntax_check` + `ast_pattern`） |
| R7 | T7 `executor.js` | **中** | 编排核心但分支覆盖最好（11 类规则全部经 `executeItem`）；仅 `facts=null`（Z6）零覆盖；正确性最依赖 T2 / T5 / T6 导出名齐全 |
| R8 | T8 `index.js` | **高（唯一硬失败点）** | 导出面少一名 → 4 个套件在 **import 阶段**整体爆炸（constraints §3-12）；且 I6 的 mock 路径必须与它**同址** |
| R9 | **删除 `services/ruleExecutor.js`** | **高** | 一步同时影响 3 个 src 导入方 + 4 个测试文件 + 1 个脚本 + 27 个传递加载套件；回滚粒度必须 = 单提交 |
| R10 | 未分层 47 → 46 | 低 | 由构造保证；`arch-metrics` 判据是「≤47」（实测 :63），**下降不会被判劣化** |

**顺序建议（给 B）**：T1→T2→T3→T4→T5→T6→T7→**先建 T8 并跑一次 bind-check**→再改 I1–I7→**最后**删源文件。每段完成后立即 `node --check` **并真 import 一次**（`node --check` 不校验跨模块绑定，constraints §3-12）。

**H1（把 R8 / R9 / I6 串起来的单点故障，必须单独护航）**：`experiment-variance.test.js:42` 是**路径键控的模块 mock**。若只改 I3 不改 I6 → 两种失败形态之一：**(a)** jest 在解析 mock 路径时抛 MODULE_NOT_FOUND（套件整体红，响亮）；**(b)** mock 静默失配 → 真实模块进入主进程（隐蔽）。倾向 (a)，但**我不跑 jest，无法判定**，故 V12 要求双向验证：先确认正常路径下该套件 8 例全绿，再把 I6 临时改回旧路径确认**能看到明确失败**（证明该 mock 真的在生效，不是摆设）。

---

## 7 给 Agent B 的逐字搬移指令

**总则（不可协商）**
1. **只改 8 个新建文件 + §5 的 I1–I7 共 7 个站点**。**不得**碰 `scripts/gates/*`、`server/test/` 的断言、`client/**`、`tests/`、`server/logs`。
2. **搬移 = 按 §2.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角括号、`：`、`——`、`…`）。
3. **不得在函数声明行加 `export`**（会破坏 §4.3④ 的切片判等）。跨模块暴露一律用**文件末尾单个 `export { … };` 块**：
   - T1：`export { SKIP_DIRS, CHECKABLE_EXTS, FACT_LABELS, INVERSE_OPS, ERROR_SUMMARY_LEN };`（`RULE_TYPES` / `FACT_OPS` 已带 `export`）
   - T2：`export { clampScore, countMatches, extractVueScriptWithOffset, lineNumberOf, errorSummary, factValueText, execFact, buildGroupSummary };`（`globToRegExp` 已带）
   - T3 / T4：**不需要**（`validateRules` 与 4 个辅助函数均已带 `export`）
   - T5：`export { execFileExists, execDirContainsFile, execContainsText, execCountRegex, execContainsRegex, execFileCountInDir, execCountImports, execNormalizedText };`
   - T6：`export { getJSParser, getVueParser, collectSyntaxErrors, describeSyntaxErrors, checkSyntaxOfFile, execSyntaxCheck, parserForFile, countAstPatternMatches, execAstPattern };`
   - T7：**不需要**（`executeItem` 仅被同文件 `runRules` 调用；`runRules` 已带 `export`）
4. 每个新文件顶部加 3–4 行 banner，**固定格式**（便于 C 机械核对）：
```
/**
 * <文件名> —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */
```
5. **不要写 smoke test 脚本、不要新增测试文件**（C 的职责）；不要动 `server/package.json` 的四段式 test 脚本（本步不新增套件）。
6. **保留死代码**：`nodeRequire`（→T6 顶部，连同 :31-32 注释）与 `getVueParser` 的 `return null` 逐字保留。
7. 全部完成后**再**删 `server/src/services/ruleExecutor.js`；**不要**用任何回滚类 git 命令。

**逐文件执行单**

| 步骤 | 动作 | 完成判据（自重） |
|---|---|---|
| B1 | 建 `domain/services/rule/`，写 T1（37-54, 56-59, 61-66, 68-69, 71-118, 120-121, 123-124）+ banner + export 块 | `node --check` 通过 |
| B2 | 写 T2（128-137, 151-161, 221-235, 237-248, 250-263, 265-275, 568-577, 579-634, 816-831）+ `./constants.js` import | 同上；9 块与源区间同 sha256 |
| B3 | 写 T3（835-928） | 同上 |
| B4 | 建 `infrastructure/rule/`，写 T4（139-149, 163-190, 192-205, 207-219）+ 3 条 import | 同上 |
| B5 | 写 T5（279-299, 301-327, 329-347, 349-376, 378-401, 403-431, 726-759, 761-776）+ 3 条 import + export 块 | 同上 |
| B6 | 写 T6（31-33, 435-443, 445-452, 454-474, 476-490, 492-529, 531-564, 638-659, 661-692, 694-724）+ 11 条 import + export 块 | 同上；`grep -c 'tree-sitter'` = 2 |
| B7 | 写 T7（778-814, 930-1010）+ 7 条 import | 同上 |
| B8 | 写 T8 `index.js`（§2.3 六行 re-export + 1-14 文件头逐字 + 27-29 再导出语义） | `PORT=0 node -e` 动态 import → **恰好 10 个名字** |
| B9 | 改 I1 / I2 / I3 | `PORT=0` 真 import 三者，无 `does not provide an export named` |
| B10 | 改 I4 / I5 / I6（**只改路径，断言行一字不动**） | `git diff --stat server/test` 只出现路径行 |
| B11 | 改 I7（`experiment-variance.mjs:196`） | 同上 |
| B12 | **删除**源文件；跑 `node scripts/gates/bind-check.mjs` | `grep -rn 'services/ruleExecutor.js' server/src server/test server/scripts` = **0**；bind-check 违规 0 |
| B13 | 写 `docs/split/ruleExecutor-refactor.md`（源区间 → 目标文件:行 + 每块 sha256） | 33 函数 + 8 常量全覆盖 |

**禁令（违反即回流）**：① 顺手修 `nodeRequire` / `getVueParser` / 旧常量之类「优化」；② 在同一提交里改任何 evidence 文案、`max_score` 逻辑、正则；③ 改 `server/test/` 的断言（只允许改路径）；④ 改门禁脚本以「适配」新路径；⑤ 用 `git checkout/restore` 回滚（用重编辑）。

---

## 8 给 Agent C 的验证清单

C 为只读 + 自建对拍（**不复用 B 的脚本**），临时产物放 `/tmp`；探针一律 `PORT=0`。

| # | 验证项 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| V1 | 版本锚点 | `git rev-parse HEAD`；`shasum -a 256` 冻结副本 | == `449d6db6…`（若源文件已删，用 `git show c7dbd75:server/src/services/ruleExecutor.js` 重建） |
| V2 | **逐字搬移（静态）** | §4.3④ `slice-equal.mjs`：33 函数 + 8 常量逐块 sha256 | **0 块不等**；不等即回流（唯一能覆盖 Z6 / Z7 不可达分支的判据） |
| V3 | **行为对拍（动态）** | §4.3③：F01–F20，两个独立 node 进程，`cmp` JSON | **byte-identical**；先自检「before 跑两次相等」+「F06 / F07 确实产出 tree-sitter 结果」 |
| V4 | 反证 / 变异 | §4.3③ 注入变异副本 | 必须**报差异**；不报差异 = 装置失效，判负 |
| V5 | 导出面 | `Object.keys(await import(new)).sort()` | `FACT_OPS, RULE_TYPES, collectFiles, extOf, globToRegExp, readFileUtf8, resolveProjectRoot, resolveWithinRoot, runRules, validateRules`（10 个，逐字相等） |
| V6 | 分层门禁 | `node server/scripts/check-layers.mjs` | 违规 **0**；未分层 **46**（≤47） |
| V7 | 架构门禁 | `node scripts/gates/arch-metrics.mjs` | PASS；`unmigrated ≤ 47`；GodFile **10 → 9**；观察带 **19 不变**（新文件最大 ≈240 行，未过 500 线）——如实记录 |
| V8 | 循环依赖 | `node scripts/gates/cycle-check.mjs` | **SCC = 0**（边数会变属预期；我的预判 ≈164 → 179，**不作判据**） |
| V9 | 绑定门禁 | `node scripts/gates/bind-check.mjs` | 违规 **0**（重点看 I4–I6 的路径改写） |
| V10 | 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0（只扫 `client/src`，本步应**逐字不变**） |
| V11 | 全量回归 | `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` | 日志 **4 处 `Test Suites:`**、**`failed = 0`**；套件 / 用例数如实记录（口径冲突见 §4.4，**不得引用旧基线**） |
| V12 | **mock 路径专项（H1）** | 确认 I6 与 I3 同址；确认 `experiment-variance` 8 例全绿；再把 I6 临时改回旧路径验证**能看到明确失败** | 两个方向都符合预期 |
| V13 | 零覆盖分支专项 | F06 / F08 / F09 / F10 / F12 / F13 / F16 / F17 的 evidence 逐条对照改前 | 逐字节相同（尤其 `'不支持解析该文件类型：'`、`'未找到 <script> 内容'`、`'无法读取'`、`'未找到…'` 文案） |
| V14 | 越界自查 | `git status --porcelain` + `find . -newermt '<B 开始时刻>' -not -path './node_modules/*'` | 只有计划内的 8 新 + 7 改（+ B 的报告）；`client/dist` / `tests/` / `server/logs` 的 mtime 无变化 |
| V15 | 回滚粒度 | `git show --stat HEAD`（若 B 已提交） | 单提交，消息含「拆分前 file:line 范围 + 落层目标 + 验证结果」 |

**判定纪律**：V2 / V3 / V4 是本步核心判据（其余是既定门禁）。任一不符 → 回流 B，**不得**改测试或改门禁迁就实现（constraints §3-16）。

---

## 9 局限声明

1. **未真跑任何门禁**：§3 的合规预判 = 「用真实门禁脚本的常量 + 逐字复刻的判定式，在内存中对合成文件清单求值」，**不等于** `node server/scripts/check-layers.mjs` 的实跑。真跑必须由 C 完成（V6 / V7）。
2. **未跑 jest / build / 服务**（A 角色禁令）：§4.4 的测试总量冲突**我无法仲裁**；§4.1 的覆盖判定是**静态 + 人读**（it 标题 + 断言字符串 + 分支可达性推演），**不是覆盖率工具读数**；零覆盖分支的可达性我逐条给了依据，但**未做运行时探针验证**。
3. **「夹具不可达」是论证而非证明**：Z6 / Z7 / Z8 的结论建立在「`extractFacts` 内部全 catch + `collectFiles` 只产出已存在文件」的人读推演上；若 C 构造出反例夹具，**以反例为准并回流本方案**。
4. **行数预估有 ±5% 误差**：§2.2 的预估 = 搬移行数 + 我对 header / import / export 块的估计。判据是 **<800**（远未逼近），不是精确值。
5. **边数预判不作判据**：cycle-check 的 `edges` 是**出现次数**口径（同一模块多次 import 重复计数，实测 `cycle-check.mjs:52-67`），≈179 仅供 C 参考。
6. **未审计 `factExtractor.js` / `factExtractors/*` 本身**：它们是本方案的**未分层依赖邻居**（T6 / T7 / T8 会依赖）。若后续步骤迁它们的层，本方案的相对路径需同步调整。这是**显式登记的既有技术债**，不是本步缺陷。
7. **相对 plan §S1 的两处偏离已明示**：① 落层从「6 文件全在 domain」改为「3 domain + 5 infra」；② 从「按 7 段搬」改为「按函数归属搬」。理由见 §1 / §2.1。**若 Captain 判定采用更保守形态（全部落 `infrastructure/rule/`、不建 domain 目录，6 文件）**，则只需把 T1–T3 的目标目录改为 `infrastructure/rule/`（T2 / T3 的 import 变 `./constants.js`），**其余全部不变**（导出面、对拍配方、门禁预判、未分层仍为 46）。
