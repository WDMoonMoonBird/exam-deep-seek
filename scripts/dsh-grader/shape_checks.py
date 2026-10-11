#!/usr/bin/env python3
"""R3-B · 造尺合格判据 C1–C7（F-C2C-1 无关；本文件不触碰归因逻辑）。

C1 validate 通过 / C2 checker_id 第二进程独立复算一致 / C3 rubric+标准包哈希锚定物料（复用 validate.py 口径）
C4 分值与满分一致（sum(predicates) <= scoring.max_score；差额必须由 deductions 或 _note 显式解释；
   rubric 里若写了「满分/合计 N 分」则必须相等）/ C5 无 T1 类型 / C6 覆盖率可读、引用不悬空、uncovered 字段存在
C7 产物目录无脚本 / C8 可量性（真实提交上零 LLM 试跑一次，INPUT_PROBLEM ⇒ 不合格）（只允许 .json/.txt/.md，且不带可执行位）

用法: shape_checks.py --workdir <W> [--slug s01] [--json <out/diagnostics/shape-checks.json>]
输出: SHAPE_C1..C7=PASS/FAIL、SHAPE_VALID=yes/no、CHECKER_ID=…、COVERAGE=…；exit 0（合格）/ 5（不合格）
"""
import argparse
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER_DIR = os.path.join(os.path.dirname(HERE), 'dsh-checker')
sys.path.insert(0, CHECKER_DIR)
import validate as V  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workdir', required=True)
    ap.add_argument('--slug', default='s01')
    ap.add_argument('--json', default='')
    ap.add_argument('--require-coverage', choices=['yes', 'no'], default='yes')
    ap.add_argument('--probe-submission', default='')
    ap.add_argument('--probe-out', default='')
    ap.add_argument('--strict', action='store_true')
    args = ap.parse_args()

    W = os.path.abspath(args.workdir)
    ck_path = os.path.join(W, 'out', 'checker', 'checker.json')
    cov_path = os.path.join(W, 'out', 'checker', 'rubric-coverage.json')
    prov_path = os.path.join(W, 'out', 'checker', 'checker.provenance.json')
    rubric = os.path.join(W, 'materials', 'rubric.md')
    standard = os.path.join(W, 'materials', 'standard')
    checks = {}
    violations = []
    strict_partial = False

    def fail(cid, msg):
        checks[cid] = 'FAIL'
        violations.append('%s %s' % (cid, msg))

    def ok(cid):
        checks[cid] = 'PASS'

    checker = None
    if not os.path.isfile(ck_path):
        fail('C1', 'checker_missing:' + os.path.relpath(ck_path, W))
    else:
        try:
            checker = V.load_checker(ck_path)
        except (OSError, ValueError) as exc:
            fail('C1', 'checker_unparsable:' + type(exc).__name__)
        else:
            v = V.validate_checker(checker)
            if v:
                fail('C1', 'validate_violations:' + '|'.join(v[:6]))
            else:
                ok('C1')

    if checker and checks.get('C1') == 'PASS':
        try:
            p = subprocess.run([sys.executable, os.path.join(CHECKER_DIR, 'validate.py'), ck_path],
                               cwd='/tmp', capture_output=True, text=True, timeout=120,
                               env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'})
            line = [l for l in p.stdout.splitlines() if l.startswith('checker_id=')]
            recomputed = line[0].split('=', 1)[1] if line else ''
            if p.returncode == 0 and recomputed == checker.get('checker_id'):
                checks['C2'] = 'PASS'
            else:
                fail('C2', 'second_process_rc=%d recomputed=%s declared=%s' % (
                    p.returncode, recomputed[:20], str(checker.get('checker_id'))[:20]))
        except (OSError, subprocess.SubprocessError) as exc:
            fail('C2', 'second_process_error:' + type(exc).__name__)

        ar = checker.get('assignment_ref') or {}
        exp_rubric = 'sha256:' + V.content_sha256(rubric) if os.path.isfile(rubric) else ''
        exp_std, _n = V.dir_sha256(standard, (checker.get('input_contract') or {}).get('ignore') or []) \
            if os.path.isdir(standard) else ('', 0)
        if exp_rubric and exp_std:
            if ar.get('rubric_hash') == exp_rubric and ar.get('standard_hash') == exp_std:
                ok('C3')
            else:
                fail('C3', 'hash_anchor_mismatch rubric=%s/%s standard=%s/%s' % (
                    str(ar.get('rubric_hash'))[:14], exp_rubric[:14],
                    str(ar.get('standard_hash'))[:14], exp_std[:14]))
        else:
            fail('C3', 'materials_missing（无法锚定）')

        sc = checker.get('scoring') or {}
        preds = checker.get('predicates') or []
        total = sum(p.get('max_score', 0) for p in preds if isinstance(p.get('max_score'), (int, float)))
        if total > sc.get('max_score', 0):
            fail('C4', 'sum_predicates_%s_exceeds_max_score_%s' % (total, sc.get('max_score')))
        elif total < sc.get('max_score', 0):
            explained = bool(checker.get('_note')) or bool(checker.get('deductions')) or any(p.get('deductions') for p in preds)
            if explained:
                ok('C4')
            else:
                fail('C4', 'unexplained_gap sum=%s max=%s' % (total, sc.get('max_score')))
        else:
            ok('C4')
        if checks.get('C4') == 'PASS' and os.path.isfile(rubric):
            text = open(rubric, encoding='utf-8', errors='replace').read()
            m = re.search(r'(?:满分|合计)[:：]?\s*(\d+)\s*分', text)
            if m and int(m.group(1)) != sc.get('max_score'):
                fail('C4', 'rubric_max_score_%s_vs_scoring_%s' % (m.group(1), sc.get('max_score')))

        t1 = sorted(set(p.get('rule_type') for p in preds if p.get('rule_type') in V.T1_RULE_TYPES))
        if t1:
            fail('C5', 'T1_rule_types:' + ','.join(t1))
        else:
            ok('C5')

        if not os.path.isfile(cov_path) and args.require_coverage == 'no':
            checks['C6'] = 'PASS'
            violations.append('C6_SKIPPED measure-only：覆盖率由装置侧 coverage_report.py 生成')
        elif not os.path.isfile(cov_path):
            fail('C6', 'coverage_missing:' + os.path.relpath(cov_path, W))
        else:
            try:
                cov = json.load(open(cov_path, encoding='utf-8'))
            except ValueError as exc:
                fail('C6', 'coverage_unparsable:' + type(exc).__name__)
            else:
                pids = set(p.get('id') for p in preds)
                dangling = []
                for sec in cov.get('sections', []) or []:
                    for pid in (sec.get('predicates') or []):
                        if pid not in pids:
                            dangling.append('%s@%s' % (pid, sec.get('sid')))
                if 'uncovered' not in cov:
                    fail('C6', 'uncovered_field_missing')
                elif dangling:
                    fail('C6', 'dangling_refs:' + ','.join(dangling[:4]))
                elif not cov.get('sections'):
                    fail('C6', 'sections_empty')
                else:
                    ok('C6')

        ex = []
        allowed = ('.json', '.txt', '.md')
        for dp, dn, fn in os.walk(os.path.join(W, 'out', 'checker')):
            for f in sorted(fn):
                p = os.path.join(dp, f)
                rel = os.path.relpath(p, W)
                if os.access(p, os.X_OK):
                    ex.append('exec_bit:' + rel)
                elif not f.endswith(allowed):
                    ex.append('ext_not_allowed:' + rel)
        if ex:
            fail('C7', ','.join(ex[:4]))
        else:
            ok('C7')

        # C8 可量性探针：对该作业**全部提交**逐份零 LLM 试跑 check.py（输出到 out/probe/，不写契约产物）
        sub_root = os.path.join(W, 'materials', 'submissions')
        if args.probe_submission:
            subs = [args.probe_submission]
        elif os.path.isdir(sub_root):
            subs = [os.path.join(sub_root, d) for d in sorted(os.listdir(sub_root))
                    if os.path.isdir(os.path.join(sub_root, d))]
        else:
            subs = []
        if not subs:
            fail('C8', 'no_submission_to_probe')
        else:
            rub = os.path.join(W, 'materials', 'rubric.md')
            std = os.path.join(W, 'materials', 'standard')
            probe_dir = os.path.join(W, 'out', 'probe')
            os.makedirs(probe_dir, exist_ok=True)
            results = []
            for sub in subs:
                name = os.path.basename(os.path.normpath(sub))
                out_json = os.path.join(probe_dir, name + '.json')
                cmd = [sys.executable, os.path.join(CHECKER_DIR, 'check.py'), '--checker', ck_path,
                       '--submission', sub, '--submission-id', 'c8-probe-' + name, '--out', out_json]
                if os.path.isfile(rub):
                    cmd += ['--rubric', rub]
                if os.path.isdir(std):
                    cmd += ['--standard', std]
                ok_probe, why = False, ''
                try:
                    pr = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                    out_txt = (pr.stdout or '') + (pr.stderr or '')
                    ok_probe = (pr.returncode == 0 and 'INPUT_PROBLEM' not in out_txt)
                    if not ok_probe:
                        hit = [l for l in out_txt.splitlines() if 'INPUT_PROBLEM' in l]
                        tail = out_txt.strip().splitlines()[-1] if out_txt.strip() else ''
                        why = 'rc=%d:%s' % (pr.returncode, (hit[0] if hit else tail)[:140])
                except (OSError, subprocess.SubprocessError) as exc:
                    why = 'probe_error:' + type(exc).__name__
                results.append({'slug': name, 'submission': os.path.relpath(sub, W), 'measurable': ok_probe,
                                'status': 'MEASURABLE' if ok_probe else 'UNMEASURABLE', 'reason': why})
            measurable = sum(1 for r in results if r['measurable'])
            unmeasurable = len(results) - measurable
            if not os.path.isdir(os.path.join(W, 'out', 'diagnostics')):
                os.makedirs(os.path.join(W, 'out', 'diagnostics'), exist_ok=True)
            probe_doc = {'schema_version': 'measurable-probe/1',
                         'checker_id': (checker or {}).get('checker_id'),
                         'submissions_total': len(results), 'measurable': measurable,
                         'unmeasurable': unmeasurable, 'strict': bool(args.strict), 'results': results}
            with open(os.path.join(W, 'out', 'diagnostics', 'measurable.json'), 'w', encoding='utf-8') as f:
                json.dump(probe_doc, f, ensure_ascii=False, indent=2)
                f.write(chr(10))
            print('MEASURABLE=%d UNMEASURABLE=%d' % (measurable, unmeasurable))
            for r in results:
                if not r['measurable']:
                    print('UNMEASURABLE ' + r['slug'] + ' :: ' + r['reason'])
            if measurable == 0:
                first = next((r['reason'] for r in results if r['reason']), '')
                fail('C8', 'all_unmeasurable:%d/%d:%s' % (unmeasurable, len(results), first[:140]))
            elif unmeasurable and args.strict:
                checks['C8'] = 'PASS'
                violations.append('C8_PARTIAL_STRICT:%d/%d_unmeasurable' % (unmeasurable, len(results)))
                strict_partial = True
            else:
                checks['C8'] = 'PASS'
    valid = all(v == 'PASS' for v in checks.values()) and len(checks) == 8
    doc = {'schema_version': 'shape-checks/1', 'workdir': os.path.basename(W), 'slug': args.slug,
           'checks': checks, 'violations': violations, 'shape_valid': valid,
           'checker_id': (checker or {}).get('checker_id') if checker else None,
           'coverage_file': os.path.relpath(cov_path, W) if os.path.isfile(cov_path) else None,
           'provenance_file': os.path.relpath(prov_path, W) if os.path.isfile(prov_path) else None,
           'probe': (locals().get('probe_doc') or None),
           'strict_partial': strict_partial}
    cov_summary = ''
    if os.path.isfile(cov_path):
        try:
            cov = json.load(open(cov_path, encoding='utf-8'))
            st = cov.get('states') or {}
            if not st:
                st = {'covered': 0, 'partially_covered': 0, 'uncovered': 0, 'subjective': 0}
                for sec in cov.get('sections', []) or []:
                    k = sec.get('state')
                    if k in st:
                        st[k] += 1
            cov_summary = 'covered:%d/partial:%d/uncovered:%d/subjective:%d' % (
                st.get('covered', 0), st.get('partially_covered', 0),
                st.get('uncovered', 0), st.get('subjective', 0))
        except ValueError:
            cov_summary = 'unparsable'
    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write(chr(10))
    for cid in ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']:
        print('SHAPE_%s=%s' % (cid, checks.get(cid, 'SKIP')))
    print('SHAPE_VIOLATIONS=%d' % len(violations))
    for v in violations:
        print('VIOLATION ' + v)
    print('SHAPE_VALID=%s CHECKER_ID=%s COVERAGE=%s' % (
        'yes' if valid else 'no', doc['checker_id'] or 'none', cov_summary or 'none'))
    if strict_partial and valid:
        return 1
    return 0 if valid else 5


if __name__ == '__main__':
    sys.exit(main())
