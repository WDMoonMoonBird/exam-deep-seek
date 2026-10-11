#!/usr/bin/env bash
# scripts/dsh-grader/shape_gate.sh —— 造尺闸（C1–C7）。不合格 ⇒ exit 5，且把原文归档进 out/diagnostics/。
# 用法: bash shape_gate.sh --workdir <W> [--slug s01]
# 本脚本不调用 dsh（零模型调用），也不改动任何 checker 字段（禁止自动改字段通过）。
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORKDIR=""
SLUG="s01"
REQUIRE_COVERAGE="yes"
PROBE_SUB=""
STRICT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --workdir) WORKDIR="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    --require-coverage) REQUIRE_COVERAGE="$2"; shift 2 ;;
    --probe-submission) PROBE_SUB="$2"; shift 2 ;;
    --strict) STRICT="--strict"; shift ;;
    -h|--help) echo "用法: bash shape_gate.sh --workdir <W> [--slug s01]"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done
[ -n "$WORKDIR" ] && [ -d "$WORKDIR" ] || { echo "SHAPE_GATE=ERROR workdir 无效"; exit 2; }
DIAG="$WORKDIR/out/diagnostics"
mkdir -p "$DIAG"
JSON_OUT="$DIAG/shape-checks.json"
set +e
OUT="$(python3 "$HERE/shape_checks.py" --workdir "$WORKDIR" --slug "$SLUG" --require-coverage "$REQUIRE_COVERAGE" --probe-submission "$PROBE_SUB" $STRICT --json "$JSON_OUT" 2>&1)"
RC=$?
set -e
printf '%s\n' "$OUT" | tee "$DIAG/shape-violations.txt"
if [ "$RC" -eq 1 ]; then
  echo "SHAPE_GATE=STRICT_FAIL（部分提交不可量；--strict 语义 ⇒ 退出码 1，不判整作业不合格）"
  exit 1
fi
if [ "$RC" -ne 0 ]; then
  ARCHIVE="$DIAG/shape-fail-$SLUG"
  mkdir -p "$ARCHIVE"
  cp "$WORKDIR/out/checker/checker.json" "$ARCHIVE/checker.json" 2> /dev/null || echo "(no checker.json)" > "$ARCHIVE/checker.missing.txt"
  cp "$WORKDIR/out/checker/rubric-coverage.json" "$ARCHIVE/rubric-coverage.json" 2> /dev/null || true
  if [ -f "$WORKDIR/out/checker/checker.json" ]; then
    python3 "$HERE/../dsh-checker/validate.py" "$WORKDIR/out/checker/checker.json" > "$ARCHIVE/validate.txt" 2>&1 || true
  fi
  printf '%s\n' "$OUT" > "$ARCHIVE/shape-gate.txt"
  echo "SHAPE_ARCHIVE=$ARCHIVE"
  echo "SHAPE_GATE=FAIL"
  exit 5
fi
echo "SHAPE_GATE=PASS"
exit 0
