#!/usr/bin/env python3
"""R3-B2 · F-R3C-2：readdir 顺序扰动（grader 侧补强，不改 scripts/dsh-checker/**）。

把同一份提交复制成 N 份，**以不同顺序创建目录项**，再各跑一次 check.py（零 LLM），比对
canonical_sha256 与逐项分数：顺序不敏感 ⇒ 全同 ⇒ PASS；顺序敏感 ⇒ FAIL 并打印差异。
同时如实报告观测到的 listdir 顺序是否真的不同（distinct_orders / order_perturbation_effective）。

用法: perturb_readdir.py --submission <dir> --checker <c.json> --out <dir> [--copies 3] [--label E-B]
"""
import argparse
import json
import os
import random
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER_DIR = os.path.join(os.path.dirname(HERE), 'dsh-checker')


def walk_rel(root):
    dirs, files = [], []
    for dp, dn, fn in os.walk(root):
        dn.sort()
        rel = os.path.relpath(dp, root)
        if rel != '.':
            dirs.append(rel)
        for f in sorted(fn):
            files.append(os.path.normpath(os.path.join(rel, f)) if rel != '.' else f)
    return dirs, files


def copy_in_order(src, dst, order):
    if os.path.exists(dst):
        shutil.rmtree(dst)
    os.makedirs(dst)
    dirs, _files = walk_rel(src)
    for d in dirs:
        os.makedirs(os.path.join(dst, d), exist_ok=True)
    for rel in order:
        s = os.path.join(src, rel)
        t = os.path.join(dst, rel)
        os.makedirs(os.path.dirname(t), exist_ok=True)
        shutil.copy2(s, t)
    return dst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--submission', required=True)
    ap.add_argument('--checker', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--copies', type=int, default=3)
    ap.add_argument('--label', default='readdir')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    _dirs, files = walk_rel(args.submission)
    if not files:
        print('READDIR_PERTURB ' + args.label + ' verdict=FAIL reason=empty_submission')
        return 1
    orders = [list(files), list(reversed(files))]
    rnd = random.Random(20261011)
    shuffled = list(files)
    rnd.shuffle(shuffled)
    orders.append(shuffled)
    while len(orders) < args.copies:
        extra = list(files)
        rnd.shuffle(extra)
        orders.append(extra)
    orders = orders[:max(2, args.copies)]

    shim_src = os.path.join(HERE, 'shim_listdir.py')
    SHIM = os.path.join(args.out, 'shim_listdir.py')
    pass
    sigs, canon, scores = [], [], []
    for i, order in enumerate(orders):
        dst = copy_in_order(args.submission, os.path.join(args.out, 'work'), order)
        top = os.listdir(dst)
        sub_sig = list(os.listdir(os.path.join(dst, os.path.basename(args.submission)))) if os.path.isdir(os.path.join(dst, os.path.basename(args.submission))) else []
        sigs.append('TOP:' + ','.join(top) + '#SUB:' + ','.join(sub_sig))
        out_json = os.path.join(args.out, 'result-copy%d.json' % i)
        cmd = [sys.executable, os.path.join(CHECKER_DIR, 'check.py'), '--checker', args.checker,
               '--submission', dst, '--submission-id', 'readdir-probe', '--out', out_json]
        env = dict(os.environ)
        if i > 0 and os.path.isfile(shim_src):
            env['READDIR_SHUFFLE'] = 'reverse' if i % 2 == 1 else 'rotate'
            cmd = [sys.executable, shim_src] + cmd[2:]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=env)
        if p.returncode != 0:
            print('READDIR_PERTURB ' + args.label + ' verdict=FAIL reason=check_rc_%d_copy%d' % (p.returncode, i))
            return 1
        doc = json.load(open(out_json, encoding='utf-8'))
        canon.append(doc.get('canonical_sha256'))
        scores.append({it['id']: it.get('score') for it in doc.get('items', [])})

    distinct_orders = len(set(sigs))
    distinct_canon = len(set(canon))
    base = scores[0]
    diffs = 0
    for s in scores[1:]:
        for k in set(base) | set(s):
            if base.get(k) != s.get(k):
                diffs += 1
    effective = 'yes（含 listdir shim 扰动，与文件系统无关）' if os.path.isfile(shim_src) else ('yes' if distinct_orders > 1 else 'no')
    # 判据（F-R3C-2）：**分数/条目不得随 readdir 顺序变化**；canonical 若变化，需归因（
    # 若原因是 dsh-checker 的 dir_sha256 走 os.walk 不排序 ⇒ 属 R0/R1 侧既有性质，本轮只作独立提案记录，不改它）。
    verdict = 'PASS' if diffs == 0 else 'FAIL'
    canon_note = 'canonical_order_sensitive=no' if distinct_canon == 1 else 'canonical_order_sensitive=yes（见报告提案；submission-id 已固定，差异只可能来自顺序敏感的字段）'
    print('READDIR_PERTURB %s copies=%d distinct_orders=%d order_perturbation_effective=%s distinct_canonical=%d score_diffs=%d verdict=%s' % (
        args.label, len(orders), distinct_orders, effective, distinct_canon, diffs, verdict) + ' ' + canon_note)
    for i, c in enumerate(canon):
        print('  copy%d canonical=%s' % (i, c))
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
