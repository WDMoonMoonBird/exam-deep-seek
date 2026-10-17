# 逐屏设计规范（Page Specs · 37 屏 Handoff）

> 对应 skill afrexai-ui-design-system Phase 9（handoff）。上游：[SCREENS.md](./preview/SCREENS.md)（37 屏契约与演示数据）、[02-design-tokens.md](./02-design-tokens.md)、[04-interaction-a11y.md](./04-interaction-a11y.md)
> 下游：[07-implementation-plan.md](./07-implementation-plan.md)（Vue 文件映射、M0–M6 排期、测试矩阵）。
> 读法：先看 §1 的 5 个模板（结构复用），再看 §3 逐屏规范（只写差异）。每屏 6 行：目标 / 关键元素 / 状态 / 交互 / 数据来源 / 验收点。

---

## 1. 五个页面模板与 37 屏归类

### 1.1 模板定义

| 模板 | 名称 | 结构 | 适用场景 |
|---|---|---|---|
| A | 列表页 | AppBar/大标题 → 筛选胶囊或搜索 → 卡片列表（或 ≥768 表格）→ 加载更多/分页 → 可选下拉刷新 → 四态 | 多条目、可筛选、可逐条进入 |
| B | 详情页 | AppBar 返回 → 标题/状态 → 信息卡/hero → 分区内容 → 底部动作条或页内主按钮 | 单条对象的阅读、编辑、确认、异常 |
| C | 工作台 | AppBar/问候 → 数据卡/统计 → 待办或队列/工具条 → 固定动作条 | 以「看整体 + 做下一步」为主的首页/队列/代码工作台 |
| D | 作答页 | 顶部题号/倒计时/答题卡入口 → 题干内容（选项/接力卡）→ 底部动作条（下一题/交卷） | 学生作答与提交确认 |
| E | 表单向导 | 关闭/返回 → 步骤条 → 单步表单/选择 → 底部上一步/下一步 | 多步骤创建、认证表单 |

**模板只为复用结构与间距**；每屏只写差异（字段、状态、接口、验收），不重复模板规则。

### 1.2 37 屏 → 模板归类

| 分组 | 屏 | 模板 | 变体 |
|---|---|---|---|
| 公共 | public-landing | B | 营销变体（大标题 + CTA） |
| 公共 | public-login | E | 认证变体（单列表单 + 错误 banner） |
| 公共 | public-doc | B | 阅读变体（目录 + 正文 + 提示框） |
| 公共 | error-404 / error-403 / error-500 | B | 异常变体（大号状态码/图标 + 双按钮） |
| 学生 | student-home | C | 学生工作台（今日待办 + 快捷入口 + 最近成绩） |
| 学生 | student-assignments | A | 状态筛选 + 截止提醒 |
| 学生 | student-assignment-detail | B | 规则卡 + 题目列表 + 开始作答 |
| 学生 | student-answer-objective | D | 客观题（选项组） |
| 学生 | student-answer-code | D | 编程题 + 电脑接力卡 |
| 学生 | student-answer-sheet | D | Sheet 变体（底部浮层，非独立路由） |
| 学生 | student-submit-confirm | D | 确认变体（Sheet/对话框） |
| 学生 | student-assignment-done | B | 状态变体（成功 + 进度时间线） |
| 学生 | student-scores | A | 概览变体（学期 KPI + 等级分布 + 列表） |
| 学生 | student-score-detail | B | 评分详情（大分数 + 构成 + 评语） |
| 学生 | student-profile | B | 设置变体（身份卡 + 开关组 + 退出） |
| 教师 | teacher-home | C | 教师工作台（待办三卡 + 快捷入口） |
| 教师 | teacher-assignments | A | 左滑操作 + 状态胶囊 |
| 教师 | teacher-assignment-detail | B | 进度环 + 分段 + 学生行 + 动作条 |
| 教师 | teacher-review-queue | C | 队列变体（逐份卡片 + 手势 + 双按钮） |
| 教师 | teacher-review-detail | B | 评分变体（分数卡 + 评语表单 + 双按钮） |
| 教师 | teacher-review-code | C | 代码工作台（文件条 + 只读代码 + 工具条） |
| 教师 | teacher-review-diff | C | 差异工作台（折叠块 + 只看差异） |
| 教师 | teacher-batch-select | A | 多选变体（长按进入 + 批量条） |
| 教师 | teacher-batch-confirm | B | 确认变体（筛选 chips + 影响范围 + 危险提示） |
| 教师 | teacher-assign-wizard | E | 4 步向导 |
| 教师 | teacher-questions | A | 只读 + 新建引导电脑 |
| 教师 | teacher-class | A | 班级统计头 + 学生列表 |
| 教师 | teacher-profile | B | 设置变体 |
| 教师 | teacher-code-unsupported | B | 说明变体（原因 + 接力方式） |
| 管理 | admin-home | C | 只读概览（KPI + 状态 + 异常） |
| 管理 | admin-directory | A | 分段（学校/班级/教师/学生）+ 只读 |
| 管理 | admin-monitor | C | 监控（大数 + 队列 + 日志流 + 刷新） |
| 平台 | platform-install | B | 引导变体（安装收益 + 双平台指引） |
| 平台 | platform-splash | 特殊 | 原生启动屏（不落 Vue 路由，见屏 36） |
| 平台 | states-overview | 特殊 | 状态样板（DEV-only，不对外） |

**数量核对**：A 7 + B 15 + C 7 + D 4 + E 2 + 特殊 2 = 37。

---

## 2. 模板统一规范

### 2.1 模板 A · 列表页

| 统一项 | 规范 |
|---|---|
| 页头 | Tab 根页用大标题（hero，22px/28px）；二级页用 AppBar 返回 + 标题 |
| 筛选 | 横向滚动 chips，高度 34，选中态底色 + 文字双变化；含计数（待审核 12）；筛选后回到顶部 |
| 卡片 | 白底 + 1px --m-border + 16 圆角 + 16 内边距；每卡只放 4 个决策字段：标题、状态、进度/分数、下一步按钮 |
| 加载 | 首屏 3 张骨架；触底「加载中…」；无更多「没有更多了」；二次加载保留旧数据 |
| 四态 | loading/empty/error/offline 全量（04 §3） |
| ≥768 | 切 MDataTable（04 §8），不引 antd Table |
| 主操作 | 卡片内主按钮或底部动作条二选一；同屏主操作唯一 |

### 2.2 模板 B · 详情页

| 统一项 | 规范 |
|---|---|
| 返回 | 左上返回按钮 44×44；标题单行省略；右侧最多 1 个图标按钮 |
| 信息层级 | 状态 tag 紧跟标题；关键信息用 kv 行；长内容分区（sec 标题 17px） |
| 动作 | 有固定底部动作条时内容区滚动补 --m-page-bottom-actionbar；无动作条时主按钮放在内容末尾 |
| 危险操作 | danger-soft 或文字按钮 + 二次确认；确认文案含影响范围与不可撤销 |
| 状态 | 详情页四态 + 「无权限/不存在」区分（403/404） |

### 2.3 模板 C · 工作台

| 统一项 | 规范 |
|---|---|
| 问候区 | 首页：问候 + 头像（44）；二级工作台：AppBar + 标题 |
| 数据卡 | 2/3/4 列等宽（grid），数字用 tnum；单位小字；点击进入对应列表 |
| 队列/工具 | 每次只突出一个主任务；队列页必须有「上一位/下一位」按钮等价物（04 §1.2） |
| 固定动作条 | 双按钮时主按钮占 66%，次按钮 34%（.actionbar .btn--secondary 34%） |
| 数据刷新 | Socket 只提示不静默插入；轮询仅在可见时 |

### 2.4 模板 D · 作答页

| 统一项 | 规范 |
|---|---|
| 顶部 | 返回（二次确认）｜题号/题数｜倒计时（最后 10 分钟 danger + aria-live）｜答题卡按钮（角标已答数） |
| 题干 | 题型 + 分值 + 题干；代码块只读；长题干可滚 |
| 选项 | 整行可点，最小高 52；选中 = 描边 + 底色 + 勾选三重指示；role=radio aria-checked |
| 底部动作条 | 客观题：上一题/下一题/交卷；编程题：标记稍后/提交本题 + 接力卡；始终可见交卷入口 |
| 自动保存 | 草稿保存状态 role=status；保存失败提示可重试，不阻塞作答 |
| 倒计时语义 | 不强制跳转；剩余时间由 endTime 计算；提交时后端仍会校验截止（403「已过截止时间」） |

### 2.5 模板 E · 表单向导

| 统一项 | 规范 |
|---|---|
| 步骤 | ≤4 步；步骤条显示当前/完成；每步只做一件事；可返回上一步（保留已填） |
| 校验 | 字段级错误 + 提交前整步校验；错误聚焦第一个字段（04 §7.5） |
| 底部 | 上一步（次）/ 下一步（主）；最后一步为「确认布置」；关闭需确认「保存草稿/放弃」 |
| 草稿 | 关闭时本地保存草稿（localStorage），下次进入提示恢复；不自动创建服务端草稿（无接口） |
| 软警告 | 后端业务码 1007：弹窗原样展示 message，确认后带 confirmWithoutStandardPackage: true 重发（屏 27） |


---

## 3. 逐屏规范（37 屏）

> 数据来源标注约定：复用 = 现有接口可直接支撑；新增 = 当前后端没有该能力（待确认，见 §6）；前端 = 前端本地计算/状态。
> 所有接口路径均以 /api 为前缀（client/src/api/request.js 的 baseURL，生产经 nginx /exam/api/ 代理）。

### 3.1 公共与认证（6 屏）

#### 1. public-landing · 移动官网 · 模板 B-营销

- **目标**：3 秒讲清「谁能用、能做什么」，把用户送到登录，不在官网堆功能。
- **关键元素**：品牌栏（Deadpan 判题 logo + 版本 v2.1.0）｜大标题「让 AI 评分可被信任」+ 副标题｜3 张角色能力卡（教师/学生/管理员）｜3 条产品要点｜主 CTA「登录控制台」｜页脚版权与使用文档链接。
- **状态**：正常；GET /api/health 可选展示「服务正常」小标签，失败静默隐藏（不打断营销页）。
- **交互**：CTA → /m/login；角色卡可滚动；文档链接 → /m/doc；不做轮播/视差。
- **数据来源**：静态文案；版本号复用 composables/appVersion.js（buildStamp）；health 复用 GET /api/health（无新增）。
- **验收点**：360/390 无横向滚动；CTA 高 50px；断网可打开；深色无亮色孤岛；首屏 CTA 在折叠线以上。

#### 2. public-login · 登录 · 模板 E-认证

- **目标**：一次完成登录并正确按角色进入 /m 首页；错误可读、可重试。
- **关键元素**：品牌 + 「欢迎回来」｜账号、密码输入（密码可见切换）｜记住我开关（只记账号，不存密码）｜主按钮「登录」｜错误 banner（role=alert）｜使用文档链接｜页脚版权。
- **状态**：默认/提交中（按钮 loading，输入禁用）/错误（账号或密码错误、限流、网络失败）/多学校二次选择（业务码 1002）。
- **交互**：Enter 提交（enterkeyhint=done）；错误后焦点回账号或密码；登录成功按 role 跳 /m/teacher/home、/m/student/home、/m/admin/home；「记住我」只持久化账号（localStorage m-login-account），不勾选则登录后清除。
- **数据来源**：复用 POST /api/auth/login；成功返回 token + user（含 role、teacherSchools、currentSchool、mustChangePassword）；业务码 1002 返回 schools 列表；写入 token/user 与现有桌面一致。**新增/待确认**：错误文案「还可尝试 N 次」后端未返回剩余次数（authController 只返回「用户名或密码错误」），移动端不得编造 N；限流文案用后端「登录失败次数过多，请 5 分钟后再试」。
- **验收点**：错误 banner 可被读屏播报；密码可见切换有 aria-label；480ms 内无重复提交；1002 分支可完成二次择校；登录后 Tab 选中态正确。

#### 3. public-doc · 使用文档 · 模板 B-阅读

- **目标**：手机上「查一条规则」可读可搜，不要求完整复刻桌面文档站。
- **关键元素**：搜索框｜目录卡（快速开始/班级/作业/审核）｜文章正文（标题 + 步骤 + 提示框）｜上一节/下一节｜返回入口。
- **状态**：正常/搜索无结果（清除搜索）/加载失败（重试，若内容改为接口拉取）。
- **交互**：目录切换高亮；搜索 300ms 防抖本地过滤；步骤内容可折叠；外链复制而非直接跳商店。
- **数据来源**：静态内容（把现有 client/src/views/Doc.vue 的核心章节转为移动版内容组件）；不加载交互式 Demos（体积大、娱乐性低）；无新增接口。
- **验收点**：正文 15px/1.6、可复制代码块；搜索定位可见；无横向滚动；长文滚动不丢锚点。

#### 4. error-404 · 页面不存在 · 模板 B-异常

- **目标**：告诉用户「哪条地址不存在」，给两个明确出口，不丢登录态。
- **关键元素**：大号 404｜「页面不存在或已被移动」｜当前地址（可复制）｜主按钮「回到首页」｜次按钮「返回上一页」。
- **状态**：静态；若来自权限重定向可显示来源提示。
- **交互**：回到首页按角色 → /m/<role>/home；返回上一页用 history.back，无历史则回首页；地址复制 Toast。
- **数据来源**：前端路由信息（router.currentRoute.fullPath）；无接口。
- **验收点**：不白屏、不自动跳登录；复制成功有 Toast 且 aria-live；两个按钮 ≥44px。

#### 5. error-403 · 无权限 · 模板 B-异常

- **目标**：解释「需要什么角色」并给出回到自己首页的路径。
- **关键元素**：锁图标｜「此页面需要教师权限」｜当前身份卡（姓名 · 角色 · 学校）｜主按钮「回到我的首页」｜文字按钮「切换账号」。
- **状态**：静态；后端 403（业务码 1003）落地时复用同一模板。
- **交互**：回到我的首页按角色跳；切换账号 → 清 token/user → /m/login（二次确认）。
- **数据来源**：localStorage user（复用 stores/user.js）；无接口。
- **验收点**：身份与所需角色文案正确（学生看教师页场景）；切换账号有确认；读屏可读出身份卡。

#### 6. error-500 · 服务异常 · 模板 B-异常

- **目标**：承认故障、给出重试与反馈方式，避免用户反复点击。
- **关键元素**：大号 500｜「服务暂时不可用」｜错误编号（前端生成或后端 requestId，待确认）｜主按钮「重试」｜次按钮「返回」｜小字「若持续出现请联系管理员」。
- **状态**：静态/重试中（按钮 loading）。
- **交互**：重试 = 重新触发失败请求（路由级错误则刷新数据）；返回 = history.back；错误编号可长按复制。
- **数据来源**：前端错误上下文（ApiError.status/code/url）；无新增接口。**待确认**：后端 500 无 requestId，编号需前端生成（ERR-时间戳-随机 6 位）或后端补字段。
- **验收点**：错误编号可复制；重试不产生重复提交；文案不暴露堆栈/英文原文。

### 3.2 学生端（11 屏）

#### 7. student-home · 学生首页（Tab 1） · 模板 C-学生工作台

- **目标**：首屏 3 秒知道「今晚要做什么、最近考得怎样」。
- **关键元素**：问候「下午好，李明」+ 头像｜今日待办卡（今晚 23:59 截止 + 剩余 2 题 + 继续作答）｜快捷入口（作业/成绩/文档）｜最近成绩条（92 · Java 期末）｜TabBar（作业角标 2）。
- **状态**：正常/暂无待办（空态卡）/加载失败（局部重试）/离线（离线条 + 灰化）。
- **交互**：继续作答 → /m/student/answer/:id；作业 → /m/student/assignments；成绩 → /m/student/scores；我的 → /m/student/profile；下拉刷新。
- **数据来源**：复用 GET /api/student/assignments（取进行中/最近，含 answeredCount/finalScore/submittedAt）+ GET /api/student/scores（最近已出分）+ GET /api/student/profile（姓名）；「剩余 N 小题」由作业详情的小题总数减 answeredCount 得到（**answeredCount 是小题粒度**，不能直接与 _count.assignmentQuestions（题数）相减；首页文案的「题」需产品确认口径）。
- **验收点**：首屏无需滚动即可看到待办与 CTA；TabBar 角标与作业数一致；深色下进度条/分数色可读。

#### 8. student-assignments · 作业列表（Tab 2） · 模板 A

- **目标**：按状态快速找到「要交的 / 已交的 / 已出分的」作业。
- **关键元素**：页标题「我的作业」+ 说明｜筛选胶囊（全部/进行中/待评分/已评分，含计数）｜今晚截止提醒 banner｜作业卡（标题/状态 tag/截止/进度/主次按钮）｜加载更多。
- **状态**：四态；筛选无结果空态；已截止未交 danger 提示；已评分显示分数 + 等级。
- **交互**：卡点详情；进行中 → 继续作答；已提交 → 已提交详情；已评分 → 成绩详情；下拉刷新；筛选写入 URL query（可返回恢复）。
- **数据来源**：复用 GET /api/student/assignments?page&pageSize&keyword（已支持 keyword；返回 submittedAt/finalScore/answeredCount/maxScore/attemptCount/locked/allowResubmit）；四态筛选与桌面 views/student/Assignments.vue 同口径前端合成（未开始/进行中/已提交待评分/已评分/已截止）。
- **验收点**：筛选计数与列表一致；已评分分数仅 published 可见（接口已保证）；卡片高度一致不跳动。

#### 9. student-assignment-detail · 作业详情 · 模板 B

- **目标**：作答前把规则、题目、时限一次讲清，底部一键开始/继续。
- **关键元素**：返回栏 + 标题｜状态 tag｜考试信息卡（截止/限时/满分/题数/任课教师）｜题目列表（6 题，客观题/编程题标签 + 分值 + 已答状态）｜提醒 banner（可提前交卷/次数限制）｜底部动作条「开始作答 / 继续作答 / 查看结果」。
- **状态**：四态；已截止不可进入（按钮禁用 + 说明）；已提交显示「查看已提交」；已评分显示「查看成绩」。
- **交互**：开始 → /m/student/answer/:id；返回 → 列表；题目可点跳到对应题；底部按钮随状态变化。
- **数据来源**：复用 GET /api/student/assignments/:id（assignment + assignmentQuestions + submissions，未发布剥离分数/参考答案；返回 question.subQuestions、type、maxScore）；倒计时/状态前端算。
- **验收点**：题数用 _count.assignmentQuestions（题）与 subQuestions（小题）区分文案，不拼成「4/6 题」；锁定/截止/次数上限有明确禁用理由。

#### 10. student-answer-objective · 作答 · 客观题 · 模板 D

- **目标**：单手完成客观题、随时看进度与倒计时、交卷前可检查。
- **关键元素**：顶部返回（二次确认）｜题目 3/6｜倒计时 42:18（最后 10 分钟 danger）｜答题卡按钮（角标 4/6）｜题干 + 分值 + 题型｜4 个选项（单选/多选）｜标记本题｜上一题/下一题｜底部动作条「下一题 / 交卷」。
- **状态**：未答/已答/已标记；保存中/已保存（role=status）；保存失败（可重试）；已交卷只读；离线禁用提交。
- **交互**：选项整行点选（aria-checked）；自动保存草稿（防抖 1.5s，复用 useDraftAutosave 思路）；答题卡 → Sheet；下一题切题；交卷 → 确认 Sheet。
- **数据来源**：复用 GET /api/student/assignments/:id；PUT /api/student/assignments/:id/draft（questionId + subQuestionId + answer）；POST /api/student/assignments/:id/submit（逐题提交，见屏 13）；无新增接口。
- **验收点**：倒计时不因切屏/锁屏丢失（用 endTime 计算）；草稿状态可见；选项不只靠颜色；返回有二次确认。

#### 11. student-answer-code · 作答 · 编程题 · 模板 D-接力变体

- **目标**：不假装手机能写代码；提供「扫码/复制链接到电脑」的接力，并明确告知当前草稿与提交边界。
- **关键元素**：顶部同作答页｜编程题题干（含代码块/输入输出说明）｜电脑作答接力卡：二维码 +「扫码在电脑打开」+ 复制链接｜草稿状态（16:30 自动保存）｜说明「手机不推荐写代码，可先完成客观题」｜底部动作条「标记稍后 / 提交本题」。
- **状态**：正常/复制成功 Toast/离线（接力链接仍可复制，但提示需联网）/实训题（question.type=project）切换为「上传工程包」说明。
- **交互**：二维码用前端 qrcode 生成（待确认依赖，见 §6）；复制链接 → 桌面路由 /exam/student/assignments/:id（需登录）；提交本题 → 若该题已答则提交；未答则提示先完成客观题；「标记稍后」写入本地标记。
- **数据来源**：复用 GET /api/student/assignments/:id 取题目（编程题）；实训题走 GET /api/student/assignments/:assignmentId/project/:questionId + POST .../submit（multipart zip，≤10MB）；接力链接前端生成（withAppBase）；**新增/待确认**：免登录接力 token 无接口，扫码后在电脑需登录（文案必须写明）。
- **验收点**：接力卡二维码可识别（真机扫码打开正确 URL）；复制链接可用；不加载 Monaco；离线提示准确。

#### 12. student-answer-sheet · 答题卡（Sheet） · 模板 D-Sheet

- **目标**：一屏检查「哪些答了/没答/标记了」并跳题或交卷。
- **关键元素**：暗底遮罩 + 底部 Sheet：已答 4/6 进度条｜题号宫格（已答/当前/未答/已标记四态）｜图例｜「继续作答」主按钮｜「交卷」文字按钮。
- **状态**：题号四态；未答数量提示；交卷中禁用；Sheet 打开/关闭动效。
- **交互**：点题号跳题并关闭 Sheet；遮罩/关闭按钮/返回键关闭；交卷 → 交卷确认 Sheet（屏 13）；焦点入 Sheet、关闭返回触发按钮。
- **数据来源**：前端状态（answers/subStatuses/marked 集合，来源于 GET 详情 + 本次作答）；无接口。
- **验收点**：四态不只靠颜色（数字 + 底色 + 描边/勾）；宫格 44×44；读屏读出题号状态；Sheet 内可滚动不遮按钮。

#### 13. student-submit-confirm · 交卷确认（Sheet） · 模板 D-确认

- **目标**：在不可逆动作前把「未答数量、剩余时间、不可修改」讲清，防止误交。
- **关键元素**：遮罩 + Sheet：警告「还有 2 题未作答」｜已答/未答统计｜剩余时间 42:18｜「提交后不可修改」提示｜主按钮「确认交卷」｜次按钮「继续作答」。
- **状态**：确认中（loading）/提交失败（部分题失败：显示成功/失败数 + 重试失败项）/截止已过（后端 403 文案）。
- **交互**：确认 → 逐题提交（仅提交已作答内容；与桌面 useSubmitActions.submitAll 同逻辑）；继续作答 → 关闭回作答页；提交失败不关闭 Sheet，提供重试。
- **数据来源**：POST /api/student/assignments/:id/submit 逐题调用（questionId + subQuestionId + answer + force）；无整卷提交接口（前端循环）；结果统计前端维护；提交后 GET 详情刷新状态。
- **验收点**：未答题数与实际一致；只提交已答内容；多次提交不重复（幂等/重试提示）；提交成功回执可追踪（→ 屏 14）。

#### 14. student-assignment-done · 已提交详情 · 模板 B-状态

- **目标**：提交后给回执与进度，让学生知道「接下来会发生什么」。
- **关键元素**：成功图标 +「已提交」｜提交时间/用时/文件数｜评分进度时间线（已提交 → AI 评分中 → 教师审核 → 发布成绩）｜等待提示｜返回作业列表按钮。
- **状态**：已提交（submitted/ai_graded/reviewed/published 四态映射到时间线）；AI 评分异常（abnormal，展示「评分异常，教师会人工处理」）；离线/错误。
- **交互**：返回列表；查看成绩（已发布时）；下拉刷新进度；30s 可见时轮询（页面隐藏暂停）。
- **数据来源**：复用 GET /api/student/assignments/:id（submissions[].status 与分数）；**待确认/文案修正**：当前后端「AI 评分只在作业截止后由统一 worker 触发」（student/project-submit.js 头注释 D5），提交后立即显示「AI 评分中」会承诺过快；文案改为「已提交，截止后统一评分」或按 status 显示。
- **验收点**：四态文案与后端 status 一一对应；离线不误报；进度时间线不只靠颜色；返回按钮唯一主操作。

#### 15. student-scores · 成绩列表（Tab 3） · 模板 A-概览

- **目标**：一屏看清「这学期考得怎么样」，并能下钻到单次反馈。
- **关键元素**：学期成绩概览卡（平均分/班级排名/已出分 x/y）｜分数等级分布小条（优秀/良好/及格）｜已出分作业列表（分数 + 等级 + 查看反馈）｜待出分项（待评分 tag）。
- **状态**：空（无已出分）/部分出分/加载失败/离线。
- **交互**：查看反馈 → 成绩详情；列表排序按最近出分（reviewedAt desc，后端已按此排序）；下拉刷新；Tab 切换。
- **数据来源**：复用 GET /api/student/scores（仅 published；返回 assignmentTitle/totalScore/maxScore/bestScore/attemptCount/subItems）；概览的均分/排名/超过百分比无接口（新增/待确认，§6 G1）——v1 降级为「已出分 N 门 / 平均分（前端按已出分算）/ 我的最高分」，不显示班级排名与超过百分比。
- **验收点**：分数配文字等级；只显示已发布成绩；空态给出原因（成绩发布后可见）；深色下等级色可读。

#### 16. student-score-detail · 成绩详情 · 模板 B

- **目标**：让学生看懂「分是怎么来的」，并看到 AI 与教师评语。
- **关键元素**：返回栏 + 作业名｜大分数 92/100 + 等级 A + 班级均分（无接口时隐藏）｜分数构成（客观/编程/过程分进度条）｜逐题得分列表｜AI 评语卡｜教师评语（若有）｜「查看原卷」次按钮（已发布且允许看答案时）。
- **状态**：四态；无教师评语（只显示 AI 评语）；分数构成不可得时降级为逐题列表。
- **交互**：返回成绩列表；查看原卷 → 作答只读（若 answerVisibility 允许，否则禁用 + 说明）；长按复制评语。
- **数据来源**：复用 GET /api/student/scores 的 subItems（title/score/feedback = teacherFeedback 优先，否则 aiFeedback）；**待确认**：分数构成（客观/编程/过程分）无结构化字段（subItems 无题型），班级均分无接口 → v1 隐藏构成与均分，或在 §6 G2 补接口。
- **验收点**：反馈长文可滚动、可复制；AI/教师评语来源区分清楚；分数与等级一致；未发布不泄露。

#### 17. student-profile · 我的（Tab 4） · 模板 B-设置

- **目标**：查看身份、调整阅读偏好、退出登录；不堆功能。
- **关键元素**：身份卡（头像/姓名/学号/班级/学校）｜数据条（已完成 3 · 平均分 85.3）｜设置组（深色主题 switch / 字号 / 通知 / 使用文档 / 关于）｜退出登录（danger 文字按钮 + 二次确认）｜TabBar。
- **状态**：正常；开关切换即时生效；通知开关无后端时禁用并说明「暂未开放」；退出确认。
- **交互**：文档 → /m/doc；主题写 useTheme（ui-theme）；字号写 localStorage m-font-scale（1/1.125/1.25）并映射根字号；退出清 token/user → /m/login。
- **数据来源**：复用 GET /api/student/profile（realName/username/classes）；身份与统计前端算；通知偏好无接口（新增/待确认，v1 隐藏或只读）；无新增接口。
- **验收点**：主题切换全局即时；退出二次确认；设置行高 ≥56；未登录跳登录。


### 3.3 教师端（14 屏）

#### 18. teacher-home · 教师工作台（Tab 1） · 模板 C

- **目标**：碎片时间打开就知道「今天先清哪批待办」。
- **关键元素**：问候「下午好，周老师」+ 头像｜待办三卡（待审核 12 / 进行中 3 / AI 评分中 2）｜快捷入口 4 个（布置作业/题库/班级/扫码审核）｜最近作业 2 条（进度条 + 状态）｜待审核提醒 banner｜TabBar（审核角标 12）。
- **状态**：四态；待办为 0（「今天没有待办」空态）；加载失败（卡片局部重试）；离线。
- **交互**：待审核 → /m/teacher/review；布置作业 → /m/teacher/assignments/new；题库 → /m/teacher/questions；班级 → 班级选择 Sheet（GET /api/teacher/classes）→ /m/teacher/classes/:id；Tab 切换；下拉刷新。
- **数据来源**：复用 GET /api/teacher/pending-summary（pendingReview/aiPending/abnormal/updatedAt，接口真实存在，口径与 review-summary 一致）+ GET /api/teacher/assignments?pageSize=2（submissionCount/expectedCount/pendingReviewCount）+ localStorage user（姓名/currentSchool）。「进行中 3」可用 assignments status 筛选统计或前端算（无单值接口，待确认是否需补）。
- **验收点**：三个数字与审核页/徽标一致（同口径）；零待办不显示 0 红点；Tab 角标只来自 pendingReview。

#### 19. teacher-assignments · 作业列表（Tab 2） · 模板 A

- **目标**：快速判断哪份作业该催、该审、该结束。
- **关键元素**：标题 + 搜索框｜状态胶囊（全部/进行中/待审核 12/已结束）｜作业卡片 3–4 张（标题/状态/班级/提交进度条/截止）｜一张卡片左滑露出操作｜TabBar。
- **状态**：四态；筛选无结果；锁定态（锁定 tag）；左滑展开/收起。
- **交互**：卡点详情；左滑操作 = 锁定/解锁 + 复制链接（见 §6 G3：编辑/删除无接口）；搜索 300ms 防抖；Tab 切换；下拉刷新。
- **数据来源**：复用 GET /api/teacher/assignments?page&pageSize&classId&status&keyword（当前接口真实支持 classId/status/keyword，并返回 submissionCount/expectedCount/pendingReviewCount/latestSubmittedAt/allowResubmit/scorePolicy/answerVisibility）；锁定复用 PUT /api/teacher/assignments/:id/lock。**新增/待确认**：作业编辑/删除接口不存在（server/src/routes/teacher.js 仅有 lock）。
- **验收点**：进度用 submissionCount/expectedCount（同 population）；锁定有二次确认与 Toast；左滑不误触、「更多」按钮等价存在。

#### 20. teacher-assignment-detail · 作业详情 · 模板 B

- **目标**：一眼掌握提交进度，从这里进入催交/导出/审核。
- **关键元素**：返回 + 标题 + more｜状态 tag｜进度卡（ring 84% + 已交 38/45 + 未交 7 + 截止）｜主次按钮「催交 / 导出」｜分段（提交 38 / 题目 3 / 概况）｜学生行列表（陈嘉懿 92 已评分 / 周予安 待评分 / 李思远 未提交）｜底部动作条「查看评分与审核」。
- **状态**：四态；多班级（班级切换器）；部分失败（学生列表加载失败不阻塞进度卡）；催交中/导出中。
- **交互**：审核 → /m/teacher/review?assignmentId=...；催交 → 二次确认后调用（无接口时改为「复制提醒文案」并说明）；导出 → 移动端 v1 引导电脑（见数据来源）；学生行点开审核详情。
- **数据来源**：复用 GET /api/teacher/assignments/:id（assignmentQuestions/assignmentClasses）+ GET /api/teacher/review-class/:classId?assignmentId=（学生行，含 aiScore/finalScore/status/submitted）+ GET /api/teacher/export-review?classId&assignmentId（JSON → 前端 xlsx 复用 client/src/infrastructure/export.js，可选）。**新增/待确认**：催交通知接口与通知渠道不存在（§6 G4）；「导出」在手机上生成/分享 xlsx 体验差，v1 建议提示用电脑导出。
- **验收点**：进度分子分母口径正确（submittedCount/expectedCount）；未交学生可识别；多班级不串数据；危险操作有确认。

#### 21. teacher-review-queue · 评分审核（Tab 3） · 模板 C-队列

- **目标**：连续逐份审核，不断流，一眼看到 AI 分与分项。
- **关键元素**：返回/关闭 +「评分审核」+ 进度 5/12 + 完成按钮｜队列进度条｜学生卡（姓名/学号/提交时间 + AI 92 大分 + 分项 + AI 评语折叠）｜手势提示「上下滑切换 · 长按多选」｜底部「改分 / 审核通过」双按钮。
- **状态**：四态；队列空（今日已清空）；该份 AI 评分中（显示等待，不可通过）；异常（abnormal 需人工，禁用一键通过）；加载下一批。
- **交互**：上下滑切换（按钮等价：上一位/下一位）；改分 → 审核详情；审核通过 → 二次确认（分数摘要）→ 通过后自动下一位；长按进入多选（批量）；「完成」回工作台；socket 新数据提示不静默插入。
- **数据来源**：复用 GET /api/teacher/submissions?assignmentId=&classId=&status=ai_graded,submitted&page&pageSize（当前接口支持 assignmentId 过滤与逗号多状态，list[] 含 aiScore/bestScore/finalScore/status/student/question/assignment）；分项只在实训题有结构化 breakdown（项目提交接口），通用题显示总分 + 评语（见屏 22）；进度来自 GET /api/teacher/review-summary 行（reviewPending/submittedCount）。**新增/待确认**：无「上一条/下一条」接口，移动端预取一页后本地队列切换（翻到边界再请求下一页），不做服务端 next。
- **验收点**：通过与改分后队列推进正确；异常项不可一键通过；离线禁用；返回不丢已审状态（后端已写）。

#### 22. teacher-review-detail · 审核详情 · 评分 · 模板 B-评分

- **目标**：核对 AI 评分分项与评语，改分/写评语并给出结论。
- **关键元素**：返回 + 标题 + 完成｜学生信息条｜分数卡（AI 92 + 可改分输入 + 分项）｜分段（评分/代码/参考）｜AI 评语卡 + 教师评语输入 + 快捷评语 chips｜底部动作条「打回 / 通过」。
- **状态**：四态；分数非法（超满分/小数/非数字：后端 400 可读文案）/评语为空（允许通过，二次确认「未填写教师评语，将保留 AI 评语」）/保存中/保存失败。
- **交互**：改分输入失焦或保存时 PUT；快捷评语 chips 追加到输入框；通过 → 二次确认；打回 = 不通过并保留待审（需后端支持，§6 G5 待确认；v1 若后端无打回语义，改为「保存评语」不推进状态）；代码 tab → 代码屏。
- **数据来源**：复用 GET /api/teacher/submissions/:id（Submission 全字段 + allSubmissions + question/subQuestion）；PUT /api/teacher/submissions/:id/review（{finalScore, teacherFeedback}，后端做范围校验与状态机 reviewed/published）；PUT /api/teacher/submissions/:id/score（行内改分）。**待确认**：通用题/编程题 AI 评语无结构化分项（只有整段文本），分项 UI 仅实训题可用，详见 §6 G6。
- **验收点**：分数范围校验与后端一致（0 到 maxScore）；评语保存成功有 aria-live；通过后学生端不可见（reviewed 未发布），文案不得写「学生已可见」。

#### 23. teacher-review-code · 代码只读 + 选区 · 模板 C-代码

- **目标**：在手机上完成「读代码 + 摘一句到评语」，不写代码。
- **关键元素**：顶部返回 + 「陈嘉懿的提交」+ 第 1 题/第 2 题/差异 tab｜文件名条｜深色代码面板（行号固定、12+ 行、1 处长按选中高亮）｜浮层选区菜单（引用到评语/复制/搜索）｜底部工具（Aa- / Aa+ / 换行 / 复制）｜底部动作条「改分 / 审核通过」。
- **状态**：四态；文件切换中；代码过大（提示在电脑查看）；选区为空（不弹菜单）；离线（只读可用若已加载）。
- **交互**：长按选择 → 工具条；引用到评语 append 到教师评语；Aa 调字号（12–16，本地记忆）；换行开关；复制；横向滚动；工具栏不遮挡选中行；代码面板不加载 Monaco。
- **数据来源**：复用 GET /api/teacher/submissions/:id（通用题 answer 字符串）+ 实训题 GET /api/teacher/project-submission/:id（standardFiles/studentFiles 的 tree+contents）；文件树选择前端；无新增接口。**待确认**：语法高亮无后端预着色，前端轻量 tokenizer 自研（04 §5.3）；接力编辑无接口（屏 31）。
- **验收点**：行号 sticky 不随横滑跑；500 行滚动 60fps；选区引用后评语可见；复制成功 Toast；不加载 Monaco。

#### 24. teacher-review-diff · 代码差异 · 模板 C-Diff

- **目标**：在 390px 宽度回答「学生改了哪几处、有没有行为差异」。
- **关键元素**：返回 +「代码对比」+「只看差异」switch｜文件头（App.vue · 差异 4 处）｜逐块折叠 diff：相同 6 行折叠条 + 新增/删除块着色 + 行号｜底部提示「2 处行为差异，可一键引用到评语」｜动作条「只看差异 / 引用差异到评语」。
- **状态**：四态；无差异（「与标准包一致」成功态）；文件过大（引导电脑）；只看差异开关。
- **交互**：逐块展开/折叠；只看差异隐藏相同块；引用差异 → 截取块文本 append 评语；≥1024 平板可并排双栏（04 §8.4）；返回代码屏。
- **数据来源**：复用 GET /api/teacher/project-submission/:id（standardFiles vs studentFiles，contents 为相对路径 → 文件正文）；diff 算法前端自研（逐行 LCS 或 Myers，限制文件 ≤200KB/≤2000 行）；无新增接口。**待确认**：diff 库依赖（不引入则自研，引入需评估包体）。
- **验收点**：新增/删除不只靠颜色（+/- 行号 + 背景）；折叠条可键盘操作；大文件降级提示；引用文本与评语输入框一致。

#### 25. teacher-batch-select · 批量审核 · 多选 · 模板 A-多选

- **目标**：把「同分段的 N 份」一次性处理，同时保持可核对。
- **关键元素**：返回 +「批量审核」+ 完成｜已选 3 项 + 全选本页/取消｜学生行列表（勾选态 3 个 + 未选 2 个，分数 tag）｜底部批量操作条「审核通过 (3)」+「更多」。
- **状态**：四态；已选 0（批量按钮禁用）；全选/反选；加载更多；异常项（不可选，标「需人工」）。
- **交互**：长按或右上「选择」进入；勾选 44×44；全选本页（不是全部）；「审核通过 (3)」→ 批量确认（屏 26）；返回若已有选择需确认放弃；已选集合跨页保持（本地 Map，按作业隔离）。
- **数据来源**：复用 GET /api/teacher/submissions?assignmentId=&classId=&status=ai_graded&page&pageSize（前端筛选 AI 分区间）；选中项逐条 PUT /api/teacher/submissions/:id/review（并发 ≤5）。**待确认**：无按 submissionIds 的批量审核接口（batch-review 的粒度是 classId×assignmentId 全量，不能只处理选中项，故不用于选中 N 份场景，见 §6 G7）。
- **验收点**：选中数量实时正确；全选本页文案准确；异常项不可选；退出有确认。

#### 26. teacher-batch-confirm · 批量审核 · 确认 · 模板 B-确认

- **目标**：在批量不可逆动作前把影响范围说清，并允许先看风险项。
- **关键元素**：返回/关闭 +「批量审核」｜筛选条件 chips（AI 分 90–100/未审核/已评分/全部班级）｜命中 12 份｜影响范围卡（发布 12 份 / 分数<60 共 2 份建议复核 / 含教师评语 4 份）｜危险提示 banner「发布后学生立即可见，且不可撤销」｜底部「先看这 2 份 / 确认发布 12 份」。
- **状态**：四态；提交中（进度「正在处理 3/12」）；部分失败（成功/失败数 + 重试失败项）；全部成功（Toast + 回队列）；离线禁用。
- **交互**：先看风险 → 回选择页筛出风险项；确认 → 逐条提交（进度）；部分失败不阻塞成功项；完成回队列并刷新进度。
- **数据来源**：复用选中提交集合（GET /api/teacher/submissions）+ 逐条 PUT /api/teacher/submissions/:id/review；若语义为「发布」则 PUT /api/teacher/submissions/publish（{submissionIds}，原子：任一不可见整批拒绝）或 POST /api/teacher/submissions/batch-publish（classId×assignmentId 全量）；影响范围（分数<60、含评语）前端从已选数据算。**待确认（P0）**：「审核通过」与「发布」是两个状态（reviewed 学生不可见，published 才可见）；设计稿文案「已发布 12 份/学生立即可见」必须与产品确认走哪一步——若只做审核通过，文案应为「已通过审核，待发布后学生可见」；若含发布，需在确认页明确两步或直接调用 publish。见 §6 G8。
- **验收点**：影响范围数字与选中集合一致；部分失败可重试且不重复处理成功项；危险提示不可被折叠隐藏；无撤销要在文案中说明。

#### 27. teacher-assign-wizard · 布置作业 · 4 步 · 模板 E

- **目标**：碎片时间也能把作业布置完，每步只做一件事。
- **关键元素**：关闭 X +「布置作业」+ 存草稿｜步骤条（1 基本信息 2 选题 3 班级 4 确认）｜第 2 步：搜索 + 题型 chips（编程题/实训题/最近用过）｜选题列表（勾选态）｜已选 summary｜底部「上一步 / 下一步」。
- **状态**：每步校验错误；选题为空（下一步禁用）；班级多选；时间非法（结束早于开始）；提交中；1007 软警告弹窗；草稿恢复提示。
- **交互**：步骤可返回且保留数据；题型 chips 前端过滤（后端无 type 参数，见数据来源）；搜索 300ms 防抖（keyword 已支持）；确认页展示标题/题数/班级/时间；提交成功 → 作业详情；失败可重试。
- **数据来源**：复用 GET /api/teacher/questions?page&pageSize&keyword（分页 + 关键字；无 type 筛选，题型 chips 在已加载页内过滤或逐类型请求后合并，待确认是否补 type 参数）+ GET /api/teacher/classes（schoolId 由 request 拦截器注入）+ POST /api/teacher/assignments（body: title/description/startTime/endTime/allowResubmit/questionIds/classIds/maxAttempts/scorePolicy/answerVisibility；1007 软警告 → confirmWithoutStandardPackage: true 重发）。**待确认**：题目 type 筛选参数（§6 G9）；时间选择用 Vant Picker（无接口）。
- **验收点**：1007 弹窗文案原样展示且确认后能创建；班级只能选可见班级（后端 403 兜底）；步骤返回不丢数据；时间校验双端一致。

#### 28. teacher-questions · 题库 · 模板 A

- **目标**：移动端只做「查题/预览」，编辑明确引导电脑。
- **关键元素**：返回 +「题库」+ 新建｜搜索 + 筛选 chips（全部/编程题/实训题/客观题）｜题目卡（标题/题型 tag/分值/更新时间/使用次数）｜底部说明「移动端仅预览，编辑请在电脑端」。
- **状态**：四态；筛选无结果；新建点击提示「请在电脑端新建」（Toast/说明）；预览加载失败。
- **交互**：卡点预览题干/小题（只读）；新建 → Toast 引导电脑；返回工作台。
- **数据来源**：复用 GET /api/teacher/questions?page&pageSize&difficulty&keyword（返回 type/maxScore/createdAt/_count.subQuestions；无 type 筛选参数，chips 前端过滤已加载页，待确认 §6 G9）；题目详情 GET /api/teacher/questions/:id（预览）；无新增接口。
- **验收点**：只读不出现编辑入口；题型 tag 正确；预览可关闭；不超过 1 次网络请求即可看到列表。

#### 29. teacher-class · 班级详情 · 模板 A

- **目标**：看全班进度与学生个体状态，必要时进审核。
- **关键元素**：返回 +「计算机 2301 班」+ more｜班级统计（45 人 / 已交 38 / 待批 12）｜作业进度列表（3 条）｜学生搜索 + 学生卡列表（姓名/学号/分数/状态）｜底部说明。
- **状态**：四态；搜索无结果；未选班级（本屏入口必带 classId）；学生 >200 窗口化。
- **交互**：作业行 → 审核队列（带 assignmentId）；学生卡 → 审核详情（若有提交）或提示未提交；搜索 300ms 防抖；返回工作台。
- **数据来源**：复用 GET /api/teacher/classes（班级 + _count.studentClasses）+ GET /api/teacher/review-summary?classId=（作业进度行）+ GET /api/teacher/students?classId=（学生列表，无分页）+ GET /api/teacher/review-class/:classId?assignmentId=（分数/状态）。无新增接口；学生列表无分页，>200 需前端窗口化。
- **验收点**：统计与 review-summary 一致；未提交学生状态明确；搜索本地过滤正确；返回保留滚动位置。

#### 30. teacher-profile · 我的（Tab 4） · 模板 B-设置

- **目标**：身份与偏好设置，含「切换到桌面版」兜底。
- **关键元素**：身份卡（周子轩 · 教师 · Deadpan 大学计算机学院）｜通知提醒 switch｜深色主题 switch｜字号大小｜「切换到桌面版」入口｜关于与帮助｜退出登录｜TabBar。
- **状态**：正常；切换主题即时；通知开关无后端时禁用说明；桌面版切换后整页跳转。
- **交互**：主题写 useTheme；字号写 localStorage；切换到桌面版：localStorage ui:layout=desktop 后 location.assign(桌面路由)（整页跳转，避免两套壳 CSS 混用）；退出二次确认。
- **数据来源**：localStorage user/currentSchool/teacherSchools（复用 stores/user.js）+ PUT /api/auth/password（改密，可选，移动端 v1 可只读提示去桌面）；通知偏好无接口（待确认，§6 G10）；无新增接口。
- **验收点**：切桌面版后刷新仍生效；主题/字号持久化；退出清态彻底；设置行 ≥56。

#### 31. teacher-code-unsupported · 手机编辑说明页 · 模板 B-说明

- **目标**：不假装手机能写代码，给出可执行的接力路径。
- **关键元素**：返回 +「编辑标准答案」｜说明卡「手机不提供代码编辑」3 条原因（软键盘/无补全/误触）｜接力方式一：二维码 + 复制链接（10 分钟有效——待确认无 token 接口）｜方式二：导出文件/上传修改后的文件（导出接口无，见数据来源）｜黄色提示 banner｜底部「在电脑上打开」主按钮。
- **状态**：正常；复制成功 Toast；离线（二维码仍显示，提示需联网）；桌面链接失效提示重新生成。
- **交互**：复制链接 → 桌面路由 /exam/teacher/questions/:id/edit（需登录）；二维码前端生成；返回代码屏。
- **数据来源**：前端生成链接（withAppBase）；题目 id 来自路由；**新增/待确认**：免登录接力 token、文件导出/回传接口均不存在（§6 G11）；v1 至少保证「复制链接 + 在电脑登录后编辑」路径可用。
- **验收点**：原因说明三条清晰；复制链接可粘贴打开；不承诺不存在的免登录/导出能力；二维码真机可扫。

### 3.4 管理端（3 屏）

#### 32. admin-home · 管理概览 · 模板 C

- **目标**：出差时确认「系统是否正常、今天有没有异常」，只读。
- **关键元素**：问候 + 管理员身份｜KPI 卡（用户 1,286 / 班级 42 / 在线 318 / 今日评分 1,203）｜系统状态卡（服务正常/评分队列 23/平均响应 186ms）｜今日异常列表（2 条：时间 + 级别）｜快捷入口（组织目录/监控/管理后台）｜只读提示 banner。
- **状态**：四态；KPI 部分不可得（灰显 + 说明）；异常 0（「今日无异常」成功态）；离线。
- **交互**：KPI 卡 → 对应列表/监控；刷新（下拉 + 页头）；只读提示点击「了解原因」展开说明。
- **数据来源**：复用 GET /api/admin/schools、/classes、/teachers、/students（列表长度 → 学校/班级/教师/学生数；用户总数 = 教师 + 学生 + 管理员，管理员数无接口，待确认）+ GET /api/admin/monitor（system/processes/errors）。**新增/待确认（§6 G12）**：在线人数、今日评分、平均响应、今日异常数均无业务接口——v1 降级为：学校/班级/教师/学生数可显示；在线/评分/异常显示「待接入监控接口」或隐藏，不得用假数据。
- **验收点**：只读页面无写操作入口；KPI 数字与列表一致；不可得指标明确标注而非留空。

#### 33. admin-directory · 组织目录 · 模板 A

- **目标**：只读查询学校/班级/教师/学生，支持搜索。
- **关键元素**：标题 + 搜索｜分段（学校/班级/教师/学生）｜列表行（班级名/人数/教师；或用户行）｜只读说明 banner「新增/编辑/导入请在电脑端完成」｜TabBar。
- **状态**：四态；搜索无结果；分段切换加载中（保留旧数据）；数据量大（>200 行窗口化）。
- **交互**：分段切换；行点击静态（不提供编辑）；搜索 300ms 防抖；返回概览。
- **数据来源**：复用 GET /api/admin/schools、/classes（含 school）、/teachers（含 teacherSchools）、/students（含 studentClasses/class）；均为全量数组、无分页（§6 G13：1286 用户全量返回，移动端需窗口化；若后端加分页更佳）。无新增接口。
- **验收点**：只读、无编辑入口；学校/班级关联正确；搜索 300ms 无请求风暴；空态可清除搜索。

#### 34. admin-monitor · 实时监控 · 模板 C-监控

- **目标**：手机上只看关键指标与日志，不在手机上改配置。
- **关键元素**：标题 + 刷新按钮 + 实时 tag（绿点）｜在线人数大数 + 趋势条｜评分队列卡（进行中 23 / 完成 1,180）｜日志流（时间/级别/消息，3–5 条）｜「手机上仅查看，配置请用电脑」提示｜TabBar。
- **状态**：四态；刷新中（按钮 loading）；自动刷新开关（30s，页面可见时）；日志为空（「暂无日志」）；离线（停止轮询 + 离线条）。
- **交互**：刷新；自动刷新开关（role=switch）；日志行可展开看完整文本；离开页面停止轮询；返回概览。
- **数据来源**：复用 GET /api/admin/monitor（system{hostname/platform/cpus/totalMem/freeMem/uptime/loadAvg}、processes[](name/status/cpu/memory/uptime/restarts/pid)、logs（已脱敏字符串）、errors[]）；**待确认（§6 G12）**：在线人数/评分队列/平均响应无接口，v1 用系统负载与 PM2 进程状态替代展示，不伪造业务指标。
- **验收点**：30s 轮询可见时执行、隐藏暂停；日志已脱敏（后端保证）；不提供配置写入口；刷新失败保留旧数据。

### 3.5 平台与状态（3 屏）

#### 35. platform-install · PWA 安装引导 · 模板 B-引导

- **目标**：指导用户把 /m 加到主屏，说明「装与不装的差别」，不强行弹窗。
- **关键元素**：品牌 +「把 Deadpan 装到桌面」｜安装收益 3 条（更快/离线/全屏）｜两种指引（iOS Safari 分享 → 添加到主屏；Android Chrome 菜单 → 安装应用）｜当前平台提示（Android 优先）｜「已安装/稍后」按钮｜无 Tab。
- **状态**：可安装（Android Chrome 触发 beforeinstallprompt）/已安装（navigator.standalone 或 display-mode: standalone）/微信内（提示「在浏览器打开」）/iOS（手动指引）。
- **交互**：安装按钮调用延迟的 beforeinstallprompt.prompt()；稍后关闭；返回官网；复制链接。
- **数据来源**：前端能力检测（beforeinstallprompt、standalone、UA 仅用于微信提示）；无接口；manifest 见 06 §4.1。
- **验收点**：不支持的浏览器不显示假安装按钮；微信内提示准确；已安装态可识别；安装后启动 URL 正确（/exam/m/）。

#### 36. platform-splash · Android 启动屏 · 特殊

- **目标**：冷启动不白屏，品牌 + 版本 + 更新检查的感知。
- **关键元素**：深色品牌启动屏（logo + Deadpan 判题 +「教学评测，随时可用」）｜版本 v2.1.0｜底部「正在检查更新…」+ 进度条｜Android 手势条。
- **状态**：正常（≤1.5s）/检查更新中/发现新版本（提示）/离线（错误提示 + 进入应用）。
- **交互**：3s 后进入角色首页（真实实现由原生启动屏 + Web 首屏完成，不做静态跳转）。
- **数据来源**：Capacitor SplashScreen 插件 + android 启动图资源；版本来自 App.getInfo()（@capacitor/app）或 composables/appVersion.js；更新检查复用 checkForNewVersion（拉 index.html 入口哈希，需绝对 URL）。
- **落地说明**：不落 Vue 路由（设计稿仅作为原生启动屏视觉参考）；Web/PWA 下无此屏（浏览器启动即页面）。验收在 M4 真机冷启动时进行（06 §5.4）。

#### 37. states-overview · 状态体系 · 特殊

- **目标**：把四态（空/骨架/错误/离线）做成同屏样板，供所有列表页对照实现。
- **关键元素**：分段 Tabs：①空态（暂无作业）②加载骨架（3 张卡）③错误态（加载失败 + 重试）④断网态（离线 banner + 灰化列表）｜每态一句使用说明｜无 Tab。
- **状态**：本身就是四态演示；切换 Tab 即时显示对应状态。
- **交互**：分段切换；每态内的按钮可体验（重试回到骨架等，仅演示）。
- **数据来源**：静态 mock，无接口；仅 DEV 环境路由（/m/dev/states，import.meta.env.DEV 守卫），不进入生产导航。
- **验收点**：四态视觉与 04 §3 一致；不随生产构建发布（或仅 dev 构建可见）；每态文案可直接复制到真实页面。


---

## 4. 状态、文案与组件统一表

### 4.1 后端状态 → UI 标签映射（真实枚举，照抄 server/src）

| 来源 | 枚举 | 中文标签 | tag tone | 说明 |
|---|---|---|---|---|
| Submission.status | draft | 草稿 | neutral | 不算已交，不计入统计 |
| Submission.status | submitted | 已提交 · 待评分 | info | AI 未评分/排队中 |
| Submission.status | ai_graded | 已评分 · 待审核 | warning | 教师待审核（review-summary 的 reviewPending） |
| Submission.status | reviewed | 已审核 · 待发布 | accent | 学生仍不可见 |
| Submission.status | published | 已发布 | success | 学生可见分数/评语 |
| 合成 | abnormal | 评分异常 | danger | aiFeedback 为 ABNORMAL_FEEDBACK，需人工 |
| 合成 | not_submitted | 未提交 | neutral/danger | review-class 未交行 status=not_submitted |
| 学生合成 | 未开始 | 未开始 | neutral | now < startTime |
| 学生合成 | 进行中 | 进行中 | info | startTime ≤ now ≤ endTime 且无正式提交 |
| 学生合成 | 已截止未交 | 已截止 · 未交 | danger | now > endTime 且无正式提交 |
| 作业合成 | 进行中 / 未开始 / 已结束 / 已锁定 | 对应文案 | info/neutral/neutral/warning | 由 startTime/endTime/locked 推导（桌面同口径） |
| 业务码 | 1001 / 1002 / 1003 / 1004 / 1007 / 1403 / 1404 | 见 04 §3.4 | — | 400/403/404/409/413 语义 |

### 4.2 按钮文案规范

| 场景 | 文案 | 禁止 |
|---|---|---|
| 进入作答 | 开始作答 / 继续作答 | 「进入」「去」 |
| 交卷 | 确认交卷 / 继续作答 | 「确定」 |
| 审核 | 审核通过 / 保存评语 / 改分 | 「提交」裸文案 |
| 批量 | 确认发布 12 份 / 先看这 2 份 / 审核通过 (3) | 「确定」 |
| 布置 | 下一步 / 确认布置 / 存草稿 | 「完成」 |
| 接力 | 复制链接 / 在电脑上打开 | 「去电脑」 |
| 危险 | 退出登录 / 切换账号 / 解锁作业 | 直接执行无确认 |

### 4.3 空态/错误文案模板

| 类型 | 标题 | 说明 | 主操作 |
|---|---|---|---|
| 列表无数据 | 还没有作业 | 教师布置后会出现在这里 | 有权限：去布置 |
| 筛选无结果 | 没有符合条件的作业 | 试试清空筛选条件 | 清除筛选 |
| 详情不存在 | 内容不存在或已被删除 | 可能已被教师删除 | 返回上一页 |
| 无权限 | 无权查看此内容 | 当前身份：李明 · 学生 | 回到我的首页 |
| 网络错误 | 网络连接失败 | 请检查网络后重试 | 重试 |
| 服务错误 | 服务暂时不可用 | 错误编号 ERR-... | 重试 |
| 提交失败 | 提交失败 | 已保存本地草稿，可重试 | 重试提交 |

---

## 5. 屏间跳转与深链约定

| 场景 | 规则 |
|---|---|
| 设计稿 data-goto | 与 SCREENS.md §4 的导航列一致；生产用 router.push |
| 深链 | 所有 /m 路由可直达（刷新/扫码/分享）；未登录 → 登录后回跳原地址（query redirect） |
| 二维码接力 | 编码桌面路由（/exam/...），不带 token；打开后登录，登录成功回跳原地址 |
| Sheet 深链 | student-answer-sheet、student-submit-confirm 等 Sheet 不单独设路由；需要直达时用 query（如 ?sheet=sheet）或组件状态 |
| 返回栈 | 见 04 §1.3；Tab 根返回不退出应用 |
| 外部链接 | 站点内链接用 withAppBase；外链用 target=_blank rel=noopener（移动端可复制链接） |

### 5.1 设计稿 37 屏 → 计划路由（生产实现细节见 07 §5）

| 屏 | 计划路由 | 屏 | 计划路由 |
|---|---|---|---|
| public-landing | /m/landing | teacher-home | /m/teacher/home |
| public-login | /m/login | teacher-assignments | /m/teacher/assignments |
| public-doc | /m/doc | teacher-assignment-detail | /m/teacher/assignments/:id |
| error-404 | /m/error/404 | teacher-review-queue | /m/teacher/review |
| error-403 | /m/error/403 | teacher-review-detail | /m/teacher/review/:submissionId |
| error-500 | /m/error/500 | teacher-review-code | /m/teacher/review/:submissionId/code |
| student-home | /m/student/home | teacher-review-diff | /m/teacher/review/:submissionId/diff |
| student-assignments | /m/student/assignments | teacher-batch-select | /m/teacher/review/batch |
| student-assignment-detail | /m/student/assignments/:id | teacher-batch-confirm | /m/teacher/review/batch/confirm |
| student-answer-objective | /m/student/answer/:id（q 参数选题） | teacher-assign-wizard | /m/teacher/assignments/new |
| student-answer-code | /m/student/answer/:id?q=（同一页，题型渲染不同） | teacher-questions | /m/teacher/questions |
| student-answer-sheet | /m/student/answer/:id?sheet=sheet（Sheet 状态） | teacher-class | /m/teacher/classes/:id |
| student-submit-confirm | /m/student/answer/:id?sheet=confirm | teacher-profile | /m/teacher/profile |
| student-assignment-done | /m/student/assignments/:id/done | teacher-code-unsupported | /m/teacher/code-unsupported |
| student-scores | /m/student/scores | admin-home | /m/admin/home |
| student-score-detail | /m/student/scores/:assignmentId | admin-directory | /m/admin/directory |
| student-profile | /m/student/profile | admin-monitor | /m/admin/monitor |
| platform-install | /m/install | platform-splash | 不落路由（原生启动屏） |
| states-overview | /m/dev/states（仅 DEV） | — | — |

---

## 6. API 复用 / 新增缺口汇总（handoff 必须同步给后端）

**复用现有接口即可支撑的屏（30 屏）**：1–3、6–14、17–24、27（大部分）、28、29、30、31（部分）、33、34。核心复用接口：auth/login；student/assignments、assignments/:id、draft、submit、scores、profile、project 提交；teacher/pending-summary、assignments、assignments/:id、assignments/:id/lock、review-summary、review-class/:classId、submissions、submissions/:id、submissions/:id/review、submissions/:id/score、submissions/publish、batch-review、batch-publish、project-submission/:id、questions、classes、students（按需）；admin schools/classes/teachers/students/monitor；auth/password。

**需要新增或确认的能力（按屏）**

| 编号 | 缺口 | 受影响屏 | 建议 |
|---|---|---|---|
| G1 | 学生成绩的学期均分/班级排名/超过百分比 | 15 | 新增聚合接口或在 scores 返回 rank/avg（需明确口径与隐私边界）；v1 降级不显示排名 |
| G2 | 成绩详情分数构成（客观/编程/过程分）与班级均分 | 15、16 | scores 增加 questionType 或构成字段；班级均分需新接口；v1 隐藏 |
| G3 | 作业编辑/删除接口 | 19 | 当前仅 lock；要支持左滑编辑/删除需补 PUT/DELETE，删除需软删 + 二次确认 |
| G4 | 催交通知接口与渠道 | 20 | 需新增 POST /teacher/assignments/:id/urge + 站内信/推送；无渠道前 v1 改为复制提醒文案 |
| G5 | 「打回」语义（退回学生重做/标记不通过） | 22 | 后端状态机无打回；需产品定义；v1 按钮改为「仅保存评语」或隐藏 |
| G6 | 通用题/编程题 AI 评语结构化分项 | 21、22 | 当前只有实训题 breakdown；通用题仅整段文本；移动端分项 UI 需降级或后端结构化 |
| G7 | 按 submissionIds 的批量审核接口 | 25、26 | 现有 batch-review 粒度是 classId×assignmentId 全量；要「选中 N 份」需新接口或前端逐条（v1 逐条并发 5） |
| G8 | 「审核通过」vs「发布」状态语义与文案 | 21、22、26 | reviewed 学生不可见、published 才可见；确认页文案必须按实际调用的接口改写；产品需拍板 |
| G9 | 题库 type 筛选参数 | 27、28 | 现有 questions 只支持 keyword/difficulty；题型 chips 需后端加 type 或前端仅过滤当前页（体验差） |
| G10 | 通知偏好（站内/推送） | 17、30 | 无接口亦无推送通道；v1 隐藏或只读说明「暂未开放」 |
| G11 | 免登录接力 token / 文件导出回传 | 11、31 | 无接口；v1 仅复制链接（需登录）；不要承诺 10 分钟有效等未实现能力 |
| G12 | 管理端在线人数/今日评分/平均响应/今日异常数 | 32、34 | 无业务聚合接口；需新增 admin/overview 或扩展 monitor；v1 不显示假数据 |
| G13 | 管理端列表分页 | 33 | 全量数组（用户 1286）；建议服务端分页；v1 前端窗口化 |
| G14 | 错误编号 requestId | 6、32 | 后端 500 无 requestId；前端生成或后端补 |

**缺口处理原则**：① 不编造接口；② 缺口屏在 M1–M3 先按「可降级形态」交付（隐藏/禁用/引导电脑），本表是 M4 前与后端对齐的输入；③ 任何降级必须在屏内可见说明，不能静默失效。

---

## 7. 验收与自检

### 7.1 逐屏验收（每屏 6 项）

- [ ] 令牌：无硬编码色值/圆角/时长；颜色来自语义令牌（02 §5 命令）
- [ ] 浅/深主题：切 ?theme=dark 无亮色孤岛、对比度 ≥4.5:1（例外仅代码面板与二维码）
- [ ] 触控：可点元素 ≥44×44，相邻 ≥8；图标按钮 aria-label
- [ ] 四态：loading/empty/error/offline 全部可见（DevTools 断网 + mock 失败）
- [ ] 数据契约：字段名与 §3 数据来源一致；不显示后端未返回的字段（尤其均分/排名/在线数）
- [ ] 导航：data-goto / 生产路由可达，返回栈正确，深链刷新可用

### 7.2 设计稿阶段命令

~~~bash
# 静态服务（仓库根目录）
python3 -m http.server 8123 --bind 127.0.0.1

# 打开 Gallery 对照 37 屏（浅/深、iOS/Android 切换）
open http://127.0.0.1:8123/docs/mobile-app/preview/index.html

# 单屏截图（注意参数必须等号形式）
node docs/mobile-app/preview/tools/shot.mjs teacher-review-queue docs/mobile-app/preview/shots/teacher-review-queue.png
node docs/mobile-app/preview/tools/shot.mjs teacher-review-queue docs/mobile-app/preview/shots/teacher-review-queue-dark.png --theme=dark
node docs/mobile-app/preview/tools/shot.mjs teacher-review-queue docs/mobile-app/preview/shots/teacher-review-queue-360.png --width=360 --height=800

# 37 屏齐备性检查（screens 目录应有 37 个正式屏 + 2 个模板/样板）
ls docs/mobile-app/preview/screens/*.html | grep -v '_' | wc -l
~~~

### 7.3 handoff 交付清单

- [ ] 37 屏设计稿与 SCREENS.md 一致（task-1/2/3 产出，评审 task-6 核对）
- [ ] 本文 §3 的 6 行规范与设计稿逐屏对照无缺项
- [ ] §6 缺口表已同步给 Lead/后端，标注哪些屏走降级形态
- [ ] 07 的 Vue 文件映射与本文计划路由一致
- [ ] 深色/Android/360 截图证据存入 docs/mobile-app/preview/shots/（M1 后由实现方补）

