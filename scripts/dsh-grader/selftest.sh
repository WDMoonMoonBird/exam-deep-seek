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
[ -f "$W2/out/results/s01.model.json" ] && ok "F-C2 诊断产物保留（results/s01.model.json，会话自述）" || bad "F-C2 诊断产物缺失"
has "SESSION_FAIL" "$W2/out/run.log" && ok "F-C2 运行日志含 SESSION_FAIL" || bad "F-C2 运行日志缺 SESSION_FAIL"

# ---------------- F-C5：stdout 回退 ----------------
echo "-- F-C5 stdout 回退默认关闭（单元级 + run.sh 级）--"
printf '{"schema_version":1,"items":[{"id":"P01","score":10,"max_score":10}],"total_score":10,"max_score":100,"submission_id":"s01"}' > "$SANDBOX/fc5-stdout.txt"
python3 "$HERE/extract_result.py" --stdout "$SANDBOX/fc5-stdout.txt" --candidate "$SANDBOX/fc5-missing.json" --out "$SANDBOX/fc5-out.json" > "$SANDBOX/fc5-a.log" 2>&1
RA=$?
if [ "$RA" -ne 0 ] && has "EXTRACT_FALLBACK=refused" "$SANDBOX/fc5-a.log"; then ok "F-C5 默认拒绝 stdout 回退（rc=${RA}）"; else bad "F-C5 默认口径变化（rc=${RA}）"; fi
python3 "$HERE/extract_result.py" --stdout "$SANDBOX/fc5-stdout.txt" --candidate "$SANDBOX/fc5-missing.json" --out "$SANDBOX/fc5-out.json" --allow-stdout-fallback > "$SANDBOX/fc5-b.log" 2>&1
RB=$?
if [ "$RB" -eq 0 ] && has "EXTRACT_FALLBACK=explicit" "$SANDBOX/fc5-b.log"; then ok "F-C5 显式开关才回退且有标记（rc=0）"; else bad "F-C5 显式回退失效（rc=${RB}）"; fi
W3="$SANDBOX/w-stdout"
STUB_MODE=stdout_only bash "$HERE/run.sh" --submissions 1 --workdir "$W3" --timeout 900 --allow-score-only > "$SANDBOX/so.log" 2>&1
RC=$?
[ "$RC" -ne 0 ] && ok "F-C5 score-only 模式下会话没写文件 ⇒ 非 0（rc=${RC}）" || bad "F-C5 score-only 无产物仍判成功"
[ -f "$W3/out/grading-result.json" ] && bad "F-C5 无文件仍写契约产物" || ok "F-C5 无文件产物 ⇒ 无契约产物"

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

echo "-- F-C2C-1 宿主会话路径 + 空 child-session ⇒ HOST（不得假 FAIL）--"
HSID_TEST="${DSH_SESSION_ID:-11111111-2222-3333-4444-555555555555}"
export DSH_SESSION_ID="$HSID_TEST"
mkdir -p "$DSH_GRADER_REAL_HOME/storages/session_projcache/sessions"
HOSTFILE="$DSH_GRADER_REAL_HOME/storages/session_projcache/sessions/$HSID_TEST.json"
printf 'seed' > "$HOSTFILE"
printf '> 1791728000 100 %s
' "$HOSTFILE" > "$SANDBOX/fc2c1-changed.txt"
: > "$SANDBOX/fc2c1-control.txt"
# (a) 宿主 id 命中 + child 空 ⇒ R4-HOST-SESSION
python3 "$HERE/classify_changes.py" --changed "$SANDBOX/fc2c1-changed.txt" --control "$SANDBOX/fc2c1-control.txt" \
  --host-session "$HSID_TEST" --child-session '' --dsh-home "$DSH_GRADER_REAL_HOME" > "$SANDBOX/fc2c1-a.txt" 2>&1
has "R4-HOST-SESSION" "$SANDBOX/fc2c1-a.txt" && ok "F-C2C-1(a) 宿主会话 id + child 空 ⇒ R4-HOST-SESSION" || bad "F-C2C-1(a) 未判 HOST：$(grep RULE "$SANDBOX/fc2c1-a.txt" | head -1)"
has "child=0 unattributed=0 other=0 host=1" "$SANDBOX/fc2c1-a.txt" && ok "F-C2C-1(a) 落在 __HOST__ 段（非 __UNATTRIBUTED__）" || bad "F-C2C-1(a) 段归属错误"
# (b) 未知 id + child 空 ⇒ 仍 UNATTRIBUTED（fail-closed 不许放宽）
python3 "$HERE/classify_changes.py" --changed "$SANDBOX/fc2c1-changed.txt" --control "$SANDBOX/fc2c1-control.txt" \
  --host-session 00000000-0000-0000-0000-000000000000 --child-session '' --dsh-home "$DSH_GRADER_REAL_HOME" > "$SANDBOX/fc2c1-b.txt" 2>&1
has "R7-UNATTRIBUTED" "$SANDBOX/fc2c1-b.txt" && ok "F-C2C-1(b) 未知会话 id + child 空 ⇒ 仍 UNATTRIBUTED（fail-closed）" || bad "F-C2C-1(b) fail-closed 被放宽"
# (c) child 非空且 id != child ⇒ HOST（原行为不变）
python3 "$HERE/classify_changes.py" --changed "$SANDBOX/fc2c1-changed.txt" --control "$SANDBOX/fc2c1-control.txt" \
  --host-session '' --child-session 99999999-0000-0000-0000-000000000000 --dsh-home "$DSH_GRADER_REAL_HOME" > "$SANDBOX/fc2c1-c.txt" 2>&1
has "R4-HOST-SESSION" "$SANDBOX/fc2c1-c.txt" && ok "F-C2C-1(c) child 已给出且 id≠child ⇒ HOST" || bad "F-C2C-1(c) 行为退化"
# (d) 端到端：stub 运行窗口内宿主会话文件被改 ⇒ changed_unattributed 必须为 0 且不假 FAIL
WH="$SANDBOX/w-host-session"
STUB_MODE=ok STUB_SLEEP=3 bash "$HERE/run.sh" --submissions 1 --workdir "$WH" --timeout 900 > "$SANDBOX/hostsess.log" 2>&1 &
HPID=$!
i=0
while [ "$i" -lt 80 ]; do
  [ -f "$WH/out/logs/dsh-home-control.txt" ] && break
  sleep 0.25
  i=$((i + 1))
done
printf 'mutated-during-run' >> "$HOSTFILE"
wait "$HPID"
HRC=$?
UN="$(grep -oE 'changed_unattributed=[0-9]+' "$WH/out/isolation-report.txt" | head -1)"
HN="$(grep -oE 'changed_host=[0-9]+' "$WH/out/isolation-report.txt" | head -1)"
TN="$(grep -oE 'changed_total=[0-9]+' "$WH/out/isolation-report.txt" | head -1)"
if [ "$HRC" -eq 0 ] && has "RUN_RESULT=PASS" "$SANDBOX/hostsess.log" && [ "$UN" = "changed_unattributed=0" ] && [ "$HN" != "changed_host=0" ] && [ "$TN" != "changed_total=0" ]; then
  ok "F-C2C-1(d) 端到端：窗口内宿主会话写入被归因（$TN $HN ${UN}；rc=0，无假 FAIL）"
else
  bad "F-C2C-1(d) 端到端仍假 FAIL（rc=$HRC $TN $HN ${UN}）"
fi

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
has "RUN_RESULT_SOURCE=s01:checker-result/1" "$SANDBOX/e2e.log" && ok "端到端结果来源=确定性执行器（checker-result/1）" || bad "端到端结果来源异常"
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); c=json.load(open(sys.argv[2])); assert len(d['items'])==len(c['predicates']); print('OK')" "$W5/out/grading-result.json" "$W5/out/checker/checker.json" > /dev/null 2>&1 \
  && ok "端到端契约产物可 JSON.parse 且条目数与 checker 谓词数一致" || bad "端到端契约产物缺失/不可解析"
has "verdict=PASS" "$W5/out/isolation-report.txt" && ok "端到端隔离 verdict=PASS" || bad "端到端隔离未 PASS"

echo "-- R3-B2 C8 可量性探针 --"
C8N="$SANDBOX/w-c8-neg"
STUB_MODE=unmeasurable bash "$HERE/run.sh" --submissions 1 --workdir "$C8N" --timeout 900 > "$SANDBOX/c8-neg.log" 2>&1
RC8=$?
if [ "$RC8" -eq 5 ] && [ ! -f "$C8N/out/grading-result.json" ] && grep -qE "all_unmeasurable|not_measurable|INPUT_PROBLEM" "$C8N/out/diagnostics/shape-checks.json"; then
  ok "C8 反例：project_root_glob=**/UserManagement* ⇒ 判不合格（exit 5 + 诊断 + 无契约产物）"
else
  bad "C8 反例未被拦住（rc=${RC8}）"
fi
C8R="$SANDBOX/w-c8-rebuild"
STUB_COUNTER="$SANDBOX/c8-counter.txt" STUB_MODE=half-c8 bash "$HERE/run.sh" --submissions 1 --workdir "$C8R" --timeout 900 --max-rebuild 1 > "$SANDBOX/c8-rebuild.log" 2>&1
RC8R=$?
if [ "$RC8R" -eq 0 ] && has "REBUILDS=1" "$SANDBOX/c8-rebuild.log" && grep -qE "all_unmeasurable|not_measurable" "$C8R/out/logs/prompt-s01.txt"; then
  ok "C8 触发重造：首版不可量 ⇒ 附 VIOLATION 重造 ⇒ 第二版通过（REBUILDS=1）"
else
  bad "C8 重造链路异常（rc=${RC8R}）"
fi
if [ -f "$C8R/out/grading-result.json" ]; then ok "C8 重造后契约产物产出"; else bad "C8 重造后无契约产物"; fi

echo "-- R3-B 造尺侧：E-A..E-E + 闸反例 + 重造 --"
if [ -f "$SANDBOX/r3/e2e/e-b-readdir.log" ]; then ok "R3 E-B readdir 扰动已执行"; fi
REPO="$(cd "$HERE/../.." && pwd)"
R3W="$SANDBOX/r3"
mkdir -p "$R3W"
bash "$HERE/e2e_shape.sh" --workdir "$R3W" --repo "$REPO" > "$SANDBOX/r3-e2e.log" 2>&1
R3RC=$?
grep -E '^E_' "$SANDBOX/r3-e2e.log" | head -10
if [ "$R3RC" -eq 0 ] && has "E2E_RESULT=PASS" "$SANDBOX/r3-e2e.log"; then ok "R3 E-A..E-E 全绿（e2e_shape.sh exit 0）"; else bad "R3 E-A..E-E 有失败（rc=${R3RC}）"; fi
for m in field-max t1 dangling bad-id exec; do
  W="$SANDBOX/w-gate-$m"
  STUB_MODE=$m bash "$HERE/run.sh" --submissions 1 --workdir "$W" --timeout 900 > "$SANDBOX/gate-$m.log" 2>&1
  RC=$?
  if [ "$RC" -eq 5 ] && [ ! -f "$W/out/grading-result.json" ] && [ -f "$W/out/diagnostics/shape-checks.json" ]; then
    ok "R3 闸反例($m)：exit 5 + 不写契约产物 + 诊断归档"
  else
    bad "R3 闸反例($m)：rc=${RC}（期望 5）或缺诊断"
  fi
done
R3B="$SANDBOX/r3-rebuild"
STUB_COUNTER="$SANDBOX/r3-counter.txt" STUB_MODE=half bash "$HERE/run.sh" --submissions 1 --workdir "$R3B" --timeout 900 --max-rebuild 1 > "$SANDBOX/r3-rebuild.log" 2>&1
RCB=$?
if [ "$RCB" -eq 0 ] && has "REBUILDS=1" "$SANDBOX/r3-rebuild.log" && has "重造提示" "$R3B/out/logs/prompt-s01.txt"; then
  ok "R3 重造：首次不合格 → 附 VIOLATION 原文重造 → 第二次通过（REBUILDS=1）"
else
  bad "R3 重造链路异常（rc=${RCB}）"
fi
if [ "$RCB" -eq 0 ] && has "RUN_MEASURE_CANONICAL=" "$SANDBOX/r3-rebuild.log" && [ -f "$R3B/out/grading-result.json" ]; then
  ok "R3 量尺产物 canonical 与平台投影均已落盘"
else
  bad "R3 量尺产物缺失"
fi

echo "-- R3-B2 C8 多提交语义（gate 级；非 strict 部分不可量不判整作业失败）--"
C8G="$SANDBOX/c8-gate"
mkdir -p "$C8G"
cp -R "$R3W/materials" "$C8G/materials" 2> /dev/null || true
chmod -R u+w "$C8G/materials" 2> /dev/null || true
mkdir -p "$C8G/materials/submissions/s02"
python3 "$HERE/stub_build.py" --workdir "$C8G" --slug s01 --mode ok > /dev/null 2>&1
bash "$HERE/shape_gate.sh" --workdir "$C8G" --slug s01 > "$SANDBOX/c8-gate.log" 2>&1
G1=$?
if [ "$G1" -eq 0 ] && has "MEASURABLE=1 UNMEASURABLE=1" "$SANDBOX/c8-gate.log" && has "SHAPE_C8=PASS" "$SANDBOX/c8-gate.log"; then
  ok "C8 部分不可量：非 strict 判 PASS 且摘要计数可见（MEASURABLE=1 UNMEASURABLE=1）"
else
  bad "C8 部分不可量语义异常（gate rc=${G1}）"
fi
if has "UNMEASURABLE s02" "$SANDBOX/c8-gate.log" && [ -f "$C8G/out/diagnostics/measurable.json" ]; then
  ok "C8 逐份标记 UNMEASURABLE（out/diagnostics/measurable.json）"
else
  bad "C8 未逐份标记"
fi
bash "$HERE/shape_gate.sh" --workdir "$C8G" --slug s01 --strict > "$SANDBOX/c8-strict.log" 2>&1
G2=$?
if [ "$G2" -eq 1 ] && has "STRICT_FAIL" "$SANDBOX/c8-strict.log" && has "C8_PARTIAL_STRICT" "$SANDBOX/c8-strict.log"; then
  ok "C8 部分不可量 + --strict ⇒ 退出码 1（不判整作业不合格）"
else
  bad "C8 --strict 语义异常（gate rc=${G2}）"
fi
C8A="$SANDBOX/c8-all"
mkdir -p "$C8A"
cp -R "$C8G/materials" "$C8A/materials" 2> /dev/null || true
chmod -R u+w "$C8A/materials" 2> /dev/null || true
rm -rf "$C8A/materials/submissions/s01" "$C8A/materials/submissions/s02"
mkdir -p "$C8A/materials/submissions/s01" "$C8A/materials/submissions/s02"
python3 "$HERE/stub_build.py" --workdir "$C8A" --slug s01 --mode ok > /dev/null 2>&1
bash "$HERE/shape_gate.sh" --workdir "$C8A" --slug s01 > "$SANDBOX/c8-all.log" 2>&1
G3=$?
if [ "$G3" -eq 5 ] && has "all_unmeasurable" "$SANDBOX/c8-all.log"; then
  ok "C8 全员不可量 ⇒ 判不合格（exit 5，触发重造语义）"
else
  bad "C8 全员不可量未被判不合格（gate rc=${G3}）"
fi


echo "-- R3.5-B 作业级流程（build-and-measure / measure-only-reuse / E-F / 篡改 / E-G g3）--"
R35="$SANDBOX/r35"
mkdir -p "$R35"
STUB_MODE=ok bash "$HERE/run.sh" --checker-mode build-and-measure --submissions 2 --workdir "$R35" --timeout 900 > "$SANDBOX/r35-p1.log" 2>&1
R35A=$?
if [ "$R35A" -eq 0 ] && has "ASSIGNMENT_RESULT=PASS N=2 MEASURED=2 FAILED=0 UNMEASURABLE=0" "$SANDBOX/r35-p1.log" && has "MODEL_CALLS=1 MEASURE_CALLS=0" "$SANDBOX/r35-p1.log"; then
  ok "R3.5-B S1–S6：一次造尺 + 2 份量尺（MODEL_CALLS=1 MEASURE_CALLS=0）"
else
  bad "R3.5-B 作业级流程异常（rc=${R35A}）"
fi
if [ -f "$R35/out/assignment/assignment-manifest.json" ] && [ -f "$R35/out/assignment/comparability.json" ] && [ -f "$R35/out/assignment/reconciliation.json" ] && [ -f "$R35/out/grading-results.json" ]; then
  ok "R3.5-B 作业级产物齐备（manifest / comparability / reconciliation / grading-results）"
else
  bad "R3.5-B 作业级产物缺失"
fi
PROMPT_N="$(grep -c 'model.json' "$R35/out/logs/prompt-build.txt" 2> /dev/null || true)"
if [ "$PROMPT_N" = "0" ]; then
  ok "R3.5-B S1：造尺 prompt 不含学生提交（无 model.json 自述要求）"
else
  bad "R3.5-B S1：造尺 prompt 仍含学生提交内容"
fi
python3 - "$R35/out/assignment/comparability.json" > "$SANDBOX/r35-d1.txt" <<'PY'
import json, sys
print(json.dumps(json.load(open(sys.argv[1], encoding="utf-8"))["digests"], sort_keys=True))
PY
STUB_MODE=ok bash "$HERE/run.sh" --checker-mode measure-only-reuse --submissions 2 --workdir "$R35" --timeout 900 > "$SANDBOX/r35-p2.log" 2>&1
R35B=$?
python3 - "$R35/out/assignment/comparability.json" > "$SANDBOX/r35-d2.txt" <<'PY'
import json, sys
print(json.dumps(json.load(open(sys.argv[1], encoding="utf-8"))["digests"], sort_keys=True))
PY
if [ "$R35B" -eq 0 ] && has "MODEL_CALLS=0" "$SANDBOX/r35-p2.log" && diff -q "$SANDBOX/r35-d1.txt" "$SANDBOX/r35-d2.txt" > /dev/null 2>&1; then
  ok "R3.5-B E-F：第二遍零模型调用且逐份 canonical 与第一遍一致"
else
  bad "R3.5-B E-F 异常（rc=${R35B}）"
fi
R35T="$SANDBOX/r35-tamper"
cp -R "$R35" "$R35T" 2> /dev/null || true
chmod -R u+w "$R35T" 2> /dev/null || true
printf ' ' >> "$R35T/out/assignment/checker.frozen.json"
STUB_MODE=ok bash "$HERE/run.sh" --checker-mode measure-only-reuse --submissions 2 --workdir "$R35T" --timeout 900 > "$SANDBOX/r35-tamper.log" 2>&1
if [ $? -eq 3 ] && has "frozen-tampered" "$SANDBOX/r35-tamper.log"; then
  ok "R3.5-B S3：篡改 frozen ⇒ exit 3（拒绝量尺）"
else
  bad "R3.5-B S3：篡改未被拦（期望 exit 3）"
fi
R35G="$SANDBOX/r35-g3"
mkdir -p "$R35G"
STUB_MODE=partial-unmeasurable bash "$HERE/run.sh" --checker-mode build-and-measure --submissions 2 --workdir "$R35G" --timeout 900 > "$SANDBOX/r35-g3.log" 2>&1
if [ $? -eq 0 ] && has "ASSIGNMENT_RESULT=PARTIAL N=2 MEASURED=1 FAILED=0 UNMEASURABLE=1" "$SANDBOX/r35-g3.log"; then
  ok "R3.5-B E-G g3：部分不可量 ⇒ PARTIAL + UNMEASURABLE=1（rc=0）"
else
  bad "R3.5-B E-G g3 语义异常"
fi
R35S="$SANDBOX/r35-g3s"
mkdir -p "$R35S"
STUB_MODE=partial-unmeasurable bash "$HERE/run.sh" --checker-mode build-and-measure --submissions 2 --workdir "$R35S" --timeout 900 --strict > "$SANDBOX/r35-g3s.log" 2>&1
if [ $? -eq 1 ] && has "SHAPE_GATE=STRICT_FAIL" "$SANDBOX/r35-g3s.log"; then
  ok "R3.5-B E-G g3+--strict：部分不可量 ⇒ exit 1"
else
  bad "R3.5-B E-G g3+--strict 语义异常"
fi

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
