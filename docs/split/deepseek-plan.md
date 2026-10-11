# deepseek.js 拆分方案（接缝与护航分析）

- **step**: 4 ｜ **phase**: A（接缝与护航分析）｜ **日期**: 2026-10-11
- **目标文件**: `server/src/services/deepseek.js`（**1051 行**；我实测 `wc -l` = 1051、`src.split('\\n')` 末元素为空 ⇒ 1051 行正文，arch-metrics 报 **1051**，三者一致）
- **方案来源**: `docs/plan/2026-10-11-godfile-split-plan.md` §3/§4-S3/§5/§8/§8.1 ｜ 状态机 `docs/split/status.md`
- **版本锚点（本方案全部实测数据的取值时刻）**:
  - HEAD = `e2e70fdf0580ff97ae9e458760a6309c8982721f`（`git rev-parse HEAD` 实测）
  - 目标文件 sha256 = `c13fceb9b1ce88525db5e5cb5dad9528dbac12f6647fa1d358284365a87adc02`
  - `node server/scripts/check-layers.mjs` 实测：**文件 87 个 / 违规 0 条 / 未分层待迁移 45 个**
  - 四门禁实测全绿：arch-metrics PASS（layerViolations 0 / unmigrated 45 / GodFile 7 / 观察带 17）；cycle-check PASS（87 文件 / **194 条相对边** / SCC 0 / 自环 0）；bind-check 违规 0（592 绑定）；hard-metrics 0/0/0
  - 我自建 import 图扫描器实测：`server/src` **87 文件 / 198 条相对 import 边**（与 cycle-check 的 194 独立吻合，差额 4 = cycle-check 只统计 src 内可解析目标）

> ⚠️ `docs/split/status.md` 写的「未分层 46 / GodFile 8 / 观察带 18」是 **step 3 之前的基线**；step 3 已把 checkerService 拆成 10 个分层文件 → **现在真实值是 45 / 7 / 17**（我实测）。

## 0 约束遵守声明

| 约束 | 遵守方式 |
|---|---|
| 纯只读 | 仅写入本文件 `docs/split/deepseek-plan.md`；未创建/修改/删除任何其它文件（临时数据只写在 `/tmp` 下的分析缓存与 spill 文件） |
| 禁止 git 写操作 | 只执行 `git rev-parse / status`；无 clean / stash / checkout / reset / restore |
| 不跑 jest / build / 服务 | 未执行任何 jest、build、服务启动；未触碰 :5173 / :3000 / `client/dist` / `tests/`；未写 `tests/` |
| 禁止联网 | 未调用任何网络工具（web_search / web_fetch 一次都没用）；未调用真实 LLM |
| 行号与计数自测 | 全文行号 / 行数 / 声明数 / 导出面 / 导入站点 / 测试例数均由我在本轮实测（方法与依据随表给出），未照抄任务书或历史报告 |
| 不改对外契约 | 全部搬移单元 = 源码切片位移 + import 重排 + 文件末尾 `export { … };` 块；对外导出面**逐字保持今日的 21 个名字** |

---

## 1 段落接缝图谱（逐段实测）

**实测方法**：读全文 1051 行 → 定位 7 条 `// ==== ====` 横幅（:5 / :159 / :375 / :456 / :748 / :851 / :974）→ 用 tokenizer-lite（剥离注释、字符串、模板字面量）对 41 个顶层声明求起止 → 逐块正则求「本块引用了哪些其它顶层名」→ 逐块人读判定 IO。

**声明总数 = 41**（**23 函数 + 18 常量**，与任务书「23 个顶层函数」实测吻合）。导出面 = **21 个名字**（见 §4.2）。

| # | 段落（横幅） | 起止行（实测） | 行数 | 导出符号（实测） | 依赖的外部包 / 其它段落 | 纯函数？ | 含 IO？ |
|---|---|---|---|---|---|---|---|
| **P0** | 文件头 · 导入面 | 1–4 | 4 | —（无 re-export） | `../utils/logger.js` `../constants.js` `../utils/prisma.js` | 否（声明区） | 否（但 `prisma` 是 **DB 句柄**） |
| **S1** | 配置读取（优先 DB → 回退 ENV）:5 | 5–43 | 39 | `clearConfigCache`(:23) `getConfig`(:28) `getProjectContextMode`(:34) `getApiKey`(:40) `getBaseUrl`(:41) `getModel`(:42) `getConcurrency`(:43) | S1 内部（`loadConfig` 私有 :10） | **否** | **★DB 读**：`prisma.systemConfig.findMany()`(:13)；`process.env` ×4(:40-43) |
| **S2** | 试卷解析 :159 | 159–373 | 215 | `parseExamPaper`(:238) `parseExamPaperStream`(:303) | `PARSE_ROLE`(:161) `PARSE_RULES`(:163)；`getBaseUrl/getApiKey/getModel`(S1) | 否 | **★外网 fetch** ×2(:248/:309)；`console.log/error` ×5；`logger` |
| **S3** | 参考答案生成 :375 | 375–454 | 80 | `generateReferenceAnswer`(:392) | `GEN_ROLE`(:377) `GEN_RULES`(:378)；S1 | 否 | **★外网 fetch**(:409)；`logger` |
| **S4** | 实训题项目评分 :456 | 456–746 | 291 | `PROJECT_ROLE`(:465) `OPEN_PROJECT_ROLE`(:473) `buildProjectGradePrompt`(:597) `buildOpenProjectGradePrompt`(:632) `gradeProject`(:666) | `PROJECT_SECURITY_CLAUSE`(:462) `DEFAULT_PROJECT_CRITERIA`(:476) `repairTruncatedJson`(:498 私有) `extractProjectGradeJson`(:536 私有) `PROJECT_OUTPUT_SPEC`(:568)；S1 | **混合**（见下注 a） | **★外网 fetch**(:679)；`logger` |
| **S5** | L1 两阶段·第一轮文件选择 :748 | 748–849 | 102 | `extractFilesJson`(:768) `selectImportantFiles`(:781) | `SELECT_ROLE`(:750) `repairTruncatedJson`(**S4** :498)；S1 | **混合**（见下注 b） | **★外网 fetch**(:805)；`logger` |
| **S6** | 评分标准固定分项 :851 | 851–972 | 122 | `normalizeRubricItems`(:866) `summarizeRubricItems`(:908) | `RUBRIC_ROLE`(:853) `AUTOMATION_LEVELS`(:856)；S1；S6 内部 | **混合**（见下注 c） | **★外网 fetch**(:929)；`logger` |
| **S7** | 主观分项评分 :974 | 974–1051 | 78 | `gradeSubjectiveItems`(:988) | `extractFilesJson`(**S5** :768)；S1 | 否 | **★外网 fetch**(:1004)；`logger` |

注（S4 混合）：**纯** = `repairTruncatedJson` `extractProjectGradeJson` `buildProjectGradePrompt` `buildOpenProjectGradePrompt`（+ 3 个常量）；**触网** = `gradeProject`。
注（S5 混合）：**纯** = `extractFilesJson`；**触网** = `selectImportantFiles`。
注（S6 混合）：**纯** = `normalizeRubricItems`（+ 2 常量）；**触网** = `summarizeRubricItems`。

**接缝判决**：7 条横幅切得很干净，但有 **4 处「物理位置 ≠ 逻辑归属」**（按横幅整段搬移会产出杂糅模块）：

1. **`repairTruncatedJson`(:498-527) 与 `extractProjectGradeJson`(:536-562) 物理在 S4，逻辑是跨段共享工具** —— 前者被 S5 的 `extractFilesJson`(:776) 调用。
2. **`extractFilesJson`(:768-779) 物理在 S5，逻辑被 S7 依赖**(:1029)。→ 它是「锚段函数」，不能留在原地。
3. **`gradeProject` 的 JSDoc(:478-488) 与函数体(:666) 被 178 行代码隔开**（:654-665 是**第二份**同名 JSDoc）→ 搬移时第一份**必须跟着 `gradeProject` 走**（不能留给 `repairTruncatedJson`）。
4. **`gradeSubjectiveItems` 的 JSDoc(:976-987) 与 `selectImportantFiles` 的 JSDoc(:752-762) 同样是孤儿** —— 前者离自己的函数只隔 1 行（:988），后者离 :781 隔 18 行。搬移时**一律随函数走**。

### 1.1 段落之外的三处暗礁（实测，登记但**本步一律不动**）

1. **`DEFAULT_MAX_SCORE` 是零消费死绑定**：`:2 import { ABNORMAL_FEEDBACK, DEFAULT_MAX_SCORE } from '../constants.js';`；剥离注释与字符串后全文 `DEFAULT_MAX_SCORE` 出现 **1 次（仅 import 行）**，`ABNORMAL_FEEDBACK` 出现 **1 次(:156)**。→ 搬移时必须**逐字照带**（顺手删 = 同一提交里既搬移又改行为，plan §6 明令禁止）。**与 step 3 的 `getModel` 死绑定同构**。
2. **`extractProjectGradeJson` 是「事实私有」**：全仓 0 外部引用（`grep` 实测只有本文件 :536 定义 + :711 调用）。它**没有 `export`**，因此**不属于导出面** → 本步保持私有，**不得**为了「以后可能用」而导出（会破坏导出面等价）。
3. **`repairTruncatedJson` 存在同语义双实现**：本文件 :498-527 与 `server/src/domain/services/checker/parsers.js:38-59` 是两个**不同实现**（前者多了悬空字符串/尾逗号修剪；后者用 in-string 状态机），只是同名。→ **本步不得合并**（合并 = 行为变更）；登记为后续独立项。

---

## 2 目标模块划分（源文件 → 目标文件（含层）→ 搬移内容）

### 2.1 落层设计（本方案相对 plan §S3 的核心修正）

**任务书第三步的答案：本文件不能落 `application`；plan §S3 的「项目评分/L1/固定分项/主观分项 → `application/services/grading/`」必然产出违规。**

**实测 3 条 import**（:1-3）：`../utils/logger.js` `../constants.js` `../utils/prisma.js` —— **全是相对路径、目标层全是 `unlayered`**。按 `check-layers.mjs` 的四条判定逐层试算：

- **domain**：禁令 ① `:63-64` 任何非相对 import；② `:65` 相对目标层 `!== 'domain'`。→ **只有「零 import 的纯声明块」能落 domain**：`prompts.js`、`json-extract.js`（我预判两者 import 条数 = 0，见 §2.4）。
- **application**：禁令 ① `:67-68` `isNodeIO`（实测 `NODE_IO` 正则 = `fs|path|child_process|http|https|net|tls|dns|os|worker_threads|readline|stream|zlib|vm|dgram|cluster`，可带 `node:` 前缀）或黑名单 npm；② `:69-71` 相对路径指向 `infrastructure|interface`。
  → `prisma` 确实在 `EXTERNAL_BLACKLIST` 里（**实测 23 项含 `'prisma'` 与 `'@prisma/client'`**），**但只对裸规格符生效**；本文件写的是 `'../utils/prisma.js'` → `isExternal = false` → **走 ② 分支**。
  → 真正否决 application 的是 ②：本方案 5 个「带 fetch 的段落」必须 import `./config.js`（落在 infrastructure）→ `application-imports-infra`。**全部不可能落 application**（与 step 3 否决 `checker-generator → application` 同构）。
- **interface**：`:78-81` 禁止相对路径指向 infrastructure → 同上否决。
- **infrastructure**：`:72-77` 只禁止**非组合根反向依赖** `application|interface`；依赖 `domain`（合法向下）、同层、`unlayered`（`utils/logger.js` `constants.js`）、外部包**全部合法**。→ **所有带 IO/网络/DB 的段落唯一合规落点**。

**结论（推荐形态）**：按「该声明是否有 IO / 是否跨段被依赖」三分，**不做任何函数内部再分解**：

```
server/src/
├── domain/services/deepseek/          # 零 import（用 node 内置即违规）
│   ├── prompts.js                     # 全部提示词常量 + 3 个纯 prompt builder + role 常量
│   └── json-extract.js                # 宽容 JSON 截断修复 + 2 个解析器
└── infrastructure/ai/deepseek/        # 允许 node:* / npm / unlayered / domain
    ├── config.js                      # 配置读取（DB → ENV 回退 + 1 分钟缓存）
    ├── submission-grading.js          # gradeSubmission（编程题评分）
    ├── exam-parsing.js                # parseExamPaper + parseExamPaperStream
    ├── reference-answer.js            # generateReferenceAnswer
    ├── project-grading.js             # gradeProject + gradeSubjectiveItems
    ├── file-selection.js              # selectImportantFiles（L1 第一轮）
    ├── rubric-items.js                # summarizeRubricItems（+ 复用同文件的 normalizeRubricItems）
    └── index.js                       # ★ 对外导出面（唯一入口）
```

**为什么 `prompts.js` 落 domain（与 plan §S3 的唯一实质偏离）**：`PROJECT_ROLE`/`OPEN_PROJECT_ROLE`/`buildProjectGradePrompt`/`buildOpenProjectGradePrompt`/`PROJECT_OUTPUT_SPEC`/`PARSE_*`/`GEN_*`/`DEFAULT_*`/`ROLE`/`OUTPUT_FORMAT`/`SELECT_ROLE`/`RUBRIC_ROLE`/`AUTOMATION_LEVELS`/`buildSystemPrompt` 是**纯字符串/纯拼接**（零 IO、零外部 import）→ 落 domain 才同时满足 plan §3 原则 1「拆的同时落层」与「不新增未分层」。
⚠️ **给 Captain 的备选**：若你更看重「与既有 `infrastructure/ai/prompt-builder.js` 同址」，可把 T1 移到 `infrastructure/ai/deepseek/prompts.js`（它自己不 import 任何东西，**落层预判仍 0 违规、导出面/对拍配方/门禁预判全部不变**）。这是**偏好**而非硬约束（与 step 3 对 `prompts.js` 的处置同构）。

### 2.2 对照表（源行号 = §1 实测；预估行数 = 搬移行数 + banner 4 行 + import 行；**全部 < 800**）

| # | 目标文件（层） | 搬移内容（**源文件行号，逐字**） | 搬移行数 | import 条数 | 预估总行数 |
|---|---|---|---|---|---|
| **T1** | `domain/services/deepseek/prompts.js`（**domain**） | 45-49 · 51 · 53 · 55-58 · 161 · 163-231 · 377 · 378-386 · 458-463 · 465-466 · 468-474 · 476 · 564-584 · 586-618 · 620-652 · 750 · 853 · 855-856 | 198 | **0** | **≈202** |
| **T2** | `domain/services/deepseek/json-extract.js`（**domain**） | 489-497 · 498-527 · 528-562 · 763-767 · 768-779 | 91 | **0** | **≈95** |
| **T3** | `infrastructure/ai/deepseek/config.js`（infra） | 5-6 · 7 · 8 · 10-21 · 23-26 · 28-31 · 33-38 · 40 · 41 · 42 · 43 | 34 | 2 | **≈40** |
| **T4** | `infrastructure/ai/deepseek/submission-grading.js`（infra） | 60-71 · 72-157 | 98 | 4 | **≈106** |
| **T5** | `infrastructure/ai/deepseek/exam-parsing.js`（infra） | 233-237 · 238-295 · 297-302 · 303-373 | 140 | 3 | **≈147** |
| **T6** | `infrastructure/ai/deepseek/reference-answer.js`（infra） | 388-391 · 392-454 | 67 | 3 | **≈74** |
| **T7** | `infrastructure/ai/deepseek/project-grading.js`（infra） | 478-488 · 654-665 · 666-746 · 976-987 · 988-1051 | 174 | 4 | **≈182** |
| **T8** | `infrastructure/ai/deepseek/file-selection.js`（infra） | 752-762 · 781-848 | 79 | 4 | **≈87** |
| **T9** | `infrastructure/ai/deepseek/rubric-items.js`（infra） | 858-865 · 866-894 · 896-907 · 908-972 | 114 | 3 | **≈121** |
| **T10** | `infrastructure/ai/deepseek/index.js`（infra，**新建**） | 0（9 条 `export { … } from` + 文件头注释） | 0 | 9 条 re-export | **≈16** |
| — | 源文件 `server/src/services/deepseek.js` | **整体删除** | **−1051** | | 0 |

- **搬移总量校验（逐行集合运算，无重叠、无遗漏）**：**1001 行**进切片 + **41 个空行** + **6 条段落横幅**（:159/:375/:456/:748/:851/:974；:5 的横幅在 S1 区间内被 T3 带走）+ **3 条 import 行** = **1051** ✔
- **预估总量 ≈ 1070 行**（10 个文件）。**最大 T1 ≈ 202 行 ≪ 800**；观察带（>500）**无新增**（差 298 行）。
- **门禁预期**：GodFile **7 → 6**（`deepseek.js (1051)` 从名单消失）；未分层 **45 → 44**（源文件本身 unlayered，删即净 −1；10 个新文件全部落层）；文件数 87 → 96；`layerViolations` 恒 **0**；SCC 恒 **0**。

### 2.3 index.js 汇总导出（对外导出面 = 今日实测的 **21 个名字**，一个不多一个不少）

今日实测导出面（`^export` 逐行扫，共 **21** 处；`export *` / `export { … } from` **零处**）：

`clearConfigCache` `getConfig` `getProjectContextMode` `getApiKey` `getBaseUrl` `getModel` `getConcurrency` `gradeSubmission` `parseExamPaper` `parseExamPaperStream` `generateReferenceAnswer` `PROJECT_ROLE` `OPEN_PROJECT_ROLE` `buildProjectGradePrompt` `buildOpenProjectGradePrompt` `gradeProject` `extractFilesJson` `selectImportantFiles` `normalizeRubricItems` `summarizeRubricItems` `gradeSubjectiveItems`

```js
// server/src/infrastructure/ai/deepseek/index.js（新建；相对路径写全 .js）
export { PROJECT_ROLE, OPEN_PROJECT_ROLE, buildProjectGradePrompt, buildOpenProjectGradePrompt } from '../../../domain/services/deepseek/prompts.js';
export { extractFilesJson } from '../../../domain/services/deepseek/json-extract.js';
export { clearConfigCache, getConfig, getProjectContextMode, getApiKey, getBaseUrl, getModel, getConcurrency } from './config.js';
export { gradeSubmission } from './submission-grading.js';
export { parseExamPaper, parseExamPaperStream } from './exam-parsing.js';
export { generateReferenceAnswer } from './reference-answer.js';
export { gradeProject } from './project-grading.js';
export { selectImportantFiles } from './file-selection.js';
export { normalizeRubricItems, summarizeRubricItems } from './rubric-items.js';
```

- **不导出**任何内部名（`loadConfig` / `CACHE_TTL` / `configCache` / `repairTruncatedJson` / `extractProjectGradeJson` / `buildSystemPrompt` / `PARSE_ROLE` / `PARSE_RULES` / `GEN_ROLE` / `GEN_RULES` / `ROLE` / `DEFAULT_CRITERIA` / `OUTPUT_FORMAT` / `PROJECT_SECURITY_CLAUSE` / `DEFAULT_PROJECT_CRITERIA` / `PROJECT_OUTPUT_SPEC` / `SELECT_ROLE` / `RUBRIC_ROLE` / `AUTOMATION_LEVELS`）→ 保持「导出面逐字不变」纪律。
- **不要**用 `export * from`（`scripts/gates/bind-check.mjs:22` 的已知盲区，step 1/3 已两次实证）。
- ⚠️ **`export { … } from` 对两个静态门禁不可见**（step 3 实测结论，本文件同样适用）：`check-layers.mjs:28` 的 `IMPORT_RE` 要求字面量 `import`/`require(`/`import(`；`cycle-check.mjs:42` 同理。→ T10 的 9 行 re-export **既不产生 check-layers 违规、也不产生 cycle 边**；**验证 re-export 路径只能靠 bind-check + C 的真 import 对拍**（§9 V2/V15）。
- **目录命名**：`domain/services/deepseek/` 与 `infrastructure/ai/deepseek/` 均为**新建目录**（`ls` 实测不存在；既有邻居是**文件** `infrastructure/ai/deepseek-gateway.js` 与 `infrastructure/ai/prompt-builder.js`）。**给 B 的硬要求：目录名必须是 `deepseek/`（不得写成 `deepseek-gateway/`，否则与既有文件混淆）。**

### 2.4 import 重排清单（唯一允许「不逐字」的 23 行）

**绑定完备性保证**：下表由「块 → 引用名」图求闭包后**逐块自动推导**（实测 41 块 / 0 个未解析绑定），只对**零消费死绑定**（`DEFAULT_MAX_SCORE`）做人工回填。

| 目标文件 | 新 import 行（按实测绑定逐条列出） |
|---|---|
| **T1** | **（无）** |
| **T2** | **（无）** |
| **T3** | `import logger from '../../../utils/logger.js';` / `import prisma from '../../../utils/prisma.js';` |
| **T4** | `import logger from '../../../utils/logger.js';` / `import { ABNORMAL_FEEDBACK, DEFAULT_MAX_SCORE } from '../../../constants.js';` ← **`DEFAULT_MAX_SCORE` 是零消费死绑定，必须照带**（§1.1-1） / `import { getBaseUrl, getApiKey, getModel } from './config.js';` / `import { DEFAULT_CRITERIA, ROLE, OUTPUT_FORMAT } from '../../../domain/services/deepseek/prompts.js';` |
| **T5** | `import logger from '../../../utils/logger.js';` / `import { getBaseUrl, getApiKey, getModel } from './config.js';` / `import { PARSE_ROLE, PARSE_RULES } from '../../../domain/services/deepseek/prompts.js';` |
| **T6** | `import logger from '../../../utils/logger.js';` / `import { getBaseUrl, getApiKey, getModel } from './config.js';` / `import { GEN_ROLE, GEN_RULES } from '../../../domain/services/deepseek/prompts.js';` |
| **T7** | `import logger from '../../../utils/logger.js';` / `import { getBaseUrl, getApiKey, getModel } from './config.js';` / `import { OPEN_PROJECT_ROLE, PROJECT_ROLE, buildOpenProjectGradePrompt, buildProjectGradePrompt } from '../../../domain/services/deepseek/prompts.js';` / `import { extractFilesJson, extractProjectGradeJson } from '../../../domain/services/deepseek/json-extract.js';` |
| **T8** | `import logger from '../../../utils/logger.js';` / `import { getBaseUrl, getApiKey, getModel } from './config.js';` / `import { SELECT_ROLE } from '../../../domain/services/deepseek/prompts.js';` / `import { extractFilesJson } from '../../../domain/services/deepseek/json-extract.js';` |
| **T9** | `import logger from '../../../utils/logger.js';` / `import { getBaseUrl, getApiKey, getModel } from './config.js';` / `import { AUTOMATION_LEVELS, RUBRIC_ROLE } from '../../../domain/services/deepseek/prompts.js';` |
| **T10** | 见 §2.3（9 条 re-export） |

**归属决议（三处跨文件引用，必须按此实现，否则会成环或漏绑定）**：
1. `extractProjectGradeJson`(:536) **只被 `gradeProject` 用**（`gradeSubjectiveItems` 用的是 `extractFilesJson`，见 :1028 注释）→ `json-extract.js` **同时导出 `extractFilesJson` 与 `extractProjectGradeJson`**（文件末尾 `export { … };` 块），但 **T10 `index.js` 只再导出前者**（保持导出面 21 名）。
2. `SELECT_ROLE`(:750) 只被 `selectImportantFiles`(:811) 用 → 它进 T1，**T8 必须 import 它**（这是 §2.4 里最易漏的一条）。
3. `normalizeRubricItems`(:866) 物理在 S6、被 `summarizeRubricItems`(:961) 调用 → **本方案留 T9**（`rubric-items.js`，文件末尾 export 块）。**若 Captain 认为「纯函数一律入 domain」**，则新增 `domain/services/deepseek/normalize.js`（搬 856 · 858-894），T9 的 import 改为 `from '../../../domain/services/deepseek/normalize.js'`，**其余全部不变**（落层预判同样 0 违规）。**

**边保持性**：今日的 **3 条相对出边**（`utils/logger.js`、`constants.js`、`utils/prisma.js`）**全部保留**，只换宿主；**不新增第三方依赖**、不新增反向边。新增 **12 条模块内相对边**（T4/T5/T6/T7/T8/T9→T3、T4/T5/T6/T7/T9→T1、T7/T8→T2）—— **全部向下或同层，无环**。cycle-check 相对边数预估 194 − 3 + 12 ≈ **203**（**不作判据**，仅供 C 参考；re-export 行不计边）。

---

## 3 层禁令合规预判（逐条对照 `server/scripts/check-layers.mjs`，**必须 0**）

**预判方法（诚实声明：A 是只读角色，我没有为了预判而落任何文件到仓库）**：我在内存里**从真实门禁脚本自身**提取 `EXTERNAL_BLACKLIST`（实测 **23** 项，`:20-25`）与 `NODE_IO` 正则（`:26`，逐字复刻），再**逐字复刻** `:40-83` 的 `layerOf` / `isExternal` / `targetLayer` / 四条分支判定，喂入 §2.4 的 **9 个真实文件路径 + 23 条 import 规格符**。

**装置自检（先证「预判器复现真门禁」）**：把**未修改的** `server/src/services/deepseek.js` 喂进同一判定式 → `layer = unlayered` → **违规 0 条**，与真门禁对同一文件的结论**一致**（真门禁只在 `layer ∈ 四层` 时判，unlayered 不受任何规则约束）。⇒ 预判器与真门禁同源。

| 规则（门禁原文） | 判定式（实测行号） | 预判 | 依据 |
|---|---|---|---|
| `domain-imports-external` | `:63-64`（domain 的任何非相对 import） | **0** | T1 / T2 **零 import**（连 node 内置都没有）—— 逐块实测「T1 的 18 个区间 / T2 的 5 个区间内无任何 import 语句」 |
| `domain-imports-outside` | `:65`（相对目标层 `!== 'domain'`，**含 unlayered**） | **0** | T1 / T2 无任何 import；不存在指向 `services/` / `utils/` / `infrastructure/` 的 domain 边 |
| `application-imports-external` | `:67-68` | **0（不适用）** | 本步**不新增任何 application 文件**（§2.1 已论证：5 个带 fetch 的段落必须 import infra → ② 否决） |
| `application-imports-infra` | `:69-71` | **0（不适用）** | 同上 |
| `infrastructure-imports-upper` | `:72-77`（非组合根禁止指向 `application`/`interface`） | **0** | T3–T10 的 23 条相对目标**逐条实测落点**：`domain/**`（合法向下，实测 `targetLayer=domain` ×11）、`infrastructure/ai/deepseek/*`（同层 ×6）、`utils/logger.js` + `utils/prisma.js` + `constants.js`（**`targetLayer=unlayered`**，既非 application 也非 interface → 不命中 ×13）。**无一条指向 application/interface** |
| 组合根豁免 | `:74` `rel.startsWith('infrastructure/bootstrap/')` | **不适用** | 本方案**不落 `infrastructure/bootstrap/`**（理由见 §3.1） |
| `interface-imports-infra` | `:78-81` | **0（不适用）** | 不新增 interface 文件；3 个 controller 导入方（`adminController` / `projectReviewController` / `teacherController`）**均为 unlayered** → 门禁对它们**不施加任何规则** |
| 外部包（infra 无限制） | `:72-77` 只判相对路径 | **0** | 全文件**无任何 npm 裸规格符**（`prisma` 走 `utils/prisma.js`，`logger` 走 `utils/logger.js`）。`fetch` / `AbortController` / `TextDecoder` / `setTimeout` 是**全局对象、非 import** → 门禁**看不见** |
| 未分层待迁移 | `:86` `layerOf() === 'unlayered'` | **45 → 44** | 删 `services/deepseek.js`（实测确实 unlayered，−1）；10 个新文件首段均为 `domain` / `infrastructure`（+0） |
| 门禁退出码 | `:140`（违规 >0 即 exit 1） | **0 → exit 0** | 上述合计 |

**实测汇总（我在内存中对 9 个候选文件 × 23 条规格符求值）**：**TOTAL VIOLATIONS = 0**。逐文件：`prompts.js 0` / `json-extract.js 0` / `config.js 0` / `submission-grading.js 0` / `exam-parsing.js 0` / `reference-answer.js 0` / `project-grading.js 0` / `file-selection.js 0` / `rubric-items.js 0`。

**四条反向陷阱（给 C 做门禁证伪用，仿 step 1 V4 / step 3 §3）**：
1. 把 T1（零 import 的 domain 文件）里加一条 `import logger from '../../../utils/logger.js';` → 立刻 `domain-imports-outside`（`unlayered !== 'domain'`）；
2. 把 T4 挪到 `application/ai/deepseek/` → 命中 `application-imports-infra`（它 import `./config.js`，目标层 = infrastructure）。**这条正是 §2.1 否决 plan §S3 的实证**；
3. 让 T4 反向 import 一个 `interface/` 文件 → `infrastructure-imports-upper`；
4. 把 T1 的 `prompts.js` 移到 infrastructure，**同时**让 `json-extract.js`（仍留 domain）去 import 它 → `domain-imports-outside`。（本方案**不会**出现这条，因为 json-extract 不 import prompts。）
（C 一律用 /tmp 副本做，**不得进仓库**。）

### 3.1 ★既有分层违规的处置判定：**落 `infrastructure/bootstrap/` 既不能消除违规、也无必要**

**任务书的问题原文**：「`deepseek.js` 直接 import prisma 读取 systemConfig —— 这本身就是一处既有分层违规。搬移后若把配置读取落到 `infrastructure/bootstrap/`，是否能同时（a）消除该违规，（b）不改变行为？」

**实测判定（四段论）**：

1. **它不是「门禁违规」，是「架构债」**。真门禁只在 `layer ∈ 四层` 时施加规则（`:46-56` 实测）；`deepseek.js` 首段是 `services` → `layerOf = unlayered` → **门禁对它的 3 条 import 一条都不判**。我把未修改的文件喂进复刻判定式：**违规 0**。⇒ 「消除该违规」这个前提**本身不成立** —— 没有任何门禁条目会因为「prisma 从 `services/` 移到 `infrastructure/`」而变化。真正的债是「`services/` 未分层」，而它由**删源文件**（未分层 45 → 44）消除，**与 prisma 落在哪一层无关**。
2. **bootstrap 与「不落 bootstrap」在门禁上等价**：`prisma`（`utils/prisma.js`）与 `logger`（`utils/logger.js`）都是 `unlayered`，在 infrastructure 分支下**永远合法**（`:75` 只拦 `application|interface`）。⇒ 落 `infrastructure/ai/deepseek/config.js` 与落 `infrastructure/bootstrap/ai-config.js` **都是 0 违规**。
3. **但落 bootstrap 有真实代价**：`infrastructure/ai/checker/llm.js:7` 与 `checker/generator.js:14` 已 import 本模块的名字；加上 T4/T5/T6/T7/T8/T9 六个兄弟文件 → **共 8 个模块要 import 配置读取**。若配置读取住在 `bootstrap/`（架构文档 §1.1 定义为「组合根：依赖装配、启动迁移、admin seed；**唯一允许依赖所有层的例外**」），这 8 条边就变成「infrastructure 的正常模块 → 组合根」—— **门禁合法、语义上是把组合根当共享库用**。属于「用豁免换结构」，**本方案不建议**。
4. **（b）行为不变性 —— 我的独立复核**：把 S1 的 34 行**逐字**搬进任一目标文件**不会改变**：读取时机（首次调用 `loadConfig` 时惰性读 DB）、缓存语义（`configCache` + `configCacheTime` + `CACHE_TTL = 60_000` 模块级单例）、回退顺序（DB → `envFallback`）。**唯一前提**：`configCache` / `configCacheTime` / `CACHE_TTL` **必须留在同一个模块**（跨模块拆散 = 缓存语义变更）。⇒ **逐字搬移下 (b) 自动成立。**

5. **若「消除违规」被重新定义为「改用已存在的 `SystemConfigRepository`」**（`infrastructure/persistence/system-config.repository.js`，实测 65 行，含 `loadAll/get/getApiKey/getBaseUrl/getModel/getConcurrency/set/clearCache`）→ **那会改行为，必须分开处理**。我逐条比对了语义差异：

| # | 差异点 | 现状 `deepseek.loadConfig`(:10-21) | `SystemConfigRepository.loadAll` | 行为影响 |
|---|---|---|---|---|
| D1 | DB 抛错时的日志 | **无** | `this.logger?.warn?.({err}, 'systemConfig 读取失败，使用缓存/空配置')` | **新增一条日志**（可观测性变更） |
| D2 | 缓存对象身份 | `configCache` 与返回引用同一对象，每次 DB 成功都新建 | 同 | 无 |
| D3 | 清缓存契约 | 模块级函数 `clearConfigCache()`（`adminController.js:395/470` 调用） | **实例方法** `clearCache()`，且新增 `set()` | **契约变更**：调用形态必须改 |
| D4 | 依赖注入 | 模块级单例 `prisma` | 构造注入 `{ prisma, logger, cacheTtlMs }` | **装配点变更**（需 `compose()` 或调用方持有实例） |
| D5 | 缓存单例性 | **全进程一份**（模块级） | **每实例一份** | ⚠️ 若 T4–T9 各自 `new SystemConfigRepository()` → **缓存变 8 份、TTL 各自计时** → 行为变更 |

**⇒ 处置判定（本步）**：**逐字搬移** S1 的 34 行到 `infrastructure/ai/deepseek/config.js`（保持模块级单例 + 同一份缓存），**不使用** `SystemConfigRepository`。该切换（含 D1–D5 五项 + `compose()` 装配单例 + 改 `adminController` 调用形态）**登记为后续独立专项**，**不在本步**。

---

## 4 调用方与导出面清单（全仓实测）

**实测方式**：递归扫 `server/src`（87 个 `.js`）+ `server/test`（68 个 `.test.js`）+ `server/scripts`（`.mjs`）+ `scripts`/`docs/pipeline/scripts`，用与门禁同源的 `IMPORT_RE` 提取规格符并解析目标；再对 `server/src` 求反向闭包。

### 4.1 直接 import 站点（**★ 19 个站点 / 20 处引用**）

**A. `server/src`（7 文件 8 处）**
| # | 文件:行（实测） | 今日写法（所取名字） | 拆分后 | 必须改？ |
|---|---|---|---|---|
| I1 | `server/src/services/gradingWorker.js:3` | `{ gradeSubmission, getConcurrency }` from `'./deepseek.js'` | `'../infrastructure/ai/deepseek/index.js'` | **是** |
| I2 | `server/src/services/projectGrading.js:29` | `{ gradeProject, gradeSubjectiveItems, selectImportantFiles, getProjectContextMode, summarizeRubricItems, getConcurrency }` from `'./deepseek.js'`（:22-29 多行 import，**6 名**） | `'../infrastructure/ai/deepseek/index.js'` | **是** |
| I3 | `server/src/services/trustJudgeGrader.js:29` | `{ gradeProject }` from `'./deepseek.js'` | `'../infrastructure/ai/deepseek/index.js'` | **是** |
| I4 | `server/src/controllers/adminController.js:395` | `{ clearConfigCache }` from `'../services/deepseek.js'`（**文件中部行内 import**） | `'../infrastructure/ai/deepseek/index.js'` | **是** |
| I5 | `server/src/controllers/projectReviewController.js:14` | `{ PROJECT_ROLE, OPEN_PROJECT_ROLE, buildProjectGradePrompt, buildOpenProjectGradePrompt }` | 同上路径 | **是** |
| I6 | `server/src/controllers/teacherController.js:11` | `{ parseExamPaper, parseExamPaperStream, generateReferenceAnswer }` | 同上路径 | **是** |
| I7 | `server/src/controllers/teacherController.js:204` | **动态** `await import('../services/deepseek.js')` → 取 `gradeProject` | 同上路径 | **是** |
| I8a | `server/src/infrastructure/ai/checker/llm.js:7` | `{ getBaseUrl, getApiKey, getModel }` from `'../../../services/deepseek.js'` | `'../deepseek/index.js'` | **是** |
| I8b | `server/src/infrastructure/ai/checker/generator.js:14` | `{ summarizeRubricItems }` from `'../../../services/deepseek.js'` | `'../deepseek/index.js'` | **是** |

**B. `server/test`（5 文件 6 处）**
| # | 文件:行（实测） | 今日写法 | 拆分后 | 风险 |
|---|---|---|---|---|
| I9 | `server/test/unit/deepseek.test.js:1` | `{ gradeSubmission, gradeProject }` | `'../../src/infrastructure/ai/deepseek/index.js'` | 低（2 名在面内） |
| I10 | `server/test/unit/open-project-prompt.test.js:16-22` | `{ PROJECT_ROLE, OPEN_PROJECT_ROLE, buildProjectGradePrompt, buildOpenProjectGradePrompt, gradeProject }` | 同上（相对深度相同） | 低（5 名在面内） |
| I11 | `server/test/unit/infrastructure/rubric-items.test.js:4` | `{ normalizeRubricItems }` | `'../../../src/infrastructure/ai/deepseek/index.js'` | 低 |
| I12 | `server/test/integration/r2-fixes.test.js:7` | `{ extractFilesJson }` | 同上 | 低 |
| I13 | `server/test/integration/open-project-flow.test.js:26-28` | `{ PROJECT_ROLE, OPEN_PROJECT_ROLE, buildOpenProjectGradePrompt }` | 同上 | 低 |
| **I14** | `server/test/unit/infrastructure/trustjudge-grader.test.js` **:18 与 :23 两处** | `:18` `jest.unstable_mockModule('../../../src/services/deepseek.js', () => ({ gradeProject: jest.fn() }))` + `:23` `await import('../../../src/services/deepseek.js')` | **两处都必须指到同一个新解析结果** `'../../../src/infrastructure/ai/deepseek/index.js'` | **⚠️ 最高（H1）→ 见 §4.3** |

**C. `server/scripts`（6 文件 7 处）**
| # | 文件:行（实测） | 今日写法 | 拆分后 |
|---|---|---|---|
| I15 | `full-selfconsistency-353.mjs:17` | `{ gradeProject }` | `'../src/infrastructure/ai/deepseek/index.js'` |
| I16 | `trustjudge-experiment.mjs:12` | `{ gradeProject }` | 同上 |
| I17 | `selfconsistency-experiment.mjs:14` | `{ gradeProject }` | 同上 |
| I18 | `cgroup-remaining-experiment.mjs:13` | `{ getConfig }` | 同上 |
| I19 | `fix-variance-experiment.mjs:19` | `{ getConfig }` | 同上 |
| I20a | `experiment-variance.mjs:156` | 动态 `import('../src/services/deepseek.js')` → `gradeProject` | 同上 |
| I20b | `experiment-variance.mjs:158` | 动态 `import('../src/services/deepseek.js')` → `getProjectContextMode` | 同上 |

**不改的引用（实测确认，避免 B 多做）**：
- `server/test/unit/infrastructure/experiment-variance.test.js:42` 的 `unstable_mockModule` 指向 **ruleExecutor**（step 1 已改完）→ **与本步无关**。
- `server/src/interface/README.md:8`、`docs/split/*`、`docs/plan/*`、`server/scripts/experiment-variance.mjs:8` 里的 `services/deepseek.js` 是**注释/文档文本**，**不改**（登记文档漂移）。
- `server/src/domain/services/checker/parsers.js:235`、`scoring.service.js:4`、`trustJudgeGrader.js:2/22/169`、`projectGrading.js:515/556/572`、`projectGrader.js:16` 的 `deepseek` 字样是**注释**，**不改**。
- `client/**` **零引用**（deepseek 是纯后端模块）。

### 4.2 导出名 → 消费方矩阵（21 名逐个实测）

| # | 导出名 | 定义行 | src 生产消费方 | test / script 消费方 | 说明 |
|---|---|---|---|---|---|
| 1 | `clearConfigCache` | :23 | `adminController.js:470`（经 I4） | **无** | 管理端改配置后清缓存 |
| 2 | `getConfig` | :28 | **无**（仅同文件内 :29/:35/:40-43） | `cgroup-remaining-experiment.mjs`、`fix-variance-experiment.mjs` | 面内保留，不得降级 |
| 3 | `getProjectContextMode` | :34 | `projectGrading.js:487`（经 I2） | `experiment-variance.mjs:158` | L0/L1 开关 |
| 4 | `getApiKey` | :40 | `checker/llm.js:7`（经 I8a） | 无 | — |
| 5 | `getBaseUrl` | :41 | `checker/llm.js:7` | 无 | — |
| 6 | `getModel` | :42 | `checker/llm.js:7` **（该处零消费，step 3 已登记）** | 无 | **面内保留** |
| 7 | `getConcurrency` | :43 | `gradingWorker.js:253/259`（经 I1）、`projectGrading.js:58`（经 I2） | 无 | 并发上限热生效 |
| 8 | `gradeSubmission` | :72 | `gradingWorker.js:79`（经 I1） | `deepseek.test.js`（14 例） | 编程题评分 |
| 9 | `parseExamPaper` | :238 | `teacherController.js:385`（经 I6） | **无 jest**（仅 e2e Playwright） | 试卷解析 |
| 10 | `parseExamPaperStream` | :303 | `teacherController.js:414`（经 I6） | **无 jest** | SSE 流式解析 |
| 11 | `generateReferenceAnswer` | :392 | `teacherController.js:1331`（经 I6） | **无 jest** | 参考答案生成 |
| 12 | `PROJECT_ROLE` | :465 | `projectReviewController.js:267/319`（经 I5） | `open-project-prompt`/`open-project-flow` | 安全注入防护语句承载 |
| 13 | `OPEN_PROJECT_ROLE` | :473 | 同上 | 同上 | 同上 |
| 14 | `buildProjectGradePrompt` | :597 | `projectReviewController.js:257/309`（经 I5） | `open-project-prompt`（8 例） | 预览 = 实评 |
| 15 | `buildOpenProjectGradePrompt` | :632 | `projectReviewController.js:251/303`（经 I5） | `open-project-prompt` + `open-project-flow` | — |
| 16 | `gradeProject` | :666 | `projectGrading.js:23`（经 I2）、`trustJudgeGrader.js:29`（经 I3）、`teacherController.js:204`（经 I7） | `deepseek.test.js`(6) + `open-project-prompt`(4) + `trustjudge-grader.test.js`（**mock**）+ 4 个 `.mjs` | **评分主链路** |
| 17 | `extractFilesJson` | :768 | **无**（仅同文件 :833 调用） | `r2-fixes.test.js`（8 case + 1） | 面内保留 |
| 18 | `selectImportantFiles` | :781 | `projectGrading.js:280`（经 I2） | **无** | L1 两阶段 |
| 19 | `normalizeRubricItems` | :866 | **无**（仅同文件 :961 调用） | `rubric-items.test.js`（9 例） | 面内保留 |
| 20 | `summarizeRubricItems` | :908 | `projectGrading.js:235`（经 I2）、`checker/generator.js:129`（经 I8b） | **无直接** | 评分标准固定分项 |
| 21 | `gradeSubjectiveItems` | :988 | `projectGrading.js:206`（经 I2） | **无** | 主观分项 |

→ **导出面等价 = 21 个名字，21/21 逐一有落点**；其中 **4 个**（#2 `getConfig`、#6 `getModel`（src 侧）、#17 `extractFilesJson`、#19 `normalizeRubricItems`）**在 src 侧零消费者**，但**全是面的一部分**——**不得顺手降级为私有**（3 个有测试/脚本消费者，#6 是 step 3 已登记的死绑定承载）。

### 4.3 ★jest 路径键控 mock 单点故障排查（step 1 的 H1 类）

**实测**：`grep -rn "unstable_mockModule" server/test server/src server/scripts` → **4 处**，其中**只有 1 处指向本模块**：

| # | 站点 | 内容 | 判定 |
|---|---|---|---|
| **M1 ★** | `server/test/unit/infrastructure/trustjudge-grader.test.js:18` | `jest.unstable_mockModule('../../../src/services/deepseek.js', () => ({ gradeProject: jest.fn() }))` | **单点故障（最高优先）** |
| M2 | `experiment-variance.test.js:42` | 指向 `src/infrastructure/rule/index.js` | 与本步无关（step 1 遗留） |
| M3 | `socket-notifier.test.js:9` | 指向 `src/socket.js` | 无关 |
| M4 | `assignment-q9-branches.test.js:30` | 指向 `src/utils/prisma.js` | 无关（但 C 的 DB 桩**与它同址**——见 §5.3②） |

**为什么是最高优先**：
1. 该套件**必须**用 `unstable_mockModule` —— 否则「sidecar 故障降级」用例会**真的走 legacy `gradeProject` 并真连外网**（`trustJudgeGrader.js:29` 静态 import → `deepseek.js` → 全局 `fetch` → `https://api.deepseek.com`）。
2. **mock 是路径键控的**：Jest 的 ESM 模块注册表按**解析后的模块标识**键控。`unstable_mockModule(p)` 注册的是「`p` 解析出来的那个模块」。拆分后 `trustJudgeGrader.js` 的 `import { gradeProject } from './deepseek.js'` 指向 `infrastructure/ai/deepseek/index.js`。**只要 I14 的 :18 本体也指到同一解析结果，mock 继续生效**；**只改一处则 mock 静默失效** —— jest 不报错，只会让降级用例真连网。
3. **另一层风险**：mock 工厂**只提供 `gradeProject` 一个名字**，`:23` 也只解构这一个 → 今天够用。**本步不扩工厂、不扩解构**（保持 1 名），否则会引入 `The requested module does not provide an export named …`。

**双向验证方法（C 必做，三条都要）**：
- **正向（mock 生效）**：跑 `trustjudge-grader.test.js` → `PASS`，且**无任何到 `api.deepseek.com` 的请求**（配 `DEEPSEEK_BASE_URL=http://127.0.0.1:9` + 网络桩断言 `offHostUrls = 0`）。
- **反向（证伪：mock 必须真在起作用）**：在 `/tmp` 副本里**故意只改 :18 不改 :23**（或反之），跑该套件 → **必须失败**（`fetch failed` / `ECONNREFUSED 127.0.0.1:9`）。若「只改一处」仍 PASS ⇒ **说明 mock 从未生效、该套件的降级用例一直在靠别的屏障**，此时必须立即回流 B 并重估该套件的保护力。
- **第三条（身份断言，最锋利）**：在 `/tmp` 探针里断言 `trustJudgeGrader` 实际持有的 `gradeProject` **就是** mock 的 `jest.fn()`（调用后 `mock.calls.length >= 1`）。step 3 的 V3「门面可达性」用的就是这一类身份断言。

**影响面（自建 import 图实测）**：`server/src` 中**传递依赖**本模块的共 **15 个文件** = 8 个直接导入方 + `app.js` + `worker.js` + `routes/{admin,student,teacher}.js` + `controllers/studentController.js` + `infrastructure/ai/checker/review.js`（经 generator → index）。`server/test` 中**传递加载**它的共 **13 个 `.test.js`**（5 个直接 + 8 个 integration 经 `helpers.js → app.js`）。→ **I1–I20 是全部需要改写的站点，一个不多**。

---

## 5 护航分析

### 5.1 测试覆盖矩阵（例数全部实测）

**直接套件 6 个**（`grep` + 逐文件读实测）：

| 套件 | 行数 | `it(` 实测 | 覆盖的段落 / 名字 |
|---|---|---|---|
| `server/test/unit/deepseek.test.js` | 340 | **14**（`gradeSubmission` 3 个 describe = 6+4+3 ｜ `gradeProject` 1 个 describe = 6） | S1（间接）、S4（`buildSystemPrompt` 经 system prompt 逐字断言 + `gradeProject` 解析族） |
| `server/test/unit/open-project-prompt.test.js` | 212 | **12** | S4（`PROJECT_ROLE`/`OPEN_PROJECT_ROLE`/`build*Prompt` **逐字节冻结基线** + `gradeProject` 的 mode 分支） |
| `server/test/unit/infrastructure/rubric-items.test.js` | 71 | **9** | S6（`normalizeRubricItems` 全分支） |
| `server/test/integration/r2-fixes.test.js`（:10-30 属本模块） | 111 | **9**（`it.each` 8 case + 1） | S4/S5（`extractFilesJson` 截断族） |
| `server/test/integration/open-project-flow.test.js`（:26-28 + :212-292 属本模块） | 320 | **8**（文件级） | S4（`gradeProject` 真链路，fetch 被打桩）+ S6（`summarizeRubricItems` 真跑，见 :80-84 注释） |
| `server/test/unit/infrastructure/trustjudge-grader.test.js` | 269 | **18** | S4（`gradeProject` **被打桩**，非真执行） |

**逐段落「真执行 vs 仅加载」判定（★核心）**：

| 段落 | jest 中**真执行**？ | 依据（实测） |
|---|---|---|
| **P0** 导入面 | **是**（模块顶层求值） | 任何 import 即执行 3 条 import |
| **S1** 配置读取 | **是（部分）** | `getBaseUrl/getApiKey/getModel` 被 8 个函数调用；`getConcurrency` 经 `projectGrading.refreshConcurrency`(:56-58) ← `enqueueProjectGrade`(:426) ← `studentController:745`/`projectReviewController:212` → `open-project-flow.test.js` 与 `project-regrade.test.js` **真跑到**；`loadConfig` 的 catch 分支在 DB 不可用时执行 |
| **S2** 试卷解析 | **否（0 例）** | `server/test` **无任何文件**调用 `parseExamPaper`/`parseExamPaperStream`（`grep` 唯一命中是 e2e Playwright spec + `deepseek-gateway.test.js` 测**另一个模块** `DeepSeekGateway.parsePaper`） |
| **S3** 参考答案生成 | **否（0 例）** | 同上；`teacherController:1331` 无 jest 覆盖 |
| **S4** 项目评分 | **是（部分）** | `gradeProject` 真执行（`deepseek.test.js` 6 + `open-project-prompt` 4 + `open-project-flow` 1）；prompt builder 全执行；`repairTruncatedJson`/`extractProjectGradeJson` 间接全执行 |
| **S5** L1 文件选择 | **部分** | `extractFilesJson` **真执行**（9 例）；`selectImportantFiles` **零执行**（`project_context_mode` 在测试库缺省 → `getProjectContextMode()` 返回 `'filter'` → `projectGrading.js:487` 走 L0 分支） |
| **S6** 固定分项 | **是（部分）** | `normalizeRubricItems` 9 例真执行；`summarizeRubricItems` 经 `open-project-flow` 的 `ensureRubricItems` 真执行（fetch 被打桩） |
| **S7** 主观分项 | **否（0 例）** | 前置是 `checkerRes.subjective.length > 0`（`projectGrading.js:201-203`），需题目 `checkerStatus='ready'` + 合法 `checkerScript`；**全仓无此类夹具** |

**⚠️ 「传递加载但未真正执行」判定（step 3 方法学的复现）**：
- `server/test` 传递加载本模块的 **13 个 `.test.js`** 中，**8 个 integration 套件**（经 `helpers.js → app.js → routes → controllers`）**一行本模块代码都没执行**：它们打的端点在 controller 的参数校验 / 归属守卫处短路（与 step 3 对 checkerService 的结论同构）。
- **`gradingWorker.js` 从不被任何 test 导入**（实测 `grep -rn "gradingWorker"` 在 `server/test` 只有 1 条**注释**命中，无 import；唯一 import 方是 `server/src/worker.js:2`，入口 `npm run worker`）→ **`gradeSubmission` 在 jest 里「有 14 例直接单测」，但那条生产链路（`worker.js → start() → scanSubmissions → gradeSubmission`）零执行**。
- ⇒ **与 step 3 的结论同阶**：本模块的**生产编排路径几乎无测试保护**；唯一行为证据只能是 §5.3 的**桩式 A/B 对拍 + 切片判等**。

### 5.2 零覆盖清单（**最高风险区，搬移前必须先建对拍**）

**A. 整函数零覆盖（5 个）**

| # | 零覆盖单元（源行） | 依据（实测） |
|---|---|---|
| **Z1** | `parseExamPaper`(:238-295) **全部 58 行** | `grep` 实测 `server/test` 无任何调用；只在 e2e Playwright spec（需真 LLM）与被替代的 `DeepSeekGateway.parsePaper` 测试中提及 |
| **Z2** | `parseExamPaperStream`(:303-373) **全部 71 行**（SSE 循环 :336-357、`res.body.getReader()`、`TextDecoder`、`[DONE]` 跳过、chunk 解析 catch） | 同上 |
| **Z3** | `generateReferenceAnswer`(:392-454) **全部 63 行** | 同上 |
| **Z4** | `selectImportantFiles`(:781-848) **全部 68 行**（含 429 :822-827、重试 :844、`parsed.files` 过滤 :838） | `project_context_mode` 缺省 → L1 永不被调用（见 §5.1） |
| **Z5** | `gradeSubjectiveItems`(:988-1051) **全部 64 行**（含 `extractFilesJson` 解析 :1029、名称对齐 :1032-1041、3 次重试 :1047） | 前置 `subjectiveList.length > 0` 无夹具可达 |

**B. 部分覆盖函数里的零覆盖分支（逐条）**

| # | 零覆盖分支（源行） | 依据（实测） |
|---|---|---|
| **Z6** | `loadConfig` **TTL 过期重读** :11（`Date.now() - configCacheTime < CACHE_TTL` 为 false 后重查 DB） | 测试全程 < 60s；无 `CACHE_TTL` 注入点。**搬移时该常量必须与两个缓存变量同址**（§3.1-4） |
| **Z7** | `loadConfig` **DB 抛错但已有缓存** :17-19（`if (!configCache)` 为 false 分支） | `deepseek.test.js` 无 DB 夹具；integration 用真库不抛错 |
| **Z8** | `clearConfigCache`(:23-26) 全函数 | 唯一生产调用点是 `adminController.js:470`，**无测试覆盖该端点** |
| **Z9** | `getProjectContextMode` **非法值 → `'filter'` 兜底** :37 | 无「DB 里写非法 mode」的夹具（默认值就是 `'filter'`） |
| **Z10** | `gradeSubmission` **429 分支的等待算术** :121-123 | `deepseek.test.js:220-242` 的 D9 确实命中 429 分支（mock 返回 `{status:429, ok:false}`，第 3 次 200），**但 `[5,15,30][attempt-1]` 的取值与被 `continue` 跳过的 `clearTimeout` 零断言** → 归为「执行到但零断言」 |
| **Z11** | `gradeSubmission` **非 429 非 2xx** :127-129（`throw new Error(`DeepSeek API 返回 ${res.status}`)`） | 无「HTTP 500」夹具（D9 是 429，D8/D10 是 200+坏 JSON / AbortError） |
| **Z12** | `gradeSubmission` **无 `choices`** :132（`data.choices?.[0]?.message?.content` 的空串路径） | 所有夹具都提供 `choices[0].message.content` |
| **Z13** | `gradeSubmission` **`parseInt(parsed.score)` 非法 → 0** :141 + `maxScore` 为 undefined 时的 clamp | 夹具 score 恒为数字；`maxScore` 恒传 |
| **Z14** | `gradeSubmission` **正则命中但 `JSON.parse` 抛错** :140 的 catch | 无此夹具 |
| **Z15** | `gradeSubmission` **非 AbortError 的 catch** :149 的 `logger.warn` | 无「fetch 抛 TypeError（ECONNREFUSED）」夹具 |
| **Z16** | `parseExamPaper` 的**全部重试路径** :283-291（超时 warn / 非超时 warn / `:289 if (attempt>=2) throw` / `:290 sleep 3000`）+ `:294` 兜底 throw | **Z1：整个函数零执行** |
| **Z17** | `parseExamPaperStream` 的**全部**（= Z2），含 :355 的坏 chunk `catch`、:342 的半行缓冲 | 同上 |
| **Z18** | `generateReferenceAnswer` 的**全部**（= Z3），含 :426-431 的 429 退避 `[5,15]`、:438 的 markdown 围栏剥离、:440 的 `code \|\| content` 兜底、:448 的 `attempt>=2 throw` | 同上 |
| **Z19** | `gradeProject` **429 等待重试** :699-704（`[10,30,60]`） | 全部夹具返回 200 → **该分支从未进入** |
| **Z20** | `gradeProject` **`fixedItems` 对齐** :722-734（`byName` 映射、名称匹配失败给 0、`maxScore` 截断、`comment.slice(0,60)`） | `open-project-prompt`/`deepseek.test.js` 都不传 `fixedItems`；`trustjudge-grader.test.js` 传了但 **`gradeProject` 被打桩** |
| **Z21** | `gradeProject` **解析失败诊断日志** :714-718（`finishReason/snippet`）+ `:739` 的 `logger.warn` | G5/G6 只触发 :719 的 throw，日志字段无断言 |
| **Z22** | `selectImportantFiles` 的**全部**（= Z4），含 :822-827 的 429、:834 的「非 JSON」throw、:838 的 `filter`+`slice(0,maxFiles)`、:847 的 `lastError` 兜底消息 | 同上 |
| **Z23** | `summarizeRubricItems` **围栏剥离重试** :957-960 + **429** :944-948 + **`max_tokens 1500`** 无断言 | `open-project-flow` 的 mock 返回**直接合法**的 `{"items":[…]}`；无围栏 / 无 429 夹具 |
| **Z24** | `summarizeRubricItems` **`normalizeRubricItems` 返回 null → throw '分项解析失败'** :962 | 同上（mock 恒返回合法 items） |
| **Z25** | `repairTruncatedJson` **闭引号尾部修剪** :508-510（tail 非结构字符时裁剪） | `r2-fixes` 的 8 个 case 里最接近的「mid 截断 reason」走的是**悬空开引号**支(:502-505) |
| **Z26** | `repairTruncatedJson` **尾余键名修剪** :515-516 的两种形态 | 8 个 case 未覆盖「尾部停在键名中间」 |
| **Z27** | `extractProjectGradeJson` **围栏剥离失败 → 宽容补全 → `repairTruncatedJson`** :547-558（G4 命中「截断补全」但**是否真经过 `repairTruncatedJson` 无断言**；:559 `return null` 零覆盖） | `deepseek.test.js` G4 只断言 `r.totalScore` |
| **Z28** | `normalizeRubricItems` **等比缩放循环** :886-890（末项被扣到 <1 时的借分支） | 我逐条核对两只夹具：`rubric-items.test.js:20-26`（`[{item:'ok',maxScore:0},{item:'good',maxScore:5}]`, maxScore=6）触发的是 :882 的**单点补偿**（1+5=6）；:31-35 的「40/40/40 → 100」也是 :882（120-100=20，末项 20 ≥ 1）。⇒ **缩放循环 = 零覆盖分支** |
| **Z29** | `getConcurrency` 的 `+v \|\| 16` 兜底（DB 存非数字） | 无「`ai_concurrency='abc'`」夹具（`system-config.repository.test.js:37-39` 测的是**另一个模块**） |
| **Z30** | 全部 8 处 `fetch` 的 **URL 拼接差异**（:99/:248/:309/:409 用模板串，:805 用模板串，:929/:1004 用 `BASE_URL + '/v1/chat/completions'`） | 两处写法不同但等价；**无断言锁定**（C 的 fetch 桩必须逐字记录 URL） |

→ **Z1–Z29** 这些行（约 :238-373、:392-454、:781-848、:988-1051、:120-153 的部分、:699-734、:886-890、:944-962 的多分支）**没有任何行为断言兜底**；搬移正确性**只能靠 §5.3 的 F 系列夹具 + 切片判等**，不能靠「本模块约 70 例全绿」自证。

### 5.3 C 的可执行行为对拍配方（改前 vs 改后，逐字节相等 · **禁止真外网**）

**装置纪律（5 条）**：
1. **两侧各自独立 node 进程**（禁止同进程同时 import 改前/改后 —— 本模块顶层会加载 pino + prisma 单例，且 step 1/3 已有原生模块污染先例）。
2. **夹具目录同一份被两侧复用**（否则 evidence 里的绝对路径会造成假阳性）。
3. **结果写文件，不写 stdout**（⚠️ 本模块**大量使用 `console.log/console.error`**：:243 :272 :274 :278 :279 :360 :364 :370 —— 共 **8 处**；必须设 `LOG_LEVEL=silent` **且**把探针结果写 `*.ndjson`）。
4. **四个桩必须在两侧完全相同地施加**（否则比的是桩不是代码）。
5. **`utils/logger.js` 会在 import 时 `mkdirSync(LOG_DIR)`**（`logger.js:39`，`LOG_DIR = <server>/logs`）→ **两侧副本必须各自独立**，探针结束时核对「仓库 `server/logs` 的 mtime 未变」。

**① 冻结改前源（不污染工作树）**
```bash
cd "<repo>"
ANCHOR=e2e70fdf0580ff97ae9e458760a6309c8982721f      # ← 本方案实测 HEAD；C 执行时应重新 rev-parse 并记录
rm -rf /tmp/splitD-before /tmp/splitD-after && mkdir -p /tmp/splitD-before
git archive "$ANCHOR" server | tar -x -C /tmp/splitD-before
ln -s "<repo>/node_modules" /tmp/splitD-before/node_modules
shasum -a 256 /tmp/splitD-before/server/src/services/deepseek.js   # 前置断言 == c13fceb9…
cp -R "<repo>/server" /tmp/splitD-after/server                     # 改后树（含 10 个新文件、无源文件）
ln -s "<repo>/node_modules" /tmp/splitD-after/node_modules
```

**② 四个桩（两侧逐字相同；这是「禁网 + 确定性」的技术保证）**

| 桩 | 接法 | 为什么必须 |
|---|---|---|
| **S-A 网络桩** | 探针**第一行**（早于任何 import）执行：`globalThis.fetch = (url, opts) => { const body = JSON.parse(opts && opts.body ? opts.body : '{}'); calls.push({ url: String(url), method: opts && opts.method, auth: opts && opts.headers && opts.headers.Authorization, hasSignal: !!(opts && opts.signal), body, queueLeft: queue.length }); return Promise.resolve(makeResp(queue.shift() || DEFAULT_OK)); };`；`makeResp` 返回含 `ok/status/text()/json()/body:{getReader()}` 的对象（**`body.getReader()` 是 `parseExamPaperStream`(:332) 专用**）。再叠一层保险：`process.env.DEEPSEEK_BASE_URL = 'http://127.0.0.1:9'`（不可达端口） | 全模块 **8 处 `fetch`**（:99 :248 :309 :409 :679 :805 :929 :1004）都打**全局 `fetch`**，URL 来自 `getBaseUrl()`（默认 `https://api.deepseek.com`）→ **不打桩就必然真连外网**。桩必须在 import 被测模块**之前**装好 |
| **S-B DB 桩** | 在两侧副本里用**同一份**内存替身覆盖 `server/src/utils/prisma.js`，实现 `systemConfig.findMany`（本模块**唯一**用到的 prisma 方法，实测 :13）+ `export const __db / __log / __reset`；`findMany` 每次调用记入 `__log` | 本模块**只有 1 处 `prisma.*`**（:13）；真库会让 `getBaseUrl/getApiKey/getModel/getConcurrency` 非确定（且需要 seed）。⚠️ **与 `assignment-q9-branches.test.js:30` 的既有 prisma 桩同址**（那是 jest 侧，不冲突，但 C **不得改仓库里的它**） |
| **S-C 时钟桩** | 冻结：`const F = 1760000000000; const RD = Date; globalThis.Date = class extends RD { constructor(...a){ super(...(a.length ? a : [F])); } static now(){ return F; } };` | `configCacheTime = Date.now()`(:16) 与 TTL 判定(:11) 会进调用日志 → 不冻结则**边界必然不等**。⚠️ **`setTimeout` 不受影响** → 429 退避（5s/15s/30s、10s/30s/60s）与失败重试（2s/3s）会**真等** |
| **S-D 退避加速桩** | `const RT = globalThis.setTimeout; globalThis.setTimeout = (fn, ms, ...a) => RT(fn, (typeof ms === 'number' && ms > 0 && ms <= 5000) ? 0 : ms, ...a);` | 不加速则：`gradeSubmission` 的 D9 类 429 用例单例 **20s**、`gradeProject` 的 429 用例单例 **100s**（10+30+60）→ 而 `jest.config.js` 的 `testTimeout` 是 **30000**。参照既有先例 `trustjudge-grader.test.js:113` 的 `TRUSTJUDGE_BACKOFF_MS=0,0`。⚠️ **两侧必须同一份包装** |

**③ 夹具与探针（C 自建，不复用 B 的脚本）**

| # | 夹具 / 探针 | 打靶的段落 / 零覆盖分支 |
|---|---|---|
| F01 | `Object.keys(mod).sort()` 导出面对拍（两个独立进程） | §2.3 的 **21 个名字** |
| F02 | `getConfig` 矩阵：DB 有值 / DB 无值走 ENV / DB 抛错无缓存 / DB 抛错有缓存 / `envFallback` 为 undefined | **S1 + Z7** |
| F03 | `getApiKey/getBaseUrl/getModel/getConcurrency` 的 DB 优先 × ENV 兜底 × 默认值 × `'abc'` 非数字 | **S1 + Z29** |
| F04 | **TTL 专项**：`configCacheTime` 置为「61 秒前」→ 断言 `findMany` **被调用第二次**；置为「30 秒前」→ 断言**不被调用**（两侧用同一 S-C 冻结时钟） | **Z6** |
| F05 | `clearConfigCache` → 再 `getConfig` → 断言 `findMany` 再次调用 | **Z8** |
| F06 | `getProjectContextMode` × {`'off'`,`'filter'`,`'two-stage'`,`'illegal'`,`''`,`null`} | **Z9** |
| F07 | `gradeSubmission` × {正常 / score 越界 150 / -5 / `score:'abc'` / `maxScore:undefined` / 无 `choices` / `content:''` / 无 JSON / 正则命中但 JSON 非法 / **HTTP 500** / HTTP 429×2 后成功 / AbortError / TypeError ECONNREFUSED}（**13 例**） | **S1 消费 + Z10–Z15 + Z30** |
| F08 | `buildSystemPrompt` 的常量注入：`scoringCriteria` 有/无 → 逐字节比 system prompt（经 fetch body 捕获） | S4 纯常量族 |
| F09 | `parseExamPaper` × {正常 / 429 / 500 带 errText 截断 200 字 / 无 JSON / **第一次抛错第二次成功（重试路径）** / 两次都抛（**Z16 的 :294**）}（**6 例**） | **Z1 / Z16** |
| F10 | `parseExamPaperStream` × {正常 SSE（多行 `data:` 分片 + `[DONE]` + 半行缓冲）/ 非 200 / 无 JSON / 坏 chunk（:355 catch）/ `onProgress` 回调序列}（**5 例**）→ S-A 桩必须提供 **`body.getReader()`** | **Z2 / Z17** |
| F11 | `generateReferenceAnswer` × {正常 / 429 后成功 / markdown 围栏剥离 / `code` 为空回退 `content` / 两次失败 throw}（**5 例**） | **Z3 / Z18** |
| F12 | `buildProjectGradePrompt` / `buildOpenProjectGradePrompt` × `fixedItems` {无, 有(2 项), 有(空数组), 非数组} × `scoringRubric` {空, 非空} × `title`/`description` {空, 非空} → **逐字节比字符串** | S4 纯构建族 + 「两种模式除标准答案段外逐字节一致」不变式 |
| F13 | `PROJECT_ROLE` / `OPEN_PROJECT_ROLE`：`【安全要求】` 段**逐字节相等**断言 + 与 `PROJECT_SECURITY_CLAUSE` 的拼接关系 | S4 安全语句（**注入防护，改一个字符即安全回归**） |
| F14 | `extractFilesJson`：把 `r2-fixes.test.js` 的 8 个 case **全部复刻** + `'no json here'` + `''` + `null` + 「尾部停在键名中间」(`'{"files":["a"],"rea'`) + 「闭引号后带残余」(`'{"files":["a"]}xyz'`) | S4/S5 + **Z25 / Z26** |
| F15 | `extractProjectGradeJson`（**私有，需 B 从 T2 内部导出为具名导出但不进 index**）：裸 JSON / 围栏 / 前导说明 / `finish_reason=length` 截断（3 种截断位置）/ 无 `totalScore` / `''` | **Z27** |
| F16 | `gradeProject` × {standard 正常 / open 正常 / **429 后成功** / 500 / 无 JSON / 截断补全 / **`fixedItems` 对齐**（名称匹配 / 不匹配给 0 / 超 maxScore 截断 / comment 截断 60）/ 连续 3 次失败抛错}（**10 例**） | **Z19 / Z20 / Z21** |
| F17 | `selectImportantFiles` × {正常 / 429 后成功 / 非 JSON / `files` 非数组 / `files` 含非字符串与空串过滤 / `maxFiles=2` 截断 / 两次失败抛错（含 `lastError` 文案）}（**7 例**） | **Z4 / Z22** |
| F18 | `normalizeRubricItems` × {正常 / 旧数据无 automation_level / 非法 level / 空名 / 非对象元素 / `maxScore:0` → 1 / 差额补偿 / **超出 → 等比缩放**（构造末项被扣到 <1：`[{a,1},{b,1},{c,1}]`, maxScore=1）/ 空数组 / null}（**10 例**） | **Z28** |
| F19 | `summarizeRubricItems` × {rubricText 为空（默认维度文案逐字）/ 正常 items / **围栏包裹** / 前导说明 / 429 / `items` 为空 → `'分项解析失败'` throw / 两次失败 throw}（**7 例**） | **Z23 / Z24** |
| F20 | `gradeSubjectiveItems` × {正常 3 项 / 名称不匹配给 0 / score 超 maxScore 截断 / comment 截断 / 无 items 键 throw / 429 后成功 / 两次失败 throw}（**7 例**） | **Z5** |
| F21 | **URL / body 契约快照**：把 8 处 fetch 的 `url` + `body`（`model/messages/temperature/max_tokens/stream`）**逐字段**写进输出 | **Z30** + 「搬移不得改 prompt / 参数」的硬证据 |
| F22 | 同一夹具连续执行 2 次（确定性） | 装置自检（见 ⑤） |

**④ 判等（只比 JSON 字节，四个维度都要比）**
```bash
cd /tmp/splitD-probe
PORT=0 LOG_LEVEL=silent DEEPSEEK_BASE_URL=http://127.0.0.1:9 node run.mjs <BEFORE_MODULE> <FIXTURES> out/before1.ndjson
PORT=0 LOG_LEVEL=silent DEEPSEEK_BASE_URL=http://127.0.0.1:9 node run.mjs <BEFORE_MODULE> <FIXTURES> out/before2.ndjson   # 装置自检
PORT=0 LOG_LEVEL=silent DEEPSEEK_BASE_URL=http://127.0.0.1:9 node run.mjs <AFTER_MODULE>  <FIXTURES> out/after1.ndjson
cmp out/before1.ndjson out/before2.ndjson   # 必须相等（否则装置不确定，判负）
cmp out/before1.ndjson out/after1.ndjson    # 唯一允许的差异：模块 basename 字段（建议输出里干脆不带该字段）
```
`<BEFORE_MODULE>` = `/tmp/splitD-before/server/src/services/deepseek.js`；`<AFTER_MODULE>` = `/tmp/splitD-after/server/src/infrastructure/ai/deepseek/index.js`。

每例的 JSON 必须含 **4 个维度**：
1. **返回值**（逐字段；抛错的例子记 `{ error: { name, message } }`）；
2. **终态 DB**（`__db` 快照 + `systemConfig.findMany` 调用次数）；
3. **有序调用日志**（`__log`：prisma 操作序列 + 每次 fetch 的 `{url, method, auth, hasSignal, body, queueLeft}`）；
4. **onProgress 回调序列**（**仅 `parseExamPaperStream`**：`{phase, contentLength}` 的有序数组）—— 只比返回值会漏掉「同一结果、不同推送时机」的漂移。

**输出规范化**：绝对路径（夹具根 / `os.tmpdir()` 随机名 / `logs` 路径）必须在序列化前替换成占位符（`<FIXTURE>` `<TMP>` `<LOGDIR>`）；时间戳已由 S-C 冻结；**栈帧里的 `file://…` → `file:<MODULE>`**（保留函数名与行号结构 —— 这是 step 3 唯一被允许的「模块 basename」类差异）。

**⑤ 装置自检 + 反证（缺任一条即判负）**
- **自检 1**：`before1` vs `before2` `cmp` 相等。
- **自检 2（防假绿，必须真的打到靶）**：
  - F07 的 429 例必须**恰好 3 次 fetch**（证明 429 分支真在跑）；
  - F09 的「第一次抛错第二次成功」必须**恰好 2 次 fetch**（证明重试路径真在跑 —— **Z16 唯一的证据**）；
  - F10 的 SSE 例必须命中至少 3 个 `data:` 分片 + 1 个 `[DONE]`（证明 `getReader` 路径真在跑 —— **Z2 唯一的证据**）；
  - F11 的围栏例返回值必须**不含三个反引号**（证明 :438 的剥离真在跑 —— **Z3 唯一的证据**）；
  - F17 必须命中 `'文件选择全部重试失败: '`（证明 **Z22 的兜底文案**真在跑）；
  - F20 必须命中 `'主观分项评分全部重试失败: '`（证明 **Z5** 真在跑）。
- **反证（必须有分辨力）**：在 `/tmp` 复制改后树，注入 **4 处变异** —— ① `prompts.js` 的 `OUTPUT_FORMAT` 里 `0 到满分之间` → `0 到满分以内`；② `config.js` 的 `CACHE_TTL = 60_000` → `30_000`；③ `json-extract.js` 的 `repairTruncatedJson` 里 `candidate.slice(0, lastQuote)` → `candidate.slice(0, lastQuote + 1)`；④ `project-grading.js` 的 `Math.round(Number(raw?.score) || 0)` → `Math.floor(...)`。确认 `cmp` **报差异**。做不到 = 恒等装置，判负。
- **惰性对照（防误报，仿 step 3 的 m0）**：把 `submission-grading.js` 里**零消费死绑定** `DEFAULT_MAX_SCORE` 改名为 `DEFAULT_MAX_SCORE_DEAD` → **必须 0 差异**。

**⑥ 逐字搬移的静态判等（覆盖 Z1/Z2/Z3/Z4/Z5 这类「配置开关未开」「零夹具」的分支）**
```bash
node /tmp/splitD-probe/slice-equal.mjs
# 期望：41 个顶层声明 + 3 条 import 行 = 44 块，每块 sha256 完全相同（= 0 处改写）
# 并做反向校验：10 个目标文件的每个非空白字节，只能是 banner / import 行 / export 行 / 源切片之一，剩余未匹配字节必须为 0
```
（可行性前提：§8 要求**不得在声明行加/改/删 `export`**，跨模块暴露一律用文件末尾 `export { … };` 块 → 44 块可与源文件逐字节相等。）

**⑦ 禁网的四重保证（给 C 写进报告的自证）**：① `globalThis.fetch` 在 import 前被替换，且替换体**不调用原始 fetch**（探针结束断言 `fetchStubIntact = true`）；② `DEEPSEEK_BASE_URL` 桩进 DB `systemConfig` = `http://127.0.0.1:9`（不可达端口）、`deepseek_api_key = sk-probe-key` —— **走 DB 而非 env**，因为 `getConfig` 是 DB 优先（:30）；③ 事后断言 **全部 fetch 记录的 URL 都是 `http://127.0.0.1:9/v1/chat/completions`**，`offHostUrls = 0`；④ 报告写明 `fetchCalls.length`（**0 次 = 有 case 没走到 LLM 路径，也要如实记录**）。

**⑧ 执行 / 未执行函数两张清单（C 必出，仿 step 3 §8.5）**：用 `NODE_V8_COVERAGE=/tmp/splitD-cov` 跑完整 F 系列（AFTER 侧），把覆盖率 JSON 的函数区间按目标文件行号与 §2.2 的切片块对齐 → 输出「23 个顶层函数 × 命中次数」与「未执行清单（含嵌套箭头/回调）」。**判据不是「全绿」，而是「每个未执行条目都能被某一块切片判等覆盖」**。

### 5.4 测试总量口径

- 最新实跑基线（`docs/split/test-round-08.log`，step 3 后）：**4 处 `Test Suites:`** = 65 + 1 + 1 + 1 = **68 套件**；**Tests: 974 + 17 + 61 + 21 = 1073**；`failed = 0`。
- ⚠️ 该基线**只作参考**：本步后若 B 不改测试，套件/用例数应当**逐字不变**（只改 import 路径）；**判据只有一条：4 处 `Test Suites:`、`failed = 0`**。**不得引用旧基线当判据**（constraints §3-17）。
- ⚠️ `unblock-g2.sh` 对已占用轮次 `exit 4` → C 必须先查 `docs/split/` 里的空序号。

---

## 6 风险分级

| # | 搬移单元 | 等级 | 理由（依赖复杂度 / 测试覆盖 / 评分链路 / 外部副作用） |
|---|---|---|---|
| R1 | **T1 `prompts.js`**（domain，198 行） | **中** | 0 import、纯字符串；**但它是「安全注入防护语句」的承载**（`PROJECT_SECURITY_CLAUSE` 拼进两个 role），且 `OUTPUT_FORMAT`/`PROJECT_OUTPUT_SPEC` 被 `open-project-prompt` 的**逐字节冻结基线**钉死 → 一个字符错位即红。**F12/F13 必须逐字节比** |
| R2 | **T2 `json-extract.js`**（domain，91 行） | **中** | 0 import、纯函数；`extractFilesJson` 有 9 例硬覆盖，但 `extractProjectGradeJson` **零直接覆盖（Z27）**；`repairTruncatedJson` 的 :508/:515 两支零覆盖（**Z25/Z26**） |
| R3 | **T3 `config.js`**（infra，34 行） | **中** | 唯一 **DB 读**出口；模块级单例缓存（**跨文件拆散即行为变更**）；`clearConfigCache` 零测试（**Z8**）、TTL 重读零测试（**Z6**）、DB 异常双分支部分覆盖（**Z7**） |
| R4 | **T4 `submission-grading.js`**（infra，98 行） | **中** | 14 例直接单测（本模块覆盖最好的段落）；但 **429 的等待算术零断言（Z10）**、非 429 非 2xx 零覆盖（**Z11**）、无 choices 零覆盖（**Z12**）、非法 score 零覆盖（**Z13**）；且**它唯一的生产调用者 `gradingWorker` 在 jest 里零加载** |
| R5 | **T5 `exam-parsing.js`**（infra，140 行） | **高** | **Z1 + Z2 全线零覆盖**（含整个 SSE 读流循环）；在**教师的试卷导入主链路**上（`teacherController:385/414`）；重试语义（2 次 / 120s 超时 / 3000ms 退避）**改一处即静默劣化**；唯一证据 = F09/F10 + 切片判等 |
| R6 | **T6 `reference-answer.js`**（infra，67 行） | **中高** | **Z3 全线零覆盖**；在教师「AI 生成参考答案」链路上；含 markdown 围栏剥离与 `code \|\| content` 兜底这类易错字符串处理 |
| R7 | **T7 `project-grading.js`**（infra，174 行） | **高** | **评分主链路**（`projectGrading → gradeProject`）+ **Z5 全部**（`gradeSubjectiveItems` 64 行零覆盖）+ **Z19/Z20**（429、`fixedItems` 对齐）+ `fixedItems` 对齐直接决定**分项分数**（模型名不匹配 → 0 分） |
| R8 | **T8 `file-selection.js`**（infra，79 行） | **中** | **Z4 全部零覆盖**；受 `project_context_mode` 开关控制 → **默认路径（filter）根本不执行** → 「零覆盖 + 零运行」双盲区；唯一证据 = F17 |
| R9 | **T9 `rubric-items.js`**（infra，114 行） | **中** | `normalizeRubricItems` 9 例覆盖良好，但 **Z28（等比缩放循环）零覆盖**；`summarizeRubricItems` 的围栏/429/null-items 三分支零覆盖（**Z23/Z24**）；在**评分一致性方案**的关键路径上（`ensureRubricItems` 写回 DB） |
| R10 | **T10 `index.js`**（infra，16 行） | **高（唯一硬失败点）** | 导出面少一名 → **19 个站点在 import 阶段整体爆炸**；9 行 re-export **对 check-layers / cycle-check 不可见** → **只有 bind-check + 真 import 能拦** |
| R11 | **删除 `services/deepseek.js`** | **高** | 一步影响 8 个 src 站点 + 6 个测试站点 + 7 个脚本站点 + 13 个传递加载套件 + `worker.js` 生产入口；回滚粒度必须 = 单提交 |
| R12 | **`gradingWorker.js` 的 import 改写（I1）** | **中** | 该文件**在 jest 里零加载** → 改错了**测试不会红**，只会在 `npm run worker` 时炸。→ **B 必须真 import 一次，C 必须独立复核**（§9 V18） |
| R13 | **`trustjudge-grader.test.js` 的 mock 路径（I14）** | **★最高（H1）** | 路径键控 mock 的单点故障（§4.3）：改漏一处 → **静默失效**（或红得让人误判为「拆分引入缺陷」） |
| R14 | 未分层 45 → 44 / GodFile 7 → 6 | **低** | 由构造保证；arch-metrics 实测 PASS 且**下降不会被判劣化** |

**顺序建议（给 B）**：T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → **先建 T10 并跑 bind-check** → 改 I1（**最容易漏测的 `gradingWorker` 优先**）→ I8a/I8b → I2/I3 → I4–I7 → I9–I13 → **I14（检查三遍）** → I15–I20 → **最后**删源文件。每段完成后立即 `node --check` **并真 import 一次**（`node --check` 不校验跨模块绑定 —— constraints §3-12）。

---

## 7 分批建议（每批可独立提交、各自过 DoD）

**先说结论**：本文件**可以一次拆到底**（直接站点 19 个、结构比 step 3 更规整、有 6 个直接套件）。但 **T5/T6/T7 三个段落的「零覆盖 + 在评分/教师主链路 + 有真实外部副作用」**与其余 7 个文件不在一个量级 → **推荐分 3 批**，中间态用**门面（facade）**：源文件保留为 `deepseek.js`，把已迁出的名字改为 `export { … } from …` 再导出 → **导出面对外逐字不变，19 个站点在前两批完全不用改，6 个套件原样跑**。

| 批 | 动作 | 触及文件 | 完成后指标 | 该批的自证判据 |
|---|---|---|---|---|
| **B1** | 建 `domain/services/deepseek/`，落 **T1 + T2**（纯声明，零 import）；源文件删去对应区间，末尾改为 2 行 re-export；源文件头补回被内部使用的常量 import | 2 新建 + 1 改 | 源文件 1051 → **≈760**（**< 800**）→ **GodFile 7 → 6**；未分层 **45**（不变）；违规 0 | ① 44 块切片判等（只校 T1/T2 的 23 块）② **F12/F13 逐字节 prompt/role** ③ F14/F15 解析族 ④ `node --check` + 真 import 一次 ⑤ `check-layers` 违规 0 |
| **B2** | 建 `infrastructure/ai/deepseek/`，落 **T3 + T4 + T8 + T9**（配置 + 编程题评分 + 文件选择 + 固定分项）；源文件继续 re-export 出已迁出的名字 | 5 新建（含目录）+ 1 改 | 源文件 ≈760 → **≈420**（**< 800**）；未分层 45（不变）；违规 0 | ① 切片判等补齐 4 个文件 ② **F02–F08 + F17–F19** 对拍 ③ 装置自检 + 变异反证（m1/m2）④ 门禁三连 ⑤ `git diff` 里 `deepseek.test.js`/`rubric-items.test.js`/`r2-fixes.test.js` **零改动** |
| **B3** | 落 **T5 + T6 + T7**（三个零覆盖高危段）；建 **T10 `index.js`**；**删除**源文件；改 **I1–I20** 全部 19 个站点（含 I14 双处） | 4 新建 + 19 改 + 1 删 | **未分层 45 → 44**；GodFile 6（不变）；违规 0；SCC 0 | ① **44/44 切片判等** + 反向「多余字节 = 0」② **F09–F11 + F16 + F20（Z1/Z2/Z3/Z5 专项）** ③ `Object.keys(idx).sort()` 与改前**逐字相等**（21 名）④ **I14 双向验证**（§4.3）⑤ bind-check 违规 0 + 每站点真 import ⑥ 全量回归 0 failed |

**每批的 DoD（复用 plan §5，server 侧 4 条 + 本方案补充）**：① `node server/scripts/check-layers.mjs` → 违规 0 且未分层不增；② `node scripts/gates/cycle-check.mjs` → SCC 0 / 自环 0；③ `node scripts/gates/hard-metrics.mjs` → 0/0/0（只扫 client，本步应逐字不变）；④ `node scripts/gates/bind-check.mjs` → 违规 0（**唯一能验 re-export 的门禁**）；⑤ `node scripts/gates/arch-metrics.mjs` → PASS；⑥ `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → 4 处 `Test Suites:`、**0 failed**、用例数如实记录；⑦ 行为对拍 byte-identical（§5.3）；⑧ 每批一个提交，消息含「拆分前 `file:line` 范围 + 落层目标 + 验证结果」。

**若 Captain 判定「一次拆到底」**：跳过门面，一次性建 10 个文件 + 删源 + 改 19 个站点，**单提交**；判据不变（§5.3 全量对拍 + 44 块切片判等 + 四门禁 + 全量回归）。本方案把 3 批列为**推荐**而非**必须**。

---

## 8 给 Agent B 的逐字搬移指令

**总则（不可协商）**
1. **只改 §2.2 的 10 个新建文件 + §4.1 的 I1–I20 站点**（分批执行时外加源文件的门面改写）。**不得**碰 `scripts/gates/*`、`server/scripts/*`、`server/test/` 的**断言**、`client/**`、`tests/`、`server/logs`、`server/package.json`、`docs/split/status.md`。
2. **搬移 = 按 §2.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角括号、`：`、`——`、`…`、**模板字面量里的真实换行**、空行位置）。
3. **不得在任何声明行加/改/删 `export`**（会破坏 §5.3⑥ 的切片判等）。源文件里本来就带 `export` 的 **21 个声明**照原样带；其余跨模块暴露（`loadConfig`/`repairTruncatedJson`/`extractProjectGradeJson`/`buildSystemPrompt`/全部常量）一律用**文件末尾单个 `export { … };` 块**。
4. 每个新文件顶部加 3–4 行 banner，**固定格式**（便于 C 机械核对）：
```
/**
 * <文件名> —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */
```
5. **不要写 smoke test 脚本、不要新增/修改任何测试文件**（C 的职责）。
6. **保留全部死代码 / 既有缺陷**：`DEFAULT_MAX_SCORE` 死绑定（→ T4 的 import 子句，逐字带）、`getModel` 在 `checker/llm.js` 的零消费状态（**不动**）、`extractProjectGradeJson` 的私有状态（**不许导出到 index**）、`repairTruncatedJson` 与 `checker/parsers.js` 的双实现（**不许合并**）、:478-488 的孤儿 JSDoc（**随 `gradeProject` 走，不许删也不许合并成一份**）。
7. **段落横幅（:159/:375/:456/:748/:851/:974）不搬**，各目标文件自带 banner；**空行不搬**。
8. 全部完成后**再**删 `server/src/services/deepseek.js`；**不要**用任何回滚类 git 命令（`checkout`/`restore` 一律禁止，改错就重编辑）。

**逐文件执行单**

| 步骤 | 动作 | 完成判据（自重） |
|---|---|---|
| B1 | 建 `domain/services/deepseek/`，写 **T1 `prompts.js`**（45-49, 51, 53, 55-58, 161, 163-231, 377, 378-386, 458-463, 465-466, 468-474, 476, 564-584, 586-618, 620-652, 750, 853, 855-856）+ banner + 末尾 `export { … };` 块（**19 个名字**：`DEFAULT_CRITERIA ROLE OUTPUT_FORMAT buildSystemPrompt PARSE_ROLE PARSE_RULES GEN_ROLE GEN_RULES PROJECT_SECURITY_CLAUSE PROJECT_ROLE OPEN_PROJECT_ROLE DEFAULT_PROJECT_CRITERIA PROJECT_OUTPUT_SPEC buildProjectGradePrompt buildOpenProjectGradePrompt SELECT_ROLE RUBRIC_ROLE AUTOMATION_LEVELS` —— **逐个核对，一个不漏**） | `node --check` 通过；**零 import** |
| B2 | 写 **T2 `json-extract.js`**（489-497, 498-527, 528-562, 763-767, 768-779）+ banner + `export { repairTruncatedJson, extractProjectGradeJson, extractFilesJson };` | 同上；**零 import**；**确认 `extractFilesJson` 声明行已带 `export`** |
| B3 | 建 `infrastructure/ai/deepseek/`，写 **T3 `config.js`**（5-6, 7, 8, 10-21, 23-26, 28-31, 33-38, 40, 41, 42, 43）+ banner + 2 条 import + 末尾 `export { clearConfigCache, getConfig, getProjectContextMode, getApiKey, getBaseUrl, getModel, getConcurrency };` | **`configCache`/`configCacheTime`/`CACHE_TTL` 必须与 `loadConfig` 同文件**（§3.1-4）；`grep -c "^import"` = 2 |
| B4 | 写 **T4 `submission-grading.js`**（60-71, 72-157）+ banner + 4 条 import（**含死绑定 `DEFAULT_MAX_SCORE`**）+ `export { buildSystemPrompt };` | `grep -c 'DEFAULT_MAX_SCORE' submission-grading.js` = **1**（仅 import 行） |
| B5 | 写 **T5 `exam-parsing.js`**（233-237, 238-295, 297-302, 303-373）+ banner + 3 条 import | 无 export 块（两个声明行已带 `export`）；**保留 8 处 `console.*` 逐字**（:243/:272/:274/:278/:279/:360/:364/:370） |
| B6 | 写 **T6 `reference-answer.js`**（388-391, 392-454）+ banner + 3 条 import | 无 export 块 |
| B7 | 写 **T7 `project-grading.js`**（**478-488**（孤儿 JSDoc）, 654-665, 666-746, 976-987, 988-1051）+ banner + 4 条 import | 两个声明行已带 `export`；**`gradeSubjectiveItems` 只 import `extractFilesJson`**（**不要**误带 `extractProjectGradeJson`） |
| B8 | 写 **T8 `file-selection.js`**（752-762, 781-848）+ banner + 4 条 import（**含 `SELECT_ROLE`**） | `grep -c 'SELECT_ROLE' file-selection.js` = 1（import 行） |
| B9 | 写 **T9 `rubric-items.js`**（858-865, 866-894, 896-907, 908-972）+ banner + 3 条 import（含 `RUBRIC_ROLE`、`AUTOMATION_LEVELS`） | 两个声明行已带 `export` |
| B10 | 写 **T10 `index.js`**（§2.3 的 9 条 re-export + 文件头注释） | `PORT=0 node -e "import('./server/src/infrastructure/ai/deepseek/index.js').then(m=>console.log(Object.keys(m).sort().join(' ')))"` → **恰好 21 个名字**（与 §2.3 逐字比对） |
| B11 | 改 **I1** `gradingWorker.js:3`（**最易漏测，优先**） | `PORT=0 node -e "import('./server/src/services/gradingWorker.js')"` 无 `does not provide an export named` |
| B12 | 改 **I8a/I8b**（`checker/llm.js:7`、`checker/generator.js:14`）→ `'../deepseek/index.js'` | 真 import 两个文件各一次 |
| B13 | 改 **I2/I3**（`projectGrading.js:29`、`trustJudgeGrader.js:29`） | 真 import 各一次 |
| B14 | 改 **I4–I7**（3 个 controller 的 4 处，含 `:204` 的动态 import） | 真 import `teacherController.js`（动态那处用 `node -e` 单独试） |
| B15 | 改 **I9–I13**（5 个测试站点，**仅路径，断言一字不动**） | `git diff --stat server/test` 只出现 5 行路径改动 |
| B16 | 改 **I14**（`trustjudge-grader.test.js` 的 **:18 与 :23 两处**） | **两处路径逐字相同**；`grep -c "services/deepseek" ` = **1**（只剩 :13 的注释） |
| B17 | 改 **I15–I20**（6 个 `.mjs` 脚本，含 2 处动态 import） | `grep -rn "services/deepseek.js" server/scripts` = **1**（只剩 :8 的注释） |
| B18 | **删除**源文件；跑 `node scripts/gates/bind-check.mjs` | `grep -rn "from '.*services/deepseek" server/src server/test server/scripts` = **0 命中**；⚠️ `grep -rn "services/deepseek.js" server/src` 预期 **10 命中，全部是 10 个新文件的 banner 溯源注释**（与 step 3 的 D3 同构，**不是漏改**）；bind-check 违规 0 |
| B19 | 写 `docs/split/deepseek-refactor.md`（源区间 → 目标文件:行 + 每块 sha256） | 41 声明 + 3 import 行 = 44 块全覆盖 |

**禁令（违反即回流）**：① 顺手修 `DEFAULT_MAX_SCORE` / `getModel` 死绑定 / :478-488 的孤儿 JSDoc / 双 `repairTruncatedJson` 之类「优化」；② 在同一提交里改任何中文文案、正则、阈值、`max_tokens`、`temperature`；③ 改 `server/test/` 的断言（只允许改路径）；④ 改门禁脚本以「适配」新路径；⑤ 用 `git checkout/restore` 回滚；⑥ 把 `export { … } from` 换成 `export * from`；⑦ **把 `extractProjectGradeJson` 加进 index.js**（会破坏导出面等价）。

---

## 9 给 Agent C 的验证清单

C 为只读 + 自建对拍（**不复用 B 的脚本**），临时产物一律放 `/tmp`，探针一律 `PORT=0`。

| # | 验证项 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| V1 | 版本锚点 | `git rev-parse HEAD`；`shasum -a 256` 冻结副本 | `deepseek.js` == `c13fceb9…`（若已删，用 `git show e2e70fd:server/src/services/deepseek.js` 重建） |
| V2 | **导出面（真 import，两个进程）** | `PORT=0 node --input-type=module -e "const m=await import('<module>');console.log(JSON.stringify(Object.keys(m).sort()))"`，改前/改后各一次 | 两侧**逐字相等**，恰好 21 名（清单见 §2.3） |
| V3 | **★I14 mock 双向验证（H1）** | ① 跑 `trustjudge-grader.test.js` → 断言 PASS 且 `offHostUrls = 0`；② 在 /tmp 副本里**只改 :18 不改 :23**（或反之）→ **必须失败**；③ 身份断言：`gradeProject.mock.calls.length >= 1` | ① PASS ② **必须红**（不红 = mock 从未生效，立即回流）③ ≥1 |
| V4 | **逐字搬移（静态）** | §5.3⑥ `slice-equal.mjs`：41 声明 + 3 import 行 = **44 块** sha256 | **0 块不等**；反向「未匹配非空白字节 = 0」（**唯一能覆盖 Z1–Z5 等零覆盖分支的判据**） |
| V5 | 声明行 export 审计 | 目标侧声明行 `export` 计数 = **21**，名字集与源**完全相同**；`export *` 次数 = **0**；`export { … } from` 行数 = **9** | 逐字相等 |
| V6 | **行为对拍（动态）** | §5.3③④：F01–F22，两个独立进程，`cmp` **四维**（返回值 + 终态 DB + 有序调用日志 + onProgress 序列） | **byte-identical**；先过「before 跑两次相等」 |
| V7 | 装置自检 | F07 的 429 例 = **3 次 fetch**；F09 重试例 = **2 次 fetch**；F10 SSE 例 ≥3 分片 + 1 个 `[DONE]`；F11 围栏例返回值无三反引号；F17 命中 `'文件选择全部重试失败: '`；F20 命中 `'主观分项评分全部重试失败: '` | 六项全中（否则装置没打到靶） |
| V8 | **变异反证** | §5.3⑤ 注入 4 处变异（`0 到满分之间`→`以内` / `60_000`→`30_000` / `slice(0, lastQuote)`→`+1` / `Math.round`→`floor`）+ **惰性对照**（死绑定改名） | 4/4 **必须报差异**；惰性对照 **0 差异**（证明装置有分辨力且不误报） |
| V9 | **禁网自证** | 探针断言 `fetchStubIntact = true`、全部 fetch 的 url 都是 `http://127.0.0.1:9/…`；报告写明 `fetchCalls.length`、`DEEPSEEK_BASE_URL`、Authorization 形态 | **0 次真实外网**；未打桩的 case 如实列出 |
| V10 | **零覆盖专项** | Z1–Z5 的 F09/F10/F11/F17/F20 + Z19/Z20 的 F16 + Z25–Z28 的 F14/F15/F18 + Z6–Z9 的 F02/F04/F05/F06 | 每例 evidence 逐条对照改前**逐字节相同**（尤其 `'文件选择全部重试失败: '`、`'主观分项评分全部重试失败: '`、`'分项解析失败'`、`'返回格式不包含有效的 JSON'`） |
| V11 | **执行 / 未执行两张清单** | §5.3⑧ `NODE_V8_COVERAGE` 跑全套 F 系列（AFTER 侧） | 23 个顶层函数逐个给命中次数；**未执行条目逐条给源码行 + 能被哪一块切片覆盖** |
| V12 | 分层门禁 | `node server/scripts/check-layers.mjs` | 违规 **0**；未分层 **44**（≤45）；**并做门禁证伪**（§3 的四条反向陷阱，/tmp 副本）确认门禁有牙 |
| V13 | 架构门禁 | `node scripts/gates/arch-metrics.mjs` | PASS；unmigrated ≤45；**GodFile 7 → 6**；观察带如实记录（预期 17 → 17） |
| V14 | 循环依赖 | `node scripts/gates/cycle-check.mjs` | **SCC = 0**、自环 0（边数会变属预期，我的预判 ≈203 **不作判据**；注意 re-export 行**不计边**） |
| V15 | 绑定门禁 | `node scripts/gates/bind-check.mjs` | 违规 **0**；`unresolved`/`external` 与改前基线**一致**（**唯一能验 index.js 的 9 行 re-export 的门禁**） |
| V16 | 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0（只扫 `client/src`，本步应**逐字不变**） |
| V17 | 全量回归 | `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`（**先查空序号**，脚本对已占用序号 `exit 4`） | 日志 **4 处 `Test Suites:`**、**`failed = 0`**；套件/用例数如实记录（**不得引用旧基线**） |
| V18 | **19 个站点逐个真 import** | 对 I1–I20 的**每一处**跑一次 `PORT=0 node -e "import('<abs path>')"`（**`gradingWorker.js`（I1）与 `teacherController.js:204` 的动态 import 必须单独做** —— 它们在 jest 里零加载，测试红不了） | 全部无 `does not provide an export named` / `Cannot find module` |
| V19 | 越界自查 | `git status --porcelain` + `find . -newermt '<B 开始时刻>' -not -path './node_modules/*'` | 只有计划内的 10 新 + 20 改（+1 删 + B 的报告）；`client/dist` / `tests/` / `scripts/gates/` / `server/logs` 的 mtime 无变化 |
| V20 | 回滚粒度 | `git show --stat HEAD` | 单提交，消息含「拆分前 file:line 范围 + 落层目标 + 验证结果」 |

**判定纪律**：V4 / V6 / V8 是本步核心判据，**V3 是最易被忽略的硬失败点**（其余是既定门禁）。任一不符 → 回流 B，**不得**改测试或改门禁迁就实现。

---

## 10 局限声明

1. **未真落文件、未真跑对拍**：§3 的合规预判 = 「用真实门禁脚本自身的常量（`EXTERNAL_BLACKLIST` 23 项 + `NODE_IO` 正则）+ 逐字复刻的判定式，在内存中对 9 个候选文件 × 23 条 import 规格符求值」，**不等于** `node server/scripts/check-layers.mjs` 对真实新文件的实跑（我已做「未修改文件 → 违规 0」的自检证明预判器与真门禁同源，但**真跑必须由 C 完成**，V12）。§5.3 的夹具矩阵是**配方**，**未执行**。
2. **未跑 jest / build / 服务**（A 角色禁令）：§5.1 的覆盖判定是**静态 + 人读**（`grep` 规格符 + 逐文件读 + 断言字符串 + 分支可达性推演），**不是覆盖率工具读数**；§5.2 的零覆盖分支我逐条给了依据，但**未做运行时探针验证**（V11 是补位）。
3. **「8 个 integration 套件未执行本模块代码」是论证而非证明**：结论建立在「这些套件的端点在 controller 的参数校验/归属守卫处短路」的**逐行阅读** + 「`gradingWorker` 只被 `worker.js` import」的**实测 `grep`** 上。若 C 发现某个套件真跑到 service（例如 `open-project-flow` 的 `ensureRubricItems → summarizeRubricItems` 确实真跑 —— **这一条我已计入「真执行」**），**以 C 的实测为准并回流本方案**。
4. **`gradeSubjectiveItems` 零覆盖是「前置不可达」的推断**：依据是 `projectGrading.js:201-203` 的 `subjectiveList.length > 0` 门槛 + 全仓无 `checkerStatus='ready'` 夹具。**未做数据侧取证**（不知道测试库里是否真有 ready + checkerScript 的题）→ 属**未证事项**；C 若有 DB 访问，可直接查 `questions.checkerStatus` 分布来证实/证伪。
5. **行数预估有 ±5% 误差**：§2.2 的预估 = 搬移行数 + 我对 banner / import / export 块的估计。判据是 **< 800**（最大 202，远未逼近），不是精确值。B1 之后的中间态行数（≈760 / ≈420）是**推算**，真值以 B 的 `wc -l` 为准（只要 B1 后 < 800 即达成 **GodFile 7 → 6**）。
6. **未审计依赖邻居的层归属**：`services/{projectGrading,projectContextBuilder,ruleMutator,factExtractor,gradingWorker,trustJudgeGrader}.js`、`utils/{prisma,logger}.js`、`constants.js` 仍是 **unlayered**，T3–T9 会持续依赖它们。这是**显式登记的既有技术债**（step 3 §12-7 同款）：若后续步骤迁它们的层，本方案的相对路径需同步调整（**不是本步缺陷**）。
7. **`SystemConfigRepository` 的切换未做**（§3.1-5 的 D1–D5）：需要组合根装配单例 + 改 `adminController` 的调用形态（`clearConfigCache()` → 实例方法）+ 单独过 DoD。**本步只登记不实施**。
8. **T1 的层选择与 `normalizeRubricItems` 的归属留有备选**（§2.1 / §2.4-3）：两处备选**都不改变落层预判结论（仍 0 违规）、导出面、对拍配方、未分层 44**，只改相对路径与文件数（10 → 11）。
9. **未做数据侧取证**：`project_context_mode` 在**生产库**的取值分布未查 → 「L1 两阶段是否在线上真的启用」**未证**。若线上是 `filter`，则 `selectImportantFiles` 是**「零覆盖 + 零运行」**的双盲区（风险 R8 的等级可能被低估）。
10. **19 个站点的清单是「正则 + 解析」实测**：我用与门禁同源的 `IMPORT_RE` 扫描 + `path.resolve` 解析目标，**未做 AST 级校验**（例如路径拼接出来的动态 import 不会被发现）。缓解：已做 `grep -rn "deepseek"` 的裸文本扫描（I7/I20a/I20b 就是这样被发现的）。
11. **`docs/split/status.md` 的基线数字已过时**（写的是 46/8/18，实测 45/7/17）：本方案**不改状态文件**（越界），仅在此登记，请 Captain 在提交本步时一并刷新。
