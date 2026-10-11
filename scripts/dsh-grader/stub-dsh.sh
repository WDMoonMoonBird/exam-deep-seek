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
  ok)
    if [ -n "$CAND" ]; then mkdir -p "$(dirname "$CAND")"; valid_json > "$CAND"; fi
    valid_json
    echo "GRADING_DONE=stub"; exit 0 ;;
  stdout_only)
    valid_json; echo "GRADING_DONE=stub"; exit 0 ;;
  nofile)
    echo "STUB: 只回了文本，没有写文件"; echo "GRADING_DONE=stub"; exit 0 ;;
  nonzero_with_artifact)
    if [ -n "$CAND" ]; then mkdir -p "$(dirname "$CAND")"; valid_json > "$CAND"; fi
    echo "STUB: 写完产物后会话崩溃" >&2; exit 3 ;;
  nonzero_noout)
    echo "STUB: 崩溃且无产物" >&2; exit 3 ;;
  *) echo "STUB: 未知模式 $MODE" >&2; exit 9 ;;
esac
