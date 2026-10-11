# QuestionEdit.vue 拆分方案（接缝与护航分析）—— GodFile 专项 step 6

> 目标文件：`client/src/views/teacher/QuestionEdit.vue`（**983 行**）
> 立场：**纯只读**。本文件是 Agent A 的**唯一产物**；本轮未修改/新建/删除仓库内任何其它文件，未触碰任何 `.vue`，未跑 jest/build、未起服务、未联网。
> 依据：`docs/plan/2026-10-11-godfile-split-plan.md` §5 DoD（**client A 档 5 条判据**）、`docs/pipeline/project-constraints.md`（17 条）、`docs/split/ProjectQuestionEdit.vue-plan.md`（step 5 范本 + 其 K1 勘误）。

## 版本锚点（本方案全部实测数据的取值时刻）

| 项 | 实测值 |
|---|---|
| 仓库 | `/Users/you/My Vue/Exam-DeepSeek`（主 worktree） |
| HEAD | `b94407f84f44deb87e6fb6efbe2f1ad45290112c`（branch `master`） |
| 目标文件 | `client/src/views/teacher/QuestionEdit.vue` = **983 行**；`git status` 对该文件**无改动** |
| 第二个 worktree | `…/Exam-DeepSeek-ui` @ `19abe80`（`feat/ui-redesign`）→ **G-A 仍然存在**：任何 L2/⑤ 装置必须显式指主仓库 client |
| `arch-metrics.mjs:27` 基线 | `{ layerViolations: 0, unmigrated: 44, godfileOver800: 5, over500: 15 }`（含 step 5 已落地：`ProjectQuestionEdit.vue` 868→348） |
| 编译器/驱动 | `@vue/compiler-sfc@3.5.34`、`@babel/parser@7.29.8`、`@babel/traverse@7.29.8`、`@playwright/test@1.60.0`（**chromium-1217/1223、firefox-1522、webkit-2287 均已安装**）；★**全仓无 jsdom**（3 处 `ls` 实测均无） |

⚠️ **锚点纪律**：step 5 的 plan/verify 里引用的 `e37d27c` 等锚点**已过期**（当前 HEAD 已推进到 step 5 之后）。C/B 执行前必须重新 `git rev-parse HEAD`；本方案所有行号均为上表锚点下的实测值。

---

## 0 约束遵守声明

1. 本文件是**唯一写入**；未修改任何 `.vue`/`.js`/`tests/`/`client/dist`/`scripts/gates/*`；未执行任何 git 写操作（无 clean/stash/checkout/reset/restore）；未跑 jest、未跑 build、未起任何服务、未占用 `:5173`/`:3000`；未联网。
2. 所有行号/计数**本轮实测**（constraints §3-10）：`@vue/compiler-sfc` + `@babel/parser` AST 普查 + `grep` 交叉验证；**未采信 Captain 盘点或历史报告**，并纠正了 Captain 的「template 48」（见 §1.0）。
3. 临时分析全部以 `node` 读 stdin 执行 —— **未在仓库或 /tmp 落任何脚本文件**。
4. 本方案的 5 条判据配方**全部经本轮实测**，其中含 **2 处对 step 5 范本配方的必要纠正**（§4.3 的模板对拍口径、§4.4 的扫描器实现），均已给出实测证据。

---

## 1 段落接缝图谱（逐段实测）

### 1.0 四个块的真实行数（**纠正常见误读**）

| 块 | 起止行（实测） | 行数 | 非空行 |
|---|---|---|---|
| `<template>` … `</template>` | 1–312 | **312** | 301 |
| `<script setup>` … `</script>` | 314–854 | **541** | — |
| `<style scoped>` … `</style>` | 856–983 | **128** | — |
| 合计 | 1–983 | **983** | — |

**★本文件只有 1 个 `<style>` 块**（与 step 5 的 2 个不同）：`grep -n '<style'` **1 命中**（:856）、`grep -n '</style>'` **1 命中**（:983）、`descriptor.styles.length === 1`、`scoped === true`。⇒ **L0 切 2 段（template + style），不是 3 段**。

> **「template 48」的来源已定位**：`grep -n '</template>'` 的**第一条命中是第 48 行** —— 那是 `:43-48` 的 `<template #overlay>` 内联插槽闭合标签（全文共 **15 个** `<template` / **15 个** `</template>`）。外层闭合在 **:312**。`docs/plan/2026-10-11-godfile-split-plan.md` §2 表格里的「template 48」应理解为「首个 `</template>` 之前的行数」，**不是模板块大小**；真实模板块 **312 行 = 「48」的 6.5 倍**（与 step 5 的「40 vs 194」是**同一类错误**）。
> → 对拆分本身无影响（本步模板一行不动），但**任何「行数下降」的收益核算必须以 312/128 为基数**，否则会把收益虚报约 264 行，并把「.vue 是否会掉出 >500 观察带」算反（见 §2.2 注）。

### 1.1 段落清单（**本文件 script 内 0 条 `// =====` 横幅**）

实测：脚本段内**没有任何** `// =====` 横幅；**2 条横幅全在模板里**，且是**题型形态横幅**而非职责段横幅：

| 横幅行 | 内容 |
|---|---|
| 模板 :103 | `<!-- ===== 主观题：原始编辑页 ===== -->` |
| 模板 :123 | `<!-- ===== 客观题：items 编辑器 ===== -->` |

⇒ 本文件的接缝**必须按职责切**（与 ruleExecutor / step 5 一致），**不能靠横幅整段搬**。本方案切 **14 段（S1–S14）**。

| # | 段落名 | 起止行（实测） | 依据（注释） |
|---|---|---|---|
| S1 | SFC 头 / import 面 / 锚点声明 / `_sanHtml` | 315–337 | 无横幅 |
| S2 | form / 题型 / 小题列表 / tabs 滚动 | 339–359 | `// 题目类型` :345、`// 当前小题类型` :347 |
| S3 | 分值 computed / 小题标签 | 361–385 | `// 默认分值` :361、`// 总分` :364、`// 客观题小题分值` :368、`// flat 模式…` :370 |
| S4 | AI 提示词预览 | 387–407 | `// AI 提示词预览…` :387 |
| S5 | 设置（模态 + 分类模式迁移） | 409–416 + 494–537 | `// 设置` :409 / :494（**物理分两处，逻辑一段**） |
| S6 | 上传试卷（模态 + SSE 解析） | 418–424 + 539–606 | `// 上传` :418、`// 上传试卷` :539 |
| S7 | 预览联动 + 题型徽标工具 | 426–428 + 484–492 | `// 预览` :426、`// 预览联动` :484 |
| S8 | AI 生成参考答案 | 430–433 + 746–780 | `// AI 生成参考答案` :430 |
| S9 | 物料 computed + 工厂 | 434–440 | `// 工厂` :436 |
| S10 | 选题型 / 格式化 / 小题切换 | 442–470 | `// 初始选类型` :442、`// 格式化` :449、`// 小题切换` :452 |
| S11 | 客观题 items 编辑器 | 472–492 | `// 客观题 items` :472 |
| S12 | 试卷解析（规范化解码） | 608–688 | 无横幅 |
| S13 | 草稿自动保存接线 | 690–701 | `// 草稿：…` :690 |
| S14 | 加载 / 保存 / 生命周期 | 703–853 | `// 加载已有题目` :703、`// 保存` :728 |

### 1.2 逐段详表（段内声明 / 响应式 / 生命周期 / 模板引用 / ★双形态）

| # | 段落 | 行数 | 段内顶层声明（名@行） | 生命周期 | 模板直接引用 | ★主观题路径 | ★客观题路径 |
|---|---|---|---|---|---|---|---|
| **S1** | 头/import/锚点 | 23 | `_sanHtml`@320 · `router`@333 `route`@333 `{confirm}`@334 `editId`@335 `isEdit`@335 `saving`@336 `codeEditorRef`@337 | — | **是**：`isEdit`@3 · `saving`@308 · `codeEditorRef`@198(string ref) | 全量 | 全量 |
| **S2** | form/题型/小题 | 21 | `form`@339 · `questionKind`@346 `sqKind`@348 `subQuestions`@350 `tabsScrollRef`@351 `canScrollLeft`@352 `canScrollRight`@353 `onTabsScroll`@355 `scrollTabs`@356 · **watch@357** · `activeIndex`@358 `slideDir`@358 `showMaterial`@358 `sqKeyCounter`@359(let) | — | **是**（9）：`form`@10,11,18,25,62,105,108,111,115,118 · `questionKind`@40,52,179,181,305,307 · `sqKind`@104,185 · `subQuestions`@71,73 · `tabsScrollRef`@69 · `canScrollLeft/Right`@68,96 · `onTabsScroll`@69 · `scrollTabs`@68,96 · `activeIndex`@71,101,183 · `slideDir`@35 · `showMaterial`@54,58,61 | 全量 | 全量 |
| **S3** | 分值/标签 | 25 | `DEFAULT_TYPE_SCORES`@362 · `computedMaxScore`@365 · **watch@367** · `computedObjSqScore`@369 · `currentFlatItemType`@371 · `sqTypeName`@373 · `sqDisplayLabel`@381 | — | **是**（4）：`computedMaxScore`@25 · `computedObjSqScore`@133 · `currentFlatItemType`@127 · `sqDisplayLabel`@72 | 全量（`sqTypeName` 恒返回 `''`） | 全量 |
| **S4** | 提示词预览 | 21 | `promptModalOpen`@388 `promptLoading`@389 `promptPreviewData`@390 `promptActiveKeys`@391 · `showPromptPreview`@393(async) | — | **是**（5）：@231,232,233,234,245 + :307 按钮 | ★**可达**：按钮 `v-if="isEdit && questionKind==='subjective'"`@307 | ❌**不可达**（按钮不渲染；4 状态恒初值） |
| **S5** | 设置 | 52 | `showSettings`@410 `SETTINGS_KEY`@411 `loadSettings`@412 `saveSettings`@413 `defaultSettings`@414 `objectiveSettings`@415 `tempSettings`@416 · `resetSettings`@495 `applySettings`@496 | — | **是**（5）：`showSettings`@29,253 · `objectiveSettings`@82,89,127 · `tempSettings`@256,262 · `resetSettings`@253 · `applySettings`@267 | 全量（`classificationMode` 影响 :82/:89 的 addSub 菜单） | 全量（`applySettings` 会**重写** `subQuestions`） |
| **S6** | 上传试卷 | 74 | `showUploadExam`@419 `uploadFileList`@420 `uploadAnalyzing`@421 `uploadResult`@422 `uploadError`@423 `uploadProgress`@424 · `resetUpload`@540 · `handleUploadExam`@541(async,SSE) | — | **是**（7）：@28,272,284,285,292,297,298 | 全量（:28 按钮**无 v-if**） | 全量（同上） |
| **S7** | 预览联动 | 12 | `previewFocusKey`@427 · `onEditCardClick`@485 `scrollPreviewTo`@486 `itemTypeLabel`@487 `itemTypeColor`@488 `itemTypeTagClass`@492 | — | **是**（5）：`previewFocusKey`@137,209 · `onEditCardClick`@137 · `itemTypeColor/TagClass/Label`@139,210 | ❌ 入口不可达（全在客观题分支） | 全量 |
| **S8** | AI 参考答案 | 39 | `genRunning`@431 `aiTag`@432 · `aiGenerateRefs`@747(async) `promptAiGenerate`@768 | — | **是**：`aiTag`@189 | 全量（`handleSave`→`collectSubjectiveIssues` 触发） | 全量（同上：由**存在主观小题**驱动，不由当前形态驱动） |
| **S9** | 物料/工厂 | 7 | `hasMaterial`@434 · `newSq`@437 `newItem`@438 `countBlanks`@439 `updateFillBlanks`@440 | — | **是**：`hasMaterial`@56 | 全量 | 全量 |
| **S10** | 选题型/切换 | 29 | `onPickKind`@443 `formatCode`@450 `saveDraft`@453 `loadSq`@454 `switchTo`@458 `addSub`@459 `removeSub`@470 | — | **是**（5）：@44,79,71,73,192 | 全量 | 全量 |
| **S11** | items 编辑器 | 21 | `syncObjSqScore`@473 `onAddItem`@474 `removeItem`@475 `isCodeStem`@476 `addItemOption`@477 `removeOption`@478 `toggleMultiAnswer`@479 `onFillBlankChange`@480 `onItemScoreChange`@481 · **watch@482** | — | **是**（8）：@127,130,137,141,142,144,149,152,155,161 + `isCodeStem`@144,211 | ❌ 模板入口不可达；★**但 watch@482 在两形态都注册** | 全量 |
| **S12** | 试卷解析 | 81 | `normalizeJudgeAnswer`@608 `cleanOptionText`@614 `detectCodeLang`@615(36 行) `normalizeItem`@651 `fillFromParsed`@653 | — | ❌ 无 | 可达（`handleUploadExam`→`fillFromParsed`） | 可达（同上，且可**跨形态重建** `questionKind`） |
| **S13** | 草稿接线 | 12 | `markDraftChanged`@691 `draftSaver`@692(=`useDraftAutosave`) `statusText`@698 · **watch@699** · **watch@701** | ★`useDraftAutosave` 内部注册 `onBeforeUnmount(stop)`（`useDraftAutosave.js:134`） | **是**：`statusText`@304 | 全量 | 全量 |
| **S14** | 加载/保存/生命周期 | 151 | `load`@704(async) `handleCancel`@729 `buildScoreSummary`@730 `collectSubjectiveIssues`@782 `handleSave`@793(async) `doSave`@832(async) `beforeUnloadHandler`@849 · **`onMounted`@850 `onUnmounted`@851** · `langs`@853 | ★**两个 hook 全在此** | **是**（5）：`handleCancel`@306 `handleSave`@308 `langs`@191 `showPromptPreview`@307 | 全量 | 全量 |

**行数闭合核对**：14 段声明所在行区间合计 **541 行**（= script 块 314–854 实测行数 ✔）。

### 1.3 ★五处「物理位置 ≠ 逻辑归属」的暗礁（实测）

1. **`computedObjSqScore`@369 / `currentFlatItemType`@371 物理在 S3「分值段」、逻辑属 S11 客观题单元** —— 消费者只有 :127（`currentFlatItemType`）与 :133（`computedObjSqScore`，**在客观题分支内**）。**按行区间整段搬会造出「既非分值也非 items」的杂物段**。
2. ★**`draftChanged`@428 与 `markDraftChanged`@691 相隔 263 行，却是同一个状态**：写者 3 处（`saveDraft`@453、`draftSaver.save`@693、`markDraftChanged` 自身）、读者 2 处（`enabled: () => draftChanged`@695、`beforeUnloadHandler`@849）。→ **必须落在同一单元**（本方案判归 U3 小题单元）；否则要么 U9↔U3 成环（§2.3-4），要么两处各声明一个 `let` → **静默分叉**（与 step 5 的 `checkerLoadedOnce` 同类，**L0/L1 都看不见**）。
3. ★**`aiTag`@432 是跨 3 单元的共享 ref**：写 `loadSq`@456（U3）、`aiGenerateRefs`@760（U7）、watch@701（U7）；读 `saveDraft`@453（U3）、模板 :189。→ 所有权归 **U7**，以 **ref 实例**注入 U3（**不得**在 U3 里第二次 `ref('')`）。
4. ★**`sqKeyCounter`@359 是全文件唯一的非响应式计数器，只被 `newSq`@437 使用** → 必须与 `newSq` **同单元**（U3）。若被两处各声明一次 → 小题 `_key` 重复 → `<TransitionGroup>`(:70) / `:key="sq._key"`(:71) 静默错乱（**静态判等全盲**，与 step 5 的 `checkerLoadedOnce` 同一风险类）。
5. ★**`objectiveSettings`@415 ↔ `subQuestions`@350 双向依赖**：`addSub`@461 读 `objectiveSettings.classificationMode`；`applySettings`@502-530 重写 `subQuestions` 并调 `saveDraft/loadSq/newSq`。→ **真环**，解法见 §2.3-1。

### 1.4 模板可见面实测（拆分的硬边界）

| 类别 | 数量 | 明细（实测） |
|---|---|---|
| **模板引用的本文件顶层名字** | **61** | **59 个 `$setup.<name>`** + **2 个静态 string ref**（`tabsScrollRef`@69、`codeEditorRef`@198 —— 编译产物为 `ref: "tabsScrollRef"`，**不出现在 `$setup` 里**，但运行期必须能从 setupState 解析） |
| 其中绑定类型（实测 `compileScript().bindings`） | 61 | **29 `setup-ref`**（27 个 `$setup` = 22 个 `ref()` + 5 个 `computed()`，另 2 个是 string ref）· **29 `setup-const`** · **3 `setup-reactive-const`**（`form`/`objectiveSettings`/`tempSettings`） |
| 其中是**函数** | 28 | `addItemOption addSub applySettings formatCode handleCancel handleSave handleUploadExam isCodeStem itemTypeColor itemTypeLabel itemTypeTagClass onAddItem onEditCardClick onFillBlankChange onItemScoreChange onPickKind onTabsScroll removeItem removeOption removeSub resetSettings resetUpload scrollTabs showPromptPreview sqDisplayLabel switchTo toggleMultiAnswer`（28 个）+ `langs`（数组，非函数） |
| 模板**事件处理器** | 全部具名，**0 处内联** | 与 step 5 不同：本文件模板内**无内联箭头/内联赋值处理器**（实测） |
| 模板 **string ref** | **2** | `tabsScrollRef`@69 · `codeEditorRef`@198 |
| 模板内联赋值目标（`v-model`） | 12 处 | `form.title`(11) `form.difficulty`(18) `form.material`(62) `form.sqTitle`(108) `form.sqScore`(111) `form.content`(115) `form.scoringCriteria`(118) `form.language`(191) `form.referenceAnswer`(198) `item.*`(141,144,151,161) `tempSettings.*`(256,262) `uploadFileList`(285) |
| 模板引用**但非本文件顶层名** | 3 类 | 组件名（5 个 import：`FormPage RichEditor CodeEditor CodeOutlined InboxOutlined`）· `a-*` 全局注册组件（16 个）· `v-for` 局部量（`sq item opt bp l i idx oi bi s`） |

**★与 step 5 的规模差**：61 名（vs 44）、**104 顶层声明**（vs 80）、28 个模板函数（vs 14）→ **本步是本专项目前量最大的一步**。

**★本文件无死代码**：逐名统计「定义之外是否还有引用 ∨ 模板引用」→ **104/104 全部被引用**（`DEAD = 0`）。⇒ **不需要** step 5 的 K5「不得顺手清理死代码」条目；但也**因此没有任何"可安全删除"的减压阀** —— 104 项全部都得有去处。

### 1.5 ★双形态执行路径总表（**本文件独有，必须正面处理**）

**★与 step 5 的根本差异（实测）**：本文件**没有第二种模式、没有 props、没有第二条路由**。`client/src/router/index.js` 实测：

| 行 | 路径 | 组件 | props |
|---|---|---|---|
| :31 | `questions/new` | `import('../views/teacher/QuestionEdit.vue')` | **无** |
| :32 | `questions/:id/edit` | **同一个 .vue** | **无** |

⇒ **全文无 `defineProps` / `defineEmits` / `defineExpose`**（实测 0 命中）。所谓「两种题型形态」是**运行期状态**，由两级状态决定：

- **顶层形态** `questionKind`@346：`null`（未选 → :40-51 选择器 + :180 右栏提示）→ `'subjective'` / `'objective'`（由 `onPickKind`@443 设定，或由 `load`@722 / `fillFromParsed`@657-661 推导）。
- **每小问题型** `sqKind`@348（取自当前小题 `sq.sqKind`），模板用 `:104 v-if="sqKind==='subjective'"` / `:124 v-else` 分流。

| 分段归属 | 段落 | 主观题（A） | 客观题（B） | 判定依据（实测行） |
|---|---|---|---|---|
| **A 专属** | S4 提示词预览 | ✅ | ❌ | :307 按钮 `v-if="isEdit && questionKind === 'subjective'"`；`showPromptPreview`@393 无其它调用点 |
| **A 专属（模板面）** | S10 `formatCode` | ✅ | ❌ | :192 在 `:185 v-if="sqKind==='subjective'"` 分支内；`codeEditorRef`@198 同分支 |
| **B 专属（模板面）** | S7 预览联动 + S11 全部 handler | ❌ | ✅ | :137/:141/:142/:144/:149/:152/:155/:161 全在 `:124 v-else` 分支内 |
| **B 专属（求值面）** | `computedObjSqScore`@369 `currentFlatItemType`@371 | ❌ 不进模板 | ✅ | :127/:133 在客观题分支内 |
| **双形态共用** | S1 S2 S3 S5 S6 S8 S9 S12 S13 S14 | ✅ | ✅ | 见 §1.2 各行 |
| **共用但分支不同** | S5 设置 | ✅ 读 `classificationMode`（决定 :82/:89 菜单） | ✅ **写**（`applySettings`@502-530 重写 `subQuestions`） | :29 设置按钮**无 v-if** |
| **共用但由"数据"而非"形态"驱动** | S8 AI 参考 / S12 解析 | ✅ | ✅ | `handleSave`@803 `if(missingRef.length)` → `promptAiGenerate`：**由"存在主观小题"驱动**，两形态下都可能命中；`fillFromParsed`@657 **可把 `questionKind` 从未选/主观改写为客观** |
| **两形态都注册、只在一形态触发** | **watch@482**（`form.objectiveItems.map(i=>i.score)`，deep） | ⚪ 注册但源不变化（`loadSq`@456 在主观小题下把 `form.objectiveItems` 置 `[]`） | ✅ 触发 | 断言的**注册**两形态都在 → 搬移后**不得**按形态条件创建 |

**★三条形态一致性断言（B/C 必须守住）**：

- **A1（形态判定值不动）**：`questionKind`/`sqKind` 的**赋值点与取值点**逐字不变；**任何 composable 不得自行创建第二份**。模板 :104/:185 拿到相反的布尔值属破坏性回归，而**模板字节判等与 `$setup` 名集合判等都看不见**。
- **A2（不得按形态条件创建任何单元）**：watch@482、`aiTag`、`previewFocusKey`、`draftSaver` 在**两形态下都必须被实例化**（改前即无条件执行）；改成 `if (sqKind==='objective')` 会改变 setup 期副作用面。
- **A3（命名口径）**：本文件 `sqKind` 的字面量只有 `'subjective'`/`'objective'`（实测），**不得引入 `'code'`**（那是 step 5 / Submit.vue 的口径）。

---

## 2 目标 composable 划分

### 2.1 五条不可协商的形式前提

**(a)「模板零改动」在 `<script setup>` 下的成立条件**：Vue 3 把 `<script setup>` 的**顶层绑定**编译进 `setup()` 返回对象，模板渲染函数以 `$setup.xxx` 访问。**composable 返回值被顶层解构后，与原来直接声明的 ref/函数在模板里语义相同**（ref 解包由 `$setup` 的 `proxyRefs` 保证）。因此：

- ✅ 允许：`const { form, subQuestions, saving, handleSave, langs } = useQuestionEditPage();`
- ❌ 禁止：把状态藏在嵌套对象里（`const p = useQuestionEditPage();` 然后模板写 `p.form`）—— 那要改模板。
- ❌ 禁止：在 composable 里 `export` 之外使用 `<script setup>` 宏（`defineProps` 等只能留在 .vue；本文件无 `defineProps`）。

**(b) 单一「接线根」+ 参数注入**：全部 composable 在 `<script setup>` 顶层**同步**调用一次，跨单元共享状态**以参数注入**（ref/reactive 传的是**引用**，天然单实例），**不做嵌套调用**。理由：① 避免循环依赖（§2.3 实测 5 处真环）；② 参数表就是可测试的契约面；③ **保证 5 个 watch 与 2 个 hook 都在 setup 同步阶段注册**（§3.1-2/-3 依赖这一点）。

**(c) hook 集中注册**：`onMounted`/`onUnmounted` **只在 .vue 里各注册一次**（回调体放接线根 U12），按原顺序执行。理由：Hook 注册顺序 = 执行顺序；集中注册让「清理顺序」显式可见（§3.1-4）。

**(d) ★本文件新增前提（形态单一真值源）**：`questionKind`/`sqKind` **由 U3 唯一创建**，任何其它单元**不得自行 `ref('subjective')`**（§1.5-A1：重复创建会产生第二真值源，而模板字节判等与 `$setup` 名集合判等**都看不见「值是错的」**）。

**(e) ★本文件新增前提（非响应式共享状态必须单实例）**：`sqKeyCounter`（`let`）与 `draftChanged`（`let`）**各只有一处声明**；`draftChanged` 通过 `markDraftChanged()/clearDraftChanged()/hasDraftChanged()` 三个函数暴露，**不得以 getter 之外的形态外泄**（§1.3-2/4 是本步两个「静默分叉」高发点）。

### 2.2 文件 → 单元对照表（**完整覆盖 104 个顶层声明 + 2 个 hook 体**）

命名遵循本仓既有约定：`client/src/composables/<域>/useXxx.js`（具名导出 + `export default`，对齐 `useConfirm.js` / `composables/submit/*` / `composables/project/*`）。★**本步新建 `client/src/composables/question/` 子目录** —— `project/` 已被 step 5 的 9 个文件占用（实测已在库），**不得复用同名文件**。

> 行数口径：**搬移行数** = 源文件中所搬声明所在行的**实测行跨度**（含紧邻注释）；**预估总行数** = 搬移行数 + banner/import/导出/包装（±15%）。

| 目标文件 | 单元 | 搬移内容（源行号，逐字） | 声明数 | 搬移行数 | 预估总行数 |
|---|---|---|---|---|---|
| **U1** `…/question/questionPure.js` | **纯叶子**（零 vue / 零响应式 / 零内部依赖） | `_sanHtml`@320-323(+DOMPurify import) · `DEFAULT_TYPE_SCORES`@362 · `SETTINGS_KEY`@411 · `langs`@853 · `itemTypeLabel`@487 `itemTypeColor`@488 `itemTypeTagClass`@492(含 :489-491 注释) · `isCodeStem`@476 · `countBlanks`@439 `updateFillBlanks`@440 `newItem`@438 · `normalizeJudgeAnswer`@608-613 `cleanOptionText`@614 `detectCodeLang`@615-650 `normalizeItem`@651 | 15 | ≈61 | **≈85** |
| **U2** `…/question/useQuestionForm.js` | form 所有权 + 派生 | `form`@339-343 · `hasMaterial`@434 | 2 | 6 | **≈35** |
| **U3** `…/question/useSubQuestionList.js` | **小题状态机**：题型/列表/tabs/分值同步/切换 | `questionKind`@346 `sqKind`@348 `subQuestions`@350 `tabsScrollRef`@351 `canScrollLeft`@352 `canScrollRight`@353 `onTabsScroll`@355 `scrollTabs`@356 · **watch@357** · `activeIndex`@358 `slideDir`@358 `showMaterial`@358 · `sqKeyCounter`@359 · **`newSq`@437** · `computedMaxScore`@365 · **watch@367** · `sqTypeName`@373-380 `sqDisplayLabel`@381-385 · `onPickKind`@443-447 · `saveDraft`@453 · `loadSq`@454-457 `switchTo`@458 `addSub`@459-469 `removeSub`@470 · ★`draftChanged`@428 + `markDraftChanged`@691 + `clearDraftChanged` + `hasDraftChanged`（见 §1.3-2） | 24 (+3 薄包装) | ≈53 | **≈100** |
| **U4** `…/question/useObjectiveItems.js` | 客观题 items 编辑 + 预览联动 | `previewFocusKey`@427 · `computedObjSqScore`@369 `currentFlatItemType`@371 · `syncObjSqScore`@473 `onAddItem`@474 `removeItem`@475 `addItemOption`@477 `removeOption`@478 `toggleMultiAnswer`@479 `onFillBlankChange`@480 `onItemScoreChange`@481 · **watch@482** · `onEditCardClick`@485 `scrollPreviewTo`@486 | 14 | ≈14 | **≈55** |
| **U5** `…/question/useQuestionSettings.js` | 设置模态 + 分类模式迁移 | `showSettings`@410 `loadSettings`@412 `saveSettings`@413 `defaultSettings`@414 `objectiveSettings`@415 `tempSettings`@416 · `resetSettings`@495 `applySettings`@496-537 | 8 | 50 | **≈85** |
| **U6** `…/question/useExamImport.js` | 上传试卷 + SSE + 解析填充 | `showUploadExam`@419 `uploadFileList`@420 `uploadAnalyzing`@421 `uploadResult`@422 `uploadError`@423 `uploadProgress`@424 · `resetUpload`@540 `handleUploadExam`@541-606 · `fillFromParsed`@653-688 | 9 | ≈109 | **≈140** |
| **U7** `…/question/useAiReference.js` | AI 参考答案（含 aiTag 所有权） | `genRunning`@431 **`aiTag`@432** · `aiGenerateRefs`@747-766 `promptAiGenerate`@768-780 · **watch@701** | 5 | ≈36 | **≈65** |
| **U8** `…/question/usePromptPreview.js` | AI 提示词预览（**主观题专属**） | `promptModalOpen`@388 `promptLoading`@389 `promptPreviewData`@390 `promptActiveKeys`@391 · `showPromptPreview`@393-407 | 5 | 19 | **≈50** |
| **U9** `…/question/useDraftSync.js` | 草稿自动保存接线 | `draftSaver`@692-696 · `statusText`@698 · **watch@699** | 3 | 12 | **≈45** |
| **U10** `…/question/useSaveQuestion.js` | 保存守卫 + 分值汇总 + 跳转 | `handleCancel`@729 `buildScoreSummary`@730-745 `collectSubjectiveIssues`@782-791 `handleSave`@793-831 `doSave`@832-848 | 5 | ≈83 | **≈110** |
| **U11** `…/question/useLoadQuestion.js` | 加载已有题目 | `load`@704-726 | 1 | 23 | **≈55** |
| **U12** `…/question/useQuestionEditPage.js` | **接线根**（`.vue` 唯一调用入口） | `router`@333 `route`@333 `{confirm}`@334 `editId`@335 `isEdit`@335 `saving`@336 `codeEditorRef`@337 · `formatCode`@450 · `beforeUnloadHandler`@849 · ★**平移 `onMounted`@850 / `onUnmounted`@851 两个回调体** | 9 + 2 hook 体 | ≈20 | **≈90** |
| — | 源文件 `QuestionEdit.vue` | `<script setup>` 541 → **≈45–60**；`<template>` 1–312 与 `<style>` 856–983 **逐字节不动** | — | −≈480 | **983 → ≈490–500** |

**声明闭合核对**：15+2+24+3+14+8+9+5+5+3+5+1+9 = **103** ✔（+ `onMounted`/`onUnmounted` 两个 hook 调用语句 = **104/104 全覆盖**；`draftChanged` 计入 U3、`markDraftChanged` 由 U3 拥有并在 U9 注入 → **无重复、无遗漏**）。
**函数闭合核对**：U1 9（含 `_sanHtml`） + U3 10 + U4 7 + U5 2 + U6 2 + U7 2 + U8 1 + U9 0 + U10 5 + U11 1 + U12 1 = **40 个搬入 composable 的函数** + 模板可见 28（其中 12 个在 U1/U4） ，全文件 52 个函数全部有主 ✔。

**★.vue 最终行数的诚实估算（**不要重犯 step 5 的估算错误**）**：
- template 312 + style 128 + script（≈6 个 import + 3–5 行解构 + `onMounted`/`onUnmounted` 各 2–4 行）≈ 45–60 + 块标签/空行 ≈ 6 → **≈490–505 行**。
- ⇒ **`godfileOver800` 5 → 4（本步的判据收益，必然达成）**；但 **`over500` 是否 15 → 14 落在 500 线附近，不得预先承诺**（step 5 的方案把 16→16 估错、实际 16→15；本方案明确：**以提交后 `arch-metrics.mjs` 实跑为准**）。
- ⚠️ **格式敏感**：若 B 把 61 个解构名**一行一个**，script 会多出 55+ 行 → .vue 直接越过 500。⇒ **B 必须按「每行 3–5 个名字」压缩解构（§7 硬指令）**，并在提交信息里附 `wc -l`。

**依赖方向（保证无环）**：

~~~
U1  纯叶子：零内部依赖
U2 → 无内部依赖（vue + U1 的常量）
U3 → U1(countBlanks 不需要；newItem 不需要) + 注入 { form(U2), objectiveSettings(U5), aiTagRef(U7),
                                                          previewFocusKey(U4), markDraftChanged(自持) }
U4 → U1(isCodeStem, newItem, updateFillBlanks, DEFAULT_TYPE_SCORES) + 注入 { form(U2), subQuestions/sqKind/activeIndex(U3) }
U5 → U1(SETTINGS_KEY, DEFAULT_TYPE_SCORES) + 注入 { form(U2) } + ★晚绑定 { subQuestions, saveDraft, loadSq, newSq }(U3)
U6 → U1(normalizeItem, detectCodeLang, ...) + 注入 { questionKind, subQuestions, newSq, loadSq(U3), objectiveSettings(U5) }
U7 → U1(_sanHtml) + 注入 { form(U2), subQuestions/activeIndex/saving?(U3), confirm(U12→见 §2.3-5) }
U8 → 注入 { editId(U12) }（+ request / message）
U9 → 注入 { form(U2), isEdit(U12) } + ★晚绑定 { saveDraft, clearDraftChanged, isDirty }(U3)
U10 → U1(_sanHtml) + 注入 { form(U2), subQuestions/questionKind/computedMaxScore(U3), objectiveSettings(U5),
                            promptAiGenerate(U7), draftSaver? 不需要, isEdit/editId/saving/router(U12), confirm(U12) }
U11 → U1(updateFillBlanks) + 注入 { form(U2), subQuestions/questionKind/loadSq/newSq(U3), objectiveSettings(U5),
                            showMaterial(U3), isEdit/editId(U12) }
U12 → U1..U11 全部（唯一汇聚点）
~~~

**无环**：`useQuestionEditPage` 是唯一被 .vue 调用的；其余**互不 `import`**，跨单元调用一律**参数注入**。

### 2.3 ★五处真实循环依赖与解法（**B 不得图省事让 composable 互相 import**）

| # | 环 | 证据（实测） | 解法（本方案指定） |
|---|---|---|---|
| **1** | **U3 ↔ U5** | `addSub`@461 读 `objectiveSettings.classificationMode`；`applySettings`@502-530 重写 `subQuestions` 并调 `saveDraft`@503 / `loadSq`@530 / `newSq` | **晚绑定**：接线根先建 U5（只依赖 U2），再建 U3（注入 U5 的 `objectiveSettings`），最后 `settings.bindSubQuestions({ subQuestions, saveDraft, loadSq, newSq })`。★**合法性依据**：U5 **不注册任何 watch**（实测），故晚绑定**不改变** §3.1-2 的注册序 |
| **2** | **U3 ↔ U7** | `saveDraft`@453 写 `sq.isAiGenerated = !!aiTag.value`；`loadSq`@456 写 `aiTag.value`；watch@701 写 `aiTag`（U7） | U7 创建 `aiTag`，**以 ref 实例**注入 U3（形参名 `aiTagRef`）；U3 内只读写 `.value`，**禁止第二次 `ref('')`** |
| **3** | **U3 ↔ U4** | `syncObjSqScore`@473 写 `subQuestions[activeIndex].score` 与 `form.sqScore`（U3 域）；`loadSq`@456 写 `form.objectiveItems` 与 `previewFocusKey`（U4 域） | 双向均以**注入的 ref / reactive 实例**发生（U3 注入 `previewFocusKey`，U4 注入 `subQuestions/activeIndex/sqKind`）→ **无 `import` 边** |
| **4** | **U3 ↔ U9**（若 `draftChanged` 判归 U9） | U9 的 `save` 回调调 `saveDraft`（U3）、`enabled` 读 `draftChanged`；U3 的 `saveDraft` 调 `markDraftChanged` | **本方案直接把 `draftChanged` + 三个访问器判归 U3**（§1.3-2）→ 环消失，U9 单向依赖 U3；U9 的 `save` 用**晚绑定** `draftSync.bindSave(() => subs.saveDraft())`。★**合法性依据**：`save` 只在 2s 防抖后**被调用**，setup 期**从不调用**；但 `useDraftAutosave()` 自身**必须在 setup 同步阶段调用一次**（否则失去 §3.1-3① 的 hook 注册） |
| **5** | **U7/U10 ↔ U12**（`confirm`） | `confirm` 来自 `useConfirm()`@334（U12 侧的 setup 期调用） | `confirm` 由 U12 创建后**向下注入** U7/U10；**不得**让 U7/U10 各自 `useConfirm()`（会创建多个实例/多个容器—— 与 step 5 「不得让 W7/W8 各自 useRoute()」同一条纪律） |

### 2.4 本仓既有先例（**均有事实依据**）

| 先例 | 事实（实测） | 对本步的含义 |
|---|---|---|
| `client/src/composables/` 顶层 7 文件 + `submit/` 9 + `project/` 9（**共 25 个 .js**） | 行数 31–223（`wc -l` 实测），**全部 <250 行** | 规模惯例：单 composable ≤250 行 → 本步 12 个新文件**最大 ≈140 行（U6）**，全部合规 |
| `composables/submit/`（step 2）与 `composables/project/`（step 5） | 两个**目录化先例已落地** | 本步用 `composables/question/` 与之一致，**不新建顶层扁平文件** |
| `useDraftAutosave.js:134` `if (getCurrentInstance()) onBeforeUnmount(stop)` | 本仓已有「composable 内注册生命周期」先例 | 说明「composable 内注册 hook」本身合规；但**本方案仍选择集中注册**（§2.1(c)），因为 `stop()` 与 `.vue` 的 `onUnmounted` 体有**固定先后**（§3.1-4） |
| `useDraftAutosave.js` 的契约注释（`:7-21`） | 明确写「各页现有的节拍原样传入（QuestionEdit 2s / TeamEdit 300ms）」 | ⇒ `delay: 2000` **必须逐字搬**（改节拍=改行为，且是本仓写进注释的对外节拍） |
| `useConfirm.js` | `:44 export function useConfirm()` / `:74 return { confirm }` | `confirm` 的形态（函数）不得改 |

---

## 3 ★响应式与生命周期风险逐条判定（本步核心）

> 判定口径：**等价** = 有明确机制论证，无需实测即可接受；**需特殊处理** = 必须遵守指定写法才等价；**不确定需实测** = 静态阅读无法给出确定结论，必须由 C 用行为验证覆盖。

### 3.1 逐条判定表（沿用 step 2/5 的六条框架）

| # | 问题 | 判定 | 理由与依据（全部本轮实测） |
|---|---|---|---|
| **1** | **ref/computed 所有权** | **等价（需特殊处理）** | 模板直接绑定的 **61 个名字** = **29 `setup-ref`（27 `$setup` + 2 静态 string ref）+ 29 `setup-const` + 3 `setup-reactive-const`**（§1.4）。**所有权必须唯一**：`form`→U2；`questionKind/sqKind/subQuestions/activeIndex/slideDir/showMaterial/tabsScrollRef/canScroll*/computedMaxScore`→U3；`previewFocusKey/computedObjSqScore/currentFlatItemType`→U4；`objectiveSettings/tempSettings/showSettings`→U5；`upload*`/`showUploadExam`→U6；`aiTag/genRunning`→U7；`prompt*`→U8；`statusText`→U9；`langs/itemType*/isCodeStem`→U1；`saving/codeEditorRef/isEdit`→U12。跨单元共享一律**注入同一对象引用**（`reactive()`/`ref()` 传引用即共享，**无拷贝**）。★**唯一风险点是「重复创建」**（如 U3 与 U12 各造一个 `subQuestions`）→ 模板绑到错的那个 = **静默失效、不报错**；由 §7 硬约束 + §4.3-L1-c 的 `$setup` 名集合判等兜住。★**本文件独有的所有权陷阱**：`sqKeyCounter`@359（`let`，只服务 `newSq`）与 `draftChanged`@428（`let`，跨 U3/U9/U12 三处读写）—— **必须是「闭包内单实例」**，否则 `_key` 重复 / 脏标记分叉（§1.3-2/4）。另：**`computed` 的惰性求值语义不变**（依赖追踪由运行时按访问顺序建立，与声明位置无关）。 |
| **2** | **watch / watchEffect 注册顺序** | **需特殊处理（★本步与 step 5 的关键差异）** | 全文**5 个 `watch`、0 个 `watchEffect`**（实测）：`watch(subQuestions)`@357、`watch(()=>form.sqScore)`@367、`watch(()=>form.objectiveItems.map(i=>i.score))`@482、`watch(()=>[form.content,form.referenceAnswer,form.objectiveItems,form.sqScore,form.scoringCriteria])`@699、`watch(()=>form.referenceAnswer)`@701。**五个全部是 setup 同步阶段的顶层注册**（**不在 `onMounted` 内、不在 `await` 之后**）。★★**与 step 5 不同：本文件 5 个 watch 的源有交叠** —— `form.sqScore` 同时是 #2(367) 与 #4(699) 的源；`form.referenceAnswer` 同时是 #4(699) 与 #5(701) 的源 ⇒ **同一 tick 内多个 watcher 的执行次序 = 注册序**，搬移后**必须保持 `357 < 367 < 482 < 699 < 701`**。★当前 5 个回调的副作用可交换（#2 写 `sq.score`、#4 调 `draftSaver.schedule()`、#5 清 `aiTag`），**静态判定为等价**；但「注册序」本身是**运行时事实**（Vue 按创建 id 排序 flush 队列）⇒ **登记 U2**。★守形式：watch@357/@367 必须与 `subQuestions`/`sqKind` 同单元（U3）、watch@482 与 U4 同单元、watch@699 与 U9、watch@701 与 U7 —— 否则新增跨单元 import 边。 |
| **3** | **onMounted / onBeforeUnmount / onActivated** | **等价（3 条硬约束）** | ① Vue 规则：hook 必须在 setup **同步执行阶段**调用（含 setup 内同步调用的 composable）；在 `await` 之后或异步回调里调用**会失效并告警**。② 全文只有 **`onMounted`@850** 与 **`onUnmounted`@851**；**无 `onActivated`/`onDeactivated`/`keepAlive`/`getCurrentInstance`/`provide`/`inject`**（实测 grep 全 0）。③ ★**但有第二个 hook 源**：`useDraftAutosave()` 在 `:692` 被调用，其内部 `useDraftAutosave.js:134` 执行 `if (getCurrentInstance()) onBeforeUnmount(stop)` ⇒ 实际 hook 队列 = **`[stop (beforeUnmount, 注册于 :692), onUnmounted 体 (注册于 :851)]`**；Vue 保证 `beforeUnmount → unmounted` 的**跨类顺序固定**，故 `stop()` 必先于 `removeEventListener('beforeunload')` 与 `saveDraft()`。④ **无异步注册**（3 处注册全在 setup 同步阶段）。**硬约束**：**①** `useDraftAutosave(...)` 必须仍在 setup 同步阶段被调用**恰好一次**（搬进 U9 后若被延迟/放到 `onMounted` 或异步分支 → `getCurrentInstance()` 为 null → **hook 不注册 → 2s 防抖定时器 + `visibilitychange` 监听泄漏**，且**静态判等看不见**）；**②** `.vue` 只保留 1 个 `onMounted` + 1 个 `onUnmounted`；**③ 禁止把 `onUnmounted` 改成 `onBeforeUnmount`**（会把「stop 先于 beforeunload 移除」的**固定跨类顺序**降级为**依赖注册序**的同类顺序）。 |
| **4** | **计时器/监听/observer 的清理顺序** | **等价（需特殊处理）** | ★★**实测：本文件自身零计时器、零 observer** —— `setInterval`/`setTimeout`/`MutationObserver`/`ResizeObserver`/`IntersectionObserver` **全 0 命中**（与 step 5 的 `checkerTimer` 完全不同）。自有监听只有 **1 个 `window` `beforeunload`**（add`850` / remove`851`）。**委托给 `useDraftAutosave` 的**：`setTimeout` 防抖（`delay:2000`，`useDraftAutosave.js:88`）+ `document` `visibilitychange`（`:117-118`）+ `clearTimeout`/`removeEventListener` 在 `stop()`（`:126-131`，并置 `disposed=true`）；`intervalTimer` 恒 `null`（本页未传 `interval`）。★**必须逐位保持的三步卸载序**：**① `stop()`**（`clearTimeout(debounceTimer)` → `document.removeEventListener('visibilitychange')` → `disposed = true`）→ **② `window.removeEventListener('beforeunload', beforeUnloadHandler)`** → **③ `saveDraft()`**。其中 **②③ 的语句序**（同一回调内 `removeEventListener` 在前）**逐字不得调换**。★**既有缺陷、不得顺手修**：`handleUploadExam` 的 SSE reader 循环（`:576-596`）**不可取消**，卸载后仍可能写 ref（改前即存在）→ **照旧保留**，C 的职责是证明「照旧存在且未被放大」（与 step 5 的「双重释放」同类处置）。 |
| **5** | **路由/store/请求注入时机** | **等价（需特殊处理）** | ① **无 pinia/store**（实测无 import、无 `useStore`）。② `useRouter()/useRoute()` 各**一次**`@333`。③ ★★**`editId`/`isEdit` 是 setup 期一次性求值的普通 `const`（不是 `computed`！）**：`editId = route.params.id \|\| null` / `isEdit = !!editId`（同行 `:335`）⇒ 接线根**必须在 setup 同步阶段求值一次**，**不得改成 `computed`、不得延迟到 hook 内**（否则改变「同一组件实例内路由参数变化」的行为面）；同理 `defaultSettings = loadSettings()`@414 也在 setup 期读 `localStorage`。④ `request`/`message` 为**静态 import**（无注入时机问题）；`request.js:5` 的 `baseURL = import.meta.env.VITE_API_BASE_URL \|\| '/api'` 是构建期替换。⑤ **两条路由都没有 props** → **无 `defineProps`**（与 step 5 相反，**不存在「props 默认值路径 vs 显式传入路径」这一类风险**）⇒ 本步的「形态求值」风险**低于** step 5 的 U1。⑥ 全文 **5 个请求点**：`:399`(prompt-preview GET) `:564`(parse-exam-stream SSE `fetch`) `:706`(question GET) `:753`(generate-reference POST) `:845`(PUT/POST)。 |
| **6** | **动态 import / 第三方编辑器实例的持有与销毁** | **等价（1 处需特殊处理）** | ① ★**无动态 `import()`**（实测 0 命中）；全文 1 处 `import.meta.env`（`:563`，在 `handleUploadExam` 内，静态可分析、位置无关）。组件本身由路由 `component: () => import(...)` 懒载入（router :31/:32）—— **与本步无关**（不动路由）。② ★★**本文件不持有任何编辑器实例**：Monaco 由子组件 `CodeEditor.vue` 自持并自清（`CodeEditor.vue:135` `onUnmounted(() => { subscription?.dispose(); editor?.dispose(); })`，`:283` `defineExpose({ format })`），tiptap 由 `RichEditor` 自持；父侧**只有模板 string ref** `codeEditorRef`@198，被 `formatCode`@450 以 **`?.` 可选链**调用。⇒ **若 `codeEditorRef` 未被解构回 `.vue` 顶层，`ref="codeEditorRef"` 绑不上 → `formatCode` 静默 no-op**（`?.` 吞掉一切）→ **登记 U4**。`tabsScrollRef`@69 同理（被 `onTabsScroll`/`scrollTabs` 使用；**若失绑**，`canScrollLeft/Right` 恒 false → 左右滚动按钮永远隐藏 → **静默**）。③ 其他第三方：`DOMPurify`（→U1）、`mammoth`/`XLSX`（→U6）、`message`（→U6/U8/U10）。 |

### 3.2 ★「不确定需实测」清单（交给 C，**共 6 条**）

| 编号 | 不确定点 | 为什么我判不了 | C 的最小探针 |
|---|---|---|---|
| **U1** | ★**双形态（主观题/客观题）求值一致性** | 静态可证「定义式与赋值点未改」，但**无法证明运行时模板在两个形态下拿到的布尔值/派生值与改前相同**；模板字节判等与 `$setup` 名集合判等**都看不见「值是错的」**。★本文件**无 props/无第二路由**，形态完全由用户交互与后端数据驱动 ⇒ 风险低于 step 5 的 U1，但**面更大**（形态还会被 `fillFromParsed`/`load` 反向改写） | 改前/改后各跑 5 个场景：① 进入 `/exam/teacher/questions/new` → 断言「点击选择题目类型」提示 + 右侧「选择题目类型后开始编辑」；② 选「主观题」→ 断言出现 `RichEditor` 题干区（`.content-item .tiptap`）、出现 `CodeEditor`（`.lc-editor-wrap .monaco-editor`）、**「实时预览」不存在**；③ 选「客观题」→ 断言出现 `.obj-add-bar` + 「实时预览」、**`.content-item` 不存在**；④ `/exam/teacher/questions/1/edit`（主观题数据）→ 断言 tabs 无题型后缀（`sqTypeName` 返回 `''`）；⑤ 同上但数据含客观小题且 `classificationMode='flat'` → 断言 tab 文本形如「第1小题 单选」。**改前改后 5 组断言必须逐条相同** |
| **U2** | ★**5 个 watch 的同 tick 触发序与「每次变更仍各触发一次」** | 注册序是运行时事实（Vue 按创建 id flush）；静态只能证「回调副作用两两可交换」。且 `form.sqScore` / `form.referenceAnswer` **各被两个 watch 同时监听**（本文件独有） | 用可观测副作用代替内部插桩：① 在编辑页改 `form.sqScore`（主观题）→ 断言「总分」(:25) 与「小题分值」同步更新**且**动作条状态文本变为「保存中…」（= watch#2 与 watch#4 **都**触发）；② 在 `aiTag` 非空（AI 生成后）时手改 `CodeEditor` 内容 → 断言 AI 标签(:189)消失**且**草稿保存被调度（= watch#4 与 watch#5 **都**触发）；③ 2s 后断言**恰好 1 次** `PUT`（防抖未被拆分/放大）。**①②③ 改前改后逐条相同** |
| **U3** | ★**卸载期清理完整性 + `useDraftAutosave` 的 hook 仍注册** | 静态可证「文本未改」，**不可证**：`stop()` 仍被注册（依赖 `getCurrentInstance()` 非 null）、存活定时器/监听为 0、控制台零 error | `page.addInitScript` 猴补 `setTimeout`/`clearTimeout`/`window.addEventListener`/`removeEventListener`/`document.addEventListener`/`removeEventListener`/`console.error` 计数；改前/改后各做：进入编辑页 → 输入内容触发一次防抖 → 路由离开 → 断言：**① 存活 `setTimeout` = 0**；**② `visibilitychange` 监听净增 = 0**；**③ `beforeunload` 监听净增 = 0**；**④ 控制台零 error**；**⑤ 记录卸载期调用序并断言为 `clearTimeout → document.removeEventListener(visibilitychange) → window.removeEventListener(beforeunload) → saveDraft` 的效果序**（与 §3.1-4 逐位相符）。★**并证明 SSE 中途卸载的既有行为照旧**（上传进行中离开页面 → 不新增 error 类型） |
| **U4** | ★**2 个模板 string ref 仍绑定**（`codeEditorRef` / `tabsScrollRef`） | 静态可证「名字仍在 `$setup`」，但**看不到值**：失绑时 `formatCode` 因 `?.` 静默 no-op、tabs 滚动按钮静默恒隐藏 —— **L0/L1/build 三类判据全盲** | ① 主观题形态：在 `CodeEditor` 里输入**未格式化**的代码（如 `int  main(){return 0;}`）→ 点「⚡格式化」(:192) → 断言内容发生格式化（失绑则**完全无变化**）；② 客观题形态：造 ≥8 个小题使 tabs 溢出 → 断言 `.tab-scroll-btn` 右侧按钮 `visibility` 由 hidden 变 visible 且点击后 `scrollLeft` 变化（失绑则恒 hidden） |
| **U5** | ★**保存守卫 5 条分支 + 2 条 confirm 弹窗** | `handleSave`@793-831 有 4 条提前 `return` + 1 条「未设分值」return，`doSave` 有 PUT/POST 分流；文案是**用户可见契约**。静态可证「文本未改」，**不可证「改后仍能命中」**（需要构造特定数据/后端） | 夹具数据驱动：① 标题空 → `message.warn('请输入题目标题')`；② 无小题 → `'请至少添加一道小题'`；③ 主观题题干空 → `'第N题 主观题尚未填写题目内容'`；④ 主观题有题干无参考答案 → 弹「N 道主观题未设参考答案」confirm（`_sanHtml` 净化后的表格 + `okText='AI 生成参考答案'`）；⑤ 有小题但分值为 0 → `'第N小题（编程题/单选）尚未设置分值…'`；⑥ 全部就绪 → 弹「确认保存」+ 表格（含**未设置**红色标记分支）→ 确认后：`isEdit` 走 `PUT /teacher/questions/:id`、新建走 `POST /teacher/questions`，body 逐字段对拍（`title/difficulty/maxScore/material/objectiveSettings/subQuestions[]`）。**6 组文案与请求体改前改后逐条相同** |
| **U6** | **`fillFromParsed` 的 flat/group 分组与 `questionKind` 推导** | 纯函数但**输入面大**（4 类输入 × 2 种 `classificationMode` × 3 条 `questionKind` 推导分支），手工阅读易漏；且它会**反向改写** `questionKind`/`subQuestions` | 上传夹具（`.xlsx`/`.docx` 各一份）：① 仅 `type='code'` 混合 → `questionKind='subjective'`；② 仅客观 → `'objective'`；③ 混合 → `'subjective'`；④ `classificationMode='flat'` 下连续同类型题合并为一个小题、遇 `code` 断开；⑤ `'group'` 下全部客观题合并为**一个小题**、`code` 各自成小题；⑥ 解析后断言 tab 数量/每题分值（`DEFAULT_TYPE_SCORES`）/填空题 `_blankParts` 自动空数。**①–⑥ 改前改后逐条相同** |

> **判定说明**：U1–U6 属「静态阅读无法排除」的类，**不是「我猜有问题」**。其中 **U4 是本文件独有的**（由「父组件只持 string ref、子组件自持编辑器实例」这一结构直接产生；step 5 的 Monaco 是父侧自持，**没有对应项**）。**U3 描述的 SSE 中途卸载行为在改前就存在** —— C 的职责是**证明它照旧存在且没有被放大**，不是修它。

---

## 4 ★护航配方（DoD §5 的 client A 档 5 条判据，逐条落地）

### 4.1 事实核查（本轮实测，**不采信历史报告**）

| 问题 | 实测结论 | 证据 |
|---|---|---|
| client 侧有多少单测？ | **0**（与 step 2/5 一致） | `client/package.json` 的 scripts 只有 `dev/build/preview`，**无 vitest/jest/test** |
| 浏览器驱动可用吗？ | **可用**：`@playwright/test@1.60.0`，且 **chromium-1217 / chromium-1223 / chromium_headless_shell-1217/1223 / firefox-1522 / webkit-2287 均已安装**（`~/Library/Caches/ms-playwright`） | `ls` + `require(...package.json).version` |
| L1 编译器可用吗？ | **可用**：`@vue/compiler-sfc@3.5.34`（= `vue@3.5.34`） | `client/node_modules` |
| ④ 扫描器依赖可用吗？ | **可用**：`@babel/parser@7.29.8` + `@babel/traverse@7.29.8` | `client/node_modules` |
| **有 jsdom 吗？** | ❌ **全仓无**（`client/node_modules`、根 `node_modules`、`tests/ui-redesign-verify/node_modules` 三处 `ls` 均 "No such file"） | ⇒ **⑤ 的装置形态被钉死**：要么 `createRenderer` + 自写 nodeOps（step 5 已实证，**推荐**），要么真浏览器 |
| **既有 E2E 覆盖本文件吗？** | ★**行为覆盖 ≈ 0**。唯一命中：`tests/ui-redesign-verify/specs/visual-tokens.spec.mjs:114` `{ name: 'question-new', url: '/exam/teacher/questions/new', wait: '.ant-form', optional: true, extraWait: 3000 }` —— 是**令牌/视觉探针**（只等选择器，无断言），且 `optional: true`。`visual-regression.spec.mjs:199-200` 走的是 `/exam/teacher/questions`（**列表页**，不是本文件）。**无任何 spec 走 `questions/1/edit`** | `grep -rn "questions/new\|/teacher/questions" tests/ui-redesign-verify/specs/*.mjs` |
| axe 可用吗？ | **本轮未复测**；step 5 实测三处均无 `axe-core`、`/tmp/t5-tools` 已清理、**禁联网** ⇒ **按「不可用」处理** | step 5 verify §4.1 + constraints §1 |
| 端口/服务现状 | **本轮未探测**（A 属只读，且硬禁令禁止起服务）。⇒ B/C 若用真后端 rig，**必须自检** `lsof -nP -iTCP -sTCP:LISTEN` 且严禁 `:5173`/`:3000` | — |

### 4.2 L0 · **2 段**切片字节判等（成本 ≈ 10 分钟，零依赖）

★★**本文件只有 1 个 style 块**（§1.0 实测）⇒ 与 step 5 的「必须切 3 段」**不同**，本步切 **2 段**；但**必须显式打印 `descriptor.styles.length` 作为自证**（否则「切了几段」这件事本身没有证据）。

~~~bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
ANCHOR=$(git rev-parse HEAD)          # C 执行前必须重新取；本方案实测锚点见文首
F=client/src/views/teacher/QuestionEdit.vue
rm -rf /tmp/q6a && mkdir -p /tmp/q6a/before
git archive "$ANCHOR" "$F" | tar -x -C /tmp/q6a/before
B=/tmp/q6a/before/$F
# —— 改前切片（2 段）——
awk 'NR>=1  &&NR<=312' "$B" > /tmp/q6a/b.template    # <template>…</template>
awk 'NR>=856&&NR<=983' "$B" > /tmp/q6a/b.style       # <style scoped>…</style>
# —— 改后切片 ——
awk 'NR>=1  &&NR<=312' "$F" > /tmp/q6a/a.template
awk 'NR>=856&&NR<=983' "$F" > /tmp/q6a/a.style
# —— 切片边界自证（必须打印，防「切片切错还得 PASS」）——
head -c 10 /tmp/q6a/b.template; echo; tail -c 12 /tmp/q6a/b.template; echo
head -c 14 /tmp/q6a/b.style;    echo; tail -c 9  /tmp/q6a/b.style;   echo
cmp /tmp/q6a/b.template /tmp/q6a/a.template && \
cmp /tmp/q6a/b.style    /tmp/q6a/a.style    && echo TEMPLATE_STYLE_BYTE_IDENTICAL
~~~

**L0 补充 A（覆盖「函数体是否被改写」）**：按 §2.2 的行号区间从改前文件切块 → 从改后 composable 切**同名块** → 逐块 `shasum -a 256` 对拍。期望：**104 个声明块全等**（允许差异白名单：banner / import 行 / `export` 前缀 / 缩进 / §2.3 的 `bindSubQuestions` 与 `bindSave` 晚绑定包装行）。
**L0 补充 B（类名闭合）**：提取模板 `class` 字面量 ∪ script 返回的类名（`itemTypeTagClass` 返回的 `tag-warning`/`tag-success`/`tag-accent`）→ 与 `<style>` 块 ∪ `client/src/style.css` 的选择器求差；**改前改后差集必须相同**。★实测：三个 `tag-*` 类**不在本文件 style 块内**（在 `client/src/style.css:131/142/152`）⇒ 本文件的 style 块与其无关，但**必须断言它没被"顺手"搬进/搬出**。

### 4.3 L1 · 编译级对拍（成本 ≈ 20–40 分钟，★本步最锋利且**最容易被写错**的判据）

★**本步对 step 5 范本的必要纠正（本轮实测，3 组对照）**：

| 对照口径 | 实测结果 | 能否作为判据 |
|---|---|---|
| 各自 own-bindings 编译模板 → 逐字节比 | **不等**（**84 行差异**） | ❌ **会对正确重构误报 FAIL** |
| 各自 own-bindings → `bindings` 键/类型比对 | **115 处差异**，其中 **59 处模板可见名 `→ setup-maybe-ref`**（其余为「名字随搬移从 `.vue` 消失」） | ⚠️ 只能按**允许迁移表**判（见下） |
| **冻结改前 bindingMetadata** → 两侧同一份元数据编译模板 | **逐字节相等 = true**（同源自证：own vs frozen 也为 true） | ✅ **这才是「模板零改动」的权威判据** |

**差异机制（实测定位）**：解构式接线把 61 个模板可见名全部降级为 `setup-maybe-ref`；编译器对 `setup-maybe-ref` 的名字**不能确定是函数**，于是把事件处理器从「静态 prop」降为 **动态 prop** —— 产物里出现 `}, 8 /* PROPS */, ["onClick"])` 之类的片段与 `_cache[N]` 索引位移（`_cache` 152 → 154）。**语义不变**（函数值照旧经 `$setup` `proxyRefs` 取到），但**字节必变**。⇒ **「模板编译产物逐字节相同」这句话只有在冻结元数据的前提下才成立。**

~~~bash
mkdir -p /tmp/q6a/render && cd "/Users/you/My Projects/My Vue/Exam-DeepSeek/client"
node <<'DSHNODE'
const fs=require('fs');
const {parse,compileScript,compileTemplate}=require('@vue/compiler-sfc');
const FN='QuestionEdit.vue';
function load(file){ const {descriptor}=parse(fs.readFileSync(file,'utf8'),{filename:FN});
  const s=compileScript(descriptor,{id:'q6fix01'});              // ★ id 两侧必须相同
  return {d:descriptor, b:s.bindings}; }
const A=load('/tmp/q6a/before/client/src/views/teacher/QuestionEdit.vue');
const B=load('src/views/teacher/QuestionEdit.vue');
const FROZEN=JSON.parse(JSON.stringify(A.b));                    // ★ 冻结改前元数据（JSON 往返去引用）
const tpl=(o,md)=>compileTemplate({source:o.d.template.content,filename:FN,id:'q6fix01',scoped:true,
                                   compilerOptions:{bindingMetadata:md}});
const a1=tpl(A,A.b), b1=tpl(B,B.b);        // own-bindings（仅作诊断）
const a2=tpl(A,FROZEN), b2=tpl(B,FROZEN);  // ★ 权威口径
const out={};
out.sanity_template_source_byte_equal = A.d.template.content===B.d.template.content;
out.template_compile_frozen_byte_equal = a2.code===b2.code;      // ★ 期望 true
out.template_compile_own_byte_equal    = a1.code===b1.code;      // 期望 false（诊断用，不作判据）
out.styles_array_equal = JSON.stringify(A.d.styles.map(s=>({scoped:!!s.scoped,content:s.content})))
                       === JSON.stringify(B.d.styles.map(s=>({scoped:!!s.scoped,content:s.content})));
out.styles_count = B.d.styles.length;                            // ★ 期望 1（自证"几个 style 块"）
const names=c=>[...new Set([...c.matchAll(/\$setup\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))].sort();
const NA=names(a1.code), NB=names(b1.code);
out.setup_names_before=NA.length; out.setup_names_after=NB.length;
out.setup_names_missing=[...NA].filter(n=>!NB.includes(n));      // ★ 期望 []
out.ctx_refs_after=(b1.code.match(/_ctx\./g)||[]).length;        // ★ 期望 0
out.unref_calls_after=(b1.code.match(/unref\(/g)||[]).length;    // ★ 期望 0
const allowed=(f,t)=> t===undefined ? true : (t==='setup-maybe-ref' && f!==undefined);
const bad=[]; for(const k of new Set([...Object.keys(A.b),...Object.keys(B.b)]))
  if(!allowed(A.b[k],B.b[k])) bad.push(k+': '+A.b[k]+' -> '+B.b[k]);
out.illegal_binding_migrations=bad;                              // ★ 期望 []
console.log(JSON.stringify(out,null,1));
process.exit(out.template_compile_frozen_byte_equal && out.styles_array_equal && out.styles_count===1
          && out.setup_names_missing.length===0 && out.ctx_refs_after===0 && out.unref_calls_after===0
          && out.illegal_binding_migrations.length===0 && out.sanity_template_source_byte_equal ? 0 : 1);
DSHNODE
~~~

**判据（4 条，缺一不可；退出码必须 0）**：
- **L1-a** `template_compile_frozen_byte_equal === true`（**权威**：模板源未被改动，且与 script 侧完全解耦）。
- **L1-b** `setup_names_missing === []` 且 `ctx_refs_after === 0` 且 `unref_calls_after === 0`（**61 个模板可见名一个不漏**；`_ctx` 出现 = 有名字掉出 setup 作用域、退化到组件代理）。
- **L1-c** `styles_array_equal === true` 且 `styles_count === 1`（同时证明内容与 `scoped` 标志，并**自证 style 块个数**）。
- **L1-d** `illegal_binding_migrations === []`（允许表 = 「`X → setup-maybe-ref`」或「名字消失」；**任何其它方向 = FAIL**）。★注意：**"名字消失"只对「非模板可见名」合法** —— 模板可见名的消失已被 L1-b 拦截，两条判据互补。
- ⚠️ **不要对拍整个 `compileScript().content`**（step 5 已证会误报）；**也不要**把 `template_compile_own_byte_equal` 当判据（本步新证）。

**★patchFlag 差异如何区分「同类」与「行为差异」**（本文件实测口径）：

| 现象 | 归类 | 处置 |
|---|---|---|
| `_component_x` 声明**顺序**变化、`_hoisted_N`/`_cache[N]` **编号位移**、`_createElementVNode` 行序变化 | **同类**（等价重排） | 允许；但**必须同时满足** L1-a（冻结元数据字节相等） |
| 事件/属性从静态变为 `8 /* PROPS */` + `["onClick"]` 数组（本次实测 **84 行**全部是这一类） | **同类**（更新粒度变细，语义不变） | 允许，**但只允许出现在 own-bindings 诊断口径里**；若冻结口径也出现 → FAIL |
| 某元素 `patchFlag` 数值**跨类**变化（如 `8 PROPS` → `16 FULL_PROPS`）、新增 `512 NEED_PATCH`、或 `dynamicProps` 列表增删 | **行为差异** | **直接 FAIL**，不得以"同类"解释 |
| 片段类 flag 变化（`64 STABLE_FRAGMENT` ↔ `128 KEYED_FRAGMENT`） | **行为差异**（列表 key 语义变了） | **直接 FAIL** |

**操作口径**：把两份产物的 `/* NAME */` 注释按 `名称=数值` 做**多重集**统计（`[...code.matchAll(/(\d+) \/\* ([A-Z_]+) \*\//g)]`）——**多重集相等** ⇒ 同类；**不等** ⇒ 逐条落到上表判定。★实测参考：own-bindings 下本文件的多重集**不等**（`PROPS=8` 34→41、`KEYED_FRAGMENT=128` 9→10、`STABLE_FRAGMENT=64` 5→4）——**这正是「必须用冻结口径」的原因**，而不是"存在行为差异"。

### 4.4 ④ 自由标识符扫描（**必做**，成本 ≈ 1 分钟/轮）

**实现（AST 作用域分析，**不是**正则）**：`@babel/traverse@7.29.8` → `parse(sourceType:'module')` → `traverse(ast, { Program(p){ p.scope.crawl() } })` → 对每个 `ReferencedIdentifier` 判 `path.scope.getBinding(name)`；未绑定且不在紧凑的 JS/浏览器全局白名单内 ⇒ 计为**自由标识符**（⛔ 白名单**不得**包含 `objectiveSettings`/`subQuestions` 这类业务名）。

★★**本步新增的实测陷阱（务必写进 C 的实现）**：**单遍（边走边声明）的实现会在「当前正确文件」上报 7 个假阳性** —— 实测：`objectiveSettings`、`itemTypeLabel`、`loadSq`、`markDraftChanged`、`scrollPreviewTo`、`fillFromParsed`、`doSave` 全部是**「在函数体内前向引用、声明在文件后面」**（TDZ 安全，因为函数体只在调用时求值）。⇒ **扫描器必须先建作用域树并声明、再解析引用（两遍）**，或直接使用 `@babel/traverse` 的 `scope.crawl()`（它天然两遍）。

**实测基线（本轮，两遍/`crawl` 口径）**：

| 对象 | 结果 |
|---|---|
| `QuestionEdit.vue` 的 script 段（540 行） | **自由标识符 = 0** ✅ |
| **正控 1**：删掉 `import DOMPurify from 'dompurify';` | 报 **1** 个：`["DOMPurify"]` ✅ |
| **正控 2**：把 `function saveDraft(` 改名为 `saveDraftRenamed(`（保留调用点） | 报 **1** 个：`["saveDraft"]` ✅ |
| **正控 3**：从 composable 的注入清单删掉一个依赖（`{form,sqKind,syncObjSqScore,updateFillBlanks}` → `{form,sqKind,syncObjSqScore}`） | 报 **1** 个：`["updateFillBlanks"]` ✅（正是 DoD 所说的「方案漏列依赖导致注入缺失」形态） |
| **全仓 25 个既有 client composable** | **23 个 = 0**；**1 个真缺陷**（见下）；**1 个扫描器假阳性**（见下） |

★★**真实样本（本步顺带产出，已单独回报 Captain）**：`client/src/composables/submit/useQuestionNav.js:78` 的 `boxIndex` 读 `subQuestions.value`，但**注入清单 `:10-17` 与调用点 `useSubmitPage.js:121` 都没有 `subQuestions`**（同调用点的 `useDraftSave`/`useSubmitActions`/`useCountdown` 都正确传了）⇒ **漏列依赖**；且 `onBoxKeydown`（`:108`）第一句即 `boxIndex.value.findIndex(...)`，而它**被模板绑定**（`Submit.vue:43/:60` `@keydown="onBoxKeydown(...)"`）⇒ **学生答题页在题号方块上按任意键即抛 `ReferenceError`**。**L0 字节切片 / L1 bindings+模板编译 / build / 既有 E2E 四类判据对它全盲。**（建议：单独派单修 + 把判据④**回溯**到 step 1–5 的全部产物。）
⚠️ **同一扫描的假阳性（实现要点）**：`client/src/composables/useConfirm.js:36-37` 的 `then(onFulfilled, onRejected) { … }` 是**对象方法简写的形参** —— 手写 walker 若不声明 `ObjectMethod`/`ClassMethod` 的 `params`（以及 `AssignmentPattern` 默认值），就会把形参当自由标识符。**@babel/traverse 口径不犯此错**（故推荐它）。

**落地形态（B 每批、C 每轮各跑一次）**：
~~~bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek/client"
node <<'DSHNODE'
// 输入：待扫模块路径列表（新 composable + .vue 的 script 段）；输出：违规列表；退出码 0=零违规
const fs=require('fs');
const parser=require('@babel/parser'), traverse=require('@babel/traverse').default;
const GLOBALS=new Set(['undefined','null','true','false','NaN','Infinity','console','window','document',
 'localStorage','sessionStorage','fetch','setTimeout','clearTimeout','setInterval','clearInterval',
 'Promise','Object','Array','String','Number','Boolean','Math','JSON','Date','RegExp','Error','Map','Set',
 'TextDecoder','TextEncoder','URL','FormData','AbortController','structuredClone','queueMicrotask',
 'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','globalThis',
 'MutationObserver','ResizeObserver','IntersectionObserver','performance','crypto','navigator']);
function scan(code){ const ast=parser.parse(code,{sourceType:'module',errorRecovery:false});
  const free=new Set();
  traverse(ast,{ Program(p){ p.scope.crawl(); },
    ReferencedIdentifier(p){ const n=p.node.name;
      if(!p.scope.getBinding(n) && !GLOBALS.has(n)) free.add(n+'@'+p.node.loc.start.line); } });
  return [...free]; }
let bad=0;
for(const f of process.argv.slice(2)){ const src=fs.readFileSync(f,'utf8');
  const code=f.endsWith('.vue') ? src.split('\n').slice(314,853).join('\n') : src;   // .vue 只取 script 体
  const r=scan(code); if(r.length){ bad++; console.log('FREE', f, JSON.stringify(r)); } else console.log('OK  ', f); }
console.log('FILES_WITH_FREE='+bad); process.exit(bad?1:0);
DSHNODE
~~~

### 4.5 ⑤ 真运行时对拍（**必做**，成本 ≈ 首次 3–5 h，之后每批 ≈30 min）

**装置形态（★优先复用 step 5 已实证的形态，不要另发明）**：`jsdom 不存在` ⇒ **不要试图在 Node 里 `mount`**。两种可选，**推荐 A**：

| | 装置 | 组成 | 成本 |
|---|---|---|---|
| **A（推荐）** | **仓库外「真 Vue + 真模板产物 + 真生命周期」无 DOM 装置**（step 5 verify §4 已跑通，可直接复用其骨架） | ① 12 个新模块的**逐字节副本**（`cmp` 全等自证）；② 插桩副本（**仅在函数入口加一行计数**，其余逐字）；③ **接线根 `page.mjs` 由真 `.vue` 的 `<script setup>` 原文派生**（import 行上提 + specifier 重指向替身），`return` 直接采用编译器产出的 `__returned__`；④ **模板 = `compileTemplate()` 的真实产物**，用**真 `vue@3.5.34` 的 `createRenderer` + 自写 nodeOps** 挂载 ⇒ 模板对 `$setup` 的每一次访问都真发生；⑤ **真 `onMounted`/`onBeforeUnmount`/`onUnmounted`**；⑥ 替身：`vue-router` / `ant-design-vue`(`message`) / `dompurify` / `api/request` / 5 个 `.vue` 组件（渲染全部 slot）/ **`Transition` 改直通**；⑦ `import.meta.env.BASE_URL → "/"`、极简 `document` 替身；**无网络、无端口、不碰库** | 复用 step 5 骨架 ≈1–2 h 适配（**最大的一笔节省**） |
| **B（备选）** | **Playwright + 仓库外静态产物 + `page.route` 拦截 API** | `vite build --outDir /tmp/q6b/dist`（**禁碰 `client/dist`**）+ 31xx 静态服务 + `page.route('**/exam/api/**')` 直接 fulfill（**不必写夹具服务**；`client/.env.production` 的 `VITE_API_BASE_URL=/exam/api` 正好同源）+ `page.addInitScript` 预置 `localStorage.token/user`（router `:66-89` 守卫需要；`user.role='teacher'`） | ≈1.5–2 h（含构建与登录态） |

**★要验的运行时事实清单（改前/改后各跑一遍，逐条相同）**：

| # | 事实 | 期望 | 对应 |
|---|---|---|---|
| **T1** | **接线根的返回面** | `__returned__` 含全部 **59 个 `$setup` 名 + 2 个 string ref**；渲染**不抛** "was accessed during render but is not defined" | U1 |
| **T2** | **类型事实（运行时，不是编译期）** | 29 个 ref/computed **`isRef === true`**、`form` 是 `reactive`（非 ref）、`langs` 是数组、`saving` 初值 `false` | U1 |
| **T3** | **双形态求值** | 驱动 `onPickKind({key:'subjective'})` / `({key:'objective'})` 后，渲染树分别出现/不出现 §3.2-U1 的 5 组节点；`sqDisplayLabel` 在 flat/group 两模式返回不同文本 | U1 |
| **T4** | **调用序（setup 期）** | 「5 个 watch 的注册序」= `357→367→482→699→701`（插桩 `watch` 或在各回调入口置序） | U2 |
| **T5** | **同 tick 触发序** | 同步写 `form.sqScore` → 序 `[sqScore-watch(367), autosave-watch(699)]`；同步写 `form.referenceAnswer` → 序 `[autosave(699), aiTag-clear(701)]` | U2 |
| **T6** | **守卫分支** | `handleSave` 的 5 条 return 各命中一次、文案逐字相同；`doSave` 在 `isEdit` 真假时分别发出 `PUT` / `POST` | U5 |
| **T7** | **清理顺序（卸载）** | `unmount()` 后 oplog 必须为：`clearTimeout(debounce)` → `document.removeEventListener('visibilitychange')` → `window.removeEventListener('beforeunload')` → `saveDraft()` 的**副作用序**；存活定时器 = 0、监听净增 = 0 | U3 |
| **T8** | **hook 队列** | `beforeUnmount` hook **恰好 1 个**（来自 `useDraftAutosave`）、`unmounted` hook **恰好 1 个**（来自 `.vue`）；beforeUnmount 整体先于 unmounted 体 | U3 |
| **T9** | **string ref 真绑定** | `codeEditorRef.value` 非 null（主观题形态）、`tabsScrollRef.value` 非 null；调 `formatCode()` 时替身 `CodeEditor` 的 `format()` 被调用**恰好 1 次**（失绑则 0 → 抓 U4） | U4 |
| **T10** | **非响应式单实例** | `newSq()` 连续 N 次 → `_key` 严格递增无重复（抓 `sqKeyCounter` 被复制）；`markDraftChanged()` 后 `hasDraftChanged()===true` 且 `draftSaver` 的 `enabled()` 读到同一状态（抓 `draftChanged` 分叉） | §1.3-2/4 |
| **T11** | **既存行为照旧** | `handleUploadExam` 的 SSE 中途 `unmount()` ⇒ 不新增 error 类型、不抛；与改前一致（**证明未被放大**，不是修它） | U3 |
| **T12** | **`useDraftAutosave` 契约未变** | 传入 `delay` 仍为 **2000**；`save`/`enabled` 调用序不变（`enabled()` 为假时不产生请求） | §2.4 |

**装置自证（每次必做）**：`client/dist` 未变（`find client/dist -newermt` 或指纹对照）、仓库内**零写入**、所有副本 `cmp` 全等、**两次同场景运行逐字节相同**（无时序抖动）。

### 4.6 L2 · 只靠静态判等覆盖不到的交互（Playwright，成本逐项标注）

| id | 场景 | 为什么静态判等盖不到 | 装置 | 估价 |
|---|---|---|---|---|
| N1 | **双形态渲染 + 3 组入口**（U1） | 形态是运行期状态；`$setup` 名集合判等看不到"值" | A 或 B | 35 min |
| N2 | **保存守卫 6 组分支 + 确认弹窗 DOM**（U5） | 需构造特定数据；`confirm` 由 `useConfirm` 渲染 | B（夹具数据） | 50 min |
| N3 | **上传 → SSE 流式 → fillFromParsed 填充**（U6） | `fetch` + `ReadableStream` 解析、进度字符数、6 种输入形态 | B（`page.route` fulfill 一段 SSE 文本） | 45 min |
| N4 | **设置模态的 group↔flat 迁移** | `applySettings` **重写** `subQuestions`（拆/合小题）+ 写 localStorage；静态判等看不到重构结果 | A/B | 30 min |
| N5 | **小题 tabs：增/删/切换 + 滚动按钮** | TransitionGroup + `_key` 稳定性 + `tabsScrollRef` 失绑静默（U4） | B | 30 min |
| N6 | **AI 生成参考答案 → 标签出现/编辑后清除** | 依赖 2s 防抖 + 两个 watch 交互（U2） | B（mock generate-reference） | 30 min |
| N7 | **卸载清理 + 草稿态**（U3） | 卸载序、存活定时器、`beforeunload` 提示（`e.returnValue`） | A（oplog） | 30 min |
| N8 | **客观题 items 边界** | 选项 ≥8 禁用「+ 添加选项」、≤2 禁用删除、填空自动空数与分值 | A/B | 25 min |

**成本合计（诚实估算）**：装置 A ≈1–2 h（复用 step 5）+ 用例 N1–N8 ≈ **4.5 h** 首轮；每轮执行：A 装置 ≈**2–4 min**、B 装置 ≈**8–12 min**；**改前/改后各一遍**。★**裁剪建议（时间盒紧时）**：**U1/U2/U3/U4 对应的 A 装置事实（T1–T5、T7–T10）必做**（本步四个「静态全盲」风险面，≈1.5 h）；N2/N3 次之（保存与上传是产品语义最密的两段）。

### 4.7 像素门禁在本步的地位（**必须写进 C 的验证边界**）

★**本步属 A 档（只抽 script），像素门禁不需要、也不应作为判据** —— 模板+样式**逐字节相等**在逻辑上**严格强于**像素相等；此时像素相等是"必然"而非"证据"。

**本方案判定：`QuestionEdit.vue` 属 A 档，全程不需要像素门禁。** 理由（本文件具体三条）：① §2.2 的 12 个目标文件**全部只接收/返回 JS 值与对象引用**，无一处触及 `<template>` 或 `<style>`；② §1.4 的 61 个模板可见名全部通过「顶层解构」还原，模板表达式一个字符不改（L1-a 机器证明）；③ 本文件**没有** `Doc.vue` 那种"必须拆子组件"的场景。

⚠️ **升级条件（必须明说）**：**若 B 发现"不得不动 `<template>` 或 `<style>`（哪怕只加一个注释、只改一个 `v-if` 条件）"→ 本步立即从 A 档升级为 B 档**，此时：必须跑 `scripts/gates/pixel-diff.mjs`；**区域表必须先覆盖 `/exam/teacher/questions/new` 与 `…/:id/edit`**（默认 6 区域只走 `/exam/teacher/classes`，对本文件**近乎盲区**）；**必须先解决 G-B**（`pixel-diff.mjs` 的 `FIXTURES` 只有 3 条 teacher 端点，**没有任何本文件要打的端点** —— **C 是只读角色，补夹具不是 C 的活**）；选择器消失时门禁给 **exit 2（硬失败，不得当 PASS）**。

**C 的验证边界（写进 `QuestionEdit.vue-verify.md`）**：
- ❌ 像素门禁**不构成本步任何判据**（A 档；即使跑，当前也必然 exit 2 —— 夹具表无本文件端点）。
- ✅ 行为正确性的证据**只能**来自 **L0（2 段切片 + 104 块 sha256）+ L1（冻结元数据模板对拍 + `$setup` 名集合 + styles 数组 + 迁移表）+ ④（自由标识符，含正控）+ ⑤（真运行时对拍 T1–T12）+ L2（N1–N8 按裁剪）**。
- ❌ **axe 按不可用处理**（§4.1）；替代口径：`page.accessibility.snapshot()` 逐节点对拍（模板零改动下 a11y 树应逐节点相等，**比 axe 更强**）；若 Captain 未拍板 → **显式登记「axe 未执行」并接受盲区**。

---


---

---

## 5 风险分级（每个搬移单元）

维度权重：**响应式耦合 / 生命周期 / 测试覆盖 / 交互复杂度**；★本表新增第五维：**形态影响面**（本文件独有 —— 两种题型形态共存于一个组件）。

| # | 单元 | 等级 | 理由（全部基于本轮实测） |
|---|---|---|---|
| R1 | **U1 `questionPure.js`**（15 声明 / ≈85 行） | **低** | 响应式耦合 **0**（15 个声明全是纯函数/常量，只读入参）；生命周期 **0**；测试覆盖 0 但**纯函数可被 L0 逐字节判等完全覆盖**；交互复杂度 低；形态影响 **0**。★唯一注意：它被 **4 个单元** import（U3/U4/U6/U10）→ 导出名必须真存在（constraints §3-12：`node --check` **不放行**缺失导出的坏绑定）。 |
| R2 | **U2 `useQuestionForm.js`**（2 声明 / ≈35 行） | **中** | 响应式耦合 **高**：`form` 是**被模板绑 12 处 `v-model` + 10 处读**的唯一对象（§1.4）；所有权必须唯一（U3/U4/U5/U6/U7/U10/U11 全都要读写它）→ **必须由 U2 创建一次，其余以参数接收**；生命周期 0；形态影响 两者都进。 |
| R3 | ★**U3 `useSubQuestionList.js`**（24+3 声明 / ≈100 行） | ★**高（本步第一硬失败点）** | ① 它是**形态的单一真值源**（`questionKind`/`sqKind`，§2.1-d）；② 承载 **2 个 watch（357/367，注册序最先）**；③ 承载**两个非响应式共享状态**（`sqKeyCounter`、`draftChanged` —— §1.3-2/4 两个「静默分叉」高发点）；④ `saveDraft`/`loadSq` 是**全场枢纽**（被 U4/U5/U6/U7/U9/U10/U11/U12 共 8 处调用或注入）；⑤ 与 U4/U5/U7/U9 **四处双向依赖**（§2.3）。测试覆盖 0；交互复杂度 高（tabs 增删切换 + Transition + 分值双向同步）。 |
| R4 | **U4 `useObjectiveItems.js`**（14 声明 / ≈55 行） | **中高（客观题专属 = 有形态盲区）** | 响应式耦合 中（读 `subQuestions`/`activeIndex`/`sqKind`，写 `form.objectiveItems` + `previewFocusKey`）；生命周期 0；**测试覆盖 0 且既有 E2E 对本页近乎零覆盖**；交互复杂度 中（7 个 handler + 1 个 deep watch + `nextTick` + `document.querySelector`）；形态影响 **仅客观题形态可达**（模板入口全在 `v-else` 分支）⇒ **主观题形态下不会被走到，回归网最薄**。 |
| R5 | **U5 `useQuestionSettings.js`**（8 声明 / ≈85 行） | **中** | `applySettings` 是 **43 行**的分类模式迁移（group↔flat **重写 `subQuestions`**：拆题/合题/重算分值/key 重编号）；写 `localStorage`（`SETTINGS_KEY`）；与 U3 **真环** → 依赖 §2.3-1 的晚绑定；但**不注册任何 watch**（故晚绑定安全）。测试覆盖 0；形态影响 两者都进（:29 按钮无 v-if）。 |
| R6 | **U6 `useExamImport.js`**（9 声明 / ≈140 行） | **中高（本步最大单元）** | 交互复杂度 **高**（`mammoth`/`xlsx` 双解析分支 + `fetch` SSE reader 循环 + 逐行 `data: ` 协议 + `phase` 三态 + `uploadProgress`）；`fillFromParsed` **反向改写** `questionKind`/`subQuestions`（跨形态副作用）；★**既有缺陷**：SSE reader **不可取消**（§3.1-4）。测试覆盖 0；形态影响 两者都进。 |
| R7 | **U7 `useAiReference.js`**（5 声明 / ≈65 行） | **中** | `aiTag` 是**跨 3 单元的共享 ref**（§1.3-3）→ 所有权必须唯一、以 ref 实例注入；`genRunning` 手动置位；watch@701 与 watch@699 **同源**（`form.referenceAnswer`）→ 注册序必须 699 < 701；2 个请求（`generate-reference` 超时 120s）；`_sanHtml` + `confirm` 组合弹窗。形态影响：由「存在主观小题」驱动。 |
| R8 | **U8 `usePromptPreview.js`**（5 声明 / ≈50 行） | **低** | 4 个 ref + 1 个 async 请求；**仅主观题形态可达**（按钮 `v-if="isEdit && questionKind==='subjective'"`）；无 watch/无 hook；唯一注意：`promptActiveKeys` 由响应体的 `subs[].id` 填充。 |
| R9 | ★**U9 `useDraftSync.js`**（3 声明 / ≈45 行） | **中高（本步最隐蔽的一处）** | ★`useDraftAutosave(options)` **必须在 setup 同步阶段被调用恰好一次**，否则 `getCurrentInstance()` 为 null → 其 `useDraftAutosave.js:134` 的 `onBeforeUnmount(stop)` 不注册 → **2s 防抖定时器 + visibilitychange 监听泄漏**（**L0/L1/build 全盲**）；`delay: 2000` 是本仓注释写明的对外节拍（QuestionEdit 2s）**不得改**；`save` 回调**晚绑定**到 U3 的 `saveDraft`（§2.3-4）—— 合法性依赖「setup 期从不调用 `save`」。 |
| R10 | **U10 `useSaveQuestion.js`**（5 声明 / ≈110 行） | **中高** | **产品语义最密**的一段：`handleSave` 5 条提前 return（**每条 `message.warn` 文案都是用户可见契约**）+ 1 条 confirm 弹窗 + `doSave` 的 PUT/POST 分流 + `buildScoreSummary` 生成的 HTML 表格（含「未设置」红色分支）+ `collectSubjectiveIssues` 的 strip-html；`_sanHtml` 净化。测试覆盖 0（U5 的 6 组分支全无覆盖）；形态影响 两者都进（但 `collectSubjectiveIssues` 只对主观小题生效）。 |
| R11 | **U11 `useLoadQuestion.js`**（1 声明 / ≈55 行） | **中** | 单函数写 ≈13 个状态位 + **向后兼容分支**（旧数据 `score==null` → 默认分；`objectiveItems` 逐项补分/补 `_blankParts`）；`loadSq(0,0)` 的 `dir=0` 语义（**不触发 saveDraft**）★顺序敏感；形态影响 **两形态的入口**（它决定 `questionKind` 初值）。 |
| R12 | ★**U12 `useQuestionEditPage.js` + .vue 接线**（9 声明 + 2 hook 体 / ≈90 行） | ★**高（唯一硬失败点）** | ① ★**61 个模板可见名必须一个不漏地出现在 .vue 顶层解构里** —— 少一个 → 渲染期报 `Property "x" was accessed during render but is not defined`（**响亮**），或对 2 个 string ref **静默失绑**（U4）；② `editId`/`isEdit` 必须在 setup 期**一次性**求值；③ `onMounted`/`onUnmounted` **只能在这里各注册一次**，且**不得改动 hook 类型**；④ **5 个 watch 的注册序由它的调用序决定**（U3→U4→U9→U7 不可换）；⑤ 它是唯一 import 全部 U1–U11 的模块，**任何参数注入写错都在这里暴露**。**建议：B 完成后立刻跑一次 §4.3 的 L1（一条命令即可确认 61 名全在 + 迁移表干净）**。 |
| R13 | **删除 .vue 的 script 内联实现** | **高** | 一步同时影响：模板 61 名、28 个模板函数、5 个 watch、2 个 hook、`_sanHtml`/`message`/`request`/`DOMPurify`/`mammoth`/`XLSX`/`useConfirm`/`useDraftAutosave` 与 5 个组件 import 的归属。**回滚粒度必须 = 单提交**，且**必须最后做**（§6 顺序）。 |
| R14 | **GodFile 5 → 4 / 观察带 15 → ?** | **低（但需刷新基线）** | `arch-metrics.mjs:27` 的 `godfileOver800: 5` 须在提交后刷为 **4**。★**`over500` 是否 15 → 14 取决于 .vue 最终是否 ≤500 行**（估算 ≈490–505，**落在线上**）⇒ **不得预先承诺**；且 12 个新文件全部 ≈35–140 行、**均 <500**（不新增观察带成员）。 |

**顺序建议（给 B）**：U1 → U2 → U5 → U3 → U4 → U9 → U7 → U6 → U8 → U10 → U11 → **U12 + 接线**（先只加不删，跑一次 L1）→ **最后**删除 .vue 里的内联实现。

---

## 6 ★分批建议（**每批可独立提交并各自过 5 条判据**）

**为什么必须分批**：一次性抽 12 个文件 = 一次性改动 541 行 script 里的 ≈480 行 + **61 个模板名的解析面** + **5 个 watch 的注册序 + 2 个 hook**；任何一处出错都**无法定位是哪一批的哪一行**，而 5 条判据全是**整页级**的（L1 只告诉你「名字少了/模板变了」，不告诉你是哪一批）。分批让「改前 vs 改后」的对照**始终是上一批的绿状态**。★**本文件比 step 5 更需要分批**：声明数 104 vs 80、模板名 61 vs 44、模板函数 28 vs 14。

★**分批的红线**：**必须保持 5 个 watch 的注册序 357 < 367 < 482 < 699 < 701 与 hook 注册的同步性**。因此**批次必须按「watch 所有者的源序」推进**（U3 → U4 → U9 → U7），不得为了「看起来更内聚」先抽 U4/U7。

| 批 | 内容 | 搬移行数 | script 行数变化 | 新增文件 | 本批 hook/watch 位置变化 | 本批必须额外做的验证 |
|---|---|---|---|---|---|---|
| **B1** | **纯叶子**：新建 **U1** `questionPure.js`；.vue 里 `import { ... } from '../../composables/question/questionPure.js'`，删除 15 个声明所在行 | ≈61 | 541 → **≈485** | 1 | **零**（无 ref/computed/hook/watch/计时器） | L0（2 段 + 15 块 sha256）+ L1（61 名集合不变）+ ④（0 违规）+ **真 import 一次**（constraints §3-12） |
| **B2** | **状态基座**：新建 **U2** `useQuestionForm.js`、**U5** `useQuestionSettings.js`、**U3** `useSubQuestionList.js`；.vue 接线 form/hasMaterial、设置 8 项、小题 24 项；**U5 → U3 的晚绑定**在此批建立 | ≈109 | ≈485 → **≈300** | 3 | watch@357/@367 整体搬入 U3（**注册序不变，仍最先**）；`useDraftAutosave` **仍留在 .vue**（本批不动 U9） | L0+L1+④ + ⑤ **T4**（注册序）+ **T10**（_key 无重复 / 脏标记单实例）+ L2 **N4**（group↔flat 迁移） |
| **B3** | **客观题 + 预览 + 草稿 + AI**：新建 **U4** `useObjectiveItems.js`、**U9** `useDraftSync.js`、**U7** `useAiReference.js`（**调用序 U4 → U9 → U7**，保证 482<699<701） | ≈64 | ≈300 → **≈205** | 3 | watch@482→U4、@699→U9、@701→U7；★`useDraftAutosave()` 的调用点从 .vue 迁入 U9（**仍同步一次**） | L0+L1+④ + ⑤ **T5**（同 tick 序）+ **T7/T8**（卸载序 + hook 队列）+ **T12**（delay=2000）+ L2 **N6/N8** |
| **B4** | **上传/解析/保存/加载/提示词**：新建 **U6** `useExamImport.js`、**U8** `usePromptPreview.js`、**U10** `useSaveQuestion.js`、**U11** `useLoadQuestion.js` | ≈203 | ≈205 → **≈120** | 4 | 无 watch 迁移（这 4 个单元不含 watch） | L0+L1+④ + ⑤ **T6**（5 条守卫 + PUT/POST）+ **T11**（SSE 既有行为）+ L2 **N2/N3/N5** |
| **B5** | ★**接线根 + 收尾**：新建 **U12** `useQuestionEditPage.js`；.vue 只留 import + 一次解构 + `onMounted`/`onUnmounted`；**平移两个 hook 回调体**；**最后**删除全部内联实现 | ≈120 | ≈120 → **≈45–60**；**文件 983 → ≈490–505** | 1 | hook 的**注册位置**不变（仍在 .vue），**回调体**搬入 U12；`router/route/confirm/editId/isEdit/saving/codeEditorRef/formatCode/beforeUnloadHandler` 归 U12 | L0（2 段）+ L1（4 条全绿）+ ④ + **⑤ 全套 T1–T12** + L2 **N1/N7** + `arch-metrics`（**GodFile 5 → 4**）+ 刷新基线 |

**每批的完成判据（与 DoD §5 对齐，缺一不可）**：
1. `node scripts/gates/arch-metrics.mjs` → **PASS**（`unmigrated` 应**持平 44** —— 本步只增 `client/src/composables/question/*.js`，不进 server 四层口径；GodFile 在 **B5** 才下降 5→4）
2. `node scripts/gates/cycle-check.mjs` → **SCC 仍为 0**（client 侧新增 import 边也计入；本方案 §2.2 的可达图无环）
3. `node scripts/gates/hard-metrics.mjs` → PASS **0/0/0**（扫描面 = `client/src/style.css` + `client/src/**/*.vue` ⇒ **新 .js 不在扫描面内**，本步该数应**逐字不变**；style 块一个字符不动 ⟹ 必然不变）
4. `node scripts/gates/bind-check.mjs` → 违规 0。⚠️ **实测其默认扫描根是 `server/src` 与 `server/test`，只接受 `.js/.mjs/.cjs`** ⇒ **client 侧新模块不在它的扫描面内**（若要以它覆盖，须显式传 `client/src` 根，且它仍会跳过 `.vue`）⇒ **client 侧的绑定完整性由「④ 自由标识符扫描 + 真 import() 一次」承担**（本方案第 ④ 条 + B1 的「真 import」）
5. 全量后端测试：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → **4 处 `Test Suites:` 摘要、0 failed**（本步**不动 server** → 应逐字不变 → **零成本高价值哨兵：若它变了，说明 B 越界了**）
6. **client 追加**：**L0（2 段切片 + 104 块 sha256）+ L1（4 条）+ ④（0 违规 + 正控 3/3）+ ⑤（按批的 T 项）+ L2（按批）**；**像素门禁不需要**（A 档，§4.7）；a11y 用 `page.accessibility.snapshot()` 逐节点对拍替代 axe
7. **每批一个提交**，消息含「拆分前 file:line 范围 + 目标 composable + 验证结果 + `wc -l` 实测」

**若只能做一步**：做 **B1**（风险最低、收益可验证 —— script −61 行，且**建立了 L0/L1/④ 三条判据的可复用脚本**，后续每批复用）。**B5 是本步「不可逆感」最强的一步**，务必在 B1–B4 的判据脚本稳定后再做。

## 7 给 Agent B 的逐条搬移指令

### 7.1 总则（不可协商）

1. **只允许新建 §2.2 的 12 个 `client/src/composables/question/*.js`** + 修改 **`client/src/views/teacher/QuestionEdit.vue` 的 `<script setup>` 段（314–854）**。**禁止**碰：`QuestionEdit.vue` 的 `<template>`(1–312) 与 `<style scoped>`(856–983)、任何其它 `.vue`（尤其 `components/{FormPage,RichEditor,CodeEditor}.vue` 与 `views/student/Submit.vue`）、`client/src/composables/` 下的**既有 25 个文件**（**不要顺手改用 `useProjectUpload.js` 或 `composables/submit/*`**）、`client/src/style.css`、`client/src/router/`、`client/src/api/request.js`、`scripts/gates/*`、`client/package.json`。
2. **搬移 = 按 §2.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、全角括号、`：`、`——`、以及注释里的 `T5-A2`/`T4-F2`/`R4`/`R6`/`T02` 等编号）。★本文件的代码是**极度紧凑的单行风格**（多数函数一行写完）→ **连行内空格都不能重排**（否则 L0 的 104 块 sha256 会失败，且无法区分「改了语义」还是「改了格式」）。
3. ★**绝对不能在搬移中顺手修这 8 处**（各自登记为**后续独立项**）：
   - ① **形态判定不动**：`questionKind`/`sqKind` 的赋值点与全部取值点逐字不变；**任何单元不得自行 `ref('subjective')`**（§2.1-d）；
   - ② **两个 `let` 单实例**：`sqKeyCounter`（只与 `newSq` 同文件）、`draftChanged`（只与 `markDraftChanged` 同文件，且经三个访问器外泄）；
   - ③ **5 个 watch 的注册序 `357 < 367 < 482 < 699 < 701`**（由 U12 的调用序 U3→U4→U9→U7 保证；**不得**把 watch 挪进 `onMounted` 或异步分支）；
   - ④ **`useDraftAutosave({ save, delay: 2000, enabled })` 必须在 setup 同步阶段调用恰好一次**（`getCurrentInstance()` 依赖它；否则 hook 不注册 → 定时器/监听泄漏）；
   - ⑤ **`onUnmounted` 不得改成 `onBeforeUnmount`**，且 **`removeEventListener('beforeunload')` 必须在 `saveDraft()` 之前**（语句序）；
   - ⑥ **`handleUploadExam` 的 SSE reader 不可取消**（`:576-596`）—— 既有行为，**照旧保留**，不得加 `AbortController`；
   - ⑦ **`_sanHtml` 的 `ALLOWED_TAGS`/`ALLOWED_ATTR` 白名单逐字不动**（`:321-322`），`confirm` 的 `content: () => h('div', { innerHTML: _sanHtml(...) })` 形态不动；
   - ⑧ **`loadSq(index, dir)` 的 `dir===0` 分支语义**（`:455` 的 `if(dir!==0)saveDraft()` 与 `if(dir!==0)slideDir.value=dir`）—— 4 个 `loadSq(0,0)` 调用点（`:446`/`:530`/`:686`/`:725`）**一个都不能改**。
4. **所有权唯一**：`form` 只在 **U2**；`questionKind/sqKind/subQuestions/activeIndex/slideDir/showMaterial/tabsScrollRef/canScroll*/computedMaxScore/draftChanged/sqKeyCounter` 只在 **U3**；`previewFocusKey/computedObjSqScore/currentFlatItemType` 只在 **U4**；`objectiveSettings/tempSettings/showSettings` 只在 **U5**；`upload*`/`showUploadExam` 只在 **U6**；`aiTag/genRunning` 只在 **U7**；`prompt*` 只在 **U8**；`draftSaver/statusText` 只在 **U9**；`saving/codeEditorRef/editId/isEdit/router/route/confirm` 只在 **U12**。**任何其它 composable 不得再 `ref()`/`reactive()`/`computed()` 同名对象**，一律以参数接收（ref/reactive 传引用即共享）。★**`.vue` 里不得出现任何 `ref(` / `reactive(` / `computed(` / `watch(`**（出现即等于造第二个真值源）。
5. **`useRouter()`/`useRoute()` 只在 U12 各调一次**并把 `router`/`route` 向下注入（**不得让 U10/U11 各自 `useRoute()`**）；**`useConfirm()` 同理只在 U12 调一次**，`confirm` 向下注入 U7/U10。
6. **`route.params.*` 的读取位置逐字保留**（本文件只有 `:335` 一处：`route.params.id`）。★`editId = route.params.id || null` 与 `isEdit = !!editId` **一个字不许改**，且**不得改成 `computed`**。
7. **清理集中在 .vue**：`onUnmounted` 只在 .vue 出现一次（回调体在 U12），按 `removeEventListener('beforeunload')` → `saveDraft()` 的顺序；`onMounted` 同理只在 .vue 出现一次（`load()` → `addEventListener('beforeunload')`）。
8. **`.vue` 里不得出现 `export` / `defineEmits` / `defineExpose`**（原文件也没有；本文件**连 `defineProps` 都没有**）。
9. ★**§7.2 的「模板零改动」检查点必须逐条执行并留痕**。
10. 每个新文件顶部加 **banner**（固定格式，便于 C 机械核对）：

~~~js
/**
 * <文件名> -- 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 <B1-B5>，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 */
~~~

### 7.2 ★「模板零改动」的具体检查点（**逐条可执行**）

| # | 检查点 | 命令 / 判据 | 通过条件 |
|---|---|---|---|
| **M1** | 模板块**逐字节**未动 | §4.2 的 `cmp /tmp/q6a/b.template /tmp/q6a/a.template` | exit 0 |
| **M2** | style 块**逐字节**未动，且**仍只有 1 个** | §4.2 的 `cmp /tmp/q6a/b.style /tmp/q6a/a.style` + `descriptor.styles.length === 1` | exit 0 且 =1 |
| **M3** | 模板**源文本**在编译器眼里未动 | §4.3 的 `sanity_template_source_byte_equal` | true |
| **M4** | 模板可见名**一个不漏**（61 名 = 59 个 `$setup` + 2 个 string ref） | §4.3 的 `setup_names_missing === []` + `grep -n 'ref="' client/src/views/teacher/QuestionEdit.vue` 应得 **2** 处且名字仍是 `tabsScrollRef`/`codeEditorRef` | 缺失 = [] 且 grep = 2 |
| **M5** | 没有名字退化到 `_ctx` | §4.3 的 `ctx_refs_after === 0` | 0 |
| **M6** | `v-model` 目标仍在 `form` 上 | `grep -c 'v-model:value="form\.' client/src/views/teacher/QuestionEdit.vue` | **= 7**（改前实测：title/difficulty/sqTitle/sqScore/content/scoringCriteria/language；`form.material` 与 `form.referenceAnswer` 走子组件 `v-model`，不计入） |
| **M7** | `.vue` 内无任何响应式原语 | 对 script 段 `grep -nE '\b(ref|reactive|computed|watch)\(' client/src/views/teacher/QuestionEdit.vue` | **0 命中** |
| **M8** | `.vue` 内 hook 各一次 | `grep -c 'onMounted('` / `grep -c 'onUnmounted('` / `grep -c 'onBeforeUnmount('` | **1 / 1 / 0** |
| **M9** | 12 个新文件全在约定目录、无越界文件 | `git status --porcelain` 的**新增**项必须 ⊆ `client/src/composables/question/`，**修改**项 ⊆ {`client/src/views/teacher/QuestionEdit.vue`} | 无其它新增/修改 |

### 7.3 禁令（违反即回流）

- ❌ 把状态藏进嵌套对象（模板要写 `p.form`）→ **等于改模板**。
- ❌ 在 composable 里用 `defineProps`/`defineEmits` 等 `<script setup>` 宏。
- ❌ 让两个 composable 互相 `import` 来「解决」§2.3 的环（**必须参数注入 / 晚绑定**）。
- ❌ 把 5 个 watch 合并、或改任何一个 watch 的源/选项（`deep` 的有无是行为的一部分）。
- ❌ 为了让「行数更好看」而给 .vue 的解构**一行一个名字**（会把 .vue 推过 500 行）；**每行 3–5 个名字**。
- ❌ 改 `delay: 2000`、改任何 `message` 文案、改 `DEFAULT_TYPE_SCORES` 的值、改 `langs` 的内容或顺序（模板 :191 直接 `v-for` 它）。
- ❌ 引入任何新依赖（`package.json` 不动）。

---

## 8 给 Agent C 的验证清单

> 前提：**C 不吃 B 的自测**；所有判据**自建**（可复用 §4 的脚本，但必须自己跑出结论）。

| # | 验证项 | 方法 | 通过判据 |
|---|---|---|---|
| **V1** | **L0 · 2 段字节切片** | §4.2 脚本（含切片边界自证打印） | `TEMPLATE_STYLE_BYTE_IDENTICAL`，且 `head`/`tail` 显示切片确实是 `<template>` 与 `<style scoped>` |
| **V2** | **L0 · 104 块 sha256** | 按 §2.2 行区间逐块切改前/改后 → `shasum -a 256` | 全等（差异仅限白名单：banner/import/`export`/缩进/晚绑定包装行），**并逐条解释每个白名单差异** |
| **V3** | **L1 · 冻结元数据模板对拍（4 条）** | §4.3 脚本 | 退出码 **0**；★**额外报告** `template_compile_own_byte_equal` 的值与差异归类（**必须落进 §4.3 的 patchFlag 表**；若出现「行为差异」类 → **判 FAIL**） |
| **V4** | **L1 · 61 名与 2 个 string ref** | 独立 `grep -n 'ref="'` + `$setup` 名集合 | 61 名全在；string ref 仍为 `tabsScrollRef`/`codeEditorRef` 且各 1 处 |
| **V5** | **④ 自由标识符扫描（含正控）** | §4.4 脚本；**必须用 `scope.crawl()` 或两遍实现** | 12 个新文件 + .vue script 段 **全 0**；★**正控 3/3 必须命中**（删 import / 改名 / 去注入各报 1）—— **只报 0 不算通过** |
| **V6** | ★**⑤ 真运行时对拍（无 DOM 装置）** | §4.5 装置 A：真 `compileTemplate` 产物 + 真 Vue `createRenderer` + 真生命周期 + 仓库外替身 | **T1–T12 逐条与改前相同**；★**T4/T5 的注册序与同 tick 序**、**T7 的清理序**、**T8 的 hook 队列计数**、**T9 的 `format()` 调用次数**、**T10 的 `_key` 无重复** 必须逐字相符 |
| **V7** | **⑤ 装置自证** | `client/dist` 指纹/`find -newermt` + 仓库内 `git status` + 模块副本 `cmp` + **两次同场景运行逐字节相同** | 四项全过（否则**拒绝判 PASS**） |
| **V8** | **L2 · Playwright 交互（按批裁剪）** | 装置 A/B；用例 N1–N8 按 §4.6 裁剪 | 每条的断言**改前也必须同样通过**（先跑改前基线，再跑改后） |
| **V9** | **形态双跑（本文件独有）** | §3.2-U1 的 5 个场景 | 5 组断言改前改后逐条相同 |
| **V10** | **门禁四件 + 全量后端** | `arch-metrics` / `cycle-check` / `hard-metrics` / `bind-check` / `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` | arch：`unmigrated` **持平 44**、`layerViolations` 0、**GodFile 5 → 4**；cycle：**SCC = 0**；hard：**0/0/0**；bind-check：**0 违规（并如实登记「其扫描面不含 client」这一边界）**；测试：**4 处 `Test Suites:` 摘要 + 0 failed** |
| **V11** | **既有缺陷未被放大（不是修它）** | ① SSE 中途卸载（T11）；② `handleUploadExam` 在不可解析格式上的 `uploadError` 文案 | 与改前**同形**（「照旧存在」= 通过；「消失了」或「变多了」都要报告） |
| **V12** | **基线刷新与留痕** | `arch-metrics.mjs:27` 的基线注释 + 被测源码树的**绝对路径 + HEAD + `wc -l`** | 记录「GodFile 5→4」、如实记录 `over500` 实测值（**不得照抄本方案的 ≈490–505 估算**）；★**被验树必须是主仓库 client**（G-A：`tests/ui-redesign-verify/rig.sh:9` 默认指向 `Exam-DeepSeek-ui`） |

**C 必须额外报告的两件事**：① **`template_compile_own_byte_equal` 为 false 时，那 84 行差异的逐行归类**（这是本步给「同类 vs 行为差异」提供证据的地方）；② **`wc -l` 的 .vue 最终行数**与 `arch-metrics` 的 `over500` 实测值（决定观察带是否下降）。

---

## 9 局限声明

1. **本方案的行号/计数全部取自锚点 `b94407f` 的实测**；任何后续提交都会使其失效 → **引用前必须重新 `git rev-parse HEAD` 并复测**（constraints §3-10）。
2. **§2.2 的行数估算（≈905 行新代码 / .vue ≈490–505）是估算，不是实测**：特别是 **.vue 最终行数落在 500 线附近**（取决于 B 的解构格式），故 **`over500` 是否 15 → 14 我判不了**，只能给出「以 `arch-metrics` 实跑为准」。**唯一可承诺的是 `godfileOver800` 5 → 4。**
3. **U1–U6 六条「需实测」本节无法收敛**：它们是运行期状态机 / 资源生命周期 / 形态求值 / 模板 string ref 绑定，静态阅读**原则上不可判**。我给出了最小探针与期望值，但**判定权在 Captain 与 C**。
4. **⑤ 的装置我只做了「可行性核查」，没有实际搭建**（A 属只读，且装置在 /tmp）：`jsdom 不存在`、`@playwright/test` 与浏览器已装、`@vue/compiler-sfc` / `babel/traverse` 可用，这四条是实测；**装置能否在 1–2 h 内跑通，是 step 5 的经验外推，不是本轮的实测**。
5. **判据④ 的「真实样本」（`useQuestionNav.js` 的 `subQuestions`）是静态证据链**（自由标识符 + 调用点缺参 + 模板绑定三件齐备），**我没有跑浏览器确认**（属只读 + 不启服务）。建议 C 用一次 Playwright keypress 2 分钟确认；**在确认前按「高置信静态缺陷」而非「已复现缺陷」处理**。
6. **判据④ 的假阳性边界已实测但未穷尽**：我实测到 `ObjectMethod` 形参这一类（`useConfirm.js:36-37`），并给出 `scope.crawl()` 口径规避；**其它形态（`with`、`eval`、装饰器、`export * from`）未覆盖**。`scripts/gates/bind-check.mjs` 的已知边界（星号再导出 / CJS / 动态 import 一律跳过）同样适用。
7. **`axe` 我按「不可用」处理**（沿用 step 5 实测 + 禁联网），**本轮未复测**；若 Captain 认为需复测，请单独派单。
8. **本方案未审计**：`components/CodeEditor.vue` / `RichEditor.vue` / `FormPage.vue` / `useConfirm.js` / `useDraftAutosave.js` 的内部实现（只在「对本步的影响面」范围内读了必要片段）；**它们的内部改动不在本步授权内**。
9. **形态路径表的「可达性」是静态配对结论**：我逐条核对了模板 `v-if/v-else` 与 script 调用点，**但「某个 handler 在运行期是否真被触发」未做运行时验证**（这正是 U1 的内容）。
10. **`docs/split/status.md` 的锚点/基线可能滞后**（step 5 已发生过一次）：**任何判据必须以 `scripts/gates/arch-metrics.mjs:27` 的代码基线 + 实跑为准**，不得照抄 status.md 或本方案的数字。


---
