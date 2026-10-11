# ruleExecutor 拆分执行报告（GodFile 拆分专项 · step 1 · Agent B）

- **执行者**: Agent B（唯一写者）｜ **会话 ID**: 83ee585f-a52f-4995-bb80-79cfeba6e053
- **日期**: 2026-10-11 ｜ **方案依据**: `docs/split/ruleExecutor-plan.md`（394 行，A 产出）
- **目标形态**: A 的**推荐形态**（3 domain + 5 infrastructure，共 8 文件）
- **备选形态（§9-7）**: **未触发** —— 实测 3 个 domain 文件**零违规**（见 §5.1）
- **一句话结论**: 8 文件全部落层、43 个搬移块**逐字节相等**、四门禁 5/5 PASS、定向 149 例全绿；未分层 47→**46**、GodFile 10→**9**、SCC 仍为 **0**。

---

## 0 判定摘要（判据 → 实测）

| # | 判据 | 要求 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | `check-layers.mjs` 违规 | 0 | **0**（文件 78） | ✅ |
| 2 | 未分层待迁移 | 47 → 46 | **46**（▼1） | ✅ |
| 3 | `cycle-check.mjs` SCC | 0 | **0**（自环 0） | ✅ |
| 4 | `bind-check.mjs` 绑定违规 | 0 | **0** | ✅ |
| 5 | `hard-metrics.mjs` | 0/0/0 | **0/0/0** | ✅ |
| 6 | `arch-metrics.mjs` | PASS + GodFile 9 | **PASS**，GodFile **9** | ✅ |
| 7 | 逐块 sha256 切片判等 | 33 函数 + 8 声明全等 | **43/43 全等，0 处不等** | ✅ |
| 8 | 定向单测 | 全绿 | **149 例 / 0 失败**（5 套件） | ✅ |
| 9 | H1（mock 路径同址） | 双向验证 | **同址 + 反向能见明确失败** | ✅ |
| 10 | 行为变更 | 零 | 仅搬移 + import 重写 | ✅ |

---

## 1 版本锚点与越界自查

### 1.1 锚点

| 项 | 值 |
|---|---|
| HEAD | `c7dbd754be3387ea1ff68d3e86782d36377a3447`（= `c7dbd75`） |
| 源文件（冻结树 `git show HEAD:...`）sha256 | `449d6db663bc22a1cc435d0d33248bd9bbcdf205fb529aac0833cf1880965155`（= A 的锚点，**逐字命中**） |
| 源文件行数 | 1010（`wc -l`） |
| 我入场时的工作树 | `M docs/split/status.md`（我未触碰） |

### 1.2 改动面（`git status --porcelain -uno`，删源文件后）

```
 M server/scripts/experiment-variance.mjs          <- I7
 M server/src/services/checkerService.js           <- I1
 M server/src/services/projectGrading.js           <- I3
 M server/src/services/ruleMutator.js              <- I2
 D server/src/services/ruleExecutor.js             <- 删源文件（B12）
 M server/test/unit/infrastructure/experiment-variance.test.js  <- I6
 M server/test/unit/infrastructure/rule-executor.test.js        <- I4
 M server/test/unit/infrastructure/rule-mutator.test.js         <- I5
```

**恰好 8 条**：3 src 导入方 + 3 测试/脚本 + 1 删除。7 个改写站点**每个只改 1 行**（`git diff --stat` 逐文件均为 `1 insertion(+), 1 deletion(-)`）。
新增 8 个文件为**未跟踪**（`git ls-files --others`）：

```
server/src/domain/services/rule/constants.js
server/src/domain/services/rule/evaluators.js
server/src/domain/services/rule/validate.js
server/src/infrastructure/rule/file-access.js
server/src/infrastructure/rule/executors.js
server/src/infrastructure/rule/syntax.js
server/src/infrastructure/rule/executor.js
server/src/infrastructure/rule/index.js
```

### 1.3 **不是我改的**（重点声明，防误判）

| 文件 | 状态 | 说明 |
|---|---|---|
| `docs/pipeline/project-constraints.md` | `M`（3 insertions / 2 deletions） | **我入场时该文件是干净的**（入场基线只有 `M docs/split/status.md`）；本轮期间被**另一个 Agent** 修改，diff 内含字样「2026-10-11 由 Agent A 指出此处曾与 §3-17 自相矛盾」。我**只读**过它，**未写入**。 |
| `docs/split/status.md` | `M` | 我入场前即为 `M`，非我改动。 |

> 越界自查：未触碰 `client/**`、`tests/**`、`scripts/gates/**`、`server/test/` 的**断言**（只改路径）、`server/package.json`、`server/logs`。**未执行任何 git 写操作**（无 commit / clean / stash / checkout / reset / restore）。

---

## 2 目标形态与实测行数

**采用 A 的推荐形态**（3 domain + 5 infrastructure）；未触发 §9-7 备选形态（理由见 §5.1）。

| # | 目标文件（层） | 源区间（逐字） | 搬移块 | 搬移行 | **实测总行** |
|---|---|---|---|---|---|
| T1 | `domain/services/rule/constants.js`（**domain**） | 37–124 | 7 | 82 | **95** |
| T2 | `domain/services/rule/evaluators.js`（**domain**） | 128–831 | 9 | 155 | **172** |
| T3 | `domain/services/rule/validate.js`（**domain**） | 835–928 | 1 | 94 | **101** |
| T4 | `infrastructure/rule/file-access.js`（infrastructure） | 139–219 | 4 | 66 | **78** |
| T5 | `infrastructure/rule/executors.js`（infrastructure） | 279–776 | 8 | 198 | **217** |
| T6 | `infrastructure/rule/syntax.js`（infrastructure） | 31–724 | 10 | 213 | **241** |
| T7 | `infrastructure/rule/executor.js`（infrastructure） | 778–1010 | 2 | 118 | **132** |
| T8 | `infrastructure/rule/index.js`（infrastructure） | 1–29 | 2 | 17 | **31** |
| — | 源文件 `server/src/services/ruleExecutor.js` | 1–1010 | — | −1010 | **0（已删）** |
| | **合计** | | **43** | **943** | **1067** |

- **合计 1067 行**（A 预估 ≈1070，偏差 −0.3%）｜ **最大单文件 syntax.js = 241 行**（A 预估 ≈240；≪ 800 的 GodFile 线）
- 目录 `server/src/domain/services/rule/` 与 `server/src/infrastructure/rule/` 均为**新建**。

| 目标文件 | 整文件 sha256（改后活树） |
|---|---|
| `domain/services/rule/constants.js` | `a0b94b605ead2c78a04f8f9a986256ee8ab85c8db25a42e1a17e03abf61fde50` |
| `domain/services/rule/evaluators.js` | `57a719209403ad1149f11bd06f57db0b3fba1a3b256290c64ea4c7fa634102e9` |
| `domain/services/rule/validate.js` | `5faeccbab63867c356ed28c296562315cea1ff64759e27be4595c3aa9dbd6b78` |
| `infrastructure/rule/file-access.js` | `466e5bad76837aa5fb1fb5a4b3599227b4f5ce64fbb5a9956271f08f380e4b56` |
| `infrastructure/rule/executors.js` | `7efd61cb24dbb70e27390949f7f7827b0c13a1cf86bcb57e21c5dd533c3896f7` |
| `infrastructure/rule/syntax.js` | `9c4f7cd79d771cd35cc437e7ab7caa82b1626df830c810f345656f8cdc67a854` |
| `infrastructure/rule/executor.js` | `dd107c34044b70301158d039e22d1e8f636248a46096a87d7d5ef46fc2cc8ea9` |
| `infrastructure/rule/index.js` | `e7f485ba2a4180ed18e92f80bc5ce4acbeba4321bd59eb67d1a173d886590e72` |

### 2.1 对外导出面（逐字不变，10 名）

```
PORT=0 node --input-type=module -e "const m=await import('./server/src/infrastructure/rule/index.js');console.log(Object.keys(m).sort().join(','))"
=> FACT_OPS,RULE_TYPES,collectFiles,extOf,globToRegExp,readFileUtf8,resolveProjectRoot,resolveWithinRoot,runRules,validateRules   (count=10)
```

与今日实测的 10 名清单**逐字相等**（无多、无少）；未使用 `export * from`（bind-check 的已知盲区）。

---

## 3 逐块搬移对照（sha256 切片判等 · 43/43 全等）

**方法（可复现）**: 从 **冻结树** `git show HEAD:server/src/services/ruleExecutor.js` 取源行切片（不含工作树 —— 源文件已删），对每块求 sha256；再在目标文件全文里做**字节子串定位**（`content.split(slice).length-1`），命中数 ≥1 且哈希相等即判「逐字节相等」。

- 冻结树整体 sha256 = `449d6db6…`（与 A 锚点一致，先自证后判等）
- **判等结果: 43 块 / 0 块不等**（33 个函数 + 8 个顶层声明 + 2 个 index.js 非声明块）
- **未在函数声明行加 `export`**：新文件里以 `^export (function|const)` 开头的声明行**恰好 9 个**，且这 9 个（`RULE_TYPES` `FACT_OPS` `extOf` `globToRegExp` `collectFiles` `resolveWithinRoot` `readFileUtf8` `validateRules` `runRules`）在**源文件里本来就带 `export`** —— 其余 32 个声明一律通过**文件尾单个 `export { … };` 块**跨模块暴露。

| # | 符号 | 源行（冻结树） | 行数 | 源切片 sha256（全 64 位） | 目标文件中命中 | 判等 |
|---|---|---|---|---|---|---|
| 1 | `RULE_TYPES` | 37–54 | 18 | `17855f7684c839205ba5899efdb6e53978a65a9c9331f95664119f8d37f875ff` | 1 | ✅ |
| 2 | `SKIP_DIRS` | 56–59 | 4 | `e41864af3c07174c3658b851fbe7b1cbd53e4445517051bc4e1320df89cbc929` | 1 | ✅ |
| 3 | `CHECKABLE_EXTS` | 61–66 | 6 | `dcfad88677f8ed9af758c7f5870e515f0a872ed66aa3d4d797f01306788259b9` | 1 | ✅ |
| 4 | `FACT_OPS` | 68–69 | 2 | `ac8883e3abbb81694a9b937de054e1ed53c23b640592df0a6b69817ca0bc4964` | 1 | ✅ |
| 5 | `FACT_LABELS` | 71–118 | 48 | `7f98fe4f9fde4511599e0df584211befe655b27491c95ed5f7357c8c50134f81` | 1 | ✅ |
| 6 | `INVERSE_OPS` | 120–121 | 2 | `ebe4aa056ad7d617ee6bd2c71c7280d0914ab15a8e6e422f9a4c54bbecd650b1` | 1 | ✅ |
| 7 | `ERROR_SUMMARY_LEN` | 123–124 | 2 | `b6e6bcb39153c9cca9b6ee6de379cefa2d571472bd47cb73866c52aa0d599333` | 1 | ✅ |
| 8 | `clampScore` | 128–137 | 10 | `701f6ed1cec041482f22ced76965bed76409976525b2c3f72b3a13ab21274e54` | 1 | ✅ |
| 9 | `globToRegExp` | 151–161 | 11 | `1ba7d98c4f05e9e94d1f2166626d6dc8e560df4e0367d4cd5e64ab0b3d1d2d03` | 1 | ✅ |
| 10 | `countMatches` | 221–235 | 15 | `b03a2bda8ea3afd146785e7e7c105c522592945ed8e420028b01fe43710edfd7` | 1 | ✅ |
| 11 | `extractVueScriptWithOffset` | 237–248 | 12 | `fbfe46cb64252f93cc0a071cf3ef707e8f20021600b6cc32e1019498d5d4f3cc` | 1 | ✅ |
| 12 | `lineNumberOf` | 250–263 | 14 | `06cf713bea76f0effc1fd67472979c1b60dddbade5f14b238816dc8b667a8c88` | 1 | ✅ |
| 13 | `errorSummary` | 265–275 | 11 | `c1d3507dad3b5e5772dd0ac6c16f5b0c5809201d2400667e501c6f0d9e60cff6` | 1 | ✅ |
| 14 | `factValueText` | 568–577 | 10 | `bd0541c10021a7311d1ba768f83280428e5c7b15aa4950c5355381dfa24e59d1` | 1 | ✅ |
| 15 | `execFact` | 579–634 | 56 | `78a3d185afcd5c5b1652149a54b79056c80b29318dd2ccdbd20989a5e84dca76` | 1 | ✅ |
| 16 | `buildGroupSummary` | 816–831 | 16 | `41bf639308c44be16dcecf269db6e37c92239e171a8b1c3401d43a565b7221b3` | 1 | ✅ |
| 17 | `validateRules` | 835–928 | 94 | `4b28d1b72d5213d277faab354d8c1430bddee6fde7a8de54cc5db81d5518da8b` | 1 | ✅ |
| 18 | `extOf` | 139–149 | 11 | `578a19940597d2cdfd1acf6f29e41f2643a7ede18bf129196fc5567b97272142` | 1 | ✅ |
| 19 | `collectFiles` | 163–190 | 28 | `a304cb1fd26070f3800281e375ade3ec6863f83fa6241823c19af09fc5d6d1f0` | 1 | ✅ |
| 20 | `resolveWithinRoot` | 192–205 | 14 | `a314e978c5ee7ffb550892240f0b94a88ef723f30ecfb31f0209201156d13622` | 1 | ✅ |
| 21 | `readFileUtf8` | 207–219 | 13 | `b82cfa30a632e50d09523902d287676b6cdc74f3ece2411364f3687d512b7321` | 1 | ✅ |
| 22 | `execFileExists` | 279–299 | 21 | `9bf30d528d940cdd61358f41aea78779b5eff402bc955bd2aea9150f5e3cb888` | 1 | ✅ |
| 23 | `execDirContainsFile` | 301–327 | 27 | `0ece08549a5c4841e4cc461bb052bd3f2cde36344e86951c4594279b1eff5bcc` | 1 | ✅ |
| 24 | `execContainsText` | 329–347 | 19 | `d9abab7eb53a630e3a17ff8afb26c2c55c5ef3b460edcb35a52ab9e23ece3b24` | 1 | ✅ |
| 25 | `execCountRegex` | 349–376 | 28 | `8ebbedd144db7640f5e9bfde3428e23958e5d519a248c2c2f60e75d88537ae59` | 1 | ✅ |
| 26 | `execContainsRegex` | 378–401 | 24 | `88abe0a8268d2a8d95e14357607316dfc9838b8917bc85ca1ce8cc3d2a7db5e3` | 1 | ✅ |
| 27 | `execFileCountInDir` | 403–431 | 29 | `b66cae9e0338c6cf62ca9eba0547a4f061bcb4b9e81f649a813c3733e0c5134e` | 1 | ✅ |
| 28 | `execCountImports` | 726–759 | 34 | `bfffe889e8c76e5df5548d3c40e2fdbc116c00d4003b84b03ebd224ed9c254c4` | 1 | ✅ |
| 29 | `execNormalizedText` | 761–776 | 16 | `f3bf8a01f478a70ea7c46d36043a391e18376309c81a0747c72fee48f9ed3de7` | 1 | ✅ |
| 30 | `nodeRequire` | 31–33 | 3 | `94dc55a4a2e5aa4ae619e761856b8a630bd04a7cdc673b9e134699fc01dddbf4` | 1 | ✅ |
| 31 | `getJSParser` | 435–443 | 9 | `70862e76cd83830ab5244290062ed9f577d3f829f0d427b02be7882ec2092079` | 1 | ✅ |
| 32 | `getVueParser` | 445–452 | 8 | `5ea5643a7066b0f247d39b338f6c2da895ad7725c989c566b832dbfeb6e85322` | 1 | ✅ |
| 33 | `collectSyntaxErrors` | 454–474 | 21 | `665a6ecba094842e35452c3e84ab141b7dde3257e7a18fe61c7786c5cb7a56d4` | 1 | ✅ |
| 34 | `describeSyntaxErrors` | 476–490 | 15 | `a0f8329069b20d516193001b5a3e2e6427b58eb2d0b14de4aca8b842b629a065` | 1 | ✅ |
| 35 | `checkSyntaxOfFile` | 492–529 | 38 | `7db6bd1ffb88f64b970c9fe7468b2bd5130f029c59e975d075c0df9b1b88fa27` | 1 | ✅ |
| 36 | `execSyntaxCheck` | 531–564 | 34 | `48669ab03a12f3f43f610dbed95dfb1e40e356d5c8da720682a6240bdbd4509d` | 1 | ✅ |
| 37 | `parserForFile` | 638–659 | 22 | `ab4ff49633746b7065b9a69f68aa2b151dfa03dfdc58cbe59fd40180c6ba461f` | 1 | ✅ |
| 38 | `countAstPatternMatches` | 661–692 | 32 | `6bd00c83facd3bdc634efaf8637266c7d342de61fd5760bc7c17a38b895275fa` | 1 | ✅ |
| 39 | `execAstPattern` | 694–724 | 31 | `a55b65ec25e5faf6a389e2ccae18998f961ffb6fc0f4b3251732517454cb04c4` | 1 | ✅ |
| 40 | `executeItem` | 778–814 | 37 | `fbf5d6c0756963719dd1dc4461e2ca79ed376e5fdd036a3ef1c8a870ccafd960` | 1 | ✅ |
| 41 | `runRules` | 930–1010 | 81 | `45ad4031dab3bfa9b791fbd827b0871a5fe41632f01bf0a4a8bea9d31abb5af7` | 1 | ✅ |
| 42 | `(文件头 JSDoc)` | 1–14 | 14 | `acf3dad286a2c0271bd0baf9756258d3d5ddc245c99ee4a20ec9feefbea67e0e` | 1 | ✅ |
| 43 | `(文件头 JSDoc)` | 27–29 | 3 | `323ebff7debad73079fca3a25e53798279ca0c90d7b7d88de508cffc9cd2052f` | 1 | ✅ |

### 3.1 死代码逐字保留（第④条硬要求）

| 单元 | 源行 | 判等块 | 结论 |
|---|---|---|---|
| `nodeRequire` 死变量（零消费）+ 其 2 行说明注释 | 31–33 | 块 30 | ✅ 逐字节相等（**未删除、未优化**） |
| `getVueParser()` 恒 `return null`（ABI 回退史注释保留） | 445–452 | 块 32 | ✅ 逐字节相等 |
| `checkSyntaxOfFile` 中因上者而**不可达**的真值分支 | 511–515 | 块 35 | ✅ 逐字节相等（随整块搬移） |

> 该函数整体（492–529）哈希相等 ⇒ 证明「不可达分支」原样在位，未被顺手删除。

---

## 4 与 A 方案的偏离（3 条，全部为**修正**而非改设计）

### D1（重要）A 的 §2.4 import 清单**漏了 6 个绑定**，照抄会产出 6 处运行时 `ReferenceError`

自查方法：自建「块注释状态机（逐行剥离 `/* */` 与 `//`）+ 块内标识符引用扫描」，对 41 个搬移块求**跨文件引用闭包**，再与 §2.4 的 import 清单对拍。

| 目标文件 | A 给的行 | 实测缺失绑定 | 触发位置（实测，代码非注释） |
|---|---|---|---|
| T5 `executors.js` | 只 `path` | **`fs`** + **`countMatches`** | `fs`：`execFileExists` 的 `fs.existsSync/statSync`（源 :292）；`countMatches`：`execCountRegex`（源 :361） |
| T6 `syntax.js` | `{ extOf, readFileUtf8 }` from file-access；evaluators 只 3 名 | **`collectFiles`** **`resolveWithinRoot`**（file-access）+ **`globToRegExp`**（evaluators） | 三者均在 `execSyntaxCheck`（源 :545 / :548 等） |
| T7 `executor.js` | evaluators 只 `{ buildGroupSummary, clampScore, execFact }` | **`errorSummary`** | `runRules` 的 facts 提取失败分支（源 :972） |

> 这类缺失 **`node --check` 抓不到**（constraints §3-12：语法检查不校验跨模块绑定），只有真跑才会炸。已在 §6 用定向套件反证「补齐后无 ReferenceError」。

### D2 `index.js` 必须补 1 条**本地绑定** import（否则 ESM 直接报错）

源文件 :29 的 `export { resolveProjectRoot };` 是**本地再导出**，依赖 :22 的 `import { resolveProjectRoot } from './factExtractors/common.js'` 提供绑定。
- 若照 §2.3 只写 `export { resolveProjectRoot } from '…/common.js';` → 27–29 块的**字节相等被破坏**；
- 若只搬 27–29 逐字、不补 import → 实测 `SyntaxError: Export 'resolveProjectRoot' is not defined in module`（`node --check` 与真 import 双复现）。

**采用做法**：27–29 **逐字保留** + 顶部补 `import { resolveProjectRoot } from '../../services/factExtractors/common.js';`（与源文件的两步式语义完全一致）。→ 43/43 块仍全等。

### D3 §7.4 的 banner 与 B12 的 grep 判据**字面冲突**（以 §7.4 为准）

§7.4 强制 banner 写「由 `server/src/services/ruleExecutor.js` 拆分而来」，而 B12 要求 `grep -rn 'services/ruleExecutor.js' …` = 0。二者不可能同时满足。判定：**banner 是溯源注解、不是 import**，保留 §7.4 格式；实测
- **import 规格符 0 命中**（`grep -rn "from '.*ruleExecutor" server/src server/test server/scripts` = 0）
- 命中项 = 8 条 banner + 15 条**既有历史注释**（`ruleMutator.js:49` 等，I8「纯注释不改」）。

---

## 5 门禁实测（改前 → 改后）

### 5.1 `node server/scripts/check-layers.mjs`

```
[改前 入场]  文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个
[中途：8 新文件已建、源文件未删]  文件 79 个，违规 0 条（0 类规则），未分层待迁移 47 个
[改后 删源文件]  文件 78 个，违规 0 条（0 类规则），未分层待迁移 46 个        exit=0
```

> **备选形态未触发的判据**：中途那次测量（3 个 domain 文件 + 5 个 infra 文件**全部在位**、源文件尚未删除）**违规 0 条** ⇒ 3 个 domain 文件（`constants` 零 import、`evaluators`/`validate` 只 import `./constants.js`）经真实门禁判定**不产生任何 `domain-imports-external` / `domain-imports-outside`**。故**无需**启用 §9-7 备选形态。（中途读数与 A 的内存预判一致。）
> **未分层 47 → 46**：删源文件 −1，8 个新文件全部首段命中四层（0 增量）。

### 5.2 `node scripts/gates/cycle-check.mjs`

```
[改前]  扫描 71 文件 / 164 条相对导入边 ｜ SCC 0 ｜ 自环 0 ｜ PASS
[中途]  扫描 79 文件 / 183 条相对导入边 ｜ SCC 0 ｜ 自环 0 ｜ PASS
[改后]  扫描 78 文件 / 178 条相对导入边 ｜ SCC 0 ｜ 自环 0 ｜ PASS        exit=0
```

- **边数 164 → 178（+14）**，如实记录（A 预判 ≈179，**不作判据**）。
- 边集**逐条对拍**（自建扫描器复刻 :39 的 `IMPORT_RE` 与解析规则，分别跑冻结树与活树）：中途态 **added 19 / removed 0**；删源文件后源文件的 5 条出边（`factExtractor` `factExtractors/common` `java` `python` `utils/logger`）随之消失 ⇒ 164 − 5 + 19 = **178** ✔（算术闭合）。
- **新增的 19 条边**（全部为向下/同层，无反向边）：
  `evaluators→constants`、`validate→constants`、`file-access→constants`、`executors→{evaluators,file-access}`、`syntax→{constants,evaluators,file-access,java,python,logger}`、`executor→{factExtractor,common,logger,evaluators,validate,syntax,executors}`、`index→common`。
- 5 条原相对出边（`factExtractor` / `common` / `java` / `python` / `logger`）**全部保留**，只换宿主文件 ⇒ 无新增第三方适配器边。

### 5.3 `node scripts/gates/bind-check.mjs`

```
modules scanned              : 176        （改前 169）
named import bindings checked: 558        （改前 512）
unresolved relative imports  : 4 (仅登记)   ← 与改前同 4 条（测试夹具合成串）
external (out-of-root) refs  : 1 (仅登记)   ← 与改前同 1 条
BINDING VIOLATIONS           : 0          exit=0
```

> 该门禁**能校验 re-export**（:113-118），故 `index.js` 的 6 行 `export { … } from` 也被真实校验；`checkerService` / `ruleMutator` / `rule-executor.test` 对 10 个名字的具名 import 全部命中真实导出。

### 5.4 `node scripts/gates/hard-metrics.mjs`

```
✓ hex6 0 / important 0 / modalConfirm 0   结论：PASS    exit=0
```
（只扫 `client/src`，本步**逐字未变** —— 预期。）

### 5.5 `node scripts/gates/arch-metrics.mjs`

```
✓ layerViolations  基线=0   实测=0
✓ unmigrated       基线=47  实测=46
✓ godfileOver800   基线=10  实测=9
· >500 行（观察带） 基线=19  实测=18        ← 如实记录（下降，非劣化）
GodFile >800 行：…（列表中 ruleExecutor.js (1010) 已消失）
结论：PASS   exit=0
```

---

## 6 定向单测（删源文件前后各跑一遍）

装置：`DATABASE_URL` = 由 `server/.env` **只换库名**为 `exam_system_test` 派生；`PORT=0`（`server/test/setup.js:2` 强制）；**每个套件单独一个 jest 进程**（playbook 三段式：tree-sitter 套件禁止同进程，避免 ABI 污染）。

| 套件 | 改前 | **删源文件后复跑** |
|---|---|---|
| `rule-executor.test.js` | 61 passed | **61 passed** |
| `fact-extractor.test.js` | 17 passed | **17 passed** |
| `rule-mutator.test.js` | 21 passed | **21 passed** |
| `experiment-variance.test.js` | 8 passed | **8 passed** |
| `checker-service.test.js` | 42 passed | **42 passed** |
| **合计** | **149 / 0 failed** | **149 / 0 failed** |

> 全部 `Test Suites: 1 passed, 1 total`；**无套件失败** ⇒ 未触发「停下来回报 Captain」的条件。未跑全量回归（C 的职责）。

---

## 7 H1 单点故障（最高优先）：路径键控 mock

### 7.1 两个路径的对应关系（实测 `path.resolve` 相等）

| 站点 | 写法 | 解析出的绝对文件 |
|---|---|---|
| **I3** `server/src/services/projectGrading.js:30` | `import { runRules } from '../infrastructure/rule/index.js';` | `<repo>/server/src/infrastructure/rule/index.js` |
| **I6** `server/test/unit/infrastructure/experiment-variance.test.js:42` | `jest.unstable_mockModule('../../../src/infrastructure/rule/index.js', () => ({ runRules: jest.fn() }))` | **同一个文件**（`SAME FILE: true`，且 `exists=true`） |

> 旧配置同样同址（`./ruleExecutor.js` ≡ `../../../src/services/ruleExecutor.js`），本次只是**成对**改到新址 —— 没有出现「只改一边」的失配。

### 7.2 双向验证（证明 mock **真的生效**，不是摆设）

| 方向 | 操作 | 预期 | 实测 |
|---|---|---|---|
| (a) **反向** | 删源文件后，把 I6 **临时改回旧路径** `'../../../src/services/ruleExecutor.js'` | 必须**响亮失败**（不得静默） | `exit=1`；`● Test suite failed to run`；`Configuration error: Could not locate module ../../../src/services/ruleExecutor.js mapped as: $1.`；`Tests: 0 total` ⇒ **mock 路径确实被 jest 立即解析**，非惰性摆设 |
| (b) **正向** | 恢复 I6 为新路径 | 8 例全绿 | `exit=0`；`Tests: 8 passed, 8 total` |

- 失败形态为 A 预判的 **(a) MODULE_NOT_FOUND 类（响亮）**，**不是** (b) 静默失配。
- 临时改动已**完整回滚**：文件 sha256 改前/改后一致（`af913d82597903f1c98e01177e6dd029550339f84b0c0562d238ab22c9cb4951`），且回滚后复跑 8/8 绿。
- 机制说明：`jest.unstable_mockModule` 以**解析后的模块路径**为键；I6 与 I3 解析到同一绝对路径 ⇒ mock 必然命中；而 (a) 证明该键确实参与解析（否则改回旧路径不会报错）。

---

## 8 给 Agent C 的验证指令（映射 A 的 §8 清单）

1. **锚点**：源文件已删，用 `git show c7dbd75:server/src/services/ruleExecutor.js | shasum -a 256` 重建，须 = `449d6db6…`（我已实测命中）。
2. **V2 静态判等**：请用**你自己的**脚本重做 §3（勿复用我的 `/tmp/slice-verify.cjs`）；判据 **0 块不等**。切片基准务必用**冻结树**，工作树已无源文件。
3. **V5 导出面**：`PORT=0 node --input-type=module -e "…import('./server/src/infrastructure/rule/index.js')…"` → 恰好 10 名（§2.1 逐字清单）。
4. **V6/V7 门禁**：`check-layers`（0 违规 / 未分层 **46**）、`arch-metrics`（PASS / GodFile **9** / 观察带 18）。
5. **V8 循环**：`cycle-check` SCC **0**；边数基线请以**改后 178** 为准（164 为改前值）。
6. **V9 绑定**：`bind-check` 违规 **0**（重点看 index.js 的 re-export 与 I4–I6 路径）。
7. **V10 硬指标**：0/0/0（本步不涉 `client/src`）。
8. **V11 全量回归**：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`；判据 = 日志 **4 处 `Test Suites:`** + `failed = 0`；**不得沿用旧用例数**（constraints §3-17）。
9. **V12 H1 专项**：可直接复算 §7.1 的 `path.resolve` 等式；若要做反向，请**在 /tmp 副本**里改，勿动工作树（我已做过且已回滚）。
10. **V3/V4 行为对拍与变异反证**：按 A 的 §4.3；注意「两个独立 node 进程 + 夹具同源 + 装置自检 + 变异必须报差异」。
11. **建议补充（本轮新发现的偏差点）**：核对 §4 D1 的 6 个补齐绑定（`fs`/`countMatches`/`collectFiles`/`resolveWithinRoot`/`globToRegExp`/`errorSummary`）—— 这是 A 方案与落地件的**唯一实质差异**，值得独立复核「是否确实必需」（我的依据是引用扫描 + 149 例全绿）。
12. **越界自查**：`docs/pipeline/project-constraints.md` 的 `M` **不是本步产物**（§1.3），请勿计入 B 的改动面。

---

## 9 局限声明（诚实边界）

1. **未跑全量回归**（C 的职责）；本文的测试结论只覆盖 5 个定向套件 149 例。
2. **未跑 A 的 F01–F20 行为对拍与变异反证**（§4.3③/④，C 的职责）；本步用的是**静态逐块判等**（§3）——它能覆盖 Z6/Z7 这类夹具不可达分支，但**不等于**运行时行为等价的完整证明。
3. **未审计 `factExtractor.js` / `factExtractors/*` / `utils/logger.js` 的层归属**：它们是本步的 unlayered 邻居，T6/T7/T8 依赖它们；若后续步骤迁它们的层，本步的相对路径需同步调整（A 已登记为既有技术债）。
4. **中途态读数**（79 文件 / 183 边 / 47 未分层）是「8 新文件已建、源文件未删」时的真实门禁输出，仅作过程证据；最终判据以 §5 的**改后**读数为准。
5. 报告中的**行数/哈希/计数全部由我在本轮实测**（自建脚本见 §3 方法与 §5.2 边集对拍），未照抄 A 的预估；与 A 预估的偏差已逐处标明。
