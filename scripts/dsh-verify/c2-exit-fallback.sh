#!/usr/bin/env bash
# scripts/dsh-verify/c2-exit-fallback.sh —— F-C2（非 0 退出不得 PASS）/ F-C5（禁止静默 stdout 回退）+ 边界回归
# 全部走 stub，无模型调用；HOME 指向沙箱，避免宿主噪声干扰这些断言。
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT=/tmp/dsh-verify2/ef; rm -rf "$OUT"; mkdir -p "$OUT"
SANDBOX="$OUT/sandbox"; mkdir -p "$SANDBOX/.dsh"
STUB="$HERE/stub-dsh.sh"; G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"

case_run() { # case_run <name> <mode> <timeout> <extra-args...>
  local name="$1" mode="$2" tmo="$3"; shift 3
  local wd="$OUT/wd-$name"
  HOME="$SANDBOX" STUB_MODE="$mode" bash "$G" --submissions 1 --workdir "$wd" --timeout "$tmo" --dsh-bin "$STUB" "$@" > "$OUT/$name.out" 2>&1
  local rc=$?
  printf 'CASE %-18s rc=%-4s artifact=%-3s results/=%s  %s\n' "$name" "$rc" \
    "$([ -f "$wd/out/grading-result.json" ] && echo yes || echo no)" \
    "$([ -f "$wd/out/results/s01.json" ] && echo yes || echo no)" \
    "$(grep -oE 'RUN_RESULT=[A-Z_]+' "$OUT/$name.out" | tail -1)"
  grep -oE 'EXTRACT_FALLBACK=[a-z]+' "$wd/out/logs/extract-s01.txt" 2>/dev/null | head -1 | sed 's/^/      /'
  grep -oE 'RUN_RESULT_SOURCE=[^ ]+' "$OUT/$name.out" | tail -1 | sed 's/^/      /'
  grep -oE 'stdout_fallback_enabled=[01]' "$OUT/$name.out" | tail -1 | sed 's/^/      /'
}

echo "=== F-C2：非 0 退出但有合法产物（旧行为=PASS，应已改为 FAIL）==="
case_run nonzero-without nonzero_without 60
grep -oE 'SESSION_FAIL[^（]*' "$OUT/wd-nonzero-without/out/run.log" | head -1 | sed 's/^/      /'
echo "=== F-C5：只打印不写文件（默认必须拒绝）==="
case_run stdout-only-default stdout_only 60
echo "=== F-C5：显式开开关后才允许回退（且摘要可见）==="
case_run stdout-only-allowed stdout_only 60 --allow-stdout-fallback
echo "=== 控制组与其余边界 ==="
case_run control-ok ok 60
case_run malformed malformed 60
case_run nofile nofile 60
echo "=== 超时（stub sleep 99 + --timeout 15，零模型调用）==="
STUB_MODE=ok STUB_SLEEP=99 HOME="$SANDBOX" bash "$G" --submissions 1 --workdir "$OUT/wd-timeout" --timeout 15 --dsh-bin "$STUB" > "$OUT/timeout.out" 2>&1
echo "CASE timeout rc=$? $(grep -oE 'TIMEOUT[^（]*' "$OUT/timeout.out" | head -1) orphan=$(orphan_count)"
echo "=== 凭据缺失（HOME 空 + PATH 无 mysql）==="
mkdir -p "$OUT/fakehome"
env -u DEEPSEEK_API_KEY HOME="$OUT/fakehome" PATH="/usr/bin:/bin:/usr/sbin:/sbin" bash "$G" --submissions 1 --workdir "$OUT/wd-nocred" --timeout 60 --dsh-bin "$DSH_BIN" > "$OUT/nocred.out" 2>&1
echo "CASE no-credentials rc=$? $(grep -m1 FATAL "$OUT/nocred.out" | cut -c1-70) leftover_cred=$([ -f "$OUT/wd-nocred/home/.credentials.yaml" ] && echo yes || echo no)"
echo "EF_DONE"
