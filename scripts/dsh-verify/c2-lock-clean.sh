#!/usr/bin/env bash
# scripts/dsh-verify/c2-lock-clean.sh —— F-C4 干净复跑（HOME=沙箱，stub 零模型调用）+ 陈旧锁接管
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
C2=/tmp/dsh-verify2/lockev; rm -rf "$C2"; mkdir -p "$C2/sandbox/.dsh"
G="$DSH_REPO_ROOT/scripts/dsh-grader/run.sh"; S="$HERE/stub-dsh.sh"; WD="$C2/wd"
HOME="$C2/sandbox" STUB_MODE=ok STUB_SLEEP=25 bash "$G" --submissions 1 --workdir "$WD" --timeout 300 --dsh-bin "$S" > "$C2/r1.out" 2>&1 &
R1=$!
F="$WD/out/logs/session-s01.out"
for i in $(seq 1 120); do [ -f "$F" ] && break; sleep 0.5; done
I1="$(stat -f %i "$F")"; M1="$(stat -f %i "$WD/materials/materials-manifest.json")"
T0=$(date +%s)
HOME="$C2/sandbox" STUB_MODE=ok bash "$G" --submissions 1 --workdir "$WD" --timeout 300 --dsh-bin "$S" > "$C2/r2.out" 2>&1
RC2=$?; T1=$(date +%s)
I2="$(stat -f %i "$F" 2>/dev/null || echo missing)"; M2="$(stat -f %i "$WD/materials/materials-manifest.json" 2>/dev/null || echo missing)"
wait "$R1"; RC1=$?
WD2="$C2/stale"; mkdir -p "$WD2/.dsh-grader.lock"; printf 'pid=999999\nstarted=old\n' > "$WD2/.dsh-grader.lock/owner.txt"
HOME="$C2/sandbox" STUB_MODE=ok bash "$G" --submissions 1 --workdir "$WD2" --timeout 300 --dsh-bin "$S" > "$C2/stale.out" 2>&1
RC3=$?
{
  echo "== F-C4 干净复跑（HOME=沙箱；stub 零模型调用）=="
  echo "run2 rc=$RC2 (expect 2) elapsed=$((T1-T0))s  msg=$(grep -m1 FATAL "$C2/r2.out" | cut -c1-72)"
  echo "run1 in-flight session log inode $I1 -> $I2 (same=$([ "$I1" = "$I2" ] && echo yes || echo NO))"
  echo "run1 materials manifest inode $M1 -> $M2 (same=$([ "$M1" = "$M2" ] && echo yes || echo NO))"
  echo "run1 final rc=$RC1 (expect 0) artifact=$([ -f "$WD/out/grading-result.json" ] && echo yes || echo no) lock_released=$([ -d "$WD/.dsh-grader.lock" ] && echo NO || echo yes)"
  echo "stale-lock rc=$RC3 (expect 0) $(grep -oE '陈旧锁[^（]*' "$C2/stale.out" | head -1)"
  echo "owner message sample: $(grep -m1 '占用' "$C2/r2.out" | cut -c1-100)"
} | tee /tmp/dsh-verify2/ev-lock-clean.txt
