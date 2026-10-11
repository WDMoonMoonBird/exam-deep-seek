#!/usr/bin/env bash
# scripts/dsh-grader/stub-dsh.sh —— 自测专用【假 dsh CLI】：不联网、不调模型、不读真实 home。
# 只实现 run.sh / probe.sh 会调用的三个交互点：--version / --dump-config / <prompt> 会话。
# STUB_MODE: ok | nofile | stdout_only | nonzero_with_artifact | nonzero_noout
# 环境: STUB_SLEEP=秒（模拟慢会话，用于并发锁自测）、STUB_CALL_LOG=文件（调用留痕）
set -uo pipefail

if [ -n "${STUB_CALL_LOG:-}" ]; then
  printf 'CALL mode=${STUB_MODE:-ok} args_head=%.120s
' "$*" >> "$STUB_CALL_LOG"
fi
MODE="${STUB_MODE:-ok}"
CAND="$(printf '%s' "$*" | grep -oE '/[^ ]*/out/grading-result\.json' | head -1)"

MODEL_CAND="$(printf '%s' "$*" | grep -oE '/[^ ]*/out/results/[^ ]*\.model\.json' | head -1)"
WD="$(printf '%s' "$*" | grep -oE '/[^ ]*/out/checker/checker\.json' | head -1 | sed 's|/out/checker/checker.json||')"
SLUG="$(printf '%s' "$MODEL_CAND" | sed -n 's|.*/out/results/\(\.*\)\.model\.json|\1|p')"
[ -n "$SLUG" ] || SLUG=s01

emit_profile() {
  cat <<'YML'
# == @deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-headless
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: true
- id: tool-jobs
  name: '@deepseek-ai/dsh-tool-jobs'
  disabled: true
- id: ptc-runtime
  name: '@deepseek-ai/dsh-ptc-runtime-node'
  disabled: true
- id: workflow-ptc
  name: '@deepseek-ai/dsh-workflow-ptc'
  disabled: true
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
- id: tool-fs-search
  name: '@deepseek-ai/dsh-tool-fs-search'
- id: shell-env
  name: '@deepseek-ai/dsh-shell-env'
- id: subagent
  name: '@deepseek-ai/dsh-subagent'
YML
}

valid_json() {
  cat <<'J'
{"schema_version":1,"submission_id":"stub","items":[
{"id":"1","title":"项一","max_score":10,"score":9,"reason":"stub：src/main.js:1 证据"},
{"id":"2","title":"项二","max_score":10,"score":9,"reason":"stub：src/router/index.js:1 证据"},
{"id":"3","title":"项三","max_score":20,"score":18,"reason":"stub：src/views/Login.vue:1 证据"},
{"id":"4","title":"项四","max_score":20,"score":18,"reason":"stub：src/views/Register.vue:1 证据"},
{"id":"5","title":"项五","max_score":10,"score":9,"reason":"stub：src/stores/user.js:1 证据"},
{"id":"6","title":"项六","max_score":15,"score":13,"reason":"stub：src/views/User.vue:1 证据"},
{"id":"7","title":"项七","max_score":5,"score":4,"reason":"stub：src/views/User.vue:2 证据"},
{"id":"8","title":"项八","max_score":10,"score":9,"reason":"stub：src/components/UserList.vue:1 证据"},
{"id":"9","title":"项九","max_score":10,"score":8,"reason":"stub：package.json:1 证据"}],
"total_score":97,"max_score":100,"verdict":"stub 结果（自测用，不代表真实评分）","evidence":[],"uncertain":[]}
J
}

case "$*" in
  *--version*) echo "0.2.0-rc.2-stub"; exit 0 ;;
  *--dump-config*) emit_profile; exit 0 ;;
esac

if [ -n "${STUB_SLEEP:-}" ]; then sleep "$STUB_SLEEP"; fi
echo "STUB_MODEL_TURN mode=$MODE cand=$CAND"
case "$MODE" in
  ok|field-max|t1|dangling|bad-id|exec|half|half-c8|unmeasurable|partial-unmeasurable)
    if [ -n "$WD" ]; then
      python3 "$(dirname "$0")/stub_build.py" --workdir "$WD" --slug "$SLUG" --mode "$MODE" \
        --counter "${STUB_COUNTER:-}" > /dev/null 2>&1 || true
    fi
    # 忠于真实 CLI：在隔离 home 里留下自己的会话日志（供 run.sh 取 child_session 做 R4 归因）
    if [ -n "${DSH_HOME:-}" ]; then
      SESS_DIR="${DSH_HOME}/sessions/--stub-${SLUG}--/session-11111111-2222-3333-4444-555555555555"
      mkdir -p "$SESS_DIR" 2> /dev/null || true
      printf 'stub session journal' > "$SESS_DIR/session.v4.jsonl.zstd" 2> /dev/null || true
      mkdir -p "${DSH_HOME}/storages/session_projcache/sessions" 2> /dev/null || true
      printf '{}' > "${DSH_HOME}/storages/session_projcache/sessions/session-11111111-2222-3333-4444-555555555555.json" 2> /dev/null || true
    fi
    echo "GRADING_DONE=$SLUG"
    exit 0 ;;
  ok)
    if [ -n "$CAND" ]; then mkdir -p "$(dirname "$CAND")"; valid_json > "$CAND"; fi
    valid_json
    echo "GRADING_DONE=stub"; exit 0 ;;
  stdout_only)
    valid_json; echo "GRADING_DONE=stub"; exit 0 ;;
  nofile)
    echo "STUB: 只回了文本，没有写文件"; echo "GRADING_DONE=stub"; exit 0 ;;
  nonzero_with_artifact)
    if [ -n "$MODEL_CAND" ]; then mkdir -p "$(dirname "$MODEL_CAND")"; valid_json > "$MODEL_CAND"; fi
    if [ -n "$CAND" ]; then mkdir -p "$(dirname "$CAND")"; valid_json > "$CAND"; fi
    echo "STUB: 写完产物后会话崩溃" >&2; exit 3 ;;
  nonzero_noout)
    echo "STUB: 崩溃且无产物" >&2; exit 3 ;;
  *) echo "STUB: 未知模式 $MODE" >&2; exit 9 ;;
esac
