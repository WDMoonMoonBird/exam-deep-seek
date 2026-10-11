#!/usr/bin/env python3
"""checker-result/1 确定性执行器（纯 stdlib、离线、零 LLM / 零网络 / 零子进程）。

判据来源：docs/dsh/R1-A-设计.md §2（接口/输出 schema）、§1.3（谓词词表）、§1.4（哈希口径）。

用法：
  python3 check.py --checker <checker.json> --submission <提交目录> [--root-rel R] [--submission-id ID]
                   [--rubric <当前 rubric.md>] [--standard <当前标准包目录>] [--out <result.json>] [--canonical]
                   [--poison none|timestamp|mtime|readdir|hashseed] [--allow-nondeterministic]
  python3 check.py --checker <checker.json> --batch <含 zip 的目录> --out <输出目录> [--dedup none|digest]
  python3 check.py --purity-probe <network|subprocess|time|random|env>

退出码：0=已评估（分数高低都是 0）；3=checker 非法；4=输入问题 / stale；6=出现 T1 谓词（fail-closed，不给分）。
"""
import argparse
import fnmatch
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import validate as V  # noqa: E402
import purity as P  # noqa: E402

LAST_PURITY_VIOLATIONS = []  # 由 evaluate() 写入，main() 打印（不进产物，避免污染 canonical）

TOOL = 'dsh-checker/1'
EXIT_OK, EXIT_CHECKER, EXIT_INPUT, EXIT_UNSUPPORTED = 0, 3, 4, 6
SIX_STATES = ['hit', 'miss', 'missing', 'empty', 'unreadable', 'unsupported']
WHEN_RE = re.compile(r'^(hit|status|count)\s*(==|!=|>=|<=|>|<)\s*(\S+)$')


class InputProblem(Exception):
    pass


def num(x):
    """整数就输出整数，否则 1 位小数（量化到 0.1，禁用浮点累加）。"""
    x = round(x, 1)
    return int(x) if abs(x - int(x)) < 1e-9 else x


def q10(x):
    return int(round(x * 10))


def canon_sha256(result):
    doc = {k: v for k, v in result.items() if k not in ('run_meta', 'canonical_sha256')}
    return hashlib.sha256(V.canonical_json_bytes(doc)).hexdigest()


def safe_join(root, rel):
    if os.path.isabs(rel) or '..' in rel.split('/'):
        raise InputProblem('path_escapes_root:' + str(rel))
    p = os.path.join(root, rel)
    rr = os.path.realpath(root)
    rp = os.path.realpath(p)
    if not (rp == rr or rp.startswith(rr + os.sep)):
        raise InputProblem('path_escapes_root:' + str(rel))
    return p


def norm_text(raw):
    """确定性文本归一化：UTF-8(errors=replace) → CRLF→LF → 去每行尾空白。"""
    if isinstance(raw, bytes):
        text = raw.decode('utf-8', errors='replace')
    else:
        text = raw
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    return '\n'.join(line.rstrip() for line in text.split('\n'))


def read_bytes(root, rel):
    p = safe_join(root, rel)
    if not os.path.exists(p):
        return None
    if os.path.isdir(p):
        return 'DIR'
    with open(p, 'rb') as f:
        return f.read()


def file_status(root, rel):
    p = safe_join(root, rel)
    if not os.path.exists(p):
        return 'missing', None
    if os.path.isdir(p):
        return 'miss', 'DIR'
    if os.path.getsize(p) == 0:
        return 'empty', b''
    try:
        with open(p, 'rb') as f:
            return 'ok', f.read()
    except OSError:
        return 'unreadable', None


def ev_row(rel, line=None, quote=None, quote_max=120):
    if quote is None:
        return {'path': rel, 'line': line, 'quote_sha256': None}
    q = quote[:quote_max]
    return {'path': rel, 'line': line,
            'quote_sha256': 'sha256:' + hashlib.sha256(q.encode('utf-8')).hexdigest()}


def glob_files(root, path_glob, ignore):
    out = []
    for rel, _abs, is_link in V.walk_filtered(root, ignore):
        if is_link:
            continue
        if fnmatch.fnmatch(rel, path_glob):
            out.append(rel)
    return out


def first_match_line(text, needle, regex):
    for i, line in enumerate(text.split('\n'), 1):
        if (re.search(needle, line) if regex else (needle in line)):
            return i, line
    return None, None


def eval_predicate(p, root, ic, quote_max):
    rt = p['rule_type']
    params = p.get('params') or {}
    ev = []
    if rt in V.T1_RULE_TYPES:
        return {'status': 'unsupported', 'hit': False, 'target': str(params),
                'expected': '需要解析器（T1，本轮不支持）', 'observed': 'unsupported', 'evidence': []}
    if rt == 'file_exists':
        rel = params['path']
        st, data = file_status(root, rel)
        if st == 'missing':
            return {'status': 'missing', 'hit': False, 'target': rel, 'expected': '文件存在且 size>0',
                    'observed': '缺失', 'evidence': [ev_row(rel, None, None, quote_max)]}
        if st == 'miss':
            return {'status': 'miss', 'hit': False, 'target': rel, 'expected': '文件存在且 size>0',
                    'observed': '是目录（不计命中）', 'evidence': [ev_row(rel, None, None, quote_max)]}
        if st == 'empty':
            return {'status': 'empty', 'hit': False, 'target': rel, 'expected': '文件存在且 size>0',
                    'observed': '空文件', 'evidence': [ev_row(rel, None, None, quote_max)]}
        if st == 'unreadable':
            return {'status': 'unreadable', 'hit': False, 'target': rel, 'expected': '文件存在且 size>0',
                    'observed': '不可读', 'evidence': [ev_row(rel, None, None, quote_max)]}
        return {'status': 'hit', 'hit': True, 'target': rel, 'expected': '文件存在且 size>0',
                'observed': '存在（%d 字节）' % len(data), 'evidence': [ev_row(rel, 1, None, quote_max)]}
    if rt == 'dir_contains_file':
        d, pat = params['dir'], params['name_glob']
        dp = safe_join(root, d)
        if not os.path.isdir(dp):
            return {'status': 'missing', 'hit': False, 'target': d + '/' + pat, 'expected': '目录下存在匹配文件',
                    'observed': '目录缺失', 'evidence': [ev_row(d, None, None, quote_max)]}
        names = sorted(n for n in os.listdir(dp) if fnmatch.fnmatch(n, pat))
        if names:
            return {'status': 'hit', 'hit': True, 'target': d + '/' + pat, 'expected': '目录下存在匹配文件',
                    'observed': '命中 ' + names[0], 'evidence': [ev_row(d + '/' + names[0], None, None, quote_max)]}
        return {'status': 'miss', 'hit': False, 'target': d + '/' + pat, 'expected': '目录下存在匹配文件',
                'observed': '无匹配', 'evidence': [ev_row(d, None, None, quote_max)]}
    if rt in ('contains_text', 'contains_regex'):
        rel, min_count = params['path'], int(params.get('min_count', 1))
        needle = params.get('text') if rt == 'contains_text' else params.get('pattern')
        st, data = file_status(root, rel)
        if st == 'missing':
            return {'status': 'missing', 'hit': False, 'target': rel, 'expected': '出现次数 >= %d' % min_count,
                    'observed': '缺失', 'evidence': [ev_row(rel, None, None, quote_max)]}
        if st == 'empty':
            return {'status': 'empty', 'hit': False, 'target': rel, 'expected': '出现次数 >= %d' % min_count,
                    'observed': '空文件', 'evidence': [ev_row(rel, None, None, quote_max)]}
        if st == 'unreadable':
            return {'status': 'unreadable', 'hit': False, 'target': rel, 'expected': '出现次数 >= %d' % min_count,
                    'observed': '不可读', 'evidence': [ev_row(rel, None, None, quote_max)]}
        text = norm_text(data)
        count = len(re.findall(needle, text)) if rt == 'contains_regex' else text.count(needle)
        line, quote = first_match_line(text, needle, rt == 'contains_regex')
        ev = [ev_row(rel, line, quote, quote_max)] if count else [ev_row(rel, None, None, quote_max)]
        return {'status': 'hit' if count >= min_count else 'miss', 'hit': count >= min_count, 'target': rel,
                'expected': '出现次数 >= %d' % min_count, 'observed': '计数 %d' % count,
                'count': count, 'evidence': ev}
    if rt == 'count_regex':
        pat, lo, hi = params['path_glob'], int(params['min']), int(params['max'])
        total = 0
        ev = []
        files = glob_files(root, pat, ic['ignore'])
        for rel in files:
            st, data = file_status(root, rel)
            if st in ('ok',):
                c = len(re.findall(params['pattern'], norm_text(data)))
                total += c
                if c:
                    line, quote = first_match_line(norm_text(data), params['pattern'], True)
                    ev.append(ev_row(rel, line, quote, quote_max))
        if not files:
            return {'status': 'missing', 'hit': False, 'target': pat, 'expected': '%d <= 计数 <= %d' % (lo, hi),
                    'observed': '无匹配文件', 'evidence': [ev_row(pat, None, None, quote_max)]}
        return {'status': 'hit' if lo <= total <= hi else 'miss', 'hit': lo <= total <= hi, 'target': pat,
                'expected': '%d <= 计数 <= %d' % (lo, hi), 'observed': '计数 %d' % total, 'count': total,
                'evidence': ev[:3] or [ev_row(pat, None, None, quote_max)]}
    if rt == 'count_imports':
        pat, module = params['path_glob'], params['module']
        esc = re.escape(module)
        rx = re.compile(r"(from\s+['\"]" + esc + r"['\"]|require\(\s*['\"]" + esc + r"['\"]\s*\))")
        total, ev, files = 0, [], glob_files(root, pat, ic['ignore'])
        for rel in files:
            st, data = file_status(root, rel)
            if st != 'ok':
                continue
            text = norm_text(data)
            c = len(rx.findall(text))
            total += c
            if c:
                line, quote = first_match_line(text, esc, False)
                ev.append(ev_row(rel, line, quote, quote_max))
        if not files:
            return {'status': 'missing', 'hit': False, 'target': pat, 'expected': '导入 %s 计数 >= 1' % module,
                    'observed': '无匹配文件', 'evidence': [ev_row(pat, None, None, quote_max)]}
        return {'status': 'hit' if total >= 1 else 'miss', 'hit': total >= 1, 'target': pat,
                'expected': '导入 %s 计数 >= 1' % module, 'observed': '计数 %d' % total, 'count': total,
                'evidence': ev[:3] or [ev_row(pat, None, None, quote_max)]}
    if rt == 'file_count_in_dir':
        d, lo, hi = params['dir'], int(params['min']), int(params['max'])
        ext, recursive = params.get('ext'), bool(params.get('recursive'))
        dp = safe_join(root, d)
        if not os.path.isdir(dp):
            return {'status': 'missing', 'hit': False, 'target': d, 'expected': '%d <= 文件数 <= %d' % (lo, hi),
                    'observed': '目录缺失', 'evidence': [ev_row(d, None, None, quote_max)]}
        n = 0
        if recursive:
            for dirpath, dirnames, filenames in os.walk(dp):
                dirnames.sort()
                for fn in sorted(filenames):
                    if fnmatch.fnmatch(fn, ext):
                        n += 1
        else:
            n = len([x for x in sorted(os.listdir(dp)) if fnmatch.fnmatch(x, ext)])
        return {'status': 'hit' if lo <= n <= hi else 'miss', 'hit': lo <= n <= hi, 'target': d,
                'expected': '%d <= 文件数 <= %d' % (lo, hi), 'observed': '计数 %d' % n, 'count': n,
                'evidence': [ev_row(d, None, None, quote_max)]}
    if rt == 'glob_covers':
        pats = params['patterns']
        hits, misses = [], []
        for pat in sorted(pats):
            got = glob_files(root, pat, ic['ignore'])
            if got:
                hits.append(got[0])
            else:
                misses.append(pat)
        ok = not misses
        ev = [ev_row(p2, None, None, quote_max) for p2 in (hits[:2] or misses[:1])] or [ev_row('.', None, None, quote_max)]
        return {'status': 'hit' if ok else 'miss', 'hit': ok, 'target': ','.join(sorted(pats)),
                'expected': '每个 pattern 至少 1 个文件', 'observed': ('缺 ' + ','.join(misses)) if misses else '全部覆盖',
                'evidence': ev}
    raise InputProblem('unhandled_rule_type:' + str(rt))


def when_matches(expr, row):
    m = WHEN_RE.match(expr.strip())
    if not m:
        raise InputProblem('bad_when_expr:' + expr)
    var, op, raw = m.group(1), m.group(2), m.group(3)
    val = row.get('count') if var == 'count' else (row.get('hit') if var == 'hit' else row.get('status'))
    if var == 'status':
        left = str(row.get('status'))
        right = raw
        return (left == right) if op == '==' else (left != right)
    try:
        left = 1 if var == 'hit' and val is True else (0 if var == 'hit' and val is False else int(val))
        right = int(raw)
    except (TypeError, ValueError):
        raise InputProblem('bad_when_value:' + expr)
    return {'==': left == right, '!=': left != right, '>': left > right,
            '<': left < right, '>=': left >= right, '<=': left <= right}[op]


def evaluate(checker, root, *, submission_id=None, root_rel=None, allow_nondeterministic=False):
    ic = checker['input_contract']
    quote_max = int(checker['evidence_policy'].get('quote_max_chars', 120))
    if root_rel:
        proj = safe_join(root, root_rel)
    else:
        cands = sorted([rel for rel in glob_files(root, ic['project_root_glob'], ic['ignore'])
                        if '/' not in rel or True], key=lambda r: (r.count('/'), r))
        if not cands:
            raise InputProblem('project_root_not_found:' + ic['project_root_glob'])
        proj_rel = os.path.dirname(cands[0])
        proj = os.path.join(root, proj_rel) if proj_rel else root
        root_rel = proj_rel
    if not os.path.isdir(proj):
        raise InputProblem('project_root_missing:' + str(root_rel))
    digest, file_count = V.dir_sha256(proj, ic['ignore'])
    items, matrix, unsupported, errors = [], [], [], []
    with P.purity_guard() as guard:
        for p in checker['predicates']:
            try:
                row = eval_predicate(p, proj, ic, quote_max)
            except InputProblem:
                raise
            except Exception as exc:  # 异常一律转 status，不抛出（纯函数约束）
                name = type(exc).__name__
                row = {'status': 'unreadable', 'hit': False, 'target': str(p.get('params')),
                       'expected': '—', 'observed': 'evaluator_error:' + name, 'evidence': []}
                errors.append({'item_id': p.get('id'), 'error': name})
            base = q10(p['max_score']) if row['hit'] else 0
            applied = []
            for d in (p.get('deductions') or []):
                if when_matches(d['when'], row):
                    base += q10(d['delta'])
                    applied.append(d['code'])
            for d in (checker.get('deductions') or []):
                m = d.get('match') or {}
                if m.get('rule_type') not in (None, '*', p['rule_type']):
                    continue
                if 'status' in m and m['status'] != row['status']:
                    continue
                if 'group' in m and m['group'] != p.get('group'):
                    continue
                base += q10(d['delta'])
                applied.append(d['code'])
            base = max(0, min(base, q10(p['max_score'])))
            score = num(base / 10.0)
            if row['status'] == 'unsupported':
                unsupported.append(p['id'])
            items.append({'id': p['id'], 'group': p.get('group'), 'item': p.get('item'),
                          'rule_type': p['rule_type'], 'max_score': num(p['max_score']), 'score': score,
                          'pass': bool(row['hit']), 'status': row['status'],
                          'deductions': sorted(set(applied)), 'evidence': row['evidence']})
            matrix.append({'item_id': p['id'], 'predicate': p['rule_type'], 'target': row['target'],
                           'expected': row['expected'], 'observed': row['observed'], 'hit': bool(row['hit']),
                           'score': score, 'max': num(p['max_score']),
                           'evidence_refs': sorted(set(e['path'] for e in row['evidence']))})
    global LAST_PURITY_VIOLATIONS
    LAST_PURITY_VIOLATIONS = guard.all_violations()
    total_q10 = sum(q10(it['score']) for it in items)
    total_q10 = max(0, min(total_q10, q10(checker['scoring']['max_score'])))
    scored = not unsupported
    result = {
        'schema_version': 'checker-result/1',
        'checker_id': checker['checker_id'],
        'submission': {'id': submission_id or os.path.basename(os.path.abspath(root)),
                       'root_rel': root_rel or '.',
                       'digest': digest, 'file_count': file_count},
        'items': items,
        'totals': {'score': num(total_q10 / 10.0) if scored else None,
                   'max_score': num(checker['scoring']['max_score']) if scored else None,
                   'aggregate': checker['scoring']['aggregate']},
        'reconciliation': {'expected_items': len(checker['predicates']), 'evaluated_items': len(items),
                           'unsupported': sorted(unsupported), 'errors': errors, 'matrix': matrix},
    }
    return result


def poison_value(kind, root):
    """E3 阴性对照：模拟「被测实现把非确定量泄漏进产物」。只在输出包装层动手，不改 checker。"""
    if kind == 'timestamp':
        return {'kind': kind, 'value': str(time.time_ns())}
    if kind == 'mtime':
        newest = 0.0
        for _rel, abspath, is_link in V.walk_filtered(root, ()):
            if not is_link:
                try:
                    newest = max(newest, os.path.getmtime(abspath))
                except OSError:
                    pass
        return {'kind': kind, 'value': repr(newest)}
    if kind == 'readdir':
        try:
            raw = repr(os.listdir(os.getcwd()))
        except OSError:
            raw = 'cwd_unreadable'
        return {'kind': kind, 'value': 'sha256:' + hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]}
    if kind == 'hashseed':
        names = [rel for rel, _a, _l in V.walk_filtered(root, ())]
        names += ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
        joined = '|'.join(list(set(names)))
        return {'kind': kind, 'value': 'sha256:' + hashlib.sha256(joined.encode('utf-8')).hexdigest()[:32]}
    return None


def safe_extract_zip(zip_path, dest):
    os.makedirs(dest, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            raw = info.filename
            name = raw if (info.flag_bits & 0x800) else _fix_name(raw)
            if name.startswith('/') or '..' in name.split('/'):
                raise InputProblem('unsafe_zip_entry:' + name)
            parts = [x for x in name.split('/') if x not in ('', '.')]
            if not parts:
                continue
            target = os.path.join(dest, *parts)
            if info.is_dir() or raw.endswith('/'):
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(info) as src, open(target, 'wb') as out:
                shutil.copyfileobj(src, out)


def _fix_name(raw):
    try:
        return raw.encode('cp437').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return raw


def stale_check(checker, rubric_path, standard_path):
    ar = checker['assignment_ref']
    reasons = []
    if rubric_path:
        if 'sha256:' + V.content_sha256(rubric_path) != ar['rubric_hash']:
            reasons.append('rubric_hash_mismatch')
    if standard_path:
        cur, _n = V.dir_sha256(standard_path, (checker['input_contract'].get('ignore') or []))
        if cur != ar['standard_hash']:
            reasons.append('standard_hash_mismatch')
    return reasons


def stale_result(checker, submission_id, reasons, digest='sha256:unknown', root_rel='.'):
    return {
        'schema_version': 'checker-result/1', 'checker_id': checker['checker_id'],
        'submission': {'id': submission_id, 'root_rel': root_rel, 'digest': digest, 'file_count': 0},
        'stale': True, 'stale_reason': sorted(reasons), 'items': [],
        'totals': {'score': None, 'max_score': None, 'aggregate': checker['scoring']['aggregate']},
        'reconciliation': {'expected_items': len(checker['predicates']), 'evaluated_items': 0,
                           'unsupported': [], 'errors': sorted(reasons), 'matrix': []},
    }


def emit(result, out_path, canonical, poison):
    doc = dict(result)
    doc['canonical_sha256'] = canon_sha256(result)
    doc['run_meta'] = {'tool': TOOL, 'elapsed_ms': 0, 'poison': poison or 'none'}
    if out_path:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2, sort_keys=False)
            f.write(chr(10))
    if canonical:
        print(doc['canonical_sha256'])
    return doc


def run_batch(checker, batch_dir, out_dir, dedup):
    zips = sorted([f for f in os.listdir(batch_dir) if f.endswith('.zip')])
    if not zips:
        raise InputProblem('no_zip_in_batch:' + batch_dir)
    os.makedirs(out_dir, exist_ok=True)
    seen, results, skipped = {}, [], []
    tmp = tempfile.mkdtemp(prefix='dsh-checker-batch-')
    try:
        for name in zips:
            zp = os.path.join(batch_dir, name)
            digest = 'sha256:' + V.content_sha256(zp)
            if dedup == 'digest' and digest in seen:
                skipped.append({'zip': name, 'dup_of': seen[digest], 'digest': digest})
                continue
            seen.setdefault(digest, name)
            slug = 'b%03d' % (len(results) + len(skipped) + 1)
            dest = os.path.join(tmp, slug)
            safe_extract_zip(zp, dest)
            try:
                res = evaluate(checker, dest, submission_id=os.path.splitext(name)[0])
                rc = EXIT_UNSUPPORTED if res['reconciliation']['unsupported'] else EXIT_OK
            except InputProblem as exc:
                rc = EXIT_INPUT
                res = {'schema_version': 'checker-result/1', 'checker_id': checker['checker_id'],
                       'submission': {'id': os.path.splitext(name)[0], 'root_rel': '.', 'digest': digest,
                                      'file_count': 0},
                       'input_problem': str(exc), 'items': [], 'totals': {'score': None, 'max_score': None},
                       'reconciliation': {'expected_items': len(checker['predicates']), 'evaluated_items': 0,
                                          'unsupported': [], 'errors': [str(exc)], 'matrix': []}}
            doc = emit(res, os.path.join(out_dir, 'result-' + slug + '.json'), False, 'none')
            results.append({'zip': name, 'slug': slug, 'digest': digest, 'exit': rc,
                            'score': doc['totals']['score'], 'canonical_sha256': doc['canonical_sha256'],
                            'submission_id': doc['submission']['id']})
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    groups = {}
    for r in results:
        groups.setdefault(r['digest'], []).append(r['submission_id'])
    comparability = {
        'schema_version': 'comparability/1',
        'checker_id': checker['checker_id'],
        'assignment_id': checker['assignment_ref']['assignment_id'],
        'batch_dir': os.path.basename(os.path.abspath(batch_dir)),
        'zips_total': len(zips),
        'unique_digests': len(groups),
        'evaluated': len(results),
        'skipped_duplicates': skipped,
        'dedup_policy': dedup,
        'groups': [{'assignment_id': checker['assignment_ref']['assignment_id'],
                    'checker_id': checker['checker_id'],
                    'submissions': sorted(v), 'digest': k,
                    'comparable_within': True, 'comparable_across': False,
                    'reason': 'same_checker_id' if len(v) > 1 else 'single_member'}
                   for k, v in sorted(groups.items())],
        'cross_group': 'not_comparable',
    }
    with open(os.path.join(out_dir, 'comparability.json'), 'w', encoding='utf-8') as f:
        json.dump(comparability, f, ensure_ascii=False, indent=2)
        f.write(chr(10))
    with open(os.path.join(out_dir, 'batch-index.json'), 'w', encoding='utf-8') as f:
        json.dump({'results': results, 'skipped': skipped}, f, ensure_ascii=False, indent=2)
        f.write(chr(10))
    return comparability


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--checker', required=False)
    ap.add_argument('--submission')
    ap.add_argument('--root-rel')
    ap.add_argument('--submission-id')
    ap.add_argument('--rubric')
    ap.add_argument('--standard')
    ap.add_argument('--out')
    ap.add_argument('--canonical', action='store_true')
    ap.add_argument('--batch')
    ap.add_argument('--dedup', choices=['none', 'digest'], default='none')
    ap.add_argument('--poison', choices=['none', 'timestamp', 'mtime', 'readdir', 'hashseed'], default='none')
    ap.add_argument('--allow-nondeterministic', action='store_true')
    ap.add_argument('--purity-probe', choices=P.PROBE_KINDS)
    args = ap.parse_args(argv)
    t0 = time.time()

    if args.purity_probe:
        fired, viol = P.probe(args.purity_probe)
        print('PURITY_PROBE=%s %s' % (args.purity_probe, 'TRIGGERED' if fired else 'NOT_TRIGGERED'))
        for x in viol:
            print('VIOLATION ' + x)
        return EXIT_OK if fired else 1

    if not args.checker:
        print('USAGE_ERROR --checker 必填')
        return EXIT_CHECKER
    try:
        checker = V.load_checker(args.checker)
    except (OSError, ValueError) as exc:
        print('CHECKER_UNREADABLE %s' % type(exc).__name__)
        return EXIT_CHECKER
    violations = V.validate_checker(checker)
    if violations:
        for x in violations:
            print('CHECKER_VIOLATION ' + x)
        print('CHECKER_VALID=no (%d violations)' % len(violations))
        return EXIT_CHECKER
    print('CHECKER_VALID=yes checker_id=' + checker['checker_id'])

    if args.batch:
        if not os.path.isdir(args.batch):
            print('INPUT_PROBLEM batch_dir_missing')
            return EXIT_INPUT
        out_dir = args.out or os.path.join(args.batch, 'out')
        comp = run_batch(checker, args.batch, out_dir, args.dedup)
        print('BATCH_OK zips=%d unique=%d evaluated=%d skipped=%d out=%s' % (
            comp['zips_total'], comp['unique_digests'], comp['evaluated'],
            len(comp['skipped_duplicates']), out_dir))
        print('COMPARABILITY=' + os.path.join(out_dir, 'comparability.json'))
        return EXIT_OK

    if not args.submission or not os.path.isdir(args.submission):
        print('INPUT_PROBLEM submission_dir_missing')
        return EXIT_INPUT
    reasons = stale_check(checker, args.rubric, args.standard)
    if reasons:
        doc = emit(stale_result(checker, args.submission_id or os.path.basename(os.path.abspath(args.submission)),
                                reasons), args.out, args.canonical, args.poison)
        print('STALE=true reason=' + ','.join(sorted(reasons)))
        print('SCORE_WITHHELD=true (stale：不给分)')
        return EXIT_INPUT
    try:
        result = evaluate(checker, args.submission, submission_id=args.submission_id,
                          root_rel=args.root_rel, allow_nondeterministic=args.allow_nondeterministic)
    except InputProblem as exc:
        print('INPUT_PROBLEM ' + str(exc))
        if args.out:
            emit({'schema_version': 'checker-result/1', 'checker_id': checker['checker_id'],
                  'submission': {'id': args.submission_id or os.path.basename(os.path.abspath(args.submission)),
                                 'root_rel': args.root_rel or '.', 'digest': 'sha256:unknown', 'file_count': 0},
                  'input_problem': str(exc), 'items': [], 'totals': {'score': None, 'max_score': None},
                  'reconciliation': {'expected_items': len(checker['predicates']), 'evaluated_items': 0,
                                     'unsupported': [], 'errors': [str(exc)], 'matrix': []}},
                 args.out, args.canonical, args.poison)
        return EXIT_INPUT
    if args.poison and args.poison != 'none':
        pv = poison_value(args.poison, args.submission)
        if pv:
            result = dict(result)
            result['poison_probe'] = pv
    doc = emit(result, args.out, args.canonical, args.poison)
    doc['run_meta']['elapsed_ms'] = int((time.time() - t0) * 1000)
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, indent=2, sort_keys=False)
            f.write(chr(10))
    print('PURITY_VIOLATIONS=%d' % len(LAST_PURITY_VIOLATIONS))
    print('EVALUATED items=%d score=%s/%s canonical_sha256=%s' % (
        len(doc['items']), doc['totals']['score'], doc['totals']['max_score'], doc['canonical_sha256']))
    if doc['reconciliation']['unsupported']:
        print('UNSUPPORTED=%s （fail-closed：不给分，exit 6）' % ','.join(doc['reconciliation']['unsupported']))
        return EXIT_UNSUPPORTED
    return EXIT_OK


if __name__ == '__main__':
    sys.exit(main())
