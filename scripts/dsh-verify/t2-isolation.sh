#!/usr/bin/env bash
# scripts/dsh-verify/t2-isolation.sh —— 独立验证隔离性（自抓端口 + mtime/指纹 + 内容哨兵）
# 判据分两层：
#  L1 文件指纹 diff 分四类（child-session / host-control / host-journal / other）+ 新增监听端口 + 宿主进程存活
#  L2 内容哨兵：prompt 里带一个从不打印的随机哨兵，跑完在 ~/.dsh 全树 grep（排除宿主会话目录）
#     —— 专补「journal 目录里不含子会话 id 的路径会被无条件算作 HOST」这一盲区
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT="${V_EV}/t2"; rm -rf "$OUT"; mkdir -p "$OUT"
home="$OUT/home"; scaffold "$home" patched
cred_install "$home" || { echo "T2_CRED_UNAVAILABLE"; exit 9; }

SENT="iso$(date +%s)$RANDOM$RANDOM"
printf 'sentinel_sha256_prefix=%s\n' "$(printf '%s' "$SENT" | shasum -a 256 | cut -c1-8)" > "$OUT/sentinel-note.txt"

snap_home "$OUT/home-before.txt"; snap_ports "$OUT/ports-before.txt"
ps -o pid=,lstart= -p 830 -p 890 > "$OUT/host-pids-before.txt" 2>/dev/null
sleep 3; snap_home "$OUT/home-control.txt"
diff_paths "$OUT/home-before.txt" "$OUT/home-control.txt" > "$OUT/home-control-diff.txt"

export DSH_HOME="$home"
export V_PIDFILE="$OUT/child.pid"
run_timed 240 "$OUT/session.out" "$OUT/session.err" "$OUT" \
  "$DSH_BIN" --profile headless "这是隔离旁证会话。请只回复一行纯文本：ISO_ECHO=$SENT" \
  > "$OUT/runner.txt" 2>&1 &
RT=$!
for i in $(seq 1 40); do [ -f "$OUT/child.pid" ] && break; sleep 0.2; done
CHILD_PID="$(cat "$OUT/child.pid" 2>/dev/null || echo 0)"
echo "watch_root_pid=$CHILD_PID" >> "$OUT/runner.txt"
rm -f "$OUT/stop"
python3 "$HERE/watch.py" "$REAL_HOME_DIR" "$CHILD_PID" "$OUT/watch.jsonl" "$OUT/stop" &
WATCH=$!
wait "$RT"; SESSION_RC=$?
touch "$OUT/stop"; wait "$WATCH" 2>/dev/null
unset DSH_HOME
cred_remove "$home"

snap_home "$OUT/home-after.txt"; snap_ports "$OUT/ports-after.txt"
diff_paths "$OUT/home-before.txt" "$OUT/home-after.txt" > "$OUT/home-diff.txt"
CHILD_SESSION="$(find "$home" -type f 2>/dev/null | grep -oE 'session-[0-9a-f-]{36}' | head -1 | sed 's/^session-//' || true)"
{
  echo "session_rc=$SESSION_RC"
  echo "child_session_id=${CHILD_SESSION:-<none>}"
  grep -E 'RT_(CHILD_EXIT|ELAPSED_SEC|TIMEOUT|STILL_ALIVE)=' "$OUT/runner.txt"
} >> "$OUT/summary.txt"

python3 - "$OUT/home-diff.txt" "$OUT/home-control-diff.txt" "$REAL_HOME_DIR" "$CHILD_SESSION" "$HOST_SESSION_ID" > "$OUT/classify.txt" <<'PY'
import sys
changed, control, home, child, host = sys.argv[1:6]
home = home.rstrip('/')
JOURNALS = ('/sessions/', '/storages/session_projcache/sessions/', '/attachments/', '/memories/', '/cache/', '/llm-deepseek/')
def paths(p):
    out = []
    try:
        for line in open(p, encoding='utf-8', errors='replace'):
            if not line or line[0] not in '<>':
                continue
            a = line[2:].split(' ', 2)
            if len(a) == 3 and a[0].isdigit() and a[1].isdigit() and a[2].startswith('/'):
                out.append((line.rstrip(), a[2]))
    except OSError:
        pass
    return out
ctl = set(p for _, p in paths(control))
cat = {'A_child_session': [], 'B_host_control': [], 'C_host_journal_blind': [], 'D_other': []}
for line, p in paths(changed):
    if child and child in p:
        cat['A_child_session'].append(line)
    elif p in ctl:
        cat['B_host_control'].append(line)
    elif any(p.startswith(home + j) for j in JOURNALS):
        cat['C_host_journal_blind'].append(line)
    else:
        cat['D_other'].append(line)
for k, v in cat.items():
    print('__%s__ %d' % (k, len(v)))
    for line in v[:6]:
        print('   ' + line)
PY

python3 - "$REAL_HOME_DIR" "$SENT" "$HOST_SESSION_ID" "$home" > "$OUT/sentinel-scan.txt" <<'PY'
import os, sys
home, sent, host_sid, iso_home = sys.argv[1:5]
hits, skipped = [], 0
for dp, dns, fns in os.walk(home):
    if 'node_modules' in dns:
        dns.remove('node_modules')
    if host_sid and host_sid in dp:
        skipped += len(fns); dns[:] = []; continue
    for fn in fns:
        p = os.path.join(dp, fn)
        try:
            t = open(p, encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        if sent in t:
            hits.append('SENTINEL ' + p)
        elif iso_home in t:
            hits.append('ISOHOME_PATH ' + p)
print('sentinel_scan_skip_host_journal_files=%d hits=%d' % (skipped, len(hits)))
for h in hits[:10]:
    print('  ' + h)
PY

echo "--- T2 RESULT ---"
grep -E '^(__|sentinel_scan)' "$OUT/classify.txt" "$OUT/sentinel-scan.txt" | head -8
echo "new_listeners=$(comm -13 "$OUT/ports-before.txt" "$OUT/ports-after.txt" | wc -l | tr -d ' ')"
echo "host_alive_830=$(kill -0 830 2>/dev/null && echo yes || echo no) host_alive_890=$(kill -0 890 2>/dev/null && echo yes || echo no)"
echo "port_19387_lines=$(lsof -nP -iTCP:19387 -sTCP:LISTEN 2>/dev/null | wc -l | tr -d ' ')"
echo "orphan=$(orphan_count)"
echo "watch_child_touch_real_home=$(grep -c 'child_touch_real_home' "$OUT/watch.jsonl" || true)"
echo "watch_new_listeners=$(grep -c 'new_listeners' "$OUT/watch.jsonl" || true)"
echo "watch_ticks=$(tail -1 "$OUT/watch.jsonl" | head -c 120)"
echo "isolated_home_files=$(find "$home" -type f | wc -l | tr -d ' ')"
echo "isolated_home_top=$(find "$home" -type f -not -path '*/profiles/*' | sed "s|$home/||" | head -6 | tr '\n' ' ')"
echo "cred_leftover=$([ -f "$home/.credentials.yaml" ] && echo yes || echo no)"
echo "T2_DONE rc=$SESSION_RC"
