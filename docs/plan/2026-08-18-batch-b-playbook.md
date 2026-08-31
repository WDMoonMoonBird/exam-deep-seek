# Team B 作战手册 — 评分项三分类 + 教师文案

> 分支铁律：只在 feature/rule-driven-scoring 分支操作。依据 docs/LLM_零配置自动评分系统方案(1).md §7/§8/§16。
> 前置：Team A 已交付负例验证（本团队不依赖其内部实现，但校准循环代码共存，改动冲突时以 A 的合入版本为基线）。

## 目标

1. **Rubric Analyzer 输出 automation_level 三分类**：deterministic / semi-deterministic / subjective
2. **Rule Generator 按分类引导**：deterministic 项必须生成可执行规则；subjective 项直接进主观项；semi 项规则提供证据 + LLM 有限解释
3. **教师文案**：前端「评分脚本」→「自动评分器」；隐藏技术词汇（AST/tree-sitter/正则）

## 交付物

### 1. summarizeRubricItems 升级（server/src/services/deepseek.js 或 checkerService.js 内调用方）
- 输出每项附加 automation_level 字段：
  `{ item, maxScore, automation_level: 'deterministic'|'semi'|'subjective' }`
- deterministic 判据（prompt 注入）：文件/目录存在性、是否使用某库（Router/Pinia）、CRUD/API 调用存在性、数量阈值、语法检查——均可静态证据化
- subjective 判据：代码设计合理、可读性、用户体验、架构清晰、美观
- semi：组件复用程度、健壮性等介于两者
- 比例引导：确定性 70~85%、主观 15~30%（prompt 提示，不硬约束）
- rubricItems 缓存结构兼容旧数据（旧项无 automation_level 时按 deterministic 兜底）

### 2. buildGenerateUserPrompt 按分类引导
- 固定分项段渲染时标注分类：`(确定性)` / `(半确定)` / `(主观)`
- 要求段新增：subjective 分类的项不得生成 objective 规则（应放 subjective_items）；deterministic 项必须全部生成可执行规则；semi 项允许规则+主观混合
- 校验：parseCheckerRules 后校验 subjective 分类项没有被写进 objective_items（有则作为校准反馈错误提示，用现有错误反馈通道）

### 3. 前端文案（client/src/，只改文案不改接口路径）
- ProjectQuestionEdit.vue：按钮「评分脚本」→「自动评分器」；弹窗标题同；就绪勾提示不变；「脚本校准失败」→「评分器生成失败」；「评分脚本生成中…」→「自动评分器生成中…」
- CheckerWizard.vue：步骤文案「生成与校准」保留；「重新生成」→「重新生成评分器」；message 文案同步
- RuleQuality.vue：面板标题文案「规则质量」保留（不强制改）
- 注意：a-tag 文案、popconfirm 描述、Step1 说明文字同步；后端 API 路径/字段一律不动

## 测试命令（三段式，同 Team A playbook）
## 角色流程 / 报告模板 / commit 规范：同 Team A playbook（docs/plan/2026-08-18-batch-a-playbook.md 通用章节）

## 文件所有权（团队 B）
- 可写：server/src/services/checkerService.js（Rubric Analyzer 分类与 prompt 引导）、server/src/services/deepseek.js（summarizeRubricItems 分类输出）、server/test/unit/infrastructure/rubric-items.test.js、checker-service.test.js（新增用例）、client/src/components/checker/*（仅文案）、client/src/views/teacher/ProjectQuestionEdit.vue（仅文案）
- 只读：ruleMutator.js、ruleExecutor.js、docs/plan/*、KNOWN_ISSUES.md
- 禁止：切换分支、git clean、改 .env/uploads、真实 LLM 调用

## Exit Criteria（门禁）
- [ ] summarizeRubricItems 输出三分类；旧 rubricItems 缓存兼容
- [ ] 生成 prompt 按分类引导；subjective 项不生成客观规则（校验通过）
- [ ] 前端文案全部替换为「自动评分器」，无「评分脚本」残留（grep 验证，接口路径除外）
- [ ] 三段式全量测试通过（含新增）
- [ ] 总控验收：353 真实生成一次，规则中主观项与分类一致
