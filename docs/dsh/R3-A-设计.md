# R3-A 设计：造尺侧接线（会话产出 v1 合规 checker.json）+ 端到端「一次造尺、多次量」

## 摘要（≤10 行）
1. 缺口：R0 的会话只产 `grading-result.json`（分数），**从未验证过会话能造出契约合规、可被确定性执行器复用的尺子**。
2. 本设计把「造尺」变成**可验收的产物**：会话必须写出 `out/checker/checker.json`（v1）+ `rubric-coverage.json` + 分数投影；装置用 `validate.py` **独立复证**，不合格**不得静默降级**。
3. 合格判据 7 条（C1–C7）：validate 通过 / `checker_id` 第二进程可复算 / rubric+标准包哈希锚定物料 / 分值与满分一致 / **无 T1 类型** / 覆盖率可读且未覆盖项显式列出 / 产物目录无脚本（防"模型自己写个执行器"）。
4. 提示改造要点：现有 prompt 把 rubric 写死成「共 9 项、id 1..9」（`run.sh:181/191/208`）且「只允许写一个文件」（`:188`）——必须改为「按 rubric 段落覆盖 + 三类产物 + 字段/类型白名单 + 会话内自检」。
5. 失败口径：造尺不合格 ⇒ 退出码 **5**、**不写** `grading-result.json`、产物进 `out/diagnostics/`；允许 `--max-rebuild K`（默认 1）在**新会话**重造，超 K 即 FAIL。
6. 实验 E-A…E-E 全部可证伪：造尺合规与 id 复算、同尺×同提交 ×5 位级一致、**全量 63 zip（52 唯一）连跑两遍**逐位一致、无害变体阴性对照（不得系统性误扣）、四态覆盖率（未覆盖必须报出）。
7. 量尺阶段**零 LLM**：E-B/E-C/E-D 只跑 `scripts/dsh-checker/`（纯 stdlib、可离线）。
8. 施工单 8 条，路径限 `scripts/dsh-grader/**` + `docs/dsh/evidence/agent-b/**`；不改 `scripts/dsh-checker/**`（只调用）、不改 `server/**`。
9. 平台侧（checker 入库表、作业级触发、冻结 A/B/C）**不在本任务**，依赖见 R2-A 施工单。
10. 需拍板 5 点（§6）：K 上限、d3 差异是否算失败、rubric 段落切分粒度、是否保留 `--allow-score-only`、投影兼容 vs 重构。

## 1 造尺契约（会话内必须产出什么、什么算合格）
### 1.1 目录布局（全部在 `<workdir>/out/`，仓库不落运行产物）
```
out/checker/checker.json             # 尺子本体（checker/1）：唯一权威产物
out/checker/checker.provenance.json  # {session_id, model, created_at, generator, self_check:{cmd,stdout_tail,checker_id},
                                     #  inputs:{rubric_hash, standard_hash, manifest_digest}}
out/checker/rubric-coverage.json     # {sections:[{sid, sha256, head, state, predicates:[ids]}], uncovered:[sid…]}
out/results/<slug>.json              # 量尺产物（checker-result/1；含 items/matrix/canonical_sha256）
out/reconciliation/matrix.json       # 逐谓词对账矩阵 + 四态计数
out/grading-result.json              # 平台兼容投影（保留现有 items/total_score/max_score/submission_id 形状）
out/logs/prompt-*.txt validate-*.txt session-*.out|err   out/run.log   out/isolation-report.txt
out/diagnostics/shape-fail-*/        # 造尺失败时的原文归档（checker + validate 输出）
```
### 1.2 合格判据（每条都有命令；任一条不过 ⇒ FAIL，不得带病量尺）
| # | 判据 | 命令/口径 | 失败语义 |
|---|---|---|---|
| C1 | checker 通过契约校验 | `python3 scripts/dsh-checker/validate.py <out/checker/checker.json>` → exit 0、stdout `VALID=yes`、无 `VIOLATION` 行（CLI 契约见 `validate.py:303-314`） | exit 3 = 契约不合格 |
| C2 | `checker_id` 可被**第二个进程独立复算** | 另起进程（不同 cwd、`env -i`）再跑 C1 的 validate 取 `checker_id=`；与 provenance 中记录一致；模型手写不一致会被 `validate.py:288-294` 判 `checker_id_mismatch` | id 不一致 = FAIL |
| C3 | 输入锚定：rubric 与标准包哈希必须等于装置对物料的哈希 | `rubric_hash == content_sha256(materials/rubric.md)`；`standard_hash == dir_sha256(materials/standard, ignore)`；**必须复用** `validate.py:45-58 / :111-132` 的实现，禁止另写一套 | 不匹配 = 换尺未察觉 |
| C4 | 分值与满分一致 | `scoring.max_score == 物料满分`；`sum(predicates[].max_score) ≤ max_score`，差额必须由 `deductions` 或 `_note` 显式解释 | 分值飘 = 分数不可比 |
| C5 | **无 T1 类型** | `predicates[].rule_type ⊆ T0_RULE_TYPES`（`validate.py:25-26`） | 出现 T1 = FAIL（不许等 `check.py` exit 6 才发现） |
| C6 | 覆盖率可读且未覆盖显式 | `rubric-coverage.json` 引用的每个 predicate id 必须存在于 checker；`uncovered[]` 必须逐条列出（非空不自动 FAIL，但必须进摘要） | 引用悬空 = FAIL |
| C7 | 产物目录无脚本 | `find out/checker -type f -perm -u+x` 必须为空；只允许 `.json` 与 `.txt` | 出现可执行文件 = FAIL（防"模型自带执行器"） |
### 1.3 失败处理（不得静默降级）
- 任一条不过：`FINAL_RC=5`（新码，语义="造尺不合格"）、**不写** `out/grading-result.json`（沿用 `run.sh:361-365` 的 F-C2 口径：失败不产契约）、把 checker 原文 + `validate` 全文复制到 `out/diagnostics/shape-fail-<slug>/`。
- **禁止**的两种降级：① 装置自动删字段/改类型让校验通过；② 回落到 R0 的"只产分数"模式（除非显式 `--allow-score-only`，且 summary 必须出现 `MODE=score-only`）。
- 允许的回流：`--max-rebuild K`（默认 1，上限 2）在**新会话**重造，prompt 里附上一版 checker 与 `VIOLATION` 原文；每次重造都要重跑 C1–C7。

## 2 提示/模板改造点（现状锚点：`run.sh:177-210`）
| 现状（本轮自数） | 问题 | 改法 |
|---|---|---|
| `run.sh:181`「评分标准（满分 100，共 9 项）」、`:191`「确认 9 项」、`:208`「items 必须正好 9 项、id 依次 1..9」 | **硬编码 9 项**，与 rubric 真实结构脱钩 ⇒ 覆盖率无法表达 | 删掉 9 项硬编码；改为"谓词与 rubric 段落一一对应（允许合并，但必须写进 rubric-coverage.json）" |
| `run.sh:188`「只允许写一个文件：grading-result.json」 | 放不下尺子 | 改为"只允许写 `out/` 下三类产物：checker.json / rubric-coverage.json / grading-result.json" |
| `run.sh:197-206` 现有 schema（`schema_version:1 + items + total_score`） | 与 checker/1 是两套 | 保留为**投影**，并要求 `items[].id` 引用 checker 的 predicate id（可追溯） |
| 无字段白名单 | 模型自创字段/类型无法防 | 提示里**照抄** `validate.py:23-42` 的 `TOP_FIELDS / T0_RULE_TYPES / PARAMS / AGGREGATES / ROUNDINGS`，并写死"自创字段、自创 rule_type、大括号 glob、反向断言正则会直接导致 `VALID=no`（exit 3），本次批改作废" |
| 无自检 | 模型不知道合格线 | 要求模型写完后**自己跑** `python3 <repo>/scripts/dsh-checker/validate.py <workdir>/out/checker/checker.json`，把 stdout 原样写进 `provenance.self_check`；装置**再独立跑一次**（C2） |
| 无覆盖率要求 | 漏检静默 | 要求产出 `rubric-coverage.json`，四态（covered/partially_covered/uncovered/subjective）逐段标注；`uncovered` 必须列段 id + 原文片段 |
- 回流提示模板（重造时附加）：`上一版 checker 被判不合格，违规列表如下（原文）：<VIOLATION 行>；请只修这些点，其余保持不变；仍须满足 C1–C7`。

## 3 装置侧改动点（file:line 全部本轮自数）
| 文件（行数） | 锚点 | 改法 |
|---|---|---|
| `scripts/dsh-grader/run.sh`（398 行） | prompt heredoc `:177-210`（`:181/:191/:208` 9 项、`:188` 单文件、`:197-206` schema） | 换成本设计 §2 的"造尺契约"提示 |
| 同上 | 会话调用 `:214-216`；退出码判定 `:224-237` | 增加"造尺阶段 → C1–C7 闸 → 量尺阶段"两段式；退出码 5 接入 `FINAL_RC` |
| 同上 | `extract_result.py` 调用 `:240-249`；契约产物 `:361-365`；汇总 `:377-398` | 新增 `shape_gate.sh` 调用；summary 增 `SHAPE_VALID / CHECKER_ID / COVERAGE / MODE / REBUILDS` |
| 同上 | 参数解析 `:28-43`（现有 `--allow-stdout-fallback` 在 `:33`） | 新增 `--max-rebuild K`、`--checker <已有>`（跳过造尺，直接量尺）、`--allow-score-only` |
| `prepare_materials.py`（253 行） | 物料拷贝 `:182-190`；manifest 组装 `:212-237`（rubric sha `:223`、assignment sha `:224`、整体 digest `:230`） | 新增 `rubric-sections.json`（按 `##`/分值行切段，写 `sid/sha256/head`）并入 manifest；现有 rubric sha 直接作 C3 期望值 |
| `extract_result.py`（148 行） | 校验 `:43-76`；CLI `:78-85`；来源判定 `:97-118`；输出 `:141-143` | 增加"投影"步骤：从 `out/results/<slug>.json` 生成平台兼容 `grading-result.json`（保持字段形状，平台侧零改动） |
| 新增 `scripts/dsh-grader/shape_gate.sh` | — | C1–C7 七条断言集中；输出 `SHAPE_VALID=yes/no CHECKER_ID=… COVERAGE=covered/partial/uncovered/subjective` |
| 新增 `scripts/dsh-grader/coverage_report.py` | — | 生成 `out/reconciliation/matrix.json` + 四态计数 + `uncovered` 明细 |
| 新增 `scripts/dsh-grader/make_variants.py` | — | E-D 三类变体落到 `<workdir>/variants/`，**只读源物料**，不改 `materials/` |

## 4 端到端实验设计（每条：命令 / PASS / FAIL）
**E-A 造尺合规 + `checker_id` 独立复算**
- 命令：`bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/r3-a --timeout 1800` → `python3 scripts/dsh-checker/validate.py /tmp/r3-a/out/checker/checker.json` → 再用 `env -i PATH=/usr/bin:/bin` 与另一 cwd 复跑一次。
- PASS：run.sh exit 0；validate exit 0 且 `VALID=yes`、`VIOLATION` 计数 0；两次 stdout 的 `checker_id` 相同；无 T1。
- FAIL：exit 3/5；两次 id 不同；存在 `VIOLATION`；C5 命中。
- **反例必须做**：改 `generated.created_at` ⇒ id **不变**；改 `predicates[0].max_score` ⇒ id **变**（R1-A §1.5 的判据在真实产物上再验一次）。

**E-B 同尺 × 同提交 × N≥5 逐位一致**
- 命令：`bash scripts/dsh-checker/repro.sh --checker <checker.json> --submission <workdir>/materials/submissions/s01 --times 5 --rubric <workdir>/materials/rubric.md --standard <workdir>/materials/standard`（`repro.sh:5-8` 用法、`:105-106` 逐次调用、`:168-170` 摘要）。
- PASS：`determinism=PASS` 且 `distinct=1`、`leaks=0`；毒化对照 `--poison timestamp` ⇒ `poison_detected=True`（否则装置无证伪力）。
- FAIL：`determinism=FAIL`；`leaks>0`；毒化未被检出（`falsification_power=INSUFFICIENT`）。

**E-C 同一 checker × 全部 63 zip（52 唯一摘要）连跑两遍**
- 命令：`python3 scripts/dsh-checker/check.py --checker <c> --batch 实验/注入测试集 --dedup digest --out /tmp/r3-c1`，再跑一遍 `--out /tmp/r3-c2`（`check.py:450-453` 只收 zip；`--dedup digest` 见 `:526`）。
- PASS：两遍 `comparability.json` 均 `unique_digests=52`、`evaluated=52`、`skipped_duplicates=11`；按 zip 摘要对齐后逐份 `canonical_sha256` 相同；所有 `result-bNNN.json` 的 `unsupported=[]`。
- FAIL：任一摘要两遍 hash 不同；`unsupported` 非空；两遍 evaluated 数不同。
- 备注：本阶段**零 LLM**（纯本地 IO）；两遍之间的耗时差只作记录，不作判据。

**E-D 阴性对照：无害变体不得系统性误扣**
- 变体（`make_variants.py` 生成）：(d1) 把**不在任何 predicate 路径上**的文件改名/复制；(d2) 在被 `contains_text` 命中的文件里加注释、CRLF↔LF 互换；(d3) 等价改写（如 `localStorage.setItem` → `window.localStorage.setItem`）。
- PASS：d1、d2 的分数与 `canonical_sha256` 与基线**逐位相同**；d3 若产生差异，必须逐条报出（predicate id + 差多少分）并给出 pattern 改进建议。
- FAIL：d1/d2 出现任何扣分（=系统性误杀）；或 d3 有差异但未在报告里列出（=漏报）。

**E-E 造尺质量四态**
- 定义：`covered`（段落有谓词且可达 hit）/ `partially_covered`（仅覆盖子集或关键词）/ `uncovered`（无谓词，必须列 sid+片段）/ `subjective`（显式标注需人判）。
- 命令：`python3 scripts/dsh-grader/coverage_report.py --checker … --coverage … --matrix … --json <workdir>/out/reconciliation/coverage.json`。
- PASS：`covered+partially_covered ≥ 1`；`matrix.rows.length == predicates.length`；`uncovered[]` 已列出（可为空但字段必须在）。
- FAIL：`covered+partially_covered == 0`（等于没造出尺子）；`uncovered` 缺失（静默漏检）。

## 5 给 B 的施工单（≤8 条 · 每条 ≤5 行）
1. **提示模板改造**｜目标：让模型产出契约合规 checker 与覆盖率
- 路径：`scripts/dsh-grader/run.sh:177-210`（9 项硬编码 `:181/:191/:208`、单文件限制 `:188`、schema `:197-206`）
- 验收：新增「三类产物 + `validate.py:23-42` 白名单 + 会话内自检命令」；`grep -c '9 项' scripts/dsh-grader/run.sh` = 0（现值 3，行 181/191/208）；`grep -c '只允许写一个文件'` = 0（现值 1，行 188）
- 风险：提示变长会挤压物料注入，必须实测 token 与截断

2. **造尺闸 `shape_gate.sh`**｜目标：把 C1–C7 收在一处，供 run.sh 复用
- 路径：新增 `scripts/dsh-grader/shape_gate.sh`
- 验收：合规样例 `SHAPE_VALID=yes`；对 7 类违规各造一个样例都必须 `no` 且 exit 5
- 风险：C7（禁可执行）要白名单化，避免误伤 `*.txt`/`*.md`

3. **run.sh 两段式 + 退出码 5**｜目标：造尺不过就不进入量尺
- 路径：`run.sh:214-249`（会话+提取）、`:361-365`（契约产物）、`:377-398`（汇总）
- 验收：造尺失败 ⇒ exit 5 且 `out/grading-result.json` 不存在；成功 ⇒ 摘要含 `CHECKER_ID=`、`COVERAGE=`、`MODE=`
- 风险：只加不减，F-C1..C5 既有判据不得回退

4. **rubric 段落切分**｜目标：给覆盖率一个可复算基准
- 路径：`prepare_materials.py:182-190`（物料拷贝）、`:212-237`（manifest，rubric sha `:223`）
- 验收：新增 `materials/rubric-sections.json`（`sid/sha256/head`）并写入 manifest；段 sha 可用 `validate.py:49-58` 复算
- 风险：切分粒度是主观项（§6 P3），先按 `##` 标题落地并在报告里标注口径

5. **投影生成（平台兼容）**｜目标：`grading-result.json` 形状不变
- 路径：`extract_result.py:43-76`（现有校验）、`:78-85`（CLI）、`:141-143`（输出）
- 验收：从 `out/results/<slug>.json` 生成的投影能过现有校验（items 非空、sum==total_score）；`items[].id` ∈ checker predicate ids
- 风险：两套 schema 字段名易混，投影器要单向（只读 checker-result → 写投影）

6. **覆盖率报告器**｜目标：四态计数 + 逐谓词对账矩阵
- 路径：新增 `scripts/dsh-grader/coverage_report.py`
- 验收：`matrix.rows.length == predicates.length`；`coverage.json` 可 `json.load`；`uncovered` 明细含 sid+片段
- 风险：不得把 `subjective` 计入 covered（会夸大覆盖）

7. **变体生成器 + 端到端 runner**｜目标：E-A..E-C/E-D 一条命令可复跑
- 路径：新增 `scripts/dsh-grader/make_variants.py`、`scripts/dsh-grader/e2e_shape.sh`
- 验收：变体只写 `<workdir>/variants/`（`materials/` 指纹不变）；e2e 输出 E-A/E-B/E-C 三段 verdict 与命令
- 风险：变体生成必须确定性（同输入同输出，禁止时间戳）

8. **证据与不自证**｜目标：产物可被 C 独立复算
- 路径：`docs/dsh/evidence/agent-b/R3-*.{json,md}`（摘录 + 文件路径）
- 验收：报告单列「模型调用次数（造尺 1 + 量尺 0）」「K 重造次数」「E-A..E-E 各自 verdict + 命令」
- 风险：只允许声明"可复现 + 覆盖率"，不得声明"分数正确"

## 6 需用户拍板 / 平台侧边界
| # | 事项 | 选项 | 影响 |
|---|---|---|---|
| P1 | 重造上限 K | 0 / 1（默认） / 2 | 每次重造 = 1 次模型调用（成本） |
| P2 | d3（等价改写）差异是否算失败 | 只报出（建议） / 硬 FAIL | 判据严格度 vs 尺子脆弱点暴露 |
| P3 | rubric 段落切分粒度 | 按 `##` 标题（建议） / 按分值行 / 按 rubric 原有编号 | 决定 covered 的口径与人工核对成本 |
| P4 | 是否保留 `--allow-score-only` 兜底 | 保留（显式+摘要可见，建议） / 彻底删除 | 兼容旧流程 vs 防静默降级 |
| P5 | 投影兼容 vs 重构 | 保留 `grading-result.json` 形状（建议） / 直接切到 checker-result/1 | 平台侧改动量（牵动 R2-A W6） |
- **平台侧（本任务不做）**：checker 入库表与 `checker_id/canonical_sha256` 回写、作业级触发与并发闸、冻结方案 A/B/C —— 见 `docs/dsh/R2-A-施工单.md`（W1–W8）。

## 7 精读范围与复算命令（本轮）
- 读过的行段：`scripts/dsh-checker/validate.py:1-58, 111-132, 134-161, 176-314`；`check.py:35-36, 281-354, 412-441, 450-481, 515-538, 604-606`；`purity.py:1-26`；`repro.sh:1-43, 91-170`（grep+行段）；`scripts/dsh-grader/run.sh:4-6, 22-43, 79-97, 168-260, 361-398`；`prepare_materials.py`、`extract_result.py`（grep 锚点）。
- 复算命令（逐条自数用）：`wc -l scripts/dsh-grader/*.sh|*.py scripts/dsh-checker/*.py|*.sh`；`grep -n` 上述各锚点；`grep -n '共 9 项|只允许写一个文件' scripts/dsh-grader/run.sh`。
- 本轮**未做**：写代码、改任何 `scripts/**`、跑模型、写库、起生产进程。