#!/usr/bin/env bash
# scripts/dsh-grader/run.sh —— 隔离批改 runner：只读物料 + 隔离 $DSH_HOME + 隐藏执行类工具 + 硬超时 + 产物落盘
#
# 用法: bash scripts/dsh-grader/run.sh [--submissions N] [--timeout 秒] [--workdir 目录]
#              [--source-dir 实验] [--allow-identical] [--dry-run] [--repo 仓库根] [--dsh-bin 路径]
# 产物: <workdir>/out/grading-result.json（--submissions 1 时的契约路径）
#       <workdir>/out/results/<slug>.json、<workdir>/out/run.log、<workdir>/out/logs/*、<workdir>/out/isolation-report.txt
# 退出码: 0 = 全部成功且隔离通过；124 = 有会话超时；1 = 批改或隔离校验失败；2 = 用法/配置错误
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"
SUBMISSIONS=1
TIMEOUT_SEC=900
WORKDIR=""
SOURCE_DIR="实验"
ALLOW_IDENTICAL=""
ALLOW_STDOUT_FALLBACK=0
MAX_REBUILD=1
EXISTING_CHECKER=""
ALLOW_SCORE_ONLY=0
STRICT=0
CHECKER_MODE=per-submission
DRY_RUN=0
usage() {
  echo "用法: bash scripts/dsh-grader/run.sh [--submissions N] [--timeout 秒] [--workdir 目录] [--source-dir 目录] [--allow-identical] [--dry-run]"
}
while [ $# -gt 0 ]; do
  case "$1" in
    --submissions) SUBMISSIONS="$2"; shift 2 ;;
    --timeout) TIMEOUT_SEC="$2"; shift 2 ;;
    --workdir) WORKDIR="$2"; shift 2 ;;
    --source-dir) SOURCE_DIR="$2"; shift 2 ;;
    --allow-identical) ALLOW_IDENTICAL="--allow-identical"; shift ;;
    --allow-stdout-fallback) ALLOW_STDOUT_FALLBACK=1; shift ;;
    --max-rebuild) MAX_REBUILD="$2"; shift 2 ;;
    --checker) EXISTING_CHECKER="$2"; shift 2 ;;
    --allow-score-only) ALLOW_SCORE_ONLY=1; shift ;;
    --strict) STRICT=1; shift ;;
    --checker-mode) CHECKER_MODE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --repo) DSH_REPO_ROOT="$2"; shift 2 ;;
    --dsh-bin) export DSH_GRADER_BIN="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: ${1}（-h 看用法）" ;;
  esac
done
case "$SUBMISSIONS" in ''|*[!0-9]*) die "--submissions 必须是正整数：$SUBMISSIONS" ;; esac
[ "$SUBMISSIONS" -ge 1 ] || die "--submissions 必须 >= 1"
case "$TIMEOUT_SEC" in ''|*[!0-9]*) die "--timeout 必须是整数秒：$TIMEOUT_SEC" ;; esac
[ "$TIMEOUT_SEC" -ge 10 ] || die "--timeout 至少 10 秒"
# R3-B：模式判定 + K 上限（队长裁定 1：默认 1，硬上限 2）
case "$MAX_REBUILD" in ''|*[!0-9]*) die "--max-rebuild 必须是非负整数：$MAX_REBUILD" ;; esac
if [ "$MAX_REBUILD" -gt 2 ]; then
  log "MAX_REBUILD=$MAX_REBUILD 超过硬上限 2，按 2 执行（队长裁定 1）"
  MAX_REBUILD=2
fi
if [ -n "$EXISTING_CHECKER" ]; then
  MODE=measure-only
  [ -f "$EXISTING_CHECKER" ] || die "--checker 指定的文件不存在：$EXISTING_CHECKER"
elif [ "$ALLOW_SCORE_ONLY" -eq 1 ]; then
  MODE=score-only
else
  MODE=build
fi
CHECKER_CLI="$HERE/../dsh-checker/check.py"
[ -f "$CHECKER_CLI" ] || die "缺少确定性执行器：${CHECKER_CLI}（R1-B 产物）"
SHAPE_VALID=na
CHECKER_ID_FINAL=na
COVERAGE_FINAL=na
REBUILDS=0
MEASURE_CANONICAL=na
MEASURABLE_FINAL=na
UNMEASURABLE_FINAL=na
[ -n "$WORKDIR" ] || WORKDIR="$(mktemp -d /tmp/dsh-grader-run.XXXXXX)"
mkdir -p "$WORKDIR"
WORKDIR="$(cd "$WORKDIR" && pwd)"
OUT="$WORKDIR/out"
LOG_DIR="$OUT/logs"
HOME_DIR="${DSH_GRADER_ISOLATED_HOME:-$WORKDIR/home}"
HOME_DIR="$(guard_isolated_home "$HOME_DIR")"   # F-C3：任何 DSH 调用之前的硬护栏
WORKDIR_LOCK=""
acquire_workdir_lock "$WORKDIR"   # F-C4：原子锁；锁内清理只针对自己的产物
for d in "$WORKDIR/materials" "$WORKDIR/home" "$OUT"; do
  # R3.5-B：measure-only-reuse 复用上一步的 frozen 产物 ⇒ 不清 out/（否则 checker.frozen.json 会被删）
  if [ "$CHECKER_MODE" = "measure-only-reuse" ] && [ "$d" = "$OUT" ]; then
    mkdir -p "$OUT/assignment" "$OUT/measure" "$OUT/checker" "$OUT/grading-result"
    continue
  fi
  if [ -e "$d" ]; then
    chmod -R u+w "$d" 2> /dev/null || true
    rm -rf "$d"
  fi
done
mkdir -p "$LOG_DIR" "$OUT/results" "$HOME_DIR"
DSH_RUN_LOG="$OUT/run.log"
export DSH_RUN_LOG
: > "$DSH_RUN_LOG"
GRADER_HOME="$HOME_DIR"
cleanup() {
  local rc=$?
  trap - EXIT
  cleanup_credentials "$GRADER_HOME"
  release_workdir_lock   # 事故重建时丢失：必须挂在 EXIT 陷阱上，覆盖所有退出路径（含 --checker-mode / 提前 return / die）
  exit "$rc"
}
trap cleanup EXIT
RUN_START=$(date +%s)
FINAL_RC=0
TIMED_OUT=0
GRADED=0
SESSION_FAILED=0
FAIL_REASON=""
CHILD_EXITS=""
RESULT_SOURCES=""
CANONICAL_SKIPPED=""
export DSH_HOME="$HOME_DIR"
DSH="$(dsh_bin)"
echo "== dsh-grader run =="
log "workdir=$WORKDIR"
log "DSH CLI=$DSH 版本=$(dsh_version) profile=$DSH_PROFILE_NAME"
log "隔离 DSH_HOME=$HOME_DIR"
log "--- 1/6 只读物料准备 ---"
python3 "$HERE/prepare_materials.py" --repo "$DSH_REPO_ROOT" --workdir "$WORKDIR" \
  --submissions "$SUBMISSIONS" --source-dir "$SOURCE_DIR" $ALLOW_IDENTICAL
MANIFEST="$WORKDIR/materials/materials-manifest.json"
[ -f "$MANIFEST" ] || die "缺少物料清单 $MANIFEST"
snapshot_dsh_home "$LOG_DIR/dsh-home-before.txt"
snapshot_ports "$LOG_DIR/ports-before.txt"
BEFORE_FILES="$(wc -l < "$LOG_DIR/dsh-home-before.txt" | tr -d ' ')"
log "~/.dsh 指纹基线：$BEFORE_FILES 行"
sleep 3
snapshot_dsh_home "$LOG_DIR/dsh-home-control.txt"
changed_paths "$LOG_DIR/dsh-home-before.txt" "$LOG_DIR/dsh-home-control.txt" > "$LOG_DIR/dsh-home-control-changed.txt"
CONTROL_CHANGED="$(grep -c . "$LOG_DIR/dsh-home-control-changed.txt" || true)"
log "宿主空窗对照（3 秒无 grader 子进程）：~/.dsh 变化 $CONTROL_CHANGED 行（宿主实例自身写入）"
if [ -n "${DSH_GRADER_SIMULATE_LEAK:-}" ]; then
  case "$(real_dir "$DSH_HOME_REAL")" in
    /tmp/*|/private/tmp/*|/var/folders/*) : ;;
    *) die "DSH_GRADER_SIMULATE_LEAK 只允许在沙箱真实 home（临时目录）里使用：$DSH_HOME_REAL" ;;
  esac
  WD_SLUG="$(printf "%s" "${WORKDIR#/}" | tr "/" "-")"
  case "$DSH_GRADER_SIMULATE_LEAK" in
    workdir-slug)
      mkdir -p "$DSH_HOME_REAL/sessions/--$WD_SLUG--/session-11111111-1111-1111-1111-111111111111"
      printf "simulated unisolated session journal (workdir slug in path)
" > "$DSH_HOME_REAL/sessions/--$WD_SLUG--/session-11111111-1111-1111-1111-111111111111/session.v4.jsonl.zstd"
      log "SIMULATE_LEAK=workdir-slug 已写入 $DSH_HOME_REAL/sessions/--$WD_SLUG--/（应被判 isolation=FAIL）"
      ;;
    content-fingerprint)
      mkdir -p "$DSH_HOME_REAL/memories/daily"
      printf "leaked: %s/homelog
" "$HOME_DIR" >> "$DSH_HOME_REAL/memories/daily/simulated-leak.md"
      log "SIMULATE_LEAK=content-fingerprint 已写入 …/memories/daily/simulated-leak.md（应被判 isolation=FAIL）"
      ;;
    profile-dir)
      mkdir -p "$DSH_HOME_REAL/profiles/headless"
      printf "simulated unisolated profile write
" > "$DSH_HOME_REAL/profiles/headless/cordis.yml"
      log "SIMULATE_LEAK=profile-dir 已写入 …/profiles/headless/cordis.yml（应被判 isolation=FAIL）"
      ;;
    host-delete)
      mkdir -p "$DSH_HOME_REAL/memories/daily"
      printf "temporary host file
" > "$DSH_HOME_REAL/memories/daily/host-cleanup-sim.md"
      sleep 1
      rm -f "$DSH_HOME_REAL/memories/daily/host-cleanup-sim.md"
      log "SIMULATE_LEAK=host-delete 已模拟宿主删除（预期 isolation=PASS，反向对照）"
      ;;
    *) die "未知 DSH_GRADER_SIMULATE_LEAK 模式：$DSH_GRADER_SIMULATE_LEAK" ;;
  esac
fi
log "--- 2/6 隔离 home + 凭据（600，退出即删）---"
scaffold_home "$HOME_DIR"
install_credentials "$HOME_DIR"
log "--- 3/6 profile 组合树断言（执行类工具必须禁用）---"
set +e
"$DSH" --profile "$DSH_PROFILE_NAME" --dump-config > "$LOG_DIR/dump-config.txt" 2> "$LOG_DIR/dump-config.err"
DUMP_RC=$?
python3 "$HERE/check_profile.py" "$LOG_DIR/dump-config.txt" > "$LOG_DIR/profile-check.txt" 2>&1
PC_RC=$?
set -e
grep -E 'FAIL|_ALL=' "$LOG_DIR/profile-check.txt" || true
if [ "$DUMP_RC" -ne 0 ] || [ "$PC_RC" -ne 0 ]; then
  die "profile 断言失败（dump_rc=${DUMP_RC} check_rc=${PC_RC}），拒绝在未加固的 profile 上批改"
fi
if [ "$CHECKER_MODE" != "per-submission" ]; then
  # R3.5-B：作业级「一次造尺、N 次量」（S1–S6），与逐份路径互斥（dry-run/per-submission 保持原行为）
  source "$HERE/lib_assignment.sh"
  run_assignment_flow "$CHECKER_MODE"
  ASSIGNMENT_RC=$?
  release_workdir_lock
  exit "$ASSIGNMENT_RC"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  log "--- dry-run：跳过模型会话 ---"
else
  log "--- 4/6 逐份批改（--timeout $TIMEOUT_SEC 秒/份）---"
measure_stage() {
  # 量尺阶段：零 LLM。输入 out/checker/checker.json，输出 results/<slug>.json + reconciliation + 投影
  local slug="$1" sub_id="$2" proj="$3"
  local checker="$OUT/checker/checker.json"
  local result="$OUT/results/$slug.json"
  mkdir -p "$OUT/checker" "$OUT/results" "$OUT/reconciliation"
  # (a) checker_id 占位填充（仅此一项规范化；其余字段一律不动）
  python3 - "$checker" <<'PY'
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), chr(46) + chr(46) + chr(46) + chr(46) + "dsh-checker"))
ck_path = sys.argv[1]
sys.path.insert(0, "/Users/you/My Projects/My Vue/Exam-DeepSeek/scripts/dsh-checker")
import validate as V
ck = json.load(open(ck_path, encoding="utf-8"))
declared = str(ck.get("checker_id", ""))
computed = V.checker_id_of(ck)
if declared != computed and declared.endswith("0" * 64):
    ck["checker_id"] = computed
    json.dump(ck, open(ck_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("CHECKER_ID_FILLED=" + computed)
else:
    print("CHECKER_ID_UNCHANGED=" + declared)
PY
    > "$LOG_DIR/checker-id-$slug.txt" 2>&1 || true
  grep -h "CHECKER_ID_FILLED=\|CHECKER_ID_UNCHANGED=" "$LOG_DIR/checker-id-$slug.txt" || true
  CHECKER_ID_FINAL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1],encoding="utf-8")).get("checker_id","none"))' "$checker" 2> /dev/null || echo none)"
  # (b) 确定性量尺
  set +e
  python3 "$CHECKER_CLI" --checker "$checker" --submission "$WORKDIR/materials/submissions/$slug" --submission-id "$sub_id" \
    --rubric "$WORKDIR/materials/rubric.md" --standard "$WORKDIR/materials/standard" \
    --out "$result" --canonical > "$LOG_DIR/measure-$slug.log" 2>&1
  local mrc=$?
  set -e
  MEASURE_CANONICAL="$(grep -E "^[0-9a-f]{64}" "$LOG_DIR/measure-$slug.log" | tail -1)" || true
  # (c) 覆盖率 + 对账矩阵
  set +e
  python3 "$HERE/coverage_report.py" --checker "$checker" \
    --rubric-sections "$WORKDIR/materials/rubric-sections.json" \
    --session-coverage "$OUT/checker/rubric-coverage.json" \
    --matrix "$OUT/reconciliation/matrix.json" --json "$OUT/reconciliation/coverage.json" \
    > "$LOG_DIR/coverage-$slug.log" 2>&1
  local crc=$?
  set -e
  COVERAGE_FINAL="$(grep -h '^COVERAGE states=' "$LOG_DIR/coverage-$slug.log" | sed 's/^COVERAGE states=//' || true)"
  # (d) 平台兼容投影（单向：checker-result/1 -> grading-result.json）
  local proj_args=""
  [ "$MODE" = "score-only" ] && proj_args="--score-only"
  set +e
  python3 "$HERE/extract_result.py" --project --result "$result" --checker "$checker" \
    --out "$OUT/grading-result.json" --expect-submission-id "$sub_id" $proj_args \
    > "$LOG_DIR/projection-$slug.log" 2>&1
  local prc=$?
  set -e
  grep -E "PROJECTION_" "$LOG_DIR/projection-$slug.log" || true
  # (e) provenance：装置侧独立复证信息（只追加 verifier 段，不改会话原文）
  python3 - "$OUT/checker/checker.provenance.json" "$checker" "$MEASURE_CANONICAL" "$mrc" "$crc" "$prc" "$REBUILDS" <<'PY' || true
import json, os, sys
prov_path, ck_path, canonical, mrc, crc, prc, rebuilds = sys.argv[1:8]
doc = {}
if os.path.isfile(prov_path):
    try:
        doc = json.load(open(prov_path, encoding="utf-8"))
    except ValueError:
        doc = {"_note": "session provenance unparsable; device verifier block appended"}
sys.path.insert(0, "/Users/you/My Projects/My Vue/Exam-DeepSeek/scripts/dsh-checker")
import validate as V
ck = json.load(open(ck_path, encoding="utf-8"))
doc["verifier"] = {"tool": "dsh-grader/r3", "checker_id_recomputed": V.checker_id_of(ck),
                   "measure_exit": int(mrc), "coverage_exit": int(crc), "projection_exit": int(prc),
                   "canonical_sha256": canonical, "rebuilds": int(rebuilds),
                   "checker_result_schema": "checker-result/1"}
json.dump(doc, open(prov_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PROVENANCE_UPDATED checker_id_recomputed=" + doc["verifier"]["checker_id_recomputed"][:20])
PY
  [ "$mrc" -eq 0 ] && [ "$crc" -eq 0 ] && [ "$prc" -eq 0 ]
}
  while IFS='|' read -r SLUG SUB_ID PROJECT_ROOT ZIP_NAME; do
    [ -n "$SLUG" ] || continue
    SUB_FAILED=0
    PROJ_ABS="$WORKDIR/$PROJECT_ROOT"
    [ -d "$PROJ_ABS" ] || die "学生提交目录不存在：$PROJ_ABS"
    CANDIDATE="$OUT/grading-result.json"
    ARTIFACT="$LOG_DIR/model-artifact-$SLUG.json"
    rm -f "$CANDIDATE"
    RUBRIC_SECTIONS_N="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1],encoding=chr(34)+chr(117)+chr(116)+chr(102)+chr(45)+chr(56)+chr(34)))["sections_total"])' "$WORKDIR/materials/rubric-sections.json" 2> /dev/null || echo ?)"
    RUBRIC_HASH_LITERAL="$(python3 -c 'import json,sys;m=json.load(open(sys.argv[1],encoding="utf-8"));print("sha256:"+m["rubric"]["sha256"].split("sha256:")[-1], "sha256:"+str(m["standard"].get("extract_digest", m["standard"]["sha256"])).split("sha256:")[-1])' "$WORKDIR/materials/materials-manifest.json" 2> /dev/null || echo "? ?")"
    RUBRIC_HASH_EXACT="${RUBRIC_HASH_LITERAL%% *}"
    STANDARD_HASH_EXACT="${RUBRIC_HASH_LITERAL##* }"
    if [ "$MODE" = "score-only" ]; then
      cat > "$LOG_DIR/prompt-$SLUG.txt" <<EOF
你是一名严格但公正的课程助教，负责按评分标准给一份 Vue 3 前端作业打分。
物料（只读）：题目描述 $WORKDIR/materials/assignment.md ｜ 评分标准 $WORKDIR/materials/rubric.md ｜
rubric 段落切分 $WORKDIR/materials/rubric-sections.json（共 $RUBRIC_SECTIONS_N 段）｜ 学生提交 $PROJ_ABS
硬约束：①materials/ 只读；②本环境没有执行类工具；③只允许写一个结果文件（其余一律不写）：$OUT/results/$SLUG.model.json
要求：按 rubric 的**每个段落**逐条打分（条目数由 rubric 决定，不要凭空设定项数）；每条给出 score/max_score 与带 文件:行号 的证据；
schema：{"schema_version":"model-selfcheck/1","submission_id":"$SUB_ID","items":[{"id":"S001","score":0,"max_score":10,"status":"hit|miss|missing","reason":"..."}]}
注意：本次为 score-only 模式（没有可复算的 checker），结果**不具备同尺可比性**。
完成后打印一行：GRADING_DONE=$SUB_ID
EOF
    else
      cat > "$LOG_DIR/prompt-$SLUG.txt" <<EOF
你是一名严格但公正的课程助教。本次任务分两步：先**造一把尺子**（checker.json），再按这把尺子给提交打分。
物料（只读）：
- 题目描述：$WORKDIR/materials/assignment.md
- 评分标准：$WORKDIR/materials/rubric.md
- rubric 段落切分（权威口径，共 $RUBRIC_SECTIONS_N 段）：$WORKDIR/materials/rubric-sections.json
- 物料清单（含 rubric.sha256 与 standard.sha256，照抄用）：$WORKDIR/materials/materials-manifest.json
- 标准工程包（对照）：$WORKDIR/materials/standard
- 学生提交（本次待评分，标识 ${SUB_ID}）：$PROJ_ABS
硬约束（违反则本次批改作废）：
1) materials/ 只读，不要修改其中任何文件。
2) 本环境没有执行类工具：不要尝试运行代码、不要 npm install、不要构建；如需自检，请用阅读方式逐条核对。
3) 只允许写下面这几类产物（**不要写** out/grading-result.json，它由装置用确定性执行器生成）：
   a. $OUT/checker/checker.json               尺子本体（schema checker/1）
   b. $OUT/checker/rubric-coverage.json       逐段覆盖率（四态）
   c. $OUT/checker/checker.provenance.json    造尺现场 + 自检记录
   d. $OUT/results/$SLUG.model.json           你按这把尺子对本次提交的逐项判分（自述，供装置对账）
【布局与 glob 语义（钉死；写错会被 C8 可量性探针判不合格，本次造尺作废）】
- 装置量尺时传给执行器的 --submission 是**提交目录**：$WORKDIR/materials/submissions/<slug>。
  含 package.json 的**项目根**在该目录的下一层（例如 <slug>/UserManagement_副本/），装置会按 input_contract.project_root_glob 自动探测。
- glob 是 fnmatch 语义，**不做**大括号展开：`**/package.json` 要求 package.json 之前**至少有一层目录**；`package.json` 只匹配提交目录顶层。
  ✅ 正确写法（本布局唯一稳的）："project_root_glob": "**/package.json"（或 "*/package.json"）；required_paths 写**相对项目根**的路径，例如 "src/main.js"。
  ❌ 反例（本次造尺会被判不合格）："**/UserManagement*"（把学生目录名写进 glob ⇒ 改名或换布局即失配）、"UserManagement_副本/package.json"、
     "package.json"（无前缀 ⇒ 只匹配提交目录顶层，而项目根在下一层 ⇒ 探不到）。
- 自检方式（阅读式，本环境无执行工具）：把 glob 逐字套到 `materials/submissions/<slug>/UserManagement_副本/package.json` 上，问自己「这个模式能匹配它吗」。
checker.json 字段白名单（自创字段/rule_type/大括号 glob/反向断言正则都会导致校验失败 ⇒ 本次批改作废）：
- 顶层 9 个字段全部必填：schema_version=checker/1、checker_id、assignment_ref{assignment_id,question_id,rubric_hash,standard_hash}、
  generated{session_id,model,created_at,generator}、scoring{max_score,aggregate=sum_clamped,rounding=half_up_1,zero_credit_rule}、
  input_contract{project_root_glob,required_paths,ignore,encoding=utf-8}、predicates[]、deductions[]、evidence_policy{require_line,quote_max_chars}
- predicates[] 每项：{id, group, item, max_score, rule_type, params}；rule_type 只允许这八种（T0）：
  file_exists / dir_contains_file / contains_text / contains_regex / count_regex / count_imports / file_count_in_dir / glob_covers
- params 必填：file_exists{path}、dir_contains_file{dir,name_glob}、contains_text{path,text,min_count}、contains_regex{path,pattern,min_count}、
  count_regex{path_glob,pattern,min,max}、count_imports{path_glob,module}、file_count_in_dir{dir,min,max,ext,recursive}、glob_covers{patterns[]}
- glob 只允许 * 和 ?（禁止大括号展开）；正则禁止 lookbehind 反向断言
- checker_id 写占位值 "sha256:0000000000000000000000000000000000000000000000000000000000000000"：装置会按契约算法填入
  （canonical JSON 后 sha256；覆盖 schema_version/rubric_hash/standard_hash/scoring/input_contract/predicates/deductions/evidence_policy，
   剔除下划线前缀注释键；generated.* 与 assignment_id 不影响 id）。**不要试图手算 sha256**。
- **照抄以下两个哈希（装置已算好，禁止自己计算/改动任何一个字符）**：
  rubric_hash   = $RUBRIC_HASH_EXACT
  standard_hash = $STANDARD_HASH_EXACT
  （如果你写了别的值，闸 C3 会判 hash_anchor_mismatch 合格失败；执行器还会因 stale 拒绝给分 ⇒ C8 也会判不合格。）
- predicates[].group 必须等于它覆盖的那一段 rubric 的 head（原文照抄，便于覆盖率对账）；一个谓词可覆盖多段，但要写进 rubric-coverage.json
- 分值：sum(predicates[].max_score) 必须 <= scoring.max_score；若小于，必须在 deductions 或顶层 _note 里显式解释差额
- 【分值自检】把所有 predicates[].max_score 相加，必须 ≤ scoring.max_score（**建议留 ≥3 分余量**，用于 deductions）；
- 【params 必填清单（逐 rule_type，缺一个字段就会被 validate.py 判 params_missing，本次造尺作废）】
  file_exists{path} ｜ dir_contains_file{dir,name_glob} ｜ contains_text{path,text,min_count} ｜ contains_regex{path,pattern,min_count}
  ｜ count_regex{path_glob,pattern,min,max} ｜ count_imports{path_glob,module} ｜ file_count_in_dir{dir,min,max,ext,recursive} ｜ glob_covers{patterns[]}
  写完 predicates[] 后，**逐条**把它和上面一行对照一遍：字段名必须完全一致（例如 count_regex 只能用 path_glob，不能写 path），缺字段或改名都会直接判不合格。
- 【差额解释】若 sum(predicates[].max_score) < scoring.max_score，必须在顶层 "_note"（或 deductions）里用一句话显式解释差额（例如「未覆盖段落不计分」）；不解释会被闸判 C4 unexplained_gap 不合格。
  历史失败样本：某次会话写了 9 个谓词合计 111 分而 scoring.max_score=100 ⇒ 闸判 C4 不合格、白跑一次重造。请写完后逐项加一遍再落盘。
rubric-coverage.json 形状：
{"schema_version":"rubric-coverage/1","checker_id":"<与 checker.json 相同>",
 "uncovered":[{"sid":"S00X","head":"...","excerpt":"原文片段"}],
 "sections":[{"sid":"S001","head":"<照抄 rubric-sections.json>","state":"covered|partially_covered|uncovered|subjective",
              "predicates":["P01"],"reason":"判定理由"}]}
要求：rubric 的 $RUBRIC_SECTIONS_N 段必须**全部**出现（sid 与 head 照抄）；sections[].predicates 引用的 id 必须存在于 checker.json；
uncovered 段落必须列进 uncovered[] 并给原文片段；主观段落（命名/注释/规范类）标 subjective。
checker.provenance.json 形状：
{"schema_version":"checker-provenance/1","generated":{"session_id":"...","model":"...","created_at":"...","generator":"dsh-headless"},
 "self_check":{"method":"reading-only","checker_id":"<占位同 checker.json>","checked":["C1..C7 逐条阅读核对结论"]},
 "inputs":{"rubric_hash":"sha256:...","standard_hash":"sha256:..."}}
最后写 $OUT/results/$SLUG.model.json（你按这把尺子对该提交的逐项判分）：
{"schema_version":"model-selfcheck/1","submission_id":"$SUB_ID","items":[{"id":"P01","score":0,"max_score":10,"status":"hit|miss|missing|empty|unreadable","reason":"文件:行号 证据"}]}
完成后依次打印三行：CHECKER_ID=<你写的占位>、COVERAGE=covered:N/partial:N/uncovered:N/subjective:N、GRADING_DONE=$SUB_ID
EOF
    fi
    log "批改 ${SUB_ID}（${ZIP_NAME}）→ ${PROJ_ABS}（MODE=${MODE}）"
    if [ "$MODE" = "measure-only" ]; then
      mkdir -p "$OUT/checker"
      cp "$EXISTING_CHECKER" "$OUT/checker/checker.json"
      [ -f "$OUT/checker/rubric-coverage.json" ] || printf '{"schema_version":"rubric-coverage/1","sections":[],"uncovered":[]}' > "$OUT/checker/rubric-coverage.json"
      log "measure-only：跳过造尺会话，直接使用 --checker ${EXISTING_CHECKER}（零模型调用）"
    fi
    ATTEMPT=0
    VIOL_TEXT=""
    SHAPE_RC=1
    while : ; do
      if [ "$MODE" != "measure-only" ]; then
        if [ "$ATTEMPT" -gt 0 ]; then
          {
            echo ""
            echo "【重造提示（第 $ATTEMPT 次）】上一版 checker 被判不合格，违规原文如下："
            printf '%s\n' "$VIOL_TEXT"
            echo "请只修这些点，其余保持不变；仍须满足 C1–C7。"
          } >> "$LOG_DIR/prompt-$SLUG.txt"
        fi
        set +e
        RUNNER_OUT="$(python3 "$HERE/run_with_timeout.py" --timeout "$TIMEOUT_SEC" \
          --out "$LOG_DIR/session-$SLUG.out" --err "$LOG_DIR/session-$SLUG.err" --cwd "$WORKDIR" \
          -- "$DSH" --profile "$DSH_PROFILE_NAME" "$(cat "$LOG_DIR/prompt-$SLUG.txt")")"
        SESSION_RC=$?
        set -e
        CHILD_EXIT="$(echo "$RUNNER_OUT" | grep '^RUNNER_CHILD_EXIT=' | cut -d= -f2)"
        ELAPSED="$(echo "$RUNNER_OUT" | grep '^RUNNER_ELAPSED_SEC=' | cut -d= -f2)"
        ORPHAN="$(echo "$RUNNER_OUT" | grep '^RUNNER_ORPHAN=' | cut -d= -f2)"
        log "session 结束（attempt=${ATTEMPT}）：rc=$SESSION_RC child_exit=$CHILD_EXIT elapsed=${ELAPSED}s orphan=$ORPHAN"
        if [ "$SESSION_RC" -eq 124 ] || [ "$CHILD_EXIT" = "timeout" ]; then
          TIMED_OUT=1
          log "TIMEOUT：${SUB_ID} 超过 ${TIMEOUT_SEC}s 未完成，子进程组已被终止（orphan=${ORPHAN}）"
          FINAL_RC=124
          break
        fi
        CHILD_EXITS="${CHILD_EXITS}${SLUG}:rc=${SESSION_RC}/child_exit=${CHILD_EXIT} "
        if [ "$SESSION_RC" -ne 0 ] || [ "$CHILD_EXIT" != "0" ]; then
          SESSION_FAILED=1
          SUB_FAILED=1
          FAIL_REASON="${FAIL_REASON}session-nonzero-exit(${SLUG}:rc=${SESSION_RC},child_exit=${CHILD_EXIT}) "
          log "SESSION_FAIL：${SUB_ID} 会话退出码 rc=${SESSION_RC} child_exit=${CHILD_EXIT} ≠ 0 ⇒ 不得判 PASS（F-C2）；产物仅供诊断"
          if [ "$FINAL_RC" -eq 0 ]; then FINAL_RC=1; fi
          break
        fi
      fi
      if [ "$MODE" = "score-only" ]; then
        SHAPE_RC=0
        break
      fi
      # 契约允许的唯一规范化：checker_id 占位值由装置按算法填入（R1-A §1.1「不得手写」）；其余字段一律不动
      if [ -f "$OUT/checker/checker.json" ]; then
        python3 - "$OUT/checker/checker.json" > "$LOG_DIR/checker-id-$SLUG.txt" 2>&1 <<'PY' || true
import json, sys
sys.path.insert(0, "/Users/you/My Projects/My Vue/Exam-DeepSeek/scripts/dsh-checker")
import validate as V
p = sys.argv[1]
ck = json.load(open(p, encoding="utf-8"))
declared = str(ck.get("checker_id", ""))
computed = V.checker_id_of(ck)
if declared != computed and set(declared.replace("sha256:", "")) <= set("0"):
    ck["checker_id"] = computed
    json.dump(ck, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("CHECKER_ID_FILLED=" + computed)
else:
    print("CHECKER_ID_UNCHANGED=" + declared)
PY
        grep -h "CHECKER_ID_" "$LOG_DIR/checker-id-$SLUG.txt" || true
      fi
      REQUIRE_COVERAGE=yes
      [ "$MODE" = "measure-only" ] && REQUIRE_COVERAGE=no
      set +e
      GATE_STRICT=""
      [ "$STRICT" -eq 1 ] && GATE_STRICT="--strict"
      bash "$HERE/shape_gate.sh" --workdir "$WORKDIR" --slug "$SLUG" --require-coverage "$REQUIRE_COVERAGE" $GATE_STRICT > "$LOG_DIR/shape-$SLUG.txt" 2>&1
      SHAPE_RC=$?
      set -e
      grep -E '^SHAPE_|^VIOLATION|^MEASURABLE=|^UNMEASURABLE ' "$LOG_DIR/shape-$SLUG.txt" | tail -14 || true
      MEASURABLE_FINAL="$(grep -oE 'MEASURABLE=[0-9]+' "$LOG_DIR/shape-$SLUG.txt" | head -1 | cut -d= -f2)" || true
      UNMEASURABLE_FINAL="$(grep -oE 'UNMEASURABLE=[0-9]+' "$LOG_DIR/shape-$SLUG.txt" | head -1 | cut -d= -f2)" || true
      if [ "$SHAPE_RC" -eq 1 ]; then
        SHAPE_VALID=strict-partial
        FINAL_RC=1
        FAIL_REASON="${FAIL_REASON}strict-unmeasurable(${SLUG}):${UNMEASURABLE_FINAL} "
        log "STRICT_PARTIAL：${UNMEASURABLE_FINAL} 份提交不可量（--strict）⇒ 退出码 1，不写契约产物、不重造"
        break
      fi
      if [ "$SHAPE_RC" -eq 0 ]; then
        SHAPE_VALID=yes
        break
      fi
      SHAPE_VALID=no
      VIOL_TEXT="$(grep -E '^VIOLATION|^SHAPE_C[1-7]=FAIL' "$LOG_DIR/shape-$SLUG.txt" | head -20)" || true
      SHAPE_FAIL_PENDING=1
      if [ "$MODE" = "build" ] && [ "$ATTEMPT" -lt "$MAX_REBUILD" ]; then
        ATTEMPT=$((ATTEMPT + 1))
        REBUILDS=$((REBUILDS + 1))
        log "SHAPE_FAIL：造尺不合格 ⇒ 第 $ATTEMPT 次重造（K=${MAX_REBUILD}，附 VIOLATION 原文）"
        continue
      fi
      log "SHAPE_FAIL：造尺不合格且重造用尽（K=${MAX_REBUILD}）⇒ FINAL_RC=5，不进入量尺、不写 grading-result.json"
      FAIL_REASON="${FAIL_REASON}shape-gate-failed(${SLUG}) "
      break
    done
    if [ "$SHAPE_RC" -ne 0 ]; then
  [ "$FINAL_RC" -eq 0 ] && FINAL_RC=5
      continue
    fi
    if [ "$MODE" = "score-only" ]; then
      MODEL_RESULT="$OUT/results/$SLUG.model.json"
      set +e
      python3 "$HERE/extract_result.py" --project --result "$MODEL_RESULT" --checker none --score-only \
        --out "$OUT/grading-result.json" --expect-submission-id "$SUB_ID" > "$LOG_DIR/projection-$SLUG.log" 2>&1
      PRC=$?
      set -e
      grep -E '^PROJECTION_' "$LOG_DIR/projection-$SLUG.log" || true
      if [ "$PRC" -eq 0 ]; then
        GRADED=$((GRADED + 1))
        RESULT_SOURCES="${RESULT_SOURCES}${SLUG}:model-selfcheck/score-only "
        log "MODE=score-only：已生成投影（该结果不具备同尺可比性，降级口径已写进投影 projection.comparable_within_checker=false）"
      else
        log "score-only 投影失败：${SUB_ID}（详见 $LOG_DIR/projection-$SLUG.log）"
        if [ "$FINAL_RC" -eq 0 ]; then FINAL_RC=1; fi
        FAIL_REASON="${FAIL_REASON}score-only-projection-failed(${SLUG}) "
      fi
      continue
    fi
    if measure_stage "$SLUG" "$SUB_ID" "$PROJ_ABS"; then
      RESULT_SOURCES="${RESULT_SOURCES}${SLUG}:checker-result/1 "
      GRADED=$((GRADED + 1))
      log "MEASURED id=${SUB_ID} slug=${SLUG} checker_id=${CHECKER_ID_FINAL} canonical=${MEASURE_CANONICAL} coverage=${COVERAGE_FINAL:-none}"
    else
      log "量尺阶段失败：${SUB_ID}（详见 $LOG_DIR/measure-$SLUG.log、coverage-${SLUG}.log、projection-${SLUG}.log）"
      if [ "$FINAL_RC" -eq 0 ]; then FINAL_RC=1; fi
      FAIL_REASON="${FAIL_REASON}measure-failed(${SLUG}) "
    fi
  done < <(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1], encoding='utf-8'))
for s in m['submissions']:
    print('|'.join([s['slug'], s['id'], s['project_root'], s['zip']]))
PY
)
fi
log "--- 5/6 隔离旁证 + 凭据清理 ---"
# 收尾阶段（隔离旁证/扫描/清理/汇总）是报告步骤：显式关闭 set -e，任何单条命令失败不得吞掉汇总与退出码（t17 实测：cleanup 后 set -e 曾让脚本静默 exit 1）
set +e
snapshot_dsh_home "$LOG_DIR/dsh-home-after.txt"
snapshot_ports "$LOG_DIR/ports-after.txt"
AFTER_FILES="$(wc -l < "$LOG_DIR/dsh-home-after.txt" | tr -d ' ')"
changed_paths "$LOG_DIR/dsh-home-before.txt" "$LOG_DIR/dsh-home-after.txt" > "$LOG_DIR/dsh-home-changed.txt"
CHILD_SESSION="$(find "$HOME_DIR" -type f 2> /dev/null | grep -oE 'session-[0-9a-f-]{36}' | head -1 | sed 's/^session-//' || true)"
python3 "$HERE/classify_changes.py" --changed "$LOG_DIR/dsh-home-changed.txt" \
  --control "$LOG_DIR/dsh-home-control-merged.txt" --host-session "${DSH_SESSION_ID:-}" \
  --child-session "$CHILD_SESSION" --isolated-home "$HOME_DIR" --workdir "$WORKDIR" \
  --dsh-home "$DSH_HOME_REAL" > "$LOG_DIR/dsh-home-classified.txt" 2> "$LOG_DIR/dsh-home-classified.err" || true
CHILD_CHANGED="$(sed -n '/^__CHILD__$/,/^__UNATTRIBUTED__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
UNATTR_CHANGED="$(sed -n '/^__UNATTRIBUTED__$/,/^__OTHER__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
OTHER_CHANGED="$(sed -n '/^__OTHER__$/,/^__HOST__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
HOST_CHANGED="$(sed -n '/^__HOST__$/,/^__REASONS__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
# R3-B：后置空窗控制（子进程已退出）与前置空窗取并集，作为「宿主/并发会话自有变化」的证据；子进程指纹规则不变
snapshot_dsh_home "$LOG_DIR/dsh-home-post.txt"
sleep 3
snapshot_dsh_home "$LOG_DIR/dsh-home-post2.txt"
changed_paths "$LOG_DIR/dsh-home-post.txt" "$LOG_DIR/dsh-home-post2.txt" > "$LOG_DIR/dsh-home-post-changed.txt"
CONTROL_POST_CHANGED="$(grep -c . "$LOG_DIR/dsh-home-post-changed.txt" || true)"
cat "$LOG_DIR/dsh-home-control-changed.txt" "$LOG_DIR/dsh-home-post-changed.txt" 2> /dev/null | LC_ALL=C sort -u > "$LOG_DIR/dsh-home-control-merged.txt"
log "控制窗证据：前置 $CONTROL_CHANGED 行 + 后置 $CONTROL_POST_CHANGED 行 ⇒ 并集 $(grep -c . "$LOG_DIR/dsh-home-control-merged.txt" || true) 行"
CHANGED="$(grep -c . "$LOG_DIR/dsh-home-changed.txt" || true)"
NEW_PORTS="$(comm -13 "$LOG_DIR/ports-before.txt" "$LOG_DIR/ports-after.txt" | head -20 || true)"
ISO_HOME_FILES="$(find "$HOME_DIR" -type f -not -path '*/profiles/*' -not -name '.credentials.yaml' | wc -l | tr -d ' ')"
CHANGED_N="$CHANGED"
HOST_N="$(printf '%s' "$HOST_CHANGED" | grep -c . || true)"
OTHER_N="$(printf '%s' "$OTHER_CHANGED" | grep -c . || true)"
CHILD_N="$(printf '%s' "$CHILD_CHANGED" | grep -c . || true)"
UNATTR_N="$(printf '%s' "$UNATTR_CHANGED" | grep -c . || true)"
ISO=PASS
ISO_REASONS=""
if [ -n "$CHILD_CHANGED" ]; then ISO=FAIL; ISO_REASONS="${ISO_REASONS}child-write "; fi
if [ -n "$UNATTR_CHANGED" ]; then ISO=FAIL; ISO_REASONS="${ISO_REASONS}unattributed-change "; fi
if [ -n "$OTHER_CHANGED" ]; then ISO=FAIL; ISO_REASONS="${ISO_REASONS}other-change "; fi
if [ -n "$NEW_PORTS" ]; then ISO=FAIL; ISO_REASONS="${ISO_REASONS}new-listener "; fi
{
  echo "dsh_home_before_files=$BEFORE_FILES"
  echo "dsh_home_after_files=$AFTER_FILES"
  echo "control_idle_changed=$CONTROL_CHANGED"
  echo "control_post_changed=$CONTROL_POST_CHANGED"
  echo "changed_total=$CHANGED_N"
  echo "changed_child_write=$CHILD_N"
  echo "changed_unattributed=$UNATTR_N"
  echo "changed_other=$OTHER_N"
  echo "changed_host=$HOST_N"
  echo "child_session_id=$CHILD_SESSION"
  echo "host_session_id=${DSH_SESSION_ID:-}"
  echo "new_listeners=$(printf '%s' "$NEW_PORTS" | grep -c . || true)"
  echo "isolated_home_files=$ISO_HOME_FILES"
  echo "verdict=$ISO"
  echo "verdict_reasons=${ISO_REASONS:-none}"
  echo "--- 归因判据：classify_changes.py R1..R8（不允许目录级无条件豁免）---"
  echo "--- RULE 明细 ---"
  sed -n '/^__REASONS__$/,/^__SUMMARY__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' | head -40 || true
  echo "--- changed_child_write（必须为空）---"
  printf '%s' "$CHILD_CHANGED" | head -5
  echo "--- changed_unattributed（必须为空）---"
  printf '%s' "$UNATTR_CHANGED" | head -5
  echo "--- changed_other（必须为空）---"
  printf '%s' "$OTHER_CHANGED" | head -10
  echo "--- changed_host（已按判据归因）---"
  printf '%s' "$HOST_CHANGED" | head -10
  echo "--- new_listeners（head）---"
  printf '%s' "$NEW_PORTS" | head -10
  echo "--- isolated_home sample ---"
  find "$HOME_DIR" -type f -not -path '*/profiles/*' | head -8
} > "$OUT/isolation-report.txt"
if [ "$ISO" = "PASS" ]; then
  log "隔离：changed=$CHANGED_N child_write=$CHILD_N unattributed=$UNATTR_N other=$OTHER_N host=${HOST_N}，无新增监听端口；子进程会话 $CHILD_SESSION 的产物全部落在隔离 home（$ISO_HOME_FILES 个文件）"
else
  log "隔离：FAIL，详见 $OUT/isolation-report.txt"
  if [ "$FINAL_RC" -eq 0 ]; then FINAL_RC=1; fi
fi
LEAK_OUT="$(scan_key_leak "$OUT" "$GRADER_HOME/.credentials.yaml" || true)"
LEAK_SRC="$(scan_key_leak "$HERE" || true)"
if [ -z "$LEAK_OUT" ]; then
  log "凭据泄漏扫描：out/ 无明文凭据（精确值比对 + sk- 形态比对）"
else
  log "凭据泄漏扫描：out/ FAIL → $(printf '%s' "$LEAK_OUT" | head -3 | tr ' ' '_')"
  if [ "$FINAL_RC" -eq 0 ]; then FINAL_RC=1; fi
fi
if [ -z "$LEAK_SRC" ]; then
  log "凭据泄漏扫描：scripts/dsh-grader/ 无 sk- 形态明文"
else
  log "凭据泄漏扫描：scripts/dsh-grader/ FAIL → $(printf '%s' "$LEAK_SRC" | head -3 | tr ' ' '_')"
  if [ "$FINAL_RC" -eq 0 ]; then FINAL_RC=1; fi
fi
cleanup_credentials "$GRADER_HOME"
if [ -f "$GRADER_HOME/.credentials.yaml" ]; then
  log "凭据清理失败：$GRADER_HOME/.credentials.yaml 仍存在"
  if [ "$FINAL_RC" -eq 0 ]; then FINAL_RC=1; fi
fi
log "--- 6/6 汇总 ---"
if [ -f "$OUT/grading-result.json" ] && [ "$FINAL_RC" -eq 0 ]; then
  log "契约产物：$OUT/grading-result.json（平台兼容投影；source=${RESULT_SOURCES:-none}）"
else
  rm -f "$OUT/grading-result.json"
  log "契约产物：未产出（门控：FINAL_RC=${FINAL_RC} shape=${SHAPE_VALID} reason=${FAIL_REASON:-none}）"
fi
if [ "$SUBMISSIONS" -gt 1 ]; then
  python3 - "$OUT" <<'PY'
import json, os, sys
out = sys.argv[1]
res = []
d = os.path.join(out, 'results')
for n in sorted(os.listdir(d)):
    if n.endswith('.json'):
        res.append(json.load(open(os.path.join(d, n), encoding='utf-8')))
with open(os.path.join(out, 'grading-results.json'), 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
    f.write(chr(10))
print('wrote %s (%d results)' % (os.path.join(out, 'grading-results.json'), len(res)))
PY
fi
RUN_END=$(date +%s)
RUN_ELAPSED=$((RUN_END - RUN_START))
if [ "$FINAL_RC" -eq 0 ]; then
  if [ "$DRY_RUN" -eq 1 ]; then VERDICT=DRYRUN_PASS; else VERDICT=PASS; fi
else
  VERDICT=FAIL
fi
echo "RUN_RESULT=$VERDICT graded=$GRADED requested=$SUBMISSIONS isolation=$ISO dry_run=$DRY_RUN"
echo "RUN_EXIT_CODE=$FINAL_RC reason=${FAIL_REASON:-ok}"
echo "RUN_CHILD_EXITS=${CHILD_EXITS:-none}"
echo "RUN_RESULT_SOURCE=${RESULT_SOURCES:-none} stdout_fallback_enabled=$ALLOW_STDOUT_FALLBACK"
echo "RUN_STDOUT_FALLBACK_SCOPE=measure-extract-only（--allow-stdout-fallback 只作用于逐份提取层；score-only 走投影 out/results/<slug>.model.json，不受该开关影响）"
echo "RUN_SHAPE_VALID=$SHAPE_VALID CHECKER_ID=$CHECKER_ID_FINAL COVERAGE=${COVERAGE_FINAL:-none} MODE=$MODE REBUILDS=$REBUILDS"
echo "RUN_MEASURE_CANONICAL=$MEASURE_CANONICAL"
echo "RUN_MEASURABLE=${MEASURABLE_FINAL:-na} RUN_UNMEASURABLE=${UNMEASURABLE_FINAL:-na} RUN_STRICT=$STRICT"
echo "RUN_ELAPSED_SEC=$RUN_ELAPSED"
echo "RUN_WORKDIR=$WORKDIR"
echo "RUN_EXIT=$FINAL_RC"
exit "$FINAL_RC"