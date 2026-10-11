# ProjectQuestionEdit.vue 拆分方案（接缝与响应式护航分析）

- **step**: 5 ｜ **phase**: A（接缝与响应式风险分析）｜ **日期**: 2026-10-11
- **目标文件**: `client/src/views/teacher/ProjectQuestionEdit.vue`（**868 行**，`wc -l`）
- **方案来源**: `docs/plan/2026-10-11-godfile-split-plan.md` §2-#10 / §3 原则 2 / §4 步 5 / §5 DoD / §6 R3 / §8 ｜ 状态机 `docs/split/status.md`
- **格式与深度基准**: `docs/split/Submit.vue-plan.md`（step 2，同为 client A 档）｜ **验证强度基准**: `docs/split/Submit.vue-verify.md`
- **上游装置**: `docs/split/pixel-gate-report.md`（§5 已知局限 / §7 `--regions` 模板）｜ `docs/pipeline/project-constraints.md`（17 条测量纪律）

## 版本锚点（本方案全部实测数据的取值时刻）

| 项 | 实测值 | 命令 |
|---|---|---|
| HEAD | `e37d27c0373a6424e1b63ddc06d3f86883a90976`（短 `e37d27c` = step 4 deepseek.js 拆分提交） | `git rev-parse HEAD` |
| 分支 | `master` | `git rev-parse --abbrev-ref HEAD` |
| 目标文件 sha256 | `1fb6ac50f49d89671362662d78f5b27bc736ef74f51dea82fb9c034f5afe608a` | `shasum -a 256` |
| 目标文件字节数 | 43966 | `wc -c` |
| `git status -- client/` | **空**（工作区该文件零改动） | `git status --short -- client/` |
| 工具链 | node `v24.19.0` · `@vue/compiler-sfc` `3.5.34` · `vue` `3.5.34` · `@playwright/test` `1.60.0` | `node -e` 读 package.json |

⚠️ **锚点勘误（第 10 条纪律）**：`docs/split/status.md:6` 写 `anchor: 2c9e3d9`（step 2 的锚点），**不是当前 HEAD**。本文件所有行号/哈希均为本轮在该锚点下的实测值，引用前必须重新 `git rev-parse HEAD`。

⚠️ **基线勘误（第 10 条纪律，本轮新发现）**：`docs/split/status.md:10` 写「已刷新基线：arch 45 / **GodFile 7** / 观察带 17（step3 后；step4 完成后应为 44 / 6）」，而 `scripts/gates/arch-metrics.mjs:25` 的**代码内基线已是** `{ layerViolations: 0, unmigrated: 44, godfileOver800: 6, over500: 16 }`。本轮 `find … | wc -l` 实测：**>800 = 6 个 · >500 = 16 个**，与代码基线一致、与 status.md 不一致。→ **status.md 滞后一行，B/C 的 DoD 判据必须以 `arch-metrics.mjs` 实跑为准，不得照抄 status.md 的数字**（否则本步会把「6 → 5」误读成「7 → 6」）。

---

## 0 约束遵守声明

| 约束 | 遵守方式 |
|---|---|
| 纯只读 | 本轮**只写本文件**；未创建/修改/删除任何其它文件；**未触碰任何 .vue**（`git status --short -- client/` 实测为空）；`.vue` 只被 `read` |
| 禁止 git 写操作 | 只用 `rev-parse / status`；无 `clean / stash / checkout / reset / restore` |
| 不跑 jest / build / 服务 | 未执行任何 jest、`vite build`、任何服务启动。**实测端口**：`:5173` / `:3000` / `:3100` / `:3110` / `:3111` **全部无监听**（`lsof -nP -iTCP -sTCP:LISTEN` 全表已核对；占用者是系统的 ControlCenter/rapportd/QQ 与 DSH GUI `:19387`，与本仓无关）；未碰 `client/dist` |
| 不碰 `tests/` | 仅**只读**读取 `tests/ui-redesign-verify/**` 作为装置参考；未写入、未执行 rig / probe 的任何子命令 |
| 禁止联网 | 未调用任何网络工具；未 `npm install` |
| 行号与计数自测 | §1 的块边界、5 条横幅、13 段落、**80 个顶层声明 / 28 函数 / 44 个模板可见名**、模板与样式行数全部本轮实测（方法与依据随表给出） |
| 「不改清单」 | 本方案**不触碰** `client/src/views` 的视觉·交互·动效（模板与样式一律零改动），不碰 R-30 字号字面量、`legacy-patch.css`、`antd-theme.js` |

---

## 1 段落接缝图谱（逐段实测）

### 1.0 四个块的真实行数（**纠正常见误读**）

| 块 | 起止行（实测） | 行数 | 非空行 |
|---|---|---|---|
| `<template>` … `</template>` | 1–194 | **194** | 185 |
| `<script setup>` … `</script>` | 196–754 | **559** | 504 |
| `<style scoped>` … `</style>` | 756–857 | **102** | 92 |
| `<style>`（**非 scoped，第二个样式块**）… `</style>` | 859–868 | **10** | 9 |
| 样式合计 | 756–868 | **112** | 101 |
| 合计 | 1–868 | **868** | — |

> **「template 40 行」的来源已定位**：`grep -n '</template>' ProjectQuestionEdit.vue` 的**第一条命中是第 40 行**（那是 `:38-45` 里 `<template v-if/v-else-if/v-else>` 内联插槽的闭合标签；另有 :41/:42/:51/:62/:63/:76/:77/:90/:119 共 9 处内层闭合）。外层 `</template>` 在 **:194**。计划书 §2 表格里的「template 40」应理解为「首个 `</template>` 之前的行数」，**不是模板块大小**。真实模板块 = **194 行**（是「40」的 **4.85 倍**）。
> → 对拆分无影响（本步模板一行不动），但**任何“行数下降”的收益核算必须以 194 为基数**，否则会把收益虚报约 154 行。

> ★**第二个样式块容易被漏掉**：本文件有**两个** `<style>` 块（:756 scoped 102 行 + :859 非 scoped 10 行）。`Submit.vue` 只有一个。→ **L0 切片判等必须切 3 段（template + style1 + style2），不是 2 段**；漏掉 style2 就等于给「`.desc-modal` / `@keyframes prFadeIn` 被改写」留了后门。

### 1.1 5 条段落横幅（实测行号）+ 横幅外的 8 个段落

**文件自带的 5 条 `// ===== … =====` 横幅**（Captain 的盘点与实测完全一致）：

| 横幅行 | 段落名 |
|---|---|
| :266 | 自动评分器（checker） |
| :455 | Monaco |
| :582 | 上传组件回调（ProjectZipUploader） |
| :643 | 学生：提交答案 |
| :681 | 加载已有题目 |

**横幅之外还有 8 个需靠“职责”识别**的段落（本方案按 **13 段**做图谱，比「5 段」更贴近真实接缝）：

| # | 段落名 | 依据 |
|---|---|---|
| P1 | SFC 头 / import 面 / 模式判定 / 锚点声明 | 无横幅（:196 起） |
| P2 | AI 提示词预览模态 | 注释 :234「AI 提示词预览（编辑页模板，与实评共用构建函数）」 |
| P3 | 描述 / 评分标准模态草稿 | 注释 :257「模态框草稿（确定才写回 form，取消即还原）」 |
| P4 | 自动评分器（checker） | 横幅 :266 |
| P5 | 编辑器状态 / tabs | 无横幅（:374 起，:372 的 watch 属 P4） |
| P6 | 学生成绩卡片 | 注释 :381「学生端提交的版本/状态信息（来自 toStudentView，已脱敏）」+ :385「R4：成绩放行的唯一开关」 |
| P7 | form / 只读渲染 | :410 `form` + :420/:425 两条注释 |
| P8 | Monaco | 横幅 :455 |
| P9 | 保存守卫 | 无横幅（:523 `handleSave`；:526 注释「保存守卫（2026-08-18）」） |
| P10 | 上传组件回调（ProjectZipUploader） | 横幅 :582 |
| P11 | 学生：提交答案 | 横幅 :643 |
| P12 | 加载已有题目 | 横幅 :681 |
| P13 | 生命周期 | 无横幅（:741/:748） |

### 1.2 逐段详表（起止行 / 段内声明 / 响应式对象 · 生命周期 / 模板引用 / ★双模式执行路径）

> 归属规则：段落起点 = 上表实测行；终点 = 下一段起点 −1。P1 含 :196–233 的 import 面与全部“锚点声明”（见 §1.3 暗礁 1）。
> **★双模式列**：`T` = 教师模式（`mode='teacher'`，路由 `/exam/teacher/questions/new/project` :29 / `/questions/:id/edit-project` :30）；`S` = 学生模式（`mode='student'`，路由 `/exam/student/assignments/:assignmentId/project/:questionId` :53，`props:{mode:'student'}`）；`—` = 该模式不进入。

| # | 段落 | 起止行（实测） | 行数 | 段内顶层声明（名@行） | 用到的响应式/普通对象 | 生命周期 | 模板直接引用 | ★T 路径 | ★S 路径 |
|---|---|---|---|---|---|---|---|---|---|
| **P1** | 头 / import / 模式 / 锚点 | 196–233 | 38 | `props`@215 `isTeacher`@216 `isStudent`@217 `router`@219 `route`@220 `isEdit`@221 `submitting`@222 `hasUploaded`@223 `uploadKeptCount`@225 `uploadKeptBytes`@226 `editorContainerRef`@227 `{ensureTheme}`@229 `{attach:attachKeyboardA11y}`@231 `showDescModal`@232 `showRubricModal`@233 | 全段 15 声明 | — | **是**（8 名）：`isTeacher` `isStudent` `isEdit` `submitting` `hasUploaded` `editorContainerRef` `showDescModal` `showRubricModal` | 全量执行 | 全量执行 |
| **P2** | AI 提示词预览模态 | 234–240 | 7 | `promptModalOpen`@235 `promptLoading`@236 `promptPreview`@237 `promptUserPartLabel`@239（computed） | 4 自有 | — | **是**（4 名，:81–88） | 全量（:46 按钮 `v-if="isTeacher && isEdit"`；:241 `showPromptPreview` 调 `GET /teacher/questions/:id/project-prompt-preview`） | **不进入**（:46 按钮不渲染；`showPromptPreview` 永不调用；4 个状态恒为初值） |
| **P3** | 模态草稿 | 256–264 | 9 | `descDraft`@258 `rubricDraft`@259 `openDescModal`@261 `openRubricModal`@262 `confirmDesc`@263 `confirmRubric`@264 | 4 自有 + 读/写 `form` | — | **是**（:55 `descDraft` / :68 `rubricDraft` / :31,32,61,75 四个 handler） | 全量（读写 `form.description` / `form.scoringRubric`） | **部分**：:31 题目描述 / :32 评分标准 按钮**双模式都渲染**，`:54`/`:67` 的 `v-model:open` 都绑 → 学生可打开只读视图；`descDraft`/`rubricDraft` 与 `confirm*` 学生态**不可达**（:55/:68 的 `v-if="isTeacher"` 与 :58/:72 的 `!isTeacher` 分支） |
| **P4** | **自动评分器（checker）** | **266–372** | **107** | `FEATURE_CHECKER_ENTRY`@270 · `checkerOpen`@272 `checkerLoading`@273 `checkerData`@274 `checkerTimer`@275 `checkerStatus`@277 `checkerMeta`@278 `checkerCanClose`@280 `checkerLoadedOnce`@282（`let`）`checkerStale`@284 · `checkerLogs`@302 `ensureCheckerState`@287 `onCheckerStatusChange`@298 `fetchChecker`@304 `startCheckerPoll`@322 `stopCheckerPoll`@327 `openCheckerModal`@334 `handleGenerateChecker`@339 `copyScript`@362 · **watch@372** | 9 响应式 + 1 常量 + 1 `let` | ★**watch(checkerOpen)**@372 | **是**（6 名）：`FEATURE_CHECKER_ENTRY`@38 `checkerOpen`@99,114,118 `checkerStatus`@39,40,41,44,106,117 `checkerCanClose`@104 `onCheckerStatusChange`@113 `openCheckerModal`@39 | 全量：入口按钮 `:38 v-if="isTeacher && isEdit && FEATURE_CHECKER_ENTRY"` → **当前 `false`，按钮不渲染**；但 `openCheckerModal` **仍被 :532/:541/:546 的保存守卫调用**（逃生通道，见 §6） | **不进入**：`:38` 要求 `isTeacher`；`loadQuestion` 学生分支不调 `ensureCheckerState`（:708 在教师 `return` 之前）→ `checkerLoadedOnce` 恒 `false`、`checkerStatus` 恒 `'none'`、`checkerTimer` 恒 `null` |
| **P5** | 编辑器状态 / tabs | 374–380 | 7 | `activePath`@374 `fileContents`@375（`Map`）`externalTree`@377 `openTabs`@378 `studentSubmission`@379 | 4 自有 + 1 `Map` | — | **是**（4 名）：`activePath`@176 `externalTree`@112,170 `openTabs`@175,176,184 `studentSubmission`@123,125,126,131,136,141 | 全量 | 全量（`studentSubmission` 仅 S 有非 null 值，但其 4 个消费者都在 `v-if="isStudent"` 或 `v-else` 分支里） |
| **P6** | 学生成绩卡片 | 381–408 | 28 | `assignmentId`@382 `questionId`@383 `canStudentSeeScoreNow`@386 `studentStatusText`@390 `studentStatusType`@398 `formatSubmitTime`@406 | 6 声明（2 computed 取 route，4 computed/函数） | — | **是**（5 名）：`canStudentSeeScoreNow`@123,129 `studentStatusText`@125 `studentStatusType`@125 `formatSubmitTime`@126 `studentSubmission`@123 | **声明可用但模板不可达**（:123 `v-if="isStudent && studentSubmission"`；`handleSubmit` 只在学生分支） | 全量：`assignmentId/questionId` 也供 :655 提交 URL 与 :713 加载 URL |
| **P7** | form / 只读渲染 | 410–430 | 21 | `form`@410（`reactive`）`difficultyTagClass`@423 `safeDescriptionHtml`@426 | 1 reactive + 2 computed | — | **是**（3 名，但 `form` 被绑 10 处） | 全量（`form.title/difficulty/maxScore` 可编辑；`form.packageFile` 由上传组件写） | 全量（:11/:15/:25 的输入控件 `v-if="isTeacher"` 不渲染，改由 :12/:20/:26 只读展示；`form.packageFile` 由 :154 `v-model:package` 写） |
| **P8** | **Monaco** | **432–521** | **90** | `monaco`@432 `editor`@433 `models`@434 `keyboardA11y`@435（4 个 `let`）· `resetModels`@438 `registerExtraLanguages`@457 `initMonaco`@463 `getOrCreateModel`@485 `switchTab`@496 `closeTab`@503 `openFile`@511 · `fading`@517 · **watch(activePath)**@518 | 1 ref + 4 普通 `let` | ★**watch(activePath)**@518 | **是**（3 名）：`switchTab`@176 `closeTab`@178 `fading`@183 | 全量（唯一挂载入口 = P10/P11/P12 三处 `await initMonaco()`） | 全量（同上；:183 `ref="editorContainerRef"` 双模式都渲染） |
| **P9** | **保存守卫** | **523–580** | **58** | `handleSave`@523 | 读 `form.title/difficulty/maxScore/description/scoringRubric/tempId` + 读 P4 的 `checkerLoadedOnce checkerStatus checkerStale checkerMeta` + 调 P4 的 `ensureCheckerState`/`openCheckerModal` + `router`/`route`/`isEdit` | — | **是**：`handleSave`@47 | 全量（:47 保存按钮 `v-if="isTeacher"`）；:527 `if (isEdit.value)` → **新建页跳过整段守卫**，:567 决定 PUT vs POST | **不进入**（`handleSave` 无学生调用点） |
| **P10** | 上传组件回调 | 582–641 | 60 | `onZipReady`@585 `onZipSelect`@614 `teacherUpload`@619 `findFirstFile`@632 | 写 `fileContents Map externalTree uploadKeptCount uploadKeptBytes hasUploaded form.tempId` + 读 `form.packageFile` + 读 `checkerLoadedOnce checkerData` + 写 `checkerStale` + 调 P8 的 `resetModels initMonaco openFile` | — | **是**：`onZipReady`@155 `onZipSelect`@171（`:156 @error="(m) => message.error(m)"` 是内联箭头，非本文件顶层名） | 全量：:597 `if (isTeacher.value && form.packageFile)` → 走 `teacherUpload`（拿 `tempId`）；:602 置 `checkerStale` | **部分**：:152–157 的 `ProjectZipUploader` 与 :169–172 的第二个都渲染；:597 的 `isTeacher` 守卫为假 → **不调 `teacherUpload`**，`form.tempId` 恒 `''`；:602 因 `checkerLoadedOnce` 恒 `false` → **不置 `checkerStale`** |
| **P11** | 学生：提交答案 | 643–679 | 37 | `handleSubmit`@645 | 读 `form.packageFile assignmentId questionId uploadKeptCount uploadKeptBytes`；写 `submitting studentSubmission externalTree hasUploaded`；调 P8 的 `resetModels initMonaco openFile` + P10 的 `findFirstFile` | — | **是**：`handleSubmit`@48 | **不进入**（:48 是 `v-else` 分支） | 全量：`POST /student/assignments/:assignmentId/project/:questionId/submit`（multipart），成功写 `studentSubmission` + 后端的 `files.tree/contents` |
| **P12** | 加载已有题目 | 681–739 | 59 | `loadQuestion`@683 | 写 `form.*`；教师分支写 `externalTree fileContents hasUploaded`，学生分支另写 `studentSubmission`；调 `ensureCheckerState`(P4) / P8 四函数 / P10 的 `findFirstFile` | — | **否**（由 P13 的 `onMounted` 调） | 教师分支 :686–709：`GET /teacher/questions/:id` → 有 `attachmentUrl` 时再 `GET …/project-files` → :708 `await ensureCheckerState()` → **`return`** | 学生分支 :712–735：`GET /student/assignments/:aid/project/:qid` → 写 `form` → `q.submission` 存在时写 `studentSubmission` + `q.files.tree/contents` → **无 `return`，但函数体到此结束** |
| **P13** | 生命周期 | 741–753 | 13 | `onMounted`@741 `onBeforeUnmount`@748 | 读 `isTeacher route.params.id route.params.assignmentId route.params.questionId keyboardA11y checkerTimer models editor` | ★**两个 hook 全在此** | **否** | `hasQuestion = !!route.params.id` → 有则 `loadQuestion()` | `hasQuestion = !!(route.params.assignmentId && route.params.questionId)` → 有则 `loadQuestion()` |

**行数闭合核对**：13 段合计 **559 行**（= script 块 196–754 实测行数 ✔）。横幅只覆盖 **P4/P8/P10/P11/P12**，P1/P2/P3/P5/P6/P7/P9/P13 无横幅 —— 与 `ruleExecutor-plan.md` 的处理一致（**按职责切，不按横幅整段搬**）。

### 1.3 三处「物理位置 ≠ 逻辑归属」的暗礁（实测）

1. ★**「锚点声明区」（:215–284）是最大的归属陷阱**：这一段把**跨 5 个未来单元**的声明混在一起 —— `isTeacher/isStudent/isEdit/submitting/editorContainerRef`（模式+接线根）、`showDescModal/showRubricModal`（P3）、`promptModalOpen/promptLoading/promptPreview`（P2）、`checkerOpen/checkerData/checkerTimer/checkerLoadedOnce/checkerStale/FEATURE_CHECKER_ENTRY`（P4）、`ensureTheme/attachKeyboardA11y`（P8 的注入）。**若按 :196–233 整段搬，会造出一个既不是 P2 也不是 P4 的“杂物段”** —— 本方案按**消费者**归属切（§2.2），**不按行区间整段搬**。
2. ★**`checkerLoadedOnce`@282（`let`，非 ref）是跨 3 个单元的共享可变状态**：写在 P4 的 `ensureCheckerState`@292，读在 P10 的 `onZipReady`@602 与 P9 的 `handleSave`@528。它**不是响应式的**（`let`）→ 搬进 composable 时**必须是“闭包内单实例”**，由 `useChecker` 通过 getter/setter 暴露或由接线根持有。**若被两处各声明一次 → 会出现“保存时不重新拉取（正确）／上传后不置 stale（错误）”的静默分叉**。
3. ★**`watch(checkerOpen)`@372 物理在 P4 尾部、但逻辑属“轮询生命周期”**；`watch(activePath)`@518 物理在 P8 尾部、逻辑属“切换动效”。两者都是**顶层注册**（不在 `onMounted` 内），搬移后仍须在 setup 同步阶段注册（§3.1-2）。

### 1.4 模板可见面实测（拆分的硬边界）

| 类别 | 数量 | 明细（实测行号） |
|---|---|---|
| 模板引用的**本文件顶层名字** | **44** | `activePath canStudentSeeScoreNow checkerCanClose checkerOpen checkerStatus closeTab descDraft difficultyTagClass editorContainerRef externalTree FEATURE_CHECKER_ENTRY fading form formatSubmitTime handleSave handleSubmit hasUploaded isEdit isStudent isTeacher onCheckerStatusChange onZipReady onZipSelect openCheckerModal openDescModal openRubricModal openTabs promptLoading promptModalOpen promptPreview promptUserPartLabel confirmDesc confirmRubric route rubricDraft safeDescriptionHtml showDescModal showPromptPreview showRubricModal studentStatusText studentStatusType studentSubmission submitting switchTab` |
| 其中是**函数** | **14** | `showPromptPreview`@241 `openDescModal`@261 `openRubricModal`@262 `confirmDesc`@263 `confirmRubric`@264 `onCheckerStatusChange`@298 `openCheckerModal`@334 `formatSubmitTime`@406 `switchTab`@496 `closeTab`@503 `handleSave`@523 `onZipReady`@585 `onZipSelect`@614 `handleSubmit`@645 |
| **事件处理器**（`@click/@ready/@error/@confirm/@select`） | **11 个函数 + 3 处内联** | `openDescModal`(31) `openRubricModal`(32) `openCheckerModal`(39) `showPromptPreview`(46) `handleSave`(47) `handleSubmit`(48) `confirmDesc`(61) `confirmRubric`(75) `onZipReady`(155) `onZipSelect`(171) `switchTab`(176) `closeTab`(178)；内联：`:114 ()=>(checkerOpen=false)`、`:118 checkerOpen=false`、`:156 (m)=>message.error(m)` |
| 模板 **`ref`** | **1** | `editorContainerRef`@183 |
| 模板内联赋值目标（`v-model`） | **10 处** | `form.title`(11) `form.difficulty`(15) `form.maxScore`(25) `showDescModal`(54) `descDraft`(55) `showRubricModal`(67) `rubricDraft`(68) `promptModalOpen`(81) `checkerOpen`(99) `form.packageFile`(154) |
| 模板引用但**非**本文件顶层名 | 3 类 | `message`（:156，`import` 自 ant-design-vue，模板作用域可见）；`tab`（:176/:178 的 `v-for` 局部变量）；`route.params.id`（:109 经 `route`） |

**对拆分的硬含义**：这 44 个名字（含 14 函数）**必须仍能在模板作用域解析**，且 `ref`/`computed` 的“类型”不得退化（`setup-ref` → `setup-const` 会丢 ref 自动解包）。允许的实现形态见 §2.1。

### 1.5 ★双模式执行路径总表（**本文件独有，必须正面处理**）

**路由事实**（`client/src/router/index.js` 实测）：

| 行 | 路径 | 组件 | props |
|---|---|---|---|
| :29 | `questions/new/project` → `TeacherQuestionProjectNew` | `import('../views/teacher/ProjectQuestionEdit.vue')` | 无 → `mode='teacher'`（默认值，:215） |
| :30 | `questions/:id/edit-project` → `TeacherQuestionProjectEdit` | 同上 | 无 → `mode='teacher'` |
| :53 | `assignments/:assignmentId/project/:questionId` → `StudentProjectQuestion` | **同一个 .vue**（教师目录下的文件） | **`props: { mode: 'student' }`** |

**模式判定的唯一来源**：`props.mode`@215 → `isTeacher`@216 / `isStudent`@217。**全文件只有这 2 个 computed 承载模式语义**；其余模式分支全部由模板 `v-if/v-else` 表达（:3/:4/:5/:10/:11/:12/:15/:20/:25/:26/:38/:46/:47/:48/:54/:55/:56/:58/:67/:68/:69/:70/:72/:123/:153/:160）。

**逐段落的双模式结论**：

| 分段归属 | 段落 | T | S | 判定依据 |
|---|---|---|---|---|
| **教师专属** | P2 提示词预览 | ✅ | ❌ | :46 按钮 `v-if="isTeacher && isEdit"`；`showPromptPreview`@241 无其它调用点 |
| **教师专属** | P4 checker | ✅ | ❌ | :38 要求 `isTeacher`；`ensureCheckerState` 只在 P9@528 / P12 教师分支@708 被调 |
| **教师专属** | P9 保存守卫 | ✅ | ❌ | :47 按钮 `v-if="isTeacher"` |
| **学生专属** | P6 成绩卡片 + P11 提交 | ❌ | ✅ | :123 `v-if="isStudent && …"`；:48 `v-else` |
| **双模式共用** | P1 模式/锚点 · P5 编辑器状态 · P7 form · P8 Monaco · P10 上传回调 · P12 加载 · P13 生命周期 | ✅ | ✅ | 见 §1.2 各行「★S 路径」列 |
| **双模式共用但分支不同** | P3 模态草稿 | ✅ 读写 | ✅ 只读 | :31/:32 按钮双模式渲染 → :54–:77 弹窗双模式可开；`:55/:68` 编辑器与 `:61/:75` 保存仅 T |

**★两条模式一致性断言（B/C 必须守住）**：

- **A1（模式常量不动）**：`isTeacher`/`isStudent` 的**定义式**（`props.mode === 'teacher'` / `=== 'student'`）与**求值时刻**（setup 同步阶段、`computed` 惰性）搬移后必须逐字不变。**任何一个 `v-if` 拿到相反的布尔值都属破坏性回归**，且**模板字节判等抓不到**（模板没变，变的是 script 给的值）。
- **A2（学生模式不得“顺带修”）**：学生模式下 `checkerLoadedOnce` 恒 `false`、`checkerStale` 恒 `false`、`form.tempId` 恒 `''`、`submitting` 仅由 `handleSubmit` 驱动 —— 这些**都是当前行为**，**不得**因为“学生用不到 checker”就把 P4 从接线里摘掉或改成条件创建（那会改变 setup 期的副作用面）。**P4 必须在两种模式下都被实例化**。

---

## 2 目标 composable 划分

### 2.1 四条不可协商的形式前提

**(a)「模板零改动」在 `<script setup>` 下的成立条件**：Vue 3 把 `<script setup>` 的**顶层绑定**编译进 `setup()` 返回对象，模板渲染函数以 `$setup.xxx` 访问。**composable 返回值被顶层解构后，与原来直接声明的 ref/函数在模板里语义相同**（ref 解包、函数原样传递）。因此：

- ✅ 允许：`const { form, isTeacher, isEdit, hasUploaded, submitting, … } = useProjectQuestionPage();`
- ✅ 允许：`const { FEATURE_CHECKER_ENTRY, checkerOpen, checkerStatus, checkerCanClose, openCheckerModal, onCheckerStatusChange } = useChecker({ route });`
- ❌ 禁止：把状态藏在嵌套对象里（`const s = useProjectQuestionPage();` 然后模板写 `s.form`）—— 那要改模板。
- ❌ 禁止：在 composable 里 `export`（`<script setup>` 不允许 `export` 语句，编译直接失败）。

**(b) 单一「接线根」**：全部 composable 在 `<script setup>` 顶层**同步**调用一次，跨 composable 的共享状态**以参数注入**（`useZipUpload({ resetModels, initMonaco, openFile, … })`），**不做嵌套调用**。理由：① 避免循环依赖（§2.3 实证 3 处真环）；② 参数表就是可测试的契约面；③ 保证所有 `watch/onMounted/onBeforeUnmount` 都在 setup 同步阶段注册（§3.1-3）。

**(c) 清理集中注册**：`onBeforeUnmount` **只在 .vue 里注册一次**，按原顺序调各 composable 暴露的 `disposeXxx()`。理由见 §3.1-4（**Hook 注册顺序 = 执行顺序**，集中注册消除顺序依赖）。

**(d) ★本文件新增的第 4 条前提（双模式）**：`isTeacher`/`isStudent`/`isEdit` **由接线根唯一创建并向下注入**，**任何 composable 不得自行 `computed(() => props.mode === …)`**。理由：§1.5-A1 —— 重复创建会产生第二个真值源，而模板字节判等与 bindings 判等**都看不见“值是错的”**。

### 2.2 文件 → 单元对照表（**完整覆盖 80 个顶层声明 + 741–753 两个 hook 体**）

命名遵循本仓既有约定：`client/src/composables/<域>/useXxx.js`，具名导出 + `export default`（对齐 `useConfirm.js:44,77` / `useMonacoTheme.js:139,148` / `composables/submit/*`）。**本步新建 `client/src/composables/project/` 子目录**（`composables/submit/` 的既有先例，实测 9 文件已在库）。

> 行数口径：**搬移行数** = 源文件中所搬声明所在行的**实测行数跨度**（含紧邻 JSDoc/注释，可复核）；**预估总行数** = 搬移行数 + banner/import/导出/包装的估计（±10%）。

| 目标文件 | 单元 | 搬移内容（源行号，逐字） | 声明数 | 搬移行数 | 预估总行数 | 新文件 |
|---|---|---|---|---|---|---|
| **W1** `client/src/composables/project/zipEntry.js` | **纯叶子**（零响应式 / 零 vue import / 零 P8 依赖） | `UTF8_STRICT`@445 `GBK_DECODER`@446 `findFirstFile`@632-641 | 3 | ≈13 | **≈35** | ✅ |
| **W2** `…/project/useEditorWorkspace.js` | Monaco 实例 + 文件树 + tabs（**唯一 import monaco / `@monaco-editor/loader`**） | `monaco`@432 `editor`@433 `models`@434 `keyboardA11y`@435 · `resetModels`@438-442 `registerExtraLanguages`@457-461 `initMonaco`@463-483 `getOrCreateModel`@485-494 `switchTab`@496-501 `closeTab`@503-509 `openFile`@511-514 · `fading`@517 · **watch(activePath)**@518-521 · `activePath`@374 `fileContents`@375 `externalTree`@377 `openTabs`@378 · ★`{ensureTheme}`@229 与 `{attach:attachKeyboardA11y}`@231 的 **acquire 迁入本文件**（**各只调一次**） | 12 + 2 注入 | ≈120 | **≈155** | ✅ |
| **W3** `…/project/useStudentSubmission.js` | **学生专属**：成绩卡片 + 提交 | `studentSubmission`@379 `assignmentId`@382 `questionId`@383 `canStudentSeeScoreNow`@386-389 `studentStatusText`@390-397 `studentStatusType`@398-403 `formatSubmitTime`@406-408 `handleSubmit`@645-679 | 8 | ≈75 | **≈95** | ✅ |
| **W4** `…/project/useChecker.js` | **教师专属**：checker 状态机 + 轮询 + 提示词预览 | `FEATURE_CHECKER_ENTRY`@270 · `checkerOpen`@272 `checkerLoading`@273 `checkerData`@274 `checkerTimer`@275 `checkerStale`@284 · `checkerLoadedOnce`@282（`let`）· `checkerStatus`@277 `checkerMeta`@278 `checkerCanClose`@280 `checkerLogs`@302 · `ensureCheckerState`@287-295 `onCheckerStatusChange`@298-301 `fetchChecker`@304-320 `startCheckerPoll`@322-325 `stopCheckerPoll`@327-332 `openCheckerModal`@334-337 `handleGenerateChecker`@339-360 `copyScript`@362-369 · **watch(checkerOpen)**@372 · `promptModalOpen`@235 `promptLoading`@236 `promptPreview`@237 `promptUserPartLabel`@239 `showPromptPreview`@241-255 | 27 | ≈145 | **≈180** | ✅ |
| **W5** `…/project/useZipUpload.js` | 上传回调 + 教师上传 | `onZipReady`@585-611 `onZipSelect`@614-616 `teacherUpload`@619-630 · `uploadKeptCount`@225 `uploadKeptBytes`@226 `hasUploaded`@223 | 6 | ≈65 | **≈90** | ✅ |
| **W6** `…/project/useQuestionForm.js` | form 所有权 + 只读渲染 + 模态草稿 | `form`@410-418 `difficultyTagClass`@423 `safeDescriptionHtml`@426-430 · `showDescModal`@232 `showRubricModal`@233 `descDraft`@258 `rubricDraft`@259 `openDescModal`@261 `openRubricModal`@262 `confirmDesc`@263 `confirmRubric`@264 | 12 | ≈35 | **≈60** | ✅ |
| **W7** `…/project/useSaveQuestion.js` | **教师专属**：保存守卫 + PUT/POST | `handleSave`@523-580 | 1 | ≈58 | **≈80** | ✅ |
| **W8** `…/project/useLoadQuestion.js` | 双模式加载编排 | `loadQuestion`@683-739 | 1 | ≈57 | **≈80** | ✅ |
| **W9** `…/project/useProjectQuestionPage.js` | **接线根**（唯一被 .vue 调用的入口） | `props`@215（★**`defineProps` 必须留在 .vue**，W9 接收 `props`）`isTeacher`@216 `isStudent`@217 `isEdit`@221 `router`@219 `route`@220（`useRouter`/`useRoute` 在 W9 内各调一次）`submitting`@222 · 组装 W1–W8 + `editorContainerRef`@227 · **平移 `onMounted`@741-746 / `onBeforeUnmount`@748-753 两个回调体**（4 步顺序见 §3.1-4） | 7 + 2 hook 体 | ≈30 | **≈150** | ✅ |
| — | 源文件 `ProjectQuestionEdit.vue` | `<script setup>` 559 → **≈95**；`<template>` 1–194 与两个 `<style>` 756–868 **逐字节不动** | — | −≈465 | **868 → ≈300** | — |

**行数闭合核对**：W1≈35 + W2≈155 + W3≈95 + W4≈180 + W5≈90 + W6≈60 + W7≈80 + W8≈80 + W9≈150 = **≈925 行**（含 banner/import/JSDoc 约 15% 开销）。
**声明闭合核对**：W1 3 + W2 12(+2 注入) + W3 8 + W4 27 + W5 6 + W6 12 + W7 1 + W8 1 + W9 7 = **80** ✔（`props` 归 W9 接收、`ensureTheme`/`attachKeyboardA11y` 归 W2 接收）。
**函数闭合核对**：W1 1 + W2 7 + W3 2 + W4 10 + W5 3 + W6 4 + W7 1 + W8 1 + W9 0 = **28 = 全文件函数数** ✔

**预估 .vue 最终行数 ≈ 300 行**（194 模板 + 112 样式 + ≈95 script − 1，含块标签行）。**868 → ≈300，GodFile >800 计数 6 → 5**（`arch-metrics.mjs:25` 基线 `godfileOver800: 6`）。⚠️ **新文件最大 ≈180 行（W4）**，全部 **<500 → 不进观察带**；而 `ProjectQuestionEdit.vue` 从 868 掉到 ≈300 后**同时离开 800 带且不进 500 带** → **观察带 16 → 16 保持不变**（比 step 2 的 18→27 更干净，不产生“观察带上升”的口径争议）。**仍需在提交后以 `arch-metrics.mjs` 实跑为准并刷新基线 6 → 5。**

**依赖方向（保证无环）**：

```
W1  纯叶子，零依赖
W2 → 只 import vue / @monaco-editor/loader / legacyLoaderCompat / useMonacoTheme / useMonacoKeyboardA11y / getLanguage
W3 → W1(findFirstFile)，注入 { resetModels, initMonaco, openFile }(W2) + { form }(W6) + editorContainerRef(W9)
W4 → 零内部依赖（只 import vue / vue-router 的 route 由注入 / request / message）；注入 route
W5 → W1, W2(resetModels/initMonaco/openFile)，注入 { form, isTeacher, hasUploaded, uploadKeptCount,
                                                          uploadKeptBytes } + W4 的 { isLoaded:()=>checkerLoadedOnce,
                                                          status:()=>checkerData.value.status, markStale() }
W6 → 零内部依赖（只 import vue / DOMPurify）
W7 → 注入 { form, isEdit, route, router, checker:{…}(W4) }              ← 不 import W4
W8 → W1, W2，注入 { form, isTeacher, route, hasUploaded, externalTree, fileContents,
                    studentSubmission(W3), ensureCheckerState(W4) }
W9 → W1..W8 全部（唯一汇聚点）
```

**无环**：`useProjectQuestionPage` 是唯一被 .vue 调用的；其余**互不 import**，跨单元调用一律以**参数注入**发生。

### 2.3 三处真实循环依赖（若不做参数注入必然成环）

1. **W5 ↔ W4**：`onZipReady`@602 读 `checkerLoadedOnce`、写 `checkerStale`（都属 W4）；而 W4 不需要 W5。→ 看似单向，但**若 W5 去 import W4**（或反过来 W4 需要 `hasUploaded`）即成环。**解法：W4 通过 `{ isLoaded: () => checkerLoadedOnce, status: () => checkerData.value.status, markStale: () => { checkerStale.value = true } }` 注入 W5**（getter/setter，而非 import）。
2. **W7 ↔ W4**：`handleSave`@528 调 `ensureCheckerState`、@532/@541/@546 调 `openCheckerModal`、@530 读 `checkerStale`、@529/@277 读 `checkerStatus`、@550 读 `checkerMeta`；而 W4 完全不需要 W7。→ **解法：W9 把 W4 的返回对象整体作为 `checker` 参数注入 W7**（`useSaveQuestion({ …, checker })`）。
3. **W8 ↔ W4 / W3**：`loadQuestion`@708 调 `ensureCheckerState`（W4）、:725 写 `studentSubmission`（W3）；而 W3 的 `handleSubmit` 要用 W1 的 `findFirstFile`（与 W8 无关）。→ **解法：W9 把 W3 的 `{ studentSubmission }` 与 W4 的 `{ ensureCheckerState }` 注入 W8**。

> **共同形态**：**环全部出现在“接线根 → 叶子”这一层**，因此 §2.1(b) 的“单一接线根 + 参数注入”是唯一不需要 import 环的解。**B 不得图省事让 composable 互相 import。**

### 2.4 本仓既有先例（**均有事实依据**）

| 先例 | 事实 | 对本步的含义 |
|---|---|---|
| `client/src/composables/`（7 文件 916 行，**均 <250 行**） | `useConfirm.js` 77 · `useDraftAutosave.js` 139 · `useMonacoKeyboardA11y.js` 133 · `useMonacoTheme.js` 148 · `useProjectUpload.js` 69 · `useSelectAriaSync.js` 223 · `useTheme.js` 127 | 规模惯例：单 composable ≤250 行 → **本步 9 个文件全部 ≤≈180 行，合规且优于 step 2（其 W2 ≈360 行超惯例）** |
| `client/src/composables/submit/`（**9 文件，step 2 产物，实测已在库**） | `answerFormat.js` 2633B · `useSubmitPage.js` 7651B … | ★**目录化先例已落地** → 本步用 `composables/project/` 与之一致，**不新建“顶层扁平”文件** |
| `useMonacoTheme.js`（148 行） | `:139` `export function useMonacoTheme()`；**模块级 `watch(resolved, …)`@129（不在 composable 内）**；`:126 lastMonaco = null` + `:141 lastMonaco = monaco` 模块级单例 | ★**可直接复用**：W2 只把 `:229` 的 `const { ensureTheme } = useMonacoTheme();` 调用点迁入。**它的模块级 watch 与 `lastMonaco` 单例使“调用几次”这件事本身有意义** —— 必须**只调一次**（§3.1-4 风险点 ②） |
| `useMonacoKeyboardA11y.js`（133 行） | `:93` `export function useMonacoKeyboardA11y()`；★**`:128 onBeforeUnmount(disposeAll)`（composable 内自注册 hook）**；`:97` `attach(editor, boundary, options)` 把实例推进模块级集合；`:123` `disposeAll()` | ★★**本步最高风险点**：它**已经**自注册了 `onBeforeUnmount`；本文件 `:749 keyboardA11y?.dispose()` 是**第二次**释放（当前靠幂等兜底）。**搬移必须保持「hook 注册顺序」与「只调用一次」两条**（§3.1-3/4） |
| `useDraftAutosave.js:134` `if (getCurrentInstance()) onBeforeUnmount(stop)` | 本仓已有“composable 内注册生命周期”的先例 | 说明“composable 内注册 hook”本身合规；**本方案仍选择集中注册**（§2.1(c)），因为本步有两个 hook 且顺序敏感 |

---

## 3 ★响应式与生命周期风险逐条判定（本步核心）

> 判定口径：**等价** = 有明确机制论证，无需实测即可接受；**需特殊处理** = 必须遵守指定写法才等价；**不确定需实测** = 静态阅读无法给出确定结论，必须由 C 用行为验证覆盖。

### 3.1 逐条判定表

| # | 问题 | 判定 | 理由与依据 |
|---|---|---|---|
| **1** | **ref/computed 的所有权** | **等价（需特殊处理）** | 模板直接绑定的 **44 个名字** = **22 `ref` + 11 `computed` + 1 `reactive`（`form`）+ 8 普通 `let/const`（`FEATURE_CHECKER_ENTRY` `checkerLoadedOnce` `monaco` `editor` `models` `keyboardA11y` `UTF8_STRICT` `GBK_DECODER`）+ 14 函数**（`props`/`route` 另计）。**所有权必须唯一**：`form` 归 **W6**；`activePath/fileContents/externalTree/openTabs` 归 **W2**；`studentSubmission` 归 **W3**；checker 系 9 个响应式归 **W4**；`hasUploaded/uploadKeptCount/uploadKeptBytes` 归 **W5**；`submitting` 归 **W9**；`showDescModal/showRubricModal/descDraft/rubricDraft` 归 **W6**；`prompt*` 归 **W4**；`fading` 归 **W2**。**跨 composable 共享一律靠参数注入同一对象引用**（`reactive({})`/`ref()`/普通对象是引用，传引用即共享，无拷贝）。**唯一风险点是“重复创建”**：若 W2 自己又 `ref('')` 造一个 `activePath`、而 W9 造了另一个，模板会绑到错的那个（**静默失效，不报错**）→ 由 §8.1-4 的硬约束 + C 的 bindings 对拍兜住。★**本文件独有的所有权陷阱**：`checkerLoadedOnce`@282 是 `let`（**非响应式**）→ 必须在 W4 内**单实例**，且**只能以 getter/setter 暴露**；若两处各声明一次，会静默分叉（§1.3-2）。另：**`computed` 的惰性求值语义不变**（依赖追踪由运行时按访问顺序建立，与声明位置无关）。 |
| **2** | **watch / watchEffect 注册顺序** | **等价（比 step 2 更干净）** | 全文**只有 2 个 `watch`**（实测 grep）：`watch(checkerOpen, …)`@372 → `stopCheckerPoll()`；`watch(activePath, …)`@518 → `fading=false; nextTick(()=>fading=true)`。**无 `watchEffect`**。两者**都是 setup 同步阶段的顶层注册**（**不在 `onMounted` 内、不在 `await` 之后** —— 与 `Submit.vue` 的 `:1179` 异步 watch **完全不同**）。① 搬进 W4/W2 后仍在 setup 同步阶段注册，**注册时刻与顺序均不变**（W2 在 W9 接线序中位置固定）。② **两个 watch 的源都是 ref 本身**（非函数、非 `deep`）→ 触发条件只与“值何时变”有关，与注册位置无关。③ **不存在“先注册者先执行”的隐含假设**：两个 watch 的源互不相交（`checkerOpen` vs `activePath`），且**没有同一个 tick 内同时变更的场景**（`checkerOpen` 只在 :336 与模板 3 处被写；`activePath` 只在 :498/:507 与 `switchTab` 内被写）。④ ★**唯一需要守的形式**：`watch(activePath)`@518-521 **必须与 `fading` 同文件**（W2），`watch(checkerOpen)`@372 **必须与 `stopCheckerPoll` 同文件**（W4）—— 否则会引入新的跨单元 import 边。 → **判定等价，无需实测**；登记为 C 的源码级复核项（bindings 之外的断言）。 |
| **3** | **onMounted / onBeforeUnmount / onActivated** | **等价；但有 1 处必须在搬移时保序（不是缺陷，是硬约束）** | ① **Vue 规则**：`onMounted/onBeforeUnmount` 必须在 setup **同步执行阶段**调用（含 setup 内同步调用的 composable）；在 `await` 之后或异步回调里调用**会失效并告警**。② 全文只有 **`onMounted`@741** 与 **`onBeforeUnmount`@748**；**无 `onUnmounted` / `onActivated` / `onDeactivated` / `keepAlive` / `getCurrentInstance` / `provide` / `inject`**（实测 grep）。③ ★★**本文件最微妙的一处：`useMonacoKeyboardA11y()` 自身在 `:128` 注册了 `onBeforeUnmount(disposeAll)`**。实测的注册顺序是：`P1` 的 `:231`（setup 同步阶段，**早于** `.vue` 的 `:748`）→ 所以 Vue 的 hook 队列是 **`[disposeAll(useMonacoKeyboardA11y), onBeforeUnmount@748 的回调体]`**。搬移后 W9 的调用序是 `W2(...) → … → W9 注册 @748 等价体`，**只要 W2 在 W9 内部被调用时 `:231` 这一句仍在该调用栈内同步执行**（本方案保证：**W2 是 W9 里第一个被调用的**），**hook 队列的相对顺序逐字不变**。④ ★`initMonaco`@463 是 `async`，其内部的 `:482 keyboardA11y = attachKeyboardA11y(editor, editorContainerRef.value, { readOnly: true })` **发生在 `await loader.init()`@471 之后** —— 但 `attach` **只把实例推进模块级集合、不注册任何 hook**（`useMonacoKeyboardA11y.js:97-121`），**唯一的 hook 注册在 `:128`（同步，setup 期）** → **无异步注册缺陷**。⑤ ★**`attach` 的 `boundary` 参数是 `editorContainerRef.value`**（:482）—— 它是模板 ref，**只有 `v-else`（已上传）分支渲染 `:183`**。搬移后 `editorContainerRef` 仍是 .vue 顶层的一个 `ref`（由 W9 创建、.vue 解构给模板），**同一对象引用** → `initMonaco` 里读到的仍是模板写入的 DOM。 |
| **4** | **Monaco 实例的持有与销毁** | **需特殊处理（三处强制保序 + 一处“只调一次”）** | ① **实例持有**：`monaco`@432 / `editor`@433 / `models`@434 / `keyboardA11y`@435 是 **4 个普通 `let`（非响应式）**，全部归 W2。**`models` 是普通对象（`:434 = {}`）而 `fileContents` 是 `Map`**（:375）—— 两者搬走后仍是**同一对象引用**（W2 返回、W9 转交、W3/W5/W8 注入）。② ★**`useMonacoTheme()` / `useMonacoKeyboardA11y()` 只能各调一次**：前者有**模块级 `lastMonaco` 单例**（`useMonacoTheme.js:126,141`）与**模块级 `watch(resolved)`@129**；后者有**模块级实例集合**（`:128 onBeforeUnmount(disposeAll)`）。**若 W2 调一次、W9 又调一次 → 两个 `disposeAll` hook、两倍 a11y 处理**。→ **铁律：这两个 `use` 只在 W2 内调用一次**。③ **挂载不变量（必须逐字保留）**：`initMonaco`@464 `if (monaco) return;` 是**唯一闸门**（“只挂载一次”）；`resetModels`@438-442 是**可重入的**（`editor.setModel(null)` + 逐 model `dispose()` + `models = {}`，`:440` 有 `try/catch` 吞异常）。④ ★**销毁路径的 4 步顺序（`onBeforeUnmount`@748-753，必须逐字保持）**：`keyboardA11y?.dispose()`@749 → `stopCheckerPoll()`@750 → `Object.values(models).forEach(m => m.dispose())`@751 → `editor?.dispose()`@752。**注意 :751 用的是 `models`（模型缓存），:752 dispose 的是 `editor`（编辑器）—— 不能合并、不能换序**（与 `resetModels`@438-442 的“先 `editor.setModel(null)` 再 dispose models”**不同**：resetModels 有 `setModel(null)`，onBeforeUnmount 没有）。⑤ **`monaco`/`editor`/`models` 在卸载时不做置空**（既有行为）→ **逐字保留，不得“顺手”加 `monaco = null`**。⑥ ★**在 composable 里注册 `onBeforeUnmount` 是否等价？等价**（同一组件实例的 hook 队列），但**本方案禁止**（§2.1(c)）：各 W 暴露 `disposeXxx()`，`.vue` **只注册一次** `onBeforeUnmount`，按 ④ 的 4 步顺序调用 —— 这样“清理顺序”是**显式可见**的，而不是依赖 composable 的调用次序。 |
| **5** | **上传组件回调（ProjectZipUploader）与学生提交答案** | **等价（需特殊处理：两处 300ms 与三处 `submitting` 置位必须逐字保留）** | ① **回调时机不变**：`ProjectZipUploader` 通过 `@ready="onZipReady"`(:155) / `@select="onZipSelect"`(:171) / `@error="(m)=>message.error(m)"`(:156) / `v-model:package="form.packageFile"`(:154) 与页面交互。**模板不动 ⟹ 监听器注册不变 ⟹ 回调时机不变**。搬移只是把 handler 的实现换成 W5 暴露的同名函数。② ★**两条 300ms 延迟路径必须逐字保留**：`onZipReady`@607 `await new Promise(r => setTimeout(r, 300))` 与 `handleSubmit`@668 `await new Promise(res => setTimeout(res, 300))`（★**形参名不同：`r` vs `res`** —— 搬移时**连形参名一起搬**，否则 C 的逐字节判等会失败且无法区分“改了语义”还是“改了形参名”）。这两处的语义是**等 `<Transition name="kind-pick-switch" mode="out-in">`(:148) 切换完再 `initMonaco()`**（因为 `editorContainerRef` 在 `v-else` 分支里，切换期间 DOM 尚未就位）。③ **loading 状态不变**：学生提交的 `submitting`@222 在 `handleSubmit` 里 **手动 `true`/`false`（不是 `finally`）**：`:647` 置 `true`、`:674` 成功置 `false`、`:677` catch 置 `false` —— **三处都要在**（漏掉 catch 分支 → 按钮永久 loading）。④ **错误分支逐字保留**：`teacherUpload`@626-629 `catch → form.tempId=''; message.error('上传失败：' + … + '（可重试上传；也可不上传，直接保存为开放性题目）')`；`handleSubmit`@675-678 `catch → message.error('提交失败：' + …)`；`onZipReady` 对 `isTeacher && form.packageFile` 的守卫@597。⑤ **调用顺序不变**（`onZipReady` 内 7 步）：`resetModels()`@587 → `fileContents.clear()` + 填充@588-589 → `externalTree`@591 → `uploadKept*`@593-594 → `hasUploaded=true`@595 → `await teacherUpload`@598 → ★`checkerStale` 判定@602 → `await nextTick()` + 300ms + `initMonaco` + `findFirstFile` + `openFile`@606-610。**@602 的判定必须在 `teacherUpload` 之后**（它读的是上传后的状态）—— 换序会改变 stale 语义。 |
| **6** | **动态 import 与路由参数** | **等价（1 处需特殊处理）** | ① **无动态 `import()`**：实测全文只有 `:469` 的 `import.meta.env.BASE_URL`（**不是** `import()`）—— 它是 `loader.config({ paths: { vs: … + 'monaco/vs' } })` 的一部分，**静态可分析、位置无关**，搬进 W2 等价。② 组件本身由路由的 `component: () => import('../views/teacher/ProjectQuestionEdit.vue')` 懒载入（router :29/:30/:53）—— **与本步无关**（不动路由）。③ `useRoute()` **只在 :220 调用一次**，`route` 被 **14 处**使用：`:221`(`isEdit`)、`:242`(prompt preview)、`:288`(ensureCheckerState)、`:305`(fetchChecker)、`:340`(handleGenerateChecker)、`:382`/`:383`(`assignmentId`/`questionId` computed)、`:568`(PUT)、`:655`(学生提交 URL)、`:687`(教师 GET)、`:696`(project-files GET)、`:713`(学生 GET)、`:743`/`:744`(onMounted 判定)。**`route.params.*` 全部在函数体/computed 体内按调用时刻读取**（**无一处提前解构成普通变量**）→ 搬进 composable 后仍在**同一 setup 上下文**调用 `useRoute()`（**由 W9 调一次并把 `route` 向下注入**），**响应式订阅与取值时刻不变**。④ ★**需特殊处理的一处**：`isEdit = computed(() => !!route.params.id)`@221 在**三处路由下的语义不同** —— `:29` `questions/new/project` 下 `route.params.id` 为 `undefined` → `isEdit=false`；`:30` `questions/:id/edit-project` → `true`；`:53` 学生路由 **既没有 `:id`**（参数名是 `assignmentId`/`questionId`）→ 学生模式下 `isEdit` **仍会求值**为 `false`。**当前行为**：模板里所有 `isEdit` 的用法（:3/:11/:38/:46/:47）**都被 `isTeacher` 前置守卫** → **学生态下 `isEdit` 的值不影响渲染**。**但搬移后必须保持求值式逐字不变**（`!!route.params.id`）—— **若 B“顺手”改成 `!!route.params.questionId` 或 `!!(route.params.id || route.params.questionId)`，即属改动可观测面且违反“只搬不改”**（模板字节判等与 bindings 对拍都抓不到）。⑤ **B 不得把 `route` 换成多处 `useRoute()` 调用**（会创建多个响应式代理；当前虽等价，但属改动可观测面）。 |

### 3.2 ★「不确定需实测」清单（交给 C，**共 5 条**）

| 编号 | 不确定点 | 为什么我判不了 | C 的最小探针 |
|---|---|---|---|
| **U1** | ★**双模式下 `isTeacher`/`isStudent` 的求值一致性** | 静态可证“定义式不变”，但**无法证明运行时模板拿到的布尔值与改前相同**（尤其 `props.mode` 默认值路径 vs `props:{mode:'student'}` 显式传入路径）；而**模板字节判等 + bindings 判等对此完全盲**（它们看不到值） | 改前/改后各跑两个路由：① `/exam/teacher/questions/new/project` → 断言 `.ant-input`（可编辑标题）存在、`text=新建实训题`、**保存按钮可见**、**提交答案按钮不存在**；② `/exam/student/assignments/:aid/project/:qid` → 断言 `text=提交答案` 存在、**保存按钮不存在**、标题是 `span` 而非 `input`。**改前改后两组断言必须逐条相同** |
| **U2** | ★**Monaco 挂载次数不变量** | `initMonaco`@464 的 `if (monaco) return` 是静态可证的闸门，但“**三条挂载路径**（onZipReady@608 / handleSubmit@669 / loadQuestion 的 :702/:731）在同一会话内是否仍只 create 一次”必须运行时计数 | 探针：`monaco.editor.getModels().length`（或 `/tmp` 里给 loader 包一层计数，**不改仓库**）；断言 ① 教师编辑页加载已有题（`loadQuestion`→@702）→ 计数 = 1；② 再上传一次压缩包（`onZipReady`→@608）→ 计数**仍 = 1**，且旧 path 的 model 已被 dispose |
| **U3** | ★**卸载期清理完整性（含 `useMonacoKeyboardA11y` 的双重释放）** | `onBeforeUnmount` 4 步 + `useMonacoKeyboardA11y.js:128` 的自注册 hook = **两个 hook 都跑**；静态不可判“是否真的没有残留监听/模型”、以及“重复 `dispose()` 是否产生告警” | 探针：卸载前 monkey-patch `setInterval/clearInterval/addEventListener/removeEventListener` 计数；路由离开后断言：① **存活 interval = 0**（本文件**只有 `checkerTimer` 一个计时器**，实测）；② `monaco.editor.getModels().length === 0`；③ **控制台零错误**（特别是 `model disposed` / `Cannot read properties of null`） |
| **U4** | **两条 300ms 延迟后的 `initMonaco` 是否仍拿到已挂载的 DOM** | `editorContainerRef` 在 `v-else` 分支（:183），由 `<Transition mode="out-in">`(:148) 控制；300ms 是**经验值**。静态可证“延迟与取值顺序不变”，但**无法证明 `editorContainerRef.value` 在搬移后仍非 null**（若接线让 `ref` 与模板的绑定时刻错位，会静默吞掉整个 Monaco 挂载） | 上传一个压缩包（走 `onZipReady`@608）后断言：`.editor-container .monaco-editor` **存在**、`.editor-empty` 消失、**左侧文件树第一项已被选中**（`openFile`@610 生效）。学生路径同理（`handleSubmit`@669） |
| **U5** | ★**保存守卫的 5 条分支** | `handleSave`@527-562 有 4 条 `return` 分支（stale@530、generating/calibrating@535、review@539、`st!=='ready'`@544）+ 1 条 inputs-snapshot 分支@550-562，另有 `ready` 正常路径。**这些分支需要构造特定的后端状态**；静态可证“分支文本未改”，**不可证“改后仍能命中”** | 装置：自建 `/tmp` 夹具服务，按 `GET /api/teacher/questions/:id/checker` 的 `status` 分别返回 `stale/generating/review/none/ready` → 断言：① 4 条警告分支各弹**对应文案**的 `.ant-message-warning`；② ★`stale`/`review`/`none` 三条**必须仍调用 `openCheckerModal()`**（逃生通道，见 §6）→ 断言 `.ant-modal-content` 出现「自动评分器」标题；③ `generating` 分支**不打开**弹窗；④ `ready` 时发出 `PUT /api/teacher/questions/:id` |

> **判定说明**：U1–U5 属「静态阅读无法排除」的类，**不是“我猜有问题”**。**U1 是本文件独有的、由“双模式”直接产生的必测项**（step 2 的 Submit.vue 是单模式，没有对应项）。**U3 描述的“双重释放”在改前就存在** —— C 的职责是**证明它“照旧存在且没有被放大”**，不是修它。

---

## 4 ★护航配方（client 现实 + 可执行交互验证）

### 4.1 事实核查（本轮实测，**不采信历史报告**）

| 问题 | 实测结论 | 证据 |
|---|---|---|
| client 侧有多少单测？ | **0**（与 step 2 一致）。`find client/src -name '*.test.*' -o -name '*.spec.*'` **无输出**；`git ls-files client \| grep -Ei 'test\|spec\|vitest\|jest\|e2e\|playwright'` **无输出**（exit 1） | `client/package.json` 的 scripts 只有 `dev/build/preview`，**无 vitest / jest / test 脚本** |
| 浏览器驱动装置可用吗？ | **有**：`client/node_modules/@playwright/test@1.60.0` 就位（与 step 2 相同） | `node -e "require('./client/node_modules/@playwright/test/package.json').version"` |
| **L1 编译器可用吗？** | **有**：`@vue/compiler-sfc@3.5.34`（= `vue@3.5.34`） | `node -e "require('./client/node_modules/@vue/compiler-sfc/package.json').version"` |
| **既有 E2E 覆盖本文件吗？** | ★**零覆盖**。`grep -rn 'new/project\|edit-project\|StudentProjectQuestion\|TeacherQuestionProject' tests/ui-redesign-verify/specs/` → **0 命中**（命中全在 `artifacts/`、`client/dist/` 与 `b2-contrast/`）。6 个 spec 的 `page.goto` 只走 `/teacher/{assignments,review,classes,questions}` 与 `/student/{assignments,scores}` | 逐条 grep 了 `specs/*.spec.mjs` 的 `page.goto` |
| 既有套件**最接近**的覆盖 | `b2-contrast/probe.mjs:154,237`（**T4-F2 对比度探针**）**确实导航到** `/teacher/questions/new/project` 的两种主题 —— 但它是**对比度探针**（只量颜色），且 `:28` **硬依赖 `/tmp/t5-tools/node_modules/axe-core/axe.min.js`**（该目录已被清理，实测三处 `find` 均无 `axe-core`），默认 `--base=http://localhost:5173`（**本仓硬禁令端口**）且需真实登录/DB | `sed -n '1,40p' tests/ui-redesign-verify/b2-contrast/probe.mjs`；三处 `ls -d */axe-core` 均无 |
| axe 可用吗？ | ❌ **仍不可用**（与 step 2 相同）。`client/node_modules`、根 `node_modules`、`tests/ui-redesign-verify/node_modules` **三处均无 `axe-core`**；`/tmp/t5-tools` 已清理。禁止联网 ⟹ **本轮无法恢复** | 三处 `ls -d` 均 "No such file or directory" |
| 端口 / 服务现状 | `:3000 :3100 :3110 :3111 :5173` **全部无监听**（`lsof` 全表已核）；`:19387` 是本次 DSH GUI 自身 | `lsof -nP -iTCP -sTCP:LISTEN` |

### 4.2 ★两道装置闸门（与 step 2 不同：本次**都不阻塞本步**）

| # | 闸门 | 实测事实 | 本步是否阻塞 |
|---|---|---|---|
| **G-A** | **E2E rig 指向另一棵树** | `tests/ui-redesign-verify/rig.sh:9` `UIWT="…/Exam-DeepSeek-ui"`，`:10` `CLIENT_DIR="${CLIENT_DIR:-$UIWT/client}"` → **默认驱动另一个 worktree**；而 `scripts/gates/pixel-diff.mjs` 用主仓库活树 | ❌ **不阻塞**：`status.md:14` 已裁决「**G-A 显式指主仓库 client + 留痕被验树**」→ 本步 L2 若用 rig，必须 `CLIENT_DIR="<主仓库>/client" ./rig.sh …` 并记录**被测树绝对路径 + HEAD + dist 指纹**（DoD §5-★） |
| **G-B** | **像素门禁的夹具缺口** | `pixel-diff.mjs:114-118` 的 `FIXTURES` **只有 3 条 teacher 端点**（`/api/teacher/pending-summary`、`/api/teacher/classes`、`/api/teacher/teams`），`FIXTURE_USER.role='teacher'`（:106）；**没有任何本文件要打的端点**：`GET/PUT /api/teacher/questions/:id`、`GET …/project-files`、`GET/POST …/checker`、`GET …/project-prompt-preview`、`POST /api/student/assignments/:aid/project/:qid/submit`、`GET /api/student/assignments/:aid/project/:qid`。未命中夹具的 `/api/**` **一律 500 并记录 → exit 2**（:337-342） | ❌ **本步不阻塞**：`status.md:14` 已裁决「**G-B step2 属 A 档不需像素门禁（B 档前再扩夹具）**」。**本步同属 A 档** ⟹ **不需要像素门禁，也就不需要补夹具**。⚠️ 但若 B 判定“必须动模板”（升 B 档），**G-B 立刻变成阻塞项**（见 §4.4） |

### 4.3 三层配方（成本逐层标注）

#### **L0 · 模板 + **两个**样式切片字节判等（成本 ≈ 10 分钟，零依赖，★最强判据）**

★**与 step 2 的差异：本文件有 2 个 `<style>` 块，必须切 3 段。**

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
ANCHOR=e37d27c                        # C 执行前必须重新 git rev-parse HEAD
F=client/src/views/teacher/ProjectQuestionEdit.vue
rm -rf /tmp/c5a && mkdir -p /tmp/c5a/before
git archive "$ANCHOR" "$F" | tar -x -C /tmp/c5a/before
B=/tmp/c5a/before/$F
# —— 改前切片（3 段）——
awk 'NR>=1  &&NR<=194' "$B" > /tmp/c5a/b.template      # <template> … </template>
awk 'NR>=756&&NR<=857' "$B" > /tmp/c5a/b.style-scoped  # <style scoped>
awk 'NR>=859&&NR<=868' "$B" > /tmp/c5a/b.style-global  # <style>（非 scoped）
# —— 改后切片 ——
awk 'NR>=1  &&NR<=194' "$F" > /tmp/c5a/a.template
awk 'NR>=756&&NR<=857' "$F" > /tmp/c5a/a.style-scoped
awk 'NR>=859&&NR<=868' "$F" > /tmp/c5a/a.style-global
cmp /tmp/c5a/b.template     /tmp/c5a/a.template     && \
cmp /tmp/c5a/b.style-scoped /tmp/c5a/a.style-scoped && \
cmp /tmp/c5a/b.style-global /tmp/c5a/a.style-global && echo TEMPLATE_STYLE_BYTE_IDENTICAL
```

⚠️ **三处必须写进 C 的判据**：
1. **`</template>` 在 :194，不是 :40** —— 用 :40 会只比 40 行就“通过”。
2. **`<style>` 有两个** —— 漏掉 :859-868 等于放行 `.desc-modal .ProseMirror` / `@keyframes prFadeIn` 的改写。
3. **不要用 `git diff` 判“模板是否被动过”**：script 被替换后 diff 是“整段重写”，人眼不可判 → **必须切片比字节**。

**L0 补充（覆盖“函数体是否被改写”）**：按 §2.2 的行号区间从改前文件切块 → 从改后 composable 切**同名块** → 逐块 `shasum -a 256` 对拍。期望：**28 个函数块 + 52 个声明块 = 80 块全等**（允许差异白名单：banner / import / `export` / 缩进 / W2 里 `ensureTheme`/`attachKeyboardA11y` 的 acquire 行）。

**L0 结算（类名闭合）**：提取模板 `class` 字面量 ∪ script 里 `difficultyTagClass`@423 / `studentStatusType`@398 的返回键 → 与两个 `<style>` 块的选择器求差；**改前改后差集必须相同**。

#### **L1 · bindings + 模板编译 + styles 三重对拍（成本 ≈ 20–40 分钟，★本步最锋利的机器判据）**

原理：`<script setup>` 的内容**不进入**渲染函数文本；模板编译产物只依赖「模板 + 编译器版本 + scoped id」。因此**模板零改动 ⟹ 模板编译产物逐字节相同**（scoped id = hash(相对路径 + 内容)，本仓不动路径、不动 style 块）。

★**本文件的 L1 特殊性（必须加三条断言）**：
- **A. `bindings` 类型必须逐名相同**：44 名里 `checkerOpen/checkerStatus/form/…` 是 `setup-ref`/`setup-maybe-ref`。**若某名从 `setup-ref` 退化成 `setup-const` → 模板里丢 ref 自动解包**（`:104 :keyboard="checkerCanClose"` 会传一个 `ComputedRef` 对象 → `keyboard=[object Object]` → **静默失效**）。这是从 composable 解构最容易踩的坑。
- **B. `props` 必须仍是 `props`**：`mode` 是**声明式 prop**（`defineProps`@215），模板里的 `isTeacher` 依赖它。**`defineProps` 只能留在 `.vue`**（`<script setup>` 宏，不可搬进 composable）→ 断言 `bindings.props` 存在。
- **C. `descriptor.styles` 数组必须相等**：它同时证明**内容**与**`scoped` 标志**（= 没人把 :859 的 `<style>` 改成 `<style scoped>`）。

```bash
mkdir -p /tmp/c5a/render && cd "/Users/you/My Projects/My Vue/Exam-DeepSeek/client"
node -e '
const fs=require("fs"),crypto=require("crypto");
const {parse,compileScript,compileTemplate}=require("@vue/compiler-sfc");
for (const [tag,file] of [["before","/tmp/c5a/before/client/src/views/teacher/ProjectQuestionEdit.vue"],
                          ["after", "src/views/teacher/ProjectQuestionEdit.vue"]]) {
  const src=fs.readFileSync(file,"utf8");
  const {descriptor}=parse(src,{filename:"ProjectQuestionEdit.vue"});
  const id=crypto.createHash("sha256").update(src).digest("hex").slice(0,8);
  const s=compileScript(descriptor,{id});
  const t=compileTemplate({source:descriptor.template.content,filename:"ProjectQuestionEdit.vue",id,scoped:true});
  fs.writeFileSync("/tmp/c5a/render/"+tag+".bindings.json",JSON.stringify(s.bindings,null,2));
  fs.writeFileSync("/tmp/c5a/render/"+tag+".tpl.js",t.code);
  fs.writeFileSync("/tmp/c5a/render/"+tag+".styles.json",JSON.stringify(descriptor.styles.map(x=>({scoped:x.scoped,content:x.content})),null,2));
}
'
diff /tmp/c5a/render/before.bindings.json /tmp/c5a/render/after.bindings.json && echo BINDINGS_EQUAL
diff /tmp/c5a/render/before.tpl.js       /tmp/c5a/render/after.tpl.js       && echo TEMPLATE_COMPILE_EQUAL
diff /tmp/c5a/render/before.styles.json  /tmp/c5a/render/after.styles.json  && echo STYLES_ARRAY_EQUAL
```

判据（**三条**）：
- **① `bindings` 键集合 + 值（类型）相等** —— 直接证明 §1.4 的 **44 个名字一个都没丢、一个都没退化**。
- **② 模板块 `compileTemplate` 输出逐字节相等** —— 与 script 完全无关，是“模板零改动”的第二重机器证明。
- **③ `descriptor.styles` 数组相等** —— 证明两个样式块的**内容与 `scoped` 标志**都没变。
- ⚠️ **不要对拍整个 `compileScript().content`**：script 换了，整份输出必然不同。只对拍 `bindings` + 模板编译产物 + `styles`。

#### **L2 · 交互行为 Playwright 套件**

**装置选择（按优先级）**：

1. **首选：真后端 rig**（`rig.sh` + `playwright.rig.config.mjs`，baseURL `:3100`）—— **唯一能测真实 PUT/GET 与真实 checker 状态的装置**。**前提**：`CLIENT_DIR="<主仓库>/client"`（G-A）+ MySQL 可用 + 私有 dist（`--outDir` 到仓库外）+ 用后 `./rig.sh stop`。
2. **次选：静态夹具 + playwright（无后端）** —— **C 自建在 `/tmp` 的夹具 HTTP 服务**（≈12 个端点）。**好处**：能精确控制 `GET …/checker` 的返回（把 U5 的 5 种 status 全打出来）、**不改仓库、不碰 G-B**。**代价**：C 要多写一个夹具服务（≈40 分钟）。
3. **不选**：任何改动 `tests/` 的方案（constraints §1）；`b2-contrast/probe.mjs`（依赖已清理的 axe + 硬编码 `:5173`）。

**用例清单（新增 7 条 + 复用 0 条 —— ★本文件既有 E2E 覆盖为零）**：

| id | 场景 | 关键断言（**改前必须同样通过**） | 装置 | 估价 |
|---|---|---|---|---|
| **N1** | ★**双模式渲染一致性**（U1） | ① `/teacher/questions/new/project`：`input` 可编辑标题存在、`text=新建实训题`、保存按钮 `count=1`、**提交答案按钮 `count=0`**、**「自动评分器」`count=0`**（`FEATURE_CHECKER_ENTRY=false`）；② `/teacher/questions/1/edit-project`：标题 `text=编辑实训题`、**「自动评分器」仍 `count=0`**；③ `/student/assignments/1/project/2`：`text=提交答案` 存在、保存按钮 `count=0`、标题是 `span` 而非 `input`、`BETA` 标签仍在 | 静态夹具 | ≈35 min |
| **N2** | ★**保存守卫 5 条分支**（U5） | 按 `/checker` 返回 `status` 分别断言：`generating`→`text=自动评分器生成中，请稍候再保存` **且不打开弹窗**；`review`→`text=…未确认启用…` **且弹窗打开**；`none`→`text=请先生成自动评分器（当前状态：none）` **且弹窗打开**；`checkerStale`（上传过包）→`text=标准工程包已更换…` **且弹窗打开**；`ready`→发出 **`PUT /api/teacher/questions/1`** 且 body `{title,difficulty,maxScore,type:'project',material,scoringRubric}` 逐字节正确 | 静态夹具（C 自建 /tmp 服务） | ≈50 min |
| **N3** | ★**「自动评分器」入口开关语义** | 断言 `FEATURE_CHECKER_ENTRY=false` 下：① `.checker-btn-wrap` **不存在**；② 但 **N2 的 `openCheckerModal` 逃生通道仍工作**（弹窗出现）→ 两条必须**同时**成立（**只测“按钮不见了”是不够的**） | 静态夹具 | ≈15 min（N2 已含一半） |
| **N4** | **Monaco 挂载次数不变量**（U2） | 教师编辑页加载已有题 → `.monaco-editor` 存在；再上传一次包 → `monaco.editor.getModels().length` 不增（旧 model 已 dispose）；tab 切换/关闭后不增 | 静态夹具 + `page.evaluate` | ≈35 min |
| **N5** | **卸载清理 + 双重释放**（U3） | 卸载前 patch `setInterval/clearInterval/addEventListener/removeEventListener` 计数 → 路由离开后：存活 interval = 0、`monaco.editor.getModels().length === 0`、**控制台零 error** | 静态夹具 | ≈30 min |
| **N6** | **学生提交路径** | 上传 → `POST /api/student/assignments/1/project/2/submit`（multipart）→ `.ant-message-success`、`.student-score-card` 出现「已提交，待评分」、分数**不可见**（`canStudentSeeScoreNow=false`）；再让后端返回 `status='reviewed'` → 分数可见 | 静态夹具 | ≈30 min |
| **N7** | **上传回调与两条 300ms 路径**（U4） | `@ready` 后：`.editor-empty` 消失、`.monaco-editor` 出现、左侧树第一项选中；教师态额外断言上传接口发出且 `form.tempId` 被写入（下次保存 body 含 `tempId`） | 静态夹具 | ≈30 min |

**成本合计（诚实估算）**：

- **一次性装置准备**：`/tmp` 自建夹具服务（≈12 个端点 + `isTeacher` 用户）+ 私有 `vite build --outDir /tmp/...`（**不碰 `client/dist`**）+ 首次跑通登录/主题 → **≈70–100 分钟**（含踩坑）。
- **写用例**：N1+N2+N3+N4+N5+N6+N7 ≈ **225 分钟**（约 3.5–4 小时）。
- **每次执行**：静态夹具模式 **≈90–120 秒/条**；7 条 ≈ **10–14 分钟/轮**，**改前/改后各一遍 → ≈20–30 分钟**。
- **L0 + L1 静态判等**：**≈30 分钟**（一次性，脚本可复用；每批次复跑 **≈3 分钟**）。
- **总计**：**首次落地 ≈ 6–8 小时**；之后每个 client 拆分步复跑 **≈25–35 分钟**。
- **裁剪建议（若时间盒紧）**：**N1 + N2 + N3 必做**（双模式 + 保存守卫 + 开关语义 = 本文件三个独有风险面，≈100 分钟）；N4/N5/N6/N7 强烈建议但可延后到 B4 统一跑。

### 4.4 ★像素门禁在本步的地位（**必须写进 C 的验证边界**）

★**本步属 A 档（只抽 script），像素门禁不需要、也不应作为判据。**

依据：`docs/plan/2026-10-11-godfile-split-plan.md` §5 DoD 第 5 条的**已改判**口径（`status.md:14` 已裁决）：

> **A 档：只抽 script 的步**（模板与样式逐字节不动）→ **不需要像素门禁** —— 模板+样式**逐字节相等**在逻辑上**严格强于**像素相等（字节相同 ⇒ DOM/CSS 相同 ⇒ 渲染相同）；此时**像素相等是“必然”而非“证据”**。

**本方案判定：ProjectQuestionEdit.vue 属 A 档，全程不需要像素门禁。** 理由（三条，本文件具体）：

1. §2.2 的 9 个目标文件**全部只接收/返回 JS 值与对象引用**，**没有一处触及 `<template>` 或 `<style>`**。
2. §1.4 的 44 个模板可见名**全部通过“顶层解构”还原**，模板表达式一个字符不改 → 模板编译产物必然逐字节相同（L1-② 机器证明）。
3. 本文件**没有** `Doc.vue` 那种“必须拆子组件”的场景（plan §2-#5 的 C5 是唯一 B 档），也没有需要改 `v-if` 结构的地方。

⚠️ **升级条件（必须明说）**：**若 B 在执行中发现“不得不动 `<template>` 或任一 `<style>` 块”（哪怕只加一个注释、只改一个 `v-if` 条件），本步立即从 A 档升级为 B 档**，此时：

- **必须**跑 `scripts/gates/pixel-diff.mjs`，**且区域表必须先覆盖本文件所在路由**（默认 6 区域全走 `/exam/teacher/classes`，对本文件**近乎盲区**）；
- **必须**由 Captain 先解决 **G-B**（`FIXTURES` 目前只有 3 条 teacher 端点，**没有任何本文件要打的端点**；学生路由还需 `FIXTURE_USER.role='student'`）—— **C 是只读角色，补夹具不是 C 的活**；
- **必须**先调区域表再比 —— 否则选择器消失时门禁给 **exit 2（硬失败）**，**不得当成 PASS**；
- **建议**同时把 `page.accessibility.snapshot()` 逐节点对拍降级为“允许差异并逐条解释”（因为 DOM 真的变了）。

**C 的验证边界（写进 `ProjectQuestionEdit.vue-verify.md`）**：

- ❌ 像素门禁 **不构成本步的任何判据**（A 档；跑了也只是“必然相等”的复述，且**当前必然 exit 2**，因为夹具表无本文件端点）
- ✅ 交互行为正确性的证据**只能**来自 **L0（3 段字节切片 + 80 块 sha256）+ L1（bindings/模板编译/styles 三重对拍）+ L2（N1–N7）**
- ❌ **axe 本轮不可用**（§4.1 实测）：DoD 的「axe 不引入新违规」**无法执行**。**替代口径（A 建议）**：`page.accessibility.snapshot()` 逐节点对拍 —— 模板零改动下 a11y 树**应当逐节点相等**，**比 axe 更强**（axe 只报违规，不报“可访问名称变了”）。若 Captain 未拍板口径 → **显式登记“axe 未执行”并接受盲区**。

---

## 5 风险分级（每个搬移单元）

维度权重：**响应式耦合 / 生命周期 / 测试覆盖 / 交互复杂度**。★本表新增第五维：**双模式影响面**。

| # | 单元 | 等级 | 理由 |
|---|---|---|---|
| R1 | **W1 `zipEntry.js`**（3 声明） | **低** | 响应式耦合 **0**（`TextDecoder` 两个常量 + 一个纯递归函数 `findFirstFile`，只读入参）；生命周期 **0**；测试覆盖 **0**，但**纯函数可被 L0 逐字节判等完全覆盖**；交互复杂度 低；双模式 **0**。**唯一注意**：`findFirstFile`@632 被 **4 处**调用（:609/:670/:703/:732），**两种模式都用** → 必须真实导出且被真 import 一次（constraints §3-12：`node --check` **不放行**缺失导出的坏绑定）。 |
| R2 | **W2 `useEditorWorkspace.js`**（12 声明 + 2 注入） | ★**高（本步第二硬失败点）** | 响应式耦合 **中高**（4 个模板可见 ref/Map + 1 ref `fading` + 1 个 watch）；生命周期 ★**高**（持有 `monaco/editor/models/keyboardA11y` 4 个非响应式实例，**卸载清理 4 步里有 3 步在此**）；测试覆盖 **0**（U2/U3/U4 无现成用例）；交互复杂度 **高**（挂载闸门 + 3 条挂载路径 + model 缓存 + `<Transition>` 300ms 时序）；双模式 **高（两种模式都进）**。★**风险集中在两处**：① `useMonacoTheme()`/`useMonacoKeyboardA11y()` 的**单次调用**（模块级单例 + 自注册 hook，重复调用 = 双份 a11y/双 hook）；② `onBeforeUnmount` 4 步顺序（`:749→:750→:751→:752`）**不能换序、不能合并**。 |
| R3 | **W3 `useStudentSubmission.js`**（8 声明） | **中（学生专属 = 低频路径，无回归网）** | 响应式耦合 中（1 ref + 5 computed/func，读 `form`）；生命周期 低；测试覆盖 **0**（★**既有 E2E 对本文件零覆盖**，学生路由更是从未被测）；交互复杂度 中（multipart + 双 try/catch + 手动 `submitting` 三处置位）；双模式 **仅 S**。**风险点**：`submitting` 的 `:647/:674/:677` **三处置位**若漏一处 → 按钮永久 loading（**用户可感知但静态判等看不出**）。 |
| R4 | **W4 `useChecker.js`**（27 声明 / ≈180 行） | ★**高（本步最大单元 + 独有语义）** | 响应式耦合 **高**（9 个响应式 + 1 个非响应式 `let` + 4 个 computed + 1 watch）；生命周期 中（`setInterval` 轮询 + `stopCheckerPoll` 幂等）；测试覆盖 **0**（U5 的 5 条分支全无覆盖）；交互复杂度 **高**（轮询 / 状态机 / 4 条守卫分支的逃生通道）；双模式 **教师专属**。★**风险集中在 `checkerLoadedOnce`@282 的单实例语义**（§1.3-2）+ **`FEATURE_CHECKER_ENTRY`@270 的开关语义**（§6）。**注**：计划书 §2-#10 估 `useChecker ~180 行` —— 本轮实测该段 **:266–372 = 107 行**（+ 提示词预览 7 行 = 114 行代码），加 banner/import/JSDoc/导出 ≈180 行，**估算准确**。 |
| R5 | **W5 `useZipUpload.js`**（6 声明） | **中高** | 响应式耦合 中（写 5 个状态 + 读写 `form`）；生命周期 低；测试覆盖 **0**；交互复杂度 **高**（`@ready/@select` 两个回调 + 教师/学生分支 + 300ms + `checkerStale` 判定时序）；双模式 **两者都进但分支不同**。★**风险点**：`:602` 的 `checkerStale` 判定**必须在 `await teacherUpload` 之后**，且**只能通过注入的 getter 读 `checkerLoadedOnce`**（不得 import W4 → 会成环）。 |
| R6 | **W6 `useQuestionForm.js`**（12 声明） | **中** | 响应式耦合 **高**（`form` 是**唯一被模板绑定 10 处**的对象：:11/:15/:25/:154 `v-model` + :12/:20/:21/:26/:69/:132 读）；生命周期 **0**；测试覆盖 **0**；交互复杂度 低（4 个 1 行 handler + 2 个 computed）；双模式 **两者都进**。**风险点**：`form` 的**所有权唯一**（P3/P7/P9/P10/P11/P12 都要读写它）→ **必须由 W6 创建一次**，其余单元以参数接收。 |
| R7 | **W7 `useSaveQuestion.js`**（1 声明 / 58 行） | **中高** | 响应式耦合 中（读 6 个 `form.*` + 5 个 checker 状态）；生命周期 低；测试覆盖 **0**；交互复杂度 **高**（**4 条守卫 return + 1 条 inputs-snapshot 分支 + PUT/POST 分流 + 路由跳转**）；双模式 **教师专属**。★**这是“产品语义”最密的一段**（每一条 `message.warning` 文案都是一条业务规则）。 |
| R8 | **W8 `useLoadQuestion.js`**（1 声明 / 57 行） | **中高** | 响应式耦合 **高**（单函数写 ≈13 个状态位）；生命周期 低；测试覆盖 **0**；交互复杂度 **高**（**两种模式两条完全不同的分支**，且教师分支 :708 `await ensureCheckerState()` 后 `return`）；双模式 ★**两类入口**。**判中高而非高**：它是“被接线根调用”的一端、改动面清晰；但**任何一行顺序错位都会同时破坏两种模式的加载**。 |
| R9 | **W9 `useProjectQuestionPage.js` + .vue 接线** | ★**高（唯一硬失败点）** | ① ★**44 个模板名字必须一个不漏地出现在 .vue 顶层解构里** —— 少一个 → 渲染期报 `Property "x" was accessed during render but is not defined`（**响亮**），或少见地静默 `undefined`；② ★**类型不能退化**（`setup-ref` → `setup-const` 会让 `checkerCanClose` 传对象给 `:keyboard` → **静默失效**，见 §4.3-L1-A）；③ `onMounted/onBeforeUnmount` **只能在这里注册一次**，且清理 4 步顺序不能变；④ ★**`useMonacoKeyboardA11y()` 的 `onBeforeUnmount`（`useMonacoKeyboardA11y.js:128`）与 .vue 的 `onBeforeUnmount` 的相对顺序**取决于 `W2` 在 W9 中的调用位置 → **W2 必须是被调用的第一个**（保持 `:231` 早于 `:748` 的原始关系）；⑤ 它是唯一 import 全部 W1–W8 的模块，**任何参数注入写错都在这里暴露**。**建议：B 完成后立刻做一次 L1 的 `bindings` 对拍（一条命令即可确认 44 个名字全在、类型全对）**。 |
| R10 | **删除 .vue 的 script 内联实现** | **高** | 一步同时影响：模板 44 个名字、14 个事件处理器、`defineProps`、`useRouter/useRoute`、`message`、`DOMPurify`、`loader`/`applyMonacoCompat`、`useMonacoTheme/useMonacoKeyboardA11y`、`uploadPackage`、`getLanguage`、`formatDateTimeSec` 与 4 个组件 import。**回滚粒度必须 = 单提交**，且**必须最后做**（§8.3 顺序）。 |
| R11 | **GodFile 6 → 5 / 观察带 16 → 16** | **低（但需更新基线）** | `arch-metrics.mjs:25` 的 `godfileOver800: 6` 须在提交后刷为 **5**（`status.md` 写 7，滞后，以代码为准）。**观察带不变**（本步新增 9 文件全 <500；`ProjectQuestionEdit.vue` 868 → ≈300 后同时离开 800 带且不进 500 带）—— **比 step 2 干净，不产生“观察带上升”的口径争议**。 |

**顺序建议（给 B）**：W1 → W2 → W6 → W3 → W4 → W5 → W7 → W8 → **W9 + 接线**（先只加不删，跑一次 L1 `bindings` 对拍）→ **最后**删除 .vue 里的内联实现。

---

## 6 ★开关常量与保存守卫的保留要求（**本文件独有，违反即回流**）

### 6.1 `FEATURE_CHECKER_ENTRY` 的精确语义（实测）

```js
// :266  // ===== 自动评分器（checker）=====
// :267  /** 功能开关：自动评分器**入口按钮**。2026-10-11 按用户要求【暂时取消】→ false = 隐藏手动入口。
// :268   *  ⚠️ 注意：保存守卫在「评分器缺失/过期/未确认」时仍会调用 openCheckerModal() 作为逃生通道，本次未改动
// :269   *  （否则教师将无法保存这类实训题）。恢复：改回 true 即恢复按钮。 */
// :270  const FEATURE_CHECKER_ENTRY = false;
```

| 要求 | 内容 | 为什么 |
|---|---|---|
| **K1** | **常量名、值（`false`）、类型（普通 `const`，**不是** `ref`）、以及 :267-269 的三行 JSDoc 必须逐字搬进 W4** | 名字被模板 :38 直接引用 → 必须出现在 .vue 的顶层解构里；**改成 `ref(false)` 会让模板 `:38` 的 `&&` 判真（ref 对象恒真）→ 按钮会重新出现** = 违反用户要求 |
> ⚠️ **勘误（Captain 添加，依据 ProjectQuestionEdit.vue-verify.md 的独立变异实验）**：上表 K1 的**论证部分被证伪** —— 实测模板走 `$setup`（`proxyRefs`）会**自动解包 ref**，故 `ref(false)` 在模板 `:38` 的 `&&` 里**仍为假**，按钮**不会**重新出现（C 的 M4 变异实验直接观测到）。
> **要求本身保留**（常量仍应为普通 `const`）—— 但理由应改述为：① 与模板取值语义保持一致、不依赖「ref 自动解包」这一隐式行为；② 常量语义上就是不可变配置，不是响应式状态。**不要再引用「恒真 → 按钮重现」这条错误论证。**
| **K2** | **不得“顺手”恢复按钮**（不得改成 `true`、不得删掉 `:38` 的 `FEATURE_CHECKER_ENTRY` 条件、不得用 `v-if` 以外的写法绕过） | 2026-10-11 按用户要求【暂时取消】；恢复方式已写明（改回 `true`），**不是本步的权限** |
| **K3** | **不得把常量搬丢**（例如“既然不用了就删掉”） | ① 模板 :38 引用它 → 删掉会 `undefined`（`&&` 短路后按钮仍不显示，**表现为“正常”** → **静默**，只有 L1 `bindings` 才能发现）；② 它是**唯一的恢复锚点**（“恢复：改回 true”） |
| **K4** | **`openCheckerModal`@334 的逃生通道必须保持可达** | 见 6.2 |
| **K5** | 相关但**不得顺手清理**的死代码：`handleGenerateChecker`@339 · `copyScript`@362 · `checkerLogs`@302 · `checkerLoading`@273 | 本轮实测：**`copyScript` 全文仅 1 处命中（:362 定义，0 调用）**；**`checkerLogs` 仅 1 处（:302 定义）**；**`handleGenerateChecker` 仅 1 处（:339 定义）**；**`checkerLoading` 3 处全部是“写”（:273 声明 / :342 `=true` / :358 `=false`），无一处“读”**。→ 四者皆**不可达死代码**（成因：`:334` 的 `openCheckerModal` 已不含生成逻辑，状态移交 `CheckerWizard`）。`plan §6` 明令**禁止在同一提交里顺手修** → **逐字保留，登记为后续独立项**。 |

### 6.2 保存守卫的逃生通道（实测 4 条守卫分支）

`handleSave`@523 **在 `isEdit.value === true` 时**（:527）有 **4 条 `return` 分支**，其中 **3 处调用 `openCheckerModal()`**：

| 行 | 条件 | `message` 文案 | 逃生动作 |
|---|---|---|---|
| :530-533 | `checkerStale.value` | `'标准工程包已更换，请重新生成自动评分器'` | `openCheckerModal(); return;` |
| :535-537 | `st === 'generating' \|\| st === 'calibrating'` | `'自动评分器生成中，请稍候再保存'` | **无逃生动作**（只 `return`） |
| :539-542 | `st === 'review'` | `'自动评分器已生成但未确认启用，请打开自动评分器完成确认'` | `openCheckerModal(); return;` |
| :544-547 | `st !== 'ready'`（含 `'none'`） | `'请先生成自动评分器（当前状态：' + st + '）'` | `openCheckerModal(); return;` |

**要求（K4 展开）**：

- **K4-1**：`openCheckerModal`@334-337 的实现**逐字不变**（`checkerOpen.value = true`）。**它当前只做这一件事**（注释 :335「§十一 改造：状态与轮询移交 CheckerWizard 管理（含 mock 流程）」）—— **不得“顺手”补上生成逻辑**。
- **K4-2**：**4 条分支的文案、条件顺序、`return` 位置全部逐字保留**。**顺序敏感**：`generating/calibrating`（:535）必须在 `review`（:539）之前、`review` 必须在 `!== 'ready'`（:544）之前 —— 调换会让某个状态命中错误的文案（**文案是用户可见契约**）。
- **K4-3**：`:528` `if (!checkerLoadedOnce) await ensureCheckerState();` 是**惰性补拉**（新建页不拉、已拉过不重拉）→ `checkerLoadedOnce` 的单实例语义（§1.3-2）是这条通道的前置条件。
- **K4-4**：`:550-562` 的 inputs-snapshot 比对（`stripHtml` 去标签 + `&nbsp;` 归一 + `rubric/maxScore/description` 三键）**逐字保留** —— 它的 `stripHtml` 是**函数级局部定义**（`:552`），**不得提到模块级**（会改变求值时机）。

### 6.3 ★双模式一致性检查点（**§1.5 的 A1/A2 落地为可执行项**）

| # | 检查点 | 方法 | 通过判据 |
|---|---|---|---|
| **M1** | `isTeacher`/`isStudent` 定义式逐字不变 | L0 第 216–217 行的 sha256 与改前相等 | 2 块相等 |
| **M2** | `isTeacher`/`isStudent`/`isEdit` **只创建一次** | 在 9 个新文件里 grep `props.mode` 与 `params.id` | **只在 W9 命中**（`props` 由 .vue 传入，W9 内 3 个 computed）；其余 8 个文件 **0 命中** |
| **M3** | P4（checker）在**两种模式下都被实例化** | grep `.vue` 里是否出现 `if (isTeacher)` 包住 W4 的调用 | **不得出现** —— W4 无条件调用（与改前一致：:270–372 无条件执行） |
| **M4** | `isEdit` 求值式不变 | L0 第 221 行 sha256 相等 | 相等（**不得**改成 `!!route.params.questionId`） |
| **M5** | 模板 :38 的 `FEATURE_CHECKER_ENTRY` 仍是普通 `const` | L1 `bindings` 里该名为 `setup-const`（**不是** `setup-ref`/`setup-maybe-ref`） | 类型相符 |
| **M6** | `props` 仍在 `.vue` | L1 `bindings.props` 存在 | 存在 |

---

## 7 落地顺序建议（分批，每批独立可交付且各自满足 §5 DoD）

**为什么必须分批**：一次性抽 9 个文件 = 一次性改动 559 行 script 里的 ≈465 行 + 模板 44 个名字的解析面；**任何一处出错都无法定位是哪一批的哪一行**；而 DoD 的每条判据（L1/L2）都是**整页级**的，无法区分批次内错误。分批让“改前 vs 改后”的对照始终是**上一批的绿状态**。

| 批 | 内容 | 搬移行数 | 收益 | 新增文件 | 组件内新 hook / 行为变化 | 本批必须额外做的验证 |
|---|---|---|---|---|---|---|
| **B1** | **纯叶子**：新建 **W1** `zipEntry.js`；.vue 里 `import { findFirstFile } from '../../composables/project/zipEntry.js'`，删除 :445/:446/:632-641 | ≈13 | script **559 → ≈546** | 1 | **零**（无 ref / computed / hook / watch / 计时器） | L0（3 段 + 3 块 sha256）+ L1（`findFirstFile` 仍是 `setup-const`）+ **真 import 一次**（constraints §3-12）+ 模板 3 段字节相等 |
| **B2** | **编辑器工作区 + 表单**：新建 **W2** `useEditorWorkspace.js`、**W6** `useQuestionForm.js`；.vue 接线 `activePath/fileContents/externalTree/openTabs/fading` + `form/difficultyTagClass/safeDescriptionHtml/showDescModal/showRubricModal/descDraft/rubricDraft` + 4 个 handler + 12 个函数 | ≈155 | script **≈546 → ≈391** | 2 | ★**`useMonacoTheme()`/`useMonacoKeyboardA11y()` 的调用点从 :229/:231 迁入 W2**（**仍各调一次**）；`onBeforeUnmount` 的 `:749/:751/:752` 三步改为调 `W2.dispose()`；`watch(activePath)`@518 整体搬入 W2 | L0 + L1 + **M2** + **N4（挂载次数）** + **N7（上传回调 + 300ms）**。⚠️ 本批**不改** `onBeforeUnmount` 的注册位置（仍在 .vue 注册一次），只改内部调用 |
| **B3** | **checker + 学生提交**：新建 **W4** `useChecker.js`、**W3** `useStudentSubmission.js`；.vue 接线 checker 9 响应式 + 10 函数 + `FEATURE_CHECKER_ENTRY` + prompt 4 状态 + `studentSubmission` 等 8 声明 | ≈220 | script **≈391 → ≈171** | 2 | `watch(checkerOpen)`@372 整体搬入 W4；`onBeforeUnmount` 的 `:750 stopCheckerPoll()` 改为调 `W4.stopCheckerPoll()` | L0 + L1 + **N3（开关语义：按钮不显示 + 逃生通道仍工作）** + **N6（学生提交）**。★**本批必须额外断言 `FEATURE_CHECKER_ENTRY` 是 `setup-const`**（M5） |
| **B4** | **上传 + 保存 + 加载 + 接线根**：新建 **W5** `useZipUpload.js`、**W7** `useSaveQuestion.js`、**W8** `useLoadQuestion.js`、**W9** `useProjectQuestionPage.js`；.vue 只留 `defineProps` + 一个 `useProjectQuestionPage()` 解构 + `onMounted`/`onBeforeUnmount` 各一次 | ≈172 | script **≈171 → ≈95**；**文件 868 → ≈300** | 4 | `onMounted`@741-746 / `onBeforeUnmount`@748-753 的**回调体整体平移**进 W9（**框架仍在 .vue 注册**）；`submitting`/`hasUploaded`/`uploadKeptCount`/`uploadKeptBytes`/`editorContainerRef`/`router`/`route` 的所有权归 W9 | L0 + L1 + **M1–M6 全套** + **N1（双模式渲染）** + **N2（保存守卫 5 分支）** + **N5（卸载清理）** + a11y 替代口径 + `arch-metrics`（**GodFile 6 → 5**）+ 刷新基线 |

**每批的完成判据（与 §5 DoD 对齐，缺一不可）**：

1. `node scripts/gates/arch-metrics.mjs` → PASS（**未分层须持平**；本步只增 `client/src/composables/project/*.js`，**不进 server 四层口径** → `unmigrated` 应保持 **44**；GodFile 在 **B4** 才下降 6 → 5）
2. `node scripts/gates/cycle-check.mjs` → **SCC 仍为 0**（client 侧新增 import 边也计入；本方案的可达图无环，§2.2）
3. `node scripts/gates/hard-metrics.mjs` → PASS **0/0/0**（★实测扫描面 = `client/src/style.css` + `client/src/**/*.vue`（`hard-metrics.mjs:6,20`）→ **新 .js 不在扫描面内**，本步该数应**逐字不变**；**两个 `<style>` 块一个字符不动 ⟹ 必然不变**）
4. `node scripts/gates/bind-check.mjs` → 违规 **0**（**新增 9 个模块的导出/导入必须真 `import()` 一次**，constraints §3-12：`node --check` 放行“导入了但对方没导出”的坏绑定，且**在无 `type:module` 的目录下对语法坏文件也返回 0**）
5. 全量后端测试：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → 4 处摘要、**0 failed**（本步**不动 server** → 应逐字不变 → **零成本高价值哨兵：若它变了，说明 B 越界了**）
6. **client 追加**：**L0（3 段切片 + 80 块 sha256）+ L1（bindings/tpl/styles 三重）+ L2（按批）**；**像素门禁不需要**（A 档，§4.4）；a11y 用 `page.accessibility.snapshot()` 逐节点对拍替代 axe
7. **每批一个提交**，消息含「拆分前 file:line 范围 + 目标 composable + 验证结果」

**若只能做一步**：做 **B1**（风险最低、收益可验证，且建立了 L0/L1 判据脚本 —— 后续每批复用）。**B4 是本步“不可逆感”最强的一步**，务必在 B1–B3 的判据脚本稳定后再做。

---

## 8 给 Agent B 的逐条搬移指令

### 8.1 总则（不可协商）

1. **只允许新建 §2.2 的 9 个 `client/src/composables/project/*.js`** + 修改 **`client/src/views/teacher/ProjectQuestionEdit.vue` 的 `<script setup>` 段（196–754）**。**禁止**碰：`ProjectQuestionEdit.vue` 的 `<template>`(1–194) 与**两个** `<style>`(756–857 / 859–868)、`client/src/components/{ProjectZipUploader,FormPage,RichEditor}.vue`、`client/src/components/checker/CheckerWizard.vue`、`client/src/api/{request,projects}.js`、`client/src/router/`、**`client/src/composables/` 下的既有文件**（尤其**不要“顺手”改用 `useProjectUpload.js`**）**与 `composables/submit/*`（step 2 产物）**、`client/src/infrastructure/monaco/legacyLoaderCompat.js`、`scripts/gates/*`、`client/package.json`、任何其它 `.vue`。
2. **搬移 = 按 §2.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角括号、`：`、`——`、`…`、以及注释里的 `§十一`/`T4-F2`/`R4`/`R6`/`T02`/`QA T5-A5` 等编号）。★**连 `await new Promise(r => setTimeout(r, 300))`（:607，形参 `r`）与 `await new Promise(res => setTimeout(res, 300))`（:668，形参 `res`）的形参名都要一起搬** —— 它们**故意不同**，改了就破坏逐字节判等。★`onZipReady` 的**解构重命名** `{ tree, fileContents: fc, keptCount, keptBytes }`@585 也必须保留（`fc` 是为避开模块级 `fileContents` Map）。
3. ★**绝对不能在搬移中“顺手修”这 6 处**（`plan §6` 明令）：
   - ① **`FEATURE_CHECKER_ENTRY = false`** 与 :267-269 注释（§6.1-K1/K2/K3）；
   - ② **4 处死代码**：`handleGenerateChecker`@339、`copyScript`@362、`checkerLogs`@302、`checkerLoading`@273（§6.1-K5）；
   - ③ **`onBeforeUnmount`@748-753 的 4 步顺序**与“不置空 `monaco/editor`”（§3.1-4）；
   - ④ **`useMonacoKeyboardA11y.js:128` 已有的 `onBeforeUnmount(disposeAll)`**（**不改那个文件**；本文件 `:749` 的双重释放是**既有幂等兜底**，逐字保留，**不得因为“重复了”就删掉 :749**）；
   - ⑤ **`initMonaco`@464 `if (monaco) return;`** 的挂载闸门与 **`resetModels`@440 的 `try/catch`**；
   - ⑥ **保存守卫 4 条分支的文案与顺序**（§6.2-K4-2）。
   **各自登记为后续独立项。**
4. **所有权唯一**：`form` 只在 **W6** 创建一次；`activePath/fileContents/externalTree/openTabs/fading` 只在 **W2**；`studentSubmission` 只在 **W3**；checker 系 9 个 + `checkerLoadedOnce` 只在 **W4**；`hasUploaded/uploadKeptCount/uploadKeptBytes` 只在 **W5**；`showDescModal/showRubricModal/descDraft/rubricDraft` 只在 **W6**；`prompt*` 只在 **W4**；`submitting/editorContainerRef/isTeacher/isStudent/isEdit/router/route` 只在 **W9**。**任何其它 composable 不得再 `ref()/reactive()/computed()` 同名对象**，一律以参数接收。**`.vue` 里不得出现任何 `ref(` / `reactive(` / `computed(` / `watch(`**。
5. ★**`defineProps` 必须留在 `.vue`**（`:215` 逐字不动，包括 `{ mode: { type: String, default: 'teacher' } }`）；`useRouter()`/`useRoute()` **只在 W9 各调一次**并把 `router`/`route` 向下注入（**不得让 W7/W8 各自 `useRoute()`**）。
6. **`route.params.*` 的读取位置逐字保留**（14 处：:221/:242/:288/:305/:340/:382/:383/:568/:655/:687/:696/:713/:743/:744），**不得提前解构成普通变量**（§3.1-6）。★`isEdit`@221 的 **`!!route.params.id`** 一个字不许改（M4）。
7. **清理集中注册**：`onBeforeUnmount` **只在 .vue 里出现一次**；各 composable 暴露 `disposeXxx()`，按 **`:749 → :750 → :751 → :752`** 的顺序调用（`keyboardA11y?.dispose()` → `stopCheckerPoll()` → `Object.values(models).forEach(…)` → `editor?.dispose()`）。**`onMounted` 同理只在 .vue 出现一次**（回调体放 W9）。
8. **`.vue` 里不得出现 `export` / `defineEmits` / `defineExpose`**（实测原文件也没有这些宏；只有 `defineProps`）。
9. **每个新文件顶部加 banner**（固定格式，便于 C 机械核对）：

```js
/**
 * <文件名> —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 <B1-B4>，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */
```

10. **命名与导出**：`export function useXxx(…)` + `export default useXxx`（对齐 `useConfirm.js:44,77` / `useMonacoTheme.js:139,148`）；**纯函数文件 `zipEntry.js` 用具名导出**（无 default，对齐 `composables/submit/answerFormat.js`）。
11. **不要写 smoke test、不要新增测试文件**（C 的职责）；不要改 `client/package.json` 的 scripts；**不要新增任何依赖**（尤其**不要装 axe-core**）。
12. **每批完成后必须自重跑一遍 L0/L1**（§4.3）；**不要用任何回滚类 git 命令**（`checkout/restore/reset`）—— 出错就用重编辑。
13. ★**不要让 composable 互相 import**（§2.3 的 3 处环）—— **一律参数注入**；也不要创建“桶文件”/`index.js` 再让 composable 从桶里取（会成环）。
14. ★**`useMonacoTheme()` 与 `useMonacoKeyboardA11y()` 各只调用一次**，且**只在 W2 内**（§3.1-4-②）。

### 8.2 「模板零改动」的具体检查点（**逐条可执行**）

| # | 检查点 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| **C1** | 模板段字节相等 | `awk 'NR>=1&&NR<=194' <before> > b.t; awk 'NR>=1&&NR<=194' <after> > a.t; cmp b.t a.t` | **无输出**（逐字节相等）。★**边界是 194，不是 40** |
| **C2** | **两个**样式段字节相等 | 同上，`NR>=756&&NR<=857` 与 `NR>=859&&NR<=868` | **两段都无输出** |
| **C3** | **四个块边界标签未动** | `grep -n -E '^</?(template\|script\|style)[^>]*>$'` | `<template>`=1 / `</template>`=**194** / `<script setup>`=**196** / `<style scoped>`=**756** / `</style>`=**857** / `<style>`=**859** / `</style>`=**868**；**只有 `</script>` 的行号允许变化** |
| **C4** | 模板里的 **44 个名字**全部仍可解析 | L1-① `compileScript().bindings` 的**键集合 + 值（类型）**与改前**完全相等** | 逐名相等、**类型相等**（★`checkerCanClose`/`checkerStatus`/`form` 等不得从 `setup-ref` 退化） |
| **C5** | `props` 仍在 | L1-① `bindings.props` 存在且含 `mode` | 存在 |
| **C6** | ★`FEATURE_CHECKER_ENTRY` 的 bindings 类型 | L1-① 该名为 **`setup-const`** | 是 `setup-const`（若是 `setup-ref` → **按钮会重新出现**） |
| **C7** | 模板里 10 个 `v-model` 目标仍是**同一对象** | 运行时探针：`:11` 输入标题 → 断言 PUT body 的 `title` 一致（N2 已覆盖）；`:154` 上传 → 断言 `form.packageFile` 被写（N7） | 请求体逐字节正确 |
| **C8** | 模板 `ref` 行为不变 | `:183 ref="editorContainerRef"`；L1-② 模板编译产物含同名 ref 指令 | 编译产物逐字节相等（已覆盖） |
| **C9** | 类名集合未漂移 | 提取模板 `class` 字面量 ∪ `difficultyTagClass`/`studentStatusType` 的返回键 → 与两个 `<style>` 块选择器求差 | 改前改后差集**相同** |
| **C10** | **scoped id 未变 + `styles` 数组未变** | L1-③ `descriptor.styles` 的 `{scoped, content}` 数组逐字节相等 | 数组相等（★证明没人把 :859 的 `<style>` 改成 `<style scoped>`） |
| **C11** | ★**双模式一致性 6 项** | §6.3 的 M1–M6 | 6 项全绿 |
| **C12** | 模板没有增删注释块 | 仅确认 B 未为“格式化”重写 `<!-- -->` | C1 通过即通过 |

### 8.3 逐文件执行单

| 步骤 | 动作 | 完成判据（自重） |
|---|---|---|
| **B-0** | 建目录 `client/src/composables/project/`（`git ls-files` 实测不存在；同级 `submit/` 已存在） | 目录存在且为空 |
| **B1-1** | 写 `zipEntry.js`（`UTF8_STRICT`@445 / `GBK_DECODER`@446 / `findFirstFile`@632-641 + banner） | `node --check`；**3 块与源区间 sha256 相等**；**真 `import()` 一次**并断言 `typeof findFirstFile === 'function'` |
| **B1-2** | 改 `ProjectQuestionEdit.vue` script：删这 3 块、加 1 条 import、其余逐字不动 | L0（3 段）+ C1–C6 + C9 + C10 全绿 |
| **B1-3** | 提交（消息含源行区间 + 目标文件 + 验证结果） | 单提交；`git show --stat` 只含 2 个文件 |
| **B2-1** | 写 `useEditorWorkspace.js`（12 声明 + `useMonacoTheme()`/`useMonacoKeyboardA11y()` **各一次** + `watch(activePath)`@518-521 + 暴露 `dispose()`） | `node --check`；12 块 sha256 相等；**grep 确认文件内 `useMonacoTheme(` 与 `useMonacoKeyboardA11y(` 各出现 1 次** |
| **B2-2** | 写 `useQuestionForm.js`（12 声明） | 12 块 sha256 相等 |
| **B2-3** | 改 `.vue` 接线（W2/W6 解构；`onBeforeUnmount` 的 `:749/:751/:752` 改为调 `W2.dispose()`，**注册位置不动**） | L0 + L1 + **M2** + **N4** + **N7** |
| **B3-1** | 写 `useChecker.js`（27 声明 + `watch(checkerOpen)`@372 + `FEATURE_CHECKER_ENTRY`@270 **含 :267-269 JSDoc**；暴露 `{ isLoaded: () => checkerLoadedOnce, checkerStatus, checkerMeta, checkerStale, ensureCheckerState, openCheckerModal, stopCheckerPoll, markStale, … }`） | 27 块 sha256 相等；`node --check` |
| **B3-2** | 写 `useStudentSubmission.js`（8 声明，注入 `{ resetModels, initMonaco, openFile }`(W2) + `{ openTabs, externalTree, fileContents, hasUploaded }` + `{ form }`(W6) + `editorContainerRef`(W9) + `findFirstFile`(W1)） | 8 块 sha256 相等 |
| **B3-3** | 改 `.vue` 接线 | L0 + L1 + **M5（`FEATURE_CHECKER_ENTRY` 是 `setup-const`）** + **N3** + **N6** |
| **B4-1** | 写 `useZipUpload.js`（6 声明，注入 W4 的 getter/markStale + W2 的 3 函数 + W1）+ `useSaveQuestion.js`（1 声明，注入 `checker` 整体）+ `useLoadQuestion.js`（1 声明，注入 W3/W4 分量） | 8 块 sha256 相等 |
| **B4-2** | 写 `useProjectQuestionPage.js`（7 声明 + `onMounted`@741-746 / `onBeforeUnmount`@748-753 两个回调体 + 组装 W1–W8） | hook 体与源区间 sha256 相等（**缩进变化是唯一允许差异**） |
| **B4-3** | 改 `.vue`：script 只剩 `import` + `defineProps` + `useProjectQuestionPage()` 解构（**44 名一个不漏**）+ `onMounted`/`onBeforeUnmount` 各一次 | **L1 `bindings` 键集合与类型与改前完全相等**（44 名）+ 文件 **≈300 行 ≤ 800** |
| **B4-4** | 跑四门禁（arch/cycle/hard/bind）+ L2 全套（N1–N7）+ a11y 替代口径 | §7 的 7 条判据全绿 |
| **B4-5** | 写 `docs/split/ProjectQuestionEdit.vue-refactor.md`（源区间 → 目标文件:行 + 每块 sha256 + 6 处“逐字保留”的登记 + 双模式一致性 M1–M6 自测） | **80 个声明 + 28 函数 + 2 个 hook 体全覆盖**（无遗漏、无重复） |
| **B4-6** | 提交 + 刷新 `docs/split/status.md`（**GodFile 6 → 5**；观察带 16 不变）与 `arch-metrics.mjs:25` 的 `godfileOver800: 5` | 单提交；基线数字与 `arch-metrics` 实跑一致 |

### 8.4 禁令（违反即回流）

1. 顺手“优化”：`FEATURE_CHECKER_ENTRY` 的 `false`、4 处死代码、`initMonaco` 的幂等判断、`resetModels` 的 `try/catch`、`onZipReady` 的 300ms、`handleSave` 的 4 条守卫分支、双模式分支 —— **一个都不许动**。
2. 在同一提交里改任何 evidence 文案（`'保存成功'`@569 / `'创建成功，请为该题生成自动评分器'`@574 / `'保存失败：'`@578 / `'上传失败：'`@628 / `'提交失败：'`@676 / `'请先上传项目文件'`@646 / `'请输入题目名称'`@524 / `'获取自动评分器状态失败：'`@317 / `'生成失败：'`@356 / `'复制失败，请手动选择复制'`@367 / `'获取提示词失败：'`@251 / `'加载失败'`@737 / 4 条守卫文案）或任何阈值（`3000`@324 / `300`@607,668 等）。
3. 改 `ProjectQuestionEdit.vue` 的模板或**任一**样式块（**哪怕只加一个注释**）。
4. 让 composable 互相 import（**必须走参数注入**）；或让 `.vue` 出现 `ref(` / `reactive(` / `computed(` / `watch(`。
5. 在 composable 里注册 `onMounted` / `onBeforeUnmount`（**清理集中注册是硬要求**）；或在 W2 之外调用 `useMonacoTheme()`/`useMonacoKeyboardA11y()`。
6. 用 `git checkout/restore/reset` 回滚（用重编辑）。
7. 改 `scripts/gates/*`、改 `tests/*`、改 `client/dist*`、改 `client/src/composables/submit/*`（step 2 产物）、改既有 composable。
8. 把 `defineProps` 搬进 composable，或让 composable 自行 `useRoute()`。

---

## 9 给 Agent C 的验证清单

C 为**只读 + 自建对拍**（**不复用 B 的脚本**），临时产物全部放 `/tmp`；**不跑 jest**（本步不动 server）；**不启动 :5173/:3000**；若用 rig 用 `:3100`（或自建 31xx）且用后 `stop`；**必须显式 `CLIENT_DIR="<主仓库>/client"`** 并留痕被测树。

| # | 验证项 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| **V1** | 版本锚点 | `git rev-parse HEAD`；`shasum -a 256 client/src/views/teacher/ProjectQuestionEdit.vue` | 记录实测值（改前应为 `1fb6ac50…`；若 HEAD 已前移则重新冻结并记录） |
| **V2** | ★**模板 + 两个样式字节相等**（核心） | §4.3-L0 的**三条 `cmp`**（`git archive e37d27c` 冻结） | `TEMPLATE_STYLE_BYTE_IDENTICAL`；**模板必须是 `</template>`=194 的那 194 行**；**两个样式块都要比** |
| **V3** | ★**逐字搬移（静态）**（核心） | 自建 `slice-equal.mjs`：按 §2.2 区间从改前文件切块 → 从改后 composable 切**同名块** → 逐块 sha256 | **80 块（28 函数 + 52 声明）+ 2 个 hook 体，0 块不等**（允许差异白名单：banner / import / `export` / 缩进 / W2 的 acquire 行 —— **逐条列出并给理由**） |
| **V4** | ★**bindings / 模板编译 / styles 三重对拍**（核心，本步最锋利） | §4.3-L1：`@vue/compiler-sfc@3.5.34` 的 `compileScript().bindings` + `compileTemplate()` + `descriptor.styles` | **44 名键集合与类型逐名相等**；模板编译产物**逐字节相等**；`styles` 数组逐字节相等 |
| **V5** | ★**双模式一致性 6 项**（**本文件独有**） | §6.3 的 M1–M6 | M1（:216/:217 sha256 相等）· M2（`props.mode`/`params.id` 只在 W9 命中）· M3（W4 在两种模式都被实例化）· M4（:221 逐字）· M5（`FEATURE_CHECKER_ENTRY` = `setup-const`）· M6（`bindings.props` 存在）**全绿** |
| **V6** | ★**开关语义与保存守卫逃生通道**（**本文件独有**） | L2-N2 + N3 | ① **「自动评分器」按钮改前改后都 `count=0`**；② `stale`/`review`/`none` **三条分支都仍打开弹窗**；③ `generating` 分支**不**打开弹窗且文案正确；④ `ready` 时发出 `PUT` |
| **V7** | 导出面 / 绑定 | `node --check` 每个新文件（**仅当格式检查**，constraints §3-12 明令它不能当“通过”证据）；再**真 `import()` 一次**（`Object.keys` 对拍） | 无 `does not provide an export named`；`node scripts/gates/bind-check.mjs` 违规 **0** |
| **V8** | 四门禁 | `arch-metrics.mjs` / `cycle-check.mjs` / `hard-metrics.mjs` / `bind-check.mjs` | arch PASS（`unmigrated` **44 持平**；GodFile **6 → 5** 如实记录；观察带 **16 不变**）；cycle **SCC=0**；hard **0/0/0**（★**应逐字不变**，扫描面只含 `.vue` + `style.css`）；bind 0 |
| **V9** | 后端零回归哨兵（**证明 B 没越界**） | `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` | 日志 **4 处 `Test Suites:`**、**0 failed**、套件/用例数与改前**完全相同**（本步不动 server；**若数字变了 → B 越界，直接回流**） |
| **V10** | ★**L2 交互（核心 3 条 + 建议 4 条）** | §4.3：**N1 双模式渲染 / N2 保存守卫 5 分支 / N3 开关语义**（必做）+ N4 挂载次数 / N5 卸载清理 / N6 学生提交 / N7 上传+300ms | **改前改后都必须通过**；请求体（`PUT /teacher/questions/:id` 的 6 个字段、`POST …/submit` 的 multipart）逐字节对拍 |
| **V11** | ★**U3 资源不变量（含双重释放）** | 自建探针（monkey-patch `setInterval/clearInterval/addEventListener/removeEventListener` + `monaco.editor.getModels().length`） | 卸载后：**存活 interval = 0**（本文件只有 `checkerTimer` 一个计时器）、models **归零**、**控制台零 error**（尤其 `model disposed` 类）；★**证明“双重释放”照旧存在且未被放大** |
| **V12** | ★**U5 五条守卫分支的装置化** | 自建 `/tmp` 夹具服务：按 `GET /api/teacher/questions/:id/checker` 的 `status` 返回 `stale/generating/review/none/ready` 五种 | 5 种行为逐条相符（同 V6）；★装置须**在 `/tmp`、不改仓库、不改 `tests/`** |
| **V13** | a11y 替代口径 | `page.accessibility.snapshot()` **逐节点对拍**（改前 vs 改后，同一路由同一夹具） | ARIA 树逐节点相等（模板零改动下**应当**相等）；**若 Captain 未拍板口径 → 显式登记“axe 未执行”并接受盲区** |
| **V14** | 越界自查 | `git status --porcelain`；`find . -newermt '<B 开始时刻>' -not -path './node_modules/*' -not -path './.git/*'` | 只有计划内的 **9 新 + 1 改**（+ 双方报告）；`client/dist`、`tests/`、`client/src/composables/submit/*`、`client/src` 其余文件 mtime **无变化** |
| **V15** | 回滚粒度 | `git show --stat HEAD` | 单提交/批，消息含「拆分前 file:line 范围 + 目标 composable + 验证结果」 |
| **V16** | ★**像素门禁的地位复核** | 对照 §4.4 的 A 档判定 + 复核 B 是否动了模板/样式 | **如实登记：A 档，像素门禁未跑且不构成判据**；若 B 实际动了模板/样式 → **本步必须升 B 档并重跑** |

**判定纪律**：**V2 / V3 / V4 / V5 是本步核心判据**（“逐字搬移 + 模板零改动 + 双模式一致”的直接证明，**完全独立于像素门禁**）；**V10 是唯一能证交互不变的东西**；**V6 是本文件独有的开关/守卫语义**；其余是既定门禁。任一不符 → **回流 B，不得改测试或改门禁迁就实现**（constraints §3-16）。

---

## 10 局限声明

1. **未真跑任何门禁 / 测试 / 构建 / 浏览器**：§7 的 7 条判据与 §3 的等价性判定均为**静态阅读 + 机制论证**，不等于实跑。真跑必须由 C 完成（V7–V15）。**我未执行 jest、`vite build`、任何服务、任何 Playwright。** 实测的只有：`git rev-parse` / `git status` / `shasum` / `wc` / `grep` / `sed` / `ls` / `lsof` / `node -e`（只读版本号）与 `read`。
2. **§2.2 的行数预估有 ±10% 误差**：`搬移行数` 是逐区间数出来的（可复核），`预估总行数` = 搬移行数 + 我对 banner / import / 导出块的估计。判据是 **<800**（最大的 W4 ≈180，远未逼近），不是精确值。**`.vue` 最终行数 ≈300 也有 ±30 行误差** —— 若实际落在 800 以上，**本步的 GodFile 收益不成立**，须由 C 实测后回报。
3. **「模板零改动 ⟹ 像素必然相等」是论证而非实测**：该论证依赖「渲染函数只由模板 + 编译器 + scoped id 决定」。**若 B 的接线改变了某个 `v-if` 守卫的初值时机**（例如 `hasUploaded` 在首帧前被赋值），首帧就**真的会变**。→ **本方案仍要求 L0/L1 必做**（它们比像素更强），**但像素门禁本身在 A 档不跑**（§4.4）；若 B 动了模板/样式，则**必须**升 B 档并跑像素门禁。
4. **5 条「不确定需实测」（U1–U5）本节无法收敛**：它们是运行时状态机 / 资源生命周期 / 双模式求值，静态阅读**原则上不可判**。★**U1（双模式一致性）是本文件独有的、由“一个 .vue 服务两条路由”直接产生的必测项** —— 我有**较强**的理由认为它等价（定义式逐字搬移 + bindings 类型对拍），但**“运行时拿到的布尔值相同”这一点只有实测能证**。判定权在 Captain。
5. **六处既有问题被显式保留（不是本步引入）**：① `FEATURE_CHECKER_ENTRY=false` 隐藏入口（**用户明确要求，不是缺陷**）；② 4 处不可达死代码（`handleGenerateChecker`/`copyScript`/`checkerLogs`/`checkerLoading`）；③ `useMonacoKeyboardA11y.js:128` 自注册 hook 与本文件 `:749` 的**双重释放**（当前幂等）；④ `initMonaco` 在 `await` 之后调用 `attachKeyboardA11y`（**实测无异步注册缺陷**，因为 `attach` 不注册 hook）；⑤ 学生模式下 `isEdit` 仍被求值（当前无害，因所有用法都有 `isTeacher` 前置守卫）；⑥ 两次 **300ms 硬编码延迟**（`<Transition mode="out-in">` 的经验值，非确定性等待）。**本方案要求逐字保留**，各自登记为后续独立项。
6. **axe 本轮不可用**（§4.1 实测：`axe-core` 在三个 `node_modules` 与 `/tmp/t5-tools` 均不存在）。DoD 的「axe 不引入新违规」**当前无法执行** → 必须由 Captain 在 §4.4 的口径中拍板（A 建议用 `page.accessibility.snapshot()` 逐节点对拍），否则这条 DoD **形同虚设**。
7. **两道装置闸门（G-A / G-B）本步均不阻塞，但都有触发条件**：G-A（rig 默认指向 `Exam-DeepSeek-ui` 另一 worktree）→ 若用 rig 做 L2，**必须显式 `CLIENT_DIR=<主仓库>/client`**；G-B（`pixel-diff.mjs` 的 `FIXTURES` 只有 3 条 teacher 端点、**无任何本文件要打的端点**、`FIXTURE_USER.role='teacher'`）→ **若 B 判定必须动模板（升 B 档），G-B 立刻变成阻塞项**，而**补夹具不是 C 的活**（C 只读）。→ 建议状态落 `docs/split/status.md` 待决清单（对应其“强制停止条件 ③ 护栏不可用”）。
8. **未审计 `CheckerWizard.vue` 内部**：本文件 `:108-115` 消费它（`question-id`/`max-score`/`mock`/`project-tree` 四个 props + `@status-change`/`@confirm` 两个 emit）。我只确认了**本文件侧的接线点**（`:109 route.params.id` / `:112 externalTree` / `:113 onCheckerStatusChange` / `:114 ()=>(checkerOpen=false)`）。**它的三步向导 / mock 流程 / 自身轮询不在本步范围**（本步不改它），但它**是 `checkerStatus` 的另一半真值源**（`:113` 回写 `checkerData.value.status`）→ 若后续要拆它，需另起一份 plan。
9. **未审计 `ProjectZipUploader.vue` / `FormPage.vue` / `RichEditor.vue` 内部**：只从**本文件侧**确认了契约（`@ready` 载荷 `{tree, fileContents, keptCount, keptBytes}`@585、`@select` 载荷 `{path,name,language}`@614、`v-model:package`/`:tree-data`/`:hint` 三个 props）。**它们的过滤逻辑 / 树渲染不在本步范围**（本步不改它们）。
10. **计划书 §2-#10 的“`useChecker`（自动评分器 ~180 行）”已核对**：本轮实测该段 `:266–372` = **107 行**（+ 提示词预览 7 行 = 114 行代码），加 banner/import/JSDoc/导出 **≈180 行**，**估算准确**。但计划书**未识别**本文件的 5 个额外单元（W2/W3/W5/W6/W8）与**两个独有约束**（双模式、开关常量）—— 本方案是对它的**扩充而非照抄**。
11. **`status.md` 的锚点与基线均滞后一轮**（见开头「版本锚点」的勘误）：`anchor: 2c9e3d9` 应为 `e37d27c`；`GodFile 7` 应为 **6**、观察带 `17` 应为 **16**（以 `arch-metrics.mjs:25` 为准）。**这两处已在本方案登记，但修正 `status.md` 不是我的权限**（A 的唯一产物是本文件）。
12. **未做全仓扫描**（A 角色纪律，plan §8.1 第 5 条）：本方案**只针对 ProjectQuestionEdit.vue 一个文件**；其余 5 个剩余 GodFile（`teacherController` / `Doc.vue` / `ReviewDetail.vue` / `QuestionEdit.vue` / `reviewController`）未分析。§2.4 对既有 composable 的引用仅限“是否存在 / 契约形状 / 消费方”，**未审计它们自身的正确性**。
13. **§1.5 的双模式结论基于“模板 `v-if` 守卫 + script 调用点”的静态配对**：我逐个核对了模式相关 `v-if` 与 3 条 `loadQuestion` 分支，**但 `computed` 的求值时序与 `props` 的更新时机（如路由在同组件实例内切换）未做运行时验证**。本仓该路由**实际靠路由重建组件**（router :29/:30/:53 均为组件级 `import()`），故不会踩到“同实例切模式”，**但这条前提若变化，U1 的结论随之变化**。
