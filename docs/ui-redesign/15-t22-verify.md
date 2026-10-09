# t22 修复独立验收报告（t23）

> 验收人：verifier（独立于实现者）｜ 对象：t22 对 `student/Submit.vue` 的四项修复（V3 keepalive / V4 兜底重试 / V5 懒挂载竞态 / S3 题号键盘可达）
> worktree：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`）
> 提交：修复前 `ee4c8fa`（Wave 3 冻结）→ 修复后 `2498316`（`Submit.vue` +106/−22）
> 验收时间：2026-10-09 21:46–22:20 ｜ 依据：`13-wave3-contract.md` §1/§6 + t22 任务契约
> 方法：**独立探针复跑**（复用运行中的 :5175 + 真实后端 :3000；非 GET 全部 Playwright route 拦截，开发库零写）
> 探针：`/tmp/wave3-verify/{p-t23,p-t23b,p-t23c}.cjs`；原始数据 `/tmp/t23-verify{,-2,-3}.json`、`/tmp/wave3-verify/{t23,t23b}.log`

## 0. 结论摘要

| 维度 | 结论 |
|---|---|
| V3 beforeunload keepalive | ✅ 修复生效：有脏数据 → 每条可存小题 1 条 **keepalive PUT /draft**（fetch 探针实测 `keepalive:true`）、**0 次数据加载器 GET**、+2ms；无可存小题 → **0 请求** |
| V4 30s 兜底重试 | ✅ 修复生效：draft 全 500 → 脏标记保留（页脚「1 题未保存」）→ **30s 节拍重试**（+29265/29266/29267ms）→ 恢复 200 后清脏（「草稿已同步」） |
| V5 懒挂载竞态 | ✅ 修复生效：**零交互**下占位块注册数 0→**5**、`.sq-editor-wrap`=2（500ms）、`.monaco-editor`=2；与「先点题号再滚动」一致 |
| S3 题号键盘可达 | ✅ 修复生效：role=button / tabindex=0 / 35 个 aria-label 全部非空 / Tab 可达 / 方向键轨迹 0→1→0→1 / **Enter·Space 与点击等价（active 目标一致）** |
| 契约 §1 S1–S13 | ✅ 仅 4 处**有意变更**（S3、S5、S6b、S7-V5），其余 9 条逐值/逐字一致 |
| 接口集合与 body | ✅ `request.*` 调用集合 6→6 identical；draft/submit body 形状逐字未变 |
| 硬检查 | ✅ Submit hex=0 / `!important`=0 / `Modal.confirm`=0 / `countdown|倒计时`=0；全仓 vue hex **71**、`!important` **6**、Modal.confirm **0**（与 Wave 3 基线完全一致，无新增） |
| **其它条目回归** | **0 项** |
| 未达标 / 待 captain 决策 | 3 项（均为**既有**行为记录，非本次引入） |

**判定：通过（Pass）**，四项修复可确认落地；§6 的 3 项既有观察建议记入收口池。

---

## 1. 修复前基线来源（保证「改前 vs 改后」可比）

| 项 | 改前值 | 来源 |
|---|---|---|
| V3 | 0 PUT / 3 GET（数据加载器被同名遮蔽） | **我上一轮 t21 探针**（`/tmp/wave3-verify/submit.json`，Wave 3 冻结版实测） |
| V4 | 34s 内仅 3 次防抖尝试、无 30s 重试 | 同上（t21 S5） |
| V5 | `_sqId` 注册 0/5、零交互滚动 `.monaco-editor`=0 | 同上（t21 V5 专项，并含 HEAD A/B） |
| S3 | role/tabindex 全 null、35 个 aria-label 全空、方向键无效 | 同上（t21 S3） |
| 代码对照 | 仅 `fetch` → 被遮蔽；`onBeforeUnload` 其余结构逐字未变 | `git show ee4c8fa:…Submit.vue` 与 `2498316` diff（`window.fetch` 0→2、`loadAssignment` 0→3、`allSaved`/`ensureEditorObserver`/`activateBoxAt`/`onBoxKeydown` 新增） |

> 说明：验收不改 `client/src/**`（inScope 仅报告），故未做「把 `window.fetch` 改回裸 `fetch`」的反例回滚实验（属可选）；改前行为改由我上一轮的独立实测值与 `git show` 代码对照共同佐证。

---

## 2. 四项修复逐条独立复现

### 2.1 V3 beforeunload keepalive

| 场景 | 改前（t21 实测） | 改后（本次实测） | 判定 |
|---|---|---|---|
| 有脏数据（完整答完客观题 → 3 个可存小题） | **0 PUT / 3 GET**（`GET /api/student/assignments/306`） | **3 PUT / 0 GET**；`window.fetch` 探针记录 3 条，全部 `{method:'PUT', keepalive:true, url:/api/student/assignments/306/draft}`，body = `{questionId:352, subQuestionId:760|762|763, answer}`（与 `PUT /draft` 形状逐字相同），首条 +2ms | ✅ |
| 无可存小题（`submissions=[]` 改写 + 未作答） | 未单独实测（改前同结构；该场景无可存候选 → 探针实测为 0） | **0 PUT / 0 GET / fetch 探针 0 条**，页脚「草稿已同步」 | ✅ |
| 可存小题但无脏数据 | 3 GET（同结构） | 3 keepalive PUT（同结构，仅请求类型修正） | ✅（记录项，见 §6-①） |

> 关键回归信号：**数据加载器 GET 已彻底消失**（改后两个场景的 `GET /api/student/assignments/306` 均为 0）。

### 2.2 V4 30s 兜底重试

| 断言 | 改前 | 改后（本次实测） |
|---|---|---|
| 失败后是否保留脏 | ❌ 立即清脏（页脚回「草稿已同步」） | ✅ 页脚保持「**1 题未保存**」、`.dirty-hint` 存在 |
| 是否出现重试 | ❌ 34s 内 0 次重试 | ✅ **30s 节拍重试**：请求时序 `+2285（防抖 3 条, 500）` → `+29265/29266/29267（定时 3 条）` |
| 恢复 200 后能否清脏 | — | ✅ 新编辑触发防抖 → 全部成功后页脚回「**草稿已同步**」 |
| 防抖 vs 定时区分 | — | 防抖 = 最后一次编辑后 ~1.5s（实测 +2285ms 起）；定时 = 页面载入后 30s 节拍（+29.3s，且不受防抖影响） |

### 2.3 V5 Monaco 懒挂载竞态

| 断言 | 改前（t21） | 改后（本次） |
|---|---|---|
| 首帧占位块注册数（`_sqId`） | **0 / 5**（observer 未就绪时注册被丢弃） | **5 / 5** |
| 零交互直接滚到底：`.sq-editor-wrap` | 0（≤6s 窗口内不出现） | **2**（500ms 内） |
| 零交互直接滚到底：`.monaco-editor` | **0**（≥45s 窗口仍 0；点题号后才 2） | **2**（本次 4.5s 命中；Monaco 已热，冷启动 ~27s 亦在 45s 窗口内） |
| 与「先点题号再滚动」一致性 | ❌ 不一致（前者 0、后者 2） | ✅ 一致 |

### 2.4 S3 题号方块键盘可达

| 断言 | 改前 | 改后（本次） |
|---|---|---|
| role / tabindex | 全 null | **button / 0**（35 个） |
| aria-label | 35 个全空 | **35/35 非空**（如「第 1 小题 第 1 问，已作答」） |
| Tab 可达 | false | **true**（Tab 后 activeElement 命中 `.n-box`） |
| 方向键轨迹 | active 不变（focus=-1） | focus0 →**ArrowRight**→ active1/focus1 →**ArrowLeft**→ active0/focus0 →**ArrowDown**→ active1/focus1 |
| Enter / Space | 无位移（Δ0） | ✅ **与点击等价**：点第 31 个方块 active=30；聚焦第 1 个按 Enter → active=0；聚焦第 31 个按 Space → **active=30、focus=30、位移 Δ5286** |
| 鼠标点击行为 | — | ✅ 不变（点第 31 个方块：滚动 Δ5071、active=30、窗口内 0 请求） |

---

## 3. 契约 §1 S1–S13 复跑表（仅 4 处有意变更）

| # | 项 | 本次实测 | 与基线 | 判定 |
|---|---|---|---|---|
| S1 | 结构计数 | 6 / 6 / 6 / 35 / radio 100 / checkbox 0 /「共 6 题，6 题未提交」/「草稿已同步」 | 逐值相同 | ✅ 一致 |
| S2 | 点方块切题 | Δ5071（基线 Δ5438/Δ5594）/ active=30 / 0 请求 | 位移随内容高度浮动，active 与「不落盘」不变 | ✅ 一致 |
| S3 | 键盘切题 | 见 §2.4（完整可用） | 改前不可用 | ⚠️ **有意变更（修复目标）** |
| S4 | 1500ms 防抖 + body | 3 条，+1580/1581/1582；body `{questionId,subQuestionId,answer}` | 逐字相同 | ✅ 一致 |
| S5 | 30s 兜底 | 失败后保留脏 + 30s 重试（3+3 条） | 改前失败即清脏、无重试 | ⚠️ **有意变更（V4 修复）** |
| S6 | visibilitychange | 3 条 PUT，+45ms | 基线 +3ms（均 ≤200ms 级） | ✅ 一致 |
| S6b | beforeunload | 3 keepalive PUT / 0 GET（有脏）；0/0（无可存） | 改前 0 PUT / 3 GET | ⚠️ **有意变更（V3 修复）** |
| S7 | Monaco 懒挂载 | 零交互 0→2；点击路径 0→2 | 改前零交互永不挂载 | ⚠️ **有意变更（V5 修复）** |
| S8 | 四类客观题控件 | radio 34 / checkbox 20 / text 7 / oi-card 30 | 同值 | ✅ 一致 |
| S9 | 提交校验弹窗 | 文案与按钮逐字相同（「部分题目未作答…[返回继续作答][仍要提交]」） | 逐字相同 | ✅ 一致 |
| S10 | 提交后只读 | disabled 0→102；3× POST /submit（body 形状相同） | 逐字相同 | ✅ 一致 |
| S11 | 轮询节拍（负面） | **独立 34s 窗口 0 次刷新 GET** | 与基线一致 | ✅ 一致 |
| S12 | 无倒计时 UI | 元素 0、文案 0 | 一致 | ✅ 一致 |
| S13 | 参考答案可见条件 | published 2 / 可写 0 | 一致 | ✅ 一致 |

> 有意变更计数核对：**4 处**（S3、S5、S6b、S7-V5），与任务契约口径一致；其余条目无回归。

---

## 4. 接口集合与请求 body 逐字比对

| 项 | 结果 |
|---|---|
| `request.*` 调用集合（`ee4c8fa` → 现在） | **6 → 6，无新增/无删除/无改路径**（脚本比对 `/tmp/wave3-verify/diff-api-t23.cjs`） |
| 读集合 | `GET /api/student/assignments/306`、`GET /api/student/profile`（未变） |
| 写集合 | `PUT /api/student/assignments/306/draft`、`POST /api/student/assignments/306/submit`（+ practice 的 `POST /retry`）；未变 |
| draft body | `{questionId, subQuestionId, answer}`；客观题 `answer` 为 `[{key,answer}…]` JSON 串，编程题为源码文本 —— 与基线逐字相同（本次 6 条实测样本一致） |
| beforeunload body | 与 `PUT /draft` **完全同形**（同一构造函数产物），仅传输方式改为 `keepalive:true` |
| submit body | `{questionId, subQuestionId, answer}` —— 3 条实测样本形状不变 |
| 轮询 | `setInterval(pollStatus,2000)` + `if(!anyGrading) stopPolling()` 未改（S11=0 佐证） |

---

## 5. 硬检查

| 指标 | Wave 3 冻结基线 | 本次实测 | 结论 |
|---|---|---|---|
| `Submit.vue` hex | 0 | **0** | ✅ |
| `Submit.vue` `!important` | 0 | **0** | ✅ |
| `Submit.vue` `Modal.confirm` | 0 | **0** | ✅ |
| `Submit.vue` `countdown\|倒计时` | 0 | **0** | ✅ |
| `Submit.vue` `var(--` 引用 | 115 | 115 | ✅ 未减少 |
| 全仓 `*.vue` hex | 71 | **71** | ✅ 无新增 |
| 全仓 `*.vue` `!important` | 6 | **6** | ✅ 无新增 |
| 全仓 views `Modal.confirm` | 0 | **0** | ✅ |
| `npm run build` | — | **exit 0** | ✅ |

---

## 6. 未达标项 / 需要 captain 决策（均为既有行为，非本次引入）

| # | 项 | severity | 说明与建议 |
|---|---|---|---|
| ① | `onBeforeUnload` **无脏标记判断**：只要存在「可存小题」（客观题已答 / 编程题有内容）就会重发全部 keepalive PUT，即使没有未保存改动 | low（既有） | 改前同结构（`git show ee4c8fa` 逐行一致），只是发的是被遮蔽的 GET；本次修复未扩大该行为。影响：离开页面时可能产生 1–N 条幂等重复 PUT。建议收口池登记：加 `if (dirtySet.size === 0) return;`（1 行）或仅在「有改动」时发送 |
| ② | 首屏从 DB 载入答案会触发一次冗余保存（deep watch → `markDirty()` → 1500ms 后 PUT 相同内容） | low（既有） | 实测：加载后约 1.5s 出现 3 条 `PUT /draft`；观察项，非本次引入（watch 在 `ee4c8fa` 已存在）。建议收口池登记：载入阶段挂起 watcher 或比对后再标脏 |
| ③ | V5 的 Monaco 挂载耗时依赖冷/热启动（冷 ~27s、热 ~4.5s） | info | 修复本身无问题；仅提示后续自动化断言需按 ≥45s 窗口或先预热。可选反例（把 `window.fetch` 改回裸 `fetch`）因 inScope 限制未做，已用 `git show` 逐行对照 + 我上一轮改前实测值替代 |

---

## 7. 证据索引

| 文件 | 内容 |
|---|---|
| `/tmp/wave3-verify/p-t23.cjs` / `t23.log` / `/tmp/t23-verify.json` | 主探针：V3-a/V3-b、V4、V5+（并行窗口）、S1–S13 全量 |
| `/tmp/wave3-verify/p-t23b.cjs` / `t23b.log` / `/tmp/t23-verify2.json` | 复核：S11 独立 34s 窗口、V3-a 计数口径、首屏自动脏观察项 |
| `/tmp/wave3-verify/p-t23c.cjs` / `/tmp/t23-verify3.json` | 复核：S3 Enter/Space 远距离等价、V3-b 严格口径、可存但无脏记录项 |
| `/tmp/wave3-verify/diff-api-t23.cjs` | 接口集合与修复相关 token 的 `ee4c8fa → 现版` 静态对照 |
| `/tmp/wave3-verify/submit.json`（t21 产出） | 改前基线值来源（V3/V4/V5/S3） |
| `/tmp/wave3-verify/build.log` | `npm run build`（exit 0） |

> 清理：本次验收未改动任何 `client/src/**` 文件（`git status --porcelain` 仅新增报告与无源码改动）；:5175 dev server 为 t19/t20/t22 期间启动，未关闭以免影响其它会话。

---

**签名**：verifier ｜ 本报告为独立复跑结论，未采信实现者自测作为通过依据。
