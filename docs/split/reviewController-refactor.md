# reviewController 拆分执行报告（GodFile 拆分专项 · step 8 · Agent B）

- **step**: 8 ｜ **角色**: Agent B（唯一写者）｜ **日期**: 2026-10-11 ｜ **分支**: master
- **方案依据**: `docs/split/reviewController-plan.md`（A，671 行，本报告逐节引用）｜ 回归网验证 `docs/split/reviewController-B0-verify.md`（C）
- **目标文件**: `server/src/controllers/reviewController.js`（965 行，sha256 `62ec56ed4c647687a09bcd2329c5ceeca1968610e9495a7fa1a31d4fb1481add`）→ **11 个新文件**（interface 6 + infrastructure 5，其中 2 个是 barrel）+ 改 I1/I2 + **删除源文件**
- **一句话结论**: **B0b 2 例已补（替身文案确定性区别于守卫文案）**；**25/25 搬移块逐块 sha256 全等**、反向未匹配字节 **0**；导出面 **17 名逐字等价**（T6 ∪ T11，交集 ∅）；**barrel 先建、bind-check 先过、再改 I1/I2、最后删源**；门禁七项 **0 违规 / 未分层 44→43 / GodFile 3→2 / SCC 0 / bind 0 / eslint 0-59 / lint-check exit 0 且「已迁移 1 条」**；定向测试 **23 套件 / 264 例 / 0 failed**（18 个独立 jest 进程）。

---

## 0 判定摘要（判据 → 实测）

| # | 判据（来源） | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V-1 | 逐块 sha256 判等（硬要求①） | 25 块全等、每块命中数 ≥1 | **25/25 全等**，每块命中数恰 **1**（含嵌套 `scoreItem`） | ✅ |
| V-2 | 反向校验（硬要求①） | 目标文件无非搬移字节 | 11 文件删除切片后残留非空白行 **0 未匹配** | ✅ |
| V-3 | 声明行 export | 不得加/改 export；跨模块暴露走文件尾 export 块 | 声明行 export **恰 17 个**（名字集与源逐字相同）；`export *` **0**；文件尾 `export { … };` 块 **2 个** | ✅ |
| V-4 | 导出面等价（plan §11-V8） | 17 名逐字相等 | BEFORE 17 == AFTER 契约面 17，**逐字符相同**；T6∩T11 = **∅** | ✅ |
| V-5 | 绑定自查（硬要求：前三步都栽在漏绑定） | 0 缺失绑定 | 自由标识符残留 **0**；命中源顶层名/import 绑定名的缺失 **0** | ✅ |
| V-6 | interface 侧不得 import/re-export infrastructure（硬要求②） | 0 | `server/src/interface/**` 中指向 infrastructure 的 import/export-from = **0** | ✅ |
| V-7 | 未分层待迁移（plan §9） | 44 → **43** | `check-layers`：文件 106 / 违规 0 / 未分层 **43** | ✅ |
| V-8 | GodFile（plan §9） | 3 → **2** | `arch-metrics`：godfileOver800 **2/2**，名单只剩 teacherController(1338) / Doc.vue(1106)；PASS | ✅ |
| V-9 | 循环依赖 | SCC 0 | server/src：106 文件 / **238 边** / SCC **0** / 自环 0；client/src：99 文件 / 244 边 / SCC **0** | ✅ |
| V-10 | 硬指标 | 0/0/0 | hex6 0 · important 0 · modalConfirm 0，PASS | ✅ |
| V-11 | 绑定门禁 | 违规 0 | modules 208 / 710 bindings / **BINDING VIOLATIONS 0**（unresolved 4、external 1 与基线一致） | ✅ |
| V-12 | lint (a) eslint | error 0 / warn ≤59 | 205 文件 / **error 0 / warn 59**（零余量，总数不变） | ✅ |
| V-13 | lint (b) lint-check | exit 0 / 31 条 + 迁移 1 | **31 → 31**、新增 **1（已迁移，不计阻断）**、**exit 0**，逐字 from→to 见 §10 | ✅ |
| V-14 | 定向测试 | 0 failed、独立进程、exam_system_test、PORT=0 | **18 个 jest 进程 / 23 套件 / 264 例 / 0 failed** | ✅ |
| V-15 | B0b 前置补测 | 2 例且替身文案 ≠ 守卫文案 | 2 例（Z7/Z8）；文案 `RCB0B-*-USE-CASE-404` ≠ `提交不存在`；正控变异 → **2 failed** | ✅ |

---

## 1 版本锚点与越界自查

### 1.1 锚点（逐字命中）

```
$ git log --oneline -1
993963f docs(step8-B0): 归档 C 的独立验证 + 按其实测更正计数口径 + 登记待决清单

$ shasum -a 256 server/src/controllers/reviewController.js
62ec56ed4c647687a09bcd2329c5ceeca1968610e9495a7fa1a31d4fb1481add  server/src/controllers/reviewController.js
$ wc -l  → 965        $ bytes → 43827
```

拆分切片基准 = **`git show HEAD:server/src/controllers/reviewController.js`**（落盘为仓库外冻结副本 `/tmp/splitB/before/server/src/controllers/reviewController.js`，拆前拆后两次复核 sha256 恒为 `62ec56ed…`）。**全部 25 处切片取自该冻结副本，不读工作树**（见 §12-D1 的过程事故与纠正）。

### 1.2 改动面（`git status --porcelain -uno` 的实测原文）

```
 M server/src/controllers/projectReviewController.js
 D server/src/controllers/reviewController.js
 M server/src/routes/teacher.js
```

未跟踪新增：`server/src/interface/http/controllers/review/{class-scope,list,batch,summary,export,index}.js`、`server/src/infrastructure/review/{scope,submission,project,prompts,index}.js`、`server/test/integration/rc-usecase-404-contract.test.js`、本报告。

### 1.3 未触碰声明

- 未改 `client/**`、未改 `tests/`、未改 `client/dist`、未改 `scripts/gates/**`、未改 `server/scripts/**`、未改 `docs/pipeline/lint-baseline.json`（**未刷新基线**）；
- 未新增依赖（11 个新文件的 import 规格符 = 源文件原有 11 条的重新分发，见 §5.3）；
- 未起常驻服务、未占用 :5173/:3000；定向测试与探针一律显式 `PORT=0`；未联网（探针只做本地 import，未发任何外部请求）；
- **零 git 写操作**（无 add/commit/clean/stash/checkout/reset/restore）；唯一 git 读取是 rev-parse / log / show / status / diff / archive。

---

## 2 B0b 前置补测（独立小批，**先于任何搬移**）

**文件**: `server/test/integration/rc-usecase-404-contract.test.js`（227 行，新建；前缀 `rcb0z_`、院校代码 `29441`、自建自清、不依赖 setup seed）。

**打靶对象**（C 的 §5 裁定：黑盒不可达成立，但 `app.locals.reviewUseCases` 是可写属性 ⇒ 端口替身 + 真实 HTTP 可确定性触发）：

- `regradeSubmission` 的 `:275-276`（EntityNotFoundError → 404/1004，**含 200 正例**）
- `updateScore` 的 `:295-296`

**防假阳性的硬约束（C 的 C4 陷阱）落地方式**：

| 措施 | 实现 |
|---|---|
| 替身文案必须 ≠ 守卫文案 | `RCB0B-REGRADE-USE-CASE-404` / `RCB0B-ADJUST-USE-CASE-404`；并**显式断言** `expect(REGRADE_404).not.toBe(GUARD_MESSAGE)` 与 `expect(res.body.message).not.toBe('提交不存在')` |
| 证明「不是守卫短路」 | 逐例断言替身**被调用恰 1 次**且 cmd 逐字（`{submissionId}` / `{submissionId, finalScore: 88}`） |
| 两个 404 不同源的对照 | 不存在 id（`2000000000`）→ 同样 404/1004，但 message 是守卫文案「提交不存在」且替身**零调用** |
| DB 零写入 | Z8 断言 finalScore / teacherFeedback / status 三字段不变 |

**正控（证明断言有牙）**：把两个常量 sed 成守卫文案「提交不存在」的**变异副本** `rc-usecase-404-MUTANT.test.js` → `2 failed, 2 total`（**红**）⇒ 若替身文案与守卫相同，该用例必红，不会静默全绿。变异文件已 rm，`ls rc-usecase-404*.test.js` 只剩正式文件。

**实测**：`Test Suites: 1 passed / Tests: 2 passed / 0 failed`（PORT=0、exam_system_test）。

> B0b 的提交边界：本轮被硬约束禁止 git 写操作 ⇒ **提交由 Captain 执行**；已单独消息告知（该文件路径独立，可单独 git add 成一个先行提交）。

---

## 3 目标形态与实测行数（**11 个文件**：9 个搬移文件 + 2 个 barrel）

> 口径说明：任务书的「11 个新文件 + 2 个 barrel」与本报告的「11 = 9 + 2」是同一件事的两种数法（B1 的 5 + B2 的 4 + B3 的 2 = **11**）；若读成 13 会把 2 个 barrel 重复计一次。

| # | 目标文件（层） | 源区间（逐字） | 搬移块 | 搬移行 | **实测总行** | A 预估 | 整文件 sha256 |
|---|---|---|---|---|---|---|---|
| T1 | `interface/http/controllers/review/class-scope.js`（**interface**） | 145-168 | 1 | 24 | **34** | ≈32 | `26fad43380fe4303fb490667a0e58ad40b56c847423c6e472ccda23d5e67760e` |
| T2 | `interface/http/controllers/review/list.js`（interface） | 13-37 · 39-52 · 170-196 · 198-221 | 4 | 90 | **104** | ≈100 | `8ddd3add6924375ca7c830c14395e3b1efe11936df6031614194120cc2f7e562` |
| T3 | `interface/http/controllers/review/batch.js`（interface） | 114-143 · 318-372 · 374-420 · 422-444 | 4 | 155 | **168** | ≈166 | `dbf604719654d0738c0c4e3022de87c2d0fd352ecc1b9b491fdf93fdbeeecd4b` |
| T4 | `interface/http/controllers/review/summary.js`（interface） | 446-516 · 518-606 | 2 | 160 | **173** | ≈170 | `c6afb8efbc48d6d14427b590eed4d42beeb28e87cd23a73749fa0a2004d79c9f` |
| T5 | `interface/http/controllers/review/export.js`（interface） | 608-761（含嵌套 `scoreItem` 680-703） | 2 | 154 | **164** | ≈164 | `0089a8ec3a8636e01c5bed9947be028d78beb7313cd7f74a3eec9413c5626a7b` |
| T6 | `interface/http/controllers/review/index.js`（interface，**barrel**） | 无搬移；5 行 re-export | 0 | 0 | **12** | ≈13 | `7080c463e98db985b88a70df58e7f2d72d1e2b142d5f4dd1b07ac863f018308c` |
| T7 | `infrastructure/review/scope.js`（**infrastructure**） | 54-73 · 75-107 · 109-112 | 3 | 57 | **70** | ≈66 | `eea677056816e9fd6c0caf330b27e0026ec178d9ba046e1248a92148e39dcdbb` |
| T8 | `infrastructure/review/submission.js`（infrastructure） | 223-264 · 266-281 · 283-301 · 303-316 | 4 | 91 | **104** | ≈100 | `b8be890839df789ca8f355071bb178033a6de086c78ddd55ed9c1bf4ae699009` |
| T9 | `infrastructure/review/project.js`（infrastructure） | 763-780 · 782-841 · 843-888 | 3 | 124 | **141** | ≈134 | `0d30929d2bd22303c38f1fb7a6952703e3f0dcf3f6c2429dc763c0afa91ccc5d` |
| T10 | `infrastructure/review/prompts.js`（infrastructure） | 890-925 · 927-964 | 2 | 74 | **86** | ≈84 | `8242b4d5f050883701a19df1098c0d2e590be30f6eb348f90826ba972a0fa47a` |
| T11 | `infrastructure/review/index.js`（infrastructure，**barrel**） | 无搬移；4 行 re-export | 0 | 0 | **11** | ≈14 | `b50facbcfc1f9d1de802d21c13dff7d631ace3877f73189f24ad989829b4f99c` |
| — | 源文件 `server/src/controllers/reviewController.js` | **整体删除** | — | −965 | **0（已删）** | — | — |
| | **合计** | | **25** | **929** | **1067** | — | |

- **全部 < 800**：最大 `summary.js` = **173 行**（A 预估 170，偏差 +1.8%）≪ 800；观察带（>500）**无新增**（实测 14 → 13）。
- 目录 `server/src/interface/http/controllers/review/`（**新建**；`server/src/interface/` 拆分前只有 README.md、0 个 .js）与 `server/src/infrastructure/review/`（**新建**）均已落地。
- 行数账：929（搬移，含 2 条段落横幅 4 行）+ 11（import 面，被重排非搬移）+ 24（段间空行）+ 1（末尾空行）= **965** ✔（逐行集合运算，无重叠无遗漏；未覆盖的非空行只有 :1-:11）。

---

## 4 分批执行记录（中间态用**门面**；每批都留了实测读数）

中间态做法（照 plan §9/§10-分批指令）：源文件保留为**门面** —— 把已迁出的名字改成文件尾 `export { … } from '<新路径>';` 再导出，并在文件头补上仍被内部使用的 import。**除源文件原有的 import 面之外，门面不新增任何逻辑**。

| 批 | 动作 | 新建 | 源文件行数（实测） | check-layers | 未分层 | GodFile | 面探针 |
|---|---|---|---|---|---|---|---|
| 入场 | — | — | 965 | 文件 96 / 违规 0 | 44 | 3 | BEFORE = 17 名 |
| **B1** | T1–T5 迁出（interface 5 文件）；源文件门面化（9 条 import + 4 行 re-export） | class-scope 34 / list 104 / batch 168 / summary 173 / export 164 | **375** | 文件 101 / 违规 0 | **44** | 3 | **17 名** ✅（+ bind-check 0 违规；rc-* 4 套件 24/24 绿） |
| **B2** | T7–T10 迁出（infrastructure 4 文件）；源文件继续门面化（0 import + 8 行 re-export） | scope 70 / submission 104 / project 141 / prompts 86 | **11** | 文件 105 / 违规 0 | **44** | **2** ✅ | **17 名** ✅（+ bind-check 0；rc-* 4 套件 24/24 绿） |
| **B3** | 建 T6 + T11 两个 barrel → **先过 bind-check** → 改 I1（routes/teacher.js:5 一行→三行）+ I2（projectReviewController.js:18 换路径）→ **删源文件** | index 12 / index 11 | **0（已删）** | 文件 106 / 违规 0 | **43** ✅ | **2** | **AFTER = 17 名（契约面）** ✅ |

- 中间态快照（供 Captain 需要「每批一提交」时复原）：`/tmp/splitB/facade-B1.js`（375 行）、`/tmp/splitB/facade-B2.js`（11 行）。
- **本报告不冒充「每批一个 git 提交」**：本轮硬约束禁止 git 写操作 ⇒ 三个批次是**执行与验证阶段**，最终只留一个可提交状态；若 Captain 要拆成 3 个提交，可用上述两份快照 + §1.2 的文件清单复原（B1 提交 = 5 个 interface 文件 + facade-B1；B2 = 4 个 infra 文件 + facade-B2；B3 = 2 barrel + I1/I2 + 删源）。

---

## 5 逐块搬移对照（sha256 切片判等 · **25/25 全等**）

**方法（可复现；脚本 `/tmp/splitB/verify-blocks.cjs`、`/tmp/splitB/dump-blocks.cjs`，均在仓库外）**：

1. 基准 = 冻结副本 `/tmp/splitB/before/server/src/controllers/reviewController.js`（来自 `git archive HEAD server`），先自证整体 sha256 = `62ec56ed…`、`wc -l` = 965；
2. 按 plan §1.2 的 25 个区间逐个切片（含紧邻 JSDoc / 行内注释；嵌套 `scoreItem` 用 acorn 实测为 FunctionDeclaration @680-703，与 plan 一致）；
3. 对每块求 sha256，再在 **11 个新文件全文**里做字节子串定位（`content.split(block).length - 1`）；
4. **判等结果：25/25 块命中数恰为 1、0 块缺失**（哈希由源切片直接计算，定位命中即逐字节相等）。

| # | 符号 | 源行（冻结树） | 源切片 sha256（全 64 位） | 目标位置 | 判等 |
|---|---|---|---|---|---|
| 1 | `buildFilter` | 13-37 (25L) | `788b4c79e91f74486e23b89cb3c5fe1279290388533c7cf4d60a8ac7c0d93ca0` | `interface/http/controllers/review/list.js:12-36` | ✅ |
| 2 | `enrichWithSchool` | 39-52 (14L) | `b3e5a5af2c95e6626f5a030b1edc42a9748ea73e829cb93e0b4de278bdd3516a` | `interface/http/controllers/review/list.js:38-51` | ✅ |
| 3 | `getSubmissions` | 170-196 (27L) | `488a85e4955dad3434f9e7d4972ba815669fe90794e439f28b72ac3e89142c1f` | `interface/http/controllers/review/list.js:53-79` | ✅ |
| 4 | `getReviewQuestions` | 198-221 (24L) | `71cc7887e011eb6166139c712fa5915d8f82ef59ad766eede9ff22f03bfa5e96` | `interface/http/controllers/review/list.js:81-104` | ✅ |
| 5 | `resolveVisibleClassScope` | 145-168 (24L) | `8bd47f6c9b0fe3bb9afa656b74dad4a9e025fd360993b5f8d9ef492d82734603` | `interface/http/controllers/review/class-scope.js:9-32` | ✅ |
| 6 | `filterRejectedSubmissionIds` | 114-143 (30L) | `add5059e69b812662af54b675327bf5340e1e7083f744acf7c9626d7ac5bdaf8` | `interface/http/controllers/review/batch.js:11-40` | ✅ |
| 7 | `batchReview` | 318-372 (55L) | `d765454ab6c489deb1fad96c6af60fac186821a5e066ff497bd60c3c9809d7c4` | `interface/http/controllers/review/batch.js:42-96` | ✅ |
| 8 | `batchPublish` | 374-420 (47L) | `7e869fbf32d0c4236673101bf89088c96f645eba04fc57466584a4b649209fc2` | `interface/http/controllers/review/batch.js:98-144` | ✅ |
| 9 | `publishScores` | 422-444 (23L) | `cbe2963a96b9c9e8d79cf29bac13380755f8aaed21f75be72a3a94a7f1e41e1e` | `interface/http/controllers/review/batch.js:146-168` | ✅ |
| 10 | `getReviewSummary` | 446-516 (71L) | `1e04acb8da217cdae6d76d756e58e02abc6744009c486a4e698ed6b5b78d48b1` | `interface/http/controllers/review/summary.js:13-83` | ✅ |
| 11 | `getReviewByClass` | 518-606 (89L) | `843bbec66d95997f7c721aee2d7e7996edae565e3a75b89a7374aaa7f0cb4244` | `interface/http/controllers/review/summary.js:85-173` | ✅ |
| 12 | `exportReviewData` | 608-761 (154L) | `1ca087298cf3e578f1954ed78c768f45c9abf65e053cdbd34b7776b605f41a7a` | `interface/http/controllers/review/export.js:11-164` | ✅ |
| 13 | `scoreItem(nested)` | 680-703 (24L) | `04989aa99c8a4e00f4c2194b5d166c3e1e61bffb5850226874083c7ac9de6dcb` | `interface/http/controllers/review/export.js:83-106` | ✅ |
| 14 | `isStudentVisibleToTeacher` | 54-73 (20L) | `11b83ba582a8e89b0a95b085b04eb8de60f8e195472b6cbbe8f47122e0167ef4` | `infrastructure/review/scope.js:10-29` | ✅ |
| 15 | `loadVisibleSubmission` | 75-107 (33L) | `5b4455abf8594250cb429c4cc12154d5797ee005e802deee6606bd42e83361c8` | `infrastructure/review/scope.js:31-63` | ✅ |
| 16 | `sendScopeError` | 109-112 (4L) | `709cacfcd6e0728012b8a17e623a1625b5a22e4cf31d5924a0c4b2eb4e97733f` | `infrastructure/review/scope.js:65-68` | ✅ |
| 17 | `getSubmissionDetail` | 223-264 (42L) | `188565746f63cd232c5d490a842c2b15eb9a593d11835fa71abc02547389f0af` | `infrastructure/review/submission.js:11-52` | ✅ |
| 18 | `regradeSubmission` | 266-281 (16L) | `1806158257a90b558d0f367893913ea594fe109ff791d4ac48936c1ab3e12edf` | `infrastructure/review/submission.js:54-69` | ✅ |
| 19 | `updateScore` | 283-301 (19L) | `9e5d5d2330d34607141580d39f7d80b9aa4d1ddca94adc6b6c2180f708bbaa35` | `infrastructure/review/submission.js:71-89` | ✅ |
| 20 | `reviewSubmission` | 303-316 (14L) | `6a48cc57adc94ef8fc0b2c9a603604e4c58f63b4747a2e67ce51a66e21a3ac3a` | `infrastructure/review/submission.js:91-104` | ✅ |
| 21 | `readStandardTree` | 763-780 (18L) | `6ddaa8ab25d4ab90ce90622da07c8c459d6e5287728e0ff9fc892df251b19b88` | `infrastructure/review/project.js:16-33` | ✅ |
| 22 | `getProjectReview` | 782-841 (60L) | `775745c9bacd29ca8ebb82816668d563cb9223f4636f0e5f629a87e5679a4c9f` | `infrastructure/review/project.js:35-94` | ✅ |
| 23 | `reviewProjectSubmission` | 843-888 (46L) | `0ed1494df2e4aff1fdb06a49f2151f05aaf1bdf21b3bf4dc14b88f7c9c50884a` | `infrastructure/review/project.js:96-141` | ✅ |
| 24 | `getQuestionPromptPreview` | 890-925 (36L) | `d28c347131b444ee38ddc77cf5db5847d730c79e8bfed19a6a80d3c0fe6e52be` | `infrastructure/review/prompts.js:12-47` | ✅ |
| 25 | `getSubmissionPrompt` | 927-964 (38L) | `eae1f4c5968ab807ed8d2e5813f20fbbfc0916ea7c9a93e1b0ea48f7ee4325c8` | `infrastructure/review/prompts.js:49-86` | ✅ |

### 5.1 反向校验：目标文件不存在「非搬移字节」（实测）

把每个目标文件里的 25 块切片**逐个删除**，剩余非空白行**只允许**是 banner / import 行 / `export …` 行：

| 目标文件 | 删除切片后残留非空行 | **未匹配行** |
|---|---|---|
| interface/…/class-scope.js | 7 | **0** |
| interface/…/list.js | 9 | **0** |
| interface/…/batch.js | 8 | **0** |
| interface/…/summary.js | 10 | **0** |
| interface/…/export.js | 8 | **0** |
| interface/…/index.js | 11 | **0** |
| infrastructure/review/scope.js | 8 | **0** |
| infrastructure/review/submission.js | 8 | **0** |
| infrastructure/review/project.js | 13 | **0** |
| infrastructure/review/prompts.js | 9 | **0** |
| infrastructure/review/index.js | 10 | **0** |
| **合计未匹配** | | **0** |

⇒ **每一个非空白字节都可归因于「源切片 / banner / import 行 / export 行」**，没有任何夹带的改写。

### 5.2 死代码与既有缺陷：**一处未修**（硬要求③）

| 项 | 源位置 | 现状 | 证据 |
|---|---|---|---|
| **死变量 `count`** | :354 `let count = 0;` / :365 `count = toReview.length;`（响应体用的是 `reviewedStudentIds.size`，:367） | **逐字带**进 `batch.js:78 / :89`，响应体在 `:91` | grep 三行逐字命中；§10 的 lint 迁移三元组 |
| **「无 message」的成功响应形状（3+1 处）** | :450 `{code:0,data:[]}` · :511 `{code:0,data:rows}` · :601 `{code:0,data:{list,total}}` · :750-756 多行 `{code:0,data:{rows,headerCells}}` | **未补 message** | 新文件 `summary.js:17 / :78 / :168`（+ `export.js` 多行）与源行逐字相同（切片哈希相等） |
| **12 处 `code: 1003` / 11 处 `res.status(403)` 的中文文案** | 全文件 | **逐字保留** | 新 11 文件合计 `code: 1003` = **12**、`res.status(403)` = **11**，与源文件同口径计数（逐串计数亦与源一致，如「提交不存在」6/6、「无权访问该提交」3/3、「无权操作」4/4、「服务器内部错误」16/16） |
| **`:684` 空答早退**（C 的 CM9「刻意幸存者」：整条失效后 22 例仍全绿 ⇒ 拆分敏感行） | `:684 if (!sAns) return 0;` | **逐字带**进 `export.js:87` | grep 两处各 1 命中；且 `scoreItem` 整块哈希相等（`04989aa9…`） |
| `req.app.locals.reviewUseCases` 三处调用 | :272 / :292 / :310 | **逐字带**进 `submission.js`（3 命中） | 拆分**未**改为直接 import 用例层 ⇒ C 的 Z7/Z8 补测入口（端口替身）在拆分后仍然有效 |
| `getProjectReview` 这条「无前端调用方」的路由 | :788-841 | **保留**（路由 13 仍在契约内） | 16 条路由体逐字未动（§8.2） |
| `teacherController.js:427` 的旧路径注释 / 两处溯源注释 | 源外 | **未改**（历史定位注解） | §12-D3 登记 |

### 5.3 依赖面：**未新增任何依赖**

11 个新文件的全部 import 规格符（`grep -rhoE "^import .* from '[^']+'"` 去重计数）：

```
   1 import fs from 'fs'                                             1 import path from 'path'
   4 import prisma from '../../../../utils/prisma.js'                4 import prisma from '../../utils/prisma.js'
   4 import logger from '../../../../utils/logger.js'                3 import logger from '../../utils/logger.js'
   4 import { getVisibleClassIds } from '../../../../controllers/teamController.js'
   1 import { getVisibleClassIds } from '../../controllers/teamController.js'
   1 import { ABNORMAL_FEEDBACK } from '../../../../constants.js'
   1 import { parseProjectAnswer, toTeacherView } from '../../utils/projectView.js'
   1 import { submissionDir, standardDir, ROOT } from '../../utils/projectPaths.js'
   1 import { readProjectTree } from '../../utils/projectFiles.js'
   1 import { buildSystemPrompt, buildGradingUserMessage } from '../ai/prompt-builder.js'
   1 import { isStudentVisibleToTeacher } from './scope.js'           2 import { loadVisibleSubmission, sendScopeError } from './scope.js'
   3 import { resolveVisibleClassScope } from './class-scope.js'
```

⇒ 全部是源文件原有 11 条边的**重新分发**（含新增的 4 条同层内部边：`scope→{submission,prompts}`、`class-scope→{list,summary,export}`），**无一条指向新依赖**。

---

## 6 导出面证据（真 import 对拍，两个独立 node 进程，`PORT=0`）

**BEFORE**（冻结树 `/tmp/splitB/before`，`server/node_modules` 软链复用）与 **AFTER**（两个 barrel）分别真 import：

```
BEFORE count=17
BEFORE batchPublish,batchReview,exportReviewData,getProjectReview,getQuestionPromptPreview,getReviewByClass,getReviewQuestions,getReviewSummary,getSubmissionDetail,getSubmissionPrompt,getSubmissions,isStudentVisibleToTeacher,publishScores,regradeSubmission,reviewProjectSubmission,reviewSubmission,updateScore
T6 count=9 :: batchPublish,batchReview,exportReviewData,getReviewByClass,getReviewQuestions,getReviewSummary,getSubmissions,publishScores,resolveVisibleClassScope
T11 count=9 :: getProjectReview,getQuestionPromptPreview,getSubmissionDetail,getSubmissionPrompt,isStudentVisibleToTeacher,regradeSubmission,reviewProjectSubmission,reviewSubmission,updateScore
T6 ∩ T11 = []
AFTER contract count=17
AFTER batchPublish,batchReview,exportReviewData,getProjectReview,getQuestionPromptPreview,getReviewByClass,getReviewQuestions,getReviewSummary,getSubmissionDetail,getSubmissionPrompt,getSubmissions,isStudentVisibleToTeacher,publishScores,regradeSubmission,reviewProjectSubmission,reviewSubmission,updateScore
IDENTICAL = true
INTERNAL-ONLY names = ["resolveVisibleClassScope"]
SPREAD count=18 :: …（= T6 ∪ T11，含内部名）
SPREAD == T6∪T11 = true
```

- **17 名逐字符相等**（count 相等 + 排序后名字串相等，无多、无少、无改名）。
- **T6 ∩ T11 = ∅** ⇒ I1 的 `{ ...reviewHttp, ...reviewIo }` **不存在静默遮蔽**（展开结果 = 并集，实测 `SPREAD == T6∪T11 = true`）。
- **唯一新增的内部名** `resolveVisibleClassScope`（T1 的 `export { resolveVisibleClassScope };`）：它是 interface 侧 3 个文件的同层共享名，**不在 I1 的 `review.*` 契约面里**（`routes/teacher.js` 只取那 16 个 handler），**HTTP 契约面仍 17 名**。
- 逐文件面（B1/B2 中间态探针）：`class-scope [resolveVisibleClassScope]`、`list [getReviewQuestions,getSubmissions]`、`batch [batchPublish,batchReview,publishScores]`、`summary [getReviewByClass,getReviewSummary]`、`export [exportReviewData]`、`scope [isStudentVisibleToTeacher,loadVisibleSubmission,sendScopeError]`、`submission [getSubmissionDetail,regradeSubmission,reviewSubmission,updateScore]`、`project [getProjectReview,reviewProjectSubmission]`、`prompts [getQuestionPromptPreview,getSubmissionPrompt]`。

**声明行 export 审计**（静态）：11 文件中 `^export (const|async function|…)` = **恰 17 条**，名字集与 BEFORE 逐字相同；`export *` = **0**；文件尾 `export { … };`（无 from）= **2 行**（`class-scope.js` 1 行、`scope.js` 1 行）；barrel 的 `export … from` = **9 行**（T6 5 行 + T11 4 行）。

---

## 7 绑定自查（跨文件引用闭包扫描）

**方法（脚本 `/tmp/splitB/closure.cjs`，acorn AST）**：对每个新文件求「引用标识符集合」（排除属性名 `.x`、对象键 `x:`、声明位、import 绑定位、export 说明符位），与「本文件声明（含全部解构/形参/catch 模式绑定）∪ import 绑定 ∪ 语言内建」求差；并统计差集中**命中源文件顶层名或 import 绑定名**（缺失绑定的判据集，实测 21 名）的条数。

```
KNOWN (源顶层名+import绑定) n=21: ABNORMAL_FEEDBACK,ROOT,buildFilter,buildGradingUserMessage,buildSystemPrompt,enrichWithSchool,filterRejectedSubmissionIds,fs,getVisibleClassIds,loadVisibleSubmission,logger,parseProjectAnswer,path,prisma,readProjectTree,readStandardTree,resolveVisibleClassScope,sendScopeError,standardDir,submissionDir,toTeacherView
OK   class-scope.js declared=  8 imported=1 refs=  9 freeResidual=[] KNOWN-HIT=[]
OK   list.js        declared= 33 imported=4 refs= 34 freeResidual=[] KNOWN-HIT=[]
OK   batch.js       declared= 43 imported=3 refs= 44 freeResidual=[] KNOWN-HIT=[]
OK   summary.js     declared= 65 imported=5 refs= 65 freeResidual=[] KNOWN-HIT=[]
OK   export.js      declared= 49 imported=3 refs= 55 freeResidual=[] KNOWN-HIT=[]
OK   index.js       declared=  0 imported=0 refs=  0 freeResidual=[] KNOWN-HIT=[]
OK   scope.js       declared= 15 imported=2 refs= 14 freeResidual=[] KNOWN-HIT=[]
OK   submission.js  declared= 22 imported=4 refs= 18 freeResidual=[] KNOWN-HIT=[]
OK   project.js     declared= 33 imported=11 refs= 38 freeResidual=[] KNOWN-HIT=[]
OK   prompts.js     declared= 18 imported=6 refs= 16 freeResidual=[] KNOWN-HIT=[]
OK   index.js       declared=  0 imported=0 refs=  0 freeResidual=[] KNOWN-HIT=[]
RESIDUAL TOTAL = 0 ; KNOWN-NAME MISSING BINDINGS = 0
```

⇒ **自由标识符残留 0、缺失绑定 0**。另有 `bind-check` 的具名绑定解析（208 modules / 710 bindings / **违规 0**）作为第二来源。

---

## 8 barrel 与 bind-check 的处理（**硬要求②：顺序不可换**）

### 8.1 实际执行顺序（逐条留痕）

| 序 | 动作 | 证据 |
|---|---|---|
| 1 | 建 **T6**（interface barrel，5 行 re-export）+ **T11**（infrastructure barrel，4 行 re-export） | 文件已落盘（12 行 / 11 行） |
| 2 | **在改 I1/I2 之前**先跑 `bind-check` | `modules scanned: 209 / named import bindings checked: 726 / BINDING VIOLATIONS 0` |
| 3 | 改 **I1**（`routes/teacher.js:5`）与 **I2**（`projectReviewController.js:18`） | `git diff -U0` 各只有 1 处 hunk |
| 4 | **最后**删源文件 | 删除前：`diff` 与 B2 门面快照逐字节相同 + `shasum -a 256` = `94b07e80…`；删除后 0 命中 |
| 5 | 终态复跑 `bind-check` | `modules scanned: 208 / 710 bindings / 0 violations` |

**两条改写的逐字内容**：

```js
// I1 · server/src/routes/teacher.js:5（一行 → 三行，§6.4 逐字）
import * as reviewHttp from '../interface/http/controllers/review/index.js';
import * as reviewIo from '../infrastructure/review/index.js';
const review = { ...reviewHttp, ...reviewIo };

// I2 · server/src/controllers/projectReviewController.js:18（仅换路径，注释与其余行不动）
- import { isStudentVisibleToTeacher } from './reviewController.js';
+ import { isStudentVisibleToTeacher } from '../infrastructure/review/scope.js';
```

### 8.2 16 行路由体逐字不动（实测对拍）

```
$ git diff -U0 -- server/src/routes/teacher.js
` -5 +5,3 ` import * as teacher from '../controllers/teacherController.js';
-import * as review from '../controllers/reviewController.js';
+import * as reviewHttp from '../interface/http/controllers/review/index.js';
+import * as reviewIo from '../infrastructure/review/index.js';
+const review = { ...reviewHttp, ...reviewIo };

$ diff <(git show HEAD:server/src/routes/teacher.js | grep -n 'review\.' | cut -d: -f2-) \
       <(grep -n 'review\.' server/src/routes/teacher.js | cut -d: -f2-)
ROUTE BODIES IDENTICAL      # 16 行 vs 16 行，逐字节相同（行号整体 +2，声明体本身零改动）
```

### 8.3 ★interface 侧绝不 import infrastructure（对 F4 盲区的正面防守）

`check-layers` 与 `cycle-check` 对 `export … from` **双双失明**（plan §2.1-F4）⇒ 本步不依赖它们，改用：

1. **静态红线扫描**：
   ```
   $ grep -rnE "(^|[^a-zA-Z])(import|export)[^;]*from[[:space:]]+'[^']*infrastructure" server/src/interface/
     ZERO (no import/export-from to infrastructure in interface/)
   ```
   （注意：interface barrel 的 **banner 注释**里含「infrastructure/」字样，那是注释不是规格符；上式的 `from '<spec>'` 约束把它排除。）
2. **架构上的构造性保证**：interface 侧 6 个文件的**全部**相对目标只有 `../../../../utils/*`、`../../../../constants.js`、`../../../../controllers/teamController.js`（unlayered）与同层 `./{class-scope,list,batch,summary,export}.js`；两个 barrel 的 9 行 re-export **全部落在同层**（T6→interface 5 文件、T11→infrastructure 4 文件）。
3. **bind-check**（唯一能验 re-export 的门禁）：0 违规。

---

## 9 门禁七项（原始输出）

```
===== [1] check-layers =====
$ node server/scripts/check-layers.mjs
文件 106 个，违规 0 条（0 类规则），未分层待迁移 43 个
exit=0

===== [2] arch-metrics =====
$ node scripts/gates/arch-metrics.mjs
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=44  实测=43
  ✓ godfileOver800     基线=3  实测=2
  · >500 行（观察带，不计判据） 基线=14 实测=13
  GodFile >800 行：server/src/controllers/teacherController.js (1338) / client/src/views/Doc.vue (1106)
  分层守卫原文：文件 106 个，违规 0 条（0 类规则），未分层待迁移 43 个
结论：PASS
exit=0

===== [3a] cycle-check（默认 server/src）=====
$ node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 106 文件 / 238 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 0）
  自环（文件 import 自身）: 0
结论：PASS
exit=0

===== [3b] cycle-check --root client/src（client 侧不回归）=====
$ node scripts/gates/cycle-check.mjs --root client/src
循环依赖门禁 · 根目录 client/src
  扫描 99 文件 / 244 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 0）
  自环（文件 import 自身）: 0
结论：PASS
exit=0

===== [4] hard-metrics =====
$ node scripts/gates/hard-metrics.mjs
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
  参考：非 style.css 的 CSS 中 !important = 20（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）
结论：PASS
exit=0

===== [5] bind-check =====
$ node scripts/gates/bind-check.mjs
=== bind-check: ESM 跨模块绑定自检（陷阱 12 的静态补位）===
roots                        : server/src, server/test
modules scanned              : 208
named import bindings checked: 710
unresolved relative imports  : 4 (仅登记)
external (out-of-root) refs  : 1 (仅登记)
BINDING VIOLATIONS           : 0
  ⚠ unresolved: …fact-extractor.test.js -> './App.vue' / './router'；project-context-builder.test.js -> './x.js' ×2
  · external: …experiment-variance.test.js -> '../../../scripts/experiment-variance.mjs'
exit=0

===== [6] eslint =====
$ ./node_modules/.bin/eslint client/src server/src --format json
files=205 errors=0 warnings=59
（本步相关：server/src/interface/http/controllers/review/batch.js :: [{"line":89,"rule":"no-unused-vars","sev":1}] —— 即搬迁后的死变量 count；其余 10 个新文件 0 命中）
exit=0

===== [7] lint-check =====
$ node scripts/gates/lint-check.mjs
扫描文件 205（.vue 40 / .js 165）｜代码行 33418｜解析失败 0
基线 31 条 → 当前 31 条，新增 1（已迁移，不计入阻断）
基线之外的新违规（阻断项）：（无）
结论：PASS（无基线外新违规；1 条为迁移，不计入阻断）
exit=0
```

**读数汇总**：违规 **0** ｜ 未分层 **44 → 43** ✔ ｜ GodFile **3 → 2** ✔ ｜ SCC **0**（server 238 边 / client 244 边）｜ hard 0/0/0 ｜ bind **0**（unresolved 4 / external 1 与基线一致）｜ eslint **error 0 / warn 59** ｜ lint-check **exit 0**。

---

## 10 ★lint 迁移 1 条的逐字登记（任务书第六步）

`lint-check` 原文（`docs/pipeline/lint-baseline.json` **未刷新**，能力来自提交 `958139c` 的迁移识别）：

```
── 已迁移 1 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） ──────────────────
  （同一处缺陷换宿主：不计入阻断项，也不计入「已消除」）
  ⇄ no-unused-vars  count  ｜ let count = 0;
      server/src/controllers/reviewController.js:354   →   server/src/interface/http/controllers/review/batch.js:78
```

| 项 | 旧 | 新 |
|---|---|---|
| file:line | `server/src/controllers/reviewController.js:354` | `server/src/interface/http/controllers/review/batch.js:78` |
| rule | `no-unused-vars` | 同 |
| symbol | `count` | 同 |
| 规范化行文本 | `let count = 0;` | 同 |

**「是搬运而非修一处加一处」的人工核对证据**（供 C 复核）：

- `count` 在**新树**只剩 4 处：`batch.js:78`（`let count = 0;`）、`:89`（`count = toReview.length;`）、`:91`（响应体里的**键名** `data: { count: reviewedStudentIds.size }`）、`:139`（同上，batchPublish）。**旧树**为 `:354 / :365 / :367 / :413` —— 一一对应，**没有任何新增的 `count`**；
- 死代码**未被顺手删除**（§5.2），也**未新增第二条同类违规**（当前 31 = 基线 31，「新增」列的 1 条已被判为迁移且与 resolved 一一相等）；
- eslint 侧同一条警告仍在（warn 总数 **59 不变**，位置 `batch.js:89`，rule `no-unused-vars`）—— 两道 lint 互证「同一处缺陷换了宿主」；
- **未执行 `--update-baseline`**，基线文件 mtime 未变。

---

## 11 定向测试（**18 个独立 jest 进程 / 23 套件 / 264 例 / 0 failed**）

口径：每套件**单独一个 jest 进程**（单套件调用 + `--runInBand`，包装脚本 `/tmp/splitB/crun.sh`：从 `server/.env` 只换库名为 `exam_system_test`，显式 `PORT=0`），**不跑全量回归**（C 的职责）。

| 序 | 套件 | Test Suites | Tests | 结果 |
|---|---|---|---|---|
| 1 | `rc-batch-guard-contract`（B0） | 1 | 7 | PASS |
| 2 | `rc-export-objective-contract`（B0） | 1 | 3 | PASS |
| 3 | `rc-project-review-contract`（B0） | 1 | 12 | PASS |
| 4 | `rc-usecase-404-contract`（**B0b 新增**） | 1 | 2 | PASS |
| 5 | `review.test`（模式命中 5 套件：review · t5 · t7 · qa-batch1 · prompt-preview） | 5 | 61 | PASS |
| 6 | `prompt-preview.test` | 1 | 7 | PASS |
| 7 | `t2-teacher-scope` | 1 | 10 | PASS |
| 8 | `t4-teacher-idor` | 1 | 17 | PASS |
| 9 | `t5-t4-idor-review` | 1 | 17 | PASS |
| 10 | `t6-teacher-classid-idor` | 1 | 18 | PASS |
| 11 | `t7-t6-classid-review` | 1 | 12 | PASS |
| 12 | `qa-batch1-independent-review` | 1 | 17 | PASS |
| 13 | `teacher-pending-summary` | 1 | 13 | PASS |
| 14 | `open-project-flow`（projectReviewController + scope.js 的真实消费方） | 1 | 9 | PASS |
| 15 | `project-regrade` | 1 | 3 | PASS |
| 16 | `project-context`（模式命中 2 套件） | 2 | 38 | PASS |
| 17 | `r2-fixes` | 1 | 13 | PASS |
| 18 | `submit.test` | 1 | 5 | PASS |
| | **合计** | **23** | **264** | **0 failed** |

- 中间态（B1 / B2）另各跑一次 `rc-*` 四套件 = **24 例 0 failed**（B1 后、B2 后各一轮）。
- B0 的 22 例 + B0b 的 2 例 = 24 例全部在本表内（#1-#4）。
- `open-project-flow` 直接覆盖 I2 的新路径（`isStudentVisibleToTeacher` ← `infrastructure/review/scope.js`）。

---

## 12 偏离登记（相对 A 的方案）

| # | 项 | 方案原文 | 实际做法 | 理由 |
|---|---|---|---|---|
| **D1** | **过程事故与纠正（重要，如实登记）** | —— | 第一次执行 B2 时，生成脚本**误从工作树读取源文件**（此时工作树已是 B1 门面，375 行）⇒ `project.js/prompts.js` 切出空体、`scope.js/submission.js` 切错内容、门面被二次改写。**当场由行数异常发现**（project 20 行 vs 预期 134），随后：① 用 `git show HEAD:…` 重建冻结副本并断言 sha256 = `62ec56ed…`；② 生成脚本改为**只读冻结副本并 fail-closed 断言哈希**；③ 删除两个目录、**从冻结副本重跑 B1+B2**；④ 重跑后 5 个 interface 文件哈希与首轮**逐字相同**（证明 B1 首轮正确），4 个 infra 文件行数/哈希符合预期。**最终树零残留**（所有判据均在最终树上重跑） | 本项目第 10 条纪律「行号与计数一律以冻结树实测为准」 |
| **D2** | 文件尾 `export { … };` 块 = **2 个**（不是 §10-B2…B9 逐文件各一个） | §10 执行单给 T2/T3/T4/T5/T7/T8/T9/T10 各列了一行 `export { … };` | 只对 **T1**（`resolveVisibleClassScope`）与 **T7**（`loadVisibleSubmission`/`sendScopeError`）加文件尾 export 块；其余 17 名**本来就带声明行 `export`**，再加一行是 `SyntaxError: Duplicate export of 'x'`（已实测复现） | 硬要求①「不得在声明行加/改 export；跨模块暴露一律用文件末尾 export 块」——本步的「跨模块暴露」需求**只有这 3 个内部名** |
| **D3** | banner 与「旧路径 grep = 0」的字面冲突（承 step 1/3 的同类登记） | §10-4 强制 banner 写「由 `server/src/controllers/reviewController.js` 拆分而来」，§10-B13 又要求 `grep -rn 'controllers/reviewController.js' server/src server/test` = 0 | 保留 §10-4 的 banner 格式。实测：**import 规格符命中 = 0**；文本命中 = **11 条 banner** + 1 条**拆分前既有**的注释（`teacherController.js:427`，属「历史定位」登记债，本步不改） | banner 是溯源注解、不是 import；判据应表述为「无 import 指向已删模块」 |
| **D4** | banner 的多区间格式 | §10-4 的模板只有单区间 `<起>-<止>` | 多切片文件写成 `13-37 · 39-52 · 170-196 · 198-221`（` · ` 分隔），便于 C 机械核对 | 模板未覆盖多切片情形；不引入语义 |
| **D5** | 行数偏差（不作判据） | A 预估：T2 ≈100 / T3 ≈166 / T4 ≈170 / T6 ≈13 / T7 ≈66 / T8 ≈100 / T9 ≈134 / T10 ≈84 / T11 ≈14 | 实测 104 / 168 / 173 / 12 / 70 / 104 / 141 / 86 / 11 | 判据是 <800（最大 173），A §12-6 已声明 ±5% 误差 |
| **D6** | 未做「每批一个 git 提交」 | §9 每批一个提交 | 本轮硬约束**禁止任何 git 写操作** ⇒ 批次只作为**执行/验证阶段**（§4 留了每批读数与中间态快照），提交由 Captain 执行 | 约束冲突时以任务书硬约束为准；已在 §4 给复原路径 |
| **D7** | interface 侧 banner 注释里出现「infrastructure/」字样 | —— | interface barrel 的 banner 含「★ 绝不 re-export infrastructure/ 的任何名字」的纪律提示 | 是注释不是规格符（§8.3 的扫描式已把它排除）；若 C 用裸 `grep infrastructure` 会命中该注释，**勿据此判违规** |

---

## 13 给 Agent C 的验证指令（可复现，全部只读 + 自建装置）

> 建议 C **自建**全部装置（不复用 `/tmp/splitB/*`），锚点：HEAD = `993963f`（若不等于，请以「`git show HEAD:server/src/controllers/reviewController.js` 的 sha256 是否为 `62ec56ed…`」判定锚点有效性）。

| # | 验什么 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| W1 | 版本锚点 | `git show HEAD:server/src/controllers/reviewController.js \| shasum -a 256`（源已删，只能这样取） | = `62ec56ed4c647687a09bcd2329c5ceeca1968610e9495a7fa1a31d4fb1481add`、965 行 |
| W2 | **逐块判等（核心）** | 自建切片：25 块（24 顶层 + 嵌套 `scoreItem` 680-703）在 11 个新文件里做字节定位 | 25/25 命中 ≥1；且**每块 sha256 与源切片相同**；建议同时复算 §5 表里的哈希 |
| W3 | 反向校验 | 删除 25 块后，残留非空白行只能是 banner/import/export | 未匹配 = **0** |
| W4 | **导出面** | 冻结树（`git archive HEAD server`）真 import 源文件 vs 真 import 两个 barrel，`Object.keys().sort()` 对拍 | 源 **17** == `T6∪T11` 减 `resolveVisibleClassScope` **17**，逐字符相等；`T6∩T11 = ∅`；`{...T6,...T11}` 的键 = 并集（防 I1 静默遮蔽） |
| W5 | **红线②（F4 盲区）** | ① 对 `server/src/interface/**` 扫 `(import\|export)…from '<spec>'` 中 spec 含 `infrastructure` 的条目（**勿用裸 grep**，banner 里有该字样）；② 逐条人读 6 个 interface 文件的 import 与 2 个 barrel 的 9 行 re-export | 违规 **0**；barrel 的 re-export **全部同层** |
| W6 | 路由契约 | `diff <(git show HEAD:server/src/routes/teacher.js \| grep -n 'review\.' \| cut -d: -f2-) <(grep -n 'review\.' server/src/routes/teacher.js \| cut -d: -f2-)`；并核 16 条路由的方法/路径/中间件 | 逐字相同；`router.use(auth, requireRole('teacher'))` 与挂载前缀未动 |
| W7 | 死代码 / 既有不一致 | `grep -n "let count = 0;" batch.js`、`grep -n "if (!sAns) return 0;" export.js`、四条无 `message` 成功体、`code: 1003`=12 / `res.status(403)`=11 | 与源同口径一致，**一处未修** |
| W8 | 门禁七项 | §9 的 7 条命令（含 `cycle-check --root client/src`） | 违规 0 / 未分层 **43** / GodFile **2** / SCC **0** / hard 0-0-0 / bind **0** / eslint **0-59** / lint-check **exit 0** |
| W9 | **lint 迁移三元组** | `node scripts/gates/lint-check.mjs --json` | 总数 **31→31**；resolved 恰 1（旧 file `:354`）、fresh 恰 1（新 file `:78`），**rule=`no-unused-vars` + symbol=`count` + 规范化文本 `let count = 0;` 三者全同**；**并人工确认新树只有 4 处 `count`（:78/:89/:91/:139）且与旧树 :354/:365/:367/:413 一一对应**；仅凭 exit 0 **不算过**（DoD §5 纪律） |
| W10 | B0b 两例的**假阳性防护**（★重点） | ① 跑 `rc-usecase-404-contract`；② 复现 C4：把替身文案改成守卫文案 `'提交不存在'` 的**变异副本**跑一次 | ① 2/2 绿且断言含「替身被调用 1 次 + message ≠ 守卫文案」；② 变异副本**必须 2 failed**（若仍绿 ⇒ 该用例无分辨力，判负） |
| W11 | 行为对拍（plan §7.2/§7.3，四维） | 两独立进程：BEFORE（冻结树）/ AFTER（两个 barrel），F01–F18，四维（返值 + 终态 DB + 有序调用日志 + fetch 日志）`cmp` | byte-identical；先过「before 跑两次相等」；fetchLog **0**；装置自检 + 3 处变异反证必须报差异 |
| W12 | 定向回归（可选；全量由 C 决定） | 本报告 §11 的 18 条单套件命令 | 23 套件 / 264 例 / **0 failed**（数字应随 C 自建夹具变化，**不作判据**） |
| W13 | 越界自查 | `git status --porcelain`；`find server/src -newermt <B 开始时刻>` | 只有 §1.2 的 11 新 + 2 改 + 1 删（+ B0b 测试 + 本报告）；`client/dist` / `tests/` / `scripts/gates/` / `docs/pipeline/lint-baseline.json` mtime 未变 |

---

## 14 局限声明（诚实边界）

1. **`node --check` 未被采信**：所有「能加载」的结论都来自**真 import**（`PORT=0`；两个 barrel、9 个切片文件、I1、I2 各一次）与 `bind-check`；符合本仓第 12 条纪律。
2. **未跑全量回归**（C 的职责）：§11 是**定向**测试（18 个独立进程、23 套件、264 例），**不等于全量**。全量四段摘要与 failed 计数由 C 在 `ROUND=NN` 下产出。
3. **未做行为对拍**：plan §7.2/§7.3 的两独立进程四维对拍（F01–F18）与 3 处变异反证**未由我执行**（属 C 的装置）；我的替代证据是**25 块逐字节判等 + 反向零未匹配字节 + 真 import 导出面 + 定向 HTTP 回归**。**静态判等覆盖不到「同一结果、不同写序」这类运行时漂移**，这正是 W11 的必要性所在。
4. **banner 的旧路径**：11 条 banner 含已删源路径（§12-D3）⇒ 「旧路径文本 grep = 0」在本步**不成立**，成立的是「import 规格符 = 0」。C 若按字面跑 B13 的 grep，会命中 11 条 banner + 1 条既有注释。
5. **未审计依赖邻居**：`utils/{prisma,logger,projectView,projectPaths,projectFiles}.js`、`controllers/teamController.js`、`constants.js` 仍是 unlayered，11 个新文件持续依赖它们（这正是 0 违规的原因之一）；若后续步骤迁它们的层，本步的 43 条相对路径需同步调整（**不是本步缺陷**）。
6. **两处文档层面的欠债（承 plan §12-5，未加重也未修复）**：① 5 个 infrastructure 文件里含 HTTP 语义（`res.status/json`）；② 6 个 interface 文件直连 Prisma。二者在源文件今日就已存在（fat controller），拆分只是把它们**显式化**；修复需要真正的用例层重写（改行为），**不在本步**。
7. **B0b 的替身路线依赖 `req.app.locals.reviewUseCases` 这一间接层**：本步**保持**经 `req.app.locals` 取用（未改成直接 import 实例）⇒ 该可测性在拆分后仍然存在（`submission.js` 3 处逐字未变）。
8. **中间态未提交**：§4 的 B1/B2 读数来自我本轮的实测过程，最终树只有 B3 之后的状态；如需每批一提交，用 `/tmp/splitB/facade-B{1,2}.js` 复原（该目录在仓库外，可能被系统清理）。
