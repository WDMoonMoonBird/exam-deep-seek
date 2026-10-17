# 交互 · 响应式 · 无障碍规范（移动端 Phase 5 / 6 / 7）

> 分支 feat/mobile-app · 方法 afrexai-ui-design-system Phase 5（手势）/ Phase 6（动效）/ Phase 7（无障碍）
> 上游：[SCREENS.md](./preview/SCREENS.md)（37 屏契约）｜[02-design-tokens.md](./02-design-tokens.md)（令牌与 Vant 映射）｜[02-design-tokens.css](./02-design-tokens.css)
> 下游：[05-page-specs.md](./05-page-specs.md)（逐屏 handoff）、[07-implementation-plan.md](./07-implementation-plan.md)（M0–M6 落地与测试矩阵）。
> 本文只定义规范与可断言验收，不含实现代码；所有时长/尺寸/颜色均引用令牌，不新增硬编码。

---

## 0. 范围与硬约束

| 项 | 约定 |
|---|---|
| 适用对象 | 37 屏移动设计稿（docs/mobile-app/preview/screens/）对应的 /m 生产页面 + 通用组件 |
| 设备基线 | 390×844（iPhone 14/15）基准；360–430 CSS px 自适应；Android minSdk 24（Android 7.0）起 |
| 输入 | 触摸优先；hover:none 不允许承担交互；外接键盘/平板只在 /m 内做可用性兜底 |
| 兼容底线 | CSS 变量 / env() / calc() / Grid gap；**禁用** flex gap（Chromium <84）、:has()、容器查询、color-mix()/oklch()、MQ Level 4 区间语法、clamp()/min()/max()；dvh 必须 vh 双写降级；backdrop-filter 必须有实色兜底 —— 与桌面 docs/ui-redesign/04-interaction-a11y.md §6.2 同一张禁用表，移动端不因「手机新」而放宽 |
| 事实来源 | 布局与显隐用 CSS 媒体查询；JS 只在「行为必须切换」时用 matchMedia（禁止用 window.innerWidth 推算布局） |
| 性能基线 | 中档 Android（骁龙 6xx / 天玑 700 级）滚动 60fps；首屏 LCP 见 §5.1（当前入口体积是已知约束） |
| 明确不做 | 推送（PWA/Capacitor 都不做，见 06）、离线写队列、自研代码编辑器、第三方手势库、Web Share 之外的系统分享集成 |
| 术语 | **壳层** = /m Layout（TabBar + AppBar + 安全区 + 离线条）；**页面** = 37 屏对应 Vue 视图；**浮层** = Sheet/Popup/Dialog/ActionSheet；**队列** = 教师逐份审核的提交列表 |

---

## 1. 手势规范（Phase 5）

### 1.1 总原则（硬规则）

1. **每个手势必须有按钮等价物**（WCAG 2.5.1）：手势只能加速，不能成为唯一入口；等价按钮放在屏内可见位置。
2. **滚动优先**：任何自定义手势不得劫持页面纵向滚动；内层横向滚动容器优先于左滑菜单。
3. **一次只响应一个手势**：纵向判定（位移 >8px 且 >横向 1.5 倍）后锁定方向，直到手指抬起；防止列表滚动中误触左滑。
4. **远离系统边缘**：左滑/右滑菜单不得从屏幕左右 20px 内开始（iOS Safari 边缘返回、Android 手势导航都会抢占）。
5. **反馈必须即时**：跟手反馈（<16ms 帧）、阈值触发反馈（≤100ms）；触觉反馈可选，不得作为唯一反馈（iOS 不支持 navigator.vibrate）。
6. **危险动作不做手势**：通过审核、发布成绩、交卷、删除一律只能点按按钮 + 二次确认（见 §1.5）。

### 1.2 手势总表

| 手势 | 适用屏 | 触发与阈值 | 跟手反馈 | 冲突与取消 | 按钮等价物 |
|---|---|---|---|---|---|
| 左滑露出操作（SwipeCell） | teacher-assignments 卡片 | 横移 >12px 开始跟手；露出宽度 = 120px；松手位移 >30% 或速度 >0.35px/ms 即展开 | 卡片跟手 translateX，右侧操作区宽 120（锁定/解锁 + 复制链接） | 纵向位移 >10px 取消；一次只允许一个卡片展开；点击卡片任意处先收起 | 卡片右上「更多」→ ActionSheet |
| 长按进入多选 | teacher-batch-select、teacher-review-queue（列表态） | 500ms ±50ms，位移 <8px | 触发时图标变勾选、整卡缩放 0.985、Android 轻震动 10ms（可选） | 移动超过 8px 取消；滚动中不触发 | 列表右上「选择」按钮 |
| 上下滑切换队列 | teacher-review-queue | 纵向位移 >40% 卡片高或速度 >0.5px/ms；卡片内滚动到边界才生效 | 卡片跟手 1:1；松手 220ms 归位/切卡；切卡后 300ms 锁防止连跳 | 卡片内可滚动区域优先；首/末条回弹并提示「已经是第一份/最后一份」 | 底部「上一位 / 下一位」按钮 |
| 下拉刷新 | student-assignments、student-scores、teacher-home、teacher-assignments、admin-home、admin-monitor | 下拉 >60px 松手触发 | 指示器跟手旋转/文案「下拉刷新」→「释放刷新」；触发后最短展示 800ms | 列表非顶部不触发；加载中不重复触发；筛选/搜索态不刷新（先清筛选） | 错误态「重试」按钮、页头刷新按钮（admin-monitor） |
| Sheet 拖拽关闭 | student-answer-sheet、student-submit-confirm、批量确认类 Sheet | 仅顶部 32px 把手区可拖（grabber 36×5 视觉 + 全宽 44 热区） | Sheet 跟手 translateY；遮罩透明度跟手 | 内部列表滚到顶才允许；位移 >30% 或速度 >0.5px/ms 关闭；关闭后焦点返回触发按钮 | 右上关闭按钮、点遮罩、Esc（外接键盘） |
| 系统返回键（Android） | 全部 /m 页 | 硬件/手势返回键 | 无 | 优先级：关闭最上层浮层 → history.back → 若在 Tab 根显示「再按一次退出」2s 内两次才退出壳 | 每屏左上返回按钮（二级页） |
| 浏览器返回（iOS/Android 浏览器） | 全部 /m 页 | 系统手势/按钮 | 无 | 由 history 管理；浮层打开时用 pushState 记录，返回时先关浮层（见 §1.3） | 同左 |
| 长按文本选择（代码） | teacher-review-code、teacher-review-diff | 系统长按选词；选中后 200ms 弹浮动工具条 | 选中行左侧 3px 品牌竖条 + 选区底色 | 无选中不弹；点空白关闭；工具条不遮挡选中行（上下自适应） | 工具条按钮（引用到评语/复制）；代码屏底部「复制」按钮 |
| 双指缩放 | 全部页面 | 系统默认 | 浏览器缩放 | 禁止 user-scalable=no；代码面板字号 Aa-/Aa+ 与双指缩放二选一实现（建议只做按钮，避免与页面缩放叠加） | 代码屏底部 Aa- / Aa+ |
| 横向滚动 | teacher-review-code、teacher-review-diff、≥768 表格 | 仅在 overflow-x 容器内 | 原生滚动 + 滚动条隐藏 | 不得冒泡到页面；行号列 sticky left 不随之横移 | 无（内容结构本身） |

### 1.3 浏览器/壳返回栈规则

| 场景 | 行为 |
|---|---|
| 二级详情页返回 | router.back() 回上一页；若直达（无历史）→ 回该角色 Tab 根（teacher-home / student-home 等），用 replace 避免空历史 |
| Sheet 打开 | pushState 一条虚拟记录（或 Vant Popup 的 close-on-popstate）；返回键先关 Sheet，不跳页 |
| 批量确认页返回 | 回批量选择页，保留已选集合 |
| 作答页返回 | 弹出二次确认「退出后已答内容会保存草稿，确定退出？」；确认后回作业详情 |
| Tab 根返回 | Android 壳内「再按一次退出」（Toast 提示 2s 内二次）；浏览器内正常返回上一站点 |
| 队列审完「完成」 | 回 teacher-home；不逐级返回（避免 12 次返回） |

### 1.4 手势发现性

- 首次进入审核队列：底部一次性提示条「上下滑切换 · 长按多选 · 点按钮审核」（localStorage 键 m-tip:review-queue 只显示一次），可点关闭，不遮挡底部动作条。
- 左滑操作卡片：首次显示 2s 的「左滑可锁定」轻提示（同上键 m-tip:swipe）。
- 所有手势提示必须同时提供按钮入口（§1.1 第 1 条），且提示文案不得出现「长按进入多选」这类危险承诺（见 §1.5）。

### 1.5 危险手势禁令（与设计稿的差异记录）

| 设计稿表述 | 落地结论 | 原因 |
|---|---|---|
| teacher-review-queue「长按进入多选」 | **不采纳**。长按 = 进入多选（或无效），审核通过必须点按底部按钮 + 二次确认 | 逐份审核是高后果动作；无撤销机制（上一轮决策 3）；长按误触率远高于点击 |
| teacher-assignments 卡片左滑「编辑/删除」 | **改为「锁定/解锁 + 复制链接」**；编辑/删除当前无后端接口（server/src/routes/teacher.js 只有 PUT /assignments/:id/lock） | 无接口 + 删除无撤销；见 05 屏 19 与 07 §7 风险 |
| 批量发布后 Toast + 撤销（历史设计稿曾写） | **不做撤销**；发布前用影响范围摘要 + 二次确认挡住 | 上一轮决策 3：后端无延迟生效/软标记能力 |
| 摇一摇、双击点赞、长按收藏 | 不做 | 无业务价值，增加误触 |

---

## 2. 动效规范（Phase 6）

### 2.1 令牌速查（来源 02-design-tokens.css）

| 令牌 | 值 | 使用边界 |
|---|---|---|
| --m-duration-press | 90ms | 按下/勾选等即时反馈 |
| --m-duration-fast | 160ms | 控件态、Tab 切换、chip 切换 |
| --m-duration-base | 220ms | 页面推进、Toast、提示条、骨架淡出 |
| --m-duration-sheet | 320ms | Sheet / 浮层打开（关闭用 fast） |
| --m-duration-page | 300ms | 仅首次进入/登录跳转等低频场景 |
| --m-ease-out | cubic-bezier(0.16,1,0.3,1) | 默认进入/出现 |
| --m-ease-sheet | cubic-bezier(0.32,0.72,0,1) | Sheet 本体 |
| --m-ease-spring | cubic-bezier(0.34,1.3,0.64,1) | 仅 Toast 入场一次轻微过冲；不得用于页面/队列 |
| 桌面 --duration-loop-spin / --duration-loop-pulse | 800 / 1200ms | 仅加载指示与骨架微光 |

### 2.2 场景表

| # | 场景 | 时长 | 缓动 | 动的属性 | 边界 |
|---|---|---|---|---|---|
| 1 | 按钮/卡片按下 | press 90ms | ease-out | transform(scale .98/.985) | 按下即反馈，不等异步完成 |
| 2 | Chip/Segment/Tab 切换 | fast 160ms | ease-out | background-color + color + 边框；Tab 内容仅 opacity | 不做横向滑动位移（页面滚动位置会跳） |
| 3 | 页面推进（列表→详情） | base 220ms（返回 fast 160ms） | ease-out | opacity + translateY(8px) | 只包页面内容；**不得 mode="out-in"**（桌面 R2-B54 故障案例） |
| 4 | Tab 根切换 | fast 160ms | ease-out | 仅 opacity | 高频操作，不做位移 |
| 5 | Sheet 打开 | sheet 320ms | ease-sheet | translateY(100%→0) + 遮罩 opacity | 跟手拖拽时无过渡；打开后内容立即可交互 |
| 6 | Sheet 关闭 | base 220ms | ease-out | 同上 | 关闭必须快于打开 |
| 7 | 队列切卡 | base 220ms | ease-out | transform + opacity | 跟手阶段 1:1；切卡后 300ms 锁；边界回弹 160ms |
| 8 | 下拉刷新 | 跟手 1:1；释放后 base 220ms | ease-out | translateY + rotate | 指示器旋转用 800ms 循环（加载中） |
| 9 | Toast 入场/出场 | base 220ms | ease-spring（入场）/ ease-out（出场） | translateY + opacity | 同屏最多 1 条；不阻塞操作 |
| 10 | 骨架→内容 | 320ms | ease-out | opacity 交叉淡入 | 骨架尺寸必须与真实内容一致，否则跳动 |
| 11 | AI 评分完成/新数据提示 | 入场 base 220ms；高亮保持 1600ms 后 320ms 淡出 | ease-out | opacity + background-color | 必须同时有文字/aria-live，不能只靠高亮 |
| 12 | 答题卡题号切换 | fast 160ms | ease-out | background + border + color | 当前题必须有描边/勾选双指示，不只靠颜色 |

### 2.3 禁止项

| 禁止 | 替代 |
|---|---|
| 视差滚动、滚动劫持、自动轮播 | 不做 |
| 循环/无限装饰动画（呼吸灯、漂浮、闪烁） | 只允许骨架微光（周期 ≥1s）与加载 spinner |
| 动 width/height/top/left/margin | 只用 transform/opacity/颜色类属性 |
| transition: all | 逐属性列出 |
| 常驻 will-change | 仅拖拽/动画期间临时加 |
| 任何交互反馈 >400ms；动画期间阻塞输入 | 动画播放时控件必须已可响应 |
| 闪烁 >3 次/秒 | WCAG 2.3.1 硬红线，本项目无频闪 |
| 滚动驱动动画 | 不做（兼容 + 眩晕） |

### 2.4 prefers-reduced-motion 降级

令牌层已把 --m-duration-* 归零（02-design-tokens.css 末尾），但**手势跟手动画是 JS 驱动**，必须显式处理：

| 场景 | 降级行为 |
|---|---|
| 全部 CSS 过渡 | 0ms（瞬时，而非取消） |
| 页面推进/列表进入 | 保留 opacity 0→1，位移置 0 |
| Sheet/队列拖拽 | 关闭跟手动画：手势仍可用，但直接切换（或阈值触发后瞬时切换）；不做回弹 |
| 骨架微光 | 停止动画，静态 --skeleton-bg；骨架→内容仍交叉淡入（瞬时） |
| Toast/高亮 | 保留静态展示与文字，取消淡出 |
| smooth scroll | 改 behavior: 'auto' |
| 触发条件 | 由 prefers-reduced-motion: reduce 的 matchMedia 监听（addEventListener 不可用时 addListener 回退，Chrome 69 兼容写法） |

**总原则：降级只去「动」，不去「信息」**：每条动效承载的信息必须有文字/图标/形状等价载体。

### 2.5 页面转场与 Vue Transition 约束

1. 不使用顶层路由过渡，不使用 mode="out-in"（桌面曾因此出现「进入组件解析失败即永久空白」的过渡死锁；见 client/src/App.vue 注释与 verify-frontend ⑨a/⑦g）。
2. /m 内的转场只包「页面内容区」，不包 TabBar/ActionBar（固定元素不得参与 transform，否则 iOS 会临时错位）。
3. 转场期间禁止阻塞数据请求；转场结束不重置滚动位置（除新页面首次进入）。
4. 路由切换后：document.title 更新为「页面名 · Deadpan 判题」，焦点移到页面 h1（tabindex=-1），读屏播报由 h1 文本承担。

---

## 3. 四态与反馈

### 3.1 五态定义（在四态基础上补 partial）

| 态 | 触发条件 | 视觉 | 文案模板 | 可恢复动作 | 无障碍 |
|---|---|---|---|---|---|
| loading | 请求在途且无可用数据 | 骨架屏优先（§3.2）；局部刷新用行内 spinner | 无文案（骨架即提示） | — | 容器 aria-busy=true + role=status；隐藏骨架的读屏干扰（aria-hidden） |
| empty | 请求成功且结果为空 | 线性 SVG 空态 + 标题 + 说明 + 主操作 | ① 无数据：「还没有作业」+「去题库布置」；② 筛选无结果：「没有符合条件的作业」+「清除筛选」；③ 无权限：「仅教师可见」+「切换账号」 | 主按钮 | 插画 aria-hidden；标题用真实文本 |
| error | 请求失败（网络/5xx/超时） | 错误图标 + 可读原因 + 重试 | 「数据加载失败，请检查网络后重试」 | 重试（必给） | role=alert；重试按钮可聚焦 |
| offline | navigator.onLine === false 或请求网络错误 | 顶部常驻离线条 + 列表灰化（保留上次渲染结构） | 「网络已断开，恢复后可继续」 | 自动恢复检测 + 手动重试 | role=status（非打断）；离线条不抢焦点 |
| partial | 多接口聚合页部分失败 / 批量操作部分成功 | 顶部 warning 条 + 失败项行级标记 | 「N 项中有 M 项加载失败」+「仅重试失败项」 | 仅重试失败项 | role=status |

规则：
1. 任何异步对象四态必须齐全；**不允许「只有 loading 和成功」**。
2. error 不得清空已成功的部分数据：聚合页降级为 partial（顶部警示条 + 保留旧数据）。
3. 403（无权限）与 404（不存在）文案必须区分，不能统一「加载失败」；401 统一走登录过期流程（§3.4）。
4. 离线态不允许清空页面（保留最后渲染内容并灰化），但**不允许缓存/展示过期数据为新数据**（无离线数据缓存，见 §3.6）。

### 3.2 骨架矩阵

| 页面类型 | 首次加载骨架 | 二次加载（筛选/翻页） | 局部刷新 |
|---|---|---|---|
| 列表页（作业/成绩/题库/学生/目录） | 3 张卡片骨架（标题 13px 行 + 2 行辅助 + 底部进度条）或 5 行列表骨架 | 保留旧数据 + 顶部 2px 进度条（不闪骨架） | 行内 spinner |
| 详情页（作业详情/成绩详情/审核详情） | hero 骨架（大标题 + 2 行）+ 1 张信息卡 + 2 段内容骨架 | — | 分项局部 spinner |
| 工作台（teacher-home/admin-home） | stats 三卡骨架 + 2 条最近作业骨架 | — | 数字局部更新不做骨架（直接替换 + 淡入） |
| 作答页 | 题干 2 行骨架 + 4 个选项骨架 | — | 保存状态文字（不遮题干） |
| 代码面板 | 不用骨架；显示 5 行占位 + 居中 spinner（>300ms 才出现，避免闪烁） | — | — |
| 登录页 / 文档页 | 不用骨架（静态或极快） | — | — |

骨架规则：行数 = 默认分页大小与 8 的较小值；骨架列宽/行高/卡片高必须与真实内容逐项对齐；微光周期 ≥1s；reduced-motion 下静态。

### 3.3 空态矩阵

| 类型 | 触发 | 标题 | 说明 | 主操作 |
|---|---|---|---|---|
| 初始无数据 | 新账号/新班级 | 还没有作业 | 教师布置后会出现在这里 | 有权限者显示「去布置」；学生无主操作 |
| 筛选无结果 | 搜索/筛选后 0 条 | 没有符合条件的作业 | 试试清空筛选条件 | 清除筛选 |
| 无权限 | 403 | 无权查看此内容 | 当前身份：李明 · 学生 | 回到我的首页 |
| 已用完次数 | 提交次数上限 | 提交次数已用完 | 本次作业最多提交 N 次 | 查看已提交结果 |
| 手机不支持 | 代码编辑类 | 手机暂不支持此操作 | 请用电脑打开（复制链接） | 复制链接 |

### 3.4 错误分类映射（与真实后端契约对齐）

| 触发 | UI 表现 | 文案 | 动作 |
|---|---|---|---|
| HTTP 401 / 登录态失效 | 全局 | 「登录已过期，请重新登录」 | 清 token/user → /m/login?expired=1（复用 api/request.js 的 setAuthRedirect 语义；移动端登录页常驻该提示） |
| HTTP 403 / 业务 1003 无权 | 403 页或行内只读提示 | 后端 message 优先；否则「无权访问该内容」 | 回到我的首页 / 切换账号 |
| HTTP 404 / 业务 1004 不存在 | 404 页或行内 | 「内容不存在或已被删除」 | 返回上一页 |
| HTTP 429 / 业务 1003 限流 | Toast（不打断页面） | 「操作过于频繁，请稍后再试」；登录页用后端文案「登录失败次数过多，请 5 分钟后再试」 | 按钮恢复可点；不自动重试 |
| HTTP 500 / 业务 2001 | 错误态 + 重试 | 「服务暂时不可用」+ 编号（见下） | 重试 |
| 网络错误/超时（30s） | offline 或 error | 「网络连接失败，请检查网络后重试」（SCREENS.md §3.6 统一文案） | 重试；onLine 恢复自动重试一次 |
| 业务 1002 多学校 | 登录页二次选择 | 后端 message「该学号存在多个学校，请选择所在学校」 | 学校选择器 |
| 业务 1007 软警告（布置含无标准包实训题） | 二次确认弹窗（非错误） | 后端 message 原样 + 「确认按开放性题目布置」 | 确认后带 confirmWithoutStandardPackage: true 重发 |
| 业务 1403 文件超限 | 行内错误 | 「文件超过大小限制（10MB）」 | 重新选择文件 |
| 业务 1404 接口不存在 | 错误态 | 「页面或接口不存在」 | 返回 |
| 离线 | 顶部离线条 | 「网络已断开」 | 恢复后手动重试 |

**错误编号**：设计稿 error-500 的 ERR-20261017-500 是演示值。当前后端 500 响应不含 requestId（server/src/app.js 错误中间件仅记录日志），生产落地二选一：① 前端生成「ERR-时间戳-随机 6 位」并在重试/反馈时携带；② 后端补 requestId（待确认，见 05 API 缺口表）。在补齐前，错误编号只作展示，不作为排查依据。

### 3.5 Toast / 提示条规范

| 项 | 规范 |
|---|---|
| 组件 | Vant Toast（命令式）统一封装在 components/m/ToastHost 的 useToast() 中；业务页不直接 import vant Toast |
| 位置 | 底部安全区 + 82px（浮层之上时 +16px，用 --m-z-toast-above-sheet） |
| 时长 | 单行 2000ms，双行 3000ms；错误 3000ms；不做常驻（除登录过期由页面 banner 承担） |
| 数量 | 同屏最多 1 条；后到覆盖前一条；不排队刷屏 |
| 文案 | 动词 + 结果 + 下一步（「已复制链接，可粘贴到电脑浏览器」），禁止只写「成功/失败」 |
| 无障碍 | 成功/普通 → role=status aria-live=polite；错误 → role=alert aria-live=assertive；Vant Toast 默认无 live 语义，封装层必须补 |
| 操作按钮 | 移动端 Toast 一律不放操作按钮（撤销机制不存在）；需要操作时用 banner 或 Sheet |

### 3.6 离线策略与边界

| 场景 | 行为 |
|---|---|
| 检测 | navigator.onLine + 请求网络错误双重判定；恢复用 online 事件 + 成功请求双重确认 |
| 离线条 | 壳层顶部（AppBar 下方）常驻 36px 条：「网络已断开，恢复后可继续」，role=status；恢复后展示 2s「网络已恢复」再消失 |
| 读操作 | 不清空已渲染内容，顶部提示；点击刷新失败保持旧内容 + Toast |
| 写操作 | 提交/交卷/审核/改分/发布在离线时禁用（按钮 disabled + 说明「离线不可提交」）；不做离线队列（明确非目标） |
| 草稿 | 答题页本地草稿（answers 状态）保留在内存/localStorage（键按 assignmentId + subQuestionId 隔离）；恢复网络后逐题保存草稿（PUT draft），不自动提交 |
| 缓存 | 不允许把 API 响应写入 SW 缓存或 localStorage 作为离线数据（隐私 + 数据一致性）；PWA 离线边界见 06 §4.4 |
| 恢复 | 离线期间未提交的答案不自动提交；用户点击提交时才逐题提交 |

### 3.7 乐观更新与回滚（移动端简化口径）

| 操作 | 是否乐观 |
|---|---|
| 主题开关、通知开关、勾选、筛选、展开/收起、左滑 | 允许（本地即时） |
| 打分输入框（改分中） | 允许本地显示，但**提交/通过必须等服务端确认** |
| 提交作业、交卷、审核通过、发布成绩、批量操作、删除/锁定 | **禁止**乐观；按钮 loading + 失败回滚到旧值并提示 |

回滚规则：失败时恢复旧值 + Toast（含可读原因）；不丢用户输入（评语/分数输入框保留）；同一实体同时只允许一个在途请求。

---

## 4. 安全区与键盘

### 4.1 viewport 与页面骨架

当前 client/index.html 的 viewport 是 width=device-width, initial-scale=1.0，**缺少 viewport-fit=cover**（真实缺口，M0 修改）；同时缺 theme-color meta（移动浏览器地址栏配色）。目标：

~~~html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0f16" media="(prefers-color-scheme: dark)">
~~~

规则：
1. 不改 user-scalable、不设 maximum-scale（WCAG 1.4.4）。
2. 页面高度 min-height: 100vh; 再写 100dvh;（顺序不能反）；固定底栏用 --m-safe-bottom。
3. 键盘弹起时 iOS Safari 工具栏收缩会改变 100vh → 不允许用 100vh 做固定布局（用 100dvh 或 flex 撑满）。
4. 滚动容器 -webkit-overflow-scrolling: touch（iOS 惯性）+ overscroll-behavior-y: contain（防下拉刷新与页面滚动打架）。
5. 输入框所在滚动区底部 padding 至少 --m-page-bottom-actionbar，保证聚焦时输入框不被固定条遮住。

### 4.2 键盘（visualViewport）

**事实**：Android WebView 与微信 X5 对软键盘的 resize 行为不一致；Capacitor Keyboard 插件默认 resize: 'native'（WebView 高度变化），设为 'body' 时页面不缩、只有 visualViewport 变化。因此必须用 visualViewport 做统一兜底。

| 步骤 | 规则 |
|---|---|
| 检测 | window.visualViewport 存在时监听 resize + scroll（去抖 50ms）；键盘弹起判据：window.innerHeight - visualViewport.height > 120px |
| 底部动作条 | 键盘弹起：ActionBar 从 fixed 切为 static（随内容上移）或隐藏；键盘收起恢复 fixed + 安全区 |
| 输入框可见性 | 聚焦后确保输入框底边 ≤ visualViewport.offsetTop + visualViewport.height - 16；不足则 scrollIntoView({block:'center'}) |
| 关闭输入 | 键盘弹起时右上角「完成」/「收起键盘」按钮（document.activeElement.blur()）；Sheet 顶部关闭按钮保持在键盘上方 |
| 降级 | 不支持 visualViewport（Chrome <61 / 老 WebView）：监听 resize + innerHeight 变化，聚焦后 setTimeout 200ms scrollIntoView；仍失败时底部动作条直接隐藏 |
| 壳内 | Capacitor Keyboard 建议 resize: 'native'；真机验收见 06 §5.5；不允许业务 UI 写平台分支，统一由 useVisualViewport() 提供 keyboardOpen 状态 |
| 输入法类型 | 见 §4.3 |

### 4.3 输入类型、键盘类型与自动填充

| 字段 | 属性 | 说明 |
|---|---|---|
| 教师工号（T2026001） | type=text autocomplete=username autocapitalize=off | 含字母，不能 numeric |
| 学生学号（2026001004） | inputmode=numeric autocomplete=username | 纯数字键盘 |
| 密码 | type=password autocomplete=current-password | 可见切换按钮 aria-label「显示密码/隐藏密码」 |
| 搜索 | type=search inputmode=search enterkeyhint=search | 300ms 防抖；清空按钮 aria-label |
| 评语/备注 | textarea enterkeyhint=enter | 不拦截换行；字数计数 aria-live=polite |
| 分数 | inputmode=decimal enterkeyhint=done | 只允许数字与小数点；超范围行内错误 |
| 文件 | input type=file accept=应用限定的扩展名 | 移动端 zip 选择；Android 文件选择器；iOS「文件」App；>10MB 前端先拦截 |
| 时间 | 使用 Vant 日期选择器（Popup + Picker） | 移动端不使用桌面 DatePicker（体积 + 交互不适配） |

### 4.4 底部动作条 / TabBar 与键盘、安全区的关系

| 场景 | 规则 |
|---|---|
| 有 TabBar 且有输入 | 输入页一般不要 TabBar（作答页、审核详情、向导页用 ActionBar，二级页无 Tab）；若必须同时存在，键盘弹起时 TabBar 隐藏 |
| ActionBar + 键盘 | 见 §4.2；键盘弹起时按钮不得被遮挡，主按钮至少保留可点 |
| ActionBar + Sheet | Sheet 打开时 ActionBar 隐藏（body data-bottom="sheet"），关闭恢复 |
| 横屏 | ActionBar 底部使用 safe-bottom；高度不压缩按钮高度（--m-btn-h 50 不变），内容区可滚动 |
| Android 导航手势条 | 底部 padding safe-bottom（16px 基准 + 系统注入）；不允许把主按钮放在最底部 12px 内 |

---

## 5. 性能（Phase 7 · 移动端专项）

### 5.1 预算与现状基线（2026-10-17 实测）

**现状**：client/dist/assets 入口 JS 1,344,043 字节（gzip 约 398,935 字节），入口包含 ant-design-vue 全量注册（main.js app.use(Antd)）与桌面设计令牌；Monaco 为懒加载（本地 monaco/vs）。移动端首屏**继承这笔入口成本**——因此：

| 指标 | 目标（M0 后） | 说明 |
|---|---|---|
| 首屏 LCP（Slow 4G，Chrome DevTools 节流） | ≤ 3.0s（基线）→ 2.5s（入口瘦身完成后） | 入口 390KB gzip 是主要成本；不承诺 2.5s 直到瘦身评估完成 |
| /m 路由增量 JS（gzip） | ≤ 120KB | Vant 按需 + 移动页面 chunk；超过即优化 |
| /m 路由增量 CSS（gzip） | ≤ 20KB | 移动令牌 + Vant 组件样式 + 页面样式 |
| CLS | ≤ 0.1 | 骨架尺寸对齐 + 图片/字体不布局跳动 |
| INP | ≤ 200ms | 长按/左滑/队列手势主线程 ≤50ms |
| 长列表滚动 | 200 条列表掉帧 <5% | 见 §5.2 |
| 代码面板 | 500 行首屏可交互 ≤300ms；滚动 60fps | 见 §5.3 |
| 内存 | 单页 ≤80MB（中端机） | 代码文件 LRU ≤5 个 |

入口瘦身（不阻塞 M0，列为 M0 评估项）：把 main.js 的 app.use(Antd) 改为按需注册（影响桌面全站，需桌面线配合）或为 /m 提供独立入口 HTML（双入口，需 vite 多入口 + nginx）。评估结论在 M0 末书面记录，未通过则接受 3.0s 基线。

### 5.2 长列表

1. 分页 pageSize 20；Vant List 触底加载；加载中显示「加载中…」；没有更多显示「没有更多了」；首屏不满一屏不自动加载第二页（避免无限请求）。
2. 超过 200 条启用窗口化：只渲染视口 ±5 屏的项（虚拟列表），其余用占位高度；用 IntersectionObserver 或滚动位置计算（禁止 scroll 事件里同步 layout）。
3. 列表 key 用业务 id；筛选/排序变化后回到顶部并取消进行中的请求（AbortController）。
4. 行内不放大图；图标用内联 SVG（icons.svg 已有 80+ 图标），不引外部图片或字体。
5. 学生端/教师端列表卡片内的进度条、环形进度用 CSS 渐变，不用 canvas。

### 5.3 代码面板 500 行

| 决策 | 内容 |
|---|---|
| 不引入编辑器 | 不加载 Monaco/CodeMirror；只读渲染自研 CodeViewer |
| 渲染方式 | 预转义 + 轻量 tokenizer（关键词/字符串/注释/数字正则一次遍历；500 行 ≤5ms）；行号列用 CSS counter 或独立列，sticky left |
| 虚拟化 | >300 行按 50 行块分割，只挂载视口附近块（±2 块）；用 content-visibility: auto 作为增强（Chrome 85+，老内核忽略不影响功能） |
| 选中 | 原生 Selection（长按选词/选段）；选中后浮动工具条（引用到评语/复制/搜索），工具条位置相对选区 rect 计算，避免遮挡 |
| 横向滚动 | overflow-x: auto + -webkit-overflow-scrolling: touch；行号 sticky；长行不折行（默认），提供「换行」开关（localStorage 记忆） |
| Diff | 逐文件逐块折叠；只对可视块做 diff/着色；文件 >200KB 或 >2000 行提示「文件过大，请在电脑查看」；并排 diff 仅在 ≥1024 平板/桌面宽度提供 |
| 内存 | 文件内容 LRU ≤5；切换文件释放旧 DOM |
| 验收 | Chrome DevTools Performance：500 行文件首屏 scripting ≤100ms、滚动无 >50ms long task（中端机实测记录在 M4 验收报告） |

### 5.4 网络、Socket 与轮询

1. 请求并发 ≤6；同 URL 去重；页面卸载/切换取消在途请求。
2. Socket.IO（复用 client/src/composables/socketConfig.js）：仅在教师审核相关页建连（队列/详情），离开断开；事件 graded 只触发「有新数据，点击刷新」提示（不静默插入，桌面 04 §4.3 同规则）。
3. 轮询：admin-monitor 30s（页面可见时）；student-assignment-done 30s（评分状态）；teacher-review-queue 不轮询（socket + 手动刷新）；页面隐藏时暂停（visibilitychange）。
4. 弱网重试：读请求最多自动重试 1 次（退避 1s），写请求不自动重试（避免重复提交）；批量提交失败提供「重试失败项」。

### 5.5 度量命令

~~~bash
# 1) 构建体积（移动增量看 /m 的异步 chunk）
npm --prefix client run build
ls -lh client/dist/assets | grep -iE 'm-|mobile|Layout' | head

# 2) 本地移动端预览（localhost 才能用 SW；真机测试需 HTTPS 或部署环境）
npm --prefix client run dev -- --host --port 5174

# 3) Lighthouse（Chrome DevTools 自带，或用 npx lighthouse —— 版本待确认）
#    Mobile 预设 + Slow 4G，记录 LCP/CLS/INP/TBT 四项到 M1/M3 验收报告

# 4) 手势/长列表压测（M0 交付的 Playwright 脚本）
node client/scripts/verify-mobile.mjs --perf --base http://127.0.0.1:5174/exam/
~~~

---

## 6. Android WebView / 微信浏览器差异

| 维度 | Android Chrome | 微信内置浏览器（X5 / Chromium） | Android 系统 WebView（Capacitor 壳） | iOS Safari（兜底，不出包） |
|---|---|---|---|---|
| 内核更新 | 跟随 Chrome | 跟随微信版本，常年落后 | 跟随系统 WebView / 厂商 | 跟随 iOS 版本 |
| CSS 变量/env/grid gap | ✅ | ✅（较新版本） | ✅（Android 7+ WebView 现代版） | ✅ |
| dvh | Chrome 108+ | 视版本（必须 vh 双写） | 视 WebView 版本（vh 双写） | iOS 15.4+ |
| visualViewport | 61+ ✅ | 多数 ✅，键盘行为差异大 | ✅（Keyboard 插件配合） | ✅ |
| Service Worker / PWA 安装 | ✅（HTTPS） | ❌ 不支持「添加到主屏」，SW 行为不稳定 | 不需要（壳） | ✅ SW；安装需手动「添加到主屏」 |
| beforeinstallprompt | ✅ | ❌ | 不适用 | ❌ |
| 文件选择（zip） | ✅ 系统选择器 | 可能受限（部分版本只能选图片/文件管理差异） | WebChromeClient 原生选择器（真机验收） | ✅「文件」App |
| 下载 APK | ✅ 直接下载 | ❌ 微信内禁止直接下载 → 引导「在浏览器打开」 | 不适用 | 不适用 |
| 深色模式 | 跟随系统 + 手动 | 常不传递 prefers-color-scheme | 跟随系统 + 手动 | 跟随系统 + 手动 |
| 返回手势 | 浏览器返回 | 微信左上角关闭/X5 返回 | Android 系统返回键（Capacitor 接管） | 系统左缘返回 |
| 分享 | navigator.share ✅ | ❌（需微信 JS-SDK，未接入） | 不适用 | navigator.share ✅ |
| localStorage 稳定性 | 稳定 | 可能被清理/无痕模式失效 | 持久（壳内） | ITP 可能清退非主屏站点存储 |
| 扫码打开网页 | ✅ | ✅（但登录态需重登） | 不适用 | ✅ |
| 我们的策略 | 完整功能 | 可用但降级提示：不支持安装 PWA；上传失败/分享不可用时提示「在浏览器打开」 | 完整功能 + 原生壳能力 | 可用但明确不承诺推送/后台 |

**检测原则**：能力检测优先（'serviceWorker' in navigator、'share' in navigator、visualViewport、CSS.supports）；UA 只用于「微信内提示去浏览器打开」这一类**提示**，不用 UA 决定功能开关（与桌面文档 docs/ui-redesign/04-interaction-a11y.md §6.1 同口径）。禁止 UA 分支出现在业务 UI 逻辑中；平台差异统一收敛到 composables/useDevicePlatform.js。

---

## 7. WCAG 2.1 AA 清单（可验证）

### 7.1 对比度（按令牌实算，2026-10-17 用 WCAG 相对亮度公式）

浅色主题（白底 / 画布底 #f6f7f9）：

| 组合 | 实测 | 判定 |
|---|---|---|
| 正文 --text-primary #141922 on 画布 #f6f7f9 | 16.44:1 | AAA |
| 次要 --text-secondary #545c69 on 画布 | 6.30:1 | AA ✓ |
| 三级 --text-tertiary #6b7280 on 白 | 4.83:1 | AA ✓ |
| 三级 on 画布 #f6f7f9 | 4.51:1 | AA ✓（余量仅 0.01，禁止再叠加透明度） |
| 三级 on 次级面板 #fbfcfd | 4.71:1 | AA ✓ |
| **三级 on 内嵌底 #eef0f4** | **4.24:1** | **不达标** → 规则见下 |
| 品牌 --brand-600 on 白 | 5.57:1 | AA ✓ |
| 品牌 on 画布 / 选中底 #eff6ff | 5.19 / 5.12:1 | AA ✓ |
| 状态标签：成功 #027a48 on #ecfdf3 / 警告 #b54708 on #fffaeb / 危险 #b42318 on #fef3f2 / 信息 #0055ab on #eff6ff / 中性 #545c69 on #eef0f4 / 强调 #6938ef on #f4f3ff | 5.13 / 5.20 / 6.05 / 6.68 / 5.91 / 5.60:1 | AA ✓ |
| 主按钮白字 on --brand-600 | 5.57:1 | AA ✓ |
| 危险按钮白字 on --red-600 | 4.83:1 | AA ✓ |
| 分数 优秀 #039855 on 白 | 3.73:1 | **仅大字**（≥24px 常规或 ≥18.7px 粗体）；15px 分数 chip 不可只用该色 |
| 分数 及格 #dc6803 on 白 | 3.49:1 | **仅大字**；同上 |
| 分数 良好 #0066cc / 不及格 #d92d20 on 白 | 5.57 / 4.83:1 | AA ✓ |
| 禁用文字 #a5acb8 on 白 | 2.28:1 | 豁免（非活动组件），不得用于正常内容 |

深色主题（#141922 卡面 / #0b0f16 画布）：

| 组合 | 实测 | 判定 |
|---|---|---|
| 正文 #e8eaee on #141922 / on #0b0f16 | 14.63 / 15.93:1 | AAA |
| 次要 #a9b0bb on #141922 / sunken #0f131a | 8.07 / 8.52:1 | AAA |
| 三级 #8b929e on #141922 / #0f131a | 5.62 / 5.94:1 | AA ✓ |
| 三级 on 次级面板 #232935 | 4.65:1 | AA ✓ |
| 链接 #8ec5ff on #141922 / #0b0f16 | 9.72 / 10.58:1 | AAA |
| 品牌 on-brand #06121f on brand-400 #4d9bf5 | 6.57:1 | AA ✓ |
| Vant 深色 text-color-2/3 若用 Vant 默认值（#707070/#4d4d4d） | 约 2.0–3.5:1（#4d4d4d on #1c1c1e ≈2.0；#707070 ≈3.5） | **必须映射**为我们自己的 --text-secondary/tertiary（02 §4.3.5） |

**不达标项与处置（P1，落地前必须定稿）**：

| 编号 | 问题 | 处置 |
|---|---|---|
| C-1 | --text-tertiary on --bg-sunken（#eef0f4）= 4.24:1 | 规则：sunken 面上文字一律用 --text-secondary（5.91:1）或改白底；设计稿中搜索框 placeholder、骨架旁辅助字落在 sunken 上的，落地统一改色（不改设计稿文件，handoff 记录） |
| C-2 | --score-excellent / --score-pass 小字号 3.73 / 3.49:1 | 规则：只有 ≥24px（或 ≥18.7px 粗体）的分数可用这两色；列表内小分数用 --text-primary + 等级文字/图标；设计稿 .score-chip 15px 彩色在落地时改为中性色文字 + 状态标签 |
| C-3 | 半透明 AppBar/TabBar（设计稿毛玻璃）叠加内容后的合成对比度未实测 | 生产默认实色（--m-appbar-solid / --m-tabbar-solid）；若要毛玻璃，必须提供深/浅两套实测证据，否则不合并 |
| C-4 | 10.5px Tab 文字 | 对比度达标（on 白 4.83:1），但系统字号放大/极窄屏可能截断；规则：TabBar 文字单行省略 + aria-label 提供完整名称；不做更小字号 |

### 7.2 焦点与键盘（SC 2.1.1 / 2.1.2 / 2.4.3 / 2.4.7）

| 项 | 要求 |
|---|---|
| 焦点可见 | 全局 :focus-visible 用 2px outline var(--border-focus) + offset 2px；Vant base.css 会清除 outline，必须在 mobile-vant-theme.css 之后补回；深色下用 --brand-400 |
| 无键盘陷阱 | Sheet/Dialog 打开后焦点限制在容器内（Tab 循环），Esc/关闭按钮可退出；代码面板可 Tab 进出 |
| 焦点返回 | 浮层关闭后焦点回到打开它的按钮；路由切换后焦点到新页 h1（tabindex=-1） |
| Tab 顺序 | 壳层：跳过导航（skip link，见下）→ AppBar → 主内容 → ActionBar/TabBar；TabBar 在 DOM 末尾但视觉在底部，符合自然顺序 |
| Skip link | 每个 /m 页首个可聚焦元素是「跳到主内容」，指向 #main（首次 Tab 出现，视觉隐藏、聚焦时显示） |
| 外接键盘 | 平板/桌面模式：Tab/Enter/Esc 可完成登录、列表滚动、审核、Sheet 关闭；不改动浏览器默认快捷键 |
| 屏幕阅读器 | 见 §7.4 |

### 7.3 触控与手势（SC 2.5.1 / 2.5.5 / 2.5.8）

| 项 | 要求 |
|---|---|
| 触控目标 | ≥44×44（§0、02 §4.2）；相邻 ≥8px；行内小按钮用伪元素扩展热区 |
| 手势等价 | 左滑/长按/上下滑/下拉刷新/Sheet 拖拽均有按钮入口（§1.2 最后一列） |
| 手势可取消 | 所有手势在位移超过阈值前可取消；滚动中不误触发 |
| 不依赖 hover | 所有操作必须点按可达；hover 只作为增强 |
| 双击缩放 | 不禁用；touch-action: manipulation 只消除 300ms 延迟，不阻止 pinch-zoom |

### 7.4 屏幕阅读器与语义（SC 1.3.1 / 4.1.2 / 4.1.3）

| 元素 | 要求 |
|---|---|
| 地标 | header（AppBar）/ nav（TabBar，aria-label=主导航）/ main（id=main）/ 浮层 role=dialog aria-modal=true aria-labelledby |
| 底部 Tab | 用 nav + button；当前项 aria-current=page；角标数字读作「N 项待办」（aria-label） |
| 状态标签 | 文字 + 图标，禁止只靠颜色；装饰图标 aria-hidden=true |
| 题号宫格 | 每个题号 button，aria-label=「第 5 题，已答 / 未答 / 已标记」；当前题 aria-current=true |
| 选项组 | role=radiogroup / group + aria-labelledby 题干；每个选项 role=radio aria-checked；选中态同时有描边 + 勾 |
| 代码面板 | 行号列 aria-hidden=true；代码用 pre + code（读屏按文本读）；「复制代码」按钮 aria-label |
| 动态播报 | 保存草稿「草稿已保存 16:30」role=status；提交成功/失败 role=alert/status；AI 评分完成 aria-live=polite；批量进度「已处理 3/12」role=status |
| 图片 | 无外部图片；文档截图必须有 alt；装饰 SVG aria-hidden |
| 页面标题 | 每页唯一 h1；document.title 随路由更新；标题层级不跳级 |
| 语言 | html lang=zh-CN（client/index.html 已正确）；英文术语用 lang=en 包裹（如 API 名） |

### 7.5 表单与错误（SC 3.3.1 / 3.3.2 / 3.3.3 / 3.3.4）

| 项 | 要求 |
|---|---|
| 标签 | 每个输入有可见 label（for/id）或 aria-label；placeholder 不作为唯一标签 |
| 必填 | aria-required=true + 视觉星号 + 图例说明 |
| 错误 | 字段下方错误文案 + aria-describedby + aria-invalid=true；错误前有图标 + 文字，不只红边 |
| 提交失败 | 焦点移到第一个错误字段；登录错误 banner role=alert |
| 防错 | 交卷/审核通过/发布/批量操作二次确认；确认文案必须包含影响范围与「不可撤销」 |
| 帮助文本 | 与错误分开 id，均用 aria-describedby |

### 7.6 动效、时间与闪烁（SC 2.2.1 / 2.2.2 / 2.3.1 / 2.3.3）

| 项 | 要求 |
|---|---|
| 闪烁 | 无频闪；骨架微光周期 ≥1s；不新增循环装饰动画 |
| 自动更新 | 无自动轮播；Socket 更新只提示不插入；倒计时不自动跳转（最后 10 分钟提醒 + 可继续作答） |
| 考试倒计时 | 最后 10 分钟：数字变 --status-danger-fg + 每 60s aria-live=assertive 播报剩余时间；不强制交卷（由后端截止时间兜底） |
| 减少动效 | 系统 reduce 时按 §2.4 全量降级；信息不丢失 |
| 会话超时 | 401 时不直接踢到空白：跳 /m/login?expired=1 并常驻提示「登录已过期」 |

### 7.7 200% 缩放、320px 与文本间距（SC 1.4.4 / 1.4.10 / 1.4.12）

- 浏览器 200% 缩放（等效 640px 逻辑宽）：/m 页面不出现整页横向滚动（代码面板/表格容器内部横滚除外）；≥768 表格视图此时按 <768 卡片渲染（媒体查询自然生效）。
- 320px 宽：功能完整、无横向滚动；按钮文字不截断成单字；Tab 文字省略但 aria-label 完整。
- 用户调大系统字体（Android 字号/显示大小）：正文不裁切、不重叠；固定高度容器用 min-height；禁止对正文容器设固定 height。
- 文本间距：正文不得 user-select: none（代码行号除外）；行高用令牌的比例值，不写死 px 行高。

### 7.8 验收工具与命令

~~~bash
# 1) axe-core 自动化（M0 交付；@axe-core/playwright 为 devDependency，版本待确认）
node client/scripts/verify-mobile.mjs --a11y --base http://127.0.0.1:5174/exam/

# 2) 键盘走查：Chrome DevTools 设备模拟 + 外接键盘 Tab 全流程（手动，记录到 M3 验收）

# 3) 屏幕阅读器：Android TalkBack + Chrome 走「登录→作业→作答→提交」；iOS VoiceOver 走「成绩查看」冒烟（不出包也要保证 Safari 可用）

# 4) 对比度：DevTools 取计算样式 + WCAG 公式；本文件 §7.1 的数值为令牌实算，改动令牌后需重算

# 5) reduced-motion：DevTools Rendering → Emulate prefers-reduced-motion: reduce，逐屏检查 §2.4
~~~

**判定**：axe-core 严重（critical/serious）问题 0；键盘可完成「登录→作业列表→详情→作答→交卷」与「审核队列→详情→通过」两条主链路；TalkBack 可读出 TabBar 当前项、题号状态、保存状态、错误提示。

---

## 8. ≥768 回退桌面式表格（断点策略）

### 8.1 断点与判定

| 区间 | 布局 | 判定 |
|---|---|---|
| <768 | 移动卡片布局 | 默认（/m 路由） |
| 768–1023 | **移动端表格视图**（MDataTable，原生 table 语义、粘性首列、横向滚动） | matchMedia('(min-width:768px)') → useMobileLayout().isTablet；CSS 媒体查询同时生效 |
| ≥1024 | 保持 /m，但页头显示「建议使用桌面版」提示条（可关闭，localStorage 记忆）+ 手动入口 | 不自动跳桌面路由（避免打断表单/作答） |
| 任意宽度 + pointer: fine | 不改变布局；桌面鼠标用户若要完整功能点「切换到桌面版」整页跳转 | matchMedia('(pointer: fine)') 只作为提示条件 |

**自动切换（进入 /m 的判定）与表格回退是两件事**：自动切换只发生在「首次进入/外部直达」时，判定 ≤767px 且 pointer: coarse（见 07 §2.2）；表格回退发生在用户已在 /m 内、视口达到 768+ 时，由组件层切换，不跳路由、不重载页面。旋转屏幕/拖拽窗口不整页跳。

### 8.2 适用屏与列优先级

| 屏 | 表格列（P0） | P1（≥768 显示） | P2（≥1024 显示） |
|---|---|---|---|
| teacher-assignments | 标题 + 状态 + 主操作 | 班级 + 提交进度 | 截止时间 + 创建时间 |
| teacher-assignment-detail（学生行） | 姓名 + 状态 + 操作 | 学号 + 分数 | 提交时间 |
| teacher-review-queue | 姓名 + AI 分 + 状态 | 学号 + 提交时间 | 题数 |
| teacher-batch-select | 勾选 + 姓名 + 状态 | 学号 + 分数 | 班级 |
| teacher-class（学生） | 姓名 + 班级 + 状态 | 学号 + 分数 | — |
| teacher-questions | 标题 + 类型 + 分值 | 难度 + 更新时间 | 使用次数 |
| admin-directory | 名称 + 类型 + 规模 | 学校/教师 | 创建时间 |
| admin-monitor（进程） | 进程名 + 状态 | CPU + 内存 | 重启次数 + PID |
| student-assignments / student-scores | 不转表格（卡片信息 <4 列，表格反而降低可读性） | — | — |

### 8.3 表格组件与交互

1. 组件：components/m/MDataTable.vue（新写，原生 table，不引 antd Table —— 避免把桌面 antd chunk 拉进 /m）；行高 44（--m-touch-min），表头 sticky top，首列 sticky left，操作列 sticky right。
2. 横向滚动容器：tabindex=0 + role=region + aria-label「可横向滚动表格」；焦点可见；键盘左右键滚动（原生滚动容器即可）。
3. 行点击 = 打开详情；勾选列 checkbox 有 aria-label（「选择 陈嘉懿 的提交」）；表头全选同。
4. 空态/错误态复用 §3；分页用「加载更多」（mobile 风格）或简单分页条（≥768 可用），不搬桌面分页器。
5. 表格与卡片**共享同一数据源与状态**（composable 只写一次），只切换渲染层；避免两套请求逻辑。

### 8.4 平板/旋转注意

- 旋转不重置筛选、不丢输入（组件切换由 v-if + 同一状态驱动）。
- 平板横屏（1024×768）下 review-code/diff：代码区宽度足够，diff 可并排（≥1024）；768–1023 保持逐块折叠。
- iPad 默认桌面 UA + pointer: coarse：宽度 ≥768 → 不自动进 /m（用户可手动从移动版入口进入）；已手动进入 /m 的用户在 iPad 上得到表格视图（§8.1）。

---

## 9. 交付前自测清单（逐项打勾）

**A. 手势**

- [ ] A1 左滑卡片：跟手、单卡展开、纵向滚动不误触、点卡片先收起；等价按钮存在
- [ ] A2 长按 500ms 进入多选；滚动中不触发；移动端无「长按直接通过」
- [ ] A3 队列上下滑：边界回弹、切卡 300ms 锁、内层滚动优先、等价按钮存在
- [ ] A4 下拉刷新：仅在列表顶部触发、最短展示 800ms、失败保留旧数据
- [ ] A5 Sheet 拖拽：仅把手区、内部滚动到顶才可拖、关闭后焦点回到触发按钮
- [ ] A6 Android 返回键：先关浮层 → 路由返回 → Tab 根二次确认退出
- [ ] A7 代码面板长按选择：无选中不弹、工具条不遮挡、引用到评语可追加

**B. 动效**

- [ ] B1 所有反馈 ≤400ms，Sheet 关闭快于打开
- [ ] B2 reduced-motion 下瞬时切换且信息完整（队列/Ssheet/骨架/Toast）
- [ ] B3 无循环装饰动画（骨架微光除外）、无视差、无滚动劫持
- [ ] B4 页面转场无 mode="out-in"、转场不包 TabBar/ActionBar

**C. 四态与反馈**

- [ ] C1 每个列表页可见 loading/empty/error/offline 四态（用 DevTools 断网+改响应验证）
- [ ] C2 空态区分「无数据/筛选无结果/无权限」；主操作正确
- [ ] C3 错误文案可读、有重试、不显示 stack/英文原文
- [ ] C4 离线条常驻、写操作禁用、恢复后提示且不自动提交
- [ ] C5 批量部分失败有逐条结果与「重试失败项」
- [ ] C6 1007 软警告弹窗文案原样展示且确认后能继续

**D. 键盘与安全区**

- [ ] D1 输入框聚焦时不被键盘遮挡（Android Chrome / 微信 / 壳内各一次）
- [ ] D2 底部动作条在键盘弹起时不遮挡主按钮
- [ ] D3 Sheet 顶部关闭按钮在键盘弹起时仍可点
- [ ] D4 横屏左右安全区生效，无内容被刘海遮挡
- [ ] D5 100vh/100dvh 降级：老 WebView 下页面可滚动到底

**E. 无障碍**

- [ ] E1 axe-core critical/serious = 0
- [ ] E2 Tab 可完成登录与作答主链路；焦点可见；浮层焦点陷阱/返回正确
- [ ] E3 TalkBack 可读出 TabBar、题号状态、保存状态、错误提示
- [ ] E4 所有图标按钮有 aria-label；状态不只靠颜色；选中有描边/勾
- [ ] E5 200% 缩放与 320px 无整页横向滚动
- [ ] E6 reduced-motion 生效且信息不丢

**F. 兼容**

- [ ] F1 Android Chrome 真机走完学生作答链路
- [ ] F2 微信浏览器走完「登录→查看作业→复制链接」，上传失败给出「在浏览器打开」提示
- [ ] F3 Capacitor 壳内走完教师审核链路，系统返回键行为符合 §1.3
- [ ] F4 iOS Safari 冒烟（登录→成绩查看），PWA 可添加到主屏（手动指引）

**G. 性能**

- [ ] G1 /m 路由增量 JS ≤120KB gzip、CSS ≤20KB gzip
- [ ] G2 200 条列表滚动掉帧 <5%
- [ ] G3 500 行代码面板首屏可交互 ≤300ms、滚动无长任务 >50ms
- [ ] G4 首屏 LCP 记录并写入 M1/M3 验收报告（相对基线不劣化）
- [ ] G5 页面隐藏时轮询暂停、Socket 断开

**H. 平板 / ≥768**

- [ ] H1 768/1024 宽度下列表切表格（§8.2 适用屏），列优先级正确
- [ ] H2 表格横滚容器可键盘聚焦、首列 sticky、行点击可进详情
- [ ] H3 旋转不丢筛选/输入、不整页跳转
- [ ] H4 ≥1024 显示「建议桌面版」提示条且可关闭记忆

