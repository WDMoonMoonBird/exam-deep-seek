# Wave 0 + 单页试点 · 实施记录

> 分支：`feat/ui-redesign`（已 rebase 到 `master` = `152ec99`）｜工作区：`Exam-DeepSeek-ui`
> 范围：**Wave 0 基础设施 + 教师端「作业管理」单页试点**（其余页面一律未动）
> 验收方式：构建通过 + **在真实应用里跑起来截图**（非静态稿）

---

## 1. 本轮改了什么（文件清单）

| 文件 | 性质 | 说明 |
|---|---|---|
| `client/src/styles/tokens.css` | **新增**（418 行） | 设计令牌运行时副本（三层：primitive → semantic → component；含浅/深色与两档密度）。设计说明见 `02-design-tokens.md` |
| `client/src/styles/antd-theme.js` | **新增** | antd 主题桥：主题值从 CSS 变量读回，**取值与改造前逐项一致** |
| `client/src/styles/overrides.css` | **新增** | 全局覆盖层，只放必须作用于 teleport 元素（Modal/Drawer）的规则，**禁止 `!important`** |
| `client/src/main.js` | 改 3 行 | 引入顺序：`style.css` → `tokens.css` → `overrides.css` |
| `client/src/App.vue` | 改 1 块 | 删掉硬编码 theme 对象，改用 `createAntdTheme()` |
| `client/src/domain/format.js` | 加 2 个函数 | `deadlineInfo()`（截止语义 + 色调）、`timeStatus()`（时间状态），供所有列表页复用 |
| `client/src/views/teacher/Assignments.vue` | **重写呈现层** | 业务逻辑（3 步向导、Q9 软警告、练习模式确认、锁定）**逐字保留**；新增 KPI、服务端筛选、真实提交进度、状态语义、空态、分页 |

**净效果**：新增 3 个基础设施文件；改造 1 个页面；**其余 25 个页面零改动**。

---

## 2. 关键决策与理由

1. **Wave 0 保持「取值不变」**：`antd-theme.js` 里 `fontSize: 15`、卡片/弹窗圆角 `18`、标签胶囊 `9999` 都原样保留，只把「硬编码」换成「读令牌 + 同值兜底」。
   → 理由：一次改动同时换尺度和换页面，出了问题无法归因。切到新尺度（正文 14px / 卡片 12px / 标签 6px）在文件里用 `WAVE1` 标注，属于下一次显式动作，需要逐页截图评审。
2. **旧变量不做别名映射**：`--blue/--ink/--canvas/--hairline`（94 处引用）原值不动。
   → 理由：它们的值与新语义令牌并不相同（如 `--ink #1d1d1f` vs `--text-primary #141922`），一旦做别名，等于在 94 个位置同时改了颜色，属于「偷偷全站改版」。Wave 1 逐页替换后再删。
3. **试点页直接用 `a-table`，不复用 `DataTable` 组件**：`DataTable` 是 13 页共用的老容器，内部有 `#fafafa` 分页栏、`centerContent` 表头居中、4 处 `!important`，与目标视觉冲突；改它等于同时改 13 页。
   → Wave 1 会基于本页抽出 `ListPage`，再把另外 12 页迁过来。
4. **把该页的非 scoped `<style>` 迁到 `overrides.css`**：`.assign-modal` 作用于 teleport 到 body 的弹窗，scoped 够不到，只能放全局层。
   → 顺手消掉了审计发现的「5 处非 scoped 全局样式」中的 1 处。
5. **KPI 只用真实数据**：作业总数（列表 total）、待审核提交与 AI 评分中（Batch1 `pending-summary`）。
   → 设计稿里的「平均分 / ↑2.1 环比 / 覆盖 N 名学生」属于示意数据，**本轮一个都没做**（见 §5 后端待办）。

---

## 3. 验证证据

| 项 | 结果 |
|---|---|
| 构建 | `npm run build` ✅ 29.8s 通过，无报错（`dist/` 产物正常） |
| 真实运行 | 从本 worktree 起 vite dev（:5174），用真实后端（:3000，master 代码）+ 真实数据库数据渲染 |
| 页面错误 | Playwright 捕获 `pageerror` = **none** |
| Batch1 字段实测 | `GET /teacher/assignments` 返回 `submissionCount/expectedCount/pendingReviewCount/latestSubmittedAt` ✅；`GET /teacher/pending-summary` 返回 `{pendingReview:1123, aiPending:0, abnormal:0}` ✅ |
| 截图 | `preview/shots/wave0-assignments-new.png`（新）、`wave0-assignments-old.png`（旧，同数据同账号对比） |

**如何自己验收**（两条命令，不需要我）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run dev
# 打开 http://localhost:5174/exam/ ，用你自己的教师账号登录后进入「作业管理」
```
> 5173 是另一个 dev server（主工作区，旧 UI）；5174 是本 worktree（新 UI），可同时打开对比。

---

## 3.1 本地联调须知（踩坑记录）

访问新 UI 必须用 **`http://localhost:5174/exam/`**，不要用 `http://127.0.0.1:5174`。两个坑：

| # | 现象 | 原因 | 处置 |
|---|---|---|---|
| 1 | 页面一直转圈 / 打不开 | vite dev 默认按 `localhost` 解析并**只绑定 IPv6 `[::1]`**；浏览器若先走 IPv4 `127.0.0.1` 就连不上 | 起 dev server 时显式绑 IPv4：`npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`（端口必须固定，否则会与主工作区的 5173 实例串位） |
| 2 | 页面能打开，但登录报「登录失败」 | 后端 CORS 默认只放行 `/^http:\/\/localhost:\d+$/`（`server/src/app.js:45`），**不含 `127.0.0.1`**；而 `.env.development` 让浏览器直连 `http://localhost:3000/api`，Origin 为 `http://127.0.0.1:5174` 时被 CORS 拦掉 | 用 `localhost` 访问即可（实测 290ms 打开、登录成功跳转）。若确实需要 127.0.0.1，可给后端加 `CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://127.0.0.1:5174`（该环境变量后端已支持，逗号分隔） |

**可用的开发账号**（开发库 `exam_system`，密码=用户名）：`test_teacher`、`e2e_teacher`。
`teacher_a`（35 份作业、数据最全）**密码不可知**（bcrypt 单向，实测用户名口令不通过，疑被改过）；需要时可由管理员「重置教师密码」恢复为用户名。

---

## 4. 已知差异与遗留（本轮**有意**没做的）

| 项 | 现状 | 计划 |
|---|---|---|
| 侧栏导航分组 + 待审核徽标 | 仍是旧的 6 项平铺，无徽标 | Wave 1（`AppShell`），徽标数据源已就绪 |
| 时间格式 | 仍走共享 `formatDateTime`（`2026/8/24 19:01`） | Wave 1 统一为 `2026-08-24 19:01`；该函数被 20+ 页使用，需一次性切换 |
| 骨架屏 | 表格用 antd 转圈，未上骨架 | Wave 1 |
| 全局圆角/字号尺度 | 未切换（见 §2.1） | Wave 1，需逐页截图评审 |
| 班级下拉 | `/teacher/classes` 全量返回 | 依赖后端 P1-7 分页 |

---

## 5. 后端相关事项（**需要后端配合时看这里**）

### 5.1 已就绪、本轮已在用 ✅

| 接口 | 用途 | 本轮用法 |
|---|---|---|
| `GET /teacher/pending-summary` | 待审核/AI 评分中/异常 | KPI 两张卡 |
| `GET /teacher/assignments` | `expectedCount` / `submissionCount` / `pendingReviewCount` / `latestSubmittedAt` + `classId/status/keyword` 筛选 | 提交进度列、待审核标签、服务端筛选 |

### 5.2 仍需后端（沿用 `06-api-gap.md` 的编号）⏳

| 编号 | 需求 | 影响本页吗 |
|---|---|---|
| P1-4 | 作业平均分 / 环比 / 本周已发布聚合 | 影响（KPI 少三张卡；**产品未定口径前不建议开工**） |
| P1-7 | 7 个列表接口服务端分页（含 `/teacher/classes`） | 影响（班级下拉全量返回） |

### 5.3 本轮新发现的后端小需求（建议并入下一批）🆕

| # | 需求 | 原因与建议契约 | 优先级 |
|---|---|---|---|
| N-1 | 作业列表补 **`aiPendingCount`** | 状态列现在只能显示「待审核 N」；后端在 `rollupPendingByAssignment` 里**已经算出了 aiPending**（`teacherController.js` 的 rollup 返回值含 `aiPending`），只是没在列表响应里给出。加一个字段即可，零额外查询 | 高（几乎零成本） |
| N-2 | 作业列表补 **`hasOpenQuestion`**（是否含无标准包的开放性题目） | 新 UI 想在列表上标出「开放性」，现在前端无法判断（要逐个题目查标准包）。建议在 assignment 行的 `_count` 同级返回布尔值 | 中 |
| N-3 | `pending-summary` 增加 **`byAssignment`**（可选） | 若希望 KPI 与列表行都能显示「AI 评分中 N」，可把按作业的聚合一次性返回，避免前端再算 | 低（N-1 已覆盖列表场景） |

> 说明：N-1 是我在实现状态列时发现的 —— **数据在后端已经算出来了，只是没暴露**，属于「后端一行改动、前端一个标签」的典型低成本项。

### 5.4 与后端无关（前端自己算）🧮

倒计时/剩余时间、提交进度百分比、状态四态合成、未交人数 —— 均已在前端派生（`domain/format.js`），不要向后端提需求。

---

## 6. 风险与回滚

- **改动面**：1 个页面 + 3 个新文件；其余页面未触碰，构建通过。
- **回滚**：`git revert <本次提交>` 即可；三个新文件是纯新增，删掉不影响其它页面（`main.js`/`App.vue` 的引入需一并回滚）。
- **已核对无破坏**：向导三步、Q9 软警告（无标准包确认框）、练习模式确认框、锁定/解锁，逻辑逐字保留，仅呈现层重写。
