#!/usr/bin/env python3
"""把 ~/.dsh 指纹 diff 的变化行做归因分类（F-C1 修复版：不允许对任何目录无条件豁免）。

背景：装置跑在用户正在运行的桌面 DSH 实例里，那个实例会持续写自己的会话日志、记忆与缓存，所以
「~/.dsh 有变化」不能直接判违规；但反过来，历史事故（漏 export DSH_HOME ⇒ CLI 写真实 home）恰恰表现为
真实 home 里出现子进程的产物。因此每一条变化都必须落到一条**可判据、可证伪**的规则上：

  R1 CHILD        路径里出现【子进程路径指纹】（子会话 id / 隔离 home 路径或其 slug / workdir 路径或其 slug）
  R2 CHILD        文件内容（变化窗口）里出现【子进程内容指纹】（子会话 id / 隔离 home 路径）
  R3 CHILD        路径落在 <real-home>/profiles/ 下（隔离运行时子进程的 profile 只会在隔离 home 里）
  R4 HOST-SESSION 路径含 UUID 形态会话 id 时依次判：
                  (a) 命中 --host-session（或 --child-session 已给出且该 id != 子会话 id）⇒ HOST；
                  (b) 两者都不命中且 --child-session 为空 ⇒ UNATTRIBUTED（fail-closed，不猜）；
                  (c) 两者都不命中且 --child-session 非空 ⇒ HOST（该 id 只可能属于别的会话）。
                  ★F-C2C-1：早期实现漏用了 --host-session ⇒ child_session 为空时宿主自身会话日志被判
                  UNATTRIBUTED、无未隔离写入也假 FAIL；现按 (a) 修好，(b) 保持 fail-closed。
  R5 HOST-CONTROL 该路径在【空窗对照】窗口也变化过（空窗期无任何子进程运行）
  R6 HOST-STORE   路径位于宿主共享存储目录（memories/ llm-deepseek/ cache/ attachments/ storages/ skills/
                  community/ logs/ dsh-runtimes/）且文件存在、内容窗口扫描干净（无任何内容指纹）
  R6b HOST-DELETE 同上目录，且本次是「删除」（宿主清理行为；子进程泄漏不会表现为删除）
  R7 UNATTRIBUTED 以上都不成立（文件不存在/读不到/无法判断来源）⇒ 调用方判 FAIL
  R8 OTHER        路径根本不在 <real-home> 下 ⇒ 调用方判 FAIL

内容窗口：只扫「新状态尾部 max(新size-旧size,0)+4096 字节」（追加型存储的改动集中在尾部），
单文件上限 8 MiB；这样既聚焦本次变化，也避免把历史内容里的字符串误判成本次泄漏。
每条变化的判据写进 __REASONS__ 段，便于人工复核「这条归因是不是对的」。

用法:
  classify_changes.py --changed <diff> [--control <diff>] [--host-session <id>] [--child-session <id>]
                      --dsh-home <path> [--isolated-home <path>] [--workdir <path>] [--fingerprint <s>] ...
输出（固定顺序，段内保持原始 diff 行不改写）:
  __CHILD__ / __UNATTRIBUTED__ / __OTHER__ / __HOST__ + __REASONS__ + __SUMMARY__
退出码恒为 0（是否算失败由调用方按 CHILD/UNATTRIBUTED/OTHER 判定）。
"""
import argparse
import os
import re
import sys

UUID_RE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
HOST_STORES = ('/memories/', '/llm-deepseek/', '/cache/', '/attachments/', '/storages/', '/skills/',
               '/community/', '/logs/', '/dsh-runtimes/')
SCAN_WINDOW_SLACK = 4096
SCAN_LIMIT = 8 * 1024 * 1024


def slugify(path):
    return path.strip('/').replace('/', '-')


def paths_of(diff_text):
    rec = {}
    order = []
    for line in diff_text.splitlines():
        if not line or line[0] not in '<>':
            continue
        parts = line[2:].split(' ', 2)
        if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit() or not parts[2].startswith('/'):
            continue
        path = parts[2]
        if path not in rec:
            rec[path] = {'raw': [], 'old': None, 'new': None}
            order.append(path)
        rec[path]['raw'].append(line)
        if line[0] == '<':
            rec[path]['old'] = int(parts[1])
        else:
            rec[path]['new'] = int(parts[1])
    return [(rec[p]['raw'], p, rec[p]['old'], rec[p]['new']) for p in order]


def scan(path, window):
    """status ∈ ok|miss；ok 时第二个返回值是待检查的字节块"""
    if not os.path.isfile(path):
        return 'miss', b''
    try:
        size = os.path.getsize(path)
        start = max(0, size - min(window, SCAN_LIMIT))
        with open(path, 'rb') as f:
            f.seek(start)
            blob = f.read(SCAN_LIMIT)
    except OSError:
        return 'miss', b''
    return 'ok', blob


def classify(path, old_size, new_size, path_fp, content_fp, control_paths, home, child_session, host_session):
    for fp in path_fp:
        if fp and fp in path:
            return 'R1-CHILD-PATH', 'path fingerprint=' + fp
    window = max((new_size or 0) - (old_size or 0), 0) + SCAN_WINDOW_SLACK
    status, blob = scan(path, window)
    if status == 'ok':
        for fp in content_fp:
            if fp and fp.encode('utf-8', 'ignore') in blob:
                return 'R2-CHILD-CONTENT', 'content fingerprint=' + fp
    if path.startswith(home + '/profiles/'):
        return 'R3-CHILD-PROFILE', 'profiles dir under real home'
    sid_match = UUID_RE.search(path)
    if sid_match:
        sid = sid_match.group(0)
        if child_session and sid == child_session:
            return 'R1-CHILD-PATH', 'path carries child session id'
        if host_session and host_session in path:
            return 'R4-HOST-SESSION', 'host session id in path'
        if not child_session:
            return 'R7-UNATTRIBUTED', 'session-id path matched neither host nor child session (fail-closed)'
        return 'R4-HOST-SESSION', 'session id in path != child session'
    if path in control_paths:
        return 'R5-HOST-CONTROL', 'same path changed in idle control window'
    if any(s in path for s in HOST_STORES):
        if status == 'ok':
            return 'R6-HOST-STORE', 'host store + content window clean (scan=' + str(min(window, SCAN_LIMIT)) + 'B)'
        if new_size is None or new_size == 0:
            return 'R6b-HOST-DELETE', 'host store, file deleted during run'
        return 'R7-UNATTRIBUTED', 'host store but file unreadable/missing (status=' + status + ')'
    if not path.startswith(home + '/'):
        return 'R8-OTHER', 'path not under dsh-home'
    return 'R7-UNATTRIBUTED', 'no rule matched (unknown change under real home)'


BUCKET_OF = {'R1': '__CHILD__', 'R2': '__CHILD__', 'R3': '__CHILD__',
             'R4': '__HOST__', 'R5': '__HOST__', 'R6': '__HOST__', 'R6b': '__HOST__',
             'R7': '__UNATTRIBUTED__', 'R8': '__OTHER__'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--changed', required=True)
    ap.add_argument('--control', default='')
    ap.add_argument('--host-session', default='')
    ap.add_argument('--child-session', default='')
    ap.add_argument('--dsh-home', required=True)
    ap.add_argument('--isolated-home', default='')
    ap.add_argument('--workdir', default='')
    ap.add_argument('--fingerprint', action='append', default=[])
    args = ap.parse_args()

    with open(args.changed, encoding='utf-8', errors='replace') as f:
        changed_text = f.read()
    control_paths = set()
    if args.control:
        try:
            with open(args.control, encoding='utf-8', errors='replace') as f:
                control_paths = set(p for _, p, _, _ in paths_of(f.read()))
        except OSError:
            control_paths = set()

    home = args.dsh_home.rstrip('/')
    path_fp = []
    content_fp = []
    if args.child_session:
        path_fp.append(args.child_session)
        content_fp.append(args.child_session)
    if args.isolated_home:
        iso = args.isolated_home.rstrip('/')
        path_fp += [iso, slugify(iso)]
        content_fp.append(iso)
    if args.workdir:
        wd = args.workdir.rstrip('/')
        path_fp += [wd, slugify(wd)]
    path_fp += list(args.fingerprint)
    content_fp += list(args.fingerprint)

    buckets = {'__CHILD__': [], '__UNATTRIBUTED__': [], '__OTHER__': [], '__HOST__': []}
    reasons = []
    for raw_lines, path, old_size, new_size in paths_of(changed_text):
        rule, detail = classify(path, old_size, new_size, path_fp, content_fp,
                                control_paths, home, args.child_session, args.host_session)
        buckets[BUCKET_OF[rule.split('-')[0]]].extend(raw_lines)
        reasons.append((rule, path, detail))
    for marker in ('__CHILD__', '__UNATTRIBUTED__', '__OTHER__', '__HOST__'):
        print(marker)
        for line in buckets[marker]:
            print(line)
    print('__REASONS__')
    for rule, path, detail in reasons:
        print('RULE ' + rule + ' ' + path + ' :: ' + detail)
    print('__SUMMARY__')
    print('child=%d unattributed=%d other=%d host=%d' % (
        len(buckets['__CHILD__']), len(buckets['__UNATTRIBUTED__']),
        len(buckets['__OTHER__']), len(buckets['__HOST__'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
