# R2-A 施工单：平台侧接线最小增量（按 D 简报建议选项的**预案**）

## 摘要（≤10 行）
1. 本文件是**预案**：用户未拍板；每条末尾「改选→变化」写清另一分支怎么改。
2. 建议基线：① C 止血 + A 快照 ② 只交代码+迁移脚本（人工执行） ③ 新增 `dsh_grading_concurrency=1`、`ai_concurrency` 不动 ④ 凭据走 env ⑤ 不开 PTC。
3. 施工单 8 条（每条 ≤5 行：目标/路径锚点/验收命令/风险/改选分支），全部**由 B 实现**，A 只出单。
4. 回填规模本轮复算：`assignment_questions` × 实训题 = **31 行**；会被 C 拦截的题 = **3**；进行中作业 = **2**（无第三写入方：路由只有 `POST /assignments`，无 PUT 改链接）。
5. 迁移=4 列（`rubric_snapshot/material_snapshot/standard_hash/snapshot_origin`）+ 独立幂等回填脚本（默认 dry-run）；回滚=置 NULL 或 drop 列，代码侧一律 `snapshot ?? live`。
6. checker 消费：校验复用 `scripts/dsh-checker/validate.py`（CLI 打印 `checker_id=`），入库带 `checker_id`+**回写侧**带 `canonical_sha256`；`totals.score == null` 或 `stale:true` **一律不写分**。
7. 可比性表达：`(assignment_id, checker_id)` 为唯一可比组；批次 `comparability/1` 入库为作业级记录。
8. 依赖：**W6/W7 的写分部分必须等 t8（R1-C 独立验证）通过**；W1/W2/W3/W4/W5/W8 可并行。

## 1 施工单（8 条）
**W1 · C 止血：改题库前拦截「已被已截止作业引用的题」**（改选：不做 C → 删本条，直接 W2；只做 C 不做 A → 保留 W1+W3 兜底）
- 路径：`server/src/interface/http/controllers/teacher/questions.js:162`（updateQuestion，project 分支 `:173`，rubricItems 清空 `:185`）；查询用 `assignment_questions`+assignments.end_time。
- 验收：对被测的 3 道题 PUT rubric → 409 + 可判定 code；加 `?force=1`（仅管理员）可放行；单测覆盖「已截止引用」「进行中引用（放行+告警）」「未被引用（放行）」。
- 风险：打断教师改题流程；必须给 force/告警而非硬锁死。**不动** `server/src/services/projectGrading.js`。

**W2 · A 快照：发布时冻结 rubric/material/标准包哈希**（改选：选 B 不做 A → 删本条只做 W3；选 A 不回填历史 → 只给 2 个进行中作业写快照，29 行留空走 live）
- 路径：写入 `assignments.js:308/366-367`（题目已在 `:329` 查出）；读取 `projectGrading.js:457-460/507/520` 改为 snapshot ?? live；`rubricItems`（现缓存在 `schema.prisma:147`）一并进快照、读 `projectGrading.js:230-255`；显示型读者 `projectReviewController.js:100/141/236/284`、`infrastructure/review/project.js:48`、`studentController.js:538`。
- 验收：发布后每条链接 `SELECT COUNT(*) FROM assignment_questions WHERE rubric_snapshot IS NOT NULL` = 1；改题库后旧作业重评分数不变；日志出现 `snapshot=publish`。
- 风险：快照优先即「旧作业不随题库变」（预期行为，UI 需提示）；漏写会静默回落 live ⇒ 加断言。

**W3 · B 兜底：stale 检测（rubric/标准包哈希）**（改选：A+B 都做 → 本条退化为监控；只做 C → 本条是唯一防线）
- 路径：写 `projectGrading.js:613-624`（复用 ruleVersionHash 位点）增 `rubricHash/standardHash`；透出 `utils/projectView.js:26/96`；比对 `projectReviewController.js:169-220`（`:212` 入队前）。
- 验收：改 rubric 一字节 → 重评接口返回 stale 并需教师确认；不改则 `stale=false`；哈希口径与 `scripts/dsh-checker/check.py:412-433` 一致。
- 风险：只挡重评、不挡首评 ⇒ 必须与 W2 同时落地才算闭环。

**W4 · 新增 `dsh_grading_concurrency`（默认 1）**（改选：降 `ai_concurrency` → 只改 `system_configs` 一行（影响编程题）；决定共用 → 删本条，风险=抢 64 闸）
- 路径：`infrastructure/ai/deepseek/config.js:47` 旁加 getter（DB→env→默认 1）；白名单 `adminController.js:400/439/454-457/484`；实训题 `projectGrading.js:28/49/56-66/426` **零改动**。
- 验收：无键 ⇒ 并发=1 且日志打印键名；DB 置 3 ⇒ 1 分钟内生效；实训题日志仍为 64（未变）。
- 风险：双闸并存易误用 ⇒ 读取处注释「单位=会话数 vs 调用数」。

**W5 · 凭据走环境变量**（改选：改用 `.credentials.yaml` → spawn 后写文件+trap 删除，复用 `scripts/dsh-grader/lib.sh:183-202`、扫描 `:219-239`）
- 路径：新 `server/src/services/dshGraderRunner.js`，从 `config.js:44 getApiKey()` 取值放入子进程 env，**不落盘**。
- 验收：跑完 `grep -rn "sk-" <run-root>` 零命中；`<run-root>/home/.credentials.yaml` 不存在；日志只有 `key_len=`。
- 风险：env 可能被崩溃转储/子进程 env 打印 ⇒ 日志纪律 + 运行后扫描（两条都要）。

**W6 · 平台消费 checker.json**（改选：t8 未过 → 本条**阻塞**，不得开工）
- 读取 `<run-root>/out/checker.json` 与 `out/results/*.json`（run-root 由 `GRADER_RUN_ROOT` 注入）；校验用 `python3 scripts/dsh-checker/validate.py --checker <p>`（`validate.py:148-161` id 口径、`:288-294` 不一致即 reject、`:312` 打印 id）。
- 入库 `grading_checkers(checker_id PK, assignment_id, question_id, rubric_hash, standard_hash, checker_json, generated_session_id, created_at)`；`submissions` 加 `checker_id/canonical_sha256/grading_stale`。
- 写分：`totals.score→aiScore`、`items[]→aiFeedback.breakdown`（`projectGrading.js:603-611` 形状）；**`score===null`（unsupported>0，exit 6）或 `stale:true` ⇒ 不写分**。

**W7 · 作业级触发 + 队列 + 回写审计**（改选：先只做手动触发 → 去掉定时器，仅保留端点）
- 插入点：新端点 `POST /api/teacher/assignments/:id/grade`（`routes/teacher.js:47-50` 区）；**不**插入提交即评路径 `studentController.js:745`。
- 队列 `grading_jobs(id, assignment_id, checker_id, status, attempts, created_at)` + 唯一键 `(assignment_id, checker_id, status='pending')`；并发闸用 W4 的新键。
- 验收：连点两次只有 1 个 pending job；回写后 `SELECT checker_id, canonical_sha256` 与结果文件一致；教师 `finalScore` 不被覆盖（沿用 `projectReviewController.js:169-220` 语义）。

**W8 · 迁移与回填脚本（交付物，不执行）**（改选：授权窗口执行 → 追加「备份命令 + 回滚演练 + 窗口时间」三前置）
- 路径：`server/prisma/schema.prisma:226-236` 加 4 列 + 第 4 个 `server/prisma/migrations/*`；脚本建议 `scripts/r2-migrate/{backfill-snapshots,rollback-snapshots}.js`。
- 验收：`--dry-run` 打印 `matched=31`；`--apply` 后二次运行 `matched=0`（幂等）；`--rollback --dry-run` 打印将置 NULL 的行数。
- 风险：回填值是「迁移时刻」而非发布时刻 ⇒ 必须标 `snapshot_origin='backfill'`，**不得**声称历史重评逐位一致。

## 2 迁移脚本要点（幂等 + dry-run + 回滚）
| 项 | 设计 |
|---|---|
| DDL | `ALTER TABLE assignment_questions ADD rubric_snapshot JSON NULL, material_snapshot TEXT NULL, standard_hash VARCHAR(80) NULL, snapshot_origin VARCHAR(16) NULL`（4 列，均可空 ⇒ 兼容旧代码） |
| 回填 | `UPDATE … SET rubric_snapshot=q.scoring_rubric, material_snapshot=q.material, standard_hash=<标准包目录哈希>, snapshot_origin='backfill' WHERE aq.question_id=q.id AND q.type='project' AND aq.rubric_snapshot IS NULL AND aq.id IN (… LIMIT)` —— `… IS NULL` 保证幂等；分批 LIMIT 200 |
| dry-run | **默认 dry-run**，必须显式 `--apply` 才写；输出 `matched/updated/skipped` + 每行 `(assignment_id, question_id, rubric_sha256前12位)` 摘要（不回显 rubric 全文） |
| 规模（本轮复算） | matched=**31**（其中已截止作业 29、进行中 2）；不改 `submissions`(1601)/`questions`(32) |
| 判定标准包哈希 | 复用 `scripts/dsh-checker/validate.py:111-132 dir_sha256(root, ignore)`（与 checker.json 同口径，避免两套哈希） |
| 回滚 | 脚本 A：`UPDATE … SET rubric_snapshot=NULL,…`（不动 schema）；脚本 B：`ALTER TABLE … DROP COLUMN`。次序：先确认代码已上线 `snapshot ?? live` 分支 → 再 rollback 数据 → 最后 drop 列 |
| 回滚判据 | 回滚后：`SELECT COUNT(*) FROM assignment_questions WHERE rubric_snapshot IS NOT NULL` = 0；应用启动无 schema 报错；重评走 live 值并打印 `snapshot=live` |
| 前提 | 代码侧必须先有 fallback，否则 drop 列后 500；生产执行由用户/运维做（本流水线禁写库） |

## 3 平台如何消费 checker.json
| 环节 | 规则 | 证据锚点（本轮自数） |
|---|---|---|
| 读取 | `<run-root>/out/checker.json` + `<run-root>/out/results/*.json`；run-root 由 `GRADER_RUN_ROOT` 注入 | 装置约定（`scripts/dsh-grader/README.md:13-25`） |
| 校验 | `python3 scripts/dsh-checker/validate.py --checker <path>`；exit 0 且 stdout `checker_id=sha256:…` | `validate.py:22-42`（常量：T0/T1/params/aggregate/rounding）、`:148-161`（id 计算）、`:288-294`（mismatch 拒绝）、`:312`（CLI 打印） |
| 入库 | 表 `grading_checkers`：`checker_id PK / assignment_id / question_id / rubric_hash / standard_hash / checker_json / generated_session_id / created_at` | `validate.py:11-14`（覆盖与不覆盖字段） |
| 结果入库 | `submissions` 加 `checker_id CHAR(71)`、`canonical_sha256 CHAR(64)`、`grading_stale TINYINT(1)` | `check.py:342-354`（输出 schema）、`:436-441`（canonical/run_meta） |
| 不写分 | `reconciliation.unsupported` 非空 ⇒ `totals.score=null` 且 exit 6；`stale:true` ⇒ 无分 | `check.py:341-351`、`:425-433`、`:604-606` |
| 可比性 | 可比组 = `(assignment_id, checker_id)`；批次写 `comparability/1`（含 `zips_total/unique_digests/dedup_policy/groups`） | `check.py:485-500` |
| 幂等 | 同一 `(submission, checker_id)` 重跑覆盖写，另存 `grading_runs` 审计行（submission_id/checker_id/canonical_sha256/score/ran_at/actor） | `check.py:436-446 emit` |

## 4 触发与并发闸落点
- **读取处**：`infrastructure/ai/deepseek/config.js:47` 旁新增 `getDshGradingConcurrency()`（DB 优先 → env → 默认 **1**）；管理端白名单 `adminController.js:400/439/454-457/484`。
- **使用处**：新 DSH 批改模块内自建信号量（**不复用** `projectGrading.js:68-86`）；每次入队前刷新（对齐 `:426` 的 60s 热更新口径）。
- **边界（明确不共用）**：实训题链路继续读 `ai_concurrency`（`projectGrading.js:28/49/56-66/426` 本次零改动）；编程题/旧链路 `gradingWorker.js:24/134/253/258` 同样不动。两套闸的日志都必须打印**键名+值**。
- **作业级触发插入点**：新端点 `POST /api/teacher/assignments/:id/grade`（`routes/teacher.js:47-50` 区）；可选「截止后 N 分钟」定时器（新 worker，不放进 `gradingWorker.js:252-278` 的轮询主循环，避免耦合）。
- **不做**：不改 `studentController.js:745`（提交即评）与 `routes/student.js:15`。

## 5 审计与重评语义
- **重评 = 重跑已入库 checker，零 LLM**：`python3 scripts/dsh-checker/check.py --checker <入库 JSON> --submission <版本目录> --out <result.json>`（`check.py:515-528` CLI、`:35` 退出码 0/3/4/6）。
- **可复算判据**：同 `(checker_id, submission.digest)` 两次运行 `canonical_sha256` 必须相同（R1-A E1 口径）；平台把两次 hash 记进 `grading_runs`，不同即告警。
- **回写**：`aiScore` + `aiFeedback`（含 items）+ `checker_id` + `canonical_sha256`；教师 `finalScore` 不动。
- **stale 语义**：入库结果带 `stale:true` 时写 `grading_stale=1` + 不写分，教师端提示「尺子已过期，请重造」。
- **可比性**：任何成绩视图必须同时展示 `checker_id`（或"尺子版本"），跨 `checker_id` 禁止排名/汇总。

## 6 明确「不改什么」
1. 不执行学生提交的代码、不构建（不跑 `npm/node/vite/tsc`）；2. 不写生产库（迁移只交付脚本，执行由用户/运维）；3. 不动 `tests/`、`client/dist/`、`client/`；4. 不改 `scripts/dsh-grader/**` 与 `scripts/dsh-checker/**`（只调用）；5. 不碰 `~/.dsh/**`、不 kill DSH/Electron、不占 :5173/:3000/:19387；6. 不改 `studentController.js:745` 与 `gradingWorker.js` 现有轮询（避免回归）；7. 不引入新 npm 依赖（`prisma` 已在 `server/package.json`）。

## 7 依赖与前置
- **必须等 t8（R1-C 独立验证）通过**：W6 全条、W7 的「写分 + canonical_sha256」部分、以及任何"分数可复现"的对外声明。
- **可并行**：W1（C 拦截）、W2/W3（冻结）、W4（并发键）、W5（凭据）、W8（迁移脚本 dry-run 与回滚脚本）；这些不依赖 checker 的确定性结论。
- **人工前置**：① 用户拍板方案（本文件每条已给改选分支）② 迁移执行人 ③ 目标机内存基线量测（`ps -o rss=` 三条命令，D 简报 §3）。

## 8 锚点复算清单（本轮命令，锚点均为自数）
1. `grep -n 'model AssignmentQuestion|model Question|model Submission|scoring_rubric|rubric_items' server/prisma/schema.prisma` → `136/146/147/226/236/257`。
2. `grep -n 'export const createAssignment|assignmentQuestions: {|create: questionIds.map' .../teacher/assignments.js` → `308/366/367`；路由 `grep -n 'assignments' server/src/routes/teacher.js` → `47-50`（无 PUT 改链接）。
3. `grep -n 'export const updateQuestion|rubricItems: null|if (existing.type' .../teacher/questions.js` → `162/173/185`。
4. `grep -n 'getConcurrency,|let maxConcurrent|refreshConcurrency|enqueueProjectGrade|scoringRubric: true|ensureRubricItems|checkerReady|gradingMode|aiScore = Math.max|aiFeedback = JSON.stringify|updateEnvelopeGrading|prisma.submission.update|markFailed' server/src/services/projectGrading.js` → `28/49/56/422/426/453/459/507/510/514/594/603/613/628/652`。
5. `grep -n 'getApiKey|getConcurrency|getConfig' .../deepseek/config.js` → `32/44/47`；`grep -n ai_concurrency controllers/adminController.js` → `400/424/439/454/455/457/484`。
6. `grep -n 'regradeProjectSubmission|enqueueProjectGrade(id)|getProjectQuestionPromptPreview' controllers/projectReviewController.js` → `169/212/232`；`grep -n regrade|publish routes/teacher.js` → `66/67/69/74`。
7. `grep -n 'ruleVersionHash|parseProjectAnswer|serializeProjectAnswer' utils/projectView.js` → `14/26/41/96`。
8. checker 侧：`grep -n '^def |SCHEMA_VERSION|T0_RULE_TYPES|checker_id_of|ID_RE' scripts/dsh-checker/validate.py` 与 `grep -n 'EXIT_OK|SIX_STATES|def evaluate|schema_version|canonical_sha256|stale_check|comparability' scripts/dsh-checker/check.py`。
9. 回填规模（只读聚合，本轮重跑）：`assignment_questions`×实训题 = **31**；被已截止作业引用的在用实训题 = **3**；进行中作业 = **2**。
10. 本轮**未做**：写代码、改脚本、写库、模型调用、启动生产进程。