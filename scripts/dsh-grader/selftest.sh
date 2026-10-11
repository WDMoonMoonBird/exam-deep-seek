#!/usr/bin/env bash
# scripts/dsh-grader/selftest.sh —— 零模型调用的自测/回归网（覆盖 F-C1..F-C5）
# 用法: bash scripts/dsh-grader/selftest.sh
# 退出码: 0 = 全部 PASS；1 = 有 FAIL。所有 DSH 调用都走 scripts/dsh-grader/stub-dsh.sh（不联网）。
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"
set +e   # lib.sh 会打开 set -e；自测要收集每条 FAIL，必须关掉提前退出

SANDBOX="$(mktemp -d /tmp/dsh-grader-selftest.XXXXXX)"
export DSH_GRADER_REAL_HOME="$SANDBOX/real-home/.dsh"
mkdir -p "$DSH_GRADER_REAL_HOME"
export DSH_GRADER_BIN="$HERE/stub-dsh.sh"
export DEEPSEEK_API_KEY="STUBKEY-0000000000000000000000000000000000"
export STUB_CALL_LOG="$SANDBOX/stub-calls.log"
: > "$STUB_CALL_LOG"

PASS_N=0
FAIL_N=0
ok()  { echo "PASS $*"; PASS_N=$((PASS_N + 1)); }
bad() { echo "FAIL $*"; FAIL_N=$((FAIL_N + 1)); }
expect_rc() {
  local desc="$1" want="$2" rc="$3"
  if [ "$want" = nonzero ] && [ "$rc" -ne 0 ]; then ok "$desc (rc=$rc)"; return 0; fi
  if [ "$want" = zero ] && [ "$rc" -eq 0 ]; then ok "$desc (rc=0)"; return 0; fi
  bad "$desc (rc=${rc}，期望 $want)"
  return 1
}
has() { grep -q "$1" "$2" 2> /dev/null; }

echo "== dsh-grader selftest =="
echo "sandbox=$SANDBOX  stub=$DSH_GRADER_BIN  fake-real-home=$DSH_GRADER_REAL_HOME"

# ---------------- F-C3：DSH_HOME 硬护栏 ----------------
echo "-- F-C3 DSH_HOME 护栏（库级 + 脚本级）--"
GUARD="$SANDBOX/guard.sh"
{
  printf '. "%s"\n' "$HERE/lib.sh"
  printf 'guard_isolated_home "$1" > /dev/null\n'
  printf 'echo GUARD_ACCEPTED\n'
} > "$GUARD"

bash "$GUARD" "" > "$SANDBOX/g-empty.out" 2>&1
expect_rc "F-C3 空 DSH_HOME 被拒" nonzero $?
has GUARD_ACCEPTED "$SANDBOX/g-empty.out" && bad "F-C3 空 DSH_HOME 竟被接受" || ok "F-C3 空 DSH_HOME 未进入调用路径"

bash "$GUARD" "$DSH_GRADER_REAL_HOME" > "$SANDBOX/g-real.out" 2>&1
expect_rc "F-C3 指向(真实)home 被拒" nonzero $?
bash "$GUARD" "$HOME/.dsh" > "$SANDBOX/g-dotdsh.out" 2>&1
expect_rc "F-C3 指向 ~/.dsh 被拒" nonzero $?
bash "$GUARD" /etc > "$SANDBOX/g-nontmp.out" 2>&1
expect_rc "F-C3 非临时目录被拒" nonzero $?
bash "$GUARD" "$SANDBOX/iso/home" > "$SANDBOX/g-good.out" 2>&1
expect_rc "F-C3 合法隔离 home 接受" zero $?
has GUARD_ACCEPTED "$SANDBOX/g-good.out" && ok "F-C3 合法路径确实进入调用路径" || bad "F-C3 合法路径被误拒"

CALLS0="$(wc -l < "$STUB_CALL_LOG" | tr -d ' ')"
DSH_GRADER_ISOLATED_HOME="$DSH_GRADER_REAL_HOME" bash "$HERE/probe.sh" --workdir "$SANDBOX/p-bad-home" > "$SANDBOX/p-bad-home.log" 2>&1
expect_rc "F-C3 probe.sh 拒绝指向真实 home 的隔离 home" nonzero $?
CALLS1="$(wc -l < "$STUB_CALL_LOG" | tr -d ' ')"
[ "$CALLS0" = "$CALLS1" ] && ok "F-C3 probe.sh 被拒后未调用任何 DSH（stub 调用数 ${CALLS0}→${CALLS1}）" || bad "F-C3 probe.sh 仍在被拒后调用了 DSH"
DSH_GRADER_ISOLATED_HOME="$HOME/.dsh" bash "$HERE/run.sh" --submissions 1 --workdir "$SANDBOX/r-bad-home" --timeout 900 > "$SANDBOX/r-bad-home.log" 2>&1
expect_rc "F-C3 run.sh 拒绝指向 ~/.dsh 的隔离 home" nonzero $?
CALLS2="$(wc -l < "$STUB_CALL_LOG" | tr -d ' ')"
[ "$CALLS1" = "$CALLS2" ] && ok "F-C3 run.sh 被拒后未调用任何 DSH" || bad "F-C3 run.sh 仍在被拒后调用了 DSH"
[ -e "$HOME/.dsh/.credentials.yaml" ] && [ -e "$SANDBOX/real-home/.dsh/.credentials.yaml" ] && bad "F-C3 凭据被写到真实 home" || ok "F-C3 真实 home 未被写入凭据"

# ---------------- F-C4：workdir 原子锁 ----------------
echo "-- F-C4 --workdir 原子锁 / 并发 --"
WA="$SANDBOX/w-lock"
STUB_MODE=ok STUB_SLEEP=6 bash "$HERE/run.sh" --submissions 1 --workdir "$WA" --timeout 900 > "$SANDBOX/lock-a.log" 2>&1 &
A_PID=$!
i=0
while [ "$i" -lt 20 ]; do
  [ -f "$WA/out/logs/session-s01.out" ] && break
  sleep 0.5
  i=$((i + 1))
done
INFLIGHT=0
[ -f "$WA/out/logs/session-s01.out" ] && INFLIGHT=1
[ -d "$WA/.dsh-grader.lock" ] && ok "F-C4 首次运行持有锁目录" || bad "F-C4 锁目录不存在"
STUB_MODE=ok bash "$HERE/run.sh" --submissions 1 --workdir "$WA" --timeout 900 > "$SANDBOX/lock-b.log" 2>&1
B_RC=$?
expect_rc "F-C4 并发第二次立即失败" nonzero "$B_RC"
has "已被 pid=" "$SANDBOX/lock-b.log" && ok "F-C4 失败信息给出占用者" || bad "F-C4 失败信息缺占用者"
[ "$INFLIGHT" -eq 1 ] && ok "F-C4 观测到首次运行的 in-flight 会话日志" || bad "F-C4 未观测到 in-flight 工件（时序问题）"
[ -f "$WA/out/logs/session-s01.out" ] && ok "F-C4 第二次运行未删首次 in-flight 工件" || bad "F-C4 in-flight 工件被删除"
[ -f "$WA/materials/materials-manifest.json" ] && ok "F-C4 首次物料清单未被删" || bad "F-C4 物料清单被删"
wait "$A_PID"
A_RC=$?
expect_rc "F-C4 首次运行最终成功" zero "$A_RC"
[ -d "$WA/.dsh-grader.lock" ] && bad "F-C4 退出后锁未释放" || ok "F-C4 退出后锁已释放"

# ---------------- F-C2：非 0 退出码 ----------------
echo "-- F-C2 会话非 0 退出码一律不算成功 --"
W2="$SANDBOX/w-nonzero"
STUB_MODE=nonzero_with_artifact bash "$HERE/run.sh" --submissions 1 --workdir "$W2" --timeout 900 > "$SANDBOX/nz.log" 2>&1
expect_rc "F-C2 非 0 退出码 => 非 0" nonzero $?
has "RUN_RESULT=FAIL" "$SANDBOX/nz.log" && ok "F-C2 摘要 RUN_RESULT=FAIL" || bad "F-C2 摘要未标 FAIL"
has "reason=session-nonzero-exit" "$SANDBOX/nz.log" && ok "F-C2 摘要给出原因" || bad "F-C2 摘要缺原因"
has "RUN_CHILD_EXITS=s01:rc=3/child_exit=3" "$SANDBOX/nz.log" && ok "F-C2 摘要给出子会话退出码" || bad "F-C2 摘要缺子会话退出码"
has "RUN_EXIT_CODE=1" "$SANDBOX/nz.log" && ok "F-C2 摘要给出退出码" || bad "F-C2 摘要缺退出码"
[ -f "$W2/out/grading-result.json" ] && bad "F-C2 失败运行仍写出契约产物" || ok "F-C2 失败运行未写契约产物"
[ -f "$W2/out/results/s01.json" ] && ok "F-C2 诊断产物保留（results/s01.json）" || bad "F-C2 诊断产物缺失"
has "SESSION_FAIL" "$W2/out/run.log" && ok "F-C2 运行日志含 SESSION_FAIL" || bad "F-C2 运行日志缺 SESSION_FAIL"

# ---------------- F-C5：stdout 回退 ----------------
echo "-- F-C5 stdout 回退默认关闭 --"
W3="$SANDBOX/w-stdout"
STUB_MODE=stdout_only bash "$HERE/run.sh" --submissions 1 --workdir "$W3" --timeout 900 > "$SANDBOX/so.log" 2>&1
expect_rc "F-C5 默认拒绝 stdout 回退" nonzero $?
has "EXTRACT_FALLBACK=refused" "$W3/out/logs/extract-s01.txt" && ok "F-C5 extract 日志写明 refused" || bad "F-C5 extract 日志缺 refused"
[ -f "$W3/out/grading-result.json" ] && bad "F-C5 无文件产物却写了契约产物" || ok "F-C5 无文件产物 => 无契约产物"
W4="$SANDBOX/w-stdout-explicit"
STUB_MODE=stdout_only bash "$HERE/run.sh" --submissions 1 --workdir "$W4" --timeout 900 --allow-stdout-fallback > "$SANDBOX/so2.log" 2>&1
expect_rc "F-C5 显式开关后允许回退" zero $?
has "RUN_RESULT_SOURCE=s01:stdout-fallback/explicit" "$SANDBOX/so2.log" && ok "F-C5 摘要显式标注回退来源" || bad "F-C5 摘要未标注回退来源"
has "stdout_fallback_enabled=1" "$SANDBOX/so2.log" && ok "F-C5 摘要标注开关状态" || bad "F-C5 摘要缺开关状态"

# ---------------- F-C1：隔离归因（阳性/阴性对照）----------------
echo "-- F-C1 隔离归因阳性对照（模拟未隔离写入 => 必须 FAIL；--dry-run 零模型调用）--"
for MODE in profile-dir workdir-slug content-fingerprint; do
  W="$SANDBOX/w-leak-$MODE"
  DSH_GRADER_SIMULATE_LEAK="$MODE" bash "$HERE/run.sh" --submissions 1 --workdir "$W" --timeout 900 --dry-run > "$SANDBOX/leak-$MODE.log" 2>&1
  RC=$?
  expect_rc "F-C1 模拟未隔离写入($MODE) => 非 0" nonzero "$RC"
  has "verdict=FAIL" "$W/out/isolation-report.txt" && ok "F-C1($MODE) isolation-report verdict=FAIL" || bad "F-C1($MODE) 未判 FAIL"
  if has "verdict_reasons=child-write" "$W/out/isolation-report.txt" || has "verdict_reasons=unattributed-change" "$W/out/isolation-report.txt"; then
    ok "F-C1($MODE) 归因原因写明（child-write / unattributed-change）"
  else
    bad "F-C1($MODE) 未写明归因原因: $(grep verdict_reasons "$W/out/isolation-report.txt" | head -1)"
  fi
done
echo "-- F-C1 阴性对照（不得变成「永远 FAIL」）--"
W="$SANDBOX/w-leak-host-delete"
DSH_GRADER_SIMULATE_LEAK=host-delete bash "$HERE/run.sh" --submissions 1 --workdir "$W" --timeout 900 --dry-run > "$SANDBOX/leak-host-delete.log" 2>&1
expect_rc "F-C1 宿主删除（反向对照）=> 0" zero $?
has "verdict=PASS" "$W/out/isolation-report.txt" && ok "F-C1 宿主删除判 PASS" || bad "F-C1 宿主删除被误判 FAIL"
W="$SANDBOX/w-clean"
bash "$HERE/run.sh" --submissions 1 --workdir "$W" --timeout 900 --dry-run > "$SANDBOX/clean.log" 2>&1
expect_rc "F-C1 干净 dry-run => 0" zero $?
has "verdict=PASS" "$W/out/isolation-report.txt" && ok "F-C1 干净运行判 PASS" || bad "F-C1 干净运行被误判 FAIL"

echo "-- F-C1 classify_changes.py 单元四态（含「不得无条件豁免」断言）--"
FAKE="$SANDBOX/fake-real/.dsh"
SID=11111111-1111-1111-1111-111111111111
mkdir -p "$FAKE/memories/daily" "$FAKE/cache" "$FAKE/sessions/--private-tmp-wd--/$SID"
printf 'host note\n' > "$FAKE/memories/daily/x.md"
printf 'leak %s/home\n' "$SANDBOX/w-clean/home" > "$FAKE/cache/leak.bin"
printf 'j\n' > "$FAKE/sessions/--private-tmp-wd--/$SID/session.v4.jsonl.zstd"
{
  printf '> 1 10 %s\n' "$FAKE/memories/daily/x.md"
  printf '> 2 10 %s\n' "$FAKE/cache/leak.bin"
  printf '> 3 10 %s\n' "$FAKE/sessions/--private-tmp-wd--/$SID/session.v4.jsonl.zstd"
  printf '> 4 10 %s\n' "$FAKE/memories/daily/ghost.md"
} > "$SANDBOX/fake-diff.txt"
: > "$SANDBOX/fake-control.txt"
python3 "$HERE/classify_changes.py" --changed "$SANDBOX/fake-diff.txt" --control "$SANDBOX/fake-control.txt" \
  --dsh-home "$FAKE" --child-session 22222222-2222-2222-2222-222222222222 \
  --isolated-home "$SANDBOX/w-clean/home" > "$SANDBOX/fake-classified.txt"
has "R2-CHILD-CONTENT" "$SANDBOX/fake-classified.txt" && ok "classifier 内容指纹 => CHILD" || bad "classifier 内容指纹未判 CHILD"
has "R7-UNATTRIBUTED" "$SANDBOX/fake-classified.txt" && ok "classifier 无法归因 => UNATTRIBUTED" || bad "classifier 缺失文件未判 UNATTRIBUTED"
has "R4-HOST-SESSION" "$SANDBOX/fake-classified.txt" && ok "classifier 他会话 id => HOST" || bad "classifier 他会话 id 未判 HOST"
has "R6-HOST-STORE" "$SANDBOX/fake-classified.txt" && ok "classifier 干净宿主存储 => HOST" || bad "classifier 干净宿主存储未判 HOST"
python3 - "$SANDBOX/fake-classified.txt" "$FAKE/cache/leak.bin" "$FAKE/memories/daily/ghost.md" <<'PY'
import sys
sections = {}
cur = None
for line in open(sys.argv[1], encoding='utf-8'):
    line = line.rstrip()
    if line in ('__CHILD__', '__UNATTRIBUTED__', '__OTHER__', '__HOST__', '__REASONS__', '__SUMMARY__'):
        cur = line
        sections.setdefault(cur, [])
        continue
    if cur:
        sections[cur].append(line)
leak, ghost = sys.argv[2], sys.argv[3]
problems = []
if not any(leak in l for l in sections.get('__CHILD__', [])):
    problems.append('leak path not in CHILD')
if any(leak in l for l in sections.get('__HOST__', [])):
    problems.append('leak path was exempted into HOST (blanket exemption regression)')
if not any(ghost in l for l in sections.get('__UNATTRIBUTED__', [])):
    problems.append('missing path not in UNATTRIBUTED')
print('SECTION_ASSERT=' + ('PASS' if not problems else 'FAIL ' + '; '.join(problems)))
sys.exit(1 if problems else 0)
PY
if [ $? -eq 0 ]; then ok "classifier 分段断言（子进程写入未被无条件豁免）"; else bad "classifier 分段断言失败"; fi

# ---------------- 端到端（stub 会话，零模型调用）----------------
echo "-- 端到端 stub 会话（零模型调用）--"
W5="$SANDBOX/w-e2e"
STUB_MODE=ok bash "$HERE/run.sh" --submissions 1 --workdir "$W5" --timeout 900 > "$SANDBOX/e2e.log" 2>&1
expect_rc "端到端 stub 会话 => 0" zero $?
has "RUN_RESULT=PASS" "$SANDBOX/e2e.log" && ok "端到端 RUN_RESULT=PASS" || bad "端到端未 PASS"
has "RUN_RESULT_SOURCE=s01:file/none" "$SANDBOX/e2e.log" && ok "端到端结果来源=模型自写文件" || bad "端到端结果来源异常"
python3 -c "import json; d=json.load(open('$W5/out/grading-result.json')); assert len(d['items'])==9; print('OK')" > /dev/null 2>&1 \
  && ok "端到端契约产物可 JSON.parse 且 9 项" || bad "端到端契约产物缺失/不可解析"
has "verdict=PASS" "$W5/out/isolation-report.txt" && ok "端到端隔离 verdict=PASS" || bad "端到端隔离未 PASS"

echo "SELFTEST_MODEL_CALLS=0（全部走 stub；无网络、无模型调用）"
echo "SELFTEST_STUB_CALLS=$(wc -l < "$STUB_CALL_LOG" | tr -d ' ')"
echo "SELFTEST_PASS=$PASS_N SELFTEST_FAIL=$FAIL_N"
echo "SELFTEST_SANDBOX=$SANDBOX"
if [ "$FAIL_N" -eq 0 ]; then
  echo "SELFTEST_RESULT=PASS"
  exit 0
fi
echo "SELFTEST_RESULT=FAIL"
exit 1
