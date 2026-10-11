> ⚠️ **Captain 注记（2026-10-11）**：本报告中的基线 sha256 `617da877…` **已过期**。
> 真实值（经 C 独立核验）为 **`678d3d51…`** —— 因为 Captain 在本报告写就后又对基线做了一次**格式升级**（为 31 条写入 `text` 指纹，31→31、丢失 0、新增 0）。
> **下一位验证者请以工作树实测的 sha256 为准，不要据本报告的旧值判定「基线被篡改」。**
> 另：C 的独立验证报告见 `docs/pipeline/lint-gate-migration-verify.md`。
# lint-check 迁移识别（migration pairing）—— 设计 · 自证 · 边界

| 项 | 值 |
| --- | --- |
| 门禁脚本 | `scripts/gates/lint-check.mjs`（958 → **1233** 行；`+289 / -14`） |
| 本轮改动 | **只增逻辑**：迁移配对 + `--self-test` ⑤ + 基线的 `text` 指纹 + `--json` 两个新字段 |
| 产品代码改动 | **0**（`client/src` / `server/src` 全程只读） |
| 基线文件改动 | **0**（`docs/pipeline/lint-baseline.json` sha256 全轮前后一致 = `617da877…412e1`） |
| 退出码 | `0 / 1 / 2` 语义不变（0 通过 / 1 基线外新违规 / 2 执行错误或基线缺失） |
| 自证规模 | **8 个 /tmp 场景**（A / B / C / D / D2 / E / A′ / A″）+ 场景 F + 退出码 2 回归 + 自检 ⑤ 11/11 + 正控 8/8 |
| 新增依赖 | **0**（仍然只用仓库内已有的 `@babel/*`、`@vue/compiler-sfc`；不联网、不装包） |

---

## 0. TL;DR

- **配对判据（精确口径）**：一条 `resolved`（基线里有、本次消失）与一条 `fresh`（基线里没有、本次新增）只有在 **rule 相同 + symbol 相同 + 规范化后的该行源码文本相同**，且该 `(rule, symbol, text)` 三元组的 **resolved 条数 === fresh 条数 > 0** 时才判为**迁移**；迁移**不计入阻断项**，在报告里单列「**已迁移 N 条**」并给出 **旧 file:line → 新 file:line** 对照。
- **方向一律是收窄假阳性**：任一条不满足、或任一侧的行文本取不到 ⇒ **不配对** ⇒ 保持阻断。绝不因为「不知道」而放行。
- **八个场景全部按预期**：A 迁移 exit **0**；B 真新增 exit **1**；C 改名搬迁（假迁移）exit **1**；D resolved 2 / fresh 1 exit **1**；D2 resolved 1 / fresh 2 exit **1**；E 干净树 exit **0**（0 误报）；A′ 旧格式基线 + 旧宿主已删 exit **1**（fail-closed）；F 迁移与真新增同跑 exit **1**（真新增仍然被拦）。
- **真实仓库**：默认模式输出与改动前 **逐字节相同**（`exit 0`、新增 0、`migrations = []`）；`--list` 逐字节相同；`--json` 既有字段逐字节不变，仅**新增** `blockingViolations` / `migrations` 两个字段。
- **无迁移路径的性能开销**：真实仓库树实测 `detectMigrations = 1 ms`（scanTree 593 ms / formatReport 0 ms）；交替 6 轮 A/B 无回归。

---

## 1. 动机：为什么必须把「换宿主」与「真新增」分开

`server/src/controllers/reviewController.js:354` 有一个**只写不读**的死变量：

```js
354    let count = 0;
...
365      count = toReview.length;
```

它是 `docs/pipeline/lint-baseline.json` 里 31 条基线的其中一条（`no-unused-vars` / `count`）。而即将进行的拆分要把 `batchReview` **逐字搬**到新文件：

```text
比对键 = file + rule + symbol（lint-check.mjs:539-548）
搬迁 ⇒ 旧键 (reviewController.js, no-unused-vars, count) 消失 = resolved(delta 1)
       新键 (新文件,        no-unused-vars, count) 新增 = fresh(delta 1)
⇒ 现行判定 verdict = FAIL、exit 1
```

**但缺陷一个都没多**：同一处死变量换了个宿主。同一情形在下一步的 `teacherController.js` 还有 3 条。若装置不改，拆分执行者只有两条路：改产品代码（本轮明令禁止的行为变更）或刷基线（`--update-baseline` 一旦被当成消红按钮，门禁对这类缺陷就**永久失明**）。

⇒ 需要的是一个**通用**判据：把「同一处分缺陷换宿主」识别出来，而对**真正新增的缺陷一点都不能放松**。

---

## 2. 配对规则（精确口径）

### 2.1 三元组 + 规范化口径

```text
配对键（三元组） = rule + '\u0000' + symbol + '\u0000' + normalizedText

normalizedText(v) = normalizeSourceText(「该违规所在行的源码」)
                  = raw.replace(/\s+/g, ' ').trim()      ← 折叠一切空白序列为单个空格，再去首尾空白
                  = 空行 / 取不到 ⇒ null ⇒ 该条目**永不参与配对**
```

- 规范化只做「折叠空白 + 去首尾空白」，**不做**大小写、标点、标识符重命名等任何语义归一化 —— 口径越宽，越容易把「改过的代码」误认成「搬过来的代码」。
- 因此**缩进变化不影响**配对（缩进属于空白）：`    let count = 0;` 与 `\t  let   count = 0;  ` 规范化为同一个 `let count = 0;`。这正是拆分中常见的「搬进更深的嵌套」。
- 反过来，`let count = 0;` → `let count = 1;` 或 `let count2 = 0;` 规范化后不同 ⇒ **不配对**。

### 2.2 行文本从哪里取（fail-closed）

| 侧 | 来源（按优先级） | 取不到时 |
| --- | --- | --- |
| `resolved`（基线有、本次消失） | ① **基线条目自带的 `text`**（`--update-baseline` 写入的指纹 —— 旧宿主文件被**删除**了它也还在）；② 回退读当前工作树的「基线的 `file:line`」（旧宿主仍在、该行未挪动时才拿得到） | `text = null` ⇒ **不配对** |
| `fresh`（基线没有、本次新增） | 本次扫描树里 `file:line` 的源码（刚扫过的文件，正常必得） | `text = null` ⇒ **不配对** |

> 这是本设计最关键的一条工程判断：**「不知道」不允许被当成「一样」**。旧宿主已被删除、而基线又是旧格式（没有 `text`）时，门禁**没有能力**证明这是一次搬迁 —— 那就继续 exit 1，并把这件事写清楚（见 §6.1 与场景 A′）。

### 2.3 一一配对（数量必须相等）

对每个三元组：

```text
resolved 条数 === fresh 条数 且 > 0   ⇒ 该组全部判为迁移
否则（2 配 1、1 配 2、有 resolved 无 fresh、有 fresh 无 resolved）⇒ 该组**一条都不配**
```

**不做部分配对**：只要能证明「数量对不上」，就说明这一次运行里确实多出来（或少掉）了东西，不给它任何折扣。

### 2.4 宿主必须不同（自动成立 + 防御性断言）

`resolved` 与 `fresh` 是**按同一个键**（file+rule+symbol）互斥算出来的：同一个键不可能既 `extra > 0`（fresh）又 `delta > 0`（resolved）。因此「配对成功 ⇒ 两侧 file 必然不同」是**自动成立**的 —— 配对的语义天然就是「换宿主」，它**不可能**把「同一文件里同类违规净增」掩饰成迁移。代码里仍保留一条显式断言（两侧 file 两两不同），一旦这条不变式被将来的改动破坏，结果立刻退化为「不配对 = 仍然阻断」。

### 2.5 永不参与配对的规则

`parse-error` **排除**。它是**文件级**状态（解析失败 ⇒ 该文件所有规则都被跳过），「位置」是文件本身而不是某一行；两个毫不相干的文件完全可能在同一条文本上解析失败，放开配对会产生真实的假阴性。排除方向是**更严**（仍然阻断），不是放松。

### 2.6 报告与退出码

- 阻断项 = `fresh` 扣除判定为迁移的部分；**退出码只由阻断项决定**。
- 报告新增一节（示例见 §3.2）：

```text
── 已迁移 1 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） ─────────────
  （同一处缺陷换宿主：不计入阻断项，也不计入「已消除」）
  ⇄ no-unused-vars  count  ｜ let count = 0;
      server/src/controllers/reviewController.js:21   →   server/src/controllers/review/batch.js:21
```

- 「已消除（基线内被修掉）N 条」**扣除**迁移掉的那部分（换宿主 ≠ 被修掉）。
- 「新增」列的口径**不变**（仍是基线外新键的条数）；只在该列下方补一行说明本次实际阻断项，避免把「已迁移」误读成「已修复」。

---

## 3. 自证：场景与原始输出

### 3.1 场景怎么搭（不碰仓库产品代码、不碰仓库基线）

```bash
# 每个场景 = 一个自足的「迷你仓库根」：
#   scripts/gates/lint-check.mjs  ← 仓库脚本的**逐字节副本**（sha256 与仓库一致，见 3.14）
#   client/src + server/src       ← 场景自己的最小源码树
#   node_modules -> <repo>/client/node_modules   ← 只读软链，复用仓库内已有依赖（不装包、不联网）
#   package.json（{}）            ← createRequire 的锚点
#   docs/pipeline/lint-baseline.json ← 由门禁自己的 --update-baseline 生成
bash /tmp/lint-migration/setup.sh     # 场景 A/B/C/D/D2/E/A′/A″
bash /tmp/lint-migration/extra.sh     # 场景 F + 退出码 2 回归 + JSON
```

被搬迁的缺陷源与真实代码同形（`let count = 0;` 只写不读、响应体用 `reviewedStudentIds.size`）。

### 3.2 场景 A（迁移）：复制到新文件名 + 删除原文件 ⇒ **exit 0**

```text
$ cp .../reviewController.js .../review/batch.js && rm .../reviewController.js
$ node scripts/gates/lint-check.mjs ; echo "exit=$?"
=== lint-check: 常驻静态检查门禁（基线对比）===
扫描面      : client/src + server/src（.vue 只查 <script>/<script setup> 脚本块，模板不查）
扫描文件    : 1（.vue 0 / .js 1）
代码行      : 30
解析失败    : 0 个文件
基线        : docs/pipeline/lint-baseline.json（2026-10-11T05:19:05.396Z，1 条）

── 分类统计（基线 → 当前，新增） ──────────────────────────────────────────────────────────
  规则                   基线      当前      新增
  no-undef                   0         0         0
  no-unused-vars             1         1         1  ← 已迁移（不计入阻断）
  no-unresolved-import       0         0         0
  no-dupe-keys               0         0         0
  no-redeclare               0         0         0
  no-const-assign            0         0         0
  parse-error                0         0         0
  合计                        1         1         1
  · 「新增」列 = 基线外新键（含判定为迁移的 1 条）；实际阻断项 = 0 条

── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  （无）

── 已迁移 1 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） ─────────────────────────────────────
  （同一处缺陷换宿主：不计入阻断项，也不计入「已消除」）
  ⇄ no-unused-vars  count  ｜ let count = 0;
      server/src/controllers/reviewController.js:21   →   server/src/controllers/review/batch.js:21

── 基线内违规 Top 10 文件（只统计、不阻断） ─────────────────────────────────────────────────────────────────
      1  server/src/controllers/review/batch.js

结论：PASS（无基线外新违规；1 条为迁移，不计入阻断）
exit=0
```

> 注意：**旧宿主文件已被删除**，resolved 侧的行文本只能来自基线的 `text` 指纹 —— 这正是 §2.2 ① 存在的理由。此时基线内容：

```json
"violations": [
  {
    "file": "server/src/controllers/reviewController.js",
    "line": 21,
    "rule": "no-unused-vars",
    "symbol": "count",
    "text": "let count = 0;"
  }
]
```

### 3.3 场景 B（真新增，没有对应的 resolved）⇒ **exit 1**

往新文件里加一个未使用变量 `MAX_ROWS`：

```text
── 分类统计（基线 → 当前，新增） ──────────────────────────────────────────────────────────
  no-unused-vars             1         2         1  ← 新增
  合计                        1         2         1

── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  ✗ server/src/services/reportHelper.js:1  no-unused-vars  MAX_ROWS  — 声明但从未使用

结论：FAIL（发现 1 条基线之外的新违规）
exit=1
```

### 3.4 场景 C（假迁移：改名后搬迁）⇒ **exit 1**

`count` → `count2`（声明与写入都改名）后搬到新文件、删除原文件：

```text
── 分类统计（基线 → 当前，新增） ──────────────────────────────────────────────────────────
  no-unused-vars             1         1         1  ← 新增
  合计                        1         1         1

── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  ✗ server/src/controllers/review/batch.js:8  no-unused-vars  count2  — 声明但从未使用
  · 已消除（基线内被修掉）: 1 条

结论：FAIL（发现 1 条基线之外的新违规）
exit=1
```

symbol 不同 ⇒ 不配对；旧键照旧记入「已消除」，新键照旧阻断。

### 3.5 场景 D（resolved 2 / fresh 1，数量不等）⇒ **exit 1**

基线里 `a.js` / `b.js` 各有一条**文本完全相同**的 `let count = 0;`；搬迁后只剩一个新文件带同一条：

```text
── 分类统计（基线 → 当前，新增） ──────────────────────────────────────────────────────────
  no-unused-vars             2         1         1  ← 新增
  合计                        2         1         1

── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  ✗ server/src/c.js:2  no-unused-vars  count  — 声明但从未使用
  · 已消除（基线内被修掉）: 2 条

结论：FAIL（发现 1 条基线之外的新违规）
exit=1
```

### 3.6 场景 D2（resolved 1 / fresh 2，反向不等）⇒ **exit 1**

```text
── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  ✗ server/src/c1.js:2  no-unused-vars  count  — 声明但从未使用
  ✗ server/src/c2.js:2  no-unused-vars  count  — 声明但从未使用
  · 已消除（基线内被修掉）: 1 条

结论：FAIL（发现 2 条基线之外的新违规）
exit=1
```

### 3.7 场景 E（干净树：基线生成后什么都不改）⇒ **exit 0、0 误报**

```text
── 分类统计（基线 → 当前，新增） ──────────────────────────────────────────────────────────
  no-unused-vars             1         1         0
  合计                        1         1         0

── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  （无）

结论：PASS（无基线外新违规）
exit=0
```

**真实仓库**（195 文件 / 33 304 行）同样是干净树，且与改动前逐字节一致：

```text
$ node scripts/gates/lint-check.mjs ; echo "exit=$?"
...
  合计                       31        31         0
── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  （无）
结论：PASS（无基线外新违规）
exit=0

$ node scripts/gates/lint-check.mjs --json | node -e "..."
  newViolations.length = 0 | blockingViolations.length = 0 | migrations = [] | resolved.length = 0 | verdict = PASS
```

### 3.8 场景 A′（旧格式基线 + 旧宿主已删除）⇒ **exit 1（fail-closed）**

把场景 A 的基线**剥离 `text` 字段**（模拟仓库现有基线），再做同样的搬迁：

```text
── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  ✗ server/src/controllers/review/batch.js:21  no-unused-vars  count  — 声明但从未使用
  · 已消除（基线内被修掉）: 1 条

结论：FAIL（发现 1 条基线之外的新违规）
exit=1
```

**这是有意为之**：拿不到旧行文本时，门禁不猜。它宁可让执行者跑一次显式的 `--update-baseline`（把 `text` 指纹写进去），也不肯用「同名同类」这种弱证据放行。

### 3.9 场景 A″（**仓库现有基线** + 旧宿主行仍在磁盘上）⇒ **exit 0**

用**仓库当前基线**（无 `text`）扫一棵只含搬迁后文件的临时树（`--root`）：

```text
  no-unused-vars            31         1         1  ← 已迁移（不计入阻断）
  · 「新增」列 = 基线外新键（含判定为迁移的 1 条）；实际阻断项 = 0 条
── 已迁移 1 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） ─────────────────────────────────────
  ⇄ no-unused-vars  count  ｜ let count = 0;
      server/src/controllers/reviewController.js:354   →   ../../../../../tmp/lint-migration/A2/moved/batch.js:21
结论：PASS（无基线外新违规；1 条为迁移，不计入阻断）
exit=0
```

**这条证据要说清它证明了什么、没证明什么**：它证明 §2.2 ② 的**回退路径可用** —— 只要旧宿主的那一行还在磁盘上（本仓此刻确实还在：`:354` 仍是 `let count = 0;`），**今天这份基线**就已经能把这次搬迁认出来。它**不**证明「拆分做完之后不用刷基线」：真的搬走之后 `:354` 会换成别的行，回退路径失效，届时要么先跑一次显式的 `--update-baseline`（拆分计划 §6.5-D1 本来就这么安排），要么就会看到 A′ 的 exit 1。

### 3.10 场景 F（同一次运行里既有迁移、又有真新增）⇒ **exit 1，真新增仍然被拦**

```text
── 分类统计（基线 → 当前，新增） ──────────────────────────────────────────────────────────
  no-unused-vars             1         2         2  ← 新增
  合计                        1         2         2
  · 「新增」列 = 基线外新键（含判定为迁移的 1 条）；实际阻断项 = 1 条

── 基线之外的新违规（阻断项） ─────────────────────────────────────────────────────────────
  ✗ server/src/services/reportHelper.js:1  no-unused-vars  MAX_ROWS  — 声明但从未使用

── 已迁移 1 条（rule + symbol + 规范化行文本 三项全同、两侧条数一一相等） ─────────────────────────────────────
  （同一处缺陷换宿主：不计入阻断项，也不计入「已消除」）
  ⇄ no-unused-vars  count  ｜ let count = 0;
      server/src/controllers/reviewController.js:21   →   server/src/controllers/review/batch.js:21

结论：FAIL（发现 1 条基线之外的新违规；另有 1 条为同一处缺陷换宿主（迁移），不计入阻断）
exit=1
```

对应 `--json`：

```text
newViolations : ["server/src/controllers/review/batch.js:21 no-unused-vars count",
                 "server/src/services/reportHelper.js:1 no-unused-vars MAX_ROWS"]
blocking      : ["server/src/services/reportHelper.js:1 no-unused-vars MAX_ROWS"]
migrations    : [{"rule":"no-unused-vars","symbol":"count","text":"let count = 0;","count":1,
                  "from":[{"file":"server/src/controllers/reviewController.js","line":21}],
                  "to":[{"file":"server/src/controllers/review/batch.js","line":21}]}]
verdict       : FAIL
exit=1
```

场景 A 的 `--json`（迁移、无阻断）：

```text
newViolations : ["server/src/controllers/review/batch.js:21 no-unused-vars count"]
resolved      : [{"key":"server/src/controllers/reviewController.js\u0000no-unused-vars\u0000count","delta":1}]
blocking      : []
migrations    : [{... "count":1 ...}]
verdict       : PASS
exit=0
```

### 3.11 退出码 2 回归（基线缺失）

```text
$ node scripts/gates/lint-check.mjs        # 场景 G：树里有源码、但没有 docs/pipeline/lint-baseline.json
结论：无法判定（基线缺失）

基线缺失：docs/pipeline/lint-baseline.json 不存在，门禁无法给出判决。
请先运行：node scripts/gates/lint-check.mjs --update-baseline
exit=2
```

### 3.12 `--json` 字段结构（既有字段逐字节不变）

```text
$ node -e "...比对改动前/后的 --json（真实仓库）..."
  新增字段 : blockingViolations,migrations
  删除字段 : （无）
  内容变化的既有字段 : （无 —— 既有字段全部逐字节不变）
```

新字段语义：

| 字段 | 含义 |
| --- | --- |
| `blockingViolations` | **退出码的依据**：`newViolations` 扣除判定为迁移的部分 |
| `migrations` | 判定为「同一处缺陷换宿主」的配对明细：`{rule, symbol, text, count, from:[{file,line}], to:[{file,line}]}` |

`newViolations` **保持原义**（= 全部基线外新键），所以既有的取证脚本与拆分计划里「用 `--json` 的 `resolved`/`fresh` 三元组做等价性举证」的做法**继续可用**。

### 3.13 既有行为逐字节回归（真实仓库）

```text
$ node scripts/gates/lint-check.mjs > after.txt ; diff before.txt after.txt
IDENTICAL (byte-for-byte)                     ← 默认报告（无迁移时输出一字未变）

$ node scripts/gates/lint-check.mjs --list    → diff 逐字节一致
$ node scripts/gates/lint-check.mjs --rule=no-unused-vars → 正常（exit 0）

镜像树 A/B（同一棵树 client/src+server/src 软链、同一基线）：
  diff perf-before/out.txt perf-after/out.txt → IDENTICAL
```

`--update-baseline` 的输出**多了一行说明**（语义未变，只是告知指纹已写入）：

```text
=== lint-check --update-baseline：基线已刷新 ===
文件        : docs/pipeline/lint-baseline.json
扫描        : 1 文件 / 30 行
违规总数    : 1（此前无基线）
迁移指纹    : 每条附带 text = 该行源码的规范化文本（供「同一处缺陷换宿主」的迁移配对使用）
...
```

它**仍然是唯一的写盘点**（代码里 `writeFileSync(BASELINE_PATH, …)` 只在 `--update-baseline` 分支，`:1179-1180`），默认模式全程零写入 —— 全轮自证结束后仓库基线 sha256 仍为 `617da877…412e1`。

### 3.14 `--self-test`（原 ①②③④ 不变，新增 ⑤）

```text
$ node scripts/gates/lint-check.mjs --self-test ; echo "exit=$?"
── ① 干净树（6 个文件，逐条覆盖已知假阳性写法） ──   ✓ … 误报 0 条
── ② 正控树（8 条正控，每条必须被精确检出） ──     8/8 条正控命中
── ③ 注入后干净样本复检 ──                        ✓ 干净样本仍为 0 条误报
── ④ 基线对比逻辑（行号漂移 vs 真新增） ──         4/4 通过

── ⑤ 迁移配对逻辑（同一处缺陷换宿主 vs 真新增） ─────────────────────────────────────────────
  ✓ 成对迁移（rule+symbol+行文本全同，1↔1）⇒ 记为迁移、不阻断（缩进/空白不同不影响：规范化折叠空白）
        实测 迁移组 1 / 迁移条数 1 / 阻断 0　期望 迁移组 1 / 迁移条数 1 / 阻断 0
  ✓ 成对迁移 2↔2（同一三元组两条）⇒ 记为 1 组、迁移 2 条、不阻断
        实测 迁移组 1 / 迁移条数 2 / 阻断 0
  ✓ 部分迁移（2 组可配对 + 1 条真新增）⇒ 配对 2 条、剩下 1 条仍阻断
        实测 迁移组 2 / 迁移条数 2 / 阻断 1
  ✓ 代码文本不同（count = 0 → count = 1）⇒ 不配对、仍阻断
  ✓ symbol 改名（count → count2）⇒ 不配对、仍阻断
  ✓ rule 不同（no-unused-vars → no-undef，symbol 与文本都相同）⇒ 不配对、仍阻断
  ✓ 条数不等（resolved 2 / fresh 1）⇒ 一条都不配、仍阻断
  ✓ 条数不等反向（resolved 1 / fresh 2）⇒ 一条都不配、仍阻断 2 条
  ✓ 旧宿主已删除且基线无 text（旧文本取不到）⇒ fail-closed、不配对、仍阻断
  ✓ parse-error 永不参与配对（文件级状态，不是某一行的缺陷）⇒ 仍阻断
  ✓ 新旧宿主同一 file（合成反例：比对键的互斥性被破坏）⇒ 防御性拒绝配对、仍阻断
  小计：11/11 条迁移用例符合预期

SELF-TEST PASSED: 8/8 正控命中，干净树 0 误报（门禁非「永远绿灯」）
exit=0
```

> **这条自检抓到了本实现自己的一个真 bug**：第一版 `fresh` 侧只带了 `{i, v, text}`，而配对键读的是 `e.rule + e.symbol + e.text` ⇒ 所有 fresh 条目的 rule/symbol 都是 `undefined`，**永远配不上**（正例 1↔1 立刻 FAIL，负例则全部“通过”—— 因为它们本来就不该配对）。修掉之后又补了 2 条正例（2↔2、部分迁移），避免将来「负例空过」这种假绿。

脚本副本一致性（场景里跑的就是仓库里的这一份）：

```text
27d563d67decd68daa9c71f501c9353a084b5f7b9a1e2e98fd4094a237b2e481  repo gate
27d563d67decd68daa9c71f501c9353a084b5f7b9a1e2e98fd4094a237b2e481  scenario A copy
617da877f8b5c76c15d708d69202286548673be5c578a77f43c1a83044c412e1  repo baseline（全轮未变）
```

### 3.15 性能（无迁移路径上没有可测开销）

```text
真实仓库树（195 文件 / 33 304 行）分相计时：
  [phase] scanTree          : 593ms
  [phase] detectMigrations  : 1ms      ← 新增逻辑
  [phase] formatReport      : 0ms

镜像树交替 A/B（各 6 轮，消除负载漂移）：
  round 1 : before=0.80  after=0.88      round 4 : before=0.88  after=0.90
  round 2 : before=0.88  after=0.89      round 5 : before=0.90  after=0.88
  round 3 : before=0.93  after=0.91      round 6 : before=0.91  after=0.87
```

没有迁移时 `detectMigrations` 在第一个判断就返回（`fresh`/`resolved` 均为空），不读任何文件。

---

## 4. ★ 这条规则**不会**误放哪些情形（负向清单）

| # | 情形 | 为什么放不过去 | 证据 |
| --- | --- | --- | --- |
| 1 | **真正的新增缺陷**（没有任何 resolved 与之对应） | 不成对 ⇒ 留在阻断项 | 场景 B：`reportHelper.js:1 MAX_ROWS` ⇒ exit 1 |
| 2 | **改名后搬迁**（`count` → `count2`） | symbol 不同 ⇒ 三元组不同 ⇒ 不配对 | 场景 C ⇒ exit 1；自检 ⑤「symbol 改名」 |
| 3 | **改了代码再搬**（`count = 0` → `count = 1`、先改逻辑再挪位置） | 规范化行文本不同 ⇒ 不配对 | 自检 ⑤「代码文本不同」 |
| 4 | **换了规则类型**（同 symbol 同文本，但 `no-unused-vars` → `no-undef`） | rule 不同 ⇒ 不配对 | 自检 ⑤「rule 不同」 |
| 5 | **数量对不上**（resolved 2 / fresh 1 或反向 1 / 2） | 一一相等是硬条件，不做部分配对 | 场景 D、D2 均 exit 1；自检 ⑤ 两条 |
| 6 | **旧宿主已删除、且基线没有文本指纹** | 旧文本取不到 ⇒ fail-closed，不猜 | 场景 A′ ⇒ exit 1 |
| 7 | **同一文件里的同类净增**（想伪装成「内部搬家」） | 比对键含 file ⇒ 同一键不可能既 resolved 又 fresh ⇒ 配对必然跨文件；另有显式断言 | 自检 ⑤「新旧宿主同一 file」合成反例 ⇒ 拒绝配对 |
| 8 | **解析失败换文件**（`parse-error` 想当迁移） | 该规则被显式排除在配对之外 | 自检 ⑤「parse-error 永不参与配对」 |
| 9 | **同一轮里迁移与真新增混在一起** | 迁移只吃掉与它配成对的那几条，其余照旧阻断 | 场景 F ⇒ exit 1，`blockingViolations` 恰为 `MAX_ROWS` 一条 |
| 10 | **纯空白行 / 空符号**当作配对依据 | 规范化为 `null` ⇒ 不参与配对 | 代码路径 `normalizeSourceText` 返回 null + 自检 ⑤ 第 7 例 |

一句话：**它只放行「同一 rule、同一 symbol、同一行代码文本、数量一一相等、且跨文件」的那些 fresh**，其余全部照旧 exit 1。

---

## 5. 诚实的边界：它仍然可能漏判的情形

写下来，避免「门禁绿了 = 这次拆分没问题」的误读：

1. **固有等价类（判据本身决定，不是实现缺陷）**：如果「A 文件里那处缺陷被修掉」与「B 文件里新出现一处 rule+symbol+文本完全相同、且数量恰好相等的缺陷」在同一次运行里发生，它与「逐字搬迁」在 `(rule, symbol, text)` 指纹下**不可区分**，会被记为迁移。要再收窄，只能引入「同一函数/同一语法块」级别的证据（AST 子树指纹），成本与复杂度都远超本轮收益。**注意这正是本轮刻意接受的取舍**：它换来的是「拆分的每一步都不需要动产品代码、也不需要刷基线」。
2. **回退路径的同样性质**（§3.9）：旧宿主行仍可读时，走的是「工作树取文本」；此时上面第 1 条的等价类依然成立。
3. **不覆盖跨文件重命名的其他副作用**：新文件里如果连带产生 `no-unresolved-import`（相对路径写错层级），那是**新键**、没有对应的 resolved，照旧阻断 —— 这是**好事**，不是漏判。
4. **不追溯历史**：门禁只在「本次运行 vs 基线」这一层做配对，不理解 git 历史，也不读 `git mv` 记录。基线以外的世界它一无所知（与改动前一致）。

---

## 6. 对现有基线与退出码的影响

### 6.1 基线文件

- **本轮零改动**：`docs/pipeline/lint-baseline.json` 的 sha256 在整轮自证前后完全一致（`617da877…412e1`）；`client/src`、`server/src` 亦零改动（`git status` 只有 `M scripts/gates/lint-check.mjs` + 本报告）。
- **格式向后兼容**：新增的 `text` 是**附加字段**。现有 31 条基线（无 `text`）**照常加载、照常判定**，只是迁移识别退化为「旧宿主行仍可读才可能配对」（场景 A′ / A″ 就是这两种结局的实证）。
- **现有基线的能力边界（要点）**：以**今天这份基线**执行真实的 `reviewController.js` 拆分，旧宿主 `:354` 会被别的行占掉 ⇒ 迁移配对不成立 ⇒ **仍然 exit 1**。要让它生效，需要一次**显式的** `--update-baseline`（拆分计划 §6.5-D1 本来就是这么安排的：一条 31 → 31 的刷新，`resolved` 恰 1 条旧 file、`fresh` 恰 1 条新 file）——**门禁自己不会、也没有任何自动刷新**。
- 刷新之后：基线每条带 `text`，此后**任意次**逐字搬迁都能被自动识别，且**再也不需要**为了搬家而刷基线。

### 6.2 退出码 / JSON / 报告文本

| 面 | 变化 |
| --- | --- |
| 退出码 | **不变**：`0` = 无基线外新违规（迁移不算新违规）/ `1` = 有基线外新违规 / `2` = 执行错误或基线缺失（§3.11 实测） |
| `--json` | 既有字段（含 `newViolations` / `resolved` / `verdict`）**逐字节不变**；**新增** `blockingViolations` / `migrations` |
| 默认报告 | 无迁移时**逐字节不变**（§3.13 实测）；有迁移时新增「已迁移 N 条」一节，且「已消除」扣除迁移掉的条数 |
| `--list` / `--rule=` | 逐字节不变 |
| `--update-baseline` | **语义不变**（仍是显式刷新、仍是唯一写盘点）；输出多一行「迁移指纹」说明；写出的基线多一个 `text` 字段 |
| `--self-test` | 原 ①②③④ 不变，新增 ⑤（11 条迁移用例） |

---

## 7. 给 C 的验证指令（建议按顺序，全部离线）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"

# ① 自检：期望 exit 0，⑤ 显示 11/11、末尾 SELF-TEST PASSED（8/8 + 干净树 0 误报）
node scripts/gates/lint-check.mjs --self-test; echo "exit=$?"

# ② 真实仓库干净树：期望 exit 0、合计「31 → 31、新增 0」、无「已迁移」一节
node scripts/gates/lint-check.mjs; echo "exit=$?"

# ③ 机器可读：期望 migrations = []、blockingViolations = []、newViolations = []，且既有字段与改动前一致
node scripts/gates/lint-check.mjs --json | node -e "
const s=require('fs').readFileSync(0,'utf8');const j=JSON.parse(s);
console.log(Object.keys(j).join(','));
console.log('new',j.newViolations.length,'blocking',j.blockingViolations.length,'migrations',j.migrations.length,j.verdict);"

# ④ 复跑本轮 8 个 /tmp 场景（脚本与产出都留在 /tmp/lint-migration，可重复执行）
bash /tmp/lint-migration/setup.sh    # A=0 / B=1 / C=1 / D=1 / D2=1 / E=0 / A′=1 / A″=0
bash /tmp/lint-migration/extra.sh    # F=1（迁移 1 + 阻断 1）/ 无基线=2
#    逐字核对：A 要出现「已迁移 1 条」+ 旧 file → 新 file 对照；C 要出现 ✗ count2

# ⑤ ★独立反证（不要只信我的场景）：自己造一对「同 rule 同 symbol 同文本」与一对「同名但文本不同/改名」，
#    确认前者 exit 0、后者 exit 1；再造 resolved 2 / fresh 1 确认不配对。

# ⑥ 写入性与零改动核验
shasum -a 256 docs/pipeline/lint-baseline.json      # 期望 617da877f8b5c76c15d708d69202286548673be5c578a77f43c1a83044c412e1
git status --porcelain | grep -v '^??'              # 期望只有 M scripts/gates/lint-check.mjs
grep -n "writeFileSync(BASELINE_PATH" scripts/gates/lint-check.mjs   # 期望只有 1 处（--update-baseline 分支）
```

**验收口径（DoD）**：①②③ 全绿；④ 的 8 个场景退出码与上文逐个相同；⑤ 你自己构造的负例全部 exit 1；⑥ 三项均符合期望。

---

## 8. 维护不变量（改这个门禁的人必须守）

1. **`--self-test` 必须全绿**（正控 8/8 + 干净树 0 误报 + 迁移用例 11/11）。任何对配对逻辑的改动都要重跑；
2. **配对方向只允许收窄**：新增任何「更容易配成对」的条件（更宽的规范化、更弱的文本比对、允许部分配对）都必须同时给出**负例**并说明为什么不会放行真新增；
3. **fail-closed 是默认值**：拿不到证据 = 不配对 = 阻断；
4. **不装依赖、不联网**；**不改产品代码**；**不改基线内容**（刷基线永远是显式动作）；
5. **退出码语义固定**：`0` 通过 / `1` 有新违规 / `2` 执行错误或基线缺失；
6. 迁移判定必须**始终**能在输出里被看见（「已迁移 N 条」+ 旧 file:line → 新 file:line），不允许出现「静默放行」。
