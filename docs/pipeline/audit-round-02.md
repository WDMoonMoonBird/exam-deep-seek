# audit-round-02 —— 增量架构审查报告（流水线第 2 轮）

> 轮次：**02（增量审查，禁止全仓重扫）** ｜ 日期：**2026-10-11（凌晨）** ｜ 基线 commit：`8fb2c1d4ad775a02a4ec3b3f9e8a89772efd46aa`（round 1 已提交）
> Agent A 技能：`code-analyzer`（本仓约定 = 规范里的 `deep-code-analyzer`）
> 上游输入：`docs/pipeline/audit-round-01.md`（§7 候选清单）、`docs/pipeline/refactor-round-01.md` §4/§8/§9、`docs/pipeline/test-round-01.md`（O-1..O-5）、`docs/pipeline/project-constraints.md`、`pipeline-status.md`
> 方法：**冻结副本测量**（`git archive 8fb2c1d` → `/tmp/a2-freeze`，1010 个被跟踪文件）+ **独立实现扫描器**（未复用 `/tmp/a1*` / `/tmp/b1*` / `/tmp/c1*`）+ **限定范围**（不重做 round 0 全量）

---

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 纯只读（除本报告外不写任何文件） | ✅ 唯一写入 `docs/pipeline/audit-round-02.md`；全部临时脚本落 `/tmp`，未入仓 |
| 禁止 `git clean`/`stash`/`checkout -- .`/`reset --hard`/`restore .`；禁止任何 git 写操作 | ✅ 全程只读 `rev-parse`/`log`/`tag`/`status -uno`/`show`/`archive`/`ls-files`；**零 git 写操作** |
| 不跑 jest（C 职责） | ✅ 未执行任何 jest 命令 |
| 不跑 build / 不重建 `client/dist` | ✅ 未执行任何构建；`client/dist` **只读 `ls` 一次**（用于 O-1 口径说明），未读产物内容、未写任何东西 |
| 不启动服务、不碰 `:5173`/`:3000` | ✅ 未启动/重启/kill 任何进程，未占用任何端口（rig :3100 亦未启动） |
| 不写 `tests/`、禁止重跑 `ledger-check.mjs --out=raw/ledger.json` | ✅ 只读扫描 `tests/`（仅用于 O-1 定位）；未执行 `ledger-check.mjs` |
| 冻结再测（陷阱 7） | ✅ 全部扫描/复算在 `/tmp/a2-freeze`（`git archive 8fb2c1d`）上执行 |
| 陷阱 8：`git status` 对未跟踪目录无证据力 | ✅ 未用 `git status` 推断 `tests/`/`client/dist` 未被触碰；本报告**不声明**对二者的写否结论（A 未写任何一处） |
| 增量范围（规范 §六.3） | ✅ 只审「本轮改动相关文件 + 核心架构文件 + 任务指定项」：`tokens.css`、`ruleExecutor.js`/`factExtractor.js`/`factExtractors/common.js`、`RuleQuality.vue`/`CheckerWizard.vue`/`teacher/Layout.vue`、`style.css`（只读参照）、`docs/ui-redesign/*.md`（契约源）。**未重扫** r0 的 F-1..F-7 全量，**未复算** r0 的 105→44/61 全表 |

```bash
# 冻结副本（本轮所有测量的唯一输入）
rm -rf /tmp/a2-freeze && mkdir -p /tmp/a2-freeze
cd "<repo>" && git archive 8fb2c1d | tar -x -C /tmp/a2-freeze
find /tmp/a2-freeze -type f | wc -l          # → 1010（= git ls-files | wc -l）
```

---

## 1 三项裁定结论（摘要）

| # | 议题 | **裁定** | 数量 |
|---|---|---|---|
| ① | 零引用令牌 64 个的存废 | **60 应保留（有书面契约）/ 4 可删（无任何契约）** | 60 + 4 = 64 |
| ② | `--btn-default-bg` | **恢复声明**（1 行），不修订设计文档 | 1 个令牌 / 1 行 |
| ③ | O-1 产物哈希基线 | **不得重建 `client/dist`**；换基线 = 冻结副本 + **仓库外 outDir** 重建 + 新产物清单归档；**由 Captain 触发、C 用 rig 私有副本复算** | 流程（§4） |

---

## 2 任务 1①｜零引用令牌 64 个——逐个契约核查

### 2.1 独立复算：64 精确复现

本轮扫描器为**独立实现**（`/tmp/a2-scan.mjs`：自写注释剥离、保留换行以稳定行号、词边界 `(?<![-\w$])--x(?![-\w$])`；范围 = 冻结树全量，排除 `node_modules`/`.git`/`dist`/`tests`）。

```
corpus files scanned = 526
tokens.css decl sites = 335 ｜ distinct declared = 252
ZERO-REF（产品侧零引用，含 tokens.css 内部引用）count = 64     ✅ 与 C 的 V3③ 完全一致
```

**口径确认**：与 `test-round-01.md` O-2 的「**计入 `tokens.css` 内部引用 → 64**」一致（另一口径 100 本轮不采用）。**64 = B 组 61 + 3 个新孤儿** 已独立复现，集合层面相等。

### 2.2 ★ 判据冻结（本轮新增，必须写进后续轮次）

> **令牌 T 记为「有契约」⟺ T 的完整名称，或一个可机械展开为有限名集的紧致写法（`X/-suf`、`X/a/b`、`X/{a,b}`），出现在 `docs/ui-redesign/` 的核心规范 `.md`（`02-design-tokens.md` / `03-components.md` / `04-interaction-a11y.md` / `05-page-specs.md`）中。**

**为什么必须补这两条排除项**（本条即 round 1 `--btn-default-bg` 事故的根因）：

| 写法 | 出处示例 | 是否契约 | 理由 |
|---|---|---|---|
| `--btn-default-bg/-bd` | `03-components.md:110` | ✅ **是** | 斜杠展开为**有限名集**，`-bg`/`-bd` 各自被具名 |
| `--btn-disabled-bg/-fg/-bd` | `03-components.md:111` | ✅ 是 | 同上（3 名） |
| `--page-pad-y/x` | `03-components.md:47`、`02-design-tokens.md:93` | ✅ 是 | 同上（2 名） |
| `--tag-neutral/brand/success/warning/danger/accent-{fg,bg}` | `03-components.md:276` | ✅ 是 | 同上（12 名，**花括号枚举**） |
| `--btn-*` `--tag-*` `--page-*` `--gray-*` `--status-*-bd` `--btn-*-bg` `--*-bg-hover` `--control-h*` | `02-design-tokens.md:11-13` 三层结构表、`03-components.md:68-98` 覆盖总表、`:30`/`:111` 状态表 | ❌ **否** | **开放族引用**：规定命名**归属**，不承诺任何具体成员存在。若计为契约，A 组判据将**空洞化**（任何带前缀的令牌都"有契约"） |

**「声明在设计侧镜像里」不算契约**——**证据（三方一致，可复算）**：

```
docs/ui-redesign/02-design-tokens.css  声明 distinct = 289
client/src/styles/tokens.css (8fb2c1d) 声明 distinct = 252
mirror-only = 45   （= round 1 已删的 44 个 ∪ {--duration-page}）
impl-only   = 8    （--code-bg --code-fg --duration-loop-pulse --duration-loop-spin
                     --overlay-control-bg --overlay-control-bg-hover --overlay-scrim --text-brand）
A44 中不在 mirror 的 = 0        ← round 1 删掉的 44 个全部在 mirror 里
```

→ 镜像与实现**双向不一致**（45 vs 8）。它是**设计阶段的独立交付物**（`02-design-tokens.md:3` 自称「可直接 import 的单一事实来源」），与实现并非 1:1。**round 1 已删的 44 个全部在镜像中**，而 C 判 PASS —— 即成例：镜像声明**不是**「实现必须有」的判据。

### 2.3 裁定结果：**60 应保留 / 4 可删**

**4 个「可删」令牌（无任何契约）**：

| 令牌 | `tokens.css` 真实行号（8fb2c1d） | 声明值 | 其余出现处 | 为何无契约 |
|---|---|---|---|---|
| `--green-500` | **61**（同行：`--green-500: #12b76a;  --green-600: #039855;`） | `#12b76a` | 仅 `preview/index.html:137,254` | 核心规范 `.md` **0 命中** |
| `--amber-500` | **66**（同行：`--amber-400: #fdb022;  --amber-500: #f79009;  --amber-600: #dc6803;`） | `#f79009` | 仅 `preview/index.html:138` | 同上 |
| `--violet-500` | **75**（同行：`--violet-50: …;  --violet-100: …; --violet-500: #7a5af8;`） | `#7a5af8` | **全仓 0 处**（除自身声明 + `docs/pipeline/*` 元文档） | 同上（连 preview 都没有） |
| `--border-inverse` | **217** 与 **264**（亮/暗双声明） | `rgba(255,255,255,.10)` / `rgba(0,0,0,.12)` | 仅 `preview/index.html:41` | 同上 |

**「preview 里有引用」为何不构成契约（决定性证据）**：

```bash
grep -n '<link' docs/ui-redesign/preview/index.html
#   <link rel="stylesheet" href="../02-design-tokens.css">     ← 只链设计侧镜像
grep -c 'client/src' docs/ui-redesign/preview/index.html       # → 0
grep -n '预览外壳' docs/ui-redesign/preview/index.html          # → 第 9 行：/* ===== 预览外壳（不属于设计系统，仅为评审方便） ===== */
```

→ preview **从不加载实现侧 `client/src/styles/tokens.css`**；它消费的是镜像。**因此从实现里删掉这 4 个声明，preview 的渲染不会发生任何变化**。加上其自身声明「不属于设计系统」，preview 用法**既非契约、也非实现侧消费方**。→ 4 个令牌的删除**零影响面**。

> `test-round-01.md` O-5 的预判（3 个新孤儿「更接近 A 组性质、可优先裁定为可删」）**本轮证实**；并**新增第 4 个**：`--border-inverse`（round 1 §4.4 把它与 `--bg-mask-strong`/`--border-danger` 并入同一行、并沿用了后两者的 `03-components.md:35,94,490,493` 出处 —— **实测该令牌在 `03-components.md` 中 0 命中**，属 round 1 的**出处误挂**）。

**60 个「应保留」令牌的核心规范出处分布**（`/tmp/a2-final.mjs`）：

| 仅 `03-components.md` | 仅 `04-interaction-a11y.md` | `02`+`03` | `03`+`04` | `02`+`03`+`04` | 全部四份 |
|---|---|---|---|---|---|
| 50 | 3 | 3 | 2 | 1 | 1 |

- 仅 `04-interaction-a11y.md` 的 3 个 = `--ease-in-out` `--ease-emphasized` `--ease-spring`（`:151` 缓动表 + `:164`/`:160`/`:167` 场景表）。
- 四份齐全的 1 个 = `--table-row-h`（`02`:92 密度表 / `03` / `04` / `05`）。
- **最弱的一个是 `--amber-400`**：核心规范里只有 `03-components.md:317` 一处，且形态是 Do/Don't 的**备选分支**（「新增 `--icon-folder` **或复用** `--amber-400`」）。**仍裁定保留** —— 删除会使该行成为无解建议（两个备选都没了）。它的其余出现处（`docs/reports/b2-contrast/*` 共 9 处）是普查夹具，不计契约。

### 2.4 ★ 新增发现 N-1（方向相反：**契约悬空**）—— `--duration-page`

```bash
grep -n -- '--duration-page' client/src/styles/tokens.css        # → 无（实现从未声明）
grep -rn -- '--duration-page' client/src server/src trustjudge-server   # → 0 处
grep -n -- '--duration-page' docs/ui-redesign/02-design-tokens.css      # → 104: 380ms；398: reduce 块 1ms
sed -n '151p' docs/ui-redesign/04-interaction-a11y.md                   # 与已实现的 --duration-instant/fast/base/slow 同行并列
sed -n '164p' docs/ui-redesign/04-interaction-a11y.md                   # 「4c 页面切换 · 首次进入 | --duration-page | --ease-in-out」
```

`04-interaction-a11y.md:151` 的时长表把 `--duration-page` 与另外 4 个**已实现**的时长令牌写成**同一行、同一句式**；`02-design-tokens.css:104` 给了 `380ms`、`:398` 给了 reduce 降级。但**实现侧 `tokens.css:120-126` 只声明了 instant/fast/base/slow**（+ loop-spin/loop-pulse），**没有 `--duration-page`**。

→ 这是**契约悬空**（spec 承诺、实现缺失），与「零引用」（实现多余）**方向相反**，因此同时躲过了 round 0/1 的**两个**扫描方向（A 组只看「声明了但没引用」；死引用扫描只看「`var()` 指向未声明」，而它连 `var()` 都没有）。

**裁定：本轮不改，登记为 round 3+ 候选。** 理由：补声明 = 新增一个**零消费**令牌，与 round 1 的清理方向相反；且正解有两条（① 实现 380ms 的页面切换过渡；② 从 spec 退休该行），属**设计决策**，不是架构修复。

### 2.5 ★ 新增发现 N-2：round 1 的 A44 中另有 **12 个令牌**落在同一扫描器盲区

用 §2.2 的完整判据回扫 round 1 已删的 44 个：

```
A44 在核心规范中仍有名（含斜杠/花括号展开）= 13
  ├ --btn-default-bg                                  → 见任务 1②（裁定：恢复）
  └ --tag-{neutral,brand,success,warning,danger,accent}-{fg,bg} = 12 个  → 见下（裁定：不恢复）
其余 31 个（含 --btn-default-fg / --btn-text-fg-hover / --btn-danger-bg-hover：核心规范 0 命中）→ round 1 删除正确
```

12 个 tag 令牌的契约出处：`03-components.md:276` 的 `--tag-neutral/brand/success/warning/danger/accent-{fg,bg}`（花括号枚举，恰为这 12 名）+ `:286-295` 状态字典的 `--tag-X-*` 族引用；`03-components.md:279` 更写明「CSS 覆盖：6 个语义变体类映射 `--tag-*`」。

**但裁定：不恢复。** 依据是**同文档后续条款已取代该契约**：

```bash
sed -n '279p' docs/ui-redesign/03-components.md
#   components.Tag = { defaultBg: <--status-neutral-bg>, defaultColor: <--status-neutral-fg> … }
sed -n '280p' docs/ui-redesign/03-components.md
#   标签文字与底色对比度 ≥ 4.5:1（--status-*-fg 在 --status-*-bg 上均已按 AA 选定）
grep -n -A4 '\.tag-warning' client/src/style.css
#   131: html .ant-tag.tag-warning { color: var(--status-warning-fg); background: var(--status-warning-bg); border-color: var(--status-warning-bd); }
#   142: html .ant-tag.tag-success { color: var(--status-success-fg); … }
```

→ 同一组件小节内，§⑥/§⑦ 把 Tag 的默认态与**对比度保证**都归给 `--status-*-{fg,bg,bd}`，**实现与之一致**（`style.css:131-146`）。恢复 12 个令牌 = 制造**第二套并行色板**，且**不消除** `:276`/`:279` 与 `:279`/`:280` 的矛盾。**正解是修订设计文档**（把 `:276` 的 `--tag-…-{fg,bg}` 与 `:279` 的「映射 `--tag-*`」改为 `--status-*`），而设计文档不在本流水线授权范围内 → **登记 + 上报设计侧对齐**。

**与任务 1② 的判别式（必须写清，否则两条裁定互相矛盾）**：

> **契约条款是否被同文档其它条款取代（superseded）？**
> - **未被取代**（`--btn-default-bg`：`03-components.md` 对 default 按钮背景**只此一述**）→ 契约有效 → **改实现（恢复）**。
> - **已被取代**（`--tag-*-{fg,bg}`：同小节 §⑥/§⑦ 已改道 `--status-*`，实现亦从之）→ 契约失效/自相矛盾 → **不改实现**，登记文档修订。

---

## 3 任务 1②｜`--btn-default-bg` —— 裁定：**恢复声明**

### 3.1 事实

| 项 | 值 | 来源 |
|---|---|---|
| 契约原文 | `**default**（次要，`--btn-default-bg/-bd`）` | `docs/ui-redesign/03-components.md:110` |
| 原声明（ac60831） | `  --btn-default-bg: var(--bg-surface);` —— **第 304 行** | `git show ac60831:client/src/styles/tokens.css` |
| 现状态 | 已删（round 1 §8 行号映射：原 304 行「删整行」） | `refactor-round-01.md` §8 |
| 同族仍存 | `--btn-default-bg-hover`（现 296）、`--btn-default-bd`（现 297） | 冻结树 |
| 产品引用 | **0**（删前也是 0 —— 它在 A 组名单里） | 双向扫描 |

### 3.2 为什么是「恢复声明」而不是「修订文档」（四条，按强度排序）

1. **它是 round 1 的扫描器事故，不是设计决策。** `audit-round-01.md` §4.3 自述 A 组判据 ② 是「**全仓库除自身声明外零任何文本出现（连 docs 反引号提及都没有）**」。该令牌**不满足** ②（`03-components.md:110` 有反引号提及），只因 A 的引号正则要求闭合引号**紧跟**令牌、而此处后面是 `/-bd` 而失配。→ **它是 44 个里唯一不满足 A 自述判据的一个**（B 报告 §4.3 已自陈）。删它是**误删**，不是契约裁定。
2. **与 60 个「应保留」令牌适用同一把尺子。** 那 60 个同样是「产品零引用 + 规范有名」，全部保留。若因一个斜杠写法就让 `--btn-default-bg` 例外，则 §2.2 的判据不成立（一条有例外的判据不是判据）。
3. **它的契约条款未被任何其它条款取代**（§2.5 判别式）。`03-components.md` 全文对 default 按钮的背景**只此一述**；同族 `-hover`/`-bd` 也仍被契约保留着。
4. **改文档的成本与风险更高。** `docs/ui-redesign/` 是**冻结的设计交付物**：`10-wave1-verify.md` … `23-prefinal-verify.md` 等 12 份验收报告都是对它产出的**冻结证据**。改 `:110` 会让「被验对象」与「验收证据」错位；而恢复 1 行声明的**风险严格为 0**（该令牌无任何消费方；未被 `var()` 消费的自定义属性不参与计算值）。

> 附带澄清一个**反向论据不成立**：`preview/index.html:69` 写 `.btn-default{background:var(--bg-surface)}` —— 但据 §2.3，preview **只链镜像、不链实现**，且自称「不属于设计系统」，故它**不能**用来推翻 `03-components.md` 的规范条款。

### 3.3 具体改法（1 行）

**文件**：`client/src/styles/tokens.css` ｜ **位置**：现第 **295** 行（`--btn-primary-fg: var(--text-on-brand);`）与第 **296** 行（`--btn-default-bg-hover: var(--gray-50);`）**之间**插入一行：

```css
  --btn-default-bg: var(--bg-surface);
```

- **逐字复刻 ac60831 第 304 行**（值 = `var(--bg-surface)`；`--bg-surface` 已声明且被引用，不引入死引用）。
- 插回**原相对位置**（primary-fg → default-bg → default-bg-hover → default-bd），亮/暗结构不变（该令牌**只有 1 处声明**，无明暗双份，无 `--bg-inverse-2` 式的 3 处同删问题）。
- 文件 431 → 432 行；去重令牌 252 → 253。

### 3.4 连带影响（必须让 C 知道）

| 指标 | round 1 后（现） | round 2 后（预期） |
|---|---|---|
| 零引用令牌总数 | **64** | **61**（= 60 应保留 + 恢复的 1） |
| 其中「可删」 | 4 | **0** ✅ 收口 |

---

## 4 任务 1③｜O-1 产物哈希基线 —— 正确的换基线流程

### 4.1 先把口径钉死（否则必出假阳性）

1. **`client/dist` 的 asset content hash 不是回归判据。** `assets/index-<hash>.css` 里的 `<hash>` 是 Vite 的**内容哈希**：源码一字节变化 → 文件名必变。round 1 删了 46 个声明（源码净减 1489B）→ **下次构建的 `index-*.css` 必然换名**。拿它判「有没有视觉回归」= 100% 假阳性（`refactor-round-01.md` R1 已预警，本轮确认）。
2. **既有「指纹基线」有两类，必须分开说**：

| 基线 | 文件 | 口径 | 是否受 round 1 影响 |
|---|---|---|---|
| **源码 SUT 清单** | `tests/ui-redesign-verify/artifacts/T1-raw/T1-SUT-manifest-7c06347d.sha256`（62 行） | `./client/src/**` 的 **sha256**（**0 条 `client/dist` 条目**） | **已失效**（`tokens.css` 的 sha256 变了）—— 这是**源码**基线，重建 `client/dist` 不会修好它 |
| **产物身份锚** | `assets/index-CHwIlsxa.css` / `index-DS9Dg9Hx.js` / `index-legacy-DNrAJ9s6.js`（`client/dist`，mtime **21:55**），被 `tests/ui-redesign-verify/rig-server/logs/`、`verify-b3-4/raw/*.json`、`verify-batch2/raw/*.json` 等**运行时快照**引用 | 文件名 + 文件 sha256 | **已失效**（旧产物 = 改动前构建；C 的 V4 已旁证：`--chart-1:var(--brand-500)` 仍在旧产物中） |
3. **视觉回归的唯一主判据仍是像素 sha1**（亮/暗 × 舒适/紧凑 4 组）—— constraints §3 陷阱 4。产物哈希只能回答「这是不是同一份产物」，不能回答「视觉有没有变」。

### 4.2 换基线流程（五步，逐条对应约束）

| 步 | 动作 | 谁 | 依据 |
|---|---|---|---|
| **1. 触发** | 仅在 Captain 判定「需要一份新的产物基线」时执行（例如某轮收口后、或用户要发版）。**A/B/C 任何一方都不得自动触发构建** | **Captain**（或经用户明确授权） | constraints §1「禁止修改 `client/dist`」；§6 角色纪律（A/C 只读、B 只改清单内文件） |
| **2. 冻结** | `git archive <被验 commit> \| tar -x -C /tmp/a2-dist-<commit>`，在新副本内构建 | 同上 | 陷阱 7「先冻结再测」+ 陷阱 5「served fp == 磁盘 fp == 对应 HEAD」 |
| **3. 构建（仓库外 outDir）** | `cd /tmp/a2-dist-<commit>/client && npx vite build --outDir /tmp/pipeline-dist-<commit>`。**绝不写 `client/dist`** | 同上 | constraints §1「需要构建验证时用 `--outDir` 输出到仓库外」。**既有先例**：`tests/ui-redesign-verify/artifacts/T1-raw/T1-rebuild-check.txt` 首行即 “independent rebuild to /tmp/t1-build (**does NOT touch live dist**)” |
| **4. 产出新基线** | 对新 outDir 全量产物 `find . -type f \| sort \| xargs shasum -a 256` → 生成 `SUT-dist-manifest-<newcommit>.sha256`（含 `index-*.css`/`index-*.js` 的**文件名 + sha256 + 字节数**），归档到 `docs/pipeline/`（**新文件，不覆盖任何旧文件**） | Captain | 「不得覆盖历史证据」（同 `ledger.json` 的处置原则，`refactor-round-01.md` R2） |
| **5. 复算与登记** | ① C 用 **rig 私有 dist 副本（:3100，非 5173/3000）** 跑 4 组像素 sha1，作为视觉判据；② 把新基线写入 `pipeline-status.md` 新增行 `baseline_artifacts: <commit> / <new manifest 文件名>`；③ **旧基线全部降级标注**为「round-0 产物（源码 ≤ ac60831），仅作历史身份锚，不得用作判据」 | **C**（像素）+ **Captain**（登记） | constraints §5 + §3 陷阱 4/5 |

### 4.3 明确禁止的三件事

1. **禁止重建 / 覆盖 `client/dist`**（constraints §1；那是用户的构建产物）。
2. **禁止回写或重算 21:55 那批旧产物哈希**，也**禁止修改**引用了 `index-CHwIlsxa` 的运行时快照（`rig-server/logs/`、`verify-*/raw/*.json`）—— 那是**不可复现的历史证据**。
3. **禁止用 asset 文件名/字节数当回归判据**（`refactor-round-01.md` R1）。

### 4.4 本轮动作

**不做**（无构建授权、无 Captain 指令）。本条为**流程裁定**，供 Captain 在任何一轮按需触发。

---

## 5 任务 2｜增量审查逐项评估

### 5.1 候选 A｜循环依赖 1 处（F-1）→ **本轮做**（执行集第 4 项）

**现状（冻结副本复算，只读）**：

```
$ node scripts/gates/cycle-check.mjs      # 在 /tmp/a2-freeze 上跑
循环依赖门禁 · 根目录 server/src
  扫描 71 文件 / 163 条相对导入边
  强连通分量（|SCC|>1）: 1（基线 1）
  ↻ server/src/services/factExtractor.js  ↔  server/src/services/ruleExecutor.js
      server/src/services/factExtractor.js:30 → server/src/services/ruleExecutor.js
      server/src/services/ruleExecutor.js:21 → server/src/services/factExtractor.js
  自环: 0      结论：PASS
```

**影响面（全仓 grep 确认，回答任务的三问）**：

| 问 | 答 |
|---|---|
| `resolveProjectRoot` 被谁引用（**导出面**）？ | ① `factExtractor.js:30`（import）+ `:39`（**再导出**）② `factExtractor.js:79`（调用）③ `ruleMutator.js:39`（**从 `ruleExecutor.js` import**）+ `:525` ④ `checkerService.js:35`（**从 `ruleExecutor.js` import**）+ `:915` ⑤ **测试**：`fact-extractor.test.js:10`（**从 `factExtractor.js` import**！见下）、`rule-executor.test.js:13`（从 `ruleExecutor.js` import） |
| **会不会改变 `ruleExecutor.js` 的对外导出面？** | **只要实现得当就不会，但有一个硬约束**：`checkerService.js:35` 与 `ruleMutator.js:39` 都写 `import { …, resolveProjectRoot } from './ruleExecutor.js'` → **`ruleExecutor.js` 必须继续导出 `resolveProjectRoot`**（可改为再导出）。 |
| **⚠️ 最容易被漏掉的一条** | `fact-extractor.test.js:10` = `import { extractFacts, resolveProjectRoot } from '../../../src/services/factExtractor.js'`，且 `:444` 有 `describe('resolveProjectRoot — 与 ruleExecutor 同语义')`。→ **`factExtractor.js:39` 的再导出是被消费的公开面**，删它 = **17 例 fact-extractor 在 import 阶段整体炸掉**（不是断言失败，是模块解析失败）。**必须保留。** |
| 现成测试覆盖 | `fact-extractor` 17 + `rule-executor` 61 + `rule-mutator` 21 = **99 例**恰好覆盖该链路 ✅（且在四段式拆进程下互不污染） |

**★ 方案必须满足的 4 条硬约束（否则踩雷）**：

1. **不得新增文件** —— 否则踩 **arch 门禁**：`check-layers.mjs` 的 `layerOf()` 对 `server/src` 下首段不属于 `domain|application|infrastructure|interface` 的文件一律记 `unlayered`；`services/` 正是 `unlayered`。新增 1 个文件 → `未分层待迁移` **47 → 48** → `arch-metrics.mjs` 判「不增」失败 → **门禁 FAIL**（constraints §5）。→ **必须搬进一个已存在的模块。**
2. **共享新家的唯一合格候选 = `server/src/services/factExtractors/common.js`** —— 实测它**只 import `node:fs`/`node:path`**（`:17-18`），**没有任何指向 `ruleExecutor`/`factExtractor` 的边** → 加代码不会造出新环；而 `factExtractor.js:31-33` **本来就 import 它**、`ruleExecutor.js:22-23` 也经 `java.js`/`python.js`（`java.js:24`、`python.js:19`）**已有同向边** → 边数净变化 **0**。
3. **⚠️ 陷阱 1：两处 `SOURCE_EXTS` 同名不同值。** `ruleExecutor.js:55-62` 的 `SOURCE_EXTS` 有 **43 项**（含 go/html/css/sh/sql/json/yaml…）；`common.js:24-32` 的 `SOURCE_EXTS` = `Object.keys(EXT_LANGUAGE)` 只有 **9 项**（js/mjs/cjs/jsx/ts/tsx/vue/java/py）。`resolveProjectRoot` 的「子目录是否含源码」探测**必须用 43 项那套**，否则「外层包一个只含 `main.go`/`index.html` 的目录」将**不再下钻** → `runRules` 的工程根解析行为改变 → **评分链路回归**。→ 搬移时**必须逐字保留 43 项**，并在 common.js 里**换名**（如 `ROOT_PROBE_EXTS`）以免与 9 项版冲突。
4. **⚠️ 陷阱 2：`collectFiles` ≠ `collectSourceFiles`。** `ruleExecutor.js:176-197` 的 `collectFiles` 返回**全部普通文件的绝对路径**（用于命中 `package.json` 清单信号）；`common.js:117-139` 的 `collectSourceFiles` 只收 **SOURCE_EXTS 命中项**且返回**相对 posix 路径**。二者**语义与返回类型都不同**，不可互换 —— 直接复用 `collectSourceFiles` 会让 `resolveProjectRoot` 丢失 `package.json` 信号。

**建议改法（推荐形状，最小 diff、零行为变化）**：

```
① services/factExtractors/common.js（追加，不动既有符号）
   · export const ROOT_PROBE_EXTS = new Set([ … 逐字复制 ruleExecutor.js:56-61 的 43 项 … ]);
   · export function collectAllFiles(dir) { … 逐字复制 ruleExecutor.js:176-197，返回绝对路径 … }
   · export function resolveProjectRoot(rootDir) { … 逐字搬移 ruleExecutor.js:948-986 … }
       唯一两处替换：SOURCE_EXTS → ROOT_PROBE_EXTS；collectFiles → collectAllFiles
       （MANIFEST_NAMES 常量就地保留在函数体里）
   · 顶部保留既有 SKIP_DIRS（:21，与 ruleExecutor.js:65-67 逐字相同）
② services/ruleExecutor.js
   · 删 938-986（JSDoc 938-947 + 函数体 948-986，共 49 行）
   · 加 import { resolveProjectRoot } from './factExtractors/common.js';
   · 加 export { resolveProjectRoot };                ← 保住 checkerService:35 / ruleMutator:39
   · SOURCE_EXTS（:55-62，对外导出但全仓无 importer）保持原样不动（最小 diff；不要顺手删）
   · collectFiles / SKIP_DIRS / extOf 全部保持原样不动（它们另有 4/1/6 处调用点，动它们=扩大 diff）
③ services/factExtractor.js
   · 删第 30 行 import … from './ruleExecutor.js'              ← 环边在此消失
   · :31-33 的 common.js import 列表加入 resolveProjectRoot
   · 第 39 行 export { resolveProjectRoot }; 保持逐字不变      ← fact-extractor.test.js:10 依赖它
```

**预期门禁/回归增量（可精确核对）**：

| 判据 | 现（8fb2c1d） | 预期（round 2 后） |
|---|---|---|
| `cycle-check.mjs` 扫描文件 | 71 | **71**（零新文件） |
| `cycle-check.mjs` 相对导入边 | 163 | **163**（−1 环边 +1 新边，净 0） |
| `cycle-check.mjs` SCC | 1 | **0** ✅ |
| `check-layers.mjs` | 71 文件 / 违规 0 / 未分层 47 | **完全不变** |
| `arch-metrics.mjs` | 0 / 47 / 10 / 19 | **完全不变** |
| GodFile | `ruleExecutor.js` 1068（>800） | ≈1021（**仍 >800**，GodFile 计数 10 不变） |
| GodFile 观察带 | `common.js` 263（<500） | ≈344（**仍 <500**，19 不变） |
| 后端 | 1011 passed / 0 failed | **1011 / 0**（99 例链路全覆盖） |

**风险等级：中**（命中评分热路径 `checkerService → ruleExecutor → factExtractor`）。**降险措施**：逐字搬移 + 两个再导出面逐字保留 + 上述 7 项不变量逐条复算。**若任一不变量不成立 → 立即回退该文件（重编辑，非 git 回滚）。**

### 5.2 候选 B｜M-1 / M-2（合并新增页无障碍）→ **拆分裁定：2 做 1 不做**

**★ 本轮新根因（推翻 round 1 §2.3 的推断，且把修法从"高风险"降为"1 行 0 风险"）：**

M-1 的「缺 `<h1>`」**根因不在 `RuleQuality.vue`**，而在 `client/src/views/teacher/Layout.vue`：

```bash
sed -n '86,87p' client/src/views/teacher/Layout.vue
#   <!-- B3-1 ⑤ 页面 H1：镜像当前页真实标题（页内标题元素 → 侧栏菜单名兜底；非通用词），视觉隐藏 -->
#   <h1 v-if="pageTitle" class="visually-hidden">{{ pageTitle }}</h1>
sed -n '159,162p' client/src/views/teacher/Layout.vue
#   const MENU_TITLES = {
#     '/teacher/assignments': '作业管理', '/teacher/review': '评分审核', '/teacher/questions': '题库管理',
#     '/teacher/classes': '班级管理', '/teacher/students': '学生管理', '/teacher/teams': '教学团队',
#   };                                        ← 没有 '/teacher/rule-quality'
grep -cE 'page-title|<h1|<h2' client/src/views/teacher/RuleQuality.vue   # → 0（页面无任何 .page-title/h1/h2）
grep -n 'rule-quality' client/src/views/teacher/Layout.vue               # → 只有 :30 的侧栏菜单项，不在 MENU_TITLES
```

`syncPageTitle()`（`:163-174`，由 `onMounted:221`/`onUpdated:222`/`watch(route.path)+nextTick:223` 三处驱动）先查页内 `.page-title/.rp-title/.pr-title/.sp-title/h1:not(.visually-hidden)/h2:not(.visually-hidden)`；取不到才退化到 `MENU_TITLES[seg]`。`RuleQuality.vue` 两者都没有（标题是**裸 `<span>`**）→ `pageTitle = ''` → `v-if` 为假 → **Layout 的 h1 根本不渲染** → axe `page-has-heading-one` 命中。

**M-1a 裁定：本轮做。** 改法 = `Layout.vue:159-162` 的 `MENU_TITLES` **加 1 项** `'/teacher/rule-quality': '规则质量'`（与 `:30` 的侧栏菜单名逐字一致）。**零视觉变化可"由构造证明"，无需像素推断**：

- 该 h1 带 `class="visually-hidden"`，`client/src/style.css:211-221` 定义为 `position:absolute; width:1px; height:1px; margin:-1px; clip:rect(0 0 0 0); overflow:hidden` → **脱离文档流、不参与布局、不可见**；
- `Layout.vue:156` 自身注释即写明「不参与布局 → 几何与截图不变」；
- **同一构造已在两个 Layout 上出货**：`student/Layout.vue:45`、`admin/Layout.vue:53` 都已渲染该 h1 → 属**已生产验证**的模式，不是新发明；
- 只改一个**数据字典的取值**，不触碰任何模板结构、CSS、DOM 层级。
- ⚠️ 附带正确性核对：查询式排除 `h1:not(.visually-hidden)` → Layout 自己的 h1 **不会**被自己读到 → 无自指/无抖动。

> **对比被否决的另一方案**：把 `RuleQuality.vue:4` 的 `<span>` 提升为 `<h1>`。**已实测会改变计算样式**：`client/src/style.css:66-67` 有**全局** `h1, h2, h3 { font-family: var(--font-display); font-weight: var(--fw-semibold); color: var(--text-primary); letter-spacing: var(--tracking-tight); }` 与 `h1 { font-size: 40px; line-height: 1.1; }` → 该 span 目前是 **inline** 盒、无 `line-height` 覆盖；提升为 `<h1>` 后会新增 `font-family`/`letter-spacing`/`line-height:1.1`（及 UA 的 `margin: 0.67em`、`display:block`）→ **必然重排**（除非再补一整套 reset）。`Doc.vue:9/597-603` 的先例正是为此写了 `margin:0; line-height:1.4` 的补偿块 —— 但那是在**已有 class 的 flex 容器**里。→ **本轮不采用该方案。**

**M-1b（`.ant-statistic-title` 对比度）裁定：本轮不做。** 理由：
1. **它是视觉变更，不在 a11y 豁免枚举内。** constraints §2 的豁免只列「aria/label/heading」；**改渲染颜色 = 改视觉**，而 §2 对 views/components 的视觉改动要求「经 ui-guard 逐项对照，本项目无 ui-guard 常驻，故一律不动」。
2. **根因与 round 1 的推断一致，本轮给出精确结论**：`client/src/styles/antd-theme.js` **没有**设置 `colorTextDescription`/`colorTextTertiary` 的 token 级覆盖（实测 `grep colorText` 只命中 `:101` 的 `Anchor` 组件级覆盖）→ `.ant-statistic-title` 走 **antd v5 默认** `rgba(0,0,0,.45)`，在 `--bg-surface`(#fff) 上合成 ≈ `#8c8c8c` → 对比度 ≈ **3.4:1 < 4.5:1** → **确属真违规**（与入场包 §3「亮 2 规则/4 节点」相符），且属 **antd 上游默认**，非本项目令牌缺陷。
3. **不阻断任何门禁**：constraints §5 的无障碍判据是「**不得引入新的** axe 违规」；入场包 §3 已明确「原 axe 31 规则/57 节点 → 0 的基线**只覆盖 QA 原始 12 页集**，不含合并新增页面」→ 本项为**既有的、超出基线的**违规，留着不违约。
4. 修法（供后续对照轮）：在 `RuleQuality.vue` 的 `<style scoped>` 里加 `.ant-statistic-title { color: var(--text-secondary); }`（`--text-secondary` 在亮底 6.7:1、达 AA）。**但这是像素级颜色变更，需设计侧/对照截图授权。**

**M-2（`CheckerWizard.vue` label）裁定：本轮做。** 事实与改法：

```bash
grep -nE '<label|aria-|<input' client/src/components/checker/CheckerWizard.vue   # → 0 处（无 label / 无 aria-）
grep -nE '<a-(select|input|textarea|switch|radio|checkbox|input-number)' …        # → 唯一命中 :83 的 <a-select>
sed -n '82,83p' client/src/components/checker/CheckerWizard.vue
#   <span class="cw-vlabel">历史版本：</span>
#   <a-select v-model:value="rollbackTarget" style="width: 420px" size="small" placeholder="选择要回滚的版本">
```

`:82` 的 `<span>` 只是**视觉**标签，未与 `:83` 的 `a-select` 建立程序化关联 → axe `label`/`select-name` critical 命中。

**改法（仓库既有、且有 axe 前后证据的定型做法）**：

```bash
sed -n '206,221p' client/src/style.css
#   /* === 仅供读屏的工具类（T5-A2「无可见 label 的控件」统一做法）===
#      用法：<label for="控件id" class="visually-hidden">真实语义名称</label>
#      并给控件一个稳定 id —— 不要用 aria-label：实测 antd 会把它渲染到 .ant-select 外层 div，
#      落不到 role=combobox 的 input（b2-contrast/raw/{before,after}.json 的 Qname 用例）。 */
#   .visually-hidden { position:absolute; width:1px; height:1px; margin:-1px; padding:0; border:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
```

→ 在 `:82` 前加 `<label for="cw-rollback-version" class="visually-hidden">历史版本</label>`，并给 `:83` 的 `<a-select>` 加 `id="cw-rollback-version"`。
**零视觉变化**：`.visually-hidden` 是 `position:absolute` + 1×1 + clip → **脱流、不可见**；且**绝对定位子元素不参与 flex 布局**（`.cw-version-row` 即使为 flex 也无效）。**⚠️ 明确禁止用 `aria-label`**（`style.css:209-210` 有实测结论：antd 会把它渲染到外层 div，落不到 `role=combobox` 的 input）。

> `CheckerWizard.vue`（513 行）另需注意：它已落在 **>500 行观察带**（round 1 §3-1 已登记），本项只改 2 行，行数仍在观察带内（19 不变）。

### 5.3 候选 C｜卫生项（空 catch 7 处 / `console.log` 19 处）→ **不单列一轮**

**分布（真实行号，冻结树逐条复核，与 round 1 记录一致）**：

| 项 | 数量 | 分布 |
|---|---|---|
| 空 `catch {}` | **7**（5 文件） | `server/src/controllers/adminController.js:367,377`、`server/src/controllers/teacherController.js:125`、`client/src/views/student/Submit.vue:705`、`client/src/views/student/Layout.vue:150`、`client/src/views/teacher/Students.vue:287,305` |
| `console.log` — server | **12**（2 文件） | `teacherController.js:324,329,331,333,1225,1227`（`[parseExam]`/`[generateReference]`）+ `deepseek.js:243,272,278,279,360,370`（`[parseExamPaper]`/`[parseExamPaperStream]`） |
| `console.log` — client | **7**（1 文件） | `client/src/views/teacher/QuestionEdit.vue:542,546,548,551,554,557,598`（上传试卷解析链路） |

**为何不单列一轮**：

1. **性价比**：空 catch 跨 **5 个文件** = 吃掉 8 文件预算的 **5/8**，收益仅「故障可诊断性」；且 `Submit.vue:705`（`JSON.parse(sub.answer)` 失败回退 `[]`）是**有意降级**，改它 = **改语义**，必须单独立项。
2. **server 侧 `console.log` 不是"残留"，是生产排障线索**（`[parseExam]` 系列描述"收到多少字符 / 截断到多少 / 调了几次 DeepSeek / 返回几题"）—— 直接删会**降低可诊断性**。正解是接入已有的 `server/src/utils/logger.js`（pino）并降到 `debug` 级，**属行为变更**，必须由 C 护航。
3. **client 侧 7 处**是纯调试残留、可零风险删除（不改 DOM、不改视觉），但收益极小，且 `QuestionEdit.vue` 是 983 行的 GodFile —— 单为一件事动它不划算。
4. **它们都不影响任何门禁**（`hard-metrics` 只查 hex/`!important`/`Modal.confirm`；GodFile 只查行数）。

**建议**：并入**下一轮的"日志口径"小项**（server 走 pino 分级 + client 删 7 处），**不单独占一轮**。

### 5.4 候选 D｜GodFile 10 个（>800 行）→ **可行性评估：两个方向各被一条硬约束阻断，8 轮内不可行**

**现状（冻结树复算，与基线完全一致）**：>800 行 = **10 个**，>500 行 = **19 个**。

| # | 文件 | 行数 | 侧 |
|---|---|---|---|
| 1 | `client/src/views/student/Submit.vue` | **1519** | client |
| 2 | `server/src/services/checkerService.js` | **1280** | server |
| 3 | `server/src/controllers/teacherController.js` | **1233** | server |
| 4 | `client/src/views/Doc.vue` | **1106** | client |
| 5 | `server/src/services/ruleExecutor.js` | **1068** | server（**round 2 执行集将被动瘦身 ≈49 行**） |
| 6 | `server/src/services/deepseek.js` | **1051** | server |
| 7 | `client/src/views/teacher/ReviewDetail.vue` | **988** | client |
| 8 | `client/src/views/teacher/QuestionEdit.vue` | **983** | client |
| 9 | `server/src/controllers/reviewController.js` | **965** | server |
| 10 | `client/src/views/teacher/ProjectQuestionEdit.vue` | **862** | client |

**★ 为什么预算"够"却做不了（本轮最重要的可行性结论）**：

- **server 侧（5 个）被 `arch-metrics` 门禁硬阻断**：拆分一个 `server/src/{services,controllers,utils}/` 下的文件，必然**新增同一 `unlayered` 目录下的文件**（`check-layers.mjs` 的 `layerOf()` 只看 `server/src` 首段是否为四层名）；`未分层待迁移` **47 → 48+** → 门禁判「不增」失败 → **FAIL**。本轮 §5.1 的循环依赖方案正是为绕开这一条才设计成「**零新文件**」。→ 拆 GodFile 从定义上就要求多文件，**与门禁直接冲突**。
- **client 侧（5 个）被 constraints §2 硬阻断**：`client/src/views` 的**视觉·交互·动效**改动一律不动（本项目**无 ui-guard 常驻**）。拆分 `Submit.vue`(1519) / `Doc.vue`(1106) / `ReviewDetail.vue`(988) / `QuestionEdit.vue`(983) / `ProjectQuestionEdit.vue`(862) 这些页面组件，必然重排模板与样式归属 → **撞铁律**。
- **预算算术（次要，但一并给出）**：剩余轮次 round 2..8 = **7 轮 × 8 = 56 文件次**；round 2 已占 **6**（§6）。若 10 个 GodFile 各拆成 2–3 个文件 = **20–30 文件次**，**数字上够**；但如上两条，**实际可行数 = 0**。→ **预算不是瓶颈，门禁与铁律才是。**

**若将来要推进（本轮只给结论，不执行）**：**首刀应切 `server/src/controllers/teacherController.js`（1233 行）** —— 理由：① 纯服务端、零视觉风险；② 它是**控制器**，12 个 handler 可按资源域（exam / question / class / student / team）天然切分；③ 需要的前置护航是 **① 先解决 `unlayered` 门禁**（把切片放进 `interface/` 或先给 `services`/`controllers` 定层）**+ ② 契约测试**（目前 67 套件里覆盖 teacherController 的比例需 C 先量化）。**`Submit.vue`/`Doc.vue` 等前端 GodFile 明确排除在 8 轮之外**（需 ui-guard 专门排期）。

---

## 6 round 2 执行集（**6 个文件 / 预算 8**）

> 优先级原则：**① 能被现有 1011 例测试或三门禁覆盖验证 ② 零视觉风险 ③ 能收口一个工作流**。按风险 **低 → 中** 排序，B 必须**逐项串行**执行并在每项后自证。

### 6.1 执行项 1｜**M-1a**：补齐 `MENU_TITLES`，让 `/teacher/rule-quality` 的 h1 落地（**收口 M-1 的 heading 半边**）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `client/src/views/teacher/Layout.vue:159-162`（`MENU_TITLES` 对象字面量） |
| **问题** | 该字典缺 `'/teacher/rule-quality'`；`RuleQuality.vue` 又无 `.page-title`/`h1`/`h2` → `syncPageTitle()` 得 `''` → `Layout.vue:87` 的 `<h1 v-if="pageTitle" class="visually-hidden">` **不渲染** → 该路由 axe `page-has-heading-one` 命中（入场包 M-1「亮 2 规则/4 节点」之一） |
| **依据** | §5.2；`Layout.vue:159-162`（缺项）、`:163-174`（取值链）、`:86-87`（h1 与 `v-if`）、`:30`（侧栏菜单名 = `规则质量`）、`student/Layout.vue:45` + `admin/Layout.vue:53`（**同构造已出货**） |
| **建议改法** | 在 `:161` 行末追加 ` '/teacher/rule-quality': '规则质量',`（字典加 1 项，**不改模板、不改 CSS、不改任何其它键**） |
| **风险等级** | **低**（零视觉变化**由构造可证**：h1 带 `.visually-hidden`（`style.css:211-221`，abspos+1×1+clip，脱流），且该构造已在 2 个 Layout 生产运行） |
| **验证方法** | ① C 跑 axe（亮/暗）于 `/teacher/rule-quality` → `page-has-heading-one` **归零**；② 4 组像素 sha1 **不变**（若 C 能跑 rig）；③ 回归：其余 6 个 `MENU_TITLES` 路由的标题**不得变化**（逐键核对 + 逐页 h1 文本抽查） |

### 6.2 执行项 2｜**M-2**：`CheckerWizard` 回滚选择器补可访问名称（**收口 M-2**）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `client/src/components/checker/CheckerWizard.vue:82-83` |
| **问题** | `:83` 的 `<a-select>` 只有 `placeholder`，无可访问名称；`:82` 的 `<span class="cw-vlabel">历史版本：</span>` 是**视觉**标签、无程序化关联 → axe `label`/`select-name` **critical** |
| **依据** | §5.2；`style.css:206-221`（本仓定型做法 + `b2-contrast/raw/{before,after}.json` 的 axe 前后证据）；`style.css:209-210`（**禁止 `aria-label`** 的实测结论） |
| **建议改法** | `:82` 之前插 `<label for="cw-rollback-version" class="visually-hidden">历史版本</label>`；给 `:83` 的 `<a-select>` 加 `id="cw-rollback-version"`。**共 2 行改动，不加 CSS**（复用全局 `.visually-hidden`） |
| **风险等级** | **低**（零视觉变化：abspos + 1×1 + clip 脱流；abspos 子元素不参与 flex 布局） |
| **验证方法** | ① C 跑 axe 于自动评分器向导第 4 步（亮/暗）→ label/select-name 违规**归零**；② 确认 `label[for]` 解析到了 `role=combobox` 的 `input`（**不是**外层 `.ant-select` div）；③ 断言「回滚」按钮的 `:disabled="!rollbackTarget"` 行为不变 |

### 6.3 执行项 3｜**零引用令牌收口**：删 4 个无契约令牌 + 恢复 `--btn-default-bg`（**收口任务 1①②**）

| 字段 | 内容 |
|---|---|
| **文件:行号** | `client/src/styles/tokens.css` —— **删** `:61`(`--green-500`)、`:66`(`--amber-500`)、`:75`(`--violet-500`)、**整行删** `:217` 与 `:264`(`--border-inverse` 亮/暗)；**加** 1 行于 `:295` 与 `:296` 之间（`--btn-default-bg: var(--bg-surface);`） |
| **问题** | 4 个令牌在**核心规范 `.md` 0 命中**（唯一出现处 `preview/index.html` 只链镜像 `02-design-tokens.css`、且自称「不属于设计系统」）→ 无契约；`--btn-default-bg` 反之，被 `03-components.md:110` 具名而 round 1 误删 |
| **依据** | §2.2 / §2.3 / §3；判据冻结四条排除项 |
| **建议改法** | **严格按令牌名删/加，不按行号整块删**。⚠️ 三个删除点都是**同行多声明**，只删目标令牌、保留同行其余：`:61` 保 `--green-600`；`:66` 保 `--amber-400` 与 `--amber-600`；`:75` 保 `--violet-50`/`--violet-100`。`--border-inverse` **两处必须同删**（亮/暗对称）。**不得顺手删** `--amber-400`（`03-components.md:317` 有契约）、`--green-600`、`--violet-100`。**不得触碰 60 个应保留令牌中的任何一个** |
| **风险等级** | **低**（4 个零消费；未被 `var()` 消费的自定义属性**不参与计算值**；恢复的那个同样零消费 → 无像素影响） |
| **验证方法** | ① 独立零引用扫描 → 总数 **64 → 61**，且 **61 个全部「有契约」**（可删数 = 0）；② `--btn-default-bg` 声明数 = **1**；③ 4 个令牌在 `client/src`/`server/src`/`trustjudge-server` 的**任何文本形态**（含注释）提及数 = 0；④ `node scripts/gates/hard-metrics.mjs` 仍 PASS（hex6=0/important=0/modalConfirm=0）；⑤ 4 组像素 sha1 不变 |

### 6.4 执行项 4｜**F-1 循环依赖拆解**（**收口最后 1 个 SCC**）

| 字段 | 内容 |
|---|---|
| **文件:行号** | ① `server/src/services/factExtractors/common.js`（追加 `ROOT_PROBE_EXTS`(43 项) / `collectAllFiles` / `resolveProjectRoot`）② `server/src/services/ruleExecutor.js`（**删 938-986**；加 import + `export { resolveProjectRoot };`）③ `server/src/services/factExtractor.js`（**删第 30 行**；`:31-33` import 列表加 `resolveProjectRoot`；**第 39 行再导出逐字保留**） |
| **问题** | `factExtractor.js:30 → ruleExecutor.js` 与 `ruleExecutor.js:21 → factExtractor.js` 互引，构成全仓**唯一** SCC |
| **依据** | §5.1 全部；含 4 条硬约束（零新文件 / 新家 = `common.js` / `SOURCE_EXTS` 43 vs 9 / `collectFiles` ≠ `collectSourceFiles`）与 4 条导出面约束 |
| **建议改法** | **逐字搬移 + 两个再导出面逐字保留**（§5.1「推荐形状」逐条照做）。**禁止**新增文件、**禁止**改判据用到的常量取值、**禁止**删除 `ruleExecutor.js` 的 `SOURCE_EXTS` 导出、**禁止**把 `resolveProjectRoot` 从 `ruleExecutor.js`/`factExtractor.js` 的导出面里去掉 |
| **风险等级** | **中**（评分热路径。降险靠"逐字搬移"+"7 项不变量"） |
| **验证方法** | ① `node scripts/gates/cycle-check.mjs` → **71 文件 / 163 边 / SCC 0**（三个数字都要对上）；② `node server/scripts/check-layers.mjs` → **71 文件 / 违规 0 / 未分层 47**；③ `node scripts/gates/arch-metrics.mjs` → **0 / 47 / 10 / 19** 全不变；④ 后端全量 → **4 处 `Test Suites:` / 1011 passed / 0 failed / 67 套件**；⑤ 定向反证：`fact-extractor` 17 / `rule-executor` 61 / `rule-mutator` 21 分三段各跑一次，且 `fact-extractor` 必须**能 import 到** `resolveProjectRoot`（`:444` 的 describe 仍在跑）；⑥ 行为等价抽查：构造「外层包 + 内层工程」夹具，改前/改后 `resolveProjectRoot` 返回值逐一相等（含只含 `.go`/`.html` 的子目录 —— 专测 43 项 vs 9 项那处陷阱） |

### 6.5 执行集文件清单（**6 个文件**）

| # | 文件 | 改动规模 | 风险 | 对应执行项 |
|---|---|---|---|---|
| 1 | `client/src/views/teacher/Layout.vue` | +1 行（字典 1 项） | 低 | 1 |
| 2 | `client/src/components/checker/CheckerWizard.vue` | +2 行 | 低 | 2 |
| 3 | `client/src/styles/tokens.css` | −4 声明（2 整行 + 3 改行）+1 行 | 低 | 3 |
| 4 | `server/src/services/factExtractors/common.js` | +≈80 行 | 中 | 4 |
| 5 | `server/src/services/ruleExecutor.js` | −49 行 +2 行 | 中 | 4 |
| 6 | `server/src/services/factExtractor.js` | −1 行 +1 词 | 中 | 4 |

> 距 8 文件预算余 **2 个文件位**，保留给 round 3。**注意**：执行项 4 的 3 个文件必须**一次性原子完成**（中间态会留下"函数不存在"或"重复声明"的坏树）；执行项 1/2/3 各自独立、可与 4 解耦。

### 6.6 给 Agent B 的硬边界条件（**违反即本轮作废**）

1. **只改上述 6 个文件**；不动 `client/dist`、不动 `tests/`、不动任何 `.md`（**特别是 `docs/ui-redesign/03-components.md`**）、不动 `antd-theme.js`/`legacy-patch.css`。
2. **不新增任何文件**（`unmigrated 47` 是硬上限）。
3. **不改任何字号 / hex / `!important` / 令牌顺序**；不引入新令牌（执行项 3 的恢复是**回填原值** `var(--bg-surface)`，不是新令牌）。
4. **不得用 `aria-label` 修 `a-select`**（`style.css:209-210` 已有实测反例）。
5. **执行项 4 必须"逐字搬移"**：`ROOT_PROBE_EXTS` 的 43 项与 `ruleExecutor.js:56-61` **逐字相同**；`collectAllFiles` 与 `:176-197` **逐字相同**；`MANIFEST_NAMES` 就地保留。**任何"顺手优化"（合并常量、改遍历、改判断顺序）都视为超范围。**
6. **改完必须自证并回报**：每项的执行前后计数、`cycle-check` 三个数字、`check-layers` 三个数字、`hard-metrics` 三项，以及 `tokens.css` 的**行号映射**（哪些行被删/改/加）。

---

## 7 本轮不做清单（含原因）

| # | 项 | 目标文件 | 为何不做 |
|---|---|---|---|
| 1 | **M-1b `.ant-statistic-title` 对比度** | `client/src/views/teacher/RuleQuality.vue` | **改渲染颜色 = 视觉变更**，不在 constraints §2 的 a11y 豁免枚举（aria/label/heading）内；本项目无 ui-guard。且它属**既有、超出 QA 12 页基线**的违规，不阻断 §5 判据。修法已给出，待设计侧对照授权 |
| 2 | **N-1 `--duration-page` 契约悬空** | `tokens.css` 或 `04-interaction-a11y.md` | 补声明 = 新增**零消费**令牌，与 round 1 清理方向相反；正解有两条（实现页面切换过渡 / 退休 spec 行），属**设计决策** |
| 3 | **N-2 12 个 `--tag-*-{fg,bg}` 与设计文档不一致** | `docs/ui-redesign/03-components.md:276,279` | 契约**已被同文档 §⑥/§⑦ 取代**（实现走 `--status-*` 且与文档一致）→ 正解是**改文档**，而设计文档不在本流水线授权范围内。已给出精确修订建议，上报设计侧对齐 |
| 4 | **空 catch 7 处** | 5 文件 | 跨 5 文件 = 吃掉 5/8 预算；`Submit.vue:705` 是**有意降级**（改它=改语义，须单独立项）；不影响任何门禁 |
| 5 | **`console.log` 19 处** | 3 文件 | server 12 处是**生产排障线索**，正解是 pino 分级（**行为变更**，需 C 护航）；client 7 处收益极小。→ 并入下一轮"日志口径"小项 |
| 6 | **GodFile 拆分（10 个）** | 10 文件 | **两个方向各被一条硬约束阻断**：server 侧撞 `unmigrated ≤ 47` 门禁；client 侧撞 constraints §2 视觉铁律。**预算不是瓶颈**。首刀方案（`teacherController.js`）与前置护航已给出，需专门排期 |
| 7 | **分层迁移 47 个未分层文件** | 47 文件 | 同 GodFile：`check-layers.mjs` 违规已为 **0**，迁移动机是「完备性」而非「违规」；且迁移中间态会让 `unmigrated` 先升 → 必撞门禁 → 需一次性大爆炸式提交，风险远高于收益 |
| 8 | **O-1 换基线（构建 + 重测）** | 仓库外 outDir + `pipeline-status.md` | 需 Captain 触发、且需在仓库外构建（本轮无构建授权）。**流程已在 §4 给出** |
| 9 | **`experiment-variance.test.js` 同进程污染** | `server/package.json` | round 1 已实测 **PASS**（C §V1 附带发现）→ 保持**观察**，不提前拆段 |
| 10 | **`--ink-muted` 遗留令牌迁移**（`client/src/style.css:29`） | 1 文件 | 迁移 = 改视觉风险；需先在 `tokens.css` 建别名并逐页替换，非单轮可完成（round 1 §7-7 已判） |
| 11 | **`--canvas-parchment` 死引用**（`client/src/views/Login.vue:161`） | 1 文件 | 落在 `views`，改它需证零视觉变化；且它**从未被声明过**（`style.css:13` 只在注释里提），当前声明本就失效 —— 属既有缺陷，优先级低于本轮 4 项 |

---

## 8 局限与未覆盖声明（诚实清单）

1. **未跑 jest**（C 职责，任务明令禁止）→ §5.1/§6.4 的「1011/0 不变」是**推导预期**，须由 C 实测。
2. **未跑 axe** → §5.2 的 M-1a/M-1b/M-2 结论中，「哪条 axe 规则命中、命中几个节点」引自 `docs/reports/审查团队入场包-2026-10-10.md` §3 与 merge-验证 记录，**本轮未独立复现**。M-1a 的**根因链**（MENU_TITLES 缺项 → pageTitle 空 → h1 不渲染）是**静态推断但可完全复算**（本报告给出全部命令）；M-1b 的「antd 默认 `rgba(0,0,0,.45)` → ≈3.4:1」是**手算推断**，未经 axe 确认，**须 C 用 axe 报告确认实际渲染类名与计算色**。
3. **未做像素 sha1** → 三项「零视觉变化」都是**构造性/语义性证明**，不是像素证据。其中 M-1a/M-2 的证明强度最高（复用了已在生产验证的既有构造）；执行项 3 的证明强度次之（CSS 语义 + 双向零引用 + 产物旁证）。**若 Captain 要求像素级证据，须由 C 用 rig 私有副本（:3100）补做**（不得重建 `client/dist`）。
4. **三门禁中只复算了两个**。本轮**确在冻结副本上跑了两次只读复算**（`check-layers.mjs` 无 `--save-baseline` → 不写文件；`cycle-check.mjs` 纯读）用于钉死基线（**71/0/47** 与 **71/163/SCC1**）。`arch-metrics.mjs` 与 `hard-metrics.mjs` **未跑**（C 职责），其基线值引自 `test-round-01.md` §V2。
5. **§5.4 的「切片放进 `interface/`」只是一个方向性提示，未做可行性验证** —— `check-layers.mjs` 对 `interface/` 只禁 `→ infrastructure`，理论上可容纳控制器切片，但会改变分层语义，需专门设计。
6. **契约判据是我冻结的一把尺子，不是唯一可能的尺子**（§2.2）。我给出四条排除项（开放族引用、镜像声明、pipeline 元文档、审计夹具）与**成例反证**（round 1 已删 44 个全在镜像中而判 PASS），但「花括号枚举算不算逐条具名」属**边界判断**：我按「可机械展开为有限名集」纳入（故 N-2 的 12 个 tag 令牌被判定"有契约"）；若 Captain 改用更严的「必须逐名出现」口径，N-2 的 12 个会落到"无契约"，但**裁定结论（不恢复）不变** —— 因为它们的正解是改文档。
7. **未验证 `docs/ui-redesign/02-design-tokens.css` 与实现的逐字节一致性历史** —— 本轮只测「同一时刻」的集合差（289 vs 252 / mirror-only 45 / impl-only 8）。**镜像在历史上是否曾与实现 1:1，本轮不下结论。**
8. **未扫描 `client/dist` 文件内容**（只 `ls` 了 assets 目录名做 O-1 口径说明）；**未读 `tests/` 下任何二进制**。§4 的 O-1 结论不依赖产物内容，只依赖 C 在 `test-round-01.md` §V4 已留档的 sha256。
9. **行号锚点基于 `8fb2c1d` 冻结副本**。执行项 3 同时含 3 处"改行"（不增删行）与 2 处"整行删"、1 处"插入"，**删/插会使后续行号位移** → **必须按令牌名定位，行号仅作辅助**（round 1 §4.1 的告诫同样适用）。
10. **未评估 `pino` 日志分级改造的具体工作量**（§5.3 只给方向）。
11. **本轮不重做 round 0 全量扫描**（规范 §六.3）。因此 r0 的 F-2..F-5、安全专项、`tests/` 装置侧结论**未被本轮复查**，其时效性仍以 `audit-round-00.md`/`audit-round-01.md` 为准。

---

*本报告由 Agent A（`code-analyzer`）于 round 2 产出；唯一写入文件为 `docs/pipeline/audit-round-02.md`。全部测量均在同一冻结副本 `/tmp/a2-freeze`（`git archive 8fb2c1d`）上完成；临时脚本 `/tmp/a2-*.mjs` 全部未入仓。*
