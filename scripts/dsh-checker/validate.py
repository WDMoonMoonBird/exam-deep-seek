#!/usr/bin/env python3
"""checker.json v1 校验器 + checker_id 计算（纯 stdlib，离线）。

判据来源：docs/dsh/R1-A-设计.md §1.3（谓词词表）、§1.4（哈希口径）、§1.5（换尺子判据）。

哈希口径（写死，不许"顺手归一化"）：
- 文件内容：sha256(bytes)，不做换行/编码转换。
- 目录：先按 input_contract.ignore 过滤 → 按 POSIX 相对路径的**字节序**排序 →
  逐条喂 rel_path + "\n" + sha256(content) + "\n" → 最后 sha256(整体)。
  软链不跟随：内容按 b"symlink:" + target 参与哈希（防环、且确定）。
- checker_id 覆盖：schema_version / assignment_ref.{rubric_hash,standard_hash} / scoring /
  input_contract / predicates / deductions / evidence_policy；
  **不覆盖**：checker_id 自身、generated.*、assignment_ref.{assignment_id,question_id}、
  键序、空白、任何 "_" 前缀的注释键（递归剔除）。
"""
import fnmatch
import hashlib
import json
import os
import re

SCHEMA_VERSION = 'checker/1'
TOP_FIELDS = ['schema_version', 'checker_id', 'assignment_ref', 'generated', 'scoring',
              'input_contract', 'predicates', 'deductions', 'evidence_policy']
T0_RULE_TYPES = ['file_exists', 'dir_contains_file', 'contains_text', 'contains_regex',
                 'count_regex', 'count_imports', 'file_count_in_dir', 'glob_covers']
T1_RULE_TYPES = ['syntax_check', 'ast_pattern', 'fact', 'json_pattern', 'vue_sfc_parse']
PARAMS = {
    'file_exists': ['path'],
    'dir_contains_file': ['dir', 'name_glob'],
    'contains_text': ['path', 'text', 'min_count'],
    'contains_regex': ['path', 'pattern', 'min_count'],
    'count_regex': ['path_glob', 'pattern', 'min', 'max'],
    'count_imports': ['path_glob', 'module'],
    'file_count_in_dir': ['dir', 'min', 'max', 'ext', 'recursive'],
    'glob_covers': ['patterns'],
}
AGGREGATES = ['sum_clamped']
ROUNDINGS = ['half_up_1']
ID_RE = re.compile(r'^sha256:[0-9a-f]{64}$')
# T0 谓词里禁止的正则构造：反向断言（设计 §1.3）
FORBIDDEN_RE = [r'\(\?<=', r'\(\?<!']


def to_posix(rel):
    return rel.replace(os.sep, '/')


def content_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(1 << 16)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def is_ignored(rel_posix, ignore):
    """忽略规则：既按给定的根锚定模式匹配，也按任意深度匹配（'node_modules/**' 也能命中嵌套目录）。"""
    for pat in ignore or []:
        for cand in (pat, '**/' + pat):
            if fnmatch.fnmatch(rel_posix, cand):
                return True
            if fnmatch.fnmatch(rel_posix + '/', cand):
                return True
            prefix = cand[:-3] if cand.endswith('/**') else None
            if prefix and (rel_posix == prefix or rel_posix.startswith(prefix + '/')):
                return True
            if '/' + prefix + '/' in '/' + rel_posix + '/' if prefix else False:
                return True
    return False


def walk_filtered(root, ignore=()):
    """返回 [(rel_posix, abspath, is_symlink)]，按 POSIX 相对路径字节序排序；软链不跟随。"""
    out = []
    stack = [('', root)]
    seen = set()
    while stack:
        rel, cur = stack.pop()
        try:
            names = sorted(os.listdir(cur))
        except OSError:
            continue
        for name in names:
            r = name if not rel else rel + '/' + name
            if is_ignored(r, ignore):
                continue
            p = os.path.join(cur, name)
            try:
                st = os.lstat(p)
            except OSError:
                continue
            if os.path.islink(p):
                out.append((r, p, True))
                continue
            if os.path.isdir(p):
                real = os.path.realpath(p)
                if real in seen:
                    continue
                seen.add(real)
                stack.append((r, p))
            else:
                out.append((r, p, False))
    out.sort(key=lambda t: t[0].encode('utf-8'))
    return out


def dir_sha256(root, ignore=()):
    """返回 (digest, entry_count)。目录不存在 → ('sha256:absent', 0)。"""
    if not os.path.isdir(root):
        return 'sha256:absent', 0
    h = hashlib.sha256()
    n = 0
    for rel, abspath, is_link in walk_filtered(root, ignore):
        if is_link:
            try:
                target = os.readlink(abspath)
            except OSError:
                target = '?'
            digest = hashlib.sha256(('symlink:' + target).encode('utf-8')).hexdigest()
        else:
            try:
                digest = content_sha256(abspath)
            except OSError:
                digest = 'unreadable'
        h.update(rel.encode('utf-8') + b'\n' + digest.encode('utf-8') + b'\n')
        n += 1
    return 'sha256:' + h.hexdigest(), n


def strip_notes(obj):
    """递归剔除 '_' 前缀注释键（_note 等），用于 checker_id。"""
    if isinstance(obj, dict):
        return {k: strip_notes(v) for k, v in obj.items() if not (isinstance(k, str) and k.startswith('_'))}
    if isinstance(obj, list):
        return [strip_notes(v) for v in obj]
    return obj


def canonical_json_bytes(obj):
    return json.dumps(obj, sort_keys=True, ensure_ascii=False,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def checker_id_of(checker):
    doc = {
        'schema_version': checker.get('schema_version'),
        'assignment_ref': {
            'rubric_hash': (checker.get('assignment_ref') or {}).get('rubric_hash'),
            'standard_hash': (checker.get('assignment_ref') or {}).get('standard_hash'),
        },
        'scoring': checker.get('scoring'),
        'input_contract': checker.get('input_contract'),
        'predicates': checker.get('predicates'),
        'deductions': checker.get('deductions'),
        'evidence_policy': checker.get('evidence_policy'),
    }
    return 'sha256:' + hashlib.sha256(canonical_json_bytes(strip_notes(doc))).hexdigest()


def load_checker(path):
    with open(path, encoding='utf-8') as f:
        obj = json.load(f)
    if not isinstance(obj, dict):
        raise ValueError('checker 顶层必须是 JSON 对象')
    return obj


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_checker(checker):
    """返回违规列表（空 = 合法）。"""
    v = []
    if not isinstance(checker, dict):
        return ['checker_not_object']
    for f in TOP_FIELDS:
        if f not in checker:
            v.append('missing_field:' + f)
    if v:
        return v
    if checker.get('schema_version') != SCHEMA_VERSION:
        v.append('bad_schema_version:%r' % checker.get('schema_version'))
    ar = checker.get('assignment_ref')
    if not isinstance(ar, dict):
        v.append('assignment_ref_not_object')
    else:
        for f in ['assignment_id', 'question_id', 'rubric_hash', 'standard_hash']:
            if not ar.get(f):
                v.append('assignment_ref_missing:' + f)
        for f in ['rubric_hash', 'standard_hash']:
            if ar.get(f) and not (isinstance(ar[f], str) and (ar[f].startswith('sha256:') or ar[f] == 'sha256:absent')):
                v.append('assignment_ref_bad_hash:' + f)
    gen = checker.get('generated')
    if not isinstance(gen, dict):
        v.append('generated_not_object')
    else:
        for f in ['session_id', 'model', 'created_at', 'generator']:
            if f not in gen:
                v.append('generated_missing:' + f)
    sc = checker.get('scoring')
    if not isinstance(sc, dict):
        v.append('scoring_not_object')
    else:
        if not _is_num(sc.get('max_score')) or sc.get('max_score') <= 0:
            v.append('scoring_bad_max_score')
        if sc.get('aggregate') not in AGGREGATES:
            v.append('scoring_bad_aggregate:%r' % sc.get('aggregate'))
        if sc.get('rounding') not in ROUNDINGS:
            v.append('scoring_bad_rounding:%r' % sc.get('rounding'))
        if not sc.get('zero_credit_rule'):
            v.append('scoring_missing_zero_credit_rule')
    ic = checker.get('input_contract')
    if not isinstance(ic, dict):
        v.append('input_contract_not_object')
    else:
        for f in ['project_root_glob', 'required_paths', 'ignore', 'encoding']:
            if f not in ic:
                v.append('input_contract_missing:' + f)
        if ic.get('encoding') != 'utf-8':
            v.append('input_contract_bad_encoding:%r' % ic.get('encoding'))
        for pat in (ic.get('ignore') or []):
            if '{' in pat or '}' in pat:
                v.append('input_contract_ignore_brace:%s' % pat)
    ps = checker.get('predicates')
    if not isinstance(ps, list) or not ps:
        v.append('predicates_empty')
    else:
        ids = set()
        for i, p in enumerate(ps):
            tag = 'predicates[%d]' % i
            if not isinstance(p, dict):
                v.append(tag + '_not_object')
                continue
            for f in ['id', 'group', 'item', 'max_score', 'rule_type', 'params']:
                if f not in p:
                    v.append(tag + '_missing:' + f)
            if p.get('id') in ids:
                v.append(tag + '_duplicate_id')
            ids.add(p.get('id'))
            rt = p.get('rule_type')
            if rt not in T0_RULE_TYPES + T1_RULE_TYPES:
                v.append(tag + '_unknown_rule_type:%r' % rt)
            elif rt in T0_RULE_TYPES:
                need = PARAMS.get(rt, [])
                params = p.get('params') if isinstance(p.get('params'), dict) else {}
                for f in need:
                    if f not in params:
                        v.append(tag + '_params_missing:' + f)
                for key in ['name_glob']:
                    if key in params and ('{' in str(params[key]) or '}' in str(params[key])):
                        v.append(tag + '_glob_brace_forbidden:' + key)
                if rt == 'glob_covers':
                    pats = params.get('patterns')
                    if not isinstance(pats, list) or not pats:
                        v.append(tag + '_patterns_empty')
                    else:
                        for pat in pats:
                            if '{' in pat or '}' in pat:
                                v.append(tag + '_glob_brace_forbidden:patterns')
                if rt in ('contains_regex', 'count_regex'):
                    pat = str(params.get('pattern', ''))
                    for bad in FORBIDDEN_RE:
                        if re.search(bad, pat):
                            v.append(tag + '_regex_lookbehind_forbidden')
            if not _is_num(p.get('max_score')) or p.get('max_score') < 0:
                v.append(tag + '_bad_max_score')
            for d in (p.get('deductions') or []):
                if not isinstance(d, dict) or not d.get('code') or 'delta' not in d or 'when' not in d:
                    v.append(tag + '_bad_local_deduction')
    ds = checker.get('deductions')
    if not isinstance(ds, list):
        v.append('deductions_not_array')
    else:
        for i, d in enumerate(ds):
            if not isinstance(d, dict) or not d.get('code') or 'delta' not in d or not isinstance(d.get('match'), dict):
                v.append('deductions[%d]_bad_shape' % i)
    ep = checker.get('evidence_policy')
    if not isinstance(ep, dict):
        v.append('evidence_policy_not_object')
    else:
        if 'require_line' not in ep or 'quote_max_chars' not in ep:
            v.append('evidence_policy_missing_fields')
    cid = checker.get('checker_id')
    if not isinstance(cid, str) or not ID_RE.match(cid):
        v.append('checker_id_bad_format')
    else:
        computed = checker_id_of(checker)
        if cid != computed:
            v.append('checker_id_mismatch:declared=%s computed=%s' % (cid[:14], computed[:14]))
    return v


def t1_rule_types_in(checker):
    return [p.get('rule_type') for p in (checker.get('predicates') or [])
            if isinstance(p, dict) and p.get('rule_type') in T1_RULE_TYPES]


if __name__ == '__main__':
    import sys
    if len(sys.argv) != 2:
        print('usage: validate.py <checker.json>')
        sys.exit(64)
    ck = load_checker(sys.argv[1])
    viol = validate_checker(ck)
    for x in viol:
        print('VIOLATION ' + x)
    print('checker_id=' + checker_id_of(ck))
    print('VALID=' + ('yes' if not viol else 'no'))
    sys.exit(0 if not viol else 3)
