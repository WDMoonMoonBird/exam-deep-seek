# Wave 2 任务书（表单页模板 + 对话框与自动保存统一 + 共享层收口）

> **工作根目录**：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`）
> ⛔ 严禁修改主工作区 `/Users/you/My Projects/My Vue/Exam-DeepSeek` 下任何文件
> 执行 bash 必须显式 cd。Wave 1 的产物与约定见 [09-wave1-brief.md](./09-wave1-brief.md) 与 [10-wave1-verify.md](./10-wave1-verify.md)

---

## 0. 本批目标

① 统一**对话框**（现状 `Modal.confirm` 10 文件 + `a-popconfirm` 9 文件混用）
② 统一**自动保存**（现状三套节拍：1.5s / 2s / 300ms）
③ 建立**表单页模板**并把教师端 3 个编辑页迁上去
④ 收口 Wave 1 遗留的**共享层**：R-1 请求静默、R-7 删死代码、R-9 分页栏、R-10 错态

---

## 1. 硬约束（违反即不通过）

沿用 Wave 1 全部约束：只改模板/样式与必要的**行为封装**（本批允许新增 composable 与替换对话框调用，但**不改业务语义**）；一律用令牌；禁 `!important`；禁新增依赖；Chrome 69 限制同前；**不自启 dev server**（验收用 5175，captain 管理端口）。

**本批新增两条**：
- **不改接口调用与参数**（T12 只允许给 `request` 增加可选开关，不得改任何现有调用点的 URL/参数）。
- **Wave 3 文件禁碰**：`views/student/Submit.vue`、`views/teacher/ReviewDetail.vue`、`views/teacher/ProjectReviewNew.vue`、`views/Doc.vue`、`views/Login.vue`、`styles/tokens.css`。

---

## 2. 新增构件的契约（由 T13 交付，其它任务照此使用）

### `composables/useConfirm.js`
命令式确认封装（现状 11 处 `Modal.confirm` 都是命令式，替换成本最低；`a-popconfirm` 的声明式用法保留，只统一文案规范）。
```js
import { useConfirm } from '@/composables/useConfirm';
const { confirm } = useConfirm();
confirm({
  title: '确认按开放性题目布置',
  content: '……必须写清影响范围（N 名学生 / 不可撤销）……',
  okText: '确认布置',
  cancelText: '取消',
  danger: false,          // true 时 ok 按钮用 --red-600（危险操作必填 true）
  onOk: async () => { … }, // 支持 async；抛错则保持弹窗打开
});
```
- 必须与现状**行为等价**：`onOk` 返回 Promise 时 ok 按钮 loading、失败不关闭
- 文案规范：危险/不可逆操作必须写明**影响范围**；`okText` 用动词短语（"确认布置/删除班级"），禁止"确定"

### `composables/useDraftAutosave.js`
```js
const { status, lastSavedAt, saveNow, schedule } = useDraftAutosave({
  save: async () => { … },   // 实际保存函数（页面提供，内部仍是原有请求）
  delay: 1500,               // 输入防抖
  interval: 30000,           // 定时兜底（0 = 关闭）
  enabled: () => dirty.value,
});
// status: 'idle' | 'saving' | 'saved' | 'error'
// schedule(): 输入时调用，delay 内多次调用合并为一次保存（**防抖入口，契约 rev2 补入**）
// saveNow():  跳过防抖立即保存，返回 Promise<boolean>；另有 visibilitychange 立即落盘与卸载清理
```
- 页面负责把 `status` 渲染成动作条上的状态文本（`role="status" aria-live="polite"`）
- **不改保存节拍语义**：各页现有 delay 值原样传入（QuestionEdit 2s / TeamEdit 300ms / 学生 Submit 留待 Wave 3）

### `components/FormPage.vue`
```vue
<FormPage title="编辑题目" description="…" :back="{ text: '返回题库管理', to: '/teacher/questions' }">
  <template #actions>…保存/发布按钮…</template>
  <template #panel>…右侧属性面板（sticky，320px）…</template>
  …默认插槽 = 左侧内容编辑区…
</FormPage>
```
- 结构：PageShell（复用 Wave 1 组件）+ 两栏（内容 + `#panel` sticky）+ 可选 `#actionbar` 底部动作条
- ≥1200px 两栏；<1200px 属性面板移到内容下方；窄屏单列

---

## 3. 分工与文件边界（互不重叠，越界即回滚）

| 任务 | 负责 | 可写文件（**仅这些**） |
|---|---|---|
| **t12** 构件 | shell-dev | `composables/useConfirm.js`、`composables/useDraftAutosave.js`、`components/FormPage.vue` |
| **t13** 共享层收口 | nav-dev | `api/request.js`、`components/ListPage.vue`、`components/DataTable.vue`（**删除**）、`views/{teacher,admin,student}/Layout.vue` |
| **t14** 教师端表单页 | teacher-dev | `views/teacher/{QuestionEdit,ProjectQuestionEdit,TeamEdit}.vue` |
| **t15** 管理端与对话框统一 | admin-dev | `views/admin/{AiConfig,Classes,Teachers,Students,Monitor}.vue`、`views/teacher/{Assignments,Students,Teams,Classes,Questions,ReviewClass}.vue` |

**谁都不要碰**：`styles/tokens.css`、Wave 3 的 5 个文件（见 §1）、`components/{PageShell,ListPage,StatusTag}.vue`（T12 除外，ListPage 归 T12）、`server/**`。

---

## 4. 各任务要点

### t13 共享层收口（§3 表中 「t13」，即 Wave 2 的共享层任务；构件是 t12）
1. **R-1 请求静默**：给 `api/request.js` 增加可选开关（如 `request.get(url, { silent: true })` 或 `request.silent.get(...)`），使**失败时不弹全局 message**、但**仍 reject 供调用方处理**。然后把三个 Layout 中为徽标写的**派生 axios 实例删掉**，改回统一入口 + silent。保持 401 跳登录、Authorization、schoolId 注入等既有行为不变。
2. **R-9 分页栏**：ListPage 增加每页条数切换（把 admin/Schools 页面内的兜底 a-select 收回组件，删掉页面内那段）与「单页时隐藏分页栏」；两者都要有开关且默认行为与 Wave 1 一致（避免影响 13 页）。
3. **R-10 错态**：ListPage 增加 `error` 插槽/prop（请求失败时页内展示 + 重试按钮），与 silent 配合使用；**不改变**现有页面在无 error 传入时的行为。
4. **R-7**：删除 `components/DataTable.vue`（0 引用死代码），删除前再跑一次引用检查。
5. **对话框**：三个 Layout 的 `Modal.confirm` 改用 `useConfirm`。

### t14 教师端表单页
- 三页统一到 `FormPage`；对话框改 `useConfirm`；自动保存改 `useDraftAutosave`（**delay 值原样保留**）
- QuestionEdit 的 RichEditor×2 / Monaco / AI 试卷解析 / 客观题 items 联动、ProjectQuestionEdit 的双角色与 zip 上传、TeamEdit 的防抖与取消拦截确认 —— **行为一律不变**
- 表单 label：`03-components.md` 要求所有 `a-form-item` 有 label（QuestionEdit 现有 11 个无 label，属历史问题，**本批只补齐明显缺失且不改变布局的项，其余记入 output 交 captain**）

### t15 管理端与对话框统一
- `AiConfig.vue` 迁到 FormPage（单栏变体）；其余页面只做**对话框与 Modal 规范化**（`useConfirm` 替换、Modal 宽度统一为 480/640/820 三档、危险操作 danger=true），**不动列表结构与逻辑**
- admin/Monitor 的深色日志区颜色令牌化（若涉及，用 --bg-inverse/--text-inverse-muted，R-6 未决前不要新增令牌）

---

## 5. 提交前自检（结果写进任务 output）

```bash
cd "/Users/you/My Projects/My Vue/Exam-DeepSeek-ui/client" && npm run build   # 必须 exit 0
grep -nE '#[0-9a-fA-F]{3,8}\b' <改动文件>     # 必须 0（例外需列出）
grep -n '!important' <改动文件>                # 必须 0
grep -c 'Modal.confirm' <你负责的页面>          # 必须 0（全部改 useConfirm）
```
外加：逐条列出「功能与改前一致」的核对项（对话框行为、自动保存节拍、接口调用与参数不变）。

---

## 6. 有问题找谁
- 构件 API 疑问 → 看 §2；不确定就在 output 里写明并**停下**，不要自创 API。
- 需要新令牌 → 在 output 里列出，**不要**改 `tokens.css`（captain 独占）。
