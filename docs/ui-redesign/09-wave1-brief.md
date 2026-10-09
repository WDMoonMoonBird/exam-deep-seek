# Wave 1 任务书（骨架组件 + 列表页迁移）

> **工作根目录（所有相对路径都相对它）**：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`
> 分支：`feat/ui-redesign` ｜ ⛔ **严禁**在 `/Users/you/My Projects/My Vue/Exam-DeepSeek`（主工作区）下修改任何文件
> 执行 bash 必须显式 cd，例如：`cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run build`

---

## 0. 目标

把 Wave 0 试点页（教师端「作业管理」）的做法**组件化并铺开到其余 13 个页面**，同时统一侧栏骨架与全局尺度。

产出三样东西：① 三个共享组件 ② 一个参考页 ③ 13 个迁移后的页面。

---

## 1. 硬约束（违反即验收不通过）

1. **只改模板与样式**：不改业务逻辑、不改接口调用与参数、不改路由、不改列语义/字段名。
2. **一律用令牌**：颜色、圆角、间距、字号、阴影、动效全部取 `var(--token)`（见 `docs/ui-redesign/02-design-tokens.md`）。
   - 禁止出现十六进制色值、`rgba(`、写死的圆角 px。
   - 例外：第三方视觉（Monaco 主题、文件类型图标底色）可保留，但需在任务 output 里列出。
3. **禁止 `!important`**（改动范围内的旧 `!important` 顺手删掉）。
4. **不新增依赖**，不引第二套组件库，不引 Tailwind。
5. **不改 `client/src/styles/tokens.css`**（令牌由 captain 独占维护）。
6. **Chrome 69 兼容**：不使用 `:is()` ` :where()` `:focus-visible` `color-mix()` `aspect-ratio` 容器查询。
   - 说明：项目现状已大量使用 flex `gap`（Chrome 69 不支持），本轮**不做**兼容改造，统一留到 Wave 4。
7. **不自启 dev server**（端口由 captain 统一管理，多人起会打架）。验证靠 §6 的命令；视觉验收由 verifier 统一截图。
8. 页面根元素**不加** `data-density`（密度由 Layout 统一设置，见 T2）。

---

## 2. 组件契约（必须按此实现，其它 agent 会照这个用）

### `components/PageShell.vue`
```vue
<PageShell title="作业管理" description="一句话说明" :max-width="'var(--layout-content-max)'">
  <template #actions>…主操作按钮…</template>   <!-- 可选 -->
  <template #kpi>…KPI 卡片…</template>          <!-- 可选 -->
  …默认插槽 = 页面主体…
</PageShell>
```
- props：`title`(string, 必填)、`description`(string)、`maxWidth`(string)
- 结构：`<div class="page">` + `.page-head`（标题 22px/600 + 描述 14px 次级色）+ `#actions` 右对齐
- 样式全部取自试点页 `views/teacher/Assignments.vue` 的 `.page / .page-head / .page-title / .page-desc / .page-actions`

### `components/ListPage.vue`
```vue
<ListPage
  :columns="columns" :data-source="list" :loading="loading" row-key="id"
  :total="pagination.total" :current="pagination.current" :page-size="pagination.pageSize"
  :empty-title="'还没有数据'" :empty-desc="'…'" :empty-action-text="'新建'"
  @page-change="onPageChange" @empty-action="openAdd"
>
  <template #toolbar>搜索/筛选控件（左）</template>
  <template #toolbar-right>右侧次要操作</template>
  <template #bodyCell="{ column, record }">…原样透传…</template>
</ListPage>
```
- 结构：`.card`（1px 边框 + `--card-radius`）> `.toolbar`（`#toolbar` + `#toolbar-right`）> `a-table`（禁分页器，`:pagination="false"`）> `.table-foot`（左侧「第 N 页 · 每页 M 条」+ 右侧 `a-pagination`）
- 空态：`#emptyText` 内置（标题/描述/按钮三件套，支持 `emptyActionText` 为空时只显示文案）
- 表格样式（去竖线、表头左对齐、行高走令牌、hover 用 `--table-row-hover`）从试点页照搬，**用 `:deep()` 写在组件内**
- 分页：`@page-change` 抛出页码；**不内置请求逻辑**

### `components/StatusTag.vue`
```vue
<StatusTag tone="success" text="进行中" dot />
```
- props：`tone`(`neutral|brand|success|warning|danger|accent`，默认 neutral)、`text`(string, 必填)、`dot`(boolean, 默认 false)
- 输出：`<span class="tag tag-{tone}">[<i class="tag-dot">]<text></span>`
- 样式取自试点页的 `.tag*`，全部用 `--status-*` 令牌

> 试点页 `views/teacher/Assignments.vue` 是这三套样式的来源，直接抽取，不要重新发明。

---

## 3. 参考实现

`client/src/views/teacher/Questions.vue` —— 由 shell-dev 迁移完成后，**成为其余 13 页的抄写模板**：
- 它演示了：PageShell 用法、ListPage 用法、StatusTag 用法、筛选控件放 #toolbar、分页接服务端/前端两种写法。

---

## 4. 分工与文件边界（互不重叠，越界即回滚）

| 任务 | 负责 agent | 可写文件（**仅这些**） |
|---|---|---|
| T1 骨架组件 + 参考页 | shell-dev | `client/src/components/{PageShell,ListPage,StatusTag}.vue`、`client/src/views/teacher/Questions.vue` |
| T2 侧栏骨架 + 全局尺度 | nav-dev | `client/src/views/{teacher,student,admin}/Layout.vue`、`client/src/styles/antd-theme.js`、`client/src/styles/overrides.css` |
| T3 教师端页面 | teacher-dev | `client/src/views/teacher/{Classes,Students,Teams,Assignments,Review,ReviewClass}.vue` |
| T4 管理端页面 | admin-dev | `client/src/views/admin/{Schools,Classes,Teachers,Students,Monitor}.vue` |
| T5 学生端页面 | student-dev | `client/src/views/student/{Assignments,Scores}.vue` |
| T6 独立验收 | verifier | `docs/ui-redesign/10-wave1-verify.md` |

**谁都不要碰**：`client/src/styles/tokens.css`、`client/src/components/{DataTable,RichEditor,CodeEditor,ProjectZipUploader}.vue`（Wave 3 处理）、`client/src/domain/**`、`server/**`、`docs/ui-redesign/*.md`（除 verifier 的报告）。

---

## 5. 页面迁移要点

1. **分页能力按现状保留，不要自己造参数**（重要）：
   - 服务端分页已支持：`/teacher/assignments`、`/teacher/questions`、`/teacher/review-class/:classId`
   - **全量返回**（前端切片）：`/admin/{schools,classes,teachers,students}`、`/teacher/{classes,students,teams}` → 保持现有前端分页行为，在 ListPage 上方写一行注释 `<!-- TODO(P1-7): 接口支持服务端分页后切换 -->`
2. **状态列**改用 `StatusTag`；状态判断逻辑保持原样（不要发明新状态）。
3. **时间列**用 `domain/format.js` 的 `formatDateTime`；有截止语义的用 `deadlineInfo`。
4. **删除/危险操作**保持原有确认流程（`Modal.confirm` 或 `a-popconfirm` 原样保留，不统一——统一是 Wave 2 的事）。
5. **空态文案**区分「无数据」（引导创建）与「无搜索结果」（引导清空筛选）。
6. **必须保留的现状**：socket 实时刷新（Review/ReviewClass）、行内改分、三行信息块、导入导出入入口、锁定/解锁、权限分支——一律不动。

---

## 6. 提交前自检（把结果原样写进任务 output）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client"
npm run build                                     # 必须成功
grep -nE '#[0-9a-fA-F]{3,8}\b' <你改的文件>       # 必须 0 命中（有例外要列出）
grep -n '!important' <你改的文件>                  # 必须 0 命中
grep -c 'var(--' <你改的文件>                      # 必须 > 0
```
外加：逐条列出「功能与改前一致」的核对结果（例如：搜索、分页、锁定、删除确认…各一条）。

---

## 7. 有问题找谁

- 组件 API 疑问 → 看 §2 与参考页；仍不确定 → 在任务 output 里写明并**停下**，不要自创 API（会导致其它 agent 对不上）。
- 令牌缺失（找不到合适的 `var(--x)`）→ 在 output 里列出「需要新增的令牌名与用途」，**不要**自己改 tokens.css。
