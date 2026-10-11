# reviewController 拆分方案（接缝与护航分析）

- **step**: 8 ｜ **phase**: A（接缝与护航分析）｜ **日期**: 2026-10-11 ｜ **技能**: code-analyzer
- **目标文件**: `server/src/controllers/reviewController.js`（**965 行**，`wc -l` 口径）｜ **24 个顶层函数 + 1 个嵌套函数**（`scoreItem`）｜ **17 个导出名**
- **方案来源**: `docs/plan/2026-10-11-godfile-split-plan.md` §5（DoD，含新增两道 lint 判据）/ §4-S5 / §8 / §8.1 ｜ server 侧范本 `docs/split/checkerService-plan.md`、`docs/split/deepseek-plan.md` ｜ 验证范本 `docs/split/checkerService-verify.md` ｜ 状态机 `docs/split/status.md`
- **落层唯一依据**: `docs/refactor-architecture.md` §1.1 ｜ **判定规则（权威）**: `server/scripts/check-layers.mjs`（实测 139 行）
- **版本锚点（本方案全部实测数据的取值时刻）**:
  - HEAD = `1b713b83746e1238a9a72ef38831bc877dc02560`，分支 `master`
  - 目标文件：bytes = **43827**，sha256 = `62ec56ed4c647687a09bcd2329c5ceeca1968610e9495a7fa1a31d4fb1481add`，`wc -l` = **965**（`split('\n').length` = 966，末尾换行多算一格；本方案一律用 965，与 `arch-metrics.mjs:67` 同口径）
  - `git status --porcelain -- server/src/controllers/reviewController.js` = **空**（无未提交改动）
  - **门禁实测（本轮由我执行，全部静态只读）**：
    | 门禁 | 命令 | 实测读数 | 退出码 |
    |---|---|---|---|
    | 分层守卫 | `node server/scripts/check-layers.mjs`（**未加** `--save-baseline`） | 文件 **96** / 违规 **0** / 未分层待迁移 **44** | 0 |
    | 架构门禁 | `node scripts/gates/arch-metrics.mjs` | layerViolations 0/0、unmigrated 44/44、godfileOver800 **3/3**、观察带 14/14；GodFile 名单 = `teacherController.js (1338)` / `Doc.vue (1106)` / `reviewController.js (965)` | 0（PASS） |
    | 循环依赖 | `node scripts/gates/cycle-check.mjs` | 96 文件 / **214** 条相对导入边 / **SCC 0** / 自环 0 | 0 |
    | 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0（**只扫 client/src**，本步应逐字不变） | 0 |
    | 绑定门禁 | `node scripts/gates/bind-check.mjs` | BINDING VIOLATIONS **0**；unresolved 4 / external 1（仅登记，见 `:21-28` 已知边界） | 0 |
    | **lint 判据 (a)** | `./node_modules/.bin/eslint client/src server/src`（JSON 汇总；**不用 npx 以免触网**） | 195 文件、**error 0**、**warn 59**（= DoD 上限，**零余量**）；本文件占 **1** 条 | 0 |
    | **lint 判据 (b)** | `node scripts/gates/lint-check.mjs` | 扫描 195 文件 / 33304 行；基线 31 → 当前 **31**、新增 **0**；本文件占 **1** 条 | 0 |

---

## 0 约束遵守声明

| 约束 | 遵守方式 |
|---|---|
| 纯只读 | 本方案是**本轮唯一写入**；未创建/修改/删除仓库内任何其它文件。全部辅助脚本落在 `/tmp`（`/tmp/rc-ast.cjs`、`/tmp/rc-imports.cjs`、`/tmp/eslint-rc-baseline.json`） |
| 禁止 git 写操作 | 只执行 `rev-parse` / `status --porcelain`；无 clean / stash / checkout / reset / restore，无任何提交 |
| 不跑 jest / build / 服务 | 未执行 jest、未 build、未启任何服务；未触碰 :5173 / :3000 / `client/dist` / `tests/` |
| 禁止联网 | 未调用 web_search / web_fetch；未发任何 LLM 请求；eslint 走仓库内 `./node_modules/.bin/eslint`（**刻意不用 `npx`**，避免其联网解析） |
| 行号与计数自测 | 全部行号 / 行数 / 函数数 / 导出面 / 调用方 / 测试覆盖 / 门禁读数**由我在本轮实测**（方法与原始输出随表给出）；**未照抄任务书**（任务书给的 `:763`/`:890` 两处经我复核**恰好正确**，其余段落边界全部由 acorn AST 现测） |
| 门禁执行的写入性 | 上表 7 条命令全部**零仓库写入**（已逐条核读源码：`check-layers.mjs:126-129` 仅在 `--save-baseline` 时写；`lint-check.mjs:53,528-531` 仅在 `--update-baseline` 时写；`bind-check.mjs:168` 只写 `os.tmpdir()`） |
| 不改对外契约 | 全部搬移单元 = 源码切片位移 + import 重排 + 文件末尾 `export { … };` 块；**导出面逐字保持今日的 17 个名字**，16 条路由的 方法/路径/中间件/状态码/body 结构逐字不变 |

---

## 1 段落接缝图谱（逐段实测）

### 1.1 实测方法与自证

- **行号**：`acorn.parse(src, { ecmaVersion:'latest', sourceType:'module', locations:true })` 递归遍历 AST，取每个 `FunctionDeclaration` / `ArrowFunctionExpression` 的 `loc.start.line`–`loc.end.line`，并沿 `ExportNamedDeclaration` 判定导出。脚本 `/tmp/rc-ast.cjs`（仓库外）。
- **输出自证**：`TOTAL_LINES 966`（= `split('\n')`.length）、**TOPLEVEL 24 / NESTED 1**（嵌套 = `scoreItem`，深度 7）。**24 个顶层函数 —— 与任务书一致**。
- **导出面自证**：`^export (async )?function|^export const` 逐行扫 + AST `ExportNamedDeclaration` 双算，**17 个名字**，无 `export {}` 块、无 `export default`、无 `export *`。**16 个是路由 handler，1 个是共享助手**（`isStudentVisibleToTeacher`）。
- **依赖自证**：`/tmp/rc-imports.cjs`（自建 strip-comments/strings 扫描器）逐条统计每个 import 绑定在剥离注释与字符串后的**引用次数**，实测 **11 条 import、17 个绑定、0 个零引用的死绑定**（与 step 3 的 `getModel` 情形不同）。
- **IO 判定**：`fs`/`path` 绑定引用次数分别为 **3 / 2**，全部集中在 `:769-780` 的 `readStandardTree`。

### 1.2 段落表（行号 = acorn 实测值，含紧邻 JSDoc / 行内注释）

| # | 段落（逻辑单元） | 起止行（实测） | 行数 | 导出？ | 依赖的本文件符号 | 依赖的外部包 / 其它文件 | 纯函数？ | 含 IO？ |
|---|---|---|---|---|---|---|---|---|
| **S0** | 文件头 · import 面 | 1–11 | 11 | — | — | `fs` `path` `../utils/prisma.js` `../utils/logger.js` `../constants.js` `./teamController.js` `../utils/projectView.js` `../utils/projectPaths.js` `../utils/projectFiles.js` `../infrastructure/ai/prompt-builder.js`（**2 外部 + 8 相对**） | — | — |
| **S1** | `buildFilter`（/teacher/submissions 的唯一入口筛选器） | 13–37 | 25 | 否 | — | `prisma`(×1) `getVisibleClassIds`(×1) | 否 | **DB 读** |
| **S2** | `enrichWithSchool` | 39–52 | 14 | 否 | — | `prisma`(×1) | 否 | **DB 读** |
| **S3** | `isStudentVisibleToTeacher`（**t4 最小判定单元，跨文件共享**） | 54–73 | 20 | **是** | — | `prisma`(×1) `getVisibleClassIds`(×1) | 否 | **DB 读** |
| **S4** | `loadVisibleSubmission`（按 id 直取入口的统一归属校验） | 75–107 | 33 | 否 | S3 | `prisma`(×1) | 否 | **DB 读** |
| **S5** | `sendScopeError` | 109–112 | 4 | 否 | — | — | **是**（只读 `guard.status/body` + `res`） | 否 |
| **S6** | `filterRejectedSubmissionIds`（批量归属校验） | 114–143 | 30 | 否 | — | `prisma`(×2) `getVisibleClassIds`(×1) | 否 | **DB 读** |
| **S7** | `resolveVisibleClassScope`（t6 班级维度入口统一落点） | 145–168 | 24 | 否 | — | `getVisibleClassIds`(×1) | 否 | 间接 DB 读 |
| **S8** | `getSubmissions` | 170–196 | 27 | **是** | S1 S2 | `prisma`(×3) `logger`(×1) | 否 | DB 读 |
| **S9** | `getReviewQuestions` | 198–221 | 24 | **是** | S7 | `prisma`(×3) `logger`(×1) | 否 | DB 读 |
| **S10** | `getSubmissionDetail` | 223–264 | 42 | **是** | S4 S5 | `prisma`(×3) `logger`(×1) | 否 | DB 读 |
| **S11** | `regradeSubmission` | 266–281 | 16 | **是** | S4 S5 | `logger`(×1) + **`req.app.locals.reviewUseCases`** | 否 | 经用例层写 |
| **S12** | `updateScore` | 283–301 | 19 | **是** | S4 S5 | `logger`(×1) + **`req.app.locals.reviewUseCases`** | 否 | 经用例层写 |
| **S13** | `reviewSubmission` | 303–316 | 14 | **是** | S4 S5 | `logger`(×1) + **`req.app.locals.reviewUseCases`** | 否 | 经用例层写 |
| **S14** | `batchReview`（含 **死变量 `count`**，见 §1.4） | 318–372 | 55 | **是** | — | `prisma`(×4) `logger`(×1) `getVisibleClassIds`(×1) | 否 | **DB 事务写** |
| **S15** | `batchPublish` | 374–420 | 47 | **是** | — | `prisma`(×4) `logger`(×1) `getVisibleClassIds`(×1) | 否 | DB 写 |
| **S16** | `publishScores` | 422–444 | 23 | **是** | S6 | `prisma`(×1) `logger`(×1) | 否 | DB 写 |
| **S17** | `getReviewSummary` | 446–516 | 71 | **是** | — | `prisma`(×3) `logger`(×1) `getVisibleClassIds`(×1) `ABNORMAL_FEEDBACK`(×1) | 否 | DB 读（**N+1 循环查询**） |
| **S18** | `getReviewByClass` | 518–606 | 89 | **是** | S7 | `prisma`(×2) `logger`(×1) `ABNORMAL_FEEDBACK`(×1) | 否 | DB 读 |
| **S19** | `exportReviewData`（**含嵌套 S19a**） | 608–761 | 154 | **是** | S7 · S19a | `prisma`(×3) `logger`(×1) | 否 | DB 读 |
| **S19a** | ↳ `scoreItem`（嵌套于 exportReviewData，深度 7） | 680–703 | 24 | 否（闭包内） | — | — | **是**（唯一纯函数业务逻辑：choice/multi_choice/judge/fill 判分） | 否 |
| **S20** | `readStandardTree` | 765–780（横幅 763–764） | 16（+2） | 否 | — | **`fs`(×2)** **`path`(×1)** `standardDir` `ROOT` `readProjectTree` | 否 | **文件系统读** |
| **S21** | `getProjectReview` | 782–841 | 60 | **是** | S3 S20 | `prisma`(×1) `logger`(×1) `parseProjectAnswer` `toTeacherView` `submissionDir` `readProjectTree` | 否 | **DB + FS** |
| **S22** | `reviewProjectSubmission` | 843–888 | 46 | **是** | S3 | `prisma`(×2) `logger`(×1) | 否 | DB 写 |
| **S23** | `getQuestionPromptPreview` | 890–925（横幅 890–891） | 36 | **是** | — | `prisma`(×1) `logger`(×1) **`buildSystemPrompt` `buildGradingUserMessage`（infrastructure）** | 否 | DB 读 + 纯模板拼接 |
| **S24** | `getSubmissionPrompt` | 927–964 | 38 | **是** | S4 S5 | `prisma`(×1) `logger`(×1) **`buildSystemPrompt` `buildGradingUserMessage`（infrastructure）** | 否 | DB 读 |

**段落行数合计校验**：11(S0) + 25 + 14 + 20 + 33 + 4 + 30 + 24 + 27 + 24 + 42 + 16 + 19 + 14 + 55 + 47 + 23 + 71 + 89 + 154 + 18 + 60 + 46 + 36 + 38 = **940** 行；加 24 个空行（:12 · :38 · :53 · :74 · :108 · :113 · :144 · :169 · :197 · :222 · :265 · :282 · :302 · :317 · :373 · :421 · :445 · :517 · :607 · :762 · :781 · :842 · :889 · :926）+ 末尾空行 :965 = **965** ✔（逐行集合运算，无重叠、无遗漏）。

**接缝判决**：本文件**没有 `// =====` 段落横幅**（只有 2 条：`:763` 实训题审核、`:890` AI 提示词查看），但 24 个顶层声明**每个都是独立的一段**（JSDoc/行内注释紧邻其宿主函数，中间只有空行分隔）→ **接缝天然干净，可以「按声明整块剪切」**，无需像 checkerService 那样处理「物理位置 ≠ 逻辑归属」的混合段（**唯一例外是 S0 的 import 面：11 条 import 必须按 §6.4 重排**）。

**与任务书的两处对照**：
1. 任务书给的两个接缝（`:763` 实训题教师审核、`:890` AI 提示词查看）**实测正确**（分别是横幅行号；其下第一段函数体起于 `:769` / `:896`）。
2. 任务书说「24 个函数」**实测吻合**（顶层 24；另有 1 个嵌套 `scoreItem` 未被任务书计入）。

### 1.3 文件头注释留下的「已完成迁移」事实（必须原样保留）

`:5` 的注释明写「评分链路已迁移至 ReviewUseCases（application/use-cases），经 `req.app.locals.reviewUseCases` 取用」—— 实测 `req.app.locals` 出现 **4 次**（1 注释 + 3 调用：`:272` `:292` `:310`），由 `infrastructure/bootstrap/compose.js:31` 装配。**⇒ 本文件已经是「半迁移」状态：3 个 handler 的写链路已在下层，controller 只剩 HTTP 翻译 + 归属守卫。搬移时这 3 行 `req.app.locals.reviewUseCases.*` 必须逐字保留。**

### 1.4 段落之外的四处暗礁（实测，登记但**本步一律不动**）

1. **`batchReview` 里的死变量 `count`（`:354` `let count = 0;`；`:365` `count = toReview.length;`）**：**只写不读**（`:367` 的响应体用的是 `reviewedStudentIds.size`）。这是 **lint 基线 31 条里本文件唯一的一条**（`docs/pipeline/lint-baseline.json`：`{file:"server/src/controllers/reviewController.js", line:354, rule:"no-unused-vars", symbol:"count"}`），也是 eslint 59 warn 里本文件的那 1 条。**★ 它决定了本步能否过 lint 判据 (b)，见 §6.5。**
2. **`getProjectReview` 是「同功能双实现」中的一路**：同一功能另有 `projectReviewController.getProjectReview`（挂在 `GET /api/teacher/project-submission/:id`），而本文件的 `GET /api/teacher/submissions/:id/project` **全仓无前端调用方**（client/src 实测 0 命中，见 §4.3）。**本步不删、不合、不改路由**（删路由=改契约）；仅登记为后续独立清理项。
3. **`err.name === 'EntityNotFoundError' → 404`（`:275-276` `:295-296`）在结构上近乎不可达**：守卫 `loadVisibleSubmission` 已在同一请求内确认过该 id 存在（`:95-101`），用例层再查时除非被并发删除才会 null。**这不是死代码**（并发语义下仍有意义），但**无法用测试稳定复现** → 零覆盖是结构性的，不应为此写脆弱用例。
4. **`getReviewSummary` 的响应体没有 `message` 字段**（`:450` `{code:0,data:[]}`、`:511` `{code:0,data:rows}`），与其余 15 条路由的 `{code,message,data}` 三键形状**不一致**。`getReviewByClass`（`:601`）与 `exportReviewData`（`:750-756`）同样没有 `message`。**这是既有契约的一部分（前端按 `code`/`data` 取值），拆分必须逐字保留，不得「顺手补齐」。**

---

## 2 落层判定与门禁预判证据

> **本节是本步的核心。判定式**逐字**取自 `server/scripts/check-layers.mjs`（我实读了该文件全部 139 行），不是从架构文档推断的。**

### 2.1 门禁的四条判定式（原文行号 + 逐字含义）

```js
// check-layers.mjs:40-44
layerOf(p) = 相对 server/src 的第一段 ∈ {domain,application,infrastructure,interface} ? 该段 : 'unlayered'
// check-layers.mjs:55-59
isExternal = !spec.startsWith('.') && !spec.startsWith('/')
isNodeIO   = NODE_IO.test(spec)     // :26 = /^(node:)?(fs|path|child_process|http|https|net|tls|dns|os|worker_threads|readline|stream|zlib|vm|dgram|cluster)$/
targetLayer = isExternal ? 'external' : layerOf(resolve(dirname(file), spec))
// check-layers.mjs:63-82（逐层唯一分支，无其它规则）
domain        : isExternal ⇒ 'domain-imports-external' ; targetLayer!=='domain' ⇒ 'domain-imports-outside'
application   : isExternal && (isNodeIO || EXTERNAL_BLACKLIST.includes(spec)) ⇒ 'application-imports-external'
                !isExternal && targetLayer ∈ {infrastructure, interface} ⇒ 'application-imports-infra'
infrastructure: !isCompositionRoot && !isExternal && targetLayer ∈ {application, interface} ⇒ 'infrastructure-imports-upper'
interface     : !isExternal && targetLayer === 'infrastructure' ⇒ 'interface-imports-infra'
unlayered     : ★ 不判任何规则（:46-82 的 if/else 链没有 unlayered 分支）
```

**四条关键事实（都是门禁源码级实测，与架构文档的措辞不同）**：
- **F1｜unlayered 完全不判规则**：`controllers/` `services/` `utils/` `routes/` 下的文件 import 谁都不会违规 —— 这就是「未分层待迁移」可以被无限容忍的原因。
- **F2｜interface 只禁一件事：相对路径指向 `infrastructure/`**。interface **不禁止** import 外部 npm、node 内置、`controllers/`(`utils/` 等 unlayered、也不禁止直连 prisma。
- **F3｜application 只禁两类外部包**（`isNodeIO` 的 16 个 node 内置 + 23 项 `EXTERNAL_BLACKLIST`），且**只禁相对路径指向 infrastructure/interface**。⚠️ **`../utils/prisma.js` 是相对路径、目标是 unlayered ⇒ application 层 import 它并不违规**（`EXTERNAL_BLACKLIST` 里的是 npm 规格符 `'prisma'` / `'@prisma/client'`，不是相对路径）。这是门禁的真实口径，必须如实登记（它使「落 application」在纯门禁意义下**部分可行**，但语义错误，见 §2.3）。
- **F4｜`export { … } from` 对 `check-layers` 与 `cycle-check` 完全不可见**（两者正则都要求字面量 `import`/`require(`/`import(`；实测 `check-layers.mjs:28`、`cycle-check.mjs:42`）。**⇒ 它既能藏住合法的下行边，也能藏住非法的上行边。本方案的红线：不得利用这个盲区把 interface→infrastructure 的 re-export 藏进 barrel（那是真违规）。**

### 2.2 本文件今日的 11 条 import 逐条判层（`:1-11` 实测）

| # | 行 | 规格符 | isExternal | NODE_IO/黑名单 | 目标层 |
|---|---|---|---|---|---|
| 1 | 1 | `fs` | 是 | **命中 NODE_IO** | external |
| 2 | 2 | `path` | 是 | **命中 NODE_IO** | external |
| 3 | 3 | `../utils/prisma.js` | 否 | — | **unlayered**(`utils`) |
| 4 | 4 | `../utils/logger.js` | 否 | — | unlayered |
| 5 | 6 | `../constants.js` | 否 | — | **unlayered**（`constants.js` 在 `src/` 根，首段 = `constants.js` 非四层） |
| 6 | 7 | `./teamController.js` | 否 | — | unlayered(`controllers`) |
| 7 | 8 | `../utils/projectView.js` | 否 | — | unlayered |
| 8 | 9 | `../utils/projectPaths.js` | 否 | — | unlayered |
| 9 | 10 | `../utils/projectFiles.js` | 否 | — | unlayered |
| 10 | 11 | `../infrastructure/ai/prompt-builder.js` | 否 | — | **infrastructure** ★ |
| — | 5 | （注释，非 import） | — | — | — |

**⇒ 唯一的「敏感边」是第 10 条**：它是本文件落层的**唯一硬约束源**。

### 2.3 逐层试算（用 F1–F4 的判定式，对 25 个搬移单元求值）

先给每个单元的「依赖指纹」（§1.2 实测）：

| 指纹 | 单元 |
|---|---|
| **A｜依赖 infrastructure（prompt-builder）** | `getQuestionPromptPreview`(S23) · `getSubmissionPrompt`(S24) |
| **B｜依赖 fs/path（NODE_IO）** | `readStandardTree`(S20) |
| **C｜依赖 S3/S4/S5 守卫闭包** | `loadVisibleSubmission`(S4) · `getSubmissionDetail`(S10) · `regradeSubmission`(S11) · `updateScore`(S12) · `reviewSubmission`(S13) · `getProjectReview`(S21) · `reviewProjectSubmission`(S22) |
| **D｜仅依赖 unlayered（prisma/logger/getVisibleClassIds/常量/utils）** | 其余 13 个：`buildFilter` `enrichWithSchool` `isStudentVisibleToTeacher` `sendScopeError` `filterRejectedSubmissionIds` `resolveVisibleClassScope` `getSubmissions` `getReviewQuestions` `batchReview` `batchPublish` `publishScores` `getReviewSummary` `getReviewByClass` `exportReviewData` `scoreItem` |

（D 类共 15 个，但其中 2 个将被闭包拖走，见下。）

**逐层结论（逐条给判定式依据）**：

- **`domain`｜全部 25 个单元否决**。指纹 A 的单元：`isExternal=false, targetLayer='infrastructure' ≠ 'domain'` ⇒ `domain-imports-outside`（`:65`）。指纹 B：`isExternal=true` ⇒ `domain-imports-external`（`:64`）。指纹 D 的单元虽然自身依赖全在 unlayered，但它们**保留体内的 `res.status/res.json`**（HTTP 语义）且 `import prisma` ⇒ `domain-imports-outside`。**⇒ domain 0 可行单元**（与 step 1 对 ruleExecutor 的裁定相反，因为那个文件零 import）。
- **`application`｜仅指纹 A 与 B 被硬否决，其余 23 个在**纯门禁口径**下可行 —— 但本方案**否决该落法**。依据：
  - 指纹 A：`!isExternal && targetLayer='infrastructure'` ⇒ **`application-imports-infra`**（`:69-71`）。**硬否决。**
  - 指纹 B：`isExternal && isNodeIO('fs')` ⇒ **`application-imports-external`**（`:67-68`）。**硬否决。**
  - 指纹 D 的 13 个：门禁**不报**（F3 的诚实披露）。但**语义上这是错误落层**：`getReviewSummary`/`getReviewByClass`/`exportReviewData` 全是 Prisma 直查 + `res.json` 的 **HTTP 翻译**，不是用例编排；把 36 处 `prisma.*` 搬进应用层会把「应用层只依赖 domain 端口」的文档约束彻底破坏，且**无任何收益**（用例层 `ReviewUseCases` 早已存在，本文件 3 个写 handler 是经 `req.app.locals` 调它的薄壳）。⇒ **application 0 个单元**（与 plan §S5 的 `application/use-cases/review/*` 建议**不符**，理由同 step 3 对 §S2 的否决）。
- **`interface`｜指纹 A 硬否决；指纹 C 由闭包拖走**：
  - 指纹 A：`!isExternal && targetLayer='infrastructure'` ⇒ **`interface-imports-infra`**（`:78-81`）。**硬否决** ⇒ `getQuestionPromptPreview`、`getSubmissionPrompt` **不能落 interface**（**这正是 plan §S5「`interface/http/controllers/review/index.js`」在本步必然违规的那 2 个 handler**）。
  - 指纹 C 的连带：`getSubmissionPrompt`（S24）必须落 infrastructure（上一条），而它 import S4 `loadVisibleSubmission` + S5 `sendScopeError`。若把 S4/S5 放 interface，则 infrastructure 文件 → interface = **`infrastructure-imports-upper`**（`:75`）。⇒ **S4/S5 必须落 infrastructure**；S4 又 import S3 `isStudentVisibleToTeacher` ⇒ **S3 也必须落 infrastructure**（否则 infra→interface 同样违规）；S3/S4/S5 的一切消费者（S10/S11/S12/S13/S21/S22）随即**只能落 infrastructure**。
  - 指纹 B（`readStandardTree`）：它的**唯一消费者是 S21 `getProjectReview`**（已因指纹 C 落 infrastructure）⇒ 若 S20 落 interface，则 infra→interface 违规 ⇒ **S20 必须与 S21 同层**（infrastructure）。
  - **⇒ interface 实际可承载 = 13 个单元（D 类去掉被拖走的 S3/S4/S5，共 13 个）**：`buildFilter` `enrichWithSchool` `filterRejectedSubmissionIds` `resolveVisibleClassScope` `scoreItem`（5 私有）+ `getSubmissions` `getReviewQuestions` `batchReview` `batchPublish` `publishScores` `getReviewSummary` `getReviewByClass` `exportReviewData`（**8 导出**）。
- **`infrastructure`｜对全部 25 个单元**零违规**：判定式只禁「相对路径指向 application/interface」（`:75`，且组合根例外与本步无关）。12 个被强制的单元（A×2 + B×1 + C×7 + S4/S5 共 12，见 §2.4 表）落 infrastructure；它们之间的边全是同层（合法），对 unlayered 与 external 无限制。

### 2.4 落层裁定表（25 个单元 → 层）

| 落层 | 单元数 | 单元（导出名加粗） | 判定式依据 |
|---|---|---|---|
| **interface**（8 导出 + 5 私有） | 13 | 私有：`buildFilter` `enrichWithSchool` `resolveVisibleClassScope` `filterRejectedSubmissionIds` `scoreItem`；导出：**`getSubmissions` `getReviewQuestions` `batchReview` `batchPublish` `publishScores` `getReviewSummary` `getReviewByClass` `exportReviewData`** | F2：其相对目标全部落在 unlayered(`utils`/`constants.js`/`controllers/teamController.js`) 与同层；**无一条指向 `infrastructure/`** ⇒ `interface-imports-infra` = 0 |
| **infrastructure**（9 导出 + 3 私有） | 12 | 私有：`loadVisibleSubmission` `sendScopeError` `readStandardTree`；导出：**`isStudentVisibleToTeacher` `getSubmissionDetail` `regradeSubmission` `updateScore` `reviewSubmission` `getProjectReview` `reviewProjectSubmission` `getQuestionPromptPreview` `getSubmissionPrompt`** | 由 3 条闭环强制（§2.3）：prompt-builder 边 + 守卫闭包 + S20↔S21 同层；落 infrastructure 后所有相对边 ∈ {同层, unlayered} ⇒ `infrastructure-imports-upper` = 0 |
| **application** | **0** | — | 指纹 A/B 硬否决；其余语义错误（§2.3） |
| **domain** | **0** | — | 25/25 命中 `domain-imports-external` 或 `domain-imports-outside` |

**导出面二分自证**：interface **8** 名 + infrastructure **9** 名 = **17** = 今日实测导出面 ✔（一多一少都不允许）。

### 2.5 门禁预判表（0 违规证据）

预判方法（**诚实声明**：A 是只读角色，没有为了预判而落任何文件进仓库）：在内存中**用真实门禁脚本自身的常量与判定式**（`NODE_IO` `:26`、`EXTERNAL_BLACKLIST` `:20-25` 共 23 项、`layerOf` `:40-44`、四条分支 `:63-82`）逐字复刻，喂入 §6 的 **11 个新文件 × 其全部 import 规格符**（interface 侧 22 条 + infrastructure 侧 21 条 = 43 条）→ **违规 0 条**。真跑必须由 C 执行（§11-V10）。

| 规则（门禁原文） | 判定式（实测行号） | 预判违规数 | 依据 |
|---|---|---|---|
| `domain-imports-external` | `:64` | **0（不适用）** | 本步不新增任何 domain 文件 |
| `domain-imports-outside` | `:65` | **0（不适用）** | 同上 |
| `application-imports-external` | `:67-68` | **0（不适用）** | 本步不新增任何 application 文件 |
| `application-imports-infra` | `:69-71` | **0（不适用）** | 同上 |
| **`interface-imports-infra`** | `:78-81` | **0** | interface 侧 6 个文件的相对目标逐一落点：`../../../../utils/{prisma,logger,projectView?…}.js`（unlayered）· `../../../../constants.js`（unlayered）· `../../../../controllers/teamController.js`（unlayered）· `./class-scope.js` 等同层 ⇒ **无一条 targetLayer==='infrastructure'**。★ 反向证据：本文件今日的 `:11` 就是一条 infrastructure 边 —— 若把 S23/S24 放进 interface 文件，**立即命中该规则**（§3 的四条反向陷阱之一） |
| `infrastructure-imports-upper` | `:75` | **0** | infrastructure 侧 5 个文件的相对目标：`../../utils/{prisma,logger,projectView,projectPaths,projectFiles}.js`（unlayered）· `../../controllers/teamController.js`（unlayered）· `../ai/prompt-builder.js`（**同层**）· `./{scope,submission,project}.js`（同层）⇒ **无一条指向 application/interface** |
| 外部包（interface 侧） | `:78-81` **只判相对路径** | **0** | interface 分支不检查任何外部包 ⇒ 即使 interface 文件用 node 内置也不违规（本步 interface 侧实际**零外部 import**） |
| 外部包（infrastructure 侧） | `:72-77` **只判相对路径** | **0** | `fs`/`path`（S20）在 infrastructure 侧**根本不检查** |
| 未分层待迁移 | `:86` `layerOf()==='unlayered'` | **44 → 43** | 删 `controllers/reviewController.js`（unlayered **−1**）；11 个新文件首段分别是 `interface`(6) / `infrastructure`(5) ⇒ **+0** |
| 门禁退出码 | `:140` | `0 → exit 0` | 上述合计 |
| `arch-metrics` GodFile | `arch-metrics.mjs:70,76`（`>800` 计数，判据是「不劣于基线 3」） | **3 → 2** | `reviewController.js (965)` 从名单消失；最大新文件 **≈170 行**（summary.js，见 §6.2）≪ 800 |
| `cycle-check` SCC | `cycle-check.mjs:5-8`（Tarjan，>1 判环） | **0 → 0** | §6.3 的依赖图是**有向无环**的（interface 6 文件互不反向；infrastructure 5 文件的边严格单向 `index → {scope,submission,project,prompts}`、`{submission,prompts,project} → scope`） |
| `hard-metrics` | `hard-metrics.mjs:20`（只扫 `client/src`） | **0/0/0 不变** | 本步不碰 client |
| `bind-check` | `bind-check.mjs:12-15`（具名 import/re-export 必须有真实导出） | **0** | 两个 barrel 的 17 条 re-export 全部指向真实导出名（C 用 `Object.keys` 对拍，§11-V8） |
| **lint (a) eslint** | DoD §5-5：error=0 且 warn ≤ 59 | **0 error / 59 warn**（见 §6.5 的搬迁效应） | 逐字搬移 ⇒ 无新规则命中；`count` 死变量随 S14 迁走，warn 总数**不变**（59） |
| **lint (b) lint-check** | `lint-check.mjs:539-570`（比对键 = **file + rule + symbol**） | ⚠️ **会从 0 新增变成 1 新增 → exit 1，除非按 §6.5 处理** | `count` 的违规随 S14 迁移到新路径 ⇒ 旧键 `resolved`、新键 `fresh`（同 rule 同 symbol、**不同 file**） |

### 2.6 四条反向陷阱（给 C 做门禁证伪用，仿 step 1 的 V4）

① 把 `getQuestionPromptPreview` 放进任一 `interface/` 文件（保留 `import { buildSystemPrompt } from '…/infrastructure/ai/prompt-builder.js'`）⇒ **立刻 `interface-imports-infra`** —— 这条正是「plan §S5 的 interface 落层不可照用」的实证。
② 把 `getSubmissionPrompt` 放 interface 而把 `scope.js` 放 infrastructure ⇒ 同时命中 `interface-imports-infra`（scope.js）与（若反向）`infrastructure-imports-upper` —— 证明 §2.3 的守卫闭包论证。
③ 把 `readStandardTree`（`fs`/`path`）挪进一个 `application/` 文件 ⇒ **`application-imports-external`**。
④ 在 `interface/http/controllers/review/index.js` 里加一行 `export { getProjectReview } from '…/infrastructure/review/project.js'` ⇒ **门禁与 cycle-check 都不报**（F4 盲区）—— 用于证明该盲区真实存在，并提醒 C：**barrel 的层归属只能靠人读 + bind-check 的路径解析**，不能靠 check-layers。
（C 用 /tmp 副本做，**不得进仓库**。）

---

## 3 HTTP 契约清单（含越权守卫）

### 3.1 挂载与中间件（实测）

- 挂载点：`server/src/app.js:97` `app.use('/api/teacher', teacherRoutes)`
- 路由器：`server/src/routes/teacher.js:10-11` —— `const router = Router(); router.use(auth, requireRole('teacher'));` ⇒ **本文件全部 16 条路由共享 `auth` + `requireRole('teacher')`**（`auth` = `middleware/auth.js`，`requireRole` = `middleware/role.js`）。
- **本文件没有任何路由级/方法级的额外中间件**（无 `multer`、无限流、无 `projectAssetGuard`）。
- **★ 越权守卫：本文件在「昨夜加守卫」的集合内，且是全仓最密集的一个** —— 实测 `code: 1003` **12 处**、`res.status(403)` **11 处**、`code: 1001` 11 处、`code: 1004` 8 处、`code: 2001` 16 处（`grep -c` 实测）。守卫分三层：**t4（按 id 直取的统一归属校验）· t6（班级维度入口的可见集收敛）· R6（实训题作业归属双校验）+ R16（classId 与可见集求交）+ R5（非法 schoolId fail-closed）**。
- `prisma` 直接调用 **36 处**；`req.app.locals` **4 处**（1 注释 + 3 调用）。

### 3.2 逐路由契约表（16 条；「拆后必须逐字不变」的清单）

| # | 方法 + 路径（`/api/teacher` 前缀） | handler（源行） | 守卫分支（源行，**逐字保留**） | 成功响应（状态码 + body 形状，逐字） | 失败响应 |
|---|---|---|---|---|---|
| 1 | `GET /submissions` | `getSubmissions`(170-196) | **范围收敛**（不 fail-closed）：`buildFilter`(13-37) 起点非 `{}`，收敛到可见班级学生集（`:35`） | 200 `{code:0, message:'ok', data:{list:[…+schoolName], total, page, pageSize}}` (`:191`) | 500 `{code:2001,message:'服务器内部错误',data:null}` |
| 2 | `GET /review-questions` | `getReviewQuestions`(198-221) | **403/1003 '无权访问该班级'**(`:203`，经 `resolveVisibleClassScope` `ok:false`) | 200 `{code:0,message:'ok',data:[{id,title}]}`(`:216`) ／ 无可见学生时 **200 `{code:0,message:'ok',data:[]}`**(`:208`) | 500 |
| 3 | `GET /submissions/:id` | `getSubmissionDetail`(223-264) | **400/1001 '参数错误'**(`:93`) · **404/1004 '提交不存在'**(`:100`,`:238`) · **403/1003 '无权访问该提交'**(`:104`，经 `sendScopeError`) | 200 `{code:0,message:'ok',data:{…submission, allSubmissions, schoolName}}`(`:259`) | 500 |
| 4 | `POST /submissions/:id/regrade` | `regradeSubmission`(266-281) | 同上三码（`:269`→`:270`）；另 **404/1004 `err.message`**（EntityNotFoundError，`:276`，近乎不可达见 §1.4-3） | 200 `{code:0,message:'重新评分完成',data:{aiScore,aiFeedback}}`(`:273`) | 500 |
| 5 | `PUT /submissions/:id/score` | `updateScore`(283-301) | 400/1001 · 404/1004 · **403/1003 '无权访问该提交'**(`:289`→`:290`)；另 404/1004 `err.message`(`:296`) | 200 `{code:0,message:'分数已更新',data:updated}`(`:293`) | 500 |
| 6 | `PUT /submissions/:id/review` | `reviewSubmission`(303-316) | 400/1001 · 404/1004 · **403/1003 '无权访问该提交'**(`:306`→`:307`) | 200 `{code:0,message:'审核成功',data:null}`(`:311`) | 500 |
| 7 | `POST /submissions/batch-review` | `batchReview`(318-372) | **400/1001 '请选择学校'**(`:323`) · **403/1003 '无权操作该班级'**(`:327`) · **400/1001 '练习模式无需审核'**(`:331`) | 200 `{code:0,message:\`已审核 N 名学生\`,data:{count:N}}`(`:367`，N=`reviewedStudentIds.size`) | 500 |
| 8 | `POST /submissions/batch-publish` | `batchPublish`(374-420) | **400/1001 '请选择学校'**(`:379`) · **403/1003 '无权操作该班级'**(`:383`) · **400/1001 '练习模式无需发布'**(`:387`) | 200 `{code:0,message:\`已发布 N 名学生\`,data:{count:N}}`(`:415`) | 500 |
| 9 | `PUT /submissions/publish` | `publishScores`(422-444) | **400/1001 '请选择提交'**(`:425`) · **403/1003 '部分提交不在可见范围内，已整批拒绝' + `data:{rejectedIds}`**(`:431`，★**唯一 body 带 data 的 403**) | 200 `{code:0,message:'发布成功',data:null}`(`:439`) | 500 |
| 10 | `GET /review-summary` | `getReviewSummary`(446-516) | **R5 fail-closed：非法 schoolId → 200 `{code:0,data:[]}`**(`:450`，★**无 message**) · **R16：classId 与可见集求交**(`:456`，不可见→收敛空集而非放行) | 200 **`{code:0,data:[rows]}`**(`:511`，★**无 message**) | 500 |
| 11 | `GET /review-class/:classId` | `getReviewByClass`(518-606) | **403/1003 '无权访问该班级'**(`:522`，classId 取 `:params.classId`) | 200 **`{code:0,data:{list,total}}`**(`:601`，★**无 message**) | 500 |
| 12 | `GET /export-review` | `exportReviewData`(608-761) | **400/1001 '参数错误'**(`:611` 缺 classId/assignmentId) · **403/1003 '无权访问该班级'**(`:616`) · **400/1001 '参数错误'**(`:619` assignmentId 非正整数) | 200 **`{code:0,data:{rows:[{studentName,studentNo,schoolName,className,submitted,cellScores,totalScore}], headerCells:[{label,maxScore}]}}`**(`:750-756`，★**无 message**) | 500 |
| 13 | `GET /submissions/:id/project` | `getProjectReview`(788-841) | **404/1004 '提交不存在'**(`:799`) · **400/1001 '非实训题提交'**(`:800`) · **403/1003 '无权操作'**(`:802`，`assignment.teacherId!==req.user.id`) · **403/1003 '无权访问该提交'**(`:805`，`isStudentVisibleToTeacher`) | 200 `{code:0,message:'ok',data:{submission,question,assignment,student,version,studentFiles,standardFiles,aiResult}}`(`:823-836`) | 500 |
| 14 | `PUT /submissions/:id/project/review` | `reviewProjectSubmission`(849-888) | 404/1004(`:861`) · 400/1001 '非实训题提交'(`:862`) · **403/1003 '无权操作'**(`:864`) · **403/1003 '无权访问该提交'**(`:867`) | 200 `{code:0,message:'审核成功',data:{id,status,finalScore,teacherFeedback}}`(`:879-883`)。★内含**分值钳制** `Math.max(0,Math.min(max,Number(finalScore)))`(`:873`，`max=question.maxScore||100`) 与 **R3 评语绝不回退 AI**：`teacherFeedback!==undefined ? String(teacherFeedback||'') : (sub.teacherFeedback||'')`(`:876`) | 500 |
| 15 | `GET /questions/:id/prompt-preview` | `getQuestionPromptPreview`(896-925) | **404/1004 '题目不存在'**(`:902`) · **403/1003 '无权访问该题目'**(`:905`，`q.teacherId!==req.user.id`) | 200 `{code:0,message:'ok',data:{type:'code',subs:[{id,title,system,user}]}}`(`:920`) | 500 |
| 16 | `GET /submissions/:id/prompt` | `getSubmissionPrompt`(930-964) | 400/1001 · 404/1004(`:933`→`:934`) · (再) **404/1004 '提交不存在'**(`:943`) · **400/1001 '该提交不是编程题'**(`:946`，`sub.question?.type && type!=='code'`) | 200 `{code:0,message:'ok',data:{type:'code',system,user}}`(`:959`) | 500 |

**契约条目数 = 16 条路由**；**导出契约条目数 = 17 个名字**；**403/1003 分支 = 12 处**（其中 3 处来自共享守卫函数体，经 `sendScopeError` 原样输出）；**错误文案条目 = 15 条不同字符串**（`无权访问该提交` 出现 4 次、`无权操作` 2 次、`无权访问该班级` 3 次、`参数错误` 2 次、`提交不存在` 4 次、`非实训题提交` 2 次、`无权访问该题目` 1 次、`题目不存在` 1 次、`请选择学校` 2 次、`无权操作该班级` 2 次、`练习模式无需审核` 1 次、`练习模式无需发布` 1 次、`请选择提交` 1 次、`部分提交不在可见范围内，已整批拒绝` 1 次、`该提交不是编程题` 1 次 + `服务器内部错误` 16 次）。

### 3.3 「逐字不变」清单（B 的自检项，C 的核对项）

1. `routes/teacher.js` 的 **16 行路由声明体（:27 :51 :52 :53 :54 :55 :56 :58 :59 :62 :63 :64 :65 :66 :68 :69）逐字不动** —— 采用 §6.4 的「barrel 合并」写法时，**这 16 行连 `review.` 前缀都不用改**。
2. 全部 **状态码 × body 键序** 逐字不变（含 §1.4-4 的三处「无 message」形状、§3.2-#9 的 403 带 `data:{rejectedIds}`）。
3. 全部 **中文文案** 逐字不变（含全角引号/顿号/空格数量）。
4. `router.use(auth, requireRole('teacher'))` 与挂载前缀 `/api/teacher` 不动。
5. **不得新增/删除/改名任何路由**（含 §1.4-2 的「无前端调用方」的那条 `GET /submissions/:id/project` —— 它仍在契约内）。

---

## 4 调用方与导出面（含 mock 排查）

### 4.1 直接 import 站点（**全仓仅 2 个**，一个不多）

实测方式：`grep -rn "reviewController\|isStudentVisibleToTeacher" server/src server/test client/src scripts docs/split/status.md`（排除 node_modules）→ 逐条人读；另用 `grep -rn` 扫 `tests/`、`client/` 全树（**0 命中**，命中量为 0 而非「很少」）。

| # | 文件:行（实测） | 今日写法 | 取的名字 | 拆分后 | 必须改？ | 风险 |
|---|---|---|---|---|---|---|
| **I1** | `server/src/routes/teacher.js:5` | `import * as review from '../controllers/reviewController.js';` | **16 个 handler 名**（`:27` `:51` `:52` `:53` `:54` `:55` `:56` `:58` `:59` `:62` `:63` `:64` `:65` `:66` `:68` `:69`） | 2 条 import + 1 行合并（§6.4） | **是** | **高（唯一硬失败点）**：少一个名字 ⇒ 路由表在 import 期或首访时爆 `does not provide an export named` |
| **I2** | `server/src/controllers/projectReviewController.js:18` | `import { isStudentVisibleToTeacher } from './reviewController.js';` | `isStudentVisibleToTeacher`（消费点 `:109` `:181` `:291` 三处） | 改路径为 `'../infrastructure/review/scope.js'` | **是** | 中（单名，但被 3 个越权守卫调用） |

**非 import 的文本引用（不影响编译，不要求改，但需登记以免误导后人）**：
- `server/src/controllers/teacherController.js:427-433` 的 3 行注释（`getReviewSummary` 口径同步说明）—— **保留原文**（它是给维护者的路标；本步不改注释里的旧路径，因为它写的是「`reviewController.js:315-331`」这一**历史定位**）。★登记为「拆分后注释里的文件:行号会失效」的已知文档债。
- `server/src/application/use-cases/review.use-cases.js:3`、`server/src/infrastructure/persistence/submission.repository.js:3` 的溯源注释 —— 同上，**保留**。
- `server/test/contract/use-cases-contract.test.js:59,63,67` 的 **3 个 it 标题**里含字符串 `"reviewController.regradeSubmission"` 等 —— **只是标题文本，不 import 控制器**（实测该文件唯一的 import 是 `:13` `compose.js`）⇒ **不改**。

### 4.2 jest 路径键控 mock 排查（step 1 的 H1 类单点故障）

- `grep -rn "jest\.mock\(" server/test` ⇒ **0 命中**（整个 server/test 树**没有任何 jest.mock**，更没有以 `../controllers/reviewController.js` 为键的 mock）。
- `grep -rn "jest\.mock\(['\"][^'\"]*[Cc]ontroller" server/test` ⇒ **0 命中**。
- `server/test/jest.config.js` 实测：`transform: {}`（无 babel/ts 转译）、`moduleNameMapper: {'^(\\.{1,2}/.*)\\.js$': '$1'}`（相对 import 的 `.js` 后缀映射）、`setupFiles: ['./test/setup.js']`。
  - ⚠️ **`moduleNameMapper` 的影响**：它把 `./x.js` 映射成 `./x` 再解析 —— **对新增文件的路径解析无影响**（新文件都存在），但**如果 B 写错相对层级**（如 `../../../../utils/prisma.js` 少一层），jest 会在**运行期**报 `Cannot find module`；而 `lint-check` 的 `no-unresolved-import` 与 `bind-check` 能**静态提前拦住**（§11-V13）。
- **⇒ 结论：本步不存在 H1 类单点故障**（无 mock 键、无 jest 路径耦合）。这也是本步比 step 1/3 更简单的一项。
- 唯一「键控」风险在别处：**`docs/pipeline/lint-baseline.json` 的 `file` 字段**（§6.5）—— 它是本步唯一的「路径键」。

### 4.3 前端调用方（影响「契约是否真的在被使用」，不改代码）

`grep -rn "teacher/(submissions|review-summary|review-class|review-questions|export-review)" client/src` 实测 16 条命中，落在 `api/projects.js` `composables/review/{useReviewAiPrompt,useReviewActions,useReviewData}.js` `views/teacher/{ReviewClass,Review,ProjectReviewNew}.vue`。**其中没有任何一条对应 `GET /teacher/submissions/:id/project`**（路由 13）——它与 `projectReviewController` 的 `GET /teacher/project-submission/:id` 功能重叠而无人调用（§1.4-2）。

---

## 5 测试覆盖现状与「先补测试」建议

> **本节的判定是静态 + 人读**（A 角色禁令：不跑 jest）。方法与依据：① 逐套件 `grep` 端点字符串（含全路径与模板串两种写法）；② 逐用例人读断言的**状态码**与**请求体**；③ **关键：判断是否在守卫处短路**（step 3 的陷阱 ——「传递加载了模块但函数一行未执行」）。本文件是 controller，**每个套件都经真实 HTTP + 真实 DB 走到 handler 体内或守卫的 `return` 处**，不存在「只加载不执行」的中间态；真正的盲区是**「只走 4xx 分支、没走 200 分支」**。

### 5.1 覆盖矩阵（逐路由；例数 = 含该端点的 `it(` 数，实测）

| # | 路由 | 主覆盖套件（例数实测） | 覆盖形态 | 直接断言 evidence？ |
|---|---|---|---|---|
| 1 | `GET /submissions` | `review.test.js`(8) · `t2-teacher-scope`(10) · `qa-batch1`(17) | **正例 + 范围收敛反例** | 是（`data.list`/`total`/`pageSize`、跨校隔离） |
| 2 | `GET /review-questions` | `t5`(17) · `t6`(18) · `t7`(12) | **正例 + 403 反例 + 集合相等**（t7 手算集合对拍） | 是 |
| 3 | `GET /submissions/:id` | `review.test.js` · `t4`(17) · `t5` · `qa-batch1` | **正例 + 400/404/403 + 字段级零泄漏**（`collectKeys` 递归） | 是（最强） |
| 4 | `POST /submissions/:id/regrade` | `t4:294` · `t5:245` | ⚠️ **仅 403 反例**（正例 0；用例层正例在 `contract/extensibility.test.js:97` 打的是 **use-case**，不是 handler） | 部分 |
| 5 | `PUT /submissions/:id/score` | `review.test.js:65` · `t4:270,320` · `t5:237,318` | **正例（DB 落库断言）+ 403 零写入** | 是 |
| 6 | `PUT /submissions/:id/review` | `review.test.js:80` · `t4:282,326` · `t5:241,322` | **正例 + 403 + DB 三字段不变** | 是 |
| 7 | `POST /submissions/batch-review` | `t4:367,380,391` · `t5:297,302,338` · `t6:403,410,416` | **正例 + 400/403**（缺 schoolId、非法 classId、不可见 classId） | 是 |
| 8 | `POST /submissions/batch-publish` | `review.test.js:93` · `t4:371,384,398` · `t5:300,304,342` · `t6:407` | **正例 + 400/403** | 是 |
| 9 | `PUT /submissions/publish` | `t4:341,354,358` · `t5:254,277,288,326,332` | **正例 + 整批拒绝 403（含 rejectedIds）** | 是 |
| 10 | `GET /review-summary` | `review.test.js`(8) · `t2`(10) · `t4`(17) · `t5`(17) · `qa-batch1`(17) · `teacher-pending-summary`(13) | **全仓最密**：R5/R16/R14 口径、跨校、非法 schoolId → `{code:0,data:[]}` | 是（最强） |
| 11 | `GET /review-class/:classId` | `review.test.js:28,37` · `t5:449,458` · `t6:266,269,274` · `t7:178,223,225,227,230` | **正例（含 filter=abnormal）+ 403** | 是 |
| 12 | `GET /export-review` | `t5:440` · `t6:236,241,246,256,259` · `t7:176,189,191,196,201,206` | **正例（`cellScores[0].score`、`totalScore` 逐值）+ 403 + 400** | **是，但只覆盖主观题分支**（见 §5.2-Z1） |
| 13 | `GET /submissions/:id/project` | `t4:305` | ⚠️ **仅 403 反例（`:805` 那条）** | **否（200 分支零覆盖）** |
| 14 | `PUT /submissions/:id/project/review` | `t4:309` | ⚠️ **仅 403 反例** | **否（200 分支零覆盖）** |
| 15 | `GET /questions/:id/prompt-preview` | `prompt-preview.test.js:68` · `t6:314,317` · `t7:273,275` | **正例（含参考答案断言）+ 403** | 是 |
| 16 | `GET /submissions/:id/prompt` | `prompt-preview.test.js:111` · `t4:255` · `t5:229` · `t6:344` · `t7:299,301` | **正例 + 403 零泄漏 + 400（非编程题）** | 是 |

**★ 对 plan §S5 的更正**：plan 写「风险：中（**有 62 例越权用例覆盖部分端点**）」。实测该 **62 例**是 `server/test/integration/ownership-guards.test.js` 的 `it(` 总数，其端点全部是 `/teacher/classes/*` `/teacher/students/*` `/teacher/teams/*`（`grep -c "teacher"` = 101 行命中，**0 条落在 submissions/review 端点**）——**与 reviewController 无关**。reviewController 的真实越权覆盖来自 `t4/t5/t6/t7/qa-batch1`（合计 **81** 个 `it(`，其中与 submissions/review 端点直接相关的约 **60** 例）。**结论：plan §S5 的风险依据引错了套件，但结论「中」仍然成立（实测覆盖比它以为的更好）。**

### 5.2 零覆盖清单（函数级 + 分支级，逐条给依据）

**A. 整函数零覆盖（2 个）**

| # | 单元（源行） | 依据 |
|---|---|---|
| **Z1** | **`scoreItem`(680-703)** —— 24 行、4 个分支（`choice` / `multi_choice` / `judge` / `fill`）**全部零执行** | 它只在 `exportReviewData` 的「客观题小问」路径（`:721-736`，条件 `h.itemKey != null`）被调用，而 `itemKey` 非 null **仅当** `subQuestion.type === 'objective'` 且有 `objectiveItems`（`:654-666`）。实测：**全仓 `server/test` 的 `grep -rn "objectiveItems"` 只有 4 类命中 —— 1 条仓储单测（`persistence-repositories.test.js:68-82`，用 `[{text:'A'}]` 这种非真实结构）+ 3 条「响应体不得泄漏该键」的键名黑名单**；**没有任何测试夹具给 subQuestion 写入真实的 `objectiveItems`/答案 JSON**。t7 的 `mkQ`(:104) 只建 `type:'code'`/`'project'` + 1 个无 `objectiveItems` 的 subQuestion；t6 的 `asgA` 同理。⇒ `cellScores[0]` 断言走的是 **`itemKey == null` 的主观题分支**（`:710-720`）。 |
| **Z2** | **`readStandardTree`(765-780)** —— 两个 `fs.existsSync` 分支（`:771` 新目录、`:777` 历史 `attachmentUrl` 目录）与「都没命中 → 空树」兜底，**全部零执行** | 唯一调用点是 `getProjectReview:812`，而该 handler 的 200 分支零覆盖（见 B-Z3）。 |

**B. 部分覆盖函数里的零覆盖分支（逐条）**

| # | 零覆盖分支（源行） | 依据 |
|---|---|---|
| **Z3** | `getProjectReview` 的**整条 200 路径**（`:808-836`：`parseProjectAnswer` → `submissionDir` → `readProjectTree` → `readStandardTree` → `aiFeedback` JSON 解析 + `catch` 降级 `{overallComment}` → 响应装配） | 唯一命中是 `t4:305`，而 `tokenA` 对该提交在 `:802`（作业归属）或 `:805`（可见班级）就被 403 短路。**功能等价的 200 断言在 `open-project-flow.test.js:241-259`（用例⑤），但它打的是 `/api/teacher/project-submission/:id` = `projectReviewController.getProjectReview`（`routes/teacher.js:61`），不是本文件的 `/submissions/:id/project`（`:68`）** ⇒ 本文件的这一路是真空白。 |
| **Z4** | `reviewProjectSubmission` 的**整条 200 路径**（`:870-883`：分值钳制 `Math.max(0,Math.min(max,Number(finalScore)))`（含 `Number('abc')`→NaN 的**未定义行为**、越界钳到 0/max）、`teacherFeedback` 三态（显式传 / 传空串 / 不传→保留既有）、R3 不回退 AI 评语） | 唯一命中是 `t4:309`（403）。**0 条 200 断言**。 |
| **Z5** | `batchReview` 的 `练习模式无需审核` 400 分支（`:331`） | 全仓 `batch-review` 的请求体里 `assignmentId` 全部指向 `mode:'exam'` 的作业；`practice` 作业的 3 处夹具（`qa-batch1:193`、`teacher-pending-summary:169`）**只用于 review-summary/pending-summary**，从未 POST 到 batch 端点。 |
| **Z6** | `batchPublish` 的 `练习模式无需发布` 400 分支（`:387`） | 同上。 |
| **Z7** | `regradeSubmission` 的 200 分支（`:273`）与 `EntityNotFoundError`→404 分支（`:275-276`） | 见 §1.4-3（结构性近乎不可达）+ 无正例（`t4:294`/`t5:245` 都是 403）。 |
| **Z8** | `updateScore` 的 `EntityNotFoundError`→404 分支（`:295-296`） | 同上（`:320`/`:318` 是 200，`:270`/`:237` 是 403，无人走到 404）。 |
| **Z9** | `enrichWithSchool` 的早退 `if (!studentIds.length) return list;`（`:42`） | `getSubmissions` 的全部正例都至少返回 1 条含 `student` 的提交（t2/qa-batch1 的夹具必然有学生）；**无「提交的 student 关系为 null」夹具**。 |
| **Z10** | `isStudentVisibleToTeacher` 的 `if (!visibleClassIds.length) return false;`（`:67`） | 进入它的全部请求都来自至少有一个可见班级的教师（否则更上层的守卫先拒）；**无「零可见班级教师」夹具**。 |
| **Z11** | `getReviewQuestions` 的 `if (!studentIds.length) return ... data: []`（`:208`） | 低置信：t6/t7 的 `review-questions` 正例都有学生；未见「可见班级为空花名册」的用例。**登记为待 C 复核项**。 |
| **Z12** | `publishScores` 的 `if (!submissionIds?.length) → 400 '请选择提交'`（`:425`） | 全部 `/submissions/publish` 请求都带了非空数组（`t4:341,354,358` `t5:254,277,288,326,332`）；**无 `{}` / `[]` / 缺字段夹具**。 |
| **Z13** | `filterRejectedSubmissionIds` 的「全非法 id」早退（`:125`）与 `visibleClassIds.length === 0` 分支（`:131`） | 已覆盖的是「部分非法/不可见」（`t5:288` ghost id、`t4:354` 跨校）；**「全部 id 非法」与「零可见班级」两支未测**。 |
| **Z14** | `resolveVisibleClassScope` 的 `schoolId` 空/非法等价类（`:159-160`，`undefined` / `null` / `''` 三态归一）+ 小数 schoolId | 覆盖面广（t6/t7 大量 classId 反例），但 `schoolId=''` 与小数**未逐态打靶**。 |
| **Z15** | `loadVisibleSubmission` 的 `submissionId` 非整数/≤0 分支（`:92-93`） | `t5:262`（`/submissions/abc` → `+params.id`=NaN）大概率命中，但**我未逐行确认其断言为 400/1001** ⇒ 登记为「疑似已覆盖，待 C 确认」。 |
| — | 24 个空行 + 2 条段落横幅（`:763-764` `:890-891`） + S0 的 import 面 | 无行为语义（搬移时横幅**不搬**、空行**不搬**、import **重排**）。 |

### 5.3 「先补契约测试再拆」的具体建议（**结论：本步必须补，但只补 3 组、且必须在 B 动手之前独立提交**）

plan §4 的排序原则明写「S4/S5 最难，**先补契约测试再动**」。实测支持这一结论，但**范围可以收窄**：**13/16 条路由已有正例 + 反例的双向断言**，真正的空洞只有 **Z3 / Z4 / Z1** 三处，且它们恰好是每条路由里**行数最多、副作用最重**的三段（`getProjectReview` 60 行含 FS、`reviewProjectSubmission` 46 行含写库与钳制、`exportReviewData` 的客观题判分 24 行）。**Z5/Z6/Z12 是廉价的 400 分支，一并补上（各 1 例，成本极低）。**

| 建议编号 | 补什么 | 用什么断言口径（**只读现状、不改代码**） | 成本 |
|---|---|---|---|
| **T-A** | `GET /api/teacher/submissions/:id/project` 的 **200 正例 ×2**（有标准包 / 无标准包） | ① `res.status===200 && code===0`；② **键集合逐名对拍**：`Object.keys(data).sort()` === `['aiResult','assignment','question','standardFiles','student','studentFiles','submission','version']`；③ `standardFiles.tree/contents`（无标准包 → `{tree:[],contents:{}}`；有标准包 → `contents` 含夹具文件名、`tree.length>0`）；④ `studentFiles.contents[<夹具文件>]` 逐字等于写入内容；⑤ `version` === 信封 `currentVersion`；⑥ `aiResult` 两态：合法 JSON → 解析对象；非法 JSON 串 → `{overallComment:<原串>}`（**顺带覆盖 `:817-821` 的 catch**）。夹具可**直接复用** `open-project-flow.test.js` 的 `buildStudentZip()`/`submissionDir`/`standardDir` 与 `loginAsTeacher/authReq`（该套件已实证可跑）。 | **中**（1 个新文件 / 2 例 / 需造 1 个 zip 与 1 个标准包目录；无 AI 依赖，`getProjectReview` 不出网） |
| **T-B** | `PUT /api/teacher/submissions/:id/project/review` 的 **200 正例 ×5** | 逐条断言 `res.body.data` 三键 + 回读 DB：① 正常 `finalScore=60, teacherFeedback='T'` → `data.finalScore===60`、`status==='reviewed'`、`teacherFeedback==='T'`；② **越界钳制**：`finalScore=-5` → `0`；`finalScore=10**9` → `question.maxScore`；③ **不传 `finalScore`** → `data.finalScore` 保持原值（`undefined` 分支 `:871`）；④ **R3**：`teacherFeedback` 不传且库中为 `null` → `data.teacherFeedback===''`，且**不等于** `aiFeedback` 的内容；⑤ `teacherFeedback=''`（显式空串）→ `''`（`:876` 的 `String(x||'')` 分支）。 | **低**（1 个新文件 / 5 例；同一套 `beforeAll` 夹具，无 AI 依赖） |
| **T-C** | `GET /api/teacher/export-review` 的**客观题正例 ×4**（choice / multi_choice / judge / fill） | ① `headerCells` 长度与 `label` 文案（含 `stem` 的 HTML 剥离 + `slice(0,60)`）；② 逐生 `cellScores[i].{label,maxScore,score,submitted}`；③ **四种题型的判分等价类**：choice 全等/不等；multi_choice **无序集合相等**（`'A,B'` vs `'B,A'` 都满分）、**多选/少选均 0 分**；judge；fill 的**逗号分空 + 逐空小写比较**（`'Foo, BAR'` vs `'foo,bar'`）；④ 未提交（`status` 为空）→ `score===null` 且不计入 `totalScore`；⑤ `totalScore` 在全未提交时为 `null`（`:746`）。夹具：`prisma.subQuestion.create({ type:'objective', objectiveItems:[{key,type,stem,score,answer,options}] })` + 学生 `answer` 存 `JSON.stringify([{key,answer}])`（`:681-682` 的解析形状）。 | **中**（1 个新文件 / 4-5 例；需造 objective 题夹具，但**是唯一能覆盖 Z1 的手段**） |
| **T-D** | `batch-review`/`batch-publish` 的 **练习模式 400 ×2**（`:331`/`:387`） + `submissions/publish` 的 **`{}`/`[]` → 400 ×2**（`:425`） | 状态码 + `code===1001` + `message` **逐字**（`'练习模式无需审核'` / `'练习模式无需发布'` / `'请选择提交'`），并断言 `submission.count`/`updateMany` **零写入**。 | **极低**（复用 `t4`/`t6` 的 `mkAsg({mode:'practice'})` 与 token 夹具，4 例） |

**成本汇总**：4 组 / 约 15 例 / 2–4 个新文件，**全部是纯 HTTP + 真实 DB，零 AI 出网、零新依赖**；参照 `t4/t5/t6/t7` 的既有写法（每个套件 200–400 行），**预估 1 个执行单元（≈半天）**。**收益：把 Z1/Z3/Z4 三处「行数最多 + 有副作用」的空白补成双向断言 ⇒ 使本步从「零覆盖段落只能靠切片判等」升级为「切片判等 + 真行为对拍双保险」。**

**★ 顺序要求（硬）**：T-A…T-D 必须作为 **B0（独立提交，先于任何搬移）** 落地，并在日志里记录「补测后全量 0 failed」；**不得与搬移写在同一提交**（plan §6「不在同一提交里既拆文件又改行为」的同构要求：先立护栏再动手）。

---

## 6 目标模块划分

### 6.1 前置裁定：plan §S5 的两处落层建议**不可照用**

| plan §S5 建议 | 门禁实测裁定 | 依据 |
|---|---|---|
| `interface/http/controllers/review/{index,project}.js` | **部分可行**：13 个单元可行，**12 个单元不可行** | §2.3：`getQuestionPromptPreview`/`getSubmissionPrompt` 的 prompt-builder 边 ⇒ `interface-imports-infra`；守卫闭包再把 10 个单元拖入 infrastructure |
| `application/use-cases/review/*` | **不可行（0 个单元）** | §2.3：指纹 A/B 硬否决；`ReviewUseCases` 已存在且已接线（`compose.js:31`），再建用例层只能是「给 36 处 Prisma 直查换皮」= 结构性改造（违反 plan §6） |

### 6.2 对照表（源行号 = §1.2 实测；预估行数 = 搬移行数 + 新增 banner/import/export 块；**全部 < 800**）

| # | 目标文件（层） | 搬移内容（**源文件行号，逐字**） | 搬移行数 | 预估总行数 |
|---|---|---|---|---|
| **T1** | `interface/http/controllers/review/class-scope.js`（**interface**） | 145-168 | 24 | **≈32** |
| **T2** | `interface/http/controllers/review/list.js`（**interface**） | 13-37 · 39-52 · 170-196 · 198-221 | 90 | **≈100** |
| **T3** | `interface/http/controllers/review/batch.js`（**interface**） | 114-143 · 318-372 · 374-420 · 422-444 | 155 | **≈166** |
| **T4** | `interface/http/controllers/review/summary.js`（**interface**） | 446-516 · 518-606 | 160 | **≈170** |
| **T5** | `interface/http/controllers/review/export.js`（**interface**） | 608-761（**含嵌套 `scoreItem` 680-703**） | 154 | **≈164** |
| **T6** | `interface/http/controllers/review/index.js`（interface，**新建**） | 无搬移；8 行 re-export（§6.3） | 0 | **≈13** |
| **T7** | `infrastructure/review/scope.js`（**infra**） | 54-73 · 75-107 · 109-112 | 57 | **≈66** |
| **T8** | `infrastructure/review/submission.js`（**infra**） | 223-264 · 266-281 · 283-301 · 303-316 | 91 | **≈100** |
| **T9** | `infrastructure/review/project.js`（**infra**） | 763-780（横幅+readStandardTree） · 782-841 · 843-888 | 124 | **≈134** |
| **T10** | `infrastructure/review/prompts.js`（**infra**） | 890-925（横幅+handler） · 927-964 | 74 | **≈84** |
| **T11** | `infrastructure/review/index.js`（infra，**新建**） | 无搬移；9 行 re-export（§6.3） | 0 | **≈14** |
| — | 源文件 `server/src/controllers/reviewController.js` | **整体删除** | −965 | 0 |
| — | 1-11（import 面）· 24 个空行 · :965 末尾空行 | **不搬**（import 重排见 §6.4） | — | — |

- **搬移总量校验**：940 行搬出（含 2 条横幅 4 行）+ 25 行留在源文件未搬（11 行 import + 24 个段间空行 + 1 个末尾空行，其中 import 面被重排而非搬移）= **965** ✔
  逐项核：T1..T5 + T7..T10 的搬移行数 = 24+90+155+160+154+57+91+124+74 = **929**；加 2 条横幅各 2 行已在 T9/T10 内计入（763-764 在「763-780」内、890-891 在「890-925」内）；929 + 11(import) + 24(空行) + 1(末尾空行) = **965** ✔
- **最大新文件 T4 ≈170 行 ≪ 800**；观察带（>500）**无新增**（现有 14 个不含任何新文件）。
- **门禁预期**：GodFile **3 → 2**；未分层 **44 → 43**；扫描文件 **96 → 106**；`layerViolations` 恒 **0**；SCC 恒 **0**。

### 6.3 两个 barrel 的汇总导出（导出面 = 今日实测 17 名，**8 + 9 二分，一个不多一个不少**）

今日导出面（AST + 正则双算，**17** 个）：`isStudentVisibleToTeacher` `getSubmissions` `getReviewQuestions` `getSubmissionDetail` `regradeSubmission` `updateScore` `reviewSubmission` `batchReview` `batchPublish` `publishScores` `getReviewSummary` `getReviewByClass` `exportReviewData` `getProjectReview` `reviewProjectSubmission` `getQuestionPromptPreview` `getSubmissionPrompt`

```js
// T6 · server/src/interface/http/controllers/review/index.js（新建；相对路径写全 .js）
export { resolveVisibleClassScope } from './class-scope.js';   // ★私有名，见下方警告
export { getSubmissions, getReviewQuestions } from './list.js';
export { batchReview, batchPublish, publishScores } from './batch.js';
export { getReviewSummary, getReviewByClass } from './summary.js';
export { exportReviewData } from './export.js';
```
```js
// T11 · server/src/infrastructure/review/index.js（新建）
export { isStudentVisibleToTeacher } from './scope.js';
export { getSubmissionDetail, regradeSubmission, updateScore, reviewSubmission } from './submission.js';
export { getProjectReview, reviewProjectSubmission } from './project.js';
export { getQuestionPromptPreview, getSubmissionPrompt } from './prompts.js';
```
- **★ 警告（barrel 的导出面纪律）**：`check-layers` 与 `cycle-check` 对 `export { … } from` **完全不可见**（F4），**`bind-check` 是唯一能验它的门禁**。因此两个 barrel **只允许**导出上表列出的名字：**T6 只导出 8 个（其中 `resolveVisibleClassScope` 是「同层跨文件共享所需」的例外，见下），T11 只导出 9 个**。**不得**用 `export * from`（`bind-check.mjs:22` 的已知盲区）。
  - 例外说明：`list.js`/`summary.js`/`export.js` 需要 `resolveVisibleClassScope` ⇒ T1 必须 `export` 它。它是**新增的第 18 个模块级导出名**，但它**不出现在 I1 的 `review.*` 契约面里**（I1 只取那 16 个 handler + 不用 `resolveVisibleClassScope`），故 **HTTP 契约面仍是 17 名**。C 的 `Object.keys` 对拍需按「T6 ∪ T11 的 17 名」判定，并**显式允许 T1 多出的这 1 个内部名**（§11-V8）。
- 命名对齐既有层内文件（kebab-case / 语义名）：`class-scope` `list` `batch` `summary` `export` `scope` `submission` `project` `prompts`。`interface/http/controllers/review/` 与 `infrastructure/review/` 均为**新建目录**（`find` 实测不存在；`server/src/interface/` 今日**只有 README.md、0 个 .js**）。

### 6.4 import 重排清单（唯一允许「不逐字」的行 → 由 §1.2 的引用扫描器**自动推导**，非人工列举）

| 目标文件 | 新 import 行 |
|---|---|
| **T1** `class-scope.js` | `import { getVisibleClassIds } from '../../../../controllers/teamController.js';` |
| **T2** `list.js` | `import prisma from '../../../../utils/prisma.js';` / `import logger from '../../../../utils/logger.js';` / `import { getVisibleClassIds } from '../../../../controllers/teamController.js';` / `import { resolveVisibleClassScope } from './class-scope.js';` |
| **T3** `batch.js` | `import prisma from '../../../../utils/prisma.js';` / `import logger from '../../../../utils/logger.js';` / `import { getVisibleClassIds } from '../../../../controllers/teamController.js';` |
| **T4** `summary.js` | `import prisma from '../../../../utils/prisma.js';` / `import logger from '../../../../utils/logger.js';` / `import { ABNORMAL_FEEDBACK } from '../../../../constants.js';` / `import { getVisibleClassIds } from '../../../../controllers/teamController.js';` / `import { resolveVisibleClassScope } from './class-scope.js';` |
| **T5** `export.js` | `import prisma from '../../../../utils/prisma.js';` / `import logger from '../../../../utils/logger.js';` / `import { resolveVisibleClassScope } from './class-scope.js';` |
| **T6** `index.js` | 无 import，仅 5 行 re-export（§6.3） |
| **T7** `scope.js` | `import prisma from '../../utils/prisma.js';` / `import { getVisibleClassIds } from '../../controllers/teamController.js';` |
| **T8** `submission.js` | `import prisma from '../../utils/prisma.js';` / `import logger from '../../utils/logger.js';` / `import { loadVisibleSubmission, sendScopeError } from './scope.js';` |
| **T9** `project.js` | `import fs from 'fs';` / `import path from 'path';` / `import prisma from '../../utils/prisma.js';` / `import logger from '../../utils/logger.js';` / `import { parseProjectAnswer, toTeacherView } from '../../utils/projectView.js';` / `import { submissionDir, standardDir, ROOT } from '../../utils/projectPaths.js';` / `import { readProjectTree } from '../../utils/projectFiles.js';` / `import { isStudentVisibleToTeacher } from './scope.js';` |
| **T10** `prompts.js` | `import prisma from '../../utils/prisma.js';` / `import logger from '../../utils/logger.js';` / `import { buildSystemPrompt, buildGradingUserMessage } from '../ai/prompt-builder.js';` / `import { loadVisibleSubmission, sendScopeError } from './scope.js';` |
| **T11** `index.js` | 无 import，仅 4 行 re-export（§6.3） |
| **I1** `routes/teacher.js` | `:5` 一行 → 三行：`import * as reviewHttp from '../interface/http/controllers/review/index.js';` / `import * as reviewIo from '../infrastructure/review/index.js';` / `const review = { ...reviewHttp, ...reviewIo };` （**其余 16 行路由声明体逐字不动**） |
| **I2** `projectReviewController.js` | `:18` `from './reviewController.js'` → `from '../infrastructure/review/scope.js'` |

- **绑定完备性保证**：上表由脚本对「声明 → 引用」关系求闭包后生成（`/tmp/rc-imports.cjs` 的 11 条 import × 17 个绑定的引用计数），**实测 0 个零引用绑定**（无 step 3 那种 `getModel` 死绑定），因而**每一条被搬走的绑定都有归属、没有需要人工补回的例外**。
- **边保持性**：今日 8 条相对出边（prisma / logger / constants / teamController / projectView / projectPaths / projectFiles / prompt-builder）**全部保留**，只换宿主；**不新增任何第三方依赖**（新增的只有 `fs`/`path` 这两条既有外部边随 S20 迁移）。`cycle-check` 相对边数预估 214 − 8(源文件) + ≈30(新文件) + 1(I1 的 3 行里 2 条 import 减去原 1 条) ≈ **237**（**不作判据**，仅供 C 参考；barrel 的 re-export **不计边**）。

### 6.5 ★ lint 判据 (b) 的迁移效应（本步**唯一**一处必须由 Captain 裁定的门禁交互）

**事实链（全部实测）**：
1. `docs/pipeline/lint-baseline.json` 共 **31** 条，其中**本文件正好占 1 条**：`{file:"server/src/controllers/reviewController.js", line:354, rule:"no-unused-vars", symbol:"count"}`。
2. `lint-check.mjs:539-548` 的**比对键 = `file + '\u0000' + rule + '\u0000' + symbol`**（`:543`），行号**有意不参与键**（`:536` 注释：「行号漂移不算新违规」）。
3. `batchReview`（含死变量 `count`）搬进 T3 后，该违规的 `file` 键从 `server/src/controllers/reviewController.js` 变为 `server/src/interface/http/controllers/review/batch.js` ⇒ 旧键 `resolved`(delta 1)、**新键 `fresh`(delta 1)** ⇒ `lint-check.mjs:645` `verdict = FAIL`、`exit 1` ⇒ **DoD §5-5(b) 不达标**。

**三个可选处置（★ 请 Captain 裁决，我推荐 D1）**：

| 选项 | 做法 | 代价 / 风险 | 判据影响 |
|---|---|---|---|
| **D1（推荐）** | **逐字搬移不动 `count`**；本步显式执行一次**单条迁移刷新** `node scripts/gates/lint-check.mjs --update-baseline`，并在 `*-refactor.md` 里逐字登记：刷新前后**总条数 31 → 31（不减不增）**，且 `--json` 的 `resolved` 恰为 1 条（旧 file）/`fresh` 恰为 1 条（新 file），**rule 与 symbol 完全相同（`no-unused-vars` / `count`）** ⇒ 证明是**同一处缺陷换了宿主**，不是新增缺陷 | 需 Captain 明确授权（DoD 原话「`--update-baseline` 不是消红按钮」）；**C 必须用 `--json` 的三元组做等价性举证**，仅凭 exit 0 不算过 | 31 → 31；exit 0 |
| **D2（保守）** | 保持 31 条**零刷新**：把死变量 `count` 一并删除（`:354` 与 `:365` 两行，**已实证只写不读**：唯一读取点 `:367` 用的是 `reviewedStudentIds.size`） ⇒ 新文件无违规、旧键 `resolved` ⇒ `fresh=[]` ⇒ **exit 0，无需刷新** | 破了「逐字搬移」：25 个搬移块里**恰有 1 块**（`batchReview`）与源字节不等 ⇒ §7.3⑥ 的切片判等**必须豁免该块并显式登记**；且属「同一提交里顺手改代码」（plan §6 明令禁止）。ESLint warn 59 → **58**（更好，但同样属改代码） | 31 → 30（只减不增）；exit 0 |
| **D3** | 让 `batchReview` **留在源文件**（源文件做成「barrel + 一个 handler」的混合体） | 源文件仍是 unlayered ⇒ 未分层恒 44（**不降**，与 step1/3/4 的既有惯例不一致）；且这是**纯粹为讨好一个 lint 键而扭曲模块划分** ⇒ **我已否决**（登记以示考虑过） | 31 → 31；exit 0 |

**★★ Captain 更新（2026-10-11 13:40）：本例外已作废 —— 无需任何特批，判据 (b) 按常规口径即可通过。**

原因：Captain 已让门禁具备**「迁移识别」**能力（提交 95e4a24）：把「resolved 与 fresh 的 **rule + symbol + 规范化行文本**完全相同且数量一一相等」判为**迁移**（报「已迁移 N 条」，不判违规）。
并已把**基线升级为带 `text` 指纹**（31 → 31 的纯格式升级：丢失 0、新增 0、31 条获得 text 字段、升级后仍 exit 0）。
⇒ **本步的 `count` 搬迁将被自动识别为迁移，`lint-check` 直接 exit 0，不需要刷新基线、也不需要 Captain 开特例。**

装置改进的十场景实测（含 fail-closed 与混合场景）与「不会误放」清单见 `docs/pipeline/lint-gate-migration.md`；
⚠️ **更正（C 的独立验证纠正 Captain）**：本条曾写「有 2 条行号漂移、是基线记错被修正」，**该说法不成立**。
直接比对 d20ab83（引入基线的提交）与本次：deepseek-gateway.js 的三条 no-unused-vars/controller **一直就是 line 69/125/177**，本次对 line **零改动**；
`file+rule+symbol+line` 多重集**完全相同**，唯一变化是 text 字段 0 → 31 条。
原始记述源于 **Captain 比对脚本的缺陷**（两条共享同一 file+rule+symbol，用 `find()` 取首个匹配 ⇒ 两条都去与 line 69 比）。
**教训：多重集比较必须按 (file,rule,symbol,line) 排序后逐项比，不得用 `find()` 配对。**

**以下原裁决（含四条硬条件）已失效，仅作决策留痕：**

**★ Captain 裁决（2026-10-11 13:15）：批准 D1，附四条硬条件。**

批准理由（记录在案，供后续同类情形复用）：**基线的作用是拦「新增缺陷」，而搬迁不是新增缺陷** —— 同一处既有缺陷换了宿主而已。且「逐字搬移」是本步覆盖 Z1/Z3/Z4 那 140+ 行零覆盖代码的**唯一**验证手段，为一个 lint 键放弃它不划算（与 `arch-metrics` 的 P1-4 基线刷新同构）。

**四条硬条件（缺一不可）**：
1. **`count` 必须逐字搬移**（`:354` 的 `let count = 0;` 与 `:365` 的 `count = toReview.length;` 原样，含行内空格）—— 不得顺手删除、改名或改用例；
2. 刷新**只允许这一次、只允许这一条**，且必须由 **C 独立跑 `--json` 举证三元组**：刷新前后总条数 **31 → 31**，`resolved` 恰 1（旧 file）、`fresh` 恰 1（新 file），且 **rule 与 symbol 完全相同**（`no-unused-vars` / `count`）；
3. **只凭 exit 0 不算过** —— 没有三元组等价的举证，本步判 FAIL；
4. 该刷新必须在 `*-refactor.md` 里**逐字登记**（刷新命令、前后条数、resolved/fresh 明细）。

**★ 并行装置改进（避免 step 9 再开一次口子）**：`teacherController.js` 也有 **3 条**同类基线项，若不做装置改进，step 9 还得再批一次特例。
⇒ 已另行派单改进 `scripts/gates/lint-check.mjs`：把「resolved 与 fresh 的 **rule + symbol + 规范化代码文本**完全相同」识别为**迁移**（报告为「已迁移 N 条」，不判违规）。
该改进必须**向收窄假阳性方向**走 —— **真正的新违规必须仍然失败** —— 并自带正控，由 C 独立验证。
**在该改进落地前，本步仍按上述 D1 四条硬条件执行。**

**D1 与 D2 的取舍建议（A 原建议，已采纳）**：**选 D1**。理由：① 「逐字搬移」是本步**唯一**能覆盖 Z1/Z3/Z4 那 140+ 行零覆盖代码的验证手段（§7.3⑥），用它去换一个 lint 键不值得；② 该缺陷**不是本步引入的**，只是**按授权搬迁**（与 `arch-metrics` 的 P1-4 基线刷新同构）；③ DoD 的禁令针对「用 `--update-baseline` 抹掉**新**缺陷」，而本条是**同 rule 同 symbol 的路径位移**，可被 `--json` 机器证明。

---

## 7 护航与对拍配方

### 7.1 C 的三桩（**两侧逐字相同地施加**；这是「硬禁网」的技术保证）

本文件**无外部 HTTP**（不 import axios、不调 `fetch`；AI 调用已下沉到 `ReviewUseCases`/`deepseek-gateway`，本文件只经 `req.app.locals`），但**三桩仍然全上** —— 因为依赖链会拉起 `compose.js` → `deepseek-gateway` → 全局 `fetch`：

| 桩 | 接法 | 为什么必须 |
|---|---|---|
| **S-A 网络桩** | 探针**第一行**（早于任何 `import` 被测模块）执行 `globalThis.fetch = (url, opts) => { fetchLog.push({url:String(url), body: String(opts?.body ?? '')}); return Promise.resolve({ ok:false, status:599, json: async()=>({}), text: async()=>'' }); };`，并叠保险 `process.env.DEEPSEEK_BASE_URL='http://127.0.0.1:9'` | 本文件自身不出网，但 `req.app.locals.reviewUseCases` 的替身若被换成真实 `compose.js` 产物就会出网。**桩必须在 import 前装好**，且**只允许走桩**（探针结束断言 `fetchLog.length === 0` 或每一条都指向 `127.0.0.1:9`） |
| **S-B DB 桩（prisma 内存替身）** | 在两侧副本里用**同一份**内存替身覆盖 `server/src/utils/prisma.js`，必须实现本文件 + `getVisibleClassIds` 的**全部 11 个方法**：`submission.{findUnique,findMany,count,update,updateMany,$transaction}` · `studentClass.{findMany,findFirst}` · `class.findMany` · `assignment.findUnique` · `subQuestion.findMany` · `question.findUnique` · **`teacherClass.findMany` · `teamTeacher.findMany` · `teamClass.findMany`（`teamController.js:192-204` 的可见集计算必需，漏一个就整条 403/500 失真）**；并导出 `__db / __log / __reset`，`update/updateMany/$transaction` 深拷贝入参后记入 `__log` | 真库会让对拍非确定（且要 seed）；`$transaction` 是 `batchReview` 的唯一写入路径，**必须实现为「按序执行 + 记录」**（`prisma.$transaction(arrayOfPromises)` 的语义：入参是**已被调用的 Promise 数组**） |
| **S-C 时钟桩** | `const F=1760000000000; const RD=Date; globalThis.Date = class extends RD { constructor(...a){ super(...(a.length?a:[F])); } static now(){ return F; } };` | `batchReview:362` 写 `reviewedAt:new Date()`、`reviewProjectSubmission:870` 写 `reviewedAt:new Date()` 会进终态 DB ⇒ 不冻结则**边界必然不等** |

**另需两个「非三桩」替身（本文件特有，必须两侧相同）**：
- **`req/res` 探针**：最小 `res` = `{ statusCode:null, _status(c){this.statusCode=c;return this;}, status(c){return this._status(c);}, json(b){ this.body=b; return this; } }`（Express 的 `res.status(x).json(y)` 链式调用必须复刻）；`req` = `{ user:{id:…}, params:…, query:…, body:…, app:{ locals:{ reviewUseCases: <记录型替身> } } }`。**探针必须断言「同一个 handler 只调用了一次 `json`」**（防止拆分把某条分支变成双写）。
- **`reviewUseCases` 替身**：`{ regrade: async (cmd)=>({aiScore:…, aiFeedback:…}), manualAdjust: async (cmd)=>…, review: async (cmd)=>… }`，把 `cmd` 原样记入 `__log`；并可指定 `throw Object.assign(new Error('提交不存在'),{name:'EntityNotFoundError'})` 来打靶 `:275-276` / `:295-296` 的近不可达分支（**这是 Z7/Z8 唯一可打靶的方式**）。

### 7.2 两独立进程 + 四维对拍（改前 vs 改后）

```bash
cd "<repo>"
ANCHOR=$(git rev-parse HEAD)        # ← 本方案实测 = 1b713b83746e1238a9a72ef38831bc877dc02560
rm -rf /tmp/splitA-before /tmp/splitA-after && mkdir -p /tmp/splitA-before
git archive "$ANCHOR" server | tar -x -C /tmp/splitA-before
ln -s "<repo>/node_modules" /tmp/splitA-before/node_modules
shasum -a 256 /tmp/splitA-before/server/src/controllers/reviewController.js   # 前置断言 == 62ec56ed…
cp -R "<repo>/server" /tmp/splitA-after/server                                # 改后树
ln -s "<repo>/node_modules" /tmp/splitA-after/node_modules
```
> ★ `projectPaths.js:7` 的 `ROOT` 由**模块自身位置**推出（`server/`）⇒ 两侧的 `uploads/` 分别落在 `/tmp/splitA-{before,after}/server/uploads`，**夹具目录可以任意造，绝不写进仓库**。两侧夹具的 `questionId`/`studentId`/`version` **必须同一组数字**（响应体里不含绝对路径，故无需归一化；仍建议把 `/tmp/splitA-*` 替换为 `<TREE>` 作保险）。

```bash
PORT=0 node /tmp/splitA-probe/run.mjs /tmp/splitA-before/server/src/controllers/reviewController.js /tmp/splitA-fix out/before1.json
PORT=0 node /tmp/splitA-probe/run.mjs /tmp/splitA-before/server/src/controllers/reviewController.js /tmp/splitA-fix out/before2.json   # 装置自检
PORT=0 node /tmp/splitA-probe/run.mjs /tmp/splitA-after/server/src/interface/http/controllers/review/index.js                                        /tmp/splitA-after/server/src/infrastructure/review/index.js      /tmp/splitA-fix out/after1.json
cmp out/before1.json out/before2.json    # 必须相等，否则装置不确定 ⇒ 判负
cmp out/before1.json out/after1.json     # 唯一允许的差异：模块 basename 字段（建议干脆不带）
```
**每个 case 的 JSON 必须含 4 个维度**（**任务书要求「返值 + 终态 DB + 有序调用日志 + fetch 请求体」四维，逐条对应**）：
1. **返值**：`{status: res.statusCode, body: res.body}` —— **逐字节**（含键序：用 `JSON.stringify` 的插入序，不要 `sort`，因为 §1.4-4 的「无 message」形状本身就是契约）。
2. **终态 DB**：`JSON.parse(JSON.stringify(__db))` 快照（`batchReview`/`batchPublish`/`publishScores`/`reviewProjectSubmission` 的写入态）。
3. **有序调用日志**：`__log`（每次 prisma 操作的 `{model, op, args}` **按序**）—— 只比返回值会漏掉「同一结果、不同写序」的漂移（`batchReview` 的 `$transaction` 内部顺序、`getReviewSummary` 的 N+1 查询顺序）。
4. **fetch 请求体**：`fetchLog`（本文件应恒为 **0 条**；非 0 即说明探针误接了真实网关 ⇒ 如实记录并判负）。

### 7.3 夹具矩阵（C 自建，**不复用 B 的脚本**）

| # | 夹具 / 探针 | 打靶的段落 / 零覆盖分支 |
|---|---|---|
| F01 | `getSubmissions`：无参 / `schoolId` / 不可见 `classId` / `questionId` / `assignmentId` / `status` 单值 / `status` 逗号多值 / `page,pageSize` 边界（0、负数、超大） | S1 S2 S8 + **Z9**（`enrichWithSchool` 早退：造一条 `student:null` 的提交） |
| F02 | `isStudentVisibleToTeacher` 直调（`from scope.js`）：命中 / 不命中 / **零可见班级** | S3 + **Z10** |
| F03 | `loadVisibleSubmission` 直调：`id=0` / `-1` / `1.5` / `'abc'` / 不存在 / 不可见 / 可见 | S4 + **Z15** |
| F04 | `filterRejectedSubmissionIds` 直调：全合法可见 / 混入非法 / **全部非法** / **零可见班级** / 重复 id | S6 + **Z13** |
| F05 | `resolveVisibleClassScope` 直调：`schoolId` ∈ {undefined,null,'',0,'abc',小数,合法} × `classId` ∈ {undefined,null,'',不可见,可见} | S7 + **Z14** |
| F06 | `getReviewQuestions`：**零学生班级**（打 `:208`）/ 正常 / 不可见 classId | S9 + **Z11** |
| F07 | `getSubmissionDetail`：可见 / 不可见 / 不存在 / 非法 id（**四态全打**） | S10（已有测试覆盖，作为回归基线） |
| F08 | **`reviewUseCases` 替身三态**：resolve / reject(EntityNotFoundError) / 不调用 | S11 S12 S13 + **Z7 Z8** |
| F09 | `batchReview`：正常 / 缺 schoolId / 非法 classId / 不可见 classId / **practice 模式** / 无 `ai_graded`（count=0 早退） | S14 + **Z5** + `:354-366` 的 `count` 死变量路径 |
| F10 | `batchPublish`：正常 / 缺 schoolId / 非法 classId / **practice 模式** / 全非 reviewed（零写入） | S15 + **Z6** |
| F11 | `publishScores`：正常 / **缺字段** / **空数组** / 全不可见 / 混入不可见 / 混入非法 id | S16 + **Z12** |
| F12 | `getReviewSummary`：非法 schoolId（abc/0/小数/空）→ `{code:0,data:[]}` / classId 可见 / classId 不可见 / `deletedAt` 非空作业 / draft 不计已交 / `ABNORMAL_FEEDBACK` 命中 / practice 行的 `reviewPending↔aiCompleted` 互换 | S17（**N+1 查询顺序**也在维度 3 里比对） |
| F13 | `getReviewByClass`：`filter` 四态（submitted/not_submitted/pending_review/abnormal）/ `sortField+sortOrder` 升降序（**含 string vs number 两条 `localeCompare` 分支**）/ `keyword` 过滤 / 未提交行的 `ns-` 前缀 id / `projectSubmissionId` 透出 | S18 |
| F14 | `exportReviewData`：**客观题四型**（choice/multi_choice/judge/fill，含多选题「多选/少选」与 fill「逗号+小写」等价类）/ **主观题整题分** / 缺参 400 / 非法 assignmentId 400 / 不可见 403 / 全未提交 → `totalScore:null` | S19 + **Z1**（`scoreItem` 4 分支） |
| F15 | `getProjectReview`：`question.type!=='project'` → 400 / 不存在 → 404 / `assignment.teacherId` 不匹配 → 403 / 学生不可见 → 403 / **200 无标准包** / **200 有标准包（新目录）** / **200 标准包走历史 `attachmentUrl`** / **`aiFeedback` 非法 JSON → `{overallComment}`** / `currentVersion=0`（`version` falsy → 空文件树） | S20 S21 + **Z2 Z3** |
| F16 | `reviewProjectSubmission`：403 双态 / 404 / 400 / **200 分值钳制三态（负数、超 max、`'abc'`→NaN）** / **不传 finalScore** / **不传 teacherFeedback（有既有值/无既有值）** / **显式空串** | S22 + **Z4** |
| F17 | `getQuestionPromptPreview`：不存在 → 404 / 非 owner → 403 / 无 `scoringCriteria` / 无 `subQuestions`（空数组） / `material` 空 / **逐字节比 `system`/`user`** | S23 |
| F18 | `getSubmissionPrompt`：守卫三态 / `type==='project'` → 400 / `type` 缺失（`:945` 的 `sub.question?.type &&` 短路）/ `subQuestion` 缺失回退 `subQuestions[0]` / 两者都缺失（`{}` 兜底） / **逐字节比 `system`/`user`** | S24 |

### 7.4 装置自检 + 反证（缺任一条即判负）

- **自检 1**：`before` 连跑两次 `cmp` 必须相等。
- **自检 2（防假绿）**：F14 必须真的产出**非 null 的客观题 `cellScores[].score`**（证明 `scoreItem` 真在跑，而不是全走主观题分支）；F15 的「有标准包」夹具必须让 `standardFiles.tree.length > 0`（证明 S20 的 `:771` 分支真命中）；F08 的 reject 夹具必须命中 `404/1004`（证明替身真被调用）。
- **自检 3（守门员必须真的守门）**：F07/F15/F16 的 403 夹具必须**逐字**命中 `{code:1003, message:'无权访问该提交'|'无权操作', data:null}` —— 若拆错层导致守卫被旁路，这一条会立刻红。
- **反证（必须有分辨力）**：在 `/tmp/splitA-after` 复制一份，注入 3 处变异 —— ① `batchReview:362` 的 `isProject ? (s.teacherFeedback || '') : (s.aiFeedback || '')` 三元互换；② `reviewProjectSubmission:873` 的 `Math.max(0, Math.min(max, Number(finalScore)))` → `Number(finalScore)`；③ `getReviewSummary:502` 的 `reviewPending: isPractice ? 0 : reviewPending` → `reviewPending`。确认 `cmp` **报差异**；不报 = 恒等装置，判负。

### 7.5 逐字搬移的静态判等（覆盖夹具打不到的分支）

```bash
node /tmp/splitA-probe/slice-equal.mjs   # C 自建：从改前/改后两侧按「JSDoc + 声明」切块，逐块 sha256 对拍
# 期望：25 块（24 顶层 + 1 嵌套 scoreItem）逐块 sha256 完全相同（= 0 处改写）
#   —— 若 Captain 选 D2，则显式豁免 batchReview 1 块并登记「删 2 行死变量」
# 反向校验：11 个目标文件的每个非空白字节，只能是 banner / import 行 / export 行 / 源切片之一，
#   剩余未匹配字节必须为 0（banner 与 import/export 块由 C 独立识别，不采信 B 的清单）
```
（可行性前提：§10 要求**不得在声明行加/改 `export`**，跨模块暴露一律用文件末尾 `export { … };` 块 ⇒ 25 块可与源文件逐字节相等。）

---

## 8 风险分级

| # | 搬移单元 | 等级 | 理由（依赖复杂度 / 测试覆盖 / 是否在越权守卫链路 / 外部副作用） |
|---|---|---|---|
| **R1** | **T1 `class-scope.js`**（interface，24 行） | **中** | 极短，但**被 3 个 handler 共享**（t6 全部三条路由的 403 判定都经它）；**Z14 四个等价类未逐态打靶** ⇒ 一行的归一条件改动就是跨校可读。**风险与行数不成正比，是本步最高的「单位行数风险」** |
| **R2** | **T2 `list.js`**（interface，90 行） | **低** | 纯读；`getSubmissions` 有全仓最密的测试（t2 10 例 + qa-batch1 + review.test）；仅 **Z9** 一个零覆盖分支 |
| **R3** | **T3 `batch.js`**（interface，155 行） | **中** | 含 `$transaction` 批量写 + **`count` 死变量（lint 键，§6.5）**；**Z5/Z6/Z12 三个 400 分支零覆盖**；但正例/反例都全（t4/t5/t6 共 20+ 例） |
| **R4** | **T4 `summary.js`**（interface，160 行） | **中低** | `getReviewSummary` 是侧栏徽标数据源（**N+1 查询，顺序敏感**）且与 `teacherController:427-433` 有口径同步契约（仅注释登记）；测试最密（6 个套件 ~90 例）；**响应体无 `message`** 这个非标准形状易被「顺手补齐」 |
| **R5** | **T5 `export.js`**（interface，154 行） | **中高** | `exportReviewData` 是全文件最长 handler + **唯一含业务判分逻辑（`scoreItem`）**；**Z1 24 行 4 分支零覆盖**；正例只走主观题分支 ⇒ **是「有测试但测试打不到关键代码」的典型**；且响应体无 `message` |
| **R6** | **T6 `interface/.../index.js`**（barrel，13 行） | **高（硬失败点）** | 8 行 re-export，**`check-layers`/`cycle-check` 对它完全不可见**（F4）⇒ 写错路径/漏名**只能靠 bind-check + 运行期 `Object.keys` 对拍**兜住；`export *` 会让 bind-check 也失明 |
| **R7** | **T7 `scope.js`**（infra，57 行） | **高** | **全部 12 个 infra 单元的公共根**；被 I2（`projectReviewController` 的 3 个守卫点）跨文件消费 ⇒ 改名/移位影响 3 条越权防线 + 4 条本文件防线；`isStudentVisibleToTeacher` 有 **Z10** 零覆盖分支 |
| **R8** | **T8 `submission.js`**（infra，91 行） | **中** | 4 个 handler，其中 3 个（regrade/updateScore/review）**已下沉用例层**，controller 只剩守卫 + 翻译 ⇒ 逻辑面小；但 **Z7/Z8 两个 404 分支零覆盖**（近乎不可达） |
| **R9** | **T9 `project.js`**（infra，134 行） | **高** | **唯一含文件系统 IO（`fs.existsSync` + `readProjectTree`）**；**Z2/Z3/Z4 三处零覆盖合计 130 行**（`getProjectReview` 200 路径 + `reviewProjectSubmission` 200 路径全部无断言）；且 `reviewProjectSubmission` 含**分值钳制**与 **R3 评语不回退 AI** 两条业务不变量 |
| **R10** | **T10 `prompts.js`**（infra，74 行） | **中** | 唯一 import `infrastructure/ai/prompt-builder.js` 的搬移单元（**它决定了整个落层拓扑**）；两个 endpoint 的**字节级输出**被 prompt-preview/t6/t7 共 7 例覆盖（较全）；风险主要在**路径写错**（`../ai/prompt-builder.js` 少一层） |
| **R11** | **T11 `infrastructure/review/index.js`**（barrel，14 行） | **高（硬失败点）** | 同 R6（9 名）；且它是 **I1 合并的第一个操作数**，漏名会让 16 条路由中的若干条在**首访时**才 500 |
| **R12** | **I1 `routes/teacher.js` 的 3 行改写** | **高** | 唯一触及**路由表**的改动；`{...reviewHttp, ...reviewIo}` 若两名重叠即**静默遮蔽**（本方案已证两组名不交：8 ∩ 9 = ∅）；必须用 `Object.keys` 对拍而非肉眼看 |
| **R13** | **I2 `projectReviewController.js:18` 改路径** | **中** | 单名 1 行，但**服务 3 处越权守卫**（`:109` `:181` `:291`）；bind-check 可静态拦住错名 |
| **R14** | **删除源文件** | **高** | 一步影响 2 个 import 站点 + **传递加载它的 ~20 个集成套件**；必须与 T6/T11 + I1/I2 **同一提交**；删除后 `grep -rn 'controllers/reviewController.js'` 必须为 0 |
| **R15** | **lint 基线迁移（§6.5-D1）** | **中** | 需 Captain 授权 + C 的三元组举证；不加控制会被误读为「用 `--update-baseline` 消红」 |
| **R16** | 未分层 44 → 43 / GodFile 3 → 2 | **低** | 由构造保证；`arch-metrics` 判据是「不劣于基线」（`arch-metrics.mjs:75-76`），**下降不会被判劣化** |

**顺序建议（给 B）**：**先做 B0 补测（§5.3，独立提交）** → T1 → T7 → T2 → T3 → T4 → T5 → T8 → T9 → T10 → **先建 T6/T11 两个 barrel 并跑 bind-check** → I2 → I1 → **最后删源文件** → 过 lint（§6.5）与门禁五连。每段完成后立即 `node --check` **并真 `import` 一次**（`node --check` 不校验跨模块绑定）。

---

## 9 分批建议（每批可独立提交、各自过 DoD）

**先说结论**：本文件**一次性拆到底在技术上可行**（直接 import 站点只有 2 个、**无 jest mock 单点故障**、17 个绑定零死绑定、13/16 条路由有双向断言），但有两处**必须隔离**：① **Z1/Z3/Z4 的 140+ 行零覆盖代码**（T5/T9）；② **R7 `scope.js` 被跨文件消费**。⇒ **建议分 3 批 + 1 个前置补测批**。中间态采用**门面（facade）**：源文件保留为 `controllers/reviewController.js`，只把已迁出的名字改为 `export { … } from …` 再导出 ⇒ **导出面对外逐字不变，I1/I2 在前两批完全不用改，全部集成套件原样跑**。

| 批 | 动作 | 触及文件 | 完成后指标 | 该批的自证判据 |
|---|---|---|---|---|
| **B0（前置）** | 按 §5.3 补 T-A/T-B/T-C/T-D 四组契约测试（约 15 例） | 2–4 新建测试文件 | 用例数 **增**（属预期，plan §6-R5）；GodFile/未分层**不变** | 全量 `0 failed`；新增用例**先红后绿**（先写断言、在改前树上确认能失败再让它过——**不得**为迁就实现改断言） |
| **B1** | 建 `interface/http/controllers/review/`，落 **T1 + T2 + T3 + T4 + T5**；源文件删去对应区间，改为 5 行 re-export（+ 补 `resolveVisibleClassScope` 与 `getVisibleClassIds`/prisma/logger 的残留 import） | 5 新建 + 1 改 | 源文件 965 → **≈300**（仍未 <800 ⇒ GodFile **3** 不变）；未分层 **44** 不变；违规 0 | ① 25 块切片判等（只校 B1 的 12 块）② **F01–F14** 对拍 byte-identical ③ 装置自检 + 变异反证 ④ `check-layers` 违规 0 ⑤ `git diff --stat server/test` **零改动** |
| **B2** | 建 `infrastructure/review/`，落 **T7 + T8 + T9 + T10**；源文件继续 re-export 出 `isStudentVisibleToTeacher`/`getSubmissionDetail`/…/ `getSubmissionPrompt` 9 名 | 4 新建 + 1 改 | 源文件 ≈300 → **≈120**（**< 800**）⇒ **GodFile 3 → 2**；未分层 44 不变；违规 0 | ① 切片判等补齐 4 个文件 ② **F02–F05 + F15–F18** 对拍（含 S20 的 fs 分支）③ 门禁三连 + eslint/lint-check 读数不变 |
| **B3** | 建 **T6 + T11** 两个 barrel；改 **I1/I2**；**删除源文件**；处理 **§6.5 的 lint 迁移（D1）** | 2 新建 + 2 改 + 1 删 | **未分层 44 → 43**；GodFile **2**；违规 0；SCC 0；lint(a) 0 error/59 warn；lint(b) exit 0（31→31） | ① 25/25 块切片判等 + 反向「多余字节 = 0」② `T6∪T11` 的 17 名与改前 `Object.keys` **逐字相等** ③ `bind-check` 违规 0 ④ 全量回归 0 failed ⑤ `grep -rn 'controllers/reviewController.js' server/src server/test` = **0** |

**每批的 DoD（复用 plan §5，server 侧 5 条 + 两道 lint + 本方案补充）**：① `node server/scripts/check-layers.mjs` → 违规 0 且未分层不增（B3 后 **43**）；② `node scripts/gates/cycle-check.mjs` → **SCC 0**；③ `node scripts/gates/hard-metrics.mjs` → 0/0/0（只扫 client，应逐字不变）；④ `node scripts/gates/bind-check.mjs` → 违规 0；⑤ `node scripts/gates/arch-metrics.mjs` → PASS（B2 后 GodFile 2，**需按 P1-4 刷新基线** 3→2；B3 后未分层 44→43 同样刷新）；⑥ **两道 lint**：`./node_modules/.bin/eslint client/src server/src` → **error 0 / warn ≤ 59**（实测当前恰为 59，**零余量**）；`node scripts/gates/lint-check.mjs` → **exit 0**（§6.5-D1 的一次性迁移刷新仅限 B3，且须逐字登记）；⑦ `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → 4 处 `Test Suites:`、**0 failed**、套件/用例数**如实记录**；⑧ 行为对拍 byte-identical（§7）；⑨ 每批一个提交，消息含「拆分前 `file:line` 范围 + 落层目标 + 验证结果」。

**若 Captain 判定「一次拆到底」**：跳过门面，**B0 仍必须先做**；然后一次性建 11 个文件 + 删源 + 改 I1/I2 + 单提交；判据不变（§7 全量对拍 + 25 块切片判等 + 门禁五连 + 两道 lint + 全量回归）。

---

## 10 给 Agent B 的逐字搬移指令

**总则（不可协商）**
1. **只改 §6.2 的 11 个新建文件 + §6.4 的 I1/I2 两个站点**（分批执行时外加源文件的门面改写与最终删除）。**不得**碰 `scripts/gates/*`、`server/scripts/*`、`server/test/` 的**断言**、`client/**`、`tests/`、`server/logs`、`server/package.json`、`docs/pipeline/lint-baseline.json`（**该文件只能由 Captain 授权的 `--update-baseline` 生成，不得手改**）。
2. **搬移 = 按 §6.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角括号、`：`、`——`、`…`、空格数量、空行位置）。**空行不搬**（各目标文件自带 banner 与一行空行）。
3. **不得在任何声明行加/改/删 `export`**（会破坏 §7.5 的 25 块切片判等）。源文件里本来就带 `export` 的 **17 个函数**照原样带；其余跨模块暴露一律用**文件末尾单个 `export { … };` 块**（T1 的 `resolveVisibleClassScope` 是唯一新增的内部名，见 §6.3）。
4. 每个新文件顶部加 3–4 行 banner，**固定格式**（便于 C 机械核对）：
```
/**
 * <文件名> —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：<interface|infrastructure>（落层依据见 docs/split/reviewController-plan.md §2）。
 */
```
5. **不要写 smoke test 脚本、不要新增/修改任何测试文件**（B0 的补测与 C 的探针都不是你的职责；若 Captain 把 B0 派给你，则 B0 **必须独立成一个先行的提交**）。
6. **保留全部死代码 / 既有不一致**：`batchReview` 的 `count` 死变量（`:354` `:365`，**逐字带**，见 §6.5）；`getReviewSummary`/`getReviewByClass`/`exportReviewData` 的**无 `message` 形状**；`getProjectReview` 这条**无前端调用方**的路由；`teacherController.js:427-433` 与两个溯源注释里的旧路径文本。**一处都不许「顺手修」**。
7. 全部完成后**再**删 `server/src/controllers/reviewController.js`；**不要**用任何回滚类 git 命令。
8. **不许顺手修 §1.4-3 的近不可达分支、不许补 §1.4-4 的 `message` 字段、不许给 `reviewProjectSubmission` 的 `Number(finalScore)` 加 `NaN` 防护** —— 任一都是行为变更，必须另开一步 + 另过 DoD。

**逐文件执行单**

| 步骤 | 动作 | 完成判据（自重） |
|---|---|---|
| B1 | 建 `interface/http/controllers/review/`，写 **T1**（145-168）+ banner + `export { resolveVisibleClassScope };` | `node --check`；1 条 import（teamController） |
| B2 | 写 **T2**（13-37 · 39-52 · 170-196 · 198-221）+ banner + 4 条 import（§6.4）+ `export { getSubmissions, getReviewQuestions };` | 同上 |
| B3 | 写 **T3**（114-143 · 318-372 · 374-420 · 422-444）+ banner + 3 条 import + `export { batchReview, batchPublish, publishScores };` | `grep -c 'let count = 0;' batch.js` = **1**（死变量逐字在） |
| B4 | 写 **T4**（446-516 · 518-606）+ banner + 5 条 import + `export { getReviewSummary, getReviewByClass };` | `grep -c "message:" summary.js` = **0**（★无 message 形状不许补） |
| B5 | 写 **T5**（608-761，**含嵌套 scoreItem 680-703 整体**）+ banner + 3 条 import + `export { exportReviewData };` | `grep -c "message:" export.js` = **0**；`scoreItem` 仍在 `exportReviewData` **内部**（不得提为顶层） |
| B6 | 建 `infrastructure/review/`，写 **T7**（54-73 · 75-107 · 109-112）+ banner + 2 条 import + `export { isStudentVisibleToTeacher };` | 2 条 import 的路径层级 == `../../utils/`（**两层**，不是四层） |
| B7 | 写 **T8**（223-264 · 266-281 · 283-301 · 303-316）+ banner + 3 条 import + `export { getSubmissionDetail, regradeSubmission, updateScore, reviewSubmission };` | `grep -c 'req.app.locals.reviewUseCases'` = **3**（逐字在） |
| B8 | 写 **T9**（763-780 · 782-841 · 843-888）+ banner + 8 条 import + `export { getProjectReview, reviewProjectSubmission };` | `grep -c 'fs\.' project.js` = **2**（`existsSync` ×2 逐字在） |
| B9 | 写 **T10**（890-925 · 927-964）+ banner + 4 条 import + `export { getQuestionPromptPreview, getSubmissionPrompt };` | `grep -c 'prompt-builder' prompts.js` = **1** 且路径为 `'../ai/prompt-builder.js'` |
| B10 | 写 **T6** `interface/.../index.js`（§6.3 的 5 行 re-export） | `PORT=0 node --input-type=module -e "const m=await import('./server/src/interface/http/controllers/review/index.js');console.log(Object.keys(m).sort())"` → **8 名**（7 契约名 + `resolveVisibleClassScope`） |
| B11 | 写 **T11** `infrastructure/review/index.js`（§6.3 的 4 行 re-export） | 同法 → **9 名**，与 §6.3 清单逐字相等 |
| B12 | 改 **I2**（`projectReviewController.js:18` 路径） | `PORT=0` 真 import 该 controller，无 `does not provide an export named` |
| B13 | 改 **I1**（`routes/teacher.js:5` → 3 行）+ **删除源文件**，跑 `node scripts/gates/bind-check.mjs` | `grep -rn 'controllers/reviewController.js' server/src server/test` = **0**；bind-check 违规 0 |
| B14 | 过 lint（§6.5-D1，**须有 Captain 授权**）+ 门禁五连 + 全量回归 | 两条 lint 判据的原始输出贴进 `reviewController-refactor.md` |
| B15 | 写 `docs/split/reviewController-refactor.md`（源区间 → 目标文件:行 + 每块 sha256 + 两个 barrel 的 `Object.keys` 快照 + lint 三元组举证） | 25 块全覆盖，0 处未分配 |

**分批执行时的额外指令**：B1/B2 两批**不要**建任何 barrel、**不要**改 I1/I2；源文件里把已迁出的名字改成 `export { … } from '<新路径>';`（**放在文件末尾**，不要与既有声明混排），并在文件头补上仍被内部使用的 `prisma` / `logger` / `getVisibleClassIds` / `ABNORMAL_FEEDBACK` 等 import。

**禁令（违反即回流）**：① 顺手修 `count` 死变量 / 补 `message` 字段 / 给分值钳制加 NaN 防护之类「优化」；② 在同一提交里改任何中文文案、状态码、响应键序、`Math.min/max` 阈值；③ 改 `server/test/` 的断言（只允许改路径）；④ 改门禁脚本以「适配」新路径；⑤ 用 `git checkout/restore` 回滚（用重编辑）；⑥ 把 `export { … } from` 换成 `export * from`；⑦ **在 interface 侧文件里 import 任何 `infrastructure/` 路径**（哪怕只是 re-export —— 那是 `check-layers` 与 `cycle-check` **都看不见**的真违规）。

---

## 11 给 Agent C 的验证清单

C 为只读 + 自建对拍（**不复用 B 的脚本**），临时产物一律放 `/tmp`，探针一律 `PORT=0`，**硬禁网**。

| # | 验证项 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| V1 | 版本锚点 | `git rev-parse HEAD`；`shasum -a 256` 冻结副本 | `reviewController.js` == `62ec56ed…`（若已删，用 `git show 1b713b8:server/src/controllers/reviewController.js` 重建） |
| V2 | **逐字搬移（静态）** | §7.5 `slice-equal.mjs`：**25 块**（24 顶层 + 嵌套 `scoreItem`）sha256 | **0 块不等**（若 Captain 选 D2，则显式豁免 `batchReview` 1 块并核对「只删了 2 行死变量」）；反向「未匹配字节 = 0」 |
| V3 | 声明行 export 审计 | 目标侧声明行 `export` 计数 = **17**，名字集与源**完全相同**；`export *` 出现次数 = **0**；`count` 死变量仍在 `batch.js` 内 | 逐字相等 |
| V4 | **行为对拍（动态）** | §7.2/§7.3：**F01–F18**，两个独立进程，`cmp` JSON（**四维：返值 + 终态 DB + 有序调用日志 + fetch 请求体**） | **byte-identical**；先过「before 跑两次相等」 |
| V5 | 装置自检 | §7.4 三项（F14 产出非 null 客观题分；F15「有标准包」命中 `fs.existsSync` 真分支；F08 reject 命中 404/1004）+ **守门员自检**（403 三态文案逐字） | 四项全中（否则装置没打到靶） |
| V6 | **变异反证** | §7.4 注入 3 处变异（`isProject` 三元互换 / 去掉分值钳制 / `reviewPending` 去掉 practice 特判） | 必须**报差异**；不报 = 装置失效，判负 |
| V7 | **禁网自证** | 探针在 import 前替换 `globalThis.fetch`；报告写明 `fetchLog.length` 与 `DEEPSEEK_BASE_URL` | `fetchLog.length === 0`（本文件不应有任何出网）；非 0 则逐条列出 URL 并判负 |
| V8 | **导出面（两个 barrel 合并）** | `PORT=0 node --input-type=module -e "…"` 分别 import T6 与 T11 后 `{...t6, ...t11}` 求 `Object.keys().sort()`，与改前 `reviewController` 的 `Object.keys()` 对拍 | 恰 **17 名**逐字相等：`batchPublish, batchReview, exportReviewData, getProjectReview, getQuestionPromptPreview, getReviewByClass, getReviewQuestions, getReviewSummary, getSubmissionDetail, getSubmissionPrompt, getSubmissions, isStudentVisibleToTeacher, publishScores, regradeSubmission, reviewSubmission, reviewProjectSubmission, updateScore`；并断言 **T6 ∩ T11 = ∅**（防 I1 的 `{...}` 静默遮蔽）；另**显式记录** T1 多出的内部名 `resolveVisibleClassScope`（不计入契约面） |
| V9 | 零覆盖分支专项 | **Z1–Z15** 逐条对照改前（尤其 `scoreItem` 四型判分、`readStandardTree` 双分支、分值钳制、`aiFeedback` 非法 JSON 降级） | 逐字节相同（文案含 `'无权访问该提交'` `'部分提交不在可见范围内，已整批拒绝'` `'练习模式无需审核'` `'该提交不是编程题'` `'非实训题提交'`…） |
| V10 | **分层门禁 + 证伪** | `node server/scripts/check-layers.mjs` | 违规 **0**；未分层 **43**（≤44）；**并做门禁证伪**（§2.6 四条反向陷阱，`/tmp` 副本）确认门禁有牙 |
| V11 | 架构门禁 | `node scripts/gates/arch-metrics.mjs` | PASS；unmigrated **43**；**GodFile 3 → 2**；观察带如实记录（预期 14 → 14，因 965 与 1338 之外无新 >500 文件；**不作判据**） |
| V12 | 循环依赖 | `node scripts/gates/cycle-check.mjs` | **SCC = 0**、自环 0（边数会变属预期，我的预判 ≈237 **不作判据**；注意 barrel 的 re-export **不计边**） |
| V13 | 绑定门禁 | `node scripts/gates/bind-check.mjs` | 违规 **0**；`unresolved` / `external` 与改前基线**一致**（4 / 1）—— **这是唯一能验两个 barrel 的 17 行 re-export 的门禁** |
| V14 | 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0（只扫 `client/src`，本步应**逐字不变**） |
| V15 | **两道 lint** | (a) `./node_modules/.bin/eslint client/src server/src --format json`；(b) `node scripts/gates/lint-check.mjs --json` | (a) **error 0 / warn ≤59**（实测改前恰 59）；(b) **exit 0**；若 Captain 授权 D1，**必须**用 `--json` 证明：总数 **31→31**、`resolved` 恰 1（旧 file）、`fresh` 恰 1（新 file）、**rule=`no-unused-vars` 且 symbol=`count` 两者相同** —— 仅凭 exit 0 不算过 |
| V16 | 全量回归 | `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`（**先查空序号**，脚本对已占用序号 `exit 4`） | 日志 **4 处 `Test Suites:`**、**`failed = 0`**；套件/用例数如实记录（**不得引用旧基线**；B0 补测后用例数应增加） |
| V17 | 越界自查 | `git status --porcelain` + `find . -newermt '<B 开始时刻>' -not -path './node_modules/*'` | 只有计划内的 11 新 + 2 改（+1 删 + B0 的测试 + B 的报告）；`client/dist` / `tests/` / `scripts/gates/` 的 mtime 无变化 |
| V18 | 回滚粒度 | `git show --stat HEAD`（每批一个） | 单提交，消息含「拆分前 file:line 范围 + 落层目标 + 验证结果」 |

**判定纪律**：V2 / V4 / V6 / V10 / V15 是本步核心判据（其余是既定门禁）。任一不符 → 回流 B，**不得**改测试或改门禁迁就实现。

---

## 12 局限声明

1. **未真落文件、未真跑对拍**：§2.5 的合规预判 = 「用真实门禁脚本自身的常量（`NODE_IO`/`EXTERNAL_BLACKLIST`）与逐字复刻的判定式，在内存中对合成 import 清单求值」，**不等于** `node server/scripts/check-layers.mjs` 对真实新文件的实跑；§7 的夹具矩阵是**配方**，未执行。真跑必须由 C 完成（V10/V4）。
2. **未跑 jest / build / 服务**（A 角色禁令）：§5 的覆盖判定是**静态 + 人读**（端点字符串 grep + 逐用例读状态码 + 分支可达性推演），**不是覆盖率工具读数**；Z1–Z15 我逐条给了依据，但**未做运行时探针验证**。特别是 **Z11/Z15 标为「低置信」**——它们的结论依赖我对夹具「有无空花名册 / 有无 `abc` id 断言」的阅读，**若 C 实测发现已覆盖，以 C 为准并回流本方案**。
3. **「13/16 条路由有正例 + 反例」是阅读结论而非证明**：结论建立在「每个套件都用真实 teacher token 通过 `auth`+`requireRole`，且请求打到非守卫分支」的逐套件阅读上。**若某个套件其实在更早的中间件短路（例如 token 过期导致 401），该条覆盖即为假**——C 应对每条路由至少抽 1 例，**打印实际状态码**确认不是 401/500。
4. **§6.5 的 lint 迁移效应是「判定式推演」**：我从 `lint-check.mjs:539-548` 的 `k = v.file + '\u0000' + v.rule + '\u0000' + v.symbol` **逐字读出**键含 `file`，故断言「搬迁即产生 fresh」。**我未真跑一次搬迁验证**（那需要先改文件，越权）。⇒ **C 必须在 B 完成后的树上实跑 `--json` 版本复核**；若实测 `fresh` 为空（例如某条规则被去重），则 §6.5 的 D1/D2 抉择可撤销。
5. **落层拓扑是「门禁驱动」而非「架构文档驱动」，且与 plan §S5 有实质偏离**：§2.3 的 12/13 二分是**三条硬约束的闭包结果**，不是设计偏好。**如实登记两处文档层面的欠债**：① 12 个 infra 文件里含 HTTP 语义（`res.status/json`），与架构文档 §1.1「基础设施层禁止包含业务规则」的**字面**不符；② 13 个 interface 文件**直连 Prisma**（36 处 `prisma.*`），与「接口层禁止直接触碰 Prisma / AI SDK」的**字面**不符。**这两条在本文件今日就已存在**（它是 fat controller），**拆分只是把它们显式化**，既未加重也未修复；修复它们需要真正的用例层重写（改行为），**不在本步**。
6. **行数预估有 ±5% 误差**：§6.2 的预估 = 搬移行数 + 我对 banner / import / export 块的估计。判据是 **< 800**（最大 ≈170，远未逼近），不是精确值。中间态行数（B1 ≈300 / B2 ≈120）同样是推算，**未实际构造**。
7. **未审计依赖邻居**：`utils/{prisma,logger,projectView,projectPaths,projectFiles}.js`、`controllers/teamController.js`、`constants.js` **仍是 unlayered**，T1–T11 会持续依赖它们（这正是新文件能 0 违规的原因之一）。若后续步骤迁它们的层，**本方案的 43 条相对路径需同步调整**（**不是本步缺陷**，且届时应以同一步的门禁读数为准）。
8. **`getProjectReview` 的「双实现」未取证**：§1.4-2 的「全仓无前端调用方」是**代码级**实测（`grep client/src`）；**线上是否仍有旧版页面/脚本在调这条路由，未取证**（需查访问日志，超出只读范围）⇒ **本步一律不删该路由**。
9. **`scoreItem` 的零覆盖是「夹具缺失」而非「模型不可达」**：我确认全仓无 `objectiveItems` 真实夹具，但**未确认生产库里是否真存在带 `objectiveItems` 的 `subQuestion`**（需查库，超出范围）。若线上确实不存在这类数据，则该段是**事实上的死代码**，但**仍不许删**（删除 = 改行为 + 改变响应形状的兜底）。
10. **对拍装置的 `$transaction` 语义有实现风险**：`batchReview:357` 传的是**已被调用的 Promise 数组**（`prisma.submission.update(...)` 在数组构造时就执行了），因此 prisma 替身必须在 `update` 被调用时**立即**记账，而不是在 `$transaction` 里记账。**这是 C 自建替身最容易写错的一处**（写错会让维度 3 的调用顺序两侧都「正确」但语义失真）。建议 C 对 `batchReview` 额外做一次**真实顺序自检**（断言 `__log` 里 `update` 的出现次数 === `toReview.length`）。
