# audit-round-00 —— 基准架构审查报告（流水线首轮全量扫描）

> 轮次：**00（基准轮）** ｜ 日期：2026-10-10 ｜ 审查对象 commit：`ac60831`（tag `ui-redesign-freeze-2026-10-10.5`）
> Agent A 技能：`code-analyzer`（规范原要求 `deep-code-analyzer`，**未安装**，见必改清单 G-1）
> 方法：只读静态扫描 + 既有基线复用（`docs/refactor-architecture.md`、`docs/test-results/2026-08-31/`）
> 约束遵守：**零代码改动**；未跑 jest（无 MySQL）；未触碰用户实例（:5173/:3000/worker）；未写库

---

## 1 执行摘要（判据总表）

| 维度 | 判据 | 结果 | 复算命令 |
|---|---|---|---|
| 分层合规 | `check-layers.mjs` 违规数 | ✅ **0**（71 文件 / 0 类规则） | `node server/scripts/check-layers.mjs` |
| 分层迁移 | 未分层待迁移 | ⚠️ **47 个** | 同上 |
| 硬指标 | hex(6) / `!important` | ✅ **0 / 0**（去注释） | 见必改清单 §G-4 |
| GodFile | >800 行 / >500 行 | ⚠️ **10 / 19** | `find … | xargs wc -l` |
| 循环依赖 | 环数 | ⚠️ **1**（2 文件真实互引） | `docs/pipeline` 扫描法见 §2 F-1 |
| 后端回归 | 全量套件 | ⚠️ **13 failed / 920 passed / 933 total**（172s，1 套件） | `DATABASE_URL=…exam_system_test npm test`（G-2 已解阻） |
| 零引用令牌 | 定义但未引用 | ⚠️ **105**（台账登记 75，**口径未对齐**） | 见 §2 F-4 |
| 客户端单测 | `.test.js`/`.spec.js` | ⚠️ **0 个** | `find client -name '*.test.js'` |
| 坏味道 | TODO / 空 catch / console.log | ⚠️ 19 / 7 / 19 | 见 §2 F-6 |

---

## 2 关键发现（带文件与行号）

### F-1 真实循环依赖：`factExtractor.js` ↔ `ruleExecutor.js`（高）

- `server/src/services/factExtractor.js:30` → `import { resolveProjectRoot } from './ruleExecutor.js'`
- `server/src/services/ruleExecutor.js:21` → `import { extractFacts } from './factExtractor.js'`
- 结论：**双向依赖成立**（规范终止条件之一「无高耦合模块」当前不达标）。
- ⚠️ 检测器局限：本轮用的临时脚本把该环报成自环 `ruleExecutor→ruleExecutor`，**晋升为门禁脚本前必须加固**（否则会像入场包 §5.2 陷阱 6 那样产出假阳性）。
- 附带线索：`factExtractor.js:38` 注释自述"与 ruleExecutor 同语义的工程根探测，直接复用" —— 说明环的成因是**共享工具函数放错层**，拆分点明确（应下沉到 utils/domain）。

### F-2 后端回归基线：13 failed / 920 passed / 933 total（⚠️ 已定性 —— **非真实缺陷**）

- **2026-10-10 实测**（G-2 解阻后）：`DATABASE_URL=…/exam_system_test npm test` → 退出码 1，耗时 **172s**，完整日志 `docs/pipeline/test-round-00.log`。
- 失败**全部**集中在 **1 个套件**：`test/unit/infrastructure/rule-mutator.test.js`（13 例，均在 `mutateVariant — 逐规则类型` 描述块内）。
- 表层异常：`TypeError: Cannot read properties of undefined (reading 'type')` @ `src/services/ruleExecutor.js:470`（`collectSyntaxErrors` 内部的 `walk(n)` 收到 `undefined`）。
- **决定性反证**：该套件**独占进程**运行 → `Test Suites: 1 passed` / `Tests: 21 passed, 21 total`，**0.66s 全绿**。
- **结论**：属 `BUG-A-01`「tree-sitter 同进程污染」，**不是被验代码的真实缺陷**。
- **根因定位**：`server/package.json` 的 `test` 已是三段式拆进程写法，但只拆了 `fact-extractor` 与 `rule-executor`，**漏了 `rule-mutator`**（它经 `ruleExecutor` 间接加载 tree-sitter）→ **修复 = 把它加入拆进程列表（1 行）**。
- ⚠️ **附带发现（`&&` 短路，2006-10-10 复核补入）**：`npm test` 的三段用 `&&` 串联，**第一段一红就短路** —— 冻结日志中只有 **1 处** `Test Suites:` 摘要，即 `fact-extractor`(17 例) 与 `rule-executor`(61 例) **根本没被执行**。
  → 因此当前"绿的"只有 920 例；**后端测试全量为 933 + 17 + 61 = 1011 例**（65+2=67 个套件）。修复 `BUG-A-01` 后**必须确认三段依次全部跑到**，否则"全绿"仍是残缺结论。
- ⚠️ 前序坑（Agent C 必读）：未配测试库时 `cd server && npm test` 会**立即退出码 1 且不打印任何 jest 摘要** —— 那是 `server/test/setup.js:35,52` 的**测试库白名单护栏**在正确拒绝（`server/.env` 指向 `exam_system`），**不是崩溃**。正确用法：`DATABASE_URL="mysql://…:3306/exam_system_test" npm test`；或一键脚本 `bash docs/pipeline/scripts/unblock-g2.sh`。

### F-3 GodFile 分布（规范未定义阈值 → 本仓约定 >800 为超标）

| 行数 | 文件 |
|---|---|
| 1519 | `client/src/views/student/Submit.vue` |
| 1280 | `server/src/services/checkerService.js` |
| 1233 | `server/src/controllers/teacherController.js` |
| 1106 | `client/src/views/Doc.vue` |
| 1068 | `server/src/services/ruleExecutor.js` |
| 1051 | `server/src/services/deepseek.js` |
| 988 | `client/src/views/teacher/ReviewDetail.vue` |
| 983 | `client/src/views/teacher/QuestionEdit.vue` |
| 965 | `server/src/controllers/reviewController.js` |
| 862 | `client/src/views/teacher/ProjectQuestionEdit.vue` |

> 与 `docs/refactor-architecture.md` §0 诊断表对照：该表记 `teacherController.js` **1013 行**、`studentController.js` 773 行、`reviewController.js` 739 行 ——
> 当前实测 **1233 / 797 / 965**，即重构方案点名的「上帝控制器」在合并后**继续增长**（teacherController +220 行、reviewController +226 行）。这是本轮最明确的结构性恶化信号。

### F-4 零引用令牌：**口径冲突，禁止直接删除**（重要）

| 口径 | 数量 | 方法 |
|---|---|---|
| 台账 B3-O4（入场包 §3） | **75** | 未记录方法 |
| 本轮复算 | **105** | 定义 = 去块注释后的 `--x:` 声明形态；引用 = `var(--x)` + 任意引号形态 `'--x'`（覆盖 `cssVar()`/`setProperty()`/对象式 `:style`/`getPropertyValue`） |

- 全部 105 个零引用令牌都集中在 `client/src/styles/tokens.css`（唯一令牌文件，297 个定义 / 192 个被引用）。
- 抽查确认 `--gray-700`、`--brand-100`、`--lh-display-1` 全仓 **0 引用**（非扫描遗漏）。
- ⚠️ **动作禁令**：两个口径差 30 个，未消解前**禁止据此删除任何令牌** —— 删错就是视觉回归。差异消解（产出差集 + 人工裁定）应作为 round 1 的首个任务。

### F-5 可测性缺口

- `client/` **零单测文件**（`find client -name '*.test.js' -o -name '*.spec.js'` = 0），前端改动只能靠 rig + axe + 像素比对兜底。
- `server/` 67 个测试文件，但 47 个源文件尚未归入四层目录 → 分层测试边界不完整。
- `docs/test-strategy.md` 自述缺口：契约套件、前端单测、性能基准、覆盖率门槛。

### F-6 卫生项基线

| 项 | 数量 |
|---|---|
| TODO/FIXME/HACK/XXX | 19 |
| 空 catch（`catch {}` / `catch(e) {}`） | 7 |
| `console.log`（server/src） | 12 |
| `console.log`（client/src） | 7 |

### F-7 合并带入的无障碍缺口（入账为 M-1/M-2）

- `rule-quality`：缺 `<h1>`、`statistic-title` 对比度（亮 2 规则/4 节点、暗 1 规则/1 节点）
- `CheckerWizard`：`label` 缺可访问名称（critical ×2）
- 注意：原「axe 31 规则/57 节点 → 0」基线**只覆盖 QA 原始 12 页集**，不含合并新增页面 → 页面集口径需扩展（G-4）。

---

## 3 标准化待修复清单（供 Agent B，按「风险低 → 高」排序，遵守 8 文件/轮）

| # | 项 | 目标文件 | 类别 | 规模 | 风险 | 建议 |
|---|---|---|---|---|---|---|
| 1 | **令牌口径对齐**（先对齐，不删除） | `docs/pipeline/` + 差异集 | 度量 | 30 个差异 | 极低 | round 1 首任务 |
| 2 | M-1/M-2 合并新增页面 axe 收口 | `rule-quality` 页、`CheckerWizard.vue` | 无障碍 | 3 处 | 低 | round 1 |
| 3 | B3-O4 零引用令牌清理 | `styles/tokens.css`（**单文件**） | 死代码 | ≤105 | 中（需 #1 先行） | round 1–2 |
| 4 | 卫生项：空 catch 补日志/上抛 | 7 处 | 异常处理 | 7 处 | 低 | round 2 |
| 5 | `console.log` 残留清理 | server 12 / client 7 | 卫生 | 19 处 | 低 | round 2 |
| 6 | **F-1 循环依赖拆解**（下移共享工具函数） | `factExtractor.js:30/38`、`ruleExecutor.js:21` | 耦合 | 2 文件 | **中高**（评分链路） | round 2–3，需契约测试护航 |
| 7 | **`BUG-A-01` 收口：把 `rule-mutator` 加入三段式拆进程** | `server/package.json` | 测试 | 1 行 | **低**（已反证：独跑 21/21 绿） | round 1 首个 |
| 8 | GodFile 拆分（teacherController 等） | 见 F-3 | 结构 | 10 文件 | **高** | 超出 8×8 预算，需专门排期 |

---

## 4 不改清单（Agent B 禁止触碰，来自入场包 §3/§4.5 与 refactor-architecture 铁律）

- B3-O2 页面级既有低对比（改前=改后，axe 不命中，需人工口径）
- R-30 字号字面量 31 处（**有意不改**：改字号=改视觉）
- `client/src/legacy-patch.css` 的 19 处 `!important`（旧内核降级层，按设计使用）
- `client/src/styles/antd-theme.js` 中的原始令牌引用（主题桥，不计业务债）
- `client/src/views` / `components` / `router` / `App.vue` 的任何视觉·交互·动效改动（refactor-architecture 铁律：须经 ui-guard 逐项对照）

---

## 5 本轮未覆盖 / 局限（诚实声明）

1. **未做任何运行时/动态验证** —— 无 MySQL、未起 rig；F-2 的阻塞使"业务完全回归"无法判定。
2. **未跑 axe / 像素 sha1 / 指纹锚点** —— 这些属 Agent C 与门禁脚本（G-4），本轮只做静态扫描。
3. **循环检测器为临时脚本**，已知会把该环显示成自环；晋升门禁前需加固并自测。
4. **令牌口径未对齐**（105 vs 75），F-4 的结论仅覆盖"集合大小"，未覆盖"哪些是误报"。
5. **未做安全专项**（规范 §七 要求「安全漏洞」维度）：本轮只做卫生扫描，未做注入/鉴权/依赖审计 → 列为 round 1 增量审查项。
6. **未做复杂度/圈复杂度量化**（`code-analyzer` 的 `scripts/analyze.py` 未运行，本机 python 环境未确认）。

---

## 6 与既有审计资产的关系（引用，不复算）

| 资产 | 用途 |
|---|---|
| `docs/refactor-architecture.md` | 分层重构方案 + §0 现状诊断（F-3 的对照基线）；含 UI 零改动铁律 |
| `docs/layer-violations-baseline.md` | 2026-08-16 分层基线（58 文件 / 违规 0）—— 本轮 71 文件 / 违规 0，**未恶化** |
| `docs/test-results/2026-08-31/agent-arch-be.md` | 后端架构审计方法学（AST 等价对比 + 环检测 + 契约矩阵），可复用 |
| `docs/test-results/2026-08-31/agent-arch-fe.md` | 前端架构审计方法学（Chrome69 适配 + token 链路） |
| `docs/test-results/2026-08-17/arch-audit.md` | 8-17 架构审计基线 |
| `docs/reports/merge-验证-2026-10-10.md` | 合并验证（R1/R2 证据来源） |
| `docs/reports/审查团队入场包-2026-10-10.md` | 结构性事实 §4 + 测量陷阱 §5.2（**每轮固定注入的项目约束**） |
