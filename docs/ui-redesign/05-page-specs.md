# 逐页设计规范（Page Specs）

> 对应 skill Phase 9（handoff）。输入：[`_inventory-pages.md`](./_inventory-pages.md)（31 个 .vue / 10040 行的实测盘点）。
> **思路：先把 26 个页面收敛成 5 个模板，再逐页只写差异。** 模板消灭重复（现状有 15 份逐字复制的页面外壳 CSS），差异保证每页仍然只有一件事。

---

## 1. 五个页面模板

### T1 · 列表页模板（ListPage）—— 覆盖 13 页

```
页面外壳 PageShell（统一 .page / .page-header，替换 15 份重复 CSS）
├ PageHeader：标题 + 一句话描述 + [主操作]（唯一）
├ [可选] KPI 行：StatCard × 2–4（数据量足够时才出现）
└ Card
  ├ Toolbar：搜索 + 筛选（≤3 个）+ spacer + 列设置/导出（次要，ghost）
  ├ Table：状态列 = StatusTag；时间列 = 格式化（相对 + title 绝对）；空态 = EmptyState；加载 = 8 行骨架
  └ TableFooter：共 N 条 · 分页（**统一服务端分页**，废弃客户端切片双轨）
```

| 统一项 | 规范 |
|---|---|
| 表头 | 左对齐、无竖线、`--table-header-bg`；现状的 `:deep(.ant-table-thead > tr > th){text-align:center !important}` 全部删除 |
| 行高 | `--table-row-h`（compact 44 / comfortable 52） |
| 时间 | 列表用相对时间（"3 小时前"），`title` 给绝对时间；**禁止出现 ISO 字符串**（现状题库列表直接渲染 `2026-06-01T17:02:35.065Z`） |
| 状态 | 统一 `StatusTag` + `statusMap`（现状约 10 页各自实现 statusColor/statusText） |
| 行操作 | ≤3 个，右对齐；危险操作用 `--red-600` 文本按钮；**不使用红底实心按钮** |
| 空态 | EmptyState 三文案模板（无数据 / 无搜索结果 / 无权限），主操作按钮指向该页唯一的创建入口 |
| 加载 | 骨架屏优先（≥8 行），不用转圈；翻页时保留旧数据 + 顶部 2px 进度条 |

**适用**：admin Schools/Classes/Teachers/Students/Monitor、teacher Classes/Students/Questions/Assignments/Review/ReviewClass/Teams、student Assignments/Scores。

### T2 · 表单编辑页模板（FormPage）—— 6 页

```
PageShell
├ 返回条：← 返回{来源} + 对象名 + 状态徽标
├ 主体两栏（≥1200px）
│  ├ 左：内容编辑区（题干 / 富文本 / 代码 / 结构树）
│  └ 右：属性面板（sticky，320px）：类型、难度、分值、评分标准、可见性
└ 底部动作条 ActionBar：保存草稿（次要） · 保存并发布（主） · 删除（危险，收进更多菜单）
```

| 统一项 | 规范 |
|---|---|
| 表单标签 | **所有 `a-form-item` 必须有 label**（现状 51 个中有 15 个无 label，`QuestionEdit.vue` 的 11 个全部无 label 只靠 placeholder） |
| 错误 | 就近显示 + `aria-describedby` 关联；错误色 `--status-danger-fg` |
| 自动保存 | 统一 `useDraftAutosave`（防抖 1.5s）：状态文本放动作条左侧，`role="status" aria-live="polite"`（现状三套不同节拍：1.5s/2s/300ms） |
| 编辑器外壳 | 统一 `EditorShell`（工具栏 + 状态条 + 全屏）；Monaco 只读查看器统一 `CodeViewer`（现状 2 页绕过封装自建 Monaco） |
| 危险动作 | 统一 `ConfirmDialog`（现状 `Modal.confirm` 11 处与 `a-popconfirm` 12 处混用） |

**适用**：teacher QuestionEdit（新建/编辑通用题）、ProjectQuestionEdit（新建/编辑实训题、学生作答双角色）、TeamEdit、以及 13 个页面里的 Modal 表单（Modal 宽度统一：小 480 / 中 640 / 大 820，禁止 `"820px"` 字符串混写）。

### T3 · 工作台模板（Workbench）—— 2 页

预览见 `preview/index.html` → 「审核工作台」。

```
工作台头部（56px，sticky）：← 返回 · 对象名 · 类型标签 · 提交人/时间 · 状态徽标 · [上一位][下一位][发布成绩]
三栏（264px / 自适应 / 384px）
├ 左：Tabs（学生提交 / 标准答案包）+ FileTree
├ 中：文件标签页 + CodeViewer（只读 Monaco）
└ 右：ScorePanel（AI 总分 / 分项 ✓△✗ / 教师终分 / 评语 / 动作）
```

| 统一项 | 规范 |
|---|---|
| 断点 | ≥1200 三栏；1024–1199 收右栏为抽屉（浮动按钮打开）；<768 单栏 + 左栏抽屉 |
| 轮询/推送 | 统一 `useSocketRefresh`（"有新数据，点击刷新" 或行级高亮），**禁止静默跳变**（现状 ProjectReviewNew 3s 轮询静默刷新） |
| 评分面板 | 分数用 `--score-*` 语义色 + `.tnum`；分项用 ✓ `--green-600` / △ `--amber-600` / ✗ `--red-600`；「引用 AI 评语」按钮把 AI 文本追加进教师评语输入框 |
| 键鼠 | 上一位/下一位绑定 `Alt+←/→`；题号方块改为 `<button>` 或 `role="tab"` + 方向键（现状为 `<div @click>`，键盘不可达） |

**适用**：teacher ReviewDetail（通用题逐题批改）、ProjectReviewNew（实训题工程包阅卷）。

### T4 · 作答页模板（ExamPage）—— 1 页（但最重要的学生页）

```
顶部信息条：考试名 · 倒计时（剩 14 小时 / 剩 08:32） · 保存状态 · [提交作业]
左侧题号导航（220px，可折叠）：进度环 + 题号网格（已答/未答/标记）
右侧作答区：题干卡 + 作答控件（单选/多选/填空/代码）+ 上一题/下一题
```

| 统一项 | 规范 |
|---|---|
| 倒计时 | 剩余 >24h 显示日期；<24h 显示 `HH:mm:ss`；最后 10 分钟转 `--red-600` 并 `aria-live="assertive"` 每 60s 播报 |
| 保存状态 | `role="status" aria-live="polite"`："草稿已同步 09:36" / "2 题未保存" |
| 题号方块 | 用 `button`，`aria-label="第 5 题，未作答"`，方向键切换 |
| 提交 | ConfirmDialog 明确写「提交后不可修改，共 6 题，已答 4 题」 |
| 移动/窄屏 | <1024 题号导航折叠为顶部横向滚动条；Monaco 在 <768 降级为只读 + 全屏编辑 |

**适用**：student Submit；student Assignments 的行点击改为「行内主按钮 + 整行可点（带键盘等价）」。

### T5 · 阅读 / 认证模板 —— 2 页

| 页面 | 规范 |
|---|---|
| `/login` | Auth 壳：左侧品牌面板（产品价值 3 条 + 部署信息）+ 右侧表单（最大宽 380px）；多学校二次选择用 Select 就地展开；错误提示 `role="alert"` |
| `/doc` | Reading 壳：sticky 顶栏 + 左侧锚点（<992 收为抽屉）+ 正文 760px；灯箱支持 Esc 关闭 + 焦点返回；6 处 `!important` 清理 |

---

## 2. 逐页规范表（26 页）

| # | 页面 | 模板 | 该页特有区块 | 主操作 | 密度 | 必须处理的现状问题 |
|---|---|---|---|---|---|---|
| 1 | `Login` | T5 | 多学校二次选择 | 登录 | comfortable | 双视图切换时的焦点管理；错误提示 `role="alert"` |
| 2 | `Doc` | T5 | 4 组 Steps、Anchor 双份 | 无 | comfortable | 灯箱 Esc/焦点、6 处 `!important` |
| 3 | `admin/Schools` | T1 | 仅只读列表 | 新增学校 | compact | 0 处令牌引用 → 全部换令牌 |
| 4 | `admin/Classes` | T1 | Modal 复用 + 并行拉选项 | 新增班级 | compact | 打开 Modal 时的加载态 |
| 5 | `admin/Teachers` | T1 | 自研多选 tag 输入、自删保护 | 新增教师 | compact | 多选输入的键盘可达 |
| 6 | `admin/Students` | T1 | 新增 Modal | 新增学生 | compact | 引用了不存在的 `--ink-base`（死令牌） |
| 7 | `admin/Monitor` | T1 + 自定义 | 深色日志区、30s 轮询开关 | 刷新 | compact | 日志区令牌化、轮询开关语义（`role="switch"`） |
| 8 | `admin/AiConfig` | 表单页（单栏） | 3 卡片 + 预估表 + change 即 PUT | 保存配置 | compact | 非 scoped 全局样式 `.concurrency-active-row` 必须 scoped；保存反馈 `aria-live` |
| 9 | `teacher/Classes` | T1 | 跨校迁移、多选团队 | 新建班级 | compact | 迁移确认文案写清影响范围 |
| 10 | `teacher/Students` | T1 | Excel 导入 + 结果报告、重置密码 | 导入学生 | compact | 12 处模板内联色；导入结果需 `aria-live`；27 处内联样式 |
| 11 | `teacher/Questions` | T1 | 类型/难度 tag、编辑分流两路由 | 新增题目 | compact | 0 处令牌引用；创建入口二选一（通用题/实训题）改为下拉菜单 |
| 12 | `teacher/Assignments` | T1 | 3 步向导 Modal、班级穿梭面板 | 布置作业 | compact | 向导步骤用 Steps + 键盘可达；`h()` 内联样式确认框改 ConfirmDialog |
| 13 | `teacher/QuestionEdit` | T2 | RichEditor×2 + CodeEditor + AI 解析 + 客观题 items | 保存并发布 | compact | 11 个 form-item 全无 label；45 处内联样式；129 处写死 px |
| 14 | `teacher/ProjectQuestionEdit` | T2 | Zip 上传 ×2、自建 Monaco、三 Modal、双角色 | 保存并发布 | compact | 52 处硬编码色；学生模式下隐藏教师专属区块 |
| 15 | `teacher/ReviewDetail` | T3 | 只读 Monaco、题号方块导航、逐题重评 | 发布成绩 | compact | 76 处硬编码色 + 291 行样式 + 4 处 `!important`；题号方块键盘不可达 |
| 16 | `teacher/ProjectReviewNew` | T3 | 双源文件树、多标签、可折叠评分面板 | 发布成绩 | compact | 0 处令牌引用；3s 轮询静默刷新；评分面板 header 是 `div` 点击 |
| 17 | `teacher/Review` | T1 | 表格内三行信息块、socket 刷新、导出 Excel | 去审核 | compact | 行内三行信息需稳定的信息层级（标题/元信息/状态） |
| 18 | `teacher/ReviewClass` | T1 | 行内改分、5 态筛选 + 排序持久化、socket | 批量发布 | compact | 行内改分需要校验与撤销；筛选状态写回 URL |
| 19 | `teacher/Teams` | T1 | 创建 Modal、身份分支 | 新建团队 | compact | 0 处令牌引用 |
| 20 | `teacher/TeamEdit` | T2（轻） | 2 个表格、防抖自动保存 ×2 | 保存 | compact | 取消选择拦截确认；自动保存节拍统一 |
| 21 | `student/Assignments` | T1（卡片变体） | 行点击进入、10s 定时器、四态筛选 | 继续作答 / 查看反馈 | comfortable | 行点击无键盘等价；卡片状态语义统一 |
| 22 | `student/Submit` | T4 | Monaco 懒挂载、草稿三通道、倒计时强交、2s 轮询 | 提交作业 | comfortable | 0 个 `<label>`；1526 行的 `calc(100vh-52px)` + 负边距布局在窄屏必然错位 |
| 23 | `student/Scores` | T1 | 只读成绩列表 | 查看反馈 | comfortable | 0 处令牌引用；分数用 `--score-*` + `.tnum` |
| 24 | `admin/Layout` `teacher/Layout` `student/Layout` | 壳 | 侧栏分组、用户菜单、折叠 | — | compact/comfortable | 三份重复实现 → 抽 `AppShell`；`resize` 监听器泄漏必须修；教师端 768px 段重复两遍 |

---

## 3. 需要新提取的共享组件（来自盘点 C 节）

| 新组件 | 替换的现状 | 覆盖页数 | 优先级 |
|---|---|---|---|
| `AppShell`（侧栏 + 顶栏 + 内容区） | 3 个 Layout 各自实现 | 3 个 Layout → 全部页面 | P0 |
| `PageShell` + `PageHeader` | 15 份逐字复制的 `.page/.page-header` CSS | 15 | P0 |
| `ListPage`（Toolbar + Table + Footer + 空态 + 骨架） | DataTable 直接使用 + 各页自拼 | 13 | P0 |
| `StatusTag` + `statusMap` | ~10 页各自的 statusColor/statusText | 10 | P0 |
| `ConfirmDialog` | `Modal.confirm` 11 处 + `a-popconfirm` 12 处 | 20 | P1 |
| `EmptyState` / `SkeletonTable` / `SpinnerDot` | 3 份 spinner + 8 处 a-empty（4 处纯文本态） | 12 | P1 |
| `DateText`（相对时间 + 绝对时间 title） | 各页自行格式化/不格式化 | 全部列表页 | P1 |
| `EditorShell` + `CodeViewer`（Monaco 外壳） | CodeEditor 3 页 + 2 页自建 Monaco | 5 | P2（先冻契约） |
| `WorkbenchLayout` + `FileTree` + `ScorePanel` + `QuestionNav` | 2 页各自复制 `.tab-bar/.sidebar` 与 `.n-*` | 2–3 | P2（先冻契约） |
| `useDraftAutosave` / `usePolling` / `useSocketRefresh` | 3 套草稿节拍 + 3 套轮询 + 2 份 socket 逻辑 | 8 | P2 |

---

## 4. 落地批次与验收口径

| 批次 | 内容 | 风险 | 验收 |
|---|---|---|---|
| **Wave 0 · 基础** | 引入 `tokens.css`；`App.vue` 的 ConfigProvider 改用统一主题对象（去掉 JS 硬编码 `colorPrimary`）；修字体栈；清死令牌 `--ink-base`；5 处非 scoped 样式收口；修 3 个 Layout 的 resize 泄漏 | 低 | 视觉零变化（截图逐页对比） |
| **Wave 1 · 列表页** | `AppShell` + `PageShell` + `ListPage` + `StatusTag` + `EmptyState`，覆盖 13 个列表页 | 低 | 每页：无硬编码色、无 `!important`、时间已格式化、空/载/错三态齐备、键盘可走完 |
| **Wave 2 · 表单与确认** | `FormPage` 模板 + `ConfirmDialog` + `useDraftAutosave`；先做 `QuestionEdit`→`ProjectQuestionEdit`→Modal 表单 | 中 | 所有 form-item 有 label；错误关联；危险动作二次确认文案含影响范围 |
| **Wave 3 · 工作台与作答** | `WorkbenchLayout`/`ScorePanel`/`QuestionNav`/`CodeViewer`；3 页（ReviewDetail、ProjectReviewNew、student/Submit） | 高（Monaco/TipTap 交互契约） | 交互契约冻结文档先评审；键盘全流程可完成批改与作答 |
| **Wave 4 · 收尾** | `Doc.vue`、`Login.vue`、深色模式、移动端断点补全、动效统一 | 中 | 768px 与 375px 走查通过；`prefers-reduced-motion` 生效 |

**每批统一验收命令**

```bash
# 1) 不应再有硬编码色值（白名单：Monaco 主题 / 图表色）
grep -rnE '#[0-9a-fA-F]{3,8}\b' client/src --include='*.vue' | grep -vE 'nodes/|monaco'
# 2) 不应再出现 !important（当前 23 处，目标 0）
grep -rn '!important' client/src --include='*.vue' --include='*.css'
# 3) 无障碍属性覆盖率（当前 31 个 .vue 中 0 个有 aria-*，目标：所有交互控件）
grep -rl 'aria-' client/src --include='*.vue' | wc -l
# 4) 断点覆盖（当前仅 4 个文件有 @media）
grep -rl '@media' client/src --include='*.vue' | wc -l
```
