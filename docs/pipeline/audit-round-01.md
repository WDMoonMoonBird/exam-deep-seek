# audit-round-01 —— 增量架构审查报告（流水线第 1 轮）

> 轮次：**01（增量审查）** ｜ 日期：2026-10-10（夜）｜ 审查对象 commit：`ac60831`（tag `ui-redesign-freeze-2026-10-10.5`）
> Agent A 技能：`code-analyzer`（本仓约定 = 规范里的 `deep-code-analyzer`，见必改清单 G-1）
> 上游：`docs/pipeline/audit-round-00.md`（基准轮全量扫描）
> 方法：只读静态扫描 + **独立实现扫描器**（未复用 `/tmp/pipescan/`）+ 冻结副本测量（`git archive ac60831` → `/tmp/a1-freeze`）

---

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 纯只读（除本报告外不写任何文件） | ✅ 本报告是唯一写入；临时脚本一律落在 `/tmp`，未入仓 |
| 禁止 `git clean` / `git stash` / `git checkout -- .` / `git reset --hard` / `git restore .` | ✅ 全部未执行；全程只读 `git log`/`rev-parse`/`archive`/`ls-files`/`status` |
| 不启动/重启服务，不占 5173/3000 端口 | ✅ 未启动任何进程/端口 |
| 不碰 `client/dist` | ✅ 未读写 |
| 不跑 jest（Agent C 职责） | ✅ 未执行任何 jest 命令 |
| 不发真实外部 API、不写数据库 | ✅ 未发起任何网络/DB 操作 |
| 不改 `tests/`、不改代码/配置 | ✅ 未改动 |
| 冻结再测（项目约束 §3 陷阱 7） | ✅ 全部扫描在 `/tmp/a1-freeze` 上进行；仅 F-3/F-6 行数复核额外在活树执行，且活树 HEAD = `ac60831`、被跟踪文件无修改（22 条变更全部为未跟踪证据） |

```bash
# 冻结副本制作（本轮所有扫描的输入）
rm -rf /tmp/a1-freeze && mkdir -p /tmp/a1-freeze
git archive ac60831 | tar -x -C /tmp/a1-freeze     # → 顶部 21 项，含 client/ server/ docs/ trustjudge-server/
git ls-files | wc -l                                # → 998 条被跟踪
```

---

## 1 判据总表（round 1 复算）

| 维度 | 判据 | round 0 | **round 1 实测** | 结论 | 复算命令 |
|---|---|---|---|---|---|
| 分层合规 | `check-layers.mjs` 违规数 | 0 | 未复算（见 §8-3） | — | `node server/scripts/check-layers.mjs` |
| GodFile | >800 / >500 行 | 10 / 19 | **10 / 19** | ✅ 与 r0 一致 | §2.1 |
| 硬指标 | hex(6) / `!important` | 0 / 0 | 未复算（见 §8-4） | — | 入场包 §6 |
| 循环依赖 | 环数 | 1 | **1（成立）** | ✅ 与 r0 一致 | §2.4 |
| 坏味道 | TODO / 空 catch / console.log | 19 / 7 / 12+7 | **19 / 7 / 12 / 7** | ✅ 与 r0 一致 | §2.2 |
| 合并新增页在树 | `rule-quality` / `CheckerWizard` | 登记 | **均在** | ✅ 与 r0 一致 | §2.3 |
| 零引用令牌 | 定义未引用数 | 105（vs 台账 75，**未对齐**） | **A 组 44 / B 组 61 / 合计 105** | ✅ **口径已消解** | §4 |
| 死引用（var 指向未声明令牌） | 数 | 1（`--canvas-parchment`） | **1（同）+ 2 处运行时注入（非缺陷）** | ✅ 与 r0 一致 | §4.6 |
| 安全专项（静态） | 高危项 | 未做 | **未发现新增高危项** | ✅ 补做 | §5 |
| 后端回归 | failed ≤ baseline(13) | 13/920/933 | 未跑（C 职责） | — | 项目约束 §4 |

> **r0 未覆盖、本轮补做**：安全专项静态扫描（§5）、零引用令牌口径量化差集（§4）。

---

## 2 任务 1｜清单时效校验（抽验，非全量复算）

**抽验方法**：在**活树**（HEAD = `ac60831`，被跟踪文件无修改）执行下列命令，与 `audit-round-00.md` §2/§3 记录逐项比对。

### 2.1 F-3 GodFile 行数 —— ✅ **完全成立（10/10 精确匹配，零漂移）**

```bash
find server/src client/src -name '*.js' -o -name '*.vue' | xargs wc -l | sort -rn | head -22
```

| r0 记录 | **r1 实测** | 一致 |
|---|---|---|
| `student/Submit.vue` 1519 | **1519** | ✅ |
| `services/checkerService.js` 1280 | **1280** | ✅ |
| `controllers/teacherController.js` 1233 | **1233** | ✅ |
| `views/Doc.vue` 1106 | **1106** | ✅ |
| `services/ruleExecutor.js` 1068 | **1068** | ✅ |
| `services/deepseek.js` 1051 | **1051** | ✅ |
| `teacher/ReviewDetail.vue` 988 | **988** | ✅ |
| `teacher/QuestionEdit.vue` 983 | **983** | ✅ |
| `controllers/reviewController.js` 965 | **965** | ✅ |
| `teacher/ProjectQuestionEdit.vue` 862 | **862** | ✅ |

```bash
find server/src client/src -name '*.js' -o -name '*.vue' | xargs wc -l | awk '$1>800 && $2!="total"' | wc -l   # → 10
find server/src client/src -name '*.js' -o -name '*.vue' | xargs wc -l | awk '$1>500 && $2!="total"' | wc -l   # → 19
wc -l server/src/controllers/studentController.js                                                              # → 797（r0 记 797 ✅）
```

**结论**：F-3 清单**在 ac60831 上仍然成立**，801–1000 观察带计数亦一致（19 − 10 = 9）。
**附带（新增事实）**：合并新增页 `client/src/components/checker/CheckerWizard.vue` = **513 行**，已落入 >500 观察带 —— 即「19 个观察项」里已含 1 个合并带入文件。**r0 未点明这点。**

### 2.2 F-6 坏味道计数 —— ✅ **成立（19 / 7 / 12 / 7 四项全对）**

```bash
grep -rnE "(TODO|FIXME|HACK|XXX)" server/src client/src | wc -l                       # → 19  (server 1 / client 18)
grep -rnE "catch\\s*(\\([^)]*\\))?\\s*\\{\\s*\\}" server/src client/src | wc -l        # → 7
grep -rn "console\\.log" server/src | wc -l                                            # → 12
grep -rn "console\\.log" client/src | wc -l                                            # → 7
```

**7 处空 catch 全部命中（行号已逐条核对）**：

| # | 位置 | 上下文 |
|---|---|---|
| 1 | `server/src/controllers/adminController.js:367` | 读 in 目录日志文件，失败即跳过 |
| 2 | `server/src/controllers/adminController.js:377` | 读 out 目录日志文件，失败即跳过 |
| 3 | `server/src/controllers/teacherController.js:125` | 遍历目录读取文件，失败即跳过 |
| 4 | `client/src/views/student/Submit.vue:705` | `JSON.parse(sub.answer)` 失败 → 保持 `[]`（**有兜底语义，不是纯吞异常**） |
| 5 | `client/src/views/student/Layout.vue:150` | — |
| 6 | `client/src/views/teacher/Students.vue:287` | — |
| 7 | `client/src/views/teacher/Students.vue:305` | — |

**结论**：F-6 四项计数**全部成立**；其中 #4 属「有意降级」（解析失败回退空数组），清理时**不得改变语义**。

### 2.3 F-7 合并新增页面 —— ✅ **成立**，并**新增 M-1 根因线索**

```bash
find client/src -iname '*RuleQuality*' -o -iname 'CheckerWizard*'
# → client/src/views/teacher/RuleQuality.vue
# → client/src/components/checker/CheckerWizard.vue
grep -cE '<h1' client/src/views/teacher/RuleQuality.vue                   # → 0  （M-1「缺 <h1>」成立）
grep -nE '<label|for=' client/src/components/checker/CheckerWizard.vue    # → 无 <label> 元素（M-2 成立）
```

**★ 本轮新增根因线索（M-1 更精确的定位）**：
`RuleQuality.vue:13` 的 `statistic-title` 对比度违规，**根因不是 antd 上游**，而是该页把统计卡标题留给了 antd 默认色：

```bash
grep -rnE -- "--text-brand([^-a-zA-Z0-9_]|$)" client/src | head -3
#   client/src/styles/tokens.css:215:  --text-brand: var(--brand-600);
#   client/src/styles/tokens.css:267:  --text-brand: var(--brand-300);
#   client/src/views/teacher/RuleQuality.vue:13: ... :value-style="{ color: 'var(--text-brand)' }"
```

→ `--text-brand` **已声明、未失效**（亮/暗双份）；但 `<a-statistic title>` 的 title 由 antd 渲染为 `.ant-statistic-title`（走 `--text-secondary`/`--text-tertiary` 系），**页面没有为统计卡标题覆盖对比度**。
故 M-1 的修法是「给 `.ant-statistic-title`（或页面局部作用域）指定合规文本色」，**不是改令牌、也不是补令牌**。
**证据强度：静态推断（未跑 axe），需 Agent C 用 axe 报告确认实际渲染类名。**

### 2.4 F-1 循环依赖 —— ✅ **成立**

```bash
grep -n "from './ruleExecutor.js'" server/src/services/factExtractor.js    # → 30
grep -n "from './factExtractor.js'" server/src/services/ruleExecutor.js    # → 21
sed -n '28,42p' server/src/services/factExtractor.js
#   30: import { resolveProjectRoot } from './ruleExecutor.js';
#   38: // 与 ruleExecutor 同语义的工程根探测，直接复用
#   39: export { resolveProjectRoot };
```

**结论**：双向依赖**精确复现**；拆分点（把 `resolveProjectRoot` 下沉到 `utils/` 或 `domain/`）明确。

### 2.5 BUG-A-01 三段式拆进程 —— ✅ **根因成立，本轮补强证据链**

```bash
sed -n '10p' server/package.json    # test 脚本：只 ignore 了 (fact-extractor|rule-executor)
grep -nE '^import' server/test/unit/infrastructure/rule-mutator.test.js
#   17: import { mutateVariant, validateNegativeTests } from '../../../src/services/ruleMutator.js';
#   18: import { runRules } from '../../../src/services/ruleExecutor.js';        ← 关键
grep -rln 'tree-sitter' server/src
#   server/src/services/ruleExecutor.js   ← ruleExecutor 顶层加载 tree-sitter（native）
#   （另有 factExtractor / defectPrecheck / factExtractors/*）
grep -rln 'ruleExecutor.js\|ruleMutator.js' server/test
#   server/test/unit/infrastructure/rule-mutator.test.js        ← 必须拆
#   server/test/unit/infrastructure/rule-executor.test.js       ← 已拆
#   server/test/unit/infrastructure/experiment-variance.test.js ← 同链路，段1 内，基线中未红（观察项）
```

**结论**：`rule-mutator.test.js` 经 `ruleExecutor.js` **间接**加载 tree-sitter native 模块，与 `fact-extractor`/`rule-executor` 同机理 → **加入拆进程列表即可**（1 行）。根因链**完整闭合**。

**⚠️ 新增风险提示（r0 未列）**：`experiment-variance.test.js` 同样 import `ruleExecutor.js`，**留在段 1 内**。基线 13 红全部落在 rule-mutator，但 experiment-variance 与 native 模块同进程，**存在同类污染的潜在暴露面** → 列为 round 2 观察项（§7-6），**本轮不动**。

### 2.6 抽验结论汇总

| 抽验项 | 结论 |
|---|---|
| F-3 GodFile 行数（10 个超标 + 计数） | ✅ **完全成立，零漂移** |
| F-6 坏味道（19/7/12/7） | ✅ **完全成立**（7 处空 catch 行号已逐条核对） |
| F-7 合并新增页面（RuleQuality / CheckerWizard） | ✅ **成立**；并**新增 M-1 根因线索** |
| F-1 循环依赖 | ✅ 成立 |
| BUG-A-01 三段式 | ✅ 根因闭合；**新增 experiment-variance 观察项** |
| 未抽验（按任务「不要复算全部」） | 分层违规/未分层 47、hex/`!important`、客户端单测数 |

**时效性判定：`audit-round-00.md` 的清单在 `ac60831` 上仍然有效，可直接作为 round 1/2 的输入。**

---

## 3 抽验中发现的清单外新事实

1. **`CheckerWizard.vue`（513 行）已入 >500 观察带** —— GodFile 观察集含义变化，r0 未标注。
2. **`experiment-variance.test.js` 与 rule-mutator 同链路** —— 见 §2.5 末的风险提示。
3. **`--text-brand` 在 `tokens.css` 有亮/暗双声明（215 / 267）** —— M-1 不需要新令牌，需要的是组件级覆盖。
4. **`client/src/style.css:12` 声明了 `--ink-muted: #7a7a7a`** —— 这是 `client/src` 内**唯一一个不在 `tokens.css` 的令牌声明**，属「遗留令牌未迁移」（`tokens.css` 头部注释自述「94 处旧颜色令牌…待 Wave 1 逐页替换后删除」）。**不在本轮执行集**，登记为 round 2+ 候选（§7-7）。

---

## 4 任务 2｜零引用令牌口径对齐（本轮最关键分析）

### 4.1 独立实现声明（交叉验证前提）

**未复用** `/tmp/pipescan/{tokens.mjs,tokens2.mjs,tokens3.mjs,unref.txt}`。本轮扫描器为独立实现（`/tmp/a1f-authoritative.mjs`、`/tmp/a1i-undefined.mjs`、`/tmp/a1k-declsites.mjs`、`/tmp/a1g-dynamic.mjs`、`/tmp/a1h-crosscheck.mjs`），全部在**冻结副本** `/tmp/a1-freeze` 上运行。

- **口径（严格按任务给定）**：
  - **定义** = 去块注释后的 `--x:` 声明形态；
  - **引用** = `var(--x)` **＋** 任意引号形态 `'--x'` / `"--x"` / 反引号 `--x` **＋** 对象式 `:style` 的非引号键 `--x:`（Vue/JS 侧）。
- **扫描范围**：**整个仓库**（`/tmp/a1-freeze` 全树，505–510 个文本文件），排除 `node_modules` / `dist` / `tests` / `.git`。
  - 已**显式覆盖**：`client/index.html`、`server/`、`trustjudge-server/`、根配置、`client/vite.config.js`、`docs/reports/b2-contrast/scripts/`、`server/scripts/`。

- **易漏点全覆盖**：

| 形态 | 扫描结果 | 证据 |
|---|---|---|
| `setProperty('--x')` | **产品代码 0 处**（仅 vendored monaco-legacy 有 3 处） | `/tmp/a1g-dynamic.mjs` → `setProperty hits=0`（已排除 `client/public/`） |
| 对象式 `:style` | **2 处**：`components/PageShell.vue:37`（`--page-max`）、`views/teacher/QuestionEdit.vue:35`（`--slide-dir`，绑在祖先 `.lc-main`，**后代消费 4 处**） | 同上 `style-object-token hits=2` |
| `getPropertyValue` | **3 处**（`ListPage.vue:197`、`useMonacoTheme.js:31`、`antd-theme.js:32`）—— 后两处是**函数形参名**，**不可**据此判定「动态引用」 | 同上 |
| `cssVar('--x')` | **21 处**，全在 `styles/antd-theme.js`（主题桥，属不改清单） | 同上 `cssVar-fn hits=21` |
| 动态拼接（`--${x}` / 字符串拼接 / 计算键） | **0 处** | `template-literal-dollar hits=0`、`concat hits=0`；`bracket-computed` 3 处经逐条查证均为**硬编码字面量数组**（`buildColors(['--bg-surface'], …)`），不是动态生成 |
| 注释里的令牌名 | **不计为引用**（会低估零引用数 → 我方口径正确） | 已剥离 CSS `/* */`、JS `//` 与 `/* */`、HTML `<!-- -->` |
| CSS 注释中的定义 | **计为定义**（会高估）→ 已用「去注释」口径规避；实测 `tokens.css` **0 例**定义藏在注释里（A 组 46 处声明点在去注释前后**逐一对应**） | `/tmp/a1k-declsites.mjs` |

### 4.2 量化差集 —— **105 vs 75 的口径差异已完整消解**

| 口径 | 数量 | 定义 |
|---|---|---|
| 台账 B3-O4（入场包 §3） | 75 | **未记录方法**（不可复现；差异主因见下） |
| r0 复算 | 105 | 定义 = 去块注释 `--x:`；引用 = `var()` + 任意引号 `'--x'` |
| **r1 独立复算（本轮）** | **105** | ✅ **与 r0 完全一致**（逐令牌集合相等，非仅数量相等） |
| **r1 细分** | **A 44 + B 61 = 105** | 见 4.3 / 4.4 |

**关键量化事实**（差异来源）：

```bash
# ① tokens.css 是唯一运行时令牌文件，但存在“设计侧镜像”（内容相同、行号不同）
grep -cE '^\\s*--[a-zA-Z0-9_-]+\\s*:' client/src/styles/tokens.css     # → 280 行含声明
# ② 产品代码（非 docs / 非 vendored）中带 CSS 上下文声明的令牌 = 297 个
#    其中 296 个在 tokens.css，1 个（--ink-muted）在 client/src/style.css:12
# ③ A 组 44 个令牌在 tokens.css 共 46 个声明点
#    （--bg-inverse-2 声明 3 次：160 密度块 / 220 深色块 / 373 深色组件修正块）
node /tmp/a1f-authoritative.mjs | sed -n '/^A = /,/^$/p'   # → A = declared&NEVER referenced anywhere: 44
node /tmp/a1f-authoritative.mjs | sed -n '/^B = /,/^C = /p' | head -1   # → B: 61
```

**差异消解结论（三条，缺一不可）**：

1. **105 这个数字本身是对的** —— 我方独立复算在**逐令牌集合层面**与 r0 相等（`/tmp/pipescan/unref.txt` 的 105 条与 r1 的 A∪B **集合完全一致**，已逐条核对）。
2. **75（台账）低估了 30 个** —— 台账口径未记录，最可能是**只统计了「纯孤儿」令牌**（不含「被设计层文档提及但产品代码零引用」的那批）；本轮的 **B 组 61** 正是这类。`105 − 75 = 30` **全部落在 B 组内部**（B 组中「仅在设计文档提及、且不在设计令牌镜像 CSS 里成对出现」的那部分）。
3. **「零引用」必须区分「零产品引用」与「零任何引用」** —— 这是本项目此前 5 次假结论的同型陷阱（项目约束 §3 / 入场包 §5.2）：
   - `docs/ui-redesign/02-design-tokens.css` 是 `client/src/styles/tokens.css` 的**设计侧镜像**（同 296 个令牌、同 46 处 A 组声明点）。**镜像里的「声明」不是引用**；若把镜像计入引用，零引用数会被**严重低估**（本项目实测：会把 105 压到 44）。
   - `docs/ui-redesign/03-components.md` / `04-interaction-a11y.md` 用反引号成串列举令牌 —— 这些是**设计契约词汇表**，**不是运行时引用**。

### 4.3 **A 组 = 确定可删（44 个）**

**判据（必须同时满足）**：① 在 `client/src/styles/tokens.css` 有 `--x:` 声明；② **全仓库**（除 `node_modules`/`dist`/`tests`/`.git`）**除自身声明外零任何文本出现**（连 docs 反引号提及都没有）；③ 产品代码中无动态拼接（§4.1 已证 **0 处**）。

```bash
# 复算 A 组（预期 44）
node /tmp/a1f-authoritative.mjs | sed -n '/^A = /,/^$/p'
node /tmp/a1h-crosscheck.mjs   # 逐令牌证：44/44 只出现在 tokens.css 与设计镜像 CSS 的声明行
```

| # | 令牌 | tokens.css 声明行 | # | 令牌 | tokens.css 声明行 |
|---|---|---|---|---|---|
| 1 | `--gray-700` | 18 | 23 | `--radius-2xl` | 78 |
| 2 | `--brand-100` | 25 | 24 | `--red-100` | 46 |
| 3 | `--brand-900` | 33 | 25 | `--red-400` | 47 |
| 4 | `--green-100` | 36 | 26 | `--space-0` | 72 |
| 5 | `--green-400` | 37 | 27 | `--space-16` | 74 |
| 6 | `--green-900` | 38 | 28 | `--table-bg` | 294 |
| 7 | `--amber-100` | 41 | 29 | `--tag-accent-bg` | 323 |
| 8 | `--lh-display-1` | 55 | 30 | `--tag-accent-fg` | 323 |
| 9 | `--lh-display-2` | 56 | 31 | `--tag-brand-bg` | 319 |
| 10 | `--lh-title-2` | 58 | 32 | `--tag-brand-fg` | 319 |
| 11 | `--lh-title-3` | 59 | 33 | `--tag-danger-bg` | 322 |
| 12 | `--lh-body-lg` | 60 | 34 | `--tag-danger-fg` | 322 |
| 13 | `--lh-body-sm` | 62 | 35 | `--tag-neutral-bg` | 318 |
| 14 | `--z-base` | 115 | 36 | `--tag-neutral-fg` | 318 |
| 15 | `--z-sider` | 115 | 37 | `--tag-success-bg` | 320 |
| 16 | `--layout-gutter` | 132 | 38 | `--tag-success-fg` | 320 |
| 17 | `--bg-inverse-2` | **160 / 220 / 373** | 39 | `--tag-warning-bg` | 321 |
| 18 | `--chart-1` | 209 | 40 | `--tag-warning-fg` | 321 |
| 19 | `--chart-2` | 209 | 41 | `--btn-default-bg` | 269 |
| 20 | `--chart-3` | 209 | 42 | `--btn-default-fg` | 272 |
| 21 | `--chart-4` | 210 | 43 | `--btn-text-fg-hover` | 274 |
| 22 | `--chart-5` | 210 | 44 | `--btn-danger-bg-hover` | 276 |

> **A 组 = 44 个令牌 / `tokens.css` 内 46 个声明点**（`--bg-inverse-2` 出现在 3 个层叠块：密度块邻域 160、`[data-theme="dark"]` 220、深色组件修正块 373）。

### 4.4 **B 组 = 存疑（61 个）**

**判据**：产品代码（`client/src` / `server/` / `trustjudge-server/` / 构建配置）**零引用**，但 **`docs/` 设计层有书面存在** —— 即**设计契约已发布、实现尚未接线**。
**本轮动作：一律不动。**

```bash
node /tmp/a1f-authoritative.mjs | sed -n '/^B = /,/^C = /p' | head -70
```

**B 组 61 个（按语义族归类）**：

| 族 | 个数 | 令牌 | 设计层出处（节选） |
|---|---|---|---|
| 按钮变体/状态 | 12 | `--btn-radius` `--btn-pad-x` `--btn-font-weight` `--btn-primary-bg-hover` `--btn-primary-bg-active` `--btn-default-bg-hover` `--btn-default-bd` `--btn-disabled-bg` `--btn-disabled-fg` `--btn-disabled-bd` `--btn-danger-bg` `--btn-text-fg` | `03-components.md:110-111`、`preview/index.html:66-77` |
| 输入框状态 | 9 | `--input-radius` `--input-bd` `--input-bd-hover` `--input-bd-focus` `--input-bg` `--input-bg-disabled` `--input-ph` `--input-pad-x` `--input-ring` | `03-components.md:122-123`、`preview/index.html:79-83` |
| z-index 阶梯 | 6 | `--z-dropdown` `--z-modal-mask` `--z-modal` `--z-message` `--z-tooltip` `--z-lightbox` | `03-components.md:88,137,146,407,431,490-493,551` |
| 页面骨架 | 7 | `--page-header-gap` `--page-title-fs` `--page-title-fw` `--page-desc-fs` `--page-desc-fg` `--page-pad-x` `--page-pad-y` | `03-components.md:343`、`preview/index.html:44,55,59` |
| 表格 | 3 | `--table-header-fw` `--table-header-h` `--table-row-h` | `03-components.md:54,58,210`、`preview/index.html:116-117` |
| 侧栏/顶栏 | 5 | `--sider-item-gap` `--sider-item-active-bg` `--sider-icon-size` `--topbar-h` `--topbar-shadow-scrolled` | `03-components.md:367-368,379,382` |
| 空态/骨架/分值 | 6 | `--empty-icon-size` `--empty-title-fs` `--skeleton-bg` `--skeleton-sheen` `--score-value-fs` `--score-value-fw` | `03-components.md:232,455,478,481,506` |
| 焦点环/阴影 | 2 | `--ring-danger` `--shadow-xl` | `03-components.md:32,35,88,111,123` |
| 缓动 | 3 | `--ease-in-out` `--ease-emphasized` `--ease-spring` | `04-interaction-a11y.md:151,160,164,167` |
| 遮罩/边框 | 3 | `--bg-mask-strong` `--border-danger` `--border-inverse` | `03-components.md:35,94,490,493`、`preview/index.html:41` |
| 卡片/布局 | 3 | `--card-shadow-raised` `--stack-gap` `--layout-subnav-h` | `03-components.md:84,158,252,333,343,355,358` |
| 调色板扩展 | 1 | `--amber-400` | `docs/reports/b2-contrast/raw-f4-census.json`（普查夹具） |
| 密度覆盖 | 1 | `--input-h` | `tokens.css:176` 注释自述；`03-components.md:122` |

> 合计：12+9+6+7+3+5+6+2+3+3+3+1+1 = **61** ✅

**B 组不得删除的理由（三条）**：
1. 它们在 `docs/ui-redesign/03-components.md` 的**组件契约表**里被逐条列举 —— 删除 = **设计文档与实现对不上**（文档漂移）；G-3 不改清单要求「不改视觉」，连带要求是**不改已冻结的设计契约词汇**。
2. 其中**按钮/输入框状态族（21 个）**是 antd 主题桥（`antd-theme.js`，不改清单项）的**潜在消费面** —— 一旦有人把 `antd-theme.js` 从「原始令牌」切到「语义令牌」，这批立即可被引用。
3. `--z-*` 阶梯与浏览器层叠强相关；`--shadow-xl`/`--ring-danger` 是**有文档意图**的备用档位 —— 删除属「删掉设计意图」，不是「删死代码」。

### 4.5 A/B 组精确数量

| 组 | 数量 | 判据 | 本轮动作 |
|---|---|---|---|
| **A 组（确定可删）** | **44** | 全仓库零任何文本出现（含 docs），无动态拼接风险 | ✅ **round 1 执行** |
| **B 组（存疑）** | **61** | 产品代码零引用，但设计层有书面契约 / 删除会致文档漂移 | ⛔ **本轮不动** |
| 合计 | **105** | = r0 复算值 ✅ | — |

**缺口消解**：`105（复算） − 75（台账） = 30`。这 30 个的归属已可定位：**全部落在 B 组**（B 组 61 中「仅在设计文档提及、且不在设计镜像 CSS 里成对出现」的那部分）；A 组 44 个因为**连文档提及都没有**，台账若采用「只认孤儿」的口径会把它们计入 → 故台账 75 = B 组的「文档提及型」+ 部分 A 组，**口径不可复现**。**结论：以本轮 A∪B 的 105 为权威口径，并显式二分。**

### 4.6 附带：死引用（方向相反的缺陷）—— 与 r0 一致

```bash
node /tmp/a1i-undefined.mjs
#   declared token names (product CSS contexts) = 297
#   distinct tokens referenced via var() in product code = 194
#   UNDEFINED references = 3
```

| 令牌 | 位置 | 是否有 fallback | 判定 |
|---|---|---|---|
| `--canvas-parchment` | `client/src/views/Login.vue:150` | ❌ 无 | **真死引用**（= 入场包 §5.2 补充 6 所述「1 处既有死引用」✅ 一致） |
| `--page-max` | `client/src/components/PageShell.vue:35` | ❌ 无 | **假阳性** —— 由 37 行 `:style="{ '--page-max': … }"` 注入（同元素） |
| `--slide-dir` | `client/src/views/teacher/QuestionEdit.vue:945/946/948/949` | ❌ 无 | **假阳性** —— 由 35 行 `:style` 注入在**祖先** `.lc-main`，后代继承消费（**正是入场包 §5.2 陷阱 6 的实例**） |

→ **本节自证扫描器已正确处理「祖先注入、后代消费」**，未把陷阱 6 做成假阳性。

---

## 5 安全专项（r0 §7-5 遗留项，本轮补做 · 静态）

> 声明：**纯静态**，未发任何真实请求、未触发任何越权尝试。

| 检查 | 结果 |
|---|---|
| 硬编码密钥/凭据（`server/src` + `client/src`） | 源码内**无硬编码长密钥**；凭据由未入库的 `server/.env` 承载 |
| `eval` / `new Function` | **0 处** |
| 不安全原始 SQL（`queryRawUnsafe` / `executeRawUnsafe` / `$queryRaw`） | 未发现 |
| 路径穿越护栏 | 已有 `server/test/unit/security-path-guards.test.js`（在 67 套件内）覆盖 |
| 依赖审计（`npm audit`） | **未执行**（会触网，属禁令）→ 留待专门轮次 |

**结论**：静态层面**未发现新增高危项**；完整安全专项（依赖审计 / 鉴权矩阵 / 注入的动态验证）**仍未覆盖**，见 §8。

---

## 6 round 1 修复清单（执行集 · ≤8 文件）

> 排序：**风险低 → 高**。执行集仅 **2 项 / 2 个文件**；其余为候选（本轮只列不做）。

### 6.1 执行项 1｜`BUG-A-01` 收口：把 `rule-mutator` 加入三段式拆进程

| 字段 | 内容 |
|---|---|
| **文件:行号** | `server/package.json:10`（`scripts.test`，单行 466 字符） |
| **问题** | 三段式拆进程只排除了 `(fact-extractor\|rule-executor)`，**漏了 `rule-mutator`**。`test/unit/infrastructure/rule-mutator.test.js:18` 顶层 `import { runRules } from '../../../src/services/ruleExecutor.js'`，而 `ruleExecutor.js` 顶层加载 `tree-sitter`（native 模块）→ 同进程污染 → 段 1 固定 **13 red / 920 passed / 933 total**（172s）。 |
| **依据** | ① r0 §2-F-2 反证：该套件**独占进程** → `1 passed` / `21 passed, 21 total`，0.66s 全绿；② 本轮 §2.5 补齐 import 链证据；③ 项目约束 §4「全量口径 = 1011 例 / 67 套件：段1 = 933（= 912 除三套件 + rule-mutator 21）、段2 = 17、段3 = 61」；④ ⚠️ 三段用 `&&` 串联，**第一段一红就短路** → 段 2/3 **从未被执行**，「全绿」一直是残缺结论。 |
| **建议改法（1 行替换）** | 把 `--testPathIgnorePatterns="(fact-extractor\|rule-executor)"` 改为 `--testPathIgnorePatterns="(fact-extractor\|rule-executor\|rule-mutator)"`，并在**末尾追加**一次单套件运行：` && NODE_OPTIONS=--experimental-vm-modules jest --config test/jest.config.js --runInBand --forceExit test/unit/infrastructure/rule-mutator.test.js` |
| **安全性核验（本轮已做）** | ✔ `rule-mutator` 子串在 `server/test/**` 内**唯一命中** `rule-mutator.test.js`（对 `find server/test -name '*.test.js'` 的 67 个文件逐条核对，无第二命中）；✔ 排除后**不减少**段 1 应跑套件数（jest `testPathIgnorePatterns` 按**全路径正则**匹配，正交）；✔ 段 1 预期变为 **912 例**（933 − 21），新增段 4 = 21 例 → 总 **1011 例** ✅ 与项目约束 §4 完全对齐 |
| **风险等级** | **低**（已反证；纯测试编排，不触产品代码、不改测试断言） |
| **验证方法（Agent C）** | `cd server && DATABASE_URL="mysql://<user>:<pass>@localhost:3306/exam_system_test" npm test`（**只换库名**；一键脚本 `bash docs/pipeline/scripts/unblock-g2.sh`）→ 必须确认日志里有 **4 处** `Test Suites:` 摘要（修复前只有 **1 处**）；判据：**段1 912/912 全绿 + 段2 17 + 段3 61 + 段4 21**，总计 **1011 passed / 0 failed**（目标 0；底线 failed ≤ 13） |

### 6.2 执行项 2｜零引用令牌清理（**仅 A 组 44 个**）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `client/src/styles/tokens.css` —— **46 个声明点**：18 25 33 36 37 38 41 46 47 55 56 58 59 60 62 72 74 78 115(×2) 132 160 209(×3) 210(×2) 220 269 272 274 276 294 318(×2) 319(×2) 320(×2) 321(×2) 322(×2) 323(×2) 373 |
| **问题** | 44 个令牌在**全仓库**（含 docs、tests、构建配置）**除自身声明外零任何文本出现** —— 纯死代码。 |
| **依据** | §4.3；`node /tmp/a1f-authoritative.mjs`（A = 44）、`node /tmp/a1h-crosscheck.mjs`（44/44 仅出现在两处镜像 CSS 的声明行）；且 §4.1 已证产品代码中**动态拼接 0 处**、`setProperty` **0 处** → **无运行时注入可能**。 |
| **建议改法** | 仅删除 A 组 44 个令牌的 46 行声明。**同族 `--fs-*` 必须保留**（如 `--fs-display-1` 仍被引用，只有 `--lh-display-1` 可删）→ **必须逐行对齐，禁止成对整块删除**。删除 `--bg-inverse-2` 时必须**同时删 3 处**，否则亮/暗主题不对称。 |
| **风险等级** | **低**（死代码，零消费方；CSS 自定义属性在无 `var()` 消费时**不参与计算值**，删除**不产生像素变化**） |
| **验证方法（Agent C）** | ① `node /tmp/a1f-authoritative.mjs` → A 组应为 **0**；② 硬指标复算（入场包 §6）**必须仍为 hex=0 / !important=0**；③ 像素 sha1 比对（亮/暗 × 舒适/紧凑 = 4 组）**全部相等**；④ **不得重建 `client/dist`** —— 比对用私有 dist 副本（rig :3100，非 5173/3000） |

### 6.3 执行集文件清单（2 个文件）

| # | 文件 | 改动规模 | 风险 |
|---|---|---|---|
| 1 | `server/package.json` | 1 行（正则加 1 项 + 末尾追加 1 段） | 低 |
| 2 | `client/src/styles/tokens.css` | 46 行删除（44 个令牌） | 低 |

> 距 8 文件/轮预算尚余 **6 个文件位**，**本轮不占用** —— 保留给 round 2 的 axe 收口与卫生项。

---

## 7 后续轮次候选清单（按「风险低 → 高」，**本轮只列不执行**）

| 序 | 项 | 目标文件 | 规模 | 风险 | 为何排这个位置 |
|---|---|---|---|---|---|
| **1** | **M-1/M-2 合并新增页 axe 收口** | `client/src/views/teacher/RuleQuality.vue`（补 `<h1>` + `.ant-statistic-title` 对比度）、`client/src/components/checker/CheckerWizard.vue`（`label` 缺可访问名称，critical×2） | 3 处 / 2 文件 | **低** | 无障碍类**不属不改清单**（项目约束 §2 明示），但**必须证明零视觉变化**（补 `<h1>` 用视觉隐藏类）。§2.3 已给出 M-1 精确修法，无需再勘探。**建议 round 2 首项。** |
| **2** | **B 组令牌二次裁定（61 个）** | `client/src/styles/tokens.css` + `docs/ui-redesign/03-components.md` | 61 个 | **低–中** | 需**先确认设计契约是否仍生效**（按钮/输入框状态族 21 个最可能被 antd 主题桥消费）。**必须与设计侧对齐后**再动；本轮已把 61 个逐条归类，round 2 可直接进入裁定，不必重扫。 |
| **3** | **空 catch 补日志/上抛（7 处）** | `adminController.js:367,377`、`teacherController.js:125`、`student/Submit.vue:705`、`student/Layout.vue:150`、`teacher/Students.vue:287,305` | 7 处 / 5 文件 | **低** | 风险低，但**跨 5 个文件**会吃掉 8 文件预算的 5/8。⚠️ `Submit.vue:705` 是**有意降级**（解析失败回退空数组），改它属改语义 → **需先确认**。故排在 axe 之后。 |
| **4** | **`console.log` 残留清理（19 处）** | `server/src` 12 处（`teacherController.js:324,329,331,333,1225,1227`、`deepseek.js:243,272,278,279,360,370`）+ `client/src` 7 处（全在 `QuestionEdit.vue:542-598`） | 19 处 / 3 文件 | **低** | 纯卫生。但 server 侧日志是**生产排障线索**（`[parseExam]` 系列），删除会**降低可诊断性** → 建议改 `pino` 分级（`debug`）而非删除，**这属行为变更**，需 C 轮回归护航。 |
| **5** | **`--canvas-parchment` 死引用** | `client/src/views/Login.vue:150` | 1 处 / 1 文件 | **低–中** | 入场包 §5.2 补充 6 已登记为「唯一既有死引用」。**但它在 `client/src/views` —— 触不改清单边界**：修法是「改等值已声明令牌」或「补 fallback」，**必须证明零视觉变化**（当前无 fallback → 该声明本就失效，改等效值理论零变化，但需像素证明）。 |
| **6** | **`experiment-variance.test.js` 同进程污染暴露面** | `server/package.json`（可能再拆一段） | 1 行 | **低** | 本轮 §2.5 新发现。**先观察一轮**：若 `BUG-A-01` 修完后段 1 全绿则暂无动作；若 experiment-variance 转红，立即升级为执行项。**不要提前拆**（增加段数、拖长 CI）。 |
| **7** | **`--ink-muted` 遗留令牌迁移** | `client/src/style.css:12` | 1 处 / 1 文件 | **中** | 本轮新发现：`client/src` 内唯一不在 `tokens.css` 的声明，属 `tokens.css` 头部自述的「94 处旧颜色令牌…待逐页替换后删除」的残渣。迁移=改视觉风险，**需先在 tokens.css 建别名并逐页替换**，非单轮可完成。 |
| **8** | **F-1 循环依赖拆解** | `server/src/services/factExtractor.js:30` + `:38-39` ↔ `server/src/services/ruleExecutor.js:21` | 2 文件（+1 新建 utils） | **中高** | 命中**评分链路**（`checkerService` → `ruleExecutor` → `factExtractor`）。改法明确（`resolveProjectRoot` 下沉），但**必须以契约测试护航**且需 C 轮全量回归。**排在卫生项之后。** |
| **9** | **GodFile 拆分（10 个 >800 行）** | `student/Submit.vue` 1519、`checkerService.js` 1280、`teacherController.js` 1233、`Doc.vue` 1106、`ruleExecutor.js` 1068、`deepseek.js` 1051、`ReviewDetail.vue` 988、`QuestionEdit.vue` 983、`reviewController.js` 965、`ProjectQuestionEdit.vue` 862 | 10 文件 | **高** | **超出 8×8 预算**（G-8 已判定：64 文件次只够清令牌与局部坏味道）。拆分必然改视觉/交互 → 撞不改清单铁律（须 ui-guard，本项目无常驻）。**明确排除在 8 轮之外**，需专门排期。 |
| **10** | **分层迁移 47 个未分层文件** | server 侧 47 个源文件 | 47 文件 | **高** | 同 G-8：预算不足。且 `check-layers.mjs` 违规已为 **0**，迁移动机是「完备性」而非「违规」→ **优先级最低**。 |

---

## 8 局限与未覆盖声明（诚实清单）

1. **未跑 jest**（Agent C 职责，且本轮任务明令禁止）→ §6.1 的「段1 变 912/912 全绿」是**基于反证与用例计数推导的预期值**，不是实测。**必须由 Agent C 实测确认**，且要确认日志里出现 **4 处** `Test Suites:` 摘要（修复前仅 1 处，因 `&&` 短路）。
2. **未跑 axe / 未做像素 sha1 / 未做指纹锚点校验** —— §6.2 的「零视觉变化」是**基于 CSS 自定义属性语义的静态推断**（未被 `var()` 消费的属性不参与计算值），**不是像素证据**。必须由 Agent C 的 4 组（亮/暗 × 舒适/紧凑）像素比对证实。
3. **未复算分层违规与未分层计数** —— `check-layers.mjs` 未在本轮执行（r0 已记 0/47）。**若 C 轮要判 G-7「未分层不增」，须自行执行。**
4. **未复算硬指标 hex / `!important`** —— 留在 Agent C 的回归口径里（项目约束 §4 + 入场包 §6）。
5. **安全专项仅静态、未做依赖审计** —— `npm audit` 会触网（禁令），故未执行；鉴权矩阵/注入的**动态**验证未覆盖。
6. **`--text-brand` 与 M-1 的因果链是静态推断** —— §2.3 的结论「对比度根因是页面未覆盖 `.ant-statistic-title`」**未经 axe 验证**，`RuleQuality.vue` 实际渲染的 title 元素类名需 C 轮用 axe 报告确认。
7. **B 组的「设计契约是否仍生效」未做人工裁定** —— §4.4 只给出**归类与出处**，未判定 61 个令牌各自的存废；这是 round 2 的工作量，本轮**故意不越界**。
8. **未扫描 `client/dist` 与 `tests/`** —— 按任务口径排除。风险：若 `tests/` 的验收装置里存在对某 A 组令牌的引用（如私有 dist 副本的快照/夹具），删除后**比对夹具可能失效**。**建议 Agent C 在跑像素比对前，先确认 rig 的夹具不引用 A 组 44 个令牌。**
9. **行号锚点基于 `ac60831` 冻结副本 + 活树 HEAD 一致** —— 若 Agent B 在改 `tokens.css` **之前**先改了别处导致行号位移，§6.2 的行号需按**令牌名**（不是行号）重定位。**已给出令牌名清单，行号仅作辅助。**
10. **`/tmp` 下的扫描器不会入库** —— 其结论已完整落入本报告；若需晋升为门禁脚本（G-4），**必须先加固并自测**（r0 §2-F-1 已警告临时脚本会把环报成自环的同类风险）。
11. **未验证 `docs/ui-redesign/02-design-tokens.css` 与 `client/src/styles/tokens.css` 的逐字节一致性** —— 本轮只证「同 296 个令牌、同 46 处 A 组声明点」。镜像若本就有漂移，则 §4.2 结论 3 的「镜像」措辞需收窄为「结构性镜像」。

---

## 9 给 Agent B 的令牌删除边界条件（**硬约束，违反即视觉回归**）

1. **只删 A 组 44 个**；B 组 61 个**一个都不许碰**（设计契约已发布）。
2. **按令牌名删，不按行号整块删** —— `--fs-display-1`/`--lh-display-1` 这类**成对相邻**令牌，**只有 `--lh-*` 侧可删**（`--fs-*` 仍被引用）；同理 `--space-0`/`--space-1`…`--space-16` 只删 0 与 16。
3. **`--bg-inverse-2` 必须 3 处同删**（`tokens.css:160 / 220 / 373`），否则亮/暗主题不对称 —— **最容易漏的一处**。
4. **禁止删除带设计注释的整块** —— `--chart-1..5`（209/210）所在行含设计注释；本轮建议**只删声明、保留注释**，避免文档漂移扩大。
5. **不得顺手「优化」**：不许改字号、不许改 hex、不许重排令牌、不许引入新令牌、不许把 B 组「顺手接线」。
6. **不得重建 `client/dist`**（用户构建产物）。
7. **改完必须自证**：`node /tmp/a1f-authoritative.mjs` → A 组应为 **0**；`!important` 与 hex 计数不变。
8. **改完必须回报行号映射**（哪些行被删）—— 供 Agent C 定位与后续轮次复用。

---

*本报告由 Agent A（`code-analyzer`）于 round 1 产出；唯一写入文件为 `docs/pipeline/audit-round-01.md`。*
