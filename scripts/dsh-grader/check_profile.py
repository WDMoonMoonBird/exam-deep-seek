#!/usr/bin/env python3
"""校验 dsh --dump-config 的组合树是否满足 dsh-grader 隔离约束（纯文本断言，不涉及模型行为）。

用法: python3 check_profile.py <dump-config.txt>
输出: 每项一行 PROFILE_CHECK=<name> <PASS|FAIL>，末行 PROFILE_CHECK_ALL=...；退出码 0 = 全部通过。
判据:
  必须被禁用: tool-bash / tool-jobs / ptc-runtime / workflow-ptc   （执行面）
  必须保留  : tool-fs / tool-fs-search / shell-env / subagent      （读写与子代理，服务行不可禁）
  组合树来源: 出现 headless bundle 补丁标记，且不含 host / web-app 行（不监听端口）
"""
import sys

MUST_DISABLED = ['tool-bash', 'tool-jobs', 'ptc-runtime', 'workflow-ptc']
MUST_ENABLED = ['tool-fs', 'tool-fs-search', 'shell-env', 'subagent']
HOST_HINTS = ['dsh-web-app', 'dsh-host-', 'dsh-http-server']


def parse_items(text):
    items = {}
    cur = None
    buf = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith('- id: '):
            if cur is not None:
                items[cur] = chr(10).join(buf)
            cur = stripped[len('- id: '):].strip()
            buf = []
        else:
            buf.append(line)
    if cur is not None:
        items[cur] = chr(10).join(buf)
    return items


def main():
    if len(sys.argv) < 2:
        print('usage: check_profile.py <dump-config.txt>')
        return 2
    with open(sys.argv[1], encoding='utf-8', errors='replace') as f:
        text = f.read()
    items = parse_items(text)
    failed = 0
    for pid in MUST_DISABLED:
        block = items.get(pid)
        if block is None:
            print('PROFILE_CHECK=%s FAIL id-not-found' % pid)
            failed += 1
        elif 'disabled: true' in block:
            print('PROFILE_CHECK=%s PASS disabled' % pid)
        else:
            print('PROFILE_CHECK=%s FAIL row-present-but-enabled' % pid)
            failed += 1
    for pid in MUST_ENABLED:
        block = items.get(pid)
        if block is None:
            print('PROFILE_CHECK=%s FAIL required-row-missing' % pid)
            failed += 1
        elif 'disabled: true' in block:
            print('PROFILE_CHECK=%s FAIL required-row-disabled' % pid)
            failed += 1
        else:
            print('PROFILE_CHECK=%s PASS enabled' % pid)
    if 'patched by @deepseek-ai/dsh-headless' in text:
        print('PROFILE_CHECK=headless-bundle PASS')
    else:
        print('PROFILE_CHECK=headless-bundle FAIL marker-missing')
        failed += 1
    hits = [h for h in HOST_HINTS if h in text]
    if hits:
        print('PROFILE_CHECK=no-host-rows FAIL found=%s' % ','.join(hits))
        failed += 1
    else:
        print('PROFILE_CHECK=no-host-rows PASS')
    print('PROFILE_CHECK_ALL=%s failures=%d' % ('PASS' if failed == 0 else 'FAIL', failed))
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
