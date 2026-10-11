#!/usr/bin/env bash
# scripts/dsh-verify/t6-probe-watch.sh —— 跑契约命令 probe.sh，同时由 C 自己的 watch.py 独立采端口/进程树
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT="${V_EV}/t6"; rm -rf "$OUT"; mkdir -p "$OUT"
snap_ports "$OUT/ports-before.txt"; snap_home "$OUT/home-before.txt"
bash "$DSH_REPO_ROOT/scripts/dsh-grader/probe.sh" --workdir "$OUT/probe-wd" --timeout 300 > "$OUT/probe.out" 2>&1 &
P=$!
sleep 4
python3 "$HERE/watch.py" "$REAL_HOME_DIR" "$P" "$OUT/watch.jsonl" "$OUT/stop" &
W=$!
wait "$P"; RC=$?
touch "$OUT/stop"; wait "$W" 2>/dev/null
snap_ports "$OUT/ports-after.txt"; snap_home "$OUT/home-after.txt"
diff_paths "$OUT/home-before.txt" "$OUT/home-after.txt" > "$OUT/home-diff.txt"
{
  echo "probe_rc=$RC"
  echo "new_listeners=$(comm -13 "$OUT/ports-before.txt" "$OUT/ports-after.txt" | wc -l | tr -d ' ')"
  echo "watch_events=$(grep -cE 'new_listeners|child_touch_real_home' "$OUT/watch.jsonl" || true)"
  echo "watch_new_home_files=$(grep -cE 'new_home_files' "$OUT/watch.jsonl" || true)"
  echo "changed_lines=$(grep -c . "$OUT/home-diff.txt" || true)"
  echo "orphan=$(orphan_count)"
} > "$OUT/summary.txt"
echo "T6_DONE rc=$RC"; cat "$OUT/summary.txt"; grep -E '^PASS|^FAIL|^PROBE_RESULT' "$OUT/probe.out" | head -12
