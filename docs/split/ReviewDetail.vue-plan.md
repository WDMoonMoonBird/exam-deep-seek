# ReviewDetail.vue 拆分方案（接缝与护航分析）—— GodFile 专项 step 7

- **step**: 7 ｜ **agent**: A（接缝与护航分析，只读）｜ **日期**: 2026-10-11
- **目标文件**: `client/src/views/teacher/ReviewDetail.vue`（**988 行** / 39941 B）
- **DoD 档位**: `docs/plan/2026-10-11-godfile-split-plan.md` §5 **client A 档 5 条判据**（只抽 `<script>`，模板与样式逐字节不动）
- **立场**: **纯只读**。本文件是 Agent A 的**唯一产物**；本轮未修改/新建/删除仓库内任何其它文件，**未触碰任何 `.vue`**，未跑 jest / build / 未起服务 / 未占用 `:5173`/`:3000` / 未联网 / 未执行任何 git 写操作。
- **依据**: `docs/split/QuestionEdit.vue-plan.md` + `-refactor.md` + `-verify.md`（step 6 范本，含其两处判据装置缺陷 D-L1/D-L2 与 ★V6b 的覆盖缺口补位）、`docs/pipeline/project-constraints.md`（**18 条**，第 18 条 tree-sitter 同进程假红）、`docs/split/ProjectQuestionEdit.vue-plan.md`（step 5）。

## 版本锚点（本方案全部实测数据的取值时刻）

| 项 | 实测值 | 复算命令 |
|---|---|---|
| 仓库 | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（主 worktree） | `pwd` |
| HEAD | `aa295058ffcfad794d9ab4d6cb1219096e7e52b9`（branch `master`，step 6 已落地） | `git rev-parse HEAD` |
| 目标文件（改前 = 工作树） | 988 行 / 39941 B / `d7595832cd9c482b4d0a1629ba9bfa01672f320a0ad46bf76363bcb1d15d17c9` | `git show HEAD:… | shasum -a 256`（与活树**逐字节相同**） |
| 第二个 worktree | `…/Exam-DeepSeek-ui`（`rig.sh:9` 的 `CLIENT_DIR` 默认指向它）→ **G-A 仍然存在** | 见 §4.7 |
| `arch-metrics.mjs:27` 基线 | `{ layerViolations: 0, unmigrated: 44, godfileOver800: 4, over500: 14 }`（**本轮实跑复核，PASS**） | `node scripts/gates/arch-metrics.mjs` |
| 编译器 / 驱动 | `vue/compiler-sfc 3.5.34`、`babel/parser 7.29.8`、`babel/traverse 7.29.8`、`playwright/test 1.60.0`（chromium-1217/1223、firefox-1522、webkit-2287 均已安装）；★**全仓无 jsdom**（client/root 两处实测均 ABSENT） | 本轮实测 |

⚠️ **锚点纪律**：step 5/6 报告中引用的锚点（`e37d27c` / `b94407f` / `cb1304c`）**均已过期**；B/C 执行前必须重新 `git rev-parse HEAD`。本方案所有行号/计数均为上表锚点下的**本轮实测值**。

---

## 0 约束遵守声明

1. 本文件是**唯一写入**；未修改任何 `.vue`/`.js`/`tests/`/`client/dist`/`scripts/gates/*`；未执行任何 git 写操作；未跑 jest、未跑 build、未起任何服务；未联网。**未在仓库内落任何脚本文件**（所有分析以 heredoc 读 stdin 执行；仅在仓库外 `/tmp/rd-bindings-before.json` 落了 1 个临时基线快照）。
2. 所有行号/计数**本轮实测**（constraints §3-10）：编译器 `parse()/compileScript()/compileTemplate()` + `babel/parser`+`babel/traverse` AST 普查 + `grep` 交叉验证。**未采信 Captain 盘点表，并纠正了其中的「template 47」**（§1.0）。
3. ★**块边界用编译器实测**（`parse().descriptor` 的 `loc`），**未使用** `grep -n '</template>'` 首条命中 —— 该法在本文件必然出错：首个 `</template>` 在 :47（内层 `v-for` 插槽），真实外层闭合在 **:236**。
4. 本方案的 5 条判据配方**全部经本轮实测**，其中含 **4 处对 step 6 范本/DoD 配方的必要纠正**（§4.2 的逐侧边界、§4.3 的方括号名 + `_ctx` 基线=1 + 迁移谓词、§4.4 的两条新增盲区、§4.6 的官方替代门禁），均已给出实测证据。

---

## 1 段落接缝图谱（逐段实测）

### 1.0 三个块的真实行数（**★纠正 Captain 的「template 47」**）

| 块 | 起止行（编译器实测） | 行数 | 字节 | sha256（首 16） |
|---|---|---|---|---|
| `<template>` … `</template>` | **1–236** | **236** | 12100（含尾换行；`descriptor.template.content` = 12078） | `ae9765b74ef1e28f` |
| `<script setup>` … `</script>` | **238–628** | **391** | 13880（`scriptSetup.content` = 13856） | `22c480afa145756a` |
| `<style scoped>` … `</style>` | **630–988** | **359** | 13959（`styles[0].content` = 13936） | `470d1e5021055089` |
| 合计 | 1–988 | **988** | 39941 | `d7595832cd9c482b` |

**★本文件只有 1 个 `<style>` 块**（与 step 5 的 2 个不同、与 step 6 相同）：`descriptor.styles.length === 1`、`scoped === true`（**编译器实测**）；`grep -c '<style'` = 1（:630）、`grep -c '</style>'` = 1（:988）。⇒ **L0 切 2 段（template + style），不是 3 段**。

**全文共 5 对 `<template>`**（:1 根 / :24 左导航 `v-for` / :92 主观题分支 / :178 评分面板 `v-for` / :225 提示词 `v-if`），**5 个 `</template>`**（:47 / :107 / :211 / :232 / :236）。

> **「template 47」的来源已定位**：`grep -n '</template>'` 的**第一条命中是第 47 行** —— 那是 :24–47 左侧导航 `<template v-for="(sq,i) in subQuestions">` 的闭合标签。真实模板块 **236 行 = 「47」的 5.0 倍**（与 step 5 的「40 vs 194」、step 6 的「48 vs 312」是**同一类错误**、同一根因）。
> → **对拆分本身无影响**（本步模板一行不动），但**任何「.vue 行数下降」的收益核算必须以 236/359 为基数**：**本文件 595 行（模板+样式）是拆不动的**，这是 §5-R9 的直接来源。

**★另两项对 Captain 盘点表的核对**：「script 391 ｜ style 359」**实测正确**；「31 函数」**实测正确**；但「7 段落」只数了脚本里的 7 条 `// =====` 横幅，**漏了横幅之外的头段（S0）与生命周期段（S8）** ⇒ 真实物理段 = **9 段**（§1.1）。

### 1.1 段落清单（**9 段，含横幅外的 S0/S8**）

| # | 段落名 | 起止行（实测） | 行数 | 依据（实测横幅/注释） |
|---|---|---|---|---|
| **S0** | SFC 头 / import 面 / Workbench 壳 / 页级徽标 | 238–267 | 30 | **无横幅**；`/** Workbench 壳… */` :251、`/** 页级状态徽标… */` :259 |
| **S1** | 数据 | 268–283 | 16 | `// ===================== 数据 =====================` :268 |
| **S2** | 导航（题型工具 + 客观题比对 + 方块配色） | 284–428 | **145** | `// … 导航 …` :284；内含 `// 解析学生客观题答案` :327、`// 导航方块颜色` :402 |
| **S3** | 滚动 | 429–438 | 10 | `// … 滚动 …` :429 |
| **S4** | 辅助 | 439–491 | 53 | `// … 辅助 …` :439 |
| **S5** | AI 提示词查看 | 492–514 | 23 | `// … AI 提示词查看 …` :492 |
| **S6** | 审核操作 | 515–594 | 80 | `// … 审核操作 …` :515；内含 `// 格式化代码` :516 |
| **S7** | 数据加载 | 595–614 | 20 | `// … 数据加载 …` :595 |
| **S8** | 生命周期 | 615–627 | 13 | **无横幅**（`onMounted` :615 / `onUnmounted` :623） |
| — | `</script>` | 628 | 1 | — |
| — | **合计** | **238–628** | **391** | = script 块实测行数 ✔ |

**脚本内横幅实测 7 条**（S1/S2/S3/S4/S5/S6/S7）；**模板内 0 条 `=====` 横幅**（只有 12 条职责注释）；**S0 与 S8 无横幅** —— 这正是「7 段」漏数的两段。

### 1.2 逐段详表（段内声明 / 响应式 / 生命周期 / 模板引用）

> 「模板引用」列的名字全部经 `compileTemplate` 产物**实测**（§1.4 是完整口径）。

| # | 段落 | 行数 | 段内顶层声明（名@行） | 响应式类型实测 | 本段注册的生命周期 | 是否被模板直接引用 |
|---|---|---|---|---|---|---|
| **S0** | 头/壳 | 30 | 8 import :239–246 · `route` :248 · `confirm` :249 · `narrow` :252 · `panelOpen` :253 · `collapsed` :255 · **`shellMq` :256（`let`）** · `onShellMq` :257 · `pageStatus` :260 | 3 ref + 1 computed + 1 **setup-let** | ❌（hooks 在 S8） | **部分**：`narrow` :174,216 · `panelOpen` :2,162,174,216,217 · `collapsed` :162,168,170,172,173,177 · `pageStatus` :15 |
| **S1** | 数据 | 16 | `data` :269 `studentName` :270 `studentNo` :271 `schoolName` :272 `q` :273 `subQuestions` :274 `showMaterial` :275 · `subMap` :277 · **`reviewScores` :278 `reviewFeedbacks` :279 `regrading` :280（reactive）** · `reviewingAll` :281 `publishingAll` :282 | 8 ref + **3 reactive** | ❌ | **是**（13 名中 10 名）：`data` :2 · `studentName` :12 · `q` :10,13,14,15,50,154 · `subQuestions` :24,70,154,178 · `showMaterial` :58,60,63 · `reviewScores` :189 · `reviewFeedbacks` :203 · `regrading` :185 · `reviewingAll` :156 · `publishingAll` :157 |
| **S2** | 导航 | **145** | `contentRef` :285 `activeAnchor` :286 **`collapsedSqs` :287（`reactive(new Set())`）** · `toggleCollapse` :289 · `getNavLabel` :294 · `itemTypeLabel` :306 `itemTypeColor` :311 `itemTypeTagClass` :318 · `getSub` :323 · **`getItemKey` :325（死代码）** · `parsedAnswers` :328（computed） · `getStudentItem` :339 · `isItemAnswered` :344 · `isItemCorrect` :349 · `getItemStudentStr` :368 · `getItemRefStr` :386 · `sqResultColor` :403 · `itemResultColor` :412 · `sqBoxClass` :417 | 1 ref + 1 computed + 1 reactive-Set + 1 **static string ref** | ❌ | **是**（16/19）：`contentRef` :56（`ref="…"`） · `collapsedSqs` :26,31,37 · `toggleCollapse` :25 · `getNavLabel` :27,79 · `itemTypeLabel` :42,120 · `itemTypeColor` :120 · `itemTypeTagClass` :120 · `isItemAnswered` :116,122,132 · `isItemCorrect` :116,122,123,132 · `getItemStudentStr` :133 · `getItemRefStr` :138 · `sqResultColor` :33 · `itemResultColor` :41 · `sqBoxClass` :33,41 |
| **S3** | 滚动 | 10 | `scrollTo` :430 · `activateAnchor` :435 | — | ❌ | **是**：`scrollTo` :33,43 · `activateAnchor` :33,43 |
| **S4** | 辅助 | 53 | `materialText` :440（computed） `safeMaterial` :444（computed） `safeSqContent` :445 · `totalAiScore` :446（computed） · `isPracticeMode` :452（computed） · `displayStudentNo` :456（computed） · `isCodeStem` :467 · `subStatusColor` :472 · `subStatusTagClass` :481 · `subStatusText` :483 | 5 computed | ❌ | **是（10/10）**：`materialText` :58,63 · `safeMaterial` :64 · `safeSqContent` :89 · `totalAiScore` :14,50,154 · `isPracticeMode` :11,152 · `displayStudentNo` :12 · `isCodeStem` :127 · `subStatusColor` :84 · `subStatusTagClass` :84 · `subStatusText` :85 |
| **S5** | 提示词 | 23 | `promptModalOpen` :493 `promptLoading` :494 `promptData` :495 `promptSubTitle` :496 · `showPrompt` :498（async） | 4 ref | ❌ | **是（5/5）**：`promptModalOpen` :223 · `promptLoading` :224 · `promptData` :225,228,230 · `promptSubTitle` :223 · `showPrompt` :186 |
| **S6** | 审核操作 | 80 | **`editorRefs` :517（普通对象，非响应式）** · `setEditorRef` :518 · `formatCode` :521 · `useAiFeedback` :526 · `regrade` :532（async） · `reviewAll` :547（async） · `publishAll` :572 | **0 响应式** | ❌ | **是（6/7）**：`setEditorRef` :100（函数 ref） · `formatCode` :96 · `useAiFeedback` :187 · `regrade` :185 · `reviewAll` :156 · `publishAll` :157（`editorRefs` 本身不进模板） |
| **S7** | 数据加载 | 20 | `fetch` :596（async） | — | ❌ | ❌（仅被 S8 的 `onMounted` 调） |
| **S8** | 生命周期 | 13 | **`onMounted` :615 · `onUnmounted` :623** | — | ★**两个 hook 全在此，且全在 setup 同步阶段** | — |

**闭合核对**：段内**顶层声明** = 8+13+19+2+10+5+7+1 = **65** ✔（与 `compileScript().bindings` 的 77 − 12 个 import = **65** 实测一致）；**函数声明** = 1+15+2+5+1+6+1 = **31** ✔（AST 实测 31 个 `FunctionDeclaration`，**0 个嵌套函数**）；**hook 调用语句 2**（S8）⇒ 顶层语句 = 8 import + 65 声明 + 2 hook = **75** ✔（AST 实测 75）。

### 1.3 ★五处「物理位置 ≠ 逻辑归属」的暗礁（实测）

1. **`pageStatus` :259–266 物理在 S0（壳段）、逻辑属 S1 数据段** —— 它只读 `subMap`（S1）。按行区间整段搬会把它留在接线根，造成「接线根持有数据派生」，并让 U2 少一个模板可见名（`pageStatus` 在模板 :15）。
2. **`fetch` :596–613 物理在 S7（独立横幅段）、逻辑属 S1 数据段** —— 它只写 S1 自己的 9 个状态位（`data/studentName/studentNo/schoolName/q/subQuestions/subMap/reviewScores/reviewFeedbacks`），**不读任何其它段**。⇒ 判归 U2（减少 9 条注入边）；若 B 选择独立成 `useLoadReview.js`，**必须登记为偏离 D 项**并让 U7 注入 9 个状态引用。
3. **`getSub` :323 / `getItemKey` :325 物理夹在 S2「导航」横幅中间** —— `getSub` 是 S1 状态的唯一访问器（→ **U2**）；`getItemKey` 无人引用（→ U1 叶子，**见 K1**）。两者都**不是导航逻辑**：按横幅整段搬会错误落进 U3。
4. **`subStatusColor/TagClass/Text` :472–490 物理在 S4「辅助」段** —— 与 `pageStatus`（S1）语义同族（提交状态徽标），但**零响应式依赖**（只读入参）⇒ 判归 **U1 纯叶子**，保持 U2 不引入纯函数。
5. **`editorRefs` :517 是全文件唯一的「非响应式持有外部实例」的对象**，且 `setEditorRef` :518 的 `if (el)` 守卫让它**永不删除**条目（Vue 卸载子组件时以 `null` 调用函数 ref → 被守卫吞掉）。⇒ 必须与 `setEditorRef`/`formatCode` **同单元（U6）且单实例**；两处各声明一个 `{}` ⇒ `formatCode` **静默 no-op**（**L0/L1/build 三类判据全盲**，与 step 6 的 `sqKeyCounter`/`draftChanged` 同一风险类）。

**★另有一处「死读」**：`contentRef` :285 声明为 `ref(null)`、模板 :56 以 `ref="contentRef"` 绑定，但**脚本内从不读取**（全文件仅 2 处命中）。⇒ 它的失绑在运行期**没有任何可观测后果**（Vue 对不在 setupState 中的 string ref 静默忽略，无告警）→ 登记为 U6（口径边界，**影响 = 0**）。

### 1.4 模板可见面实测（拆分的硬边界）

| 类别 | 数量 | 明细（本轮 `compileTemplate` 产物实测） |
|---|---|---|
| `$setup.名字`（**点式**） | **51** | `activateAnchor collapsed collapsedSqs data displayStudentNo formatCode getItemRefStr getItemStudentStr getNavLabel getSub isCodeStem isItemAnswered isItemCorrect isPracticeMode itemResultColor itemTypeColor itemTypeLabel itemTypeTagClass materialText narrow pageStatus panelOpen promptData promptLoading promptModalOpen promptSubTitle publishAll publishingAll q regrade regrading reviewAll reviewFeedbacks reviewScores reviewingAll safeMaterial safeSqContent scrollTo setEditorRef showMaterial showPrompt sqBoxClass sqResultColor studentName subQuestions subStatusColor subStatusTagClass subStatusText toggleCollapse totalAiScore useAiFeedback` |
| 方括号式 `$setup["名字"]`（**点式扫描会整批漏掉**） | **2** | `CodeEditor` :99 · `StatusTag` :11,13,14,15（**两个 import 的组件**） |
| **静态 string ref**（不进 `$setup`） | **1** | `contentRef` :56（编译为 `ref: "contentRef"` 字符串） |
| **模板可见名合计** | **54** | = 53 个 setup 名（51 点式 + 2 方括号式）+ 1 个 string ref；其中 **52 个是顶层声明**，2 个是 .vue 的组件 import |
| 编译产物 `_ctx.` 引用 | **1** | ★唯一命中 = **`_ctx.$router`**（模板 :5 `$router.back()` 的**全局属性**，**不是**掉出作用域的名字）⇒ **`_ctx` 的正确基线是 1，不是 0**（纠正 step 6 的 `ctx_refs_after===0`） |
| `unref(` 调用 | **0** | — |
| 模板内联赋值目标 | **5 处**（3 个名字） | `showMaterial` :58 · `collapsed` :172 · `panelOpen` :174,216 —— 全部编译为 `$setup.X = …`（**成立的前提是这些名字留在 setup 作用域**） |
| `v-model` 目标 | **3 处** | `reviewScores[sq.id]` :189 · `reviewFeedbacks[sq.id]` :203 · `promptModalOpen` :223 → 编译为 `$setup.reviewScores[…]=$event` 等 |
| **函数 ref（非字符串）** | **1** | `:ref="(el) => setEditorRef(sq.id, el)"` :100 |
| 模板内联箭头 | **1**（全文件仅此一处） | 同上 |
| `resolveComponent`（全局组件） | 7 | `a-button a-tag a-input-number a-textarea a-empty a-spin a-modal` |
| `resolveDirective` | 0 | — |
| 模板引用**但非本文件顶层名** | 3 类 | 组件名（2 个 import + 7 个全局 `a-*`）· `$router`（全局属性）· `v-for` 局部量（`sq i item`） |

**★本文件有 1 处死代码**：逐名统计「定义之外是否还有引用 ∨ 模板引用」⇒ 65 个声明中 **64 个被引用**，唯一例外是 **`getItemKey` :325**（详见 §7.3-K1）。⇒ 本步**没有** step 6 的「DEAD = 0」结论，但也**只有一个**可识别死项，且**不得删**。

### 1.5 ★多形态执行路径总表（**本文件独有，必须正面处理**）

**★与 step 6 的异同（实测）**：同样**没有 props、没有第二条路由**（`client/src/router/index.js:37`：`{ path: 'review/:id', component: () => import('../views/teacher/ReviewDetail.vue') }`，**无 props**）；全文**无 `defineProps`/`defineEmits`/`defineExpose`/`withDefaults`/`provide`/`inject`**（实测 0 命中）、**无 pinia/store**（0 命中）。但**形态轴比 step 6 多一条**：step 6 的形态完全由用户交互驱动，**本文件有一条由后端数据驱动的模式轴**：

| 轴 | 驱动源 | 取值 | 可达性实测 |
|---|---|---|---|
| **轴 1 页面模式** | `data.assignment.mode`（后端） | `exam` / `practice` | ★**practice 可达**：`ReviewClass.vue:127-133` 的 `openReview()` **不按 mode 过滤**；`GET /teacher/submissions/:id`（`server/src/routes/teacher.js:55` → `reviewController.js:223-263`）**不拒绝 practice**（拒绝 practice 的是 `:331` review 与 `:387` publish）。默认列表不易遇到（`teacherController.js:494` 让 practice 行 `reviewPending` 恒 0） |
| **轴 2 逐小问题型** | `sq.type` | `'code'` / `'objective'` / **无 type（按 code 处理）** | 模板三处同口径 `sq.type === 'code' \|\| !sq.type`（:31/:92/:179）；**同一页可混合**（左导航逐小题分流） |
| **轴 3 视口** | `matchMedia('(max-width: 1199px)')` :617 | `narrow` true / false | 真浏览器可达；**受视口宽度驱动**（≥1200px 常驻右栏 / <1200px 抽屉化） |
| **轴 4 数据状态族** | 后端返回的 `status`/`aiScore`/`answer`/题干 | `pageStatus` 4 值 · `subStatusText` 6 分支 · 作答/正确/错误 4 态 · `materialText` 有/无 · `promptData` 三态 · `data===null` 的未加载态 | 数据驱动，静态全盲 |

| 分段/声明 | 轴1 practice | 轴1 exam | 轴2 code | 轴2 objective | 轴3 narrow=true | 判定依据（实测行） |
|---|---|---|---|---|---|---|
| 顶栏「练习模式」`StatusTag` | ✅ 渲染 | ❌ 不渲染 | 同左 | 同左 | 同左 | :11 `v-if="isPracticeMode"` |
| 底部 `rp-submit-bar`（保存审核 / 发布成绩） | ❌ **不渲染** | ✅ | 同左 | 同左 | 同左 | :152 `v-if="!isPracticeMode"` |
| `reviewAll` :547 / `publishAll` :572 | 模板面**不可达** | ✅ | 同左 | 同左 | 同左 | :156/:157 |
| 左导航方块（`n-grid`） | ✅ | ✅ | ✅ 单方块（:31–35） | ✅ 每小问一方块（:37–46） | 同左 | :31 vs :37 |
| `CodeEditor` + 「格式化」 + `setEditorRef`/`formatCode` | ✅ | ✅ | ✅（:92–107） | ❌ 不渲染 | 同左 | :92 |
| 客观题 `oi-card` 族（`isItemCorrect`/`isItemAnswered`/`getItemStudentStr`/`getItemRefStr`/`itemResultColor`） | ✅ | ✅ | ❌ | ✅（:110–148） | 同左 | :110 |
| 客观题得分摘要（`getSub(sq.id)?.aiScore`） | ✅ | ✅ | ❌ | ✅（需 `getSub` 非空） | 同左 | :144 `v-if="getSub(sq.id)"` |
| 右栏评分面板 section（`regrade`/`showPrompt`/`useAiFeedback`） | ✅ | ✅ | ✅（需 `getSub` 非空） | ❌ | 同左 | :179 |
| `wb-drawer-toggle` 按钮 + 面板头「关闭」 | ✅ | ✅ | 同左 | 同左 | ✅ **仅 narrow** | :216 / :174 `v-if="narrow"` |
| 根节点渲染（`v-if="data"`） | `data=null` 时 **`rp-page` 不渲染，但 `a-modal`（:223）仍渲染** ⇒ **fragment 双根**（实测 `_createElementBlock(_Fragment…)`） | 同左 | 同左 | 同左 | 同左 | :2 `v-if="data"` vs :222 同级 |

**★三条形态一致性断言（B/C 必须守住）**：

- **A1（模式真值源唯一）**：`isPracticeMode` :452 **只能在 U2 创建一次**，`data` 只能由 U2 的 `fetch` 写。**任何其它单元不得自行 `useRoute()` 再发请求来判断模式**。
- **A2（不得按形态条件创建任何单元）**：U1–U7 **全部无条件实例化**（改前即无条件执行）。尤其 `parsedAnswers`(U4)、`editorRefs`(U6)、`collapsedSqs`(U3)、`pageStatus`(U2) 在**两形态下都必须存在**。改成 `if (isPracticeMode)` 或 `if (sq.type==='objective')` 会改变 setup 期副作用面。
- **A3（`sq.type` 判定口径逐字不动）**：全文件字面量只有 `'code'`/`'objective'`；「无 type 视为编程题」的写法是 **`sq.type === 'code' || !sq.type`**（3 处：:31/:92/:179）—— **不得**改写成 `sq.type !== 'objective'`，**更不得**引入 `'subjective'`（那是 step 6 / Submit.vue 的口径）。

---

## 2 目标 composable 划分

### 2.1 五条不可协商的形式前提

**(a)「模板零改动」在 `<script setup>` 下的成立条件**：Vue 3 把 `<script setup>` 的顶层绑定编译进 `setup()` 的 `__returned__`，模板渲染函数以 `$setup.xxx`（点式）或方括号式访问。**composable 返回值被顶层解构后，与原来直接声明的 ref/函数在模板里语义相同**（ref 解包由 setupState 的 proxyRefs 保证）。因此：

- ✅ 允许：`const { q, subQuestions, reviewScores, getSub, fetch, … } = useReviewPage();`
- ❌ 禁止：把状态藏进嵌套对象（模板要写 `p.f`）—— **等于改模板**。
- ❌ 禁止：在 composable 里使用 `<script setup>` 宏（本文件**连 `defineProps` 都没有**）。

**(b) 单一「接线根」+ 参数注入**：全部 composable 在 `<script setup>` 顶层**同步**调用一次，跨单元共享状态**以参数注入**（ref/reactive 传的是**引用**，天然单实例），**不做嵌套调用**。理由：① 避免循环依赖；② 参数表就是可测试的契约面；③ **保证 2 个 hook 的注册仍在 setup 同步阶段**（§3.1-3 依赖这一点）。

**(c) hook 集中注册**：`onMounted`/`onUnmounted` **只在 .vue 里各注册一次**（回调体放接线根 U7），按原顺序执行，**且注册语句形式与原文件等价**（§3.1-3）。

**(d) ★本文件新增前提（模式真值源唯一）**：`data`/`isPracticeMode` 由 **U2 唯一创建**；`isPracticeMode` **不得**改成 `computed` 之外的形态、**不得**在其它单元重算（§1.5-A1）。

**(e) ★本文件新增前提（非响应式共享状态必须单实例）**：`editorRefs`（普通对象）**只有一处声明**（U6），且**不得**以「在 .vue 重新 `{}`」「解构后重新赋值」等任何形态复制；同理 `shellMq`（`let`）只在 U7 声明一次。

### 2.2 文件 → 单元对照表（**完整覆盖 65 个顶层声明 + 2 个 hook 体**）

命名遵循本仓既有约定：`client/src/composables/<域>/useXxx.js`（具名导出 + `export default`）—— 先例实测：`composables/` 顶层 7 个 .js + `submit/` 9 + `project/` 9 + `question/` 12（step 6 已落地）。★**本步新建 `client/src/composables/review/` 子目录**（`review` 目录**当前不存在**，无同名冲突）。

> 行数口径：**搬移行数** = 源文件中所搬声明所在行的**实测行跨度**（含紧邻注释）；**预估总行数** = 搬移行数 + banner/import/导出/包装（±15%）。

| 目标文件 | 单元 | 搬移内容（源行号，逐字） | 声明数 | 搬移行数 | 预估总行数 |
|---|---|---|---|---|---|
| **U1** `…/review/reviewPure.js` | **纯叶子**（零 vue / 零响应式 / 零内部依赖） | `itemTypeLabel` :306-309 · `itemTypeColor` :311-314 · （T4-F2 注释 :315-317） · `itemTypeTagClass` :318-321 · **`getItemKey` :325** · `safeSqContent` :445 · `isCodeStem` :467-470 · `subStatusColor` :472-478 · （T4-F2 注释 :479-480） · `subStatusTagClass` :481 · `subStatusText` :483-490（+ `dompurify` import） | 9 | ≈40 | **≈60** |
| **U2** `…/review/useReviewData.js` | **数据所有权 + 派生 + 加载** | `pageStatus` :259-266 · `data` :269 `studentName` :270 `studentNo` :271 `schoolName` :272 `q` :273 `subQuestions` :274 `showMaterial` :275 · `subMap` :277 `reviewScores` :278 `reviewFeedbacks` :279 `regrading` :280 `reviewingAll` :281 `publishingAll` :282 · `materialText` :440-443 `safeMaterial` :444 · `totalAiScore` :446-450 · `isPracticeMode` :452-454 · `displayStudentNo` :456-465 · `getSub` :323 · **`fetch` :596-613**（+ `vue`/`dompurify`/`request` import） | **21** | ≈65 | **≈105** |
| **U3** `…/review/useReviewNav.js` | 左导航 + 方块配色 + 滚动锚定 | `contentRef` :285 `activeAnchor` :286 `collapsedSqs` :287 · `toggleCollapse` :289-292 · `getNavLabel` :294-304 · `sqResultColor` :403-410 · `sqBoxClass` :417-427 · `scrollTo` :430-433 · `activateAnchor` :435-437 | 9 | ≈45 | **≈60** |
| **U4** `…/review/useObjectiveCompare.js` | 客观题作答/判定/展示（**轴 2 专属**） | （注释 :327）`parsedAnswers` :328-337 · `getStudentItem` :339-342 · `isItemAnswered` :344-347 · `isItemCorrect` :349-366 · `getItemStudentStr` :368-384 · `getItemRefStr` :386-400 · `itemResultColor` :412-415 | 7 | ≈73 | **≈90** |
| **U5** `…/review/useReviewAiPrompt.js` | AI 提示词查看 | `promptModalOpen` :493 `promptLoading` :494 `promptData` :495 `promptSubTitle` :496 · `showPrompt` :498-513 | 5 | ≈21 | **≈40** |
| **U6** `…/review/useReviewActions.js` | 审核动作 + **编辑器实例持有** | `editorRefs` :517 · `setEditorRef` :518-520 · `formatCode` :521-524 · `useAiFeedback` :526-530 · `regrade` :532-545 · `reviewAll` :547-570 · `publishAll` :572-593 | 7 | ≈75 | **≈100** |
| **U7** `…/review/useReviewPage.js` | **接线根**（.vue 唯一调用入口） | `route` :248 · `confirm` :249 · `narrow` :252 `panelOpen` :253 `collapsed` :255 **`shellMq` :256 `onShellMq` :257** · ★**平移 `onMounted` :615-621 / `onUnmounted` :623-627 两个回调体**为 `onPageMounted()/onPageUnmounted()` | 7 + 2 hook 体 | ≈20 | **≈85** |
| — | 源文件 `ReviewDetail.vue` | `<script setup>` 391 → **≈25–30**；`<template>` 1–236 与 `<style scoped>` 630–988 **逐字节不动** | — | −≈363 | **988 → ≈620–630** |

**声明闭合核对**：9+21+9+7+5+7+7 = **65** ✔（+ 2 个 hook 调用语句 = **67 个非 import 顶层语句**；8 个 import 留在 .vue 或在各单元内）。
**函数闭合核对**：U1 9 + U2 2（`getSub`/`fetch`）+ U3 6 + U4 6 + U5 1 + U6 6 + U7 1（`onShellMq`）= **31 个函数** ✔（全文件 31 个 `FunctionDeclaration` 全部有主，且 **0 个嵌套函数**）。
**模板可见名闭合核对**（52 个声明 + 2 个组件 import = **54**）：U1 8 + U2 16 + U3 8（含 `contentRef`）+ U4 5 + U5 5 + U6 6 + U7 3 = **51**（= 点式 `$setup` 名实测 51 ✔）+ `.vue` 保留的 2 个组件 import = **53 setup 名** ✔ + 1 个 string ref = **54** ✔。

**★.vue 最终行数的诚实估算（不要重犯 step 5/6 的估算错误）**：
- 236（template）+ 359（style，含标签）+ 2（:237/:629 的分隔空行）+ 2（`<script setup>`/`</script>`）+ 5（import：`onMounted`/`onUnmounted`/`useReviewPage` + 2 个组件）+ 1（空行）+ **11–14**（52 个名字的解构，**每行 4–5 个**）+ 2（`onMounted(onPageMounted); onUnmounted(onPageUnmounted);`）≈ **617–625 行**。
- ⇒ **`godfileOver800` 4 → 3（本步唯一可承诺的判据收益，必然达成）**；★★**`over500` 14 → 14（不变）** —— 因为**模板 236 + 样式 359 = 595 行不可触碰**，**本步在 A 档下不可能把 .vue 带出 >500 观察带**（与 step 6 的 983→466 是**结构性不同**）。任何「over500 会降到 13」的预估都是错的。
- ⚠️ **格式敏感**：若 B 把 52 个解构名**一行一个**，script 会多出 40+ 行 ⇒ **B 必须按「每行 4–5 个名字」压缩解构**，并在提交信息里附 `wc -l`。

**依赖方向（保证无环）**：

~~~
U1  reviewPure.js           纯叶子：零内部依赖（只 import dompurify）
U2  useReviewData.js        零内部依赖（vue + dompurify + request）  ← 注入 { route }(U7)
U3  useReviewNav.js         → U1(itemTypeLabel)                      ← 注入 { q, getSub }(U2)
U4  useObjectiveCompare.js  零内部依赖                                ← 注入 { subQuestions, getSub }(U2)
U5  useReviewAiPrompt.js    零内部依赖                                ← 注入 { getSub }(U2)
U6  useReviewActions.js     零内部依赖                                ← 注入 { subMap, reviewScores, reviewFeedbacks,
                                                                          regrading, reviewingAll, publishingAll }(U2)
                                                                       + { confirm }(U7)
U7  useReviewPage.js        → U1..U6 + useConfirm.js（唯一汇聚点；.vue 只 import 它）
~~~

**无环论证**：U2–U6 之间**互不 import**（跨单元调用一律参数注入）；**唯一内部 import 边** = `U3 → U1`；`U7 → U1..U6`。⇒ 7 个新文件的内部有向图是**两层星形**，**无环、无自环**。

### 2.3 ★U7 必须注入的完整依赖清单（**B 照抄，漏一个就是 DoD ④ 指明的「漏列依赖」形态**）

| 被创建者 | 创建序 | 注入内容（**逐名**） | 依据（源行） |
|---|---|---|---|
| **U2** | 1 | `{ route }` | `fetch` 内 `route.params.id` :597 |
| **U3** | 2 | `{ q, getSub }` | `getNavLabel` 读 `q.value.objectiveSettings` :296；`sqResultColor` 调 `getSub` :404 |
| **U4** | 3 | `{ subQuestions, getSub }` | `parsedAnswers` 遍历 `subQuestions.value` :330；`getSub` :332 |
| **U5** | 4 | `{ getSub }` | `showPrompt` 首句 `getSub(sq.id)` :499 |
| **U6** | 5 | `{ subMap, reviewScores, reviewFeedbacks, regrading, reviewingAll, publishingAll, confirm }` | `useAiFeedback` :527、`regrade` :533/535/541/544、`reviewAll` :548/551/556/557/569、`publishAll` :573/576/584/590 |
| — | — | **U6 不需要** `subQuestions`/`q`/`fetch`（实测：`reviewAll`/`publishAll` 走 `Object.values(subMap.value)`，不读 `subQuestions`） | — |

### 2.4 本仓既有先例（**均有事实依据**）

| 先例 | 事实（实测） | 对本步的含义 |
|---|---|---|
| `client/src/composables/` 顶层 7 文件 + `submit/` 9 + `project/` 9 + `question/` 12（**共 37 个 .js**） | 三个**目录化先例**已落地 | 本步用 `composables/review/` 与之一致，**不新建顶层扁平文件** |
| `composables/question/useQuestionEditPage.js`（step 6 接线根，81 行） | 「接线根 + 参数注入 + 无内部环」形态已被 step 6 实测通过 | U7 照此形态；**规模更小**（7 个单元 vs 12 个） |
| `useConfirm.js:44/74`（`export function useConfirm()` / `return { confirm }`） | `confirm` 的形态（函数）不得改 | U7 只调一次 `useConfirm()`，`confirm` 向下注入 U6（**不得**让 U6 自己 `useConfirm()` —— 那会创建第二个 Modal 容器，与 step 6 §2.3-5 同一纪律） |
| `components/CodeEditor.vue:283` `defineExpose({ format })` + `:135-138` `onUnmounted(() => { subscription?.dispose(); editor?.dispose(); })` | **子组件自持并自清** Monaco 实例；父侧只经函数 ref 拿公开实例 | U6 只保留 `editorRefs`/`setEditorRef`/`formatCode` 的**原有**形态；**不得**新增 dispose/清理逻辑（K4） |
| `scripts/gates/cycle-check.mjs:26` 支持 `--root` | 实测 `--root client/src` 可跑（92 文件/234 边/SCC 0） | ⑥ 的替代判据**不需要自建脚本**（§4.6） |

---

## 3 ★响应式与生命周期风险逐条判定（本步核心）

> 判定口径：**等价** = 有明确机制论证，无需实测即可接受；**需特殊处理** = 必须遵守指定写法才等价；**不确定需实测** = 静态阅读无法给出确定结论，必须由 C 用行为验证覆盖。

### 3.1 逐条判定表（沿用 step 2/5/6 的六条框架）

| # | 问题 | 判定 | 理由与依据（全部本轮实测） |
|---|---|---|---|
| **1** | **ref/computed/reactive 所有权** | **等价（需特殊处理）** | `compileScript().bindings` 实测 **77 项** = 12 import + **26 `setup-ref`（19 个 `ref()` + 7 个 `computed()`）+ 4 `setup-reactive-const`（`reviewScores`/`reviewFeedbacks`/`regrading`/`collapsedSqs`）+ 1 `setup-let`（`shellMq`）+ 7 `setup-maybe-ref`（含 import）+ 27 `setup-const`**。**所有权必须唯一**：`q/subMap/subQuestions/reviewScores/reviewFeedbacks/regrading/reviewingAll/publishingAll/data/…`→**U2**；`collapsedSqs/contentRef/activeAnchor`→**U3**；`prompt*`→**U5**；`editorRefs`→**U6**；`shellMq`→**U7**；纯函数→**U1**。跨单元共享一律**注入同一对象引用**（`ref()`/`reactive()` 传引用即共享，**无拷贝**）。★**唯一风险点是「重复创建」**（如 U2 与 U7 各造一个 `q`）→ 模板绑到错的那个 = **静默失效、不报错**；由 §7.2-M4/M7 + §4.3-L1-b 兜住。★**本文件独有的两个所有权陷阱**：**`editorRefs` :517（普通对象，非响应式）** 与 **`shellMq` :256（`let`）** —— 必须是「闭包内单实例」，否则 `formatCode` 静默 no-op / 监听器卸不掉（§1.3-5）。另：**`computed` 的惰性求值语义不变**（依赖追踪由运行时按访问顺序建立，与声明位置无关）；**`reactive(new Set())`（`collapsedSqs`）的代理语义**必须保持（`has/add/delete` 三法）。 |
| **2** | **watch / watchEffect 注册顺序** | ★**等价（本步与 step 5/6 的根本差异：0 个 watch）** | 全文 **`watch(` = 0、`watchEffect(` = 0、`nextTick(` = 0**（实测 grep + AST 双证）。⇒ **不存在注册序约束**，也不需要 step 6 那种「按 watch 所有者源序分批」的红线。★**但由此产生一条新的硬约束**：**拆分不得引入任何 `watch`**（B 若"顺手"把 `fetch` 改成 `watch(() => route.params.id, fetch)` 就是功能变更，见 K7）；C 必须以 `.vue` 与新模块的 `watch(` 计数 **全部为 0** 作为断言（§7.2-M7）。**7 个 computed 的求值时机**由模板访问顺序决定，与声明位置无关 ⇒ 等价。 |
| **3** | **onMounted / onUnmounted 注册等价性（有无异步注册）** | **等价（3 条硬约束）** | ① Vue 规则：hook 必须在 setup **同步执行阶段**调用（含 setup 内同步调用的 composable）；在 `await` 之后或异步回调里调用**会失效并告警**。② 全文只有 **`onMounted` :615** 与 **`onUnmounted` :623** 两个 hook 调用；**无 `onBeforeUnmount`/`onActivated`/`onDeactivated`/`keepAlive`/`getCurrentInstance`**（实测 0 命中）；**无任何第三方 composable 代注册 hook**（本文件**不 import `useDraftAutosave`/`useMonaco*`**，与 step 6 不同）⇒ **hook 队列 = [mounted ×1, unmounted ×1]，不存在跨类顺序问题**。③ ★**注册形态**：方案指定 `.vue` 写 `onMounted(onPageMounted); onUnmounted(onPageUnmounted);`（**直接传具名函数引用**，与 step 6 的 `:335/:336` 同形）。**等价性论证**：Vue 以 `hook.push(cb)` 注册，回调**不接收参数**、`this` 在两形态下同为 `undefined` ⇒ **注册序与执行序均不变**。**硬约束**：**①** 两个 hook 调用必须仍在 `.vue` 顶层**同步**执行**恰好一次**（搬进 U7 后若被塞进 `if`/`onMounted` 内/异步分支 → **不注册 → `matchMedia` 监听器永不添加或永不移除**，且**静态判等看不见**）；**②** 禁止把 `onUnmounted` 改成 `onBeforeUnmount`；**③** 回调体**内层语句序逐字保留**：`onMounted` 内 = `fetch();` → `shellMq = window.matchMedia(...)` → `narrow.value = shellMq.matches` → `if (shellMq.addEventListener) addEventListener else addListener`；`onUnmounted` 内 = `if (!shellMq) return;` → `if (removeEventListener) … else removeListener`。 |
| **4** | **计时器/监听/observer 的清理顺序** | **等价（需特殊处理）** | ★★**实测：本文件自身零计时器、零 observer** —— `setTimeout`/`setInterval`/`clearTimeout`/`clearInterval`/`requestAnimationFrame`/`MutationObserver`/`ResizeObserver`/`IntersectionObserver` **全 0 命中**；**零第三方委托**（不 import `useDraftAutosave`）。**唯一资源 = 1 个 `matchMedia` 监听**：`window.matchMedia('(max-width: 1199px)')` :617 → `addEventListener('change', onShellMq)` :619（**降级分支** `addListener` :620）↔ `removeEventListener('change', onShellMq)` :625（降级 `removeListener` :626）。★**运行时点位（可被逐点比对）**：**① 挂载序** = `request.get('/teacher/submissions/'+route.params.id)`（由 `fetch()` 同步发起）**先于** `matchMedia` **先于** `addEventListener`；**② 卸载序** = `removeEventListener('change', onShellMq)` **单点**（`if (!shellMq) return` 为其前置守卫）；**③ 净增** = 监听器净增 0、存活定时器 0。★**既有缺陷、不得顺手修**：(a) `fetch()` :616 **未 await、未 try/catch** ⇒ 请求失败 = **unhandled rejection**；(b) `onUnmounted` **不取消 in-flight 请求**（无 `AbortController`）⇒ 卸载后仍可能写 ref；(c) `setEditorRef` 的 `if (el)` 守卫 ⇒ `editorRefs` **永不删条目**（陈旧项累积）。三者**照旧保留**，C 的职责是证明「照旧存在且未被放大」。 |
| **5** | **路由/store/请求注入时机** | **等价（需特殊处理）** | ① **无 pinia/store**（实测无 import、无 `useStore`）。② `useRoute()` 调用**一次** :248；**无 `useRouter()`**（模板 :5 走 `$router` **全局属性**，编译为 `_ctx.$router`）⇒ ★**不得为"补齐"而新增 `useRouter()`**（那会新增一个未使用绑定 = 无谓偏离）。③ ★★与 step 6 **相反**：`route.params.id` **不是在 setup 期求值的普通 const**，而是**在 `fetch()` 函数体内、调用时才读**（:597）⇒ 约束 = **`route.params.id` 的读取位置逐字保留在 `fetch` 内**，**不得**提升为 setup 期常量、**不得**改成形参 `submissionId`。④ `useConfirm()` 调用一次 :249（`confirm` 是 setup 期普通 const）⇒ 接线根**必须在 setup 同步阶段调用一次**并把 `confirm` 向下注入 U6。⑤ `request`/`message` 为**静态 import**（无注入时机问题）；`request.js:5` 的 `baseURL = import.meta.env.VITE_API_BASE_URL \|\| '/api'` 是构建期替换。⑥ `router/index.js:37` 的 `review/:id` **无 props** ⇒ **无 `defineProps`**，不存在「默认值路径 vs 显式传入路径」类风险。⑦ 全文 **5 个请求点**：:506（prompt GET）:537（regrade POST）:555（review PUT，**多请求并行 `Promise.allSettled`**）:586（publish PUT）:597（detail GET）。 |
| **6** | **动态 import / 编辑器实例的持有与销毁** | ★**需特殊处理（本文件独有的最大风险面）** | ① **无动态 `import()`**（实测 0 命中）；**无 `import.meta.env`**（实测 0 命中）；组件自身由路由 :37 懒载入 —— **与本步无关**（不动路由）。② ★★**本文件确实持有编辑器实例（与 step 6 相反）**：`editorRefs` :517（**普通对象**）以 `sq.id` 为键持有子组件 `CodeEditor` 的公开实例（经 `defineExpose({format})`，`CodeEditor.vue:283`），由模板的**函数 ref** `:ref="(el) => setEditorRef(sq.id, el)"` :100 注入；`formatCode(sqId)` :521 以 `ed?.format` 调用。⇒ **两种失败形态**：(i) `setEditorRef` 掉出 `$setup` → 渲染期 `_ctx.setEditorRef is not a function`（**响亮**，L1-b 抓到）；(ii) **`editorRefs` 被复制成两份** → 写读分离 → `formatCode` **静默 no-op**（**L0/L1/build 全盲**）⇒ 登记 **U2**。③ 子组件 **自持自清**（`CodeEditor.vue:135-138` 的 `onUnmounted` → `subscription?.dispose(); editor?.dispose()`）⇒ 拆分**不得**新增任何 dispose/清理逻辑。④ `readOnly` :103 是**静态裸属性**（编译为布尔真）—— **不得**"顺手"改成 `:readOnly="…"`。⑤ `contentRef` :56 的 string ref **死读**（§1.3）⇒ 登记 **U6**（影响 0，仅口径边界）。 |

### 3.2 ★「不确定需实测」清单（交给 C，**共 8 条**）

| 编号 | 不确定点 | 为什么我判不了 | C 的最小探针（改前/改后各跑，逐条相同） |
|---|---|---|---|
| **U1** | ★**四形态（practice/exam × code/objective）求值一致性** | 静态可证「定义式与赋值点未改」，**无法证明运行时模板在两个轴上拿到的布尔值/派生值相同**；模板字节判等与 `$setup` 名集合判等**都看不见「值是错的」**。★本文件**多一条后端数据驱动的模式轴**（`assignment.mode`），且 `fetch` 的写入面有 9 个状态位 | 夹具数据驱动 5 组：① `mode='exam'` + 纯 `code` 小题；② `mode='exam'` + 纯 `objective`；③ `mode='practice'` + `code`；④ `mode='practice'` + `objective`；⑤ **混合小题**（两类共存）。逐组断言 §1.5 表的 10 行（含「练习模式 tag 在/不在」「`rp-submit-bar` 在/不在」「`oi-card` 在/不在」「右栏 section 在/不在」） |
| **U2** | ★**函数 ref 真绑定 + `editorRefs` 单实例 + `formatCode` 通路** | 静态可证「名字仍在 `$setup`」（`setEditorRef` 实测在 51 名内），**看不到值**：`editorRefs` 若被复制成两份，`formatCode` 因 `ed?.format` 的**可选链静默 no-op** —— **L0/L1/build 三类判据全盲** | 真装 `CodeEditor` 替身（记录 `format()` 调用次数 + 被赋值的 `el` 身份）：① 主观题形态下点「格式化」(:96) → 断言替身 `format()` **恰好 1 次**（失绑 = 0）；② 断言 `editorRefs` **只有 1 个实例**（对 2 个不同 `sq.id` 各存 1 项，且重渲染后同一 `sq.id` 的项身份不变）；③ `setEditorRef(sqId, null)` **不删除**条目（既有行为，K4） |
| **U3** | ★**`matchMedia` 监听的注册/清理序 + 净增 0** | 静态可证「文本未改」，**不可证**：`shellMq` 非 null、add/remove **同源同函数**、存活监听器净增 0、控制台零 error、以及 `if (!shellMq) return` 早退分支 | 猴补 `window.matchMedia`（返回可注入 `matches` 的假 MQL，记录 `addEventListener/addListener/removeEventListener/removeListener` 调用）+ `console.error` 计数。挂载 → 卸载，断言：**① oplog 按源标识** = `[matchMedia:(max-width: 1199px), addEventListener:change]` → 卸载 `[removeEventListener:change]`；**② 监听器净增 = 0**；**③ 存活定时器 = 0**；**④ 控制台零 error**；**⑤ 未挂载即卸载（`shellMq` 仍为 null）时不调用任何 remove、不抛** |
| **U4** | ★**`fetch` 的接线与写入面**（**④ 扫描器对它全盲**，实测 PC2b = 0 命中） | `fetch` 与浏览器全局**同名** ⇒ 自由标识符白名单必然放过它；若接线漏了，**静态判据不会响**。同时 `fetch` 的 9 个写入位含 `??`/`\|\|` 兜底语义（:609/:610），逐字段易漏 | `request` 替身计数 + 逐字段对拍：① 挂载后**恰好 1 次** `GET /teacher/submissions/{route.params.id}`（此处用 `route.params.id` 的字面量拼接，见源 :597）；② 断言 `data/studentName/studentNo/schoolName/q/subQuestions` 与夹具**逐字段相同**；③ 断言 `subMap` 的键 = `s.subQuestionId \|\| s.questionId`、`reviewScores[key] = finalScore ?? aiScore ?? 0`（**`??` 对 0/false 不兜底**）、`reviewFeedbacks[key] = teacherFeedback \|\| ''`（**`\|\|` 对空串兜底**）—— 两侧逐键相同；④ 请求失败（reject）时**不抛同步异常**、控制台错误类型与改前相同（unhandled rejection，K2） |
| **U5** | **hook 注册形态（传引用 vs 包裹）+ hook 队列计数** | 静态可证「注册语句仍在 .vue 顶层同步」，**不可证**运行期队列计数与执行序 | 真生命周期装置：断言 `instance.mounted.length === 1`、`unmounted.length === 1`、`beforeUnmount.length === 0`；卸载后 `shellMq` 监听已移除；**并断言注册序**（`onMounted` 先于 `onUnmounted` 入队） |
| **U6** | **`contentRef` 死读的 string ref**（影响 = **0**，仅口径边界） | 静态可证「模板 byte 未改」，但**看不到绑定是否真的落到 setupState**；即使失绑也**无任何可观测后果**（脚本从不读它） | 装置断言：`__returned__` 含 `contentRef`（键存在）+ `isRef(contentRef) === true` + 渲染不抛。**不要求** C 造出"失绑的可见后果"（不存在） |
| **U7** | **数据驱动的状态族（`pageStatus` 4 值 / `subStatusText` 6 分支 / `subStatusColor` 5 分支 / `getNavLabel` 两模式）** | 静态可证映射表逐字未动，**不可证运行期取值相同**（需要特定 `status`/`classificationMode` 数据组合） | 数据驱动 6 组：`subs` 空 / 全 `published` / 全 `reviewed` / 混合（→ 4 个 `pageStatus` 文本「无提交/已发布/已审核/待审核」）；`sub.status` ∈ {`ai_graded`,`published`,`reviewed`,`submitted`,undefined} + `aiFeedback==='请联系老师'`（→ 6 个 `subStatusText`）；`objectiveSettings.classificationMode` ∈ {`flat`,`group`} × 有/无 `objectiveItems[0].type`（→ `getNavLabel` 4 种文本，含 `第N小题 单选`） |
| **U8** | **4 个 `reactive` 对象的身份一致性 + `reactive(new Set())` 语义** | `reviewScores`/`reviewFeedbacks` 经 `v-model` 双向写、`regrading` 经 3 处写、`collapsedSqs` 是 **`reactive` 包裹的 Set 代理**；若任一个被复制成两份 → 折叠态/最终分**静默失效**（静态全盲） | ① 断言 4 个对象各只有 1 个代理（改前侧取 `__returned__` 的同名对象，两侧 `isReactive===true`）；② `toggleCollapse(id)` 两态后 `collapsedSqs.has(id)` 与模板 `:class` 同步；③ 写 `reviewScores[k]` → 同 tick 后 `reviewAll` 读到的值相同；④ `regrade` 断言 `regrading[sq.id]` 由 true→false 且模板 `:loading` 同步 |

> **判定说明**：U1–U8 属「静态阅读无法排除」的类，**不是「我猜有问题」**。其中 **U2、U4 是本文件独有的**：U2 由「父侧以普通对象持有子组件实例 + 可选链调用」这一结构直接产生（step 6 的 Monaco 是**子组件自持**，**没有对应项**）；U4 由「唯一的加载函数名恰好与浏览器全局同名」产生（step 6 的叫 `load`，**没有对应项**）。**U3 描述的既有行为（不取消 in-flight 请求、unhandled rejection）在改前就存在** —— C 的职责是**证明它照旧存在且没有被放大**，不是修它。

---

## 4 ★护航配方（DoD §5 的 client A 档 5 条判据，逐条落地）

### 4.1 事实核查（本轮实测，**不采信历史报告**）

| 问题 | 实测结论 | 证据 |
|---|---|---|
| client 侧有多少单测？ | **0** | `client/package.json` 的 scripts 只有 `dev/build/preview`，**无 vitest/jest/test** |
| 浏览器驱动可用吗？ | **可用**：`playwright/test 1.60.0`，chromium-1217/1223 + headless_shell + firefox-1522 + webkit-2287 已安装 | `ls ~/Library/Caches/ms-playwright` |
| L1 编译器可用吗？ | **可用**：`vue/compiler-sfc 3.5.34`（= `vue 3.5.34`） | `client/node_modules` |
| ④ 扫描器依赖可用吗？ | **可用**：`babel/parser 7.29.8` + `babel/traverse 7.29.8` | `client/node_modules`（★**根 node_modules 无 traverse**，必须在 `client/` 下运行） |
| **有 jsdom 吗？** | ❌ **两处均无**（`client/node_modules/jsdom`、`node_modules/jsdom` 实测 ABSENT） | ⇒ **⑤ 的装置形态被钉死**：`createRenderer` + 自写 nodeOps（step 5/6 已实证，**推荐**），或真浏览器 |
| ★**既有 E2E 覆盖本文件吗？** | ★★**有真实覆盖（与 step 5/6 不同）**：① `tests/ui-redesign-verify/specs/e2e-03-teacher-review.spec.mjs:44-58`（T3-03-1）走完整链路 `/teacher/review` → `.../class/:id` → `/teacher/review/:id`，断言 `.rp-page` 可见、`.rp-top` 含学生姓名与「总分」、截图、**控制台意外错误 = []**；② `specs/visual-regression.spec.mjs:204` 区域 `teacher-review-detail-dark` 直接 goto `/exam/teacher/review/{submissionId}`。★覆盖面 = **客观题作业**（`OBJ_ASSIGN_TITLE`）⇒ 轴 2 的 objective 分支 + 轴 1 的 exam 形态；**未覆盖** code 分支与 practice 形态 | `grep -rn "review/" tests/ui-redesign-verify/specs/*.mjs` + 读 spec 全文 |
| axe 可用吗？ | **本轮未复测**；step 5 实测三处均无 `axe-core`、**禁联网** ⇒ **按「不可用」处理** | constraints §1 |
| 端口/服务现状 | **本轮未探测**（A 只读，硬禁令禁止起服务）。⇒ B/C 若用真后端 rig（`RIG_PORT=3100`），**必须自检** `lsof -nP -iTCP -sTCP:LISTEN` 且严禁 `:5173`/`:3000` | — |

### 4.2 L0 · **2 段**切片字节判等（成本 ≈ 10 分钟，零依赖）

★★**本文件只有 1 个 style 块**（§1.0 实测）⇒ 切 **2 段**；**必须显式打印 `descriptor.styles.length` 作为自证**。
★★**对 step 6 范本的纠正（必读）**：step 6 的 L0 脚本对**改后**文件也用改前的固定行号（`awk 'NR>=856&&NR<=983'`）—— 而改后 .vue 只有 466 行 ⇒ **改后切片为空、`cmp` 两个空文件必然"通过"**（step 6 的 C 在实测中把改后 style 边界改成了 **339–466**，属静默修正）。⇒ **本方案强制：两侧的行区间必须各自从该侧文件的 `descriptor` 取**，**禁止**两侧共用一组行号。

~~~bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
ANCHOR=$(git rev-parse HEAD)          # C 执行前必须重新取；本方案实测锚点见文首
F=client/src/views/teacher/ReviewDetail.vue
rm -rf /tmp/rd7 && mkdir -p /tmp/rd7/before
git archive "$ANCHOR" "$F" | tar -x -C /tmp/rd7/before
cd client
node <<'DSHNODE'
const fs=require('fs'), crypto=require('crypto');
const {parse}=require('@vue/compiler-sfc');
const sha=(b)=>crypto.createHash('sha256').update(b).digest('hex');
const NL=String.fromCharCode(10);
const sides={
  before:'/tmp/rd7/before/client/src/views/teacher/ReviewDetail.vue',
  after :'src/views/teacher/ReviewDetail.vue',
};
const cut=(src,a,b)=>src.split(NL).slice(a-1,b).join(NL)+NL;   // 1-based 闭区间，保留尾换行
const got={};
for(const [k,f] of Object.entries(sides)){
  const src=fs.readFileSync(f,'utf8');
  const {descriptor:d}=parse(src,{filename:'ReviewDetail.vue'});
  const tb=[d.template.loc.start.line, d.template.loc.end.line];
  const sb=[d.styles[0].loc.start.line, d.styles[0].loc.end.line];
  got[k]={tb,sb,styles:d.styles.length,scoped:!!d.styles[0].scoped,
          tpl:cut(src,...tb), sty:cut(src,...sb),
          tplDesc:d.template.content, styDesc:d.styles[0].content};
  console.log(k+': template '+tb.join('-')+' | style '+sb.join('-')+
              ' | styles='+d.styles.length+' scoped='+d.styles[0].scoped+
              ' | file='+(src.match(/\n/g)||[]).length+' 行');
}
// —— 切片边界自证（防「切错还得 PASS」）——
for(const k of ['before','after']){
  const g=got[k];
  console.log(k+' template 首行='+JSON.stringify(g.tpl.split(NL)[0])+' 末行='+JSON.stringify(g.tpl.split(NL).slice(-2)[0]));
  console.log(k+' style    首行='+JSON.stringify(g.sty.split(NL)[0])+' 末行='+JSON.stringify(g.sty.split(NL).slice(-2)[0]));
  console.log(k+' template bytes='+Buffer.byteLength(g.tpl)+' sha256='+sha(g.tpl));
  console.log(k+' style    bytes='+Buffer.byteLength(g.sty)+' sha256='+sha(g.sty));
}
const ok = got.before.styles===1 && got.after.styles===1 &&
           got.before.scoped===true && got.after.scoped===true &&
           got.before.tpl===got.after.tpl && got.before.sty===got.after.sty &&
           got.before.tplDesc===got.after.tplDesc && got.before.styDesc===got.after.styDesc;
console.log('STYLES_LENGTH_1_AND_BYTE_IDENTICAL = '+ok);
process.exit(ok?0:1);
DSHNODE
~~~

**改前基线（本轮实测，C 必须复算出同样的数）**：template 1–236 / 12100 B / `ae9765b74ef1e28fb0e6903f40d37c3ebecfe91882197f55c093b998efe2f4ca`；style 630–988 / 13959 B / `470d1e502105508973ba255c67f074f8de9d187ee6b9a8bc825305e5840d3208`。

**L0 补充 A（覆盖「函数体是否被改写」，逐声明子串命中口径）**：对**改前**文件的 **65 个顶层声明**按 AST 行区间切块（`babel/parser` 顶层语句的 `loc`），对每块求 `sha256`，再断言该块文本在「7 个新模块 + 改后 .vue 的 script 段」的**并集语料**中出现**恰好 1 次**（§1.2 已给出每段行区间；白名单差异仅限：banner / import 行 / `export` 前缀 / 缩进 / U7 的两处 hook 包装行）。**期望：65/65 命中、重复 0、缺口 0**（其中 2 个 hook 体为**平移**、其余 63 为**逐字节**）。

### 4.3 L1 · 编译级对拍（**必须用「冻结的改前 bindingMetadata」口径**，成本 ≈ 20–40 分钟）

~~~bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek/client"
node <<'DSHNODE'
const fs=require('fs');
const {parse,compileScript,compileTemplate}=require('@vue/compiler-sfc');
const FN='ReviewDetail.vue';
const BEF='/tmp/rd7/before/client/src/views/teacher/ReviewDetail.vue';
const AFT='src/views/teacher/ReviewDetail.vue';
function load(f){ const {descriptor:d}=parse(fs.readFileSync(f,'utf8'),{filename:FN});
  return {d, b:compileScript(d,{id:'rd7fixed'}).bindings}; }     // ★ id 两侧必须相同
const A=load(BEF), B=load(AFT);
const FROZEN=JSON.parse(JSON.stringify(A.b));                     // ★ 冻结改前元数据（JSON 往返去引用）
const tpl=(o,md)=>compileTemplate({source:o.d.template.content,filename:FN,id:'rd7fixed',scoped:true,
                                   compilerOptions:{bindingMetadata:md}});
const a1=tpl(A,A.b), b1=tpl(B,B.b);        // own-bindings（仅作诊断，不作判据）
const a2=tpl(A,FROZEN), b2=tpl(B,FROZEN);  // ★ 权威口径
const names=c=>[...new Set([
  ...c.split('$setup.').slice(1).map(x=>{const m=x.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);return m?m[0]:null;}).filter(Boolean),
  ...c.split('$setup["').slice(1).map(x=>x.split('"')[0]),          // ★★ 方括号式（实测 2 个）
])].sort();
const ctx=c=>[...new Set(c.split('_ctx.').slice(1).map(x=>{const m=x.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);return m?m[0]:null;}).filter(Boolean))].sort();
const out={};
out.sanity_template_source_byte_equal  = A.d.template.content===B.d.template.content;
out.template_compile_frozen_byte_equal = a2.code===b2.code;                   // ★ 期望 true（权威）
out.template_compile_own_byte_equal    = a1.code===b1.code;                   // 期望 false（仅诊断）
out.styles_array_equal = JSON.stringify(A.d.styles.map(s=>({scoped:!!s.scoped,content:s.content})))
                      === JSON.stringify(B.d.styles.map(s=>({scoped:!!s.scoped,content:s.content})));
out.styles_count = B.d.styles.length;                                        // ★ 期望 1（自证"几个 style 块"）
const NA=names(a1.code), NB=names(b1.code);
out.setup_names_before=NA.length; out.setup_names_after=NB.length;            // ★ 期望 53 / 53
out.setup_names_missing=[...NA].filter(n=>!NB.includes(n));                   // ★ 期望 []
out.setup_names_added  =[...NB].filter(n=>!NA.includes(n));                   // ★ 期望 []
out.ctx_refs_after=ctx(b1.code);                                              // ★★ 期望 ["$router"]（**不是 0**）
out.unref_calls_after=(b1.code.split('unref(').length-1);                     // ★ 期望 0
// —— 迁移谓词（★已修正 step 6 范本的假阳性，见 D-L1）——
const allowed=(f,t)=> f===undefined            // 改前不存在的**新名字**：任何类型都合法
                   || t===undefined            // 名字消失（模板可见名的消失已被 L1-b 拦截）
                   || t==='setup-maybe-ref';   // ref 退化为 maybe-ref
const bad=[]; for(const k of new Set([...Object.keys(A.b),...Object.keys(B.b)]))
  if(!allowed(A.b[k],B.b[k])) bad.push(k+': '+A.b[k]+' -> '+B.b[k]);
out.illegal_binding_migrations=bad;                                           // ★ 期望 []
console.log(JSON.stringify(out,null,1));
const pass = out.template_compile_frozen_byte_equal && out.styles_array_equal && out.styles_count===1
  && out.setup_names_missing.length===0 && out.setup_names_added.length===0
  && out.ctx_refs_after.length===1 && out.ctx_refs_after[0]==='$router'
  && out.unref_calls_after===0 && out.illegal_binding_migrations.length===0
  && out.sanity_template_source_byte_equal;
process.exit(pass?0:1);
DSHNODE
~~~

**判据（5 条，缺一不可；退出码必须 0）**：
- **L1-a** `template_compile_frozen_byte_equal === true`（**权威**：模板源未改 + 与 script 侧完全解耦）。
- **L1-b** `setup_names_missing === []` 且 `setup_names_added === []` 且 **`ctx_refs_after === ["$router"]`**（★**不是 0** —— 模板 :5 的 `$router` 是全局属性，实测基线就是 1；写成"0"会把**正确重构判 FAIL**）且 `unref_calls_after === 0`。
- **L1-c** `styles_array_equal === true` 且 `styles_count === 1`。
- **L1-d** `illegal_binding_migrations === []`（**谓词已修正**：允许「改前不存在的新名字（任意类型）」「名字消失」「`X → setup-maybe-ref`」；其余方向 = FAIL）。
- **L1-e**（本文件新增）**模板静态 string ref 自证**：`grep -c ' ref="' <file>` = **1** 且名字仍是 `contentRef`（它**不进** `$setup`，L1-b 覆盖不到）。
- ⚠️ **不要**对拍整个 `compileScript().content`（step 5 已证会误报）；**不要**把 `template_compile_own_byte_equal` 当判据（step 6 实测同类差异 84 行，属 own 口径的诊断面）。

**★own 口径差异如何区分「同类」与「行为差异」（沿用 step 6 实测口径）**：

| 现象 | 归类 | 处置 |
|---|---|---|
| `_component_x` 声明**顺序**变化、`_hoisted_N`/`_cache[N]` **编号位移**、`_createElementVNode` 行序变化 | **同类**（等价重排） | 允许；**但必须同时满足 L1-a** |
| 事件/属性从静态变为 `8 /* PROPS */` + `["onClick"]` 数组 | **同类**（更新粒度变细，语义不变） | 允许；**只允许出现在 own 诊断口径**；冻结口径出现即 FAIL |
| 某元素 `patchFlag` **跨类**变化（`8 PROPS` → `16 FULL_PROPS`）、新增 `512 NEED_PATCH`、`dynamicProps` 增删 | **行为差异** | **直接 FAIL** |
| 片段类 flag 变化（`64 STABLE_FRAGMENT` ↔ `128 KEYED_FRAGMENT`） | **行为差异**（列表 key 语义变了） | **直接 FAIL** —— ★**除非**该块的源是**常量且块内无响应式读**（step 6 的 D-L2 豁免；本文件无此情形，若出现须逐块论证） |

**操作口径**：把两份产物的 `/* NAME */` 注释做**多重集**统计（`code.split('/* ').slice(1).map(x=>x.split(' */')[0]).filter(x=>/^[A-Z_]+$/.test(x))`）——**多重集相等** ⇒ 同类；**不等** ⇒ 逐条落到上表判定。**本文件改前基线多重集**（own 口径）：`{CACHED:23, STABLE:13, TEXT:21, PROPS:18, CLASS:6, KEYED_FRAGMENT:5, STABLE_FRAGMENT:4, DYNAMIC:3, DYNAMIC_SLOTS:1, NEED_PATCH:2}`；冻结口径下渲染产物 sha256 前 16 = `6aab09dda14e75aa`（32258 字符）。

### 4.4 ④ 自由标识符扫描（**必做**，成本 ≈ 1 分钟/轮）

**实现（AST 作用域分析，不是正则）**：`babel/traverse`（**必须在 `client/` 下运行**，根 `node_modules` 无 traverse）→ `parse(sourceType:'module')` → `traverse(ast,{ Program(p){ p.scope.crawl(); }, … })` → 对每个 `ReferencedIdentifier` 判 `path.scope.getBinding(name)`；未绑定且不在**紧凑的 JS/浏览器全局白名单**内 ⇒ 计为自由标识符（⛔ 白名单**不得**包含 `objectiveSettings`/`subQuestions` 这类业务名）。

**★本步实测的扫描器边界（三条，全部本轮复现）**：

| # | 边界 | 实测证据 | 兜底判据 |
|---|---|---|---|
| **B-1** | ★**`fetch` 是浏览器全局** ⇒ 本文件唯一的加载函数被白名单放过 | **PC2b（把 `async function fetch()` 改名 `fetchRenamed()` 且保留 :616 调用点）报 0 命中** | ⑤ **T9**（挂载后请求数必须 = 1）+ 单创建点断言（`fetch` 声明 ×1） |
| **B-2** | ★**52 个模板可见名里有 31 个在脚本段内 0 引用** ⇒ 若 B 在 `.vue` 里漏解构，④ 报 0 | **PC2c（把 `async function showPrompt(sq)` 改名）报 0 命中**；实测 `TEMPLATE_ONLY` = **31 名**（含 `formatCode`/`setEditorRef`/`showPrompt`/`reviewAll`/`publishAll`/`regrade`/`useAiFeedback`/`toggleCollapse`/`sqBoxClass`/`itemResultColor`/`safeMaterial`/…） | **L1-b**（`setup_names_missing === []`）+ ⑤ **T1** |
| **B-3** | DoD ④ 已明文登记的边界：**「被调方声明了形参、但调用方没传」看不见** | step 6 的 plan:143 | ⑤ 真运行时对拍 |

**实测基线（本轮，`scope.crawl()` 口径）**：

| 对象 | 结果 |
|---|---|
| `ReviewDetail.vue` 的 script 段（239–627，389 行） | **自由标识符 = 0** ✅ |
| **正控 1**：删掉 `import DOMPurify from 'dompurify';` | 报 **2** 个：`["DOMPurify@205","DOMPurify@206"]` ✅ |
| **正控 2**：`function getSub(` → `function getSubRenamed(`（保留 3 处调用点） | 报 **3** 个：`["getSub@94","getSub@166","getSub@261"]` ✅ |
| **正控 3a**：删掉注入 `const route = useRoute();` | 报 **1** 个：`["route@359"]` ✅ |
| **正控 3b**：删掉注入 `const { confirm } = useConfirm();` | 报 **1** 个：`["confirm@338"]` ✅ |
| **反例（不算正控）**：改名 `async function fetch()` | 报 **0** —— **正是 B-1** |
| `useConfirm.js`（step 6 的 `then(onFulfilled, onRejected)` **对象方法简写形参**假阳性样本） | **`crawl` 口径 = 0** ✅（本步实测：`babel/traverse` 天然两遍，**单遍实现同样 0** —— step 6 的「单遍报 7 个假阳性」实测**不适用于 traverse 配方**，那是手写 walker 的问题；仍要求用 `scope.crawl()` 形式） |
| **全 client 面**（92 个 `.js/.mjs/.vue`，.vue 取 script 段） | **76 干净 / 16 有命中**，**16 个全部是白名单缺口**（不是缺陷）：`defineProps`/`defineEmits`/`defineExpose` 宏（11 文件）· `Node`（CodeEditor.vue, useMonacoKeyboardA11y.js）· `Function`/`CSS`/`getComputedStyle`/`requestAnimationFrame`/`cancelAnimationFrame`（ListPage.vue, browserCompat.js, antd-theme.js, useMonacoTheme.js）⇒ **若 C 把扫描面扩到全 client，必须先把这些放进白名单**（step 6 的 D-L5 同类） |

**落地形态（B 每批、C 每轮各跑一次）**：

~~~bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek/client"
node <<'DSHNODE'
const fs=require('fs');
const parser=require('@babel/parser'), traverse=require('@babel/traverse').default;
const NL=String.fromCharCode(10);
const GLOBALS=new Set(['undefined','null','true','false','NaN','Infinity','console','window','document',
 'localStorage','sessionStorage','fetch','setTimeout','clearTimeout','setInterval','clearInterval',
 'Promise','Object','Array','String','Number','Boolean','Math','JSON','Date','RegExp','Error','Map','Set',
 'TextDecoder','TextEncoder','URL','FormData','AbortController','structuredClone','queueMicrotask',
 'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','globalThis',
 'MutationObserver','ResizeObserver','IntersectionObserver','performance','crypto','navigator','WeakMap','Symbol','Proxy','Reflect']);
function scan(code){ const ast=parser.parse(code,{sourceType:'module',errorRecovery:false});
  const free=new Set();
  traverse(ast,{ Program(p){ p.scope.crawl(); },                       // ★ 两遍：先建作用域树
    ReferencedIdentifier(p){ const n=p.node.name;
      if(!p.scope.getBinding(n) && !GLOBALS.has(n)) free.add(n+'@'+p.node.loc.start.line); } });
  return [...free]; }
const VUE='src/views/teacher/ReviewDetail.vue';
const lines=fs.readFileSync(VUE,'utf8').split(NL);
const scriptBody=lines.slice(238,627).join(NL);     // 239..627（**不含 <script setup> 与 </script>**）
const targets=[...process.argv.slice(2)];
let bad=0;
for(const f of targets){
  const r=scan(f.endsWith('.vue')?scriptBody:fs.readFileSync(f,'utf8'));
  if(r.length){ bad++; console.log('FREE', f, JSON.stringify(r)); } else console.log('OK  ', f);
}
console.log('FILES_WITH_FREE='+bad); process.exit(bad?1:0);
DSHNODE
~~~

（★注意 `.vue` 的行区间 `238:627` 是**改前**的；改后必须用 `descriptor.scriptSetup.loc` **重新取**，**禁止**照抄本行号。**正控必须每次同跑** —— 只报 0 不算通过。）

### 4.5 ⑤ 真运行时对拍（**必做**，成本 ≈ 首次 3–5 h，之后每批 ≈30 min）

**装置形态（★优先复用 step 5/6 已实证的形态，不要另发明）**：`jsdom 不存在`（本轮复测）⇒ **不要试图在 Node 里 mount**。两种可选，**推荐 A**：

| | 装置 | 组成 | 成本 |
|---|---|---|---|
| **A（推荐）** | **仓库外「真 Vue + 真模板产物 + 真生命周期」无 DOM 装置**（step 5/6 已跑通，直接复用骨架） | ① 7 个新模块的**逐字节副本**（`cmp` 全等自证）；② 插桩副本（**仅在函数入口加一行计数**，其余逐字）；③ **接线根 `page.mjs` 由真 `.vue` 的 `<script setup>` 原文派生**（import 行上提 + specifier 重指向替身），`return` 直接采用编译器产出的 `__returned__`；④ **模板 = `compileTemplate()` 的真实产物**，用**真 `vue 3.5.34` 的 `createRenderer` + 自写 nodeOps** 挂载 ⇒ 模板对 `$setup` 的每一次访问**都真发生**；⑤ **真 `onMounted`/`onUnmounted`**；⑥ 替身：`vue-router`（`useRoute` 返回带可写 `params` 的假路由）/`ant-design-vue`（`message`）/`dompurify`/`api/request.js`（**记录每次调用的 method+url+body，并可控 resolve/reject**）/**2 个 .vue 组件**（`CodeEditor` 需暴露 `format()` 计数 + 渲染全部 slot；`StatusTag` 渲染 `text`）/`useConfirm.js`（**记录 options 原对象**，`onOk` 可手动触发）/`Transition` 改直通/`window.matchMedia` 假 MQL；⑦ `import.meta.env.BASE_URL → "/"`、极简 `document` 替身；**无网络、无端口、不碰库** | 复用 step 6 骨架 ≈1–2 h 适配 |
| **B（备选）** | **Playwright + 仓库外静态产物 + `page.route` 拦截 API** | `vite build --outDir /tmp/rd7/dist`（**禁碰 `client/dist`**）+ 31xx 静态服务 + `page.route('**/exam/api/teacher/submissions/**')` 直接 fulfill + `page.addInitScript` 预置 `localStorage.token/user`（router 守卫需要；`user.role='teacher'`） | ≈1.5–2 h（含构建与登录态） |

**★要验的运行时事实清单（改前/改后各跑一遍，逐条相同）**：

| # | 事实 | 期望 | 对应 |
|---|---|---|---|
| **T1** | **接线根的返回面** | `__returned__` 含全部 **53 个 setup 名**（51 点式 + **2 方括号式**）+ `contentRef`；渲染**不抛** "was accessed during render but is not defined"；渲染产物 `_ctx.` 唯一命中 = `$router` | U6 / L1-b |
| **T2** | **类型事实（运行时，不是编译期）** | **19 个 ref + 7 个 computed 全部 `isRef===true`**；**4 个 reactive `isReactive===true`**（含 `collapsedSqs` 的 Set 代理）；`shellMq` 初值 `null` 且**不是 ref**；`editorRefs` 是**普通对象**（`isReactive===false`） | §3.1-1 / U8 |
| **T3** | **四形态求值** | 按 §3.2-U1 的 5 组夹具驱动 `fetch` 的 resolve 值 → 断言 §1.5 表的 10 行；**并断言 `data=null` 时 `rp-page` 不渲染而 `a-modal` 仍渲染（fragment 双根）** | U1 |
| **T4** | **setup 期副作用序（本文件无 watch，改为「调用序 oplog」）** | ★**oplog 必须按「源标识」命名**（`request.get:/teacher/submissions/<id>` → `matchMedia:(max-width: 1199px)` → `addEventListener:change`）；**换序必须被抓住**（若按注册序号/hook index 命名，换序也会"通过"） | §3.1-4 / U3 |
| **T5** | **清理序（卸载）** | `unmount()` 后 oplog = `[removeEventListener:change]`（sink 若非现代分支则 `[removeListener:change]`）；**监听器净增 = 0、存活定时器 = 0、控制台零 error** | U3 |
| **T6** | **早退守卫分支** | 未挂载即卸载（`shellMq` 为 `null`）⇒ `onUnmounted` 首句 `return`，**不调用任何 remove、不抛** | §3.1-3③ |
| **T7** | **`narrow` 两态 + `onShellMq` 的两条语句** | 假 MQL `matches=true` → `narrow.value===true` 且 **`panelOpen` 不被重置**；再 `matches=false` → `narrow.value===false` **且 `panelOpen.value===false`**（逐语句对拍） | §3.1-4 |
| **T8** | **函数 ref 真绑定 + `formatCode` 通路** | `editorRefs[sqId]` 非空；调 `formatCode(sqId)` ⇒ 替身 `format()` **恰好 1 次**（失绑/复制成两份 ⇒ 0 次 → **抓 U2**） | U2 |
| **T9** | **`fetch` 接线 + 写入面** | 挂载后 `request.get` **恰好 1 次**，URL = `/teacher/submissions/{route.params.id}`；6 个状态逐字段对拍；`subMap` 键 = `s.subQuestionId \|\| s.questionId`；`??` / `\|\|` 兜底语义逐键相同（**抓 B-1**） | U4 |
| **T10** | **4 个 reactive 单实例** | `reviewScores`/`reviewFeedbacks`/`regrading`/`collapsedSqs` 各只有 1 个代理；`toggleCollapse` 两态后 `has(id)` 与模板 `:class` 同步；`regrade` 期间 `regrading[sq.id]` true→false | U8 |
| **T11** | **数据驱动状态族 6 组** | `pageStatus` 4 值文本；`subStatusText` 6 分支；`subStatusColor` 5 分支；`getNavLabel` flat/group × code/objective 4 文本；`isItemCorrect` 的 choice/multi_choice/judge/fill 4 题型逐分支 | U7 |
| **T12** | **5 处守卫/请求分流** | `showPrompt` 的 `if (!sub) return`；`useAiFeedback` 的 `if (!sub?.aiFeedback) return message.warn('暂无 AI 评语')`；`regrade` 的 `if (!sub) return`；`reviewAll` 的 `if (!subs.length) return message.warn('无提交记录')` + `Promise.allSettled` 的成功/失败文案分流；`publishAll` 的 `confirm({…})` **options 逐字段对拍**（title/content/okText/cancelText/danger）+ `onOk` 发出的 `PUT /teacher/submissions/publish` body | §3.1-5 |
| **T13** | **既有行为照旧（证明未被放大，不是修它）** | ① `fetch()` 未 await/未 catch ⇒ 失败时是 **unhandled rejection**，与改前同形；② 卸载后 in-flight 请求仍写 ref；③ `editorRefs` 永不删条目；④ `setEditorRef(id, null)` 被守卫吞掉 | K2/K3/K4 |
| **T14** | **装置自证（每次必做）** | `client/dist` 未变（`find … -newermt` 或指纹）、仓库内**零写入**、所有副本 `cmp` 全等、**两次同场景运行逐字节相同**（无时序抖动） | — |

**★「被观测对象必须按源标识命名」的落地要求（step 6 的教训）**：装置的 oplog/插桩表**不得**用注册序号（`hook[0]`/`_cache[3]`/`watch#1`）作键，必须用**源标识**：`request.get:<url>` · `matchMedia:<query>` · `addEventListener:<type>` · `removeEventListener:<type>` · `confirm:<title>` · `CodeEditor.format:<sqId>` · `message.warn:<text>`。理由：按序号命名时**换序也会通过**（序号恒定），等于判据失能。

**变异反证（至少 4 条，C 自建）**：① 在 U6 里**再造一个 `editorRefs = {}`** ⇒ T8 必须失败（`format()` = 0）；② 把 U7 的 `onPageMounted` 里的 `fetch()` 挪到 `matchMedia` 之后 ⇒ **T4 必须失败**；③ 在 U2 里把 `isPracticeMode` 改成读 `data.value?.mode`（错路径）⇒ **T3 必须失败**；④ 把 `onUnmounted` 的 `matchMedia` 清理删掉 ⇒ **T5 必须失败**（净增 +1）。**惰性对照**：不做任何变异时，两次运行 0 差异。

### 4.6 ⑥ 门禁覆盖缺口与替代判据（**本文件所在 client 步的必要补位**）

**★实测缺口（本轮逐个跑出来的）**：

| 门禁 | 默认扫描面（实测） | 对 client 步的含义 | **替代判据（本方案指定）** |
|---|---|---|---|
| `cycle-check.mjs` | `--root` **默认 `server/src`**（96 文件 / 214 边 / SCC 0） | ❌ **空转** | ★**它本就支持 `--root`（:26-28）** ⇒ 加跑 **`node scripts/gates/cycle-check.mjs --root client/src`**（本轮实测：92 文件 / 234 边 / **SCC 0 / 自环 0**）；**本步预期：99 文件 / ≈243 边 / SCC 0**（新增边 = `.vue→U7` 1 + `U7→U1..U6 + useConfirm` 7 + `U3→U1` 1 = **9**） |
| `bind-check.mjs` | `DEFAULT_ROOTS = ['server/src','server/test']`，只收 `.js/.mjs/.cjs`（**不收 `.vue`**） | ❌ **空转** | ★**传根即可**：`node scripts/gates/bind-check.mjs client/src`（本轮实测：52 模块 / 77 具名绑定 / **0 违规** / 1 external=`main.js → ./App.vue`）；**本步预期：59 模块 / ≈90 绑定 / 0 违规**。★**残余缺口**：它**不收 `.vue`** ⇒ **`.vue → useReviewPage.js` 这条边不被它检查** ⇒ 由 ④（script 段扫描解析 import 绑定）+ **L1-b** + ⑤ **T1** 兜住 |
| `hard-metrics.mjs` | `client/src/style.css` + `client/src/**/*.vue`（实测 41 样本，去块注释） | 新 `.js` **不在面内**；style 块一字节不动 ⇒ **0/0/0 必然逐字不变** | ★**当"B 是否越界"的哨兵**：该数**变了就说明动了模板/样式或其它 .vue** |
| `arch-metrics.mjs` | `server/src` + `client/src`（`.js/.mjs/.cjs/.ts/.vue` 全收） | 新文件**计入** >500 观察带（但均 <110 行 ⇒ 不新增成员） | 预期：`layerViolations` **0**、`unmigrated` **44（持平）**、`godfileOver800` **4 → 3**、`over500` **14 → 14**（**不变**，§2.2） |
| **axe** | 全仓缺失 + 禁联网 | ❌ 不可用 | `page.accessibility.snapshot()` **逐节点对拍**（模板字节不动 ⇒ a11y 树必须相等，**比 axe 更强**）；若 Captain 未拍板 ⇒ **显式登记「axe 未执行」并接受盲区** |

**★追加的两项 client 侧自建判据（沿用 step 6 ★V6b，实测基线已备）**：

1. **`_ctx` 未解析名检查**（对全部 `.vue` 跑 `compileTemplate` 并统计 `_ctx.` 的**名字集合**）：本轮实测 **40 个 .vue 中 10 个有命中**，**全部合法**：`$slots`×3（FormPage/ListPage/PageShell）· `$emit`+slot 变量（HealthReportTable）· **`$router`×6**（Submit/ProjectReviewNew/Review/ReviewClass/**ReviewDetail**/Teams）。⇒ **ReviewDetail 改前/改后都必须是「1 次、唯一名 `$router`」**；出现第 2 个名字 = 有名字掉出 setup 作用域（**响亮**）。
2. **client ESM 绑定自检**：`bind-check client/src`（官方脚本，覆盖 `.js`）+ 对 7 个新模块做一次「**export 面 ⊇ 被 import 面**」的人工对拍（`export function X` / `export const X` / `export default`）。★`node --check` **不得**作为任何"通过"的证据（constraints §3-12 实测：它在无 `type:module` 的目录下对语法坏文件也返回 0）。

### 4.7 像素门禁在本步的地位（**必须写进 C 的验证边界**）

★**本步属 A 档（只抽 script），像素门禁不需要、也不应作为判据** —— 模板+样式**逐字节相等**在逻辑上**严格强于**像素相等；此时像素相等是"必然"而非"证据"。理由（本文件具体三条）：① §2.2 的 7 个目标文件**全部只接收/返回 JS 值与对象引用**，无一处触及 `<template>` 或 `<style>`；② §1.4 的 54 个模板可见名全部通过「顶层解构」还原，模板表达式一个字符不改（L1-a 机器证明）；③ 本文件**没有** `Doc.vue` 那种"必须拆子组件"的场景。

⚠️ **升级条件（必须明说）**：**若 B 发现"不得不动 `<template>` 或 `<style>`（哪怕只加一个注释、只改一个 `v-if` 条件）"→ 本步立即从 A 档升级为 B 档**。届时：**当前门禁跑不了** —— 实测 `scripts/gates/pixel-diff.mjs:114-118` 的 `FIXTURES` **只有 3 条 teacher 端点**（`pending-summary`/`classes`/`teams`），**没有 `/api/teacher/submissions/:id`**；默认区域表（:121-140）**只走 `/exam/teacher/classes`** ⇒ 任何未命中夹具的 `/api/**` 请求返回 500 ⇒ **门禁 exit 2（无法判定，不是 PASS）**。补夹具 = 改 `scripts/gates/`，**不属 B/C 授权面**，须 Captain 决策。

★**G-A（每个 client 步都要写）**：本仓存在第二个 worktree `…/Exam-DeepSeek-ui`；`tests/ui-redesign-verify/rig.sh:9` 的 `CLIENT_DIR` **默认指向它** ⇒ 任何 L2/真后端验证**必须显式** `CLIENT_DIR="/Users/you/My Projects/My Vue/Exam-DeepSeek/client"`，否则**测的是另一棵树**。**被验树必须留痕**：绝对路径 + HEAD + `wc -l` + `shasum -a 256`。

---

## 5 风险分级（每个搬移单元）

维度权重：**响应式耦合 / 生命周期 / 测试覆盖 / 交互复杂度**；★本表第五维 = **形态影响面**（本文件独有：**轴 1 由后端数据驱动**）。

| # | 单元 | 等级 | 理由（全部基于本轮实测） |
|---|---|---|---|
| R1 | **U1 `reviewPure.js`**（9 声明 / ≈60 行） | **低** | 响应式耦合 **0**（9 个全是纯函数，只读入参）；生命周期 **0**；**可被 L0 逐字节判等完全覆盖**；★唯一注意：**`getItemKey` 是死代码但不得删**（K1）；它被 U3 import（1 条内部边）⇒ 导出名必须真存在（constraints §3-12） |
| R2 | ★**U2 `useReviewData.js`**（21 声明 / ≈105 行） | ★**高（本步第一硬失败点）** | ① 它是**模式真值源**（`data`/`isPracticeMode`，§1.5-A1）；② **`fetch` 是全场唯一加载函数且与浏览器全局同名** ⇒ ④ **全盲**（§4.4-B-1）；③ `q`/`subQuestions`/`subMap`/`reviewScores`/`reviewFeedbacks` 被 **U3/U4/U5/U6 共 4 个单元**读写；④ 写入面含 `??`/`\|\|` 兜底语义（:609/:610）；⑤ **`safeMaterial` 的 DOMPurify 调用无 options 参数**（K9）。测试覆盖仅有 1 条客观题 E2E（`e2e-03:44-58`） |
| R3 | **U3 `useReviewNav.js`**（9 声明 / ≈60 行） | **中** | `collapsedSqs` 是 **`reactive(new Set())`**（Set 代理语义，模板 :26/:31/:37 直接读）；`contentRef` 是**死读 string ref**（U6）；`getNavLabel` 依赖 `q.value.objectiveSettings.classificationMode`（跨单元读）；`sqBoxClass` 读 `activeAnchor`（同单元）；**唯一 import U1 的单元** |
| R4 | **U4 `useObjectiveCompare.js`**（7 声明 / ≈90 行） | **中高（客观题专属 = 有形态盲区）** | 响应式耦合 中（读 `subQuestions`/`getSub`）；**测试覆盖**：★**`e2e-03:44-58` 走的正是客观题作业** ⇒ **本单元是全场唯一有真实 E2E 覆盖的**（但只覆盖到达与渲染，无逐项断言）；`isItemCorrect` 4 题型 + `getItemStudentStr`/`getItemRefStr` 各 3 题型分支；**轴 2 的 code 形态下完全不可达** |
| R5 | **U5 `useReviewAiPrompt.js`**（5 声明 / ≈40 行） | **低** | 4 个 ref + 1 个 async 请求（`GET /teacher/submissions/:id/prompt`）；无 watch/无 hook；唯一注意：`promptSubTitle` 的拼接 `(sq.title \|\| '') + '（' + sub.id + '）'` 含**全角括号**，逐字保留 |
| R6 | ★**U6 `useReviewActions.js`**（7 声明 / ≈100 行） | ★**高（第二硬失败点）** | ① **`editorRefs` 是本文件唯一的非响应式外部实例容器**（§1.3-5）⇒ 复制成两份 = `formatCode` **静默 no-op**；② `reviewAll` 用 **`Promise.allSettled`** 做多请求并行 + 成功/失败文案分流；③ `publishAll` 的 `confirm` **options 是用户可见契约**（title/content/okText/cancelText/danger:true）+ `onOk` 内 3 个状态写入；④ `regrade` 混合写 4 个 reactive + 请求；⑤ `readOnly` 静态属性**不得改成绑定**（K13） |
| R7 | ★**U7 `useReviewPage.js` + .vue 接线**（7 声明 + 2 hook 体 / ≈85 行） | ★**高（唯一硬失败点）** | ① ★**54 个模板可见名必须一个不漏地出现在 .vue 顶层解构里** —— 少一个 → 渲染期报 `Property "x" was accessed during render but is not defined`（**响亮**），或对 `contentRef` **静默失绑**（U6）；② **`shellMq`/`onShellMq` 必须与两个 hook 体同单元**（监听器注册/清理必须闭包配对）；③ **两个 hook 调用只能在这里（.vue）各注册一次**，且**不得改 hook 类型/不得加条件**；④ `route.params.id` 的读取位置（`fetch` 内）**逐字保留**；⑤ ★**不得新增 `useRouter()`**；⑥ 它是唯一 import 全部 U1–U6 的模块，**任何参数注入写错都在这里暴露**。**建议：B 完成后立刻跑一次 §4.3 的 L1**（一条命令即可确认 54 名全在 + 迁移表干净） |
| R8 | **删除 .vue 的 script 内联实现** | **高** | 一步同时影响：模板 54 名、31 个函数、2 个 hook、`route`/`confirm` 与 8 个 import 的归属。**回滚粒度必须 = 单提交**，且**必须最后做**（§6 顺序） |
| R9 | ★**GodFile 4 → 3 / 观察带 14 → 14** | **低（但必须如实登记）** | `arch-metrics.mjs:27` 的 `godfileOver800: 4` 须在提交后刷为 **3**。★★**`over500` 不可能下降**：模板 236 + 样式 359 = **595 行不可触碰** ⇒ 改后 .vue ≈617–625 **仍在 >500 带内** ⇒ **14 → 14**。7 个新文件 ≈40–105 行，**均 <500**（不新增观察带成员）。**不得照抄本方案的估算值** —— 以提交后 `arch-metrics` 实跑为准 |

**顺序建议（给 B）**：U1 → U2 → U3 → U4 → U5 → **U6 + U7 + 接线（最后删内联）**。

---

## 6 ★分批建议（**每批可独立提交并各自过 5 条判据**）

**为什么必须分批**：一次性抽 7 个文件 = 一次性改动 391 行 script 里的 ≈363 行 + **54 个模板名的解析面** + 2 个 hook；任何一处出错都**无法定位是哪一批的哪一行**，而 5 条判据全是**整页级**的。分批让「改前 vs 改后」的对照**始终是上一批的绿状态**。

★**分批的红线（与 step 6 不同）**：本文件**无 watch** ⇒ **没有注册序约束**；取而代之的红线是 **① 两个 hook 的注册位置始终在 .vue（不随批次移动）；② `editorRefs` 在 B1–B3 期间仍留在 .vue（不得中途"借放"到别处）；③ 每批都必须保持 54 名模板可见面不变**。

| 批 | 内容 | 搬移行数 | script 行数变化 | 新增文件 | 本批的响应式/生命周期位置变化 | 本批必须额外做的验证 |
|---|---|---|---|---|---|---|
| **B1** | **纯叶子**：新建 **U1** `reviewPure.js`；.vue 里 `import { … } from '../../composables/review/reviewPure.js'`，删除 9 个声明所在行 | ≈40 | 391 → **≈350** | 1 | **零**（无 ref/computed/hook/watch/计时器） | L0（2 段 + 9 块子串命中）+ L1（54 名集合不变）+ ④（正控 4/4 必中）+ `bind-check client/src`（**新模块的导出面必须真存在**） |
| **B2** | **数据基座**：新建 **U2** `useReviewData.js`（含 **`pageStatus` 从 S0 搬来、`fetch` 从 S7 搬来**）；.vue 顶层 `const { … } = useReviewData({ route });`（**`route` 仍留在 .vue，作为参数传入** —— 不得让 U2 自己 `useRoute()`） | ≈65 | ≈350 → **≈285** | 1 | 19 ref + 4 reactive + 5 computed 迁出 .vue；**2 个 hook 仍留在 .vue**（`onMounted` 内改调解构来的 `fetch()`，语句序不变） | L0+L1+④ + ⑤ **T4**（副作用序）+ **T9**（请求数=1 + 逐字段）+ **T2**（类型事实） |
| **B3** | **展示与派生**：新建 **U3** `useReviewNav.js` + **U4** `useObjectiveCompare.js` + **U5** `useReviewAiPrompt.js`（**三者互不依赖，可同批**；调用序 U3→U4→U5 无约束） | ≈139 | ≈285 → **≈150** | 3 | 3 个新单元各含 computed/ref；**仍无 watch/hook** | L0+L1+④ + ⑤ **T3**（四形态）+ **T11**（状态族 6 组）+ **T12**（守卫/请求分流）+ **T10**（reactive 单实例） |
| **B4** | ★**动作 + 接线根 + 收尾**：新建 **U6** `useReviewActions.js` + **U7** `useReviewPage.js`；.vue 只留 **5 行 import + 一次解构 + 2 行 hook 注册**；**平移两个 hook 回调体**；**最后**删除全部内联实现 | ≈95 | ≈150 → **≈25–30**；**文件 988 → ≈617–625** | 2 | hook 的**注册语句**仍在 .vue，**回调体**搬入 U7；`shellMq`/`onShellMq`/`editorRefs` 各**唯一** | L0（2 段）+ L1（**5 条全绿**）+ ④ + **⑤ 全套 T1–T14** + 4 条变异反证 + **⑥ 三项替代判据**（`cycle-check --root client/src` / `bind-check client/src` / `_ctx` 全量扫描）+ `arch-metrics`（**GodFile 4 → 3**）+ 刷新基线 |

**每批的完成判据（与 DoD §5 对齐，缺一不可）**：
1. `node scripts/gates/arch-metrics.mjs` → **PASS**（`unmigrated` 应**持平 44** —— 本步只增 `client/src/composables/review/*.js`，不进 server 四层口径；GodFile 在 **B4** 才下降 4→3）
2. `node scripts/gates/cycle-check.mjs` → **SCC 仍为 0**（默认面）★**并加跑** `--root client/src`（§4.6）
3. `node scripts/gates/hard-metrics.mjs` → PASS **0/0/0**（扫描面 = `client/src/style.css` + `client/src/**/*.vue` ⇒ **新 .js 不在面内**，本步该数应**逐字不变**；style 块一字符不动 ⟹ 必然不变）
4. `node scripts/gates/bind-check.mjs` → 违规 0；★**并加跑** `node scripts/gates/bind-check.mjs client/src`（默认根不含 client，见 §4.6）
5. 全量后端测试：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → **4 处 `Test Suites:` 摘要、0 failed**（本步**不动 server** → 应逐字不变 → **零成本高价值哨兵：若它变了，说明 B 越界了**）。⚠️ 遇 tree-sitter 同进程假红（constraints **第 18 条**：形式为 11 或 13 条、**随调度漂移**、报 `syntax.js:49` 的 `TypeError`）⇒ **先隔离复跑**，判据以隔离进程为准，**不得据此改实现或改断言**
6. **client 追加**：**L0（2 段 + 逐声明子串命中）+ L1（5 条）+ ④（0 违规 + 正控 4/4）+ ⑤（按批的 T 项）+ L2（按批，可选）**；**像素门禁不需要**（A 档，§4.7）；a11y 用 `page.accessibility.snapshot()` 逐节点对拍替代 axe
7. **每批一个提交**，消息含「拆分前 file:line 范围 + 目标 composable + 验证结果 + `wc -l` 实测」

**若只能做一步**：做 **B1**（风险最低、收益可验证 —— script −40 行，且**建立了 L0/L1/④ 三条判据的可复用脚本**，后续每批复用）。**B4 是本步「不可逆感」最强的一步**，务必在 B1–B3 的判据脚本稳定后再做。

---

## 7 给 Agent B 的逐条搬移指令

### 7.1 总则（不可协商）

1. **只允许新建 §2.2 的 7 个 `client/src/composables/review/*.js`** + 修改 **`client/src/views/teacher/ReviewDetail.vue` 的 `<script setup>` 段（238–628）**。**禁止**碰：`ReviewDetail.vue` 的 `<template>`(1–236) 与 `<style scoped>`(630–988)、任何其它 `.vue`（尤其 `Review.vue`/`ReviewClass.vue`/`ProjectReviewNew.vue`/`components/CodeEditor.vue`/`components/StatusTag.vue`）、`client/src/composables/` 下的**既有 37 个文件**（**不要顺手改用 `useConfirm.js` 之外的任何既有 composable**）、`client/src/style.css`、`client/src/router/`、`client/src/api/request.js`、`scripts/gates/*`、`server/**`、`tests/**`、`client/package.json`。
2. **搬移 = 按 §2.2 的行号区间整块剪切**（含紧邻 JSDoc 与行内注释），**区间内一个字符都不许改**（含中文标点、**全角括号**、`：`、`——`、以及注释里的 `T4-F2`/`B3-1` 等编号与比例数字）。
3. ★**绝对不能在搬移中顺手修这 14 处**（§7.3，各自登记为**后续独立项**）。
4. **所有权唯一**：`data/studentName/studentNo/schoolName/q/subQuestions/showMaterial/subMap/reviewScores/reviewFeedbacks/regrading/reviewingAll/publishingAll/pageStatus/materialText/safeMaterial/totalAiScore/isPracticeMode/displayStudentNo/getSub/fetch` 只在 **U2**；`contentRef/activeAnchor/collapsedSqs/toggleCollapse/getNavLabel/sqResultColor/sqBoxClass/scrollTo/activateAnchor` 只在 **U3**；`parsedAnswers/getStudentItem/isItemAnswered/isItemCorrect/getItemStudentStr/getItemRefStr/itemResultColor` 只在 **U4**；`prompt*`/`showPrompt` 只在 **U5**；`editorRefs/setEditorRef/formatCode/useAiFeedback/regrade/reviewAll/publishAll` 只在 **U6**；`route/confirm/narrow/panelOpen/collapsed/shellMq/onShellMq` 只在 **U7**；`reviewPure.js` 的 9 个纯函数只在 **U1**。**任何其它 composable 不得再 `ref()`/`reactive()`/`computed()` 同名对象**，一律以参数接收（ref/reactive 传引用即共享）。★**`.vue` 里不得出现任何 `ref(` / `reactive(` / `computed(` / `watch(`**（出现即等于造第二个真值源）。
5. **`useRoute()`/`useConfirm()` 只在 U7 各调一次**并把 `route`/`confirm` 向下注入。★**不得新增 `useRouter()`**（模板 :5 的 `$router` 是全局属性，不需要绑定）。
6. **`route.params.id` 的读取位置逐字保留**（本文件只有 :597 一处，**在 `fetch` 函数体内**）。**不得**提升为 setup 期常量、**不得**改成形参 `submissionId`。
7. **hook 集中在 .vue**：`onMounted(onPageMounted);` 与 `onUnmounted(onPageUnmounted);` **各出现一次**，**回调体逐字平移进 U7**（内层语句：`fetch();` → `shellMq = window.matchMedia('(max-width: 1199px)');` → `narrow.value = shellMq.matches;` → `if (shellMq.addEventListener) shellMq.addEventListener('change', onShellMq); else shellMq.addListener(onShellMq);` / `if (!shellMq) return;` → `if (shellMq.removeEventListener) … else shellMq.removeListener(onShellMq);`）。
8. **`.vue` 里不得出现 `export` / `defineEmits` / `defineExpose` / `defineProps`**（原文件也没有）。**2 个组件 import（`CodeEditor`/`StatusTag`）必须留在 .vue**。
9. ★**§7.2 的「模板零改动」检查点必须逐条执行并留痕**。
10. 每个新文件顶部加 **banner**（固定格式，便于 C 机械核对）：

~~~js
/**
 * <文件名> -- 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 <B1-B4>，源行 <起>-<止>）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有四条形态轴（practice/exam × code/objective × narrow × 数据状态族）；
 *      模式真值源唯一（U2 的 data/isPracticeMode），本文件不得自行创建第二份。
 */
~~~

### 7.2 ★「模板零改动」的具体检查点（**逐条可执行**）

| # | 检查点 | 命令 / 判据 | 通过条件 |
|---|---|---|---|
| **M1** | 模板块**逐字节**未动（**逐侧边界**） | §4.2 的 node 脚本（两侧各自取 `descriptor.template.loc`） | 两侧 template 切片 **byte-equal** |
| **M2** | style 块**逐字节**未动，且**仍只有 1 个** | §4.2 脚本的 `styles.length` + `scoped` + 两侧 style 切片 | byte-equal 且 `length===1` 且 `scoped===true` |
| **M3** | 模板**源文本**在编译器眼里未动 | §4.3 的 `sanity_template_source_byte_equal` | true |
| **M4** | 模板可见名**一个不漏**（**53 setup 名**：51 点式 + **2 方括号式**） | §4.3 的 `setup_names_missing===[]` **且** `setup_names_added===[]` | 双侧 53 / 缺失 = [] / 新增 = [] |
| **M5** | 没有名字退化到 `_ctx`（**但基线是 1，不是 0**） | §4.3 的 `ctx_refs_after` | **=== `["$router"]`**（多一个名字即 FAIL） |
| **M6** | 模板静态 string ref 仍绑定 | `grep -c ' ref="' client/src/views/teacher/ReviewDetail.vue` = **1** 且名字仍是 `contentRef`；`grep -c ':ref="'` = **1** | **1 / 1** |
| **M7** | `.vue` 内无任何响应式原语、无 watch | 对 script 段按名计数 `ref(`/`reactive(`/`computed(`/`watch(` | **0 / 0 / 0 / 0** |
| **M8** | `.vue` 内 hook 各一次 | `grep -c 'onMounted('` / `onUnmounted(` / `onBeforeUnmount(` | **1 / 1 / 0** |
| **M9** | 无越界文件 | `git status --porcelain` 的**新增**项必须 ⊆ `client/src/composables/review/`（7 个），**修改**项 ⊆ {`client/src/views/teacher/ReviewDetail.vue`} | 无其它新增/修改 |
| **M10** | `v-model` 目标仍在原对象上 | `grep -c 'v-model:value="reviewScores\['` = 1、`reviewFeedbacks\[` = 1、`v-model:open="promptModalOpen"` = 1 | **1 / 1 / 1** |
| **M11** | 组件 import 仍在 `.vue` | `grep -c "components/CodeEditor.vue"` / `"components/StatusTag.vue"` | **1 / 1** |

### 7.3 ★「不许顺手修」清单（K 系列，**搬移中一律照旧**）

| # | 项 | 证据（实测） | 为什么不能修 |
|---|---|---|---|
| **K1** | **`getItemKey` :325 是死代码** | 全文件仅 1 处命中（定义处）；`client/src` 另有一个**同名不同源**的 `getItemKey` 在 `composables/submit/answerFormat.js:7` 被 `useAnswerState.js` 使用 —— **与本文件无关** | 删它属「行为面之外的改动」，且会破坏 L0 的 65 块闭合计数。⇒ **照旧搬进 U1 并导出** |
| **K2** | `fetch()` :616 **不 await、不 try/catch** | :596-613 无 try/catch | 请求失败 = **unhandled rejection**（改前即有）；加 try/catch = 改变行为 |
| **K3** | `onUnmounted` **不取消 in-flight 请求** | :623-627 无 AbortController | 卸载后仍可能写 ref；**加取消 = 改变行为** |
| **K4** | `setEditorRef` 的 `if (el)` 守卫 ⇒ `editorRefs` **永不删条目** | :518-520 | 陈旧实例累积 = 改前即有；**不得**加 `delete editorRefs[sqId]` |
| **K5** | `contentRef` :285 **死读**（模板绑定、脚本从不读） | 全文件 2 处命中（:56 / :285） | **保留声明与返回**（删了不报错，但属无谓改动） |
| **K6** | `matchMedia` 的 **`addListener`/`removeListener` 兼容分支** | :619-620 / :625-626 | **逐字保留**（不得"现代化"成只留 `addEventListener`） |
| **K7** | 同一 route record 下**参数变化不重跑 `fetch`** | 组件复用 + `onMounted` 只跑一次 | **不得**改成 `watch(() => route.params.id, fetch)`（那是功能变更） |
| **K8** | `onMounted` 内 **`fetch()` 必须先于 `matchMedia`** | :616 → :617 | 语句序**不得调换**（§3.1-4 的 T4） |
| **K9** | `DOMPurify.sanitize(...)` 调用**无 options 参数** | :444 / :445 | **不得**添加配置对象（`ALLOWED_TAGS` 等）；本文件**没有** `_sanHtml` 包装（与 step 6 不同） |
| **K10** | 用户可见文案是**契约** | `'总分 '`(:13) · `'AI 评分 '`(:14) · `'AI 总分 '`(:50) · `'未评分'`(:51) · `'全部 \${ok} 题审核已保存'`(:567) · `'\${ok} 题成功，\${fail} 题失败'`(:568) · `'无提交记录'`(:549/:574) · `'暂无 AI 评语'`(:528) · `'重新评分完成'`(:542)/`'重新评分失败'`(:543) · `'获取提示词失败：'`(:509) · `'全部已发布'`(:588)/`'发布失败'`(:589) · `'评分异常'`/`'已发布'`/`'已审核'`/`'AI已评分'`/`'待评分'`(:484-488) · `'无提交'`/`'已发布'`/`'已审核'`/`'待审核'`(:262-265) · `'（未作答）'`(:370) · `'正确'`/`'错误'`(:381/:397) · `'✓ 正确'`/`'✗ 错误'`/`'（未作答）'`(:123/:125) | **逐字不动**（含 :79 的 `.replace('第'+(i+1)+'小题 ', '')` 的**尾随空格**） |
| **K11** | `T4-F2` 注释块与映射表内容 | :315-317、:479-480（脚本）；:77、:8-9（模板） | 注释里的**对比度比例数字**是审查依据 ⇒ 逐字保留（模板侧更是一行不动） |
| **K12** | `sq.type === 'code' \|\| !sq.type` 三处口径 | :31 / :92 / :179 | **不得**改写成 `sq.type !== 'objective'`，**不得**引入 `'subjective'`（§1.5-A3） |
| **K13** | `readOnly` :103 是**静态裸属性** | :103 | **不得**改成 `:readOnly="…"` |
| **K14** | `isItemCorrect` 的 `multi_choice` **集合比较**与 `fill` 的**逐空小写比较** | :354-357 / :360-363 | 算法逐字保留（含 `sa[bi] \|\| ''` 的越界兜底） |

### 7.4 禁令（违反即回流）

- ❌ 把状态藏进嵌套对象（模板要写 `p.q`）→ **等于改模板**。
- ❌ 在 composable 里用 `defineProps`/`defineEmits` 等 `<script setup>` 宏。
- ❌ 让两个 composable 互相 `import` 来"解决"依赖（**必须参数注入**）。
- ❌ 引入任何 `watch`/`watchEffect`/`nextTick`（改前**一个都没有**）。
- ❌ 改 `route.params.id` 的读取位置、改 `onMounted` 内语句序、改 hook 类型。
- ❌ 为了让「行数更好看」而给 `.vue` 的解构**一行一个名字**；**每行 4–5 个名字**。
- ❌ 新增任何依赖（`package.json` 不动）；新增 `useRouter()`；给 `DOMPurify.sanitize` 加配置。
- ❌ 把 2 个组件 import 搬进 composable（会让 `$setup["CodeEditor"]` 的 binding 类型从 import 变为返回值 = 无谓偏离）。

---

## 8 给 Agent C 的验证清单

> 前提：**C 不吃 B 的自测**；所有判据**自建**（可复用 §4 的脚本，但必须自己跑出结论）。**必须自跑改前基线**（`git archive HEAD` → 仓库外）再比改后。

| # | 验证项 | 方法 | 通过判据 |
|---|---|---|---|
| **V1** | **版本锚点** | `git rev-parse HEAD` + `shasum -a 256` + `wc -l` | 改前 `d7595832…/988` 三值齐全；改后 .vue 行数与 B 报告一致 |
| **V2** | **L0 · 2 段字节切片（逐侧边界）** | §4.2 脚本 | 两侧 template/style **byte-equal**，`styles.length===1 && scoped===true`，**切片边界自证打印齐备** |
| **V3** | **L0 · 65 块逐声明子串命中** | 对改前 65 个顶层声明按 AST 区间切块 → `sha256` → 在「7 新文件 + 改后 .vue script」并集里断言**恰好 1 次** | 65/65 命中、重复 0、缺口 0；**逐条解释白名单差异**（banner/import/export/缩进/2 个 hook 平移） |
| **V4** | **L1 · 冻结元数据模板对拍（5 条）** | §4.3 脚本 | 退出码 **0**；★**额外报告** `template_compile_own_byte_equal` 的值与差异归类（**必须落进 §4.3 的表**；出现「行为差异」类 → **判 FAIL**） |
| **V5** | **L1 · 53 名 + 1 string ref + `_ctx` 基线** | 独立 `grep -n ' ref="'` / `':ref="'` + §4.3 的名字集合（**点式 + 方括号式**） | 53 名全在且无新增；string ref 仍为 `contentRef`（1 处）；`ctx_refs_after === ["$router"]` |
| **V6** | **④ 自由标识符扫描（含正控）** | §4.4 脚本；**必须用 `scope.crawl()` 或两遍实现** | 7 个新文件 + .vue script 段 **全 0**；★**正控 4/4 必须命中**（删 DOMPurify import → 2；改名 `getSub` → 3；去 `route` 注入 → 1；去 `confirm` 注入 → 1）—— **只报 0 不算通过** |
| **V7** | ★**⑤ 真运行时对拍（无 DOM 装置）** | §4.5 装置 A | **T1–T13 逐条与改前相同**；★**T4 的副作用序、T5 的清理序与净增 0、T8 的 `format()` 计数、T9 的请求数与逐字段、T10 的 reactive 单实例** 必须逐字相符；★**oplog 必须按源标识命名**（按序号命名 = 判据失能，须拒绝） |
| **V8** | ★**变异反证（≥4 条）** | 自建变异副本（仓库外）：① U6 再造 `editorRefs`；② `fetch()` 挪到 `matchMedia` 之后；③ `isPracticeMode` 读错路径；④ 删 `matchMedia` 清理 | **4/4 必须被对应 T 项抓住**；**惰性对照**（不变异）两次运行 **0 差异** |
| **V9** | **⑤ 装置自证** | `client/dist` 指纹/`find -newermt` + 仓库内 `git status` + 模块副本 `cmp` + **两次同场景运行逐字节相同** | 四项全过（否则**拒绝判 PASS**） |
| **V10** | **⑥ 门禁覆盖缺口补位（三项）** | ① `node scripts/gates/cycle-check.mjs --root client/src`；② `node scripts/gates/bind-check.mjs client/src`；③ 全量 `.vue` 的 `_ctx` 名集合扫描 | ① 99 文件 / ≈243 边 / **SCC 0 / 自环 0**；② 59 模块 / ≈90 绑定 / **0 违规**；③ **ReviewDetail = 1 次且唯一名 `$router`**，其余文件与改前一致（10 个有命中，全合法） |
| **V11** | **四门禁 + 全量后端** | `arch-metrics` / `cycle-check`（默认 + client）/ `hard-metrics` / `bind-check` / `ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` | arch：`unmigrated` **持平 44**、`layerViolations` 0、**GodFile 4 → 3**、`over500` **实测值如实记录（预期 14，不得写成 13）**；cycle：默认 + client **SCC = 0**；hard：**0/0/0**；bind：**0 违规**（并如实登记「默认面不含 client」这一边界）；测试：**4 处 `Test Suites:` 摘要 + 0 failed**（**不得拿旧数字当判据**，constraints §4；遇 tree-sitter 假红按第 18 条隔离复跑） |
| **V12** | **既有缺陷未被放大（不是修它）** | ① `fetch` 失败 = unhandled rejection（K2）；② 卸载后 in-flight 写 ref（K3）；③ `editorRefs` 不删条目（K4）；④ `getItemKey` 仍在（K1）；⑤ `addListener` 兼容分支仍在（K6） | 五项**与改前同形**（「照旧存在」= 通过；「消失了」或「变多了」都要报告） |
| **V13** | **基线刷新与留痕** | `arch-metrics.mjs:27` 的基线注释 + 被测源码树的**绝对路径 + HEAD + `wc -l` + `shasum`** | 记录「GodFile 4→3」；★**被验树必须是主仓库 client**（G-A：`tests/ui-redesign-verify/rig.sh:9` 默认指向 `Exam-DeepSeek-ui`） |
| **V14** | **L2 · 既有 E2E 复跑（需 Captain 授权）** | `CLIENT_DIR="<主仓>/client" RIG_PORT=3100` 跑 `e2e-03-teacher-review.spec.mjs` 的 **T3-03-1**（+ `visual-regression` 的 `teacher-review-detail-dark` 区域） | 断言与改前相同（`.rp-page` 可见、`.rp-top` 含姓名与「总分」、**控制台意外错误 = []**）。⚠️ 需真后端 + 真库 + `tests/` 装置 ⇒ **A 只读未运行**；若 Captain 不授权 ⇒ **显式登记「L2 未执行」并接受盲区** |

**C 必须额外报告的三件事**：① **`template_compile_own_byte_equal` 为 false 时**差异的逐行归类（同类 / 行为差异）；② **`wc -l` 的 .vue 最终行数**与 `arch-metrics` 的 `over500` 实测值（**决定观察带是否变化 —— 本方案预判「不变」，与此不符必须报告**）；③ **54 个模板可见名在 `.vue` 解构里的逐名落点**（给出「名字 → 所在行」的表，证明 52 个声明名一个不漏）。

---

## 9 局限声明

1. **本方案的行号/计数全部取自锚点 `aa29505` 的实测**；任何后续提交都会使其失效 → **引用前必须重新 `git rev-parse HEAD` 并复测**（constraints §3-10）。
2. **§2.2 的行数估算（≈540 行新代码 / .vue ≈617–625）是估算，不是实测**：尤其 `.vue` 最终行数取决于 B 的解构格式（52 名每行 4–5 个 ≈ 11–14 行）。**唯一可承诺的判据收益是 `godfileOver800` 4 → 3**；**`over500` 我判为「14 → 14 不变」**（模板 236 + 样式 359 = 595 行不可触碰），但**以提交后 `arch-metrics` 实跑为准**。
3. **U1–U8 八条「需实测」本节无法收敛**：它们是**四形态求值 / 资源生命周期 / 函数 ref 真绑定 / 数据驱动状态族 / reactive 单实例**，静态阅读**原则上不可判**。我给出了最小探针与期望值，但**判定权在 Captain 与 C**。
4. **⑤ 的装置我只做了「可行性核查」，没有实际搭建**（A 属只读）：`jsdom 不存在`、`playwright/test` 与浏览器已装、编译器/`babel/traverse` 可用（且 traverse **只在 `client/` 下**可用），这几条是**实测**；**装置能否在 1–2 h 内跑通，是 step 5/6 的经验外推，不是本轮的实测**。
5. **判据④ 的边界只测到 3 类**（浏览器同名全局 `fetch` / 31 个「模板专属」名 / DoD 已登记的「形参存在但未传」）；**其它形态（`with`、`eval`、装饰器、`export * from`、宏）未覆盖**。`bind-check.mjs` 的已知边界（星号再导出 / CJS / 动态 import 一律跳过、**不收 `.vue`**）同样适用。
6. **全 client 的 ④ 扫描有 16 个白名单缺口**（`defineProps`/`defineEmits`/`defineExpose`/`Node`/`Function`/`CSS`/`getComputedStyle`/`requestAnimationFrame`/`cancelAnimationFrame`）—— 我已实测并列出文件清单；**这些不是缺陷**，但若 C 扩面扫描必须先补白名单（step 6 D-L5 同类）。
7. **`axe` 我按「不可用」处理**（沿用 step 5 实测 + 禁联网），**本轮未复测**；若 Captain 认为需复测，请单独派单。替代口径 = `page.accessibility.snapshot()` 逐节点对拍。
8. **§1.5 形态路径表的「可达性」是静态结论**：我逐条核对了模板 `v-if/v-else`、`router/index.js:37`、`ReviewClass.vue:127-133` 与 `reviewController.js:223/331/387` 的 mode 语义，**但「某个分支在运行期是否真被触发」未做运行时验证**（这正是 U1 的内容）。
9. **方案未审计**：`components/CodeEditor.vue`/`StatusTag.vue`/`composables/useConfirm.js`/`api/request.js`/`router/index.js` 与**既有 37 个 composable** 的内部实现（只在「对本步的影响面」范围内读了必要片段）；**它们的内部改动不在本步授权内**。
10. **`docs/split/status.md` 的锚点/基线可能滞后**（step 5/6 各发生过一次）：**任何判据必须以 `scripts/gates/arch-metrics.mjs:27` 的代码基线 + 实跑为准**，不得照抄 status.md 或本方案的数字。
11. **★对 step 6 范本的两处「判据装置缺陷」我做了复核与修正**（① L0 的**改后固定行号**会让 `cmp` 在空切片上"通过"；② L1 的 `ctx_refs===0` 与迁移谓词在本文件会**把正确重构判 FAIL**）—— 修正均已写进 §4.2/§4.3。但**我没有重跑 step 6 的验证**，故：**这些修正是否也适用于 step 5/step 2 的既有 verify 报告，我未审计**。
12. **★本文件与 step 6 的两处结构性差异会影响方法论迁移**：① **0 个 watch**（step 6 的核心风险面在本步不存在，取而代之的是「无 watch 也不得引入 watch」）；② **有真实 E2E 覆盖**（`e2e-03:44-58`）—— 但它**需要真后端/真库**，A 只读无法执行，**是否启用属 Captain 决策**（V14）。
