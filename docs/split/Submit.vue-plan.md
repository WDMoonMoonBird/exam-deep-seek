# Submit.vue 拆分方案（接缝与响应式护航分析）

- **step**: 2 ｜ **phase**: A（接缝与响应式风险分析）｜ **日期**: 2026-10-11
- **目标文件**: `client/src/views/student/Submit.vue`（**1519 行**，`wc -l`；SFC 尾后无换行）
- **方案来源**: `docs/plan/2026-10-11-godfile-split-plan.md` §2-C1 / §3 原则 2 / §4 步 2 / §5 DoD / §6 R3 / §8 ｜ 状态机 `docs/split/status.md`
- **上游装置**: `docs/split/pixel-gate-report.md`（§5「已知局限」必读、§7 `--regions` 模板）｜ `docs/split/ruleExecutor-plan.md`（格式与深度基准）

## 版本锚点（本方案全部实测数据的取值时刻）

| 项 | 实测值 | 命令 |
|---|---|---|
| HEAD | `2c9e3d9`（"split(step-0): 补充像素门禁报告的收尾复核"） | `git rev-parse HEAD` |
| 分支 | `master` | `git rev-parse --abbrev-ref HEAD` |
| 目标文件 sha256 | `6fa9dead483f635934da02405b49d3fc558bd293265d25d060078719ca80a3f4` | `shasum -a 256` |
| `git status -- client/` | **空**（工作区该文件零改动） | `git status --short` |

⚠️ **锚点勘误（第 10 条纪律）**：`docs/split/status.md:6` 写 `anchor: 17be8c9`，`docs/split/pixel-gate-report.md` 的收尾锚点写 `c7dbd75 / 06cb6dc` —— **两者都不是当前 HEAD**。本轮实测 HEAD = `2c9e3d9`（在 `f017151` → `a054b74` → `2c9e3d9` 之后）。凡引用行号/哈希前必须重新 `git rev-parse HEAD`。

---

## 0 约束遵守声明

| 约束 | 遵守方式 |
|---|---|
| 纯只读 | 本轮**只写本文件**；未创建/修改/删除任何其它文件；**未触碰任何 .vue**（`git status -- client/` 实测为空） |
| 禁止 git 写操作 | 只用 `rev-parse / log / status / show / ls-files`；无 clean / stash / checkout / reset / restore |
| 不跑 jest / build / 服务 | 未执行任何 jest、vite build、服务启动；未占用 :5173 / :3000 / :3100 / :3110 / :3111（`lsof` 实测这些端口全空）；未碰 `client/dist` / `client/dist-r2` / `client/dist-t02check` |
| 不碰 `tests/` | 仅**只读**读取 `tests/ui-redesign-verify/**` 作为装置参考；未写入、未执行 rig 的任何子命令 |
| 禁止联网 | 未调用任何网络工具；未 npm install |
| 行号与计数自测 | §1 的 14 段边界、53 函数、47 声明、38 个模板可见名字、模板/样式行数全部本轮实测（方法与依据随表给出） |

---

## 1 段落接缝图谱（逐段实测）

### 1.0 三个块的真实行数（**纠正常见误读**）

| 块 | 起止行（实测） | 行数 | 非空行 |
|---|---|---|---|
| `<template>` … `</template>` | 1–281 | **281** | 264 |
| `<script setup>` … `</script>` | 283–1206 | **924** | 834 |
| `<style scoped>` … `</style>` | 1208–1519 | **312** | 308 |
| 合计 | 1–1519 | **1519** | — |

> **「template 64 行」的来源已定位**：`grep -n '</template>' Submit.vue` 的**第一条命中是第 64 行**（那是内层 `<template v-for>` 的闭合标签，另见 :155 / :237 / :256 / :259），外层 `</template>` 在 **:281**。计划书 §2 表格里的「template 64」应理解为「首个 `</template>` 之前的行数」，**不是模板块大小**。真实模板块 = **281 行**。
> → 对拆分无影响（本步模板一行不动），但**任何"行数下降"的收益核算必须以 281 为基数**，否则会把收益虚报约 217 行。

### 1.1 14 条段落横幅（实测行号）

| # | 横幅行 | 段落名 |
|---|---|---|
| P0 | 283（无横幅） | SFC 头 · import 面 · `useRoute` / `useConfirm` |
| P1 | 296 | 数据 |
| P2 | 323 | 导航 |
| P3 | 481 | 题号方块：a11y 与键盘导航（05-page-specs T4） |
| P4 | 553 | 编辑器懒挂载 |
| P5 | 594 | 辅助 |
| P6 | 669 | 多选双向绑定 |
| P7 | 676 | 客观题答案初始化 |
| P8 | 754 | 脏标记 |
| P9 | 765 | 草稿保存 |
| P10 | 867 | 截止倒计时调度（P-1 修复） |
| P11 | 935 | 提交全部 |
| P12 | 1033 | 数据加载 |
| P13 | 1109 | 评分轮询 |
| P14 | 1170 | 生命周期 |

### 1.2 逐段详表（起止行 / 段内声明 / 响应式对象 · 生命周期 / 模板引用）

> 归属规则：横幅行到下一横幅行之前（P2 含 483–551 全部；P5 含 594–667 全部，其中 :664 `isCodeStem` 物理在 P5、逻辑属 P5 的题干渲染，见 §1.3 暗礁 2）。

| # | 段落 | 起止行（实测） | 行数 | 段内顶层声明（名@行） | 用到的响应式对象 | 生命周期 | 模板直接引用？ |
|---|---|---|---|---|---|---|---|
| **P0** | 头 / import / 注入 | 283–295 | 13 | `route`@293 `{confirm}`@294 | — | — | 间接（`$router.back()`@5 走全局） |
| **P1** | 数据 | 296–322 | 27 | `data`@297 `q`@298 `subQuestions`@299 `allowResubmit`@300 `endTime`@301 `showMaterial`@302 `isPracticeMode`@303 `maxAttempts`@304 `currentAttempt`@305 `submittedAttempts`@306 `bestScore`@307 `answers`@309 `itemAnswers`@310 `multiAnswerBind`@311 `subStatuses`@312 `subScores`@313 `subFeedbacks`@314 `editorLangs`@315 `submittingAll`@317 `draftTimer`@318 `deadlineTimer`@319 `langs`@321 | **全部**（11 ref + 7 reactive） | — | **是**（18/22）：`data q subQuestions allowResubmit showMaterial isPracticeMode maxAttempts currentAttempt bestScore answers itemAnswers multiAnswerBind subStatuses subScores subFeedbacks editorLangs submittingAll langs` |
| **P2** | 导航 | 323–480 | 158 | `contentRef`@324 `activeAnchor`@325 `collapsedSqs`@326 `dirtyCount`@327 `dirtySet`@328 ｜ 函数 13：`getNavLabel`@330 `itemTypeLabel`@342 `sqHasScore`@347 `formatItemAnswer`@352 `retryPractice`@368 `itemTypeColor`@404 `itemTypeClass`@412 `getItemKey`@419 `isSqAnswered`@421 `getSqResult`@431 `getItemResult`@445 `oiCardClass`@455 `sqBoxClass`@468 | `contentRef activeAnchor collapsedSqs dirtyCount dirtySet` + **读** P1 全部 + **写** `bestScore dirtyCount` + `editorRefs editorMounted`（P4，**跨段**） | — | **是**（7 名）：`contentRef`@74 `getNavLabel`@29,97 `itemTypeLabel`@54,175 `sqHasScore`@158,233 `formatItemAnswer`@234 `itemTypeColor`@175 `itemTypeClass`@175 |
| **P3** | 题号方块 a11y | 481–552 | 72 | `boxIndex`@483(computed) `BOX_RESULT_TEXT`@497 ｜ 函数 8：`boxLabel`@500 `isActiveAnchor`@505 `focusBoxAt`@507 `activateBoxAt`@513 `onBoxKeydown`@523 `toggleCollapse`@539 `scrollTo`@544 `activateAnchor`@549 | `boxIndex`（依 `subQuestions`）`subStatuses subScores isPracticeMode activeAnchor collapsedSqs` | — | **是**：`boxLabel`@40,57 `isActiveAnchor`@41,58 `onBoxKeydown`@43,60 `activateAnchor`@42,59,136,149,171 `scrollTo`@42,59 `toggleCollapse`@27 |
| **P4** | 编辑器懒挂载 | 553–593 | 41 | `editorMounted`@554 `editorRefs`@555 `editorObserver`@556 ｜ 函数 4：`ensureEditorObserver`@559 `setupEditorObserve`@574 `mountEditor`@581 `formatEditor`@590 | `editorMounted editorRefs`（reactive 对象）+ 写 `answers` | **observer 在异步回调里创建**（§3.1-3） | **是**：`editorMounted`@136 `editorRefs`@138 `setupEditorObserve`@147 `formatEditor`@132 |
| **P5** | 辅助 | 594–667 | 75 | computed 9：`materialText`@595 `safeMaterial`@599 `isExpired`@602 `remainingAttempts`@604 `totalScored`@621 `unsubmittedCount`@627 `allSubmitted`@636 `submitDisabled`@639 `practiceAllGraded`@650 ｜ 函数 3：`safeSqContent`@600 `isSqReadonly`@610 `isCodeStem`@664 | `q endTime maxAttempts submittedAttempts subScores subQuestions subStatuses allowResubmit isPracticeMode`（**全读**） | — | **是（全部 12 个）**：`materialText`@76,81 `safeMaterial`@82 `safeSqContent`@114 `isExpired`@16,252,270,275 `remainingAttempts`@12 `totalScored`@14 `unsubmittedCount`@254,258 `allSubmitted`@252 `submitDisabled`@264,267 `practiceAllGraded`@247 `isSqReadonly`@128,132,141,177,187,200,214,226 `isCodeStem`@181 |
| **P6** | 多选双向绑定 | 669–675 | 7 | `onMultiBindChange`@670 | `multiAnswerBind itemAnswers` + 调 `markDirty`（P8） | — | **是**：`onMultiBindChange`@202（`v-model:value="multiAnswerBind[...]"`@199） |
| **P7** | 客观题答案初始化 | 676–753 | 78 | 函数 5：`initObjectiveAnswers`@677 `markObjectiveCorrect`@702 `buildObjectiveAnswer`@728 `hasPartialOmissions`@738 `hasObjectiveAnswer`@747 | `itemAnswers multiAnswerBind`（读+写） | — | **否**（经 `oiCardClass`/`getItemResult` 与提交流间接） |
| **P8** | 脏标记 | 754–764 | 11 | `markDirty`@755 `clearDirty`@760 | `dirtySet dirtyCount` | — | 间接（`dirtyCount`@67） |
| **P9** | 草稿保存 | 765–866 | 102 | `draftNotice`@768 `draftNoticeText`@769(computed) `saveDebounce`@822 ｜ 函数 7：`getToken`@775 `saveAllDrafts`@779 `scheduleSave`@823 `onVisibilityChange`@829 `onBeforeUnload`@840 | `dirtySet dirtyCount draftNotice` + 读 `subQuestions q route.params answers itemAnswers multiAnswerBind` + 调 `isSqReadonly hasObjectiveAnswer buildObjectiveAnswer markDirty clearDirty recalibrateDeadline`（**跨 4 段**） | **注册监听**：`visibilitychange`(document)、`beforeunload`(window) —— 注册在 `onMounted`@1189-1190 | **是**：`draftNoticeText`@68 |
| **P10** | 截止倒计时调度 | 867–934 | 68 | `MAX_TIMEOUT_MS`@874 ｜ 函数 6：`clearDeadlineTimer`@876 `deadlineTimestamp`@881 `isDeadlineExpired`@889 `armDeadlineTimer`@895 `onDeadlineTick`@905 `recalibrateDeadline`@922 | `endTime` ｜ 写 `deadlineTimer`（P1 声明）｜ 终局回调 `forceSubmitAll`（P11） | 计时器 | **否** |
| **P11** | 提交全部 | 935–1032 | 98 | 函数 2：`forceSubmitAll`@936 `submitAll`@964 | 读 `subQuestions subStatuses answers isPracticeMode currentAttempt submittedAttempts`；写 `subStatuses submittingAll currentAttempt submittedAttempts draftNotice`；调 `startPolling`（P13） | — | **是**：`submitAll`@265,271 ｜ `submittingAll`@263,271 |
| **P12** | 数据加载 | 1033–1108 | 76 | `loadAssignment`@1036 | **写 13 个**：`data allowResubmit endTime isPracticeMode maxAttempts q subQuestions answers editorLangs subStatuses subScores subFeedbacks bestScore submittedAttempts currentAttempt`；**调** `initObjectiveAnswers markObjectiveCorrect armDeadlineTimer startPolling` | — | **否**（由 P14 的 `onMounted` 调） |
| **P13** | 评分轮询 | 1109–1169 | 61 | `pollTimer`@1110 ｜ 函数 3：`startPolling`@1112 `stopPolling`@1117 `pollStatus`@1121 | 读 `subQuestions subStatuses`；写 `subStatuses subScores subFeedbacks bestScore`；**原地改 `subQuestions.value` 内对象的 `referenceAnswer` / `objectiveItems`**@1158-1160 | setInterval(2000) | **否** |
| **P14** | 生命周期 | 1170–1206 | 37 | `onMounted`@1171 `onUnmounted`@1193 | 读 `dirtySet editorRefs editorObserver`；调 `loadAssignment saveAllDrafts ensureEditorObserver stopPolling clearDeadlineTimer` | **全部** | **否** |

**行数闭合核对**：14 段合计 **924 行**（= script 块实测行数 ✔）。非空 834 行，空行 90。

### 1.3 三处「物理位置 ≠ 逻辑归属」的暗礁（实测）

1. **`retryPractice`(:368-402) 反向操作后置声明的编辑器状态**：:394 `for (const key in editorRefs) delete editorRefs[key]`、:395 `editorMounted[key] = false`。`editorRefs`/`editorMounted` 物理声明在 P4(:554-555)，逻辑上属「编辑器」单元。→ **二者必须同批搬移，或把"重置编辑器"作为注入项传给导航单元**；否则 P2 单元要么 import P4 单元、要么产生环。
2. **`isCodeStem`(:664) 物理在 P5「辅助」、逻辑属题干渲染**（模板 :181 `{ 'oi-stem-code': isCodeStem(item.stem) }`）。它只读入参、零响应式依赖 → 归「纯叶子」（§2.2 W1），与 P5 其余 computed 分开。
3. **P5 的 9 个 computed 是「跨领域读」而非「自有状态」**：`submitDisabled`/`practiceAllGraded` 是**提交决策**（P11 的逻辑），`isExpired` 是**倒计时**（P10 的逻辑）。它们物理挤在「辅助」段，但必须与**消费者**同单元，否则会出现「提交→辅助→倒计时」的链式耦合。本方案按消费者归属切（§2.2），**不按横幅整段搬** —— 与 `ruleExecutor-plan.md` §1 同样的偏离理由。

### 1.4 模板可见面实测（拆分的硬边界）

| 类别 | 数量 | 明细（实测行号） |
|---|---|---|
| 模板引用的**本文件顶层名字** | **38** | `allSubmitted allowResubmit answers bestScore contentRef currentAttempt data dirtyCount draftNoticeText editorMounted editorRefs formatItemAnswer getItemKey getNavLabel isExpired isPracticeMode isSqReadonly itemAnswers itemTypeLabel langs materialText maxAttempts multiAnswerBind practiceAllGraded q remainingAttempts safeMaterial safeSqContent setupEditorObserve showMaterial sqHasScore subFeedbacks subQuestions subScores subStatuses submitDisabled totalScored unsubmittedCount` |
| 其中是**函数** | **7** | `formatItemAnswer` `getItemKey` `getNavLabel` `isSqReadonly` `safeSqContent` `setupEditorObserve` `sqHasScore` |
| 事件处理器（`@click/@keydown/@change`） | **9 个函数** | `activateAnchor`(42,59,136,149,171) `scrollTo`(42,59) `onBoxKeydown`(43,60) `toggleCollapse`(27) `formatEditor`(132) `onMultiBindChange`(202) `retryPractice`(248) `submitAll`(265,271) `setupEditorObserve`(147) |
| 模板 **`ref`** | **1** | `contentRef`(:74) |
| 模板内联赋值目标（`v-model`） | **5 处** | `answers[sq.id]`(:139) `itemAnswers[...]`.answer(:186,213,225) `multiAnswerBind[...]`(:199) `editorLangs[sq.id]`(:126) |
| 模板 **ref 回调** | **2 处** | :138 写 `editorRefs[sq.id]`；:147 调 `setupEditorObserve(el, sq.id)` |
| **模板未引用但脚本间强耦合** | 1 | `boxIndex`@483（唯一消费者是 `sqBoxClass`/`activateBoxAt`/`onBoxKeydown`） |

**对拆分的硬含义**：这 38 个名字（含 7 个函数 + 9 个事件处理器）**必须仍能在模板作用域解析**。允许的实现形态见 §2.1。

---

## 2 目标 composable 划分

### 2.1 三条不可协商的形式前提

**(a)「模板零改动」在 `<script setup>` 下的成立条件**：Vue 3 把 `<script setup>` 的**顶层绑定**编译进 `setup()` 的返回对象（`__returned__`），模板渲染函数以 `$setup.xxx` 访问。**composable 的返回值被顶层解构后，与原来直接声明的 ref/函数在模板里语义相同**（ref 解包、函数原样传递）。因此：

- ✅ 允许：`const { data, q, answers, itemAnswers, … } = useAnswerState();`
- ✅ 允许：`const { submitAll, submitDisabled } = useSubmitActions({ … });`
- ❌ 禁止：把状态藏在嵌套对象里（`const s = useAnswerState();` 然后模板写 `s.data`）—— 那要改模板。
- ❌ 禁止：在 composable 里 `export`（`<script setup>` 不允许 `export` 语句，编译直接失败）。

**(b) 单一「接线根」**：全部 composable 在 `<script setup>` 顶层**同步**调用一次，跨 composable 的共享状态**以参数注入**（`useDraftSave({ answers, itemAnswers, … })`），**不做嵌套调用**。理由：① 避免循环依赖（§2.3 实证两处真环）；② 参数表就是可测试的契约面；③ 保证所有 `onMounted/onUnmounted/watch` 都在 setup 同步阶段注册（§3.1-3）。

**(c) 清理集中注册**：`onUnmounted` **只在 .vue 里注册一次**，按原顺序调各 composable 暴露的 `disposeXxx()`。理由见 §3.1-4（Hook 注册顺序 = 执行顺序，集中注册消除顺序依赖）。

### 2.2 函数 → 目标文件对照表（**完整覆盖 53 函数 + 47 声明**）

命名遵循本仓既有约定：`client/src/composables/useXxx.js`，具名导出 + `export default`（对齐 `useConfirm.js` / `useDraftAutosave.js` / `useMonacoTheme.js`）。

| 目标文件 | 单元 | 搬移内容（源行号，逐字） | 搬移行数 | 预估总行数 | 新文件 |
|---|---|---|---|---|---|
| **W1** `client/src/composables/submit/answerFormat.js` | 纯叶子（零响应式、零 import） | `getItemKey`@419 `itemTypeLabel`@342 `itemTypeColor`@404 `itemTypeClass`@412 `formatItemAnswer`@352 `isCodeStem`@664 `isSqAnswered`@421 `BOX_RESULT_TEXT`@497 `boxLabel`@500 | 9 声明 / ≈85 行 | **≈100** | ✅ |
| **W2** `…/submit/useAnswerState.js` | 答案状态所有权 + 段内谓词 | **P1 全部声明** @297-321（22 个）＋ `getNavLabel`@330 `sqHasScore`@347 `getSqResult`@431 `getItemResult`@445 `oiCardClass`@455 `sqBoxClass`@468 `initObjectiveAnswers`@677 `markObjectiveCorrect`@702 `buildObjectiveAnswer`@728 `hasPartialOmissions`@738 `hasObjectiveAnswer`@747 `onMultiBindChange`@670 | 34 声明 / ≈330 行 | **≈360** | ✅ |
| **W3** `…/submit/useQuestionNav.js` | 折叠 / 锚点 / 方块 a11y | `contentRef`@324 `activeAnchor`@325 `collapsedSqs`@326 `boxIndex`@483 `isActiveAnchor`@505 `focusBoxAt`@507 `activateBoxAt`@513 `onBoxKeydown`@523 `toggleCollapse`@539 `scrollTo`@544 `activateAnchor`@549 `retryPractice`@368 | 12 声明 / ≈180 行 | **≈195** | ✅ |
| **W4** `…/submit/useEditorLazyMount.js` | Monaco 懒挂载（**不 import monaco**） | `editorMounted`@554 `editorRefs`@555 `editorObserver`@556 `ensureEditorObserver`@559 `setupEditorObserve`@574 `mountEditor`@581 `formatEditor`@590 ＋ 新增 `resetEditors()`（**仅把 retryPractice:394-395 两行循环原样搬进来**） | 7 声明 + 1 薄函数 / ≈70 行 | **≈85** | ✅ |
| **W5** `…/submit/useDraftSave.js` | 脏标记 + 草稿保存 + 两个全局监听 | `dirtyCount`@327 `dirtySet`@328 `markDirty`@755 `clearDirty`@760 `draftNotice`@768 `draftNoticeText`@769 `getToken`@775 `saveAllDrafts`@779 `saveDebounce`@822 `scheduleSave`@823 `onVisibilityChange`@829 `onBeforeUnload`@840 | 12 声明 / ≈150 行 | **≈165** | ✅ |
| **W6** `…/submit/useCountdown.js` | 截止倒计时 + 强制提交 + 到期门面 | `MAX_TIMEOUT_MS`@874 `clearDeadlineTimer`@876 `deadlineTimestamp`@881 `isDeadlineExpired`@889 `armDeadlineTimer`@895 `onDeadlineTick`@905 `recalibrateDeadline`@922 `forceSubmitAll`@936 ＋ **`isExpired`@602（computed）** | 9 声明 / ≈130 行 | **≈150** | ✅ |
| **W7** `…/submit/useSubmitActions.js` | 提交决策 + 提交全部 | `submitAll`@964 `submittingAll`@317 `submitDisabled`@639 `practiceAllGraded`@650 | 4 声明 / ≈110 行 | **≈130** | ✅ |
| **W8** `…/submit/useAssignmentLoader.js` | 数据加载 + 评分轮询 | `loadAssignment`@1036 `pollTimer`@1110 `startPolling`@1112 `stopPolling`@1117 `pollStatus`@1121 | 5 声明 / ≈140 行 | **≈155** | ✅ |
| **W9** `…/submit/useSubmitPage.js` | **接线根**（唯一被 .vue 调用的入口） | `materialText`@595 `safeMaterial`@599 `remainingAttempts`@604 `totalScored`@621 `unsubmittedCount`@627 `allSubmitted`@636 `safeSqContent`@600 `isSqReadonly`@610 ＋ 组装 W2–W8 ＋ **平移 P14 的 `onMounted`@1171-1191 / `onUnmounted`@1193-1205 两个回调体** | 8 声明 + 2 hook 体 / ≈95 行 | **≈115** | ✅ |
| — | 源文件 `Submit.vue` | `<script setup>` 924 行 → **≈120–150 行**；`<template>` 1–281 与 `<style scoped>` 1208–1519 **逐字节不动** | −≈780 行 | **1519 → ≈745** | — |

**行数闭合核对**：W1≈100 + W2≈360 + W3≈195 + W4≈85 + W5≈165 + W6≈150 + W7≈130 + W8≈155 + W9≈115 ≈ **1455 行**（含每文件 banner / import / JSDoc 开销约 15%），最大文件 W2 ≈360 行 **≪ 800**。

**GodFile 收益与代价**：`Submit.vue` 1519 → **≈745**（≤800 → **超标文件 9 → 8**）；新文件最大 ≈360 行，**全部 <500 → 观察带 18 → 27**。⚠️ **观察带上升是"1 个 1519 行 → 9 个 ≤360 行"的算术必然**，§5 DoD 未禁止，但**必须由 Captain 确认口径**（§9-10）。

**依赖方向（保证无环）**：

```
W1  纯叶子，零依赖
W2 → W1
W3 → W1, W2(只读) ，注入 resetEditors(W4 提供)
W4 → 注入 answers(W2 提供)
W5 → W1, W2(只读)，注入 isSqReadonly(W9) + recalibrateDeadline(W6)
W6 → W1, W2(只读)，自带 forceSubmitAll
W7 → W1, W2(读写)，注入 confirm + startPolling(W8)
W8 → W1, W2(写)，注入 initObjectiveAnswers(W2) + armDeadlineTimer(W6)
W9 → W1..W8 全部（唯一汇聚点）
```

**无环**：`useSubmitPage` 是唯一被 .vue 调用的；其余**互不 import**，跨单元调用一律以**参数注入**发生。

### 2.3 两处真实循环依赖（若不做参数注入必然成环）

1. **W5 ↔ W9**：`saveAllDrafts`(:789) 调 `isSqReadonly`（P5 computed，归 W9），而 W9 又要调 `scheduleSave`。→ 解法：`isSqReadonly` 以**函数参数**注入 W5。
2. **W5 ↔ W6**：`onVisibilityChange`(:835) 调 `recalibrateDeadline`（W6），而 W6 的 `forceSubmitAll` 读 `subStatuses`（W2）。→ 解法：`recalibrateDeadline` 以**回调参数**注入 W5。

### 2.4 本仓既有先例（**均有事实依据**）

| 先例 | 事实 | 对本步的含义 |
|---|---|---|
| `client/src/composables/useConfirm.js`（77 行） | `Submit.vue:291,294` 已 import 并调用；无生命周期/响应式 | **已在用的先例**，形态合规 |
| `client/src/composables/useDraftAutosave.js`（139 行） | :134 `if (getCurrentInstance()) onBeforeUnmount(stop);` —— **本仓已有"composable 内注册生命周期"的先例**；:104-109 已实现 `visibilitychange` 自注册、:130 自移除 | ⚠️ **不要在本步复用它**：其契约是 `{status,lastSavedAt,saveNow,schedule}` + 自有 `status` ref + 自注册监听。Submit.vue 需要的是 `dirtySet/draftNotice/saveAllDrafts` 的**逐题 allSettled + 「跳过草稿」语义识别**，套进去＝改行为（违反 plan §6「同一提交里不改行为」）。**登记为后续独立项** |
| `useMonacoTheme.js` / `useMonacoKeyboardA11y.js` | 由 `components/CodeEditor.vue:22,97` 与 3 个 teacher 视图消费 | 与 W4 无关（W4 只做 IntersectionObserver 懒挂载，**不 import monaco** —— 实测 Submit.vue 全文只在 :1404 的 CSS 里出现 `monaco` 字样） |
| `useTheme.js` / `useSelectAriaSync.js` / `useProjectUpload.js` | `client/src/composables/` 共 7 个文件 916 行，**均 <250 行** | 规模惯例：单 composable ≤250 行 → **W2 ≈360 行略超惯例**。若 Captain 在意，可再拆成 `useAnswerState` + `useObjectiveState`（P7 的 5 个函数 ≈130 行），**但会增加一处状态双写边，不建议在同一提交做** |

---

## 3 ★响应式与生命周期风险逐条判定（本步核心）

> 判定口径：**等价** = 有明确机制论证，无需实测即可接受；**需特殊处理** = 必须遵守指定写法才等价；**不确定需实测** = 静态阅读无法给出确定结论，必须由 C 用行为验证覆盖。

### 3.1 逐条判定表

| # | 问题 | 判定 | 理由与依据 |
|---|---|---|---|
| **1** | **ref/computed 的所有权** | **等价（需特殊处理）** | 模板直接绑定的 38 个名字 = **18 状态 + 12 computed + 7 纯函数 + 1 `ref`**。**所有权必须唯一**：`data q subQuestions allowResubmit endTime showMaterial isPracticeMode maxAttempts currentAttempt submittedAttempts bestScore answers itemAnswers multiAnswerBind subStatuses subScores subFeedbacks editorLangs submittingAll langs`（P1 全部）归 **W2**；**跨 composable 共享一律靠参数注入同一对象引用**（`reactive({})`/`ref()` 是对象，传引用即共享，无拷贝）。`computed` 可自由跨单元（`isExpired` 归 W6 但被模板 :16/:252/:270/:275 与 W9 读，**只读、无所有权问题**）。**唯一风险点是"重复创建"**：若 W3 自己又 `ref('')` 造一个 `activeAnchor`、而 W9 造了另一个，模板会绑到错的那个（**静默失效，不报错**）→ 由 §7.1-4 的硬约束 + C 的 V4（bindings 类型对拍）兜住。**computed 的惰性求值语义不变**（依赖追踪由运行时按访问顺序建立，与声明位置无关）。 |
| **2** | **watch / watchEffect 注册顺序** | **等价，但有一处时序变化（必须登记）** | 全文**只有 1 个 watch**（:1179-1183，`{deep:true}`，源 `() => [answers, itemAnswers, multiAnswerBind]`），注册在 `onMounted` 异步回调 `.then()` 内；**无 `watchEffect`**（实测 grep）。① 该 watch 的源是**函数**，每次求值返回同一组 reactive 对象的**新数组**；`deep:true` 深度遍历 → 与"何时注册"无关，**只与"是否早于第一次变更"有关**。② 搬进 composable 后 W5 在 setup 顶层同步注册 → 注册时刻**早于**原实现（原实现要等 `loadAssignment` 的 HTTP 往返）。③ **这正是既有 e2e 记录的现象**：`tests/ui-redesign-verify/specs/e2e-02-student.spec.mjs` 注释「Submit.vue:1069-1085 —— 草稿 watch 在 loadAssignment().then() 里才安装；页面渲染出 .oi-card 时 watch 可能尚未就绪（过早填写不会 markDirty）。等一拍再填」+ `await page.waitForTimeout(1500)`。→ **搬移会消除这个 1.5s 竞态窗口**：这是"更正确"，但**是改前/改后不同的可观测行为**（若 C 的用例依赖"早填不脏"这个旧行为，会误判）。④ **不依赖"先注册者先执行"的隐含假设**：本文件只有一个 watch，该假设无适用场景。**登记为 C 的必测项 R3/V10**。 |
| **3** | **onMounted / onBeforeUnmount / onActivated** | **等价；但有 1 处已存在的异步注册缺陷（不得顺手修）** | ① **Vue 规则**：`onMounted/onUnmounted` 必须在 setup **同步执行阶段**调用（含 setup 内同步调用的 composable）；在 `await` 之后或异步回调里调用**会失效并告警**。② **全文只有 `onMounted`@1171 与 `onUnmounted`@1193**；**无 `onBeforeUnmount` / `onActivated` / `onDeactivated` / keepAlive**（实测 grep）。③ **实锤的异步注册**：`onMounted` 的回调体本身在 setup 同步阶段执行（合规），但它内部 `loadAssignment().then(() => { draftTimer = setInterval(...)@1174; watch(...)@1179; ensureEditorObserver()@1186 })` 发生在 **`await` 之后**：`draftTimer` 与 `watch` **不依赖组件实例**（本身不违规），但 **watch 的注册被推迟一个 HTTP 往返**（见第 2 条）；且**若组件在请求返回前卸载**，`draftTimer` 会在卸载后被创建 → 30s 轮询 `saveAllDrafts()` **永不清理**（`onUnmounted`@1195 已经跑过）。**这是既有缺陷，plan §6 明令禁止在同一提交里顺手修** → 搬移时**逐字保留这个时序**（W9 里仍是 `loadAssignment().then(...)` 结构），把「组件已卸载」登记为后续独立项（建议后续加 `disposed` 哨兵）。④ 搬进 composable 的等价性：**只要 composable 在 setup 同步阶段被调用**（本方案保证），`onMounted/onUnmounted` 注册与写在 .vue 顶层**完全等价**（同一组件实例的 Hook 队列）。本仓 `useDraftAutosave.js:134` 的 `if (getCurrentInstance()) onBeforeUnmount(stop)` 就是既有先例。 |
| **4** | **计时器与副作用清理** | **需特殊处理（清理顺序强制）** | 全文 **4 个计时器 + 1 个 observer + 2 个全局监听**：`draftTimer`(setInterval 30s, :1174) / `saveDebounce`(setTimeout 1.5s, :825) / `deadlineTimer`(setTimeout，钳制 2^31-1，:901,911,915,928) / `pollTimer`(setInterval 2s, :1114) / `editorObserver`(IntersectionObserver, :561) / `visibilitychange`(:1189) / `beforeunload`(:1190)。**清理顺序（必须逐字保持）**：`onUnmounted` = `stopPolling` → `clearInterval(draftTimer)` → `clearTimeout(saveDebounce)` → `clearDeadlineTimer` → `removeEventListener(visibilitychange)` → `removeEventListener(beforeunload)` → `saveAllDrafts()`（**不 await**，:1201）→ `dispose` 全部 `editorRefs` → `editorObserver.disconnect()`。**风险点**：Vue 的 Hook 按**注册顺序**执行；若让 W5/W6/W8 各自 `onUnmounted`，清理顺序就退化为依赖「composable 调用顺序」（脆弱，且一旦有人重排接线就静默改变）→ **铁律：`onUnmounted` 只在 .vue 注册一次，按上面 9 步顺序调各 disposer**（§2.1(c)）。**另一处必须保持**：`onVisibilityChange` 的 `hidden` 分支 :831-832 是 `clearTimeout(saveDebounce); saveAllDrafts();` **两次调用**（不是"排程"），**不得改写为 `scheduleSave()`**；且**不得让 W5 自注册第二个 `visibilitychange`**（`useDraftAutosave` 的形态就是自注册 —— 照抄它会变成两个监听、两次保存请求）。`deadlineTimer` 的 `MAX_TIMEOUT_MS` 钳制 + 回调内重算 + 到期二次校验（:889-919）**必须整块搬移**，任何拆分会破坏「时钟跳变/回绕不误提交」的保证。 |
| **5** | **路由 / 仓储 / store 的注入** | **等价** | ① **无 Pinia**（实测全文无 `useXxxStore`；`client/src/composables/` 也无 store）。② `useRoute()` **只在 :293 调用一次**，`route` 被 7 处使用：:378（retry POST）、:781（saveAllDrafts）、:842（onBeforeUnload）、:945（forceSubmitAll）、:1014（submitAll）、:1037（load GET）、:1123（poll GET）。**`route.params.id` 全部在函数体内按调用时刻读取**（无一处提前解构成普通变量）→ 搬进 composable 后仍在**同一 setup 上下文**调用 `useRoute()`（或由 .vue 把 `route` 注入），**响应式订阅与取值时刻不变**。③ 例外需登记：若 B 图省事写成 `const id = route.params.id` 提到模块级 → **丢失响应式**（路由参数变化不更新）。本页当前靠**路由重建组件**（`client/src/router/index.js:52` `assignments/:id` → 组件级 `import()`），实际不会踩到，但**必须逐字保留 `route.params.id` 的读取位置**（§7.1-6）。④ `request`（axios 实例）与 `DOMPurify` **无响应式语义**，注入或直接 import 等价（本仓既有 composable 直接 import 依赖的先例：`useConfirm.js:1` import `Modal`）。⑤ `useConfirm()` 必须在 .vue 顶层调一次并把 `confirm` 注入 W3/W7（**不能在两个 composable 里各调一次**：会创建两个 `Modal.confirm` 包装 —— 虽当前实现无共享状态，但属"改动可观测面"，且违反"只搬不改"）。 |
| **6** | **Monaco 懒挂载** | **等价（挂载次数不变量需实测）** | ① **Submit.vue 不 import monaco**（实测：全文只在 :1404 的 CSS 选择器 `.sq-editor-wrap :deep(.monaco-editor)` 出现 `monaco` 字样）。编辑器实例由 `client/src/components/CodeEditor.vue`（298 行，:283 `defineExpose({ format })`）持有，其 :109 `monaco = await loader.init()` / :137 `editor?.dispose()` 全在组件内。**W4 不碰它**。② 挂载路径的三条不变量（必须逐字保留）：**(i)** `editorMounted[sqId]` 是唯一闸门（:582 `if (!editorMounted[sqId])`）；**(ii)** `ensureEditorObserver()` **惰性 + 幂等**（:560 `if (editorObserver) return;`）；**(iii)** `setupEditorObserve` **先写 `el._sqId` 再 observe**（:576，注释记录了 V5 首帧竞态修复的历史）。③ 销毁路径：`onUnmounted` 遍历 `Object.values(editorRefs)` 调 `ref?.dispose?.()` → CodeEditor 的 `dispose` → `editor?.dispose()`；`editorRefs` 是 reactive 对象，**搬移后仍是同一对象引用**（由 W4 返回、W9 传给 .vue、.vue 再传给模板），故 :1203 的遍历**看到同一批实例**。④ **模板 ref 回调在卸载时传 `null`，而 :138 的 `(el) => { if (el) editorRefs[sq.id] = el; }` 会跳过清理** → `editorRefs` 在卸载瞬间**仍持有活实例**，这正是 :1203 能 dispose 成功的前提（**必须逐字保留这个 `if` 守卫**；若 B "顺手"补成 `else delete`，dispose 会全部落空 → **Monaco 泄漏，且像素/交互短测都可能不报**）。⑤ `mountEditor`(:581) 在 IntersectionObserver 回调里 `nextTick(() => { if (!answers[sqId]) answers[sqId] = '' })` —— `nextTick` 在任何上下文可用（不依赖实例），搬移等价。**不确定项**：`IntersectionObserver` 在首帧前 vs 首帧后创建，是否影响"首屏可见的编程题是否已挂载"的时序 → 归 C（V11 挂载计数不变量）。 |

### 3.2 「不确定需实测」清单（交给 C，**共 6 条**）

| 编号 | 不确定点 | 为什么我判不了 | C 的最小探针 |
|---|---|---|---|
| **U1** | **watch 注册时刻提前**产生的可观测差异 | 静态可推「注册更早」，但**无法判断是否影响任何真实用例**（例如首屏渲染期间是否发生静默 markDirty → 多一次 `PUT /draft`） | 把 `GET /api/student/assignments/:id` 人为延迟 3s，于 t=0.5s 写入答案 → 断言**改前不脏、改后变脏**（如实记录差异，"改善"还是"回归"由 Captain 拍板） |
| **U2** | **编辑器挂载次数不变量** | 需要真实 IntersectionObserver + Monaco 加载才能计数；静态只能证明三条闸门存在 | 探针：`window.__monacoCreateCount`（在 /tmp 的 CodeEditor 副本里注入，**不改仓库**）→ 断言最终 = 编程题数量，滚动往返后**不再增加** |
| **U3** | **卸载期资源清理完整性** | 静态可列清单，但"是否真的没有残留 interval/监听"必须运行时观测 | 探针：卸载前 monkey-patch `setInterval/setTimeout/addEventListener/removeEventListener` 计数 → 卸载后断言全部归零；并断言卸载后**无新增 `/draft` 请求**（即 §3.1-3 的既有缺陷窗口） |
| **U4** | **卸载瞬间的 Monaco dispose** | `editorRefs` 是否仍持有实例取决于模板 ref 回调时序，静态不可证 | 探针：卸载后断言 `monaco.editor.getModels().length === 0`（或 CodeEditor 的 dispose 计数），且**页面无 "model disposed" 类报错** |
| **U5** | **多选双向绑定 + 脏标记链路** | `v-model:value="multiAnswerBind[k]"` 触发 `update:value` → 再靠 `@change="onMultiBindChange"` 写回 `itemAnswers[k].answer`；**antd `a-checkbox-group` 的 `change` 与 `update:value` 的先后顺序**属运行时事件顺序，静态阅读不可判 | 断言：勾选 2 个选项 → `itemAnswers[k].answer` 为 `"A,C"` 形态 → 1.5s 内出现 **1 次** `PUT /draft` 且 body 含该 answer；再断言 `.dirty-hint` 出现后消失 |
| **U6** | **`onDeadlineTick` 的边界重试分支**（:914-916 `!isDeadlineExpired()` → 1000ms 重试）与 **>2^31-1 长窗口不误提交** | 需要时钟可控 + 观察是否产生 `force:true` 请求 | ① `endTime = now + 800ms` → 断言到点后**恰好 1 次** `POST /submit` 且 body `force:true`；② `endTime = now + 30d`（复用既有 `legacyOverflow` 夹具）→ 断言打开页面后 3s 内**零** `/submit` 请求（P-1 修复的回归门） |

> **判定说明**：U1–U6 属「静态阅读无法排除」的类，**不是"我猜有问题"**。U3/U4 描述的既有缺陷（异步注册的 `draftTimer` 泄漏窗口、依赖 `if` 守卫的 dispose）**在改前就存在**；C 的职责是**证明它们"照旧存在且没有被放大"**，不是修它们。

---

## 4 ★护航配方（client 现实 + 可执行交互验证）

### 4.1 事实核查（本轮实测，**不采信历史报告**）

| 问题 | 实测结论 | 证据 |
|---|---|---|
| client 侧有多少单测？ | **0**。`client/` 下没有任何 `*.test.*` / `*.spec.*`；`git ls-files client | grep -Ei 'test|spec|vitest|jest|e2e|playwright'` **无输出**（exit 1） | `client/package.json` 的 scripts 只有 `dev/build/preview`，**无 vitest / jest / test 脚本** |
| 有可用的 E2E / 浏览器驱动装置吗？ | **有，且相当完整**。`client/node_modules/@playwright/test@1.60.0` + `playwright@1.60.0` 就位；浏览器缓存 `~/Library/Caches/ms-playwright/` 有 `chromium-1223`（+1217 / headless shell / firefox / webkit） | `node -e "require('./client/node_modules/@playwright/test/package.json').version"` |
| 既有 E2E 套件 | `tests/ui-redesign-verify/`：`specs/` + 配置共 **1762 行**（`specs/e2e-02-student.spec.mjs` 221 行 / `specs/helpers-e2e.mjs` 177 行 / `playwright.rig.config.mjs` 30 行） | `wc -l tests/ui-redesign-verify/specs/*.mjs` |
| 既有套件**已覆盖** Submit.vue 的哪些交互 | `e2e-02-student.spec.mjs`：**T3-02-2** 草稿自动保存（填答 → 等 `PUT /draft` → 断言 body 含答案 → 断言 `.sync-ok` 文案 → **刷新后内容仍在**）；**T3-02-3** 提交全部（确认框 → 等 `POST /submit` 200 → `.ant-message-success` → `.sq-header` 状态标签）；**T3-02-6** 长窗口 >24.86 天缺陷复现 | 逐行读了该 spec（:1-221） |
| 既有套件**没有覆盖**的 | **① 截止倒计时到点强制提交（`force:true`）② 题号方块键盘导航（`onBoxKeydown` / 焦点跟随 / `aria-current`）③ 多选双向绑定 ④ 卸载期清理与 Monaco dispose ⑤ 编辑器懒挂载次数** | 对 `onBoxKeydown` / `forceSubmitAll` / `multi_choice` 在 `specs/` 下 grep **零命中** |
| axe 可用吗？ | ❌ **当前不可用**。`axe-core` 在 `client/node_modules`、根 `node_modules`、`tests/ui-redesign-verify/node_modules` **均不存在**；历史上靠 `/tmp/t5-tools/node_modules/axe-core/axe.min.js`（`artifacts/T5-a11y.mjs:15` 的 `T5_AXE` 指向它），而 **`/tmp/t5-tools` 已被清理**。在「禁止联网、不得 npm install」下**本轮无法恢复 axe** | 三处 `find` 均无命中 |
| 端口 / 服务现状 | `:3000 :3100 :3110 :3111 :5173` **全部无监听**（无残留服务）；本机 **MySQL 在 :3306 监听**（`lsof` 有响应），`server/.env` 的库为 `/exam_system` | `lsof -nP -iTCP -sTCP:LISTEN` |

### 4.2 ★两道装置闸门（**必须先由 Captain 解决，否则本步的 client 验证无法执行**）

| # | 闸门 | 实测事实 | 需要谁决定 |
|---|---|---|---|
| **G-A** | **E2E rig 指向另一棵树** | `tests/ui-redesign-verify/rig.sh:9` 默认 `CLIENT_DIR="$UIWT/client"`，其中 `UIWT=/Users/…/Exam-DeepSeek-ui`（**另一个 git worktree，分支 `feat/ui-redesign`@`19abe80`**，非 master；主仓库在 `2c9e3d9`）。而 `scripts/gates/pixel-diff.mjs` 用的是**主仓库活树**。→ 同一个"改后"状态，**两个装置测的不是同一份代码** | Captain：E2E 用 `CLIENT_DIR=<主仓库>/client` 还是先同步 `-ui` 工作树？（**若沿用默认，E2E 结果对 master 上的拆分为零证据力**） |
| **G-B** | **像素门禁对 Submit.vue 是盲区 + 夹具缺口** | 默认 6 区域全走 `/exam/teacher/classes`；`FIXTURE_USER`（`pixel-diff.mjs:102`）是 **teacher**，`FIXTURES`（:114-118）只有 3 条 **teacher 端点**，**无任何 `/api/student/**`**。报告 §7 已给出 `--regions` 模板与「必须补 FIXTURES」的提示；而 **C 按约束是只读的 → 补夹具不是 C 的活** | Captain：由谁给 `pixel-diff.mjs` 补 student 夹具（`FIXTURE_USER.role='student'` + `/api/student/assignments/:id` 等）？**不补 → 学生路由会 exit 2 并点名漏网 API（不会假绿）** |

### 4.3 交互验证配方（四层，成本逐层标注）

**L0 · 逐字搬移的静态判等（成本 ≈ 10 分钟，零依赖，★最强判据）**

1. **三块字节相等**（直接证明"模板与样式一行不动"）：

```bash
cd "<repo>"
ANCHOR=2c9e3d9   # C 执行前重新 git rev-parse HEAD
mkdir -p /tmp/c1a/before
git archive "$ANCHOR" client/src/views/student/Submit.vue | tar -x -C /tmp/c1a/before
B=/tmp/c1a/before/client/src/views/student/Submit.vue
awk 'NR>=1&&NR<=281'    "$B" > /tmp/c1a/b.template
awk 'NR>=1208&&NR<=1519' "$B" > /tmp/c1a/b.style
awk 'NR>=1&&NR<=281'    client/src/views/student/Submit.vue > /tmp/c1a/a.template
awk 'NR>=1208&&NR<=1519' client/src/views/student/Submit.vue > /tmp/c1a/a.style
cmp /tmp/c1a/b.template /tmp/c1a/a.template && cmp /tmp/c1a/b.style /tmp/c1a/a.style && echo TEMPLATE_STYLE_BYTE_IDENTICAL
```

⚠️ **不要用 `git diff` 判"模板是否被动过"**：script 被替换后 diff 会是"整段重写"，人眼无法判。**必须切片比字节**。

2. **每个搬移块 sha256**（覆盖"函数体是否被改写"）：从改前文件按 §2.2 的行号区间切块 → 从改后 composable 切同名块 → 逐块 `shasum -a 256` 对拍。期望：W1 的 9 块 + W2 的 34 块 + … + W9 的 8 块**全部相等**（允许差异白名单：banner / import / `export` / W4 的 `resetEditors` 包装 / W9 的 hook 体缩进）。
3. **模板↔样式类名闭合**（防"类名漂移导致样式失效"）：提取模板 `class` 字面量 ∪ script 里 `oiCardClass/sqBoxClass/itemTypeClass/itemTypeColor` 的返回键 → 与 `<style scoped>` 选择器求差；**改前改后差集必须相同**（模板字节相同，此步实为"防 B 顺手改样式"，成本极低）。

**L1 · 渲染函数 / bindings 对拍（成本 ≈ 20–40 分钟，★本步最锋利的机器判据）**

原理：`<script setup>` 的内容**不进入**渲染函数文本；模板编译产物只依赖「模板 + 编译器版本 + scoped id」。因此**模板零改动 ⟹ 模板编译产物应逐字节相同**（scoped id = `hash(相对路径 + 内容)`，本仓不动路径、不动 style 块）。

做法（**不落任何仓库文件**，全部 `/tmp`）：

```bash
mkdir -p /tmp/c1a/render && cd "<repo>/client"
node -e '
const fs=require("fs"),crypto=require("crypto");
const {parse,compileScript,compileTemplate}=require("@vue/compiler-sfc");
for (const [tag,file] of [["before","/tmp/c1a/before/client/src/views/student/Submit.vue"],["after","client/src/views/student/Submit.vue"]]) {
  const src=fs.readFileSync(file,"utf8");
  const {descriptor}=parse(src,{filename:"Submit.vue"});
  const id=crypto.createHash("sha256").update(src).digest("hex").slice(0,8);
  const s=compileScript(descriptor,{id});
  const t=compileTemplate({source:descriptor.template.content,filename:"Submit.vue",id,scoped:true});
  fs.writeFileSync("/tmp/c1a/render/"+tag+".bindings.json",JSON.stringify(s.bindings,null,2));
  fs.writeFileSync("/tmp/c1a/render/"+tag+".tpl.js",t.code);
}
'
diff /tmp/c1a/render/before.bindings.json /tmp/c1a/render/after.bindings.json && echo BINDINGS_EQUAL
diff /tmp/c1a/render/before.tpl.js       /tmp/c1a/render/after.tpl.js       && echo TEMPLATE_COMPILE_EQUAL
```

判据（**两条**）：

- **① `bindings` 键集合 + 值类型相等**。`bindings` 是"模板能解析到的名字"的**精确权威清单**（`setup-ref` / `setup-const` / `setup-maybe-ref` / `setup-let` / `props` …）→ 直接证明 §1.4 的 38 个名字**一个都没丢**；**类型也必须相同**（`setup-ref` 不能退化成 `setup-const`，否则模板里会丢 ref 自动解包）。
- **② 模板块 `compileTemplate` 输出逐字节相等** —— 与 script 完全无关，是"模板零改动"的第二重机器证明。
- ⚠️ **不要对拍整个 `compileScript().content`**：script 换了，整份输出必然不同。只对拍 `bindings` + 模板编译产物。

**L2 · 交互行为 Playwright 套件**

**装置选择（按优先级）**：

1. **首选：真后端 rig**（`tests/ui-redesign-verify/rig.sh` + `playwright.rig.config.mjs`，baseURL `:3100`）—— 唯一能测「倒计时到点 → 强制提交」的装置（需真实 `endTime` 与真实 `POST /submit`）。**前提**：解决 G-A + MySQL/测试库可用 + 一次性 `CLIENT_DIR=<主仓库>/client ./rig.sh build`（**私有 dist，不碰 `client/dist`**）+ `./rig.sh start`（`:3100`）+ 用后 `./rig.sh stop`。
2. **次选：pixel-diff 式静态夹具 + playwright（无后端）** —— 复用 `scripts/gates/pixel-diff.mjs` 的内建夹具服务（`:31xx`，`/api` 由夹具表应答）。优点：快、稳、不碰 DB。**局限**：静态应答**测不了"刷新后草稿仍在"（无状态）与"到点强制提交"（无真实时间语义）**，只能测**请求行为**（方法 / URL / body / 时序）。
3. **不选**：任何改动 `tests/` 的方案（constraints §1）。

**用例清单（新增 6 条 + 复用 2 条）**：

| id | 场景 | 关键断言（**改前必须同样通过**） | 装置 | 估价 |
|---|---|---|---|---|
| N1 | **题号方块键盘导航** | 聚焦第 1 个 `.n-box` → `ArrowRight` → `document.activeElement` 是第 2 个且 `aria-current="true"`；`ArrowLeft` 回第 1；Enter 触发"展开 + 滚动 + 聚焦"（`collapsedSqs` 折叠态被清除）。**勿断言 Home/End**（代码未实现） | 静态夹具 | ≈25 min |
| N2 | **多选双向绑定**（U5） | 勾 2 项 → `itemAnswers[getItemKey]` 的 `answer` 为 `"A,C"` 形态 → `.dirty-hint` 出现（`dirtyCount` 自增）→ 1.5s 内 **1 次** `PUT /draft` body 含该 answer → `.sync-ok` 恢复 | 需**新夹具**（含 `multi_choice` 小问） | ≈30 min |
| N3 | **倒计时到点强制提交**（U6，**仅装置 1**） | `endTime = now + 800ms` → 到点后**恰好 1 次** `POST /submit` 且 `force:true` → `Modal.info`「考试时间已截止」可见 | 真后端 rig | ≈40 min |
| N4 | **长窗口不误提交**（U6 / P-1 回归门） | `endTime = now + 30d` → 打开页面 3s 内**零** `/submit` 请求；`.ended-hint` 不可见 | 真后端 rig（复用 `legacyOverflow` 夹具） | ≈15 min（既有 T3-02-6 可改造） |
| N5 | **卸载清理 + Monaco dispose**（U3/U4） | 卸载前 monkey-patch 计数 → 路由离开后：interval/timeout 归零、`visibilitychange`/`beforeunload` 监听归零、**无新增 `/draft` 请求**、`monaco.editor.getModels().length === 0` | 真后端 rig | ≈35 min |
| R3 | **首屏脏标记时序**（U1） | 人为延迟 `GET /api/student/assignments/:id` 3s → t=0.5s 填答 → 记录「是否出现 `.dirty-hint`」；**改前=否、改后=是** → 作为**已登记的行为差异**交 Captain 判 | 静态夹具（`page.route` 延迟） | ≈20 min |
| R1 | 复用 `T3-02-2` 草稿保存 + **刷新恢复** | 原样跑，**改前必须绿**（"草稿语义不变"的最强证据） | 真后端 rig | 0（现成） |
| R2 | 复用 `T3-02-3` 提交全部 | 原样跑 | 真后端 rig | 0（现成） |

**成本合计（诚实估算）**：

- **一次性装置准备**（G-A 决策 + rig build ≈22s + 首次跑通登录/夹具）≈ **60–90 分钟**（含踩坑）。
- **写用例**：N1 + N2 + N3 + N4 + N5 + R3 ≈ **165 分钟**（约 2.5–3 小时）。
- **每次执行**：rig 模式 **≈2–4 分钟**（8 条用例，串行 `workers=1`，含登录与刷新）；静态夹具模式 **≈90 秒/条**。**改前/改后各跑一遍 → ×2**。
- **像素门禁**：默认 6 区域整跑 **≈100 s**（报告 §8）；加 2 个学生区域（light/dark）后 **≈110–120 s**，**需先补 student 夹具（G-B）**。
- **L0 + L1 静态判等**：**≈30 分钟**（一次性，脚本可复用）。
- **总计**：**首次落地 ≈ 5–7 小时**；之后每个 client 拆分步复跑 **≈ 15–25 分钟**。

**结论（成本-收益）**：**L0 + L1 必做**（30 分钟换来"逐字搬移 + 模板零改动"的机器证明，性价比极高）；L2 中 **R1/R2/N4 必做**（现成或近乎现成），**N1/N2 强烈建议**（覆盖模板里两块最复杂的交互），**N3/N5/R3 视 G-A 决策决定**。

### 4.4 ★像素门禁的能力边界（必须写进 C 的验证边界）

> **像素门禁只能证明「静态渲染不变」，不能证明「交互行为不变」。**

依据（`docs/split/pixel-gate-report.md` §5「已知局限」逐条）：

1. **纯静态像素**（§5-3）：抓不到交互时序、键盘可达性 / 焦点顺序、ARIA 语义、请求行为、控制台报错、性能。**「像素全等 ≠ 功能无回归」是报告原文。**
2. **只截静止态**（§5-4）：动画 / 过渡 / 轮询中间帧被 `reducedMotion` + `animations:'disabled'` **主动压掉**。→ Submit.vue 的 `<Transition name="collapse">`(:80)、`.spinner-dot`、**2s 评分轮询**的中间态**全在盲区**。
3. **夹具数据 ≠ 真实数据**（§5-2）：固定夹具不覆盖长文本换行、空态、异常态、分页。→ `isExpired` 态、`practiceAllGraded` 态、`draftNoticeText` 文案态**都需专门夹具才能进画面**。
4. **默认区域是盲区**（§5-1）：必须 `--regions` 补学生路由；且**区域缺失 = exit 2 硬失败**（§5-7），不会静默跳过。
5. **不覆盖登录 / 鉴权链路**（§5-5）：token 由 `addInitScript` 直接种入。→ 若拆分碰到路由守卫会看不见（本步不碰）。
6. **它根本不是为 script 拆分设计的**：模板零改动时，**像素相等是"必然"而非"证据"**。真正的证据在 L0（字节切片）+ L1（bindings / 模板编译产物）+ L2（交互套件）。

**因此 C 的验证边界（写进 `Submit.vue-verify.md`）**：

- ✅ 像素门禁（`--regions` 含学生路由）= **必要条件**（证明静态渲染与 DOM 结构未变）
- ❌ 像素门禁 **不构成** 交互行为正确性的证据
- ✅ 交互行为的证据只能来自 L2（Playwright 断言请求 / 焦点 / 请求体）与 L0 / L1（静态等价）
- ❌ **axe 本轮不可用**（§4.1 实测）：DoD 第 5 条的「axe 不引入新违规」**当前无法执行**。**替代口径**（三选一，请 Captain 定）：**(a)** 用 `tests/ui-redesign-verify/b2-contrast/lib/measure.js`（纯 DOM 计算对比度，无需第三方包）做**对比度回归**；**(b)** 用 `page.accessibility.snapshot()`（Playwright 内建）做 **ARIA / 可访问名称树对拍**（改前 vs 改后逐节点相等）；**(c)** 显式登记「本步 axe 未执行」并接受该盲区。**A 建议 (b)**：本步模板零改动 → ARIA 树**应当逐节点相等**，这是**比 axe 更强**的判据（axe 只报违规，不报"名字变了"）。


---

## 5 风险分级（每个搬移单元）

维度权重：**响应式耦合 / 生命周期 / 测试覆盖 / 交互复杂度**。

| # | 单元 | 等级 | 理由（四维逐条） |
|---|---|---|---|
| R1 | **W1 `answerFormat.js`**（9 纯函数） | **低** | 响应式耦合 **0**（无 ref/computed，只读入参）；生命周期 **0**；测试覆盖 **0**（client 零单测），但**纯函数可被 L0 字节判等完全覆盖**；交互复杂度 低（被 7 处模板/脚本调用，都是纯格式化）。**唯一注意**：`boxLabel` 依赖 `BOX_RESULT_TEXT`，二者必须同文件同批。 |
| R2 | **W2 `useAnswerState.js`**（34 声明，≈360 行） | **中** | 响应式耦合 **最高**（7 个 reactive + 11 个 ref 的所有权都在此，模板 18 个名字直绑）；生命周期 **0**（无 hook）；测试覆盖 **0**；交互复杂度 中（`initObjectiveAnswers`/`markObjectiveCorrect` 是"答案正确性"的唯一实现，被加载与轮询两条路径复用）。**风险集中在"所有权重复创建"（§3.1-1）与"逐字搬移的边界行"**。 |
| R3 | **W3 `useQuestionNav.js`**（12 声明） | **中** | 响应式耦合 中（读 `subQuestions subStatuses subScores isPracticeMode activeAnchor collapsedSqs`）；生命周期 **0**；测试覆盖 **0**（键盘导航零覆盖，§4.1）；交互复杂度 **高**（`focusBoxAt` 直接 `document.querySelectorAll('.n-box')`、`scrollTo` 用 `scrollIntoView({behavior:'smooth'})`、`activateBoxAt` 里 `nextTick` 后聚焦；**焦点顺序是像素与快照都看不见的**）。**必须配 N1**。 |
| R4 | **W4 `useEditorLazyMount.js`**（7 声明 + 1 薄函数） | **中**（原拟高，此处下调并说明） | 响应式耦合 低（3 个自有对象 + 写 `answers`）；生命周期 **中**（observer 在异步回调里创建；dispose 依赖模板 ref 的 `if (el)` 守卫）；测试覆盖 **0**（U2/U4 无现成用例）；交互复杂度 中。**下调理由**：W4 **完全不碰 monaco**（实例在 CodeEditor 内），本步既不改 CodeEditor 也不改模板，所以"挂载一次"的三条闸门**只需逐字保留**即成立；真出问题也只呈"懒挂载失效 → 编辑器不出现"这种**剧烈可见**形态（不是静默数值错误）。**仍必须配 N5**。 |
| R5 | **W5 `useDraftSave.js`**（12 声明） | **高** | 响应式耦合 中（自有 `dirtySet/dirtyCount/draftNotice`，读 W2 的 3 个 reactive）；生命周期 **高**（`visibilitychange` + `beforeunload` 两个**全局**监听，注册在 `onMounted`、注销在 `onUnmounted`，**且 `onVisibilityChange` 与 `recalibrateDeadline` 双向耦合**）；测试覆盖 **中**（R1 现成，但**不覆盖 beforeunload/keepalive、不覆盖「跳过草稿」D3 语义、不覆盖失败保留脏标记**）；交互复杂度 高（防抖 1.5s + 定时 30s + 全成功才清脏 + `Promise.allSettled` 逐条成败）。**这是"用户数据丢失"面：业务后果最高**。 |
| R6 | **W6 `useCountdown.js`**（9 声明） | **高** | 响应式耦合 中（`endTime` 进、`isExpired` 出）；生命周期 **高**（`setTimeout` 的钳制 / 重武装 / 二次校验三段式，跨后台节流与时钟跳变）；测试覆盖 **0**（既有 T3-02-6 只测"长窗口不误提交"的**缺陷复现**，**没有正向的"到点强制提交"用例**）；交互复杂度 **高**（终局动作是"静默批量 POST + Modal.info"，无中间反馈）。**失败后果最严重**：误提交 = 学生答案被强制锁定。 |
| R7 | **W7 `useSubmitActions.js`**（4 声明） | **中** | 响应式耦合 中（读 6 个、写 5 个状态）；生命周期 低（无 hook）；测试覆盖 **中**（R2 现成覆盖主路径）；交互复杂度 高（`confirm` 的 4 种文案分支 + `isUnfinished` 判定 + `allSettled` 后按成败分支 + 成功后 `startPolling`）。**关键点**：`submitDisabled`/`practiceAllGraded` 是**从 P5「辅助」段挪进来的**（§1.3 暗礁 3），挪动即"逻辑归属变更"，须重点核对。 |
| R8 | **W8 `useAssignmentLoader.js`**（5 声明） | **中高** | 响应式耦合 **最高**（单函数写 13 个状态对象）；生命周期 中（`setInterval` 轮询 + `stopPolling` 幂等）；测试覆盖 **中**（R1/R2 必经此路径）；交互复杂度 **高**（**它是全页副作用的编排者**：`armDeadlineTimer` + `startPolling` 都在它内部，**时序即业务语义**）。**判中高而非高**：它是"被其余单元消费"的一端，改动面清晰；但**任何一行顺序错位都会同时破坏倒计时与轮询**。 |
| R9 | **W9 `useSubmitPage.js` + `.vue` 接线** | **高（唯一硬失败点）** | ① **38 个模板名字必须一个不漏地出现在 .vue 顶层解构里** —— 少一个 → 渲染期报 `Property "x" was accessed during render but is not defined`（**响亮**），或少见地静默 `undefined`；② `onMounted`/`onUnmounted` **只能在这里注册一次**，且清理顺序 9 步不能变（§3.1-4）；③ 它是唯一 import 全部 W1–W8 的模块，**任何参数注入写错都在这里暴露**。**建议：B 完成后立刻做一次 L1 的 `bindings` 对拍（一条命令即可确认 38 个名字全在）**。 |
| R10 | **删除 `Submit.vue` 的 script 内联实现** | **高** | 一步同时影响：模板 38 个名字、9 个事件处理器、`useConfirm`、`request`、`DOMPurify`、`CodeEditor` 组件引用。**回滚粒度必须 = 单提交**，且**必须最后做**（§6 / §7.3 顺序）。 |
| R11 | **GodFile 9 → 8 / 观察带 18 → 27** | **低（需 Captain 确认口径）** | 超标文件下降是 DoD 想要的；观察带**上升**是"1 个 1519 行 → 9 个 ≤360 行"的算术必然。`docs/split/status.md:11` 记录的基线是「GodFile 9 / 观察带 18」，本步后应变 **8 / 27** —— **需在提交后刷新基线（P1-4）**，否则 `arch-metrics` 会把改善误判为劣化。 |

**顺序建议（给 B）**：W1 → W4 → W2 → W3 → W5 → W6 → W8 → W7 → **W9 + 接线**（先只加不删，跑一次 L1 `bindings` 对拍）→ **最后**删除 .vue 里的内联实现。

---

## 6 落地顺序建议（分批，每批独立可交付且各自满足 §5 DoD）

**为什么必须分批**：一次性抽 9 个文件 = 一次性改动 924 行里的 900 行 + 模板 38 个名字的解析面；**任何一处出错都无法定位是哪一批的哪一行**；而 §5 DoD 的每条判据（像素 / 交互）都是**整页级**的，无法区分批次内错误。分批让"改前 vs 改后"的对照始终是**上一批的绿状态**。

| 批 | 内容 | 搬移行数 | 收益 | 新增文件 | 组件内新 hook / 行为变化 | 本批必须额外做的验证 |
|---|---|---|---|---|---|---|
| **B1** | **纯叶子**：新建 **W1**；.vue 里 `import { … } from '../../composables/submit/answerFormat.js'`，删除 **P2 的 6 个纯函数**（`itemTypeLabel`/`itemTypeColor`/`itemTypeClass`/`getItemKey`/`formatItemAnswer`/`isSqAnswered`）+ **`isCodeStem`** + **P3 的 `boxLabel`/`BOX_RESULT_TEXT`**（共 9 声明） | ≈85 | script **924 → ≈840** | 1 | **零**（无 ref / computed / hook / watch / 计时器） | L0（9 块 sha256）+ L1（bindings 名字与**类型**不变：这 9 个全是 `setup-const`）+ 模板字节相等（C1） |
| **B2** | **编辑器 + 导航**：新建 **W4**、**W3**（注入 `resetEditors`）；.vue 接线 `contentRef/activeAnchor/collapsedSqs/boxIndex` 等 12 声明 + 导航 11 函数 + 编辑器 7 声明 | ≈265 | script **≈840 → ≈575** | 2 | 零 hook；`retryPractice` 的 :394-395 改为调 `resetEditors()`（**函数体两行原样搬**） | L0 + L1 + **L2-N1（键盘导航）** + 手工验证 `retryPractice` 后编辑器能重新挂载（或 N5 的挂载计数） |
| **B3** | **答案状态 + 草稿**：新建 **W2**、**W5**（注入 `isSqReadonly`、`recalibrateDeadline`）；.vue 接线 P1 全部 + P6 + P7 + P8 + P9 | ≈480 | script **≈575 → ≈300** | 2 | **watch 迁移**：:1179-1183 的 watch 移入 W5（**即 U1：注册时刻提前**）；`visibilitychange/beforeunload` 的**注册仍在 .vue 的 onMounted**，W5 只提供函数 | L0 + L1 + **L2-R1（草稿保存 + 刷新恢复，逐字节对拍 `PUT /draft` body）** + **L2-N2（多选）** + **R3（U1 时序差异登记）** |
| **B4** | **倒计时 + 加载 + 轮询 + 提交 + 接线根**：新建 **W6**、**W8**、**W7**、**W9**；.vue 只留 `useRoute/useConfirm/useSubmitPage` 解构 + `onMounted/onUnmounted` | ≈480 | script **≈300 → ≈120–150**；**文件 1519 → ≈745** | 4 | `onMounted/onUnmounted` 的**回调体整体平移**进 W9（**框架仍在 .vue 注册**，或整体进 W9 —— 二者等价，但**只能选一种**） | L0 + L1 + **L2-R2/N3/N4/N5** + **像素门禁（`--regions` 学生路由）** + **axe 替代口径（§4.4）** + `arch-metrics`（GodFile 9→8）+ 刷新基线 |

**每批的完成判据（与 §5 DoD 对齐，缺一不可）**：

1. `node scripts/gates/arch-metrics.mjs` → PASS（本步**只增 `client/src` 下的 .js**，不涉分层；**未分层须持平**；GodFile 在 B4 才下降）
2. `node scripts/gates/cycle-check.mjs` → **SCC 仍为 0**（client 侧新增 import 边也计入）
3. `node scripts/gates/hard-metrics.mjs` → PASS 0/0/0（**新 .js 不在扫描面内** —— 实测 `hard-metrics.mjs:6` 只扫 `client/src/style.css` + `client/src/**/*.vue` → 本步该数应当**逐字不变**）
4. `node scripts/gates/bind-check.mjs` → 违规 0（**新增 9 个模块的导出/导入必须真 `import()` 一次**，constraints §3-12）
5. 全量后端测试：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → 4 处摘要、**0 failed**（本步**不动 server**，应逐字不变 → 这是一条**零成本高价值哨兵**：若它变了，说明 B 越界了）
6. **client 追加**：像素门禁（`--regions` 覆盖 `/exam/student/assignments/1`）+ 交互验证（L0/L1 每批必做，L2 按批）+ axe 替代口径
7. **每批一个提交**，消息含「拆分前 file:line 范围 + 目标 composable + 验证结果」

**若只能做一步**：做 **B1**（风险最低、收益可验证，且建立了 L0/L1 判据脚本 —— 后续每批复用）。**B4 是本步"不可逆感"最强的一步**，务必在 B1–B3 的判据脚本稳定后再做。

---

## 7 给 Agent B 的逐条搬移指令

### 7.1 总则（不可协商）

1. **只允许新建 §2.2 的 9 个 `client/src/composables/submit/*.js`** + 修改 **`client/src/views/student/Submit.vue` 的 `<script setup>` 段（283–1206）**。**禁止**碰：`Submit.vue` 的 `<template>`(1–281) 与 `<style scoped>`(1208–1519)、`client/src/components/CodeEditor.vue`、`client/src/api/request.js`、`client/src/router/`、`client/src/composables/` 下的**既有文件**（尤其**不要"顺手"改用 `useDraftAutosave`**，见 §2.4）、`scripts/gates/*`、`client/package.json`、任何其它 `.vue`。
2. **搬移 = 按 §2.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角括号、`：`、`——`、`…`、注释里的 `V3/V4/V5/D3/P-1` 等编号）。
3. **绝对不能在搬移中"顺手修"这 4 处**（plan §6 明令）：① 死代码/冗余（本文件对应物：`getToken()`@775 的 try/catch、`itemTypeColor`@404 的三色注释）；② `onMounted` 异步注册的 `draftTimer`（§3.1-3）；③ 模板 ref 回调的 `if (el)` 守卫（§3.1-6）；④ 零覆盖分支（本文件对应物：`saveAllDrafts` 的 `skipped` / `Promise.allSettled` 失败分支、`pollStatus` 的 `catch { stopPolling() }`）。**这 4 条必须逐字保留**，各自登记为后续独立项。
4. **所有权唯一**：`data q subQuestions allowResubmit endTime showMaterial isPracticeMode maxAttempts currentAttempt submittedAttempts bestScore answers itemAnswers multiAnswerBind subStatuses subScores subFeedbacks editorLangs submittingAll langs`（P1 全部）**只在 W2 创建一次**，通过 `useSubmitPage` 返回给 .vue；**任何其它 composable 不得再 `ref()/reactive()` 同名对象**，一律以参数接收。**`.vue` 里不得出现任何 `ref(` / `reactive(` / `computed(`**（除接线用的 `const { … } = useSubmitPage(...)`）。
5. **`.vue` 里不得出现 `export`、`defineProps`、`defineEmits`、`defineExpose`**（`<script setup>` 不允许 export；实测原文件也没有这些宏）。
6. **`route.params.id` 的读取位置逐字保留**（:378 / :781 / :842 / :945 / :1014 / :1037 / :1123 共 7 处），**不得提前解构成普通变量**（§3.1-5）。
7. **清理集中注册**：`onUnmounted` **只在 .vue 里出现一次**；各 composable 暴露 `disposeXxx()`，按 §3.1-4 的 9 步顺序调用。**`onMounted` 同理只在 .vue 出现一次**（回调体可放 W9）。**不得**在 composable 里注册第二个 `visibilitychange` / `beforeunload`。
8. **每个新文件顶部加 banner**（固定格式，便于 C 机械核对）：

```js
/**
 * <文件名> —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 <B1-B4>，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */
```

9. **命名与导出**：`export function useXxx(…) { … }` + `export default useXxx;`（对齐 `useConfirm.js:44,77`）；纯函数文件用**具名导出**（无 default）。
10. **不要写 smoke test、不要新增测试文件**（C 的职责）；不要改 `client/package.json` 的 scripts；不要新增任何依赖。
11. **每批完成后必须自重跑一遍 L0/L1**（§4.3）；**不要用任何回滚类 git 命令**（`checkout/restore/reset`）—— 出错就用重编辑。

### 7.2 「模板零改动」的具体检查点（**逐条可执行**）

| # | 检查点 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| **C1** | 模板段字节相等 | `awk 'NR>=1&&NR<=281' <before> > b.t; awk 'NR>=1&&NR<=281' <after> > a.t; cmp b.t a.t` | **无输出**（逐字节相等） |
| **C2** | 样式段字节相等 | 同上，`NR>=1208&&NR<=1519` | **无输出** |
| **C3** | **三个块边界标签未动** | `grep -n '^<template>$|^</template>$|^<script setup>$|^</script>$|^<style scoped>$|^</style>$' Submit.vue` | `<template>`=1 / `</template>`=**281** / `<script setup>`=283 / `<style scoped>`=**1208** / `</style>`=**1519**；**只有 `</script>` 的行号允许变化**（script 变短） |
| **C4** | 模板里的 38 个名字全部仍可解析 | L1-① `compileScript().bindings` 的**键集合 + 值（类型）**与改前**完全相等** | 逐名相等、类型相等 |
| **C5** | 模板里的 5 个 `v-model` 目标仍是**同一对象** | 运行时探针：`.oi-card input` 输入后断言 `PUT /draft` body 的 answer 与输入一致（N2 / R1 已覆盖） | 请求体逐字节正确 |
| **C6** | 模板 ref 的 2 个回调行为不变 | :138 `if (el) editorRefs[sq.id] = el`（**不许加 else**）、:147 `setupEditorObserve(el, sq.id)` | 模板字节相等（C1）**已覆盖**；只需确认 B 没有"顺手改模板" |
| **C7** | 类名集合未漂移 | 提取模板 `class` 字面量 ∪ script 里 `oiCardClass/sqBoxClass/itemTypeClass/itemTypeColor` 的返回键 → 与 `<style scoped>` 选择器求差 | 改前改后差集**相同** |
| **C8** | **scoped id 未变** | L1-② 的模板编译产物里 `data-v-xxxx` 规则相同；且**没有新增/减少 `<style>` 块** | 逐字节相等 |
| **C9** | 模板没有增删注释块 | 仅确认 B 未为"格式化"重写 `<!-- -->` | C1 通过即通过 |

### 7.3 逐文件执行单

| 步骤 | 动作 | 完成判据（自重） |
|---|---|---|
| B-0 | 建目录 `client/src/composables/submit/`（`git ls-files` 实测不存在） | 目录存在且为空 |
| **B1-1** | 写 `answerFormat.js`（§2.2 W1 的 9 块 + banner） | `node --check`；9 块与源区间 **sha256 相等** |
| **B1-2** | 改 `Submit.vue` script：删这 9 块声明、加 1 条 import、其余逐字不动 | L0 + C1 + C2 + C4 + C7 全绿；**`<template>` 字节相等** |
| **B1-3** | 提交（消息含源行区间 + 目标文件 + 验证结果） | 单提交；`git show --stat` 只含 2 个文件 |
| **B2-1** | 写 `useEditorLazyMount.js`（7 声明 + `resetEditors`，**含 :576 的"先写标记"注释、:582 的闸门**） | `node --check`；7 块 sha256 相等 |
| **B2-2** | 写 `useQuestionNav.js`（12 声明），`retryPractice` 的 :394-395 改为 `resetEditors()`（**其余逐字**） | 同上；`resetEditors` 内两行与源 :394-395 逐字相同 |
| **B2-3** | 改 `Submit.vue` 接线 | L0 + C1 + C2 + C4 + C7 + **N1 键盘导航**通过 |
| **B3-1** | 写 `useAnswerState.js`（P1 22 个 + 12 个函数/谓词） | 34 块 sha256 相等；`node --check` 通过（**注意它 import W1**） |
| **B3-2** | 写 `useDraftSave.js`（12 声明），注入 `isSqReadonly` / `recalibrateDeadline`；**:1179-1183 的 watch 整体搬入**（含 `{deep:true}` 与注释） | 12 块 sha256 相等 |
| **B3-3** | 改 `Submit.vue` 接线；**watch 的注册位置随之移入 W5**（在 W5 内部注册，**不再在 onMounted 里**） | L0 + C1 + C2 + C4 + C7 + **R1 草稿对拍** + **N2 多选** + R3 时序差异登记 |
| **B4-1** | 写 `useCountdown.js`（9 声明，含 `isExpired`）、`useSubmitActions.js`（4 声明）、`useAssignmentLoader.js`（5 声明） | 18 块 sha256 相等 |
| **B4-2** | 写 `useSubmitPage.js`（8 声明 + `onMounted`@1171-1191 / `onUnmounted`@1193-1205 两个回调体 + 组装 W1–W8） | hook 体与源区间 sha256 相等（**缩进变化是唯一允许差异**） |
| **B4-3** | 改 `Submit.vue`：script 只剩 import + `useRoute` + `useConfirm` + `useSubmitPage` 解构 + `onMounted`/`onUnmounted` 注册 | **L1 `bindings` 键集合与改前完全相等**（38 个名字一个不少）+ 文件 ≤ 800 行 |
| **B4-4** | 跑四门禁 + 像素（`--regions` 含学生路由）+ L2 全套 + axe 替代口径 | §6 的 7 条判据全绿 |
| **B4-5** | 写 `docs/split/Submit.vue-refactor.md`（源区间 → 目标文件:行 + 每块 sha256 + 4 处"逐字保留"的登记） | 53 函数 + 47 声明**全覆盖**（无遗漏、无重复） |
| **B4-6** | 提交 + 刷新 `docs/split/status.md` 的 arch 基线（GodFile 8 / 观察带 27） | 单提交；基线数字与 `arch-metrics` 实跑一致 |

### 7.4 禁令（违反即回流）

1. 顺手"优化"：`getToken` 的 try/catch、`itemTypeColor` 的三色注释、`ensureEditorObserver` 的幂等判断、`saveAllDrafts` 的 `skipped` 记账、`pollStatus` 的原地改对象 —— **一个都不许动**。
2. 在同一提交里改任何 evidence 文案（`'草稿已同步'`@69 / `'已提交，改动仅在重新提交时保存'`@770 / `'已过截止时间，改动不再保存'`@771 / `'考试时间已截止'`@957 / `'操作失败'`@399 / `'没有可提交的答案'`@983）或任何阈值（`1500`@825 / `30000`@1176 / `2000`@1114 / `MAX_TIMEOUT_MS`@874 / `rootMargin:'400px'`@571 / `1000`@915）。
3. 改 `Submit.vue` 的模板或样式（**哪怕只加一个注释**）。
4. 让 composable 互相 import（**必须走参数注入**）；或让 `.vue` 出现 `ref(` / `reactive(` / `computed(`。
5. 在 composable 里注册 `onUnmounted` / `onMounted` / `visibilitychange` / `beforeunload`（清理集中注册是硬要求）。
6. 用 `git checkout/restore/reset` 回滚（用重编辑）。
7. 改 `scripts/gates/*`、改 `tests/*`、改 `client/dist*`。

---

## 8 给 Agent C 的验证清单

C 为**只读 + 自建对拍**（**不复用 B 的脚本**），临时产物全部放 `/tmp`；**不跑 jest**（本步不动 server）；**不启动 :5173/:3000**；rig 用 `:3100` 且用后 `stop`。

| # | 验证项 | 命令 / 方法 | 通过判据 |
|---|---|---|---|
| **V1** | 版本锚点 | `git rev-parse HEAD`；`shasum -a 256 client/src/views/student/Submit.vue` | 记录实测值（改前应为 `6fa9dead…`；若 HEAD 已前移则重新冻结并记录） |
| **V2** | **模板 + 样式字节相等**（★核心） | §4.3-L0 的 `cmp`（`git archive` 冻结 `2c9e3d9`） | `TEMPLATE_STYLE_BYTE_IDENTICAL`；**模板必须是 `</template>`=281 的那 281 行** |
| **V3** | **逐字搬移（静态）**（★核心） | 自建 `slice-equal.mjs`：按 §2.2 区间从改前文件切块 → 从改后 composable 切**同名块** → 逐块 sha256 | **53 函数块 + 47 声明块，0 块不等**（允许差异白名单：banner / import / `export` / `resetEditors` 包装 / W9 hook 体缩进 —— **逐条列出并给理由**） |
| **V4** | **bindings / 模板编译对拍**（★核心，本步最锋利） | §4.3-L1：`@vue/compiler-sfc` 的 `compileScript().bindings` + `compileTemplate()` | **键集合与类型逐名相等**（≥38 名）；模板编译产物**逐字节相等** |
| **V5** | 导出面 / 绑定 | `node --check` 每个新文件；再**真 `import()` 一次**（constraints §3-12） | 无 `does not provide an export named`；`node scripts/gates/bind-check.mjs` 违规 0 |
| **V6** | 四门禁 | `arch-metrics.mjs` / `cycle-check.mjs` / `hard-metrics.mjs` / `bind-check.mjs` | arch PASS（未分层持平；GodFile 1519→≈745 后 **9→8**，观察带 **18→27** 如实记录）；cycle **SCC=0**；hard **0/0/0**（**应逐字不变**）；bind 0 |
| **V7** | 后端零回归哨兵（**证明 B 没越界**） | `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` | 日志 **4 处 `Test Suites:`**、**0 failed**、套件/用例数与改前**完全相同**（本步不动 server；**若数字变了 → B 越界，直接回流**） |
| **V8** | **像素门禁（学生路由）** | `node scripts/gates/pixel-diff.mjs --before 2c9e3d9 --after worktree --regions <含学生路由的 JSON>` | **逐区域 sha1 全等**；**若某区域 exit 2 → 先查区域表 / FIXTURES（G-B），不得当成 PASS**；`client/dist` mtime 未变 |
| **V9** | **交互行为（L2 核心 4 条）** | §4.3：**R1 草稿 + 刷新恢复 / R2 提交全部 / N1 键盘导航 / N2 多选** | 4 条**改前改后都必须通过**；请求体（`PUT /draft` 的 `answer`、`POST /submit` 的 `force`）逐字节对拍 |
| **V10** | **U1「watch 注册提前」差异登记** | §4.3-R3：延迟 `GET` 3s，t=0.5s 填答 → 记录 `.dirty-hint` 是否出现 | **如实记录改前=否 / 改后=是**（或反之），**不得**据此判"回归" —— 判定权在 Captain，但**必须写进 `-verify.md`** |
| **V11** | **U2/U3/U4 资源不变量** | 自建探针（monkey-patch `setInterval/setTimeout/addEventListener/removeEventListener` 计数 + `monaco.editor.getModels().length`） | 卸载后：timer 归零、监听归零、**无新增 `/draft` 请求**、models 归零；滚动往返后编辑器挂载次数 **= 编程题数**（不增） |
| **V12** | **U6 倒计时两个方向** | N3（`endTime=+800ms` → 恰好 1 次 `force:true`）+ N4（`+30d` → 3s 内零 `/submit`） | 两条都必须**改前同样成立**；N4 是 P-1 修复的回归门 |
| **V13** | **axe 替代口径** | §4.4 三选一（**A 建议 (b)**）：`page.accessibility.snapshot()` 逐节点对拍，或 `b2-contrast/lib/measure.js` 对比度回归 | ARIA 树逐节点相等（模板零改动下**应当**相等）；**若 Captain 未定口径，则显式登记"axe 未执行"并接受盲区** |
| **V14** | 越界自查 | `git status --porcelain`；`find . -newermt '<B 开始时刻>' -not -path './node_modules/*' -not -path './.git/*'` | 只有计划内的 **9 新 + 1 改**（+ 双方报告）；`client/dist` / `dist-r2` / `dist-t02check`、`tests/`、`client/src` 其余文件 mtime **无变化** |
| **V15** | 回滚粒度 | `git show --stat HEAD` | 单提交/批，消息含「拆分前 file:line 范围 + 目标 composable + 验证结果」 |

**判定纪律**：**V2 / V3 / V4 是本步核心判据**（"逐字搬移 + 模板零改动"的直接证明，**完全独立于像素门禁**）；**V9 是唯一能证交互不变的东西**；其余是既定门禁。任一不符 → **回流 B，不得改测试或改门禁迁就实现**（constraints §3-16）。

---

## 9 局限声明

1. **未真跑任何门禁 / 测试 / 构建**：§6 的 7 条判据与 §3 的等价性判定均为**静态阅读 + 机制论证**，不等于实跑。真跑必须由 C 完成（V6–V13）。**我未执行 jest、vite build、任何服务、任何 Playwright。**
2. **§2.2 的行数预估有 ±10% 误差**：`搬移行数` 是逐区间数出来的（可复核），`预估总行数` = 搬移行数 + 我对 banner / import / export 块的估计。判据是 **<800**（W2 最接近，≈360，仍远未逼近），不是精确值。**`.vue` 最终行数 ≈745 也有 ±30 行误差** —— 若实际落在 800 以上，**本步的 GodFile 收益不成立**，须由 C 实测后回报。
3. **「模板零改动 ⟹ 像素必然相等」是论证而非实测**：该论证依赖「渲染函数只由模板 + 编译器 + scoped id 决定」。**若 B 的接线改变了某个 `v-if` 守卫的初值时机**（例如 `data` 在首帧前被赋值），首帧就**真的会变**。→ 像素门禁仍然必须跑（V8），**不能因"论证上必然"而跳过**。
4. **6 条「不确定需实测」（U1–U6）本节无法收敛**：它们是运行时事件顺序 / 资源生命周期 / Monaco 内部状态，静态阅读**原则上不可判**。U1 我倾向"改善但属可观测差异"，**但判定权在 Captain，不在我**。
5. **两处既有缺陷被显式保留（不是本步引入）**：① `onMounted` 异步注册 `draftTimer`/`watch` 的卸载窗口（§3.1-3）；② `editorRefs` 依赖模板 ref 的 `if (el)` 守卫才能在卸载时 dispose（§3.1-6）。**本方案要求逐字保留**，各自登记为后续独立项。
6. **axe 本轮不可用**（§4.1 实测：`axe-core` 在三个 `node_modules` 与 `/tmp/t5-tools` 均不存在）。DoD 第 5 条的「axe 不引入新违规」**当前无法执行** → 必须由 Captain 在三选一口径中拍板（§4.4），否则这条 DoD **形同虚设**。
7. **两道装置闸门（G-A / G-B）超出我的权限**：`tests/ui-redesign-verify/rig.sh:9` 默认驱动**另一个 worktree**（`Exam-DeepSeek-ui`@`feat/ui-redesign`），而 `pixel-diff.mjs` 驱动主仓库活树；`pixel-diff.mjs` 的 `FIXTURES` 无任何 `/api/student/**`。**C 是只读角色 → 补夹具不是 C 的活**。这两条不解决，本步的 client 验证（V8 / V9）**无法执行** → 状态应落 `docs/split/status.md` 待决清单（对应其"强制停止条件 ③ 护栏不可用"）。
8. **未审计 `CodeEditor.vue` 内部**：我只读了它的 `:20-22`、`:40`、`:97`、`:102-143`、`:283` 关键行，以确认「Monaco 实例在组件内、`defineExpose({ format })`、`dispose` 存在」。**它的懒加载 / 主题 / 键盘 a11y 细节不在本步范围**（本步不改它）。若后续要拆它，需另起一份 plan。
9. **未审计 `api/request.js` 全文**：只读了 :1-60（baseURL / 拦截器 / 错误语义）。`saveAllDrafts` 依赖的「HTTP 200 + 『跳过草稿』」语义（:805）**我只做了前端字符串层面的确认**，未追到 server 侧实现。
10. **观察带上升的影响未评估**：GodFile 9→8 是明确收益；但**观察带 18→27** 会改变 `arch-metrics` 的报告面。若 Captain 认为"观察带不得上升"，则本方案的 9 文件划分需重做（例如合并 W1 进 W2、合并 W3/W4），**但会增加单文件行数与响应式耦合** → 需 Captain 显式取舍。
11. **未做全仓扫描**（A 角色纪律，plan §8.1 第 5 条）：本方案**只针对 Submit.vue 一个文件**；C2–C5 的 `.vue` 未分析。§2.4 对既有 composable 的引用仅限"是否存在 / 契约形状 / 消费方"，**未审计它们自身的正确性**。
