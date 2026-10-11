#!/usr/bin/env bash
# scripts/dsh-verify/c2-guard-lock.sh —— F-C3 护栏 + F-C4 并发锁的独立复核
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
OUT=/tmp/dsh-verify2/gl; rm -rf "$OUT"; mkdir -p "$OUT"
COUNT="$HERE/count-stub.sh"
G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"
P="$DSH_REPO_ROOT/scripts/dsh-grader/probe.sh"
CRED_MTIME_BEFORE="$(stat -f %m "$HOME/.dsh/.credentials.yaml" 2>/dev/null || echo none)"

n_calls() { wc -l < "$1" 2>/dev/null | tr -d ' ' || echo 0; }

lib_case() { # lib_case <name> <DSH_HOME-value-or-UNSET> <want_rc>
  local name="$1" val="$2" want_rc="$3"
  local cf="$OUT/calls-$name.txt"; : > "$cf"
  local rc
  if [ "$val" = UNSET ]; then
    env -u DSH_HOME C2_COUNT_FILE="$cf" DSH_GRADER_BIN="$COUNT" bash -c ". '$DSH_REPO_ROOT/scripts/dsh-grader/lib.sh'; dsh_version" > "$OUT/$name.out" 2>&1
    rc=$?
  else
    env DSH_HOME="$val" C2_COUNT_FILE="$cf" DSH_GRADER_BIN="$COUNT" bash -c ". '$DSH_REPO_ROOT/scripts/dsh-grader/lib.sh'; dsh_version" > "$OUT/$name.out" 2>&1
    rc=$?
  fi
  local n; n="$(n_calls "$cf")"
  local verdict=PASS
  [ "$rc" = "$want_rc" ] || verdict=FAIL
  [ "$n" = "0" ] || verdict=FAIL
  printf '%s lib_case=%-18s rc=%s want_rc=%s cli_calls=%s  msg=%s\n' "$verdict" "$name" "$rc" "$want_rc" "$n" "$(head -1 "$OUT/$name.out" | cut -c1-70)"
}

script_case() { # script_case <name> <script> <want_rc>
  local name="$1" script="$2" want_rc="$3"
  local cf="$OUT/calls-$name.txt"; : > "$cf"
  local wd="$OUT/wd-$name"
  DSH_GRADER_ISOLATED_HOME="$HOME/.dsh" C2_COUNT_FILE="$cf" bash "$script" --workdir "$wd" --timeout 60 --dsh-bin "$COUNT" > "$OUT/$name.out" 2>&1
  local rc=$?
  local n; n="$(n_calls "$cf")"
  local verdict=PASS
  [ "$rc" = "$want_rc" ] || verdict=FAIL
  [ "$n" = "0" ] || verdict=FAIL
  printf '%s script_case=%-15s rc=%s want_rc=%s cli_calls=%s  msg=%s\n' "$verdict" "$name" "$rc" "$want_rc" "$n" "$(grep -m1 FATAL "$OUT/$name.out" | cut -c1-80)"
}

echo "=== F-C3 护栏（期望：rc=2 且 stub 调用数 0）==="
lib_case unset-dsh-home UNSET 2
lib_case real-dsh-home "$HOME/.dsh" 2
lib_case home-itself "$HOME" 2
lib_case relative-path "relative/dsh-home" 2
script_case run-realhome "$G" 2
script_case probe-realhome "$P" 2
echo "=== F-C3 正例（合法路径必须真的进到调用路径）==="
cf="$OUT/calls-ok.txt"; : > "$cf"
env DSH_HOME=/tmp/dsh-verify2/gl/okhome C2_COUNT_FILE="$cf" DSH_GRADER_BIN="$COUNT" bash -c ". '$DSH_REPO_ROOT/scripts/dsh-grader/lib.sh'; mkdir -p /tmp/dsh-verify2/gl/okhome; dsh_version" > "$OUT/ok.out" 2>&1
echo "POSITIVE lib_case=ok-path rc=$? cli_calls=$(n_calls "$cf") version=$(head -1 "$OUT/ok.out")"
echo "real_cred_mtime_before=$CRED_MTIME_BEFORE real_cred_mtime_after=$(stat -f %m "$HOME/.dsh/.credentials.yaml" 2>/dev/null || echo none)"

echo
echo "=== F-C4 workdir 原子锁 ==="
WD="$OUT/lock-wd"
STUB="$HERE/stub-dsh.sh"
STUB_MODE=ok STUB_SLEEP=25 bash "$G" --submissions 1 --workdir "$WD" --timeout 120 --dsh-bin "$STUB" > "$OUT/lock-run1.out" 2>&1 &
R1=$!
F="$WD/out/logs/session-s01.out"
for i in $(seq 1 60); do [ -f "$F" ] && break; sleep 0.5; done
INO1="$(stat -f %i "$F" 2>/dev/null || echo 0)"; SIZE1="$(stat -f %z "$F" 2>/dev/null || echo 0)"
MAN="$WD/materials/materials-manifest.json"; MAN_INO="$(stat -f %i "$MAN" 2>/dev/null || echo 0)"
echo "run1(pid=$R1) in-flight: session-log inode=$INO1 size=$SIZE1 ; manifest inode=$MAN_INO"
T0=$(date +%s)
STUB_MODE=ok bash "$G" --submissions 1 --workdir "$WD" --timeout 120 --dsh-bin "$STUB" > "$OUT/lock-run2.out" 2>&1
RC2=$?; T1=$(date +%s)
INO1B="$(stat -f %i "$F" 2>/dev/null || echo missing)"; SIZE1B="$(stat -f %z "$F" 2>/dev/null || echo missing)"
MAN_INOB="$(stat -f %i "$MAN" 2>/dev/null || echo missing)"
echo "run2 rc=$RC2 期望=2 耗时=$((T1-T0))s msg=$(grep -m1 FATAL "$OUT/lock-run2.out" | cut -c1-90)"
echo "run1 in-flight 未被删: inode $INO1 -> $INO1B (same=$([ "$INO1" = "$INO1B" ] && echo yes || echo NO)) size $SIZE1 -> $SIZE1B"
echo "run1 物料清单未被删: inode $MAN_INO -> $MAN_INOB (same=$([ "$MAN_INO" = "$MAN_INOB" ] && echo yes || echo NO))"
wait $R1; RC1=$?
echo "run1 最终 rc=$RC1 期望=0 ; 产物=$([ -f "$WD/out/grading-result.json" ] && echo yes || echo no) ; 锁已释放=$([ -d "$WD/.dsh-grader.lock" ] && echo NO || echo yes)"
echo "--- 陈旧锁接管 ---"
WD2="$OUT/stale-wd"; mkdir -p "$WD2/.dsh-grader.lock"
printf 'pid=999999\nstarted=old\n' > "$WD2/.dsh-grader.lock/owner.txt"
STUB_MODE=ok bash "$G" --submissions 1 --workdir "$WD2" --timeout 120 --dsh-bin "$STUB" > "$OUT/stale.out" 2>&1
echo "stale rc=$? $(grep -oE '陈旧锁[^（]*' "$OUT/stale.out" | head -1) ; 锁释放=$([ -d "$WD2/.dsh-grader.lock" ] && echo NO || echo yes)"
echo "GL_DONE"
