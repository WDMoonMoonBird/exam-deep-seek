# AI 实训题评分系统重构方案（v1.0）

> 日期：2026-08-18 ｜ 依据：docs/plan/2026-08-18-handoff-review.md（交接文档）｜ 项目：Deadpan 判题系统（Exam-DeepSeek）
> 目标：**教师零成本操作** + 确定性评分 + 低成本 + 可解释；借鉴 Submitty 的"声明式规则 + 构建期校验"思想，但**不把机器格式还给教师**

---

## 〇、方案摘要（一页）

当前系统评分确定性已达成（同代码必同分、59 人零波动），瓶颈在**规则生产链路依赖人工**：
标准包被当作"满分答案"导致校准卡 94 分、收敛不稳，教师被迫看 JSON 修规则（P0-1/P0-2/P2-7）。

本方案核心三件事：
1. **标准包角色降级**：不再作为评分基准，只做"下限体检 + 事实期望值来源 + 样例输出生成"；满分判定权回归评分标准 → 卡分问题从根上消失，教师不再需要完美标准包
2. **规则生命周期 + 教师自然语言确认层**：生成 → 校准 → 摘要确认（一键确认/重生成/转主观），教师全程不接触 JSON；教师改分行为作为信号反哺规则质量
3. **生成即校验 + 题型模板库**：规则 Schema v2 前置校验（借鉴 Submitty complete_config_schema），模板库把"每次生成"变成"套模板微调"

配套：测试基建独立进程化（P1-3）、factExtractor 语言插件化（P2-4/P3-8）、fact 规则优先引导（P2-6）。

**教师单题操作从"看 JSON 改规则（数小时）"降为 3 步 ≤ 5 分钟**：
上传评分标准+标准包 → 点生成 → 看中文摘要点确认。

---

## 一、目标与硬约束

| 编号 | 目标 | 验收口径 |
|---|---|---|
| G1 | 教师零成本：单题配置 3 步、≤5 分钟，全程不接触规则 JSON | 新教师（无技术背景）独立完成 1 题配置 |
| G2 | 确定性不变：同代码必同分 | 题目 353 全班 59 人复测零波动 |
| G3 | 成本可控：LLM 调用量不高于现状（规则生成 ≤3×8 轮 + 主观分最小化） | 单题生成全流程 token 统计 |
| G4 | 可解释：学生可见逐条扣分明细（kind='checker'/'ai'） | 明细含规则中文标签 |
| G5 | 不回归：全量测试基线 787 保持 | npm test 单命令全绿 |

**硬约束（不可妥协，来自交接文档 §八教训）**：
- C1：AI 只产 JSON 参数，不产可执行代码（教训 1）
- C2：长输出任务用非思考模式 + max_tokens 16000（教训 2）
- C3：评分确定性不依赖任何 LLM 参数（seed/温度均不可靠）（教训 3）
- C4：tree-sitter 每次新建实例、不共享 Parser（教训 4）
- C5：主观分失败记 0 分，不降级丢弃确定性结果（教训 6）
- C6：不改变学生提交/评分链路的外部契约

---

## 二、问题清单与方案映射

| 优先级 | 问题（交接文档编号） | 解决方案 | 章节 |
|---|---|---|---|
| P0 | 标准包=满分假设不成立，校准卡 94 | 标准包角色降级 + 置信度阈值 + 缺陷注册表 | §4.1 |
| P0 | 校准收敛不稳（92→94 原地踏步） | 多轮全新生成取最优（替代修正式单链） | §4.2 |
| P1 | jest 多套件复用 tree-sitter 状态破坏 | 测试隔离策略重构 | §6 |
| P2 | .ts/.tsx 用 JS 文法解析 | tree-sitter-typescript 插件 | §5.1 |
| P2 | 规则在线编辑缺失 | 自然语言确认层 + 高级模式折叠 JSON 编辑器 | §4.3 |
| P2 | fact 规则使用率低（0 vs 正则 58） | 模板内嵌 fact 示例 + prompt 字段清单注入 + 占比监控 | §4.4/§5.1 |
| P2 | 标准包缺陷处理依赖人工 | 缺陷注册表自动豁免 + 一键转主观 | §4.1/§4.3 |
| P3 | Java/Python/Go 语言支持 | factExtractor 语言插件架构 | §5.1 |
| P3 | 更多事实字段 | apiRoutes/storeMutations 等 4 个新字段 | §5.1 |

---

## 三、目标架构总览

```
┌────────────────────────── 教师层（新增，唯一面向教师的界面） ──────────────────────────┐
│  上传评分标准+标准包 → 一键生成 → 规则摘要卡片（中文）→ [确认] [重生成] [该项转主观]      │
│  高级模式（折叠）：规则 JSON 查看/编辑（CodeMirror，仅进阶教师/运维）                      │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
┌────────────────────────── 规则生命周期层（新增） ────────────────────────────────────────┐
│  draft → calibrated → review → active / archived（版本化，可回滚）                        │
│  Schema v2 校验（生成即校验，非法不进校准） │ 缺陷注册表（标准包已知缺陷 → 豁免）          │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
┌────────────── AI 生成层（改造 checkerService） ──────────────────────────────────────────┐
│  并行多轮全新生成（N=3 取最优）→ 标准包校准（阈值 ≥90）→ 体检报告 → 交确认                │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
┌────────────── 确定性执行层（保留，微扩） ────────────────────────────────────────────────┐
│  L0 过滤 → factExtractor（语言插件化）→ ruleExecutor（规则类型扩展）→ 主观分（温度 0）    │
│  → 写回 Submission（aiScore/aiFeedback 明细）                                             │
└──────────────────────────────────────────┬──────────────────────────────────────────────┘
                                           │
┌────────────── 反馈层（新增） ────────────────────────────────────────────────────────────┐
│  教师审核：采纳 aiScore → finalScore / 改分 → 差异落 grading_override_signals            │
│  → 聚合"某规则/某 group 被改分次数" → 建议重生成（规则质量面板）                           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

数据流：教师材料 →（AI）→ 规则 v2 →（Schema 校验）→ 标准包校准 →（教师确认）→ active
→ 学生提交 →（确定性执行）→ 分数+明细 →（教师审核）→ 改分信号 →（反馈）→ 规则质量

---

## 四、核心设计

### 4.1 标准包角色降级（解决 P0-1，本次重构最关键决策）

**现状问题**：标准包被当作"满分答案"，规则按评分标准生成后标准包只能拿 94 分 → 校准不可能满分 → 每次 ready 都靠人工把缺陷项转主观。

**新角色定义**（借鉴 Submitty：标准解只生成期望输出，不作为评分基准）：

| 用途 | 旧 | 新 |
|---|---|---|
| 评分基准 | ✅（满分答案） | ❌ 取消 |
| 校准目标 | =100 分 | ≥90 分（置信度阈值，默认 90，教师可调） |
| 事实期望值来源 | — | ✅（如"标准包 dependencies 有 axios"→ fact 规则参数） |
| 样例输出生成 | — | ✅（标准包跑一遍产出期望输出/截图，供 Execution 类规则使用） |
| 规则下限体检 | — | ✅（好学生提交至少拿 ≥90） |

**缺陷注册表（standard_package_defects）**：每题目记录标准包已知缺陷（如"无 Axios 统一封装"），
校准循环中命中已知缺陷的失分项**自动豁免**（不计入校准失败），并标记为"转主观候选"。
→ 消除"每次 ready 都靠人工修正"的重复劳动；缺陷只需登记一次。

**校准终止条件**（三者同时满足才 ready）：
1. 标准包得分 ≥ threshold（默认 90）
2. 所有失分项 ∈ 已知缺陷 ∪ 教师确认豁免
3. Schema 校验通过

**教师体检报告**（生成后展示）：标准包在规则下的得分 + 失分项中文列表 + 每项操作：
`转主观` / `豁免` / `接受`。教师看到的是扣分解释，不是 JSON。

### 4.2 校准策略重构（解决 P0-2）

**多轮全新生成取最优**（替代"修正式单链迭代"）：
- 每轮用完整相同 prompt（评分标准 + rubricItems + 满分 + 标准包文件树 + 事实字段 schema + 模板）全新生成规则
- 并行 N=3 轮（复用 ai_concurrency 并发配置），每轮独立执行校准（≤8 轮）
- 取"标准包得分最高 + 规则数最少"者为候选（简单优先，防过拟合）
- 全部候选失败 → failed，保留最佳草案供教师救回

**可复现性**：每轮 LLM 请求/响应 hash 与校准结果写入 checker_meta.log（round, score, 失分项清单, promptHash），出问题可精确复盘。

**状态机扩展**：

```
none → generating → calibrating → review → ready
                         └──→ failed（保留 bestDraft，可人工救回重走 review）
```

`review` 为新增状态：规则已校准达标，等待教师确认后才 active（对应 §4.3 Layer A）。

### 4.3 规则生命周期与教师确认层（解决 P2-5/P2-7）

**规则版本化**（RuleVersion 表）：每版规则全量快照 + 状态 + 变更原因；active 规则可一键回滚。
评分时锁定"该次评分使用的规则版本 hash"→ 学生看到的明细与分数严格对应同一版本规则。

**教师确认 API**（checkerController 扩展）：
- `POST /api/teacher/questions/:id/checker/confirm` body: { action: 'confirm' | 'regenerate' | 'to_subjective', itemIds?: string[] }
- 确认页展示：规则摘要卡片（group × 条数 × 分值）+ 失分点中文列表（来自体检报告）+ 三个按钮

**学生可见性控制**（借鉴 Submitty validation 的 show_message/show_actual）：
每条规则 `showMessage: 'always' | 'on_failure' | 'never'`，默认 on_failure（隐藏测试不泄露判分细节）。

**改分信号反馈回路（Layer B 反哺规则质量）**：
- 教师审核页已有（采纳 aiScore→finalScore / 自己打分），本次只加**记录**：
  `Submission.finalScore ≠ aiScore` → 写入 grading_override_signals（submissionId, delta, 规则版本 hash, 教师 id, 时间）
- 管理端"规则质量"面板：按规则 group 聚合改分次数/平均 delta
  → 某 group 被改分 ≥ 阈值（如 10 次）→ 提示"该组规则判定可能过严/过松，建议重生成"
- 效果：教师每次改分既是审核，又无意中完成了规则质量的监督——**审核成本变成反馈输入**

### 4.4 规则 JSON Schema v2 + 题型模板库（解决 P2-6）

**Schema v2**（借鉴 Submitty complete_config_schema.json 的设计，但面向 AI 生成收窄约束）：

```jsonc
{
  "schema_version": 2,
  "max_score": 100,                 // 满分（来自 rubricItems 求和，教师可改）
  "objective_items": [{
    "id": "a1",
    "group": "路由与跳转",            // 对应评分标准 9 项 group
    "rule_type": "fact",             // enum: file_exists|dir_contains_file|contains_text|count_regex|
    //                                  contains_regex|file_count_in_dir|syntax_check|fact|count_range
    "params": { /* 按 rule_type 分支校验，如 fact: {fact, op, value} */ },
    "score": 3, "max_score": 3,      // 约束：score ≤ max_score（执行器强制）
    "hidden": false,                 // 学生不可见
    "partial_credit": null,          // 新增：null(全有全无) | {min, step} 区间部分给分
    "show_message": "on_failure",    // always | on_failure | never
    "evidence_template": "工程缺少 {label} 封装"  // 命中时给学生的中文反馈模板
  }],
  "subjective_items": [{ "id": "s1", "item": "代码风格", "max_score": 5, "reason": "标准包缺陷豁免自动转主观" }]
}
```

校验规则（validateRules 升级为 schema 校验器，**生成后立即执行，非法直接 failed**，不浪费校准轮）：
1. 未知字段拒绝、未知 rule_type 拒绝
2. 客观项总分 + 主观项总分 = max_score（保留现有约束）
3. 每项 score ≤ max_score；主观项不参与总分累加
4. `fact` 规则引用的字段必须 ∈ 事实字段白名单（单一事实源：factFieldsSchema）
5. `path` 参数防逃逸（必须解析在项目根目录内，禁止 ../）

**题型模板库**（QuestionTemplate 表，**系统内部机制，教师不可见、无需选择**）：
- 模板 = 规则骨架（group 结构 + fact 字段映射 + prompt 片段 + 标准包体检要点）
- 首批 3 模板：`vue-frontend-crud`（题目 353 提炼）、`java-backend-api`、`python-algorithm`
- **项目类型自动检测**：服务端在生成前用标准工程包检测语言/框架（复用 buildGradingContext 文件树 + factExtractor 的 language/framework/dependencies 事实）→ 命中模板自动套骨架 + AI 只填参数；未命中（新类型/混合工程）→ 自由生成
- 新增语言支持 = 新增模板 + 插件，教师端零改动（符合"所有工程项目都适用"的目标）
- **fact 优先引导（P2-6）**：模板内嵌 fact 规则示例（如 hasVueRouter 直接用 fact 而非 contains_text 正则）；
  prompt 注入"可用事实字段清单（含中文标签）"；校准报告统计 fact/正则占比，<20% 提示"该题可更多使用事实规则"

---

## 五、执行层与提取层改造

### 5.1 factExtractor 语言插件化（P2-4/P3-8/P3-9）

```js
// 插件接口（factExtractor.js 保持入口兼容，13 个既有单测不动）
registerLanguage({
  name: 'js',                      // 'js' | 'ts' | 'python' | 'java'
  grammars: ['tree-sitter-javascript', 'tree-sitter-typescript'],
  detect: (rootDir) => boolean,    // 按文件扩展名/配置文件探测
  extract: (rootDir, ast) => facts // 返回统一事实 JSON
})
```

- 现有 JS 逻辑重构为 `js` 插件（行为不变）；新增 `ts` 插件解决 .ts/.tsx 用 JS 文法误报 syntaxErrors（P2-4），Vue SFC `<script lang="ts">` 走同一插件
- 新增事实字段（P3-9）：`apiRoutes`（路径→方法→处理函数映射）、`storeMutations`、`componentInteractions`、`envConfigUsage`（环境变量/配置文件使用）
- `factFieldsSchema`（字段名 + 中文标签 + 值类型 + 示例）成为**单一事实源**：注入规则生成 prompt、Schema v2 白名单、学生 evidence 展示三处共用
- 语言插件注册表驱动 syntax_check（§5.2），新增语言 = 新增插件 + 注册表条目，不动执行器核心

### 5.2 ruleExecutor 扩展（保持确定性，纯增量）

- 新增 `count_range`：`{path, regex, min, max, step}` 区间部分给分（借鉴 Submitty intComparison ge/le + partial_credit；"同一用例多宽容度给分"思路）——解决"正则命中=满分、没命中=0"的粒度问题
- `syntax_check` 参数化：`{dir, pattern, lang}`，lang 由插件注册表解析，默认 js
- 约束加强：`fact` 字段引用校验（生成期已拦截，执行器二次确认，防御规则被手工改坏）
- 57 个既有单测全部保留，新增部分给分边界测试

---

## 六、测试基建重构（P1-3）

**问题**：jest 单进程多套件复用 tree-sitter 原生模块 → 状态破坏（轮流失败、解析静默失效）；当前靠 npm test 三段式独立进程规避。

**方案（推荐 A，备选 B）**：
- A：jest 配置按套件分组运行（`projects` 拆分 tree-sitter 相关套件独立 worker 进程），npm test 单命令聚合，CI 可跑
- B：tree-sitter 加载改为 lazy + createRequire，每次解析新建 Parser 实例且不跨测试共享（呼应教训 4）

**新增测试**（随各阶段落地）：
1. Schema v2 校验器单测（合法/非法规则矩阵，含历史 v1 规则迁移兼容）
2. 校准流程模拟测试（mock LLM 固定输出，验证状态机全路径含 review 态）
3. 模板 golden tests（模板 × 评分标准 → 规则结构快照）
4. 改分信号聚合查询测试

---

## 七、数据模型变更（prisma）

| 变更 | 说明 |
|---|---|
| Question.checkerStatus | enum 扩展：`none|generating|calibrating|review|ready|failed`（`calibrating`/`review` 新增） |
| Question.checkerMeta | 扩展：{ rounds, rules, items, subjective, log[], defects[], review:{status,by,at}, bestDraft, threshold } |
| **新表 RuleVersion** | id, questionId, rulesJson(全量快照), status(draft/calibrated/review/active/archived), schemaVersion, reason, createdAt, createdBy；active 版本唯一 |
| **新表 StandardPackageDefect** | id, questionId, item(中文描述), evidence(标准包佐证路径), autoExempt(默认 true), createdAt |
| **新表 GradingOverrideSignal** | id, submissionId, questionId, ruleVersionHash, aiScore, finalScore, delta, teacherId, createdAt；`@@index([questionId, createdAt])` |
| **新表 QuestionTemplate** | code, name, groupsJson(骨架), factMappingJson, promptSnippet, lang, isActive |
| Submission | 不变（aiScore/aiFeedback/finalScore/reviewedAt 已满足）；新增索引 `@@index([questionId, finalScore])` 可选 |
| **迁移兼容**：既有 checkerScript（v1 格式）首次读取时自动升级为 v2 并落一条 RuleVersion（archived），历史成绩的明细展示走旧快照，不回写 |

---

## 八、分阶段实施计划（单人约 6 周，每阶段独立交付）

### 阶段 0：测试基建（0.5 周）——先行，防止后续改造被测试环境误伤
- 交付：jest 套件分组隔离；npm test 单命令全绿（787+）
- 验收：连续 5 次 npm test 无偶发失败；CI 模板可跑

### 阶段 1：Schema v2 + 规则版本化（1 周）
- 交付：schema 校验器（替代 validateRules 内联校验）、RuleVersion 表、v1→v2 迁移兼容、回滚 API
- 验收：非法规则生成即 failed 且日志含错误摘要；active 规则可回滚；全量回归通过

### 阶段 2：标准包降级 + 校准重构（1 周）——P0 攻坚
- 交付：缺陷注册表、并行多轮生成取最优、阈值校准、体检报告数据接口
- 验收：**题目 353 无需任何人工修正即 ready**（缺陷登记一次后自动豁免）；全班 59 人复测零波动（G2）
- 此阶段结束即达成"教师不再需要完美标准包"

### 阶段 3：教师确认层 + 改分信号回路（1 周）
- 交付：confirm API、规则摘要卡片前端、高级模式折叠编辑器、grading_override_signals 采集与聚合面板（界面细节见 §十一 界面改造方案）
- 验收：新教师（无技术背景）5 分钟内独立完成 1 题配置（G1）；改分信号落库并出聚合报告

### 阶段 4：模板库 + 语言扩展（2 周）
- 交付：3 个题型模板、factExtractor 插件化（js 重构 + ts 新增）、新事实字段、count_range 规则
- 验收：vue-frontend-crud 模板 3 题端到端；python 插件单测 + 1 题试用；fact 占比监控生效

### 阶段 5：收尾（0.5 周）
- 全量回归（含新测试）、性能复核（59 人 113 秒基线）、更新交接文档、check-layers 守卫复查

---

## 九、风险与回退

| 风险 | 缓解 | 回退 |
|---|---|---|
| 教师不信任"满分不由标准包决定" | 体检报告展示标准包得分与失分项；支持样例提交试评分 | threshold 可调回 100（旧行为） |
| 并行多轮生成成本上升（3×校准轮 LLM） | N 可配置（默认 3）；复用 ai_concurrency 并发；G3 成本统计把关 | N=1 即退回现状 |
| 模板过拟合/过于僵化 | 模板仅作骨架，AI 可增删 group；golden tests 防漂移 | 停用模板回到自由生成 |
| 缺陷注册表误豁免（漏判真实缺陷） | 豁免项仍进 review 列表由教师最终确认；改分信号可发现 | 一键取消豁免 |
| AI 生成非确定性（校准结果波动） | 每轮全量相同 prompt + 日志可复现；取最优而非首轮 | 保留 bestDraft 手工救回 |
| 迁移破坏历史明细 | v1 规则转 archived 快照，历史评分展示走旧快照 | 回滚迁移脚本 |

**回退机制**：所有新能力走特性开关（feature flags）；规则版本化保证任何时刻可一键回到旧规则重新评分；数据模型变更全部可逆迁移。

---

## 十、验收总清单（对照 G1-G5）

- [ ] G1：新教师 5 分钟内完成 1 题配置（评审演示，全程不接触 JSON）
- [ ] G1-UI：评分脚本四步向导、规则质量面板、审核页改分信号、学生端中文明细全部上线（§十一）
- [ ] G2：题目 353 重新生成（无需人工修正）→ ready；全班 59 人评分与历史结果一致、零波动
- [ ] G3：单题生成全流程 token 统计 ≤ 现状（137K×N 份提交的评分成本不增，生成成本单题 ≤3×8 轮）
- [ ] G4：学生端明细：逐条规则中文证据 + kind='checker'/'ai'，与规则版本 hash 对应
- [ ] G5：npm test 单命令全绿（787 + 新增），check-layers 0 违规
- [ ] 回归基线：并发 64 全班评分耗时 ≤113 秒
- [ ] 文档：本方案落地后更新 handoff，标注已解决 P0-1/P0-2/P1-3/P2-4/5/6/7


---

## 十一、界面改造方案（教师端 / 管理端 / 学生端）

> 依据现状：client/src/views/teacher/ProjectQuestionEdit.vue（评分脚本弹窗，现直接展示原始 JSON）、
> ProjectReviewNew.vue（审核页，已有 aiScore/finalScore 采纳与改分）、student/Scores.vue、student/Submit.vue。
> 原则：**默认界面只出现中文与按钮，JSON 只在"高级模式"出现**。

### 11.1 改造总览

| 页面（现有文件） | 现状 | 改造 |
|---|---|---|
| ProjectQuestionEdit.vue 评分脚本弹窗 | none/generating/ready/failed 四态；ready 后展示原始规则 JSON + 复制按钮 | **四步向导**：选模板 → 生成校准进度（含体检报告实时刷新）→ 规则摘要卡片确认 → 完成（可回滚） |
| 评分脚本弹窗 Step 1（简化） | 无 | 材料自动带入 + 项目类型自动检测提示（教师无任何选择项） |
| ProjectReviewNew.vue 审核页 | 明细按 kind 标签（检查/AI） | 规则中文证据（evidence_template/FACT_LABELS）；改分自动上报信号；顶部规则版本徽标 |
| 规则质量面板（新页面，teacher 菜单下） | 无 | 按 group 聚合改分信号 → 建议重生成 |
| student/Scores.vue、Submit.vue 明细 | kind 标签 | 中文证据 + 主观评语；hidden/show_message=never 项不渲染 |
| AiConfig.vue（管理端） | 仅并发配置 | 增加规则生成 N 轮、校准阈值（默认 90）、信号阈值配置 |

### 11.2 教师端核心界面：评分脚本弹窗三步向导

> 2026-08-18 修订：取消"材料与模板"步骤——教师不需要按项目类型做选择（目标：所有工程项目通用），
> 项目类型由系统从标准工程包自动检测并内部套用模板骨架（§4.4）。

**Step 1 · 开始（生成与校准）**
- 材料（评分标准、满分、标准工程包）已从题目表单自动带入，页面仅展示检测到的项目类型提示（如"已识别 Vue 前端工程，将自动套用对应规则骨架"）
- 唯一操作：点「生成评分脚本」→ 自动流转 generating → calibrating（不可手动关闭）
- **弹窗交互细则（2026-08-18 定稿，生成/校准阶段 2026-08-18 修订）**：
  - 内容超高时滚动条在弹窗体内滚动（body maxHeight 68vh + overflowY auto），不出现页面级滚动
  - 右上角 X 始终可关闭（含生成/校准阶段；ESC 仅在非生成阶段可用，遮罩点击始终不可关）
  - **右下角全程无「关闭」按钮**（含 Step1 开始阶段）：非完成阶段 footer 整体隐藏（footer=null，无按钮也无空白条）；仅完成阶段显示「完成」按钮；向导内不重复放置完成按钮（2026-08-18 二次修订，无头浏览器实测：STEP1/GENERATING/CALIBRATING/REVIEW 均 NO_FOOTER_BAR）
  - 报告标题为「标准包检查报告」，旁置问号图标，点击弹出解释弹窗（标准包≠满分答案的说明）
- 阶段文案 + 进度条："生成规则中…" → "标准包校准中（第 N 轮，得分 X/满分）…"
- 校准日志（保留现有"第 X 轮 得分"列表，样式沿用）
- 新增：**标准包体检报告**实时刷新表格：失分规则中文标签 | 失分 | 状态（失分 / 已知缺陷豁免 / 待教师确认）
- 失败态：错误摘要 + 最佳草案保留提示 + "重试"（走 §4.2 多轮生成）

**Step 2 · 确认**（review 态，新增）
- **规则摘要卡片**：按 group 分组卡片（组名 | 规则数 | 分值），点击展开单条明细（规则类型中文名 + 参数 + 分数 + 学生可见性）
- **体检报告操作列**：每行三个操作 —— `转主观` / `豁免` / `接受`（对应 confirm API 的 to_subjective / exempt / accept）
- 主按钮：`确认启用`（→ ready）/ `重新生成` / `放弃`
- 折叠链接："高级模式：查看/编辑 JSON"（CodeMirror 只读→可编辑，仅进阶教师/运维，编辑后重新走 Schema 校验）

**Step 3 · 完成**（ready）
- 成功提示 + 影响范围（"将按此规则（版本 v3）评分 N 名学生"）
- "回滚到上一版本"按钮（RuleVersion 历史列表选择器）

### 11.3 审核页改造（ProjectReviewNew.vue，Layer B 增强）

- **改分信号上报**：保存 finalScore 时若 ≠ aiScore → 随保存接口一并提交 delta（前端无额外交互，零成本采集）
- **明细渲染升级**：checker 项显示规则中文证据（evidence_template 模板渲染，缺失时回退 FACT_LABELS）；ai 项显示主观评语；kind 标签保留（检查/AI）
- **顶部信息条**：规则版本徽标（v3·hash 前 6 位）+ 提示链接"本组规则近 N 天被改分 M 次 → 查看规则质量"
- 采纳/改分交互不变（finalScore 输入框已有）

### 11.4 规则质量面板（新页面）

- 表格：题目 | group | 规则数 | 满分 | 被改分次数 | 平均 delta | 建议
- 建议规则：改分次数 ≥ 10 或平均 delta ≥ 3 → "⚠ 该组规则可能过严/过松，建议重生成"
- 行操作：`查看规则` → 跳转对应题 Step 3 重新确认；`忽略`（记录忽略，30 天内不再提示）

### 11.5 学生端明细（Scores.vue / Submit.vue）

- checker 项：规则中文证据 + 得分（如"工程缺少 Axios 统一封装 -3 分"），隐藏规则不渲染明细
- ai 项：主观评语原文
- 顶部：总分（aiScore）+ 规则版本说明（"本次评分规则 v3"）

### 11.6 新增/变更 API（checkerController 扩展或新 ruleController）

| API | 说明 |
|---|---|
| `GET /api/teacher/questions/:id/checker/templates` | 题型模板列表（**内部自动调用**，按标准包检测结果取用，教师侧无此接口交互） |
| `POST /api/teacher/questions/:id/checker/confirm` | { action: 'confirm'|'regenerate'|'to_subjective'|'exempt', itemIds?: string[] } |
| `POST /api/teacher/questions/:id/checker/rollback` | { ruleVersionId } 回滚到历史版本 |
| `POST /api/teacher/reviews/:id/finalize` | 审核保存（携带 finalScore；服务端检测 ≠ aiScore 时落 GradingOverrideSignal） |
| `GET /api/teacher/rule-quality?questionId=&group=` | 改分信号聚合（次数/平均 delta/建议） |
| `GET /api/teacher/questions/:id/checker/report` | 体检报告（标准包得分 + 失分项 + 豁免状态） |

### 11.7 前端实现约束

- 沿用 antd-vue 组件体系（a-modal/a-card/a-tag…），新增组件收敛到 `client/src/components/checker/`（RuleSummaryCard.vue、HealthReportTable.vue、TemplatePicker.vue、JsonEditor.vue 复用/包装现有 CodeEditor.vue）
- 状态机前端映射：none/generating/calibrating→Step1；review→Step2；ready→Step3；failed→Step1 错误态
- 轮询沿用现有 checkerTimer 模式，新增 report 接口同频刷新
- 学生端零路由变更；教师端新页面挂在现有 teacher 路由下
- 页面级特性开关（feature flags），未开时回退到现有 JSON 展示弹窗（灰度安全）

### 11.8 可交互原型（已落地，2026-08-18）

原型已按本节落地到 client/，**mock=true 时无需后端即可完整点击流程**（数据对齐题目 353 实测）：

| 文件 | 说明 |
|---|---|
| client/src/api/checker.js | 真实 API 封装 + mock 数据工厂（RULE_TYPE_LABELS / mockRules / mockHealthReport / mockVersions / mockRuleQuality） |
| client/src/components/checker/GenerateProgress.vue | Step1 生成/校准进度 + 校准日志 + 实时体检报告（只读） |
| client/src/components/checker/HealthReportTable.vue | 标准包体检报告表格（readonly / actionable 两态） |
| client/src/components/checker/RuleSummaryCard.vue | Step3 规则摘要卡片（按 group 折叠，规则类型中文标签） |
| client/src/components/checker/CheckerWizard.vue | **三步向导**容器：状态机 none→generating→calibrating→review→ready、项目类型自动检测提示（mock 显示"Vue 前端工程（自动检测）"）、mock 定时流程、体检报告操作（转主观/豁免/接受）、高级模式 JSON 编辑（Monaco + Schema 校验）、版本回滚（TemplatePicker 已按教师零选择原则移除） |
| client/src/views/teacher/RuleQuality.vue | 规则质量面板（改分信号聚合 + 建议重生成） |
| client/src/router/index.js / teacher/Layout.vue | 新增路由 /teacher/rule-quality + 菜单项"规则质量" |
| client/src/views/teacher/ProjectQuestionEdit.vue | 评分脚本弹窗内容替换为 CheckerWizard（mock=true） |

原型验证：`client` 下 `vite build --mode development` 通过（3715 modules）。

### 11.9 真实链路落地（2026-08-18 晚间，已切 mock=false）

- 后端 checkerService 落地：review 状态机（generating → calibrating → review → ready/failed）、
  置信度阈值（≥90）、体检报告（buildReport）、规则版本快照（appendVersion，回滚 API）、
  输入快照（inputsSnapshot：评分标准/满分/描述/标准包指纹）、题目描述参与生成提示词
  （material 字段，HTML 去标签）；confirm API（confirm/to_subjective/exempt/accept/update_rules/regenerate）
  与 rollback API 已实现并注册路由。
- **规则生成改用非思考模型**：`deepseek-chat`（env `DEEPSEEK_RULES_MODEL` 可覆盖）——
  实测 v4-flash（推理模型）的 reasoning_content 会挤占 max_tokens 16000 配额导致 content 为空
  （交接文档教训 2 复现）；deepseek-chat 单轮 ~20s 稳定产出。
- 前端：CheckerWizard 真实模式（applyState/refreshState/pollReal 轮询、确认/回滚/update_rules 走 API）、
  GenerateProgress 兼容真实日志字段（totalScore）、ProjectQuestionEdit 保存守卫
  （无脚本/生成中/review 未确认/输入变更/标准包更换 五类拦截 + 自动打开向导）、
  页面加载即拉取脚本状态（重进页面无需重新生成）。
- **实测（题目 353，真实 LLM）**：生成 → 校准 2 轮 94/100 → review（9 条失分项）
  → 豁免/转主观/确认 → ready（v1:active）→ 重进页面状态完整恢复。
  355（Java Spring）8 轮最高 81/100 → failed 保留最佳规则（符合预期：JS 事实提取器不适用 Java，P3 待做）。
- 回归：checker-service 35/35、rule-executor 57/57、fact-extractor 13/13（独立进程）。
  组合运行失败为既有 P1（tree-sitter 多套件状态破坏），非本次改动引入。

### 11.10 通用防幻觉（L1/L2，2026-08-18，面向所有语言类型）

355（Java Spring）曾卡 76/100 与 -1/100，根因三层，均已修复（全部为语言无关的通用逻辑）：
1. **AI 幻觉文件路径**（DataController.java 等不存在）→ validateRulePaths 路径白名单校验：
   规则引用的 path/dir 必须存在于标准包文件树（相对工程根），幻觉路径直接作为校准反馈，不浪费整轮；
2. **树文本与执行根不一致**：标准包外层目录（demo2/）前缀混入树文本，模型按树写路径而执行器按
   projectRoot 解析 → 树文本改为基于 resolveProjectRoot 结果生成（模型看到的 = 执行解析的）；
3. **模型字段漂移**（item 写成 name）→ parseCheckerRules 兼容 name 字段；objective/subjective 全空时
   给出明确字段提示（而非模糊的总和错误）。

配套：卡死检测（连续同分 ≥3 轮 → 下一轮全新生成，§4.2 轻量版）、失分反馈附文件开头片段
（enrichDeductionSnippets）、陈旧 generating/calibrating 状态（startedAt > 15 分钟）允许重新生成（防服务重启孤儿态）。

**实测（L1/L2 后）**：
- 355（Java Spring）：5 轮 → **100/100 ready**（此前卡 76 或 -1）；
- 353（Vue）：2 轮 → 95/100 review（3 条真实失分项：退出登录跳转/接口失败处理/Axios 封装）→ confirm ready；
- 结论：通用路径（文件树 + 文本规则 + 路径白名单）可支撑任意语言工程项目打分；
  事实提取插件（P3）只影响 fact 规则质量，不影响基础打分能力。

