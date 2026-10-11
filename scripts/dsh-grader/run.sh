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
  release_workdir_lock
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

if [ "$DRY_RUN" -eq 1 ]; then
  log "--- dry-run：跳过模型会话 ---"
else
  log "--- 4/6 逐份批改（--timeout $TIMEOUT_SEC 秒/份）---"
  while IFS='|' read -r SLUG SUB_ID PROJECT_ROOT ZIP_NAME; do
    [ -n "$SLUG" ] || continue
    SUB_FAILED=0
    PROJ_ABS="$WORKDIR/$PROJECT_ROOT"
    [ -d "$PROJ_ABS" ] || die "学生提交目录不存在：$PROJ_ABS"
    CANDIDATE="$OUT/grading-result.json"
    ARTIFACT="$LOG_DIR/model-artifact-$SLUG.json"
    rm -f "$CANDIDATE"

    cat > "$LOG_DIR/prompt-$SLUG.txt" <<EOF
你是一名严格但公正的课程助教，负责给一份 Vue 3 前端作业打分。物料已按只读方式准备好：

- 题目描述：$WORKDIR/materials/assignment.md
- 评分标准（满分 100，共 9 项）：$WORKDIR/materials/rubric.md
- 标准工程包（起始模板，仅作对照）：$WORKDIR/materials/standard/UserManagement
- 学生提交（本次待评分，学生标识 ${SUB_ID}）：$PROJ_ABS

硬约束（违反则本次结果作废）：
1) materials/ 是只读物料：不要修改其中任何文件。
2) 本环境没有执行类工具：不要尝试运行代码、不要 npm install、不要构建。
3) 只允许写一个文件：$CANDIDATE （用你的文件写入工具）。

评分步骤：
a. 先读 $WORKDIR/materials/rubric.md，确认 9 项标准与各自分值。
b. 读学生提交中的关键文件：package.json、vite.config.js、index.html、src/main.js、src/App.vue、src/router 目录、src/stores 目录、src/views 目录、src/components 目录（最多读 30 个文件；src/assets 下的第三方库文件跳过）。
c. 对照题目描述里的验收点逐项打分；每项的 reason 必须带 文件:行号 证据（例如 src/views/Login.vue:42）。
d. 若学生提交缺少某个功能对应的文件，要明确指出缺失并按标准扣分。

最终写入 ${CANDIDATE}，内容必须是严格 JSON（不要 markdown 代码块、不要注释、不要多余文字），schema 如下：
{
  "schema_version": 1,
  "submission_id": "$SUB_ID",
  "items": [ { "id": "1", "title": "项目初始化与可运行", "max_score": 10, "score": 0, "reason": "..." } ],
  "total_score": 0,
  "max_score": 100,
  "verdict": "一句话总评",
  "evidence": [ { "path": "src/views/Login.vue", "line": 42, "quote": "..." } ],
  "uncertain": [ "无法确认的点" ]
}

要求：items 必须正好 9 项、id 依次为 "1" 到 "9"，与 rubric 一一对应；total_score 必须等于 9 项 score 之和；max_score 固定 100。
写完文件后，把同一份 JSON 原样贴进你的最终回复，并在 JSON 之前单独打印一行：GRADING_DONE=$SUB_ID
EOF

    log "批改 ${SUB_ID}（${ZIP_NAME}）→ ${PROJ_ABS}"
    set +e
    RUNNER_OUT="$(python3 "$HERE/run_with_timeout.py" --timeout "$TIMEOUT_SEC" \
      --out "$LOG_DIR/session-$SLUG.out" --err "$LOG_DIR/session-$SLUG.err" --cwd "$WORKDIR" \
      -- "$DSH" --profile "$DSH_PROFILE_NAME" "$(cat "$LOG_DIR/prompt-$SLUG.txt")")"
    SESSION_RC=$?
    set -e
    CHILD_EXIT="$(echo "$RUNNER_OUT" | grep '^RUNNER_CHILD_EXIT=' | cut -d= -f2)"
    ELAPSED="$(echo "$RUNNER_OUT" | grep '^RUNNER_ELAPSED_SEC=' | cut -d= -f2)"
    ORPHAN="$(echo "$RUNNER_OUT" | grep '^RUNNER_ORPHAN=' | cut -d= -f2)"
    log "session 结束：rc=$SESSION_RC child_exit=$CHILD_EXIT elapsed=${ELAPSED}s orphan=$ORPHAN"

    if [ "$SESSION_RC" -eq 124 ] || [ "$CHILD_EXIT" = "timeout" ]; then
      TIMED_OUT=1
      log "TIMEOUT：${SUB_ID} 超过 ${TIMEOUT_SEC}s 未完成，子进程组已被终止（orphan=${ORPHAN}）"
      FINAL_RC=124
      continue
    fi
    CHILD_EXITS="${CHILD_EXITS}${SLUG}:rc=${SESSION_RC}/child_exit=${CHILD_EXIT} "
    if [ "$SESSION_RC" -ne 0 ] || [ "$CHILD_EXIT" != "0" ]; then
      SESSION_FAILED=1
      SUB_FAILED=1
      FAIL_REASON="${FAIL_REASON}session-nonzero-exit(${SLUG}:rc=${SESSION_RC},child_exit=${CHILD_EXIT}) "
      log "SESSION_FAIL：${SUB_ID} 会话退出码 rc=${SESSION_RC} child_exit=${CHILD_EXIT} ≠ 0 ⇒ 不得判 PASS（F-C2）；产物仅供诊断"
      [ "$FINAL_RC" -eq 0 ] && FINAL_RC=1
    fi

    FALLBACK_ARG=""
    if [ "$ALLOW_STDOUT_FALLBACK" -eq 1 ]; then FALLBACK_ARG="--allow-stdout-fallback"; fi
    set +e
    python3 "$HERE/extract_result.py" --stdout "$LOG_DIR/session-$SLUG.out" --candidate "$CANDIDATE" \
      --out "$OUT/results/$SLUG.json" --expect-submission-id "$SUB_ID" --artifact "$ARTIFACT" $FALLBACK_ARG \
      > "$LOG_DIR/extract-$SLUG.txt" 2>&1
    EXTRACT_RC=$?
    set -e
    grep -E 'EXTRACT_|VALIDATE_' "$LOG_DIR/extract-$SLUG.txt" || true
    rm -f "$CANDIDATE"
    SOURCE_KIND="$(grep '^EXTRACT_SOURCE=' "$LOG_DIR/extract-$SLUG.txt" | cut -d= -f2)"
    FALLBACK_KIND="$(grep '^EXTRACT_FALLBACK=' "$LOG_DIR/extract-$SLUG.txt" | cut -d= -f2)"
    RESULT_SOURCES="${RESULT_SOURCES}${SLUG}:${SOURCE_KIND}/${FALLBACK_KIND:-none} "
    if [ "$EXTRACT_RC" -ne 0 ]; then
      log "批改结果校验失败：${SUB_ID}（source=${SOURCE_KIND:-none} fallback=${FALLBACK_KIND:-none}，详见 $LOG_DIR/extract-$SLUG.txt）"
      [ "$FINAL_RC" -eq 0 ] && FINAL_RC=1
      if [ "$SUB_FAILED" -eq 0 ]; then FAIL_REASON="${FAIL_REASON}extract-failed(${SLUG}) "; fi
      continue
    fi
    if [ "$SUB_FAILED" -eq 1 ]; then
      log "EXTRACT_DIAGNOSTIC：${SUB_ID} 产物已提取（source=${SOURCE_KIND} fallback=${FALLBACK_KIND:-none}）但会话退出码非 0 ⇒ 不计入成功（F-C2）"
      continue
    fi
    SUMMARY="$(grep '^EXTRACT_OK=1' "$LOG_DIR/extract-$SLUG.txt" | head -1)"
    GRADED=$((GRADED + 1))
    log "GRADED id=${SUB_ID} slug=${SLUG} rc=${SESSION_RC} elapsed=${ELAPSED}s source=${SOURCE_KIND} fallback=${FALLBACK_KIND:-none} ${SUMMARY}"
  done < <(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1], encoding='utf-8'))
for s in m['submissions']:
    print('|'.join([s['slug'], s['id'], s['project_root'], s['zip']]))
PY
)
fi

log "--- 5/6 隔离旁证 + 凭据清理 ---"
snapshot_dsh_home "$LOG_DIR/dsh-home-after.txt"
snapshot_ports "$LOG_DIR/ports-after.txt"
AFTER_FILES="$(wc -l < "$LOG_DIR/dsh-home-after.txt" | tr -d ' ')"
changed_paths "$LOG_DIR/dsh-home-before.txt" "$LOG_DIR/dsh-home-after.txt" > "$LOG_DIR/dsh-home-changed.txt"
CHILD_SESSION="$(find "$HOME_DIR" -type f 2> /dev/null | grep -oE 'session-[0-9a-f-]{36}' | head -1 | sed 's/^session-//' || true)"
python3 "$HERE/classify_changes.py" --changed "$LOG_DIR/dsh-home-changed.txt" \
  --control "$LOG_DIR/dsh-home-control-changed.txt" --host-session "${DSH_SESSION_ID:-}" \
  --child-session "$CHILD_SESSION" --isolated-home "$HOME_DIR" --workdir "$WORKDIR" \
  --dsh-home "$DSH_HOME_REAL" > "$LOG_DIR/dsh-home-classified.txt" 2> "$LOG_DIR/dsh-home-classified.err" || true
CHILD_CHANGED="$(sed -n '/^__CHILD__$/,/^__UNATTRIBUTED__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
UNATTR_CHANGED="$(sed -n '/^__UNATTRIBUTED__$/,/^__OTHER__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
OTHER_CHANGED="$(sed -n '/^__OTHER__$/,/^__HOST__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
HOST_CHANGED="$(sed -n '/^__HOST__$/,/^__REASONS__$/p' "$LOG_DIR/dsh-home-classified.txt" | grep -v '^__' || true)"
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
  [ "$FINAL_RC" -eq 0 ] && FINAL_RC=1
fi

LEAK_OUT="$(scan_key_leak "$OUT" "$GRADER_HOME/.credentials.yaml" || true)"
LEAK_SRC="$(scan_key_leak "$HERE" || true)"
if [ -z "$LEAK_OUT" ]; then
  log "凭据泄漏扫描：out/ 无明文凭据（精确值比对 + sk- 形态比对）"
else
  log "凭据泄漏扫描：out/ FAIL → $(printf '%s' "$LEAK_OUT" | head -3 | tr ' ' '_')"
  [ "$FINAL_RC" -eq 0 ] && FINAL_RC=1
fi
if [ -z "$LEAK_SRC" ]; then
  log "凭据泄漏扫描：scripts/dsh-grader/ 无 sk- 形态明文"
else
  log "凭据泄漏扫描：scripts/dsh-grader/ FAIL → $(printf '%s' "$LEAK_SRC" | head -3 | tr ' ' '_')"
  [ "$FINAL_RC" -eq 0 ] && FINAL_RC=1
fi
cleanup_credentials "$GRADER_HOME"
if [ -f "$GRADER_HOME/.credentials.yaml" ]; then
  log "凭据清理失败：$GRADER_HOME/.credentials.yaml 仍存在"
  [ "$FINAL_RC" -eq 0 ] && FINAL_RC=1
fi

log "--- 6/6 汇总 ---"
if [ "$SUBMISSIONS" -eq 1 ] && [ "$GRADED" -ge 1 ] && [ -f "$OUT/results/s01.json" ] && [ "$FINAL_RC" -eq 0 ]; then
  cp "$OUT/results/s01.json" "$OUT/grading-result.json"
  log "契约产物：$OUT/grading-result.json（来自 results/s01.json）"
else
  rm -f "$OUT/grading-result.json"
  log "契约产物：未产出（F-C2 门控：要求全部会话 rc=0 且结果校验通过；reason=${FAIL_REASON:-none}）"
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
echo "RUN_ELAPSED_SEC=$RUN_ELAPSED"
echo "RUN_WORKDIR=$WORKDIR"
echo "RUN_EXIT=$FINAL_RC"
exit "$FINAL_RC"
