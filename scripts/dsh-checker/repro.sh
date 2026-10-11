#!/usr/bin/env bash
# scripts/dsh-checker/repro.sh —— 确定性复算（E1 位级复现 / E2 环境扰动 / E3 毒化阴性对照）
# 零模型调用、零网络：只反复调用 check.py（纯 stdlib 执行器）。
#
# 用法:
#   bash repro.sh --checker <c.json> --submission <目录> [--times N] [--perturb none|all]
#                 [--poison none|timestamp|mtime|readdir|hashseed] [--out <目录>]
#                 [--root-rel R] [--submission-id ID] [--rubric F] [--standard D]
# 产物: <out>/repro-report.json + <out>/run<i>/result.json
# 退出码: 0 = 与本次模式相符（见下）；1 = 不符（E1 需 N>=5 且全同；毒化模式需出现 >=2 个不同 canonical）
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TIMES=5
PERTURB=none
POISON=none
OUT=""
CHECKER=""
SUBMISSION=""
ROOT_REL=""
SUB_ID=""
RUBRIC=""
STANDARD=""

usage() { echo "见 repro.sh 头部注释"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --checker) CHECKER="$2"; shift 2 ;;
    --submission) SUBMISSION="$2"; shift 2 ;;
    --times) TIMES="$2"; shift 2 ;;
    --perturb) PERTURB="$2"; shift 2 ;;
    --poison) POISON="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --root-rel) ROOT_REL="$2"; shift 2 ;;
    --submission-id) SUB_ID="$2"; shift 2 ;;
    --rubric) RUBRIC="$2"; shift 2 ;;
    --standard) STANDARD="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 2 ;;
  esac
done
[ -n "$CHECKER" ] && [ -n "$SUBMISSION" ] || { echo "--checker 与 --submission 必填" >&2; exit 2; }
[ -d "$SUBMISSION" ] || { echo "提交目录不存在: $SUBMISSION" >&2; exit 2; }

[ -n "$OUT" ] || OUT="$(mktemp -d /tmp/dsh-checker-repro.XXXXXX)"
mkdir -p "$OUT"
CHECKER_ABS="$(cd "$(dirname "$CHECKER")" && pwd)/$(basename "$CHECKER")"
SUB_ABS="$(cd "$SUBMISSION" && pwd)"
CHECKER_ID="$(python3 - "$CHECKER_ABS" <<'PY'
import json, sys
print(json.load(open(sys.argv[1], encoding='utf-8'))['checker_id'])
PY
)"

CANONS=""
SCORES=""
EXITS=""
LEAKS=0
i=1
while [ "$i" -le "$TIMES" ]; do
  RUN="$OUT/run$i"
  mkdir -p "$RUN"
  CWD="$RUN"
  SRC="$SUB_ABS"
  LC="C"
  TZ_V="UTC"
  SEED="0"
  if [ "$PERTURB" = all ]; then
    DEST="$RUN/含 空格 与中文 的 目录/提交 副本"
    mkdir -p "$DEST"
    cp -R "$SUB_ABS/." "$DEST/" 2> /dev/null
    SRC="$DEST"
    case $((i % 3)) in
      1) LC="C" ;;
      2) LC="en_US.UTF-8" ;;
      0) LC="zh_CN.UTF-8" ;;
    esac
    case $((i % 2)) in
      1) TZ_V="UTC" ;;
      0) TZ_V="Asia/Shanghai" ;;
    esac
    SEED="$i"
    mkdir -p "$RUN/cwd-$i/nested"
    CWD="$RUN/cwd-$i/nested"
    if [ $((i % 2)) -eq 0 ]; then
      find "$SRC" -type f -exec touch -t 200101010101 {} + 2> /dev/null
    else
      find "$SRC" -type f -exec touch -t 203012312359 {} + 2> /dev/null
    fi
  fi
  case "$POISON" in
    mtime)
      find "$SRC" -type f -exec touch -t "20010101010$((i % 10))" {} + 2> /dev/null ;;
    readdir)
      printf 'scratch %d' "$i" > "$CWD/scratch-$i.txt" ;;
    *) : ;;
  esac
  EXTRA=""
  [ -n "$ROOT_REL" ] && EXTRA="$EXTRA --root-rel $ROOT_REL"
  [ -n "$SUB_ID" ] && EXTRA="$EXTRA --submission-id $SUB_ID"
  [ -n "$RUBRIC" ] && EXTRA="$EXTRA --rubric $RUBRIC"
  [ -n "$STANDARD" ] && EXTRA="$EXTRA --standard $STANDARD"
  # shellcheck disable=SC2086
  ( cd "$CWD" && LC_ALL="$LC" TZ="$TZ_V" PYTHONHASHSEED="$SEED" \
      python3 "$HERE/check.py" --checker "$CHECKER_ABS" --submission "$SRC" --out "$RUN/result.json" \
      --canonical --poison "$POISON" $EXTRA ) > "$RUN/stdout.txt" 2> "$RUN/stderr.txt"
  RC=$?
  CANON="$(grep -oE '^[0-9a-f]{64}$' "$RUN/stdout.txt" 2> /dev/null | tail -1)"
  if [ -z "$CANON" ]; then
    CANON="$(grep -oE '"canonical_sha256": *"[0-9a-f]{64}"' "$RUN/result.json" 2> /dev/null | grep -oE '[0-9a-f]{64}' | head -1)"
  fi
  CANONS="$CANONS$CANON"$'\n'
  SCORES="$SCORES$(python3 - "$RUN/result.json" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    print(d['totals']['score'])
except Exception:
    print('none')
PY
)"$'\n'
  EXITS="$EXITS$RC"$'\n'
  L="$(grep -c -e "$RUN" -e '/private/tmp' -e '/Users/' "$RUN/result.json" 2> /dev/null || true)"
  LEAKS=$((LEAKS + L))
  i=$((i + 1))
done

python3 - "$OUT" "$TIMES" "$PERTURB" "$POISON" "$CHECKER_ID" "$LEAKS" "$CANONS" "$SCORES" "$EXITS" <<'PY'
import json, sys
out, times, perturb, poison, cid, leaks = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5], int(sys.argv[6])
canons = [x for x in sys.argv[7].split(chr(10)) if x]
scores = [x for x in sys.argv[8].split(chr(10)) if x]
exits = [int(x) for x in sys.argv[9].split(chr(10)) if x]
distinct = sorted(set(canons))
times_ok = times >= 5
if poison == 'none':
    determinism = 'PASS' if (times_ok and len(distinct) == 1 and len(canons) == times) else 'FAIL'
    reason = ('ok' if determinism == 'PASS' else
              ('times_below_min' if not times_ok else 'canonical_mismatch'))
    poison_detected = None
    falsification_power = 'NOT_APPLICABLE'
else:
    determinism = 'N/A(poison)'
    poison_detected = len(distinct) >= 2
    falsification_power = 'PASS' if poison_detected else 'INSUFFICIENT'
    reason = 'poison_observed' if poison_detected else 'poison_not_observed'
report = {
    'schema_version': 'repro-report/1',
    'checker_id': cid,
    'times': times,
    'times_min_ok': times_ok,
    'perturb': perturb,
    'poison': poison,
    'canonical_sha256': canons,
    'distinct_canonical': distinct,
    'distinct_count': len(distinct),
    'scores': scores,
    'exits': exits,
    'absolute_path_leaks': leaks,
    'determinism': determinism,
    'poison_detected': poison_detected,
    'falsification_power': falsification_power,
    'reason': reason,
}
with open(out + '/repro-report.json', 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
    f.write(chr(10))
print('REPRO times=%d perturb=%s poison=%s distinct=%d determinism=%s poison_detected=%s leaks=%d' % (
    times, perturb, poison, len(distinct), determinism, poison_detected, leaks))
sys.exit(0 if (determinism == 'PASS' or poison_detected) else 1)
PY
