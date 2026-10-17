# 落地计划：/m 移动端（M0–M6）

> 分支 feat/mobile-app · 设计稿先行阶段的实现计划。上游：[05-page-specs.md](./05-page-specs.md)（37 屏 handoff）、[06-platform-strategy.md](./06-platform-strategy.md)（Web/PWA/Android 平台决策）、[02-design-tokens.md](./02-design-tokens.md)、[04-interaction-a11y.md](./04-interaction-a11y.md)
> 本文回答：路由怎么加、Vant 怎么按需、改哪些文件、37 屏对应哪些 Vue 页面、分几步做、怎么测、怎么合并、怎么上线回滚。
> **范围提示**：若采用「零后端改造 v1」，请先按 [08-backend-gap-and-ui-trim.md](./08-backend-gap-and-ui-trim.md) §4 裁剪 UI（管理端后置、成绩聚合/构成/AI 分项等砍掉），再执行本文 M0–M2。
> **范围决策（2026-10-17，已批准）**：v1 执行零后端改造；D1–D13 延期但**不取消**，详见 [09-v1-scope-and-deferred-backlog.md](./09-v1-scope-and-deferred-backlog.md)。本文 M0–M6 仍为完整版计划，v1 按 09 的范围过滤后实施。
> **本阶段不改生产代码**：以下路径是落地阶段的变更清单，M0 起才创建。

---

## 1. 目标、范围与原则

| 项 | 约定 |
|---|---|
| 目标 | 在**不改桌面端**的前提下新增 /m：37 屏移动 Web + PWA + Capacitor Android 壳（内部试用） |
| 范围 | 公共/学生/教师/管理/平台 5 组共 37 屏；路由自动切换；Vant 按需；PWA；Android APK；测试与回滚 |
| 非目标 | iOS 出包（06 §6）、离线数据/离线提交、手机端代码编辑（Monaco）、原生重写、推送、管理端写操作移动化 |
| 原则 1 | 只新增：桌面 views/components/stores/styles 一行不改（共享入口文件仅做受控的小改动，见 §4.2） |
| 原则 2 | 接口优先复用：能复用现有 API 的屏先做；后端缺口（05 §6 G1–G14）走降级，不阻塞 M1–M3 |
| 原则 3 | 按 37 屏契约实现：字段、状态、文案以 05 为准；设计稿与后端冲突时「功能正确优先 + 记录差异」 |
| 原则 4 | 每一步可断言：M0–M6 每阶段有可运行的验收命令，不写「完成即可」 |
| 原则 5 | 可回滚：Web 靠 dist + nginx；PWA 靠 SW 版本；APK 靠版本号只增不减 + latest.json |

---

## 2. /m 路由架构与自动切换

### 2.1 路由树（计划）

~~~text
/exam/（现有 SPA，base=/exam/）
├── 桌面路由（不改）：/、/login、/doc、/teacher/*、/student/*、/admin/*、/:pathMatch(.*)*
└── /m（新增，router/mobile.js）
    ├── /m                      → 按角色重定向（student→/m/student/home 等）
    ├── /m/landing              公共官网
    ├── /m/login                登录
    ├── /m/doc                  使用文档
    ├── /m/install              PWA 安装引导
    ├── /m/error/:code          404/403/500（code 白名单，非法回落 404）
    ├── /m/dev/states           状态样板（仅开发环境）
    ├── /m/student              Layout（meta.role=student，TabBar）
    │   ├── home
    │   ├── assignments
    │   ├── assignments/:id
    │   ├── assignments/:id/done
    │   ├── answer/:id          （query 选题；query 控制 Sheet 状态）
    │   ├── scores
    │   ├── scores/:assignmentId
    │   └── profile
    ├── /m/teacher              Layout（meta.role=teacher，TabBar）
    │   ├── home
    │   ├── assignments
    │   ├── assignments/new     4 步向导
    │   ├── assignments/:id
    │   ├── review              （query 过滤 classId/assignmentId）
    │   ├── review/batch        批量多选
    │   ├── review/batch/confirm
    │   ├── review/:submissionId
    │   ├── review/:submissionId/code
    │   ├── review/:submissionId/diff
    │   ├── questions
    │   ├── classes/:id         班级详情
    │   ├── code-unsupported    手机编辑说明
    │   └── profile
    └── /m/admin                Layout（meta.role=super_admin，TabBar）
        ├── home
        ├── directory           （query section=schools 或 classes 或 teachers 或 students）
        └── monitor
~~~

路由文件组织（降低与桌面线的合并冲突）：

- 新增 client/src/router/mobile.js：导出 mobileRoutes 数组（含 /m 全部路由与 /m 通配 404）。
- 修改 client/src/router/index.js：只加一行 import + 在 routes 数组的桌面 catch-all **之前**展开 mobileRoutes（其余守卫逻辑抽函数，见 §2.4）。
- 桌面 catch-all 保持原样；/m 自己的通配放在 mobileRoutes 内，保证 /m/unknown 进移动 404 而不是被重定向到 /login。

### 2.2 自动切换判定（useMobileLayout）

~~~js
// client/src/composables/useMobileLayout.js（计划）
const mqW = matchMedia('(max-width: 767px)');
const mqTouch = matchMedia('(pointer: coarse)');
const pref = ref(localStorage.getItem('ui:layout') || 'auto'); // auto | mobile | desktop
const isPhone = computed(() => mqW.matches && mqTouch.matches);
const isMobile = computed(() => pref.value === 'mobile' || (pref.value === 'auto' && isPhone.value));
const isTablet = computed(() => matchMedia('(min-width: 768px)').matches); // ≥768 表格回退（04 §8）
~~~

| 规则 | 说明 |
|---|---|
| 组合判定 | 宽度 ≤767px **且** pointer: coarse；只判宽度会把「桌面缩窗口」误切；UA 不作主判据（iPad 桌面 UA） |
| matchMedia 变化 | 监听 change 更新响应式状态，但**不因此整页跳转**（旋转/拖窗口不打断表单） |
| 首次入口 | 在 router.beforeEach 里把桌面路径映射为 /m 路径（见 §2.3），只在「目标路径属于桌面区」时发生 |
| 手动偏好 | localStorage ui:layout：mobile 强制进 /m；desktop 强制留桌面；auto 默认 |
| 判定范围 | 桌面公开页也映射（/ → /m/landing、/login → /m/login、/doc → /m/doc），保证移动端体验一致 |
| 桌面访问 /m | 不自动跳回；页头显示「这是移动版，去桌面版」提示条（可关闭），保证手机连投影/平板可用 |

### 2.3 只在入口跳一次 + 手动兜底 + 整页跳转

**「只在入口跳一次」的准确含义**：

1. 判定发生在导航目标上，而不是 resize 上：用户在 /teacher/x 打开/刷新（手机条件）→ 映射到 /m/teacher/x；之后在 /m 内的页面间导航不再触发桌面↔移动切换。
2. 旋转屏幕、拖拽窗口、插拔鼠标不改变当前路由（只影响 ≥768 表格回退等组件层渲染），避免丢表单/打断作答。
3. 手机用户在 /m 内点击「切换到桌面版」→ 写 ui:layout=desktop 后 **location.assign 整页跳转** 到对应桌面路径（不是 router.push）；桌面→移动同理。原因：两套壳的全局 CSS/JS 不能在同一 SPA 生命周期内混用（Vant base.css 的全局 reset 详见 02 §3.4、04 §6）。

**路由映射（双向）**：

| 桌面路径 | 移动路径 | 说明 |
|---|---|---|
| / | /m/landing | 公开官网 |
| /login | /m/login | 登录（保留 query：expired、redirect） |
| /doc、/doc/demos | /m/doc | 文档（Demos 不移动化） |
| /teacher | /m/teacher/home | |
| /teacher/assignments | /m/teacher/assignments | |
| /teacher/questions | /m/teacher/questions | |
| /teacher/questions/new、/teacher/questions/:id/edit、questions/new/project、questions/:id/edit-project | /m/teacher/questions | 编辑不移动化 → 列表页 + Toast 引导电脑 |
| /teacher/review | /m/teacher/review | |
| /teacher/review/class/:classId | /m/teacher/review?classId=:classId | query 保留 |
| /teacher/review/:id | /m/teacher/review/:id | |
| /teacher/review/project/:submissionId | /m/teacher/review/:submissionId | 实训题由详情页按题型渲染 |
| /teacher/classes、/teacher/students、/teacher/teams、/teacher/teams/:id | /m/teacher/home | 无对应移动屏；首页「班级」入口弹班级选择 Sheet 后进 /m/teacher/classes/:id |
| /admin、/admin/schools、/admin/classes、/admin/teachers、/admin/students | /m/admin/directory | 分段由 query section 指定 |
| /admin/monitor | /m/admin/monitor | |
| /admin/grading-runs、/admin/ai-config | /m/admin/home | 写操作/复杂配置不移动化 |
| /student/assignments | /m/student/assignments | |
| /student/assignments/:id | /m/student/assignments/:id | |
| /student/assignments/:assignmentId/project/:questionId | /m/student/answer/:assignmentId?project=:questionId | 实训题在作答页内上传 |
| /student/scores | /m/student/scores | |
| 其他桌面路径 | 按角色回 /m/<role>/home | 映射表未命中时的兜底 |

**反向映射（去桌面版）**：移动 Tab 根 → 对应桌面根；review 队列/详情/代码/批量 → /teacher/review 或 /teacher/review/:id；assignments 向导 → /teacher/assignments；成绩详情 → /student/scores；管理目录 → /admin/students 等。映射实现为 client/src/domain/mobileRoutes.js 的纯函数（toMobileRoute / toDesktopRoute，可单测）。

### 2.4 守卫与角色/登录态复用

现有 client/src/router/index.js 的 beforeEach 逻辑（login 特判 → 公开页 → 未登录 → meta.role 校验）保持不变，改造为可组合顺序：

~~~js
// 计划（伪代码，实际实现放 router/mobile.js + index.js 的一处调用）
router.beforeEach((to) => {
  const mobile = useMobileLayout();                    // 模块级单例，非组件内也可用 getter
  // 0) 自动切换（仅当目标在桌面区且未手动选 desktop）
  const mapped = toMobileRoute(to.path);
  if (mapped && mobile.shouldEnterMobile()) {
    return { path: mapped, query: to.query, hash: to.hash, replace: true };
  }
  // 1) 桌面路径访问 /m + 手动 desktop → 回桌面（query stay=1 例外）
  if (to.path.startsWith('/m') && mobile.pref.value === 'desktop' && to.query.stay !== '1') {
    return { path: toDesktopRoute(to.path), query: to.query, hash: to.hash, replace: true };
  }
  // 2) 原桌面守卫逻辑（登录/角色）
  return legacyGuard(to);
});
~~~

| 风险 | 处理 |
|---|---|
| 重定向环 | toMobileRoute 对 /m 路径返回 null；toDesktopRoute 对桌面路径返回 null；两条规则互斥 |
| 登录跳转丢目标 | 未登录访问 /m/x → 登录后回 /m/x：沿用 query redirect 约定；登录页成功回调按 redirect 跳转 |
| 角色不匹配 | 学生访问 /m/teacher/* → /m/error/403（不是桌面 /login），保留登录态 |
| API 401 | 复用 setAuthRedirect：/m 下跳 /m/login?expired=1（在 main.js 注册时按当前是否 /m 选择目标） |

### 2.5 深链与 404

1. /m 全部路由可直达（nginx 已放行 /exam/m 前缀）；刷新/扫码/复制链接均可用。
2. /m 的未知路径 → /m/error/404（保留原路径用于「当前地址」展示，最多 200 字符，防注入）。
3. 桌面未知路径维持现状（重定向 /login）；不因新增 /m 改变桌面 404 行为。
4. 错误页路径 /m/error/403、/m/error/404、/m/error/500 由 error/:code 组件白名单渲染，非法 code → 404。


---

## 3. Vant 按需与 chunk 隔离

### 3.1 依赖与配置

| 项 | 内容 |
|---|---|
| 运行时依赖 | vant@4.10.2 |
| 开发依赖 | @vant/auto-import-resolver@1.3.0、unplugin-vue-components@32.1.0（devDependency，仅构建期） |
| 配置位置 | client/vite.config.js 增加 Components 插件：resolvers 使用 VantResolver，dts:false，dirs:[]（只自动引入 Vant，不扫描业务组件） |
| 样式 | 组件样式由 resolver 自动按需引入（每个组件 style/index.mjs 自带 base.css 依赖；Vant 4.10 的全局变量集中在 style/css-variables.css，由 base.css 汇总）；不手工 import 全量 vant 样式 |
| 全局 reset 风险 | Vant base.css 自带全局 reset（body 字体、a:focus outline:none 等）。只允许它在 /m chunk 加载；桌面↔移动切换一律整页跳转（§2.3），从而桌面永远不加载 Vant CSS |
| 主题映射 | Vant 变量映射写在 client/src/styles/mobile-vant-theme.css（02 §4.3）；加载顺序：mobile-tokens.css → mobile-vant-theme.css；Vant 组件样式在组件 mount 时注入，用 :root 与 [data-theme] 选择器保证覆盖 |

### 3.2 使用边界（谁能用 Vant）

| 规则 | 说明 |
|---|---|
| 只允许 | client/src/views/m 下与 client/src/components/m 下使用 Vant 组件与命令式 API（Toast/Dialog 也经 components/m 封装后暴露） |
| 禁止 | 桌面 views/components 引入 vant（静态门禁：grep 桌面目录中出现来自 vant 的 import，期望 0 行） |
| 视觉型组件自研 | 卡片、统计卡、分数、标签、进度条、空态/错误态、代码/diff 面板、TabBar、AppBar、ActionBar：用 components/m 自研（样式复刻 screen.css），不硬套 Vant。理由：Vant 的 cell/button 尺寸与设计稿差异大，硬改变量会把 Vant 变成第二套设计系统 |
| 行为型组件用 Vant | Popup（Sheet）、Dialog、Toast、ActionSheet、SwipeCell、PullRefresh、List、Tabs、Field、Switch、Checkbox、Radio、Search、Loading、Sticky |
| 表单 | 用 Vant Field + 自研 MFormField 校验提示（设计稿 error-text）；不用 antd Form（避免两套表单体系） |

### 3.3 与 antd 共存的事实与约束

现状：client/src/main.js 里有 app.use(Antd)，App.vue 用 ConfigProvider 包裹全站。因此：

1. 移动端入口仍会加载 antd 主包（这是 04 §5.1 的入口体积基线，不因 /m 新增而变小）。
2. /m 页面不挂载任何 antd 组件；抽屉/弹层全部用 Vant 或自研，避免 antd CSS-in-JS 与 Vant CSS 在同一页面互相覆盖。
3. 移动端不再引入第二个组件库（除 Vant）；图表/日期/上传都不加第三方（日期用 Vant Picker）。
4. M0 评估项（不阻塞）：入口瘦身（antd 按需/双入口），结论写入 04 §5.1；未通过则接受 3.0s LCP 基线。

### 3.4 chunk 隔离的验收

~~~bash
npm --prefix client run build
# 1) 入口 chunk 不得含 Vant 组件代码（期望无输出）
grep -l 'van-' client/dist/assets/index-*.js | head
# 2) 移动令牌 CSS 只出现在 /m 的异步 CSS（期望：入口无、m chunk 有）
grep -l -- '--m-appbar-h' client/dist/assets/index-*.css | head
grep -l -- '--m-appbar-h' client/dist/assets/*.css | head
# 3) 桌面 CSS 体积不因移动端明显增长（记录 M0 前后 index CSS 字节数）
ls -l client/dist/assets/index-*.css
~~~

**判定**：1 无输出；2 第一行为空、第二行命中至少一个 /m chunk CSS；3 入口 CSS 增长 ≤5%（移动令牌与 Vant 不进桌面 chunk）。

---

## 4. 目录与文件改动清单

### 4.1 新增（只加不改）

| 类型 | 路径 | 说明 |
|---|---|---|
| 路由 | client/src/router/mobile.js | /m 全部路由 + /m 404 |
| 路由纯函数 | client/src/domain/mobileRoutes.js | 桌面↔移动双向映射（可单测） |
| 布局 | client/src/views/m/Layout.vue | AppBar + TabBar + 安全区 + 离线条 + PWA 注册 |
| 公共页 | client/src/views/m/public/Landing.vue、Login.vue、Doc.vue、ErrorPage.vue、Install.vue | 屏 1–6、35；ErrorPage 用 code 参数 |
| 学生页 | client/src/views/m/student/Home.vue、Assignments.vue、AssignmentDetail.vue、Answer.vue、Done.vue、Scores.vue、ScoreDetail.vue、Profile.vue | 屏 7–17（Answer 含 Sheet 状态） |
| 教师页 | client/src/views/m/teacher/Home.vue、Assignments.vue、AssignmentDetail.vue、ReviewQueue.vue、ReviewDetail.vue、ReviewCode.vue、ReviewDiff.vue、BatchSelect.vue、BatchConfirm.vue、AssignWizard.vue、Questions.vue、ClassDetail.vue、Profile.vue、CodeUnsupported.vue | 屏 18–31 |
| 管理页 | client/src/views/m/admin/Home.vue、Directory.vue、Monitor.vue | 屏 32–34 |
| DEV 样板 | client/src/views/m/dev/StatesOverview.vue | 屏 37，仅开发环境 |
| 移动组件 | client/src/components/m/ 下：AppBar、TabBar、BottomActionBar、MCard、MListRow、FilterChips、SegTabs、MStatusTag、MEmptyState、MErrorState、MSkeleton、OfflineBanner、MBottomSheet、MScoreHero、MProgressBar、MStepBar、MQuestionGrid、MCodeViewer、MDiffViewer、MHandoffCard、MFormField、MSearchBar、MDataTable、MPullList、MQrCode、MToastHost（均为 .vue） | 视觉型自研 + Vant 封装 |
| 组合式 | client/src/composables/ 下：useMobileLayout、useMobileNav、useBackButton、useOffline、useVisualViewport、useAppInstall、useDevicePlatform、usePageState、usePwaUpdate（均为 .js） | 行为/平台能力收敛 |
| 样式 | client/src/styles/mobile-tokens.css | 02-design-tokens.css 的生产副本（逐字一致） |
| 样式 | client/src/styles/mobile-vant-theme.css | Vant 变量映射 + 生产补充令牌（02 §4.3/§4.3.6） |
| PWA | client/public/m/manifest.webmanifest | 04 §4.1 规格 |
| PWA | client/public/m/sw.js | 04 §4.2 策略（手写） |
| PWA | client/public/m/offline.html | 离线兜底页 |
| PWA | client/public/m/icons/pwa-192.png、pwa-512.png、pwa-maskable-512.png | 由 client/public/favicon.svg 生成 |
| 测试脚本 | client/scripts/verify-mobile.mjs | 静态门禁 + 触控审计 + axe + 性能冒烟（M0 起） |
| Playwright | client/playwright.mobile.config.mjs、client/tests/m/ 下 spec 文件 | 双视口/浅深/失败路径回归 |
| 壳 | client/capacitor.config.ts | 06 §5.1 配置 |
| 壳 | client/android/（npx cap add android 生成） | 工程配置入库；build/、.gradle/、keystore 不入库 |
| 发布 | client/scripts/build-sw.mjs（可选 M6）、client/scripts/android-release.mjs（可选 M5） | 版本注入/构建辅助 |

### 4.2 修改（共享文件，必须最小化并协调）

| 文件 | 改动 | 风险 |
|---|---|---|
| client/src/router/index.js | import mobileRoutes + 在 routes 展开（1–2 行）；beforeEach 抽 legacyGuard 并加 /m 分支（约 20 行） | 与桌面线冲突面最大的文件；改动集中在顶部与守卫，避免动桌面路由定义 |
| client/src/main.js | 仅当需要 401 目标按 /m 切换时改 setAuthRedirect 的目标选择（约 3 行）；否则不改 | 与桌面线共享；能不改就不改（优先在 /m Layout 内自处理） |
| client/index.html | viewport 加 viewport-fit=cover；theme-color 两条；manifest link（%BASE_URL%）；apple-touch-icon | 桌面也生效（viewport-fit 对桌面无影响；manifest 只影响移动） |
| client/package.json + package-lock.json | 加 vant / capacitor / 构建期 devDeps 与 scripts（cap:sync、cap:open、android:apk） | 与桌面线共同文件；M0 一次加齐并通知，避免多次 lock 冲突 |
| client/vite.config.js | 加 Components 插件（VantResolver）；其余不动 | 构建配置，改动小；与桌面线协调 |
| client/.gitignore（或 client/android/.gitignore） | 忽略 android/build、.gradle、keystore、keystore.properties、latest.json | 防密钥入库 |
| nginx-exam.conf | 06 §3.2 的 8 条 | 部署配置；单独 PR + nginx -t + 灰度 |
| server/src/app.js | SPA_PREFIXES 加 '/m'（1 行） | 服务端共享文件；单独小 PR |
| docs/mobile-app 下 5 篇本文档 | 落地过程中回写「实现与设计的差异」 | 文档自身演进 |

### 4.3 不动（硬约束）

client/src/views 下的 teacher、student、admin、Login、Landing、Doc；client/src/components 现有组件；client/src/stores；client/src/api；client/src/styles/tokens.css；client/src/App.vue；server/src 业务代码；现有桌面路由定义。


---

## 5. 37 屏 → Vue 页面/组件映射表

| # | 屏 | 路由 | Vue 页面 | 主要组件 | 模板 | 数据来源（复用为主，缺口见 05 §6） |
|---|---|---|---|---|---|---|
| 1 | public-landing | /m/landing | m/public/Landing.vue | MCard、MHandoffCard | B | 静态 + GET /api/health |
| 2 | public-login | /m/login | m/public/Login.vue | MFormField、Vant Field/Button | E | POST /api/auth/login（1002 分支） |
| 3 | public-doc | /m/doc | m/public/Doc.vue | MSearchBar、SegTabs | B | 静态 |
| 4 | error-404 | /m/error/404 | m/public/ErrorPage.vue | MErrorState | B | 前端 |
| 5 | error-403 | /m/error/403 | m/public/ErrorPage.vue | MErrorState | B | 前端 + user |
| 6 | error-500 | /m/error/500 | m/public/ErrorPage.vue | MErrorState | B | 前端（编号待确认） |
| 7 | student-home | /m/student/home | m/student/Home.vue | MCard、MProgressBar、TabBar | C | GET /api/student/assignments + scores + profile |
| 8 | student-assignments | /m/student/assignments | m/student/Assignments.vue | FilterChips、MListRow、MPullList | A | GET /api/student/assignments |
| 9 | student-assignment-detail | /m/student/assignments/:id | m/student/AssignmentDetail.vue | MCard、MProgressBar、BottomActionBar | B | GET /api/student/assignments/:id |
| 10 | student-answer-objective | /m/student/answer/:id | m/student/Answer.vue | MQuestionGrid、MBottomSheet、选项组 | D | GET 详情 + PUT draft |
| 11 | student-answer-code | /m/student/answer/:id | m/student/Answer.vue（题型分支） | MHandoffCard、MQrCode | D | 同 10 + project 接口 |
| 12 | student-answer-sheet | /m/student/answer/:id | m/student/Answer.vue（Sheet 状态） | MBottomSheet、MQuestionGrid | D | 前端状态 |
| 13 | student-submit-confirm | /m/student/answer/:id | m/student/Answer.vue（Sheet 状态） | MBottomSheet | D | POST /api/student/assignments/:id/submit（逐题） |
| 14 | student-assignment-done | /m/student/assignments/:id/done | m/student/Done.vue | MCard、MStepBar、MProgressBar | B | GET /api/student/assignments/:id |
| 15 | student-scores | /m/student/scores | m/student/Scores.vue | MScoreHero、MListRow | A | GET /api/student/scores |
| 16 | student-score-detail | /m/student/scores/:assignmentId | m/student/ScoreDetail.vue | MScoreHero、MProgressBar | B | GET /api/student/scores（subItems） |
| 17 | student-profile | /m/student/profile | m/student/Profile.vue | MCard、Vant Switch | B | GET /api/student/profile + useTheme |
| 18 | teacher-home | /m/teacher/home | m/teacher/Home.vue | MCard、TabBar | C | GET /api/teacher/pending-summary + assignments |
| 19 | teacher-assignments | /m/teacher/assignments | m/teacher/Assignments.vue | FilterChips、MListRow、Vant SwipeCell | A | GET /api/teacher/assignments + lock |
| 20 | teacher-assignment-detail | /m/teacher/assignments/:id | m/teacher/AssignmentDetail.vue | MProgressBar、MListRow、BottomActionBar | B | GET /api/teacher/assignments/:id + review-class |


| 21 | teacher-review-queue | /m/teacher/review | m/teacher/ReviewQueue.vue | MBottomSheet、MScoreHero、队列手势 | C | GET /api/teacher/submissions + review-summary |
| 22 | teacher-review-detail | /m/teacher/review/:submissionId | m/teacher/ReviewDetail.vue | MScoreHero、MFormField、BottomActionBar | B | GET /api/teacher/submissions/:id + PUT review/score |
| 23 | teacher-review-code | /m/teacher/review/:submissionId/code | m/teacher/ReviewCode.vue | MCodeViewer、选区工具条 | C | GET submissions/:id 或 project-submission/:id |
| 24 | teacher-review-diff | /m/teacher/review/:submissionId/diff | m/teacher/ReviewDiff.vue | MDiffViewer、Vant Switch | C | GET /api/teacher/project-submission/:id |
| 25 | teacher-batch-select | /m/teacher/review/batch | m/teacher/BatchSelect.vue | MListRow、批量操作条 | A | GET /api/teacher/submissions + 逐条 review |
| 26 | teacher-batch-confirm | /m/teacher/review/batch/confirm | m/teacher/BatchConfirm.vue | MCard、危险提示 banner | B | 逐条 review / publish（语义待确认 G8） |
| 27 | teacher-assign-wizard | /m/teacher/assignments/new | m/teacher/AssignWizard.vue | MStepBar、MFormField、Vant Picker | E | POST /api/teacher/assignments（1007 分支） |
| 28 | teacher-questions | /m/teacher/questions | m/teacher/Questions.vue | FilterChips、MListRow | A | GET /api/teacher/questions |
| 29 | teacher-class | /m/teacher/classes/:id | m/teacher/ClassDetail.vue | MProgressBar、MListRow | A | review-summary + students + review-class |
| 30 | teacher-profile | /m/teacher/profile | m/teacher/Profile.vue | MCard、Vant Switch | B | user store + useTheme |
| 31 | teacher-code-unsupported | /m/teacher/code-unsupported | m/teacher/CodeUnsupported.vue | MHandoffCard、MQrCode | B | 前端链接 |
| 32 | admin-home | /m/admin/home | m/admin/Home.vue | MCard、MStatusTag | C | admin lists + monitor（缺口 G12） |
| 33 | admin-directory | /m/admin/directory | m/admin/Directory.vue | SegTabs、MDataTable/MListRow | A | GET /api/admin/schools、classes、teachers、students |
| 34 | admin-monitor | /m/admin/monitor | m/admin/Monitor.vue | MCard、日志流、Vant Switch | C | GET /api/admin/monitor |
| 35 | platform-install | /m/install | m/public/Install.vue | MCard、MHandoffCard | B | 能力检测 |
| 36 | platform-splash | 不落路由 | android 启动图资源 + SplashScreen 插件 | 无（原生） | 特殊 | @capacitor/app + appVersion |
| 37 | states-overview | /m/dev/states | m/dev/StatesOverview.vue（DEV-only） | MEmptyState、MSkeleton、MErrorState、OfflineBanner | 特殊 | 静态 mock |

**说明**

1. 一个 Vue 文件可以承载多屏：Answer.vue 承载屏 10–13（题型与 Sheet 状态）、ErrorPage.vue 承载屏 4–6。
2. 组件复用：MCodeViewer / MDiffViewer 不依赖 Monaco；MDataTable 不依赖 antd；MQrCode 用 qrcode 依赖（待确认，§8 R10）；MToastHost 封装 Vant Toast 并补 aria-live。
3. 屏 36 不落 Vue 路由：由 Android 原生启动图 + SplashScreen 插件实现，设计稿仅作视觉参考；屏 37 仅开发环境可访问。


---

## 6. 分阶段计划 M0–M6（人日为单人开发估算，含单屏自测，不含外部评审）

> 估算基准：37 屏 ≈ 32 人日（含四态/深色/360 档自测），基建与壳 ≈ 9 人日；合计 41 人日。评审/缓冲另计（§6.2）。

### 6.1 阶段表

| 阶段 | 内容 | 交付物 | 可断言验收 | 依赖 | 人日 |
|---|---|---|---|---|---|
| **M0 基建与令牌** | /m 路由骨架（mobile.js + 守卫 + /m 重定向）；useMobileLayout 自动切换；两个令牌 CSS 落地（tokens 副本 + Vant 映射）；Vant 按需配置；壳组件（AppBar/TabBar/ActionBar/四态/Toast/BottomSheet）；整页切换桌面版；verify-mobile.mjs 骨架；index.html viewport/manifest 占位 | 可跑的 /m 空骨架 + 4 个基础组件 + 门禁脚本 | ① 手机视口自动进 /m、桌面不跳、旋转不跳、手动偏好持久（Playwright 3 断言）② 触控审计 0 失败 ③ 令牌 cmp OK ④ chunk 隔离 3 条断言通过 ⑤ npm run build 通过、桌面 verify-frontend 通过 | 无 | 3 |
| **M1 公共与平台 + PWA 基础** | 屏 1–6（公共/异常）+ 屏 35（安装引导）+ 屏 37（状态样板）；PWA manifest/sw/offline/icons；安装引导；更新提示接入 appVersion | 8 个页面 + PWA 可安装 + 离线壳 | ① 登录全链路（含错误/1002）② 四态样板与 04 §3 一致 ③ Android Chrome 可安装、断网打开已访问页显示壳 ④ SW 不缓存 API（Cache Storage 断言）⑤ 深色/360 截图齐全 | M0 | 5 |
| **M2 学生端 11 屏** | 屏 7–17；作答页（客观/编程/实训分支）、答题卡/交卷 Sheet、已提交、成绩、我的；倒计时/草稿/逐题提交 | 11 个页面 + 学生主链路 | ① 学生真机走通「登录→列表→详情→作答→交卷→已提交→成绩→我的」② 草稿保存/恢复正确 ③ 倒计时用 endTime 不丢 ④ 提交只提交已答、失败可重试 ⑤ 无横向滚动、四态齐全 | M0、M1（登录） | 7 |
| **M3 教师端 14 屏 + 管理端 3 屏** | 屏 18–34；审核队列（手势/预取队列）、审核详情（改分/评语）、代码只读/选区、逐块 diff、批量多选/确认、布置向导、题库/班级只读、管理只读概览/目录/监控；≥768 表格回退 | 17 个页面 + 教师主链路 + 管理只读 | ① 教师走通「工作台→作业→详情→审核队列→详情→改分/通过→批量」② 代码 500 行滚动 60fps、不加载 Monaco ③ 批量部分失败可重试 ④ ≥768 表格回退与旋转不丢状态 ⑤ 管理端无写入口、缺口指标不造假 | M0、M1 | 15 |
| **M4 Android 壳** | capacitor 初始化；backButton/StatusBar/SplashScreen/Keyboard/Network 接入；安全区注入；断网冷启动兜底；debug APK | Debug APK + 壳能力适配 | ① 真机安装冷启动不白屏 ② 返回键行为符合 04 §1.3（浮层→路由→Tab 根二次退出）③ 状态栏/安全区/键盘三机型通过 ④ 文件选择可上传 zip ⑤ 断网冷启动有兜底页面 | M2、M3 稳定 | 5 |
| **M5 分发与升级** | Release 签名、versionCode/Name、latest.json、下载页/二维码、微信提示、升级提示、PWA 更新提示完善、商店/备案结论 | Release APK + 下载页 + 升级链路 | ① apksigner verify 通过、覆盖升级成功 ② 扫码下载可用、SHA256 一致 ③ 旧版本收到升级提示并可下载 ④ q1–q10 有结论 ⑤ PWA 更新提示可用 | M4 | 4 |
| **M6 上线与回滚** | 灰度发布、监控、回滚演练、文档回写、交接 | 上线记录 + 回滚演练记录 + 交接包 | ① 灰度 1 工作日无 P0/P1 ② 回滚演练 30 分钟内完成 ③ 桌面 verify-frontend 与桌面回归通过 ④ 5 篇文档回写差异 ⑤ 交接人验收签字 | M5 | 2 |
| **合计** | | | | | **41** |

### 6.2 排期与缓冲

| 项 | 值 |
|---|---|
| 开发合计 | 41 人日 |
| 缓冲 15%（联调/真机/返工） | 约 6 人日 |
| **总计** | **约 47 人日** |
| 单人节奏 | 约 9.5 周（含缓冲） |
| 两人并行 | 约 5–6 周：一人 M1+M2（公共/学生），一人 M3（教师/管理），M0/M4–M6 共同 |
| 可裁剪项 | 管理端 3 屏（M3 内 -3 人日，降级为「引导电脑」）；批量审核（-2）；PWA 安装引导（-1）。裁前必须与产品确认 |

### 6.3 阶段门禁（不过不进入下一阶段）

| 门禁 | 命令/标准 |
|---|---|
| G-M0 | node client/scripts/verify-mobile.mjs --static 通过 + Playwright 自动切换 3 断言 + chunk 隔离 3 断言 |
| G-M1 | PWA 安装与离线壳实测 + 深色/360 截图人工确认 + axe critical/serious = 0 |
| G-M2 | 学生主链路真机录屏 + 提交失败/重试演练 |
| G-M3 | 教师主链路真机录屏 + 500 行代码性能记录 + ≥768 表格回归 |
| G-M4 | APK 真机 3 机型 + 断网冷启动 + 返回键 |
| G-M5 | 签名校验 + 覆盖升级 + 下载页二维码 |
| G-M6 | 回滚演练记录 + 桌面无回归 + 文档回写完成 |

---

## 7. 测试矩阵

### 7.1 矩阵总表

| 维度 | 用例要点 | 工具与命令 | 通过标准 | 频率 |
|---|---|---|---|---|
| 双视口回归 | 375/390 触摸 → 自动进 /m；1280 鼠标 → 不跳；手动切桌面版后刷新仍生效；/m 深链可直达；/m 未知路径 → 移动 404 | Playwright（client/playwright.mobile.config.mjs，M0 新增） | 全部断言通过 | 每次 PR |
| 平板 / ≥768 | 768/1024 列表切表格；旋转不丢筛选/输入；列优先级正确；代码 diff ≥1024 并排 | Playwright 视口矩阵 + 人工 | 04 §8 清单通过 | M3 起每次 PR |
| 浅/深主题 | 37 屏 ?theme=dark；无亮色孤岛；代码面板固定深色为预期 | 设计稿 shot.mjs + 生产截图 | 对比度抽查通过 | M1–M3 每屏 |
| 真机（Android） | Chrome、微信浏览器、Capacitor 壳各走主链路 | 局域网 --host 或部署环境；adb | 主链路无阻断；微信限制有提示 | M2 起每周 |
| 真机（iOS） | Safari 冒烟：登录→作业→成绩；PWA 手动添加主屏 | 人工 | 可用；已知限制记录 | M2 起每周 |
| 弱网 | Fast 3G/Slow 3G、离线、500ms 延迟、2% 丢包 | DevTools Network 节流 + Playwright route 延迟 | 骨架可见；离线条出现；写操作禁用；无重复提交 | M2/M3 |
| 失败路径 | 401（登录过期）、403（角色不符）、404、429、500、超时、1002、1007、1403、离线 | Playwright route mock（M0 建成） | 每种映射到 04 §3.4 的正确 UI；可恢复 | 每次 PR |
| 无障碍 | axe-core 全页扫描；键盘主链路；TalkBack 主链路；200% 缩放；320px；reduced-motion | verify-mobile.mjs --a11y + 人工 | critical/serious=0；键盘可完成两条主链路 | M1 起每次 PR |
| 性能 | 移动 LCP/CLS/INP；200 条列表；500 行代码；/m chunk 体积 | Lighthouse（DevTools）+ verify-mobile.mjs --perf | 04 §5.1 预算表 | M1/M3/M5 |
| PWA | 安装、离线壳、SW 不缓存 API、更新提示、standalone 启动 | Chrome DevTools Application + 真机 | 06 §9 P1–P4 | M1/M5 |
| APK | 安装/覆盖升级/冷启动/返回键/状态栏/键盘/文件选择/断网 | adb + 真机 | 06 §9 P5–P9 | M4/M5 |
| 桌面回归 | 现有桌面功能不受影响 | node client/scripts/verify-frontend.mjs --no-build；桌面手工冒烟 | 全 PASS；桌面视觉零变化 | 每次合并到主线前 |
| 设计稿回归 | 37 屏与 SCREENS.md 一致 | Gallery 对照 + task-6 评审 | 37 屏齐全、四态/深色/触控达标 | 设计阶段一次 |

### 7.2 关键命令

~~~bash
# 构建与静态门禁
npm --prefix client run build
node client/scripts/verify-frontend.mjs --no-build
node client/scripts/verify-mobile.mjs --static
node client/scripts/verify-mobile.mjs --touch --base http://127.0.0.1:5174/exam/
node client/scripts/verify-mobile.mjs --a11y --base http://127.0.0.1:5174/exam/
node client/scripts/verify-mobile.mjs --perf --base http://127.0.0.1:5174/exam/

# 移动端开发预览（真机需局域网 IP；PWA/SW 在 http 下仅 localhost 可用，真机安装测试需 HTTPS 环境）
npm --prefix client run dev -- --host --port 5174

# Playwright 双视口回归（M0 新增配置）
npx --prefix client playwright test -c client/playwright.mobile.config.mjs

# Android 壳
npm --prefix client run build
npx --prefix client cap sync android
cd client/android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 设计稿预览与截图
python3 -m http.server 8123 --bind 127.0.0.1
node docs/mobile-app/preview/tools/shot.mjs student-home docs/mobile-app/preview/shots/student-home-dark.png --theme=dark
~~~

### 7.3 测试数据与账号

- 学生/教师/管理员演示账号见 SCREENS.md §3（李明 2026001004、周子轩 T2026001、admin）；后端测试库需含「待审核/已评分/AI 评分中/异常/未提交」五类数据各 ≥1，供队列与四态测试。
- 弱网/失败用例用 Playwright route mock，不依赖后端造数；真机用例尽量用测试库。
- 提交/发布类写操作在测试库执行，禁止在演示库/生产库演练。


---

## 8. 风险与对策

| # | 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|---|
| R1 | 与桌面线共用 client/src/router/index.js、package.json、index.html，合并冲突 | 高 | 中 | 移动端只加 import/展开（1–2 行）+ 守卫函数化；package.json 在 M0 一次加齐并提前通知；合入前 rebase 到最新主线；冲突文件指定单一 owner |
| R2 | Vant base.css 的全局 reset 影响桌面 | 中 | 高 | 只在 /m chunk 加载；桌面↔移动切换一律整页跳转；M0 加「桌面页面加载后不含 Vant CSS」断言（grep dist 入口 CSS） |
| R3 | PWA 缓存导致旧版本/旧接口结构不兼容 | 中 | 中 | SW_VERSION 每次发版 +1；HTML network-first；API 完全不缓存；更新提示 + 强制刷新路径；M5 演练 |
| R4 | 微信内置浏览器限制（不能装 PWA、不能下载 APK、上传受限） | 高 | 中 | UA 仅用于提示「在浏览器打开」；不上假功能；真机每周测试 |
| R5 | Android WebView 版本碎片（老内核 CSS/JS 差异） | 中 | 中 | 只用成熟 CSS（禁 flex gap/:has/容器查询等，04 §0）；dvh 双写；能力检测；真机 3 机型（低/中/高） |
| R6 | 手势误触（队列上下滑、左滑、长按） | 中 | 高 | 04 §1 阈值 + 方向锁 + 按钮等价物；长按不直接审核；真机连续操作测试；可关闭手势提示 |
| R7 | 后端缺口导致部分屏只能降级（G1–G14） | 高 | 中 | 05 §6 缺口表作为与后端对齐输入；降级形态在 M1–M3 先交付并在屏内说明；不伪造数据 |
| R8 | 入口体积大（antd 全量，gzip 约 399KB），移动 LCP 不达 2.5s | 高 | 中 | 接受 3.0s 基线；M0 评估入口瘦身；/m chunk 严格预算（≤120KB gzip）；Vant 按需 |
| R9 | 代码面板/diff 自研质量（高亮/选区/大文件） | 中 | 中 | 只读 + 轻量 tokenizer；>300 行窗口化；>200KB 引导电脑；M3 性能验收 |
| R10 | 二维码依赖（qrcode 包）与接力链接体验 | 中 | 低 | 引入轻量 qrcode（待确认包体）；链接必须写明「需登录」；真机扫码验证 |
| R11 | keystore 丢失导致无法升级 | 低 | 高 | 2 份离线备份 + 交接人 + 记录在案（06 §8 Q4） |
| R12 | APK 分发后被要求上架/备案（合规变化） | 中 | 高 | 06 §5.9 备案调研提前做；保留应用商店上架评估；不公开分发前先问学校 |
| R13 | iOS 需求提前到来 | 低 | 中 | 06 §6.3 Gate 条件；无 Xcode/账号前不承诺；PWA 兜底 |
| R14 | 测试设备不足（无 Android 真机/iOS 设备） | 中 | 中 | M0 确认设备清单；至少 1 台 Android 真机 + 1 台 iPhone（借测）；CI 用 Playwright 模拟 |
| R15 | 排期人力不足（两人并行仍 >5 周） | 中 | 中 | 按 §6.2 可裁剪项（管理端/批量/PWA 引导）优先级砍；M1–M3 优先保学生与教师主链路 |

---

## 9. 与桌面并行开发的合并策略

### 9.1 文件级隔离

| 类别 | 文件 | 归属 | 合并窗口 |
|---|---|---|---|
| 纯新增 | client/src/views/m/**、components/m/**、composables/useMobile* 等、styles/mobile-*、router/mobile.js、domain/mobileRoutes.js、public/m/**、android/** | 移动线独占 | 随时 |
| 共享小改 | client/src/router/index.js、client/index.html、client/vite.config.js、client/package.json + lock、client/.gitignore | 移动线改、桌面线知会 | M0 集中一次性改；之后尽量不再动 |
| 部署/服务 | nginx-exam.conf、server/src/app.js（1 行） | 移动线单独 PR | M0 末/M6 前 |
| 不动 | 桌面 views/components/stores/styles/App.vue/api、server 业务代码 | 桌面线 | — |

### 9.2 分支与提交约定

- 分支：feat/mobile-app（当前）；落地时按 M0–M6 拆 PR，每个 PR 只碰一类文件，PR 描述附本文 §6 验收命令结果。
- 共享文件改动（router/index.html/vite.config/package）合成一个 M0 前置 PR，尽量一次改完，避免后续反复 rebase。
- 桌面线若同期在改 router/index.js：约定由移动线先合入 M0 前置 PR（只加 /m），桌面线随后 rebase；冲突只可能出现在 import 区与 routes 数组末尾，人工 5 分钟内可解。
- 不使用 git 命令在共享工作区切分支（历史教训见 docs/ui-redesign/teacher-app/mobile-plan.md §九）；移动端在独立 worktree 开发（若并行），合并前 rebase 到最新主线。
- 提交信息前缀：m0–m6（如 m0: 路由骨架与移动令牌），便于回滚定位。

### 9.3 特性开关（可回滚的灰度）

| 开关 | 位置 | 作用 |
|---|---|---|
| VITE_MOBILE_OFF=true | client 构建环境变量 | 构建时关闭自动切换与 /m 入口（路由仍存在但 before 不映射；或整段 mobileRoutes 不注册），用于紧急回滚 |
| ui:layout=desktop | localStorage | 单用户跳过自动切换（已在 §2 设计） |
| latest.json force | 发布静态文件 | 强制旧 APK 更新（仅协议不兼容时） |
| nginx /m location | 部署配置 | 回滚时先回退 nginx 放行，再回滚 dist |

### 9.4 代码评审要点（移动 PR checklist）

- [ ] 没有改桌面文件（或只改了 §9.1 共享小改且已说明）
- [ ] 新页面在 views/m 下，未 import antd；Vant 只在允许目录
- [ ] 无硬编码色值/尺寸（02 §5 命令）
- [ ] 四态齐全、图标按钮 aria-label、触控 ≥44
- [ ] 数据字段与 05 §3 一致，未显示后端未返回字段
- [ ] 失败路径（401/403/429/500/离线）有 UI
- [ ] 构建后 chunk 隔离断言通过、桌面 verify-frontend 通过

---

## 10. 上线与回滚

### 10.1 上线步骤（M6）

1. 构建：npm --prefix client run build → 产物含 /m 路由与 public/m 资源；跑 verify-mobile --static/--touch/--a11y、verify-frontend --no-build。
2. 部署 dist：先替换静态文件（nginx /exam/ alias）；此时 /exam/m/ 精确 location 若已加可先内测。
3. 合并 nginx 改动（06 §3.2）→ nginx -t → reload；验证 $ 深链、manifest Content-Type、sw.js。
4. 灰度：仅内部账号（教师 2–3 人 + 学生 2–3 人）使用 1 个工作日；观察 nginx 5xx、API 错误率、SW 报错、用户反馈。
5. 全量：开放 /m 入口（首页/公告）；同步发 PWA 安装引导。
6. APK：上传 release APK + latest.json + 下载页；在教师群发二维码；记录安装人数（nginx 下载计数）。
7. 观察 3 个工作日：每日检查错误日志与反馈；P0/P1 立即回滚或热修。
8. 文档回写：5 篇文档的「实现差异」与 Q1–Q10 结论。

### 10.2 监控指标（当前无前端埋点，先用可得的）

| 指标 | 数据源 | 阈值/动作 |
|---|---|---|
| /m 请求 5xx 率 | nginx access/error log | >1% 立即排查 |
| /exam/m/ 深链 404 数 | nginx 日志 | 非 0 检查 nginx location |
| API 4xx/5xx（/exam/api/） | nginx + server 日志 | 401 激增 → 登录态/redirect 问题 |
| SW 更新失败 | 用户反馈 + console 错误（无上报） | 发版后 24h 内重点观察 |
| APK 下载次数 | nginx 日志计数 | 与教师群人数对比 |
| 首屏性能 | Lighthouse 抽样 + 用户反馈 | 劣化 >20% 排查 |
| PWA 安装数 | 无埋点（Chrome 不提供） | 以问卷/反馈估算 |

**说明**：项目当前没有前端埋点 SDK；本阶段不引入第三方统计（隐私与合规），上线观察以 nginx/服务端日志 + 用户反馈为主；如需真实转化数据，另立「轻量自建上报」需求（待确认）。

### 10.3 回滚剧本

| 场景 | 操作 | 时间目标 |
|---|---|---|
| Web 层 P0（白屏/主链路断） | 重新部署上一版 dist；必要时 nginx 回退 06 §3.2 第 1/2 条 | ≤15 分钟 |
| 仅移动端异常、桌面正常 | 保留 dist，nginx 回退 /m 放行（精确 location 保留可内测）；或发版加 VITE_MOBILE_OFF | ≤10 分钟 |
| PWA 旧版本缓存问题 | 发版 sw.js 提升 SW_VERSION + skipWaiting；必要时临时部署「注销 SW」脚本页（unregister + 清 cache） | ≤30 分钟 |
| APK 壳能力异常 | 发新版本 APK 修复（版本号 +1）；latest.json 标记强制更新；旧版无法远程降级 | 1 个工作日 |
| 后端不兼容 | 后端回滚 + 前端回滚；APK 通过 latest.json force 提示更新 | 按后端 SLA |
| 数据问题 | 本阶段移动端无独立数据写入（全部复用现有接口），按现有后端回滚流程 | — |

**回滚演练（M6 必做）**：在预发环境模拟一次「部署旧 dist + 回退 nginx + 验证桌面/移动均可用」，记录耗时与截图。

---

## 11. 完成定义（DoD）与交接清单

### 11.1 DoD

- [ ] 37 屏全部落地（含降级形态说明），与 05 §3 逐屏验收 6 项通过
- [ ] 四态齐全（每列表页/详情页）、深色/360/≥768 通过
- [ ] WCAG AA：axe critical/serious=0；键盘两条主链路；TalkBack 主链路；reduced-motion 生效
- [ ] 性能预算：/m chunk JS ≤120KB gzip、CSS ≤20KB gzip；200 条列表/500 行代码达标；LCP 记录在案
- [ ] PWA：可安装、离线壳、SW 不缓存 API、更新提示可用
- [ ] APK：release 签名、覆盖升级、冷启动不白屏、返回键/状态栏/键盘/文件选择通过
- [ ] 桌面零回归：verify-frontend 全 PASS，桌面视觉截图抽查一致
- [ ] 共享文件改动最小化且已 review；nginx/server 改动已灰度验证
- [ ] 文档回写：5 篇设计文档 + 本文的差异记录；Q1–Q10 有结论
- [ ] 回滚演练完成并留档

### 11.2 交接包

| 内容 | 位置/负责人 |
|---|---|
| 5 篇设计文档 + 37 屏 + Gallery | docs/mobile-app/ |
| 移动端代码与测试脚本 | client/src/views/m、components/m、composables、scripts/verify-mobile.mjs、tests/m |
| PWA 资源与 SW 版本记录 | client/public/m/ + 发版记录 |
| Android 工程、keystore 交接记录、APK 归档 | client/android/ + 离线介质（学校信息中心） |
| latest.json 发布脚本与下载页 | 运维/发布负责人 |
| 回滚演练记录、灰度观察记录 | M6 交付物 |
| 未闭环事项（Q1–Q10、G1–G14） | 本文与 05 §6/06 §8 |

