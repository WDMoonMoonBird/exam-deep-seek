#!/usr/bin/env bash
# scripts/dsh-verify/r0c4-success.sh —— R0-C4：用装置自带的 stub（零模型调用）重判 F-C4 / F-C5 / F-C2 成功路径
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"
STUB="$DSH_REPO_ROOT/scripts/dsh-grader/stub-dsh.sh"
R=/tmp/r0c4/succ; rm -rf "$R"; mkdir -p "$R"
run_dev() { # run_dev <logfile> <workdir> [env pairs...] -- [args...]
  local log="$1" wd="$2"; shift 2
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
  env DSH_GRADER_BIN="$STUB" "${envs[@]}" bash "$G" --submissions 1 --workdir "$wd" --timeout 300 "$@" > "$log" 2>&1
  echo $?
}

echo "=== F-C4 成功路径：同 workdir 并发（run1 用装置 stub 造尺成功）==="
WD="$R/lock"
DSH_GRADER_BIN="$STUB" STUB_MODE=ok STUB_SLEEP=8 bash "$G" --submissions 1 --workdir "$WD" --timeout 300 > "$R/lock1.out" 2>&1 &
R1=$!
F="$WD/out/logs/session-s01.out"
for i in $(seq 1 80); do [ -f "$F" ] && break; sleep 0.5; done
INO1="$(stat -f %i "$F" 2>/dev/null || echo missing)"
M1="$(stat -f %i "$WD/materials/materials-manifest.json" 2>/dev/null || echo missing)"
T0=$(date +%s)
DSH_GRADER_BIN="$STUB" STUB_MODE=ok bash "$G" --submissions 1 --workdir "$WD" --timeout 300 > "$R/lock2.out" 2>&1
RC2=$?; T1=$(date +%s)
INO2="$(stat -f %i "$F" 2>/dev/null || echo missing)"
M2="$(stat -f %i "$WD/materials/materials-manifest.json" 2>/dev/null || echo missing)"
wait $R1; RC1=$?
echo "run2 rc=$RC2 (期望2) 耗时=$((T1-T0))s msg=$(grep -m1 FATAL "$R/lock2.out" | cut -c1-64)"
echo "run1 in-flight session 日志 inode $INO1 -> $INO2 (same=$([ "$INO1" = "$INO2" ] && echo yes || echo NO)); 物料清单 $M1 -> $M2 (same=$([ "$M1" = "$M2" ] && echo yes || echo NO))"
echo "run1 最终 rc=$RC1 (期望0) 契约产物=$([ -f "$WD/out/grading-result.json" ] && echo yes || echo no) 锁释放=$([ -d "$WD/.dsh-workdir.lock" ] || [ -d "$WD/.dsh-grader.lock" ] && echo NO || echo yes)"
grep -oE 'RUN_RESULT=[A-Z_]+|RUN_EXIT_CODE=[0-9]+|RUN_SHAPE_VALID=[a-z]+' "$R/lock1.out" | tail -3

echo
echo "=== F-C5 成功路径 ==="
echo "-- (a) 默认拒绝（score-only 模式下会话没写文件）--"
W3="$R/fc5-default"
DSH_GRADER_BIN="$STUB" STUB_MODE=stdout_only bash "$G" --submissions 1 --workdir "$W3" --timeout 300 --allow-score-only > "$R/fc5a.out" 2>&1
echo "rc=$? 契约产物=$([ -f "$W3/out/grading-result.json" ] && echo yes || echo no) $(grep -oE 'EXTRACT_FALLBACK=[a-z]+' "$W3/out/logs/extract-s01.txt" 2>/dev/null | head -1)"
echo "-- (b) 显式 --allow-stdout-fallback --"
W4="$R/fc5-allow"
DSH_GRADER_BIN="$STUB" STUB_MODE=stdout_only bash "$G" --submissions 1 --workdir "$W4" --timeout 300 --allow-score-only --allow-stdout-fallback > "$R/fc5b.out" 2>&1
echo "rc=$? 契约产物=$([ -f "$W4/out/grading-result.json" ] && echo yes || echo no) $(grep -oE 'EXTRACT_FALLBACK=[a-z]+' "$W4/out/logs/extract-s01.txt" 2>/dev/null | head -1)"
grep -oE 'RUN_RESULT=[A-Z_]+|RUN_EXIT_CODE=[0-9]+|stdout_fallback_enabled=[01]|MODE=[a-z-]+' "$R/fc5b.out" | tail -4
echo "-- (c) 单元级：extract_result.py 默认拒绝 / 显式允许 --"
printf '{"schema_version":1,"items":[{"id":"P01","score":10,"max_score":10}],"total_score":10,"max_score":100,"submission_id":"s01"}' > "$R/so.txt"
python3 "$DSH_REPO_ROOT/scripts/dsh-grader/extract_result.py" --stdout "$R/so.txt" --candidate "$R/missing.json" --out "$R/o1.json" > "$R/u1.log" 2>&1; echo "  默认 rc=$? $(grep -oE 'EXTRACT_FALLBACK=[a-z]+' "$R/u1.log")"
python3 "$DSH_REPO_ROOT/scripts/dsh-grader/extract_result.py" --stdout "$R/so.txt" --candidate "$R/missing.json" --out "$R/o2.json" --allow-stdout-fallback > "$R/u2.log" 2>&1; echo "  显式 rc=$? $(grep -oE 'EXTRACT_FALLBACK=[a-z]+' "$R/u2.log")"

echo
echo "=== F-C2 回归：非 0 退出 + 有产物 ⇒ 必须 FAIL ==="
W5="$R/fc2"
DSH_GRADER_BIN="$STUB" STUB_MODE=nonzero_with_artifact bash "$G" --submissions 1 --workdir "$W5" --timeout 300 > "$R/fc2.out" 2>&1
echo "rc=$? 契约产物=$([ -f "$W5/out/grading-result.json" ] && echo yes || echo no) $(grep -oE 'RUN_RESULT=[A-Z_]+|RUN_EXIT_CODE=[0-9]+' "$R/fc2.out" | tail -2 | tr '\n' ' ')"
echo "R0C4_SUCCESS_DONE"