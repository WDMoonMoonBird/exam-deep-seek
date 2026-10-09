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
| R-1 | ✅ **已完成（t13）**：`api/request.js` 提供静默开关；三端 Layout 的派生 axios 实例已删（15 行重复鉴权消失）；试点页 KPI 失败弹提示一并解决 | T2 契约边界限制 | **Wave 2 已完成** |
| R-2 | 顶栏容器与折叠按钮文字色未走令牌（沿用 antd 默认 `rgba(0,0,0,.88)`）——实测写成 `--text-primary` 反而与 legacy 产生偏差，故不强制 | T8 实测结论 | Wave 4 令牌纯度 |
| R-3 | 逐页 legacy（Chrome 69）像素级扫描：学生页内容区曾出现 1 字节截图差异（12 项计算样式一致 → 判定瞬态） | T8 顺带发现 | Wave 4（页面冻结后） |
| R-4 | 时间格式统一为 `YYYY-MM-DD HH:mm`（现为 `2026/8/24 19:01`）；`formatDateTime` 被 20+ 页使用，需一次性切换 | Wave 0 已知差异 | **Wave 4**（captain 决策：横切变更，避免与 Wave 2/3 每轮视觉验收叠加；且未迁移页仍是旧格式，先切会新旧混杂） |
| R-5 | P1-7（7 个列表接口服务端分页）到位后，切换 admin 4 页与 teacher classes/students/teams 的前端切片（代码中已标 `TODO(P1-7)`） | 后端未交付 | 依赖后端 |
| R-6 | 深色日志区（admin/Monitor）复用 `--bg-inverse`/`--text-inverse-muted`；评估是否新增 `--log-bg`/`--log-fg` 语义令牌 | T4 令牌缺口反馈 | Wave 2 未处理 → 顺延 Wave 3/4 |
| R-7 | ✅ **已完成（t13）**：`components/DataTable.vue` 已 `git rm`，引用 0 | captain 抽验发现 | **Wave 2 已完成** |
| R-8 | 令牌纯度残留：`teacher/Students.vue` 2 处 `font-size:48px`（装饰图标，**保留字面量**——无对应语义令牌，不为此扩令牌表） | T6 §8① | 已决（保留） |
| R-9 | ✅ **已完成（t13）**：ListPage 已支持每页条数切换（默认关闭）与单页隐藏分页栏；admin/Schools 页面内兜底 a-select 已回收 | T6 §7.2 / §8 | **Wave 2 已完成** |
| R-10 | ✅ **已完成（t13）**：ListPage 已加 `error` 插槽/prop（`role=alert` + 重试），未传入时行为与 Wave 1 一致 | T6 §8④ | **Wave 2 已完成** |
| R-11 | 剩余等值令牌字号：`RichEditor.vue` 6 处 + `ProjectZipUploader.vue` 6 处（未纳入任何 Wave 2 任务） | captain 全站扫描 | Wave 3/4 |
| R-12 | `useConfirm` 缺可选参数 `width` / `maskClosable` / `closable`：QuestionEdit 两处确认框因此丢失 `width:560`（分值表仍正常渲染，默认 520 与原 560 差异极小） | t14 声明 | Wave 3 或收尾（届时页面回收该设置） |
| R-13 | 字阶下沿缺口：`10px×2` 与 `11px×6` 无对应令牌（按规则保留字面量）；评估是否新增 `--fs-caption-sm` 之类 | t14 字号清单 | Wave 4 评估 |
| R-14 | Modal 宽度未收敛到设计三档（小 480 / 中 640 / 大 820）且存在字符串写法（\"720px\"/\"820px\"，设计稿明令禁止混写）：QuestionEdit 760/520、ProjectQuestionEdit 720px、ReviewDetail 820px、ProjectReviewNew 820px、teacher/Layout 420/1040（1040 为 AI 评分流程内容型弹窗，评估是否保留为例外） | captain 抽验 t14/t15 时发现 | Wave 3 一并收口（Wave 3 会动后两者） |
| R-15 | 对话框文案未全程动词化：6 处声明式 `a-modal` 的 `ok-text="确定"`（admin/Students:37、admin/Teachers:48、admin/Classes:43、teacher/Students:67、teacher/Classes:51、teacher/Teams:51）+ teacher/Classes:62「确定切换」+ QuestionEdit:66/135 两处 popconfirm `title="确定删除？" ok-text="确定"` | T16 §13①② | Wave 3 一并收口 |
| R-16 | **倒计时**：设计稿 05-page-specs T4 有、代码中不存在（仅到点强制提交 + 一句文案）→ 属**新增功能**，非本批范围 | t18 契约实测 / captain 复核 | 待用户裁决（captain 建议：记入本池，Wave 4 后再议） |
| R-17 | 工作台评分面板折叠后 `activeElement=BODY`（面板头不可聚焦、不抢焦点）——验收方判定为设计取舍 | t21 §9⑤ | Wave 4 a11y 收尾（captain 倾向接受现状：折叠本不该抢焦点） |
| R-18 | ✅ **已修复（t22，待 t23 独立验收）**：V3 beforeunload `fetch` 被同名加载器遮蔽（改 `window.fetch` + 加载器更名 `loadAssignment`）、V4 `clearDirty` 失败仍清脏（改 `allSaved` 才清）、V5 Monaco 懒挂载首帧竞态、S3 题号方块键盘不可达（`role=button`+`tabindex`+`aria-label`） | t18/t20/t21 实测 + captain 复核 | **已完成修复** |
| R-19 | **已知冗余但可靠**（captain 裁决不修）：① `onBeforeUnload` 无脏标记判断 → 有可存小题时即使无改动也重发幂等 keepalive PUT（若改用 dirtySet 做闸门，一旦脏跟踪有缺口会漏存，可靠性优先；将来优化应以「与载入快照比较」为准）② 首屏从 DB 载入答案触发一次冗余保存（watch 既有）③ Monaco 冷启动 `loader.init()` ≈27s → 后续断言窗口约定 ≥45s | t23 §6 | 登记（不修） |
| R-20 | **Modal 宽档例外条款（captain 定）**：三档 480/640/820 为主；**工作流/内容型弹窗允许第四档 1040**，但必须与 `styles/overrides.css` 的成对 teleport 规则共同维护（参考 `.assign-modal`）。`a-drawer` 宽度不受此约束。 | t24 抽验时发现（Assignments 向导 1040） | 已定（条款） |
