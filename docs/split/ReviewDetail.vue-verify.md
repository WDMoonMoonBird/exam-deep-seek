# ReviewDetail.vue 拆分验证报告（step 7 · C 侧独立验证）

- **step**: 7 ｜ **agent**: C（独立验证者 / 对抗性）｜ **日期**: 2026-10-11
- **对象**: `client/src/views/teacher/ReviewDetail.vue`（988 → 620 行）+ 新建 7 个 composable（`client/src/composables/review/`）
- **立场**: **不采信 B 的自测**。装置全部自建（`/tmp/c7/`，**未复用 `/tmp/rd7` 任何脚本**）；判据先自建**正控/负控/变异**再报结论；对每条「通过」都给出**它会失败**的证据。
- **技能**: `tech-test-automation`（已加载）
- **依据**: `docs/split/ReviewDetail.vue-plan.md`（A，685 行）· `docs/split/ReviewDetail.vue-refactor.md`（B）· `docs/plan/2026-10-11-godfile-split-plan.md` §5（client A 档 **5 条判据 + 两道 lint 判据**）· `docs/pipeline/project-constraints.md`（**18 条**）

## 0 被测树留痕 / 工作树状态 / 方法

| 项 | 实测值 |
|---|---|
| 被测源码树（绝对路径） | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**，非 `../Exam-DeepSeek-ui` —— G-A 满足） |
| `git rev-parse HEAD` | **`d20ab83dafc9f8c89e749202db3ffc051947bf7e`** ★**与 B 报的 `aa295058` 不同**：B 执行期间其后落了 2 个**与 client 无关**的 lint 提交（`1a31163` ESLint 接入 · `d20ab83` `lint-check.mjs`）；`git diff --name-only aa29505..HEAD` = 8 个文件，**全部在 `docs/`、`scripts/gates/`、`eslint.config.mjs`、`package*.json`**，**不含 `client/**`** |
| 改前锚点（`git show HEAD:…`） | `d7595832cd9c482b4d0a1629ba9bfa01672f320a0ad46bf76363bcb1d15d17c9` / **988 行** → **B 未提交该文件，HEAD 版仍是改前内容 ⇒ 锚点等价、对照有效** |
| `ReviewDetail.vue` 改后（工作树） | `f1cf9eeb7fb35835099ec5f3ab6fac7fe29db9e693c24fdf19adc39ba813f66a` / **620 行** |
| 7 个新模块 sha256 | `reviewPure f5a917e415c6b886` / `useReviewData 63b765b50a0a0054` / `useReviewNav e7926c0cfbeda18d` / `useObjectiveCompare 3683b3cafe5f5b39` / `useReviewAiPrompt 3ea972213e973e2b` / `useReviewActions 170e6867550b75da` / `useReviewPage ec3fd6baa9b54e72`（**与 B 报告逐字相同**） |
| 行数实测 | 620 / 59 · 98 · 75 · 100 · 41 · 101 · 84（= B 报告；`wc -l` 实测） |
| 改动面（`git status --porcelain`） | `M client/src/views/teacher/ReviewDetail.vue` + `?? client/src/composables/review/`（7 文件）；其余 M 项（`docs/plan/…`、`docs/split/status.md`）**在我开始前即已存在**；**C 只新增 `docs/split/ReviewDetail.vue-verify.md` 与 `docs/split/test-round-15.log`** |
| `client/dist` | `index.html` mtime **仍为 `2026-10-10 21:55:33`**；`find client/dist -newermt "2026-10-11 12:00"` = **0 项** ⇒ **未重建** |
| 工具链 | node v24.19.0 · `vue/compiler-sfc 3.5.34` · `vue 3.5.34`（真 `createRenderer`）· `@babel/parser`+`traverse 7.29.8`（全部取自 `client/node_modules`，**全程未联网**） |
| 自建装置 | `/tmp/c7/`：`l0.mjs`（L0 逐侧切片）· `blocks.mjs`（65 块闭合）· `l1.mjs`（L1 冻结口径 + 迁移谓词真值表）· `free.mjs`+`free-run.mjs`+`free-ctl.mjs`（④ 扫描 + 正/负控）· `edges.mjs`/`edges2.mjs`（独立复算 client 边）· `rt/…`（⑤ 真运行时：镜像树 + 自写 nodeOps + 真 Vue + 7 场景 + 变异） |
| 硬约束遵守 | 只读测试（除本报告与回归日志）· 无任何 git 写操作 · 未碰 `client/dist`/`tests/`/`scripts/gates/`/生产库 · 未起任何服务（**无端口占用**）· 未联网 |

**方法（对抗优先）**：① 先自建**正控/负控/变异**证明装置真的会失败，再报「通过」；② B 报的每个数字**独立复算**，不一致就追根因；③ 判据的**配方缺陷**（A 的 `f===t` 漏项、step 6 的固定行号）单独做**真假判定实验**；④ 一切结论以**实测**为准（constraints §3-10）。

## 1 判据总表（先看结论）

| # | 判据 | 达标线 | 实测 | 判定 |
|---|---|---|---|---|
| **V1** | 锚点 | 改前 `d7595832…/988`、改后 `f1cf9eeb…/620` | 三值齐全（★HEAD 前移 2 个 client 无关提交，锚点等价） | ✅ |
| **V2** | L0 切片（**逐侧 descriptor**，切 2 段） | template/style 两侧 byte-equal；`styles.length=1`、`scoped=true` | template 1–236（12100 B / `ae9765b7…`）· style **630–988 → 262–620**（13959 B / `470d1e50…`）**全等**；**3/3 变异被抓**；固定行号配方会取到**空切片（1 字符）**⇒ 加非空守卫 | ✅ |
| **V2b** | 65 顶层声明块 | 各恰好命中 1 次、缺口 0、重复 0 | **blocks=65 hit1=65 dup=0 miss=0**；另 6 条 hook 内层语句在 U7 **各 1 次** | ✅ |
| **V3** | L1 冻结 bindingMetadata | 冻结口径逐字节等；53 名无缺无增；`_ctx==["$router"]`；`unref(=0`；styles 等；非法迁移 `[]` | **32258 字符全等（sha `6aab09dd…`）**；53/53；`missing=[] added=[]`；`_ctx=["$router"]`（**1，非 0**）；`unref=0`；own 口径 2 行差异且 **patchFlag 多重集逐项相同**（同类） | ✅ |
| **V3′** | ★A 的 L1-d 谓词 `f===t` | 修正正确且不放过真违规 | **原式恰好误判 4 个未变名**（CodeEditor/StatusTag/onMounted/onUnmounted，全 `setup-const→setup-const`）；补 `f===t` 后 `illegal=[]`；**真值表证明修正只新增「对角线」5 项、不移除任何一项**；**2 组真违规变异仍被抓**（见 §4） | ✅ 修正正确 |
| **V4** | ④ 自由标识符（`scope.crawl()`） | 8 对象 0 命中；正控须命中 | **8/8 = 0**；正控 **PC1=1 / PC2=1 / PC3=9 / PC4=1 / PC5(.vue)=1**；负控 **NC1=0 / NC2=0 / NC3=0**（★两条盲区属实，且我**新增 NC3**） | ✅ |
| **V5** | 构建 | exit 0；不重建 `client/dist` | `npx vite build --outDir /tmp/c7-build --emptyOutDir` → **exit 0（built in 22.18s）**；dist mtime 未变 | ✅ |
| **V6** | 六项门禁 + **两道 lint** | 见 §7 | arch **0/44/3/14** · cycle 默认 **96 文件/214 边/SCC 0** · **`--root client/src` 99 文件/244 边/SCC 0** · hard **0/0/0** · bind 默认 **194 模块/652 绑定/0 违规** · **`bind-check client/src` 59 模块/96 绑定/0 违规** · **ESLint exit 0 / error=0 / warn=59** · **`lint-check.mjs` exit 0 / 基线 31→31 / 新违规 0** | ✅ |
| **V7** | ⑤ 真运行时对拍（自建装置） | 逐事实与改前相同；变异必被抓；惰性对照 0 差异 | **7 场景 × 两侧：899 个字段 0 差异**（378/172/128/43/5/160/13）；**变异 M1/M2/M5 全部被抓**；**惰性对照：整套场景二次运行逐字节相同** | ✅ |
| **V8** | D1–D8 偏离裁定 + K1–K6 照旧 | 逐条判定 | D1–D11 均**成立/可接受**；★**D8 的 +1 已完整归因**（见我独立复算）；K1–K6 **全部照旧存在** | ✅ |
| **V9** | 全量后端回归 | 4 处 `Test Suites:` + failed=0 | `ROUND=15` exit 0：**4 处摘要**（65 / 1 / 1 / 1 套件）· **974+17+61+21 = 1073 passed / 0 failed** · 无 tree-sitter 假红 | ✅ |
| **结论** | — | — | **PASS（无需回流 B）** —— 见 §12 | ✅ |

## 2 V1/V2 · 锚点与 L0（★假通过防线）

### 2.1 V2 逐侧切片（自建 `/tmp/c7/l0.mjs`，两侧区间**各自**从 `descriptor` 取）

    before: template 1-236 | style 630-988 | styles=1 scoped=true | script 238-628 | 988 行 | 标签计数 style 1/1 · template 5/5
    after : template 1-236 | style 262-620 | styles=1 scoped=true | script 238-260 | 620 行 | 标签计数 style 1/1 · template 5/5
    template bytes=12100 sha256=ae9765b74ef1e28fb0e6903f40d37c3ebecfe91882197f55c093b998efe2f4ca  （两侧相同）
    style    bytes=13959 sha256=470d1e502105508973ba255c67f074f8de9d187ee6b9a8bc825305e5840d3208  （两侧相同）
    切片自证：首行 "<template>"/"<style scoped>"、末行 "</template>"/"</style>"（两侧）
    checks: styles_length_1_both=true · scoped_both=true · template/style bytes+sha+descriptor 内容 全等=true

⇒ **与 A 的方案基线、B 的报告三方逐字一致**（12100/13959、`ae9765b7…`/`470d1e50…`）。

### 2.2 ★假通过防线（step 6 的固定行号配方在本文件会怎样）

我**复现了错误配方**：把**改前**的 style 区间 `630–988` 直接套到**改后**（620 行）文件上 ⇒

    afterFixedStyleSliceChars = 1        ← 只剩一个尾换行
    afterFixedStyleSliceIsEmpty = true
    朴素 cmp（或「空切片就跳过」）会报 PASS  ← 这正是 DoD §5 点名的「假通过」形态

⇒ 我的实现**先断言切片非空且长度合理**（`slices_plausible = tpl>5000B && sty>5000B 两侧`），空切片一律**拒绝判过**；且两侧区间**只从各自 `descriptor` 取**（`d.template.loc` / `d.styles[0].loc`），**脚本内无任何写死行号**。

### 2.3 L0 也会「失败」（正控，3/3）

| 变异（改后副本，仓库外） | 期望 | 实测 |
|---|---|---|
| style 内改 1 字节（line 300 `color`→`colour`） | style 不等 | ✅ `style_bytes_equal=false`、`style_sha_equal=false`，**exit 1** |
| template 内改 1 字节（line 100 多加一个空格） | template 不等 | ✅ `template_bytes_equal=false`，**exit 1** |
| style 内删 1 行 | 块内容不等（行数变化） | ✅ `style_bytes_equal=false`，**exit 1** |

### 2.4 V2b · 65 个顶层声明块（自建 `/tmp/c7/blocks.mjs`，AST 区间 + 并集语料子串计数）

    before script 顶层语句 = 75 = 8 import + 65 声明 + 2 hook 语句（实测）
    blocks=65  hit1=65  dup=0  miss=0
    并集语料 = 7 个新模块全文 + 改后 .vue 的 scriptSetup.content（区间由 descriptor 取）
    hook 内层语句（6 条）在 U7 中各出现恰好 1 次（fetch(); / matchMedia / narrow.value / addEventListener 分支 / if(!shellMq) return; / removeEventListener 分支）
    ⇒ innerAllInU7 = true

⇒ **B 报的 65/65、缺口 0、重复 0 独立复现成立**；且我把「2 个 hook 回调体的内层语句」也逐条验证了（B 的覆盖核算说 4 行为结构性重定位，我实测内层 6 条语句逐字节在 U7）。

## 3 V3 · L1 冻结口径（逐字节、逐名、逐类型）

自建 `/tmp/c7/l1.mjs`（**两侧同 `id`**，`bindingMetadata` 走 **JSON 往返冻结的改前口径**）：

    sanity_template_source_byte_equal      = true
    template_compile_frozen_byte_equal     = true    （两侧 32258 字符，sha 6aab09dda14e75aa…）
    template_compile_own_byte_equal        = false   （仅诊断：2 行差异）
    patchFlag 多重集 两侧逐项相同 = true  {CACHED 23, STABLE 13, TEXT 21, PROPS 18, CLASS 6, KEYED_FRAGMENT 5,
                                          STABLE_FRAGMENT 4, DYNAMIC 3, DYNAMIC_SLOTS 1, NEED_PATCH 2}
    $setup 点式名 + $setup["…"] 方括号名 = 53 / 53 ；missing=[] added=[]
    _ctx 唯一名 = ["$router"]（★1，不是 0；改前同）· unref( = 0（两侧）
    styles_array_equal = true · styles_count = 1
    非法迁移（修正后谓词）= [] ；非法迁移（A 原式）= 4 项（见 §4）
    5 条判据（L1-a..e）全绿 ⇒ exit 0

**迁移表（冻结口径，全量；与 B 报逐项相同）**：

| 迁移 | 数量 | 名字 |
|---|---|---|
| `undefined → setup-maybe-ref` | 3 | onPageMounted, onPageUnmounted, useReviewPage |
| `setup-const → setup-const` | 4 | CodeEditor, StatusTag, onMounted, onUnmounted ★**未变** |
| `setup-const → setup-maybe-ref` | 27 | activateAnchor, formatCode, getItemRefStr, …（全为函数/纯叶子） |
| `setup-ref → setup-maybe-ref` | 21 | collapsed, contentRef, data, displayStudentNo, isPracticeMode, materialText, narrow, pageStatus, panelOpen, promptData, promptLoading, promptModalOpen, promptSubTitle, publishingAll, q, reviewingAll, safeMaterial, showMaterial, studentName, subQuestions, totalAiScore |
| `setup-reactive-const → setup-maybe-ref` | 4 | collapsedSqs, regrading, reviewFeedbacks, reviewScores |
| `setup-const → undefined` | 8 | computed, editorRefs, fetch, getItemKey, getStudentItem, onShellMq, reactive, ref |
| `setup-maybe-ref → undefined` | 7 | DOMPurify, confirm, message, request, route, useConfirm, useRoute |
| `setup-ref → undefined` | 5 | activeAnchor, parsedAnswers, schoolName, studentNo, subMap |
| `setup-let → undefined` | 1 | shellMq |

⇒ 全部落在允许方向（新名字 / 名字消失 / 退化为 `setup-maybe-ref`）。★**own 口径 2 行差异的归类**：`patchFlag` 多重集**逐项相同**（无跨类 flag、无片段类 flag、无 dynamicProps 增删）⇒ 属方案 §4.3 表的「同类（`_hoisted`/`_cache` 槽位与取值路径的等价重排）」，**不是行为差异** ⇒ 不判 FAIL。

## 4 ★V3′ · A 的 L1-d 谓词漏 `f===t`：独立判定

**B 的修正主张**：方案 §4.3 的 `allowed(f,t)` 漏了 `f===t`，会把 4 个**根本没变**的 `setup-const` 判成「非法迁移」= 把正确重构判 FAIL。

### 4.1 原式确实误判 4 个未变名（实测复现）

    illegal_originalPredicate = [
      "CodeEditor:  setup-const -> setup-const",
      "StatusTag:   setup-const -> setup-const",
      "onMounted:   setup-const -> setup-const",
      "onUnmounted: setup-const -> setup-const" ]
    illegal_correctedPredicate = []

⇒ **B 的判断正确**：这 4 个名字在改前后**类型完全相同**（`setup-const`），却因谓词缺对角线分支被误判。

### 4.2 修正**不会**放过真违规（真值表证明 + 变异反证）

真值表（遍历 7×7 类型对）：

    added   = [setup-const→setup-const, setup-let→setup-let, setup-ref→setup-ref,
               setup-reactive-const→setup-reactive-const, setup-unknown→setup-unknown]
    removed = []            ← 没有任何原本允许的方向被收紧
    all_added_are_diagonal = true

⇒ `f===t` 只新增**对角线**（类型未变），**不可能**掩盖任何「类型发生了改变」的迁移。

**2 组真违规变异（仓库外副本，改后树）——修正后的谓词仍然抓到**：

| 变异 | 期望 | 实测 |
|---|---|---|
| 改后 `.vue` 把 `q` 从解构里去掉并写 `const q = 1;`（真值退化为字面量） | L1-d 非空 | ✅ `q: setup-ref -> literal-const`；L1-d = **FAIL** |
| 同上对 `narrow`（`const narrow = false;`） | L1-d 非空 | ✅ `narrow: setup-ref -> literal-const`；L1-d = **FAIL** |
| 把解构里的 `getSub` 改名 `getSubRenamed`（模板名掉出 setup 面） | L1-b 报缺失 + `_ctx` 多一名 | ✅ `setup_names_missing=["getSub"]`、`setup_names_after=52`、`ctx_refs=["$router","getSub"]` ⇒ **两处同时报警** |

⇒ **裁定：B 的 `f===t` 修正是正确且必要的**（原式会把本步判 FAIL）；**且修正后判据仍然锋利**（真违规被 3 种形态抓到：类型降级 / 名字消失 / 名字掉进 `_ctx`）。

## 5 V4 · ④ 自由标识符扫描（`scope.crawl()` 两遍口径，自建）

实现：`@babel/parser`（`sourceType:'module'`）→ `traverse`（`Program(p){p.scope.crawl()}` + `ReferencedIdentifier`）→ 未绑定且不在**紧凑白名单**（不含任何业务名，含 `fetch`）⇒ 计命中。`.vue` 的 script 段区间**由 `descriptor.scriptSetup` 取**（不写死行号）。

    8 个对象（7 模块 + 改后 .vue script 段）  ⇒ 全部 0 命中（totalFree=0）

### 5.1 正控（**必须命中**，否则扫描器是死物）

| 正控 | 变异 | 期望 | 实测 |
|---|---|---|---|
| PC1 | U1 删 `import DOMPurify from 'dompurify'` | ≥1 | ✅ **1**：`["DOMPurify@30"]` |
| PC2 | U2 的 `function getSub(` 改名（保留 return 面） | ≥1 | ✅ **1**：`["getSub@94"]` |
| PC3 | U7 删 `./reviewPure.js` 具名 import（9 名） | 9 | ✅ **9**：`itemTypeLabel@77 … subStatusText@78` |
| PC4 | U3 删 `itemTypeLabel` import（★**我第一版正控写错**：单名 import 无逗号，替换未命中 ⇒ 报 0；改成整行删除后） | 1 | ✅ **1**：`["itemTypeLabel@31"]` |
| **PC5（我新增）** | 改后 `.vue` 删 `useReviewPage` import | ≥1 | ✅ **1**：`["useReviewPage@18"]` ⇒ **证明「.vue script 段」这一路扫描是活的**（不是空跑） |

### 5.2 ★负控（两条盲区属实性复核 + 我新增 1 条）

| 负控 | 变异 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| **NC1（B-1）** | U2 把 `async function fetch(` 改名，但 return 面仍写 `fetch`（于是指到**浏览器/node 全局 fetch**） | 0 | ✅ **0** | **盲区属实**。它不是「无后果」：运行期 `fetch` 变成全局函数 ⇒ **API 请求不再发出**（我的 ⑤ 装置 T9「`request.get` 恰好 1 次」会立刻红）⇒ **⑤ 是兜底** |
| **NC2（B-3）** | U7 调 `useReviewData({})`（**被调方声明了形参、调用方没传**） | 0 | ✅ **0** | **盲区属实**（DoD 已登记）。⑤ 实测：M5 变异 ⇒ 抛 `TypeError: Cannot read properties of undefined (reading 'params')`、场景崩、请求数为 0 |
| **NC3（我新增，同族）** | U7 调 `useReviewActions({ …, confirm })` 去掉 `confirm` | 0 | ✅ **0** | **同一盲区家族的第 3 个成员**（`publishAll` 会以 `undefined` 调用 confirm）⇒ 登记为**盲区清单第 3 项**，同由 ⑤ 兜（我未单独造其变异，属**未做项**，见 §11） |

### 5.3 全 client 面（补充）

    我口径：99 文件扫描 → 14 个有命中，全部是白名单缺口（defineProps/defineEmits/defineExpose 宏 ×11 文件、
             Node ×2、Function/CSS ×2），**均非本步引入**；7 个新模块 0 命中、ReviewDetail.vue 0 命中。
    ⚠️ 与 A 的「92 文件 / 16 有命中」不同：**文件遍历面与白名单宽度不同**（我白名单含 getComputedStyle/
       requestAnimationFrame 等 ⇒ 少 2 个命中）。**两个口径下 8 个目标对象都是 0** ⇒ 结论不受口径影响。

## 6 ★V7 · 真运行时对拍（**自建装置**，不复用 B 的）

**装置（`/tmp/c7/rt/`）**：镜像树 = 7 个模块**逐字节副本**（sha256 7/7 与仓库全等，且每次变异后恢复亦全等）+ 页面模块**由两版 `.vue` 的 `compileScript()` 原文派生**（仅 2 个 `.vue` 组件 specifier 重指向替身；`__returned__` 由编译器产出、非手写）+ 渲染模块 = **真 `compileTemplate()` 产物** + **真 `vue 3.5.34` 的 `createRenderer`** + **自写 nodeOps**（元素/文本/注释、insert/remove/nextSibling/cloneNode/patchProp）+ **真 `onMounted`/`onUnmounted`**（真 Vue 调度；hook 队列读 `instance.m/um/bum`）+ 替身（`vue-router`/`ant-design-vue`/`dompurify`/`api/request.js`/`useConfirm.js`/2 个组件/`<Transition>` 直通/`matchMedia` 假 MQL/`document.getElementById`）。**oplog 一律按源标识命名**（`request.get:<url>` · `matchMedia:<query>` · `addEventListener:<type>` · `removeEventListener:<type>` · `confirm:<title>` · `CodeEditor.format:<idx>` · `message.<level>:<text>` · `scrollIntoView:<id>`），**不用注册序号**（否则换序也会通过）。

### 6.1 ★总结果：**7 场景 × 两侧 = 899 个字段，0 差异**

| 场景 | 覆盖（对应 A 的 U/T 项） | 对比字段数 | 差异 |
|---|---|---|---|
| `s1` | T1 返回面/类型 + T2 + T4 调用序 + T9 fetch 写入面 + T5 清理 + 惰性对照 | 378 | **0** |
| `s2` | T3 四形态 + 双根（`data=null`） | 172 | **0** |
| `s3` | T11 状态族（`pageStatus` 4 值 / `subStatusText` 8 例 / `subStatusColor` 6 例 / `getNavLabel` 两模式 / `isItemCorrect` 4 题型 × 对错未答 / `getItemStudentStr`/`getItemRefStr`/`isItemAnswered`/`itemResultColor` / `materialText`/`safeMaterial`/`isCodeStem`/`displayStudentNo` 5 例） | 128 | **0** |
| `s4` | T7 `narrow` 两态 + K6 兼容分支（`addListener`/`removeListener`） | 43 | **0** |
| `s4_early` | T6 早退守卫（`shellMq` 为 null 时不 remove、不抛） | 5 | **0** |
| `s5` | T8 函数 ref + `formatCode` + T10 `v-model`/折叠/滚动 + T12 守卫·confirm options·PUT body·分流 | 160 | **0** |
| `s6` | T13 既有行为（K2/K3/K4） | 13 | **0** |

**惰性对照**：不做任何变异时，**整套 7 场景二次运行逐字节相同**（`cmp` 全过）；且 `s1` 的 `lazy_control` = `{messages:0, confirms:0, format_calls:0, non_get_requests:0}` ⇒ **没有凭空多出的副作用**。

### 6.2 关键事实（改后侧实测；两侧逐字相同）

| # | 事实 | 实测值 |
|---|---|---|
| **T1** | 返回面 / 无告警 / 无 `useRouter()` | 53 个模板名 `t53_missing=[]`；`contentRef` 存在且 `isRef=true`，其值 = 渲染出的 `div.rp-content wb-mid`（★string ref 真落到 setupState）；渲染期"accessed during render"告警 = **0**；`routerCalls=0`（`__routerCalls`） |
| **T2** | 类型事实 | `data/q/…=RefImpl`、`pageStatus=ComputedRefImpl`、`reviewScores/reviewFeedbacks/regrading/collapsedSqs(ctor=Set)=isReactive(true),isRef(false)`、`formatCode/getSub=function`（51 名逐个记录，两侧相同） |
| **T4** | setup 期调用序（源标识） | `["request.get:/teacher/submissions/S1", "matchMedia:(max-width: 1199px)", "addEventListener:change"]` **逐位相符** |
| **T5** | 卸载清理 | 尾部 oplog = `["matchMedia:…","addEventListener:change","removeEventListener:change"]`；**监听器净增 0**（adds=1/removes=1）；`console.error=0`；hook 队列 `{mounted:1, unmounted:1, beforeUnmount:absent}` |
| **T3** | 四形态 + 双根 | 5 组夹具逐组记录 14 项模板事实：`practice` ⇒ `rp-submit-bar=false` 且出现「练习模式」tag；`objective` 单形态 ⇒ `wb-panel-section=0`；`code` ⇒ `CodeEditor×1`、`wb-panel-section≥1`；`data=null` ⇒ **`rp-page=false` 但 `stub-a-modal=1`**，fragment 根子节点 = `[#text,#comment,#comment,div.stub-a-modal,#text]`（**5 个**，双根成立） |
| **T7** | `narrow` 两态 + 逐语句 | `matches=true` ⇒ `narrow=true` 且 `panelOpen` **不被重置**；再 true 时 `panelOpen` 保持 true；`matches=false` ⇒ `narrow=false` **且 `panelOpen=false`**；`wb-drawer-toggle` 随 `narrow` 出现/消失；**兼容分支**：`matchMedia → addListener:change` → 卸载 `removeListener:change`（`adds/removes=0`，`addsLegacy/removesLegacy=1`） |
| **T6** | 早退守卫 | 改后：**模块级 `useReviewPage()`（不调 `onPageMounted`，`shellMq` 保持 null）→ `onPageUnmounted()`** ⇒ 不抛、**remove 0 次**、error 0；改前：挂载后经 `__returned__` 的 `shellMq` setter 置 null 再调注册回调 ⇒ **同结果**（探针形态不同已在对比中排除标注） |
| **T8** | 函数 ref + `formatCode`（★editorRefs 单份的钉子） | 3 个「格式化」按钮**经模板 handler 各点一次** ⇒ 3 个替身 `format()` **各恰好 1 次**（`[1,1,1]`）、oplog = `[CodeEditor.format:0, :1, :2]`；未知 id ⇒ **no-op（delta=0）**；`setEditorRef(10, null)` 后 `formatCode(10)` **仍命中 1 次**（K4 照旧） |
| **T8b** | 两个 U6 实例（`s7`，直连模块） | `distinct_objects=true`；`editorRefs` **非 ref 非 reactive**；A 实例写入后 **A 自己读得到（1 次）而 B 读不到**；B 自己写读也 1 次；`export default` 是函数 |
| **T9** | fetch 接线 + 写入面 | `GET /teacher/submissions/S1` **恰好 1 次**；`subQuestions` 5 个（ids 10/20/30/40/50）；`reviewScores={10:8, 20:6, 30:0, 50:4}`（★`finalScore ?? aiScore ?? 0`：`null→8`、**`0→0`（`??` 不兜 0）**）、`reviewFeedbacks`（`||` 兜空串）；`totalAiScore=21`；`getSub` 逐字段（status/aiScore/finalScore/teacherFeedback/aiFeedback/answer）；`materialText="材料M"`、`safeMaterial` 走替身确定性输出 |
| **T10** | reactive 单实例 + v-model 写读同源 | `collapsedSqs` 是 **reactive 的 Set**：点 `n-section-head` 后 `has(id)=true` 且模板 `.collapsed` 类同步，再点回 `false`（`size=0`）；点 `n-box` ⇒ `activateAnchor` 生效（`n-box-active=true`）+ `scrollTo` 以 `{behavior:'smooth',block:'start'}` 打到真 `document.getElementById` 替身；`v-model` 两个目标经模板 `onUpdate:value` 写回 ⇒ `reviewScores[10]=99`、`reviewFeedbacks[10]='教师评语X'`，且随后 `reviewAll` 的 **PUT body 读到同一对象的新值**（写读同源） |
| **T11** | 状态族 | `pageStatus`：无提交 `{neutral,无提交}` / 全 published `{success,已发布}` / 全 reviewed `{brand,已审核}` / 混合 `{warning,待审核}`；`subStatusText` 8 例、`subStatusColor` 6 例、`subStatusTagClass` 4 例、`getNavLabel` flat/group × 4 种小题、`isCodeStem` 7 例（含 ``` 围栏、`{function class def`、纯文本）——两侧逐项相同 |
| **T12** | 守卫 / confirm options / PUT body | `showPrompt` 无 sub ⇒ **0 请求**、有 sub ⇒ `GET …/100/prompt` + `promptSubTitle="Q10（100）"` + `promptData` 写入；`useAiFeedback`：有评语 ⇒ 写入 `AI-FB-10`，无评语 ⇒ `warn:暂无 AI 评语`；`regrade` ⇒ `POST …/100/regrade`、`regrading[10]` true→false、`reviewScores[10]=7`、`success:重新评分完成`；`reviewAll` 空 ⇒ `warn:无提交记录`（0 请求）；非空 ⇒ **4 个 PUT body 逐字段**（`{finalScore, teacherFeedback}`，teacherFeedback 走 `|| s.aiFeedback`）；`Promise.allSettled` 部分失败 ⇒ `warning:1 题成功，1 题失败`；`publishAll` 的 **confirm options 键集** `[cancelText,content,danger,okText,onOk,title]` 与 `title/content/okText/cancelText/danger:true` **逐字段对拍**，`onOk` ⇒ `PUT /teacher/submissions/publish {submissionIds:[100,101,102,104]}` + 状态改写 + `success:全部已发布` |
| **T13** | 既有行为照旧（**不是修它**） | K2：`fetch` reject ⇒ **unhandled rejection 1 次**（`network-down`）、**无同步抛**（`mount_error=null`）、`console.error=0`；K3：卸载**后** in-flight 仍写 ref（`data.question.title="作业一"`）；K4：`setEditorRef(id,null)` 后条目仍在（`formatCode` 仍 1 次）、新 id 也能注册（1 次） |
| **装置自证** | — | 7 模块副本 sha256 与仓库**全等**（含每次变异后恢复）；仓库内零写入（`git status` 无新变化）；`client/dist` 未变；整套场景二次运行**逐字节相同** |

**装置自身产生的 1 条 `console.warn`**：`[Vue warn] Extraneous non-props attributes (persisted) … at <Transition name="wb-panel">` —— 来自**我的 `<Transition>` 直通替身**（真 runtime-dom Transition 需要真 DOM 的 `classList`/`getComputedStyle`/`whenTransitionEnds`，此无 DOM 装置无法承载）。**两侧完全相同**，属装置伪影，不是代码问题。

### 6.3 ★变异反证（3 条，全部被抓）+ 盲区兜底

| # | 变异（仓库外副本，改后树） | 期望被抓 | 实测 |
|---|---|---|---|
| **M1** | U6 内**再造一份 `editorRefsCopy`**，`formatCode` 改读副本 | T8 | ✅ **CAUGHT**：`s5` **7 处差异**（3 个 `format()` 由 1→**0**、oplog 无 `CodeEditor.format`、`setEditorRef(10,null)` 后不再命中）★**且 `s1` 差异 = 0** ⇒ 该缺陷对「挂载面」**不可见**，只有走 `formatCode` 通路才抓得到（正是 A 说的「L0/L1/build 三类判据全盲」的实证） |
| **M2** | U7 的 `onPageMounted` 把 `fetch()` 挪到 `matchMedia` **之后** | T4 | ✅ **CAUGHT**：`s1` **5 处差异**（oplog 由 `[get, matchMedia, addEventListener]` → `[matchMedia, addEventListener, get]`）+ `s5` 7 处 |
| **M5** | U7 漏注入 `route`（`useReviewData({})`）—— ④ 盲区 B-3 | T4/T9 | ✅ **CAUGHT**：运行期抛 `TypeError: Cannot read properties of undefined (reading 'params')`（**3 次 unhandled**）、请求数 0、场景崩（`s5` 早期版本记录到 **132 处事实差异**）⇒ **④ 看不见的错配只有 ⑤ 抓得到** |

**惰性对照**：不做任何变异 ⇒ 两侧 0 差异、同侧二次运行 0 差异（§6.1）⇒ 装置**不是**「永远报差异」，也**不是**「永远报相同」。

### 6.4 ★两张清单（诚实登记）

**（a）被执行的运行时事实**：T1（53 名/ contentRef 真绑定 / 0 渲染告警 / `useRouter()`=0）· T2（51 名类型）· T3（5 形态 + `data=null` 双根）· T4（调用序）· T5（清理 + 净增 0 + 零 error）· T6（早退守卫，双侧等价探针）· T7（`narrow` 两态 + 兼容分支）· T8/T8b（`format()` 计数 + 两实例隔离）· T9（请求数/URL/写入面/`??`、`||` 语义）· T10（reactive Set 折叠、`v-model` 写读同源、`scrollTo`/`activateAnchor`）· T11（状态族逐分支）· T12（4 类守卫、`Promise.allSettled` 分流、confirm options 逐字段、PUT body 逐字段、发布链路）· T13（K2/K3/K4）· 装置自证（副本全等 / 零写入 / dist 未变 / 二次运行逐字节相同）· 变异 M1/M2/M5。

**（b）未执行（计入残留风险）**：
1. **L2 / 真浏览器**：`tests/ui-redesign-verify/specs/e2e-03-teacher-review.spec.mjs`（T3-03-1）与 `visual-regression.spec.mjs` 的 `teacher-review-detail-dark` **未跑** —— 需真后端 + 真库 + 冻结的 `tests/` 装置，属 Captain 授权面（A 的 V14）。
2. **a11y 树对拍**（`page.accessibility.snapshot()`）与 **axe** 未跑：axe 全仓缺失 + 禁联网；模板逐字节相同 ⇒ a11y 树逻辑上必然相同，但**未实测**。
3. **像素门禁未跑**：A 档不需要（模板+样式逐字节相等严格强于像素相等）。
4. **替身面**：`<Transition>`（直通替身）· `ant-design-vue` 全量 · `dompurify` 真实现 · `api/request.js` 真实现（拦截器/错误归一）· `useConfirm.js` 真实现（Modal 容器）· `CodeEditor.vue`（真 Monaco / `defineExpose` / 自清）· `StatusTag.vue` · `vue-router` 真路由（守卫、参数变化）—— **这些真实实现的内部行为不在本装置覆盖面内**。
5. **K7（同一 route record 下参数变化不重跑 `fetch`）**：需真 router 才能验；我只证明「`onMounted` 只注册 1 次、`fetch` 只在其中调用」（静态 + 运行期）。
6. **NC3（`confirm` 漏注入）未单独造变异**：④ 实测盲区 = 0 命中，⑤ 的兜底路径与 M5 同族但**未单独跑通**（登记为残留）。
7. **真实并发/时序**：装置是单线程确定性调度；真实网络乱序、`Promise.allSettled` 的真实并发时序未覆盖。
8. **真实后端字段形态**：夹具由我构造（`allSubmissions`/`question` 形状取自代码读取路径），未用真库数据。

## 7 V5 + V6 · 构建与门禁（含两道 lint 判据的**首次正式实测**）

| # | 判据 | 命令 | 实测 | 判定 |
|---|---|---|---|---|
| V5 | 构建 | `cd client && npx vite build --outDir /tmp/c7-build --emptyOutDir` | **exit 0**，`✓ built in 22.18s`；`client/dist/index.html` mtime **仍 2026-10-10 21:55:33**、`find client/dist -newermt "2026-10-11 12:00"` = **0** | ✅ |
| V6-1 | arch-metrics | `node scripts/gates/arch-metrics.mjs` | **PASS**：`layerViolations 0/0` · `unmigrated **44/44 持平**` · `godfileOver800 **4 → 3**` · **`>500 观察带 14 → 14`（如实：不是 13）**；GodFile 残留 = teacherController 1338 / Doc.vue 1106 / reviewController 965（**列表已无 ReviewDetail**） | ✅ |
| V6-2 | cycle-check（默认） | `node scripts/gates/cycle-check.mjs` | **PASS**：根 `server/src`，**96 文件 / 214 边**，SCC **0**、自环 0 | ✅ |
| V6-3 | cycle-check（client） | `node scripts/gates/cycle-check.mjs --root client/src` | **PASS**：报头打印 `根目录 client/src`（**参数确实生效**），**99 文件 / 244 边**，SCC **0**、自环 0 | ✅ |
| V6-4 | hard-metrics | `node scripts/gates/hard-metrics.mjs` | **PASS 0/0/0**（样本 41 文件；`hex6=0`、`!important=0`、`modalConfirm=0`） | ✅ |
| V6-5 | bind-check（默认） | `node scripts/gates/bind-check.mjs` | 违规 **0**（roots = `server/src,server/test`，194 模块 / 652 绑定；**边界如实登记：默认面不含 client**） | ✅ |
| V6-6 | bind-check（client） | `node scripts/gates/bind-check.mjs client/src` | **BINDING VIOLATIONS 0**：**59 模块 / 96 具名绑定**，唯一 external = `main.js → ./App.vue`（既有） | ✅ |
| **V6-7** | ★**ESLint（首次作为正式判据）** | `npm run lint`（= `eslint client/src server/src`） | **exit 0**，**`✖ 59 problems (0 errors, 59 warnings)`** ⇒ **error=0 达标、warn=59 = 基线（只降不升）达标**；★**逐文件核对：59 条 warning 全部在 server 与既有 client 文件，`composables/review/*` 与 `ReviewDetail.vue` 各 0 条**（新改动面**零新增 warning**） | ✅ |
| **V6-8** | ★**离线 lint 门禁（首次作为正式判据）** | `node scripts/gates/lint-check.mjs` | **exit 0**，报头：扫描 **195 文件（.vue 40 / .js 155）/ 33304 行 / 解析失败 0**；基线 `docs/pipeline/lint-baseline.json`（2026-10-11T04:41:28Z，**31 条**）→ 当前 **31 条**，**新增 0**；分类：`no-unused-vars 31→31`、`no-undef 0`、**`no-unresolved-import 0`**、`parse-error 0` ⇒ **PASS（无基线外新违规）** | ✅ |

> ★两道 lint 判据的**互补性**在本步得到实测印证：ESLint 报 0 error / 59 warn（含 `.vue` 的 `no-unused-vars` 类），离线门禁把「相对 import 指向已删模块」的 `no-unresolved-import` 覆盖为 **0**——而这正是本步最容易犯的错（拆出 7 个文件后 8 条相对 import 全部重写）。**两者都按 DoD 的达标线（error=0/warn≤59、exit 0/基线只减不增）通过**。

## 8 V8 · B 的偏离与既有缺陷裁定

### 8.1 D1–D11 逐条

| # | 事项 | C 的独立裁定 |
|---|---|---|
| **D1** | 未做「每批一个提交」（硬约束禁 git 写） | **成立且可接受**：本轮硬约束优先；本步判据是**整页级**，整步留痕**严格强于**分批（我实测的 5 条判据 + 门禁 + 回归全在最终态上跑） |
| **D2** | 补 `f===t` | ✅ **正确**（§4 独立复现 + 真值表 + 变异反证） |
| **D3** | 正控改为「删具名 import」+ 两条负控 | **成立**：我的 PC3=9 / PC4=1 / NC1=0 / NC2=0 与 B 逐数相同；我另证 **PC5（.vue script 段）** 证明扫描不是空跑 |
| **D4** | 内部边 = U7→U1..U6 + U3→U1（横向 0） | ✅ **实测成立**：我在 7 模块内解析出**相对 import 11 条**，其中**新模块之间**恰为 `U3→U1` + `U7→{U1,U2,U3,U4,U5,U6}` = **7 条**，其余 4 条指向既有文件（`api/request.js`×3、`useConfirm.js`×1）；**U1–U6 之间除 U3→U1 外 0 条**；`cycle-check --root client/src` **SCC 0** 无环 |
| **D5** | 9 个非模板名不进 `.vue` 解构 | **成立（设计选择）**：`.vue` 面 = 52 名（51 点式 + contentRef）+ 2 组件 import = **54 名全有落点、0 缺失**（我逐个机器核对 `missing=[]`）。副作用是**这些名字在 .vue 层不可观测**；我改用**等价可观测代理**完成验证：`subMap`→`getSub(id)` 逐字段；`editorRefs`→`format()` 计数与两实例隔离；`fetch`→请求记录；`studentNo/schoolName`→`displayStudentNo` 的 5 组夹具。**无判据因此缺位** |
| **D6** | ⑤ 替身清单 | **成立**：改前/改后**施加完全相同**的替身，且模板/模块**逐字节相同** ⇒ 前后可比；我另外**明示 1 处装置伪影**（`<Transition>` 替身产生 1 条 Vue warn，两侧相同） |
| **D7** | `.vue` 620 行 ⇒ `over500 14→14`、`godfileOver800 4→3` | ✅ **实测一致**（§7） |
| **D8** | client 边数 244（预算 243，+1） | ★**我已完整归因：不是异常，是方案漏算**。我用**独立实现**按 `cycle-check.mjs` 同口径复算：**冻结 HEAD 树 `client/src`：92 文件 / 234 边；活树：99 文件 / 244 边 ⇒ 净 +10**。增删明细：**+12**（U2/U5/U6→`api/request.js` ×3、U3→U1、U7→U1..U6 ×6、`ReviewDetail.vue`→U7）**−2**（`.vue`→`api/request.js`、`.vue`→`useConfirm.js` 随内联删除消失）= **+10**。方案 §4.6 的 9 条只数了「.vue→U7 + U7 的 7 条 + U3→U1」，**漏了 3 条新模块→request 与 2 条 .vue 出边消失** ⇒ 预算 243 本身偏低 1（应为 244）。**SCC 仍 0**，无环、无自环 |
| **D9** | 像素/axe/L2 未跑 | **成立**（A 档 + 依赖缺失 + 需授权）；我已把 L2 与 a11y 列入 §6.4 未执行清单 |
| **D10** | U1 用文末 `export {…}` 而非逐函数 `export` 前缀 | **成立且更严**：使 65 个声明块**全部逐字节相等**（我的 L0b 实测 65/65 无需任何白名单豁免） |
| **D11** | `reviewPure.js` 无 default 导出 | **成立**：与既有 `questionPure.js` 先例一致；我实测 6 个 `use*` 各有 default（`s7` 里 `default_export_type=function`），`bind-check client/src` 0 违规 |

### 8.2 K1–K6 既有缺陷「照旧」（不是修它）—— 逐条实测

| # | 项 | 我的实测证据 | 结论 |
|---|---|---|---|
| **K1** | `getItemKey` 死代码保留并导出 | `function getItemKey(` 在 `reviewPure.js`；`export {…}` 面含它；U7 的 return 面含它；**65 块命中 1 次**（不删即成立） | ✅ 照旧 |
| **K2** | `fetch()` 未 await、未 try/catch | `useReviewData.js` 的 `async function fetch()` 体内 **无 try**；U7 `onPageMounted` 内字面 `fetch();`（非 await）；全文无 `await fetch(`；运行时 ⇒ **unhandled rejection 1 次**、无同步抛 | ✅ 照旧（**未放大**：仍 1 次、无 console.error） |
| **K3** | 卸载不取消 in-flight | `review/` 下 `AbortController` = **0**；运行时卸载后仍写 `data` | ✅ 照旧 |
| **K4** | `setEditorRef` 的 `if (el)` 守卫 ⇒ 条目不删 | 源码 `function setEditorRef(sqId, el) { if (el) editorRefs[sqId] = el; }`；运行时 `setEditorRef(10,null)` 后 `formatCode(10)` **仍命中** | ✅ 照旧 |
| **K5** | `contentRef` 死读 string ref | 模板 ` ref="contentRef"` **1 处**；U3 声明 `ref(null)`、U7 转出、`.vue` 解构；**全文件无 `.value` 读**（只有声明/转出/解构）；运行时 `isRef=true` 且值 = `div.rp-content wb-mid` | ✅ 照旧（保留声明与返回） |
| **K6** | `addListener`/`removeListener` 兼容分支 | U7 四个分支各 1 处（`addEventListener('change'` / `addListener(onShellMq)` / `removeEventListener('change'` / `removeListener(onShellMq)`）；运行时 legacy 形态 oplog = `[matchMedia, addListener:change]` → `[removeListener:change]` | ✅ 照旧（**未现代化**） |
| 附 | `route.params.id` 仍在 `fetch` 内 | `useReviewData.js` 中 **2 处**：1 处在 banner 注释（§7.3 说明）、**1 处在 `fetch` 函数体内第 73 行**；未提升为 setup 常量、未改形参 | ✅ 照旧 |
| 附 | 未新增 `useRouter()` | 静态：7 模块 + `.vue` 中 `useRouter(` 只出现在 **1 行 banner 注释**里，**代码 0 处**；运行时：`__routerCalls.useRouter = 0` | ✅ 达标 |
| 附 | 其余结构自检 | `.vue` 内 `ref/reactive/computed/watch/watchEffect/nextTick` = **0/0/0/0/0/0**；`onMounted/onUnmounted/onBeforeUnmount` = **1/1/0**；`defineProps/defineEmits/defineExpose/withDefaults` = 0；`import.meta.env` = 0；动态 `import(` = 0；`v-model` 三目标 = 1/1/1；组件 import = 1/1；`const editorRefs = {}` = **1**、`let shellMq = null` = **1**、`useReviewPage()` 调用 = **1**、U7 内 `useReviewData(`/`useReviewActions(`/`useRoute()`/`useConfirm()` = **各 1** | ✅ 全部达标 |

## 9 ★V9 · 全量后端回归

    ROUND=15 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh

- 轮次序号：`docs/split/test-round-*.log` 现有 08–14 ⇒ **15 为空序号**（无覆盖、无 `FORCE`）。
- 日志：`docs/split/test-round-15.log`（脚本控制台只回显摘要，证据从日志取 —— constraints §4）。
- 判据只有两条：**4 处 `Test Suites:` 摘要 + failed=0**（不得拿旧数字当判据）。
- ⚠️ tree-sitter 同进程假红（constraints 第 18 条）：本次若出现，**先隔离复跑**，判据以隔离进程为准。

**实测结果（`ROUND=15`）**：

    → 测试库: localhost:3306/exam_system_test ✓ 端口可达 ✓ schema 对齐 ✓
    → 退出码: 0 ｜ 完整日志: docs/split/test-round-15.log（1508 行）

    Test Suites: 65 passed, 65 total   Tests: 974 passed, 974 total   Time: 174.058 s   ← 段1
    Test Suites:  1 passed,  1 total   Tests:  17 passed,  17 total   Time:   0.488 s   ← 段2 fact-extractor
    Test Suites:  1 passed,  1 total   Tests:  61 passed,  61 total   Time:   0.493 s   ← 段3 rule-executor
    Test Suites:  1 passed,  1 total   Tests:  21 passed,  21 total   Time:   0.663 s   ← 段4 rule-mutator

- **判据 ①「4 处 `Test Suites:` 摘要」**：`grep -c '^Test Suites:'` = **4** ✅（四段 `&&` 全部跑到，**无短路**）
- **判据 ②「failed = 0」**：日志中**不存在**任何 `Tests: … failed` 行（4 段全 `N passed, N total`），合计 **974+17+61+21 = 1073 passed / 0 failed** ✅
- **tree-sitter 同进程假红**（constraints 第 18 条）：`syntax.js:49` / `TypeError` 签名命中 **0** ⇒ **本轮未触发，无需隔离复跑**
- 既有现象（**非本步引入**，round 13/14 同样各 2 次）：日志内 `DeepSeek API 限流，等待 …` 2 行（测试内既有的重试日志）
- 本步**不动 `server/`** ⇒ 与 round 14 基线**逐数相同**（974/17/61/21），是「B 未越界」的零成本哨兵 ✅

**V9 判定：✅ 通过（4 处摘要 + 0 failed）**。

## 10 缺陷分级

| 级别 | 数量 | 明细 |
|---|---|---|
| **阻断（P0）** | **0** | 无。模板/样式逐字节未动、53 名无缺无增、冻结编译逐字节等、运行时 899 字段 0 差异、门禁 8/8 绿、回归 **0 failed / 4 处摘要** |
| **严重（P1）** | **0** | 无。`editorRefs` 单份（最危险的静默失效点）有「静态单点 + 运行时 `format()` 计数 + 变异 M1」三重证据 |
| **观察（P2，不影响判定，登记备查）** | 5 | ① **D5 的结构性不可观测**：`subMap/activeAnchor/parsedAnswers/getStudentItem/fetch/editorRefs/getItemKey/studentNo/schoolName` 9 名不在 `.vue` 面（我以等价代理覆盖）；② 装置 `<Transition>` 替身产生 **1 条 Vue warn**（两侧相同）；③ L1 `own` 口径 **2 行差异**（`patchFlag` 多重集相同 ⇒ 同类）；④ **D8 的「+1」** ⇒ 实为方案漏算（净 +10，非异常）；⑤ 全 client ④ 扫描 **14** 个白名单缺口（我口径）/16（A 口径）——**均既有、非本步引入** |
| **改进建议（不属本步）** | 3 | ① `fetch` 与浏览器全局同名 ⇒ 建议后续单独改名（B-1 盲区根源，属独立行为改进）；② `contentRef` 死读可清理（K5，删了不报错但属无谓改动）；③ `publishAll` 可加 `confirm` 未注入的防御（NC3 盲区） |

## 11 未做项与残留风险（汇总）

1. **L2 真浏览器 E2E 未跑**（`e2e-03-teacher-review` / `visual-regression teacher-review-detail-dark`）：需真后端 + 真库 + `tests/`（冻结）+ Captain 授权。**残留风险最高的空白**——但模板逐字节相同 ⇒ 渲染路径的静态确定性极高。
2. **a11y（axe / accessibility snapshot）未跑**：依赖缺失 + 禁联网；未实测。
3. **替身面**（Transition / antd / dompurify / request / useConfirm / CodeEditor / StatusTag / vue-router / matchMedia / document）——真实实现内部行为未覆盖；其中 `useConfirm` 的真 Modal 容器、`CodeEditor` 的真 Monaco `format()` 是本步**行为等价性最依赖外部实现**的两处。
4. **NC3（`confirm` 漏注入）未单独造变异**：④ 盲区已实测（0 命中），⑤ 兜底路径同 M5 家族但未单独跑。
5. **K7（同 route record 参数变化不重跑 fetch）**：未用真 router 验证。
6. **真实并发/时序与真实后端字段形态**未覆盖（夹具由 C 构造）。
7. **像素门禁未跑**：A 档不需要（模板+样式逐字节相等严格强于像素相等）。

## 12 结论

**PASS（无需回流 B）**。

- **DoD client A 档 5 条判据全部实测通过**：L0（2 段逐侧切片，含**假通过防线**与 3 条正控）· L1（冻结口径逐字节 + 53 名 + `_ctx=["$router"]` + 非法迁移 0，含 **`f===t` 修正判定**）· ④（8 对象 0 命中 + 5 条正控 + 3 条负控）· ⑤（**7 场景 899 字段 0 差异** + 变异 3/3 + 惰性对照 0 差异）· ⑥（门禁 8 项全绿，含 **两道 lint 判据的首次正式实测**）。
- **本步唯一可承诺的判据收益达成**：`godfileOver800 4 → 3`；**观察带如实为 14（不是 13）**。
- **三条最要紧事项**（`editorRefs` 单份 / 两个 hook 各注册一次且回调逐字平移、`fetch` 先于 `matchMedia` / `getItemKey` 保留 + `route.params.id` 留在 `fetch` 内 + 不新增 `useRouter()`）**均有静态 + 运行时 + 变异三重证据**。
- **A 的方案配方缺陷 1 处（L1-d 漏 `f===t`）由 B 修正、经我独立判定为正确且不放松判据**；**B 未登记但成立的方案偏差 1 处（D8 的边数预算）已由我完整归因**。
- 既有缺陷 K1–K6 **全部照旧存在、未被放大**（K2 的 unhandled rejection 仍恰好 1 次、K4 的条目不删仍成立）。
