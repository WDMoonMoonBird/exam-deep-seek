#!/usr/bin/env bash
# scripts/dsh-checker/selftest.sh —— R1-B 确定性执行器自测（E1..E6 + 纯函数断言）
# 零模型调用、零网络：只调用 check.py / repro.sh（纯 stdlib）。全部通过退出 0。
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SB="$(mktemp -d /tmp/dsh-checker-selftest.XXXXXX)"
C="$HERE/fixtures/checker.json"
S="$HERE/fixtures/submission"
PASS_N=0
FAIL_N=0
ok()  { echo "PASS $*"; PASS_N=$((PASS_N + 1)); }
bad() { echo "FAIL $*"; FAIL_N=$((FAIL_N + 1)); }
jget() { python3 - "$1" "$2" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
cur = d
for part in sys.argv[2].split('.'):
    if part.endswith(']'):
        k, _, idx = part.partition('[')
        cur = cur[k][int(idx[:-1])]
    elif part.isdigit():
        cur = cur[int(part)]
    else:
        cur = cur[part]
print(json.dumps(cur, ensure_ascii=False) if not isinstance(cur, (str, int, float)) or isinstance(cur, bool) else cur)
PY
}
has() { grep -q "$1" "$2" 2> /dev/null; }

echo "== dsh-checker selftest =="
echo "sandbox=$SB"

# ---------------- E1 位级复现 ----------------
echo "-- E1 同 checker × 同提交 × 5 次独立复算 --"
bash "$HERE/repro.sh" --checker "$C" --submission "$S" --times 5 --submission-id s01 --out "$SB/e1" > "$SB/e1.log" 2>&1
[ $? -eq 0 ] && ok "E1 五次复算 exit 0" || bad "E1 五次复算非 0：$(tail -1 "$SB/e1.log")"
D="$(jget "$SB/e1/repro-report.json" distinct_count)"
[ "$D" = "1" ] && ok "E1 distinct_canonical=1（位级一致）" || bad "E1 distinct_canonical=$D"
[ "$(jget "$SB/e1/repro-report.json" determinism)" = "PASS" ] && ok "E1 determinism=PASS" || bad "E1 determinism≠PASS"
bash "$HERE/repro.sh" --checker "$C" --submission "$S" --times 3 --submission-id s01 --out "$SB/e1b" > "$SB/e1b.log" 2>&1
RC=$?
[ "$RC" -ne 0 ] && ok "E1 N=3 < 5 ⇒ 直接 FAIL（exit ${RC}）" || bad "E1 N=3 竟通过"
[ "$(jget "$SB/e1b/repro-report.json" reason)" = "times_below_min" ] && ok "E1 N<5 reason=times_below_min" || bad "E1 N<5 reason 缺失"

# ---------------- E2 环境扰动 ----------------
echo "-- E2 路径含空格/中文 + CWD + LC_ALL + TZ + PYTHONHASHSEED + mtime 全改 --"
bash "$HERE/repro.sh" --checker "$C" --submission "$S" --times 5 --perturb all --submission-id s01 --out "$SB/e2" > "$SB/e2.log" 2>&1
[ $? -eq 0 ] && ok "E2 扰动后仍 exit 0" || bad "E2 扰动后非 0：$(tail -1 "$SB/e2.log")"
[ "$(jget "$SB/e2/repro-report.json" distinct_count)" = "1" ] && ok "E2 逐位一致（distinct=1）" || bad "E2 distinct≠1"
[ "$(jget "$SB/e2/repro-report.json" absolute_path_leaks)" = "0" ] && ok "E2 输出无绝对路径（leaks=0）" || bad "E2 输出含绝对路径"

# ---------------- E3 阴性对照（证伪力）----------------
echo "-- E3 四种毒化必须被判不一致 --"
E3_OK=1
for p in timestamp mtime readdir hashseed; do
  bash "$HERE/repro.sh" --checker "$C" --submission "$S" --times 6 --perturb all --submission-id s01 --poison "$p" --out "$SB/e3-$p" > "$SB/e3-$p.log" 2>&1
  RC=$?
  DET="$(jget "$SB/e3-$p/repro-report.json" poison_detected)"
  FP="$(jget "$SB/e3-$p/repro-report.json" falsification_power)"
  if [ "$RC" -eq 0 ] && [ "$DET" = "true" ]; then
    ok "E3 poison=$p 被判不一致（distinct=$(jget "$SB/e3-$p/repro-report.json" distinct_count)、falsification_power=${FP}）"
  else
    bad "E3 poison=$p 未被判不一致（detected=$DET rc=${RC}）"
    E3_OK=0
  fi
done
[ "$E3_OK" = "1" ] && ok "E3 falsification_power=PASS（四种毒化全部抓出）" || bad "E3 falsification_power=INSUFFICIENT ⇒ 整体 FAIL"
echo "-- E3 §3.3 伪造一致/伪造不一致 --"
python3 - "$SB" "$HERE" <<'PY'
import json, os, subprocess, sys
sb, here = sys.argv[1], sys.argv[2]
sys.path.insert(0, here)
import check as CK
runs = sorted([d for d in os.listdir(sb + '/e1') if d.startswith('run')])
a = json.load(open(sb + '/e1/' + runs[0] + '/result.json', encoding='utf-8'))
b = json.load(open(sb + '/e1/' + runs[1] + '/result.json', encoding='utf-8'))
b2 = json.loads(json.dumps(b))
b2['run_meta']['elapsed_ms'] = 999999
b2['run_meta']['poison'] = 'tampered'
same = CK.canon_sha256(a) == CK.canon_sha256({k: v for k, v in b2.items() if k != 'canonical_sha256'})
print('FORGERY_RUN_META_IGNORED=' + ('yes' if same else 'no'))
c = json.loads(json.dumps(b))
c['items'][0]['score'] = c['items'][0]['score'] + 1
diff = CK.canon_sha256(a) != CK.canon_sha256({k: v for k, v in c.items() if k != 'canonical_sha256'})
print('FORGERY_SCORE_DETECTED=' + ('yes' if diff else 'no'))
PY
tail -2 "$SB/e1.log" > /dev/null
F1="$(python3 - "$SB" "$HERE" <<'PY'
import json, os, sys
sb, here = sys.argv[1], sys.argv[2]
sys.path.insert(0, here)
import check as CK
runs = sorted([d for d in os.listdir(sb + '/e1') if d.startswith('run')])
a = json.load(open(sb + '/e1/' + runs[0] + '/result.json', encoding='utf-8'))
b = json.loads(json.dumps(json.load(open(sb + '/e1/' + runs[1] + '/result.json', encoding='utf-8'))))
b['run_meta'] = {'tool': 'x', 'elapsed_ms': 1234, 'poison': 'x'}
print('yes' if CK.canon_sha256(a) == CK.canon_sha256(b) else 'no')
PY
)"
[ "$F1" = "yes" ] && ok "E3 伪造一致：只改 run_meta ⇒ 仍判一致（run_meta 被正确排除）" || bad "E3 run_meta 未被排除"
F2="$(python3 - "$SB" "$HERE" <<'PY'
import json, os, sys
sb, here = sys.argv[1], sys.argv[2]
sys.path.insert(0, here)
import check as CK
runs = sorted([d for d in os.listdir(sb + '/e1') if d.startswith('run')])
a = json.load(open(sb + '/e1/' + runs[0] + '/result.json', encoding='utf-8'))
b = json.loads(json.dumps(json.load(open(sb + '/e1/' + runs[1] + '/result.json', encoding='utf-8'))))
b['items'][0]['score'] = b['items'][0]['score'] + 1
print('yes' if CK.canon_sha256(a) != CK.canon_sha256(b) else 'no')
PY
)"
[ "$F2" = "yes" ] && ok "E3 伪造不一致：改 items[].score ⇒ 判不一致" || bad "E3 分数改动未被检出"

# ---------------- E4 换尺子 ----------------
echo "-- E4 换尺子检测（stale + exit 4；只改 generated 不变）--"
cp "$HERE/fixtures/rubric.md" "$SB/rubric.md"; printf 'X' >> "$SB/rubric.md"
python3 "$HERE/check.py" --checker "$C" --submission "$S" --rubric "$SB/rubric.md" --standard "$HERE/fixtures/standard" --out "$SB/e4-rubric.json" > "$SB/e4-rubric.log" 2>&1
RC=$?
[ "$RC" -eq 4 ] && ok "E4 rubric 改一字节 ⇒ exit 4" || bad "E4 rubric 改动后 exit=${RC}（期望 4）"
[ "$(jget "$SB/e4-rubric.json" stale)" = "true" ] && ok "E4 stale=true" || bad "E4 stale≠true"
has "rubric_hash_mismatch" "$SB/e4-rubric.log" && ok "E4 reason=rubric_hash_mismatch" || bad "E4 reason 缺失"
[ "$(jget "$SB/e4-rubric.json" totals.score)" = "null" ] && ok "E4 stale 时不给分（score=null）" || bad "E4 stale 仍给分"
cp -R "$HERE/fixtures/standard" "$SB/standard-mod"
printf 'X' >> "$SB/standard-mod/UserManagement/src/main.js"
python3 "$HERE/check.py" --checker "$C" --submission "$S" --rubric "$HERE/fixtures/rubric.md" --standard "$SB/standard-mod" --out "$SB/e4-std.json" > "$SB/e4-std.log" 2>&1
RC=$?
[ "$RC" -eq 4 ] && ok "E4 标准包改一字节 ⇒ exit 4" || bad "E4 标准包改动后 exit=${RC}（期望 4）"
has "standard_hash_mismatch" "$SB/e4-std.log" && ok "E4 reason=standard_hash_mismatch" || bad "E4 标准包 reason 缺失"
python3 - "$C" "$SB/checker.gen.json" <<'PY'
import json, sys
sys.path.insert(0, sys.argv[1].rsplit('/', 2)[0])
import validate as V
src = json.load(open(sys.argv[1], encoding='utf-8'))
mut = {}
for k in reversed(list(src.keys())):        # 1) 调换键顺序
    mut[k] = src[k]
mut['generated'] = dict(src['generated'])
mut['generated']['session_id'] = 'another-session-9999'   # 2) 只改 generated
mut['generated']['created_at'] = '2030-01-01T00:00:00+08:00'
mut['generated']['model'] = 'another-model'
mut['_note'] = '这是一条注释键'                            # 3) 加 _note
mut['checker_id'] = V.checker_id_of(mut)
json.dump(mut, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
PY
ID1="$(python3 -c "import json;print(json.load(open('$C',encoding='utf-8'))['checker_id'])")"
ID2="$(python3 -c "import json;print(json.load(open('$SB/checker.gen.json',encoding='utf-8'))['checker_id'])")"
[ "$ID1" = "$ID2" ] && ok "E4 只改 generated/键序/_note ⇒ checker_id 不变" || bad "E4 checker_id 变了（$ID1 vs ${ID2}）"
python3 "$HERE/check.py" --checker "$SB/checker.gen.json" --submission "$S" --out "$SB/e4-gen.json" > /dev/null 2>&1
C1="$(python3 -c "import json;print(json.load(open('$SB/e4-rubric.json',encoding='utf-8'))['checker_id'])" 2>/dev/null)"
CA="$(python3 "$HERE/check.py" --checker "$C" --submission "$S" --canonical 2>/dev/null | tail -1)"
CB="$(python3 "$HERE/check.py" --checker "$SB/checker.gen.json" --submission "$S" --canonical 2>/dev/null | tail -1)"
[ "$CA" = "$CB" ] && ok "E4 只改 generated ⇒ 复算结果 canonical 不变" || bad "E4 generated 改动影响了结果"

# ---------------- E5 注入集全量 ----------------
echo "-- E5 注入集全量（63 zip / 52 唯一摘要）+ 可比性产物 --"
INJ="$REPO/实验/注入测试集"
if [ -d "$INJ" ]; then
  bash "$HERE/repro.sh" --checker "$C" --submission "$S" --times 1 --submission-id s01 --out "$SB/e5-trivial" > /dev/null 2>&1
  python3 "$HERE/check.py" --checker "$C" --batch "$INJ" --dedup none --out "$SB/e5-all" > "$SB/e5-all.log" 2>&1
  RC=$?
  [ "$RC" -eq 0 ] && ok "E5 全量批跑 exit 0" || bad "E5 全量批跑 exit=${RC}：$(tail -2 "$SB/e5-all.log")"
  has "BATCH_OK" "$SB/e5-all.log" && ok "E5 BATCH_OK：$(grep -oE 'zips=[0-9]+ unique=[0-9]+ evaluated=[0-9]+ skipped=[0-9]+' "$SB/e5-all.log" | head -1)" || bad "E5 缺 BATCH_OK"
  Z="$(jget "$SB/e5-all/comparability.json" zips_total)"; U="$(jget "$SB/e5-all/comparability.json" unique_digests)"
  [ "$Z" = "63" ] && ok "E5 zips_total=63" || bad "E5 zips_total=${Z}（期望 63）"
  [ "$U" = "52" ] && ok "E5 unique_digests=52" || bad "E5 unique_digests=${U}（期望 52）"
  [ "$(jget "$SB/e5-all/comparability.json" cross_group)" = "not_comparable" ] && ok "E5 cross_group=not_comparable" || bad "E5 cross_group 缺失"
  python3 "$HERE/check.py" --checker "$C" --batch "$INJ" --dedup digest --out "$SB/e5-dedup" > "$SB/e5-dedup.log" 2>&1
  has "BATCH_OK" "$SB/e5-dedup.log" && ok "E5 dedup=digest：$(grep -oE 'zips=[0-9]+ unique=[0-9]+ evaluated=[0-9]+ skipped=[0-9]+' "$SB/e5-dedup.log" | head -1)" || bad "E5 dedup 跑失败"
  [ "$(jget "$SB/e5-dedup/comparability.json" evaluated)" = "52" ] && ok "E5 去重口径：evaluated=52（跳过重复 11 份）" || bad "E5 去重 evaluated≠52"
  SAMPLE_OK=1
  python3 - "$SB/e5-all/batch-index.json" <<'PY' > "$SB/e5-sample.txt"
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
for r in d['results'][:5]:
    print(r['zip'])
PY
  while IFS= read -r zipname; do
    [ -n "$zipname" ] || continue
    python3 "$HERE/check.py" --checker "$C" --batch "$INJ" --out "$SB/e5-nope" > /dev/null 2>&1
    break
  done < "$SB/e5-sample.txt"
  for zipname in $(head -5 "$SB/e5-sample.txt"); do
    :
  done
  # 抽样 5 份 × 5 次：用 repro.sh 对同一份解压目录反复复算
  SAMPLE_DIR="$SB/e5-sample-unzip"
  mkdir -p "$SAMPLE_DIR"
  python3 - "$INJ" "$SB/e5-sample.txt" "$SAMPLE_DIR" <<'PY'
import json, os, shutil, sys, zipfile
inj, listfile, dest = sys.argv[1], sys.argv[2], sys.argv[3]
names = [x.strip() for x in open(listfile, encoding='utf-8') if x.strip()]
for i, n in enumerate(names):
    z = zipfile.ZipFile(os.path.join(inj, n))
    d = os.path.join(dest, 'z%d' % i)
    for info in z.infolist():
        raw = info.filename
        name = raw if (info.flag_bits & 0x800) else raw.encode('cp437', 'ignore').decode('utf-8', 'ignore')
        if name.startswith('/') or '..' in name.split('/'):
            continue
        t = os.path.join(d, *[p for p in name.split('/') if p not in ('', '.')])
        if info.is_dir() or raw.endswith('/'):
            os.makedirs(t, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(t), exist_ok=True)
        with z.open(info) as src, open(t, 'wb') as out:
            shutil.copyfileobj(src, out)
PY
  for i in 0 1 2 3 4; do
    [ -d "$SAMPLE_DIR/z$i" ] || continue
    bash "$HERE/repro.sh" --checker "$C" --submission "$SAMPLE_DIR/z$i" --times 5 --submission-id "sample$i" --out "$SB/e5-rep$i" > /dev/null 2>&1
    DD="$(jget "$SB/e5-rep$i/repro-report.json" distinct_count)"
    [ "$DD" = "1" ] || SAMPLE_OK=0
  done
  [ "$SAMPLE_OK" = "1" ] && ok "E5 抽样 5 份 × 5 次位级一致" || bad "E5 抽样复算不一致"
else
  bad "E5 注入集目录不存在：$INJ"
fi

# ---------------- E6 边界 ----------------
echo "-- E6 边界六例（确定性 status，无崩溃）--"
mk() { mkdir -p "$1"; }
B="$SB/e6"
mk "$B/empty"
mk "$B/only-node_modules/UserManagement/node_modules/x"
printf '{"name":"n"}' > "$B/only-node_modules/UserManagement/node_modules/x/package.json"
DEEP="$B/deep/UserManagement"
p="$DEEP"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do p="$p/d"; done
mk "$p"; printf '{"name":"deep"}' > "$p/package.json"
mk "$B/non-utf8/UserManagement"
printf '{\xff\xfe\x00\x01binary' > "$B/non-utf8/UserManagement/package.json"
python3 - "$B/non-utf8/UserManagement/src" <<'PY'
import os, sys
os.makedirs(sys.argv[1], exist_ok=True)
open(os.path.join(sys.argv[1], 'main.js'), 'wb').write(b'const x = "' + bytes([0xff, 0xfe, 0x80]) + b'";')
PY
mk "$B/symlink/UserManagement/src"
ln -sf /etc/hosts "$B/symlink/UserManagement/src/main.js"
ln -sf ../loop-b "$B/symlink/UserManagement/src/loop-a"; ln -sf ../loop-a "$B/symlink/UserManagement/src/loop-b"
printf '{"name":"sym"}' > "$B/symlink/UserManagement/package.json"
mk "$B/case/UserManagement/src/views"
printf '{"name":"case"}' > "$B/case/UserManagement/package.json"
printf '<template>a</template>' > "$B/case/UserManagement/src/views/Login.vue"
printf '<template>b</template>' > "$B/case/UserManagement/src/views/login.vue" 2> /dev/null || true
E6_OK=1
for case in empty only-node_modules deep non-utf8 symlink case; do
  ROOT="$B/$case"
  O1="$SB/e6-$case-1.json"; O2="$SB/e6-$case-2.json"
  python3 "$HERE/check.py" --checker "$C" --submission "$ROOT" --out "$O1" --canonical > "$SB/e6-$case-1.log" 2>&1
  R1=$?
  python3 "$HERE/check.py" --checker "$C" --submission "$ROOT" --out "$O2" --canonical > "$SB/e6-$case-2.log" 2>&1
  R2=$?
  if grep -qi "traceback" "$SB/e6-$case-1.log"; then bad "E6 $case 崩溃（Traceback）"; E6_OK=0; continue; fi
  if [ "$R1" != "$R2" ]; then bad "E6 $case 两次退出码不同（$R1 vs ${R2}）"; E6_OK=0; continue; fi
  if [ -f "$O1" ] && [ -f "$O2" ]; then
    C1="$(python3 -c "import json;print(json.load(open('$O1',encoding='utf-8'))['canonical_sha256'])" 2>/dev/null)"
    C2="$(python3 -c "import json;print(json.load(open('$O2',encoding='utf-8'))['canonical_sha256'])" 2>/dev/null)"
    if [ "$C1" != "$C2" ]; then bad "E6 $case canonical 不确定"; E6_OK=0; continue; fi
  fi
  ST="$(grep -oE 'INPUT_PROBLEM [a-z_]+' "$SB/e6-$case-1.log" | head -1)"
  ok "E6 $case 确定性 rc=$R1 $ST"
done
[ "$E6_OK" = "1" ] && ok "E6 六例全部确定性、无崩溃" || bad "E6 存在不确定/崩溃用例"

# ---------------- 纯函数断言 ----------------
echo "-- 纯函数约束运行时断言 --"
for k in network subprocess time random env; do
  OUTP="$(python3 "$HERE/check.py" --purity-probe "$k" 2>&1)"
  RC=$?
  if [ "$RC" -eq 0 ] && echo "$OUTP" | grep -q "PURITY_PROBE=$k TRIGGERED"; then
    ok "purity-probe $k 触发（$(echo "$OUTP" | grep VIOLATION | head -1 | cut -c1-60)）"
  else
    bad "purity-probe $k 未触发（rc=${RC}）"
  fi
done
PV="$(python3 "$HERE/check.py" --checker "$C" --submission "$S" 2>&1 | grep -oE 'PURITY_VIOLATIONS=[0-9]+' | head -1)"
[ "$PV" = "PURITY_VIOLATIONS=0" ] && ok "真实评估期间零违规（${PV}）" || bad "真实评估期间出现违规（${PV}）"

# ---------------- 退出码 ----------------
echo "-- 退出码 3 / 6 --"
python3 "$HERE/check.py" --checker "$HERE/fixtures/checker.invalid.json" --submission "$S" > "$SB/rc3.log" 2>&1
[ $? -eq 3 ] && ok "非法 checker ⇒ exit 3" || bad "非法 checker 退出码不是 3"
python3 "$HERE/check.py" --checker "$HERE/fixtures/checker.t1.json" --submission "$S" --out "$SB/rc6.json" > "$SB/rc6.log" 2>&1
[ $? -eq 6 ] && ok "T1 谓词 ⇒ exit 6（fail-closed）" || bad "T1 谓词退出码不是 6"
[ "$(jget "$SB/rc6.json" reconciliation.unsupported[0])" = "P90" ] && ok "T1 记 status=unsupported 且列出 P90" || bad "T1 未列出 unsupported"
[ "$(jget "$SB/rc6.json" totals.score)" = "null" ] && ok "T1 不给分（score=null）" || bad "T1 静默给了分"

echo "SELFTEST_MODEL_CALLS=0（零网络、零 LLM，仅调用本目录纯 stdlib 执行器）"
echo "SELFTEST_PASS=$PASS_N SELFTEST_FAIL=$FAIL_N"
echo "SELFTEST_SANDBOX=$SB"
if [ "$FAIL_N" -eq 0 ]; then
  echo "SELFTEST_RESULT=PASS"
  exit 0
fi
echo "SELFTEST_RESULT=FAIL"
exit 1
