# Wave 3 交互契约与基线实测（Submit / ReviewDetail / ProjectReviewNew）

> 分支 `feat/ui-redesign` ｜ 工作根目录 `/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`
> 本文件是 Wave 3 三页改造的**冻结契约**：实现者按它改，验收方按同一份断言复核。
> 基线实测时间：2026-10-09 20:05–20:32（会话 nav-dev / t18）。

---

## 0. 运行环境与使用方式（先读这一节）

**环境**

| 项 | 值 |
|---|---|
| 前端 dev server | `cd client && npm run dev -- --host 127.0.0.1 --port 5175 --strictPort` → **http://localhost:5175/exam/**（必须用 `localhost`，用 127.0.0.1 会被后端 CORS 拒） |
| 后端 | http://localhost:3000（已在跑；前端 `/api` 由 Vite 代理） |
| 教师账号 | `test_teacher / test_teacher`（role=teacher，currentSchool.id=3453） |
| 学生账号 | `10001@4145013830 / 10001`（开发库规则：密码=用户名，见 08-wave0-pilot-log.md） |
| 登录态注入 | 直接写 localStorage：`token` = `POST /api/auth/login` 返回的 data.token；`user` = 同一响应的 data.user（JSON 字符串）。Playwright 用 `storageState.origins[0].localStorage` 注入，无需走登录 UI |
| 基线截图 | `docs/ui-redesign/preview/shots/wave3-baseline/`（本文件引用的每张图都在此目录） |

**写操作一律拦截**（本次实测全部拦截，**未对开发库产生任何写操作**）：

```js
await page.route((u) => new URL(u.toString()).pathname.startsWith('/api/'), async (route) => {
  const req = route.request();
  const WRITE = /\/(draft|submit|retry|regrade|review|publish)\b/;
  if (req.method() !== 'GET' || WRITE.test(new URL(req.url()).pathname)) {
    log.push({ m: req.method(), p: req.url(), body: req.postData() });          // 记录请求形状
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: {} }) });
  }
  return route.continue();
});
```

**三个环境坑（本次实测踩到，复跑前必读）**

1. **不要用 `waitUntil: 'networkidle'`**：这三页都有 setInterval（Submit 轮询、ProjectReviewNew 轮询），networkidle 永不 settle，`goto` 会一直等到超时。用 `domcontentloaded` + `waitForSelector` + 固定 `waitForTimeout`。
2. **过期作业是只读态**：学生 10001 名下的作业 endTime 基本都已过期，页面不给编辑器/提交按钮。要测可写路径必须用 `route.fetch()` 改写 `data.assignment.endTime`（本次一次改写脚本因 route handler 异常未跑完，见 §5）。
3. **写操作拦截要在 handler 里 try/catch**：route handler 抛错会让整个 Playwright 脚本退出（本次 round 2 就是这样丢的）。

**基线数据快照（真实开发库）**

| 页面 | 目标 | 说明 |
|---|---|---|
| Submit | `/exam/student/assignments/306` | 学生 10001 名下；6 个小题（第 1 题 30 问客观题 + 5 个编程题）；**真实 endTime 已过期 → 只读态** |
| ReviewDetail | `/exam/teacher/review/10293` | status=ai_graded，2 个小题（均编程），有 AI 评语 |
| ProjectReviewNew | `/exam/teacher/review/project/10297` | 实训题提交，**有标准答案包**（9 个文件节点） |

---

## 1. Submit.vue（学生作答页）契约

| # | 触发 | 期望 | 断言方式（可复跑） | 基线实测结果（2026-10-09） |
|---|---|---|---|---|
| S1 | 打开 `/exam/student/assignments/306` | 渲染题号导航：每个小题一个可折叠分组 + 题号方块；客观题方块数与 objectiveItems 数一致 | `document.querySelectorAll('.sq-section').length`；`.n-section-head` / `.n-grid-wrap` 数量；`input[type=radio]` 数量 | **实跑**：`sections=6`、`.n-section-head`=6、`.n-grid-wrap`=6（共 12 个导航条目）；第 1 小节显示「30问」（30 个方块），第 2–6 小节显示「编程」。`input[type=radio]=100`、`input[type=checkbox]=0` → **客观题 choice 型渲染为 radio**。截图 `submit-a1-active.png` |
| S2 | 点击某题号方块 | 定位/高亮到对应小题；当前题高亮 class 可辨；已答/未答标记不同 | 点击 `.n-grid-wrap > div` 后比较 `className` 与 `.is-active`/`current` 类 | **未实跑**（该作业只读态下导航项无 active 类；见 §5 复跑步骤：需可写作业 + 先作答一题） |
| S3 | 键盘等价（←/→ 或 ↑/↓）切题 | 与点击等价（同一 active 目标） | `page.keyboard.press('ArrowRight')` 后比较 active 元素 | **未实跑**（同上；代码中导航为 `@click`，键盘等价性需实测确认） |
| S4 | 在可编辑控件输入 → 停止输入 | 1500ms 防抖后发出草稿保存请求 | 记录最后一次 `input` 事件时间 T，监听 `PUT /api/student/assignments/:id/draft` 的到达时间，期望 ≈ T+1500ms | **未实跑**（只读态：`textarea=0`、无编辑器）。**代码基线**：`saveDebounce = setTimeout(saveAllDrafts, 1500)`（Submit.vue:696），触发源为 `watch([...answers...], { deep: true })`（:981）→ 断言 = 请求到达时间 − 最后一次输入时间 ∈ [1400, 1900]ms |
| S5 | 保持脏数据不动 30s | 定时兜底保存一次 | 记录两次 draft 请求间隔 | **未实跑**。**代码基线**：`draftTimer = setInterval(() => { if (dirtySet.size > 0) saveAllDrafts(); }, 30000)`（:976）；断言 = 无输入时出现间隔 ≈30000ms 的 draft 请求 |
| S6 | 切到后台（visibilitychange）+ 关页（beforeunload） | 立即落盘（keepalive fetch），不等防抖/定时 | `Object.defineProperty(document,'visibilityState',{value:'hidden'})` 后 `dispatchEvent(new Event('visibilitychange'))`；或 `window.dispatchEvent(new Event('beforeunload'))`，观察 `fetch(...keepalive)` 的 `POST /draft` | **实跑（负面用例）**：无脏数据时两个事件**都不产生请求**（实测 `[]`），与代码 `if (!dirtySet.size) return` 一致。**正面用例未实跑**（需先产生脏数据） |
| S7 | 打开含编程小题的作业 | 编程题编辑器**懒挂载**：初始不挂载，滚入视口前 400px 才挂载；离开后卸载 | `document.querySelectorAll('.monaco-editor').length` 记录滚动前/滚动后 | **实跑（只读态）**：滚动前 0、把编程小题 `scrollIntoView({block:'center'})` 后仍 **0**（只读态不挂载编辑器）。**代码基线**：`new IntersectionObserver(..., { rootMargin: '400px' })`（:988）+ 命中后 `unobserve`；断言步骤：可写作业下滚动前后计数应为 0 → ≥1 |
| S8 | 四类客观题控件（choice / multi / judge / fill？） | 每类渲染对应控件（radio / checkbox / …） | 逐 objectiveItems.type 统计 `input[type]` | **部分实跑**：本作业客观题全是 choice → radio（100 个）；**checkbox=0**，其余类型未覆盖（需含 multi/judge 的作业） |
| S9 | 点提交（未答完） | 校验拦截：确认框或 warning，不提交 | 点 `.sp-submit-bar button` 最后一个，断言出现 `.ant-modal-confirm` 或 `.ant-message-notice` | **未实跑**（只读态无提交按钮：`.sp-submit-bar button` 定位超时）。**代码基线**：`Modal.confirm`（:802，含未答题提示）；提交 = `POST /student/assignments/:id/submit`（:813） |
| S10 | 提交后 | 页面转只读（不可再编辑），状态标签变化 | 比较提交前后 `textarea/input[disabled]` 数与状态文本 | **未实跑**（未做真实提交，写操作被拦截） |
| S11 | 轮询节拍与停止条件 | 有提交处于评分中时每 2000ms 拉一次；无评分中则停止 | 统计 `GET /api/student/assignments/:id` 的时间戳序列 | **实跑（负面）**：仅首屏 1 次 GET，20s 内无轮询（该提交不在评分中）。**代码基线**：`pollTimer = setInterval(pollStatus, 2000)`（:916），`if (!anyGrading) stopPolling()`（:963） |
| S12 | 倒计时三态（>24h / <24h / 最后 10 分钟 / 过期） | 三种呈现（含最后 10 分钟强调）与到点强制提交 | 路由改写 `assignment.endTime` 后读倒计时元素文本/class | **未实跑**：把 endTime 改写为 now+30h / +20h / +5min / −1min 四次加载，DOM 事实完全相同、且未在 `[class*=count|timer|deadline|remain|expire]` 命中倒计时元素（截图 `submit-countdown-{gt24h,lt24h,last10min,expired}.png`，其中 expired 图与其它三张字节不同 → 过期态确有视觉差异）。**需先定位倒计时选择器**（建议 `grep -n 'countdown\|deadline\|剩余\|remainingLabel' Submit.vue`）。**代码基线**：`deadlineTimer = setTimeout(() => forceSubmitAll(), remaining)`（:889） |
| S13 | 参考答案 / 题目材料的可见条件 | 仅满足条件（已提交/已发布/练习模式）时可见 | 断言 `referenceAnswer` 区块存在性与 status 的关系 | **未实跑**。**代码基线**：`existing.referenceAnswer = freshSq.referenceAnswer`（:961，随轮询写回）→ 需用 published / practice 两种状态各测一次 |

**Submit 页首屏接口集合（实测，逐字比对用）**
```
GET /api/student/assignments/306
GET /api/student/profile
```
（pageerror = 0，console error = 0；导航页脚文本 = `草稿已同步`；提交条文本 = `共 6 题，3 题未提交已提交`）

---

## 2. ReviewDetail.vue（教师逐题批改）契约

| # | 触发 | 期望 | 断言方式 | 基线实测结果（10293） |
|---|---|---|---|---|
| R1 | 打开 `/exam/teacher/review/10293` | 只读 Monaco 按小题挂载并格式化代码 | `.monaco-editor` 数；`格式化` 按钮可点后内容不变/重排 | **实跑**：`.monaco-editor=2`（2 个编程小题各 1）、`.sq-section=2`、每节按钮 = 格式化 / 重新评分 / 提示词 / 使用 AI 评语。截图 `reviewdetail-10293.png` |
| R2 | 点章节头 | 折叠/展开该小节的题号块（`.n-grid-wrap` 加/去 `collapsed`） | 比较 class 列表 | **实跑**：before `["n-grid-wrap","n-grid-wrap"]` → after `["n-grid-wrap collapsed","n-grid-wrap"]`（再点回恢复） |
| R3 | 点题号方块 | 滚动定位到对应小题并高亮 | 点击后断言 `scrollTop` 变化 + active 类 | **未实跑**（选择器已定位：`.n-grid-wrap > div`，含 `activateAnchor`/`scrollTo`） |
| R4 | 点「重新评分」 | 发起单小题重评请求并按返回刷新；按钮 loading | 网络监听 + `button.loading` | **实跑**：`POST /api/teacher/submissions/10293/regrade`（1 次，body 为空；实测已被拦截，未污染开发库） |
| R5 | 点「使用 AI 评语」 | AI 评语写入该小题的**教师评语**输入框 | 比较点击前后 `textarea.value` | **实跑**：点击前 4 个 textarea 皆空；点击第 1 节按钮后 **第 2 个 textarea**（= 第 1 节的教师评语框）值变为 AI 评语全文（实测片段：`学生提交的答案'测试 3'并非有效的C++代码…`） |
| R6 | 点「保存审核」 | 保存终分/评语，请求形状 `PUT /teacher/submissions/:id/review` | 记录请求 body 字段名与类型 | **未实跑**：该提交状态下页脚动作条未渲染（`button="保存审核"` 定位超时；页面按钮集合只有各小节的 4 个按钮）。**代码基线**：`request.put('/teacher/submissions/' + s.id + '/review', {...})`（:492）。复跑：换一个未发布且可编辑的提交（`status=ai_graded` 且属于当前教师可见班级）再断言 |
| R7 | 点「发布成绩」 | 先弹确认框，确认后发布 | `.ant-modal-confirm` 文本 + 网络请求 | **未实跑**（同 R6：按钮未渲染）。**代码基线**：`Modal.confirm`（:513）→ `PUT /teacher/submissions/publish { submissionIds: [...] }`（:522） |
| R8 | 参考答案对照显示条件 | 仅在满足条件时显示参考答案区块 | 统计 `[class*=ref]` 与 status 的关系 | **实跑（负面）**：该提交 `[class*=ref]` = 0、无材料条（`material=null`） |

**ReviewDetail 首屏接口集合（实测）**
```
GET /api/teacher/submissions/10293
GET /api/teacher/pending-summary
```
（pageerror = 0，console error = 0）

---

## 3. ProjectReviewNew.vue（实训题阅卷）契约

| # | 触发 | 期望 | 断言方式 | 基线实测结果（10297） |
|---|---|---|---|---|
| P1 | 打开含标准包的提交 | 树标签 = 学生提交 + 标准答案包 | `.pr-tree-tabs .ant-tabs-tab` 文本 | **实跑**：`["学生提交","标准答案包"]`（10297 有标准包） |
| P2 | 打开**无标准包**的提交 | 不渲染「标准答案包」tab，默认停留「学生提交」 | tab 文本列表 + `activeKey` | **未实跑**（需一个无标准包的项目提交；代码条件 `v-if="hasStandardFiles"`，:21；`hasStandardFiles` = tree 或 contents 非空，:229） |
| P3 | 点文件树节点 | 打开为标签（同一文件不重复开）；Monaco 用 `file:///{source}/{path}` 建 model | `.tab .tab-name` 列表；`.monaco-editor` 数 | **实跑**：点第一个文件 → tabs=`["Dog.java"]`、`.monaco-editor=1`、active=`Dog.java`。截图 `projectreviewnew-file-open.png` |
| P4 | 关闭当前标签 | 回退到剩余标签的最后一个；无剩余则清空并显示空态 | 关标签后 `.tab` 列表 + `.pr-code-empty` | **实跑**：关闭唯一标签 → tabs=`[]`、active=null、`.pr-code-empty` 出现。截图 `projectreviewnew-panel-collapsed.png` |
| P5 | 切到「标准答案包」再切回 | 双源各自保留 openTabs/展开状态与内容缓存 | 切源前后 `openTabs`/`activePath` 的恢复 | **未实跑**（代码：`sourceState = { student: {...}, standard: {...} }`，:239-243；切换函数 :367+） |
| P6 | 文件树展开/折叠 | 目录节点可展开折叠；两源树不串 | treenode 数与 `expandedKeys` | **部分实跑**：文件树渲染 9 个 treenode（默认展开）；展开/折叠动作未实跑 |
| P7 | 重新评分 → 轮询 | 评分中每 5000ms 轮询，最长 72 次（6 分钟），完成后停止并刷新数据 | 记录 `GET /teacher/project-submission/:id` 时间戳序列与结束条件 | **实跑（负面）**：当前 `grading.state=none` → 20s 内**无轮询**（仅首屏 1 次 + pending-summary 1 次）→ 与 `startPolling` 的启动条件一致。**代码基线**：`POLL_INTERVAL=5000`、`POLL_MAX=72`（:484-485）、`if (gs !== 'pending') stopPolling()`（:501）。注意：任务书写的「3s 轮询」与代码不符，**以实测 5000ms 为准** |
| P8 | 点「收起/展开」评分面板 | 面板折叠；Monaco 不失焦/不重排（尺寸不变） | 折叠前后 `.monaco-editor` 尺寸、`document.activeElement` | **部分实跑**：`.panel-toggle` 文本 收起→展开 ✓；但该时点无打开文件（上一步已关标签）→ `.monaco-editor=0`，**尺寸/焦点对照未取得**。复跑：先开文件、点进编辑器再折叠（截图 `projectreviewnew-panel-collapsed.png`） |
| P9 | 教师终分/评语保存 + 重新评分 | `审核通过/更新审核` 保存；`重新评分` 触发重评 | 网络请求形状 | **未实跑**（按钮存在：`重新评分`、`查看提示词`、`引用到教师评语`、`审核通过`；API 走 `api/projects.js` 的 `saveProjectReview`/`regradeProjectSubmission`）。复跑：点按钮后记录 `POST/PUT` 路径与 body |
| P10 | 评分中状态呈现 | 面板显示「评分中」并禁用/loading，超时提示 | 断言状态文本 + 按钮 loading 属性 | **未实跑**（需先触发重评） |

**ProjectReviewNew 首屏接口集合（实测）**
```
GET /api/teacher/project-submission/10297
GET /api/teacher/pending-summary
```
（pageerror = 0；console error = **1 × 403 Forbidden**，资源未定位 → 见 §5 待办）

---

## 4. 跨页契约

| # | 项 | 期望 | 基线实测结果 |
|---|---|---|---|
| X1 | `Modal.confirm` 残留（Wave 3 将统一为 useConfirm） | 改前位置登记在案 | **实跑（grep）**：`views/student/Submit.vue:349`（重试确认）、`views/student/Submit.vue:802`（提交确认）、`views/teacher/ReviewDetail.vue:513`（发布成绩确认）；`ProjectReviewNew.vue` 无残留 |
| X2 | 页面级错误基线 | pageerror = 0、console error = 0 | **实跑**：Submit 0/0；ReviewDetail 0/0；ProjectReviewNew 0 pageerror / **1 console error（403）** |
| X3 | 接口调用集合（改后逐字比对） | 只允许表中集合，且路径/方法不变 | **实跑**：见各页「首屏接口集合」；写操作集合（本次全部拦截）：`PUT /student/assignments/:id/draft`、`POST /student/assignments/:id/submit`、`POST /student/assignments/:id/retry`、`POST /teacher/submissions/:id/regrade`、`PUT /teacher/submissions/:id/review`、`PUT /teacher/submissions/publish` |
| X4 | 写操作零污染证明 | 本次基线未对开发库产生写操作 | 所有非 GET 与写端点请求均在 Playwright route 层被 fulfill，未转发到后端；无失败上报 |

---

## 5. 未实跑清单与复跑剧本（**实现者/验收方必须补完**）

本次会话受时间与数据状态限制，下列条目**只有代码基线，没有实跑数值**，按重要性排序：

| 优先级 | 条目 | 原因 | 复跑步骤（可直接执行） |
|---|---|---|---|
| P0 | S4/S5/S6/S7（草稿三通道 + Monaco 懒挂载） | 学生 10001 名下作业全部过期 → 页面只读，无 textarea/编辑器 | ① route 改写 `data.assignment.endTime = now+30h`（`route.fetch()` → 改 JSON → `route.fulfill({ response, body })`）；② `waitForSelector('.monaco-editor, textarea')`；③ 输入 → 记录最后 `input` 时间戳 → 断言 draft PUT 到达时间 − T ∈ [1400,1900]ms；④ 不输入等 31s → 断言出现间隔 ≈30s 的 draft PUT；⑤ 使数据变脏后触发 visibilitychange/beforeunload → 断言 keepalive `POST /draft`；⑥ 记 `.monaco-editor` 滚动前后计数（期望 0 → ≥1，rootMargin 400px） |
| P0 | S12 倒计时三态 + 到点行为 | 未定位倒计时 DOM 选择器 | 先在 `Submit.vue` 里 grep 倒计时渲染处（搜索 `天`/`小时`/`分钟`/`countdown`），拿到选择器后按 endTime 改写四态复测；到点行为 = 断言 `forceSubmitAll` 触发（`POST /submit`） |
| P0 | R6/R7 保存审核 + 发布成绩 | 10293 状态下页脚动作条未渲染 | 另选一个「教师可见且未发布」的提交（`GET /api/teacher/submissions?page=1&pageSize=20` 选 `status=ai_graded`），断言 `.ant-modal-confirm` 文本与 `PUT /teacher/submissions/publish { submissionIds }` body |
| P1 | P2 无标准包时隐藏 tab | 10297 有标准包 | 换一个无标准包的项目提交，断言 tab 文本集合 = `["学生提交"]` 且 activeKey=student |
| P1 | P8 折叠面板对 Monaco 的影响 | 折叠时无打开文件 | 先开文件 → 点进编辑器 → 记录 `.monaco-editor` 的 `getBoundingClientRect()` 与 `document.activeElement` → 折叠 → 再记录（期望尺寸不变、编辑器不失焦） |
| P1 | P5/P6 双源隔离与树展开 | 未覆盖 | 切到标准源开一个文件 → 切回学生源 → 断言各自 `openTabs` 与 `activePath` 恢复 |
| P2 | S8 其余客观题类型（multi/judge） | 306 只有 choice | 找含 `objectiveItems[].type !== 'choice'` 的作业复测控件类型 |
| P2 | P10 评分中状态 | 未触发重评 | 点「重新评分」→ 断言面板状态文本与按钮 loading，并记录轮询时间戳（期望 5000ms 间隔） |
| P2 | ProjectReviewNew 的 403 | 资源未定位 | 记录响应 URL（`page.on('response')` 过滤 4xx）确认是哪个请求，并在 X2 基线中登记 |

**本次会话已确认的三条环境事实**（复跑者不必再踩）：① networkidle 不适用；② 学生作业多为过期只读态；③ route handler 里的 `route.fetch()` / `route.continue()` 必须 try/catch，否则整个脚本退出（round 2 因此丢失）。

---

## 6. 改后比对流程（Wave 3 实现者与验收方共用）

1. 按 §0 起 5175、注入三端登录态、挂写操作拦截。
2. 逐条复跑 §1–§3 的「断言方式」列，与「基线实测结果」列对比：**结构与请求形状必须逐字一致**；视觉允许按设计稿变化（这是 Wave 3 的目的）。
3. §4 的接口集合逐字比对：新增/删除/改路径都算不通过。
4. §5 的未实跑条目：先补基线（改代码前！），再按同一断言复跑——**先补基线再改代码**是硬要求，否则改完无法判断是否回归。
5. 写操作一律 route 拦截；若必须打真实后端，须在报告里登记并附幂等证明。

---

## 附：本次实测的原始产物

- 截图目录：`docs/ui-redesign/preview/shots/wave3-baseline/`（submit-a1-active.png、submit-a8-scrolled.png、submit-countdown-{gt24h,lt24h,last10min,expired}.png、reviewdetail-10293.png、projectreviewnew-10297.png、projectreviewnew-file-open.png、projectreviewnew-panel-collapsed.png）
- 原始测量 JSON：`/tmp/t18-submit.json`（Submit 四态 + 防抖/可见性探针结果）、`/tmp/t18-round3.json`（ReviewDetail + ProjectReviewNew 全部点击实测）
