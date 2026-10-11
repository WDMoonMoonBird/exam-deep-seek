#!/usr/bin/env bash
# scripts/dsh-verify/c2-contract-run.sh —— 跑契约命令 run.sh（真实模型 1 次）+ 同期自建隔离/物料旁证
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT=/tmp/dsh-verify2/run; rm -rf "$OUT"; mkdir -p "$OUT"
WD=/tmp/dsh-r0-verify2
SRC="$DSH_REPO_ROOT/实验"

hash_tree() {
  python3 - "$1" > "$2" <<'PY'
import hashlib, os, sys
root = sys.argv[1]
rows = []
for dp, dns, fns in os.walk(root):
    if 'node_modules' in dns:
        dns.remove('node_modules')
    for fn in sorted(fns):
        p = os.path.join(dp, fn)
        h = hashlib.sha256()
        try:
            with open(p, 'rb') as f:
                for chunk in iter(lambda: f.read(1 << 20), b''):
                    h.update(chunk)
        except OSError:
            continue
        rows.append('%s  %s' % (h.hexdigest(), os.path.relpath(p, root)))
print('FILES=%d' % len(rows))
for r in sorted(rows, key=lambda s: s.split('  ', 1)[1]):
    print(r)
PY
}

hash_tree "$SRC" "$OUT/source-before.txt"
snap_home "$OUT/home-before.txt"; snap_ports "$OUT/ports-before.txt"
ps -o pid=,lstart= -p 830 -p 890 > "$OUT/host-before.txt" 2>/dev/null

bash "$DSH_REPO_ROOT/scripts/dsh-grader/run.sh" --submissions 1 --workdir "$WD" --timeout 900 > "$OUT/run.out" 2>&1 &
RUNP=$!
sleep 6
python3 "$HERE/watch.py" "$REAL_HOME_DIR" "$RUNP" "$OUT/watch.jsonl" "$OUT/stop" &
WATCH=$!
wait "$RUNP"; RUN_RC=$?
touch "$OUT/stop"; wait "$WATCH" 2>/dev/null

snap_home "$OUT/home-after.txt"; snap_ports "$OUT/ports-after.txt"
hash_tree "$SRC" "$OUT/source-after.txt"
diff_paths "$OUT/home-before.txt" "$OUT/home-after.txt" > "$OUT/home-diff.txt"
{
  echo "run_rc=${RUN_RC}"
  echo "source_materials_unchanged=$(diff -q "$OUT/source-before.txt" "$OUT/source-after.txt" > /dev/null && echo yes || echo NO)"
  echo "new_listeners=$(comm -13 "$OUT/ports-before.txt" "$OUT/ports-after.txt" | wc -l | tr -d ' ')"
  echo "watch_child_touch_real_home=$(grep -c child_touch_real_home "$OUT/watch.jsonl" || true) watch_new_listeners=$(grep -c new_listeners "$OUT/watch.jsonl" || true) samples=$(grep -c tree_size "$OUT/watch.jsonl" || true)"
  echo "orphan=$(orphan_count)"
  echo "host_alive_830=$(kill -0 830 2>/dev/null && echo yes || echo no) host_alive_890=$(kill -0 890 2>/dev/null && echo yes || echo no)"
  echo "port_19387=$(lsof -nP -iTCP:19387 -sTCP:LISTEN 2>/dev/null | wc -l | tr -d ' ')"
  echo "cred_leftover=$([ -f "$WD/home/.credentials.yaml" ] && echo yes || echo no)"
  echo "isolated_home_files=$(find "$WD/home" -type f | wc -l | tr -d ' ')"
  echo "grading_result=$([ -f "$WD/out/grading-result.json" ] && echo yes || echo no)"
  grep -E '^(verdict|verdict_reasons|changed_child_write|changed_unattributed|changed_other|changed_host|changed_total|new_listeners)=' "$WD/out/isolation-report.txt" 2>/dev/null | sed 's/^/iso_/'
  grep -E 'RUN_RESULT=|RUN_EXIT_CODE=|RUN_CHILD_EXITS=|RUN_RESULT_SOURCE=' "$OUT/run.out" | sed 's/^/summary_/'
} > "$OUT/summary.txt"

python3 - "$WD/materials" > "$OUT/materials.txt" <<'PY'
import os, stat, sys
root = sys.argv[1]
d = f = wd = wf = 0
for dp, dns, fns in os.walk(root):
    d += 1
    if os.stat(dp).st_mode & stat.S_IWUSR:
        wd += 1
    for fn in fns:
        f += 1
        if os.stat(os.path.join(dp, fn)).st_mode & stat.S_IWUSR:
            wf += 1
print('materials dirs=%d writable_dirs=%d files=%d writable_files=%d' % (d, wd, f, wf))
PY
grep -E 'GRADED|契约产物' "$WD/out/run.log" | tail -2 >> "$OUT/summary.txt"
cat "$OUT/materials.txt" >> "$OUT/summary.txt"
echo "C2_RUN_DONE rc=${RUN_RC}"
cat "$OUT/summary.txt"
