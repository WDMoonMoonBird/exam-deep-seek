#!/usr/bin/env bash
# ★R2-B29 静态防线：扫描「$var 紧跟非 ASCII 字节」的未定界写法（bash 3.2 下会把多字节字符吞进变量名
#   ⇒ set -u 时 unbound variable ⇒ bash 立即以 1 退出，`|| true` 拦不住，并覆盖装置原退出码；详见 docs/dsh/01-已知实现坑.md）。
#   用法：bash scripts/dsh-grader/scan-unbraced-vars.sh [--path <目录>]   缺省扫描 <repo>/scripts/**
#   退出：无发现 ⇒ 打印 SCAN_OK files=<n> 退 0；有发现 ⇒ 逐条打印 + SCAN_FINDINGS n=<x> 退 1。只读，不修改任何文件。
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="$ROOT/scripts"
if [ "${1:-}" = "--path" ] && [ -n "${2:-}" ]; then TARGET="$2"; fi
if [ ! -d "$TARGET" ]; then echo "SCAN_FAIL reason=no_such_dir path=$TARGET"; exit 2; fi
python3 - "$TARGET" <<'PY'
import re, sys, os
root = sys.argv[1]
pat = re.compile(rb'(?<![$\\{])\$[A-Za-z_][A-Za-z0-9_]*([\x80-\xff])')
files, hits = 0, []
for dirpath, _dirs, names in os.walk(root):
    for n in sorted(names):
        p = os.path.join(dirpath, n)
        if not os.path.isfile(p): continue
        try: data = open(p, 'rb').read()
        except Exception: continue
        files += 1
        for m in pat.finditer(data):
            ln = data[:m.start()].count(b'\n') + 1
            seg = data[max(0, m.start()-24):m.end()+8].decode('utf-8', 'replace').replace('\n', ' ')
            hits.append('%s:%d  ...%s...' % (os.path.relpath(p, root), ln, seg))
for h in hits: print('SCAN_FINDING ' + h)
if hits:
    print('SCAN_FINDINGS n=%d files=%d' % (len(hits), files)); sys.exit(1)
print('SCAN_OK files=%d' % files); sys.exit(0)
PY
