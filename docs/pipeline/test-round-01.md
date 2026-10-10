# test-round-01 —— 回归验证报告（流水线第 1 轮）

> 轮次：**01（回归验证 · round 1）** ｜ 日期：2026-10-10（夜）
> Agent C 技能：\`tech-test-automation\` ｜ 立场：**独立验证者** —— 不采信 Agent B 自测结论，全部判据自行复算
> 被验 commit：\`ac608310ca2934d28cc23bb9e6ae8dfdaa713ad0\`（tag \`ui-redesign-freeze-2026-10-10.5\`）+ **工作树未提交改动**（2 文件）
> 工作树指纹（验证前后一致）：\`git diff | shasum -a 256\` = \`037ceecee3c84a571fbf7f4da1e1d4decc3dd7bccc925d43e776dbb7d5b3e9b3\`
> 上游输入：\`docs/pipeline/audit-round-01.md\`（A 的执行集与 44/61 名单）、\`docs/pipeline/refactor-round-01.md\`（B 的改动与自证）、\`docs/pipeline/project-constraints.md\`、\`pipeline-status.md\`

---

## 0 约束遵守声明（Agent C 纯只读）

| 约束 | 执行情况 |
|---|---|
| 只读测试，唯一写入 = 本轮 2 个产物 | ✅ 仅写 \`docs/pipeline/test-round-01.md\`（本报告）与 \`docs/pipeline/test-round-01.log\`（V1 原始日志）；临时脚本全部落 \`/tmp\`，未入仓 |
| 禁止 \`git clean\` / \`stash\` / \`checkout -- .\` / \`reset --hard\` / \`restore .\` | ✅ 全程只读 \`status\` / \`diff\` / \`rev-parse\` / \`ls-files\` / \`show\`；**零 git 写操作**（未 add/commit/checkout/stash/reset/restore） |
| 禁止重跑 \`ledger-check.mjs --out=raw/ledger.json\` | ✅ 未执行；\`tests/ui-redesign-verify/verify-batch3/raw/ledger.json\` mtime 仍为 **20:26:30**（18818 B，未被覆盖） |
| 不碰 \`:5173\` / \`:3000\` / worker | ✅ 未启动、未重启、未 kill 任何进程；未占用任何端口 |
| 不重建 \`client/dist\` | ✅ 未构建；\`dist\` 内 2 个关键产物 sha256 见 §V4，mtime 仍为 21:55 / 22:02 |
| 不写 \`tests/\` | ✅ \`tests/\` 内**最新**文件 mtime = **20:54**（早于本轮 23:48 改动 3 小时）；本轮无任何写入 |
| 不写生产库（只跑 \`exam_system_test\`） | ✅ 回归日志头部记录 \`test db: localhost:3306/exam_system_test\`；\`setup.js\` 白名单护栏未触发 |
| 不发真实外部 API | ✅ 未发起任何真实外部请求（日志中的 \`fetch failed\` 是测试夹具的**模拟**失败路径，见 §V1 注 4） |
| 不覆盖 \`test-round-00.log\` 归档 | ✅ 自建 \`/tmp/c1-run.sh\` 显式指向 \`test-round-01.log\`；\`test-round-00.log\` mtime 仍为 **23:31:36**（158290 B） |

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | **实测** | 结论 |
|---|---|---|---|---|
| **V1** | 日志中 \`Test Suites:\` 摘要处数 | **4 处**（改动前仅 1 处） | **4 处** | ✅ **PASS** |
| V1-a | 段 1 | 912 passed / 0 failed | **912 passed, 912 total**（64 套件，170.639 s） | ✅ |
| V1-b | 段 2 \`fact-extractor\` | 17 passed | **17 passed, 17 total**（0.473 s） | ✅ |
| V1-c | 段 3 \`rule-executor\` | 61 passed | **61 passed, 61 total**（0.48 s） | ✅ |
| V1-d | 段 4 \`rule-mutator\`（本轮新增） | 21 passed | **21 passed, 21 total**（0.638 s） | ✅ |
| V1-e | 合计 | **1011 passed / 0 failed** | **1011 passed / 0 failed**，\`npm_test_exit=0\` | ✅ |
| V1-f | 套件合计 | 67 | **67**（64+1+1+1，磁盘 \`*.test.js\` 亦为 67） | ✅ |
| V1-g | 底线 failed ≤ 13 | ≤13 | **0**（优于底线，非"残留污染"） | ✅ |
| **V2** | \`hard-metrics.mjs\` | PASS（hex6=0 / important=0 / modalConfirm=0） | **PASS**，三项实测均 =0，exit 0 | ✅ **PASS** |
| V2-b | \`arch-metrics.mjs\` | PASS（违规 0 / 未分层 47 不增 / GodFile>800 = 10） | **PASS**，实测 0 / 47 / 10（>500 观察带 19 亦不变） | ✅ **PASS** |
| V2-c | \`cycle-check.mjs\` | PASS（1 个 SCC） | **PASS**，SCC=1（\`factExtractor.js\` ↔ \`ruleExecutor.js\`），自环 0 | ✅ **PASS** |
| **V3①** | A 组 44：\`client/src\` 引用数 | 每名 **0** | **44/44 全为 0**（合计 0） | ✅ **PASS** |
| V3① | A 组 44：\`tokens.css\` 声明残留 | 每名 **0** | **44/44 全为 0**（合计 0，改动前 46 声明点） | ✅ **PASS** |
| **V3②** | B 组 61：\`tokens.css\` 声明仍在 | 61/61 一个不少 | **61/61 全在**，声明点合计 **69**（与 B 报告 69 一致），缺失 **0** | ✅ **PASS** |
| **V3③** | 新零引用总数 | **64** | **64** | ✅ **PASS** |
| V3③-a | 64 的构成 | 61(B) + 3 新孤儿 | **B(61) ∪ {--amber-500,--green-500,--violet-500}**，对称差 **0** | ✅ |
| V3③-b | 3 新孤儿仍被声明 | 是 | 三者 \`tokens.css\` 声明数各 = **1**，且零引用 | ✅ **预期位移，非缺陷** |
| V3③-c | 其中仍属 A 组的 | 0 | **0** | ✅ |
| **V4** | 现有 \`client/dist\` 中 44 令牌的 \`var(--x)\` 用法 | 0 命中 | **0/44 命中**；44/44 仅以**声明**形态存在 | ✅ **旁证成立** |
| **V5** | 被跟踪文件改动数 | **2 个** | **恰好 2 个**：\`server/package.json\`、\`client/src/styles/tokens.css\` | ✅ **PASS** |
| V5-a | \`tests/\` 未被触碰 | 未触碰 | 未触碰（最新 mtime 20:54，早于改动 23:48） | ✅ |
| V5-b | \`client/dist\` 未被触碰 | 未触碰 | 未触碰（最新 mtime 22:02，早于改动 23:48） | ✅ |
| **V6** | 未做项显式声明 | 必须声明 | 已声明（axe 扫描、像素 sha1，见 §5） | ✅ |

**总判定：本轮 6 组验证项全部达标，无阻断缺陷 → 结论 PASS（无需回流 Agent B）。**

---

## 2 逐项证据

### V1｜后端全量回归（主判据）—— ✅ 4 处摘要、1011 passed / 0 failed

**执行方式（未直接跑 \`unblock-g2.sh\`，原因见下）**：自建 \`/tmp/c1-run.sh\`，从 \`server/.env\` 只替换库名为 \`exam_system_test\`（**凭据不回显**），先 \`prisma db push --skip-generate\` 对齐 schema，再 \`npm test\`，全量日志重定向到 \`docs/pipeline/test-round-01.log\`。

> ⚠️ **不直接跑 \`unblock-g2.sh\` 的原因（重要发现，非规避）**：该脚本第 15 行硬编码 \`LOG="\${LOG_DIR}/test-round-00.log"\`，直接执行会**覆盖 round 0 的冻结基线归档**（158290 B）。本轮任务硬约束要求留档到 \`test-round-01.log\`，故按其内部逻辑 1:1 复刻（同样的库名派生、同样的连通性前提、同样的 \`prisma db push\`、同样的 \`npm test\`），仅更改输出路径。**建议 round 2 把该脚本参数化为 \`LOG=".../test-round-\${ROUND}.log"\`。**（已登记为优化项 O-4）

\`\`\`bash
# 实测（日志头部）
date: 2026-10-10 23:52:04 +0800
HEAD: ac608310ca2934d28cc23bb9e6ae8dfdaa713ad0
tracked changes:
 M client/src/styles/tokens.css
 M server/package.json
test db: localhost:3306/exam_system_test
The database is already in sync with the Prisma schema.   # prisma_exit=0
\`\`\`

**4 处 \`Test Suites:\` 摘要（实测，已按出现顺序摘录）**：

\`\`\`
docs/pipeline/test-round-01.log:1248  Test Suites: 64 passed, 64 total
docs/pipeline/test-round-01.log:1249  Tests:       912 passed, 912 total
docs/pipeline/test-round-01.log:1251  Time:        170.639 s, estimated 171 s

docs/pipeline/test-round-01.log:1288  Test Suites: 1 passed, 1 total
docs/pipeline/test-round-01.log:1289  Tests:       17 passed, 17 total
docs/pipeline/test-round-01.log:1291  Time:        0.473 s

docs/pipeline/test-round-01.log:1377  Test Suites: 1 passed, 1 total
docs/pipeline/test-round-01.log:1378  Tests:       61 passed, 61 total
docs/pipeline/test-round-01.log:1380  Time:        0.48 s

docs/pipeline/test-round-01.log:1425  Test Suites: 1 passed, 1 total
docs/pipeline/test-round-01.log:1426  Tests:       21 passed, 21 total
docs/pipeline/test-round-01.log:1428  Time:        0.638 s

docs/pipeline/test-round-01.log:1431  npm_test_exit=0
\`\`\`

\`\`\`bash
grep -c '^Test Suites:' docs/pipeline/test-round-01.log   # → 4     （改动前因 && 短路仅 1 处）
grep -c '^Tests:'       docs/pipeline/test-round-01.log   # → 4
grep -cE '^PASS '       docs/pipeline/test-round-01.log   # → 67
grep -nE '^FAIL '       docs/pipeline/test-round-01.log   # → 0 条（零失败）
\`\`\`

**合计复算**：912 + 17 + 61 + 21 = **1011 passed / 0 failed**；套件 64+1+1+1 = **67**。

**独立交叉校验（不只看摘要数字）**：

\`\`\`bash
find server/test -name '*.test.js' | wc -l                                    # → 67（与日志套件总数一致）
for n in fact-extractor rule-executor rule-mutator; do
  find server/test -name "$n.test.js" | wc -l                                 # → 各 1（无第二命中，排除正则误伤）
  grep -cE "^PASS .*$n.test.js" docs/pipeline/test-round-01.log               # → 各 1（且各只跑一次）
done
# 段 1 内是否残留被排除的 3 套件？
node -e '…段1 的 64 条 PASS 名单…'   # → segment-1 suites: 64；匹配 3 个排除名: 0；去重后 64
\`\`\`

**逐条说明"是否有残留污染"（failed=0，无需逐条归因，但给出反证）**：

1. 基线 13 红**全部**落在 \`rule-mutator.test.js\`，本轮将其拆为**独立段 4** 后 **21/21 全绿**（0.638 s），与 round 0 的"独跑 21/21 绿"反证完全一致 → **同进程污染定性成立，且已被结构性消除**，不是"靠重跑碰运气"。
2. 段 1 的 64 条 PASS 名单中**不含** \`fact-extractor\` / \`rule-executor\` / \`rule-mutator\` 任一（正则精确命中，无过度排除）。
3. 段 1 用例数 912 = 933（基线段 1）− 21（rule-mutator），**逐数对齐** constraints §4 的推导，无"用例凭空消失"。
4. 日志中 4 处含 \`failed\` 的字符串全部来自 \`trustjudge\` 夹具的**模拟网络失败路径**（\`"err":"fetch failed"\` 出现在 \`{"level":40,...}\}\` 结构化日志里），**不是 jest 失败**：jest 无 \`FAIL\` 行、无 \`N failed\` 摘要。

**主判据判定：4 处 \`Test Suites:\` 已实测确认，修复生效；1011 passed / 0 failed 优于底线（≤13），未触发任何回流条件。**

**附带发现（A §2.5 / §7-6 的观察项已自然收口）**：\`experiment-variance.test.js\`（同样 import \`ruleExecutor.js\`、留在段 1 内）本轮 **PASS**（日志 1034 行），未被 native 模块污染 → 该项**暂无需升级为执行项**（保持观察）。

---

### V2｜静态门禁复算 —— ✅ 三个全 PASS

\`\`\`bash
$ node scripts/gates/hard-metrics.mjs                 # exit=0
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
  参考：非 style.css 的 CSS 中 !important = 20（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）
结论：PASS

$ node scripts/gates/arch-metrics.mjs                 # exit=0
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47  实测=47
  ✓ godfileOver800     基线=10  实测=10
  · >500 行（观察带，不计判据） 基线=19 实测=19
  GodFile >800 行：student/Submit.vue(1519) / checkerService.js(1280) / teacherController.js(1233) /
    Doc.vue(1106) / ruleExecutor.js(1068) / deepseek.js(1051) / ReviewDetail.vue(988) /
    QuestionEdit.vue(983) / reviewController.js(965) / ProjectQuestionEdit.vue(862)
  分层守卫原文：文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个
结论：PASS

$ node scripts/gates/cycle-check.mjs                  # exit=0
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 163 条相对导入边
  强连通分量（|SCC|>1）: 1（基线 1）
  ↻ server/src/services/factExtractor.js  ↔  server/src/services/ruleExecutor.js
  自环（文件 import 自身）: 0
结论：PASS
\`\`\`

**三项判据逐条比对**：hex6 0→0 ✅ ｜ important 0→0 ✅ ｜ modalConfirm 0→0 ✅ ｜ 分层违规 0→0 ✅ ｜ 未分层 **47→47（不增）** ✅ ｜ GodFile >800 **10→10** ✅ ｜ SCC **1→1** ✅。**无一项退化。**

---

### V3｜令牌改动独立复算 —— ✅ A=0 残留 / B=61 全在 / 新零引用=64

**独立性声明**：本轮**未复用** Agent A 的 \`/tmp/a1f-authoritative.mjs\` 或 Agent B 的 \`/tmp/b1-scan.mjs\`、\`/tmp/b1-bcheck.mjs\`，而是**自研独立扫描器** \`/tmp/c1-tokenscan2.mjs\` + \`/tmp/c1-zeroref.mjs\`（含自实现的注释剥离、词边界、多注入形态识别）。
**名单来源**：A 组 44 / B 组 61 的**令牌名**直接从 \`audit-round-01.md\` §4.3/§4.4 的**发布表格**中按反引号解析（A 表为 22 行 × 2 组 = 44；B 表 13 行共 61），**未使用 A 报告的任何行号**（遵守 A §4.1 的告诫：A 的行号是"去注释文本行号"，与真实文件行号不同）。

**口径（按任务三处指定）**：
- **引用** = \`var(--x)\` ＋ \`setProperty('--x')\` ＋ 引号形态 \`'--x'\` / \`"--x"\` ＋ 对象式 \`:style\` 非引号键 \`--x:\` ＋ \`cssVar('--x')\` / \`getPropertyValue('--x')\`；
- **声明**（\`--x:\`）**不计为引用**（关键修正：同一 CSS 内 \`--y: var(--x)\` 计入引用，但 \`--x: …\` 本身不计）；
- **注释里的令牌名不算引用**（已剥离 CSS \`/* */\`、JS \`//\` 与 \`/* */\`、HTML \`<!-- -->\`），剥离时保留换行以维持行号稳定；
- **词边界** \`(?<![-\\w])--x(?![\\w-])\`，确保 \`--btn-default-bg\` 不误命中 \`--btn-default-bg-hover\`。

#### ① A 组 44 个令牌 —— 引用数 0 / 声明残留 0

\`\`\`
A tokens(raw/uniq) = 44/44   |   B tokens(raw/uniq) = 61/61   |   A ∩ B = 0
corpus: client/src = 69 个文本文件（含 tokens.css）

A with client/src refs>0 :   0/44   []
A with tokens.css decls>0:   0/44   []
sum client/src refs over A = 0   |   sum tokens.css decls over A = 0（改动前 46）
total comment-only A mentions in client/src = 0
--bg-inverse-2 decls live = 0 | frozen = 3（3 处同删，亮/暗对称性保持）
--space-0 = 0 / --space-16 = 0 / --space-1 = 1 / --space-2 = 1 / --space-3 = 1 /
--space-10 = 1 / --space-12 = 1        ← 只删 0 与 16，未误伤
--fs-display-1 decls = 1 | var(--fs-display-1) refs = 2   ← 成对令牌未被误删
tokens.css 声明点 live = 335 | frozen = 381（−46 ✅）｜ 去重令牌 live = 252 | frozen = 296（−44 ✅）
tokens.css 原始行数 live = 431 | frozen = 451（−20 行 ✅）
图表设计注释（"图表 / 可视化顺序色"）仍在 = true   ← 只删声明、保留注释 ✅
\`\`\`

**三种注入形态覆盖验证（自证扫描器无盲区，用已知注入点做对照）**：

\`\`\`
--page-max         client/src/components/PageShell.vue        -> {"var()":1,"quoted-string":1}   ← 对象式 :style 注入
--slide-dir        client/src/views/teacher/QuestionEdit.vue  -> {"var()":4,"quoted-string":1}   ← 祖先注入、后代消费 4 处
--text-brand       client/src/views/teacher/RuleQuality.vue   -> {"var()":1}
--canvas-parchment client/src/views/Login.vue                 -> {"var()":1}                     ← 既有死引用
\`\`\`
→ 对象式 \`:style\`（\`--page-max\` / \`--slide-dir\`）**被正确识别**，证明扫描器覆盖了 constraints §3 陷阱 6 的"祖先注入、后代消费"形态；且 A 组在 \`client/src\` 的**任何文本形态**（含注释）提及数 = 0。

**源范围内 A 组的"非活源"提及（穷举，均为非产品代码）**：
- \`docs/ui-redesign/02-design-tokens.css\`：44 个各 1 处**声明**（设计侧镜像，按边界⑤不动该文件）→ 声明不是引用；
- \`docs/pipeline/refactor-round-01.md\`：\`--bg-inverse-2\`/\`--chart-1..5\` 各 1 处（B 报告自身在讨论这些令牌名）；
- **\`client/src\` / \`server/src\` / \`trustjudge-server\` 活源：0 处** ✅

#### ② B 组 61 个令牌 —— 声明 61/61 全在

\`\`\`
B tokens total = 61 | decl sites in tokens.css = 69 | missing = 0 []
（8 个令牌各有 2 处声明：--page-pad-x --page-pad-y --table-row-h --sider-item-active-bg
  --skeleton-sheen --border-inverse --stack-gap --input-h —— 亮/暗双份，符合预期）
B tokens referenced OUTSIDE tokens.css = 0   ← 61 个仍是"零产品消费"队列，未被顺手接线
\`\`\`
→ **B 组一个都没被删**，且声明点总数 69 与 B 报告自证一致。

#### ③ 新零引用总数 = 64（含 3 个"预期位移"孤儿）

\`\`\`
distinct declared in tokens.css = 252  (frozen 296)
NEW zero-ref total = 64   ✅（期望 64）
  in A-list(44) = 0    ✅
  in B-list(61) = 61   ✅
  in NEITHER    = 3    ["--green-500","--amber-500","--violet-500"]
  B-list not zero-ref = []          ← B 组没有一个"意外复活"
|B ∪ 3| = 64 | all zero-ref? true | 对称差 (zeroRef vs B∪3) = []   ← 集合层面精确相等
\`\`\`

**3 个新孤儿的机制独立复算（live vs frozen ac60831 对比）**：

\`\`\`
token           decl(frozen) decl(live)  var() refs INSIDE tokens.css (frozen→live)   refs outside tokens.css(live)
--amber-500          1           1                  1 → 0                                    0
--green-500          1           1                  1 → 0                                    0
--violet-500         1           1                  1 → 0                                    0
--chart-1..5         1           0                  —（其 var() 引用随声明消失）              0
--brand-500          1           1                  3 → 2                                    6   ← 仍有外部引用，未落入零引用
--gray-500           1           1                  2 → 1                                    0   ← tokens.css 内仍有 1 处 var()，未落入零引用
\`\`\`
→ **机制证实**：删 \`--chart-1..5\` 声明时，其值里的 \`var(--amber-500)\` / \`var(--green-500)\` / \`var(--violet-500)\` 引用一并消失，而这 3 处是它们**唯一**的 \`var()\` 消费点。三者**仍被声明**（各 1 处）且现在零引用 → **属预期位移，非缺陷**。同批 \`--brand-500\` / \`--gray-500\` 因另有引用而**仍留在非零引用集**，与预判完全一致。

**口径敏感性（诚实披露，供 round 2 冻结口径）**：零引用数取决于"引用侧是否把 \`tokens.css\` 内部的引用计入"——
- **计入 \`tokens.css\` 内部引用（Agent A 口径，= 任务指定口径）→ 64** ✅ 本轮采用；
- 若**排除** \`tokens.css\` 内部引用 → 得 **100**（多出的 36 个是"仅在 tokens.css 内部被 \`var()\` 消费、产品侧无人消费"的中间层令牌，如 \`--gray-0/25/50/100/200/300/400/450/500/600/800/900/950\` 等色阶）。
→ **二者都不是错误，但必须在 round 2 前冻结一个**，否则 B 组裁定会再次出现"75 vs 105"式的口径漂移（已登记为优化项 O-2）。

**⚠️ 行号定位告诫已遵守**：本轮全程**按令牌名**定位，未使用 A 报告 §4.3/§6.2 的行号（A 为"去注释文本行号"）。B 报告 §8 的真实行号映射抽查一致（\`--bg-inverse-2\` 原 190/253/408 三处，现 3 处全删）。

---

### V4｜端到端旁证（只读 \`client/dist\`）—— ✅ 44 个令牌在产物中 \`var()\` 命中 = 0

**方法**：只读扫描现有 \`client/dist\` 的 363 个文本产物（37 个 \`.css\` + JS），对 44 个令牌分别统计 **(a) \`var(--x)\` 消费点** 与 **(b) 声明点**。

\`\`\`
A tokens with var(--x) usage in dist  = 0/44      ← 关键：产物里从来没有消费方
A tokens with a DECLARATION in dist   = 44/44     ← 只以声明形态存在
A tokens with ANY text in dist        = 44/44
分布：每个令牌命中 2 处（--bg-inverse-2 为 6 处）：
  assets/index-CHwIlsxa.css          （主样式包，20518 B）
  assets/index-legacy-DNrAJ9s6.js    （legacy 运行时注入的同源样式，1405199 B）
\`\`\`

**上下文实拍（证明是"声明"而非"消费"）**：

\`\`\`
--gray-700           @6545  :: "b7280;--gray-600:#545c69;--gray-700:#3a414d;--gray-800:#2"
--chart-1            @12223 :: "re-track:var(--gray-100);--chart-1:var(--brand-500);--ch"
--btn-danger-bg-hover@14519 :: "danger-bg:var(--red-600);--btn-danger-bg-hover:var(--red-700);--btn-"
--bg-inverse-2       @10597 :: "-inverse:var(--gray-950);--bg-inverse-2:var(--gray-900);--cod"
\`\`\`

**对照组（证明扫描器能正确识别"真消费"）**：

\`\`\`
--text-brand         var()=54   decl=4     ← 高频消费
--brand-500          var()=8    decl=2
--canvas-parchment   var()=2    decl=0     ← 既有死引用（无声明却消费）
--page-max           var()=2    decl=0     ← 由 :style 运行时注入
--slide-dir          var()=8    decl=0     ← 祖先注入
\`\`\`

**结论**：44 个令牌在**已构建产物**中**从未被 \`var()\` 消费过**——这是"这些令牌从未被实际消费"的**强旁证**，与静态零引用证明**相互独立**（一个是源码文本层，一个是构建产物层），共同支撑"删除不产生渲染影响"。
**产物只读证明**：\`client/dist\` 最新 mtime = **22:02**，早于本轮改动 23:48；关键产物 sha256 已留档：
\`index-CHwIlsxa.css\` = \`74bf82ee…ab768f\` ｜ \`index-legacy-DNrAJ9s6.js\` = \`f4fb8d1f…cf6a236\`。**本轮未执行任何构建，未写入 dist。**

---

### V5｜改动面核对（只读 git）—— ✅ 被跟踪文件恰好 2 个

\`\`\`bash
$ git status --porcelain -uno
 M client/src/styles/tokens.css
 M server/package.json

$ git diff --stat
 client/src/styles/tokens.css | 52 +++++++++++++------------------------------
 server/package.json          |  2 +-
 2 files changed, 17 insertions(+), 37 deletions(-)

$ git diff --numstat
16      36      client/src/styles/tokens.css
1       1       server/package.json

$ git diff --name-only          # → 仅上述 2 个
$ git diff --cached --name-only # → 空（无暂存内容）
$ git status --porcelain -uno -- tests/      | wc -l   # → 0
$ git status --porcelain -uno -- client/dist | wc -l   # → 0
\`\`\`

**\`server/package.json\` 的 \`test\` 脚本逐字核验**（4 段 + 忽略正则含 3 项，其余脚本键与依赖数未变）：

\`\`\`
NODE_OPTIONS=--experimental-vm-modules jest … --testPathIgnorePatterns="(fact-extractor|rule-executor|rule-mutator)"
  && … test/unit/infrastructure/fact-extractor.test.js
  && … test/unit/infrastructure/rule-executor.test.js
  && … test/unit/infrastructure/rule-mutator.test.js
script keys: dev,start,worker,test,pretest,test:unit,check:layers,test:integration,test:e2e   （9 个，与原值一致）
deps: 25   devDeps: 5   （无版本改动）
\`\`\`

**⚠️ 证据强度的重要修正（本轮新发现，必须写进后续轮次）**：

\`\`\`bash
git ls-files tests       | wc -l   # → 0   （tests/ 完全未被跟踪）
git ls-files client/dist | wc -l   # → 0   （client/dist 完全未被跟踪）
git ls-files | wc -l               # → 998
\`\`\`
→ **\`tests/\` 与 \`client/dist\` 是未跟踪目录，\`git status\` 对它们本就"看不见"**。因此"\`git status\` 里没有 tests/dist 的改动"**只能证明未被暂存，不能证明未被修改**。本轮改用**文件 mtime 独立取证**补强：

| 目录 | 最新 mtime | 相对改动时刻（23:48:24） | 判定 |
|---|---|---|---|
| \`tests/\` | **20:54**（rig-server 日志/截图） | 早 2 小时 54 分 | ✅ 未触碰 |
| \`client/dist/\` | **22:02**（monaco 分片） | 早 1 小时 46 分 | ✅ 未触碰 |
| \`client/src/styles/tokens.css\` + \`server/package.json\` | **23:48:24** | — | 本轮改动 |
| \`find tests client/dist server/src client/src -newermt "2026-10-10 23:45"\` | 仅 \`client/src/styles/tokens.css\` 一个文件 | — | ✅ 无第三方写入 |

---

## 3 缺陷分级

### 阻断（Blocker）：**0 项**

无任何判据触发回流条件：failed = 0（< 底线 13）；4 处摘要齐备（修复确已生效）；三门禁全 PASS 且无一项退化；A 组零残留；B 组零误删；改动面未越界。

### 轻微（Minor）：**0 项**

### 优化（Optimization，不影响本轮判定）：

| # | 项 | 位置 | 说明与建议 |
|---|---|---|---|
| O-1 | **产物残留死声明** | \`client/dist/assets/index-*.css\` + \`index-legacy-*.js\` | 产物中 44 个令牌仍以声明形态存在（\`var()\` 消费 = 0）。**运行时影响严格为 0**（未被 \`var()\` 消费的自定义属性不参与任何元素的计算值），但**下次构建的 asset 字节数/文件名哈希必然变化**（源码侧净减 1489 B：21344 → 19855）。→ 后续任何"产物哈希比对"必须以**本次之后的新构建**为基线，**不得拿 21:55 的旧产物做字节/文件名比对**（否则假阳性） |
| O-2 | **零引用口径未冻结** | \`pipeline-status.md\` / A 报告 §4.2 | 同一改动在两种口径下得 **64**（计入 tokens.css 内部引用，= 本轮与 A 的口径）或 **100**（排除之）。二者都"对"，但**必须先冻结其一**再进 round 2 的 B 组裁定，否则会重演"台账 75 vs 复算 105"的口径漂移。**建议：以 64 为 round 2 基线**（与 \`pipeline-status.md\` 现有记载一致） |
| O-3 | **\`--btn-default-bg\` 设计文档漂移** | \`docs/ui-redesign/03-components.md:110\` | 该令牌已删，但其名仍出现在已发布的设计契约表中（写作 \`--btn-default-bg/-bd\`，反引号跨区内用 \`/\` 连接，故 A 的引号正则与 B 的键正则均不命中）。**无运行时风险**（产品引用确为 0），但属文档漂移。→ round 2 二选一：恢复声明 / 修订该行为 \`--btn-default-bd\` |
| O-4 | **\`unblock-g2.sh\` 输出路径硬编码 round 00** | \`docs/pipeline/scripts/unblock-g2.sh:15\` | \`LOG="\${LOG_DIR}/test-round-00.log"\` —— 直接执行会**覆盖 round 0 冻结基线归档**。→ 建议参数化为 \`test-round-\${ROUND:-00}.log\`（本轮因此自建等价 runner，见 §V1） |
| O-5 | **B 组 3 个新孤儿的去向** | \`--amber-500\` / \`--green-500\` / \`--violet-500\` | 声明仍在但已零引用。按 A §4.4 的"设计契约"尺子，它们**不在**任何设计文档中单独出现（原本只是 chart 家族的内部依赖）→ round 2 可**优先裁定为可删**，比 B 组其余 61 个更接近 A 组性质（登记供裁定参考，本轮不动） |

---

## 4 本轮结论

# ✅ PASS —— 无需回流 Agent B

- **V1 主判据**：日志含 **4 处** \`Test Suites:\`（64 / 1 / 1 / 1）→ 修复**确已生效**，\`&&\` 短路被结构性消除；**1011 passed / 0 failed**（912+17+61+21），\`npm_test_exit=0\`，**0 条 \`FAIL\`**，套件 67 = 磁盘 \`*.test.js\` 总数，**优于底线 failed ≤ 13**。
- **V2**：三门禁 **全 PASS**，且逐项与基线一致（0/0/0 ｜ 0/47/10 ｜ SCC=1）——**零退化**。
- **V3**：A 组 44 → 引用 **0**、声明残留 **0**；B 组 61 → 声明 **61/61 全在**、零误删；新零引用 **= 64**，集合层面精确等于 **B(61) ∪ {--amber-500, --green-500, --violet-500}**（对称差 0），3 个孤儿机制已复算证实为**预期位移、非缺陷**。
- **V4**：现有 \`client/dist\` 中 44 个令牌的 \`var()\` 用法 **0/44**（仅声明形态）→ "从未被实际消费"的**产物级旁证成立**。
- **V5**：被跟踪文件**恰好 2 个**（\`server/package.json\`、\`client/src/styles/tokens.css\`）；\`tests/\` 与 \`client/dist\` 经 **mtime 独立取证**确认未被触碰（因二者未被 git 跟踪，\`git status\` 证据力不足，已补强）。
- **V6**：未做项已显式声明（见 §5），残留风险可控。

**→ 建议 Captain：按 constraints §6 归档本轮并推进 round 2**（候选：B 组 64 裁定[基线已确认为 64] / \`--btn-default-bg\` 二选一 / M-1-M-2 axe 收口 / 循环依赖 F-1）。

---

## 5 未做项与残留风险（V6 显式声明）

### 5.1 本轮明确**未做**的项

| 未做项 | 理由 | 残留风险 |
|---|---|---|
| **axe 无障碍扫描** | 本轮改动 = ① 测试编排（\`server/package.json\`，纯 CI 层、不进浏览器）② **删除零引用令牌声明**。后者在渲染上**不可能产生影响**——CSS 自定义属性只有在被 \`var()\` 消费时才参与计算值，而被删的 44 个令牌**在源码与产物两侧的 \`var()\` 消费数均为 0**（V3 + V4 双重独立证据）。axe 判据针对的是"渲染后的 DOM 属性/对比度"，对"从未参与计算值的声明"不产生任何可观测差异。 | **低**。以"静态零引用证明 + 产物零消费旁证"为相称证据强度。若 round 2 要跑 axe，注意页面集须含合并新增页（\`rule-quality\` / \`CheckerWizard\`）与 M-1/M-2 的既有违规基线区分。 |
| **像素 sha1 比对（亮/暗 × 舒适/紧凑 4 组）** | 同上。A/B 双方均把像素比对列为 C 的职责，但本轮任务的验证项清单**明确把 V1–V5 定为执行集，未列像素比对**；且像素比对需 rig 私有 dist 副本与浏览器进程，触 constraints §1 的"不碰 :5173/:3000、不启常驻服务"边界。约束 §3 陷阱 4 也指出：**像素 sha1 是视觉回归的主判据**，其缺失应以"证据强度不足"而非"未执行"记入。 | **中低**。**本轮"零视觉变化"的证明链是推断性的**：① CSS 语义（未被 \`var()\` 消费 → 不参与计算值）；② 源码零引用（V3）；③ 产物零消费（V4）。三者**方向一致且相互独立**，但**都不是像素证据**。**→ 若 Captain 判定"零视觉变化"必须有像素级证据，应列入后续轮次补做**（用 rig 私有 dist 副本，**不得重建 \`client/dist\`**，且**不得用 asset 文件名/字节哈希**做判据 —— 见 O-1）。 |
| **依赖审计（\`npm audit\`）** | 会触网，属 A 报告已声明的禁令范围；与本轮改动无关。 | 低，与 round 1 执行集无关。 |
| **B 组 61 个令牌的存废裁定** | A §4.4 明确"本轮一律不动"，属 round 2 工作量。 | 无（本轮已证其未被误删）。 |

### 5.2 残留风险登记

1. **产物基线漂移（O-1，中）**：21:55 构建的 \`client/dist\` 是**改动前**产物。源码净减 1489 B → 下次构建的 asset 文件名哈希与字节数**必然变化**。**后续轮次任何产物哈希比对必须换新基线**，否则必得假阳性（B 报告 R1 已预警，本轮实测确认：\`--chart-1:var(--brand-500)\` 仍在旧产物中，说明旧产物确为改动前构建）。
2. **零引用口径未冻结（O-2，中）**：64 vs 100 的差异是**口径问题不是缺陷**，但若 round 2 不先冻结，B 组裁定会失真。
3. **"零视觉变化"无像素证据（5.1 第 2 行，中低）**：静态推断链完整但非像素级；如需像素证据请列入后续轮次。
4. **\`--btn-default-bg\` 文档漂移（O-3，低）**：不影响运行时，但设计契约与实现已不一致。
5. **\`unblock-g2.sh\` 会覆盖 round 0 归档（O-4，低但危险）**：任何人在 round 2+ 直接执行该脚本都会**不可逆地**覆盖 \`test-round-00.log\`（158 KB 冻结基线）。建议尽快参数化。

---

## 6 本轮写入声明

Agent C 在仓库内**只写 2 个文件**：

1. \`docs/pipeline/test-round-01.md\`（本报告）
2. \`docs/pipeline/test-round-01.log\`（V1 回归原始日志，145802 B，含脱敏后的库名与全量 jest 输出）

临时脚本与数据**全部落 \`/tmp\`，未入仓**：\`/tmp/c1-run.sh\`（回归 runner）、\`/tmp/c1-tokenscan.mjs\` / \`/tmp/c1-tokenscan2.mjs\`（独立令牌扫描器）、\`/tmp/c1-zeroref.mjs\`（零引用复算）、\`/tmp/c1-dist.mjs\`（dist 只读扫描）、\`/tmp/c1-dbg.mjs\`（表格解析调试）、\`/tmp/c1-frozen-tokens.css\`（\`git show ac60831:…\` 导出的改动前副本，用于 live/frozen 对比）。

**未执行任何 git 写操作**（无 add / commit / checkout / restore / stash / reset / clean）。
**未跑 \`ledger-check.mjs\`**，\`raw/ledger.json\` 归档完好（mtime 20:26:30，18818 B）。
**未构建**、**未启动任何服务**、**未占用任何端口**、**未写生产库**。

---

*本报告由 Agent C（\`tech-test-automation\`）于 round 1 产出。所有数字均为本轮独立复算的实测值，未采信 Agent A/B 的自证结论。*
