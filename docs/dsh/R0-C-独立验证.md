# R0-C 独立验证（Agent C · 不采信 B 自测，逐条自跑）

## 结论摘要（10 行）
1. **verdict = needs_revision**；findings：**1 高 + 3 中 + 1 低**（另 2 条观察）。无阻断缺陷：装置在两条契约命令下真实跑通，且我没有发现空判据。
2. 【已实测】工具隐藏：patched 主会话/子代理 canary 均 absent 且自述 UNAVAILABLE；**未加固阳性对照 canary PRESENT** ⇒ 探针能测出「可执行」，不是空判据。
3. 【已实测】隔离：批改 79s 内我自建 watch.py 采样 33 次——新增监听 0、run.sh 进程树触碰 ~/.dsh 0 次；内容哨兵（从不打印）在 ~/.dsh 全树 0 命中；宿主 830/890 存活、:19387 仍监听。
4. 【已实测】物料 444/555（61 文件 / 25 目录，0 可写）、来源 `实验/` 指纹对拍不变、同 workdir 连续两次运行均 rc=0。
5. 【已实测】边界：超时 15s→124+orphan=0；产物畸形→1；缺产物→1；非 0 退出且无产物→1；**非 0 退出但有合法产物→0(PASS)**；缺凭据→2；CLI 层缺凭据→1。
6. 【已实测】A 的承重事实复算 7 条：相同 6 条、含边界修正 1 条（rubricItems 首次生成后写回 Question 成为缓存）。
7. **分数不可复现**：同一提交 62/56/59/56（我这次 56/100）⇒ R0 只能做结构性验收，分数不能当判据。
8. 「看起来通过但其实没验证到」仍有一处：隔离归因把 `cache/ memories/ llm-deepseek/` 下**任何**变化无条件算宿主（高）——已用装置自身代码最小复现。
9. 探针 `scripts/dsh-verify/`（10 文件）；长证据外置 `docs/dsh/evidence/agent-c/01–08`。
10. 两条 verify 命令我都真跑：`bash scripts/dsh-grader/probe.sh`（无参原样）exit 0 = PROBE_RESULT=PASS；`run.sh --submissions 1 --workdir /tmp/dsh-r0-verify --timeout 900` exit 0。

## 1 方法与边界（读过的文件 / 行段）
- 自建探针 10 文件（独立于 B）：`vlib.sh`(隔离 home/指纹/端口/自研硬超时)、`watch.py`(0.5s 采样端口 + 逐 pid lsof 触碰 ~/.dsh)、`t1-toolhide.sh`、`t2-isolation.sh`、`t3-concurrency.sh`、`t4-boundary.sh`、`t5-contract-run.sh`、`t6-probe-watch.sh`、`stub-dsh.sh`(故障注入假 CLI，不联网)、`facts-a.sh`(只读 SELECT+LIMIT 1)。
- 哨兵法：随机串只写进 prompt 文件与模型回复，**从不打印**；跑完在 ~/.dsh 全树 grep（排除宿主会话目录）⇒ 专补 `classify_changes.py` 的归因盲区。
- 精读：`scripts/dsh-grader/` 8 个入口/库文件（约 1100 行）+ `prepare_materials.py`(grep 抽 20 行) + `projectGrading.js`(44–79/225–246/452–531) + `schema.prisma`(218–241) + `system-config.repository.js`(28–57)；R0-B 报告只读 §4–§8(117–157 行)。
- 未做：未改 B 任何文件或业务代码；未 install/构建；未执行学生代码；未写 ~/.dsh；未占用 :5173/:3000/:19387；未 kill 任何进程。

## 2 B 的声明逐条三态（证据全部来自我自己跑的命令）
| # | B 的声明 | 我的独立判据（命令 → 输出摘要） | 三态 |
|---|---|---|---|
| B1 | probe.sh exit 0：主+子代理 canary 缺失且自述 UNAVAILABLE；dump-config 断言 4 个执行行 disabled | `bash scripts/dsh-grader/probe.sh`→ rc=0，7 条 PASS，`PROBE_RESULT=PASS failures=0`；我自跑 dump-config：patched 4 行 disabled，未加固对照 `disabled: !!js process.platform === 'win32'` 且 check_profile FAIL 4 项 | **复现** |
| B2 | run.sh --submissions 1 → exit 0，模型自写 grading-result.json，9 项 | `run.sh --submissions 1 --workdir /tmp/dsh-r0-verify --timeout 900`→ rc=0，`EXTRACT_OK=1 items=9 total_score=56 source=file elapsed=79s`，JSON.parse 通过 | **复现（结构）**；分数不同（见 §10） |
| B3 | 隔离 PASS：changed 全归因宿主、child_write=0、other=0、0 新增端口 | 我自己的 watch+指纹：`new_listeners=0`、`child_write_in_home=0`、`changed_lines=4`（全部宿主 journal）、`orphan=0`；probe.sh 侧 `isolation-dsh-home-untouched before=7808 after=7808 changed=1 other=0` | **复现**（但判据强度不足→F-C1） |
| B4 | --timeout 20 → 124 + 明确日志 + orphan=0 | 我用 `--timeout 15`：rc=124，日志 `TIMEOUT：丁静45 超过 15s 未完成，子进程组已被终止（orphan=0）`，无 grading-result.json，我的 orphan_count=0 | **复现** |
| B5 | 凭据只读既有配置、chmod 600、退出即删、双通道扫描 0 命中 | 9 次真实/stub 运行后 `cred_leftover=no`；我自写扫描（明文精确比对 + sk- 形态）1317 文件 **0 命中**；`probe.sh` 自带 `credentials-cleaned` PASS | **复现** |
| B6 | 物料只读 444/555，run.sh 重建 workdir 三目录（设计） | 我的统计 `dirs=25 writable_dirs=0 files=61 writable_files=0`；来源 `实验/` 全树 sha256 before==after；同 workdir 二次运行 rc=0/rc=0 | **复现** |
| B7 | 未改业务代码 / 未 install / 未构建 | `git status --porcelain`：改动仅 `client/*` 11 文件（并行会话前端改造，非 B），`server/src` 改动 **0**；无新增依赖/构建产物 | **复现** |
| B8 | 自纠①：误写 `~/.dsh/profiles/headless` 4 文件已删除并 rmdir 复原 | `ls -la ~/.dsh/profiles/` = desktop/node_modules/web（无 headless、无散落文件，含隐藏项）；22:05 后 ~/.dsh 全部变化落在宿主会话 slug 目录，`tmp_slug_count=0`（无 /private/tmp slug） | **复现**（详见 §4） |
| B9 | 隔离判据 =「零子进程写入 + 零未解释变化」，非「~/.dsh 零变化」 | 机制成立（空窗对照 + 子会话 id 反证确实在 run.log/isolation-report 里）；但归因规则有盲区 → **要求修复** | **复现（机制）/ 判据不足** |
| B10 | 未验证项 4 条（PTC 形态/子代理文件级/DB fallback/平台链路） | 子代理：隔离 home 内 parent+child 两个 session 目录 → **补强为复现**；DB fallback：`--dry-run` 得 `source=db:system_configs.deepseek_api_key key_len=35` → **复现**；PTC/desktop 与平台链路未核 | **部分复现 / 2 条无法判定** |

## 3 工具隐藏（C 自建，互不采信）
命令：`bash scripts/dsh-verify/t1-toolhide.sh`（3 次真实模型调用，耗时 3–5s/次）
| 用例 | profile | canary 文件（真实执行的唯一旁证） | 模型自述 | rc |
|---|---|---|---|---|
| patched 主会话 | 4 个执行行 disabled | **absent** | MYPROBE=UNAVAILABLE | 0 |
| patched 子代理 | 同上（主会话派生子代理） | **absent** | MYSUBPROBE=UNAVAILABLE | 0 |
| **阳性对照** | 同一 home **不放 patch** | **PRESENT**（`/tmp/dsh-verify-ev/t1/control-unpatched/canary-1791729189`，18B，22:33） | MYPROBE=EXECUTED | 0 |
- 阳性对照是本轮的关键：它证明「canary 缺失」不是因为探针根本测不出执行，而是因为工具真被隐藏；对照组 dump-config 里 `tool-bash` 是启用的（只对 win32 disabled）。
- patched-sub 的文件级旁证：隔离 home 内 2 个 session 目录 + session.err 4 处 `subagent` 记录 ⇒ 子代理确实被派生了（补上 B 未做的那一步）。
- 未覆盖：desktop/PTC 形态（`DSH_TOOLS_MODE` 未设时 headless 的 tools.mode 为空）→【无法判定】，与 B 的未验证项 1 一致。

## 4 隔离性（自抓，不看 B 的日志）
- 命令：`bash scripts/dsh-verify/t2-isolation.sh`（隔离会话 3s）与 `bash scripts/dsh-verify/t5-contract-run.sh`（跑真批改 79s，含 watch.py）。
- 端口：`new_listeners=0`（t2/t5/t6 三处）；watch.py 33 次采样（0.5s×，重检每 2s）全机监听集合**从未新增**；宿主 :19387 会话前后都在监听（`port_19387_lines=2`）。
- 进程树：watch.py 对 run.sh 进程树（tree_size=3）逐 pid `lsof`，`child_touch_real_home=0` 次；唯一一条 `new_home_files` 是宿主会话自己的 `~/.dsh/storages/session_projcache/sessions/.4f19bbc5….tmp`。
- 指纹：`changed_lines=4`、`child_write_in_home=0`（4 行都不含子会话 id，且落在宿主 journal 目录）；哨兵扫描 `hits=0`（跳过宿主会话目录 2 文件）。
- 宿主存活：830/890 前后都在；无新增/无 kill；`orphan=0`。
- **残留复核（队长点名）**：`~/.dsh/profiles/headless` **不存在**（`ls -la` 无隐藏项、无散落文件）；22:05 后 ~/.dsh 的变化全是宿主会话 journal（sessions/<repo-slug>/<id>/、storages/*、memories/*、llm-deepseek/files-v3.json、cache/attachments/*）；`ls ~/.dsh/sessions/` 无 tmp slug（`tmp_slug_count=0`）⇒ 无 CLI 子进程在真实 home 落过 session。
- 结论：**本轮所有真实会话的写入都落在隔离 home**（`sessions/--private-tmp-dsh-verify-ev-*--/<id>/session.v4.jsonl.zstd`、`storages/session_projcache/sessions/<id>.json`、`.anonymous-user-id`），宿主实例未被影响。

## 5 只读物料与写权限
- 物料树：`dirs=25 writable_dirs=0 files=61 writable_files=0`（444/555 生效，模型即使有 tool-fs 也写不进）。
- 来源：`实验/` 全树 sha256 清单（65 文件）跑前跑后逐行相同（`source_materials_unchanged=yes`）⇒ 装置没写坏学生提交或标准包。
- 二次运行：同一 workdir 连跑两次（stub）rc=0/rc=0 ⇒ B 的 `chmod -R u+w` 修复有效。
- 写权限落点：子进程写入仅 `<workdir>/home/**`（会话/storages/身份文件）与 `<workdir>/out/**`；**不是我原以为的「只在 out/」**——隔离 home 本身就是写入目标，属设计，但报告口径要写明。

## 6 边界四情形（+ 控制组）
命令：`bash scripts/dsh-verify/t4-boundary.sh`（stub 注入，除超时外不消耗模型调用）
| 情形 | 注入 | rc | 产物 | 判定/日志证据 |
|---|---|---|---|---|
| 控制组 | stub ok | **0** | 有，9 项 90/100 | `GRADED … source=file EXTRACT_OK=1` ⇒ 装置本身能通过 |
| 超时 | 真实 CLI `--timeout 15` | **124** | 无 | `TIMEOUT：丁静45 超过 15s…orphan=0`，我的 orphan_count=0，无残留进程 |
| 产物畸形 | stub 写坏 JSON | **1** | 无 | `EXTRACT_CANDIDATE_PARSE_FAIL` → `EXTRACT_SOURCE=none` → `EXTRACT_OK=0` |
| 产物缺失 | stub 只回复不写文件 | **1** | 无 | `EXTRACT_SOURCE=none reason=no-json-found` |
| 退出码非 0（无产物） | stub exit 3 | **1** | 无 | 批改结果校验失败，日志明确 |
| 退出码非 0（有产物） | stub exit 3 + 合法 JSON | **0** ⚠ | 有 | `GRADED … rc=3 … EXTRACT_OK=1` 且 `RUN_RESULT=PASS` ⇒ **缺陷 F-C2** |
| 凭据缺失 | HOME 空 + PATH 无 mysql | **2** | 无 | `[FATAL] 未找到 DEEPSEEK_API_KEY（env / ~/.dsh/.credentials.yaml / DB 三处皆无）`；无残留凭据文件 |
| 凭据缺失（CLI 层） | 无凭据 home 直接起会话 | **1** | — | `dsh: MISSING_CREDENTIAL…` ⇒ A 的「退出码 0–1」两端都实测到 |

## 7 并发
- 命令：`bash scripts/dsh-verify/t3-concurrency.sh`；同 workdir 的破坏用 inode 追踪单独复现。
- A) **同一 $DSH_HOME 并发两个真实会话**：都 rc=0、都回复、共享 home 内出现 **2 个独立 session 目录**、stderr 无 lock/EBUSY/EACCES 记录、orphan=0 ⇒ 当前实现下并发**不互坏、也不串行化**（各自独立会话文件；凭据/记忆文件是共享的）。
- B) **同一 `--workdir` 并发两个 run.sh**：两者都报 `RUN_RESULT=PASS` rc=0，但实测互相破坏：run1 的 `out/logs/session-s01.out`（inode 166010504）在 run2 启动后 **1 秒内消失**（run2 起手的 `chmod -R u+w; rm -rf materials/home/out`，run.sh:51-56）⇒ 无锁、工件不可归属（F-C4）。
- C) 不同 `--workdir` 并发：rc=0/rc=0，两侧产物都在 ⇒ **建议的并发闸口径 = 一次运行一个 workdir（不同 workdir 可并行；同 workdir 必须拒绝）**，并在 run.sh 加原子锁（`mkdir "$WORKDIR/.dsh-grader.lock"`）。

## 8 复核 A 的承重事实（≥5，含相同与修正）
| A 的事实 | 我的复算 | 结论 |
|---|---|---|
| rubric 未冻结：读 Question 活值 `:459/507/520`；AssignmentQuestion 仅 id+sortOrder | `:459` include 含 `scoringRubric/rubricItems/checkerScript/checkerStatus`；`:517-520` 直传评分；`schema.prisma:226-237` 仅 assignmentId/questionId/sortOrder | **相同+边界修正**：`:507` 生成后**写回** `Question.rubricItems`(`:231-246`) ⇒ 分项复用；scoringRubric/material 改动仍即时生效 |
| 边界 `checkerStatus==='ready' && checkerScript`（`:510`） | 原文一致 | **相同** |
| 实训题并发 = 64（DB ai_concurrency），注释 3/16 漂移 | 只读查询：`ai_concurrency=64`（system_configs 共 4 键）；代码 `:48-49` `let maxConcurrent = 3; // …默认 16`；`SystemConfigRepository.getConcurrency`→DB 优先/默认 16 | **相同** |
| headless 契约：stdout 末段文本/退出码 0–1/无端口/会话持久化/单任务 | `--version`=0.2.0-rc.2；批改 exit 0、stdout 末段=模型文本；79s 内 0 新增监听；隔离 home 生成 `sessions/…/session.v4.jsonl.zstd`；缺凭据 exit **1**；`--help` 有 `dsh headless "run the tests"` | **相同** |
| $DSH_HOME 隔离范围（profiles/storages/sessions/skills/凭据/身份；不含安装包与 ~/.agents/skills） | 隔离 home 实测出现 profiles/、sessions/、storages/、`.anonymous-user-id`、`.credentials.yaml`(600 退出删)；未生成 skills 目录；`~/.agents/skills`(5)、`~/.dsh/skills`(38) 在真实家目录 | **部分相同**：5 项复现；skills 读路径**无法判定** |
| 执行类工具可在 profile 层隐藏（disabled: true，id-only 与 id+name 均生效） | id-only：patched dump 4 行 disabled + 模型级双探针 + 阳性对照；「id+name 形式」未构造 | **id-only 复现**；id+name **无法判定** |
| 平台真正生效凭据 = DB system_configs.deepseek_api_key（≠ server/.env） | 只读查询：DB key len=35 md5=c9cf1471a2b7；`server/.env`=cfc4a9bd4231；`~/.dsh`=ba6c53571452——三者互不相同；代码 `system-config.repository.js:45` DB 优先 ENV 兜底；装置 DB fallback 实测触发 | **相同+补强** |
| 链路：`enqueueProjectGrade` 异步 `setImmediate`、无持久化队列（`:417/423`） | `projectGrading.js:417` 注释 + `:423 setImmediate(() => {` 原文 | **相同** |

## 9 缺陷清单（分级 + 最小复现 + 复发判据 + 要求修复）
**F-C1（高）隔离归因盲区：子进程写 `cache/ memories/ llm-deepseek/` 会被判成宿主，隔离可能假 PASS**
- 最小复现（不触碰 ~/.dsh）：用 C 的 07 证据合成 diff（「子进程写 `<real>/.dsh/cache|memories|llm-deepseek/x`」）喂给装置自己的 `classify_changes.py` → 三条全落 `__HOST__`，只有含子会话 id 的落 `__CHILD__`（`classify_changes.py:69-80` C2/C5）。
- 复发判据：若再次出现「DSH_HOME 未隔离」，而子进程只写 journal 目录，则 `out/isolation-report.txt` 仍会输出 `verdict=PASS`、`changed_other=0`。
- 要求修复：C2/C5 不得无条件归 HOST——journal 目录内的变化必须由「空窗对照同路径」或「路径含宿主会话 id」支撑，否则记 `UNATTRIBUTED` 并判 FAIL；另把「子进程会话 id 反证」扩展为「隔离 home 内 session id 集合 ∪ 内容哨兵扫描（C 已实现，可移植）」。
- 本轮影响：**不改变本轮结论**（我的哨兵扫描 0 命中、无 tmp slug），但装置自身判据不足以自证。

**F-C2（中）会话非 0 退出仍输出 RUN_RESULT=PASS**
- 最小复现：`STUB_MODE=nonzero_without bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/x --dsh-bin scripts/dsh-verify/stub-dsh.sh` → rc=0 且 `GRADED … rc=3 … EXTRACT_OK=1`（run.sh:175-180 只把 124/timeout 当失败）。
- 复发判据：`out/run.log` 出现 `session 结束：rc=[1-9]`（非 124）同时 `RUN_RESULT=PASS`／`RUN_EXIT=0`。
- 要求修复：`CHILD_EXIT != 0` 时 `FINAL_RC` 至少 1（或引入 `RUN_RESULT=PARTIAL` 并返回非 0），并把 child_exit 写进 summary/isolation-report。

**F-C3（中）无「DSH_HOME 必须已设置且 ≠ ~/.dsh」硬断言（历史事故可复发）**
- 最小复现：`bash -c '. scripts/dsh-grader/lib.sh; echo "DSH_HOME=$DSH_HOME"'` → 打印真实 home（继承环境），此时任何 `dsh` 调用都写真实 home；`scaffold_home`/`install_credentials` 接受任意路径（传 ~/.dsh 会**覆盖用户的 .credentials.yaml**）。
- 复发判据：`~/.dsh/profiles/headless` 再现；或 `~/.dsh/sessions/` 出现 tmp slug；或 `~/.dsh/.credentials.yaml` mtime 被装置改动。
- 要求修复：lib.sh 顶部加 `guard_isolated_home()`：DSH_HOME 非空、**≠ $DSH_HOME_REAL**、且位于 `<workdir>` 或 `/tmp|/private/tmp` 下，否则 die；`scaffold_home`/`install_credentials`/`dsh_bin` 前置调用；run.sh/probe.sh export 后立即断言。

**F-C4（中）同一 --workdir 无并发闸 → 互删 in-flight 工件，两边却都报 PASS**
- 最小复现：见 §7 B（inode 追踪：run1 的 session 日志在 run2 启动后 1s 内消失）。
- 复发判据：同 workdir 两个 run.sh 时间窗口重叠，且 `out/` 里出现 `RUN_RESULT` 与 `session 结束` 行数不匹配/工件 mtime 落在两次运行之间。
- 要求修复：run.sh 起手用原子锁（`mkdir "$WORKDIR/.dsh-grader.lock"` 失败即 die，trap 删除）；文档写明「一次运行一个 workdir」。

**F-C5（低）契约产物允许 stdout 回退：模型不写文件也能通过**
- 最小复现：`STUB_MODE=stdout_only`（只打印合法 JSON、不写文件）→ rc=0，`EXTRACT_SOURCE=stdout`，`model-artifact-s01.json` 不存在（`extract_result.py:97-104`）。
- 复发判据：`EXTRACT_SOURCE=stdout` 出现在 run.log（`GRADED … source=stdout`）。
- 要求修复：明确 R0 验收是否要求「模型自写文件」；若要求，source=stdout 应记 PARTIAL 或在报告中单列。

**观察（非缺陷）**：① 分数不可复现（四次 62/56/59/56），R0 验收口径应固定为「结构 + 隔离」；要分数可用需先接 `ensureRubricItems` 固定分项/冻结 rubric 并取多次中位数。② `extract_result.py` 对 items 求和只给 `VALIDATE_WARN`——结构验收可接受，但不能据此宣称「分数可信」。

## 10 verdict 与回流 B
- **verdict = needs_revision**（findings：F-C1 高 / F-C2·F-C3·F-C4 中 / F-C5 低）。理由：装置本身可跑通、B 的 9 条主要声明我全部复现，但 F-C1 让「隔离 PASS」在一种已发生过的失败模式下会假通过，F-C2 让崩溃会话被判成功，二者都会把错误结论带进 R1。
- 回流 B 条目（按优先级）：① 加固隔离归因（F-C1）；② 非 0 退出不算成功（F-C2）；③ DSH_HOME 硬断言（F-C3）；④ workdir 原子锁 + 并发口径（F-C4）；⑤ 明确 stdout 回退口径（F-C5）。
- 需要用户/队长拍板的点：R0 验收是否要求「模型自写文件」（决定 F-C5 的处置）；分数是否进入判据（决定是否引入固定分项与多次取中位数）。

## 11 未核验项与预算
- 无法判定：desktop/PTC 形态的执行工具隐藏；`~/.agents/skills` 是否被隔离会话读取（我只证明隔离 home 未创建 skills 目录）；`id+name` 形式的 patch 生效性；平台评分链路（R0 范围外）。
- 预算：报告本文件；长证据 8 个文件（`docs/dsh/evidence/agent-c/01–08`，合计 ≈32 KB，正文只引路径+摘要）；本报告未超 300 行/20 KB；命令输出一律 head/tail。
- 模型调用消耗：`probe.sh` 2 次/次运行（主会话+子代理；我跑了「带参」与「原样无参」两遍）、`run.sh` 1 次；自建探针 7 次（t1 patched 主/子/阳性对照各 1、t2 隔离 1、t3 两并发 2、t4 超时 1），stub 各例零调用。
