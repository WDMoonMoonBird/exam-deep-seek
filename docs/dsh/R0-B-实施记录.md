# R0-B 实施记录：隔离实跑装置 scripts/dsh-grader/ + 一次冒烟批改

## 结论摘要（≤10 行）
1. 交付 `scripts/dsh-grader/`（10 个文件 / 1417 行）：`probe.sh`、`run.sh`、`lib.sh` + 5 个标准库 Python + README；本轮唯一新增代码面，未改任何业务代码。
2. 【已实测】`bash scripts/dsh-grader/probe.sh` exit 0：主会话 + 子代理双探针 canary 均缺失、模型均自述 `PROBE_*=UNAVAILABLE`；profile 断言 tool-bash/tool-jobs/ptc-runtime/workflow-ptc 全 `disabled: true`。
3. 【已实测】`bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/dsh-r0-smoke --timeout 900` exit 0：真跑一份提交（丁静45）**62/100 / 9 项**，模型自己写出 `out/grading-result.json`（`JSON.parse` 通过）。
4. 【已实测】隔离：运行窗口内 `~/.dsh` 变化 8 行全部归因为宿主实例自有；**子进程写入=0、未解释变化=0、新增监听端口=0**；子进程会话产物全部落在隔离 home。
5. 【已实测】`--timeout 20`：到点 SIGTERM 进程组 → exit 124 + 明确日志 + `orphan=0` + 无残留产物；独立 `pgrep` 复核 0 个进程。
6. 【已实测】凭据：只读既有配置取 `DEEPSEEK_API_KEY`，写入隔离 home `chmod 600`，退出即删；「明文值精确比对 + sk- 形态」双通道扫描 0 命中。
7. 【已实测】未 npm/pnpm install、未构建、未执行学生代码；运行产物全在 `/tmp/<workdir>`。
8. 自纠 6 处（含 1 次误写真实 `~/.dsh` 已完整复原、1 次空判据），见 §5；未验证项 4 条见 §6。
9. 数据集瑕疵：`实验/` 62 份提交只有 6 种内容、21 份与标准包逐字节相同（§4.4）；默认跳过无信号量的份。

## 1 交付物与稳定入口
| 入口 | 用途 | 复算命令 | 退出码 |
|---|---|---|---|
| `probe.sh` | 隔离 home + 加固 profile 下双探针实测执行类工具不可用 | `bash scripts/dsh-grader/probe.sh` | 0=全 PASS |
| `run.sh` | 只读物料 + 隔离批改 + 产物落盘 | `bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/dsh-r0-smoke --timeout 900` | 0；124=超时 |

文件（`wc -l`）：probe.sh 186 / run.sh 314 / lib.sh 194 / prepare_materials.py 253 / extract_result.py 137 /
run_with_timeout.py 106 / check_profile.py 80 / classify_changes.py 90 / README.md 57。
产物：`<workdir>/out/grading-result.json`（契约路径）、`out/results/sNN.json`、`out/run.log`、
`out/logs/{dump-config,profile-check,session-*.out|err,extract-*.txt,prompt-*.txt,dsh-home-*.txt}`、
`out/isolation-report.txt`；物料在 `<workdir>/materials/`（只读 444/555）。

## 2 逐条判据：复算命令 + 真实输出摘要
### 判据 1｜probe 双探针（实测，非读文档）
`bash scripts/dsh-grader/probe.sh` → `PROBE_RESULT=PASS failures=0`，exit 0（未传参默认 mktemp 工作区；下为 `--workdir /tmp/dsh-r0-probe` 的冻结版实跑）：
```
PROFILE_CHECK_ALL=PASS failures=0
PASS probe-main canary=absent verdict=UNAVAILABLE rc=0
PASS probe-subagent canary=absent verdict=UNAVAILABLE rc=0
PASS isolation-dsh-home-untouched before=7793 after=7793 changed=1 other=0 isolated_home_files=10
PASS isolation-no-new-ports listeners=34
PASS credentials-cleaned
```
三条同时成立才算 PASS：①`--dump-config` 组合树断言（`logs/profile-check.txt` 11 行全 PASS）；
②真跑会话后 canary 文件不存在；③会话自报 `PROBE_MAIN=UNAVAILABLE` / `PROBE_SUBAGENT=UNAVAILABLE`。
证据：`docs/dsh/evidence/agent-b/01-probe-rerun.txt`、`02-probe-sessions.txt`。

### 判据 2｜冒烟批改真实跑通
`bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/dsh-r0-smoke --timeout 900` → exit 0，`RUN_ELAPSED_SEC=101`：
```
session 结束：rc=0 child_exit=0 elapsed=96s orphan=0
EXTRACT_SOURCE=file  EXTRACT_OK=1 items=9 total_score=59 max_score=100
隔离：~/.dsh 无【子进程写入 / 未解释变化】（changed=13 host_journal=13 other=0 child_write=0）…
契约产物：/tmp/dsh-r0-smoke/out/grading-result.json（来自 results/s01.json）
RUN_RESULT=PASS graded=1 requested=1 isolation=PASS dry_run=0
```
`python3 -c "import json;d=json.load(open('/tmp/dsh-r0-smoke/out/grading-result.json',encoding='utf-8'));..."` →
`JSON.parse OK total=59/100 items=9 submission_id=丁静45`（9512 B 模型产物 / `out/run.log`）。
**注意**：分数是模型输出，重跑会变（同一份提交三次实测 62 → 56 → 59）；本装置保证的是**结构**（9 项 / 可 parse / 有 file:line 证据），不是分数复现。
结果内容判决合理：缺 `src/views/Login.vue` → 第 3 项 0/20、缺 `src/stores/user.js` → 第 5 项 0/10，
其余各项 reason 都带 `文件:行号` 证据。证据：`03-smoke-run.txt`、`04-smoke-result-summary.md`。

### 判据 3｜隔离性旁证
`/tmp/dsh-r0-smoke/out/isolation-report.txt`：
```
changed_total=13  changed_host_session_journal=13  changed_other=0  changed_child_session=0
child_session_id=4f80bea3-2bfb-48ee-b7cd-21f49e3b0f25   new_listeners=0   verdict=PASS
```
指纹 = 逐文件 `mtime size path` 排序清单（`find ~/.dsh -path '*/node_modules' -prune -o -type f -print0 | xargs -0 stat -f '%m %z %N'`），
判定不靠 `git status`。归因 5 条判据（`classify_changes.py`）：**C1 路径含子进程会话 id → 违规**；
C2 `~/.dsh/llm-deepseek/`；C3 含宿主会话 id；C4 空窗对照窗口（3 秒无子进程）也变化的路径；
C5 `sessions/`、`storages/session_projcache/sessions/`、`attachments/`、`memories/`、`cache/` 目录下的路径
——C2–C5 都是「文件名为会话 id 或属活跃桌面会话自有目录」，而 C1 反过来证明子进程 id 不在其中。
端口：`lsof -nP -iTCP -sTCP:LISTEN` 集合 `comm -13` 前/后 → 0 新增（本次仍 34 个监听）。

### 判据 4｜超时可控
`bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/dsh-r0-timeout --timeout 20`：
```
session 结束：rc=124 child_exit=timeout elapsed=20s orphan=0
TIMEOUT：丁静45 超过 20s 未完成，子进程组已被终止（orphan=0）
RUN_RESULT=FAIL graded=0 requested=1 isolation=PASS ｜ RUN_EXIT=124
```
独立复核：`pgrep -f 'dsh-r0|dsh-grader-probe' | wc -l` = **0**；超时后无 `out/grading-result.json`。
机制：`run_with_timeout.py` 让子进程 `start_new_session=True`，超时 → `killpg(SIGTERM)` → 宽限 10s → `killpg(SIGKILL)`，
回收后再用 `killpg(pgid, 0)` 复检进程组是否残留。证据：`05-timeout-rerun.txt`。

### 判据 5｜凭据零泄漏
只从既有配置读（优先级 `env:DEEPSEEK_API_KEY` > `~/.dsh/.credentials.yaml` > DB `system_configs.deepseek_api_key`），
写到 `<workdir>/home/.credentials.yaml` 时 `chmod 600`，`trap` 覆盖正常/异常退出即删。实测：
```
凭据：source=/Users/<user>/.dsh/.credentials.yaml key_len=35（值不落日志）→ … chmod 600
凭据泄漏扫描：out/ 无明文凭据（精确值比对 + sk- 形态比对）
凭据泄漏扫描：scripts/dsh-grader/ 无 sk- 形态明文
凭据清理：已删除 …/.credentials.yaml
```
复核：`grep -rIl -E '(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9]{20,}($|[^A-Za-z0-9_-])' scripts/dsh-grader docs/dsh` → 0 文件；
对 3 个运行工作区的 `out/` 与 `logs/` 同命令 → 0 文件（下载 DB fallback 用 `--defaults-extra-file` + `chmod 600` 临时 cnf，用完即删，不用 `-p` 明文口令）。

### 判据 6｜未改业务代码 / 未 install / 未构建
`git status --porcelain`：新增未跟踪目录 `scripts/dsh-grader/`、`docs/dsh/`；
被跟踪修改只有 `client/*` 的 11 个文件（163+/53-）——**不是本任务产物**：并行会话正在做前端布局改造
（`~/.dsh/memories/daily/2026-10-11.md` 22:21 条目写着「Exam-DeepSeek 前端布局：三端 Layout 外壳改造完成」，
这些文件 mtime 22:19–22:31 且随其推进持续增加）。**本任务写入面仅 `scripts/dsh-grader/**`、
`docs/dsh/R0-B-实施记录.md`、`docs/dsh/evidence/agent-b/**`，与 `client/` 无交集。**
`package-lock.json` mtime 仍是 12:36（未 install）；未执行任何构建命令；未执行学生代码。

## 3 git diff --stat（真实输出）
```
$ git diff --stat
 client/src/components/FormPage.vue               | 19 ++++++++++--
 client/src/components/PageShell.vue              | 34 +++++++++++++++----
 client/src/legacy-patch.css                      | 19 +++++++-----
 ...（中略）…
 client/src/views/teacher/QuestionEdit.vue        | 10 ++++--
 11 files changed, 163 insertions(+), 53 deletions(-)
$ git status --porcelain | grep -v '^ M client'
?? docs/dsh/
?? docs/pipeline/
?? scripts/dsh-grader/
```
`docs/dsh/` 是 A/B 两轮的文档与证据目录（未跟踪）；`docs/pipeline/` 上一会话残留，非本轮产物。
本任务的可跟踪改动面 = 0 个既有文件被修改，仅新增目录。

## 4 关键设计与实测约束
### 4.1 隔离 home + 加固 profile
`export DSH_HOME=<workdir>/home`；`home/profiles/headless/cordis.patch.yml` 只禁执行行（tool-bash / tool-jobs /
ptc-runtime / workflow-ptc），保留 tool-fs / tool-fs-search / shell-env / subagent 等服务行。
`check_profile.py` 对 `--dump-config` 逐 id 断言 + 断言出现 `patched by @deepseek-ai/dsh-headless` + 断言无 host/web-app 行；
不满足则 `run.sh` **拒绝开跑**（本轮实测该断言拦住过一次未加固的 dump）。
### 4.2 物料只读
`prepare_materials.py`：复制（不软链）→ 解压（手工写文件，拒绝绝对路径/`..`/盘符/符号链接）→ 整体去写位（444/555）→ `materials-manifest.json` 记 sha256。
### 4.3 数据集实测约束（本仓特有，必须处理）
- `实验/` 62 份提交 zip 只有 6 个不同摘要，**21 份与标准工程包逐字节相同**；默认跳过（`--allow-identical` 关闭），跳过清单写进 manifest。
- 顶层目录名两种：`UserManagement` 与 `UserManagement_副本`；`project_root` 自动探测并写进 manifest（prompt 用它）。
- 部分 zip 未置 UTF-8 标志位（`flag_bits & 0x800 = False`），Python 按 cp437 解出 `UserManagement_σë»µ£¼`；脚本做 cp437→utf-8 还原。
证据：`docs/dsh/evidence/agent-b/06-materials-facts.txt`。

## 5 失败与自纠清单（6 条，全部已修 + 留证）
1. **隔离判据曾经是空的**：`changed_paths` 用 `grep -E '^[<>] /'` 去匹配 `<mtime> <size> <path>` 行，永远 0 命中 ⇒ 前两轮「隔离 PASS」是无证据的。已改为 `^[<>] [0-9]+ [0-9]+ /` 并用正/反例自测。
2. **漏 `export DSH_HOME`**：22:10 首次 dry-run 时 `dsh --dump-config` 落到真实 `~/.dsh`，创建了 `~/.dsh/profiles/headless/`（4 个文件）。已修；**已按现场清单逐一删除并 rmdir，`~/.dsh/profiles/` 复原为 desktop/node_modules/web**，并在报告与交接里点名。
3. **二次运行覆盖失败**：`materials` 只读后 `rm -rf`（`-f` 静默）删不掉 ⇒ `PermissionError`。已修：`run.sh` 开跑先 `chmod -R u+w` 再删 `materials/home/out`；`prepare_materials.py` 遇只读目标给明确 `MATERIALS_FAIL` 而不是 traceback。
4. **归因模型不完整（三轮迭代）**：最初「`~/.dsh` 有任何变化即 FAIL」被宿主实例自身写入误伤（会话日志、`llm-deepseek/files-v3.json`、`memories/`、`cache/attachments/` 均实测为宿主/其它会话所写），后来加了 3 秒空窗对照 + **子进程会话 id 反证**（C1）才收敛。控制实验：单独跑一次隔离子进程（`DSH_HOME=/tmp/dsh-b-dev/home`，`say OK`）→ `~/.dsh` 变化 **0 行**，`files-v3.json` mtime 不变。
5. **bash 3.2 多字节变量名坑**：`"$VAR（中文" ` 会被当成一个变量名 ⇒ `unbound variable`；本机 `/bin/bash 3.2.57`。已写脚本全量扫描并把 8 处改成 `${VAR}`。
6. **一次行内替换事故**：改 `run.sh` 隔离日志时把 `if/else` 结构删了一半（`bash -n` 报未闭合引号）。已按行定位整块重建，`bash -n` 通过后再跑。

## 6 未验证 / 无法核验项（必须单列）
1. **PTC/desktop 形态未验证**：`DSH_TOOLS_MODE` 未设时 headless profile 的 `tools.mode` 为空；A 报告提示 desktop 会话是 PTC 形态。本轮所有「执行类不可用」结论只覆盖 `--profile headless` + 本装置 patch。
2. **子代理身份未经会话文件级核验**：子代理探针靠 stdout 行 `PROBE_SUBAGENT_REPLY=SUBPROBE=UNAVAILABLE` 证明，未解压 `home/sessions/**/*.jsonl.zstd` 核对 tool-call 记录（未做，避免额外依赖）。
3. **DB 凭据 fallback 未走到**：`env` 与 `~/.dsh/.credentials.yaml` 都有值，`key_from_db()` 本轮未被触发，属未实测代码路径。
4. **平台链路未接**：本装置只证明「隔离实跑 + 产物落盘 + 校验」可行；`server/src/services/projectGrading.js` 的真实评分链路本轮未接、未改（A 的事实核验仍成立）。
5. **数据集结论的适用性**：`实验/` 是上一会话现场，其 62 份提交的语义（谁是谁）无法核验；本报告只把它当物料，不当证据。

## 7 参考 /tmp/rejected-campaign-2026-10-11 的取用与独立验证
- **取用（3 点，均为方向而非逐字复制）**：① 隔离 home 里放 `.credentials.yaml` 承载 `DEEPSEEK_API_KEY`（`chmod 600`）这一做法；② profile 层「只禁工具行」的 patch 方向；③ 用 headless CLI 起会话跑批改、结果落 JSON 文件的形态。
- **未取用**：它的源码检出 `bin.js`（A 已判不可用，且该检出已被用户清理）、它的 8 批并行调度、它用 `sed` 从 `server/.env` 抠 `DATABASE_URL` 后 `mysql -p<明文口令>` 的取数方式（我在 fallback 里改成 `--defaults-extra-file` + `chmod 600` 临时文件 + 用完即删）。
- **独立验证方式**：不看它的结论，自己重跑 —— ① 我自己生成 dump 并写 `check_profile.py` 断言（不信它的 diff 摘要）；② 先跑最小会话（「只回 PONG」→ exit 0/stdout PONG）证明凭据与隔离可用，再上批改；③ 隔离性用空窗对照 + 子进程会话 id 反证；④ 物料事实（62 份/6 摘要/21 份同标准包/编码乱码）全部由本轮脚本重新计算。

## 8 精读范围与上下文预算
读过的文件（≤12 个 / ~460 行）：`docs/dsh/00-铁律与上下文预算.md`(33 行全文)、`docs/dsh/R0-A-事实核验.md`(43–102 行，§3–§7)、
`docs/dsh/evidence/agent-a/01-dsh-runtime-probes.md`(111 行)、`实验/评分标准.md`、`实验/题目描述.md`(前 60 行)、
`/tmp/rejected-campaign-2026-10-11/{dsh-d1-setup.sh,dsh-d1-run.sh,dsh-d1-run-all.sh}`(3 个小文件)、
以及本轮自己产物的片段（dump-config 节选、profile-check、会话 stdout 末尾）。未读：`node_modules`、`client/dist`、
`tests/`、任何 `.log` 全文、A/C 的其它证据文件全文。
报告体积：本文件行数与字节数见交付说明；超长证据已外置 `docs/dsh/evidence/agent-b/01–06`（共 11.7 KB）。
