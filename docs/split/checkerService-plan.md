# checkerService 拆分方案（接缝与护航分析）

- **step**: 3 ｜ **phase**: A（接缝与护航分析）｜ **日期**: 2026-10-11 ｜ **技能**: code-analyzer
- **目标文件**: `server/src/services/checkerService.js`（**1280 行**；见 §1.1-3 的口径纠正）｜ **27 个顶层函数 + 21 个顶层常量**
- **方案来源**: `docs/plan/2026-10-11-godfile-split-plan.md` §3 / §4-S2 / §5 / §8 / §8.1 ｜ 范本 `docs/split/ruleExecutor-plan.md` ｜ 验证范本 `docs/split/ruleExecutor-verify.md` ｜ 状态机 `docs/split/status.md`
- **落层唯一依据**: `docs/refactor-architecture.md` §1.1 ｜ **判定规则**: `server/scripts/check-layers.mjs`（实测 140 行）
- **版本锚点（本方案全部实测数据的取值时刻）**:
  - HEAD = `c26c8dce5dcdec20acd5c0ec6af5fe1359b7cb23`（`split(step-2): Submit.vue 抽 9 个 composable`），分支 `master`
  - 目标文件：bytes = **64759**，sha256 = `37d2358c32ab253054b6d152d1f9246a31419cc7a711352fb3d1cb17993409b0`，`wc -l` = **1280**
  - `git status --porcelain -- server/src/services/checkerService.js` = **空**（无未提交改动）
  - 门禁实测（本轮由我执行）：`check-layers` = **文件 78 / 违规 0 / 未分层 46**；`arch-metrics` = **PASS**（layerViolations 0、unmigrated 46/46、godfileOver800 8/8、观察带 18）；`cycle-check` = **78 文件 / 178 条相对导入边 / SCC 0 / 自环 0**；`baseline` 见 `scripts/gates/arch-metrics.mjs:23`

## 0 约束遵守声明

| 约束 | 遵守方式 |
|---|---|
| 纯只读 | 本方案是**本轮唯一写入**；未创建/修改/删除任何其它文件 |
| 禁止 git 写操作 | 只执行 `rev-parse` / `status` / `log`；无 clean / stash / checkout / reset / restore |
| 不跑 jest / build / 服务 | 未执行 jest、未 build、未启服务；未触碰 :5173 / :3000 / `client/dist` / `tests/` |
| 禁止联网 | 未调用任何网络工具；未发任何 LLM 请求 |
| 行号与计数自测 | 全部行号 / 行数 / 函数数 / 常量数 / 调用方 / 测试例数 / 门禁读数**由我在本轮实测**（方法与原始输出随表给出），未照抄任务书或历史报告 |
| 门禁执行说明 | 我只运行了**静态只读**门禁（`check-layers` 未加 `--save-baseline`、`arch-metrics`、`cycle-check`），三者在仓库内**零写入**（`check-layers.mjs` 仅在 `--save-baseline` 时写文件，实测 :126-129）；`bind-check` 只写 `os.tmpdir()`（实测 :168），本轮**未运行** |
| 不改对外契约 | 全部搬移单元 = 源码切片位移 + import 重排 + 文件末尾 `export { … }` 块；对外导出面**逐字保持今日的 10 个名字** |

---

## 1 段落接缝图谱（逐段实测）

实测方法：读全文 1280 行 → 正则定位 `^// ===== … =====` 段落横幅（**实测 13 条**）→ 逐行分类 27 个顶层函数 + 21 个顶层常量（含紧邻 JSDoc 起止）→ 用自建 strip-comments/strings 的引用扫描器（逐行剥离 `//`、跨行 `/* */`、引号与模板串）算出「每个声明引用了哪些同文件符号 / import 绑定」。

**横幅实测行号（13 条，全部由我扫出）**：169 · 230 · 273 · 384 · 417 · 456 · 527 · 626 · 643 · 663 · 731 · 814 · **1161**。
⚠️ 任务书给的 12 个边界**漏了 :1161「教师确认 / 回滚」**（该段含 2 个导出函数、117 行，是本文件第 13 段）；`docs/plan/…-godfile-split-plan.md:30` 写的「13 个段落」却只列了 12 个段名 —— 以本表为准。

| # | 段落（横幅标题） | 起止行（实测） | 行数 | 段内**导出**符号 | 段内私有符号 | 依赖的本文件其它段落 | 外部包 / 其它文件 | 纯函数？ |
|---|---|---|---|---|---|---|---|---|
| **P0** | 文件头 · 导入面 · 常量与小工具（无横幅） | 1–168 | 168 | —（0） | `execFileAsync`(39) `MAX_ROUNDS`(42) `DEFAULT_THRESHOLD`(44) `SCRIPT_TIMEOUT_MS`(46) `SCRIPT_MAX_BUFFER`(48) `DEFAULT_MAX_SCORE`(50) `LLM_MAX_TOKENS`(52) `STALE_GENERATION_MS`(54) `LLM_CALL_TIMEOUT_MS`(56) `STUCK_ROUNDS`(58) `RULE_TYPES`(61-70) `RULES_FORMAT`(73-83) `AUTOMATION_LEVEL_LABELS`(86-90) `automationLabel`(93-96) `FACTS_SCHEMA_COMMON/JS/JAVA/PYTHON`(99-129) `factsSchemaFor`(132-136) `GENERATE_SYSTEM`(139-146) `RULES_EXAMPLE`(149-157) `stripHtml`(160-167) | — | `fs` `path` `os` `node:crypto` `child_process` `util` `../utils/prisma.js` `../utils/logger.js` `./deepseek.js` `./projectContextBuilder.js` `../utils/projectPaths.js` `../infrastructure/rule/index.js` `./ruleMutator.js` `./factExtractor.js`（**14 条 import**：6 外部 + 8 相对） | 混合（`automationLabel` `factsSchemaFor` `stripHtml` 纯；其余为常量） |
| **P1** | 宽容 JSON 解析（截断补全 / 围栏剥离） | 169–229 | 61 | —（0） | `extractJsonText`(176-183) `repairTruncatedJson`(191-212) `parseLooseJson`(215-228) | — | **无**（零 import） | **是**（纯字符串变换） |
| **P2** | 旧脚本结果解析（保留，兼容历史调用） | 230–272 | 43 | `parseCheckerResult`(238) | — | P1（`parseLooseJson`） | **无** | **是** |
| **P3** | 规则 JSON 解析（规则驱动） | 273–383 | 111 | `parseCheckerRules`(284) | — | P1；P0（`RULE_TYPES`） | **无** | **是** |
| **P4** | 固定分项三分类校验（Team B） | 384–416 | 33 | `findMisplacedSubjective`(399) | `RUBRIC_NAME_SEPARATORS`(387) | — | **无** | **是** |
| **P5** | 旧脚本沙箱执行（保留，历史兼容） | 417–455 | 39 | `runCheckerScript`(426) | — | P2（`parseCheckerResult`）；P0（`SCRIPT_TIMEOUT_MS` `SCRIPT_MAX_BUFFER` `execFileAsync`） | `fs` `path` `os` `child_process` `util` | 否（**起真实子进程**） |
| **P6** | LLM 调用（非思考模式，重试 2 次） | 456–526 | 71 | —（0；`callLlm` 私有） | `sleep`(458-460) `callLlm`(473-525) | P0（`LLM_MAX_TOKENS` `LLM_CALL_TIMEOUT_MS`） | `../utils/logger.js` `./deepseek.js`（`getBaseUrl`/`getApiKey`）+ **全局 `fetch`** | 否（**外网 HTTP**） |
| **P7** | Prompt 构建 | 527–625 | 99 | `buildGenerateUserPrompt`(540) | `buildCalibrateUserPrompt`(582-624) | P0（`RULE_TYPES` `RULES_FORMAT` `RULES_EXAMPLE` `automationLabel` `factsSchemaFor`） | **无** | **是**（纯字符串拼接，零 import） |
| **P8** | 负例验证反馈接线（Team A） | 626–642 | 17 | `attachNegativeFeedback`(635) | — | — | **无** | **是** |
| **P9** | 状态读取 | 643–662 | 20 | `getCheckerState`(650) | — | P0（`DEFAULT_THRESHOLD`） | `../utils/prisma.js` | 否（**DB 读**） |
| **P10** | 体检报告 / 版本 / 快照 | 663–730 | 68 | —（0） | `packageFingerprint`(666-682) `appendVersion`(685-700) `markDefectReportItems`(703-710) `buildReport`(713-729) | P0（`DEFAULT_THRESHOLD`，仅 `buildReport`） | `fs` `path` `node:crypto`（仅 `packageFingerprint`） | **混合**（`packageFingerprint` 读盘；其余 3 个纯） |
| **P11** | 规则路径校验 / 文件片段（L1/L2 防幻觉） | 731–813 | 83 | —（0） | `PATH_PARAM_BY_TYPE`(734-742) `collectProjectPaths`(749-765) `validateRulePaths`(775-787) `enrichDeductionSnippets`(796-812) | P0（无） | `fs` `path` | **混合**（`validateRulePaths` 纯；其余读盘） |
| **P12** | 生成 + 自举校准（核心） | 814–1160 | 347 | `generateChecker`(844) | `markFailed`(823-831) | **P1–P11 全覆盖** + P0（`MAX_ROUNDS` `DEFAULT_THRESHOLD` `DEFAULT_MAX_SCORE` `STALE_GENERATION_MS` `STUCK_ROUNDS` `GENERATE_SYSTEM` `stripHtml`） | `fs` `../utils/prisma.js` `../utils/logger.js` `./deepseek.js` `./projectContextBuilder.js` `../utils/projectPaths.js` `../infrastructure/rule/index.js` `./ruleMutator.js` `./factExtractor.js` | 否（**评分主链路**：DB 读 + 外网 LLM + 子进程 + 文件系统） |
| **P13** | 教师确认 / 回滚（**任务书遗漏段**） | 1161–1280 | 120 | `confirmChecker`(1174) `rollbackChecker`(1259) | — | P9（`getCheckerState`）；P12（`generateChecker`）；`validateRules`（P0 import） | `../utils/prisma.js` `../utils/logger.js` `../infrastructure/rule/index.js` | 否（DB 写） |

段落行数合计 1280 ✔（168+61+43+111+33+39+71+99+17+20+68+83+347+120 = 1280，逐段与文件总行数吻合）。

**声明计数自证**：27 个顶层函数（10 导出 + 17 私有）+ 21 个顶层常量 = 48 个顶层声明（`^export? (async )?function|^export? const` 逐行扫，无 `export {}` 块、无 `export default`、无 `export *`）。任务书「27 个顶层函数」✔。

**接缝判决**：13 条横幅把函数切得很干净，但有 **4 处「物理位置 ≠ 逻辑归属」**，**不能按横幅整段搬**：
1. P0 里的 **11 个常量 + 3 个纯函数**分属 6 个不同目标（`execFileAsync`→沙箱、`SCRIPT_*`→沙箱、`LLM_*`→LLM、`RULE_TYPES`→解析、`RULES_FORMAT`/`RULES_EXAMPLE`/`GENERATE_SYSTEM`/`FACTS_SCHEMA_*`/`AUTOMATION_LEVEL_LABELS`/`automationLabel`/`factsSchemaFor`→Prompt、`MAX_ROUNDS`/`DEFAULT_MAX_SCORE`/`STALE_GENERATION_MS`/`STUCK_ROUNDS`→生成、`DEFAULT_THRESHOLD`→meta、`stripHtml`→生成）；
2. **`DEFAULT_THRESHOLD`(:44) 被 P9 `getCheckerState`(:658)、P10 `buildReport`(:719)、P12 `generateChecker`(:871/:1081/:1132) 三处消费** → 跨域常量，归属必须按「最下层消费者」定（落 domain），否则 domain 侧无法零 import；
3. **P10 内部是混合段**：`packageFingerprint`（`fs`+`path`+`crypto`）与其余 3 个纯函数物理相邻但**必须落不同层**（见 §2.1）；
4. **P12 里的 `markFailed`(:823) 与 `stripHtml`(:160)** 只被 `generateChecker` 消费，逻辑上属 P12，故随 P12 走。
→ 因此 §2 的划分**按「声明归属」而非「横幅整段」**（与 step 1 对 ruleExecutor 的处理同构）。

### 1.1 段落之外的三处暗礁（实测，登记但**本步一律不动**）

1. **`getModel` 是零消费的死绑定**（`:32`）。实测：`import { getBaseUrl, getApiKey, getModel, summarizeRubricItems } from './deepseek.js'`，剥离注释与字符串后全文 `getModel` 出现 **0** 次（`getBaseUrl` 1 / `getApiKey` 1 / `summarizeRubricItems` 1）。→ 搬移时**必须逐字保留**（否则等于在同一提交里顺手删代码，plan §6 明令禁止）；建议承载在 `llm.js` 的 import 子句中（语义最近），登记为后续独立清理项。`docs/pipeline/audit-round-04.md:295` 曾记录同一事实，本轮我独立复现。
2. **`RULE_TYPES`(:61-70) 的注释是错的，且与 prompt 自相矛盾（真实缺陷）**：`:60` 写「与 ruleExecutor.RULE_TYPES 一致」，实测 `domain/services/rule/constants.js:10-22` 是 **11 项**（多 `ast_pattern` / `count_imports` / `normalized_text`），本文件是 **8 项**。后果链：`:563` 的 prompt **要求模型优先使用这 3 种语义级规则**，而 `:562` 注入的白名单只有 8 种、`:304` 的 `parseCheckerRules` 又会**静默丢弃**白名单外的项 —— 模型若听话产出 `ast_pattern`，该项被丢，随后 `:348-378` 的总和归一化把分值**补到最后一条客观项上**（分数虚高 + 检查项丢失）。**本步不修**（修它=改行为，会同时打破切片判等与对拍），登记为后续独立缺陷项。
3. **行数口径**：`wc -l` / `arch-metrics`（`src.match(/\n/g).length`，实测 `arch-metrics.mjs:59`）= **1280**；`split('\n').length` = 1281（末尾换行多算一格）。任务书与 `status.md` 写的 1281 是后者。**本方案一律用 1280**（与门禁同口径）。

---

## 2 目标模块划分（源文件 → 目标文件（含层）→ 搬移内容）

### 2.1 落层设计（本方案相对 plan §S2 的核心修正）

**任务书第三步的答案：本文件不能落 `domain`，`plan §S2` 的落层方案也不能照用。**

实测 14 条 import（`:24-37`）：6 条**外部**（`fs` `path` `os` `node:crypto` `child_process` `util`）+ 8 条**相对**（`utils/prisma.js` `utils/logger.js` `services/deepseek.js` `services/projectContextBuilder.js` `utils/projectPaths.js` **`infrastructure/rule/index.js`** `services/ruleMutator.js` `services/factExtractor.js`）。按 `check-layers.mjs` 的四条判定（`:63-81`）逐层试算：

- **domain**：`isExternal` 任一即 `domain-imports-external`；相对路径目标层 `!== 'domain'` 即 `domain-imports-outside`。本文件两者全中 → **P0/P5/P6/P9/P10/P11/P12/P13 全部不可能落 domain**。只有 **P1/P2/P3/P4/P7/P8 + 3 个纯常量族**（`RULE_TYPES` `RUBRIC_NAME_SEPARATORS` `DEFAULT_THRESHOLD`）能落。
- **application**：禁令是 ① `isNodeIO`（`fs|path|os|child_process|…`，实测 `check-layers.mjs:26`）或黑名单 npm；② 相对路径指向 `infrastructure|interface`（`:67-71`）。**P12 `generateChecker` 三条全中**：`fs.existsSync`(:881) → `application-imports-external`；`runRules/resolveProjectRoot` 来自 `infrastructure/rule/index.js`(:35) → `application-imports-infra`。P6 的 `fetch` 虽无 import，但它依赖 `deepseek.js`（unlayered，**门禁放行**）。
  → **`plan §S2` 写的「生成编排(:814) → `application/services/checker-generator.js`」在本步必然产出 ≥2 条违规**。要合规，只能把 `fs.existsSync` 与 `runRules` 抽成端口/参数注入 —— 那是**结构性改造**（改控制流、改调用契约），违反 plan §6「不在同一提交里既拆文件又改行为」，且会摧毁「逐字搬移 + 切片判等」这套唯一可用的护航手段（该段**零测试覆盖**，见 §7.2）。**A 明确否决该做法，本轮不落 application**。这也与 step 1 对 `runRules` 的裁定同构（`ruleExecutor-plan.md` §2.1：三条硬规则，前两条否决、infra 放行）。
- **interface**：禁止相对路径指向 `infrastructure`（`:78-81`）。本文件 8 条相对依赖里就有 1 条指向 infrastructure → 同样不可能。
- **infrastructure**：只禁止**反向依赖** application / interface（`:72-77`），依赖 domain、同层、unlayered、外部包**全部合法**（`infrastructure/bootstrap/` 组合根豁免与本步无关）。→ **所有带 IO/编排的段落唯一合规落点**。

**结论（推荐形态）**：按「该声明是否已有 fs / npm / DB / 网络依赖」二分，**不做任何函数内部再分解**：

```
server/src/
├── domain/services/checker/            # 零 import（用 node 内置即违规）
│   ├── parsers.js                      # 宽容 JSON 解析 + 两个解析器 + 三分类校验 + RULE_TYPES
│   └── meta.js                         # 阈值常量 + 反馈挂载 + 版本快照 + 体检报告（纯 meta 操作）
└── infrastructure/ai/checker/          # 允许 node:* / npm / unlayered / domain
    ├── prompts.js                      # 提示词常量与两个 prompt builder（纯，但依赖 domain 的 RULE_TYPES）
    ├── llm.js                          # callLlm + 重试/超时常量
    ├── legacy-script.js                # 旧脚本沙箱执行（子进程）
    ├── package-inspect.js              # 标准包指纹 + 路径白名单 + 文件片段
    ├── state.js                        # getCheckerState（DB 读）
    ├── review.js                       # confirmChecker / rollbackChecker（DB 写）
    ├── generator.js                    # generateChecker（评分主链路编排）
    └── index.js                        # ★ 对外导出面（唯一入口）
```

**关于 `prompts.js` 为什么是 infrastructure 而不是 domain**：它是纯函数、零外部 import，**放 domain 也合规**；但它依赖 `RULE_TYPES`（domain），且架构文档 §1.1 把 `PromptBuilder` 明确归入 `infrastructure/ai/`。为对齐文档语义 + 与既有 `infrastructure/ai/prompt-builder.js` 同址，落 infrastructure。（若 Captain 认为「纯逻辑一律入 domain」，把 `prompts.js` 移到 `domain/services/checker/prompts.js` 即可，其 import 变为 `./parsers.js`，**其余全部不变**。）

**与 plan §S2 的偏离（如实登记）**：① 解析族从 `infrastructure/ai/checker/parsers.js` 改为 **domain/services/checker/parsers.js**（纯函数零 import → 落 domain 才能同时满足 plan §3 原则 1「拆的同时落层」与「不新增未分层」）；② 生成编排从 `application/services/checker-generator.js` 改为 **infrastructure/ai/checker/generator.js**（理由见上，**硬约束，非偏好**）；③ 文件数从 6 改为 10（多出的 4 个是 §1「物理位置≠逻辑归属」逼出来的：P10 拆两处、P13 与 P9 分离、P12 独立成文件）。

### 2.2 对照表（源行号 = §1 实测；预估行数 = 搬移行数 + 新增 banner / import / export 块；**全部 < 800**）

| # | 目标文件（层） | 搬移内容（**源文件行号，逐字**） | 搬移行数 | 预估总行数 |
|---|---|---|---|---|
| T1 | `domain/services/checker/parsers.js`（**domain**） | 60-70（RULE_TYPES）· 171-228 · 232-271 · 275-382 · 386-387 · 389-415 | 246 | **≈254** |
| T2 | `domain/services/checker/meta.js`（**domain**） | 43-44 · 628-641 · 684-700 · 702-710 · 712-729 | 60 | **≈68** |
| T3 | `infrastructure/ai/checker/prompts.js`（infra） | 72-83 · 85-90 · 92-96 · 98-103 · 105-112 · 114-121 · 123-129 · 131-136 · 138-146 · 148-157 · 529-570 · 572-624 | 172 | **≈182** |
| T4 | `infrastructure/ai/checker/llm.js`（infra） | 51-52 · 55-56 · 458-460 · 462-525 | 71 | **≈79** |
| T5 | `infrastructure/ai/checker/legacy-script.js`（infra） | 39 · 45-46 · 47-48 · 419-454 | 41 | **≈53** |
| T6 | `infrastructure/ai/checker/package-inspect.js`（infra） | 665-682 · 733-742 · 744-765 · 767-787 · 789-812 | 95 | **≈104** |
| T7 | `infrastructure/ai/checker/state.js`（infra） | 645-661 | 17 | **≈25** |
| T8 | `infrastructure/ai/checker/review.js`（infra） | 1163-1251 · 1253-1280 | 117 | **≈127** |
| T9 | `infrastructure/ai/checker/generator.js`（infra） | 41-42 · 49-50 · 53-54 · 57-58 · 159-167 · 816-831 · 833-1159 | 360 | **≈381** |
| T10 | `infrastructure/ai/checker/index.js`（infra，**新建**） | 1-23（文件头 JSDoc 逐字，仅作溯源注释）+ 7 行 re-export（§2.3） | 0 | **≈13** |
| — | 源文件 `server/src/services/checkerService.js` | **整体删除** | −1280 | 0 |
|  |  | 13 条段落横幅（169/230/273/384/417/456/527/626/643/663/731/814/1161）与 **51 个空行不搬**；14 条 import 规格符**重排**到 T1–T10 |  |  |

- **搬移总量校验**：1179 行搬出 + 101 行留在源文件（1-38 头/导入 38 行 + 13 条横幅 + 50 个空行）= **1280** ✔（逐行集合运算算出，无重叠、无遗漏 —— 实测「未分配声明 = 0」）
- **预估总量 ≈ 1286 行**（10 个文件）。**最大文件 T9 ≈ 381 行 ≪ 800**；观察带（>500）**无新增**（现有最大新文件 381 行，差 119 行）。
- **门禁预期**：GodFile **8 → 7**（`checkerService.js (1280)` 从名单消失）；未分层 **46 → 45**（源文件本身 unlayered，删即净 −1；10 个新文件全部落层）；文件数 78 → 87；`layerViolations` 恒 **0**；SCC 恒 **0**。

### 2.3 index.js 汇总导出（对外导出面 = 今日实测的 **10 个名字**，一个不多一个不少）

今日实测导出面（`^export (async )?function` 逐行扫，共 **10** 个，与任务书「导出面必须保持等价」逐字对齐）：
`parseCheckerResult` `parseCheckerRules` `findMisplacedSubjective` `runCheckerScript` `buildGenerateUserPrompt` `attachNegativeFeedback` `getCheckerState` `generateChecker` `confirmChecker` `rollbackChecker`

```js
// server/src/infrastructure/ai/checker/index.js（新建；相对路径写全 .js）
export { parseCheckerResult, parseCheckerRules, findMisplacedSubjective } from '../../../domain/services/checker/parsers.js';
export { attachNegativeFeedback } from '../../../domain/services/checker/meta.js';
export { runCheckerScript } from './legacy-script.js';
export { buildGenerateUserPrompt } from './prompts.js';
export { getCheckerState } from './state.js';
export { generateChecker } from './generator.js';
export { confirmChecker, rollbackChecker } from './review.js';
```

- **不导出**任何内部名（`RULE_TYPES` / `DEFAULT_THRESHOLD` / `callLlm` / `buildCalibrateUserPrompt` / `packageFingerprint` / `markFailed` / `automationLabel` …）→ 保持「导出面逐字不变」纪律。
- **不要**用 `export * from`（`scripts/gates/bind-check.mjs:22` 的已知盲区，step 1 已验证）。
- ⚠️ **`export { … } from` 对两个静态门禁是不可见的**（实测）：`check-layers.mjs:28` 的 `IMPORT_RE` 要求字面量 `import`/`require(`/`import(`；`cycle-check.mjs:42` 同理。→ index.js 的 7 行 re-export **既不产生 check-layers 违规、也不产生 cycle 边**；验证 re-export 路径**只能靠 bind-check**（`bind-check.mjs:113-118` 能校验 re-export，step 1 已实证）。
- 命名对齐既有层文件（kebab-case，如 `infrastructure/ai/caching-ai-gateway.js`）；`domain/services/checker/` 与 `infrastructure/ai/checker/` 均为**新建目录**（`ls` 实测不存在）。

### 2.4 import 重排清单（唯一允许「不逐字」的行 → 由 §1 的引用扫描器**自动推导**，非人工列举）

| 目标文件 | 新 import 行（按实测绑定逐条列出） |
|---|---|
| **T1** | **（无）** |
| **T2** | **（无）** |
| **T3** | `import { RULE_TYPES } from '../../../domain/services/checker/parsers.js';` |
| **T4** | `import logger from '../../../utils/logger.js';` / `import { getBaseUrl, getApiKey, getModel } from '../../../services/deepseek.js';` ← **`getModel` 是零消费死绑定，必须照带**（§1.1-1） |
| **T5** | `import fs from 'fs';` / `import path from 'path';` / `import os from 'os';` / `import { execFile } from 'child_process';` / `import { promisify } from 'util';` / `import { parseCheckerResult } from '../../../domain/services/checker/parsers.js';` |
| **T6** | `import fs from 'fs';` / `import path from 'path';` / `import crypto from 'node:crypto';` |
| **T7** | `import prisma from '../../../utils/prisma.js';` / `import { DEFAULT_THRESHOLD } from '../../../domain/services/checker/meta.js';` |
| **T8** | `import prisma from '../../../utils/prisma.js';` / `import logger from '../../../utils/logger.js';` / `import { validateRules } from '../../rule/index.js';` / `import { getCheckerState } from './state.js';` / `import { generateChecker } from './generator.js';` |
| **T9** | `import fs from 'fs';` / `import prisma from '../../../utils/prisma.js';` / `import logger from '../../../utils/logger.js';` / `import { parseCheckerRules, findMisplacedSubjective } from '../../../domain/services/checker/parsers.js';` / `import { DEFAULT_THRESHOLD, attachNegativeFeedback, appendVersion, markDefectReportItems, buildReport } from '../../../domain/services/checker/meta.js';` / `import { GENERATE_SYSTEM, buildGenerateUserPrompt, buildCalibrateUserPrompt } from './prompts.js';` / `import { callLlm } from './llm.js';` / `import { packageFingerprint, collectProjectPaths, validateRulePaths, enrichDeductionSnippets } from './package-inspect.js';` / `import { summarizeRubricItems } from '../../../services/deepseek.js';` / `import { buildFileTree, filterProjectFiles, buildFileTreeText } from '../../../services/projectContextBuilder.js';` / `import { standardDir } from '../../../utils/projectPaths.js';` / `import { runRules, resolveProjectRoot } from '../../rule/index.js';` / `import { validateNegativeTests } from '../../../services/ruleMutator.js';` / `import { extractFacts } from '../../../services/factExtractor.js';` |
| **T10** | 见 §2.3（7 条 re-export） |

- **绑定完备性保证**：上表由脚本对「声明 → 引用」图求闭包后自动生成（不是人读），实测 **0 个未分配声明、0 个未解析绑定**。⚠️ 这正是 step 1 中 A 出错的位置（`ruleExecutor-plan.md` §2.4 漏了 6 个绑定，被 C 的 V3 抓到）→ 本次用自动推导消除该类漏项。
- **`getModel` 是唯一的例外**（0 引用故推导不出来）→ **人工显式补回 T4**，这是本清单唯一依赖人读的一行。
- **边保持性**：今日 8 条相对出边（prisma / logger / deepseek / projectContextBuilder / projectPaths / rule-index / ruleMutator / factExtractor）**全部保留**，只换宿主；**不新增任何第三方依赖**、不新增反向边。`cycle-check` 相对边数预估 178 − 8 + 24 ≈ **194**（**不作判据**，仅供 C 参考）。

---

## 3 层禁令合规预判（逐条对照 `server/scripts/check-layers.mjs`，**必须 0**）

预判方法（**诚实声明**：A 是只读角色，我没有为了预判而落任何文件到仓库）：在内存中**用真实门禁脚本自身**提取 `EXTERNAL_BLACKLIST`（实测 **23** 项，`:20-25`）与 `NODE_IO` 正则（`:26`），**逐字复刻** `:40-83` 的 `layerOf` / `isExternal` / `targetLayer` 判定，喂入 §2.4 的 **10 个文件 × 34 条 import 规格符** → **违规 0 条**。真跑仍必须由 C 执行（V6）。

| 规则（门禁原文） | 判定式（实测行号） | 预判 | 依据 |
|---|---|---|---|
| `domain-imports-external` | `:63-64`（domain 的任何非相对 import） | **0** | T1 / T2 **零 import**（连 node 内置都没有） |
| `domain-imports-outside` | `:65`（相对目标层 `!== 'domain'`，**含 unlayered**） | **0** | T1 / T2 无任何 import；不存在指向 `services/` / `utils/` / `infrastructure/` 的 domain 边 |
| `application-imports-external` | `:67-68` | **0（不适用）** | 本步**不新增任何 application 文件**（§2.1 已论证不可行） |
| `application-imports-infra` | `:69-71` | **0（不适用）** | 同上 |
| `infrastructure-imports-upper` | `:72-77`（非组合根禁止指向 application / interface） | **0** | T3–T10 的 34 条相对目标逐条落点：`domain/**`（合法向下）、`infrastructure/ai/checker/*`（同层）、`infrastructure/rule/index.js`（同层）、`services/*` 与 `utils/*`（**unlayered**，既非 application 也非 interface → 不命中）。**无一条指向 application/interface** |
| `interface-imports-infra` | `:78-81` | **0（不适用）** | 不新增 interface 文件 |
| 外部包（infra 无限制） | `:72-77` 只判相对路径 | **0** | `fs`(T5/T6/T9) `path`(T5/T6) `os`(T5) `child_process`(T5) `util`(T5) `node:crypto`(T6) 均为 `isExternal=true` → infrastructure 分支**根本不检查外部包**（只有 application 分支检查 `isNodeIO`/`EXTERNAL_BLACKLIST`） |
| 未分层待迁移 | `:86` `layerOf() === 'unlayered'` | **46 → 45** | 删 `services/checkerService.js`（−1）；10 个新文件首段均为 `domain` / `infrastructure`（+0） |
| 门禁退出码 | `:140`（违规 >0 即 exit 1） | **0 → exit 0** | 上述合计 |

**四条反向陷阱（给 C 做门禁证伪用，仿 step 1 的 V4）**：
① 把 T1（零 import 的 domain 文件）里加一条 `import fs from 'fs'` → 立刻 `domain-imports-external`；
② 让 T1 去 import `../../../services/deepseek.js` → `domain-imports-outside`；
③ **把 T9（generator）故意挪到 `application/ai/checker/`** → 同时命中 `application-imports-external`（`fs`）与 `application-imports-infra`（`../../rule/index.js`）—— 这条正是 §2.1 否决 plan §S2 的实证；
④ 让 T8（review）反向 import 一个 `interface/` 文件 → `infrastructure-imports-upper`。
（C 用 /tmp 副本做，**不得进仓库**。）

---

## 4 调用方与导出面清单（全仓实测）

**实测方式**：递归扫全仓 3938 个 `.js/.mjs/.cjs/.vue/.json/.md/.sh`（排除 `node_modules`/`.git`/`dist`/`coverage`/`logs`），正则命中 `checkerService` 与 10 个导出名 → 逐条人读 + 自建相对 import 图 BFS 求传递闭包。

### 4.1 直接 import 站点（**仅 2 个**，一个不多）

| # | 文件:行（实测） | 今日写法 | 拆分后 | 必须改？ | 风险 |
|---|---|---|---|---|---|
| **I1** | `server/src/controllers/checkerController.js:6` | `import { generateChecker, getCheckerState, confirmChecker, rollbackChecker } from '../services/checkerService.js';` | `from '../infrastructure/ai/checker/index.js'` | **是** | 低（4 名全在 §2.3 面内，单行路径替换） |
| **I2** | `server/test/unit/infrastructure/checker-service.test.js:13` | `import { parseCheckerResult, parseCheckerRules, runCheckerScript, attachNegativeFeedback, findMisplacedSubjective } from '../../../src/services/checkerService.js';` | `from '../../../src/infrastructure/ai/checker/index.js'` | **是**（仅路径，**断言一字不动**） | 低（5 名全在面内） |

**为什么只有 2 个**：① 全仓**没有任何 jest 模块 mock 指向 checkerService**（实测 `grep -rn 'mock.*checkerService' server` 退出码 1 = 0 命中；4 个用 `jest.unstable_mockModule` 的套件里**没有**它）→ **不存在 step 1 的 H1 类「mock 路径键控」单点故障**；② 无动态 `import('…checkerService…')`（0 命中）；③ `server/accept.tmp.mjs`（历史悬空引用）**实测不存在**（`docs/plan/2026-08-31-security-notes.md:22` 所述已删除，本轮复核确认）。

### 4.2 导出名 → 消费方矩阵（逐个实测）

| # | 导出名 | 定义行 | 生产消费方 | 测试消费方 | 说明 |
|---|---|---|---|---|---|
| 1 | `parseCheckerResult` | :238 | **无**（仅同文件 :444 被 `runCheckerScript` 调用） | `checker-service.test.js`（22 例间接） | 旧脚本族，见 §5 |
| 2 | `parseCheckerRules` | :284 | **无**（仅同文件 :943 被 `generateChecker` 调用） | 同上（11 例） | 生成链路内部件 |
| 3 | `findMisplacedSubjective` | :399 | **无**（仅同文件 :962） | 同上（5 例） | 同上 |
| 4 | `runCheckerScript` | :426 | **全仓 0 调用** | 同上（2 例，真子进程） | 旧脚本族，见 §5 |
| 5 | `buildGenerateUserPrompt` | :540 | **无**（仅同文件 :983） | **无** | **导出但全仓无外部消费者**（面内保留，不得删） |
| 6 | `attachNegativeFeedback` | :635 | **无**（仅同文件 :1120） | 同上（2 例） | — |
| 7 | `getCheckerState` | :650 | `checkerController.js:21` | 无 | 经 I1 |
| 8 | `generateChecker` | :844 | `checkerController.js:110`（fire-and-forget）+ 同文件 :1187 | 无 | 经 I1，**评分主链路** |
| 9 | `confirmChecker` | :1174 | `checkerController.js:50` | 无 | 经 I1 |
| 10 | `rollbackChecker` | :1259 | `checkerController.js:83` | 无 | 经 I1 |

→ **导出面等价 = 10 个名字，10/10 逐一有落点**；其中 3 个（#5 #6 #1…）**在面外零消费者**，但仍是面的一部分（`buildGenerateUserPrompt` 是本步唯一的「纯导出、零外部引用」名字）——**不得顺手降级为私有**。

### 4.3 影响面（自建 import 图实测）

- `server/src` 传递依赖链：**4 个文件** = `checkerService.js` ← `controllers/checkerController.js` ← `routes/teacher.js` ← `app.js`
- `server/test` 中传递加载它的：**24 个**（1 个直接单测 + 22 个 integration 经 `helpers.js → app.js → routes/teacher.js → checkerController` + `helpers.js` 本身）；`server/test` 共 **68 个 `.test.js`** → 影响面 **23/68**
- ⚠️ **但这 22 个 integration 套件一行 service 代码都没执行到**：它们打的 checker 端点（`ownership-guards.test.js:537-575` 的 R15–R19）**全部在 `checkerController` 的归属守卫处 404/400 短路**（`checkerController.js:42/55/75/84/105/108`），`generateChecker`/`confirmChecker`/`rollbackChecker`/`getCheckerState` **一次都没被调用**。这条对 §7.2 的零覆盖结论是决定性的。

---

## 5 旧路径兼容判定（`parseCheckerResult` / `runCheckerScript`）

**实测结论：两段在今天的生产链路上都已无调用者，属于「自洽的遗留孤岛」。**

| 段落 | 实测调用图 | 生产是否调用 | 判定 |
|---|---|---|---|
| **旧脚本结果解析** `parseCheckerResult`(:238-271) | ① 被同文件 `runCheckerScript:444` 调用；② 被 `checker-service.test.js`（22 例）调用；③ **全仓其它 0 命中** | **否**（`generateChecker` 走 `parseCheckerRules`；无任何 controller/route 触达） | **保留**（不得删） |
| **旧脚本沙箱执行** `runCheckerScript`(:426-454) | ① 被 `checker-service.test.js:339/:352` 调用（2 例，真起子进程）；② **全仓其它 0 命中**（含 `server/src` / `scripts` / `client` / `server/scripts`） | **否** | **保留**（不得删） |

- **本步建议：原样迁出，一个字不改** —— 迁到 `infrastructure/ai/checker/legacy-script.js`（T5，41 行），两类符号仍经 T10 `index.js` 导出，`checker-service.test.js` 的 2 + 22 例继续生效。
- **不建议本步删除的 3 条理由**：① 删除是**行为变更**（导出面 10 → 8），违反 plan §6「不改对外契约」与 §5 DoD 的「导出面等价」；② 删它必须同时改/删测试（`checker-service.test.js` 的 24 例），而「不得改测试迁就实现」是 constraints 的硬纪律；③ `runCheckerScript` 是**沙箱 + 超时 + 缓冲**的安全相关代码，静默删除会丢失历史兼容能力（旧数据里 `checkerScript` 字段可能仍是脚本源码 —— 但没有实测证据表明线上还有这种数据，属**未证事项**）。
- **给 Captain 的后续独立项（另开一步，不在本步）**：先做一次**数据侧取证**（`questions.checkerScript` 是否还有非 JSON 的历史脚本），再决定删除；删除步骤须同时删 `legacy-script.js` + `checker-service.test.js` 的 24 例 + 从 `index.js` 摘掉 2 个名字（10 → 8），并**单独过一个 DoD**。

---

## 6 生成/自举校准段（:814）的拆分可行性结论

**结论：本轮不拆函数内部，只做整段位移（T9）。**

**实测依据**：

| 项 | 实测 |
|---|---|
| 函数体量 | `generateChecker` = **:844-1159，316 行**（单函数；同段还有 `markFailed` 9 行 + 4 个常量 + `stripHtml` 9 行） |
| 内嵌闭包 | `evaluateRound`(:942-976) **捕获 8 个外层变量**（`rubric` `maxScore` `fixedItems` `rootDir` `projectPaths` + `parseCheckerRules`/`findMisplacedSubjective`/`runRules`/`validateRulePaths`） |
| 状态机 | `generating → calibrating → ready \| review → failed`，**5 处写 `checkerStatus` 的 update**（:874 generating / :1076 calibrating / :1089 ready / :1107 review / :1145 review）+ 2 处 `markFailed` 终态 |
| DB 写次数 | P12 段内 **11 处 DB 写**：`generateChecker` 内 **10 处 `prisma.question.update`**（:874 / :892 / :905 / :1012 / :1073 / :1076 / :1089 / :1107 / :1145 / :1155）+ `markFailed` 内 1 处（:825，被 :883/:1158 两处调用）；全文件 `prisma.*` 调用实测 **17 次**（13 update + 4 findUnique）。每次 update 都是**独立事务**，没有外层事务包裹 |
| 外部副作用 | 1 次/轮 外网 LLM（`callLlm`）、每轮 1 次 `runRules`（读盘）、每轮 1 次 `validateNegativeTests`（**起子进程级临时目录 + 变体文件**） |
| 测试覆盖 | **0**（§7.2 Z17；§4.3 已证 22 个 integration 套件全部在 controller 层短路） |

**若要按「编排 / 单步生成 / 校准」切开，必须同时做 4 件事**：① 把 `evaluateRound` 闭包改成显式传参（8 个参数对象）；② 把「单轮执行」提成独立函数并定义其错误语义（现在是**靠抛错 + catch 转反馈**，抛出即语义）；③ 把 11 处独立 `update` 收拢成一次写（**会改变崩溃恢复语义**：现在每轮落地一次 meta，中途崩溃可幂等重入）；④ 重新定义「最优规则 / 卡死检测 / 缺陷豁免」这些**跨轮可变状态**（`bestRules` `bestScore` `bestDefectIds` `lastRules` `lastFeedback` `lastTotalScore` `stuckCount`）的归属（7 个变量）。

**逐条回答任务书的问题**：
- **能否按「编排 / 单步生成 / 校准」切开？** 结构上**可以**，但需要把闭包外提 + 7 个跨轮状态显式化 + 错误语义（抛错即反馈）显式化 → 属**重构**，不属搬移。
- **切开后事务与错误语义是否不变？** **不能保证不变**：③ 会改崩溃恢复粒度（当前「每轮一次落库」是幂等重入的基石，见 :857-865 的陈旧状态判定）；② 会把「抛错驱动校准反馈」这条隐式控制流变成显式返回值，任何一个 catch 边界挪位都会改变「哪类错误进反馈、哪类直接 failed」的分派。
- **风险判定：高。** 单一函数 316 行 + 评分主链路 + **零测试覆盖** + 15 次独立 DB 写 + 外网副作用。plan §6「不在同一提交里既拆文件又改行为」与 §8.1-5「A 只在开拆前做一次接缝分析」都指向同一处理：**宁可这一步少拆一点**。
- **补充：不拆也不留 GodFile**。T9 ≈ 381 行 ≪ 800，本步的全部指标收益（GodFile 8→7、未分层 46→45）**不依赖**拆这个函数。

**登记为后续独立专项**（不在本步）：`generateChecker「应用层化」` —— 前置条件是 **先补契约测试**（§7.3 的 G01–G22 夹具正是为此准备的），然后才谈端口化 / 事务边界。

---

## 7 护航分析

### 7.1 测试覆盖矩阵（例数全部实测）

**唯一直接测试套件**：`server/test/unit/infrastructure/checker-service.test.js`（**456 行**，`it(` = **42**，`it.each` = 0，`describe(` = **13**）。任务书的「checker-service 42 例」**实测吻合**。

| 源段落 | 主覆盖套件 | 用例数（实测） | 用例行号（实测） | 直接断言 evidence？ |
|---|---|---|---|---|
| **P1** 宽容 JSON | checker-service | 由 P2/P3 的 33 例**间接全覆盖** | — | 是（间接） |
| **P2** 旧脚本结果解析 | checker-service | **22**（7 个 describe：:20 :50 :68 :85 :110 :125 :146） | :21-:185 | **是**（逐字断言 trim / 截断 / 丢弃 / evidence） |
| **P3** 规则 JSON 解析 | checker-service | **11**（3 个 describe：:187 :249 :296） | :188-:317 | **是**（id 补全、取整、总和归一化、白名单丢弃） |
| **P4** 三分类校验 | checker-service | **5**（:360） | :368-:419 | **是**（`toEqual(['界面美观'])` 逐字） |
| **P5** 旧脚本沙箱 | checker-service | **2**（:320，真子进程） | :321-:356 | 部分（:352 用 `/boom-checker\|检查脚本执行失败/` **松散正则**） |
| **P8** 负例反馈接线 | checker-service | **2**（:421） | :422-:455 | **是** |
| **P6** LLM 调用 | **无** | 0 | — | — |
| **P7** Prompt 构建 | **无**（`buildGenerateUserPrompt` 全仓零引用） | 0 | — | — |
| **P9** 状态读取 | **无** | 0 | — | — |
| **P10** 体检/版本/快照 | **无** | 0 | — | — |
| **P11** 路径校验/片段 | **无** | 0 | — | — |
| **P12** 生成+自举校准 | **无** | 0 | — | — |
| **P13** 教师确认/回滚 | **无** | 0 | — | — |
| **P0** 常量与小工具 | 仅 `RULE_TYPES` 经 P3 间接打靶；`automationLabel`/`factsSchemaFor`/`stripHtml` **无** | 0 | — | — |

**42 例的分布（实测，逐 describe 数过）**：`parseCheckerResult` **22** ｜ `parseCheckerRules` **11** ｜ `runCheckerScript` **2** ｜ `findMisplacedSubjective` **5** ｜ `attachNegativeFeedback` **2** = **42** ✔

**一句话结论**：**27 个顶层函数里只有 5 个有直接测试（42 例）**；其余 **22 个函数、约 900+ 行、以及评分主链路的每一步，全仓零断言**。本步对它们的唯一正确性证据只能是 §7.3 的**切片判等 + 打桩对拍**，绝不能靠「42 例全绿」自证。

### 7.2 零覆盖清单（**最高风险区，搬移前必须先建对拍**）

口径：**函数级 + 分支级**。凡「从未被任何套件执行」或「执行到但无断言」逐条列出。

**A. 整函数零覆盖（22 个，逐条给实测依据）**

| # | 零覆盖单元（源行） | 依据 |
|---|---|---|
| Z1 | `automationLabel`(93-96) | 仅被 P7 两个 prompt builder 调用，二者皆零覆盖 |
| Z2 | `factsSchemaFor`(132-136) 三分支（java / python / 回退 JS） | 同上 |
| Z3 | `stripHtml`(160-167) | 仅被 `generateChecker`:889/:983 调用 |
| Z4 | `sleep`(458-460) | 仅被 `callLlm`:521 调用 |
| Z5 | `callLlm`(473-525) 全部分支（空内容 :511、HTTP 非 2xx :504、超时 abort、重试 2 次 :521、成功 :516） | 测试文件头 :8 明写「不测 generateChecker（真实 LLM 调用）」 |
| Z6 | `buildGenerateUserPrompt`(540-570) | **全仓 0 引用**（导出但无人 import，含测试） |
| Z7 | `buildCalibrateUserPrompt`(582-624) 四分支（error / deductions / defectItems / weakRules / 全空） | 私有，仅 :984 调用 |
| Z8 | `getCheckerState`(650-661) 两分支（q 为 null → `'none'`；meta 缺省对象 :656-659） | 无直接用例；integration 未触达（§4.3） |
| Z9 | `packageFingerprint`(666-682)（含 catch → null :679-681） | 零引用 |
| Z10 | `appendVersion`(685-700)（含 `maxId+1` 递增、`status==='active'` 分支 :698） | 零引用 |
| Z11 | `markDefectReportItems`(703-710)（含 `missingPathIds.size===0` 早退、note 文案） | 零引用 |
| Z12 | `buildReport`(713-729)（score 反算、note 截断 120 字符、`ruleLabel` 兜底文案） | 零引用 |
| Z13 | `collectProjectPaths`(749-765) | 零引用 |
| Z14 | `validateRulePaths`(775-787) 四分支（无 key 跳过 / 非字符串跳过 / dir 命中 files+dirs / 未命中） | 零引用 |
| Z15 | `enrichDeductionSnippets`(796-812) 四分支（无对应规则 / key!=='path' / **越界守卫 :805** / 读失败 catch :808） | 零引用 |
| Z16 | `markFailed`(823-831) | 零引用 |
| Z17 | `generateChecker`(844-1159) **316 行全部分支** | §4.3：22 个 integration 套件全在 controller 层短路 |
| Z18 | `confirmChecker`(1174-1251)（regenerate / update_rules 合法与非法 / confirm 版本翻转 / to_subjective / exempt / accept / itemIds 非数组 / q 为 null） | 同上（`ownership-guards` R15/R18 走 404/400 短路） |
| Z19 | `rollbackChecker`(1259-1280)（q 为 null / 版本不存在 / 正常翻转） | 同上（R16/R19 走 404/400 短路） |

**B. 部分覆盖函数里的零覆盖分支（更隐蔽，逐条）**

| # | 零覆盖分支（源行） | 依据 |
|---|---|---|
| Z20 | `parseCheckerRules` 客观项循环的 `if (!it \|\| typeof it !== 'object') continue`（:298） | 11 例夹具中**无一条**含非对象元素 |
| Z21 | `parseCheckerRules` 的 **`it.name` 兜底**（:300 / :329，模型字段漂移容错） | 无任何夹具使用 `name` 字段 |
| Z22 | `params` 非对象/数组校验（:305） | 无 `params: null` / `params: []` 夹具 |
| Z23 | **id 冲突跳过分支**（:309-312 / :336-338） | 无重复 id 夹具 |
| Z24 | **自动 id 的 `while` 重试**（:308 / :335，仅当 `a1` 已被显式占用时进入） | :206 的夹具用的是 `keep1`，不触发 |
| Z25 | objective 的 `ms` 非有限/≤0 丢弃（:303；subjective 同 :332） | 夹具的 `max_score` 全部合法 |
| Z26 | **总和归一化的「超出 → 等比缩放 + 最大余数法」整支**（:352-366） | 11 例全部落在 `objSum < target` 的**补差**支（:292/:310 实测断言值 50/70 均为补差结果） |
| Z27 | **极端兜底「末项被扣到 ≤0 时从最大项借分」**（:371-377） | 依赖 Z26，双重不可达 |
| Z28 | `attachNegativeFeedback` 的 **`lastFeedback` 本身是数组**的分支（:636 `!Array.isArray` 假） | :446/:449/:452 只喂 `{...}` / `null` / `{...}` |
| Z29 | `runCheckerScript` 的 `'检查脚本输出不是合法结果 JSON'`（:445） | 无「脚本输出非法 JSON」夹具 |
| Z30 | `runCheckerScript` 的 **`err.killed` 超时分支**（:448） | 无超时夹具（需 >30s 或改常量） |
| Z31 | `runCheckerScript` 的 `finally` 清理失败 catch（:452） | 无「临时文件删不掉」夹具 |
| Z32 | `parseCheckerResult` 的 `evidence` 空串/纯空白分支（:255） | :166 覆盖了非字符串；**空串/空白未测** |
| Z33 | 13 条段落横幅与 51 个空行 | 无行为语义（搬移时**不搬**，见 §2.2） |

→ **Z1–Z31** 这些行（约 :93-167、:298-312、:326-341、:352-377、:636、:445-452、:650-812、:823-1159、:1174-1280）**没有任何行为断言兜底**；搬移正确性只能靠 §7.3 的 **S 系列切片判等 + F/G 系列双树对拍**。

### 7.3 C 的可执行行为对拍配方（改前 vs 改后，逐字节相等 · **禁止真外网**）

**装置纪律（4 条，缺一不可）**：
1. **两侧各自独立 node 进程**（禁止同进程同时 import 改前/改后 —— 本仓有 tree-sitter ABI 污染事故先例，`docs/reports/batch-a-round-1.md` BUG-A-01；本模块 `factExtractor` 会拉起 tree-sitter）。
2. **夹具目录同一份被两侧复用**（否则 evidence 里的绝对路径会造成假阳性）。
3. **结果写文件，不写 stdout**（pino NDJSON 会污染 stdout；step 1 已实证）。
4. **三个桩必须在两侧完全相同地施加**（否则比的是桩不是代码）。

**① 冻结改前源（不污染工作树）**
```bash
cd "<repo>"
ANCHOR=c26c8dce5dcdec20acd5c0ec6af5fe1359b7cb23      # ← 本方案实测 HEAD；C 执行时应重新 rev-parse 并记录
rm -rf /tmp/splitC-before /tmp/splitC-after && mkdir -p /tmp/splitC-before
git archive "$ANCHOR" server | tar -x -C /tmp/splitC-before
ln -s "<repo>/node_modules" /tmp/splitC-before/node_modules
shasum -a 256 /tmp/splitC-before/server/src/services/checkerService.js   # 前置断言 == 37d2358c…
cp -R "<repo>/server" /tmp/splitC-after/server                          # 改后树（含 10 个新文件、无源文件）
ln -s "<repo>/node_modules" /tmp/splitC-after/node_modules
```

**② 三个桩（两侧逐字相同；这是「禁网」的技术保证）**

| 桩 | 接法 | 为什么必须 |
|---|---|---|
| **S-A 网络桩** | 探针**第一行**就 `globalThis.fetch = (url, opts) => { calls.push({url:String(url), body: JSON.parse(opts.body||'{}')}); return Promise.resolve(makeResp(queue.shift())); };`（`makeResp` 返回 `{ok, status, text(), json()}`）。再叠一层保险：`process.env.DEEPSEEK_BASE_URL = 'http://127.0.0.1:9'`（不可达端口） | `callLlm` 用**全局 fetch**（:486）且 URL 来自 `getBaseUrl()`（默认 `https://api.deepseek.com`）→ **不打桩就必然真连外网**。桩必须在 import 被测模块**之前**装好 |
| **S-B DB 桩** | 在两侧副本里用**同一份**内存替身覆盖 `server/src/utils/prisma.js`，实现 `question.findUnique / question.findFirst / question.update / systemConfig.findMany` + `export const __db / __log / __reset`；`update` 深拷贝入参并记入 `__log` | P12 段有 **11 处 DB 写**（全文件 17 次 `prisma.*`）；真库会让对拍非确定（且需要 seed）。`getConfig`(`deepseek.js:28`) 也经 `systemConfig.findMany` → 一并被桩住，`getBaseUrl/getApiKey` 变确定 |
| **S-C 时钟桩** | 装桩时冻结：`const F = 1760000000000; const RD = Date; globalThis.Date = class extends RD { constructor(...a){ super(...(a.length ? a : [F])); } static now(){ return F; } };` | `meta.startedAt = Date.now()`(:872)、`appendVersion` 的 `new Date().toISOString()`(:694) 会进 meta → 不冻结则**边界必然不等**。`sleep`(:458) 的 `setTimeout` 不受影响（保留真实等待语义） |

**③ 夹具与探针（C 自建，不复用 B 的脚本）**

| # | 夹具 / 探针 | 打靶的段落 / 零覆盖分支 |
|---|---|---|
| F01 | `parseCheckerResult` 23 例（把现有 22 例 + `evidence` 空串/空白） | P2 + **Z32** |
| F02 | `parseCheckerRules` 入参矩阵：合法 / 围栏 / 前导说明 / 截断在串中间 / 截断在括号中间 / **非对象元素** / **`name` 兜底** / **`params:null`** / **`params:[]`** / **重复 id** / **显式 `a1` + 无 id 项（撞号重试）** / **`max_score:0/NaN`** / `subjective_items` 缺键 / 非数组 / 空 objective + target>0 | P3 + **Z20–Z25** |
| F03 | **总和归一化专项**：objSum **>** target（同比缩放）/ target 极小使末项 ≤0（借分支）/ 每项恰 1 分 / n=1 放大 | **Z26 / Z27** |
| F04 | `findMisplacedSubjective`：**7 个分隔符逐个**（`（` `(` `:` `：` `,` `，` 空格）+ group 精确 / item 精确 / semi 不触发 / 无 `automation_level` / `null` 入参 | P4 |
| F05 | `attachNegativeFeedback`：对象 / `null` / **首参为数组** / `weakRules` 非数组 / `weakRules` 非空 | P8 + **Z28** |
| F06 | `buildGenerateUserPrompt`：language ∈ {js, java, python, undefined} × fixedItems {无, 有} × stdFileTree {空, 非空} × description {空, 非空} = 32 组，**逐字节比字符串** | P7 + Z1/Z2 |
| F07 | `buildCalibrateUserPrompt`（**需 B 从 T3 内部导出**，不进 index）：`{error}` / `{deductions:[{score<max,evidence,snippet}]}` / `{defectItems}` / `{weakRules}` / `{}` | P7 + **Z7** |
| F08 | `runCheckerScript`：正常脚本 / 抛错脚本 / **输出非 JSON** / **输出空** / **死循环（超时，可选，成本 30s）** | P5 + **Z29/Z30** |
| F09 | `packageFingerprint`：嵌套工程 / 空目录 / 不存在目录（→ `null`）；`collectProjectPaths` 的 files/dirs 集合 | **Z9 / Z13** |
| F10 | `validateRulePaths`：命中文件 / 命中目录 / **dir 指向文件** / **file 指向目录** / `./` 前缀 / 非字符串 / 空串 / 未知 rule_type（无 key） | **Z14** |
| F11 | `enrichDeductionSnippets`：无对应规则 / rule_type 无 path / **`../../etc/passwd` 越界（守卫 :805）** / 读失败（`chmod 000`） | **Z15** |
| G01–G22 | **`generateChecker` 全状态机**（S-A/S-B/S-C 三桩齐上）：① 第 1 轮满分→`ready`；② 第 1 轮 ≥阈值→`review`；③ 第 1 轮未达标→第 2 轮修正→`ready`；④ 解析失败（缺 `subjective_items`）→ 专属文案；⑤ 白名单外 rule_type 全丢→「全部无效」文案；⑥ 三分类误置→分项名文案；⑦ 路径不存在→缺陷候选豁免→`review`；⑧ 标准包目录不存在→`markFailed` 文案；⑨ 题目不存在→`null`；⑩ 新鲜 `generating`→幂等 `{status:'generating'}`；⑪ 陈旧 `generating`→继续；⑫ fetch 抛错→`'LLM 调用失败：…'`；⑬ fetch 非 200→空内容重试 2 次→`markFailed`；⑭ 连续同分 ≥3→`fresh` 重生成（:980/:986）；⑮ 多轮未达标且 best<threshold→failed 文案（:1157）；⑯ 多轮 best≥threshold→多轮最优 `review`（:1133-1150，含第二次 `runRules`）；⑰ `rubricItems` 缺失→`summarizeRubricItems` 被调 + 写回；⑱ 写回抛错→警告不中断（:907）；⑲ 语言检测失败→回退 JS（:923-925）；⑳ `validateNegativeTests` 抛错→skipped 且**不中断**（:1035-1046）；㉑ weakRules 非空→进 `lastFeedback`；㉒ weakRules 空→反馈无该段 | **Z17 + Z1–Z6 + Z10–Z12 + Z16** |
| H01–H09 | `getCheckerState` × {题目不存在 / `checkerMeta` 为 null / 完整 meta}；`confirmChecker` × {regenerate / update_rules 合法 / update_rules 非法（`validateRules` 拒绝）/ confirm（versions 空 / 有 latest）/ to_subjective（命中 / 未命中） / exempt / accept / itemIds 非数组 / q 为 null}；`rollbackChecker` × {q 为 null / 版本不存在 / 版本 0 / 正常} | **Z8 / Z18 / Z19** |

**④ 判等（只比 JSON 字节，三个维度都要比）**
```bash
PORT=0 node /tmp/splitC-probe/run.mjs /tmp/splitC-before/server/src/services/checkerService.js      /tmp/splitC-fixtures out/before1.json
PORT=0 node /tmp/splitC-probe/run.mjs /tmp/splitC-before/server/src/services/checkerService.js      /tmp/splitC-fixtures out/before2.json   # 装置自检
PORT=0 node /tmp/splitC-probe/run.mjs /tmp/splitC-after/server/src/infrastructure/ai/checker/index.js /tmp/splitC-fixtures out/after1.json
cmp out/before1.json out/before2.json   # 必须相等（否则装置不确定，判负）
cmp out/before1.json out/after1.json    # 唯一允许的差异：模块 basename 字段（建议输出里干脆不带该字段）
```
每个 case 的 JSON 必须含 **3 个维度**：**① 返回值**（逐字段）**② 终态 DB**（`__db` 快照）**③ 有序调用日志**（`__log`：prisma 操作序列 + 每次 fetch 的 `{url, body}`）—— 只比返回值会漏掉「同一结果、不同写序」的漂移。
**输出规范化**：绝对路径（夹具根 / `os.tmpdir()` 随机名 / `logs` 路径）必须在序列化前替换成占位符（`<FIXTURE>` `<TMP>`），否则两侧路径差异造成假阳性；时间戳已由 S-C 冻结。

**⑤ 装置自检 + 反证（缺任一条即判负）**
- **自检 1**：`before` 连跑两次 `cmp` 必须相等。
- **自检 2（防假绿）**：G12 必须真的命中 `'LLM 调用失败：'`（证明 S-A 桩真被调用）；G04 必须命中「缺少 subjective_items」文案（证明 `parseCheckerRules` 真在跑）；F08 的抛错夹具必须命中 `'检查脚本执行失败：'`（证明真的起了子进程）。
- **反证（必须有分辨力）**：在 `/tmp` 复制改后树，注入 3 处变异 —— ① `parseCheckerRules` 的 `Math.round` → `Math.floor`；② `buildGenerateUserPrompt` 的 `'【满分】'` → `'【满分 】'`；③ `getCheckerState` 的默认 `threshold: DEFAULT_THRESHOLD` → `threshold: 0`。确认 `cmp` **报差异**。做不到 = 恒等装置，判负。

**⑥ 逐字搬移的静态判等（覆盖 Z17/Z30 这类夹具打不到或成本过高的分支）**
```bash
node /tmp/splitC-probe/slice-equal.mjs   # C 自建：从改前/改后两侧按「JSDoc + 声明」切块，逐块 sha256 对拍
# 期望：27 个函数 + 21 个常量 = 48 块，每块 sha256 完全相同（= 0 处改写）
# 并做反向校验：10 个目标文件的每个非空白字节，只能是 banner / import 行 / export 行 / 源切片之一，剩余未匹配字节必须为 0
```
（可行性前提：§10 要求**不得在声明行加/改 `export`**，跨模块暴露一律用文件末尾 `export { … };` 块 → 48 块可与源文件逐字节相等。）

**⑦ 禁网的三重保证（给 C 写进报告的自证）**：① `globalThis.fetch` 在 import 前被替换，且替换体不调用原始 fetch；② `DEEPSEEK_BASE_URL` 指向 `127.0.0.1:9`；③ 探针结束断言 `fetchCalls.every(c => c.url.startsWith('http://127.0.0.1:9') || c.url.startsWith('about:none'))`，并把 `fetchCalls.length` 写进报告（0 次 = 有 case 没走到 LLM 路径，也要如实记录）。

---

## 8 风险分级

| # | 搬移单元 | 等级 | 理由（依赖复杂度 / 测试覆盖 / 是否在评分链路 / 外部副作用） |
|---|---|---|---|
| R1 | **T1 `parsers.js`**（domain，246 行） | **低** | 0 import、纯函数；22 + 11 例直接覆盖；**但含 Z20–Z27 共 8 个零覆盖分支**（总和归一化缩放支、id 冲突、`name` 兜底…）→ 低而非「极低」 |
| R2 | **T2 `meta.js`**（domain，60 行） | **低** | 0 import、纯函数；仅 `attachNegativeFeedback` 有 2 例（另含 Z28） |
| R3 | **T3 `prompts.js`**（infra，172 行） | **中** | 纯字符串拼接、零 IO，**但整段零测试（Z1/Z2/Z6/Z7）**；一行文案错位即改变模型输入 → 只能靠 F06/F07 逐字节对拍 |
| R4 | **T4 `llm.js`**（infra，71 行） | **中** | 唯一**外网**出口 + 重试/超时/空内容三条零覆盖分支（Z4/Z5）；**必须打桩**才能验；且要照带死绑定 `getModel` |
| R5 | **T5 `legacy-script.js`**（infra，41 行） | **中** | **起真实子进程**（沙箱/超时/缓冲）；2 例覆盖但断言松散（:352 用 `\|` 正则，改文案也过）；Z29–Z31 零覆盖。**注：该段生产零调用（§5）**，故风险局限在测试面 |
| R6 | **T6 `package-inspect.js`**（infra，95 行） | **中** | fs 语义敏感（越界守卫 :805、目录 vs 文件、权限）；两函数完全零覆盖（Z9/Z13/Z14/Z15） |
| R7 | **T7 `state.js`**（infra，17 行） | **中** | 短但**在评分链路入口**（教师轮询的状态源）；零覆盖（Z8）；默认 meta 的 10 个字段逐字敏感 |
| R8 | **T8 `review.js`**（infra，117 行） | **中高** | 4 个 action × 状态翻转 + `validateRules` 门 + 版本状态机；**零覆盖（Z18/Z19）**；且是 `generateChecker` 的调用方（`regenerate` fire-and-forget） |
| R9 | **T9 `generator.js`**（infra，381 行） | **高** | **评分主链路**；316 行单函数 + 闭包 + 11 处 DB 写 + 外网 + 子进程；**零覆盖（Z17）**；唯一兜底 = 切片判等 + G01–G22 打桩对拍。→ §9 把它单独放最后一批 |
| R10 | **T10 `index.js`**（infra，13 行） | **高（唯一硬失败点）** | 导出面少一名 → I1/I2 在 **import 阶段**整体爆炸（constraints §3-12）；7 行 re-export **对 check-layers / cycle-check 不可见**（§2.3）→ 只有 bind-check 能拦 |
| R11 | **删除 `services/checkerService.js`** | **高** | 一步影响 2 个 import 站点 + 23 个传递加载套件；必须与 T10 + I1/I2 **同一提交** |
| R12 | 未分层 46 → 45 / GodFile 8 → 7 | 低 | 由构造保证；`arch-metrics` 判据是「不劣于基线」（实测 `arch-metrics.mjs:66-68`），**下降不会被判劣化** |

**顺序建议（给 B）**：T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → **先建 T10 并跑 bind-check** → 改 I1 / I2 → **最后**删源文件。每段完成后立即 `node --check` **并真 import 一次**（`node --check` 不校验跨模块绑定，constraints §3-12）。

---

## 9 分批建议（每批可独立提交、各自过 DoD）

**先说结论**：本文件的一次性拆到底**在技术上可行**（直接 import 站点只有 2 个、无 jest mock 单点故障，比 step 1 的 ruleExecutor 更简单）。但 **T9 `generateChecker`（316 行、零覆盖、评分主链路）** 的风险与其余 9 个文件不在一个量级 → **建议分 3 批**，把 T9 隔离到最后。中间态采用**门面（facade）**：源文件保留为 `checkerService.js`，只把已迁出的名字改为 `export { … } from …` 再导出 → **导出面对外逐字不变，I1/I2 在前两批完全不用改，42 例测试原样跑**。

| 批 | 动作 | 触及文件 | 完成后指标 | 该批的自证判据 |
|---|---|---|---|---|
| **B1** | 建 `domain/services/checker/`，落 **T1 + T2**；源文件删去对应区间，改为 2 行 re-export + 2 行 import（`RULE_TYPES` / `DEFAULT_THRESHOLD`） | 2 新建 + 1 改 | 源文件 1280 → **≈978**；未分层 **46**（不变）；GodFile **8**（不变，仍 >800）；违规 0 | ① 48 块切片判等（只校 T1/T2 的 20 块）② F01–F05 对拍 byte-identical ③ F06/F07（`RULE_TYPES` 注入路径）逐字节 ④ `node --check` + 真 import 一次 ⑤ `check-layers` 违规 0 |
| **B2** | 建 `infrastructure/ai/checker/`，落 **T3 + T4 + T5 + T6 + T7 + T8**；源文件继续 re-export 出 `runCheckerScript` / `buildGenerateUserPrompt` / `getCheckerState` / `confirmChecker` / `rollbackChecker` | 6 新建 + 1 改 | 源文件 ≈978 → **≈477**（**< 800**）→ **GodFile 8 → 7**；未分层 46（不变）；违规 0 | ① 切片判等补齐 6 个文件 ② **F06–F11 + H01–H09** 对拍 ③ 装置自检 + 变异反证 ④ 门禁三连 ⑤ `git diff` 里 `checker-service.test.js` **零改动** |
| **B3** | 落 **T9（generator）**；建 **T10 `index.js`**；**删除**源文件；改 **I1 / I2** 两个 import 站点 | 2 新建 + 2 改 + 1 删 | **未分层 46 → 45**；GodFile 7（不变）；违规 0；SCC 0 | ① 48/48 块切片判等 + 反向「多余字节 = 0」② **G01–G22** 全状态机对拍 ③ `Object.keys(idx).sort()` 与改前**逐字相等**（10 名）④ bind-check 违规 0 ⑤ 全量回归 0 failed |

**每批的 DoD（复用 plan §5，server 侧 4 条 + 本发明补充）**：① `node server/scripts/check-layers.mjs` → 违规 0 且未分层不增；② `node scripts/gates/cycle-check.mjs` → SCC 0；③ `node scripts/gates/hard-metrics.mjs` → 0/0/0（只扫 client，本步应逐字不变）；④ `node scripts/gates/bind-check.mjs` → 违规 0；⑤ `node scripts/gates/arch-metrics.mjs` → PASS；⑥ `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → 4 处 `Test Suites:`、**0 failed**、用例数**如实记录**（本步不新增测试，期望仍是 974+17+61+21*）；⑦ 行为对拍 byte-identical（§7.3）；⑧ 每批一个提交，消息含「拆分前 `file:line` 范围 + 落层目标 + 验证结果」。
（* 段 1 用例数会随 step 2 及后续步骤变化 —— **不得引用旧基线**，以实跑为准。）

**若 Captain 判定「一次拆到底」**：则跳过门面，一次性建 10 个文件 + 删源 + 改 I1/I2，**单提交**；判据不变（§7.3 全量对拍 + 48 块切片判等 + 四门禁 + 全量回归）。本方案把 3 批列为**推荐**而非**必须**。

---

## 10 给 Agent B 的逐字搬移指令

**总则（不可协商）**
1. **只改 §2.2 的 10 个新建文件 + §4.1 的 I1/I2 两个站点**（分批执行时外加源文件的门面改写）。**不得**碰 `scripts/gates/*`、`server/scripts/*`、`server/test/` 的**断言**、`client/**`、`tests/`、`server/logs`、`server/package.json`。
2. **搬移 = 按 §2.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角括号、`：`、`——`、`…`、空行位置）。段落横幅（169/230/273/384/417/456/527/626/643/663/731/814/1161）**不搬**，各目标文件自带 banner。
3. **不得在任何声明行加/改/删 `export`**（会破坏 §7.3⑥ 的切片判等）。源文件里本来就带 `export` 的 **10 个函数**照原样带；其余跨模块暴露一律用**文件末尾单个 `export { … };` 块**（见下）。
4. 每个新文件顶部加 3–4 行 banner，**固定格式**（便于 C 机械核对）：
```
/**
 * <文件名> —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */
```
5. **不要写 smoke test 脚本、不要新增/修改任何测试文件**（C 的职责）；不要动 `server/package.json` 的测试脚本。
6. **保留全部死代码/既有缺陷**：`getModel` 死绑定（→ T4 的 import 子句，逐字带）、`RULE_TYPES` 的**错误注释** `:60`「与 ruleExecutor.RULE_TYPES 一致」（→ T1，**不许改对**）、`buildGenerateUserPrompt` 的「纯导出零引用」状态（→ T3，**不许降级为私有**）。
7. 全部完成后**再**删 `server/src/services/checkerService.js`；**不要**用任何回滚类 git 命令。
8. **不许顺手修 §1.1-2 的 `RULE_TYPES` 缺陷**（那是行为变更，必须另开一步 + 另过 DoD）。

**逐文件执行单**

| 步骤 | 动作 | 完成判据（自重） |
|---|---|---|
| B1 | 建 `domain/services/checker/`，写 T1（60-70, 171-228, 232-271, 275-382, 386-387, 389-415）+ banner + `export { RULE_TYPES };` | `node --check` 通过；**零 import** |
| B2 | 写 T2（43-44, 628-641, 684-700, 702-710, 712-729）+ banner + `export { DEFAULT_THRESHOLD, appendVersion, markDefectReportItems, buildReport };` | 同上；**零 import** |
| B3 | 建 `infrastructure/ai/checker/`，写 T3（72-83, 85-90, 92-96, 98-103, 105-112, 114-121, 123-129, 131-136, 138-146, 148-157, 529-570, 572-624）+ banner + 1 条 import（`RULE_TYPES`）+ `export { GENERATE_SYSTEM, buildCalibrateUserPrompt };` | 同上 |
| B4 | 写 T4（51-52, 55-56, 458-460, 462-525）+ banner + 2 条 import（**含 `getModel`**）+ `export { callLlm };` | `grep -c 'getModel' llm.js` = **1** |
| B5 | 写 T5（39, 45-46, 47-48, 419-454）+ banner + 6 条 import | 无 export 块（`runCheckerScript` 声明行已带） |
| B6 | 写 T6（665-682, 733-742, 744-765, 767-787, 789-812）+ banner + 3 条 import + `export { packageFingerprint, collectProjectPaths, validateRulePaths, enrichDeductionSnippets };` | 同上 |
| B7 | 写 T7（645-661）+ banner + 2 条 import | 无 export 块 |
| B8 | 写 T8（1163-1251, 1253-1280）+ banner + 5 条 import | 无 export 块；**确认 T8 不 import T7 以外的 checker 内部件、T9 不反向 import T8（防环）** |
| B9 | 写 T9（41-42, 49-50, 53-54, 57-58, 159-167, 816-831, 833-1159）+ banner + 14 条 import（§2.4） | 同上；`grep -c 'getCheckerState' generator.js` = **0** |
| B10 | 写 T10 `index.js`（§2.3 的 7 行 re-export + 文件头注释） | `PORT=0 node -e "import('./server/src/infrastructure/ai/checker/index.js').then(m=>console.log(Object.keys(m).sort()))"` → **恰好 10 个名字** |
| B11 | 改 I1（`checkerController.js:6` 路径） | `PORT=0` 真 import 该 controller，无 `does not provide an export named` |
| B12 | 改 I2（`checker-service.test.js:13` **仅路径**） | `git diff --stat server/test` 只出现 1 行路径改动 |
| B13 | **删除**源文件；跑 `node scripts/gates/bind-check.mjs` | `grep -rn 'services/checkerService.js' server/src server/test server/scripts` = **0**；bind-check 违规 0 |
| B14 | 写 `docs/split/checkerService-refactor.md`（源区间 → 目标文件:行 + 每块 sha256） | 27 函数 + 21 常量全覆盖 |

**分批执行时的额外指令**：B1/B2 两批**不要**建 `index.js`、**不要**改 I1/I2；源文件里把已迁出的 10 个名字改成 `export { … } from '<新路径>';`（**放在文件末尾**，不要与既有声明混排），并在文件头 import 区补上仍被内部使用的 `RULE_TYPES` / `DEFAULT_THRESHOLD`。

**禁令（违反即回流）**：① 顺手修 `getModel` / `RULE_TYPES` 注释 / prompt 与白名单矛盾之类「优化」；② 在同一提交里改任何中文文案、正则、阈值、`max_score` 逻辑；③ 改 `server/test/` 的断言（只允许改路径）；④ 改门禁脚本以「适配」新路径；⑤ 用 `git checkout/restore` 回滚（用重编辑）；⑥ 把 `export { … } from` 换成 `export * from`。

---

## 11 给 Agent C 的验证清单

C 为只读 + 自建对拍（**不复用 B 的脚本**），临时产物一律放 `/tmp`，探针一律 `PORT=0`。

| # | 验证项 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| V1 | 版本锚点 | `git rev-parse HEAD`；`shasum -a 256` 冻结副本 | `checkerService.js` == `37d2358c…`（若已删，用 `git show c26c8dc:server/src/services/checkerService.js` 重建） |
| V2 | **逐字搬移（静态）** | §7.3⑥ `slice-equal.mjs`：27 函数 + 21 常量 = **48 块** sha256 | **0 块不等**；反向「未匹配字节 = 0」（唯一能覆盖 Z17 等零覆盖分支的判据） |
| V3 | 声明行 export 审计 | 目标侧声明行 `export` 计数 = **10**，名字集与源**完全相同**；`export *` 出现次数 = **0** | 逐字相等 |
| V4 | **行为对拍（动态）** | §7.3③④：F01–F11 + G01–G22 + H01–H09，两个独立进程，`cmp` JSON（**比返回值 + 终态 DB + 调用日志** 三维度） | **byte-identical**；先过「before 跑两次相等」 |
| V5 | 装置自检 | G12 命中 `'LLM 调用失败：'`；G04 命中「缺少 subjective_items」；F08 抛错夹具命中 `'检查脚本执行失败：'` | 三项全中（否则装置没打到靶） |
| V6 | **变异反证** | §7.3⑤ 注入 3 处变异（`Math.round→floor` / `'【满分】'→'【满分 】'` / `threshold: DEFAULT_THRESHOLD→0`） | 必须**报差异**；不报 = 装置失效，判负 |
| V7 | **禁网自证** | 探针断言 `fetchCalls.every(c=>c.url.startsWith('http://127.0.0.1:9'))`；报告写明 `fetchCalls.length` 与 `DEEPSEEK_BASE_URL` | **0 次真实外网**；未打桩的 case 如实列出 |
| V8 | **导出面** | `PORT=0 node --input-type=module -e "const m=await import('<新 index.js>');console.log(Object.keys(m).sort())"`，与改前同法对拍 | 恰好 10 名：`attachNegativeFeedback, buildGenerateUserPrompt, confirmChecker, findMisplacedSubjective, generateChecker, getCheckerState, parseCheckerResult, parseCheckerRules, rollbackChecker, runCheckerScript`（**逐字相等**） |
| V9 | 零覆盖分支专项 | F02/F03/F05/F08/F10/F11 + G01–G22 的 evidence 逐条对照改前 | 逐字节相同（尤其 `'规则解析失败：…'` `'规则校准校验失败：…'` `'标准工程包目录不存在：…'` `'检查脚本输出不是合法结果 JSON'` `'检查脚本执行超时（30000ms）'` `'生成 3 轮后标准包最高得分 …'`） |
| V10 | 分层门禁 | `node server/scripts/check-layers.mjs` | 违规 **0**；未分层 **45**（≤46）；**并做门禁证伪**（§3 的四条反向陷阱，/tmp 副本）确认门禁有牙 |
| V11 | 架构门禁 | `node scripts/gates/arch-metrics.mjs` | PASS；unmigrated ≤46；**GodFile 8 → 7**；观察带如实记录（预期 18 → 17，因源文件降到 <500） |
| V12 | 循环依赖 | `node scripts/gates/cycle-check.mjs` | **SCC = 0**、自环 0（边数会变属预期，我的预判 ≈194 **不作判据**；注意 re-export 行**不计边**） |
| V13 | 绑定门禁 | `node scripts/gates/bind-check.mjs` | 违规 **0**；`unresolved` / `external` 与改前基线**一致**（**唯一能验 index.js 的 7 行 re-export 的门禁**） |
| V14 | 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0（只扫 `client/src`，本步应**逐字不变**） |
| V15 | 全量回归 | `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`（**先查空序号**，脚本对已占用序号 `exit 4`） | 日志 **4 处 `Test Suites:`**、**`failed = 0`**；套件/用例数如实记录（**不得引用旧基线**；本步不新增测试，期望 68 套件 / 974+17+61+21） |
| V16 | 越界自查 | `git status --porcelain` + `find . -newermt '<B 开始时刻>' -not -path './node_modules/*'` | 只有计划内的 10 新 + 2 改（+1 删 + B 的报告）；`client/dist` / `tests/` / `scripts/gates/` 的 mtime 无变化 |
| V17 | 回滚粒度 | `git show --stat HEAD` | 单提交，消息含「拆分前 file:line 范围 + 落层目标 + 验证结果」 |

**判定纪律**：V2 / V4 / V6 是本步核心判据（其余是既定门禁）。任一不符 → 回流 B，**不得**改测试或改门禁迁就实现。

---

## 12 局限声明

1. **未真落文件、未真跑对拍**：§3 的合规预判 = 「用真实门禁脚本自身的常量 + 逐字复刻的判定式，在内存中对合成 import 清单求值」，**不等于** `node server/scripts/check-layers.mjs` 对真实新文件的实跑；§7.3 的夹具矩阵是**配方**，未执行。真跑必须由 C 完成（V10/V4）。
2. **未跑 jest / build / 服务**（A 角色禁令）：§7.1 的覆盖判定是**静态 + 人读**（`it(` 计数 + describe 归属 + 断言字符串 + 分支可达性推演），**不是覆盖率工具读数**；§7.2 的零覆盖分支我逐条给了依据，但**未做运行时探针验证**。
3. **「22 个 integration 套件未执行 service 代码」是论证而非证明**：结论建立在「`checkerController` 的归属守卫在 service 调用前 404/400 短路」的逐行阅读（`checkerController.js:38-108`）+ `ownership-guards.test.js:537-575` 的用例内容上。若 C 发现某个套件走到 service（例如新增了同教师的正向用例），**以 C 的实测为准并回流本方案**。
4. **`getModel` 与 `RULE_TYPES` 两处发现的性质不同**：前者**纯死代码**（零消费，实测）；后者是**真实行为缺陷**（提示词与白名单矛盾 → 语义级规则被静默丢弃 + 分值被归一化补到末项）。两者本步都**只登记不修**；第 2 条的**线上影响未取证**（不知道历史上是否真有 `ast_pattern` 被丢的样本）→ 属**未证事项**，不得据此声称「线上已出错分」。
5. **行数预估有 ±5% 误差**：§2.2 的预估 = 搬移行数 + 我对 banner / import / export 块的估计。判据是 **< 800**（最大 381，远未逼近），不是精确值。
6. **分批的中间态行数是推算**：B1 ≈978 / B2 ≈477 由「搬移行数 + 门面 re-export 行数」算出，**未实际构造**；真值以 B 的 `wc -l` 为准（只要 B2 后 < 800 即达成 GodFile 8→7）。
7. **未审计依赖邻居**：`services/deepseek.js` `services/projectContextBuilder.js` `services/ruleMutator.js` `services/factExtractor.js` `utils/prisma.js` `utils/logger.js` `utils/projectPaths.js` 仍是 **unlayered**，T3–T9 会持续依赖它们。这是**显式登记的既有技术债**：若后续步骤迁它们的层，本方案的相对路径需同步调整（**不是本步缺陷**）。
8. **`infrastructure/ai/checker/` 的目录选择留有备选**：若 Captain 要求严格按架构文档 §1.1 的词面分工（`persistence/` 放仓储、`ai/` 放网关与 Prompt），则 T7/T8 可改落 `infrastructure/persistence/checker-{state,review}.js`（import 路径相应 +1 层），**其余全部不变**（导出面、对拍配方、门禁预判、未分层仍为 45）。
9. **未做数据侧取证**：§5 的「旧脚本族生产零调用」是**代码级**实测；「线上是否还有非 JSON 的历史 `checkerScript` 数据」**未取证**（需查库，超出只读范围）。
