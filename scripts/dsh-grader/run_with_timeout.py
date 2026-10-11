#!/usr/bin/env python3
"""在独立进程组内运行子进程并施加硬超时（macOS 自带没有 GNU timeout）。

用法: run_with_timeout.py --timeout <秒> --out <stdout.log> --err <stderr.log> [--cwd <目录>] -- <cmd> [args...]

stdout 只输出三行机器可读结果（调用方 grep 即可）:
  RUNNER_CHILD_EXIT=<数字|timeout|spawn-error>
  RUNNER_ELAPSED_SEC=<整数>
  RUNNER_ORPHAN=<0|1>
退出码: 子进程退出码；超时=124；用法/内部错误=125；子进程被信号杀死=128+信号。
超时处理: SIGTERM 整个进程组 -> 宽限 10s -> SIGKILL，并在回收后复检进程组是否仍存活（孤儿检测）。
"""
import argparse
import os
import signal
import subprocess
import sys
import time

GRACE_SEC = 10


def _signal_group(pgid, sig):
    try:
        os.killpg(pgid, sig)
    except (ProcessLookupError, PermissionError):
        pass


def _group_alive(pgid):
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def main():
    if '--' not in sys.argv:
        print('RUNNER_CHILD_EXIT=usage-error')
        print('RUNNER_ELAPSED_SEC=0')
        print('RUNNER_ORPHAN=0')
        return 125
    split = sys.argv.index('--')
    parser = argparse.ArgumentParser()
    parser.add_argument('--timeout', type=int, required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--err', required=True)
    parser.add_argument('--cwd', default=None)
    args = parser.parse_args(sys.argv[1:split])
    cmd = sys.argv[split + 1:]
    if not cmd or args.timeout <= 0:
        print('RUNNER_CHILD_EXIT=usage-error')
        print('RUNNER_ELAPSED_SEC=0')
        print('RUNNER_ORPHAN=0')
        return 125

    start = time.time()
    timed_out = False
    rc = None
    pgid = None
    with open(args.out, 'wb') as fout, open(args.err, 'wb') as ferr:
        try:
            proc = subprocess.Popen(cmd, cwd=args.cwd, stdin=subprocess.DEVNULL,
                                    stdout=fout, stderr=ferr, start_new_session=True)
        except OSError as exc:
            print('RUNNER_CHILD_EXIT=spawn-error')
            print('RUNNER_ELAPSED_SEC=%d' % int(time.time() - start))
            print('RUNNER_ORPHAN=0')
            sys.stderr.write('spawn failed: %s' % exc)
            return 125
        pgid = os.getpgid(proc.pid)
        try:
            rc = proc.wait(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            _signal_group(pgid, signal.SIGTERM)
            try:
                rc = proc.wait(timeout=GRACE_SEC)
            except subprocess.TimeoutExpired:
                _signal_group(pgid, signal.SIGKILL)
                try:
                    rc = proc.wait(timeout=GRACE_SEC)
                except subprocess.TimeoutExpired:
                    rc = None
    orphan = _group_alive(pgid) if pgid is not None else False
    if orphan:
        _signal_group(pgid, signal.SIGKILL)
        time.sleep(0.5)
        orphan = _group_alive(pgid)
    print('RUNNER_CHILD_EXIT=%s' % ('timeout' if timed_out else rc))
    print('RUNNER_ELAPSED_SEC=%d' % int(time.time() - start))
    print('RUNNER_ORPHAN=%d' % (1 if orphan else 0))
    if timed_out:
        return 124
    if rc is None:
        return 125
    if rc < 0:
        return 128 - rc
    return rc


if __name__ == '__main__':
    sys.exit(main())
