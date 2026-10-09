# Exam-DeepSeek 全站 UI 重设计 · 设计简报（Design Brief）

> 分支 `feat/ui-redesign`（独立 worktree：`Exam-DeepSeek-ui`）· 方法论：skill `afrexai-ui-design-system` Phase 1–10
> 阶段：**设计稿先行** —— 本阶段不修改 `client/` 任何 Vue/CSS 代码。

## 0. 一句话目标

把一套「流程能跑通的管理台」升级为「视觉语言统一、数据密度受控、教师高频操作更省力、状态反馈完整」的教学评测产品。

---

## 1. 设计简报（结构化）

```yaml
design_brief:
  project: "Exam-DeepSeek / Deadpan 判题"
  type: "saas_product"           # 多角色教育管理台（超管/教师/学生）+ 1 个公开文档站
  target_users:
    primary: "高校计算机教师（建题、布置作业、审核 AI 评分、管班级学生）"
    secondary: "学生（看作业、写代码/传工程包、看成绩）"
    tertiary: "超管 / 学校管理员（学校、班级、教师、学生、AI 配置、监控）"
    technical_level: "advanced（教师为计算机专业教师）| novice（部分学生）"
    age_range: "18–55"
    context: "教师多在办公室桌面端长时间批量操作；学生在机房/宿舍，Windows 居多"
    devices: "desktop_first（教师/超管）· responsive_equal（学生）"
  goals:
    business: "让 AI 评分链路可被信任与高效审核；降低教师单次作业的审核耗时"
    user: "教师：一屏内看清待办与风险；学生：3 步内完成提交并看懂反馈"
    success_metric:
      - "教师「布置作业 → 审核完成」主流程点击次数下降 ≥ 20%"
      - "列表页首屏即可读（时间/分数/状态无需二次点击或解码）"
      - "设计令牌覆盖率 ≥ 90%（组件内无硬编码色值/圆角/阴影）"
      - "WCAG 2.1 AA：正文对比度 ≥ 4.5:1，交互元素键盘可达"
  brand:
    personality: "专业、克制、可信；有工程感但不冷硬"
    existing_guidelines: "yes —— client/src/style.css 已有 Apple-Inspired 令牌（111 行：--blue/--canvas/--ink/hairline/radius）"
    competitors: ["学习通", "超星/雨课堂", "GitHub Classroom", "Linear（交互密度参考）"]
  constraints:
    tech_stack: "Vue 3.5 + Vite 8 + ant-design-vue 4.2 + Pinia + Vue Router + Monaco + TipTap"
    component_library: "保留 ant-design-vue，用『设计令牌 + ConfigProvider 主题 + 局部覆盖』统一视觉，不推翻组件库"
    browser_support: "现代浏览器为基准，须兼容 Chrome 69 兜底（仓库存在 feat/chrome69-legacy-adaptation 分支）"
    accessibility: "WCAG_AA"
    must_support: ["中文（唯一语言）", "表格密集数据", "代码/富文本编辑器", "WebSocket 实时刷新", "深色侧栏"]
    deploy: "自部署，nginx 前缀 /exam/，路由 base=/exam/"
  scope:
    pages: "31 个 .vue（26 个视图含 3 个 Layout + 4 个共享组件 + App.vue），共 10040 行；33 条路由记录（含 3 个 Layout 容器与 1 条通配）"
    phase_now: "设计稿先行（简报 / IA / 令牌 / 组件规范 / 高保真预览）"
    phase_next: "评审通过后落地 Vue 代码"
```

---

## 2. 页面与用户分布（现状）

| 入口 | 路由前缀 | 页面数 | 角色 | 典型使用频率 |
|---|---|---|---|---|
| 登录 | `/login` | 1 | 全部 | 每日 1 次 |
| 使用文档 | `/doc` | 1 | 公开 | 低频、查阅式 |
| 管理端 | `/admin/*` | 6 | super_admin | 低频、配置式 |
| 教师端 | `/teacher/*` | 13（含 3 个编辑/审核子页） | teacher | **最高频、最长停留** |
| 学生端 | `/student/*` | 4 | student | 中频、路径单一 |

**结论：设计投入按此比例分配 —— 教师端 60%、学生端 20%、管理端 10%、登录与文档 10%。**

---

## 3. 现状证据（决定了要解决什么）

来自当前截图与代码盘点（`docs/screenshots/`、`docs/images/`、`_inventory-pages.md`）：

1. **原始数据直接上屏**：题库列表「创建时间」显示 `2026-06-01T17:02:35.065Z`（ISO 字符串未格式化）。
2. **antd 默认样式裸露**：表格全边框 + 居中表头 + 默认分页器，与已有的 Apple 风令牌（黑侧栏、`--radius-md`）不在同一套语言里。
3. **一屏信息量失衡**：教师端列表页大片留白；审核页却是三栏 + Monaco + 评分面板的高密度作业区，两者没有承接关系。
4. **缺少三态与空态**：列表/审核页没有骨架屏、空状态插画或错误重试的统一样式。
5. **令牌只覆盖了颜色与圆角**：字体、字号、间距、阴影、动效、层级（z-index）、密度均无令牌，页面各写各的。
6. **跨平台字体风险**：`--font-display: 'SF Pro Display'` 在 Windows（学生机房主要环境）不存在，实际回落到系统默认，字重与行高失控。

### 3.1 盘点实测数据（`_inventory-pages.md`）

| 指标 | 实测 | 含义 |
|---|---|---|
| 页面外壳 CSS 重复 | **15 份逐字复制** | 缺共享 `PageShell` 组件 |
| 引用 0 个设计令牌的文件 | **12 / 31** | 令牌体系存在断层 |
| 主色分裂 | `#1677ff`（antd 默认）**49 处** vs 产品 `#0066cc` | 视觉不统一的首要来源 |
| 单文件硬编码色值 | ReviewDetail **76** / Submit **72** / ProjectQuestionEdit **52** | 高风险页集中在 3 个编辑器页 |
| `!important` | **23 处**（+ style.css 4 处） | 覆盖 antd 靠蛮力 |
| `aria-*` 属性 | **0 个**（31 个 .vue） | 无障碍近乎空白 |
| 无 label 的表单 | **15 / 51 个 a-form-item**（QuestionEdit 11/11 全无） | 屏幕阅读器不可用 |
| 有 `@media` 的文件 | **4 / 31**（24 个业务页零断点） | 移动端必然错位 |
| 已知死令牌 | `--ink-base` 被 3 页引用但从未定义 | 静默失效 |
| 复杂度前 5 页 | 4359 行 ≈ views 的 43% | 改造风险集中区 |

---

## 4. 设计原则（取舍时的优先级）

1. **一屏一事**：每个页面只有一个主任务，主操作永远在右上或底部动作条，不藏在表内。
2. **数据先行**：列表/表格是主视图；筛选、排序、批量操作靠边收拢，不堆在标题行。
3. **状态显性**：任何异步对象都必须有 loading / empty / error / partial 四态；AI 评分这类异步结果必须有明确的「评分中」进度语义。
4. **密度分级**：教师端与超管端走 compact 档，学生端走 comfortable 档，同一套令牌两个档位。
5. **克制的动效**：150–250ms、只动 `transform`/`opacity`，尊重 `prefers-reduced-motion`；动效服务于「状态变化被看见」，不做装饰。

---

## 5. 非目标（明确不做）

- 不改业务逻辑、接口契约、路由 path 与权限模型。
- 不替换 ant-design-vue，不引入第二套组件库（不引 Tailwind）。
- 不做移动端原生 App / PWA 离线。
- 不重写 Monaco / TipTap 编辑器内核，只做外壳与主题对齐。
- 本阶段不产出落地代码（评审通过后另起实施任务）。

---

## 6. 交付物清单（本阶段）

| 文件 | 内容 | 对应 skill 阶段 |
|---|---|---|
| `00-design-brief.md` | 设计简报（本文） | Phase 1 |
| `01-information-architecture.md` | 全站导航架构、页面地图、关键流程 | Phase 2 |
| `02-design-tokens.css` | 三层设计令牌（primitive → semantic → component），可直接引入 | Phase 3 + 10 |
| `02-design-tokens.md` | 令牌说明 + antd ConfigProvider 映射表 | Phase 3 + 10 |
| `03-components.md` | 组件规范（按钮/表格/表单/卡片/标签/空态…）+ antd 覆盖清单 | Phase 4 |
| `04-interaction-a11y.md` | 响应式、动效、无障碍（含 Chrome 69 兜底） | Phase 5 / 6 / 7 |
| `05-page-specs.md` | 26 个页面的逐页设计规范 | Phase 9（handoff） |
| `preview/index.html` | 高保真静态预览（令牌总览 + 4 个代表页样板） | Phase 9 |

**下一步**：评审 `preview/index.html` 与 `02-design-tokens.css` → 确认视觉方向后进入落地阶段（ConfigProvider 主题 + 逐页重构）。
