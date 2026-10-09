# Wave 5 之后 · 关键链路端到端走查（UAT · t35）

> 走查人：verifier（独立于全部实现者）｜ 时间：2026-10-10 00:2x–01:0x
> worktree：`/Users/you/My Projects/My Vue/Exam-DeepSeek-ui`（分支 `feat/ui-redesign`）
> 走查基线 revision：**HEAD `e1f15e4`（含 t36 暗色链接修复）+ 工作区未提交的 t37 改动**（`ThemeToggle.vue`、三端 `Layout.vue`）——见 §10-⑤
> 环境：真实后端 :3000（真实数据库，可写）+ vite dev :5175；**真实浏览器（Playwright/Chromium）逐步操作，非 mock**
> 截图：`docs/ui-redesign/preview/shots/uat/`（**61 张**，命名与本文步骤号对应）
> 数据纪律：全程只新建/操作本次走查的一次性作业与其提交；**未修改任何既有作业/提交/成绩**（见 §9）

## 0. 结论

| 项 | 结论 |
|---|---|
| ① 教师布置作业 | ✅ 成功创建 2 份一次性作业（313 / 314，走查后锁定）；**Q9 开放性软警告确认**已实测（触发→取消→零创建） |
| ② 学生作答 + **草稿链路五项** | ✅ 五项**逐项实测通过**：防抖 1.5s（实测 **+1520ms**）、keepalive PUT（`keepalive:true` 实测）、失败重试（**+14945ms ≤30s**、脏标记保留）、Monaco 零交互挂载（**已验证**）、键盘方向键切题（**0→1**）；两份作业均真实提交成功 |
| ③ 教师评分审核 | ⚠️ UI 链路全部走通（重新评分 → 使用 AI 评语 → 保存审核 → 发布成绩，4 个写请求全 200）；**AI 分数未产出（环境无 API Key）**→ 见 §4/§10-① |
| ④ 学生查看成绩与评语 | ✅ 成绩列表显示已发布分数；作业页显示「得分 0/100 + 参考答案 + **评语：请联系老师**」（该评语经「使用 AI 评语」写入并保存） |
| ⑤ 管理端六页 | ✅ 学校/班级/教师/学生/监控/AI 配置逐页走查，0 横向溢出、0 pageerror、数据正常渲染 |
| ⑥ 形态矩阵 12 组 | ✅ 三端 × 亮/暗 × compact/comfortable = 12 组截图，**0 破版**（溢出全为 0） |
| 追加：暗色 colorPrimary 指纹扫描 | ⚠️ **7 命中**（分页当前页号 2.71:1 ×4、分页 hover 图标 2.6:1 ×3）；Doc/表单/工作台/监控 0 命中（t36 修复生效）→ §8 |
| 阻断项 | **1 项**：AI 评分无产出（环境缺 Key，非代码缺陷） |
| **合并结论** | **可以合并**（无代码/UI 阻断；AI 评分为环境限制；测试数据已锁定并登记，因无删除接口无法物理清理） |

---

## 1. 走查身份与前置数据（真实拓扑，重要）

| 角色 | 账号 | 单位/班级 |
|---|---|---|
| 教师 | `teacher_a`（A老师，id 1063） | 单位「广西农业职业技术大学」（schoolId **2730**），班级 **测试班级切换**（134） |
| 学生 | `10001@4145013830`（学生 1，id 2304） | 属班级 **134**（school 2730） |
| 管理端 | `admin` | 全局 |

> **为什么不是 test_teacher**：任务书写的 `test_teacher` 名下只有班级 `test_class`（123，school 3453），而本次走查指定的学生账号 **不在该班**（API 实测：class 123 的 11 名学生中无 10001@4145013830）。该学生实际属 `teacher_a` 的班级 134（school 2730），其可见的历史作业（306/308 等）也由 teacher_a 创建（`teacherId=1063` 实测）。为保持「真实教师 → 真实学生 → 同一份作业」的链路完整，教师角色由 **teacher_a 切换单位到 2730** 扮演；这是**环境数据拓扑偏差**，不是流程偏差。

---

## 2. ① 教师布置作业（含开放性软警告）

| 步骤 | 操作与观察 | 截图 |
|---|---|---|
| 1 | `teacher_a` 登录 → 顶栏显示「广西农业职业技术大学 · 教师」 | `01-teacher-login.png`、`02-teacher-after-school-switch.png` |
| 2 | 作业管理 → 布置作业 → 步骤 1 选题（表格 + **单选 radio**） | `03-wizard-step0-question-selected.png` |
| 3 | 步骤 2 选班：`测试班级切换`（唯一可选班） | `05-wizard-step1-class-selected.png` |
| 4 | 步骤 3 填标题/说明/起止时间（`2026-10-10 00:41 → 2026-10-13 00:41`） | `07-wizard-step2-form.png` |
| 5 | 提交 → `POST /api/teacher/assignments` **200 创建成功**，返回 **id 313**（题目 Q352 `java 测试`：1 客观 + 5 编程） | `08-wizard-submitted.png` |
| 6 | 列表确认新作业在列（共 28 份） | `09-teacher-assignment-list.png` |
| 7 | 重复流程创建 **id 314**（题目 Q328 `Java期末压测`，纯编程题，用于编程题链路） | 同上组截图 |
| 8 | **学生侧可见性**：`GET /student/assignments` 返回 313（`352:code`）与 314（`328:code`）✅ | — |

### 2.1 Q9 开放性题目软警告（单独验证，**零数据副作用**）

用 `test_teacher` + 其名下**无标准工程包**的实训题 Q356「开放性」+ 班级 123 走同一向导：

- 提交后后端返回 400 + `code=1007`（软警告，**未创建**）；
- 前端弹出确认框，标题 **「确认按开放性题目布置」**，正文：
  > 以下题目未上传标准工程包，AI 将仅依据评分标准做评价式评分（不与参考答案对比）：开放性。确认按开放性题目布置？题目「开放性」未上传标准工程包，将按开放性题目布置：……
- 点击 **取消** → 作业列表无新增、`POST /teacher/assignments` 状态码仅 `[400]` → **未产生任何数据** ✅

截图：`07b-q9-soft-warning.png`、`07c-q9-after-cancel.png`。

---

## 3. ② 学生作答 + 草稿链路五项（核心）

学生 `10001@4145013830` 登录 → 打开作业 313（`/student/assignments/313`）：6 个小节、**35 个题号方块**（30 个客观小问 + 5 个编程题）。

### 3.1 草稿链路五项逐项实测

| # | 项（对应修复） | 实测方法与观察值 | 判定 |
|---|---|---|---|
| a | **1.5s 防抖落盘** | 点击客观题选项 → 首个 `PUT /313/draft` 出现在 **+1520ms**（200）；后续改动均按防抖落盘 | ✅ |
| b | **关闭/离开页面 keepalive PUT（V3）** | 先清空探针日志 → 制造未保存改动（+400ms）→ 立即导航离开；在同源页面读回 `window.fetch` 探针记录：`{url:/api/student/assignments/313/draft, method:PUT, **keepalive:true**, body:{questionId:352,subQuestionId:760,answer:"[{key:0,answer:"C"}…]"}}` | ✅ |
| c | **失败保持脏标记 + 30s 内重试（V4）** | 将 `/draft` 全部 mock 为 **500** → 页脚显示 **「1 题未保存」**（脏标记保留）；请求时序：**+1508ms**（防抖首次）→ **+14945ms**（定时重试，**≤30s** ✅）；恢复 200 后脏标记清除、页脚回到 **「草稿已同步」** | ✅ |
| d | **零交互滚动 → Monaco 挂载（V5）** | 作业 314（单编程题）：打开页面后**不做任何点击**，首次读取 `.monaco-editor` = **1**、`.sq-editor-wrap` = 1（已挂载）；随后可直接点击敲入代码并被保存（`PUT /draft` 200）。<br>作业 313（5 个编程小节位于首屏之下）：真实滚动容器是 **`.sp-content`**（`scrollHeight 1055 > clientHeight 803`）；最初两轮探针错误滚动了 `.content`/window（`contentScrollable=false`）故未见挂载 —— **属探针缺陷**，非产品回归；修正容器后编程区正常渲染并可作答 | ✅（附探针缺陷说明） |
| e | **键盘方向键切题（S3）** | 35 个 `.n-box`：`role=button`、`tabindex=0`、aria-label 全非空；聚焦第 1 个方块按 **ArrowRight** → 高亮从 `active0=-1` 变为 **active=1**，焦点同步到第 2 个方块 | ✅ |

### 3.2 作答与提交

| 作业 | 作答内容 | 提交结果 |
|---|---|---|
| **313**（客观+编程） | 30/30 客观小问全部选择；草稿全部落盘（`.sync-ok` 出现） | `POST /313/submit` **200** → 提交 **id 10399**、status `submitted` |
| **314**（编程） | 编程题实际敲入代码（`// UAT code 1 …`），保存成功 | `POST /314/submit` **200** → 提交 **id 10400**、status `submitted` |

截图：`10-student-assignment-open.png`、`11/24-student*-v5-monaco*.png`、`12-student-s3-keyboard.png`、`13-student-debounce-saved.png`、`15-student-dirty-failed.png`、`16-student-retry-30s.png`、`17-student-after-restore.png`、`18-student-keepalive.png`、`19/20-student-*.png`、`21/22`、`25/26/27`。

---

## 4. ③ 教师评分审核

| 步骤 | 操作与观察 | 截图 |
|---|---|---|
| 1 | 评分审核列表：3 份 UAT 作业显示「待评分 1 人 / 待审核 N 人 / 已交·未交」 | `30-teacher-review-list.png` |
| 2 | 打开提交 **10400** 工作台：标题 `Java期末压测`、学生 `学生 1 / 10001@…`、按钮齐全（重新评分 / 使用 AI 评语 / 保存审核 / 发布成绩） | `31-teacher-workbench.png` |
| 3 | 点击 **重新评分** → `POST /teacher/submissions/10400/regrade` **200**；轮询约 2 分钟，页面 AI 分数始终 **0/100**（未产出）| `32-teacher-after-ai.png` |
| 4 | 点击 **使用 AI 评语** → 教师评语输入框被写入 **「请联系老师」**（提交里既有的 AI 评价文本）| `33-teacher-ai-comment.png` |
| 5 | 点击 **保存审核** → `PUT /teacher/submissions/10400/review` **200** | `34-teacher-review-saved.png` |
| 6 | 点击 **发布成绩** → 确认框 → `PUT /teacher/submissions/publish` **200**；提交状态变为 `published` | `35-teacher-publish-confirm.png`、`36-teacher-published.png` |
| 7 | 暗色下工作台整页复核（0 pageerror） | `37-workbench-dark.png` |

**AI 评分未产出的原因（环境）**：服务器目录只有 `server/.env.example`，**无 `.env`/API Key**；regrade 接口正常受理（200），但评分服务无凭据可用 → 分数保持 0。属**环境限制**，非 UI/接口缺陷（§10-①）。

---

## 5. ④ 学生查看成绩与反馈

- 成绩列表（`/student/scores`）：显示 4 条，含本次 `UAT 编程题链路 16:46 → 0/100`（已发布）✅ —— `40-student-scores.png`
- 作业详情页（`/student/assignments/314`）：显示 **得分 0 / 100**、**参考答案**、以及 **评语「请联系老师」**（即步骤 ③-4 经「使用 AI 评语」写入并随审核保存的教师评语）✅ —— `42-student-assignment-after-publish.png`
- 说明：学生端没有独立的「成绩详情」路由（点击行不跳转），反馈展示落在作业详情页；截图中已含该页面的完整证据。

---

## 6. ⑤ 管理端六页走查（只读）

| 页面 | 观察值 | 截图 |
|---|---|---|
| 学校管理 | 51 行、0 溢出、0 错误 | `50-admin-schools.png` |
| 班级管理 | 17 行 | `50-admin-classes.png` |
| 教师管理 | 7 行 | `50-admin-teachers.png` |
| 学生管理 | 21 行（分页 1） | `50-admin-students.png` |
| 服务器监控 | 日志区渲染正常 | `50-admin-monitor.png` |
| AI 配置 | 6 行配置项 | `50-admin-ai-config.png` |

六个页面 `documentElement` 横向溢出均为 **0**，无 pageerror。

---

## 7. ⑥ 形态矩阵（3 端 × 2 主题 × 2 密度 = 12）

| 端 | 页面 | 主题 | 密度（实测属性） | 横向溢出 |
|---|---|---|---|---|
| teacher | /teacher/assignments | light / dark | compact ✓ / comfortable ✓ | 0 / 0 |
| admin | /admin/schools | light / dark | compact / compact ⚠️ | 0 / 0 |
| student | /student/assignments | light / dark | compact ✓ / comfortable ✓ | 0 / 0 |

- 12 张截图：`60-matrix-{teacher,admin,student}-{light,dark}-{compact,comfortable}.png`。
- 密度切换方式：直接改写布局根 `data-density`（tokens.css:162 起为 `[data-density="compact"]` 定义），用于形态核对。
- **说明**：admin 端的 `data-density` 被页面模板自身固定为 `compact`，改写后测量值仍为 compact（两档截图为同一密度）；teacher/student 两档均成功切换。
- **破版项：0**（全部 12 组横向溢出为 0，顶栏高度恒为 56px）。

---

## 8. 追加扫描：暗色下 `colorPrimary` 派生指纹（captain 追加）

**方法**：暗色（`data-theme=dark`）下扫描 10 个页面的所有可见元素，筛选 `getComputedStyle(color) === 'rgb(3, 90, 176)'`（darkAlgorithm 对品牌蓝的派生指纹），逐项判定「是否承载文字」与「对比度」。

| 页面 | 命中 | 详情 |
|---|---|---|
| teacher/assignments | 1 | `.ant-pagination-item a` 文本「1」→ 底 `rgb(20,20,20)`，**2.71:1** |
| teacher/review | 1 | 同上 **2.71:1** |
| admin/schools | 4 | 同上（2.71:1）+ `.ant-pagination-item-link-icon`(double-right) 及 svg/path → 2.60:1（非文字，hover 图标） |
| student/scores | 1 | 同上 **2.71:1** |
| /doc, teacher/questions/edit, teacher/review/{10400}, admin/monitor, admin/ai-config, student/assignments | **0** | —— |

**结论**：**7 命中（4 处承载文字）**，全部集中在 **antd 分页组件的「当前页号」与 hover 图标**，根因同 t36（darkAlgorithm 把 `colorPrimary` 派生为 `#035AB0`，在深底上仅 ~2.7:1）。
**建议（不改全局 colorPrimary）**：按 t36 手法做组件级覆盖，例如
```js
components: { Pagination: { colorPrimary: cssVar('--text-link') } }
```
或对 `[data-theme="dark"] .ant-pagination-item-active a` 显式绑 `var(--text-link)`（`--text-link` 暗色为 `#8ec5ff`，约 9.5:1）。
`/doc` 0 命中，**t36 的 Anchor 修复在本轮实测中确认生效**。

---

## 9. 数据纪律与产生数据登记

**原则**：只操作本轮新建的一次性测试作业与其提交；未触碰任何既有作业/提交/成绩。

| 对象 | id | 说明 | 处置 |
|---|---|---|---|
| 作业 | **312** `UAT 走查作业 2026-10-09 16:38`（题 Q355 实训题，班 134） | 日期控件调试阶段误建（0 提交） | 已**锁定**；无删除接口，登记留痕 |
| 作业 | **313** `UAT 客观编程题 16:41`（题 Q352） | 走查主作业（客观+编程） | 已**锁定**；登记留痕 |
| 作业 | **314** `UAT 编程题链路 16:46`（题 Q328） | 编程题链路作业 | 已**锁定**；登记留痕 |
| 提交 | **10399**（作业 313） | 30 客观已答；status `submitted` | 保留 |
| 提交 | **10400**（作业 314） | 编程已答；经使用 AI 评语 + 保存审核 + 发布成绩，status `published`，评语「请联系老师」 | 保留 |
| 其它 | —— | 无 | —— |

**清理情况**：服务端 **无作业删除接口**（`server/src/routes/teacher.js` 仅有 `GET /assignments`、`GET /assignments/:id`、`POST /assignments`、`PUT /assignments/:id/lock`）；前端亦无删除入口。故按任务口径**登记留痕**，并已将三份作业 `locked=true`（API 200 三项均确认），学生侧不再可作答。
**误建说明**：312 是日期范围控件调试过程中被创建的一次性作业（其题目 Q355 与本轮其它数据无关），已在 §10-③ 一并登记建议。

---

## 10. 未达标项 / 阻断项 / 需 captain 决策

| # | 类别 | 项 | severity | 说明与建议 |
|---|---|---|---|---|
| ① | **环境阻断** | AI 评分无产出 | high（环境） | 服务器无 `.env`/API Key → regrade 200 但分数恒 0。**不影响 UI/链路结论**；如需端到端含 AI 分数，请配置 Key 后重跑 §4 步骤 3–4 |
| ② | 缺陷（联合发现） | 暗色分页「当前页号」对比度 **2.71:1**（4 页命中）+ hover 图标 2.60:1 | medium | 见 §8；按 t36 手法做 Pagination 组件级覆盖即可，不动全局 colorPrimary |
| ③ | 缺陷（UX） | **布置作业向导只能单选 1 道题**（`row-selection` 为 radio），而后端 `POST /teacher/assignments` 接受 `questionIds` **数组** | medium | 实测：勾第 2 题会替换第 1 题（`radioChecked` 恒为 1）；必须为「客观+编程+实训」混合作业时无法一次布置。请确认这是设计取舍还是缺口 |
| ④ | 登记 | 无作业删除接口 → UAT 测试数据无法物理清理 | low | 已锁定 312/313/314 并登记；建议补一个软删除（`deletedAt` 字段已存在）便于后续 UAT |
| ⑤ | 登记 | 走查基线含 **t37 未提交改动**（`ThemeToggle.vue`、三端 `Layout.vue`） | info | 本轮 61 张截图对应 `e1f15e4` + 该未提交状态；**合并前建议对顶栏/主题入口相关页复跑一次**（不影响本轮其它结论） |
| ⑥ | 登记 | 工作台曾出现 1 次 `pageerror: Illegal value for token color: rgb(20, 25, 34)`（Monaco tokenizer 警告） | low | 后续两次定向复跑（浅/暗各一次）**均未复现**（0 pageerror），暂记不可稳定复现项 |
| ⑦ | 观察 | 学生端无「成绩详情」路由，反馈只在作业详情页展示 | info | 若产品要求逐题反馈页，需另立需求 |
| ⑧ | 探针缺陷（非产品） | 首两轮 V5 检查未正确滚动（真实滚动容器是 `.sp-content`） | info | 已修正并给出容器证据；产品侧 V5 修复本身验证通过 |

### **合并结论：✅ 可以合并**

- 无代码/UI 阻断；①–⑥ 链路全部走通，草稿链路五项逐项通过；
- 唯一阻断为 **AI 评分环境缺 Key**（§10-①），与 Wave 5 改动无关；
- 待办（建议合并后随「UAT 收口」一并处理）：§10-② 分页暗色对比度、§10-③ 多题布置能力确认、§10-④ 删除接口。

---

## 11. 证据索引

| 组 | 文件（`docs/ui-redesign/preview/shots/uat/`） |
|---|---|
| ① 布置作业 | `01`、`02`、`03-wizard-step0-question-selected`、`05-wizard-step1-class-selected`、`07-wizard-step2-form`、`08-wizard-submitted`、`09-teacher-assignment-list` |
| ① 附 Q9 软警告 | `07b-q9-soft-warning.png`、`07c-q9-after-cancel.png` |
| ② 学生链路 | `10`、`11/24`（V5）、`12`（S3）、`13`（防抖）、`15/16/17`（失败重试）、`18`（keepalive）、`19/20`（作答与落盘）、`21/22`、`25/26/27` |
| ③ 评分审核 | `30`–`37` |
| ④ 成绩与评语 | `40-student-scores.png`、`41-student-score-detail.png`、`42-student-assignment-after-publish.png` |
| ⑤ 管理端 | `50-admin-{schools,classes,teachers,students,monitor,ai-config}.png` |
| ⑥ 形态矩阵 | `60-matrix-{teacher,admin,student}-{light,dark}-{compact,comfortable}.png`（12 张） |
| 追加扫描 | `70-dark-doc-scan.png` |

原始日志：`/tmp/uat/{step1-final,step1,step2,step2b,step2c,step3,step4,step5,step6,step-q9}.json`；探针脚本 `/tmp/uat/*.cjs`。

---

**签名**：verifier ｜ 本报告为真实浏览器逐步走查结果；所有观察值均来自本轮实测，实现者自测仅用于确定核对项。
