# 返工修复 + 判据④回溯扫描（step 2 缺陷 · 2026-10-11）

> 执行者：**Agent B（唯一写者）** ｜ 角色：step 2 返工修复（缺陷由 step 6 的 Agent A 在正控实验中检出）
> 被验树：`/Users/you/My Projects/My Vue/Exam-DeepSeek`（**主仓库**，非第二 worktree `Exam-DeepSeek-ui`）
> HEAD：`b94407f84f44deb87e6fb6efbe2f1ad45290112c`（branch `master`）
> 指纹：`useQuestionNav.js` = `0bd3a5e758e75dd9c6041c262fcc108a` ｜ `useSubmitPage.js` = `5bc8c8296bfd6846f406eb0f19c5640a` ｜ `Submit.vue` = `2ce4c9a7fd65edd95e69141c073f5581`（631 行）
> 仓库内**只改了 2 个文件**（`git status` 其余项均为他人/既有工作：`docs/split/status.md`、`docs/split/QuestionEdit.vue-plan.md` 由 step 6 的 Agent 写入；`server/logs/app-*.log` 为跑测试产生）

---

## 0 结论速览

| 项 | 结果 |
|---|---|
| 缺陷复核 | ✅ **成立**（三件证据链逐条复核无误；见 §1） |
| 修复 | ✅ 2 文件 · **各 1 行**（`2 files changed, 2 insertions(+), 2 deletions(-)`） |
| 判据④回溯扫描 | ✅ **client 52 文件 / server 108 文件 / 合计 160 文件 → 0 命中**；缺陷就是这 1 个（修复前扫描器对它报 1 次） |
| 扫描器正控 | ✅ **3/3 命中**；干净树复跑 **0 命中**（不误报） |
| A 登记的假阳性 | ✅ **复核为真·非缺陷**：`client/src/composables/useConfirm.js:36-37` 的 `onFulfilled/onRejected` 是对象方法简写的**形参**，AST 作用域分析正确绑定 ⇒ 0 命中（**未写入缺陷清单**） |
| 真运行时验证 | ✅ 到 **真 Vue 3.5.34 + 真 compiler-dom 模板 + 真 KeyboardEvent 派发**层；16/16 场景符合期望（含 2 条反证） |
| 五门禁 | ✅ check-layers / arch-metrics / cycle-check(SCC 0) / hard-metrics / bind-check 全 PASS |
| 不变量 | ✅ **未分层 44 / GodFile 5 / 观察带 15**（与基线完全一致，未劣化） |
| 定向测试 | ✅ step1/3/4 六套件**各自隔离进程**全绿（170/170）；批量同进程时 `rule-mutator` 出现 tree-sitter 形态假红（见 §6，非回归） |

---

## 1 缺陷复核（先自己复核 A 的静态证据链）

A 给的三件证据，逐条实测复核：

| # | A 的主张 | 我的复核 | 结论 |
|---|---|---|---|
| ① | `useQuestionNav.js:78` 的 `boxIndex`（computed，:76 起）体内读 `subQuestions.value.forEach(...)` | 读源确认 :76–88 的 computed 体内 :78 = `subQuestions.value.forEach((sq, i) => {` | ✅ |
| ② | 该 composable 注入清单 :10–17 **没有 `subQuestions`** | 读源确认 :10–16 注入五组名（route/confirm · answers…bestScore · dirtySet/dirtyCount · stopPolling/loadAssignment · resetEditors），**无 subQuestions** | ✅ |
| ③ | 调用点 `useSubmitPage.js:121` **也没传 `subQuestions`**，而隔壁 `useDraftSave`(:102-105) / `useSubmitActions`(:108-114) / `useCountdown`(:41-44) 都正确传了各自依赖 | 读源确认 :121–127 传参列表；:103 `subQuestions`、:109 `subQuestions`、:42 `subQuestions` 均在 ⇒ **确系漏列依赖** | ✅ |
| ④ | 可达性：`onBoxKeydown`(:108) 首句即 `boxIndex.value.findIndex(...)`(:109)，且被模板绑定 | `grep onBoxKeydown`：`Submit.vue:43`、`Submit.vue:60` 两处 `@keydown="onBoxKeydown(...)"`；`onBoxKeydown` 是**唯一**读 `boxIndex` 的函数（`activateBoxAt` 由它调用） | ✅ |
| ⑤ | 静默潜伏：`boxIndex` 未被 `useSubmitPage` 解构（:117–120 未取）⇒ 不按键盘不炸 | 读源确认解构表 :117–120 = contentRef/collapsedSqs/isActiveAnchor/onBoxKeydown/toggleCollapse/scrollTo/activateAnchor/retryPractice/sqBoxClass，**无 boxIndex**；且 `boxIndex` 自身也是 computed ⇒ **惰性求值**，只有 :109 首次触碰才求值 | ✅ |

**判据④扫描器（未修复树）对它的实测**：`PC3-injection-removed → detected=[subQuestions@78]` —— 独立复现了 A 的结论。

**缺陷性质**：`方案漏列依赖导致注入缺失`（DoD §5 明示的形态）⇒ **学生答题页在题号方块上按任意键即抛 `ReferenceError: subQuestions is not defined`**，而 `vite build` / L0 字节判等 / L1 bindings 对拍**三条全盲**（非模板可见名、非语法错误）。

---

## 2 修复（最小改动 · 只改依赖传递）

### 2.1 diff（原始 `diff -u` 输出）

```diff
--- a/client/src/composables/submit/useQuestionNav.js
+++ b/client/src/composables/submit/useQuestionNav.js
@@ -8,7 +8,7 @@
 import request from '../../api/request.js';
 
 export function useQuestionNav({
-  route, confirm,
+  route, confirm, subQuestions,
   answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, bestScore,
   dirtySet, dirtyCount,
   stopPolling, loadAssignment,

--- a/client/src/composables/submit/useSubmitPage.js
+++ b/client/src/composables/submit/useSubmitPage.js
@@ -119,7 +119,7 @@
     onBoxKeydown, toggleCollapse, scrollTo, activateAnchor,
     retryPractice, sqBoxClass,
   } = useQuestionNav({
-    route, confirm,
+    route, confirm, subQuestions,
     answers, itemAnswers, multiAnswerBind, subStatuses, subScores, subFeedbacks, bestScore,
     dirtySet, dirtyCount,
     stopPolling, loadAssignment,
```

`git diff --numstat`：`1  1  useQuestionNav.js` / `1  1  useSubmitPage.js`（**2 文件 · 2 增 2 删**）。

### 2.2 为什么把 `subQuestions` 放在这个位置（不改形参名/顺序习惯）

- 本仓的注入传法是「**先 `route, confirm`（接线根提供的框架对象），再业务依赖**」：`useSubmitActions` 调用点 = `route, confirm, q, subQuestions, …`（:109）、`useCountdown` 调用点 = `route, q, endTime, subQuestions, …`（:42）、`useDraftSave` 调用点 = `route, q, subQuestions, …`（:103）。
- `useQuestionNav` 没有自己消费 `q`（它只消费 `subQuestions`），故紧随 `confirm` 之后写 `subQuestions` —— 与既有习惯同构，且**新增的 1 行改动量最小**。
- **未做**：未改任何逻辑、未改名、未改顺序、**未动模板与样式**（`Submit.vue` md5 未变）、未新增依赖。

---

## 3 ★判据④ 自由标识符扫描 · 全量回溯（本步重点）

### 3.1 扫描器实现（AST 作用域分析，**不是正则**）

| 项 | 值 |
|---|---|
| 源码 | `/tmp/b-step2fix/scan/free-ident-scan.mjs`（仓库外自建） |
| 依赖 | `@babel/parser@7.29.8` + `@babel/traverse@7.29.8`（取自 `client/node_modules`，**禁联网**） |
| 判据 | `Program → scope.crawl()`，对每个 `ReferencedIdentifier` 判 `scope.getBinding(name)`；**无绑定且不在白名单** ⇒ 计为自由标识符 |
| 白名单 | JS 内建 + 浏览器/Node 全局 + Vue 编译器宏（`defineProps` 等）+ CJS 包装名（`require/module/exports`）—— 逐条可解释，**不含任何本仓标识符** |
| .vue 处理 | 抽出 `<script>`/`<script setup>` 正文，按 `lineOffset` 还原真实行号后同一套判定 |
| 退出码 | 0 = 0 命中；1 = 有命中 |

### 3.2 ★关键实现要点（A 踩过的坑：对象方法简写的形参）

对象方法简写 `then(onFulfilled, onRejected) { … }` 里的名字是 **`ObjectMethod` 的形参**，`@babel/traverse` 会在该方法 Function 作用域里建绑定 ⇒ `getBinding` 命中，**不会**被误报。
**实测复核**（A 报的假阳性点）：

```
$ node free-ident-scan.mjs client/src/composables/useConfirm.js
[0] client/src/composables/useConfirm.js
-----
FILES=1  FREE_IDENTIFIERS=0     ← 0 命中，确认是 A 那版实现的假阳性，不是缺陷
```

⇒ **未把 `useConfirm.js:36-37` 写入缺陷清单**（已按任务要求排除）。

### 3.3 扫描范围（前 5 步全部产物 + 改造过的 .vue）

**client 侧 = 52 文件**

| 组 | 文件数 | 清单 |
|---|---|---|
| `client/src/composables/submit/` | 9 | answerFormat · useAnswerState · useQuestionNav · useEditorLazyMount · useDraftSave · useCountdown · useSubmitActions · useAssignmentLoader · useSubmitPage |
| `client/src/composables/project/` | 9 | zipEntry · useEditorWorkspace · useQuestionForm · useChecker · useStudentSubmission · useZipUpload · useSaveQuestion · useLoadQuestion · useProjectQuestionPage |
| `client/src/composables/`（根，含 step 2 之前既有件） | 7 | useConfirm · useDraftAutosave · useMonacoKeyboardA11y · useMonacoTheme · useProjectUpload · useSelectAriaSync · useTheme |
| `client/src/views/**/*.vue`（含被改造的 Submit.vue、ProjectQuestionEdit.vue） | 27 | Doc · Login · admin/{AiConfig,Classes,Layout,Monitor,Schools,Students,Teachers} · student/{Assignments,Layout,Scores,Submit} · teacher/{Assignments,Classes,Layout,ProjectQuestionEdit,ProjectReviewNew,QuestionEdit,Questions,Review,ReviewClass,ReviewDetail,RuleQuality,Students,TeamEdit,Teams} |

**server 侧 = 108 文件**（`server/src` 96 + `server/scripts` 10 + `server/test-grading.js` 2）

| 组 | 文件数 | 说明 |
|---|---|---|
| `server/src/{domain,application,infrastructure}` | 52 | step 1/3/4 拆出的全部新模块 + 既有分层模块 |
| `server/src/{controllers,routes,middleware,services,utils}` + `app.js/worker.js/socket.js/constants.js` | 44 | step 1/3/4 的 import 站点与既有件 |
| `server/scripts/` + `server/test-grading.js` | 12 | step 1/4 改过 import 的脚本 |

> 口径说明：我按**目录全量**扫（比只扫「已知产物清单」更强）；`server/test/**`（测试代码）与 `tests/`（禁改区）不在扫描面内，属登记边界。

### 3.4 结果：**两侧全 0**

```
$ node free-ident-scan.mjs client/src/composables client/src/views
[0] client/src/composables/project/useChecker.js
…（52 行，全部 [0]）…
[0] client/src/views/teacher/Teams.vue
-----
FILES=52  FREE_IDENTIFIERS=0          exit=0

$ node free-ident-scan.mjs server/src server/scripts server/test-grading.js
[0] server/scripts/cgroup-remaining-experiment.mjs
…（108 行，全部 [0]）…
[0] server/test-grading.js
-----
FILES=108  FREE_IDENTIFIERS=0         exit=0
```

**结论：回溯命中 = 1 个，且就是本次修掉的 `useQuestionNav.js:78 subQuestions`（修复前扫描该文件报 1 次）；修复后 client 52 + server 108 = 160 文件全 0。**

### 3.5 正控（3/3）与干净树（0 命中）

```
===== 判据④ 扫描器正控（3 个独立变异，每个必须报 ≥1 次）=====
PASS  PC1-import-removed  → exit=1  detected=[computed@47, computed@51, computed@54, computed@71, computed@77, computed@86]
        删掉 useSubmitPage.js 的 import { computed } from 'vue' → computed 变为自由标识符
PASS  PC2-rename-callee  → exit=1  detected=[sqBoxClassTypo@141]
        在 useQuestionNav.js 内把一处使用改成未声明的名字 sqBoxClassTypo
PASS  PC3-injection-removed  → exit=1  detected=[subQuestions@78]
        去掉 useQuestionNav.js 注入清单里的 subQuestions（= 本次缺陷原形；扫描器必须报一次）
正控结果: 3/3 命中
```

三条正控分别覆盖三类真实形态：**①删 import（E1 形态）②改名/拼错（未知 callee）③去注入（本次缺陷形态）**。正控全部在 `/tmp` 的变异副本上做，**未触碰仓库源文件**。
干净树复跑（§3.4 两条命令）**0 命中** ⇒ 扫描器不误报。

### 3.6 客户端「真 import 一次」探针（bind-check 的客户端补位，附加证据）

`scripts/gates/bind-check.mjs` 的默认根是 `server/src`+`server/test`，**client 侧没有等价门禁**。故自建探针（`/tmp/b-step2fix/scan/probe-driver.mjs` + `node-loader-client.mjs`）：
真实 `import()` 每个 `client/src/**/*.js`（vue / vue-router / pinia / dompurify / axios **真解析自 `client/node_modules`**；`ant-design-vue` 等重浏览器依赖走「只声明本仓真用到的具名导出」的替身；`.vue/.css` → 替身；`import.meta.env` → 等价 define 替换）。

```
真 import 模块 40 个；失败 0 个          （干净树 exit=0）

===== 探针正控（变异反证）=====
PASS  PC1-cross-module-export-renamed  exit=1  命中 2 行
        [FAIL] composables/project/useProjectQuestionPage.js  -> …does not provide an export named 'formatDateTimeSec'
        [FAIL] composables/project/useStudentSubmission.js     -> …does not provide an export named 'formatDateTimeSec'
PASS  PC2-export-renamed  exit=1  命中 1 行
        [FAIL] composables/submit/useSubmitPage.js  -> …'./useQuestionNav.js' does not provide an export named 'useQuestionNav'
客户端真 import 探针正控: 2/2 命中
```

---

## 4 ★真运行时验证（判据⑤）——验到了哪一层，如实说明

### 4.1 装置（全部在仓库外 `/tmp/b-step2fix/harness/`）

| 组件 | 真实度 |
|---|---|
| Vue 运行时 | **真 Vue 3.5.34**（`client/node_modules` 真解析） |
| 模板 | **真 `@vue/compiler-dom` 编译产物**；模板正文用**行号**从真 `Submit.vue:25-64` **逐字节截取**（脚本内校验 `:43/:60` 两行 `@keydown` 绑定确在片段内 → `fragVerified=true`）；唯一人工补全 = 外层容器 `<div class="sp-nav-list">`（平衡标签） |
| 接线 | 真 `useQuestionNav(...)` 真 `$setup` 解构；真 `v-for` 渲染出真 `.n-box` 元素 |
| 事件 | 真 `KeyboardEvent` **派发到真元素** → 走真 Vue 的元素级监听器 → `onBoxKeydown` |
| 错误链 | 真 `app.config.errorHandler`（Vue 的 `callWithErrorHandling` 会捕获处理器同步异常） |

**假的部分（明确登记）**：DOM 是**最小合成替身**（`dom-stub.mjs`，非浏览器、**非 jsdom**——本仓未安装且禁联网安装）；`document/window/matchMedia` 等为替身；`scrollIntoView / message / request / confirm` 为替身（本用例不评价其语义）。
**装置自证**：`bad` 变体的模块文本 **== `/tmp` 里的修复前原件**（仅 import 规格化）⇒ 它复现的就是缺陷原形，不是"我编的坏代码"。

### 4.2 场景与结果（16/16 符合期望）

```
装置自证: 真 Vue=3.5.34 | bad 变体 == pristine 原件(仅 import 规格化)=true | 修复版 != pristine=true

结果  | 变体          | 调用点传参 | 按键        | boxIndex(isRef,len) | 异常                                        | 期望→实测 | 高亮变化 | focus次数
PASS  | badInjection  | 不传       | "Enter"     | true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 0
PASS  | badInjection  | 不传       | " "         | true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 0
PASS  | badInjection  | 不传       | "ArrowRight"| true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 0
PASS  | badInjection  | 不传       | "ArrowDown" | true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 0
PASS  | badInjection  | 不传       | "ArrowLeft" | true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 0
PASS  | badInjection  | 不传       | "ArrowUp"   | true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 0
PASS  | badInjection  | 不传       | "a"         | true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 0
PASS  | good          | 传         | "Enter"     | true,3              | -                                           | OK→OK       | true   | 1
PASS  | good          | 传         | " "         | true,3              | -                                           | OK→OK       | false  | 2
PASS  | good          | 传         | "ArrowRight"| true,3              | -                                           | OK→OK       | false  | 3
PASS  | good          | 传         | "ArrowDown" | true,3              | -                                           | OK→OK       | false  | 4
PASS  | good          | 传         | "ArrowLeft" | true,3              | -                                           | OK→OK       | false  | 5
PASS  | good          | 传         | "ArrowUp"   | true,3              | -                                           | OK→OK       | false  | 6
PASS  | good          | 传         | "a"         | true,3              | -                                           | OK→OK       | false  | 6
PASS  | badInjection  | 传         | "Enter"     | true,null           | ReferenceError: subQuestions is not defined | THROW→THROW | null   | 6
        ↳ 反证 A：只补调用点、不补注入清单 → 仍抛（两处都必须改）
PASS  | goodCopy      | 不传       | "Enter"     | true,null           | TypeError: …reading 'value'                 | THROW→THROW | null   | 6
        ↳ 反证 B：只补注入清单、调用点不传 → 仍抛（调用点那一半不可省）
运行时场景: 16/16 符合期望
```

**读法**：修复前（`badInjection`+不传）**7 个按键路径全部抛 `ReferenceError: subQuestions is not defined`**（Enter/Space/四个方向键/普通字符都先经过 `:109 boxIndex.value`）；修复后（`good`+传）**全部不再抛**，且行为面同时被证实：
- Enter/Space → `activeAnchor` 变化 + `focus()` 真实发生（focus 计数 1→2 递增）；
- 四个方向键 → 同样触发高亮 + focus（3→6）；
- 普通字符 `a` → 按源码 `:119 else return` **不激活**（focus 计数停在 6）——即"非导航键不动"的原语义；
- **两条反证**证明修复的两半都不可省。

### 4.3 ★如实说明：验到了哪一层 / 没验到哪一层

**验到了**
1. 模块级绑定：`useQuestionNav` 在真 Node ESM 下能被真 import，导出面正确（§3.6）。
2. 求值路径：`boxIndex`（真 computed，`isRef=true`、`len=3`）在修复后能求值；修复前在该路径抛 `ReferenceError`。
3. 接线两半：注入清单 + 调用点，**各自缺失都会抛**（反证 A/B）。
4. 键盘语义：`onBoxKeydown` 的 5 条分支（Enter、Space、双方向、else-return）在真事件派发下行为与源码一致。
5. 模板绑定真实存在：`@keydown` 所在两行是从真 `.vue` 逐字节取来的，且模板是真编译器产物。

**没验到（不得含糊）**
1. **没有真浏览器**：DOM 是替身 ⇒ 未验 CSS 布局、真实焦点环、`scrollIntoView` 的真滚动、真实 Tab 序、屏幕阅读器。
2. **不是完整页面**：装置只渲染 `Submit.vue:25-64` 的题号导航段（+ 外层容器），**没有**渲染整页（Monaco 编辑器、材料区、提交栏均未渲染），故"整页挂载无报错"未被本装置证明。
3. **未跑 L0/L1/L2 与像素门禁**：本步是 A 档小修，模板/样式字节未动（md5 未变）—— 但我**没有**重跑 step 2 的 L0 切片判等与 L1 bindings 对拍装置（它们属 step 2 归档；C 若需要可复跑）。
4. **未做真 E2E**：没有启 `:5173`/`:3000`、没有 Playwright、没有真后端 ⇒ "学生登录后按方向键"的端到端链路未验（本步按硬约束不碰端口与 `tests/`）。
5. **未跑全量回归**：按分工留给 C。

---

## 5 门禁（复跑五项，全部 PASS）

| 门禁 | 命令 | 结果 |
|---|---|---|
| 分层 | `node server/scripts/check-layers.mjs` | 文件 96 · 违规 **0** · 未分层待迁移 **44** → exit 0 |
| 架构指标 | `node scripts/gates/arch-metrics.mjs` | `layerViolations 0=0` ｜ `unmigrated 基线44=实测44` ｜ `godfileOver800 基线5=实测5` ｜ 观察带 `>500` **基线15=实测15** → **PASS** |
| 循环依赖 | `node scripts/gates/cycle-check.mjs` | 96 文件 / 214 边 ｜ **SCC 0**（基线 0）｜ 自环 0 → **PASS** |
| 硬指标 | `node scripts/gates/hard-metrics.mjs` | hex6 0 / important 0 / modalConfirm 0 → **PASS** |
| 绑定 | `node scripts/gates/bind-check.mjs` | 194 模块 · 652 具名绑定 · **BINDING VIOLATIONS 0**（unresolved 4 / external 1 均只登记）→ exit 0 |

**不变量未变**：未分层 **44** / GodFile **5** / 观察带 **15**（与 `arch-metrics.mjs` 基线逐项相等）。
GodFile>800 清单：teacherController 1338 · Doc.vue 1106 · ReviewDetail.vue 988 · QuestionEdit.vue 983 · reviewController 965（**未因本次修复变化**）。

---

## 6 定向测试（全量留给 C）

**前置**：`DATABASE_URL` = 由 `server/.env` 派生、库名换为 `exam_system_test`（`test/setup.js` 白名单强制）；`PORT=0` 由 `test/setup.js` 设置；先 `prisma db push --skip-generate`（已 in sync，未改 `node_modules`）。

**step 2 相关套件**：client 侧 `client/` **没有测试套件**（`client/test` 不存在，`client/package.json` 无 test 脚本）⇒ 本步的定向验证由 §3 扫描 + §3.6 真 import 探针 + §4 真运行时装置承担。

**import 了被试模块（step 1/3/4 产物）的套件**：逐套件**各自独立进程**复跑：

| 套件 | 结果 |
|---|---|
| `server/test/unit/infrastructure/rule-executor.test.js` | **61 passed** / 61 |
| `server/test/unit/infrastructure/rule-mutator.test.js` | **21 passed** / 21 |
| `server/test/unit/infrastructure/checker-service.test.js` | **42 passed** / 42 |
| `server/test/unit/deepseek.test.js` | **19 passed** / 19 |
| `server/test/unit/infrastructure/rubric-items.test.js` | **9 passed** / 9 |
| `server/test/unit/infrastructure/trustjudge-grader.test.js` | **18 passed** / 18 |
| **合计** | **170 passed / 0 failed** |

**如实登记一处假红**：把上述 6 个套件**塞进同一个 jest 进程**批跑时，`rule-mutator.test.js` 出现 **11 failed**，报错全部是 `src/infrastructure/rule/syntax.js:49 TypeError: Cannot read properties of undefined (reading 'type')`（tree-sitter 解析根节点为 undefined）——**隔离复跑 21/21 全绿**，且**我未改任何 server 文件**（`git status` 可证）⇒ 判为**同进程多 tree-sitter 语法加载导致的形态性假红**（与既有记忆里"tree-sitter ABI 污染/高并发假红"同族），**不是本步回归**。C 跑全量时请注意此坑（若复现，隔离复跑即可判负）。

---

## 7 给 C 的验证指令（可逐条复制执行）

```bash
# 0) 前置：确认被验树 + HEAD + 指纹（必须指向主仓库，不是 Exam-DeepSeek-ui）
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek"
git rev-parse HEAD            # 期望 b94407f…（＋本轮 2 行未提交改动）
md5 -q client/src/composables/submit/useQuestionNav.js   # 期望 0bd3a5e758e75dd9c6041c262fcc108a
md5 -q client/src/composables/submit/useSubmitPage.js    # 期望 5bc8c8296bfd6846f406eb0f19c5640a
git diff --numstat -- client/src/composables/submit/    # 期望每文件 1 增 1 删，且只有这 2 个文件

# 1) 判据④ 扫描（C 必须自建实现，不得复用我的 /tmp 脚本）
#    要求：AST 作用域分析；client 52 文件 + server 108 文件 = 0 命中；正控 3/3；干净树 0 命中
#    已知陷阱：对象方法简写形参（useConfirm.js:36-37 的 onFulfilled/onRejected）不得误报

# 2) 判据⑤ 运行时（C 自建装置；不得复用 /tmp/b-step2fix/harness）
#    必验：修复前形态（注入缺 subQuestions）在 Enter/Space/方向键路径抛 ReferenceError；
#          修复后同路径不抛，且 activeAnchor 变化 + focusBoxAt 被调用；
#          两条反证：只改调用点 / 只改注入清单 → 仍抛

# 3) 五门禁（期望全绿；不变量 未分层 44 / GodFile 5 / 观察带 15）
node server/scripts/check-layers.mjs
node scripts/gates/arch-metrics.mjs
node scripts/gates/cycle-check.mjs
node scripts/gates/hard-metrics.mjs
node scripts/gates/bind-check.mjs

# 4) 定向测试（PORT=0 由 test/setup.js 保证；库名必须是 exam_system_test）
cd server
TEST_URL="$(node -e 'const fs=require("fs");const m=fs.readFileSync(".env","utf8").match(/^DATABASE_URL=(.*)$/m);const u=new URL(m[1].trim().replace(/^"|"$/g,""));u.pathname="/exam_system_test";process.stdout.write(u.toString())')"
DATABASE_URL="$TEST_URL" npx --no-install prisma db push --skip-generate
for t in rule-executor rule-mutator checker-service; do
  DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules npx --no-install jest \
    --config test/jest.config.js --runInBand --forceExit "test/unit/infrastructure/$t.test.js"
done
DATABASE_URL="$TEST_URL" NODE_OPTIONS=--experimental-vm-modules npx --no-install jest \
  --config test/jest.config.js --runInBand --forceExit test/unit/deepseek.test.js \
  test/unit/infrastructure/rubric-items.test.js test/unit/infrastructure/trustjudge-grader.test.js
# ⚠️ 注意：批量同进程可能出现 tree-sitter 形态假红（rule-mutator 11 failed）→ 隔离复跑判负

# 5) 全量回归（C 的职责）
ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh    # 4 处摘要、0 failed
```

---

## 8 边界与未办项（如实登记）

1. **未跑 step 2 的 L0/L1/L2 归档装置**（本步只动 2 行依赖传递，模板/样式 md5 未变；若 C 要求"完整 A 档 5 条判据"，L0/L1 需复跑 step 2 归档的装置）。
2. **`server/test/**` 与 `tests/**` 不在判据④扫描面内**（后者是禁改区；前者是测试代码）。
3. **`server/scripts/` 中 3 处陈旧引用**（`server/test-grading.js` 已由他人修；`server/tmp-probe-ref-answer.mjs`、`docs/test-results/2026-08-17-round3/verify-r3.mjs`）**本次未触碰**——沿用既有裁定（证据残骸/归档不动）。
4. **未做任何 git 写操作**（无 add/commit/stash/checkout/clean/reset）；本轮改动**留在工作区**，等待 C 验证后由流程决定提交。
5. **未新增依赖、未联网**；所有自建产物在 `/tmp/b-step2fix/`（仓库外），仓库内仅 2 个源文件被改。
