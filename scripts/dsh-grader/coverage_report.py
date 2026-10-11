#!/usr/bin/env python3
"""R3-B · 覆盖率报告器：四态覆盖率 + 逐谓词对账矩阵（纯 stdlib，零模型调用）。

裁定 3：rubric 切分按 '##' 标题；无 '##' 时退化到 '###'（切分产物 = materials/rubric-sections.json）。
四态：covered（段落有谓词且 group 与段标题规范化后相等）/ partially_covered（关键词/子集命中）/
      uncovered（无谓词，必须列 sid + 片段）/ subjective（显式标注需人判）。
★主观项不计入 covered（防止夸大覆盖）。

用法:
  coverage_report.py --checker <checker.json> --rubric-sections <rubric-sections.json>
                     [--session-coverage <out/checker/rubric-coverage.json>]
                     [--matrix <out/reconciliation/matrix.json>] [--json <out/reconciliation/coverage.json>]
  退出码 0；引用悬空/covered+partial==0 时打印 FAIL 行并退出 1。
"""
import argparse
import json
import os
import re
import sys

SUBJECTIVE_HINTS = ['规范', '风格', '注释', '命名', '健壮', '可读', '主观', '质量', '态度']
STOP = set(['的', '与', '和', '及', '或', '等', '与', '在', '为', '了'])


def norm(text):
    t = re.sub(r'[#*\s:：、，,。.()（）\[\]【】/]+', '', text or '')
    return t.strip().lower()


def tokens(text):
    t = text or ''
    ascii_words = set(w.lower() for w in re.findall(r'[A-Za-z][A-Za-z0-9_.-]{2,}', t))
    cjk = re.sub(r'[^\u4e00-\u9fff]', ' ', t)
    grams = set()
    for chunk in cjk.split():
        for i in range(len(chunk) - 1):
            grams.add(chunk[i:i + 2])
    return ascii_words | grams


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--checker', required=True)
    ap.add_argument('--rubric-sections', required=True)
    ap.add_argument('--session-coverage', default='')
    ap.add_argument('--matrix', default='')
    ap.add_argument('--json', default='')
    args = ap.parse_args()

    checker = json.load(open(args.checker, encoding='utf-8'))
    sections = json.load(open(args.rubric_sections, encoding='utf-8'))
    preds = checker.get('predicates') or []
    pids = set(p.get('id') for p in preds)

    violations = []
    if args.session_coverage and os.path.isfile(args.session_coverage):
        try:
            declared = json.load(open(args.session_coverage, encoding='utf-8'))
            for sec in declared.get('sections', []):
                for pid in sec.get('predicates', []) or []:
                    if pid not in pids:
                        violations.append('dangling_predicate_ref:%s@%s' % (pid, sec.get('sid')))
        except ValueError as exc:
            violations.append('session_coverage_unparsable:' + type(exc).__name__)

    rows = []
    sec_rows = []
    for sec in sections.get('sections', []):
        head = sec.get('head', '')
        body = sec.get('excerpt', '') or ''
        group_exact = [p['id'] for p in preds if norm(p.get('group', '')) == norm(head)]
        toks_head = tokens(head)
        group_partial = [p['id'] for p in preds
                         if p['id'] not in group_exact and (tokens(p.get('group', '')) & toks_head)]
        if group_exact:
            state, why, ids = 'covered', 'group 与段标题一致', group_exact
        elif group_partial:
            state, why, ids = 'partially_covered', '关键词交集：' + ','.join(sorted(tokens(head))[:3]), group_partial
        elif any(h in (head + body) for h in SUBJECTIVE_HINTS):
            state, why, ids = 'subjective', '含主观关键词，需人判', []
        else:
            state, why, ids = 'uncovered', '无谓词覆盖', []
        sec_rows.append({'sid': sec.get('sid'), 'head': head, 'sha256': sec.get('sha256'),
                         'state': state, 'predicates': sorted(ids), 'reason': why,
                         'excerpt': (head + ' ' + body)[:80]})
        for p in preds:
            if p['id'] in ids:
                rows.append({'item_id': p['id'], 'predicate': p.get('rule_type'), 'group': p.get('group'),
                             'max_score': p.get('max_score'), 'section': sec.get('sid'), 'state': state})

    # 每个谓词至少占一行（矩阵行数必须等于谓词数，用于「逐谓词对账」）
    matrix = []
    for p in preds:
        mapped = sorted(set(r['section'] for r in rows if r['item_id'] == p['id'] and r['section']))
        matrix.append({'item_id': p['id'], 'rule_type': p.get('rule_type'), 'group': p.get('group'),
                       'max_score': p.get('max_score'), 'mapped_sections': mapped,
                       'covered': bool(mapped)})

    states = {'covered': 0, 'partially_covered': 0, 'uncovered': 0, 'subjective': 0}
    for s in sec_rows:
        states[s['state']] = states.get(s['state'], 0) + 1
    covered_or_partial = states['covered'] + states['partially_covered']
    doc = {
        'schema_version': 'rubric-coverage/1',
        'checker_id': checker.get('checker_id'),
        'rubric_sections_total': len(sec_rows),
        'split_rule': '## 优先，退化 ###',
        'sections': sec_rows,
        'states': states,
        'covered_or_partial': covered_or_partial,
        'uncovered': [{'sid': s['sid'], 'head': s['head'], 'excerpt': s['excerpt']}
                      for s in sec_rows if s['state'] == 'uncovered'],
        'matrix_rows': len(matrix),
        'predicates_total': len(preds),
        'violations': violations,
    }
    if args.matrix:
        os.makedirs(os.path.dirname(os.path.abspath(args.matrix)), exist_ok=True)
        with open(args.matrix, 'w', encoding='utf-8') as f:
            json.dump({'schema_version': 'matrix/1', 'checker_id': checker.get('checker_id'),
                       'rows': matrix, 'row_count': len(matrix), 'predicates_total': len(preds)}, f,
                      ensure_ascii=False, indent=2)
            f.write(chr(10))
    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write(chr(10))
    print('COVERAGE states=covered:%d partial:%d uncovered:%d subjective:%d covered_or_partial=%d' % (
        states['covered'], states['partially_covered'], states['uncovered'], states['subjective'],
        covered_or_partial))
    print('COVERAGE_MATRIX rows=%d predicates=%d' % (len(matrix), len(preds)))
    for u in doc['uncovered']:
        print('UNCOVERED %s %s :: %s' % (u['sid'], u['head'], u['excerpt'][:60]))
    bad = False
    for v in violations:
        print('COVERAGE_VIOLATION ' + v)
        bad = True
    if matrix and len(matrix) != len(preds):
        print('COVERAGE_VIOLATION matrix_rows_mismatch')
        bad = True
    if covered_or_partial == 0:
        print('COVERAGE_FAIL covered_or_partial=0（等于没造出尺子）')
        bad = True
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
