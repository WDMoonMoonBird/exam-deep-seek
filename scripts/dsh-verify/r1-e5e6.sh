#!/usr/bin/env bash
# scripts/dsh-verify/r1-e5e6.sh —— R1-C：E5（注入集 63/52 复算 + 装置去重口径）、E6（C 自建六例边界）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
CK="$DSH_REPO_ROOT/scripts/dsh-checker"
R=/tmp/r1c/e5e6; rm -rf "$R"; mkdir -p "$R"
BATCH="$DSH_REPO_ROOT/实验/注入测试集"

echo "=== E5a：C 自己复算注入集（不复用 A/B 数字）==="
python3 - "$BATCH" "$R/zips.json" <<'PY'
import hashlib, json, os, sys
batch, outp = sys.argv[1], sys.argv[2]
rows = {}
for fn in sorted(os.listdir(batch)):
    if not fn.endswith('.zip'):
        continue
    p = os.path.join(batch, fn)
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    rows.setdefault(h.hexdigest(), []).append(fn)
groups = sorted(rows.items(), key=lambda kv: (-len(kv[1]), kv[0]))
sizes = [len(v) for _, v in groups]
print('zips_total=%d unique_sha256=%d max_group=%d ones=%d' % (sum(sizes), len(groups), max(sizes), sum(1 for s in sizes if s == 1)))
print('top3 groups:', [(k[:12], len(v)) for k, v in groups[:3]])
json.dump({'zips_total': sum(sizes), 'unique': len(groups), 'max_group': max(sizes),
           'groups': [{'digest': k, 'n': len(v), 'names': v} for k, v in groups]},
          open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
PY
echo "--- 装置 batch --dedup none ---"
python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --batch "$BATCH" --out "$R/none" --dedup none 2>&1 | tail -2
echo "--- 装置 batch --dedup digest ---"
python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --batch "$BATCH" --out "$R/digest" --dedup digest 2>&1 | tail -2
python3 - "$R" <<'PY'
import json, os, sys
R = sys.argv[1]
for mode in ('none', 'digest'):
    p = os.path.join(R, mode, 'comparability.json')
    d = json.load(open(p, encoding='utf-8'))
    keys = {k: (v if not isinstance(v, list) else 'list[%d]' % len(v)) for k, v in d.items()}
    print('[%s] comparability keys: %s' % (mode, keys))
    print('   cross_group=%s groups=%d skipped=%d evaluated=%d' % (
        d.get('cross_group'), len(d.get('groups') or []), len(d.get('skipped_duplicates') or []), d.get('evaluated', '?')))
PY

echo "=== E6：C 自建六例边界（每例跑两次比对）==="
mkroot() { mkdir -p "$1/src"; printf '{"name":"x"}\n' > "$1/package.json"; printf 'console.log(1)\n' > "$1/src/main.js"; }
run2() { # run2 <case> <submission-dir>
  local name="$1" sub="$2"
  local o1="$R/e6-$name.a" o2="$R/e6-$name.b"
  python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --submission "$sub" --out "$o1.json" --canonical > "$o1.txt" 2>&1; local r1=$?
  python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --submission "$sub" --out "$o2.json" --canonical > "$o2.txt" 2>&1; local r2=$?
  local c1 c2 st1 st2 tb
  c1="$(grep -oE '"canonical_sha256": *"[0-9a-f]{64}"' "$o1.json" 2>/dev/null | grep -oE '[0-9a-f]{64}' | head -1)"
  c2="$(grep -oE '"canonical_sha256": *"[0-9a-f]{64}"' "$o2.json" 2>/dev/null | grep -oE '[0-9a-f]{64}' | head -1)"
  st1="$(python3 -c "import json;d=json.load(open('$o1.json'));print(d.get('items')[0]['status'] if d.get('items') else (d.get('input_problem') or 'stale/empty'))" 2>/dev/null)"
  tb="$(grep -c 'Traceback' "$o1.txt" "$o2.txt" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')"
  local ok=FAIL
  [ "$r1" = "$r2" ] && [ "$c1" = "$c2" ] && [ "$tb" = "0" ] && ok=PASS
  printf '%s %-12s rc=%s/%s deterministic=%s traceback=%s first_status=%s canon=%s\n' "$ok" "$name" "$r1" "$r2" \
    "$([ "$c1" = "$c2" ] && echo yes || echo NO)" "$tb" "$st1" "${c1:0:12}"
}
mkdir -p "$R/e6"
mkdir -p "$R/e6/empty"
mkdir -p "$R/e6/only-nm/node_modules/x"; printf 'x\n' > "$R/e6/only-nm/node_modules/x/index.js"
mkdir -p "$R/e6/symlink"; ln -sfn "$R/e6/symlink" "$R/e6/symlink/self" 2>/dev/null; ln -sfn ../.. "$R/e6/symlink/up" 2>/dev/null
D="$R/e6/deep"; P="$D"; for i in $(seq 1 25); do P="$P/d$i"; done; mkroot "$P"
mkdir -p "$R/e6/nonutf8"; printf '{"name":"x"}\n' > "$R/e6/nonutf8/package.json"
python3 - "$R/e6/nonutf8" <<'PY'
import os, sys
root = sys.argv[1]
os.makedirs(os.path.join(root, 'src'), exist_ok=True)
open(os.path.join(root, 'src', 'main.js'), 'wb').write(b'console.log(1);\n')
# 非法 UTF-8 文件名 + 非法 UTF-8 内容
bad = os.path.join(root, 'src', b'\xff\xfe-bad.js'.decode('latin-1'))
try:
    open(bad, 'wb').write(b'\xff\xfe\x00\x01 not utf8\n')
    print('nonutf8 文件已建')
except OSError as exc:
    print('nonutf8 文件建失败:', exc)
PY
mkdir -p "$R/e6/valid-symlink-loop"; mkroot "$R/e6/valid-symlink-loop"; ln -sfn "$R/e6/valid-symlink-loop" "$R/e6/valid-symlink-loop/loop"
mkdir -p "$R/e6/case-conflict/src"; printf '{"name":"x"}\n' > "$R/e6/case-conflict/package.json"
printf 'a\n' > "$R/e6/case-conflict/src/main.js"
python3 - "$R/e6/case-conflict" <<'PY'
import os, sys, unicodedata
root = sys.argv[1]
nfc = unicodedata.normalize('NFC', '数据.js'); nfd = unicodedata.normalize('NFD', '数据.js')
for name in (nfc, nfd):
    try:
        open(os.path.join(root, 'src', name), 'w', encoding='utf-8').write('x\n')
    except OSError as exc:
        print('create failed for', name.encode('utf-8'), exc)
print('最终 src 条目:', sorted(os.listdir(os.path.join(root, 'src'))))
PY
run2 empty        "$R/e6/empty"
run2 only-nm      "$R/e6/only-nm"
run2 symlink-only "$R/e6/symlink"
run2 deep25       "$R/e6/deep"
run2 nonutf8      "$R/e6/nonutf8"
run2 symlink-loop "$R/e6/valid-symlink-loop"
run2 case-conflict "$R/e6/case-conflict"
echo "E5E6_DONE"