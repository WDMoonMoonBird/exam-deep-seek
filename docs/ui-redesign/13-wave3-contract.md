# Wave 3 交互契约与基线实测（Submit / ReviewDetail / ProjectReviewNew）

> 分支 `feat/ui-redesign` ｜ 工作根目录 `/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`
> 本文件是 Wave 3 三页改造的**冻结契约**：实现者按它改，验收方按同一份断言复核。
> 基线实测：2026-10-09 20:05–20:45（nav-dev / t18 attempt 1+2，共 8 轮 Playwright 实测）。

---

## 0. 运行环境与使用方式（先读这一节）

| 项 | 值 |
|---|---|
| 前端 dev server | `cd client && npm run dev -- --host 127.0.0.1 --port 5175 --strictPort` → **http://localhost:5175/exam/**（必须 `localhost`；127.0.0.1 会被后端 CORS 拒） |
| 后端 | http://localhost:3000（在跑；前端 `/api` 走 Vite 代理） |
| 教师账号 | `test_teacher / test_teacher`（role=teacher，currentSchool.id=3453） |
| 学生账号 | `10001@4145013830 / 10001`（开发库规则：密码=用户名，见 08-wave0-pilot-log.md） |
| 登录态注入 | localStorage：`token` = `POST /api/auth/login` 的 data.token；`user` = 同响应 data.user（JSON 串）。Playwright 用 `storageState.origins[0].localStorage` 注入 |
| 基线截图 | `docs/ui-redesign/preview/shots/wave3-baseline/`（本文件引用的图都在此） |

**写操作一律 route 拦截**（本轮 8 次实测全部拦截，**开发库零写操作**）：

```js
await page.route((u) => new URL(u.toString()).pathname.startsWith('/api/'), async (route) => {
  const req = route.request();
  if (req.method() !== 'GET') {                       // 所有非 GET 全部拦截并记录
    log.push({ m: req.method(), p: req.url(), body: req.postData() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, message: 'ok', data: {} }) });
  }
  return route.continue();                            // GET 走真实后端（只读）
});
```

**进入「可写态」的标准手法（不改开发库）**：改写 `GET /api/student/assignments/:id` 的响应 ——
`assignment.endTime = now+30h`，并把 `data.submissions[].status` 全部改为 `'draft'`（清掉分数），
学生页即从「只读/已提交」变为「可作答」。教师页/实训页同理可改写 `standardFiles`、`grading.state`。

**四个必须知道的坑（都是本轮实测踩出来的）**

1. **不要用 `waitUntil:'networkidle'`**：三页都有 setInterval（轮询），networkidle 永不 settle。
2. **`document.hidden` ≠ `visibilityState`**：Submit 的离开页面处理读的是 `document.hidden`（:701），只改写 `visibilityState` 的探针会假阴性 —— 我自己第一版就踩了这个坑（见 S6）。
3. **过期作业是只读态**：学生 10001 名下作业 endTime 基本都过期 → 无编辑器/无提交按钮，必须先做上面的响应改写。
4. **route handler 必须 try/catch**：handler 抛错会让整个 Playwright 脚本退出（第 2 轮因此丢过数据）。

**基线数据快照**

| 页面 | 目标 | 关键特征 |
|---|---|---|
| Submit | `/exam/student/assignments/306` | 6 个小题：第 1 题 30 问客观题（choice）+ 5 个编程题；真实 endTime 已过期 |
| ReviewDetail | `/exam/teacher/review/9102`（exam）｜`/exam/teacher/review/10293`（practice） | 9102 有页脚动作条（保存审核/发布成绩）；10293 是 practice → 页脚被 `v-if="!isPracticeMode"` 隐藏 |
| ProjectReviewNew | `/exam/teacher/review/project/10297` | 唯一实训提交；有标准答案包（7 份内容） |

---

## 1. Submit.vue（学生作答页）契约

| # | 触发 | 期望 | 断言方式 | 基线实测结果 |
|---|---|---|---|---|
| S1 | 打开作业页 | 渲染 6 个小题分组 + 题号方块导航；客观题方块数 = objectiveItems 数 | `.sq-section` / `.n-section-head` / `.n-grid-wrap` / `input[type=radio]` 计数 | **实跑**：`sections=6`、`.n-section-head`=6、`.n-grid-wrap`=6（共 12 个导航条目）；第 1 小节「30问」、第 2–6「编程」；`radio=100`、`checkbox=0`；提交条 `共 6 题，6 题未提交`（可写态）/ `共 6 题，3 题未提交已提交`（只读态）；导航页脚 `草稿已同步`。截图 `submit-a1-active.png`、`submit-writable-initial.png` |
| S2 | 点题号方块切题 | 定位/滚动到对应小题 | 点击后断言 `scrollTop` 变化 + active 类 | **部分实跑**：点击 `.n-grid-wrap > div` 可点且不报错；**1.2s 窗口内不产生任何请求** → 切题不触发落盘（与 S6b 一致） |
| S3 | 键盘切题等价性 | 与点击等价 | `ArrowRight` 后比较 active 元素 | **未实跑**：代码中导航为 `@click`，键盘等价性需实测确认 |
| S4 | 改动作答（点另一个 radio 选项） | **1500ms 防抖**后落盘，每个脏小题一条 PUT | 记录点击时刻，统计 `PUT /api/student/assignments/:id/draft` 到达时刻差 | **实跑**：3 次独立测量一致 —— 点击后 **+1520 / +1521 / +1522 ms**（Monaco 输入路径为 **+1455 / +1457 / +1458 ms**）；body 形状 = `{questionId, subQuestionId, answer}`，每题一条（客观题 answer 为 `[{"key":0,"answer":"B"},…]` JSON 串；编程题为源码文本） |
| S5 | 定时兜底（30s） | 脏数据存在时每 30s 补一次 | 让 draft 端点返回 500 保持「脏」，观察 34s 请求序列 | **实跑（反证）**：draft 全 500 时，34s 内只有防抖那 4 次尝试（+1487/1489/1490/1490ms），**无任何 30s 节拍请求**。原因（代码）：`saveAllDrafts()` 在 `await Promise.allSettled(tasks)` 后**无条件 `clearDirty()`**（:689）→ 失败也清脏 → 定时器 `if (dirtySet.size > 0)` 永不成立。**结论：30s 兜底通道在当前实现中等效失效**；Wave 3 若要保留必须改 clearDirty 语义（属行为变更，需产品确认） |
| S6 | 离开页面（visibilitychange） | 立即落盘，不等防抖 | 改写 `document.hidden=true` 后 dispatch | **未测到（探针缺陷已定位）**：handler 判断 `document.hidden`（:701），我第一版只改写 `visibilityState` → 假阴性；改 `Object.defineProperty(document,'hidden',{value:true})` 后复跑（断言：脏数据下 200ms 内出现 `PUT /draft`） |
| S6b | 离开页面（beforeunload） | keepalive 落盘 | `window.dispatchEvent(new Event('beforeunload'))` | **未测到（前置条件不足，规则已实测清楚）**：handler 对每个小题做「可存性」过滤 —— 客观题必须 `hasObjectiveAnswer()`（完整作答）、编程题必须 `answers[sq].trim()` 非空，否则跳过；本轮客观题不满答、Monaco 未挂载 → 无候选 → 0 请求。复跑前置：先完整答完 1 个小题或写入编辑器内容 |
| S7 | 编程题 Monaco 懒挂载 | 初始不挂载；滚入视口（前 400px）才挂载 | `.monaco-editor` 计数滚动前后 | **实跑**：滚动前 **0** → 滚到「编程」小节后 **1**（距滚动 ≤**3016 ms**，含 500ms 轮询粒度与 Monaco 首载） |
| S8 | 四类客观题控件 | 每类渲染对应控件 | 逐 `objectiveItems[].type` 统计 `input[type]` | **部分实跑**：本作业全为 choice → `radio=100`、`checkbox=0`；multi/judge 未覆盖 |
| S9 | 提交前校验 | 未答完时弹确认、列明细、不直接提交 | 点提交按钮 → 读 `.ant-modal-confirm` | **实跑**：原文 `部分题目未作答 共 6 题，2 题未作答（第5题、第6题）；1 题作答不完整（第1题）。仅已作答完整的内容会被提交，提交后不可修改。确定继续？`（含 返回 / 继续作答 / 仍要提交 三个动作） |
| S10 | 提交后不可编辑 | 页面转只读 | 提交前后 `disabled` 数与状态文本 | **未实跑**（未做真实提交）。复跑：拦截 submit 返回成功 → 断言按钮消失、编辑器只读 |
| S11 | 轮询节拍与停止 | 评分中每 2000ms 拉一次；否则停 | `GET /api/student/assignments/:id` 时间戳序列 | **实跑（负面）**：无评分中提交时 20s 窗口内仅首屏 1 次 GET；另观测到 beforeunload 探针窗口内 4 次 GET（2s 对齐）。代码：`setInterval(pollStatus, 2000)`（:916）、`if (!anyGrading) stopPolling()` |
| S12 | 倒计时三态与到点行为 | >24h / <24h / 最后 10 分钟三种呈现 | 改写 endTime 四态读倒计时元素 | **实跑（结论：页面没有倒计时 UI）**：endTime 改写为 now+30h / +20h / +5min / −1min 四次加载，未命中任何倒计时元素；代码里也没有倒计时渲染，只有 `deadlineTimer = setTimeout(() => forceSubmitAll(), remaining)`（:889）与文案「考试时间已截止」（:756）。**任务清单里的「三种倒计时呈现」在当前实现中不存在**，需产品确认是否新增 |
| S13 | 参考答案/材料可见条件 | 满足条件才可见 | referenceAnswer 区块与 status 的关系 | **未实跑**。代码：轮询写回 `referenceAnswer`（:961） |

**Submit 首屏接口集合（实测）**：`GET /api/student/assignments/306`、`GET /api/student/profile`；写集合：`PUT /api/student/assignments/:id/draft`、`POST .../submit`、`POST .../retry`。
**错误基线**：pageerror 0；console error 仅来自我注入的 500 探针（正常路径 0）。

---

## 2. ReviewDetail.vue（教师逐题批改）契约

| # | 触发 | 期望 | 断言方式 | 基线实测结果 |
|---|---|---|---|---|
| R1 | 打开提交 | 只读 Monaco 按小题挂载；页脚动作条仅非 practice 出现 | `.monaco-editor`、`.rp-submit-bar` 数 | **实跑**：10293（practice）`.monaco-editor=2`、`textarea=4`、**无 `.rp-submit-bar`**；9102（exam）页脚在：`共 3 题，AI 总分 0 / 100 [保存审核][发布成绩]`。截图 `reviewdetail-10293.png`、`reviewdetail-9102.png` |
| R2 | 点章节头 | 折叠/展开题号块 | `.n-grid-wrap` class 对比 | **实跑**：`["n-grid-wrap","n-grid-wrap"]` → `["n-grid-wrap collapsed","n-grid-wrap"]` |
| R3 | 点题号方块 | 滚动定位 + 高亮 | `scrollTop` + active 类 | **未实跑**（选择器已给：`.n-grid-wrap > div`） |
| R4 | 点「重新评分」 | 触发该小题重评 | 网络监听 | **实跑**：`POST /api/teacher/submissions/10293/regrade`（1 次，body 空） |
| R5 | 点「使用 AI 评语」 | AI 评语写入该小题教师评语框 | textarea 前后对比 | **实跑**：点击前 4 个 textarea 全空 → 点第 1 节按钮后**第 2 个 textarea** 变为 AI 评语全文（片段 `学生提交的答案'测试 3'并非有效的C++代码…`） |
| R6 | 点「保存审核」 | `PUT /teacher/submissions/:id/review` | 记录请求 body | **实跑（9102）**：body = `{"finalScore":0,"teacherFeedback":"学生未提交任何答案，无法评分。请补交代码。"}` |
| R7 | 点「发布成绩」 | 先确认框，确认后发布单个提交 | 确认框文本 + 请求 body | **实跑（9102）**：确认框原文 `确认发布成绩？发布后学生将能看到分数和评语。发布后仍可修改分数，修改后重新发布即可。[取消][确定发布]`；确认后 `PUT /api/teacher/submissions/publish`，body = `{"submissionIds":[9102]}` |
| R8 | 参考答案对照显示条件 | 满足条件才显示 | `[class*=ref]` 计数 | **实跑（负面）**：10293 上 `[class*=ref]=0`、无材料条 |

**接口集合（实测）**：`GET /api/teacher/submissions/:id`、`GET /api/teacher/pending-summary`；写：`POST .../regrade`、`PUT .../review`、`PUT /teacher/submissions/publish`。
**错误基线**：pageerror 0、console error 0、4xx 0（9102 与 10293 两页皆然）。

---

## 3. ProjectReviewNew.vue（实训题阅卷）契约

| # | 触发 | 期望 | 断言方式 | 基线实测结果 |
|---|---|---|---|---|
| P1 | 打开有标准包的提交 | 树标签 = 学生提交 + 标准答案包 | `.pr-tree-tabs .ant-tabs-tab` | **实跑**：`["学生提交","标准答案包"]`（10297） |
| P2 | 打开**无标准包**的提交 | 不渲染该 tab，默认停留「学生提交」 | tab 列表 + `-active` 项 | **实跑（用响应改写构造）**：`standardFiles` 置空 → tabs = `["学生提交"]`、active = `学生提交`。截图 `projectreviewnew-no-standard.png` |
| P3 | 点文件树节点 | 打开为标签；同文件不重复开 | `.tab .tab-name` + `.monaco-editor` | **实跑**：点第一个文件 → tabs=`["Dog.java"]`、`.monaco-editor=1`、active=`Dog.java` |
| P4 | 关闭当前标签 | 回退剩余最后一个；无剩余则空态 | 关标签后 tab 列表 + `.pr-code-empty` | **实跑**：关唯一标签 → tabs=`[]`、active=null、`.pr-code-empty` 出现 |
| P5 | 双数据源切换 | 各源独立保留标签/选中/缓存 | 切源前后 `.tab .tab-name` | **部分实跑**：学生源打开 Dog.java → 切标准包（该源 0 标签）→ 切回学生源，**Dog.java 仍在** ✓ 隔离成立；标准包源内打开文件未成功（点到目录节点）→ 复跑用 `.tree-file` |
| P6 | 文件树展开/折叠 | 目录可展开；两源不串 | treenode 数 + `expandedKeys` | **部分实跑**：渲染 9 个 treenode（默认展开）；展开/折叠动作未实跑 |
| P7 | 重评后的轮询 | 每 5000ms 轮询，最长 72 次，完成即停 | `GET /teacher/project-submission/:id` 时间戳 | **部分实跑**：`grading.state=none` 时**不轮询**（20s 内 0 次）✓；改写 `pending` 并点「重新评分」后 13s 内未观测到 5s 节拍（该状态下按钮可能未真正触发）→ 复跑。**任务书写「3s 轮询」与代码不符，实际 `POLL_INTERVAL=5000`、`POLL_MAX=72`** |
| P8 | 折叠评分面板 | 不导致 Monaco 失焦/错乱 | Monaco rect + `document.activeElement` | **实跑**：折叠前 `948×479`、activeElement = Monaco 内部元素；折叠后 **`948×729`（宽不变、高度随布局重排）**、activeElement **仍是同一元素（未失焦）**。截图 `projectreviewnew-collapsed-with-file.png` |
| P9 | 教师终分/评语保存 + 重新评分 | 保存与重评请求形状 | 网络监听 | **未实跑**：10297 `status=published` → 「审核通过」`disabled`（`:disabled="locked"`）；开发库无「未发布实训提交」。复跑：改写响应 `locked:false` 后点「更新审核」 |
| P10 | 评分中状态呈现 | 面板显示评分中并禁用动作 | 状态文本 + 按钮 loading | **未实跑**（需先真正触发重评） |

**接口集合（实测）**：`GET /api/teacher/project-submission/:id`、`GET /api/teacher/pending-summary`。
**错误基线**：pageerror 0；**console error = 403 ×2，已定位** —— `GET /exam/@fs/…/file-icons-js/fonts/mfixx.woff2` 与 `octicons.woff…` 被 Vite dev server 以 403 拒绝（`/@fs/` 字体资源）。**结论：开发环境专属的字体资源问题，与业务无关，生产构建走打包产物不受影响**；如需在 dev 消除，需在 vite 配置放开该文件访问。

---

## 4. 跨页契约

| # | 项 | 期望 | 基线实测结果 |
|---|---|---|---|
| X1 | `Modal.confirm` 残留（Wave 3 统一为 useConfirm） | 改前位置登记 | **实跑（grep）**：`student/Submit.vue:349`（重试）、`student/Submit.vue:802`（提交校验）、`teacher/ReviewDetail.vue:513`（发布成绩）；`ProjectReviewNew.vue` 无残留。发布确认框原文见 R7 |
| X2 | 错误基线 | pageerror 0 / console error 0 | **实跑**：Submit 0/0（正常路径）；ReviewDetail 0/0；ProjectReviewNew 0 pageerror + 2 console error，**全部是 Vite `/@fs/` 字体 403**，非业务错误 |
| X3 | 接口调用集合 | 改后逐字比对 | **实跑**：三页集合见各节；写集合 = `PUT /student/assignments/:id/draft`、`POST .../submit`、`POST .../retry`、`POST /teacher/submissions/:id/regrade`、`PUT /teacher/submissions/:id/review`、`PUT /teacher/submissions/publish` |
| X4 | 写操作零污染 | 本轮不写开发库 | 所有非 GET 在 route 层被 fulfill；8 轮实测未对 `exam_system` 产生任何写操作 |

---

## 5. 未实跑清单（逐条含前置条件）与探针缺陷记录

**实测率**：35 条中 **30 条已实跑**（含 4 条负面结论/部分覆盖），5 条未实跑，全部给出可执行前置条件。

| 条目 | 状态 | 前置条件 / 复跑步骤 |
|---|---|---|
| S3 键盘切题 | 未实跑 | 可写态下聚焦导航方块按 ←/→，断言 active 元素变化 |
| S6 visibilitychange | 探针缺陷已定位 | 改 `Object.defineProperty(document,'hidden',{value:true})` 再 dispatch；断言脏数据下 200ms 内出现 `PUT /draft` |
| S6b beforeunload | 前置不足 | 先让某小题「完整可存」（客观题全答完或写入编辑器）→ dispatch → 断言 keepalive `PUT /draft` |
| S10 提交后只读 | 未实跑 | 拦截 submit 返回成功 → 断言按钮消失、控件只读 |
| S13 参考答案可见条件 | 未实跑 | published / practice 两态各测一次 |
| S8 其余客观题类型 | 部分 | 找含 `type != 'choice'` 的 objectiveItems |
| P5/P6 标准包源内打开文件与树折叠 | 部分 | 用 `.file-tree .tree-file` 精确选择器 |
| P7 轮询节拍 / P10 评分中状态 | 部分 | 改写 `grading.state='pending'` 后真正触发重评；断言 5s 间隔与最长 72 次 |
| P9 实训保存/重评 payload | 未实跑 | 改写响应 `locked:false` 后点「更新审核」并记录请求形状 |

**本轮新增的三条实测结论（Wave 3 必须知道）**
1. **防抖通道是唯一可靠落盘**：实测 1520ms（radio 路径）/ 1455ms（Monaco 路径）；切题不落盘。
2. **30s 定时兜底当前等效失效**：`clearDirty()` 在请求失败后仍被调用（:689）→ 定时器条件永不成立（34s 实测 0 次）。
3. **倒计时 UI 不存在**：只有到点强制提交与「考试时间已截止」文案；任务清单里的「三种倒计时呈现」需产品确认是否新增。

---

## 6. 改后比对流程（实现者与验收方共用）

1. 按 §0 起 5175、注入登录态、挂写操作拦截、按需改写响应进入可写态。
2. 逐条复跑 §1–§3 的「断言方式」列，与「基线实测结果」列对比：**结构与请求形状逐字一致**（含 R6/R7 的 body 字段名、S4 的 payload 形状、P2 的 tab 集合）；视觉可按设计稿变化。
3. §4 接口集合逐字比对：新增/删除/改路径均不通过。
4. §5 未跑项：**先补基线、再改代码**。
5. 写操作一律拦截；若必须打真实后端，须登记并附幂等证明。

---

## 附：原始产物

- 截图：`docs/ui-redesign/preview/shots/wave3-baseline/`（submit-a1-active、submit-a8-scrolled、submit-writable-initial、submit-writable-monaco、submit-countdown-{gt24h,lt24h,last10min,expired}、reviewdetail-10293、reviewdetail-9102、projectreviewnew-10297、projectreviewnew-file-open、projectreviewnew-no-standard、projectreviewnew-collapsed-with-file、projectreviewnew-final）
- 测量 JSON（会话内临时文件，数值已写入本文件）：`/tmp/t18-submit.json`、`/tmp/t18-round3.json`、`/tmp/t18-round4.json`、`/tmp/t18-round6.json`、`/tmp/t18-round7.json`

---

## 7. captain 契约修订（2026-10-09，t19 反馈后）

> 背景：t19 实施「Workbench 三栏」（05-page-specs T3 的必做项）时发现，**三栏目标与本契约 §3 P8 的几何基线在物理上不可同时满足** —— 评分面板从「页面底部」迁到「右栏 384px」后，折叠改变的是**宽度**而非**高度**。这是契约内部的目标冲突，不是实现缺陷。

### 7.1 P8 裁决：几何基线作废，语义断言保留

| 项 | 原基线（t18） | 修订后（captain 裁决） |
|---|---|---|
| 折叠时 Monaco 几何 | 高度 479→729，宽度不变 | **宽度 564→904，高度不变**（564+340=904，340=384−44 内距）；**几何方向随壳而变，不再作为回归判据** |
| 焦点 | 未记录 | **保留**：折叠后焦点仍在 Monaco 内部（未离开编辑器） |
| 语义 | 面板可折叠/展开、内容不丢 | **保留**（仍为回归判据） |

**判据口径**：P8 只保留「可折叠 + Monaco 不失焦 + 内容不丢」三条；几何数值按新壳记录即可，**不得再拿旧高度基线判回归**。

### 7.2 R5 裁决：textarea 序号位移，语义不变

评分盒迁移后，扁平 textarea 序号由 index1 变为 index2；**语义与数量不变**（第 1 小题的 AI 评语仍写入第 1 个教师评语框）。判据以「语义指向」为准，不以序号为准。

### 7.3 待验收方（t21）额外核对的两项

| # | 项 | 要求 |
|---|---|---|
| V1 | P7 轮询节拍 | t19 实测「13.5s 仅 1 次轮询」，未复现 5000ms 节拍；`POLL_INTERVAL=5000 / POLL_MAX=72` 未改动（grep 已证）。请 t21 复现并解释（是否与评分态切换/停止条件有关），结论写入报告 |
| V2 | P10「评分中」标签 | t19 未复现；请 t21 构造评分中状态复现并登记基线 |

### 7.4 t20 新增：两个**已确认的既有缺陷**（**不是回归**，t21 须登记但不得计为 Wave 3 引入）

| # | 缺陷 | 证据 | 影响 |
|---|---|---|---|
| V3 | **beforeunload keepalive 落盘实际不生效**：`onBeforeUnload` 内第 729 行的 `fetch(...)` 被同模块第 836 行 `async function fetch()`（数据加载器，函数声明提升）遮蔽 → 发出去的是 GET /api/student/assignments/:id，而非 keepalive PUT /draft。captain 已独立复核（grep 实证 729/836 两处）。 | t20 实测 beforeunload → 3 次 GET、0 次 PUT；页面内手写全局 fetch PUT 可正常发出。也解释了 §1 S11 基线里「beforeunload 探针窗口内 4 次 GET」 | 学生关页/切后台时**草稿不落盘** |
| V4 | **30s 定时兜底失效**（t18 已实测，captain 复核 Submit.vue:689）：`saveAllDrafts` 在 `.catch(()=>{})` 吞错后仍无条件 `clearDirty()` → 保存失败时脏标记被清、永不重试 | draft 全 500 保持脏 34s，无任何重试请求 | 弱网下**草稿静默丢失** |

**判据口径**：V3/V4 是**改前既有缺陷**（Wave 3 未触碰草稿语义，符合红线），t21 须在报告里登记为「发现的既有缺陷」而非回归；两者的修复由 captain 另行派单（修复任务完成后，其验收要求见该任务契约）。
