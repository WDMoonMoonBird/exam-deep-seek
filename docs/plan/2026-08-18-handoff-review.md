# AI 实训题评分系统 — 方案、结果与待重构说明（交接文档）

> 生成日期：2026-08-18 ｜ 用途：交接给专业重构团队 ｜ 项目：Deadpan 判题系统（Exam-DeepSeek）
> 相关文档：docs/plan/2026-08-17-implementation-log.md（完整操作记录）、docs/plan/2026-08-17-project-context-v1.1.md（上下文管理方案）
> 配套方案：docs/plan/2026-08-18-refactor-plan.md（重构方案 v1.0，含 §十一 界面改造方案）——本文 §七 问题清单已逐条标注覆盖状态

---

## 一、业务背景与核心目标

在线考试系统含「实训题」（工程项目，如 Vue/Java 工程）AI 批改。学生提交完整工程 zip（系统自动过滤依赖），AI 对照标准工程包评分。

**核心痛点（本次工作要解决）**：
1. **评分不一致**：同一份代码多次评分波动 ±22~35 分（LLM 随机性，实测：同代码 90 vs 55、87 vs 63）
2. **评分异常**：推理模型 max_tokens 截断导致空输出（已修复，见下）
3. **成本**：每份提交全量 LLM 评分（137K tokens）

**最终目标**：同代码必同分（确定性）、批改低成本、可解释（明细可展示给学生）。

---

## 二、演进历程（五阶段，每阶段都有实测数据）

| 阶段 | 方案 | 结果 | 结论 |
|---|---|---|---|
| 1 | LLM 直接评分（思考模式 + max_tokens 8000） | 同代码波动 ±35 分；max_tokens 被思考 token 占满 → 空输出异常 | 不可用 |
| 2 | max_tokens 16000 + 重试 3 + 输出约束 | 评分异常消失；波动仍 ±22 分 | 稳定性不够 |
| 3 | 固定分项（从评分标准提炼 rubricItems 注入 prompt） | 同代码分项结构一致；分数波动收敛到 ±5 | 结构稳了，分数仍随机 |
| 4 | AI 生成 JS 检查脚本 + 标准包自举校准（13 次实验） | 脚本被模型"改坏"频繁（0 分/语法错误）；分数溢出 103/100 | AI 写代码不可靠 |
| 5 | **规则驱动（最终）**：AI 只生成 JSON 规则，执行器确定性计分 + tree-sitter 事实提取 | 同代码必同分；全班 59 人零波动 | ✅ 采用 |

---

## 三、当前方案架构（最终形态）

```
学生工程 zip → 依赖过滤（client/src/domain/uploadFilter.js，前端同款逻辑）
    ↓ 解压落盘 uploads/project-submissions/{题目}/{学生}/{版本}/
    ↓
【L0 过滤】buildGradingContext：全语言白名单 + 大小阈值 + 目录权重
    ↓
【事实提取器】factExtractor.js（tree-sitter，2026-08-18 新增）
    → 统一事实 JSON（19 字段：language/framework/dependencies/routes/routePaths/
      hasVueRouter/hasPinia/stores/apiCalls/hasAxiosWrapper/hasAxios/
      syntaxErrors/syntaxErrorFiles/components/vueFiles/jsFiles/...）
    ↓
【规则引擎】ruleExecutor.js（确定性计分，约束强制）
    - 规则类型：file_exists / dir_contains_file / contains_text / count_regex /
      contains_regex / file_count_in_dir / syntax_check（tree-sitter）/ fact（事实字段判断）
    - 强制约束：每项 score ≤ max_score；totalScore 只累加客观项；
      validateRules 拒绝"客观+主观总分 ≠ 满分"的规则
    ↓
【主观分项】（规则声明为 subjective 的项）→ LLM 单次小调用（温度 0，失败按 0 分不降级）
    ↓
评分结果写回 submissions 表（aiScore/aiFeedback，明细含 kind: 'checker'/'ai'）
```

**规则生成与校准**（checkerService.js，每题目一次，教师编辑页触发）：
1. AI 根据"评分标准 + 满分 + 固定分项(rubricItems) + 标准包文件树 + 事实字段 schema"生成 JSON 规则（非思考模式，温度 0.2，输出 max_tokens 16000）
2. 在标准工程包上执行规则 → 得分 < 满分 → 反馈扣分项（item+score+evidence）让 AI 修正规则参数（改 rule_type/params，不改计分逻辑）→ 重跑，≤8 轮
3. 达标 → ready；未达标 → failed（保留最佳规则）
4. **已知缺陷**：标准包不完美（见 §五），AI 自动校准从未到过 100 分，每次 ready 都依赖人工修正（缺陷项转主观）

---

## 四、生成脚本结果（题目 353「用户管理系统（前端）」）

### 4.1 规则概况（当前 DB 状态：用户手动测试重新生成后）

- **69 项客观规则**（9 个 group 对应评分标准 9 项：项目初始化与运行 9 / 路由与跳转 9 / 登录 18 / 注册 18 / Pinia 9 / 主页布局 14 / 个人信息 5 / 用户列表 9 / 代码规范 9）
- 规则类型分布：file_exists 8、contains_text 30、count_regex 3、contains_regex 28
- **校准记录**：92 → 94 → 94 × 6 轮（卡在 94，未满分）

### 4.2 卡在 94 分的根因（结构性，非生成器问题）

评分标准要求但标准包未实现（**标准包自身缺陷**）：

| 评分标准要求 | 标准包实际 | 分数 |
|---|---|---|
| Axios 封装统一基础地址 | 组件内直接 axios.get('http://203.0.113.10:3000/users')，无封装 | -3 |
| 对接口失败有兜底处理 | UserList.vue 仅 .then 无 .catch | -2 |
| 接口失败有兜底处理 | 同上 | -1 |

**结论**：规则按评分标准生成是"正确"的，标准包确实没做到 → 校准不可能满分。这是"标准包 = 满分答案"假设与教学现实的冲突：**教师的标准工程包通常是 90~95 分水平**。

### 4.3 曾经成功 ready 的版本（人工修正后）

- 3 项缺陷转主观分（subjective_items，由 LLM 评）→ 标准包客观项 94/94 满分 → ready
- 该版本全班评分结果见 §五

---

## 五、评分结果（全班 59 人实测，作业 311，并发 64）

### 5.1 最终版本（规则驱动 + 事实提取，ready 后）

| 包 | 人数 | 全员分数 | 耗时 | 失败 |
|---|---|---|---|---|
| 1.zip | 20 | **94**（零波动） | — | 0 |
| 2.zip | 20 | **94**（零波动） | — | 0 |
| 3.zip | 19 | **67**（零波动） | — | 0 |
| 合计 | 59 | — | 113 秒 | 0 |

- **同代码必同分**（1/2.zip 同包全员 94；3.zip 功能缺失被规则准确识别 67）
- 明细：69 项规则逐条（kind='checker'）+ 主观项（kind='ai'）

### 5.2 历史对比（各阶段同代码评分）

| 阶段 | 李芳02 vs 谢娜23（同代码） | 波动 |
|---|---|---|
| LLM 直接评分 | 90 vs 55 | ±35 |
| 固定分项 | 83 vs 78（隔次重评） | ±5 |
| 规则驱动 | 94 vs 94 | **0** |

### 5.3 并发配置

- 管理端 system_configs.ai_concurrency（当前 64）控制评分并发；实训题链路已接入（2026-08-17 修复，此前硬编码 3）
- 全班 59 份 113 秒（此前 LLM 时代 24 分钟/3 并发、100 秒/64 并发）

---

## 六、关键实现文件（服务器）

| 文件 | 职责 | 测试 |
|---|---|---|
| server/src/services/ruleExecutor.js | 规则引擎：7+1 规则类型、约束强制、fact 判断、syntax_check(tree-sitter) | 57 单测 |
| server/src/services/factExtractor.js | tree-sitter 事实提取（19 字段） | 13 单测 |
| server/src/services/checkerService.js | AI 生成规则 + 自举校准（状态机 none/generating/ready/failed） | 35 单测 |
| server/src/services/projectGrading.js | 评分链路：L0 过滤 → 检查器评分（gradeWithChecker）→ 主观分 → 降级 | 集成测试 |
| server/src/services/deepseek.js | LLM 调用（非思考模式规则生成/主观评分）、max_tokens 16000、重试、宽容 JSON 解析 | — |
| server/src/services/projectContextBuilder.js | L0 过滤/文件树/骨架/预算（早前方案，规则驱动后仍用于上下文构建） | 32 单测 |
| server/src/controllers/checkerController.js | GET/POST /api/teacher/questions/:id/checker(/:generate) | — |
| server/prisma/schema.prisma | questions 表新增：rubric_items / checker_script / checker_status / checker_meta | — |

**依赖**：@babel/parser（骨架）、tree-sitter + tree-sitter-javascript（事实提取）、jszip（前端过滤）。

---

## 七、待重构团队关注的问题（按优先级）

### P0 校准闭环缺陷
1. **"标准包满分"假设不成立**：标准包通常 90~95 分水平。建议改为"置信度阈值（≥90 ready）+ 失分项自动转主观"，或提供教师修补标准包的工具
　　【✅ 重构方案 §4.1 覆盖：标准包角色降级 + 置信度阈值 + 缺陷注册表自动豁免】
2. **校准收敛不稳**：8 轮上限内常原地踏步（92→94 后不动）。建议：多轮全新生成取最优（已验证比修正式稳定）+ 阈值就绪
　　【✅ 重构方案 §4.2 覆盖：并行多轮全新生成取最优 + 可复现日志】

### P1 测试基建
3. **jest 单进程多套件复用 tree-sitter 原生模块会状态破坏**（现象：轮流失败、解析静默失效）。当前用 npm test 三段式独立进程规避（package.json test 脚本）。重构建议：统一测试隔离策略或替换 tree-sitter 加载方式（createRequire/worker）
　　【✅ 重构方案 §6 覆盖：套件分组独立 worker 进程，npm test 单命令全绿】

### P2 已知限制
4. **.ts/.tsx 用 JS 文法解析**：TS 类型注解会计入 syntaxErrors（契约内已知限制，JSDoc 已标注）
　　【✅ 重构方案 §5.1 覆盖：tree-sitter-typescript 插件（阶段 4）】
5. **规则在线编辑缺失**：教师只能查看规则 JSON，不能微调（计划中的人工编辑入口未实现）
　　【✅ 重构方案 §4.3/§11.2 覆盖：自然语言确认层（教师不碰 JSON）+ 高级模式折叠 JSON 编辑器】
6. **fact 规则使用率低**：模型生成时倾向正则（contains_text 30 项 vs fact 0 项），事实提取的潜力未充分利用——prompt 需引导模型优先用 fact 规则
　　【✅ 重构方案 §4.4/§5.1 覆盖：模板内嵌 fact 示例 + 事实字段清单注入 + 占比监控】
7. **标准包缺陷处理依赖人工**：当前 ready 版本靠人工把缺陷项转主观
　　【✅ 重构方案 §4.1/§4.3 覆盖：缺陷注册表登记一次自动豁免 + 一键转主观】

### P3 扩展
8. Java/Python/Go 等语言支持：factExtractor 目前只有 tree-sitter-javascript；规则类型语法检查同样只覆盖 JS 系
　　【✅ 重构方案 §5.1 覆盖：语言插件架构（阶段 4）】
9. 更多事实字段（如 API 路由映射、组件交互）
　　【✅ 重构方案 §5.1 覆盖：apiRoutes/storeMutations/componentInteractions/envConfigUsage】

---

## 八、关键教训（重构时避免重蹈覆辙）

1. **AI 写代码（检查脚本）不可靠**：13 轮实验证明模型修改/生成 JS 脚本频繁引入新 bug；**规则驱动（AI 只产 JSON 参数）是正确方向**
2. **推理模型的 max_tokens 陷阱**：思考 token 占满配额导致空输出（finish=length, content=0）；长输出任务（生成脚本/规则）用非思考模式，评分用 16000
3. **LLM 随机性无法靠参数消除**：seed 无效（实测）、temperature 0 不完全复现；**唯一解法是减少 LLM 参与面**（确定性检查 + 主观分最小化）
4. **tree-sitter 共享 Parser 陷阱**：同一 Parser 连续 parse 旧树节点失效（缓冲复用）；每次新建实例 + 保持引用
5. **tree-sitter-vue（ABI 13）与 tree-sitter 0.25 二进制冲突**：移除，Vue 走 <script> 提取
6. **评分降级策略**：主观分失败不应丢弃确定性结果（改为该项 0 分）

---

## 九、数据与环境

- 测试库：exam_system_test（MySQL 8，root 密码见 server/.env DATABASE_URL）
- 本地：后端 3000、前端 5173；云端：PM2 exam-server/exam-worker（端口 50001，nginx /exam/）
- 全量回归：787/787（717 主套件 + 13 factExtractor + 57 ruleExecutor，三段独立进程）
- check-layers 依赖守卫：0 违规（63 文件）
- git：全部改动未提交（master，工作区约 20+ 文件）
