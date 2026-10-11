# ProjectQuestionEdit.vue 拆分实施报告（step 5 · B 侧）

- **step**: 5 ｜ **agent**: B（唯一写者）｜ **日期**: 2026-10-11
- **方案**: `docs/split/ProjectQuestionEdit.vue-plan.md`（647 行，A 侧）｜ **DoD**: `docs/plan/2026-10-11-godfile-split-plan.md` §5（**A 档：只抽 script，不需像素门禁**）
- **约束**: `docs/pipeline/project-constraints.md` 17 条 + Captain 本轮三条最硬要求（形参名不统一 / 禁 composable 互 import / 清理顺序不变）+ 第六步开关常量与保存守卫要求
- **范本**: `docs/split/Submit.vue-refactor.md`（step 2，client A 档）

## 0 版本锚点与产物指纹（★被测源码树留痕，G-A）

| 项 | 实测值 |
|---|---|
| 被测源码树（绝对路径） | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**，非 `../Exam-DeepSeek-ui`） |
| 分支 / HEAD | `master` / `e37d27c0373a6424e1b63ddc06d3f86883a90976`（= 方案锚点，未前移） |
| `ProjectQuestionEdit.vue` **改前** sha256 | `1fb6ac50f49d89671362662d78f5b27bc736ef74f51dea82fb9c034f5afe608a`（868 行 / 43966 字节；与 `git show HEAD:` 逐字节相同） |
| `ProjectQuestionEdit.vue` **改后** sha256 | `128462488d1cb7efe2bc4a086ce939bdcb4c8b28f8c42645e5173720f812af9d`（348 行 / 22563 字节） |
| 冻结副本 | `/tmp/c5b/before/ProjectQuestionEdit.vue`（`cmp` 与工作树相同） |
| 构建产物 | `/tmp/split-step5-build/`（**未重建 `client/dist`**：其 mtime 仍为 `2026-10-10 21:55`） |
| 改动面（B 的产物） | `M client/src/views/teacher/ProjectQuestionEdit.vue` + `?? client/src/composables/project/`（**9 文件**） |
| 工具链 | node `v24.19.0` · `@vue/compiler-sfc` `3.5.34`（`client/node_modules`，**未联网安装任何依赖**） |

> **不属于 B 的改动**：`git status` 里 `M docs/split/status.md`（mtime `10:12:20`，内容是 Captain 的 step5 状态更新，**B 未写该文件**）；`?? docs/split/ProjectQuestionEdit.vue-plan.md`（A 的产物）。B 的全部产物 = 上表 10 个文件 + 本报告。

## 1 交付物（9 个 composable + 1 个改造后的 .vue）

| 文件 | 批次 | 行数 | sha256 | 单元 |
|---|---|---|---|---|
| `client/src/composables/project/zipEntry.js` | B1 | **31** | `da18b489ebb50b2b…` | W1 纯叶子（3 声明：`UTF8_STRICT`/`GBK_DECODER`/`findFirstFile`，零 import、零响应式） |
| `.../useEditorWorkspace.js` | B2 | **130** | `e5ab4d45042082e5…` | W2 Monaco+文件树+tabs（12 声明 + 3 薄 disposer；**唯一 import monaco**） |
| `.../useQuestionForm.js` | B2 | **55** | `76843c9e2861e64a…` | W6 form 所有权 + 模态草稿（12 声明） |
| `.../useChecker.js` | B3 | **158** | `43c2b0a47fc413c8…` | W4 checker 状态机 + 轮询 + 提示词预览（27 声明 + `watch`） |
| `.../useStudentSubmission.js` | B3 | **91** | `f07a15bce11619df…` | W3 学生成绩卡片 + 提交（8 声明） |
| `.../useZipUpload.js` | B4 | **73** | `b273b85e89b5c5f8…` | W5 上传回调 + 教师上传（6 声明） |
| `.../useSaveQuestion.js` | B4 | **77** | `7f066ddedca5d2c3…` | W7 保存守卫 + PUT/POST（1 声明） |
| `.../useLoadQuestion.js` | B4 | **78** | `ad4e5fcb2eb728ec…` | W8 双模式加载编排（1 声明） |
| `.../useProjectQuestionPage.js` | B4 | **100** | `a152dfe718b74955…` | W9 接线根（7 声明 + 2 个 hook 回调体） |
| `client/src/views/teacher/ProjectQuestionEdit.vue` | — | **868 → 348** | `128462488d1cb7ef…` | template 194 + script **38** + style 112 |

**全部 9 个文件 < 500 行**（最大 `useChecker.js` 158 行，远低于 800）；`.vue` 348 行。

### 行数实测与方案预估对照

| 指标 | 方案预估 | 实测 | 结论 |
|---|---|---|---|
| script 块 | 559 → ≈95 | **559 → 38**（196–754 → 197–233） | 优于预估（预估未计入解构表的紧凑写法） |
| `.vue` 总行数 | 868 → ≈300 | **868 → 348** | 落在预估 +16% 内 |
| GodFile（>800） | 6 → 5 | **6 → 5** | ✅ `arch-metrics.mjs` 实跑一致 |
| 观察带（>500） | 16 → **16** | **16 → 15** | ❌ **方案错**（见 §10 勘误） |
| 9 个新文件 | 全部 <500 | 全部 ≤158 | ✅ 不进观察带 |

## 2 执行方式与分批记录

**Captain 指令**：`B1 → B2 → B3 → B4`，每批自成一体；**内联实现的删除放最后**。

**实际执行（与 step 2 同构，可复核）**：沿用「**先全部建立、最后一次性删除内联实现**」

1. 冻结 `git show HEAD:…` → `/tmp/c5b/before/ProjectQuestionEdit.vue`（sha 与工作树 `cmp` 相同）；
2. `/tmp/c5b/gen.mjs` **从冻结源按行区间切片拼装** 9 个新文件与新的 `.vue`（**搬移块不是手抄** —— 这是 §3「829 行逐字相等」的**构造性保证**，而非事后核对）；
3. 用**同一脚本**逐行记录 `dest:行 → src:行` 的映射（`/tmp/c5b/manifest.json`），据此做 L0 全覆盖核对（§3）；
4. 全部 10 个文件一次落盘（`.vue` 的内联实现即在这一次重写中删除 —— 这是唯一一次触碰 `.vue`，也是「删除放最后」的落地形态）；
5. 落盘后跑 L0 + L1 + 结构自检 + 运行时对拍 + `vite build` + 四门禁（§3–§10）。

> **批次编号沿用 plan §7 的归类**（B1 叶子 / B2 编辑器+表单 / B3 checker+学生提交 / B4 上传+保存+加载+接线根），用于对照方案与给 C 的定位；因生成是单遍构造性的，**验证按整步一次性做**（整步判据严格强于分批判据：同一份 manifest 覆盖 9 文件 + .vue 的全部搬移行）。

| 批 | 文件 | 完成后自测（全部实跑） |
|---|---|---|
| **B1** | `zipEntry.js` | 真 `import()` 一次：`Object.keys` = `UTF8_STRICT,GBK_DECODER,findFirstFile`；20 行切片逐字相等 |
| **B2** | `useEditorWorkspace.js`、`useQuestionForm.js` | `useMonacoTheme(` / `useMonacoKeyboardA11y(` 各命中 **1** 次（grep）；`watch(activePath)` 在 W2 内；122 行切片逐字相等 |
| **B3** | `useChecker.js`、`useStudentSubmission.js` | `FEATURE_CHECKER_ENTRY = false` 为普通 `const`（非 ref）；`watch(checkerOpen)` 在 W4 内；195 行切片逐字相等 |
| **B4** | `useZipUpload.js`、`useSaveQuestion.js`、`useLoadQuestion.js`、`useProjectQuestionPage.js` | 9 文件互 import 计数 **10 条**（W9→7 + W3/W5/W8→W1，**无环**）；hook 体逐字平移 |
| **接线** | `ProjectQuestionEdit.vue` script 重写为 38 行 | L0 3 段 `cmp` 全等；L1 51 名全等；`vite build` exit 0；运行时 67/67 |

## 3 L0 · 切片字节判等（★铁律：模板与两个样式块一个字节都不许动）

```
===== L0 =====
verbatim mapped lines: 829 / rewrite sites: 5 / mismatches: 0
script 196-754 coverage gaps: 0
source lines with two verbatim homes: 0
S1 template      1-194             BYTE_IDENTICAL bytes=11490 sha256=3e12a1eba3589986d045cf06b616483d7358ba39b16e5365d36c54e4612a2f2a
S2 style scoped      before 756-857 -> after 236-337 BYTE_IDENTICAL bytes=8851 sha256=b69143591cfcf5a4b48ad0a9d975fa13425a52399c0407433900c1ccbc100cf3
S3 style global      before 859-868 -> after 339-348 BYTE_IDENTICAL bytes=307 sha256=c8b7b00a061beb15ff8cb0682d144e1bae001fe779d2e5031b25351d026d2b4a
structure: .vue ref(/reactive(/computed(/watch( = {"ref(":0,"reactive(":0,"computed(":0,"watch(":0} | defineProps: true | export: false | onMounted x1 | onBeforeUnmount x1
```

- **3 段全等**（模板 1–194 = **194 行**，不是「40」；两个 `<style>` 块都切了 —— :859 的非 scoped 块没漏）。
- **块边界标签**：`<template>`=1 / `</template>`=**194** 不变；`<script setup>`=196 不变；`<style scoped>` 756→**236**、`</style>` 857→**337**；`<style>` 859→**339**、`</style>` 868→**348**（**只有 script 段的行号变化**）。
- **829 行搬移块逐字相等**（`manifest.json` 的 `dest:行→src:行` 全量对拍，**0 处不等**）。
- **全覆盖核算**：script 196–754 的**每一个非空行**都有归宿 —— 829 行逐字搬移 + 5 行受登记改写（§7）+ 17 行结构性重定位（imports / hook 包装行，§7）；**覆盖缺口 = 0**、**同一源行有第二个逐字副本 = 0**。

## 4 L1 · 编译级对拍（★本步最锋利的机器判据）

```
===== L1 =====
$setup names: before 44 after 44 | sets identical: true
bracket-form $setup["X"]: before 7 after 7 | identical: true   (CheckCircleFilled,CheckerWizard,FileTextOutlined,FormPage,LoadingOutlined,ProjectZipUploader,RichEditor)
total $setup refs: before 129 after 129
_ctx names: before [] after []
unref( occurrences: before 0 after 0
__returned__ (after): 59 entries | template-needed missing: []
descriptor.styles identical: true | scoped flags before [true, null] after [true, null]
bindings.props: before setup-reactive-const | after setup-reactive-const
compileTemplate: bytes 27984 -> 28215 | byte identical: false | sha df0507bac2074f6e -> bd7f723324714d0c
```

### 4.1 模板可见名一个不漏（44 + 7 = 51 名）

- **点式 `$setup.X`：44 名，改前改后集合完全相同**（这 44 名 = A 方案 §1.4 的口径，实测吻合；其中 **14 个函数**）。
  > ★**A 的名单有 2 处与机器实测不符，必须以机器为准**：实测含 **`message`**（模板 :156 的 `$setup.message.error(m)`）而**不含 `editorContainerRef`**（模板 ref 编译成字符串 `ref: "editorContainerRef"`，不算 `$setup` 名字）。A 的「44」总数正确，**成员差 2 个**。
- **方括号式 `$setup["X"]`：7 名**（4 个组件 + 3 个图标，模板以组件标签解析），改前改后**逐个相同**。
- **`editorContainerRef`**：模板编译产物 `ref: "editorContainerRef"` 存在（1 次），且已含在 `__returned__` 里（运行时 `setRef` 走 `setupState`，行为不变）。
- **`__returned__`（59 条）覆盖模板所需全部名字**：`template-needed missing: []`（44 + `editorContainerRef`）。
- **`_ctx.` = 0、`unref(` = 0**（改前改后都是 0）→ **没有任何一个名字退化成 `_ctx` 解析**（丢名会立刻表现为 `_ctx.X`，这正是 K3 的机器探针）。

### 4.2 `compileTemplate` 非逐字节相同（必须如实说清）

**11 个 hunk，全部是同一类**：动态 props 列表**追加事件处理器键**（编译器不再能把处理器当稳定 `setup-const` 常量）：

| metric | before | after | delta |
|---|---|---|---|
| `$setup.` 出现次数 | 119 | 119 | **0** |
| `_ctx.` / `unref(` | 0 / 0 | 0 / 0 | **0** |
| `STABLE_FRAGMENT` / `KEYED_FRAGMENT` | 6 / 1 | 6 / 1 | **0** |
| `_createVNode/Block/ElementVNode` | 65 | 65 | **0** |
| `onUpdate:`（v-model） | 10 | 10 | **0** |
| `ref: "editorContainerRef"` | 1 | 1 | **0** |
| `PROPS` patchFlag 列表 | 18 | 24 | **+6**（仅 `onClick`/`onReady`/`onSelect`/`onStatusChange` 进入列表） |

**根因**：`setup-ref`/`setup-const` → `setup-maybe-ref`（解构自 composable 的必然结果，与 step 2 §4.2 同类）。**为什么不是行为变更**：patchFlag 的 `PROPS` 列表只是 diff 提示 —— 列表里加入 `onClick` 意味着每次重渲染多比较一次该键，而处理器引用的是**同一个函数对象**（`__returned__.handleSave` 等全程不变）→ **永远相等、不产生 patch**；且**模板源码逐字节未动**（§3），DOM 必然相同。

**★K1/K2 的直接证据**：模板 :38 的守卫表达式在两次编译里**逐字相同** ——

```js
// A116: ($setup.isTeacher && $setup.isEdit && $setup.FEATURE_CHECKER_ENTRY)
```

且 `$setup.FEATURE_CHECKER_ENTRY` 仍在 44 名名单内（**没被搬丢**；丢了会变 `_ctx.FEATURE_CHECKER_ENTRY`）。

### 4.3 binding 类型迁移（方案 §6.3-M5 的字面要求不可达，已用更强判据替代）

- `FEATURE_CHECKER_ENTRY`：`literal-const` → **`setup-maybe-ref`**。**M5「为 `setup-const`」在解构式接线下达不到**（同 step 2 的 D10：要 `setup-const`/`literal-const` 就必须在 `.vue` 里出现 `const/ref(` —— 正是铁律②禁止的）。
- **但 K1 的语义（值必须是普通布尔 `false`，绝不能是 ref）已被运行时证明**（§5-T1）：`isRef(FEATURE_CHECKER_ENTRY) === false && typeof === 'boolean' && === false` → 模板 `&&` 短路 → **按钮不出现**（K2 未被破坏）。
- 类型迁移**仅发生在 44 名内部**：94 个变化里 53 个是「名字从 `.vue` 消失」（迁进 composable，`->undefined`），41 个是 `setup-ref`/`setup-const`/`literal-const` → `setup-maybe-ref`。**没有任何一例退化为 `setup-const`**（那才会丢 ref 自动解包）。

## 5 运行时对拍（真执行 67 条断言，0 失败）

```
TOTAL pass=67 fail=0     (RT_EXIT=0)
```

装置：`/tmp/c5b/rt/`（**仓库外**）。做法 = 把 9 个文件**逐字节副本**（`shasum` 对拍与仓库相同）放进 `/tmp/c5b/rt/project/`，用 Node 24 的 `module.registerHooks` + 局部 `node_modules` 替身（`vue` 转发真 3.5.34 但记录生命周期注册、`vue-router`、`ant-design-vue`、`dompurify`、`@monaco-editor/loader`）与 5 个既有模块替身（`api/request`、`api/projects`、`domain/format`、`domain/fileLang`、`infrastructure/monaco/legacyLoaderCompat`）**真跑 W9 接线根**。**不占端口、不连库、不碰 `tests/`、不改仓库**。

| 组 | 覆盖（节选关键断言） |
|---|---|
| **T1 接线根/类型** | 44 名全部由 W9 返回（缺 0）；**`FEATURE_CHECKER_ENTRY` 是普通布尔 `false`（`isRef=false`）**；26 ref/computed 全 `isRef`；14 函数全 `function`；`form` 是 reactive（键序 `title,difficulty,maxScore,description,scoringRubric,packageFile,tempId`）；`isTeacher/isStudent/isEdit` = true/false/true；`route` 可见；`difficultyTagClass` medium→`tag-warning` / hard→`null`；`safeDescriptionHtml` 空描述占位文案 |
| **★T1 hook 队列** | setup 期自注册 hook **恰好 1 个** = `onBeforeUnmount(disposeAll)`；`.vue` 两次注册后队列 = **`[disposeAll, disposePage]`** → **证明 W2 是 W9 里第一个被调用的**（源 :231 早于 :748 的相对顺序逐字保持） |
| **T1 加载** | `onPageMounted` → 教师分支写 form（`QT/hard/80/<p>M</p>/R`）+ `externalTree`/`hasUploaded`；`monaco.editor.create` **恰好 1 次**；`checkerStatus='ready'` |
| **★T2 保存守卫** | (a) stale → 文案 `标准工程包已更换，请重新生成自动评分器` **且弹窗打开**；(b) generating → 文案 `自动评分器生成中，请稍候再保存` **且弹窗不打开**；(c) review → 文案 `自动评分器已生成但未确认启用，请打开自动评分器完成确认` **且弹窗打开**；(d) none → 文案 `请先生成自动评分器（当前状态：none）` **且弹窗打开**；(e) ready → **`PUT /teacher/questions/7`**，body `{title,difficulty,maxScore,type:'project',material,scoringRubric}` 逐字段相等 + `保存成功` + `router.push('/teacher/questions')`；(f) 空标题 → `message.warn('请输入题目名称')`。**分支顺序与 3 处逃生通道 1:1 复现** |
| **T2 挂载不变量（U2/N4）** | 上传后再走 `initMonaco`：`create` **仍为 1**（`if (monaco) return` 闸门有效），旧 model 已被 `resetModels` dispose |
| **T3 学生模式（U1）** | `isTeacher=false / isStudent=true / isEdit=false`（`!!route.params.id` 在学生路由下求值为 false —— **逐字保留，未被「顺手修」**）；学生分支写 form/submission/tree；`canStudentSeeScoreNow=false`、`studentStatusText='已提交，待评分'`、`type='info'`；未上传 → `message.warn('请先上传项目文件')`；`formatSubmitTime` 实走 `domain/format.js` |
| **★T4 清理 4 步顺序** | `oplog = ["b3:a11y.removeEventListener", "clearInterval", "model.dispose:file:///z.cpp", "b3:editor.dispose"]` = **:749 → :750 → :751 → :752 逐位相符，各发生一次**（未合并、未换序、未置空、未重复） |
| **T5 W4 剩余路径/K5 死代码** | `checkerLoading`/`checkerData`/`checkerTimer`/`checkerLogs` 仍存在且类型不变；`showPromptPreview` 成功/失败两条文案逐字（`获取提示词失败：…`）；`handleGenerateChecker` 仍能写 `checkerData` + 启动轮询 + `finally` 复位；`stopCheckerPoll` 幂等；`copyScript` 走成功或失败分支的**逐字文案**；`onCheckerStatusChange('generating')` 清 stale |
| **T6 W6/W2** | `openDescModal`/`confirmDesc`/`openRubricModal`/`confirmRubric` 的草稿-写回语义；`switchTab`/`closeTab`（含回落到上一个 tab） |

### 5.1 ★运行时对拍抓到 2 处真缺陷（静态判据全盲，已修）

| # | 缺陷 | 为何 L0/L1 抓不到 | 谁抓到 |
|---|---|---|---|
| **E1** | 生成脚本的一处补丁**误改 W2 的 vue import**（`ref, watch, nextTick` → `onMounted, onBeforeUnmount`）→ `useEditorWorkspace` 运行期 `ReferenceError: ref is not defined` | 搬移行本身**逐字相等**（L0 只比搬移块）；`vite build` 也能过（**未定义标识符是运行期错误**）；`node --check` 同样放行 —— **正是 constraints §3-12 的形态** | 运行时对拍（T1 首行即炸） |
| **E2** | **W5 漏注入 `externalTree` / `fileContents`**（A 方案 §2.2 的 W5 行未列出这两个共享对象）→ 上传回调 `ReferenceError` | 同上：被搬的 `fileContents.clear()` / `externalTree.value = tree` 行**逐字相等**，但它们在 W5 里**没有声明源** | **自由标识符静态扫描**（`/tmp/c5b/scan.mjs`）+ 运行时对拍 |

→ 因此本轮额外落了两道**新增判据**（建议 C 复核时复用）：① 自由标识符扫描（9 文件 `SUSPECT` 剩 `c/p`（数组解构箭头参数）与 `g/nbsp`（正则字面量）4 个**可解释**项，其余全为对象键）；② 真运行时对拍。**`node --check` 在本轮未被采信为任何「通过」证据。**

## 6 ★三条最硬要求 + 开关常量/守卫/死代码 的保留证据

| # | 要求 | 证据 |
|---|---|---|
| **① 形参名未被统一** | `useZipUpload.js:45` = `await new Promise(r => setTimeout(r, 300));`（源 :607，形参 **`r`**）；`useStudentSubmission.js:72` / `useLoadQuestion.js:35,64` = `await new Promise(res => setTimeout(res, 300));`（源 :668/:701/:730，形参 **`res`**）—— **两种形参名并存，未被统一**（L0 逐字判等覆盖） |
| **① `fc` 重命名照旧** | `useZipUpload.js:23` = `async function onZipReady({ tree, fileContents: fc, keptCount, keptBytes }) {`（逐字，避开 W2 的 `fileContents` Map） |
| **① `!!route.params.id` 一个字未改** | `useProjectQuestionPage.js:31` = `const isEdit = computed(() => !!route.params.id);`；:72 = `? !!route.params.id`（挂载判定） |
| **② 禁 composable 互 import** | 9 文件内部边 **10 条**：W9→W2/W6/W4/W5/W3/W7/W8（7）+ W3/W5/W8→W1 `zipEntry.js`（3）。**无环**（`cycle-check` SCC=0；且 W4↔W5 / W4↔W7 / W3↔W8 三处真环全部走参数注入）。W1 是唯一被直接 import 的叶子 |
| **② `.vue` 无响应式原语** | `ref(`/`reactive(`/`computed(`/`watch(` = **0/0/0/0**；`defineProps` 仍在（`:206` 逐字，`bindings.props` = `setup-reactive-const` 不变）；无 `export`/`defineEmits`/`defineExpose` |
| **③ 清理集中注册** | `onBeforeUnmount` **只在 `.vue` 出现 1 次**（`:233 onBeforeUnmount(disposePage);`），`onMounted` 1 次；4 步顺序在 W9 的 `disposePage()` 内逐位保持（运行时 oplog 实测，§5-T4）；**三个 `let` 均未置空**（`monaco`/`editor` 不置空、`models` 不置空 —— 逐字保留既有行为） |
| **K1 常量类型/值/JSDoc** | `useChecker.js` 内：:266–270 的 4 行（横幅 + 三行 JSDoc + `const FEATURE_CHECKER_ENTRY = false;`）**逐字**（L0 判等，129/129 行含它）；**普通 `const`，非 `ref`**（运行时 `isRef=false`、`===false`、`typeof 'boolean'`） |
| **K2 不得恢复按钮** | 模板 `:37/:38` 逐字节未动（§3）；常量值仍为 `false`；运行时 `&&` 左侧 `$setup.FEATURE_CHECKER_ENTRY` 为 `false` → 按钮不渲染 |
| **K3 不得搬丢** | `$setup` 44 名集合含 `FEATURE_CHECKER_ENTRY`（改前改后相同）；`__returned__` 含它；`.vue` 解构表含它 —— **三道机器判据同时命中** |
| **K4-1 openCheckerModal 逐字** | `useChecker.js:105-108`：`async function openCheckerModal() {` + `// §十一 改造：状态与轮询移交 CheckerWizard 管理（含 mock 流程）` + `checkerOpen.value = true;` + `}`（**未补生成逻辑**） |
| **K4-2 4 条分支文案+顺序** | `useSaveQuestion.js:23-39` 依次为 stale(:530) → generating(:535) → review(:539) → `st !== 'ready'`(:544)，**条件顺序未变**；`openCheckerModal(); return;` 出现在 stale/review/none 三条（**逃生通道全在**），generating **只有 return**；inputs-snapshot 分支（:550-562，含函数级局部 `stripHtml`）逐字保留 |
| **K5 四处死代码** | `handleGenerateChecker`（定义+返回 2 处）、`copyScript`（2 处）、`checkerLogs`（2 处）、`checkerLoading`（4 处：声明/:342/:358 + 返回）全部在 W4 内逐字保留并**仍可调用**（§5-T5 实跑）；`.vue` 与 W9 未新增对它们的引用 |
| **A1/A2 双模式** | `props.mode` 与 `params.id` 的求值只在 W9 出现（M2）：`grep` 9 文件仅 W9 命中 `props.mode`；W4 在两种模式下**都无条件实例化**（`.vue`/W9 无 `if (isTeacher)` 包裹）；学生模式实测 `checkerLoadedOnce` 恒 false、`form.tempId` 恒 `''` |

## 7 逐字保留清单：5 处受登记改写 + 17 处结构性重定位（白名单）

### 7.1 5 行改写（**唯一被允许的语义中性替换**，每一行都有登记）

| 源行 | 原文 | 改后（落点） | 依据 |
|---|---|---|---|
| **:602** | `if (checkerLoadedOnce && checkerData.value.status && checkerData.value.status !== 'none') {` | `if (isCheckerLoaded() && getCheckerStatus() && getCheckerStatus() !== 'none') {`（`useZipUpload.js:40`） | `checkerLoadedOnce` 是 W4 的**非响应式 `let`**（跨模块只能以访问器共享，plan §2.3-1）；**:603 的 `checkerStale.value = true;` 保持逐字**（注入 ref 而非 `markStale()`，见 D2） |
| **:528** | `if (!checkerLoadedOnce) await ensureCheckerState();` | `if (!isLoaded()) await ensureCheckerState();`（`useSaveQuestion.js:20`） | 同上（plan §2.3-2）；:529/:530/:550 与 4 处 `openCheckerModal()` 经「解构 W4 返回对象」**保持逐字**（见 D4） |
| **:749** | `keyboardA11y?.dispose();` | `disposeKeyboardA11y();`（`useProjectQuestionPage.js:79`） | 清理集中注册（plan §8.1-7）；**原行逐字存于 `useEditorWorkspace.js:110` 的薄 disposer 体内** |
| **:751** | `Object.values(models).forEach(m => m.dispose());` | `disposeModels();`（`useProjectQuestionPage.js:81`） | 同上；原行逐字存于 `useEditorWorkspace.js:115` |
| **:752** | `editor?.dispose();` | `disposeEditor();`（`useProjectQuestionPage.js:82`） | 同上；原行逐字存于 `useEditorWorkspace.js:120` |

> **顺序未被破坏的机制**：4 步是**4 次独立调用**（`disposeKeyboardA11y()` → `stopCheckerPoll()` → `disposeModels()` → `disposeEditor()`），**没有合并成一个 `dispose()`** —— 否则会变成 749,751,752,750（**换序**）。其中 `:750 stopCheckerPoll();` 这一行**在 W9 内逐字未改**（W4 导出的同名函数）。

### 7.2 17 处结构性重定位（imports 按消费者拆分 + hook 包装行）

| 源行 | 内容 | 去向 |
|---|---|---|
| 196 / 754 | `<script setup>` / `</script>` | `.vue`（逐字，仅行号变） |
| 197 | vue API import | `.vue` 只留 `{ onMounted, onBeforeUnmount }`；其余 API 按消费者进 W2/W3/W4/W5/W6/W8/W9 |
| 198 | `useRouter, useRoute` | W9（各调一次，plan §8.1-5） |
| 201 / 202 | `loader` / `applyMonacoCompat` | W2（路径深度不变） |
| 203 / 204 | `useMonacoTheme` / `useMonacoKeyboardA11y` | W2（路径 `../../composables/` → `../`）；**各只调一次** |
| 206 | `DOMPurify` | W6 |
| 207 | `request` | W3/W4/W7/W8（逐字，路径深度不变） |
| 208 | `uploadPackage` | W5 |
| 209 | `getLanguage` | W2 |
| 212 | `formatDateTimeSec` | W3 |
| 741 / 746 | `onMounted(() => {` … `});` | `function onPageMounted() {` … `}`（W9），`.vue` 侧 `onMounted(onPageMounted);` |
| 748 / 753 | `onBeforeUnmount(() => {` … `});` | `function disposePage() {` … `}`（W9），`.vue` 侧 `onBeforeUnmount(disposePage);` |
| — | **.vue 保留的 6 行 import 逐字** | `message`(:199) · 4 图标(:200) · `RichEditor`(:205) · `ProjectZipUploader`(:210) · `FormPage`(:211) · `CheckerWizard`(:213) —— 这 7 个名字由编译产物以 `$setup.message` / `$setup["X"]` 解析，**必须留在 `.vue`**（§4.1 的 7 名方括号集合 + `message`） |

## 8 关键机制处理（★一个做错就会静默失效的机制）

1. **W2 必须是 W9 里第一个被调用的 composable**：`useMonacoKeyboardA11y.js:128` **自带 `onBeforeUnmount(disposeAll)`**。W9 的调用序为 `useEditorWorkspace(...)` → `useQuestionForm()` → `useChecker()` → `useZipUpload()` → `useStudentSubmission()` → `useSaveQuestion()` → `useLoadQuestion()`，**W2 在首位**，`.vue` 的 `onBeforeUnmount` 在最后 → 运行时实测 hook 队列 = `[disposeAll, disposePage]`，与源文件 `:231 → :748` **相对顺序逐字一致**（§5-T1）。
2. **两个 monaco 辅助 composable 各只调用一次且只在 W2 内**：`grep` W2 = `useMonacoTheme(` ×1、`useMonacoKeyboardA11y(` ×1；其余 8 文件 **0 命中**。运行时旁证：每次页面实例只多出 **1 个** `disposeAll` 注册（重复调用会产生 2 个 = 双份 a11y 处理）。
3. **`initMonaco` 的挂载闸门与 `await` 后的 attach**：`if (monaco) return;` 逐字；`attach` 只登记实例、**不在 `await` 后注册 hook**（hook 注册只在同步 setup 期的 `:128`）→ 无异步注册缺陷。实测：加载 + 上传两次挂载路径后 `editor.create` 仍为 **1**。
4. **`models`（普通对象）与 `fileContents`（Map）跨单元是同一引用**：W2 创建一次，W9 转发给 W3/W5/W8；`resetModels` 的 `try/catch` 与 `editor.setModel(null)` 逐字保留。
5. **`checkerLoadedOnce` 单实例**：唯一 `let`，只在 W4 内声明 + 由 `ensureCheckerState` 写；对外只以 `isLoaded: () => checkerLoadedOnce` 访问器暴露（**无第二真值源**）。

## 9 方案偏离登记（逐条给依据，供 C 复核）

| # | 事项 | 处理 | 依据 |
|---|---|---|---|
| **D1** | A 方案 §2.2 的 W5 行**漏列** `externalTree`（:591）与 `fileContents`（:588-589） | **W9 注入这两个共享对象给 W5** | 二者是 `onZipReady` 的读写对象（plan §1.2-P10 已列出：「写 fileContents Map externalTree …」）；缺注入即运行期 `ReferenceError`（本报告 §5.1-E2 实证）。**所有权仍唯一**（W2 创建），未违反 plan §8.1-4 |
| **D2** | plan §2.3-1 建议向 W5 注入 `markStale()` | 改为注入 **`checkerStale` ref 本身**（写点 `checkerStale.value = true;` 逐字） | 等价（同一单实例、同一写入效果），但**多保住 1 行逐字**（:603）。`isLoaded`/`status` 仍按方案以 getter 注入 |
| **D3** | plan §7-B2 简写「`:749/:751/:752` 改为调 `W2.dispose()`」 | **W2 暴露 3 个薄 disposer**（`disposeKeyboardA11y`/`disposeModels`/`disposeEditor`） | 若合成一个 `dispose()` 则 4 步顺序变为 749,751,752,750 = **换序**，违反 plan §3.1-4-④/§8.1-7 与 Captain 铁律③。**薄 disposer 体内是源行逐字**（同 step 2 的 `disconnectEditorObserver` 先例） |
| **D4** | W7「注入 checker 整体」的具体形态 | W7 首行 `const { isLoaded, checkerStatus, checkerStale, checkerMeta, ensureCheckerState, openCheckerModal } = checker;` | 让 :529/:530/:550 与 4 处 `openCheckerModal()` **全部保持逐字**，只付 :528 一行改写（§7.1） |
| **D5** | `zipEntry.js` 的导出形态 | 末尾一条 `export { UTF8_STRICT, GBK_DECODER, findFirstFile };`（而非 `answerFormat.js` 的逐声明 `export ` 前缀） | 3 个声明块因此**100% 逐字**（少 3 处白名单改写）；仍是「具名导出、无 default」，符合 plan §8.1-10 |
| **D6** | A 的「44 模板可见名」名单 | **以机器实测为准**：44 = 点式 `$setup.X`（**含 `message`、不含 `editorContainerRef`**）+ 7 个方括号组件名 = **51** | §4.1 实测；`editorContainerRef` 走模板 ref 通道（`ref: "editorContainerRef"`），`message` 走 `$setup.message` |
| **D7** | 观察带口径 | **16 → 15**（不是 16 → 16） | 见 §10 |

## 10 门禁实跑 + 行数实测

| 门禁 | 结果 |
|---|---|
| `node scripts/gates/arch-metrics.mjs` | **PASS** — layerViolations 0/0；**unmigrated 44/44 持平**；**godfileOver800 基线 6 → 实测 5** ✅；`>500 观察带 基线 16 → 实测 15`（**不计判据**） |
| `node scripts/gates/cycle-check.mjs` | **PASS** — 扫描 96 文件 / 214 边；**SCC 0**、自环 0 |
| `node scripts/gates/hard-metrics.mjs` | **PASS 0/0/0** — hex6 0 / important 0 / Modal.confirm 0（扫描面 `client/src/style.css` + `**/*.vue`；模板与两个样式块逐字节未动 ⟹ **必然不变**） |
| `node scripts/gates/bind-check.mjs` | **违规 0**（扫描面 server；client 侧跨模块具名绑定由 `vite build` 全图解析 + 结构自检覆盖） |
| `npx vite build --outDir /tmp/split-step5-build --emptyOutDir` | **exit 0**（22.5s；**未重建 `client/dist`**，其 mtime 仍为 `2026-10-10 21:55`） |
| `git status --porcelain` | `M client/src/views/teacher/ProjectQuestionEdit.vue` + `?? client/src/composables/project/`（9 文件）——**B 的改动面仅此 10 个文件**（`M docs/split/status.md` 是 Captain 的 10:12:20 更新，非 B） |

### ★观察带勘误（第 10 条纪律：以实跑为准）

方案 §2.2 判「16 → 16 不变」，**实测 16 → 15**。原因：`>500` 统计口径是「**行数 >500 的全部文件**」（**包含 >800 的**）——`arch-metrics.mjs:26` 的注释史也印证该口径（`46/8/18 → 45/7/17 → 44/6/16` 三个数同步下降）。`ProjectQuestionEdit.vue` 868 → 348 后**离开 >500 集合**，而方案误以为它「从未计入观察带」。
**建议（Captain 权限）**：按历史约定把基线刷为 `{ layerViolations: 0, unmigrated: 44, godfileOver800: 5, over500: 15 }`。**本步不适用「未分层不增」风险**（client 新文件不进 server 四层口径，unmigrated 44 持平）。

## 11 未执行的验证与原因（诚实登记）

| 项 | 状态 | 原因 |
|---|---|---|
| 像素门禁 `scripts/gates/pixel-diff.mjs` | **不需要（A 档）** | 模板 + 两个样式块**逐字节相等**（§3）严格强于像素相等；且 `FIXTURES` 无本文件端点（跑也必然 exit 2） |
| axe | **不可用** | `axe-core` 三处 `node_modules` 全缺（plan §4.1），本轮禁联网 |
| `page.accessibility.snapshot()` 对拍 | **未跑** | 需真浏览器 + 真后端（C 的装置）；模板字节相同 ⟹ ARIA 树必然相同（同一论证） |
| L2 Playwright（N1–N7）/ rig | **未跑** | ① `rig.sh build` 会写 `tests/…/client/dist` → 违反本轮「不碰 `tests/`」；② 属 C 的验证范围（plan §4.3-L2） |
| 全量后端回归（`unblock-g2.sh`） | **未跑（C 的职责）** | 本步**不动 `server/`** → 应逐字不变（零成本哨兵） |
| `client/dist` | **未触碰** | 构建一律 `--outDir /tmp/...` |
| `node --check` | **未作为通过证据** | constraints §3-12：它放行过「返回名未声明」，且在无 `type:module` 的 `/tmp` 下对语法坏文件也返回 0 → 本轮改用**自由标识符扫描 + 真 `import()` + 真运行时对拍** |

## 12 给 Agent C 的验证指令（独立复现，不复用 B 的脚本）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
git rev-parse HEAD                       # 期待 e37d27c0373a6424e1b63ddc06d3f86883a90976
shasum -a 256 client/src/views/teacher/ProjectQuestionEdit.vue   # 期待 12846248…（改前 1fb6ac50…）

# V2 L0（★切 3 段，边界是 194 / 756-857 / 859-868；改后样式块在 236-337 / 339-348）
git show HEAD:client/src/views/teacher/ProjectQuestionEdit.vue > /tmp/c5c/before.vue
awk 'NR>=1&&NR<=194'   /tmp/c5c/before.vue > /tmp/c5c/b.t; awk 'NR>=1&&NR<=194'   client/src/views/teacher/ProjectQuestionEdit.vue > /tmp/c5c/a.t
awk 'NR>=756&&NR<=857' /tmp/c5c/before.vue > /tmp/c5c/b.s1; awk 'NR>=236&&NR<=337' client/src/views/teacher/ProjectQuestionEdit.vue > /tmp/c5c/a.s1
awk 'NR>=859&&NR<=868' /tmp/c5c/before.vue > /tmp/c5c/b.s2; awk 'NR>=339&&NR<=348' client/src/views/teacher/ProjectQuestionEdit.vue > /tmp/c5c/a.s2
cmp /tmp/c5c/b.t /tmp/c5c/a.t && cmp /tmp/c5c/b.s1 /tmp/c5c/a.s1 && cmp /tmp/c5c/b.s2 /tmp/c5c/a.s2 && echo TEMPLATE_STYLE_BYTE_IDENTICAL
shasum -a 256 /tmp/c5c/b.t /tmp/c5c/b.s1 /tmp/c5c/b.s2   # 3e12a1eb… / b6914359… / c8b7b00a…

# V3 逐字搬移（自建 slice-equal：按本报告 §7 的 5 处改写 + 17 处重定位为白名单）
#    判据：829 行搬移 0 不等；script 196-754 覆盖缺口 0；同一源行无第二个逐字副本

# V4 L1（★本步核心）：@vue/compiler-sfc@3.5.34（client/node_modules，禁联网）
#    compileScript(descriptor,{id}).bindings → compileTemplate({...,compilerOptions:{bindingMetadata}})
#    判据：点式 $setup.X 集合 44 名全等（含 message）；$setup["X"] 7 名全等；$setup 引用总数 129 全等；
#          _ctx 0；unref( 0；__returned__ ⊇ 45；descriptor.styles {scoped,content} 全等；
#          bindings.props 存在且为 setup-reactive-const；:38 守卫表达式逐字相同
#    ⚠️ 不要对拍整个 compileScript().content（script 换了必然不同）；compileTemplate 有 11 个 hunk
#        （全部是 PROPS patchFlag 追加 onClick/onReady/onSelect/onStatusChange），须判为非行为差异（§4.2）

# V5 双模式 M1-M6：M1/M4 用源行 sha256；M2 grep props.mode 只应命中 W9；M3 不得出现 if(isTeacher) 包裹 W4；
#    M5 见 §4.3（literal-const → setup-maybe-ref 不可达，改用运行时 isRef(FEATURE_CHECKER_ENTRY)===false）；M6 bindings.props

# V7 真 import 一次（禁止只跑 node --check）
cd client && node -e "import('./src/composables/project/zipEntry.js').then(m=>console.log(Object.keys(m)))"
#    期待 [ 'UTF8_STRICT', 'GBK_DECODER', 'findFirstFile' ]
cd .. && node scripts/gates/bind-check.mjs

# V8 四门禁（期待 arch PASS: 0/44/5/15 · cycle SCC 0 · hard 0/0/0 · bind 0）
node scripts/gates/arch-metrics.mjs; node scripts/gates/cycle-check.mjs; node scripts/gates/hard-metrics.mjs; node scripts/gates/bind-check.mjs

# V16 A 档复核 + dist 未被重建
ls -l client/dist/index.html     # mtime 应为 2026-10-10 21:55（非本轮）
```

**C 的重点盲区（B 已尽力但需独立装置）**：① L2 交互（N1 双模式渲染 / N2 保存守卫 5 分支 + 3 条逃生通道 / N3 开关语义「按钮不出现 **且** 逃生通道仍工作」）；② U3 资源不变量（存活 interval=0、models 归零、控制台零 error；**双重释放照旧存在且未被放大**）；③ U4 两条 300ms 后的 `editorContainerRef` 非空；④ a11y 替代口径（若 Captain 未拍板则登记「axe 未执行」）。

## 13 复现脚本与证据原文（全部在 `/tmp`，可重跑）

| 脚本 | 用途 |
|---|---|
| `/tmp/c5b/before/ProjectQuestionEdit.vue` | 冻结源（`git show HEAD:`，sha 1fb6ac50…） |
| `/tmp/c5b/gen.mjs` | 由冻结源**按行区间切片**生成 9 文件 + 新 `.vue`，并输出 `manifest.json`（逐行 `dest→src` 映射、5 处改写、17 处重定位） |
| `/tmp/c5b/check.mjs` / `verify.mjs` | L0（829 行判等 + 覆盖核算 + 3 段切片）+ L1（bindings/模板/styles/`__returned__`） |
| `/tmp/c5b/scan.mjs` | 自由标识符静态扫描（抓 E2） |
| `/tmp/c5b/diff.mjs` / `bracket.mjs` | compileTemplate 11 hunk 归类；方括号式 `$setup["X"]` 集合对拍 |
| `/tmp/c5b/rt/`（`run.mjs` + `hooks.mjs` + 替身） | **真运行时对拍 67 条**（抓 E1/E2；证明 hook 顺序与 4 步清理顺序） |
| `/tmp/split-step5-build/` | 构建产物（仓库外，**未碰 `client/dist`**） |

## 14 结论

- **模板与两个样式块逐字节相等**（3/3，sha256 已留痕）；**829 行搬移块逐字相等、覆盖缺口 0**；**51 个模板可见名全等、`_ctx`/`unref` 全 0、`__returned__` 无缺失**。
- **三条最硬要求全部满足**：形参名 `r`/`res` **未被统一**、`fc` 重命名与 `!!route.params.id` 逐字；**9 文件互 import 无环且仅 10 条合法边**、`.vue` 响应式原语 0、`defineProps` 仍在；**清理 4 步顺序 :749→:750→:751→:752 运行时逐位相符**（未合并/未换序/未置空）。
- **开关常量与保存守卫逐字保留**：`FEATURE_CHECKER_ENTRY` 仍是普通 `const false`（运行时 `isRef=false`）→ 按钮不出现；模板守卫表达式逐字相同；4 条守卫文案与顺序、3 处逃生通道、4 处死代码全部在（并实跑证明仍可调用）。
- **关键机制处理**：W2 是 W9 首位 → hook 队列 `[disposeAll, disposePage]` 实测；两个 monaco 辅助 composable 各只调一次（grep 1/1，其余 8 文件 0）。
- **门禁全绿**：arch（**GodFile 6 → 5**，unmigrated 44 持平）/ cycle SCC 0 / hard 0/0/0 / bind 0；`vite build` exit 0；**GodFile 6 → 5、观察带 16 → 15**（方案预估 16，已勘误）。
- **产物**：9 个新文件（31/130/55/158/91/73/77/78/100 行，全部 <500）+ `.vue` **868 → 348**；改动面 = 10 个文件。
