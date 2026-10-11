#!/usr/bin/env bash
# scripts/dsh-verify/guard-call.sh —— 以真实脚本身份调用装置的 guard（规避 bash -c 下 lib.sh 依赖 $0 的 harness 假象）
# 用法: bash scripts/dsh-verify/guard-call.sh "<DSH_HOME 值>"
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../dsh-grader/lib.sh"
guard_isolated_home "$1" > /dev/null
echo "GUARD_ACCEPTED=$1"
