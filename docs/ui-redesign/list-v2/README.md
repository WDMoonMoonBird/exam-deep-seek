# 列表样式 v2（表格）

设计与落地说明。样式图见本目录：`light-*.png` / `dark-*.png` / `compare-before-after.png`。

## 目标
**美观 + 保持强横向比较**：列仍然对齐可比，但行更有呼吸、状态一眼可辨、操作不再挤成一排纯文字。
设计方法：`/afrexai-ui-design-system`（Phase 1 简报 → Phase 10 令牌），自评 70 → 88。

## 改动范围（用户明确限定）
**只改表格本体**：表头 / 行 / 单元格 / 状态 / 进度 / 操作 / 勾选列 / 行态 / 空态。
工具条、分页、KPI、页头、请求逻辑、路由、后端 **一律不动**。

## 冻结的底座（改这里必须同步验收 11 页）
| 文件 | 内容 |
|---|---|
| `client/src/styles/tokens.css` | `--table-row-h: 64px`、`--table-cell-pad-y: 14px`、`--table-cell-pad-x: 16px`、`--table-head-pad-y: 12px`、`--table-header-fs/fw/tracking`、`--table-row-accent(-w)` |
| `client/src/components/ListPage.vue` | 表头 44px/12px/500/字距；悬停与选中行的 **左侧 2px 品牌条**（`inset` 阴影，不动 tr 定位） |
| `client/src/styles/overrides.css` | 单元格工具类：`.lp-stack`(`.is-plain`) `.lp-num`(单位 `<u>`) `.lp-mono` `.lp-progress`(`.lp-track` `.is-ok/.is-warn`) `.lp-actions` |
| `client/src/domain/format.js` | `splitDateTime(v) → { date, time }`：日期列固定两行的唯一来源 |

## 页面约定
- 主键列两行式：`.lp-stack`（主 14/500 + 次 12 灰，均单行省略），**信息不重复**（同一信息不既进次行又占一列）。
- 日期列固定两行（`splitDateTime` + `.lp-stack.is-plain`），避免同列有的换行有的不换行。
- 数字列 `align: 'right'` + `.lp-num`，单位写进 `<u>`。
- 状态一律 `StatusTag` + `dot`，tone 沿用各页现状（不新增颜色）。
- 操作列容器 `.lp-actions`。
- antd 列若只写 `dataIndex` 没写 `key`，`#bodyCell` 里要用 `column.dataIndex` 判断，否则分支不命中。

## 验收阈值（队长脚本 `/tmp/lists/accept.mjs`）
表头高 = 44px；行高 46–72px（单行 ≈50 / 两行 ≈66）；单元格内距 14px × 16px；
浅/深两主题控制台 **0 报错**；页面 **0 横向溢出**；按页断言 `.lp-stack / .lp-num / .lp-progress / .lp-mono / .lp-actions` 存在，
以及「应删除的列」确实已删除（如学生管理的「班级」、班级管理的「所属学校」）。

## 落地结果（7 个 agent 分页实施，队长统一验收）
11 个列表页全部接入并通过验收（浅/深双主题）：

| 页面 | 表头 | 行高 | 内距 | 判定 |
|---|---|---|---|---|
| 题库管理·作业管理·评分审核·学生管理·班级管理·教学团队·学生管理(管理端)·班级管理(管理端) | 44 | 66 | 14/16 | ✅ |
| 教师管理 | 44 | 60 | 14/16 | ✅ |
| 学校管理（只读页，无操作列） | 44 | 50 | 14/16 | ✅ |
| 我的成绩 | 44 | 67 | 14/16 | ✅ |

- 表格溢出容器：0（评分审核曾因次行用完整 YYYY-MM-DD 撑到 1131px > 1110，改为 MM-DD 后 1110/1110）。
- 控制台报错：0（双主题）；文档横向溢出：0。
- 实拍截图见本目录 `live-*.png`；验收脚本 `/tmp/lists/accept.mjs`（不入库）。

## 需要记住的两条口径
1. **日期**：只有一个日期值（创建时间）→ 单行 `formatDate`；日期 + 时间（截止时间）→ 两行 `splitDateTime` + `.lp-stack.is-plain`。
2. **主列宽度**：主列写 `width: '1fr'`（antd 会把非法值丢弃 → 该列吃剩余宽度）；在本项目 `scroll.x='max-content'` 布局下，**声明宽度只是相对比例**，验收看比例而非绝对值。
   两行式单元格的文案必须放得进列宽：`.lp-stack` 是 nowrap，超长会把整列顶宽、表格溢出容器（`.lp-stack` 已加 `max-width:100%; overflow:hidden` 兜底，但字号/文案仍要控制）。

## 未做（有意）
- 手机端「一行一卡」的卡片化列表：本次范围只到表格本体，窄屏仍沿用表格横向滚动。需要时另开一轮。
- 骨架屏加载态：仍用 antd 的 loading 覆盖层。
