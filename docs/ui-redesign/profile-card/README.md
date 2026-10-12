# 「我的信息」名片重设计（提案）

方法论：`/afrexai-ui-design-system`（Phase 1 简报 → Phase 10 令牌）。现状为**线上实拍**（同一账号、同一数据）。

## 图
| 文件 | 内容 |
|---|---|
| `00-overview.png` | 六节总览（现状 vs 提案 / 学生端·展开·深色 / 手机端 / 规格 / 自评 / 交付） |
| `01-before-after-teacher.png` | 教师端：现状实拍 vs 提案 |
| `02-student-expanded-dark.png` | 学生端 · 展开修改密码 · 深色 |
| `03-mobile-sheet.png` | ≤480 底部 sheet + 手机端要点 |
| `04-specs.png` `05-rubric.png` `06-handoff.png` | 规格表 / 自评 / 交付清单 |
| `before-*.png` | 现状实拍（教师/学生 × 浅深），基线证据 |

## 现状实测（基线）
弹窗 480 宽 · **无 title → aria-labelledby 为 null（未命名对话框）** · 头像 56 品牌蓝居中 · 资料三/四行 14px「标签左值右」·
学生端每有一个班就重复一行「班级」标签 · 分隔线后用折叠面板藏「修改密码」。

## 提案结构（三区）
1. **名片区**：64 圆头像（首字）+ 姓名 18/600 + 右侧角色徽标（教师=brand / 学生=accent）。
   **不放单位/班级**（用户 2026-10-12 定案）：下方资料区已有同样信息，且长校名/长班名会把名片撑破或被迫省略；名片区只承担"这是谁"。
2. **资料区**：两列 grid，**标签在上（12 灰）值在下（15/500）**；工号/学号用等宽 + **复制按钮**（hover 显形，手机常显，带 aria-label）；
   多班级改 chip 列表（不再重复标签）；教师端加「身份」格。
3. **安全区**：12px 圆角分区卡片 + chevron（180ms 旋转）展开「修改密码」表单（标签在上、主按钮整宽）。

## 关键口径
- 弹窗 480 → **520**，补 `title="我的信息"`（修 a11y 硬伤），圆角 16，内距 24/22。
- 深色：头像转 rgba(0,102,204,.28) 底 + `--brand-300` 字（不用纯白刺眼），其余全走令牌。
- ≤480：弹窗改**底部 sheet**（顶部圆角 16 + 36×4 拖拽条、字段单列、复制常显、触控 ≥44）。
- 自评：现状 62 → 提案 88（视觉层次 20% / 一致性 15% / 留白 15% / 无障碍 15% / 响应式 10% / 交互 10% / 字体 10% / 颜色 5%）。

## 落地结果（已实现，2026-10-12）
- 新增 `client/src/components/ProfileCard.vue`；`views/teacher/Layout.vue`、`views/student/Layout.vue` 的弹窗改为该组件，补 `title="我的信息"`、宽度 480 → 520。
- 实测（教师/学生 × 浅深 + 390 手机端）：**role=dialog 的 aria-labelledby 指向「我的信息」**（改前为 null）· 弹窗宽 520 · 名片区 3 个子元素（头像 + 姓名 + 角色徽标，**无副行**）·
  复制按钮 aria-label「复制学号/工号」且剪贴板实测拿到 `202600001` / `e2e_teacher`，aria-live 播报「已复制学号」· 安全区可展开（aria-expanded 切换、3 个密码输入框）·
  空提交仍走页面既有校验（提示「请填写密码」，不发请求）· 手机端 390：字段单列（318px）、弹窗 366、无横向溢出、复制按钮常显 · 0 控制台报错。
- 实拍：`after-teacher-light.png` `after-teacher-dark.png` `after-student-light.png` `after-student-dark.png` `after-student-mobile.png`
- **偏差（有意）**：手机端仍用 antd 居中弹窗（≈全宽、单列），未做「底部 sheet + 拖拽条」——那是额外交互（下滑关闭），需单独排期；当前形态已解决"两列被挤断"的实际问题。
- 未动：改密请求与校验、userStore、菜单、路由、下拉菜单；管理端仍无此弹窗。

## 交付方式
新增 `client/src/components/ProfileCard.vue`（props：user / school / classes / role；安全区用插槽放现有密码表单），
改两个文件：`views/teacher/Layout.vue`、`views/student/Layout.vue` 的弹窗内容 + `title`/`width`。
**不动**：改密逻辑与校验、userStore、菜单、路由、下拉菜单。管理端无此弹窗（可选新增，需产品确认）。
验收：aria-labelledby 非空 · 浅深双主题 · 1440/768/375 无横向溢出 · 复制可键盘触发 · 0 控制台报错 · 现有改密用例回归通过。
