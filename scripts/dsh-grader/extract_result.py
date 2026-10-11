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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stdout', required=True)
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--expect-submission-id', default='')
    ap.add_argument('--artifact', default='')
    ap.add_argument('--allow-stdout-fallback', action='store_true')
    args = ap.parse_args()

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
