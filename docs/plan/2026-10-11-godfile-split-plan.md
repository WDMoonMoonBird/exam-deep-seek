# GodFile 拆分方案（2026-10-11）

> 背景：`scripts/gates/arch-metrics.mjs` 以 **>800 行 = 超标** 为判据，当前 **10 个文件超标**、19 个落在 >500 观察带。
> 昨夜流水线把这一项判为「结构性不可达」——**本方案纠正该结论**：它在**流水线的约束集内**成立，换掉约束即可解（见 §1）。
> 相关：`docs/refactor-architecture.md`（目标架构，权威）、`docs/pipeline/99-summary.md` §6、`scripts/gates/`（现成门禁）。

---

## 1 为什么「不可达」是可解的（先纠正前提）

昨夜的两条阻塞，本质上都是**我自己给流水线加的约束**造成的：

| 阻塞 | 昨夜结论 | 真实情况 |
|---|---|---|
| **server 侧**：拆分必新增文件 → `未分层待迁移` 47 上升 → 撞 `arch-metrics` 的「不增」不变式 | 判为不可达 | ❌ **只对「原地拆」成立**。若**拆的同时按目标架构落层**（`domain/`、`application/`、`infrastructure/`、`interface/`），新文件本身就是"已分层" → **未分层数反而下降**，门禁变好 |
| **client 侧**：拆 `.vue` 是视觉改动 → 撞「视觉零改动」铁律（无 ui-guard 常驻） | 判为不可达 | ❌ **只对「拆模板」成立**。这 5 个文件的行数**主要堆在 `<script>`**（见 §2）→ **抽 composable 是纯 JS 搬移，模板与样式一行不动 → DOM 输出不变、像素 sha1 必然相等** |

补充：**像素比对装置昨夜已被实证可用**（round 2：`git archive` 改前源码 vs 活树 各自构建 → **6/6 区域像素 sha1 全等 + 几何盒全量全等**）。它可以直接充当"ui-guard 的等效物"。

**结论**：GodFile 不是不可达，而是**需要一个独立于流水线轮次预算的专项计划**。

---

## 2 现状盘点（10 个超标文件）

| # | 文件 | 行数 | 结构（行数分布 / 接缝） |
|---|---|---|---|
| 1 | `client/src/views/student/Submit.vue` | 1520 | template 64 ｜ **script 924** ｜ style 312；**53 个函数 / 14 个段落**（数据·导航·题号方块 a11y·编辑器懒挂载·多选绑定·客观题初始化·脏标记·草稿保存·倒计时·提交·数据加载） |
| 2 | `server/src/controllers/teacherController.js` | 1339 | **12 个段落**（学校切换·题库管理·AI 试卷解析·作业管理·待审核汇总·统计口径·教师列表·学校班级管理·学生管理·文件上传·AI 生成参考答案）；40 个函数 |
| 3 | `server/src/services/checkerService.js` | 1281 | **13 个段落**（宽容 JSON 解析·旧脚本解析·规则 JSON 解析·分项三分类校验·沙箱执行·LLM 调用·Prompt 构建·负例反馈·状态读取·体检快照·防幻觉校验·生成+自举校准）；27 个函数 |
| 4 | `client/src/views/Doc.vue` | 1107 | template 192 ｜ script 350 ｜ style 250；**文档页**，仅 6 个函数 |
| 5 | `server/src/services/deepseek.js` | 1052 | **7 个段落**（配置读取·试卷解析·参考答案·项目评分·L1 两阶段·固定分项·主观分项）；23 个函数 |
| 6 | `server/src/services/ruleExecutor.js` | 1011 | **8 个段落**（常量·内部工具·执行器·tree-sitter 语法检查·fact 规则·语义级规则·导出）；33 个函数 |
| 7 | `client/src/views/teacher/ReviewDetail.vue` | 989 | template 47 ｜ **script 391** ｜ style 359；7 段落·31 函数 |
| 8 | `client/src/views/teacher/QuestionEdit.vue` | 984 | template 48 ｜ **script 541** ｜ style 128；**52 个函数**（主观题编辑 / 客观题 items 编辑器两块） |
| 9 | `server/src/controllers/reviewController.js` | 966 | 24 个函数；实训题教师审核（:763 起）、AI 提示词查看（:890 起） |
| 10 | `client/src/views/teacher/ProjectQuestionEdit.vue` | 869 | template 40 ｜ **script 559** ｜ style 102；**28 函数**（自动评分器 :266、Monaco :455、上传回调 :582、学生提交 :643、加载 :681） |

**规律**：5 个 client 文件共 3478 行，其中 **script 占 2765 行（80%）**；5 个 server 文件共 5649 行，**段落边界清晰**（每 80–200 行一个内聚块）。→ **两者都有天然接缝，不需要"重新设计"。**

---

## 3 拆分三原则

1. **拆的同时落层**（server）：每个拆出的文件必须落进 `domain/`、`application/`、`infrastructure/`、`interface/` 之一 → `未分层待迁移` 只降不升。
2. **模板零改动**（client）：只抽 `<script>` 到 `composables/`，`<template>` 与 `<style>` **一行不动** → 像素 sha1 天然相等。
3. **每步一个提交、可单独回滚**；每步都必须过既定门禁（`hard-metrics` / `arch-metrics` / `cycle-check` / 全量测试）。

---

## Phase 1 先立护栏（**没有护栏不许开拆**）

| 护栏 | 内容 | 现状 |
|---|---|---|
| P1-1 **像素门禁** | 把 round 2 的实证方法固化为 `scripts/gates/pixel-diff.mjs`：改前用 `git archive <commit>` 构建、改后活树构建（均 `--outDir` 到仓库外），同装置同数据截图，比 **4 组区域像素 sha1**。**禁用** asset 文件名/字节哈希 | 方法已实证，脚本待落地 |
| P1-2 **契约对拍** | 后端每个拆分点先写"输入→输出"对拍脚本（round 3 用过：19/19 夹具 + AST 等价对比） | 方法已实证 |
| P1-3 **回滚锚点** | 每次开拆前打 tag（如 `split-<file>-before`） | 现成做法 |
| P1-4 **基线刷新** | 拆完重跑 `arch-metrics`；**未分层数下降要更新基线**（47 → 新值），否则门禁会误判"劣化" | 待做 |

---

## Phase 2 server 侧（按目标架构迁层，顺便拆）

**排序原则**：先纯函数（零框架依赖，正好满足 `domain` 层禁令）→ 后编排 → 最后 HTTP 控制器（最需要契约测试）。

### S1 `ruleExecutor.js`（1011 → 5 个文件）★**建议首刀**
- 接缝：常量(:35) / 内部工具(:126) / 执行器(:277) / tree-sitter 语法检查(:433) / fact 规则(:566) / 语义级规则(:636) / 导出(:833)
- 落层：`domain/services/rule/{constants,internals,executor,syntax,facts,semantic}.js` + `index.js` 汇总导出
- 护航：`rule-executor` **61 例** + `fact-extractor` 17 例 + 行为对拍
- 风险：**低**（纯函数、无框架依赖、有测试）。**未分层 47 → 46 或更低**

### S2 `checkerService.js`（1281 → 6 个文件）
- 接缝：解析族（:169/:230/:273/:384）→ `infrastructure/ai/checker/parsers.js`；LLM 调用(:456) + Prompt 构建(:527) → `infrastructure/ai/`；校验族（:626/:731）→ `domain/services/checker/validators.js`；生成编排(:814) → `application/services/checker-generator.js`
- 护航：`checker-service` 42 例
- 风险：中（生成链路是评分核心）

### S3 `deepseek.js`（1052 → 5 个文件）
- 接缝：配置读取(:5) → `infrastructure/bootstrap/ai-config.js`（**顺带修掉"直接 import prisma 读 systemConfig"的分层违规**）；试卷解析(:159)/参考答案(:375) → `infrastructure/ai/`；项目评分(:456)/L1 两阶段(:748)/固定分项(:851)/主观分项(:974) → `application/services/grading/`
- 护航：评分相关套件 + 对拍（注意：**不得发真实外部 API**，用 mock）
- 风险：中

### S4 `teacherController.js`（1339 → 控制器 5–6 个 + 用例若干）
- 接缝（12 段）：题库管理(:83)/AI 试卷解析(:372)/作业管理(:424)/待审核汇总(:520)/统计(:614)/教师列表(:811)/学校班级(:830)/学生管理(:1003)/文件上传(:1288)/参考答案(:1324)
- 落层：`interface/http/controllers/teacher/{questions,assignments,classes,students,files}.js`（**目标：薄控制器 <100 行**）+ 业务下沉 `application/use-cases/teacher/*.js`
- 护航：**必须先补契约测试**（本轮安全改造已给这些端点加了 62 例越权用例，可复用夹具）
- 风险：**高**（最大、且昨夜刚给它加过安全守卫）

### S5 `reviewController.js`（966 → 2–3 个文件）
- 接缝：实训题教师审核(:763)、AI 提示词查看(:890)
- 落层：`interface/http/controllers/review/{index,project}.js` + `application/use-cases/review/*`
- 风险：中（有 62 例越权用例覆盖部分端点）

**Phase 2 完成后的预期**：server 侧 5 个超标文件全部消失；`未分层待迁移` 从 47 **降到 ~35 或更低**（因为拆出的文件都落了层）。

---

## Phase 3 client 侧（抽 composable，模板零改动）

**全部遵循**：`<script setup>` 的逻辑搬进 `client/src/composables/use*.js`，`.vue` 只保留 `const {...} = useXxx()` 的接线；**`<template>` 与 `<style>` 一行不改**。

| # | 文件 | 抽出的 composable（建议） | 预估 |
|---|---|---|---|
| C1 | `Submit.vue` 1520（script 924） | `useAnswerState`（数据/多选绑定/客观题初始化）、`useDraftSave`（脏标记/草稿）、`useCountdown`（倒计时调度）、`useQuestionNav`（导航/题号方块 a11y）、`useEditorMount`（Monaco 懒挂载） | **低风险**，script 可降到 ~250 行 |
| C2 | `ProjectQuestionEdit.vue` 869（script 559） | `useChecker`（自动评分器 ~180 行）、`useMonacoSetup`、`useZipUpload` | 低（Monaco 已有共享 composable 先例） |
| C3 | `QuestionEdit.vue` 984（script 541） | `useQuestionForm`、`useItemsEditor`（客观题 items） | 低 |
| C4 | `ReviewDetail.vue` 989（script 391） | `useReviewActions`（审核操作）、`useAiPromptView` | 低 |
| C5 | `Doc.vue` 1107（template 192/script 350/style 250） | **特殊**：文档页。建议**数据驱动**（章节抽成数据数组 + 一个渲染组件）或按章节拆子组件 | **中**（拆子组件会改 DOM 结构 → 需用"DOM 树等价 + 像素"双重判据，不能只靠像素） |

**Phase 3 完成后的预期**：5 个 client 超标文件全部降到 800 以下（script 大幅缩小）。

---

## 4 推荐执行顺序（先易后难，每步可独立交付）

| 步 | 目标 | 为什么这个顺序 |
|---|---|---|
| 0 | 落地 P1-1 像素门禁 + P1-3 锚点 | 没有护栏不许动 client |
| 1 | **S1 `ruleExecutor.js`** | 纯函数、测试最全（61+17 例）、**同时把未分层从 47 降下来**，用来验证整套方法学 |
| 2 | **C1 `Submit.vue`** | 最大收益（-670 行 script）；模板零改动 → 首次用像素门禁护航 |
| 3 | S2 `checkerService.js` → S3 `deepseek.js` | 评分链路，需契约对拍 |
| 4 | C2/C3/C4 | 同 C1 方法，可并行（不同文件、无写冲突） |
| 5 | S4 `teacherController.js` → S5 `reviewController.js` | 最难，放最后；**先补契约测试再动** |
| 6 | C5 `Doc.vue` | 唯一需要"DOM 等价"判据的，单独处理 |

**预算参考**：S1 ≈ 1 步；C1 ≈ 1 步；其余每个 ≈ 1 步。总计约 **10–12 步**，每步独立提交。

---

## 5 每步的验收判据（DoD，缺一不可）

1. `node scripts/gates/arch-metrics.mjs` → PASS（**未分层数须下降或持平**，且 `layerViolations` 仍为 0；若上升则本步作废）
2. `node scripts/gates/cycle-check.mjs` → **SCC 仍为 0**（拆分不得引入新的循环依赖；边数会变，属预期）
3. `node scripts/gates/hard-metrics.mjs` → PASS（0/0/0）
4. **全量后端测试**：`ROUND=NN bash docs/pipeline/scripts/unblock-g2.sh` → 4 处摘要、**0 failed**、套件/用例数按本步变化如实记录（新增测试则数增，属预期）
5. **client 改动**（Phase 3 每步）：
   - `scripts/gates/pixel-diff.mjs` → **4 组区域像素 sha1 全等**
   - axe：**不引入新违规**
   - 禁止重建 `client/dist`（一律 `--outDir` 到仓库外）
6. **行为对拍**：拆分前后同一批夹具的输入→输出**逐字节相等**（server）/ 组件状态一致（client）
7. 每步**一个提交**，消息含"拆分前 file:line 范围 + 落层目标 + 验证结果"

---

## 6 风险登记与「不做什么」

**风险**
- **R1 契约漂移**：server 拆分最容易在"搬移时顺手改一行"处出错 → 强制"逐字搬移 + AST 等价对比"（round 3 已验证该方法）。
- **R2 循环依赖**：拆出的文件互相 import 极易成环 → 每步跑 `cycle-check`，**SCC 必须仍为 0**。
- **R3 响应式时序**（client）：composable 里 watcher/onMounted 的注册顺序变化可能影响首帧 → 像素门禁 + 手工走查关键交互（倒计时、草稿保存、题号导航）。
- **R4 未分层口径**：拆出的文件若落在 `server/src/services/`（旧目录）仍算未分层 → **必须直接落进四层之一**，这是本方案与"原地拆"的分水岭。
- **R5 测试数变化**：新增测试会让套件/用例数增长，**不是回归**（见 `project-constraints.md` 第 17 条：段1 不是固定值）。

**不做什么**
- ❌ 不为了"降行数"而把代码挪进 `utils/` 之类的杂物间（那是把 GodFile 变成 GodModule）。
- ❌ 不改任何对外契约（路由、请求/响应形状、错误码）——昨夜刚给这些端点立了 403/1003 契约，拆分必须原样保留。
- ❌ 不在 client 侧拆模板（除非 C5，且必须 DOM 等价 + 像素双重判据）。
- ❌ 不在同一提交里既拆文件又改行为。

---

## 7 结论

- 昨夜"GodFile 结构性不可达"的结论，**适用条件是流水线的四条约束**（≤8 文件/轮、未分层不增、视觉零改动、无 ui-guard）。**换掉约束就通了**：
  - server：**拆 + 迁层**，未分层不升反降；
  - client：**只抽 script**，模板零改动 + 像素门禁护航。
- **首刀建议 `server/src/services/ruleExecutor.js`**：纯函数、测试最全、能立刻把未分层数降下来，用于验证整套方法学。
- 若你同意，我可以先落地 **P1-1 像素门禁脚本**（Phase 1 的唯一前置），然后按 §4 的顺序逐步执行——每步一个提交，随时可停可回滚。
---

## 8 执行流程：继续用 A/B/C 吗？—— **用，但必须改 5 处**

**结论**：昨夜那套 A/B/C 流水线的**核心价值**（角色隔离、C 独立对抗性验证、约束注入、逐步归档、阻断即回流）在拆分任务上**同样成立且同样必要**；但它的**四条轮次约束**是为"猎捕未知缺陷"设计的，直接套到"计划驱动的机械重构"上会**再造一次"不可达"**。

### 8.1 必须改的 5 处（不改就别开工）

| # | 昨夜约束 | 拆分任务必须改成 | 为什么 |
|---|---|---|---|
| **1** | **禁止新增文件**（为守住 `未分层 ≤ 47`） | **允许新增，但必须直接落进四层之一**（`domain`/`application`/`infrastructure`/`interface`） | 拆分的**本质就是新增文件**；原约束会让每一步都"违规" |
| **2** | `未分层数` **不增**（≤47） | **必须下降或持平**，且每步后**刷新基线**（P1-4） | 拆 + 落层会让该数下降；若仍按"47 钉死"，门禁会把**改善**误判为劣化 |
| **3** | **每轮 ≤8 个文件** | 保留为**软上限**：一个"拆分单元"通常 1 源文件 → N 模块 + index + 测试，**允许触及 8 个左右** | 机械拆分的文件数天然比"定点修复"多 |
| **4** | **≤8 轮**（防猎捕死循环） | 改为**按方案的有限步数**（§4 共 10–12 步），**每步一个提交**；终止条件 = 步数走完或提前收敛 | 拆分是**有终点的计划**，不是开放式猎捕 |
| **5** | 每轮 A 做**全仓/新维度普查** | A 只在**开拆某个文件之前**做一次**"接缝与护航分析"**（不重复全仓扫描） | 接缝已经现成（§2），A 的价值在**风险与测试覆盖**，不在发现新缺陷 |

### 8.2 保留不变的部分（昨夜被证明有效的）

- **角色隔离**：A 只读、B 唯一写者、C 独立验证且**不采信 B 的自测**
- **约束包注入**：`docs/pipeline/project-constraints.md`（现 17 条测量纪律）每步随任务下发
- **C 的对抗性框架**：不只跑现成测试，要**自建对拍/探针**；本轮拆分的对抗性问题变成「**搬移是否真的等价**」
- **逐步归档** + 每步一个提交（可单独回滚）
- **阻断即回流 B**，不掩盖
- **硬禁令**：禁止 `git clean/stash/checkout -- ./reset --hard/restore .`；不碰 `:5173`/`:3000`、`client/dist`、`tests/`；临时服务必须 `PORT=0`

### 8.3 每步的流程（3 阶段 + 回流）

```
[开拆前] A：接缝与护航分析（该文件的段落边界 / 测试覆盖 / 依赖方向风险 / 建议落层）
         产物：docs/split/<file>-plan.md（一次性，之后不重复）
   ↓
[B 执行] 逐字搬移（不改逻辑）+ 建 index 汇总导出 + 更新 import 站点
         产物：代码改动 + docs/split/<file>-refactor.md（含逐字搬移对照）
   ↓
[C 验证] ① 行为对拍（改前 vs 改后，夹具输入→输出逐字节相等）
         ② 四门禁（arch 含"未分层下降"、cycle SCC=0、hard 0/0/0、bind-check）
         ③ 全量测试 0 failed（如实记录套件/用例数变化）
         ④ client 步追加：pixel-diff 4 组全等 + axe 不新增违规
         产物：docs/split/<file>-verify.md
   ↓
[判定] 通过 → 提交该步 + 刷新 arch 基线 + 进下一步
       阻断 → 回流 B（保留证据，不改测试迁就实现）
```

### 8.4 每个角色的提示词要点（与昨夜一致，仅调整任务面）

| 角色 | 输入 | 唯一产物 | 边界 |
|---|---|---|---|
| **A** | constraints / 目标文件 / 架构文档 §1 / 现有测试清单 | `docs/split/<file>-plan.md` | 纯只读；**不做全仓扫描**；行号必须实测 |
| **B** | A 的 plan + constraints | 代码改动 + `<file>-refactor.md` | **只改本步范围内的文件**；逐字搬移，不改行为、不改对外契约（403/1003 等原样保留）；不新增依赖 |
| **C** | B 的 refactor + A 的 plan | `<file>-verify.md` | 纯只读；**自建对拍脚本**（不复用 B 的）；必做变异/反证；临时产物放 `/tmp` |

### 8.5 与昨夜流水线的关系

- **复用现成资产**：4 个门禁脚本、`project-constraints.md`（17 条）、`unblock-g2.sh`（测试库一键解阻）、`pipeline-status.md` 的状态机模式
- **归档目录分开**：拆分走 `docs/split/`，不污染 `docs/pipeline/`（那是昨夜那轮的完整审计链）
- **状态文件**：可另起 `docs/split/status.md`（同样 ≤30 行），或在 `pipeline-status.md` 里开一节
- **若仍要无人值守**：沿用"每 N 分钟唤醒 + 防卡死重派"的驱动方式即可（昨夜已验证可用）
