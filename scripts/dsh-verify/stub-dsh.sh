#!/usr/bin/env bash
# scripts/dsh-verify/stub-dsh.sh —— C 的故障注入假 dsh CLI（只服务 run.sh 的反例测试，不联网、不调模型）
# STUB_MODE: ok | stdout_only | nofile | leak_profile | leak_cache | nonzero_noout | nonzero_without | malformed
# 说明：只实现 run.sh 会调用的三个交互点：--version / --dump-config / <prompt> 批改会话。
# leak_* 模式是 C 用来构造「未隔离写入」的注入器：它写的是 ${HOME}/.dsh，因此调用方必须先把 HOME 指向沙箱。
set -uo pipefail
MODE="${STUB_MODE:-ok}"
CAND="$(printf '%s' "$*" | grep -oE '/[^ ]*/out/grading-result\.json' | head -1)"
REAL_HOME="${HOME:-/nonexistent}/.dsh"

emit_profile() {
  cat <<'YML'
# patched by @deepseek-ai/dsh-headless (stub marker for check_profile.py)
- id: dsh-headless-bundle
  disabled: false
- id: tool-bash
  disabled: true
- id: tool-jobs
  disabled: true
- id: ptc-runtime
  disabled: true
- id: workflow-ptc
  disabled: true
- id: tool-fs
  disabled: false
- id: tool-fs-search
  disabled: false
- id: shell-env
  disabled: false
- id: subagent
  disabled: false
YML
}

case "$*" in
  *--version*) echo "0.2.0-rc.2-stub"; exit 0 ;;
  *--dump-config*) emit_profile; exit 0 ;;
esac

valid_json() {
  cat <<'J'
{"schema_version":1,"submission_id":"stub","items":[{"id":"1","title":"t","max_score":10,"score":10,"reason":"r"},
{"id":"2","title":"t","max_score":10,"score":10,"reason":"r"},{"id":"3","title":"t","max_score":10,"score":10,"reason":"r"},
{"id":"4","title":"t","max_score":10,"score":10,"reason":"r"},{"id":"5","title":"t","max_score":10,"score":10,"reason":"r"},
{"id":"6","title":"t","max_score":10,"score":10,"reason":"r"},{"id":"7","title":"t","max_score":10,"score":10,"reason":"r"},
{"id":"8","title":"t","max_score":10,"score":10,"reason":"r"},{"id":"9","title":"t","max_score":10,"score":10,"reason":"r"}],
"total_score":90,"max_score":100,"verdict":"stub","evidence":[],"uncertain":[]}
J
}

write_candidate() {
  [ -n "$CAND" ] || return 0
  mkdir -p "$(dirname "$CAND")"
  valid_json > "$CAND"
}

echo "STUB_MODEL_TURN mode=$MODE cand=$CAND"
[ -n "${STUB_SLEEP:-}" ] && sleep "$STUB_SLEEP"
case "$MODE" in
  ok)
    write_candidate; valid_json; echo "GRADING_DONE=stub"; exit 0 ;;
  stdout_only)
    valid_json; echo "GRADING_DONE=stub"; exit 0 ;;
  nofile)
    echo "STUB: model replied without producing any artifact"; echo "GRADING_DONE=stub"; exit 0 ;;
  leak_profile)
    mkdir -p "$REAL_HOME/profiles/headless"
    printf 'leaked by child process\n' > "$REAL_HOME/profiles/headless/cordis.yml"
    write_candidate; valid_json; echo "GRADING_DONE=stub-leak"; exit 0 ;;
  leak_cache)
    mkdir -p "$REAL_HOME/cache"
    printf 'child wrote %s/sessions/leak\n' "${DSH_HOME:-unknown}" > "$REAL_HOME/cache/leaked.txt"
    write_candidate; valid_json; echo "GRADING_DONE=stub-leak"; exit 0 ;;
  nonzero_noout)
    echo "STUB: session died before writing artifact" >&2; exit 3 ;;
  nonzero_without)
    write_candidate; echo "STUB: crashed after writing candidate" >&2; exit 3 ;;
  malformed)
    if [ -n "$CAND" ]; then mkdir -p "$(dirname "$CAND")"; printf '{"items": [not-json' > "$CAND"; fi
    echo "GRADING_DONE=stub-but-broken"; exit 0 ;;
  *) echo "STUB: unknown mode $MODE" >&2; exit 9 ;;
esac
