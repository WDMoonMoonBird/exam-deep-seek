#!/usr/bin/env bash
# scripts/dsh-verify/r0c3-table.sh —— R0-C3：R4 三分支表驱动测试（对照 classify_changes.py 自述判据）+ 参数使用扫描
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
CLS="scripts/dsh-grader/classify_changes.py"
R=/tmp/r0c3; mkdir -p "$R"
HOST="716b24ce-9114-42a7-a05c-cf65c870cd5d"
CHILD="aaaa1111-bbbb-2222-cccc-333344445555"
OTHER="dddd1111-eeee-2222-ffff-333344445555"
HOME_SB="$R/home"; rm -rf "$HOME_SB"; mkdir -p "$HOME_SB/storages/session_projcache/sessions"
printf 'host journal\n' > "$HOME_SB/storages/session_projcache/sessions/$HOST.json"
printf 'child journal\n' > "$HOME_SB/storages/session_projcache/sessions/$CHILD.json"
printf 'third journal\n' > "$HOME_SB/storages/session_projcache/sessions/$OTHER.json"

check() { # check <desc> <rel> <child-session> <want>
  local desc="$1" rel="$2" child="$3" want="$4"
  local p="$HOME_SB/$rel"
  printf '> 1700000000 10 %s\n' "$p" > "$R/ch.txt"; : > "$R/ctl.txt"
  local out got
  out="$(python3 "$CLS" --changed "$R/ch.txt" --control "$R/ctl.txt" --dsh-home "$HOME_SB" \
        --host-session "$HOST" --child-session "$child" --isolated-home /tmp/iso --workdir /tmp/wd | grep -E '^RULE')"
  got="$(printf '%s' "$out" | awk '{print $2}')"
  local verdict=PASS
  [ "$got" = "$want" ] || verdict=FAIL
  printf '%s %-58s child=%-8s got=%-16s want=%s\n' "$verdict" "$desc" "${child:-empty}" "${got:-none}" "$want"
  printf '      %s\n' "$out"
}

echo "=== R4 三分支 + R1 优先级（表驱动，对照自述判据 R4(a)(b)(c)）==="
check "路径含宿主会话 id，--child-session 空（F-C2C-1 复现）" "storages/session_projcache/sessions/$HOST.json" ""        "R4-HOST-SESSION"
check "路径含第三方 UUID，--child-session 空（fail-closed）"   "storages/session_projcache/sessions/$OTHER.json" ""       "R7-UNATTRIBUTED"
check "路径含第三方 UUID，--child-session 非空"                "storages/session_projcache/sessions/$OTHER.json" "$CHILD" "R4-HOST-SESSION"
check "路径含子会话 id，--child-session 非空（R1 优先）"        "storages/session_projcache/sessions/$CHILD.json" "$CHILD" "R1-CHILD-PATH"
check "路径含宿主会话 id 且 --child-session 非空（a 分支）"      "storages/session_projcache/sessions/$HOST.json"  "$CHILD" "R4-HOST-SESSION"
echo
echo "=== 参数使用扫描（声明 vs 实际读取）==="
python3 - <<'PY'
import re
src = open('scripts/dsh-grader/classify_changes.py', encoding='utf-8').read()
decl = re.findall(r"add_argument\('(--[a-z-]+)'", src)
bad = []
for d in decl:
    n = d[2:].replace('-', '_')
    reads = re.findall(r'args\.' + n + r'\b', src)
    if not reads:
        bad.append(d)
    print('%-16s args.%s 读取次数=%d' % (d, n, len(reads)))
print('DECLARED_UNUSED=%s' % (bad if bad else 'none'))
PY
echo "=== 自述判据 vs 实现（R 规则清单对照）==="
python3 - <<'PY'
import re
src = open('scripts/dsh-grader/classify_changes.py', encoding='utf-8').read()
doc_rules = [r[0] for r in sorted(set(re.findall(r'^\s*(R\d+[a-z]?)\s+(?:CHILD|HOST-[A-Z]+|UNATTRIBUTED|OTHER)', src, re.M)))]
impl = sorted(set(re.findall(r"return '((?:R\d+)[a-z]?)[-A-Z]*'", src)))
print('自述判据:', doc_rules)
print('实现 return:', impl)
print('实现里出现但自述未列:', [i for i in impl if i not in doc_rules])
PY