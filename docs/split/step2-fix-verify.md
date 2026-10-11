# step 2 返工修复 · 独立验证报告（判据④回溯 + 判据⑤真运行时）

> 验证者：**Agent C（独立验证者 / 只读）** ｜ 被验轮次：step 2 返工（缺陷由 step 6 的 Agent A 在判据④正控中检出）
> 立场：**不采信 Agent B 的自测**；判据④扫描器与判据⑤运行时装置**全部由 C 自建**（未复用 `/tmp/b-step2fix/**`）
> 时间：2026-10-11 ｜ 结论：**PASS**（详见 §13）

---

## 0 被验对象 · 工作树状态 · 被测树留痕

| 项 | 值 |
|---|---|
| 被测树（绝对路径） | `/Users/you/My Projects/My Vue/Exam-DeepSeek` —— **主仓库**，非第二 worktree `Exam-DeepSeek-ui` |
| HEAD | `b94407f84f44deb87e6fb6efbe2f1ad45290112c`（branch `master`）；验证全程 HEAD 未变 |
| 改动范围 | `git diff --numstat` = **仅 2 文件 · 各 1 增 1 删**（见 §1） |
| 指纹 | `useQuestionNav.js` = `0bd3a5e758e75dd9c6041c262fcc108a`｜`useSubmitPage.js` = `5bc8c8296bfd6846f406eb0f19c5640a`｜`Submit.vue` = `2ce4c9a7fd65edd95e69141c073f5581`（631 行，**未改**） |
| 工作树其它 M 项 | `docs/split/status.md`（step 6 的 Agent 写入，非 B 非 C） |
| 运行环境 | Node `v24.19.0`｜Vue `3.5.34`｜Chromium `148.0.7778.96`（Playwright `1.60.0`）｜测试库 `exam_system_test`@`localhost:3306` |
| C 的写动作 | **仅 2 个文件**：本报告 + `docs/split/test-round-12.log`（回归脚本产物）。其余全部读操作；**无任何 git 写操作**；未碰 `client/src/views/teacher/QuestionEdit.vue` 与 `client/src/composables/question/`；未重建 `client/dist`；未占用 :5173/:3000 |

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| V1 | 锚点（HEAD / md5 / numstat） | b94407f… / 2 个 md5 相符 / 2 文件各 1±1 | 全部相符 | ✅ |
| V2 | 缺陷五件证据链 | 5/5 成立 | 5/5 成立（用 `git show HEAD:` 的原件复核） | ✅ **成立** |
| V3 | 判据④扫描 | client 52 + server 108 = **0 命中** | **160 文件 / 0 命中 / 0 解析错误** | ✅ |
| V4 | 正控 + 干净树 | 3 类正控各报 ≥1；干净树 0 | 删 import 6 命中 · 改名 1 命中 · 去注入 1 命中 · .vue 控制 1 命中；干净树 0 | ✅ |
| V5 | 判据⑤真运行时 | 修前全抛 / 修后不抛且行为正确 / 2 条反证仍抛 | **真 Chromium + 真 DOM + 真 KeyboardEvent**：修前 7/7 抛；修后 7/7 不抛且 anchor+focus 均变化；反证 7/7 仍抛 | ✅（**修正 B 的报错身份**，见 §5.4） |
| V6 | 五门禁 + 不变量 | 违规 0 / 未分层 **44** / GodFile **5** / 观察带 **15** / SCC **0** / 0-0-0 / bind 0 | 逐项相等，5/5 PASS | ✅ |
| V7 | 定向 6 套件 | 各自独立进程全绿 | 61/21/42/19/9/18 = **170 passed / 0 failed** | ✅ |
| V7b | 假红复核 | 复核 B 的"形态性假红"判断 | **成立**（并**独立定位到根因**，见 §7） | ✅（修正 2 处细节） |
| V8 | 全量回归 | 4 处 `Test Suites:` + failed=0 | `ROUND=12` → **4 处摘要 / 0 failed / exit 0**（1073 passed） | ✅ |

---

## 2 V1 锚点

```
$ git rev-parse HEAD
b94407f84f44deb87e6fb6efbe2f1ad45290112c

$ md5 client/src/composables/submit/useQuestionNav.js client/src/composables/submit/useSubmitPage.js
MD5 (client/src/composables/submit/useQuestionNav.js) = 0bd3a5e758e75dd9c6041c262fcc108a
MD5 (client/src/composables/submit/useSubmitPage.js)  = 5bc8c8296bfd6846f406eb0f19c5640a

$ git diff --numstat -- client/src/composables/submit/
1	1	client/src/composables/submit/useQuestionNav.js
1	1	client/src/composables/submit/useSubmitPage.js

$ git diff --stat | tail -3
 client/src/composables/submit/useQuestionNav.js |  2 +-
 client/src/composables/submit/useSubmitPage.js  |  2 +-
 docs/split/status.md                            | 11 ++++++-----
```

⇒ **三个指纹与 B 报告逐字相符**；submit/ 目录下**只有这 2 个文件被改**，且每文件 **1 增 1 删**（= 1 行替换）。`Submit.vue` 的 `git diff` 为空、md5 未变 ⇒ 模板与样式**逐字节未动**（A 档"不需要像素门禁"的前提成立）。

---

## 3 V2 缺陷复核（五件证据链，原件取自 `git show HEAD:`）

| # | 主张 | 实测 | 结论 |
|---|---|---|---|
| ① 修前注入清单缺 `subQuestions` | `git show HEAD:…useQuestionNav.js` 第 11 行 = `  route, confirm,`（无 subQuestions） | ✅ |
| ② 调用点未传 | `git show HEAD:…useSubmitPage.js` 第 122 行 = `    route, confirm,`；而 :103（useDraftSave）/ :109（useSubmitActions）/ :42（useCountdown）**都传了** `subQuestions` | ✅ |
| ③ `boxIndex` 体内真读它 | `useQuestionNav.js:76` `const boxIndex = computed(() => {` → `:78` `subQuestions.value.forEach((sq, i) => {`（该行**修前修后字节相同**，改动只落在 :11） | ✅ |
| ④ `onBoxKeydown` 被模板真绑定 | `onBoxKeydown`(:108) 首句 :109 = `boxIndex.value.findIndex(...)`；链路 `useQuestionNav:140` 导出 → `useSubmitPage:119` 解构 → `:170` 再导出 → `Submit.vue:305` 解构 → **模板 :43 / :60** 两处 `@keydown="onBoxKeydown(...)"` | ✅ |
| ⑤ 静默潜伏（未被接线根解构） | `boxIndex` 虽在 :139 的 return 里，但 `useSubmitPage.js:117-120` 的解构表**没有它**；全仓 grep：`boxIndex` 仅出现在该 composable 内部（:76/:99/:109/:117/:139），**无任何外部读取** ⇒ computed 惰性求值，不按键盘不求值 | ✅ |

**可达性结论**：学生答题页在**题号方块**上按任意键 → 首次求值 `boxIndex` → 抛错 → 处理函数中断。**缺陷成立，且是 DoD §5 明示的"方案漏列依赖导致注入缺失"形态**。`vite build` / L0 字节判等 / L1 bindings 对拍三条判据对它全盲（非模板可见名、非语法错误、非跨模块导出缺失）。

---

## 4 ★V3 判据④扫描（C 自建，未复用 B 的脚本）

### 4.1 装置

| 项 | 值 |
|---|---|
| 源码 | `/tmp/c-step2-verify/scan/free-ident-scan.mjs`（**C 从零自写**，仓库外） |
| 依赖 | `@babel/parser` + `@babel/traverse`（取自 `client/node_modules`，禁联网），版本由 client 的依赖树决定 |
| 算法 | **两遍**：① `traverse(ast,{Program(p){p.scope.crawl()}})` 全量建绑定；② 第二遍对每个 `ReferencedIdentifier` 判 `p.scope.getBinding(name)`；无绑定且不在白名单 ⇒ 命中 |
| 白名单 | JS 内建 + 浏览器/Node 全局 + Vue 编译器宏（`defineProps` 等）+ CJS 包装名 —— **不含任何本仓标识符** |
| `.vue` 处理 | 抽出全部 `<script>`/`<script setup>` 正文，按真实行号偏移（`lineOffset`）还原；本仓 views 下 `lang="ts"` 数量 = **0**，无 TS 分支 |
| 退出码 | 0 = 0 命中；1 = 有命中；2 = 解析错误 |

**关键实现要点（对象方法简写的形参）**：`then(onFulfilled, onRejected){…}` 里的名字是 `ObjectMethod` 的**形参**，`scope.crawl()` 会在该方法函数作用域内建绑定 ⇒ `getBinding` 命中，**不误报**。实测：

```
$ node free-ident-scan.mjs client/src/composables/useConfirm.js
[0] client/src/composables/useConfirm.js
FILES=1  FREE_IDENTIFIERS=0        exit=0
```

⇒ A 报的 `useConfirm.js:36-37` 假阳性**复核为真·非缺陷**，未计入缺陷清单。

### 4.2 结果：160 文件全 0

```
$ node free-ident-scan.mjs client/src/composables client/src/views
FILES=52  FREE_IDENTIFIERS=0  PARSE_ERRORS=0        exit=0
$ node free-ident-scan.mjs server/src server/scripts server/test-grading.js
FILES=108  FREE_IDENTIFIERS=0  PARSE_ERRORS=0       exit=0
```

文件口径（`find` 实测，与 B 报告一致）：client = composables 25 `.js` + views 27 `.vue` = **52**；server = `server/src` 96 + `server/scripts` 11 + `server/test-grading.js` 1 = **108**。

**回溯源**（C 自证扫描器对该缺陷有牙）：把 `git show HEAD:` 的**修复前原件**喂给同一扫描器 →

```
$ node free-ident-scan.mjs /tmp/c-step2-verify/pristine/useQuestionNav.js
[1] …/pristine/useQuestionNav.js  -> subQuestions@78
FREE_IDENTIFIERS=1        exit=1
```

⇒ 回溯命中数 = **1**，且正是本次修掉的那一处；修复后 160 文件全 0。

### 4.3 ★补充装置 V3c：模板侧自由标识符（脚本侧扫描的天然盲区）

判据④只做**脚本作用域**检查，对"只在 `<template>` 里出现、setup 未暴露"的名字**看不见**（这类名字在 Vue 里编译通过、运行期才炸）。C 另建 `template-free-ident.mjs`：`@vue/compiler-sfc` 的 `compileScript().bindings` 作为 bindingMetadata 喂给 `compileTemplate(prefixIdentifiers:true)`，再收集编译产物里所有**无法从 setup 绑定解析**的 `_ctx.NAME`。

```
$ node template-free-ident.mjs client/src/views
…（27 行全部 [0]）…
VUE_FILES=27  WITH_TEMPLATE=27  TEMPLATE_UNRESOLVED=0      exit=0
```

### 4.4 ★补充装置 V3d：client 侧跨模块具名绑定静态自检（B §3.6 指出的门禁缺口）

`scripts/gates/bind-check.mjs` 的根只有 `server/src`+`server/test`，**client 侧没有等价门禁**（这正是 project-constraints 第 12 条记录的"导入了但对方没导出"缺陷类的唯一防线）。C 自建静态版：解析每个相对 import，解析目标文件（含 `.vue`；`<script setup>` 视为具有隐式 default 导出），对拍具名导入与目标导出面。

```
$ node client-bind-check.mjs client/src
CLIENT_BIND_CHECK  files=80  imports=212  violations=0  unresolved_relative=0     exit=0
```

正控（把整棵 `client/src` 复制到 /tmp 后改名一个导出）：

```
[MISSING named] …/mutant-src/composables/project/useProjectQuestionPage.js:12 -> 'useChecker' not exported by …/useChecker.js
CLIENT_BIND_CHECK  files=80  imports=212  violations=1                            exit=1
```

⇒ 该装置有牙且干净树 0 违规。（注：首版对 63 个 `<script setup>` SFC 误报 "MISSING default"，已修正并复跑 —— 如实登记。）

---

## 5 ★V4 正控与干净树

全部变异只发生在 `/tmp/c-step2-verify/mutants/` 的**副本**上，仓库源文件未被触碰。

| 控制 | 变异 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| PC1 删 import | 删 `useQuestionNav.js` 的 `import { ref, reactive, computed, nextTick } from 'vue'` | ≥1 | **6 命中**：ref@19, ref@20, reactive@21, nextTick@51, computed@75, nextTick@103；exit 1 | ✅ |
| PC2 改名 | 把一处 `focusBoxAt(idx)` 改成未声明的 `focusBoxAtTYPO(idx)` | 1 | **1 命中 @104**；exit 1 | ✅ |
| PC3 去注入（本缺陷原形） | 从注入清单删掉 `subQuestions` | 1 | **1 命中 `subQuestions@78`**；exit 1 | ✅ |
| PC5 .vue 路径控制 | `Submit.vue` 的 `onMounted(onPageMounted)` → `onMountedTYPO` | 1 且**行号须为 316** | **1 命中 @316**（真实行号，证明 `.vue` 抽取与行偏移正确）；exit 1 | ✅ |
| 干净树复跑 | 无 | 0/0 | client 52→0、server 108→0；exit 0 | ✅ |

**边界登记（如实）**

- **PC4（信息性）**：只删**调用点**的 `subQuestions` 不会在 `useSubmitPage.js` 里产生自由标识符 ⇒ 扫描器报 0。这说明判据④是**逐模块作用域检查**，看不见跨文件的接线错配；它这次能抓到本缺陷，是因为**被调方模块内部**存在自由读取。**结论：判据④不能单独作为"接线正确"的证据**，必须与 ⑤（运行时）配合 —— 本次正是这么做的。
- **模板盲区实证**：若把 `.vue` 的 script 里某个**绑定名**改名而模板仍用旧名（如 `sqBoxClass`），脚本侧扫描报 0（模板不是脚本作用域）。该形态由 §4.3 的 V3c（以及 step 2 的 L1 bindings 对拍）覆盖。

---

## 6 ★V5 判据⑤真运行时（C 自建装置；**真浏览器**）

### 6.1 装置与真实度（比 B 的合成 DOM 替身更强）

| 组件 | 真实度 |
|---|---|
| 浏览器 | **真 Chromium 148.0.7778.96**（Playwright 1.60.0，headless；`client/node_modules`） |
| DOM | **真 DOM**（浏览器原生）——**不是**合成替身、**不是** jsdom（本仓确实未安装 jsdom：`find` 全仓 0 命中） |
| Vue | **真 `vue.esm-browser.js` 3.5.34**（md5 `0272a955275eb7a833b5ec3f39a7fe0c`，含运行时编译器） |
| 模板 | 从真 `Submit.vue` **第 25-64 行逐字节截取**（该片段含 `:43`/`:60` 两处 `@keydown`，脚本内断言 =2）；sha256 `671a4034ddf8e23be5b036c665947578a322482e4a20c516a37e1746f397f477`；**运行期由驱动重新从活树截取并比对 sha256 → `TEMPLATE_BYTES_MATCH_LIVE_TREE=true`**；唯一人工补全 = 外层 `<div class="sp-nav-list">`（与 `Submit.vue:24` 同一行内容，为平衡标签） |
| 被测模块 | 真文件的**逐字节副本**，仅规范化 2 条 import 说明符（`ant-design-vue`→shim、`../../api/request.js`→shim）；测试时驱动重新对磁盘算 md5 与声明值比对（`fixed`/`pristine` 均相符） |
| 事件 | **真 `KeyboardEvent`** 经 `el.dispatchEvent()` 派发到真元素 → 真 Vue 元素级监听器 → `onBoxKeydown` |
| 焦点 | **真焦点**：`document.activeElement` 实测（非计数替身） |
| 错误链 | 真 `app.config.errorHandler` + `window.onerror` + `unhandledrejection` 三路捕获 |
| 服务 | C 自建静态服务 `127.0.0.1:3199`（31xx 非特权端口；未碰 :5173/:3000） |

夹具：3 个方块（客观题 2 问 + 编程题 1 个）⇒ `boxIndex` 长度 3、DOM 顺序 = `[sq-s1-item-0, sq-s1-item-1, sq-s2]`；每个按键从第 2 个方块（idx=1）起手。

### 6.2 2×2 矩阵（修复的两半各自独立验证 + 两条反证）

| 组合 | 模块 | 调用点传 `subQuestions` | 含义 |
|---|---|---|---|
| `bad` | 修复前原件 | 不传 | **缺陷原形**（两半都没改） |
| `good` | 现工作树 | 传 | **本次修复** |
| `halfA` | 修复前原件 | **传** | **反证 A：只补调用点，不补注入清单** |
| `halfB` | 现工作树 | **不传** | **反证 B：只补注入清单，调用点不传** |

**实测（真浏览器；每格 7 条按键路径）**

```
===== combo=bad  [PRE-FIX original]  vue=3.5.34  .n-box=3 =====
  "Enter"      | (empty) -> (empty) | focus 1 -> 1 | active=- | ReferenceError: subQuestions is not defined [native event handler]
  " "          | (empty) -> (empty) | focus 1 -> 1 | active=- | TypeError: Cannot read properties of undefined (reading 'findIndex')
  "ArrowRight" | (empty) -> (empty) | focus 1 -> 1 | active=- | TypeError: …reading 'findIndex'
  "ArrowDown"  | (empty) -> (empty) | focus 1 -> 1 | active=- | TypeError: …reading 'findIndex'
  "ArrowLeft"  | (empty) -> (empty) | focus 1 -> 1 | active=- | TypeError: …reading 'findIndex'
  "ArrowUp"    | (empty) -> (empty) | focus 1 -> 1 | active=- | TypeError: …reading 'findIndex'
  "a"          | (empty) -> (empty) | focus 1 -> 1 | active=- | TypeError: …reading 'findIndex'
  ⇒ 7/7 抛；activeAnchor 全程不变；焦点全程不动

===== combo=good  [fix applied]  vue=3.5.34  .n-box=3 =====
  "Enter"      | (empty) -> sq-s1-item-1 | focus 1 -> 1 | active=1 | -
  " "          | (empty) -> sq-s1-item-1 | focus 1 -> 1 | active=1 | -
  "ArrowRight" | (empty) -> sq-s2        | focus 1 -> 2 | active=2 | -
  "ArrowDown"  | (empty) -> sq-s2        | focus 1 -> 2 | active=2 | -
  "ArrowLeft"  | (empty) -> sq-s1-item-0 | focus 1 -> 0 | active=0 | -
  "ArrowUp"    | (empty) -> sq-s1-item-0 | focus 1 -> 0 | active=0 | -
  "a"          | (empty) -> (empty)      | focus 1 -> 1 | active=- | -
  ⇒ 7/7 不抛；Enter/Space 激活当前方块；方向键真实移动焦点并高亮目标方块；普通字符按源码 :119 else-return 不激活

===== combo=halfA  [反证 A：只补调用点] =====   7/7 抛（首条 ReferenceError，其余 TypeError findIndex）
===== combo=halfB  [反证 B：只补注入清单] ===== 7/7 抛（首条 TypeError reading 'value'，其余 TypeError findIndex）
```

⇒ **两条反证证明修复的两半都不可省**；修后不仅"不抛"，而且**用户可见行为**（高亮类 `n-box-active` + 真实焦点位置）逐条正确。

### 6.3 ★与 B 的差异（对抗性发现的精度修正）

B 报告 §4.2 称"修复前 **7 个按键路径全部抛 `ReferenceError: subQuestions is not defined`**"。**C 实测：只有第一次求值抛 ReferenceError，其余路径抛 `TypeError: …reading 'findIndex'`。**

根因（读到 Vue 源码 + 实测双重确认）：`@vue/reactivity` 的 `refreshComputed` 在
```js
computed.flags &= -17;                              // 清 DIRTY
if (computed.globalVersion === globalVersion) return;   // ← 提前返回
```
处提前返回：getter 抛错后 `computed._value` 仍是 `undefined`、且不会重新求值 ⇒ `boxIndex.value` 静默返回 `undefined` ⇒ 调用方 `.findIndex` 才炸。C 的对照实验证实：**跳过预探测**时（`skipProbe=1`，等价于"学生进入页面后第一次按键"）第 1 条是 `ReferenceError`、其后 6 条是 `TypeError`；**先探测一次**时 7 条全是 `TypeError`。B 的表里 7 条全 ReferenceError，应是其装置每格重建/重算所致。

**该差异不影响结论**：两种身份**都是逃出事件处理函数的未捕获异常**，用户可见后果完全相同（不导航、不高亮、焦点不动）——即 A 的诊断与"学生答题页按任意键即报错"的定性**成立**。

### 6.4 ★如实说明：验到了哪一层 / 没验到哪一层

**验到了**
1. 真浏览器 + 真 DOM + 真 Vue 3.5.34 下，真 `KeyboardEvent` 经真模板的 `@keydown` 绑定进入 `onBoxKeydown`；
2. 修复前该路径**真的抛**（7/7），修复后**真的不抛**（7/7）；
3. 行为面：`activeAnchor` 值变化、`n-box-active` 类落点、**`document.activeElement` 真实焦点迁移**、普通字符不激活；
4. 修复的两半各自必要（反证 A/B 各 7/7 仍抛）；
5. 模板片段是**运行期从活树重新截取并 sha256 比对**的，测的就是当前 `Submit.vue` 的字节。

**没验到（不得含糊）**
1. **不是整页**：只渲染了 `Submit.vue:25-64` 的题号导航段（+ 容器）。Monaco 编辑器、材料区、提交栏、轮询、倒计时**均未渲染** ⇒ "整页挂载无报错"**未被本装置证明**。
2. **不是真应用包**：被测模块有 2 条 import 说明符被规范化到替身（`ant-design-vue` 的 `message`、`api/request.js` 的 `request`）；被测路径不触发它们，但它们**不是真模块**。
3. **没有路由/Pinia/真实学生登录态**：`route` 是普通对象 `{params:{id}}`，未走 `useRoute()`、未走 store、未走权限守卫。
4. **没有真后端**：不发任何请求，未验提交/重试/草稿链路。
5. **没有跑 step 2 归档的 L0/L1/L2 装置**：未做 `compileScript().bindings` 的**逐字节**对拍（§4.3 做的是**名字集合**层面的等价检查，强度不同）；未跑 Playwright 像素/axe 门禁（A 档不需要，且 `Submit.vue` 模板/样式字节未动可证）。
6. **未验真滚动**：`scrollTo` 依赖的 `#sq-*` 锚点元素不在本夹具 DOM 内，`scrollIntoView` 未被真实触发。
7. **未验模板动态解析**：V3c 覆盖的是静态可解析的名字集合，不覆盖运行期动态注册组件等形态。

---

## 7 V6 五门禁 + 不变量

```
$ node server/scripts/check-layers.mjs
文件 96 个，违规 0 条（0 类规则），未分层待迁移 44 个                      exit=0
$ node scripts/gates/arch-metrics.mjs
  ✓ layerViolations  基线=0  实测=0
  ✓ unmigrated       基线=44 实测=44
  ✓ godfileOver800   基线=5  实测=5
  · >500 行（观察带） 基线=15 实测=15
  GodFile>800：teacherController 1338 / Doc.vue 1106 / ReviewDetail.vue 988 / QuestionEdit.vue 983 / reviewController 965
结论：PASS                                                                  exit=0
$ node scripts/gates/cycle-check.mjs
  扫描 96 文件 / 214 条相对导入边 ｜ 强连通分量（|SCC|>1）: 0（基线 0）｜ 自环 0
结论：PASS                                                                  exit=0
$ node scripts/gates/hard-metrics.mjs
  ✓ hex6 0/0  ✓ important 0/0  ✓ modalConfirm 0/0   结论：PASS              exit=0
$ node scripts/gates/bind-check.mjs
  modules scanned 194 ｜ named import bindings 652 ｜ unresolved 4（仅登记）｜ external 1（仅登记）
  BINDING VIOLATIONS: 0                                                     exit=0
```

**不变量逐项相等：未分层 44 / GodFile 5 / 观察带 15**（与 arch-metrics 基线完全一致，**未劣化**）。

---

## 8 V7 定向测试（6 套件各自独立进程）

```
rule-executor   61 passed / 61
rule-mutator    21 passed / 21
checker-service 42 passed / 42
deepseek        19 passed / 19
rubric-items     9 passed /  9
trustjudge-grader 18 passed / 18
合计           170 passed / 0 failed      （与 B 报告一致）
```

前置：`DATABASE_URL` 由 `server/.env` 换库名为 `exam_system_test`（`test/setup.js` 白名单强制）；`PORT=0`；`prisma db push --skip-generate`（already in sync）。

---

## 9 ★V7b 假红复核（B 登记的 `rule-mutator 11 failed`）

### 9.1 复现

把 6 个套件**塞进同一个 jest 进程**批跑：

```
Test Suites: 1 failed, 5 passed, 6 total
Tests:       11 failed, 159 passed, 170 total
FAIL test/unit/infrastructure/rule-executor.test.js      ← 失败者是它
PASS test/unit/infrastructure/rule-mutator.test.js
报错：TypeError: Cannot read properties of undefined (reading 'type')
      at walk (src/infrastructure/rule/syntax.js:49:11)   ×11
```

⇒ **假红确实存在且可复现**。但 **失败套件是 `rule-executor`，不是 B 报的 `rule-mutator`**（B 的结论方向对，归因不准）。

### 9.2 隔离矩阵（C 自建）

| jest 进程内的套件组合 | 结果 |
|---|---|
| `rule-mutator` 单独 | 21/21 PASS |
| `rule-executor` 单独 | 61/61 PASS |
| `rule-mutator, rule-executor` | 一套 PASS、**另一套 FAIL 11** |
| `rule-executor, rule-mutator` | 一套 PASS、**另一套 FAIL 13** |
| `rule-executor, rule-mutator, checker-service` | **FAIL 11**（executor），另两套 PASS |
| `rule-mutator, checker-service` | 63/63 全 PASS |
| `rule-mutator, trustjudge-grader` | 39/39 全 PASS |
| `rule-mutator, rubric-items, deepseek` | 49/49 全 PASS |

**规律**：只有当**两个消耗 tree-sitter 的套件**（`rule-mutator` / `rule-executor`）同进程时才发生；与 tree-sitter 无关的套件无论怎么搭都不复现。**每次恰好有一套失败（11 或 13 条），具体是哪一套随 jest 的调度顺序漂移**（同一命令行两次结果也可能互换）—— 这正好解释了 B 看到的"rule-mutator 11 failed"与 C 看到的"rule-executor 11 failed"。**隔离复跑 100% 全绿。**

### 9.3 ★根因（C 独立定位，B 未给出）

在 jest 之外用 `createRequire` 复现（`/tmp/c-step2-verify/ts-probe2.mjs`）：

```
A) first require (baseline)                   | tree=true | rootNode=true | type=program
B) same registry, require again               | tree=true | rootNode=true | type=program
   [模拟 jest 的"每个测试文件重置模块注册表"：JS 包装层从 require.cache 删除，原生 .node 仍被缓存]
C) JS wrappers reloaded, native addon cached  | tree=true | rootNode=false | type=UNDEFINED   ← 复现
D) JS wrappers + native addon both reloaded   | tree=true | rootNode=true | type=program
E) after D, next parse in same registry       | tree=true | rootNode=true | type=program
```

`rootNode === undefined` 会让 `syntax.js:59 walk(tree.rootNode)` → `:49 n.type` 抛出**与批跑完全相同的 `TypeError`（syntax.js:49）**。

⇒ **形态性假红成立**，机制是：**同一进程内 tree-sitter 的 JS 包装层被重新实例化、而原生 addon 仍被复用 ⇒ `parse()` 返回的树没有 rootNode**。jest 默认按测试文件重置模块注册表，故同进程的第二个 tree-sitter 套件踩中。

**与本步改动无关的证据**：`git status` 显示本轮**零个 server 文件被改**；被测模块（`rule-mutator`/`rule-executor` 及其依赖）与 step 2 的 2 处 client 改动无任何交集；且该现象在隔离进程下 100% 消失。

**附带登记（既有、非本轮引入、不在本步范围）**：`syntax.js:28` 忽略 `setLanguage()` 的返回值、`:59` 直接取 `tree.rootNode` 而不判空 —— 两处都是让该问题「静默变成 TypeError」的鲁棒性缺口，建议后续单独排期，**不作为本步回流理由**。

---

## 10 V8 全量回归

**空序号确认**：`docs/split/` 下已有 `test-round-08/09/10/11.log`，**12 未被占用**（`ls docs/split/test-round-12.log` → No such file）⇒ 取 `ROUND=12`。

```
$ ROUND=12 LOG_DIR=docs/split bash docs/pipeline/scripts/unblock-g2.sh
→ 测试库: localhost:3306/exam_system_test
✓ 端口可达 ｜ ✓ schema 对齐（already in sync）
→ 退出码: 0 ｜ 完整日志: docs/split/test-round-12.log

── 基线摘要 ──
   Test Suites: 65 passed, 65 total   Tests: 974 passed, 974 total   Time: 173.752 s
   Test Suites:  1 passed,  1 total   Tests:  17 passed,  17 total
   Test Suites:  1 passed,  1 total   Tests:  61 passed,  61 total
   Test Suites:  1 passed,  1 total   Tests:  21 passed,  21 total
```

| 判据 | 期望 | 实测 | 结论 |
|---|---|---|---|
| 日志中 `Test Suites:` 处数 | **4** | **4**（65/1/1/1） | ✅ |
| failed 总数 | **0** | **0**（四段全 0；`grep -E '^Tests:.*failed'` 无输出；`FAIL` 行 0 条） | ✅ |
| 套件/用例 | 4 段 `&&` 链路完整（任一段失败即短路） | 68 套件 / **974+17+61+21 = 1073 passed** | ✅ |

**口径说明**：1073 与 round 11 **逐字相同**（本轮无新增用例）。按 project-constraints 第 17 条，**未把该数字当判据**，判据只有"4 处摘要 + failed=0"两条。

**负载如实登记**：跑前与跑中机器 `load average` 约 5–10（8 核；主要是浏览器与 DSH 自身，**无其它 jest/测试进程**：`ps` 过滤为空）。全程**无偶发失败**，故未触发第 15 条的隔离复跑。

---

## 11 缺陷分级

| 级别 | 项 | 状态 |
|---|---|---|
| **P0（本轮修复对象）** | `useQuestionNav` 注入清单漏列 `subQuestions` ⇒ 学生答题页题号方块**按任意键即抛未捕获异常**（不导航、不高亮、焦点不动） | **已修（2 文件各 1 行）+ 已独立验证**（V2/V5） |
| 记录性 · 无结论影响 | B 报告 §4.2 的报错身份不精确（"7/7 ReferenceError" 实为"首条 ReferenceError + 其余 TypeError"） | 已核正（§6.3） |
| 记录性 · 无结论影响 | B 报告 §6 的假红归因套件名不精确（批跑失败者是 `rule-executor`；具体哪套随调度漂移） | 已核正（§9.2） |
| 低（既有，非本轮引入，不在本步范围） | `server/src/infrastructure/rule/syntax.js:28` 忽略 `setLanguage()` 返回值；`:59` 不判空 `tree.rootNode` | 登记，建议另立轮次 |
| 低（判据边界，非缺陷） | 判据④为逐模块作用域检查，**看不见跨文件接线错配**；脚本侧扫描**看不见模板独有的自由名** | 已用 V3c/V3d 与判据⑤补位（§4.3/§4.4/§5） |

---

## 12 未做项与残留风险

1. **未重跑 step 2 归档的 L0/L1/L2 装置**（B §8.1 同样登记）。L0 在本步可由"模板/样式 `git diff` 为空 + `Submit.vue` md5 未变"代替；**L1 的 `compileScript().bindings` 逐字节对拍未做**（§4.3 只做了名字集合层面的等价检查）。
2. **未做真 E2E**：未启 :5173/:3000、未跑 Playwright 打真应用、未在真浏览器里从登录走到答题页 ⇒ "整页 + 真路由 + 真后端"链路未验（§6.4）。
3. **client 侧"真 import 一次"探针未做**（B §3.6 做了，C 按"不得复用 B 装置"且时间盒限制未重建）；C 以**静态版 V3d**（80 文件 / 212 import / 0 违规 + 正控 1 命中）作为部分补位，强度弱于真 import（静态版看不到运行期副作用与循环初始化顺序）。
4. **判据④扫描面边界**：`server/test/**` 与 `tests/**` 不在面内（前者测试代码、后者禁改区）；`client/src` 的 `components/`、`router/`、`App.vue`、`main.js` 不在 DoD 指定的 52 文件口径内（V3d 顺带覆盖了它们，全部 0 违规）。
5. **残留风险**：其它 composable 若存在**同类跨文件接线漏列**，判据④单独看不见（§5 PC4）；本轮用判据⑤把 submit/ 的关键路径实测了一遍，但**未逐 composable 做运行时对拍**。
6. **C 全程未做 git 写操作**，改动仍留在工作区等待流程决定提交（与 B 一致）。

---

## 13 结论

> ### ✅ **PASS —— 无需回流**

- **V1** 锚点三指纹与 B 报告逐字相符；`numstat` = 2 文件各 1 增 1 删；`Submit.vue` 未动（A 档前提成立）。
- **V2** 缺陷**成立**：注入清单缺 `subQuestions`（`:11`）+ 调用点未传（`:122`）+ `boxIndex`(`:78`) 真读它 + `onBoxKeydown`(`:109`) 被模板 `:43`/`:60` 真绑定 + 未被接线根解构（故静默潜伏）。
- **V3** 判据④（C 自建）**client 52 + server 108 = 160 文件 / 0 命中 / 0 解析错误**；对修复前原件回溯命中恰好 1 处（`subQuestions@78`）。附加 V3c（27 `.vue` 模板侧 0 未解析）与 V3d（client 80 文件 / 212 import / 0 违规）。
- **V4** 三类正控各报一次（6 / 1 / 1）+ `.vue` 路径控制命中真实行号 316；干净树 0 命中（不误报）；`useConfirm.js` 假阳性复核为非缺陷。
- **V5** 用**真 Chromium + 真 DOM + 真 Vue 3.5.34 + 真 KeyboardEvent + 真 errorHandler**独立复现：**修前 7/7 抛**（首条 `ReferenceError: subQuestions is not defined`，其余 `TypeError …findIndex`）、**修后 7/7 不抛且 activeAnchor 变化 + 真实焦点迁移 + 高亮类落点正确**；**两条反证（只补调用点 / 只补注入清单）各 7/7 仍抛** ⇒ 修复两半均不可省。未验层次已在 §6.4 逐条列明。
- **V6** 五门禁 5/5 PASS，不变量 **未分层 44 / GodFile 5 / 观察带 15** 逐项相等。
- **V7** 6 套件隔离进程 **170/170 全绿**；批跑假红**可复现但确属形态性**——C 进一步把根因定位到"tree-sitter JS 包装层重载 + 原生 addon 复用 ⇒ `rootNode` 为 undefined"，并修正了 B 的套件归因。
- **V8** `ROUND=12` 全量回归 **4 处 `Test Suites:` 摘要 / 0 failed / exit 0**（974+17+61+21 = 1073 passed，68 套件）。

**建议**：本步 2 行改动可提交（建议 commit message 含"拆分前 `Submit.vue:324-326/368-402/…` 切片范围 + 落层 `client/src/composables/submit/` + 验证结果：判据④ 160 文件 0 命中 / 判据⑤ 真浏览器 2×2 + 2 反证 / 全量回归 0 failed"）。§11 的两条"低"级事项建议另立轮次，不阻塞本步。
