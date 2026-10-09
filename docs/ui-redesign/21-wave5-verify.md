# Wave 5 独立验收报告（t34）

> 验收人：verifier（独立于实现者）｜ 对象：Wave 5 全部产出（t31 主题基础设施与入口 / t32 暗色面适配 + R-23 组件侧 / t33 R-22 + R-23 页面侧）
> worktree：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`，HEAD `55d764d`；Wave 5 为工作区未提交状态）
> 验收时间：2026-10-10 00:21–00:50 ｜ 依据：`20-wave5-brief.md` §2/§3/§4 + `04-interaction-a11y.md` + 收口池 R-21/R-22/R-23
> 方法：真实运行（复用 :5175 dev server + 真实后端 :3000，非 GET 全部 route 拦截）+ 硬检查 + WCAG 对比度实测（**按 alpha 叠层合成 + 600ms 过渡等待 + 截图像素交叉验证**）
> 探针：`/tmp/wave5-verify/{p1,p1b,p2r,p3,p4}.cjs`；原始数据 `/tmp/wave5-verify/{p1,p1b,p2,p2-main,p3,p4}.json`

## 0. 结论摘要

| 维度 | 结论 |
|---|---|
| 硬检查（Wave 1–4 不回退） | ✅ 全仓 `*.vue` hex **0**、`!important` **0**、views `Modal.confirm` **0**；build exit 0 |
| 主题入口与持久化（t31） | ✅ 三端入口齐全（浅色/深色/跟随系统 + ✓ 标记）；切换即时生效；**刷新保持**；`localStorage['ui-theme']` 同步 |
| system 跟随 | ✅ `emulateMedia` light→dark→light，属性 1s 内跟随，storage 保持 `system` |
| 首帧不闪白 | ✅ 暗色偏好下 `waitUntil:'commit'`（`#app` 仍为空、应用未挂载）时 `data-theme=dark`、`color-scheme=dark` |
| antd 重新派生 | ✅ 切暗色后 antd 内部令牌实测变化：表头 `rgb(251,252,253)→rgb(35,41,53)`、内容底 `rgb(246,247,249)→rgb(11,15,22)` |
| **暗色全站对比度** | ✅ 12 页主面全部达标（正文/次要文字/表格/表单/弹窗/登录 + 文档正文；专项：行 hover 15.01、选中 14.5、accent 标签 7.88，截图像素验证 bg = rgb(38,36,73)）；⚠️ **1 处未达标**：Doc 的目录锚点与正文链接暗色 **2.6:1**（见 §4.4） |
| R-22 Doc 灯箱 | ✅ 打开后焦点在灯箱内（`role=dialog` `aria-modal=true`）、Tab 不逃逸、**Esc 关闭且焦点回到触发图片**；Enter 键盘路径同样成立 |
| R-23 1024 列断点 | ✅ 11 页实测：1024 表头 ⊂ 1440 且更少（隐藏项与 t33 清单逐字一致）；**1024 下 `.content` 横向溢出 = 0**（Wave 4 遗留的 417/187/57px 已消失） |
| legacy 入口 | ✅ `html.legacy` 下主题菜单可用、切换成功、0 pageerror |
| 既有验收结论 | ✅ 抽验 4 项全部成立（分页中文 + 粘性表头吸附、时间格式无斜杠、题号键盘可达、Workbench 三栏） |
| **回归（Wave 5 引入）** | **0 项** |
| 未达标 / 待裁决 | 5 项（1 项清理 + 1 项口径统一 + 3 项挂账确认） |

**判定：通过（Pass）**。R-21（暗色不可用）、R-22（灯箱 a11y）、R-23（1024 宽表）**三项全部闭环**。

---

## 1. 环境与方法（含本轮探针缺陷修正，供后续复跑）

| 项 | 值 |
|---|---|
| 前端 | worktree 工作区，vite dev `:5175`；后端 :3000 |
| 账号 | `test_teacher` / `admin` / `10001@4145013830` |
| 主题注入 | `localStorage['ui-theme']` + `data-theme` 由应用自身写（本报告全部走真实入口切换，仅"首帧"用例预置 localStorage） |
| legacy 模拟 | 覆写 `CSS.supports('selector(:where(x))')` → false |

**两处探针缺陷（本轮踩到并已修正，写入报告以免后续误判）**

1. **持久化假阴性**：第一版探针在 `addInitScript` 里**每次导航都写** `localStorage['ui-theme']=system` → 刷新后必然回落 system（light）。修正为「只在首个导航注入登录态、不写主题」后，持久化实测通过（§3）。**应用无此缺陷。**
2. **表格 measure-row 干扰**：`.ant-table-tbody tr` 的首个 `tr` 是 `aria-hidden` 的 measure-row → hover 必然超时。修正为 `tr.ant-table-row`。

**对比度测量口径（按 captain 口径执行）**：① 背景色按 **alpha 叠层合成**（从元素向上收集每一层 `backgroundColor` 做 over 合成，不用推算）；② 涉及过渡的元素（行 hover/选中、标签）**固定等待 600ms** 再读值；③ 对 accent 标签额外做了**截图像素采样交叉验证**（见 §4.3）。

---

## 2. 硬检查与 Wave 1–4 不回退

| 指标 | 台账基线 | 实测 | 说明 |
|---|---|---|---|
| `*.vue` 六位 hex | 0（Wave 4 后） | **0** | 无回退 |
| `*.vue` `!important` | 0 | **0** | 无回退 |
| views `Modal.confirm` | 0 | **0** | 无回退 |
| `npm run build` | — | **exit 0** | `/tmp/wave5-verify/build.log` |
| 变更面 | — | 21 个修改文件 + `composables/useTheme.js`（新增） | 三端 Layout、App.vue、antd-theme.js、index.html、RichEditor、overrides.css、Doc.vue、11 个列表页 |

**既有验收结论抽验（4/4 通过）**

| 抽验项（来源） | 实测 |
|---|---|
| Wave 1/3：分页「N 条/页」中文 + ListPage 粘性表头（T1/T10/t17） | ✅ 选项 `20/50/100/200 条/页`；滚动 400px 后粘性层 top **56** = 顶栏 bottom **56**，`.card.is-stuck` 在 |
| Wave 4：时间格式（t27/t29） | ✅ 作业管理页 `YYYY-MM-DD HH:mm` 命中 5 处、斜杠日期 **0**、无 Invalid/NaN |
| Wave 3/t22：题号方块键盘可达（S3） | ✅ 35 个 `.n-box`：role=button、tabindex=0、aria-label 35/35 非空；ArrowRight 后 active=1 |
| Wave 3：Workbench 三栏壳（t19） | ✅ ReviewDetail：左/中/右 = 220 / 604 / 384 |

---

## 3. 主题基础设施与入口（t31）

| # | 断言 | 实测 | 判定 |
|---|---|---|---|
| 1 | **入口可用** | 三端用户下拉「主题」子菜单：`["浅色","深色","跟随系统 ✓"]`，三项均可点 | ✅ |
| 2 | **持久化** | 切深色 → `data-theme=dark` + `localStorage=dark` → **reload 仍 dark**；切浅色 → light → reload 仍 light（三端一致） | ✅ |
| 3 | **system 跟随** | `emulateMedia` light→dark→light：属性依次 light→dark→light（1.2s 窗口内跟随），storage 保持 `system` | ✅ |
| 4 | **首帧不闪白** | 暗色偏好 + `waitUntil:'commit'`：`data-theme=dark`、`color-scheme=dark`、`#app` 为空（应用尚未挂载）；截图 `first-paint-dark-commit.png` | ✅ |
| 5 | **antd 重新派生** | 切暗色后：`.ant-table-thead th` `rgb(251,252,253)→rgb(35,41,53)`（antd darkAlgorithm 生效）、`.content` `rgb(246,247,249)→rgb(11,15,22)` | ✅ |
| 6 | 切换过程错误 | 三端 pageerror = 0 | ✅ |
| 7 | **legacy 入口** | `html.legacy=true`；打开主题菜单 → 点深色 → `data-theme=dark`；0 pageerror（截图 `legacy-theme-dark.png`） | ✅ |

---

## 4. 暗色全站对比度实测（t32）

### 4.1 逐页结果（判据：正文 ≥4.5:1，大字/UI ≥3:1）

| 页面 | 被测选择器 | 通过 | 未达标 |
|---|---|---|---|
| teacher/assignments | 标题/描述/表头/单元格/标签/分页 | 6/6 | 0 |
| teacher/questions/330/edit | 标题/描述/富文本正文/textarea/输入框/下拉/主按钮 | 7/7 | 0 |
| teacher/review/9102（工作台） | 标题/评分盒/提交条/主按钮 | 2/2 | 0 |
| teacher/review/project/10297（工作台） | 标题/面板标题/字段标签/评语框 | 3/3 | 0 |
| admin/schools | 标题/表头/单元格/标签/主按钮 | 4/4 | 0 |
| admin/monitor | 标题/日志区 pre/表头 | 2/2 | 0 |
| admin/ai-config | 标题/提示文本/表单标签 | 3/3 | 0 |
| student/assignments | 标题/卡片标题/元信息/标签 | 4/4 | 0 |
| student/assignments/306（作答） | 小节头/小题区 | 2/2 | 0 |
| student/scores | 标题/表头/单元格 | 3/3 | 0 |
| /doc | 正文 h2 | 1/1 | 0（目录锚点另测，见 §4.4） |
| /login | 标题/描述/输入框 | 3/3 | 0 |
| **合计** | | **40/40**（主选择器） | **0（主面）＋ §4.4 发现 1 项链接未达标** |

> 12 张暗色截图：`docs/ui-redesign/preview/shots/wave5/dark-*.png`（暗色核验：截图平均色 rgb(20,25,33)，确非浅色页）。

### 4.2 专项（过期过渡 + 叠层合成，等待 600ms）

| 项 | 前景 | 合成底 | 比值 |
|---|---|---|---|
| 表格单元格（基准） | `rgba(255,255,255,.85)` | `rgb(20,25,34)` | **17.62** |
| 行 hover | 同上 | `rgb(34,39,47)`（`rgba(255,255,255,.06)` over 卡片） | **15.01** |
| 行选中（`--bg-selected`） | 同上 | `rgb(22,42,68)`（`rgba(31,122,224,.18)` over 卡片） | **14.5** |
| accent 标签（实训题/团队共享） | `rgb(196,181,253)` | `rgb(38,37,73)`（`rgba(122,90,248,.18)` over 卡片） | **7.88** |

**与 captain 台账数值的口径差异（请对齐）**：账上 hover 12.48 / 选中 10.8 / accent 6.5；本次实测 hover 15.01 / 选中 14.5 / accent 7.88。差异来源有二：① **前景色取值不同**——本次取渲染后的 `rgba(255,255,255,.85)`（antd 暗色表格正文），不是纯白/其它近似值；② **accent 底色叠层不同**——账上合成底 `rgb(40,51,101)` 含额外蓝色欠层，本次在 teacher/Assignments 的卡片面 `rgb(20,25,34)` 上合成得 `rgb(38,37,73)`。
**像素交叉验证**：对 accent 标签元素截图采样，标签本体像素 = `srgb(38,36,73)`（与合成值 `rgb(38,37,73)` 一致，1 单位取整差），故本次数值有浏览器像素背书。四组数值**均远超 4.5:1**，两种口径下结论一致（达标），差异不影响判定，但建议台账统一采「渲染后前景 + 逐层合成底 + 600ms 等待」口径。

### 4.3 覆盖说明（两处选择器未渲染，已单独补测）

- `admin/monitor .log-viewer pre`：本开发库日志区为空（正文显示「暂无日志」）→ `pre` 不渲染。改测容器：`.log-viewer` 文字 rgba(255,255,255,.85) / 底 rgb(11,15,22) = **19.19:1** ✅；`pre` 自身颜色由 `var(--code-fg)` 驱动（Wave 4 已按两主题同值验证）。
- `/doc .doc-toc a`：Doc 用的是 antd Anchor（`.ant-anchor-link-title`），原选择器不存在 → 已单独补测，结果见 §4.4。

### 4.4 ⚠️ 未达标项：Doc 目录锚点/正文链接在暗色下对比度不足

| 主题 | 链接颜色（实测） | 合成底 | 对比度 | 判据 |
|---|---|---|---|---|
| 浅色 | rgb(0,102,204) | rgb(255,255,255) | **5.57** | ✅ ≥4.5 |
| 暗色 | rgb(3,90,176) | rgb(20,25,34) | **2.60** | ❌ <4.5（也 <3） |

- 覆盖元素：`.ant-anchor-link-title`（含 active）与 Doc 正文内链接；暗色下二者同值。
- 根因（实测 + 源码对照）：暗色令牌 `--text-link: var(--brand-300)` = #8ec5ff（深底上约 9.5:1，**值是正确的**），但页面锚点/链接走的是 **antd 派生的 colorLink**（colorPrimary ← cssVar(--brand-600) 经 darkAlgorithm 派生为 #035AB0），**未使用 --text-link**。
- 建议修法（二选一，1–2 行）：① `styles/antd-theme.js` 显式映射 `colorLink: cssVar(--text-link)`（最彻底，全站链接一并修正）；② Doc 页对 `.ant-anchor-link-title` / `a` 显式绑 `var(--text-link)`（局部）。

### 4.5 暗色下 Q&A：Wave 4 的 1.19:1 缺陷已闭合

Wave 4 报告 §4.2 记录的两处不可读（`.ant-table-tbody td` / `.tiptap` 均为 `rgba(0,0,0,.88)` on 深底，**1.19:1**）→ 本次实测：表格正文 **17.62**、富文本正文 **14.63**（`--text-primary`，t32 接线）✅。

---

## 5. R-22 / R-23 独立复现（t33）

### 5.1 R-22 Doc 灯箱（activeElement 实测）

| 步骤 | 实测 |
|---|---|
| 点击图片打开 | `mask=1`、`role=dialog`、`aria-modal=true`、`document.activeElement = BUTTON.lightbox-close`（**在灯箱内**） |
| 按 Tab | activeElement 仍是 `lightbox-close`、仍在灯箱内（**不逃逸**） |
| 按 Esc | `mask=0`、activeElement = `IMG.doc-img`（**就是触发元素**） |
| 键盘路径 | 聚焦图片 → Enter → 打开且焦点在灯箱内 → Esc → 关闭且焦点回到该图片 |
| 错误 | 0 pageerror |

截图：`doc-lightbox-focus.png`。

### 5.2 R-23 1024 档列断点（11 页）

| 页面 | 1440 表头数 | 1024 表头数 | 隐藏列 |
|---|---|---|---|
| admin/Schools | 5 | 3 | 院校代码、层次 |
| admin/Classes | 4 | 2 | 所属学校、创建时间 |
| admin/Teachers | 5 | 3 | 隶属学校、创建时间 |
| admin/Students | 4 | 2 | 班级、创建时间 |
| teacher/Classes | 5 | 3 | 所属学校、创建时间 |
| teacher/Students | 5 | 3 | 学校、创建时间 |
| teacher/Teams | 5 | 3 | 创建者、创建时间 |
| teacher/Questions | 6 | 4 | 难度、创建时间 |
| teacher/Assignments | 7 | 5 | 班级、题数 |
| teacher/Review | 5 | 4 | 已交/未交 |
| teacher/ReviewClass | 6 | 5 | AI评分 |

- 全部满足「1024 表头 ⊂ 1440 表头且更少」，隐藏项与 t33 声明**逐字一致**；1440 档表头数与 Wave 1–4 基线一致（未误伤）。
- **1024 下 `.content` 横向溢出 = 0**（11/11 页），Wave 4 §4.3 的 417 / 187 / 57px 已消除；`documentElement` 溢出亦为 0。
- 截图：`r23-*-1024.png`（11 张）。

---

## 6. 未达标项 / 需要 captain 决策

| # | 项 | severity | 说明与建议 |
|---|---|---|---|
| ① | **t32 临时脚本残留** | low（清理） | `client/__t32_sel.mjs`、`client/__t32_verify.mjs` 为未跟踪文件，建议合并前删除（与 t10 同款问题） |
| ② | 暗色对比度口径差异（§4.2） | info | 账上 hover 12.48 / 选中 10.8 / accent 6.5 vs 本次 15.01 / 14.5 / 7.88；差异源于前景色取值与 accent 叠层，两种口径均达标。建议台账改采「渲染后前景 + 逐层合成底 + 600ms 等待」并留存像素证据 |
| ③ | **R-17 仍未处理** | info | 「工作台评分面板折叠后 `activeElement=BODY`」台账归 `Wave 5 a11y 收尾`，但 t33 范围为 R-22/R-23，本轮未覆盖 → 请确认继续挂账或结案（captain 此前倾向接受现状） |
| ④ | R-5 / R-16 仍挂 | 依赖外部 | 后端分页（R-5）、倒计时新增功能（R-16）状态未变 |
| ⑤ | 暗色入口的可见性 | info | 主题入口在「用户下拉 → 主题」二级菜单内；若希望更易发现，可在设置/顶栏加图标按钮（非必需） |
| ⑥ | **Doc 链接暗色对比度 2.6:1**（§4.4） | medium | 唯一未达 AA 的暗色面；`--text-link` 令牌本身正确（#8ec5ff），是 antd `colorLink` 未走该令牌。建议按 §4.4 方案①在 `antd-theme.js` 显式映射 `colorLink` |

---

## 7. 证据索引

### 7.1 截图（`docs/ui-redesign/preview/shots/wave5/`，30 张）

| 组 | 文件 |
|---|---|
| 暗色全站（12 页，1440×900） | `dark-teacher-assignments.png`、`dark-teacher-questions-edit.png`、`dark-teacher-review-workbench.png`、`dark-teacher-review-project.png`、`dark-admin-schools.png`、`dark-admin-monitor.png`、`dark-admin-aiconfig.png`、`dark-student-assignments.png`、`dark-student-submit.png`、`dark-student-scores.png`、`dark-doc.png`、`dark-login.png` |
| 主题入口 / 首帧 / legacy | `theme-entry-{teacher,admin,student}-dark.png`、`first-paint-dark-commit.png`、`legacy-theme-dark.png` |
| R-22 灯箱 | `doc-lightbox-focus.png` |
| R-23 1024（11 页） | `r23-*-1024.png` |
| accent 色值像素证据 | `accent-tag-clip.png`（标签本体像素 `srgb(38,36,73)`） |

### 7.2 原始数据（`/tmp/wave5-verify/`）

| 文件 | 内容 |
|---|---|
| `p1.json` / `p1b.json` | 入口可用性（含探针缺陷说明）与持久化复核 |
| `p2.json` / `p2-main.json` | 12 页对比度逐元素 + 专项 hover/选中/accent |
| `p3.json` | R-22 activeElement 轨迹 + R-23 11 页列差异与溢出 |
| `p4.json` | Wave 1–4 结论抽验 4 项 |
| `build.log` | `npm run build`（exit 0） |

---

**签名**：verifier ｜ 本报告为独立复跑结论；实现者自测仅用于确定「应核对哪些断言」。对比度数值按 captain 口径（叠层合成 + 600ms 等待）实测，并用截图像素交叉验证。
