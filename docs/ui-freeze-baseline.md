# Exam-DeepSeek UI 冻结基线（UI Freeze Baseline）

> 本文件由 agent-ui-guard 产出，用于分层架构重构期间的一切 UI/交互/动效改动对照审核。
> **铁律：当前版本 UI、交互、动效零改动。** 任何 diff 必须逐项对照本文件检查单确认无变化。

---

## 1. 基线版本

| 项 | 值 |
|---|---|
| Git Commit | `9e9efe9` |
| 日期 | 2026-08-16 |
| 提交说明 | fix: 评分 Worker 误捞实训题提交导致"找不到题目信息"给 0 分 |
| 前端目录 | `client/`（Vue 3 + Ant Design Vue 4 + Pinia + Vue Router + Socket.IO-client + Monaco + TipTap） |

**工作区状态（git status --short）**：以下均为**架构重构产物，不属于 UI 变更**：

- 未跟踪：`docs/refactor-architecture.md`、`docs/layer-violations-baseline.md`（文档）
- 未跟踪：`server/scripts/check-layers.mjs`（分层检查脚本）
- 未跟踪：`server/src/application/、domain/、infrastructure/、interface/`（后端分层目录）
- 未跟踪：`clash-add-direct.sh`

`client/` 目录无任何改动 → 前端 UI 与基线一致。

---

## 2. 路由与页面清单

路由定义：`client/src/router/index.js`（history base `/exam/`，共 **38 条路由记录**，含 3 个 redirect 与 1 个兜底）。
全局守卫 `beforeEach`：`/login` 已登录则跳角色首页；`/doc` 公开；无 token/user → `/login`；`meta.role` 与 user.role 不符 → `/login`。

### 2.1 公开页

| 路由 | 组件 | 交互要点 |
|---|---|---|
| `/login` | `views/Login.vue` | 登录表单（a-input/a-input-password size=large，回车触发登录，按钮 loading）；多学校选择流程（`/auth/login` 返回 code 1002 → 显示学校下拉 → 带 schoolCode 二次登录）；错误文案显示在表单下方（login-error 红色）；成功按角色跳 `/admin` 或 `/teacher`/`/student` |
| `/doc` | `views/Doc.vue` | 教师使用文档（公开，无需登录）；sticky 顶栏 + 左侧 a-anchor 导航 + 12 章节；交互式 a-steps（系统简介、题库管理）；图片点击放大 lightbox（全屏遮罩 + 关闭按钮 + 0.2s 淡入）；doc-tag 五色标签；doc-spinner 旋转动画；992px 以下隐藏侧栏 |

### 2.2 管理端（super_admin）

| 路由 | 组件 | 交互要点 |
|---|---|---|
| `/admin` | `views/admin/Layout.vue` | 深色侧边栏 160px（<992px 折叠为 0，否则 80px），6 个菜单项；顶栏 52px 毛玻璃（backdrop-filter blur(20px)），折叠触发器，头像下拉仅"退出登录"（Modal.confirm 确认后 logout 跳 /login）；子页切换 tab-fade 动画 |
| `/admin/schools` | `views/admin/Schools.vue` | 全国高校列表，只读；DataTable 客户端分页（pageSize 20/50/100/200 可切换，showTotal "共 X 所"）；GET `/admin/schools` |
| `/admin/classes` | `views/admin/Classes.vue` | 班级管理：新增/编辑 modal（宽 1040、wrap-class-name=form-modal；名称/所属学校/多选教师），删除 a-popconfirm；GET/POST/PUT/DELETE `/admin/classes` |
| `/admin/teachers` | `views/admin/Teachers.vue` | 教师管理：新增/编辑 modal（560px，工号编辑时禁用），隶属学校 showSearch 下拉 + closable tag 多选，"重置密码" popconfirm + message；GET/POST/PUT `/admin/teachers`、PUT `/admin/teachers/:id/reset-password` |
| `/admin/students` | `views/admin/Students.vue` | 学生管理：仅"新增学生"modal（学号/姓名/班级多选），无操作列；GET `/admin/students`、POST `/admin/students` |
| `/admin/monitor` | `views/admin/Monitor.vue` | 服务器监控：自动刷新开关 + 30s setInterval + 手动刷新按钮 loading；系统信息卡片（a-row/a-col），内存低阈值 15% 标红；PM2 进程表 a-badge 状态；错误日志黑底 `#1e1e1e` pre 视图；GET `/admin/monitor` |
| `/admin/ai-config` | `views/admin/AiConfig.vue` | AI 配置：模型配置表单（API Key input-password、模型 select、Base URL）+ 保存/测试连接（Modal.success/error 显示延时）；并发数 select 修改即自动保存（message "约 1 分钟内生效"）；耗时预估表，当前并发行高亮 `concurrency-active-row`（#e6f4ff）+ 分级 a-alert；GET/PUT `/admin/settings`、POST `/admin/settings/test-connection` |

### 2.3 教师端（teacher）

| 路由 | 组件 | 交互要点 |
|---|---|---|
| `/teacher` | `views/teacher/Layout.vue` | 深色侧边栏 7 菜单（班级/学生/教学团队/题库/作业/评分审核/实训任务）；顶栏用户名显示"学校名 · 教师"；下拉菜单：我的信息（420px modal：姓名/工号/当前单位 + 修改密码 collapse 表单）、切换单位（子菜单，PUT `/teacher/switch-school` 后 router.go(0) 整页刷新）、AI 评分流程（1040px modal + a-steps 6 步讲解）、使用文档（window.open `/exam/doc`）、退出登录；菜单选中按 path 前缀映射（review/questions/teams/projects 子页保持父菜单高亮，且进入子页自动折叠侧栏）；PUT `/auth/password` 修改密码 |
| `/teacher/classes` | `views/teacher/Classes.vue` | 班级管理（教师端）：团队共享班级显示紫色 tag"团队共享 · 创建者"且编辑/删除/切换学校禁用；新增/编辑 modal（1040px：名称 + 多选教学团队）；"切换学校"modal（520px，橙色→绿色 tag 箭头提示，切换后迁移作业并自动退出团队）；删除 popconfirm；GET/POST/PUT/DELETE `/teacher/classes`、PUT `/teacher/classes/:id/switch-school` |
| `/teacher/students` | `views/teacher/Students.vue` | 学生管理（教师端）：必须选班级才显示表格；姓名搜索 300ms 防抖；团队共享班级整页只读（新增/批量导入/编辑/删除全部禁用 + 紫色 tag"团队共享班级 · 只读"）；学号前缀 tmp_ 显示橙色 tag"⚠ 待补全"；编辑时补全学号二次确认 Modal（"保存后不可再次修改"）；批量导入 modal（拖拽上传 .xlsx/.xls，前端 XLSX 解析 + 表头校验 + 缺字段警告，导入结果 modal 分成功/待补全/警告/错误列表），"下载模板"客户端生成 Excel；重置密码 popconfirm；GET `/teacher/students`、POST `/teacher/students`、PUT `/teacher/students/:id`、POST `/teacher/students/batch`、PUT `/teacher/students/:id/reset-password` |
| `/teacher/questions` | `views/teacher/Questions.vue` | 题库管理："新增题目"下拉（编程题/实训题）；难度 tag（easy 绿/medium 橙/hard 红），类型 tag（实训题紫/编程题蓝）；编辑按类型跳不同路由；删除 popconfirm；服务端分页；GET/DELETE `/teacher/questions` |
| `/teacher/assignments` | `views/teacher/Assignments.vue` | 作业管理："布置作业"三步向导 modal（1040px，a-steps：选题→单选表格；选班→左右双面板 pick 列表，团队班级紫色 tag+归属教师；设置时间→标题/说明/起止时间 range-picker(show-time, zh_CN locale)/练习模式 switch/允许补交 switch）；练习模式开启弹 Modal.confirm 说明（4 条特性 + 不可逆警告）；锁定/解锁图标按钮（红色锁）；练习 tag 绿色；GET/POST `/teacher/assignments`、PUT `/teacher/assignments/:id/lock` |
| `/teacher/questions/new`、`/teacher/questions/:id/edit` | `views/teacher/QuestionEdit.vue` | 大题编辑（左右分栏编辑器）：顶部 inline 表单（标题 18px 加粗 input、难度 select、总分实时合计）；"上传试卷"modal（520px，拖拽 .docx/.xlsx，前端 mammoth/XLSX 解析后走 **SSE 流式** fetch `/teacher/parse-exam-stream`，显示已接收字符数与解析结果）；"设置"modal（客观题分类模式 flat/group + 多选给分方式，存 localStorage `exam_question_settings`）；初始圆形 + 按钮选择题型（主观/客观）；题目材料折叠条 + collapse 动画 + RichEditor；小题 tabs（左右滚动按钮、TransitionGroup 增删动画、删除 popconfirm、"+"下拉添加小题/小问）；主观题面板（标题/分值/富文本题干/评分标准 textarea）；客观题面板（小问卡片：单选/多选/判断/填空，选项增删，实时预览右栏联动 scrollIntoView）；编辑模式草稿自动保存（2s 防抖 + beforeunload 提示 + "保存中…/已保存" 状态文案）；保存校验链（标题→至少一小问→主观题题干→缺参考答案弹"AI 生成参考答案"确认→分值检查→分值汇总表 Modal.confirm）；AI 生成参考答案 POST `/teacher/generate-reference`（120s 超时，生成后打"AI 生成，请审核"橙色 tag）；GET/POST/PUT `/teacher/questions` |
| `/teacher/questions/new/project`、`/teacher/questions/:id/edit-project` | `views/teacher/ProjectQuestionEdit.vue`（教师模式） | 实训题编辑：顶部标题 input/难度 select/满分 input-number；"题目描述 ✓ / 评分标准 ✓"按钮打开 modal（RichEditor / textarea）；阶段一整页居中圆形上传按钮（ProjectZipUploader，提示"点击上传标准工程包"），阶段二切换为 VSCode 风格 IDE（左文件树 + 右 Monaco 多 tab）；选择文件后自动上传服务端拿 tempId（POST `/teacher/projects/upload-package`）；保存校验（标题必填、新建需先传包），POST/PUT `/teacher/questions`；回看模式加载 `/teacher/questions/:id/project-files` |
| `/teacher/review` | `views/teacher/Review.vue` | 评分审核总览：班级筛选 select（含"所有班级"）；AI 状态列（无提交"—"、全部异常红 tag、已评分绿 tag、待评分 tag 带 spinner-dot 旋转点 + 异常数）；审核状态列（已审核绿/待审核橙）；已交/未交统计；"审核"跳 `/teacher/review/class/:classId?assignmentId=`，"导出"GET `/teacher/export-review` + exportReviewXlsx；**Socket.IO 实时**：connect→emit join-school，收到 `graded` 3 秒节流后重新 fetch，离开页面 leave-school+disconnect；排序/分页状态存 `stores/reviewStore.js` 模块级变量跨页持久；GET `/teacher/review-summary` |
| `/teacher/review/class/:classId` | `views/teacher/ReviewClass.vue` | 班级审核：返回按钮；姓名搜索 300ms 防抖；5 档筛选 radio（全部/已交/未交/待审核/异常）；"一键审核全班"（POST `/teacher/submissions/batch-review`，loading）、"一键发布全班"（Modal.confirm 确认 + POST `/teacher/submissions/batch-publish`）、"导出 Excel"；最终分列**内联编辑**（点击分数→input，Enter/失焦保存 PUT `/teacher/submissions/:id/score`，Esc 取消）；状态 tag（未交/待评分带 spinner-dot/评分异常红/AI已评分/已审核/已发布）；列排序（学号/AI分/最终分/状态）；socket graded 3s 节流刷新；实训题提交跳 `/teacher/review/project/:submissionId`；GET `/teacher/review-class/:classId` |
| `/teacher/review/:id` | `views/teacher/ReviewDetail.vue` | 逐人逐题审核：左侧题目导航（可折叠小节 + 方块网格按得分率着色 correct/wrong/partial/empty，激活高亮 #1677ff 光晕）+ 底部 AI 总分；右侧流式阅卷：材料折叠条、主观题学生代码 CodeEditor 只读 + 格式化按钮、AI 评分栏（"重新评分"POST `/teacher/submissions/:id/regrade`、"使用 AI 评语"一键复制、最终分 input-number、教师评语 textarea、AI 评语只读块）、客观题卡片对错着色 + 作答/答案对比；底部 sticky 提交栏："保存审核"（逐题 PUT `/teacher/submissions/:id/review`，Promise.allSettled 汇总成功/失败数）、"发布成绩"（Modal.confirm + PUT `/teacher/submissions/publish`）；GET `/teacher/submissions/:id` |
| `/teacher/teams` | `views/teacher/Teams.vue` | 教学团队：创建团队 modal（名称必填）；创建者显示"删除"popconfirm、成员显示"退出"popconfirm（POST `/teacher/teams/:id/leave`）；"管理"跳 `/teacher/teams/:id`；GET/POST/DELETE `/teacher/teams`（带 schoolId 参数） |
| `/teacher/teams/:id` | `views/teacher/TeamEdit.vue` | 团队详情：tabs（教师管理/班级管理）；搜索添加 select（选中即 300ms 防抖自动保存 PUT `/teacher/teams/:id`，message "教师已更新/班级已更新"）；移除教师/班级 popconfirm；创建者保护（移除按钮禁用 + 角色"创建者"）；班级归属标注（自己/他人紫色 tag）；**取消选中被 watch 拦截**并弹 Modal.confirm 确认后走移除逻辑；GET `/teacher/teams/:id`、GET `/teacher/teachers` |
| `/teacher/projects` | `views/teacher/Projects.vue` | 实训任务列表：标题搜索 + 状态筛选（草稿/已发布/已关闭）；状态 tag（草稿灰/已发布绿/已关闭红）；操作列"查看提交/编辑/删除(popconfirm)"；a-table size=middle 服务端分页（showSizeChanger）；GET/DELETE `/teacher/projects`（api/projects.js） |
| `/teacher/projects/new`、`/teacher/projects/:id/edit` | `views/teacher/ProjectEdit.vue` | 新建/编辑实训任务：卡片式表单——基本信息（标题/描述/截止时间 a-date-picker show-time/班级多选）、标准工程包（上传 zip 按钮 + 全展开文件树预览）、评分权重（3 个 a-slider 联动恒等于 100%，非 100% 红字警告）、机器校验配置 checkbox、AI 提示词 textarea；底部"取消/保存草稿/保存并发布"；校验依次 message.warn（标题/截止时间/班级/权重和）；POST/PUT `/teacher/projects`、POST `/teacher/projects/upload-package` |
| `/teacher/projects/:id/submissions` | `views/teacher/ProjectSubmissions.vue` | 实训提交列表：顶部返回 + 任务摘要 a-descriptions(bordered，班级/截止/提交率/已评分)；状态筛选 radio（全部/已提交/已评分/已批改/已发布）；状态 tag 颜色（提交蓝/评分中 processing/已评分橙/已批改紫/已发布绿/草稿灰）；**已评分及以上行整行浅绿高亮** .graded-row（#f6ffed）；"导出Excel"按钮点击仅 message.info"导出功能开发中"；"批改"跳 `/teacher/projects/:id/review/:submissionId`；GET `/teacher/projects/:id`、GET `/teacher/projects/:id/submissions` |
| `/teacher/projects/:id/review/:submissionId` | `views/teacher/ProjectReview.vue` | 实训提交批改（旧流程）：顶栏返回 + 学生信息 + 上一位/下一位（disabled 占位）；左文件树 + **可拖拽分隔条**（160–500px，col-resize）+ 右 Monaco 只读；底部评分面板**可拖拽高度**（200–600px，row-resize）：tabs 机器校验/AST 分析/AI 评审（得分 24px 加粗，≥80 绿/≥60 橙/其他红，反馈块）；综合得分公式文本 + 教师调整（input-number 0–100 步进 0.5 + 评语 + 保存/发布成绩(绿色 #52c41a)/重新评分）；"重新评分"2s 后延迟刷新；GET `/teacher/projects/:id/submissions/:submissionId`、GET `.../file`、PUT `.../review`、POST `.../regrade` |
| `/teacher/review/project/:submissionId` | `views/teacher/ProjectReviewNew.vue` | 实训题审核（新流程）：顶栏返回/题目/学生/状态 tag（待评分橙/AI已评分绿/已审核蓝/已发布绿）；VSCode IDE：资源管理器 tabs **学生提交/标准答案包**双数据源切换（切换即清空 tab 防串味，model 按"源+路径"隔离）、file-icons-js 彩色文件图标、Monaco 多 tab；底部**可折叠评分面板**（panel-slide 0.28s max-height 动画）：AI 区（AI 分数、分项明细 a-collapse、亮点✓/问题△列表、总评 + "引用到教师评语"、评分异常时红色"重试评分"按钮）、教师区（最终分数/评语/审核通过，published 后 locked 全部禁用）；"审核通过"即放分（学生端可见）；GET `/teacher/project-submission/:submissionId`、PUT `/teacher/submissions/:submissionId/project/review`、POST `/teacher/submissions/:submissionId/project/regrade` |

### 2.4 学生端（student）

| 路由 | 组件 | 交互要点 |
|---|---|---|
| `/student` | `views/student/Layout.vue` | 深色侧边栏 2 菜单（作业列表/查看成绩）；顶栏显示"姓名 · 学号@学校"（学校名来自 GET `/student/profile`）；下拉"我的信息"（420px modal：姓名/学号/班级列表/学校 + 修改密码 collapse 表单）与"退出登录"（Modal.confirm）；子页 tab-fade 切换 |
| `/student/assignments` | `views/student/Assignments.vue` | 作业列表：标题搜索（300ms 防抖）+ 4 档筛选 radio（全部/未完成/已完成/已出分）；状态 tag（未开始橙/已提交 processing/已出分绿/已过期红/草稿灰/未提交灰，实训题"已批改"绿）；时间双行显示（日期+时间）；**整行可点击**进入（customRow 控制 cursor，锁定/未开始/过期未交不可进）；实训题作业跳 project 路由；10s 定时刷新当前时间；GET `/student/assignments` |
| `/student/assignments/:id` | `views/student/Submit.vue` | 答题页：顶栏（返回/标题/练习模式 tag"练习 · 第 N 次"+剩余次数/总分/得分/最高分/已过期红框）；左侧题目导航（可折叠小节 + 方块按状态着色：已答暖黄/正确绿/错误红/部分橙/未答灰，激活蓝框光晕；底部"X 题未保存"橙/"草稿已同步"绿）；右侧流式答题区：材料折叠条；主观题 CodeEditor **懒挂载**（IntersectionObserver rootMargin 400px，滚动至可见才加载，"滚动至此加载编辑器"占位）＋语言 select＋格式化按钮；客观题单选/多选/判断/填空；出分后显示参考答案/正确标注/评语；草稿自动保存（1.5s 防抖 + document.hidden 立即保存 + beforeunload **keepalive fetch** + 30s 定时兜底，PUT `/student/assignments/:id/draft`）；"提交全部"（Modal.confirm 统计未作答/作答不完整，未完成时红色"仍要提交"按钮，逐题 POST `/student/assignments/:id/submit` 后 allSettled 汇总）；**截止时间到自动强制提交**（setTimeout → forceSubmitAll → Modal.info"考试时间已截止"）；练习模式 2s 轮询评分状态并刷新参考答案；"重新答题"Modal.confirm + POST `/student/assignments/:id/retry`；状态流转 draft→submitted→ai_graded→reviewed→published（页面按状态切换只读/显示分数）；GET `/student/assignments/:id` |
| `/student/assignments/:assignmentId/project/:questionId` | `views/teacher/ProjectQuestionEdit.vue`（props mode=student） | 学生实训题答题：只读标题/难度 tag/满分；"题目描述/评分标准"只读 modal；阶段一圆形上传（提示"点击上传项目文件"）→ 阶段二 IDE 预览；**提交答案** POST `/student/assignments/:assignmentId/project/:questionId/submit`（multipart，返回新版本号 "已生成第 N 个版本"）；学生成绩卡片（R4 唯一放分开关：仅 reviewed/published 显示分数与教师评语，submitted 显示"已提交，待评分"+LoadingOutlined，其余"未提交"）；GET 同路径加载题目与历史提交 |
| `/student/scores` | `views/student/Scores.vue` | 我的成绩：无数据 a-empty"暂无成绩"；表格（作业/提交次数/分数）；练习模式显示"（最高 X）"；GET `/student/scores` |

### 2.5 共享组件

| 组件 | 交互/视觉要点 |
|---|---|
| `components/DataTable.vue` | 列表页通用骨架：a-card 包裹 a-table（sticky 表头 + 动态滚动高度 ResizeObserver，scrollY=max(200, cardH-90)）+ 固定底部分页栏（#fafafa + 上阴影）；**翻页行动画 dt-row-in**（0.35s 渐显上移 12px，前 5 行 20ms 级联延迟，翻页时表体滚回顶部）；表头/内容默认居中（centerContent prop）、无单元格底边框；中文排序提示；toolbar/toolbar-left/right/footer 插槽；clientPagination 前端切片；page-change/update:current/update:pageSize 事件 |
| `components/RichEditor.vue` | TipTap 富文本：工具栏 18 个按钮（加粗/斜体/下划线/删除线/行内代码/高亮(背景#fff3cd)/颜色选择器/标题 H2H3/左中右对齐/无序有序任务列表/引用/代码块/链接(prompt 输入)/图片(prompt 输入)/表格/分割线/撤销/重做）；插入表格自绘 modal（Teleport 到 body，遮罩 rgba(0,0,0,.3)）；聚焦态边框变蓝 + 2px 光晕（transition 0.2s）；placeholder 通过 data-placeholder 伪元素；深色代码块 #282c34 |
| `components/CodeEditor.vue` | Monaco 封装：minimap 关、fontSize 14、tabSize 4、lineNumbers on、automaticLayout；暴露 format()（JS/TS/JSON/CSS/HTML/Markdown 用原生 formatDocument；C 系走自研 braceFormat 缩进；其他 reindentSelectedLines）；language 变化 watch 切换 model 语言 |
| `components/ProjectZipUploader.vue` | zip 上传（composable `useProjectUpload`：过滤重打包 + 50MB 上限 + 状态）：未选择时整页居中 56px 圆形虚线按钮（"+"/LoadingOutlined 旋转，"正在解析中..."提示，processing 时 upload-pulse 呼吸动画）；错误 a-alert 可关闭；文件树 a-tree（文件夹金色 FolderOutlined #dcb67a，文件 file-icons-js 彩色图标，目录加粗）；外部 treeData（回看/提交后）优先显示且默认全展开；已选文件后选择按钮消失（不支持重新选择）；emit update:package/ready/select/error |

---

## 3. 全局交互与实时推送清单

### 3.1 HTTP 层（client/src/api/request.js）

- baseURL：`import.meta.env.VITE_API_BASE_URL || '/api'`，timeout **30000ms**
- 请求拦截：从 localStorage 取 token 注入 `Authorization: Bearer <token>`；**教师角色自动注入 schoolId 查询参数**（user.role==='teacher' && user.currentSchool?.id）
- 响应拦截：`res.data.code !== 0` → `message.error(res.data.message)`；**HTTP 401 → 清空 localStorage token/user → window.location.href = '/login'`**（整页跳转）；其他错误 → `message.error(err.response?.data?.message || '网络错误')`
- 所有页面请求统一走该实例（例外：QuestionEdit 的试卷 SSE 解析、Submit 的 beforeunload keepalive 草稿保存使用原生 fetch，路径均为 `/api/...` 并手动携带 Bearer token）

### 3.2 路由守卫（client/src/router/index.js）

- history base `/exam/`；守卫读 localStorage token/user；`/login` 已登录→按角色跳转；`/doc` 放行；无 token→`/login`；meta.role 不匹配→`/login`；兜底路由 `/:pathMatch(.*)*` → `/login`

### 3.3 Store（client/src/stores/user.js）

- token/user 与 localStorage 双向同步（safeGet/safeSet/safeRemove 容错）；computed：isLoggedIn / role / currentSchool / teacherSchools；方法：setAuth / setCurrentSchool / logout
- `stores/reviewStore.js`：模块级 savedSortField/savedSortOrder/savedPage，供 Review→ReviewClass 跨路由持久排序与分页（离开 Review 页时重置）

### 3.4 应用壳（client/src/App.vue + main.js + style.css）

- main.js：全量引入 antd、zh_CN locale、dayjs zh-cn、注册 Pinia/Router
- App.vue：a-config-provider 主题 token（borderRadius **8**、colorPrimary **#0066cc**、fontFamily "SF Pro Text..."、fontSize **15**；组件级：Button/Card/Modal/Table 圆角 18、Tag 胶囊 9999）；路由出口外层 transition page-fade out-in
- style.css：Apple 风设计变量（--blue #0066cc、--canvas-parchment #f5f5f7、--ink #1d1d1f、--hairline #e0e0e0、圆角 8/11/18/9999、SF Pro 字体）；深色侧边栏覆盖（ant-layout-sider-dark/ant-menu-dark 黑色 + 隐藏选中下划线）；.form-modal 宽 1040；768px 移动端（表格横滚、弹窗全屏、按钮缩小）

### 3.5 Socket.IO 实时推送（仅 2 处消费点，模式完全相同）

| 页面 | 连接 | 事件 | 数据更新 |
|---|---|---|---|
| `views/teacher/Review.vue` | io(VITE_WS_URL 或 path /exam/socket.io，transports websocket+polling) | connect→emit join-school(currentSchool.id)；on graded | 3 秒节流后重新 fetch 审核总览列表；卸载时 emit leave-school + disconnect |
| `views/teacher/ReviewClass.vue` | 同上 | 同上 | 3 秒节流后重新 fetch 班级审核列表 |

学生端无 socket：练习模式评分结果依赖 **2s 轮询**（Submit.vue）；其余列表均依赖手动刷新/重新进入页面。

---

## 4. 动效与视觉特征清单

1. **全局主题（Apple 风）**：主色 #0066cc、底色 #f5f5f7、深色侧边栏纯黑、圆角体系 8/11/18/9999、SF Pro 字体族；antd token 集中定义于 App.vue（borderRadius 8、fontSize 15、Card/Modal/Table 18、Tag 9999）。
2. **页面切换动画**：App.vue page-fade（0.2s opacity + translateY ±8px，mode out-in）；三个角色 Layout 内 tab-fade（0.15s opacity）。
3. **顶栏毛玻璃**：52px、rgba(255,255,255,0.92) + backdrop-filter: saturate(180%) blur(20px)（@supports 降级），底部 1px 阴影。
4. **DataTable 翻页行动画**：dt-row-in（0.35s 渐显上移 12px，前 5 行 20ms 级联延迟）+ 翻页时表体滚动归零 + 底部分页栏上阴影。
5. **编辑器/题目编辑动画群**（QuestionEdit/ProjectQuestionEdit）：kind-pick-switch（0.25s scale 0.9）、panel-switch、collapse（max-height 过渡）、sq-list/item-list/opt-list 列表增删动画、小题 tab 平滑滚动、上传按钮 upload-pulse 呼吸、Monaco smoothScrolling + cursorBlinking smooth。
6. **状态指示动画**：spinner-dot（8–10px 旋转 0.8s，用于"待评分/AI已评分/评分中"）、LoadingOutlined spin、a-spin；doc-spinner 文档用。
7. **折叠/展开动效**：材料条箭头 rotate 180°、导航小节 max-height 0.3s + opacity 0.2s、ProjectReviewNew 评分面板 panel-slide（max-height 250px 0.28s）。
8. **状态着色体系**：导航方块 4 色（绿/红/橙/灰）+ 激活蓝框光晕；得分分级（≥80 绿/≥60 橙/低红）；卡片对错边框色（绿 #b7eb8f / 红 #ffccc7）；已评分行整行浅绿。
9. **加载态**：所有列表页 loading 由 DataTable/表格 spinner 承载；按钮级 loading（提交/保存/审核/发布/上传/测试/重评）；Monitor 自动刷新开关 tag 绿"自动刷新 开"。
10. **响应式**：768px（顶栏/内容 padding 收缩、用户名隐藏、表格字号 13px、弹窗 max-width 100vw-24px）；992px（侧栏折叠为 0 并自动收起，Doc 隐藏侧栏导航）。

---

## 5. UI 冻结审核检查单

> 后续任何 diff（含重构）必须逐项确认**无变化**。逐文件对照基线版本 `9e9efe9` 的 `client/` 目录。

### 5.1 硬性禁止（任何一项变化即违反铁律）

- [ ] **模板结构**：所有 `client/src/views/**/*.vue` 与 `components/*.vue` 的 DOM 层级、标签、v-if/v-for 条件、插槽名（toolbar-left/right、bodyCell、title、icon、overlay 等）不变
- [ ] **样式类**：scoped/全局 class 名、CSS 变量名（--blue/--ink/--canvas-parchment/--hairline/--radius-* 等）、antd 组件 props（size/type/shape/loading/disabled/bordered/wrap-class-name）不变
- [ ] **文案**：所有中文/英文文案、placeholder、title/tooltip、Modal.confirm 标题与内容、message 提示语、tag 文本（如"团队共享班级 · 只读""已提交，待评分""导出功能开发中"）逐字不变
- [ ] **交互回调**：点击/回车/失焦/选择/确认回调顺序与行为、Modal.confirm 的 okText/cancelText/onOk、防抖时长（300ms 搜索、1.5s 草稿、2s 自动保存、3s socket 节流、2s 练习轮询、30s 监控刷新、10s 时间刷新）、keepalive/beforeunload/visibilitychange 处理不变
- [ ] **路由**：router/index.js 的路径、name、meta.role、重定向、守卫逻辑（token/user 读取、/login、/doc 放行）不变；页面内所有 router.push/$router.back/go(0)/window.open 目标不变
- [ ] **动画**：所有 CSS transition/animation/keyframes 名称、时长、缓动、延迟、mode（out-in）；antd 动画开关不变
- [ ] **布局**：侧边栏宽度（160/80/0）、顶栏高度（52px）、内容 padding（80px 48px 40px / 768px 收窄）、弹窗尺寸（420/520/560/640/720/1040）、负 margin 全屏页（-28px -48px -40px）不变
- [ ] **加载态**：loading 绑定目标、按钮 loading 文案切换（"提交中..."/"正在解析中..."）、disabled 规则（团队共享只读、published 锁定、无班级禁新增）不变

### 5.2 允许（仅限以下三类）

- [ ] **新增文件**：不触碰任何现有 UI 文件的新建模块
- [ ] **纯逻辑挪动**：函数/组件内部实现搬到新位置（composable/service/util），**对外行为、返回结构、导出名必须逐字节等价**
- [ ] **import 路径变化**：仅 import 语句的路径字符串变化（模块内导出符号名与签名不变）；新增相对路径访问需保持深度等价

### 5.3 特别核对点（重构高发区）

- [ ] api 层：`request.js` 拦截器的 token 注入、schoolId 注入、401 跳转、code!==0 message 必须原样保留
- [ ] `DataTable.vue` props/emits/插槽/翻页动画（被 20+ 页面复用，一改全崩）
- [ ] 三个 Layout 的菜单高亮映射（path 前缀）与子页自动折叠行为
- [ ] `ProjectQuestionEdit.vue` 双模式（teacher/student）分支与 props（mode）签名
- [ ] 原生 fetch 路径（SSE 试卷解析、keepalive 草稿）不得改走 axios、不得改 URL
- [ ] localStorage key（token/user/exam_question_settings）不变
- [ ] 全局 style.css 的覆盖规则（ant-menu-dark、.form-modal、移动端 media query）不变

---

## 6. 附：基线统计

- 页面组件（views）：**30 个**（admin 7 + teacher 17 + student 4 + 根目录 Login/Doc 2）
- 共享组件（components）：**4 个**（DataTable / RichEditor / CodeEditor / ProjectZipUploader）+ 根壳 App.vue
- 路由记录：**38 条**（含 3 个 redirect、1 个兜底）
- API 模块：request.js + projects.js（12 个实训 API）；stores：user.js + reviewStore.js
- Socket 消费点：2 处（Review.vue、ReviewClass.vue）
