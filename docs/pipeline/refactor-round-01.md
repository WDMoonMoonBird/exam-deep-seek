# refactor-round-01 —— 定点修复报告（流水线第 1 轮）

> 轮次：**01（定点修复）** ｜ 日期：2026-10-10（夜）｜ 基线 commit：`ac608310ca2934d28cc23bb9e6ae8dfdaa713ad0`（tag `ui-redesign-freeze-2026-10-10.5`，与 `pipeline-status.md` 的 `anchor_commit: ac60831` 一致）
> Agent B 技能：`tech-code-refactoring` ｜ 上游输入：`docs/pipeline/audit-round-01.md`（§6 执行集 + §9 边界条件）、`docs/pipeline/project-constraints.md`
> 执行集：**2 个文件 / 本轮预算 8 个，余 6** —— 仅 `server/package.json`、`client/src/styles/tokens.css`
> 方法：**按令牌名定位（不按行号）**；改动前用自研独立扫描器建基线，改动后用**同一扫描器 + Agent A 的权威扫描器**双重复核；临时脚本全部落 `/tmp`，未入仓。

---

## 0 约束遵守声明

| 约束（constraints §1/§2） | 执行情况 |
|---|---|
| 禁止 `git clean|stash|checkout -- .|reset --hard|restore .` | ✅ 全部未执行；全程只读 `git rev-parse` / `git status` / `git diff` / `git archive` |
| 不碰 `:5173` / `:3000` / worker | ✅ 未启动、未重启、未 kill 任何进程；未占用任何端口 |
| 不改 `client/dist` | ✅ 未读未写（像素比对由 C 用私有 dist 副本） |
| 不改 `tests/` | ✅ 只读扫描（用于评估夹具风险），零写入 |
| 不发真实外部 API / 不写生产库 | ✅ 未发起任何网络或 DB 操作 |
| 不改清单（§2） | ✅ `antd-theme.js` / `legacy-patch.css` / 任何 `.vue` / 字号字面量 / hex 全部未动 |
| 本轮不跑 jest（C 职责） | ✅ 未执行任何 jest 命令 |
| 不跑 vite build / 不启动服务 | ✅ 未执行 |
| 唯一写者 | ✅ 仅写 3 个文件：2 个执行目标 + 本报告 |

---

## 1 改动文件清单

### 1.1 `server/package.json` —— BUG-A-01 收口（对应 A **§6.1 执行项 1**）

**改了什么**（`scripts.test` 单行内 2 个点，其他一字未动）：

| # | 位置 | 改动前 | 改动后 |
|---|---|---|---|
| ① | 段 1 的忽略正则 | `--testPathIgnorePatterns=\"(fact-extractor|rule-executor)\"` | `--testPathIgnorePatterns=\"(fact-extractor|rule-executor|rule-mutator)\"` |
| ② | 行尾追加第 4 段 | （无） | ` && NODE_OPTIONS=--experimental-vm-modules jest --config test/jest.config.js --runInBand --forceExit test/unit/infrastructure/rule-mutator.test.js` |

**为什么**：`test/unit/infrastructure/rule-mutator.test.js:18` 顶层 `import { runRules } from '../../../src/services/ruleExecutor.js'`，而 `ruleExecutor.js` 顶层加载 `tree-sitter`（native 模块）——与已拆的 `fact-extractor` / `rule-executor` 同机理；三段用 `&&` 串联，段 1 一红即短路 → 段 2/3 **从未被执行**，「全绿」一直是残缺结论。

**本轮独立复核（不采信 A 的结论）**：

```bash
cd server && find test -name '*.test.js' | wc -l          # → 67
cd server && find test -name '*.test.js' | grep -c 'rule-mutator'   # → 1（唯一命中，无第二命中）
cat server/test/jest.config.js                            # → 只有 testMatch，无第二处 ignore 规则
```

**未动项（逐条比对确认）**：其余脚本 `dev` / `start` / `worker` / `pretest` / `test:unit` / `check:layers` / `test:integration` / `test:e2e` 全部保持原值；`dependencies` = 25 条、`devDependencies` = 5 条，无任何版本改动。
**段数**：3 → **4**；段 1 预期用例 933 − 21 = **912**。

### 1.2 `client/src/styles/tokens.css` —— A 组 44 令牌清理（对应 A **§6.2 执行项 2**）

**改了什么**：删除 A 组 **44 个令牌 / 46 个声明点**。其中 **20 行整行删除**、**16 行改行**（同行其余令牌原样保留，仅收敛空白）。

| 指标 | 改动前（ac60831） | 改动后 | 差 |
|---|---|---|---|
| 文件总行数 | 451 | **431** | −20 |
| 含声明的行数（行锚定 `grep -c`） | 280 | **260** | −20 |
| 声明点合计（含同行多条） | 381 | **335** | **−46** |
| 去重令牌数 | 296 | **252** | **−44** |

**为什么**：A §4.3 判据三条（① 在 `tokens.css` 有声明 ② 全仓库除自身声明外零任何文本出现 ③ 无动态拼接）。本轮**未采信 A 的引用结论，自行独立复算**：

```bash
# A 组 44 令牌在活源内的提及次数
grep -rEo -- '(--gray-700|--brand-100|…|--btn-danger-bg-hover)([^-a-zA-Z0-9_]|$)' client/src | wc -l      # → 0
grep -rEo -- '(--gray-700|…|--btn-danger-bg-hover)([^-a-zA-Z0-9_]|$)' server/src trustjudge-server | wc -l # → 0
node /tmp/b1-scan.mjs   # 独立扫描器（var() + 引号形态 + 对象式 :style 键，全仓 7189 个文本文件）
                        # → A sites=46（改动前）/ A tokens with PRODUCT refs = 0
```

**删除后 A 组的提及面（穷举，全部为「非活源」）**：

| 位置 | 提及数 | 性质 |
|---|---|---|
| `client/src` / `server/src` / `trustjudge-server` | **0** | ✅ 活源零残留 |
| `docs/ui-redesign/02-design-tokens.css` | 46 | 设计侧镜像的**声明**（本轮按边界⑤不动该文件） |
| `docs/ui-redesign/03-components.md:110` | 1 | ⚠️ 设计契约提及 → 见 §4.3 |
| `tests/` 下 17 个文件 | 各 44–46 | **冻结历史证据**（`src-before/src-after` 快照、`dist-before/dist-after` 产物、`ledger.json` 归档）→ 见 §7.3 |
| `docs/pipeline/*.md` | — | 元文档（A 报告 + 本报告本身提到令牌名），非引用 |

---

## 2 与 A §9 八条边界条件的逐条对照（违反即本轮作废）

| # | 边界条件 | 执行 |
|---|---|---|
| ① | 严格按令牌名删，不按行号整块删；`--fs-*` 保留、`--space-*` 只删 0 与 16 | ✅ 删除器以**令牌名 Set 查表**定位，逐行解析声明，不依赖行号。命中 44/44、46 声明点。6 个成对 `--fs-*` 全保留（`--fs-display-1/2`、`--fs-title-2/3`、`--fs-body-lg/body-sm`，现 79/80/82/83/84/86 行）；`--space-1/2/3/10/12` 保留，仅删 `--space-0` 与 `--space-16` |
| ② | `--bg-inverse-2` 必须 3 处同删 | ✅ 3/3：实质行 **190 / 253 / 408**（去重计数 x3），亮/暗对称性保持 |
| ③ | B 组 61 个一个都不许碰 | ✅ 61/61 声明仍在，B 组声明点 **69 → 69 不变**；逐名核对 missing = 无。与 A 组易混的近名对（`--btn-default-bg` vs `--btn-default-bg-hover`、`--btn-text-fg-hover` vs `--btn-text-fg`、`--btn-danger-bg-hover` vs `--btn-danger-bg`、`--table-bg` vs `--table-header-bg`）全部按名精确区分 |
| ④ | 不重建 dist / 不改字号 hex / 不重排 / 不引新令牌 / `--chart-*` 只删声明保留注释 | ✅ 未读未写 `client/dist`；无 hex、字号、顺序改动。**实测澄清**：设计注释 `/* 图表 / 可视化顺序色 */` 在**独立行 241**（不在 242/243 声明行上），脚本按「只删声明」处理 → 注释**原样保留**（现 238 行），仅 5 条 `--chart-N` 声明消失 |
| ⑤ | 不动 `antd-theme.js` / `legacy-patch.css` / 任何 `.vue` | ✅ `git status --porcelain -uno` 仅 2 个文件被修改（见 §3.5） |
| ⑥ | 不得重建 `client/dist` | ✅ 未执行任何构建 |
| ⑦ | 改完必须自证（A 组应为 0；hex/`!important` 不变） | ✅ §3.1 / §3.2 |
| ⑧ | 改完必须回报行号映射 | ✅ §8（36 行逐行映射 + 新行号） |

**唯一一处「注释随声明消失」（主动申报）**：第 190 行 `--bg-inverse-2: var(--gray-900);    /* 深色侧栏 hover / 分组 */` —— 该行是**单声明 + 同行尾注**，尾注只描述这一个被删令牌本身。按「只删声明」的字面要求会留下一条无所指的孤立注释，故随整行删除。**这是本轮唯一被移除的注释文本**；块级设计注释（如 §注释块、`/* 图表 / 可视化顺序色 */`）一处未动。如需保留该尾注，可在 round 2 一并裁定（属可逆改动）。

---

## 3 自证证据（命令 + 输出）

### 3.1 硬指标门禁 —— **PASS**

```bash
$ node scripts/gates/hard-metrics.mjs
硬指标门禁（去注释口径）
样本：client/src/style.css + client/src/**/*.vue (去块注释)，共 41 个文件
  ✓ hex6          基线=0  实测=0
  ✓ important     基线=0  实测=0
  ✓ modalConfirm  基线=0  实测=0
  参考：非 style.css 的 CSS 中 !important = 20（legacy-patch 19 + tokens.css 1，按设计使用，不计违规）
结论：PASS            # exit=0
```

### 3.2 A 组扫描归零（自研扫描器，改动前/后同一支）

```bash
$ node /tmp/b1-scan.mjs
# 改动前：tokens.css: decl sites=381 distinct=296 | A sites=46 | B sites=69 | B names present=61/61
#          A tokens with PRODUCT/CLIENT refs = 0        | --bg-inverse-2 sites = [190,253,408]
# 改动后：tokens.css: decl sites=335 distinct=252 | A sites=0  | B sites=69 | B names present=61/61
#          A tokens with PRODUCT/CLIENT refs = 0

$ grep -rEo -- '(--gray-700|--brand-100|…|--btn-danger-bg-hover)([^-a-zA-Z0-9_]|$)' client/src | wc -l   # → 0
$ grep -nE '^\s*--(gray-700|…|btn-danger-bg-hover)\s*:' client/src/styles/tokens.css ; echo $?          # → 1（零声明残留）
```

**扫描器口径**：定义 = 去块注释后的 `--x:` 形态；引用 = `var(--x)` **＋** 任意引号形态 `'--x'` / `"--x"` / 反引号 **＋** 对象式 `:style` 的非引号键 `--x:`；范围 = 全仓 7189 个文本文件，排除 `node_modules` / `.git` / `dist`；另以词边界 `(?![-\w$])` 防前缀误配（`--btn-default-bg` 不会命中 `--btn-default-bg-hover`）。本轮**未复用** Agent A 的 `/tmp/a1f-authoritative.mjs`，为独立实现。

### 3.3 B 组完好

```bash
$ node /tmp/b1-bcheck.mjs
B 组名单长度 = 61
B 组在 tokens.css 的声明点数 = 69（改动前同为 69）
B 组缺失令牌 = 无（61/61 全在）
```

### 3.4 `server/package.json` 合法性 + 旁证未动

```bash
$ node -e "JSON.parse(require('fs').readFileSync('server/package.json','utf8'))"   # → 无异常
$ node /tmp/b1-json.mjs
package.json JSON OK
scripts keys = dev, start, worker, test, pretest, test:unit, check:layers, test:integration, test:e2e
test segments = 4
  seg1: --testPathIgnorePatterns="(fact-extractor|rule-executor|rule-mutator)"
  seg2: … fact-extractor.test.js     seg3: … rule-executor.test.js     seg4: … rule-mutator.test.js
deps count = 25, devDeps count = 5
```

### 3.5 改动面确认（只有 2 个被跟踪文件发生变化）

```bash
$ git status --porcelain --untracked-files=no
 M client/src/styles/tokens.css
 M server/package.json

$ git diff --stat
 client/src/styles/tokens.css | 52 +++++++++++++------------------------------
 server/package.json          |  2 +-
 2 files changed, 17 insertions(+), 37 deletions(-)      # 16 改行 + 20 删行 = 36 删；16 改行 = 16 增
```

### 3.6 交叉复核 —— 用 **Agent A 自己的权威扫描器**跑「改动后」冻结树

为避免读到活工作树（constraints §3 陷阱 7），把改动后的 2 个文件**叠加**到 `git archive ac60831` 的副本上再扫：

```bash
rm -rf /tmp/b1-post && mkdir -p /tmp/b1-post && git archive ac60831 | tar -x -C /tmp/b1-post
cp client/src/styles/tokens.css server/package.json → /tmp/b1-post/（同路径）
sed 's#/tmp/a1-freeze#/tmp/b1-post#' /tmp/a1f-authoritative.mjs > /tmp/b1-a1f-post.mjs
$ node /tmp/b1-a1f-post.mjs
runtime tokens.css declarations = 252
A = declared&NEVER referenced anywhere (pure dead): 0        ← 满足 A §9-7「A 组应为 0」
# 改动前: A=44  B=61  C=191  declared=296
# 改动后: A= 0  B=64  C=188  declared=252
# 旧 A 组仍被判为 A 的 = 0 ｜ 落入 C(有产品引用) 的 = 0 ｜ 落入 B 的 = 0    ← 44 个令牌彻底退场，无残留重分类
```

### 3.7 反证：边界条件①的成对令牌未被误删

```bash
$ grep -n -- '--fs-display-1' client/src/styles/tokens.css      # → 79:  --fs-display-1: 32px;   （--lh-display-1 已删）
$ grep -rn -- 'var(--fs-display-1)' client/src | wc -l          # → 2（仍被引用，删除它会改视觉）
```

---

## 4 本轮新发现（**超出执行集，只登记不改动**）

### 4.1 ⚠️ A 报告 §4.3/§6.2 的「tokens.css 声明行号」是**去注释文本的行号**，不是文件行号

实测：以 A 的 `/tmp/a1f-authoritative.mjs:18` 的 `stripCss`（把整段 `/*…*/` 替换为**单个空格**，连带吃掉注释内的换行）复算行号，**44/44 精确复现 A 表格的每一个数字**（18/25/33/36/37/38/41/46/47/55/56/58/59/60/62/72/74/78/115/132/160/209/210/220/269/272/274/276/294/318–323/373），而**真实文件行号全部不同**（45/52/60/63/64/65/68/73/74/82/83/85/86/87/89/99/101/105/143/160/190/242/243/253/304/307/309/311/329/353–358/408）。

```
A tokens: 44   report==comment-stripped: 44   report==real: 0   neither: 0
stripped total line count = 416   real = 452
```

**结论**：① 印证了 A §9-2「按令牌名删，不按行号整块删」与 §8-9「行号仅作辅助」——本轮正是按名删除，未受此影响；② **A 的令牌集合（A44/B61）不受影响，仍然可信**——已复核 `/tmp/a1-freeze/client/src/styles/tokens.css` 与活树 `cmp` **完全一致**（451 行），冻结副本无漂移；③ **后续轮次（含 C）不得使用 A 报告的行号定位 tokens.css**，请改用本报告 §8 的真实行号映射或令牌名。

### 4.2 删除引发 A/B/C 口径位移：**B 组 61 → 64**（3 个新孤儿，机制已证）

删除 `--chart-1..5` 的声明时，其**值里的 `var()` 引用**一并消失。对 3 个令牌而言那是它们**唯一**的产品侧引用：

| 迁移令牌 | 此前唯一引用来源（已删行） | 现状态 |
|---|---|---|
| `--amber-500` | `--chart-3: var(--amber-500);` | 仍声明，落入 B 组 |
| `--green-500` | `--chart-2: var(--green-500);` | 仍声明，落入 B 组 |
| `--violet-500` | `--chart-4: var(--violet-500);` | 仍声明，落入 B 组 |

（同批 `--chart-1: var(--brand-500)` / `--chart-5: var(--gray-500)` 的 `--brand-500`/`--gray-500` 另有引用，仍留在 C 组 ✅ 与实测一致。）

**运行时影响 = 0**：自定义属性在「声明它的元素」上做 `var()` 替换，而这些声明**本身无消费方**（A 组判据），替换从未发生 → 无计算值变化。但**口径会变**：

| 口径 | 改动前 | 改动后 |
|---|---|---|
| A（可删） | 44 | **0** |
| B（存疑，待 round 2 裁定） | 61 | **64** |
| C（有产品引用） | 191 | 188 |
| tokens.css 声明令牌数 | 296 | 252 |

**→ round 2 裁定 B 组时必须以 64 为基线（61 + 上述 3 个新孤儿），不要按 61 复算，否则会误判为「多出 3 个未知令牌」。**

### 4.3 ⚠️ `--btn-default-bg` 在设计契约里有书面提及 —— A 的扫描器对此形态是盲区

```bash
$ grep -n -- '--btn-default-bg' docs/ui-redesign/03-components.md
110:| **③ 尺寸 / 变体** | … **default**（次要，`--btn-default-bg/-bd`）、…
```

该处写作 %%BT%`--btn-default-bg/-bd``（**一个反引号跨区内两个令牌用 `/` 连接**），因此：
- A 的 `quoted` 正则 `(['\"`])(--x)\1` 要求闭合引号**紧跟**令牌 → 此处后面是 `/-bd``，不匹配；
- A 的 `unqkey` 正则要求令牌后跟冒号 → 不匹配；
→ 该令牌被判为「连 docs 反引号提及都没有」的 A 组，但**它实际出现在已发布的设计契约表里**，且与 A 归入 B 组的 `--btn-default-bd` 同处一句。

**判定**：这是 A 组 44 中**唯一**一个不满足 A 自述判据 ② 的令牌（44 中 43 个成立）。它**不构成运行时风险**（产品引用确为 0），但按 A §4.4「B 组不得删除的理由 1：删除 = 设计文档与实现对不上」的同一把尺子，它更接近 B 组。
**本轮处理**：**按 A §6.2 的 44 个名单原样执行**（名单是本轮授权边界，且 C 的验收口径就是「44 个全部无残留」）；不擅自回填、不改 `03-components.md`（不在 2 文件预算内，且属冻结设计文档）。**提交 round 2 裁定**：二选一 —— ① 恢复该声明；② 把 `03-components.md:110` 的 %%BT%`--btn-default-bg/-bd`` 修订为 %%BT%`--btn-default-bd``。

### 4.4 台账「75」的最可能出处已定位（A §4.2 遗留的口径之谜，部分闭合）

`tests/ui-redesign-verify/verify-batch3/lib/ledger-check.mjs` 的 **R-29** 分节用一支**朴素口径**复算零引用令牌：
- 声明侧：`/^\s*(--[a-z0-9-]+)\s*:/gmi` —— **行锚定**，每行只取第 1 条声明 → 只数到 **220** 个名字（实际 296），**76 个「同行第 2+ 位」令牌对它完全不可见**；
- 引用侧：`allText.split('var(' + n)` —— 只认 `var()`，且只扫 `client/src`。

```
ledger.json R29.tokens = 220        R29.zeroRef.length = 77
zeroRef ⊆ (A∪B) = 76 / 77          zeroRef 中不在 A∪B 的 = ["--radius-xl"]
A∪B(105) 中不在 zeroRef 的 = 29 个 —— 经核对全部是「同行第 2+ 位」令牌（--green-100 / --lh-* / --chart-2,3,5 / --tag-*-bg / --z-sider …）
```

**登记为最可能出处而非定论**：得数 **77** 与台账 **75** 相差 2 条，未能精确复现，故不下结论。但「口径不可复现」的**机制**已给出：该方法的行锚定正则会**系统性漏掉同行第 2+ 条声明**、且只认 `var()` 一种引用形态。→ 建议 round 2 以 A 的 A∪B=105 为权威口径（与本轮一致），台账 75 仅作历史记录。

---

## 5 未做的事与原因

| 未做 | 原因 |
|---|---|
| 未跑 jest / 未跑全量回归 | 本轮任务明令禁止，是 Agent C 的职责（§7.1 给出精确口径） |
| 未跑 `vite build` / 未重建 `client/dist` | constraints §1 硬禁令；像素比对由 C 用私有 dist 副本 |
| 未跑 axe / 未做像素 sha1 | C 职责；本轮「零视觉变化」是**基于 CSS 自定义属性语义的静态推断**，不是像素证据 |
| 未启动/重启任何服务，未占用 :5173 / :3000 | constraints §1 |
| 未做任何 git 写操作（add/commit/checkout/restore） | 任务硬约束：提交由 Captain 在 C 验证通过后统一执行 |
| 未改 `docs/ui-redesign/02-design-tokens.css`（设计侧镜像） | 不在 2 文件预算内；边界⑤明令不动 |
| 未改 `docs/ui-redesign/03-components.md` | 同上；见 §4.3，属 round 2 裁定 |
| 未裁定 B 组 61 个令牌 | A §4.4 明确「本轮一律不动」，留给 round 2 |
| 未处理 `experiment-variance.test.js` 同进程污染、`--ink-muted`、循环依赖 F-1、M-1/M-2 axe | 均属 A §7 后续轮次候选（本轮只列不做） |
| 未把临时扫描器晋升为门禁脚本（G-4） | A §8-10 要求先加固自测；本轮脚本仅用于自证 |

---

## 6 遗留风险

| # | 风险 | 等级 | 处置建议 |
|---|---|---|---|
| R1 | **产物资产文件名哈希必然变化** —— `tokens.css` 内容变了，构建后 `index-*.css` 的 content hash 会变（实测 `tests/` 里的历史产物的 hash 与本轮无关）。若 C 用「asset 文件名/字节哈希」判回归会得到**假阳性** | 中 | 按 constraints §3-4：**像素 sha1 为主判据**；勿用字节/文件名哈希。另：不得覆盖 `client/dist` |
| R2 | `tests/ui-redesign-verify/verify-batch3/raw/ledger.json` 是 `ledger-check.mjs --out=` 的**输出归档**（不是输入夹具，无脚本读它做断言） | 低 | **C 不要重跑 `ledger-check.mjs --out=raw/ledger.json`** —— 会覆盖历史证据（且 R29.zeroRef 会从 77 降到约 33）。若要复核请输出到 `/tmp` |
| R3 | B 组基线位移 61 → **64**（§4.2） | 中 | round 2 以 64 为基线；把 3 个新孤儿 `--amber-500`/`--green-500`/`--violet-500` 直接并入裁定表 |
| R4 | `--btn-default-bg` 的 1 处设计文档漂移（§4.3） | 低 | round 2 与设计侧对齐后二选一（恢复声明 / 修订文档） |
| R5 | A 报告行号不可用于 tokens.css 定位（§4.1） | 中 | 用 §8 的真实行号映射或令牌名；A 报告 §4.3/§6.2 表请按 §4.1 修正后再进入后续轮次上下文 |
| R6 | `--chart-1..5` 的设计意图已从实现移除（设计侧镜像仍保留） | 低 | 若将来需要图表色，从 `docs/ui-redesign/02-design-tokens.css` 回填；当前零消费，无运行时影响 |
| R7 | 删除的 44 个令牌若被「祖先注入、后代消费」式动态引用（constraints §3 陷阱 6）则不可见 | 低 | 已证产品代码 `setProperty` = 0 处、模板拼接 = 0 处、对象式 `:style` 仅 2 处且均为非 A 令牌（`--page-max` / `--slide-dir`）；且 A 组在 `client/src` 内**任何文本形态**的提及数 = 0（含注释） |

---

## 7 给 Agent C 的验证指引

### 7.1 后端全量回归（本轮改动的**主判据**）

```bash
bash docs/pipeline/scripts/unblock-g2.sh        # 或：cd server && DATABASE_URL="mysql://…:3306/exam_system_test" npm test
```

**该看的数字**：

| 项 | 期望 | 说明 |
|---|---|---|
| 日志中 `Test Suites:` 摘要出现次数 | **4 处** | 修复前只有 **1 处**（段 1 一红即短路）。**少于 4 处 = 修复未生效或仍有短路，直接回报 B** |
| 段 1（ignore 三套件的主体） | 912 例全绿 | = baseline 933 − rule-mutator 21 |
| 段 2 / 段 3 / 段 4 | 17 / 61 / **21** | 段 4 为本轮**新增** |
| 合计 | **1011 passed / 0 failed** | 与 constraints §4「全量口径 = 1011 例 / 67 套件」对齐 |
| 底线 | failed ≤ 13（baseline），目标 **0** | > baseline 即回归 → 回流 B |

⚠️ 两个坑：① `pretest` 会先跑 `check-layers.mjs`；② 未指向 `exam_system_test` 时 `test/setup.js` 的白名单护栏会立即 exit 1 且**不打印任何 jest 摘要**——那不是崩溃。
若段 1 仍红：先确认红例是否落在 `rule-mutator.test.js`（是 → 正则未命中/拆进程未生效，回报 B；否 → 另案排查）。

### 7.2 前端静态复核（可立即跑，本轮已自证通过）

```bash
node scripts/gates/hard-metrics.mjs        # → PASS：hex6=0 / important=0 / modalConfirm=0
node /tmp/b1-scan.mjs                      # → A sites=0 | B sites=69 | B names present=61/61 | A product refs=0
node /tmp/b1-bcheck.mjs                    # → B 组缺失令牌 = 无（61/61 全在）
node /tmp/b1-a1f-post.mjs                  # → A=0（Agent A 权威口径，跑在 /tmp/b1-post 冻结叠加树）
node -e "JSON.parse(require('fs').readFileSync('server/package.json','utf8'))"   # → 无异常
node server/scripts/check-layers.mjs       # → 违规 0 / 未分层 47（不增）
```

⚠️ **不要**直接跑 `node /tmp/a1f-authoritative.mjs` 来验证本轮改动 —— 它的 `ROOT` 硬编码在 `/tmp/a1-freeze`（= 改动**前**的 ac60831 快照），跑出来仍是 A=44。要验改动后用 `/tmp/b1-a1f-post.mjs`（ROOT=/tmp/b1-post）。

### 7.3 像素回归（零视觉变化判据）

- 4 组：**亮/暗 × 舒适/紧凑**，**像素 sha1 全部相等**（主判据）；
- **不要**用 asset 文件名哈希或 CSS 字节数（R1）；**不得**重建 `client/dist`，用 rig 的私有 dist 副本（`tests/ui-redesign-verify`，非 5173/3000）；
- **跑前先确认夹具口径**：`tests/t11|t12/{src-before,src-after}`、`tests/t11|t12/dist-{before,after}`、`tests/ui-redesign-verify/verify-batch1/dist-orig-dir`、`verify-batch3/raw/ledger.json` 共 17 个文件里出现 A 组令牌，**全部是冻结的历史证据/产物快照**（不是活消费方）。它们**不需要**、**也不应该**被同步修改。**这回答了 A §8-8 的悬置问题**：夹具中确有 A 组令牌，但均为历史归档，不影响像素比对。

### 7.4 门禁判据复核（constraints §5）

| 判据 | 达标线 | 本轮状态 |
|---|---|---|
| 分层违规 | 0，未分层不增（47） | 未复算（C 执行 `node server/scripts/check-layers.mjs`） |
| GodFile | >800 = 10 个；>500 = 19 个 | 本轮未动任何源码文件，**结构上不可能变化** |
| 硬指标 | hex6=0 / `!important`=0 / views `Modal.confirm`=0 | ✅ **PASS**（§3.1，本轮实测） |
| 后端回归 | failed ≤ 13（目标 0） | 待 C（§7.1） |
| 无障碍 | 不新增 axe 违规 | 本轮为纯测试编排 + 死令牌删除，**不新增任何 DOM/样式消费**，理论上零影响；C 可顺带确认 |

---

## 8 行号映射（A §9-8 要求：哪些行被删）

> 「原行号」= `ac60831` 活树/冻结副本的**真实**行号（**不是** A 报告 §4.3 的去注释行号，见 §4.1）。「新行号」= 改动后同一行的位置；删整行则无新行号。

| 原行号 | 动作 | 删除的令牌 | 新行号 |
|---|---|---|---|
| 45 | 删整行 | `--gray-700` | — |
| 52 | 删整行 | `--brand-100` | — |
| 60 | 删整行 | `--brand-900` | — |
| 63 | 改行 | `--green-100` | 60 |
| 64 | 改行 | `--green-400` | 61 |
| 65 | 改行 | `--green-900` | 62 |
| 68 | 改行 | `--amber-100` | 65 |
| 73 | 改行 | `--red-100` | 70 |
| 74 | 改行 | `--red-400` | 71 |
| 82 | 改行 | `--lh-display-1` | 79 |
| 83 | 改行 | `--lh-display-2` | 80 |
| 85 | 改行 | `--lh-title-2` | 82 |
| 86 | 改行 | `--lh-title-3` | 83 |
| 87 | 改行 | `--lh-body-lg` | 84 |
| 89 | 改行 | `--lh-body-sm` | 86 |
| 99 | 改行 | `--space-0` | 96 |
| 101 | 改行 | `--space-16` | 98 |
| 105 | 改行 | `--radius-2xl` | 102 |
| 143 | 改行 | `--z-base` `--z-sider` | 140 |
| 160 | 删整行 | `--layout-gutter` | — |
| 190 | 删整行 | `--bg-inverse-2` | — |
| 242 | 删整行 | `--chart-1` `--chart-2` `--chart-3` | — |
| 243 | 删整行 | `--chart-4` `--chart-5` | — |
| 253 | 删整行 | `--bg-inverse-2` | — |
| 304 | 删整行 | `--btn-default-bg` | — |
| 307 | 删整行 | `--btn-default-fg` | — |
| 309 | 删整行 | `--btn-text-fg-hover` | — |
| 311 | 删整行 | `--btn-danger-bg-hover` | — |
| 329 | 删整行 | `--table-bg` | — |
| 353 | 删整行 | `--tag-neutral-fg` `--tag-neutral-bg` | — |
| 354 | 删整行 | `--tag-brand-fg` `--tag-brand-bg` | — |
| 355 | 删整行 | `--tag-success-fg` `--tag-success-bg` | — |
| 356 | 删整行 | `--tag-warning-fg` `--tag-warning-bg` | — |
| 357 | 删整行 | `--tag-danger-fg` `--tag-danger-bg` | — |
| 358 | 删整行 | `--tag-accent-fg` `--tag-accent-bg` | — |
| 408 | 删整行 | `--bg-inverse-2` | — |

**合计**：删整行 **20** 行 + 改行 **16** 行 = 触及 36 行，共删除 **46** 个声明点 / **44** 个令牌（`--bg-inverse-2` 占 3 行）。文件 451 → **431** 行。

---

## 9 唯一写入声明

本轮 Agent B 在仓库内**只写 3 个文件**：

1. `server/package.json`（执行集 1）
2. `client/src/styles/tokens.css`（执行集 2）
3. `docs/pipeline/refactor-round-01.md`（本报告）

临时脚本全部落 `/tmp`，**未入仓**：`/tmp/b1-scan.mjs`（独立扫描器）、`/tmp/b1-del.mjs`（按名删除器，dry-run 默认，`--apply` 才写）、`/tmp/b1-bcheck.mjs`、`/tmp/b1-extent.mjs`、`/tmp/b1-json.mjs`、`/tmp/b1-classify.mjs`、`/tmp/b1-lineproof.mjs`、`/tmp/b1-moved.mjs`、`/tmp/b1-ledger.mjs`、`/tmp/b1-map.mjs`、`/tmp/b1-a1f-post.mjs`（A 扫描器的 ROOT 改指 `/tmp/b1-post`）+ 数据 `/tmp/b1-scan.json`、`/tmp/b1-del-map.json`、`/tmp/b1-a1f-final-post.json`。

未执行任何 git 写操作（无 add/commit/checkout/restore）；未跑 jest；未构建；未启动服务。

---

*本报告由 Agent B（`tech-code-refactoring`）于 round 1 产出。*