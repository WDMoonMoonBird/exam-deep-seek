# checkerService 拆分执行报告（GodFile 拆分专项 · step 3 · Agent B）

- **执行者**: Agent B（唯一写者）｜ **会话 ID**: `1793fbfe-4929-4975-8ac4-77dcc7b259a9`
- **日期**: 2026-10-11 ｜ **方案依据**: `docs/split/checkerService-plan.md`（543 行，Agent A 产出）｜ **范本**: `docs/split/ruleExecutor-refactor.md`
- **目标形态**: A 的**推荐形态**（2 domain + 8 infrastructure，共 **10** 文件）；最大单文件 `generator.js` = **386 行** ≪ 800
- **一句话结论**: 10 文件全部落层；**49/49 块逐字节相等**（0 块不等）；**导出面 10 名逐字等价**；五门禁全 PASS（违规 **0**、未分层 **46 → 45**、GodFile **8 → 7**、SCC **0**、bind 违规 **0**、hard **0/0/0**）；定向 **104 例 / 0 失败**；`RULE_TYPES` 缺陷**只登记未改**。
- **分批**: **B1 / B2 / B3 三批全部完成**（中间态用门面，逐批留下门禁读数，见 §3）

---

## 0 判定摘要（判据 → 实测）

| # | 判据 | 要求 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | `check-layers.mjs` 违规 | 0 | **0**（文件 87，0 类规则） | ✅ |
| 2 | 未分层待迁移 | 46 → 45 | **45**（▼1） | ✅ |
| 3 | `cycle-check.mjs` SCC | 0 | **0**（自环 0；87 文件 / 194 边） | ✅ |
| 4 | `bind-check.mjs` 绑定违规 | 0 | **0**（185 模块 / 592 绑定） | ✅ |
| 5 | `hard-metrics.mjs` | 0/0/0 | **0/0/0**（PASS） | ✅ |
| 6 | `arch-metrics.mjs` | PASS + GodFile 7 | **PASS**，GodFile **7**，观察带 18 → **17** | ✅ |
| 7 | 逐块 sha256 切片判等 | 48 声明块全等 | **49/49 全等，0 块不等**（48 声明 + 1 文件头 JSDoc） | ✅ |
| 8 | 导出面 | 10 名逐字等价 | **BEFORE=10 / AFTER=10，排序后字符串完全相同**（真 import 对拍） | ✅ |
| 9 | 声明行 export | 不得新增/改写 | 新文件声明行 `export` = **10 个，名字集与源逐字相同**；`export *` = **0** | ✅ |
| 10 | 绑定自查（闭包扫描） | 0 缺失 | **0 个文件存在缺失绑定**；唯一「未被引用」绑定 = `getModel`（**照带**） | ✅ |
| 11 | 定向测试 | 全绿 | **104 例 / 0 失败**（42 + 62，2 套件） | ✅ |
| 12 | 行为变更 | 零 | 仅「整块位移 + import 行重排 + 文件尾 export 块」 | ✅ |
| 13 | 硬要求③ RULE_TYPES 缺陷 | 只登记不修 | 未改一处（§10 附运行时取证） | ✅ |

---

## 1 版本锚点与越界自查

### 1.1 锚点（逐字命中 A 的锚点）

| 项 | 值 |
|---|---|
| HEAD | `c26c8dce5dcdec20acd5c0ec6af5fe1359b7cb23`（`split(step-2): Submit.vue 抽 9 个 composable`） |
| 冻结树源文件（`git show HEAD:server/src/services/checkerService.js`）sha256 | `37d2358c32ab253054b6d152d1f9246a31419cc7a711352fb3d1cb17993409b0`（**与 A 锚点逐字一致**） |
| 源文件行数 | **1280**（`wc -l`；`split('\n').length` = 1281，与 plan §1.1-3 同口径） |
| 我的入场基线 | `M docs/split/status.md`（**非我改动**，入场前即为 M；我全程只读） |

### 1.2 改动面（`git status --porcelain -uno`，实测原文）

```
 M docs/split/status.md                                     <- 入场前即存在，非本步产物
 M server/src/controllers/checkerController.js              <- I1（仅 1 行：import 路径）
 M server/test/unit/infrastructure/checker-service.test.js  <- I2（仅 1 行：import 路径）
 D server/src/services/checkerService.js                    <- 删源文件（B3）
```

- **2 处 import 改写**（`git diff --stat` 两文件均 `1 insertion(+), 1 deletion(-)`；测试文件**断言一字未动**）：

```diff
-import { generateChecker, getCheckerState, confirmChecker, rollbackChecker } from '../services/checkerService.js';
+import { generateChecker, getCheckerState, confirmChecker, rollbackChecker } from '../infrastructure/ai/checker/index.js';
-import { parseCheckerResult, parseCheckerRules, runCheckerScript, attachNegativeFeedback, findMisplacedSubjective } from '../../../src/services/checkerService.js';
+import { parseCheckerResult, parseCheckerRules, runCheckerScript, attachNegativeFeedback, findMisplacedSubjective } from '../../../src/infrastructure/ai/checker/index.js';
```

- **10 个新文件**（`git ls-files --others`，全部未跟踪）：

```
server/src/domain/services/checker/meta.js
server/src/domain/services/checker/parsers.js
server/src/infrastructure/ai/checker/generator.js
server/src/infrastructure/ai/checker/index.js
server/src/infrastructure/ai/checker/legacy-script.js
server/src/infrastructure/ai/checker/llm.js
server/src/infrastructure/ai/checker/package-inspect.js
server/src/infrastructure/ai/checker/prompts.js
server/src/infrastructure/ai/checker/review.js
server/src/infrastructure/ai/checker/state.js
```

### 1.3 未触碰声明（越界自查）

未改 `client/**`、`tests/**`、`scripts/gates/**`、`server/scripts/**`、`server/package.json`、`server/test/jest.config.js`、`server/logs`、`server/.env`；**未执行任何 git 写操作**（无 commit / add / clean / stash / checkout / reset / restore）；未联网（唯一一次 `fetch` 是自建探针的桩，见 §7.3）。
我的全部自建脚本放在 `/tmp/splitB*`，仓库内**零脚本残留**。

### 1.4 I1/I2 的 mock 复核（A 说「无 jest mock 指向该模块」，我独立复现）

```
$ grep -rn "unstable_mockModule" server/test | head
server/test/unit/infrastructure/experiment-variance.test.js:42  -> '../../../src/infrastructure/rule/index.js'
server/test/unit/infrastructure/trustjudge-grader.test.js:18   -> '../../../src/services/deepseek.js'
server/test/unit/infrastructure/socket-notifier.test.js:9      -> '../../../src/socket.js'
server/test/unit/assignment-q9-branches.test.js:30             -> '../../src/utils/prisma.js'
$ grep -rn "import(.*checker" server/src server/test   -> 0 命中（无动态 import）
$ ls server/accept.tmp.mjs                             -> No such file or directory（历史悬空引用已不存在）
```
⇒ **确认：不存在 step 1 的 H1 类「mock 路径键控」单点故障**（无任何 mock 指向 checkerService）。

---

## 2 目标形态与实测行数

| # | 目标文件（层） | 源区间（逐字） | 搬移块 | 搬移行 | **实测总行** | 整文件 sha256 |
|---|---|---|---|---|---|---|
| T1 | `domain/services/checker/parsers.js`（**domain**） | 60-70 · 171-228 · 232-271 · 275-382 · 386-387 · 389-415 | 8 | 246 | **258** | `b2a1108ec8b1b7d6a530e04082c92138e6cae96d4d6c769df1b36f4b856f8a87` |
| T2 | `domain/services/checker/meta.js`（**domain**） | 43-44 · 628-641 · 684-700 · 702-710 · 712-729 | 5 | 60 | **71** | `d05bfd8730a1f6ce7e7d8431d41b756cf2eb5f1b77c90546e076c98d8dc07119` |
| T3 | `infrastructure/ai/checker/prompts.js`（infra） | 72-83 · 85-90 · 92-96 · 98-103 · 105-112 · 114-121 · 123-129 · 131-136 · 138-146 · 148-157 · 529-570 · 572-624 | 12 | 172 | **192** | `e03d429cc7ea49a519b7a1fd37f98f8f964ac375cce2d372a7197a831cd930b3` |
| T4 | `infrastructure/ai/checker/llm.js`（infra） | 51-52 · 55-56 · 458-460 · 462-525 | 4 | 71 | **84** | `e82ef0100bc324890682ced14884e1b8eba82fda8f6c158f82739d9e976fc227` |
| T5 | `infrastructure/ai/checker/legacy-script.js`（infra） | 39 · 45-46 · 47-48 · 419-454 | 4 | 41 | **56** | `95c5bfcba0e661f7fbb8a582ea650e50b4bc09659ec70c1652a45222833d343b` |
| T6 | `infrastructure/ai/checker/package-inspect.js`（infra） | 665-682 · 733-742 · 744-765 · 767-787 · 789-812 | 5 | 95 | **110** | `2a535c4f25ce150a08ac977fa120cc7b0b89a61f50155848344381ad8029737f` |
| T7 | `infrastructure/ai/checker/state.js`（infra） | 645-661 | 1 | 17 | **25** | `e7b8811af5767ff46078704b8edd683aad9254d803fd8f9f99440fc5e6fc1835` |
| T8 | `infrastructure/ai/checker/review.js`（infra） | 1163-1251 · 1253-1280 | 2 | 117 | **129** | `6389e8b3cc60673f13e93d7b597583edf933c63b3a1512e880cbe9dac422eea3` |
| T9 | `infrastructure/ai/checker/generator.js`（infra） | 41-42 · 49-50 · 53-54 · 57-58 · 159-167 · 816-831 · 833-1159 | 7 | 360 | **386** | `421ffb3bebd634f726cf81f5f44db68f6e23fd2b44a31c32ba913f1cc0e33bb8` |
| T10 | `infrastructure/ai/checker/index.js`（infra，**新建**） | 1-23（文件头 JSDoc 逐字）+ 7 行 re-export | 1 | 23 | **37** | `450b80eb32ac0eee49f40296b34475c8b96813e17d6c75096def4736b74014b3` |
| — | 源文件 `server/src/services/checkerService.js` | 整体删除 | — | −1280 | **0（已删）** | — |
| | **合计** | | **49** | **1179** | **1348** | |

**行数账（逐行集合运算，闭合）**：`1280 = 1179（搬移）+ 38（文件头 1-38：JSDoc + 14 条 import）+ 13（段落横幅）+ 50（空行）`；**既非搬移/非 header/非 banner/非空 的残留行 = 0**（实测）。

- 目录 `server/src/domain/services/checker/` 与 `server/src/infrastructure/ai/checker/` 均为**新建**。
- 全部文件 **< 800**；最大 `generator.js` = **386 行**（A 预估 381，偏差 +1.3%）；观察带（>500）**无新增**。
- 10 文件行数合计 1348 > A 预估 1286：差值 = slice 之间的空行分隔符（每文件 n 个切片 → n−1 个空行），**非逻辑改动**。

---

## 3 三批执行记录（中间态用门面；每批都留了实测读数）

中间态做法（照 plan §9/§10）：源文件保留为**门面**——把已迁出的名字改为文件尾 `export { … } from '<新路径>';` 再导出，并在文件头补上仍被内部使用的 import。**导出面在每一批都保持 10 名**（真 import 验证，见下）。

| 批 | 动作 | 新建 | 源文件行数（实测） | `check-layers` | 未分层 | GodFile | 面探针 |
|---|---|---|---|---|---|---|---|
| 入场 | — | — | 1280 | 78 文件 / 违规 0 | 46 | 8 | BEFORE = 10 名 |
| **B1** | T1 + T2 迁出；源文件门面化（2 import + 4 re-export） | parsers.js 258 行、meta.js 71 行 | **884** | 80 文件 / 违规 0 | 46 | 8 | **10 名** ✅ |
| **B2** | T3–T8 六文件迁出；源文件继续门面化（5 import + 9 re-export） | prompts 192 / llm 84 / legacy-script 56 / package-inspect 110 / state 25 / review 129 | **402**（< 800 ⇒ **GodFile 8 → 7**） | 86 文件 / 违规 0 | 46 | **7** | **10 名** ✅ |
| **B3** | T9 迁出 + T10 `index.js` + 删源文件 + 改 I1/I2（+ review.js 回指改回，见 §5-D1） | generator.js 386 行、index.js 37 行 | **0（已删）** | 87 文件 / 违规 0 | **45** | 7 | **AFTER = 10 名** ✅ |

- B1 后源文件 = 884 行（A 预估 ≈978）。偏差原因见 §5-D4（**我不留旧段落横幅与空行**：搬走哪一块，就把只服务于该块的横幅一并带走 ⇒ 中间态更干净、可读，且**更早**远离 800 线）。
- B2 后源文件仅剩 T9（generator）+ 4 常量 + `stripHtml` + `markFailed` ⇒ 402 行，**GodFile 8 → 7 在该批达成**（与任务书一致）。
- B1/B2 中途读数均**未劣化基线**（违规 0、未分层不增）。

---

## 4 逐块搬移对照（sha256 切片判等 · **49/49 全等**）

**方法（可复现，脚本在 `/tmp/splitB/verify.cjs`，未入仓）**：
1. 从**冻结树** `git show HEAD:server/src/services/checkerService.js` 取源（先自证整体 sha256 = `37d2358c…`）；
2. 用 esprima **tokenizer** 做「顶层声明 → JSDoc 起点 + 括号深度归零终点」的块切分（不用 AST parser：esprima 4 的 parser 在源文件 :316 的 `{...spread}` 上抛错，tokenizer 不受语法版本限制），得 **48 块**（27 函数 + 21 常量）；
3. 对每块求 sha256，再在目标文件全文里做**字节子串定位**（`content.split(block).length-1`）⇒ 命中数 ≥1 且哈希由构造保证相等即判「逐字节相等」；
4. `index.js` 的**文件头 JSDoc（源 1-23）** 作为第 49 块单列。

**判等结果：49 / 49 块逐字节相等，0 块不等**（且 48 块的 `[start,end]` 全部**完整落在**其目标切片区间内，实测「blocks NOT contained in their slice = []」）。

| # | 符号 | 源行（冻结树） | 行数 | 源切片 sha256（全 64 位） | 目标文件命中数 | 判等 |
|---|---|---|---|---|---|---|
| 1 | `execFileAsync` | 39-39 | 1 | `4b3b772732d03639f1b69eddd482c8d863c6ad0b3b0764a42a49fd457717709d` | 1（infrastructure/ai/checker/legacy-script.js） | ✅ |
| 2 | `MAX_ROUNDS` | 41-42 | 2 | `6a848bdc2e673a22bf7f425b9c56243d6547ffd9e97ee59a517c9871f5a9feb8` | 1（infrastructure/ai/checker/generator.js） | ✅ |
| 3 | `DEFAULT_THRESHOLD` | 43-44 | 2 | `d6487dc143a92580a27dcb88930dcee38d588ab223ab16e4a457f249c2685092` | 1（domain/services/checker/meta.js） | ✅ |
| 4 | `SCRIPT_TIMEOUT_MS` | 45-46 | 2 | `17e504d57ca4e18f5a90eb1c6c1befb1f74e8d4414d2bdc651668eeb086edfd7` | 1（infrastructure/ai/checker/legacy-script.js） | ✅ |
| 5 | `SCRIPT_MAX_BUFFER` | 47-48 | 2 | `4f0f05b937e487e977a60270fe9244bb57c4aaac367d812038ec15052ee18e62` | 1（infrastructure/ai/checker/legacy-script.js） | ✅ |
| 6 | `DEFAULT_MAX_SCORE` | 49-50 | 2 | `33560ea1b00ad3fb34a920f9242319f29aee7272f835464079ca2cf3a95e54f7` | 1（infrastructure/ai/checker/generator.js） | ✅ |
| 7 | `LLM_MAX_TOKENS` | 51-52 | 2 | `5035cafa692c0dae99c1c97a36395eb06b190b681a88bc261fe4557cd432125d` | 1（infrastructure/ai/checker/llm.js） | ✅ |
| 8 | `STALE_GENERATION_MS` | 53-54 | 2 | `21b7cb888d5fc498e960407ae608c0ebfb6f4377e79f11ff09dd1e7a83664e8f` | 1（infrastructure/ai/checker/generator.js） | ✅ |
| 9 | `LLM_CALL_TIMEOUT_MS` | 55-56 | 2 | `2c1040cba1c5c3d4eae451127e6ea41f342f7f62798dfbf13070d4b3f5314372` | 1（infrastructure/ai/checker/llm.js） | ✅ |
| 10 | `STUCK_ROUNDS` | 57-58 | 2 | `2480c41ffac5fca81d6ffca8b3c8496984af77b820c63f42fe1bf00f34847b29` | 1（infrastructure/ai/checker/generator.js） | ✅ |
| 11 | `RULE_TYPES` | 60-70 | 11 | `e5e997fb197c5c1148af28f8be231fb869ea9732e76598cd85358b8a0c470fbf` | 1（domain/services/checker/parsers.js） | ✅ |
| 12 | `RULES_FORMAT` | 72-83 | 12 | `d789401b740a1fb58764332dfc952fcb714f12ead9b8d2261cfff15190866f91` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 13 | `AUTOMATION_LEVEL_LABELS` | 85-90 | 6 | `74d0092e046c519784e67c4f1409f1115486243a5afc37bcf43ef28bd9f75bbf` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 14 | `automationLabel` | 92-96 | 5 | `04ff53c3a1852ead3377609de02b68143aa5d18ddccb69fbbb4736939c758102` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 15 | `FACTS_SCHEMA_COMMON` | 98-103 | 6 | `2055f4a7bccbf7bd164bbf94129b17e3ea23843b1a33814a5981c1bc380cb63e` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 16 | `FACTS_SCHEMA_JS` | 105-112 | 8 | `b900d878fb9e77441a2fcb8d97e5ff8fa9ee54375323b4c367cfbdcd927ce000` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 17 | `FACTS_SCHEMA_JAVA` | 114-121 | 8 | `2f3f89465936ed75cfc3b2487d3ae26a0dbc7490ab9e765f5927042f16b8a9df` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 18 | `FACTS_SCHEMA_PYTHON` | 123-129 | 7 | `98c556e005c018ff2ab90d6f0c76ed66e2366945e8e833fb9ccda291ff7e2325` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 19 | `factsSchemaFor` | 131-136 | 6 | `bbf5e35ecef762e950d076a0648c75a06f2d7eca2abc46e828d09d119466b5f4` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 20 | `GENERATE_SYSTEM` | 138-146 | 9 | `d59600b354be99b3f218e756addbb2406b84de72d9f2937ef9da7af5d8220c23` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 21 | `RULES_EXAMPLE` | 148-157 | 10 | `046bdd5777f995d2367d1d98f11fa8580ae7beeeea6fabfeaefc86b16c77efd1` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 22 | `stripHtml` | 159-167 | 9 | `ff7a1d4316297aa520c8da70ceddbd174552ede0195e1e24b858183593c2cba1` | 1（infrastructure/ai/checker/generator.js） | ✅ |
| 23 | `extractJsonText` | 171-183 | 13 | `c499ac9d10fbca58b1ec19099113d65090769dc63100e6dbbdfd0b9e4f02215a` | 1（domain/services/checker/parsers.js） | ✅ |
| 24 | `repairTruncatedJson` | 185-212 | 28 | `c5e010a099bdea8d45a7dc5799b503b499f44902e1b7864276a4c66a5e37a3a7` | 1（domain/services/checker/parsers.js） | ✅ |
| 25 | `parseLooseJson` | 214-228 | 15 | `d225eccb5a15b2b502f270900d87ac372dc7a16995480b0239558ac5d07d2a03` | 1（domain/services/checker/parsers.js） | ✅ |
| 26 | `parseCheckerResult` | 238-271 | 34 | `55269b1ac97d5c91263f0784ae12c8ae8205d0483c96d7de1936598fa24f69a1` | 1（domain/services/checker/parsers.js） | ✅ |
| 27 | `parseCheckerRules` | 284-382 | 99 | `b58ba382610958fdb9c1572c81ca8148237336e6a80598177993a27ea914d0e8` | 1（domain/services/checker/parsers.js） | ✅ |
| 28 | `RUBRIC_NAME_SEPARATORS` | 386-387 | 2 | `f9edefbad5980dee3a21118af3c63e0059e905ebb51a906e0234c77367522015` | 1（domain/services/checker/parsers.js） | ✅ |
| 29 | `findMisplacedSubjective` | 399-415 | 17 | `1a62c95428fa11c954893d8bb6eca4262e861284e529b7e44db908faff217412` | 1（domain/services/checker/parsers.js） | ✅ |
| 30 | `runCheckerScript` | 426-454 | 29 | `4baf901bb7b56d7d9846b0db96801383febc3ab36d59e2dfd72e200f10c80272` | 1（infrastructure/ai/checker/legacy-script.js） | ✅ |
| 31 | `sleep` | 458-460 | 3 | `93e1b1035189240fbbf312d396a3d2e87e5bea3e0ecd8f64d43fc7173324c170` | 1（infrastructure/ai/checker/llm.js） | ✅ |
| 32 | `callLlm` | 473-525 | 53 | `403da9dec02bdfbf26f2d3daf5b850c383c0737b5f11c480d2b4158a009ee014` | 1（infrastructure/ai/checker/llm.js） | ✅ |
| 33 | `buildGenerateUserPrompt` | 540-570 | 31 | `aaca644ce90694d18f8fecba13c616777c8f5f6de8e218d3092d0260f9685ac3` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 34 | `buildCalibrateUserPrompt` | 572-624 | 53 | `3b5a5375ecd1780b50abf4819467d595cb9633244cd239ce7db6d3c2d84a1436` | 1（infrastructure/ai/checker/prompts.js） | ✅ |
| 35 | `attachNegativeFeedback` | 635-641 | 7 | `b385639906632e660280fa29dff775f9474621ef268da35a1e5bfe97930a8370` | 1（domain/services/checker/meta.js） | ✅ |
| 36 | `getCheckerState` | 650-661 | 12 | `3855846a37df122ee5fbe6c18a45b1b76509fb1e4187cd602d4fca114d3e7177` | 1（infrastructure/ai/checker/state.js） | ✅ |
| 37 | `packageFingerprint` | 665-682 | 18 | `c9fce92504a987bb5b8e0c8871de03d3a67af449779a4dd479d48870dd4dcd18` | 1（infrastructure/ai/checker/package-inspect.js） | ✅ |
| 38 | `appendVersion` | 684-700 | 17 | `30decb970d4473a90762e10153c8a3f4333381995e72e0fdcb4256a135b36b6b` | 1（domain/services/checker/meta.js） | ✅ |
| 39 | `markDefectReportItems` | 702-710 | 9 | `d6993ebaa17c82616dc1fa1d6e3def29acbe75fb24a94532c0aec4dc5926c596` | 1（domain/services/checker/meta.js） | ✅ |
| 40 | `buildReport` | 712-729 | 18 | `541b4032c7b37e990caa3cebe8fb5d4d8972fc30950839626715f18b6ed31c5c` | 1（domain/services/checker/meta.js） | ✅ |
| 41 | `PATH_PARAM_BY_TYPE` | 733-742 | 10 | `79e42b553cd851380762254595b8e94f26dab824ba63f78d77ae37d56c26f07d` | 1（infrastructure/ai/checker/package-inspect.js） | ✅ |
| 42 | `collectProjectPaths` | 744-765 | 22 | `9894f593e7e71749a3bd099aa87217f312b85050bb9a2d36af63e8c0a0194727` | 1（infrastructure/ai/checker/package-inspect.js） | ✅ |
| 43 | `validateRulePaths` | 767-787 | 21 | `7c0064c58cac19cb77ed4127d7c3da2c0267cbe023eb4fb10971b82651b1dfae` | 1（infrastructure/ai/checker/package-inspect.js） | ✅ |
| 44 | `enrichDeductionSnippets` | 789-812 | 24 | `5debd8b7df06b6af9cdd4411505eea214a22c49fc49aeebba4fc4fe418c17675` | 1（infrastructure/ai/checker/package-inspect.js） | ✅ |
| 45 | `markFailed` | 823-831 | 9 | `cf8e5fa30e42cc42d1463790af7dcec6f2b8df06a527171e765d793723779260` | 1（infrastructure/ai/checker/generator.js） | ✅ |
| 46 | `generateChecker` | 844-1159 | 316 | `ebd2fde53c63db3eb67a29fc26052787b0532795d9d97608e0d25a666a765ea6` | 1（infrastructure/ai/checker/generator.js） | ✅ |
| 47 | `confirmChecker` | 1174-1251 | 78 | `e0ff6a436cd39f2c2005a203192b0740d99ac04317b5865778943e2a98d1dca1` | 1（infrastructure/ai/checker/review.js） | ✅ |
| 48 | `rollbackChecker` | 1259-1280 | 22 | `cffb52c2c2036cf1260528ce27beb27e79755fd28205ce2705b30868fd0ed9f1` | 1（infrastructure/ai/checker/review.js） | ✅ |
| 49 | `(文件头 JSDoc)` | 1-23 | 23 | `95d9bbeb933b24ea20d934166c544bd15c1f701e557135536849799d81781e39` | 1（infrastructure/ai/checker/index.js） | ✅ |

### 4.1 反向校验：目标文件不存在「非搬移字节」（实测）

把每个目标文件里的切片子串**逐个删除**，剩余非空行**只允许**是 banner / import 行 / `export …` 行：

| 目标文件 | 删除切片后残留非空行 | **未匹配行** |
|---|---|---|
| parsers.js | 5 | **0** |
| meta.js | 5 | **0** |
| prompts.js | 6 | **0** |
| llm.js | 7 | **0** |
| legacy-script.js | 10 | **0** |
| package-inspect.js | 8 | **0** |
| state.js | 6 | **0** |
| review.js | 9 | **0** |
| generator.js | 18 | **0** |
| index.js | 12 | **0** |

⇒ 10 个文件的**每一个非空白字节**都可归因于「源切片 / banner / import 行 / export 行」，**没有任何夹带的改写**。

### 4.2 死代码与既有缺陷：逐字保留（三条硬要求②）

| 单元 | 源行 | 判等块 | 结论 |
|---|---|---|---|
| `getModel` 零消费死绑定 | 32 | T4 的 import 子句 | ✅ 逐字带（`llm.js:7`；全文 `getModel` 出现 **1** 次 = import 内） |
| `RULE_TYPES` 的**错误注释**「与 ruleExecutor.RULE_TYPES 一致」 | 60 | 块 `RULE_TYPES` [60-70] | ✅ 哈希相等（**未改对**） |
| `buildGenerateUserPrompt`「纯导出零外部引用」 | 540-570 | 块 | ✅ 仍在导出面内（**未降级为私有**） |
| 旧路径族 `parseCheckerResult` / `runCheckerScript` | 238-271 / 426-454 | 2 块 | ✅ 原样迁出（`parsers.js` / `legacy-script.js`），**未删** |
| 生成/自举校准段（316 行单函数 + 闭包 + 11 处 DB 写） | 814-1160 | 块 `generateChecker` [844-1159] 等 | ✅ **整段位移，未在函数内部再分解**（§5-D5） |

---

## 5 与 A 方案的偏离（4 条，均为**落地必需**或**如实登记**）

### D1（重要）B2 中间态：`review.js` 需**回指门面**一行，B3 改回

A 的 §2.4-T8 指定 `review.js` 从 `./generator.js` import `generateChecker`，但 A 的 §9-B2 又要求**在 B2 就迁出 T8**（此时 `generator.js` 尚未建立）。二者不能同时成立：
- B2 中间态：`review.js` 的该行写成 `from '../../../services/checkerService.js'`（门面的 `generateChecker` 是**函数声明**，ESM 实例化期即初始化 ⇒ 门面 ↔ review 的瞬时环**不产生 TDZ**；实测真 import 与控制台零报错）；
- B3：该行**改回 `'./generator.js'`**（脚本断言替换发生次数 = 1，否则 exit 1），**最终态与 A 的 §2.4-T8 逐字一致**（`review.js` 仅 import 头被改写，函数体块判等仍 100% 相等）。

> 登记理由：这是**中间态**产物；最终态无环（`cycle-check` 亦为 SCC 0）。A 的方案在此处存在一处内部不一致，落地时按「批次构成照 A，最终 import 照 A」处理。

### D2（重要）门面必须补全**导出面**，不能只补「剩余代码引用到的名字」

我第一版门面生成逻辑只把「剩余代码仍引用的已迁出导出名」再导出 ⇒ B2 门面**静默丢掉 5 个名字**（`parseCheckerResult` `runCheckerScript` `getCheckerState` `confirmChecker` `rollbackChecker`，因为剩余代码（generator）不引用它们）。**实测面探针捕获**：`count=5`（缺 5）。
**修正规则**：门面必须再导出**所有「源文件中带 `export` 且已迁出」的声明**，与「剩余代码是否引用」无关。修正后 B1/B2 面探针均为 **10 名**。
> 这正是「导出面靠人读容易漏」的又一实例，与 step 1 的 D1（漏绑定）同源 ⇒ 我把它写进了自动生成脚本，并用**真 import 的 `Object.keys`** 而非静态推断做判据。

### D3 banner 与「grep 旧路径 = 0」的字面冲突（承 step 1 的 D3）

A 的 §10.4 强制 banner 写「由 `server/src/services/checkerService.js` 拆分而来」，而 §10-B13 又要求 `grep -rn 'services/checkerService.js' server/src server/test server/scripts` = 0。判定：**banner 是溯源注解、不是 import**，保留 §10.4 格式。实测：
- **import 规格符命中 = 0**（`grep -rn "from '.*services/checkerService" server/src server/test server/scripts` = 0）
- 命中项 = **10 条 banner** + `generator.js` 内 17 条 `'checkerService: …'` **日志文案**（属搬移块，逐字保留）

### D4 行数偏差（如实登记，不作判据）

| 项 | A 预估 | 实测 | 说明 |
|---|---|---|---|
| 10 文件合计 | ≈1286 | **1348** | +62 = 切片间空行分隔符 |
| 最大文件 generator.js | ≈381 | **386** | +5 |
| B1 源文件 | ≈978 | **884** | 我不保留「已搬空段落」的横幅与空行 |
| B2 源文件 | ≈477 | **402** | 同上；仍 **< 800** ⇒ GodFile 8→7 如期达成 |

判据是「< 800」而非精确值（A §12-5 同口径）。

### D5 生成/自举校准段：**整段位移，未拆分**（照 A 的裁定）

`generateChecker`（源 844-1159，316 行单函数）+ `markFailed` + 4 常量 + `stripHtml` 作为**一个整体块**进入 `generator.js`（块 sha256 `ebd2fde5…` 全等）。**未**提取子函数、**未**外提闭包、**未**收拢 11 处 DB 写、**未**改错误语义。⇒ 崩溃恢复粒度与「抛错即反馈」的控制流**逐字未动**。

---

## 6 导出面证据（真 import 对拍 + 声明行审计）

### 6.1 BEFORE vs AFTER（两个**独立 node 进程**，`PORT=0`，禁网）

BEFORE 用**冻结树**（`git archive HEAD server` → `/tmp/splitB-before`，`shasum` 复核 = `37d2358c…`，node_modules 以软链复用）：

```
=== face BEFORE (frozen tree) ===
BEFORE count=10
attachNegativeFeedback,buildGenerateUserPrompt,confirmChecker,findMisplacedSubjective,generateChecker,getCheckerState,parseCheckerResult,parseCheckerRules,rollbackChecker,runCheckerScript
=== face AFTER (new index.js) ===
AFTER  count=10
attachNegativeFeedback,buildGenerateUserPrompt,confirmChecker,findMisplacedSubjective,generateChecker,getCheckerState,parseCheckerResult,parseCheckerRules,rollbackChecker,runCheckerScript
```

> 两侧输出**逐字符相同**（count 相等 + 排序后名字串相等）；C 可用 §11-V8 的命令在冻结树与改后树上各跑一次复现。

⇒ **10 名逐字等价**：`attachNegativeFeedback, buildGenerateUserPrompt, confirmChecker, findMisplacedSubjective, generateChecker, getCheckerState, parseCheckerResult, parseCheckerRules, rollbackChecker, runCheckerScript`（**无多、无少、无改名**）。

### 6.2 声明行 export 审计

- 源文件声明行 `export` = **10 个**（`parseCheckerResult@238` `parseCheckerRules@284` `findMisplacedSubjective@399` `runCheckerScript@426` `buildGenerateUserPrompt@540` `attachNegativeFeedback@635` `getCheckerState@650` `generateChecker@844` `confirmChecker@1174` `rollbackChecker@1259`）
- 新文件声明行 `export` = **10 个**，名字集与源**逐字相同**（位置：`parsers.js:83/127/240`、`meta.js:16`、`prompts.js:106`、`legacy-script.js:28`、`state.js:14`、`review.js:23/108`、`generator.js:71`）
- **`export *` = 0**；文件尾 `export { … };` 块 = **5 行**（`parsers.js` `meta.js` `prompts.js` `llm.js` `package-inspect.js` 各 1）——即「跨模块暴露一律走文件尾 export 块」的纪律**未被破坏**（§10.3）。

---

## 7 绑定自查（跨文件引用闭包扫描 + 运行时取证）

### 7.1 闭包扫描（静态，脚本 `/tmp/splitB/verify2.cjs`）

方法：对每个目标文件用 tokenizer 取「非注释、非 import/export-from 行、非属性访问 `.x`、非对象键 `x:`」的标识符集合，与「本文件顶层声明 ∪ 本文件 import 绑定」求差；差集中凡命中源文件 48 个顶层名或 30 个 header 绑定名者 = **缺失绑定**。

```
存在缺失绑定的文件数: 0
```

| 目标文件 | 顶层声明 | import 绑定 | 被引用绑定 | 结论 |
|---|---|---|---|---|
| parsers.js | 8 | **0** | 0 | ✅（domain，零 import） |
| meta.js | 5 | **0** | 0 | ✅（domain，零 import） |
| prompts.js | 12 | 1（`RULE_TYPES` ← parsers.js） | 1 | ✅ |
| llm.js | 4 | 4 | **3** | ✅ 唯一未引用 = `getModel`（**死绑定，照带**） |
| legacy-script.js | 4 | 6 | 6 | ✅ |
| package-inspect.js | 5 | 3 | 3 | ✅ |
| state.js | 1 | 2 | 2 | ✅ |
| review.js | 2 | 5 | 5 | ✅ |
| generator.js | 7 | 27 | 27 | ✅ |
| index.js | 0 | 0（7 行 `export … from`） | — | ✅（只承载导出面，由 bind-check 校验） |

**每个相对 import 的目标模块存在性与「导入名是否真的是该模块的导出」逐条复核：全部命中**（含 `rule/index.js` 的 `validateRules/runRules/resolveProjectRoot`、`deepseek.js` 的 `getBaseUrl/getApiKey/getModel/summarizeRubricItems`、`projectPaths.js` 的 `standardDir`、`ruleMutator.js` 的 `validateNegativeTests`、`factExtractor.js` 的 `extractFacts`）。

> **跨文件引用闭包总表**（生成端 → 消费端新增的 24 条内部边）：`prompts→parsers(RULE_TYPES)`；`legacy-script→parsers(parseCheckerResult)`；`state→meta(DEFAULT_THRESHOLD)`；`review→state(getCheckerState)`、`review→generator(generateChecker)`；`generator→parsers(2)`、`→meta(5)`、`→prompts(3)`、`→llm(1)`、`→package-inspect(4)`；`index→parsers(3)+meta(1)+legacy-script(1)+prompts(1)+state(1)+generator(1)+review(2)`。**无反向边**（infra → services/utils 属 unlayered，门禁放行；无一条指向 application/interface）。

### 7.2 `getModel` 专项（硬要求②「照带」）

```
llm.js import 行:  import logger from '../../../utils/logger.js';
                   import { getBaseUrl, getApiKey, getModel } from '../../../services/deepseek.js';
llm.js 全文 'getModel' 出现次数: 1   ← 仅 import 子句；零消费（与源文件 :32 语义逐字一致）
```
⇒ **人工补回的唯一条目已在位**；自动推导（token 闭包）**推导不出**它（0 引用），所以它是本清单里唯一靠人读确认的绑定 —— 已由 plan §1.1-1 登记，并由我在 §7.1 的「未被引用绑定」列**显式**呈现（不允许被静默丢弃）。

### 7.3 运行时绑定 smoke（自建探针 `/tmp/splitB/probe-smoke.mjs`，`PORT=0`，**零外网**）

对**零覆盖的纯模块**做一次调用级验证（证明搬移后没有 `ReferenceError`）：

```
PASS buildGenerateUserPrompt lang=javascript  :: len=2385
PASS buildGenerateUserPrompt lang=java  :: len=2465
PASS buildGenerateUserPrompt lang=python  :: len=2372
PASS buildGenerateUserPrompt lang=undefined  :: len=2385
PASS buildGenerateUserPrompt(no fixedItems/stdFileTree/desc)  :: len=2224
PASS factsSchemaFor(java) 分支            PASS factsSchemaFor(python) 分支
PASS GENERATE_SYSTEM 非空
PASS buildCalibrateUserPrompt error/deductions/defectItems/weakRules/empty  :: len=483/561/666/635/547
PASS appendVersion 递增 + active 翻转  :: id1=1 id2=2 active=2
PASS buildReport 失分项/分数/note      PASS markDefectReportItems 命中 note
PASS attachNegativeFeedback 保留既有字段 + weakRules / (null,null) 兜底
PASS packageFingerprint 12 位指纹 / 不存在→null  :: fp=7022a415d5b6
PASS collectProjectPaths files/dirs  :: files=3 dirs=1
PASS validateRulePaths 命中/未命中/无 key  :: [{"id":"a2",...},{"id":"a4",...}]
PASS enrichDeductionSnippets 读片段 + 越界守卫  :: [{"id":"a1","snippet":"..."},{"id":"a9"}]
PASS RULE_TYPES 实为 8 项（本轮登记不修）
PASS prompt 鼓励的 ast_pattern 被静默丢弃 + 分值补到末项（缺陷取证）
PASS callLlm 打桩返回内容 + 未走真实外网  :: fetchCalls=1 url=http://127.0.0.1:9/chat/completions max_tokens=16000
PASS callLlm 未思考模式 temperature=0.2 / stream=false
SMOKE SUMMARY: 26 passed / 0 failed
FETCH CALLS: 1  (全部指向 http://127.0.0.1:9，真实外网 0 次)
```

> 探针在 import 被测模块**之前**替换 `globalThis.fetch`（桩体不调用原始 fetch），并叠加 `DEEPSEEK_BASE_URL=http://127.0.0.1:9`（不可达端口）作第二重保险 ⇒ **禁网三重保证**（第三重：断言所有 fetch URL 均以该前缀开头，实测 1/1 命中）。
> `llm.js` 的 `sleep` 只在实际重试时触发，本例走成功分支（0 次 `setTimeout` 等待）。

---

## 8 门禁实测（5 门禁全部 PASS；原始输出）

```
### 1) node server/scripts/check-layers.mjs
文件 87 个，违规 0 条（0 类规则），未分层待迁移 45 个
exit=0

### 2) node scripts/gates/arch-metrics.mjs
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=46  实测=45
  ✓ godfileOver800     基线=8  实测=7
  · >500 行（观察带，不计判据） 基线=18 实测=17
  GodFile >800 行：teacherController.js (1338) / Doc.vue (1106) / deepseek.js (1051) / ReviewDetail.vue (988) / QuestionEdit.vue (983) / reviewController.js (965) / ProjectQuestionEdit.vue (868)
  分层守卫原文：文件 87 个，违规 0 条（0 类规则），未分层待迁移 45 个
结论：PASS
exit=0

### 3) node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 87 文件 / 194 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 0）
  自环（文件 import 自身）: 0
结论：PASS
exit=0

### 4) node scripts/gates/hard-metrics.mjs
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue（去块注释），共 41 个文件
  ✓ hex6  基线=0 实测=0    ✓ important 基线=0 实测=0    ✓ modalConfirm 基线=0 实测=0
结论：PASS
exit=0

### 5) node scripts/gates/bind-check.mjs
roots                        : server/src, server/test
modules scanned              : 185          （改前 176）
named import bindings checked: 592          （改前 558）
unresolved relative imports  : 4 (仅登记)     （与改前同 4 条，测试夹具合成串）
external (out-of-root) refs  : 1 (仅登记)     （与改前同 1 条）
BINDING VIOLATIONS           : 0
exit=0
```

**改前 → 改后对照**：

| 门禁读数 | 改前（HEAD，我实测） | 改后 | 判据 |
|---|---|---|---|
| `check-layers` 文件 / 违规 / 未分层 | 78 / **0** / **46** | 87 / **0** / **45** | 违规 0、未分层 46→45 ✅ |
| `cycle-check` 文件 / 边 / SCC / 自环 | 78 / 178 / **0** / 0 | 87 / **194** / **0** / 0 | SCC 0 ✅（边数如实记录，A 预判 ≈194 **命中**） |
| `bind-check` 模块 / 绑定 / 违规 | 176 / 558 / **0** | 185 / 592 / **0** | 违规 0 ✅ |
| `hard-metrics` | 0/0/0 | 0/0/0 | 逐字不变 ✅（只扫 client） |
| `arch-metrics` | PASS（unmigrated 46 / GodFile 8 / 观察带 18） | PASS（**45 / 7 / 17**） | 不劣于基线且下降 ✅ |

> `checkerService.js (1280)` 与 `client/src/views/teacher/ProjectQuestionEdit.vue (868)` 之外，**GodFile 名单里已经没有 checkerService.js**（实测名单 7 项）。
> 说明：`export { … } from` 行对 `check-layers`/`cycle-check` 的 `IMPORT_RE` **不可见**（A §2.3 已实测），因此 `index.js` 的 7 行 re-export **不产生**层违规与循环边；这 7 行的正确性由 **bind-check（能校验 re-export）+ §6.1 真 import** 双证。

---

## 9 定向测试（删源文件后复跑；**未跑全量回归**，那是 C 的职责）

装置：`DATABASE_URL` = 由 `server/.env` **只换库名**为 `exam_system_test` 派生；**显式 `PORT=0`**（`server/test/setup.js:2` 亦强制）；每个套件独立 jest 进程（`--runInBand --forceExit`，避开 tree-sitter 同进程 ABI 风险）。

| 套件 | 为什么选它 | 结果 |
|---|---|---|
| `server/test/unit/infrastructure/checker-service.test.js` | **唯一直接 import 该模块**的套件（A 报 42 例） | `Test Suites: 1 passed` ｜ **`Tests: 42 passed, 42 total`** ｜ 0.55 s |
| `server/test/integration/ownership-guards.test.js` | 经 `helpers.js → app.js → routes/teacher.js → checkerController.js` **真实加载新 `index.js`**（含 R15–R19 检查器端点 404/400 短路用例） | `Test Suites: 1 passed` ｜ **`Tests: 62 passed, 62 total`** ｜ 2.17 s |
| **合计** | | **104 例 / 0 失败** |

- **无失败 ⇒ 未触发「停下来回报 Captain」条件**；**未改动任何测试断言**（`checker-service.test.js` 仅第 13 行 import 路径变更，见 §1.2）。
- B1 / B2 中间态也都复跑过 `checker-service` 套件：**42/42 通过**（两批各一次）。

---

## 10 `RULE_TYPES` 缺陷登记（**只登记，未修** —— 硬要求③）

| 项 | 内容 |
|---|---|
| 缺陷 | `RULE_TYPES`（源 :60-70，现 `parsers.js`）注释声称「与 `ruleExecutor.RULE_TYPES` 一致」，实测 **8 项 vs 11 项**（少 `ast_pattern` / `count_imports` / `normalized_text`） |
| 后果链 | `buildGenerateUserPrompt`（:563 语义级规则「优先」指令 + :562 只注入 8 项白名单）→ `parseCheckerRules`（:304 `if (!RULE_TYPES.includes(it.rule_type)) continue;` **静默丢弃**）→ :348-378 总和归一化把分值**补到末项**（**分数虚高 + 检查项丢失**） |
| 本轮取证（运行时，非推演） | 喂入 `{objective_items:[{rule_type:'ast_pattern',max_score:30},{rule_type:'file_exists',max_score:70}]}` ⇒ 实测返回 **只 1 项**：`[{"id":"a2",... "rule_type":"file_exists","max_score":100}]`（`ast_pattern` 被丢、分值 70 被补成 100） |
| 本轮动作 | **零动作**：注释、白名单、归一化逻辑、prompt 文案**全部逐字保留**（块 `RULE_TYPES` 与 `parseCheckerRules` 的 sha256 均相等，见 §4） |
| 建议立项 | 独立缺陷项（**行为变更**）：白名单与 prompt 对齐 + 回归夹具（A §7.3 的 F02/F03 已覆盖该分支）＋ DB 侧取证「历史上是否真有 `ast_pattern` 被丢的样本」 |

---

## 11 给 Agent C 的验证指令

1. **锚点**：源文件已删 ⇒ `git show c26c8dce5dcdec20acd5c0ec6af5fe1359b7cb23:server/src/services/checkerService.js | shasum -a 256` 必须 = `37d2358c32ab253054b6d152d1f9246a31419cc7a711352fb3d1cb17993409b0`。
2. **V2 静态判等**：请用**你自己的**脚本重做 §4（勿复用 `/tmp/splitB/verify.cjs`）；判据 = **48 声明块 + 1 文件头块，0 块不等**；并做反向「未匹配字节 = 0」。切片基准务必用**冻结树**。
3. **V3 声明行 export 审计**：目标侧声明行 `export` = **10** 且名字集与源相同；`export *` = **0**；文件尾 `export { … };` 块 = **5**。
4. **V8 导出面**：`PORT=0 node --input-type=module -e "const m=await import('./server/src/infrastructure/ai/checker/index.js');console.log(Object.keys(m).sort().join(','))"` ⇒ 恰好 10 名（§6.1 清单）；建议与**冻结树**同法对拍（BEFORE 10 / AFTER 10）。
5. **V4/V6/V9 行为对拍与变异反证**：按 A §7.3（F01–F11 + G01–G22 + H01–H09；两独立进程 + 三桩 S-A/S-B/S-C + 三维度 JSON + 变异必须报差异）。**重点补**：`generator.js`（G 系列，本步零覆盖主链路）、`review.js` / `state.js`（H 系列）、`package-inspect` 的越界守卫、`llm.js` 的重试/超时/空内容分支（`callLlm` 用**全局 fetch** ⇒ 必须打桩 + `DEEPSEEK_BASE_URL` 兜底）。
6. **V10 分层门禁 + 证伪**：`node server/scripts/check-layers.mjs` ⇒ 违规 **0** / 未分层 **45**；请按 A §3 的四条反向陷阱在 `/tmp` 副本做证伪（**不得进仓库**）——尤其陷阱③（把 `generator.js` 挪到 `application/` 必须同时命中 `application-imports-external` 与 `application-imports-infra`）。
7. **V11/V12/V13/V14**：`arch-metrics` PASS / GodFile **7** / 观察带 17；`cycle-check` SCC **0**（改后边数基线 **194**，178 是改前值）；`bind-check` 违规 **0**（185 模块 / 592 绑定；**重点看 `index.js` 的 7 行 re-export**，那是唯一能验它的门禁）；`hard-metrics` 0/0/0。
8. **V15 全量回归**：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`（先查空序号，已占用 exit 4）；判据 = 日志 **4 处 `Test Suites:`** + `failed = 0`；**不得引用旧用例数**（constraints §3-17）。我只跑了 2 个定向套件（104 例），**全量是你的职责**。
9. **V16 越界自查**：`git status --porcelain` 应只见 3 条 tracked 变更（2 M + 1 D）+ 10 个新文件（+ 本报告）+ 入场前既有的 `M docs/split/status.md`（**非本步产物**，勿记入）；`client/dist` / `tests/` / `scripts/gates/` mtime 无变化。
10. **建议独立复核的 3 个「落地件 vs 方案」差异点**：**D1**（`review.js` 的 `generator` import 在 B2/B3 间的改写）、**D2**（门面导出面补齐规则 —— 值得你验证「最终态是否仍有 10 名」）、**D3**（banner 里出现旧路径属预期，import 规格符必须 0 命中）。

---

## 12 局限声明（诚实边界）

1. **未跑全量回归**（C 的职责）；本文测试结论只覆盖 2 个定向套件 104 例（`checker-service` 42 + `ownership-guards` 62）。
2. **未跑 A 的 F/G/H 全量行为对拍与变异反证**（C 的职责）。本步用的是**静态逐块判等（49/49）+ 真 import 面/绑定探针（26 项）**：前者能覆盖 Z17 这类夹具打不到的分支（整块字节相等），但**不等于**运行时行为等价的完整证明；后者只覆盖**无 IO 的纯函数**（`state`/`review`/`generator` 需要 DB 与 LLM，未做调用级验证，仅由真 import 完成**链接期**绑定校验）。
3. **`generateChecker` 整段未拆**（照 A 的裁定）：316 行单函数 + 闭包捕获 + 11 处 DB 写 + 外网 + 零覆盖 ⇒ 本步只做**位移**；A §6 的「应用层化」专项**未启动**。
4. **两段旧路径保留**（`parseCheckerResult` / `runCheckerScript`）：本步原样迁出，导出面 10 名未动；删除属**行为变更**，须另开一步 + 数据侧取证。
5. **未审计依赖邻居的层归属**：`services/{deepseek,projectContextBuilder,ruleMutator,factExtractor}.js`、`utils/{prisma,logger,projectPaths}.js` 仍是 **unlayered**，T3–T9 持续依赖它们（A §12-7 已登记的既有技术债）；若后续步骤迁它们的层，本步相对路径需同步调整（**不是本步缺陷**）。
6. **中间态（B1/B2）读数**是门面存在时的真实门禁输出，仅作过程证据；最终判据以 §8 的改后读数为准。
7. **本文所有行数 / 哈希 / 计数 / 门禁读数 / 测试结果均由我在本轮实测**（脚本见各节方法，全部在 `/tmp/splitB*`，未入仓），未照抄 A 的预估；偏差已逐处标明（§5-D4）。
8. **`git status` 里的 `M docs/split/status.md` 不是本步产物**（入场前即为 M）；我全程未写入该文件。
