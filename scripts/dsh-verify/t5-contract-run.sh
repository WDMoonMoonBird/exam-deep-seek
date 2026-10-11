#!/usr/bin/env bash
# scripts/dsh-verify/t5-contract-run.sh —— 跑契约命令 run.sh --submissions 1（真实模型）+ 同期隔离/物料实测
# 产物：$V_EV/t5/{run.out,watch.jsonl,summary.txt,materials-before.txt,materials-after.txt,...}
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT="${V_EV}/t5"; rm -rf "$OUT"; mkdir -p "$OUT"
WD=/tmp/dsh-r0-verify
SRC="$DSH_REPO_ROOT/实验"

hash_tree() { python3 - "$1" > "$2" <<'PY'
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

hash_tree "$SRC" "$OUT/source-materials-before.txt"
snap_home "$OUT/home-before.txt"; snap_ports "$OUT/ports-before.txt"
ps -o pid=,lstart= -p 830 -p 890 > "$OUT/host-before.txt" 2>/dev/null

bash "$DSH_REPO_ROOT/scripts/dsh-grader/run.sh" --submissions 1 --workdir "$WD" --timeout 900 > "$OUT/run.out" 2>&1 &
RUNP=$!
sleep 6
rm -f "$OUT/stop"
python3 "$HERE/watch.py" "$REAL_HOME_DIR" "$RUNP" "$OUT/watch.jsonl" "$OUT/stop" &
WATCH=$!
wait "$RUNP"; RUN_RC=$?
touch "$OUT/stop"; wait "$WATCH" 2>/dev/null

snap_home "$OUT/home-after.txt"; snap_ports "$OUT/ports-after.txt"
hash_tree "$SRC" "$OUT/source-materials-after.txt"
diff_paths "$OUT/home-before.txt" "$OUT/home-after.txt" > "$OUT/home-diff.txt"
CHILD_SESSION="$(find "$WD/home" -type f 2>/dev/null | grep -oE 'session-[0-9a-f-]{36}' | head -1 | sed 's/^session-//' || true)"

{
  echo "run_rc=$RUN_RC"
  echo "child_session_id=${CHILD_SESSION:-<none>}"
  echo "source_materials_unchanged=$( [ "$(head -1 "$OUT/source-materials-before.txt")" = "$(head -1 "$OUT/source-materials-after.txt")" ] && diff -q "$OUT/source-materials-before.txt" "$OUT/source-materials-after.txt" >/dev/null && echo yes || echo NO )"
  echo "new_listeners=$(comm -13 "$OUT/ports-before.txt" "$OUT/ports-after.txt" | wc -l | tr -d ' ')"
  echo "new_listeners_detail=$(comm -13 "$OUT/ports-before.txt" "$OUT/ports-after.txt" | tr '\n' '|')"
  echo "orphan=$(orphan_count)"
  echo "host_alive_830=$(kill -0 830 2>/dev/null && echo yes || echo no) host_alive_890=$(kill -0 890 2>/dev/null && echo yes || echo no)"
  echo "watch_reports=$(grep -cE 'new_listeners|child_touch_real_home|new_home_files' "$OUT/watch.jsonl" || true)"
  echo "watch_critical=$(grep -E 'child_touch_real_home|new_listeners' "$OUT/watch.jsonl" | head -2 | tr '\n' '|')"
  echo "changed_lines=$(grep -c . "$OUT/home-diff.txt" || true)"
  echo "changed_minus_child=$(grep -vF "${CHILD_SESSION:-__none__}" "$OUT/home-diff.txt" | wc -l | tr -d ' ')"
  echo "child_write_in_home=$(grep -cF "${CHILD_SESSION:-__none__}" "$OUT/home-diff.txt" || true)"
  echo "cred_leftover=$([ -f "$WD/home/.credentials.yaml" ] && echo yes || echo no)"
  echo "isolated_home_files=$(find "$WD/home" -type f | wc -l | tr -d ' ')"
  echo "grading_result=$([ -f "$WD/out/grading-result.json" ] && echo yes || echo no)"
} > "$OUT/summary.txt"

# 物料只读核查
python3 - "$WD/materials" > "$OUT/materials-perm.txt" <<'PY'
import os, stat, sys
root = sys.argv[1]
bad_f = bad_d = 0
sample_w = []
count = 0
for dp, dns, fns in os.walk(root):
    m = os.stat(dp).st_mode
    if not (m & stat.S_IWUSR) == 0:
        bad_d += 0
    for fn in fns:
        p = os.path.join(dp, fn)
        st = os.stat(p).st_mode
        count += 1
        if st & stat.S_IWUSR:
            bad_f += 1
            if len(sample_w) < 3:
                sample_w.append(p)
        if len(sample_w) == 0 and 'standard' in p and count % 7 == 0:
            sample_w.append('sample_readonly_present')
print('materials_files=%d writable_files=%d' % (count, bad_f))
for s in sample_w[:5]:
    print('  ' + s)
PY
grep -E 'MATERIALS|materials_tree|MATERIALS_OK' "$WD/out/run.log" | head -2 >> "$OUT/summary.txt"
grep -E 'RUN_RESULT|RUN_EXIT|GRADED|契约产物' "$WD/out/run.log" | tail -3 >> "$OUT/summary.txt"
grep -E '^materials_files|^  ' "$OUT/materials-perm.txt" >> "$OUT/summary.txt"
echo "T5_DONE rc=$RUN_RC"
cat "$OUT/summary.txt"
