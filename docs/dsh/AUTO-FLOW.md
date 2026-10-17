# 截止自动造尺 · 流程对齐说明（按用户流程）

> 目标流程（用户口径）：**教师布置作业 → 学生提交答案 → 作业截止后 dsh 生成一个会话，该会话全权负责该老师/该班级/该作业，生成一把「尺」→ 下次再布置相同的作业，直接调用这把尺。**
>
> 本文只描述这条流程怎么落地；**分数是否「对」不在本轮范围**（尺子结构合规、同码同分、可复算即可）。
> 对应 LEDGER：F1–F8、F10（实现：D1）。

## 1. 之前断在哪（三处硬缺口）

| 缺口 | 事实 | 后果 |
|---|---|---|
| **没有截止触发** | 全仓 `cron` = 0；`POST /teacher/assignments/:id/grade` 在 client 侧 0 调用 | 截止后什么都不会发生 |
| **worker 不会造尺** | `run.sh` 默认 `CHECKER_MODE=per-submission`；worker 部署参数没有 `--checker-mode build-and-measure` | 即使建了 job，也不会产出作业级尺子 |
| **全新作业没有物料** | worker 只「解析」`DSH_GRADER_MATERIALS_ROOT/<assignmentId>`，目录缺失即 `materials_missing` | 自动造尺第一步就 fail-closed |

另有一处**可见性缺口**：消费端 `buildWriteback` 只写 `aiScore/aiFeedback/checkerId/canonicalSha256`，不写 `status` ⇒ 分数已落库，教师端仍显示「待评分」。

## 2. 现在的流程（代码路径）

```
教师布置作业（既有）
  → 学生提交（★D5：只入库 status=submitted / aiScore=null，**不触发评分**）
  → 作业截止
  → dsh-grader-worker 常驻循环（runWorkerLoop）按 DSH_AUTO_GRADE_SCAN_MS（默认 60s）调用 scanDueAssignments
       SELECT 已截止（UTC_TIMESTAMP）/ 7 天回看 / 恰好一道 project 题 / standard_hash 非空 /
              有非草稿提交 / 还没有任何 grading_jobs 的作业（limit 默认 20）
       → 建一个 pending job（checker_id = '__AUTO_BUILD__' 哨兵）
  → worker runOnce 领取该 job
       → logSessionScope：SESSION_SCOPE assignment=… teacher=… classes=… job=…
       → ensureMaterialsForAssignment（F4）：目录缺失/不完整才导出（r2b20 同源；tmp 目录 → rename 换位）
       → resolveRulerForAssignment(mode=build)
            ├─ 同内容尺子 ready  ⇒ reuse（零 LLM，量尺）      ← 「下次同作业直接调用这把尺」
            └─ 没有尺子          ⇒ claim + 造尺一次（claimed_here）
       → 装置参数切 --checker-mode build-and-measure（F3）
       → consumeChecker → completeClaimedRuler → bind（assignment_question_rulers）
       → job.checker_id 从哨兵对齐到真实尺子（失败重试一次并写 last_error）
       → 回写：aiScore/aiFeedback/checker_id/canonical_sha256 + **status=ai_graded**（F5）
  → 教师端「评分审核」显示「待审核」，教师审核/发布
```

### 2.1 「该会话全权负责该老师/该班级/该作业」

- job 以 **assignmentId** 为唯一作用域；assignment 本身带 `teacherId` 与班级关联。
- worker 领取后先打印 `SESSION_SCOPE assignment=… teacher=… classes=… title=… job=…`（F7）。
- 物料目录是 `<materialsRoot>/<assignmentId>`，run-root 是 `r2b4-job-<jobId>-…`，会话只看到该作业的物料。
- 不新增业务表：用既有 `grading_jobs` + `grading_job_runs` 作为会话记录；哨兵 checker_id 只用于在拿真尺前占住活动键。
- R1（Wave 3）只给 `grading_jobs` 加 **生成列 + 唯一索引**（迁移 `20261017123000_r1_grading_jobs_active_assignment`，无新表），
  使「每作业一个活动 job」由 DB 强制（见 §2.3）。

### 2.2 幂等与边界

- **每个作业最多自动跑一次**：扫描条件含 `NOT EXISTS (SELECT 1 FROM grading_jobs WHERE assignment_id=a.id)`（含失败/终态行）。
- **提交不直接评分（D5）**：学生提交实训题只入库（`submitted` / `aiScore=null`），**不再** `enqueueProjectGrade`；
  统一在**截止后**由扫描器建 `__AUTO_BUILD__` job → DSH 造尺/复用/评分。教师/管理员手动重评仍是兜底（review-ops 显式触发）。
- **失败不自动重试**（★含义）：造尺失败/装置超时/物料导出失败后，扫描器不会再次自动建 job；需教师/运维显式重试：
  `POST /teacher/assignments/:id/grade`（无可用尺子时会自动建 build job，不再 409）。
- 回看窗口默认 **7 天**（`DSH_AUTO_GRADE_LOOKBACK_DAYS`），避免首次部署把历史作业一次性全排。
- 只有「有发布冻结快照」（`assignment_questions.standard_hash` 非 NULL 且非空串）且**恰好一道** project 题的作业才自动跑；
  0 道/多道都会在内容解析与物料导出处 fail-closed ⇒ 扫描器直接排除（不占「每作业一次」的名额）。
- 同一内容跨班/跨教师复用同一把尺（`grading_rulers.content_key` 全局唯一）；如果要做「按班不同宽严」，需要改 content_key 口径，属另一个决策。
- **物料导出策略（F4）**：只在**自动造尺 job**里做；目标目录已存在且三件套（`标准工程包.zip`/`评分标准.md`/`题目描述.md`）齐全 ⇒ 跳过（不覆盖运维已导出件）。
  作业**重新发布**（内容变化）后需设 `DSH_GRADER_MATERIALS_REEXPORT=1`（对自动 job 强制重导出），或删掉该作业物料目录。
- **--reuse-checker 不影响自动 job 造尺**：该开关只约束普通 job（只许复用）；自动造尺 job 仍走 build 流程
  （否则峰谷窗口形态 `--reuse-checker` 下新作业永远造不出尺）。启动日志 `AUTO_GRADE_BUILD_OVERRIDE=on` 会显式提示。

### 2.3 活动键：DB 级强制（★R1 已落地，Wave 3）

- **两层唯一约束（都在 DB）**：
  1. 旧 `active_key = CONCAT(assignment_id, ':', checker_id)`（迁移 `20261012030000_r2b12_grading_jobs_active_key`）：
     活动态每 `(assignment, checker)` 至多一行；**保留，不删除**。
  2. ★R1 新 `active_assignment_key = CASE WHEN status IN ('pending','running') THEN assignment_id ELSE NULL END STORED`
     + UNIQUE `uniq_grading_jobs_active_assignment`（迁移 `20261017123000_r1_grading_jobs_active_assignment`）：
     活动态**每 assignment 至多一行**（终态为 NULL ⇒ 可多行共存）。
- **并发竞态已消除**：扫描器与手动触发即使同时读到「无活动 job」，第二个 INSERT 也会被 DB 拒绝（P2002）：
  控制器返回既有 job（`reused=true`），扫描器记 `skipped=active_job_exists`。应用层 findFirst / 建前复查保留，
  仅作为「少打一次 P2002」的优化（不再是正确性依赖）。
- **迁移防呆**：migration 先建临时表 `_r1_active_guard(assignment_id PK)` 并 `INSERT ... SELECT` 活动态 assignment_id；
  库中已有重复 ⇒ 1062 失败，**结构零改动**（临时表随连接关闭消失）；干净才继续 ADD COLUMN + CREATE UNIQUE INDEX。
- **前置检查 / 重复处置**：`node server/scripts/check-r1-active-jobs.mjs`（只读；`--json`；0=干净 / 1=有重复 / 2=错误）；
  有重复时保留最新一条、其余置 `failed`（`last_error='superseded_by_r1_migration'`）后重试。
- 自动 job 若在 `job.checker_id` 对齐真实尺子时失败（DB 异常），会重试一次；仍失败则 `last_error` 记录
  `ruler_job_checker_align_failed:<reason>（打分已完成；真实 checker=…，job.checker_id 仍为 __AUTO_BUILD__）`，
  管理员端按「自动造尺」兜底显示（D2）。

## 3. 实现对照（F1–F10）

| 编号 | 落点（file） | 关键行为 |
|---|---|---|
| F1 | `server/src/infrastructure/dsh/worker/dueAssignmentScanner.js` | UTC 时间、7 天回看、limit、standard_hash 非空、非草稿提交、恰好一道 project 题、无既有 job |
| F2 | `.../worker/dshGradingWorkerRuntime.js` + `server/scripts/r2b5-worker.mjs` | 循环按间隔调用扫描；扫描抛错只告警、不终止循环；`DSH_AUTO_GRADE=0` 关闭 |
| F3 | `.../worker/device-args.js` | `withBuildCheckerArgs`：剥离旧 `--checker/--checker-mode`，追加 `--checker-mode build-and-measure` |
| F4 | `.../worker/autoBuildSession.js`（`ensureMaterialsForAssignment`）+ `server/scripts/r2b20-export-materials.mjs` | 自动 job 在解析尺子**之前**导出物料（同源、tmp→rename、失败 needs_rerun 不写分） |
| F5 | `server/src/infrastructure/dsh/checker/dshCheckerConsumer.js` | `buildWriteback` 增加 `status=ai_graded`；`reviewed/published` 不降级 |
| F6 | `server/src/controllers/assignmentGradingController.js` | 无可用尺子（missing/no_ruler_source/ruler_failed:*）⇒ 建哨兵 build job（不再 409）；活动 job 按作业判重 |
| F7 | `.../worker/autoBuild.js` + `autoBuildSession.js` | `SESSION_SCOPE` 记录作业/教师/班级 |
| F8 | `server/scripts/backfill-ruler-status.mjs` | 默认 dry-run；`--apply` 只把匹配行 status 推进到 `ai_graded` |
| F10 | 本文 | 部署/验证/回填/回滚 |
| 配置 | `.../worker/dueAssignmentScanner.js`（`resolveAutoGradeConfig`）、`dshGradingWorkerRuntime.js` | env 默认值与边界（1–90 天、1–100 条、≥5s 间隔） |

## 4. 配置

| env | 默认 | 说明 |
|---|---|---|
| `DSH_AUTO_GRADE` | `1` | `0` = 关闭截止自动触发（扫描 + 建 job） |
| `DSH_AUTO_GRADE_LOOKBACK_DAYS` | `7` | 只回看最近 N 天截止的作业（1–90） |
| `DSH_AUTO_GRADE_SCAN_MS` | `60000` | 扫描间隔（≥5000；仅常驻模式有意义） |
| `DSH_AUTO_GRADE_LIMIT` | `20` | 单次扫描最多建几个 job（1–100） |
| `DSH_GRADER_MATERIALS_ROOT` | 未设 | **必须设**（生产 `/var/lib/dsh-grader/materials`，worker 用户可写）；否则不自动导出物料 |
| `DSH_GRADER_MATERIALS_REEXPORT` | 未设 | `1` = 自动 job 强制重导出该作业物料（重新发布后使用） |
| `DSH_BUILD_TIMEOUT_MS` | `1200000` | 造尺 job 的装置超时（纯量尺仍用 `--timeout-ms`） |
| `DSH_GRADER_UPLOADS_ROOT` | 未设 | 物料/标准包上传根重定位（演练/测试用；生产不设） |

worker 启动日志会打印：
```
AUTO_GRADE=on lookback_days=7 scan_ms=60000 limit=20 schedule=daemon|once
AUTO_GRADE_BUILD_OVERRIDE=on ...      # 仅当同时带 --reuse-checker
```

## 5. 部署 / 验证

### 5.1 启动命令（唯一扫描入口：`server/scripts/r2b5-worker.mjs`）

> 不要用 `npm run worker` —— 那是 legacy `src/worker.js`，没有扫描/自动造尺接线。

常驻（推荐；截止后 ≤60s 触发、可连续消费多个 job）：
```bash
cd /srv/exam/server          # 按部署路径改；WorkingDirectory 必须是 server/
node scripts/r2b5-worker.mjs \
  --db-url "$DATABASE_URL" --allow-db exam_system --allow-prod \
  --device bash --device-arg scripts/dsh-grader/run.sh \
  --device-arg --submissions --device-arg "$GRADER_SUBMISSIONS" --device-arg --allow-identical
```

峰谷窗口（现有 systemd `Type=oneshot` + timer 形态）：`--once` 下循环只跑 1 轮 ⇒ **每个窗口扫描一次、最多消费 1 个 job**；
截止触发延迟 = 窗口间隔。保留 `--reuse-checker` 也可以（自动 job 仍会造尺，见 §2.2）。
部署后如需「截止即批」，请切换到常驻形态（`systemctl disable --now dsh-grader-worker.timer`）。

### 5.2 首次造尺（全新作业）验证

1. 造一个满足条件的作业：**已截止 + ≥1 份非草稿提交 + 恰好一道实训题 + 已发布（standard_hash 非空）+ 无任何 grading_jobs**。
2. 等日志（常驻 ≤60s / 窗口到点）：
   ```
   AUTO_GRADE_ENQUEUE assignment=… teacher=… job=… checker=__AUTO_BUILD__ end=…
   AUTO_BUILD_SESSION assignment=… job=… checker=__AUTO_BUILD__
   SESSION_SCOPE assignment=… teacher=… classes=… title=… job=…
   MATERIALS_EXPORTED assignment=… n=… question=… out=…            # 或 MATERIALS_PREEXISTING（目录已存在）
   RULER_RESOLVE=claimed_here content_key=… job=…（本次装置流程造尺一次）
   RULER_BUILT … / RULER_BOUND=yes
   RULER_JOB_CHECKER_ALIGNED job=… to=<真实 checker_id>
   ```
3. DB 检查：
   ```sql
   SELECT id,status,checker_id,written_count,LEFT(last_error,80) FROM grading_jobs ORDER BY id DESC LIMIT 3;
   -- 期望：status=done；checker_id 为真实 checker（不再是 __AUTO_BUILD__）
   SELECT status,COUNT(*) FROM submissions WHERE assignment_id=<id> GROUP BY status;
   -- 期望：ai_graded（reviewed/published 的不会被降级）
   ```
4. 教师端「评分审核」该作业应从「待评分」变为「待审核」。

### 5.3 同作业/同内容复用（零 LLM）验证

再建一个**同内容**作业（同题、同 rubric/标准包）并让它截止：
- 日志应出现 `RULER_RESOLVE=reuse`（或 adopted/built 复用命中）+ `CHECKER_REUSE=applied … via=ruler_content_key`；
- **不出现**新的 `RULER_BUILT` / 造尺会话；`grading_rulers` 行数不变（同 content_key 只 1 行）；
- `MODEL_CALLS=0`（装置侧自报）/ job `done` 且 `written_count>0`。

### 5.4 失败路径（fail-closed，不写分）

| 现象 | 日志/DB | 处置 |
|---|---|---|
| 未设 `DSH_GRADER_MATERIALS_ROOT` | 无 `MATERIALS_EXPORTED`；按装置默认源目录（生产不建议） | 配 env 后重启 worker |
| 物料导出失败 | `MATERIALS_EXPORT_FAILED assignment=… reason=…`；job `needs_rerun`、`last_error=materials_export_failed:…` | 修原因（标准包/提交源/权限）后手工触发 |
| 装置超时/exit≠0 | job `needs_rerun`/`failed`，`last_error=device_exit_*` | 手工触发重试 |
| 上次造尺 failed | 手工触发不再 409 ⇒ 自动建 build job（store 允许重试 failed） | 直接重试 |
| 内容/绑定冲突 | `RULER_RESOLVE=fail_closed`；409 `RULER_BIND_CONFLICT` | 人工处置（不得静默换尺） |

> 失败后**不会**自动重试（§2.2）；重试用 `POST /teacher/assignments/:id/grade`。

### 5.5 管理员批改记录（D2 / t7）

页面：`/admin/grading-runs`（菜单「批改记录」；仅 **super_admin**，teacher/student 进不去）。**只读**：只有 GET，无任何写操作。

**列表数据源（D2 起）**＝以下四类合并（都带 assignment / teacher / classes / checker / status / counts / cost 列）：

| 来源 | type | run_kind | 说明 |
|---|---|---|---|
| `grading_job_runs` 行 | worker | build/reuse/worker | 正常批改运行 |
| 造尺归档 `runs/build-<aid>-<ts>` | build | build | 旧造尺脚本归档 |
| `grading_jobs` 中**没有 run 行/没有归档**的旧任务 | worker | build/reuse/worker | ★实验2 80 份若缺 run 行，靠这一行可见（只读合成，不写库） |
| 存量 ready 尺子 × 作业绑定（该 checker 确有写分） | ruler | ruler | ★「ruler 4」这类存量尺子记录；无 job 行时兜底可见 |

- **run_kind 判定**（只读）：`grading_rulers.source_run_id = job.id` ⇒ `build`；同 content_key 的尺子由别的运行造出 ⇒ `reuse`；无内容键的旧任务 ⇒ `worker`；合成尺子记录 ⇒ `ruler`。
- **A1-R2 兜底**：`job.checker_id` 仍是 `__AUTO_BUILD__`（对齐失败）时，列表/详情显示「自动造尺（未对齐）」，不显示裸哨兵、不崩。
- **D5 补列（管理员可验收）**：`status` 来自 `grading_jobs.status`（`grading_job_runs` 无 status 列，D2-D5 期间显示空白）；`content_key` / `ruler_id` / `ruler_status` 来自任务行 + `grading_rulers`；
  只有归档、DB 行已清理的历史目录标记 `historical_archive_only=true`（详情 `notice` 说明），不再伪装成一次新的批改。
  status 过滤改为合并后在内存过滤（此前把 status 塞进 `grading_job_runs` SQL 会 1054 导致整表退化为空）。
- **详情**：老师/班级/作业/尺子/会话 teardown/用量/逐份结果；归档被清理（旧运行）时提示「无归档」，逐份结果从数据库按 `(assignment, checker)` 兜底（**只取学生名/分数/尺子归属，不含答题全文**），并标注 `submissions_source=db_by_checker`。
- **不泄露/不改分**：页面无写操作；读模型只 SELECT；逐份结果不含 answer；DB 兜底只读 `submissions.ai_score`。

存量记录两种可见方式（二选一即可，默认第一种已生效）：

1. **read-model 只读合成**（默认，无需写库）：上面的第 3/4 类来源。
2. **可选物化**（给其它只读 `grading_job_runs` 的消费方）：`server/scripts/backfill-admin-grading-runs.mjs` —— 只 INSERT 缺失的 run 行，不改分：
   ```bash
   cd server
   node scripts/backfill-admin-grading-runs.mjs                 # dry-run：统计候选（有 job 行、无 run 行）
   node scripts/backfill-admin-grading-runs.mjs --apply         # 真写：仅 grading_job_runs
   node scripts/backfill-admin-grading-runs.mjs --apply --assignment 15 --limit 200
   ```
   > 回填行的 `measured/unmeasurable` 无旧证据 ⇒ 置 0 并在 `run_dir/teardown_json` 标记 `backfill:grading_jobs`；
   > `written/skipped` 来自 `grading_jobs`；`submissions` 与 `grading_jobs` 一律不动（可用 `--assignment` 限定实验2 的 15/16）。

验证（本机/生产同口径）：
```sql
-- 应看到「有 job 行但没有 run 行」的旧任务（管理员页 D2 起也能看到）
SELECT j.id,j.assignment_id,j.status,j.written_count,j.skipped_count
FROM grading_jobs j LEFT JOIN grading_job_runs r ON r.job_id=j.id WHERE r.job_id IS NULL;
-- 存量尺子记录候选（ruler 4 一类）
SELECT r.id,r.checker_id,r.status,b.assignment_id FROM grading_rulers r
JOIN assignment_question_rulers b ON b.ruler_id=r.id WHERE r.status='ready';
```
页面验收：管理员登录 → /admin/grading-runs → 列表出现「运行类型=造尺（build）/复用（reuse）」行；实验2 的 15/16 能看到作业/老师/班级/尺子/已写分；点开详情可见老师、班级、逐份结果（无答题全文）。

### 5.6 R1 迁移（Wave 3）：preflight → apply → 回滚

> 目标：把「每作业一个活动 job」升级为 DB 强制（迁移 `20261017123000_r1_grading_jobs_active_assignment`）。
> **生产库只读 preflight；apply 由授权窗口执行**（本仓只承诺测试库 `exam_system_test` 已应用）。

```bash
# ① preflight（只读；默认读 server/.env 的 DATABASE_URL，也可 --db-url）
node server/scripts/check-r1-active-jobs.mjs            # exit 0=干净 / 1=有重复 / 2=参数或连接错误
node server/scripts/check-r1-active-jobs.mjs --json     # 机器可读（active/duplicate_groups/schema.column/schema.index）

# ② 应用（测试库示例；生产先把 URL 换成生产并确认 preflight=0）
cd server
DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | sed 's#/exam_system#/exam_system_test#')" npx prisma migrate deploy

# ③ 回滚（停 worker 后执行；旧 active_key 不受影响）
DATABASE_URL="…" npx prisma db execute --file prisma/migrations/20261017123000_r1_grading_jobs_active_assignment/rollback.sql --schema prisma/schema.prisma
```

- 迁移防呆：guard 冲突（已有重复活动 assignment）⇒ 1062 失败、**结构零改动**；按 preflight 输出归并后重试。
- 测试库预置：若 `prisma migrate deploy` 提示其它「列已存在但未登记」的历史迁移（本地手工同步过），
  可用 `npx prisma migrate resolve --applied <name>` 基线化（只动测试库的 `_prisma_migrations`）。

### 5.7 提交不再自动评分（D5 / t39）

**旧行为（D5 前，违反需求）**：`POST /student/assignments/:id/project/:questionId/submit` 在写库后调用
`enqueueProjectGrade(saved.id)` ⇒ 提交即异步 AI 评分（生产 24/25 在截止前 15:04 已有 86/97/94/90）。

**现行为（D5 起）**：

| 阶段 | 学生提交 | submissions | grading_jobs | DSH 会话 |
|---|---|---|---|---|
| 截止前 | 200 + 文件树（只落盘/写库） | `status=submitted`、`ai_score=null`、`ai_feedback=null` | 无 | 无 |
| 截止后（≤60s 扫描） | — | 仍 submitted（待评分） | 新增 1 个 `__AUTO_BUILD__` job（每作业一个活动 job，R1 DB 强制） | 首次：build-and-measure 造尺；同 content_key：reuse（零 LLM） |
| 评分完成 | — | `status=ai_graded` + ai_score/ai_feedback/checker_id | job `done` + `grading_job_runs` | 管理员页可见（作业/老师/班级/尺子/状态/计数/费用） |

- 代码点：`server/src/interface/http/controllers/student/project-submit.js`（已删除 enqueue 调用/import）；评分只走 worker。
- 手动兜底：教师/管理员「重新评分」链路（`infrastructure/review/project-review-ops.js`）仍调用 `enqueueProjectGrade`，但那是显式人工动作。
- 历史数据：D5 前「提交即评分」写入的旧分不会被自动清除；如某作业仍需重新走 DSH，可让教师手动重评，或由运维按流程处理（不在本任务范围）。
- 验证（截止前/后）：
  ```sql
  -- 截止前：应无 AI 分
  SELECT id,status,ai_score,checker_id FROM submissions WHERE assignment_id=?;
  -- 截止后 job done：应为 ai_graded 且 checker_id = grading_rulers.checker_id
  SELECT j.id,j.status,j.written_count,r.checker_id FROM grading_jobs j
  LEFT JOIN grading_rulers r ON r.content_key=j.content_key WHERE j.assignment_id=?;
  ```

## 6. 存量 80 份（实验 2）的一次性状态回填

实验 2 的两班 80 份在 10-13 已由 ruler 4 写分，但 status 仍是 submitted。只改状态、不改分：

```bash
cd server
node scripts/backfill-ruler-status.mjs                 # dry-run（默认）：只报候选数量
node scripts/backfill-ruler-status.mjs --apply         # 真写：仅 status → ai_graded
# 目标库不是 .env 里的库时：
node scripts/backfill-ruler-status.mjs --db-url 'mysql://…/exam_system' --apply
```

> 只匹配 `status='submitted' AND ai_score IS NOT NULL AND checker_id IS NOT NULL AND ai_feedback LIKE '%dsh-checker%'`；
> 分数、评语、checker_id 一律不动；连不上库 ⇒ `BACKFILL_FAIL reason=…` + 退出码 4（不会半写）。
> 本机（`.env` 指向的库）实测 dry-run `BACKFILL_CANDIDATES n=0`（存量可能在云上生产库，需用生产 `DATABASE_URL` 跑 dry-run 确认）。

## 7. 回滚

- 关闭自动触发：`DSH_AUTO_GRADE=0` 后重启 worker（无需迁移回滚）。
- 回填不可自动撤销（只改了 status）；如需回退：`UPDATE submissions SET status='submitted' WHERE id IN (…)`（人工确认名单）。
- 自动造尺 job 新建的行：`grading_jobs` 里 `checker_id='__AUTO_BUILD__'` 的失败行可人工置 `failed`。
- R1 迁移回滚（逆序删唯一索引 + 生成列；旧 active_key 不受影响；应用回滚前先停 worker）：
  ```bash
  cd server
  DATABASE_URL="…" npx prisma db execute --file prisma/migrations/20261017123000_r1_grading_jobs_active_assignment/rollback.sql --schema prisma/schema.prisma
  ```
  > 回滚不会重跑历史数据；迁移记录仍在 `_prisma_migrations`，如确需重放请按 Prisma 官方流程处理。

## 8. 改动文件

| 文件 | 作用 |
|---|---|
| `server/src/infrastructure/dsh/worker/dueAssignmentScanner.js` | 截止扫描 + 建 job（哨兵 checker_id） |
| `server/src/infrastructure/dsh/worker/autoBuild.js` | 哨兵常量 / 会话作用域格式化 |
| `server/src/infrastructure/dsh/worker/dshGradingWorkerRuntime.js` | 循环内按间隔调用扫描（异常不终止） |
| `server/scripts/r2b5-worker.mjs` | 注入扫描 + 启动日志 + `--reuse-checker` 覆盖提示 |
| `server/src/infrastructure/dsh/worker/device-args.js` | `withBuildCheckerArgs`（build-and-measure） |
| `server/src/infrastructure/dsh/worker/autoBuildSession.js` | 自动导出物料 + 会话作用域日志 + checker_id 对齐（从 run-once 拆出的纯函数块） |
| `server/src/infrastructure/dsh/worker/run-once.js` | 自动 job build 参数 + 造尺超时 + 导出失败 fail-closed + 对齐失败写 last_error |
| `server/src/infrastructure/dsh/checker/dshCheckerConsumer.js` | 回写补 `status=ai_graded`（已审核/已发布不降级） |
| `server/src/controllers/assignmentGradingController.js` | 无尺时建 build job（不再 409），活动 job 按作业判重 |
| `server/scripts/backfill-ruler-status.mjs` | 存量 80 份状态回填（dry-run / --apply） |
| `server/src/infrastructure/dsh/runs/read-model.js` | D2：列表/详情补 自动造尺 job（build/reuse）+ 旧任务 + 存量尺子记录 + 老师/班级 + 哨兵兜底 |
| `server/src/interface/http/controllers/admin/grading-runs/list.js` | D2：`run_kind` 筛选参数 |
| `client/src/views/admin/GradingRuns.vue` | D2：运行类型/老师/班级/尺子列 + 详情无归档提示 + 逐份 DB 兜底说明 |
| `server/scripts/backfill-admin-grading-runs.mjs` | D2：可选物化旧任务运行记录（dry-run / --apply，只补记录不改分） |
| `server/prisma/migrations/20261017123000_r1_grading_jobs_active_assignment/` | R1：`migration.sql`（guard + 生成列 + 唯一索引）/ `rollback.sql`（逆序回滚） |
| `server/prisma/schema.prisma` | R1：`GradingJob` 注释（两个生成列由 raw SQL 管理；旧 active_key 保留） |
| `server/scripts/check-r1-active-jobs.mjs` | R1：只读 preflight（`--json`；重复 exit 1 / 干净 0 / 错误 2；导出纯函数） |
| `server/src/controllers/assignmentGradingController.js` | R1：注释/文案（DB 强制每作业一个活动 job；P2002 兜底措辞） |
| `server/src/infrastructure/dsh/worker/dueAssignmentScanner.js` | R1：注释（建前复查降级为优化；P2002 是 DB 约束的正常路径） |
| `server/src/interface/http/controllers/student/project-submit.js` | D5：删除提交即评分（`enqueueProjectGrade`）；提交只入库，截止后 DSH 统一评分 |
| `server/src/infrastructure/dsh/runs/read-model.js` | D5：`shapeRow` 补 `content_key/ruler_id/ruler_status/historical_archive_only` |
| `server/src/infrastructure/dsh/runs/read-model/list-runs.js` | D5：合并 `grading_jobs`（status/content_key）+ ruler/历史归档标记；status 过滤移到合并后（修 1054） |
| `server/src/infrastructure/dsh/runs/read-model/detail-run.js` | D5：详情同样合并任务行 + 尺子字段 + 历史归档 notice |
| `server/src/infrastructure/dsh/runs/read-model/legacy-jobs.js` | D5：ruler 索引 select `id`（列表显示 ruler_id） |

## 9. 本轮明确不做

- 不调分数、不做校准（「分对不对」不在本轮）。
- 不做前端新按钮（流程是截止自动触发；教师端只消费「待审核」列表）。
- 不改 `grading_rulers` 的内容键口径（跨班/跨教师复用保持不变）。
- 不新增业务表：R1 只给 `grading_jobs` 加生成列 + 唯一索引（§2.3）；不改分数口径、不改 `grading_rulers.content_key`。
