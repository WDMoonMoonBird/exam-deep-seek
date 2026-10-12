# DSH 实训题 · 作业级批改 worker —— 部署包（可直接使用）

> 本目录由 R2 批次的**实战配方**固化：所有参数、退出码含义、运维约定都来自 2026-10-12 的八次真实生产运行（其中 5 次失败被完整留痕、3 次成功）。
> 适用：**实训题（type=project）** 的作业级批改。**编程题不纳入**（用户裁定，见 §7）。

## 1. 两种形态

| 形态 | 何时用 | 怎么做 |
|---|---|---|
| **常驻**（resident） | 测试期、需要「老师点按钮立刻出分」 | `Type=simple` + `Restart=always`，**不装 timer**（见 §6） |
| **峰谷窗口**（本目录默认） | 上线形态（「立即批改」已裁定上线取消） | `dsh-grader-worker.service`（`--once`）+ `.timer` |

worker 本身**同一个入口**：不带 `--once` = 常驻轮询；`--once` / `--max-iterations N` / `--timeout-ms N` = 跑一段就退。

## 2. 前置条件

```bash
bash docs/dsh/deploy/check-prereqs.sh          # ★只读自检：不写库、不启动装置
```

| # | 条件 | 说明 |
|---|---|---|
| 1 | Node.js ≥ 20 | 与平台后端同版本 |
| 2 | 本仓库代码 + `server/node_modules` | `cd server && npm ci` |
| 3 | ★**DSH CLI 安装在目标机** | 装置会调 `dsh --profile headless`；Linux 路径与 macOS 不同 ⇒ 设 `DSH_GRADER_BIN`（service 里已留位） |
| 4 | MySQL 可达（生产库 `exam_system`） | worker 写库需 **`--allow-db exam_system --allow-prod` 双开关**（防止误连生产） |
| 5 | 磁盘：`/tmp` ≥ 5 GB | 每次运行产生 24 MB 级 run-root（材料 + 产物） |
| 6 | ★**物料来源（已实现，R2-B20）** | 用 `node scripts/r2b20-export-materials.mjs --assignment <id> --out <dir>` 把平台作业导出成装置可直接吃的物料源目录（`标准工程包.zip` / `评分标准.md` / `题目描述.md` / `<real_name>.zip` ×N + `export-manifest.json`），再以该目录作为装置的 `--source-dir`；用法与云上示例见 §7-1 |

## 3. 安装

```bash
sudo mkdir -p /etc/dsh-grader
sudo cp docs/dsh/deploy/worker.env.example /etc/dsh-grader/worker.env
sudo chmod 600 /etc/dsh-grader/worker.env       # 含库口令：务必 600
sudo vi /etc/dsh-grader/worker.env               # 填 DATABASE_URL / GRADER_SUBMISSIONS

sudo cp docs/dsh/deploy/dsh-grader-worker.service /etc/systemd/system/
sudo cp docs/dsh/deploy/dsh-grader-worker.timer   /etc/systemd/system/
sudo vi /etc/systemd/system/dsh-grader-worker.service   # 改 WorkingDirectory / DSH_GRADER_BIN / node 路径

sudo systemctl daemon-reload
sudo systemctl enable --now dsh-grader-worker.timer      # 启用峰谷窗口
sudo systemctl start dsh-grader-worker.service           # 立刻试跑一次（不等窗口）
```

## 4. 验证（第一次真的跑通的判据）

```bash
journalctl -u dsh-grader-worker -n 80 --no-pager | grep -E 'WORKER_START|PLATFORM_MODEL|CHECKER_REUSE|ANCHOR_MATERIALIZED|STALE_RECLAIMED|dsh_grader_end|消费完成'
# 期望：WORKER_START … ；CHECKER_REUSE=applied（复用尺子）；dsh_grader_end exit_code=0；
#       消费完成 total=N written=M map_reason=manifest|materials_manifest

mysql exam_system -e "SELECT id,status,written_count,skipped_count,LEFT(last_error,60) FROM grading_jobs ORDER BY id DESC LIMIT 3;"
# 期望：最新 job ⇒ status=done
```

**判据三连**：①装置 `exit_code=0` ②消费 `written>0` 且 `map_reason` 为 `manifest`/`materials_manifest` ③job `done` 且 `last_error` 为空。

## 5. 运维约定（来自实战教训，务必遵守）

| # | 约定 | 为什么 |
|---|---|---|
| 1 | **`TimeoutStartSec=infinity`** | `Type=oneshot` 默认 90s 会被 systemd 中途杀掉（单次批改需数分钟） |
| 2 | **`DSH_WORKER_STALE_RUNNING_MS` > 单次运行时间** | 否则「还在跑却被回收」；缺省 900s > 装置 `--timeout-ms` 600s ⇒ 安全 |
| 3 | **单实例** | 闸是 DB 级（`dsh_grading_concurrency`）；提吞吐请调闸，不要并行起多进程 |
| 4 | **窗口形态必须启用回收** | 中断/断电会留下 `running` 行 ⇒ 占住闸 ⇒ **后续所有窗口静默领不到 job**（worker 启动即回收，打印 `STALE_RECLAIMED`） |
  - ✅ **已验证（2026-10-12）**：回收器判据与领取语句使用**同一时钟（UTC）**，独立复核在生产口径下实测「僵尸占闸 ⇒ 回收 ⇒ 领取并消费」；口径漂移有守卫（w43：把任一侧改回本地时钟即变红）。**约定**：`grading_jobs.updated_at` 的唯一口径是 UTC；任何涉及该列的新代码/脚本都必须用 `UTC_TIMESTAMP(3)`。
| 5 | **run-root 清理** | 成功现场可清、失败现场留证：`find /tmp -maxdepth 1 -name 'r2b4-job-*' -mtime +3 -exec rm -rf {} +` |
| 6 | 优雅停机 | `systemctl stop` 发 SIGTERM ⇒ worker「跑完当前 job 再退」（配 `TimeoutStopSec=1800`） |
| 7 | 首次批改要造尺 | 每个作业**首次**需 `build-and-measure`（1 次模型调用）；之后全部复用 ⇒ **零 LLM** |
| 8 | ★**尺子与物料绑定** | 尺子内钉着造尺时的 `rubric_hash`/`standard_hash`；用**别的批次**的 rubric/标准包去量尺 ⇒ 装置判 `STALE=true reason=rubric_hash_mismatch,standard_hash_mismatch` 并**拒绝给分**（正确行为）。⇒ 生产流程必须是「**先导出物料 → 用同一份导出件造尺 → 再量尺**」，不得混搭。 |

## 6. 切换形态

**改为常驻**（测试期推荐）：把 service 换成
```ini
[Service]
Type=simple
Restart=always
RestartSec=5
ExecStart=/usr/bin/node scripts/r2b5-worker.mjs \
  --db-url ${DATABASE_URL} --allow-db exam_system --allow-prod --reuse-checker \
  --device bash --device-arg scripts/dsh-grader/run.sh \
  --device-arg --submissions --device-arg ${GRADER_SUBMISSIONS} --device-arg --allow-identical
```
并 `systemctl disable --now dsh-grader-worker.timer`（去掉 `--once`）。实测常驻 **58 MB RSS / CPU 0.0%**；跑一次复用批改期间进程树合计 **58–75 MB**（复用模式不常驻 DSH 进程）。

**macOS 本机**（可选，launchd 等价物）：用 `launchd` 的 `StartCalendarInterval` 调 `--once`；或直接常驻：`node scripts/r2b5-worker.mjs …`（本机测试期即此形态）。

## 7. 已知缺口 / 边界（部署前必读）

1. ★**物料来源：已实现（R2-B20）** —— `server/scripts/r2b20-export-materials.mjs`。
   - **★多作业顺序（R2-B21）**：**先导出该作业物料，再拉起 worker**。worker 支持 env `DSH_GRADER_MATERIALS_ROOT=<根目录>`（写在 `/etc/dsh-grader/worker.env`，见 `worker.env.example` ②b）：设了它之后，worker 会**按 job 的 assignmentId** 解析
     `--source-dir <ROOT>/<assignmentId>`（绝对路径）并把 `--submissions` 取自该目录 `export-manifest.json` 的 `n_submissions`（清单缺失 ⇒ 回退「目录内 `*.zip` 数 − 1」并打 `source=zipcount`）⇒ 一份 worker 配置即可服务**多个作业**，无需按作业重启。
     ```bash
     # 每作业两步：①导出 ②由 timer/worker 领取该作业的 job 时自动解析
     node scripts/r2b20-export-materials.mjs --assignment 311 --out /var/lib/dsh-grader/materials/311 --allow-db exam_system --allow-prod
     echo 'DSH_GRADER_MATERIALS_ROOT=/var/lib/dsh-grader/materials' >> /etc/dsh-grader/worker.env   # 一次性配置
     ```
   - **★fail-closed（不回落默认源目录）**：`<ROOT>/<assignmentId>` 不存在或为空 ⇒ 打印 `MATERIALS_MISSING assignment=<id> path=<dir>`，该 job 记 `needs_rerun` + `last_error=materials_missing_for_assignment:<id>`，**不写分**、**不回落**装置的默认 `实验/`；解析成功则打 `MATERIALS_RESOLVED assignment=<id> dir=<dir> submissions=<n> source=manifest|zipcount`，`WORKER_START` 也会打印 `materials_root=<值或(unset:device-default)>`。
   - **向后兼容**：未设 `DSH_GRADER_MATERIALS_ROOT` ⇒ 行为与既有完全一致（装置默认源目录 + 启动时的 `--submissions`）。
   - **用法**：`node scripts/r2b20-export-materials.mjs --assignment <作业id> --out <目录> [--db-url <url>] [--allow-db <库名>] [--allow-prod]`；测试/演练可加 `--uploads-root <夹具目录>` 重定位 uploads 根（不改真实 uploads）。
   - **产出（装置契约）**：`标准工程包.zip`、`评分标准.md`（`questions.scoring_rubric`）、`题目描述.md`（标题 + `questions.material`，**文件名必须这个**）、每个提交一个 `<real_name>.zip`（重名追加 `-<username>`）、`export-manifest.json`（submissionId → zip 名 / 来源路径 / 各自 sha256 / 份数 / questionId / 生成时刻）。
   - **确定性**：同一输入两次导出，各 zip 与各 md 的 sha256 **逐一相同**（zip 条目按字节序排序、DOS 时间戳固定 1980-01-01、无随机/时间字段）⇒ 可复算、可比对；`export-manifest.json` 除 `generated_at` 外逐字段相同。
   - **只读 + 护栏**：不写平台 DB、不改 `server/uploads/**`（只写 `--out`）；生产库需 `--allow-db <库名>` + `--allow-prod` 且**连接前**校验（缺开关 ⇒ `EXPORT_FAIL reason=allow_db_required:<库名>`、rc=2、不连接）；作业没有**恰好一个** project 型题目 ⇒ `EXPORT_FAIL reason=project_question_not_unique:<n>`（不猜）。
   - **云上调用示例**：
     ```bash
     cd /opt/exam/server
     OUT=/var/lib/dsh-grader/materials/assignment-311
     node scripts/r2b20-export-materials.mjs --assignment 311 --out "$OUT" \
       --db-url "mysql://<user>:<pass>@127.0.0.1:3306/exam_system" --allow-db exam_system --allow-prod
     # 期望：EXPORT_TARGET db=exam_system prod=yes ⇒ EXPORT_OK n=<份> question=<id> standard_sha256=… rubric_len=… out=…
     # 之后按 §4 以 --source-dir "$OUT" 拉起装置（配 --reuse-checker 时为零 LLM）
     ```
   - 前置条件：题目已上传标准包（`attachment_url` 或 `uploads/project-questions/<qid>/standard/` 非空）、学生提交已落盘 `uploads/project-submissions/<qid>/<studentId>/<version>/`、该作业恰好绑定一个 project 型题目。
2. **编程题不纳入**本装置（用户裁定）：编程题（`type=code`）继续走平台既有 `checker_script` 链路（`ai_concurrency`，与本 worker 的闸相互独立）。
3. **尺子按作业冻结**：可比组 = `(assignment_id, checker_id)`；跨尺子分数不可比。作业的评分标准/标准包变更后需**重新造尺**（旧分数成为「旧尺子历史值」）。
4. **锚点漂移策略**未定（rubric/提交集合变化时锚点与当前材料不一致的处理）。
5. 装置隔离检查会因**宿主 DSH 会话在运行期写入** `~/.dsh` 而误报 `ASSIGNMENT_ISOLATION=FAIL`（无人值守服务器上无此问题）。

## 8. 排障：先看这两处

```
journalctl -u dsh-grader-worker | grep DEVICE_LOGS      # 装置 stdout/stderr 的落盘路径
cat <run-root>/out/device.stderr.log                    # 装置真实报错（含根因行，凭据已脱敏）
mysql exam_system -e "SELECT last_error FROM grading_jobs ORDER BY id DESC LIMIT 1;"   # 尾部摘要
```

| `last_error` 里的退出码 | 含义 | 处置 |
|---|---|---|
| `device_exit_127` | 装置脚本路径不存在（cwd/相对路径） | 检查 `WorkingDirectory` 与 `--device-arg` 相对路径 |
| `device_exit_5` | 形状闸不合格 / 缺 frozen 尺子 | 先跑 `build-and-measure` 造尺 |
| `device_exit_1` | 装置内部失败（如目录缺失） | 看 `device.stderr.log` 根因行 |
| `device_exit_3` | frozen 完整性校验失败（字节级不一致） | 检查锚点 raw 字节与尺子来源 |
| `device_exit_124` | 超时 | 提高 `--timeout-ms`；检查模型端点可达 |
| `exit=0` 但 `written=0` | 映射失败 | 看 `map_reason`：`manifest_missing` ⇒ 锚点与物料清单都缺 |

## 9. 本目录文件

| 文件 | 用途 |
|---|---|
| `check-prereqs.sh` | ★只读前置自检（Node/布局/DSH CLI/物料/DB/磁盘） |
| `dsh-grader-worker.service` | 峰谷窗口形态的 systemd 服务（`Type=oneshot`） |
| `dsh-grader-worker.timer` | 定时器（三套 `OnCalendar` 方案 + `Persistent=true` 补跑） |
| `worker.env.example` | 环境变量模板（含权限与「不需要配模型凭据」的说明） |
| `README.md` | 本文件 |