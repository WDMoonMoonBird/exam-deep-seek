#!/usr/bin/env bash
# scripts/dsh-verify/vlib.sh —— Agent C 独立验证探针公共函数
# 与 scripts/dsh-grader/ 无代码依赖（不 source 对方 lib.sh），全部自建，便于互相反证。
# 纪律：不写 ~/.dsh、不 kill 宿主进程、不占 :5173/:3000/:19387、不打印凭据明文。
set -uo pipefail

DSH_BIN="${DSH_BIN:-/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh}"
V_EV="${V_EV:-/tmp/dsh-verify-ev}"
DSH_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOME_DIR="$HOME/.dsh"
HOST_SESSION_ID="${DSH_SESSION_ID:-}"

vlog() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" | tee -a "$V_EV/probe.log"; }

# ---- 隔离 home 构造（探针自带，不复用 B 的 scaffold_home）----
scaffold() { # scaffold <home> [patched|unpatched]
  local home="$1" mode="${2:-patched}"
  mkdir -p "$home/profiles/headless"
  chmod 700 "$home"
  if [ "$mode" = patched ]; then
    cat > "$home/profiles/headless/cordis.patch.yml" <<'YML'
- id: tool-bash
  disabled: true
- id: tool-jobs
  disabled: true
- id: ptc-runtime
  disabled: true
- id: workflow-ptc
  disabled: true
YML
  fi
}

# ---- 凭据：只从 ~/.dsh/.credentials.yaml 读（不落明文日志）----
cred_install() { # cred_install <isolated-home>
  local home="$1" src="$REAL_HOME_DIR/.credentials.yaml"
  [ -f "$src" ] || return 1
  python3 - "$src" "$home/.credentials.yaml" <<'PY'
import sys
key = ''
for line in open(sys.argv[1], encoding='utf-8'):
    s = line.strip()
    if s.startswith('DEEPSEEK_API_KEY:'):
        v = s.split(':', 1)[1].strip().strip('"').strip("'")
        if v:
            key = v
if not key:
    sys.exit(4)
open(sys.argv[2], 'w', encoding='utf-8').write('DEEPSEEK_API_KEY: ' + key + chr(10))
PY
  chmod 600 "$home/.credentials.yaml"
}
cred_remove() { [ -n "${1:-}" ] && rm -f "$1/.credentials.yaml"; }

# ---- 指纹 / 端口 ----
snap_home()  { find "$REAL_HOME_DIR" -path '*/node_modules' -prune -o -type f -print0 2>/dev/null | xargs -0 stat -f '%m %z %N' 2>/dev/null | LC_ALL=C sort > "$1" || true; }
snap_ports() { lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $1" "$9}' | LC_ALL=C sort -u > "$1" || true; }
diff_paths() { diff "$1" "$2" 2>/dev/null | grep -E '^[<>] [0-9]+ [0-9]+ /' || true; }

# ---- 自建硬超时执行器（不依赖 B 的 run_with_timeout.py）----
# run_timed <secs> <out> <err> <cwd> <cmd...>；超时：SIGTERM 进程组 -> 5s -> SIGKILL；回显 RT_* 三行
run_timed() {
  local secs="$1" out="$2" err="$3" cwd="$4"; shift 4
  local start pid rc waited=0 timed=0
  start=$(date +%s)
  set -m
  ( cd "$cwd" && exec "$@" ) > "$out" 2> "$err" < /dev/null &
  pid=$!
  set +m
  [ -n "${V_PIDFILE:-}" ] && echo "$pid" > "$V_PIDFILE"
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1; waited=$((waited + 1))
    if [ "$waited" -ge "$secs" ]; then
      kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      sleep 5
      kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
      timed=1; break
    fi
  done
  wait "$pid"; rc=$?
  local alive=0
  kill -0 "$pid" 2>/dev/null && alive=1
  printf 'RT_CHILD_EXIT=%s\nRT_ELAPSED_SEC=%s\nRT_TIMEOUT=%s\nRT_STILL_ALIVE=%s\n' \
    "$rc" "$(( $(date +%s) - start ))" "$timed" "$alive"
  [ "$timed" -eq 0 ] || return 124
  return "$rc"
}

# ---- 孤儿检测：只看本探针自己的子进程（cli/bin/dsh 且 ppid 不是宿主 830/890）----
orphan_count() {
  ps -Ao pid,ppid,command 2>/dev/null | grep -E 'runtime/cli/bin/dsh' | grep -v grep \
    | awk -v h1=830 -v h2=890 '$2 != h1 && $2 != h2' | wc -l | tr -d ' '
}
