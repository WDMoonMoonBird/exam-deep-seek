#!/usr/bin/env bash
# scripts/dsh-verify/r0c3-hostnoise.sh —— R0-C3 端到端：子进程窗口内「宿主会话文件」被写（真 home 指向沙箱）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT=/tmp/r0c3/hostnoise; rm -rf "$OUT"; mkdir -p "$OUT"
SANDBOX="$OUT/sandbox"; mkdir -p "$SANDBOX/.dsh/storages/session_projcache/sessions" "$SANDBOX/.dsh/memories/daily"
printf 'baseline\n' > "$SANDBOX/.dsh/memories/daily/2026-10-11.md"
STUB="$HERE/stub-dsh.sh"; G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"

one() { # one <case> <mode> <want_rc>
  local name="$1" mode="$2" want_rc="$3"
  local wd="$OUT/wd-$name"
  HOME="$SANDBOX" STUB_MODE="$mode" bash "$G" --submissions 1 --workdir "$wd" --timeout 60 --dsh-bin "$STUB" \
    > "$OUT/$name.out" 2>&1
  local rc=$?
  local iso verdict
  iso="$(grep -oE 'isolation=[A-Z]+' "$OUT/$name.out" | tail -1 | cut -d= -f2)"
  verdict="$(grep -E '^verdict=|^changed_child_write=|^changed_unattributed=|^changed_other=|^changed_host=' "$wd/out/isolation-report.txt" 2>/dev/null | tr '\n' ' ')"
  local ok=FAIL; [ "$rc" = "$want_rc" ] && ok=PASS
  printf '%s case=%-16s rc=%s (期望 %s) iso=%s\n      %s\n' "$ok" "$name" "$rc" "$want_rc" "${iso:-none}" "$verdict"
}
echo "=== 端到端：stub 运行窗口内写宿主会话文件（child-session 为空）==="
one host-session-noise leak_host_session 0
one clean-control      ok               0
echo "--- 沙箱真 home 内容 ---"
find "$SANDBOX/.dsh" -type f | sed "s|$SANDBOX/.dsh/||" | head -5