# Exam-DeepSeek 移动端信息架构（Mobile Information Architecture）

> Phase 2 · 方法 skill `afrexai-ui-design-system` · 依据 `docs/mobile-app/preview/SCREENS.md`（37 屏唯一契约）
> 定位：把桌面端「侧栏 + 顶栏 + 表格」的 IA，重排为手机上的「底部 Tab + 二级页 + 底部动作条/Sheet」；**不改桌面路由与权限模型**。
> 实施形态（待实施）：新增 `/m/*` 路由区 + 独立移动 Layout，桌面端零改动（见 `07-implementation-plan.md`）。

---

## 0. 边界与目标

| 项 | 约定 |
|---|---|
| 屏幕契约 | 37 屏，不多不少；分组与 id 以 SCREENS.md §4 为准；本文只描述「如何组织」，不新增页面 |
| 路由约束 | 不改 `client/src/router/index.js` 既有 path 与 `meta.role`；移动端只新增并行路由 |
| 能力边界 | 只做「桌面已有能力的移动重排」+「明确引导电脑」；桌面没有的能力标记为**设计新增（待实施）** |
| 目标 | 4 类角色 / 3 套 TabBar / 37 屏 / L0–L3 四层；任一角色 30 秒内找到今天要做的事 |

---

## 1. 四类角色与入口

### 1.1 角色 → 首屏 → Tab

| 角色 | `role` 枚举（真实） | 桌面入口 | 移动入口屏 | 移动 Tab 数 | 登录后落地 |
|---|---|---|---|---|---|
| 公共 / 未登录 | — | `/`、`/login`、`/doc` | `public-landing` / `public-login` | 0 | 登录成功后按角色跳转 |
| 学生 | `student` | `/student/assignments` | `student-home` | 4 | Tab 1 首页 |
| 教师 | `teacher` | `/teacher/assignments` | `teacher-home` | 4 | Tab 1 工作台 |
| 管理员 | `super_admin` | `/admin/schools` | `admin-home` | 3 | Tab 1 概览 |

> 真实守卫：未登录访问任意受保护路由 → `/login`；角色不匹配 → `/login`（`client/src/router/index.js` `beforeEach`）。移动端沿用该规则，不为移动端单开权限逻辑。

### 1.2 登录、多学校与 401

| 场景 | 真实能力（证据） | 移动端设计 |
|---|---|---|
| 账号密码登录 | `POST /auth/login`（`client/src/views/Login.vue`） | `public-login` 单屏表单；密码可见切换；错误 banner（「账号或密码不正确，还可尝试 4 次」） |
| 同一账号多学校 | `res.data.schools` → 二次选择学校（`Login.vue` `schoolOptions` 分支） | **真实分支，但 37 屏未覆盖**；建议做 `public-login` 的同屏状态（见 §9-3），不新增屏 |
| 登录过期 | `/login?expired=1` + 常驻提示（`api/request.js`） | 登录页顶部 banner「登录已过期，请重新登录」，不弹 Toast |
| 登录后去向 | 按 `role` 进各自首页 | 学生 → `student-home`；教师 → `teacher-home`；管理员 → `admin-home` |

### 1.3 移动端入口与切换策略（Web 移动端）

| 项 | 方案 | 依据 |
|---|---|---|
| 判定 | `matchMedia('(max-width: 767px)')` **且** `matchMedia('(pointer: coarse)')` | 继承 `docs/ui-redesign/teacher-app/mobile-plan.md` 决策 4 |
| 路由 | 新增 `/m/*`（与 `/teacher/*`、`/student/*`、`/admin/*` 并行），桌面路由不动 | 同上 |
| 跳转 | 只在入口跳一次；偏好写 `localStorage['ui:layout'] = auto / mobile / desktop`；提供手动切换入口 | 同上 |
| 回退 | ≥768px 或细指针 → 桌面视图（表格 + 侧栏），**不强行套移动布局** | 决策 4 |
| 深链 | `/teacher/review/:id` ⇄ `/m/review/:id`，保留 query / hash | 待实施 |
| 越界提示 | 手机打开桌面路径 → 顶部提示条「切换到移动版」；桌面打开 `/m` → 提示条「去桌面版」 | 待实施 |
| 平台参数 | 预览用 `?platform=android` 模拟 Android 状态栏（24px）与 TabBar 高度差异 | 预览已实现 |

---

## 2. 导航架构

### 2.1 三套底部 TabBar（与 `preview/assets/screens.js` 的 `TABBARS` 一致）

**学生（4 Tab）**

| key | 名称 | 图标 | 目标屏 | 角标 | 说明 |
|---|---|---|---|---|---|
| `home` | 首页 | `home` | `student-home` | — | 今日待办 + 最近成绩 |
| `assignments` | 作业 | `assignments` | `student-assignments` | **2**（未交/进行中） | 作业列表 |
| `scores` | 成绩 | `scores` | `student-scores` | — | 学期成绩 + 逐次成绩 |
| `me` | 我的 | `user` | `student-profile` | — | 身份 + 设置 |

**教师（4 Tab）**

| key | 名称 | 图标 | 目标屏 | 角标 | 说明 |
|---|---|---|---|---|---|
| `home` | 工作台 | `home` | `teacher-home` | — | 待办三卡 + 快捷入口 |
| `assignments` | 作业 | `assignments` | `teacher-assignments` | — | 作业列表（卡片） |
| `review` | 审核 | `review` | `teacher-review-queue` | **12**（待审核数） | 逐份审核队列 |
| `me` | 我的 | `user` | `teacher-profile` | — | 身份 + 设置 |

**管理员（3 Tab）**

| key | 名称 | 图标 | 目标屏 | 角标 | 说明 |
|---|---|---|---|---|---|
| `home` | 概览 | `chart` | `admin-home` | — | KPI + 系统状态 + 今日异常 |
| `directory` | 管理 | `users` | `admin-directory` | — | 学校/班级/教师/学生（只读） |
| `monitor` | 监控 | `activity` | `admin-monitor` | — | 在线/队列/日志流（只读） |

### 2.2 Tab 归属规则（8 条）

1. Tab 只放 **L1 工作域**（高频、可独立停留）；详情、编辑、流程页一律二级页，不进 Tab。
2. 每套 Tab **2–5 个**；教师/学生 4 个、管理员 3 个是上限内的最优解，不再加「题库」「班级」进 Tab。
3. **审核是一等 Tab**：教师最高频动作是清空待审核（真实 `pending-summary.pendingReview` 驱动角标），必须可直达。
4. 角标 = **待办数量**（学生未交作业数、教师待审核数）；0 不显示；活动/新消息用红点，不用数字角标。
5. Tab 文案 2–4 个汉字（`--m-fs-micro` 10.5px 能放下）；不用图标单独表意（图标 + 文字双通道）。
6. 切 Tab **不堆叠返回栈**；二级页返回回到来源 Tab；从推送/深链进入二级页时，返回兜底到对应 Tab 首屏。
7. TabBar 常驻页面底部并让出安全区（`--m-tabbar-total = 56 + safe-bottom`）；有固定动作条的二级页不显示 TabBar。
8. 审核队列是唯一例外：Tab 页里在 **TabBar 之上**再叠一条固定动作条（页内 `.t-queuebar`），既保留 Tab 选中态，又让「改分 / 审核通过」落在拇指区。

### 2.3 层级定义（L0–L3）

| 层级 | 定义 | 底部形态 | 返回方式 | 屏数 |
|---|---|---|---|---|
| **L0 公共/认证/平台** | 不依赖登录态或角色 | `data-bottom="none"` | 品牌页回首页；异常页给主出口按钮 | 8（公共 6 + 平台 2） |
| **L1 Tab 首屏** | 角色主工作域 | `tabbar`（`.tabbar` + 安全区） | 系统返回 = 退出；Tab 互切 | 11（学生 4 + 教师 4 + 管理员 3） |
| **L2 二级页/流程** | 从 L1 进入的对象页、流程页 | `actionbar` 或 `none` + AppBar 返回 | AppBar 返回 / 手势返回 → 来源 L1 | 15（学生 5 + 教师 10） |
| **L3 浮层** | Sheet / ActionSheet / Toast | `data-bottom="sheet"` + 遮罩 | 关闭按钮 / 点遮罩 / 下滑 / Esc | 2（Sheet）+ Toast |
| **规范页** | 设计/开发查阅，不进用户流 | `none` | 无 | 1（`states-overview`） |

### 2.4 返回与导航规则

| 场景 | 规则 |
|---|---|
| 二级页返回 | AppBar 左侧 `.iconbtn[data-icon="back"]`，返回来源页；来源不明时回对应 Tab 首屏 |
| Android 物理返回 | 优先关 Sheet → 再退二级页 → 再退 Tab 栈；Tab 首屏再返回才退出应用（Capacitor 壳内实现） |
| 未保存离开 | 作答页（`student-answer-*`）返回需二次确认「答案已自动保存，确定离开？」；布置作业离开提示「已存草稿」 |
| Sheet | 点遮罩 / 右上关闭 / 下滑关闭三选一以上；关闭后焦点回到触发按钮 |
| 深链落地 | 直接打开二级页时，AppBar 返回兜底到该角色 Tab 首屏，不出现「死路」 |
| 滚动位置 | Tab 切换保留各 Tab 滚动位置；从详情返回保留列表位置与筛选（实施要求） |

---

## 3. 37 屏地图

> 列说明：**层级** L0–L3 见 §2.3；**入口** 是「用户从哪一屏进来」；**底部** 是 `body[data-bottom]` 的形态；**Tab** 表示该屏是否在某套 TabBar 中。

### 3.1 公共与认证（6 屏）

| # | id | 中文名 | 层级 | 入口 | 底部 | Tab |
|---|---|---|---|---|---|---|
| 1 | `public-landing` | 移动官网 | L0 | 手机访问站点根 `/` | `none` | 无 |
| 2 | `public-login` | 登录 | L0 | 守卫重定向 `/login`；官网 CTA | `none` | 无 |
| 3 | `public-doc` | 使用文档 | L0 | `/doc`；登录页/我的/工作台帮助入口 | `none` | 无 |
| 4 | `error-404` | 404 | L0 | 不存在路径（真实通配重定向 `/login`，404 为设计补充） | `none` | 无 |
| 5 | `error-403` | 403 | L0 | 角色越权（真实守卫回登录；403 屏为设计补充） | `none` | 无 |
| 6 | `error-500` | 500 | L0 | 服务不可用 / 网关错误 | `none` | 无 |

### 3.2 学生端（11 屏）

| # | id | 中文名 | 层级 | 入口 | 底部 | Tab |
|---|---|---|---|---|---|---|
| 7 | `student-home` | 首页 | L1 | 登录后落地 | `tabbar` | Tab 1 |
| 8 | `student-assignments` | 作业列表 | L1 | Tab 2；首页「作业」 | `tabbar` | Tab 2 |
| 9 | `student-assignment-detail` | 作业详情 | L2 | 作业卡片；首页待办「继续作答」 | `actionbar` | — |
| 10 | `student-answer-objective` | 作答 · 客观题 | L2（沉浸） | 作业详情「开始/继续作答」；答题卡跳题 | `actionbar` | — |
| 11 | `student-answer-code` | 作答 · 编程题 | L2（沉浸） | 作答页「下一题」；答题卡跳题 | `actionbar` | — |
| 12 | `student-answer-sheet` | 答题卡 | L3（Sheet） | 作答页顶部「答题卡」 | `sheet` | — |
| 13 | `student-submit-confirm` | 交卷确认 | L3（Sheet） | 答题卡「交卷」 | `sheet` | — |
| 14 | `student-assignment-done` | 已提交详情 | L2 | 交卷成功；作业列表「已提交」 | `actionbar` | — |
| 15 | `student-scores` | 成绩列表 | L1 | Tab 3；首页成绩条 | `tabbar` | Tab 3 |
| 16 | `student-score-detail` | 成绩详情 | L2 | 成绩列表「查看反馈」 | `none` | — |
| 17 | `student-profile` | 我的 | L1 | Tab 4；首页头像 | `tabbar` | Tab 4 |

### 3.3 教师端（14 屏）

| # | id | 中文名 | 层级 | 入口 | 底部 | Tab |
|---|---|---|---|---|---|---|
| 18 | `teacher-home` | 工作台 | L1 | 登录后落地 | `tabbar` | Tab 1 |
| 19 | `teacher-assignments` | 作业列表 | L1 | Tab 2；工作台「最近作业」 | `tabbar` | Tab 2 |
| 20 | `teacher-assignment-detail` | 作业详情 | L2 | 作业卡片 | `actionbar` | — |
| 21 | `teacher-review-queue` | 评分审核 | L1 | Tab 3；工作台待审核卡 | `tabbar` + `.t-queuebar` | Tab 3 |
| 22 | `teacher-review-detail` | 审核详情 · 评分 | L2 | 队列「改分 / 审核通过」 | `actionbar` | — |
| 23 | `teacher-review-code` | 代码只读 + 选区 | L2 | 审核详情「代码」分段 | `actionbar` | — |
| 24 | `teacher-review-diff` | 代码差异 | L2 | 代码屏「差异」Tab | `actionbar` | — |
| 25 | `teacher-batch-select` | 批量审核 · 多选 | L2 | 审核页「更多 → 批量审核」 | `actionbar` | — |
| 26 | `teacher-batch-confirm` | 批量审核 · 确认 | L2 | 批量选择「审核通过 (N)」 | `actionbar` | — |
| 27 | `teacher-assign-wizard` | 布置作业 · 4 步 | L2（流程） | 工作台快捷入口；作业列表「布置作业」 | `actionbar` | — |
| 28 | `teacher-questions` | 题库 | L2 | 工作台快捷入口 | `none` | — |
| 29 | `teacher-class` | 班级详情 | L2 | 工作台快捷入口；作业详情班级名 | `none` | — |
| 30 | `teacher-profile` | 我的 | L1 | Tab 4；工作台头像 | `tabbar` | Tab 4 |
| 31 | `teacher-code-unsupported` | 手机编辑说明页 | L2 | 题库编辑 / 标准答案编辑入口拦截 | `actionbar` | — |

### 3.4 管理端（3 屏）

| # | id | 中文名 | 层级 | 入口 | 底部 | Tab |
|---|---|---|---|---|---|---|
| 32 | `admin-home` | 管理概览 | L1 | 登录后落地 | `tabbar` | Tab 1 |
| 33 | `admin-directory` | 组织目录 | L1 | Tab 2；概览快捷入口 | `tabbar` | Tab 2 |
| 34 | `admin-monitor` | 实时监控 | L1 | Tab 3；概览系统状态卡 | `tabbar` | Tab 3 |

### 3.5 平台与状态（3 屏）

| # | id | 中文名 | 层级 | 入口 | 底部 | Tab |
|---|---|---|---|---|---|---|
| 35 | `platform-install` | PWA 安装引导 | L0 | 首次访问；我的「安装到桌面」 | `actionbar` | 无 |
| 36 | `platform-splash` | Android 启动屏 | L0 | Capacitor 壳冷启动 | `none` | 无 |
| 37 | `states-overview` | 状态体系 | 规范页 | 设计评审 / 开发查阅（不进用户流） | `none` | 无 |

**计数核对**：公共 6 + 学生 11 + 教师 14 + 管理 3 + 平台 3 = **37**；按层级 = L0 8 + L1 11 + L2 15 + L3 2 + 规范页 1 = **37**。

---

## 4. 关键用户流程

### 4.1 学生：作答与查看成绩

```
① 打开
student-home（Tab1）
  └─ 今日待办卡「今晚 23:59 截止 · 剩余 2 题」
       └─ 继续作答 ─▶ ② student-assignment-detail
                        └─ 开始作答 ─▶ ③ student-answer-objective（3/6，倒计时）
                                        ├─ 答题卡 ─▶ student-answer-sheet（Sheet）
                                        │              └─ 交卷 ─▶ student-submit-confirm（Sheet）
                                        │                            └─ 确认交卷 ─▶ ④ student-assignment-done
                                        └─ 下一题（编程题）─▶ student-answer-code
                                                              └─ 扫码/复制链接接力到电脑
⑤ 查分：student-scores（Tab3）─▶ student-score-detail
```

| 步骤 | 屏 | 真实能力（证据） | 设计要点 |
|---|---|---|---|
| ① 知道要做什么 | `student-home` | `GET /student/assignments`（`startTime` / `endTime` / 倒计时 `deadlineInfo`） | 一屏一卡：截止时间 + 剩余题数 + 一个「继续作答」；不铺 4 张作业卡 |
| ② 读规则 | `student-assignment-detail` | `/student/assignments/:id`（`maxAttempts` / `allowResubmit` / `locked` / 题目数 / 作答方式） | 底部分段：考试信息 / 题目列表 / 提醒；底部固定主按钮 |
| ③ 作答 | `student-answer-objective` / `student-answer-code` | Submit 页分题作答：`choice / multi_choice / judge / fill / code`；分题提交 `subStatuses`；草稿提示 `draftNoticeText` | 单题聚焦；顶部答题卡 + 倒计时；客观题大选项；编程题诚实引导电脑 |
| ③.5 检查 | `student-answer-sheet` | 新增设计（真实无答题卡） | 四态题号宫格（已答/当前/未答/标记）+ 进度 |
| ④ 交卷 | `student-submit-confirm` → `student-assignment-done` | 真实为逐题提交 + `submitAll`（「提交全部」）；提交后 `submitted` | 「交卷」= 提交全部；确认页写清未答数、剩余时间、不可修改 |
| ⑤ 等评分 | `student-assignment-done` | 状态枚举 `submitted → ai_graded → reviewed → published`；socket `graded` 为**教师端**实时通道，学生端需进入页面时刷新状态 | 时间线四步（已提交 → AI 评分中 → 教师审核 → 发布成绩）；不空白等待 |
| ⑥ 看成绩 | `student-scores` / `student-score-detail` | `GET /student/scores` 仅返回已出分（`totalScore` / `maxScore` / `attemptCount`） | 分数 + 等级 + 班均 + 构成 + AI 评语；分数不只靠颜色 |

**边界与分支**

| 情况 | 处理 |
|---|---|
| 未到开放时间 / 已截止 / 次数用尽 / 已锁定 | 详情页状态 tag + 禁用「开始作答」；文案引用真实状态（未开始 / 已截止 / 已锁定） |
| 答案暂不可见（答案可见性策略 `after_publish`） | 成绩详情显示「答案将在发布后可见」，不展示题目答案（真实后端已裁剪 `referenceAnswer`） |
| 编程题在手机上 | 不提供编辑器：展示题干 + 「在电脑上打开」接力（真实桌面 Submit 页可写代码） |
| 实训题（工程包） | 真实路由存在（`/student/assignments/:assignmentId/project/:questionId`，`ProjectZipUploader` + 「提交答案」）；37 屏未覆盖 → §9-1 待确认 |
| 中途离开 | 作答页返回二次确认；草稿提示保留（真实 `dirtyCount` / `draftNoticeText` 机制） |

### 4.2 教师：审核与布置作业

```
① 工作台 teacher-home（Tab1）
   ├─ 待审核 12 ─▶ ② teacher-review-queue（Tab3，逐份队列 5/12）
   │                 ├─ 改分 ─▶ teacher-review-detail ──代码──▶ teacher-review-code ──差异──▶ teacher-review-diff
   │                 └─ 审核通过 ─▶ 下一份（队列进度 +1）
   ├─ 布置作业 ─▶ ③ teacher-assign-wizard（1 基本信息 → 2 选题 → 3 班级 → 4 确认）
   └─ 最近作业 ─▶ teacher-assignments（Tab2）─▶ teacher-assignment-detail ─▶ 催交 / 导出
批量：teacher-review-queue ─「更多」─▶ teacher-batch-select ─▶ teacher-batch-confirm ─▶ 发布（不可撤销）
```

| 步骤 | 屏 | 真实能力（证据） | 设计要点 |
|---|---|---|---|
| ① 知道今天做什么 | `teacher-home` | `GET /teacher/pending-summary` → `{ pendingReview, aiPending, abnormal }` | 三卡对应真实字段：待审核 / AI 评分中 / 异常；「进行中」来自作业列表状态（需前端聚合，见 §9） |
| ② 逐份审核 | `teacher-review-queue` | `GET /teacher/review-summary`（作业 / 班级 / AI 状态 / 审核状态 / 已交未交）；socket `graded` 实时刷新 | 队列进度 5/12；学生卡 = AI 分 + 分项 + 折叠评语；上下滑切换；底部双按钮 |
| ②.5 改分与评语 | `teacher-review-detail` | `GET /teacher/review/:id` 逐题 `aiScore` / 终分 / 教师评语；`regrade`（AI 重评）；`reviewAll`（保存审核）；`publishAll`（发布） | 分数卡（AI 分 + 可改分输入 + 分项）；AI 评语可折叠；快捷评语 chips；底部「打回 / 通过」 |
| ②.6 看代码 | `teacher-review-code` / `teacher-review-diff` | 真实为 Monaco 只读（ReviewDetail）；**diff 视图为新增设计**（仓库无 diff 实现） | 行号固定 + 横滑；长按选区菜单（引用到评语/复制/搜索）；逐块折叠 diff，390px 可读 |
| ③ 布置作业 | `teacher-assign-wizard` | 真实为两步弹窗（选题 → 班级/时间，`useAssignmentForm`）+ 草稿恢复 | 手机拆 4 步、每步一件事；底部「上一步 / 下一步」；关闭提示存草稿 |
| ④ 催交 / 导出 | `teacher-assignment-detail` | 导出真实存在（`GET /teacher/export-review` + `exportReviewXlsx`，在班级审核页）；**「催交」当前无接口** | 催交为设计新增（待确认）；导出在手机可触发下载，失败给明确提示 |
| ⑤ 批量 | `teacher-batch-select` / `teacher-batch-confirm` | 真实为**班级级**「一键审核全班 / 一键发布全班」（`POST /teacher/submissions/batch-review` 与 `batch-publish`） | 设计稿是「筛选命中 12 份」；一期建议按班级语义，UI 用「影响范围摘要 + 不可撤销」确认 |

**审核流程的三条硬规则**

1. **逐份**：一次只审一份，通过后自动进下一份；队列进度可见（5/12），随时可退出（退出保留进度）。
2. **不可撤销**：发布成绩前必须展示影响范围（发布 N 份、其中 <60 分 M 份建议复核、含教师评语 K 份），文案明确「发布后学生立即可见，且不可撤销」。
3. **AI 是副驾**：AI 分默认展示但可改；教师的「通过」才是发布动作；AI 评语可引用为教师评语（新增设计，见 §9）。

### 4.3 管理员：只读巡检

```
① admin-home（Tab1）KPI + 系统状态 + 今日异常
   ├─ 组织目录 ─▶ ② admin-directory（学校 / 班级 / 教师 / 学生 分段，只读）
   └─ 实时监控 ─▶ ③ admin-monitor（在线/队列/日志流，30s 自动刷新）
高风险操作（增删改/导入/AI 配置/批改记录）──▶ 提示「请在电脑端完成」
```

| 屏 | 真实能力（证据） | 只读边界 |
|---|---|---|
| `admin-home` | 用户/班级/教师/学生数可由 `/admin/*` 列表聚合；**在线人数、评分队列、平均响应无现成接口**（桌面无 dashboard） | 只展示、不提供任何写操作；KPI 数据源见 §9-6 |
| `admin-directory` | `GET /admin/schools`、`/admin/classes`、`/admin/teachers`、`/admin/students` 列表 | 合并 4 个桌面页为 1 个分段页；**新增/编辑/导入/重置密码全部隐藏**，用只读提示引导电脑 |
| `admin-monitor` | `GET /admin/monitor`（系统信息 / PM2 进程 / 错误日志 / 30s 自动刷新）；socket 可用于实时 | 只读；进程表在手机上只展示状态与 CPU/内存摘要，完整表引导电脑；不提供重启等操作 |

### 4.4 公共与异常流程

| 流程 | 触发 | 屏与行为 |
|---|---|---|
| 首次访问 | 手机打开站点根 | `public-landing` → CTA「登录控制台」→ `public-login`；页脚版本号 |
| 登录失败 | 账号/密码错 | `public-login` 错误 banner（不弹 Toast）；输错次数提示 |
| 登录过期 | 任意接口 401 | 跳 `/login?expired=1` 并常驻提示（真实行为）；移动端保留当前页返回路径 |
| 无权限 | 角色不匹配 | `error-403`：展示当前身份 + 「回到我的作业 / 工作台」；不丢登录态 |
| 地址不存在 | 未知路径 | `error-404`：可复制当前地址 + 回首页；真实通配会重定向登录，404 为设计补充 |
| 服务异常 | 5xx / 网关错误 | `error-500`：错误编号 + 重试 + 返回；重试有 loading 态 |
| 断网 | `navigator.onLine = false` | 全局离线 banner + 列表灰化；恢复后提示「已恢复网络，点击刷新」；关键提交禁用并说明 |
| 扫码接力 | 手机无法完成的编辑 | `student-answer-code`（学生编程题）/ `teacher-code-unsupported`（教师编辑）：二维码 + 复制链接（10 分钟有效）+ 电脑端打开指引 |

---

## 5. 移动 IA ↔ 桌面 IA 映射

### 5.1 桌面路由 → 移动屏

| 桌面路由 / 页面（真实） | 移动屏 | 归属 | 手机上的形态 |
|---|---|---|---|
| `/` Landing | `public-landing` | L0 | 重排版官网（非缩放） |
| `/login` | `public-login` | L0 | 单屏表单 + 错误 banner |
| `/doc` | `public-doc` | L0 | 搜索 + 目录 + 文章；上一节/下一节 |
| `/student/assignments` | `student-assignments` | Tab 2 | 搜索 + 状态胶囊 + 作业卡 |
| `/student/assignments/:id` | `student-assignment-detail` + `student-answer-objective` + `student-answer-code` | L2 | 详情 → 单题作答（拆出两屏） |
| `/student/assignments/:assignmentId/project/:questionId` | **无对应屏** | — | 待确认（§9-1） |
| `/student/scores` | `student-scores` + `student-score-detail` | Tab 3 / L2 | 学期概览 + 逐次成绩 + 得分构成 |
| `/teacher/assignments` | `teacher-assignments` + `teacher-assignment-detail` | Tab 2 / L2 | 服务端筛选 → 卡片列表 → 详情 |
| `/teacher/review` | `teacher-review-queue` | Tab 3 | 从「列表点进详情」改为「逐份队列」 |
| `/teacher/review/class/:classId` | `teacher-batch-select` + `teacher-batch-confirm` | L2 | 班级矩阵页 → 批量选择 + 影响确认 |
| `/teacher/review/:id` | `teacher-review-detail` → `teacher-review-code` → `teacher-review-diff` | L2 | 三栏工作台 → 纵向三段 + 代码/差异页 |
| `/teacher/review/project/:submissionId` | `teacher-review-code`（工程包变体） | L2 | 待确认是否单列（§9-2） |
| `/teacher/questions` | `teacher-questions` | L2 | 只读预览；新建/编辑引导电脑 |
| `/teacher/questions/new` · `/:id/edit` · `/new/project` · `/:id/edit-project` | `teacher-code-unsupported` | L2 | 拦截 → 说明页 → 扫码/复制链接接力 |
| `/teacher/classes` | `teacher-class` | L2 | 班级统计 + 作业进度 + 学生卡 |
| `/teacher/students` · `/teacher/teams`（含 `/:id`） | **无对应屏** | — | 引导电脑（手机不做学生/团队管理） |
| `/admin/schools` / `/admin/classes` / `/admin/teachers` / `/admin/students` | `admin-directory` | Tab 2 | 4 页合并为 1 个分段只读目录 |
| `/admin/monitor` | `admin-monitor` | Tab 3 | 摘要 + 日志流（进程完整表引导电脑） |
| `/admin/grading-runs` | **无对应屏** | — | 高密度只读表格 → 引导电脑 |
| `/admin/ai-config` | **无对应屏** | — | 高风险配置 → 引导电脑 |
| 通配 `/:pathMatch(.*)*` → `/login` | `error-404` | L0 | 设计补充（真实行为是重定向登录） |
| 组合式（真实无独立页面） | `student-answer-sheet` · `student-submit-confirm` · `student-assignment-done` · `teacher-assign-wizard` · `platform-*` · `states-overview` | L2/L3/L0 | **移动端新增设计**，不改变桌面端 |

### 5.2 表格列 → 卡片字段（移动端只保留「能决策」的字段）

| 桌面表格（真实列） | 移动端保留字段 | 手机卡片的 4 个决策字段 |
|---|---|---|
| 教师评分审核：作业/班级 · AI状态 · 审核状态 · 已交/未交 · 操作（380+190+160+170+140 = 1040px） | 作业名 + 班级、状态 tag、提交进度、截止时间 | ①作业名 ②状态 ③进度 ④截止 |
| 教师作业列表（`teacher/Assignments.vue`：作业/班级/状态/提交进度/截止/操作） | 同上，操作降为卡内按钮/左滑 | ①作业名 ②状态 ③进度 ④截止 |
| 学生作业列表（`student/Assignments.vue`：标题/状态/题数/开始/截止/倒计时） | 标题、状态 tag、截止 + 倒计时 | ①标题 ②状态 ③截止 ④进度/题数 |
| 学生成绩（`student/Scores.vue`：作业/提交次数/分数/状态，4 列） | 作业名、分数、等级、提交次数 | ①作业名 ②分数 ③等级 ④提交次数 |
| 管理监控进程表（7 列 640px：进程名/状态/CPU/内存/运行时长/重启次数/PID） | 进程名、状态、CPU/内存摘要 | ①进程 ②状态 ③CPU ④内存（完整表引导电脑） |
| 通用列表 `ListPage`（`scroll: { x: 'max-content' }`） | 主字段 2–3 个 + 状态 + 右侧箭头 | 主字段 + 状态 + 时间 |

### 5.3 能力取舍：Tab / 二级 / 只读 / 引导电脑 / 暂不支持

| 能力 | 桌面 | 移动端 | 理由 |
|---|---|---|---|
| 作业列表、审核、成绩、监控 | 可操作 | **Tab / 二级页** | 高频、移动场景成立 |
| 代码查看（只读） | Monaco | **二级页**（`teacher-review-code`） | 只读渲染可行；不迁移 Monaco |
| 代码编辑（学生作答 / 教师标准答案） | Monaco | **引导电脑 + 接力** | 软键盘、无补全、误触；诚实边界 |
| 建题 / 改题 / 题库编辑 | 完整编辑器 | **只读预览 + 引导电脑** | 工程量大、低频、需大屏 |
| 班级 / 学生 / 团队管理 | 表格 + 批量导入 | **引导电脑**（班级详情保留只读） | 管理操作低频、需表格批量 |
| 管理员增删改 / AI 配置 / 批改记录 | 可操作 | **引导电脑** | 高风险 + 高密度；手机误触成本高 |
| 批量审核 / 发布 | 班级级一键 | **二级页 + 影响确认** | 有真实接口；但必须防误发 |
| 导出 Excel | 有 | 可触发下载（提示文件大小） | 手机可下载，但打开体验差 → 提示用电脑查看 |
| 推送 / 离线提交 / 多语言 | 无 | **暂不支持** | 超出本次范围 |

---

## 6. 页面状态与空态策略

### 6.1 四态定义与优先级

| 态 | 定义 | 表达 | 出现位置 |
|---|---|---|---|
| loading | 首次加载且无缓存内容 | 骨架屏（`.sk`）优先；按钮/局部用 `.spinner` | 列表、详情、提交按钮 |
| empty | 请求成功但无数据 | `.empty`（图标 + 标题 + 说明 + 主操作） | 所有列表页 |
| error | 请求失败 / 校验失败 | 行内 `.error-text`（表单）或 `.errorbox`（页面）；错误页 `error-*` | 所有页面 |
| offline | 断网 | 顶部 `.banner--warning` + 列表灰化 + 禁用提交 | 全局（App 壳层） |
| partial | 有数据但部分未完成 | 状态 tag + 进度 + 说明（AI 评分中 / 待评分 / 未提交） | 作业、成绩、审核 |

**优先级**（同一时刻多个状态）：`offline` > `error` > `empty` > 内容；`loading` 只在「无任何内容可展示」时用全屏骨架，有旧数据时用局部 loading（不得清空列表）。

### 6.2 逐屏状态矩阵（● 必须有 ｜ ○ 适用时给 ｜ — 不适用）

| # | 屏 | loading | empty | error | offline | 特殊状态 |
|---|---|---|---|---|---|---|
| 1 | `public-landing` | — | — | — | ○ | 已登录 → CTA 改「进入控制台」 |
| 2 | `public-login` | ● 按钮 loading | — | ● 账号/密码错误 | ● 网络失败文案 | 多学校选择（待确认） |
| 3 | `public-doc` | ○ 正文骨架 | ● 搜索无结果 | ● 加载失败 | ○ | 目录高亮 / 上一下一节 |
| 4 | `error-404` | — | — | — | — | 可复制地址 |
| 5 | `error-403` | — | — | — | — | 当前身份卡 |
| 6 | `error-500` | ● 重试 loading | — | — | — | 错误编号 |
| 7 | `student-home` | ● 骨架 | ○ 无作业 | ● 重试 | ● banner | 待办/无待办 |
| 8 | `student-assignments` | ● 骨架 | ● 无作业 / 筛选无结果 | ● 重试 | ● | 未开始/进行中/已提交/已评分 |
| 9 | `student-assignment-detail` | ● | — | ● 重试 | ● 禁用开始 | 已截止/已锁定/次数用尽 |
| 10 | `student-answer-objective` | ○ 题目加载 | — | ● 保存失败 | ● 禁止交卷 | 倒计时将尽 / 未保存 |
| 11 | `student-answer-code` | ○ | — | ● 草稿保存失败 | ● | 草稿已保存 / 接力二维码过期 |
| 12 | `student-answer-sheet` | — | — | — | — | 已答/未答/标记/当前 |
| 13 | `student-submit-confirm` | — | — | ● 提交失败 | ● 禁止提交 | 有未答题警告 |
| 14 | `student-assignment-done` | ○ 状态刷新 | — | ○ 状态拉取失败 | ○ | AI 评分中 / 教师审核中 / 已发布 |
| 15 | `student-scores` | ● 骨架 | ● 暂无成绩 | ● 重试 | ● | 待评分项 / 待出分 |
| 16 | `student-score-detail` | ● | — | ● 重试 | ○ | 答案不可见提示 |
| 17 | `student-profile` | ○ | — | ○ | ○ | 主题/字号开关 |
| 18 | `teacher-home` | ● 骨架 | ○ 无待办 | ● 重试 | ● | 待审核角标 12 |
| 19 | `teacher-assignments` | ● 骨架 | ● 无作业 / 筛选无结果 | ● 重试 | ● | 草稿 / 进行中 / 待审核 / 已结束 |
| 20 | `teacher-assignment-detail` | ● | ○ 无学生 | ● 重试 | ● | 催交中 / 导出中 |
| 21 | `teacher-review-queue` | ● 骨架 | ● 待审核已清零 | ● 重试 | ● | 队列进度 5/12 / 实时新提交 |
| 22 | `teacher-review-detail` | ● | — | ● 保存失败 | ● 禁止通过 | AI 重评中 / 已改分 |
| 23 | `teacher-review-code` | ● 代码加载 | ○ 无文件 | ● 加载失败 | ● | 长按选区菜单 |
| 24 | `teacher-review-diff` | ● | ○ 无差异 | ● | ● | 只看差异开关 / 折叠块 |
| 25 | `teacher-batch-select` | ○ | ● 无可选提交 | ● | ○ | 已选 3 项 / 全选本页 |
| 26 | `teacher-batch-confirm` | ● 发布中 | — | ● 部分失败 | ● 禁止发布 | 命中 12 份 / 风险 2 份 / 发布回执 |
| 27 | `teacher-assign-wizard` | ○ 题目加载 | ● 题库为空 | ● 保存草稿失败 | ● | 步骤 2/4 / 已选 N 题 |
| 28 | `teacher-questions` | ● 骨架 | ● 无题目 | ● 重试 | ● | 只读提示「编辑请在电脑端」 |
| 29 | `teacher-class` | ● 骨架 | ○ 无学生 | ● 重试 | ● | 班级进度 |
| 30 | `teacher-profile` | ○ | — | ○ | ○ | 切换桌面版提示 |
| 31 | `teacher-code-unsupported` | — | — | ○ 二维码生成失败 | ○ | 链接 10 分钟有效 |
| 32 | `admin-home` | ● 骨架 | ○ 无异常 | ● 部分指标失败 | ● | 系统正常 / 降级 |
| 33 | `admin-directory` | ● 骨架 | ● 无数据 / 搜索无结果 | ● 重试 | ● | 只读 banner |
| 34 | `admin-monitor` | ● 骨架 | ○ 无日志 | ● 重试 | ● | 自动刷新 30s / 实时 tag |
| 35 | `platform-install` | — | — | — | — | 已安装 / 稍后 |
| 36 | `platform-splash` | ● 检查更新 | — | ○ 更新检查失败 | ○ | 版本号 / 进度 |
| 37 | `states-overview` | ● 示例 | ● 示例 | ● 示例 | ● 示例 | 四态对照 |

### 6.3 空态 / 错误文案规范

| 场景 | 标题 | 说明 | 主操作 | 文案来源 |
|---|---|---|---|---|
| 学生无作业 | 还没有收到作业 | 老师布置作业后，这里会显示作业要求与截止时间。 | 刷新 | 真实文案（`student/Assignments.vue`） |
| 学生筛选无结果 | 没有符合条件的作业 | 换个关键词或清空筛选后再试。 | 清空筛选 | 真实文案 |
| 学生无成绩 | 暂无成绩 | 完成作业并等老师发布成绩后，这里会显示每次作业的得分与提交次数。 | 查看我的作业 | 真实文案（`student/Scores.vue`） |
| 教师待审核清零 | 待审核已清零 | 新的提交会自动出现在这里。 | 刷新 | 设计文案 |
| 教师无作业 | 还没有布置作业 | 第一份作业可以从「工作台 → 布置作业」开始。 | 布置作业 | 设计文案（对齐真实空态按钮语义） |
| 网络失败 | 网络连接失败 | 请检查网络后重试。 | 重试 | 真实文案（SCREENS.md §3.6） |
| 服务异常 | 服务暂时不可用 | 错误编号 ERR-20261017-500；若持续出现请联系管理员。 | 重试 / 返回 | 设计文案 |
| 无权限 | 此页面需要教师权限 | 当前身份：李明 · 学生。 | 回到我的作业 / 切换账号 | 设计文案 |
| 断网 | 网络已断开 | 已缓存的内容仍可查看，提交与刷新将在恢复后可用。 | 重试 | 设计文案 |

---

## 7. 内容优先级

### 7.1 首屏信息等级（P0 必须首屏可见 / P1 滚动可达 / P2 详情或收起）

| 角色 | P0（首屏） | P1（滚动） | P2（详情/收起） |
|---|---|---|---|
| 学生首页 | 问候 + 头像、今日截止、剩余题数、继续作答 | 快捷入口、最近成绩 | 设置入口 |
| 学生作业列表 | 筛选胶囊 + 截止提醒 + 前 2 张作业卡（含状态与倒计时） | 其余作业卡 | 题数/开始时间等明细 |
| 学生作答 | 题号/总题数、倒计时、题干、选项、答题卡入口 | 标记本题 / 上一题 | 交卷入口（底部主操作） |
| 学生成绩 | 学期平均分、排名、已出分作业前 2 条 | 等级分布、全部成绩 | 逐题得分（详情） |
| 教师工作台 | 待办三卡（待审核 12 / 进行中 3 / AI 评分中 2） | 快捷入口、最近作业 | 帮助/设置 |
| 教师审核队列 | 队列进度 5/12、学生身份、AI 总分、分项 | AI 评语、手势提示 | 参考/代码入口 |
| 教师作业列表 | 状态胶囊 + 前 3 张作业卡（状态/进度/截止） | 其余卡片、搜索 | 操作（左滑） |
| 管理员概览 | KPI 四数、系统状态 tag（服务正常/队列/响应） | 今日异常、快捷入口 | 只读提示 |
| 管理员监控 | 在线人数、评分队列、实时 tag | 日志流、刷新 | 配置引导电脑 |

### 7.2 卡片字段取舍规则

1. **4 字段原则**：每张卡片只放决定「点不点、下一步做什么」的字段；其余进详情。
2. **数字等宽**：分数/人数/百分比用 `.tnum`；单位弱化（`<small>` 或 `<u>`）。
3. **时间是双通道**：相对时间（今晚 23:59 / 剩余 3 天 14 小时）+ 绝对时间（2026-10-20 23:59），不二选一。
4. **状态带文字**：`.tag` + `.dot` + 文案；颜色只做辅助（色弱可读）。
5. **操作不占字段位**：主操作在底部动作条；次要操作收进「更多」或左滑；不在卡片里塞 3 个按钮。
6. **禁止 ISO 原串**：所有时间统一 `YYYY-MM-DD HH:mm`（桌面端已知问题：题库列表曾直接显示 ISO 字符串，移动端不得复用该写法）。

### 7.3 密度分级与字号

| 角色 | 密度 | 卡片内距 | 字号 | 说明 |
|---|---|---|---|---|
| 学生 | comfortable | `--m-card-pad` 16px；卡间距 `--m-stack` 12px | 正文 15px（`--m-fs-body`），辅助 13px | 阅读为主，允许留白 |
| 教师 | compact | 卡片 16px 内距；列表行 `--m-row-h` 56px | 标题 16px，辅助 12–13px | 信息密度高，但不小于 12px |
| 管理员 | compact | 同教师 | 同教师 | 只读，数字优先 |
| 公共/文档 | comfortable | 区块 `--m-section-gap` 24px | 正文 15px | 长文阅读 |

---

## 8. 与其它文档的交接

| 文档 | 本文章节的下游 |
|---|---|
| `05-page-specs.md` | §3 的 37 屏逐屏 handoff（布局、字段、交互、验收） |
| `04-interaction-a11y.md` | §2.4 返回/手势、§4 流程、§6 四态的交互细节与无障碍 |
| `03-components.md` | §2 TabBar/卡片/列表、§4 数据展示、§5 反馈与浮层、§6 交互模式的规范来源 |
| `07-implementation-plan.md` | §1.3 /m 入口策略、§5 映射、§9 待确认的实施拆分 |

---

## 9. 待确认（缺页 / 新增能力，不擅自扩范围）

| # | 问题 | 事实 | 建议 |
|---|---|---|---|
| 1 | **学生实训题工程包提交无对应屏** | 真实路由 `/student/assignments/:assignmentId/project/:questionId`（工程包上传，复用 ProjectQuestionEdit 的 student 模式） | 补 1 屏 `student-project-submit`，或并入 `student-assignment-detail` 的「提交工程包」状态 |
| 2 | **教师实训题审核（工程包）归属** | 真实路由 `/teacher/review/project/:submissionId`（文件树 + 评价式评分，无标准包时单源） | 确认 `teacher-review-code` 是否覆盖工程包场景；若差异大单列 1 屏 |
| 3 | **登录多学校二次选择** | 真实分支（`Login.vue` `schoolOptions`） | 作为 `public-login` 同屏状态，不新增屏 |
| 4 | **批量语义与接口** | 现有接口是班级级 `batch-review` / `batch-publish`；设计稿是筛选命中 N 份 | 一期按班级批量；若要做筛选批量，需后端新增或客户端逐条提交（并发 ≤5，结果汇总） |
| 5 | **新增能力范围** | diff、答题卡、逐份队列、二维码接力、催交、AI 评语引用 均为新增设计 | 确认一期范围；催交还需通知能力 |
| 6 | **管理员 KPI 数据源** | 桌面无 dashboard；`/admin/monitor` 不含在线人数/评分队列/平均响应 | 新接口或前端聚合；否则 KPI 标注「示意数据（设计稿）」 |
| 7 | **教师工作台「进行中 3」来源** | `pending-summary` 只有 `pendingReview / aiPending / abnormal` | 由作业列表状态聚合，或新增汇总字段 |
| 8 | **≥768 回退口径** | 宽度 only vs 宽度 + 粗指针 | 建议沿用 mobile-plan：`max-width: 767px` 且 `pointer: coarse` |
| 9 | **状态枚举文案映射** | 真实枚举 `draft / submitted / ai_graded / reviewed / published / locked / expired` | 在 05-page-specs 里给出逐枚举中文文案与 tag 色调的最终映射表 |
