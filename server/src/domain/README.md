# 领域层 domain（P0 骨架，暂空）

**职责**：业务规则与不变量——分值校验、加权计算、异常答案判定、提交状态机、截止判定。

**允许依赖**：仅同层（domain 内部）与纯语言内置能力。

**禁止**：
- ❌ import 任何 npm 包（express / prisma / axios / pino …）
- ❌ import node 内置 IO（fs / path / child_process / http …）
- ❌ 相对路径指向 domain 之外
- ✅ 违反即 CI 失败（见 server/scripts/check-layers.mjs）

**落地路径**（P1 执行）：
- entities/ 实体与聚合：Submission, Question, Assignment, ReviewResult, Project …
- value-objects/ Score, GradingCriteria, SubmissionStatus …
- services/ ScoringService（自 server/src/utils/scoring.js 迁入并扩充）
- ports/ 仓储、AI 网关、执行器、通知、限流、事件总线、UoW 端口
- events/ 领域事件；errors/ DomainError 体系