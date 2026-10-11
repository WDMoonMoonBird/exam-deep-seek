# teacherController 拆分方案（接缝与护航分析）

- **step**: 9（**本轮最后一个 GodFile**）｜ **phase**: A（接缝与护航分析）｜ **日期**: 2026-10-11 ｜ **技能**: code-analyzer
- **目标文件**: `server/src/controllers/teacherController.js`（**1338 行**，`wc -l` / `arch-metrics` 口径）｜ **40 个顶层具名函数**（9 个 `function` 声明 + 30 个 `export const →` + 1 个非导出 `const gradeProject`）｜ **29 条路由** ｜ **30 个导出名**
- **方案来源**: `docs/plan/2026-10-11-godfile-split-plan.md` §5 DoD / §4-S4 / §8 ｜ server 侧最新最全范本 `docs/split/reviewController-plan.md`（701 行）｜ 执行范本 `docs/split/reviewController-refactor.md`（含 §12-D1「生成脚本误读工作树」事故）｜ 验证范本 `docs/split/reviewController-verify.md` ｜ 状态机 `docs/split/status.md`
- **落层唯一依据**: `server/scripts/check-layers.mjs`（我逐行实读全部 139 行）｜ 架构文档 `docs/refactor-architecture.md` §1.1
- **版本锚点（本方案全部实测数据的取值时刻）**:
  - HEAD = `c5632b0c4af8e377754d9f43eb2c6427cba2771e`，分支 `master`，`git log -1` = `split(step-8): reviewController.js 拆为 11 文件并落层（GodFile 3->2，未分层 44->43）`
  - 目标文件：bytes = **61177**，sha256 = `729a83b064bdac822bf52f5713ecfc3893d842c57754dcd7eebb076d30a60764`，`wc -l` = **1338**（`split('\n').length` = 1339，末尾换行多算一格；本方案一律用 **1338**，与 `arch-metrics.mjs` 打印的 `(1338)` 同口径）
  - `git status --porcelain -- server/src/controllers/teacherController.js` = **空**（无未提交改动）
  - **门禁实测（本轮由我执行，全部静态只读）**：
    | 门禁 | 命令 | 实测读数 | 退出码 |
    |---|---|---|---|
    | 分层守卫 | `node server/scripts/check-layers.mjs` | 文件 **106** / 违规 **0** / 未分层待迁移 **43** | 0 |
    | 架构门禁 | `node scripts/gates/arch-metrics.mjs` | layerViolations 0/0、unmigrated **43/43**、godfileOver800 **2/2**、观察带 13/13；GodFile 名单 = `teacherController.js (1338)` / `Doc.vue (1106)` | 0（PASS） |
    | 循环依赖 | `node scripts/gates/cycle-check.mjs` | 106 文件 / **238** 条相对导入边 / **SCC 0** / 自环 0 | 0 |
    | 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0（**只扫 client/src**，本步应逐字不变） | 0 |
    | 绑定门禁 | `node scripts/gates/bind-check.mjs` | modules 208 / bindings 710 / **BINDING VIOLATIONS 0**；unresolved 4 / external 1（仅登记） | 0 |
    | **lint (a)** | `./node_modules/.bin/eslint client/src server/src --format json`（**不用 npx 以免触网**） | 205 文件、**error 0**、**warn 59**（= DoD 上限，**零余量**）；**本文件占 3 条**（:7 :9 :159） | 0 |
    | **lint (b)** | `node scripts/gates/lint-check.mjs` | 基线 31 → 当前 **31**、新增 1（**已迁移**，是 step 8 的 `count`）；**本文件占 3 条**（:7 :9 :159） | 0 |

---

## 0 约束遵守声明

| 约束 | 遵守方式 |
|---|---|
| 纯只读 | 本方案是**本轮唯一写入**；未创建/修改/删除仓库内任何其它文件。全部辅助脚本落在 `/tmp`（`/tmp/tc-ast.cjs`、`/tmp/tc-refs.cjs`、`/tmp/tc-deps.cjs`、`/tmp/tc-resp.cjs`、`/tmp/tc-ops.cjs`、`/tmp/tc-part.cjs`、`/tmp/tc-layers.cjs`、`/tmp/tc-cov*.mjs`、`/tmp/tc-e2e.mjs`） |
| 禁止 git 写操作 | 只执行 `rev-parse` / `log` / `status --porcelain`；无 clean / stash / checkout / reset / restore，无任何提交 |
| 不跑 jest / build / 服务 | 未执行 jest、未 build、未启任何服务；未触碰 :5173 / :3000 / `client/dist` / `tests/`；**未发任何 AI/外部请求** |
| 禁止联网 | 未调用 web_search / web_fetch；eslint 走仓库内 `./node_modules/.bin/eslint`（**刻意不用 `npx`**） |
| 行号与计数自测 | 全部行号 / 行数 / 函数数 / 导出面 / 调用方 / 覆盖 / 门禁读数**由我在本轮实测**（方法与原始输出随表给出）；**未照抄任务书**（见 §1.4 的四处勘误） |
| 门禁执行的写入性 | 上表 7 条命令全部**零仓库写入**（已逐条核读源码：`check-layers.mjs:126-129` 仅在 `--save-baseline` 时写；`lint-check.mjs` 仅在 `--update-baseline` 时写；`bind-check.mjs` 只写 `os.tmpdir()`） |
| 不改对外契约 | 全部搬移单元 = 源码切片位移 + import 重排 + 文件末尾 `export { … };` 块；**导出面逐字保持今日的 30 个名字**，29 条路由的 方法/路径/中间件/状态码/body 结构/中文文案逐字不变 |

---

## 1 段落接缝图谱（逐段实测）

### 1.1 实测方法与自证

- **行号**：`acorn.parse(src, { ecmaVersion:'latest', sourceType:'module', locations:true })` 递归遍历 AST，取每个 `FunctionDeclaration` / `ArrowFunctionExpression` 的 `loc.start.line`–`loc.end.line`，并沿 `ExportNamedDeclaration` 判定导出。脚本 `/tmp/tc-ast.cjs`（仓库外，`require(process.env.REPO_ACORN)` 复用仓库 `node_modules/acorn@8.19.0`）。
- **输出自证**：`TOTAL_LINES(split-n) = 1339`、`wc-l-equiv = 1338`；**顶层语句 58 条** = **13 条 import 声明**（11 条头部 + 2 条尾部 `:1289-1290`）+ **40 个具名函数语句** + **4 个模块级 const**（`__dirname` `uploadDir` `storage` `upload`）+ **1 个 `if`**（`:1294`）——⚠️ **注意区分「语句数 13」与「规格符数 15」**：check-layers 的 `IMPORT_RE` 命中的 15 条里，有 **2 条是函数体内的动态 `import()`**，它们**不是顶层语句**；**函数节点总数 69**（40 顶层 + 29 嵌套箭头，嵌套最深 d20，在 `updateQuestion` 的 `subQuestions.create: resolved.map(…)` 内）。
- **40 个顶层具名函数的构成（实测，用于校正「40 个函数」的口径）**：**9 个 `function` 声明**（`getSchoolId` `canTeacherManageClass` `canTeacherManageStudent` `canTeacherManageClasses` `canTeacherManageTeams` `isTeacherInSchool` `rollupRow` `rollupPendingByAssignment` `buildAssignmentStatusWhere`）+ **30 个 `export const X = async (req,res) =>`** + **1 个非导出 `const gradeProject = async (req,res) =>`（:159）** = **40** ✔
- **导出面自证**：`^export const ` 逐行扫 = **30**；无 `export function`、无 `export {}` 块、无 `export default`、无 `export *`。**29 个是路由 handler，1 个（`getMyClasses`）无任何路由**（§1.5-3）。
- **依赖自证**：`/tmp/tc-refs.cjs`（自建 strip-comments/strings 扫描器）逐条统计每个 import 绑定在剥离注释与字符串后的**真实引用**（引用行数 = 1 且仅在 import 行本身 ⇒ 死绑定）。
- **IO 判定**：`fs` 引用 11 处（:134 :146 :170 :172 :177 :255 :256 :257 :1294 ×2）、`path` 16 处、`__dirname` **6 处**（:133 :188 :249 :254 :1292 :1293）。
- **动态 import 可被门禁看见（关键实测）**：用 `check-layers.mjs:28` 的 `IMPORT_RE` **原文**跑本文件，命中 **15 条规格符**（13 条静态 + **2 条动态** `:137` `:204`）——**动态 `import()` 不是盲区**，它同样参与分层判定（§2.2）。

### 1.2 段落表（行号 = acorn / 行扫描实测值，含紧邻 JSDoc / 行内注释）

| # | 段落（逻辑单元） | 起止行（实测） | 行数 | 导出？ | 依赖的本文件符号 | 外部包 / 其它文件 | 含 IO？ |
|---|---|---|---|---|---|---|---|
| **S0** | 文件头 · import 面 | 1–11 | 11 | — | — | `bcryptjs` `fs` `path` `../utils/prisma.js` `../domain/errors.js` `../utils/logger.js` `../constants.js` `../utils/scoring.js` `./teamController.js` `../utils/projectPaths.js` `../infrastructure/ai/deepseek/index.js`（**3 黑名单/内置 + 1 domain + 6 unlayered + 1 infrastructure**） | — |
| **S1** | **守卫与工具块**（无横幅，文件头直落） | 13–67 | 55 | 否（6 个私有） | — | `prisma`(×3) `getVisibleClassIds`(×3) `getMyTeamIds`(×1) | DB 读 |
| **S2** | 学校切换（横幅 :69） | 69–81 | 13 | **是**（`switchSchool`） | — | `prisma`(×2) `logger`(×1) | DB 写 |
| **S3** | 题库管理（横幅 :83） | 83–370 | 288 | **是**（6 个） | — | `prisma`(×16) `logger`(×6) `fs`(×5) `path`(×5) `__dirname`(×3) **动态 `import('../utils/fileTree.js')`** **动态 `import('../infrastructure/ai/deepseek/index.js')`** `DomainError` `resolveSubQuestionScores` `req.app.locals.questionUseCases` | **DB + FS 读 + FS 写**（`mkdirSync`/`renameSync` :256-257） |
| **S4** | AI 试卷解析（横幅 :372） | 372–422 | 51 | **是**（2 个） | — | `parseExamPaper` `parseExamPaperStream`（**infrastructure**）`console`(×7) | **出网（AI）** + SSE |
| **S5** | 作业管理 + 待审核口径（横幅 :424 与 :426，双横幅） | 424–809 | 386 | **是**（5 个） | S1（`getSchoolId` ×3、`canTeacherManageClasses` ×1） | `prisma`(×19) `logger`(×10) `ABNORMAL_FEEDBACK` `getVisibleClassIds` `hasStandardPackage` | DB 读 + DB 事务写 |
| **S6** | 教师列表（横幅 :811） | 811–828 | 18 | **是**（`getAllTeachers`） | S1（`getSchoolId`） | `prisma`(×1) `logger`(×1) | DB 读 |
| **S7** | 学校 & 班级管理（横幅 :830） | 830–1001 | 172 | **是**（6 个） | S1（`getSchoolId` ×4、`canTeacherManageClass` ×3、`canTeacherManageTeams` ×2、`isTeacherInSchool` ×1） | `prisma`(×20) `logger`(×6) `getVisibleClassIds` | DB 读 + DB 事务写 |
| **S8** | 学生管理（横幅 :1003） | 1003–1285 | 283 | **是**（7 个） | S1（`getSchoolId` ×7、`canTeacherManageClass` ×3、`canTeacherManageStudent` ×3） | `prisma`(×22) `logger`(×7) `bcrypt`(×7) `getVisibleClassIds` | DB 读 + DB 事务写 |
| **S9** | 文件上传（横幅 :1288，**含第二段 import** :1289-1290） | 1288–1322 | 35 | **是**（`uploadMaterial`） | — | **`multer`（黑名单）** **`url`/`fileURLToPath`** `fs`(×2) `path`(×3) **模块级常量 `__dirname` `uploadDir` `storage` `upload`** | **模块加载期 FS 写（`mkdirSync` :1294）+ 请求期磁盘写（diskStorage）** |
| **S10** | AI 生成参考答案（横幅 :1324） | 1324–1338 | 15 | **是**（`generateReference`） | — | `generateReferenceAnswer`（**infrastructure**）`console`(×3) | **出网（AI）** |

**段落行数合计校验（逐行集合运算，无重叠无遗漏）**：11(S0) + 55 + 13 + 288 + 51 + 386 + 18 + 172 + 283 + 35 + 15 = **1327**；加 11 个段间空行（`:12` `:68` `:82` `:371` `:423` `:810` `:829` `:1002` `:1286` `:1287` `:1323`）= **1338** ✔（脚本实测：`UNMAPPED LINES = 11` 且**全为空白行**、`UNMAPPED NON-BLANK = 0`、`DOUBLE-MAPPED = 0`）

**接缝判决**：本文件**有 11 条顶层 `// =====` 横幅**（:69 :83 :372 :424 :426 :520 :811 :830 :1003 :1288 :1324）+ **1 个无横幅的文件头守卫块（:13-67）** = **12 个逻辑段**；40 个顶层声明**每个都是独立的一段**（JSDoc/行内注释紧邻其宿主函数，中间只有空行分隔）⇒ **接缝天然干净，可「按声明整块剪切」**。**唯一的结构性例外是 S9 的 `__dirname`：它在 :1292 声明、却在 S3 的 :133 / :188 / :249 / :254 被消费**（见 §1.3 与 §2.7）。

### 1.3 ★本文件独有的三处「跨段耦合 / 隐形接缝」（实测，决定本步成败）

1. **★★`__dirname` 双向跨段耦合（最高危）**：`const __dirname = path.dirname(fileURLToPath(import.meta.url));` 位于 **S9（:1292）**，但被 **S3** 的 `getProjectFiles:133`、`gradeProject:188`、`createQuestion:249`/`:254` 消费，也被 S9 自己的 `:1293` 消费。今日能工作**只因它由 `server/src/controllers/` 推出 `server/uploads/`**。**一旦 S3/S9 搬进不同深度的新目录，`path.join(__dirname,'../../uploads',…)` 会静默指向错误目录**——实测：
   - `server/src/interface/http/controllers/teacher/questions.js` → `…/server/src/interface/http/uploads/x` ❌（**多出 4 层**）
   - `server/src/infrastructure/teacher/uploads.js` → `…/server/src/uploads/x` ❌（**多出 2 层**）
   - 正确（不依赖宿主位置的常量）→ `…/server/uploads/x` ✔
   **静态判据（切片判等 / bind-check / eslint / lint-check / node --check）对它 100% 全盲**：代码能加载、名字有绑定，只是**值变了**。⇒ 处置见 §2.7-B0b。
2. **★`fs.mkdirSync` 的模块加载期副作用**：`:1294 if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });` 在**模块被 import 时**就创建目录。与第 1 条叠加 ⇒ 拆错位置会**真的在仓库里造出一个错误的 uploads 目录**（本步的硬伤，必须由 C 用「新目录不存在」做正控）。
3. **★两条藏在函数体内的「路径字面量」，check-layers 能看见**：
   - `:137 await import('../utils/fileTree.js')`（unlayered，无害）
   - `:204 await import('../infrastructure/ai/deepseek/index.js')`（**infrastructure** ⇒ **其宿主文件不能落 interface**）
   两条都在**被搬移的函数体内部**，因此**不是「import 头重排」能处理的**，必须逐字改写；也正因如此，`getProjectFiles`/`gradeProject`/`createQuestion` **无法参与整块字节判等**（§7.7）。

### 1.4 与任务书的四处勘误（实测）

| # | 任务书 / Captain 盘点 | 实测 | 说明 |
|---|---|---|---|
| **E1** | 「**1339 行**」 | **1338** | `wc -l` = 1338；1339 是 `split('\n').length`（末尾换行多算一格）。`arch-metrics` 打印的就是 `(1338)`。**全仓口径用 1338** |
| **E2** | 「12 个段落（…**统计口径**…）」 | **11 条顶层横幅 + 1 个无横幅守卫块 = 12 段**；但清单里的「**统计口径**」**不是段落** —— 它是 `:614` 的 `// ===== 统计口径 ===== `，缩进 4 空格的**函数内子注释**，位于 `getAssignments`（:578-697）**内部**。真正的第 12 段是**文件头守卫块 :13-67**（无横幅） | 若按「统计口径」切段会**把 getAssignments 劈成两半 → 语法坏树**（本项目纪律第 10 条的同类形态） |
| **E3** | 「40 个函数」 | **40** ✔ | 构成 = 9 `function` + 30 `export const →` + 1 非导出 `const gradeProject`（**任务书未标注 gradeProject 是死代码**，见 §1.5） |
| **E4** | plan §S4 给的行号「题库管理(:83)/AI 试卷解析(:372)/作业管理(:424)/待审核汇总(:520)/**统计(:614)**/教师列表(:811)/学校班级(:830)/学生管理(:1003)/文件上传(:1288)/参考答案(:1324)」 | **9/10 正确**；`:614` 错误（同 E2）。另 `:520` 是**横幅行**，其下 handler 起于 `:526` | — |

### 1.5 段落之外的五处暗礁（实测，登记但**本步一律不动**）

1. **`gradeProject`（:159-218，60 行）是彻底的死代码**：AST 反查**全部 40 个单元的引用闭包 = 0 个消费者**（其自身 :204 的 `{ gradeProject: doGrade }` 是**属性名**，不是引用）；**门禁三重独立确认**：`docs/pipeline/lint-baseline.json` 第 3 条 = `{file:…teacherController.js, line:159, rule:'no-unused-vars', symbol:'gradeProject', text:'const gradeProject = async (req, res) => {'}`；eslint warn 中本文件 3 条之一；lint-check 基线内 3 条之一。**它含 FS 读 + 一条指向 infrastructure 的动态 import** ⇒ 是 §2 落层的**唯一拓扑扰动源**。
2. **两个死 import 绑定**（`/tmp/tc-refs.cjs` 剥离注释/字符串后引用计数 = 1，即**只出现在 import 行本身**）：
   - `:7` `DEFAULT_MAX_SCORE`（`../constants.js`）—— 同行的 `ABNORMAL_FEEDBACK` 有 1 处真实使用（`:442`）
   - `:9` `getTeamTeacherIds`（`./teamController.js`）—— 同行的 `getVisibleClassIds`(7 处) / `getMyTeamIds`(1 处) 都在用
   **二者即 lint 基线 31 条中本文件的那 2 条**。★它们的处置**直接决定 lint 判据 (b) 能否过**，见 §6.5。
3. **`getMyClasses`（:1038-1052）是「有导出、无路由」的孤儿**：`routes/teacher.js` 只取 **29** 个名字，`getMyClasses` 不在其中；`client/src` 全树 `grep getMyClasses` = **0**；全仓唯一另一处命中是 `tests/ui-redesign-verify/rig-server/`（**另一棵冻结副本，不在本步范围**）。⇒ **保留（删=改导出面）**，登记为后续独立清理项。
4. **唯一的非标准错误码 `code: 1007`（:756-760，HTTP 400）**：Q9「作业含实训题但无标准工程包」的**软确认**分支，body 带 `data:{requiresConfirmation:true, warnings:[…]}` —— 与其余 400 的 `{code:1001,data:null}` 形状**根本不同**。★**最容易被「顺手统一成 1001」**。
5. **`teacherController.js:427-433` 的 8 行口径同步注释**（写在 S5 里）显式引用 `server/src/controllers/reviewController.js:315-331` 与 `:309` —— **该文件已于 step 8 被删**，注释里的路径**已经失效**。属既有文档债，**本步不改**（改了=动注释=破坏整块判等），仅登记；C 若按字面 grep 旧路径会命中它。

---

## 2 落层判定与门禁预判证据

> **本节是本步的核心。判定式逐字取自 `server/scripts/check-layers.mjs`（我实读了该文件全部 139 行），不从架构文档推断。**

### 2.1 门禁的五条判定式（原文行号 + 逐字含义）

```
// check-layers.mjs:40-44
layerOf(p) = 相对 server/src 的第一段 ∈ {domain,application,infrastructure,interface} ? 该段 : 'unlayered'
// check-layers.mjs:26 / :20-25
NODE_IO = /^(node:)?(fs|path|child_process|http|https|net|tls|dns|os|worker_threads|readline|stream|zlib|vm|dgram|cluster)$/
EXTERNAL_BLACKLIST = 23 项（含 'multer' 'bcryptjs' 'prisma' '@prisma/client' 'express' …）
// check-layers.mjs:55-59
isExternal = !spec.startsWith('.') && !spec.startsWith('/')
targetLayer = isExternal ? 'external' : layerOf(resolve(dirname(file), spec))
// check-layers.mjs:63-82（逐层唯一分支，无其它规则）
domain        : isExternal ⇒ 'domain-imports-external' ; targetLayer!=='domain' ⇒ 'domain-imports-outside'
application   : isExternal && (isNodeIO || EXTERNAL_BLACKLIST.includes(spec)) ⇒ 'application-imports-external'
                !isExternal && targetLayer ∈ {infrastructure, interface} ⇒ 'application-imports-infra'
infrastructure: !rel.startsWith('infrastructure/bootstrap/') && !isExternal && targetLayer ∈ {application, interface} ⇒ 'infrastructure-imports-upper'
interface     : !isExternal && targetLayer === 'infrastructure' ⇒ 'interface-imports-infra'
unlayered     : ★ 不判任何规则（:63-82 的 if/else 链没有 unlayered 分支）
```

**五条关键事实（门禁源码级实测，与架构文档措辞不同）**：
- **F1｜unlayered 完全不判规则**：`controllers/` `services/` `utils/` `routes/` 下的文件 import 谁都不违规 —— 这就是「未分层待迁移 43」能被无限容忍的原因，**也是 12 个新文件可以大量引用 unlayered 而不违规的原因**。
- **F2｜interface 只禁一件事：相对路径指向 `infrastructure/`**。interface **不禁止** import 外部 npm（含 `multer`/`bcryptjs` 这些黑名单项）、node 内置（`fs`/`path`）、unlayered，也**不禁止**直连 prisma。
- **F3｜application 只禁两类外部包**（`isNodeIO` 的 16 个 + 23 项黑名单）且只禁相对路径指向 infrastructure/interface。⇒ `../utils/prisma.js` 是相对路径、目标 unlayered，**application import 它并不违规**（黑名单里的是 npm 规格符 `'prisma'`，不是相对路径）。
- **F4｜`export { … } from` 对 `check-layers` 与 `cycle-check` 完全不可见**（两者正则都要求字面量 `import`/`require(`/`import(`；实测 `check-layers.mjs:28`）。**⇒ 它既能藏住合法的下行边，也能藏住非法的上行边。本方案红线：不得利用这个盲区把 interface→infrastructure 的 re-export 藏进 barrel（那是真违规）。**
- **F5｜动态 `import()` 不是盲区（本步实测）**：`IMPORT_RE` 的第三个分支就是 `import\s*\(\s*`，我用**门禁原文正则**跑本文件命中 **15 条**（含 `:137` `:204` 两条动态）⇒ §2.2 的判定把它们计入。

### 2.2 本文件今日的 15 条 import 逐条判层（门禁正则原文实测）

| # | 行 | 规格符 | isExternal | NODE_IO / 黑名单 | 目标层 |
|---|---|---|---|---|---|
| 1 | 1 | `bcryptjs` | 是 | **命中黑名单** | external |
| 2 | 2 | `fs` | 是 | **命中 NODE_IO** | external |
| 3 | 3 | `path` | 是 | **命中 NODE_IO** | external |
| 4 | 4 | `../utils/prisma.js` | 否 | — | unlayered |
| 5 | 5 | `../domain/errors.js` | 否 | — | **domain** |
| 6 | 6 | `../utils/logger.js` | 否 | — | unlayered |
| 7 | 7 | `../constants.js` | 否 | — | unlayered |
| 8 | 8 | `../utils/scoring.js` | 否 | — | unlayered |
| 9 | 9 | `./teamController.js` | 否 | — | unlayered(`controllers`) |
| 10 | 10 | `../utils/projectPaths.js` | 否 | — | unlayered |
| 11 | 11 | `../infrastructure/ai/deepseek/index.js` | 否 | — | **infrastructure** ★ |
| 12 | **137** | `../utils/fileTree.js`（**动态**） | 否 | — | unlayered |
| 13 | **204** | `../infrastructure/ai/deepseek/index.js`（**动态**） | 否 | — | **infrastructure** ★ |
| 14 | 1289 | `multer` | 是 | **命中黑名单** | external |
| 15 | 1290 | `url` | 是 | — | external |

**⇒ 唯一的「敏感边」是第 11 与第 13 条（同一条 infrastructure 边，静态 + 动态各一次），以及第 5 条的 domain 边**：
- 第 5 条（`domain`）对 **interface / infrastructure** 都合法（interface 只禁 infrastructure；infrastructure 只禁 application/interface）⇒ **不构成约束**。
- 第 11/13 条（`infrastructure`）⇒ **凡含 `parseExamPaper`/`parseExamPaperStream`/`generateReferenceAnswer`/`gradeProject` 任一调用的宿主文件，都不能落 `interface`，也不能落 `application`**（application 分支 :69-71 同样命中）⇒ **只能落 `infrastructure`**。**这就是「plan §S4 的 `interface/http/controllers/teacher/*` 不能整文件照用」的实证**（与 step 8 的 `prompts.js` 同型）。

### 2.3 逐层试算（用 F1–F5 的判定式，对 40 个单元 + 上传块求值）

先给「依赖指纹」（由 §1.1 的 AST 闭包实测）：

| 指纹 | 单元 |
|---|---|
| **A｜含 infrastructure 边（静态或动态）** | `parseExam`(S4) · `parseExamStream`(S4) · `generateReference`(S10) · **`gradeProject`(S3)** |
| **B｜含 NODE_IO（`fs`/`path`）或黑名单外部包** | `getProjectFiles` · `createQuestion` · `uploadMaterial` + 上传块的 `storage`/`upload`/`__dirname` —— 仅约束 **application**，对 interface/infrastructure 无约束 |
| **C｜消费 S1 共享守卫（跨段）** | `getPendingSummary` `getAssignments` `createAssignment`（S5）· `getAllTeachers`（S6）· `getAllClasses` `createClass` `updateClass` `deleteClass`（S7）· `getMyStudents` `getMyClasses` `updateStudent` `deleteStudent` `resetStudentPassword` `addStudent` `batchAddStudents`（S8）—— **共 15 个，跨 S5/S6/S7/S8 四段** |
| **D｜仅依赖 unlayered + 自身段内私有** | `switchSchool`(S2) · `getQuestions` `getQuestion` `updateQuestion` `deleteQuestion`(S3) · `getAssignment` `lockAssignment`(S5) · `getMySchools` `switchClassSchool`(S7) · `rollupRow` `rollupPendingByAssignment` `buildAssignmentStatusWhere`(S5) · 6 个守卫(S1) |

**逐层结论（逐条给判定式依据）**：

- **`domain`｜全部单元否决**。指纹 A：`isExternal=false, targetLayer='infrastructure' ≠ 'domain'` ⇒ **`domain-imports-outside`**（`:65`）。指纹 C/D 的单元虽然自身依赖全在 unlayered，但它们**保留体内的 `res.status/res.json`** 且 `import prisma`（unlayered，但 ≠ domain）⇒ 同样 `domain-imports-outside`。**⇒ domain 0 可行单元**（与 step 1 对 ruleExecutor 的裁定相反，因为那个文件零 import）。
- **`application`｜指纹 A 与 B 被硬否决，其余在**纯门禁口径**下可行 —— 但本方案**否决该落法**：
  - 指纹 A：`!isExternal && targetLayer='infrastructure'` ⇒ **`application-imports-infra`**（`:69-71`）。**硬否决（4 个单元）**。
  - 指纹 B：`isExternal && isNodeIO('fs')` ⇒ **`application-imports-external`**（`:67-68`）；`multer`/`bcryptjs` 同理（黑名单）。**硬否决（3 个单元 + 上传块）**。
  - 指纹 C/D：门禁**不报**（F3 的诚实披露）。但**语义上这是错误落层**：`getAssignments`/`getAllClasses`/`getMyStudents` 全是 Prisma 直查 + `res.json` 的 **HTTP 翻译**，不是用例编排；把 **71 处 `prisma.*`** 搬进应用层会把「应用层只依赖 domain 端口」的文档约束彻底破坏，且**无任何收益**（用例层 `QuestionUseCases` 早已存在，本文件只有 `createQuestion` 的 code 分支经 `req.app.locals` 调它）。⇒ **application 0 个单元**（与 plan §S4 的 `application/use-cases/teacher/*` 建议**不符**，理由同 step 3 对 §S2 的否决）。
- **`interface`｜指纹 A 硬否决；指纹 C 由「共享守卫必须同层」强制**：
  - 指纹 A：`!isExternal && targetLayer='infrastructure'` ⇒ **`interface-imports-infra`**（`:78-81`）。**硬否决 4 个单元** ⇒ `parseExam`/`parseExamStream`/`generateReference`/`gradeProject` **不能落 interface**（**这正是 plan §S4「`interface/http/controllers/teacher/*`」在本步必然违规的那 4 个 handler**）。
  - 指纹 C 的连带（**本步第二条硬约束，step 8 未出现过**）：`getSchoolId` 被 **S5/S6/S7/S8 四段共 15 个 handler** 消费，`canTeacherManageClass` 被 **S7/S8** 消费，`canTeacherManageStudent` 被 S8 消费。**若把共享守卫放 interface 而把任一消费者放 infrastructure，命中 `infrastructure-imports-upper`（:75）；反向放则命中 `interface-imports-infra`（:78-81）。** ⇒ **共享守卫文件与其全部消费者必须同层**。
  - **⇒ interface 实际承载 = 8 个文件 / 26 个契约名 + 6 个内部名**：守卫块(S1) + `switchSchool`(S2) + S3 去掉 `gradeProject` 后的 6 个 + S5(5) + S6(1) + S7(6) + S8(7) + 1 个 barrel。
- **`infrastructure`｜对全部单元零违规**：判定式只禁「相对路径指向 application/interface」（`:75`，组合根例外与本步无关），且**根本不检查外部包**。⇒ 指纹 A 的 4 个单元 + 整个 S9 上传块（`multer`/`fs`/`path`/`url`）都可落此层；它们之间的边全是同层（合法），对 unlayered / external / domain 无限制。

### 2.4 落层裁定表（40 个单元 + 上传块 → 层）

| 落层 | 单元 | 判定式依据 |
|---|---|---|
| **interface**（26 导出 + 6 内部 = 8 个文件） | 内部：`getSchoolId` `canTeacherManageClass` `canTeacherManageStudent` `canTeacherManageClasses` `canTeacherManageTeams` `isTeacherInSchool`（**跨文件共享，故新增为模块级导出**）+ `rollupRow` `rollupPendingByAssignment` `buildAssignmentStatusWhere`（段内私有，**不加 export**）；导出：**`switchSchool` `getQuestions` `getQuestion` `getProjectFiles` `createQuestion` `updateQuestion` `deleteQuestion` `getPendingSummary` `getAssignments` `getAssignment` `createAssignment` `lockAssignment` `getAllTeachers` `getMySchools` `getAllClasses` `createClass` `updateClass` `deleteClass` `switchClassSchool` `getMyStudents` `getMyClasses` `updateStudent` `deleteStudent` `resetStudentPassword` `addStudent` `batchAddStudents`** | F2：其相对目标全部落在 unlayered(`utils`/`constants.js`/`controllers/teamController.js`)、domain(`domain/errors.js`)、同层(interface) —— **无一条指向 `infrastructure/`** ⇒ `interface-imports-infra` = 0。★注意 `bcryptjs`/`fs`/`path` 是**外部**，interface 分支**不检查外部**（F2） |
| **infrastructure**（4 导出 + 1 死代码 = 4 个文件） | 导出：**`parseExam` `parseExamStream` `generateReference` `uploadMaterial`**；死代码：`gradeProject`（**不加 export**）+ 上传块 4 个模块级常量 `__dirname` `uploadDir` `storage` `upload` | 由 §2.3 的指纹 A 唯一强制（`interface-imports-infra` 与 `application-imports-infra` 双向封死）；落 infrastructure 后全部相对边 ∈ {同层 `../ai/deepseek/index.js`、unlayered `../../utils/*`} ⇒ `infrastructure-imports-upper` = 0 |
| **application** | **0** | 指纹 A/B 硬否决；其余语义错误（§2.3） |
| **domain** | **0** | 全部命中 `domain-imports-external` 或 `domain-imports-outside` |

**导出面二分自证**：interface 契约名 **26** + infrastructure 契约名 **4** = **30** = 今日实测导出面 ✔（一多一少都不允许）；另有 6 个 interface 内部名（守卫）+ 1 个 infrastructure 内部名（`gradeProject`）**不进契约面**。

### 2.5 门禁预判表（0 违规证据）

预判方法（**诚实声明**：A 是只读角色，没有为了预判而落任何文件进仓库）：在内存中**用真实门禁脚本自身的常量与判定式**（`IMPORT_RE` `:28`、`NODE_IO` `:26`、`EXTERNAL_BLACKLIST` `:20-25`、`layerOf` `:40-44`、四条分支 `:63-82`）逐字复刻，喂入 §6 的 **12 个新文件 × 其全部 import 规格符**（interface 侧 8 文件 / infrastructure 侧 4 文件）→ **违规 0 条**。真跑必须由 C 执行（§11-V11）。

| 规则（门禁原文） | 判定式（实测行号） | 预判违规数 | 依据 |
|---|---|---|---|
| `domain-imports-external` | `:64` | **0（不适用）** | 本步不新增任何 domain 文件 |
| `domain-imports-outside` | `:65` | **0（不适用）** | 同上 |
| `application-imports-external` | `:67-68` | **0（不适用）** | 本步不新增任何 application 文件 |
| `application-imports-infra` | `:69-71` | **0（不适用）** | 同上 |
| **`interface-imports-infra`** | `:78-81` | **0** | interface 侧 8 文件的相对目标逐一落点：`../../../../utils/{prisma,logger,scoring,projectPaths,fileTree}.js`（unlayered）· `../../../../constants.js`（unlayered）· `../../../../domain/errors.js`（**domain，非 infrastructure**）· `../../../../controllers/teamController.js`（unlayered）· `./guards.js`（同层）⇒ **无一条 targetLayer==='infrastructure'**。★反向证据：本文件今日的 `:11` 与 `:204` 就是 infrastructure 边 —— 把 `parseExam`/`generateReference`/`gradeProject` 任一放进 interface 文件，**立即命中该规则（静态 + 动态各一次）** |
| `infrastructure-imports-upper` | `:75` | **0** | infrastructure 侧 4 文件的相对目标：`../../utils/{prisma,logger,projectPaths}.js`（unlayered）· `../ai/deepseek/index.js`（**同层**）⇒ 无一条指向 application/interface；且无一落在 `infrastructure/bootstrap/` |
| 外部包（interface 侧） | `:78-81` **只判相对路径** | **0** | interface 分支不检查任何外部包 ⇒ `bcryptjs`/`fs`/`path` 在 interface 侧**根本不检查**（本步 interface 侧实际有 3 条外部边） |
| 外部包（infrastructure 侧） | `:72-77` **只判相对路径** | **0** | `fs`/`path`/`multer`/`url` 在 infrastructure 侧**根本不检查** |
| 未分层待迁移 | `:86` `layerOf()==='unlayered'` | **43 → 42** | 删 `controllers/teacherController.js`（unlayered **−1**）；12 个新文件首段分别是 `interface`(8) / `infrastructure`(4) ⇒ **+0** |
| 门禁退出码 | `:140` | `0 → exit 0` | 上述合计 |
| `arch-metrics` GodFile | `arch-metrics.mjs`（`>800` 计数，判据是「不劣于基线」） | **2 → 1** | 删源文件后名单只剩 `Doc.vue (1106)` ✔；最大新文件 **≈400 行**（assignments.js，见 §6.2）≪ 800 |
| `cycle-check` SCC | `cycle-check.mjs`（Tarjan，>1 判环；**barrel 的 re-export 不计边**） | **0 → 0** | §6.3 的依赖图是**有向无环**的：interface 侧 7 个内容文件互不引用、只被 barrel 单向 re-export；infrastructure 侧 3 个内容文件互不引用 |
| `hard-metrics` | `hard-metrics.mjs:20`（只扫 `client/src`） | **0/0/0 不变** | 本步不碰 client |
| `bind-check` | `bind-check.mjs`（具名 import/re-export 必须有真实导出；roots = server/src + server/test） | **0** | 两个 barrel 的 30 条 re-export 全部指向真实导出名（C 用 `Object.keys` 对拍，§11-V9）；**且它同时覆盖 I2 的路径存在性**（⚠️ 但 unresolved 仅登记、**不判违规**，见 §4.1） |
| **lint (a) eslint** | DoD §5-5：error=0 且 warn ≤ 59 | **0 error / 57 warn** | 逐字搬移 ⇒ 无新规则命中；**2 个死 import 绑定按 §6.5 不复制** ⇒ warn **59 → 57**（下降，合法） |
| **lint (b) lint-check** | `lint-check.mjs`（比对键 = **file + rule + symbol**；迁移配对需 **+规范化行文本**） | ⚠️ **31 → 29，exit 0**；`gradeProject` 1 条判为**迁移** | 见 §6.5（本步**必须**按该节执行，否则 exit 1） |

### 2.6 四条反向陷阱（给 C 做门禁证伪用，仿 step 1 的 V4）

① 把 `parseExam`/`parseExamStream`/`generateReference` 任一放进 `interface/` 文件（保留 `import { parseExamPaper… } from '…/infrastructure/ai/deepseek/index.js'`）⇒ **立刻 `interface-imports-infra`** —— 这正是「plan §S4 的 interface 落层不可照用」的实证。
② 把 `guards.js` 放 `infrastructure/` 而把 `classes.js` 留在 `interface/` ⇒ **`interface-imports-infra`**；反向（guards 在 interface、某个消费者在 infrastructure）⇒ **`infrastructure-imports-upper`** —— 证明 §2.3 的「共享守卫与其 15 个消费者必须同层」论证。
③ 把 `uploads.js`（`fs`/`path`/`multer`）挪进 `application/` ⇒ **`application-imports-external`**（3 条）。
④ 在 `interface/http/controllers/teacher/index.js` 里加一行 `export { parseExam } from '../../../../infrastructure/teacher/exam-parse.js';` ⇒ **门禁与 cycle-check 都不报**（F4 盲区）—— 用于证明该盲区真实存在，并提醒 C：**barrel 的层归属只能靠人读 + bind-check 的路径解析**，不能靠 check-layers。
（C 用 /tmp 副本做，**不得进仓库**。）

### 2.7 ★`__dirname` 的处置（本方案唯一的「等价前置重构」，独立成批 B0b）

**等价性已实测（4/4 EQUAL）**：`server/src/utils/projectPaths.js` 的 `ROOT = path.resolve(dirname(__filename),'..','..')` 由**它自己的位置**推出 `<repo>/server`，`UPLOADS_ROOT = ROOT/uploads`、`PROJECTS_ROOT = UPLOADS_ROOT/projects`、`STANDARDS_ROOT = UPLOADS_ROOT/project-questions`（均在 `projectPaths.js:78-87` **导出**）。实测对照：

| 今日写法（由 `controllers/` 推出） | 替换写法（由 `utils/` 推出） | 实测 |
|---|---|---|
| `path.join(__dirname,'../../uploads','project-questions/1/standard')` | `path.join(UPLOADS_ROOT,'project-questions/1/standard')` | **EQUAL** |
| `path.resolve(__dirname,'../../uploads/projects')` | `PROJECTS_ROOT` | **EQUAL** |
| `path.join(__dirname,'../../uploads/project-questions','7')` | `path.join(STANDARDS_ROOT,'7')` | **EQUAL** |
| `path.join(__dirname,'../../uploads/materials')` | `path.join(UPLOADS_ROOT,'materials')` | **EQUAL** |

⇒ **B0b = 5 行替换 + 2 行删除（`:1290` 的 `url` import、`:1292` 的 `__dirname` 声明）+ 2 个死绑定不导入**，落在**源文件仍在原路径**的前提下完成，因此可以用「改前 vs 改后」真运行时探针**直接对拍解析出的绝对路径**（§7.2-F00），把这条最危险的静默漂移变成**有证据的等价变换**。


---

## 3 HTTP 契约清单（含越权守卫与逐字文案）

### 3.1 挂载与中间件（实测）

- 挂载点：`server/src/app.js:97` `app.use('/api/teacher', teacherRoutes)`（:98 的 `/api/teacher/projects` 是**另一个** router，与本文件无关）
- 路由器：`server/src/routes/teacher.js:12-13` —— `const router = Router(); router.use(auth, requireRole('teacher'));` ⇒ **本文件全部 29 条路由共享 `auth`（`middleware/auth.js`）+ `requireRole('teacher')`（`middleware/role.js`）**
- **本文件没有任何路由级/方法级的额外中间件**（`upload-material` 的 multer **不在路由里**，它被包在 handler 内部 `:1316`；无 `projectAssetGuard`、无限流）
- 另：`server/package.json` 的 `pretest` = `node scripts/check-layers.mjs` ⇒ **每次 `npm test` 都会先跑分层门禁**（分层违规会让测试直接失败）
- `prisma` 直接调用 **71 处**（42 个不同 model.op 组合）；`prisma.$transaction` **4 处**（`:329` `:933` `:984` `:1121`）；`req.app.locals` **1 处**（`:271` `questionUseCases.create`）；`console.*` **9 处**；`logger.*` **40 处**；`Math.random()` **2 处**（`:1219` 临时学号、`:1300` multer 文件名）；`new Date()/Date.now()/toISOString()` **14 处**（`:364` `:507` `:534`×2 `:571`×2 `:689`×2 `:771` `:772` `:1219` `:1300`）

### 3.2 逐路由契约表（29 条；「拆后必须逐字不变」的清单）

> 表内「守卫分支」= 逐字保留的中文文案与状态码；「成功响应」= 状态码 + body 形状（**键序即 `JSON.stringify` 插入序**）。全部行号为本轮实测。

| # | 方法 + 路径（`/api/teacher` 前缀） | handler（源行） | 守卫分支（源行，**逐字保留**） | 成功响应（逐字） | 失败 |
|---|---|---|---|---|---|
| 1 | `PUT /switch-school` | `switchSchool`(71-81) | **无守卫**（直接 `user.update`） | 200 `{code:0,message:'切换成功',data:school}`(`:76`) | 500 `{code:2001,message:'服务器内部错误',data:null}` |
| 2 | `GET /my-schools` | `getMySchools`(832-843) | **无守卫** | 200 `{code:0,message:'ok',data:[school]}`(`:838`) | 500 |
| 3 | `GET /classes` | `getAllClasses`(845-868) | **无 schoolId → 200 空数组**(`:848`) | 200 `{code:0,message:'ok',data:[{…class,isTeamClass,ownerTeacherName}]}`(`:863`) | 500 |
| 4 | `POST /classes` | `createClass`(870-896) | **400/1001 '参数错误'**(`:874`) · **403/1003 '无权操作'**(`:877` 非本校) · **403/1003 '无权操作'**(`:880` teamIds ⊄ 本人团队) | 200 `{code:0,message:'创建成功',data:cls}`(`:891`) | 500 |
| 5 | `PUT /classes/:id` | `updateClass`(898-924) | **403/1003 '无权操作'**(`:905` 班级可见性) · **403/1003 '无权操作'**(`:910` teamIds ⊄ 本人团队) | 200 `{code:0,message:'更新成功',data:null}`(`:919`) | 500 |
| 6 | `DELETE /classes/:id` | `deleteClass`(926-944) | **403/1003 '无权操作'**(`:931`，在 `$transaction` **之外之前**) | 200 `{code:0,message:'删除成功',data:null}`(`:939`) | 500 |
| 7 | `PUT /classes/:id/switch-school` | `switchClassSchool`(946-1001) | **400/1001 '请选择目标学校'**(`:950`) · **404/1004 '班级不存在'**(`:957`) · **400/1001 '目标学校与当前学校相同'**(`:960`) · **403/1003 '无权操作'**(`:964` 非本班教师) · **★403/1003 '无权操作当前学校'**(`:971`) · **★403/1003 '你不属于目标学校'**(`:972`) | 200 `{code:0,message:'已从「旧校名」迁移至「新校名」（+，已退出团队：A、B）',data:{oldSchoolId,newSchoolId,school,removedTeams}}`(`:992-996`，**多行对象 + 模板串**) | 500 |
| 8 | `GET /questions` | `getQuestions`(85-108) | **无守卫**（`teacherId: req.user.id` 隐式收窄） | 200 `{code:0,message:'ok',data:{list,total,page,pageSize}}`(`:103`) | 500 |
| 9 | `GET /questions/:id/project-files` | `getProjectFiles`(124-157) | **404/1004 '题目不存在'**(`:130`) · **无附件 → 200 `{tree:[]}`**(`:131`) · **目录不存在 → 200 `{tree:[]}`**(`:134`) | 200 `{code:0,message:'ok',data:{tree,contents}}`(`:152`) | 500 |
| 10 | `GET /questions/:id` | `getQuestion`(110-122) | **404/1004 '题目不存在'**(`:116`) | 200 `{code:0,message:'ok',data:q}`(`:117`) | 500 |
| 11 | `POST /questions` | `createQuestion`(220-288) | project 分支：**400/1001 '参数错误'**(`:226`) · **400/1001 '标题不能超过200字'**(`:227`) · **400/1001 '题目材料过长'**(`:228`) · **★400/1001 '非法临时目录标识'**(`:231` 正则 `/^temp_\d+_[a-z0-9]+$/`) · **★400/1001 '非法临时目录标识'**(`:252` 越界复检)；code 分支：**400/1001 `err.message`**(`:279` `DomainError`) | project：200 `{code:0,message:'创建成功',data:q}`(`:266`)；code：同文案(`:276`) | 500(`:282` `:286`) |
| 12 | `PUT /questions/:id` | `updateQuestion`(290-356) | **404/1004 '题目不存在'**(`:294`) · **400/1001 '标题不能超过200字'**(`:297`) · **400/1001 '题目材料过长'**(`:298`) · **★400/1001 'attachmentUrl 格式非法'**(`:304`) · **400/1001 `e.message`**(`:326` 来自 `resolveSubQuestionScores`) | 200 `{code:0,message:'更新成功',data:null}`(`:316` `:351`) | 500 |
| 13 | `DELETE /questions/:id` | `deleteQuestion`(358-370) | **404/1004 '题目不存在'**(`:362`) | 200 `{code:0,message:'删除成功',data:null}`(`:365`) | 500 |
| 14 | `POST /parse-exam` | `parseExam`(374-393) | **400/1001 '请提供试卷内容'**(`:378`)（>80000 字**静默截断** `:381`） | 200 `{code:0,message:'解析完成，共提取 N 道题',data:result}`(`:388`) | 500 `{code:2001,message:'AI 解析失败: '+…,data:null}`(`:391`) |
| 15 | `POST /parse-exam-stream` | `parseExamStream`(395-422) | **400/1001 '请提供试卷内容'**(`:397`)；**无 `res.json`** | **SSE**：`res.writeHead(200,{Content-Type:'text/event-stream',Cache-Control:'no-cache',Connection:'keep-alive','X-Accel-Buffering':'no'})`(`:403-408`)，随后 `data: {phase:'start',totalChars}` → 多个 `data: {progress}` → `data: {phase:'done',questions,count}`(`:410-415`)；异常 → `data: {phase:'error',message:'AI 解析失败: '+…}`(`:418`)；`finally res.end()` | — |
| 16 | `POST /generate-reference` | `generateReference`(1326-1338) | **400/1001 '请提供题目内容'**(`:1329`，`!stem?.trim()`) | 200 `{code:0,message:'参考答案已生成',data:{answer}}`(`:1333`) | 500 `{code:2001,message:'AI 生成失败: '+…,data:null}`(`:1336`) |
| 17 | `POST /upload-material` | `uploadMaterial`(1315-1322) | **400/1001 `err.message`**(`:1317`；multer 的 fileFilter 抛 `'仅支持 zip 文件'` 见 `:1310`，超 50MB 抛 multer 自带文案) · **400/1001 '未选择文件'**(`:1318`) | 200 `{code:0,message:'上传成功',data:{url:'/uploads/materials/<file>',name:originalname}}`(`:1320`) | —（**无 500 分支**，回调式） |
| 18 | `GET /assignments` | `getAssignments`(578-697) | **classId 不可见/非法 → fail-closed 空集**(`:588`) · `keyword` trim 空则忽略(`:592`) · `status` 未识别 → 不筛 + `logger.warn`(`:515`) | 200 `{code:0,message:'ok',data:{list:[…+submissionCount,expectedCount,pendingReviewCount,latestSubmittedAt],total,page,pageSize}}`(`:692`) | 500 |
| 19 | `GET /assignments/:id` | `getAssignment`(699-716) | **404/1004 '作业不存在'**(`:708`)；**响应前 JS 层过滤软删题目**(`:710`) | 200 `{code:0,message:'ok',data:a}`(`:711`) | 500 |
| 20 | `POST /assignments` | `createAssignment`(718-790) | **400/1001 '参数错误'**(`:722`) · **★403/1003 '无权操作'**(`:728` classIds ⊄ 可见班级，**在任何查库/写库之前**) · **400/1001 '部分题目不存在或已删除，无法布置'**(`:741`) · **★★400/`code:1007`**(`:756-760`，Q9 软确认，body = `{code:1007,message:'以下题目未上传标准工程包，AI 将仅依据评分标准做评价式评分（不与参考答案对比）：<titles>。确认按开放性题目布置？',data:{requiresConfirmation:true,warnings:[{questionId,title,message}]}}`) | 200 `{code:0,message:'创建成功',data:assignment}`(`:785`) | 500 |
| 21 | `PUT /assignments/:id/lock` | `lockAssignment`(792-809) | **404/1004 '作业不存在'**(`:796`) · **★403/1003 '无权操作'**(`:797` `a.teacherId!==req.user.id`) | 200 `{code:0,message: locked?'已锁定':'已解锁', data:{id,locked}}`(`:804`) | 500 |
| 22 | `GET /pending-summary` | `getPendingSummary`(526-576) | **R5 fail-closed：非法 schoolId → 200 `{code:0,message:'ok',data:{pendingReview:0,aiPending:0,abnormal:0,updatedAt}}`**(`:533-535`) · **R16：classId 只在可见集内收窄，不可见 → 空范围（非放行、非报错）**(`:539`) | 200 `{code:0,message:'ok',data:{pendingReview,aiPending,abnormal,updatedAt}}`(`:571`) | 500 |
| 23 | `GET /teachers` | `getAllTeachers`(813-828) | **无守卫**（`role:'teacher', deletedAt:null`；有 schoolId 时收窄 `:817`） | 200 `{code:0,message:'ok',data:list}`(`:823`) | 500 |
| 24 | `GET /students` | `getMyStudents`(1005-1036) | **无 schoolId → 200 空数组**(`:1009`) · **classId 只在可见集内收窄**(`:1014`) · **零可见班级 → 200 空数组**(`:1017`) | 200 `{code:0,message:'ok',data:students}`(`:1031`) | 500 |
| 25 | `POST /students` | `addStudent`(1159-1190) | **400/1001 '参数错误'**(`:1163`) · **400/1001 '班级不存在'**(`:1168`) · **★403/1003 '无权操作'**(`:1171`，**在既有 400 分支之后**) · **400/1001 '学号已存在'**(`:1186` `P2002`) | 200 `{code:0,message:'新增成功',data:student}`(`:1184`) | 500 |
| 26 | `POST /students/batch` | `batchAddStudents`(1192-1285) | **400/1001 '参数错误'**(`:1196`) · **400/1001 '班级不存在'**(`:1201`) · **★403/1003 '无权操作'**(`:1204`，**在任何写库之前**) | 200 `{code:0,message:'成功导入 N 名，失败 M 名',data:{success,errors}}`(`:1280`)；**逐行容错**：单行失败进 `errors[]` 不中断(`:1274-1276`) | 500 |
| 27 | `PUT /students/:id` | `updateStudent`(1054-1111) | **404/1004 '学生不存在'**(`:1061`) · **403/1003 '无权操作'**(`:1064` 源归属) · **403/1003 '无权操作'**(`:1070` **body 目标班级**归属) · **400/1001 '该学号已被使用，无法保存'**(`:1084`) · **400/1001 '学号已存在'**(`:1107` `P2002`) | 200 `{code:0,message:'更新成功',data:null}`(`:1105`) | 500 |
| 28 | `PUT /students/:id/reset-password` | `resetStudentPassword`(1133-1157) | **404/1004 '学生不存在'**(`:1137`) · **★403/1003 '无权操作'**(`:1140`，**归属判定优先于业务分支，不泄漏学号状态**) · **400/1001 '该学生信息尚未补全，请先补全学号'**(`:1146`) | 200 `{code:0,message:'密码已重置为学号（<sid>）',data:null}`(`:1152`) | 500 |
| 29 | `DELETE /students/:id` | `deleteStudent`(1113-1131) | **403/1003 '无权操作'**(`:1118`，在 `$transaction` **之外之前**) | 200 `{code:0,message:'删除成功',data:null}`(`:1126`) | 500 |

**契约条目数 = 29 条路由**；**导出契约条目数 = 30 个名字**；**403/1003 分支 = 16 处**；**错误文案 = 39 条静态字面量 + 7 处变量/表达式拼接**（见 §3.4）。

### 3.3 ★越权守卫清单（任务书要求的三问，逐条实测）

| 问 | 实测 |
|---|---|
| 多少处 `res.status(403)`？ | **16 处**（`:728` `:797` `:877` `:880` `:905` `:910` `:931` `:964` `:971` `:972` `:1064` `:1070` `:1118` `:1140` `:1171` `:1204`） |
| 多少处 `code: 1003`？ | **16 处** —— **与 403 一一对应、无错配**（全部为 `{code:1003,message:…,data:null}`，**没有** reviewController 那种「403 带 data」的形态） |
| 有无「无 message」的非标准形状？ | **★没有。这是与 step 8 相反的结论。** 用「括号配平 + 字符串感知」的扫描器（`/tmp/tc-resp.cjs`）提取全部 **125 个 `res.json(...)`**（**200×39 / 400×30 / 403×16 / 404×10 / 500×30**），逐个检查 `message` 键：**125/125 都有 message**。<br>⚠️ **但有一处陷阱会让朴素 grep 误判**：`:201` 写的是 **`{ code: 1001, message, data: null }`（ES6 简写属性）** —— `grep 'message:'` 会漏掉它并误报「无 message」。**这类误判与 step 8 的「无 message 形状」不是一回事**，拆分时**必须逐字保留简写形式**，不得改写成 `message: message`。 |
| 守卫的三层结构 | **t4（按 id 直取）**：`lockAssignment`(`:797`)；**t6（班级维度）**：`createClass`/`updateClass`/`deleteClass`/`createAssignment`/`updateStudent`/`deleteStudent`/`addStudent`/`batchAddStudents`/`resetStudentPassword`；**R5/R16 fail-closed（不报错、收敛空集）**：`getPendingSummary`(`:533` `:539`)、`getAssignments`(`:588`)、`getMyStudents`(`:1014`)；**S-2 双校校验**：`switchClassSchool`(`:971` `:972`，**全仓唯一两条专属文案**) |
| 响应总账 | **125 个 json 响应 + 1 个 SSE（无 json）**；code 分布 `0×39 / 1001×29 / 1003×16 / 1004×10 / 1007×1 / 2001×30` |

**★必须逐字保留的 403 文案清单（`无权操作` 出现 14 次，另 2 条全仓唯一）**：

| 文案 | 处数 | 行号 |
|---|---|---|
| `'无权操作'` | **14** | 728 · 797 · 877 · 880 · 905 · 910 · 931 · 964 · 1064 · 1070 · 1118 · 1140 · 1171 · 1204 |
| `'无权操作当前学校'` | **1**（全仓唯一） | 971 |
| `'你不属于目标学校'` | **1**（全仓唯一） | 972 |

### 3.4 全部「逐字不变」文案清单（39 条静态字面量 + 7 处拼接）

**高频（≥2 次）**：`服务器内部错误`(×27) · `ok`(×18) · `无权操作`(×14) · `题目不存在`(×5) · `参数错误`(×5) · `创建成功`(×4) · `更新成功`(×4) · `删除成功`(×3) · `班级不存在`(×3) · `标题不能超过200字`(×2) · `题目材料过长`(×2) · `非法临时目录标识`(×2) · `请提供试卷内容`(×2) · `作业不存在`(×2) · `学生不存在`(×2) · `学号已存在`(×2)

**单次（22 条）**：`切换成功` · `评分完成` · `attachmentUrl 格式非法` · `解析完成，共提取 N 道题` · `部分题目不存在或已删除，无法布置` · `以下题目未上传标准工程包，AI 将仅依据评分标准做评价式评分（不与参考答案对比）：…。确认按开放性题目布置？` · `请选择目标学校` · `目标学校与当前学校相同` · `无权操作当前学校` · `你不属于目标学校` · `已从「…」迁移至「…」（+，已退出团队：…）` · `该学号已被使用，无法保存` · `该学生信息尚未补全，请先补全学号` · `密码已重置为学号（sid）` · `新增成功` · `成功导入 N 名，失败 M 名` · `未选择文件` · `上传成功` · `请提供题目内容` · `参考答案已生成` · `仅支持 zip 文件`（multer fileFilter 的 `new Error` 文案，:1310） · `已锁定`/`已解锁`（:804 三元）

**7 处变量/表达式拼接（不可静态枚举，必须逐字保留表达式）**：`:216` `'评分失败: '+(err.message||'未知错误')` · `:279` `err.message`(DomainError) · `:326` `e.message` · `:391` `'AI 解析失败: '+(err.message||'未知错误')` · `:804` `updated.locked?'已锁定':'已解锁'` · `:1317` `err.message`(multer) · `:1336` `'AI 生成失败: '+(err.message||'未知错误')`

### 3.5 「逐字不变」清单（B 的自检项，C 的核对项）

1. `routes/teacher.js` 的 **29 行路由声明体逐字不动** —— 采用 §6.4 的「双 barrel 合并」写法时，**这 29 行连 `teacher.` 前缀都不用改**。
2. 全部 **状态码 × body 键序**逐字不变（尤其 §3.2-#20 的 `code:1007` 与三键 `data`、§3.2-#15 的 SSE 4 个 header 与 `data: ` 前缀+双换行、§3.2-#7 的**多行对象**）。
3. 全部 **中文文案**逐字不变（含全角「」、顿号、括号、模板串里的空格数量）。
4. `router.use(auth, requireRole('teacher'))` 与挂载前缀 `/api/teacher` 不动。
5. **不得新增/删除/改名任何路由**（含 §1.5-3 的孤儿 `getMyClasses` —— 它虽无路由，仍在**导出面**契约内）。
6. **不得「顺手统一」`:756` 的 `code:1007` → `1001`**，**不得把 `:201` 的简写 `message` 展开**。

---

## 4 调用方与导出面（含 mock 排查）

### 4.1 直接 import 站点（**全仓仅 2 个**，一个不多）

实测方式：`grep -rn "teacherController"` 扫 `server/src` `server/test` `client/src` `scripts` `docs/` + `grep -rl` 扫 `tests/` 全树；逐条人读区分「真 import」与「注释/文本引用」。

| # | 文件:行（实测） | 今日写法 | 取的名字 | 拆分后 | 必须改？ | 风险 |
|---|---|---|---|---|---|---|
| **I1** | `server/src/routes/teacher.js:4` | `import * as teacher from '../controllers/teacherController.js';` | **29 个 handler 名**（`:16 :17 :20 :21 :22 :23 :24 :27 :28 :35 :36 :37 :38 :39 :40 :41 :42 :45 :46 :47 :48 :52 :83 :86 :87 :88 :89 :90 :91`） | 3 行（§6.4） | **是** | **高（唯一硬失败点）**：少一个名字 ⇒ 该条路由在 import 期或首访时爆 `does not provide an export named` |
| **I2** | `server/test/unit/assignment-q9-branches.test.js:41` | `const { createAssignment } = await import('../../src/controllers/teacherController.js');` | `createAssignment` | 改路径为 `'../../src/interface/http/controllers/teacher/assignments.js'`（或改指 T8 barrel，二者等价） | **是** | **中**：这会**打断 13 例既有单测**（`describe('createAssignment — Q9 无标准工程包分支')`）。⚠️ **bind-check 对它只有「unresolved（仅登记、不判违规）」**（实测 `bind-check` 输出 `unresolved relative imports : 4 (仅登记)`）⇒ **拦不住** ⇒ 必须**同批**改 + 真跑该套件 |

**非 import 的文本引用（不影响编译，不要求改，但需登记以免误导后人）**：
- `server/src/application/use-cases/question.use-cases.js:3`、`server/src/infrastructure/persistence/question.repository.js:3` 的**溯源注释**（"迁移来源：teacherController.createQuestion…"）—— 保留原文（历史定位注解）。★登记为「拆分后注释里的文件路径会失效」的已知文档债。
- `server/src/controllers/checkerController.js:37` 的 `// 与 teacherController:265 的 findFirst({ id, teacherId: req.user.id }) 同口径` —— 同上。
- `server/test/contract/use-cases-contract.test.js:88` 的 **it 标题字符串**（"teacherController.createQuestion(code 分支) → …"）—— 只是标题文本，**该文件不 import 控制器**（实测它只 import `compose.js`）⇒ 不改。
- `server/test/integration/question.test.js:12,154,194`、`assignment.test.js` 等共 **6 处注释**（含已失效的 `teacherController.js:330` `:35`）—— 同上。
- `server/test/e2e/global.setup.js:60` 的注释 `（teacherController.js:13 getSchoolId）` —— 同上。
- **`tests/ui-redesign-verify/rig-server/{src/controllers/teacherController.js, src/routes/teacher.js:4}`**：这是 **UI 验收装置内的一棵冻结副本**（**1231 行**，与主树不同版本 ⇒ 取自更早的提交）。**本步绝对不碰**（`tests/` 属硬禁令）；它由装置自用。★提醒 C：**不要把它误当成第二个调用方**。

### 4.2 jest 路径键控 mock 排查（step 1 的 H1 类单点故障）

- `grep -rn "jest\.mock(" server/test` ⇒ **0 命中**（整个 server/test 树 72 个 `.test.js` **没有任何 jest.mock**，更没有以 `../controllers/teacherController.js` 为键的 mock）。
- `server/test/jest.config.js` 实测：`transform: {}`（无 babel/ts 转译）、`moduleNameMapper: {'^(\.{1,2}/.*)\.js$': '$1'}`、`setupFiles: ['./test/setup.js']`、`testMatch: ['<rootDir>/test/**/*.test.js']`。
  - ⚠️ **`testMatch` 只收 `.test.js`** ⇒ `server/test/e2e/*.spec.js`（Playwright）**不在 jest 全量口径内**（见 §5.1 的覆盖口径说明）。
  - `moduleNameMapper` 对新增文件的路径解析**无影响**；但若 B 写错相对层级，jest 会在**运行期**报 `Cannot find module`，而 `lint-check` 的 `no-unresolved-import` 与 `bind-check` 可**静态提前拦住**（§11-V14）。
- **⇒ 结论：本步不存在 H1 类单点故障**（无 mock 键）。本步**唯一的「路径键」风险是 I2 的动态 import**（§4.1）与 `docs/pipeline/lint-baseline.json` 的 `file` 字段（§6.5）。

### 4.3 前端调用方（影响「契约是否真的在被使用」，不改代码）

`grep -rn "/teacher/" client/src` 实测全部站点。**与 §5.3「零测试路由」交叉后的关键结论**：

| 零测试路由 | 前端调用方（实测） | 判定 |
|---|---|---|
| `PUT /switch-school` | `views/teacher/Layout.vue:296` | **在用，无测试** |
| `PUT /classes/:id/switch-school` | `views/teacher/Classes.vue:166` | **在用，无测试** |
| `POST /parse-exam-stream` | `composables/question/useExamImport.js:50`（`fetch` 直连） | **在用，无测试** |
| `POST /generate-reference` | `composables/question/useAiReference.js:25` | **在用，无测试** |
| `GET /questions/:id/project-files` | `composables/project/useLoadQuestion.js:30` | **在用，无测试** |
| `PUT /assignments/:id/lock` | `views/teacher/Assignments.vue:469` | **在用，无测试** |
| `GET /teachers` | `views/teacher/TeamEdit.vue:129` | **在用，无测试** |
| `POST /parse-exam` | **0**（前端只走 stream 版） | 仅 e2e `prod-*` 打靶 |
| `POST /upload-material` | **0** | **零调用方 + 零测试** |
| `GET /my-schools` | **0** | **零调用方 + 零测试** |
| `getMyClasses`（无路由） | **0** | **零路由 + 零调用方 + 零测试** |

⇒ **8 条零测试路由是真实用户面**（不是死代码）⇒ **B0 补测是必需项，不是可选项**。

### 4.4 导出面（30 名，二分自证）

今日导出面（AST + 正则双算，**30** 个，无 `export {}` 块 / 无 default / 无 `export *`）：
```
addStudent batchAddStudents createAssignment createClass createQuestion deleteClass
deleteQuestion deleteStudent generateReference getAllClasses getAllTeachers
getAssignment getAssignments getMyClasses getMySchools getMyStudents getPendingSummary
getProjectFiles getQuestion getQuestions lockAssignment parseExam parseExamStream
resetStudentPassword switchClassSchool switchSchool updateClass updateQuestion
updateStudent uploadMaterial
```
- **29 个被 `routes/teacher.js` 取用**（脚本实测：`exports=30 usedInRoutes=29`）。
- **1 个未被路由取用：`getMyClasses`**（§1.5-3）。

---

## 5 ★测试覆盖现状与「先补测试」清单

> **本节的判定是静态 + 人读**（A 角色禁令：不跑 jest）。方法与依据：① 用**方法感知**的扫描器从 72 个 `.test.js` 里抽取 **全部 `method(literalPath)` 对**（含 `del` 别名 —— ★这是本步最容易漏的一处：`ownership-guards.test.js` 用的是 `api(token).del(...)`，**朴素的 `\.delete(` 扫描会漏掉 3 条 `DELETE /classes/:id` 与 3 条 `DELETE /students/:id`**，我第一遍就漏了）；② 逐套件人读状态码；③ **关键：判断是否在守卫处短路**（step 3 的陷阱 ——「传递加载了模块但函数一行未执行」）。本文件是 controller，**每个套件都经真实 HTTP + 真实 DB 走到 handler 体内或守卫的 `return` 处**，不存在「只加载不执行」的中间态；真正的盲区是**「整条路由无任何请求」**。

### 5.1 覆盖口径声明（★先立口径，否则数字会被误读）

- **判定覆盖的只有 `npm test` 的四段 jest**（`server/test/**/*.test.js`，**72 个文件**）。
- `server/test/e2e/*.spec.js`（19 个文件，**Playwright，`npm run test:e2e`**）**不在 DoD 的全量口径内**，且其中 `prod-*.spec.js` / `security-prod-test.js` 面向**已部署实例**。它们对 §5.3 的空白**只有部分、且不可在本轮复算的覆盖** —— 我在表中单列，**不计入「已覆盖」**。
- `tests/` 下的命中全部是**装置内的源码副本 / 构建产物**，**不是测试**（§4.1 末条）。

### 5.2 覆盖矩阵（逐路由；命中数 = 该方法+该路径字面量的出现次数，实测）

| # | 路由 | 主覆盖套件（实测命中数） | 覆盖形态 | 断言强度 |
|---|---|---|---|---|
| 1 | `PUT /switch-school` | **无** | — | **无** |
| 2 | `GET /my-schools` | **无** | — | **无** |
| 3 | `GET /classes` | `student-v2:1` · `ownership-guards:2`（`?schoolId=`）· e2e `global.setup:2` | 正例（含 `isTeamClass`/`ownerTeacherName`） | 中 |
| 4 | `POST /classes` | `ownership-guards:2`（R7/R8：403 两态）· e2e `global.setup:1` | **反例 + e2e 正例** | 中（jest 侧无 200 正例） |
| 5 | `PUT /classes/:id` | `ownership-guards:8`（T1/T2/T3/T13/T14/R5/R6/R24） | **正例 + 403 反例 + 零写入** | **强** |
| 6 | `DELETE /classes/:id` | `ownership-guards:3`（T4/T5/T18） | **正例 + 403 反例 + 级联零写入** | **强** |
| 7 | `PUT /classes/:id/switch-school` | **无** | — | **无** |
| 8 | `GET /questions` | `question:3`（含 keyword/pageSize）· `admin-teacher-delete:1` · `auth:2` · e2e | 正例 + 过滤 | 中 |
| 9 | `GET /questions/:id/project-files` | **无** | — | **无** |
| 10 | `GET /questions/:id` | `question:4` | 正例 | 中 |
| 11 | `POST /questions` | `question:12` · `assignment:3` · `open-project-flow:2` · `ownership-guards:5` | **正例 + 403 + 多分支** | **强** |
| 12 | `PUT /questions/:id` | `question:2` · `assignment:1` | 正例 | 中 |
| 13 | `DELETE /questions/:id` | `question:1` · `assignment:2` | 正例（软删） | 中 |
| 14 | `POST /parse-exam` | **无（jest）**；e2e `question-bank:2` `full-e2e:1` `prod-*:3` | 仅 e2e | **无（jest）** |
| 15 | `POST /parse-exam-stream` | **无（jest）**；e2e 未见 | — | **无** |
| 16 | `POST /generate-reference` | **无（jest）**；e2e `prod-*:3` | 仅 prod e2e | **无（jest）** |
| 17 | `POST /upload-material` | **无** | — | **无** |
| 18 | `GET /assignments` | `teacher-pending-summary:13` · `assignment:3` · `qa-batch1:3` · `t4:1` `t5:1` · `ownership-guards:7` | **正例 + status 5 态 + classId fail-closed + keyword** | **强** |
| 19 | `GET /assignments/:id` | `assignment:3` | 正例 | 中 |
| 20 | `POST /assignments` | `assignment:7` · `open-project-flow:2` · `ownership-guards:7` · **`unit/assignment-q9-branches:13`（直驱 + prisma 打桩）** | **正例 + 403 + Q9 `code:1007` 全分支** | **最强** |
| 21 | `PUT /assignments/:id/lock` | **无**（`repositories.test.js:238` 只是标题里含 `locked`） | — | **无** |
| 22 | `GET /pending-summary` | `teacher-pending-summary:14` · `qa-batch1:6` · `t4:1`（含 `schoolId=abc` fail-closed）· `t5:1` | **正例 + R5/R16 + 跨校** | **强** |
| 23 | `GET /teachers` | **无（jest）**；e2e `setup-test-data:1` | 仅 e2e 装置 | **无（jest）** |
| 24 | `GET /students` | `student:3` · `student-v2:8` · `ownership-guards:3` | 正例 + classId 收窄 | **强** |
| 25 | `POST /students` | `student:3` · `student-v2:1` · `ownership-guards:3`(R12/R14) | 正例 + 403 | **强** |
| 26 | `POST /students/batch` | `student-v2:5` · `student:1` · `ownership-guards:1`(R13) | 正例（含 tmp 学号）+ 403 | **强** |
| 27 | `PUT /students/:id` | `student:1` · `student-v2:2` · `ownership-guards:8`(T6/T7/T8/T15/R11) | 正例 + 404 形状 + 403 双态 + 零写入 | **最强** |
| 28 | `PUT /students/:id/reset-password` | `student-v2:3` · `ownership-guards:3`(T9/T10/T16) | 正例（文案逐字）+ 403 + 哈希不变 | **强** |
| 29 | `DELETE /students/:id` | `student:1` · `ownership-guards:3`(T11/T12/T17) | 正例 + 403 + 级联零写入 | **强** |

**覆盖统计**：**19/29 有 jest 覆盖**（其中 **12 条**有正例+反例双向断言）；**10/29 jest 零覆盖**。

### 5.3 ★零覆盖清单（逐条给依据）—— 这就是 B0 的打靶表

**A. 整条路由零覆盖（10 条，jest 口径）**

| # | 路由 / handler（源行） | 依据（实测） |
|---|---|---|
| **Z1** | `PUT /classes/:id/switch-school` / `switchClassSchool`(**946-1001**，56 行) | 全仓 `server/test` 对 `switch-school` 的命中 = **0**（`grep -rn "switch-school" server/test --include=*.test.js` 空）。**它是本文件最长的零覆盖 handler**，且含 **2 条全仓唯一的 403 文案**（`:971` `'无权操作当前学校'`、`:972` `'你不属于目标学校'`）、1 个 `$transaction`(`:984`)、1 次 `teamClass.deleteMany`(`:986`)、1 段拼接成功文案(`:992-996`)。**前端在用**（`Classes.vue:166`） |
| **Z2** | `PUT /assignments/:id/lock` / `lockAssignment`(**792-809**) | `grep -rn "/lock" server/test --include=*.test.js` 唯一命中是 `repositories.test.js:238` 的**标题文字**（断言 `select` 形状），**不是该路由**。前端在用（`Assignments.vue:469`）。两条分支（404 作业不存在 / 403 teacherId 不符）与三元文案 `'已锁定'`/`'已解锁'` 全空 |
| **Z3** | `GET /questions/:id/project-files` / `getProjectFiles`(**124-157**) | `grep project-files server/test` = **0**。**四条分支全空**：`:130` 404 题目不存在 / `:131` 无 `attachmentUrl` → `{tree:[]}` / `:134` 目录不存在 → `{tree:[]}` / `:152` 有包 → `{tree,contents}`（**含 `fs.readFileSync` 与 `'// 无法读取文件内容'` 兜底**）。前端在用（`useLoadQuestion.js:30`） |
| **Z4** | `POST /parse-exam` / `parseExam`(**374-393**) | jest 0 命中；仅 e2e `question-bank.spec.js:98,114` 等。**400 与 200 两条分支在 jest 侧全空**，且 `>80000` 字静默截断(`:381`)无断言 |
| **Z5** | `POST /parse-exam-stream` / `parseExamStream`(**395-422**) | jest **与** e2e 均 0 命中。**SSE 契约**（4 个 header + `data: ` 前缀 + 双换行 + `phase:start/progress/done/error` 四态 + `res.end()`）**完全无保护**。前端在用（`useExamImport.js:50` 直连 `fetch`）⇒ ★**本步最脆的一条** |
| **Z6** | `POST /generate-reference` / `generateReference`(**1326-1338**) | jest 0；仅 `prod-*` e2e。前端在用（`useAiReference.js:25`） |
| **Z7** | `POST /upload-material` / `uploadMaterial`(**1315-1322**) | jest **与** e2e 全 0，**且前端 0 调用方**。含 **multipart 解析 + 磁盘写 + 扩展名白名单**（`:1310` `'仅支持 zip 文件'`）、`:1318` `'未选择文件'`、50MB 上限(`:1306`) |
| **Z8** | `PUT /switch-school` / `switchSchool`(**71-81**) | `grep switch-school server/test` = **0**。前端在用（`Layout.vue:296`）。**一条 200 + 一条 500** |
| **Z9** | `GET /my-schools` / `getMySchools`(**832-843**) | `grep my-schools server/test` = **0**。前端 0 调用方。一条 200 |
| **Z10** | `GET /teachers` / `getAllTeachers`(**813-828**) | `grep "api/teacher/teachers" server/test` = **0**；e2e `setup-test-data.js` 有。前端在用（`TeamEdit.vue:129`）。两条分支（无 schoolId / 有 schoolId 收窄） |

**B. 分支级零覆盖（在「已覆盖」的路由内部）**

| # | 零覆盖分支（源行） | 依据 / 置信度 |
|---|---|---|
| **Z11** | `createClass` 的两个 403（`:877` 非本校 / `:880` teamIds）—— **jest 侧无 200 正例** | `ownership-guards` R7/R8 只打 403；200 正例只在 e2e `global.setup`。**中置信** |
| **Z12** | `getMyStudents` 的 `!schoolId → []`(`:1009`) 与 `classIds.length===0 → []`(`:1017`) | `student-v2` 的 8 条都带 `?schoolId=&classId=`；未见空 schoolId / 零可见班级夹具。**中置信（登记待 C 复核）** |
| **Z13** | `getMyClasses`(`:1038-1052`) —— **无路由，任何集成测试都到不了** | 全仓无路由声明。**只能直调测试**；本方案**建议不测**（不可达，见 §5.4-T-G） |
| **Z14** | `updateStudent` 的 `newUsername`/`tmp_` 分支(`:1077-1089`) 与 `'(待补全)'` 改密分支(`:1092-1097`) | `student-v2` 有 tmp 流程夹具，**大概率覆盖但未逐行确认**。**低置信** |
| **Z15** | `batchAddStudents` 的三条子分支（只姓名→tmp 学号 `:1218-1232` / 只学号→待补全 `:1235-1254` / 完整 `:1257-1273`） | `student-v2:5` 例。**低置信** |
| **Z16** | `createQuestion` 的 project 分支 + `tempId` 目录搬迁（`:248-263`，**含 `fs.mkdirSync`/`fs.renameSync`**）与 `:252` 的越界 400 | `POST /questions` 有 17 次命中，但**是否含 `tempId` + `type:'project'` 的真写盘夹具未确认**。**低置信** |
| **Z17** | `getAssignments` 的 `status` 未识别 → `logger.warn`(`:515`) 的**副作用**断言 | `status=not_a_status` 有请求，但未断言 warn 被调用。**低置信** |
| — | 11 个段间空行 + 11 条横幅 + S0/S9 的 import 面 | 无行为语义（搬移时空行**不搬**、横幅**随段搬**、import **重排**） |

### 5.4 「先补契约测试再拆」的具体建议（**结论：必须补；只补 6 组 / 约 23 例；硬性先于任何搬移**）

plan §4 的排序原则明写「S4/S5 最难，**先补契约测试再动**」；实测支持这一结论，且**范围比 step 8 更大**：step 8 只有 3 处真空洞（Z1/Z3/Z4），本步有 **10 条整路由零覆盖**、其中 **8 条是真实用户面**。

| 建议编号 | 补什么 | 断言口径（**只读现状、不改代码**） | 成本 |
|---|---|---|---|
| **T-A** ★最高价值 | `PUT /api/teacher/classes/:id/switch-school`（**Z1**）· **7 例** | ① 缺 `newSchoolId` → 400 `{code:1001,message:'请选择目标学校',data:null}`；② 不存在班级 → 404 `'班级不存在'`；③ `newSchoolId === cls.schoolId` → 400 `'目标学校与当前学校相同'`；④ 非本班教师 → 403 `'无权操作'`；⑤ 教师不在**旧**校 → 403 **`'无权操作当前学校'`**；⑥ 教师不在**新**校 → 403 **`'你不属于目标学校'`**；⑦ 合法 → 200，`message` **逐字**等于 `已从「A校」迁移至「B校」，已退出团队：T1、T2`（含全角「」与顿号），`data` = `{oldSchoolId,newSchoolId,school,removedTeams}`，**回读 DB**：`class.schoolId` 已改、该班 `teamClass` 行数 = 0。①-⑥ 全部断言**零写入**（class.schoolId 与 teamClass 行数不变） | **低**（1 个新文件 / 7 例；纯 HTTP + 真实 DB，零 AI、零磁盘） |
| **T-B** | `PUT /api/teacher/assignments/:id/lock`（**Z2**）· **3 例** | ① 不存在 → 404 `'作业不存在'`；② 他人作业（`teacherId` 不符）→ 403 `'无权操作'` 且 `locked` 不变；③ 本人作业**连续调用两次** → 第一次 `message:'已锁定', data:{id,locked:true}`、第二次 `'已解锁', locked:false` ⇒ 覆盖 `:804` 的三元两态 | **极低**（复用 `assignment.test.js` 的教师/作业夹具，3 例） |
| **T-C** | `GET /api/teacher/questions/:id/project-files`（**Z3**）· **4 例** | ① 非 project 题 / 他人题 / 不存在 → 404 `'题目不存在'`；② project 题且 `attachmentUrl=null` → 200 `{code:0,message:'ok',data:{tree:[]}}`（**只有 tree 键，没有 contents** —— `:131` 的早退形状）；③ project 题 + 真实标准包目录（`uploads/project-questions/{id}/standard`）→ 200 且 `data.tree.length>0`、`data.contents['<文件名>']` **逐字**等于写入内容；④ **对照**：存在 `attachmentUrl` 但目录不存在 → 200 `{tree:[]}`（`:134`） | **中**（1 个新文件 / 4 例；需在 `server/uploads/` 造/清目录，**必须自建自清**） |
| **T-D** ★磁盘副作用 | `POST /api/teacher/upload-material`（**Z7**）· **3 例** | ① 非 zip（`.txt`）→ 400 `{code:1001,message:'仅支持 zip 文件',data:null}`；② 不带文件 → 400 `'未选择文件'`；③ 合法 zip → 200 `{code:0,message:'上传成功',data:{url,name}}`，`data.url` 匹配 `/^\/uploads\/materials\/\d+_[a-z0-9]+\.zip$/`，`data.name` 逐字等于原始文件名，**并断言 `fs.existsSync(path.join(serverRoot,'uploads/materials',basename(url)))` 为真**；**finally 删除该文件**（★本步唯一会往磁盘写东西的用例） | **中**（1 个新文件 / 3 例；multipart 用 `supertest.attach`；**必须自清**） |
| **T-E** ★SSE | `POST /api/teacher/parse-exam-stream`（**Z5**）· **2 例** | ① `content` 空 → 400 `'请提供试卷内容'`；② 合法 → 断言 **header 四面**（`content-type: text/event-stream`、`cache-control: no-cache`、`connection: keep-alive`、`x-accel-buffering: no`）+ **原始响应体**按 `\n\n` 切分后逐片解析：首片 `{phase:'start',totalChars:N}`、末片 `{phase:'done',questions,count}`，且文本以 `data: ` 开头。★**必须用 `globalThis.fetch` 替身**（硬禁网）：探针在 import 前替换 `globalThis.fetch`，并在用例末尾断言替身**被调用 ≥1 次** | **中高**（SSE 的 supertest 读取需处理流式响应体；1 个新文件 / 2 例 + fetch 替身） |
| **T-F** | 学校切换 / 教师列表（**Z8/Z9/Z10**）· **4 例** | ① `PUT /switch-school` `{schoolId}` → 200 `{code:0,message:'切换成功',data:school}` 且回读 `user.lastSchoolId` 已改；② `GET /my-schools` → 200 `data` 为该校数组且**只含本人关联的学校**（用第二教师做负控）；③ `GET /teachers` 不带 schoolId → 200 含全部教师；④ 带 `?schoolId=` → `data` 恰为该校教师集合（**集合相等**，含第二校教师不在其中） | **低**（4 例；复用 `ownership-guards` 的 tokenA/tokenB 与两校夹具） |
| ~~T-G~~ | ~~`getMyClasses` 直调 1 例~~ | **建议不做**：该 handler **无任何路由**（§1.5-3），集成测试到不了、直调测试只能锁住一个不可达函数；**它的保护来自「逐字搬移 + 导出面 30 名不变」**，不来自行为测试 | — |
| ~~T-H~~ | ~~`createAssignment` 的 `code:1007`~~ | **已覆盖**：`unit/assignment-q9-branches.test.js` 13 例中已含 1007 分支（`:100-213`）。**无需补** | — |

**成本汇总**：**6 组 / 约 23 例 / 5–6 个新测试文件**，全部是**纯 HTTP + 真实 DB + 本地替身**，**零出网、零新依赖**；参照 `t4/t5/t6/t7` 与 `rc-*` 的既有写法（每套件 150–400 行），**预估 1 个执行单元（≈半天）**。
**收益**：把 **10 条零覆盖路由**（其中 **8 条真实用户面**，含全仓唯一的 2 条 403 文案、SSE 契约、磁盘上传）从「只能靠切片判等」升级为「切片判等 + 真行为对拍双保险」。

**★顺序要求（硬）**：T-A…T-F 必须作为 **B0（独立提交，先于 B0b 与任何搬移）** 落地，并在日志里记录「补测后全量 0 failed」；**不得与搬移或 B0b 写在同一提交**（plan §6「不在同一提交里既拆文件又改行为」的同构要求）。

---

## 6 目标模块划分

### 6.1 前置裁定：plan §S4 的两处落层建议

| plan §S4 建议 | 门禁实测裁定 | 依据 |
|---|---|---|
| `interface/http/controllers/teacher/{questions,assignments,classes,students,files}.js` | **部分可行**：26 个契约名可行，**4 个单元不可行** | §2.3：`parseExam`/`parseExamStream`/`generateReference`/`gradeProject` 的 deepseek 边（**静态 + 动态各一次**）⇒ `interface-imports-infra` |
| `application/use-cases/teacher/*.js` + 「目标：薄控制器 <100 行」 | **不可行（0 个单元）** | §2.3：指纹 A/B 硬否决；`QuestionUseCases` 已存在且已接线（`compose.js:32`），再建用例层只能是「给 71 处 Prisma 直查换皮」= 结构性改造（违反 plan §6）。**「薄控制器 <100 行」在本步不可达**：26 个 interface 单元里 17 个是 Prisma 直查 + `res.json` 的 HTTP 翻译，行数必然留在 interface |

### 6.2 对照表（源行号 = §1.2 实测；预估行数 = 搬移行数 + 新增 banner/import/export 块；**全部 < 800**）

| # | 目标文件（层） | 搬移内容（**源文件行号，逐字**） | 搬移行数 | 预估总行数 |
|---|---|---|---|---|
| **T1** | `interface/http/controllers/teacher/guards.js`（**interface**） | 13-67（含 6 条 JSDoc） | 55 | **≈64** |
| **T2** | `interface/http/controllers/teacher/school.js`（interface） | 69-81 | 13 | **≈22** |
| **T3** | `interface/http/controllers/teacher/questions.js`（interface） | 83-158 · 219-370（**跳过 159-218 的 gradeProject**） | 228 | **≈244** |
| **T4** | `interface/http/controllers/teacher/assignments.js`（interface） | 424-809（含双横幅 424/426 与 :426-433 的 8 行口径注释） | 386 | **≈400** |
| **T5** | `interface/http/controllers/teacher/teachers.js`（interface） | 811-828 | 18 | **≈27** |
| **T6** | `interface/http/controllers/teacher/classes.js`（interface） | 830-1001 | 172 | **≈184** |
| **T7** | `interface/http/controllers/teacher/students.js`（interface） | 1003-1285 | 283 | **≈296** |
| **T8** | `interface/http/controllers/teacher/index.js`（interface，**barrel**） | 无搬移；6 行 re-export（§6.3） | 0 | **≈34** |
| **T9** | `infrastructure/teacher/exam-parse.js`（**infrastructure**） | 372-422 | 51 | **≈59** |
| **T10** | `infrastructure/teacher/grade.js`（infrastructure） | **159-218**（gradeProject，死代码）+ 1324-1338（generateReference） | 75 | **≈88** |
| **T11** | `infrastructure/teacher/uploads.js`（infrastructure） | 1288-1322（横幅 + 第二段 import + multer 配置 + handler） | 35 | **≈45** |
| **T12** | `infrastructure/teacher/index.js`（infrastructure，**barrel**） | 无搬移；3 行 re-export（§6.3） | 0 | **≈16** |
| — | 源文件 `server/src/controllers/teacherController.js` | **整体删除** | −1338 | 0 |

- **搬移总量校验**：55+13+228+386+18+172+283+51+75+35 = **1316**；加 **11 行 import 面**（:1-11，被重排而非搬移）+ **11 个段间空行**（:12 :68 :82 :371 :423 :810 :829 :1002 :1286 :1287 :1323，**不搬**）= **1338** ✔（脚本逐行集合运算：`UNMAPPED NON-BLANK = 0`、`DOUBLE-MAPPED = 0`）
- **最大新文件 T4 ≈400 行 ≪ 800**；观察带（>500）**无新增**（现有 13 个不含任何新文件）。
- **门禁预期**：GodFile **2 → 1**；未分层 **43 → 42**；扫描文件 **106 → 117**（+12 −1）；`layerViolations` 恒 **0**；SCC 恒 **0**。

### 6.3 两个 barrel 的汇总导出（导出面 = 今日实测 30 名，**26 + 4 二分，一个不多一个不少**）

```js
// T8 · server/src/interface/http/controllers/teacher/index.js（新建；相对路径写全 .js）
export { switchSchool } from './school.js';
export { getQuestions, getQuestion, getProjectFiles, createQuestion, updateQuestion, deleteQuestion } from './questions.js';
export { getPendingSummary, getAssignments, getAssignment, createAssignment, lockAssignment } from './assignments.js';
export { getAllTeachers } from './teachers.js';
export { getMySchools, getAllClasses, createClass, updateClass, deleteClass, switchClassSchool } from './classes.js';
export { getMyStudents, getMyClasses, updateStudent, deleteStudent, resetStudentPassword, addStudent, batchAddStudents } from './students.js';
// ★本文件绝不 re-export infrastructure/ 的任何名字（check-layers 对 export-from 失明，见 §2.1-F4）
```
```js
// T12 · server/src/infrastructure/teacher/index.js（新建）
export { parseExam, parseExamStream } from './exam-parse.js';
export { generateReference } from './grade.js';
export { uploadMaterial } from './uploads.js';
```
- **★警告（barrel 的导出面纪律）**：`check-layers` 与 `cycle-check` 对 `export { … } from` **完全不可见**（F4），**`bind-check` 是唯一能验它的门禁**。因此两个 barrel **只允许**导出上表列出的名字（**T8 只导 26 个、T12 只导 4 个**）。**不得**用 `export * from`（bind-check 的已知盲区）。
- **★`gradeProject` 不进 T12 的导出面**：它是死代码，**不加 `export`**（加了会多出第 31 个名字，破坏导出面等价，且会让 `no-unused-vars` 消失 → 迁移识别失效，见 §6.5）。
- **★内部名不进 barrel**：T1 的 6 个守卫名（`getSchoolId` 等）只被**同层同目录**的 T4/T5/T6/T7 以 `./guards.js` 直接 import，**不进任何 barrel**（它们是**新增的 6 个模块级导出名**，但**不在 `teacher.*` 的 30 名契约面里**）。
- 命名对齐既有层内文件（kebab-case / 语义名）：`guards` `school` `questions` `assignments` `teachers` `classes` `students` `exam-parse` `grade` `uploads`。两个目录均为**新建**（实测不存在）。

### 6.4 import 重排清单（唯一允许「不逐字」的行 → 由 §1.1 的引用扫描器**自动推导**）

| 目标文件 | 新 import 行 |
|---|---|
| **T1** `guards.js` | `import prisma from '../../../../utils/prisma.js';` / `import { getVisibleClassIds, getMyTeamIds } from '../../../../controllers/teamController.js';` ⇒ 末尾 `export { getSchoolId, canTeacherManageClass, canTeacherManageStudent, canTeacherManageClasses, canTeacherManageTeams, isTeacherInSchool };` |
| **T2** `school.js` | `prisma` / `logger`（`../../../../utils/`） |
| **T3** `questions.js` | `prisma` / `logger`（`../../../../utils/`）/ `import fs from 'fs';` / `import path from 'path';` / `import { DomainError } from '../../../../domain/errors.js';` / `import { resolveSubQuestionScores } from '../../../../utils/scoring.js';` / `import { UPLOADS_ROOT, PROJECTS_ROOT, STANDARDS_ROOT } from '../../../../utils/projectPaths.js';` |
| **T4** `assignments.js` | `prisma` / `logger`（`../../../../utils/`）/ `import { ABNORMAL_FEEDBACK } from '../../../../constants.js';` / `import { getVisibleClassIds } from '../../../../controllers/teamController.js';` / `import { hasStandardPackage } from '../../../../utils/projectPaths.js';` / `import { getSchoolId, canTeacherManageClasses } from './guards.js';` |
| **T5** `teachers.js` | `prisma` / `logger` / `import { getSchoolId } from './guards.js';` |
| **T6** `classes.js` | `prisma` / `logger` / `import { getVisibleClassIds } from '../../../../controllers/teamController.js';` / `import { getSchoolId, canTeacherManageClass, canTeacherManageTeams, isTeacherInSchool } from './guards.js';` |
| **T7** `students.js` | `prisma` / `logger` / `import bcrypt from 'bcryptjs';` / `import { getVisibleClassIds } from '../../../../controllers/teamController.js';` / `import { getSchoolId, canTeacherManageClass, canTeacherManageStudent } from './guards.js';` |
| **T8** `index.js` | 无 import，仅 6 行 re-export（§6.3） |
| **T9** `exam-parse.js` | `import { parseExamPaper, parseExamPaperStream } from '../ai/deepseek/index.js';`（**同层**） |
| **T10** `grade.js` | `prisma` / `logger`（`../../utils/`）/ `import fs from 'fs';` / `import path from 'path';` / `import { hasStandardPackage, UPLOADS_ROOT } from '../../utils/projectPaths.js';` / `import { generateReferenceAnswer } from '../ai/deepseek/index.js';` |
| **T11** `uploads.js` | `import multer from 'multer';` / `import fs from 'fs';` / `import path from 'path';` / `import { UPLOADS_ROOT } from '../../utils/projectPaths.js';`（**★不再需要 `url`/`fileURLToPath`**） |
| **T12** `index.js` | 无 import，仅 3 行 re-export（§6.3） |
| **I1** `routes/teacher.js` | `:4` 一行 → 三行：`import * as teacherHttp from '../interface/http/controllers/teacher/index.js';` / `import * as teacherIo from '../infrastructure/teacher/index.js';` / `const teacher = { ...teacherHttp, ...teacherIo };`（**其余 29 行路由声明体逐字不动**） |
| **I2** `server/test/unit/assignment-q9-branches.test.js` | `:41` `'../../src/controllers/teacherController.js'` → `'../../src/interface/http/controllers/teacher/assignments.js'` |

- **绑定完备性保证**：上表由脚本对「声明 → 引用」关系求闭包后生成（13 条 import × 20 个绑定 + 2 条动态 import），**实测只有 2 个零引用绑定**（`DEFAULT_MAX_SCORE` / `getTeamTeacherIds`），二者**按 §6.5 不复制到任何新文件**（它们本来就没有消费者）。
- **★过度导入是硬伤**：**不得**把源文件的 11 行 import 头整段复制到每个新文件 —— 那会让 lint-check 立刻产生 **fresh `no-unused-vars`**（键含 file，且文本与旧行不同 ⇒ 迁移识别不配对 ⇒ **exit 1**）。每个新文件的 import **只列上表为它规定的那几行**。
- **边保持性**：今日 12 条相对出边（prisma / domain-errors / logger / constants / scoring / teamController / projectPaths / deepseek 静态 / deepseek 动态 / fileTree 动态）**全部保留**，只换宿主；**不新增任何第三方依赖**（新增的只有 6 条**同层内部边**：`{assignments,teachers,classes,students} → guards`）。barrel 的 re-export **不计边**。

### 6.5 ★★lint 判据 (b) 的处置（本步**唯一**必须由 Captain 裁定的门禁交互，且**比 step 8 更硬**）

**事实链（全部实测）**：
1. `docs/pipeline/lint-baseline.json` 共 **31** 条，其中**本文件正好占 3 条**：
   ```
   {file:"…/teacherController.js", line:7,   rule:"no-unused-vars", symbol:"DEFAULT_MAX_SCORE", text:"import { DEFAULT_MAX_SCORE, ABNORMAL_FEEDBACK } from '../constants.js';"}
   {file:"…/teacherController.js", line:9,   rule:"no-unused-vars", symbol:"getTeamTeacherIds",   text:"import { getVisibleClassIds, getTeamTeacherIds, getMyTeamIds } from './teamController.js';"}
   {file:"…/teacherController.js", line:159, rule:"no-unused-vars", symbol:"gradeProject",       text:"const gradeProject = async (req, res) => {"}
   ```
2. **迁移配对键 = `rule + symbol + 规范化行文本`**（`lint-check.mjs:590-591 normalizeSourceText` 折叠空白；`:620` 三元组；`:689` 要求 **resolved 条数 === fresh 条数 > 0**；`:38` 注释：「任一条不满足、或任一侧的文本取不到 ⇒ 不配对 ⇒ 仍然 exit 1」）。
3. **▶ 算术结论（本步的决定性事实）**：
   - `gradeProject`（:159）：**整块逐字搬进 T10** ⇒ 声明行文本不变、rule/symbol 不变、resolved 1 ⇄ fresh 1 ⇒ **判为迁移，不阻断** ✔
   - `DEFAULT_MAX_SCORE`（:7）与 `getTeamTeacherIds`（:9）：它们所在的是 **import 行**，**搬家必然改文本**（相对深度从 `../constants.js` 变 `../../../../constants.js`、从 `./teamController.js` 变 `../../../../controllers/teamController.js`）⇒ **文本不同 ⇒ 不配对**。
     - **若 B 把这两个名字复制进新文件**：`fresh` 得到 2 条（新文本）而 `resolved` 那 2 条的文本是旧文本 ⇒ **两组都不配对 ⇒ `blocking = 2` ⇒ `lint-check` exit 1 ⇒ DoD §5-5(b) 不达标** ❌
     - **若 B 不导入这两个名字**（它们**本来就没有任何消费者**，见 §1.5-2）：`resolved = 2、fresh = 0` ⇒ 按 `:689` 直接 `continue`（不配对），但**没有 fresh 项** ⇒ **不产生 blocking**，只计为「已消除」⇒ **总数 31 → 29，exit 0** ✔

**⇒ ★ Captain 裁决（2026-10-11 14:20）：批准删除这两个死绑定，但附五条硬条件。**

批准理由：二者**引用计数均为 1（即 import 自身）**，删除**零行为影响**；且这样做**无需 Captain 开特例、无需 `--update-baseline`** ——
门禁会看到 2 条 resolved、0 条 fresh（只减不增），直接 exit 0。这比「复制过去导致 2 条 fresh」干净得多。

**五条硬条件（缺一不可）**：
1. **必须用 AST 证明**每个名字的引用计数恰为 1（**不得用 grep**）；把证据写进报告；
2. ★**必须查清每个 import 语句是否还提供其它在用名**（A 未见此层）：
   - 若该语句还有其它在用名 ⇒ **只删这两个名字、保留语句**；
   - 若该语句会因此**变空** ⇒ 再查**目标模块是否被本文件其它语句导入**（ESM 的 import 会**执行该模块**，删掉最后一个名字= 停止执行它，可能改变模块加载副作用）：
     · 若目标模块另有导入 ⇒ 可删该语句；
     · 若**没有** ⇒ **保留该语句原样并回报 Captain**，不要自行决定（此时我会另想处置）。
3. **预期读数**：lint 基线 **31 → 29**（2 resolved / 0 fresh）、**不执行 `--update-baseline`**、eslint warn **59 → 57**。
   ⚠️ **若实测不是这两个数，停下并回报**，不要为了凑数而调整；
4. **反向禁令**：**绝不可**把它们复制进任何新文件以求「逐字搬移」（那会产生 2 条 fresh ⇒ lint 判据 (b) 直接红）；
5. 该删除必须在报告里**逐条登记**（名字 / 原行号 / 引用计数证据 / 语句构成 / 处置理由）。

**A 的原建议（已采纳并加严）**：
**⇒ 裁定建议（A 的唯一建议，无需 Captain 开特例、无需 `--update-baseline`）**：
> **B0b 与搬移过程中，`DEFAULT_MAX_SCORE` 与 `getTeamTeacherIds` 一律不复制到任何新文件**；`ABNORMAL_FEEDBACK` 与 `getVisibleClassIds`/`getMyTeamIds` 照常按 §6.4 导入。
> 依据：① 二者是**引用计数为 1（仅 import 行本身）的死绑定**，删除**零行为影响**；② **import 行的重排本来就被本仓判例排除在「逐字搬移」之外**（reviewController-plan §7.5 明文：目标文件的非空白字节只能是 `banner / import 行 / export 行 / 源切片` 之一）；③ 结果是 lint **净减少 2 条**（31 → 29），符合 DoD「只减不增」，**不需要任何基线刷新**。
> **反向禁令**：**不得**为了「保持逐字」而把这两个名字带进新文件（那是本步唯一能把 lint 判据判红的动作）。
> **登记义务**：`teacherController-refactor.md` 必须逐字记录：刷新前 31 / 刷新后 29、`resolved` 恰 2 条（旧 file，rule=`no-unused-vars`，symbol=`DEFAULT_MAX_SCORE`/`getTeamTeacherIds`）、`fresh` **0** 条、**未执行 `--update-baseline`**、基线文件 mtime 未变，并附「二者在旧树中引用计数 = 1」的 grep 证据。

**eslint 侧的自证**：warn 总数 **59 → 57**（本文件那 3 条去掉 2 条，`gradeProject` 的那条随宿主迁移仍在），**≤59 且方向为降** ✔；`gradeProject` 的 warn 在新树里的位置 = `infrastructure/teacher/grade.js` 的对应行。


---

## 7 护航与对拍配方

### 7.1 C 的三桩（**两侧逐字相同地施加**；这是「硬禁网」的技术保证）

本文件**自身直接出网（AI）** —— 与 step 8 不同，网络桩在本步是**承重件**，不是保险：

| 桩 | 接法 | 为什么必须 |
|---|---|---|
| **S-A 网络桩（★承重）** | 探针**第一行**（早于任何 `import` 被测模块）执行 `globalThis.fetch = (url, opts) => { fetchLog.push({url:String(url), body:String(opts?.body ?? '')}); return Promise.resolve({ ok:true, status:200, json: async()=>({choices:[{message:{content:'<STUB>'}}]}), text: async()=>'<STUB>' }); };`，并叠保险 `process.env.DEEPSEEK_BASE_URL='http://127.0.0.1:9'` | `parseExam`/`parseExamStream`/`generateReference`/`gradeProject` **真的会发 HTTP**。**桩必须在 import 前装好**；探针结束断言**每一条 fetchLog 的 URL 都指向 127.0.0.1 或桩域名**（出现真实 api.deepseek.com 即判负并中止） |
| **S-B DB 桩（prisma 内存替身）** | 在两侧副本里用**同一份**内存替身覆盖 `server/src/utils/prisma.js`，必须实现：<br>**本文件直接调用**（实测 **42 个 model.op / 71 处**）：`user.{findMany,findFirst,findUnique,create,update,upsert,delete}` · `school.findUnique` · `question.{findMany,findFirst,create,update,count}` · `subQuestion.deleteMany` · `class.{findMany,findUnique,create,update,delete}` · `studentClass.{findFirst,findMany,create,deleteMany,upsert}` · `teacherClass.{findFirst,findMany,deleteMany}` · `teacherSchool.{findFirst,findMany}` · `teamClass.{findMany,createMany,deleteMany}` · `assignment.{findMany,findFirst,findUnique,create,update,count}` · `assignmentClass.deleteMany` · `submission.{findMany,groupBy,deleteMany}` · **`$transaction`**<br>**经 teamController 间接调用**（`getVisibleClassIds`/`getMyTeamIds`）：`teacherClass.findMany` · `teamTeacher.findMany` · `teamClass.findMany`（**漏一个就整片 403/500 失真**）<br>并导出 `__db / __log / __reset`，写操作浅拷贝入参后记入 `__log` | 真库会让对拍非确定（且要 seed）。⚠️ **`$transaction` 的语义陷阱**：`:329` `:933` `:984` `:1121` 传的都是 **已被调用的 Promise 数组**（`prisma.x.y(...)` 在数组构造时就执行了）⇒ **替身必须在各 `op()` 被调用时立即记账**，`$transaction` 只负责「按序 await + 记录一个事务标记」，**不能把记账推迟到 `$transaction` 内部**（step 8 局限声明第 10 条同款警告） |
| **S-C 时钟桩** | `const F=1760000000000; const RD=Date; globalThis.Date = class extends RD { constructor(...a){ super(...(a.length?a:[F])); } static now(){ return F; } };` | 本文件有 **14 处**时间源，其中 **5 处会进响应体或终态 DB**：`:534` `:571` `updatedAt: new Date().toISOString()`（**响应体**）、`:364` `deletedAt: new Date()`（**DB**）、`:689` `a.latestSubmittedAt = new Date(latest).toISOString()`（**响应体**）、`:507` `buildAssignmentStatusWhere` 的 `now`（**改变 where 形状 → 改变调用日志**）。不冻结则这些维度**必然不等** |

**另需三个「非三桩」替身（本文件特有，必须两侧相同）**：
- **`req/res` 探针**：最小 `res` 必须同时支持 ① `res.status(x).json(y)` 链式；② **SSE**：`writeHead(status, headers)`、`write(chunk)`、`end()`（`parseExamStream` 不用 `json`）；`req` = `{ user:{id:…}, params:…, query:…, body:…, app:{ locals:{ questionUseCases: <记录型替身> } } }`。**探针必须断言「同一 handler 只调用了一次 `json`」**（防拆分把某条分支变成双写），SSE 则断言 `write` 次数与分片顺序。
- **`questionUseCases` 替身**：`{ create: async (cmd)=>{ __ucLog.push(cmd); return {id:1,title:cmd.title}; } }`，并可指定抛 `DomainError` 来打靶 `:278-279` 的 `DomainError → 400 err.message` 分支。
- **落盘目录隔离**：`uploadMaterial` 会把文件真的写到 `UPLOADS_ROOT/materials`。两侧探针**必须把树放在各自的 `/tmp/splitT-{before,after}/server/` 下**（`UPLOADS_ROOT` 由 `projectPaths.js` 的模块位置自动决定）⇒ 产物天然落在仓库外，**绝不写进仓库**。

### 7.2 ★B0b 专项探针（`__dirname` 等价性，本步独有，必须最先做）

```bash
cd "<repo>"
ANCHOR=$(git rev-parse HEAD)          # ← 本方案实测 = c5632b0c4af8e377754d9f43eb2c6427cba2771e
rm -rf /tmp/splitT-before /tmp/splitT-after && mkdir -p /tmp/splitT-before
git archive "$ANCHOR" server | tar -x -C /tmp/splitT-before
ln -s "<repo>/node_modules" /tmp/splitT-before/node_modules
shasum -a 256 /tmp/splitT-before/server/src/controllers/teacherController.js  # 前置断言 == 729a83b0…
cp -R "<repo>/server" /tmp/splitT-after/server                               # B0b 之后的树
ln -s "<repo>/node_modules" /tmp/splitT-after/node_modules
# 探针（C 自建）：两侧各打印同 5 个表达式的解析结果
PORT=0 node /tmp/splitT-probe/paths.mjs /tmp/splitT-before/server/src/controllers/teacherController.js before > /tmp/splitT-out/paths.before.json
PORT=0 node /tmp/splitT-probe/paths.mjs /tmp/splitT-after/server/src/controllers/teacherController.js  after  > /tmp/splitT-out/paths.after.json
# 归一化：把两棵树的根路径替换成 <TREE> 后 cmp
```
**必须打印并逐字相等的 5 个常量**：`uploadsRootForGetProjectFiles` · `uploadsRootForGradeProject` · `projectsRoot` · `projectQuestionsDirForQ7` · `materialsDir`。
**正控（证明探针有牙）**：把 after 树的 `UPLOADS_ROOT` 故意换成错误的深度表达式的**变异副本**，探针**必须报差异**；不报 = 恒等装置，判负。
**副作用正控（§1.3-2）**：断言 `/tmp/splitT-{before,after}/server/uploads/materials` **存在**，且 `<repo>/server/src/**/uploads` **不存在**。

### 7.3 两独立进程 + 四维对拍（搬移前后）

```bash
PORT=0 node /tmp/splitT-probe/run.mjs /tmp/splitT-before/server/src/controllers/teacherController.js /tmp/splitT-fix out/before1.json
PORT=0 node /tmp/splitT-probe/run.mjs /tmp/splitT-before/server/src/controllers/teacherController.js /tmp/splitT-fix out/before2.json  # 装置自检
PORT=0 node /tmp/splitT-probe/run.mjs /tmp/splitT-after/server/src/interface/http/controllers/teacher/index.js /tmp/splitT-after/server/src/infrastructure/teacher/index.js /tmp/splitT-fix out/after1.json
cmp out/before1.json out/before2.json    # 必须相等，否则装置不确定 ⇒ 判负
cmp out/before1.json out/after1.json     # 唯一允许的差异：模块 basename 字段（建议干脆不带）
```
**每个 case 的 JSON 必须含 4 个维度**（任务书四维，逐条对应）：
1. **返值**：`{status: res.statusCode, headers?: 仅 SSE 用例带, body: res.body | res.rawText}` —— **逐字节**（**不要 sort**，键序即契约；SSE 用例比 `rawText` 全程拼接）。
2. **终态 DB**：`JSON.parse(JSON.stringify(__db))` 快照（`switchSchool`/`createQuestion`/`updateQuestion`/`deleteQuestion`/`createAssignment`/`lockAssignment`/`createClass`/`updateClass`/`deleteClass`/`switchClassSchool`/`updateStudent`/`deleteStudent`/`resetStudentPassword`/`addStudent`/`batchAddStudents` 的写入态）。
3. **有序调用日志**：`__log`（每次 prisma 操作的 `{model, op, args}` **按序**）—— 只比返回值会漏掉「同一结果、不同写序」的漂移（`getAssignments` 的 4 组聚合查询顺序、`getPendingSummary` 的 N+1、`createQuestion` 的 create→update 两步、4 个 `$transaction` 的内部顺序）。
4. **fetch 请求体**：`fetchLog`（**本文件非 0 是正常的**：`parse-exam`/`parse-exam-stream`/`generate-reference`/`gradeProject` 用例应有请求）。**判据 = 两侧逐字节相等 + 每一条 URL 都命中桩**（**硬禁网**）。

### 7.4 夹具矩阵（C 自建，**不复用 B 的脚本**）

| # | 夹具 / 探针 | 打靶的段落 / 零覆盖分支 |
|---|---|---|
| **F00** | **B0b 路径等价探针**（§7.2） | `__dirname` 5 处 + `mkdirSync` 副作用 |
| **F01** | `switchSchool`：正常 / `schoolId=abc`（`+abc=NaN` → `user.update` 的 data 为 NaN） | **Z8** |
| **F02** | `getMySchools`：有/无关联学校 | **Z9** |
| **F03** | `getQuestions`：无参 / `difficulty` / `keyword` / `page=0` / `pageSize=0` / 负 `skip` | S3 |
| **F04** | `getQuestion`：可见 / 不存在 / **他人题目（`teacherId` 不符）** / 软删 | S3 |
| **F05** | `getProjectFiles`：非 project 题 / `attachmentUrl=null` / 目录不存在 / **有标准包（真实文件）** / **文件不可读（权限）→ `'// 无法读取文件内容'`** | **Z3** + `fs` 全分支 |
| **F06** | `createQuestion` project：缺 title / title>200 / material>50000 / **`tempId='../evil'` → 400** / **合法 `tempId` + 真目录 → renameSync 生效 + `attachmentUrl` 二次 update** / 越界 400 | **Z16** + `fs` 写 + `:252` |
| **F07** | `createQuestion` code：经 `questionUseCases` 替身 resolve / reject(`DomainError`) / reject(Error) | `:278-279` vs `:282` |
| **F08** | `updateQuestion`：project 分支（`attachmentUrl` 白名单 4 态）/ code 分支（`resolveSubQuestionScores` 抛错 → 400 `e.message`）/ `rubricItems:null` | S3 |
| **F09** | `deleteQuestion`：正常（`deletedAt` 为冻结时钟）/ 不存在 | S3 |
| **F10** | `parseExam`：空内容 400 / 正常 200（**逐字比 `message` 里的题目数**）/ 超 80000 截断 / **桩抛错 → 500 `'AI 解析失败: …'`** | **Z4** |
| **F11** | `parseExamStream`：空内容 400 / 正常（**4 header + `data: ` 前缀 + start/progress/done 顺序**）/ **桩抛错 → `phase:'error'` + `res.end()`** | **Z5**（★最脆） |
| **F12** | `generateReference`：`stem` 缺失/空白 → 400 / 正常 / 桩抛错 → 500 | **Z6** |
| **F13** | `uploadMaterial`：非 zip → 400 `'仅支持 zip 文件'` / 无文件 → 400 `'未选择文件'` / **合法 zip → 200 + 落盘文件名正则 + 磁盘存在**（产物在 /tmp 树内） | **Z7** + 磁盘副作用 |
| **F14** | `getAssignments`：`status` ∈ {ongoing, upcoming, not_started, ended, locked, 未识别} / `classId` 可见、不可见、`abc` / `keyword` / 空列表早退（`assignmentIds.length===0`）/ **`submissionCount`/`expectedCount`/`pendingReviewCount` 逐值** | S5 + `:627` |
| **F15** | `getAssignment`：正常 / 不存在 / **软删题目被 JS 过滤** | S5 |
| **F16** | `createAssignment`：参数不足 400 / **越权 classIds 403** / 题目数不符 400 / **Q9 `code:1007`（未确认）** / **`confirmWithoutStandardPackage:true` → 200 + `logger.warn`** / `practice` 模式 `allowResubmit` 强制 true | S5 + **`code:1007`** |
| **F17** | `lockAssignment`：不存在 404 / 他人 403 / **两次调用 toggle 两态文案** | **Z2** |
| **F18** | `getPendingSummary`：`schoolId=abc`/`0`/小数 → 全 0 / `classId` 可见与不可见 / `practice` 行恒 0 / 软删作业不计 | S5 |
| **F19** | `getAllTeachers`：无 schoolId / 有 schoolId / 空结果 | **Z10** |
| **F20** | `getAllClasses`：无 schoolId → `[]` / 直连班 `isTeamClass:false` / **团队班 `isTeamClass:true` 且 `ownerTeacherName` 正确** | S7 |
| **F21** | `createClass`：参数 400 / 非本校 403 / teamIds 越权 403 / **正常 + teamIds 写 teamClass** | Z11 |
| **F22** | `updateClass`：三 403 态 / teamIds undefined（不动关联）/ `[]`（清空）/ 非空（重建） | S7 |
| **F23** | `deleteClass`：403 / 正常（**4 张表级联删除顺序在维度 3 里比对**） | S7 |
| **F24** | `switchClassSchool`：**六 400/404/403 态 + 200 全字段 + 拼接文案 + teamClass 清零** | **Z1**（★最高价值） |
| **F25** | `getMyStudents`：无 schoolId → `[]` / `classId` 不可见（不作收窄）/ 可见（收窄）/ 零可见班级 → `[]` / `keyword` | S8 + **Z12** |
| **F26** | `getMyClasses`：无 schoolId / 有 schoolId（**直调**，无路由） | Z13 |
| **F27** | `updateStudent`：404 / 403 源 / 403 目标班级 / **`tmp_` + `newUsername` 改名改密** / **`(待补全)` → 重置密码** / 学号占用 400 / `P2002` 400 / 移班（deleteMany+create） | S8 + **Z14** |
| **F28** | `deleteStudent`：403 / 正常（**3 表级联**） | S8 |
| **F29** | `resetStudentPassword`：404 / 403 / `tmp_` → 400 / 正常（文案含 `sid`） | S8 |
| **F30** | `addStudent`：400 / 班级不存在 400 / 403 / 正常（`officialCode` 有与无两态）/ `P2002` | S8 |
| **F31** | `batchAddStudents`：400 / 班级 400 / 403 / **三条子分支（只姓名 / 只学号 / 完整）** / 空行跳过 / **单行失败进 errors 不中断** | **Z15** |

### 7.5 装置自检 + 反证（缺任一条即判负）

- **自检 1**：`before` 连跑两次 `cmp` 必须相等。
- **自检 2（防假绿）**：F05 的「有标准包」夹具必须让 `data.tree.length > 0`（证明 `:152` 真命中，而不是全走 `:134` 早退）；F11 必须真的产出 `phase:'done'`（证明 SSE 不是在 400 处短路）；F13 必须真的在磁盘上找到上传的文件。
- **自检 3（守门员必须真的守门）**：F24/F16/F27 的 403 夹具必须**逐字**命中 `{code:1003,message:'无权操作'|'无权操作当前学校'|'你不属于目标学校',data:null}` —— 若拆错层导致守卫被旁路，这一条会立刻红。
- **反证（必须有分辨力）**：在 `/tmp/splitT-after` 复制一份，注入 4 处变异 —— ① `:494` `row.mode === 'practice' ? 0 : r.reviewPending` → `r.reviewPending`；② `:728` 的 `canTeacherManageClasses(...)` 改成恒 `true`；③ `:1140` 的 `canTeacherManageStudent` 判定**后移**到 `sid.startsWith('tmp_')` 之后（越权判定次序）；④ `:971` 的文案改成 `'无权操作'`。确认 `cmp` **报差异**；不报 = 恒等装置，判负。

### 7.6 逐字搬移的静态判等（覆盖夹具打不到的分支）

```bash
node /tmp/splitT-probe/slice-equal.mjs   # C 自建：从改前/改后两侧按「JSDoc + 声明」切块，逐块 sha256 对拍
# 期望：40 个顶层具名单元中 37 块逐字节相同；3 块按 §7.7 显式豁免
# 反向校验：12 个目标文件的每个非空白字节，只能是 banner / import 行 / export 行 / 源切片之一；
#   剩余未匹配字节必须为 0（banner 与 import/export 块由 C 独立识别，不采信 B 的清单）
```
（可行性前提：§10 要求**不得在声明行加/改 `export`**，跨模块暴露一律用文件末尾 `export { … };` 块 ⇒ 除 §7.7 的 3 块外可与源文件逐字节相等。）

### 7.7 ★必须显式豁免的 3 块（本步**唯一**的「非 import 行改写」，**全部在 B0b 完成**）

| # | 单元（源行） | 被改的行 | 改写内容 | 归属 |
|---|---|---|---|---|
| **X1** | `getProjectFiles`（124-157） | `:133` + `:137` | `path.join(__dirname,'../../uploads',q.attachmentUrl)` → `path.join(UPLOADS_ROOT,q.attachmentUrl)`；动态 `import('../utils/fileTree.js')` → `import('../../../../utils/fileTree.js')` | T3 |
| **X2** | `gradeProject`（159-218，死代码） | `:188` + `:204` | 同型 → `path.join(UPLOADS_ROOT,q.attachmentUrl)`；动态 `import('../infrastructure/ai/deepseek/index.js')` → `import('../ai/deepseek/index.js')` | T10 |
| **X3** | `createQuestion`（220-288） | `:249` + `:254` | `path.resolve(__dirname,'../../uploads/projects')` → `PROJECTS_ROOT`；`path.join(__dirname,'../../uploads/project-questions',String(q.id))` → `path.join(STANDARDS_ROOT,String(q.id))` | T3 |
| — | 上传配置块（1288-1314，**不属于 40 个具名单元**） | `:1290`(删) `:1292`(删) `:1293` | 删 `import { fileURLToPath } from 'url';`、删 `const __dirname = …`；`path.join(__dirname,'../../uploads/materials')` → `path.join(UPLOADS_ROOT,'materials')` | T11 |

**⇒ 判等口径**：**37/40 块逐字节相同**；**3 块（X1/X2/X3）豁免**，豁免的**每一行都必须落在上表**，不得多一行。**注意 X1/X2/X3 全部在 B0b 就已改完** ⇒ 到搬移阶段，**搬移本身是 100% 逐字节的**（这使判等口径比 step 8 更干净）。

---

## 8 风险分级

| # | 搬移单元 | 等级 | 理由（依赖复杂度 / 测试覆盖 / 是否在越权守卫链路 / 外部副作用） |
|---|---|---|---|
| **R1** | **T1 `guards.js`**（interface，55 行） | **高** | **15 个 handler 的公共根**（`getSchoolId` 跨 S5–S8 四段）；**6 个函数全部是越权判定单元**；其中 `canTeacherManageStudent` 的 `visibleIds.length===0 → false`(`:33`) 与 `canTeacherManageClasses` 的「空集合放行」(`:48`) 是 **fail-closed / fail-open 的分水岭**；一旦落错层，§2.3 的双向违规立刻出现。**单位行数风险全步最高** |
| **R2** | **T2 `school.js`**（interface，13 行） | **中** | 极短但**零测试**（Z8）且**前端在用**（`Layout.vue:296`）；`schoolId=abc → NaN` 的既有行为必须原样带走 |
| **R3** | **T3 `questions.js`**（interface，228 行） | **中高** | 含 **X1 + X3 两处豁免改写**（`__dirname` + 动态 import）；**FS 读 + FS 写（`mkdirSync`/`renameSync`）+ 路径穿越防护**（`:230`/`:251` 两条正则/前缀校验）；`getProjectFiles` 整条零覆盖（Z3） |
| **R4** | **T4 `assignments.js`**（interface，386 行） | **中高** | **本步最大文件**；含**全步唯一的非标准码 `code:1007`**(`:756`)；`getAssignments` 的 4 组聚合 + rollup + **N+1 查询顺序敏感**；`createAssignment` 是**唯一有 13 例单测直驱**的 handler（强，但正因如此**改写它会立刻打断 I2**）；`lockAssignment` 零覆盖（Z2） |
| **R5** | **T5 `teachers.js`**（interface，18 行） | **中** | 短，但**零测试**（Z10）且前端在用（`TeamEdit.vue:129`）；`schoolId` 收窄分支无断言 |
| **R6** | **T6 `classes.js`**（interface，172 行） | **高** | **含 8 条越权守卫**（`:877` `:880` `:905` `:910` `:931` `:964` `:971` `:972` —— 其中 **`:971`/`:972` 是全仓唯一两条专属文案**）；`switchClassSchool` **56 行全零覆盖**（Z1）；`createClass` jest 侧无 200 正例（Z11）；2 个 `$transaction` |
| **R7** | **T7 `students.js`**（interface，283 行） | **中** | 8 个 403 + 8 个 400 + `P2002` 分支；**测试最密的一段**（`ownership-guards` 有 20+ 例直接打它）⇒ 回归网最厚；但 `batchAddStudents` 的 94 行三分支与 `updateStudent` 的改密/改学号分支**置信度低**（Z14/Z15） |
| **R8** | **T8 `interface/.../index.js`**（barrel，34 行） | **高（硬失败点）** | 6 行 re-export（26 名），**`check-layers`/`cycle-check` 对它完全不可见**（F4）⇒ 写错路径/漏名**只能靠 bind-check + 运行期 `Object.keys` 对拍**兜住；`export *` 会让 bind-check 也失明 |
| **R9** | **T9 `exam-parse.js`**（infra，51 行） | **高** | **唯一含 SSE 契约**的单元（4 header + 4 种 phase + `data: ` 前缀）；**零覆盖**（Z4/Z5）；**真出网**（必须靠 S-A 桩）；且它与 T10 一起**决定整个落层拓扑**（deepseek 边） |
| **R10** | **T10 `grade.js`**（infra，75 行） | **中高** | 含 **X2 豁免**（死代码 `gradeProject` 的 2 行改写）+ `generateReference`（零覆盖 Z6、真出网）；`gradeProject` 本身**无任何消费者** ⇒ 逻辑风险低，但它是 **lint 迁移配对的唯一对象**（§6.5），做错就 exit 1 |
| **R11** | **T11 `uploads.js`**（infra，35 行） | **中高** | **唯一含模块级磁盘副作用**（`:1294` 的 `mkdirSync`）+ 请求期落盘 + multipart；零覆盖（Z7）且无前端调用方；**X 豁免块**（`:1290`/`:1292`/`:1293`） |
| **R12** | **T12 `infrastructure/teacher/index.js`**（barrel，16 行） | **中高（硬失败点）** | 同 R8（4 名）；它是 **I1 合并的第二个操作数**，漏名会让 4 条 AI/上传路由**在首访时**才炸 |
| **R13** | **B0b（`__dirname` 等价重构 + 2 个死绑定移除）** | **高** | **全步唯一改变字节的「非搬移」动作**；若替换不等价，`uploads/*` 会静默漂移（**静态判据全盲**）⇒ 必须由 §7.2 的专项探针 + 变异正控护航 |
| **R14** | **I1 `routes/teacher.js:4` 的 3 行改写** | **高** | 唯一触及**路由表**的改动；`{...teacherHttp, ...teacherIo}` 若两名重叠即**静默遮蔽**（本方案已证两组名不交：26 ∩ 4 = ∅）；必须用 `Object.keys` 对拍而非肉眼看 |
| **R15** | **I2 `unit/assignment-q9-branches.test.js:41` 改路径** | **中** | 单行，但 **bind-check 对它只有 unresolved（不判违规）** ⇒ 漏改**不会被任何门禁拦住**，只会让那 13 例在运行期 `Cannot find module`。必须**同批**改 + 真跑该套件 |
| **R16** | **删除源文件** | **高** | 一步影响 2 个 import 站点（I1 生产 + I2 测试）+ **传递加载它的 20+ 个集成套件**；必须与 T8/T12 + I1/I2 **同一提交** |
| **R17** | **lint 迁移（§6.5）** | **中** | 判据 (b) 的 31 → 29 必须逐字登记；**反向禁令**（不得复制 2 个死绑定）是唯一能判红的动作 |
| **R18** | **未分层 43 → 42 / GodFile 2 → 1** | **低** | 由构造保证；`arch-metrics` 判据是「不劣于基线」，**下降不会被判劣化**（B3 后需按 P1-4 刷新基线 2 → 1 与 43 → 42） |

**顺序建议（给 B）**：**先做 B0 补测（§5.4，独立提交）** → **B0b 等价重构（§2.7 + §7.2 探针，独立提交）** → T1 → T9 → T10 → T11 → T2 → T3 → T4 → T5 → T6 → T7 → **先建 T8/T12 两个 barrel 并跑 bind-check** → I2 → I1 → **最后删源文件** → 过 lint（§6.5）与门禁五连。每段完成后立即 `node --check` **并真 `import` 一次**（**`node --check` 不校验跨模块绑定**，本项目已两次实证）。

---

## 9 分批建议（每批可独立提交、各自过 DoD）

**先说结论**：本文件**一次性拆到底在技术上可行**（直接 import 站点只有 2 个、**无 jest mock 单点故障**、19/29 路由有双向断言），但有三处**必须隔离**：① **B0b 的 `__dirname` 等价重构**（唯一改变字节的非搬移动作，须先独立验证）；② **10 条零覆盖路由**（B0 补测）；③ **T1 `guards.js` 被跨段消费**。⇒ **建议 2 个前置批 + 3 个搬移批**。中间态采用**门面（facade）**：源文件保留为 `controllers/teacherController.js`，只把已迁出的名字改为 `export { … } from …` 再导出 ⇒ **导出面对外逐字不变，I1/I2 在前两批完全不用改，20+ 个集成套件原样跑**。

| 批 | 动作 | 触及文件 | 完成后指标 | 该批的自证判据 |
|---|---|---|---|---|
| **B0（前置）** | 按 §5.4 补 T-A…T-F 六组契约测试（约 23 例） | 5–6 新建测试文件 | 用例数 **增**（属预期，plan §6-R5）；GodFile/未分层**不变** | 全量 `0 failed`；新增用例**先红后绿**（先写断言、在改前树上确认能失败再让它过 —— **不得**为迁就实现改断言） |
| **B0b（前置·等价重构）** | §2.7：5 行替换（`:133` `:188` `:249` `:254` `:1293`）+ 2 行删除（`:1290` `:1292`）+ **不导入 2 个死绑定**（`DEFAULT_MAX_SCORE` 从 `:7` 删、`getTeamTeacherIds` 从 `:9` 删） | 1 改（源文件，**仍在原路径**） | **GodFile 2 不变 / 未分层 43 不变**；lint(a) 59 → **57**；lint(b) 31 → **29** | ① **§7.2 路径探针 5/5 逐字相等 + 变异正控必报差异**；② `/tmp` 树内 `uploads/materials` 存在、`<repo>/server/src/**/uploads` 不存在；③ 全量回归 `0 failed`；④ 门禁五连读数与入场一致（除 lint 两项下降） |
| **B1** | 建 `infrastructure/teacher/`，落 **T9 + T10 + T11**；源文件删去对应区间，改为文件尾 `export { … } from …` | 3 新建 + 1 改 | 源文件 1338 → **≈1177**（仍 >800 ⇒ GodFile **2** 不变）；未分层 **43** 不变；违规 0 | ① 4 块切片判等（`parseExam`/`parseExamStream`/`generateReference` 3 块全等 + `gradeProject` 按 X2 豁免）② **F00/F10–F13 对拍** byte-identical ③ 装置自检 + 变异反证 ④ `check-layers` 违规 0 ⑤ `git diff --stat server/test` **零改动** |
| **B2** | 建 `interface/http/controllers/teacher/`，落 **T1 + T2 + T3 + T4 + T5 + T6 + T7**；源文件继续门面化 | 7 新建 + 1 改 | 源文件 ≈1177 → **≈30**（**< 800**）⇒ **GodFile 2 → 1**；未分层 **43** 不变；违规 0 | ① 切片判等补齐（37 全等 + X1/X3 豁免）② **F01–F09 + F14–F31** 对拍（含全部 403 文案与 `code:1007`）③ 门禁三连 + 两道 lint 读数符合 §2.5 ④ 源文件门面期真 import 一次（`Object.keys` = 30） |
| **B3** | 建 **T8 + T12** 两个 barrel；**先过 bind-check**；改 **I2**（单测路径）+ **I1**（`routes/teacher.js:4` 一行→三行）；**删除源文件** | 2 新建 + 2 改 + 1 删 | **未分层 43 → 42**；**GodFile 1**（只剩 Doc.vue）；违规 0；SCC 0；lint(a) 0 error/57 warn；lint(b) 29 + 迁移 1，exit 0 | ① 37/40 块切片判等 + 反向「多余字节 = 0」② `T8 ∪ T12` 的 **30 名**与改前 `Object.keys` **逐字相等**且 **T8 ∩ T12 = ∅** ③ `bind-check` 违规 0 ④ **真跑 `unit/assignment-q9-branches.test.js` 13 例** ⑤ 全量回归 `0 failed` ⑥ `grep -rn 'controllers/teacherController.js' server/src server/test` = **0**（**规格符口径**） |

**每批的 DoD（复用 plan §5，server 侧 5 条 + 两道 lint + 本方案补充）**：① `node server/scripts/check-layers.mjs` → 违规 0 且未分层不增（B3 后 **42**）；② `node scripts/gates/cycle-check.mjs` → **SCC 0**；③ `node scripts/gates/hard-metrics.mjs` → 0/0/0（只扫 client，应逐字不变）；④ `node scripts/gates/bind-check.mjs` → 违规 0；⑤ `node scripts/gates/arch-metrics.mjs` → PASS（B2 后 GodFile 1，**需按 P1-4 刷新基线** 2→1；B3 后未分层 43→42 同样刷新）；⑥ **两道 lint**：`./node_modules/.bin/eslint client/src server/src` → **error 0 / warn ≤ 59**（B0b 后应为 **57**）；`node scripts/gates/lint-check.mjs` → **exit 0**（**B0b 后 31 → 29，且始终不需要 `--update-baseline`**）；⑦ `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → 4 处 `Test Suites:`、**0 failed**、套件/用例数**如实记录**；⑧ 行为对拍 byte-identical（§7）；⑨ 每批一个提交，消息含「拆分前 `file:line` 范围 + 落层目标 + 验证结果」。

**若 Captain 判定「一次拆到底」**：跳过门面，但 **B0 与 B0b 仍必须先做**；然后一次性建 12 个文件 + 删源 + 改 I1/I2 + 单提交；判据不变（§7 全量对拍 + 37/40 切片判等 + 门禁五连 + 两道 lint + 全量回归）。

---

## 10 给 Agent B 的逐字搬移指令

**总则（不可协商）**
1. **只改 §6.2 的 12 个新建文件 + §6.4 的 I1/I2 两个站点 + B0b 的 1 处源文件改动**（分批执行时外加源文件的门面改写与最终删除）。**不得**碰 `scripts/gates/*`、`server/scripts/*`、`server/test/` 的**断言**（只允许改 I2 的路径）、`client/**`、**`tests/**`（含 `tests/ui-redesign-verify/rig-server/` 那棵副本！）**、`server/logs`、`server/package.json`、`docs/pipeline/lint-baseline.json`（**该文件只能由 Captain 授权的 `--update-baseline` 生成，不得手改；本步实际上不需要刷新它**）。
2. **搬移 = 按 §6.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角「」、顿号、`：`、`——`、`…`、空格数量、空行位置）。**空行不搬**（各目标文件自带 banner 与一行空行）。**横幅搬**（`:69` `:83` `:372` `:424` `:426` `:520` `:811` `:830` `:1003` `:1288` `:1324` 随其所属段进入对应目标文件；**`:426-433` 那 8 行口径注释与 `:520-525` 那 6 行硬约束注释是段落内容，必须逐字带走**）。
3. **不得在任何声明行加/改/删 `export`**（会破坏 §7.6 的切片判等）。源文件里本来就带 `export` 的 **30 个函数**照原样带；其余跨模块暴露一律用**文件末尾单个 `export { … };` 块**（T1 的 6 个守卫名是**唯一新增的模块级导出名**，见 §6.3；**`gradeProject` 绝不可加 export**）。
4. 每个新文件顶部加 3–4 行 banner，**固定格式**（便于 C 机械核对）：
```
/**
 * <文件名> —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 <起>-<止>）。
 * 逐字搬移：除本文件 import 头与 docs/split/teacherController-plan.md §7.7 列明的豁免行外，
 * 函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：<interface|infrastructure>（落层依据见 docs/split/teacherController-plan.md §2）。
 */
```
5. **不要写 smoke test 脚本、不要新增/修改任何测试文件**（B0 的补测与 C 的探针都不是你的职责；若 Captain 把 B0 派给你，则 B0 **必须独立成一个先行的提交**）。
6. **保留全部死代码 / 既有不一致**：`gradeProject`(:159-218，逐字带进 T10)；`code:1007`(:756)；`:201` 的 **简写属性 `{ code: 1001, message, data: null }`**；`getMyClasses` 这个**无路由的导出**；`teacherController.js:427-433` 里**已失效的 `reviewController.js:315-331` 路径注释**；`parseExam` 的 `console.log`×4 与 `generateReference` 的 `console.log`×2（**不得改成 logger**）。**一处都不许「顺手修」。**
7. 全部完成后**再**删 `server/src/controllers/teacherController.js`；**不要**用任何回滚类 git 命令。
8. **★两条硬禁令（本步独有，违反必红）**：
   - **不得把 `DEFAULT_MAX_SCORE` 或 `getTeamTeacherIds` 复制进任何新文件**（它们是死绑定；复制会让 `lint-check` 的 fresh 无 resolved 配对 ⇒ **exit 1**，见 §6.5）。
   - **不得把源文件的 11 行 import 头整段复制**到新文件（会产生新 `no-unused-vars`）；**每个文件只写 §6.4 为它规定的那几行**。
9. **不得改 §7.7 表外的任何一行既有代码**：`new Date()`/`Date.now()`/`Math.random()`/`console.*`/文案/状态码/键序/正则/`Math.min|max`/路径前缀校验，一律原样。

**逐文件执行单**

| 步骤 | 动作 | 完成判据（自重） |
|---|---|---|
| B0 | 按 §5.4 补 T-A…T-F（约 23 例），**独立提交** | 全量 `0 failed`；断言先红后绿 |
| B0b | 源文件：`:133` `:188` `:249` `:254` `:1293` 五处替换为 `UPLOADS_ROOT`/`PROJECTS_ROOT`/`STANDARDS_ROOT`；删 `:1290` `:1292`；`:7` 去掉 `DEFAULT_MAX_SCORE`、`:9` 去掉 `getTeamTeacherIds`；源文件补 `import { UPLOADS_ROOT, PROJECTS_ROOT, STANDARDS_ROOT } from '../utils/projectPaths.js';`（与既有 `hasStandardPackage` 合并为一行） | `grep -c "__dirname" teacherController.js` = **0**；`grep -c "fileURLToPath"` = **0**；§7.2 探针 5/5 相等 + 变异必报差异；lint(a) 57 / lint(b) 29 exit 0 |
| B1 | 建 `infrastructure/teacher/`，写 **T9** `exam-parse.js`（372-422）+ banner + 1 条 import + `export { parseExam, parseExamStream };` | `node --check` **且**真 import 一次；`grep -c "parseExamPaperStream" exam-parse.js` = 2 |
| B2 | 写 **T10** `grade.js`（**159-218 + 1324-1338 两段**）+ banner + 6 条 import + `export { generateReference };` | `grep -c "gradeProject" grade.js` ≥ 2 且**无 `export` 修饰**；`:204` 的动态 import 已改为 `'../ai/deepseek/index.js'` |
| B3 | 写 **T11** `uploads.js`（1288-1322）+ banner + 4 条 import + `export { uploadMaterial };` | `grep -c "fileURLToPath\|__dirname" uploads.js` = **0**；`grep -c "UPLOADS_ROOT" uploads.js` ≥ 1；`grep -c "mkdirSync" uploads.js` = **1**（逐字在） |
| B4 | 源文件门面化：把 T9/T10/T11 的 4 个名字改为文件尾 `export { … } from '<新路径>';`，并删除已不存在的 `__dirname`/`url`/`multer` import | 真 import 源文件 → `Object.keys().length` = **30** |
| B5 | 建 `interface/http/controllers/teacher/`，写 **T1** `guards.js`（13-67）+ banner + 2 条 import + 文件尾 `export { 6 个守卫名 };` | `grep -c "getTeamTeacherIds" guards.js` = **0**（★死绑定不得复制）；`grep -c "canTeacherManage" guards.js` = 3 |
| B6 | 写 **T2** `school.js`（69-81）+ banner + 2 条 import + `export { switchSchool };` | 2 条 import 层级 == `../../../../utils/`（**四层**） |
| B7 | 写 **T3** `questions.js`（**83-158 · 219-370**）+ banner + 7 条 import + `export { getQuestions, getQuestion, getProjectFiles, createQuestion, updateQuestion, deleteQuestion };` | `grep -c "gradeProject" questions.js` = **0**（★159-218 不在本文件）；`grep -c "__dirname"` = 0；`:137` 的动态 import 已改为 `'../../../../utils/fileTree.js'` |
| B8 | 写 **T4** `assignments.js`（424-809）+ banner + 6 条 import + `export { getPendingSummary, getAssignments, getAssignment, createAssignment, lockAssignment };` | `grep -c "code: 1007"` = **1**（★不许改成 1001）；`grep -c "reviewController.js:315-331"` = 1（旧路径注释逐字在） |
| B9 | 写 **T5** `teachers.js`（811-828）+ banner + 3 条 import + `export { getAllTeachers };` | `grep -c "from './guards.js'"` = 1 |
| B10 | 写 **T6** `classes.js`（830-1001）+ banner + 4 条 import + `export { getMySchools, getAllClasses, createClass, updateClass, deleteClass, switchClassSchool };` | `grep -c "无权操作当前学校\|你不属于目标学校"` = **2**；`grep -c "res.status(403)"` = **8** |
| B11 | 写 **T7** `students.js`（1003-1285）+ banner + 5 条 import + `export { getMyStudents, getMyClasses, updateStudent, deleteStudent, resetStudentPassword, addStudent, batchAddStudents };` | `grep -c "res.status(403)"` = **8**；`grep -c "getMyClasses"` ≥ 1（**无路由的导出也要带走**） |
| B12 | 源文件门面化：把 T1–T7 的 26 个名字改为文件尾 `export { … } from '<新路径>';` | 真 import 源文件 → **30 名逐字相等**；源文件行数 ≈ **30**（< 800） |
| B13 | 写 **T8** `interface/.../index.js`（§6.3 的 6 行 re-export） | `PORT=0 node --input-type=module -e "const m=await import('./server/src/interface/http/controllers/teacher/index.js');console.log(Object.keys(m).sort())"` → **26 名** |
| B14 | 写 **T12** `infrastructure/teacher/index.js`（§6.3 的 3 行 re-export） | 同法 → **4 名**，与 §6.3 清单逐字相等 |
| B15 | **先跑 `node scripts/gates/bind-check.mjs`**（在改 I1/I2 之前），再改 **I2**（单测路径）与 **I1**（`routes/teacher.js:4` 一行→三行），跑 `bind-check` 复验 | bind-check 违规 **0**；`routes/teacher.js` 的 29 行路由体逐字未动 |
| B16 | **删除源文件** | `grep -rnE "from '[^']*controllers/teacherController\.js'" server/src server/test` = **0**（**规格符口径**；banner 与注释里的旧路径文本会命中，不算违规） |
| B17 | 门禁五连 + 两道 lint + 全量回归 | 原始输出贴进 `teacherController-refactor.md`；lint(b) 必须给出 **31 → 29、fresh 0、未执行 --update-baseline** 的三元组举证 |
| B18 | 写 `docs/split/teacherController-refactor.md`（源区间 → 目标文件:行 + 每块 sha256 + 两个 barrel 的 `Object.keys` 快照 + lint 三元组 + B0b 的 5 行替换与探针输出） | 40 个单元全覆盖，0 处未分配；豁免 3 块逐行登记 |

**分批执行时的额外指令**：B1/B2 两批**不要**建任何 barrel、**不要**改 I1/I2；源文件里把已迁出的名字改成 `export { … } from '<新路径>';`（**放在文件末尾**，不要与既有声明混排），并在文件头补上仍被内部使用的 `prisma` / `logger` / `getVisibleClassIds` / `ABNORMAL_FEEDBACK` / `path` / `fs` / `UPLOADS_ROOT` 等 import。**门面期源文件会短暂同时 import interface 与 infrastructure 两侧** —— 源文件是 unlayered，**这不违规**；但**绝不允许**把这个模式带进任何新文件。

**禁令（违反即回流）**：① 顺手修 `gradeProject` 死代码 / 统一 `code:1007` / 展开 `:201` 的简写 message / 给 `schoolId` 加 `Number.isInteger` 防护 / 把 `console.log` 改 `logger`；② 在同一提交里改任何中文文案、状态码、响应键序、SSE header、`Math.min/max` 阈值、正则；③ 改 `server/test/` 的断言（**只允许改 I2 的一行路径**）；④ 改门禁脚本以「适配」新路径；⑤ 用 `git checkout/restore` 回滚（用重编辑）；⑥ 把 `export { … } from` 换成 `export * from`；⑦ **在 interface 侧文件里 import 任何 `infrastructure/` 路径**（哪怕只是 re-export —— 那是 `check-layers` 与 `cycle-check` **都看不见**的真违规）；⑧ **复制 2 个死绑定**（§6.5）；⑨ **碰 `tests/ui-redesign-verify/rig-server/`**。

---

## 11 给 Agent C 的验证清单

C 为只读 + 自建对拍（**不复用 B 的脚本**），临时产物一律放 `/tmp`，探针一律 `PORT=0`，**硬禁网**。

| # | 验证项 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| V1 | 版本锚点 | `git rev-parse HEAD`；`shasum -a 256` 冻结副本 | `teacherController.js` == `729a83b064bdac822bf52f5713ecfc3893d842c57754dcd7eebb076d30a60764`、**1338** 行（若已删，用 `git show c5632b0:server/src/controllers/teacherController.js` 重建） |
| V2 | **B0b 路径等价（本步独有，最高优先）** | §7.2 探针：5 个路径常量归一化后 `cmp`；+ **变异正控** + 副作用正控 | 5/5 逐字相等；变异**必报差异**；`/tmp` 树内 `uploads/materials` 存在、`<repo>/server/src/**/uploads` **不存在**；`grep -c "__dirname\|fileURLToPath"` 在新树 = **0** |
| V3 | **逐字搬移（静态）** | §7.6 `slice-equal.mjs`：40 个顶层具名单元逐块 sha256 | **37/40 全等**；**仅 X1/X2/X3 三块豁免**且豁免的每一行都落在 §7.7 表内（多一行即判负）；反向「未匹配字节 = 0」 |
| V4 | 声明行 export 审计 | 目标侧声明行 `export` 计数 = **30**，名字集与源**完全相同**；`export *` = **0**；`gradeProject` **无** `export` 修饰且仍在 `grade.js` 内 | 逐字相等 |
| V5 | **行为对拍（动态）** | §7.3/§7.4：**F00–F31**，两个独立进程，`cmp` JSON（**四维：返值 + 终态 DB + 有序调用日志 + fetch 请求体**） | **byte-identical**；先过「before 跑两次相等」 |
| V6 | 装置自检 | §7.5 三项 + **守门员自检**（16 处 403 中至少抽 6 处逐字命中，**含 `:971`/`:972` 两条唯一文案**） | 全中（否则装置没打到靶） |
| V7 | **变异反证** | §7.5 注入 4 处变异（practice 三元 / 越权守卫恒真 / 越权判定次序后移 / 971 文案改名） | 必须**报差异**；不报 = 装置失效，判负 |
| V8 | **禁网自证** | 探针在 import 前替换 `globalThis.fetch`；报告写明 `fetchLog.length` 与 `DEEPSEEK_BASE_URL`；**逐条列出 URL** | **每一条 URL 都指向 127.0.0.1 / 桩域名**；出现真实 `api.deepseek.com` 或任何公网地址即判负 |
| V9 | **导出面（两个 barrel 合并）** | `PORT=0 node --input-type=module -e "…"` 分别 import T8 与 T12 后 `{...t8, ...t12}` 求 `Object.keys().sort()`，与改前 `teacherController` 的 `Object.keys()` 对拍 | 恰 **30 名**逐字相等：`addStudent, batchAddStudents, createAssignment, createClass, createQuestion, deleteClass, deleteQuestion, deleteStudent, generateReference, getAllClasses, getAllTeachers, getAssignment, getAssignments, getMyClasses, getMySchools, getMyStudents, getPendingSummary, getProjectFiles, getQuestion, getQuestions, lockAssignment, parseExam, parseExamStream, resetStudentPassword, switchClassSchool, switchSchool, updateClass, updateQuestion, updateStudent, uploadMaterial`；并断言 **T8 ∩ T12 = ∅**（防 I1 的 `{...}` 静默遮蔽）；**显式记录** T1 多出的 6 个内部名（不计入契约面） |
| V10 | 零覆盖分支专项 | **Z1–Z17** 逐条对照改前（尤其 `switchClassSchool` 六态 + 拼接文案、SSE 4 态、`code:1007`、`uploadMaterial` 落盘、16 处 403 文案） | 逐字节相同 |
| V11 | **分层门禁 + 证伪** | `node server/scripts/check-layers.mjs`（**不加 `--save-baseline`**） | 违规 **0**；未分层 **42**（≤43）；**并做门禁证伪**（§2.6 四条反向陷阱，`/tmp` 副本）确认门禁有牙 |
| V12 | 架构门禁 | `node scripts/gates/arch-metrics.mjs` | PASS；unmigrated **42**；**GodFile 2 → 1**（名单只剩 `Doc.vue`）；观察带如实记录 |
| V13 | 循环依赖 | `node scripts/gates/cycle-check.mjs`（**并跑 `--root client/src` 防 client 回归**） | **SCC = 0**、自环 0（边数会变属预期，**不作判据**；barrel 的 re-export **不计边**） |
| V14 | 绑定门禁 | `node scripts/gates/bind-check.mjs` | 违规 **0**；`unresolved` / `external` 与改前基线**一致**（4 / 1）—— **这是唯一能验两个 barrel 的 30 行 re-export 的门禁**。⚠️ **它拦不住 I2 的漏改**（unresolved 仅登记）⇒ **必须真跑 `unit/assignment-q9-branches.test.js`** |
| V15 | 硬指标 | `node scripts/gates/hard-metrics.mjs` | 0/0/0（只扫 `client/src`，本步应**逐字不变**） |
| V16 | **两道 lint** | (a) `./node_modules/.bin/eslint client/src server/src --format json`；(b) `node scripts/gates/lint-check.mjs --json` | (a) **error 0 / warn ≤ 59**（B0b 后应为 **57**）；(b) **exit 0**，且必须用 `--json` 证明：总数 **31 → 29**、`resolved` 恰 **2**（`DEFAULT_MAX_SCORE` / `getTeamTeacherIds`，旧 file）、`fresh` **0**、另有 **1 条迁移**（`gradeProject`，from 旧 file → to `infrastructure/teacher/grade.js`）、**未执行 `--update-baseline`**（基线文件 mtime 未变） |
| V17 | 全量回归 | `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh`（**先查空序号**，脚本对已占用序号 `exit 4`） | 日志 **4 处 `Test Suites:`**、**`failed = 0`**；套件/用例数如实记录（**不得引用旧基线**；B0 补测后用例数应增加） |
| V18 | 越界自查 | `git status --porcelain` + `find . -newermt '<B 开始时刻>' -not -path './node_modules/*'` | 只有计划内的 12 新 + 3 改（+1 删 + B0 的测试 + B 的报告）；`client/dist` / `tests/`（**尤其 rig-server**）/ `scripts/gates/` / `docs/pipeline/lint-baseline.json` 的 mtime **无变化** |
| V19 | 回滚粒度 | `git show --stat HEAD`（每批一个） | 单提交，消息含「拆分前 file:line 范围 + 落层目标 + 验证结果」 |

**判定纪律**：V2 / V3 / V5 / V7 / V11 / V16 是本步核心判据（其余是既定门禁）。任一不符 → 回流 B，**不得**改测试或改门禁迁就实现。
**★C 的对抗性重点（本步与 step 8 的差异）**：① **V2 是本步独有的、也是唯一能防住「静默路径漂移」的判据** —— 它必须**先于**任何搬移步骤执行；② **V8 从「保险」升级为「承重」**（本文件真的出网）；③ **V4/V9 必须显式断言 `gradeProject` 不在导出面**（它是死代码，多一个 `export` 就会让导出面变成 31）。

---

## 12 局限声明

1. **未真落文件、未真跑对拍**：§2.5 的合规预判 = 「用真实门禁脚本自身的常量（`IMPORT_RE`/`NODE_IO`/`EXTERNAL_BLACKLIST`）与逐字复刻的判定式，在内存中对 12 个合成文件的 import 清单求值」，**不等于** `node server/scripts/check-layers.mjs` 对真实新文件的实跑；§7 的 32 组夹具是**配方**，未执行。真跑必须由 C 完成（V5/V11）。
2. **未跑 jest / build / 服务**（A 角色禁令）：§5 的覆盖判定是**静态 + 人读**（方法感知的端点抽取 + 逐用例读状态码 + 分支可达性推演），**不是覆盖率工具读数**。**Z11/Z12/Z14/Z15/Z16/Z17 我逐条标了低/中置信** —— 它们的结论依赖我对夹具「有无空 schoolId / 有无 project+tempId 写盘夹具 / 有无 tmp 学号流程」的阅读，**若 C 实测发现已覆盖，以 C 为准并回流本方案**。
3. **`server/test/e2e/*.spec.js` 未被我逐条读通**：§5.1 已声明它们**不计入覆盖**，但其中 `question-bank.spec.js`/`full-e2e.spec.js` 可能提供 `parse-exam` 的**可复算覆盖**。若 Captain 决定把 e2e 纳入口径，Z4 的 B0 优先级可下调（**Z5/Z7/Z1/Z2 不受影响**）。
4. **「`del` 别名」是我第一遍扫错、第二遍纠正的**：朴素的 `\.delete(` 扫描会漏掉 `ownership-guards.test.js` 的 6 条 DELETE 调用，从而**把 `deleteClass`/`deleteStudent` 误判成零覆盖**。我把这条写进 §5 的「方法与依据」，**提醒后续读者不要用朴素 grep 复算本表**。
5. **`__dirname` 的等价替换是「门禁/探针驱动」而非「架构文档驱动」**：`projectPaths.js` 的 `ROOT` 由**它自己的位置**推出，与源文件的 `__dirname,'../..'` 在**今日的目录布局下**逐字相等（§2.7 实测 4/4 EQUAL）。**若将来有人移动 `utils/projectPaths.js`，两者会同时坏掉** —— 这不是本步引入的脆弱性（`projectPaths.js` 早已被 `hasStandardPackage`/`standardDir` 依赖），但**本步把依赖面从 2 处扩大到 5 处**，如实登记。
6. **两处文档层面的欠债（承 step 8 §12-5，未加重也未修复）**：① 4 个 infrastructure 文件里含 HTTP 语义（`res.status/json`/`res.writeHead`）—— 与架构文档 §1.1「基础设施层禁止包含业务规则」的**字面**不符；② 7 个 interface 文件**直连 Prisma**（71 处 `prisma.*`）—— 与「接口层禁止直接触碰 Prisma / AI SDK」的**字面**不符。二者在源文件今日就已存在（fat controller），**拆分只是把它们显式化**；修复需要真正的用例层重写（改行为），**不在本步**。
7. **行数预估有 ±5% 误差**：§6.2 的预估 = 搬移行数 + 我对 banner / import / export 块的估计。判据是 **< 800**（最大 ≈400，远未逼近），不是精确值。中间态行数（B1 ≈1177 / B2 ≈30）同样是推算，**未实际构造**。
8. **未审计依赖邻居**：`utils/{prisma,logger,scoring,projectPaths,fileTree}`、`constants.js`、`controllers/teamController.js`、`domain/errors.js` **仍分别是 unlayered / domain**，T1–T12 会持续依赖它们（这正是新文件能 0 违规的原因之一）。若后续步骤迁它们的层，**本方案的相对路径需同步调整**（**不是本步缺陷**，且届时应以同一步的门禁读数为准）。
9. **`getMyClasses` 的「无路由」是代码级实测**：`routes/teacher.js` 实测只取 29 名、`client/src` 实测 0 命中。**线上是否仍有旧版页面/脚本在调 `GET /api/teacher/my-classes`，未取证**（需查访问日志，超出只读范围）⇒ **本步一律不删该导出、不新增路由**。
10. **`gradeProject` 的「零引用」是三重静态证据，未做运行时验证**：AST 闭包 0 消费者 + lint 基线 31 条之一 + eslint warn。**动态字符串拼名调用已被我 grep 排除**，但**不能排除外部脚本这么做** —— 故**一律保留**（移进 T10），不删。
11. **`code:1007` 的语义我只做了代码级取证**：Q9 分支的 `confirmWithoutStandardPackage` 契约来自 `:731-737` 的注释（「2026-08 甲方定案」）；**前端是否仍按该协议弹确认框，未取证**。⇒ **一律保留 `1007` 与 `data.warnings` 形状**，不「统一」为 1001。
12. **E2E 装置内的 `rig-server` 副本未审计**：`tests/ui-redesign-verify/rig-server/src/controllers/teacherController.js`（**1231 行**）是**另一棵冻结树**，行数与主树不同（说明它取自更早的提交）。它由装置自用，**本步不碰**；但它意味着「全仓 grep `teacherController`」会有**第二组命中**，后续读者勿误判为第二个调用方。
