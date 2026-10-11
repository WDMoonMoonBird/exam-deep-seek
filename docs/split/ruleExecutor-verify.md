# ruleExecutor 拆分验证报告（GodFile 拆分专项 · step 1 · Agent C 独立验证）

- **step**: 1（ruleExecutor 首刀）｜ **phase**: C（独立验证 + 对抗性证伪）｜ **日期**: 2026-10-11
- **验证者**: Agent C ｜ **会话 ID**: `0ebcecf2-2669-4485-b2a6-0f106f1a65b2` ｜ **技能**: `tech-test-automation`
- **被验对象**: `server/src/services/ruleExecutor.js` → 8 文件（3 domain + 5 infrastructure）
- **被验锚点**: `HEAD = c7dbd754be3387ea1ff68d3e86782d36377a3447`（= `c7dbd75`）；目标文件**未提交**（工作树态），源文件已 `D`
- **基准冻结**: `git show HEAD:server/src/services/ruleExecutor.js` → sha256 `449d6db663bc22a1cc435d0d33248bd9bbcdf205fb529aac0833cf1880965155`（**自证通过**，与 A/B 锚点逐字相同）
- **立场声明**: **不采信 B 的自测**。V2 切片判等、V7 行为对拍、装置自检、变异反证、门禁证伪**全部为本轮自建脚本/自建夹具**（B 的 `/tmp/slice-verify.cjs` 未被读取或复用）。
- **只读边界**: 仓库内**只新增本文件**；其余一切临时树、脚本、夹具均在 `/tmp/vc/`。未执行任何 git 写操作。

## 0 判据总表（期望 vs 实测 vs 结论）

| # | 验证项 | 期望判据 | 实测 | 结论 |
|---|---|---|---|---|
| V1 | 后端全量回归 | 4 处 `Test Suites:` 摘要 + `failed = 0` | 4 处（65/1/1/1 套件）；974+17+61+21 全 passed；**0 failed** | ✅ |
| V2 | 静态逐块等价 | 33 函数 + 8 声明 + index 块，**0 块不等** | 43/43 块 sha256 相等；反向解析**多余/缺失字节 = 0** | ✅ |
| V2b | 9 个 `export` 声明行 | 恰好 9 个且源文件本来就有 | 目标 9 个，名字集与源**完全相同** | ✅ |
| V2c | 死代码三块逐字保留 | 哈希相等 | `nodeRequire`/`getVueParser`/`checkSyntaxOfFile` 三块哈希相等 | ✅ |
| V3 | A 遗漏的 6 个绑定是否必需 | 逐条裁定，**必需 / 冗余** | **6/6 必需**（5 处响亮 ReferenceError，1 处 `fs` 为**静默**行为变更） | ✅（附 1 条措辞纠正） |
| V3b | index.js 再导出补 1 条 import | 缺失则 ESM 报错 | `SyntaxError: Export 'resolveProjectRoot' is not defined in module` | ✅ |
| V4 | 门禁证伪（三条反向陷阱 + 3 追加） | 必须报违规且非零退出 | 6/6 全部抓到（exit=1）；对照组 0 违规 exit=0 | ✅ 门禁有牙 |
| V5 | 对外导出面 | 恰好 10 个名字 | 10 个，且与改前**逐字相等** | ✅ |
| V6 | 五项门禁 | 见下 | 违规 0 / 未分层 **46** / GodFile **9** / SCC **0** / 0-0-0 / bind 0 | ✅ |
| V7 | 行为对拍 | 逐字节相等 | **120 例 / 0 例不等**；装置自检 + 变异反证均通过 | ✅ |
| V8 | 改动面 | 8 新 + 7 改（各 1 行）+ 1 删 | 完全命中；`client/`/`tests/`/`client/dist`/`scripts/gates/`/`server/package.json` 未触碰 | ✅ |

**最终结论：PASS —— 本步无需回流 B。**（缺陷仅 3 条「轻微」，其中 2 条是 A/B **报告措辞**层面的，不影响产物正确性，见 §9）

## 1 V1 主判据 · 后端全量回归

### 1.1 命令与轮次说明（**偏离声明**）

任务书写 `ROUND=01`，但 `docs/pipeline/test-round-01.log` **已存在且非空**（round 00–03/05–07 已占用），`unblock-g2.sh:14-19` 的归档保护会直接 `exit 4` 拒绝执行（该纪律本身正确，不许覆盖归档）。
故本轮取**首个空闲序号 08**：

```bash
ROUND=08 bash docs/pipeline/scripts/unblock-g2.sh    # exit 0；日志 docs/pipeline/test-round-08.log
```

### 1.2 原始输出（脚本回显摘要）

```
→ 测试库: localhost:3306/exam_system_test
✓ 端口可达
✓ schema 对齐
→ 退出码: 0 ｜ 完整日志: docs/pipeline/test-round-08.log
── 基线摘要 ──
   Test Suites: 65 passed, 65 total    Tests: 974 passed, 974 total    Time: 177.476 s
   Test Suites:  1 passed,  1 total    Tests:  17 passed,  17 total    Time: 0.493 s
   Test Suites:  1 passed,  1 total    Tests:  61 passed,  61 total    Time: 0.515 s
   Test Suites:  1 passed,  1 total    Tests:  21 passed,  21 total    Time: 0.779 s
```

### 1.3 判据复核（从日志原文取，不信控制台回显）

```bash
grep -c '^Test Suites:' docs/pipeline/test-round-08.log      # => 4
grep -n '^Test Suites:' docs/pipeline/test-round-08.log      # => 1326 / 1366 / 1455 / 1503
grep -n '^Tests:'       docs/pipeline/test-round-08.log      # => 974 / 17 / 61 / 21，全部 passed，无 failed
grep -c '^FAIL'         docs/pipeline/test-round-08.log      # => 0
```

- **四段分布**：段1 = 65 套件 / **974** 例 ｜ 段2 `fact-extractor` = 1 / **17** ｜ 段3 `rule-executor` = 1 / **61** ｜ 段4 `rule-mutator` = 1 / **21**
- **合计 68 套件 / 1073 例 / 0 failed**（与 constraints §4 给的 round 7 参考值 974+17+61+21 一致；本步不新增用例，属预期）
- 日志中出现的 `failed` 字样仅为 pino 业务日志（Prisma P2025 / fetch failed 降级），**非 jest 用例失败**；`^FAIL` 套件行 = 0。
- 旁证：`pretest` 阶段门禁原文 `文件 78 个，违规 0 条（0 类规则），未分层待迁移 46 个` —— 与 §6 的 check-layers 独立吻合。

## 2 V2 静态等价性（★本步核心 · 自建切片判等）

### 2.1 方法（**与 B 不同**）

B 的方式是「自己给人读的 43 行区间 + 字节子串定位」。我的方式是**用真实 JS 解析器独立重建区间**，再用三重合取证明：

1. **区间自建**：`tree-sitter-javascript` 解析冻结树 → 取 `program` 全部非注释顶层节点（52 个 = 10 import + 1 再导出 + 41 声明），把**紧邻其上的连续注释行**（严格相邻，不跨空行）并入同一切片（即「JSDoc + 声明」）。
2. **正向判等**：每块切片对 8 个目标文件全文做精确字节包含检测，命中数必须 = 1 且哈希相等。
3. **反向判等（B 没做）**：对每个目标文件做**贪心线性解析** —— 逐字节只允许被「banner / import 行 / `export {}` 行 / 源切片 / 空白」消费；**剩余未匹配字节必须为 0**。这一步才能排除「切片搬对了、但旁边多塞/少塞了东西」。

```bash
node /tmp/vc/v2b.mjs     # 正向：43 块逐个 sha256
node /tmp/vc/v2c.mjs     # 反向：8 文件逐字节消费 + export 审计 + 死代码
```

**基线自证**：`frozen sha256 = 449d6db663bc22a1cc435d0d33248bd9bbcdf205fb529aac0833cf1880965155`；`wc -l = 1010`。
**切片构成自证**：`header 1 + re-export 1 + const 6 + const(export) 2 + fn 26 + fn(export) 7 = 43` → **函数 33（26+7）+ 常量 8（6+2）+ 头部 1 + 再导出 1 = 43** ✔（与任务书「33 函数 + 8 顶层声明 + index 块」逐项对齐）

### 2.2 43 块切片判等表（sha256 全部由我本轮独立计算）

| # | 符号 | 形态 | 源行（冻结树） | 字节 | 源切片 sha256（自算） | 落在 | 命中 | 判等 |
|---|---|---|---|---|---|---|---|---|
| 1 | `FILE-HEADER-JSDOC` | header | 1-14 | 486 | `acf3dad286a2c0271bd0baf9756258d3d5ddc245c99ee4a20ec9feefbea67e0e` | index.js | 1 | ✅ |
| 2 | `LOCAL-REEXPORT(resolveProjectRoot)` | re-export | 27-29 | 177 | `323ebff7debad73079fca3a25e53798279ca0c90d7b7d88de508cffc9cd2052f` | index.js | 1 | ✅ |
| 3 | `nodeRequire` | const | 31-33 | 187 | `94dc55a4a2e5aa4ae619e761856b8a630bd04a7cdc673b9e134699fc01dddbf4` | syntax.js | 1 | ✅ |
| 4 | `RULE_TYPES` | const(export) | 37-54 | 499 | `17855f7684c839205ba5899efdb6e53978a65a9c9331f95664119f8d37f875ff` | constants.js | 1 | ✅ |
| 5 | `SKIP_DIRS` | const | 56-59 | 147 | `e41864af3c07174c3658b851fbe7b1cbd53e4445517051bc4e1320df89cbc929` | constants.js | 1 | ✅ |
| 6 | `CHECKABLE_EXTS` | const | 61-66 | 243 | `dcfad88677f8ed9af758c7f5870e515f0a872ed66aa3d4d797f01306788259b9` | constants.js | 1 | ✅ |
| 7 | `FACT_OPS` | const(export) | 68-69 | 133 | `ac8883e3abbb81694a9b937de054e1ed53c23b640592df0a6b69817ca0bc4964` | constants.js | 1 | ✅ |
| 8 | `FACT_LABELS` | const | 71-118 | 1289 | `7f98fe4f9fde4511599e0df584211befe655b27491c95ed5f7357c8c50134f81` | constants.js | 1 | ✅ |
| 9 | `INVERSE_OPS` | const | 120-121 | 132 | `ebe4aa056ad7d617ee6bd2c71c7280d0914ab15a8e6e422f9a4c54bbecd650b1` | constants.js | 1 | ✅ |
| 10 | `ERROR_SUMMARY_LEN` | const | 123-124 | 50 | `b6e6bcb39153c9cca9b6ee6de379cefa2d571472bd47cb73866c52aa0d599333` | constants.js | 1 | ✅ |
| 11 | `clampScore` | fn | 128-137 | 281 | `701f6ed1cec041482f22ced76965bed76409976525b2c3f72b3a13ab21274e54` | evaluators.js | 1 | ✅ |
| 12 | `extOf` | fn(export) | 139-149 | 268 | `578a19940597d2cdfd1acf6f29e41f2643a7ede18bf129196fc5567b97272142` | file-access.js | 1 | ✅ |
| 13 | `globToRegExp` | fn(export) | 151-161 | 388 | `1ba7d98c4f05e9e94d1f2166626d6dc8e560df4e0367d4cd5e64ab0b3d1d2d03` | evaluators.js | 1 | ✅ |
| 14 | `collectFiles` | fn(export) | 163-190 | 635 | `a304cb1fd26070f3800281e375ade3ec6863f83fa6241823c19af09fc5d6d1f0` | file-access.js | 1 | ✅ |
| 15 | `resolveWithinRoot` | fn(export) | 192-205 | 572 | `a314e978c5ee7ffb550892240f0b94a88ef723f30ecfb31f0209201156d13622` | file-access.js | 1 | ✅ |
| 16 | `readFileUtf8` | fn(export) | 207-219 | 403 | `b82cfa30a632e50d09523902d287676b6cdc74f3ece2411364f3687d512b7321` | file-access.js | 1 | ✅ |
| 17 | `countMatches` | fn | 221-235 | 378 | `b03a2bda8ea3afd146785e7e7c105c522592945ed8e420028b01fe43710edfd7` | evaluators.js | 1 | ✅ |
| 18 | `extractVueScriptWithOffset` | fn | 237-248 | 445 | `fbfe46cb64252f93cc0a071cf3ef707e8f20021600b6cc32e1019498d5d4f3cc` | evaluators.js | 1 | ✅ |
| 19 | `lineNumberOf` | fn | 250-263 | 359 | `06cf713bea76f0effc1fd67472979c1b60dddbade5f14b238816dc8b667a8c88` | evaluators.js | 1 | ✅ |
| 20 | `errorSummary` | fn | 265-275 | 452 | `c1d3507dad3b5e5772dd0ac6c16f5b0c5809201d2400667e501c6f0d9e60cff6` | evaluators.js | 1 | ✅ |
| 21 | `execFileExists` | fn | 279-299 | 712 | `9bf30d528d940cdd61358f41aea78779b5eff402bc955bd2aea9150f5e3cb888` | executors.js | 1 | ✅ |
| 22 | `execDirContainsFile` | fn | 301-327 | 1121 | `0ece08549a5c4841e4cc461bb052bd3f2cde36344e86951c4594279b1eff5bcc` | executors.js | 1 | ✅ |
| 23 | `execContainsText` | fn | 329-347 | 838 | `d9abab7eb53a630e3a17ff8afb26c2c55c5ef3b460edcb35a52ab9e23ece3b24` | executors.js | 1 | ✅ |
| 24 | `execCountRegex` | fn | 349-376 | 1302 | `8ebbedd144db7640f5e9bfde3428e23958e5d519a248c2c2f60e75d88537ae59` | executors.js | 1 | ✅ |
| 25 | `execContainsRegex` | fn | 378-401 | 992 | `88abe0a8268d2a8d95e14357607316dfc9838b8917bc85ca1ce8cc3d2a7db5e3` | executors.js | 1 | ✅ |
| 26 | `execFileCountInDir` | fn | 403-431 | 1192 | `b66cae9e0338c6cf62ca9eba0547a4f061bcb4b9e81f649a813c3733e0c5134e` | executors.js | 1 | ✅ |
| 27 | `getJSParser` | fn | 435-443 | 192 | `70862e76cd83830ab5244290062ed9f577d3f829f0d427b02be7882ec2092079` | syntax.js | 1 | ✅ |
| 28 | `getVueParser` | fn | 445-452 | 222 | `5ea5643a7066b0f247d39b338f6c2da895ad7725c989c566b832dbfeb6e85322` | syntax.js | 1 | ✅ |
| 29 | `collectSyntaxErrors` | fn | 454-474 | 592 | `665a6ecba094842e35452c3e84ab141b7dde3257e7a18fe61c7786c5cb7a56d4` | syntax.js | 1 | ✅ |
| 30 | `describeSyntaxErrors` | fn | 476-490 | 399 | `a0f8329069b20d516193001b5a3e2e6427b58eb2d0b14de4aca8b842b629a065` | syntax.js | 1 | ✅ |
| 31 | `checkSyntaxOfFile` | fn | 492-529 | 1607 | `7db6bd1ffb88f64b970c9fe7468b2bd5130f029c59e975d075c0df9b1b88fa27` | syntax.js | 1 | ✅ |
| 32 | `execSyntaxCheck` | fn | 531-564 | 1321 | `48669ab03a12f3f43f610dbed95dfb1e40e356d5c8da720682a6240bdbd4509d` | syntax.js | 1 | ✅ |
| 33 | `factValueText` | fn | 568-577 | 260 | `bd0541c10021a7311d1ba768f83280428e5c7b15aa4950c5355381dfa24e59d1` | evaluators.js | 1 | ✅ |
| 34 | `execFact` | fn | 579-634 | 2253 | `78a3d185afcd5c5b1652149a54b79056c80b29318dd2ccdbd20989a5e84dca76` | evaluators.js | 1 | ✅ |
| 35 | `parserForFile` | fn | 638-659 | 829 | `ab4ff49633746b7065b9a69f68aa2b151dfa03dfdc58cbe59fd40180c6ba461f` | syntax.js | 1 | ✅ |
| 36 | `countAstPatternMatches` | fn | 661-692 | 1014 | `6bd00c83facd3bdc634efaf8637266c7d342de61fd5760bc7c17a38b895275fa` | syntax.js | 1 | ✅ |
| 37 | `execAstPattern` | fn | 694-724 | 1364 | `a55b65ec25e5faf6a389e2ccae18998f961ffb6fc0f4b3251732517454cb04c4` | syntax.js | 1 | ✅ |
| 38 | `execCountImports` | fn | 726-759 | 1479 | `bfffe889e8c76e5df5548d3c40e2fdbc116c00d4003b84b03ebd224ed9c254c4` | executors.js | 1 | ✅ |
| 39 | `execNormalizedText` | fn | 761-776 | 773 | `f3bf8a01f478a70ea7c46d36043a391e18376309c81a0747c72fee48f9ed3de7` | executors.js | 1 | ✅ |
| 40 | `executeItem` | fn | 778-814 | 1374 | `fbf5d6c0756963719dd1dc4461e2ca79ed376e5fdd036a3ef1c8a870ccafd960` | executor.js | 1 | ✅ |
| 41 | `buildGroupSummary` | fn | 816-831 | 565 | `41bf639308c44be16dcecf269db6e37c92239e171a8b1c3401d43a565b7221b3` | evaluators.js | 1 | ✅ |
| 42 | `validateRules` | fn(export) | 835-928 | 3998 | `4b28d1b72d5213d277faab354d8c1430bddee6fde7a8de54cc5db81d5518da8b` | validate.js | 1 | ✅ |
| 43 | `runRules` | fn(export) | 930-1010 | 2388 | `45ad4031dab3bfa9b791fbd827b0871a5fe41632f01bf0a4a8bea9d31abb5af7` | executor.js | 1 | ✅ |

**判等结果：43 块 / 0 块不等**（每块命中数恰为 1，无重复、无缺失）。

### 2.3 反向校验（多余 / 缺失 = 0）

```
OK    domain/services/rule/constants.js   bytes= 2719  units= 2493 (7 slices)  banner=127 imports=0   exportLines=82  ws=17  OTHER=0
OK    domain/services/rule/evaluators.js  bytes= 5746  units= 5381 (9 slices)  banner=129 imports=77  exportLines=136 ws=23  OTHER=0
OK    domain/services/rule/validate.js    bytes= 4184  units= 3998 (1 slices)  banner=127 imports=54  exportLines=0   ws=5   OTHER=0
OK    infrastructure/rule/file-access.js  bytes= 2143  units= 1878 (4 slices)  banner=130 imports=122 exportLines=0   ws=13  OTHER=0
OK    infrastructure/rule/executors.js    bytes= 8940  units= 8409 (8 slices)  banner=128 imports=221 exportLines=158 ws=24  OTHER=0
OK    infrastructure/rule/syntax.js       bytes= 8704  units= 7727 (10 slices) banner=124 imports=647 exportLines=171 ws=35  OTHER=0
OK    infrastructure/rule/executor.js     bytes= 4512  units= 3762 (2 slices)  banner=128 imports=609 exportLines=0   ws=13  OTHER=0
OK    infrastructure/rule/index.js        bytes= 1225  units=  663 (2 slices)  banner=121 imports=77  exportLines=351 ws=13  OTHER=0
V2-C verdict: total unmatched bytes = 0 => NO extra/dropped code anywhere
slices never matched: 0 []      slices matched != 1 time: 0 []
```

→ **8 个目标文件的每一个非空白字节**，要么是 banner/import/export 行，要么是某个源切片的逐字副本。**不存在「顺手改一行」「顺手删一行」「重复搬一块」的空间**。

### 2.4 `export` 声明行审计（切片判等成立的前提）

```
domain/services/rule/constants.js    decl-line exports=2  (RULE_TYPES@L10, FACT_OPS@L38)
domain/services/rule/evaluators.js   decl-line exports=1  (globToRegExp@L25)
domain/services/rule/validate.js     decl-line exports=1  (validateRules@L22)
infrastructure/rule/file-access.js   decl-line exports=4  (extOf@L15, collectFiles@L27, resolveWithinRoot@L58, readFileUtf8@L71)
infrastructure/rule/executors.js     decl-line exports=0
infrastructure/rule/syntax.js        decl-line exports=0
infrastructure/rule/executor.js      decl-line exports=1  (runRules@L72)
infrastructure/rule/index.js         decl-line exports=0
target decl lines starting with export = 9 (expected 9)
source decl lines starting with export = 9 [RULE_TYPES,FACT_OPS,extOf,globToRegExp,collectFiles,resolveWithinRoot,readFileUtf8,validateRules,runRules]
exported-decl name sets identical (source vs target): true
```

→ B 的说法**成立**：9 个 `export` 全在**声明行**，且这 9 个在源文件里本来就带 `export`；其余 32 个声明一律走文件尾 `export { … };` 块（故切片可逐字相等）。
→ 额外查了 bind-check 的已知盲区：8 个文件的 `export *` 出现次数**均为 0**。

### 2.5 死代码三块（逐字保留）

| 单元 | 源行 | 自算 sha256 | 结论 |
|---|---|---|---|
| `nodeRequire`（零消费死变量 + 2 行说明注释） | 31–33 | `94dc55a4a2e5aa4ae619e761856b8a630bd04a7cdc673b9e134699fc01dddbf4` | ✅ 逐字保留（`grep -c nodeRequire syntax.js` = **1**，确认仍是死变量、未被顺手用上或删除） |
| `getVueParser`（恒 `return null`，ABI 回退史注释在位） | 445–452 | `5ea5643a7066b0f247d39b338f6c2da895ad7725c989c566b832dbfeb6e85322` | ✅ 逐字保留（`return null` 在位） |
| `checkSyntaxOfFile`（含因上者而**不可达**的真值分支 511–515） | 492–529 | `7db6bd1ffb88f64b970c9fe7468b2bd5130f029c59e975d075c0df9b1b88fa27` | ✅ 整块哈希相等 ⇒ 不可达分支原样在位 |

## 3 ★V3 独立复核 B 对 A 的纠正 —— 六个绑定逐条裁定

### 3.1 先复核「A 是否真的漏了」

逐字重读 A 的 `ruleExecutor-plan.md` §2.4（不是听 B 转述）：

| 目标文件 | A 给的 import | 实际需要的绑定（按目标文件内**非注释代码**引用） | 缺 |
|---|---|---|---|
| T5 `executors.js` | `path` / `globToRegExp` / `collectFiles,readFileUtf8,resolveWithinRoot` | 另需 `fs`（L24-25 `fs.existsSync/statSync`）、`countMatches`（L98） | **2** |
| T6 `syntax.js` | `fs,path,createRequire,Parser,JS,java,python,logger,CHECKABLE_EXTS` / `errorSummary,extractVueScriptWithOffset,lineNumberOf` / `extOf,readFileUtf8` | 另需 `globToRegExp`（L134）、`collectFiles`（L135）、`resolveWithinRoot`（L132） | **3** |
| T7 `executor.js` | `extractFacts` / `resolveProjectRoot` / `logger` / `buildGroupSummary,clampScore,execFact` / `validateRules` / `syntax` / `executors` | 另需 `errorSummary`（L94） | **1** |

→ **A 的 §2.4 确实漏了 6 个绑定，B 的 D1 事实认定成立。**

### 3.2 裁定方法（在 /tmp 冻结副本里逐条移除 + 真跑）

对每个绑定**单独**复制一份 `/tmp/vc/after` 树 → 只删该绑定 → `node --check` + 真 import + 打靶探针。**不做静态推断代替运行**。

```bash
node /tmp/vc/build-variants.mjs     # 生成 7 个变体（含 1 个只打桩、不删绑定的对照组）
node /tmp/vc/run-variants.mjs       # 逐个 node --check + 真跑探针
```

### 3.3 逐条裁定表（原始输出）

| 绑定 | 宿主文件 | `node --check` | 移除后**真实运行**结果 | 裁定 |
|---|---|---|---|---|
| `fs` | `executors.js` | **pass** | ⚠️ **不抛错**：`file_exists` 命中项 evidence 由 `存在 src/main.js`（10 分）变 `无法访问 src/main.js`（**0 分**）—— ReferenceError 被该函数**自带的 try/catch 吞掉** | **必需（静默行为变更）** |
| `countMatches` | `executors.js` | pass | `ReferenceError: countMatches is not defined`（`count_regex` 调用即炸） | **必需** |
| `globToRegExp` | `syntax.js` | pass | `ReferenceError: globToRegExp is not defined`（`syntax_check`） | **必需** |
| `collectFiles` | `syntax.js` | pass | `ReferenceError: collectFiles is not defined`（`syntax_check`） | **必需** |
| `resolveWithinRoot` | `syntax.js` | pass | `ReferenceError: resolveWithinRoot is not defined`（`syntax_check`） | **必需** |
| `errorSummary` | `executor.js` | pass | `ReferenceError: errorSummary is not defined`（**Z6 强制分支**，见 §3.4） | **必需** |
| （追加）`errorSummary` | `syntax.js` L93 | pass | `ReferenceError: errorSummary is not defined`（`syntax_check` 打 `chmod 000` 文件时） | **必需（第二调用点）** |
| （追加）`resolveProjectRoot` **本地 import** | `index.js` | **FAILED** | `SyntaxError: Export 'resolveProjectRoot' is not defined in module`（import 阶段即炸；`node --check` 也报同一错） | **必需（D2 成立）** |

**没有一条是「冗余」：6/6 必需。** B 的 D1 结论正确。

### 3.4 Z6 分支怎么被真跑到的（方法披露，不假装）

`runRules` 的 facts 提取失败分支（`:970-977`，A 的 Z6/Z7）**在公共 API 下确实不可达** —— 我先独立验证了这一点（A 的结论成立）：

```
root=/tmp/vc/definitely-not-exist-xyz  => ok, 路由数量 0 >= 0   （不抛错）
root=/tmp/vc/fixtures/empty            => ok, 路由数量 0 >= 0
root=/tmp/vc/fixtures/plainfile.js     => ok, 路由数量 0 >= 0
```

但**不等于只能靠切片判等**。我把**上游依赖 `extractFacts` 换成抛错桩**（改的是 /tmp 副本的依赖，不是被测逻辑），改前树与改后树**同一打桩**：

```
before(ruleExecutor.js + 桩) : evidence = 事实提取失败：BOOM-forced-facts-failure, score = 0
after (index.js + 桩)       : evidence = 事实提取失败：BOOM-forced-facts-failure, score = 0
byte-identical (ignoring mod label): true | full cmp: true
```

→ **Z6/Z7 的 `:972` 调用点拿到了真实行为对拍（逐字节相等），而不是仅靠切片判等。** 对照组（只打桩、不删绑定）也复现同一 evidence，证明该探针确实打到了目标分支。
→ `errorSummary` 的 `:506` 调用点则由 `chmod 000` 夹具覆盖（探针 `syntax_check(dir=src, pattern=locked.js)` → `语法错误：src/locked.js —— EACCES: permission denied, open '…'`），两树逐字节相同。

## 4 ★V4 对抗性：分层门禁是否真有牙（三条反向陷阱 + 3 条追加）

装置：把**真实门禁脚本** `server/scripts/check-layers.mjs` 与整个 `server/src` 复制到 `/tmp/vc/gatecopy`（不进仓库），在副本里**故意制造错层**后真跑。

```bash
node /tmp/vc/gate-falsify.mjs
```

| # | 故意制造的违规 | 期望 | 实测 |
|---|---|---|---|
| G0 | **对照组**（未改动副本） | 0 违规 / exit 0 | `文件 78 个，违规 0 条，未分层待迁移 46 个` / **exit=0** |
| G1 | domain 文件 import **node 内置**（陷阱①变体） | `domain-imports-external` ≥1 / exit 1 | `domain/services/rule/constants.js → node:fs [domain-imports-external]` / **exit=1** |
| G2 | domain 文件 import **domain 之外相对路径**（陷阱②） | `domain-imports-outside` / exit 1 | `domain/services/rule/evaluators.js → ../../../services/factExtractors/common.js [domain-imports-outside]` / **exit=1** |
| G3 | **infrastructure → application**（陷阱③） | `infrastructure-imports-upper` / exit 1 | `infrastructure/rule/executor.js → ../../application/rule/useCase.js [infrastructure-imports-upper]` / **exit=1** |
| G4 | （追加）application → infrastructure | `application-imports-infra` / exit 1 | 命中 / **exit=1** |
| G5 | （追加）interface → infrastructure | `interface-imports-infra` / exit 1 | 命中 / **exit=1** |
| G6 | domain 文件 import npm 包 `express` | `domain-imports-external` / exit 1 | `domain/services/rule/validate.js → express [domain-imports-external]` / **exit=1** |

→ **证伪失败（即门禁为真）：6/6 全部报违规且非零退出，对照组干净。分层门禁有真实分辨力，本步的「未分层 46 / 违规 0」不是门禁失灵导致的假绿。**

## 5 V5 导出面与绑定门禁

```bash
PORT=0 node --input-type=module -e "const m=await import('./server/src/infrastructure/rule/index.js');console.log(Object.keys(m).sort())"
```

```
改后 : [FACT_OPS, RULE_TYPES, collectFiles, extOf, globToRegExp, readFileUtf8, resolveProjectRoot, resolveWithinRoot, runRules, validateRules]  count = 10
改前 : [FACT_OPS, RULE_TYPES, collectFiles, extOf, globToRegExp, readFileUtf8, resolveProjectRoot, resolveWithinRoot, runRules, validateRules]  count = 10
```

→ **恰好 10 个名字，且改前/改后逐字相等**（真 import 一次 + `Object.keys` 取，未读源码数数）。
→ `bind-check`：违规 **0**；`unresolved relative imports = 4`、`external refs = 1` —— 与改前基线**完全一致**（改前 4/1，改后 4/1），未新增任何悬空绑定。

## 6 V6 五项门禁复算（含**我自测的改前基线**）

方法：改后 = 活工作树；改前 = `git archive HEAD server` 导出的冻结树（并把门禁脚本一并复制进去真跑）——**不引用 A/B 报的旧数字**。

| 门禁 | 改前（我自测） | 改后（活树） | 判据 | 结论 |
|---|---|---|---|---|
| `check-layers.mjs` | 文件 71 / 违规 0 / **未分层 47** | 文件 78 / 违规 0 / **未分层 46** | 违规 0 且未分层**下降** | ✅ ▼1 |
| `arch-metrics.mjs` | `unmigrated 47`、`godfileOver800 10`（基线值）、观察带 19 | **PASS**：`layerViolations 0/0`、`unmigrated 47→46`、`godfileOver800 10→9`、观察带 `19→18` | PASS + GodFile 9 | ✅ |
| `cycle-check.mjs` | 71 文件 / **164 边** / SCC 0 / 自环 0 | 78 文件 / **178 边** / **SCC 0** / 自环 0 | SCC=0 | ✅（边数基线以 **178** 为准） |
| `hard-metrics.mjs` | （只扫 `client/src`，本步未触碰） | `hex6 0 / important 0 / modalConfirm 0` **PASS** | 0/0/0 | ✅ |
| `bind-check.mjs` | 169 模块 / 512 绑定 / 未解析 4 / external 1 / 违规 0 | 176 模块 / 558 绑定 / 未解析 **4** / external **1** / **违规 0** | 违规 0；unresolved 与基线一致 | ✅ |

原始输出（改后，节选）：

```
$ node server/scripts/check-layers.mjs
文件 78 个，违规 0 条（0 类规则），未分层待迁移 46 个            exit=0

$ node scripts/gates/arch-metrics.mjs
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47 实测=46
  ✓ godfileOver800     基线=10 实测=9
  · >500 行（观察带，不计判据） 基线=19 实测=18
  GodFile >800 行：…（列表已无 ruleExecutor.js）
结论：PASS     exit=0

$ node scripts/gates/cycle-check.mjs
  扫描 78 文件 / 178 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 1）   自环: 0    结论：PASS    exit=0

$ node scripts/gates/hard-metrics.mjs
  ✓ hex6 0 / ✓ important 0 / ✓ modalConfirm 0    结论：PASS    exit=0

$ node scripts/gates/bind-check.mjs
  modules scanned 176 / bindings 558 / unresolved 4 / external 1 / BINDING VIOLATIONS: 0    exit=0
```

**GodFile 的独立复算**（不依赖门禁自身）：

```
$ find server/src client/src \( -name '*.js' -o -name '*.vue' \) | xargs wc -l | awk '$1>800'
  1519 client/src/views/student/Submit.vue       1338 server/src/controllers/teacherController.js
  1280 server/src/services/checkerService.js     1106 client/src/views/Doc.vue
  1051 server/src/services/deepseek.js            988 client/src/views/teacher/ReviewDetail.vue
   983 client/src/views/teacher/QuestionEdit.vue   965 server/src/controllers/reviewController.js
   868 client/src/views/teacher/ProjectQuestionEdit.vue
count>800 = 9      count>500 = 18      ruleExecutor.js 存在数 = 0
```

→ **10 → 9**、观察带 **19 → 18**、`ruleExecutor.js (1010)` 已从名单消失，三项互相吻合。
（口径诚实说明：`git archive HEAD server` 冻结副本只含 `server/`，故其 arch-metrics 的 GodFile 绝对值 = 5（server 侧），与活树 9（含 client 侧 4 个）不可直接相减；结论依据是**活树门禁自身基线 10 → 实测 9** 与我**自建 wc -l 复算 = 9** 的双重吻合。）

## 7 V7 行为对拍（独立实现 · 改前 vs 改后）

### 7.1 装置

- **改前树** = `git archive HEAD server` → `/tmp/vc/before`（`ruleExecutor.js` sha256 复核 = `449d6db6…`）
- **改后树** = 活树 `server/src` 复制到 `/tmp/vc/after`（源文件已删，符合工作树态）
- **夹具** `/tmp/vc/fixtures`：我自建的 8 个工程（basic / nested / java / py / ast / empty / plainfile / outside-secret），含 `chmod 000` 文件、`node_modules`/`.git`/`dist`/隐藏项、`.vue`（合法 / 语法错 / 无 `<script>`）、畸形 JS（ERROR 与 isMissing 两类）、越界路径等
- **两条纪律**：① 同一夹具集被两侧复用；② **每个模块各起一个独立 node 进程**（`PORT=0`），结果**写文件**而非 stdout（避免 pino NDJSON 干扰），只比 JSON 字节

```bash
PORT=0 node /tmp/vc/run.mjs /tmp/vc/before/server/src/services/ruleExecutor.js /tmp/vc/fixtures out/before1.json
PORT=0 node /tmp/vc/run.mjs /tmp/vc/before/server/src/services/ruleExecutor.js /tmp/vc/fixtures out/before2.json   # 装置自检
PORT=0 node /tmp/vc/run.mjs /tmp/vc/after/server/src/infrastructure/rule/index.js  /tmp/vc/fixtures out/after1.json
cmp out/before1.json out/before2.json   # SELF-CHECK: identical
cmp out/before1.json out/after1.json    # 仅 MOD 字段（模块 basename）不同；R 内容逐字段比对
```

### 7.2 结果

```
cases: 120 | key sets equal: true | differing: 0
CASES: 120 -> out/after1.json
```

→ **120 例（11 种 `rule_type` 全覆盖 + 5 个导出辅助函数直调 + `validateRules` 26 组矩阵 + 确定性 / 分组 / 钳制）全部逐字节相等，0 例不等。**

覆盖到的关键分支举例：`不支持解析该文件类型：txt` / `无法读取 src：EISDIR` / `无法读取 src/locked.js：EACCES` / `未找到可检查的源码文件（模式：*.js）`（`readdirSync` ENOTDIR 分支）/ `路由数量 3 < 99`（INVERSE_OPS）/ `事实字段不存在：…` / `partial` 按比例 8 分 / `syntax_check` 的 ERROR 与 vue 行号映射 / `dir='..'` 与绝对路径越界。

### 7.3 反证（防「恒等装置」）

**① 装置自检**：`before` 跑两次 → `cmp` 相等（sha256 `2c58e6f3…` 两次一致）✔

**② 真在跑 tree-sitter（防静默回退）**：探针日志出现 `src/bad.js` 第 1 行语法错误、`src/BadVue.vue` 第 3 行语法错误 —— 解析器真的产出了 ERROR 节点 ✔

**③ 变异反证**：在改后副本注入 3 处变异（`存在 ` → `存在X `；`：` → `::`；`INVERSE_OPS[op]` → `?`）→

```
MUTATION COUNTER-TEST: differing cases = 7 of 120
  affected: R-01-all-11-types, R-03-nested-root, R-07-groupSummary, E-01-file_exists-ok, E-35-syntax_check-bad-js, E-36-syntax_check-vue, E-58-fact-routes-ge99
  => harness HAS discriminating power
```

**④ 静默变异反证（针对 V3 的 `fs`）**：删掉 `executors.js` 的 `fs` 绑定（**不抛异常**的变异）→ 全量电池仍抓到 **8 例差异**（`存在 src/main.js` / 10 分 → `无法访问 src/main.js` / 0 分）✔ 装置对「静默错分」同样敏感。

## 8 V8 改动面与旁证

```
$ git status --porcelain -uno
 M docs/pipeline/project-constraints.md            <- 非本步（Captain 修 §4 口径矛盾）
 M docs/split/status.md                            <- 状态机文件
 M server/scripts/experiment-variance.mjs          <- I7
 M server/src/services/checkerService.js           <- I1
 M server/src/services/projectGrading.js           <- I3
 D server/src/services/ruleExecutor.js             <- 删源文件（1010 行）
 M server/src/services/ruleMutator.js              <- I2
 M server/test/unit/infrastructure/experiment-variance.test.js  <- I6
 M server/test/unit/infrastructure/rule-executor.test.js        <- I4
 M server/test/unit/infrastructure/rule-mutator.test.js         <- I5

$ git diff --stat（7 个 import 站点 + 删除）
 server/scripts/experiment-variance.mjs             |    2 +-
 server/src/services/checkerService.js              |    2 +-
 server/src/services/projectGrading.js              |    2 +-
 server/src/services/ruleExecutor.js                | 1010 --------------------
 server/src/services/ruleMutator.js                 |    2 +-
 .../experiment-variance.test.js                    |    2 +-
 .../rule-executor.test.js                          |    2 +-
 .../rule-mutator.test.js                           |    2 +-
 8 files changed, 7 insertions(+), 1017 deletions(-)

$ git ls-files --others --exclude-standard -- server/src   # 未跟踪新文件 = 8 个（恰为 3 domain + 5 infra）
```

→ **7 处 import 改动每个只有 1 insertion + 1 deletion（纯路径替换）**，1 个源文件删除，8 个新文件。**完全命中判据。** 逐行原文：

```
- import { validateRules, runRules, resolveProjectRoot } from './ruleExecutor.js';
+ import { validateRules, runRules, resolveProjectRoot } from '../infrastructure/rule/index.js';   (checkerService.js)
- import { runRules } from './ruleExecutor.js';
+ import { runRules } from '../infrastructure/rule/index.js';                                     (projectGrading.js)
- jest.unstable_mockModule('../../../src/services/ruleExecutor.js', () => ({
+ jest.unstable_mockModule('../../../src/infrastructure/rule/index.js', () => ({                  (experiment-variance.test.js，与 projectGrading.js 同址)
```

### 8.1 未触碰旁证（注意 constraints §3-8：`git status` 对未跟踪目录无证据力）

```
$ find tests -type f -newermt '2026-10-11 07:40:00'          # => 0
$ find client/dist -type f -newermt '2026-10-11 07:40:00'    # => 0
$ ls -ld tests client/dist server/package.json
  drwxr-xr-x  tests              Oct 10 20:13
  drwxr-xr-x  client/dist        Oct 10 21:55
  -rw-r--r--  server/package.json Oct 10 23:48
$ git diff --stat -- server/package.json                     # => 空（未触碰）
$ git status --porcelain -- client tests scripts server/package.json   # => 仅 ?? tests/ 与 ?? scripts/gates/pixel-diff.mjs
```

改动时刻的完整增量清单（除 `node_modules` / `.git`）：8 个新文件(07:51) + 7 个 import 站点(07:51~07:52) + `docs/split/*.md` + `docs/pipeline/project-constraints.md`(07:49) + `scripts/gates/pixel-diff.mjs`(07:52→07:56，**step 0 的另一位 Agent 在并发编辑，与本步文件集无交集**) + 本轮回归产物 `docs/pipeline/test-round-08.log` 与 `server/logs/app-2026-10-11.log`。

**被验快照指纹**（我验证时刻的 8 新 + 7 改，sha256）：

```
constants.js   a0b94b605ead2c78a04f8f9a986256ee8ab85c8db25a42e1a17e03abf61fde50
evaluators.js  57a719209403ad1149f11bd06f57db0b3fba1a3b256290c64ea4c7fa634102e9
validate.js    5faeccbab63867c356ed28c296562315cea1ff64759e27be4595c3aa9dbd6b78
file-access.js 466e5bad76837aa5fb1fb5a4b3599227b4f5ce64fbb5a9956271f08f380e4b56
executors.js   7efd61cb24dbb70e27390949f7f7827b0c13a1cf86bcb57e21c5dd533c3896f7
syntax.js      9c4f7cd79d771cd35cc437e7ab7caa82b1626df830c810f345656f8cdc67a854
executor.js    dd107c34044b70301158d039e22d1e8f636248a46096a87d7d5ef46fc2cc8ea9
index.js       e7f485ba2a4180ed18e92f80bc5ce4acbeba4321bd59eb67d1a173d886590e72
experiment-variance.test.js af913d82597903f1c98e01177e6dd029550339f84b0c0562d238ab22c9cb4951   <- 与 B 自报的「临时回滚后」哈希逐字命中
```

→ 8 个新文件的整文件 sha256 与 B 报告 §2 的表格**逐个相同** ⇒ 我验证的就是 B 交付的那份产物（快照未漂移）。
→ `docs/pipeline/project-constraints.md` 的 `M` 是 Captain 修 §4 口径矛盾（diff = 3 insertions / 2 deletions，替换的是「全量口径 = 1011 例 / 67 套件」那段），**与我本轮验证的文件集零交集**，不计入 B 的改动面。

## 9 缺陷分级

### 阻断（必须回流 B）：0 条

### 轻微（不阻断本步，建议登记/修订）

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| m1 | B 的 D1 表述「照抄 A 的 import 清单会产出 **6 处运行时 ReferenceError**」**对 `fs` 不成立** | 删掉 `executors.js` 的 `fs` 后**不抛错**：`execFileExists` 自带 `try/catch` 把 ReferenceError 吞掉，`file_exists` 由 10 分**静默变 0 分**（evidence `存在` → `无法访问`） | 结论（绑定必需）正确，仅失败形态描述不准；**这恰是最危险的一类失败（静默错分）**，建议在 refactor 报告里写明 |
| m2 | A 的 §4.3④ 断言「Z6/Z7 … **只能靠**切片判等覆盖」**过强** | 我用「上游依赖打桩」在改前/改后双树强制触达该分支，得到**逐字节相等**的行为证据（§3.4）；Z7 的 `:506` 调用点用 `chmod 000` 即可黑盒覆盖 | 本步实际覆盖强度**高于** A 的预期；非缺陷，仅登记口径 |
| m3 | `scripts/gates/cycle-check.mjs:17` 的 `BASELINE.members` 仍含已删除的 `server/src/services/ruleExecutor.js` | 该文件已不存在；但判定只用 `BASELINE.cycles`（实测 SCC 0 正确） | 死引用，不阻塞；A 已登记为「不改门禁」的后续清理项 |

### 优化（可延后）

| # | 项 | 说明 |
|---|---|---|
| o1 | `nodeRequire` 死变量 | 本步按纪律**逐字保留（正确）**；建议作为**独立后续项**清理（禁止同一提交里既搬移又改行为）。 |
| o2 | 未分层 46 继续下降 | 本步只贡献 −1；其余 46 个仍在 `server/src/services/*` 等旧目录，属后续步骤。 |
| o3 | 基线刷新 | `check-layers.mjs --save-baseline` 会写仓库内 `docs/layer-violations-baseline.md`（我本轮**未使用**，越界）；应由 Captain 在提交步执行。 |

## 10 未做项与残留风险

1. **client 侧未验**：本步无 client 改动，`pixel-diff.mjs` / axe **未跑**（且该脚本正被 step 0 的另一位 Agent 并发编辑，07:52→07:56 仍在变；与我的文件集无交集）。DoD §5-5 对本步不适用。
2. **未验证提交**：DoD §5-7 要求「每步一个提交，消息含拆分前 file:line 范围 + 落层目标 + 验证结果」。截至本轮结束，改动**仍未提交**（工作树态）。**这一条我无法验证，需 Captain 在提交步落地。**
3. **端到端链路未单独跑**：`runRules` 经 `checkerService → projectGrading` 的集成路径只由全量回归的 integration 套件间接覆盖（V1 全绿），我未另建端到端评分夹具。
4. **Z6 的覆盖方式**：依赖打桩（非纯黑盒）。若要求「零侵入夹具」，该分支仍只能靠切片判等；本步已把它升级为**双树同桩的行为对拍**。
5. **并发写者**：`scripts/gates/pixel-diff.mjs` 在我验证期间被改动（step 0）。`server/logs/app-2026-10-11.log` 因本次全量回归而增长（应用日志，非受控产物）。
6. **本轮我对仓库的写入**：只有本报告 + 回归脚本规定的 `docs/pipeline/test-round-08.log`（`unblock-g2.sh` 的既定归档行为）；其余全部在 `/tmp/vc/`。
7. **未做 git 写操作**：全程只读（`rev-parse` / `show` / `archive` / `status` / `diff` / `ls-files`）。

## 11 本步结论

> ## **PASS —— 无需回流 B。**

- **主判据**：全量回归 4 段摘要齐全、**0 failed**（68 套件 / 1073 例全 passed）。
- **核心判据**：43/43 块逐字节相等 + 反向解析 0 多余字节 + 120 例行为对拍 0 差异 + 变异/静默变异反证均报差异 ⇒ **拆分确实是等价搬移**。
- **对抗性判据**：分层门禁经 6 条故意违规**全部抓中**（非零退出）⇒「违规 0 / 未分层 46」是真实读数，不是门禁失灵的假绿。
- **收益兑现**：未分层 **47 → 46**、GodFile **10 → 9**、观察带 19 → 18、SCC 保持 **0**、对外导出面 10 名逐字不变。
- **B 对 A 的唯一实质纠正（D1/D2）成立**：6 个绑定**全为必需**，`index.js` 的本地 import 绑定同样必需；仅 1 条失败形态措辞需修正（m1）。

**提交前建议**（Captain 侧）：提交消息记录「拆分前 `server/src/services/ruleExecutor.js:1-1010` → `domain/services/rule/{constants,evaluators,validate}.js` + `infrastructure/rule/{file-access,executors,syntax,executor,index}.js`；验证 = 43/43 切片判等 + 120 例对拍 + 四门禁 PASS + 全量 1073 例 0 failed」，并把 arch 基线刷新为「未分层 46 / GodFile 9」。

---

**证据留存**：本报告全部原始输出来自本轮实测；临时装置位于 `/tmp/vc/`（`run.mjs` 对拍装置、`v2b/v2c.mjs` 切片判等、`build-variants.mjs` + `run-variants.mjs` 六绑定裁定、`gate-falsify.mjs` 门禁证伪、`fixtures/` 夹具集、`out/*.json` 原始结果）。
