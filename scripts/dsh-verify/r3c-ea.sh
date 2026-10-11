#!/usr/bin/env bash
# scripts/dsh-verify/r3c-ea.sh —— R3-C E-A：C 独立复算 checker_id + 两个反例（generated 不换尺子 / predicates 换尺子）
# 用法: bash r3c-ea.sh [workdir]   默认 /tmp/dsh-r3-verify
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
W="${1:-/tmp/dsh-r3-verify}"
R=/tmp/r3c/ea; rm -rf "$R"; mkdir -p "$R"
CK="$W/out/checker/checker.json"
CKV="$DSH_REPO_ROOT/scripts/dsh-checker/validate.py"
[ -f "$CK" ] || { echo "MISSING $CK"; exit 9; }

echo "=== E-A.1 三方可比：declared / C 独立复算 / 装置第二进程 ==="
python3 - "$CK" "$CKV" > "$R/id.txt" 2>&1 <<'PY'
import hashlib, json, os, subprocess, sys

def strip_notes(o):
    if isinstance(o, dict):
        return {k: strip_notes(v) for k, v in o.items() if not (isinstance(k, str) and k.startswith('_'))}
    if isinstance(o, list):
        return [strip_notes(v) for v in o]
    return o

def my_id(c):
    doc = {
        'schema_version': c.get('schema_version'),
        'assignment_ref': {'rubric_hash': (c.get('assignment_ref') or {}).get('rubric_hash'),
                           'standard_hash': (c.get('assignment_ref') or {}).get('standard_hash')},
        'scoring': c.get('scoring'), 'input_contract': c.get('input_contract'),
        'predicates': c.get('predicates'), 'deductions': c.get('deductions'),
        'evidence_policy': c.get('evidence_policy'),
    }
    raw = json.dumps(strip_notes(doc), sort_keys=True, ensure_ascii=False,
                     separators=(',', ':'), allow_nan=False).encode('utf-8')
    return 'sha256:' + hashlib.sha256(raw).hexdigest()

c = json.load(open(sys.argv[1], encoding='utf-8'))
mine = my_id(c)
p = subprocess.run([sys.executable, sys.argv[2], sys.argv[1]], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
dev = [l.split('=', 1)[1] for l in p.stdout.decode().splitlines() if l.startswith('checker_id=')]
print('declared      =', c.get('checker_id'))
print('C 独立复算     =', mine)
print('装置第二进程   =', dev[0] if dev else '<none>', '(validate rc=%d)' % p.returncode)
print('三者一致      =', bool(dev) and mine == c.get('checker_id') == dev[0])
print('predicates    =', len(c.get('predicates') or []), 'items; max_score =', (c.get('scoring') or {}).get('max_score'))
PY
cat "$R/id.txt"

echo
echo "=== E-A.2 反例一：改 generated/_note/键序 ⇒ 尺子不变 ==="
python3 - "$CK" "$R" "$CKV" > "$R/counter1.txt" 2>&1 <<'PY'
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[3])))
import validate as V
ck, R, ckv = sys.argv[1], sys.argv[2], sys.argv[3]
base = json.load(open(ck, encoding='utf-8'))
g = json.loads(json.dumps(base))
g['generated'] = {'session_id': 'zzz-other', 'model': 'other', 'created_at': '1999-01-01T00:00:00Z', 'generator': 'manual'}
g['_note'] = 'harmless note'
gp = os.path.join(R, 'checker-generated.json')
json.dump({k: g[k] for k in reversed(list(g.keys()))}, open(gp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
p = subprocess.run([sys.executable, ckv, gp], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
out = p.stdout.decode()
dev = [l.split('=', 1)[1] for l in out.splitlines() if l.startswith('checker_id=')]
print('改后 validate rc=%d VALID=%s' % (p.returncode, 'yes' if 'VALID=yes' in out else 'no'))
print('改后第二进程复算 id == 原 declared:', bool(dev) and dev[0] == base.get('checker_id'))
PY
cat "$R/counter1.txt"

echo "=== E-A.3 反例二：改 predicates[0].max_score ⇒ 必须换尺子（id 变 + validate 拒绝）==="
python3 - "$CK" "$R" "$CKV" > "$R/counter2.txt" 2>&1 <<'PY'
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[3])))
import validate as V
ck, R, ckv = sys.argv[1], sys.argv[2], sys.argv[3]
base = json.load(open(ck, encoding='utf-8'))
orig = base.get('checker_id')
m = json.loads(json.dumps(base))
m['predicates'][0]['max_score'] = float(m['predicates'][0]['max_score']) + 1
mp = os.path.join(R, 'checker-pred.json')
json.dump(m, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
new_id = V.checker_id_of(m)
p = subprocess.run([sys.executable, ckv, mp], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
out = p.stdout.decode()
print('改后 C 复算 id =', new_id[:26], '≠ declared:', new_id != orig)
print('改后 validate rc=%d' % p.returncode, [l for l in out.splitlines() if 'VIOLATION' in l][:1])
PY
cat "$R/counter2.txt"