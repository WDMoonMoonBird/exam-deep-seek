# ProjectQuestionEdit.vue 拆分验证报告（step 5 · C 侧 · 独立对抗性验证）

- **step**: 5 ｜ **role**: Agent C（独立验证者，只读 + 自建装置）｜ **日期**: 2026-10-11
- **被验提交（HEAD）**: `e37d27c0373a6424e1b63ddc06d3f86883a90976`（分支 `master`，= A 方案锚点，未前移）
- **工作树状态**（`git status --porcelain`，与本次验证相关的部分）：
  `M client/src/views/teacher/ProjectQuestionEdit.vue` · `?? client/src/composables/project/`（9 文件）
  —— 另有**非 B 的改动**：`M scripts/gates/arch-metrics.mjs`（基线刷 44/5/15，`git diff` 3 insertions/1 deletion，mtime 10:22 = Captain 按 B §10 建议执行）与 `M docs/split/status.md`（Captain）。
- **被测源码树留痕（DoD ★）**: `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**；本仓第二 worktree `../Exam-DeepSeek-ui` 未被触碰，`git worktree list` 已核）
- **被验产物指纹**: `client/src/views/teacher/ProjectQuestionEdit.vue` sha256 `128462488d1cb7efe2bc4a086ce939bdcb4c8b28f8c42645e5173720f812af9d`（348 行 / 22563 字节）；改前（`git show HEAD:`）`1fb6ac50f49d89671362662d78f5b27bc736ef74f51dea82fb9c034f5afe608a`（868 行 / 43966 字节）
- **方法**: 全部判据**自建实现**（脚本全在 `/tmp/c5c/`，**未复用 B 的 `/tmp/c5b/`**，未读其 manifest）、**先冻结再测**（`git show HEAD:` → `/tmp/c5c/before.vue`）、**变异反证 + 惰性对照**；只读：除本报告外**未创建/修改/删除任何仓库内文件**；无任何 git 写操作；未重建 `client/dist`；未写 `tests/`；未占 `:5173`/`:3000`；未联网；未安装依赖。

---

## 0 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| **V1** | 锚点 | HEAD `e37d27c`；.vue `12846248…` | `e37d27c0373a6424e1b63ddc06d3f86883a90976`；`128462488d1cb7ef…` | ✅ 自证成立 |
| **V2a** | 模板 1–194 逐字节 | 相等 | `cmp` 无输出；sha256 `3658d354…` 两侧同 | ✅ |
| **V2b** | style scoped 756–857 → 236–337 | 相等 | `cmp` 无输出；`3163b727…` 同 | ✅ |
| **V2c** | style 非 scoped 859–868 → 339–348 | 相等 | `cmp` 无输出；`141354f4…` 同 | ✅ **三块全等** |
| **V2d** | 搬移块逐字 | 0 处不等 | 504 非空源行中 **497 逐字相等**，7 行差异**全部可解释**，0 处重复映射 | ✅ |
| **V3a** | 点式 `$setup.X` 44 名全等 | 44 = 44 且集合相同 | 44/44，双向差集为空 | ✅ |
| **V3b** | 方括号 `$setup["X"]` 7 名全等 | 7 = 7 | 7/7，逐个相同（4 组件 + 3 图标） | ✅ |
| **V3c** | `$setup` 引用总数 129 全等 | 129 = 129 | 129/129（点式 119 + 方括号 9 + 1） | ✅ |
| **V3d** | `_ctx` / `unref(` 为 0 | 0 / 0 | 0 / 0（改前改后） | ✅ |
| **V3e** | `__returned__` 59 ⊇ 45 | 59；无缺失 | **59**；模板所需 **52 名**（44 点式 + `editorContainerRef` + 7 方括号）**missing = []** | ✅ |
| **V3f** | styles 数组全等 | 相等 | `[{scoped:true,8829B},{scoped:null,292B}]` 两侧同 | ✅ |
| **V3g** | 模板编译差异仅 patchFlag | 仅 PROPS 追加事件键 | 11 hunk 全为同类；**剥掉 PROPS 数组后两份产物逐字节相同**（各 26201B） | ✅ |
| **V3h** | `:38` 守卫表达式 | 逐字相同 | 源码同；编译产物同 = `$setup.isTeacher && $setup.isEdit && $setup.FEATURE_CHECKER_ENTRY` | ✅ |
| **V4** | ★自由标识符扫描 = 0 | 0 | **9 模块 + .vue script 全 0**（AST 作用域分析）；正控 3/3 命中 | ✅ |
| **V5** | `vite build` exit 0 | 0 | `exit 0`（23.22s）；`client/dist` mtime 仍 `2026-10-10 21:55` | ✅ |
| **V6a** | arch-metrics | PASS 0/44/5/15 | PASS 0/44/**5**/**15** | ✅ |
| **V6b** | cycle-check | SCC 0 | PASS；96 文件 / **214 边**；SCC 0；自环 0 | ✅ |
| **V6c** | hard-metrics | 0/0/0 | PASS 0/0/0 | ✅ |
| **V6d** | bind-check | 0 违规 | 194 模块 / 652 具名绑定 / **违规 0** | ✅ |
| **V6e** | 真 import zipEntry | 3 具名导出 | `["GBK_DECODER","UTF8_STRICT","findFirstFile"]`，无 default | ✅ |
| **V7** | server 零改动 | `git diff -- server/` 空 | **0 行** | ✅ |
| **V8** | ★真运行时对拍 | 见 §4 | 见 §4（含变异反证 5/5 + 惰性对照 0 差异） | ✅ |
| **V9①** | 观察带 16→15 | 口径 `>500` 含 `>800` | `>800`=5、`>500`=15、`>800∖>500`=**空** | ✅ 方案错、实测对 |
| **V9②** | E1/E2 修复终态 | W2 import 完整、W5 注入齐备 | W2 `{ref, watch, nextTick}`；W5 11 个注入全在 | ✅ |
| **V10** | L2 交互 | N1–N3 必做 | **由 V8 装置覆盖并实测通过**（未搭 Playwright，理由见 §7） | ✅（口径见 §7） |
| **V11** | 越界自查 | 只有 9 新 + 1 改 | `client/` 仅 `M ProjectQuestionEdit.vue` + `?? composables/project/` | ✅ |

**总判定：PASS（无需回流 B）** —— 5 条必做判据（①②③④⑤）全部满足；发现的 5 条均为**文档口径/证据强度**级，见 §8。

---

## 1 V2 · L0 切片字节判等（自建）

```
$ git show HEAD:client/src/views/teacher/ProjectQuestionEdit.vue > /tmp/c5c/before.vue   # sha 1fb6ac50… 868 行
$ shasum -a 256 client/src/views/teacher/ProjectQuestionEdit.vue                          # 12846248… 348 行
=== block boundary tags BEFORE ===        === AFTER ===
1:<template>                              1:<template>
194:</template>                           194:</template>
196:<script setup>                        196:<script setup>
754:</script>                             234:</script>
756:<style scoped>                        236:<style scoped>
857:</style>                              337:</style>
859:<style>                               339:<style>
868:</style>                              348:</style>
--- cmp template ---      TEMPLATE BYTE_IDENTICAL
--- cmp style scoped ---  STYLE_SCOPED BYTE_IDENTICAL
--- cmp style global ---  STYLE_GLOBAL BYTE_IDENTICAL
3658d354…  b.t = a.t     3163b727…  b.s1 = a.s1     141354f4…  b.s2 = a.s2
```

> ★ **对抗性复核 B 的 §3 数字**：B 报 `template bytes=11490 sha=3e12a1eb…`、`s1 8851/b6914359…`、`s2 307/c8b7b00a…`。我的切片是 11491/8852/308 且 sha 不同 —— **差异恰为末尾一个换行符**：把切片末尾 `\n` 去掉后，三个 sha 与三个字节数**与 B 完全一致**。⇒ B 的数字可复现，只是"字节数/哈希"的定义**不含行尾换行**（B 报告未写明该口径）。非缺陷，登记为 F1。

### 1.1 搬移块逐字对拍（自建 `/tmp/c5c/l0match.mjs`）

对 `script` 段 196–754 的**每个非空行**在 10 个产物（9 模块 + 新 .vue）中查找**逐字命中**：

```
source non-empty lines : 504
exact (verbatim)       : 497
indent-only difference : 0
unmatched              : 7
  src:197  import { reactive, ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
  src:203  import { useMonacoTheme } from '../../composables/useMonacoTheme.js';
  src:204  import { useMonacoKeyboardA11y } from '../../composables/useMonacoKeyboardA11y.js';
  src:528  if (!checkerLoadedOnce) await ensureCheckerState();
  src:602  if (checkerLoadedOnce && checkerData.value.status && …… !== 'none') {
  src:741  onMounted(() => {
  src:748  onBeforeUnmount(() => {
```

**7 行差异逐条归属（全部在 B §7 白名单内，0 行越界）**：
:197（vue import 按消费者拆分）· :203/:204（路径深度 `../../composables/` → `../`）· :528/:602（§7.1 登记的 2 处改写）· :741/:748（hook 包装行 → `function onPageMounted()/` `function disposePage()`）。
§7.1 另 3 处改写（:749/:751/:752）在 W2 的薄 disposer 体内**逐字保留**，故在行级对拍中命中。

**反向核对（产物新增行）**：9 模块共 793 行，其中 162 行非源行 —— 全部为 banner(5×9=45 行，固定格式)、import(按消费者拆分)、`export function …() {` 包装、return 对象、`export default`；无一处是"新逻辑"。

**重复映射探针（对抗 B 的"同一源行无第二个逐字副本"）**：长度 ≥30 的源行中，有 7 行在产物中出现 >1 次，逐条查明**均非重复搬移**：
- `:199`（`import { message } …`）→ 5 个模块 + .vue 各需一次（**按消费者拆分的 import，结构性重定位**，§7.2 已登记）；
- `:207`（`import request …`）→ 4 个模块同理；
- `:387/:391/:399` → 源文件里本就是**三行文本相同**的独立行（三个 computed 各自的局部定义），一一对应 3 个目的地（双射）；
- `:621/:649`（`const formData = new FormData();`）→ 两条源行各对一处（双射）。

⇒ **无"同一源行被复制两次"**，B 的覆盖核算成立。B 报"829 行逐字搬移"是其 dest 侧记账口径，**无法用其 §12 给出的命令复现**；我以自己的口径给出 497/504 + 7 行全解释（登记 F5，不影响结论）。

---

## 2 V3 · L1 编译级对拍（`@vue/compiler-sfc@3.5.34`，`client/node_modules`，禁联网）

```
===== V3 L1 =====
dot $setup names: before 44 after 44 | identical: true        before-only: []  after-only: []
bracket $setup names: before 7 after 7 | identical: true
  CheckCircleFilled, CheckerWizard, FileTextOutlined, FormPage, LoadingOutlined, ProjectZipUploader, RichEditor
total $setup occurrences: before 129 after 129
_ctx names: before [] after []      unref( count: before 0 after 0
__returned__ entries: before 112 | after 59
template-needed (dot44 + editorContainerRef + bracket7) = 52 | missing from __returned__ (after): []
bindings.props: before setup-reactive-const  after setup-reactive-const
FEATURE_CHECKER_ENTRY binding: before literal-const  after setup-maybe-ref
styles identical: true [{"scoped":true,"contentSha":"de17f4b1…","bytes":8829},{"scoped":null,"contentSha":"13f4701e…","bytes":292}]
compileTemplate bytes 27984 -> 28215 | byte identical: false | sha df0507ba… -> bd7f7233…
```

### 2.1 模板编译的 11 个 hunk —— 独立归类为**纯 patchFlag**（比 B 的表述更强的判据）

```
metric                              | before | after | delta
$setup. occurrences                 |    119 |   119 |   0
$setup["..."] occurrences           |      9 |     9 |   0
$setup (all)                        |    129 |   129 |   0
_ctx. / unref(                      |  0 / 0 | 0 / 0 |   0
STABLE_FRAGMENT / KEYED_FRAGMENT    |  6 / 1 | 6 / 1 |   0
_createVNode|_createBlock|_createElementVNode | 68 | 68 | 0
onUpdate: (v-model)                 |     10 |    10 |   0
ref: "editorContainerRef"           |      1 |     1 |   0
PROPS patchFlag sites               |     18 |    24 |  +6
after stripping PROPS patchFlag arrays: identical = true | bytes 26201 26201
```

**★ 这是本步关于"模板零改动"的第二重机器证明**：把两侧产物里所有 `, 8 /* PROPS */, [...]` 片段剥掉后，**两份编译产物逐字节相同**（各 26201 字节）⇒ 除 6 处 patchFlag 列表追加事件键（`onClick`/`onStatusChange`/`onReady`/`onSelect`）外**没有任何其它差异**。B §4.2 的"11 hunk 全为同类"经独立复现成立；且 `$setup` 名字一个未变、`_ctx`/`unref` 仍为 0 ⇒ 无名字退化、无 ref 解包丢失（K3 的机器探针）。

### 2.2 与 A 方案 §6.3 / §8.2 的偏差点（B 已登记，我独立复核）

- **C4「bindings 键集合+类型完全相等」字面不成立**：实测 97 处类型迁移（`setup-ref→setup-maybe-ref` 27 · `setup-const→setup-maybe-ref` 14 · `→undefined` 53 等），键数 108 → 60。**但这不可达是"解构式接线"的必然**（要 `setup-const` 就得在 .vue 里出现 `const/ref(` —— 违反铁律②），且**语义面由更硬的判据替代**：`$setup` 44 名集合全等 + `_ctx`/`unref` 全 0 + `__returned__` 无缺失 + 运行时类型实测（§4）。**判定：可接受的登记型偏离，非缺陷。**
- **M5/C6「`FEATURE_CHECKER_ENTRY` 应为 `setup-const`」字面不成立**（实测 `setup-maybe-ref`），但 **K1 的实质要求（值必须是普通布尔 `false`，不能是 ref）在运行时被逐条证实**（§4-T1）。⇒ 判定同上。

---

## 3 ★V4 · 自由标识符扫描（新增必做判据④，**自建 AST 实现**）

**实现**：`@babel/parser@7.29.8` + `@babel/traverse@7.29.8`（`client/node_modules`，禁联网），`Program→scope.crawl()`，对每个 `ReferencedIdentifier` 判 `scope.getBinding(name)`；未绑定且不在紧凑的 JS/浏览器全局白名单内 ⇒ 计为自由标识符（**不是正则扫描**）。

```
===== V4 free-identifier scan (AST scope analysis, @babel/traverse) =====
[useChecker.js] 0        [useEditorWorkspace.js] 0   [useLoadQuestion.js] 0
[useProjectQuestionPage.js] 0   [useQuestionForm.js] 0   [useSaveQuestion.js] 0
[useStudentSubmission.js] 0     [useZipUpload.js] 0      [zipEntry.js] 0
[ProjectQuestionEdit.vue script setup] 0
TOTAL free identifiers = 0

===== 扫描器正控（变异反证，证明它不是"永远报 0"）=====
mutated W2 (ref import removed)  -> detected: ["ref"]         ← 正是 E1 的形态
mutated W2 (unknown callee)      -> detected: ["useMonacoThemeTypo"]
injected free name into zipEntry -> detected: ["checkerLoadedOnce"]
```

**结论：0 命中，且扫描器正控 3/3 命中** ⇒ E1（W2 少 import → 运行期 `ReferenceError`，而 `vite build`/L0/L1 全盲）这一类缺陷**在本轮终态中不存在**，且该判据的**检出能力已被证明**（不是"扫了个寂寞"）。

---

## 4 ★V8 · 真运行时对拍（新增必做判据⑤，**自建装置，未复用 B 的 `/tmp/c5b/rt`**）

### 4.1 装置（全部在 `/tmp/c5c/`，仓库外）

| 组件 | 说明 |
|---|---|
| 被测代码 | 9 个模块**逐字节副本**（`cmp` 全部 OK）+ `domain/format.js`/`domain/fileLang.js`/`useTheme.js` **逐字节副本** |
| 插桩副本 | `useMonacoTheme.js`/`useMonacoKeyboardA11y.js`：**仅在函数入口加一行计数**（`globalThis.__calls.*++`），其余逐字 |
| 接线根来源 | `page.mjs` 由**真 .vue 的 `<script setup>` 原文派生**（import 行上提、5 个 specifier 重指向替身），`return` 直接采用编译器生成的 `__returned__`（59 项） |
| 模板 | `tpl.mjs` = `compileTemplate()` 的**真实产物**；用**真 Vue 3.5.34 的 `createRenderer`** + 自写 nodeOps 挂载 ⇒ **模板对 `$setup` 的每一次访问都是真发生的**（缺名字/值错会立刻暴露） |
| 生命周期 | **真 Vue 的 `onMounted`/`onBeforeUnmount`**（非替身）：`onMounted` 在 mount 内同步 flush，`app.unmount()` 按注册顺序执行 hook |
| 替身 | `vue-router`/`ant-design-vue(message)`/`dompurify`/`@monaco-editor/loader`/`legacyLoaderCompat`/`api/request`/`api/projects` + 4 个 .vue 组件（渲染全部 slot）+ **`Transition` 改为直通**（纯动效件） |
| 环境替换 | `import.meta.env.BASE_URL` → `"/"`（= Vite 构建期替换，BASE_URL 默认值）；`document` 极简替身；无网络、无端口、不碰库 |

**装置自证**：`client/dist` 未变；仓库内零写入；9 模块 `cmp` 全等；两次同场景运行**逐字节相同**。

### 4.2 被执行的运行时事实（期望 vs 实测）

| # | 事实 | 期望 | 实测（teacher / student） | 结论 |
|---|---|---|---|---|
| **T1** | `FEATURE_CHECKER_ENTRY` 类型/值 | `isRef===false`、`typeof 'boolean'`、`=== false` | `isRef=false`、`boolean`、`false`（两模式同） | ✅ |
| **T1b** | `:38` 守卫真值 | 假（按钮不出现） | `isTeacher && isEdit && FCE` = **false**；渲染树中 **`class="checker-btn-wrap"` 不存在**（两模式均无） | ✅ **K2/N3** |
| **T1c** | 模板可见名（运行时） | 44 名一个不漏 | 渲染**未抛错、无"accessed but not defined"**；`__returned__` 59 项；`isTeacher/isStudent/isEdit/submitting/…` 全 `isRef`；`form` 为 `reactive`（非 ref） | ✅ |
| **T2** | hook 队列 | `disposeAll → disposePage` | `beforeUnmount` hook **恰好 2 个**；卸载 oplog：a11y 移除监听（disposeAll）**先于** `model.dispose`/`editor.dispose`（disposePage） | ✅ |
| **T2b** | 清理内部 4 步：`:749→:750→:751→:752` | `clearInterval` 夹在 a11y 与 model 之间 | poll 场景实测 oplog = `["el.removeEventListener:keydown","el.removeEventListener:keydown","clearInterval","model.dispose:file:///lib/z.cpp","editor.dispose"]` —— **逐位相符，未合并/未换序/未置空** | ✅ |
| **T2c** | 双重释放（既有行为） | 照旧存在 | 两个 `removeEventListener`（`disposeAll` + `:749` 等价体）**各自发生一次**，与源文件 `:231/:749` 结构一致 | ✅ 未被放大 |
| **T3** | Monaco `create` 计数 | ≡ 1 | 加载已有题（教师）=**1**；再走上传回调 `onZipReady` =**仍 1**；学生模式加载 =1、提交后 =**仍 1** | ✅ **U2** |
| **T3b** | 两个辅助 composable 调用次数 | 各 1 次 | `monacoTheme=1`、`a11y=1`（加载后与上传后均未增长） | ✅ |
| **T3c** | 挂载路径 | `editorContainerRef` 由模板 ref 提供 | 挂载瞬间 ref = `null`；`hasUploaded` 翻真后 ref = **真 `div.editor-container`**（由 Vue `setRef` 写入）→ 才 `initMonaco()`。`loader.config → applyMonacoCompat → loader.init → languages.register×2 → editor.create → attach(updateOptions + addEventListener:keydown) → createModel → setModel` | ✅ **U4 的机制被真复现** |
| **T4** | 保存守卫 4 分支 + 3 逃生通道 | 1:1 | **stale**：`标准工程包已更换，请重新生成自动评分器` + **弹窗打开** ✔（由真上传置 stale 触发）；**generating**：`自动评分器生成中，请稍候再保存` + **弹窗不打开** ✔；**review**：`自动评分器已生成但未确认启用，请打开自动评分器完成确认` + **打开** ✔；**none**：`请先生成自动评分器（当前状态：none）` + **打开** ✔；**ready**：`PUT /teacher/questions/7` body `{title,difficulty,maxScore,type:'project',material,scoringRubric}` + `保存成功` + `router.push('/teacher/questions')` ✔；空标题 → `message.warn('请输入题目名称')` ✔ | ✅ **N2/U5** |
| **T5** | ★U1 双模式求值一致性 | 与改前语义相同 | teacher：`isTeacher=true/isStudent=false/isEdit=true`；**student：`isTeacher=false/isStudent=true/isEdit=false`**（学生路由无 `params.id` ⇒ `!!route.params.id` 仍求值为 `false` —— **"逐字保留未被顺手修"被运行时证实**）；渲染树 **teacher 有"保存"无"提交答案"**、**student 有"提交答案"无"保存"** | ✅ **N1/U1** |
| **T6** | 学生提交路径 | 学生专属分支可达 | 未上传 → `message.warn('请先上传项目文件')`；上传后 → `POST /student/assignments/1/project/2/submit`、`submitting` 复位 false、`studentStatusText='已提交，待评分'`、`studentStatusType='info'`、`canStudentSeeScoreNow=false`、`hasUploaded=true`、Monaco 仍 1 次 | ✅ |
| **T7** | 轮询生命周期 | `setInterval` 有对应 `clearInterval` | `generating` 场景：`intervalsSet=1`、卸载前存活 1；卸载后 **存活 interval = 0**、`models=0` | ✅ **U3（部分）** |
| **T8** | 教师上传回调 | `tempId` 落库前的写入 | `onZipReady` → `UPLOAD` → `form.tempId='TMP-1'`、`externalTree` 换新、`openTabs` 追加且 `activePath='src/a.cpp'`（`openFile`/`switchTab` 生效） | ✅ |
| **T9** | 死代码仍可调用（K5） | 保留且可达 | `handleGenerateChecker`/`copyScript`/`checkerLogs`/`checkerLoading` 均在返回面上（未被删、未改名） | ✅（未逐个调用，见 §5 未执行清单） |

### 4.3 ★变异反证（5/5 全中）+ 惰性对照（0 差异）

| 变异 | 位置 | 装置反应 |
|---|---|---|
| **M1 清理顺序换位**（`disposeModels` 提到 `stopCheckerPoll` 之前） | W9 `disposePage` | **报差异**：oplog 变 `…model.dispose → clearInterval → editor.dispose` ✅ |
| **M2 去掉 `externalTree`/`fileContents` 注入** | W9 → W5 参数表 | **崩**：`useZipUpload.js:26 fileContents.clear() → TypeError` ✅（= E2 的形态） |
| **M3 复现 E1**（W2 的 vue import 去掉 `ref`） | W2:8 | **崩**：`ReferenceError: ref is not defined`（setup 首行）✅ |
| **M4 常量改 ref**（`FEATURE_CHECKER_ENTRY = ref(false)`） | W4 | **报差异**：`FCE_isRef=true`、`rawTruthy=true` ✅ |
| **M5 删掉 stale 分支的逃生通道** | W7:24 | **报差异**：`checkerOpen` 由 `true` 变 `false` ✅ |
| **惰性对照**（原树同场景跑两遍：teacher-load / save-ready） | — | **逐字节相同（0 差异）** ⇒ 装置不误报 ✅ |

### 4.4 ★两张清单

**(A) 被执行的运行时事实**（23 条）：FEATURE_CHECKER_ENTRY 类型/值/守卫真值 · `checker-btn-wrap` 两模式均不渲染 · 44 名在运行时全部可解析（真模板渲染无错）· hook 队列长度 2 与 `disposeAll→disposePage` 顺序 · 清理 4 步逐位顺序（含 `clearInterval`）· 双重释放照旧两次 · Monaco `create` ≡ 1（教师加载 + 上传 + 学生加载 + 学生提交四条路径）· `useMonacoTheme`/`useMonacoKeyboardA11y` 各 1 次 · `editorContainerRef` 由模板 ref 在 `hasUploaded` 后写入 · 4 条守卫文案 + 3 条逃生通道 + `generating` 不弹窗 · `ready` → PUT 载荷逐字段 + `保存成功` + `router.push` · 空标题 warn · 双模式 4 个模式常量值 · teacher/student 的按钮渲染差异 · 学生提交成功/缺文件两条文案 · 轮询 set/clear 配平与卸载后存活 interval=0 · `tempId`/`externalTree`/`openTabs`/`activePath` 写入 · models 卸载后归零。

**(B) ★未被执行的运行时事实（一律计入残留风险）**：
1. **真浏览器**：真 DOM/真 antd 组件/真 Monaco 运行时/真 `<Transition mode="out-in">` 的 300ms 时序（我用直通 Transition + 真 300ms 等待，但**动画与 DOM 切换本身未跑**）。
2. **真网络/后端**：真 `PUT`/`POST /submit` 的多段表单、真实响应形状、真 `router` 导航与路由重建组件。
3. **a11y**：axe 仍不可用（全盘缺失，禁联网）；`page.accessibility.snapshot()` **未跑**（需真浏览器）。K2/N3 的"按钮不出现"是**渲染树**级证据，不是**可访问性树**级证据。
4. **U3 的"控制台零 error"**：仅捕获了 Vue 运行期 warn/error（本装置的 warn 全是 antd 组件未注册造成的**装置噪声**）；真浏览器下的 `model disposed` 类告警未测。
5. **真实监听器泄漏**：`removeEventListener` 计数来自替身元素，真 DOM 只读复制不计。
6. **像素/视觉**：A 档按 DoD 不需要（模板与两样式块逐字节相等，逻辑上严格强于像素相等）；**未跑** `pixel-diff.mjs`（且其 `FIXTURES` 无本文件端点，跑了必然 exit 2）。
7. **K5 死代码的逐个调用**（`handleGenerateChecker`/`copyScript`/`checkerLoading`）只验证了"存在且被返回"，未实跑其分支；`showPromptPreview` 成功/失败两条文案未实跑。
8. **多实例/多页面会话**（同页重复挂载 N 次的模块级单例行为）未测。

---

## 5 V9 · 复核 B 自报的两条发现

### ① 「观察带 16→16」是方案错、实测应为 **16→15**

**我自己的命令**（不采信 B/arch-metrics 的打印）：
```
$ find server/src client/src -name '*.js' -o -name '*.vue' | xargs wc -l | awk '$1>800 && $2!="total"'
  teacherController.js 1338 / Doc.vue 1106 / ReviewDetail.vue 988 / QuestionEdit.vue 983 / reviewController.js 965   ⇒ >800 = 5
$ … | awk '$1>500 …'   ⇒ >500 = 15
$ comm -23 <(>800 名单) <(>500 名单)   ⇒ 空   ← ★">500 口径包含 >800" 得到直接证实
$ wc -l ProjectQuestionEdit.vue = 348   ｜ git show HEAD:… | wc -l = 868
$ wc -l client/src/composables/project/*.js = 793（最大 158）
```
**判定：B 的勘误成立**。`.vue` 868→348 后**离开 >500 集合**（改前在集合内），9 个新文件全部 <500（最大 158）不进集合，其余文件未变（`git status` 只显示这 1 改 + 9 新）⇒ **16 → 15**。A 方案 §2.2 的"16→16"确实错了（它误以为该文件"从未计入观察带"）；Captain 已把 `arch-metrics.mjs:25` 基线刷为 `{0, 44, 5, 15}`，实跑 PASS，口径与数字**均复核通过**。

### ② E1/E2 两条缺陷确实存在且已修掉 —— 终态验证

| 缺陷 | 终态证据（我的实测） | 判定 |
|---|---|---|
| **E1**：生成脚本补丁误改 W2 的 vue import（`ref, watch, nextTick` → `onMounted, onBeforeUnmount`）→ 运行期 `ReferenceError`，而 build 照过 | `useEditorWorkspace.js:8` = `import { ref, watch, nextTick } from 'vue';`（三个都用到：`ref` 4 处、`watch` 1 处、`nextTick` 1 处）；**自由标识符扫描 = 0**；**真运行时 setup 通过**；**M3 变异反证**证明"若再犯，装置会崩" | ✅ **已修好，且可被独立检出** |
| **E2**：A 方案 W5 行漏列 `externalTree`/`fileContents` → 漏注入 | `useZipUpload.js:13` 形参含 `externalTree, fileContents`；`useProjectQuestionPage.js:59` 实参**同步传入**（11 个注入参数逐一核对：form/isTeacher/externalTree/fileContents/editorContainerRef/resetModels/initMonaco/openFile/isCheckerLoaded/getCheckerStatus/checkerStale）；`onZipReady` **真跑成功**（写入 `tempId='TMP-1'`、`externalTree` 换新）；**M2 变异反证**证明漏注入必崩 | ✅ **已修好，注入齐备** |

---

## 6 V10 · L2 交互验证（是否完成）

**结论：N1/N2/N3 三条必做项已由 V8 装置覆盖并实测通过**（本任务书明文允许："若 V8 装置已能覆盖 N1/N2/N3，V8 即视为完成 N1–N3，无需重复搭 Playwright"）：

- **N1 双模式渲染一致性**：真模板渲染树 —— teacher 有「保存」无「提交答案」、student 反之；`isTeacher/isStudent/isEdit` 运行时值与"学生路由无 `params.id` ⇒ isEdit=false"逐条相符。
- **N2 保存守卫 5 条分支**：stale / generating / review / none / ready 全打；文案逐字、`generating` 不弹窗、**三条逃生通道都打开弹窗**、`ready` 的 PUT 载荷 6 字段逐字段正确。
- **N3 开关语义**：`FEATURE_CHECKER_ENTRY` 是普通布尔 `false` ⇒ `checker-btn-wrap` **两模式都不渲染**；**同一装置内**逃生通道仍工作（弹窗打开）—— 两条同时成立。

**未搭 Playwright**（时间盒内不必要，且风险面已被覆盖）：理由 ① N1–N3 已由更强的装置（真 Vue 渲染 + 真 hook + 真模板）覆盖；② rig 默认指向第二 worktree（G-A），且 `rig.sh build` 会写 `tests/`（本轮硬禁令）；③ 真后端/MySQL 与静态夹具的额外收益主要是网络契约，属另一类风险（已登记为残留）。**N4–N7（真实交互、a11y 树、真 Monaco）未跑**，计入 §4.4(B)。

---

## 7 缺陷分级

| 级别 | 编号 | 内容 | 影响 |
|---|---|---|---|
| **无阻断** | — | 未发现任何阻断/高/中级代码缺陷 | — |
| 低（文档口径） | **F1** | B §3 的切片"字节数/sha256"**不含末尾换行**（11490/3e12a1eb… vs 自然切片 11491/3658d354…），去换行后完全一致 | 仅口径未写明；已在本报告复现 |
| 低（记账口径） | **F5** | B 的"829 行逐字搬移"无法用其 §12 命令复现（dest 侧记账）；我的独立口径为 497/504 + 7 行全解释 | 结论不受影响 |
| 低（表述不精确，**已用变异证伪**） | **F6** | A §6.1 / B §4.3 称"`FEATURE_CHECKER_ENTRY` 改成 `ref(false)` 会让模板 `:38` 的 `&&` 判真 → 按钮重新出现"。**实测：不会**。模板走 `$setup`=`proxyRefs(setupState)`，ref 会被**自动解包**；M4 变异实测 `checkerBtnWrapPresent=false`（按钮仍不出现）。**但**"必须是普通 `const`"这条要求本身仍应保留（它使 `isRef=false` 可被静态/运行时探针检出，且不依赖解包语义） | 需求正确、**论证错误**；建议后续文档改写理由 |
| 信息 | **F3** | W2/W9 对 `legacyLoaderCompat` 的 import **无扩展名**（源 :202 原本如此）→ 原生 Node ESM 无法直接 import 整图（Vite 可解析）。非回归；对 C 的含义：**"真 import 一次"只能覆盖 `zipEntry.js` 这类叶子**，整图必须用加载钩子/替身（本报告的做法） | 方法学提示 |
| 信息 | **F4** | `checkerStale`/`uploadKeptCount`/`uploadKeptBytes` **不在 .vue 解构表**（模板不用）⇒ 无法从页面对象直接观测；我以"守卫命中哪条分支"间接证明 `checkerStale` 由上传置真 | 方法学提示 |

---

## 8 未做项与残留风险

1. **axe 未执行**（`axe-core` 三处 `node_modules` + `/tmp/t5-tools` 全缺；禁联网）→ 依 DoD 只能登记盲区；A 档口径建议的 `page.accessibility.snapshot()` **同样未跑**（需真浏览器）。
2. **像素门禁未跑**：A 档判定成立（3 段逐字节相等）；且 `pixel-diff.mjs` 的 `FIXTURES` 无本文件端点 ⇒ 跑了必然 exit 2，**不得当成 PASS**。
3. **N4–N7 的真实交互**（真 Monaco 挂载/真 tab 切换/真上传组件/真成绩卡片）未跑；本报告在替身层面覆盖了其**逻辑分支**。
4. **真后端契约**（`PUT /teacher/questions/:id`、multipart `POST …/submit`、`GET …/checker` 真实形状）未跑：本步不动 server，且后端套件按 V7 应逐字不变（未跑全量，见 5）。
5. **全量后端回归未跑**：本步 `git diff -- server/` = **0 行**（零成本哨兵通过）⇒ 按任务书无需跑全量；**若 Captain 要求绝对证据，此项仍是"未跑"**。
6. **多实例/长会话**（重复挂载、路由在同实例内切模式）未测：本仓靠路由重建组件（A §10-13 的前提），该前提若变化，U1 结论随之变化。
7. **装置的 3 处替身**（`Transition` 直通、4 个组件 stub、5 个相对模块替身 + 2 个插桩副本）已逐条登记；9 个被测模块与 3 个 domain/theme 模块是**逐字节副本**（`cmp` 已验）。

---

## 9 本步结论

**PASS —— 无需回流 B。**

- **验收判据 5/5 满足**：① L0 三块逐字节相等（模板 194 行 + **两个**样式块）＋ 搬移块 497/504 逐字、7 行差异全部在登记白名单内；② L1 编译级对拍：44+7 名全等、`$setup` 129/129、`_ctx`/`unref` 0/0、`__returned__` 59 覆盖模板所需 52 名、styles 数组全等、**剥掉 patchFlag 后模板产物逐字节相同**；③ 结构自检：`.vue` 无 `ref(/`reactive(/`computed(/`watch(`、`defineProps` 仍在、hook 各注册一次；④ **自由标识符扫描 0**（正控 3/3）；⑤ **真运行时对拍通过**（真 Vue + 真模板 + 真 hook）。
- **三条最硬要求**：形参名 `r`/`res` **未被统一**（逐字对拍覆盖）· composable 互 import **无环**（cycle SCC 0，96 文件/214 边；内部 10 条边）· 清理顺序 `:749→:750→:751→:752` **运行时逐位相符**（含 `clearInterval`），且 **hook 队列 = `disposeAll → disposePage`**。
- **开关与守卫**：`FEATURE_CHECKER_ENTRY` 运行时 `isRef=false`/`===false` ⇒ `checker-btn-wrap` 两模式都不渲染；同一装置内 **3 条逃生通道仍打开弹窗**、`generating` 不打开；模板守卫表达式源码与编译产物**均逐字相同**。
- **门禁全绿**：arch **0 / 44 / 5 / 15** · cycle **SCC 0**（214 边）· hard **0/0/0** · bind **0**；`vite build` **exit 0**；`client/dist` **未被重建**；`server/` **零 diff**。
- **发现**：0 阻断 / 0 高危；3 条低级（F1 口径、F5 记账、**F6 变异证伪的论证错误**）+ 3 条信息级。**建议**：F6 的事实（`ref(false)` 经 `$setup` 会被解包）写回 A/B 文档以免后续步骤照抄错误论证；K1 的"必须普通 const"要求**保留不动**。
