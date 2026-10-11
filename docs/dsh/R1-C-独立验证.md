# R1-C 独立验证（Agent C · 不采信 B 自测，逐条自跑）

## 结论摘要（10 行）
1. **verdict = pass**：契约 10 项验收全部通过；2 条**非阻塞观察**（glob 语义、R0 线在验证窗口内被并行修改）写在 §7。
2. **E1【通过】**：我自跑 7 次同一 checker × 同一提交 → `distinct=1 determinism=PASS`、exit 全 0、score 全 45；canonical 确实排除 run_meta（单元级 + 实证双证）。
3. **E3【通过·★】**：我自建 **4 类** B 未使用的毒化（pid / env(TZ+LC_ALL) / cwd / mtime 泄漏，全部**不使用**装置的 `--poison` 开关）→ 装置全部判 `determinism=FAIL`（distinct 6/6/6/2）；未毒化副本在同样扰动下 `distinct=1`（阴性对照）。
4. **E2【通过】**：空格/中文路径 + 改 CWD + LC_ALL/TZ/PYTHONHASHSEED + 批量改 mtime × 6 → `distinct=1`；装置与我各自的绝对路径扫描均为 **0 命中**。
5. **E4【通过】**：rubric 或 standard 改 1 字节 → `rc=4 STALE=true`（rubric_hash_mismatch / standard_hash_mismatch）且**不给分**；改 `generated.*`/`_note`/键序 → `rc=0` 且 checker_id 与 canonical **不变**；改 predicates → `rc=3 checker_id_mismatch`（换尺子被拦住）。
6. **E5【通过】**：我独立复算 `实验/注入测试集/` = **63 zip / 52 唯一 sha256 / 最大同摘要组 7 / 46 个单例**（与 A 的 63/52 一致）；装置 `--dedup none` = 评估 63/跳过 0，`--dedup digest` = 评估 52/跳过 11，`cross_group=not_comparable`。
7. **E6【通过】**：我自己构造 11 例边界（空目录 / 只 node_modules / 纯软链 / 25 层深 / non-UTF8 内容 / NFD+NFC 与大小写冲突 / 软链环）→ 每例两次运行 rc 与 canonical 一致、**0 Traceback**、status 全在六态内。
8. **对拍【通过】**：同一份真实提交（R0 的 s01）两把尺子：LLM 56/100（9 项）vs 确定性 45/100（5 谓词，file_count=27）；R0 产物缺 `checker_id/canonical_sha256/submission.digest/reconciliation` ⇒ **not_comparable**（只可对拍字段形状）；只读物料 61 文件指纹未变。
9. **回归【通过·附注】**：`scripts/dsh-checker/**` 我未改（mtime 仍 23:04–23:07）；`scripts/dsh-verify/**` 只新增我的 r1-*；`scripts/dsh-grader/**` 有 2 文件在 23:12/23:13 被改 —— 那是 B 对我 F-C2C-1 的修复（我复算其已生效），非 R1 改动，但基线已变。
10. 证据外置 `docs/dsh/evidence/agent-c/16–21`；探针 `scripts/dsh-verify/r1-*.{sh,py}`（5 个新文件），全程零模型调用、零网络、未写 ~/.dsh。

## 1 方法（全是 C 自己的命令）
- 契约命令（2 条）我都真跑；其余全部自建探针：`r1-core.sh`（E1/E1b/E2/E4）、`r1-poison.sh`（★E3：把毒化注入 `check.py` 的**副本**，再用装置自己的 `repro.sh` 判）、`r1-e5e6.sh`+`r1-e6b.sh`（E5/E6）、`r1-crosscheck.sh`（对拍 + 回归）。
- 反空判据原则：每条"通过"都配一个必须失败的对照（E1 配 payload 改动必须改变 canonical；E3 配未毒化副本必须仍 PASS；E2 配绝对路径扫描）。
- 只读边界：`scripts/dsh-checker/**` 只读（我全部改动落在 `scripts/dsh-verify/` 与 `docs/dsh/evidence/agent-c/`）；毒化与 E4 变异全部在 `/tmp/r1c/**` 的副本上做。

## 2 逐条验收对照
| # | 验收项 | 我的判据（命令 → 输出摘要） | 状态 |
|---|---|---|---|
| 1 | E1 N≥5 逐位一致 + 排除 run_meta | `repro.sh --times 7 --perturb none` → `distinct_count=1 determinism=PASS exits=[0] scores=['45']`；单元级：两份只差 run_meta 的产物 `canon_sha256` 相等，改 payload 则不等（反空判据）；实证：3 次运行 run_meta elapsed_ms=6/8/6（2 种）而 canonical 唯一 | **通过** |
| 2 | ★E3 自建 ≥2 种毒化必须判不一致 | 4 类自建毒化（pid/env/cwd/mtime）→ `determinism=FAIL distinct=6/6/6/2`；阴性对照 `determinism=PASS distinct=1` | **通过** |
| 3 | E2 扰动矩阵一致 + 无绝对路径 | `--perturb all --times 6` → `distinct=1 leaks=0`；我的独立扫描（`/Users/`、`/private/tmp`、`/var/folders`、运行目录）0 命中；`submission.id="提交 副本"`（无路径） | **通过** |
| 4 | E4 换尺子 / generated | rubric+1B → rc=4 `rubric_hash_mismatch`+不给分；standard+1B → rc=4 `standard_hash_mismatch`；generated+_note+键序 → rc=0 且 `canonical_same=True`、`VALID=yes`；predicates 10→9 → rc=3 `checker_id_mismatch` | **通过** |
| 5 | E5 独立复算 63/52 并对齐去重口径 | 我算法：`zips_total=63 unique_sha256=52 max_group=7 ones=46`；装置：none→63/52/63 评估/0 跳，digest→63/52/52 评估/11 跳，`cross_group=not_comparable`、`groups=52` | **通过** |
| 6 | E6 六例边界确定性 + 明确 status | 7 例（含 root-level glob 反例）+ 4 例嵌套补测：rc 稳定、canonical 逐位一致、0 Traceback；status ∈ {hit,miss,missing,empty,unreadable,unsupported} | **通过** |
| 7 | 与 R0 产物 sNN.json 真实对拍 | 同一提交 s01：LLM 9 项 56/100 vs 确定性 5 谓词 45/100（P01 hit10 / P02 missing0 / P03 missing0 / P04 hit15 / P05 hit20）；R0 缺 checker_id/canonical/digest/matrix ⇒ not_comparable | **通过** |
| 8 | 回归：R0 两目录未被改 | dsh-checker 未被我改；dsh-verify 仅我的 r1-*；dsh-grader 2 文件 23:12/23:13 = B 修 F-C2C-1（附注见 §7） | **通过（附注）** |

## 3 E1：逐位一致与 run_meta 排除（我自己跑）
- `bash scripts/dsh-checker/repro.sh --checker fixtures/checker.json --submission fixtures/submission --times 7 --perturb none --out /tmp/r1c/core/e1` → `REPRO times=7 perturb=none poison=none distinct=1 determinism=PASS leaks=0`；7 次 exit 全 0、score 全 45。
- run_meta 排除的三重证据：
  1. 单元级：`check.canon_sha256`（直接 import 装置的 check.py）对"只改 run_meta"的两份产物给出**相同**哈希；对"只改 `items[0].score`"给出**不同**哈希（说明 canonical 不是常量、排除是精确的）。
  2. 字段级：`canonical_sha256` 字段自身改动不影响再次计算的结果（排除自身）。
  3. 实证级：连续 3 次真实运行的 `run_meta.elapsed_ms` = 6/8/6（出现 2 种），`canonical_sha256` 三次完全相同。

## 4 ★E3：我用 B 未使用的方式自建毒化（装置必须判不一致）
做法：把 `scripts/dsh-checker/` 整目录复制到 `/tmp/r1c/poison/<name>/`，在**副本**的 `check.py` 里注入一行（进被测产物、**不进** `--poison` 开关、不写 `poison_probe`），再用**装置自己的 `repro.sh`**（同款判据：canonical 是否出现 ≥2 个不同值）运行。
| 我的毒化（泄漏进产物的量） | 扰动 | 装置判定 | 结果 |
|---|---|---|---|
| `probe_pid=os.getpid()` | none | `distinct=6 determinism=FAIL` | 被抓出 |
| `probe_env=TZ|LC_ALL` | all | `distinct=6 determinism=FAIL` | 被抓出 |
| `probe_cwd=os.getcwd()` | all | `distinct=6 determinism=FAIL`（装置 leak 计数同时报 6） | 被抓出 |
| `probe_mtime=max(mtime)` | all | `distinct=2 determinism=FAIL` | 被抓出 |
| **阴性对照**：未注入毒化的同一副本 | all | `distinct=1 determinism=PASS` | 不误报 |
- 结论：证伪力成立（无论哪一类非确定量泄漏，装置都会判 `determinism=FAIL`），且扰动矩阵本身不会制造假差异。

## 5 E2 / E4 细节
- E2（`--perturb all --times 6`）：每轮改「提交副本路径含空格与中文」+「CWD 换成 run<i>/cwd-i/nested」+「LC_ALL ∈ {C,en_US.UTF-8,zh_CN.UTF-8}」+「TZ ∈ {UTC,Asia/Shanghai}」+「PYTHONHASHSEED=i」+「mtime ∈ {2001,2030}」→ `distinct=1 leaks=0`；我的独立绝对路径扫描 0 命中。
- E4（变异都在 `/tmp/r1c/core/` 副本上）：`rubric.md+1B` → `STALE=true reason=rubric_hash_mismatch` + `SCORE_WITHHELD=true` + `totals.score=null`（rc=4）；`standard/main.js+1B` → `standard_hash_mismatch`（rc=4）；`generated.{session_id,model,created_at}`+`_note`+键序反转 → `CHECKER_VALID=yes`、`canonical_same=True`（rc=0）；`predicates[0].max_score 10→9` → `CHECKER_VIOLATION checker_id_mismatch:declared=sha256:be8996b computed=sha256:cec394b`（rc=3）。

## 6 E5 / E6 细节
- E5：我的复算脚本对每个 zip 做 sha256 → 63 个 zip、52 个不同摘要、最大组 7（digest `d5e6b51b2d87`）、46 个单例；装置 batch 两种去重口径与之一致（none 全跑 63；digest 评估 52 + 跳过 11，`skipped_duplicates` 是**名单**而非文件，11 = 63−52）。`comparability.json` 里 `cross_group=not_comparable` 与设计口径一致。
- E6（我自己构造，若项目根嵌一层则 rc=0）：`empty`/`only-nm`/`symlink-only` → rc=4 `project_root_not_found`；`deep25`/`nonutf8(内容非法 UTF-8 + NFD/NFC + 大小写冲突)`/`linkloop(软链环)` 嵌一层后 → rc=0、两次 canonical 一致、`file_count` 合理、**无 Traceback**。

## 7 观察与非阻塞项（不改本轮 verdict）
1. **`**/package.json` 不匹配根级 package.json（低）**：把 `--submission` 指向**项目根本身**（R0 真实提交 `materials/submissions/s01/UserManagement_副本`）→ `rc=4 INPUT_PROBLEM project_root_not_found:**/package.json`；指向其**父目录** `submissions/s01` → rc=0、45/100。执行器忠实实现了 input_contract；风险在集成口径（R1-A §1.2/§1.5 未写明"glob 至少一层"）。最小复现：上面两条命令。建议：R1 接线统一传"含项目根的那一层"，或在设计里写明 glob 语义。
2. **R0 线在 R1 验证窗口内被并行修改（流程）**：`scripts/dsh-grader/{classify_changes.py(23:12:15), selftest.sh(23:13:22)}` 在我跑回归前被改。内容确认是对我 t5 回流项 F-C2C-1 的修复：`classify(..., host_session)` 新增第 104 行 `if host_session and host_session in path: return R4-HOST-SESSION`；我用 t5 的确定性复现重放 → 现在输出 `RULE R4-HOST-SESSION … host session id in path`（旧版是 R7-UNATTRIBUTED），**修复生效**。影响：本轮"未被改动"只能按"非 R1 改动 + 已复算其生效"来判；建议 R1 验证窗口内冻结 R0 线，或把并行修复改为独立分支/目录。
3. 其余：`--poison` 的 4 个内置模式（timestamp/mtime/readdir/hashseed）我未依赖（我的 4 类毒化绕开了它）；其 `host-delete` 之类反向对照不在本轮范围。平台侧接线、T1 谓词的实际解析能力、rubric 冻结策略不在 R1-C 范围。

## 8 契约命令（真实输出）
1. `bash scripts/dsh-checker/selftest.sh` → exit 0，`SELFTEST_PASS=48 SELFTEST_FAIL=0`、`SELFTEST_RESULT=PASS`。
2. `python3 scripts/dsh-checker/check.py --checker scripts/dsh-checker/fixtures/checker.json --submission scripts/dsh-checker/fixtures/submission --canonical` → exit 0，`CHECKER_VALID=yes checker_id=sha256:be8996bb07af5…`、`PURITY_VIOLATIONS=0`、`EVALUATED items=5 score=45/100 canonical_sha256=f8a531e2fddad067…`。

## 9 未核验 / 边界
- 未核验：T1 谓词真实解析能力（本轮 fixture 只含 T0）；平台 DB/HTTP 接线；batch 模式对 zip 内恶意路径的防护强度（我只看了解压函数存在与不影响本轮结论）；R1-A 契约里 `checker-result/1` 与平台字段映射的落地。
- 预算：报告体积见交付说明；证据 `docs/dsh/evidence/agent-c/16–21`；全部命令输出 head/tail 截断或重定向到 /tmp；全程 0 模型调用、0 网络、未写 ~/.dsh、未占端口、未改业务代码。
