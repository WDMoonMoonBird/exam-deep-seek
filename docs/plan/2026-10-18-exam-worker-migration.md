# exam-worker 迁移计划（编程题评分 worker · 2026-10-18）

> 目标：把云端旧部署副本 `/var/www/exam/server` 的评分 worker，替换为仓库当前代码 `/var/www/exam-new/server/src/worker.js` + `infrastructure/worker/grading-worker.js`。
> 约束：不改变评分业务口径；不重复评分；可回滚；切换窗口低峰。

## 铁律（本计划的前提）

- **`exam-worker` 负责编程题（主观题、代码题）评分**；它对客观题的自动评分是既有实现的一部分。
- **`dsh-grader-worker` 负责实训题评分**。
- 两者是**并列的两条任务线，不是新旧替代关系**；不能把 `exam-worker` 当成“旧 worker/旧功能”，也不能用 DSH 代替编程题评分。
- 本计划讨论的“legacy”只指 `exam-worker` 代码里残留的 `projectSubmission` 项目评分分支（历史遗留，与 DSH 实训题重叠），**不是指 exam-worker 本身**。

## 0. 结论先行

- **不是简单复制文件**：旧目录模块路径、`.env`、回调端口、依赖均与新目录不同。
- 迁移范围分两块：
  1. **非实训题评分**（客观题/扁平客观题/主观题 AI）→ 必须保留，由新 worker 接管；
  2. **legacy 项目评分路径**（`projectSubmission` 的 machine/AST/AI 直评）→ **不再迁移**（见 §2），由 `dsh-grader-worker` 的实训题链路覆盖。
- 当前生产数据：`submission` 无 `submitted` 队列（draft 11 / ai_graded 2879 / published 210）；`project_submissions` **0 行** ⇒ 当前切换无在途评分，风险窗口低。
- 预计：**2–3 个工作日**（含 parity 验证/切换/观察），生产切换窗口约 1 小时。

## 1. 旧 worker 实际在做什么

旧进程：pm2 `exam-worker`，cwd `/var/www/exam/server`，入口 `src/worker.js` → `src/services/gradingWorker.js`（2026-08-16 快照，md5 `bd907a5d…`）。

### 1.1 编程题/客观题评分（保留，这是 exam-worker 的本职）

- 扫描 `submission.status='submitted'` 且 `question.type != 'project'`；主观题/代码题走 AI 评分，客观题走规则评分；
- 客观题 → `gradeObjectiveItems`；choice/multi_choice/judge/fill → `gradeFlatObjective`；
- 其余 → `gradeSubmission`（DeepSeek AI）；
- 写 `submission.aiScore/aiFeedback/status='ai_graded'/bestScore`；
- 通过 `POST /api/internal/graded` 通知主进程（当前旧端口 50001、旧 `INTERNAL_SECRET` 兜底）。

### 1.2 legacy 项目评分路径（不迁移）

- 扫描 `projectSubmission.status IN ('submitted','grading')`；
- 对每个提交：`gradeMachine`（机器/测试）+ `gradeAST`（Java AST）+ `gradeAI`（LLM）并行；
- 按 `machineWeight/astWeight/aiWeight`（默认 .3/.3/.4）算 total；
- 直接写 `projectSubmission.machineScore/.../totalScore/status='graded'`；
- 失败保留 `submitted` 并在 feedback 记录错误，等轮询重试。
- 这是**旧的直接项目评分**，不经过 `grading_jobs`；与 `dsh-grader-worker` 的实训题评分是两套链路。当前 `project_submissions` 0 行，但代码仍在。

## 2. 范围决策（重要）

- 按铁律：`exam-worker` **必须保留编程题评分**，不能整体下线；`dsh-grader-worker` 继续只负责实训题。
- `exam-worker` 代码里的 `projectSubmission` 项目评分分支是历史残留，与 DSH 职责重叠 ⇒ **新 worker 启动时关闭 `scanProjectSubmissions`**（env flag，默认 false），后续可删除；避免未来出现 project_submission 时双评分。
- 新 worker 只接管编程题/客观题评分；不接管实训题；旧 worker 仅作回滚副本。

## 3. 实施步骤

### Phase A · 差异审计（A，0.5 天）
- 逐项对比旧 `services/gradingWorker.js` 与新 `infrastructure/worker/grading-worker.js`：题型、status、分数归一、并发、回调、错误兜底。
- 确认 `dsh-grader-worker` 数据边界（grading_jobs / project_submissions）不重叠。
- 产出差异清单与“关闭 legacy project scan”的改动点。

### Phase B · 实现与测试（D/C，1 天）
- D：新增 `WORKER_ENABLE_PROJECT_SCAN=false` 开关；默认关闭；保留旧行为可用；不改非项目题型逻辑。
- C：在 `exam_system_test` seed 客观题、扁平客观题、主观题 AI、异常（找不到小题/AI 失败）；
  验证 DB 分数/status/bestScore、回调 200、并发/去重；同夹具用旧/新 worker 对拍，差异必须为 0 或有解释。
- C：全量测试 + worker 定向套件；确认 legacy project scan 关闭时零 projectSubmission 写入。

### Phase C · 部署与切换（Lead/D，低峰 1 小时）
1. 备份旧 worker 目录、pm2 配置、DB dump；
2. 新 worker 以 `/var/www/exam-new/server` 为 cwd 启动，name `exam-worker-next`：`PORT=3002`、新 `.env` 的 `INTERNAL_SECRET/DATABASE_URL`、`WORKER_ENABLE_PROJECT_SCAN=false`；
3. 先启动新 worker，观察日志与队列（此时不要启动旧 worker，避免双消费）；
4. 新 worker 写库/回调验证通过后，停旧 `exam-worker`；
5. 如失败：停新 worker，重启旧 worker（旧目录/旧 pm2 配置保留）。

### Phase D · 观察与收尾（Lead，24–48h）
- 监控：`submission` 队列、评分完成量、错误率、`/api/internal/graded` 调用；
- 稳定后：把 `exam-worker-next` 替换为正式 `exam-worker`；旧目录归档/下线；
- 更新 DEPLOY-CHECKLIST 与部署记录。

## 4. 验收标准

- 非项目题型评分成功率不低于旧版（同夹具 parity）；
- 回调到新主进程 200，无 403/连接失败；
- legacy project scan 关闭后，`projectSubmission` 无新增写入；
- 全量测试绿（或仅已登记 flake）；
- 可回滚：旧 worker 5 分钟内可恢复；
- 24–48h 无评分队列堆积/异常。

## 5. 风险

1. 新 worker 的 AI 输出/归一化与旧版有差异（需 parity）。
2. 旧 worker 回调端口/密钥本就失效；迁移后必须验证 3002 回调。
3. 若未来有 `project_submissions` 流入而 DSH 未覆盖，关闭 legacy scan 会导致项目提交无人评分 → 需产品确认 DSH 全量覆盖，并加监控。
4. 旧 `.env` 缺 `INTERNAL_SECRET`；新 worker 必须用新 env。
5. 双 worker 同时运行会重复评分 → 切换严格串行。
6. 没有 staging 环境时，用 `exam_system_test` 验证；生产 canary 用测试班级数据。

## 6. 分工

- A：差异审计、方案复核、切换后复核；
- D：新 worker flag/配置/启动脚本；
- C：parity 夹具、回调/队列断言、全量回归；
- Lead：备份、切换、监控、回滚、记录。

## 7. 待确认

- 是否确认 `dsh-grader-worker` 已覆盖所有实训题（含历史/重评）；
- 切换窗口（建议低峰，例如 12:00–13:00 或 18:00 后）；
- canary 用哪个测试班级/学生。
