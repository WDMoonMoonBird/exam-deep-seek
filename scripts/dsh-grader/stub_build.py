#!/usr/bin/env python3
"""自测专用：假会话的产物生成器（stub-dsh.sh 调用；零模型调用，非产品路径）。

按 R3-A 契约在 <workdir>/out/ 写：checker.json / rubric-coverage.json / checker.provenance.json /
results/<slug>.model.json / reconciliation/session-matrix.json。
模式：ok | field-max(C4) | t1(C5) | dangling(C6) | bad-id(C1/C2) | exec(C7) | half(首次坏二次好，--counter)
"""
import argparse
import json
import os
import sys

CHECKER_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dsh-checker')
sys.path.insert(0, CHECKER_DIR)
import validate as V  # noqa: E402


def head_of(secs, i):
    return secs[min(i, len(secs) - 1)]['head'][:40]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workdir', required=True)
    ap.add_argument('--slug', default='s01')
    ap.add_argument('--mode', default='ok')
    ap.add_argument('--counter', default='')
    args = ap.parse_args()

    mode = args.mode
    if mode == 'half-c8' and args.counter:
        n = int(open(args.counter).read().strip() or '0') if os.path.isfile(args.counter) else 0
        n += 1
        open(args.counter, 'w').write(str(n))
        mode = 'unmeasurable' if n == 1 else 'ok'
    if mode == 'half' and args.counter:
        n = int(open(args.counter).read().strip() or '0') if os.path.isfile(args.counter) else 0
        n += 1
        open(args.counter, 'w').write(str(n))
        mode = 'field-max' if n == 1 else 'ok'

    W = os.path.abspath(args.workdir)
    if mode == 'partial-unmeasurable':
        sub_root = os.path.join(W, 'materials', 'submissions')
        dirs = sorted(d for d in os.listdir(sub_root)) if os.path.isdir(sub_root) else []
        if len(dirs) >= 2:
            victim = os.path.join(sub_root, dirs[1])
            for dp, dn, fn in os.walk(victim):
                try:
                    os.chmod(dp, 0o755)
                except OSError:
                    pass
                if 'package.json' in fn:
                    fp = os.path.join(dp, 'package.json')
                    try:
                        os.chmod(fp, 0o644)
                        os.remove(fp)
                    except OSError:
                        pass
        mode = 'ok'
    man = json.load(open(os.path.join(W, 'materials', 'materials-manifest.json'), encoding='utf-8'))
    secs = json.load(open(os.path.join(W, 'materials', 'rubric-sections.json'), encoding='utf-8'))['sections']

    p1 = {'id': 'P01', 'group': head_of(secs, 0), 'item': '存在工程根 package.json', 'max_score': 10,
          'rule_type': 'file_exists', 'params': {'path': 'package.json'}}
    p2 = {'id': 'P02', 'group': head_of(secs, 1), 'item': '登录页文件存在', 'max_score': 20,
          'rule_type': 'file_exists', 'params': {'path': 'src/views/Login.vue'}}
    p3 = {'id': 'P03', 'group': head_of(secs, 2), 'item': 'user store 做了持久化', 'max_score': 20,
          'rule_type': 'contains_regex',
          'params': {'path': 'src/stores/user.js', 'pattern': 'localStorage|pinia-plugin-persist', 'min_count': 1},
          'deductions': [{'code': 'NO_PERSIST', 'when': 'hit==0', 'delta': -1.0}]}
    p4 = {'id': 'P04', 'group': head_of(secs, 3), 'item': '页面齐备', 'max_score': 15,
          'rule_type': 'glob_covers', 'params': {'patterns': ['src/views/*.vue', 'src/main.js']}}
    p5 = {'id': 'P05', 'group': head_of(secs, 4), 'item': 'main.js 装配 Pinia', 'max_score': 25,
          'rule_type': 'contains_text', 'params': {'path': 'src/main.js', 'text': 'createPinia', 'min_count': 1},
          'deductions': [{'code': 'NO_ROUTER', 'when': 'hit==1', 'delta': -5.0}]}
    if mode == 't1':
        p5 = {'id': 'P05', 'group': head_of(secs, 4), 'item': 'main.js 语法正确（T1）', 'max_score': 25,
              'rule_type': 'syntax_check', 'params': {'path': 'src/main.js'}}
    if mode == 'field-max':
        p1 = dict(p1)
        p1['max_score'] = 999999
    checker = {
        'schema_version': 'checker/1',
        'checker_id': 'sha256:' + '0' * 64,
        'assignment_ref': {'assignment_id': 'R3-A-build-experiment', 'question_id': 'Q-UserManagement',
                           'rubric_hash': ('sha256:' + man['rubric']['sha256'].split('sha256:')[-1]),
                           'standard_hash': ('sha256:' + str(man['standard'].get('extract_digest', man['standard']['sha256'])).split('sha256:')[-1])},
        'generated': {'session_id': 'stub-session-r3', 'model': 'stub(no LLM)',
                      'created_at': '2026-10-11T23:00:00+08:00',
                      'generator': 'scripts/dsh-grader/stub_build.py'},
        'scoring': {'max_score': 100, 'aggregate': 'sum_clamped', 'rounding': 'half_up_1',
                    'zero_credit_rule': 'missing_required_path'},
        'input_contract': {'project_root_glob': '**/UserManagement*' if mode == 'unmeasurable' else '**/package.json',
                           'required_paths': ['src/main.js'],
                           'ignore': ['node_modules/**', '.git/**', 'dist/**'], 'encoding': 'utf-8'},
        'predicates': [p1, p2, p3, p4, p5],
        'deductions': [{'code': 'MISSING_FILE', 'match': {'status': 'missing', 'rule_type': '*'}, 'delta': -1.0},
                       {'code': 'EMPTY_FILE', 'match': {'status': 'empty', 'rule_type': '*'}, 'delta': -0.5}],
        'evidence_policy': {'require_line': True, 'quote_max_chars': 120},
        '_note': 'seed 尺只覆盖前 5 段；其余段落在 rubric-coverage.json 的 uncovered 里显式列出（差额解释）。',
    }
    checker['checker_id'] = ('sha256:' + 'a' * 64) if mode == 'bad-id' else V.checker_id_of(checker)
    ck_dir = os.path.join(W, 'out', 'checker')
    os.makedirs(ck_dir, exist_ok=True)
    json.dump(checker, open(os.path.join(ck_dir, 'checker.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    if mode == 'exec':
        hp = os.path.join(ck_dir, 'helper.sh')
        open(hp, 'w').write('#!/bin/sh' + chr(10) + 'echo hi' + chr(10))
        os.chmod(hp, 0o755)

    live = [p['id'] for p in checker['predicates'] if p['rule_type'] != 'syntax_check']
    rows = []
    for i, s in enumerate(secs):
        if i < len(live):
            rows.append({'sid': s['sid'], 'head': s['head'], 'state': 'covered',
                         'predicates': [live[i]], 'reason': 'group 与段标题一致（照抄 rubric-sections.json）'})
        else:
            rows.append({'sid': s['sid'], 'head': s['head'], 'state': 'uncovered',
                         'predicates': [], 'reason': 'seed 尺未覆盖该段'})
    cov = {'schema_version': 'rubric-coverage/1', 'checker_id': checker['checker_id'],
           'rubric_sections_total': len(secs),
           'uncovered': [{'sid': r['sid'], 'head': r['head'], 'excerpt': '（原文见 rubric.md）'}
                         for r in rows if r['state'] == 'uncovered'],
           'sections': rows}
    if mode == 'dangling':
        cov['sections'][0]['predicates'] = ['P99']
    json.dump(cov, open(os.path.join(ck_dir, 'rubric-coverage.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    json.dump({'schema_version': 'checker-provenance/1', 'generated': checker['generated'],
               'self_check': {'method': 'reading-only（stub 无执行工具）', 'checker_id': checker['checker_id'],
                              'checked': ['C1..C7 逐条阅读核对（stub 模拟）']},
               'inputs': {'rubric_hash': checker['assignment_ref']['rubric_hash'],
                          'standard_hash': checker['assignment_ref']['standard_hash']}},
              open(os.path.join(ck_dir, 'checker.provenance.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    os.makedirs(os.path.join(W, 'out', 'results'), exist_ok=True)
    items = [{'id': p['id'], 'score': p['max_score'], 'max_score': p['max_score'], 'status': 'hit',
              'reason': 'stub 自述：' + p['rule_type']} for p in checker['predicates']
             if p['rule_type'] != 'syntax_check']
    json.dump({'schema_version': 'model-selfcheck/1', 'submission_id': args.slug, 'items': items},
              open(os.path.join(W, 'out', 'results', args.slug + '.model.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    os.makedirs(os.path.join(W, 'out', 'reconciliation'), exist_ok=True)
    json.dump({'schema_version': 'session-matrix/1',
               'rows': [{'item_id': i['id'], 'self_score': i['score']} for i in items]},
              open(os.path.join(W, 'out', 'reconciliation', 'session-matrix.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    print('STUB_BUILD mode=%s checker_id=%s sections=%d' % (mode, checker['checker_id'][:20], len(secs)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
