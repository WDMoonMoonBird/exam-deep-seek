#!/usr/bin/env python3
"""R3-B2 · F-R3C-2 辅助：把 os.listdir 的返回顺序确定性地改掉，再运行 dsh-checker/check.py。

与文件系统无关（APFS 会把目录项顺序归一化，光靠「不同创建顺序」扰动不出来）。
用法:
  READDIR_SHUFFLE=reverse|rotate python3 shim_listdir.py --checker <c.json> --submission <dir> --out <r.json>
（其余参数原样透传给 check.py）
"""
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(os.path.dirname(HERE), 'dsh-checker', 'check.py')


def main():
    mode = os.environ.get('READDIR_SHUFFLE', 'reverse')
    real = os.listdir

    def patched(path='.'):
        names = list(real(path))
        if mode == 'reverse':
            names.reverse()
        elif mode == 'rotate' and len(names) > 1:
            names = names[1:] + names[:1]
        return names

    os.listdir = patched
    sys.argv = ['check.py'] + sys.argv[1:]
    runpy.run_path(CHECKER, run_name='__main__')
    return 0


if __name__ == '__main__':
    sys.exit(main())
