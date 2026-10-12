# R2-C4b 复核（F-R2C4-1 假成功是否根除 + F-R2C4-2 原始分可追溯）

## 结论摘要（10 行）
1. **verdict = pass**：F-R2C4-1（高，假成功）与 F-R2C4-2（中，原始分不可追溯）**全部关闭**——真实 slug 命名的装置产物经 worker 消费后**要么真写分、要么 needs_rerun**，且 `written` 与 DB 实际更新行数**逐位一致**；小数分可在 `aiFeedback.raw_score` 追溯。
2. **★原最小复现重跑【通过】**：用 t36 的真实装置 run-root（`manifest: s01→丁静45、s02→于强27`）经 worker 消费——全映射 ⇒ `status=done / written=2`，**DB 实际更新 2 行**（`ai_score=59` + `checker_id=sha256:0972d185…` + `canonical_sha256` + `grading_stale=0`）；**不再出现"done + 零写入"**。
3. **★written 计数一致性【通过（正反两向）】**：全映射 `written=2 == db_updated_rows=2`；部分未映射 `written=1 == db_updated_rows=1`；全未映射 `written=0 == db_updated_rows=0`。
4. **未映射路径【通过】**：逐份 rows 实测 `s01 → write=true / graded / id=41241`、`s02 → write=false / needs_rerun / **reason=unmapped_submission_id:s02**`；`mapInfo.unmatched=[{slug:s02,id:'不存在的人X'}]`；全未映射时 job `needs_rerun`，`last_error=all_needs_rerun:unmapped_submission_id:s01,unmapped_submission_id:s02`。
5. **★F-R2C4-2【通过】**：62.5 的产物 ⇒ `ai_score=62`、`aiFeedback.raw_score=62.5`、`score_int=62`、`score_rounding='trunc(ai_score INT 列；原始分见 raw_score)'`；取证命令 `SELECT JSON_UNQUOTE(JSON_EXTRACT(ai_feedback,'$.raw_score')) AS raw_score, ai_score FROM submissions WHERE id=<id>` ⇒ `62.5 / 62`。
6. **回归【通过】**：stub 端到端 `R2B4_SMOKE=PASS checks=8 failed=0`（新增 `slug_mapped_real_write`/`slug_unmapped_needs_rerun` 两项）；闸=1（`gate_full`，第二个 job 保持 `pending/attempts=0`）；四类不写分（exit6/null/stale/unsupported 单产物）全部 `needs_rerun` + `written_count=0` + `ai_score` NULL；超时（`timedOut=true → pending/attempts=1/retryable`）与双领取（`[false,true]` 只有一次成功）仍成立。
7. **测试基线**：七条 verify 全绿——① unit(排除三重度) **46 套件/665 例** + contract **3/50**；② 17；③ 61；④ 21；⑤ integration **37 套件/365 例**（含新增 w16）；⑥ `FINGERPRINT_OK`；⑦ smoke **8/8**；check-layers 0 违规；既有测试文件**仅新增** `w16-slug-consumption.test.js`。
8. **安全【通过】**：生产库指纹逐位不变（22 表 / submissions 新列 0 / 迁移 2）；历史 92 分摘要= `e8496ae6…`（未重算）；**装置侧三元组不变**（`dsh-grader e746b888…` / `dsh-checker 344b6a8d…` / `classify 8efaef92…`）；被验 server 路径开收指纹一致（284 文件 `33c703c9…`）。
9. 探针自清理：作业/提交/job 全部删除（测试库 `C4b/C4c` 作业 0、`grading_jobs` 0），临时改名的两名学生 `realName` 已还原（校内 test_ 学生中匹配数为 0）。
10. 证据外置 `docs/dsh/evidence/agent-c/92–97`；本报告 ≤300 行 / ≤20KB。

## 1 方法与可复算装置
- 复用 t36 的**真实装置产物**（`/tmp/t36/device/out/**`，含 `assignment/assignment-manifest.json`：`s01→丁静45`、`s02→于强27`、`measure/s01.json`、`s02.json`、`checker/checker.json`）。
- 自建 shim 装置 `t38-shim-device.cjs`：把真实产物复制进 worker 的 run-root（**含 manifest**），支持 `MANIFEST_SRC2=<改名>`、`MANIFEST_ALL_UNMATCHED=1`、`ONLY_FIRST=1`、`SUB_ID`、`mode=decimal/exit6/null/stale/unsupported/slow`。
- 探针：`t38-c4b-probe.mjs`（C1–C3、C5–C7）、`t38-c4c-probe.mjs`（C4 小数分 + C2b 逐份 rows + JSON_EXTRACT 取证，修正了作业归属）；仅测试库、`PORT=0`、自清理。
- 只读 DB：临时 `my.cnf` chmod 600、用后即删；未跑禁令清单。

## 2 ★原最小复现重跑（真实 slug 产物 → 平台消费）
| 用例 | worker 返回 | DB 实际更新 | job 行 |
|---|---|---|---|
| **C1 全映射**（manifest 两人名与平台学生 `realName` 对齐） | `status=done / written=2 / skipped=0` | **2 行**（`ai_score=59`、`checker_id=sha256:0972d185…`、`canonical_sha256=b7474d7e…/da3ff393…`、`grading_stale=0`） | `done / written_count=2` |
| **C2 部分未映射**（s02 源 id 改为"不存在的人X"） | `status=done / written=1 / skipped=1` | **1 行**（sub1=59；sub2 仍 NULL） | `done / written_count=1` |
| **C3 全未映射**（两人名皆对齐不上） | `status=needs_rerun / written=0 / skipped=2` | **0 行** | `needs_rerun / written_count=0 / last_error=all_needs_rerun:unmapped_submission_id:s01,unmapped_submission_id:s02` |
- 对照 t36 的旧行为（`done/written=2` 但零写入）⇒ **假成功已根除**：三种结局都是"真写分"或"needs_rerun"，且 job 计数与 DB 一致。

## 3 ★written 与 DB 实际更新行数对拍（我自算 SQL）
对拍口径：`SELECT COUNT(*) FROM submissions WHERE id IN (<目标提交>) AND ai_score IS NOT NULL AND checker_id IS NOT NULL`（部分未映射场景用 `ai_score IS NOT NULL`）。
- C1：`written=2` vs `db_updated_rows=2` ⇒ **equal=true**
- C2：`written=1` vs `db_updated_rows=1` ⇒ **equal=true**
- C3：`written=0` vs `db_updated_rows=0` ⇒ **equal=true**

## 4 未映射路径逐份取证
```json
{ "written": 1, "skipped": 1, "map_reason": "manifest",
  "unmatched": [ { "slug": "s02", "id": "不存在的人X" } ],
  "rows": [ { "slug": "s01", "id": 41241, "write": true,  "status": "graded",       "reason": "ok" },
            { "slug": "s02", "id": null,  "write": false, "status": "needs_rerun",  "reason": "unmapped_submission_id:s02" } ] }
```
⇒ 未映射份**明确 needs_rerun 且带 slug 原因**，其余份正常写分（不误伤）。

## 5 ★F-R2C4-2 原始分可追溯（附取证命令）
- 平台写入后（62.5 产物、全映射）：
  ```
  ai_score = 62
  aiFeedback.raw_score = 62.5   aiFeedback.raw_max_score = 100
  aiFeedback.score_int = 62     aiFeedback.score_rounding = 'trunc(ai_score INT 列；原始分见 raw_score)'
  aiFeedback JSON 字符串内 includes('62.5') = true
  ```
- **取证命令（可直接粘贴）**：
  ```sql
  SELECT JSON_UNQUOTE(JSON_EXTRACT(ai_feedback, '$.raw_score')) AS raw_score, ai_score
    FROM submissions WHERE id = <提交 id>;
  -- 实测输出：raw_score = 62.5   ai_score = 62
  ```
⇒ 口径明确（显式 `Math.trunc` + 文案）且原始分可追溯。

## 6 回归（全部我自跑）
| 项 | 结果 |
|---|---|
| stub 端到端 | `R2B4_SMOKE=PASS checks=8 failed=0`：JOB1 done/written=1/aiScore=62；JOB2 exit6 ⇒ needs_rerun+null；JOB3 artifacts_missing；JOB4 `gate_full` 且 pending/attempts=0；JOB5 timedOut → pending/attempts=1/gate_active=0；JOB6（slug）**done/written=1/aiScore=59**；JOB7（slug 未映射）**needs_rerun/written=0/unmapped_submission_id:s02** |
| 闸=1 | 第二次 runOnce ⇒ `consumed=false / gate_full`，第二个 job `pending / attempts=0` |
| 四类不写分（单产物） | exit6 / null / stale / unsupported ⇒ 全部 `needs_rerun`、`written_count=0`、`ai_score` NULL |
| 超时 | `timedOut=true / status=pending / last_error=timeout:attempt=1:retryable`（kill + 释放闸） |
| 双领取 | `consumed=[false,true]`、`reasons=['no_pending_job', null]`（只有一次成功） |

## 7 安全、测试与不变式
| 项 | 证据 |
|---|---|
| 七条 verify | ① unit(排除三重度) 46 套件/665 例 + contract 3 套件/50 例 rc=0；② 17；③ 61；④ 21；⑤ integration 37 套件/365 例 rc=0；⑥ `FINGERPRINT_OK`；⑦ smoke 8/8 rc=0；check-layers 0 违规 |
| 既有测试文件 | `git status -- server/test` 仅 `?? server/test/integration/w16-slug-consumption.test.js`（新增，未改既有文件） |
| 生产库零写入 | `db-fingerprint.js`：users 1252 / questions 32 / assignments 52 / aq 52（columns=3）/ submissions 1601 / system_configs 4、max_id/max_submitted_at、迁移 2、表 22 ⇒ 与跑前一致；生产 `grading_*` 表 0、submissions 新列 0 |
| 历史分数 | 92 份实训题摘要 = `e8496ae6b9186af354b2713d1c2accee8dc366de57908abfd15bbc62341a4b98`（与开工一致） |
| 装置侧三元组 | `dsh-grader=e746b888…`（20）、`dsh-checker=344b6a8d…`（5）、`classify=8efaef92…` ⇒ 未被动过 |
| 被验 server 路径 | 开=收：284 文件 / `33c703c925a6f812b6f9bee28dec350d977e497d0dfca1d4c8f36bbbf7c1ed5d`（含明细一致） |
| 探针自清理 | 作业/提交/job 全删；测试库 `C4b/C4c` 作业 0、`grading_jobs` 0；临时改名的两名学生 `realName` 已还原 |

## 8 观察与未核验（非阻断）
- **O-1**：本轮 C4 首次运行失败是**我探针的作业归属错误**（job 与提交不在同一作业 ⇒ 映射查不到提交 ⇒ needs_rerun）；修正后全绿——该现象同时**反向证明**未映射路径是 fail-closed 的。
- **O-2**：装置按**平台 submission id** 命名产物那条路径仍需改装置（B 已声明 out of scope）；当前实现走「manifest 源 id ↔ 学生 realName/username 对齐」，本轮已用真实 manifest 实测通过（含歧义/未命中 fail-closed）。
- **未核验**：常驻 worker 调度、多进程 DB 级闸、`needs_rerun` 一键重跑端点、`raw_score` 的教师端展示（均非本轮验收面）。

## 9 预算与纪律
- 真实模型调用 **0 次**（复用 t36 的真实装置产物，符合"不新增模型调用"的复核原则）；其余全零 LLM。
- 未改 `server/**`、`tests/`、`client/dist`；未跑禁令命令；未占 :5173/:3000/:19387（探针 `PORT=0`）；未写 `~/.dsh`；临时 `my.cnf` 已删；报告 ≤300 行 / ≤20KB，长证据外置 `92–97`。
