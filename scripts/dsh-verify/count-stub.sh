#!/usr/bin/env bash
# scripts/dsh-verify/count-stub.sh —— 调用计数器 + C 的假 CLI（证明「被护栏拒绝时零 CLI 调用」）
if [ -n "${C2_COUNT_FILE:-}" ]; then printf '%s\n' "$*" >> "$C2_COUNT_FILE"; fi
exec "$(cd "$(dirname "$0")" && pwd)/stub-dsh.sh" "$@"
