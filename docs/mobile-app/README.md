# Exam-DeepSeek 移动端设计 · 评审入口（README）

> 分支 `feat/mobile-app` ｜ 方法 skill `afrexai-ui-design-system` Phase 1–10 ｜ 阶段：**设计稿 + v1 零后端实现**
> 本分支交付「37 屏高保真移动端设计稿 + 12 篇正文文档 + SCREENS 施工契约」，并落地 **v1 零后端移动实现**（`client/src/mobile/**` 与受控入口改动；`server/**`、`prisma/**` 未动）。
> 独立评审 **84 / 100**（良好 · P0 = 0；4 条 P1 已在交付前修复），详情见 [qa-report.md](qa-report.md)。
> **范围决策（2026-10-17）**：v1 采用「零后端改造」；需要后端的 UI 暂时搁置、**不取消**（见 [09-v1-scope-and-deferred-backlog.md](09-v1-scope-and-deferred-backlog.md)）。
> 唯一施工契约：[preview/SCREENS.md](preview/SCREENS.md) ｜ 移动令牌层：[02-design-tokens.css](02-design-tokens.css) ｜ 桌面端参照：[docs/ui-redesign/](../ui-redesign/)

---

## 1. 这个分支交付了什么

| 交付物 | 内容 | 状态 |
|---|---|---|
| [preview/index.html](preview/index.html) | 设计总览 Gallery：总览 / 设计系统 / 交互原型 / 37 屏 / 平台策略 / 信息架构 / 验收 / 文档 | ✅ |
| [preview/screens/](preview/screens/) | 37 屏高保真 HTML（390×844，真实中文内容，浅/深色 + iOS/Android） | ✅ |
| [preview/shots/](preview/shots/) | 逐屏截图（2× DPR，Playwright 生成） | ✅ |
| [preview/assets/](preview/assets/) | Mobile Screen Kit：`screen.css`（组件库）+ `screen.js`（状态栏/Tab/Sheet/Toast/二维码）+ `screens.js`（屏幕注册表） | ✅ |
| [preview/tools/shot.mjs](preview/tools/shot.mjs) | 逐屏截图工具（浅色 iOS 默认；支持 `--theme=dark` / `--platform=android`） | ✅ |
| 12 篇设计文档 | 见 §4 文档索引 | ✅ |
| **v1 移动实现** | client/src/mobile/**：31 路由 / 34 实体屏（/m 与 /m/doc 复用桌面响应式页）、零后端、管理端后置；验收见 [tests/mobile-v1/REPORT.md](../tests/mobile-v1/REPORT.md) | ✅ 已实现 |

> 设计稿为 v1 视觉基线；v1 实现见 `client/src/mobile/**`（管理端 3 屏延期未实现，D12 不取消）。37 屏的契约与 id 以 [preview/SCREENS.md](preview/SCREENS.md) 为准。

---

## 2. 怎么评审（3 步）

1. **看总览**：在仓库根启动静态服务（预览要跨目录引用 `client/src/styles/tokens.css`，不要用 `file://` 直接开）：
   ```bash
   python3 -m http.server 8123 --bind 127.0.0.1
   # 打开 http://127.0.0.1:8123/docs/mobile-app/preview/index.html
   ```
   （Gallery 为桌面评审工具，建议 ≥1280 宽浏览；顶部可切 **浅色/深色** 与 **iOS/Android 设备框**；「全部页面」区点缩略图在手机框里直接点按（`data-goto` 全链路可跳转）。
2. **逐屏看（含深色/Android）**：进「全部页面」或直接开 `preview/screens/<id>.html?theme=dark&platform=android`；截图对照 `preview/shots/`。重新出图：
   ```bash
   node docs/mobile-app/preview/tools/shot.mjs student-home docs/mobile-app/preview/shots/student-home.png
   node docs/mobile-app/preview/tools/shot.mjs teacher-review-queue --theme=dark
   ```
3. **对契约验收**：按 [SCREENS.md](preview/SCREENS.md) §6 逐项打勾（无控制台报错、无横向滚动、触控 ≥44px、浅/深色对比度、演示数据跨屏一致）；文档与屏幕的对应关系见 [05-page-specs.md](05-page-specs.md)。

---

## 3. 37 屏清单（按分组）

**公共与认证（6）**：`public-landing` 移动官网 · `public-login` 登录 · `public-doc` 使用文档 · `error-404` 404 · `error-403` 403 · `error-500` 500

**学生端（11）**：`student-home` 首页（Tab1）· `student-assignments` 作业列表（Tab2）· `student-assignment-detail` 作业详情 · `student-answer-objective` 作答·客观题 · `student-answer-code` 作答·编程题 · `student-answer-sheet` 答题卡（Sheet）· `student-submit-confirm` 交卷确认（Sheet）· `student-assignment-done` 已提交详情 · `student-scores` 成绩列表（Tab3）· `student-score-detail` 成绩详情 · `student-profile` 我的（Tab4）

**教师端（14）**：`teacher-home` 工作台（Tab1）· `teacher-assignments` 作业列表（Tab2）· `teacher-assignment-detail` 作业详情 · `teacher-review-queue` 评分审核（Tab3）· `teacher-review-detail` 审核详情·评分 · `teacher-review-code` 代码只读+选区 · `teacher-review-diff` 代码差异 · `teacher-batch-select` 批量审核·多选 · `teacher-batch-confirm` 批量审核·确认 · `teacher-assign-wizard` 布置作业·4 步 · `teacher-questions` 题库 · `teacher-class` 班级详情 · `teacher-profile` 我的（Tab4）· `teacher-code-unsupported` 手机编辑说明

**管理端（3）**：`admin-home` 管理概览 · `admin-directory` 组织目录 · `admin-monitor` 实时监控

**平台与状态（3）**：`platform-install` PWA 安装引导 · `platform-splash` Android 启动屏 · `states-overview` 状态体系

> 导航归属与层级见 [01-information-architecture.md](01-information-architecture.md) §3；每屏的布局/字段/交互验收见 [05-page-specs.md](05-page-specs.md)。

---

## 4. 文档索引

| 文档 | 内容 | 对应 Phase |
|---|---|---|
| [00-design-brief.md](00-design-brief.md) | 设计简报：用户/场景/目标/现状证据/约束/三类端（Web·Android·iOS）/非目标 | 1 |
| [01-information-architecture.md](01-information-architecture.md) | 四类角色导航、三套 TabBar、37 屏地图、关键流程、桌面映射、状态与内容优先级 | 2 |
| [02-design-tokens.css](02-design-tokens.css) + [02-design-tokens.md](02-design-tokens.md) | 移动令牌层 `--m-*`（安全区/触控/骨架/字号/动效）+ 与桌面令牌关系与用法 | 3 / 10 |
| [03-components.md](03-components.md) | 组件规范：AppBar/TabBar/卡片/表单/评分/Sheet/代码/Diff/状态 + 屏幕→组件矩阵 | 4 |
| [04-interaction-a11y.md](04-interaction-a11y.md) | 手势、动效、安全区、键盘、四态、WCAG AA 清单 | 5 / 6 / 7 |
| [05-page-specs.md](05-page-specs.md) | 37 屏逐屏 handoff 规范（布局/字段/状态/验收） | 9 |
| [06-platform-strategy.md](06-platform-strategy.md) | Web 移动端 / PWA / Android（Capacitor）/ iOS（只规划）策略 | 8 |
| [07-implementation-plan.md](07-implementation-plan.md) | `/m` 路由架构、文件清单、屏幕→Vue 映射、人日、测试矩阵、风险 | 10 |
| [08-backend-gap-and-ui-trim.md](08-backend-gap-and-ui-trim.md) | **后端接口对账 + 零后端改造 UI 裁剪建议**（现有接口可支撑范围、难接口、砍/降级清单） | 交付/后端 |
| [09-v1-scope-and-deferred-backlog.md](09-v1-scope-and-deferred-backlog.md) | **v1 范围冻结 + 延期清单（不取消）**：零后端 v1、D1–D13 backlog、功能开关与解除条件 | 交付/后端 |
| [10-v1-implementation-contract.md](10-v1-implementation-contract.md) | **v1 实现契约**：路由表、共享组件 API、API 白名单、数据铁律、页面 Agent 分工 | 交付/实现 |
| [qa-report.md](qa-report.md) | 独立设计评审（八维 rubric 打分 + 逐屏问题清单） | 8 |
| [preview/SCREENS.md](preview/SCREENS.md) | 37 屏契约 + 共享演示数据 + 禁止事项 | 9 |

---

## 5. 核心决策（评审重点看这 7 条）

| # | 决策 | 依据 | 影响 |
|---|---|---|---|
| 1 | **按场景重排，不缩放桌面**：表格→卡片、侧栏 6 项→底部 4 Tab、居中弹窗→底部 Sheet/分步表单 | 13 处 `a-table`、评分审核 5 列固定宽 1040px、手机 390px 无横向滚动空间（见 00 §2） | 37 屏全部重新布局，不是响应式断点微调 |
| 2 | **卡片只保留「能决策」的 4 个字段**，其余进详情 | 教师列表在手机上首要任务是「判断要不要点进去」 | 作业卡 = 标题 / 状态 / 进度 / 截止 |
| 3 | **审核从「列表点详情」改为「逐份队列」**，审完自动下一份 | 教师碎片场景是「审一两份」；桌面左右分栏在手机上不可用 | `teacher-review-queue` 为 Tab 3，底部固定双动作 |
| 4 | **手机不写代码**：只读 + 二维码/链接接力到电脑 | 软键盘/无补全/误触；Monaco 不迁移 | 学生编程题、教师编辑标准题均给接力卡（新增能力） |
| 5 | **不可撤销动作前置风险**：发布/批量必须展示影响范围 + 二次确认，不做撤销 | 真实批量接口（班级级 batch-review/batch-publish）无回滚 | `teacher-batch-confirm` 的「先看风险 / 确认发布」 |
| 6 | **管理员只读**：概览/目录/监控只读，高风险配置（AI 配置、增删改、导入）引导电脑 | 手机误触成本高；桌面才有完整表格与配置 | `admin-*` 3 屏；引导文案与只读提示 |
| 7 | **令牌单一来源 + 分级回退**：桌面 `tokens.css` + 移动 `--m-*` 层；≥768px 或细指针回退桌面视图；Android 优先，iOS 仅规划 | 与桌面端共用视觉语言；避免两套设计系统 | 移动组件只用 `--m-*` 与语义令牌；不做手机端 iPad 布局 |

---

## 6. 与桌面端的关系

| 维度 | 桌面端（`docs/ui-redesign/`，已落地重构） | 移动端（本分支，设计稿） |
|---|---|---|
| 视觉语言 | 品牌蓝 `#0066cc`、冷灰中性色、16px 卡片圆角、克制阴影 | **相同**：直接复用 `client/src/styles/tokens.css` 的颜色/字体/语义色 |
| 尺寸与骨架 | 侧栏 232px + 顶栏 56px + 表格密集 | 底部 Tab + AppBar 52px + 卡片；安全区与 44px 触控 |
| IA | 教师 6 项 / 学生 2 项 / 管理员 7 项侧栏菜单 | 底部 3–4 Tab + 二级页 + 引导电脑（映射见 01 §5） |
| 组件 | ant-design-vue + ConfigProvider 主题 | 设计稿用 Mobile Screen Kit；实施拟 Vant 4 按需 + `components/m/*` |
| 代码 | `client/src/views/**` 不动 | 只新增 `/m/*` 路由区与移动组件（待实施） |
| 能力边界 | 全部功能 | 手机只做高频链路；编辑/配置/批量管理引导电脑 |

> 结论：移动端是桌面端的**互补值班台**，不是替代品；桌面端文档与移动端文档互不覆盖、可并行维护。

---

## 7. 下一步（待确认，不擅自扩范围）

| # | 待确认项 | 说明 / 影响 |
|---|---|---|
| 1 | **视觉方向是否通过** | 评审 `preview/index.html` + 37 屏；通过后进入实施（M0 起，见 07） |
| 2 | **缺页判定**：学生实训题工程包提交（真实路由存在，37 屏未覆盖） | 补 1 屏或并入作业详情状态（00 §9-1） |
| 3 | **缺页判定**：教师实训题审核（工程包，真实路由存在） | 是否单列，或复用 `teacher-review-code` 的文件树头部（00 §9-2） |
| 4 | **批量语义**：真实接口为班级级，设计稿为「筛选命中 N 份」 | 一期按班级批量，或后端新增按筛选批量（01 §9-4） |
| 5 | **新增能力范围**：diff / 答题卡 / 逐份队列 / 二维码接力 / 催交 | 均非桌面现状，需确认哪些进一期；催交还需通知能力 |
| 6 | **管理员 KPI 数据源** | 桌面无 dashboard；在线/队列/平均响应无现成接口（01 §9-6） |
| 7 | **≥768 回退口径** | 仅宽度，还是宽度 + `pointer: coarse`（建议后者，沿用 mobile-plan） |
| 8 | **设置项范围**：记住我 / 字号三档 / Android 壳排期 / iOS 后续 | 决定 M1 范围与 06/07 排期 |
