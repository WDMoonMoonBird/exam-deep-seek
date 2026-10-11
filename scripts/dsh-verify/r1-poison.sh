#!/usr/bin/env bash
# scripts/dsh-verify/r1-poison.sh —— R1-C E3（C 自建毒化）：把 4 类「非确定量泄漏」注入 check.py 的**副本**，
# 再用装置自己的 repro.sh（同款判据：看 canonical 是否出现 >=2 个不同值）验证能否被抓出来。不改 scripts/dsh-checker/**。
# 与 B 的 --poison flag 机制不同：我的泄漏不进 poison_probe，而是直接进被测产物（模拟"被测实现自己泄漏"）。
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
SRC="$DSH_REPO_ROOT/scripts/dsh-checker"
R=/tmp/r1c/poison; rm -rf "$R"; mkdir -p "$R"

copy_device() { # copy_device <name>
  local d="$R/$1"; mkdir -p "$d"
  cp "$SRC"/*.py "$SRC"/*.sh "$d"/ 2>/dev/null
  cp -R "$SRC/fixtures" "$d/fixtures"
  echo "$d"
}

patch_poison() { # patch_poison <dir> <name> <python-expr>
  local d="$1" name="$2" expr="$3"
  python3 - "$d/check.py" "$name" "$expr" <<'PY'
import sys
p, name, expr = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(p, encoding='utf-8').read()
anchor = "    doc = emit(result, args.out, args.canonical, args.poison)\n    doc['run_meta']['elapsed_ms']"
assert anchor in s, 'anchor not found'
ins = ("    result = dict(result)\n"
       "    result['probe_%s'] = %s\n" % (name, expr))
s = s.replace(anchor, ins + anchor, 1)
open(p, 'w', encoding='utf-8').write(s)
print('patched', name)
PY
}

one() { # one <name> <expr> <perturb> <expect>  (expect: FAIL=装置必须判不一致)
  local name="$1" expr="$2" perturb="$3" expect="$4"
  local d; d="$(copy_device "$name")"
  patch_poison "$d" "$name" "$expr" > /dev/null
  bash "$d/repro.sh" --checker "$d/fixtures/checker.json" --submission "$d/fixtures/submission" \
    --times 6 --perturb "$perturb" --out "$R/out-$name" > "$R/$name.txt" 2>&1
  local rc=$?
  local line; line="$(grep -oE 'REPRO .*' "$R/$name.txt")"
  local det; det="$(python3 -c "import json;print(json.load(open('$R/out-$name/repro-report.json'))['determinism'])" 2>/dev/null)"
  local ok=FAIL
  [ "$expect" = "FAIL" ] && { [ "$det" = "FAIL" ] && ok=PASS; }
  [ "$expect" = "PASS" ] && { [ "$det" = "PASS" ] && ok=PASS; }
  printf '%s poison=%-14s perturb=%-5s repro_rc=%s determinism=%-4s (期望 %s)  %s\n' "$ok" "$name" "$perturb" "$rc" "$det" "$expect" "$line"
}

echo "=== 阴性对照：未注入毒化的副本（扰动矩阵不得产生假差异）==="
d0="$(copy_device control)"; bash "$d0/repro.sh" --checker "$d0/fixtures/checker.json" --submission "$d0/fixtures/submission" --times 6 --perturb all --out "$R/out-control" > "$R/control.txt" 2>&1
echo "control_rc=$? $(grep -oE 'REPRO .*' "$R/control.txt")"
echo "=== C 自建毒化：4 类非确定量泄漏（都不使用装置的 --poison 开关）==="
one pid-leak   "str(os.getpid())"                                                     none FAIL
one env-leak   "os.environ.get('TZ','') + '|' + os.environ.get('LC_ALL','')"          all  FAIL
one cwd-leak   "os.getcwd()"                                                          all  FAIL
one mtime-leak "repr(max(os.path.getmtime(os.path.join(dp,fn)) for dp,_,fns in os.walk(args.submission) for fn in fns))" all FAIL
echo "=== 逆向核对：对照组的 canonical 集合大小（应为 1）==="
python3 -c "import json;d=json.load(open('$R/out-control/repro-report.json'));print('control distinct=%d'%d['distinct_count'])"