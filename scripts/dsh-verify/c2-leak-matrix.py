#!/usr/bin/env python3
"""scripts/dsh-verify/c2-leak-matrix.py —— F-C1 独立反例矩阵（C 自建，不碰真实 ~/.dsh）

在沙箱 home 里造出「看起来像宿主、其实是子进程」的变化，逐条喂给装置自己的 classify_changes.py，
断言每条落进哪个桶。判据：任何「子进程写出来的东西」都必须落 CHILD/UNATTRIBUTED（=装置判 FAIL），
宿主正常活动必须落 HOST（不能过度报警）。
"""
import os
import shutil
import subprocess
import sys

ROOT = '/tmp/dsh-verify2/matrix'
SANDBOX_HOME = os.path.join(ROOT, 'home')          # 冒充「真实 ~/.dsh」
ISO = '/tmp/dsh-verify2/matrix/iso-home'           # 冒充「隔离 home」
WD = '/tmp/dsh-verify2/matrix/workdir'
CHILD = 'aaaa1111-bbbb-2222-cccc-333344445555'
OTHER = 'dddd1111-eeee-2222-ffff-333344445555'
CLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dsh-grader', 'classify_changes.py')
CLS = os.path.abspath(CLS)


def w(path, data, mode='w'):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode, encoding='utf-8') as f:
        f.write(data)
    return path


def build():
    shutil.rmtree(ROOT, ignore_errors=True)
    os.makedirs(SANDBOX_HOME, exist_ok=True)
    os.makedirs(ISO, exist_ok=True)
    os.makedirs(WD, exist_ok=True)
    cases = {}
    # 1 子进程漏写 profile（历史事故形态）
    cases['profiles/headless/cordis.yml'] = w(os.path.join(SANDBOX_HOME, 'profiles/headless/cordis.yml'), 'leaked profile\n')
    # 2 宿主缓存目录里出现「内容含隔离 home 路径」的文件（旧判据此处必然判 HOST）
    cases['cache/leaked-note.txt'] = w(os.path.join(SANDBOX_HOME, 'cache/leaked-note.txt'), 'junk %s/sessions/x\n' % ISO)
    # 3 宿主 memories 里出现「内容含子会话 id」的文件
    cases['memories/daily/leak.md'] = w(os.path.join(SANDBOX_HOME, 'memories/daily/leak.md'), 'session-%s wrote here\n' % CHILD)
    # 4 会话目录里出现子会话自己的 id
    cases['sessions/slug/%s/session.v4.jsonl.zstd' % CHILD] = w(
        os.path.join(SANDBOX_HOME, 'sessions/slug/%s/session.v4.jsonl.zstd' % CHILD), 'child journal\n')
    # 5 会话目录里是别的 id（宿主自己的会话）——合法
    cases['sessions/slug/%s/session.v4.jsonl.zstd' % OTHER] = w(
        os.path.join(SANDBOX_HOME, 'sessions/slug/%s/session.v4.jsonl.zstd' % OTHER), 'host journal\n')
    # 6 宿主缓存文件，内容干净——合法
    cases['cache/hostfile.bin'] = w(os.path.join(SANDBOX_HOME, 'cache/hostfile.bin'), 'host cache data\n')
    # 7 宿主技能目录，内容干净——合法
    cases['skills/demo/SKILL.md'] = w(os.path.join(SANDBOX_HOME, 'skills/demo/SKILL.md'), 'host skill\n')
    # 8 真实 home 下出现无法解释的新文件/新目录
    cases['randomdir/unknown.bin'] = w(os.path.join(SANDBOX_HOME, 'randomdir/unknown.bin'), 'who wrote me?\n')
    # 9 真实 home 之外的变化
    os.makedirs('/tmp/dsh-verify2/matrix/outside', exist_ok=True)
    cases['/tmp/dsh-verify2/matrix/outside/x.txt'] = w('/tmp/dsh-verify2/matrix/outside/x.txt', 'outside\n')
    # 10 空会话 id 时的 fail-closed 用例（复用 5）
    return cases


def diff_line(path, size, new=True):
    return '%s 1700000000 %d %s\n' % ('>' if new else '<', size, path)


def run(cases, child, with_control=None):
    changed = os.path.join(ROOT, 'changed.txt')
    ctl = os.path.join(ROOT, 'control.txt')
    with open(changed, 'w', encoding='utf-8') as f:
        for rel, abs_p in cases.items():
            f.write(diff_line(abs_p, os.path.getsize(abs_p) if os.path.isfile(abs_p) else 10))
    with open(ctl, 'w', encoding='utf-8') as f:
        if with_control:
            f.write(diff_line(cases[with_control], os.path.getsize(cases[with_control])))
    args = ['python3', CLS, '--changed', changed, '--control', ctl, '--dsh-home', SANDBOX_HOME,
            '--isolated-home', ISO, '--workdir', WD, '--host-session', 'host-session-id']
    if child:
        args += ['--child-session', child]
    out = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout.decode()
    return out


def bucket_of(out, path):
    cur = None
    for line in out.splitlines():
        if line.startswith('__') and line.endswith('__'):
            cur = line.strip('_')
            continue
        if line.endswith(path) and cur:
            return cur
    for line in out.splitlines():
        if line.startswith('RULE ') and path in line:
            return line.split()[1]
    return '?NONE?'


def main():
    cases = build()
    ok = fail = 0
    out = run(cases, CHILD, with_control='cache/hostfile.bin')
    expects = [
        ('profiles/headless/cordis.yml', 'CHILD'),
        ('cache/leaked-note.txt', 'CHILD'),
        ('memories/daily/leak.md', 'CHILD'),
        ('sessions/slug/%s/session.v4.jsonl.zstd' % CHILD, 'CHILD'),
        ('sessions/slug/%s/session.v4.jsonl.zstd' % OTHER, 'HOST'),
        ('cache/hostfile.bin', 'HOST'),
        ('skills/demo/SKILL.md', 'HOST'),
        ('randomdir/unknown.bin', 'UNATTRIBUTED'),
        ('/tmp/dsh-verify2/matrix/outside/x.txt', 'OTHER'),
    ]
    print('== child-session 已知时的矩阵（== 装置会判 FAIL 的桶：CHILD/UNATTRIBUTED/OTHER）==')
    for rel, want in expects:
        got = bucket_of(out, cases[rel])
        good = got == want
        ok, fail = (ok + 1, fail) if good else (ok, fail + 1)
        print('%s %-52s want=%-13s got=%s' % ('PASS' if good else 'FAIL', rel, want, got))
    # fail-closed：不给 --child-session，别的会话 id 也不能被随口算成宿主
    out2 = run(cases, '')
    got2 = bucket_of(out2, cases['sessions/slug/%s/session.v4.jsonl.zstd' % OTHER])
    good2 = got2 == 'UNATTRIBUTED'
    ok, fail = (ok + 1, fail) if good2 else (ok, fail + 1)
    print('%s %-52s want=%-13s got=%s' % ('PASS' if good2 else 'FAIL', '(无 --child-session) 别的会话 id 路径', 'UNATTRIBUTED', got2))
    print('MATRIX_RESULT=%s pass=%d fail=%d' % ('PASS' if fail == 0 else 'FAIL', ok, fail))
    print('--- RULE 明细（head 20）---')
    keep = [l for l in out.splitlines() if l.startswith('RULE ')]
    print(chr(10).join(keep[:20]))
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main())
