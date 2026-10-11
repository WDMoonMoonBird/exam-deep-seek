#!/usr/bin/env bash
# scripts/dsh-verify/r1-core.sh —— R1-C：E1（N≥5 逐位一致 + run_meta 排除）、E2（扰动矩阵 + 绝对路径扫描）、E4（换尺子/generated）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
CK="$DSH_REPO_ROOT/scripts/dsh-checker"
R=/tmp/r1c/core; rm -rf "$R"; mkdir -p "$R"

echo "=== E1：同一 checker × 同一提交 × 7 次 ==="
bash "$CK/repro.sh" --checker "$CK/fixtures/checker.json" --submission "$CK/fixtures/submission" --times 7 --perturb none --out "$R/e1" > "$R/e1.txt" 2>&1
echo "repro_rc=$? $(grep -oE 'REPRO .*' "$R/e1.txt")"
python3 -c "import json;d=json.load(open('$R/e1/repro-report.json'));print('distinct_count=%d determinism=%s exits=%s scores=%s'%(d['distinct_count'],d['determinism'],sorted(set(d['exits'])),sorted(set(d['scores']))))"

echo "=== E1b：canonical 是否真的排除 run_meta（单元级 + 实证级）==="
python3 - <<'PY'
import json, sys, subprocess, time
sys.path.insert(0, 'scripts/dsh-checker')
import check
base = {'schema_version': 'checker-result/1', 'checker_id': 'sha256:x', 'items': [{'id': 'P01', 'score': 1}],
        'totals': {'score': 1}, 'reconciliation': {'matrix': []}, 'run_meta': {'elapsed_ms': 1}, 'canonical_sha256': 'old'}
a = json.loads(json.dumps(base)); a['run_meta'] = {'elapsed_ms': 1}
b = json.loads(json.dumps(base)); b['run_meta'] = {'elapsed_ms': 999999, 'poison': 'timestamp'}
c = json.loads(json.dumps(base)); c['canonical_sha256'] = 'other'
d = json.loads(json.dumps(base)); d['items'][0]['score'] = 2
print('canon(meta1)==canon(meta2):', check.canon_sha256(a) == check.canon_sha256(b))
print('canon ignores canonical_sha256 field:', check.canon_sha256(a) == check.canon_sha256(c))
print('canon DETECTS payload change (anti-vacuity):', check.canon_sha256(a) != check.canon_sha256(d))
PY
for i in 1 2 3; do
  python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --submission "$CK/fixtures/submission" --out "$R/meta$i.json" > "$R/meta$i.txt" 2>&1
  sleep 1
done
python3 - <<'PY'
import json
metas, canons = [], []
for i in (1, 2, 3):
    d = json.load(open('/tmp/r1c/core/meta%d.json' % i, encoding='utf-8'))
    metas.append(d['run_meta'])
    canons.append(d['canonical_sha256'])
print('run_meta 三次:', [m.get('elapsed_ms') for m in metas], '-> distinct_meta=%d' % len({json.dumps(m, sort_keys=True) for m in metas}))
print('canonical 三次 distinct=%d 一致=%s' % (len(set(canons)), len(set(canons)) == 1))
PY

echo "=== E2：扰动矩阵（空格/中文路径 + CWD + LC_ALL + TZ + PYTHONHASHSEED + mtime）× 6 ==="
bash "$CK/repro.sh" --checker "$CK/fixtures/checker.json" --submission "$CK/fixtures/submission" --times 6 --perturb all --out "$R/e2" > "$R/e2.txt" 2>&1
echo "repro_rc=$? $(grep -oE 'REPRO .*' "$R/e2.txt")"
python3 - "$R/e2" <<'PY'
import json, os, sys, glob
out = sys.argv[1]
rep = json.load(open(os.path.join(out, 'repro-report.json'), encoding='utf-8'))
print('distinct_count=%d determinism=%s absolute_path_leaks=%d' % (rep['distinct_count'], rep['determinism'], rep['absolute_path_leaks']))
bad = []
for p in sorted(glob.glob(os.path.join(out, 'run*', 'result.json'))):
    t = open(p, encoding='utf-8', errors='replace').read()
    for needle in ('/Users/', '/private/tmp', '/var/folders', out):
        if needle in t:
            bad.append((os.path.basename(os.path.dirname(p)), needle))
print('我的独立绝对路径扫描 hits=%d %s' % (len(bad), bad[:3]))
ids = sorted({json.load(open(p, encoding='utf-8'))['submission']['id'] for p in glob.glob(os.path.join(out, 'run*', 'result.json'))})
print('submission.id 取值集合:', ids)
PY

echo "=== E4：换尺子 / generated / 键序 / _note ==="
python3 - "$CK" "$R" <<'PY'
import json, os, shutil, subprocess, sys
ck, R = sys.argv[1], sys.argv[2]
fix = os.path.join(ck, 'fixtures')
CKJ, SUB = os.path.join(fix, 'checker.json'), os.path.join(fix, 'submission')
base_doc = json.load(open(CKJ, encoding='utf-8'))
baseline = subprocess.run(['python3', os.path.join(ck, 'check.py'), '--checker', CKJ, '--submission', SUB, '--canonical'],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout.decode()
base_canon = [l for l in baseline.splitlines() if len(l) == 64 and all(c in '0123456789abcdef' for c in l)]
base_canon = base_canon[0] if base_canon else ''

def run(args):
    r = subprocess.run(['python3', os.path.join(ck, 'check.py')] + args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return r.returncode, r.stdout.decode('utf-8', 'replace')

def canon_of(text):
    for l in text.splitlines():
        if 'canonical_sha256=' in l:
            return l.split('canonical_sha256=')[1].strip()
    for l in text.splitlines():
        if len(l) == 64 and all(c in '0123456789abcdef' for c in l):
            return l
    return ''

# 1) rubric 改一字节
rub = os.path.join(R, 'rubric-x.md'); shutil.copy2(os.path.join(fix, 'rubric.md'), rub)
open(rub, 'a', encoding='utf-8').write('x')
rc, out = run(['--checker', CKJ, '--submission', SUB, '--rubric', rub, '--out', os.path.join(R, 'stale-rubric.json'), '--canonical'])
print('rubric+1B  rc=%d %s | score_withheld=%s' % (rc, [l for l in out.splitlines() if l.startswith('STALE') or l.startswith('SCORE_WITHHELD')][:2],
      json.load(open(os.path.join(R, 'stale-rubric.json'), encoding='utf-8'))['totals']['score']))
# 2) standard 改一字节
std = os.path.join(R, 'standard-x'); shutil.copytree(os.path.join(fix, 'standard'), std)
target = os.path.join(std, 'UserManagement', 'src', 'main.js')
open(target, 'a', encoding='utf-8').write('//x')
rc, out = run(['--checker', CKJ, '--submission', SUB, '--standard', std, '--out', os.path.join(R, 'stale-std.json')])
print('standard+1B rc=%d %s' % (rc, [l for l in out.splitlines() if l.startswith('STALE')][:1]))
# 3) generated 三字段 + _note + 键序
g = json.loads(json.dumps(base_doc))
g['generated'] = {'session_id': 'zzz', 'model': 'other', 'created_at': '2000-01-01T00:00:00Z', 'generator': 'manual'}
g['_note'] = 'note'
gp = os.path.join(R, 'checker-generated.json')
json.dump({k: g[k] for k in reversed(list(g.keys()))}, open(gp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
rc, out = run(['--checker', gp, '--submission', SUB, '--canonical'])
print('generated/_note/键序改动 rc=%d checker_id_ok=%s canonical_same=%s' % (rc, 'CHECKER_VALID=yes' in out, canon_of(out) == base_canon))
vrc = subprocess.run(['python3', os.path.join(ck, 'validate.py'), gp], stdout=subprocess.PIPE).stdout.decode()
print('  validate: %s / declared=%s' % ([l for l in vrc.splitlines() if l.startswith('VALID=')], [l for l in vrc.splitlines() if l.startswith('checker_id=')][0][:38]))
# 4) predicates 改一分（真换尺子）
p = json.loads(json.dumps(base_doc))
p['predicates'][0]['max_score'] = 9
pp = os.path.join(R, 'checker-pred.json'); json.dump(p, open(pp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
rc, out = run(['--checker', pp, '--submission', SUB, '--canonical'])
print('predicates.max_score 10->9 rc=%d %s' % (rc, [l for l in out.splitlines() if l.startswith('CHECKER_')][:2]))
PY
echo "CORE_DONE"