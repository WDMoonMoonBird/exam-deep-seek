#!/usr/bin/env bash
# scripts/dsh-verify/r3c-eb.sh —— R3-C ★E-B：C 自建两种新毒化（hash 随机化泄漏 / locale 排序依赖），
# 用装置自己的 repro.sh（--times 6 --perturb all）判定；另附 readdir 顺序类的「未被检出」观察。
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
SRC="$DSH_REPO_ROOT/scripts/dsh-checker"
R=/tmp/r3c/eb; rm -rf "$R"; mkdir -p "$R"

# C 自建的 locale 敏感提交：z-f.js vs z-é.js（C 与 en_US 的排序相反；避开大小写冲突）
SUB_LOCALE="$R/sub-locale"
python3 - "$SRC/fixtures/submission" "$SUB_LOCALE" <<'PY'
import os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
shutil.copytree(src, dst)
d = os.path.join(dst, 'UserManagement', 'src')
for n in ('z-f.js', 'z-é.js'):
    open(os.path.join(d, n), 'w', encoding='utf-8').write('// probe\n')
print('locale 敏感提交已建:', sorted(os.listdir(d)))
PY

mkpoison() { # mkpoison <name> <expr> [submission-override]
  local name="$1" expr="$2" sub="${3:-}"
  local d="$R/$name"; mkdir -p "$d"
  cp "$SRC"/*.py "$SRC"/*.sh "$d"/ 2>/dev/null
  cp -R "$SRC/fixtures" "$d/fixtures"
  [ -n "$sub" ] && { rm -rf "$d/fixtures/submission"; cp -R "$sub" "$d/fixtures/submission"; }
  python3 - "$d/check.py" "$name" "$expr" <<'PY'
import sys
p, name, expr = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding='utf-8').read()
anchor = "    doc = emit(result, args.out, args.canonical, args.poison)\n    doc['run_meta']['elapsed_ms']"
assert anchor in s, 'anchor not found'
open(p, 'w', encoding='utf-8').write(
    s.replace(anchor, "    result = dict(result)\n    result['probe_%s'] = %s\n" % (name, expr) + anchor, 1))
PY
}
run_case() { # run_case <name> <want>
  local name="$1" want="$2"
  bash "$R/$name/repro.sh" --checker "$R/$name/fixtures/checker.json" --submission "$R/$name/fixtures/submission" \
    --times 6 --perturb all --out "$R/out-$name" > "$R/$name.txt" 2>&1
  local rc=$? det
  det="$(python3 -c "import json;print(json.load(open('$R/out-$name/repro-report.json'))['determinism'])" 2>/dev/null)"
  local ok=FAIL; [ "$det" = "$want" ] && ok=PASS
  printf '%s poison=%-14s rc=%s determinism=%-4s (期望 %s) %s\n' "$ok" "$name" "$rc" "$det" "$want" "$(grep -oE 'REPRO .*' "$R/$name.txt")"
}

echo "=== 阴性对照：未毒化副本 + 同样扰动（不得产生假差异）==="
mkdir -p "$R/control"; cp "$SRC"/*.py "$SRC"/*.sh "$R/control"/ 2>/dev/null; cp -R "$SRC/fixtures" "$R/control/fixtures"
bash "$R/control/repro.sh" --checker "$R/control/fixtures/checker.json" --submission "$R/control/fixtures/submission" \
  --times 6 --perturb all --out "$R/out-control" > "$R/control.txt" 2>&1
echo "control rc=$? $(grep -oE 'REPRO .*' "$R/control.txt")"

echo "=== C 自建毒化 1：hash 随机化泄漏（PYTHONHASHSEED 扰动）==="
mkpoison hashseed-leak "str(hash('r3c-probe'))"
run_case hashseed-leak FAIL
echo "=== C 自建毒化 2：locale 排序依赖（LC_ALL 扰动 + C 自建 locale 敏感提交）==="
mkpoison locale-order "(lambda L: (L.setlocale(L.LC_ALL, ''), str(sorted([os.path.join(dp,f) for dp,dn,fn in os.walk(args.submission) for f in fn], key=L.strxfrm)))[1])(__import__('locale'))" "$SUB_LOCALE"
run_case locale-order FAIL
echo "=== 附加观察：readdir 原始顺序泄漏（不作为 E-B 通过依据）==="
mkpoison readdir-order "str(os.listdir(args.submission))"
run_case readdir-order PASS
echo "  说明：6 次运行里 repro.sh 的 cp -R 扰动未改变 readdir 顺序（poison 输出 distinct=1 即证据）；本机 APFS 下同名集合的 readdir 顺序由名字哈希决定，与插入顺序无关。"
