# Submit.vue 拆分验证报告（step 2 · C 侧 · 独立验证）

- **step**: 2 ｜ **agent**: C（独立验证者，只读；唯一写入 = 本文件）｜ **日期**: 2026-10-11
- **被验 commit**: `9348c81431aa4e0cc004be29c6f95675d413c40f`（branch `master`）
- **被验方案**: `docs/split/Submit.vue-plan.md`（A）｜ **被验落地**: `docs/split/Submit.vue-refactor.md`（B）
- **DoD**: `docs/plan/2026-10-11-godfile-split-plan.md` §5 —— **A 档**（只抽 script ⇒ 不需要像素门禁）
- **约束**: `docs/pipeline/project-constraints.md` 17 条（含 §3-12：`node --check` 不得作为通过证据）
- **立场**: 不采信 B 的自测；装置全部自建（`/tmp/c3*`，未复用 B 的 `/tmp/split2`，未使用 `tests/ui-redesign-verify/rig.sh`）

## 0 版本锚点与被测树留痕（★G-A 装置纪律）

| 项 | 实测值 |
|---|---|
| 被测源码树（绝对路径） | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**） |
| 第二 worktree | `../Exam-DeepSeek-ui` —— **本轮全程未使用**；`rig.sh` 的任一子命令**均未执行**（其默认 `CLIENT_DIR` 指向该树，见 §9） |
| HEAD / 分支 | `9348c81431aa4e0cc004be29c6f95675d413c40f` / `master` |
| `Submit.vue` 改前 sha256 | `6fa9dead483f635934da02405b49d3fc558bd293265d25d060078719ca80a3f4`（= `git show HEAD:…` 实测） |
| `Submit.vue` 改后 sha256 | `12fba8f90ef683664f61fc1778c2e6b1de4b7f0c305dbc023851b9d838ca0e4d` |
| 产物指纹（**唯一构建产物**） | `/tmp/c2-build`（`--outDir` 到仓库外）；`client/dist/index.html` sha256 `cb48c55f1cd1148fe298bc0dbc3465565790890548da9e13bea255f6a135f493`，mtime `2026-10-10 21:55:33`（**未被本轮触碰**，前后两次采集一致） |
| 工作树状态 | `M client/src/views/student/Submit.vue` + `?? client/src/composables/submit/`（9 文件）；**另有** `M docs/pipeline/project-constraints.md`（仅文档，见 D-L1） |
| 自建装置位置 | `/tmp/c3`（L0/L1/结构）、`/tmp/c3rt`（A/B 运行时对拍 + 变异体）、`/tmp/c3v7`（浏览器）、`/tmp/c2-build`（构建产物） |

---

## 1 判据总表（期望 vs 实测 vs 结论）

| # | 判据（期望） | 实测 | 结论 |
|---|---|---|---|
| **V1** | `<template>` 与 `<style>` 改前/改后**逐字节相等** | `cmp` 无输出；sha256 两口径（含/不含行尾换行）**均相等** | ✅ **全等** |
| **V2** | `$setup` 名字集合不变；`__returned__` 覆盖模板所需名；14 行差异**仅为 diff 策略** | `$setup` **57→57 集合相同**；`__returned__` 缺 0；`unref(` **0→0**；14 行差异 = 5 hunk；运行时验证 **DOM 全等** | ✅ **claim 成立，非阻断** |
| **V3** | `npx vite build --outDir /tmp/c2-build` → exit 0，不重建 `client/dist` | `VITE_EXIT=0`（21.63s）；`client/dist` mtime/sha256 未变 | ✅ **通过** |
| **V4** | 运行时行为等价（含 U1/U6）+ 变异反证 | **7 场景 × 改前/改后 观测向量完全相等**；**4 个变异体全部被抓出** | ✅ **通过（本步最锋利证据）** |
| **V5** | 四门禁 + 结构检查 | 违规 0 / 未分层 **46** / GodFile **9→8** / 观察带 **18→18** / SCC **0** / 边数 **178** / hard **0/0/0** / bind **0** | ✅ **通过** |
| **V6** | D1–D12 偏差逐条裁定 | 12 条全部「等价搬移、无行为差异」；3 处结构性偏差**必要且不改变行为** | ✅ **裁定成立** |
| **V7** | 真浏览器 U2/U3/U5 | **U2 ✅ / U5 ✅ / U3 ⚠️ 部分**（同文档卸载清理未测得，见 §6） | ⚠️ **部分完成** |
| **V8** | 改动面 1 M + 9 新；模板/样式零改动；旁证未触碰 dist/tests/gates/server | 见 §7：**多出 1 个文档 M**；其余全部干净 | ✅（附 1 项登记） |

**总结论：无阻断缺陷 —— PASS**（附 4 项低severity报告性问题 + 1 项未完成的浏览器项，均不需回流 B 改代码）。

---

## 2 V1 · L0 独立复核（模板 / 样式逐字节）

**方法**：自写 `/tmp/c3/v1-blocks.mjs` + `/tmp/c3/v1-cmp.mjs`（**自己的取块与哈希实现**：先由 `\n` 建行首字节索引，再按行区间做**字节精确**切片；含/不含行尾换行两种口径都算）。**块边界由我自己扫描 `^<template>$` 等标记行得出，未采信 B 的行号**。

```
=== BEFORE (HEAD:client/src/views/student/Submit.vue) ===
  file bytes = 61352  sha256 = 6fa9dead483f635934da02405b49d3fc558bd293265d25d060078719ca80a3f4
  <template> [1]  </template> [281]  <script setup> [283]  </script> [1206]  <style scoped> [1208]  </style> [1519]
=== AFTER  (worktree client/src/views/student/Submit.vue) ===
  file bytes = 28521  sha256 = 12fba8f90ef683664f61fc1778c2e6b1de4b7f0c305dbc023851b9d838ca0e4d
  <template> [1]  </template> [281]  <script setup> [283]  </script> [318]  <style scoped> [320]  </style> [631]

TEMPLATE  withNL  before[1,281]  13634B 8707ee796e06c422  |  after[1,281] 13634B 8707ee796e06c422  |  EQUAL
TEMPLATE  noNL    before[1,281]  13633B df08343c3b7cb790  |  after[1,281] 13633B df08343c3b7cb790  |  EQUAL
STYLE     withNL  before[1208,1519] 13122B e8890f255996c726 | after[320,631] 13122B e8890f255996c726 | EQUAL
STYLE     noNL    before[1208,1519] 13121B 9c377590dd082d62 | after[320,631] 13121B 9c377590dd082d62 | EQUAL
```

```
$ cmp b.template a.template && cmp b.style a.style
TEMPLATE_BYTE_IDENTICAL
STYLE_BYTE_IDENTICAL
```

- 三个块边界标签与 B 报告一致：`</script>` 1206→318、`<style scoped>` 1208→320 是**唯一的位移**（script 变短），`<template>`/`</template>`/`</style>` 行号未动。
- 两文件均以换行结尾（`lastByteIsNL=true`），故两种口径都成立 ⇒ **"模板/样式一行未动"为字节级事实，不是行数推断**。
- 与 plan §4.3-L0 的方法学一致：**未用 `git diff` 人眼判**。

---

## 3 V2 · L1 独立复核（编译级 + ★14 行差异独立判定）

装置：`/tmp/c3/v2-l1.mjs` / `v2b-l1bm.mjs` / `v2d-names.mjs` / `v2f-returned2.mjs` / `v2c-fragment.mjs`；`@vue/compiler-sfc@3.5.34`（`client/node_modules`，**未联网安装**）；两侧同一 `id="fixedid1"`。

### 3.1 三个口径分开测（关键：**必须区分"模板本身"与"喂了 bindings 后的模板"**）

| 口径 | 结果 |
|---|---|
| **(a) 不喂 `bindingMetadata`** 的 `compileTemplate` | **逐字节相同**：两侧 38075 B、sha256 `3e5c72e1d6dccf3f`。⇒ 模板源码零改动的**第二重机器证明** |
| **(b) 各自喂本方 `compileScript().bindings`**（**= 真实构建路径**） | 38160 → 38230 B；`diff -u` = **7 删 + 7 增 = 14 行 / 5 处 hunk** |
| **(c) 交叉**：after 模板 × before bindings | 38160 B、sha `7b6ffdb2f8a74593`（**与 (b) 的 before 完全相同**）⇒ 14 行差异 **100% 由 bindingMetadata 驱动**，与模板无关 |

> B 的 §4 报「14 行差异」只有在口径 (b) 下复现 —— 这正是 `@vitejs/plugin-vue` 的生产路径，故 B 的口径正确；我在 (a) 下拿到的"零差异"是**互补证据**，不是反证。

### 3.2 bindings / 名字集合 / `__returned__`

```
before bindings keys = 116 | after bindings keys = 69
REMOVED (50): BOX_RESULT_TEXT, DOMPurify, MAX_TIMEOUT_MS, Modal, activateBoxAt, activeAnchor,
  armDeadlineTimer, boxIndex, …, ref, reactive, computed, watch, nextTick, request, …
ADDED   (3): disposePage, onPageMounted, useSubmitPage
TYPE-CHANGED (58): 26× setup-const → setup-maybe-ref / 22× setup-ref → setup-maybe-ref
                   / 10× setup-reactive-const → setup-maybe-ref
after type histogram: {"setup-maybe-ref":66, "setup-const":3}   # 3 = onMounted / onUnmounted / CodeEditor
$setup names (with bindingMetadata):  before = 57  after = 57   only-before [] only-after []
$setup.* access sites:               before = 133  after = 133
unref( count:                        before = 0    after = 0
__returned__ entries:                before = 116 (unique)   after = 69 (unique)
MISSING from after __returned__:     []
>>> RUNTIME_SETUP_RESOLUTION_OK: true
```

- **50 个"消失"的 bindings 全是模板不可见的内部分子**（`ref/reactive/computed/watch/nextTick/message/Modal/DOMPurify/request/draftTimer/deadlineTimer/dirtySet/saveDebounce/pollTimer/editorObserver/MAX_TIMEOUT_MS` + 已迁走的实现函数），**没有一个模板可见名字消失** —— 我逐名核过，与 B 的结论一致。
- ⚠️ **我自己的第一次判定曾误报 7 个名字缺失**（`boxLabel/itemTypeLabel/…`）。追查后确认是**我的正则缺陷**：`compileScript` 为 import 生成的条目是 **getter 形式** `get boxLabel() { return boxLabel }`，我的 `(?=[:,}]|$)` 前瞻匹配不到 `(`；且相邻条目共用一个逗号导致跳项。改用「顶层逗号切分 + 逐条解析」后 **MISSING=[]**。**登记为 C 侧装置自查记录**（对抗性验证必须先怀疑自己的尺子）。
- `__returned__` 计数口径：before 122 条原始条目 = 116 唯一键 + 6 对 `get/set` 访问器；after 69 条 = 58 普通键 + 11 个 getter。B 报的 "69" 与我的实测一致。

### 3.3 ★14 行差异的独立判定：**claim 成立，不是阻断**

**(i) 差异原文（`diff -u` 摘要，5 处 hunk）**

| hunk | 改前 | 改后 |
|---|---|---|
| H1 `a-select-option` v-for | `(_openBlock(), _createElementBlock(_Fragment, null, _renderList(...), 64 /* STABLE_FRAGMENT */))` + 内部 `_createVNode` | `(_openBlock(true), … , 128 /* KEYED_FRAGMENT */)` + 内部 `_createBlock` |
| H2 同上（内层 return 行） | `return _createVNode(_component_a_select_option, …, 1032, ["value"])` | `return (_openBlock(), _createBlock(…, 1032, ["value"]))` |
| H3 「重新答题」a-button | 无 patchFlag | `}, 8 /* PROPS */, ["onClick"])` |
| H4 「提交全部」a-button | `["loading","disabled"]` | `["loading","disabled","onClick"]` |
| H5 「全部重新提交」a-button | `["loading"]` | `["onClick","loading"]` |

> B 报「差异仅 **3 处 hunk**」：**实测 5 处**（H4/H5 是同一类但两条 hunk）。结论不变，属**报告口径偏差**（D-L2）。

**(ii) KEYED vs STABLE：读运行时源码实证**

`client/node_modules/@vue/runtime-core/dist/runtime-core.cjs.js:6218-6272`：
```js
const patchChildren = (n1, n2, …) => {
  const { patchFlag, shapeFlag } = n2;
  if (patchFlag > 0) {
    if (patchFlag & 128) { patchKeyedChildren(...); return; }      // KEYED_FRAGMENT
    else if (patchFlag & 256) { patchUnkeyedChildren(...); return; } // UNKEYED_FRAGMENT
  }
  if (shapeFlag & 8) { … } else {
    if (prevShapeFlag & 16) {
      if (shapeFlag & 16) { patchKeyedChildren(...) }   // ← 64(STABLE) 走这里
      else { unmountChildren(...) }
    } …
  }
}
```
⇒ **flag 64 不含 128/256 位，落入通用分支；因新旧 shapeFlag 都是 ARRAY_CHILDREN(16)，最终同样调用 `patchKeyedChildren`。** B 的"两者最终都走 patchKeyedChildren"**被源码证实**。

**(iii) 实证：两种 flag 的 DOM 输出全等**

自写 `/tmp/c3/v2c-fragment.mjs`：用 `@vue/runtime-core` 的 `createRenderer` + **自建 in-memory nodeOps**（真渲染器、假宿主），分别以两种编译产物形状渲染同一 `a-select-option` 列表，跑 6 个场景：

```
>>> FRAGMENT_FLAG_DOM_EQUIVALENT: true
   initial / identical / remove+reorder / replace-all / empty / single  全部两侧序列化 DOM 完全相同
```

**(iv) 增强事实：该 v-for 的数据源是常量数组**

`useAnswerState.js:37` `const langs = ['c','cpp',…,'perl']` —— **非响应式 `const` 数组**，页面生命周期内不可能变化 ⇒ 即便两种算法语义有别，在这条 v-for 上也**永远不会分叉**。

**(v) onClick 进动态 props 列表：只增不减，且判定等价**

- 三处均为**追加**（`["loading","disabled"] → [... ,"onClick"]`、`["loading"] → ["onClick","loading"]`、`无 → ["onClick"]`），**没有删除任何原有动态 prop**。
- `shouldUpdateComponent`（同文件 :4716-4762）：`patchFlag & 8` 时只遍历 `dynamicProps`；改前"无 patchFlag"时 `optimized && patchFlag >= 0` 为假 → 退到 `hasPropsChanged` 全量比较。两条路径对本元素**判定相同**，因为：① `onClick` 指向 `__returned__.retryPractice / submitAll`（setup 期一次性绑定，**渲染间引用恒定**）；② 其余 props 均为静态字面量。⇒ **不产生额外 patch，也不漏 patch**。

**判定：该 14 行差异 = 编译器块树优化策略 + 动态 props 列表补全，不影响渲染结果、不影响更新决策 ⇒ 不是阻断。**

---

## 4 V3 · 端到端构建

```
$ cd client && npx vite build --outDir /tmp/c2-build --emptyOutDir
✓ built in 21.63s
[monaco-local-vs] 已拷贝本地 Monaco 运行时 → /tmp/c2-build/monaco/vs
[monaco-local-vs] 静态守卫：dist/assets 内 CDN 串 = 0 ✓
VITE_EXIT=0
```
- **未重建 `client/dist`**：构建前后 `client/dist/index.html` mtime 恒为 `2026-10-10 21:55:33`、sha256 恒为 `cb48c55f…`（§7 有二次采集）。
- 构建含 `vite:legacy-post-process`（106 calls）与 terser，说明走的是**完整生产管线**，不是跳过 legacy 的简化路径。

---

## 5 ★V4 · 运行时行为验证 + 变异反证（自建装置）

**装置**：`/tmp/c3rt`。纯 Node 24 + **真 `vue@3.5.34`**；`ant-design-vue` / `dompurify` / `client/src/api/request.js` 由**自写 ESM resolve hook** 重定向到 stub（`--import ./register.mjs`）；浏览器全局（document/window/localStorage/IntersectionObserver/window.fetch）自建；**自建非 DOM 宿主渲染器**（`createRenderer(nodeOps)`），用真实 `onMounted/onUnmounted` 生命周期。**不占端口、不连库、不碰 `tests/`**。

### 5.1 ★改前实现也是"真跑"的（不是读代码）

`/tmp/c3rt/genbefore.mjs` 从 `git show HEAD:…Submit.vue` 的 **283–1206 行**重建"改前实现"为可挂载模块：
- 机械变换仅 3 条：① `const route = useRoute()` / `const { confirm } = useConfirm()` → 由**同一注入对象**提供（保证两侧拿到同一 route/confirm）；② 编译器生成的 `__returned__` 字面量直接作为返回值（118/122 条，丢弃 4 条指向被移除 import 的条目）；③ `import` 提升到模块顶层。
- 两侧在**同一进程、同一 stub、同一夹具、同一驱动代码**下挂载，逐场景比对**观测向量**。

### 5.2 结果：7 场景 × (改前 vs 改后) 观测向量**完全相等**

| 场景 | 观测向量（两侧逐字节相同） |
|---|---|
| **s2 挂载** | GET `/student/assignments/42` 1 次；`subQuestions=2`；`answers={1:'',2:''}`；`editorLangs={1:'cpp',2:'cpp'}`；`setInterval` 延迟 `[30000]`；IntersectionObserver **1 个**且 `rootMargin='400px'`；`document` 监听 `{visibilitychange:1}`；`window` 监听 `{beforeunload:1}` |
| **s3 草稿防抖（U 面）** | 编辑前 `dirtyCount=0` → 编辑后 `1` → 1.8s 后 **恰好 1 次** `PUT /student/assignments/42/draft`，body `{questionId:7,subQuestionId:1,answer:"int main(){}"}` **逐字节正确** → `dirtyCount=0`、`draftNoticeText=''` |
| **s4 `submitAll`** | confirm 1 次（`title='部分题目未作答'`、`danger=true`）；`POST /submit` body `{questionId:7,subQuestionId:1,answer:"code answer"}`；`message.success("全部 1 题提交成功")`；`submittingAll=false`；`subStatuses={1:"submitted"}`；`currentAttempt: 1→2` |
| **s5 到点强制提交（U6-①）** | `endTime=now+400ms` ⇒ **恰好 1 次** `POST /submit`，body **`force:true`**；`Modal.info` **1 次**、title `'考试时间已截止'`、content 逐字一致；`subStatuses={1:"submitted"}`；`isExpired=true` |
| **s6 长窗口不误提交（U6-②）** | `endTime=now+30d` ⇒ 700ms 内 **0 次** `/submit`；`isExpired=false`；**定时器延迟被钳制到 `2147483647`**（实测 `deadlineDelays=[1500,2147483647]`，1500 是草稿防抖） |
| **s7 `disposePage` 清理** | 卸载后：`liveIntervals=0`、`liveTimeouts=0`、document 监听 0、window 监听 0、observer `disconnected=1`、卸载前"最后一次保存"发出 1 次 PUT（body 逐字相同）、`window.fetch` 通道 0 次 |
| **★s8 U1（watch 注册时机）** | `GET` 人为延迟 600ms；t=150ms 写入答案 ⇒ **`dirtyDuringHttp=0`**（watch 尚未注册）；HTTP 返回后再写 ⇒ `dirtyAfterHttp=1`。**改前 = 改后 = {0, false, 1}** |

```
SAME s2_mount / s3_debounce / s4_submitAll / s5_force / s6_longWindow / s7_dispose / s8_u1Timing
SCENARIO DIFFS = 0
```

> **U1 的结论（plan §3.1-2 的担忧未成立）**：B 把 watch **整体留在 `loadAssignment().then()` 内**（`useSubmitPage.js:140` 调 `startAnswerWatch()`，注册点与源 `:1179-1183` 同层同位置），**没有**提前到 setup 同步阶段 ⇒ 计划担心的 "1.5s 竞态窗口被消除（=行为差异）" **不存在**，改前/改后在该探针上完全一致。既有 e2e 依赖的"早填不脏"旧行为**原样保留**。

### 5.3 ★变异反证（装置分辨力）

4 个变异体（`/tmp/c3rt/mutants/*`，**仓库外副本**，只改 1 行），跑同一套装置：

| 变异体 | 改动 | 装置是否报差异 | 报在哪 |
|---|---|---|---|
| **M1** | `useCountdown.js`: `force: true` → `force: false` | ✅ | s5：`forceFlags [true] → [false]` |
| **M2** | `useDraftSave.js`: `setTimeout(saveAllDrafts, 1500)` → `3000` | ✅ | s3：`putCount 1→0`、`dirtyAfterSave 0→1`；s6：`deadlineDelays [1500,…]→[3000,…]` |
| **M3** | `useCountdown.js`: `MAX_TIMEOUT_MS` → `1000000` | ✅ | s6：`maxTimeoutDelay 2147483647→1000000` |
| **M4** | `useSubmitPage.js`: 把 `startAnswerWatch()` 从 `.then()` 内**提到同步注册**（= **U1 假设的那种改动**） | ✅ | **s8：`dirtyDuringHttp 0→1`**；s3：`dirty0 0→1` |

⇒ 装置**不是橡皮图章**：连"U1 若真发生"这种最细微的差异都能抓到。**M4 抓到而真树没抓到 = 真树确实没提前 watch。**

---

## 6 V5 · 五项门禁 + 结构检查（主仓库活树）

```
1) node server/scripts/check-layers.mjs
   文件 78 个，违规 0 条（0 类规则），未分层待迁移 46 个                       EXIT=0
2) node scripts/gates/arch-metrics.mjs
   ✓ layerViolations 基线=0 实测=0    ✓ unmigrated 基线=46 实测=46
   ✓ godfileOver800 基线=9 实测=8     · >500 行（观察带）基线=18 实测=18
   结论：PASS                                                                EXIT=0
3) node scripts/gates/cycle-check.mjs
   扫描 78 文件 / 178 条相对导入边；SCC(|SCC|>1)=0；自环=0 → PASS            EXIT=0
4) node scripts/gates/hard-metrics.mjs
   样本 41 文件；hex6 0/0  important 0/0  modalConfirm 0/0 → PASS             EXIT=0
5) node scripts/gates/bind-check.mjs
   roots=server/src,server/test；modules 176；named bindings 558；VIOLATIONS 0  EXIT=0
```

| 指标 | 期望 | 实测 | 结论 |
|---|---|---|---|
| 分层违规 | 0 | **0** | ✅ |
| 未分层待迁移 | 46 不变 | **46** | ✅ |
| GodFile >800 | 9 → 8 | **9 → 8**（`Submit.vue` 1519→631 退出超标带） | ✅ |
| 观察带 >500 | 18 → 18 | **18 → 18**（B 对、plan 的"27"错） | ✅ |
| cycle SCC | 0 | **0**（边 178，扫描面仅 `server/src`） | ✅ |
| hard-metrics | 0/0/0 | **0/0/0** | ✅ |
| bind-check | 0 | **0**（扫描面仅 `server/*`，**不含 client**） | ✅ |

### 6.1 补门禁盲区（自建，因 ③⑤ 不扫 client）

```
=== 9 模块具名导出（真 import，非 node --check；constraints §3-12）===
answerFormat.js 8 个具名导出；其余 8 文件各 1 个 useXxx；TOTAL=16；undefined 值 = 0
=== 9 模块之间的相对 import 图 ===
8 条边；cycles = [] ⇒ DAG；roots（无人 import）= [useSubmitPage.js]
=== 所有权唯一性 ===
20 个 P1 状态 + langs：每个都**恰好一次**在 useAnswerState.js 里 const/ref|reactive 创建；
其余 8 文件 0 次重复创建（submittingAll 在 W7 只作为参数接收）
=== 模板名供给闭合 ===
useSubmitPage() 返回 53 键（= B 报的 53）；answerFormat 直供 7 名；模板 $setup 需要 57 名
NOT supplied = [] ⇒ TEMPLATE_SCOPE_COMPLETE: true
（53 = 50 个模板名 + contentRef + onPageMounted + disposePage）
```

### 6.2 独立 L0：新文件逐行"是否来自 HEAD"（不采信 B 的 72 块清单）

自写 `/tmp/c3/v6-check.mjs`：把 9 个新文件的每条非空行拿去 HEAD 的 script 块（283–1206）里找**逐字对应**（允许 `export ` 前缀差异）。
```
total non-blank lines = 1047   without verbatim HEAD counterpart = 192   (81.66% verbatim)
```
逐文件人工裁定那 192 行，**全部**落在下列机械类别，**没有一行函数体逻辑被改写**：
banner（4×9=36）、`import` 行、`export function useX({ … }) {` 头与参数表、`return { … }` 返回块、useSubmitPage 的接线段落与新注释、4 个薄包装的函数头（`resetEditors`/`disconnectEditorObserver`/`startAnswerWatch`/`disposeDraftSave`）、以及**恰好 4 处计划内替换**（`resetEditors();` / `startAnswerWatch();` / `disposeDraftSave();` / `disconnectEditorObserver();` —— 四者都在未匹配清单里被点名，与 B 的白名单一一对应）。
另核对 2 处**注释**被扩写（无行为影响）：`useAnswerState.js:11`（`数据` → `数据（P1 全部状态：所有权唯一…）`）、`useCountdown.js:88`（`提交全部` → `提交全部（截止到点强制提交）`）；HEAD 原文已实测。

---

## 7 V6 · B 的 D1–D12 逐条裁定

| # | B 的处理 | C 的独立裁定 | 依据 |
|---|---|---|---|
| **D1** | `isSqAnswered` W1→**W2** | **必要且等价** ✅ | 该函数体读 `itemAnswers`/`answers`（我实测函数体内确实含这两个名字）；W1 是"零 import 纯叶子"，放 W1 必然引入 import 边。实测：HEAD `:421-428` 原文**逐字出现在 useAnswerState.js**、不在 answerFormat.js |
| **D2** | `sqBoxClass` W2→**W3** | **必要且等价** ✅ | 函数体读 `activeAnchor`（W3 所有）；实测 HEAD `:468-479` 原文在 useQuestionNav.js、不在 useAnswerState.js。归属 W3 消除 W2⇄W3 构造环 |
| **D3** | `submittingAll`：**W2 创建、注入 W7** | **必要且等价** ✅ | 实测 `const submittingAll = ref(` 在 9 文件中**恰好 1 次**（useAnswerState.js），W7 只作为参数接收。满足"所有权唯一" |
| **D4** | `deadlineTimer`→W6、`draftTimer`→W9 | 等价 ✅ | 二者是模块内 `let` 句柄（非响应式）；按唯一消费者归属不产生重复创建。运行时实测：`setInterval(30000)` 仍由 W9 的 `onPageMounted` 创建、`disposePage` 清空；`deadlineTimer` 钳制 2^31-1 生效 |
| **D5** | `onMounted/onUnmounted` 回调体进 W9，**注册仍在 .vue** | 等价 ✅ | `.vue` 顶层 `onMounted(onPageMounted); onUnmounted(disposePage);` 各一次；A/B 对拍 s2/s7 证明 hook 体执行时机与效果一致 |
| **D6** | `isSqReadonly` 以**函数声明**（提升）传入 W2 | 等价 ✅ | 函数声明整体提升、无 TDZ；7 个场景无 `ReferenceError`（`isSqReadonly` 在 W2 的 `oiCardClass`、W5 的 `saveAllDrafts`、W7 的 `submitAll` 三处被调用） |
| **D7** | `markDirty` 以**迟绑定箭头**注入 W2 | 等价 ✅ | s3 实测 `dirtyCount 0→1`（回调内解引用成功），无 TDZ |
| **D8** | 4 个"新函数" | 等价 ✅ | `resetEditors` 体内两行 = HEAD `:394-395` 原样（独立 L0 未把这两行列为"无对应"）；另 3 个是 1 行薄包装/disposer。**均为 plan §2.2/§3.1-4 明令要求**，不属"顺手改" |
| **D9** | 观察带实测 18→18（plan 的 27 不成立） | **B 对，plan 错** ✅ | arch-metrics 实跑 `>500 基线=18 实测=18`；9 个新文件最大 197 行，全部 <500，不进观察带 |
| **D10** | plan「bindings 键集合+类型完全相等」不可达 | **B 对** ✅ | 我实测 58 名全部 `setup-maybe-ref`（26+22+10），要保 `setup-ref` 就必须在 .vue 出现 `ref(`/`computed(` —— 与铁律①互斥。替代判据（名字集合 + `__returned__` 覆盖 + 真运行时解引用）我已全部独立复跑 |
| **D11** | `node --check` 效力不足 | **B 对** ✅ | 我全程**未把 `node --check` 当证据**：9 模块真 `import()` + 具名导出对拍（16/16 无 undefined）+ A/B 运行时对拍 |
| **D12** | 1.5s 竞态窗口**原样保留**、未提前 watch | **B 对，且我已实证** ✅ | s8 探针：改前=改后=`{dirtyDuringHttp:0, dirtyAfterHttp:1}`；M4 变异体（提前 watch）**能**被装置抓出 ⇒ 真树确实没提前。既有缺陷照旧存在、未被放大 |

**结论：12 条偏差登记全部成立，无一条引入行为差异；三处结构性偏差（D1/D2/D3）均为消除构造环/保证所有权唯一所必需。**

---

## 8 V7 · 真浏览器交互验证（时间盒 40 min，**部分完成**）

**装置（自建，未用 rig.sh）**：`/tmp/c3v7/server.mjs`（静态服务 `http://127.0.0.1:3123/exam/`，**PORT=3123**，SPA fallback；未占 :5173/:3000/:3100）＋ `/tmp/c3v7/v7.mjs`（`playwright@1.60.0` + 缓存内 `chromium-1223`）；**被测产物 = `/tmp/c2-build`（本步临时构建，非 `client/dist`）**；`ctx.route('**/api/**')` 全量夹具拦截（**无后端、无库**）；`addInitScript` 种 token/user + 打桩计时器与监听计数。

| 项 | 结果 | 证据 |
|---|---|---|
| **U0 页面渲染** | ✅ | `.oi-card` 出现；请求 `GET /exam/api/student/assignments/42` + `/student/profile` |
| **U2 编辑器挂载次数** | ✅ | `monacoCount = 1` == 编程小题数 1；**滚动往返后仍为 1**（未重复挂载） |
| **U5 多选 v-model 与 @change 顺序** | ✅ | 勾选 A、C ⇒ **恰好 1 次** `PUT /draft`，body `{"questionId":7,"subQuestionId":12,"answer":"[{\"key\":\"i1\",\"answer\":\"A,C\"},{\"key\":\"i2\",\"answer\":\"\"}]"}` ⇒ 解析后 `i1.answer === "A,C"`（**说明 `update:value` 先于/同步于 `change`，链路正确**）；`.sync-ok` 出现；无 pageerror |
| **U3 卸载清理** | ⚠️ **部分** | ①"离开后无 axios `/draft` 写入" ✅；②观察到 `window.fetch` keepalive 写入 `PUT /api/student/assignments/42/draft`（**= 源 `:839-865` 的 `onBeforeUnload` 既有行为，逐字保留，非回归**）；③**"卸载后计时器/监听归零"未能在同文档内测得**（见卡点） |
| 无未捕获异常 | ✅ | `pageErrors = []`、console error `= []` |

### 卡点（如实登记，不编造结论）

试图在**同一 document** 内测"组件卸载后计时器归零"，三次尝试均未跑通：
1. 点击 Submit 页"返回"（`$router.back()`）⇒ history 无前驱，落到 `about:blank` → **整文档导航**，计时器计数被文档销毁而非被组件清理。
2. 手写 `history.pushState + dispatchEvent(new PopStateEvent)` 驱动 vue-router（sentinel 证明文档未重载）⇒ 路由**未**切到 Submit（`.oi-card` 超时未出现）。
3. 夹具 `GET /student/assignments` 返回一行 + 点 `.ant-table-row` 走 `goDetail()` 的 `router.push` ⇒ 行未渲染（`waitForSelector` 8s 超时，列表页对夹具字段有更多要求）。

⇒ **按时间盒纪律停止**。U3 的"计时器/监听释放"目前只有 **V4 s7**（同进程、真 `onUnmounted`、真 `vue`，实测 `liveIntervals=0 / 监听 0 / observer disconnected`）作为证据，**不是浏览器证据**。**残留风险见 §10-R1。**

**G-A 说明**：`tests/ui-redesign-verify/rig.sh` 的任何子命令**均未执行**（其 `:9` 默认 `CLIENT_DIR` 指向 `../Exam-DeepSeek-ui`，且 `build` 会写 `tests/`，两者都违反本轮硬约束）⇒ 不存在"测错树"的可能；本轮所有结论都出自§0 留痕的主仓库树。

---

## 9 V8 · 改动面与旁证

```
$ git status --porcelain -uno
 M client/src/views/student/Submit.vue
 M docs/pipeline/project-constraints.md          ← 未被 B §0 计入（见 D-L1）

$ git status --porcelain -uall -- client/src
 M client/src/views/student/Submit.vue
?? client/src/composables/submit/{answerFormat,useAnswerState,useAssignmentLoader,useCountdown,
     useDraftSave,useEditorLazyMount,useQuestionNav,useSubmitActions,useSubmitPage}.js     ← 恰好 9 个
```

| 面 | 旁证 | 结论 |
|---|---|---|
| **模板/样式零改动** | 块级字节 `cmp`（**不是行数**）+ 两口径 sha256 + 不喂 bindings 的 `compileTemplate` 逐字节相同 | ✅ **三重独立证据** |
| `client/dist` | `index.html` mtime `2026-10-10 21:55:33`、sha256 `cb48c55f…`（构建前后各采集一次，相同）；`dist/assets` 目录 mtime 未变 | ✅ 未触碰 |
| `tests/` | `find tests -newermt '2026-10-11 08:00:00'` → **0 个文件**（两个 10-11 的 rig 日志 mtime = `00:19:14`，在本步窗口之前） | ✅ 未触碰 |
| `scripts/gates/` | `pixel-diff/arch-metrics/cycle-check` 的 mtime 为 `08:01–08:03`（**mtime 有变动**），但 `shasum -a 256` 与 `git show HEAD:` **逐字节相同**，且 `git status` 不报 M ⇒ **内容未被修改** | ✅ 内容未变（mtime 异常已登记 D-L4） |
| `server/` | `find server -newermt '2026-10-11 08:00:00' -not -name '*.log' -not -path '*/node_modules/*'` → **空** | ✅ 未触碰 |
| 其它 client 文件 | `find client -newermt '2026-10-11 08:00:00' -not -path '*/node_modules/*'` → 恰好 10 个（9 新 + Submit.vue） | ✅ |
| 构建产物落点 | 唯一构建输出 `/tmp/c2-build`；仓库内 `client/{dist,dist-r2,dist-t02check}` mtime 均未变 | ✅ |
| 端口 | `lsof`：`:3123`（我起的，已 kill）/ `:5173` / `:3000` **均无监听** | ✅ |
| 行数/指纹 | `1519 → 631`（`wc -l`）；9 文件 55/197/155/122/152/67/143/116/180；**10 个 sha256 前 16 位与 B §1 表逐一相符** | ✅ |

---

## 10 缺陷分级

| 级别 | 数量 | 项 |
|---|---|---|
| **阻断（Blocker）** | **0** | — |
| 高 | **0** | — |
| 中 | **0** | — |
| 低（仅报告/留痕，**不影响代码**） | **4** | D-L1 ~ D-L4 |

- **D-L1（低·留痕）**：B §0「改动面 = M Submit.vue + 9 新文件 —— **仅此 10 个文件**」与工作树不符。实测另有 `M docs/pipeline/project-constraints.md`（+1 行，§12 的 step-2 实证补记，mtime `08:27:10`）。**纯文档、不涉代码**；建议 B 下一轮补进改动面清单。
- **D-L2（低·口径）**：B §4.2 称 compileTemplate「差异仅 **3 处 hunk**」；实测 **5 处 hunk / 7 对行 / 14 行**（「提交全部」与「全部重新提交」是两个独立 hunk）。**不影响结论**（差异性质判定正确）。
- **D-L3（低·口径）**：B §3.1 代码块把两种口径混写在一行 —— `13633 / 13121 bytes` 是**不含行尾换行**的尺寸，而同行的 `8707ee796e06c422 / e8890f255996c726` 是**含行尾换行**的哈希（表格里用的 `df08343c…/9c377590…` 才是与尺寸配套的口径）。**两种口径我都实测为相等**，结论不变。另 §4.1 的"模板所需 58 名"与"$setup 57 名"内部不一致 —— 实测 **57**（53 个来自 `useSubmitPage` + 7 个 `answerFormat` 直供 − 3 个非 `$setup` 项）。
- **D-L4（低·留痕）**：`scripts/gates/{pixel-diff,arch-metrics,cycle-check}.mjs` 的 **mtime 落在本步窗口内（08:01–08:03）**，但内容与 HEAD **逐字节相同**（sha256 比对）且 `git status` 干净。判定为**内容未改**，登记备查（谁在何时 touch 过，B 报告未说明）。

---

## 11 未做项与残留风险

| # | 项 | 状态 | 原因 / 影响 |
|---|---|---|---|
| R1 | **浏览器内"同文档卸载清理"**（U3 计时器/监听归零） | **未完成** | §8 三次尝试均落到整文档导航或路由未切换；**不影响判定**：V4 s7 已在真 `vue` + 真 `onUnmounted` 下测得归零，且模板/脚本搬移为逐字（§6.2） |
| R2 | **U4：卸载瞬间 Monaco `editor.dispose()` / `monaco.editor.getModels().length === 0`** | 未做 | 需在浏览器内于卸载后读 monaco 全局；不在本轮任务书 V7 的三项内（U2/U3/U5），登记为残留 |
| R3 | 全量后端回归（`unblock-g2.sh`，4 段摘要 / 0 failed） | **未跑** | 本步**不动 `server/`**（mtime 旁证：server 今日 08:00 后零改动）⇒ 该哨兵无触发条件 |
| R4 | 像素门禁（`pixel-diff.mjs --regions`） | **未跑（按 A 档不要求）** | DoD §5-A：模板+样式**逐字节相等**严格强于像素相等；且 `FIXTURES` 无 `/api/student/**`（G-B 未解），跑了也会 exit 2 |
| R5 | axe / `page.accessibility.snapshot()` 对拍 | 未做 | axe-core 全仓缺失（禁联网）；ARIA 树对拍需能稳定挂载真实路由，本轮 V7 未扩到该口径 |
| R6 | 既有 e2e `e2e-02-student.spec.mjs`（R1/R2 复用） | 未跑 | 需 rig（写 `tests/` + 真后端 + `:3100`），违反轮次硬约束 |
| R7 | `useSubmitPage()` 返回的 `contentRef` 未进 `$setup` 名字集 | 已解释，非缺陷 | `ref="contentRef"` 编译为字符串 prop，故 `$setup` 57 名不含它；A/B 对拍 s2/s7 证明它按同一引用工作 |

---

## 12 本步结论：**PASS（无阻断；不需回流 B 改代码）**

1. **模板与样式：字节级零改动**（两种取口径都相等），编译级第二重证明（不喂 bindings 的 `compileTemplate` 逐字节相同）。
2. **14 行 compileTemplate 差异已独立判定为"非阻断"**：源码级（`patchChildren` 对 64/128 都收敛到 `patchKeyedChildren`）+ 实证级（自建渲染器 6 场景 DOM 全等）+ 增强事实（数据源 `langs` 是非响应式常量数组）；三处 `onClick` 进动态 props 列表**只增不减**且 handler 引用恒定，更新判定等价。
3. **运行时行为等价有最强形态的证据**：改前实现（从 HEAD 重建并真实挂载）与改后 composable 在**同一装置**下 7 场景观测向量**完全相等**；4 个变异体**全部**被抓出（含"把 watch 提前"这一 U1 假设本身）。
4. **U1 裁定**：watch 未被提前，既有 1.5s 竞态窗口原样保留 ⇒ plan 所担心的"可观测行为差异"**不存在**；**U6 两个方向全部通过**（到点恰好 1 次 `force:true` + `Modal.info`；30d 窗口 0 次误提交 + 钳制 `2147483647`）。
5. **五项门禁全绿且数字符合预期**：未分层 **46**、GodFile **9→8**、观察带 **18→18**、SCC **0**（178 边）、hard **0/0/0**、bind **0**；补测的 client 侧盲区（真 import / 具名导出 16/16 / DAG 无环 / P1 所有权唯一 / 模板名供给闭合）也全绿。
6. **D1–D12 逐条成立**，三处结构性偏差（`isSqAnswered`→W2、`sqBoxClass`→W3、`submittingAll` 单点创建）均为必要且不改变行为。
7. **4 项低severity均属报告口径/留痕**，不构成阻断；**1 项浏览器项（U3 同文档卸载清理）未完成，已如实登记为残留风险 R1**（不影响结论）。

> **给下一棒的一句话**：本步可以提交（单提交、可单独回滚）；提交前建议 B 把 §0 改动面补上 `M docs/pipeline/project-constraints.md`，并把「3 处 hunk」改成「5 处 hunk / 14 行」。若要彻底关掉 U3/U4 的浏览器残留，需要一个能**在同文档内**完成"进入 Submit → 离开 Submit"的导航入口（三条已尝试路径见 §8）。
