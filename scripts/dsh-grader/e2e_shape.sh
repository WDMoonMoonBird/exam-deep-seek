#!/usr/bin/env bash
# scripts/dsh-grader/e2e_shape.sh —— R3-B 端到端实验 E-A..E-E（默认零模型调用，走 stub-dsh.sh）
# 用法: bash e2e_shape.sh --workdir <W> [--checker <c.json>] [--repo <仓库根>] [--real] [--timeout 秒]
#   默认用 stub 造尺（零 LLM）；--real 才会真跑一次 DSH 会话（1 次模型调用）
# 输出: E_<name>=PASS/FAIL 行 + E2E_RESULT=PASS/FAIL；exit 0/1
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORKDIR=""
CHECKER=""
REPO="$(cd "$HERE/../.." && pwd)"
REAL=0
TIMEOUT_SEC=1800
while [ $# -gt 0 ]; do
  case "$1" in
    --workdir) WORKDIR="$2"; shift 2 ;;
    --checker) CHECKER="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --timeout) TIMEOUT_SEC="$2"; shift 2 ;;
    --real) REAL=1; shift ;;
    -h|--help) echo "见头部注释"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done
[ -n "$WORKDIR" ] || WORKDIR="$(mktemp -d /tmp/dsh-r3-e2e.XXXXXX)"
mkdir -p "$WORKDIR"
LOG="$WORKDIR/e2e"
mkdir -p "$LOG"
CK="$CHECKER"
FAILS=0
verdict() {
  echo "E_$1=$2 $3"
  [ "$2" = PASS ] || FAILS=$((FAILS + 1))
}

if [ -z "$CK" ]; then
  if [ "$REAL" -eq 1 ]; then
    bash "$HERE/run.sh" --submissions 1 --workdir "$WORKDIR" --timeout "$TIMEOUT_SEC" > "$LOG/run-real.log" 2>&1
    RC=$?
    verdict A_BUILD "$([ "$RC" -eq 0 ] && echo PASS || echo FAIL)" "run.sh exit=${RC}（real=1，日志 $LOG/run-real.log）"
  else
    STUB_MODE=ok bash "$HERE/run.sh" --submissions 1 --workdir "$WORKDIR" --timeout 900 > "$LOG/run-stub.log" 2>&1
    RC=$?
    verdict A_BUILD "$([ "$RC" -eq 0 ] && echo PASS || echo FAIL)" "run.sh exit=${RC}（stub，零模型调用；日志 $LOG/run-stub.log）"
  fi
  CK="$WORKDIR/out/checker/checker.json"
else
  verdict A_BUILD SKIP "使用外部 --checker $CK"
fi

if [ -f "$CK" ]; then
  V1="$(python3 "$HERE/../dsh-checker/validate.py" "$CK" 2>&1)"
  R1=$?
  NVIOL="$(printf '%s' "$V1" | grep -c '^VIOLATION' || true)"
  CID1="$(printf '%s' "$V1" | grep '^checker_id=' | cut -d= -f2)"
  V2="$(cd /tmp && env -i PATH=/usr/bin:/bin LC_ALL=C python3 "$HERE/../dsh-checker/validate.py" "$CK" 2>&1)"
  CID2="$(printf '%s' "$V2" | grep '^checker_id=' | cut -d= -f2)"
  if [ "$R1" -eq 0 ] && [ "$NVIOL" -eq 0 ] && [ -n "$CID1" ] && [ "$CID1" = "$CID2" ]; then
    verdict A_VALIDATE PASS "exit 0 / VIOLATION=0 / 两进程 checker_id 一致（${CID1}）"
  else
    verdict A_VALIDATE FAIL "rc=$R1 violations=$NVIOL id1=$CID1 id2=$CID2"
  fi
  python3 - "$CK" "$LOG/counterexample.txt" <<'PY'
import json, os, sys
sys.path.insert(0, '/Users/you/My Projects/My Vue/Exam-DeepSeek/scripts/dsh-checker')
import validate as V
ck_path, out = sys.argv[1], sys.argv[2]
base = json.load(open(ck_path, encoding='utf-8'))
id0 = V.checker_id_of(base)
m1 = json.loads(json.dumps(base))
m1['generated']['created_at'] = '2099-01-01T00:00:00+08:00'
id1 = V.checker_id_of(m1)
m2 = json.loads(json.dumps(base))
m2['predicates'][0]['max_score'] = m2['predicates'][0]['max_score'] + 1
id2 = V.checker_id_of(m2)
open(out, 'w').write('id0=' + id0 + chr(10) + 'id_generated_only=' + id1 + chr(10) + 'id_maxscore_changed=' + id2 + chr(10))
print('COUNTEREXAMPLE generated_only_unchanged=%s max_score_changed=%s' % (
    'yes' if id1 == id0 else 'no', 'yes' if id2 != id0 else 'no'))
PY
  CE="$(python3 - "$LOG/counterexample.txt" <<'PY'
import sys
d = dict(x.split('=', 1) for x in open(sys.argv[1], encoding='utf-8').read().splitlines() if '=' in x)
same = 'yes' if d.get('id0') == d.get('id_generated_only') else 'no'
diff = 'yes' if d.get('id0') != d.get('id_maxscore_changed') else 'no'
print('generated_only_id_unchanged=%s max_score_id_changed=%s' % (same, diff))
PY
)"
  case "$CE" in
    *'generated_only_id_unchanged=yes max_score_id_changed=yes'*) verdict A_COUNTEREXAMPLE PASS "$CE" ;;
    *) verdict A_COUNTEREXAMPLE FAIL "$CE" ;;
  esac
else
  verdict A_VALIDATE FAIL "checker 不存在：$CK"
fi

SUB="$WORKDIR/materials/submissions/s01"
if [ -d "$SUB" ] && [ -f "$CK" ]; then
  bash "$HERE/../dsh-checker/repro.sh" --checker "$CK" --submission "$SUB" --times 5 --submission-id s01 \
    --rubric "$WORKDIR/materials/rubric.md" --standard "$WORKDIR/materials/standard" --out "$LOG/e-b" > "$LOG/e-b.log" 2>&1
  RC1=$?
  D1="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1],encoding=chr(34)+chr(117)+chr(116)+chr(102)+chr(45)+chr(56)+chr(34)))["distinct_count"])' "$LOG/e-b/repro-report.json" 2> /dev/null || echo ?)"
  bash "$HERE/../dsh-checker/repro.sh" --checker "$CK" --submission "$SUB" --times 6 --perturb all --submission-id s01 \
    --poison timestamp --out "$LOG/e-b-poison" > "$LOG/e-b-poison.log" 2>&1
  DET="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1],encoding=chr(34)+chr(117)+chr(116)+chr(102)+chr(45)+chr(56)+chr(34)))["poison_detected"])' "$LOG/e-b-poison/repro-report.json" 2> /dev/null || echo ?)"
  if [ "$RC1" -eq 0 ] && [ "$D1" = "1" ] && [ "$DET" = "True" ]; then
    verdict B_DETERMINISM PASS "distinct=1（5 次同尺同卷）＋ poison timestamp 被检出"
  else
    verdict B_DETERMINISM FAIL "repro rc=$RC1 distinct=$D1 poison_detected=$DET"
  fi
else
  verdict B_DETERMINISM FAIL "缺少提交目录或 checker"
fi

# F-R3C-2：readdir 顺序扰动（grader 侧补强；既有 repro.sh 扰动集一条未动）
if [ -f "$CK" ] && [ -d "$SUB" ]; then
  python3 "$HERE/perturb_readdir.py" --submission "$SUB" --checker "$CK" --out "$LOG/e-b-readdir" --copies 3 --label E-B > "$LOG/e-b-readdir.log" 2>&1
  RB=$?
  LINE="$(grep -h READDIR_PERTURB "$LOG/e-b-readdir.log" | head -1)"
  if [ "$RB" -eq 0 ]; then verdict B_READDIR PASS "$LINE"; else verdict B_READDIR FAIL "$LINE"; fi
else
  verdict B_READDIR FAIL "缺少提交目录或 checker"
fi

INJ="$REPO/实验/注入测试集"
if [ -d "$INJ" ] && [ -f "$CK" ]; then
  python3 "$HERE/../dsh-checker/check.py" --checker "$CK" --batch "$INJ" --dedup digest --out "$LOG/e-c1" > "$LOG/e-c1.log" 2>&1
  RC1=$?
  python3 "$HERE/../dsh-checker/check.py" --checker "$CK" --batch "$INJ" --dedup digest --out "$LOG/e-c2" > "$LOG/e-c2.log" 2>&1
  RC2=$?
  python3 - "$LOG/e-c1" "$LOG/e-c2" > "$LOG/e-c.txt" 2>&1 <<'PY'
import json, os, sys
a = json.load(open(os.path.join(sys.argv[1], 'batch-index.json'), encoding='utf-8'))
b = json.load(open(os.path.join(sys.argv[2], 'batch-index.json'), encoding='utf-8'))
ka = {r['zip']: r['canonical_sha256'] for r in a['results']}
kb = {r['zip']: r['canonical_sha256'] for r in b['results']}
same = sum(1 for k in ka if k in kb and ka[k] == kb[k])
unsup = 0
for d in sys.argv[1:3]:
    for n in sorted(os.listdir(d)):
        if n.startswith('result-') and n.endswith('.json'):
            doc = json.load(open(os.path.join(d, n), encoding='utf-8'))
            unsup += len((doc.get('reconciliation') or {}).get('unsupported') or [])
print('E_C_DETAIL zips=%d evaluated=%d skipped=%d same_canonical=%d unsupported=%d' % (
    len(ka), len(a['results']), len(a['skipped']), same, unsup))
PY
  DETAIL="$(grep E_C_DETAIL "$LOG/e-c.txt" || echo 'E_C_DETAIL missing')"
  case "$DETAIL" in
    *'zips=52 evaluated=52 skipped=11 same_canonical=52 unsupported=0'*)
      if [ "$RC1" -eq 0 ] && [ "$RC2" -eq 0 ]; then verdict C_BATCH PASS "$DETAIL"; else verdict C_BATCH FAIL "rc1=$RC1 rc2=$RC2 $DETAIL"; fi ;;
    *) verdict C_BATCH FAIL "$DETAIL" ;;
  esac
else
  verdict C_BATCH FAIL "注入集或缺 checker 缺失"
fi

if [ -d "$SUB" ] && [ -f "$CK" ]; then
  python3 "$HERE/make_variants.py" --submission "$SUB" --checker "$CK" --out "$WORKDIR/variants" > "$LOG/e-d-variants.txt" 2>&1
  python3 "$HERE/../dsh-checker/check.py" --checker "$CK" --submission "$SUB" --submission-id base --out "$LOG/base.json" > /dev/null 2>&1
  # 判据（队长裁定 2）：变体不得导致任何评分项被扣分；d1/d2 更严 —— 逐项分数必须完全相同。
  # 注意 canonical_sha256 里含 submission.digest（文件字节），任何变体都会改它；故「逐位一致」口径落在评分项上。
  D12OK=1
  D3OK=1
  D3NOTE="no-diff"
  CANONICAL_NOTE="canonical_same_unknown"
  CANON="?"
  for v in d1 d2 d3; do
    VD="$WORKDIR/variants/$v/$(basename "$SUB")"
    [ -d "$VD" ] || continue
    python3 "$HERE/../dsh-checker/check.py" --checker "$CK" --submission "$VD" --submission-id base --out "$LOG/$v.json" > /dev/null 2>&1
    OUT="$(python3 "$HERE/make_variants.py" --compare --baseline "$LOG/base.json" --variant "$LOG/$v.json" --label "$v" 2>&1)"
    RC=$?
    printf '%s' "$OUT" >> "$LOG/e-d-compare.txt"
    CHANGED="$(printf '%s' "$OUT" | grep -oE 'score_items_changed=[0-9]+' | cut -d= -f2)"
    CANON="$(printf '%s' "$OUT" | grep -oE 'canonical_same=(yes|no)' | cut -d= -f2 || true)"
    CANON="${CANON:-?}"
    CANONICAL_NOTE="$CANONICAL_NOTE $v:canonical_same=$CANON;"
    if [ "$v" = "d3" ]; then
      [ "$RC" -eq 0 ] || D3OK=0
      D3NOTE="$(printf '%s' "$OUT" | head -2 | tr '\n' ' ')"
    else
      [ "$RC" -eq 0 ] && [ "$CHANGED" = "0" ] || D12OK=0
    fi
  done
  if [ "$D12OK" -eq 1 ] && [ "$D3OK" -eq 1 ]; then
    verdict D_VARIANTS PASS "d1/d2 逐项分数完全一致（0 变化）；d3 差异逐条报出且无扣分（${D3NOTE}）"
  else
    verdict D_VARIANTS FAIL "d1/d2 分数或扣分异常（d12ok=$D12OK d3ok=$D3OK ${D3NOTE}）"
  fi
else
  verdict D_VARIANTS FAIL "缺少提交目录或 checker"
fi
if [ -f "$CK" ]; then
  python3 "$HERE/coverage_report.py" --checker "$CK" --rubric-sections "$WORKDIR/materials/rubric-sections.json" \
    --session-coverage "$WORKDIR/out/checker/rubric-coverage.json" --matrix "$LOG/coverage-matrix.json" \
    --json "$LOG/coverage.json" > "$LOG/e-e.log" 2>&1
  RC=$?
  CNT="$(grep -h '^COVERAGE states=' "$LOG/e-e.log" || true)"
  ROWS="$(grep -h '^COVERAGE_MATRIX' "$LOG/e-e.log" || true)"
  UNCOV="$(grep -c '^UNCOVERED' "$LOG/e-e.log" || true)"
  case "$CNT" in
    *'covered_or_partial=0'*) verdict E_COVERAGE FAIL "covered+partial=0 ⇒ 等于没造出尺子" ;;
    *) if [ "$RC" -eq 0 ]; then verdict E_COVERAGE PASS "$CNT ｜ $ROWS ｜ uncovered_lines=$UNCOV"; else verdict E_COVERAGE FAIL "coverage_report rc=$RC $CNT $ROWS"; fi ;;
  esac
else
  verdict E_COVERAGE FAIL "缺少 checker"
fi

echo "E2E_WORKDIR=$WORKDIR"
if [ "$FAILS" -eq 0 ]; then
  echo "E2E_RESULT=PASS"
  exit 0
fi
echo "E2E_RESULT=FAIL failures=$FAILS"
exit 1
