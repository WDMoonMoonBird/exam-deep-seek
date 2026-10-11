#!/usr/bin/env bash
# scripts/dsh-verify/t4-boundary.sh —— 四种边界情形实测（只读日志 + 退出码 + 孤儿 + 残留凭据）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT="${V_EV}/t4"; rm -rf "$OUT"; mkdir -p "$OUT"
STUB="$HERE/stub-dsh.sh"
GRADER="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"
DSH_REAL="$DSH_BIN"

case_report() { # case_report <tag> <workdir> <rc>
  local tag="$1" wd="$2" rc="$3"
  {
    printf 'CASE=%s rc=%s\n' "$tag" "$rc"
    printf '  grading-result.json=%s\n' "$([ -f "$wd/out/grading-result.json" ] && echo yes || echo no)"
    printf '  cred_leftover=%s\n' "$([ -f "$wd/home/.credentials.yaml" ] && echo yes || echo no)"
    printf '  orphan=%s\n' "$(orphan_count)"
    printf '  log_tail=%s\n' "$(grep -E 'RUN_RESULT|RUN_EXIT|FATAL|TIMEOUT|校验失败|EXTRACT_OK|EXTRACT_SOURCE' "$wd/out/run.log" 2>/dev/null | tail -3 | tr '\n' '|')"
  } >> "$OUT/boundary-summary.txt"
  tail -5 "$OUT/boundary-summary.txt"
}

echo "=== 0) 控制组：stub ok（证明装置本身能通过） ==="
bash "$GRADER" --submissions 1 --workdir "$OUT/wd-ok" --timeout 120 --dsh-bin "$STUB" > "$OUT/ok.out" 2>&1
case_report stub-ok "$OUT/wd-ok" "$?"

echo "=== 1) 产物畸形：stub malformed（写坏 JSON） ==="
STUB_MODE=malformed bash "$GRADER" --submissions 1 --workdir "$OUT/wd-malformed" --timeout 120 --dsh-bin "$STUB" > "$OUT/malformed.out" 2>&1
case_report stub-malformed "$OUT/wd-malformed" "$?"

echo "=== 2a) 退出码非 0 且无产物：stub nonzero_noout ==="
STUB_MODE=nonzero_noout bash "$GRADER" --submissions 1 --workdir "$OUT/wd-nz1" --timeout 120 --dsh-bin "$STUB" > "$OUT/nz1.out" 2>&1
case_report stub-nonzero-noout "$OUT/wd-nz1" "$?"

echo "=== 2b) 退出码非 0 但有合法产物：stub nonzero_without ==="
STUB_MODE=nonzero_without bash "$GRADER" --submissions 1 --workdir "$OUT/wd-nz2" --timeout 120 --dsh-bin "$STUB" > "$OUT/nz2.out" 2>&1
case_report stub-nonzero-without "$OUT/wd-nz2" "$?"

echo "=== 3) 凭据缺失：HOME 指向空目录 + PATH 去掉 mysql ==="
mkdir -p "$OUT/fakehome"
env -u DEEPSEEK_API_KEY HOME="$OUT/fakehome" PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  bash "$GRADER" --submissions 1 --workdir "$OUT/wd-nocred" --timeout 60 --dsh-bin "$DSH_REAL" > "$OUT/nocred.out" 2>&1
case_report no-credentials "$OUT/wd-nocred" "$?"
echo "nocred_stderr_head=$(head -2 "$OUT/nocred.out" | tr '\n' '|')"

echo "=== 4) 超时：真实 CLI + --timeout 15（消耗 1 次被中断的模型调用） ==="
( V_PIDFILE="" ; true )
bash "$GRADER" --submissions 1 --workdir "$OUT/wd-timeout" --timeout 15 --dsh-bin "$DSH_REAL" > "$OUT/timeout.out" 2>&1
case_report timeout-15s "$OUT/wd-timeout" "$?"
echo "timeout_tail=$(grep -E 'TIMEOUT|RUN_RESULT|RUN_EXIT' "$OUT/timeout.out" | tail -3 | tr '\n' '|')"
echo "T4_DONE"
