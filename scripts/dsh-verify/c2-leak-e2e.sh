#!/usr/bin/env bash
# scripts/dsh-verify/c2-leak-e2e.sh —— F-C1 端到端独立反例：C 自己让「子进程」写出未隔离文件，
# 看整个 run.sh 是否判 isolation=FAIL。整个用例把 HOME 指向沙箱，绝不写用户真实 ~/.dsh。
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT=/tmp/dsh-verify2/e2e; rm -rf "$OUT"; mkdir -p "$OUT"
SANDBOX="$OUT/sandbox"; mkdir -p "$SANDBOX/.dsh/memories/daily" "$SANDBOX/.dsh/sessions"
printf 'host memories before run\n' > "$SANDBOX/.dsh/memories/daily/2026-10-11.md"
STUB="$HERE/stub-dsh.sh"; G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"

one() { # one <case> <stub-mode> <expect-iso> <expect-rc>
  local case_name="$1" mode="$2" want_iso="$3" want_rc="$4"
  local wd="$OUT/wd-$case_name"
  HOME="$SANDBOX" STUB_MODE="$mode" bash "$G" --submissions 1 --workdir "$wd" --timeout 60 \
    --dsh-bin "$STUB" > "$OUT/$case_name.out" 2>&1
  local rc=$?
  local iso result
  iso="$(grep -oE 'isolation=[A-Z]+' "$OUT/$case_name.out" | tail -1 | cut -d= -f2)"
  result="$(grep -oE 'RUN_RESULT=[A-Z_]+' "$OUT/$case_name.out" | tail -1)"
  local iso_txt
  iso_txt="$(grep -E '^verdict=|^verdict_reasons=|^changed_child_write=|^changed_unattributed=|^changed_other=' "$wd/out/isolation-report.txt" 2>/dev/null | tr '\n' ' ')"
  local verdict=PASS
  [ "$iso" = "$want_iso" ] || verdict=FAIL
  [ "$rc" = "$want_rc" ] || verdict=FAIL
  printf '%s case=%s rc=%s iso=%s want_iso=%s want_rc=%s %s\n' \
    "$verdict" "$case_name" "$rc" "${iso:-none}" "$want_iso" "$want_rc" "$result"
  printf '      isolation-report: %s\n' "$iso_txt"
}

echo "== F-C1 e2e: C 自己注入的子进程泄漏（真 home 指向沙箱） =="
one clean-ok ok PASS 0
one leak-profile leak_profile FAIL 1
one leak-cache-content leak_cache FAIL 1
echo "--- RULE（leak-profile）---"
grep -E '^RULE ' "$OUT/wd-leak-profile/out/logs/dsh-home-classified.txt" 2>/dev/null | head -3
echo "--- RULE（leak-cache-content）---"
grep -E '^RULE ' "$OUT/wd-leak-cache-content/out/logs/dsh-home-classified.txt" 2>/dev/null | head -3
echo "--- 沙箱真 home 的最终内容（注入产物应在这里）---"
find "$SANDBOX/.dsh" -type f | sed "s|\$SANDBOX/.dsh/||" | head -6
echo "--- 用户真实 ~/.dsh/profiles/headless 仍不存在？ ---"
echo "user_headless_dir=$([ -d "$HOME/.dsh/profiles/headless" ] && echo PRESENT || echo absent)"
