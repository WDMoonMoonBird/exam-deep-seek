# test-round-02 —— 独立回归验证报告（流水线第 2 轮）

> 轮次：**02（回归验证）** ｜ 日期：**2026-10-11（凌晨）** ｜ Agent C 技能：`tech-test-automation`
> 被验 commit：`8fb2c1d4ad775a02a4ec3b3f9e8a89772efd46aa`（= `git rev-parse HEAD`，工作树为**未提交**的 round 2 改动）
> 工作树状态：**6 个被跟踪源文件为 M**（`teacher/Layout.vue`、`checker/CheckerWizard.vue`、`styles/tokens.css`、`services/ruleExecutor.js`、`services/factExtractor.js`、`services/factExtractors/common.js`）+ `pipeline-status.md`（Captain 的状态文件，会话开始前即为 M）+ **0 个新增被跟踪文件**
> 立场：**独立验证者** —— 所有判据自行复算，不采信 B 的自测。本轮含 `.vue` DOM 变化 → **浏览器侧复核为硬要求**（已执行，见 P2）

---

## 0 约束遵守声明（Agent C）

| 约束 | 执行情况 |
|---|---|
| 只读（仅写本报告 + `test-round-02.log`） | ✅ 本轮**唯一主动写入** = `docs/pipeline/test-round-02.md`；`test-round-02.log` 由明令脚本 `unblock-g2.sh:61` 写出。全部临时脚本/构建产物落 `/tmp` |
| 禁止 `git clean`/`stash`/`checkout -- .`/`reset --hard`/`restore .`；零 git 写操作 | ✅ 只用 `rev-parse`/`status`/`diff`/`ls-files`/`archive`/`check-ignore` |
| **严禁重建 `client/dist`** | ✅ 全部构建 `--outDir` 到仓库外；`client/dist` mtime **仍为 2026-10-10 21:55:33**，产物仍为 `index-CHwIlsxa.css`（未变） |
| 严禁重跑 `ledger-check.mjs --out=raw/ledger.json` | ✅ 未执行 |
| 不写 `tests/` | ✅ `tests/` mtime **仍为 2026-10-10 20:13:40**；rig 私有 dist 未重建；仅**复用**其 rig-server 进程 |
| 不碰 `:5173`/`:3000`、不启动/重启/kill 常驻服务 | ✅ 全程未监听、未连接这两个端口；**:3100** 为既有 rig（用后已 `rig.sh stop`），**:3101/:3102** 为本轮临时静态/代理（用后已 kill） |
| 不写生产库 `exam_system` | ✅ 仅 `exam_system_test`（`unblock-g2.sh` 只换库名派生 + `server/test/setup.js` 白名单护栏） |
| 产物之外的副作用诚实披露 | ⚠️ `server/logs/app-2026-10-11.log` 于 **00:13:56** 被写入 —— 由**明令的 jest 全量回归**（pino 应用日志）产生，非 C 主动写；该文件被 `.gitignore:4 (*.log)` 忽略、**不在 git 跟踪内**，且内容是 ruleMutator/语法检查的测试输出。**无其他仓库内文件被本轮触碰** |

---

## 0.1 判据总表（期望 vs 实测 vs 结论）

### P1（静态 + 后端）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| **V1** | 日志中 `Test Suites:` 摘要数 | **4** | **4** | ✅ |
| **V1** | 段1 / 段2 / 段3 / 段4 | 912 / 17 / 61 / 21 | **912 / 17 / 61 / 21** | ✅ |
| **V1** | 合计 | **1011 passed / 0 failed** | **1011 passed / 0 failed**（67 套件） | ✅ |
| **V1** | `resolveProjectRoot — 与 ruleExecutor 同语义` describe 真的在跑 | 必须在跑 | **在跑**（`✓ 导出 resolveProjectRoot 且可独立调用`） | ✅ |
| **V2-1** | `cycle-check.mjs` | 71 文件 / 163 边 / **SCC 0** | **71 / 163 / 0** | ✅ |
| **V2-2** | `check-layers.mjs` | 71 / 违规 0 / **未分层 47** | **71 / 0 / 47** | ✅ |
| **V2-3** | `arch-metrics.mjs` | 0 / 47 / 10（+19 观察带） | **0 / 47 / 10（+19）** | ✅ |
| **V2-4** | `hard-metrics.mjs` | 0 / 0 / 0 | **0 / 0 / 0** | ✅ |
| **V2-5** | `find server/src client/src -type f \| wc -l` | **146**（不新增） | **146** | ✅ |
| **V3** | 零引用令牌数 | **61** | **61**（严格口径）／59（含注释口径） | ✅ |
| **V3** | 集合恒等 `AFTER == (BEFORE − 4) ∪ {--btn-default-bg}` | true | **true** | ✅ |
| **V3** | 4 个被删令牌实现侧零引用、无新增消费方 | 0 / 0 | **0 / 0** | ✅ |
| **V4-1** | `SOURCE_EXTS` 项数 | —（A=43 / B=37 冲突） | **37**（冻结与活树一致） | ⚠ **A 误计，B 正确** |
| **V4-2** | `collectFiles` 行号区间 | —（A=176-197 / B=171-198 冲突） | **172-198**（JSDoc+函数，冻结树；函数体 176-198） | ⚠ **两者都不精确** |
| **V5** | 被跟踪源文件改动面 | 恰好 6 个 | **恰好 6 个** | ✅ |
| **V5** | 新增被跟踪文件 | 0 | **0** | ✅ |
| **V5** | `.md` 未被改动 | 是 | 仅 `pipeline-status.md`（Captain 预置 M，非 B 所改） | ✅（见 §5 说明） |

### P2（浏览器侧，本轮硬要求）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| **V7-①** | `/teacher/rule-quality` 的 `page-has-heading-one` | 归零 | **0**（round 1 基线 = 1 → **1→0**） | ✅ |
| **V7-①** | h1 文本 | 「规则质量」 | **「规则质量」** | ✅ |
| **V7-②** | 向导第 4 步 `label` / `select-name` | 归零 | **0 / 0**（round 1 基线 `label`=1 → **1→0**） | ✅ |
| **V7-②** | `label[for]` 解析到 `role=combobox` 的 input（**不是**外层 `.ant-select` div） | 必须 | **`INPUT` / `role=combobox` / `inAntSelectDiv=false`** | ✅ |
| **V7-③** | 回滚按钮 `:disabled="!rollbackTarget"` 行为不变 | 不变 | 改前 = 改后 = **disabled=true** | ✅ |
| **V8** | 像素 sha1（改前 vs 改后） | 全等 | **3 区域 × 2 主题 = 6/6 全等**；几何全等 | ✅ |
| **V8** | 构建确定性（反假阳性前提） | 可复现 | 同源两次独立构建 **byte-identical** | ✅ |

**结论：P1 全绿、P2 全绿 → 本轮 PASS。**

---

## 1 方法与冻结（陷阱 5/7）

| 项 | 做法 |
|---|---|
| 冻结再测 | `git archive 8fb2c1d \| tar -x -C /tmp/c-r2-freeze`（1010 文件）—— 用于 V3 改前基线、V4 行号对照、V8 改前构建 |
| 不改活树 | 除本报告 + `test-round-02.log`（由 `unblock-g2.sh` 写出）外，**未写任何仓库内文件**；全部临时脚本落 `/tmp`（`/tmp/c-r2-*.mjs`） |
| 零 git 写操作 | 只用 `rev-parse` / `status` / `diff` / `ls-files` / `archive` |
| 不重建 `client/dist` | 全部构建输出到仓库外：`/tmp/pipeline-dist-r2`、`/tmp/pipeline-dist-r2b`、`/tmp/pipeline-dist-r1base`；`client/dist` mtime **仍为 21:55:33**（未触碰） |
| 不重跑 `ledger-check.mjs --out=raw/ledger.json` | 未执行 |
| 端口 | rig server **:3100**（既有装置，`rig.sh start`）+ C 自建静态/代理 **:3101**、**:3102**；**未碰 :5173 / :3000** |
| 测试库 | 仅 `exam_system_test`（`unblock-g2.sh` 从 `server/.env` 只换库名派生） |

---

## 2 V1 —— 后端全量回归（主判据）

**命令**：`ROUND=02 bash docs/pipeline/scripts/unblock-g2.sh`（**加 `ROUND=02`** —— 脚本第 10-19 行已参数化，不加会覆盖 round 1 归档）

> 说明：脚本把 jest 输出重定向到 `docs/pipeline/test-round-02.log`（第 61 行），**控制台只回显摘要**。故证据取自该归档日志。

**逐段摘出的原始 `Tests:` / `Test Suites:` 行**（行号为归档日志真实行号）：

```
1233:Test Suites: 64 passed, 64 total
1234:Tests:       912 passed, 912 total
1235:Snapshots:   0 total
1236:Time:        171.874 s
1273:Test Suites: 1 passed, 1 total
1274:Tests:       17 passed, 17 total
1275:Snapshots:   0 total
1276:Time:        0.488 s, estimated 1 s
1362:Test Suites: 1 passed, 1 total
1363:Tests:       61 passed, 61 total
1364:Snapshots:   0 total
1365:Time:        0.489 s, estimated 1 s
1410:Test Suites: 1 passed, 1 total
1411:Tests:       21 passed, 21 total
1412:Snapshots:   0 total
1413:Time:        0.654 s, estimated 1 s
```

| 段 | 套件 | 例数 | 阶段 |
|---|---|---|---|
| 1 | 64 | **912** | 主套件（排除 fact-extractor / rule-executor / rule-mutator） |
| 2 | 1 | **17** | `fact-extractor.test.js` ← **本轮改动链路** |
| 3 | 1 | **61** | `rule-executor.test.js` ← **本轮改动链路** |
| 4 | 1 | **21** | `rule-mutator.test.js` |
| **合计** | **67** | **1011** | **0 failed**（`grep -c '^FAIL '` = 0） |

- `Test Suites:` 摘要出现 **4 处**（`grep -c '^Test Suites:'` = 4）→ **四段全部真跑，无短路**；`grep -c '^PASS '` = **67**。
- 退出码 **0**（`EXIT=0`）。

### 2.1 定向复核：再导出面**未被破坏**（本轮关键反证）

B 报告 R3 / A §5.1 都指出：`factExtractor.js:39` 的 `export { resolveProjectRoot }` 若被破坏，`fact-extractor` 的 17 例会在 **import 阶段整体炸**。**实证该 describe 真的在跑**：

```
1263:  resolveProjectRoot — 与 ruleExecutor 同语义          ← ★ describe 在跑（不是 import 期崩）
1265:    ✓ 导出 resolveProjectRoot 且可独立调用 (1 ms)      ← 该 describe 下的用例真的执行并通过
1265:  extractFacts — Java 工程（P0-1）                     ← 后续用例继续执行，无中断
1273:Test Suites: 1 passed, 1 total
1274:Tests:       17 passed, 17 total
```

→ **`factExtractor.js` 的再导出面完好**；17 例**逐条通过**而非整体报错。**无阻断。**

> ⚠️ 一处**易误判**的日志噪声需澄清：日志 405 / 892 行出现两处 `SyntaxError: invalid syntax`（`bad.py` / `def broken(::`）。这是**测试夹具故意构造的坏 Python 文件**（`executors.test.js` / `executors-extra.test.js` 的 `console.log` 输出），**不是** import 期模块解析失败 —— 两处上下的套件均为 `PASS`。**不得**据这两行判阻断。

---

## 3 V2 —— 五项门禁复算（原始输出）

```
$ node scripts/gates/cycle-check.mjs                                   # exit=0
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 163 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 1）          ← ★ 1 → 0：全仓最后一个 SCC 消失
  自环（文件 import 自身）: 0
结论：PASS

$ node server/scripts/check-layers.mjs                                 # exit=0
文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个

$ node scripts/gates/arch-metrics.mjs                                  # exit=0
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47  实测=47
  ✓ godfileOver800     基线=10  实测=10
  · >500 行（观察带，不计判据） 基线=19 实测=19
  GodFile >800 行：… server/src/services/ruleExecutor.js (1023) …
结论：PASS

$ node scripts/gates/hard-metrics.mjs                                  # exit=0
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
  参考：非 style.css 的 CSS 中 !important = 20（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）
结论：PASS

$ find server/src client/src -type f | wc -l
     146                                  ← 零新增文件（unmigrated 47 的硬前提）
```

**五项全部达标**，且**三项关键数字与基线逐字一致**（未分层 47 / GodFile 10 / 硬指标 0/0/0），`ruleExecutor.js` 由 1068 → **1023**（仍 >800，GodFile 计数不变，与 A/B 预期一致）。

---

## 4 V3 —— 零引用令牌独立复算（自研扫描器）

**扫描器**：`/tmp/c-r2-token-scan.mjs`（**未复用** A 的 `/tmp/a2-*` 与 B 的 `/tmp/b2-*`，从零实现）。

### 4.1 ★ 口径定义（必须明示）

| 维度 | 本文采用的定义 |
|---|---|
| **语料（corpus）** | `client/src` + `server/src` + `trustjudge-server`；**排除** `node_modules` / `.git` / `dist` / `build` / `.vite` / `coverage` / **`.venv` / `venv` / `__pycache__` / `site-packages` / `.mypy_cache` / `.pytest_cache`**。**不含** `docs/`、`tests/`、`*.md`。实测 **151 个文件**（改前、改后同值） |
| **声明侧** | `tokens.css` 中 `--name` + 可选空格 + `:` 形态的声明键，**支持同一行多条**（不依赖行锚定）→ 335 声明点 / 252 去重（改前），331 / 249（改后） |
| **引用侧** | 语料中任意 `--name` 出现；词边界判定 `[^-\w$]`（防 `--space-1` 误配 `--space-10`）；在 `tokens.css` **内部先屏蔽声明键**，故值里的 `var(--x)` 仍计为真实引用 |
| **★「仅在 CSS 注释里被提及」是否计为引用** | **不计（采用严格口径）** —— 注释里的 `--x` 不会被浏览器解析，**不构成消费方**。同时**并列报告**「含注释（宽松）口径」以便与 A/B 对齐 |

**两种口径的精确差额 = 2**，且**逐名可指认**：`--input-h`（`tokens.css:172` 注释）、`--table-row-h`（`tokens.css:320` 注释）。**两种口径下增量恒为 −3**（64→61 / 62→59），结论不受口径选择影响；后续轮次建议**固定采用严格口径**。

### 4.2 复算结果

```
                    改前(8fb2c1d 冻结)   改后(round 2 活树)
corpus files              151                 151          ← 语料不变
tokens.css 声明点          335                 331          (−4)
去重令牌数                 252                 249          (−3)
零引用（严格 / 不含注释）    64                  61          ← ★ 期望 61，实测 61
零引用（宽松 / 含注释）      62                  59
仅注释提及                 2 个                2 个（同名）
```

### 4.3 集合断言（比计数更强的证据）

```
removed from zero-set : ["--amber-500","--border-inverse","--green-500","--violet-500"]
added   to   zero-set : ["--btn-default-bg"]
SET IDENTITY AFTER == (BEFORE − 4) + {--btn-default-bg} : true     ← ★ 集合级恒等
4 deleted tokens still present AFTER : 0
```

**等价性回代（被删 4 个在实现侧确为零引用、无新增消费方）**：

```
$ for t in --green-500 --amber-500 --violet-500 --border-inverse; do
    grep -rn -- "$t" client/src server/src trustjudge-server \
      --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=__pycache__ | wc -l; done
  --green-500      -> 0
  --amber-500      -> 0
  --violet-500     -> 0
  --border-inverse -> 0
```

→ 4 个令牌在**产品语料中连"注释里提及"都为 0**（"任何文本形态"口径），**既无原消费方、也无新增消费方**。

### 4.4 反证（与任务清单逐条对齐）

```
$ grep -cE -- "(^|[^-\w$])TOKEN[[:space:]]*:" client/src/styles/tokens.css
  --green-500              = 0        ← 已消失
  --amber-500              = 0        ← 已消失
  --violet-500             = 0        ← 已消失
  --border-inverse         = 0        ← 已消失（亮/暗两处同删，明暗对称保持）
  --amber-400              = 1        ← ★ 仍在（1 处，contract 03-components.md:317）
  --btn-default-bg         = 1        ← ★ 恰 1 处声明（294 行）
  --btn-default-bg-hover   = 1        ← 未误删
  --green-600 / --amber-600 / --violet-50 / --violet-100 = 各 1   ← 同行者全部保留

$ grep -c 'aria-label' client/src/components/checker/CheckerWizard.vue      → 0     ← ★ 未用 aria-label
$ grep -rn 'cw-rollback-version' client/src | wc -l                          → 2     ← ★ label[for] + id 恰配对
    CheckerWizard.vue:82: <label for="cw-rollback-version" class="visually-hidden">历史版本</label>
    CheckerWizard.vue:84: <a-select id="cw-rollback-version" …>
$ grep -c 'visually-hidden' client/src/components/checker/CheckerWizard.vue  → 1
$ MENU_TITLES 条目数（Layout.vue:159-163）                                    → 7     ← 6+1
```

> ⚠️ **口径陷阱提示（本轮实测踩到）**：`grep -c -- '--btn-default-bg'` 返回 **2**，因为它是 `--btn-default-bg-hover` 的**子串**。**必须**用带词边界的 `grep -cE -- '(^|[^-\w$])TOKEN[[:space:]]*:'`，否则会把 1 误报为 2。

---

## 5 V4 —— 两处出入的**最终裁定**

### 5.1 出入一：`SOURCE_EXTS` 是 37 还是 43 项？

**最终事实：37 项。B 正确，A §5.1/§6.6 的「43 项」是误计。**

**命令与数字**（自研，注释剥离后数引号项；**冻结树与活树同源**）：

```
$ node -e "…剥离 // 注释后统计 Set 字面量内的 '…' 字面量…"
冻结树 8fb2c1d  ruleExecutor.js:55-62  TOTAL QUOTED ENTRIES = 37
活树  round 2   ruleExecutor.js:60-67  TOTAL QUOTED ENTRIES = 37
```

37 项逐字清单：`js mjs cjs jsx ts tsx vue svelte html css scss sass less | java py go c cpp h hpp cc cxx cs rb php rs kt swift | sh bash sql json yml yaml xml toml ini`（前端 13 + 后端 15 + 脚本/数据/配置 9 = **37**）。

**误计溯源（可复现的推测）**：A 在同一份报告里同时写了「**:55-62**（8 行）」与「**43 项**」。`62 − 55 + 1 = 8` 是**行数**，「43」与任何可数对象都对不上（37 = 实际项数；8 = 行数；3 = 注释行数）。**B §3.4 的实测与本次独立复算一致，A 为误计。**

### 5.2 出入二：`collectFiles` 的真实行号区间？

**最终事实：冻结树 `172-198`（JSDoc 172-175 + 函数体 176-198，共 27 行）。B 的「171-198」与 A 的「176-197」都不精确。**

```
冻结树 8fb2c1d:
  collectFiles: JSDoc+function = 172-198   (fn body 176-198)   lines=27
  JSDoc 首行: " * 递归收集目录下全部普通文件（跳过隐藏项与 SKIP_DIRS）。"
  fn 首行   : "function collectFiles(dir) {"
  fn 末行   : "}"
活树 round 2（文件净 −46 行后整体位移）:
  collectFiles: JSDoc+function = 177-203   (fn body 181-203)   lines=27
```

- **B 的「171-198」高 1 行**（应为 172）—— **函数体区间 176-198 完全正确**。
- **A 的「176-197」** = 函数体但**掐头去尾各 1 行**（漏 JSDoc 起始 `/**` 与闭合 `}`）。

### 5.3 这两处只是文档口径差异，还是影响行为？

**裁定：对 round 2 的运行时行为「零影响」，但「不是纯文档差异」—— 若被后续轮次照抄，两处都会致错，且严重度不同。**

| 出入 | 若被照抄的后果 | 严重度 |
|---|---|---|
| **37 vs 43** | 仅**验收断言**层面：若 C 按 A 文案断言「43 项」，会得到一个**永远无法满足**的判据 → **假失败**。不改变任何代码路径（搬移是"逐字复刻"，不是按计数复制） | **中**（致假失败，不致坏树） |
| **172-198 vs 176-197** | **代码切分**层面：按 A 的区间切片会得到一个**缺 JSDoc 起始符、缺闭合括号**的片段 → 直接产出**语法坏树** | **高**（致坏树） |

**无影响的原因（本轮实证）**：B 的搬移脚本 `/tmp/b2-move.mjs` 内建**逐字锚点断言**（`:55`/`:62`/`:176`/`:198`/`:948`/`:986`）并按**实测区间**切片，**未采信 A 的计数与区间**；搬移产物已由 V1（1011/0）+ V7/V8（像素与几何全等）**双层背书**。

**处置建议**：把「行号/计数一律以**冻结树实测**为准，报告间的转述数字不得直接进入执行断言」写入 round 3 的 Agent 输入约束；A 报告 §5.1/§6.6 的「43 项」与 §5.1 的「176-197」应在 round 3 增量审查中更正。

---

## 6 V5 —— 改动面（只读核对）

```
$ git diff --name-only
client/src/components/checker/CheckerWizard.vue      ← 执行项 2
client/src/styles/tokens.css                          ← 执行项 3
client/src/views/teacher/Layout.vue                   ← 执行项 1
pipeline-status.md                                    ← Captain 的状态文件（非 B 所改）
server/src/services/factExtractor.js                  ← 执行项 4
server/src/services/factExtractors/common.js          ← 执行项 4
server/src/services/ruleExecutor.js                   ← 执行项 4

$ git diff --name-status --diff-filter=A | wc -l
0                                                     ← ★ 零新增被跟踪文件

$ git diff --numstat
2	1	client/src/components/checker/CheckerWizard.vue
4	5	client/src/styles/tokens.css
1	0	client/src/views/teacher/Layout.vue
11	10	pipeline-status.md
1	2	server/src/services/factExtractor.js
100	0	server/src/services/factExtractors/common.js
5	50	server/src/services/ruleExecutor.js
```

**恰好 6 个源文件**（+1 个 Captain 状态文件）；三份 `numstat` 与 B 报告 §2.4 **逐字一致**（`2/1`、`4/5`、`1/0`、`1/2`、`100/0`、`5/50`）。

### 6.1 「未触碰」的旁证（陷阱 8：不靠 `git status`）

`tests/` 与 `client/dist` **不在 git 跟踪内**（`git ls-files tests` = **0**），`git status` 对其**无证据力** → 改用 **mtime 对照**（B 的改动窗口 = **00:08:27 ~ 00:08:44**）：

```
client/dist                    2026-10-10 21:55:33     ← 远早于改动窗口 → 未重建
tests                          2026-10-10 20:13:40     ← 远早于改动窗口 → 未触碰
client/src/styles/antd-theme.js  2026-10-10 02:02:40   ← 未触碰
client/src/legacy-patch.css      2026-10-10 02:02:40   ← 未触碰
docs/ui-redesign/03-components.md 2026-10-10 02:02:40  ← 未触碰（设计文档）
```

**`.md` 说明**：`git diff --name-only | grep '\.md$'` 唯一命中 `pipeline-status.md`（`11 insertions / 10 deletions`，内容是 round 1 → round 2 的状态行更新）—— 该文件在**本会话开始前即为 M**（Captain 的状态入口），**不是 B 本轮所改**；B 的 6 文件清单中无任何 `.md`。**满足"不新增被跟踪文件、不改任何 `.md`（尤其 `03-components.md`）"**。

---

## 7 V6/P2 —— 浏览器侧复核（本轮硬要求）

### 7.1 装置搭建（9 分钟内跑通，未触发时间盒止损）

| 环节 | 做法 | 与约束的对应 |
|---|---|---|
| **构建** | `cd client && VITE_API_BASE_URL=/api VITE_WS_URL= npx vite build --outDir /tmp/pipeline-dist-r2 --emptyOutDir` | **仓库外 outDir**；`client/dist` mtime 未变 |
| **后端** | **复用仓库既有装置** `tests/ui-redesign-verify/rig.sh start`（`RIG_PORT=3100`）→ rig-server（`server/` 的私有副本，业务代码逐字节同源，仅静态映射 1 行 RIG-ONLY） | 既有 rig；**未碰 :5173 / :3000** |
| **前端** | C 自建极简静态服务器 + `/api` 反向代理 → `:3101`；V8 的改前构建 → `:3102` | 31xx 段；**不重建 rig 私有 dist、不写 `tests/`** |
| **鉴权** | 走**真实登录**：`POST /api/auth/login`（`test_teacher`）→ 200 + token，注入 `localStorage` | 真实链路，非假绿 |
| **axe** | `axe-core@4.10.2`（离线安装到 `/tmp/c-r2-tools`，**未写入仓库**），`axe.run(include, {runOnly:{type:'rule',values:[…]}})` | 与 QA 既有口径一致 |

**版本锚点（陷阱 5）**：`served 产物 == /tmp/pipeline-dist-r2 == 活树源码构建`；由三个旁证锁定：① 构建日志 `EXIT=0`；② 产物 CSS `index-BH2_SreE.css` 中 `--green-500`/`--amber-500`/`--violet-500`/`--border-inverse` = **0**（旧产物 `index-CHwIlsxa.css` 均为 1）→ **served 的确实是改动后的产物**；③ 同源第二次独立构建与 `/tmp/pipeline-dist-r2` **byte-identical**（`diff -rq` 0 行差异）。

### 7.2 V7 断言①（heading 修复）

```
{"step":"A1-page-has-heading-one",
 "url":"http://127.0.0.1:3101/exam/teacher/rule-quality",
 "title":"Deadpan 判题",
 "h1":[{"text":"规则质量","cls":"visually-hidden","visible":true}],
 "violations":[]}
```

- **`page-has-heading-one` = 0**（`violations: []`）✅
- **h1 文本 = 「规则质量」**（4 字，与侧栏菜单名一致）✅
- **改前基线反证**（同一装置、同一页面、round 1 构建 :3102）：`axeH1 = [{"id":"page-has-heading-one","nodes":1}]`、`h1 = []` → **1 → 0 的因果链闭合** ✅
- 全页扫描（全规则，仅作上下文、不作判据）：唯一违规 `color-contrast / serious / 3 nodes` —— 即 A §5.2 裁定的 **M-1b `.ant-statistic-title` 既有违规**（已知、超出 QA 12 页基线、本轮明令不改）。**本轮未引入任何新违规。**

### 7.3 V7 断言②（label 修复 + **B 自陈的最大未验证项**）

到达第 4 步的方式：`/exam/teacher/questions/999001/edit-project`（`:220 isEdit = !!route.params.id` —— 实测 `new/project` 下 `v-if="isTeacher && isEdit"` 为假，按钮不渲染）→ 对 `/teacher/questions/*/checker` 注入 `status:'ready'` + 2 个版本（`:304 versions.value = meta.versions`）→ 打开「自动评分器」→ `step=4`（`.ant-steps-item-process` 落在第 3 项，与 `:185` `status==='ready' → 4` 一致）。

**`label[for]` 的解析落点（实测 DOM，直接回答"是否落到外层 div"）：**

```
"labelExists": true,
"labelText":  "历史版本",
"labelClass": "visually-hidden",
"labelFor":   "cw-rollback-version",
"elementWithThatId": {"tag":"INPUT","role":"combobox",
                      "cls":"ant-select-selection-search-input","id":"cw-rollback-version"},
"resolvedTarget":    {"tag":"INPUT","role":"combobox",
                      "cls":"ant-select-selection-search-input",
                      "isInsideAntSelectDiv": false,        ← ★ 不是外层 .ant-select div
                      "labelsProp": ["历史版本"]}            ← ★ HTMLInputElement.labels 反向解析成功
```

渲染出的真实 DOM（片段）：

```html
<div class="cw-version-row">
  <label for="cw-rollback-version" class="visually-hidden">历史版本</label>
  <span class="cw-vlabel">历史版本：</span>
  <div class="ant-select ant-select-sm …">
    <div class="ant-select-selector">
      <span class="ant-select-selection-search">
        <input type="search" class="ant-select-selection-search-input" id="cw-rollback-version"
               role="combobox" aria-haspopup="listbox" aria-owns="cw-rollback-version_list"
               aria-controls="cw-rollback-version_list" aria-expanded="false" …>
```

**axe 结果（两条规则、两个作用域）：**

| 作用域 | `label` | `select-name` |
|---|---|---|
| `.ant-modal`（改后 r2） | **0** | **0** |
| `.checker-wizard`（改后 r2） | **0** | **0** |
| `.ant-modal`（**改前 r1 基线**） | **1** | 0 |

→ **`label` 1 → 0**，且`id` **确实落在 `role=combobox` 的 `<input>` 上**（B 报告 R2 的"最大未验证项"**已由浏览器实证闭环，风险 R2 关闭**）。

**行为不变反证（A §6.2 验证方法③）：**

```
{"t":"回 滚","d":true}          ← 改后：rollbackTarget=null → :disabled="!rollbackTarget" 生效
改前 r1 同装置同状态：rollbackDisabled = true
```

→ **回滚按钮的禁用门控行为改前 = 改后 = `disabled=true`** ✅（另：`checkerCanClose` / `a-popconfirm` 结构未动）

### 7.4 V8 断言（像素 sha1 + 几何 —— 改前 vs 改后）

**判据口径（必须先钉死，否则必出假阳性）**：**禁用了 asset 文件名/字节哈希**（`index-B7EtbyWX.css` vs `index-BH2_SreE.css` 必然不同 —— 源码一字节变化 → Vite content hash 必变）。**只以渲染像素 sha1 与 渲染盒几何为准**，改前 = `/tmp/pipeline-dist-r1base`（`git archive 8fb2c1d` 的 client 源码构建），改后 = `/tmp/pipeline-dist-r2`，两者同装置、同后端、同注入数据（向导用**同一份 mock**）。

> **对任务书中「4 组」定义的诚实澄清**：任务与 `refactor-round-02.md §6.1` 写作「亮/暗 × 舒适/紧凑 **4 组像素 sha1 全等**」。**该字面表述在工程上不可能成立**：亮与暗的渲染像素必然不同（实测侧栏 sha1 亮 = `3baf68ae…`、暗 = `37bd95c9…`），且 `data-density` 是**各 Layout 硬编码**（`teacher/Layout.vue:2 = "compact"`、`student/Layout.vue:2 = "comfortable"`、`admin/Layout.vue:2 = "compact"`），**不存在全局"舒适/紧凑"开关**；同一路由无法在两种密度下渲染。因此按 `test-round-01.md:57` 的**可执行形态**执行：**对每个（主题）分别做改前/改后的像素与几何全等比对** —— 这才是"视觉零回归"的充要证据。

**结果：6/6 区域像素 sha1 全等、几何全等、axe 1→0。**

| 主题 | 区域 | 改前 r1 sha1 | 改后 r2 sha1 | 判定 |
|---|---|---|---|---|
| light | 侧栏 chassis | `3baf68ae94d6fcaffb8995d1981ff4e0998ee703` | **同值** | ✅ 全等 |
| light | 主内容区 rule-quality | `4cfc24196a3bdf68…` | **同值** | ✅ 全等 |
| light | 向导弹窗 `.ant-modal-content` | `1f8012d10a4829ea…` | **同值** | ✅ 全等 |
| dark | 侧栏 chassis | `37bd95c940cd19cfa992c5904b605edd84eac826` | **同值** | ✅ 全等 |
| dark | 主内容区 rule-quality | `0bf688e4132b49e8…` | **同值** | ✅ 全等 |
| dark | 向导弹窗 `.ant-modal-content` | `6256c01bac73dc86…` | **同值** | ✅ 全等 |

**几何全等（消除"像素巧合"的可能）—— 亮/暗两主题均 `EQUAL` 全数相等**：

```
theme=light                                   r1                    r2
  body      {"x":0,"y":0,"w":1440,"h":900}    ==  {"x":0,"y":0,"w":1440,"h":900}
  sider     {"x":0,"y":0,"w":232,"h":900}     ==  {"x":0,"y":0,"w":232,"h":900}
  main      {"x":232,"y":0,"w":1208,"h":900}  ==  {"x":232,"y":0,"w":1208,"h":900}
  header    {"x":232,"y":0,"w":1208,"h":56}   ==  {"x":232,"y":0,"w":1208,"h":56}
  menu(12 项)                                 ==  （逐项 x/y/w/h 全等）
  docH/docW 900/1440                          ==  900/1440
  wizard .ant-modal-content {"x":280,"y":100,"w":880,"h":523.84}  ==  同值
  wizard .cw-version-row    {"x":304,"y":382.83,"w":832,"h":24}   ==  同值
theme=dark  —— 同上，全部 EQUAL
```

**新增的 2 个 DOM 节点「零视觉/零布局影响」的实测确认**：

```
h1（Layout.vue:87，rule-quality）：  r1 h1=[]   →   r2 h1=["规则质量"]
  axeH1: r1 = [{"id":"page-has-heading-one","nodes":1}]  →  r2 = []
  main/content/sider/header/menu 盒全部不变 ← 新增 h1 未触发任何重排
label（CheckerWizard.vue:82）：      r1 label=false  →  r2 label=true
  渲染盒 = {"x":303,"y":394.33,"w":1,"h":1}  ← 1×1 脱流、不可见
  .cw-version-row 盒 {"x":304,"y":382.83,"w":832,"h":24} 改前=改后  ← flex 行未被撑动
  wizAxe: r1 = [{"id":"label","nodes":1}]  →  r2 = []（label + select-name 双 0）
```

→ **R1（"新渲染 DOM 节点是否产生可见变化"）由像素 + 几何双重证据关闭**；B 报告 §1.1/§1.2 的"零视觉变化由构造证明"**得到像素级独立证实**。

### 7.5 构建确定性（防"假差异"的前提）

```
$ diff -rq /tmp/pipeline-dist-r2 /tmp/pipeline-dist-r2b
（0 行输出）                                    ← ★ 同源两次独立构建 byte-identical
```

→ 像素比对**不受构建抖动污染**：任何观察到的差异都可归因于源码，而非构建非确定性。

---

## 8 缺陷分级

| 级别 | 数量 | 明细 |
|---|---|---|
| **阻断（Blocker）** | **0** | 无。V1 1011/0 全绿；V2 五项门禁全 PASS；V3 集合恒等；V7/V8 双断言闭环 |
| **轻微（Minor）** | **3** | ① **V4-1**：A §5.1/§6.6 的 `SOURCE_EXTS` **43 项**为误计（实测 **37**）—— 若被照抄作验收断言会致**假失败**；② **V4-2**：A §5.1 的 `collectFiles` 区间 `176-197` **掐头去尾**（实测 JSDoc+函数 = `172-198`），照抄切片会产出**语法坏树**；B 的 `171-198` 高 1 行、函数体 `176-198` 正确；③ **口径项**：零引用令牌存在"含/不含注释"两套口径（差 2，逐名可指认 `--input-h`/`--table-row-h`），后续轮次需**固定一套并声明** |
| **优化（Optimization）** | **2** | ① **M-1b `.ant-statistic-title` 对比度**（全页扫描唯一残留：`color-contrast / serious / 3 nodes`）—— 既有、超 QA 12 页基线、属 antd 上游默认，改它=改视觉需设计侧授权；② `grep` 子串陷阱：`--btn-default-bg` 会被 `-hover` 命中而**误报 2 处**，门禁脚本宜统一用词边界正则 |

**无阻断缺陷 → 不回流 Agent B。**

---

## 9 P2 是否完成 + 未做项与残留风险

### 9.1 P2 完成度：**完成（V7 + V8 均已执行并闭环）**

- **V7**：✅ 完成。断言①（`page-has-heading-one` 1→0、h1=「规则质量」）与断言②（`label` 1→0、`label[for]` 解析到 `role=combobox` 的 input、回滚按钮禁用行为不变）**均由浏览器实证**。**未触发"约 20 分钟止损"**（装置在 ~9 分钟内跑通）。
- **V8**：✅ 完成。改前（round 1 源码构建）vs 改后（round 2 源码构建）**6/6 区域像素 sha1 全等 + 全量几何盒全等**，且以"同源两次构建 byte-identical"排除构建抖动。

### 9.2 未做项（显式声明）

| # | 未做项 | 原因 | 补做条件 |
|---|---|---|---|
| 1 | **"亮/暗 × 舒适/紧凑"字面 4 组的像素全等** | 该字面判据**不可执行**：亮/暗像素必然不同；`data-density` 为各 Layout 硬编码（teacher=compact / student=comfortable / admin=compact），**无全局密度开关**，同一路由无法在两种密度渲染（§7.4） | **Captain 需澄清判据语义**。若本意是"每主题各自改前/改后全等"，**本报告已 100% 完成**；若确需"舒适/紧凑"两态，须先由实现侧提供**可切换的密度机制**（属功能变更，非本轮范围） |
| 2 | **像素比对覆盖"全部 7 个 QA 页面"** | 时间盒与任务范围（本轮只要求证明两处 a11y 修复生效 + 无视觉回归）；本轮聚焦**两处改动所在的页面/组件** | round 3 可扩到 QA 12 页集；需先解决页面动态数据归一化 |
| 3 | **`.ant-statistic-title` 对比度（M-1b）** | 改渲染颜色 = 视觉变更，**不在 constraints §2 的 a11y 豁免枚举**（仅 aria/label/heading），本项目无 ui-guard 常驻 | 设计侧/对照截图授权后，由 B 在 `RuleQuality.vue` 的 scoped 样式加 `.ant-statistic-title{color:var(--text-secondary)}`（亮底 6.7:1 达 AA），再由 C 重跑 V8 |
| 4 | **未跑 `tests/ui-redesign-verify` 全量 e2e/视觉规格** | 明令不改 `tests/`；本次用自建最小装置（复用其 rig-server）已足够判定两处断言 | 若需全站视觉基线，属 Captain 触发的"产物基线换基线"流程（A §4.2） |

### 9.3 残留风险

| # | 风险 | 等级 | 处置建议 |
|---|---|---|---|
| **C1** | 本轮像素/几何比对只用**注入 mock**到达向导第 4 步（真实流程需多轮生成+校准，1-3 分钟且依赖 LLM）→ 第 4 步在**真实数据**下的渲染未覆盖 | 低 | 本轮判据是**DOM/样式层**（label 关联、`.cw-version-row` 几何），与 mock 数据无关；若需真实链路证据，round 3 用已生成的题目走一次真流程 |
| **C2** | V8 的"内容区"像素全等建立在两次运行的 rule-quality 数据同构之上 | 低 | 已用**侧栏 chassis（零数据依赖）**与**几何盒（逐项数值）**作交叉证据，二者独立于数据内容 |
| **C3** | 自建静态服务器（`:3101/:3102`）与 `/api` 代理为**本轮临时装置**，未固化 | 低 | 建议 round 3 前把它固化为 `scripts/gates/` 的"像素 sha1 + axe"入口（对应必改清单 **G-4**，目前仍缺） |
| **C4** | 零引用令牌口径若不固定，后续轮次会出现 ±2 的摆动 | 低 | **固定采用严格口径（不含注释）**并写入 constraints §3；同时把 A 组"43 项"与"176-197"两处更正登记到 round 3 输入 |
| **C5** | `defectPrecheck.js` 仍有**第三份独立** `resolveProjectRoot`（B 报告 R4）—— 本轮归零的 SCC 不覆盖它 | 低 | 沿用 B 建议：round 3+ 若统一，须做与 §3.3 同规格的**行为对拍**（三份实现的清单/宽探测语义可能已漂移） |

---

## 10 本轮结论

> ### ✅ **PASS** —— 无需回流 Agent B

| 维度 | 结论 |
|---|---|
| **后端全量回归** | **4 处 `Test Suites:` / 67 套件 / 1011 passed / 0 failed**；段1=912、段2=17、段3=61、段4=21 全部命中；`fact-extractor` 的 `resolveProjectRoot — 与 ruleExecutor 同语义` **describe 真的在跑** → 再导出面完好，**无阻断** |
| **五项门禁** | `cycle-check` **71/163/SCC 0**（1→0，全仓最后一个 SCC 消失）· `check-layers` **71/0/47** · `arch-metrics` **0/47/10(+19)** · `hard-metrics` **0/0/0** · 文件数 **146**（零新增）—— **全部达标** |
| **零引用令牌** | **64 → 61**（严格口径，不含注释；宽松口径 62→59），集合级恒等 `AFTER == (BEFORE − 4) ∪ {--btn-default-bg}` = **true**；4 个被删令牌实现侧**零引用、无新增消费方** |
| **两处出入** | `SOURCE_EXTS` = **37 项**（**A 的 43 为误计**）；`collectFiles` = **172-198**（JSDoc+函数；A 的 176-197 掐头去尾，B 的 171-198 高 1 行）—— **对运行时零影响**（已由 1011/0 + 像素全等背书），但属**可致坏的转述错误**，须在 round 3 更正 |
| **改动面** | **恰好 6 个源文件**、0 新增被跟踪文件、`.md` 未被 B 改动、`client/dist`/`tests/` mtime 未变 |
| **浏览器侧（硬要求）** | **V7 完成**：`page-has-heading-one` **1→0** + h1=「规则质量」；`label` **1→0** + `label[for]` **解析到 `role=combobox` 的 `<input>`**（不是外层 `.ant-select` div）+ 回滚按钮禁用行为不变。**V8 完成**：改前/改后 **6/6 区域像素 sha1 全等 + 几何盒全等**，构建确定性 byte-identical |
| **阻断缺陷** | **0** |

**PASS → 建议 Captain：① 归档并提交 round 2（6 文件）；② 把 V4 两处数字更正 + "零引用令牌固定严格口径" 写入 round 3 输入约束；③ 转 Agent A 做 round 3 增量复审。**
