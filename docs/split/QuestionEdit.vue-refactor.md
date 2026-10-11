# QuestionEdit.vue 拆分实施报告（step 6 · B 侧）

- **step**: 6 ｜ **agent**: B（唯一写者）｜ **日期**: 2026-10-11
- **方案**: `docs/split/QuestionEdit.vue-plan.md`（642 行，A 侧）｜ **DoD**: `docs/plan/2026-10-11-godfile-split-plan.md` §5（**client A 档 = 5 条判据**，不需像素门禁）
- **约束**: `docs/pipeline/project-constraints.md` 17 条（第 12 条：`node --check` 不作为通过证据）+ 本轮 Captain 三条最硬要求（模板/style 逐字节不动 / 三处静默失效点 / 禁 composable 互 import）
- **范本**: `docs/split/ProjectQuestionEdit.vue-refactor.md`（step 5，同 A 档 client）

## 0 版本锚点与产物指纹（★被测源码树留痕）

| 项 | 实测值 |
|---|---|
| 被测源码树（绝对路径） | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**，非 `../Exam-DeepSeek-ui`） |
| 冻结锚点（改前） | `b94407f84f44deb87e6fb6efbe2f1ad45290112c`（= 方案锚点）；**执行期间 HEAD 前移到 `cb1304cc`**（Captain 的两条提交），但 `git show HEAD:client/src/views/teacher/QuestionEdit.vue` 的 sha256 仍为 `7033a4d5…` = 冻结副本 ⇒ **改前基准仍有效** |
| `QuestionEdit.vue` **改前** | **983 行** / sha256 `7033a4d5ed596d87d698ec2233fdd865094a107f7f07caa082c8b2b93098187c` |
| `QuestionEdit.vue` **改后** | **466 行** / sha256 `46b93dd7c1db7a423ae71a2f734ec61061896c9a56e7f7c9b64c2be0633a7399`（template 1–312 + script 314–337（**24 行**）+ style 339–466） |
| 冻结副本 | `/tmp/q6b/before/QuestionEdit.vue`（`cmp` 与工作树相同） |
| 构建产物 | `/tmp/split-step6-build/`（**未重建 `client/dist`**：其 `dist/index.html` mtime 仍为 `2026-10-10 21:55`） |
| 改动面（B 的产物） | `M client/src/views/teacher/QuestionEdit.vue` + `?? client/src/composables/question/`（**12 文件**）+ 本报告。**未触碰** `client/src/composables/submit/`（另一 Agent 的写范围）、`client/dist`、`tests/`、`scripts/gates/`、其它 `.vue`、`package.json` |
| 工具链 | node v24.19.0 · `vue 3.5.34` · `compiler-sfc 3.5.34` · `babel/parser 7.29.8` + `babel/traverse 7.29.8`（全部取自 `client/node_modules`，**未联网安装任何依赖**） |
| 生成装置 | `/tmp/q6b/gen.mjs`（由冻结源**按行区间切片**拼装 12 文件 + 新 `.vue`，产出 `manifest.json`/`coverage.json`）· `check3.mjs`（L0/L1/④/结构）· `/tmp/q6b/rt/`（⑤ 运行时对拍）· `mutate.mjs`（变异反证） |

## 1 交付物（12 个 composable + 1 个改造后的 .vue）

| 文件（`client/src/composables/question/`） | 单元 | 批次 | 行数 | sha256（前 16） |
|---|---|---|---|---|
| `questionPure.js` | U1 纯叶子（15 导出） | B1 | **88** | `bcb8e163c8ce4bab` |
| `useQuestionForm.js` | U2 form 所有权 + hasMaterial | B2 | **23** | `ec6697ba7b4d700d` |
| `useQuestionSettings.js` | U5 设置 + 分类模式迁移 | B2 | **76** | `efa607669c5fa820` |
| `useSubQuestionList.js` | U3 小题状态机（形态真值源） | B2 | **101** | `f25a16eb86718ab0` |
| `useObjectiveItems.js` | U4 客观题 items + 预览联动 | B3 | **41** | `cbd7cce1e03dac2f` |
| `useDraftSync.js` | U9 草稿自动保存接线 | B3 | **29** | `47876624e0b09772` |
| `useAiReference.js` | U7 AI 参考答案（aiTag 所有权） | B3 | **61** | `89e64244c71423de` |
| `useExamImport.js` | U6 上传/SSE 解析/填充 | B4 | **134** | `cfc9bec5c3e5badb` |
| `usePromptPreview.js` | U8 AI 提示词预览 | B4 | **39** | `80c7d516b26245bb` |
| `useSaveQuestion.js` | U10 保存守卫 + PUT/POST | B4 | **105** | `f9e39d30728c84ff` |
| `useLoadQuestion.js` | U11 加载已有题目 | B4 | **41** | `ed9c35bcb8a95086` |
| `useQuestionEditPage.js` | U12 接线根 | B5 | **81** | `3e2edfe37c63d28a` |
| `client/src/views/teacher/QuestionEdit.vue` | — | — | **983 → 466** | `46b93dd7c1db7a42` |

**12 个新文件全部 < 250 行（最大 U6 = 134）**，无一进入 >500 观察带；`.vue` **466 行**（模板 312 + script 24 + style 128 + 分隔空行 2）。

### 1.1 行数实测与方案预估对照

| 指标 | 方案预估 | 实测 | 结论 |
|---|---|---|---|
| 12 个新文件 | 35–140 行 | **23–134 行**（合计 819） | ✅ 全部 < 250 |
| script 块 | 541 → ≈45–60 | **541 → 24**（314–337） | 优于预估 |
| `.vue` 总行数 | ≈490–505（**跨 500 线**） | **466** | ✅ **实测落在 500 线下方** |
| GodFile（>800） | 5 → 4（唯一可承诺项） | **5 → 4** | ✅ `arch-metrics.mjs` 实跑一致 |
| 观察带（>500，含 >800） | 「交实测」 | **15 → 14** | ✅ 实测下降（如实登记，非承诺） |

## 2 执行方式与分批记录

**Captain 指令**：B1 纯叶子 → B2 form/settings/小题状态机 → **B3 客观题 + 草稿 + AI（调用序必须 U4→U9→U7）** → B4 上传/解析/保存/加载/提示词 → B5 接线根 + 平移 2 个 hook + 删内联；**内联实现的删除放最后**。

**实际执行（与 step 2/5 同构，可复核）**：

1. `git show HEAD:…` 冻结改前文件 → `/tmp/q6b/before/QuestionEdit.vue`（sha `7033a4d5…`，与工作树 `cmp` 相同）；
2. `/tmp/q6b/gen.mjs` **从冻结源按行区间切片拼装** 12 个新文件与新 `.vue` —— **搬移块不是手抄**（这是 §3 逐字相等的**构造性保证**）；
3. 同一脚本逐行记录 `dest:行 → src:行` 映射（`manifest.json`）与覆盖核算（`coverage.json`）；
4. 12 文件 + `.vue` 一次落盘（`.vue` 的内联实现即在这一次重写中删除 —— 唯一一次触碰 `.vue`）；
5. 落盘后跑 L0 + L1 + ④ + 结构自检 + ⑤ 运行时对拍 + 变异反证 + `vite build` + 四门禁。

> **批次编号沿用方案 §6 的归类**（B1 叶子 / B2 状态基座 / B3 客观题+草稿+AI / B4 上传保存加载 / B5 接线根），用于对照方案与给 C 定位；因生成是**单遍构造性**的，**验证按整步一次性做**（整步判据严格强于分批判据：同一份 manifest 覆盖 13 个文件的全部搬移行）。

| 批 | 文件 | 完成后自测（全部实跑） |
|---|---|---|
| **B1** | `questionPure.js` | 真 `import()` 一次：`Object.keys` = 15 个具名导出；62 行切片逐字相等 |
| **B2** | U2 + U5 + U3 | watch@357/@367 整体搬入 U3（**注册序仍最先**）；**U5→U3 晚绑定**在本批建立 |
| **B3** | U4 + U9 + U7（**调用序 U4 → U9 → U7**） | 运行时实测注册序 = `357 → 367 → 482 → 699 → 701`（§6-T4）；`useDraftAutosave` 调用点迁入 U9，**仍在 setup 同步阶段恰好一次**（T12） |
| **B4** | U6 + U8 + U10 + U11 | 四单元**均不含 watch**（对 5 个 watch 的注册序零影响）；T6 守卫 5 分支 + PUT/POST 实跑 |
| **B5** | U12 + 接线 + 删内联 | `.vue` 只留 6 行 import + 8 行解构 + 2 行 hook 注册；**5 个 watch 全部在 setup 同步期注册**（T4/T8 实测） |

> **D9（登记）**：本轮硬约束为「**不做任何 git 写操作**」，故方案 §6 的「每批一个提交」**未执行**；批次以单元归类 + 同一套判据的整步实测留痕代替。

## 3 L0 · 切片字节判等（★铁律：模板与样式一个字节都不许动）

**本文件只有 1 个 `<style>` 块** ⇒ **L0 切 2 段**（不是 step 5 的 3 段）。

```
===== L0（2 段）=====
descriptor.styles.length            before=1 after=1            （自证"几个 style 块"）
descriptor.template.content         byte equal: true
descriptor.styles[0].content        byte equal: true | scoped before/after = true/true
S1 template      1-312     BYTE_IDENTICAL bytes=22466 sha256=485805a10b3f2360…
S2 style scoped  856-983 → 339-466   BYTE_IDENTICAL bytes=9513 sha256=4ab0f0a571c27ca7…
边界自证: 首行 '<template>' / '<style scoped>'，末行 '</template>' / '</style>' ✓
```

- **块边界**：`<template>`=1 / `</template>`=**312** 不变；`<script setup>`=**314** 不变；`</script>`=854→**337**；`<style scoped>`=856→**339**；`</style>`=983→**466**（**只有 script 段的行号变化**）。

### 3.1 声明块 sha256 判等（方案口径「104 块」的机器实测）

- **实测块数 = 99**：AST 顶层 **VariableDeclarator 97** 个（多声明一行如 `const activeIndex = ref(0); const slideDir = ref(1); const showMaterial = ref(false);` 计 3 块）+ **2 个 hook 调用语句**。方案 §2.2 的「104」是它自己的清单口径（含它提议新增的包装与访问器），**不是脚本内既有声明数** —— 以机器实测为准（constraints §3-10）。
- **95/99 块逐字节相等**（sha256 全等，0 处不等）。
- **2 个块受登记改写**（内部含 §9-D2 的 3 行改写）：`:692`（`draftSaver` 调用块，含 `:693/:695`）、`:849`（`beforeUnloadHandler`）。两块内的改写文本已**逐字落点核对**。
- **2 个 hook 语句为结构性重定位**：`:850/:851` 的回调体逐字平移到 U12 的 `onPageMounted(){load();window.addEventListener('beforeunload',beforeUnloadHandler);}` / `onPageUnmounted(){window.removeEventListener('beforeunload',beforeUnloadHandler);saveDraft();}`（内层语句逐字，已核验落点存在）。

### 3.2 覆盖核算（script 316–853 的每一个非空行都有归宿）

```
非空行 = 494 = 逐字搬移 477 + import 行 12 + 受登记改写 3(:693/:695/:849) + hook 重定位 2(:850/:851)
覆盖缺口 = 0 ；同一源行有第二个逐字副本 = 0
```

**搬移 477 行逐字节相等**（`manifest.json` 的 `dest:行→src:行` 全量对拍，0 处不等）。

## 4 L1 · 编译级对拍（★本步最锋利的机器判据，口径=**冻结的改前 bindingMetadata**）

```
===== L1（权威口径：冻结改前元数据）=====
sanity_template_source_byte_equal      = true
template_compile_frozen_byte_equal     = true      bytes 82471 / 82471
$setup 点式名（before/after）           = 59 / 59   集合完全相同 | missing=[] added=[]
$setup["X"] 方括号名                    = 5 / 5     完全相同（CodeEditor, CodeOutlined, FormPage, InboxOutlined, RichEditor）
模板 string ref                        = ["tabsScrollRef","codeEditorRef"]（2 处，名字未变）
_ctx. 出现次数                          = 0（改前 0）
unref( 出现次数                         = 0
descriptor.styles {scoped,content} 相等 = true
非法 binding 迁移（f→t，f≠t 且 t≠setup-maybe-ref）= []
bindings 消失 51 个（迁入 composable）；新增 3 个（useQuestionEditPage / onPageMounted / onPageUnmounted）
frozen 口径 patchFlag 多重集            = 逐项相同（TEXT26/CACHED52/STABLE88/PROPS34/CLASS2/STYLE3/KEYED9/STABLE5/DYNAMIC9/DYNAMIC_SLOTS1）
```

### 4.1 ★为什么必须用冻结口径（本步实测复现了方案的判断）

| 口径 | 结果 |
|---|---|
| **冻结改前元数据**（权威） | **逐字节相等**（82471 字节） |
| own-bindings（诊断） | **不等**：84 行差异；patchFlag 多重集 PROPS **34→41**、KEYED_FRAGMENT **9→10**、STABLE_FRAGMENT **5→4**；`$setup.` 引用总数 **129→130** |

**84 行差异的逐类归类（全部落在方案 §4.3 表的「同类」栏）**：

1. `_cache[N]`/`_hoisted_N` 编号整体位移 —— 编译器缓存槽位重排，纯形式；
2. 事件/属性从静态变为 `8 /* PROPS */, ["onClick"]` 列表（+7 处）—— 处理器引用是**同一函数对象**，永不产生 patch；
3. **1 处 handler 包装**：`onScroll: $setup.onTabsScroll` → `_cache[8] || (_cache[8] = (...args) => ($setup.onTabsScroll && $setup.onTabsScroll(...args)))` —— 这正是 `$setup.` **129→130** 的唯一来源（同一函数对象，语义不变）；
4. **1 处片段类 flag**：`langs` 的 `v-for`（模板 :191）`64 STABLE_FRAGMENT` → `128 KEYED_FRAGMENT`。**根因已定位到编译器源码**（`compiler-core.cjs.js` 的 `processFor`）：

```js
const isStableFragment = forNode.source.type === 4 && forNode.source.constType > 0;
const fragmentFlag = isStableFragment ? 64 : keyProp ? 128 : 256;
```

改前 `langs` 是 `setup-const`（constType>0 ⇒ STABLE），改后是 `setup-maybe-ref`（constType=0 ⇒ 因存在 `:key="l"` 而落到 KEYED）。**该 v-for 的源是模块级常量数组，永不重排**，两种 diff 路径产出 DOM 必然相同；随之变化的 `disableTracking` 只影响「本块是否被父块动态子节点追踪」，而该分支恒为常量、从不更新。**运行时对拍（§6）已用真渲染树证明前后逐字段相同**（含本处）。
⚠️ **若用 own 口径当判据，会对本次正确重构误报 FAIL** —— 与方案 §4.3 的实测一致。

**判据（4 条，缺一不可）**：L1-a 冻结口径模板编译逐字节相等 ✅ ｜ L1-b 59 名一个不漏、`_ctx.`=0、`unref(`=0 ✅ ｜ L1-c styles 数组（含 scoped 标志）相等且块数=1 ✅ ｜ L1-d 非法 binding 迁移=[] ✅。

## 5 ④ 自由标识符扫描（**两遍 / `scope.crawl()` 口径**）

**实现**：`babel/parser`（`sourceType:'module'`）→ `traverse(ast,{Program(p){p.scope.crawl()}, ReferencedIdentifier(p){…}})` → 未绑定且不在紧凑全局白名单 ⇒ 计为自由标识符。**白名单不含任何业务名**。

```
12 个新模块                : 全部 0 违规 ✅
.vue 的 <script setup> 正文 : 0 违规 ✅
PC1 删 'import DOMPurify'   → ["DOMPurify@34"]          命中 ✅
PC2 saveDraft 改名（留调用）→ ["saveDraft@72","saveDraft@76","saveDraft@97"]（3 个调用点）命中 ✅
PC3 U4 注入清单删 objectiveSettings → ["objectiveSettings@16"] 命中 ✅
PC4 U12 注入清单删 hasDraftChanged  → ["hasDraftChanged@44","hasDraftChanged@61"] 命中 ✅
干净树                      : 0 命中 ✅
```

★**扫描器在本次真的抓到 1 个缺陷（构造期，已修）**：第一版 `useQuestionEditPage.js` 的 `beforeUnloadHandler` 用了 `hasDraftChanged()` 但**漏了解构**，且 `return` 对象里含 `aiGenerateRefs`/`genRunning`/`markDraftChanged`/`fillFromParsed` 四个未绑定名 —— 与 step 5 的 E2（漏注入）**同一形态**，`node --check` 与 `vite build` 都放行。⇒ **本项判据不是形式主义**。

## 6 ⑤ 真运行时对拍（真 compileTemplate 产物 + 真 Vue createRenderer + 自写 nodeOps + 仓库外替身）

> 本仓**无 jsdom**（方案 §4.1 实测）⇒ 沿用 step 5 已实证的**装置 A**：`/tmp/q6b/rt/`（仓库外，无网络、无端口、不碰 `tests/`、不碰 `client/dist`）。

**装置组成**（自证见 §6.3）：

- 12 个模块的**逐字节副本**（**从仓库复制**，sha256 11/12 与仓库全等；`useExamImport.js` 仅 1 处**登记替身**：`import.meta.env.VITE_API_BASE_URL` → `globalThis.__VITE_API_BASE_URL`，**改前根对称施加同一替身**，故前后可比）；
- **接线根 `page.mjs` 由真 `.vue` 的 script setup 原文派生**（import 行重指向替身，其余逐字，return 面 = 63 名）；**改前根 `before.mjs` 由冻结 `.vue` 的 `__returned__` 原文派生**（由 `compileScript()` 产物提取）；
- **模板 = 真 `compileTemplate()` 产物**（own-bindings，即构建真实产物），用**真 vue 3.5.34 的 `createRenderer` + 自写 nodeOps** 挂载；`Transition`/`TransitionGroup` 改直通（无 DOM）；
- **真生命周期**：`onMounted`/`onBeforeUnmount`/`onUnmounted` 由真 Vue 调度（wrapper 记录注册序）；`useDraftAutosave` 用**仓库真实现**（逐字节副本 + 记录 options 的薄包装）；
- 替身：`vue-router` / `ant-design-vue`（message 记录器）/ `dompurify` / `mammoth` / `xlsx` / `api/request`（记录器）/ `useConfirm`（记录器）/ 3 个组件替身（`CodeEditor` 暴露 `format()`）/ 极简 document + window。

### 6.1 断言结果：**20/20 通过** —— **改前根与改后根各跑一遍**

| # | 事实 | 实测（改后 = 改前） |
|---|---|---|
| **T1** | 接线根返回面 | 59 个 $setup 名 + 2 个 string ref **一个不漏**；渲染树产出 1 个根子节点；**0 条** "was accessed during render but is not defined" |
| **T2** | 类型事实（运行时） | 逐名对拍 61 个 `isRef`/`isReactive`/`typeof`/`isArray`（前后**逐字段相同**）；`saving.value=false`；`form` 是 reactive 非 ref（键集相同）；`langs` 是 18 元素数组；`questionKind=null`、`sqKind='subjective'` |
| **T3** | 双形态求值 | 主观题树 sha `71c00200…`（含 `.content-item`，**无** `.obj-add-bar`）；客观题树 sha `225763bc…`（含 obj bar，**无** content-item）；两形态标签统计（a-form-item 10→6、a-select-option 21→3 等）**前后逐字段相同** |
| **T3** | `sqDisplayLabel` | flat→第1小题 单选；group→第1小题 |
| **T3c** | **上传→SSE→`fillFromParsed` 反向改写** | `questionKind: null→'subjective'`、`subQuestions = ['objective:1','subjective:10']`、`showUploadExam: true→false`（**跨形态重建路径实测**） |
| **T4** | **5 个 watch 的注册序** | `["watch@357:subQuestions","watch@367:form.sqScore","watch@482:objectiveItems.score","watch@699:autosave","watch@701:aiTag-clear"]` —— **357 < 367 < 482 < 699 < 701 逐位相符**（按源标识命名，不是按注册序号） |
| **T5** | 同 tick 触发序 | 写 `form.sqScore` → `[367, 699]`；写 `form.referenceAnswer` → `[699, 701]`（`form.sqScore`/`form.referenceAnswer` **各被 2 个 watch 监听**这件事在两形态下行为一致） |
| **T6** | 保存守卫 5 分支 + 2 弹窗 + 路由 | `1:warn:请输入题目标题` → `2:warn:请至少添加一道小题` → `3:warn:第1题 主观题尚未填写题目内容` → `4:confirm:1 道主观题未设参考答案/AI 生成参考答案/暂不生成/w640` → `5:warn:第1小题（编程题） 尚未设置分值。…` → `6:confirm:确认保存/确认保存/返回修改/w640` → `7:req:put /teacher/questions/1` → `9:nav:["/teacher/questions"]`（**文案逐字、顺序逐位、body 逐字段**） |
| **T6b** | `isEdit=false` 分流 | `POST /teacher/questions`（与 T6 的 PUT 成对） |
| **T7** | **卸载清理序** | oplog = `["clearTimeout","doc.removeEventListener:visibilitychange","win.removeEventListener:beforeunload","saveDraft"]` **逐位相符**；卸载前存活定时器 **1 → 卸载后 0**；`visibilitychange`/`beforeunload` 监听**净增 0**；控制台 0 error |
| **T8** | **hook 队列** | `["onBeforeUnmount","onMounted","onUnmounted"]` —— **各恰好 1 个**，`beforeUnmount`（来自 `useDraftAutosave`）在最先，跨类顺序固定 |
| **T9** | **2 个 string ref 真绑定** | `codeEditorRef.value != null` 且 `tabsScrollRef.value != null`；`formatCode()` 使替身 `CodeEditor.format()` **恰好调用 1 次**（失绑则 0） |
| **T10** | **`sqKeyCounter` 单实例** | 连续 `addSub` → `_key` 序列 `3,4 → 3,4,5 → …` **唯一且严格递增** |
| **T10b** | **`draftChanged` 单实例** | 真 2s 防抖：第一次改动静默保存（`statusText='已保存'`、`sq.title='X1b'`）后 `enabled()===false`；第二次改动**未再保存**（`sq.title` 仍 `X1b`） |
| **T11** | **SSE 中途卸载（既有行为）** | 上传中卸载：不抛错、**不新增 error 类型**、`uploadAnalyzing` 置位与 promise 悬挂状态**与改前逐字段相同**（未加 `AbortController`，未"顺手修"） |
| **T12** | `useDraftAutosave` 契约 | 调用**恰好 1 次**、`delay === 2000`、`save`/`enabled` 均为函数、干净态 `enabled()===false` |
| **惰性对照** | 什么都不驱动 | 仅 1 次初始 `GET`；0 warn / 0 confirm / 0 nav / `enabled()===false`（**证明没有凭空多出的保存或交互副作用**） |

**★改前 vs 改后**：`node run.mjs before` 与 `node run.mjs after` 各 **20/20 PASS**，**77/77 记录字段逐字段（JSON）相同，差异 0**。

### 6.2 ★变异反证（每个变异都必须被装置抓到）

| 变异 | 手法 | 结果 |
|---|---|---|
| **M1** | U12 里把 `useAiReference` 调到 `useDraftSync` 之前（U7↔U9 换序） | ✅ **T4 失败**：注册序变为 `[…,701,699]`；**T5 失败**：`referenceAnswer` 触发序变 `[701,699]` |
| **M2** | 删掉 `subs.bindShared({ aiTag, previewFocusKey })` | ✅ 装置**中止并报错**：`TypeError: Cannot set properties of undefined (setting 'value')` @ `loadSq` |
| **M3** | U9 的 `save` 里删掉 `clearDraftChanged()` | ✅ **T10b 失败**：第二次改动仍保存（`sq.title` 变 `X2`、`enabled()` 仍 true） |
| **M4** | `newSq` 内再声明一个 `sqKeyCounter`（模拟第二份计数器） | ✅ **T10 失败**：`_key` = `[1,1,1,1,1]`（重复） |
| **M5** | 把 `useDraftAutosave()` 移进 `onMounted`（脱离 setup 同步期） | ✅ 装置**中止并报错**：`statusText` 计算属性取 `draftSaver.status` 得 undefined（hook 未注册的同一根因） |
| **M6** | U6 内再造一个 `questionKind` ref（**第二真值源**） | ✅ **T3c 失败**：`questionKind` 停在 `null`，上传的跨形态改写到不了模板 |

（全部 `exit=1`；装置不"通吃"，也不"全否"。）

### 6.3 装置自证

- 12 个模块副本与仓库文件 **sha256 逐一对拍**（11 全等 + 1 处登记替身）；`page.mjs`/`before.mjs` 由两版 `.vue` **原文派生**；
- **两次同场景运行逐字节相同**（before 与 after 各自 JSON 稳定，多次重跑结果一致，无时序抖动）；
- 仓库内**零写入**（装置全在 `/tmp/q6b/`）；`client/dist` **未被重建**（mtime `2026-10-10 21:55`）。

### 6.4 方案 §3.2 六条「不确定需实测」的收敛情况

| 方案编号 | 本报告对应证据 | 状态 |
|---|---|---|
| **U1** 双形态求值一致性 | T3 / T3c（真渲染树 + 逐字段对拍） | ✅ 收敛 |
| **U2** 5 个 watch 注册序 + 同 tick 序 + 每变更各触发一次 | T4 / T5（源标识命名）+ M1 反证 | ✅ 收敛 |
| **U3** 卸载清理完整性 + hook 仍注册 + SSE 照旧 | T7 / T8 / T11 / T12 + M5 反证 | ✅ 收敛 |
| **U4** 2 个 string ref 仍绑定 | T9（`format()` 调用次数是失绑的判别式） | ✅ 收敛 |
| **U5** 保存守卫 5 分支 + 2 弹窗 | T6 / T6b（文案逐字 + body 逐字段 + PUT/POST 分流） | ✅ 收敛（文案级） |
| **U6** `fillFromParsed` 的 flat/group 分组与 `questionKind` 推导 | T3c 覆盖「**推导 + 反向改写**」主干；**分组细节（flat 连续同类合并 / group 全并）未逐组合穷举** | ⚠️ **部分收敛**（登记为 C 的补充面，见 §12） |

## 7 ★三处静默失效点的处理证据（L0/L1 都看不见的那三处）

| # | 失效点 | 处理 | 证据（静态 + 运行时 + 反证） |
|---|---|---|---|
| **①** | `questionKind` / `sqKind` 的**真值源唯一** | 只在 **U3** 创建一次；其余单元一律**参数注入**；`.vue` 内 ref(/reactive(/computed(/watch( **计数 0/0/0/0** | 静态：④ 口径「仅在 `useSubQuestionList.js` 声明」= true；运行时：T2 初值 + T3 双形态 + **T3c 证明 `fillFromParsed` 的改写确实到达模板**；反证 **M6** |
| **②** | `sqKeyCounter` / `draftChanged` 两个 `let` **单实例** | 二者**只在 U3 声明**；`draftChanged` 只经 `markDraftChanged()`/`clearDraftChanged()`/`hasDraftChanged()` 三个访问器外泄；`sqKeyCounter` 与 `newSq` 同文件 | 静态：④ 口径「仅在 U3 声明」= true；运行时：T10（`_key` 唯一递增）、T10b（**一次保存 + 保存后清位 + 第二次不再保存**）；反证 **M4 / M3** |
| **③** | **5 个 watch 的注册序** `357 < 367 < 482 < 699 < 701`（含 `form.sqScore`、`form.referenceAnswer` **各被 2 个 watch 监听**） | 由 **U12 的调用序**保证：`useQuestionSettings` → `useSubQuestionList`(357,367) → `useObjectiveItems`(482) → `useDraftSync`(699) → `useAiReference`(701) → 其余（无 watch）；5 个 watch **全部留在各自所有者的 setup 同步期**，**未合并、未改源、未改 `deep`、未挪进 hook** | 运行时：T4（**逐位相符**）、T5（同 tick 序）、T8（hook 队列）；反证 **M1** |

**附加机制（方案 §3.1-3① 的硬约束）**：`useDraftAutosave({save, delay: 2000, enabled})` **在 setup 同步阶段被调用恰好一次**（U9 内）⇒ `getCurrentInstance()` 非空 ⇒ 其内部 `onBeforeUnmount(stop)` 正常注册。证据：T12（count=1 / delay=2000）、T8（`onBeforeUnmount` 恰好 1 个）、T7（卸载后存活定时器 0、两个监听净增 0）；反证 **M5**。

## 8 结构自检 + 接线契约

| 项 | 判据 | 实测 |
|---|---|---|
| `.vue` 内响应式原语 | ref( / reactive( / computed( / watch( | **0 / 0 / 0 / 0** ✅ |
| `.vue` 内 hook | onMounted( / onUnmounted( / onBeforeUnmount( | **1 / 1 / 0** ✅ |
| `.vue` 宏 | defineProps / defineEmits / defineExpose / export | 全部 0（**本文件原本就没有 props**：两条路由 `questions/new` 与 `questions/:id/edit` 均无 props） ✅ |
| 12 文件互 import | 只允许 `→ questionPure.js`（叶子，被 6 个单元 import）与 `useQuestionEditPage.js → *`（根） | 违反 **0**；自身 import 图**无环** ✅ |
| 单一创建点 | `aiTag`/`previewFocusKey` 的 ref( 各恰好 1 次（`useAiReference.js` / `useObjectiveItems.js`） | ✅ |
| 真 import（constraints §3-12） | 12 个模块真 import()：`questionPure` 导出 15 名；11 个 `use*` 均为 function + default | ✅（**未采信 `node --check`**） |
| `.vue` 解构格式 | 每行 3–5 名（**不得一行一名**） | 8 行覆盖 63 名 ✅ |

**接线根返回面**：59 个模板 $setup 名 + 2 个 string ref（`tabsScrollRef`/`codeEditorRef`）+ 2 个 hook 回调体；模板零改动下 `__returned__` 完整覆盖（T1）。

## 9 方案偏离登记（逐条给依据，供 C 复核）

| # | 事项 | 处理 | 依据 |
|---|---|---|---|
| **D1** | 方案 §2.3-2 要求「U7 创建 `aiTag`，以 ref 实例注入 U3（**形参名 aiTagRef**）」，§2.3-3 对 `previewFocusKey` 同类 | 改为 **U3 以闭包 `let aiTag, previewFocusKey` + `bindShared({aiTag, previewFocusKey})` 晚绑定**（U12 在 U4/U7 创建后**立即**调用，仍在 setup 同步期；两处 ref() 创建点各**唯一**） | ① **watch 注册序强制 U3 先于 U4/U7**，方案的"U7 先创建"不可达；② 形参改名会让 `:453`/`:456` 两行**不再逐字**；③ 晚绑定在 setup 期完成后任何调用点都已绑定 —— 反证 M2 证明**漏绑定会被装置立刻抓到**（不是静默） |
| **D2** | `draftChanged` 是非响应式 `let`，跨 U3/U9/U12 | 按方案 §2.1-e 以三访问器外泄 ⇒ **3 行受登记改写**：`:693`（`draftChanged = false`→`clearDraftChanged()`）、`:695`（`enabled: () => draftChanged`→`hasDraftChanged()`）、`:849`（`if(draftChanged)`→`if(hasDraftChanged())`） | 这三行是**方案明文要求**（§2.1-e）的必然代价；**替代方案（模块级 let）会破坏多实例隔离**。语义等价已由 T10b/T12 实测 |
| **D3** | 方案 §2.2 的 **U4 依赖清单漏列 `objectiveSettings`**（`currentFlatItemType` 读它） | **U12 向 U4 注入 `objectiveSettings`** | 同 step 5 的 D1。**本次由 ④ 扫描器在第一版构造中直接抓出**（`objectiveSettings@16`），登记为 PC3 反证 |
| **D4** | U12 的 return 面除 .vue 需要的 63 名外，另含 `router/route/confirm/editId/aiGenerateRefs/genRunning/markDraftChanged/fillFromParsed` | 保留（`.vue` **不解构**它们，不进 `__returned__`） | 便于 C 用同一装置做黑盒断言；**不影响模板可见面**（T1 实测 59+2 一个不多一个不少） |
| **D5** | 方案估 `.vue` ≈490–505（**跨 500 线**） | 实测 **466 行**（解构 8 行紧凑排布） | ⇒ over500 **15 → 14**（实测，非承诺）；若按方案"一行一名"会多出 55 行并越过 500 线，**已按硬指令避免** |
| **D6** | ⑤ 装置对 `useExamImport.js` 有 **1 处替身**（`import.meta.env.VITE_API_BASE_URL` → `globalThis.…`） | 仅存在于 `/tmp/q6b/rt/` 的**副本**；**仓库文件未被替换**；**改前根对称施加**同一替身 | Node ESM 无 `import.meta.env`（Vite 构建期替换）；不做替身则改前根在 `handleUploadExam` 里必然抛错、**不可比** |
| **D7** | 方案称「client 侧新增 import 边也计入 cycle-check」 | **实测不成立**：`cycle-check.mjs` 的扫描根是 `server/src`（96 文件 / 214 边，与 step 5 相同） | client 侧无环由**本报告的独立图检查**（§8）+ `vite build` 全图解析承担 |
| **D8** | 方案 §2.2 的「104 块」 | **机器实测 99 块**（97 declarator + 2 hook 语句） | constraints §3-10「一律以冻结树实测为准」；口径差异见 §3.1 |
| **D9** | 方案 §6「每批一个提交」 | **本轮未执行任何 git 写操作**（硬约束优先） | 批次以单元归类留痕，判据按整步执行（严格强于分批） |

## 10 门禁实跑 + 行数实测

| 门禁 | 结果 |
|---|---|
| `node scripts/gates/arch-metrics.mjs` | **PASS** — layerViolations 0/0；**unmigrated 44/44 持平**；**godfileOver800 基线 5 → 实测 4** ✅；**>500 观察带 基线 15 → 实测 14**（如实登记，不计判据） |
| `node scripts/gates/cycle-check.mjs` | **PASS** — 扫描 96 文件 / 214 边（**根 = server/src**，见 D7）；**SCC 0**、自环 0 |
| `node scripts/gates/hard-metrics.mjs` | **PASS 0/0/0** — hex6 0 / important 0 / Modal.confirm 0（扫描面 `client/src/style.css` + `client/src/**/*.vue`，41 文件；模板与样式逐字节未动 ⟹ 必然不变） |
| `node scripts/gates/bind-check.mjs` | **BINDING VIOLATIONS 0**（roots = server/src + server/test，194 模块 / 652 命名绑定）★**边界如实登记：其扫描面不含 client** ⇒ client 侧绑定完整性由 **④ 扫描 + 真 import() + vite build 全图解析**承担 |
| `npx vite build --outDir /tmp/split-step6-build --emptyOutDir` | **exit 0**（21.86s；**未重建 client/dist**，其 mtime 仍为 `2026-10-10 21:55`） |
| `git status --porcelain` | `M client/src/views/teacher/QuestionEdit.vue` + `?? client/src/composables/question/`（12 文件）——**B 的改动面仅此 13 个文件 + 本报告** |

## 11 未执行的验证与原因（诚实登记）

| 项 | 状态 | 原因 |
|---|---|---|
| 像素门禁 `scripts/gates/pixel-diff.mjs` | **不需要（A 档）** | 模板 + 样式**逐字节相等**（§3）**严格强于**像素相等；且其 FIXTURES 无本文件端点（跑也必然 exit 2） |
| axe | **不可用** | `axe-core` 三处 node_modules 全缺（方案 §4.1），本轮禁联网 |
| `page.accessibility.snapshot()` 对拍 | **未跑** | 模板字节相同 ⟹ ARIA 树必然相同（同一论证）；且需真浏览器 + 真后端（C 的装置） |
| **L2 Playwright（N1–N8）** | **未跑（属 C）** | ① `tests/` 被硬禁令冻结（`rig.sh build` 会写 `tests/…/client/dist`）；② 需真后端/真浏览器。**已用 ⑤ 装置覆盖其主干事实**（T3/T3c/T6/T6b/T7/T9/T10b/T11）；**未覆盖**：真实拖拽上传的 6 种分组组合（U6 细节）、真实 scrollWidth 几何驱动的 tabs 滚动按钮、视觉态 |
| 全量后端回归（unblock-g2.sh） | **未跑（C 的职责）** | 本步**不动 server/** → 应逐字不变（零成本哨兵） |
| client/dist / tests/ / 其它 .vue | **未触碰** | 构建一律 `--outDir /tmp/…`；改动面见 §0 |
| `node --check` | **未作为通过证据** | constraints §3-12；改用**自由标识符扫描 + 真 import() + 真运行时对拍**（本次 ④ 扫描确实抓到 1 处漏注入形态缺陷） |

## 12 给 Agent C 的验证指令（独立复现，不复用 B 的脚本）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
git rev-parse HEAD                                  # 执行期为 cb1304cc…（改前锚点 b94407f8；QuestionEdit.vue 内容未变）
shasum -a 256 client/src/views/teacher/QuestionEdit.vue
#   期待 46b93dd7c1db7a423ae71a2f734ec61061896c9a56e7f7c9b64c2be0633a7399（改前 7033a4d5…）
git show HEAD:client/src/views/teacher/QuestionEdit.vue | shasum -a 256   # 期待 7033a4d5…

# V1 L0（★切 2 段：template 1-312 / style 856-983 -> 339-466）
mkdir -p /tmp/q6c
git show HEAD:client/src/views/teacher/QuestionEdit.vue > /tmp/q6c/before.vue
awk 'NR>=1&&NR<=312'   /tmp/q6c/before.vue > /tmp/q6c/b.t
awk 'NR>=1&&NR<=312'   client/src/views/teacher/QuestionEdit.vue > /tmp/q6c/a.t
awk 'NR>=856&&NR<=983' /tmp/q6c/before.vue > /tmp/q6c/b.s
awk 'NR>=339&&NR<=466' client/src/views/teacher/QuestionEdit.vue > /tmp/q6c/a.s
cmp /tmp/q6c/b.t /tmp/q6c/a.t && cmp /tmp/q6c/b.s /tmp/q6c/a.s && echo TEMPLATE_STYLE_BYTE_IDENTICAL
shasum -a 256 /tmp/q6c/b.t /tmp/q6c/b.s    # 485805a1…（22466B）/ 4ab0f0a5…（9513B）
#   并打印 descriptor.styles.length 自证"只有 1 个 style 块"

# V2 逐字搬移（自建 slice-equal）：判据 = 99 块 sha256 全等（白名单仅 2 块：:692/:849 的 3 行登记改写）
#   覆盖核算：316-853 非空行 494 = 搬移 477 + import 12 + 改写 3 + hook 重定位 2；缺口 0、重复 0

# V3 L1（★本步核心，口径 = 冻结的改前 bindingMetadata）
#   判据：template_compile_frozen_byte_equal = true（82471 字节）；59 个 $setup 名集合全等；
#          $setup["X"] 5 名全等；_ctx. = 0；unref( = 0；string ref = [tabsScrollRef, codeEditorRef]；
#          descriptor.styles {scoped,content} 全等且 length=1；非法 binding 迁移 = []
#   ⚠️ own-bindings 口径必然不等（84 行；PROPS 34->41 / KEYED 9->10 / STABLE 5->4；
#      $setup. 129->130 来自 onTabsScroll 的 handler 包装）—— 须按 §4.1 归类为"同类"，不得据此判 FAIL

# V4 自由标识符（必须两遍 / scope.crawl）：13 个对象全 0；正控必须命中
#   PC1 删 DOMPurify import -> DOMPurify；PC2 saveDraft 改名 -> 3 处调用点；
#   PC3 U4 删 objectiveSettings 注入 -> objectiveSettings；PC4 U12 删 hasDraftChanged -> 2 处

# V5 真运行时对拍（无 DOM 装置：真 compileTemplate 产物 + 真 createRenderer + 自写 nodeOps）
#   必查：T4 注册序（按源标识命名！按注册序号命名会让"换序"也通过）、T5 同 tick 序、
#         T7 oplog = [clearTimeout, doc.remove(visibilitychange), win.remove(beforeunload), saveDraft]、
#         T8 hook 队列 [onBeforeUnmount, onMounted, onUnmounted]、T9 format() 恰好 1 次、
#         T10 _key 唯一递增、T10b 一次保存后 enabled()=false、T11 SSE 照旧、T12 delay=2000
#   ★并做变异反证（至少）：U7/U9 换序、删 bindShared、删 clearDraftChanged、newSq 内复制计数器、
#     useDraftAutosave 移入 onMounted、U6 内再造 questionKind —— 六个都必须被抓到

# V7 真 import 一次（禁只跑 node --check）
cd client && node -e "import('./src/composables/question/questionPure.js').then(m=>console.log(Object.keys(m).sort()))"
#   期待 15 名：DEFAULT_TYPE_SCORES, SETTINGS_KEY, _sanHtml, cleanOptionText, countBlanks, detectCodeLang,
#               isCodeStem, itemTypeColor, itemTypeLabel, itemTypeTagClass, langs, newItem, normalizeItem,
#               normalizeJudgeAnswer, updateFillBlanks

# V8 四门禁（期待 arch PASS: 0/44/4/14 · cycle SCC 0 · hard 0/0/0 · bind 0）
node scripts/gates/arch-metrics.mjs; node scripts/gates/cycle-check.mjs; node scripts/gates/hard-metrics.mjs; node scripts/gates/bind-check.mjs
cd client && npx vite build --outDir /tmp/split-step6-build-c --emptyOutDir; cd ..
ls -l client/dist/index.html      # mtime 应仍为 2026-10-10 21:55（非本轮）
```

**C 的重点盲区（B 已尽力但需独立装置）**：① **U6 的分组细节**（flat 连续同类合并 / group 全并 / 遇 code 断开 —— T3c 只覆盖「推导 + 反向改写」主干）；② tabs 滚动按钮的**真实几何**（T9 只证 `tabsScrollRef` 非空，未造 scrollWidth > clientWidth）；③ 真实浏览器下的拖拽上传与 message/Modal 视觉态；④ 「模板逐字节相同 ⟹ 像素与 a11y 树必然相同」这一论证的独立复核。

## 13 结论

- **模板（1–312）与样式（856–983 → 339–466）逐字节相等**（2 段 cmp 全等 + sha256 留痕）；**99 个声明块中 95 块 sha256 全等**，另 2 块为**方案明文要求的 3 行登记改写**，2 个 hook 语句为**逐字平移**；**搬移 477 行逐字相等、覆盖缺口 0、无重复归宿**。
- **L1（冻结口径）逐字节相等**（82471 字节）；59 个 $setup 名一个不漏、`_ctx.`/`unref(` 全 0、2 个 string ref 名字未变、styles 数组全等、非法迁移 0；own 口径的 84 行差异**全部归类为同类**（含 1 处片段 flag，**根因已定位到编译器 processFor 的 constType 判据**）。
- **④ 两遍扫描全 0**（12 文件 + .vue script），**正控 4/4 命中**；它在本轮**真的抓到 1 处漏注入形态缺陷**。
- **⑤ 真运行时对拍 20/20 通过，改前根与改后根 77/77 字段逐字段相同**；**变异反证 6/6 全被捕获**（含注册序换序、漏绑定、脏标记不复位、计数器复制、hook 移出同步期、第二真值源）。
- **三处静默失效点全部有静态 + 运行时 + 反证三重证据**（§7）。
- **12 文件互 import = 0**（仅 U1 叶子与 U12 根两类边，无环）；`.vue` 内响应式原语 0、hook 1/1/0、无宏/无 export。
- **门禁全绿**：arch（**GodFile 5 → 4**、unmigrated 44 持平、**观察带 15 → 14 实测**）/ cycle SCC 0 / hard 0/0/0 / bind 0；`vite build` exit 0；client/dist 与 tests/ 未被触碰。
- **产物**：12 个新文件（23–134 行，全 < 250）+ `.vue` **983 → 466**；改动面 = 13 个文件 + 本报告。
