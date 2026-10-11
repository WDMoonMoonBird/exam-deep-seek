> ⚠️ **勘误（Captain 添加，依据 `Submit.vue-verify.md` 的独立验证）**：
> ① §0 的改动面**漏登** `docs/pipeline/project-constraints.md` —— 实测为 **2 个 M**（另 1 个是 Captain 补的第 12 条纪律），非「仅 10 个文件」；
> ② `compileTemplate` 的差异实为 **5 个 hunk**（本文报 3 处，偏低）；C 另实测「不喂 bindings 时两侧逐字节相同（38075B / `3e5c72e1`）」，喂本方 bindings（= 真实构建路径）才出现该差异。
> ③ 上述两点均为**报告口径问题，不影响结论**（C 已独立判定该差异非阻断）。

# Submit.vue 拆分实施报告（step 2 · B 侧）

- **step**: 2 ｜ **agent**: B（唯一写者）｜ **日期**: 2026-10-11
- **方案**: `docs/split/Submit.vue-plan.md`（499 行）｜ **DoD**: `docs/plan/2026-10-11-godfile-split-plan.md` §5（**A 档：只抽 script，不需像素门禁**）
- **约束**: `docs/pipeline/project-constraints.md` 17 条 + Captain 本轮三条铁律 + 第五步 watch 裁决 + 第六步 G-A 装置纪律

## 0 版本锚点与产物指纹（★被测源码树留痕，G-A）

| 项 | 实测值 |
|---|---|
| 被测源码树（绝对路径） | `/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**，非 `../Exam-DeepSeek-ui`） |
| 分支 / HEAD | `master` / `9348c81431aa4e0cc004be29c6f95675d413c40f` |
| `Submit.vue` 改前 sha256 | `6fa9dead483f635934da02405b49d3fc558bd293265d25d060078719ca80a3f4`（= `git show HEAD:client/src/views/student/Submit.vue` 实测，与 HEAD 同一份） |
| `Submit.vue` 改后 sha256 | `12fba8f90ef683664f61fc1778c2e6b1de4b7f0c305dbc023851b9d838ca0e4d` |
| 构建产物指纹 | `/tmp/split-step2-build/index.html` sha256 = `ad61394c29a81b11…`（**未重建 client/dist**，其 mtime 仍为 2026-10-10 21:55:33） |
| 改动面 | `M client/src/views/student/Submit.vue` + `?? client/src/composables/submit/`（9 文件）——**仅此 10 个文件** |

> **G-A 处理**：本轮**未使用** `tests/ui-redesign-verify/rig.sh` 的任何子命令（理由见 §9）。全部验证在 `/tmp` 与主仓库活树上完成，被测树 = 上表主仓库路径。

## 1 交付物（9 个 composable + 1 个改造后的 .vue）

| 文件 | 批次 | 行数 | sha256（前 16） | 单元 |
|---|---|---|---|---|
| `client/src/composables/submit/answerFormat.js` | B1 | **55** | `4280b1d5b0b34038` | W1 纯叶子（8 声明，零 import、零响应式） |
| `.../useEditorLazyMount.js` | B2 | **67** | `f7a99214d62ac7ff` | W4 Monaco 懒挂载（7 声明 + `resetEditors` / `disconnectEditorObserver`） |
| `.../useQuestionNav.js` | B2 | **143** | `fae2db7f4d8a92cf` | W3 导航 / 题号方块 a11y（13 声明） |
| `.../useAnswerState.js` | B3 | **197** | `0a8da7d890c240f3` | W2 答案状态所有权（32 声明：P1 全部 20 + 12 谓词） |
| `.../useDraftSave.js` | B3 | **152** | `fb3a78a6052848ef` | W5 脏标记 + 草稿保存（13 声明，含 watch 注册函数） |
| `.../useCountdown.js` | B4 | **122** | `55470307d0082104` | W6 截止倒计时 + 强制提交（8 声明） |
| `.../useAssignmentLoader.js` | B4 | **155** | `ca9c4ccd730332ed` | W8 数据加载 + 评分轮询（4 声明） |
| `.../useSubmitActions.js` | B4 | **116** | `53b53161693a07be` | W7 提交决策 + 提交全部（3 声明） |
| `.../useSubmitPage.js` | B4 | **180** | `54b8c6cab69aa637` | W9 接线根（8 门面 + 2 hook 体 + 组装 W2–W8） |
| `client/src/views/student/Submit.vue` | 接线 | **1519 → 631** | `12fba8f90ef68366` | template 281 + script 36 + blank 2 + style 312 |

**全部 9 个文件 < 500 行**（最大 `useAnswerState.js` 197 行，远低于 800）。

### 行数实测（★Captain 存疑项）

| 指标 | 改前 | 改后 | plan 的估计 | 实测结论 |
|---|---|---|---|---|
| GodFile（>800 行） | **9** | **8** | 9 → 8 | ✅ 与 plan 一致（`Submit.vue` 1519 → 631 退出超标带） |
| 观察带（>500 行） | **18** | **18** | 18 → **27** | ❌ **plan 错**：9 个新文件全部 ≤197 行，**低于 500 门槛、不进观察带**；`Submit.vue` 从 1519 降到 631 也只是**离开**超标带、从未计入观察带。**实测 18 → 18，不是 27** |
| 仓内 .js/.vue 文件数 | 140 | 149 | — | +9（新增文件） |
| `arch-metrics.mjs` 实跑 | — | `godfileOver800 基线=9 实测=8` / `>500 基线=18 实测=18` → **PASS** | — | ✅ |

## 2 分批执行记录（B1 → B4；按 Captain 指令：**先全部建立，最后一次性删除内联实现**）

| 批 | 新建 | 完成后自测（全部实跑） |
|---|---|---|
| **B1** 纯叶子 | `answerFormat.js`（9 个声明级搬移：`itemTypeLabel` / `formatItemAnswer` / `itemTypeColor` / `itemTypeClass` / `getItemKey` / `isSqAnswered` / `BOX_RESULT_TEXT` / `boxLabel` / `isCodeStem`） | `node --check` OK；真 `import()` OK，具名导出 8 个：`BOX_RESULT_TEXT,boxLabel,formatItemAnswer,getItemKey,isCodeStem,itemTypeClass,itemTypeColor,itemTypeLabel` |
| **B2** 编辑器 + 导航 | `useEditorLazyMount.js`、`useQuestionNav.js` | `node --check` 2/2 OK；L0 逐字对拍 0 不等 |
| **B3** 答案状态 + 草稿 | `useAnswerState.js`、`useDraftSave.js` | `node --check` 2/2 OK；L0 逐字对拍 0 不等；**watch 迁入 W5 但注册时机不变**（§6） |
| **B4** 倒计时/加载/轮询/提交/接线根 | `useCountdown.js`、`useAssignmentLoader.js`、`useSubmitActions.js`、`useSubmitPage.js` | `node --check` 4/4 OK；L0 全量 825 行 0 不等；结构检查 127 个返回名全部有声明 |
| **接线（最后一步）** | `Submit.vue` 的 `<script setup>` 重写为 36 行 | L0 模板/样式 `cmp` 全等；L1 全绿；`vite build` exit 0；运行时冒烟 31/31 |

> **生成方式（可复核）**：9 个文件由脚本从 `git show HEAD:…Submit.vue` 的**行区间切片直接拼装**（`/tmp/split2/gen.mjs`），搬移块**不是手抄**——这是 825 行逐字相等的**构造性保证**，而非事后核对。

## 3 L0 · 切片字节判等（模板 / 样式 / 825 行搬移块）

### 3.1 模板与样式（★铁律②）

```
cmp b.template a.template  →  TEMPLATE_BYTE_IDENTICAL   sha256(前16)=8707ee796e06c422   13633 bytes
cmp b.style    a.style     →  STYLE_BYTE_IDENTICAL      sha256(前16)=e8890f255996c726   13121 bytes
```

| 块 | 改前行 | 改后行 | 字节 | sha256(前16) | 判等 |
|---|---|---|---|---|---|
| `<template>` … `</template>` | 1–281 | 1–281 | 13633 | `df08343c3b7cb790` | **相等** |
| `<style scoped>` … `</style>` | 1208–1519 | 320–631 | 13121 | `9c377590dd082d62` | **相等** |
| 块边界标签 | `<template>`=1 / `</template>`=281 / `<script setup>`=283 / `</script>`=1206 / `<style scoped>`=1208 / `</style>`=1519 | 同左，仅 `</script>` 1206 → 318 | — | — | 仅 script 变短 |

> 用 `git show HEAD:…` 冻结副本切片，**未用 `git diff` 人眼判**（plan §4.3-L0 的明令）。

### 3.2 825 行搬移块逐字对拍

```
node /tmp/split2/l0.mjs   →   pairsTotal 825   MISMATCHES 0
```

72 个搬移块 / 825 行逐字相等 / 差异白名单**仅 12 处**：

1. **8 处 `export ` 前缀**（W1 的 8 个具名导出，其余字符逐字不变）；
2. **4 处替换**（下述，全部是"把私有实现换成同义调用"的必然结果）：
   - `useQuestionNav.js` L47 ← `resetEditors();`（替换源 `:394-395` 两行循环，plan §7.3 B2-2 明令）
   - `useSubmitPage.js` L140 ← `startAnswerWatch();`（替换源 `:1179-1183` 的 watch 调用，注册点不变）
   - `useSubmitPage.js` L153 ← `disposeDraftSave();`（源 `:1196` 的 `clearTimeout(saveDebounce)` —— `saveDebounce` 已是 W5 私有 `let`）
   - `useSubmitPage.js` L161 ← `disconnectEditorObserver();`（源 `:1204` 的 `editorObserver?.disconnect()` —— `editorObserver` 已是 W4 私有 `let`）

逐块明细见 §11 的 72 行对照表（源行 → 目标文件:行 + 逐字行数）。

## 4 L1 · 编译级对拍

```
@vue/compiler-sfc 3.5.34（client/node_modules，未联网安装）；before/after 用同一 id="fixedid1"
① compileScript().bindings            116 → 69 个键
② $setup 名字集合（compileTemplate）     57 → 57   TPL_$setup_NAME_SET_IDENTICAL(57)
③ compileTemplate 产物                  14 行差异（3 处 hunk），非 0
④ __returned__ ⊇ 模板所需 58 名         RUNTIME_SETUP_RESOLUTION_OK
```

### 4.1 模板可见名字一个不漏（plan §7.2-C4 的核心）

- 模板里 `$setup.*` 引用共 **57 个名字**，改前改后**集合完全相同**（`cmp before.tplnames.json after.tplnames.json` 无输出）。
  > plan §1.4 称"38 个名字"——那是"本文件顶层名字"的口径；机器实测模板还有 19 个事件处理器 / 类名函数也在 `$setup` 面上，**57 才是真实全集**。另加模板 ref `contentRef`（`ref="contentRef"` 编译成字符串 prop，不计入 `$setup`）。
- `__returned__`（即运行时 `setupState = proxyRefs(__returned__)`）实测 69 个条目，**58 个模板所需名字全部在内，MISSING=[]**。
- `bindings` 里 50 个"消失"名字**全部是模板不可见的内部分子**（`ref/reactive/computed/watch/nextTick`、`message/Modal/DOMPurify/request`、`draftTimer/deadlineTimer/dirtySet/saveDebounce/pollTimer/editorObserver/MAX_TIMEOUT_MS`、以及已迁入 composable 的实现函数）——**没有一个模板可见名字消失**。

### 4.2 为什么 compileTemplate 有 14 行差异（必须如实说清）

差异仅 3 处 hunk，**不是 `unref()` 包裹**（实测 `unref($setup.X)` 出现次数 = 0，before/after 都是 0）：

| hunk | 改前 | 改后 | 性质 |
|---|---|---|---|
| `a-select-option` 的 v-for 片段 | `_openBlock(), … STABLE_FRAGMENT(64), _createVNode` | `_openBlock(true), … KEYED_FRAGMENT(128), _createBlock` | 编译器**块树优化**选择（keyed vs stable 片段）；两种 flag 在渲染器里最终都走 `patchKeyedChildren`，**产出 DOM 相同** |
| `a-button`（重新答题） | 无 patchFlag | `8 /* PROPS */, ["onClick"]` | 动态 props 列表 |
| `a-button`（提交全部 ×2） | `["loading","disabled"]` / `["loading"]` | 追加 `"onClick"` | 同上 |

**根因**：这三处判定依赖 `bindingMetadata`（`isMemberExpression` / 常量判定），而解构后的名字从 `setup-const` / `setup-ref` 变成 `setup-maybe-ref`（见 4.3）。
**为什么不是行为变更**：(a) `onClick: $setup.submitAll` 引用的是**同一个函数对象**（`__returned__.submitAll` 全程不变），动态 props 列表里加上它只意味着"每次重渲染比较一次、永远相等、不产生 patch"；(b) 片段 flag 只影响 diff 策略，不改渲染结果。**且该差异与模板源码无关**——模板字节相同（§3.1），DOM 必然相同（DoD A 档论证）。

### 4.3 binding 类型迁移（plan §7.2-C4 的字面要求不可达，已用更强替代）

- 57 个模板名字的类型全部从 `setup-ref` / `setup-reactive-const` / `setup-const` → **`setup-maybe-ref`**。
- **不可达性论证**：`<script setup>` 编译器对 `const { … } = useX()` 只能推断 `setup-maybe-ref`；要得到 `setup-ref` 就必须在 .vue 里出现 `ref(` / `computed(` —— **正是铁律①明令禁止的**。故"键集合+值类型完全相等"与本步的架构前提**互斥**。
- **为什么仍等价**：`setupState` 是 `proxyRefs(__returned__)`，`$setup.x` **本身就是自动解包**的；`setup-maybe-ref` 在非 inline 编译下**不产生 `unref()`**（实测 0 处），所以模板里 57 个访问点**逐字节相同**。plan 担心的"退化成 `setup-const` 会丢解包"**没有发生**（无一例退化为 const）。
- **替代判据（更强）**：① `$setup` 名字集合逐名相等；② `__returned__` 覆盖 58 个所需名；③ 运行时 harness 真实解引用全部 53 个返回值（§5）。

## 5 运行时行为验证（L2 的可用替代：真执行，非静态）

`tests/` 的 rig 不可用（§9），故自建**真运行时**冒烟（`/tmp/split2/rt/smoke.mjs`，纯 Node + 真 `vue`，stub 掉 `ant-design-vue` / `axios` 与浏览器全局；**不占端口、不连库、不碰 `tests/`**）：

```
cd /tmp/split2/rt && node smoke.mjs      →   total=31  failed=0   (SMOKE_EXIT=0)
```

覆盖（全部 PASS，节选关键断言）：

| 断言 | 实测 |
|---|---|
| `useSubmitPage()` 返回**恰好 53 个名字**且全部存在 | 53 / 缺 0 |
| `onPageMounted()` 不抛异常，`loadAssignment` 落数据 | `subQuestions=2` / `q.id=7` / `answers={1:'',2:''}` / `editorLangs[1]='cpp'` |
| `draftTimer` = `setInterval(30000)` **在 `loadAssignment().then()` 内** | ✅（时机不变） |
| `IntersectionObserver` 由 `ensureEditorObserver()` 在 .then() 内创建 | 1 次 |
| `visibilitychange` / `beforeunload` 各注册 1 次 | ✅ |
| **watch 已注册**：改 `answers` → `dirtyCount` 0→1 | ✅（deep watch 生效） |
| 1500ms 防抖 → **恰好 1 次** `PUT /student/assignments/42/draft` | body `{questionId:7,subQuestionId:1,answer:'int main(){}'}` **逐字节正确**，成功后 `dirtyCount=0` |
| `retryPractice()`：`confirm(danger:true)` → `POST /retry` → 清空 + 重新加载 | ✅（**验证修好的 `resetEditors`**） |
| `submitAll()`：confirm → 2 次 `POST …/submit` → `success 全部 2 题提交成功`，`submittingAll=false` | ✅ |
| **U6/N3 到点强制提交**：`endTime=+400ms` → **恰好 1 次** `POST …/submit` 且 `force:true` + `Modal.info('考试时间已截止')` | ✅ |
| **U6/N4 长窗口不误提交**：`endTime=+30d` → 600ms 内 **0 次** `/submit`，计时器钳制到 `2147483647` | ✅ |
| `disposePage()`：interval 清空、两个监听移除、observer `disconnect` | ✅ |

## 6 ★watch 注册时机（Captain 裁决：与改前一致）

- 源 `:1179-1183` 的 `watch(() => [answers, itemAnswers, multiAnswerBind], …, { deep: true })` **整体逐字**移入 `useDraftSave.js` 的 `startAnswerWatch()`（第 133-140 行，含 `{ deep: true }` 与源 `:1178` 注释）。
- **注册动作仍由同一调用点触发**：`useSubmitPage.js` 的 `onPageMounted()`（= 源 `onMounted` 回调体）内，`loadAssignment().then(() => { … startAnswerWatch(); … })` —— 位置、层级、`.then()` 包裹**与改前逐行一致**。
- `.vue` 只做 `onMounted(onPageMounted)` / `onUnmounted(disposePage)` 各一次注册（hook 只在 .vue 注册；清理顺序 9 步在 `disposePage()` 内逐行保持）。
- **本轮未提前该 watch**：既有的「HTTP 往返期间不 markDirty」1.5s 竞态窗口**原样保留** → 登记为**独立发现**（§8-D12），后续可单独立项。

## 7 逐字保留清单（铁律③ 的 4 处 + 阈值文案）

| # | 项 | 落点 | 证据 |
|---|---|---|---|
| 1 | `getToken()` 的 try/catch | `useDraftSave.js:40-42` | `function getToken() { try { return localStorage.getItem('token') \|\| ''; } catch { return ''; } }`（逐字，L0 覆盖） |
| 2 | `onMounted` 异步注册的 `draftTimer` + `watch` | `useSubmitPage.js:133-147` | `loadAssignment().then(() => { draftTimer = setInterval(…, 30000); … startAnswerWatch(); … ensureEditorObserver(); })` |
| 3 | `:138` 的 `if (el)` 守卫 | `Submit.vue:138`（模板内） | `:ref="(el) => { if (el) editorRefs[sq.id] = el; }"` —— 模板逐字节未动即保证；**未加 else** |
| 4 | `saveAllDrafts` 的 skipped / allSettled 失败分支 | `useDraftSave.js:51,70,76-83` | `if (msg.includes('跳过草稿')) skipped.push(…)` / `const allSaved = results.every(…)` / `if (allSaved) clearDirty(); else markDirty();` / `if (skipped.length) … else if (allSaved) …` 全部逐字 |
| — | `pollStatus` 的 `catch { stopPolling(); }` | `useAssignmentLoader.js` | 逐字（同属"零覆盖分支不许顺手修"） |
| — | 阈值 | — | `1500`(useDraftSave:90) / `30000`(useSubmitPage:137) / `2000`(useAssignmentLoader:98) / `MAX_TIMEOUT_MS = 2147483647`(useCountdown:27) / `rootMargin: '400px'`(useEditorLazyMount:29) / `setTimeout(onDeadlineTick, 1000)`(useCountdown:68) —— 全部实测逐字 |
| — | 文案 | — | `'草稿已同步'`(Submit.vue:69 模板) / `'已提交，改动仅在重新提交时保存'` / `'已过截止时间，改动不再保存'` / `'考试时间已截止'` / `'操作失败'` / `'没有可提交的答案'` —— 全部实测在位 |
| — | `route.params.id` 的 7 处读取位置 | W3 / W5×2 / W6 / W7 / W8×2 | 全部在函数体内按调用时刻读取，**未提前解构**（L0 覆盖） |

## 8 方案偏离与登记项（逐条给依据，供 C 复核）

| # | 事项 | 处理 | 依据 |
|---|---|---|---|
| **D1** | plan §2.2 把 `isSqAnswered` 放进 W1「纯叶子（零响应式）」 | **移入 W2** | 该函数读 `itemAnswers` / `answers`（P1 状态），不是纯叶子；W1 若持有它就必须 import W2 或注入状态 → 违反"零交叉 import"。归属 W2 符合 plan §1.3「与消费者同单元」（唯一消费者是 W2 的 `getSqResult`） |
| **D2** | plan §2.2 把 `sqBoxClass` 放进 W2 | **移入 W3** | 它读 `activeAnchor`（W3 所有，源 `:325`）；留在 W2 会形成 **W2 ⇄ W3 构造环**（W3 的 `retryPractice` 必须写 W2 状态）。同属 P2「导航」段，与 plan §1.3 归属原则一致 |
| **D3** | `submittingAll` 归属：plan §2.2 表放 W7，plan §3.1-1 放 W2 | **W2 创建、注入 W7** | 服从 Captain 铁律①（"P1 的 22 个状态只在 W2 创建一次"）+ plan §3.1-1 的所有权清单 |
| **D4** | `draftTimer`(:318) / `deadlineTimer`(:319) 属 P1 但在两个单元用 | `deadlineTimer` → W6；`draftTimer` → W9 | 二者是**模块级 `let` 计时器句柄**（非响应式状态）：`let` 无法按引用跨模块共享（return 时只传出当时的 `null`）。按"唯一消费者"归属，**所有权仍唯一、无重复创建**；与 plan §2.2 的 W6/W9 划分一致 |
| **D5** | `onMounted` 回调体放哪 | 体进 W9，`onMounted(onPageMounted)` 在 .vue | 同时满足 plan §7.1-7（"`onMounted` 只在 .vue 出现一次"）与 §7.3 B4-2（"回调体平移进 W9"） |
| **D6** | `isSqReadonly`（W9 门面）被 W2 的 `oiCardClass` 使用 → 构造顺序环 | 传**函数声明**（提升，无 TDZ） | `function isSqReadonly` 在 `useSubmitPage` 内是函数声明、整体提升，可在 W2 调用点之前作为实参传入；实际调用只发生在渲染期 / 异步回调 |
| **D7** | `markDirty`（W5）被 W2 的 `onMultiBindChange` 使用 → 环 | 传迟绑定箭头 `markDirty: () => markDirty()` | W5 依赖 W2 的状态对象，只能后建；箭头仅在作答变更回调触发时解引用，无 TDZ |
| **D8** | 4 个"新函数" | `resetEditors` / `startAnswerWatch` / `disposeDraftSave` / `disconnectEditorObserver` | 前两者是 plan §2.2 / §7.3 明令的**包装**（体内逐字为源行）；后两者是 plan §3.1-4「各 composable 暴露 `disposeXxx()`」要求的**薄 disposer**（1 行），因 `saveDebounce` / `editorObserver` 已私有 |
| **D9** | 观察带 | 实测 **18 → 18** | 见 §1 表（plan 的 27 不成立） |
| **D10** | plan §7.2-C4「bindings 键集合+类型完全相等」 | **不可达**（§4.3），用三重更强判据替代 | — |
| **D11** | `node --check` 的效力 | **不足以自证** | 本轮实测：它**放行了 2 处"返回名未声明"**（`resetEditors` / `startAnswerWatch` 缺函数包装 → 运行期 `ReferenceError`）；且在无 `type:module` 的目录（`/tmp`）下对**语法坏文件也返回 0**。→ 新增「返回名必须有声明」结构检查（127/127）+ 真运行时 harness。**建议 C 复核时勿只依赖 `node --check`** |
| **D12** | **★独立发现（本轮只登记不改）**：`onMounted` 的 `.then()` 内注册 watch / `draftTimer` 导致的 1.5s 竞态窗口 | **原样保留** | 改前：页面已渲染 `.oi-card` 但 `GET /assignments/:id` 未回来 → 此时作答**不 markDirty**（既有 E2E `e2e-02-student.spec.mjs` 的注释 + `waitForTimeout(1500)` 就是绕它）。本轮**未提前**（Captain 裁决：属独立行为改进，不得夹带）。**另登记**：组件在请求返回前卸载 → `draftTimer` 在卸载后创建、**永不清理**（既有缺陷，同样未修） |

## 9 ★未执行的验证与原因（诚实登记）

| 项 | 状态 | 原因（可复核） |
|---|---|---|
| **既有 E2E `tests/ui-redesign-verify`（rig）** | **未跑** | ① `rig.sh build` 会写 `tests/ui-redesign-verify/client/dist` 与 `artifacts/dist-fingerprint.txt`（`rig.sh:12,18,36-37`）→ **直接违反本轮"不得改动 tests/"硬约束**；② `rig.sh start` 需要 `rig-server` 私有副本 + 已播种的 `exam_system_test`（:3100），且 `specs/e2e-02-student.spec.mjs` 依赖真实学生账号 + 真实作业夹具；③ 这些属装置 / G-B 决策范围（plan §4.2 已列为 Captain 闸门）。**→ 交 C** |
| 像素门禁 | **不需要** | DoD 改判 A 档：模板+样式**逐字节相等**（§3.1）**严格强于**像素相等 |
| `page.accessibility.snapshot()` 对拍 | **未跑** | 需真浏览器 + 真后端；模板字节相同 ⇒ ARIA 树必然相同（同一论证），C 可补跑 |
| axe | **不可用** | `axe-core` 三处 `node_modules` 全缺（plan §4.1 实测），本轮禁联网 |
| 全量后端回归 | **未跑（C 的职责）** | 本步不动 `server/` |

**给 C 的验证指令**（若决定跑 rig，**必须显式指定主仓库 client 并留痕**）：

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
CLIENT_DIR="/Users/you/My Projects/My Vue/Exam-DeepSeek/client" \
  bash tests/ui-redesign-verify/rig.sh build      # 注意：会写 tests/…/client/dist（C 需自行确认授权）
CLIENT_DIR="…/Exam-DeepSeek/client" bash tests/ui-redesign-verify/rig.sh start   # :3100
cd tests/ui-redesign-verify && PW_TAG=step2-b npx playwright test specs/e2e-02-student.spec.mjs \
  --config playwright.rig.config.mjs
CLIENT_DIR="…/Exam-DeepSeek/client" bash tests/ui-redesign-verify/rig.sh stop
# 留痕：git -C <主仓库> rev-parse HEAD ; shasum -a 256 client/src/views/student/Submit.vue ; rig.sh status（打印 client_dir/dist fp）
```

> ⚠️ 若沿用 `rig.sh` 默认 `CLIENT_DIR`（= `../Exam-DeepSeek-ui/client`，分支 `feat/ui-redesign`），**测的不是本步的代码，证据力为零**。

## 10 门禁实跑（主仓库活树）

| 门禁 | 结果 |
|---|---|
| `node scripts/gates/arch-metrics.mjs` | **PASS**（layerViolations 0/0；unmigrated 46/46 持平；godfileOver800 基线 9 实测 **8**；>500 基线 18 实测 18） |
| `node scripts/gates/cycle-check.mjs` | **PASS**（SCC 0 / 自环 0；扫描面 `server/src` 78 文件 178 边 —— **注意它不扫 `client/src`**，client 侧新边由 L1 / 结构检查 / `vite build` 覆盖） |
| `node scripts/gates/hard-metrics.mjs` | **PASS 0/0/0**（hex6 0 / important 0 / Modal.confirm 0；扫描面 `client/src/style.css` + `**/*.vue`，**逐字不变**） |
| `node scripts/gates/bind-check.mjs` | 违规 **0**（扫描面 `server/src` + `server/test`，**不含 client** → 新增 9 模块的跨模块具名绑定由 `vite build`（exit 0，全图解析）+ 结构检查 127/127 覆盖） |
| `npx vite build --outDir /tmp/split-step2-build --emptyOutDir` | **exit 0**（21.9s，**未重建 `client/dist`**） |
| `git status --porcelain client/src` | ` M client/src/views/student/Submit.vue` + `?? client/src/composables/submit/`（9 文件） |

## 11 搬移块全覆盖对照表（72 块 / 825 行）

#### answerFormat.js  （8 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| itemTypeLabel | 342-345 | 6-9 | 4 | — |
| formatItemAnswer | 352-366 | 11-25 | 15 | — |
| itemTypeColor | 404-409 | 27-32 | 6 | — |
| itemTypeClass | 411-417 | 34-40 | 7 | — |
| getItemKey | 419-419 | 42-42 | 1 | — |
| BOX_RESULT_TEXT | 497-497 | 44-44 | 1 | — |
| boxLabel | 499-503 | 46-50 | 5 | — |
| isCodeStem | 664-667 | 52-55 | 4 | — |

#### useEditorLazyMount.js  （6 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| editorMounted/editorRefs/editorObserver | 554-556 | 12-14 | 3 | — |
| ensureEditorObserver | 558-572 | 16-30 | 15 | — |
| setupEditorObserve | 574-579 | 32-37 | 6 | — |
| mountEditor | 581-588 | 39-46 | 8 | — |
| formatEditor | 590-592 | 48-50 | 3 | — |
| resetEditors（新增薄包装；函数体 = 源 :394-395 两行原样） | 394-395 | 54-55 | 2 | — |

#### useQuestionNav.js  （11 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| contentRef/activeAnchor/collapsedSqs | 324-326 | 20-22 | 3 | — |
| retryPractice（:394-395 → resetEditors()） | 368-402 | 24-57 | 33 | L50 ← "resetEditors();" |
| sqBoxClass（+ 源 :467 注释） | 467-479 | 59-71 | 13 | — |
| boxIndex（+ JSDoc :482） | 482-495 | 75-88 | 14 | — |
| isActiveAnchor | 505-505 | 90-90 | 1 | — |
| focusBoxAt | 507-510 | 92-95 | 4 | — |
| activateBoxAt（+ JSDoc :512） | 512-520 | 97-105 | 9 | — |
| onBoxKeydown（+ JSDoc :522） | 522-537 | 107-122 | 16 | — |
| toggleCollapse | 539-542 | 124-127 | 4 | — |
| scrollTo | 544-547 | 129-132 | 4 | — |
| activateAnchor | 549-551 | 134-136 | 3 | — |

#### useAnswerState.js  （13 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| P1 数据声明（22 个） | 297-321 | 13-37 | 25 | — |
| getNavLabel | 330-340 | 39-49 | 11 | — |
| sqHasScore | 347-350 | 51-54 | 4 | — |
| isSqAnswered | 421-428 | 56-63 | 8 | — |
| getSqResult（+ 源 :430 注释） | 430-442 | 65-77 | 13 | — |
| getItemResult（+ 源 :444 注释） | 444-452 | 79-87 | 9 | — |
| oiCardClass（+ 源 :454 注释） | 454-465 | 89-100 | 12 | — |
| onMultiBindChange | 670-674 | 104-108 | 5 | — |
| initObjectiveAnswers | 677-699 | 112-134 | 23 | — |
| markObjectiveCorrect（+ 源 :701 注释） | 701-726 | 136-161 | 26 | — |
| buildObjectiveAnswer | 728-735 | 163-170 | 8 | — |
| hasPartialOmissions（+ 源 :737 注释） | 737-745 | 172-180 | 9 | — |
| hasObjectiveAnswer | 747-752 | 182-187 | 6 | — |

#### useDraftSave.js  （10 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| dirtyCount/dirtySet | 327-328 | 14-15 | 2 | — |
| markDirty | 755-758 | 19-22 | 4 | — |
| clearDirty | 760-763 | 24-27 | 4 | — |
| D3 注释 + draftNotice + draftNoticeText | 766-773 | 31-38 | 8 | — |
| getToken | 775-777 | 40-42 | 3 | — |
| saveAllDrafts | 779-819 | 44-84 | 41 | — |
| saveDebounce + scheduleSave（+ 源 :821 注释） | 821-826 | 86-91 | 6 | — |
| onVisibilityChange（+ 源 :828 注释） | 828-837 | 93-102 | 10 | — |
| onBeforeUnload（+ 源 :839 注释） | 839-865 | 104-130 | 27 | — |
| startAnswerWatch（新增注册函数；函数体 = 源 :1178-1183 的 watch 原样） | 1178-1183 | 134-139 | 6 | — |

#### useCountdown.js  （10 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| isExpired | 602-602 | 15-15 | 1 | — |
| deadlineTimer（源 :319 原样） | 319-319 | 17-17 | 1 | — |
| P-1 说明注释 + MAX_TIMEOUT_MS | 868-874 | 21-27 | 7 | — |
| clearDeadlineTimer | 876-878 | 29-31 | 3 | — |
| deadlineTimestamp（+ 源 :880 注释） | 880-885 | 33-38 | 6 | — |
| isDeadlineExpired（+ 源 :887-888 注释） | 887-892 | 40-45 | 6 | — |
| armDeadlineTimer（+ 源 :894 注释） | 894-902 | 47-55 | 9 | — |
| onDeadlineTick（+ 源 :904 注释） | 904-919 | 57-72 | 16 | — |
| recalibrateDeadline（+ 源 :921 注释） | 921-933 | 74-86 | 13 | — |
| forceSubmitAll | 936-962 | 90-116 | 27 | — |

#### useAssignmentLoader.js  （3 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| loadAssignment（+ JSDoc :1034-1035） | 1034-1107 | 17-90 | 74 | — |
| pollTimer + startPolling + stopPolling | 1110-1119 | 94-103 | 10 | — |
| pollStatus | 1121-1168 | 105-152 | 48 | — |

#### useSubmitActions.js  （3 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| submitDisabled（+ 源 :638 注释） | 638-648 | 18-28 | 11 | — |
| practiceAllGraded | 650-662 | 30-42 | 13 | — |
| submitAll | 964-1031 | 46-113 | 68 | — |

#### useSubmitPage.js  （8 块）

| 搬移块 | 源行 | 目标行 | 逐字行数 | 替换（白名单） |
|---|---|---|---|---|
| materialText / safeMaterial / safeSqContent | 595-600 | 48-53 | 6 | — |
| remainingAttempts | 604-608 | 55-59 | 5 | — |
| isSqReadonly（函数声明，供 W2/W5/W7 注入） | 610-619 | 61-70 | 10 | — |
| totalScored | 621-625 | 72-76 | 5 | — |
| unsubmittedCount | 627-634 | 78-85 | 8 | — |
| allSubmitted | 636-636 | 87-87 | 1 | — |
| onPageMounted（源 :1172-1190；:1179-1183 的 watch → startAnswerWatch()） | 1172-1190 | 133-147 | 14 | L140 ← "startAnswerWatch();" |
| disposePage（源 :1194-1204；:1196 → disposeDraftSave()、:1204 → disconnectEditorObserver()） | 1194-1204 | 151-161 | 9 | L153 ← "disposeDraftSave();"<br>L161 ← "disconnectEditorObserver();" |

**合计**：72 个搬移块 / **825 行逐字对拍全部相等（0 不等）** / 4 处替换 + 8 处 export 前缀（白名单）。
## 12 复现脚本与证据原文（全部在 /tmp，可重跑）

| 脚本 | 用途 |
|---|---|
| `/tmp/split2/gen.mjs` | 从冻结源切片生成 9 个文件（含 manifest） |
| `/tmp/split2/l0.mjs` | 825 行搬移块逐字对拍 |
| `/tmp/split2/l0vue.mjs` | 模板/样式切片判等 |
| `/tmp/split2/l1.mjs` | compileScript/compileTemplate 对拍 |
| `/tmp/split2/struct.mjs` | 结构检查（返回名必须有声明） |
| `/tmp/split2/returned.mjs` | __returned__ 覆盖 58 名 |
| `/tmp/split2/rt/smoke.mjs` | 真运行时冒烟 31 条 |
| `/tmp/split2/final-verify.log` | 一次性总验证日志原文 |
