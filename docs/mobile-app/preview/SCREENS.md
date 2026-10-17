# 移动端设计稿 · 屏幕契约（SCREENS.md）

> 本文件是「37 屏移动端高保真设计稿」的**唯一施工契约**：屏幕清单、共享演示数据、组件用法、导航与交互钩子、验收口径。
> 所有屏幕都放在 \`docs/mobile-app/preview/screens/\`，由 \`preview/index.html\` 汇总为可评审的设计总览。
> 方法：skill \`afrexai-ui-design-system\` Phase 1–10 ｜ 基线：390×844（iPhone 14/15），360–430 自适应。

---

## 1. 目标（先读这段，避免把页面做成桌面缩水版）

移动端不是把桌面表格压窄，而是**按场景重排**：

| 角色 | 移动端真实场景 | 因此 |
|---|---|---|
| 学生 | 宿舍/教室用手机做客观题、看截止、查成绩 | 作答链路 3 步内完成；代码题诚实引导到电脑 |
| 教师 | 碎片时间看进度、审一两份、催交、临时布置 | 逐份审核队列 + 卡片替代表格 + 底部固定主操作 |
| 管理员 | 出差时看系统是否正常 | 只读概览/监控；高风险配置引导电脑 |
| 全部 | 单手、拇指、地铁弱网、深色环境 | 触控 ≥44px、四态完整、安全区、深色可用 |

**设计原则**：一屏一事 / 数据先行 / 状态显性（loading·empty·error·offline 四态）/ 密度分级 / 克制动效。

---

## 2. 通用约定（每个屏幕都必须遵守）

### 2.1 文件骨架

\`\`\`html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f6f7f9">
  <title>页面名 · 移动端设计稿</title>
  <link rel="stylesheet" href="../../../../client/src/styles/tokens.css">
  <link rel="stylesheet" href="../../02-design-tokens.css">
  <link rel="stylesheet" href="../assets/screen.css">
</head>
<body class="screen" data-screen="teacher-home" data-bottom="tabbar">
  <div data-tabbar="teacher" data-active="home"></div>
  <div class="app">
    <header class="appbar">…</header>
    <main class="scroll">…</main>
  </div>
  <script src="../assets/screens.js"></script>
  <script src="../assets/screen.js"></script>
</body>
</html>
\`\`\`

- 状态栏与底部 Tab **由 \`screen.js\` 自动注入**，不要手写。
- \`body[data-bottom]\`：有 Tab 用 \`tabbar\`；有底部主按钮用 \`actionbar\`；都没有用 \`none\`；页面主体被 Sheet 遮住用 \`sheet\`。
- 不要在屏幕里写 \`<html data-theme>\`：主题由 URL 参数 \`?theme=light|dark\` 与 Gallery 的 postMessage 控制。
- 页面独有的装饰样式可写在页内 \`<style>\`，但**必须使用令牌变量**，且样式类加页面前缀避免污染。

### 2.2 视觉与令牌

- 颜色/字号/间距/圆角/阴影**只用变量**：桌面令牌 \`--brand-600 / --bg-canvas / --card-bg / --text-* / --status-* / --score-*\`；移动层 \`--m-*\`。**禁止写死 hex 色值**（QR 与代码高亮除外）。
- 字体不引外部字体；中文用令牌 \`--font-sans\`。
- 正文 15px / 行高 1.6；卡片标题 16px；辅助 13px；注释 12px。标题字重 600–700。
- 卡片：白底 + 1px \`--border-default\` + 16px 圆角 + 16px 内边距；**优先描边分层，不滥用阴影**。
- 图标统一用 \`data-icon\`（线性 1.8px）：\`<span data-icon="back"></span>\`、\`<button class="iconbtn" data-icon="more" aria-label="更多"></button>\`。
  可用图标见 \`assets/screen.js\` 的 \`ICONS\`（back / more / search / bell / home / assignments / review / user / users / scores / chart / activity / clock / calendar / filter / download / upload / refresh / share / code / qr / copy / edit / trash / star / alert / info / wifi-off / logout / moon / sun / settings / eye / link / file / folder / message / arrow-right / lock / play / grid / sort / external / book / zap / logo / check-circle / x-circle / inbox / archive / pin / rotate-ccw 等）。
- **不引入任何外部图片 / CDN / 网络字体 / 图标库**。品牌图形用 CSS + 内联 SVG 表达；二维码用 \`<div class="qr" data-qr></div>\`（runtime 自动绘制）。

### 2.3 交互钩子（都可以直接用）

| 钩子 | 作用 |
|---|---|
| \`data-goto="screen-id"\` | 跳转到另一屏（Gallery 内切换，单独打开时改 location） |
| \`data-open-sheet="sheet-id"\` | 打开页面内 Sheet（需配套 \`.mask[data-for]\` 与 \`.sheet#sheet-id\`） |
| \`data-close-sheet\` | 关闭所在 Sheet / 点遮罩关闭 |
| \`data-tab="name"\` + 父级 \`data-tabgroup\` | 页内分段/页签切换；对应面板 \`data-tabpanel="name"\` |
| \`data-select-group\` + 子项 \`data-select\` | 单选/多选样式切换（客观题选项、题目选择卡） |
| \`data-switch\` | 开关切换（默认应带 \`role="switch" aria-checked\`） |
| \`data-check\` | 勾选框切换 |
| \`data-qr\` | 渲染二维码占位 |

### 2.4 无障碍底线

- 所有 \`<button>\` 有可访问名（文字或 \`aria-label\`）；纯图标按钮必须 \`aria-label\`。
- 触控目标 ≥44×44px；相邻可点元素间距 ≥8px。
- 状态**不只靠颜色**：状态标签同时带文字/图标；选中态同时有底色 + 勾选/描边。
- 表单 label 与输入框关联（\`for/id\`）；错误信息在字段下方并说明如何修正。
- 深色主题下所有文字对比度 ≥4.5:1（用令牌即可，避免自造色）。
- 装饰性 SVG 一律 \`aria-hidden="true"\`。

### 2.5 内容要求

- **真实中文产品文案**，不要 Lorem、不要 "TODO"、不要占位符乱码；数值/日期/姓名用第 3 节共享演示数据，保证跨屏一致。
- 每屏内容要「填满但不溢出」：底部内容可滚动，首屏必须能读到页面核心信息。
- 每屏至少体现一种**状态或细节**（如错误态、空态、进度、时间、权限提示），不要全部是 happy path。
- 不需要做「返回上一页」真实路由，\`data-goto\` 指到合理的上级页面即可。

---

## 3. 共享演示数据（跨屏一致，直接使用）

### 3.1 人物

| 角色 | 姓名 | 身份 | 备注 |
|---|---|---|---|
| 教师 | **周子轩** | Deadpan 大学 · 计算机学院 · 工号 T2026001 | 登录账号 \`T2026001\` |
| 学生 | **李明** | Deadpan 大学 · 计算机 2301 班 · 学号 2026001004 | 登录账号 \`2026001004\` |
| 管理员 | **王建国** | Deadpan 大学 · 信息中心 · 超级管理员 | 登录账号 \`admin\` |
| 学生（审核对象） | 陈嘉懿 2025010101 / 周予安 2025010104 / 李思远 2025010107 / 赵可欣 2025010112 / 王雨桐 2025010115 | 计算机 2301 班 | — |

### 3.2 教师侧作业（2026 秋季学期）

| 作业 | 状态 | 班级 | 题数 | 提交进度 | 截止 | 备注 |
|---|---|---|---|---|---|---|
| Java 程序设计期末考试 | 已发布 | 计算机 2301 班 | 12 | 45/45 | 2026-09-28 23:59 | 均分 82.4 |
| 用户管理系统（前端）实训 | 待审核 12 | 计算机 2301/2302 班 | 3 | 38/45 | 2026-10-08 23:59 | 实训题（工程包） |
| 数据结构实验三：图的最短路径 | AI 评分中 7 | 计算机 2302 班 | 6 | 12/43 | 2026-10-20 23:59 | 剩余 3 天 14 小时 |
| 数据库原理期中测验 | 草稿 | 软件 2201 班 | 20 | 0/40 | 2026-10-24 23:59 | 客观题 20 道 |

学生 李明 的作业列表：

| 作业 | 状态 | 关键信息 |
|---|---|---|
| 数据结构实验三：图的最短路径 | 进行中 | 今晚 23:59 截止 · 6 题已答 4 题 · 任课教师 周子轩 |
| 用户管理系统（前端）实训 | 已提交 · 待评分 | 提交于 2026-10-08 21:14 · 工程包 6.3MB · 368 个文件 |
| Java 程序设计期末考试 | 已评分 92 | 6 题 · 用时 96 分钟 · 满分 100 |
| 数据库原理期中测验 | 未开始 | 开放 2026-10-20 09:00 · 20 题 · 限时 60 分钟 |

### 3.3 审核对象（教师端）

- 陈嘉懿 2025010101 · 提交于 2026-10-17 16:22 · AI 92 / 100
  - 分项：功能完整 45/50 · 代码规范 22/25 · 异常处理 25/25
  - AI 评语：「思路清晰，边界条件处理到位；建议补充对大数组的场景的性能说明。」
- 周予安 2025010104 · AI 88 · 待评分
- 李思远 2025010107 · 未提交
- 赵可欣 2025010112 · AI 76 · 待评分
- 王雨桐 2025010115 · AI 94 · 已评分

队列进度：**5 / 12**（第 5 份为陈嘉懿）。

### 3.4 学生成绩（李明）

> 口径说明：作业 Tab 展示「近期 4 份作业」；成绩页展示「已出分 / 待出分」课程（含历史课程），两者不是同一集合，数值以各屏为准。

- 总分 **92**（满分 100）· 班级均分 82.4 · 等级 A · 超过 86% 同学
- 构成：客观题 28/30 · 编程题 52/60 · 过程分 12/10（含加分）
- 逐题（客观 4 + 编程 2，合计 80 分；另过程分 12 分）：第 1 题 6/6、第 2 题 8/8、第 3 题 6/8、第 4 题 8/8、第 5 题 24/30、第 6 题 28/30
- AI 评语：「查询语句正确，索引选择理由充分；第 3 题缺少边界条件说明。」

### 3.5 管理员侧

- 学校 **Deadpan 大学**（计算机学院 + 3 个学院）· 用户 1,286 · 班级 42 · 教师 96 · 在线 318
- 今日 AI 评分任务 1,203（完成 1,180 / 进行中 23）· 今日异常 2（1 个 5xx、1 个超时）
- 监控：在线 318 人 · 评分队列 23 · 平均响应 186ms

### 3.6 时间与状态文案

- 状态栏时间统一 **16:32**（runtime 自动注入）；演示日期统一 **2026-10-17（周六）**，相对时间按此基准推算。
- 相对时间用：今天 23:59 / 明天 08:00 / 剩余 3 天 14 小时 / 10 分钟前。
- 登录错误文案：「账号或密码不正确，还可尝试 4 次」；网络错误：「网络连接失败，请检查网络后重试」。

---

## 4. 屏幕清单与逐屏要求

> 分组/标题与 \`preview/assets/screens.js\` 注册表一致。每屏都要：状态栏（自动）+ 内容 + 必要的导航；有 Tab 的页面保持 Tab 选中态正确。
> 「导航」列是作品内可点击跳转的目标，用 \`data-goto\` 实现。

### 4.1 公共与认证（6 屏）

| id | 页面 | 必须包含 | 导航 / 交互 |
|---|---|---|---|
| \`public-landing\` | 移动官网 | 品牌栏（Deadpan 判题 logo）· 大标题「让 AI 评分可被信任」· 角色能力卡（教师/学生/管理员）· 3 条产品要点 · 主 CTA「登录控制台」· 页脚版本号 | CTA → \`public-login\`；要点可滚动 |
| \`public-login\` | 登录 | 品牌 + 「欢迎回来」· 账号/密码输入（密码可见切换）· 记住我开关 · 主按钮「登录」· 错误态 banner（账号或密码不正确）·「使用文档」链接 · 底部版权 | 登录 → \`teacher-home\`（演示用）；文档 → \`public-doc\` |
| \`public-doc\` | 使用文档 | 搜索框 · 目录卡（快速开始/班级/作业/审核）· 文章正文（标题 + 步骤 + 提示框）· 上一节/下一节 | 点目录项切换高亮（data-tab 或静态） |
| \`error-404\` | 404 | 大号 404 · 「页面不存在或已被移动」· 当前地址（可复制）· 「回到首页」主按钮 + 「返回上一页」次按钮 | → \`public-landing\` / 返回 |
| \`error-403\` | 403 | 锁图标 · 「此页面需要教师权限」· 当前身份卡（李明 · 学生）· 「回到我的作业」主按钮 · 「切换账号」文字按钮 | → \`student-home\` |
| \`error-500\` | 500 | 大号 500 · 「服务暂时不可用」· 错误编号 \`ERR-20261017-500\` · 重试主按钮 + 返回次按钮 · 小字「若持续出现请联系管理员」 | 重试可展示 loading 状态 |

### 4.2 学生端（11 屏）

| id | 页面 | 必须包含 | 导航 / 交互 |
|---|---|---|---|
| \`student-home\` | 首页（Tab 1） | 问候「下午好，李明」+ 头像 · 今日待办卡（今晚 23:59 截止 + 剩余 2 题 + 继续作答按钮）· 快捷入口（作业/成绩/文档）· 最近成绩条（92 · Java 期末）· 底部 Tab（作业角标 2） | 继续作答 → \`student-answer-objective\`；作业 → \`student-assignments\`；成绩 → \`student-scores\`；我的 → \`student-profile\` |
| \`student-assignments\` | 作业列表（Tab 2） | 页标题「我的作业」+ 说明 · 筛选胶囊（全部/进行中/待评分/已评分，含计数）· 今晚截止提醒 banner · 4 张作业卡（标题/状态 tag/截止/进度/主次按钮）· 卡片按状态语义着色 | 进行中卡 → \`student-assignment-detail\`；已提交 → \`student-assignment-done\`；已评分 → \`student-score-detail\` |
| \`student-assignment-detail\` | 作业详情 | 返回栏 + 标题 · 状态 tag · 考试信息卡（截止/限时/满分/题数/任课教师）· 题目列表（6 题，客观题/编程题类型标签 + 分值 + 已答状态）· 提醒 banner（可提前交卷）· 底部动作条「开始作答 / 继续作答」 | 开始 → \`student-answer-objective\`；返回 → \`student-assignments\` |
| \`student-answer-objective\` | 作答 · 客观题 | 顶部：返回（二次确认）· 题目 3/6 · 倒计时 42:18 · 「答题卡」按钮（角标 4/6）· 题干 + 分值 + 题型 · 4 个选项（单选 selected 态）· 标记本题 + 上一题/下一题 · 底部动作条「下一题」/「交卷」 | 答题卡 → \`student-answer-sheet\`；下一题切到编程题 → \`student-answer-code\` |
| \`student-answer-code\` | 作答 · 编程题 | 顶部同作答页 · 编程题题干（含代码块/输入输出说明）· **电脑作答接力卡**：二维码（data-qr）+「扫码在电脑打开」+ 复制链接 · 已保存草稿状态（16:30 自动保存）· 说明「手机不推荐写代码，可先完成客观题」· 底部动作条「标记稍后 / 提交本题」 | 答题卡 → \`student-answer-sheet\`；复制→toast 态 |
| \`student-answer-sheet\` | 答题卡（Sheet） | 暗底遮罩 + 底部 Sheet：已答 4/6 进度条 · 题号宫格（已答/当前/未答/标记四态）· 图例 · Sheet 底部「继续作答」主按钮 · 交卷文字按钮 | 继续作答/遮罩关闭；交卷 → \`student-submit-confirm\` |
| \`student-submit-confirm\` | 交卷确认（Sheet） | 遮罩 + Sheet：警告「还有 2 题未作答」· 已答/未答统计 · 剩余时间 42:18 · 「提交后不可修改」提示 · 主按钮「确认交卷」+ 次按钮「继续作答」 | 确认 → \`student-assignment-done\`；继续 → 关闭 Sheet（回到作答页） |
| \`student-assignment-done\` | 已提交详情 | 成功图标 + 「已提交」· 提交时间/用时/文件数 · 评分进度时间线（已提交 → AI 评分中 → 教师审核 → 发布成绩）· AI 评分中提示 · 返回作业列表按钮 | 返回 → \`student-assignments\`；成绩 → \`student-scores\` |
| \`student-scores\` | 成绩列表（Tab 3） | 学期成绩概览卡（平均分 85.3 · 班级排名 6/45 · 已出分 3/4）· 分数等级分布小条（优秀/良好/及格）· 已出分作业列表（92/88/76，等级 + 查看反馈）· 待出分项（待评分 tag） | 查看反馈 → \`student-score-detail\`；Tab 切换 |
| \`student-score-detail\` | 成绩详情 | 返回栏 + 作业名 · 大分数 92/100 + 等级 A + 班级均分 · 分数构成（客观/编程/过程分进度条）· 逐题得分列表 · AI 评语卡（ai-note）· 教师评语（若有）· 「查看原卷」次按钮 | 返回 → \`student-scores\` |
| \`student-profile\` | 我的（Tab 4） | 身份卡（头像/姓名/学号/班级/学校）· 数据条（已完成 3 · 平均分 85.3）· 设置组（深色主题 switch / 字号 / 通知 / 使用文档 / 关于）· 退出登录（danger 样式，二次确认可留静态） | 文档 → \`public-doc\`；主题 switch 可切；Tab 切换 |

### 4.3 教师端（14 屏）

| id | 页面 | 必须包含 | 导航 / 交互 |
|---|---|---|---|
| \`teacher-home\` | 工作台（Tab 1） | 问候「下午好，周老师」+ 头像 · 待办三卡（待审核 12 / 进行中 3 / AI 评分中 2）· 快捷入口 4 个（布置作业/题库/班级/扫码审核）· 「最近作业」2 条（进度条 + 状态）· 待审核提醒 banner · 底部 Tab（审核角标 12） | 待审核 → \`teacher-review-queue\`；布置作业 → \`teacher-assign-wizard\`；题库 → \`teacher-questions\`；班级 → \`teacher-class\`；Tab 切换 |
| \`teacher-assignments\` | 作业列表（Tab 2） | 标题 + 搜索框 · 状态胶囊（全部/进行中/待审核 12/已结束）· 作业卡片 3-4 张（标题/状态/班级/提交进度条/截止）· 一张卡片左滑露出「锁定 / 复制链接」（静态展示）· 底部 Tab | 卡片 → \`teacher-assignment-detail\`；Tab 切换 |
| \`teacher-assignment-detail\` | 作业详情 | 返回 + 标题 + more · 状态 tag · 进度卡（ring 84% + 已交 38/45 + 未交 7 + 截止）· 主次按钮「催交 / 导出」· 分段（提交 38 / 题目 3 / 概况）· 学生行列表（陈嘉懿 92 已评分 / 周予安 待评分 / 李思远 未提交）· 底部动作条「查看评分与审核」 | 审核 → \`teacher-review-queue\`；催交 → toast/banner 态 |
| \`teacher-review-queue\` | 评分审核（Tab 3） | 返回/关闭 + 「评分审核」+ 进度 5/12 + 完成按钮 · 队列进度条 · 学生卡（陈嘉懿/学号/提交时间 · AI 92 大分 + 分项 45/50·22/25·25/25 · AI 评语折叠）· 手势提示「上下滑切换 · 底部按钮审核通过」· 底部「改分 / 审核通过」双按钮 | 改分 → \`teacher-review-detail\`；通过 → 下一位（可静态）；Tab 切换 |
| \`teacher-review-detail\` | 审核详情 · 评分 | 返回 + 标题 + 完成 · 学生信息条 · 分数卡（AI 92 + 可改分输入 + 分项）· 分段（评分/代码/参考）· AI 评语卡 + 教师评语输入（textarea）· 快捷评语 chips · 底部动作条「打回 / 通过」 | 代码 tab → \`teacher-review-code\`；通过 → 队列 |
| \`teacher-review-code\` | 代码只读 + 选区 | 顶部返回 + 「陈嘉懿的提交」+ 第 1 题/第 2 题/差异 tab · 文件名条 UserTable.vue · 深色代码面板（行号固定、12+ 行、1 处长按选中高亮）· 浮层选区菜单（引用到评语/复制/搜索）· 底部工具（Aa- / Aa+ / 换行 / 复制）· 底部动作条「改分 / 审核通过」 | 差异 tab → \`teacher-review-diff\`；工具可静态 |
| \`teacher-review-diff\` | 代码差异 | 返回 + 「代码对比」+ 「只看差异」switch · 文件头（App.vue · 差异 4 处）· 逐块折叠 diff：相同 6 行折叠条 + 新增/删除块着色 + 行号 · 底部提示「2 处行为差异，可一键引用到评语」· 动作条「只看差异 / 引用差异到评语」 | 返回 → \`teacher-review-code\` |
| \`teacher-batch-select\` | 批量审核 · 多选 | 返回 + 「批量审核」+ 完成 · 已选 3 项 + 全选本页/取消 · 学生行列表（勾选态 3 个 + 未选 2 个，分数 tag）· 底部批量操作条「审核通过 (3)」+「更多」 | 完成退出 → 队列页；勾选可切换（data-check） |
| \`teacher-batch-confirm\` | 批量审核 · 确认 | 返回/关闭 + 「批量审核」· 筛选条件 chips（AI 分 90–100 / 未审核 / 已评分 / 全部班级）· 命中 12 份 · 影响范围卡（发布 12 份 / 分数<60 共 2 份建议复核 / 含教师评语 4 份）· 危险提示 banner「发布后学生立即可见，且不可撤销」· 底部「先看这 2 份 / 确认发布 12 份」 | 先看风险 → 队列；确认 → 二次确认（不提供撤销） |
| \`teacher-assign-wizard\` | 布置作业 · 4 步 | 关闭 X + 「布置作业」+ 存草稿 · 步骤条（1 基本信息 2 选题 3 班级 4 确认，当前第 2 步）· 搜索 + 题型 chips（编程题/实训题/最近用过）· 选题列表（勾选态）· 已选 summary · 底部「上一步 / 下一步」 | 步骤可切换（data-tab 或静态高亮）；关闭 → \`teacher-assignments\` |
| \`teacher-questions\` | 题库 | 返回 + 「题库」+ 新建 · 搜索 + 筛选 chips（全部/编程题/实训题/客观题）· 题目卡列表（标题/题型 tag/分值/更新时间/使用次数）· 底部说明「移动端仅预览，编辑请在电脑端」· 无 Tab（二级页） | 卡片 → 预览态（可留静态）；新建 → 提醒用电脑；返回 → \`teacher-home\` |
| \`teacher-class\` | 班级详情 | 返回 + 「计算机 2301 班」+ more · 班级统计（45 人 / 已交 38 / 待批 12）· 作业进度列表（3 条）· 学生搜索 + 学生卡列表（姓名/学号/分数/状态）· 底部说明 | 返回 → \`teacher-home\`；学生卡可跳队列 |
| \`teacher-profile\` | 我的（Tab 4） | 身份卡（周子轩 · 教师 · Deadpan 大学计算机学院）· 通知提醒 switch · 深色主题 switch · 字号大小 · 「切换到桌面版」入口 · 关于与帮助 · 退出登录 · 底部 Tab | 主题 switch 生效；桌面版 → toast 说明；Tab 切换 |
| \`teacher-code-unsupported\` | 手机编辑说明 | 返回 + 「编辑标准答案」· 说明卡「手机不提供代码编辑」3 条原因（软键盘/无补全/误触）· 接力方式一：二维码 + 复制链接（10 分钟有效）· 方式二：导出文件 / 上传修改后的文件 · 黄色提示 banner · 底部「在电脑上打开」主按钮 | 返回 → \`teacher-review-code\`；复制 → toast |

### 4.4 管理端（3 屏）

| id | 页面 | 必须包含 | 导航 / 交互 |
|---|---|---|---|
| \`admin-home\` | 管理概览 | 问候 + 管理员身份 · KPI 卡（用户 1,286 / 班级 42 / 在线 318 / 今日评分 1,203）· 系统状态卡（服务正常/评分队列 23/平均响应 186ms，用状态 tag）· 今日异常列表（2 条，含时间与级别）· 快捷入口（组织目录/监控/管理后台）· 只读提示 | → \`admin-directory\` / \`admin-monitor\`；Tab 切换 |
| \`admin-directory\` | 组织目录 | 标题 + 搜索 · 分段（学校/班级/教师/学生）· 列表行（班级名/人数/教师；或用户行）· 只读说明 banner「新增/编辑/导入请在电脑端完成」· 底部 Tab | 分段切换；行点击静态；Tab 切换 |
| \`admin-monitor\` | 实时监控 | 标题 + 刷新按钮 + 实时 tag（绿点）· 在线人数大数 + 趋势条 · 评分队列卡（进行中 23 / 完成 1,180）· 日志流（时间/级别/消息，3-5 条）· 「手机上仅查看，配置请用电脑」提示 · 底部 Tab | 刷新可切 loading；Tab 切换 |

### 4.5 平台与状态（3 屏）

| id | 页面 | 必须包含 | 导航 / 交互 |
|---|---|---|---|
| \`platform-install\` | PWA 安装引导 | 品牌 + 「把 Deadpan 装到桌面」· 安装收益 3 条（更快/离线/全屏）· 两种指引（iOS Safari 分享 → 添加到主屏；Android Chrome 菜单 → 安装应用）· 当前平台提示（Android 优先）· 已安装/稍后按钮 · 无 Tab | 按钮可 toast；返回 \`public-landing\` |
| \`platform-splash\` | Android 启动屏 | 深色品牌启动屏：logo + Deadpan 判题 + 「教学评测，随时可用」· 版本 v2.1.0 · 底部小字「正在检查更新…」+ 进度条 · Android 手势条（由平台参数体现）· 无状态栏（启动屏可隐藏状态栏：body data-statusbar 可用 inverse；或页面自绘） | 3s 后进入 \`teacher-home\`（静态不自动跳） |
| \`states-overview\` | 状态体系 | 用分段/页签在一个屏幕内展示四态：①空态（暂无作业）②加载骨架（3 张卡骨架）③错误态（加载失败 + 重试）④断网态（离线 banner + 灰化列表）· 每态配一句使用说明 · 无 Tab | 分段切换 data-tab；展示 loading→empty 等 |

---

## 5. 常用组件速查（class 都在 assets/screen.css）

- 骨架：\`.appbar\`（\`--left/--solid/--bordered/--transparent/--inverse\`）、\`.appbar-title\`、\`.iconbtn\`
- 容器：\`.page\`、\`.scroll\`、\`.stack\`、\`.sec\`、\`.hero\`、\`.card\`、\`.card-title\`、\`.card-sub\`、\`.card-foot\`
- 数据：\`.stats\`+\`.stat\`、\`.bar>i\`、\`.ring[style="--p:84"]\`、\`.score-hero\`、\`.score-line\`
- 按钮：\`.btn\` + \`.btn--primary/--secondary/--soft/--ghost/--danger/--danger-soft\` + \`.btn--sm/--xs/--block\`、\`.actionbar\`
- 标签：\`.tag\` + \`.tag--success/warning/danger/info/neutral/accent\`（带 \`.dot\`）、\`.badge\`、\`.chips\`+\`.chip\`、\`.seg\`
- 列表：\`.list\`/\`.rowitem\`/\`.row-main\`/\`.row-title\`/\`.row-sub\`/\`.rowicon\`/\`.chevron\`、\`.avatar\`、\`.kv\`
- 表单：\`.field\`/\`.label\`/\`.input\`/\`.textarea\`/\`.help\`/\`.error-text\`/\`.switch\`/\`.radio\`/\`.check\`/\`.option\`
- 反馈：\`.banner--info/warning/danger/success\`、\`.empty\`、\`.sk\`、\`.toast.show\`、\`.ai-note\`、\`.quote\`
- 浮层：\`.mask\` + \`.sheet\`（\`.grabber/.sheet-head/.sheet-body/.sheet-foot/.sheet-close\`）、\`.actionsheet\`
- 专用：\`.qgrid\`+\`.qnum\`（\`.done/.current/.marked\`）、\`.steps\`+\`.step\`、\`.upload\`、\`.qr[data-qr]\`、\`.handoff\`、\`.codebox/.codeline/.ln/.tk-*\`、\`.diffcard/.diffline\`、\`.readonly-tip\`、\`.searchbar\`、\`.tabs\`
- 工具：\`.muted/.subtle/.tnum/.mono/.ellipsis/.between/.grow/.mt16/.mb16\` 等

**不要自造新组件类**：优先组合已有点；确需新组件时写页内 scoped 样式（加页面前缀）。

---

## 6. 自检（提交前逐项打勾）

- [ ] 打开 \`http://127.0.0.1:8123/docs/mobile-app/preview/screens/<id>.html\`，无控制台报错、无横向滚动、内容不被 Tab/动作条遮挡。
- [ ] \`?theme=dark\` 下文字对比度正常、无亮色孤岛（代码面板固定深色属预期）。
- [ ] \`?platform=android\` 下状态栏高度/文案与 iOS 有差异（由令牌控制）。
- [ ] 触控目标 ≥44px；图标按钮有 aria-label；表单 label 关联；状态不只靠颜色。
- [ ] 导航 \`data-goto\` 指向的 id 已在 \`assets/screens.js\` 注册。
- [ ] 数值/人名/日期与本文档第 3 节一致。
- [ ] 截图自查：\`node docs/mobile-app/preview/tools/shot.mjs <id> preview/shots/<id>.png\`，再用图片查看确认。

**给写屏 agent 的命令速查**

\`\`\`bash
# 静态服务（仓库根目录；已在 8123 运行时跳过）
python3 -m http.server 8123 --bind 127.0.0.1
# 截图（浅色 iOS；深色加 --theme=dark，Android 加 --platform=android）
node docs/mobile-app/preview/tools/shot.mjs student-home docs/mobile-app/preview/shots/student-home.png
\`\`\`

---

## 7. 禁止事项

- ❌ 外部依赖：CDN、Google Fonts、unpkg、远程图片、外部图标库、网络请求。
- ❌ \`<table>\` 宽表、横向滚动表格、桌面侧栏/顶栏布局。
- ❌ lorem ipsum、乱码、空白占位图、emoji 当图标（图标一律 data-icon / 内联 SVG）。
- ❌ 硬编码十六进制颜色（代码高亮与二维码除外）、硬编码圆角/阴影/时长。
- ❌ 让内容溢出 390×844 的首屏而不提供滚动；隐藏滚动条后要保证可滚。
- ❌ 在屏幕上加 \`data-theme\` 固定值（会被 Gallery 覆盖）。
