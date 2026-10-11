#!/usr/bin/env bash
# scripts/dsh-verify/r1-crosscheck.sh —— R1-C：与 R0 产物对拍 + 回归旁证（不改 R0 装置、不改 dsh-checker）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/vlib.sh"
CK="$DSH_REPO_ROOT/scripts/dsh-checker"
R=/tmp/r1c/cross; rm -rf "$R"; mkdir -p "$R"
R0OUT=/tmp/dsh-r0-verify2/out/results/s01.json
MAT=/tmp/dsh-r0-verify2/materials

echo "=== 对拍 A：同一份学生提交，两把尺子 ==="
SUBDIR="$(find "$MAT/submissions" -name package.json -not -path '*/node_modules/*' 2>/dev/null | head -1 | xargs dirname 2>/dev/null)"
echo "提交目录: ${SUBDIR:0:80}"
python3 - "$MAT" "$R/before.json" <<'PY'
import hashlib, json, os, sys
root, outp = sys.argv[1], sys.argv[2]
rows = []
for dp, dns, fns in os.walk(root):
    for fn in sorted(fns):
        p = os.path.join(dp, fn)
        h = hashlib.sha256()
        try:
            with open(p, 'rb') as f:
                for c in iter(lambda: f.read(1 << 20), b''):
                    h.update(c)
        except OSError:
            continue
        rows.append((h.hexdigest(), os.path.relpath(p, root)))
json.dump(sorted(rows), open(outp, 'w', encoding='utf-8'))
print('materials 文件数=%d' % len(rows))
PY
python3 "$CK/check.py" --checker "$CK/fixtures/checker.json" --submission "$SUBDIR" --out "$R/det-s01.json" --canonical > "$R/det.txt" 2>&1
echo "确定性尺子 rc=$? $(grep -E '^s*$|EVALUATED|STALE|INPUT_PROBLEM' "$R/det.txt" | tail -1)"
python3 - "$MAT" "$R/after.json" <<'PY'
import hashlib, json, os, sys
root, outp = sys.argv[1], sys.argv[2]
rows = []
for dp, dns, fns in os.walk(root):
    for fn in sorted(fns):
        p = os.path.join(dp, fn)
        h = hashlib.sha256()
        try:
            with open(p, 'rb') as f:
                for c in iter(lambda: f.read(1 << 20), b''):
                    h.update(c)
        except OSError:
            continue
        rows.append((h.hexdigest(), os.path.relpath(p, root)))
json.dump(sorted(rows), open(outp, 'w', encoding='utf-8'))
PY
echo "只读物料未被写坏: $(cmp -s "$R/before.json" "$R/after.json" && echo yes || echo NO)"
python3 - "$R0OUT" "$R/det-s01.json" <<'PY'
import json, sys
llm = json.load(open(sys.argv[1], encoding='utf-8'))
det = json.load(open(sys.argv[2], encoding='utf-8'))
print('--- 字段对拍表 ---')
rows = [
    ('schema_version', llm.get('schema_version'), llm.get('schema_version'), det.get('schema_version')),
]
print('%-22s | %-34s | %s' % ('字段', 'R0 LLM 产物 s01.json', '确定性 checker 产物'))
print('%-22s | %-34s | %s' % ('schema', llm.get('schema_version'), det.get('schema_version')))
print('%-22s | %-34s | %s' % ('item id 空间', ','.join(str(i['id']) for i in llm['items']), ','.join(str(i['id']) for i in det['items'])))
print('%-22s | %-34s | %s' % ('items 数', len(llm['items']), len(det['items'])))
print('%-22s | %-34s | %s' % ('max_score 合计', sum(i['max_score'] for i in llm['items']), det['totals']['max_score']))
print('%-22s | %-34s | %s' % ('score', llm.get('total_score'), det['totals']['score']))
print('%-22s | %-34s | %s' % ('checker_id', '缺失', det.get('checker_id', '')[:24]))
print('%-22s | %-34s | %s' % ('canonical_sha256', '缺失', det.get('canonical_sha256', '')[:24]))
print('%-22s | %-34s | %s' % ('提交指纹 digest', '缺失', det['submission']['digest'][:24]))
print('%-22s | %-34s | %s' % ('file_count', '缺失', det['submission']['file_count']))
print('%-22s | %-34s | %s' % ('reconciliation.matrix', '缺失', 'len=%d' % len(det['reconciliation']['matrix'])))
print()
print('同 (checker_id) 才可比 → 本对拍结论: %s' % ('not_comparable（两把尺子 rubric/predicate 不同，只能比字段形状）'))
PY

echo
echo "=== 回归：dsh-grader/** 与 dsh-verify/** 是否被 R1-B/C 改动 ==="
echo "--- dsh-grader mtime（应全部 ≤ 22:54，R1-B 起于 23:03）---"
ls -lT scripts/dsh-grader | awk 'NR>1{print $6, $7, $8, $9}' | head -12
echo "dsh-grader 中 22:56 之后被改的文件数: $(find scripts/dsh-grader -type f -newermt '2026-10-11 22:56' 2>/dev/null | wc -l | tr -d ' ')"
echo "--- dsh-verify 中 22:56 之后被改的文件（应只有 C 本轮新建的 r1-*）---"
find scripts/dsh-verify -type f -newermt '2026-10-11 22:56' 2>/dev/null | sed 's|.*/||' | sort | tr '\n' ' '
echo
echo "--- dsh-checker 未被 C 改动（C 只读）---"
ls -lT scripts/dsh-checker/*.py scripts/dsh-checker/*.sh | awk '{print $6, $7, $8, $9}' | head -7
echo "CROSS_DONE"