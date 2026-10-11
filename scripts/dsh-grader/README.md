# scripts/dsh-grader —— DSH 作业级批改的隔离实跑装置（R0-B）

**定位**：在**不碰用户正在运行的 DSH 实例**（`~/.dsh`）的前提下，用隔离 `$DSH_HOME` + 加固 profile
起一次真实 headless 会话，跑通「标准工程包 + 学生提交 → 批改结果 JSON」的最小闭环。

## 入口

| 命令 | 作用 | 退出码 |
|---|---|---|
| `bash scripts/dsh-grader/probe.sh [--workdir 目录] [--timeout 秒]` | 双探针（主会话 + 子代理）实测「执行类工具不可用」+ 隔离旁证 | 0=全 PASS；1=有 FAIL；2=用法错误 |
| `bash scripts/dsh-grader/run.sh [--submissions N] [--timeout 秒] [--workdir 目录] [--source-dir 目录] [--dry-run]` | 只读物料 + 隔离批改 + 产物落盘 | 0=成功；124=会话超时；1=批改/隔离失败；2=用法错误 |

约定：`run.sh --submissions 1` 的契约产物是 `<workdir>/out/grading-result.json`（可 `JSON.parse`）。

## 目录产物（全部在 --workdir 下，仓库不落运行产物）

```
<workdir>/materials/          只读物料：standard/ + submissions/sNN/ + rubric.md + assignment.md + materials-manifest.json
<workdir>/home/               隔离 DSH_HOME（profiles/headless/cordis.patch.yml 由本装置生成）
<workdir>/out/grading-result.json   批改结果（--submissions 1）
<workdir>/out/results/sNN.json      每份提交的规范化结果
<workdir>/out/run.log               运行日志
<workdir>/out/logs/                 dump-config / profile-check / session-*.out|err / extract-*.txt / prompt-*.txt
<workdir>/out/isolation-report.txt  隔离旁证（~/.dsh 指纹 diff 分类 + 端口 diff）
```

## 隔离设计（每条都有可复算判据）

1. **`$DSH_HOME` 隔离**：脚本 `export DSH_HOME=<workdir>/home`，CLI 的 profile/session/storage/凭据全部落在这里。
   旁证：`run.sh`/`probe.sh` 跑前后对 `~/.dsh` 做 mtime+size+path 指纹 diff，并写入 `out/isolation-report.txt`。
   *注意*：宿主桌面实例自己会持续写它的会话日志（`~/.dsh/sessions/<cwd>/<宿主 session id>/*`、
   `~/.dsh/storages/session_projcache/sessions/<宿主 session id>.json`）；脚本按 `$DSH_SESSION_ID` 把这类变化
   单独归类为 `changed_host_session_journal`，只有 `changed_other` 必须为 0 才算隔离通过。
2. **执行类工具禁用**：`home/profiles/headless/cordis.patch.yml` 只禁用工具/执行行
   （`tool-bash`、`tool-jobs`、`ptc-runtime`、`workflow-ptc`），保留 `tool-fs`、`shell-env`、`subagent` 等服务行。
   判据：`check_profile.py` 对 `dsh --dump-config` 输出逐 id 断言，任一条不满足则 `run.sh` 直接拒绝开跑。
3. **物料只读**：`prepare_materials.py` 复制（不软链）源 zip 到工作区，解压后整体去写位（文件 444 / 目录 555）。
4. **凭据**：只从既有配置读 `DEEPSEEK_API_KEY`（`env` > `~/.dsh/.credentials.yaml` > DB `system_configs`），
   写到 `<workdir>/home/.credentials.yaml` 时 `chmod 600`，脚本退出（含异常路径 trap）即删；
   运行结束还会做「明文值精确比对 + sk- 形态比对」的泄漏扫描。日志只打印长度，不打印值。
5. **硬超时**：`run_with_timeout.py` 让子进程独立成进程组，超时 → SIGTERM 整个进程组 → 宽限 10s → SIGKILL，
   并复检进程组是否残留（`RUNNER_ORPHAN=0/1`）；超时退出码 124。
6. **不执行学生代码**：本装置只读文本、只调用模型，不含任何 `npm/node/vite` 执行路径。

## 物料来源与已知瑕疵（实测）

默认物料源为仓库内 `实验/`：`标准工程包.zip` + 学生提交 zip + `评分标准.md` + `题目描述.md`。
实测（2026-10-11）：该目录 63 个 zip 只有 6 个不同摘要，其中 **21 个与标准工程包逐字节相同**，
另有 20/19 份各自相同；`prepare_materials.py` 默认跳过「与标准包逐字节相同」的提交（`--allow-identical` 可关闭）。
压缩包顶层目录名有 `UserManagement` 与 `UserManagement_副本` 两种，且部分 zip 未置 UTF-8 标志位
（Python 会按 cp437 解出乱码），脚本对这两点都做了处理，并把 `project_root` 写进物料清单供 prompt 使用。
可用 `--source-dir` 换源（例如 `--source-dir 注入测试集`）。

## 依赖

macOS 自带 `python3`、`bash 3.2`、`lsof`、`unzip`（`unzip` 仅用于人工核验，脚本内部用 Python zipfile）。
不依赖 `timeout`/`gtimeout`（macOS 无 GNU coreutils），不安装任何依赖。


## R0-B2 加固（C 的 F-C1..F-C5，2026-10-11）

### 新增入口
| 命令 | 作用 | 退出码 |
|---|---|---|
| `bash scripts/dsh-grader/selftest.sh` | 零模型调用的自测/回归网（F-C1..F-C5，全部走 `stub-dsh.sh`） | 0=全 PASS；1=有 FAIL |
| `run.sh ... --allow-stdout-fallback` | 显式允许「模型没写文件时从 stdout 兜底」（默认关闭） | 同 run.sh |

### 判据变更（只强不弱）
1. **F-C1 隔离归因可证伪**：`classify_changes.py` 不再对任何目录无条件豁免。每条变化必须落到
   R1/R2（路径/内容指纹 → CHILD）、R3（真实 home 下的 profiles/ → CHILD）、R4（会话 id ≠ 子会话 → HOST）、
   R5（空窗对照同路径 → HOST）、R6/R6b（宿主共享存储且内容窗口干净 / 本次是删除 → HOST）、
   R7（无法归因 → UNATTRIBUTED，判 FAIL）、R8（不在真实 home 下 → OTHER，判 FAIL）。
   输出四段 `__CHILD__/__UNATTRIBUTED__/__OTHER__/__HOST__` + `__REASONS__`（逐条判据）+ `__SUMMARY__`；
   `out/isolation-report.txt` 只有在三段全空且无新增端口时才 verdict=PASS，并给出 `verdict_reasons`。
   阳性对照：`DSH_GRADER_SIMULATE_LEAK={profile-dir|workdir-slug|content-fingerprint}` 会在**沙箱真实 home**
   （`DSH_GRADER_REAL_HOME` 必须指向临时目录）模拟一次「未隔离写入」，装置必须报 isolation=FAIL；
   `host-delete` 是反向对照（宿主删除，应 PASS）。
2. **F-C2 退出码**：任何 `rc≠0`（含 124 超时）都不判 PASS；摘要新增 `RUN_EXIT_CODE`/`reason`/`RUN_CHILD_EXITS`/`RUN_RESULT_SOURCE`；
   失败运行**不写** `out/grading-result.json`（制品只留在 `out/results/` 供诊断）。
3. **F-C3 DSH_HOME 硬护栏**：`guard_isolated_home()` 在任何 DSH 调用之前断言 DSH_HOME 非空、绝对路径、
   ≠ 真实 home（`DSH_GRADER_REAL_HOME` 或 `~/.dsh`）、≠ $HOME、且位于临时目录下；
   `dsh_bin`/`scaffold_home`/`install_credentials` 都前置调用；可用 `DSH_GRADER_ISOLATED_HOME` 覆盖隔离 home（同样要过护栏）。
4. **F-C4 workdir 原子锁**：`mkdir "$WORKDIR/.dsh-grader.lock"` 原子获取；同 --workdir 的第二次运行立即失败并指出占用者 pid；
   锁内清理（materials/home/out）只发生在拿到锁之后；陈旧锁（owner pid 已死）自动接管并留痕。
5. **F-C5 stdout 回退**：默认关闭且不可静默；只有显式 `--allow-stdout-fallback` 才回退，且
   `extract-<slug>.txt` 与摘要都会写明 `EXTRACT_FALLBACK=explicit`/`RUN_RESULT_SOURCE=<slug>:stdout-fallback/explicit`。

### 自测覆盖（零模型调用）
护栏（5 条库级 + 2 条脚本级拒绝，且断言拒绝时 stub 未被调用）、并发锁（第二次立即失败 + 首次 in-flight 工件存活 +
首次成功 + 退出后锁释放）、非 0 退出码（摘要/退出码/无契约产物/诊断保留）、stdout 回退（默认拒绝 + 显式允许 + 摘要可见）、
隔离归因（3 阳性必须 FAIL + 2 阴性必须 PASS + classifier 单元四态 + 分段断言）。

## R3/R3.5：造尺、闸与作业级流程（本文件此前未记录，补齐于此）

### 开关
| 开关 | 作用 |
|---|---|
| --checker-mode per-submission（默认） | 逐份会话造尺 + 量尺（R0/R3 行为，保持兼容） |
| --checker-mode build-and-measure | 作业级：一次造尺（**不看学生提交**）→ C8 全量可量性预检 → 固化 → N 次零 LLM 量尺 → 作业级产物 |
| --checker-mode measure-only-reuse | 复用上一步的 out/assignment/checker.frozen.json（零模型调用；manifest 是锚点，被篡改 ⇒ exit 3） |
| --checker <checker.json> | 用既有尺子直接量尺（跳过造尺会话） |
| --max-rebuild K | 造尺不合格时在新会话重造的次数（默认 1，硬上限 2；每次重造附上一轮 VIOLATION 原文） |
| --strict | 部分提交不可量 / 单份失败 ⇒ 退出码 1（默认不判整作业失败，只标 UNATTRIBUTED/UNMEASURABLE 计数） |
| --allow-score-only | 兼容旧「只产分数」模式（默认关闭；摘要 MODE=score-only，投影标 comparable_within_checker=false） |
| --allow-stdout-fallback | **只作用于逐份提取层**（measure extract）；score-only 走投影（需 out/results/<slug>.model.json），不受该开关影响 |
| --submissions N --workdir W --timeout 秒 | 作业级 N 份提交 / 工作目录 / 单份造尺会话硬超时 |

### 合格判据 C1–C8（shape_gate.sh / shape_checks.py）
| # | 判据 | 失败语义 |
|---|---|---|
| C1 | 会话产出的 out/checker/checker.json 通过 scripts/dsh-checker/validate.py | 不合格（exit 5，可重造） |
| C2 | checker_id 由第二个进程独立复算一致 | 不合格 |
| C3 | rubric_hash / standard_hash 锚定物料（复用 validate.py 的哈希口径；提示里直接给字面值） | 不合格 |
| C4 | sum(predicates[].max_score) <= scoring.max_score，差额须由 deductions/_note 解释；rubric 写了满分则须相等 | 不合格 |
| C5 | 无 T1 类型（rule_type 属于 T0 八种） | 不合格 |
| C6 | 覆盖率可读、引用不悬空、uncovered 字段存在 | 不合格 |
| C7 | out/checker/ 内无可执行文件（只允许 .json/.txt/.md） | 不合格 |
| C8 | **可量性探针**：对该作业**每一份**提交零 LLM 试跑一次与量尺相同的 check.py 调用 | 全员不可量 ⇒ 不合格（exit 5，可重造）；部分不可量 ⇒ 逐份标 UNMEASURABLE + 计数（--strict ⇒ exit 1） |

### 作业级产物（build-and-measure / measure-only-reuse）
- out/assignment/checker.frozen.json（字节复制）+ assignment-manifest.json（checker_id / frozen_sha256 / materials digest / 每份 zip_sha256 / c8 摘要 / mode）
- out/measure/<slug>.json（checker-result/1）+ out/grading-result/<slug>.json（平台兼容投影）+ out/grading-results.json（数组）
- out/assignment/reconciliation.json（逐份矩阵 + 计数 + uncovered_sections）、comparability.json（**单一 checker_id** + comparable_group + policy）、out/checker/coverage.json
- 汇总行：ASSIGNMENT_RESULT=PASS|PARTIAL|FAIL N=… MEASURED=… FAILED=… UNMEASURABLE=… CHECKER_ID=… MODEL_CALLS=… MEASURE_CALLS=0

### 口径（不得被下游误用）
- uncovered 段落按**未评估**处理：不计入满分基数、不得当 0 分也不得静默算满分（投影里给 assessment_base）。
- canonical_sha256 **只用于同一份提交跨遍比对**；跨份比 canonical 无意义（各份 digest 与内容相关）。
- 尺子版本对外可见形式：checker_id 短哈希（前 12 位）。
- 退出码：0=PASS/PARTIAL；1=--strict 下的 PARTIAL/单份失败；3=frozen 被篡改；5=造尺不合格；124=造尺超时。

### E-H：同尺同内容的一致性口径与四项明确不保证（与 docs/dsh/R3.5-B-实施记录.md §5.3 同口径）
- **保证**：同一 workdir + 同一 frozen checker + 同一提交 ⇒ 逐遍 canonical_sha256 相同（E-F 实测逐位一致）；跨 workdir 只要 materials digest 与 frozen 相同，结论同样成立（canonical 不依赖绝对路径）。
- **不保证（四项）**：
  1) **目录增删改名**（含权限/软链变化）会改变 submission.digest ⇒ canonical 随内容变；
  2) **跨 OS / 跨 Python 版本**未验证（排序、locale、hash 随机化差异可能影响结果）；
  3) **zip 内非 UTF-8 文件名**：解压名修复只在同一版本内确定；
  4) **文件时间戳 / 属主**不参与 digest，但**不承诺**在任何文件系统上都不参与。
