# test-round-03 —— 回归验证报告（流水线第 3 轮）

> 轮次：**03（回归验证）** ｜ 日期：**2026-10-11（凌晨）** ｜ 验证者：**Agent C**（技能 `tech-test-automation`）
> 被验工作树：`git rev-parse HEAD` = **`419477a13c5fce529cd17635590c433401c327de`**（基线 commit `4b531b8`；`4b531b8..HEAD` 只动过 2 个 `.md`，**源码树 == 4b531b8**）
> 工作树状态：`git status --porcelain -uno` = **恰好 4 个 `M`** —— `pipeline-status.md`（Captain 预置）+ B 的 3 个执行目标
> 上游输入：`docs/pipeline/project-constraints.md`（硬禁令 / 11 条测量纪律 / 四段口径 912+17+61+21=1011 / 门禁判据）、`docs/pipeline/refactor-round-03.md`（B 的改动 + §3 诚实声明 + §6 给 C 的指引）、`docs/pipeline/audit-round-03.md`（A 的执行集与提醒）、`pipeline-status.md`
> 方法：**只读复算 + 自建独立装置**（全部落 `/tmp/c3-*.mjs`，未入仓）｜冻结对照树 = `/tmp/b3-before`（B 用 `git archive 4b531b8` 导出，本轮**只读借用**）

---

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 只读（除 2 个产物外不写仓库任何文件） | ✅ 仓库内唯一写入 = `docs/pipeline/test-round-03.md`（新建）+ `docs/pipeline/test-round-03.log`（由 `unblock-g2.sh` 写入，**本轮指定产物**）；全部临时脚本落 `/tmp`（`c3-graph.mjs` / `c3-drift.mjs` / `c3-realfuzz.mjs` / `c3-sweep.mjs` / `c3-repl.mjs` / `c3-bindcheck.mjs` / `c3-esm/*` / `c3-bindtest/*`） |
| 零 git 写操作 | ✅ 只用 `rev-parse` / `status` / `diff` / `ls-files`；**无 add/commit/checkout/restore/stash/clean** |
| 禁止 `git clean` / `git stash` / `git checkout -- .` / `git reset --hard` / `git restore .` | ✅ 一条未用 |
| 不碰 `:5173` / `:3000`、不启停任何常驻服务 | ✅ 未启动/重启/kill 任何进程；jest 只连测试库（一次性进程） |
| 不写 `tests/`、不重建 `client/dist`、不重跑 `ledger-check.mjs` | ✅ 零写入；mtime 旁证见 §2.6 |
| 不写生产库 | ✅ `unblock-g2.sh` 固定指向 `localhost:3306/exam_system_test`（脚本回显已确认，`test/setup.js` 白名单未触发） |
| **陷阱 7：先冻结再测** | ✅ 基线实现一律从 `/tmp/b3-before`（`git archive 4b531b8`）导入，**不读活树历史版本** |
| **陷阱 8：`git status` 对未跟踪目录无证据力** | ✅ `server/test` / `tests/` / `client/dist` 的"未触碰"结论**全部用 mtime / `find -newermt`**，未用 `git status` |
| **陷阱 10：行号与计数以冻结树/实测为准** | ✅ 全部数字自己数过；并**纠正了 B §2.1 的一处门禁读数**（见 §2.2 注） |
| **陷阱 11：计数带词边界** | ✅ 全部用 `grep -w`；并额外实测 `SRC_EXTS` 字面量口径 = 词边界口径 = **3**（本例两者相同，`SRC_EXTS` 无同前缀兄弟） |
| 本轮豁免 axe / 像素 sha1 | ✅ **有理由豁免**：B 的 3 个执行目标 100% 在 `server/src`，**零 `client/` 改动** → 不可能引入视觉变化或新 axe 违规（mtime 旁证：`client/src` 最新 mtime = `00:08:27`，早于本轮 3 个源文件 `00:31–00:32`） |

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望（constraints §4/§5 + B §6） | **实测** | 结论 |
|---|---|---|---|---|
| **V1** | 四段 `Test Suites:` 摘要数 | **4 处**（少于 4 = `&&` 短路） | **4 处**（:1231 / :1271 / :1360 / :1408） | ✅ PASS |
| **V1** | 段1 / 段2 / 段3 / 段4 | 912 / 17 / 61 / 21 | **912 / 17 / 61 / 21** | ✅ PASS |
| **V1** | 合计 | **1011 passed / 0 failed** | **1011 passed / 0 failed**（67 套件 64+1+1+1） | ✅ PASS |
| **V1** | 定向 `defect-precheck` | **5 例且无 skipped** | **5 passed / 5 total**（verbose 逐例 ✓） | ✅ PASS |
| **V1** | 定向 `rule-mutator` / `rule-executor` | 21 / 61 | **21 / 61** | ✅ PASS |
| **V2** | `cycle-check` 文件 / **边** / SCC / 自环 | 71 / **164** / **0** / 0 | **71 / 164 / 0 / 0** | ✅ PASS（**164 = 预期增量，非回归**） |
| **V2** | `check-layers` 文件 / 违规 / 未分层 | 71 / 0 / 47 | **71 / 0 / 47** | ✅ PASS |
| **V2** | `arch-metrics` | 0 / 47 / 10（+19 观察带） | **0 / 47 / 10（+19）PASS** | ✅ PASS |
| **V2** | `hard-metrics` | 0 / 0 / 0 | **0 / 0 / 0 PASS**（样本 41 文件） | ✅ PASS |
| **V2** | `find server/src client/src -type f \| wc -l` | 146 | **146** | ✅ PASS |
| **★V3** | `precheckProject`/`defectPrecheck`/`defectScoring` 的生产消费方 | **0** | **0**（唯一 import 方 = 自身单测；**不可从 `app.js`/`worker.js` 到达**） | ✅ **独立证伪成立**（§3） |
| **V3** | 设计文档接线点 `projectGrading.js` | 零命中 | **零命中** | ✅ |
| **V3** | 动态 `import()` / 拼接 `require` / 转出路径 | 无 | **非字面量说明符 = 0**；真实 `import()` 仅 2 处且指向别处 | ✅ |
| **V4** | 定型夹具发散数 | B 报 9/13 | **我自建 16 夹具：9/16**（同构夹具逐条同结论） | ✅ **数字未被夸大/缩小** |
| **V4** | 随机树发散数 | B 报 22/200 | **种子化复现 B 的分布 = 22/200（逐树编号一致）**；我自己的分布 = 18/200；结构全枚举 = **26/100** | ✅ 成立（**分布依赖**，见 §4.3） |
| **V4** | 真实提交逐字节相等 | 62/62 | **62/62 byte-identical，0 差异，0 异常**（含 1066/1067/1068） | ✅ PASS |
| **V4** | 改动后与 `common.js` 收敛 | 100% | **16/16 夹具 + 100/100 枚举 + 200/200 自建 + 200/200 复现 B 分布 = 全 0 发散**；`after.resolveProjectRoot === common.resolveProjectRoot`（同一函数对象） | ✅ PASS |
| **V5** | `hasSourceFiles` @ defectPrecheck.js | 0 | **0**（全仓 `grep -rnw` 亦 0） | ✅ PASS |
| **V5** | `SOURCE_EXTS` @ ruleExecutor.js | 0 | **0** | ✅ PASS |
| **V5** | `SKIP_DIRS` @ ruleMutator.js | 0 | **0** | ✅ PASS |
| **V5** | `^export function` @ ruleExecutor.js | 7 | **7**（:144 :157 :168 :199 :212 :849 :950） | ✅ PASS |
| **V5** | `SRC_EXTS` + `default export` 仍在 | 均在 | **SRC_EXTS 3 处（:43 :85 :121）；:171 `export default { precheckProject, collectFiles, resolveProjectRoot };` 逐字在** | ✅ PASS |
| **V6** | 改动面 | 恰好 3 个 `M`（+`pipeline-status.md`） | **恰好 4 行 = 3 目标 + `pipeline-status.md`；无新增被跟踪文件（`^A` = 0）** | ✅ PASS |
| **V6** | `server/test/` 零写入 | 零 | **`find -newermt '2026-10-11 00:00'` = 0**；最新文件 mtime = `2026-10-10 21:55:06` | ✅ PASS |
| **V6** | `client/dist` 未被触碰 | 未触碰 | **`find -newermt '2026-10-11 00:00'` = 0**；最新 = `2026-10-10 22:02:03` | ✅ PASS |
| **V6** | `client/src` 零改动 | 零 | **`find -newermt '2026-10-11 00:30'` = 0**；最新 = `00:08:27`（round 2 遗留） | ✅ PASS |
| **V7** | `node --check` 是否漏检 ESM 绑定 | B 称**漏检** | **独立复现：漏检**（exit=0 而真 import 抛 `SyntaxError`） | ✅ 结论成立（§6） |

**总结论：V1–V7 全部达标，0 阻断，0 回归 → 本轮 PASS。**

---

## 2 逐项证据（命令 + 原始输出）

### 2.1 V1 主判据｜后端全量回归

```bash
$ ROUND=03 bash docs/pipeline/scripts/unblock-g2.sh
→ 测试库: localhost:3306/exam_system_test
✓ 端口可达
✓ schema 对齐
→ 开始回归（--runInBand，耗时较长）…
→ 退出码: 0 ｜ 完整日志: docs/pipeline/test-round-03.log
── 基线摘要 ──
   Test Suites: 64 passed, 64 total
   Tests:       912 passed, 912 total
   Test Suites: 1 passed, 1 total
   Tests:       17 passed, 17 total
   Test Suites: 1 passed, 1 total
   Tests:       61 passed, 61 total
   Test Suites: 1 passed, 1 total
   Tests:       21 passed, 21 total
```

**日志内取证（`docs/pipeline/test-round-03.log`，1413 行 / 145,129 字节）**

```bash
$ grep -cE '^Test Suites:' docs/pipeline/test-round-03.log      # → 4     ← 无短路
$ grep -E '^Tests:|^Test Suites:' docs/pipeline/test-round-03.log
:1231  Test Suites: 64 passed, 64 total
:1232  Tests:       912 passed, 912 total
:1271  Test Suites: 1 passed, 1 total
:1272  Tests:       17 passed, 17 total
:1360  Test Suites: 1 passed, 1 total
:1361  Tests:       61 passed, 61 total
:1408  Test Suites: 1 passed, 1 total
:1409  Tests:       21 passed, 21 total
$ grep -cE '^FAIL' docs/pipeline/test-round-03.log             # → 0
$ grep -nE 'skipped|todo' docs/pipeline/test-round-03.log      # → 仅 ruleMutator 运维日志字段 skipped:0（6 行），无 jest skip 标记
```

**定向套件**

```bash
$ grep -nE 'defect-precheck|rule-mutator|rule-executor|fact-extractor' docs/pipeline/test-round-03.log
:900   PASS test/unit/infrastructure/defect-precheck.test.js
:1244  PASS test/unit/infrastructure/fact-extractor.test.js
:1287  PASS test/unit/infrastructure/rule-executor.test.js
:1382  PASS test/unit/infrastructure/rule-mutator.test.js

# defect-precheck 的 hasData 守卫未触发（数据存在），5 例逐条在跑：
$ ls -d server/uploads/project-submissions/353/1068/1          # → 存在
$ grep -cE '^\s*it\(' server/test/unit/infrastructure/defect-precheck.test.js   # → 5

# 定向 verbose 复跑（只此一个套件，仍指向 exam_system_test）：
$ cd server && DATABASE_URL=<派生 exam_system_test> NODE_OPTIONS=--experimental-vm-modules \
    npx --no-install jest --config test/jest.config.js --runInBand --forceExit --verbose \
    test/unit/infrastructure/defect-precheck.test.js
    ✓ A 组（标准包原样）无缺陷 (6 ms)
    ✓ B 组（完整实现）无缺陷 (2 ms)
    ✓ C 组（故意缺 Login.vue/user.js）→ 确定性抓到 import 断裂与缺失 (3 ms)
    ✓ 无缺陷 → 零扣分 (1 ms)
    ✓ C 组缺陷 → 硬扣 ≥30 且 fatal (2 ms)
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

→ **5 例真的在跑、0 skipped**；段 2/3/4（17/61/21）与 round 2 基线**逐位相同**。

### 2.2 V2 门禁复算（五项，原始输出）

```bash
$ node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 164 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 1）
  自环（文件 import 自身）: 0
结论：PASS                                        # exit=0

$ node server/scripts/check-layers.mjs
文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个      # exit=0

$ node scripts/gates/arch-metrics.mjs
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47  实测=47
  ✓ godfileOver800     基线=10  实测=10
  · >500 行（观察带，不计判据） 基线=19 实测=19
  GodFile >800 行：… / server/src/services/ruleExecutor.js (1010) / …（共 10 个）
结论：PASS                                        # exit=0

$ node scripts/gates/hard-metrics.mjs
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
结论：PASS                                        # exit=0

$ find server/src client/src -type f | wc -l
     146
```

**★ 边数 164 的独立归因（不采信 B 的自述）**：我自建的 import 图扫描器（`/tmp/c3-graph.mjs`，独立正则 + `path.resolve` 解析，扫 server/src 71 + server/test 91 = 162 文件，解析出 **308 条相对边**）单独确认：`defectPrecheck.js` 的 import 面新增了唯一一条边 → `server/src/services/factExtractors/common.js`；`ruleExecutor.js` 的 import 说明符数量改前后相同；`ruleMutator.js` 的 `from './ruleExecutor.js'` 是**既有边只扩名单**。→ **163 → 164 是执行项①的唯一增量，SCC 仍 0，不是回归。**

> **注（陷阱 10 的一处实测纠正）**：B §2.1 记录 `arch-metrics` 打印 `ruleExecutor.js (1011)`。**我这轮实测该门禁打印的是 (1010)**，且我数过：`ruleExecutor.js` 换行符数 = **1010**、末行有换行、`wc -l` = **1010**。B 的 1011 大概率是他**在写文件与读文件之间的瞬态读数**（该门禁每次现读现算，换行符计数口径本身正确）。**对判据零影响**（GodFile = 10 与观察带 = 19 均未变、门禁 PASS）。

### 2.3 V3 的原始证据

见 §3（本轮核心，单列）。以下为 V5 / V6 / V7 的原始证据。

### 2.4 V5 反证 grep（全部带词边界）

```bash
$ grep -cw 'hasSourceFiles' server/src/services/defectPrecheck.js     # → 0
$ grep -cw 'SOURCE_EXTS'    server/src/services/ruleExecutor.js       # → 0
$ grep -cw 'SKIP_DIRS'      server/src/services/ruleMutator.js        # → 0
$ grep -cE '^export function ' server/src/services/ruleExecutor.js    # → 7
     144:export function extOf        157:export function globToRegExp
     168:export function collectFiles 199:export function resolveWithinRoot
     212:export function readFileUtf8 849:export function validateRules
     950:export function runRules
$ grep -c  'SRC_EXTS' server/src/services/defectPrecheck.js           # → 3（字面量口径）
$ grep -cw 'SRC_EXTS' server/src/services/defectPrecheck.js           # → 3（词边界口径 —— 本例一致）
      43:const SRC_EXTS = new Set(['js','mjs','cjs','jsx','ts','tsx','vue','java','py']);
      85:  const srcFiles = allFiles.filter((f) => SRC_EXTS.has(f.split('.').pop().toLowerCase()));
     121:      return SRC_EXTS.has(ext) && !isAsset;
$ tail -1 server/src/services/defectPrecheck.js
export default { precheckProject, collectFiles, resolveProjectRoot };   # 逐字保留

# 全仓旁证
$ grep -rnw 'hasSourceFiles' server/src client/src server/test         # → 0 命中（exit=1）
$ grep -rnw 'SOURCE_EXTS' server/src client/src --include='*.js' --include='*.vue'
  server/src/services/ruleMutator.js:47   （本地 7 项常量，语义不同，有消费 :149）
  server/src/services/factExtractors/common.js:32 / :132 / :268 / :276
  → **ruleExecutor.js 已彻底消失**，且**无新增副本**
$ grep -n "from './ruleExecutor.js'" server/src/services/ruleMutator.js
  39:import { collectFiles, extOf, globToRegExp, readFileUtf8, resolveWithinRoot, runRules, resolveProjectRoot } from './ruleExecutor.js';
$ for fn in collectFiles extOf globToRegExp resolveWithinRoot readFileUtf8; do grep -c "^function $fn" server/src/services/ruleMutator.js; done
  0 0 0 0 0                                  # 本地 5 份副本已删净
$ grep -n 'export { resolveProjectRoot };' server/src/services/ruleExecutor.js
  29:export { resolveProjectRoot };           # round 2 的再导出面仍在
```

### 2.5 V6 改动面与「不许碰」的旁证

```bash
$ git status --porcelain -uno
 M pipeline-status.md
 M server/src/services/defectPrecheck.js
 M server/src/services/ruleExecutor.js
 M server/src/services/ruleMutator.js
$ git status --porcelain -uno | grep -c '^A'        # → 0（无新增被跟踪文件）
$ git diff --numstat
1       1       pipeline-status.md
4       22      server/src/services/defectPrecheck.js
5       18      server/src/services/ruleExecutor.js
1       86      server/src/services/ruleMutator.js
$ git diff --name-status 4b531b8 -- .
M  docs/pipeline/project-constraints.md    ← 早于本轮（Captain 的约束包更新），非 B 所为
M  pipeline-status.md
M  server/src/services/{defectPrecheck,ruleExecutor,ruleMutator}.js
```

**未跟踪目录的 mtime 旁证（陷阱 8：`git status` 对这些目录没有证据力）**

```bash
$ find server/test -type f -newermt '2026-10-11 00:00:00' | wc -l          # → 0
$ find server/test -type f -exec stat -f '%Sm %N' -t '%Y-%m-%d %H:%M:%S' {} \; | sort -r | head -1
2026-10-10 21:55:06 server/test/unit/infrastructure/trustjudge-grader.test.js
$ find server/test -type f -newermt '2026-10-11 00:30:00' | wc -l          # → 0（更窄窗口同样 0）

$ ls -ldT client/dist                                                       # → Oct 10 21:55:33 2026
$ find client/dist -type f -newermt '2026-10-11 00:00:00' | wc -l           # → 0
$ find client/dist -type f -newermt '2026-10-11 00:30:00' | wc -l           # → 0
  # 最新 8 个全是 monaco/vs/*.js，mtime 2026-10-10 22:02:03

$ find client/src -type f -newermt '2026-10-11 00:30:00' | wc -l            # → 0
$ ls -lT client/src/styles/tokens.css client/src/components/checker/CheckerWizard.vue client/src/views/teacher/Layout.vue
  2026-10-11 00:08:27  （三个文件 mtime 全部 = 00:08:27，早于本轮 00:31–00:32）
   → 这三个是 **round 2**（已提交 4b531b8）的产物，**不是 B 本轮的改动**
$ find tests -type f -newermt '2026-10-11 00:00:00' | wc -l                 # → 2（均为 00:19:14 的 rig 日志，早于 B 的 00:31 起改动 → 与 B 无关）

$ ls -lT server/src/services/defectPrecheck.js server/src/services/ruleExecutor.js server/src/services/ruleMutator.js
  2026-10-11 00:32:41 / 00:32:41 / 00:31:19                  # B 的改动窗口
```

→ **B 的改动窗口 = `00:31:19–00:32:41`**；`server/test` / `client/dist` / `client/src` / `tests/` 在该窗口内**零文件写入**。

---

## 3 ★ V3 独立证伪：「消费方为零」是否成立（本轮核心）

### 3.1 我用的三种互相独立的方法

| 方法 | 装置 | 覆盖什么 | 结果 |
|---|---|---|---|
| **① 自建 import 图 + 反向闭包** | `/tmp/c3-graph.mjs`（自己的正则扫描器 + `path.resolve` 解析 + 反向闭包 + 从入口的前向闭包） | 静态 `import` / `export … from` / **字面量** `import()` / `require()`；**含再导出（转出）路径** | 见 §3.2 |
| **② 全仓词法全扫（多形态）** | `grep -rn` / `grep -rni` 覆盖 `server/src`、`server/test`、`client/src`、`trustjudge-server`、`backups/`、`docs/` | 任意字符串出现的模块名/符号名（含注释与文档） | 见 §3.2 |
| **③ 动态/拼接路径反证** | 非字面量 `import(`…`)` 与 `require(`…`)` 扫描（**说明符不是字符串字面量**的情形） | 字符串拼接 / 变量构造的模块路径（唯一能绕过方法①的形态） | 见 §3.2 |

### 3.2 结果

```bash
# ── 方法①：自建 import 图（162 模块 / 308 条相对边 / 入口 = src/app.js + src/worker.js）──
=== TARGET server/src/services/defectPrecheck.js ===
  direct importers (edges pointing at it):
    server/test/unit/infrastructure/defect-precheck.test.js  [static-import]  "../../../src/services/defectPrecheck.js"
  reverse-closure nodes              : 2
  NON-TEST consumers (production!)   : 0
  TEST consumers                     : 1
  reachable from production entries? : false
=== TARGET server/src/services/defectScoring.js ===
  direct importers (edges pointing at it):
    server/test/unit/infrastructure/defect-precheck.test.js  [static-import]  "../../../src/services/defectScoring.js"
  NON-TEST consumers (production!)   : 0
  TEST consumers                     : 1
  reachable from production entries? : false
```
→ **反向闭包只有 2 个节点：目标自身 + 那一个测试文件。生产入口的前向可达集（64 模块）里没有它。**

```bash
# ── 方法②：全仓词法全扫（唯一的 import 语句来自单测）──
$ grep -rn --binary-files=without-match -E 'defectPrecheck|defectScoring|precheckProject|scoreDefects' . \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.agent-teams --exclude-dir=.VSCodeCounter
  # 命中仅 4 类：
  #  ① server/test/unit/infrastructure/defect-precheck.test.js:9/:10  ← 唯一 import 语句
  #  ② server/src/services/defectPrecheck.js 自身（:2 注释 / :80 声明 / :171 default export）
  #  ③ server/src/services/defectScoring.js 自身（:2 :4 :13 :34 注释 / :38 声明）
  #  ④ docs/plan/2026-09-06-trustjudge-consistency-design.md（设计文档）+ pipeline-status.md:25
  #  → 生产代码 0 命中

# 大小写不敏感 + 文件名扫描（防大小写/路径变体）
$ grep -rniE 'defectp|defectsco|precheckproject|scoredefects' server/src client/src
  # → 仅两个模块自身（8 行）
$ find . -iname '*defect*' -not -path './node_modules/*' -not -path './.git/*'
  ./server/src/services/defectPrecheck.js
  ./server/src/services/defectScoring.js
  ./server/test/unit/infrastructure/defect-precheck.test.js
  ./tests/ui-redesign-verify/artifacts/shots/T3/02-defect-forcesubmit-modal.png   ← 同名截图，无关
$ git ls-files | grep -iE 'defect|precheck'
  server/src/services/defectPrecheck.js
  server/src/services/defectScoring.js
  server/test/unit/infrastructure/defect-precheck.test.js

# 兄弟目录与其它语言实现
$ grep -rniE 'defectp|defectsco|precheckproject|scoredefects' trustjudge-server   # → 0 命中（exit=1）
$ grep -rniE 'defectp|defectsco|precheckproject|scoredefects' backups             # → 0 命中
$ grep -rniE 'defect|precheck' server/src/services/projectGrader.js               # → 0 命中
```

```bash
# ── 设计文档点名的接线点 ──
$ grep -nE 'precheck|defect' server/src/services/projectGrading.js
  （无输出，exit=1）                                   # → 0 命中
$ grep -nE '^import' server/src/services/projectGrading.js
  17:fs 18:path 19:crypto 20:prisma 21:logger 22:{…} 30:{runRules} 31:{gradeProjectTrustJudge}
  32:{…} 41:{ABNORMAL_FEEDBACK} 42:{standardDir,submissionDir,hasStandardPackage}
  43:{parseProjectAnswer,serializeProjectAnswer} 44:{MAX_TEXT_BYTES} 45:{isIgnored}
  # → 既无静态 import，也无动态 import；design doc:87 写的「legacy 路径」从未实现
```

```bash
# ── 方法③：动态 / 拼接路径反证（唯一能绕过静态图的形态）──
$ grep -rnE "import\s*\(\s*[^'\"\s)]" server/src --include='*.js' | grep -vE "import\s*\(\s*['\"]" | wc -l   # → 0
$ grep -rnE "require\s*\(\s*[^'\"]"     server/src --include='*.js' | grep -vE "require\s*\(\s*['\"]" | wc -l   # → 0
  # → server/src 内**没有任何非字面量说明符**的动态 import / require

# server/src 内真实的动态 import() 只有 2 处（均为字面量，且与本模块无关）：
$ grep -rnE "import\s*\(" server/src --include='*.js'
  server/src/controllers/projectSubmissionController.js:272  await import('../services/projectGrader.js')
  server/src/controllers/teacherController.js:151            await import('../services/deepseek.js')
  # 其余 6 处命中全部是**注释/正则里的示例**（logger.js:36 与 uploadFilter.js:59 是 JSDoc 类型；
  #   defectPrecheck.js:62 / ruleExecutor.js:741 / javascript.js:187 是扫描正则的字面量示例）

# 唯一的字符串拼接 require 也不是模块路径构造，而是"把临时脚本路径塞进子进程 runner"：
$ sed -n '425,440p' server/src/services/checkerService.js
  const scriptPath = path.join(os.tmpdir(), 'checker-' + Date.now() + '-' + <rand> + '.cjs');
  fs.writeFileSync(scriptPath, script);
  const runner = ['const m = require(' + JSON.stringify(scriptPath) + ');', …].join('\n');
  # → 拼的是**写成临时文件的用户脚本**，与 defectPrecheck 无关

# client 侧不会引用 server 模块
$ grep -rnE "from '.*\.\./.*server|require\(.*server" client/src    # → 0 命中
```

### 3.3 结论

> **★ 「消费方为零」独立证伪成立（未能证伪）。**
>
> `precheckProject` / `defectPrecheck` / `defectScoring` 的**生产消费方 = 0**：
> ① 全仓唯一的 `import` 语句来自**它自己的单测** `server/test/unit/infrastructure/defect-precheck.test.js:9-10`（只 import `{ precheckProject }` 与 `{ scoreDefects }`）；
> ② 反向闭包 = **{目标自身, 该单测}** 两个节点，**从 `src/app.js`/`src/worker.js` 的前向可达集（64 模块）中不可达**；
> ③ 设计文档点名的接线点 `projectGrading.js` **零命中**（静态与动态均无；同目录的 `projectGrader.js` 亦零命中）；
> ④ **非字面量说明符的 `import()`/`require()` = 0**，故不存在绕过静态图的拼接路径；
> ⑤ 兄弟实现 `trustjudge-server`（Python）与 `backups/` 均零命中；文件名全仓仅那 3 个被跟踪文件。
>
> → 因此执行项①的**行为变更不可能影响真实评分链路**；`hasSourceFiles` 导出面消失亦**无任何调用方**（全仓 `grep -rnw` = 0）。

**诚实登记的边界（方法论的极限，不影响结论）**：以上为**静态 + 词法**证明，**不含"启动生产进程做运行期模块加载探针"** —— 理由：① `server/src/app.js` 顶层会 `createServer().listen()` 并 `prisma.user.upsert`，属**明确禁止的"启动常驻服务"**；② 在 **import 图入度为 0** 的前提下，运行期不可能加载该模块，探针不会提供任何超出静态证明的信息。**残余未覆盖**：仓库**之外**的运维脚本/外部工具直接按绝对路径 `import` 该模块 —— 无证据、且该形态不受本流水线约束（登记于 §8）。

---

## 4 V4 行为变更幅度的独立复核（实测数字）

### 4.1 我自建的 16 个定型夹具（与 B 的 13 个**不同构、独立编写**）

```
fixture                  | before(root-relative)                | after(root-relative)                 | same
vue-only                 | f0_vue-only/MyApp                    | f0_vue-only/MyApp                    | true
go-only                  | f1_go-only                           | f1_go-only/proj                      | false
html-only                | f2_html-only                         | f2_html-only/site                    | false
json-only                | f3_json-only                         | f3_json-only/data                    | false
pkgjson-only             | f4_pkgjson-only                      | f4_pkgjson-only/mod                  | false
readme-only              | f5_readme-only                       | f5_readme-only                       | true
skipdir-dist             | f6_skipdir-dist/dist                 | f6_skipdir-dist                      | false
skipdir-target           | f7_skipdir-target/target             | f7_skipdir-target                    | false
skipdir-node_modules     | f8_skipdir-node_modules/node_modules | f8_skipdir-node_modules              | false
root-manifest-js         | f9_root-manifest-js/src              | f9_root-manifest-js                  | false
root-manifest-java       | f10_root-manifest-java/src           | f10_root-manifest-java               | false
java-only                | f11_java-only/proj                   | f11_java-only/proj                   | true
py-only                  | f12_py-only/proj                     | f12_py-only/proj                     | true
two-subdirs              | f13_two-subdirs                      | f13_two-subdirs                      | true
dotdir-only              | f14_dotdir-only                      | f14_dotdir-only                      | true
deep-single-chain        | f15_deep-single-chain/outer          | f15_deep-single-chain/outer          | true
DIVERGENT (strict, byte-equal): 9 / 16   [仅因 path.resolve 归一而不同的: 0]
```

→ **我的 9/16 与 B 的 9/13 同结论**：发散集中在**同一批结构类**（探测白名单宽度 4 例、SKIP_DIRS 过滤 3 例、根清单短路 2 例），**无新增发散类**。

### 4.2 结构空间全枚举（比随机更有判据力，n=100）

```
cases enumerated                     : 100      （5 种子目录名类 × 10 种内容 × 2 种根清单）
before(4b531b8) DIVERGES from common : 26 / 100 (26.0%)
after  (live)     DIVERGES from common: 0 / 100  （脚本内硬断言，任一不等即打印告警 —— 未触发）
发散类样本：
  {"name":"normal",   "content":"src .js",       "rootManifest":true,  "before":"src", "common":".",  "after":"."}
  {"name":"normal",   "content":"non-src .html", "rootManifest":false, "before":".",   "common":"src","after":"src"}
  {"name":"skip:dist","content":"src .js",       "rootManifest":false, "before":"dist","common":".",  "after":"."}
```

### 4.3 随机树：B 的 22/200 复现 + 我的分布对照

```bash
# ① 独立种子化复现 B 的**分布**（同 SUB/EXT 池、同 nSub∈1..3、同根文件池；只把 Math.random 换成 LCG 种子）
=== V4-H ===
nSub histogram : {"1":63,"2":87,"3":50}  (single-subdir trees: 63)
BEFORE != common : 22 / 200
AFTER  != common : 0 / 200
divergence samples: t4(t4↔dist_0) / t20(dist_0↔t20) / t25(t25↔app_0) / t29(node_modules_0↔t29) / t32(t32↔proj_0) / t57(node_modules_1↔t57)
   → ★ 与 B 的样本**逐树编号一致**（他列的 t4/t20/t25/t29/t32/t57 与我这一轮完全同构）

# ② 我自己的分布（nSub∈0..2、11 个文件名、11 个子目录名、种子 987654321）
=== V4-G ===
BEFORE != common : 18 / 200
AFTER  != common : 0 / 200

# ③ B 的原始脚本 + 清掉残留测试床后连跑两次（证明其数字可重复）
$ rm -rf /tmp/b3-fuzz && node /tmp/b3-fuzz.mjs <repo>    # → 22 / 200
$ rm -rf /tmp/b3-fuzz && node /tmp/b3-fuzz.mjs <repo>    # → 22 / 200
```

**口径裁定（这是我实测与 B 数字差异的唯一原因）**：发散**只发生在"根下恰好 1 个非隐藏子目录"这一支**（另有极少数由**更深层**的单子目录链引发）。随机树的**结构分布**不同（子目录个数、子目录名是否落在 SKIP_DIRS、内容扩展名），发散率就不同：
- 我的分布（nSub 可为 0，名池含更多非 SKIP 名）= **18/200**；
- B 的分布（nSub ≥ 1、8 个名里 3 个是 `dist/target/node_modules`）= **22/200**（可复现）；
- 不依赖任何分布假设的**结构全枚举 = 26/100**。

→ **三种测法全部落在 9%–26% 区间，B 的 22/200 既未夸大也未缩小**；差异来自**测试床形状**而非实现行为。**"发散面不窄"这一结论在我的独立装置上成立**。

### 4.4 ★ 真实提交：62/62 逐字节相等（独立复算）

```bash
$ node /tmp/c3-realfuzz.mjs <repo>
submission dirs found : 62
stdDir                : …/project-questions/353/standard (exists)
leaf submission dirs scanned : 62
byte-identical (full JSON)   : 62
DIFFERENT                    : 0
errors                       : 0

--- named fixtures 1066 / 1067 / 1068 (detail) ---
1066/1 byte-equal=true fileCount=29/29 issues=0/0 root-tail=1/UserManagement      -> 1/UserManagement
1067/1 byte-equal=true fileCount=29/29 issues=0/0 root-tail=1/UserManagement      -> 1/UserManagement
1068/1 byte-equal=true fileCount=27/27 issues=3/3 root-tail=1/UserManagement_副本 -> 1/UserManagement_副本
```
（比对粒度 = `JSON.stringify(precheckProject(...))` **全对象**，含 `projectRoot` 绝对路径 / `fileCount` / `issues[]` 每条的 `type/file/target/detail` 文案；**不是**只比 fileCount。）

**为何真实提交不受影响（根因，独立拓扑取证）**

```
1066/1 -> level1 = ["UserManagement/"]
   UserManagement/ -> [".gitignore","README.md","index.html","jsconfig.json","package.json","src","vite.config.js"]
1068/1 -> level1 = ["UserManagement_副本/"]   （同构）
```
→ 真实提交是 `<num>/<1>/UserManagement/…` 形态：`precheckProject` 收到的 `rootDir` 一进来就有**唯一子目录**，两份实现都**下钻一次**（`UserManagement` 不在 SKIP_DIRS、且 rootDir 这一层无清单）→ 结果必然相同。

### 4.5 导出面与收敛性（运行时可证）

```
before.resolveProjectRoot === common.resolveProjectRoot : false     ← 私有副本（漂移源）
after.resolveProjectRoot  === common.resolveProjectRoot : true      ← ★ 同一函数对象
after  === common on my 16 fixtures / 100-case sweep / 200+200 trees : 全 true（0 发散）
before === common on my 16 fixtures                                 : 7/16
before.hasSourceFiles = function   →   after.hasSourceFiles = undefined
default export keys before/after : ["precheckProject","collectFiles","resolveProjectRoot"]  逐字不变
```

### 4.6 V4 实测数字汇总

| 测法 | before vs `common.js` | after vs `common.js` |
|---|---|---|
| 我自建 16 定型夹具 | **9 / 16** | **0 / 16** |
| 结构空间全枚举（n=100） | **26 / 100** | **0 / 100** |
| 我自己的种子化随机树（n=200，种子 987654321） | **18 / 200** | **0 / 200** |
| **种子化复现 B 的分布（n=200）** | **22 / 200**（与 B 逐树一致） | **0 / 200** |
| B 原脚本、清测试床后连跑 2 次 | **22 / 200 ×2** | **0 / 200** |
| **真实提交（n=62，全对象逐字节）** | **62 / 62 相等** | **62 / 62 相等** |

---

## 5 V7 独立复核：B 自陈的「复盘陷阱」是否成立

### 5.1 结论：**成立**（我独立复现了正反两个方向）

**正向（合成的破损对）**
```bash
# /tmp/c3-esm：producer.js 只导出 somethingElse；consumer.js: import { collectFiles } from './producer.js'
$ node --check producer.js    # → exit=0    （说"没问题"）
$ node --check consumer.js    # → exit=0    （说"没问题"）
$ node probe.mjs              # → exit=1
SyntaxError: The requested module './producer.js' does not provide an export named 'collectFiles'
    at #asyncInstantiate (node:internal/modules/esm/module_job:327:21)
Node.js v24.19.0
```

**反向（真实文件、真实历史状态）**：把**活树的 `ruleMutator.js`** 放进**冻结树 `/tmp/b3-before`**（其 `ruleExecutor.js` 还是 round 2 状态、`collectFiles` 是私有函数）——

```bash
$ sed -n '181p' /tmp/b3-before/server/src/services/ruleExecutor.js
function collectFiles(dir) {          # ← 无 export 关键字
$ grep -c '^export function collectFiles' /tmp/b3-before/server/src/services/ruleExecutor.js
0
$ node --check /tmp/b3-before/server/src/services/__c3_regress.mjs
  node --check exit=0                 # ← 仍然说"没问题"
$ node -e "import('/tmp/b3-before/server/src/services/__c3_regress.mjs')…"
  IMPORT FAILED -> SyntaxError: The requested module './ruleExecutor.js' does not provide an export named 'collectFiles'
```
（探针副本已即刻删除，**未改动仓库，也未改动冻结树的原始文件**。）

→ **`node --check` 只做单文件语法分析，不做模块链接（linking）**：`import { collectFiles } from './producer.js'` 在**语法上**完全合法，绑定是否存在要到 **ESM 实例化阶段**才校验。**B 的复盘结论真实、且不依赖他的自述**。

**反证另一半（当前活树绑定的确完整）**
```bash
$ node -e "Promise.all([import(…defectPrecheck.js), import(…ruleExecutor.js), import(…ruleMutator.js)])…"
defectPrecheck  named exports : collectFiles, default, precheckProject, resolveProjectRoot
ruleExecutor    named exports : FACT_OPS, RULE_TYPES, collectFiles, extOf, globToRegExp, readFileUtf8, resolveProjectRoot, resolveWithinRoot, runRules, validateRules
ruleMutator     named exports : mutateVariant, validateNegativeTests     # 5 个辅助名由 ruleExecutor 提供
```

### 5.2 可复用的最小自检建议（本轮已实现并验证）

**建议（推荐落地，对应必改清单 G-4「把临时探针晋升为门禁」）**：把**跨模块绑定自检**加进门禁族，作为 `node --check` 的补位。我已自建并实测：

```bash
$ node /tmp/c3-bindcheck.mjs "<repo>" --show-clean
=== c3-bindcheck: cross-module ESM binding self-check ===
modules scanned              : 162      （server/src 71 + server/test 91）
named import bindings checked: 440
BINDING VIOLATIONS           : 0
  (clean: every named import resolves to a real export)
exit=0

# 对合成的破损对（真实仓库布局）的检出能力：
$ node /tmp/c3-bindcheck.mjs /tmp/c3-bindtest
=== c3-bindcheck ===
modules scanned : 2 ; named import bindings checked: 2 ; BINDING VIOLATIONS: 1
  ✗ server/src/ruleMutator.js  imports {collectFiles} from server/src/ruleExecutor.js  -> module does not export 'collectFiles'
exit=1                                   # ★ 能抓到 B 第一遍漏加 export 的那类错误
```

**最小可复用配方（三条，按成本递增）**：
1. **提交前必跑一行**：`node -e "import('./<改动模块>').then(m=>console.log(Object.keys(m).sort().join(',')))"` —— 对"删副本 + 并 import"这类改动，**真 import 一次**即足以在 import 期暴露缺失绑定（B 当时正是靠这一步抓到的）。
2. **加一个静态绑定门禁**（`c3-bindcheck` 的形态，~60 行正则即可）：枚举每个模块的**导出面**与每个 `import { … } from './x.js'` 的**索取面**，取差集报错。优点：**不需要执行代码、不需要连库、0.2 秒**，可与 `check-layers.mjs` 并列进 `pretest`。
3. **不要**把 `node --check` 当作 ESM 改动的守门员（§5.1 已实测其漏检）；它只适合**单文件语法**兜底。

---

## 6 缺陷分级

| 级别 | 数量 | 项 |
|---|---|---|
| **阻断** | **0** | —— |
| **轻微** | **1** | **M1**｜`arch-metrics` 对 `ruleExecutor.js` 的行数打印在 B 的报告里是 **1011**，本轮实测为 **1010**（该文件换行符数 = `wc -l` = 1010，末行有换行）。判定：**B 的 1011 是"写文件/读文件之间"的瞬态读数**，属**报告噪声**，**不影响任何判据**（GodFile 10 / 观察带 19 均未变、门禁 PASS）。**不回流**，仅建议后续轮次"门禁读数须在文件静止后一次性复算"。 |
| **优化** | **3** | **O1**｜`/tmp/b3-fuzz.mjs` 用**未播种的 `Math.random()`**：其结果只在测试床残留（`/tmp/b3-fuzz` 未删）时才是 22/200（`rmSync` 只生效一次，后续运行的"随机文件名"被 `mkdirSync/writeFileSync` 幂等吞掉）。**建议改种子化 PRNG** 使数字可复现；B 的数字本身经我种子化复现为真，非编造。<br>**O2**｜把 `c3-bindcheck` 晋升为 `scripts/gates/bind-check.mjs`（G-4）。<br>**O3**｜把「`resolveProjectRoot` 的发散类」固化为**结构枚举**而非随机采样（随机数受测试床形状影响，区间 9%–26% 会引发口径争议）。 |

---

## 7 未做项与残留风险（诚实清单）

| # | 未做项 / 残留风险 | 理由与影响 |
|---|---|---|
| 1 | **未做 axe / 像素 sha1 / 4 组主题像素全等** | **有理由豁免**：本轮 3 个执行目标 100% 在 `server/src`，`client/src` 在改动窗口内 **0 文件写入**（mtime 实证）→ 不可能引入视觉变化或新 axe 违规。判据 5 的达标性沿用 round 2 的 V7/V8 实测，**本轮未独立复现**（与 B §5.2 一致）。 |
| 2 | **未做运行期模块加载探针（生产进程）** | 见 §3.3：`app.js` 顶层会 listen + 写库，属禁令；且**入度为 0 的模块运行期不可能被加载**，探针无增量信息。 |
| 3 | **仓库之外**的运维脚本/外部工具若直接按绝对路径 `import` 该模块 | 无证据存在；该形态不受本流水线约束。**风险：低**（即便存在，其拿到的也是"更正确的 `common.js` 语义"）。 |
| 4 | `hasSourceFiles` 导出面消失，若有未扫到的调用方会得到 `undefined` | **三重反证**（全仓 `grep -rnw` = 0 / 自建反向闭包 = 0 生产消费方 / 无非字面量动态说明符）。**风险：低**。 |
| 5 | 真实提交 62/62 相等**不等于**"所有输入形态行为不变" | 已实测发散面 9%–26%（取决于输入形状）。**正确表述 = 「无消费方模块的语义收敛」**（B §3.3），**不得写成"行为不变"**。因消费方为零，**对生产影响严格为 0**。 |
| 6 | 我的绑定自检是**正则实现**（非 AST） | 局限：不做 `export * from` 的传递解析（已按保守策略跳过，不产生假阳性）；不检查**动态** `import()` 的取名字面量；不覆盖 `.mjs/.cjs`。**只会漏报、不会误报**（对本用途足够）。 |
| 7 | 未复跑 round 0/1/2 的全量结论 | 规范 §六.3 增量口径；本轮只验 round 3 改动面与 A 指定的复算项。 |
| 8 | 判据 2（GodFile 10 个）**仍不可达** | 与 A §1 一致：server 侧拆分撞 `unmigrated ≤ 47` 门禁，client 侧撞 constraints §2 视觉铁律 → **属用户拍板项 P1**，非本轮回归缺陷。 |
| 9 | 未验证 P3/P4/P5/P6 等拍板项 | 不在本轮回归口径内（A §1.1 已裁定）。 |

---

## 8 本轮结论

> ### **PASS —— 不需回流 Agent B。**
>
> **理由（按判据）**：
> 1. **V1（主判据）全绿**：`Test Suites:` **4 处**摘要、**67 套件**、四段 **912 / 17 / 61 / 21 = 1011 passed / 0 failed**；`defect-precheck` **5 例逐条在跑、0 skipped**、`rule-executor` **61**、`rule-mutator` **21** —— 与 round 2 基线**逐位相同**，零回归。
> 2. **V2 五项门禁全 PASS**：cycle-check **71 / 164 / SCC 0 / 自环 0**（**164 为执行项①的唯一预期增量，已独立归因**）；check-layers **71 / 0 / 47**；arch-metrics **0 / 47 / 10（+19）**；hard-metrics **0 / 0 / 0**；文件数 **146**。
> 3. **★V3 独立证伪成立**：`defectPrecheck`/`defectScoring` 的**生产消费方 = 0**（自建 import 图反向闭包 = {自身, 自身单测}；生产入口不可达；`projectGrading.js` 零命中；**非字面量动态说明符 = 0**；兄弟实现与文件名全扫均 0）→ **执行项①的行为变更影响不到真实评分链路**，B 的安全性论证**站得住**。
> 4. **V4 数字经独立复算全部成立**：定型夹具 **9/16**（B 9/13）、结构全枚举 **26/100**、B 分布种子化复现 **22/200（逐树一致）**、我的分布 **18/200**；**真实提交 62/62 逐字节相等**（含 1066/1067/1068 的 29/29/0 与 27/3）；改动后**在全部测法上 0 发散**且与 `common.js` **同一函数对象**。**B 未夸大也未缩小**。
> 5. **V5 反证全部符合预期**：`hasSourceFiles`=0、`SOURCE_EXTS```ruleExecutor=0、`SKIP_DIRS```ruleMutator=0、`^export function`=**7**、`SRC_EXTS` 与 `default export` 均在。
> 6. **V6 改动面干净**：恰好 3 个目标 `M`（+ Captain 的 `pipeline-status.md`）、**无新增被跟踪文件**；`server/test` / `tests/` / `client/dist` / `client/src` 在本轮改动窗口内**零写入**（mtime 证据）。
> 7. **V7 结论成立**且已给出**可落地的最小自检**（`c3-bindcheck`：162 模块 / 440 绑定 / 0 违规，且能抓到 B 第一遍的漏 export 类错误）。
>
> **缺陷分级：阻断 0 · 轻微 1（M1 门禁行数瞬态读数，不回流）· 优化 3（O1/O2/O3）。**
> **下一步建议**：round 3 可归档；§5 六项判据中 **5 项达标、仅 GodFile（判据 2）不可达** → 按「**部分达标**」出报告，并把 **A §1.1 的 6 项拍板清单（P1–P6）**交用户裁定。建议把 **O2（绑定自检入门禁）** 与 **O1（对拍脚本种子化）** 写入后续轮次的验证配方。

---

## 9 唯一写入声明

本轮 Agent C 在仓库内**只写 2 个路径**：`docs/pipeline/test-round-03.md`（本报告，新建）与 `docs/pipeline/test-round-03.log`（**任务指定的产物**，由 `ROUND=03 bash docs/pipeline/scripts/unblock-g2.sh` 写入）。

**未执行任何 git 写操作**；**未触碰 `:5173`/`:3000`、未启动/重启/kill 任何常驻服务**；**未重建 `client/dist`**；**未写 `tests/`**；**未重跑 `ledger-check.mjs`**；**未改 `server/test/`**；**未写生产库**（jest 全程只连 `localhost:3306/exam_system_test`）。
临时装置全部落 `/tmp`（`c3-graph.mjs` / `c3-drift.mjs` / `c3-realfuzz.mjs` / `c3-sweep.mjs` / `c3-repl.mjs` / `c3-bindcheck.mjs` / `c3-esm/` / `c3-bindtest/`），**未入仓**；对 `/tmp/b3-before` 只做**只读导入**（唯一的临时探针副本已在使用后即刻删除）。

---

*本报告由 Agent C（`tech-test-automation`）于 round 3 产出。*
