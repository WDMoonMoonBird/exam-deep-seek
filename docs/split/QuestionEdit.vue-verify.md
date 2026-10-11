# QuestionEdit.vue 拆分独立验证报告（step 6 · C 侧）

- **step**: 6 ｜ **agent**: C（独立验证，只读）｜ **日期**: 2026-10-11
- **被判对象**: A 方案 `docs/split/QuestionEdit.vue-plan.md` · B 落地 `docs/split/QuestionEdit.vue-refactor.md` · DoD `docs/plan/2026-10-11-godfile-split-plan.md` §5（client A 档 5 条判据）
- **本轮 = 上一任 C 因断网中断后的重跑**。上一任留下的 `docs/split/test-round-13.log` 已独立核验（见 §0），本轮**自跑 round-14** 作为主证据。
- **立场**：不采信 B 的自测；全部判据用**自建装置**独立复现；主动证伪。

---

## 0 被验 commit / 工作树状态 / 被测树留痕

| 项 | 实测值 | 复算命令 |
|---|---|---|
| 仓库根 | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（主仓，非 `../Exam-DeepSeek-ui`） | `pwd` |
| HEAD | `cb1304cce7baef70e5683ba816dfb6db8d27a71f`（**B 未提交**） | `git rev-parse HEAD` |
| `QuestionEdit.vue` **改前**（冻结） | 983 行 / 62608 B / `7033a4d5ed596d87d698ec2233fdd865094a107f7f07caa082c8b2b93098187c` | `git show HEAD:client/src/views/teacher/QuestionEdit.vue \| shasum -a 256` |
| `QuestionEdit.vue` **改后**（工作树） | 466 行 / 33492 B / `46b93dd7c1db7a423ae71a2f734ec61061896c9a56e7f7c9b64c2be0633a7399` | `shasum -a 256 client/src/views/teacher/QuestionEdit.vue` |
| 12 个新文件指纹 | 12/12 与 B §1 表**前缀全等**（独立复算） | 见 §3 表 |
| 改动面 | `M QuestionEdit.vue` + `?? client/src/composables/question/`(12) + B 报告 | `git status --porcelain` |
| 冻结副本 | `/tmp/q6c/before.vue`（= HEAD blob）、`/tmp/q6c/after.vue`（= 工作树） | — |
| 自建装置 | `/tmp/c6c-rt/`（编译级 + 自由标识符 + 真运行时 + 变异）· `/tmp/c6c-mut-*/ `（变异副本） | — |

### 0.1 round-13 日志完整性核验（结论：**完整可用**，但本轮仍自跑 round-14）

| 核验项 | 实测 |
|---|---|
| 4 处 `Test Suites:` 摘要 | **齐全**（行 1326 / 1366 / 1455 / 1503） |
| failed 数 | **0**（4 处全 passed） |
| 截断 | **无**：文件以 rule-mutator 的完整摘要 + `Force exiting Jest` 收尾；161227 B / 1508 行，与 round-12（161226 B）同量级 |
| 分段覆盖 | 974 + 17 + 61 + 21 = 1073 用例，与 round-14 完全一致 |

> **结论**：round-13 的四段 `&&` 串联**确实跑完**（无短路）。但它是**被中断进程**的产物、且我无法核验其运行时刻的工作树是否与现在一致 ⇒ **本轮仍以自跑 `docs/split/test-round-14.log` 为主证据**（§8），round-13 仅作交叉印证。

---

## 1 判据总表（★ = 自建装置 / 覆盖缺口补位）

| # | 判据 | 达标线 | 实测 | 判定 |
|---|---|---|---|---|
| V1 | 版本锚点 | 改前 `7033a4d5…` / 改后 `46b93dd7…` / 466 行 | 三者全中 | ✅ |
| V2 | L0 · **2 段**切片逐字节 | cmp 全等 + `styles.length==1` | template / style **byte-identical**；styles 1/1 | ✅ |
| V2b | L0 · 声明块判等 | 95/99 全等 + 2 改写 + 2 hook | 自建口径 **100/104 全等 + 2 改写 + 2 平移，缺口 0 / 重复 0** | ✅ |
| V2c | 2 处改写是否授权且等价 | 方案明文 + 语义等价 | 3 行**逐字符**落在方案 §2.1-(e) 指定形态；单实例实测 | ✅ |
| V3 | L1 · **冻结** bindingMetadata | 逐字节相等 | **全等**（82471 字符 / 84010 字节） | ✅ |
| V3b | L1-b/c/d | 59 名不漏 / `_ctx.`=0 / `unref(`=0 / styles 数组 / 非法迁移=[] | 全中（非法迁移需**修正方案快照的谓词**，见 §3.4） | ✅ |
| V3c | own 口径 84 行差异「属同类」 | 只允许同类 | **独立确认同类**（编译器源码 + 常量源不变式 + 运行时树） | ✅ |
| V4 | ④ 自由标识符 | 13 对象 0 命中 + 正控命中 + 干净树 0 | **0 / 5 正控全中 / 变更面 0** | ✅ |
| V5 | `vite build` | exit 0，禁碰 `client/dist` | exit 0（23.36s）；`client/dist` **未重建** | ✅ |
| V6 | 四门禁 | 见下表 | 4/4 PASS | ✅ |
| ★V6b | **client 侧门禁覆盖缺口补位** | — | `_ctx` 0（40 .vue）｜client 绑定自检 0/245｜client SCC 0/210 | ✅ |
| ★V7 | 真运行时对拍 | T1–T12 + T3c | 24 组事实；**20/24 逐字节相同**，4 处差**全部可解释且无关行为** | ✅ |
| ★V7b | 变异反证 | ≥3 条全中 + 惰性对照 0 差异 | **5/5 全中 + 惰性对照 0 差异** | ✅ |
| ★V7c | B 自报缺陷最终态 | 无未绑定名 | **无**（三重独立证据） | ✅ |
| V8 | 偏离裁定 D1/D3/D6/D9 | 逐条等价 | D1/D3/D6 **等价**；D9 **受理**（见风险 R1） | ✅ |
| V9 | 全量回归 | 4 处摘要 + failed=0 | `test-round-14.log`：4 处摘要，**failed=0**，1073 用例 | ✅ |

**结论：PASS（无阻断项，无需回流 B）。**

---

## 2 V2 · L0 切片与声明块（★自建口径）

### 2.1 两段切片

```
descriptor.styles.length              before=1  after=1        ← 自证「只有 1 个 style 块」⇒ 切 2 段（非 step 5 的 3 段）
cmp  b.template a.template            TEMPLATE_BYTE_IDENTICAL
cmp  b.style    a.style               STYLE_BYTE_IDENTICAL
descriptor.template.content 逐字节相等 = true
descriptor.styles[{scoped,content}] 数组相等 = true（scoped before/after = true/true）
边界自证：首行 '<template>' / '<style scoped>'，末行 '</template>' / '</style>'
```

| 段 | 行区间 | 字节 | sha256（前 16） |
|---|---|---|---|
| S1 template | before 1–312 → after 1–312 | 22466（去尾换行）/ 22467（awk 原样） | `485805a10b3f2360`（去尾换行） |
| S2 style scoped | before 856–983 → after 339–466 | 9513（去尾换行）/ 9514（awk 原样） | `4ab0f0a571c27ca7` |

> **口径校正（信息级 D-L4）**：B §3 报的 `22466 / 9513` 是**去尾换行**的 awk 切片（即 `descriptor.*.content` 同长），不是 awk 原始输出 `22467 / 9514`。两者**改前改后都逐字节相等**，结论不受影响；只是"报的是哪个对象"需要写明。

### 2.2 声明块：B 的 99 与我的 104 是同一事实的两个分母

**自建口径**（`@babel/parser` 解析 `descriptor.scriptSetup.content`，取**全部非 import 顶层语句**，逐块求 sha256 并在「12 composable + 改后 .vue script」语料中做**子串命中**）：

| 顶层语句类型 | 个数 |
|---|---|
| `VariableDeclaration` | 46 |
| `FunctionDeclaration` | 51 |
| `ExpressionStatement`（5 × `watch(...)` + 2 × hook） | 7 |
| **合计（= A 方案 §2.2 的「104 个顶层声明 + 2 hook 体」）=** | **104** |

- **逐字节命中 = 100 / 104**；**未命中 = 4**，且**恰好**是：`:692` `draftSaver` 块、`:849` `beforeUnloadHandler`、`:850` `onMounted`、`:851` `onUnmounted`。
- **同一源行出现第二个逐字副本 = 0**（无重复归宿）。
- B 的 `97` = **46 个 `VariableDeclaration` + 51 个 `FunctionDeclaration` 语句**（**不是** 97 个 `VariableDeclarator`——那只有 46 个；全深度 declarator 为 144）。`97 + 2 hook = 99`；`95 全等 + 2 改写 + 2 平移 = 99`。
  ⇒ **B 的分母算术自洽，我的超集口径同样自洽**（`100 + 2 + 2 = 104`），且**两条口径给出完全相同的事实**。仅标签命名不精确（信息级 D-L3）。

### 2.3 ★2 处改写是否「确属授权、是否等价」——逐字符裁定

**授权**：A 方案 §2.1-(e)（plan:169）**明文**要求「`draftChanged` 通过 `markDraftChanged()/clearDraftChanged()/hasDraftChanged()` 三个函数暴露，**不得以 getter 之外的形态外泄**」。被测的 3 行改写**正是该明文指定的形态**，且访问器命名与方案**逐字相同**。

| # | 改前（冻结源） | 改后 | 等价性论证 |
|---|---|---|---|
| :693 | `save: async () => { saveDraft(); draftChanged = false; },` | `save: async () => { saveDraft(); clearDraftChanged(); },` | `clearDraftChanged(){draftChanged=false;}`（useSubQuestionList.js:92） |
| :695 | `enabled: () => draftChanged,` | `enabled: () => hasDraftChanged(),` | `hasDraftChanged(){return draftChanged;}`（:93） |
| :849 | `if(draftChanged){…}` | `if(hasDraftChanged()){…}` | 同上 |

**单实例（等价的前提）**：`grep -rnE "(let\|const\|var)\s+draftChanged\s*=" client/src` ⇒ **全仓仅 1 处声明**：`useSubQuestionList.js:57 let draftChanged = false;`。其余 4 处均为只读/调用。⇒ **无分叉**，三行改写语义严格等价。

**2 个 hook 的「逐字平移」**：`:850/:851` 的**回调体内层语句**逐字进入 `onPageMounted()` / `onPageUnmounted()`（`load();window.addEventListener('beforeunload',beforeUnloadHandler);` / `window.removeEventListener('beforeunload',beforeUnloadHandler);saveDraft();`），注册语句仍只在 `.vue`（`:335` `onMounted(onPageMounted)` → `:336` `onUnmounted(onPageUnmounted)`，**注册序与原 `:850→:851` 一致**）。箭头函数换具名函数：`this` 在模块作用域下前后同为 `undefined`，`onMounted`/`onUnmounted` 只把回调压栈 ⇒ **等价**。

### 2.4 结构自检（独立复算）

- `.vue` script（314–337）：`ref(`/`reactive(`/`computed(`/`watch(` = **0/0/0/0**；`onMounted(`/`onUnmounted(`/`onBeforeUnmount(` = **1/1/0** ✅
- 单创建点：`const aiTag = ref(` **×1**（useAiReference.js:17）；`const previewFocusKey = ref(` **×1**（useObjectiveItems.js:19）；`const questionKind = ref(` **×1**；`const sqKind = ref(` **×1**；`let sqKeyCounter` **×1**（均在 U3）✅
- 12 个文件互 import：**仅** `→ ./questionPure.js`（叶子，被 6 个单元 import）与 `useQuestionEditPage.js → U1..U11`；**U1..U11 之间 0 条边** ✅

---

## 3 V3 · L1 编译级对拍（★冻结改前 bindingMetadata）

```
sanity_template_source_byte_equal      = true
template_compile_frozen_byte_equal     = true     ← 权威口径
frozen 产物长度                         = 82471 (.length，UTF-16) / 84010 (UTF-8 字节)；771 个非 ASCII 字符
$setup 点式名                            = 59 / 59，missing=[] added=[]
$setup["X"] 方括号名                     = 5/5 完全相同（CodeEditor, CodeOutlined, FormPage, InboxOutlined, RichEditor）
模板 string ref                          = [codeEditorRef, tabsScrollRef]（两侧同）
_ctx. 次数                               = 0 / 0
unref( 次数                              = 0 / 0
descriptor.styles {scoped,content}       = 相等；length 1 / 1
frozen 口径 patchFlag 多重集             = 逐项相同
bindings 消失 51 / 新增 3（useQuestionEditPage, onPageMounted, onPageUnmounted）
```

> **口径校正（信息级 D-L4）**：B §4 报的 `bytes 82471` 是编译产物的 **UTF-16 `.length`**；同一对象的 **UTF-8 `Buffer.byteLength` 是 84010**（差 1539 = 771 个非 ASCII 字符的额外字节）。**数字复现一致**，只是单位未写明。

### 3.1 own 口径（诊断，非判据）

```
template_compile_own_byte_equal = false
行差异 = 84（与 B 完全一致）；行数 1304 / 1304
多重集：PROPS 8: 34 → 41 ｜ KEYED_FRAGMENT 128: 9 → 10 ｜ STABLE_FRAGMENT 64: 5 → 4（其余逐项相同）
$setup. 引用总数 129 → 130
```

### 3.2 ★「84 行差异属同类」的独立确认（不采信 B 的结论）

**(a) 根因在编译器源码层复现**（`client/node_modules/@vue/compiler-core/dist/compiler-core.cjs.js:4933–4944`，我直接读的源码，非 B 转述）：

```js
const isStableFragment = forNode.source.type === 4 && forNode.source.constType > 0;
const fragmentFlag = isStableFragment ? 64 : keyProp ? 128 : 256;
... createVNodeCall(..., fragmentFlag, ..., true, !isStableFragment, ...)   // ← 末位 = disableTracking
```

**(b) 唯一一处 flag 跨类变化的定性**：只发生在**一个** `v-for`——模板 `:191`：
`<a-select-option v-for="l in langs" :key="l" :value="l">{{l}}</a-select-option>`。
判据（三条独立事实）：
1. `langs` 是**模块级 `const` 数组**（questionPure.js:16），**全仓 0 处变异**（`push/pop/splice/sort/reverse/`重新赋值` 全 0 命中）；
2. 该 v-for 的子节点**只读循环变量 `l`**，**不读任何响应式状态**；
3. 改前 `langs` 是 `setup-const`（`constType>0 ⇒ STABLE`），改后是 `setup-maybe-ref`（`constType=0`，因有 `:key` 落 128）。

⇒ KEYED↔STABLE 的差别**只改**「子 vnode 是否被 `_cache` 复用」与「该块是否进入父块 `dynamicChildren`」——**纯优化**；源数组恒不变、块内无响应式读 ⇒ **不可能改变 DOM 或漏更新**。

**(c) 运行时反证**：§7 的真渲染树对拍显示**两种形态的逐标签 census 完全相同**，全树唯一差异是 `onScroll` 的 handler 包装（§7.3），与该 flag 无关。

⇒ **裁定：同类（等价）**。⚠️ 但 A 方案 §4.3 的判据表把「片段类 flag 变化」一律写成 **直接 FAIL**，未给「常量源 + 无响应式读」的豁免 ⇒ **方案需补一条勘误**（信息级 D-L2），否则后续 C 会照表误判。

### 3.3 ★方案 §4.3 参考实现的谓词有 bug（信息级 D-L1，值得回流方案）

方案 §4.3 给的 `allowed` 快照（plan:358）：

```js
const allowed=(f,t)=> t===undefined ? true : (t==='setup-maybe-ref' && f!==undefined);
```

**照抄执行会产出 8 条「非法迁移」**，把一个正确的重构判 FAIL：

| 误报类别 | 条数 | 实例 |
|---|---|---|
| 两侧**类型未变**（`f === t`） | 5 | `onMounted: setup-const -> setup-const`、`CodeEditor`/`RichEditor`/`FormPage` 同 |
| **新增**名且为 `setup-maybe-ref` | 3 | `useQuestionEditPage`、`onPageMounted`、`onPageUnmounted` |

**修正谓词**（我采用的口径）：

```js
const legal=(f,t)=> (t===undefined) || (t===f) || (t==='setup-maybe-ref' && f!==undefined);
```

⇒ `illegal_binding_migrations = []` ✅（B 报的 `[]` 只有在修正谓词下成立；B **静默修正**了方案的快照，未登记进 D1–D9）。

---

## 4 ★V4 · 自由标识符扫描（自建，两遍 / `scope.crawl()`，**非正则**）

**实现**：`@babel/parser`（`sourceType:'module'`）→ `traverse(ast,{ Program(p){p.scope.crawl()}, ReferencedIdentifier(p){…} })` → `p.scope.getBinding(name)` 为空且不在紧凑全局白名单 ⇒ 记为自由标识符。**白名单不含任何业务名**。

| 对象 | 结果 |
|---|---|
| 12 个新 composable（全文） | **全部 0 命中** ✅ |
| `.vue` 的 `<script setup>` 正文 | **0 命中** ✅ |
| **变更面合计 13 个对象** | **FILES_WITH_FREE = 0** ✅ |

**正控（内存内变异副本，仓库零写入）— 5/5 全部命中**：

| 正控 | 手法 | 命中 |
|---|---|---|
| PC1 | 删 `import DOMPurify` | `["DOMPurify@33"]` ✅ |
| PC2 | `function saveDraft(` 改名、保留调用点 | `["saveDraft@72","saveDraft@76","saveDraft@97"]`（3 个调用点）✅ |
| PC3 | U4 注入清单删 `objectiveSettings` | `["objectiveSettings@16"]` ✅（**正是 D3 的缺陷形态**） |
| PC4 | U12 解构删 `hasDraftChanged` | `["hasDraftChanged@44","hasDraftChanged@61"]` ✅（**正是 B 自报缺陷的形态**，见 §7.5） |
| PC5 | U12 删 `markDraftChanged` | `["markDraftChanged@76"]` ✅ |

**★「干净树 0」的口径边界（信息级 D-L5）**：把扫描面扩到**整个 `client/src`（92 文件）** 时，有 16 个文件报命中——**全部是我的白名单缺口**，不是缺陷：

- Vue 编译器宏：`defineProps` / `defineEmits` / `defineExpose`（10 文件）
- 环境类型/全局：`Node` / `Function` / `CSS` / `getComputedStyle`（6 文件）

**变更面（13 对象）内 0 命中**，16 个命中文件**无一属于本次改动面**，且均为改前既有。⇒ B §5 的「干净树 0 命中」在**变更面口径**下成立；在**全 client 口径**下需写明上表。

---

## 5 V5 · 构建（★严禁重建 `client/dist`）

```
cd client && npx vite build --outDir /tmp/c6b-build --emptyOutDir     → exit 0（23.36s）
[monaco-local-vs] 已拷贝本地 Monaco 运行时 → ../../../../../../tmp/c6b-build/monaco/vs
[monaco-local-vs] 静态守卫：dist/assets 内 CDN 串 = 0 ✓
```

| 校验 | 结果 |
|---|---|
| `client/dist/index.html` mtime | **2026-10-10 21:55**（构建前后均未变） |
| `client/dist` 中 `-newermt "2026-10-11 00:00"` 的文件数 | 构建前 **121** → 构建后 **121**（我的构建**未触碰** dist） |
| dist 是否仍是**改前**产物 | 是：`client/dist/assets/QuestionEdit-CG0Uvgcl.js` ≠ 我新构建的 `QuestionEdit-gg65ozo7.js` |

> **★观察项（信息级 D-L6，非本轮产物）**：`client/dist/monaco/vs/` 下 **121 个文件 mtime 全为 `2026-10-11 11:21:37`**（同一瞬间），而 `index.html` / `assets/**` / `monaco-legacy/**` 全部保持 `2026-10-10 21:55`。
> - `diff -rq client/node_modules/monaco-editor/min/vs client/dist/monaco/vs` ⇒ **0 差异**：这是一次**字节等价的 vendored 运行时重拷贝**，**不是产物重建**。
> - 该时刻在**我的会话窗口（12:02 起）之前**，也在 B 报告（11:10）之后；我**不为其归因**，仅登记。

---

## 6 ★V6 · 门禁 + client 侧覆盖缺口补位

### 6.1 四门禁实跑（全部 exit 0）

| 门禁 | 实测 | 结论 |
|---|---|---|
| `arch-metrics.mjs` | layerViolations **0/0**；unmigrated **44/44 持平**；godfileOver800 **基线 4 / 实测 4**；>500 观察带 **14/14** | PASS |
| `cycle-check.mjs` | 根 = **server/src**，96 文件 / 214 边；SCC **0**；自环 **0** | PASS |
| `hard-metrics.mjs` | 41 文件；hex6 **0** / important **0** / Modal.confirm **0** | PASS |
| `bind-check.mjs` | roots = **server/src + server/test**，194 模块 / 652 命名绑定；**违规 0** | PASS |

### 6.2 ★哪条门禁在 client 侧不适用，我用什么替代

我**独立读了两条门禁打印的扫描根**，确认 B 的登记（D7 与 §10 边界）成立：

| 门禁 | client 侧状态 | **我的替代判据** |
|---|---|---|
| `cycle-check.mjs` | **空转**（根 = `server/src`，96 文件全在 server） | **★client 侧 SCC 自检**：对 `client/src` 全部相对导入建图 → **92 模块 / 210 边 / SCC 0 / 自环 0**。另单列 12 个新模块：**24 条出边**，全部形如 `→ questionPure.js`（叶子）或 `useQuestionEditPage.js → U1..U11 + useConfirm.js`，**U1..U11 之间 0 条边** ⇒ 独立证实 B §8。 |
| `bind-check.mjs` | **不含 client**（roots 无 client） | **★client 侧 ESM 跨模块绑定自检**（我自写，等价于 constraints §3-12 的正式门禁）：解析 `client/src` 全部 `.js`/`.vue` 的 import/export → 解析相对说明符 → 逐名核对被导入名是否真被导出。**92 模块 / 245 个命名·默认绑定 / 未解析相对导入 0 / 绑定违规 0**。 |
| `hard-metrics.mjs` | **适用**（扫描面 = `client/src/style.css` + `client/src/**/*.vue`，41 文件） | 无需替代；且模板与样式逐字节未动 ⇒ 必然不变 |
| `arch-metrics.mjs` | **适用**（含 client/src，GodFile 计入 `.vue`） | 无需替代 |

**额外补位**：**`_ctx` 未解析名检查（40 个 `.vue` 全量）** —— 逐文件用**自身** bindingMetadata 编译模板并统计 `_ctx.`：

- **`views/teacher/QuestionEdit.vue` = 0**（改后）；**冻结改前同样是 0**（§3）。⇒ 无任何模板名掉出 setup 作用域。
- 另有 10 个文件 >0，成因**全部良性且与本步无关**：`$slots`（FormPage/ListPage/PageShell）、`$router`（Submit/Review/ReviewClass/ReviewDetail/Teams/ProjectReviewNew）、`$emit` + `passed`（HealthReportTable，改前既有）。

**真 import 复算（constraints §3-12）**：`import('./src/composables/question/questionPure.js')` ⇒ **15 个具名导出**，与 B §8 逐字相同；**未采信 `node --check`**。

---

## 7 ★V7 · 真运行时对拍（自建装置，**不复用 B 的脚本**）

### 7.1 装置形态与自证

`/tmp/c6c-rt/`（仓库外、无网络、无端口、不碰库）：

- **模板 = 真 `compileTemplate()` 的 module 模式产物**（**own-bindings**，即 Vite 构建真实走的口径），`id='q6fix01'`、`scoped:true`；仅把首行 `import {...} from "vue"` 改写为从注入的 Vue 命名空间解构（**函数体逐字未动**）；
- **真 `vue@3.5.34` 的 `createRenderer` + 我自写的 nodeOps**（无 jsdom）；真 `onMounted`/`onBeforeUnmount`/`onUnmounted` 由真 Vue 调度；
- **改后接线根**：**真 `.vue` 的 script 原文**（import 说明符重指向替身，其余逐字），`setup()` 直接返回编译器的 `__returned__`；
- **改前接线根**：**冻结 `.vue` 的 `<script setup>` 原文**包进 `setupRoot()`，`return` 用 `compileScript()` 产出的**同一份 `__returned__`**（119 名）；
- 12 个 composable + `useDraftAutosave` 为**逐字节副本**（**sha256 前缀 12/12 与 B §1 表全等**），仅改 import 说明符；
- **两处登记替身，改前根对称施加**：① import 说明符（vue→bridge、antd/router/dompurify/mammoth/xlsx/request/useConfirm/3 组件→替身）；② `import.meta.env.VITE_API_BASE_URL` → `globalThis.__VITE_API_BASE_URL`（D6）；
- `Transition`/`TransitionGroup` 改直通（无 DOM）。

**自证**：仓库内**零写入**；`client/dist` 未被触碰（§5）；**惰性对照两次同场景运行 0 差异**（§7.4 LAZY）。

### 7.2 ★T4 注册序——**按「源标识」命名，不按注册序号**

命名方式（三层独立锚定，**换序必被抓**）：
1. watcher 的 **回调源码文本** → 我**从冻结 `before.vue` 的第 357/367/482/699/701 行**解析出回调文本并建映射表（**来源是冻结源，不是注册顺序**）；
2. 回调文本在**改后树**中按字节命中同一映射 ⇒ 得到「源行号」；
3. 再用**独立的反应式依赖签名**（把 source 放进一次性 `effect({onTrack})` 跑一遍再 `stop`，收集被读取的 key 集合）**交叉验证**该行号。

| 期望（源标识） | 实测（改前 = 改后） | 依赖签名（独立复核） |
|---|---|---|
| `watch@357:subQuestions` | ✅ | `REF<array>`（deep=true） |
| `watch@367:form.sqScore` | ✅ | `keys:sqScore` |
| `watch@482:objectiveItems.score` | ✅ | `keys:objectiveItems`（‡） |
| `watch@699:autosave` | ✅ | `keys:content,objectiveItems,referenceAnswer,scoringCriteria,sqScore`（deep=true） |
| `watch@701:aiTag-clear` | ✅ | `keys:referenceAnswer` |

**注册序实测（两侧逐位相同）**：`357 < 367 < 482 < 699 < 701` ✅ ｜ `unmatched = 0`
（‡）482 的 getter 在 `objectiveItems` 为空时 `.map` 体不执行，故只track到 `objectiveItems` —— 是**忠实观测**而非失配；该签名在两侧完全一致。

### 7.3 事实清单（24 组，改前根 / 改后根各跑一遍）

| # | 事实 | 实测（改后 = 改前，除注明外） |
|---|---|---|
| T1 | 接线根返回面 | 59 个模板名**一个不漏**（`setupNamesMissing=[]`）；**0 条** "accessed during render but is not defined"；**0** render error |
| T2 | 类型事实 | **两侧共同名逐个 type/isRef/isReactive/isArray 全等**；`form` reactive 非 ref；`langs` 18 元素数组；`saving=false`、`questionKind=null`、`sqKind='subjective'` |
| T3 | 双形态渲染树 | 主观题：`hasContentItem=true / hasObjBar=false / lc-editor-wrap=true`；客观题：`hasContentItem=false`。**逐标签 census 完全相同**（见 7.4） |
| T3-labels | `sqDisplayLabel` | default mode=`group`；**flat ⇒ `第1小题 单选`**；**group ⇒ `第1小题`** —— 与方案 U1 预期的两形态文本逐字相符 |
| T3c | **`fillFromParsed` 推导 + 跨形态改写 + flat/group 分组**（比 B 覆盖更深） | ① 混合输入、`questionKind=null` ⇒ `'subjective'`；kinds `[objective,subjective,subjective]`、scores `[2,10,10]`；② 先 `onPickKind('subjective')` 再喂纯客观 ⇒ `questionKind` 仍 `'subjective'`、`subQuestions` 重建为 `[objective]`(2 items) ⇒ **改写真到达模板可见面**；③ flat：`[obj(1),obj(1),subj,obj(1)]`（连续同类合并、遇 code 断开）；④ group：`[obj(3),subj]` |
| T5 | 同 tick 触发序 | 写 `form.sqScore` ⇒ `[367,699,357]`；写 `form.referenceAnswer` ⇒ `[699,701]`（要求的 `[367,699]`/`[699,701]` 即前两位）；`content` ⇒ `[699]`；**`aiTagClear: {before:'AI 生成，请审核', after:''}`** ⇒ U7↔U3 共享 ref 通路被实测打通 |
| T6 | 保存守卫 5 分支 + 2 弹窗 + 分流 | 逐字：`请输入题目标题` → `请至少添加一道小题` → `第1题 主观题尚未填写题目内容` → `1 道主观题未设参考答案\|AI 生成参考答案\|暂不生成\|640` → `第1小题（编程题） 尚未设置分值。…` → `确认保存\|确认保存\|返回修改\|640` |
| T6b | 新建/编辑分流 | 新建 ⇒ `post /teacher/questions` + `router.push('/teacher/questions')`；编辑（`route.params.id='1'`）⇒ `get /teacher/questions/1` + `put /teacher/questions/1` |
| T7 | **卸载清理序** | **`["clearTimeout","doc.removeEventListener:visibilitychange","win.removeEventListener:beforeunload","saveDraft"]`** 逐位相符；存活定时器 **1 → 0**；`beforeunload` 净增 **−1**、`visibilitychange` 净增 **−1**；0 console error |
| T8 | hook 队列 | `["onBeforeUnmount","onMounted","onUnmounted"]`，**各恰好 1 个**，`beforeUnmount` 最先（跨类顺序固定） |
| T9 | 2 个 string ref 真绑定 | `codeEditorRef` / `tabsScrollRef` 均非空；`formatCode()` ⇒ 替身 `CodeEditor.format()` **恰好 1 次**（失绑则 0） |
| T10 | `sqKeyCounter` 单实例 | 连续 `addSub` ⇒ `1,2` → `1,2,3` → `1,2,3,4`，**唯一且严格递增** |
| T10b | `draftChanged` 单实例 | 首次防抖保存后 `content='X1b'`、`statusText='已保存'`、**`enabled()===false`**；第二次改动 **不再保存**（`content` 仍 `X1b`） |
| T12 | `useDraftAutosave` 契约 | 调用 **1 次**、`delay===2000`、`save`/`enabled` 均为函数、干净态 `enabled()===false` |
| 惰性对照 | 什么都不驱动 | `message=[] / confirm=0 / router=[] / request=[]` —— **无凭空多出的保存或交互副作用** |

**T7 第 4 项的取证方式（独立于源码）**：`window.removeEventListener('beforeunload')` 的包装器在**真实移除之后**排一个微任务，微任务里读 `subQuestions[activeIndex].title==='PROBE'`。`onPageUnmounted` 体是同步语句序列（remove → `saveDraft()`），故微任务看到 `'PROBE'` ⇒ `saveDraft()` 确在 remove 之后同步执行。**未改动任何被测文件**。

### 7.4 ★改前 vs 改后：差异的**精确定位**

24 组事实中 **20 组 JSON 逐字节相同**。4 组不同，**全部可解释**：

| 差项 | 差在哪 | 裁定 |
|---|---|---|
| **T1** | `returnedCount` 71（改后）vs 119（改前） | **非缺陷**：改前的 `<script setup>` 把所有顶层绑定都放进 `__returned__`（含 `_sanHtml`/`doSave`/`buildScoreSummary` 等 50 个内部名）；改后接线根只返回模板需要的 63 名 + 组件。**模板可见的 59 名两侧一个不漏**（`setupNamesMissing=[]` ×2） |
| **T2** | 同上的键集差（`only-after` 3 名 / `only-before` 50 名） | **两侧共同名逐个类型事实全等**（`value diffs = {}`）；差集**全是模板不可见的内部名** |
| **T3_subjective / T3_objective** | 全树**深度 diff 恰好 1 条路径**：`…/props/onScroll`：`fn:anon`（改后）vs `fn:onTabsScroll`（改前） | **语义惰性**：这是 B §4.1-3 定位的**编译器 handler 包装**（`_cache[8] \|\| (_cache[8] = (...args) => $setup.onTabsScroll(...))`），因 `onTabsScroll` 由 `setup-const` 降为 `setup-maybe-ref` 而产生。**同一函数对象、被 `_cache` 缓存**（prop 身份稳定，不产生额外 patch）；`onTabsScroll` 体内**不使用 `this`**（读的是 `tabsScrollRef.value`），故箭头包装不会改变任何可观测行为。**逐标签 census 完全相同** |

**其它可观测面**：
- 唯一的告警差：改前多一条 `setup() return property "_sanHtml" should not start with "$" or "_"`（Vue 对 `__returned__` 里下划线前缀名的开发期告警）。`_sanHtml` **不在 59 个模板名内**（L1-b 已证两侧集合相同），故该告警消失属**净改善**，非行为变化。
- 两侧 **Vue 运行时错误数相同**（各 10 条，全为装置侧，见 §7.6）。

> ★**这一处差异是我的装置独立发现的**（B 的差异清单未喂给装置），与 B §4.1-3 的结论**独立吻合**。

### 7.5 ★变异反证（5 条 + 1 惰性对照，**全部按预期被捕获**）

| 变异 | 手法 | 装置反应 |
|---|---|---|
| **M1** | U12 里把 `useAiReference` 提到 `useDraftSync` 之前（U7↔U9 换序） | ✅ **T4 注册序**与 **T5 同 tick 序**均改变 |
| **M2** | 删掉 `subs.bindShared({ aiTag, previewFocusKey })` | ✅ 装置**立即** `TypeError: Cannot set properties of undefined (setting 'value')`；**18 组事实**改变（含 `T5.aiTagClear.after` 不再清空）⇒ **漏绑定不是静默的** |
| **M3** | `useDraftAutosave()` 移入 `onMounted`（脱离 setup 同步期） | ✅ 装置**中止**：`TypeError: Cannot convert undefined or null to object`（hook 未注册的同一根因） |
| **M4** | U3 的 `newSq` 内再声明一个 `sqKeyCounter` | ✅ **T10 失败**：`_key` 序列不再严格递增 |
| **M5** | U6 内再造一个 `questionKind` ref（第二真值源） | ✅ **`T3c_derive.questionKind` 由 `'subjective'` 变 `null`** —— 上传/解析的跨形态改写到不了模板可见面 |
| **LAZY** | **不改任何文件**，同场景重跑 | ✅ **0 组事实差异**（无时序抖动，装置不"通吃"） |

（装置既不"通吃"也不"全否"：5 条真变异全中，惰性对照 0 差异。）

### 7.6 ★B 自报抓到并修掉的那处缺陷：最终态复核

**缺陷形态（B §5 自报）**：第一版 `useQuestionEditPage.js` 里 `beforeUnloadHandler` 调用了 `hasDraftChanged()` 但**漏了解构**，且 `return` 面含 `aiGenerateRefs`/`genRunning`/`markDraftChanged`/`fillFromParsed` **4 个未绑定名**；**`node --check` 与 `vite build` 都放行**。

**最终态：无未绑定名 —— 五重独立证据**：

1. **④ 扫描**：`useQuestionEditPage.js` 全文 **0 命中**（§4）；13 个变更对象 0 命中。
2. **复现缺陷形态**（PC4，内存内删掉解构里的 `hasDraftChanged`）⇒ 扫描器报 **`["hasDraftChanged@44","hasDraftChanged@61"]`** —— **恰好是 B 描述的两个调用点** ⇒ 该判据**真的能抓到它**，不是形式主义。
3. **源码落点核对**：`useQuestionEditPage.js:40` `const { markDraftChanged, clearDraftChanged, hasDraftChanged } = subs;`；`:61` `function beforeUnloadHandler(e){saveDraft();if(hasDraftChanged()){…}}` ⇒ 已在**同一作用域**绑定。
4. **return 面 4 名全部有绑定**：`aiGenerateRefs`/`genRunning` 来自 `:47`、`markDraftChanged` 来自 `:40`、`fillFromParsed` 来自 `:50`。
5. **真运行时**：两版根各完成 6 次挂载 + 场景驱动，**0 条 `ReferenceError`**；`T7` 的 `saveDraft` 探针与 `beforeUnloadHandler` 的注册（`beforeunload` 净增 +1/−1）均正常。

**严格边界**：`beforeUnloadHandler` 的**函数体本身**在本装置中**未被真正触发**（无 `beforeunload` 事件派发）；其"无未绑定名"由证据 1–4（静态 + 正控）确立，运行时仅证其**已注册且依赖可达**。

### 7.7 ★两张清单

**（A）被执行的运行时事实**：T1 · T2 · T3（双形态树 + 逐标签 census + 两模式 `sqDisplayLabel`）· **T3c**（`fillFromParsed` 推导 / 跨形态改写 / flat / group 分组）· T4（**源标识**注册序 + 依赖签名交叉验证）· T5（三类同 tick 序 + aiTag 清除）· T6（5 守卫 + 2 弹窗文案）· T6b（PUT/POST 分流 + 路由）· T7（卸载四步序 + 存活定时器 + 两监听净增）· T8（hook 队列）· T9（2 string ref + `format()` 恰 1 次）· T10 · T10b · T12 · 惰性对照 · 5 条变异 + 1 条惰性对照。

**（B）★未执行的（计入残留风险）**：

| # | 未执行项 | 原因 / 影响 |
|---|---|---|
| R-1 | **T11**：`handleUploadExam` 的 SSE 中途卸载（既有行为照旧、未被放大） | 需要真 `fetch` + `ReadableStream` + SSE 文本夹具；**本轮未做** ⇒ 「SSE reader 不可取消」这一既有缺陷**未被独立复核**（但改前改后对称，且 §2.2 证明 539–606 块逐字未动） |
| R-2 | tabs 滚动按钮的**真实几何**（`scrollWidth > clientWidth` → 按钮可见 + `scrollLeft` 变化） | 无真实布局引擎；只证到 `tabsScrollRef` 非空 + `formatCode` 通路（U4 的"失绑静默"风险已由 T9 的 `format()` 计数兜住；滚动按钮侧只有间接证据） |
| R-3 | 真实拖拽上传 + `.docx`/`.xlsx` 真实解析路径 | 替身 `mammoth`/`xlsx`；仅覆盖 `fillFromParsed` 的**纯函数**输入面 |
| R-4 | L2 Playwright（N1–N8） | 需真后端 + 真浏览器；`tests/` 被硬禁令冻结 |
| R-5 | axe / `page.accessibility.snapshot()` | `axe-core` 三处 node_modules 全缺、禁联网 ⇒ **显式登记「axe 未执行」**。替代论证：模板 1–312 **逐字节相等** ⇒ a11y 树必然相同（与"像素必然相同"同一论证，但**未用真浏览器复核**） |
| R-6 | 像素门禁 | **A 档不适用**：模板 + 样式逐字节相等**严格强于**像素相等；且 `pixel-diff.mjs` 的 FIXTURES 无本文件端点（跑也必然 exit 2） |
| R-7 | 装置侧瑕疵（**改前/改后完全一致，不影响任何断言**） | ① `Transition` 改直通 ⇒ 其 `mode="out-in"` 语义被绕过，导致**极少数挂载在卸载时抛** `Cannot read properties of null (reading 'type')`（被 `safeUnmount` 捕获、两侧同现）；② 被 Vue 捕获的装置级错误各 10 条（`Reflect.ownKeys called on non-object` 等），两侧**条数与内容完全相同**；③ 因①，监听计数以**净增/净减**（Δ）为判据，而非绝对值 |

---

## 8 V9 · 全量回归（自跑 round-14）

```
ROUND=14 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh      → exit 0
日志：docs/split/test-round-14.log（158414 B → 最终 161248 B / 1508 行）
```

| 段 | Test Suites | Tests |
|---|---|---|
| 段1（除三 tree-sitter 套件外全部） | 65 passed, 65 total | **974 passed, 974 total** |
| 段2 `fact-extractor.test.js` | 1 passed, 1 total | 17 passed, 17 total |
| 段3 `rule-executor.test.js` | 1 passed, 1 total | 61 passed, 61 total |
| 段4 `rule-mutator.test.js` | 1 passed, 1 total | 21 passed, 21 total |

- **`Test Suites:` 摘要 = 4 处** ✅（四段 `&&` 未短路）
- **failed = 0** ✅（`grep -E "Tests:.*failed|Test Suites:.*failed"` ⇒ NONE；`✕`/`●…›` 标记 = 0）
- 合计 **1073 用例全绿**，与 round-13 的 974+17+61+21 完全一致
- **未出现 tree-sitter 同进程假红**（约束包第 18 条）⇒ 无需隔离复跑
- 本步**不动 `server/`**（`git status` 无 server 侧改动）⇒ 该回归是零成本哨兵，全绿符合预期

---

## 9 V8 · B 的偏离逐条裁定

| 偏离 | B 的主张 | 我的独立裁定 | 依据 |
|---|---|---|---|
| **D1** | 方案 §2.3-2 的「U7 先创建 `aiTag`，以形参名 `aiTagRef` 注入 U3」**不可达**；改为 **U3 闭包 `let aiTag, previewFocusKey` + `bindShared({...})` 晚绑定** | ✅ **等价，且原方案确实不可达** | ① **不可达**由我的 T4 实测确立：冻结注册序要求 `357<367<482<699<701`，即 **U3 的 watcher 必须先于 U7 注册** ⇒ U7 不可能先建；② 形参改名会让 **:453/:456 两行不再逐字** —— 这两行所在块正是我 §2.2 判定「逐字节全等」的块，方案的做法会把偏离从 4 处抬到 ≥5 处；③ 单创建点独立复算：`aiTag` ref ×1、`previewFocusKey` ref ×1；④ **M2 证明漏绑定是"响的"**（TypeError + 18 组事实），非静默 |
| **D2** | `draftChanged` 三访问器导致 :693/:695/:849 **3 行受登记改写** | ✅ **等价且属方案明文要求** | 方案 §2.1-(e)（plan:169）逐字指定这三个访问器名；全仓 `draftChanged` 声明**唯一**；T10b 实测一次保存后 `enabled()` 归 false |
| **D3** | 方案 §2.2 的 U4 依赖清单**漏列 `objectiveSettings`**，U12 补注入 | ✅ **等价且必要** | `currentFlatItemType` 读它；**PC3 复现出完全相同的缺陷形态** `["objectiveSettings@16"]`；现注入清单（useQuestionEditPage.js:42）确含该名 |
| **D4** | U12 return 面多出 7 个名字（`router/route/confirm/editId/aiGenerateRefs/genRunning/markDraftChanged/fillFromParsed`），`.vue` 不解构 | ✅ **等价** | T1 实测 `setupNamesMissing=[]`、模板 59 名两侧一个不漏；多出的名字**不进模板可见面**。★副产物：其中 `fillFromParsed` 恰好让我的 T3c 能驱动到 U12 的完整返回面（改前侧取 `__returned__`，两侧对称） |
| **D5** | `.vue` 实测 466 行（未跨 500 线），观察带 15 → 14 | ✅ **与门禁实测一致** | `arch-metrics` 实测观察带 **14/14** |
| **D6** | `import.meta.env` 替身**仅存在于 /tmp 副本**，仓库文件未替换，**改前根对称施加** | ✅ **等价** | 我在**自建 build 里对两侧根 + 13 个模块对称施加**同一替换；仓库文件未被替换；Node ESM 无 `import.meta.env`，不替换则改前根在 `handleUploadExam` 必抛、不可比 |
| **D7** | 方案称「client 侧新增 import 边也计入 cycle-check」**不成立**（其根 = `server/src`） | ✅ **完全成立** | 我独立读门禁输出的扫描根确认为 `server/src`；并用自建 **client SCC（92 模块 / 210 边 / SCC 0）** 补位（§6.2） |
| **D8** | 方案「104 块」→ 机器实测 99 块 | ⚠️ **部分成立，标签不精确** | 我的机器实测：**99 = 46 `VariableDeclaration` + 51 `FunctionDeclaration` + 2 hook 语句**（**不是 97 个 VariableDeclarator**，那只有 46 个）；A 的「104」= 46+51+2+5 watch（**也是一个自洽口径**）。两条口径**给出同一事实**（见 §2.2） |
| **D9** | 「每批一提交」**未执行**，等 Captain 提交 | ✅ **受理（硬约束优先）** | HEAD 仍 `cb1304c`；`git status` 显示改动面 = `M QuestionEdit.vue` + `?? composables/question/`(12) + 报告；**无任何 git 写操作**。⚠️ **后果见 R-1 风险**（下方） |

---

## 10 缺陷分级

| 级 | 数量 | 内容 |
|---|---|---|
| **阻断** | **0** | — |
| **高** | **0** | — |
| **中** | **0** | — |
| **低 / 信息** | 6 | 全部为**方案或报告的表述精度**问题，**不改变任何判定**：<br>**D-L1** 方案 §4.3 的 `allowed()` 快照谓词有假阳性（未变类型 + 新增名），照抄会把正确重构判 FAIL；B 静默修正未登记。<br>**D-L2** 方案 §4.3 判据表把「片段类 flag 变化」一律列为直接 FAIL，缺「常量源 + 块内无响应式读」豁免。<br>**D-L3** B §3.1「顶层 VariableDeclarator 97 个」为误标（实为 46 个 `VariableDeclaration` + 51 个 `FunctionDeclaration` 语句；计数 97 正确）。<br>**D-L4** B §3/§4 报的字节数是 **UTF-16 `.length`**（82471）而非 UTF-8 字节（84010）；切片数 22466/9513 为去尾换行版本（awk 原样为 22467/9514）。数字均可复现。<br>**D-L5** B §5「干净树 0 命中」在**变更面口径**下成立；全 client（92 文件）口径下有 16 个**既有白名单缺口**命中（`defineProps` 等宏 / `Node`/`CSS`/`getComputedStyle`）。<br>**D-L6** `client/dist/monaco/vs/` 121 文件 mtime = `2026-10-11 11:21:37`（字节等价的 vendored 运行时重拷贝，**app 产物未重建**）；发生在我的会话窗口之前，仅登记。 |

---

## 11 未做项与残留风险

1. **R-1（流程，需 Captain 处置）**：本步产物**尚未进入 git**（HEAD = `cb1304c`）。约束包 §3-5 的「`served fp == 磁盘 fp == 对应 HEAD`」**当前不满足** ⇒ V1 的改前锚点靠 `git show HEAD:`、改后锚点靠**活工作树**。在 Captain 提交之前，本步不具备「可归档」的版本锚定；若工作树被后续改动触碰，本报告的改后锚点（`46b93dd7…`）即失效。**建议 Captain 先提交再推进 step 7**。
2. **R-2 ~ R-7** 见 §7.7（T11 SSE · tabs 真实几何 · 真实 docx/xlsx 上传 · L2 Playwright · axe · 装置侧瑕疵）。
3. **U6 的完备性**：本轮 T3c 已覆盖「推导 / 跨形态改写 / flat 连续同类合并 / group 全并 / 遇 code 断开」五类主张，但**未穷举 4 类输入 × 2 模式的全部 8 组合**（B §6.4 登记的部分收敛项，本轮显著收窄但未清零）。
4. **未复核的历史产物**：A 方案 §4.4 曾指出判据④应回溯 step 1–5 的全部产物（如 `useQuestionNav.js` 漏注入已在 `45947b5` 修）。**本轮只扫了变更面 + 全 client 广度**，未按 step 逐一回溯历史报告。

---

## 12 结论

> ## **PASS —— 不需回流 Agent B**

- **V1–V6、V8、V9 全部达标**；**阻断 0 / 高 0 / 中 0**，6 条信息级问题**均在方案或报告的表述层**，不改变任何判定。
- **「模板与样式零改动」被机器证明**：2 段切片逐字节相等（template 1–312 / style 856–983→339–466），`styles.length=1`；**104 个顶层语句中 100 个逐字节全等**，另 2 块为**方案 §2.1-(e) 明文要求的 3 行**（逐字符核对 + 单实例实测），2 个 hook 为**逐字平移**；覆盖缺口 0、重复 0。
- **L1 冻结口径逐字节相等**（82471 字符 / 84010 字节）；59 个 `$setup` 名一个不漏、`_ctx.`/`unref(` 全 0、2 个 string ref 名字未变、styles 数组全等、非法迁移 0。own 口径的 84 行差异**由我独立认定为同类**（编译器源码 + 常量源不变式 + 运行时逐标签 census 相同）。
- **④ 扫描 13 对象 0 命中、5/5 正控命中**；它**真的能抓到** B 自报的那处漏注入形态（PC4 复现）。
- **真运行时对拍 24 组事实、20 组逐字节相同**；4 处差**全部定位并判定无关行为**（含我**独立发现**的 `onScroll` handler 包装）。**变异反证 5/5 全中 + 惰性对照 0 差异**。
- **B 自报缺陷的最终态已无未绑定名**（静态 + 正控 + 落点 + 真运行时四重证据）。
- **门禁全绿**；两条在 client 侧空转的门禁（`cycle-check` 根 = server/src、`bind-check` 不含 client）已由**我自建的三条判据补位**（`_ctx` 0/40 .vue ｜ client 绑定自检 0/245 ｜ client SCC 0/210）。
- **全量回归 `test-round-14.log`：4 处 `Test Suites` 摘要、failed=0、1073 用例全绿**；无 tree-sitter 假红。
- **唯一需要 Captain 动作的事项是流程性的**：产物尚未提交（R-1），建议提交后再进入下一步。
