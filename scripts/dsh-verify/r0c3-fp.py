#!/usr/bin/env python3
"""scripts/dsh-verify/r0c3-fp.py —— R0 线指纹（与 lead/fp-r0-t11.txt 同口径）+ 差异清单
用法: python3 r0c3-fp.py <参考指纹文件> <当前输出文件>
"""
import hashlib
import os
import sys

REF, OUT = sys.argv[1], sys.argv[2]
files = sorted(f for f in os.listdir('scripts/dsh-grader')
               if os.path.isfile(os.path.join('scripts/dsh-grader', f)))

rows = []
for f in files:
    p = os.path.join('scripts/dsh-grader', f)
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    rows.append((h, p))

# 口径识别：用参考文件的 11 行哈希反推合并摘要算法
ref_lines = [l for l in open(REF, encoding='utf-8').read().splitlines() if l and not l.startswith('#')]
ref = {}
for l in ref_lines:
    h, p = l.split('  ', 1)
    ref[p] = h
ref_sum = ''
for l in open(REF, encoding='utf-8'):
    if '合并摘要' in l:
        ref_sum = l.strip().split()[-1]


def recipes(pairs):
    out = {}
    s1 = ''.join('%s  %s\n' % (h, p) for h, p in pairs)
    s2 = ''.join('%s %s\n' % (h, p) for h, p in pairs)
    s3 = ''.join(h for h, _ in pairs)
    s4 = '\n'.join('%s  %s' % (h, p) for h, p in pairs) + '\n'
    for name, s in (('hash2sp_nl', s1), ('hash1sp_nl', s2), ('hashes_only', s3), ('joined_nl', s4)):
        out[name] = hashlib.sha256(s.encode()).hexdigest()
    return out


ref_pairs = sorted(ref.items())
found = None
for name, val in recipes(ref_pairs).items():
    if val == ref_sum:
        found = name
print('合并摘要口径识别: %s' % (found or 'UNKNOWN（将用默认 hash2sp_nl）'))
recipe = found or 'hash2sp_nl'
merged = recipes(sorted(rows))[recipe]
mine = {p: h for h, p in rows}
changed = sorted(set(p for p in set(mine) | set(ref) if mine.get(p) != ref.get(p)))
lines = ['# R0 线指纹（t12 复核时刻，口径=%s）' % recipe] + \
        ['%s  %s' % (h, p) for h, p in sorted(rows)] + \
        ['# 汇总: %d 文件, 合并摘要 %s' % (len(rows), merged)] + \
        ['# 相对 t11 参考: 变化文件 %d 个 %s' % (len(changed), changed)]
open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('t11 合并摘要: %s' % ref_sum)
print('当前合并摘要: %s' % merged)
print('变化文件 (%d):' % len(changed))
for p in changed:
    print('  %-42s t11=%s now=%s' % (p, (ref.get(p) or 'absent')[:12], (mine.get(p) or 'absent')[:12]))
