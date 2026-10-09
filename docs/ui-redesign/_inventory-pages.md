# 页面清单与逐页现状盘点（UI 重设计输入）

> 分支 `feat/ui-redesign` · worktree `Exam-DeepSeek-ui` · 盘点日期 2026-10-09
> 方法：通读 `client/src/router/index.js`、`client/src/views/**/*.vue`（31 个 .vue）、`client/src/components/**`、`client/src/style.css`、`client/src/App.vue`。
> 本文件**只记录现状证据**（行号 / 计数 / 代码形态），不含改造方案。除本文件外未修改任何文件。
> 配套：[`00-design-brief.md`](./00-design-brief.md)、[`02-design-tokens.md`](./02-design-tokens.md)、[`02-design-tokens.css`](./02-design-tokens.css)。

---

## 0. 总量速览

| 项 | 数量 |
|---|---|
| 路由记录（`routes` 数组内条数） | **29**（叶子页 24 + 重定向 3 + Layout 容器 3，另有通配重定向 1） |
| 唯一页面组件（.vue 页面文件，含 3 个 Layout） | **31** |
| 可独立访问的叶子页面 | **24** |
| 入口 / 布局骨架 | 5（login、doc、admin、teacher、student） |
| 模板行数合计 / 脚本行数合计（views） | 约 1 930 / 约 4 700 |
| 共享组件 | 4（DataTable 323、RichEditor 276、ProjectZipUploader 170、CodeEditor 124） |
| 复用 DataTable 的页面 | **13** |
| 含 `<a-modal>` 的页面 | **13** |
| 使用 `var(--token)` 的文件 | 19 / 31（12 个文件 0 引用） |
| 含 `aria-*` 的 .vue 文件 | **0 / 31** |

---

## A. 路由总表

路由文件：`client/src/router/index.js`（92 行）。`createWebHistory('/exam/')`，全局 `beforeEach` 以 `localStorage.token/user` 做前置守卫，按 `to.meta.role` 精确匹配角色（`super_admin` / `teacher` / `student`），不匹配回 `/login`。

| # | path | name | 组件 | 角色 | 用途（一句话） |
|---|---|---|---|---|---|
| 1 | `/login` | — | `views/Login.vue` | 公开 | 用户名/密码登录，含「同一学号属于多所学校」的二次择校分支 |
| 2 | `/admin` | — | `admin/Layout.vue` | super_admin | 超管骨架：160px 深色侧栏 + 52px 毛玻璃顶栏 + `router-view` |
| 3 | `/admin` (redirect) | — | → `/admin/schools` | super_admin | 默认落地页 |
| 4 | `/admin/schools` | — | `admin/Schools.vue` | super_admin | 学校名录（数据源：教育部全国高校名单），只读 + 前端分页 |
| 5 | `/admin/classes` | — | `admin/Classes.vue` | super_admin | 班级 CRUD、绑定学校与授课教师 |
| 6 | `/admin/teachers` | — | `admin/Teachers.vue` | super_admin | 教师 CRUD、多校归属、重置密码 |
| 7 | `/admin/students` | — | `admin/Students.vue` | super_admin | 学生新增、批量分班（多选班级） |
| 8 | `/admin/monitor` | — | `admin/Monitor.vue` | super_admin | 服务器监控：系统信息 / PM2 进程表 / 错误日志，30s 自动刷新 |
| 9 | `/admin/ai-config` | — | `admin/AiConfig.vue` | super_admin | DeepSeek Key/模型/BaseURL/评分并发配置 + 连接测试 + 耗时预估表 |
| 10 | `/teacher` | — | `teacher/Layout.vue` | teacher | 教师骨架；额外承载「我的信息/改密」「切换单位」「AI 评分流程」3 个模态 |
| 11 | `/teacher` (redirect) | — | → `/teacher/classes` | teacher | 默认落地页 |
| 12 | `/teacher/classes` | — | `teacher/Classes.vue` | teacher | 班级 CRUD、加入教学团队、跨校迁移（switch-school） |
| 13 | `/teacher/students` | — | `teacher/Students.vue` | teacher | 按班级看学生；单个新增 + Excel 批量导入 + 导入结果报告 |
| 14 | `/teacher/questions` | — | `teacher/Questions.vue` | teacher | 题库列表；新增下拉分「编程题 / 实训题(BETA)」，编辑按类型分流 |
| 15 | `/teacher/assignments` | — | `teacher/Assignments.vue` | teacher | 作业列表 + 锁定开关；布置作业为 3 步向导（选题→选班→设时间） |
| 16 | `/teacher/questions/new/project` | `TeacherQuestionProjectNew` | `teacher/ProjectQuestionEdit.vue` | teacher | 新建实训题：题目描述/评分标准模态 + zip 标准包 + VSCode 风格只读预览 |
| 17 | `/teacher/questions/:id/edit-project` | `TeacherQuestionProjectEdit` | `teacher/ProjectQuestionEdit.vue` | teacher | 编辑实训题（同上，`isEdit`） |
| 18 | `/teacher/questions/new` | — | `teacher/QuestionEdit.vue` | teacher | 新建编程/客观题；含 AI 试卷（docx/xlsx）解析、AI 生成标答 |
| 19 | `/teacher/questions/:id/edit` | — | `teacher/QuestionEdit.vue` | teacher | 编辑题目（左编辑 / 右预览 / 参考答案 Monaco 三栏） |
| 20 | `/teacher/review` | — | `teacher/Review.vue` | teacher | 评分审核汇总表（按作业×班级），Socket `graded` 实时刷新、导出 Excel |
| 21 | `/teacher/review/class/:classId` | — | `teacher/ReviewClass.vue` | teacher | 班级成绩明细：行内改分、筛选、一键审核/发布全班、导出、实时刷新 |
| 22 | `/teacher/teams` | — | `teacher/Teams.vue` | teacher | 教学团队列表：创建 / 管理 / 退出 |
| 23 | `/teacher/teams/:id` | — | `teacher/TeamEdit.vue` | teacher | 团队成员与班级维护（选择即防抖自动保存 + 取消选择弹确认） |
| 24 | `/teacher/review/:id` | — | `teacher/ReviewDetail.vue` | teacher | 单份提交阅卷：左侧题号导航 + 流式题目 + 只读 Monaco + 逐题 AI/教师评分 |
| 25 | `/teacher/review/project/:submissionId` | `TeacherProjectReviewNew` | `teacher/ProjectReviewNew.vue` | teacher | 实训题阅卷：双源文件树（学生提交 / 标准包）+ 底部 AI/教师评分面板 |
| 26 | `/student` | — | `student/Layout.vue` | student | 学生骨架（含我的信息/改密模态） |
| 27 | `/student` (redirect) | — | → `/student/assignments` | student | 默认落地页 |
| 28 | `/student/assignments` | — | `student/Assignments.vue` | student | 作业列表：搜索 + 4 状态筛选 + 行点击进入（未开始/过期不可进） |
| 29 | `/student/assignments/:id` | — | `student/Submit.vue` | student | 考试/练习答题主界面：题号导航 + 代码/客观题 + 草稿自动保存 + 倒计时强交 |
| 30 | `/student/assignments/:assignmentId/project/:questionId` | `StudentProjectQuestion` | `teacher/ProjectQuestionEdit.vue`（`props:{mode:'student'}`） | student | 实训题作答：上传工程 zip → VSCode 风格只读查看 → 提交 |
| 31 | `/student/scores` | — | `student/Scores.vue` | student | 我的成绩（作业 / 提交次数 / 分数，练习模式显示最高分） |
| 32 | `/doc` | — | `views/Doc.vue` | 公开 | 教师使用文档站：左侧 Anchor 目录 + 交互式 Steps 章节 + 截图灯箱 |
| 33 | `/:pathMatch(.*)*` | — | → `/login` | 公开 | 兜底重定向 |

**路由层可注意的事实**：
- 只有 4 条路由带 `name`（两个实训题编辑路由、一个实训题学生路由、项目阅卷路由），其余靠 path 硬编码跳转；`router.push` 字符串路径散布在 12 个页面中。
- 同一组件 `ProjectQuestionEdit.vue` **同时服务教师与学生两种角色**（`props.mode`），`/student/...` 下复用教师目录文件。
- 3 个 Layout 分别声明 `meta.role`；子路由无独立 meta。

---

## B. 逐页现状

**读法**：LOC = 文件总行数（tpl/scr/sty = template / script / style 三块行数）。「令牌」= 该文件 `var(--...)` 引用的 `style.css` 旧令牌；「无」表示 0 引用。

### B1. `views/Login.vue` — 登录页 ｜ LOC 148（tpl 46 / scr 55 / sty 44，scoped）

- **用途**：账号密码登录；若接口返回 `code === 1002`（学号存在于多校），切换为「选择学校」视图。
- **template 自上而下**：`.login-page`（100vh 居中）→ `.login-card`（width 380px）→ `logo.svg` 56×56 → `<h1>` Deadpan 判题（40px）→ 副标题 → 分支①多校选择 `<a-form>`（`a-select` + 确认/返回）／分支②`<a-form>`（用户名 `a-input`、密码 `a-input-password`、登录 `a-button block size=large`）→ `.login-error` 错误行。
- **AntDV 组件**：`a-form`×2、`a-form-item`×6、`a-input`、`a-input-password`、`a-select`、`a-select-option`、`a-button`×3。
- **关键交互**：`@pressEnter` 提交；`loading` 态；多校二次提交复用同一接口带 `schoolCode`；成功后按 role 跳 `/admin` 或 `/teacher`、`/student`。
- **数据密度**：表单 2 字段（多校分支 1 字段）；无表格。
- **令牌 / 自定义类**：`--canvas-parchment`、`--ink-muted`；自定义类 `.login-*`；1 处硬编码色 `#ff3b30` + 1 处内联 style。
- **a11y**：3 个控件仅用 `placeholder`，无 `<label>`、无 `aria-*`。

### B2. `views/Doc.vue` — 教师使用文档站 ｜ LOC 1062（tpl 204 / scr 318 / sty 245，scoped）

- **用途**：公开的教师使用手册（非登录可见），11 个章节，含 4 组交互式 Steps。
- **template 自上而下**：`.doc-layout` → `header.doc-header`（logo + 标题 + 「前往登录」）→ `.doc-body`：左 `aside.doc-sidebar`（`a-anchor`，桌面端）＋ `main.doc-main`（`<section id="intro">` Steps 简介、`sections2to5` `v-html` 静态章节、题库管理章节（含 4 张 `doc-img` 截图 + Steps）、实训题章节、`sections7`、AI 评分流程章节（Steps）、性能优势章节、`sections9to10`）→ 移动端 `a-float-button` + `a-drawer`（目录）→ `Teleport` 图片灯箱。
- **AntDV 组件**：`a-anchor`×2、`a-button`×10、`a-drawer`、`a-float-button`、`a-steps`×3、`a-tag`×2。
- **关键交互**：Steps 上一步/下一步/重新浏览（4 处重复代码块）；`onMainClick` 委托打开灯箱；`window resize` 切换移动端目录（`showMobileToc`）。
- **数据密度**：纯内容页；`anchors` 目录项约 11 条；图片 100% 宽自适应。
- **令牌 / 自定义类**：仅 `--ink-muted`；自定义 `.doc-*`、`.lightbox-*`；**19 处硬编码色值**；**6 处 `!important`**；模板内 7 处内联 `style`；唯一带 `@media`（992px + 768px）的页面之一。
- **a11y**：图片均有 `alt`；`v-html` 注入 3 处静态 HTML；无 `aria-*`；灯箱无键盘 ESC 关闭。

### B3. `views/admin/Layout.vue` — 超管布局 ｜ LOC 100（tpl 43 / scr 25 / sty 29，scoped）

- **用途**：admin 区骨架。
- **template**：`a-layout` → `a-layout-sider`（`:width="160"`、`breakpoint="lg"`、深色主题、logo 双行文字 + 6 个 `a-menu-item`）→ `a-layout-header.topbar`（折叠触发器 + `a-dropdown` 用户区：`a-avatar` 首字母 + 姓名 + caret）→ `a-layout-content.content`（`transition name="tab-fade"` 包裹 `router-view`）。
- **AntDV 组件**：`a-layout`×2、`a-layout-sider/header/content`、`a-menu`×2、`a-menu-item`×7、`a-dropdown`、`a-avatar`；图标 10 个。
- **关键交互**：菜单点击 `router.push` 并在 <992px 时自动折叠；`window.addEventListener('resize')` 直接注册（**无移除、无节流**，第 56 行）；退出登录走 `Modal.confirm`。
- **数据密度**：菜单 6 项。
- **令牌 / 自定义类**：`--blue/--ink/--ink-muted/--canvas-parchment/--font-display/--radius-sm`；自定义 `.layout/.logo*/.topbar/.trigger/.user-*/.content`；1 处硬编码 `#fff`；`:deep()` 2 处；`@media(max-width:768px)` 一段。
- **a11y**：`.trigger` 是裸图标点击（非 button、无 `aria-label`）；用户区 `<div>` 可点。

### B4. `views/admin/Schools.vue` — 学校管理 ｜ LOC 83（tpl 28 / scr 28 / sty 24，scoped）

- **用途**：展示教育部高校名单（只读，无增删改）。
- **template**：`.page` → `.page-header`（`<h2>` + `.page-desc` 共 N 所）→ `DataTable`（`clientPagination`、`showSizeChanger`、20/50/100/200、`showTotal`）→ `#bodyCell` 对 province/city/level/code 做空值兜底 `—`。
- **AntDV 组件**：无直接 antd 标签（全部经 DataTable 间接使用 `a-table/a-card/a-pagination`）。
- **关键交互**：进入即 `GET /admin/schools` 全量拉取，**前端切片分页**；无搜索、无排序、无详情。
- **数据密度**：5 列（院校代码 140 / 学校名称 220 / 省份 120 / 城市 120 / 层次 80）；默认 pageSize 50。
- **令牌 / 自定义类**：`--ink-muted`；`.page/.page-header/.page-desc`（与其他 14 页重复的同一份 CSS）。
- **a11y**：无 aria；表头排序提示由 DataTable 默认中文 locale 提供。

### B5. `views/admin/Classes.vue` — 班级管理（超管） ｜ LOC 130（tpl 47 / scr 60 / sty 20，scoped）

- **用途**：班级 CRUD + 绑定学校 + 多选教师。
- **template**：`.page-header`（`<h2>` + `a-button` 新增班级）→ `DataTable`（`clientPagination` pageSize 20）→ 编辑/删除操作列（`a-space` + `a-popconfirm`）→ `a-modal`（`:width="1040"`、`wrap-class-name="form-modal"`）内 `a-form`：班级名称 / 所属学校 / 指定教师（multiple）。
- **AntDV 组件**：`a-button`×3、`a-form`、`a-form-item`×3、`a-input`、`a-modal`、`a-popconfirm`、`a-select`×2、`a-select-option`×2、`a-space`。
- **关键交互**：新增/编辑复用同一 Modal（`isEdit` + `modalTitle`），打开时并行 `loadOptions()` 拉学校与教师；删除用 Popconfirm；成功无 `message` 反馈（admin 三页均无）。
- **数据密度**：表格 4 列（名称 180 / 学校 200 / 创建时间 170 / 操作 160）；表单 3 字段。
- **令牌 / 自定义类**：**无令牌引用**；`.page/.page-header`；0 硬编码色、0 内联样式。
- **a11y**：Modal 内 label 3/3；无 aria。

### B6. `views/admin/Teachers.vue` — 教师管理 ｜ LOC 163（tpl 49 / scr 90 / sty 21，scoped）

- **用途**：教师 CRUD + 多校归属 + 重置密码 + 自删保护。
- **template**：`.page-header` → `DataTable` → 操作列（编辑 / 重置密码 popconfirm / 删除 popconfirm，删除按钮在「本人」时隐藏）→ `a-modal width="560"`：工号（编辑时 disabled）/ 姓名 / 隶属学校（`a-select` 搜索+选中即加 tag，下方 `a-tag closable` 列表）。
- **AntDV 组件**：`a-button`×4、`a-form`、`a-form-item`×3、`a-input`×2、`a-modal`、`a-popconfirm`×2、`a-select`、`a-space`、`a-tag`×2。
- **关键交互**：**自研「多选 tag 输入」**（`availableSchoolOptions` 过滤已选 + `addSchool/removeSchool`）；重置密码与删除用 `message`（与 Classes/Students 页不一致）；`currentUserId` 直接同步读 `localStorage`。
- **数据密度**：表格 5 列（工号 130 / 姓名 120 / 隶属学校 200 / 创建时间 170 / 操作 100）；表单 3 字段。
- **令牌 / 自定义类**：**无令牌引用**；`.page/.page-header/.school-tags`；1 处内联样式。
- **a11y**：label 3/3；`a-tag` 关闭按钮无可读文本；无 aria。

### B7. `views/admin/Students.vue` — 学生管理（超管） ｜ LOC 100（tpl 37 / scr 40 / sty 20，scoped）

- **用途**：新增学生、多选班级归属。
- **template**：`.page-header`（新增学生）→ `DataTable`（班级列 `a-tag v-for`）→ `a-modal`（无 width，默认 520）：学号 / 姓名 / 班级（multiple）。
- **AntDV 组件**：`a-button`、`a-form`、`a-form-item`×3、`a-input`×2、`a-modal`、`a-select`、`a-select-option`、`a-tag`。
- **关键交互**：`openAdd` 时才拉班级列表；提交后无成功提示。
- **数据密度**：表格 4 列（学号 130 / 姓名 120 / 班级 180 / 创建时间 170）；表单 3 字段。
- **令牌 / 自定义类**：**无令牌引用**；`.page/.page-header`；0 硬编码、0 内联。
- **a11y**：label 3/3；无 aria；长班级名 `a-tag` 无省略策略。

### B8. `views/admin/Monitor.vue` — 服务器监控 ｜ LOC 124（tpl 52 / scr 47 / sty 22，scoped）

- **用途**：系统信息 / PM2 进程 / 错误日志三卡片，30s 轮询。
- **template**：`.page-header`（自动刷新 `a-tag` + `a-switch` + 手动刷新按钮）→ `a-card`「🖥️ 系统信息」（`a-row :gutter="[16,8]"` + 7 个 `a-col`，`.label/.value` 双行）→ `a-card`「📦 PM2 进程」（`a-table` 7 列 + `a-empty`）→ `a-card`「📋 近期错误日志」（`.log-viewer` 深色 `pre`，`max-height:500px`）。
- **AntDV 组件**：`a-badge/a-button/a-card×3/a-col×7/a-empty×2/a-row/a-space/a-switch/a-table/a-tag`。
- **关键交互**：`setInterval 30s`（受开关控制，`onUnmounted` 清理）；进程状态用 `a-badge`；内存低于 15% 时 `.mem-low` 变红。
- **数据密度**：系统信息 7 个键值对；PM2 表 7 列；日志 `pre` 直出（无虚拟滚动/搜索/高亮）。
- **令牌 / 自定义类**：**无令牌引用**；**5 处硬编码色**（`#1e1e1e/#d4d4d4/#999/#333/#ff4d4f`）；`:deep()` 1 处。
- **a11y**：`a-switch` 无可读标签；日志无 `aria-live`；无 aria。

### B9. `views/admin/AiConfig.vue` — AI 配置 ｜ LOC 239（tpl 83 / scr 143 / sty 6，scoped）

- **用途**：DeepSeek API Key / 模型 / BaseURL / 评分并发读写，连接测试与耗时预估。
- **template**：`.page-header` → 三张 `a-card size="small"`：**模型配置**（`a-form layout="vertical"`，API Key `a-input-password`、模型 `a-select`、BaseURL `a-input`、保存 + 测试连接）／**AI 评分并发**（`a-select` 1/8/16/32/64/128 + 生效说明）／**评分耗时预估**（说明 + `a-table` 6 行 × 5 列 + `a-alert` 负载等级）。
- **AntDV 组件**：`a-alert/a-button×2/a-card×3/a-form×2/a-form-item×6/a-input/a-input-password/a-select×2/a-space/a-table`。
- **关键交互**：并发数 `@change` 即自动 PUT 保存（无二次确认）；测试连接用 `Modal.success/error` 展示延时；预估表按并发实时计算；`rowClassName` 高亮当前并发行。
- **数据密度**：表单 3+1 字段；预估表 5 列 × 6 行。
- **令牌 / 自定义类**：`--ink-muted`、**`--ink-base`（`style.css` 中不存在，判定为死令牌）**；第二段**非 scoped** `<style>` 定义 `.concurrency-active-row`（1 处 `!important`）；8 处内联样式（`max-width:600px`、`width:380px`、`width:220px`）。
- **a11y**：6 个 form-item 均有 label；`a-table` 无 caption；无 aria。

### B10. `views/teacher/Layout.vue` — 教师布局 ｜ LOC 331（tpl 102 / scr 79 / sty 141，scoped）

- **用途**：teacher 区骨架，并承载 3 个全局模态（我的信息/改密、AI 评分流程、切换单位）。
- **template**：`a-layout`（sider 160px + 6 菜单项）→ `topbar`（折叠触发器 + 用户区下拉：我的信息 / 切换单位 `a-sub-menu` / AI 评分流程 / 使用文档 / 退出登录）→ `content`（tab-fade `router-view`）→ `a-modal`「我的信息」（`a-avatar` 56 + 3 行 key-value + `a-divider` + `a-collapse` 内改密 3 字段）→ `a-modal`「AI 评分流程」（`:width="1040"`，`a-steps` + 上一步/下一步/完成）。
- **AntDV 组件**：`a-layout×2/a-layout-sider|header|content/a-menu×2/a-menu-item×11/a-sub-menu/a-dropdown/a-avatar×2/a-divider/a-collapse/a-collapse-panel/a-form/a-form-item×3/a-input-password×3/a-button×4/a-modal×2/a-steps`。
- **关键交互**：`window.addEventListener('resize')`（第 116 行，无清理）；切换单位改写 store；流程模态是 5 步向导；改密后模态常驻不关。
- **数据密度**：菜单 6 项 + 下拉 5 项；改密表单 3 字段。
- **令牌 / 自定义类**：`--blue/--ink/--ink-muted/--canvas-parchment/--font-display/--radius-sm`；1 处硬编码 `#fff`、1 处模板内联 `#1677ff`；`:deep()` 3 处；`@media(max-width:768px)` **重复出现两次**。
- **a11y**：触发器与用户区均为 div/图标点击；模态无 `aria-labelledby`；无 aria。

### B11. `views/teacher/Classes.vue` — 班级管理（教师） ｜ LOC 170（tpl 57 / scr 90 / sty 20，scoped）

- **用途**：教师班级 CRUD、加入教学团队、跨校迁移。
- **template**：`.page-header`（新增班级）→ `DataTable clientPagination`（名称 + 团队 tag、学校、人数、创建时间、操作）→ `a-modal width="1040"`（班级名称 + 指定教学团队 multiple）→ 第二个 `a-modal width="520"`「切换学校」（`<p>` + `a-tag` 拼「旧校 → 新校」+ `a-select`）。
- **AntDV 组件**：`a-button×4/a-form/a-form-item×2/a-input/a-modal×2/a-popconfirm/a-select×2/a-select-option/a-space/a-tag×3`。
- **关键交互**：团队班级全行禁用（`isTeamClass`）；`message.warn/success` 反馈；`loadTeams()` 在打开 Modal 时才拉；删除后刷新。
- **数据密度**：表格 5 列（名称 200 / 学校 200 / 人数 70 / 时间 170 / 操作 160）；表单 2 字段 + 迁移 1 字段。
- **令牌 / 自定义类**：**无令牌引用**；第二弹窗内 1 处 `#888` + 大量内联 `style`（`line-height:1.8`、`text-align:center`、`font-size:16px`）。
- **a11y**：label 2/2；「切换学校」弹窗的信息靠视觉箭头表达；无 aria。

### B12. `views/teacher/Students.vue` — 学生管理（教师） ｜ LOC 418（tpl 148 / scr 240 / sty 27，scoped）

- **用途**：按班级看学生；单个新增/编辑；Excel 批量导入 + 结果报告。
- **template**：`.page-header`（单个新增 / 批量导入，未选班时 disabled）→ `.page-toolbar`（班级 `a-select` 必选 + 本班人数 + 关键词 `a-input` + 团队只读 tag）→ `DataTable`（`v-if filterClass`）／否则整块 `a-empty`「请先选择班级」→ `a-modal` 编辑学生（学号可编辑条件 + 姓名 + 班级 + 重置密码 Popconfirm）→ `a-modal width="520"` 批量导入（`a-spin` + `a-alert` 格式要求 + 下载模板 + `a-upload-dragger`）→ `a-modal width="520"` 导入结果（成功/警告/错误三分支着色）。
- **AntDV 组件**：`a-alert/a-button×6/a-empty/a-form/a-form-item×4/a-input×3/a-modal×3/a-popconfirm×2/a-select×2/a-select-option×2/a-space×2/a-spin/a-tag×4/a-upload-dragger`。
- **关键交互**：关键词 300ms 防抖 watch；前端用 `xlsx` 解析 Excel 并做表头/字段校验，生成 `warnings/errors` 分类报告；`beforeUpload` 返回 false 阻断自动上传；`tmp_` 临时学号与「待补全」标记；改学号需 `Modal.confirm` 二次确认。
- **数据密度**：表格 6 列（学号 150 / 姓名 120 / 学校 180 / 班级 150 / 时间 170 / 操作 160）；编辑表单 4 字段；导入说明 3 条规则。
- **令牌 / 自定义类**：`--blue/--ink-base（死令牌）/--ink-muted`；`.page/.page-header/.page-toolbar`；**12 处模板内联色值 + 27 处内联样式**。
- **a11y**：label 4/4；`a-upload-dragger` 无键盘说明；导入结果无 `role="alert"/aria-live`。

### B13. `views/teacher/Questions.vue` — 题库管理 ｜ LOC 129（tpl 45 / scr 61 / sty 20，scoped）

- **用途**：题库列表；新增走下拉（编程题 / 实训题 BETA）。
- **template**：`.page-header`（`a-dropdown` + `a-menu` 两项）→ `DataTable`（服务端分页 `:total` + `@page-change`）→ 难度 tag（绿/橙/红）、类型 tag（紫/蓝）、操作列（编辑 / 删除 popconfirm）。
- **AntDV 组件**：`a-button×3/a-dropdown/a-menu/a-menu-item×2/a-popconfirm/a-space/a-tag×3`。
- **关键交互**：`editQuestion` 按 `record.type` 分流到两个编辑路由；删除后重新 `fetch`（无乐观更新）。
- **数据密度**：表格 6 列（标题 250 / 类型 80 / 难度 70 / 满分 70 / 创建时间 170 / 操作 160）。
- **令牌 / 自定义类**：**无令牌引用**；0 硬编码、0 内联。
- **a11y**：无 aria；类型/难度靠颜色 + 文案（文案本身可读）。

### B14. `views/teacher/Assignments.vue` — 作业管理 ｜ LOC 305（tpl 104 / scr 165 / sty 31，scoped）

- **用途**：作业列表 + 锁定开关；3 步「布置作业」向导。
- **template**：`.page-header`（布置作业）→ `DataTable`（服务端分页；标题 + 练习 tag + 锁图标；班级 tags；时间区间；末列锁/解锁图标按钮）→ `a-modal width="1040"`（`:footer="null"`、`destroyOnClose`）内：`a-steps` + 步骤 0（`a-input-search` + `a-table rowSelection type=radio`）＋ 步骤 1（左右双 `.pick-panel` 班级穿梭选择，自研列表非 Transfer）＋ 步骤 2（`a-form`：标题 / 说明 / `a-range-picker show-time` / 练习模式 `a-switch` / 允许次数 `a-input-number` / 允许补交 `a-switch`）+ 上一步/下一步/提交。
- **AntDV 组件**：`a-button×5/a-empty×2/a-form/a-form-item×6/a-input/a-input-number/a-input-search×2/a-modal/a-range-picker/a-step×3/a-steps/a-switch×2/a-table/a-tag×4/a-textarea`。
- **关键交互**：步骤校验（未选题/未选班 `message.warn` 阻断）；`onPracticeToggle` 用 `h()` 在 JS 里**内联构造 30+ 行样式的 `Modal.confirm` 富内容**；锁定时 `:style` 动态改按钮色（`#ff4d4f`）；时间用 dayjs + 中文 locale。
- **数据密度**：表格 7 列（标题 240 / 班级 140 / 题目数 70 / 提交数 70 / 时间 200 / 创建时间 150 / 锁定 60）；向导表单 6 字段；选题表 2 列。
- **令牌 / 自定义类**：`--blue/--ink-muted`；`.assign-modal` 在**非 scoped** style 块；3 处模板内联 `#ff4d4f`；20 处内联样式。
- **a11y**：label 6/6；步骤条无 `aria-current`；锁图标按钮靠 `title` 提示。

### B15. `views/teacher/QuestionEdit.vue` — 题目编辑（编程/客观） ｜ LOC 958（tpl 297 / scr 530 / sty 128，scoped）

- **用途**：一套页面同时编辑主观题与客观题（单选/多选/判断/填空），支持小题增删、AI 试卷解析、AI 生成标答、AI 提示词预览。
- **template 自上而下**：`.lc-page` → `.lc-top`（inline `a-form`：标题、难度、总分只读、上传试卷 / 设置）→ `.lc-main`：**左 `.lc-left`**（初始 `.kind-picker` 圆形「+」→ 已选后：材料折叠区 `RichEditor`、小题标签栏（横向滚动 + `TransitionGroup` + 删除 popconfirm + 「+」下拉）、小题编辑面板：主观题（标题/分值/内容 `RichEditor`/评分标准）或客观题（`.obj-add-bar` + 小问卡片：题干、`a-radio/a-checkbox` + `a-input` 选项行、判断、填空空位））**右 `.lc-right`**（主观题：`CodeEditor` 参考答案 + 语言选择 + 格式化；客观题：实时预览）+ `.lc-footer`（取消 / 查看 AI 提示词 / 保存）→ 3 个 `a-modal`（AI 提示词 `a-collapse` + `pre`、题目设置、上传试卷 `a-upload-dragger` + 流式进度）。
- **AntDV 组件**：26 种：`a-alert/a-button×12/a-checkbox×2/a-checkbox-group/a-col×2/a-collapse/a-collapse-panel/a-dropdown×3/a-empty×3/a-form×4/a-form-item×11/a-input×5/a-input-number×2/a-menu×3/a-menu-item×12/a-modal×3/a-popconfirm×2/a-radio×10/a-radio-group×5/a-row/a-select×2/a-select-option×4/a-spin×2/a-tag×7/a-textarea×2/a-upload-dragger`。
- **关键交互**：小题 tab 切换（`Transition` 滑动方向 `--slide-dir`）；客观题小问增删与分值自动汇总（`syncObjSqScore` + 深 watch）；填空题按题干 `_{2,}` 自动识别空数；**AI 试卷解析**（`mammoth` 读 docx / `xlsx` 读表格 → 流式 fetch，带 `uploadProgress` 字符数）；**AI 生成标答**；2s 防抖草稿保存 + `beforeunload` 拦截；保存前分值与完整性校验。
- **数据密度**：单页 N 小题 × M 小问；主观题 5 字段 + 客观题 4~8 字段/问；选项 2~8 个；11 个 form-item。
- **令牌 / 自定义类**：`--blue/--ink-muted/--hairline/--canvas-parchment/--slide-dir`；约 40 个自定义类（`.lc-*/.kind-*/.material-*/.sq-tab/.obj-*/.preview-*`）；**41 处硬编码色**、1 处 `!important`（`.preview-scroll{overflow-y:auto !important}`）、45 处内联样式；`:deep()` 3 处。
- **a11y**：11 个 form-item **全部无 label**（依赖 placeholder）；「+」「×」「⚡」符号按钮无 `aria-label`；无 aria。

### B16. `views/teacher/ProjectQuestionEdit.vue` — 实训题编辑/作答（双角色） ｜ LOC 621（tpl 143 / scr 375 / sty 89，scoped）

- **用途**：教师建/改实训题（描述 + 评分标准 + zip 标准包）；作为学生页时只读查看 + 上传工程 + 提交。
- **template**：`.page-header`（教师：标题/难度/满分可编辑 + 描述/评分标准/AI 提示词/保存；学生：只读 + 提交）→ 3 个 `a-modal`（题目描述 `RichEditor`／只读 HTML、评分标准 textarea／只读、AI 提示词 `pre`）→ 学生成绩卡 `.student-score-card`（状态 + 提交时间 + 分数/评语 或「评分完成后将在此显示成绩」）→ `Transition` 两阶段：未上传 = 整页居中 `ProjectZipUploader`；已上传 = `.ide-body`（左 `.sidebar` 文件树 + 右 `.editor-area`：`.tab-bar` 多标签 + `.editor-container` Monaco + 空态）。
- **AntDV 组件**：`a-button×11/a-empty/a-input/a-input-number/a-modal×3/a-select/a-select-option×3/a-space×2/a-spin/a-tag×2/a-textarea`。
- **关键交互**：`@monaco-editor/loader` 手写实例（`initMonaco/getOrCreateModel` 以 `file:///` URI 缓存模型 / `registerExtraLanguages` 补 scss+less）；zip 上传 → 过滤重打包（composable）→ 构建文件树 → 打开首个文件；自制 `openTabs/closeTab/activePath` 标签管理；提交后锁定。
- **数据密度**：文件树不定；教师表单 4 字段 + 两个长文本模态。
- **令牌 / 自定义类**：`--blue/--ink-muted`；约 25 个自定义类（`.ide-*/.tab*/.editor-*/.ssc-*/.readonly-*`）；**52 处硬编码色**、1 处 `!important`、9 处内联样式；`:deep()` 5 处。
- **a11y**：无 label（顶部标题/难度仅 placeholder）；标签「×」无 `aria-label`；无 aria。

### B17. `views/teacher/ProjectReviewNew.vue` — 实训题阅卷 ｜ LOC 669（tpl 191 / scr 371 / sty 104，scoped）

- **用途**：教师审核单个学生实训提交：看代码、看 AI 分项、改最终分与评语、审核/重新评分。
- **template**：`.pr-page` → `.pr-top`（返回 + 题名 + 实训题/BETA tag + 学生名/学号 + 状态 tag）→ `.pr-main`：左 `.sidebar`（`a-tabs` 切换「学生提交 / 标准答案包」+ `a-tree` 文件树 / `a-empty`）＋右 `.editor-area`（多标签 + Monaco + 空态）→ 底部 `.pr-panel`（可折叠 header：AI 分 tag、评分异常 tag、状态 tag；body 左 **AI 区**：AI 分数字块、评分中/异常态、重试/重新评分 popconfirm、查看提示词、`a-collapse` 分项明细、highlights/issues 列表、「引用到教师评语」；右 **教师区**：最终分数 `a-input-number`、教师评语 `a-textarea`、审核通过/更新审核 + 只读锁提示）→ AI 提示词 `a-modal`。
- **AntDV 组件**：`a-button×6/a-collapse/a-collapse-panel/a-empty×3/a-input-number/a-modal/a-popconfirm×2/a-spin/a-tab-pane×2/a-tabs/a-tag×9/a-textarea/a-tree`。
- **关键交互**：双数据源切换时重建 Monaco 模型（URI 加 `activeTree` 前缀）；保存审核 / 重新评分；**评分中 3s 轮询**；`quoteAiComment` 一键把 AI 评语灌进教师评语；折叠面板过渡。
- **数据密度**：AI 分项明细不定行；教师区 2 字段；文件树双源。
- **令牌 / 自定义类**：**无令牌引用（0）**；约 22 个自定义类（`.pr-*/.ai-*/.panel-*/.t-*/.hl-*/.bd-*`）；**51 处硬编码色**、2 处 `!important`、5 处内联样式；`:deep()` 8 处。
- **a11y**：折叠 header 是 `<div @click>`（非 button、无 `aria-expanded`）；无 aria。

### B18. `views/teacher/ReviewDetail.vue` — 单份提交阅卷 ｜ LOC 845（tpl 203 / scr 348 / sty 291，scoped）

- **用途**：按题流式阅卷：左题号导航、右逐题（只读 Monaco + AI 分/评语 + 教师分/评语），底部保存审核 / 发布成绩。
- **template**：`.rp-page` → `.rp-top` → `.rp-main`：左 `.rp-nav`（章节标题可折叠 + `.n-box` 状态方块网格 + 底部 AI 总分）＋右 `.rp-content`（材料折叠条 → 逐小题 `.sq-section`：题号/类型 tag/分值/状态 tag → 题干 `v-html` → 主观题：学生答案 + 只读 `CodeEditor height=220` + `.sq-review-box`（AI 分、重新评分、提示词、使用 AI 评语、最终分 `a-input-number`；下排 AI 评语 / 教师评语 `a-textarea` 两列）／客观题：`.oi-card` 逐小问（作答 vs 答案对照 + 对错着色）+ 自动评分摘要）→ 底部 `.rp-submit-bar` → AI 提示词 `a-modal`。
- **AntDV 组件**：`a-button×7/a-empty/a-input-number/a-modal/a-spin/a-tag×7/a-textarea`。
- **关键交互**：题号方块点击 `scrollIntoView smooth`；`toggleCollapse`；逐题 `regrade(sq)`（独立 loading）；`useAiFeedback`；`formatCode(sqId)` 调 CodeEditor 暴露的 `format()`；批量 reviewAll / publishAll。
- **数据密度**：题目数 × (1 编辑器 + 2 评语 + 2 数字字段)；291 行样式集中在此页。
- **令牌 / 自定义类**：`--canvas-parchment/--hairline`；约 30 个自定义类（`.rp-*/.sq-*/.oi-*/.n-*/.prompt-*`）；**76 处硬编码色**、4 处 `!important`、6 处内联样式；`:deep()` 3 处。
- **a11y**：`.n-box` 方块是 `<div @click>`（无键盘可达、无 `aria-current`）；无 aria。

### B19. `views/teacher/Review.vue` — 评分审核汇总 ｜ LOC 186（tpl 77 / scr 76 / sty 30，scoped）

- **用途**：按「作业 × 班级」列出 AI 评分/审核进度，进入班级明细或导出。
- **template**：`.page-title` → `DataTable`（`:centerContent="false"`）→ `#toolbar-left` 班级 `a-select showSearch` → 单元格：题目信息块（标题/班级/时间三行）、AI 状态（三态 tag + 自旋点）、审核状态、已交/未交、操作（审核 / 导出）。
- **AntDV 组件**：`a-button×2/a-select/a-space/a-tag×5`。
- **关键交互**：**socket.io 实时刷新**（`join-school` + `graded` 事件，3s 去抖后 `fetch`；`onUnmounted` 断开）；切班即重查；导出走 `exportReviewXlsx`。
- **数据密度**：表格 5 列（信息 320 / AI 状态 140 / 审核状态 140 / 已交未交 120 / 操作 100）；信息列内嵌 3 行文本。
- **令牌 / 自定义类**：`--ink-muted`；`.page/.page-title/.info-*/.dim-text/.spinner-dot`；3 处硬编码色、1 处 `!important`（hover 行底色）、1 处内联样式；`:deep()` 1 处。
- **a11y**：自旋点纯视觉；无 aria。

### B20. `views/teacher/ReviewClass.vue` — 班级成绩明细 ｜ LOC 341（tpl 88 / scr 192 / sty 58，scoped）

- **用途**：一个班一次作业的学生明细：行内改分、筛选、批量审核/发布、导出。
- **template**：`.top-row`（返回 + 作业名 + 班级 tag + 练习模式 tag）→ `DataTable`（`@change` 接排序、`:total` 服务端分页）→ `toolbar-left`（姓名搜索 + 5 个 `a-radio-button` 状态筛选）→ `toolbar-right`（一键审核全班 / 一键发布全班（练习模式隐藏）+ 导出 Excel）→ 单元格：学号（带学校后缀格式化）、AI 评分、最终分（**行内编辑**：点击变原生 `<input>`，blur/Enter 保存、Esc 取消）、状态 tag、审核入口。
- **AntDV 组件**：`a-button×5/a-input-search/a-radio-button×5/a-radio-group/a-tag×4`。
- **关键交互**：`score-input` 原生输入框行内编辑（非 antd Input）；排序字段与页码存 `reviewStore`（跨页返回保留）；socket 实时刷新；`batchPublish` 走 `Modal.confirm`；搜索 300ms 防抖。
- **数据密度**：表格 6 列（姓名 120 / 学号 140 / AI 评分 90 / 最终分 90 / 状态 120 / 操作 80）；工具栏 2 组筛选 + 3 按钮。
- **令牌 / 自定义类**：`--blue/--ink-muted`；`.top-*/.back-btn/.dim-text/.score-val/.score-input/.spinner-dot`；3 处硬编码色、3 处内联样式。
- **a11y**：行内 `<input>` 无 label/aria；`a-radio-group` 无组标签；无 aria。

### B21. `views/teacher/Teams.vue` — 教学团队列表 ｜ LOC 106（tpl 39 / scr 44 / sty 20，scoped）

- **用途**：团队列表 + 创建 + 管理/退出/删除。
- **template**：`.page-header`（创建团队）→ `DataTable clientPagination`（创建者/成员统计/时间/操作）→ `a-modal width="400"`（团队名称）。
- **AntDV 组件**：`a-button×4/a-form/a-form-item/a-input/a-modal/a-popconfirm×2/a-space`。
- **关键交互**：按创建者身份切换「删除 / 退出」两种 popconfirm；创建时名称必填校验；请求均带 `schoolId`。
- **数据密度**：表格 5 列（名称 200 / 创建者 100 / 成员 160 / 时间 170 / 操作 160）。
- **令牌 / 自定义类**：**无令牌引用**；0 硬编码、0 内联。
- **a11y**：label 1/1；无 aria。

### B22. `views/teacher/TeamEdit.vue` — 团队成员/班级维护 ｜ LOC 194（tpl 72 / scr 111 / sty 8，scoped）

- **用途**：维护团队成员与班级，选择即自动保存。
- **template**：`.page-header`（← 返回 + 团队名）→ `a-card` → `a-tabs` 两个 `a-tab-pane`：「教师管理」（`a-select multiple showSearch maxTagCount=0` + `a-table` + 移除 popconfirm）／「班级管理」（同构）。
- **AntDV 组件**：`a-button×3/a-card/a-popconfirm×2/a-select×2/a-tab-pane×2/a-table×2/a-tabs/a-tag`。
- **关键交互**：**300ms 防抖自动保存**（选择即 PUT，无保存按钮）；取消选中被 `watch` 拦截 → `Modal.confirm` → 再走移除逻辑；`maxTagCount=0` 用「已选 N 人」占位。
- **数据密度**：两张表各 3~4 列；两个多选控件；无表单字段。
- **令牌 / 自定义类**：`--hairline/--ink-muted`；`.page/.page-header/.page-card/.mb16/.back-btn`；0 硬编码、3 处内联。
- **a11y**：选择框无 label（靠 placeholder）；无 aria。

### B23. `views/student/Layout.vue` — 学生布局 ｜ LOC 187（tpl 65 / scr 84 / sty 35，scoped）

- **用途**：student 区骨架 + 我的信息/改密模态。
- **template**：`a-layout`（sider 160px + 2 菜单项）→ topbar（触发器 + 用户区）→ content（tab-fade）→ `a-modal width="420"`（avatar 56 + 姓名/学号/班级三行 + `a-divider` + `a-collapse` 改密 3 字段）。
- **AntDV 组件**：16 种（`a-layout×2/a-layout-sider|header|content/a-menu×2/a-menu-item×4/a-dropdown/a-avatar×2/a-divider/a-collapse/a-collapse-panel/a-form/a-form-item×3/a-input-password×3/a-modal/a-button`）。
- **关键交互**：与 teacher Layout 几乎逐行同构（仅菜单项与用户区不同）；`window.addEventListener('resize')` 无清理（第 79 行）。
- **数据密度**：菜单 2 项；改密表单 3 字段。
- **令牌 / 自定义类**：`--blue/--ink/--ink-muted/--canvas-parchment/--font-display/--radius-sm`；`.logo*/.topbar/.trigger/.user-*/.profile-*`（与 teacher/admin Layout **同名同类，各自复制**）；1 处硬编码 `#fff`；`@media(max-width:768px)` 一段。
- **a11y**：与另两个 Layout 相同的 div 触发器问题；无 aria。

### B24. `views/student/Assignments.vue` — 作业列表（学生） ｜ LOC 195（tpl 63 / scr 108 / sty 21，scoped）

- **用途**：作业列表 + 关键词搜索 + 4 状态筛选，行点击进入答题。
- **template**：`.page-title` → `DataTable clientPagination customRow`（整行可点，`cursor` 由 `canEnter` 决定）→ `toolbar-left`（`a-input-search` 280px + 4 个 `a-radio-button`）→ 单元格：标题（+ 练习 tag + 锁图标）、题目数、状态 tag、开始/截止时间双行 + 时间图标。
- **AntDV 组件**：`a-input-search/a-radio-button/a-radio-group/a-tag×2`。
- **关键交互**：10s 定时器刷新「未开始/已过期」判定（`onUnmounted` 清理）；关键词 300ms 防抖重查；筛选在前端 `computed` 过滤；`canEnter` 决定可进入性。
- **数据密度**：表格 5 列（标题 300 / 题目数 80 / 状态 110 / 开始 130 / 截止 130）。
- **令牌 / 自定义类**：`--blue/--ink-muted`；`.page/.page-title/.locked-text/.time-cell/.time-icon/.time-text/.time-sub`；1 处模板内联 `#ff4d4f`、4 处内联样式。
- **a11y**：行点击无键盘等价（无 `tabindex/role/keydown`）；无 aria。

### B25. `views/student/Submit.vue` — 答题页（考试/练习） ｜ LOC 1286（tpl 263 / scr 755 / sty 265，scoped）

- **用途**：全站最重的页面：题号导航 + 编程题 Monaco + 客观题四种题型 + 草稿自动保存 + 倒计时强制提交 + 练习模式轮询出分。
- **template 自上而下**：`.sp-page` → `.sp-top`（返回 + 题名 + 练习/次数 tag + 总分/得分/最高分 tag + 「已过期」）→ `.sp-main`：**左 `.sp-nav`**（题目导航 + 可折叠小节标题 + `.n-grid` 状态方块（5 种配色 + active）+ 底部草稿状态）＋ **右 `.sp-content`**（材料折叠条 → 逐小题 `.sq-section`：头部（题号/类型 tag/分值/得分或「评分中」自旋点）→ 题干 `v-html` → 编程题：语言 `a-select` + 「⚡ 格式化」+ 懒挂载 `CodeEditor height=560`（占位块「滚动至此加载编辑器」）／客观题：`.oi-card` × 小问（单选 `a-radio-group`、多选 `a-checkbox-group`、判断 `a-radio-group`、填空 `a-input`，出分后显示 ✓/✗ 与正确答案）→ 参考答案 `pre` → 评语块）→ 底部 sticky `.sp-submit-bar`（三种态：练习全出分「重新答题」/ 未提交「提交全部」+ 未提交计数 / 已过期「考试已结束」）。
- **AntDV 组件**：`a-button×5/a-checkbox/a-checkbox-group/a-input/a-radio×3/a-radio-group×2/a-select/a-select-option/a-tag×11`。
- **关键交互**：题号方块滚动定位 + active 高亮；**IntersectionObserver 懒挂载 Monaco**（`rootMargin: 400px`）；草稿三通道保存（1.5s 防抖 / 30s 定时 / `visibilitychange` + `beforeunload` 用 `fetch keepalive`）；`deadlineTimer` 到点 `forceSubmitAll`（`Modal.info` 汇报已交/弃答）；`submitAll` 前统计「全答完/部分答/未答」并按未完成度切换确认文案与危险按钮；练习模式 2s 轮询状态直到出分；`retryPractice` 清空本地全部响应式状态并重挂编辑器；18 种语言下拉；`DOMPurify` 净化题干/材料。
- **数据密度**：题数 × 题（编辑器 560px 高 / 4 类客观控件）；顶栏最多 6 个 tag 并排；导航方块 30×30。
- **令牌 / 自定义类**：`--canvas-parchment/--hairline`；约 34 个自定义类（`.sp-*/.n-*/.sq-*/.oi-*/.fb-*/.dirty-hint/.placeholder-inner/.reference-code`）；**72 处硬编码色**（5 套方块配色全为 hex）、4 处 `!important`、9 处内联样式、147 处 `px`；`:deep()` 1 处；`margin: -28px -48px -40px` 用负边距抵消 Layout 内边距（第 1025 行）。
- **a11y**：0 个 `<label>`；`a-radio-group/a-checkbox-group` 无组标签；方块导航无键盘可达与 `aria-current`；草稿状态无 `aria-live`；无 aria。

### B26. `views/student/Scores.vue` — 我的成绩 ｜ LOC 73（tpl 32 / scr 24 / sty 14，scoped）

- **用途**：成绩列表（作业 / 提交次数 / 分数，练习模式附最高分）。
- **template**：`.page-title` → 空态 `a-empty`／`DataTable clientPagination` → 单元格：作业名 + 练习 tag、提交次数、`分数 / 满分` + 最高分灰字。
- **AntDV 组件**：`a-empty`、`a-tag`。
- **关键交互**：仅 `onMounted` 拉取；前端分页。
- **数据密度**：表格 3 列（作业 220 / 提交次数 90 / 分数 140）。
- **令牌 / 自定义类**：**无令牌引用**；`.page/.page-title`；1 处模板内联 `#888`、3 处内联样式。
- **a11y**：无 aria；分数用 `<strong>` 表达层级。

### B27–B31. components/ 四个共享组件

| 文件 | LOC | template 结构 | AntDV | 关键交互 | 令牌 / 问题 |
|---|---|---|---|---|---|
| `components/DataTable.vue` | 323 | `.dt-root` → `.dt-toolbar`（toolbar / toolbar-left / toolbar-right 三插槽）→ `a-card.dt-card` 内 `a-table`（`sticky`、透传非自有插槽）+ `.dt-footer`（footer-left + `a-pagination` + footer-right） | `a-card/a-table/a-pagination` | `ResizeObserver` 动态算 `scroll.y`；客户端/服务端分页双模；翻页 350ms 行淡入动效（前 5 行设延迟）；`OWN_SLOTS` 白名单过滤插槽；暴露 `updateScrollY` | `--hairline`；`:deep()` 17 处、`!important` 4 处（表头/单元格居中、去底边框、`overflow-y:scroll`）；`.dt-footer` 用 `#fafafa/#f0f0f0`；无 aria |
| `components/RichEditor.vue` | 276 | `.rich-editor`（focused 态）→ `.toolbar`（24 个 `<button>`：B/I/U/S/代码/高亮/取色器/H2/H3/对齐/列表/引用/代码块/链接/图片/表格/分割线/撤销/重做）→ `<editor-content>` → `Teleport` 自绘「插入表格」弹窗 | 无 antd | TipTap 18 扩展；链接与图片用 `window.prompt` 取值；`setContent(val, false)` 防循环 | **0 令牌**；**33 处硬编码色**（含 `#282c34` 代码块主题）；`:deep()` 18 处；自绘弹窗无 focus trap、无 Esc；24 个按钮用 `title` 代替 `aria-label`；无 aria |
| `components/ProjectZipUploader.vue` | 170 | `.zip-uploader` → 未选文件时 `.kind-picker`（56px 圆形虚线按钮 + 提示 + 隐藏 `<input type=file>`）→ `a-alert` 错误 → `.zu-tree`（`a-tree` + `file-icons-js` 图标） | `a-alert/a-tree` | `useProjectUpload` composable 负责过滤重打包/体积校验/文件树；外部 `treeData`（回看）优先；就位默认全展开；选中 `emit('select')` 带 language | `--ink-muted`；**7 处硬编码色**；上传按钮为自绘 `<button>`（无 `aria-label`，仅「+」） |
| `components/CodeEditor.vue` | 124 | `.code-editor-wrap` → `.code-editor` div（Monaco 挂载点，`height` prop 或 100%） | 无 antd | `@monaco-editor/loader` 动态初始化；内容变更双向绑定；`watch language` 切模型语言；`watch modelValue` 防回写；暴露 `format()`（JS 系走 Monaco format，C 系自研 `braceFormat`，其他 reindent） | **0 令牌**；字号 `14` / 字体 `MonacoDSH` 写死在配置；`height` 为 px 数字 |

---

## C. 横切模式（重复出现的页面模式）

| 模式 | 出现次数 | 文件清单 | 现状说明 |
|---|---|---|---|
| **列表 = DataTable + 分页** | **13** | admin: Schools, Classes, Teachers, Students ／ teacher: Classes, Students, Questions, Assignments, Review, ReviewClass, Teams ／ student: Assignments, Scores | 统一经 `DataTable`，但分页模式不统一：**服务端分页**（teacher/Questions、teacher/Assignments、teacher/ReviewClass）与**客户端切片**（`clientPagination`，8 页）并存 |
| **页面外壳 `.page{max-width:1400px;height:100%;display:flex;flex-direction:column;overflow:hidden}` + `.page-header`** | **15 份逐字重复的 CSS** | admin: Schools/Classes/Teachers/Students/Monitor ／ teacher: Classes/Students/Questions/Assignments/Review/ReviewClass/Teams/TeamEdit ／ student: Assignments/Scores | 同一段 CSS 在 15 个 SFC 里各复制一遍；`.page-title{font-size:28px}` 亦 15 处 |
| **Modal 表单（新增/编辑复用同一 Modal）** | **13 个页面含 `<a-modal>`** | admin: Classes, Students, Teachers ／ teacher: Assignments, Classes, Layout(×2), ProjectQuestionEdit(×3), ProjectReviewNew, QuestionEdit(×3), ReviewDetail, Students(×3), Teams ／ student: Layout | 宽度取值 400/420/480/520/560/640/720/820/1040 与 `width="820px"` 字符串混用；两处 `wrap-class-name` 走全局 `.form-modal/.assign-modal` |
| **`Modal.confirm` 命令式确认** | **11** | student/Submit、teacher/Classes、teacher/Assignments、teacher/ReviewClass、teacher/Students、teacher/TeamEdit(×2)、teacher/QuestionEdit、admin/Layout、admin/AiConfig、admin/Students | 与声明式 `a-popconfirm`（12 个文件）混用，同页可能两种都有 |
| **RichEditor（TipTap 富文本）** | 2 | teacher/QuestionEdit、teacher/ProjectQuestionEdit | 24 按钮工具栏 + `window.prompt` 取链接/图片 URL |
| **CodeEditor（Monaco 封装）** | 3 | student/Submit、teacher/QuestionEdit、teacher/ReviewDetail | 另有 2 页**绕过封装自建 Monaco**：teacher/ProjectQuestionEdit、teacher/ProjectReviewNew |
| **VSCode 风格 IDE 三件套（文件树 + 多标签 + Monaco）** | 2 | teacher/ProjectQuestionEdit、teacher/ProjectReviewNew | `.tab-bar/.tab/.editor-area/.sidebar` 类名与样式在两页各自复制 |
| **答案/评分双栏对照** | 3 | teacher/ReviewDetail、student/Submit、teacher/ProjectReviewNew | 三套不同类名前缀：`.oi-compare` / `.oi-reference` / `.bd-row` |
| **左侧「题号方块导航 + 可折叠章节」** | 2 | student/Submit、teacher/ReviewDetail | 两页共享 `.n-section-head/.n-section-arrow/.n-grid/.n-box-*` **整套类名与配色**（可提取组件信号） |
| **自旋加载点 `.spinner-dot`** | 3 | teacher/Review、teacher/ReviewClass、student/Submit | 三份各自 `@keyframes spin`，尺寸 8px/10px、色 `#91caff/#d9d9d9` 不一致 |
| **上传入口** | 3 形态 | teacher/Students、teacher/QuestionEdit（`a-upload-dragger`）／teacher/ProjectQuestionEdit + student（`ProjectZipUploader` 圆形按钮 zip） | 拖拽区 / 圆形虚线按钮 / 文件树三种形态 |
| **WebSocket 实时刷新（socket.io）** | 2 | teacher/Review、teacher/ReviewClass | 两处 `connectSocket` 逻辑重复（`join-school` + `graded` + 3s 去抖） |
| **轮询刷新** | 3 | student/Submit（2s）、teacher/ProjectReviewNew（3s）、admin/Monitor（30s + 开关） | 三套独立 interval + 清理逻辑 |
| **状态 tag 着色映射** | ~10 | student/Assignments、teacher/ReviewClass、teacher/Review、teacher/Questions 等 | 每页自带 `statusColor/statusText` 映射函数 |
| **草稿/自动保存** | 3 | student/Submit（1.5s 防抖 + 30s 定时 + keepalive）、teacher/QuestionEdit（2s 防抖）、teacher/TeamEdit（300ms 防抖） | 三套不同节拍，无共享 composable |
| **导出 Excel** | 2 | teacher/Review、teacher/ReviewClass（`infrastructure/export.js`） | 已抽公共函数 |
| **空态 `a-empty`** | 8 | admin/Monitor ／ teacher: Assignments、ProjectQuestionEdit、ProjectReviewNew、QuestionEdit、ReviewDetail、Students ／ student: Scores | 4 处配 `:image="false"` 纯文本态 |
| **页面过渡** | 全局 + 10 种 | `App.vue` `page-fade`；3 个 Layout `tab-fade`；各页自建 `kind-pick-switch/panel-switch/sq-list/item-list/opt-list/collapse/panel-slide/pr-fade/upload-status` | `style.css` 只定义前两个，其余分散在各页 |

---

## D. 现存 UI 问题线索（仅证据）

### D1. 令牌体系断层
- `style.css` 定义 24 个令牌（`--blue/--ink/--hairline/--radius-*/--font-*`），但 **12 个文件 0 引用**：`App.vue`、`components/RichEditor.vue`、`components/CodeEditor.vue`、`views/student/Scores.vue`、`views/admin/{Students,Teachers,Classes,Monitor}.vue`、`views/teacher/{Questions,Classes,Teams,ProjectReviewNew}.vue`。
- **引用了不存在的令牌**：`--ink-base` 出现在 `admin/AiConfig.vue`、`admin/Students.vue`、`teacher/Students.vue`——`style.css` 的 `:root` 无此变量（应为 `--ink`），浏览器静默失效。
- `style.css` 自身用 `!important` 覆盖 AntDV 深色侧栏/菜单（第 96–101 行）。
- `App.vue` 以 JS 对象硬编码 `colorPrimary: '#0066cc'`、`borderRadius: 8`、`fontSize: 15`，与 `02-design-tokens.css` 的语义层并行，存在两套真相。

### D2. 硬编码颜色 / 尺寸
- 全站色值频次 Top：`#1677ff` **49**、`#fff` **43**、`#f0f0f0` **38**、`#999` **31**、`#fafafa` **29**、`#e8e8e8` **27**、`#d9d9d9` **23**、`#666` **23**、`#ff4d4f` **18**。其中 `#1677ff`（antd v5 默认蓝）与产品主色 `#0066cc` 并存 —— **主色分裂**。
- 单文件硬编码色 Top：`teacher/ReviewDetail.vue` **76**、`student/Submit.vue` **72**、`teacher/ProjectQuestionEdit.vue` **52**、`teacher/ProjectReviewNew.vue` **51**、`teacher/QuestionEdit.vue` **41**、`components/RichEditor.vue` **33**、`views/Doc.vue` **19**。
- **模板/脚本内联颜色**：`teacher/Students.vue` 12 处、`teacher/QuestionEdit.vue` 9 处、`teacher/Assignments.vue` 3 处、`student/Submit.vue` 3 处（`color:#52c41a` 等直接写在 `style="..."`）。
- 内联样式计数 Top：`teacher/QuestionEdit.vue` 45、`teacher/Students.vue` 27、`teacher/Assignments.vue` 20、`student/Submit.vue` 9、`admin/AiConfig.vue` 8。
- 写死 `px` 计数 Top：`teacher/ReviewDetail.vue` 160、`student/Submit.vue` 147、`teacher/QuestionEdit.vue` 129、`teacher/ProjectQuestionEdit.vue` 100、`teacher/ProjectReviewNew.vue` 99（`style.css` 只提供 4 档 radius，间距/字号无令牌可依）。
- **深色代码块样式存在三份**：`style.css` 的 `.q-content pre`、`RichEditor.vue` 的 `:deep(.tiptap pre)`（`#282c34/#abb2bf`）、`Doc.vue` 自建一份。

### D3. `!important` 分布（全站 23 处 + style.css 4 处）
- `components/DataTable.vue` 4、`views/Doc.vue` 6、`student/Submit.vue` 4、`teacher/ReviewDetail.vue` 4、`teacher/ProjectReviewNew.vue` 2、`admin/AiConfig.vue` 1（全局非 scoped）、`teacher/Review.vue` 1、`teacher/QuestionEdit.vue` 1、`teacher/ProjectQuestionEdit.vue` 1。
- 典型形态：`.dt-card :deep(.ant-table-thead > tr > th){text-align:center !important}`、`.dt-card :deep(.ant-table-cell){border-bottom:none !important}`、`.dt-card :deep(.ant-table-body){overflow-y:scroll !important}`。

### D4. 移动端处理
- **仅 4 个文件带 `@media`**：`style.css`（768px：表格横滚 / 弹窗全宽 / 按钮缩小）、`views/Doc.vue`（992px + 768px，唯一布局级响应式）、3 个 Layout（各一段 768px）。`teacher/Layout.vue` 的 768px 段**写了两遍**。
- **24 个业务页面全部没有自身断点**：依赖 `DataTable` 的 `scroll.x='max-content'` 横滚与 `style.css` 的 `.ant-modal{max-width:calc(100vw - 24px) !important}` 全局兜底。
- **已知会溢出的形态**：`student/Submit.vue` 左导航固定 `width:220px` + 右内容无收缩保护；`teacher/ReviewDetail.vue` `.rp-nav` 同类；两页都用 `height: calc(100vh - 52px)` + 负边距 `margin: -28px -48px -40px`（768px 下 Layout padding 变 12px，负边距不再匹配）。
- 3 个 Layout 的侧栏折叠宽度依赖 `window.innerWidth < 992` 的 `resize` 监听，**监听器从未移除**（admin 第 56 行、teacher 第 116 行、student 第 79 行）。

### D5. 无障碍缺失（`aria-*` 全站 0 个）
- **31 个 .vue 文件中 0 个包含 `aria-*` 属性**。
- **表单标签**：全站 51 个 `<a-form-item>`，其中 **15 个无 `label`**。`teacher/QuestionEdit.vue` 的 11 个 form-item **全部无 label**（依赖 placeholder）；`student/Submit.vue` 全页 0 个 `<label>`、仅 1 个 placeholder。
- **键盘可达性**：
  - `student/Submit.vue` 与 `teacher/ReviewDetail.vue` 的题号方块（`.n-box`）是 `<div @click>`，无 `tabindex/role/keydown`。
  - `student/Assignments.vue` 整行可点（`customRow onClick`），无键盘等价。
  - 3 个 Layout 的折叠触发器、用户区，`teacher/ProjectReviewNew.vue` 的评分面板 header 均为 `<div>/<span>` 点击。
  - `RichEditor.vue` 的 24 个工具栏按钮与 `ProjectZipUploader.vue` 的圆形「+」只有 `title`/符号文本；`QuestionEdit.vue` 的「×」「⚡」同类。
  - `RichEditor.vue` 自绘表格弹窗无 focus trap、无 Esc、无 `role="dialog"`；`Doc.vue` 灯箱同样无 Esc。
- **实时反馈无播报**：`student/Submit.vue` 的「草稿已同步 / N 题未保存」、`teacher/Students.vue` 的导入结果、评分状态变化均无 `aria-live/role="status"`。
- **图标独用**：20 个文件里 60+ 处 `title="..."` 承担可访问名（`RichEditor` 23、`QuestionEdit` 7、`teacher/Students` 5）。
- **对比度线索（需实测）**：`#999`（31 处）、`#bbb`（7）、`#ccc`（4）作为正文/说明文字用在 `#fff/#fafafa` 上；`.dt-footer`、`.log-viewer` 等区域未走令牌，无法统一校验。

### D6. 结构与一致性
- 页面外壳 CSS 在 15 个文件逐字重复，无共享 layout 组件。
- 三个 Layout 的 `.logo*/.topbar/.trigger/.user-*` 类名与样式各自复制（admin 100 / student 187 / teacher 331 行）。
- **非 scoped 全局样式 5 处**：`admin/AiConfig.vue`（`.concurrency-active-row`）、`teacher/Assignments.vue`（`.assign-modal`）、`style.css`（`.form-modal` 等）。
- `DataTable.vue` 自带 `.dt-footer` 背景 `#fafafa/#f0f0f0`，与 `a-card` 主题脱钩。
- `.q-content`（富文本渲染）在 `style.css` 定义后，被 `RichEditor.vue` 与 `Doc.vue` 各覆盖一遍，共 3 套。

---

## E. 页面复杂度排行（LOC + 交互复杂度）

复杂度分 = LOC 归一化 + 交互信号加权（ref / computed / watch / onMounted / HTTP 调用 / `<a-modal>` / Monaco 或 RichEditor 或上传或 WebSocket 或轮询 / 独立自定义类数量）。

| 排名 | 页面 | LOC | 交互信号（实测） | 复杂度 |
|---|---|---|---|---|
| 1 | `views/student/Submit.vue` | **1286** | 15 ref / 9 computed / 1 watch / 2 onMounted / 4 fetch ／ Monaco 懒挂载 + IntersectionObserver ／ 草稿三通道保存 ／ 倒计时强制提交 ／ 2s 轮询 ／ 4 类客观题型 ／ 34 自定义类 ／ 265 行样式 | ★★★★★ |
| 2 | `views/teacher/QuestionEdit.vue` | **958** | 26 ref / 4 computed / 5 watch / 3 Modal ／ RichEditor×2 + CodeEditor ／ AI 试卷解析（mammoth+xlsx 流式）／ AI 生成标答 ／ 客观题小问增删与分值联动 ／ 45 处内联样式 | ★★★★★ |
| 3 | `views/teacher/ReviewDetail.vue` | **845** | 16 ref / 6 computed / 1 Modal ／ 只读 Monaco + 暴露 format() ／ 逐题重评 + 使用 AI 评语 ／ 题号方块导航 + 折叠 ／ 291 行样式（全站最多） | ★★★★☆ |
| 4 | `views/teacher/ProjectReviewNew.vue` | **669** | 21 ref / 10 computed / 2 watch ／ 自建 Monaco + 多标签 + 双源文件树（URI 前缀隔离模型）／ 3s 轮询 ／ 可折叠评分面板 ／ 8 处 `:deep()` | ★★★★☆ |
| 5 | `views/teacher/ProjectQuestionEdit.vue` | **621** | 17 ref / 9 computed / 1 watch ／ ProjectZipUploader×2 ／ 自建 Monaco + 标签页 ／ 三 Modal ／ 教师-学生双模式分支 ／ 52 处硬编码色 | ★★★★☆ |
| 6 | `views/teacher/Students.vue` | 418 | 14 ref / 1 computed / 1 watch / 7 fetch ／ 3 Modal ／ Excel 前端解析 + 校验 + 结果报告 ／ 27 处内联样式 | ★★★☆☆ |
| 7 | `views/teacher/ReviewClass.vue` | 341 | 11 ref / 3 computed / 1 watch / 7 fetch ／ 行内改分 ／ 5 态筛选 + 排序持久化 ／ socket.io ／ DataTable `@change` 双事件 | ★★★☆☆ |
| 8 | `views/teacher/Layout.vue` | 331 | 8 ref / 1 watch ／ 2 Modal（信息+改密、AI 流程 5 步）／ 11 菜单项 + 子菜单 ／ resize 监听 ／ 141 行样式 | ★★★☆☆ |
| 9 | `views/teacher/Assignments.vue` | 305 | 11 ref / 3 computed ／ 3 步向导 Modal ／ 班级穿梭自绘面板 ／ `h()` 构造 30+ 行内联样式确认框 ／ `a-range-picker` + dayjs | ★★★☆☆ |
| 10 | `views/admin/AiConfig.vue` | 239 | 2 ref / 3 computed ／ 3 卡片 + 2 表单 + 预估表 ／ change 即 PUT ／ 双 `<style>`（含全局） | ★★☆☆☆ |
| 11 | `views/student/Assignments.vue` | 195 | 5 ref / 1 computed ／ 行点击进入 ／ 10s 定时器 ／ 前端四态筛选 ／ 防抖搜索 | ★★☆☆☆ |
| 12 | `views/teacher/TeamEdit.vue` | 194 | 6 ref / 2 computed / 2 watch / 4 fetch ／ 防抖自动保存 ×2 ／ 取消选择拦截确认 ／ 2 个 `a-table` | ★★☆☆☆ |
| 13 | `views/student/Layout.vue` | 187 | 7 ref / 1 computed ／ Modal（信息+改密）／ 与 teacher Layout 同构 | ★★☆☆☆ |
| 14 | `views/teacher/Review.vue` | 186 | 4 ref / 1 computed / 3 fetch ／ socket.io ／ 导出 Excel ／ 表格内三行信息块 | ★★☆☆☆ |
| 15 | `views/teacher/Classes.vue` | 170 | 10 ref / 4 computed / 4 fetch ／ 2 Modal ／ 跨校迁移 ／ 多选团队 | ★★☆☆☆ |
| 16 | `views/admin/Teachers.vue` | 163 | 7 ref / 1 computed / 3 fetch ／ Modal + 自研多选 tag 输入 ／ 自删保护 ／ 重置密码 | ★★☆☆☆ |
| 17 | `views/Login.vue` | 148 | 6 ref ／ 双视图切换 ／ 多校二次提交 | ★★☆☆☆ |
| 18 | `views/admin/Classes.vue` | 130 | 8 ref / 3 fetch ／ Modal 复用 ／ 打开时并行拉选项 | ★★☆☆☆ |
| 19 | `views/teacher/Questions.vue` | 129 | 2 ref ／ 类型/难度 tag 映射 ／ 编辑分流两路由 | ★☆☆☆☆ |
| 20 | `views/admin/Monitor.vue` | 124 | 2 ref / 1 computed ／ 30s 轮询开关 ／ 深色日志区 | ★☆☆☆☆ |
| 21 | `views/teacher/Teams.vue` | 106 | 4 ref / 4 fetch ／ 创建 Modal ／ 身份分支操作 | ★☆☆☆☆ |
| 22 | `views/admin/Students.vue` | 100 | 4 ref / 2 fetch ／ 新增 Modal | ★☆☆☆☆ |
| 23 | `views/admin/Layout.vue` | 100 | 3 ref / 1 watch ／ resize 监听 ／ 登出确认 | ★☆☆☆☆ |
| 24 | `views/admin/Schools.vue` | 83 | 3 ref / 1 fetch ／ 纯只读列表 | ★☆☆☆☆ |
| 25 | `views/student/Scores.vue` | 73 | 2 ref / 1 fetch ／ 纯只读列表 | ★☆☆☆☆ |
| — | `views/Doc.vue` | 1062 | 7 ref / 2 computed ／ 4 组 Steps ／ Anchor 双份（桌面 + 抽屉）／ 灯箱 ／ resize ／ 6 处 `!important` | 内容长、交互中等（不计入业务页排名） |
| — | `components/DataTable.vue` | 323 | 3 ref / 6 computed / 1 watch ／ ResizeObserver ／ 双分页模式 ／ 插槽白名单 | 复用面最广（13 页） |
| — | `components/RichEditor.vue` | 276 | 4 ref / 1 watch ／ TipTap 18 扩展 ／ 24 按钮工具栏 ／ 自绘弹窗 | 复用 2 页 |
| — | `components/ProjectZipUploader.vue` | 170 | 3 ref / 2 computed / 1 watch ／ 依赖 composable | 复用 1 页（教师+学生双入口） |
| — | `components/CodeEditor.vue` | 124 | 1 ref / 2 watch ／ Monaco 生命周期 + 三种格式化策略 | 复用 3 页 |

**改造优先级提示（基于上表客观信号）**：Top5 复杂页面（Submit / QuestionEdit / ReviewDetail / ProjectReviewNew / ProjectQuestionEdit）合计 **4 359 行**，占 `views` 总行数约 43%，且全部含 Monaco 或自建编辑器，是风险最高、最需要先冻结交互契约的部分。
