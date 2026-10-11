#!/usr/bin/env python3
"""scripts/dsh-verify/r3c-ee.py —— R3-C E-E：C 独立复算四态覆盖率与 uncovered 清单（不调用 coverage_report.py）

用法: python3 r3c-ee.py --workdir /tmp/dsh-r3-verify
"""
import argparse
import json
import os
import re
import sys

PUNCT = re.compile(r'[#*\s:：、，,。.()（）\[\]【】/]+')
SUBJ = ['规范', '风格', '注释', '命名', '健壮', '可读', '主观', '质量', '态度']

def mynorm(t):
    return PUNCT.sub('', t or '').strip().lower()

def mytokens(t):
    t = t or ''
    ascii_words = set(w.lower() for w in re.findall(r'[A-Za-z][A-Za-z0-9_.-]{2,}', t))
    cjk = re.sub(r'[^\u4e00-\u9fff]', ' ', t)
    grams = set()
    for chunk in cjk.split():
        for i in range(len(chunk) - 1):
            grams.add(chunk[i:i + 2])
    return ascii_words | grams

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workdir', default='/tmp/dsh-r3-verify')
    args = ap.parse_args()
    W = args.workdir
    ck = json.load(open(os.path.join(W, 'out/checker/checker.json'), encoding='utf-8'))
    secs = json.load(open(os.path.join(W, 'materials/rubric-sections.json'), encoding='utf-8'))
    cov = json.load(open(os.path.join(W, 'out/reconciliation/coverage.json'), encoding='utf-8'))
    mtx = json.load(open(os.path.join(W, 'out/reconciliation/matrix.json'), encoding='utf-8'))
    session_cov_p = os.path.join(W, 'out/checker/rubric-coverage.json')
    session_cov = json.load(open(session_cov_p, encoding='utf-8')) if os.path.isfile(session_cov_p) else None
    preds = ck.get('predicates') or []
    pids = [p['id'] for p in preds]
    fails = []

    def chk(cond, msg):
        print('%s %s' % ('PASS' if cond else 'FAIL', msg))
        if not cond:
            fails.append(msg)

    sect = secs.get('sections') or []
    chk(len(sect) == cov.get('rubric_sections_total', -1) == len(cov.get('sections') or []),
        '段落数三方一致：rubric-sections=%d coverage=%s device_sections=%d' % (
            len(sect), cov.get('rubric_sections_total'), len(cov.get('sections') or [])))
    st = cov.get('states') or {}
    chk(sum(st.get(k, 0) for k in ('covered', 'partially_covered', 'uncovered', 'subjective')) == len(sect),
        '四态计数之和 == 段落数：%s' % st)
    device_states = {}
    for s in cov.get('sections') or []:
        device_states[s['sid']] = s['state']
    # C 独立复算状态
    mine = {}
    for s in sect:
        head = s.get('head', ''); body = s.get('excerpt', '') or ''
        exact = [p['id'] for p in preds if mynorm(p.get('group', '')) == mynorm(head)]
        part = [p['id'] for p in preds if p['id'] not in exact and (mytokens(p.get('group', '')) & mytokens(head))]
        if exact:
            mine[s['sid']] = 'covered'
        elif part:
            mine[s['sid']] = 'partially_covered'
        elif any(h in (head + body) for h in SUBJ):
            mine[s['sid']] = 'subjective'
        else:
            mine[s['sid']] = 'uncovered'
    diff = {k: (device_states.get(k), mine.get(k)) for k in mine if device_states.get(k) != mine.get(k)}
    chk(not diff, 'C 独立复算的四态与装置一致（不一致=%s）' % (diff or '{}'))
    uncov_dev = [u['sid'] for u in cov.get('uncovered') or []]
    uncov_mine = [k for k, v in mine.items() if v == 'uncovered']
    chk(sorted(uncov_dev) == sorted(uncov_mine), 'uncovered 清单显式且一致：device=%s mine=%s' % (uncov_dev, uncov_mine))
    rows = mtx.get('rows') or []
    chk(len(rows) == len(preds) and mtx.get('row_count') == len(preds),
        '对账矩阵一行一谓词：rows=%d predicates=%d' % (len(rows), len(preds)))
    chk(sorted(r['item_id'] for r in rows) == sorted(pids), '矩阵覆盖每个 predicate id 且不重复')
    all_refs = set()
    for s in cov.get('sections') or []:
        all_refs |= set(s.get('predicates') or [])
    if session_cov:
        for s in session_cov.get('sections') or []:
            all_refs |= set(s.get('predicates') or [])
    dangling = sorted(r for r in all_refs if r not in set(pids))
    chk(not dangling, '无悬空引用（引用未定义 predicate 的实体=%s）' % (dangling or '[]'))
    chk(cov.get('covered_or_partial', 0) > 0, 'covered_or_partial=%s > 0' % cov.get('covered_or_partial'))
    chk(cov.get('matrix_rows') == len(preds), 'coverage.matrix_rows=%s == predicates=%d' % (cov.get('matrix_rows'), len(preds)))
    print('EE_STATES device=%s' % st)
    print('EE_RESULT=%s failures=%d' % ('PASS' if not fails else 'FAIL', len(fails)))
    return 0 if not fails else 1

if __name__ == '__main__':
    sys.exit(main())
