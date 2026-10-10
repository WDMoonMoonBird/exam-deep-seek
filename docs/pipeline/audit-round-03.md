# audit-round-03 —— 增量架构审查报告（流水线第 3 轮）

> 轮次：**03（增量审查，禁止全仓重扫）** ｜ 日期：**2026-10-11（凌晨）** ｜ 基线 commit：`4b531b8`（round 2 已提交）
> Agent A 技能：`code-analyzer`（本仓约定 = 规范里的 `deep-code-analyzer`）
> 上游输入：`docs/pipeline/audit-round-02.md`（§7 本轮不做清单）、`refactor-round-02.md`（R1/R2/R4）、`test-round-02.md`（§8 缺陷分级 / §9.3 残留风险 C5）、`project-constraints.md`（11 条测量纪律 + 四段口径 912/17/61/21 = 1011 + 基线 0 failed）、`pipeline-status.md`
> 方法：**冻结副本测量**（`git archive 4b531b8` → `/tmp/a3-freeze`，**1013** 个被跟踪文件）+ **独立实现扫描器/对拍器**（全部落 `/tmp/a3-*.mjs`，未复用 `/tmp/a1*` / `/tmp/a2*` / `/tmp/b2*` / `/tmp/c-r2*`）+ **限定范围**

---

## 0 约束遵守声明

| 约束 | 执行情况 |
|---|---|
| 纯只读（除本报告外不写任何文件） | ✅ 唯一写入 `docs/pipeline/audit-round-03.md`；全部临时脚本落 `/tmp`（`/tmp/a3-*.mjs`），未入仓 |
| 禁止 `git clean` / `stash` / `checkout -- .` / `reset --hard` / `restore .`；禁止任何 git 写操作 | ✅ 全程只用 `rev-parse` / `log` / `status` / `diff` / `ls-files` / `archive` / `show`；**零 git 写操作** |
| 不跑 jest（C 职责） | ✅ 未执行任何 jest 命令；**未改 `server/test/`**（仅只读 grep 定位 import 面） |
| 不跑 build / 不重建 `client/dist` | ✅ 未执行任何构建；未 ls、未读 `client/dist` |
| 不启动服务、不碰 `:5173` / `:3000` | ✅ 未启动/重启/kill 任何进程，未占用任何端口 |
| 不写 `tests/`、禁止重跑 `ledger-check.mjs --out=raw/ledger.json` | ✅ 未写 `tests/`；未执行 `ledger-check.mjs` |
| 先冻结再测（陷阱 7） | ✅ 全部测量在 `/tmp/a3-freeze`；**对拍/模拟在 `/tmp/a3-sim`（冻结树副本）上进行**，活树零改动 |
| 陷阱 8：`git status` 对未跟踪目录无证据力 | ✅ 未用 `git status` 推断 `tests/` / `client/dist` 未被触碰；报告**不声明**对二者的写否结论（A 未写任何一处） |
| 陷阱 10：行号/计数以冻结树实测为准 | ✅ **全部行号自己数过**，未采信任何前轮数字；并主动复现/纠正 round 2 遗留的口径（见 §2.0） |
| 陷阱 11：计数带词边界 | ✅ 全部计数用词边界正则（`console` + `.log` 加 `\b`；`\bSOURCE_EXTS\b` 等） |
| 增量范围（规范 §六.3） | ✅ 只审「近两轮改动相关文件 + 核心架构文件 + 任务指定候选」：C-1 `defectPrecheck.js`、C-2 空 catch 7 处、C-3 `console.log` 19 处、C-4 round 2 的 6 个文件、C-5 同族缺陷。**未重扫** r0 的 F-1..F-7 全量，**未复算**令牌表 |

### 0.1 基线复算（A 自己跑的，非引用）

```bash
cd "<repo>"
git rev-parse HEAD            # → 419477a13c5fce529cd17635590c433401c327de
git diff --name-status 4b531b8..HEAD
#   M  docs/pipeline/project-constraints.md      (13+/4-)
#   M  pipeline-status.md                        (15+/18-)
#   → 4b531b8 之后只有 2 个 .md 变化；源码树 == 4b531b8，故本轮所有源码测量等价于对基线
rm -rf /tmp/a3-freeze && mkdir -p /tmp/a3-freeze && git archive 4b531b8 | tar -x -C /tmp/a3-freeze
find /tmp/a3-freeze -type f | wc -l   # → 1013（= git ls-files | wc -l）
```

| 门禁 | 原始输出（活树 = 4b531b8 源码） | 结论 |
|---|---|---|
| `node scripts/gates/cycle-check.mjs` | 扫描 **71 文件 / 163 条相对导入边**；SCC 大小大于 1 的 = **0**；自环 0 | **PASS** |
| `node server/scripts/check-layers.mjs` | 文件 **71**，违规 **0**，未分层待迁移 **47** | — |
| `node scripts/gates/arch-metrics.mjs` | 0 / 47 / **10**（+ 观察带 **19**） | **PASS** |
| `node scripts/gates/hard-metrics.mjs` | hex6 **0** / important **0** / modalConfirm **0**（样本 41 文件；非 style.css 的 important = 20，按设计） | **PASS** |
| `find server/src client/src -type f` 计数 | **146** | — |

> `check-layers.mjs` **只在传 `--save-baseline` 时写文件**（源码 :127 `fs.writeFileSync`）；本轮未传 → 复算零写入；跑完 `git status` 无被跟踪文件变化（仅既存未跟踪目录）。
> **GodFile 大于 800 行实测 10 个**：Submit.vue(1519) · checkerService.js(1280) · teacherController.js(1233) · Doc.vue(1106) · deepseek.js(1051) · **ruleExecutor.js(1023)** · ReviewDetail.vue(988) · QuestionEdit.vue(983) · reviewController.js(965) · ProjectQuestionEdit.vue(862)。

---

## 1 任务 3｜终止条件对照表（截至 round 3）

对照 `project-constraints.md` §5 的六项判据。**本表直接进入最终总结报告。**

| # | 判据（§5） | 达标线 | round 3 实测 | **能否达成** | 卡点 |
|---|---|---|---|---|---|
| 1 | 分层违规 | **0**，且未分层待迁移数**不增**（基线 47） | 违规 **0** / 未分层 **47** | ✅ **能** | 已达成；本轮执行集**零新增文件**，只会持平或下降 |
| 2 | GodFile | **大于 800 行 = 超标**（基线 **10** 个） | **10 个**（ruleExecutor.js 1023 为最小者） | ❌ **不能** | **双向硬阻断**：① server 侧拆分必**新增 services/ 或 controllers/ 下的 unlayered 文件** → 未分层 **47 → 48+** → `arch-metrics` 判「不增」失败（源码判据 `unmigrated > 47 ? FAIL`）；② client 侧 5 个全在 `client/src/views` → 撞 constraints §2「视觉·交互·动效一律不动（无 ui-guard）」铁律。**预算（余 6 轮 × 8 = 48 文件次）不是瓶颈** |
| 3 | 硬指标（去注释） | hex(6)=**0**、important=**0**、views 内 Modal.confirm=**0** | **0 / 0 / 0** | ✅ **能** | 已达成；本轮执行集**不触碰任何 CSS / .vue** |
| 4 | 后端回归 | failed 不超过 baseline（**目标 0**） | round 2 = **1011 passed / 0 failed**（四段 912+17+61+21） | ✅ **能**（待 C 复跑确认） | 已达成；本轮执行集只**删死代码 / 改导入**，不新增分支 |
| 5 | 无障碍 | **不得引入新的** axe 违规 | round 2：page-has-heading-one 1→0、label 1→0，**0 新增** | ✅ **能**（有条件） | 判据是「不得引入**新的**」。注意既定基线**只覆盖 QA 原始 12 页集**；M-1b（.ant-statistic-title 对比度约 3.4:1）是**既有的、超出基线的**违规，**不违约**。本轮执行集**零 client 改动** → 不引入新违规 |
| 6 | 轮次上限 | **8 轮** | round 3 | ✅ **能** | round 3 = 第 4 轮（00..03），余量充足 |

**结论：六项中 5 项能达成，仅第 2 项（GodFile）不能达成** → 收尾按「**部分达标**」出报告（与 `pipeline-status.md` 的既定判断一致；本轮**独立复现并加固**了该结论：给出 `arch-metrics.mjs:63` 的确切代码依据与「双向阻断」的完整论证）。

> **附带达成项（§5 表外、门禁已覆盖）**：**循环依赖 SCC = 0**（round 2 消除最后一个 SCC，本轮复算仍 0）。这是全仓无环、**强于 §5 要求**的结果。

### 1.1 必须由用户拍板的事项清单（6 项）

| # | 事项 | 为何 Agent 不能自行决定 | 证据 | 选项 |
|---|---|---|---|---|
| **P1** | **GodFile 10 个如何处置** | 拆 = 撞门禁（server）/ 撞铁律（client）；不拆 = 判据 2 永远不达标。**两者都是"改规则"级别**，超出 A/B/C 授权 | 本轮复算 10 个及行数；给出双向阻断的代码级依据 | ① 放宽 §5 判据 2 为「不劣化」（基线保持 10）；② 先解 unlayered 分层（给 services/ 与 controllers/ 定层）再拆 server 侧 5 个；③ 接受「部分达标」出报告 |
| **P2** | **是否引入 ui-guard** | 无 ui-guard = client 侧任何视觉/结构改动都不可验证 → 锁死 client 侧 5 个 GodFile **与** M-1b | round 2 的 V8 已证明「**改前 vs 改后像素 sha1 全等**」这条路**本仓可执行**（C 用 rig 私有副本跑通，6/6 全等 + 构建 byte-identical） | ① 把 round 2 的临时装置**固化为** `scripts/gates/` 的「像素 sha1 + axe」入口（对应必改清单 **G-4**，目前仍缺）；② 明确「像素全等」是否**等价于** ui-guard 授权 |
| **P3** | **N-1 `--duration-page` 契约悬空** | 正解二选一（① 实现 380ms 页面切换过渡；② 从 spec 退休该行）——**都是设计决策**；补声明 = 新增零消费令牌，与 round 1 清理方向相反 | round 2 `audit-round-02.md` §2.4（本轮未重扫，沿用） | 交**设计侧**裁定 |
| **P4** | **N-2 12 个 `--tag-*-{fg,bg}` 与设计文档矛盾** | 正解是**改设计文档**（`03-components.md:276,279` 改为 `--status-*`），设计文档不在本流水线授权内 | round 2 §2.5（本轮未重扫，沿用） | 交**设计侧**对齐 |
| **P5** | **M-1b 是否破例**（RuleQuality.vue 的 .ant-statistic-title 对比度） | 改渲染颜色 = **视觉变更**，不在 constraints §2 的 a11y 豁免枚举（aria/label/heading）内 | round 2 §5.2：根因 = `antd-theme.js` **无** colorTextDescription 覆盖 → 走 antd 上游默认 rgba(0,0,0,.45) 约 **3.4:1**；**属既有、超 QA 12 页基线**的违规，**不阻断判据 5** | ① **不破例（推荐**：不阻断任何判据，且留痕）；② 破例 → 需 P2 的像素对照授权 |
| **P6** | 本轮新增：**288 行「生产死代码」如何处置**（defectPrecheck.js 189 + defectScoring.js 99） | **删除会动 `server/test/`**（其测试文件在 :9/:10 **静态 import** 这两个模块）→ 该套件将在 **import 期失败** → 1011 基线变成约 1006、67 套件变 66 → **等于改动回归基线**。B 无权改 `server/test/`，且末轮改基线风险极高 | **本轮核心新发现**（§2.1(c)）：两模块在**生产代码中 0 引用**，只被自己的测试引用 | ① **保留（推荐**：无害、有测试守护、其用例正好为 C-1 的统一实现提供回归保护）；② 授权「删模块 + 删对应测试」并同步修订 1011 基线；③ 明确标注为「保留但冻结的未接线特性」 |

---

## 2 候选逐项评估（任务 1）

### 2.0 先纠正 round 2 遗留的两处口径（陷阱 10 要求）

| 项 | round 2 报告的说法 | **冻结树实测（本轮）** | 处置 |
|---|---|---|---|
| `SOURCE_EXTS`（ruleExecutor.js）项数 | A 报 43 → C 纠正为 **37** | **37**（逐项数过：前端 13 + 后端 15 + 脚本/数据/配置 9） | ✅ **以 C 的 37 为准**，本轮确认 |
| `collectFiles` 区间（8fb2c1d） | A 报 176-197 → C 纠正为 **172-198** | round 3 活树已位移：**ruleExecutor.js:181-203**（函数体，23 行） | ✅ **以 C 为准**；本轮全部改用**自己实测的活树行号** |
| 零引用令牌口径 | A/B/C 三份报告三套表述 | 本轮**未复算**（不在候选内） | 沿用 round 2 C 的裁定：**固定严格口径（注释不计引用）= 61** |

---

### 2.1 候选 C-1｜defectPrecheck.js 的第三份 resolveProjectRoot（**优先项**）

#### (a) 是否存在？—— **存在，确认无疑**

```bash
cd /tmp/a3-freeze
grep -rn 'resolveProjectRoot' server/src --include='*.js'
#   server/src/services/defectPrecheck.js:54:export function resolveProjectRoot(rootDir) {   ← 第三份
#   server/src/services/factExtractors/common.js:325:export function resolveProjectRoot(rootDir) {  ← round 2 下沉后的单一实现
#   server/src/services/ruleExecutor.js:22/29/970（import + 再导出 + 调用）
#   server/src/services/factExtractor.js:31/38/78（import + 再导出 + 调用）
wc -l server/src/services/defectPrecheck.js   # → 189
```

- **声明**：defectPrecheck.js:54（私有实现）；**调用**：:100、:134；**再导出**：:189 的 default export 对象。
- 与 common.js:325 版本**功能重复**，但**语义已漂移**。

#### (b) 是否漂移？—— **是，13 个探针用例中 8 个发散（8/13）**

本轮自建**行为对拍器** `/tmp/a3-drift.mjs`（在合成夹具上同时调用两份实现并比对返回值）：

| # | 夹具（rootDir 内容） | common.js | defectPrecheck.js | 同否 |
|---|---|---|---|---|
| A | 单子目录含 .vue | UserManagement | UserManagement | ✅（**测试覆盖的唯一形态**） |
| B | 单子目录仅 main.go | proj | .（不下钻） | ❌ |
| C | 单子目录仅 index.html | proj | . | ❌ |
| D | 单子目录仅 data.json | proj | . | ❌ |
| E | 单子目录仅 package.json | proj | . | ❌ |
| F | 单子目录仅 README.md | . | . | ✅ |
| G | 单子目录名 dist | . | dist | ❌ |
| H | 单子目录名 target | . | target | ❌ |
| I | 根有 package.json + 单 src/ | .（清单短路） | src | ❌ |
| J | 根有 pom.xml + 单 src/ | . | src | ❌ |
| K/L | 单子目录仅 .java / .py | proj | proj | ✅ |
| M | 唯一子目录被 SKIP_DIRS 跳过 | . | . | ✅ |

**DIVERGENT CASES: 8 / 13**。四条根因：

1. **探测白名单宽度**：defectPrecheck.js:42 的 SRC_EXTS = **9 项**（js/mjs/cjs/jsx/ts/tsx/vue/java/py）vs common.js:277 的 ROOT_PROBE_EXTS = **37 项** → 用例 B/C/D/E。
2. **子目录枚举未过滤 SKIP_DIRS**：defectPrecheck.js:58-60 只滤隐藏项；common.js:339 额外滤 SKIP_DIRS → 用例 G/H。
3. **缺 P0-1 清单短路**：common.js:346-355 有 MANIFEST_NAMES 检查；defect 版**完全没有** → 用例 I/J（Java 工程 pom.xml + src/ 会被误下钻，**这正是 round 2 注释里写明"一并修复"的既有缺陷**）。
4. **无 path.resolve 归一 / 无 root 的 isDirectory 前置检查**（common.js:327-334）—— 本轮实测该差异在「相对路径」与「root 是文件」两个用例上**未产生可观察差异**（两条路径都原样返回），故**不列为发散项**；但属**结构性差异**，保留登记。

#### (c) **决定性发现：该模块在生产代码中零引用（288 行死代码）**

```bash
cd /tmp/a3-freeze
grep -rn -E "defectPrecheck|defectScoring|precheckProject|scoreDefects|defect-precheck" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist
#   命中仅三类：
#     ① server/test/unit/infrastructure/defect-precheck.test.js （其自己的单测，:9/:10 静态 import）
#     ② server/src/services/defectPrecheck.js、defectScoring.js 自身
#     ③ docs/（设计文档 docs/plan/2026-09-06-trustjudge-consistency-design.md）
#   → 生产代码（server/src 除自身外、client/src、trustjudge-server）0 引用
find . -iname '*defect*' -not -path './node_modules/*' -not -path './.git/*'
#   → 只有那 3 个文件
grep -n "precheck|defect" server/src/services/projectGrading.js     # → 0 命中
#   设计文档 :87 写「legacy 路径：projectGrading.js 在调 gradeProject 前执行 precheckProject」
#     —— 实测从未接线
```

→ **defectPrecheck.js（189 行）+ defectScoring.js（99 行）= 288 行的"确定性缺陷预检"特性整体未接线**。
→ 这把 C-1 的定性**从「评分链路上的重复实现」修正为「未接线模块里的一份陈旧拷贝」**：**它的漂移对生产行为影响严格为 0**。

#### (d) 测试覆盖证据（任务明确要求）—— **覆盖存在，但只覆盖 A 形态；不能证明统一后的正确性**

```bash
ls -d server/uploads/project-submissions/353/1068/1     # → 存在 → 守卫不跳过
grep -n 'maybe = hasData' server/test/.../defect-precheck.test.js
#   :15  const hasData = fs.existsSync(path.join(UPLOADS,'project-submissions','353','1068','1'))
#   :23  const maybe = hasData ? describe : describe.skip;
grep -n 'PASS test/unit/infrastructure/defect-precheck.test.js' docs/pipeline/test-round-02.log
#   → 902:PASS ...
grep -n '^Tests:' docs/pipeline/test-round-02.log
#   → 1234: Tests: 912 passed, 912 total   ← 无 skipped 字样 = 该套件 5 例真的在跑
for n in 1066 1067 1068; do ls -1 server/uploads/project-submissions/353/$n/1; done
#   1066 → UserManagement    1067 → UserManagement    1068 → UserManagement_副本
#   三个夹具根下都恰好只有一个子目录，且都含 .vue/.js
#   → resolveProjectRoot 的「下钻」分支被真实执行（不是空跑）
```

**关键限制（必须写明，否则会产生假信心）**：三个夹具命中 §(b) 的**用例 A 形态** —— 两份实现在该形态上**返回值完全相同**。
→ 这 5 例是**「不会被打断」的非回归护栏**，**不是**「行为等价」的证明。**真正需要新测试的是 §(b) 的 8 个发散形态。**

#### (e) 可行性、影响面、裁定

| 维度 | 结论 |
|---|---|
| 统一到 common.js 是否可行？ | ✅ **可行**。common.js 只 import `node:fs` / `node:path`（:17-18），defectPrecheck.js → common.js 是**单向新边，不造环** |
| 是否新增文件？ | ❌ **不新增**（unmigrated 47 不动） |
| 生产影响面 | **严格为 0**（无生产消费方）。**不触碰评分链路** → 风险**低于** round 2 的 F-1 |
| 行为变更 | **有**：8/13 探针形态的返回值会改变（**朝 common.js 的 P0-1 修正语义收敛**）。因无消费方，属"为未来接线预置正确语义" |
| 顺带清理 | hasSourceFiles（:44-49，**唯一调用点是待删的私有 resolveProjectRoot**）→ 变为死代码，应同删。SRC_EXTS（:42）**必须保留**（:103 的 srcFiles 过滤仍在用） |

> ### **C-1 裁定：本轮做**（执行集第 1 项）
> 理由：① 它是 round 2 R4 的正式收口；② 风险严格低于前两轮任何一项（无消费方）；③ 可由 1011 例中的 defect-precheck 5 例 + 全量回归**直接验证不回归**；④ 消除**第三份**拷贝后，resolveProjectRoot 全仓**只剩一份实现**（common.js:325）+ 两处**纯再导出**（ruleExecutor.js:29、factExtractor.js:38）。

---

### 2.2 候选 C-2｜空 catch 7 处（5 文件）→ **裁定：7 处全部"保持静默"，本轮不做**

**实测行号**（冻结树，自数；与 round 2 报告**逐条一致**）：

| # | 位置 | 语义 | 裁定 | 依据 |
|---|---|---|---|---|
| 1 | server/src/controllers/adminController.js:367 | 读错误日志文件的循环；单文件读失败跳过 | **保持静默** | 下游 :379 result.logs 已用空串兜底为 '(日志为空)' 的**显式降级输出**；补日志 = **改接口响应体** |
| 2 | server/src/controllers/adminController.js:377 | 同上（输出日志） | **保持静默** | 同上 |
| 3 | server/src/controllers/teacherController.js:125 | 目录遍历逐文件读取；不可读文件跳过 | **保持静默** | 有意降级（不中断整批）；补日志 = 每文件一次噪声。**唯一无注释的一处** |
| 4 | client/src/views/student/Submit.vue:705 | JSON.parse(sub.answer 或 '[]') 失败 → answers 置空数组 | **保持静默（有意降级）** | round 2 已裁定；改它 = **改评分语义**（客观题小问全不判分是定义好的回退）。**必须单独立项 + 需评分口径授权** |
| 5 | client/src/views/student/Layout.vue:150 | request.get('/student/profile') 失败 → schoolName 留空 | **保持静默** | **本轮决定性证据**：client/src/api/request.js:70-72 的响应拦截器**已经全局 message.error**（非 silent 请求）→ 空 catch 是**有意的"不二次提示"** |
| 6 | client/src/views/teacher/Students.vue:287 | await request.put(...) 失败 | **保持静默** | 同 #5：全局拦截器已弹错；空 catch 避免重复 toast |
| 7 | client/src/views/teacher/Students.vue:305 | resetPassword() 的 request.put 失败 | **保持静默** | 同 #5 |

**本轮新增的决定性判据**（round 2 未给出）—— `client/src/api/request.js:55-75`：响应拦截器在「业务码非 0」与「HTTP/网络错误」两条分支上都调用 `message.error(...)`，**仅当** `isSilent(config)`（即调用方传了 `{silent:true}`）或命中 1007 软警告白名单时才不弹。

→ 3 个 client 空 catch 所在调用**均未传 silent** → **用户必然会看到全局错误提示**。空 catch 不构成"静默失败"，**改它反而会增加重复提示（回归 UX）**。

**裁定：7/7 保持静默，零改动。** 唯一可做的是给 teacherController.js:125 补一行解释性注释（它是 7 处里唯一**既无 catch 内注释、也无全局兜底**的）—— 但该文件是 **1233 行的 GodFile**（超标），为一行注释动它**性价比为负** → **不做**。

---

### 2.3 候选 C-3｜console.log 残留 19 处（server 12 + client 7）→ **裁定：区分成立，但两类本轮都不清**

**实测**（词边界 `console` + `.log`，冻结树自数；与 round 2 报告**逐条一致**）：

```bash
grep -rnE 'console\.log\b' server/src --include='*.js' | wc -l   # → 12
grep -rnE 'console\.log\b' client/src --include='*.vue' | wc -l  # → 7
# 另：console.error（server 6 / client 2）、console.warn/info/debug = 0
```

| 类 | 位置 | 判定 | 理由 |
|---|---|---|---|
| **有意的运维日志**（12） | teacherController.js:324,329,331,333,1225,1227（前缀 parseExam / generateReference）+ deepseek.js:243,272,278,279,360,370（前缀 parseExamPaper / parseExamPaperStream） | **不是"残留"** | 带**结构化前缀**，描述「收到多少字符 / 截断到多少 / 第几次尝试 / 返回几题」——**LLM 解析链路的唯一现场线索**。删除 = **降低可诊断性**。正解是接 server/src/utils/logger.js（pino）并降 debug 级 = **行为变更**，须 C 护航 + 需"日志口径"专项 |
| **纯调试残留**（7） | client/src/views/teacher/QuestionEdit.vue:542,546,548,551,554,557,598 | **确属残留** | 前缀「上传试卷」的临时打印（文件名/大小/扩展名/mammoth 与 xlsx 解析结果）。**无运维价值** |

**为何"确属残留"的那 7 处本轮仍不做**（三条，按强度）：

1. **不可验证**（违反本轮优先级 ①）。1011 例**全部在 server 侧**，client 无任何测试；三门禁（cycle-check / check-layers / hard-metrics）**不看 console** → 改动**没有任何现有判据能证明它没坏**。
2. **落在铁律区 + GodFile**：client/src/views/... 虽 console.log **不属** §2 的"视觉·交互·动效"（故**并非禁止**），但 QuestionEdit.vue 是 **983 行 GodFile**，为清 7 行日志动它是**负性价比**。
3. **不阻断任何终止条件**：§5 六项判据无一项与 console 相关。

> **给未来轮次的可用验证配方**（若 Captain 追加）：C 的 rig 已走 CDP —— 可断言 Runtime.consoleAPICalled 中「上传试卷」前缀消息数 = 0，且**像素 sha1 不变**（console 无像素）。本轮**无此预算**。

**附带安全观察（登记，不改）**：deepseek.js:272 把 LLM 原始响应**前 300 字符**打进展日志，:279 逐题打印 stem 前 30 字 → 生产 stdout 存在**内容外泄面**。改它 = 行为变更，须与"日志口径"专项一并处置。

**裁定：19 处本轮零清理**（12 = 有意运维日志；7 = 确属残留但不可验证 + 高摩擦文件）。

---

### 2.4 候选 C-4｜增量自查：近两轮 6 个文件有无**新引入**的坏味道 → **1 处真新债（入执行集）+ 1 处诚实更正**

**6 个文件实测行数（arch-metrics 口径 = 换行符计数）**：

| 文件 | 行数 | 是否越线 |
|---|---|---|
| client/src/views/teacher/Layout.vue | **491** | 小于 500（**距观察带仅 9 行**，见下） |
| client/src/components/checker/CheckerWizard.vue | **514** | 已在观察带内（round 1 起；round 2 加 2 行**未改变计数**：19 不变） |
| client/src/styles/tokens.css | 430 | 非 .vue/.js → **不入 GodFile 统计** |
| server/src/services/factExtractors/common.js | **363** | **未跨入观察带**（round 2 R7 预判成立；比 A 预估约 344 多 19 行 = 溯源注释块） |
| server/src/services/ruleExecutor.js | **1023** | 大于 800（GodFile 之一；round 2 由 1068 降 45 行，**未改变 10 这个计数**） |
| server/src/services/factExtractor.js | 165 | 正常 |

> **回答任务原问**：「common.js 现在多少行？是否跨入大于 500 的观察带？」→ **363 行，未跨入**（余量 137 行）。**且**本轮执行集**不会**再向 common.js 增行（C-1 只是从 common.js **导入**，不追加实现）。
> **边界提醒**：teacher/Layout.vue = **491**，距 500 只剩 **9 行**。任何后续向该文件追加逻辑都会把它推进观察带（19 → 20）。观察带**不计判据**，故不阻断；但应登记为**观察项**。

#### 新发现（真新债，来自 round 2）：ruleExecutor.js 留下一份**孤立的 37 项重复常量 + 失效注释**

```bash
cd /tmp/a3-freeze
sed -n '56,67p' server/src/services/ruleExecutor.js
#   56 /**
#   57  * 源码扩展名白名单（resolveProjectRoot 探测「子目录是否含源码」用）。   ← 注释已失效
#   58  * @type {Set<string>}
#   59  */
#   60 export const SOURCE_EXTS = new Set([ … 37 项 … ]);
#   67 ]);
#   —— 逐项比对两处 37 项字面量：
#   ruleExecutor.SOURCE_EXTS  n=37
#   common.ROOT_PROBE_EXTS    n=37
#   EQUAL (order-sensitive) = true      ← 逐字相同
grep -c 'SOURCE_EXTS' server/src/services/ruleExecutor.js   # → 1（仅声明行，本文件零读取）
grep -rn 'SOURCE_EXTS' server/test                          # → 0 命中
```

| 事实 | 证据 |
|---|---|
| ruleExecutor.js:56-67 的 37 项白名单与 common.js:277-284 的 ROOT_PROBE_EXTS **逐字相同** | order-sensitive 比对 = true |
| 该常量在 ruleExecutor.js **内部零读取** | 全文只命中 :60 声明行 |
| 全仓**无任何模块 import 它** | 所有 `from './ruleExecutor.js'` 的导入面：`{runRules, resolveProjectRoot}`、`{validateRules, runRules, resolveProjectRoot}`、`{runRules}`、测试 `{validateRules, resolveProjectRoot, runRules, RULE_TYPES}` → **均不含 SOURCE_EXTS** |
| server/test 中命中 **0** | 见上 |
| **注释所指的函数已不在本文件** | resolveProjectRoot 于 round 2 下沉至 common.js，本文件只余 import(:22) + 再导出(:29) |

→ **定性**：round 2 把函数搬走了，却把它的**常量副本与 JSDoc 留在原地**，形成「**同一份 37 项白名单的两个副本**」——**正是本流水线要消灭的"多份拷贝"病理**（与 C-1 同类）。round 2 §5.1 的"保持原样不动（最小 diff）"在**当时**是合理取舍，但**注释失效**与**副本产生**是它的**可预见副作用**，属**本轮应清的新债**。

#### 诚实更正：round 2 新增的 2 个零外部引用导出 —— **不是新债**

| 符号 | 位置 | 外部引用 |
|---|---|---|
| ROOT_PROBE_EXTS | common.js:277 | **0**（仅 :360 自用） |
| collectAllFiles | common.js:291 | **0**（仅 :358 自用） |

**但同日实测：该模块此前已有 2 个同类** —— EXT_LANGUAGE(:24)、MANIFEST_LANGUAGE(:35) 同样**零外部引用**。
→ **结论：round 2 是"沿既有风格新增"，不是"引入新的坏味道类别"**。把它算作新债会是**假结论** → **不列为执行项**，仅登记。（ruleExecutor.js 的 FACT_OPS 亦属此类既有项。）

---

### 2.5 候选 C-5｜限定范围内补入的额外发现（限 1-2 条）

#### C-5-a（入执行集）ruleMutator.js 与 ruleExecutor.js 存在 5 组重复辅助函数；collectFiles 全仓有 3 份逐字相同副本

同名前缀扫描（server/src 全部 .js，265 个顶层函数名中 18 个跨文件重名）后，逐对做**函数体比对**：

```text
name              | ruleExecutor.js (JSDoc..end) | ruleMutator.js (JSDoc..end) | 函数体
extOf             | 152-162 (11L)                | 110-120 (11L)               | IDENTICAL=true
globToRegExp      | 164-174 (11L)                | 122-132 (11L)               | IDENTICAL=true
collectFiles      | 176-203 (28L)                |  81-108 (28L)               | IDENTICAL=true
resolveWithinRoot | 205-218 (14L)                | 134-146 (13L)               | IDENTICAL=true
readFileUtf8      | 220-232 (13L)                | 148-159 (12L)               | FALSE（仅写法差异：多一个中间变量，语义等价）
```

**更严重的一条 —— collectFiles 是"三份逐字相同"**：

```text
ruleExecutor.js:181-203   body == ruleMutator.js:86-108              → true
ruleMutator.js:86-108     body == common.js:291-313(collectAllFiles) → true
raw bodies (normalized) identical across ALL THREE: true
```

（common.js 的那份正是 round 2 从 ruleExecutor.js 复刻来的 collectAllFiles，仅改签名行。）

**裁定：本轮做**，理由：① 与 C-1 **同一工作流**（消除重复实现）；② **可被 1011 例直接验证**（rule-executor 61 + rule-mutator 21 = **82 例**恰好覆盖）；③ **零视觉风险**（纯 server）；④ **不新增文件**（unmigrated 47 不动）；⑤ **不新增 import 边**（ruleMutator.js:39 **本来就** import 自 ruleExecutor.js → 只扩充同一行的名字列表 → cycle-check 的 **163 边不变**）；⑥ 4/5 逐字相同 + 1/5 语义等价 → 无行为裁决需求。

#### C-5-b（登记，不入执行集）resolveProjectRoot 之外的其余跨文件重名

server/src 有 18 个跨文件重名函数；本轮**只对最可疑的 ruleExecutor 与 ruleMutator 对**做了函数体比对。其余（sleep 3 处、walk、start、markFailed、repairTruncatedJson、clampScore、buildSystemPrompt、getSchoolId、readFileSafe、filesToTree、resolveSubQuestionScores、unquote、extOf）**未做逐对验证** —— **重名不等于重复实现**，擅自断言会是假结论。
→ **登记为 round 4+ 候选**，须逐对做函数体比对后再判。

#### C-5-c（验证为"无缺陷"，明确排除）MENU_TITLES 无同族缺项

round 2 修的是 teacher/Layout.vue 的 MENU_TITLES 缺项。本轮**主动排查三个 Layout 是否还有同族缺项**（防止 round 2 只修了冰山一角）：

```text
teacher/Layout.vue:159-163  MENU_TITLES 7 键 与 侧栏菜单项 7 个（:21,24,30,33,37,40,43）→ 1:1 ✅
  router children 16 条（router/index.js:23-39）；seg 取前 2 段
  /teacher/questions/new/project → /teacher/questions ✅   /teacher/review/class/:id → /teacher/review ✅
  /teacher/teams/:id → /teacher/teams ✅                    /teacher/rule-quality → 新增键 ✅
admin/Layout.vue:82-85      MENU_TITLES 6 键 与 router children 6 条（:11-16）→ 1:1 ✅
student/Layout.vue:100      MENU_TITLES 2 键；seg 覆盖 { /student/assignments, /student/scores }
  （/student/assignments/:id 与 /student/assignments/:a/project/:q 均归并到 /student/assignments）→ 全覆盖 ✅
```

→ **三个 Layout 全部完备，无同族缺项。** round 2 的 M-1a 修复**完整**，不是局部补丁。（此项为**验证性负面结论**，用于关闭"是否还有同类 axe 违规"的悬念。）

---

## 3 round 3 执行集（**3 个文件 / 预算 8**）

> 优先级：**① 能被现有 1011 例测试或三门禁验证 ② 零视觉风险 ③ 收口一个工作流**。按风险 **低 → 低-中** 排序，B **逐项串行**执行并在每项后自证。
> **执行项 1 与 2 已在 `/tmp/a3-sim`（冻结树副本）上完整模拟并实测**，下表"预期"列是**实测值而非推算**。

### 3.1 执行项 1｜C-1：删除 defectPrecheck.js 的第三份 resolveProjectRoot，统一到 factExtractors/common.js（收口 R4）

| 字段 | 内容 |
|---|---|
| **文件:行号** | server/src/services/defectPrecheck.js —— **删** :44-49（hasSourceFiles 的 JSDoc + 函数，6 行）；**删** :51-65（私有 resolveProjectRoot 的 JSDoc + 函数，15 行）；**在 :18 后加** 1 行 import；**在 :51 处加** 4 行（溯源注释 3 行 + `export { resolveProjectRoot };` + 空行） |
| **问题** | 全仓第 **3** 份 resolveProjectRoot；与 common.js:325 版本在 **8/13** 探针形态上**行为发散**（§2.1(b)）→ 潜在漂移源 |
| **依据** | §2.1 全部；grep 证明该模块**生产零引用**（§2.1(c)）；common.js 只依赖 node:fs / node:path → 无环风险 |
| **建议改法** | **按符号操作，不按行号整块删**。① :17 后插入 `import { resolveProjectRoot } from './factExtractors/common.js';`；② 删 :44-49 整个 hasSourceFiles（删前确认计数 = 2，删后 = 0）；③ 删 :51-65 私有实现，原位置改为注释 + 再导出；④ **保留** SRC_EXTS(:42，:103 仍在用)；⑤ **保留** :189 的 `export default { precheckProject, collectFiles, resolveProjectRoot };` 逐字不变（resolveProjectRoot 来自 import，仍可引用） |
| **风险等级** | **低**（生产零消费方 → **不触碰评分链路**；低于 round 2 的 F-1）。**唯一实质变化是 8/13 探针形态的返回值** → 属"朝 P0-1 修正语义收敛"，须在报告里明示为**已确认的有意变更**，不得声称为"行为不变" |
| **预期（已模拟实测）** | defectPrecheck.js **189 → 175** 行；`node --check` = **SYNTAX OK**；漂移对拍 **8/13 发散 → 0/13 发散**；cycle-check **163 → 164 边**（**唯一门禁增量，必须由 C 预期并接受**）、文件 71 不变、**SCC 仍 0**；check-layers 71/0/**47** 不变；arch-metrics 0/47/10(+19) 不变；文件数 **146** 不变 |
| **验证方法** | ① `node scripts/gates/cycle-check.mjs` → 必须 **71 文件 / 164 边 / SCC 0 / 自环 0**（**164 是本轮预期值，不是回归**）；② check-layers + arch-metrics + hard-metrics 全 PASS 且数字与基线一致；③ 后端全量 → **4 处 Test Suites: / 67 套件 / 1011 passed / 0 failed**（defect-precheck 5 例是直接护栏）；④ **行为等价抽查（必做）**：对本仓三份真实夹具 server/uploads/project-submissions/353/{1066,1067,1068}/1 与 .../353/standard，改前/改后 precheckProject 返回的 projectRoot / fileCount / issues 必须**逐字节相等**（本轮已实测 = **true**，配方见 §3.4） |

### 3.2 执行项 2｜C-4：删除 ruleExecutor.js 中孤立且与 ROOT_PROBE_EXTS 逐字重复的 SOURCE_EXTS + 失效 JSDoc

| 字段 | 内容 |
|---|---|
| **文件:行号** | server/src/services/ruleExecutor.js —— **删 :56-67**（JSDoc :56-59 + `export const SOURCE_EXTS = new Set([...])` :60-67，共 12 行） |
| **问题** | ① 该常量在其**本文件内零读取**（全文仅命中 :60 声明行）；② 全仓**无任何模块 import 它**（server/test 中 0 命中；所有 `from './ruleExecutor.js'` 的导入面均不含它）；③ 与 common.js:277-284 的 ROOT_PROBE_EXTS **逐字相同** → **同一份 37 项白名单的两个副本**；④ :57 的 JSDoc 说它"用于 resolveProjectRoot 探测"，但该函数**已于 round 2 搬离本文件** → **注释失效** |
| **依据** | §2.4；round 2 `refactor-round-02.md` §3.1（resolveProjectRoot 已搬至 common.js:315-362） |
| **建议改法** | **整块删 :56-67**（:55 与 :68 均为空行，删后格式自然）。**不得**顺手删 RULE_TYPES(:41)、FACT_OPS(:82)、validateRules / runRules；**不得**改动 common.js 的 ROOT_PROBE_EXTS（它才是唯一存留者） |
| **风险等级** | **低**（零读取点 → 删除**不改变任何运行时行为**；不新增文件；不改任何 import 边） |
| **预期（已模拟实测）** | ruleExecutor.js **1023 → 1011** 行（**仍大于 800** → GodFile 计数 **10 不变**，仅清单里的行数变化）；`node --check` = **SYNTAX OK**；SOURCE_EXTS 残留 **0**；四门禁数字**全部不变**（含 cycle-check 仍 **163 边** —— 本项**不加边**） |
| **验证方法** | ① 四门禁全 PASS 且数字 = 基线（163 边、71 文件、47 未分层、10 与 19、0/0/0、文件数 146）；② 后端全量 **1011/0**（rule-executor 61 例直接覆盖本文件）；③ 反证：grep 全仓 SOURCE_EXTS → 只应剩 common.js:32（9 项语义不同者）与 ruleMutator.js:50（若执行项 3 已做则亦消失） |

### 3.3 执行项 3｜C-5-a：消除 ruleMutator.js 与 ruleExecutor.js 的 5 组重复辅助函数

| 字段 | 内容 |
|---|---|
| **文件:行号** | ① server/src/services/ruleExecutor.js —— 给 5 个函数加 `export`：extOf(:157)、globToRegExp(:170)、collectFiles(:181)、resolveWithinRoot(:212)、readFileUtf8(:225)（**仅加关键字，零逻辑改动**）；② server/src/services/ruleMutator.js —— **删 5 个本地副本**：collectFiles :81-108、extOf :110-120、globToRegExp :122-132、resolveWithinRoot :134-146、readFileUtf8 :148-159（区间 = 「JSDoc 首行..函数闭括号」，**已实测**）；**改 :39 的 import 行**，把 5 个名字并入既有的 `import { runRules, resolveProjectRoot } from './ruleExecutor.js';` |
| **问题** | 5 组重复实现（4 组**函数体逐字相同**，readFileUtf8 仅写法差异、**语义等价**）；其中 collectFiles 全仓有 **3 份逐字相同副本**（ruleExecutor.js:181-203 / ruleMutator.js:86-108 / common.js:291-313）→ 与 C-1 同一"多份拷贝"病理 |
| **依据** | §2.5 C-5-a 的逐对函数体比对（IDENTICAL=true 四处、语义等价一处、三份 collectFiles normalized 全等 = true） |
| **建议改法** | **只加 export、只删副本、只并 import 名单**。**不要**顺手去动 ruleExecutor.js 的 collectFiles 与 common.js 的 collectAllFiles（把 3 份降到 1 份属**进一步合并**，会扩大 diff 与风险 → **本轮不做**，见 §4）。**注意** ruleMutator.js 自身还用到 SKIP_DIRS（3 处命中）：**须确认删掉 collectFiles 后它的本地 SKIP_DIRS 是否仍有消费者**，若无则**保留不删**（超出本项范围） |
| **风险等级** | **低-中**（ruleMutator 在规则变异路径上，属第 4 测试段；缓解：4/5 逐字相同 + 1/5 语义等价 + **82 例**直接覆盖 + import 边**本就存在**故门禁零增量） |
| **预期** | ruleMutator.js **727 → 约 692** 行（仍**大于 500 且小于 800** → GodFile 10 与 19 **均不变**）；ruleExecutor.js 行数**不变**（仅 5 处加关键字）；cycle-check **163 边不变**；文件数 146 不变 |
| **验证方法** | ① 后端全量 **1011/0**，且**必须逐段确认** rule-mutator **21 passed** 与 rule-executor **61 passed**（本项的直接判据）；② 四门禁数字全不变；③ 行为等价：对同一 variantDir 夹具，改前/改后 ruleMutator 的导出函数返回**逐字节相等**（B 须自建对拍脚本，入 /tmp）；④ `grep -c 'function collectFiles' server/src/services/ruleMutator.js` → **0** |
| **可裁剪性** | **本项与执行项 1/2 完全解耦**。若 Captain 判定末轮宜最小化，**可单独撤销本项而不影响 1/2** |

### 3.4 给 Agent B 的硬边界条件（**违反即本轮作废**）

1. **只改上述 3 个文件**（defectPrecheck.js / ruleExecutor.js / ruleMutator.js）；**不动** client/dist、**不动** tests/、**不动 server/test/**、**不动任何 .md**（特别是 docs/ui-redesign/*）、**不动** antd-theme.js / legacy-patch.css / tokens.css。
2. **不新增任何文件**（unmigrated 47 是硬上限；arch-metrics.mjs:63 判 unmigrated 大于 47 即 FAIL）。
3. **不改任何 client 文件** → **零视觉风险由构造保证**（本轮执行集 100% 在 server/src）。
4. **不引入新令牌 / 不改字号 / 不改 hex / 不改 important**。
5. **执行项 1 必须按符号操作**（行号仅作辅助）：删 hasSourceFiles 前先计数应 = **2**，删后 = **0**；**必须保留** SRC_EXTS 与 :189 的 default export。
6. **执行项 2 必须整块删 :56-67**，删前断言该块含 `export const SOURCE_EXTS = new Set([` 与 `resolveProjectRoot 探测` 两个锚点（**本轮实测该断言通过**）。
7. **执行项 3 只加 export / 只删副本 / 只并 import 名单**，**任何"顺手合并 collectFiles 三份为一份"都视为超范围**。
8. **改完必须自证并回报**：四门禁的**全部数字**（cycle-check 的文件/边/SCC/自环；check-layers 的文件/违规/未分层；arch-metrics 的 4 项；hard-metrics 的 3 项）、`find server/src client/src -type f` 计数、以及三个文件的**改前/改后行数**与**改动行号映射**。
9. **必须向 C 预告**：cycle-check 的边数基线由 **163 → 164**（执行项 1 新增 1 条 defectPrecheck.js → factExtractors/common.js 边）。**这是预期增量，不是回归**；SCC 必须仍为 **0**。

### 3.5 行为等价抽查配方（执行项 1，本轮已实测通过）

```bash
# 在 /tmp 副本上对同一批真实夹具跑改前/改后实现并逐字节比对（不写仓库、不跑 jest）
node -e "
  const path=require('path');
  const UP='<repo>/server/uploads';
  const stdDir=path.join(UP,'project-questions','353','standard');
  Promise.all([import('/tmp/a3-sim/server/src/services/defectPrecheck.js'),
               import('/tmp/a3-freeze/server/src/services/defectPrecheck.js')])
   .then(([after,before])=>{
     for (const n of ['1066','1067','1068']) {
       const d=path.join(UP,'project-submissions','353',n,'1');
       const b=before.precheckProject({rootDir:d,stdDir}), a=after.precheckProject({rootDir:d,stdDir});
       console.log(n, JSON.stringify(b)===JSON.stringify(a), b.fileCount, b.issues.length);
     }
   });"
# 本轮输出：1066 true 29 0 ／ 1067 true 29 0 ／ 1068 true 27 3
```

---

## 4 本轮不做清单（含原因）

| # | 项 | 目标 | 为何不做 |
|---|---|---|---|
| 1 | **空 catch 7 处** | 5 文件 | **7/7 裁定为"保持静默"**：3 处 client 空 catch 所在调用**未传 silent** → api/request.js:70-72 的全局拦截器**已弹错误提示**，改它 = **引入重复 toast（UX 回归）**；Submit.vue:705 是**定义好的评分降级**（改它 = 改语义）；2 处 adminController 是**带显式降级输出的**尽力而为聚合（补日志 = 改接口响应体）；1 处 teacherController 在 **1233 行 GodFile** 里，为一行注释动它性价比为负 |
| 2 | **console.log 19 处** | 3 文件 | 12 处（parseExam / parseExamPaper 前缀）是**有意的运维排障线索**，正解是接 pino 分级 = **行为变更**，须"日志口径"专项 + C 护航；7 处 client 确属残留但**无任何现有判据可验证**（1011 例全在 server；三门禁不看 console），且落在 **983 行 GodFile + 铁律区** |
| 3 | **删除 288 行生产死代码**（defectPrecheck.js + defectScoring.js） | 2 文件 + 1 测试 | **会动 server/test/**（defect-precheck.test.js:9/:10 静态 import 二者）→ 该套件 import 期失败 → **1011 基线变约 1006、67 套件变 66**。B 无权改 server/test/，且末轮改回归基线风险极高 → **升级为拍板项 P6**（推荐选项①：保留） |
| 4 | **collectFiles 三份降为一份** | ruleExecutor.js + common.js | 执行项 3 已完成"ruleMutator 侧"去重；再合并 ruleExecutor.collectFiles 与 common.collectAllFiles 需在 ruleExecutor 加 import + 删 23 行，**属进一步扩大 diff**，且两者虽逐字相同但**分属"路径解析"与"事实提取"两个语义域**，合并需设计判断 → **登记 round 4+** |
| 5 | **其余 13 组跨文件重名函数** | server/src | **重名不等于重复实现**。本轮只对 ruleExecutor 与 ruleMutator 一对做了函数体比对；其余（sleep 3 处、walk、start、markFailed、repairTruncatedJson、clampScore、buildSystemPrompt、getSchoolId、readFileSafe、filesToTree、resolveSubQuestionScores、unquote、extOf）**未逐对验证** → 擅自断言会产出假结论 |
| 6 | **common.js 的 4 个零外部引用导出** | common.js | 实测 EXT_LANGUAGE / MANIFEST_LANGUAGE（**既有**）与 ROOT_PROBE_EXTS / collectAllFiles（round 2 新增）**同属一类** → round 2 是**沿既有风格**而非引入新债。**列为"不是新债"的诚实更正**（§2.4） |
| 7 | **GodFile 拆分（10 个）** | 10 文件 | 与 round 2 同结论，本轮**独立加固**：server 侧撞 unmigrated 大于 47 门禁（arch-metrics.mjs:63）；client 侧撞 constraints §2 铁律 → **判据 2 不可达** → 拍板项 **P1** |
| 8 | **M-1b .ant-statistic-title 对比度** | RuleQuality.vue | **改渲染颜色 = 视觉变更**，不在 §2 的 a11y 豁免枚举（aria/label/heading）内；属**既有、超 QA 12 页基线**的违规，**不阻断判据 5** → 拍板项 **P5** |
| 9 | **N-1 --duration-page / N-2 12 个 --tag-*** | tokens.css / 设计文档 | 正解在**设计文档侧**，不在本流水线授权内 → 拍板项 **P3 / P4** |
| 10 | **门禁脚本的"子串误报"加固**（C 在 test-round-02.md §8 优化② 提出） | hard-metrics.mjs 等 | 实测三个正则是 `/#[0-9a-fA-F]{6}/g`、`/!important/g`、`/Modal\.confirm/g` —— 全部只会**过度命中**（如 8 位 hex 会截配前 6 位、Modal.confirmDialog 会命中），即**假阳性 = 偏严**，不会放行真实违规。加固属**健壮性改良**，与终止条件无关；且**末轮改门禁**本身有风险 → **登记不做** |
| 11 | **O-1 换产物基线 / 分层迁移 47 个 / --ink-muted / --canvas-parchment** | — | 沿用 round 2 §7 的裁定（本轮**未重扫**，见 §5 局限 4）；无新证据推翻 |
| 12 | **teacher/Layout.vue 距观察带仅 9 行**（491） | 1 文件 | **观察项，非缺陷**：观察带**不计判据**（arch-metrics.mjs:70-71）。本轮零 client 改动 → 不会被推动。登记供后续轮次注意 |

---

## 5 局限与未覆盖声明（诚实清单）

1. **未跑 jest**（C 职责，任务明令禁止）→ 本报告所有"1011/0 不变"均为**推导预期**；执行项 1/2/3 的运行时安全性由 **C 的四段回归**实测判定。执行项 1 的"改前/改后夹具逐字节相等"是 A 用 node 直调模块实测的（§2.1(d)、§3.5），**不是 jest 证据**。
2. **未跑 axe、未跑浏览器、未做像素 sha1** → 本轮执行集**零 client 改动**，故**不需要**像素证据；判据 5（无障碍）的达标性沿用 test-round-02.md 的 V7/V8 实测，**本轮未独立复现**。
3. **"288 行生产死代码"的判定基于静态引用分析**（全量 grep + 设计文档交叉验证）。**未排除**：动态拼接路径的 import()、外部脚本或运维工具对这两个模块的直接调用、运行时注入点。已做的反证：server/src 内未见对二者的动态导入；projectGrading.js（设计文档点名的接线点）实测 0 命中。
4. **未重扫 round 0/1/2 的全量结论**（规范 §六.3）→ r0 的 F-2..F-5、安全专项、server/test 装置侧结论、以及 **N-1/N-2 的原始证据**均**未本轮复查**，时效性以 audit-round-01.md / audit-round-02.md 为准。**P3 / P4 直接引用了 round 2 的裁定，本轮未独立复算其数字。**
5. **C-1 的"统一"含一次确认的行为变更**（8/13 探针形态）。本报告**不声称"行为不变"** —— 它是"**无消费方模块的语义收敛**"。若 Captain 要求"零语义变更"，则执行项 1 只能改为**完全不动**。**这是本报告最容易产生假信心的点，特此明示。**
6. **执行项 3 的行为等价性未做全量对拍**：4/5 函数体**逐字相同**（源码级证据充分），readFileUtf8 仅**写法差异**（人工判读，未做自动化语义对拍）。**B 须自建对拍脚本**（§3.3 验证方法 ③）。
7. **未验证 ruleMutator.js 删除 5 个副本后其本地 SKIP_DIRS 是否成为死代码** —— 命中 3 处，但**未逐处判定是否都在被删函数体内**。**B 必须在删除后复查**（§3.3 已写明"若无消费者则保留不删"）。
8. **§2.4 的两处"新债 / 非新债"判定依赖我自定的口径**（"外部引用数 = 0 即视为未使用导出"）。若 Captain 采用更严口径（"导出即承诺，必须有测试或文档消费"），则 ROOT_PROBE_EXTS / collectAllFiles 会被判为新债 —— **但那也同时命中 4 个既有导出，结论（不单独立项）不变**。
9. **未评估 server/test 侧的改动成本**（P6 的选项②）：删除 defect-precheck.test.js 会使套件数 67 → 66、例数 1011 → 约 1006，**具体数字未实测**（那需要改动 server/test/，超出 A 的只读授权）。
10. **本轮未复算零引用令牌**（不在候选内）→ **61（严格口径）沿用 round 2 C 的实测**，本轮**未独立验证**。同理未复算 tokens.css 的任何计数。
11. **§2.5 的"重复函数"扫描只覆盖 server/src 的顶层 function 声明**，不含箭头函数常量赋值（`const f = () => {}`）、类方法、以及 client/src 与 trustjudge-server → **真实重复面可能被低估**。

---

## 6 本轮结论（摘要）

| 维度 | 结论 |
|---|---|
| **C-1（R4）** | 第三份 resolveProjectRoot **确实存在**（defectPrecheck.js:54，调用 :100/:134，再导出 :189），与 common.js:325 版本 **8/13 探针形态行为发散**；**决定性新证据：该模块生产零引用（288 行死代码）** → 影响面 = 0 → **裁定本轮做**（已完整模拟：189→175 行、漂移 8/13→0/13、唯一门禁增量 **163→164 边**、SCC 仍 0、3 份真实夹具改前后**逐字节相等**） |
| **C-2** | 空 catch **7 处全部"保持静默"**（**新证据**：api/request.js:70-72 全局错误提示已覆盖 3 处 client 空 catch 的失败路径）→ **零改动** |
| **C-3** | console.log **19 = 12（有意运维日志）+ 7（确属残留）**；两类本轮**均不清**（前者改 = pino 行为变更；后者无可执行验证判据 + 983 行 GodFile） |
| **C-4** | common.js = **363 行，未跨入大于 500 的观察带**（观察带 19 不变）；**发现 1 处 round 2 遗留真新债**：ruleExecutor.js:56-67 的 37 项 SOURCE_EXTS 已成**孤立副本**（与 ROOT_PROBE_EXTS 逐字相同、本文件零读取、全仓零 import）且 JSDoc **失效** → **入执行集**；另**诚实更正**：round 2 新增的 2 个零外部引用导出**不是新债**（该模块此前已有 2 个同类） |
| **C-5** | 补入 **1** 条：ruleMutator.js 与 ruleExecutor.js 有 **5 组重复辅助函数**（4 组逐字相同），其中 collectFiles 全仓 **3 份逐字相同** → **入执行集**。另**验证性排除** 1 条：三个 Layout 的 MENU_TITLES **全部完备**，round 2 的 M-1a 是完整修复而非局部补丁 |
| **执行集** | **3 个文件 / 预算 8**：defectPrecheck.js（C-1）、ruleExecutor.js（C-4）、ruleMutator.js（C-5-a）。**100% 在 server/src → 零视觉风险由构造保证**；执行项 1/2 已在冻结副本上**完整模拟实测** |
| **终止条件** | §5 六项中 **5 项能达成**，**仅 GodFile（判据 2）不能达成** → 收尾按「**部分达标**」出报告；**附加达成**：全仓循环依赖 **SCC = 0** |
| **拍板清单** | **6 项**：P1 GodFile 处置 · P2 ui-guard · P3 N-1 · P4 N-2 · P5 M-1b · **P6（本轮新增）288 行生产死代码处置** |

**建议 Captain：① 把执行集 3 文件交 Agent B（串行，执行项 1/2 优先、3 可裁剪）；② 把 cycle-check 预期值 163 → 164 边写入给 C 的任务书（防假回归）；③ 把 §1 的判据对照表与 §1.1 的 6 项拍板清单直接并入最终总结报告。**

---

*本报告由 Agent A（code-analyzer）于 round 3 产出；唯一写入文件为 docs/pipeline/audit-round-03.md。全部测量在冻结副本 /tmp/a3-freeze（git archive 4b531b8，1013 文件）与模拟副本 /tmp/a3-sim 上完成；临时脚本 /tmp/a3-*.mjs 全部未入仓；活树零改动。*
