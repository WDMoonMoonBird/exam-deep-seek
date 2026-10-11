#!/usr/bin/env bash
# scripts/dsh-verify/t3-concurrency.sh —— 并发行为实测
#  A) 同一个 \$DSH_HOME 并发两个真实会话（各 1 次模型调用）：是否互坏/串行/报错
#  B) 同一个 --workdir 并发两个 run.sh（stub 注入 + STUB_SLEEP 制造重叠）：装置有无并发闸
#  C) 不同 --workdir 并发两个 run.sh（stub）：预期互不干扰
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT="${V_EV}/t3"; rm -rf "$OUT"; mkdir -p "$OUT"
STUB="$HERE/stub-dsh.sh"
GRADER="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"
run_grader() { # run_grader <tag> <workdir> <extra-env...>
  local tag="$1" wd="$2"; shift 2
  env "$@" bash "$GRADER" --submissions 1 --workdir "$wd" --timeout 120 --dsh-bin "$STUB" \
    > "$OUT/run-$tag.out" 2>&1
  echo "rc=$?" > "$OUT/run-$tag.rc"
}

echo "=== A) 同 $DSH_HOME 并发两会话 ==="
home="$OUT/home-a"; scaffold "$home" patched
cred_install "$home" || { echo "A_CRED_UNAVAILABLE"; exit 9; }
export DSH_HOME="$home"
run_timed 180 "$OUT/a1.out" "$OUT/a1.err" "$OUT" "$DSH_BIN" --profile headless "只回复一行：CONC_A1_OK" > "$OUT/a1.rt" 2>&1 &
P1=$!
run_timed 180 "$OUT/a2.out" "$OUT/a2.err" "$OUT" "$DSH_BIN" --profile headless "只回复一行：CONC_A2_OK" > "$OUT/a2.rt" 2>&1 &
P2=$!
wait "$P1"; RC1=$?; wait "$P2"; RC2=$?
unset DSH_HOME
cred_remove "$home"
echo "A1 rc=$RC1 exit=$(grep -oE 'RT_CHILD_EXIT=[^ ]*' "$OUT/a1.rt") replied=$(grep -c 'CONC_A1_OK' "$OUT/a1.out")"
echo "A2 rc=$RC2 exit=$(grep -oE 'RT_CHILD_EXIT=[^ ]*' "$OUT/a2.rt") replied=$(grep -c 'CONC_A2_OK' "$OUT/a2.out")"
echo "A sessions_in_shared_home=$(find "$home" -type d -name 'session-*' | wc -l | tr -d ' ')"
echo "A err_mentions_lock=$(grep -ciE 'lock|EBUSY|EACCES|EEXIST|conflict' "$OUT/a1.err" "$OUT/a2.err" | tr '\n' ' ')"
echo "A orphan=$(orphan_count)"

echo "=== B) 同 --workdir 并发两个 run.sh（stub, STUB_SLEEP=15） ==="
mkdir -p "$OUT/shared"
run_grader b1 "$OUT/shared" STUB_MODE=ok STUB_SLEEP=15 &
B1=$!
sleep 3
run_grader b2 "$OUT/shared" STUB_MODE=ok STUB_SLEEP=15 &
B2=$!
wait "$B1"; wait "$B2"
cat "$OUT/run-b1.rc" "$OUT/run-b2.rc" | tr '\n' ' '; echo
echo "B grading-result.json_exists=$([ -f "$OUT/shared/out/grading-result.json" ] && echo yes || echo no)"
echo "B b1_tail: $(grep -E 'RUN_RESULT|FATAL|校验失败|不存在' "$OUT/run-b1.out" | tail -2 | tr '\n' '|')"
echo "B b2_tail: $(grep -E 'RUN_RESULT|FATAL|校验失败|不存在' "$OUT/run-b2.out" | tail -2 | tr '\n' '|')"

echo "=== C) 不同 --workdir 并发两个 run.sh（stub） ==="
mkdir -p "$OUT/wa" "$OUT/wb"
run_grader c1 "$OUT/wa" STUB_MODE=ok &
C1=$!
run_grader c2 "$OUT/wb" STUB_MODE=ok &
C2=$!
wait "$C1"; wait "$C2"
cat "$OUT/run-c1.rc" "$OUT/run-c2.rc" | tr '\n' ' '; echo
echo "C wa_result=$([ -f "$OUT/wa/out/grading-result.json" ] && echo yes || echo no) wb_result=$([ -f "$OUT/wb/out/grading-result.json" ] && echo yes || echo no)"
echo "C orphan=$(orphan_count)"
echo "T3_DONE"
