#!/usr/bin/env python3
"""watch.py <real_dsh_home> <root_pid> <out.jsonl> <stop_file>
实时旁证：每 0.5s 采样 (a) 全机监听端口集合是否变化 (b) root_pid 进程树里任何进程打开的
文件/目录是否落在 ~/.dsh 下 (c) ~/.dsh 里是否出现新文件。只读，不写 ~/.dsh。
"""
import json
import os
import subprocess
import sys
import time

real_home, root_pid, out_path, stop_path = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]


def sh(cmd):
    try:
        return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              timeout=8).stdout.decode('utf-8', 'replace')
    except Exception:
        return ''


def listeners():
    out = sh(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN'])
    rows = set()
    for line in out.splitlines()[1:]:
        p = line.split()
        if len(p) > 8:
            rows.add(p[0] + ' ' + p[8])
    return rows


def descendants(pid):
    ps = sh(['ps', '-Ao', 'pid,ppid'])
    kids = {}
    for line in ps.splitlines()[1:]:
        p = line.split()
        if len(p) == 2 and p[0].isdigit():
            kids.setdefault(int(p[1]), []).append(int(p[0]))
    found, stack = set(), [pid]
    while stack:
        cur = stack.pop()
        for k in kids.get(cur, []):
            if k not in found:
                found.add(k)
                stack.append(k)
    found.add(pid)
    return found


def walk_home():
    seen = set()
    for dirpath, dirnames, filenames in os.walk(real_home):
        if 'node_modules' in dirnames:
            dirnames.remove('node_modules')
        for fn in filenames:
            seen.add(os.path.join(dirpath, fn))
    return seen


f = open(out_path, 'a', encoding='utf-8')
base_listeners = listeners()
baseline_files = walk_home()
f.write(json.dumps({'event': 'baseline', 'listeners': sorted(base_listeners),
                    'home_files': len(baseline_files)}) + '\n')
f.flush()
tick = 0
while not os.path.exists(stop_path):
    time.sleep(0.5)
    tick += 1
    rec = {'t': round(time.time(), 1)}
    cur_l = listeners()
    if cur_l - base_listeners:
        rec['new_listeners'] = sorted(cur_l - base_listeners)
    if tick % 4 == 0:  # 每 2s 做一次较重的检查
        pids = descendants(root_pid)
        rec['tree_size'] = len(pids)
        touched = []
        for pid in pids:
            out = sh(['lsof', '-p', str(pid)])
            for line in out.splitlines():
                if real_home in line:
                    touched.append(str(pid) + ':' + line.split()[-1])
        if touched:
            rec['child_touch_real_home'] = sorted(set(touched))[:5]
        cur_files = walk_home()
        new_files = cur_files - baseline_files
        if new_files:
            rec['new_home_files'] = sorted(new_files)[:5]
            baseline_files = cur_files
    if len(rec) > 1:
        f.write(json.dumps(rec) + '\n')
        f.flush()
f.write(json.dumps({'event': 'stop', 'ticks': tick}) + '\n')
f.close()
