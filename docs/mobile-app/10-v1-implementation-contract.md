# v1 移动端实现契约（10）

> 依据: 09-v1-scope-and-deferred-backlog.md（v1 零后端范围）, 08-backend-gap-and-ui-trim.md（接口边界）, 07-implementation-plan.md（完整版计划）。
> 铁律: 不修改 server/**、prisma/**、数据库迁移; 不要求后端做任何修改; 不调用不存在的接口; 不伪造数据。
> Lead 负责分配/验收/集成/提交; 子 Agent 只在各自写作用范围内改代码。

## 1. 目标

- 在现有 Vue 3 客户端新增 /m 移动端: 34 个 v1 页面（公共 6 / 学生 11 实体屏 / 教师 14 实体屏 / 平台状态 3）。
- 管理端 3 屏不注册 /m 路由（延期 D12，不取消）。
- 不改 docs/mobile-app/preview/** 设计资产; 实现只新增 client/src/mobile/** 与必要入口改动。
- 延期项由 mobileFeatures 开关关闭: 不渲染、不请求、不显示假数据。
- 不引入新依赖（Vant 不装; 使用现有 Vue/Router/Pinia/axios + 自有移动组件与设计稿 CSS）。

## 2. 目录与所有权

~~~text
client/src/mobile/
  styles/                 只由 foundation 改
  layout/                 只由 foundation 建
  components/             只由 foundation 建
  features/mobileFeatures.js
  composables/
  views/public/            public-platform agent
  views/platform/          public-platform agent
  views/student/           student agent
  views/teacher/           teacher agent
  routes.js               只由 foundation 改
~~~

共享入口只由 foundation 改: client/src/router/index.js; 如需 client/src/main.js; 不改桌面 views/components/styles。
页面 Agent 不写 routes.js/layout/components/styles/router/main.js/package.json。

## 3. 路由表

公共: /m (Landing), /m/login, /m/doc, /m/404, /m/403, /m/500, /m/platform/install, /m/platform/splash, /m/platform/states。
学生: /m/student/home, /assignments, /assignments/:id, /assignments/:id/answer, /assignments/:id/done, /scores, /scores/:assignmentId, /profile（8 路由覆盖 11 实体屏; 答题卡/交卷确认是 Answer 页内 Sheet）。
教师: /m/teacher/home, /assignments, /assignments/:id, /review, /review/:submissionId, /review/:submissionId/code, /review/:submissionId/diff, /batch, /batch/confirm, /assign/new, /questions, /classes/:classId, /profile, /code/unsupported（14 路由覆盖 14 实体屏）。
组件路径: client/src/mobile/views/{public,platform,student,teacher}/PascalCase.vue（foundation 建占位，页面 Agent 覆盖同名文件）。
不注册 /m/admin/**; 超级管理员访问 /m 显示「移动端暂不提供管理端，请用电脑端」。
守卫: 未登录受保护页 -> /m/login; 角色不符 -> /m/403; 500 -> Error500。

## 4. 共享布局与组件（foundation 先完成）

MobileLayout.vue:
- props: role(''|'student'|'teacher'), active(string), bottom('tabbar'|'actionbar'|'none')
- 结构: <div class="m-screen" :data-bottom="bottom"><div class="app"><slot/></div><MobileTabBar v-if="role" .../></div>
- 页面用法: <MobileLayout role="student" active="home" bottom="tabbar"><header class="appbar">..</header><main class="scroll">..</main></MobileLayout>
- 有底部主按钮: bottom="actionbar" + 页面末尾 <div class="actionbar">...</div>

其他组件: MobileAppBar, MobileTabBar, MobileActionBar, MSheet(v-model:open,title), MEmpty, MSkeleton, MStatusTag, MProgress, MRing, MScore, MField, MSeg, MChips, MSearchBar, MListRow; composables/useMobileToast.js(show), useCountdown.js(endTime)。
页面也可直接使用设计稿类名: appbar/scroll/card/btn/tag/chips/seg/rowitem/sheet/actionbar/empty/banner/qnum 等。
所有请求页面必须有 loading/empty/error 三态; 错误不白屏; 不填假数据。

## 5. CSS / 令牌

- 来源: docs/mobile-app/preview/assets/screen.css + docs/mobile-app/02-design-tokens.css。
- 迁移到 client/src/mobile/styles/; 所有选择器必须限定在 .m-screen 内（例如 .m-screen .card），不得污染桌面。
- 保留设计稿类名; 安全区用 env(safe-area-inset-*); 不写死 hex; 不覆盖全局 body/html。
- 页面可用 <style scoped> 写独有样式; 优先复用共享组件; 共享组件不重复实现。
- 桌面零回归: mobile CSS 只通过 .m-screen 前缀生效。

## 6. API 白名单（只许这些现存接口）

请求统一走 client/src/api/request.js（自动 token/schoolId、错误规范化）; 禁止新 axios 实例; 禁止新增/假设接口。

认证: POST /auth/login; PUT /auth/password。
学生: GET /student/assignments; GET /student/assignments/:id; PUT /student/assignments/:id/draft; POST /student/assignments/:id/submit; GET /student/scores; GET /student/profile。
教师: GET /teacher/pending-summary; GET /teacher/assignments; GET /teacher/assignments/:id; PUT /teacher/assignments/:id/lock; GET /teacher/review-summary; GET /teacher/review-class/:classId; GET /teacher/submissions; GET /teacher/submissions/:id; PUT /teacher/submissions/:id/score; PUT /teacher/submissions/:id/review; PUT /teacher/submissions/publish; GET /teacher/questions; GET /teacher/questions/:id; GET /teacher/classes; GET /teacher/students; GET /teacher/submissions/:id/project（仅实训题）; PUT /teacher/submissions/:id/project/review（仅实训题）。
禁止: /admin/**; 任何聚合/催交/通知/接力 token/批量 by ids review 接口。

## 7. v1 数据规则

1. 成绩只来自 published; 未出分不显示分数。
2. 不显示: 排名、班均、最高分、百分位、等级分布、A/B/C 等级、分数构成、逐题满分分母（可只显示得分）。
3. 教师: 通用题不显示 AI breakdown（仅实训题可请求 project 接口）; 不显示「高于班均」; 无「打回」; 审核通过=reviewed，发布是独立动作。
4. 批量: 逐条 PUT review（并发 3-5）+ 一次 PUT publish {submissionIds}; 显示进度/失败重试; 不承诺原子; 不显示「含教师评语 N 份」。
5. 作业: 不显示均分/催交; 锁定/解锁可用; 编辑/删除不出现。
6. 题库: 题型 chips 前端过滤; 不显示使用次数/最近使用。
7. 接力: 只复制 URL（电脑需登录）; 不出现「免登录/10分钟/已同步」。
8. 管理端不注册; 不得调用 /admin/**。
9. 无数据就空态/隐藏; 不得「暂未开放+假数据」。
10. v1 以「不实现」保证延期项不出 UI；mobileFeatures 是延期能力恢复时的接入开关（v1 不强制页面消费，QA P2-1 已记录）。

## 8. 代码约定

- Vue 3 script setup; 不新增依赖; 不 import Vant/monaco/tiptap。
- 相对路径 import; 不假设 @ alias。
- 用 request + try/catch 与空态/错误态; 不吞错、不伪造成功。
- 主题用 client/src/composables/useTheme.js; 登录态用 client/src/stores/user.js; 不新建全局 store。
- 不改桌面 views/components/styles; 不移动文件; 不改 package.json/lockfile。
- 页面 h1 唯一; 按钮 aria-label; 触控≥44px; 状态不只靠颜色。
- 严禁修改 server/**、prisma/**; 不执行 git commit/push（Lead 统一提交）。

## 9. 验收命令

~~~bash
cd client
npm run build
npx eslint src/mobile
~~~

Lead/QA 最终另查:
- git diff 不得包含 server/**、prisma/**。
- grep 不得出现 /admin、urge、handoff、notification、scores/overview 等延期 API。
- 路由冒烟（Playwright mock API）: 公共页可开; 未登录受保护页跳 /m/login; student/teacher 种子登录后页面可渲染; 无控制台错误; 不请求延期接口。
- 34 页面/路由齐全; 管理端路由不存在。

## 10. 分工与任务编号

T0 foundation: client/src/mobile/styles|layout|components|features|routes + client/src/router/index.js + 34 占位页; 交付可 build 骨架、共享组件、守卫、占位页。
T1 student: client/src/mobile/views/student/**（8 路由/11 实体屏）。
T2 teacher: client/src/mobile/views/teacher/**（14 路由/14 实体屏）。
T3 public-platform: client/src/mobile/views/public/** + platform/**（9 路由）。
T4 acceptance: tests/mobile-v1/**（静态边界检查 + 路由烟雾 + 验收报告），T1-T3 完成后启动。
T5 integration: Lead（共享修复/验收/commit）。

## 11. 非目标

不改桌面端页面/样式; 不做管理端移动版; 不装 Vant; 不做 PWA SW/manifest/Android 壳（M4 以后）; 不做离线提交; 不做代码编辑器; 不做免登录接力; 不做推送/通知; 不新增依赖; 不改后端。
