# 全站 UI 重设计 · 设计稿（feat/ui-redesign）

> 分支 `feat/ui-redesign` ｜ worktree：`Exam-DeepSeek-ui/`（隔离自 `feat/open-project` 工作区）
> 方法论：skill `afrexai-ui-design-system`（Phase 1–10）
> 阶段：设计稿完成 → **已进入落地**：Wave 0 基础设施 + 教师端「作业管理」试点页已实现并通过真实运行验证（见 [08-wave0-pilot-log.md](./08-wave0-pilot-log.md)）

## 怎么评审

1. **先看视觉**：浏览器打开 `preview/index.html` —— 五个页签（设计总览 / 登录页 / 教师端 / 审核工作台 / 学生端），右上角可切 **浅色/深色** 与 **紧凑/舒适** 密度。
   - 静态截图在 `preview/shots/`（含 `teacher-dark.png` 深色版）。
2. **再看规则**：`02-design-tokens.css`（令牌本体）→ `02-design-tokens.md`（antd 映射与验收命令）。
3. **最后看落地**：`05-page-specs.md`（26 页逐页规范 + 4 个落地批次）。

## 文件清单

| 文件 | 内容 | skill 阶段 |
|---|---|---|
| [README.md](./README.md) | 本文件：评审入口 | — |
| [00-design-brief.md](./00-design-brief.md) | 设计简报 + 盘点实测证据（15 份重复外壳、49 处主色分裂、0 个 aria-*…） | Phase 1 |
| [01-information-architecture.md](./01-information-architecture.md) | 四种布局壳、导航分组、26 页地图、关键流程、IA 改动清单 | Phase 2 |
| [02-design-tokens.css](./02-design-tokens.css) | **设计令牌本体**（三层：primitive → semantic → component；浅/深色 + 两档密度） | Phase 3 / 10 |
| [02-design-tokens.md](./02-design-tokens.md) | 令牌说明、antd ConfigProvider 映射表、Chrome 69 兜底、验收命令 | Phase 3 / 10 |
| [03-components.md](./03-components.md) | 组件规范（基础 / 数据 / 容器导航 / 反馈 / 业务专用） | Phase 4 |
| [04-interaction-a11y.md](./04-interaction-a11y.md) | 断点与响应式、动效、四态反馈、WCAG AA 清单、Chrome 69 兼容 | Phase 5 / 6 / 7 |
| [05-page-specs.md](./05-page-specs.md) | 5 个页面模板 + 26 页逐页规范 + 组件提取清单 + 落地批次 | Phase 9 |
| [preview/index.html](./preview/index.html) | 高保真静态预览（5 屏，可切主题与密度） | Phase 9 |
| [preview/shots/](./preview/shots) | 预览截图（1440×900） | — |
| [08-wave0-pilot-log.md](./08-wave0-pilot-log.md) | **Wave 0 + 试点页实施记录**：改了什么/为什么/验证证据/**后端待办（含新发现 N-1~N-3）** | 实施 |
| [07-api-batch1-verify.md](./07-api-batch1-verify.md) | **Batch 1 后端交付独立验收**：P0 逐条核验、复跑测试、行为变更影响面、待处理 3 项 | 验收 |
| [06-api-gap.md](./06-api-gap.md) | **设计稿 ↔ 后端接口对账**：P0/P1/P2 接口清单（可直接交后端团队）+ 前端自算清单 + 示意数据待确认项 | 交付/对接 |
| [_inventory-pages.md](./_inventory-pages.md) | 前端盘点原始报告：31 个 .vue 逐页现状、横切模式、问题证据、复杂度排行 | 输入 |
| [_api-inventory.md](./_api-inventory.md) | 后端接口盘点原始报告：94 个接口逐条（方法/路径/权限/字段/证据行号） | 输入 |

## 核心决策（5 条）

1. **不换组件库**：保留 ant-design-vue 4，用「设计令牌 + ConfigProvider 主题 + 少量覆盖」统一视觉，改造可分批、可回滚。
2. **令牌只有一份**：三层令牌写进 `tokens.css`，antd 主题从 CSS 读值，避免"JS 一套 + CSS 一套"（现状 `App.vue` 就存在两套真相）。
3. **先模板后页面**：26 页收敛为 5 个模板；新增 `AppShell / PageShell / ListPage / StatusTag / WorkbenchLayout / ScorePanel` 等共享组件，消灭 15 份重复外壳。
4. **密度分档**：教师端/管理端 `compact`，学生端/文档 `comfortable`，同一套令牌两个档位。
5. **风险后置**：Monaco/TipTap 相关的 3 页（Submit / ReviewDetail / ProjectReviewNew，合计 2800 行）放到 Wave 3，先冻结交互契约再动。

## 接口依赖（重要）

新 UI 的数据需求已逐页对账，见 [06-api-gap.md](./06-api-gap.md)：

- **P0（阻塞新 UI 三个核心变化）**：① 教师待审核总数接口（侧栏徽标 + KPI）② 作业列表补「应交人数」（提交进度分母）③ 学生作业列表补 `submittedAt`/`answeredCount`/`finalScore`（状态贯通）。
- **P1/P2**：KPI 聚合、队列上一条/下一条、客观题分项结构化、7 个列表服务端分页、实训题评分推送等。
- **不依赖任何新接口**：Wave 0–2（令牌基础、13 个列表页、表单与确认）可以先做。

## 落地进度

| 批次 | 内容 | 状态 |
|---|---|---|
| 前置 | rebase 到 master（`152ec99`） | ✅ 已完成 |
| **Wave 0** | 令牌 + antd 主题桥 + 全局覆盖层（视觉零变化） | ✅ 已完成 |
| **试点页** | 教师端「作业管理」（KPI / 服务端筛选 / 真实进度 / 状态语义） | ✅ 已完成，真实运行验证通过 |
| Wave 1 | AppShell + PageShell + ListPage，迁移 13 个列表页；侧栏分组与待审核徽标；切全局尺度（14px / 圆角 12） | 🔄 进行中（团队 `ui-wave1`；契约见 [09-wave1-brief.md](./09-wave1-brief.md)；T1/T2/T3/T5/T7/T8/T9 已抽验通过，剩 T4 管理端 5 页 + T6 独立验收） |
| Wave 2 | 表单页模板 + ConfirmDialog + 自动保存统一 | ⏳ |
| Wave 3 | 工作台/作答页（Monaco 三页，先冻交互契约） | ⏳ |
| Wave 4 | Doc/Login、深色模式、移动端断点收尾 | ⏳ |

**验收方式**：`cd Exam-DeepSeek-ui/client && npm run dev` → 打开 http://localhost:5174/exam/ 用教师账号进入「作业管理」；5173 是同机的旧 UI，可直接对比。

## 收口池（captain 维护 · 已知但**有意暂缓**的项）

> 这些是各任务执行中暴露、但**不属于当前批次**的问题。集中记在这里，避免散落在各成员的 output 里被遗忘。

| # | 项 | 来源 | 归属 |
|---|---|---|---|
| R-1 | `api/request.js` 提供 `silent` 选项，替换 Layout 中派生的 axios 实例（约 15 行重复鉴权逻辑）；同时解决试点页 KPI 请求失败仍弹提示的问题 | T2 契约边界限制 | Wave 2 |
| R-2 | 顶栏容器与折叠按钮的文字色未走令牌（沿用 antd 默认 `rgba(0,0,0,.88)`）——实测写成 `--text-primary` 反而会与 legacy 产生偏差，故暂不强制 | T8 实测结论 | Wave 4 令牌纯度 |
| R-3 | 逐页 legacy（Chrome 69）像素级扫描：学生页内容区曾出现 1 字节截图差异（12 项计算样式一致 → 判定瞬态） | T8 顺带发现 | Wave 4（页面冻结后） |
| R-4 | 时间格式统一为 `YYYY-MM-DD HH:mm`（现为 `2026/8/24 19:01`）；`formatDateTime` 被 20+ 页使用，需一次性切换 | Wave 0 已知差异 | **Wave 4**（captain 决策：横切变更，避免与 Wave 2/3 每轮视觉验收叠加；且未迁移页仍是旧格式，先切会新旧混杂） |
| R-8 | 令牌纯度残留：`teacher/Students.vue` 2 处 `font-size:48px`（装饰图标，**保留字面量**——无对应语义令牌，不为此扩令牌表）；12/14px 两处已并入 T11 | T6 §8① | 已决（部分收尾） |
| R-9 | ListPage 两处能力缺口：① 单页时仍显示分页栏（改前 DataTable 会整栏隐藏）② 组件无每页条数切换（Schools 目前用页面内 a-select 兜底） | T6 §7.2 / §8 | Wave 2 |
| R-10 | 页面级「错态」：列表请求失败仍靠全局 message 提示；建议 ListPage 增加 `error` 插槽 + 与 R-1 同批做（同属请求与反馈层） | T6 §8④ | Wave 2（与 R-1 同批） |
| R-5 | P1-7（7 个列表接口服务端分页）到位后，切换 admin 4 页与 teacher classes/students/teams 的前端切片（代码中已标 `TODO(P1-7)`） | 后端未交付 | 依赖后端 |
| R-6 | 深色日志区（admin/Monitor）复用 `--bg-inverse`/`--text-inverse-muted`；评估是否新增 `--log-bg`/`--log-fg` 语义令牌 | T4 令牌缺口反馈 | Wave 2 评估 |
| R-7 | **删除 `components/DataTable.vue`（323 行死代码）**：13 个列表页全部迁移到 ListPage 后，全仓 0 引用（用 grep 在 client/src 的 .vue 里检索无结果）。删除前再跑一次引用检查 | captain 抽验时发现 | Wave 2 清理 |
