#!/usr/bin/env bash
# scripts/dsh-verify/r3c-ec.sh —— R3-C E-C：check.py --batch --dedup digest 连跑两遍 + 逐份 canonical 对拍
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
CK="scripts/dsh-checker/check.py"
CHK="scripts/dsh-checker/fixtures/checker.json"
BATCH="$DSH_REPO_ROOT/实验/注入测试集"
R=/tmp/r3c/ec; rm -rf "$R"; mkdir -p "$R"

for i in 1 2; do
  python3 "$CK" --checker "$CHK" --batch "$BATCH" --out "$R/run$i" --dedup digest > "$R/run$i.txt" 2>&1
  echo "run$i rc=$? : $(grep -oE 'BATCH_OK.*' "$R/run$i.txt")"
done
python3 - "$R" <<'PY'
import json, os, sys
R = sys.argv[1]
def load(d):
    out = {}
    p = os.path.join(d, 'results')
    for n in sorted(os.listdir(p)):
        if n.endswith('.json'):
            doc = json.load(open(os.path.join(p, n), encoding='utf-8'))
            out[n] = (doc.get('canonical_sha256'), doc.get('totals', {}).get('score'), doc.get('checker_id'))
    return out
a, b = load(os.path.join(R, 'run1')), load(os.path.join(R, 'run2'))
print('files run1=%d run2=%d' % (len(a), len(b)))
mismatch = [k for k in sorted(set(a) | set(b)) if a.get(k) != b.get(k)]
print('per_file_canonical_mismatch=%d %s' % (len(mismatch), mismatch[:3]))
comp = json.load(open(os.path.join(R, 'run1', 'comparability.json'), encoding='utf-8'))
print('comparability: zips=%s unique=%s evaluated=%s skipped=%d cross_group=%s dedup=%s' % (
    comp['zips_total'], comp['unique_digests'], comp['evaluated'], len(comp['skipped_duplicates']), comp['cross_group'], comp['dedup_policy']))
unsup = [k for k, v in a.items() if v[1] is None]
print('unsupported_or_null_score=%d' % len(unsup))
PY
echo "--- 唯一摘要复算（C 自己的算法）---"
python3 - "$BATCH" <<'PY'
import hashlib, os, sys
rows = {}
for fn in sorted(os.listdir(sys.argv[1])):
    if fn.endswith('.zip'):
        h = hashlib.sha256(open(os.path.join(sys.argv[1], fn), 'rb').read()).hexdigest()
        rows.setdefault(h, []).append(fn)
print('zips_total=%d unique=%d skipped_expected=%d' % (sum(len(v) for v in rows.values()), len(rows), sum(len(v) for v in rows.values()) - len(rows)))
PY