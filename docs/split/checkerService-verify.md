# checkerService 拆分独立验证报告（GodFile 拆分专项 · step 3 · Agent C）

- **step**: 3 ｜ **phase**: C（独立验证 / 对抗性）｜ **日期**: 2026-10-11 ｜ **技能**: tech-test-automation
- **被验对象**: `server/src/services/checkerService.js`（1280 行）→ 10 个模块（2 domain + 8 infrastructure）
- **被验 commit**: `c26c8dce5dcdec20acd5c0ec6af5fe1359b7cb23`（`split(step-2): Submit.vue 抽 9 个 composable`，分支 `master`）
- **工作树状态（本轮入场实测，`git status --porcelain -uno`）**:
  ```
   M docs/split/status.md                                     <- 入场前即为 M（Captain 维护），非本轮产物
   M server/src/controllers/checkerController.js              <- I1（仅 import 路径 1 行）
   D server/src/services/checkerService.js                    <- 删源文件
   M server/test/unit/infrastructure/checker-service.test.js  <- I2（仅 import 路径 1 行）
  ```
  另加 10 个未跟踪新文件（`server/src/domain/services/checker/{parsers,meta}.js`、`server/src/infrastructure/ai/checker/{index,legacy-script,llm,package-inspect,prompts,review,state,generator}.js`）
- **立场所依**: 不采信 Agent B 的自测（`docs/split/checkerService-refactor.md` 的 49/49、104 例、门禁读数**全部由我重做**）；装置、夹具、脚本**全部自建**（`/tmp/splitC-probe/*`），未复用 `/tmp/splitB*` 任何文件
- **一句话结论**: **PASS** —— 49/49 块逐字节相等且反向「未归属字节 = 0」；导出面 10 名逐字等价且**门面到子模块取值可达、身份一致**；五门禁全 PASS（违规 0 / 未分层 46→45 / GodFile 8→7 / SCC 0 / bind 0）；全量回归 4 处摘要 + **0 failed**（65+1+1+1 套件、974+17+61+21 = **1073 例**）；**209 例三桩三维 A/B 对拍 byte-identical**（返值 + 终态 DB + 有序调用日志 + fetch 记录），且 5 处定向变异**全部被抓**、1 处死代码对照**不误报**；`RULE_TYPES` 缺陷取证**成立**（8 vs 11 + `ast_pattern` 静默丢弃 + 分值补末项 → 70 归一化为 **100**）。

---

## 0 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V1 | 冻结源整体 sha256 | `37d2358c…09b0` | `37d2358c32ab253054b6d152d1f9246a31419cc7a711352fb3d1cb17993409b0` | ✅ |
| V1 | 逐块 sha256 切片判等（自建切分器） | 48 声明块 + 1 文件头块 = 49 块，**0 块不等** | **49/49 命中且每块命中数恰为 1**，`not-exactly-once = 0` | ✅ |
| V1 | 反向逐字节校验（贪心消费 10 文件） | 未归属字节 = 0、未消费块 = 0 | residue 非空 86 行**全部**属 banner/import/export/空行 → `total disallowed = 0`；`blocks never consumed = 0` | ✅ |
| V2 | 导出面（真 import） | 恰好 10 名，与改前逐字相同 | BEFORE 10 / AFTER 10；**keys 排序串相同**；`perName` 元数据（type/fnName/arity/首行签名）**逐字相同** | ✅ |
| V3 | ★门面可达性（B 自陈「静默丢面」坑的最终态复核） | 10 名在门面与子模块之间**可达且取到真值** | 10/10 `typeof === 'function'`、非 undefined/null、`fn.name === 导出名`、**`facade[name] === submodule[name]`（身份相等，mismatch = 0）**；每个名字恰有 1 个归属子模块 | ✅ |
| V4 | 绑定自查 | 0 违规；`getModel` 照带 | 跨文件引用闭包扫描 **0 违规**（69 名前向引用集）；真 import 全部成功；`getModel` 在 `llm.js` 出现 **1** 次（仅 import 子句）；`export *` **0** 处 | ✅ |
| V5 | check-layers | 违规 0 / 未分层 45 | **87 文件 / 违规 0 / 未分层 45**（冻结树独立复现改前 = 78 / 0 / **46**） | ✅ |
| V5 | arch-metrics | PASS / GodFile 7 | **PASS**；GodFile **7**（名单已无 checkerService.js）；观察带 17；unmigrated 46→45 | ✅ |
| V5 | cycle-check | SCC 0 | **87 文件 / 194 边 / SCC 0 / 自环 0**（冻结树改前 = 78 / **178** / 0） | ✅ |
| V5 | hard-metrics | 0/0/0 | **0/0/0 PASS** | ✅ |
| V5 | bind-check | 违规 0 | **185 模块 / 592 绑定 / 违规 0**（unresolved 4、external 1，均仅登记） | ✅ |
| V6 | 全量回归 | 4 处 `Test Suites:` + failed = 0 | **4 处**（行 1326/1366/1455/1503）；`65+1+1+1` 套件全 passed；`974+17+61+21 = 1073` 例全 passed；**0 failed**（`✕` 计数 = 0）；退出码 0 | ✅ |
| V7 | 装置自检（确定性） | 同一侧连跑两次相等 | **最终 209 例装置**：`beforeF.ndjson` vs `beforeF2.ndjson` **byte-identical**（早期 206 例版亦相同） | ✅ |
| V7 | ★三维 A/B 对拍 | byte-identical | **209/209 例 byte-identical**（返值 + 终态 DB + 有序调用日志 + fetch 请求体 + fetchLeft） | ✅ |
| V7 | 靶心自检（防假绿） | 命中专属文案 | g13 → `LLM 调用失败：ECONNREFUSED probe`（3 次重试后）；g04 → 轮 2/3 的 prompt 内**逐字含** `缺少 objective_items`；f08b → `检查脚本执行失败：…boom-checker`（真子进程）；g02 → 缺陷候选 note 逐字命中 | ✅ |
| V7 | 禁网 | 0 次真实外网 | `fetchStubIntact=true`；63 次 fetch **全部** `http://127.0.0.1:9`（offHostUrls = 0）；URL 仅 `/chat/completions` 与 `/v1/chat/completions`；Authorization = `Bearer sk-probe-key` | ✅ |
| V7 | ★被执行 / 未被执行函数两张清单 | 如实登记 | 10 文件内共 **87 个函数（含嵌套）**：**84 执行 / 3 未执行**；27 个顶层函数**全部执行** | ✅（见 §8.5） |
| V7 | ★变异反证 | 必须报差异 | **5/5 全部被抓**；另有 1 处死代码对照 **0 差异**（不误报） | ✅ |
| V8 | D1/D2/D3 复核 | 等价、无行为差异 | D1 最终态 `review.js → './generator.js'`、SCC 0；D2 最终态面完整（V3）；D3 banner 命中 10 处但 **import 规格符 0 命中** | ✅ |
| V9 | `RULE_TYPES` 运行时取证 | 成立 | `parsers.RULE_TYPES` = **8** vs `domain/services/rule/constants.js` = **11**（缺 `ast_pattern`/`count_imports`/`normalized_text`）；喂入 `ast_pattern(30)+file_exists(70)` → 返回**只 1 项且 max_score = 100** | ✅ |
| — | 越界自查 | 除报告/规定日志外零仓库写入 | 见 §12：新增 `docs/split/test-round-08.log`（V6 规定产物）与 `server/logs/app-2026-10-11.log`（jest 运行期日志）；`client/dist`、`tests/`、`scripts/gates`、`server/scripts` mtime **零变化** | ✅ |

**判定纪律**：V1 / V3 / V7（含变异反证）为本步核心判据，全部通过 → **PASS**。

---

## 1 被测树留痕与方法

### 1.1 两棵被测树（绝对路径 + 指纹）

| 侧 | 绝对路径 | 构造方式 | 指纹 |
|---|---|---|---|
| **BEFORE（改前）** | `/tmp/splitC-before/server` | `git archive c26c8dc server \| tar -x`（冻结，从不读活树） | `checkerService.js` sha256 = **37d2358c…09b0**（自证命中 A/B 锚点） |
| **AFTER（改后）** | `/tmp/splitC-after/server` | `cp -R <repo>/server/src`（活树副本） | 10 文件 sha256 **与活树逐一相同**（见 §1.3） |

**两棵树唯一的差异（`diff -rq` 实测，共 4 条）**：

```
Files .../controllers/checkerController.js differ          <- I1 import 路径
Only in /tmp/splitC-after/server/src/domain/services: checker
Only in /tmp/splitC-after/server/src/infrastructure/ai: checker
Only in /tmp/splitC-before/server/src/services: checkerService.js
```

⇒ **不存在被我无意引入的第三方差异**（除 prisma 桩，见下），A/B 比的是同一条业务路径。

### 1.2 三桩（两侧逐字相同）

| 桩 | 实现 | 位置 |
|---|---|---|
| **S-A 网络桩** | `globalThis.fetch = async (url, opts) => {…}`，**在 import 被测模块之前**安装；桩体不调用原始 fetch；响应从用例队列取，队列耗尽返回 599 | 探针 `/tmp/splitC-probe/run.mjs:13-37` |
| **S-B DB 桩** | 覆写 `server/src/utils/prisma.js`，实现 `question.findUnique/findFirst/update`（**忠实实现 Prisma 的 `select` 投影**）+ `systemConfig.findMany`，导出 `__probe`（seed/reset/log/snapshot/failNextUpdate）；两侧副本 sha256 = `c359087cfaefe493…` **相同** | `/tmp/splitC-probe/prisma-stub.js` → 两侧 `src/utils/prisma.js` |
| **S-C 时钟桩** | `Date.now() → 1760000000000`，`new Date()` 冻结；`setTimeout` 保留真实语义 | `run.mjs:41-48` |

另：两棵树的 `server/uploads` 均软链到**同一份夹具目录** `/tmp/splitC-fixtures/uploads`（保证 evidence 里的文件内容/指纹两侧一致）。

### 1.3 被验 10 文件指纹（我实测，与 B 报告逐字一致）

| # | 文件 | 行数 | sha256（全 64 位） | 活树 vs /tmp 副本 |
|---|---|---|---|---|
| T1 | `domain/services/checker/parsers.js` | 258 | `b2a1108ec8b1b7d6a530e04082c92138e6cae96d4d6c769df1b36f4b856f8a87` | SAME |
| T2 | `domain/services/checker/meta.js` | 71 | `d05bfd8730a1f6ce7e7d8431d41b756cf2eb5f1b77c90546e076c98d8dc07119` | SAME |
| T3 | `infrastructure/ai/checker/prompts.js` | 192 | `e03d429cc7ea49a519b7a1fd37f98f8f964ac375cce2d372a7197a831cd930b3` | SAME |
| T4 | `infrastructure/ai/checker/llm.js` | 84 | `e82ef0100bc324890682ced14884e1b8eba82fda8f6c158f82739d9e976fc227` | SAME |
| T5 | `infrastructure/ai/checker/legacy-script.js` | 56 | `95c5bfcba0e661f7fbb8a582ea650e50b4bc09659ec70c1652a45222833d343b` | SAME |
| T6 | `infrastructure/ai/checker/package-inspect.js` | 110 | `2a535c4f25ce150a08ac977fa120cc7b0b89a61f50155848344381ad8029737f` | SAME |
| T7 | `infrastructure/ai/checker/state.js` | 25 | `e7b8811af5767ff46078704b8edd683aad9254d803fd8f9f99440fc5e6fc1835` | SAME |
| T8 | `infrastructure/ai/checker/review.js` | 129 | `6389e8b3cc60673f13e93d7b597583edf933c63b3a1512e880cbe9dac422eea3` | SAME |
| T9 | `infrastructure/ai/checker/generator.js` | 386 | `421ffb3bebd634f726cf81f5f44db68f6e23fd2b44a31c32ba913f1cc0e33bb8` | SAME |
| T10 | `infrastructure/ai/checker/index.js` | 37 | `450b80eb32ac0eee49f40296b34475c8b96813e17d6c75096def4736b74014b3` | SAME |
| — | 合计 | **1348** | 最大单文件 386 行 ≪ 800 | — |

### 1.4 两处「探针专供」文件（只存在于 /tmp 副本，**不入仓、不含业务逻辑**）

1. `/tmp/splitC-before/server/src/services/checkerServiceProbe.mjs` = **冻结源逐字节 + 末尾追加 1 行 export 块**（`export { callLlm, packageFingerprint, collectProjectPaths, validateRulePaths, enrichDeductionSnippets, appendVersion, markDefectReportItems, buildReport, buildCalibrateUserPrompt };`）。前缀 sha256 实测 = `37d2358c…09b0`，**与冻结源完全相同**（`prefix identical = true`）。作用：让改前侧的私有函数可被**同一模块实例**直接调用（否则零覆盖区无法对拍）。
2. `/tmp/splitC-after/server/src/infrastructure/ai/checker/probe-api.mjs` = **纯再导出聚合器**（17 行 re-export，无任何逻辑），从 `index.js` 所用的**同一批子模块**取名字 ⇒ 调用的是与门面**同一函数对象**（V3 身份相等已证）。
3. 上述两文件**不在判等范围内**：V1 的判等基准是冻结源与**仓库内 10 个真实文件**；两棵树的 src 差异仅 4 条（§1.1）。

---

## 2 V1 逐块 sha256 切片判等（自建实现，不复用 B 的 esprima 方案）

**方法**：自写字符级扫描器（状态机处理 `//` `/* */` `'` `"` 模板串 + **正则字面量**（启发式：前一有效字符 ∈ `(,=:[!&|?{};+-*%^<>~` 或关键字），括号栈求顶层声明终点），**自动附加紧邻 JSDoc/注释行**；块 = `[注释起, 语句终]` 的精确字节。脚本：`/tmp/splitC-probe/slice-equal.mjs`（**不复用** `/tmp/splitB/verify.cjs`）。

```
scan errors = []
decl count = 48
=== FORWARD BLOCK CHECK ===
blocks = 49  not-exactly-once = 0
（逐块输出 49 行 OK，示例：）
OK   RULE_TYPES              60-70    258  e5e997fb197c5c11  domain/services/checker/parsers.js x1
OK   parseCheckerRules       275-382  5052 fc76459c83b10f99  domain/services/checker/parsers.js x1
OK   generateChecker         833-1159 19425 4f234ae16c313e26  infrastructure/ai/checker/generator.js x1
OK   confirmChecker          1163-1251 3549 d538c7222794acdd  infrastructure/ai/checker/review.js x1
OK   (file header JSDoc)     1-23     1568 95d9bbeb933b24ea  infrastructure/ai/checker/index.js x1
=== REVERSE GREEDY CONSUMPTION ===
domain/services/checker/parsers.js             residueNonEmpty=  5 disallowed=0
…（10 文件全部 disallowed=0）…
blocks never consumed = 0
total residue non-empty = 86  total disallowed = 0
```

- **我的切块口径比 B 更严**：我把**紧邻 JSDoc/注释一并纳入块**（B 部分块只含函数体，如其 `parseCheckerResult 238-271`），因此若干块的 sha 与 B 表不同（例如我的 `parseCheckerResult` = `c5f5df6dfde2b38b`、`generateChecker` = `4f234ae16c313e26`），但**同名块两侧均恰好命中 1 次**，结论同向且更强。
- **与 B 完全一致的块**（独立复现）：`RULE_TYPES` `e5e997fb…`、`RULES_FORMAT` `d789401b…`、`automationLabel` `04ff53c3…`、`GENERATE_SYSTEM` `d59600b3…`、`RULES_EXAMPLE` `046bdd57…`、`stripHtml` `ff7a1d43…`、`extractJsonText` `c499ac9d…`、`repairTruncatedJson` `c5e010a0…`、`parseLooseJson` `d225eccb…`、`sleep` `93e1b103…`、`buildCalibrateUserPrompt` `3b5a5375…`、`packageFingerprint` `c9fce925…`、`appendVersion` `30decb97…`、`markDefectReportItems` `d6993eba…`、`buildReport` `541b4032…`、`PATH_PARAM_BY_TYPE` `79e42b55…`、`collectProjectPaths` `9894f593…`、`validateRulePaths` `7c0064c5…`、`enrichDeductionSnippets` `5debd8b7…`、文件头 JSDoc `95d9bbeb…`。
- **反向校验**：把 10 个目标文件按「最长块优先」贪心消费，剩余非空行 86 行**全部**匹配 `banner / import / export / 空行` 白名单 → **未归属字节 = 0**，且**没有任何块未被消费**（既无缺失、也无多余）。

⇒ **V1 PASS：0 块不等 + 0 未归属字节**。这是覆盖 Z17（316 行单函数）等「夹具打不到」区域的**唯一强判据**。

---

## 3 V2 导出面（真 import 对拍，两个独立进程）

```
$ PORT=0 LOG_LEVEL=silent node face.mjs --module=/tmp/splitC-before/server/src/services/checkerService.js --mode=before
FACE before count=10 keysMatchExpected=true
$ PORT=0 LOG_LEVEL=silent node face.mjs --module=/tmp/splitC-after/server/src/infrastructure/ai/checker/index.js --mode=after
FACE after  count=10 keysMatchExpected=true allTenReachable=true mismatches=0
```

| 项 | BEFORE（冻结树） | AFTER（新门面） |
|---|---|---|
| `Object.keys(m).sort()` | 10 名（见下） | **逐字相同** |
| 名字串 | `attachNegativeFeedback, buildGenerateUserPrompt, confirmChecker, findMisplacedSubjective, generateChecker, getCheckerState, parseCheckerResult, parseCheckerRules, rollbackChecker, runCheckerScript` | **同上（无多、无少、无改名）** |
| `perName` 元数据（`type`/`nonNull`/`fnName`/`arity`/`srcHead` 首行签名） | 10 条 | **JSON 逐字相同（`perName map identical = true`）** |

`buildGenerateUserPrompt` 仍在面内且 `arity = 6`、首行签名 `function buildGenerateUserPrompt(rubric, maxScore, fixedItems, stdFileTree, description, l…` —— **未被降级为私有**（A §4.2-5 / plan §10.6 的硬要求）。`export *` 在 10 个新文件中出现 **0** 次；文件尾 `export { … };` 块 **5** 处（`parsers.js:258`、`meta.js:71`、`package-inspect.js:110`、`prompts.js:192`、`llm.js:84`）+ 门面 7 行再导出（`index.js:31-37`）。

---

## 4 ★V3 门面可达性复核（B 自陈「门面静默丢面」坑的最终态验证）

**要证的不是「index 的 keys 有 10 个」，而是「每个名字都能从门面真取到值、且取到的是正确实现」**。我对每个名字做四重断言（`face.mjs --mode=after`）：

1. `typeof facade[name] === 'function'`（非 undefined / 非 null）；
2. `facade[name].name === name`（函数自名与导出名一致，排除被同名桩/包装替换）；
3. **`facade[name] === submodule[name]`（身份相等）** —— 动态 import 每个归属子模块逐一比对；
4. 10 个名字**恰有 1 个归属子模块**，且没有名字找不到归属。

```
"owners": {
  "parseCheckerResult": ".../domain/services/checker/parsers.js",
  "parseCheckerRules":  ".../domain/services/checker/parsers.js",
  "findMisplacedSubjective": ".../domain/services/checker/parsers.js",
  "attachNegativeFeedback":  ".../domain/services/checker/meta.js",
  "runCheckerScript": "./legacy-script.js",
  "buildGenerateUserPrompt": "./prompts.js",
  "getCheckerState": "./state.js",
  "generateChecker": "./generator.js",
  "confirmChecker": "./review.js",
  "rollbackChecker": "./review.js"
},
"identityMismatch": [],
"allTenReachable": true
```

**结论（★V3）**：**最终态门面 10 名全部可达、取值非空、身份与子模块严格相等，0 处不一致**。B §5-D2 自陈的「B2 中间态门面丢掉 5 个名字」这一历史缺陷，在**最终态已不存在**；且我复核了它的**成因链是否被消除**：现门面是「按『源带 export 且已迁出』的**全量 10 名**再导出」（`index.js:31-37` 逐条列出，无 `export *`、无遗漏），与「剩余代码是否引用」无关 —— 例如 `parseCheckerResult` / `runCheckerScript` / `getCheckerState` / `confirmChecker` / `rollbackChecker` 这 5 个正是当初丢的名字，现已全部在位。
**未能独立复现的部分（如实登记）**：B2 的中间态树没有留档（无快照/tag），「当时 count=5」我只能采信其记录，**不可独立复现**；可复现的是最终态（= 本节）与成因链（= 门面构造方式）。

---

## 5 V4 绑定自查（跨文件引用闭包 + 真 import）

**参考集（69 名）** = 源文件 **48 个顶层声明名** + **21 个头 import 绑定名** + 各子模块导出名（含私有再导出）。

**方法**（`/tmp/splitC-probe/bindscan2.mjs`，自建 tokenizer）：对每个文件求「被使用的标识符」（排除注释/字符串/模板内文、`.prop` 属性名、对象字面量键），与参考集求交 → 交集中凡**既未本地声明**（`function/const/let/var/class` + 函数/箭头参数 + `catch` + 解构）**又未 import** 者 = 缺失绑定。

```
reference set size = 69
VIOLATIONS = []
  domain/services/checker/parsers.js             crossRefs=  8 imported= 0
  domain/services/checker/meta.js                crossRefs=  5 imported= 0
  infrastructure/ai/checker/prompts.js           crossRefs= 13 imported= 1
  infrastructure/ai/checker/llm.js               crossRefs=  8 imported= 4
  infrastructure/ai/checker/legacy-script.js     crossRefs= 10 imported= 6
  infrastructure/ai/checker/package-inspect.js   crossRefs=  8 imported= 3
  infrastructure/ai/checker/state.js             crossRefs=  3 imported= 2
  infrastructure/ai/checker/review.js            crossRefs=  7 imported= 5
  infrastructure/ai/checker/generator.js         crossRefs= 34 imported=27
  infrastructure/ai/checker/index.js             crossRefs= 10 imported=10
```

- **0 违规**：10 个文件里所有「源文件里存在、现在被搬走」的名字，**要么本地声明、要么已 import**。
- 每个相对 import 的目标模块**存在**且**真的导出该名字**（用动态 import + `in` 校验；唯一的 2 条「unresolved」是 node 内置 `child_process` / `util`，属我的正则把裸规格符当路径所致，非缺陷）。
- **`getModel` 专项（硬要求「照带」）**：`llm.js:7` = `import { getBaseUrl, getApiKey, getModel } from '../../../services/deepseek.js';`；`llm.js` 全文出现 **1** 次；10 个新文件合计 **1** 次 ⇒ 死绑定逐字照带、零消费状态未被「顺手清理」。
- 真 import 全部成功（`index.js` 传递加载全部 10 模块 + generator 的 27 条 import），**无 `does not provide an export named`** —— 这是 constraints §3-12 要求的「真 import 一次」，`node --check` 未被用作任何通过证据。

---

## 6 V5 五门禁（原始输出）

```
### 1) node server/scripts/check-layers.mjs
文件 87 个，违规 0 条（0 类规则），未分层待迁移 45 个            exit=0
### 2) node scripts/gates/arch-metrics.mjs
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=46  实测=45
  ✓ godfileOver800     基线=8  实测=7
  · >500 行（观察带，不计判据） 基线=18 实测=17
  GodFile >800 行：teacherController.js (1338) / Doc.vue (1106) / deepseek.js (1051) / ReviewDetail.vue (988) /
                   QuestionEdit.vue (983) / reviewController.js (965) / ProjectQuestionEdit.vue (868)
结论：PASS                                                       exit=0
### 3) node scripts/gates/cycle-check.mjs
  扫描 87 文件 / 194 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 0）   自环（文件 import 自身）: 0
结论：PASS                                                       exit=0
### 4) node scripts/gates/hard-metrics.mjs
  ✓ hex6 0/0   ✓ important 0/0   ✓ modalConfirm 0/0
结论：PASS                                                       exit=0
### 5) node scripts/gates/bind-check.mjs
modules scanned : 185        named import bindings checked: 592
unresolved relative imports : 4 (仅登记)   external (out-of-root) refs : 1 (仅登记)
BINDING VIOLATIONS : 0                                          exit=0
```

**我自己复现的「改前」基线**（在冻结树上跑**同一批门禁**，不在活树上跑；为排除我自己的探针 shim 干扰，临时移出后测）：
```
node /tmp/splitC-before/server/scripts/check-layers.mjs  → 文件 78 个，违规 0 条，未分层待迁移 46 个
node /tmp/splitC-before/scripts/gates/cycle-check.mjs    → 78 文件 / 178 边 / SCC 0 / 自环 0
```
⇒ 未分层 **46 → 45**、文件 **78 → 87**、相对导入边 **178 → 194**（A 预判 ≈194 **命中**，但按 A 自己的口径**不作判据**）、GodFile **8 → 7**、违规恒 **0**、SCC 恒 **0**。GodFile 名单里已无 `checkerService.js`。

---

## 7 V6 全量回归（`ROUND=08 LOG_DIR=docs/split`）

**命令**：`ROUND=08 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh`
**日志**：`docs/split/test-round-08.log`（1508 行，sha256 = `f26ed19a5c6346fb84d1f7879abd429f8a409fc6e984cc510360c003ce88c69e`）
**测试库**：`localhost:3306/exam_system_test`（setup.js 护栏强制；未触生产库）

```
Test Suites: 65 passed, 65 total      Tests: 974 passed, 974 total      Time: 173.212 s
Test Suites:  1 passed,  1 total      Tests:  17 passed,  17 total
Test Suites:  1 passed,  1 total      Tests:  61 passed,  61 total
Test Suites:  1 passed,  1 total      Tests:  21 passed,  21 total
退出码: 0
```

| 判据 | 要求 | 实测 |
|---|---|---|
| `Test Suites:` 摘要处数 | **4** | **4**（行 1326 / 1366 / 1455 / 1503） |
| failed | **0** | **0**（4 段摘要全为 `X passed, X total`；`✕` 计数 = 0；无 jest 失败块） |
| 套件 / 用例数 | 如实记录 | **68 套件**（65+1+1+1）／**1073 例**（974+17+61+21） |
| 旧基线 | **不得当判据** | 未使用（constraints §3-17 / §4） |

> 说明：`grep -c failed` 得到 5 处命中，逐条查证**全部是 pino 业务日志文本**（`projectGrading.js` 的 P2025 日志、`trustJudge` 降级的 `fetch failed` 重试日志），**不是 jest 失败行**；`SyntaxError` 2 处来自夹具（`bad.py`）的预期输出。日志中 65 处 `● Console` 是 jest 的 console 段落标题，非失败标记。

---

## 8 ★V7 三桩三维 A/B 行为对拍（本步核心）

### 8.1 装置与纪律

| 纪律（A §7.3 四条） | 我的落实 |
|---|---|
| 两侧各自独立 node 进程 | ✅ BEFORE 用 `checkerServiceProbe.mjs`、AFTER 用 `probe-api.mjs`，两次独立 `node run.mjs` |
| 夹具目录同一份被两侧复用 | ✅ 两侧 `server/uploads` → 同一 `/tmp/splitC-fixtures/uploads` |
| 结果写文件不写 stdout | ✅ 输出 `*.ndjson / *.summary.txt / *.timing.txt`（`LOG_LEVEL=silent` 抑制 pino NDJSON） |
| 三桩在两侧完全相同地施加 | ✅ fetch 桩代码同源；prisma 桩文件 sha256 两侧相同；时钟常量相同 |
| 探针 `PORT=0` | ✅ 全部命令显式 `PORT=0` |
| 不触网 | ✅ 见 §8.4 |

**三维度**（每例都记）：① **返回值**（逐字段 JSON）；② **终态 DB**（`__probe.snapshot()` 全库快照）；③ **有序调用日志**（`__probe.log()`：`question.findUnique/update` 的 where+data+result 序列、`systemConfig.findMany`）**外加 fetch 记录**（url/method/auth/hasSignal/body + 队列剩余数）。

**归一化**（只消除非行为差异）：`<TREE>` / `<FIXTURES>` / `<TMP>`（含 `/private/…` realpath 形态）、`checker-<digits>-<rand>.cjs` → `checker-<RAND>.cjs`、**栈帧里的 `file://…` → `file:<MODULE>`**（保留函数名与行号结构，去掉模块路径 —— 这是唯一被允许的「模块 basename」类差异）。**绝对路径与随机名均已占位化**。

### 8.2 用例矩阵（**209 例**）

| 组 | 例数 | 打靶内容 |
|---|---|---|
| F01 `parseCheckerResult` | 16 | 归一化/截断/围栏/非法项 + **Z32**（evidence 空串/空白） |
| F02 `parseCheckerRules` | 25 | **Z20–Z25**（非对象元素 / `name` 兜底 / `params:null` / `params:[]` / 重复 id / 撞号重试 / 非法 max_score）+ 白名单丢弃 + 分数小数（`Math.round` 分支） |
| F03 总和归一化 | 9 | **Z26**（超出 → 等比缩放 + 最大余数）**Z27**（末项被扣 ≤0 → 借分） |
| F04 `findMisplacedSubjective` | 17 | 7 个分隔符逐个 + group/item 精确 + semi 不触发 + 无 `automation_level` + null 入参 |
| F05 `attachNegativeFeedback` | 7 | **Z28**（首参为数组）/ null / undefined / 字符串 / weakRules 非数组 |
| F06 `buildGenerateUserPrompt` | 32 | language{js,java,python,undef} × fixedItems{无,有} × stdFileTree{空,非空} × description{空,非空}，**逐字节比字符串**（Z1/Z2/Z6） |
| F07 `buildCalibrateUserPrompt` | 9 | **Z7** 四分支（error / deductions / defectItems / weakRules / 全空 / 组合 / 超长截断） |
| F08 `runCheckerScript` | 4 | 正常 / 抛错 / **输出非 JSON（Z29）** / 输出 undefined（真子进程，4 次 spawn） |
| F09 `packageFingerprint`+`collectProjectPaths` | 7 | **Z9/Z13**（缺失→null / 空目录 / 嵌套工程 / files+dirs 集合） |
| F10 `validateRulePaths` | 12 | **Z14** 四分支（dir 指向文件 / file 指向目录 / `./` 前缀 / 非字符串 / 空串 / 无 key） |
| F11 `enrichDeductionSnippets` | 2 | **Z15** 四分支（无对应规则 / 无 path key / **`../../etc/passwd` 越界守卫** / 读失败） |
| F12 meta 族 | 13 | **Z10/Z11/Z12**（版本递增 + active 翻转 / 缺陷标记 / 报告分数反算 + note 截断 120 + ruleLabel 兜底） |
| F13 `callLlm` | 6 | **Z4/Z5**（成功 / opts 覆盖 / 空内容重试 3 次 / HTTP 500 / fetch 抛错 / 无 choices） |
| H01 `getCheckerState` | 5 | **Z8** 两分支 + 全 meta + status 缺省 |
| H02 `confirmChecker` | 15 | **Z18** 全 6 类 action + 非法/缺参/无 meta/坏 script/itemIds 非数组/未知 action |
| H03 `rollbackChecker` | 6 | **Z19**（q 为 null / 版本不存在 / 无 rules / 正常翻转 / 字符串 versionId / 无 versions） |
| G `generateChecker` | 22 | **Z17 主链路**（见下） |

G 组覆盖：ready(轮1) / 缺陷候选豁免→ready / subjective_items 缺失容错 / **真·轮 1 失败→轮 2 修复** / 3 轮全败→failed / 白名单全丢→failed / 三分类误置→failed / 多轮最优→**review** / 多轮低分→failed / 标准包缺失→markFailed / 题目不存在→null / status=generating / status=calibrating / fetch 抛错 / HTTP 500 / rubricItems 提炼+写回 / 写回抛错不中断 / 提炼失败回退 / Java 包 / 嵌套包下钻 / 空包 / maxScore 缺失 / 默认评分标准。

### 8.3 结果（三维度）

```
=== SELF-CHECK before run1 vs run2 (最终 209 例装置) ===  IDENTICAL
=== A/B ===                            FINAL A/B IDENTICAL （209 例）
PROBE cases=209 errors=8 fetchStubIntact=true offHostUrls=0
before.summary ERROR 行 = 8 ； after.summary ERROR 行 = 8（同一批）
```

**209/209 例在「返回值 + 终态 DB + 有序调用日志 + fetch 记录 + 队列剩余」上 byte-identical**。8 个 ERROR 例是**我刻意构造的错误路径**（`f08b/c/d` 子进程抛错/非 JSON、`f10k` null rules、`f13c/d/e/f` LLM 失败族），其**错误消息与栈形状**（函数名保留、模块路径占位化）也逐字相同。

**装置自检（防假绿，A §7.3⑤ 的本地化版本）**：
- g13 → `{"status":"failed","error":"LLM 调用失败：ECONNREFUSED probe"}`，**3 次 fetch 全部打到 `http://127.0.0.1:9/chat/completions`** ⇒ fetch 桩真被 callLlm 调用、重试 3 次语义生效；
- g04（3 轮全败）→ 6 次 fetch，**轮 2/3 的 prompt 逐字含 `缺少 objective_items`** ⇒ `parseCheckerRules` 真在跑、错误分支与校准反馈回灌真在跑；
- g08 → 轮 2/3 prompt 含 `【扣分项】`、`【上一版规则`、`文件开头片段` ⇒ `buildCalibrateUserPrompt` 三段落 + L2 片段增强真在跑；
- f08b → `检查脚本执行失败：<TMP>/checker-<RAND>.cjs:1 | …boom-checker` ⇒ **真起了子进程**；
- g02 → report.items[0].note 逐字 = `标准包未包含该文件（缺陷候选：评分标准要求但标准包未实现，可转主观/豁免/接受失分）` ⇒ `markDefectReportItems` 真在跑；
- `validateNegativeTests` 真被调用（13 例的 meta.log 出现 `负例验证：覆盖 1，跳过 0`）；
- g01 → `model=deepseek-chat, temperature=0.2, max_tokens=16000, stream=false` + `__log` 序列 `findUnique > update×5` 完整可读。

### 8.4 禁网自证（三重）

1. `globalThis.fetch` 在 import 被测模块**之前**被替换，替换体**不调用原始 fetch**（探针结束断言 `fetchStubIntact = true`）；
2. `DEEPSEEK_BASE_URL` 桩进 DB `systemConfig` = `http://127.0.0.1:9`（不可达端口），API key = `sk-probe-key`（`getBaseUrl()/getApiKey()` 走 DB → 必然返回该值）；
3. 事后断言：**63 次 fetch 记录的 URL 全部 ∈ {`http://127.0.0.1:9/chat/completions`, `http://127.0.0.1:9/v1/chat/completions`}**，`offHostUrls = 0`；Authorization 全部 `Bearer sk-probe-key`。
⇒ **真实外网调用 0 次**（不含「未走到 LLM 的用例」，那些用例的 fetch 计数为 0 并已如实体现在日志里）。

### 8.5 ★被执行 / 未被执行函数两张清单（V8 coverage 实测，非推演）

方法：以 `NODE_V8_COVERAGE=/tmp/splitC-cov` 跑完整 209 例（AFTER 侧），把覆盖率 JSON 的函数区间按**目标文件行号**与 49 个切片块对齐（块→目标文件行号由 V1 的字节定位给出）。

**A. 27 个顶层函数：27/27 全部被执行**（V8 maxCount > 0）

| 函数 | 目标文件 | 目标行 | 命中次数 | 函数 | 目标文件 | 目标行 | 命中次数 |
|---|---|---|---|---|---|---|---|
| `automationLabel` | prompts.js | 28-32 | 111 | `attachNegativeFeedback` | meta.js | 9-22 | 13 |
| `factsSchemaFor` | prompts.js | 67-72 | 52 | `getCheckerState` | state.js | 9-25 | 18 |
| `stripHtml` | generator.js | 33-41 | 40 | `packageFingerprint` | package-inspect.js | 10-27 | 24（+walk 117） |
| `extractJsonText` | parsers.js | 18-30 | 6 | `appendVersion` | meta.js | 24-40 | 18 |
| `repairTruncatedJson` | parsers.js | 32-59 | 292 | `markDefectReportItems` | meta.js | 42-50 | 18 |
| `parseLooseJson` | parsers.js | 61-75 | 91 | `buildReport` | meta.js | 52-69 | 21 |
| `parseCheckerResult` | parsers.js | 77-116 | 18 | `collectProjectPaths` | package-inspect.js | 40-61 | 24（+walk 122） |
| `parseCheckerRules` | parsers.js | 118-225 | 87 | `validateRulePaths` | package-inspect.js | 63-83 | 38 |
| `findMisplacedSubjective` | parsers.js | 230-256 | 56 | `enrichDeductionSnippets` | package-inspect.js | 85-108 | 17 |
| `runCheckerScript` | legacy-script.js | 21-56 | 4 | `markFailed` | generator.js | 43-58 | 9 |
| `sleep` | llm.js | 15-17 | 12 | `generateChecker` | generator.js | 60-386 | 41（+evaluateRound 39） |
| `callLlm` | llm.js | 19-82 | 59 | `confirmChecker` | review.js | 12-100 | 15 |
| `buildGenerateUserPrompt` | prompts.js | 95-136 | 86 | `rollbackChecker` | review.js | 102-129 | 6 |
| `buildCalibrateUserPrompt` | prompts.js | 138-190 | 25 | — | | | |

> 上表即源文件 48 个顶层声明中的 **27 个函数**（另 21 个是常量）。`execFileAsync`（`const execFileAsync = promisify(execFile)`）属**常量族**、非函数声明，它的**调用**由 `runCheckerScript` 的 4 次成功/失败路径证明（f08a-d）；`legacy-script.js` 的 V8 条目为「模块顶层包体 + `runCheckerScript`（×4）」，两者均执行。

**B. 10 文件内**合计 87 个函数条目（含嵌套/匿名箭头与各文件模块顶层包体）：**84 执行 / 3 未执行**。**未执行清单（3 条，逐条给源码行）**：

| # | 位置 | 代码 | 为什么没执行 | 风险 |
|---|---|---|---|---|
| 1 | `llm.js:40` | `const hangTimer = setTimeout(() => controller.abort(), LLM_CALL_TIMEOUT_MS)` 的箭头体 | 需要「fetch 挂起 ≥180s」才会触发 abort；我的桩永不悬挂（也不允许真等 180s） | 低（该行**表达式本身**执行了 59 次；只有 abort 回调未执行）→ 对应 **Z5 超时分支**未覆盖 |
| 2 | `review.js:36` | `generateChecker(id).catch((err) => logger.error(…))` 的 catch 箭头 | fire-and-forget 的后台生成在 h02b 里「干净地」markFailed（未抛错），因此 catch 回调未走 | 极低 → 对应 **Z18 regenerate 的异常分支**未覆盖 |
| 3 | `generator.js:349` | `defectItems.map((i) => i.item + '（' + i.max_score + ' 分）')` 的映射箭头 | 需要「本轮未达标 **且** 存在缺陷豁免项」同时成立（我的缺陷例在轮 1 就 ready 了） | 低（映射体是一行字符串拼接，且同构代码在 `g02` 的 report 里已被间接验证） |

**C. 21 个顶层常量**：均**非函数**，V8 函数级覆盖率不单列（它们随模块顶层求值，import 成功即已求值）。其取值已被**行为观测**间接锁定：`DEFAULT_THRESHOLD=90`（h01b meta.threshold）、`LLM_MAX_TOKENS=16000`（f13 fetch body）、`MAX_ROUNDS=3`（g04 文案「生成 3 轮后」）、`DEFAULT_MAX_SCORE=100`（g21 maxScore=null）、`RULE_TYPES`（f02 白名单丢弃）、`RULES_FORMAT/RULES_EXAMPLE/GENERATE_SYSTEM/FACTS_SCHEMA_*`（f06/f07 逐字节 prompt）、`AUTOMATION_LEVEL_LABELS`（f06 fixedItems 标注）、`RUBRIC_NAME_SEPARATORS`（f04c 7 例）、`PATH_PARAM_BY_TYPE`（f10）、`SCRIPT_TIMEOUT_MS/SCRIPT_MAX_BUFFER`（f08 真子进程）、`STALE_GENERATION_MS`（g11/g12 行为）、`STUCK_ROUNDS`（见 §11-4，未出现触发路径）。

**D. 与 A 的 Z 清单对照（30/33 覆盖）**

| 覆盖 | Z 项 |
|---|---|
| ✅ 已覆盖（30） | Z1(f06-05…32) Z2(f06 java/python/undef) Z3(全部 G) Z4(f13c-e) Z5-空内容/非2xx/重试/成功(f13a,c,d,e,f) Z6(f06×32) Z7(f07a-i+g04/g08) Z8(h01a-e) Z9(f09a-d) Z10(f12a-d) Z11(f12e-h+g02) Z12(f12i-m+g01/g02) Z13(f09e-g) Z14(f10a-l) Z15(f11a/b+g07/g08) Z16(g04/g05/g08/g09/g11/g13/g14) Z17(22 个 G) Z18(h02a-o) Z19(h03a-f) Z20(f02f) Z21(f02g/v) Z22(f02h/i) Z23(f02j/w) Z24(f02k) Z25(f02l) Z26(f03b/c) Z27(f03d) Z28(f05c) Z29(f08c/d) Z32(f01c/d) |
| ❌ 未覆盖（3） | **Z30**（`err.killed` 超时分支，需 >30s 或改常量，未做）、**Z31**（`finally` 清理失败 catch，无「临时文件删不掉」夹具）、**Z5 的 abort 分支**（同 §8.5-B-1） |

⇒ 未覆盖项**全部落在字节完全相等的切片内**（V1 已证），属**可接受的残留风险**而非本步缺陷；已逐条登记（§12）。

### 8.6 ★变异反证（装置分辨力）

在 **/tmp 的改后副本**（`/tmp/splitC-mut-*`）注入 5 处变异 + 1 处死代码对照，逐一重跑并与其基线逐行 `cmp`：

| 变异 | 内容 | 结果 | 抓到的用例 |
|---|---|---|---|
| **m1** | `parsers.js` 归一化分支：`Math.round` → `Math.floor`（2 处） | **DIFF ✅** | `f02x-fractional-maxscore`（基线 `[33,34,33]` vs 变异 `[33,33,34]`）、`f02y-fractional-subjective`（基线 obj`[60]`/subj`[40]` vs 变异 obj`[61]`/subj`[39]`） |
| **m2** | `prompts.js`：`【满分】` → `【满分 】`（1 个空格） | **DIFF ✅** | 全部 32 个 `f06-*` 逐字节 prompt 比对 |
| **m3** | `state.js`：默认 meta `threshold: DEFAULT_THRESHOLD` → `0` | **DIFF ✅** | `h01b-null-meta`、`h01e-string-id` |
| **m4** | `review.js`：`confirmChecker` 的 **404 分支** `if (!q) return null` → `return { status:'ghost-404' }` | **DIFF ✅** | `h02a-missing-q` |
| **m5** | `llm.js`：默认模型 `'deepseek-chat'` → `'deepseek-chat-mut'` | **DIFF ✅** | `f13a/c/d/e/f`（fetch 请求体被记进日志维度） |
| **m0（对照，应**无**差异）** | `llm.js`：把**零消费死绑定** `getModel` 改名为 `getModelDead`（语义完全惰性） | **NO DIFF ✅**（209/209 相同） | —（证明装置**不会无差别报差异**） |

⇒ **装置有分辨力（5/5 抓差异）且不误报（1/1 惰性改动 0 差异）**。这正是「不改测试迁就实现」的反面：差异由**行为证据**判定，而不是由我的期望判定。

---

## 9 V8 差异点复核（D1–D5）

| # | B 的登记 | 我的独立判定 | 结论 |
|---|---|---|---|
| **D1** | B2 中间态 `review.js` 回指门面（`from '../../../services/checkerService.js'`），B3 改回 `'./generator.js'` | 最终态实测 `review.js:10` = `import { generateChecker } from './generator.js';`；`grep` 无任何指向已删服务的 import 规格符；`cycle-check` SCC 0 / 自环 0 ⇒ **最终态无环**；A §2.4-T8 逐字一致 | **等价，无行为差异**（中间态已不存在，不可复现也不影响判据） |
| **D2** | 门面必须按「源带 export 且已迁出」全量再导出；首版只补「剩余代码引用的」→ B2 丢 5 名 | 最终态 **10/10 可达且身份相等**（§4）；门面构造方式已消除成因（逐条列名，无 `export *`） | **最终态等价**；B2 历史态**不可独立复现**（无快照），已登记 |
| **D3** | banner 写旧路径 vs 「grep 旧路径 = 0」字面冲突 | `grep -rn "from '.*services/checkerService" server/src server/test server/scripts` → **0 命中**；`grep -rn 'services/checkerService.js' server/src` → **恰好 10 命中，全部是 10 个文件的 banner 溯源注释**（每文件 1 处）；`generator.js` 的 17 条 `'checkerService: …'` 是**日志文案**（属搬移块，V1 已证逐字相同） | **等价**（banner 是注释、非 import；不影响运行时） |
| **D4** | 行数偏差（10 文件 1348 vs A 预估 1286；最大 386 vs 381） | 我实测 10 文件 1348 行（258+71+192+84+56+110+25+129+386+37），最大 `generator.js` **386 ≪ 800** | **不影响判据**（判据是 <800） |
| **D5** | `generateChecker` 整段位移、未拆内部 | V1 中 `generateChecker` 是**单一块**（19,425 字节 = 833-1159 整段，sha 两侧一致）；无子函数被外提 | **等价**（316 行单函数 + 闭包 + 11 处 DB 写逐字未动） |

---

## 10 V9 `RULE_TYPES` 缺陷取证独立复核（**只验证取证，不改代码**）

**① 常量级**（真 import 两侧同一实现）：
```
parsers.RULE_TYPES = 8  ["file_exists","dir_contains_file","contains_text","count_regex","contains_regex","file_count_in_dir","syntax_check","fact"]
rule.RULE_TYPES    = 11 [ …同上… ,"ast_pattern","count_imports","normalized_text"]
missing in parsers = ["ast_pattern","count_imports","normalized_text"]
```
⇒ B/A 所述「注释声称与 `ruleExecutor.RULE_TYPES` 一致、实为 8 vs 11」**成立**（`domain/services/rule/constants.js` 实测 11 项）。

**② 运行时取证（我自己造夹具复现）**：喂入 `{max_score:100, objective_items:[{id:'a1',rule_type:'ast_pattern',params:{path:'src/main.js'},max_score:30},{id:'a2',rule_type:'file_exists',params:{path:'package.json'},max_score:70}], subjective_items:[]}`：
```
f02r → {"max_score":100,"objective_items":[{"id":"a2", … ,"rule_type":"file_exists","params":{"path":"package.json"},"max_score":100}],"subjective_items":[]}
```
⇒ **`ast_pattern` 被 `parseCheckerRules` 静默丢弃（`:304` 白名单过滤），原本 70 分的项被总和归一化补成 100 分** —— 「检查项丢失 + 分数虚高」的后果链**逐字复现**，与 B §10 记录一致。而 prompt（`:563`）确实在**鼓励**优先使用 `ast_pattern/count_imports/normalized_text`（f06 的 prompt 逐字节可验），**白名单与 prompt 自相矛盾**这一判断成立。

**③ 本步动作**：`RULE_TYPES` 与该错误注释的切片 sha 两侧相等（块 `e5e997fb197c5c11`）⇒ **零修改**，与硬要求「只登记不修」一致。**是否立项修复需 Captain 决策**（属行为变更，必须另开一步 + 另过 DoD + 数据侧取证）。

---

## 11 缺陷分级（本轮**新登记**，全部为**既有缺陷**，两侧行为相同 ⇒ 非本步引入）

| # | 级别 | 缺陷 | 证据 | 建议 |
|---|---|---|---|---|
| **C-1** | **中** | **`generateChecker` 的「新鲜 generating 幂等返回」分支在生产不可达**：`findUnique` 的 `select` 未包含 `checkerMeta`（源 :846-852 / 现 `generator.js:60-72`），故 `started` 恒为 0 → `Date.now()-0` 恒 > `STALE_GENERATION_MS` → **永远走「陈旧状态」分支**，重复触发生成不会被幂等拦截 | 实测 `g12-status-calibrating`（`checkerStatus='calibrating'` + `checkerMeta.startedAt=1760000000000`）→ **未被幂等拦截**，直接重新生成并返回 `{status:'ready',rounds:1}`；`g11` 同理走到 markFailed | 独立缺陷项（与本次拆分无关）；修法=`select` 补 `checkerMeta` 或改用单独查询 |
| **C-2** | **中** | **`parseCheckerRules` 极端归一化可产出负分**：`max_score=2` + 5 个各 10 分的客观项 → 借分分支产出 `max_score = -2` | 实测 `f03d-borrow-extreme` → `[{a1:-2},{a2..a5:1}]`；该结果随后会被 `runRules→validateRules` 拒绝（"max_score 必须为正数"）⇒ 本轮直接失败，而非静默错分 | 独立缺陷项（Z27 分支）；两侧一致 |
| **C-3** | **低** | **A 方案 §7.3 的 G02（「第 1 轮 ≥阈值 → review」）在本代码形态下不可达**：轮级 review 分支要求 `realDeductionSum === 0`，而此时恒有 `calibScore = 总分 − 主观合计` ⇒ 必然先命中 ready 分支 | 代数论证 + 实测 `g02`（60+40 缺陷豁免 → **ready**，非 review）；唯一可达的 review 是**多轮终局**分支（`g08` 实测 `review`） | 更正 A/G 系列用例预期；不属实现缺陷 |
| **C-4** | **低** | **A 的 G14（「连续同分 ≥3 → fresh 重生成」）在 `MAX_ROUNDS=3` 下不可达**：`stuckCount` 最多累到 2 | 实测 `g08`：3 轮同为 50 分，轮 2/3 的 prompt 仍是**校准**prompt（含 `【扣分项】`/校准语），从未回到 fresh 生成 | 更正方案预期；`STUCK_ROUNDS=3` 与 `MAX_ROUNDS=3` 的组合使该防抖机制**恒不触发**（可作后续行为改进项） |
| **C-5** | **低** | `validateRulePaths(null, …)` 直接抛 `TypeError`（未做 null 守卫） | 实测 `f10k-null-rules` → `TypeError: Cannot read properties of null (reading 'objective_items')` | 生产不可达（入参来自 `parseCheckerRules`）；仅登记 |
| **C-6** | **登记** | `getModel` 零消费死绑定 | `llm.js` 全文 1 次（仅 import 子句）；10 文件合计 1 次 | 本步**逐字照带**（正确）；清理属独立项 |
| **C-7** | **登记** | `RULE_TYPES` 8 vs 11 + prompt 矛盾 + 静默丢弃 + 分值补末项 | §10 | 独立缺陷项（行为变更，另开一步） |

> 以上 7 项**没有一项由本次拆分引入**：C-1/C-2/C-5 的触发用例在**改前侧返回完全相同的结果**（A/B byte-identical），C-6/C-7 的切片 sha 两侧相等。

---

## 12 未做项与残留风险（如实登记，不以「应该没问题」代替）

1. **未覆盖的 3 条零覆盖分支**：Z30（`runCheckerScript` 超时 `err.killed`，需 >30s 或改常量）、Z31（`finally` 删除失败 catch）、Z5 的 abort 回调（`llm.js:40` 箭头）。三者均在**逐字节相等的切片**内（V1 已证），但**没有行为证据** ⇒ 残留风险（低）。
2. **`generateChecker` 的 3 条未被触发的细支**：`review.js:36` 的 catch 箭头、`generator.js:349` 的 defectItems 映射箭头、`weakRules` **非空**时接入 `lastFeedback` 的那一行（我的 G 组里 `validateNegativeTests` 恒返回 `weakRules: []`；仅 F05/F07 直接调 `attachNegativeFeedback`/`buildCalibrateUserPrompt` 时喂了非空 weakRules）。⇒ 该「接线行」只有**结构证据**（V1 逐字相等）+ **间接证据**，无端到端行为证据。
3. **未做「22 个 integration 套件是否真未执行 service」的运行时复核**：本轮我以**自建三桩装置**替代（这正是任务书要求的唯一行为证据）。A §12-3 的论证我**未证伪也未证实**；如 Captain 需要，可对全量回归加 `NODE_V8_COVERAGE` 复核（本轮未做，因需重跑 173s 全量且会再写一份日志）。
4. **`checkerService.js` 的线上数据侧取证未做**（`questions.checkerScript` 是否还有历史脚本数据）：超出只读范围（需查库），A §5/§12-9 已登记。
5. **B2 中间态不可复现**：无快照/tag，D1/D2 的「中间态」部分只能采信 B 记录（最终态已由我验证）。
6. **本轮仓库写入（除本报告）**：① `docs/split/test-round-08.log`（V6 规定产物，1508 行，sha256 `f26ed19a…`）；② `server/logs/app-2026-10-11.log`（jest 跑应用时的运行期日志，**非我直接写入**，属 V6 命令的副产物）。
   实测未触碰：`client/dist`（0 个新 mtime）、`tests/`（0）、`scripts/gates`+`server/scripts`（0）；`git status --porcelain -uno` 仍只有入场时的 4 条（2 M + 1 D + 1 M）。**未执行任何 git 写操作**（无 add/commit/clean/stash/checkout/reset/restore）；**未重建 `client/dist`**；**未触碰 :5173/:3000**（探针一律 `PORT=0`）；**未联网**（§8.4）；**未装新依赖**。
7. **`docs/split/status.md` 的 M 状态与本轮无关**：入场前即为 M；本轮其 mtime 有更新（Captain 在写入，非我）。我全程未写该文件。
8. **夹具与桩的边界**：`summarizeRubricItems` / `extractFacts` / `validateNegativeTests` / `runRules` 是**unlayered 邻居模块**（本步未改），我只验证「拆分后调用它们的路径等价」，不验证它们自身的正确性。

---

## 13 本步结论

### ✅ **PASS**（无需回流 B）

| 核心判据 | 结果 |
|---|---|
| V1 逐块 sha256 判等（自建） | **49/49 全等、0 块不等**；反向未归属字节 **0**、未消费块 **0** |
| V2/V3 导出面与门面可达性 | **10 名逐字等价**；**10/10 可达且 `facade[name] === submodule[name]`（0 mismatch）**；`buildGenerateUserPrompt` 未降级 |
| V4 绑定 | 跨文件引用闭包 **0 违规**；`getModel` 照带（1 次）；`export *` 0 |
| V5 五门禁 | 违规 **0** / 未分层 **46→45** / GodFile **8→7** / SCC **0**（194 边）/ hard **0/0/0** / bind **0** |
| V6 全量回归 | **4 处摘要 + 0 failed**（68 套件 / 1073 例） |
| V7 三维对拍 | **209/209 byte-identical**（返值+DB+调用日志+fetch）；自检 before×2 相同；**变异 5/5 全中 + 惰性对照 0 误报**；真实外网 **0** 次 |
| V9 取证 | `RULE_TYPES` 缺陷取证**成立**，且**未修改** |

**给 Captain 的三条建议**：
1. **可以提交 step 3 并刷新 arch 基线**（未分层 45 / GodFile 7）；
2. 把 **C-1（幂等分支不可达）** 与 **C-7（`RULE_TYPES` 与 prompt 矛盾）** 立为独立缺陷项（均属行为变更，须单独过 DoD）；
3. 更正 A 方案 §7.3 的 **G02 / G14** 两处不可达预期（C-3/C-4），以免后续步骤沿用错误夹具矩阵。
