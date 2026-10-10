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

---

## Wave 4 收口后的收口池状态（captain 更新 · t28 验收后）

### 已完成（可关闭）
| # | 项 | 完成于 |
|---|---|---|
| R-1 | 请求静默开关 + 三端 Layout 统一入口 | t13 |
| R-2 | 顶栏令牌化——**以实施落地**：legacy 下 antd 规则 0-3-0 反超 scoped 0-2-0，故在 style.css 用 0-3-1 兜住，三端×两模式计算值 MATCH | t25 |
| R-4 | 时间格式统一 `YYYY-MM-DD HH:mm` / `YYYY-MM-DD`（+ `formatDateTimeSec` 保秒级精度）；两处页面本地实现消除 | t27 + t29 |
| R-6 | 代码/日志面语义令牌 `--code-bg`/`--code-fg`（两主题恒定深色），日志区与富文本代码块采用 | t26 + t30（captain 加令牌） |
| R-7 | 删除 DataTable.vue 死代码 | t13 |
| R-9 | ListPage 每页条数切换 + 单页隐藏分页栏 | t13 |
| R-10 | ListPage error 插槽（role=alert + 重试） | t13 |
| R-11 | RichEditor 6 + ProjectZipUploader 4 处等值字号令牌化 | t26 |
| R-12 | useConfirm 增可选 width/maskClosable/closable（不传不写配置） | t24 |
| R-13 | **已决：不新增令牌**（字阶下沿 12px，10/11px 属历史微标签，按 off-scale 登记） | captain |
| R-14 | Modal 宽度收敛 480/640/820 + 消除字符串写法（例外：R-20 第四档 1040） | t24 + t25 |
| R-15 | 对话框文案动词化（含 3 处自定义 footer、popconfirm 补 danger） | t24 |
| R-18 | 作答页四条链路修复（V3 keepalive / V4 兜底重试 / V5 懒挂载 / S3 键盘可达） | t22 |

### 新增（t28 三类整体复核发现）
| # | 项 | severity | 说明 |
|---|---|---|---|
| R-21 | **暗色模式尚不可用（能力缺口）** | high | 令牌层已支持（浅/暗两套 + `--code-*` 恒定深色），但① 全仓**无 `data-theme` 入口**（无开关/无持久化）② antd 组件与富文本正文未适配（表格/编辑器正文 `rgba(0,0,0,.88)` 落在深底上，**对比度 1.19**）。建议作为 **Wave 5 头号项**：入口 + antd 暗色算法 + 富文本/表格适配 + 全站复核 |
| R-22 | Doc 灯箱缺 Esc 关闭与焦点返回（05-page-specs #22 明文要求） | medium | 键盘用户无法关闭灯箱且焦点丢失 |
| R-23 | 1024 宽表横向溢出传导到 `.content`（实测 417/187/57px）；设计 M 档「隐藏 P2 列」未落地 | medium | 768 全 0 溢出 ✓，仅 1024 档有问题 |

### 仍待外部条件
| # | 项 | 阻塞于 |
|---|---|---|
| R-5 | 7 个列表接口服务端分页（前端已留 `TODO(P1-7)` 与前端切片） | 后端 |
| R-16 | 倒计时（设计稿有、代码无，属新增功能） | 用户裁决 |
| R-17 | 面板折叠后 `activeElement=BODY` | Wave 5 a11y 收尾 |
| R-19 | 卸载路径冗余幂等 PUT（裁决不修：可靠性优先） | 已结案 |
| R-20 | Modal 第四档 1040 例外条款（成对维护，已写入代码注释） | 条款 |

### 台账更正（captain 自身错误，留痕）
1. Modal 宽度原值「560」在本仓库 git 历史中不存在（t24 考证）→ 实际现为 640
2. `--bg-inverse` 在暗色下**不翻转**（tokens.css:384 起组件级修正块后写生效）——t26 的诊断被否证，t28 实测确认
3. `style.css` 真实路径为 `client/src/style.css`（契约写成 `styles/style.css`，**第 5 次路径笔误**）→ 规则加强：写路径前 `ls`；**grep 空输出必须先排除「路径不存在」**

### Wave 5 追加（动画与过渡）
| # | 项 | 来源 | 归属 |
|---|---|---|---|
| R-25 | 页面内**既有**写死过渡时长未令牌化（ReviewDetail 6 处：`.15s`/`.2s`/`.25s`/`.3s ease` 等，含 `.collapse-enter-active`、`.material-arrow`）。t42 新增的过渡已全部走 `--duration-*`；这些是改前既有。注意：reduced-motion 降级对它们仍生效（tokens.css 对 `*` 的强制规则），故非功能缺陷，属令牌纯度 | t42 抽验时 captain 发现并核证（本次 diff 0 命中） | Wave 6 / 收口池 |
| R-26 | 折叠控件形态不一致：ReviewDetail 用原生 `<button>`（语义最佳），ProjectReviewNew 用 `role=button + tabindex=0` + 手写 Enter/Space。建议统一为原生 `<button>`（省掉手写键盘处理） | t42 报告对比发现 | Wave 6 / 收口池 |

---

## 台账更正（Batch 2 · captain 自查，依据 QA 报告 T1-F1..F4）

> QA 指出我的收口池登记不完整。我重扫后确认**三处登记不全 + 一处口径不严**，现更正如下（命令可复算）。

### 更正 1：R-25 的数字严重偏小

| 项 | 原登记 | 实际（重扫） |
|---|---|---|
| 写死的过渡/动画时长 | 「ReviewDetail 6 处」 | **42 处**（QuestionEdit 16 / ReviewDetail 6 / ProjectReviewNew 5 / ProjectQuestionEdit 5 / ProjectZipUploader 3 / Doc 2 / style.css 2 / Submit 1） |

复算命令：
```bash
grep -rE '(transition|animation)[^:;]*:[^;]*[0-9]+(ms|s)\b' client/src --include='*.vue' --include='*.css' | grep -v 'var(--duration' | wc -l
# → 42（QA 报 33，差异应在是否计入 animation 与 !important 写法；两者都远大于我原登记的 6）
```

### 更正 2：R-28（新）—— 我的「hex=0」漏掉了 rgb/rgba 字面量

| 判据 | 结果 |
|---|---|
| `.vue` 内 `rgb()/rgba()` 字面量 | **7 处**（`Doc.vue` 6 + `RichEditor.vue` 1） |
| 具名颜色（white/black/red…） | 0 |
| `hsl()/hsla()` | 见复算输出 |
| 3 位 / 8 位 hex 简写 | 见复算输出 |

→ **口径更正**：硬编码色值的判据 = hex（6 位）**+ rgb/rgba + 具名色 + hsl + hex 简写**。此前只报 hex=0，属**口径不严**（结论方向不变：主要债已清，但残留需如实登记）。

复算命令：
```bash
grep -rE 'rgba?\(' client/src --include='*.vue' | wc -l        # → 7
grep -rE '(color|background|border)[^:]*: *(white|black|red|blue|green|gray|grey|orange|yellow|purple)\b' client/src --include='*.vue' | wc -l  # → 0
```

### 更正 3：R-29（新）—— 零引用的时长令牌

`--duration-instant` **0 引用**、`--duration-page` **0 引用**（`--duration-fast` 1、`--duration-slow` 1、`--duration-base` 11）→ 要么删除这两个令牌，要么在 Batch 3 补齐用法。

### 更正 4：R-30（新）—— 字号字面量的完整清单

| 项 | 数量 |
|---|---|
| `.vue` 内 `font-size: Npx` 总数 | **56** |
| 其中 ≤11px（off-scale 下沿） | **18**（我此前只登记 8 处 → 漏 10 处） |
| 其中 12–32px 字面量 | **32**（需逐条核对是否有等值令牌可换） |

复算命令：
```bash
grep -rE 'font-size: *[0-9]+px' client/src --include='*.vue' | wc -l      # → 56
grep -rE 'font-size: *(9|10|11)px' client/src --include='*.vue' | wc -l   # → 18
```

### 我为什么会漏（根因留痕）

1. **判据写得比事实窄**：把「硬编码色值」等同于「6 位 hex」，于是 rgba 与简写天然漏检；
2. **抽样代替全量**：R-25 只统计了我当时正在看的那一个文件（ReviewDetail），却写成了全局结论；
3. **登记时未复算**：off-scale 清单是人工列举而非脚本输出，遗漏 10 处。

→ 已固化为规则：**任何写进台账的数字必须附一条可复算命令；凡声称「全部/为零」，必须给出判据的完整定义**。