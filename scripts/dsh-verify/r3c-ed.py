#!/usr/bin/env python3
"""scripts/dsh-verify/r3c-ed.py —— R3-C ★E-D：C 自建无害变体 + 等价改写，逐项比对是否被误扣分

用法: python3 r3c-ed.py --workdir /tmp/dsh-r3-verify [--wrap yes]
说明：会话产出的 checker 里 project_root_glob 可能是 '**/UserManagement*'（需要至少一层前缀），
      所以本脚本把提交包在 <root>/wrap/<projname>/ 下再喂给 check.py；--wrap no 用于 **/package.json 这类 glob。
判据：任一 items[].score 下降 / pass True->False / totals 变化 ⇒ 误扣（阻断）
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

CHECK = 'scripts/dsh-checker/check.py'

def run_check(checker, submission, out_path):
    p = subprocess.run(['python3', CHECK, '--checker', checker, '--submission', submission,
                        '--out', out_path, '--canonical'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return p.returncode, p.stdout.decode('utf-8', 'replace')

def items_of(doc):
    return {str(i['id']): (float(i.get('score') or 0), bool(i.get('pass')), i.get('status')) for i in doc.get('items') or []}

def refs_of(checker):
    refs = set()
    for p in checker.get('predicates') or []:
        pa = p.get('params') or {}
        for key in ('path', 'dir'):
            v = pa.get(key)
            if isinstance(v, str) and v:
                refs.add(v.rstrip('/'))
        v = pa.get('path_glob')
        if isinstance(v, str) and v:
            refs.add(v.split('*')[0].rstrip('/'))
        for pat in (pa.get('patterns') or []):
            if isinstance(pat, str):
                refs.add(pat.split('*')[0].rstrip('/'))
    return {r for r in refs if r}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workdir', default='/tmp/dsh-r3-verify')
    ap.add_argument('--out', default='/tmp/r3c/ed')
    ap.add_argument('--wrap', default='yes')
    args = ap.parse_args()
    W, R = args.workdir, args.out
    if os.path.exists(R):
        subprocess.run(['chmod', '-R', 'u+w', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        shutil.rmtree(R, ignore_errors=True)
    os.makedirs(R, exist_ok=True)
    checker_path = os.path.join(W, 'out', 'checker', 'checker.json')
    checker = json.load(open(checker_path, encoding='utf-8'))
    glob = (checker.get('input_contract') or {}).get('project_root_glob')
    proj = None
    for dp, dn, fn in os.walk(os.path.join(W, 'materials', 'submissions')):
        if 'package.json' in fn and 'node_modules' not in dp:
            proj = dp; break
    if not proj:
        print('NO_SUBMISSION'); return 9
    name = os.path.basename(proj)

    def mkroot(dst):
        # 返回 (提交根, 项目目录)：--submission 必须给「提交根」，项目根由 glob 自己找
        root = os.path.join(dst, 'wrap', name) if args.wrap == 'yes' else os.path.join(dst, name)
        os.makedirs(os.path.dirname(root), exist_ok=True)
        shutil.copytree(proj, root)
        subprocess.run(['chmod', '-R', 'u+w', root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return dst, root

    base_root, base_proj = mkroot(os.path.join(R, 'base'))
    bj = os.path.join(R, 'base.json')
    rc, out = run_check(checker_path, base_root, bj)
    base = json.load(open(bj, encoding='utf-8')) if os.path.isfile(bj) else {}
    bi = items_of(base)
    print('glob=%s wrap=%s | 基线 rc=%d 条目=%d 总分=%s/%s canonical=%s' % (
        glob, args.wrap, rc, len(bi), base.get('totals', {}).get('score'),
        base.get('totals', {}).get('max_score'), (base.get('canonical_sha256') or '')[:12]))
    if not bi:
        print('BASE_MEASURE_FAILED:', [l for l in out.splitlines() if 'PROBLEM' in l or 'FAIL' in l][:2])
        print('ED_RESULT=BLOCKED')
        return 9
    refs = refs_of(checker)
    allf = []
    for dp, dn, fn in os.walk(base_proj):
        if 'node_modules' in dp:
            continue
        for f in sorted(fn):
            allf.append(os.path.relpath(os.path.join(dp, f), base_proj))
    unref = [f for f in allf if not any(f.startswith(r) or r in f for r in refs)]
    hits = []
    for p in checker.get('predicates') or []:
        if p.get('rule_type') not in ('contains_text', 'contains_regex'):
            continue
        rel = ((p.get('params') or {}).get('path') or '')
        cand = os.path.join(base_proj, rel)
        if os.path.isfile(cand):
            hits.append(cand)
        elif os.path.isdir(cand):
            for dp, dn, fn in os.walk(cand):
                for f in sorted(fn):
                    hits.append(os.path.join(dp, f))
    hits = sorted(set(hits))

    def variant(vname, mutate):
        dst = os.path.join(R, vname)
        root, vproj = mkroot(dst)
        info = mutate(vproj)
        vj = os.path.join(R, vname + '.json')
        rc2, out2 = run_check(checker_path, root, vj)
        doc = json.load(open(vj, encoding='utf-8')) if os.path.isfile(vj) else {}
        vi = items_of(doc)
        drops = [(k, bi[k][0], vi[k][0]) for k in bi if k in vi and vi[k][0] < bi[k][0]]
        flaps = [k for k in bi if k in vi and bi[k][1] and not vi[k][1]]
        print('%-12s rc=%d %s | 扣分项=%d %s | pass->False=%d %s | canonical_changed=%s' % (
            vname, rc2, info, len(drops), drops[:3], len(flaps), flaps[:2],
            (doc.get('canonical_sha256') or '') != base.get('canonical_sha256')))
        return len(drops) + len(flaps)

    bad = 0
    if unref:
        t = unref[-1]
        bad += variant('v1-rename', lambda d: (shutil.move(os.path.join(d, t), os.path.join(d, t + '.renamed')), 'renamed ' + t)[1])
    else:
        print('v1-rename    跳过：无未被引用文件')
    def v2(d):
        n = 0
        for f in hits:
            rel = os.path.relpath(f, base_proj)
            p = os.path.join(d, rel)
            if os.path.isfile(p):
                open(p, 'a', encoding='utf-8').write('\n// r3c harmless comment\n'); n += 1
        return 'comment on %d hit files' % n
    bad += variant('v2-comment', v2)
    def v3(d):
        if not hits:
            return 'no hit files'
        rel = os.path.relpath(hits[0], base_proj)
        p = os.path.join(d, rel)
        raw = open(p, 'rb').read().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        open(p, 'wb').write(raw)
        return 'CRLF on ' + rel
    bad += variant('v3-crlf', v3)
    def v4(d):
        t2 = unref[0] if unref else allf[0]
        open(os.path.join(d, t2), 'a', encoding='utf-8').write('\n')
        return 'trailing blank line in ' + t2
    bad += variant('v4-equiv', v4)
    print('ED_RESULT=%s 误扣项合计=%d' % ('PASS' if bad == 0 else 'FAIL', bad))
    return 0 if bad == 0 else 1

if __name__ == '__main__':
    sys.exit(main())