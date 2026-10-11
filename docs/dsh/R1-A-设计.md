# R1-A 设计：把「尺子」做成产物（checker.json）+ 确定性复算实验设计

## 结论摘要（≤10 行）
1. 交付的是**设计**：checker.json 契约（§1）、纯函数执行器接口（§2）、复算实验（§3）、给 B 的施工单（§4）、平台侧接线边界（§5）。
2. 核心判据：**同一 `checker_id` × 同一提交 ⇒ 输出逐位一致（canonical_sha256 相同）**；分数可信的前置是「尺子不再是会话的一部分」。
3. R0 已证伪的旧形态：同一会话既造尺又量尺 ⇒ 62/56/59/56。R1 的做法是**造尺一次、量尺多次**，量尺阶段**零 LLM、零网络、零子进程**。
4. 尺子身份 = `checker_id`（规范化哈希，覆盖 predicates / deductions / scoring / input_contract / rubric_hash / standard_hash）；`generated.session_id|created_at|model` **不算**换尺子。
5. 换尺子必须**拒评**而不是静默改分：rubric/标准包哈希不匹配 ⇒ `stale=true` + 退出码 4。
6. 实验含**阴性对照**（毒化会漂移的输入）：没有证伪力的装置一律 verdict=FAIL（对齐 C 的 F-C1 教训）。
7. 可比性口径：同 `(assignment_id, checker_id)` 内可比；`checker_id` 不同一律 `not_comparable`。
8. 本轮**不做**平台侧接线（checker 入库表 / 作业级触发 / 冻结方案 A·B·C），只在 §5 标注依赖与拍板项。
9. 施工单 8 条，全部落在 `scripts/dsh-checker/`（新目录）与 `docs/dsh/evidence/agent-b/`，**不改 `server/`**。
10. 与既有装置对接面：B 的 `<workdir>/materials/` + `out/results/sNN.json` 字段（`items[].score/max_score/reason`、`total_score`、`max_score`、`submission_id`）。

---

## 1 checker.json 契约（v1）

### 1.1 顶层字段
| 字段 | 类型 | 必填 | 说明 | 进 checker_id？ |
|---|---|---|---|---|
| `schema_version` | string | ✅ | 固定 `"checker/1"` | ✅ |
| `checker_id` | string | ✅ | `sha256:<64hex>`，由 1.5 规则计算（**不得**手写） | —（自身是结果） |
| `assignment_ref` | object | ✅ | `{assignment_id, question_id, rubric_hash, standard_hash}` | 部分（见 1.5） |
| `generated` | object | ✅ | `{session_id, model, created_at, generator}` 造尺现场 | ❌ volatile |
| `scoring` | object | ✅ | `{max_score, aggregate, rounding, zero_credit_rule}` | ✅ |
| `input_contract` | object | ✅ | `{project_root_glob, required_paths[], ignore[], encoding}` | ✅ |
| `predicates` | array | ✅ | 谓词集（尺子的主体，≥1 项） | ✅ |
| `deductions` | array | ✅ | 缺陷→扣分映射表（可为 `[]`） | ✅ |
| `evidence_policy` | object | ✅ | `{require_line, quote_max_chars}` | ✅ |

### 1.2 最小可读示例（3 谓词，可直接被校验器接受）
```json
{
  "schema_version": "checker/1",
  "checker_id": "sha256:<64hex>",
  "assignment_ref": {
    "assignment_id": "A-2026-10-11-实训1", "question_id": "Q-UserManagement",
    "rubric_hash": "sha256:<64hex>", "standard_hash": "sha256:<64hex>"
  },
  "generated": { "session_id": "4f80bea3-…", "model": "deepseek-v4-flash",
                 "created_at": "2026-10-11T22:40:00+08:00", "generator": "dsh-headless/0.2.0-rc.2" },
  "scoring": { "max_score": 100, "aggregate": "sum_clamped", "rounding": "half_up_1",
               "zero_credit_rule": "missing_required_path" },
  "input_contract": { "project_root_glob": "**/package.json",
                      "required_paths": ["src/main.js"],
                      "ignore": ["node_modules/**", ".git/**", "dist/**"], "encoding": "utf-8" },
  "predicates": [
    { "id": "P01", "group": "工程结构", "item": "存在工程根 package.json", "max_score": 10,
      "rule_type": "file_exists", "params": { "path": "package.json" } },
    { "id": "P02", "group": "路由与页面", "item": "登录页文件存在", "max_score": 20,
      "rule_type": "file_exists", "params": { "path": "src/views/Login.vue" } },
    { "id": "P03", "group": "状态管理", "item": "user store 做了持久化", "max_score": 15,
      "rule_type": "contains_regex",
      "params": { "path": "src/stores/user.js", "pattern": "localStorage|pinia-plugin-persist", "min_count": 1 },
      "deductions": [{ "code": "NO_PERSIST", "when": "hit==0", "delta": -1.0 }] }
  ],
  "deductions": [
    { "code": "MISSING_FILE", "match": { "status": "missing", "rule_type": "*" }, "delta": -1.0 },
    { "code": "EMPTY_FILE",   "match": { "status": "empty",   "rule_type": "*" }, "delta": -0.5 }
  ],
  "evidence_policy": { "require_line": true, "quote_max_chars": 120 }
}
```

### 1.3 谓词词表（v1 只允许 T0：纯 stdlib、离线、无解析器）
| rule_type | params | hit 判定 | 备注 |
|---|---|---|---|
| `file_exists` | `path` | 文件存在且 size>0 | 目录不算命中 |
| `dir_contains_file` | `dir`, `name_glob` | 目录下（非递归）匹配 | glob 只允许 `*?`，**禁止** `{}` |
| `contains_text` | `path`, `text`, `min_count` | 出现次数 ≥ min_count | 归一化：CRLF→LF、去尾空格 |
| `contains_regex` | `path`, `pattern`, `min_count` | 匹配次数 ≥ min_count | 固定 `re` 语义，禁 lookbehind 反向断言 |
| `count_regex` | `path_glob`, `pattern`, `min`, `max` | min ≤ 计数 ≤ max | 计数结果进证据 |
| `count_imports` | `path_glob`, `module` | import/require 计数 ≥1 | 仅文本层（不解析 AST） |
| `file_count_in_dir` | `dir`, `min`, `max`, `ext` | 计数在区间内 | 递归与否由 `recursive` 显式给出 |
| `glob_covers` | `patterns[]` | 全部 pattern 至少命中一个文件 | 防"只交了一页" |

★ **T1（需解析器，如 `syntax_check`/`ast_pattern`/`fact`）本轮不进执行器**：checker 里出现 T1 谓词时，执行器必须 `status="unsupported"` 并 **exit 6（fail-closed）**，**不得静默记 0 分**（"未评估"≠"0 分"）。平台侧若要复用仓内 `rule/executor.js` 的 11 种 rule_type（R0-A 证据 02 B 节），由平台适配层负责，不在 R1 装置内。

### 1.4 哈希口径（rubric_hash / standard_hash / submission.digest 三处必须一致实现）
- **文件内容哈希**：`sha256(bytes)`，不做换行/编码转换。
- **目录哈希**：先过滤 `input_contract.ignore`，再按 **POSIX 相对路径的字节序** 排序，逐条喂 `rel_path + "\n" + sha256(content) + "\n"`，最后 `sha256(整体)`。
- **rubric_hash**：单文件；**standard_hash**：标准包按目录哈希（等价于 `materials-manifest.json` 的 `digest`，B 已在物料清单里产出）。

### 1.5 「哪些字段变了就算换了尺子」
| 变更字段 | 是否换尺子 | 判据 |
|---|---|---|
| `predicates`/`deductions`/`scoring`/`input_contract`/`evidence_policy`/`schema_version` 任一字节 | ✅ 换 | `checker_id` 变；跨版本分数 `not_comparable` |
| `assignment_ref.rubric_hash`/`standard_hash` | ✅ 换 | 同上；且复算时若与当前 rubric/标准包不符 ⇒ `stale` |
| `generated.session_id`/`created_at`/`model`/`generator` | ❌ 不换 | `checker_id` 必须**不变**（校验器有反例测试） |
| `assignment_ref.assignment_id`/`question_id` | ❌ 尺子不变，**归属变** | `checker_id` 不变，但可比性要求 assignment_id 同时相同（§3 E5） |
| 字段顺序 / 空白 / 注释键 `_note` | ❌ 不变 | `checker_id` 用 **canonical JSON**（sort_keys、固定 separators、UTF-8 原样） |

## 2 确定性执行器接口（零 LLM / 纯函数 / 可离线复算）

### 2.1 CLI
```
python3 scripts/dsh-checker/check.py --checker <checker.json> --submission <提交目录> \
        [--root-rel <相对工程根>] [--out <result.json>] [--canonical] [--batch <目录>] [--poison <none|timestamp|mtime|readdir|hashseed>]
```
退出码：**0**=已评估（分数高低都算 0）；**3**=checker 非法/身份字段缺失；**4**=输入问题（提交目录缺失、rubric/标准包哈希不匹配 ⇒ `stale`）；**6**=出现不支持的谓词（fail-closed）。

### 2.2 函数签名（纯函数约束写成可测断言）
```python
def evaluate(checker: Mapping, root: Path, *, allow_nondeterministic: bool = False) -> dict: ...
def canonical_sha256(result: Mapping) -> str: ...        # 排除 run_meta 后规范化
def validate_checker(checker: Mapping) -> list[str]: ... # 返回违规列表，空=合法
```
**纯函数约束（违反即 FAIL）**：不发起网络；不 spawn 子进程；不读时间/随机/环境变量（`TZ`/`LC_ALL`/`PYTHONHASHSEED` 必须读不出影响）；不写文件；只读 `root` 之下（软链不跟随）；遍历顺序一律 `sorted(rel_posix_bytes)`；异常一律转成 `status` 而不是抛出（除 3/4/6）。

### 2.3 输出 schema（`checker-result/1`）
```json
{
  "schema_version": "checker-result/1",
  "checker_id": "sha256:<64hex>",
  "submission": { "id": "s01", "root_rel": "UserManagement", "digest": "sha256:<64hex>", "file_count": 42 },
  "items": [
    { "id": "P02", "group": "路由与页面", "item": "登录页文件存在", "rule_type": "file_exists",
      "max_score": 20, "score": 0, "pass": false, "status": "missing",
      "deductions": ["MISSING_FILE"],
      "evidence": [ { "path": "src/views/Login.vue", "line": null, "quote_sha256": "sha256:<64hex>" } ] }
  ],
  "totals": { "score": 59, "max_score": 100, "aggregate": "sum_clamped" },
  "reconciliation": {
    "expected_items": 3, "evaluated_items": 3, "unsupported": [], "errors": [],
    "matrix": [ { "item_id": "P02", "predicate": "file_exists", "target": "src/views/Login.vue",
                  "expected": "文件存在且非空", "observed": "缺失", "hit": false,
                  "score": 0, "max": 20, "evidence_refs": ["src/views/Login.vue"] } ]
  },
  "canonical_sha256": "<64hex>",
  "run_meta": { "tool": "dsh-checker/1", "elapsed_ms": 12, "poison": "none" }
}
```
- **`items[].status` 取值**：`hit`/`miss`/`missing`/`empty`/`unreadable`/`unsupported`（后三者**不得**与"答错"混同）。
- **对账矩阵**：每个谓词一行（`matrix`），保证"标准里的每一项都量过"；`expected_items == evaluated_items` 且 `unsupported==[]` 才能宣称"逐项对账通过"。
- **bit 级一致的定义**：`canonical_sha256`（= 对除 `run_meta` 外的全部字段做 canonical JSON 后取 sha256）相同。分数用整数/1e-6 量化（`rounding: half_up_1`），禁用浮点累加。
- **与平台对接**：`items[].score/max_score`+新增 `reason` 映射到平台 `aiFeedback.breakdown`；`totals.score/max_score` → `aiScore`/`maxScore`；`submission.id` → `submission_id`（与 B 的 `out/results/sNN.json` 同形，便于直接对拍）。

## 3 确定性复算实验设计

### 3.1 实验矩阵（每条都要有"命令模板 + PASS 判据"）
| # | 实验 | 命令模板 | PASS 判据 |
|---|---|---|---|
| E1 | **位级复现**：同 checker × 同提交 × N≥5，每次独立 workdir | `repro.sh --checker c.json --submission s01 --times 5` | 5 个 `canonical_sha256` **全相同**；N<5 直接 FAIL |
| E2 | **环境扰动**：提交复制到含空格/中文路径、换 CWD、`LC_ALL=C|zh_CN.UTF-8`、`TZ=UTC|Asia/Shanghai`、`PYTHONHASHSEED=0|1|random`、把全部文件 mtime 改成过去/将来 | `repro.sh --perturb all` | 分数与 canonical **逐位一致**；输出里**不出现绝对路径**（grep 断言） |
| E3 | **阴性对照（证伪力）** | `repro.sh --poison timestamp|mtime|readdir|hashseed` | 每个毒化变体必须被判 `inconsistent`；**任一毒化仍报一致 ⇒ `falsification_power=INSUFFICIENT`，整体 verdict=FAIL** |
| E4 | **换尺子检测** | 改 `rubric.md` 一个字节（或标准包内一个文件）后复算 | `stale=true`、`reason=rubric_hash_mismatch|standard_hash_mismatch`、**exit 4 且不给分**；只改 `generated.*` 时 `checker_id` 与结果必须不变 |
| E5 | **注入集全量** | `check.py --batch 实验/注入测试集 --checker c.json` | 每份都产出结果；抽样 5 份 ×5 次位级一致；输出 `comparability.json`。**实测口径（本轮复算）**：`实验/注入测试集/` 有 **63 个 zip / 52 个唯一 sha256**（最大同摘要组 7 份），**0 份与 `实验/标准工程包.zip` 逐字节相同** ⇒ 去重策略（跳过重复 vs 全跑）必须由 B 显式写进报告；任务书写「62 份」未复算，不采信 |
| E6 | **边界** | 空提交 / 仅 `node_modules` / 超深目录 / 非 UTF-8 文件 / 符号链接 / 同名大小写文件 | 每例给出**确定性的 status**，无崩溃、无未定义输出；允许 exit 3/4/6 |

### 3.2 可比性口径（必须写进产物，不许口头约定）
- **可复现**：`checker_id` 相同 + 提交内容 `digest` 相同 ⇒ 分数必须逐位相同（E1）。
- **同作业内可比**：`assignment_id` 相同 **且** `checker_id` 相同 ⇒ 可横向比较（同一把尺子）。
- **跨作业不可比**：`checker_id` 不同（哪怕 rubric 文本看起来一样）⇒ `comparability="not_comparable"`，分数只能各自描述，不得汇总/排名。
- `comparability.json` 结构：`{ "groups": [ { "assignment_id": "…", "checker_id": "sha256:…", "submissions": ["s01","s02"],
  "comparable_within": true, "comparable_across": false, "reason": "same_checker_id" } ], "cross_group": "not_comparable" }`。
- 描述统计（均值/方差/分布）只允许出现在"同一 checker_id 组内"，且**必须**同时打印 `checker_id`。

### 3.3 证伪方式（写死，防"装置自证"）
1. **毒化输入**：E3 的四种毒化必须让装置报不一致；报不出来 = 装置没有证伪力 ⇒ FAIL。毒化只施加在**被测执行器的输出包装层**（`--poison`），不改 checker 内容。
2. **伪造一致**：手工把两次结果里的 `run_meta` 改掉后比对 → 必须**仍判一致**（证明 run_meta 被正确排除）；手工改 `items[].score` 一个数字 → 必须判**不一致**（证明比较的是实质字段）。
3. **换尺子伪装**：只改 `generated.session_id`、只调换 JSON 键顺序、只加 `_note` → `checker_id` 必须不变（校验器反例用例）。
4. **越界自证**：把 checker 里的 `rubric_hash` 改成错的 → E4 必须判 stale 并 exit 4，**不能**因为"分数照样算得出"而 PASS。

## 4 给 B 的施工单（≤8 条 · 每条 ≤5 行）

1. **新建纯执行器骨架**｜目标：`scripts/dsh-checker/check.py`（仅 stdlib）｜路径：新目录 `scripts/dsh-checker/`｜验收：E1 单测 5 次 canonical 相同；`--help` 与退出码 0/3/4/6 可达｜风险：不得 import 仓内 node_modules 或调用 `server/`，不得改 `scripts/dsh-grader/`。
2. **checker 校验器 + checker_id 计算**｜目标：`validate_checker()` 与 canonical 哈希｜路径：`scripts/dsh-checker/validate.py`｜验收：§1.5 表的 5 类变更各有正/反例测试（改 predicates ⇒ id 变；改 session_id/键序 ⇒ id 不变）｜风险：canonical 规则若与平台侧不一致会造成"同一尺子两个 id"，需在文档写死。
3. **对账矩阵与 status 语义**｜目标：`items[].status` 六态 + `reconciliation.matrix` 每谓词一行｜路径：同 1｜验收：`expected_items==evaluated_items`；`unsupported` 非空必须 exit 6（fail-closed），不允许静默 0 分｜风险：把"未评估"当"0 分"会污染分数口径。
4. **复算脚本与产物**｜目标：`scripts/dsh-checker/repro.sh --times N`｜路径：同 1｜验收：产出 `repro-report.json`（含 N、逐次 `canonical_sha256` 列表、`determinism=PASS/FAIL`、`falsification_power`）｜风险：N≥5 才算过；少于 5 次必须 FAIL 而不是"跳过"。
5. **阴性对照（毒化）实现**｜目标：`--poison timestamp|mtime|readdir|hashseed`｜路径：同 1｜验收：四种毒化各产出 `inconsistent`，干净跑 `consistent`；毒化不改变 checker 内容｜风险：毒化若实现成"改分数"，对照就失去意义（必须改**输出包装**）。
6. **「换尺子」检测**｜目标：`stale` 判定 + exit 4｜路径：同 1｜验收：E4 正例（改 rubric 一字节）必须 stale+exit 4 且无分数；反例（只改 generated）必须不变｜风险：哈希口径要与 §1.4 完全一致（换行/编码不得"顺手归一化")。
7. **批量与可比性产物**｜目标：`--batch <注入集>` → 逐份结果 + `comparability.json`｜路径：同 1｜验收：63 个 zip（52 唯一摘要）逐份有结果、去重策略显式；抽样 5 份×5 次一致；跨 `checker_id` 标 `not_comparable`｜风险：63 个 zip 为纯 IO，**零 LLM 调用**（复算阶段模型调用数必须为 0 并写进报告）。
8. **证据与不自证**｜目标：产物与证据外置，B 不得自判"通过"｜路径：`docs/dsh/evidence/agent-b/R1-*.{json,md}`（摘录 ≤5 行摘要 + 文件路径）｜验收：C 能用同一命令复跑得到相同 `canonical_sha256`；报告里模型调用数、N 值、毒化结果三项单列｜风险：不得把 E1 的"一致"当成"分数正确"（分数正确性需 rubric 冻结 + 人工抽检）。

## 5 需用户拍板的边界（本轮不做设计，只标依赖）
| 平台侧接线项 | 依赖的事实/结论 | 拍板点 |
|---|---|---|
| **checker 入库表**（新表/字段：`checker_id, assignment_id, rubric_hash, standard_hash, json, status, created_at`） | R0-A §2.1（`AssignmentQuestion` 无快照、Submission 无快照列） | 新建表 vs 复用 `questions.checkerScript/checkerMeta`；迁移由谁执行（本流水线禁写生产库） |
| **作业级触发**（截止后批改、队列、并发闸） | R0-A §1.1（现为提交即评、无持久化队列）、§1.3（实测并发 64） | 是否新建 `dsh_grading_concurrency`（默认 1）；是否保留"提交即评"降级路径 |
| **冻结方案 A/B/C** | R0-A §2.3（A 快照/B 失效检测/C 编辑拦截） | 选哪一条；未选定前 R1 只能做"装置侧复算"，无法宣称"历史成绩可复现" |
| **重评语义** | R1 设计本身：重评 = 用已入库 checker 重跑（零 LLM） | 教师改分后是否允许"重跑覆盖"；`stale` 时是拒评还是标黄 |
| **分数回写与审计** | R0-A §1.1（`aiScore/aiFeedback` 结构）、B 的 `out/results/sNN.json` 字段 | 平台落库时是否保存 `canonical_sha256` 与 `checker_id`（审计与重算的前置） |
| **PTC / 执行类工具** | R0-A §3.4（PTC 下 `run_code` 需另行处置） | grader 是否开 PTC；影响 §2 的"纯函数"约束强度 |

## 6 精读范围与边界
- 读过的依据：`docs/dsh/00-状态.md`（全文 29 行）、`scripts/dsh-grader/README.md`（全文 91 行，接口/隔离/加固判据）、`docs/dsh/R0-C-独立验证.md` §9-§11（92-129 行，F-C1..F-C5 已修，不重复报）、`docs/dsh/R0-B-实施记录.md` 判据 2（41-60 行，冒烟产物形态）、`scripts/dsh-grader/extract_result.py`（grep 字段名）。R0-A 为我本人上一轮产出，按需引用未复读全文。
- 本轮**未做**：写任何代码、改任何脚本、模型调用、生产库操作、`server/` 改动。
- 本轮**只读实测**（用于校正任务书数字）：`ls 实验/注入测试集/*.zip | wc -l` → 63；python3 逐 zip `sha256` 去重 → 52 个唯一摘要、最大同摘要组 7 份、与 `实验/标准工程包.zip` 相同者 0 份。
- 与 R0 的接口：B 的 `<workdir>/materials/`（`standard/`、`submissions/sNN/`、`rubric.md`、`materials-manifest.json`）直接作为 R1 复算的输入；R1 复算**不需要**再起 DSH 会话（模型调用数 = 0）。