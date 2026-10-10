# refactor-round-03 —— 定点修复报告（流水线第 3 轮）

> 轮次：**03（定点修复）** ｜ 日期：**2026-10-11（凌晨）** ｜ 基线 commit：**`4b531b8`**（`git rev-parse HEAD` 实测 = `419477a13c5fce529cd17635590c433401c327de`；`4b531b8..HEAD` 只动过 2 个 `.md`，源码树 == 4b531b8）
> Agent B 技能：`tech-code-refactoring` ｜ 上游输入：`docs/pipeline/audit-round-03.md`（§3 执行集 + §3.4 硬边界）、`docs/pipeline/project-constraints.md`（11 条测量纪律 + 四段口径 912+17+61+21 = 1011 + 基线 0 failed）、`docs/pipeline/refactor-round-02.md`（§5 遗留风险 R4）、`pipeline-status.md`
> 执行集：**恰好 3 个文件 / 预算 8，余 5** —— 全部在 `server/src`（**零视觉风险由构造保证**），**未新增任何文件、未改任何 `.md`、未碰 `server/test/` 与 `client/`**
> 方法：**冻结副本测基线**（`git archive 4b531b8` → `/tmp/b3-before`，**1013** 个被跟踪文件，与 `git ls-files | wc -l` 相等）→ **锚点字符串替换**（非行号整块删，见 §2.0）→ 活树复算四门禁 + **自建 5 个对拍/探针脚本**（全落 `/tmp`，未入仓）

---

## 0 约束遵守声明

| 约束（constraints §1/§2 + A §3.4） | 执行情况 |
|---|---|
| 只改 A §3.1/§3.2/§3.3 的 3 个文件 | ✅ `git status --porcelain -uno` = 恰好 3 个 `M` + Captain 的 `pipeline-status.md`（会话开始前即为 `M`，B 未触碰） |
| **不新增任何文件**（`unmigrated 47` 是硬上限） | ✅ `find server/src client/src -type f` = **146 → 146**（改前/改后同值） |
| 不改任何 `.md`（尤其 `docs/ui-redesign/*`） | ✅ 全轮唯一写入的 `.md` 是**本报告**（新建，非修改） |
| 不动 `server/test/`（明令禁止） | ✅ 零写入：`git status` 无 `test/` 变更；旁证 `ls -ldT server/test` → mtime `Aug 16 20:48:03 2026`，**远早于本轮**（本轮全部操作发生在 `Oct 11 00:2x` 之后）—— 按陷阱 8 用 mtime 而非 `git status` 推断 |
| 禁止 `git clean`/`stash`/`checkout -- .`/`reset --hard`/`restore .`；零 git 写操作 | ✅ 只用 `rev-parse`/`status`/`diff`/`archive`；**零 git 写操作** |
| 不碰 `:5173`/`:3000`、`client/dist`、`tests/` | ✅ 未启动/重启/kill 任何进程；未读写 `client/dist`（连 `ls` 都没有）；`tests/` 零读写（mtime `Oct 10 20:13:40 2026`） |
| 不跑 build / 不启服务 / 不跑全量回归 | ✅ 未执行任何构建与服务命令；jest **只跑 3 个定向套件**（C 的职责是四段 1011 全量） |
| **必须先冻结再测**（陷阱 7） | ✅ 全部基线测量在 `/tmp/b3-before`；对拍在 `/tmp`；**活树零测量污染** |
| **陷阱 10：行号/计数以冻结树实测为准** | ✅ **全部行号自己数过**，未采信任何前轮数字；并**主动纠正 A 的 3 处行数预测**（见 §5） |
| **陷阱 11：计数带词边界** | ✅ 发现 `\b` 对 `SRC_EXTS` **无效**（`_` 是词字符）→ 改用字面量计数并在报告中注明口径 |
| 唯一写者 | ✅ 本轮仅写 3 个执行目标 + 本报告 |

---

## 1 改动文件清单（3 个）

### 1.1 `server/src/services/defectPrecheck.js` —— 执行项 ①（A 的 **C-1**，收口 round 2 的 R4）

**行数：189 → 171（−18 净；4 增 / 21 删）**　｜　`git diff --numstat` = `4  21`

| 动作 | 位置（改前，冻结树实测） | 内容 |
|---|---|---|
| **增** | `:18`（`import path` 之后） | `import { resolveProjectRoot } from './factExtractors/common.js';`（**唯一新增 import 边**） |
| **删** | `:44-49`（6 行） | 单行 JSDoc + `export function hasSourceFiles(dir)` 全体（**删前计数 = 2，删后 = 0**） |
| **删** | `:50`（1 行） | 两函数之间的分隔空行（随块删除，避免孤儿空行） |
| **删** | `:51-53`（3 行） | 私有 `resolveProjectRoot` 的 JSDoc |
| **删** | `:54-65`（12 行） | 私有 `resolveProjectRoot` 函数体 |
| **增** | 原 `:54` 位置 | 2 行溯源注释 + `export { resolveProjectRoot };`（**保持既有导出面**） |
| **保留** | `:42` → 新 `:43` | `const SRC_EXTS = new Set([...9 项...]);`（**未动**；新文件仍 3 处命中 = 1 声明 + `precheckProject` 内 2 处使用） |
| **保留** | `:189` → 新 `:170` | `export default { precheckProject, collectFiles, resolveProjectRoot };` **逐字节不变** |

**改后行号映射（关键锚点）**

| 改前 | 改后 | 内容 |
|---|---|---|
| `:16-17` | `:16-17` | `import fs` / `import path`（未动） |
| — | `:18` | **新增** `import { resolveProjectRoot } from './factExtractors/common.js';` |
| `:41-42` | `:42-43` | `SRC_EXTS` JSDoc + 声明 |
| `:44-65` | `:45-47` | （原 hasSourceFiles + 私有 resolveProjectRoot）→ 2 行注释 + `export { resolveProjectRoot };` |
| `:67` | `:49` | `extractRelativeImports` JSDoc |
| `:98` | `:80` | `precheckProject` 声明 |
| `:165` | `:147` | `resolveImportTarget` 声明 |
| `:176` | `:158` | `tryResolve` 声明 |
| `:189` | `:170` | `export default` |

**为什么**：全仓第 **3** 份 `resolveProjectRoot`；与 `common.js:325` 的单一实现在**探针形态上行为发散**（本报告 §2.4 实测，我自建的 13 夹具为 **9/13**、A 的报告为 8/13，差异原因已定位，见 §5.2）→ 潜在漂移源。`common.js` 只 `import node:fs / node:path`，**单向新边不造环**（§2.1 门禁实测 SCC 仍 0）。

**⚠️ 本项含已确认的行为变更 —— 见 §3 诚实声明。**

### 1.2 `server/src/services/ruleExecutor.js` —— 执行项 ②（A 的 **C-4**）+ 执行项 ③ 的第 ① 步

**行数：1023 → 1010（−13 净；5 增 / 18 删）**　｜　`git diff --numstat` = `5  18`

**(a) 删孤立 `SOURCE_EXTS` + 失效 JSDoc（A 的 C-4）**

| 动作 | 位置（改前实测） | 内容 |
|---|---|---|
| **删** | `:55`（1 行） | 块前空行（删后 `];` 与下一段 JSDoc **恰好 1 个空行**） |
| **删** | `:56-59`（4 行） | `/** … resolveProjectRoot 探测「子目录是否含源码」用 … */`（**注释已失效**：该函数 round 2 已搬走） |
| **删** | `:60-67`（8 行） | `export const SOURCE_EXTS = new Set([…37 项…]);` |
| **保留** | `:41` / `:69` / `:82`(→`:69`) | `RULE_TYPES` / `FACT_OPS` / `SKIP_DIRS`（未动） |
| **保留** | `:29` | round 2 的 `export { resolveProjectRoot };`（未动） |
| **保留** | 全文 | 未引 `ROOT_PROBE_EXTS`（各模块仍自持；`common.js` 那份才是唯一存留者） |

**删前自查（实测，非照抄）**：
- **本文件零读取**：`grep -cE '\bSOURCE_EXTS\b'` = **1**（全文只命中 `:60` 声明行）。
- **全仓零 import**：枚举全部 `from './ruleExecutor.js'` 导入面 —— `ruleMutator.js:39` `{runRules, resolveProjectRoot}` · `checkerService.js:35` `{validateRules, runRules, resolveProjectRoot}` · `projectGrading.js:30` `{runRules}` · `rule-executor.test.js:16`（import 块）· `rule-mutator.test.js:18` `{runRules}` → **均不含 SOURCE_EXTS**；`grep -rn 'SOURCE_EXTS' server/test` = **0 命中**；`import('…')` 动态导入扫描 = 0。
- **与 `common.js:277-284` 的 `ROOT_PROBE_EXTS` 逐字相同**：脚本内 order-sensitive 比对 = `true`，项数 **37**（前端 13 + 后端 15 + 脚本/数据/配置 9；与 round 2 C 的裁定一致，**A 曾报 43 为误计**）。

**(b) 给 5 个辅助函数加 `export`（A §3.3 建议改法 ① —— 执行项 ③ 的必备前置，仅加关键字）**

`:157`→**`:144`** `extOf` ｜ `:170`→**`:157`** `globToRegExp` ｜ `:181`→**`:168`** `collectFiles` ｜ `:212`→**`:199`** `resolveWithinRoot` ｜ `:225`→**`:212`** `readFileUtf8`

- `export function` 总数 **2 → 7**（原 `validateRules`/`runRules` + 新 5 个）。
- **零逻辑改动**：脚本逐函数断言「改后函数体（去掉 `export ` 前缀）== 改前函数体」**5/5 逐字节相同**。
- 反向断言：`clampScore`/`countMatches`/`execFileExists`/`executeItem`/`errorSummary` **仍是私有**（未被误导出）。
- 本项**不加任何 import 边**（同文件内加关键字）。

> **口径说明（与 A 的差异）**：A §3.2 预测「1023 → **1011**」。实测 **1010**。差额 **1 行**来自「块前空行」的处理：A 只删 `:56-67`（12 行），留下 `:55` 与 `:68` 两个连续空行；本实现连 `:55` 一并删除，使 `RULE_TYPES` 的 `];` 与 `SKIP_DIRS` 的 JSDoc 之间保持**恰好 1 个空行**（与文件其余段落的风格一致）。**对门禁零影响**（GodFile 10 不变、观察带 19 不变、边数不变）。

### 1.3 `server/src/services/ruleMutator.js` —— 执行项 ③（A 的 **C-5-a**）

**行数：727 → 642（−85 净；1 增 / 86 删）**　｜　`git diff --numstat` = `1  86`

| 动作 | 位置（改前实测） | 内容 |
|---|---|---|
| **改** | `:39` | `import { runRules, resolveProjectRoot } from './ruleExecutor.js';` → `import { collectFiles, extOf, globToRegExp, readFileUtf8, resolveWithinRoot, runRules, resolveProjectRoot } from './ruleExecutor.js';`（**同一行，扩名单，不新增边**） |
| **删** | `:46-48`（3 行） | 本地 `SKIP_DIRS` JSDoc + 声明 + 空行 → **死代码，一并删除**（理由见下） |
| **删** | `:79`（1 行） | 已失效的 banner `// ==================== 内部工具（与 ruleExecutor 同语义，本模块自包含） ====================`（「本模块自包含」在删副本后为假陈述） |
| **删** | `:80`（1 行） | banner 后的空行 |
| **删** | `:81-108`（28 行） | `collectFiles`（JSDoc + 函数）—— **与 `ruleExecutor.js:181-203` 函数体逐字节相同** |
| **删** | `:109-120`（12 行） | `extOf` —— 逐字节相同 |
| **删** | `:121-132`（12 行） | `globToRegExp` —— 逐字节相同 |
| **删** | `:133-146`（14 行） | `resolveWithinRoot` —— 逐字节相同 |
| **删** | `:147-159`（13 行） | `readFileUtf8` —— **仅写法差异**（见 §2.5 对拍） |
| **删** | `:160`（1 行） | 块尾空行 |
| **保留** | `:44` / `:50` / `:53` / `:62-77` | `MUTATION_PLACEHOLDER` / 本地 `SOURCE_EXTS`（7 项，仍是**语义不同**的独立常量） / `CHECKABLE_EXTS` / `FACT_MUTATION` —— 全部仍有消费者 |
| **保留** | `:167`→`:82` | `writeFileUtf8`（**不在 5 组去重名单内**，5 处调用） |
| **保留** | `:181`→`:96` | `matchingFiles`（★ 它调用 `resolveWithinRoot`/`globToRegExp`/`collectFiles` → 5 个名字在本文件**都有活调用点**） |
| **保留** | `:502`→`:417` / `:668`→`:583` | 导出面 `mutateVariant` / `validateNegativeTests` **逐字节未动** |

**删后调用点复核（5 个名字全部改由 import 提供，全部真实存在）**

| 函数 | 改后调用行号 | 处数 |
|---|---|---|
| `collectFiles` | `:103`（`matchingFiles` 内）、`:148`（`deleteFilesContaining` 内） | 2 |
| `extOf` | `:149`、`:309`、`:317` | 3 |
| `globToRegExp` | `:102`（`matchingFiles` 内） | 1 |
| `resolveWithinRoot` | `:100`、`:173`、`:208`、`:229`、`:260`、`:491`、`:510` | 7 |
| `readFileUtf8` | `:210`、`:231`、`:262`、`:314`、`:512` | 5 |

**★ A §5 局限 7 的指定复查项：删 `collectFiles` 后本地 `SKIP_DIRS` 是否成为死代码？**
→ **是，已删除**。实测消费者全集 = `{JSDoc 提及 :46, 声明 :47, `collectFiles` 体内 :99}`，后两者随副本一并删除；**其余全文 0 消费者**（脚本内 `post-sim` 断言在写文件前先预演 = 0）。
**理由（为何删而非保留）**：① 它在本文件**零消费者**，保留即「孤立的重复常量」—— **正是本轮 C-1/C-4 要消灭的病理**，留着与两项执行项自相矛盾；② `common.js:21` 已有**逐字节相同**的 `export const SKIP_DIRS`，将来谁再需要 `collectFiles` 只需 import 它，常量不需要本地副本；③ 删除**不新增边、不改导出面、不碰任何调用点**。
**保留的 3 个常量（给出不删的理由）**：`SOURCE_EXTS`（7 项，**与 `common.js` 的 9 项语义不同**，`deleteFilesContaining` 仍在用）· `CHECKABLE_EXTS`（7 项，3 处调用）· `FACT_MUTATION`（`mutateFact` 在用）。

> **口径说明（与 A 的差异）**：A §3.3 预测「727 → **约 692**」。实测 **642**（−85）。差额 **−50** 的构成：`SKIP_DIRS` 3 行 + 内部工具 banner 及其后空行 2 行 + 块尾空行 1 行 = 6 行（A 未纳入其预测），其余来自 A 的逐项行数相加未含各处 JSDoc/空行的完整口径。**对门禁零影响**（642 仍 **< 800**，GodFile 10 不变；仍 **> 500**，观察带 19 不变）。

---

## 2 自证证据（命令 + 原始输出）

### 2.0 方法声明：**按符号操作，不按行号整块删**

A §3.4-5 明令「执行项 1 必须按符号操作」。本轮的实现是更严的形态 —— **锚点字符串替换**：

- 每个待删块写成**完整的原文片段**（含 JSDoc 与闭括号），脚本先断言该片段在文件中**恰好出现 1 次**（`split(old).length - 1 === 1`），否则**立即 `exit 1` 且不写任何文件**；
- 行号**只用于报告的改前/改后映射**，不参与删除决策 → 天然免疫 A §5.4 警告的「照抄行号切片会产出语法坏树」；
- 删除前先断言的**内容锚点**（全部通过）：`hasSourceFiles` 计数 = 2；`SOURCE_EXTS` 块含 `export const SOURCE_EXTS = new Set([` 与 `resolveProjectRoot 探测` 两个锚点且与 `ROOT_PROBE_EXTS` 逐字相同；`resolveProjectRoot` 私有实现的 15 行原文；5 个副本的 JSDoc 首行与闭括号。

脚本：`/tmp/b3-fix2.mjs`（执行项 1+2+3，**50 条断言全过**）、`/tmp/b3-fix3.mjs`（执行项 ③①：加 `export`，**18 条断言全过**）、`/tmp/b3-verify.mjs`（成品独立复核，**62 条断言全过**，见 §2.7）。

### 2.1 四个门禁 —— **全部 PASS**

```bash
$ node scripts/gates/cycle-check.mjs
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 164 条相对导入边
  强连通分量（|SCC|>1）: 0（基线 1）
  自环（文件 import 自身）: 0
结论：PASS                                    # exit=0

$ node server/scripts/check-layers.mjs
文件 71 个，违规 0 条（0 类规则），未分层待迁移 47 个      # exit=0

$ node scripts/gates/arch-metrics.mjs
架构门禁
  ✓ layerViolations    基线=0  实测=0
  ✓ unmigrated         基线=47  实测=47
  ✓ godfileOver800     基线=10  实测=10
  · >500 行（观察带，不计判据） 基线=19 实测=19
  GodFile >800 行：client/src/views/student/Submit.vue (1519) / server/src/services/checkerService.js (1280) /
    server/src/controllers/teacherController.js (1233) / client/src/views/Doc.vue (1106) /
    server/src/services/deepseek.js (1051) / server/src/services/ruleExecutor.js (1011) / …（共 10 个）
结论：PASS                                    # exit=0

$ node scripts/gates/hard-metrics.mjs
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
  参考：非 style.css 的 CSS 中 !important = 20（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）
结论：PASS                                    # exit=0
```

| 判据 | 基线（4b531b8） | round 3 后 | 结论 |
|---|---|---|---|
| cycle-check：文件 / **边** / **SCC** / 自环 | 71 / **163** / 0 / 0 | 71 / **164** / **0** / **0** | ✅ **+1 边为预期增量**（`defectPrecheck.js → factExtractors/common.js`，执行项 ①）；**SCC 仍 0** |
| check-layers：文件 / 违规 / 未分层 | 71 / 0 / 47 | 71 / 0 / **47** | ✅ 三个数字不变（零新文件） |
| arch-metrics | 0 / 47 / 10（+19 观察带） | 0 / 47 / 10（+19） | ✅ 全等；`ruleExecutor.js` 行数标注 1023 → **1011**（注：该脚本自身的行数口径为 1011，见 §5.3） |
| hard-metrics | 0 / 0 / 0 | 0 / 0 / 0 | ✅ 本轮零 CSS/`.vue` 改动 |

> **执行项 ②③「不得加边」已实测成立**：`ruleExecutor.js` 的 import 规格符数量改前/改后**相同**（脚本断言）；`ruleMutator.js` 的 `from './ruleExecutor.js'` 本就是既有边，只扩名单。**164 − 163 = 1，唯一增量来自执行项 ①**。

### 2.2 文件数不变

```bash
$ find server/src client/src -type f | wc -l
146                     # 改前 146，改后 146 —— 零新增文件（unmigrated 47 的硬前提）
```

### 2.3 三个文件的行数前后对比

```bash
$ wc -l server/src/services/defectPrecheck.js server/src/services/ruleExecutor.js server/src/services/ruleMutator.js
     172  ← 注：此为「折叠双空行」之前的中间态；最终值见下行
$ wc -l …（最终）
     171 server/src/services/defectPrecheck.js
    1010 server/src/services/ruleExecutor.js
     642 server/src/services/ruleMutator.js
$ wc -l /tmp/b3-before/server/src/services/{defectPrecheck,ruleExecutor,ruleMutator}.js     # 冻结 4b531b8
     189 / 1023 / 727
$ git diff --numstat -- server/src
4       21      server/src/services/defectPrecheck.js
5       18      server/src/services/ruleExecutor.js
1       86      server/src/services/ruleMutator.js
```

| 文件 | 改前 | 改后 | Δ | A 的预测 | 差异原因 |
|---|---|---|---|---|---|
| `defectPrecheck.js` | 189 | **171** | −18 | ≈175 | 溯源注释取 **2 行 + 1 行再导出**（A 预估 3 行注释 + 1 行再导出 = 175；差 4 行） |
| `ruleExecutor.js` | 1023 | **1010** | −13 | ≈1011 | 连「块前空行」一并删除，避免双空行（§1.2 口径说明） |
| `ruleMutator.js` | 727 | **642** | −85 | ≈692 | `SKIP_DIRS` 3 行 + banner 2 行 + 块尾空行 1 行 = 6 行（A 未纳入）+ 逐项相加口径（§1.3 口径说明） |

### 2.4 执行项 ① —— 漂移收敛（**含已确认的行为变更**）

```bash
$ node /tmp/b3-drift.mjs "<repo>"
--- resolveProjectRoot: 13 synthetic probes (before 4b531b8 vs after live) ---
  #  fixture              before                after                 same
  A  A-vue-only           MyApp                 MyApp                 true     ← 测试覆盖的唯一形态
  B  B-go-only            B-go-only             proj                  false
  C  C-html-only          C-html-only           proj                  false
  D  D-json-only          D-json-only           proj                  false
  E  E-pkgjson-only       E-pkgjson-only        proj                  false
  F  F-readme-only        F-readme-only         F-readme-only         true
  G  G-dist               dist                  G-dist                false
  H  H-target             target                H-target              false
  I  I-root-pkgjson       src                   I-root-pkgjson        false
  J  J-root-pom           src                   J-root-pom            false
  K  K-java-only          proj                  proj                  true
  L  L-py-only            proj                  proj                  true
  M  M-skipdir-only       node_modules          M-skipdir-only        false
DIVERGENT (resolveProjectRoot): 9 / 13
```

**★ 与 A 的口径差异（诚实登记）**：A 报 **8/13**，我自建的 13 夹具实测 **9/13**。差异**不是分歧**，而是 **夹具 M 的构造深度不同**：
- A 的用例 M（「唯一子目录被 SKIP_DIRS 跳过」）**根下那唯一的子目录是空的** → `before` 与 `common` **都给 `.`**（两条实现都「不下钻」）→ A 计为**同**；
- 我的夹具 M 在 `node_modules/` 内**放了一个 `x.js`** → `before`（私有版**不滤 SKIP_DIRS**）**下钻进 `node_modules`**，`common`（滤 SKIP_DIRS）**返回根** → 计为**异**。
- 我的构造**才真正触发** A §2.1(b) 根因 2「子目录枚举未过滤 SKIP_DIRS」。**两者结论方向一致**：私有实现与 `common.js` 存在**实质性语义分歧**，且分歧面**不窄于** A 的估计。

**★ 把「13 个定点夹具」扩展为「200 棵随机树」的独立证据（`/tmp/b3-fuzz.mjs`）**：

```
random trees sampled        : 200
BEFORE (private copy) != common.js : 22 / 200
AFTER  (imported)     != common.js : 0 / 200   <- 必须为 0（收敛）
sample divergences (before vs common):
   {"dir":"t4","before":"t4","common":"dist_0"}
   {"dir":"t20","before":"dist_0","common":"t20"}
   {"dir":"t29","before":"node_modules_0","common":"t29"}
   {"dir":"t32","before":"t32","common":"proj_0"}
CONVERGED: after ≡ common.js on all 200 random trees
```

→ 「漂移」不是人造夹具的巧合（**11% 的随机工程树**上两份实现给出不同工程根）；改动后**逐棵收敛到 `common.js`**（0/200）。

### 2.5 执行项 ③ —— `readFileUtf8` 对拍（A §5 局限 6 的指定补证）

A 明言「readFileUtf8 仅**写法差异**（**人工判读，未做自动化语义对拍**）」，并要求 B 自建对拍。**已做，结论 = 等价**：

```bash
$ node /tmp/b3-readfile-probe.mjs "<repo>"
--- sliced mutator impl (1-based 153..159) ---
function readFileUtf8(absPath) {
  try {
    return { ok: true, content: fs.readFileSync(absPath, 'utf8') };      ← 内联写法
  } catch (err) {
    return { ok: false, error: (err && err.code) || (err && err.message) || String(err) };
  }
}
--- sliced executor impl (1-based 225..232) ---
function readFileUtf8(absPath) {
  try {
    const content = fs.readFileSync(absPath, 'utf8');                    ← 多一个中间变量
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: (err && err.code) || (err && err.message) || String(err) };   ← catch 分支逐字节相同
  }
}
SAME | regular utf8 file        | mut=ok content.len=14 | exe=ok content.len=14
SAME | empty file               | mut=ok content.len=0  | exe=ok content.len=0
SAME | ascii file               | mut=ok content.len=3  | exe=ok content.len=3
SAME | large source file        | mut=ok content.len=35615 | exe=ok content.len=35615
SAME | directory (EISDIR)       | mut=not-ok error="EISDIR" | exe=not-ok error="EISDIR"
SAME | nested directory         | mut=not-ok error="EISDIR" | exe=not-ok error="EISDIR"
SAME | nonexistent (ENOENT)     | mut=not-ok error="ENOENT" | exe=not-ok error="ENOENT"
SAME | nonexistent in real repo | mut=not-ok error="ENOENT" | exe=not-ok error="ENOENT"
SAME | empty string path        | mut=not-ok error="ENOENT" | exe=not-ok error="ENOENT"
SAME | root dir                 | mut=not-ok error="EISDIR" | exe=not-ok error="EISDIR"
SAME | unreadable (EACCES)      | mut=not-ok error="EPERM"  | exe=not-ok error="EPERM"
SAME | symlink -> dir           | mut=not-ok error="EISDIR" | exe=not-ok error="EISDIR"

cases=12 pass=12 fail=0
EQUIVALENT: ruleMutator.readFileUtf8 ≡ ruleExecutor.readFileUtf8 (byte-identical returns)
```

**方法说明（为何这不是循环论证）**：两个实现由脚本**从源码逐字切片**（非手工重打）成独立 `data:` 模块后再调用，**不是**「拿改后文件自证改后文件」。覆盖 4 类成功态（UTF-8 多字节 / 空文件 / ASCII / 35 KB 源码）与 5 类失败态（`ENOENT` / `EISDIR` / `EPERM` / 空路径 / 指向目录的符号链接），**返回值 JSON 逐字节相等 + 键集相等**。
**必须登记的限制**：未覆盖「文件在 `readFileSync` 之前被删除」的 TOCTOU 竞态与 GBK 等非 UTF-8 字节序列 —— 但两者落入**完全相同的同一行 `fs.readFileSync` 调用**，差异只可能在 catch 之后，而 catch 分支**逐字节相同**，故该限制**不构成反驳**（见 §4-R2）。

### 2.6 执行项 ③ —— ruleMutator 端到端行为对拍（冻结树 vs 活树）

```bash
$ node /tmp/b3-mut-behavior.mjs "<repo>"
--- mutateVariant 逐规则类型对拍（冻结 4b531b8 vs 活树） ---
  SAME  mutateVariant:fe    {"ok":true} || tree=58e7a172…aeed
  SAME  mutateVariant:dcf   {"ok":true} || tree=7bd0f9b6…1cf9
  SAME  mutateVariant:ct    {"ok":true} || tree=4a48dbe5…1280
  SAME  mutateVariant:cr    {"ok":true} || tree=e3a7118b…e2b3
  SAME  mutateVariant:creg  {"ok":true} || tree=d8281481…e036
  SAME  mutateVariant:fc    {"ok":false,"reason":"匹配文件数 < min（标准包上规则本不应通过）"} || tree=c59d92dc…b2f
  SAME  mutateVariant:sc    {"ok":true} || tree=51408754…0f04
  SAME  mutateVariant:fvr   {"ok":true} || tree=6ca549fe…31e7
  SAME  mutateVariant:fpi   {"ok":true} || tree=98327cb8…5db79
  SAME  mutateVariant:fcr   {"ok":true} || tree=51278ddb…2ceb5c
  SAME  mutateVariant:fdep  {"ok":true} || tree=2d943a97…3f809
--- validateNegativeTests 对拍 ---
  before: {"covered":10,"skipped":[],"weakRules":[],"variantsRun":10}
  after : {"covered":10,"skipped":[],"weakRules":[],"variantsRun":10}
  SAME: true
cases=12 diff=0
BEHAVIOR IDENTICAL: ruleMutator (before) ≡ ruleMutator (after)
```

**判据**：12 个用例的**返回值 JSON** 与**派生变体工程的文件树 sha256 指纹**（相对路径 + 逐文件内容哈希，递归、跳过隐藏项与 `SKIP_DIRS`）**全部相等**。5 个被去重的辅助函数正好是这条链路的全部路径工具 → 覆盖 `mutateVariant` 全部 8 种 `rule_type` 分支 + `validateNegativeTests` 的并发池路径。

### 2.7 成品独立复核（`/tmp/b3-verify.mjs`，**在最终活树上重跑，不依赖改动脚本自述**）

```
=== 1. defectPrecheck.js ===      live 171 / frozen 189
  ok hasSourceFiles 完全消失（删前 2）              [0]
  ok 本文件不再声明 resolveProjectRoot              [0]
  ok 新增再导出恰好 1 处 / 新增 import 恰好 1 处     [1 / 1]
  ok SRC_EXTS 声明保留；SRC_EXTS 3 处（1 声明 + 2 使用）
  ok 末尾 default export 逐字保留
  ok precheckProject / resolveImportTarget / tryResolve 命中数与改前相同
  ok 无三连换行（无多余空行）
=== 2. ruleExecutor.js ===        live 1010 / frozen 1023
  ok SOURCE_EXTS 归零 [0] ｜ 未误引 ROOT_PROBE_EXTS [0]
  ok 5 个函数「已导出且恰好 1 处」+「声明仍恰好 1 处（未重复）」×5
  ok export function 总数 == 7 ｜ RULE_TYPES / FACT_OPS / round 2 再导出面保留
  ok import 边数与改前相同（未新增边）[1 vs 1]
  ok 5 个函数体与改前逐字相同（仅加 export 关键字）×5
=== 3. ruleMutator.js ===         live 642 / frozen 727
  ok 本地副本 collectFiles / extOf / globToRegExp / resolveWithinRoot / readFileUtf8 已删除 ×5
  ok import 名单已合并（7 个名字）｜ 本地 SKIP_DIRS 已删除 ｜ CHECKABLE_EXTS / SOURCE_EXTS 保留
  ok writeFileUtf8 / matchingFiles 保留（未被误删）
  ok mutateVariant / validateNegativeTests 导出面保留 ｜ 无三连换行
  ok 保留函数体与改前逐字相同 ×6（writeFileUtf8/matchingFiles/removeDeps/deleteFilesContaining/mutateFact/runOneVariant）
=== 4. 全仓符号面 ===
  server/src 现存 SOURCE_EXTS 命中：
    server/src/services/factExtractors/common.js:32, :132, :268, :276
    server/src/services/ruleMutator.js:47（本地 7 项常量，语义不同）, :149（使用）
  server/src 现存 hasSourceFiles 命中：（无）
ALL 62 VERIFY CHECKS PASSED
```

### 2.8 全量真实夹具对拍（**62/62 逐字节相等**）

```bash
$ node /tmp/b3-real-all.mjs "<repo>"
real submissions compared : 62          # server/uploads/project-submissions/353 下全部 62 个提交
byte-identical            : 62
DIFFERENT                 : 0
errors (either impl)      : 0
total issues found (pre)  : 59
ALL REAL FIXTURES BYTE-IDENTICAL (before ≡ after)
```

**A §3.5 指定的 3 个夹具（含 `projectRoot`/`fileCount`/`issues` 逐字节比对）也单独复现**：

```
1066  byte-equal=true  fileCount=29/29  issues=0/0  projectRoot-tail=UserManagement/UserManagement
1067  byte-equal=true  fileCount=29/29  issues=0/0  projectRoot-tail=UserManagement/UserManagement
1068  byte-equal=true  fileCount=27/27  issues=3/3  projectRoot-tail=UserManagement_副本/UserManagement_副本
=> ALL 3 REAL FIXTURES BYTE-IDENTICAL   # 与 A §3.5 的 29/29/0 与 27/3 完全一致
```

> 覆盖面从 A 的 **3 个**扩到 **62 个**全部真实提交（`stdDir` = `project-questions/353/standard`），**0 处差异、0 异常**。这是「**在真实数据形态上不回归**」的直接证据（但**不等于**「行为不变」，见 §3）。

### 2.9 导出面身份（运行时可证）

```
before.default keys = ["precheckProject","collectFiles","resolveProjectRoot"]
after.default  keys = ["precheckProject","collectFiles","resolveProjectRoot"]      ← 逐字不变
before.resolveProjectRoot === common.resolveProjectRoot : false                    ← 私有副本（漂移源）
after.resolveProjectRoot  === common.resolveProjectRoot : true                     ← ★ 身份统一
before.hasSourceFiles exported: true | after.hasSourceFiles exported: undefined    ← ★ 唯一消失的导出
```

### 2.10 定向单测自检（允许且要求；**未跑全量回归** —— 那是 C 的职责）

```bash
$ cd server && DATABASE_URL=<派生自 server/.env，库名替换为 exam_system_test> \
    NODE_OPTIONS=--experimental-vm-modules npx --no-install jest --config test/jest.config.js \
    --runInBand --forceExit test/unit/infrastructure/<suite>.test.js
```

| 套件 | 结果 | 例数 | 与本轮的关系 |
|---|---|---|---|
| `defect-precheck.test.js` | **PASS** | **5 passed / 5 total** | 执行项 ①的**直接护栏**（A/B/C 三组真实提交 + `scoreDefects` 折算） |
| `rule-executor.test.js` | **PASS** | **61 passed / 61 total** | 执行项 ②的直接护栏 + ③的调用方覆盖 |
| `rule-mutator.test.js` | **PASS** | **21 passed / 21 total** | 执行项 ③的**直接护栏**（含 BUG-A-03 嵌套工程回归用例） |
| **合计** | **3/3 PASS** | **87 passed / 0 failed** | 段 2/3/4 的**核心子集** |

> 三条 `Tests:` 摘要均无 `skipped` 字样 → 全部用例真的在跑（`defect-precheck` 的 `hasData` 守卫未跳过）。
> **未跑**：段 1 的 912 例与段 2 的 `fact-extractor` 17 例 → **全量 1011 的最终裁定归 Agent C**（§6）。
> 测试库派生方式见 `docs/pipeline/scripts/unblock-g2.sh` 第 1 步：只把库名换成 `exam_system_test`；实际连到 `localhost:3306/exam_system_test`（`test/setup.js` 白名单护栏未触发）。

### 2.11 改动面：恰好 3 个文件

```bash
$ git status --porcelain -uno
 M pipeline-status.md                          ← 会话开始前即为 M（Captain 的状态文件），B 未触碰
 M server/src/services/defectPrecheck.js
 M server/src/services/ruleExecutor.js
 M server/src/services/ruleMutator.js
```

**无任何 `.md` 被修改**（除本报告为**新建**）；`server/test/`、`tests/`、`client/dist`、`client/` **零变更**（§0）。

### 2.12 `node --check`（语法自证）

```bash
SYNTAX OK  server/src/services/defectPrecheck.js
SYNTAX OK  server/src/services/ruleExecutor.js
SYNTAX OK  server/src/services/ruleMutator.js
```

---

## 3 诚实声明：**执行项 ① 含行为变更（漂移收敛）+ 消费方为零**

> ⛔ **本节是本报告最重要的部分。任何下游引用都不得把执行项 ① 描述为「行为不变」。**

### 3.1 本次「统一」包含一次**已确认的行为变更**

- **变更面**：`defectPrecheck.js` 的 `resolveProjectRoot` 返回值在**部分输入形态上会改变**。
- **实测（我自建，13 夹具）**：**9/13 探针形态发散**（A 报 8/13，差异原因见 §2.4 —— 夹具 M 的构造深度不同，**我的构造更严，才真正触发 SKIP_DIRS 根因**）。
- **随机树实测（我自建，200 棵）**：改前私有实现与 `common.js` 在 **22/200（11%）** 的随机工程树上给出**不同的工程根**。
- **变更方向**：全部**朝 `common.js` 的 P0-1 修正语义收敛** —— ① 探测白名单由 **9 项**放宽到 **37 项**；② 子目录枚举**过滤 SKIP_DIRS**；③ 补上**根清单短路**（`pom.xml`/`package.json` 在根时不下钻）。**没有一项是「变坏」**，但**是变更**。
- **收敛性证明**：改后 `after.resolveProjectRoot === common.resolveProjectRoot`（**同一函数对象**，§2.9），且在 **200/200** 随机树上与 `common.js` 完全一致（§2.4）。也就是说：**变更面 = 改动前私有实现与 `common.js` 之间的全部差异**，无任何额外新增差异。
- **另一处导出面变更**：`hasSourceFiles` **不再导出**（`typeof before.hasSourceFiles === 'function'` → `'undefined'`）。理由：其**唯一调用点**是待删的私有 `resolveProjectRoot`；`common.js` **没有**同名函数（也未新增）；**全仓零 import**（`grep -rn 'hasSourceFiles' .` 除本文件与 `docs/` 外无命中；`server/test/` 只 `import { precheckProject }`）。**按符号操作要求，它是死代码，随函数一并删除。**

### 3.2 消费方为零 —— 证据

| 证据 | 命令 | 结果 |
|---|---|---|
| 全仓引用面 | `grep -rn 'defectPrecheck' server/src server/test client/src trustjudge-server` | **仅 3 类命中**：① 模块自身；② **它自己的单测** `server/test/unit/infrastructure/defect-precheck.test.js:9`（`import { precheckProject }`，**只 import 这一个名字**）；③ 无 |
| 设计文档点名的接线点 | `grep -n 'precheck\|defect' server/src/services/projectGrading.js` | **0 命中**（A §2.1(c) 已实证，本轮未复算但未发现反证） |
| 动态导入 | `grep -rn "import(" server/src` 过滤 `defect` | **0 命中**（`:80` 的命中是源码里的**字符串示例**） |
| 单测的 import 面 | `cat -n server/test/unit/infrastructure/defect-precheck.test.js \| head -10` | 只 import `{ precheckProject }` 与 `{ scoreDefects }` → **删 `hasSourceFiles` / 换 `resolveProjectRoot` 实现在 import 期与断言期都不会打断它** |

→ **`defectPrecheck.js` 在生产代码中零消费方**（288 行「未接线特性」的一半；A §2.1(c) 的 P6 拍板项）。因此本项的行为变更**对生产行为影响严格为 0**，其性质是「**无消费方模块的语义收敛**」——**为未来接线预置正确语义**。

### 3.3 一句话结论（供 Captain / C 直接引用）

> **执行项 ① = 漂移收敛（9/13 定型夹具 + 22/200 随机树的行为变更，全部朝 `common.js` 的 P0-1 修正语义）+ 消费方为零（生产代码 0 引用，仅被自身单测 import）**。**不得写成「行为不变」**；正确表述是「**无消费方模块的语义收敛**」。**62/62 真实夹具逐字节相等**说明「在真实数据形态上不回归」，但**不能**推出「所有输入形态上行为不变」。

---

## 4 未做项与原因

| # | 项 | 为何不做 |
|---|---|---|
| 1 | **把 `collectFiles` 全仓 3 份副本并为 1 份** | **A §3.4-7 明令超范围**（`ruleExecutor.collectFiles` / `common.collectAllFiles` / `defectPrecheck.collectFiles`）。本轮只做「ruleMutator 侧去重」。**登记 round 4+**：三者虽函数体相同，但**返回类型与语义域不同**（ruleExecutor/ruleMutator 返**绝对路径**、defectPrecheck 返**相对 posix 路径**、common 的 `collectAllFiles` 返绝对路径且滤 SKIP_DIRS），合并需设计判断 |
| 2 | **GodFile 拆分（10 个）** | 与 round 2 同结论（server 侧撞 `unmigrated ≤ 47` 门禁 `arch-metrics.mjs:63`；client 侧撞 constraints §2 视觉铁律）→ **拍板项 P1**。本轮执行集**不拆 GodFile**（A §3.4 明令） |
| 3 | **删除 288 行生产死代码**（`defectPrecheck.js` + `defectScoring.js`） | **会动 `server/test/`**（其测试 :9/:10 静态 import 二者）→ 1011 基线变约 1006、67 套件变 66 → **等于改动回归基线**；B 无权改 `server/test/` → **拍板项 P6** |
| 4 | **空 catch 7 处 / `console.log` 19 处** | A §2.2/§2.3 已裁定 7/7 保持静默、19 处零清理（前者改动 = 引入重复 toast / 改评分语义；后者 = 行为变更或不可验证）→ 本轮**零改动** |
| 5 | **其余 13 组跨文件重名函数** | **重名不等于重复实现**；本轮只做 A 指定的 `ruleExecutor ↔ ruleMutator` 一对。擅自断言会产出假结论（A §2.5 C-5-b） |
| 6 | **`common.js` 的 4 个零外部引用导出**（`EXT_LANGUAGE`/`MANIFEST_LANGUAGE`/`ROOT_PROBE_EXTS`/`collectAllFiles`） | A §2.4 已裁定「**不是新债**」（该模块此前已有 2 个同类，round 2 是沿既有风格）→ 不列为执行项 |
| 7 | **门禁脚本的「子串误报」加固**（C 在 test-round-02.md §8 优化② 提出） | A §4-10 登记不做（三个正则只会**过度命中** = 偏严，不放行真实违规；末轮改门禁本身有风险） |
| 8 | **未跑全量回归 / build / axe / 像素 sha1 / 服务** | **明令属 C 职责**，且本轮**零 client 改动** → 判据 5（无障碍）与像素判据**由构造不可能被影响**（无需证据） |
| 9 | **未把临时探针晋升为门禁脚本**（必改清单 G-4） | 本轮脚本仅用于自证；A §4-10 要求先加固自测。**脚本全部落 `/tmp`，未入仓** |
| 10 | **未更新 `pipeline-status.md`** | 该文件是 **Captain 的状态唯一入口**，B 不越权（A §3.4-1 明令不动任何 `.md`，本报告除外） |

---

## 5 遗留风险

| # | 风险 | 等级 | 处置建议 |
|---|---|---|---|
| **R1** | **`hasSourceFiles` 导出面消失**：若存在**未被我扫到的**消费方（动态拼接 import、外部运维脚本、测试装置之外的调用），会得到 `undefined` | 低 | 已三重反证（全仓 grep + 静态 import 面 + 动态 `import()` 扫描）。**A §2.1(c) 的「零引用」结论本轮独立复现**。若 C 有更强的调用面证据，回流 B |
| **R2** | `readFileUtf8` 对拍**未覆盖** TOCTOU 竞态与 GBK 等非 UTF-8 字节序列 | 低 | 二者落入**同一行 `fs.readFileSync`**，差异只可能在 catch 之后，而 catch 分支**逐字节相同** → 不构成反驳。若要极致，可在 C 侧加「非 UTF-8 字节序列」夹具 |
| **R3** | **执行项 ① 的行为变更**（9/13 定型 + 22/200 随机） | **低**（但**必须显式告知 C**） | **消费方为零** → 生产影响 0。**C 不得**因「`resolveProjectRoot` 返回值变了」判回归 —— 那是**预期收敛**。真实夹具 62/62 逐字节相等是「不回归」的正面证据 |
| **R4** | **cycle-check 边数 163 → 164** | **低（预期）** | **必须写入 C 的任务书**，否则会被误判为「新增循环依赖风险」。**SCC 必须仍为 0**（实测 0、自环 0） |
| **R5** | **A 的 3 处行数预测与实测不符**（175/1011/692 vs 实测 171/1010/642） | 低 | **以实测为准**。`arch-metrics` 的行数口径（`ruleExecutor.js` 显示 **1011**）与本报告 `wc -l`（**1010**）**相差 1** —— 该脚本按**换行符计数**且对**末行无换行**的处理不同，属**脚本口径**而非文件问题。**门禁结果 PASS、GodFile 计数 10 不变、观察带 19 不变**，与口径差无关 |
| **R6** | **A §5 局限 7 的指定复查已完成**：`ruleMutator` 本地 `SKIP_DIRS` 在删 `collectFiles` 后**零消费者** → **已删除**（理由见 §1.3） | 低 | 若 Captain 更倾向「保留不动」，可单点回退这 3 行（**与执行项 ③ 的其他部分解耦**） |
| **R7** | `ruleMutator.js` 仍 **642 行**（>500 观察带、<800 未越线）；`ruleExecutor.js` 仍 **1010 行**（>800，GodFile 之一） | 低 | GodFile 计数 **10 不变**（A §3.4-2 明令不拆）。`ruleExecutor.js` 仍是 10 个里的**最小者** |
| **R8** | **执行项 ③ 与 ①② 完全解耦**：若 Captain 判定末轮宜最小化，可**单独撤销执行项 ③**（回退 3 个文件中的 2 处：`ruleMutator.js` 的 1 删 1 改 + `ruleExecutor.js` 的 5 处加关键字）而不影响 ①（A §3.3 可裁剪性） | 低 | 撤销时须**同时**回退两处，否则 `ruleMutator` 会因 import 不存在的名字而 **SyntaxError**（本轮曾精确撞到这个陷阱，见 §7 复盘） |

---

## 6 给 Agent C 的验证指引

### 6.1 ★ 必须先接受的两个**预期值**（防止假回归）

| 项 | 基线 | **round 3 预期** | 说明 |
|---|---|---|---|
| `cycle-check` 的**边数** | 163 | **164** | **唯一门禁增量**：执行项 ① 新增 1 条 `server/src/services/defectPrecheck.js → server/src/services/factExtractors/common.js` 边。**不是回归**。执行项 ②③ **不加边**（实测 `ruleExecutor` 的 import 规格符数不变；`ruleMutator` 只扩既有边的名单） |
| `cycle-check` 的 **SCC** | 0 | **必须仍为 0** | 同时确认 **自环 = 0**、**文件数 = 71** |

### 6.2 静态门禁复跑（可立即执行，本轮已自证）

```bash
node scripts/gates/cycle-check.mjs        # 71 文件 / 164 边 / SCC 0 / 自环 0   ← 三个数字都要对上
node server/scripts/check-layers.mjs      # 71 / 违规 0 / 未分层 47（不得变）
node scripts/gates/arch-metrics.mjs       # 0 / 47 / 10（+19 观察带）PASS
node scripts/gates/hard-metrics.mjs       # 0 / 0 / 0 PASS
find server/src client/src -type f | wc -l   # 146（不得变）
git status --porcelain -uno                  # 恰好 3 个 M（+ pipeline-status.md）
```

### 6.3 后端全量回归（**本轮主判据**）

```bash
ROUND=03 bash docs/pipeline/scripts/unblock-g2.sh      # 或 cd server && DATABASE_URL="…exam_system_test" npm test
```

| 项 | 期望 | 说明 |
|---|---|---|
| 日志中 `Test Suites:` 摘要出现次数 | **4 处** | 少于 4 处 = 仍有短路（四段用 `&&` 串联） |
| 段 1 / 段 2 / 段 3 / 段 4 | 912 / **17** / **61** / **21** | 段 2/3/4 = 本轮改动链路 |
| 合计 | **1011 passed / 0 failed** | **`failed > 0` 即回流 B** |
| `defect-precheck` 5 例 | **必须真的在跑**（无 `skipped`） | 它是执行项 ①的**唯一直接护栏**（`hasData` 守卫依赖 `server/uploads/project-submissions/353/1068/1` 存在 —— 实测存在） |
| `rule-mutator` 21 例 | 含 **BUG-A-03**（嵌套单子目录工程） | 执行项 ③ 的直接护栏 |

⚠️ 未指向 `exam_system_test` 时 `test/setup.js:35,52` 护栏会**立即 exit 1 且不打印任何 jest 摘要** —— 那不是崩溃。

### 6.4 反证清单（改了就该变 / 不该变的就别变）

```bash
# ── 执行项 ① ──
grep -c 'hasSourceFiles' server/src/services/defectPrecheck.js            # → 0
grep -c 'export function resolveProjectRoot' server/src/services/defectPrecheck.js   # → 0
grep -c 'export { resolveProjectRoot };' server/src/services/defectPrecheck.js       # → 1
grep -c "from './factExtractors/common.js'" server/src/services/defectPrecheck.js    # → 1
grep -c 'SRC_EXTS' server/src/services/defectPrecheck.js                  # → 3（1 声明 + 2 使用；注意  对 SRC_EXTS 无效）
tail -1 server/src/services/defectPrecheck.js                             # → export default { precheckProject, collectFiles, resolveProjectRoot };

# ── 执行项 ② ──
grep -c 'SOURCE_EXTS' server/src/services/ruleExecutor.js                 # → 0
grep -c 'ROOT_PROBE_EXTS' server/src/services/ruleExecutor.js             # → 0（各模块自持，未互相引用）
grep -cE '^export function ' server/src/services/ruleExecutor.js          # → 7（validateRules/runRules + 新 5 个）
grep -n 'export { resolveProjectRoot };' server/src/services/ruleExecutor.js        # → :29 仍在

# ── 执行项 ③ ──
grep -c 'SKIP_DIRS' server/src/services/ruleMutator.js                    # → 0（死代码已删）
for fn in collectFiles extOf globToRegExp resolveWithinRoot readFileUtf8; do
  echo -n "$fn: "; grep -c "^function $fn" server/src/services/ruleMutator.js; done   # → 全 0（本地副本已删）
grep -n "from './ruleExecutor.js'" server/src/services/ruleMutator.js     # → :39（7 个名字，同一行）

# ── 全仓 ──
grep -rn 'hasSourceFiles' server/src client/src                          # → 0 命中
grep -rn 'SOURCE_EXTS' server/src --include='*.js'                         # → 仅 common.js:32/:132/:268/:276 与 ruleMutator.js:47/:149
```

### 6.5 复现 B 的对拍证据（可选，脚本全在 `/tmp`，**未入仓、不影响仓库**）

```bash
node /tmp/b3-verify.mjs      "<repo>"   # 62 条成品静态复核断言（期望 ALL PASSED）
node /tmp/b3-drift.mjs       "<repo>"   # 13 定型夹具漂移（期望 9/13）+ 3 真实夹具逐字节相等
node /tmp/b3-fuzz.mjs        "<repo>"   # 200 棵随机树（期望 before 22/200、after 0/200）
node /tmp/b3-real-all.mjs    "<repo>"   # 62 个真实提交（期望 62/62 byte-identical）
node /tmp/b3-readfile-probe.mjs "<repo>" # readFileUtf8 12 用例（期望 12/12 EQUIVALENT）
node /tmp/b3-mut-behavior.mjs   "<repo>" # ruleMutator 端到端（期望 12 cases diff=0）
```
> `/tmp/b3-before` 是 `git archive 4b531b8` 的冻结副本（1013 文件），**含两个指向仓库 `server/node_modules` 的只读符号链接**（仅为让冻结副本可 `import` tree-sitter，**未写仓库**）。若 `/tmp` 已被清理，对拍脚本会失败 —— 重建：`rm -rf /tmp/b3-before && mkdir -p /tmp/b3-before && git archive 4b531b8 | tar -x -C /tmp/b3-before && ln -s "<repo>/server/node_modules" /tmp/b3-before/server/node_modules`。

### 6.6 本轮**不需要**的验证（由构造排除）

- **axe / 像素 sha1 / 4 组主题像素全等**：本轮**零 `client/` 改动、零 `.vue`、零 CSS** → **不可能引入新的 axe 违规或视觉变化**。判据 5 的达标性沿用 round 2 的 V7/V8。
- **不得重建 `client/dist`**、不得重跑 `ledger-check.mjs --out=raw/ledger.json`、不得回写引用 `index-CHwIlsxa` 的运行时快照。
- **不得改 `server/test/`**：若某套件因本轮改动失败，**回流 B**，不得改测试掩盖。

---

## 7 复盘：本轮撞到并修正的一个真实陷阱（供后续轮次复用）

**陷阱**：执行项 ③ 是一个**三文件原子改动**（加 export / 删副本 / 并 import），但 A §3.3 把它写在**两个文件**名下。我第一遍只做了「删副本 + 并 import」，**漏了「在 `ruleExecutor.js` 加 export」**，并用 `node --check` 自证「SYNTAX OK」—— **`node --check` 不解析 import 绑定，因此漏检**。

**发现方式**：行为对拍脚本 `import` 活树的 `ruleMutator.js` 时抛出
```
SyntaxError: The requested module './ruleExecutor.js' does not provide an export named 'collectFiles'
```
—— **是「运行期对拍」而不是「静态语法检查」抓到的**。

**教训（写入后续轮次的验证配方）**：
1. **`node --check` 不足以验证 ESM 改动** —— 涉及跨模块符号时必须**真 import 一次**（`node -e "import('…').then(…)"`）。
2. **「删除副本」必须与「提供导出」同批提交**，否则模块在 **import 期**整体炸掉（比运行期错误更严重：会让整个 jest 套件在加载阶段失败而**看不到任何断言**）。
3. 本轮的 `/tmp/b3-verify.mjs` 因此把「**导出的符号在消费侧可 import**」也纳入断言面，并在 §2.6 用端到端对拍**复证**。

---

## 8 唯一写入声明

本轮 Agent B 在仓库内**只写 4 个路径**：3 个执行目标（`server/src/services/defectPrecheck.js` / `ruleExecutor.js` / `ruleMutator.js`）+ 本报告 `docs/pipeline/refactor-round-03.md`（**新建**）。

**未执行任何 git 写操作**（无 add/commit/checkout/restore/stash/clean）；**未跑全量回归**（只跑 3 个定向套件）；**未构建**；**未启动任何服务**；**未触碰** `:5173`/`:3000`、`client/dist`、`tests/`、`server/test/`、任何 `.md`（本报告除外）。

临时脚本与数据全部落 `/tmp`，**未入仓**：
`/tmp/b3-fix2.mjs`（锚点替换器，50 断言）· `/tmp/b3-fix3.mjs`（加 export，18 断言）· `/tmp/b3-verify.mjs`（成品独立复核，62 断言）· `/tmp/b3-drift.mjs`（13 定型夹具漂移）· `/tmp/b3-fuzz.mjs`（200 随机树）· `/tmp/b3-real-all.mjs`（62 真实提交）· `/tmp/b3-readfile-probe.mjs`（readFileUtf8 对拍）· `/tmp/b3-mut-behavior.mjs`（ruleMutator 端到端对拍）· `/tmp/b3-derive.cjs`（测试库 URL 派生）· 冻结副本 `/tmp/b3-before`（1013 文件 + 2 个只读符号链接）。

---

*本报告由 Agent B（`tech-code-refactoring`）于 round 3 产出。*
