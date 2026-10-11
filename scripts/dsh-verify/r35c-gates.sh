#!/usr/bin/env bash
# scripts/dsh-verify/r35c-gates.sh —— R3.5-C：C8 全量/闸拒绝汇总/E-G/F-C4 之闸侧用例（装置自带 stub，零模型调用）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"
STUB="$DSH_REPO_ROOT/scripts/dsh-grader/stub-dsh.sh"
R=/tmp/t20/gates; rm -rf "$R"; mkdir -p "$R"

one() { # one <case> <stub-mode> <n> <expect_rc> [extra args...]
  local case_name="$1" mode="$2" n="$3" expect="$4"; shift 4
  local wd="$R/wd-$case_name"
  DSH_GRADER_BIN="$STUB" STUB_MODE="$mode" bash "$G" --checker-mode build-and-measure --submissions "$n" \
    --workdir "$wd" --timeout 600 "$@" > "$R/$case_name.out" 2>&1
  local rc=$?
  local ok=FAIL; [ "$rc" = "$expect" ] && ok=PASS
  echo "== $ok case=$case_name STUB_MODE=$mode n=$n rc=$rc (期望 $expect) args=${*:-none}"
  grep -oE 'ASSIGNMENT_RESULT=[A-Z_]+.*|RUN_EXIT=[0-9]+|SHAPE_GATE=[A-Z_]+|RUN_SHAPE_VALID=[a-z]+' "$R/$case_name.out" | tail -3 | sed 's/^/     /'
  grep -oE 'MEASURABLE=[0-9]+ UNMEASURABLE=[0-9]+' "$R/$case_name.out" | tail -1 | sed 's/^/     /'
  local has_sum=no; grep -q 'ASSIGNMENT_RESULT=' "$R/$case_name.out" && has_sum=yes
  echo "     汇总完整=$has_sum  契约产物=$([ -f "$wd/out/grading-results.json" ] && echo yes || echo no)  诊断目录=$(ls "$wd/out/diagnostics" 2>/dev/null | tr '\n' ',' | cut -c1-60)"
  [ -f "$wd/out/diagnostics/measurable.json" ] && python3 -c "
import json;d=json.load(open('$wd/out/diagnostics/measurable.json'))
print('     measurable.json:', json.dumps(d, ensure_ascii=False)[:200])" || true
}

echo "=== 4) 闸拒绝路径必须 RUN_EXIT=5 且打印完整汇总（t17 自修的 set -e 缺陷）==="
one badid bad-id 2 5
one all-unmeasurable unmeasurable 2 5
echo "=== E-G g1：C4 注入（分值越界）⇒ exit 5 无分数 ==="
one c4 field-max 2 5
echo "=== E-G g3：部分不可量 ⇒ PARTIAL + UNMEASURABLE=1（rc=0）与 --strict ⇒ rc=1 ==="
one partial partial-unmeasurable 2 0
one partial-strict partial-unmeasurable 2 1 --strict
echo "=== E-F（stub 路径）：第一遍 build-and-measure，第二遍 measure-only-reuse ==="
WD="$R/wd-ef"
DSH_GRADER_BIN="$STUB" STUB_MODE=ok bash "$G" --checker-mode build-and-measure --submissions 2 --workdir "$WD" --timeout 600 > "$R/ef1.out" 2>&1
echo "  pass1 rc=$? $(grep -oE 'ASSIGNMENT_RESULT=.*' "$R/ef1.out" | tail -1 | cut -c1-100)"
DSH_GRADER_BIN="$STUB" STUB_MODE=ok bash "$G" --checker-mode measure-only-reuse --submissions 2 --workdir "$WD" --timeout 600 > "$R/ef2.out" 2>&1
echo "  pass2 rc=$? $(grep -oE 'ASSIGNMENT_RESULT=.*' "$R/ef2.out" | tail -1 | cut -c1-100)"
grep -oE 'RUN_MODEL_CALLS=[0-9]+|RUN_MEASURE_CALLS=[0-9]+|MODEL_CALLS=[0-9]+|MEASURE_CALLS=[0-9]+' "$R/ef1.out" "$R/ef2.out" | sed 's/^/     /'
python3 - "$WD" <<'PY'
import json, os, sys
W = sys.argv[1]
def canons(d):
    out = {}
    p = os.path.join(d, 'out', 'measure')
    if os.path.isdir(p):
        for n in sorted(os.listdir(p)):
            if n.endswith('.json'):
                doc = json.load(open(os.path.join(p, n), encoding='utf-8'))
                out[n] = doc.get('canonical_sha256')
    return out
c = canons(W)
print('     measure 产物份数=%d canonicals=%s' % (len(c), sorted(set(c.values()))[:2]))
p = os.path.join(W, 'out', 'reconciliation', 'comparability.json')
if os.path.isfile(p):
    d = json.load(open(p, encoding='utf-8'))
    ids = set()
    for g in (d.get('groups') or []):
        ids.add(g.get('checker_id') or d.get('checker_id'))
    print('     comparability: checker_id 集合=%s cross_group=%s rows=%s' % (sorted(x for x in ids if x)[:2], d.get('cross_group'), len(d.get('groups') or [])))
PY
echo "R35C_GATES_DONE"