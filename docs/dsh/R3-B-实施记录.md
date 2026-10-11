# R3-B 实施记录：造尺侧接线（会话产出合规 checker.json + 覆盖率 + 对账矩阵），E-A…E-E

## 结论摘要（≤10 行）
1. 交付：`scripts/dsh-grader/` 新增 `shape_gate.sh` + `shape_checks.py`（C1–C7 闸）、`coverage_report.py`（四态覆盖 + 逐谓词对账矩阵）、`make_variants.py`（E-D 变体）、`e2e_shape.sh`（E-A…E-E 一条命令）、`stub_build.py`（stub 产物生成器）；改造 `run.sh`（两段式：造尺→闸→重造→**零 LLM 量尺**）、`prepare_materials.py`（rubric 切分）、`extract_result.py`（平台兼容投影）。
2. 【stub 路径 · 已实测】`bash scripts/dsh-grader/selftest.sh` → **68 PASS / 0 FAIL、exit 0、模型调用 0**（含 E-A…E-E 全绿 + 5 类闸反例 + K 重造）。
3. 【已实测】造尺闸 C1–C7：合规样例 `SHAPE_VALID=yes`（`SHAPE_GATE=PASS`，exit 0）；5 类字段违规（C4 分值/C5 T1/C6 悬空引用/C1·C2 伪造 id/C7 可执行文件）**全部 exit 5 + 不写 grading-result.json + 诊断归档到 out/diagnostics/**；装置**不修任何字段**（唯一规范化是按 R1-A §1.1「checker_id 不得手写」填入占位 id）。
4. 【已实测】E-A：产物通过 `validate.py`（两进程一致，`sha256:151e1b04…`）＋反例成立（只改 generated.created_at ⇒ id 不变；改 predicates[0].max_score ⇒ id 必变）。
5. 【已实测】E-B：同尺×同卷 ×5 ⇒ `distinct=1`；`--poison timestamp` 6 次 ⇒ `poison_detected=True`（装置有证伪力）。
6. 【已实测】E-C：`实验/注入测试集` 连跑两遍（零 LLM）⇒ 两遍均 `zips=52 / evaluated=52 / skipped=11`、**逐份 canonical_sha256 相同 52/52、unsupported=0**。
7. 【已实测】E-D：d1（改名）/d2（注释+CRLF 互换）**逐项分数 0 变化**；d3（等价改写）差异逐条报出且**无任何扣分**。（口径说明：canonical 含 submission.digest=文件字节，变体必然改它，故「逐位一致」落在评分项上；见 §4 E-D）
8. 【已实测】E-E：四态覆盖 `covered:5 / partially:4 / uncovered:0 / subjective:0`，`matrix rows=5 = predicates=5`；rubric 切分 **9 段**（`split_rule=item+escaped_newlines_normalized`）。
9. 【真实路径】见 §5：两次真实造尺会话的实测结果与结论（含一次字段违规被闸拦下 ⇒ exit 5 的真反例）。
10. 未验证/残留项见 §6；`classify_changes.py` **未改动**（sha256 = `8efaef92…`，与 C 的 t12 锚点一致）；指纹见 §8。

## 0 交付物与两条路径的边界（队长要求 4：显式区分 stub 路径 / 真实路径）
| 入口 | 路径 | 模型调用 | 用途 |
|---|---|---|---|
| `bash scripts/dsh-grader/selftest.sh` | stub（`stub-dsh.sh` → `stub_build.py`） | **0** | 契约/闸/重造/隔离/退出码的回归网（CI 用） |
| `bash scripts/dsh-grader/e2e_shape.sh [--real]` | 默认 stub；`--real` 才真跑会话 | 0 / 1 | E-A…E-E 端到端实验 |
| `bash scripts/dsh-grader/run.sh --submissions N --workdir W --timeout T` | **真实** DSH headless 会话 | 1（+每次重造 1） | 造尺 + 量尺的正式入口 |
| `bash scripts/dsh-grader/run.sh --checker <c.json>` | 真实（零会话） | **0** | 有尺子时直接量尺（measure-only） |
| `bash scripts/dsh-grader/run.sh --allow-score-only` | 真实 | 1 | 旧「只产分数」模式（默认关闭；摘要 `MODE=score-only`，投影标 `comparable_within_checker=false`） |
| `bash scripts/dsh-grader/shape_gate.sh --workdir W` | 独立闸 | 0 | 单独复核某次造尺产物 |

## 1 造尺契约与 C1–C7（实现位置 + 复算命令）
产物布局：`out/checker/{checker.json, checker.provenance.json, rubric-coverage.json}`、`out/results/<slug>.json`（装置量尺）、`out/results/<slug>.model.json`（会话自述）、`out/reconciliation/{matrix.json, coverage.json}`、`out/grading-result.json`（平台兼容投影）、`out/diagnostics/`。

| # | 判据（`shape_checks.py`） | 复算命令 | 实测 |
|---|---|---|---|
| C1 | `validate_checker` 无违规 | `python3 ../dsh-checker/validate.py out/checker/checker.json`；exit 0 / `VALID=yes` | PASS（合规样例）|
| C2 | `checker_id` 第二进程独立复算一致 | `cd /tmp && env -i PATH=/usr/bin:/bin python3 validate.py <abs>` 比对 `checker_id=` | PASS（两进程同 id）|
| C3 | rubric/标准包哈希锚定物料（**复用** `validate.py` 的 `content_sha256`/`dir_sha256`） | 比对 `materials/rubric.md` 与 `materials/standard`（ignore 与 checker 同口径） | PASS（`rubric=4fdbd6a…`、`standard=3cb8320…`）|
| C4 | 分值与满分一致：`sum(predicates) ≤ scoring.max_score`，差额须由 deductions/_note 解释；rubric 写了「满分/合计 N 分」时必须相等 | `shape_gate.sh` 输出 `SHAPE_C4` | PASS；反例 `field-max` ⇒ FAIL |
| C5 | 无 T1 类型（`rule_type ⊆ T0_RULE_TYPES`） | 同上 | PASS；反例 `t1` ⇒ FAIL |
| C6 | 覆盖率可读、引用不悬空、`uncovered` 字段存在 | 同上 + `coverage_report.py` | PASS；反例 `dangling` ⇒ FAIL |
| C7 | `out/checker` 无脚本（只允许 .json/.txt/.md，且无可执行位） | `find out/checker -type f -perm -u+x` 为空 | PASS；反例 `exec` ⇒ FAIL |

反例复算（零模型调用）：
```
STUB_MODE=field-max bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/w1 --timeout 900 ; echo $?   # 5
STUB_MODE=t1        ... ; STUB_MODE=dangling ... ; STUB_MODE=bad-id ... ; STUB_MODE=exec ...
# 每个都满足：exit 5 ∧ out/grading-result.json 不存在 ∧ out/diagnostics/shape-checks.json 存在
```

## 2 提示改造（消除 9 项硬编码）
- `grep -c '9 项' scripts/dsh-grader/run.sh` = **0**（原 3 处：181/191/208）；`grep -c '只允许写一个文件'` = **0**（原 1 处）。
- 新提示按「三类产物 + 字段白名单（照抄 `validate.py` 的 TOP_FIELDS/T0_RULE_TYPES/PARAMS） + 覆盖率四态 + 自检清单」组织；**明确禁止**写 `out/grading-result.json`（由装置用确定性执行器生成）。
- 「会话内自检」= 阅读式核对（本环境无执行工具，这是设计前提）；装置侧用 `validate.py` 独立复证（C1/C2）。
- rubric_hash/standard_hash 要求从 `materials-manifest.json` 照抄并补 `sha256:` 前缀（manifest 里是裸 hex）——这一条由真实会话暴露后写进提示（见 §5）。

## 3 两段式流程 + 退出码 5 + K 重造
```
造尺阶段（1 次会话） → checker_id 占位填充（唯一规范化） → 闸 C1–C7
   ├─ PASS → 量尺阶段（零 LLM）：check.py（含 --rubric/--standard 的 stale 检查）→ coverage_report.py → extract_result.py --project
   └─ FAIL → 若 ATTEMPT < K：新会话重造，prompt 末尾附上一轮 VIOLATION 原文；否则 FINAL_RC=5（不写契约产物）
```
- K：默认 **1**，硬上限 **2**（`--max-rebuild`，超上限自动夹到 2 并在日志说明）——队长裁定 1。
- 重造提示原文（实测，见证据 R3-04）：`【重造提示（第 1 次）】上一版 checker 被判不合格，违规原文如下：VIOLATION C4 … 请只修这些点…`。
- 退出码语义：0=已评估；3=checker 契约非法（validate）；4=输入/stale；**5=造尺不合格**；6=T1（执行器侧）。
- 失败不产契约产物（沿用 F-C2 口径）：`契约产物：未产出（门控：FINAL_RC=5 shape=no …）`。

## 4 E-A…E-E：命令 + 真实输出（stub 路径，零模型调用）
`bash scripts/dsh-grader/e2e_shape.sh --workdir <W> --repo <repo>`
```
E_A_BUILD=PASS run.sh exit=0（stub，零模型调用）
E_A_VALIDATE=PASS exit 0 / VIOLATION=0 / 两进程 checker_id 一致（sha256:151e1b04…）
E_A_COUNTEREXAMPLE=PASS generated_only_id_unchanged=yes max_score_id_changed=yes
E_B_DETERMINISM=PASS distinct=1（5 次同尺同卷）＋ poison timestamp 被检出
E_C_BATCH=PASS zips=52 evaluated=52 skipped=11 same_canonical=52 unsupported=0
E_D_VARIANTS=PASS d1/d2 逐项分数完全一致（0 变化）；d3 差异逐条报出且无扣分
E_E_COVERAGE=PASS states=covered:5 partial:4 uncovered:0 subjective:0 covered_or_partial=9 ｜ matrix rows=5 predicates=5
E2E_RESULT=PASS
```
- **E-D 口径说明（诚实项）**：设计原文要求 d1/d2「分数与 canonical 逐位相同」，但 canonical 覆盖 `submission.digest`（文件字节），任何变体都会改 digest ⇒ 该条按字面不可达。按队长裁定 2 的口径落到**评分项**上：d1/d2 逐项分数变化数 = 0（`score_items_changed=0`）、d3 逐条列出差异且 deductions=0；digest 变化作为非分数字段记录。
- **E-E 四态**：`uncovered` 必须显式列出（本例 stub 尺覆盖前 5 段，其余 4 段在会话 coverage 里是 covered…装置侧 coverage.json 由 group 与段标题对齐后得 covered:5/partial:4；`uncovered` 字段始终存在）；`covered+partial=0` 会判 FAIL（`coverage_report.py` 退出 1，selftest 里有该分支）。
- rubric 切分：按队长裁定 3 = `##` 优先 → 退化 `###`；本仓物料 rubric 既无 `##` 也无 `###`（且原文用字面量 \\n 分隔），故追加两级兜底：`第N项/编号行` → 整篇；实测 **9 段**，`split_rule=item+escaped_newlines_normalized`，每段另有 `materials/rubric-sections/S00X.md` 可用 `validate.content_sha256` 复算。

## 5 真实路径实跑（run.sh 起真实会话）
命令：`bash scripts/dsh-grader/run.sh --submissions 1 --workdir /tmp/dsh-r3-build --timeout 1800`
- 第 1 次真实造尺会话：**238s、rc=0**；模型确实产出了 `out/checker/checker.json`（22.6 KB）+ provenance + coverage；闸实测 `COVERAGE=covered:8/subjective:1`（9 段全部出现 ✓）。
- **闸判 FAIL 的原因（真实反例）**：模型写了占位 `checker_id=sha256:0000…`（提示要求），而装置当时的占位填充发生在**闸之后** ⇒ C1 `checker_id_mismatch` ⇒ exit 5 + 重造。**这是本轮由真实路径暴露的真实缺陷**，已修：把占位填充提前到「每次尝试的会话结束后、判闸之前」，并在报告/摘要里显式打印 `CHECKER_ID_FILLED/UNCHANGED`。
- **修复后重跑（第二次真实造尺，1 次模型调用）：一次通过，REBUILDS=0** —— 实测原文（证据 R3-06）：
  ```
  CHECKER_ID_FILLED=sha256:327e05556bb4b307b46e3df9d720f398b487eb3f111d1198a1cbff7affef35ab
  SHAPE_VALID=yes CHECKER_ID=sha256:327e0555… COVERAGE=covered:8/partial:1/uncovered:0/subjective:0
  MEASURED id=丁静45 slug=s01 canonical=a30efd53490e22e8e50617b801453efccb8e0b3a9e081f46b6dde6b077a6eb19
           coverage=covered:9 partial:0 uncovered:0 subjective:0 covered_or_partial=9
  契约产物：/tmp/dsh-r3-build/out/grading-result.json（平台兼容投影；source=s01:checker-result/1）
  RUN_RESULT=PASS graded=1 requested=1 isolation=PASS ｜ RUN_EXIT_CODE=0 ｜ RUN_EXIT=0 ｜ REBUILDS=0 MODE=build
  ```
  即：真实会话造出的尺子过了 C1–C7（会话 coverage 9 段全覆盖：covered 8 + partial 1），装置用 `check.py` 独立量出 canonical，并按裁定 5 产出平台兼容投影；隔离 PASS（无子进程写入、无未解释变化）。
- 两次真实会话的耗时：首次 238s（被闸拦下）、修复后一次通过（同一 `--timeout 1800`）。

## 6 失败与未验证项（单列）
1. **真实会话的合规率未达 1.0**：第 1 次真实造尺被闸拦下（占位 id 时序缺陷，已修）；修复后的真实通过率仍受模型发挥影响 —— **不宣称「会话一定能造出合规尺子」**，只宣称「不合格会被闸拦下且不会带病出分」。
2. **E-C 只用注入集**（52 唯一摘要）验证两遍一致；未覆盖平台真实提交集（R2 范围）。
3. **stale 检查依赖装置传入 `--rubric/--standard`**：measure-only 模式下若调用方不传，则不做 stale 判定（不会假 PASS，但也不会报警）。
4. **`--submissions >1` 的多份造尺**：当前实现是「每份提交各造一次尺」（一份一尺），**不是**「一次造尺多份量」；多份共用一把尺请用 `--checker`（measure-only）路径。这一口径差异需在 R3-C/R4 明确。
5. **评分正确性不作声明**：本轮只交付「结构 + 覆盖率 + 可复算」，分数是否合理仍取决于 checker 设计（R1-A §6 的拍板项）。
6. E3 类毒化只覆盖 timestamp（E-B 要求）；mtime/readdir/hashseed 在 R1-B 已验，本轮未重复。

## 7 与既有装置/断言的关系
- **未改 `scripts/dsh-checker/**`**（只调用：`validate.py`、`check.py`、`repro.sh`）；未改 `scripts/dsh-verify/**`；未改业务代码。
- **未改 `classify_changes.py`**：sha256 = `8efaef928a9ea14397a72be9e5cffd87f142c60523bfdbf3b7945e624488f20d`（= C 的 t12 锚点）⇒ R4-HOST-SESSION 行为不变。
- 隔离判据只增强不减弱：新增**后置空窗控制**（子进程退出后再取一次空窗，与前置空窗取并集）用于归因并发会话日志；子进程指纹（child id / workdir slug / 隔离 home 内容）仍优先于 R5，F-C1 三阳性对照仍 rc=1/FAIL（selftest 断言）。
- 现有断言全部保留：F-C1..F-C5、F-C3 护栏、F-C4 并发锁、F-C2 退出码等 68 项全绿；F-C5 的「默认拒绝/显式允许」改为在 `extract_result.py` 单元级 + score-only 模式断言（策略所在层），强度不变。

## 8 scripts/dsh-grader 指纹（队长要求 2 · 口径同 fp-r0-t11.txt）
完整清单：`docs/dsh/evidence/agent-b/fp-r3-t14.txt`
```
# 汇总: 17 文件, 合并摘要 d0cb3e1404167fd3b997fcae7f0d3e98f5a2942cd9b01a8d57f7cbfda5850181
# 关键不变式：classify_changes.py = 8efaef928a9ea14397a72be9e5cffd87f142c60523bfdbf3b7945e624488f20d（与 C 的 t12 锚点一致）
```

## 9 精读与预算
精读：`docs/dsh/R3-A-设计.md` 全文 149 行（唯一输入）；`scripts/dsh-grader/run.sh` 的提示/会话/汇总区段；`scripts/dsh-checker/validate.py` 的字段白名单与哈希函数（复用其口径）。长证据外置 `docs/dsh/evidence/agent-b/R3-01…R3-06`（selftest 全文、E-A…E-E、闸反例、重造、真实实跑）。本文件见交付说明（行数/字节）。
