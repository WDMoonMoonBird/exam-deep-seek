#!/usr/bin/env python3
"""R3-B · E-D 无害变体生成器（确定性、只读源物料、零模型调用）。

三类变体（A 设计 §4 E-D）：
  d1 改名：把不在任何谓词路径上的文件改名（若找不到就新建一个不被引用的文件）
  d2 注释与换行：在被 contains_text/contains_regex 命中的文件里加注释行 + 做一次 LF<->CRLF 互换
  d3 等价改写：在被 contains_regex 命中的文件里做等价文本改写（如 localStorage.setItem -> window.localStorage.setItem）

用法:
  make_variants.py --submission <提交目录> --checker <checker.json> --out <变体根目录> [--only d1|d2|d3]
  make_variants.py --compare --baseline <result.json> --variant <result.json> [--label d3]
    -> 逐条打印 DIFF；有扣分时 exit 1（裁定 2：d3 出现扣分即 FAIL），只影响非分数字段时 exit 0
"""
import argparse
import json
import os
import shutil
import sys

TEXT_RE_TYPES = ('contains_text', 'contains_regex')


def norm(p):
    return p.replace(os.sep, '/')


def copy_tree(src, dst):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst, symlinks=True)
    return dst


def all_files(root):
    out = []
    for dp, dn, fn in os.walk(root):
        dn.sort()
        for f in sorted(fn):
            out.append(norm(os.path.relpath(os.path.join(dp, f), root)))
    return sorted(out)


def referenced_paths(checker):
    refs = set()
    for p in checker.get('predicates') or []:
        params = p.get('params') or {}
        for key in ('path', 'dir'):
            v = params.get(key)
            if isinstance(v, str) and v:
                refs.add(v.rstrip('/'))
        v = params.get('path_glob')
        if isinstance(v, str) and v:
            refs.add(v.split('*')[0].rstrip('/'))
        for pat in (params.get('patterns') or []):
            if isinstance(pat, str):
                refs.add(pat.split('*')[0].rstrip('/'))
    return set(x for x in refs if x)


def hit_files(checker, root):
    """返回被 contains_text/contains_regex 命中的相对文件路径（按谓词顺序去重）。"""
    hits = []
    for p in checker.get('predicates') or []:
        if p.get('rule_type') not in TEXT_RE_TYPES:
            continue
        rel = (p.get('params') or {}).get('path')
        if not rel:
            continue
        if os.path.isfile(os.path.join(root, rel)) and rel not in hits:
            hits.append(rel)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--submission')
    ap.add_argument('--checker')
    ap.add_argument('--out')
    ap.add_argument('--only', default='')
    ap.add_argument('--compare', action='store_true')
    ap.add_argument('--baseline')
    ap.add_argument('--variant')
    ap.add_argument('--label', default='variant')
    args = ap.parse_args()

    if args.compare:
        base = json.load(open(args.baseline, encoding='utf-8'))
        var = json.load(open(args.variant, encoding='utf-8'))
        bmap = {it['id']: it for it in base.get('items', [])}
        vmap = {it['id']: it for it in var.get('items', [])}
        diffs, deductions = [], 0
        for pid in sorted(set(bmap) | set(vmap)):
            b = bmap.get(pid, {}).get('score')
            v = vmap.get(pid, {}).get('score')
            if b != v:
                delta = (v or 0) - (b or 0)
                diffs.append({'item_id': pid, 'baseline_score': b, 'variant_score': v, 'delta': delta})
                if delta < 0:
                    deductions += 1
        same_canonical = base.get('canonical_sha256') == var.get('canonical_sha256')
        print('COMPARE label=%s canonical_same=%s score_items_changed=%d deductions=%d' % (
            args.label, 'yes' if same_canonical else 'no', len(diffs), deductions))
        for d in diffs:
            print('DIFF item=%s base=%s variant=%s delta=%s' % (
                d['item_id'], d['baseline_score'], d['variant_score'], d['delta']))
        if not diffs:
            print('DIFF none（逐项一致）')
        return 1 if deductions else 0

    for req in ('submission', 'checker', 'out'):
        if not getattr(args, req):
            print('缺少 --' + req)
            return 2
    checker = json.load(open(args.checker, encoding='utf-8'))
    base_name = os.path.basename(os.path.abspath(args.submission))
    refs = referenced_paths(checker)
    files = all_files(args.submission)
    hits = hit_files(checker, args.submission)
    wanted = [args.only] if args.only else ['d1', 'd2', 'd3']
    meta = {'schema_version': 'variants-meta/1', 'baseline': args.submission, 'variants': {}}
    for kind in wanted:
        dst = os.path.join(args.out, kind, base_name)
        copy_tree(args.submission, dst)
        changed = []
        if kind == 'd1':
            cand = [f for f in files if f not in refs
                    and not any(f.startswith(r + '/') for r in refs)
                    and '/' not in f.split('.')[0][:1]]
            free = [f for f in (cand or files) if os.path.basename(f) not in refs]
            if free:
                src = free[0]
                new = src + '.renamed'
                os.rename(os.path.join(dst, src), os.path.join(dst, new))
                changed = ['%s -> %s' % (src, new)]
            else:
                new = 'NOTES-D1.txt'
                with open(os.path.join(dst, new), 'w', encoding='utf-8') as f:
                    f.write('harmless extra file' + chr(10))
                changed = ['+ ' + new]
        elif kind == 'd2':
            targets = hits or files
            for rel in targets[:1]:
                p = os.path.join(dst, rel)
                raw = open(p, 'rb').read()
                text = raw.decode('utf-8', 'replace')
                text = '// d2 harmless comment' + chr(10) + text
                new_raw = text.replace(chr(10), chr(13) + chr(10)) if (chr(13) + chr(10)) not in text else text.replace(chr(13) + chr(10), chr(10))
                with open(p, 'wb') as f:
                    f.write(new_raw.encode('utf-8'))
                changed = ['comment+crlf:' + rel]
        elif kind == 'd3':
            targets = hits or files
            for rel in targets[:1]:
                p = os.path.join(dst, rel)
                text = open(p, encoding='utf-8', errors='replace').read()
                if 'localStorage.setItem' in text and 'window.localStorage' not in text:
                    text = text.replace('localStorage.setItem', 'window.localStorage.setItem')
                elif 'createPinia()' in text:
                    text = text.replace('createPinia()', 'createPinia(/* d3 equivalent */)')
                else:
                    text = text + chr(10) + '// d3 equivalent rewrite' + chr(10)
                with open(p, 'w', encoding='utf-8') as f:
                    f.write(text)
                changed = ['equivalent-rewrite:' + rel]
        meta['variants'][kind] = {'dir': dst, 'changed': changed}
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'variants-meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write(chr(10))
    for kind, info in sorted(meta['variants'].items()):
        print('VARIANT %s dir=%s changed=%s' % (kind, info['dir'], ','.join(info['changed'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
