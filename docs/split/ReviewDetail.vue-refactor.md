# ReviewDetail.vue 拆分实施报告（step 7 · B 侧）

- **step**: 7 ｜ **agent**: B（唯一写者）｜ **日期**: 2026-10-11
- **方案**: `docs/split/ReviewDetail.vue-plan.md`（685 行，A 侧；**以它为准**）｜ **DoD**: `docs/plan/2026-10-11-godfile-split-plan.md` §5（**client A 档 = 5 条判据**，不需像素门禁）
- **约束**: `docs/pipeline/project-constraints.md` **18 条**（第 12 条：`node --check` 不作证据；第 18 条：tree-sitter 假红）+ Captain 本轮三条最要紧事项
- **范本**: `docs/split/QuestionEdit.vue-refactor.md`（step 6）、`docs/split/ProjectQuestionEdit.vue-refactor.md`（step 5）

## 0 版本锚点与产物指纹（★被测源码树留痕）

| 项 | 实测值 |
|---|---|
| 被测源码树（绝对路径） | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**，非 `../Exam-DeepSeek-ui` —— G-A） |
| 改前锚点 | `aa295058ffcfad794d9ab4d6cb1219096e7e52b9`（= 方案锚点；**执行期间 HEAD 未前移**） |
| `ReviewDetail.vue` **改前** | **988 行** / sha256 `d7595832cd9c482b4d0a1629ba9bfa01672f320a0ad46bf76363bcb1d15d17c9` |
| `ReviewDetail.vue` **改后** | **620 行** / sha256 `f1cf9eeb7fb35835099ec5f3ab6fac7fe29db9e693c24fdf19adc39ba813f66a`（template 1–236 + script 238–260 + style 262–620） |
| 冻结副本 | `/tmp/rd7/before/ReviewDetail.vue`（`git show HEAD:…` 导出，与工作树 `cmp` 全等） |
| 构建产物 | `/tmp/split-step7-build/`（`built in 23.55s`，exit 0；**未重建 `client/dist`** —— `dist/index.html` mtime 仍为 `2026-10-10 21:55`，`find client/dist -newermt '2026-10-11 12:30'` 输出为空） |
| 改动面 | `M client/src/views/teacher/ReviewDetail.vue` + `?? client/src/composables/review/`（**7 文件**）+ 本报告。**未触碰** `client/src/composables/{submit,project,question}/`、其它 `.vue`、`scripts/gates/`、`tests/`、`client/dist`、`package.json` |
| 工具链 | node v24.19.0 · `vue/compiler-sfc 3.5.34` · `babel/parser` + `babel/traverse`（全部取自 `client/node_modules`，**未联网**） |
| 生成装置 | `/tmp/rd7/gen.mjs`（**由冻结源按行区间切片构造** 7 文件 + 新 `.vue`，产出 `manifest.json`（dest 行 → src 行映射）与覆盖核算）· `/tmp/rd7/check3.mjs`（L0/L1/④/结构）· `/tmp/rd7/rt/`（⑤ 运行时对拍）· `/tmp/rd7/mutpy/`（变异反证） |

## 1 交付物（7 个 composable + 1 个改造后的 .vue）

| 文件（`client/src/composables/review/`） | 单元 | 批次 | 行数实测 | 方案预估 | sha256（前 16） |
|---|---|---|---|---|---|
| `reviewPure.js` | U1 纯叶子（9 导出） | B1 | **59** | ≈60 | `f5a917e415c6b886` |
| `useReviewData.js` | U2 数据基座 + 派生 + `fetch` | B2 | **98** | ≈105 | `63b765b50a0a0054` |
| `useReviewNav.js` | U3 导航 / 方块配色 / 滚动 | B3 | **75** | ≈60 | `e7926c0cfbeda18d` |
| `useObjectiveCompare.js` | U4 客观题判定（轴 2） | B3 | **100** | ≈90 | `3683b3cafe5f5b39` |
| `useReviewAiPrompt.js` | U5 AI 提示词 | B3 | **41** | ≈40 | `3ea972213e973e2b` |
| `useReviewActions.js` | U6 审核动作 + `editorRefs` | B4 | **101** | ≈100 | `170e6867550b75da` |
| `useReviewPage.js` | U7 接线根（唯一入口） | B4 | **84** | ≈85 | `ec3fd6baa9b54e72` |
| `client/src/views/teacher/ReviewDetail.vue` | — | B4 | **988 → 620** | ≈617–625 | `f1cf9eeb7fb35835` |

**7 个新文件全部 < 150 行**（合计 558 行），无一进入 >500 观察带。**声明闭合**：9+21+9+7+5+7 = 65 顶层声明；**函数闭合**：9+2+6+6+1+6+1 = 31 个 `FunctionDeclaration`；**模板可见面**：51 点式 + 2 方括号式（`CodeEditor`/`StatusTag`）+ 1 个 string ref（`contentRef`）= 54 名，全部在 `.vue` 有落点（§8.3 逐名表）。

## 2 执行方式与分批记录

**Captain 指令**：B1 纯叶子 → B2 数据基座 → B3 展示三件（可同批）→ B4 动作 + 接线根 + **最后删内联**。

**实际执行**（与 step 5/6 同构）：`/tmp/rd7/gen.mjs` **从冻结源按行区间切片拼装** —— 搬移块**不是手抄**（这是 §3 逐字节相等的**构造性保证**）；同一脚本逐行记录 `dest→src` 映射并做覆盖核算；7 文件 + `.vue` 一次落盘；落盘后跑 L0 + L1 + ④ + 结构自检 + ⑤（对拍 / 变异）+ `vite build` + 四门禁。

> **D1（登记）**：本轮硬约束为「**不做任何 git 写操作**」，故方案 §6 的「每批一个提交」**未执行**；批次以单元归类 + 同一套判据的整步实测留痕代替（整步判据严格强于分批判据）。

| 批 | 文件 | 完成后自测（全部实跑） |
|---|---|---|
| **B1** | `reviewPure.js` | 9 个声明块在语料中各命中 1 次；`export {}` 面 9 名真 import 通过 |
| **B2** | `useReviewData.js` | `pageStatus`（:259-266 物理在 S0）与 `fetch`（:595-613 物理在 S7）**按逻辑归属迁入 U2**（方案 §1.3-1/2）；T9 逐字段 + T4 副作用序通过 |
| **B3** | `useReviewNav.js` + `useObjectiveCompare.js` + `useReviewAiPrompt.js` | 三者**互不依赖**、0 watch ⇒ 无注册序约束；T3 四形态 + T11 状态族 6 组通过 |
| **B4** | `useReviewActions.js` + `useReviewPage.js` + 接线 + **删内联** | `.vue` 只留 4 行 import + 9 行解构（每行 5–8 名）+ 2 行 hook 注册；2 个 hook 回调体**逐字平移**；⑤ T1–T14 + 6 条变异反证 + ⑥ 三项替代判据全绿 |

**覆盖核算（`gen.mjs` 实测输出）**：

    COVERAGE gaps(non-blank, not moved, not import) = 4  ["615:onMounted(() => {","621:});","623:onUnmounted(() => {","627:});"]
    COVERAGE duplicates = 0
    hook wrapper lines (结构性重定位) = [615,621,623,627]     import lines = 8

⇒ script 段 239–627 的每个非空行都有归宿：**逐字搬移** ∨ **8 行 import（重新归属）** ∨ **4 行 hook 包装（结构性重定位，内层语句逐字）**；**同一源行的第二个逐字副本 = 0**。

## 3 L0 · 切片字节判等（★铁律：模板与样式一个字节都不许动）

**本文件只有 1 个 `<style>` 块** ⇒ **L0 切 2 段**。★**两侧行区间各自从该侧 `descriptor` 取**（`descriptor.template.loc` / `descriptor.styles[0].loc`），**未使用任何写死的行号**（方案 §4.2 对 step 6 的纠正），并**先断言切片非空**：

    L0 before: template 1-236 | style 630-988 | styles=1 scoped=true | script 238-628
       tpl first="<template>" last="</template>" bytes=12100 sha256=ae9765b74ef1e28fb0e6903f40d37c3ebecfe91882197f55c093b998efe2f4ca
       sty first="<style scoped>" last="</style>" bytes=13959 sha256=470d1e502105508973ba255c67f074f8de9d187ee6b9a8bc825305e5840d3208
    L0 after : template 1-236 | style 262-620 | styles=1 scoped=true | script 238-260
       tpl … bytes=12100 sha256=ae9765b74ef1e28f…（同前）
       sty … bytes=13959 sha256=470d1e5021055089…（同前）

- **S1 template 1–236**：BYTE_IDENTICAL（12100 B，sha `ae9765b7…`）；**S2 style scoped 630–988 → 262–620**：BYTE_IDENTICAL（13959 B，sha `470d1e50…`）。**只有 script 段的行号变化**（238–628 → 238–260）。
- `descriptor.styles.length === 1`（两侧自证）、`scoped === true`（两侧）、`descriptor.template.content` / `styles[0].content` 逐字节相等。

### 3.1 声明块 sha256 判等（65 个顶层声明，**机器实测**）

    L0b blocks=65  hit1=65  miss=0  dup=0     （babel AST 顶层语句 loc；已去掉 8 import + 2 hook 语句）

- 65 个块在「7 个新模块 + 改后 `.vue` 的 script 段」并集语料中**各出现恰好 1 次**：**缺口 0、重复 0**。
- ★**比方案更严**：方案 §4.2 的白名单允许「`export `前缀」差异；本轮 U1 采用 `questionPure.js` 先例（函数体原样 + 文末 `export { … }`）⇒ **65 个块全部逐字节相等，无需任何白名单豁免**（D10）。

## 4 L1 · 编译级对拍（★权威口径 = **冻结的改前 bindingMetadata**）

    sanity_template_source_byte_equal      = true
    template_compile_frozen_byte_equal     = true      （两侧 32280 字符，逐字节）
    template_compile_own_byte_equal        = false     （仅诊断：2 行差异，见下）
    $setup 点式名 before/after              = 51 / 51    集合完全相同 | missing=[] added=[]
    $setup["X"] 方括号名                    = 2（CodeEditor, StatusTag），方括号式命中 5 处，两侧一致
    模板静态 string ref                     = contentRef（ ref=" 计数 1、:ref=" 计数 1）
    _ctx. 唯一名                            = ["$router"]     ★基线 = 1，不是 0
    unref( 出现次数                          = 0
    styles 数组 {scoped,content} 相等        = true ；styles.length = 1
    非法 binding 迁移                        = []            （迁移表见下）

**own 口径 2 行差异的归类**：`patchFlag` 多重集**两侧逐项相同**（`{CACHED:23, STABLE:13, TEXT:21, PROPS:18, CLASS:6, KEYED_FRAGMENT:5, STABLE_FRAGMENT:4, DYNAMIC:3, DYNAMIC_SLOTS:1, NEED_PATCH:2}`）⇒ **无跨类 flag 变化、无片段类 flag 变化、无 dynamicProps 增删** ⇒ 差异全部落在方案 §4.3 表的「同类」栏（`_hoisted`/`_cache` 槽位与取值路径的等价重排）。

**迁移表（冻结口径，全量）**：`undefined → setup-maybe-ref` ×3（新增名 `onPageMounted`/`onPageUnmounted`/`useReviewPage`）· `setup-const → setup-const` ×4（未变）· `setup-const → undefined` ×8（import 搬走）· `setup-maybe-ref → undefined` ×7 · `setup-ref → setup-maybe-ref` ×21 · `setup-ref → undefined` ×5 · `setup-reactive-const → setup-maybe-ref` ×4 · `setup-let → undefined` ×1（`shellMq`）· `setup-const → setup-maybe-ref` ×27 ⇒ 全部落在「新名字 / 名字消失 / ref 退化为 maybe-ref」三类放行方向。

- ★**修正 A 的 L1-d 谓词**：方案 §4.3 的 `allowed(f,t)` **漏了 `f === t` 分支** —— 照抄会把 **4 个根本没变的 `setup-const`**（`onMounted`/`onUnmounted`/`CodeEditor`/`StatusTag`）判成「非法迁移」（**会把正确重构判 FAIL**）。本轮补 `f === t` 后 `illegal = []`（D2）。
- 判据（5 条，缺一不可）：L1-a 冻结口径逐字节相等 ✅ ｜ L1-b 53 名一个不漏、`_ctx === ["$router"]`、`unref(` = 0 ✅ ｜ L1-c styles 数组相等且块数 1 ✅ ｜ L1-d 非法迁移 = [] ✅ ｜ L1-e string ref = `contentRef`（1 处）✅
## 5 ④ 自由标识符扫描（**scope.crawl() 口径**，不是正则）

**实现**：`@babel/parser`（`sourceType:'module'`）→ `traverse(ast,{ Program(p){p.scope.crawl()}, ReferencedIdentifier(p){…} })` → 未绑定且不在紧凑全局白名单 ⇒ 计为自由标识符。**白名单不含任何业务名**（含 `fetch` —— 见盲区）。

    8 个对象（7 模块 + 改后 .vue 的 script 段，区间由 descriptor.scriptSetup.loc 取）：全部 0 违规 ✅
    CTRL PC1 删 DOMPurify import（U1）            -> 1  ["DOMPurify@30"]
    CTRL PC2 getSub 定义改名（U2，保留 return 面） -> 1  ["getSub@94"]
    CTRL PC3 U7 删 reviewPure 的具名 import       -> 9  ["itemTypeLabel@77","itemTypeColor@77",…]
    CTRL PC4 U3 删 itemTypeLabel import           -> 1  ["itemTypeLabel@31"]
    CTRL NC1 fetch 改名（盲区 B-1，期望 0）        -> 0  ★复现方案 §4.4-B-1
    CTRL NC2 U7 删 route 传参（盲区 B-3，期望 0）  -> 0  ★复现 DoD ④ 已登记的「形参声明了但调用方没传」
    ④ 全 client（除本步新目录）：92 文件 / 有命中 16（与方案 §4.4 实测基线逐数相同 —— 全部是既有的
      `defineProps/Node/Function/CSS/getComputedStyle` 一类白名单缺口，非本步引入）

**★两条盲区的兜底证据（不是"报了 0 就算过"）**：

| 盲区 | ④ 实测 | 兜底判据 | 实测 |
|---|---|---|---|
| **B-1** `fetch` 与浏览器全局同名 | NC1 改名 = 0 命中 | ⑤ **T9**（挂载后 `request.get` 恰好 1 次、URL 逐字）+ 静态单点（`async function fetch()` 出现 1 次） | ✅ T9 通过 |
| **B-3** 被调方形参声明了、调用方没传 | NC2 = 0 命中 | ⑤ **M5 变异**（把 `useReviewData({ route })` 改成 `useReviewData({})`）⇒ 运行时 `route.params.id` 抛错 ⇒ **T4/T9 等 49 项失败（CAUGHT）** | ✅ 见 §6.2 |
| **B-2** 52 个模板名里 31 个在脚本内 0 引用 | 若漏解构则 ④ 报 0 | **L1-b**（`setup_names_missing === []`）+ ⑤ **T1**（返回面 53 名一个不漏） | ✅ 两侧均通过 |

## 6 ⑤ 真运行时对拍（真 compileTemplate 产物 + 真 Vue createRenderer + 自写 nodeOps）

> 本仓**无 jsdom**（方案 §4.1 复测）⇒ 沿用 step 5/6 已实证的**装置 A**：`/tmp/rd7/rt/`（仓库外、无网络、无端口、不碰 `tests/`、不碰 `client/dist`）。

**装置组成**：① 7 个模块的**逐字节副本**（sha256 7/7 与仓库全等）；② 接线根 `page-before.js` / `page-after.js` **由两版 `.vue` 的 `<script setup>` 原文派生**（仅 2 个 `.vue` 组件 specifier 重指向替身；`return` 面直接采用 `compileScript()` 产出的 `__returned__` 原文）；③ **模板 = 真 `compileTemplate()` 产物**（own 口径 = 构建真实产物），用**真 `vue 3.5.34` 的 `createRenderer` + 自写 nodeOps** 挂载 ⇒ 模板对 `$setup` 的每一次访问**都真发生**；④ **真 `onMounted`/`onUnmounted`** 由真 Vue 调度（wrapper 记录注册序）；⑤ 替身：`vue-router` / `ant-design-vue`（`message` 记录器）/ `dompurify` / `api/request`（记录 method+url+body，可控 resolve/reject）/ `useConfirm`（记录 options 原对象）/ `CodeEditor`（暴露 `format()` 计数）/ `StatusTag` / `Transition` 与 `vShow` 直通 / 假 `matchMedia` / 极简 `document`+`window`。

**★oplog 一律按「源标识」命名**（`request.get:<url>` · `matchMedia:<query>` · `addEventListener:<type>` · `removeEventListener:<type>` · `confirm:<title>` · `message.<level>:<text>` · `CodeEditor.format`），**不使用注册序号**（按序号命名会让"换序"也通过 = 判据失能）。

### 6.1 断言结果：**改前 104/104 PASS、改后 104/104 PASS**，131 个记录字段 **129 个逐字节相同**、**0 处未解释差异**

| # | 事实 | 实测（改后 = 改前） |
|---|---|---|
| **T1** | 接线根返回面 | 53 个 `$setup` 名一个不漏 + `contentRef` 存在且 `isRef`；0 条 "was accessed during render" 告警；`useRouter()` 调用数 = **0** |
| **T2** | 类型事实（运行时） | 19 ref + 7 computed 全 `isRef`；4 reactive（含 `collapsedSqs` 的 Set 代理）全 `isReactive`；`editorRefs` 是**普通对象**（非 ref 非 reactive）；65 个共有名类型逐一相同 |
| **T3** | 四形态 + 双根 | 5 组夹具（exam/practice × code/objective + 混合）逐组断言 8 个模板事实（`rp-page`/`rp-submit-bar`/「练习模式」tag/`oi-card`/`CodeEditor`/`wb-panel-section`/`n-box`/`isPracticeMode`）；`data=null` 时 **`rp-page` 不渲染而 `a-modal` 仍渲染**（fragment 双根，root 子节点 5 个） |
| **T4** | setup 期调用序（**源标识**） | `["request.get:/teacher/submissions/S1", "matchMedia:(max-width: 1199px)", "addEventListener:change"]` **逐位相符** |
| **T5** | 卸载清理 | oplog = `["removeEventListener:change"]`；监听器**净增 0**；存活定时器 **0**；控制台 error **0**；hook 队列 = `["onMounted","onUnmounted"]`（各 1）；`onBeforeUnmount` = 0 |
| **T6** | 早退守卫 | 未挂载即卸载（`shellMq` 为 null）：不抛、**不调用任何 remove** ✅ |
| **T7** | `narrow` 两态 + `onShellMq` 逐语句 | matches=true ⇒ `narrow=true` 且 `panelOpen` **不被重置**；再 true 时 `panelOpen` 保持 true；matches=false ⇒ `narrow=false` **且 `panelOpen=false`**；K6 兼容分支另跑：`addListener:change` / `removeListener:change` 逐位 |
| **T8** | 函数 ref + `formatCode` | `formatCode(10)` ⇒ 替身 `format()` **恰好 1 次**；未知 id = no-op；`setEditorRef(id,null)` 后条目仍在（K4）⇒ 再 `formatCode` 仍命中 |
| **T8b** | `editorRefs` 每页恰一份（U6 直连） | 两个 U6 实例各持独立对象、**写读同源**（各自 `format` 各 1 次）、非 reactive |
| **T9** | `fetch` 接线 + 写入面 | `request.get` 恰好 1 次且 URL = `/teacher/submissions/S1`；6 个状态逐字段相同；`subMap` 键 = `s.subQuestionId || s.questionId`（`['10','20']`）；`finalScore ?? aiScore ?? 0`（`null→8`、`0→0`）与 `teacherFeedback || ''` **逐键相同** |
| **T10** | 4 个 reactive 单实例 | `collapsedSqs` 折叠两态与模板 `collapsed` class 同步；`regrade` 期间 `regrading[id]` true→false、写回 `reviewScores/subMap` 逐字段 |
| **T11** | 数据驱动状态族 6 组 | `pageStatus` 4 文本；`subStatusText` 6 分支 + 「请联系老师」；`subStatusColor` 5 分支；`subStatusTagClass`；`getNavLabel` flat/group × code/objective 5 例；`isItemCorrect` choice/multi_choice/judge/fill 4 题型；`getItemStudentStr/getItemRefStr/isItemAnswered`；`sqResultColor` empty/partial/wrong/correct；`materialText/safeMaterial/displayStudentNo/isCodeStem` |
| **T12** | 守卫与请求分流 | `showPrompt` 无 sub 直接 return（0 请求）/ 有 sub 开 modal + `T20（101）` + URL 逐字；`useAiFeedback` 无评语 ⇒ `warn:暂无 AI 评语`；`regrade` 无 sub ⇒ 0 请求；`reviewAll` 空 ⇒ `无提交记录`、全成功 ⇒ `全部 2 题审核已保存` + 2 个 PUT body 逐字段、部分失败 ⇒ `warning:1 题成功，1 题失败`；`publishAll` `confirm` options **键集与 6 个字段逐字对拍**（title/content/okText/cancelText/danger:true）+ `onOk` 的 PUT body `{submissionIds:[100,101]}` + 状态改写 + `全部已发布` |
| **T13** | 既有行为照旧 | `fetch` 失败 ⇒ **unhandled rejection 1 次**、无同步抛、无 console.error（K2）；卸载后 in-flight 仍写 ref（K3）；`editorRefs` 永不删条目（K4）；`scrollTo` 走真 `document.getElementById` 替身 |
| **T14** | 装置自证 | 7 个模块副本 sha256 与仓库**全等**；两次同场景运行 **逐字节相同**（`cmp result-after.json result-after3.json` 通过）；仓库内零写入；`client/dist` 未被重建 |
| **惰性对照** | 什么都不驱动 | 仅 1 次初始 GET；0 message / 0 confirm / 0 nav / 0 `format` / 0 定时器 ⇒ **没有凭空多出的副作用** |

### 6.2 变异反证（6 条，全部被抓）

| # | 变异（仓库外副本） | 期望被抓 | 实测 |
|---|---|---|---|
| **M1** | U6 内**再造一个 `editorRefs`**（`formatCode` 改读副本） | T8 | ✅ **CAUGHT**：`T8_formatCode_calls_format_once` 等 **5 项失败**（`format()` = 0） |
| **M2** | U7 的 `onPageMounted` 里把 `fetch()` **挪到 `matchMedia` 之后** | T4 | ✅ **CAUGHT**：`T4_order_request_matchMedia_addListener` 失败 |
| **M3** | U2 把 `isPracticeMode` 读错路径（`data.value?.mode`） | T3 | ✅ **CAUGHT**：practice 两形态 **6 项失败** |
| **M4** | 删掉 `onUnmounted` 的 `matchMedia` 清理 | T5 | ✅ **CAUGHT**：`T5_cleanup_single_remove` + 净增 + `T7_legacy` 共 3 项失败 |
| **M5** | U7 漏注入 `route`（`useReviewData({})`）—— ④ 盲区 B-3 | T4/T9 | ✅ **CAUGHT**：**49 项失败**（请求根本没发出） |
| **M6** | U2 返回面用第二个 `data` 源（`data: ref(null)`） | T3 | ✅ **CAUGHT**：**28 项失败**（`rp-page` 永不渲染） |

**惰性对照**：不做任何变异时两次运行 **0 差异**（`cmp` 逐字节相同）。

### 6.3 方案 §3.2 「不确定需实测」U1–U8 的收敛

| 方案编号 | 本报告证据 | 状态 |
|---|---|---|
| **U1** 四形态求值一致性（多一条后端数据驱动的模式轴） | T3（5 组夹具 + 8 个模板事实 + 双根）＋ M3/M6 反证 | ✅ 收敛 |
| **U2** 函数 ref 真绑定 + `editorRefs` 单实例 + `formatCode` 通路 | T8（`format()` 次数是判别式）+ T8b + **M1** | ✅ 收敛 |
| **U3** `matchMedia` 注册/清理序 + 净增 0 + 早退分支 | T4/T5/T6/T7（源标识 oplog）+ M2/M4 | ✅ 收敛 |
| **U4** `fetch` 的接线与写入面（④ 对它全盲） | T9（1 次 GET + 逐字段 + `??`/`||` 语义）+ M5 + NC1 | ✅ 收敛 |
| **U5** hook 注册形态 + hook 队列计数 | T5a（`["onMounted","onUnmounted"]` 各 1、`onBeforeUnmount` 0）+ T6 | ✅ 收敛 |
| **U6** `contentRef` 死读 string ref | L1-e（1 处未变）+ T1（`contentRef` 在返回面且 `isRef`）+ 渲染不抛 | ✅ 收敛（口径边界，**不要求造可见后果**） |
| **U7** 数据驱动状态族（4/6/5 分支 + `getNavLabel` 两模式） | T11（逐分支实跑） | ✅ 收敛 |
| **U8** 4 个 reactive 身份一致 + `reactive(new Set())` 语义 | T2 + T10（折叠 class 同步、`regrading` 两态、`v-model` 目标未变） | ✅ 收敛 |
## 7 ★三条最要紧事项的处理证据（违反即回流）

| # | 事项 | 处理 | 静态证据 | 运行时证据 | 变异反证 |
|---|---|---|---|---|---|
| **①** | `editorRefs` **只许存在一份**（复制它会让 `formatCode` 变成**静默 no-op**，而 L0/L1/build 三类判据**全盲**） | 只在 **U6**（`useReviewActions.js`）声明**唯一一处** `const editorRefs = {}`；`setEditorRef`/`formatCode` 与它同文件同闭包；U7 只把 U6 的返回对象整体转出，**不复制、不重新赋值**；`.vue` 不解构 `editorRefs`（模板不用它） | 结构化计数：`const editorRefs = {}` = **1**；7 个新文件互 import 边里没有任何「第二份状态」 | T8：函数 ref 真绑定后 `formatCode(10)` ⇒ `format()` **恰好 1 次**（失绑/复制 ⇒ 0）；T8b：两个 U6 实例各持独立对象且**写读同源** | **M1**：U6 内再造一份 ⇒ `format()` = **0**，**5 项判据同时失败** ⇒ 该风险对 L0/L1/build **不可见**、对 ⑤ 可见 |
| **②** | **两个 hook 只在 `.vue` 各注册一次**、回调体**逐字平移**；`fetch()` **必须先于 `matchMedia`** | `.vue` 只写 `onMounted(onPageMounted);` / `onUnmounted(onPageUnmounted);`（直接传具名函数引用，与 step 6 同形）；回调体平移进 U7 的 `onPageMounted()` / `onPageUnmounted()` | `.vue` 内 `onMounted(` = **1**、`onUnmounted(` = **1**、`onBeforeUnmount(` = **0**；覆盖核算显示 4 个包装行（:615/:621/:623/:627）为**唯一的结构性重定位**，内层语句（:616-620 / :624-626）**逐字节出现在 U7** | T4 oplog = `[request.get:…, matchMedia:…, addEventListener:change]` **逐位相符**；T5a 队列 = `[onMounted, onUnmounted]` | **M2**：把 `fetch()` 挪到 `matchMedia` 之后 ⇒ **T4 失败** |
| **③** | `getItemKey` 是**死代码但不许删**；`route.params.id` **必须留在 `fetch` 内**；**不得新增 `useRouter()`** | `getItemKey` 照旧搬进 U1 并由 `export {…}` 导出（K1）；`fetch` 整段（:595-613）原样落在 U2，`route.params.id` 仍在函数体内（未提升、未改形参）；U7 只调 `useRoute()` 一次 | L0b 65/65 块命中（含 `getItemKey` 单行块）；`route.params.id` 出现 **1** 次且在 U2 的 `fetch` 内；`useRouter(` 在 `.vue` 与 7 模块内**均为 0** | T1：`__routerCalls.useRouter === 0`；T9：URL = `/teacher/submissions/{route.params.id}` 且只发 1 次 | **M5**：漏注入 `route` ⇒ **49 项失败**（该变异在 ④ 下**不可见**，只有 ⑤ 抓得到） |

## 8 结构自检 + 接线契约

| 项 | 判据 | 实测 |
|---|---|---|
| `.vue` 内响应式原语 | `ref(` / `reactive(` / `computed(` / `watch(` / `watchEffect(`（按词边界计数） | **0 / 0 / 0 / 0 / 0** ✅ |
| `.vue` 内 hook | `onMounted(` / `onUnmounted(` / `onBeforeUnmount(` | **1 / 1 / 0** ✅ |
| `.vue` 宏与 export | `defineProps / defineEmits / defineExpose / export` | 全部 **0**（原本就没有 props：`router/index.js:37` 的 `review/:id` 无 props）✅ |
| 7 文件互 import | 只允许「根 → U1..U6」与「U3 → U1」 | **横向 import（U1–U6 之间）= 0**；实际内部边 **7 条**：`useReviewPage → reviewPure/useReviewData/useReviewNav/useObjectiveCompare/useReviewAiPrompt/useReviewActions`（6）+ `useReviewNav → reviewPure`（1）⇒ 与方案 §2.2 的有向图**逐边一致**、两层星形、无环（D4） |
| 单一创建点 | `editorRefs` / `shellMq` / `fetch` / `useRoute()` / `useConfirm()` / `route.params.id` 各 1 次；`useRouter(` 0 | **1 / 1 / 1 / 1 / 1 / 1 / 0** ✅ |
| 无第二真值源 | 52 个解构名全部来自**唯一**一次 `useReviewPage()` 调用 | ✅ |
| `v-model` 目标 | `v-model:value="reviewScores[` = 1、`v-model:value="reviewFeedbacks[` = 1、`v-model:open="promptModalOpen"` = 1 | **1 / 1 / 1** ✅ |
| 组件 import 仍在 `.vue` | `components/CodeEditor.vue` / `components/StatusTag.vue` | **1 / 1** ✅ |
| 真 import（constraints §3-12） | `reviewPure.js` 真 `import()` = 9 个具名导出；6 个 `use*` 均为 named + default function | ✅（**未采信 `node --check`**；其余模块的真 import 经装置（副本逐字节相同、仅 `api/request.js` 替身）与 `vite build` 全图解析双重覆盖） |

### 8.3 54 个模板可见名 → `.vue` 落点（逐名，0 缺失）

    destructure 行 246–256（每行 5–8 名）：
    247  data, displayStudentNo, getSub, pageStatus, q, showMaterial, studentName, subQuestions
    248  publishingAll, regrading, reviewFeedbacks, reviewScores, reviewingAll
    249  isPracticeMode, materialText, safeMaterial, totalAiScore
    250  activateAnchor, collapsedSqs, contentRef, getNavLabel, scrollTo, sqBoxClass, sqResultColor, toggleCollapse
    251  getItemRefStr, getItemStudentStr, isItemAnswered, isItemCorrect, itemResultColor
    252  promptData, promptLoading, promptModalOpen, promptSubTitle, showPrompt
    253  formatCode, publishAll, regrade, reviewAll, setEditorRef, useAiFeedback
    254  collapsed, isCodeStem, itemTypeColor, itemTypeLabel, itemTypeTagClass, narrow, panelOpen, safeSqContent
    255  subStatusColor, subStatusTagClass, subStatusText, onPageMounted, onPageUnmounted
    240  import CodeEditor from '../../components/CodeEditor.vue';
    241  import StatusTag from '../../components/StatusTag.vue';

⇒ 54 名（51 点式 + 2 方括号式组件 + 1 string ref）**全部有落点，缺失 0**。

## 9 门禁实跑 + 行数实测

| 门禁 | 结果 |
|---|---|
| `node scripts/gates/arch-metrics.mjs` | **PASS** — `layerViolations 0/0`；**`unmigrated 44/44 持平`**；**`godfileOver800 4 → 3`** ✅（GodFile 列表已无 ReviewDetail）；**`>500 观察带 14 → 14（不变）`** —— 如实登记，**不是 13**（模板 236 + 样式 359 = 595 行不可触碰） |
| `node scripts/gates/cycle-check.mjs` | **PASS** — 96 文件 / 214 边（根 = `server/src`）；**SCC 0**、自环 0 |
| `node scripts/gates/cycle-check.mjs --root client/src` | **PASS** — **99 文件 / 244 边**；**SCC 0**、自环 0（方案预估 ≈243 ⇒ 实测 **244**，+1，登记 D8；**参数确实生效**：报头打印 `根目录 client/src`） |
| `node scripts/gates/hard-metrics.mjs` | **PASS 0/0/0**，扫描面 41 文件 —— style 块与模板逐字节未动 ⟹ **逐字不变** |
| `node scripts/gates/bind-check.mjs` | 零违规（默认根 = `server/src` + `server/test`，**边界如实登记：其面不含 client**） |
| `node scripts/gates/bind-check.mjs client/src` | **BINDING VIOLATIONS 0** — **59 模块 / 96 具名绑定**（方案预估 59/≈90）；唯一 external = `main.js → ./App.vue`（既有） |
| `npx vite build --outDir /tmp/split-step7-build --emptyOutDir` | **exit 0**（`built in 23.55s`；**未重建 `client/dist`**） |
| `_ctx` 全量扫描（40 个 `.vue`） | **10 个有命中，与改前逐文件相同**（`$slots` ×3 / `$emit+passed` / `$router` ×6）；**ReviewDetail = 唯一名 `$router`、1 次** ✅ |
| 行数实测 | `ReviewDetail.vue 620`（988 → 620，−368）；新文件 59/98/75/100/41/101/84 = **558 行** |
| `git status --porcelain` | `M client/src/views/teacher/ReviewDetail.vue` + `?? client/src/composables/review/` ⇒ **无越界文件** |

## 10 方案偏离登记（逐条给依据，供 C 复核）

| # | 事项 | 处理 | 依据 |
|---|---|---|---|
| **D1** | 方案 §6「每批一个提交」 | **未执行任何 git 写操作**（硬约束优先）；批次以单元归类 + 整步判据留痕代替 | Captain 本轮硬约束；整步判据严格强于分批判据 |
| **D2** | 方案 §4.3 的 L1-d 迁移谓词 | **补 `f === t` 分支** | 原式会把 4 个**未变**的 `setup-const` 判成非法迁移 = **把正确重构判 FAIL**（本轮实测复现） |
| **D3** | 方案 §4.4 的正控 PC3/PC4（「删注入」） | 实测 **0 命中** ⇒ 改为**有意义的正控**（PC3' 删 `reviewPure` 具名 import = 9 命中；PC4' 删 `itemTypeLabel` import = 1 命中）+ 两条**负控**（NC1 `fetch` / NC2 漏传参）+ ⑤ **M5** 运行时反证 | 方案 §4.4-B-3 / DoD ④ 已登记：「被调方声明了形参、但调用方没传」在 ④ 下**不可见** —— PC3/PC4 恰好落在这个盲区里，**不是**有效的正控 |
| **D4** | Captain 任务书「7 个新文件互相 import 0」 vs 方案 §2.2 的有向图（含 `U3→U1`、`U7→U1..U6`） | **按方案执行**：横向 import（U1–U6 之间）= **0**；内部边 7 条**全部**是「根 → 单元」或「单元 → 纯叶子」 | 方案为权威且明文给出有向图与无环论证；`cycle-check --root client/src` 实测 **SCC 0** |
| **D5** | 非模板可见名（`subMap` / `activeAnchor` / `parsedAnswers` / `getStudentItem` / `fetch` / `editorRefs` / `getItemKey` / `studentNo` / `schoolName`）不进 `.vue` 解构 | 仓库 `.vue` 保持最小面（54 名）；**⑤ 装置在「派生页」里额外解构这 9 个名字**以做黑盒断言（仓库文件不受影响）；**T8b** 另做 U6 直连断言 | 方案 §2.2「U6 6 个模板可见名」+ K5「保留声明与返回」；`.vue` 面越小越不易出错 |
| **D6** | ⑤ 装置的替身 | `api/request.js`（`import.meta.env` 是 Vite 构建期替换）、`Transition` / `vShow`（真 DOM 专属）、`vue-router` / `ant-design-vue` / `dompurify` / `useConfirm` / 2 个组件 | Node ESM 无 `import.meta.env`；**改前根对称施加同一替身**，故前后可比；7 个模块副本**零改写、sha256 全等** |
| **D7** | `.vue` 行数 | 实测 **620**（方案估 617–625 ✅）⇒ `over500` 实测 **14（不变）**、`godfileOver800` **4 → 3** | 与方案 §2.2 / §9-2 的预判一致；**未出现 13** |
| **D8** | `cycle-check --root client/src` 边数 | 实测 **244**（方案预估 ≈243，+1） | constraints §3-10「一律以实测为准」；SCC 仍为 0 |
| **D9** | 像素门禁 / axe / L2 | **未执行** | A 档：模板 + 样式**逐字节相等**严格强于像素相等；`axe-core` 全仓缺失 + 禁联网；L2 需真后端/真浏览器且 `tests/` 被冻结 ⇒ **属 C**（本报告 §6 已覆盖其主干事实） |
| **D10** | U1 的导出形态 | 文末 `export { … }`（沿用 `questionPure.js` 先例），**不是**逐函数 `export `前缀 | 使 65 个声明块**全部逐字节相等**（比方案的白名单口径更严） |
| **D11** | `reviewPure.js` 无 `default` 导出 | 与 `questionPure.js` 一致（只有具名导出）；6 个 `use*` 各有 `default` | 沿用本仓既有先例 |

## 11 未执行的验证与原因（诚实登记）

| 项 | 状态 | 原因 |
|---|---|---|
| 像素门禁 `scripts/gates/pixel-diff.mjs` | **不需要（A 档）** | 模板 + 样式逐字节相等；且其 FIXTURES 无 `/api/teacher/submissions/:id`（跑也必然 exit 2） |
| axe | **不可用** | 三处 node_modules 全缺 + 禁联网 |
| `page.accessibility.snapshot()` 对拍 | **未跑（属 C）** | 模板字节相同 ⟹ ARIA 树必然相同；需真浏览器 + 真后端 |
| L2 Playwright（既有 `e2e-03-teacher-review`） | **未跑（属 C）** | `tests/` 冻结 + 需真后端/真库；⑤ 装置已覆盖 U1–U8 主干（§6.1 / §6.3） |
| 全量后端回归 `unblock-g2.sh` | **未跑（C 的职责）** | 本步**不动 server/** ⇒ 应逐字不变（零成本哨兵） |
| `client/dist` / `tests/` / 其它 `.vue` / `scripts/gates/` | **未触碰** | 构建一律 `--outDir` 到仓库外；改动面见 §0 / §9 |
| `node --check` | **未作为任何「通过」的证据** | constraints §3-12；改用 ④ 扫描 + 真 `import()` + ⑤ 运行时对拍 |

## 12 给 Agent C 的验证指令（独立复现，**不复用 B 的脚本**）

    cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
    git rev-parse HEAD            # 期待仍为 aa295058…（改前锚点 = 本步锚点，执行期间未前移）
    shasum -a 256 client/src/views/teacher/ReviewDetail.vue     # 期待 f1cf9eeb…（改前 d7595832…）
    git show HEAD:client/src/views/teacher/ReviewDetail.vue | shasum -a 256   # 期待 d7595832…
    wc -l client/src/views/teacher/ReviewDetail.vue client/src/composables/review/*.js
    #   期待 620 / 59,98,75,100,41,101,84

    # V1 L0（★切 2 段；★两侧区间各自从 descriptor 取，禁止写死行号；先断言切片非空）
    #   改前：template 1-236 / style 630-988；改后：template 1-236 / style 262-620
    #   判据：两侧 template/style 切片 byte-equal（12100 B sha ae9765b7… / 13959 B sha 470d1e50…）、
    #         descriptor.styles.length===1、scoped===true、template.content / styles[0].content 相等

    # V2 L0b（65 块逐声明子串命中）：babel AST 顶层语句 loc（去 8 import + 2 hook）→
    #   在「7 新文件 + 改后 .vue script 段」并集里各命中恰好 1 次 ⇒ 65/65、缺口 0、重复 0

    # V3 L1（★权威口径 = 冻结的改前 bindingMetadata；★名字集合必须点式 + 方括号式两遍）
    #   判据：frozen 口径逐字节相等；53 名全等（51 点式 + 2 方括号：CodeEditor/StatusTag）；
    #         _ctx 名集合 === ["$router"]（★基线 1，不是 0）；unref( = 0；styles 数组相等且 1 块；
    #         非法迁移 = []（★谓词必须含 f===t，否则 4 个未变的 setup-const 会假 FAIL）
    #   ⚠️ own 口径必然 false（2 行差异）—— 必须按 §4 归类为「同类」（patchFlag 多重集两侧逐项相同）

    # V4 ④ 自由标识符（scope.crawl 两遍）：8 个对象全 0；★正控必须命中：
    #   删 U1 的 DOMPurify import → 1；U7 删 reviewPure 具名 import → 9；U3 删 itemTypeLabel import → 1
    #   ★负控（已知盲区，期望 0，由 ⑤ 兜底）：fetch 改名 → 0；U7 漏传 route → 0

    # V5 ⑤ 真运行时对拍（装置形态见 §6；B 的装置在 /tmp/rd7/rt，C 应自建）
    #   必查：T4 调用序（★按源标识命名！）、T5 清理序 + 净增 0、T6 早退、T7 两态、
    #         T8 format() 恰好 1 次（editorRefs 单份的判别式）、T9 请求数 1 + 逐字段 + ?? / || 语义、
    #         T10 reactive 单实例、T11 状态族 6 组、T12 守卫 / confirm options / PUT body、T13 unhandled rejection
    #   ★变异反证 6 条（M1 双 editorRefs / M2 fetch 换序 / M3 模式读错 / M4 删清理 / M5 漏传 route / M6 第二 data 源）
    #   ★惰性对照：不变异时两次运行 0 差异

    # V6 门禁（期待 arch 0 / 44 / 3 / 14 · cycle 0（默认与 client/src）· hard 0/0/0 · bind 0（含 client/src））
    node scripts/gates/arch-metrics.mjs; node scripts/gates/cycle-check.mjs
    node scripts/gates/cycle-check.mjs --root client/src; node scripts/gates/hard-metrics.mjs
    node scripts/gates/bind-check.mjs; node scripts/gates/bind-check.mjs client/src
    cd client && npx vite build --outDir /tmp/split-step7-build-c --emptyOutDir; cd ..
    #   ★并确认 client/dist/index.html mtime 未被更新

    # V7 既有缺陷照旧（**不是修它**）：K1 getItemKey 仍在（U1 导出）；K2 fetch 未 await / 未 catch；
    #   K3 卸载不取消 in-flight；K4 setEditorRef 的 if (el) 守卫 ⇒ 条目永不删；K6 addListener 兼容分支仍在；
    #   K5 contentRef 仍是模板 string ref

## 13 结论

- **硬约束达成**：模板与样式**逐字节未动**（L0 两段，逐侧 descriptor 取区间）；对外契约与 UI 行为不变（54 名模板可见面逐名有落点，`_ctx` 基线未变）。
- **本步唯一可承诺的判据收益达成**：`godfileOver800 4 → 3`。
- **观察带如实登记**：`over500 14 → 14（不变）` —— 与方案预判一致，**不是 13**。
- **三条最要紧事项**均有「静态 + 运行时 + 变异反证」三重证据（§7）；其中 `editorRefs` 单份（会让三类静态判据全盲的**静默失效点**）由 ⑤ T8 / T8b + M1 钉死。
- 方案 U1–U8 全部收敛（§6.3）；D1–D11 偏离已逐条登记。
