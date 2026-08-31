# Team C 作战手册 — 实验证据 + 冻结版本

> 分支铁律：只在 feature/rule-driven-scoring 分支操作。依据 docs/LLM_零配置自动评分系统方案(1).md §17/§25/§26。
> 前置：Team A、B 已交付。

## 目标

1. **方差实验**：同一批学生项目，LLM 直评（重复 N 次）vs 确定性规则评分，输出方差/标准差对比报告（RQ6 证据）
2. **冻结版本语义**：学生评分记录写入 ruleVersionHash（评分时锁定规则版本），改规则不影响历史成绩的版本归属

## 交付物

### 1. server/scripts/experiment-variance.mjs（新）
- 输入：作业 id（默认 311）→ 取该作业提交的工程目录列表
- LLM 直评：调用 server/src/services/deepseek.js 的 gradeProject（或其等价旧链路）对同一工程重复 N 次（N=5，可配），记录每次分数
- 确定性评分：调用 projectGrading 的规则评分链路（或 runRules）对该工程评一次（确定性，同分）
- 采样：默认取前 5~10 个工程（LLM 调用成本控制；可配 LIMIT）
- 输出 docs/experiments/variance-report.md：每个工程 { LLM: [87,92,76,94,83], mean, std, deterministic, Δstd } + 汇总（平均 std、波动区间、同分率）
- 真实 LLM 调用（本项目唯一允许真实调用的环节，由总控执行，脚本只负责编排与统计）

### 2. 冻结版本 hash（server/src/services/projectGrading.js + 相关写回）
- 评分写回 submission 的评分信封（answer 内 grading 段或 aiFeedback 元数据）时，记录本次评分使用的规则版本：
  `ruleVersionHash: <checker_meta.activeVersionId 或规则 JSON 的 sha1 前 12 位>`
- 查询/展示时可回显「评分规则版本 vN/hash」
- 兼容：无规则（LLM 直评遗留）或旧记录时该字段为 null，不影响现有流程

### 3. 单测
- projectGrading 冻结 hash 写回用例（mock 信封）
- 实验脚本的统计函数抽成纯函数（如 `summarizeVariance(samples)`）并单测（mean/std/Δ）

## 测试命令 / 角色流程 / 报告模板：同 Team A playbook 通用章节
## 文件所有权（团队 C）
- 可写：server/scripts/experiment-variance.mjs（新）、server/src/services/projectGrading.js（冻结 hash）、server/test/unit/infrastructure/project-grading.test.js（或新增）、docs/experiments/
- 只读：其余
- 禁止：切换分支、git clean、改 .env/uploads

## Exit Criteria（门禁）
- [ ] 实验脚本可运行（dry-run 模式不调 LLM 验证统计正确性；真实模式由总控执行）
- [ ] 冻结 hash 写回评分记录；旧记录兼容
- [ ] 三段式全量测试通过（含新增）
- [ ] 总控验收：311 作业 5 工程 × 5 次 LLM 直评实验完成，方差报告产出
