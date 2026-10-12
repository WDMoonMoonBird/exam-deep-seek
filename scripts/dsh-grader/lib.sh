#!/usr/bin/env bash
# scripts/dsh-grader/lib.sh — dsh-grader 公共函数（被 probe.sh / run.sh source）
# 纪律：不写 ~/.dsh、不 npm/pnpm install、不构建、不执行学生代码、不打印凭据明文、
#       临时凭据 chmod 600 且脚本退出时删除。
set -euo pipefail

DSH_GRADER_DIR="$(cd "$(dirname "$0")" && pwd)"
DSH_REPO_ROOT="$(cd "$DSH_GRADER_DIR/../.." && pwd)"
DSH_SHIM_DEFAULT="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
DSH_PROFILE_NAME="${DSH_GRADER_PROFILE:-headless}"
DSH_RUN_LOG="${DSH_RUN_LOG:-}"
DSH_HOME_REAL="${DSH_GRADER_REAL_HOME:-$HOME/.dsh}"

log() {
  local line
  line="[$(date '+%H:%M:%S')] $*"
  echo "$line"
  if [ -n "$DSH_RUN_LOG" ]; then echo "$line" >> "$DSH_RUN_LOG"; fi
}

warn() { echo "[WARN] $*" >&2; }
die()  { echo "[FATAL] $*" >&2; exit 2; }

# ---------- F-C3 隔离护栏（任何 DSH 调用之前必须通过）----------
real_dir() {
  local d
  d="$(cd "$1" 2> /dev/null && pwd -P || true)"
  [ -n "$d" ] || d="$1"
  printf '%s' "$d"
}

guard_isolated_home() {
  local home="$1" resolved real tmp_root
  [ -n "$home" ] || die "guard: DSH_HOME 未设置/为空 —— 拒绝调用 dsh（F-C3）"
  case "$home" in
    /*) : ;;
    *) die "guard: DSH_HOME 必须是绝对路径：${home}（F-C3）" ;;
  esac
  resolved="$(real_dir "$home")"
  real="$(real_dir "$DSH_HOME_REAL")"
  [ "$resolved" != "$real" ] || die "guard: DSH_HOME 不能是真实 home：${resolved}（F-C3，拒绝调用 dsh）"
  [ "$resolved" != "$(real_dir "$HOME/.dsh")" ] || die "guard: DSH_HOME 不能是 ~/.dsh（F-C3，拒绝调用 dsh）"
  [ "$resolved" != "$(real_dir "$HOME")" ] || die "guard: DSH_HOME 不能是 HOME 本身（F-C3，拒绝调用 dsh）"
  tmp_root="$(real_dir "${TMPDIR:-/tmp}")"
  case "$resolved" in
    /tmp/*|/private/tmp/*|/var/folders/*|"$tmp_root"/*) : ;;
    *) die "guard: DSH_HOME 必须位于临时目录下（/tmp、/private/tmp、/var/folders 或 TMPDIR）：${resolved}（F-C3）" ;;
  esac
  printf '%s' "$resolved"
}

# ---------- F-C4 workdir 原子锁 ----------
acquire_workdir_lock() {
  local wd="$1"
  local lock="$wd/.dsh-grader.lock"
  local owner
  mkdir -p "$wd" || die "无法创建 workdir：$wd"
  if mkdir "$lock" 2> /dev/null; then
    printf 'pid=%s\nstarted=%s\n' "$$" "$(date '+%Y-%m-%dT%H:%M:%S')" > "$lock/owner.txt"
    WORKDIR_LOCK="$lock"
    log "workdir 锁：已获取 ${lock}（pid=$$）"
    return 0
  fi
  owner="$(sed -n 's/^pid=//p' "$lock/owner.txt" 2> /dev/null | head -1)"
  if [ -n "$owner" ] && kill -0 "$owner" 2> /dev/null; then
    die "workdir 已被 pid=$owner 占用（${lock}）：同一 --workdir 不允许并发运行（F-C4）；请换 --workdir 或等它结束"
  fi
  log "workdir 锁：陈旧锁（pid=${owner:-unknown} 已不存在）→ 接管 $lock"
  rm -rf "$lock"
  mkdir "$lock" 2> /dev/null || die "无法接管 workdir 锁：${lock}（F-C4）"
  printf 'pid=%s\ntakeover=1\n' "$$" > "$lock/owner.txt"
  WORKDIR_LOCK="$lock"
}

release_workdir_lock() {
  local lock="${WORKDIR_LOCK:-}"
  [ -n "$lock" ] || return 0
  case "$lock" in
    */.dsh-grader.lock) rm -rf "$lock"; WORKDIR_LOCK="" ;;
    *) : ;;
  esac
}

dsh_bin() {
  local bin
  guard_isolated_home "${DSH_HOME:-}" > /dev/null
  bin="${DSH_GRADER_BIN:-$DSH_SHIM_DEFAULT}"
  [ -x "$bin" ] || die "dsh CLI 不可执行：$bin （可用环境变量 DSH_GRADER_BIN 覆盖）"
  echo "$bin"
}

# ★R2-B22：装置（DSH harness）走 **Anthropic 风格 Messages API**（请求 baseURL + `/v1/messages`），
#   而平台的 `DEEPSEEK_BASE_URL` 是给 **OpenAI 风格**客户端用的（`https://api.deepseek.com`）⇒ 直接写入会拼出
#   `/v1/messages` ⇒ HTTP 404 ⇒ 造尺（唯一用 LLM 的一步）必然失败。
#   优先级：① DSH_GRADER_BASE_URL（显式覆盖）② 由 DEEPSEEK_BASE_URL 派生（含 /anthropic ⇒ 原样；
#   host=api.deepseek.com ⇒ 归一到 <scheme>://<host>[:port]/anthropic；其他 host ⇒ 原样不动，不猜）③ 都没有 ⇒ 返回 1（保持既有默认）。
messages_api_root() {
  if [ -n "${DSH_GRADER_BASE_URL:-}" ]; then printf '%s\n' "${DSH_GRADER_BASE_URL%/}"; return 0; fi
  local b="${DEEPSEEK_BASE_URL:-}"
  [ -n "$b" ] || return 1
  b="${b%/}"
  case "$b" in
    */anthropic) printf '%s\n' "$b"; return 0 ;;
  esac
  case "$b" in
    https://api.deepseek.com|http://api.deepseek.com|https://api.deepseek.com/*|http://api.deepseek.com/*)
      local scheme rest
      scheme="${b%%://*}"; rest="${b#*://}"
      printf '%s://%s/anthropic\n' "$scheme" "${rest%%/*}"; return 0 ;;
  esac
  printf '%s\n' "$b"; return 0
}

# 只打印 scheme+host+path（去掉 query/fragment/凭据），供日志观测（**绝不打印 key**）
endpoint_label() {
  printf '%s\n' "$1" | sed -E 's#^([a-zA-Z][a-zA-Z0-9+.-]*://)([^/@]*@)?([^/?#]+)([^?#]*)?.*$#\1\3\4#'
}

scaffold_home() {
  local home="$1"
  guard_isolated_home "$home" > /dev/null
  mkdir -p "$home/profiles/$DSH_PROFILE_NAME"
  chmod 700 "$home"
  cat > "$home/profiles/$DSH_PROFILE_NAME/cordis.patch.yml" <<'PATCH'
# dsh-grader 隔离约束：只禁【执行类 / 代码执行类】行，保留 fs / shell-env / permission 等服务行。
# 生效判据：check_profile.py 对 <dsh --dump-config> 输出逐 id 断言 disabled: true。
- id: tool-bash
  disabled: true
- id: tool-jobs
  disabled: true
- id: ptc-runtime
  disabled: true
- id: workflow-ptc
  disabled: true
PATCH
  # R2-B8：平台驱动时把平台配置的模型/端点带进隔离 profile（**未提供则完全不追加** ⇒ 默认行为不变）。
  # 目标 id 取自 headless 默认 profile 树：agent-default-model（provider/model）/ llm-deepseek（baseURL）。
  if [ -n "${DEEPSEEK_MODEL:-}" ]; then
    cat >> "$home/profiles/$DSH_PROFILE_NAME/cordis.patch.yml" <<PATCH_MODEL
- id: agent-default-model
  config:
    provider: ${DSH_GRADER_PROVIDER:-deepseek-official}
    model: ${DEEPSEEK_MODEL}
PATCH_MODEL
  fi
  # ★R2-B22：写入 profile 的 baseURL 必须是 **Messages API 的根**（按优先级派生，见 messages_api_root）
  local endpoint=""
  endpoint="$(messages_api_root || true)"
  if [ -n "$endpoint" ]; then
    cat >> "$home/profiles/$DSH_PROFILE_NAME/cordis.patch.yml" <<PATCH_BASEURL
- id: llm-deepseek
  config:
    baseURL: ${endpoint}
PATCH_BASEURL
  fi
  # 可观测：生效端点（scheme+host+path，无 key）+ 模型名；无配置时明示 device-default
  if [ -n "$endpoint" ]; then
    printf 'MODEL_ENDPOINT=%s model=%s\n' "$(endpoint_label "$endpoint")" "${DEEPSEEK_MODEL:-na}"
  else
    printf 'MODEL_ENDPOINT=(device-default) model=%s\n' "${DEEPSEEK_MODEL:-na}"
  fi
}

dsh_version() {
  "$(dsh_bin)" --version 2> /dev/null | head -1
}

# changed_paths <before> <after>：只输出真正的文件指纹变化行（忽略 diff 的区间标记行）
changed_paths() {
  diff "$1" "$2" 2> /dev/null | grep -E '^[<>] [0-9]+ [0-9]+ /' || true
}

key_from_env() {
  if [ -n "${DEEPSEEK_API_KEY:-}" ]; then echo "$DEEPSEEK_API_KEY"; return 0; fi
  return 1
}

key_from_dsh_home() {
  local f="$DSH_HOME_REAL/.credentials.yaml"
  [ -f "$f" ] || return 1
  python3 - "$f" <<'PY'
import sys
try:
    lines = open(sys.argv[1], encoding='utf-8').read().splitlines()
except OSError:
    sys.exit(3)
found = ''
for line in lines:
    s = line.strip()
    if not s or s.startswith('#') or ':' not in s:
        continue
    k, v = s.split(':', 1)
    if k.strip() == 'DEEPSEEK_API_KEY':
        v = v.strip().strip('"').strip("'")
        if v:
            found = v
if not found:
    sys.exit(4)
sys.stdout.write(found)
PY
}

key_from_db() {
  local env_file="$DSH_REPO_ROOT/server/.env" url db tmp out
  [ -f "$env_file" ] || return 1
  command -v mysql > /dev/null 2>&1 || return 1
  url="$(grep -m1 '^DATABASE_URL=' "$env_file" | cut -d= -f2- || true)"
  [ -n "$url" ] || return 1
  tmp="$(mktemp "${TMPDIR:-/tmp}/dsh-grader-my.cnf.XXXXXX")" || return 1
  chmod 600 "$tmp"
  if ! db="$(python3 - "$url" "$tmp" <<'PY'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
db = (u.path or '/').lstrip('/')
if not db:
    sys.exit(5)
lines = [
    '[client]',
    'user=' + (u.username or ''),
    'password=' + (u.password or ''),
    'host=' + (u.hostname or '127.0.0.1'),
    'port=' + str(u.port or 3306),
    'connect-timeout=8',
]
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    f.write(chr(10).join(lines) + chr(10))
sys.stdout.write(db)
PY
)"; then rm -f "$tmp"; return 1; fi
  out="$(mysql --defaults-extra-file="$tmp" "$db" -N -s -e 'SELECT value FROM system_configs WHERE `key` = "deepseek_api_key" LIMIT 1;' 2>/dev/null || true)"
  rm -f "$tmp"
  [ -n "$out" ] || return 1
  echo "$out"
}

# install_credentials <isolated-home>：env > ~/.dsh/.credentials.yaml > DB(system_configs)，只取 DEEPSEEK_API_KEY
install_credentials() {
  local home="$1" key="" src=""
  guard_isolated_home "$home" > /dev/null
  if key="$(key_from_env)"; then src="env:DEEPSEEK_API_KEY"
  elif key="$(key_from_dsh_home)"; then src="$DSH_HOME_REAL/.credentials.yaml"
  elif key="$(key_from_db)"; then src="db:system_configs.deepseek_api_key"
  fi
  [ -n "$key" ] || die "未找到 DEEPSEEK_API_KEY（env / ~/.dsh/.credentials.yaml / DB 三处皆无）"
  echo "DEEPSEEK_API_KEY: $key" > "$home/.credentials.yaml"
  chmod 600 "$home/.credentials.yaml"
  log "凭据：source=$src key_len=${#key}（值不落日志）→ $home/.credentials.yaml chmod 600"
  unset key
}

cleanup_credentials() {
  local home="$1"
  if [ -n "$home" ] && [ -f "$home/.credentials.yaml" ]; then
    rm -f "$home/.credentials.yaml"
    log "凭据清理：已删除 $home/.credentials.yaml"
  fi
}

# ===== ★R2-B23：teardown（取证 → 策略 → 销毁 → 反证）=====

# session_stats <home>：→ "<files> <bytes>"（会话文件 = sessions/** + storages/session_projcache/**）
session_stats() {
  local home="$1" files=0 bytes=0 d stat_out n s
  if [ -z "$home" ] || [ ! -d "$home" ]; then printf '0 0\n'; return 0; fi
  for d in "$home/sessions" "$home/storages/session_projcache"; do
    [ -d "$d" ] || continue
    stat_out="$(find "$d" -type f -exec stat -f '%z' {} + 2> /dev/null | awk '{s+=$1} END {printf "%d %d", NR, s+0}')"
    n="${stat_out%% *}"; s="${stat_out##* }"
    files=$((files + ${n:-0})); bytes=$((bytes + ${s:-0}))
  done
  printf '%s %s\n' "$files" "$bytes"
}

# home_file_count <dir>：文件数（目录不存在 ⇒ 0）
home_file_count() {
  local d="$1"
  [ -n "$d" ] && [ -d "$d" ] || { printf '0\n'; return 0; }
  find "$d" -type f 2> /dev/null | wc -l | tr -d ' '
}

# purge_home_dir <home>：删除隔离 home 并**反证**（仍存在 ⇒ 返回 1）
purge_home_dir() {
  local home="$1"
  [ -n "$home" ] || return 1
  if [ -e "$home" ]; then rm -rf "$home" 2> /dev/null || true; fi
  [ ! -e "$home" ]
}

# write_keep_scene <home> <keep_days>：失败现场保留标记（不删任何东西）
write_keep_scene() {
  local home="$1" days="$2"
  if [ -z "$home" ] || [ ! -d "$home" ]; then return 0; fi
  {
    printf 'keep_scene=yes\n'
    printf 'keep_days=%s\n' "$days"
    printf 'reason=non-zero-exit\n'
    printf 'ts=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$home/.keep-scene" 2> /dev/null || true
}

# snapshot_dsh_home <out-file>：~/.dsh 文件指纹（mtime/size/path），排除 node_modules
snapshot_dsh_home() {
  local out="$1"
  find "$DSH_HOME_REAL" -path '*/node_modules' -prune -o -type f -print0 2> /dev/null | xargs -0 stat -f '%m %z %N' 2> /dev/null | LC_ALL=C sort > "$out" || true
}


# snapshot_ports <out-file>：当前监听端口集合
snapshot_ports() {
  local out="$1"
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1, $9}' | LC_ALL=C sort -u > "$out" || true
}

# scan_key_leak <dir> [<isolated-credentials-file>]：
#   给了凭据文件 → 先按【明文值精确比对】，再退回【sk- 形态】比对；没给 → 只做形态比对。
#   命中即返回非 0，并把命中文件名打到 stdout；本函数自身不打印明文。
scan_key_leak() {
  local dir="$1" cred="${2:-}"
  python3 - "$dir" "$cred" <<'PY'
import os
import re
import sys

target = sys.argv[1]
cred = sys.argv[2]
pat = re.compile(r'(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9]{20,}($|[^A-Za-z0-9_-])')
key = ''
if cred and os.path.isfile(cred):
    for line in open(cred, encoding='utf-8'):
        s = line.strip()
        if s.startswith('DEEPSEEK_API_KEY:'):
            key = s.split(':', 1)[1].strip()
    if not key:
        print('SCAN_FAIL credentials-file-without-key ' + cred)
        sys.exit(1)
hits = []
for dirpath, dirnames, filenames in os.walk(target):
    for fn in filenames:
        p = os.path.join(dirpath, fn)
        try:
            text = open(p, encoding='utf-8', errors='replace').read()
        except OSError:
            continue
        if key and key in text:
            hits.append('PLAINTEXT_KEY ' + p)
        elif pat.search(text):
            hits.append('SK_SHAPE ' + p)
for h in hits:
    print(h)
sys.exit(1 if hits else 0)
PY
}
