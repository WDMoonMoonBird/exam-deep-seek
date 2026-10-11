#!/usr/bin/env bash
# scripts/dsh-verify/r35c-real.sh —— R3.5-C：真实工作区的 E-F 第二遍 / frozen 复算 / comparability / assessment_base / C8 证据
set -uo pipefail
cd "$(dirname "$0")/../.."
W="${1:-/tmp/dsh-r35-verify}"
E=/tmp/t20
echo "=== E-F(real) 第一遍快照 ==="
python3 - "$W" "$E/real-canon1.json" <<'PY'
import json, os, sys
W, out = sys.argv[1], sys.argv[2]
d = {}
md = os.path.join(W, 'out', 'measure')
for n in sorted(os.listdir(md)):
    if n.endswith('.json') and not n.startswith('coverage') and not n.startswith('matrix'):
        doc = json.load(open(os.path.join(md, n), encoding='utf-8'))
        if doc.get('canonical_sha256'):
            d[n] = doc['canonical_sha256']
json.dump(d, open(out, 'w'))
print('pass1 canons:', json.dumps(d))
PY
echo "=== E-F(real) 第二遍 measure-only-reuse（零模型调用）==="
bash scripts/dsh-grader/run.sh --checker-mode measure-only-reuse --submissions 2 --workdir "$W" --timeout 600 > "$E/real-pass2.out" 2>&1
echo "pass2 rc=$?"
grep -E 'ASSIGNMENT_RESULT=|RUN_EXIT=|MODEL_CALLS=' "$E/real-pass2.out" | tail -3
python3 - "$W" "$E/real-canon1.json" <<'PY'
import json, os, sys
W, ref = sys.argv[1], sys.argv[2]
a = json.load(open(ref)); b = {}
md = os.path.join(W, 'out', 'measure')
for n in sorted(os.listdir(md)):
    if n.endswith('.json') and not n.startswith('coverage') and not n.startswith('matrix'):
        doc = json.load(open(os.path.join(md, n), encoding='utf-8'))
        if doc.get('canonical_sha256'):
            b[n] = doc['canonical_sha256']
print('pass2 canons:', json.dumps(b))
print('逐份 canonical 一致 =', all(a.get(k) == b.get(k) for k in set(a) | set(b)))
PY
echo "=== frozen 独立复算 vs manifest/汇总 ==="
python3 - "$W" <<'PY'
import hashlib, json, sys
W = sys.argv[1]
f = W + '/out/assignment/checker.frozen.json'
h = 'sha256:' + hashlib.sha256(open(f, 'rb').read()).hexdigest()
m = json.load(open(W + '/out/assignment/assignment-manifest.json', encoding='utf-8'))
c = json.load(open(W + '/out/assignment/comparability.json', encoding='utf-8'))
print('独立复算 =', h)
print('manifest  =', m.get('frozen_sha256'))
print('一致 =', h == m.get('frozen_sha256'))
print('manifest 键:', sorted(m.keys()))
print('comparability:', {k: c.get(k) for k in ('checker_id', 'n', 'ok', 'failed', 'unmeasurable')})
print('comparability 顶层 checker_id 数 =', 1 if c.get('checker_id') else 0)
PY
echo "=== assessment_base（真实投影）==="
python3 - "$W" <<'PY'
import json, os, sys
W = sys.argv[1]
for slug in ('s01', 's02'):
    p = os.path.join(W, 'out', 'grading-result', slug + '.json')
    if os.path.isfile(p):
        d = json.load(open(p, encoding='utf-8'))
        ab = d.get('assessment_base') or {}
        print('%-4s total=%s/%s assessed_max=%s declared=%s uncovered=%s' % (
            slug, d.get('total_score'), d.get('max_score'), ab.get('assessed_max_score'),
            ab.get('declared_max_score'), ab.get('uncovered_sections')))
        print('     policy =', (ab.get('policy') or '')[:60], '| projection.mode =', (d.get('projection') or {}).get('mode'))
PY
echo "=== C8 全量预检证据（真实运行）==="
python3 - "$W" <<'PY'
import json, sys
W = sys.argv[1]
p = W + '/out/diagnostics/measurable.json'
d = json.load(open(p, encoding='utf-8'))
print({k: d.get(k) for k in ('schema_version', 'submissions_total', 'measurable', 'unmeasurable', 'strict')})
for x in (d.get('results') or [])[:4]:
    print('  ', {k: x.get(k) for k in ('slug', 'measurable', 'reason') if k in x})
PY