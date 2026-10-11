# R1-B 实施记录：确定性检查器执行器 scripts/dsh-checker/（checker.json v1 + check.py + E1–E6）

## 结论摘要（≤10 行）
1. 交付 `scripts/dsh-checker/`（5 个源文件 1565 行 + 14 个夹具文件）：`validate.py`（校验器 + checker_id）、`check.py`（纯函数执行器 CLI）、`purity.py`（纯函数运行时断言）、`repro.sh`（E1–E3 复算）、`selftest.sh`（E1–E6 自测入口）。
2. 【已实测】`bash scripts/dsh-checker/selftest.sh` → **48 PASS / 0 FAIL**、exit 0；**模型调用 0 次、网络 0 次**（全程只跑本目录 stdlib 代码）。
3. 【已实测】契约命令：`python3 check.py --checker fixtures/checker.json --submission fixtures/submission --canonical` → exit 0、`score=45/100`、`canonical_sha256=f8a531e2…`、`checker_id=sha256:be8996bb…`。
4. **E1** 同尺同卷 ×5 ⇒ 单一 canonical（distinct=1）；**N=3 直接 FAIL（reason=times_below_min）**。**E2** 路径含空格/中文 + CWD + LC_ALL + TZ + PYTHONHASHSEED + mtime 全改 ⇒ 仍 distinct=1 且输出零绝对路径。
5. **E3** 四种毒化（timestamp/mtime/readdir/hashseed）各 6 次 ⇒ distinct=6，全部被判不一致，`falsification_power=PASS`（装置有证伪力，不会「永远一致」）。
6. **E4** rubric 改一字节 ⇒ `stale=true` + `exit 4` + 不给分；标准包改一字节同样；只改 `generated`/键序/加 `_note` ⇒ `checker_id` 与复算 canonical **都不变**。
7. **E5** 注入集全量：**63 个 zip / 52 个唯一摘要 / 最大同摘要组 7 份**（本轮复算，与 A 的实测一致；任务书旧值「62 份」不采信）；去重口径显式：`--dedup none` 全跑 63，`--dedup digest` 评估 52 + 跳过 11；产出 `comparability.json`（`cross_group=not_comparable`）。
8. **E6** 边界六例全部给出确定性 rc/status（empty=4、only-node_modules=4、deep=0、non-utf8=0、symlink=4、case=0），两次运行 rc 与 canonical 一致、无 Traceback。
9. 纯函数约束是**运行时断言**：5 类禁令各有一个 `--purity-probe` 自测证明「断言真的会响」，且真实评估期间 `PURITY_VIOLATIONS=0`。
10. 失败与未验证项见 §8/§9（含 2 个自纠 bug 与 4 条未验证边界）；本轮未改 `scripts/dsh-grader/`、`scripts/dsh-verify/`、`server/`、`client/`。

## 0 交付物与入口
| 文件 | 作用 | 行数 |
|---|---|---|
| `scripts/dsh-checker/validate.py` | checker v1 校验器 + checker_id 计算 + 哈希口径（内容/目录/软链/ignore） | 314 |
| `scripts/dsh-checker/check.py` | `evaluate()` / `canon_sha256()` / CLI（0/3/4/6 退出码、batch、poison） | 613 |
| `scripts/dsh-checker/purity.py` | 纯函数约束运行时断言（无网络/子进程/时间/随机/环境变量）+ `purity.probe()` | 168 |
| `scripts/dsh-checker/repro.sh` | E1 位级复现 / E2 环境扰动 / E3 毒化对照 → `repro-report.json` | 171 |
| `scripts/dsh-checker/selftest.sh` | **稳定入口**：E1–E6 + 纯函数 + 退出码自测（零模型调用） | 299 |
| `scripts/dsh-checker/fixtures/` | `checker.json` + `submission/` + `standard/` + `rubric.md` + `checker.t1.json` + `checker.invalid.json` + `build_fixtures.py` | 14 文件 |

稳定命令：
```
bash scripts/dsh-checker/selftest.sh
python3 scripts/dsh-checker/check.py --checker scripts/dsh-checker/fixtures/checker.json \
        --submission scripts/dsh-checker/fixtures/submission --canonical
```
键数字（冻结版）：`checker_id=sha256:be8996bb07af5b44d9c75545e0fdced216133ac1a0fbb4165532e06c2b251ba7`；
无 `--submission-id` 时 canonical=`f8a531e2fddad0672144535db9df316c0d7cd956b3acc0612ce318627eab133f`（45/100）；
带 `--submission-id s01` 时 canonical=`a4907b0ac7104ee6f1a4b75ad368a1d2944a1f5f1c509836f7e68f419ea4bbd9`（`submission.id` 进哈希，故两份 id 不同 ⇒ 摘要不同，属预期）。

## 1 契约实现（checker.json v1 / 谓词词表 / 换尺子）
- **9 个顶层字段**全部实现并校验：`schema_version(checker/1)`、`checker_id`、`assignment_ref{assignment_id,question_id,rubric_hash,standard_hash}`、`generated{session_id,model,created_at,generator}`、`scoring{max_score,aggregate,rounding,zero_credit_rule}`、`input_contract{project_root_glob,required_paths,ignore,encoding}`、`predicates[]`、`deductions[]`、`evidence_policy{require_line,quote_max_chars}`。
- **词表 v1 只许 T0**：`file_exists / dir_contains_file / contains_text / contains_regex / count_regex / count_imports / file_count_in_dir / glob_covers` 八个全部实现（含 params 必填校验、glob 禁 `{}`、正则禁反向断言）。
- **T1 fail-closed**：`syntax_check/ast_pattern/fact/json_pattern/vue_sfc_parse` 出现在 checker 里 ⇒ 该项 `status="unsupported"`、`totals.score=null`、`reconciliation.unsupported=["P90"]`、**exit 6**（不静默记 0 分）。复算：
  `python3 check.py --checker fixtures/checker.t1.json --submission fixtures/submission --out /tmp/t1.json` → `rc=6`；`totals={"score":null,...}`。
- **非法 checker ⇒ exit 3**：`python3 check.py --checker fixtures/checker.invalid.json --submission fixtures/submission` → `CHECKER_VIOLATION missing_field:…` ×N、`rc=3`。
- **checker_id 口径**：canonical JSON（`sort_keys`、固定 separators、UTF-8 原样）后 sha256，只覆盖 `schema_version`/两个 hash/`scoring`/`input_contract`/`predicates`/`deductions`/`evidence_policy`，并递归剔除 `_` 前缀注释键；`assignment_id/question_id` 只影响「归属」不影响 id。校验器还会核对声明值与计算值一致（防手写）。
- **哈希口径**：内容 `sha256(bytes)`；目录先过滤 `input_contract.ignore`（支持根锚定与任意深度两种写法），按 POSIX 相对路径**字节序**排序，逐条喂 `rel+"\n"+sha256(content)+"\n"`；软链不跟随（按 `symlink:<target>` 参与哈希）。

## 2 E1–E6 逐条：复算命令 + 真实输出
### E1 位级复现（同尺 × 同卷 × N≥5）
`bash scripts/dsh-checker/repro.sh --checker fixtures/checker.json --submission fixtures/submission --times 5 --submission-id s01 --out /tmp/e1`
```
REPRO times=5 perturb=none poison=none distinct=1 determinism=PASS poison_detected=None leaks=0
canonical[0..2]=['a4907b0a…','a4907b0a…','a4907b0a…']  scores=['45','45','45','45','45']  exits=[0,0,0,0,0]
```
下限判据：`--times 3` → `determinism=FAIL reason=times_below_min`（**N<5 直接 FAIL，不是"跳过"**）。

### E2 环境扰动
`bash scripts/dsh-checker/repro.sh … --times 5 --perturb all --submission-id s01 --out /tmp/e2`（提交复制到 `含 空格 与中文 的 目录/提交 副本`；每轮换 CWD；`LC_ALL=C|en_US.UTF-8|zh_CN.UTF-8`；`TZ=UTC|Asia/Shanghai`；`PYTHONHASHSEED=1..5`；mtime 全改 2001 或 2030）
```
REPRO times=5 perturb=all poison=none distinct=1 determinism=PASS leaks=0
```
「输出无绝对路径」用 grep 断言（对每份结果 JSON 查临时根路径 + `/private/tmp` + `/Users/`），`absolute_path_leaks=0`。

### E3 阴性对照（证伪力）
`bash scripts/dsh-checker/repro.sh … --times 6 --perturb all --poison <X> --out /tmp/e3-X`，X ∈ {timestamp, mtime, readdir, hashseed}
```
poison=timestamp distinct=6 detected=True falsification_power=PASS
poison=mtime     distinct=6 detected=True falsification_power=PASS
poison=readdir   distinct=6 detected=True falsification_power=PASS
poison=hashseed  distinct=6 detected=True falsification_power=PASS
```
毒化只作用在**输出包装层**（`--poison` 往产物里写一个 `poison_probe` 字段），**不改 checker**；干净对照（无 poison）distinct=1，故不存在「永远不一致」的假阳性。
设计 §3.3 的两条防自证也做了：只改 `run_meta` ⇒ **仍判一致**（run_meta 与 `canonical_sha256` 自身被排除）；改 `items[].score` 一个数 ⇒ **判不一致**。

### E4 换尺子检测
```
$ cp fixtures/rubric.md /tmp/rubric.md && printf X >> /tmp/rubric.md
$ python3 check.py --checker fixtures/checker.json --submission fixtures/submission --rubric /tmp/rubric.md --standard fixtures/standard
STALE=true reason=rubric_hash_mismatch ; SCORE_WITHHELD=true（不给分）; rc=4
$ # 标准包内改一个字节 → STALE=true reason=standard_hash_mismatch ; rc=4
```
反例（只改 `generated.session_id/created_at/model` + 调换键序 + 加 `_note`）⇒ `checker_id` 不变、复算 canonical 不变。**stale 结果里 `items=[]`、`totals.score=null`**（不给分，而不是"照算但标注"）。

### E5 注入集全量 + 可比性
```
$ python3 check.py --checker fixtures/checker.json --batch 实验/注入测试集 --dedup none  --out /tmp/e5-all
BATCH_OK zips=63 unique=52 evaluated=63 skipped=0
$ python3 check.py --checker fixtures/checker.json --batch 实验/注入测试集 --dedup digest --out /tmp/e5-dedup
BATCH_OK zips=63 unique=52 evaluated=52 skipped=11
```
**去重口径（显式写死）**：去重键 = zip 文件内容 sha256；默认 `--dedup none` **全跑 63 份**（每份都有独立结果，便于逐份对拍）；`--dedup digest` 时 52 份评估、11 份跳过并记 `skipped_duplicates[{zip, dup_of, digest}]`。
`comparability.json`：`checker_id`/`assignment_id`/`zips_total=63`/`unique_digests=52`/`cross_group=not_comparable`；全量版的 groups=52、**最大同摘要组 7 份**、组内>1 的组 6 个 —— 与 A 的实测一致，任务书旧值「62 份」不采信。
抽样 5 份 × 5 次位级一致（selftest 内断言）。

### E6 边界六例
| 例 | 观察 | rc |
|---|---|---|
| 空提交 | `INPUT_PROBLEM project_root_not_found:**/package.json` | 4 |
| 仅 node_modules | 同上（ignore 任意深度命中，node_modules 里的 package.json 不算工程根） | 4 |
| 超深目录（20 层） | 正常评估，各项按缺失计 | 0 |
| 非 UTF-8 文件 | 文本按 `utf-8/replace` 归一化，计数确定性 | 0 |
| 符号链接（指向根外 / 互指成环） | `INPUT_PROBLEM path_escapes_root`（**fail-closed：不跟随、不静默算 0 分**） | 4 |
| 大小写冲突文件（`Login.vue` + `login.vue`） | 无崩溃，状态在两次运行间一致 | 0 |
每例两次运行 rc 与 canonical 相同，且无 Traceback（selftest 断言）。

## 3 纯函数约束写成运行时断言
`check.py --purity-probe <kind>` 故意触发禁令，断言必须"响"：
```
PURITY_PROBE=network    TRIGGERED  VIOLATION network:socket.socket
PURITY_PROBE=subprocess TRIGGERED  VIOLATION subprocess:Popen
PURITY_PROBE=time       TRIGGERED  VIOLATION time:time.time
PURITY_PROBE=random     TRIGGERED  VIOLATION random:random
PURITY_PROBE=env        TRIGGERED  VIOLATION env:get:TZ
```
真实评估期间 `PURITY_VIOLATIONS=0`（守卫全程未触发 ⇒ 没有偷偷联网/起子进程/读时间随机/读环境变量）。评估期间读文件一律经 `safe_join`（realpath 必须落在 root 之下，软链越界即 `InputProblem`）。

## 4 与既有装置的关系
- 输入可直接用 R0 装置产出的 `<workdir>/materials/{standard,submissions/sNN,rubric.md,materials-manifest.json}`；R1 复算**不需要起 DSH 会话**（模型调用数 = 0）。
- 结果字段与 B 的 `out/results/sNN.json` 同形可对拍：`items[].score/max_score` + 新增 `reason`→平台 `aiFeedback.breakdown`；`totals.score/max_score`→`aiScore/maxScore`；`submission.id`→`submission_id`。
- 本轮**未做**平台侧接线（checker 入库表 / 作业级触发 / 冻结方案 A·B·C —— 见设计 §5，需用户拍板）。

## 5 模型调用与资源
模型调用 **0 次**、网络 **0 次**、子进程 **0 次**（纯 stdlib，全部实验为本地 IO）。E5 全量批跑 63 份 = 63 次解压 + 63 次评估，约 20 秒量级。

## 6 失败与自纠清单（本轮自己踩到并修掉）
1. **bash 3.2 多字节变量名**：`"$RC）"` 会被当成一个变量名 ⇒ `unbound variable`，selftest 第 44 行直接退出。已按 R0-B2 的教训全量扫描并给 13 处加花括号（`fixvars3.py` 口径：变量后紧跟非 ASCII 一律写 `${VAR}`）。
2. **`repro.sh` 摘要抓错行**：`tail -1 stdout` 拿到的是 `EVALUATED … canonical_sha256=…` 整行而不是纯摘要 ⇒ `repro-report.json` 里的 canonical 字段被污染（判定仍正确，但产物不可读）。已改为 `grep -oE '^[0-9a-f]{64}$'`（回退到结果 JSON 字段），并回归验证 5 个 64hex 摘要 + scores/exits。
3. **ignore 语义过窄**：`node_modules/**` 原本只匹配根层，E6「仅 node_modules」竟找到工程根并 rc=0。已改为「根锚定 + 任意深度」两种写法都匹配（夹具哈希未变，故 checker_id/standard_hash 不受影响，已复算确认）。
4. **purity 守卫自身两个坑**：守卫内 `import urllib.request` 会因 `socket.socket` 已被换成函数而 `TypeError`（改为模块顶预导入）；`datetime.datetime.now` 是 C 类型不可 setattr（改为用子类替换模块属性）。

## 7 未验证 / 无法核验项（单列）
1. **E3 的毒化是"模拟泄漏"**：它证明**比较器**具备检出非确定的证伪力，不等价于"真实实现一定会泄漏"；反过来也不能证明"真实实现不会泄漏"（那需要被测实现侧的审计）。
2. **E2 的绝对路径断言是 grep 断言**：只查临时根路径 / `/private/tmp` / `/Users/`；若某天输出里出现别的绝对路径前缀（其它挂载点），该断言不会报。
3. **大小写冲突例**只在本机 APFS（大小写不敏感）上验证「不崩溃 + 确定性」；在大小写敏感文件系统上两文件会真实共存，此时 status 未实测。
4. **跨 checker_id 可比性**只在结构上保证（`cross_group=not_comparable`），未做"两把不同尺子各跑一批再合并"的实测。
5. **E5 的 52/63 数字**只对 `实验/注入测试集/` 当前快照成立（去重键=内容 sha256，快照变了数字就变）；报告已写明去重口径以便复算。
6. T1 词表里的 `vue_sfc_parse` 等平台侧 rule_type 未做映射（设计 §5 已划为平台适配层职责）。

## 8 精读与预算
精读：`docs/dsh/R1-A-设计.md` 全文 189 行（唯一输入）；只读参考 `scripts/dsh-checker` 自带夹具与产物。
本文件 300 行内 / 20KB 内见交付说明；长证据外置 `docs/dsh/evidence/agent-b/R1-01…R1-07`（selftest 全文、E1–E3、E4、E5、E6、纯函数断言、verify 控制台）。
