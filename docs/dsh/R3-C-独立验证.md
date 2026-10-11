# R3-C 独立验证（Agent C · 造尺侧端到端，不采信 B 自测）

## 结论摘要（10 行）
1. **verdict = needs_revision**：E-B／E-C／E-D／E-E／不合格路径／回归 全部按我自建的方式通过，但 **E-A 的端到端在真实会话上失败** ⇒ 1 条阻断 + 2 条非阻断 finding。
2. **★阻断 F-R3C-1**：闸全绿（`SHAPE_VALID=yes`、CHECKER_ID=`sha256:6d81d911…`、C1–C7 通过）之后，**量尺阶段失败**：`INPUT_PROBLEM project_root_not_found:**/UserManagement*` ⇒ `RUN_RESULT=FAIL rc=1 reason=measure-failed(s01)`、无 `grading-result.json`。根因是 glob 语义与提交根布局不匹配，而 C1–C7 **没有可量性检查**。
3. E-A（尺子本体）【通过】：会话产出的 checker 通过 `validate.py`（rc=0）；**checker_id 三方可比**（declared == 我独立复算 == 装置第二进程）；两个反例符合设计（改 generated/_note/键序 ⇒ id 不变；改 predicates[0].max_score ⇒ id 必变且 validate rc=3）。
4. **★E-B【通过】**（我自建、不用装置 `--poison`）：hash 随机化泄漏 → `distinct=6 determinism=FAIL`；locale 排序依赖 → `distinct=6 FAIL`；阴性对照 `distinct=1 PASS`。
5. **E-C【通过】**：`--batch --dedup digest` 连跑两遍，52 份逐份 canonical 0 不一致；`zips=63 unique=52 evaluated=52 skipped=11 cross_group=not_comparable`；唯一摘要我用自己算法复算同为 63/52。
6. **★E-D【通过】**：我自建 4 类变体（未被引用文件改名／命中文件加注释／LF↔CRLF／等价改写）在会话产出的 39 谓词 checker 上**全部 0 扣分**（0 个 score 下降、0 个 pass→False）。
7. **E-E【通过】**：四态 `covered:8 partial:1 uncovered:0 subjective:0` 与 9 段一致；我用自写算法独立复算状态**逐段相同**；`uncovered` 字段显式（空清单）；矩阵 39 行 = 39 谓词；无悬空引用；`covered_or_partial=9 > 0`。
8. **不合格路径【通过】**：我手工构造违规 checker ⇒ `RUN_EXIT_CODE=5 reason=shape-gate-failed`，**不写** grading-result.json，原文归档 `out/diagnostics/{shape-checks.json,shape-violations.txt,shape-fail-s01}`。
9. **回归【通过】**：`scripts/dsh-checker/**` mtime 仍 23:03–23:07（未被改动），fixture 的 checker_id 与 canonical 与我在 R1-C 记录的**逐位相同**；R1 的 E1/E2/E4 复跑结论不变。
10. 另两条非阻断：**F-R3C-2**（repro.sh 扰动不改变 readdir 顺序 ⇒ 该泄漏类检不出）、**F-R3C-3**（「无害变体逐位不变」口径应为「分数不变」，canonical 会变）。证据外置 `docs/dsh/evidence/agent-c/28–34`。

## 1 方法与预算
- 真实模型调用 **2 次**（E-A 首版 + K=1 重造；其余全零 LLM）：`run.sh --submissions 1 --workdir /tmp/dsh-r3-verify --timeout 1800`。
- 自建探针：`r3c-ea.sh`（id 三方可比 + 反例）、`r3c-eb.sh`（两种新毒化）、`r3c-ec.sh`（两遍 batch）、`r3c-ed.py`（无害变体）、`r3c-ee.py`（覆盖率独立复算）、`r3c-bad.sh`（不合格路径）。全部写在 `scripts/dsh-verify/`，未改 `scripts/dsh-grader/**`。

## 2 ★F-R3C-1（阻断）：闸绿之后量尺失败 —— C1–C7 不检查「可量性」
**现象（我这次真实会话的完整轨迹）**：首版 checker 被闸判 C4 失败（`sum_predicates_108_exceeds_max_score_100`）⇒ K=1 重造 ⇒ 第二版 `SHAPE_VALID=yes`、`CHECKER_ID=sha256:6d81d911…`、`COVERAGE=covered:8 partial:1 uncovered:0`，随后：
```
[23:48:07] 量尺阶段失败：丁静45（详见 …/measure-s01.log、coverage-s01.log、projection-s01.log）
RUN_RESULT=FAIL graded=0 requested=1 isolation=PASS dry_run=0
RUN_EXIT_CODE=1 reason=measure-failed(s01)
契约产物：未产出（门控：FINAL_RC=1 shape=yes reason=measure-failed(s01)）
```
`measure-s01.log` = `INPUT_PROBLEM project_root_not_found:**/UserManagement*`；`projection-s01.log` = `PROJECTION_PROBLEM items_empty / no_score_in_source`（投影拒绝编造，这点是对的）。
**根因（我用装置自己的函数定位）**：会话把 `input_contract.project_root_glob` 写成 `**/UserManagement*`；`run.sh:224` 传的 `--submission` 是 `materials/submissions/<slug>`，而项目根是其**下一层**（`s01/UserManagement_副本`）。`check.py:113-118` 的 `glob_files` 用 `fnmatch(rel, pattern)`，`**/X*` 要求 X 前至少有一个 `/` ⇒ 该布局下永不匹配（实测：`**/UserManagement*` 能匹配 `wrap/UserManagement_副本/…`，匹配不了 `UserManagement_副本/…`）。
**为什么危险**：C1–C7 里没有任何一步拿真实提交试跑一次 ⇒ 「合格」与「量得出来」是两件事；这条通路在 B 的 t14 真实运行里没暴露（那次的 glob 恰好兼容），属于「看起来绿、其实没跑通」。
**最小复现（零 LLM）**：
```
python3 scripts/dsh-checker/check.py --checker /tmp/dsh-r3-verify/out/checker/checker.json \\
  --submission /tmp/dsh-r3-verify/materials/submissions/s01 --canonical   # ⇒ INPUT_PROBLEM project_root_not_found
# 同一把尺子、同一份提交，只要把项目根放到深度 ≥2 就能量：
mkdir -p /tmp/x/wrap && cp -R …/s01/UserManagement_副本 /tmp/x/wrap/ && python3 …/check.py --submission /tmp/x …  # ⇒ 39 项 61/100
```
**要求修复（三选，建议 ①+②）**：① 提示词钉死布局与 glob 语义（明确 `--submission` = `<slug>` 目录、项目根在其下一层，并给出可用的 `glob` 写法）；② 闸增加 **C8 可量性探针**（零 LLM：用真实提交跑一次 `check.py`／至少 `glob_files`，`INPUT_PROBLEM` ⇒ 不合格并计入重造）；③ 兜底：无匹配时把 `--submission` 自身当项目根或允许深度 0 匹配。
**复发判据**：`out/logs/measure-<slug>.log` 出现 `INPUT_PROBLEM`，同时 `out/logs/shape-<slug>.txt` 是 `SHAPE_VALID=yes`。

## 3 E-A：尺子本体与两个反例（通过）
| 判据 | 我的命令/输出 | 结果 |
|---|---|---|
| validate 通过 | `validate.py <checker>` → rc=0，39 谓词，`max_score=100` | PASS |
| checker_id 三方可比 | declared = `sha256:6d81d911…`；C 独立复算（自写 `checker_id_of`）= 同值；装置第二进程 = 同值（rc=0） | PASS |
| 反例一：改 `generated.*`+`_note`+键序 | validate rc=0、VALID=yes、第二进程复算 id == 原 declared | PASS（不换尺子） |
| 反例二：改 `predicates[0].max_score` +1 | C 复算 id 变；validate rc=3 `VIOLATION checker_id_mismatch:declared=sha256:6d81d91 computed=sha256:6db4191` | PASS（必换尺子） |

## 4 ★E-B：我自建的新毒化（装置自己的 repro.sh 判定）
| 毒化（注入 check.py 副本的被测产物；不用装置 `--poison`） | 扰动 | 装置判定 | 结果 |
|---|---|---|---|
| `probe_hashseed=str(hash('r3c-probe'))` | `--perturb all` | `distinct=6 determinism=FAIL` rc=1 | 抓出 |
| `probe_locale=str(sorted(递归文件表, key=locale.strxfrm))`（C 自建 locale 敏感提交：`z-f.js` vs `z-é.js`） | `--perturb all`（LC_ALL 变化） | `distinct=6 determinism=FAIL` rc=1 | 抓出 |
| 阴性对照（未毒化副本 + 同样扰动） | all | `distinct=1 determinism=PASS` | 不误报 |
| 附加：`probe_readdir=str(os.listdir(root))` | all | `distinct=1 PASS`（**未抓出**） | 见 §7 F-R3C-2 |

## 5 E-C / ★E-D / E-E
- **E-C**：`check.py --batch 实验/注入测试集 --dedup digest` 两遍 → `BATCH_OK zips=63 unique=52 evaluated=52 skipped=11`；52 份 `result-*.json` 的 canonical 逐份相同（mismatch=0）；`comparability.json cross_group=not_comparable`；我自算摘要分布 63/52/11 一致。
- **★E-D**（`r3c-ed.py`，会话产出的 39 谓词 checker，基线 61/100）：`v1-rename`（改名未被引用文件）、`v2-comment`（3 个命中文件加注释）、`v3-crlf`（LF↔CRLF）、`v4-equiv`（等价改写：尾部空行）→ **扣分项全部 0、pass→False 全部 0**，`ED_RESULT=PASS`；四例 canonical 都变（见 F-R3C-3 口径说明）。
- **E-E**（`r3c-ee.py`）：段落数三方一致（rubric-sections=9 / coverage=9 / device=9）；四态和=9；**我用自写 norm/关键词算法独立复算的每段状态与装置逐段相同**；`uncovered` 显式为 `[]`；矩阵 39 行 = 39 谓词且每个 id 恰好一行；引用无悬空；`covered_or_partial=9>0`。

## 6 不合格路径 与 回归
- 不合格路径（我把会话产出的 checker 复制后删 `evidence_policy.quote_max_chars` 且 `predicates[0].max_score=999`）：`RUN_EXIT_CODE=5 reason=shape-gate-failed(s01)`、`grading-result.json` 未写出、诊断归档 `out/diagnostics/{shape-checks.json,shape-violations.txt,shape-fail-s01}`、`VIOLATION C1 validate_violations:evidence_policy_missing_fields|checker_id_mismatch`。
- 回归：`scripts/dsh-checker/**` mtime 仍 23:03:45–23:07:23（B 的 R1-B 时刻，本轮未改）；fixture `checker_id=sha256:be8996bb…` 与 `canonical=f8a531e2fddad067…` 与我在 R1-C 记录的值**逐位相同**；R1 的 E1（7 次 distinct=1、run_meta 排除）、E2（扰动矩阵 distinct=1、0 绝对路径）、E4（rubric/standard stale、generated 不换尺子、predicates 换尺子）复跑结论不变。
- 契约命令：`bash scripts/dsh-grader/selftest.sh` → `SELFTEST_PASS=68 SELFTEST_FAIL=0` rc=0；`bash scripts/dsh-checker/selftest.sh` → `SELFTEST_PASS=48 SELFTEST_FAIL=0` rc=0。（两者都绿，却没有拦住 §2 的真实路径失败 —— 这正是本 finding 的价值。）

## 7 另两条非阻断 finding
**F-R3C-2（中）repro.sh 的扰动矩阵不覆盖遍历顺序**：我的 readdir-order 毒化在 `--times 6 --perturb all` 下 `distinct=1`（未被抓出），因为 repro 的扰动只是 `cp -R` 复制同一份提交，6 次运行里 readdir 顺序未变（poison 输出恒定即为证据）；本机 APFS 下同名集合的 readdir 顺序由名字哈希决定，与插入顺序无关。最小复现：`bash scripts/dsh-verify/r3c-eb.sh`（第三例）。要求修复/口径：要么加一种「重建副本时逆序或乱序创建文件」的扰动，要么在设计里明确「顺序敏感类只能靠 `--poison readdir` 注入模拟，装置不承诺用真实扰动发现它」。影响面：checker 是声明式 JSON，顺序敏感性的真实风险在 R1 的 executor（已由路径/CWD/LC/TZ/mtime 扰动覆盖），故非阻断。
**F-R3C-3（低）「无害变体逐位不变」口径**：实测 4 类无害变体都让 `canonical_sha256` 变化（树摘要含文件名与内容），但 items 分值与 totals 不变。`make_variants.py --compare` 本身是分数口径（正确）；建议把设计与报告文案改成「item 分数与 totals 逐位不变；canonical 允许变」，避免下游把 canonical 一致当作 E-D 的判据。

## 8 verdict 与建议
- **verdict = needs_revision**：造尺侧接线在「合格判据 → 量尺」之间存在未被覆盖的契约缺口，真实会话可稳定触发（F-R3C-1，阻断）。其余 6 项验收全过。
- 建议回流 B：① 闸加 C8 可量性探针（零 LLM）+ 提示词钉死 glob 语义（F-R3C-1）；② 补顺序扰动或明确口径（F-R3C-2）；③ 统一 E-D 口径文案（F-R3C-3）。
- 未核验：T1 谓词路径；平台侧投影与 DB 接线；`--submissions > 1`（一份一尺 vs 一次造尺多份量）未实测；K>1 的重造链路只覆盖到 K=1（本轮正好触发 1 次）。
