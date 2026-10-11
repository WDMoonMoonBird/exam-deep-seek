#!/usr/bin/env bash
# scripts/dsh-verify/r0c3-positives.sh —— R0-C3 ★反向不退化：F-C1 阳性对照三例（装置自带 SIMULATE_LEAK，沙箱真 home）
# 判据：三例都必须 isolation=FAIL / rc=1；阴性对照（干净 dry-run）必须 PASS / rc=0。
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT=/tmp/r0c3/positives; rm -rf "$OUT"; mkdir -p "$OUT"
SANDBOX="$OUT/sandbox"; mkdir -p "$SANDBOX/.dsh"
G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"

one() { # one <mode-or-NONE> <want_rc> <want_verdict>
  local mode="$1" want_rc="$2" want_verdict="$3"
  local name="${mode:-clean}"; local wd="$OUT/wd-$name"
  if [ "$mode" = NONE ]; then
    HOME="$SANDBOX" bash "$G" --submissions 1 --workdir "$wd" --dry-run --timeout 60 \
      --dsh-bin "$P" > "$OUT/$name.out" 2>&1
  else
    HOME="$SANDBOX" DSH_GRADER_SIMULATE_LEAK="$mode" bash "$G" --submissions 1 --workdir "$wd" --dry-run --timeout 60 \
      --dsh-bin "$P" > "$OUT/$name.out" 2>&1
  fi
  local rc=$?
  local v; v="$(grep -E '^verdict=' "$wd/out/isolation-report.txt" 2>/dev/null | cut -d= -f2)"
  local st; st="$(grep -E '^changed_child_write=|^changed_unattributed=|^changed_other=' "$wd/out/isolation-report.txt" 2>/dev/null | tr '\n' ' ')"
  local rule; rule="$(grep -E '^RULE ' "$wd/out/logs/dsh-home-classified.txt" 2>/dev/null | head -1 | cut -c1-96)"
  local ok=FAIL
  [ "$rc" = "$want_rc" ] && [ "$v" = "$want_verdict" ] && ok=PASS
  printf '%s SIMULATE_LEAK=%-20s rc=%s (期望 %s) verdict=%s (期望 %s)\n      %s\n      %s\n' \
    "$ok" "${mode}" "$rc" "$want_rc" "${v:-none}" "$want_verdict" "$st" "$rule"
}
R="$HERE/stub-dsh.sh"; P="$HERE/stub-dsh.sh"
echo "=== ★F-C1 阳性对照三例（必须 FAIL）+ 阴性对照 ==="
one profile-dir        1 FAIL
one workdir-slug       1 FAIL
one content-fingerprint 1 FAIL
one NONE               0 PASS
echo "=== 我自己的注入器（C 的 leak_profile / leak_cache，必须 FAIL）==="