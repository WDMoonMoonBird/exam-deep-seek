#!/usr/bin/env python3
"""取出并校验模型产出的批改 JSON：优先候选文件，其次从 stdout 抽取最后一个可解析的 JSON 对象。

用法:
  extract_result.py --stdout <session.stdout.log> --candidate <模型应写到的文件> --out <规范化结果路径>
                    [--expect-submission-id <id>] [--artifact <保留原始产物的路径>]
输出:
  EXTRACT_SOURCE=<file|stdout|none> / EXTRACT_OK=<0|1> / VALIDATE_* 行；退出码 0 = 已落盘且必填字段通过。
"""
import argparse
import json
import os
import shutil
import sys
import time


def decode_objects(text):
    dec = json.JSONDecoder()
    found = []
    i = 0
    while True:
        i = text.find('{', i)
        if i < 0:
            break
        try:
            obj, end = dec.raw_decode(text[i:])
        except ValueError:
            i += 1
            continue
        found.append(obj)
        i = i + max(end, 1)
    return found


def pick_from_stdout(text):
    for obj in reversed(decode_objects(text)):
        if isinstance(obj, dict) and ('items' in obj or 'total_score' in obj):
            return obj
    return None


def validate(obj, expect_id):
    problems = []
    warnings = []
    if not isinstance(obj, dict):
        return ['not-a-json-object'], []
    for key in ('items', 'total_score', 'max_score'):
        if key not in obj:
            problems.append('missing-key:%s' % key)
    if 'missing-key:items' not in problems:
        items = obj.get('items')
        if not isinstance(items, list) or not items:
            problems.append('items-not-nonempty-list')
        else:
            for idx, it in enumerate(items, 1):
                if not isinstance(it, dict):
                    problems.append('item%d-not-object' % idx)
                    continue
                for key in ('score', 'max_score'):
                    if not isinstance(it.get(key), (int, float)) or isinstance(it.get(key), bool):
                        problems.append('item%d-bad-%s' % (idx, key))
    for key in ('total_score', 'max_score'):
        if key in obj and (not isinstance(obj.get(key), (int, float)) or isinstance(obj.get(key), bool)):
            problems.append('bad-%s' % key)
    if expect_id and obj.get('submission_id') not in (None, expect_id):
        warnings.append('submission_id-mismatch:got=%s expect=%s' % (obj.get('submission_id'), expect_id))
    if isinstance(obj.get('items'), list) and isinstance(obj.get('total_score'), (int, float)):
        try:
            s = sum(float(it.get('score', 0)) for it in obj['items'] if isinstance(it, dict))
            if abs(s - float(obj['total_score'])) > 0.01:
                warnings.append('sum-items=%.2f != total_score=%.2f' % (s, float(obj['total_score'])))
        except (TypeError, ValueError):
            warnings.append('sum-computation-failed')
    return problems, warnings


def build_projection(checker, result, submission_id, score_only=False, coverage_path=''):
    """单向投影：checker-result/1 → 平台兼容 grading-result.json（R3-A 施工单 5 / 队长裁定 5）。
    items[].id 必须 ∈ checker 的 predicate id；sum(items.score) 必须等于 totals.score。"""
    pred_ids = set(p.get('id') for p in (checker.get('predicates') or []))
    if score_only:
        pred_ids = pred_ids or set()
    matrix = {}
    for row in ((result.get('reconciliation') or {}).get('matrix') or []):
        matrix[row.get('item_id')] = row
    items, unknown = [], []
    for it in (result.get('items') or []):
        pid = it.get('id')
        if pid not in pred_ids:
            unknown.append(str(pid))
        row = matrix.get(pid, {})
        reason = '%s(%s): %s / %s' % (pid, it.get('rule_type'), row.get('expected', '-'),
                                      row.get('observed', '-'))
        refs = row.get('evidence_refs') or []
        if refs:
            reason += ' | 证据: ' + ','.join(refs[:3])
        items.append({'id': pid, 'title': it.get('item'), 'max_score': it.get('max_score'),
                      'score': it.get('score'), 'status': it.get('status'), 'reason': reason})
    total = round(sum(float(i['score'] or 0) for i in items), 1)
    declared = (result.get('totals') or {}).get('score')
    problems = []
    if not items:
        problems.append('items_empty')
    if unknown and not score_only:
        problems.append('items_id_not_in_checker:' + ','.join(unknown[:4]))
    if declared is not None and abs(total - float(declared)) > 0.05:
        problems.append('sum_mismatch:%s!=%s' % (total, declared))
    if (declared is None) and not score_only:
        problems.append('no_score_in_source')
    doc = {
        'schema_version': 1,
        'submission_id': submission_id,
        'items': items,
        'total_score': total,
        'max_score': (result.get('totals') or {}).get('max_score') or (sum(i['max_score'] or 0 for i in items) or None),
        'verdict': '由确定性执行器按 checker %s 量得' % str(result.get('checker_id'))[:20],
        'evidence': [],
        'uncertain': [],
        'projection': {
            'source': 'checker-result/1',
            'checker_id': result.get('checker_id'),
            'canonical_sha256': result.get('canonical_sha256'),
            'mode': 'score-only' if score_only else 'checker',
            'comparable_within_checker': (not score_only),
        },
    }
    # R3.5-B：uncovered 段落按「未评估」处理 —— 显式给出评估基数与未评估清单（禁止下游当 0 分或满分）
    preds_all = checker.get('predicates') or []
    assessed = sum(p.get('max_score') or 0 for p in preds_all)
    uncovered = []
    if coverage_path and os.path.isfile(coverage_path):
        try:
            cov = json.load(open(coverage_path, encoding='utf-8'))
            uncovered = [u.get('sid') for u in (cov.get('uncovered') or [])]
        except ValueError:
            uncovered = []
    doc['assessment_base'] = {'assessed_max_score': assessed,
                              'declared_max_score': (result.get('totals') or {}).get('max_score'),
                              'uncovered_sections': uncovered,
                              'policy': 'uncovered=未评估：不计入满分基数（既不当 0 分也不当满分）'}
    return doc, problems


def project_main(args):
    for req in ('result', 'checker'):
        if not getattr(args, req):
            print('PROJECTION_FAIL missing_--' + req)
            return 2
    if args.checker and os.path.isfile(args.checker):
        checker = json.load(open(args.checker, encoding='utf-8'))
    else:
        checker = {} if args.score_only else (_ for _ in ()).throw(SystemExit('checker_missing'))
    result = json.load(open(args.result, encoding='utf-8'))
    doc, problems = build_projection(checker, result, args.expect_submission_id, args.score_only, args.coverage)
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write(chr(10))
    for pr in problems:
        print('PROJECTION_PROBLEM ' + pr)
    if problems:
        print('PROJECTION_FAIL items=%d' % len(doc['items']))
        return 1
    print('PROJECTION_OK items=%d sum=%s max=%s mode=%s checker_id=%s' % (
        len(doc['items']), doc['total_score'], doc['max_score'],
        doc['projection']['mode'], str(doc['projection']['checker_id'])[:20]))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stdout', default='')
    ap.add_argument('--candidate', default='')
    ap.add_argument('--out', required=True)
    ap.add_argument('--expect-submission-id', default='')
    ap.add_argument('--artifact', default='')
    ap.add_argument('--allow-stdout-fallback', action='store_true')
    ap.add_argument('--project', action='store_true')
    ap.add_argument('--result', default='')
    ap.add_argument('--checker', default='')
    ap.add_argument('--score-only', action='store_true')
    ap.add_argument('--coverage', default='')
    args = ap.parse_args()

    if args.project:
        return project_main(args)

    if not args.stdout or not args.candidate:
        print('EXTRACT_OK=0 reason=missing_--stdout_or_--candidate')
        return 2
    obj = None
    source = 'none'
    fallback = 'none'
    if os.path.isfile(args.candidate):
        try:
            with open(args.candidate, encoding='utf-8') as f:
                obj = json.load(f)
            source = 'file'
        except (ValueError, OSError) as exc:
            print('EXTRACT_CANDIDATE_PARSE_FAIL %s' % exc)
            obj = None
    if obj is None:
        if not args.allow_stdout_fallback:
            print('EXTRACT_SOURCE=none')
            print('EXTRACT_FALLBACK=refused')
            print('EXTRACT_OK=0 reason=no-file-artifact')
            print('EXTRACT_NOTE=F-C5：契约产物必须来自模型自写的文件；' +
                  'stdout 回退默认关闭，如需回退必须显式传 --allow-stdout-fallback')
            return 1
        try:
            text = open(args.stdout, encoding='utf-8', errors='replace').read()
        except OSError:
            text = ''
        obj = pick_from_stdout(text)
        if obj is not None:
            source = 'stdout-fallback'
            fallback = 'explicit'
    print('EXTRACT_SOURCE=%s' % source)
    print('EXTRACT_FALLBACK=%s' % fallback)
    if obj is None:
        print('EXTRACT_OK=0 reason=no-json-found（来源=%s）' % source)
        return 1

    if source == 'file' and args.artifact:
        try:
            shutil.copy2(args.candidate, args.artifact)
            print('EXTRACT_ARTIFACT=%s（仅当来源=file 时复制）' % args.artifact)
        except OSError as exc:
            print('EXTRACT_ARTIFACT_FAIL %s' % exc)

    problems, warnings = validate(obj, args.expect_submission_id)
    for w in warnings:
        print('VALIDATE_WARN=%s' % w)
    if problems:
        for p in problems:
            print('VALIDATE_PROBLEM=%s' % p)
        print('EXTRACT_OK=0 reason=validation-failed')
        return 1
    obj.setdefault('submission_id', args.expect_submission_id)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write(chr(10))
    print('EXTRACT_WROTE=%s bytes=%d parsed_at=%s source=%s' % (args.out, os.path.getsize(args.out), time.strftime('%Y-%m-%dT%H:%M:%S'), source))
    print('EXTRACT_OK=1 items=%d total_score=%s max_score=%s' % (
        len(obj.get('items', [])), obj.get('total_score'), obj.get('max_score')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
