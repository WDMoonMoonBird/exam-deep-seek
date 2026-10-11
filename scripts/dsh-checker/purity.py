#!/usr/bin/env python3
"""纯函数约束的运行时断言（R1-A 设计 §2.2）：无网络 / 无子进程 / 无时间·随机 / 不读环境变量。

用法：
    with purity_guard() as g:
        ...被测代码...
    g.violations  # 空列表 = 全程未触碰禁区；非空 = 违反（调用方应 FAIL）

--purity-probe 自测（在 check.py 里）：故意触发某一类禁令，断言守卫能抓到。
"""
import builtins
import os
import socket
import sys
import time

try:  # 预先导入：不能在守卫内导入（守卫已把 socket.socket 换成函数，ssl 会 TypeError）
    import urllib.request as _urllib_request
except ImportError:
    _urllib_request = None

PROBE_KINDS = ['network', 'subprocess', 'time', 'random', 'env']


class PurityViolation(AssertionError):
    pass


class BlockedEnv(object):
    """在守卫存续期间替换 os.environ：任何读写都记违规（防"偷看 TZ/LC_ALL/PYTHONHASHSEED"）。"""

    def __init__(self, real, sink):
        object.__setattr__(self, '_real', real)
        object.__setattr__(self, '_sink', sink)

    def _blocked(self, what):
        self._sink.append('env:' + what)
        raise PurityViolation('env access blocked: ' + what)

    def __getitem__(self, k):
        return self._blocked('getitem:' + str(k))

    def __contains__(self, k):
        return self._blocked('contains:' + str(k))

    def get(self, k, d=None):
        return self._blocked('get:' + str(k))

    def keys(self):
        return self._blocked('keys')

    def items(self):
        return self._blocked('items')

    def __iter__(self):
        return self._blocked('iter')

    def __len__(self):
        return self._blocked('len')


class purity_guard(object):
    def __init__(self):
        self.violations = []
        self._saved = []

    def _record(self, label):
        self.violations.append(label)
        raise PurityViolation(label)

    def _patch(self, obj, name, label):
        if not hasattr(obj, name):
            return
        self._saved.append((obj, name, getattr(obj, name)))

        def blocked(*a, **kw):
            return self._record(label)
        setattr(obj, name, blocked)

    def __enter__(self):
        g = self
        # 网络
        self._patch(socket, 'socket', 'network:socket.socket')
        self._patch(socket, 'create_connection', 'network:socket.create_connection')
        self._patch(socket, 'getaddrinfo', 'network:socket.getaddrinfo')
        if _urllib_request is not None:
            self._patch(_urllib_request, 'urlopen', 'network:urllib.urlopen')
        # 子进程
        import subprocess
        for n in ['Popen', 'run', 'call', 'check_call', 'check_output', 'getoutput']:
            self._patch(subprocess, n, 'subprocess:' + n)
        for n in ['system', 'fork', 'posix_spawn', 'posix_spawnp', 'execv', 'execvp', 'spawnv']:
            self._patch(os, n, 'subprocess:os.' + n)
        # 时间 / 随机
        for n in ['time', 'monotonic', 'localtime', 'gmtime', 'strftime']:
            self._patch(time, n, 'time:time.' + n)
        try:
            import datetime as _dt

            class _BlockedDateTime(_dt.datetime):
                @classmethod
                def now(cls, tz=None):
                    raise PurityViolation('time:datetime.now')

                @classmethod
                def utcnow(cls):
                    raise PurityViolation('time:datetime.utcnow')
            self._saved.append((_dt, 'datetime', _dt.datetime))
            _dt.datetime = _BlockedDateTime
        except Exception:
            pass
        import random as _rd
        for n in ['random', 'randint', 'choice', 'shuffle', 'randrange', 'getrandbits']:
            self._patch(_rd, n, 'random:' + n)
        self._patch(os, 'urandom', 'random:os.urandom')
        # 环境变量
        self._env_saved = os.environ
        object.__setattr__(os, 'environ', BlockedEnv(self._env_saved, self.violations))
        self._getenv_saved = os.getenv
        os.getenv = lambda *a, **kw: g._record('env:os.getenv')
        # 不跟随软链 / 不写文件：由 check.py 的 safe_* 辅助函数负责
        return self

    def __exit__(self, exc_type, exc, tb):
        if getattr(self, '_env_saved', None) is not None:
            os.environ = self._env_saved
        if getattr(self, '_getenv_saved', None) is not None:
            os.getenv = self._getenv_saved
        for obj, name, val in reversed(self._saved):
            setattr(obj, name, val)
        return False

    def all_violations(self):
        return list(self.violations)


def probe(kind):
    """故意触发某一类禁令，供 --purity-probe 验证「断言真的会响」。"""
    with purity_guard() as g:
        try:
            if kind == 'network':
                socket.socket()
            elif kind == 'subprocess':
                import subprocess
                subprocess.Popen(['true'])
            elif kind == 'time':
                time.time()
            elif kind == 'random':
                import random
                random.random()
            elif kind == 'env':
                os.environ.get('TZ')
            else:
                return False, ['unknown_probe_kind:' + str(kind)]
        except PurityViolation:
            return True, g.all_violations()
    return False, g.all_violations()


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in PROBE_KINDS:
        print('usage: purity.py <' + '|'.join(PROBE_KINDS) + '>')
        sys.exit(64)
    fired, viol = probe(sys.argv[1])
    print('PURITY_PROBE=' + sys.argv[1] + ' ' + ('TRIGGERED' if fired else 'NOT_TRIGGERED'))
    for x in viol:
        print('VIOLATION ' + x)
    sys.exit(0 if fired else 1)
