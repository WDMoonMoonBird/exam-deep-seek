#!/usr/bin/env bash
# scripts/dsh-verify/r1-e6b.sh —— R1-C E6 补测：把项目嵌一层（匹配 **/package.json），覆盖 non-UTF8/大小写&Unicode/symlink 环
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
CK="$DSH_REPO_ROOT/scripts/dsh-checker"
R=/tmp/r1c/e6b; rm -rf "$R"; mkdir -p "$R"

mkproj() { # mkproj <sub-dir>
  mkdir -p "$1/src"; printf '{"name":"x"}\n' > "$1/package.json"; printf 'console.log(1)\n' > "$1/src/main.js"
}
run2() {
  local name="$1" sub="$2"
  local o1="$R/$name.a" o2="$R/$name.b"
  python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --submission "$sub" --out "$o1.json" --canonical > "$o1.txt" 2>&1; local r1=$?
  python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --submission "$sub" --out "$o2.json" --canonical > "$o2.txt" 2>&1; local r2=$?
  local c1 c2 tb sc
  c1="$(grep -oE '"canonical_sha256": *"[0-9a-f]{64}"' "$o1.json" 2>/dev/null | grep -oE '[0-9a-f]{64}' | head -1)"
  c2="$(grep -oE '"canonical_sha256": *"[0-9a-f]{64}"' "$o2.json" 2>/dev/null | grep -oE '[0-9a-f]{64}' | head -1)"
  sc="$(python3 -c "import json;d=json.load(open('$o1.json'));print(d['totals']['score'], d.get('submission',{}).get('file_count'))" 2>/dev/null)"
  tb="$(grep -c Traceback "$o1.txt" "$o2.txt" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')"
  local ok=FAIL; [ "$r1" = "$r2" ] && [ "$c1" = "$c2" ] && [ "$tb" = "0" ] && ok=PASS
  printf '%s %-14s rc=%s/%s deterministic=%s traceback=%s score/file_count=%s canon=%s\n' "$ok" "$name" "$r1" "$r2" \
    "$([ "$c1" = "$c2" ] && echo yes || echo NO)" "$tb" "$sc" "${c1:0:12}"
}

w_nonutf8() { mkproj "$1/UserManagement"
  python3 - "$1/UserManagement" <<'PY'
import os, sys
root = sys.argv[1].encode()
# 真·非法 UTF-8 文件名（bytes 直写）
try:
    fd = os.open(os.path.join(root, b'src', b'\xff\xfe-bad.js'), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    os.write(fd, b'\xff\xfe not utf8\n'); os.close(fd)
    print('invalid-utf8 文件名已建')
except OSError as exc:
    print('invalid-utf8 建失败:', exc)
# 非法 UTF-8 内容写进正常文件名
open(os.path.join(sys.argv[1], 'src', 'bad-content.js'), 'wb').write(b'\xff\xfe\x00\x01')
PY
}
w_case() { mkproj "$1/UserManagement"
  python3 - "$1/UserManagement/src" <<'PY'
import os, sys, unicodedata
d = sys.argv[1]
for name in (unicodedata.normalize('NFC', '数据.js'), unicodedata.normalize('NFD', '数据.js')):
    try:
        open(os.path.join(d, name), 'w', encoding='utf-8').write('x\n')
    except OSError as exc:
        print('create failed:', name.encode('utf-8'), exc)
for name in ('App.vue', 'app.vue'):
    try:
        open(os.path.join(d, name), 'w', encoding='utf-8').write('<template/>\n')
    except OSError as exc:
        print('case create failed:', name, exc)
print('src 条目:', sorted(os.listdir(d)))
PY
}

mkdir -p "$R/nonutf8-nested"; w_nonutf8 "$R/nonutf8-nested"
mkdir -p "$R/case-nested";    w_case "$R/case-nested"
mkdir -p "$R/linkloop-nested"; mkproj "$R/linkloop-nested/UserManagement"
ln -sfn "$R/linkloop-nested/UserManagement" "$R/linkloop-nested/UserManagement/loop" 2>/dev/null
ln -sfn ../../.. "$R/linkloop-nested/UserManagement/up" 2>/dev/null
mkdir -p "$R/deep-nested"; P="$R/deep-nested"; for i in $(seq 1 20); do P="$P/d$i"; done; mkproj "$P/UserManagement"
echo "=== E6 补测（项目嵌一层，匹配 **/package.json）==="
run2 nonutf8-nested "$R/nonutf8-nested"
run2 case-nested    "$R/case-nested"
run2 linkloop-nested "$R/linkloop-nested"
run2 deep-nested    "$R/deep-nested"
echo "--- non-UTF8 用例的 status 分布（应无 Traceback、status 属六态）---"
python3 -c "
import json;d=json.load(open('$R/nonutf8-nested.a.json'));print('items',[(i['id'],i['status']) for i in d['items']]);print('score',d['totals']['score'],'errors',d['reconciliation']['errors'][:2])"
echo E6B_DONE