# deepseek.js 拆分执行报告（GodFile 拆分专项 · step 4 · Agent B）

- **执行者**: Agent B（唯一写者）｜ **会话 ID**: `9798dc84-f231-4a5e-b91b-982450518b56`
- **日期**: 2026-10-11 ｜ **方案依据**: `docs/split/deepseek-plan.md`（635 行，Agent A 产出）｜ **范本**: `docs/split/checkerService-refactor.md`
- **目标形态**: A 的**推荐形态**（2 domain + 8 infrastructure，共 **10** 文件）；最大单文件 `prompts.js` = **221 行** ≪ 800
- **一句话结论**: 10 文件全部落层（`application` 按 A 的实测判定**未落**）；**41/41 声明块逐字节相等 + 3 条源 import 行逐字取证**；**导出面 21 名逐字等价**；五门禁全 PASS（违规 **0**、未分层 **45 → 44**、GodFile **7 → 6**、SCC **0**、bind 违规 **0**、hard **0/0/0**）；定向 **10 套件 / 195 例 / 0 失败**；**M1 mock 双向验证通过**；`repairTruncatedJson` 双实现**只登记未合并**。
- **分批**: **B1 / B2 / B3 三批全部完成**（B1/B2 用门面中间态并留下门禁读数，见 §3）

---

## 0 判定摘要（判据 → 实测）

| # | 判据 | 要求 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | `check-layers.mjs` 违规 | 0 | **0**（文件 96，0 类规则） | ✅ |
| 2 | 未分层待迁移 | 45 → 44 | **44**（▼1） | ✅ |
| 3 | 目标文件行数 | 每个 < 800 | 最大 **221**（`prompts.js`） | ✅ |
| 4 | `arch-metrics.mjs` | PASS + GodFile 6 | **PASS**，GodFile **7 → 6**，观察带 17 → **16** | ✅ |
| 5 | `cycle-check.mjs` SCC | 0 | **0**（自环 0；96 文件 / **214** 边，改前 194） | ✅ |
| 6 | `bind-check.mjs` 绑定违规 | 0 | **0**（194 模块 / 652 绑定；unresolved 4 / external 1 与改前同） | ✅ |
| 7 | `hard-metrics.mjs` | 0/0/0 | **0/0/0**（PASS，只扫 client，逐字不变） | ✅ |
| 8 | 逐块 sha256 切片判等 | 0 块不等 | **41/41 声明块全等 + 3 条源 import 行门面态逐字命中**；反向「未匹配 = 0」 | ✅ |
| 9 | 导出面 | 21 名逐字等价 | **BEFORE=21 / AFTER=21，排序串逐字符相同**（两独立进程真 import） | ✅ |
| 10 | 声明行 export | 不得加/改/删 | 21 个内联导出（= 源）｜文件尾 `export { … };` 块 **2 个**｜`export *` **0** | ✅ |
| 11 | 绑定自查（闭包扫描） | 0 缺失 | **0 个 free name / 0 个缺失导出**；死绑定 2 个（照带） | ✅ |
| 12 | **M1 路径键控 mock** | 双处同改 + 单跑通过 | `:18`/`:23` 同指新模块；**18/18 PASS**；反向装置（只改一处）**FAIL** | ✅ |
| 13 | 定向测试 | 全绿 | **10 套件 / 195 例 / 0 失败** | ✅ |
| 14 | 禁网 | 0 次真实外网 | 护栏实测在 jest VM 内生效；**记录到 0 次 off-host 调用**；仓库 `server/logs` 零写入 | ✅ |
| 15 | 行为变更 | 零 | 仅「整块位移 + import 重排 + 文件尾 export 块」 | ✅ |

---

## 1 版本锚点与改动面

### 1.1 锚点（逐字命中 A 的锚点）

| 项 | 值 |
|---|---|
| HEAD | `e2e70fdf0580ff97ae9e458760a6309c8982721f`（`git rev-parse HEAD` 实测） |
| 冻结树源文件（`git show HEAD:server/src/services/deepseek.js`）sha256 | `c13fceb9b1ce88525db5e5cb5dad9528dbac12f6647fa1d358284365a87adc02`（**与 A 锚点逐字一致**，入口与出口各校一次） |
| 源文件行数 | **1051**（`wc -l`；`split('\n')` 末元素为空） |
| 我的入场基线 | `M docs/split/status.md`（**非我改动**，入场前即为 M；我全程未写该文件） |

### 1.2 改动面（`git status --porcelain -uno`，实测原文）

```
 M docs/split/status.md                                     <- 入场前即存在，非本步产物
 M server/scripts/cgroup-remaining-experiment.mjs           <- I18（仅 1 行：import 路径）
 M server/scripts/experiment-variance.mjs                   <- I20a/I20b（仅 2 行：动态 import 路径）
 M server/scripts/fix-variance-experiment.mjs               <- I19（仅 1 行）
 M server/scripts/full-selfconsistency-353.mjs              <- I15（仅 1 行）
 M server/scripts/selfconsistency-experiment.mjs            <- I17（仅 1 行）
 M server/scripts/trustjudge-experiment.mjs                 <- I16（仅 1 行）
 M server/src/controllers/adminController.js                <- I4（仅 1 行）
 M server/src/controllers/projectReviewController.js        <- I5（仅 1 行）
 M server/src/controllers/teacherController.js              <- I6 + I7（仅 2 行）
 M server/src/infrastructure/ai/checker/generator.js        <- I8b（仅 1 行）
 M server/src/infrastructure/ai/checker/llm.js              <- I8a（仅 1 行）
 D server/src/services/deepseek.js                          <- 删源文件（B3，1051 行）
 M server/src/services/gradingWorker.js                     <- I1（仅 1 行）
 M server/src/services/projectGrading.js                    <- I2（仅 1 行）
 M server/src/services/trustJudgeGrader.js                  <- I3（仅 1 行）
 M server/test/integration/open-project-flow.test.js        <- I13（仅 1 行：import 路径，断言一字未动）
 M server/test/integration/r2-fixes.test.js                 <- I12（仅 1 行）
 M server/test/unit/deepseek.test.js                        <- I9（仅 1 行）
 M server/test/unit/infrastructure/rubric-items.test.js     <- I11（仅 1 行）
 M server/test/unit/infrastructure/trustjudge-grader.test.js<- I14（仅 2 行：**mock 路径 + import 路径**）
 M server/test/unit/open-project-prompt.test.js             <- I10（仅 1 行）
```

- `git diff --stat`：**22 files changed, 27 insertions(+), 1080 deletions(-)**；测试目录的 8 行改动**全部是路径**（原文见下），**无一条断言被改**：

```diff
-} from '../../src/services/deepseek.js';
+} from '../../src/infrastructure/ai/deepseek/index.js';
-import { extractFilesJson } from '../../src/services/deepseek.js';
+import { extractFilesJson } from '../../src/infrastructure/ai/deepseek/index.js';
-import { gradeSubmission, gradeProject } from '../../src/services/deepseek.js';
+import { gradeSubmission, gradeProject } from '../../src/infrastructure/ai/deepseek/index.js';
-import { normalizeRubricItems } from '../../../src/services/deepseek.js';
+import { normalizeRubricItems } from '../../../src/infrastructure/ai/deepseek/index.js';
-jest.unstable_mockModule('../../../src/services/deepseek.js', () => ({
+jest.unstable_mockModule('../../../src/infrastructure/ai/deepseek/index.js', () => ({
-const { gradeProject } = await import('../../../src/services/deepseek.js');
+const { gradeProject } = await import('../../../src/infrastructure/ai/deepseek/index.js');
-} from '../../src/services/deepseek.js';
+} from '../../src/infrastructure/ai/deepseek/index.js';
```

- **10 个新文件**（`git status` 显示为 2 个新目录，全部未跟踪）：

```
server/src/domain/services/deepseek/prompts.js
server/src/domain/services/deepseek/json-extract.js
server/src/infrastructure/ai/deepseek/config.js
server/src/infrastructure/ai/deepseek/submission-grading.js
server/src/infrastructure/ai/deepseek/exam-parsing.js
server/src/infrastructure/ai/deepseek/reference-answer.js
server/src/infrastructure/ai/deepseek/project-grading.js
server/src/infrastructure/ai/deepseek/file-selection.js
server/src/infrastructure/ai/deepseek/rubric-items.js
server/src/infrastructure/ai/deepseek/index.js
```

- **import 站点改写**：**20 个文件 / 23 处规格符**（A 报「19 站点 / 20 处」，我实测多出 3 处，见 §11-E6）：
  - `server/src`：8 文件 9 处（I1 gradingWorker:3、I2 projectGrading:29、I3 trustJudgeGrader:29、I4 adminController:395、I5 projectReviewController:14、I6 teacherController:11、I7 teacherController:204（动态）、I8a checker/llm:7、I8b checker/generator:14）
  - `server/test`：5 文件 6 处（I9 :1、I10 :22、I11 :4、I12 :7、I13 :28、**I14 :18 + :23**）
  - `server/scripts`：6 文件 7 处（I15 :17、I16 :12、I17 :14、I18 :13、I19 :19、I20a :156、I20b :158）
  - 改写器带**次数断言**（`splitD/rewrite.mjs`）：23/23 全部按期望次数命中，0 失败

### 1.3 未触碰声明（越界自查）

未改 `client/**`（`client/dist` mtime = 10-10 21:55）、`tests/**`（10-10 20:13）、`scripts/gates/**`（10-11 09:14，早于我 09:21 入场）、`server/logs`（目录 10-11 00:12；`app-2026-10-11.log` mtime = **09:07**，早于入场）、`server/package.json`、`server/test/jest.config.js`、`server/.env`；**未执行任何 git 写操作**（无 commit / add / clean / stash / checkout / reset / restore；`git archive` 属只读导出）。
我的全部自建脚本放在 `/tmp/splitD*`（generator / verifier / bindcheck / rewrite / runner / fetch-guard），仓库内**零脚本残留**。

### 1.4 ★三处「计划外」陈旧引用（**只登记，未改**）

全仓（排除 `node_modules`/`.git`/`dist`/`tests`）扫 import 规格符，除 23 处计划内站点外，另有 **3 处仍指向已删模块**——**均不在 A 的 §4.1 清单内、也不在 A 的扫描面内**：

| # | 站点 | git 状态 | 判定 | 处置 |
|---|---|---|---|---|
| S1 | `server/tmp-probe-ref-answer.mjs:9`（`await import('./src/services/deepseek.js')`） | **untracked**（历史探针残骸） | 不在 `src/test/scripts`，不被 jest testMatch / package.json 引用，**不可达** | **未改**（越界：plan §8 总则 1 只授权 10 新文件 + I1–I20） |
| S2 | `server/test-grading.js:4`（`import { gradeSubmission } from './src/services/deepseek.js'`） | TRACKED | 同上，**不可达**（非 `.test.js`，npm scripts 无引用） | **未改**（越界） |
| S3 | `docs/test-results/2026-08-17-round3/verify-r3.mjs:1`（**绝对路径** import） | TRACKED | **8-17 的历史归档证据**，只读冻结 | **未改**（改历史证据 = 越界） |

> **判据口径**：`server/{src,test,scripts}` 三个受管根内，指向已删模块的 import 规格符 = **0 命中**（`grep -rnE "from '[^']*services/deepseek\.js'|import\('[^']*services/deepseek\.js'\)" server/src server/test server/scripts` → 无输出）。**请 Captain 决定 S1/S2/S3 的处置**（我按禁令不做）。

---

## 2 目标形态与实测指纹（`gen.mjs` 生成，逐字切片）

| # | 目标文件（层） | 源区间（逐字） | import 条数 | **实测总行** | 整文件 sha256 |
|---|---|---|---|---|---|
| T1 | `domain/services/deepseek/prompts.js`（**domain**） | 45-49 · 51 · 53 · 55-58 · 161 · 163-231 · 377 · 378-386 · 458-463 · 465-466 · 468-474 · 476 · 564-584 · 586-618 · 620-652 · 750 · 853 · 855-856 | 0 | **221** | `f1740c089cf244e6ab430f7498f127f322be434feef1ac8b8541c1954dd966a3` |
| T2 | `domain/services/deepseek/json-extract.js`（**domain**） | 489-497 · 498-527 · 528-562 · 763-767 · 768-779 | 0 | **99** | `49fbbf107140fc1d7cd2ac900951f97f3707d544c72eef8bfa0075573d09bedd` |
| T3 | `infrastructure/ai/deepseek/config.js`（infra） | 5-6 · 7 · 8 · 10-21 · 23-26 · 28-31 · 33-38 · 40 · 41 · 42 · 43 | 2 | **47** | `61cbdc5632ca1595844da4b1f1f5ba39ffb4b154b12bfb5ad93a63614e3a7231` |
| T4 | `infrastructure/ai/deepseek/submission-grading.js`（infra） | 60-71 · 72-157 | 4 | **108** | `6de2444951263d9aaf685fa70aaa6998a63097c5f61b1be0b6892e64bf234818` |
| T5 | `infrastructure/ai/deepseek/exam-parsing.js`（infra） | 233-237 · 238-295 · 297-302 · 303-373 | 3 | **150** | `f9994dc740994b5d68cad14bb1d70f467895fdd8a828f11393a4aba74b356227` |
| T6 | `infrastructure/ai/deepseek/reference-answer.js`（infra） | 388-391 · 392-454 | 3 | **76** | `fbd0ad7e080fe62dca0c684f37c548ab14f8a111da614db11b35ea3e6e512ef9` |
| T7 | `infrastructure/ai/deepseek/project-grading.js`（infra） | 478-488 · 654-665 · 666-746 · 976-987 · 988-1051 | 4 | **192** | `2bd131c52e82f7010d82c5fc83d38df15134d77d48b35b06d4176213e1b33a9f` |
| T8 | `infrastructure/ai/deepseek/file-selection.js`（infra） | 752-762 · 781-848 | 4 | **90** | `2053c4819176063b8a765be3ebf2ed5d3acbfee5ecc05ff5e34c773425450f3d` |
| T9 | `infrastructure/ai/deepseek/rubric-items.js`（infra） | 858-865 · 866-894 · 896-907 · 908-972 | 3 | **124** | `0aa37e161136d8405eb3559ff4ede54a3406fb6b57821d37e4af1883f7f55aef` |
| T10 | `infrastructure/ai/deepseek/index.js`（infra（新建）） | 0（9 条 re-export + 文件头注释） | 9 条 re-export | **13** | `6339da9078e1daaad334f0d9faa3a7949edf83ebd14161c0bd2f2d8d472d25ef` |
| — | 源文件 `server/src/services/deepseek.js` | — | 整体删除 | **−1051** | — |

**行数账（逐行集合运算，闭合）**：`1051 = 1001（搬移切片）+ 41（区间间空行，由单空行分隔符还原）+ 6（:159/:375/:456/:748/:851/:974 段落横幅不搬）+ 3（:1-3 import 行）`。
目标侧合计 **1120 行**；最大 **221**（A 预估 ≈202：差 19 = 17 个区间分隔空行 + banner 4 行 − 预估偏差）；**全部 < 800**；观察带（>500）**无新增**。

---

## 3 三批执行记录（中间态用门面；每批留实测读数）

中间态做法（照 plan §6）：源文件保留为**门面**——已迁出的**全部曾导出名**改为文件尾 `export { … } from '<新路径>';` 再导出，文件头补上仍被内部使用的 import。**导出面在每一批都保持 21 名**（每批真 import 探针实测，见下）。

| 批 | 动作 | 新建 | 源文件行数（实测） | `check-layers` | 未分层 | GodFile | 面探针 |
|---|---|---|---|---|---|---|---|
| 入场 | — | — | 1051 | 87 文件 / 违规 0 | 45 | 7 | BEFORE = **21 名** |
| **B1** | T1 + T2 迁出；门面（2 import 行 + 2 re-export 行） | prompts 221、json-extract 99 | **768** | 89 文件 / 违规 **0** | 45 | **6** | **21 名** ✅ |
| **B2** | T3 + T4 + T8 + T9 迁出；门面（3 import 行 + 6 re-export 行） | config 47、submission-grading 108、file-selection 90、rubric-items 124 | **437** | 93 文件 / 违规 **0** | 45 | 6 | **21 名** ✅ |
| **B3** | T5 + T6 + T7 + T10 建齐 → 改 23 处站点 → **删源文件** | exam-parsing 150、reference-answer 76、project-grading 192、index 13 | **0（已删）** | 96 文件 / 违规 **0** | **44** | 6 | **AFTER = 21 名** ✅ |

- **GodFile 7 → 6 在 B1 即达成**（门面 768 < 800，早于 A 的「B3 才达成」预期）；B1/B2 中途读数**均未劣化基线**（违规 0、未分层不增、SCC 0）。
- 门面每批都做了**真 import 探针**（`PORT=0` + 硬阻断 fetch 护栏），B1/B2 均为 **21 名**、`fetch calls = 0`。
- 门面是**中间态产物**，最终态已随源文件删除而消失（`grep` 确认 0 处规格符指向旧模块）。

---

## 4 逐块 sha256 切片判等（44 块）

**方法（可复现，脚本 `/tmp/splitD/verify.mjs`，未入仓）**：
1. 从**冻结树**取源：`git show e2e70fdf…:server/src/services/deepseek.js`，先自证整体 sha256 = `c13fceb9…`（== A 锚点）；
2. 用 `@babel/parser`（`sourceType: module`）取 **41 个顶层声明**节点的 `[start,end)` 字节区间（含 `export` 关键字、**不含**前导 JSDoc）；
3. 对每块求 sha256，再在**目标文件全文**做字节子串定位（`indexOf` 循环计数）——命中数 ≥1 即「逐字节相等」（哈希由构造保证）；
4. **3 条源 import 行**（:1/:2/:3）单列：它们是 plan §2.4 允许重排的唯一部分，故在 **B1/B2 门面态**取证「逐字保留」，最终态另立「名字集/绑定种类保持 + 路径按 §2.4 加深」的判据。

### 4.1 41 个声明块（**41/41 全等，0 块不等**）

| # | 符号 | 源行（冻结树） | 源切片 sha256（全 64 位） | 目标文件命中 | 判等 |
|---|---|---|---|---|---|
| 1 | `configCache` | 6-6 | 21e6f5baca8eda2581d4e1732348ee48336ade075e5697ea914e37dcb0f711c1 | T3（×1） | ✅ |
| 2 | `configCacheTime` | 7-7 | b9cda27fe24a4e69a5dd9392626dd37497f83494e8998d42491be085b9aa5088 | T3（×1） | ✅ |
| 3 | `CACHE_TTL` | 8-8 | 8f1bc24e250dd15e3ab48381d146833b0f57e233d16e74cbf1f2310b5a905626 | T3（×1） | ✅ |
| 4 | `loadConfig` | 10-21 | 20e798e45ad38a3106079a872ae6719318e3a89d60605e29f28bc8e7a83804a0 | T3（×1） | ✅ |
| 5 | `clearConfigCache` | 23-26 | 8c0c5c86f8124b0a9b267e0b6c421a1494a56c397ac1aae3037f803a5a85cad4 | T3（×1） | ✅ |
| 6 | `getConfig` | 28-31 | 105500257afb0d2161b466710947a967ce43aa5c137984c4cee4cbd7a5871458 | T3（×1） | ✅ |
| 7 | `getProjectContextMode` | 34-38 | 5f9faaa7b20b2d7e598b71ab6aac9f821884df1ca31800e167febbf407e32203 | T3（×1） | ✅ |
| 8 | `getApiKey` | 40-40 | 7f78713cd2078cea7ee478918d441abe09e87f2d002e70f552553cd4a5a41286 | T3（×1） | ✅ |
| 9 | `getBaseUrl` | 41-41 | d1445cfe6ae76488ed109dbb1e01b50f67e5c2b5d59c28f102e229d7f88c218a | T3（×1） | ✅ |
| 10 | `getModel` | 42-42 | 82360ab272aa3e79bce102b074c9329cc09eff36772769ccd11d501ba952e5fd | T3（×1） | ✅ |
| 11 | `getConcurrency` | 43-43 | 12cfe4829fd857d51198ca98d1ef0b377559dd461a29fb491d77d343304e856e | T3（×1） | ✅ |
| 12 | `DEFAULT_CRITERIA` | 45-49 | 315fc7b6f1a771947759829fa5ad272dc795657af55023fad7b113db367907b6 | T1（×1） | ✅ |
| 13 | `ROLE` | 51-51 | 5ebf5c7ce248bfc8a252e51782f36660ec51d0e9440fa4b88595f1c13648aa73 | T1（×1） | ✅ |
| 14 | `OUTPUT_FORMAT` | 53-53 | e7d18c1af52f80d5c41f03522f6c30a16b40ecd4829f7af51b196544bcc62123 | T1（×1） | ✅ |
| 15 | `buildSystemPrompt` | 55-58 | 60c180f718b336d63a29e64c260853f67f4f9311d947dbbd6eba6ab54a3798f4 | T1（×1） | ✅ |
| 16 | `gradeSubmission` | 72-157 | 2f0dbe42f917b79f3993382b12623558625cf521a8842b54b1593035200c021e | T4（×1） | ✅ |
| 17 | `PARSE_ROLE` | 161-161 | dccf10c6783d2021f8b0b7bfa24dafe21b8065daf9a165bf6d20a3c5009d4bab | T1（×1） | ✅ |
| 18 | `PARSE_RULES` | 163-231 | d77ad082bfd47b3844f57e0cd458a0679571c978727abf92bb45abcb01fc2bf3 | T1（×1） | ✅ |
| 19 | `parseExamPaper` | 238-295 | b2c4bd22f96aaa990c02cce186c72d27dacd28709b55075cd4e1c294bb6f5c4d | T5（×1） | ✅ |
| 20 | `parseExamPaperStream` | 303-373 | 6b4ac6873f3681a355a19047ff287e8a2177555574bad449cbae6a0ebc8bb20c | T5（×1） | ✅ |
| 21 | `GEN_ROLE` | 377-377 | 03d5868bcdfa2997730873448b43e7d64c575b9c183db12a303b24ecbcee170b | T1（×1） | ✅ |
| 22 | `GEN_RULES` | 378-386 | 0d0d19c24ec4fbf15bf7f082ff55c80b3a98e0796a6f32eb0f70d390d22dd151 | T1（×1） | ✅ |
| 23 | `generateReferenceAnswer` | 392-454 | 3260a2eaf3d620e846545a6d53d98ba73fed9af9cbe8d47a8bbad47c5e206c2e | T6（×1） | ✅ |
| 24 | `PROJECT_SECURITY_CLAUSE` | 462-463 | 33faae19d6b8469177c8bdd30f63d3dd8088712459d98b50645d07427c9c8f21 | T1（×1） | ✅ |
| 25 | `PROJECT_ROLE` | 465-466 | e6886965b84a814b31ef32d3f7a8c233bb323b7708ec871a685f4aa791bf9e7f | T1（×1） | ✅ |
| 26 | `OPEN_PROJECT_ROLE` | 473-474 | 5b26185b1c4f008d59f70aa134482fc463825e8bc54ce49c996c91475cfd3929 | T1（×1） | ✅ |
| 27 | `DEFAULT_PROJECT_CRITERIA` | 476-476 | 5cc60b7b78da5944f5c2fb5352104bb9ccbdbe3009cff35c9872bda81552c6fd | T1（×1） | ✅ |
| 28 | `repairTruncatedJson` | 498-527 | 532aa2c694a7432b05dac4c948ca7053f5fba4cabde16c88ed3ae00fe47cfe95 | T2（×1） | ✅ |
| 29 | `extractProjectGradeJson` | 536-562 | 585503bc3437453f0ccf88ac5c5da5c76929dfe3b71d8039851b2577453f5537 | T2（×1） | ✅ |
| 30 | `PROJECT_OUTPUT_SPEC` | 568-584 | 6b44df488462ded6381ba8bbfb65785f2c11c51200429f1dedbef612be9388f0 | T1（×1） | ✅ |
| 31 | `buildProjectGradePrompt` | 597-618 | cd8c9499a62aa8855a97c69584d26ec89d45b3de8a3dc50f632da38050a992a6 | T1（×1） | ✅ |
| 32 | `buildOpenProjectGradePrompt` | 632-652 | 6ecea3d41c9bc3e79b0f7c4e78d048e7b4607c6060cdbac264742778887cc04e | T1（×1） | ✅ |
| 33 | `gradeProject` | 666-746 | ba8343b259009ab08e2ccc8dbbd773b54464d70cdd75886be9fb61b00f9bdc62 | T7（×1） | ✅ |
| 34 | `SELECT_ROLE` | 750-750 | 1327e8c14ba9503ddfbe584312fd2ba6702f8cae5f24923e44bb4d847dbcbcde | T1（×1） | ✅ |
| 35 | `extractFilesJson` | 768-779 | 7daa4510e4ee098ccecaf744d54154b7be86a9e45075980cb865e6ebd6cc14e0 | T2（×1） | ✅ |
| 36 | `selectImportantFiles` | 781-848 | a4ba929a80f72a9004740dd69d0c2f7a9d4c01549aa01882965d2852d49626a6 | T8（×1） | ✅ |
| 37 | `RUBRIC_ROLE` | 853-853 | 74faf07239cf899fc42175965411fc9240f3a7decb3637376368bacbbb275e2c | T1（×1） | ✅ |
| 38 | `AUTOMATION_LEVELS` | 856-856 | 8ae8469df2c3f2ca3553d5ac50313cdc6f5e5f5e9b5de6f2030dc75678eaa9ca | T1（×1） | ✅ |
| 39 | `normalizeRubricItems` | 866-894 | f5c938234868349b9beb3b04162a46057de601bc5b756ac7e40cbff2813958b6 | T9（×1） | ✅ |
| 40 | `summarizeRubricItems` | 908-972 | aad537fd560a4a0f2a6f347011ccf6a6265aa770d933c491d83a63b6fb86f52d | T9（×1） | ✅ |
| 41 | `gradeSubjectiveItems` | 988-1051 | b6036a901276d0a41c7143eead0320c554df05160763c6e31510ba52e338a18f | T7（×1） | ✅ |

> **含前导 JSDoc 的「完整块」复核**：`repairTruncatedJson`（489-527）、`extractProjectGradeJson`（528-562）、`extractFilesJson`（763-779）、`gradeProject`（**478-488 孤儿 JSDoc + 654-746**）、`gradeSubjectiveItems`（976-1051）、`normalizeRubricItems`（858-894）、`summarizeRubricItems`（896-972）、`selectImportantFiles`（752-762 + 781-848）的 JSDoc 已在 §4.2 的**反向校验**中按行逐字比对（`expected` 序列即含 JSDoc 行）。
> **孤儿 JSDoc 处置（plan §1 暗礁 3/4）**：:478-488 的第一份 `gradeProject` JSDoc **随 `gradeProject` 进 T7**（未删、未与 :654-665 的第二份合并）；:752-762 的 `selectImportantFiles` JSDoc 随函数进 T8；:976-987 的 `gradeSubjectiveItems` JSDoc 随函数进 T7 —— 三处均逐字保留。

### 4.2 反向校验：目标文件「未匹配字节 = 0」（**位置级**，独立于生成器）

判据（不依赖生成脚本的分隔符逻辑）：把每个目标文件的**非空行序列**（剔除 banner 4 行 / `import ` 行 / `export {` 行）与「源文件在**该目标被指派的区间**上的非空行序列」**逐行比对**，必须完全相等。

```
T1   prompts.js                 nonblank= 178   expected= 178   OK
T2   json-extract.js            nonblank= 91    expected= 91    OK
T3   config.js                  nonblank= 34    expected= 34    OK
T4   submission-grading.js      nonblank= 84    expected= 84    OK
T5   exam-parsing.js            nonblank= 121   expected= 121   OK
T6   reference-answer.js        nonblank= 59    expected= 59    OK
T7   project-grading.js         nonblank= 171   expected= 171   OK
T8   file-selection.js          nonblank= 71    expected= 71    OK
T9   rubric-items.js            nonblank= 113   expected= 113   OK
T10  index.js                   nonblank= 0     expected= 0     OK
反向校验失败文件数 = 0
T1     221 f1740c089cf244e6ab430f7498f127f322be434feef1ac8b8541c1954dd966a3 server/src/domain/services/deepseek/prompts.js
T2      99 49fbbf107140fc1d7cd2ac900951f97f3707d544c72eef8bfa0075573d09bedd server/src/domain/services/deepseek/json-extract.js
T3      47 61cbdc5632ca1595844da4b1f1f5ba39ffb4b154b12bfb5ad93a63614e3a7231 server/src/infrastructure/ai/deepseek/config.js
T4     108 6de2444951263d9aaf685fa70aaa6998a63097c5f61b1be0b6892e64bf234818 server/src/infrastructure/ai/deepseek/submission-grading.js
T5     150 f9994dc740994b5d68cad14bb1d70f467895fdd8a828f11393a4aba74b356227 server/src/infrastructure/ai/deepseek/exam-parsing.js
T6      76 fbd0ad7e080fe62dca0c684f37c548ab14f8a111da614db11b35ea3e6e512ef9 server/src/infrastructure/ai/deepseek/reference-answer.js
T7     192 2bd131c52e82f7010d82c5fc83d38df15134d77d48b35b06d4176213e1b33a9f server/src/infrastructure/ai/deepseek/project-grading.js
T8      90 2053c4819176063b8a765be3ebf2ed5d3acbfee5ecc05ff5e34c773425450f3d server/src/infrastructure/ai/deepseek/file-selection.js
T9     124 0aa37e161136d8405eb3559ff4ede54a3406fb6b57821d37e4af1883f7f55aef server/src/infrastructure/ai/deepseek/rubric-items.js
T10     13 6339da9078e1daaad334f0d9faa3a7949edf83ebd14161c0bd2f2d8d472d25ef server/src/infrastructure/ai/deepseek/index.js
```

⇒ 10 个文件的**每一个非空行**都能按位置归因于「源切片 / banner / import 行 / export 行」，**没有任何夹带的改写、插入或遗漏**。

### 4.3 装置自检（有分辨力，且不误报）

| 变异 | 注入点 | 期望 | 实测 |
|---|---|---|---|
| m1 | `prompts.js` 的 `OUTPUT_FORMAT`：`0 到满分之间` → `0 到满分以内` | 报差异 | **`OUTPUT_FORMAT` 块未命中（声明块未命中数 = 1）+ T1 反向校验 FAIL（diffs=6）** ✅ |
| m2 | `config.js` 的 `CACHE_TTL`：`60_000` → `30_000` | 报差异 | **`CACHE_TTL` 块未命中（= 1）+ T3 反向校验 FAIL（diffs=3）** ✅ |
| m0（惰性对照） | `submission-grading.js` import 子句里的**零消费死绑定** `DEFAULT_MAX_SCORE` → `DEFAULT_MAX_SCORE_DEAD` | 0 差异 | **声明块未命中数 = 0；T4 OK** ✅（证明装置只对「切片内容」敏感，不对 plan 授权改写的 import 行误报） |

> 变异在 `/tmp/splitD-mut*` 的副本上注入（`rsync` 全树），**未进仓库**；判定用同一 `verify.mjs` 的 `VERIFY_ROOT` 覆盖。

---

## 5 导出面证据（真 import，两独立进程，`PORT=0`，禁网护栏）

### 5.1 BEFORE vs AFTER

BEFORE 用**冻结树**（`git archive e2e70fdf… server` → `/tmp/splitD-before`，`shasum` 复核 = `c13fceb9…`，`server/node_modules` 以软链复用）：

```
=== BEFORE (冻结树 /tmp/splitD-before) ===
count=21
OPEN_PROJECT_ROLE,PROJECT_ROLE,buildOpenProjectGradePrompt,buildProjectGradePrompt,clearConfigCache,extractFilesJson,generateReferenceAnswer,getApiKey,getBaseUrl,getConcurrency,getConfig,getModel,getProjectContextMode,gradeProject,gradeSubjectiveItems,gradeSubmission,normalizeRubricItems,parseExamPaper,parseExamPaperStream,selectImportantFiles,summarizeRubricItems
=== AFTER (repo index.js) ===
count=21
OPEN_PROJECT_ROLE,PROJECT_ROLE,buildOpenProjectGradePrompt,buildProjectGradePrompt,clearConfigCache,extractFilesJson,generateReferenceAnswer,getApiKey,getBaseUrl,getConcurrency,getConfig,getModel,getProjectContextMode,gradeProject,gradeSubjectiveItems,gradeSubmission,normalizeRubricItems,parseExamPaper,parseExamPaperStream,selectImportantFiles,summarizeRubricItems
```

⇒ 两侧输出**逐字符相同**（count 相等 + 排序串相等），**21/21 名，无多、无少、无改名**。

### 5.2 声明行 export 审计 + index 的 9 条 re-export

- 新文件**声明行内联 `export`** = **21 个**，名字集与源**逐字相同**：
  - `prompts.js` 4（`PROJECT_ROLE` `OPEN_PROJECT_ROLE` `buildProjectGradePrompt` `buildOpenProjectGradePrompt`）｜`json-extract.js` 1（`extractFilesJson`）｜`config.js` **7**（`clearConfigCache` `getConfig` `getProjectContextMode` `getApiKey` `getBaseUrl` `getModel` `getConcurrency`）｜`submission-grading.js` 1｜`exam-parsing.js` 2｜`reference-answer.js` 1｜`project-grading.js` 2｜`file-selection.js` 1｜`rubric-items.js` 2
- **文件尾 `export { … };` 块 = 2 个**：`prompts.js:221`（14 名）、`json-extract.js:99`（2 名：`repairTruncatedJson` `extractProjectGradeJson`）—— 即「跨模块暴露一律走文件尾 export 块」的纪律**未破坏**，且**无任何声明行被加/改/删 `export`**。
- **`export *` = 0 次**；`index.js` 的 `export { … } from` = **9 行**（bind-check 是唯一能验它的门禁 + §5.1 真 import 双证）。
- **不导出**任何内部名：`loadConfig` / `CACHE_TTL` / `configCache` / `configCacheTime` / `repairTruncatedJson` / `extractProjectGradeJson` / `buildSystemPrompt` / `PARSE_*` / `GEN_*` / `ROLE` / `DEFAULT_*` / `OUTPUT_FORMAT` / `PROJECT_SECURITY_CLAUSE` / `PROJECT_OUTPUT_SPEC` / `SELECT_ROLE` / `RUBRIC_ROLE` / `AUTOMATION_LEVELS` —— **`extractProjectGradeJson` 未进 index**（保住 21 名等价）。

---

## 6 绑定自查（跨文件引用闭包扫描）

**方法**（`/tmp/splitD/bindcheck.mjs`，`@babel/parser` AST）：对每个目标文件求 `free name = 被引用标识符 − 本文件声明（含函数参数/循环变量/解构） − import 绑定 − 已知全局`。

```
prompts.js               decl=29  import=0   free=[] unusedImport=[]
json-extract.js          decl=18  import=0   free=[] unusedImport=[]
config.js                decl=17  import=2   free=[] unusedImport=[logger]
submission-grading.js    decl=26  import=7   free=[] unusedImport=[DEFAULT_MAX_SCORE]
exam-parsing.js          decl=31  import=6   free=[] unusedImport=[]
reference-answer.js      decl=19  import=6   free=[] unusedImport=[]
project-grading.js       decl=37  import=10  free=[] unusedImport=[]
file-selection.js        decl=23  import=6   free=[] unusedImport=[]
rubric-items.js          decl=32  import=6   free=[] unusedImport=[]
index.js                 decl=0   import=0   free=[] unusedImport=[]
free name 总数 = 0

=== 2) 每条 import 规格符 → 目标模块导出存在性（静态） ===
缺失导出数 = 0
```

**★补漏（A 的 §2.4 有两处绑定错误，我按下述实测修正——这是前两步栽过的同一坑）**：

1. **`buildSystemPrompt` 漏绑定**：`gradeSubmission`（:108）调用 `buildSystemPrompt`，而该函数（源 :55-58）落在 **T1 `prompts.js`** → **T4 必须 import 它**。A 的 §2.4-T4 写的是 `{ DEFAULT_CRITERIA, ROLE, OUTPUT_FORMAT }`——这 3 个名字**只被 `buildSystemPrompt` 内部使用**（那只在 T1 内），`gradeSubmission` **一次都没引用**；照抄会（a）漏掉真绑定、（b）带 3 个零消费绑定。**实测修正为 `import { buildSystemPrompt } from …/prompts.js`**（源码见 T4）。
2. **`index.js` 漏一名**：A 的 §2.3 代码块写 `export { gradeProject } from './project-grading.js';`，但**同节自己列的 21 名清单里有 `gradeSubjectiveItems`** → 照抄则 AFTER = **20 名**（我在 B3 首跑**实测捕获**：`AFTER count=20`）。**修正为 `export { gradeProject, gradeSubjectiveItems } from './project-grading.js';`** 后 21/21。

其余**逐条复核通过**的跨文件绑定（闭包总表，13 条新增内部边）：`T4→T1(buildSystemPrompt)`、`T5→T1(PARSE_ROLE,PARSE_RULES)`、`T6→T1(GEN_ROLE,GEN_RULES)`、`T7→T1(PROJECT_ROLE,OPEN_PROJECT_ROLE,build{,Open}ProjectGradePrompt) + T2(extractProjectGradeJson,extractFilesJson)`、`T8→T1(SELECT_ROLE) + T2(extractFilesJson)`、`T9→T1(RUBRIC_ROLE,AUTOMATION_LEVELS)`；`T3–T9→config.js` 6 条。**无反向边、无环**。
> `selectImportantFiles` 的 `SELECT_ROLE`（A 点名「最易漏的一条」）**已带**：`file-selection.js:8`。

**死绑定 2 个（照带，未删）**：`config.js` 的 `logger`（源 :5-43 区间内零引用，plan §2.4-T3 明示照带）、`submission-grading.js` 的 `DEFAULT_MAX_SCORE`（源零消费死绑定，plan §1.1-1 明令逐字带）。二者均由本节的 `unusedImport` 列**显式呈现**（不允许被静默丢弃）。

---

## 7 ★M1：路径键控 mock 单点故障（最高优先）

### 7.1 mock 路径 ↔ 真实模块路径的对应关系（**两处必须同改**）

| 角色 | 改前 | 改后 | 解析结果 |
|---|---|---|---|
| `trustjudge-grader.test.js:18`（`jest.unstable_mockModule`） | `'../../../src/services/deepseek.js'` | `'../../../src/infrastructure/ai/deepseek/index.js'` | `<repo>/server/src/infrastructure/ai/deepseek/index.js` |
| `trustjudge-grader.test.js:23`（`await import`，取 `gradeProject`） | `'../../../src/services/deepseek.js'` | `'../../../src/infrastructure/ai/deepseek/index.js'` | **同一模块** |
| 被测方 `trustJudgeGrader.js:29`（`import { gradeProject }`） | `'./deepseek.js'` | `'../infrastructure/ai/deepseek/index.js'` | **同一模块** |

> jest 的 ESM 模块注册表按**解析后的模块标识**键控；`moduleNameMapper`（`^(\\.{1,2}/.*)\\.js$` → `$1`）对三者同样生效 ⇒ mock 继续命中。**mock 工厂仍只提供 `gradeProject` 一名、`:23` 仍只解构这一名**（未扩工厂、未扩解构）。

### 7.2 单跑结果（改完立刻单独跑）

```
==================== SUITE: test/unit/infrastructure/trustjudge-grader.test.js ====================
PASS test/unit/infrastructure/trustjudge-grader.test.js
Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Time:        0.432 s, estimated 1 s
==================== fetch-guard 日志 ====================
(无任何 fetch 调用被记录)
```

**「不是静默失配」的三重证据**：
1. **断言本身即身份断言**：`:119` `gradeProject.mockReset()`、`:168/178/187/195/219/230/253` `expect(gradeProject).toHaveBeenCalledTimes(1)`、`:220/231/254` `gradeProject.mock.calls[0]` —— 若 mock 失配，`gradeProject` 会是真函数，**第一行 `mockReset` 就 TypeError**。18/18 绿 ⇒ mock 真在生效。
2. **反向装置（只改一处，我在 /tmp 复刻）**：`/tmp/splitD-neg` 里**恢复旧模块**（让旧路径可解析）并**只把 :18 改回旧路径**（:23 与新代码保持新路径）⇒ **FAIL**，12 例红、报 `TypeError: gradeProject.mockReset is not a function`。⇒ mock 是**载荷性**的，且失配会**响亮失败**（而非静默走真网）。
3. **禁网兜底已就位**：即使万一失配，本次全部运行的 `globalThis.fetch` 已被硬护栏包裹（`fetch-guard.mjs`，实测在 jest VM 内生效），到 `api.deepseek.com` 的请求会**抛错而非真连**。

---

## 8 门禁实测（5 门禁全部 PASS；原始输出）

```
### 1) node server/scripts/check-layers.mjs
文件 96 个，违规 0 条（0 类规则），未分层待迁移 44 个
exit=0

### 2) node scripts/gates/arch-metrics.mjs
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=45  实测=44
  ✓ godfileOver800     基线=7  实测=6
  · >500 行（观察带，不计判据） 基线=17 实测=16
  GodFile >800 行：server/src/controllers/teacherController.js (1338) / client/src/views/Doc.vue (1106) / client/src/views/teacher/ReviewDetail.vue (988) / client/src/views/teacher/QuestionEdit.vue (983) / server/src/controllers/reviewController.js (965) / client/src/views/teacher/ProjectQuestionEdit.vue (868)
  分层守卫原文：文件 96 个，违规 0 条（0 类规则），未分层待迁移 44 个
结论：PASS
exit=0

### 3) node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 96 文件 / 214 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 0）
  自环（文件 import 自身）: 0
结论：PASS
exit=0

### 4) node scripts/gates/hard-metrics.mjs
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
  参考：非 style.css 的 CSS 中 !important = 20（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）
结论：PASS
exit=0

### 5) node scripts/gates/bind-check.mjs
=== bind-check: ESM 跨模块绑定自检（陷阱 12 的静态补位）===
roots                        : server/src, server/test
modules scanned              : 194
named import bindings checked: 652
unresolved relative imports  : 4 (仅登记)
external (out-of-root) refs  : 1 (仅登记)
BINDING VIOLATIONS           : 0
  ⚠ unresolved: server/test/unit/infrastructure/fact-extractor.test.js -> './App.vue'
  ⚠ unresolved: server/test/unit/infrastructure/fact-extractor.test.js -> './router'
  ⚠ unresolved: server/test/unit/infrastructure/project-context-builder.test.js -> './x.js'
  ⚠ unresolved: server/test/unit/infrastructure/project-context-builder.test.js -> './x.js'
  · external: server/test/unit/infrastructure/experiment-variance.test.js -> '../../../scripts/experiment-variance.mjs'
exit=0
```

**改前 → 改后对照**：

| 门禁读数 | 改前（HEAD，A 实测 + 我 B1 前复核） | 改后（实测） | 判据 |
|---|---|---|---|
| `check-layers` 文件 / 违规 / 未分层 | 87 / **0** / **45** | 96 / **0** / **44** | 违规 0、未分层 45→44 ✅ |
| `arch-metrics` | PASS（45 / **7** / 观察带 17） | PASS（**44 / 6 / 16**） | 不劣化且下降 ✅ |
| `cycle-check` 文件 / 边 / SCC / 自环 | 87 / 194 / **0** / 0 | 96 / **214** / **0** / 0 | SCC 0 ✅（边数如实记录） |
| `bind-check` 模块 / 绑定 / 违规 | 185 / 592 / **0** | 194 / 652 / **0** | 违规 0 ✅ |
| `hard-metrics` | 0/0/0 | 0/0/0 | 逐字不变 ✅（只扫 client） |

**边数账（闭合）**：`194 − 3（源文件的 3 条出边：logger/constants/prisma）+ 23（T3→2、T4→4、T5→3、T6→3、T7→4、T8→4、T9→3）= 214` ✔（`index.js` 的 9 行 re-export 对 `IMPORT_RE` 不可见 ⇒ 不产生边）。
**GodFile 名单（实测 6 项）**：`teacherController.js (1338)` / `Doc.vue (1106)` / `ReviewDetail.vue (988)` / `QuestionEdit.vue (983)` / `reviewController.js (965)` / `ProjectQuestionEdit.vue (868)` —— **`deepseek.js (1051)` 已消失**。

---

## 9 定向测试（删源文件后复跑；**未跑全量回归**，那是 C 的职责）

装置：`DATABASE_URL` = 由 `server/.env` **只换库名**为 `exam_system_test` 派生（脚本派生，不回显凭据）；**显式 `PORT=0`**（`server/test/setup.js:2` 亦强制）；每套件独立 jest 进程（`--runInBand --forceExit`）。

| 套件 | 为什么选它 | 结果 |
|---|---|---|
| `test/unit/infrastructure/trustjudge-grader.test.js` | **M1 所在**（路径键控 mock） | 1 passed ｜ **18 passed** ｜ 0.43 s |
| `test/unit/deepseek.test.js` | 直接 import 本模块（`gradeSubmission`/`gradeProject`） | 1 passed ｜ **19 passed** ｜ 40.4 s |
| `test/unit/open-project-prompt.test.js` | 直接 import（prompt 逐字节冻结基线） | 1 passed ｜ **13 passed** ｜ 0.42 s |
| `test/unit/infrastructure/rubric-items.test.js` | 直接 import（`normalizeRubricItems`） | 1 passed ｜ **9 passed** ｜ 0.41 s |
| `test/integration/r2-fixes.test.js` | 直接 import（`extractFilesJson`） | 1 passed ｜ **13 passed** ｜ 0.78 s |
| `test/integration/open-project-flow.test.js` | 直接 import（真链路，fetch 打桩） | 1 passed ｜ **9 passed** ｜ 2.91 s |
| `test/unit/infrastructure/checker-service.test.js` | 经 `checker/generator.js`（I8b）→ 新 `index.js` | 1 passed ｜ **42 passed** ｜ 0.56 s |
| `test/integration/ownership-guards.test.js` | 经 `app.js → routes → controllers` 真加载 3 个 controller 站点 | 1 passed ｜ **62 passed** ｜ 2.05 s |
| `test/integration/project-regrade.test.js` | 经 `projectGrading.js`（I2）→ `getConcurrency`/`gradeProject` | 1 passed ｜ **3 passed** ｜ 6.78 s |
| `test/integration/prompt-preview.test.js` | 经 `projectReviewController.js`（I5）→ 4 个 prompt 导出名 | 1 passed ｜ **7 passed** ｜ 0.75 s |
| **合计** | | **10 套件 / 195 例 / 0 失败** |

- **无失败 ⇒ 未触发「停下来回报 Captain」条件**；**未改动任何测试断言**（§1.2 的 diff 全部是路径行）。
- 其中后 4 个套件在 **`FETCH_GUARD_MODE=block`（任何 fetch 调用即抛错）** 下运行，仍全绿 ⇒ 这些套件**完全不依赖全局 `fetch`**。

---

## 10 禁网证据（本次未发生真实外网请求）

### 10.1 四重保证

| # | 手段 | 实测证据 |
|---|---|---|
| ① | **`globalThis.fetch` 硬护栏**（`/tmp/splitD/fetch-guard.mjs`，**不调用原始 fetch**，任何 off-host 调用即 `throw`，并逐条落盘到 `fetch-calls.log`） | 全部模块导入探针用 `FETCH_GUARD_MODE=block`：**calls = 0**；10 个套件运行期间 `fetch-calls.log`：**无任何记录** |
| ② | **护栏在 jest VM 内实测生效**（这是关键前提，否则护栏形同虚设） | `/tmp/splitD/probe/fetchvm.test.js`（`--roots /tmp/splitD/probe`，未入仓）打印：`CALL THREW: FETCH-GUARD: hard-blocked fetch -> https://api.deepseek.com/v1/chat/completions` |
| ③ | **LLM 路径全部被测试自身的桩替换** | `deepseek.test.js` / `open-project-flow.test.js` / `trustjudge-grader.test.js` 均在用例内 `globalThis.fetch = jest.fn()`；`trustjudge` 另用 `unstable_mockModule` 顶掉 `gradeProject`（§7） |
| ④ | **仓库日志零写入**（logger 会在 import 时 `mkdirSync(LOG_DIR)`） | `server/logs` 目录 mtime = **10-11 00:12**、`app-2026-10-11.log` mtime = **10-11 09:07**，**均早于我 09:21 入场** ⇒ 未向仓库 logs 写一个字节 |

### 10.2 口径声明（诚实边界）

- 本次**没有任何一行代码走到真实 LLM**：全部 8 个 `fetch` 站点（:99/:248/:309/:409/:679/:805/:929/:1004）只在我未运行的生产路径上会执行；测试用桩、探针用桩。
- 护栏日志「0 条」有两层含义，均如实记录：① **0 次 off-host 调用**（否则会抛错并留痕）；② 由于测试把 `globalThis.fetch` 整体替换成 `jest.fn()`，这些**桩调用不经过我的护栏**（因此不是「护栏拦下了很多请求」，而是**根本没有真实 fetch 发生**）。
- `server/.env` 的 `DEEPSEEK_BASE_URL=https://api.deepseek.com` **未被修改**；我没有调用任何 `web_search` / `web_fetch` / 真实 LLM；未占用 `:3000`/`:5173`（`lsof` 实测无监听）。

---

## 11 与 A 方案的偏离（**4 处必须修正 + 4 处如实登记**）

### 必须修正（若不修正即为缺陷）

| # | A 的方案原文 | 问题（实测） | 我的落地 |
|---|---|---|---|
| **E1** | §2.4-T4：`import { DEFAULT_CRITERIA, ROLE, OUTPUT_FORMAT } from '.../prompts.js'` | **漏真绑定**：`gradeSubmission` 用 `buildSystemPrompt`（在 T1）；那 3 个名字它一次没用 | `import { buildSystemPrompt } from '.../prompts.js'`（§6） |
| **E2** | §2.3：`export { gradeProject } from './project-grading.js';` | **导出面少一名**（`gradeSubjectiveItems` 缺失；A 自己的 21 名清单里有它）→ 首跑实测 `AFTER count=20` | `export { gradeProject, gradeSubjectiveItems } …` |
| **E3** | §8-B2/B3：T3 末尾写 `export { clearConfigCache, getConfig, … };`；§8-B2：T2 末尾写 `export { repairTruncatedJson, extractProjectGradeJson, extractFilesJson };` | **重复导出 = `SyntaxError`**：这些声明行**本来就有内联 `export`**（T3 全部 7 个、T2 的 `extractFilesJson`） | 只给「无内联 export」的名字建文件尾块：T3 **无**块（7 名全内联）、T2 块 = 2 名（§5.2） |
| **E4** | §8-B1：T1 的 export 块「**19 个名字**」 | 逐个数为 **18**（清单本身列了 18 项） | 18 名全导出（其中 4 名走内联）：`DEFAULT_CRITERIA ROLE OUTPUT_FORMAT buildSystemPrompt PARSE_ROLE PARSE_RULES GEN_ROLE GEN_RULES PROJECT_SECURITY_CLAUSE DEFAULT_PROJECT_CRITERIA PROJECT_OUTPUT_SPEC SELECT_ROLE RUBRIC_ROLE AUTOMATION_LEVELS`（文件尾块 14 名） |

### 如实登记（不构成缺陷，仅口径差异）

| # | 项 | A 的写法 | 实测 | 说明 |
|---|---|---|---|---|
| E5 | §2.2 T7 搬移行数 | 174 | **180** | 174 与同节的「搬移总量 = 1001」**自相矛盾**；180 才使总量闭合（§2） |
| E6 | §4.1 站点数 | 「19 个站点 / 20 处引用」 | **20 文件 / 23 处** | 表内实际列了 I1–I8b（9）+ I9–I14（6）+ I15–I20b（7）= 22 处；再加 `teacherController` 静态+动态、`trustjudge` mock+import、`experiment-variance` 2 处动态 ⇒ 按文件计 20、按规格符计 23（我按规格符逐处改写并断言次数） |
| E7 | §8-B18：`grep -rn "services/deepseek.js" server/src` 预期 10 命中 | 10 | **10**（全部是 10 个新文件的 banner 溯源注释）+ 其余为**别的文件的既有注释**（`scoring.service.js` / `deepseek-gateway.js` / `prompt-builder.js` / `system-config.repository.js` / `interface/README.md`） | 与 step 3 的 D3 同构；**import 规格符命中 = 0** |
| E8 | §2.2 T3 的 `5-6` 区间 | 含源 :5 的段落横幅 | **照带**（T3 第 5 行即该横幅） | A 的 §2.2 校验明示「:5 的横幅在 S1 区间内被 T3 带走」，与 §8.7 的 6 条横幅清单（不含 :5）一致 |

### 明令**不动**的三项（硬要求 + 禁令，实测零动作）

| 项 | 位置 | 处置 |
|---|---|---|
| `DEFAULT_MAX_SCORE` 零消费死绑定 | `submission-grading.js:7`（import 子句内，全文出现 **1** 次） | **逐字照带**（块判等不含它，但 §6 的 `unusedImport` 列已显式呈现） |
| `getModel` 在 `checker/llm.js` 的零消费状态 | `checker/llm.js:7` | **未动**（该文件只改了规格符） |
| `repairTruncatedJson` 双实现 | 本步 `json-extract.js`（源 :498-527，多了悬空字符串/尾逗号修剪）vs `domain/services/checker/parsers.js:38-59`（in-string 状态机） | **未合并**（合并 = 行为变更）。块 sha256 `532aa2c6…` 与源逐字相等 ⇒ 本步**只位移**。**登记为后续独立专项**（需行为对拍 + 数据侧取证） |
| :478-488 的孤儿 JSDoc | 随 `gradeProject` 进 T7 | 未删、未与 :654-665 合并 |
| `extractProjectGradeJson` 私有状态 | `json-extract.js:99` 文件尾块导出，**不进 index** | 保持私有语义（仅跨模块可见、不对外）——为 C 的 F15 探针留出可调用入口 |

---

## 12 局限声明（诚实边界）

1. **未跑全量回归**（C 的职责）；本文测试结论覆盖 **10 个定向套件 / 195 例**。
2. **未跑 A 的 F01–F22 行为对拍与变异反证**（C 的职责）。本步用**静态逐块判等（41/41 + 反向逐行）+ 真 import 面/绑定探针 + 10 套件**：前者能覆盖 Z1–Z5 这类夹具打不到的零覆盖分支（整块字节相等），但**不等于**运行时行为等价的完整证明。
3. **未做跨模块运行时行为验证**：`exam-parsing.js`/`reference-answer.js`/`file-selection.js`/`project-grading.js` 的 LLM 路径本次**未被调用**（零覆盖段的既有状态，与拆分无关）；其正确性证据 = 切片判等 + 链接期绑定。
4. **3 处计划外陈旧引用未改**（§1.4）：其中 `server/test-grading.js` 与 `docs/test-results/2026-08-17-round3/verify-r3.mjs` 是 **tracked** 文件，若被人工执行会 `ERR_MODULE_NOT_FOUND`；**均不可达**（非 jest testMatch、非 npm scripts、非构建入口）。请 Captain 裁定处置。
5. **`server/logs` 的 mtime 证据以「目录与当日文件 mtime 早于入场」为准**：我无法排除「logger 打开已存在文件句柄但不写」的极端情形（`LOG_LEVEL=silent` 时 pino 仍会打开目标）；实测两个 mtime 均未变。
6. **未审计依赖邻居的层归属**：`services/{projectGrading,projectContextBuilder,ruleMutator,factExtractor,gradingWorker,trustJudgeGrader}.js`、`utils/{prisma,logger}.js`、`constants.js` 仍是 **unlayered**，T3–T9 持续依赖它们（A §10-6 的同款登记）。
7. **`SystemConfigRepository` 的切换未做**（A §3.1-5 的 D1–D5）：本步**逐字搬移** `loadConfig` 到 `infrastructure/ai/deepseek/config.js`，**保持模块级单例**（`configCache`/`configCacheTime`/`CACHE_TTL` 三者在同一模块内，缓存语义未变）；未改 `adminController` 的调用形态。
8. **本文所有行数 / 哈希 / 计数 / 门禁读数 / 测试结果均由我在本轮实测**（脚本与方法随节给出，全部在 `/tmp/splitD*`，未入仓），未照抄 A 的预估；偏差已逐处标明。
9. **`git status` 里的 `M docs/split/status.md` 不是本步产物**（入场前即为 M）；我全程未写该文件。A 的 §10-11 请 Captain 在提交本步时一并刷新状态文件。

---

## 13 给 Agent C 的验证指令

1. **锚点**：源文件已删 ⇒ `git show e2e70fdf0580ff97ae9e458760a6309c8982721f:server/src/services/deepseek.js | shasum -a 256` 必须 = `c13fceb9b1ce88525db5e5cb5dad9528dbac12f6647fa1d358284365a87adc02`。
2. **V4 静态判等（核心）**：请用**你自己的**脚本重做 §4（勿复用 `/tmp/splitD/verify.mjs`）；判据 = **41 声明块 0 块不等** + **3 条源 import 行的门面态逐字性**（最终态按 §2.4 重排属授权改写）；并做反向「未匹配字节 = 0」（我用的口径 = 非空行序列**位置级**比对，建议你也用位置级而非集合级）。**必做 m1/m2 变异反证**（§4.3 的两处注入在 /tmp 副本上必须报差异）。
3. **V5 声明行 export 审计**：目标侧声明行内联 `export` = **21** 且名字集与源相同；`export *` = **0**；文件尾 `export { … };` 块 = **2**（`prompts.js:221`、`json-extract.js:99`）；`index.js` 的 `export { … } from` = **9**。
4. **V2 导出面**：`PORT=0 node -e "const m = await import(…/server/src/infrastructure/ai/deepseek/index.js); console.log(Object.keys(m).sort().join(…))` ⇒ 恰好 21 名（§5.1 清单）；**建议与冻结树同法对拍**。
5. **V3 = M1（最易被忽略的硬失败点，务必双向）**：① 跑 `trustjudge-grader` ⇒ PASS + 无到 `api.deepseek.com` 的请求；② 在 /tmp 副本里**恢复旧模块 + 只改 :18 不改 :23** ⇒ **必须 FAIL**（我实测报 `TypeError: gradeProject.mockReset is not a function`；若你那边「只改一处仍 PASS」⇒ 说明 mock 从未生效，立即回流）；③ 身份断言 `gradeProject.mock.calls.length >= 1`。
6. **V18 站点真 import**：对 §1.2 的 **23 处规格符**逐个真 import（`PORT=0`）；**`gradingWorker.js`（I1）与 `teacherController.js:204` 的动态 import 必须单独做**（jest 里零加载，测试红不了）。
7. **V9 禁网**：探针必须在 import 前替换 `globalThis.fetch`（桩体**不调用原始 fetch**）+ 断言全部 URL 为 `http://127.0.0.1:9`；注意 **jest 的 `globalThis` 是 VM 内对象**，`NODE_OPTIONS=--import` 的预载**实测有效**（§10.1②），可用 `--roots` 跑 /tmp 探针自证。
8. **V12–V16 门禁**：`check-layers` ⇒ 违规 **0** / 未分层 **44**（≤45，**并做 A §3 的四条反向陷阱证伪，/tmp 副本**）；`arch-metrics` ⇒ PASS / GodFile **6** / 观察带 **16** / unmigrated 44；`cycle-check` ⇒ SCC **0**（改后边数 **214**，194 是改前值）；`bind-check` ⇒ 违规 **0**（194 模块 / 652 绑定；**重点看 `index.js` 的 9 行 re-export** —— 它是唯一能验它的门禁）；`hard-metrics` ⇒ 0/0/0。
9. **V17 全量回归**：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`（先查空序号；已占用 `exit 4`）；判据 = 日志 **4 处 `Test Suites:`** + **`failed = 0`**；**不得引用旧用例数**（constraints §3-17）。我只跑了 10 个定向套件（195 例），**全量是你的职责**。
10. **V19 越界自查**：`git status --porcelain` 应只见 §1.2 的 22 条 tracked 变更（21 M + 1 D）+ 2 个新目录（10 文件）+ 本报告 + 入场前既有的 `M docs/split/status.md`（**非本步产物**）；`client/dist` / `tests/` / `scripts/gates/` / `server/logs` mtime 无变化。
11. **建议优先复核的 4 个「落地件 vs 方案」差异点**：**E1**（T4 的 `buildSystemPrompt` 绑定，A 的 §2.4 是错的）、**E2**（index 的 `gradeSubjectiveItems`，A 的 §2.3 是错的）、**E3**（T2/T3 的 export 块，照 A 写会 `SyntaxError`）、**E4**（T1 的 18 vs 19）；另请复核 **§1.4 的 3 处计划外陈旧引用**该不该由本步清理。
