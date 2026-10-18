#!/usr/bin/env bash
# =============================================================================
# exam-worker-rollback.sh — 编程题评分 worker 迁移：备份 / 预检 / 串行切换 / 回滚
#
# 适用范围：docs/plan/2026-10-18-exam-worker-migration.md 的 Phase C/D。
#   旧 worker：pm2 进程 exam-worker（cwd OLD_ROOT，入口 src/worker.js）
#   新 worker：pm2 进程 exam-worker-next（cwd NEW_ROOT，仓库当前代码）
#   ★铁律：exam-worker（编程题/客观题）与 dsh-grader-worker（实训题）是并列两条线；
#           本脚本只动 exam-worker 线，绝不 stop/delete dsh-grader-worker 与 exam-server-new。
#
# 子命令：
#   backup     部署前备份（旧目录 tar、pm2 dump/jlist/describe、old/new .env、DB dump + MANIFEST）
#   preflight  切换前检查（路径/语法/env 完整性/开关/PM2 状态/回调端点/DB 队列基线/磁盘）
#   switch     串行切换：停旧 → 启新（exam-worker-next, PORT=EXPECTED_PORT, 关 legacy 项目扫描）
#              → 验证（进程/启动日志/错误日志/回调 403/队列）→ pm2 save；失败可自动回滚
#   rollback   回滚：停/删新 → （可选）恢复旧 env/旧目录 → 启旧 → 验证 → pm2 save
#              DB 恢复属最后手段，必须 --restore-db 与 --confirm-db-restore 双确认
#   status     只读巡检（PM2 四进程 / 队列 / 回调 / 磁盘 / 最近备份）
#   selftest   本地无害演练：临时目录 + mock pm2/mysql/mysqldump/curl 跑通
#              backup→preflight→switch→rollback，不触碰真实 PM2/DB/生产
#
# 安全约定：
#   · 默认 dry-run：只有显式 --apply 才执行变更；switch/rollback 还要求 --confirm。
#   · 非 root 拒绝 --apply（本地演练用 --allow-nonroot）；生产必须以 root 执行。
#   · 连接串/口令绝不进 argv：DB 访问走 --defaults-extra-file 或 MYSQL_PWD 环境变量。
#   · 备份目录 700、含 secret 的文件 600；脚本不打印任何 secret 值。
#
# 用法：
#   bash scripts/deploy/exam-worker-rollback.sh preflight
#   bash scripts/deploy/exam-worker-rollback.sh backup --apply --confirm
#   bash scripts/deploy/exam-worker-rollback.sh switch --apply --confirm --backup-dir <备份目录>
#   bash scripts/deploy/exam-worker-rollback.sh rollback --apply --confirm --backup-dir <备份目录>
#   bash scripts/deploy/exam-worker-rollback.sh selftest
#
# 环境变量覆盖：OLD_ROOT/NEW_ROOT/OLD_NAME/NEW_NAME/SERVER_NAME/DSH_GRADER_NAME/BACKUP_ROOT/
#   DB_NAME/DB_DEFAULTS_EXTRA_FILE/DB_USER/EXPECTED_PORT/PM2_BIN/MYSQL_BIN/MYSQLDUMP_BIN/
#   NODE_BIN/CURL_BIN/PM2_DUMP_FILE/HEALTH_URL/CALLBACK_URL/MIN_FREE_MB/WAIT_SECONDS/
#   MIN_DB_DUMP_BYTES/DRAIN_SECONDS
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------- 配置默认值
OLD_NAME="${OLD_NAME:-exam-worker}"
NEW_NAME="${NEW_NAME:-exam-worker-next}"
OLD_ROOT="${OLD_ROOT:-/var/www/exam/server}"
NEW_ROOT="${NEW_ROOT:-/var/www/exam-new/server}"
SERVER_NAME="${SERVER_NAME:-exam-server-new}"
DSH_GRADER_NAME="${DSH_GRADER_NAME:-dsh-grader-worker}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/backups}"
DB_NAME="${DB_NAME:-exam_system}"
DB_DEFAULTS_EXTRA_FILE="${DB_DEFAULTS_EXTRA_FILE:-/root/.my.cnf}"
DB_USER="${DB_USER:-}"
EXPECTED_PORT="${EXPECTED_PORT:-3002}"
PM2_BIN="${PM2_BIN:-pm2}"
MYSQL_BIN="${MYSQL_BIN:-mysql}"
MYSQLDUMP_BIN="${MYSQLDUMP_BIN:-mysqldump}"
NODE_BIN="${NODE_BIN:-node}"
CURL_BIN="${CURL_BIN:-curl}"
PM2_DUMP_FILE="${PM2_DUMP_FILE:-${HOME:-/root}/.pm2/dump.pm2}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3002/api/health}"
CALLBACK_URL="${CALLBACK_URL:-http://127.0.0.1:3002/api/internal/graded}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"
WAIT_SECONDS="${WAIT_SECONDS:-30}"
MIN_DB_DUMP_BYTES="${MIN_DB_DUMP_BYTES:-1024}"
DRAIN_SECONDS="${DRAIN_SECONDS:-15}"

APPLY=0; CONFIRM=0; ALLOW_NONROOT=0; SKIP_PREFLIGHT=0; AUTO_ROLLBACK=1
ALLOW_MISSING_SCAN_FLAG=0; RESTORE_OLD_ENV=0; RESTORE_OLD_DIR=0; RESTORE_PM2_DUMP=0
RESTORE_DB=0; CONFIRM_DB_RESTORE=0; BACKUP_DIR=""
FAIL=0; WARN=0

# ---------------------------------------------------------------- 基础工具
hr() { printf '%s\n' '--------------------------------------------------------------------'; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  [PASS] %s\n' "$*"; }
warn() { printf '  [WARN] %s\n' "$*"; WARN=$((WARN + 1)); }
bad()  { printf '  [FAIL] %s\n' "$*"; FAIL=$((FAIL + 1)); }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "缺少必需命令：$1"; }
usage() { awk 'NR==1{next} /^set -euo/{exit} /^#/{print substr($0,3)}' "$0"; }

require_apply() {
  if [ "$APPLY" != 1 ]; then info '当前为 dry-run：只打印计划，不执行变更。加 --apply --confirm 才会真正执行。'; return 1; fi
  if [ "$CONFIRM" != 1 ]; then die '破坏性操作需要 --confirm'; fi
  if [ "$(id -u)" != 0 ] && [ "$ALLOW_NONROOT" != 1 ]; then die '需要 root 执行（pm2/文件权限）；仅本地演练可加 --allow-nonroot'; fi
  return 0
}

require_paths() {
  [ -d "$OLD_ROOT" ] || die "OLD_ROOT 不存在：$OLD_ROOT"
  [ -d "$NEW_ROOT" ] || die "NEW_ROOT 不存在：$NEW_ROOT"
  [ "$OLD_ROOT" != "$NEW_ROOT" ] || die 'OLD_ROOT 与 NEW_ROOT 不能相同'
  [ "$OLD_NAME" != "$NEW_NAME" ] || die 'OLD_NAME 与 NEW_NAME 不能相同'
  [ "$NEW_NAME" != "$DSH_GRADER_NAME" ] || die '禁止复用 dsh-grader-worker 名称（实训题链路必须独立）'
  [ "$NEW_NAME" != "$SERVER_NAME" ] || die '禁止复用 exam-server-new 名称'
}

latest_backup() { ls -1dt "$BACKUP_ROOT"/worker-migration-* 2>/dev/null | head -n 1 || true; }
resolve_backup_dir() {
  if [ -z "$BACKUP_DIR" ]; then BACKUP_DIR="$(latest_backup)"; fi
  [ -n "$BACKUP_DIR" ] || die '找不到备份目录：请先执行 backup --apply，或用 --backup-dir 指定'
  [ -d "$BACKUP_DIR" ] || die "备份目录不存在：$BACKUP_DIR"
  [ -f "$BACKUP_DIR/MANIFEST.sha256" ] || die "备份不完整（缺 MANIFEST.sha256）：$BACKUP_DIR"
}
sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
free_mb_of() { df -Pm "$1" 2>/dev/null | awk 'NR==2 {print $4}' | tr -d ' '; }

# ---------------------------------------------------------------- pm2 封装
pm2_status() {
  local name="$1" out=""
  command -v "$PM2_BIN" >/dev/null 2>&1 || { printf 'tool_missing\n'; return 0; }
  out="$("$PM2_BIN" jlist 2>/dev/null | "$NODE_BIN" -e '
    let s = "";
    process.stdin.on("data", d => { s += d; });
    process.stdin.on("end", () => {
      let list = [];
      try { list = JSON.parse(s || "[]"); } catch (e) { console.log("parse_error"); return; }
      const p = list.find(x => x && x.name === process.argv[1]);
      if (!p) { console.log("missing"); return; }
      console.log((p.pm2_env && p.pm2_env.status) || "unknown");
    });' "$name" 2>/dev/null || true)"
  [ -n "$out" ] || out="parse_error"
  printf '%s\n' "$out"
}
pm2_log_tail() { "$PM2_BIN" logs "$1" --lines "${2:-80}" --nostream 2>/dev/null || true; }
wait_old_stopped() {
  local seconds="$1" i=0 st=""
  while [ "$i" -lt "$seconds" ]; do
    st="$(pm2_status "$OLD_NAME")"
    case "$st" in stopped|missing|errored) printf '%s\n' "$st"; return 0 ;; esac
    i=$((i + 1)); sleep 1
  done
  pm2_status "$OLD_NAME"; return 1
}
wait_new_online() {
  local seconds="$1" i=0 st=""
  while [ "$i" -lt "$seconds" ]; do
    st="$(pm2_status "$NEW_NAME")"
    if [ "$st" = online ]; then printf '%s\n' "$st"; return 0; fi
    i=$((i + 1)); sleep 1
  done
  pm2_status "$NEW_NAME"; return 1
}

# ---------------------------------------------------------------- DB / HTTP 封装
db_ready() { [ -f "$DB_DEFAULTS_EXTRA_FILE" ] && return 0; [ -n "${MYSQL_PWD:-}" ] && return 0; return 1; }
db_scalar() {
  local sql="$1"
  if [ ! -f "$DB_DEFAULTS_EXTRA_FILE" ] && [ -z "${MYSQL_PWD:-}" ]; then return 1; fi
  if [ -f "$DB_DEFAULTS_EXTRA_FILE" ]; then
    if [ -n "$DB_USER" ]; then "$MYSQL_BIN" --defaults-extra-file="$DB_DEFAULTS_EXTRA_FILE" -u "$DB_USER" -N -B -e "$sql" "$DB_NAME" 2>/dev/null || true
    else "$MYSQL_BIN" --defaults-extra-file="$DB_DEFAULTS_EXTRA_FILE" -N -B -e "$sql" "$DB_NAME" 2>/dev/null || true; fi
  else
    if [ -n "$DB_USER" ]; then "$MYSQL_BIN" -u "$DB_USER" -N -B -e "$sql" "$DB_NAME" 2>/dev/null || true
    else "$MYSQL_BIN" -N -B -e "$sql" "$DB_NAME" 2>/dev/null || true; fi
  fi
}
db_dump_to() {
  local out="$1"
  if [ -f "$DB_DEFAULTS_EXTRA_FILE" ]; then
    if [ -n "$DB_USER" ]; then "$MYSQLDUMP_BIN" --defaults-extra-file="$DB_DEFAULTS_EXTRA_FILE" -u "$DB_USER" --single-transaction --quick --routines --triggers "$DB_NAME" | gzip -c > "$out"
    else "$MYSQLDUMP_BIN" --defaults-extra-file="$DB_DEFAULTS_EXTRA_FILE" --single-transaction --quick --routines --triggers "$DB_NAME" | gzip -c > "$out"; fi
  else
    if [ -n "$DB_USER" ]; then "$MYSQLDUMP_BIN" -u "$DB_USER" --single-transaction --quick --routines --triggers "$DB_NAME" | gzip -c > "$out"
    else "$MYSQLDUMP_BIN" --single-transaction --quick --routines --triggers "$DB_NAME" | gzip -c > "$out"; fi
  fi
}
http_code() {
  local method="$1" url="$2" code=""
  if [ "$method" = POST ]; then
    code="$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST -H 'Content-Type: application/json' -d '{}' "$url" 2>/dev/null || true)"
  else
    code="$("$CURL_BIN" -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || true)"
  fi
  [ -n "$code" ] || code="000"
  printf '%s\n' "$code"
}
env_get() {
  local file="$1" key="$2"
  [ -f "$file" ] || { printf '\n'; return 0; }
  grep -E "^$key=" "$file" 2>/dev/null | head -n 1 | cut -d= -f2- | tr -d '\r' || true
}
queue_submitted() { db_scalar "SELECT COUNT(*) FROM submissions s JOIN questions q ON q.id = s.question_id WHERE s.status='submitted' AND q.type <> 'project';" | head -n 1; }
queue_drafts_expired() { db_scalar "SELECT COUNT(*) FROM submissions WHERE status='draft' AND assignment_id IN (SELECT id FROM assignments WHERE end_time < NOW());" | head -n 1; }
queue_project_rows() { db_scalar "SELECT CONCAT(COALESCE(status,'?'), '=', COUNT(*)) FROM project_submissions GROUP BY status;" | tr '\n' ' '; }
queue_grading_jobs() { db_scalar "SELECT CONCAT(COALESCE(status,'?'), '=', COUNT(*)) FROM grading_jobs GROUP BY status;" | tr '\n' ' '; }

# ================================================================ backup
cmd_backup() {
  local ts b
  ts="$(date +%Y%m%d-%H%M%S)"
  b="$BACKUP_DIR"
  if [ -z "$b" ]; then b="$BACKUP_ROOT/worker-migration-$ts"; fi
  [ -e "$b" ] && die "备份目录已存在（拒绝覆盖）：$b"
  hr
  info "备份目标：$b"
  info "旧 worker：$OLD_NAME @ $OLD_ROOT"
  info "新 worker：$NEW_NAME @ $NEW_ROOT"
  info "DB：${DB_NAME}（dump gzip；连接串不进 argv）"
  hr
  if [ "$APPLY" != 1 ]; then
    info '[dry-run] 将执行：'
    info "  1) mkdir -m 700 $b"
    info '  2) pm2 save（固化当前进程表）'
    info '  3) tar 旧目录（排除 node_modules/uploads/logs/.env）→ old-worker-src.tgz'
    info '  4) pm2 jlist / describe / list 快照 + 复制 pm2 dump'
    info '  5) 复制 old.env / new.env（600，不打印内容）'
    info '  6) mysqldump --single-transaction → exam_system.sql.gz'
    info '  7) MANIFEST.sha256 + MANIFEST.txt，chmod -R go-rwx'
    info '加 --apply --confirm 执行。'
    return 0
  fi
  require_apply || return 0
  need_cmd "$PM2_BIN"; need_cmd gzip; require_paths
  mkdir -p "$b"; chmod 700 "$b"
  info '① pm2 save（固化当前进程表）'
  "$PM2_BIN" save >/dev/null 2>&1 || warn 'pm2 save 失败（仍以 jlist 快照备份）'
  info '② 旧 worker 目录 tar（排除 node_modules/uploads/logs/.env）'
  tar -czf "$b/old-worker-src.tgz" --exclude='*/node_modules' --exclude='*/uploads' --exclude='*/logs' --exclude='*/.env' --exclude='*/test-results' -C "$(dirname "$OLD_ROOT")" "$(basename "$OLD_ROOT")" 2>/dev/null || die '旧目录 tar 失败'
  ok "old-worker-src.tgz（$(wc -c < "$b/old-worker-src.tgz" | tr -d ' ') bytes）"
  info '③ PM2 快照'
  "$PM2_BIN" jlist > "$b/pm2-jlist.json" 2>/dev/null || warn 'pm2 jlist 失败'
  "$PM2_BIN" describe "$OLD_NAME" > "$b/pm2-describe-old.txt" 2>/dev/null || warn 'pm2 describe 旧 worker 失败'
  "$PM2_BIN" describe "$NEW_NAME" > "$b/pm2-describe-new.txt" 2>/dev/null || true
  "$PM2_BIN" list > "$b/pm2-list.txt" 2>/dev/null || true
  if [ -f "$PM2_DUMP_FILE" ]; then cp -p "$PM2_DUMP_FILE" "$b/pm2-dump.pm2"; ok 'pm2-dump.pm2'; else warn "未找到 pm2 dump：$PM2_DUMP_FILE"; fi
  info '④ .env 副本（600；内容不打印）'
  if [ -f "$OLD_ROOT/.env" ]; then cp -p "$OLD_ROOT/.env" "$b/old.env"; chmod 600 "$b/old.env"; ok 'old.env'; else warn '旧目录无 .env（rollback 启动旧 worker 前须手工确认）'; fi
  if [ -f "$NEW_ROOT/.env" ]; then cp -p "$NEW_ROOT/.env" "$b/new.env"; chmod 600 "$b/new.env"; ok 'new.env'; else warn '新目录无 .env（preflight 会 FAIL）'; fi
  info '⑤ DB dump（--single-transaction；失败立即中止）'
  if [ ! -f "$DB_DEFAULTS_EXTRA_FILE" ] && [ -z "${MYSQL_PWD:-}" ]; then die "无 DB 凭据：请提供 ${DB_DEFAULTS_EXTRA_FILE}（chmod 600）或 MYSQL_PWD 环境变量后再备份"; fi
  db_dump_to "$b/exam_system.sql.gz" || die 'mysqldump 失败'
  local dbsize
  dbsize="$(wc -c < "$b/exam_system.sql.gz" | tr -d ' ')"
  if [ "$dbsize" -lt "$MIN_DB_DUMP_BYTES" ]; then die "DB dump 过小（$dbsize bytes < ${MIN_DB_DUMP_BYTES}）"; fi
  ok "exam_system.sql.gz（$dbsize bytes）"
  info '⑥ MANIFEST'
  (
    cd "$b"
    printf '# exam-worker migration backup\n# created=%s host=%s\n# OLD_ROOT=%s\n# NEW_ROOT=%s\n# DB=%s\n' "$ts" "$(hostname 2>/dev/null || echo unknown)" "$OLD_ROOT" "$NEW_ROOT" "$DB_NAME" > MANIFEST.txt
    for f in *; do
      [ -f "$f" ] || continue
      printf '%s  %s\n' "$(sha256_of "$f")" "$f"
    done >> MANIFEST.sha256
  )
  chmod -R go-rwx "$b"
  ok "MANIFEST.sha256（$(wc -l < "$b/MANIFEST.sha256" | tr -d ' ') 项）"
  hr
  info "备份完成：$b"
  info '下一步：'
  info "  1) 备份含旧 .env 与 DB dump ⇒ 立刻复制到本机/离线：scp -r root@<host>:$b ./"
  info "  2) bash $0 preflight"
  info "  3) 低峰窗口：bash $0 switch --apply --confirm --backup-dir $b"
  hr
}

# ================================================================ preflight
cmd_preflight() {
  hr
  info "preflight · OLD=$OLD_ROOT ($OLD_NAME) · NEW=$NEW_ROOT ($NEW_NAME)"
  info "时间：$(date '+%Y-%m-%d %H:%M:%S %Z')"
  hr
  require_paths
  if [ "$(id -u)" != 0 ]; then warn '非 root：看不到 root 的 pm2 进程表，结果仅供参考（生产请以 root 执行）'; fi

  info '① 目录与入口'
  [ -f "$OLD_ROOT/src/worker.js" ] && ok "旧入口 $OLD_ROOT/src/worker.js" || bad "旧入口缺失：$OLD_ROOT/src/worker.js"
  [ -f "$NEW_ROOT/src/worker.js" ] && ok "新入口 $NEW_ROOT/src/worker.js" || bad "新入口缺失：$NEW_ROOT/src/worker.js"
  [ -f "$NEW_ROOT/src/infrastructure/worker/grading-worker.js" ] && ok '新 grading-worker.js 存在' || bad '新 grading-worker.js 缺失'

  info '② 新 worker 语法检查'
  if command -v "$NODE_BIN" >/dev/null 2>&1; then
    if ( cd "$NEW_ROOT" && "$NODE_BIN" --check src/worker.js >/dev/null 2>&1 ); then ok 'node --check src/worker.js'; else bad 'node --check src/worker.js 失败'; fi
    if ( cd "$NEW_ROOT" && "$NODE_BIN" --check src/infrastructure/worker/grading-worker.js >/dev/null 2>&1 ); then ok 'node --check grading-worker.js'; else bad 'node --check grading-worker.js 失败'; fi
    if [ -d "$NEW_ROOT/node_modules/@prisma/client" ]; then ok '新目录依赖已安装（@prisma/client）'; else bad '新目录缺 node_modules/@prisma/client ⇒ 先 npm ci --legacy-peer-deps'; fi
  else
    bad "缺少 node：$NODE_BIN"
  fi

  info '③ 新 .env 完整性（只判断存在/期望值，不打印 secret）'
  local newenv="$NEW_ROOT/.env" oldenv="$OLD_ROOT/.env"
  if [ -f "$newenv" ]; then
    [ -n "$(env_get "$newenv" INTERNAL_SECRET)" ] && ok 'INTERNAL_SECRET 已配置（值不显示）' || bad 'INTERNAL_SECRET 未配置 ⇒ 回调与主进程均不可用'
    [ -n "$(env_get "$newenv" DATABASE_URL)" ] && ok 'DATABASE_URL 已配置（值不显示）' || bad 'DATABASE_URL 未配置'
    local port scanflag
    port="$(env_get "$newenv" PORT)"
    if [ "$port" = "$EXPECTED_PORT" ]; then ok "PORT=${EXPECTED_PORT}（worker 回调目标）"; else bad "PORT=${port}，期望 ${EXPECTED_PORT}（回调固定 http://127.0.0.1:PORT/api/internal/graded）"; fi
    scanflag="$(env_get "$newenv" WORKER_ENABLE_PROJECT_SCAN)"
    if [ "$scanflag" = true ]; then bad 'WORKER_ENABLE_PROJECT_SCAN=true ⇒ 会与 dsh-grader-worker 双评实训题，必须 false/缺省'; else ok 'legacy 项目扫描未开启（false/缺省）'; fi
  else
    bad "新 .env 不存在：$newenv"
  fi
  if [ -f "$oldenv" ]; then
    if [ -n "$(env_get "$oldenv" INTERNAL_SECRET)" ]; then warn '旧 .env 竟含 INTERNAL_SECRET：与计划“旧回调已失效”不符，回滚后请复核'; else warn '旧 .env 无 INTERNAL_SECRET（已知：旧回调本就失效；评分仍写库）'; fi
  else
    warn '旧目录无 .env —— rollback 启动旧 worker 前须确认'
  fi

  info '④ legacy 项目扫描开关（D 的 WORKER_ENABLE_PROJECT_SCAN）'
  if grep -q 'WORKER_ENABLE_PROJECT_SCAN' "$NEW_ROOT/src/infrastructure/worker/grading-worker.js" 2>/dev/null; then
    ok '新代码已支持 WORKER_ENABLE_PROJECT_SCAN'
    if grep -qE 'scanProjectSubmissions\(\)' "$NEW_ROOT/src/infrastructure/worker/grading-worker.js"; then
      warn '仍检测到 scanProjectSubmissions() 调用点：请人工确认它已被 flag 包裹（看 D 的 diff）'
    fi
  else
    if [ "$ALLOW_MISSING_SCAN_FLAG" = 1 ]; then warn '新代码不支持 WORKER_ENABLE_PROJECT_SCAN（--allow-missing-scan-flag 放行，风险自负）'; else bad '新代码不支持 WORKER_ENABLE_PROJECT_SCAN ⇒ Phase B(task-44) 未落地，禁止切换（或显式 --allow-missing-scan-flag）'; fi
  fi

  info '⑤ PM2 进程状态'
  local st_old st_new st_srv st_dsh
  st_old="$(pm2_status "$OLD_NAME")"; st_new="$(pm2_status "$NEW_NAME")"
  st_srv="$(pm2_status "$SERVER_NAME")"; st_dsh="$(pm2_status "$DSH_GRADER_NAME")"
  if [ "$st_old" = online ]; then ok "$OLD_NAME=online"; else bad "$OLD_NAME=${st_old}（切换要求旧 worker 在线）"; fi
  if [ "$st_new" = missing ]; then ok "$NEW_NAME 不存在（尚未启动）"; else bad "$NEW_NAME=${st_new}（已存在 ⇒ 先人工清理，避免双消费）"; fi
  if [ "$st_srv" = online ]; then ok "$SERVER_NAME=online（回调目标主进程）"; else warn "$SERVER_NAME=${st_srv}（回调可能不通）"; fi
  if [ "$st_dsh" = online ]; then ok "$DSH_GRADER_NAME=online（实训题链路，本脚本不动它）"; else warn "$DSH_GRADER_NAME=$st_dsh"; fi

  info '⑥ 回调端点（不带 secret、不写数据）'
  local hc cc
  hc="$(http_code GET "$HEALTH_URL")"
  if [ "$hc" = 200 ]; then ok "GET $HEALTH_URL ⇒ 200"; else bad "GET $HEALTH_URL ⇒ $hc"; fi
  cc="$(http_code POST "$CALLBACK_URL")"
  case "$cc" in
    403) ok "POST $CALLBACK_URL 无凭据 ⇒ 403（路由存在且拒绝未授权）" ;;
    404) bad "POST $CALLBACK_URL ⇒ 404（路由缺失/主进程版本不对）" ;;
    200) bad "POST $CALLBACK_URL ⇒ 200（未授权竟通过：立即停止，安全回归）" ;;
    *)   bad "POST $CALLBACK_URL ⇒ ${cc}（预期 403）" ;;
  esac

  info '⑦ DB 连通性与队列基线（只读）'
  if ! db_ready; then
    bad "无 DB 凭据（$DB_DEFAULTS_EXTRA_FILE 或 MYSQL_PWD）⇒ 无法做队列基线"
  else
    local one qsub qdraft qproj qjobs
    one="$(db_scalar 'SELECT 1;' | head -n 1)"
    if [ "$one" = 1 ]; then ok 'DB SELECT 1'; else bad "DB 连接失败（${DB_NAME}）"; fi
    qsub="$(queue_submitted)"; qdraft="$(queue_drafts_expired)"; qproj="$(queue_project_rows)"; qjobs="$(queue_grading_jobs)"
    info "  submissions(status=submitted, 非 project) = ${qsub:-(unknown)}"
    info "  submissions(draft 且已过 end_time)         = ${qdraft:-(unknown)}"
    info "  project_submissions(按 status)             = ${qproj:-(none)}"
    info "  grading_jobs(按 status)                    = ${qjobs:-(none)}"
    if [ -n "${qsub:-}" ] && [ "${qsub:-0}" != 0 ]; then warn "切换时仍有 ${qsub} 条待评分提交：新 worker 会接管，建议低峰/队列清空后切"; fi
    if [ -n "${qproj:-}" ]; then warn 'project_submissions 非空：关闭 legacy 扫描前必须确认 dsh-grader-worker 已覆盖（计划 §5 风险 3）'; fi
    if [ -n "${qdraft:-}" ] && [ "${qdraft:-0}" != 0 ]; then warn "有 ${qdraft} 条到期草稿：worker 启动会自动提交（既有行为），切换前知悉"; fi
  fi

  info '⑧ 磁盘余量'
  local fm
  fm="$(free_mb_of "$BACKUP_ROOT" 2>/dev/null || true)"
  [ -n "$fm" ] || fm="$(free_mb_of / 2>/dev/null || true)"
  if [ -n "$fm" ] && [ "$fm" -ge "$MIN_FREE_MB" ]; then ok "剩余 ${fm} MB ≥ $MIN_FREE_MB MB"; else bad "剩余 ${fm:-?} MB < $MIN_FREE_MB MB"; fi

  hr
  if [ "$FAIL" -gt 0 ]; then info "preflight 结论：FAIL（${FAIL} 项）｜WARN=$WARN ⇒ 禁止切换"; return 1; fi
  info "preflight 结论：PASS（WARN=${WARN}）"
  return 0
}

# ================================================================ switch
write_new_ecosystem() {
  local b="$1" eco="$1/exam-worker-next.ecosystem.cjs"
  {
    printf 'module.exports = {\n'
    printf '  apps: [{\n'
    printf "    name: '%s',\n" "$NEW_NAME"
    printf "    cwd: '%s',\n" "$NEW_ROOT"
    printf "    script: 'src/worker.js',\n"
    printf '    instances: 1,\n'
    printf "    exec_mode: 'fork',\n"
    printf '    env: {\n'
    printf "      NODE_ENV: 'production',\n"
    printf "      PORT: '%s',\n" "$EXPECTED_PORT"
    printf "      WORKER_ENABLE_PROJECT_SCAN: 'false',\n"
    printf '    },\n'
    printf '  }],\n'
    printf '};\n'
  } > "$eco"
  printf '%s\n' "$eco"
}

switch_verify() {
  local baseline_submitted="$1" ok_count=0 logs errs cc
  info '验证 1/4：进程 online'
  if wait_new_online "$WAIT_SECONDS" >/dev/null 2>&1; then ok "$NEW_NAME=online"; ok_count=$((ok_count + 1)); else bad "$NEW_NAME 未在 ${WAIT_SECONDS}s 内 online"; fi
  info '验证 2/4：启动日志'
  logs="$(pm2_log_tail "$NEW_NAME" 80)"
  if printf '%s' "$logs" | grep -q '评分 Worker 已启动'; then ok '日志出现「评分 Worker 已启动」'; ok_count=$((ok_count + 1)); else bad '最近 80 行未见启动标记'; fi
  info '验证 3/4：错误日志扫描'
  errs="$(printf '%s' "$logs" | grep -E 'PrismaClientInitializationError|ECONNREFUSED|Cannot find module|INTERNAL_SECRET 未配置' | head -n 3 || true)"
  if [ -z "$errs" ]; then ok '未见初始化/连接类错误'; ok_count=$((ok_count + 1)); else bad "发现错误：$errs"; fi
  info '验证 4/4：回调端点仍 403'
  cc="$(http_code POST "$CALLBACK_URL")"
  if [ "$cc" = 403 ]; then ok 'POST /api/internal/graded ⇒ 403'; ok_count=$((ok_count + 1)); else bad "POST /api/internal/graded ⇒ ${cc}（预期 403）"; fi
  if [ -n "$baseline_submitted" ] && [ "$baseline_submitted" != 0 ] && db_ready; then
    info "队列排空观察（baseline submitted=${baseline_submitted}，最多 ${DRAIN_SECONDS}s）"
    local i=0 now
    while [ "$i" -lt "$DRAIN_SECONDS" ]; do
      now="$(queue_submitted)"
      if [ -n "$now" ] && [ "$now" -lt "$baseline_submitted" ] 2>/dev/null; then info "  submitted: ${baseline_submitted} → ${now}"; break; fi
      i=$((i + 1)); sleep 1
    done
    if [ "$i" -ge "$DRAIN_SECONDS" ]; then warn "${DRAIN_SECONDS}s 内未见队列下降（持续流入属正常，请人工看评分完成日志）"; fi
  fi
  [ "$ok_count" -eq 4 ]
}

cmd_switch() {
  hr
  if [ "$APPLY" != 1 ]; then
    info '[dry-run] 计划：'
    info '  1) preflight（只读，见下）'
    info "  2) pm2 stop $OLD_NAME 并等待 stopped（双消费铁律：旧未停不得启新）"
    info "  3) 写 <备份目录>/exam-worker-next.ecosystem.cjs（PORT=$EXPECTED_PORT, WORKER_ENABLE_PROJECT_SCAN=false）"
    info "  4) pm2 start <ecosystem> --only ${NEW_NAME}；等待 online"
    info '  5) 验证 online / 启动日志 / 无错误 / 回调 403'
    info '  6) pm2 save；失败自动 rollback（--no-auto-rollback 可关）'
    hr
    if [ -d "$OLD_ROOT" ] && [ -d "$NEW_ROOT" ]; then
      cmd_preflight || true
    else
      info '（本机无生产路径：跳过 preflight 实测，仅打印计划）'
    fi
    return 0
  fi
  require_paths
  require_apply || return 0
  resolve_backup_dir
  info "使用备份：$BACKUP_DIR"
  [ -f "$BACKUP_DIR/old-worker-src.tgz" ] || die "备份缺 old-worker-src.tgz：$BACKUP_DIR"
  [ -f "$BACKUP_DIR/MANIFEST.sha256" ] || die '备份缺 MANIFEST.sha256'
  if [ "$SKIP_PREFLIGHT" = 1 ]; then warn '已按 --skip-preflight 跳过预检（不推荐）'; else cmd_preflight || die 'preflight 未通过：禁止切换'; fi
  hr
  info '切换 ①：停旧 worker（严格串行，避免双消费）'
  "$PM2_BIN" stop "$OLD_NAME" >/dev/null 2>&1 || warn "pm2 stop $OLD_NAME 返回非 0"
  if ! wait_old_stopped "$WAIT_SECONDS" >/dev/null 2>&1; then
    "$PM2_BIN" start "$OLD_NAME" >/dev/null 2>&1 || true
    die "旧 worker 未能在 ${WAIT_SECONDS}s 内停止；已尝试恢复旧 worker，终止切换"
  fi
  ok "$OLD_NAME=stopped"
  local baseline=""
  if db_ready; then baseline="$(queue_submitted)"; fi
  info '切换 ②：写新生态文件并启动 exam-worker-next'
  local eco
  eco="$(write_new_ecosystem "$BACKUP_DIR")"
  ok "ecosystem：$eco"
  if ! "$PM2_BIN" start "$eco" --only "$NEW_NAME" >/dev/null 2>&1; then
    info '启动失败 ⇒ 自动回滚'
    cmd_rollback || warn '自动回滚异常，请按 runbook 手工回滚'
    die '新 worker 启动失败'
  fi
  "$PM2_BIN" save >/dev/null 2>&1 || warn 'pm2 save 失败（切回前请手工 pm2 save）'
  info '切换 ③：验证'
  if switch_verify "$baseline"; then
    hr
    info "切换成功：$OLD_NAME=stopped，$NEW_NAME=online（PORT=${EXPECTED_PORT}，legacy 扫描关闭）"
    info "下一步：观察 24–48h；稳定后把 $NEW_NAME 转正为 ${OLD_NAME}（Phase D，另行执行）"
    hr
    return 0
  fi
  if [ "$AUTO_ROLLBACK" = 1 ]; then
    hr
    info '验证未全部通过：自动回滚（--no-auto-rollback 可关）'
    cmd_rollback || warn '自动回滚过程中出现异常，请立即按 runbook 手工回滚'
    return 1
  fi
  hr
  info '验证未全部通过，且已禁用自动回滚。手工回滚：'
  info "  bash $0 rollback --apply --confirm --backup-dir $BACKUP_DIR"
  return 1
}

# ================================================================ rollback
cmd_rollback() {
  if [ "$APPLY" != 1 ]; then
    info '[dry-run] 计划：'
    info "  1) pm2 stop/delete ${NEW_NAME}（若存在），确认已消失"
    info '  2) 可选：--restore-old-env（old.env 写回 OLD_ROOT）、--restore-old-dir（解包旧目录 tar）'
    info "  3) pm2 start $OLD_ROOT/src/worker.js --name $OLD_NAME --cwd $OLD_ROOT --update-env"
    info '     或 --restore-pm2-dump：恢复 dump 后 pm2 resurrect（会连带恢复 dump 内其他进程，慎用）'
    info '  4) 等待 online；检查日志；pm2 save'
    info '  5) DB 恢复仅限 --restore-db 与 --confirm-db-restore（会先停主进程，属最后手段）'
    return 0
  fi
  require_paths
  resolve_backup_dir
  require_apply || return 0
  hr
  info "回滚开始：$NEW_NAME → ${OLD_NAME}（备份：${BACKUP_DIR}）"
  hr
  info '回滚 ①：停/删新 worker'
  case "$(pm2_status "$NEW_NAME")" in
    missing) info "$NEW_NAME 不存在，跳过" ;;
    *) "$PM2_BIN" stop "$NEW_NAME" >/dev/null 2>&1 || warn "pm2 stop $NEW_NAME 返回非 0"
       "$PM2_BIN" delete "$NEW_NAME" >/dev/null 2>&1 || warn "pm2 delete $NEW_NAME 返回非 0" ;;
  esac
  case "$(pm2_status "$NEW_NAME")" in
    missing) ok "$NEW_NAME 已移除" ;;
    *) bad "仍存在 ${NEW_NAME}（$(pm2_status "$NEW_NAME")）⇒ 为避免双消费不启动旧 worker，请手工处理"; return 1 ;;
  esac
  info '回滚 ②：可选文件恢复'
  if [ "$RESTORE_OLD_ENV" = 1 ]; then
    if [ -f "$BACKUP_DIR/old.env" ]; then cp -p "$BACKUP_DIR/old.env" "$OLD_ROOT/.env"; chmod 600 "$OLD_ROOT/.env"; ok 'old.env 已写回'; else warn '备份无 old.env，跳过'; fi
  fi
  if [ "$RESTORE_OLD_DIR" = 1 ]; then
    [ -f "$BACKUP_DIR/old-worker-src.tgz" ] || die '备份无 old-worker-src.tgz，无法恢复目录'
    local ts tmp inner
    ts="$(date +%Y%m%d-%H%M%S)"
    tmp="${TMPDIR:-/tmp}/exam-worker-src-restore-$ts"
    mkdir -p "$tmp"
    tar -xzf "$BACKUP_DIR/old-worker-src.tgz" -C "$tmp" || die '解包旧目录失败'
    inner="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d | head -n 1)"
    [ -n "$inner" ] || die '旧目录 tar 结构异常'
    [ -f "$inner/src/worker.js" ] || die '解包后缺 src/worker.js，拒绝替换'
    [ -e "$OLD_ROOT.failed-$ts" ] && die "目标已存在：$OLD_ROOT.failed-$ts"
    mv "$OLD_ROOT" "$OLD_ROOT.failed-$ts"
    mv "$inner" "$OLD_ROOT"
    chmod 700 "$OLD_ROOT" 2>/dev/null || true
    ok "目录已恢复（损坏副本：$OLD_ROOT.failed-${ts}）"
  fi
  info '回滚 ③：启动旧 worker'
  if [ "$RESTORE_PM2_DUMP" = 1 ]; then
    if [ -f "$BACKUP_DIR/pm2-dump.pm2" ]; then
      cp -p "$BACKUP_DIR/pm2-dump.pm2" "$PM2_DUMP_FILE"
      warn 'pm2 resurrect 会恢复 dump 内全部进程（可能含早已停止的 exam-server@50001）；执行后必须 pm2 list 人工核对'
      "$PM2_BIN" resurrect >/dev/null 2>&1 || warn 'pm2 resurrect 失败'
    else
      warn '备份无 pm2-dump.pm2，退回直接启动'
    fi
  fi
  if [ "$(pm2_status "$OLD_NAME")" != online ]; then
    ( cd "$OLD_ROOT" && "$PM2_BIN" start "$OLD_ROOT/src/worker.js" --name "$OLD_NAME" --cwd "$OLD_ROOT" --update-env >/dev/null 2>&1 ) || { bad '旧 worker 启动失败'; return 1; }
  fi
  local i=0 st=""
  while [ "$i" -lt "$WAIT_SECONDS" ]; do
    st="$(pm2_status "$OLD_NAME")"
    if [ "$st" = online ]; then break; fi
    i=$((i + 1)); sleep 1
  done
  if [ "$st" = online ]; then ok "$OLD_NAME=online"; else bad "$OLD_NAME=$st ⇒ 请手工排查（pm2 logs ${OLD_NAME}）"; fi
  "$PM2_BIN" save >/dev/null 2>&1 || warn 'pm2 save 失败'
  info '回滚 ④：旧 worker 日志尾部（旧版启动日志措辞可能不同，仅提示）'
  local oldlogs
  oldlogs="$(pm2_log_tail "$OLD_NAME" 40)"
  if [ -z "$oldlogs" ]; then warn 'pm2 logs 无输出（首次启动/日志路径差异）'; elif printf '%s' "$oldlogs" | grep -q '评分'; then ok '日志含「评分」相关行'; else warn '旧日志未见评分标记，人工确认'; fi
  info '回滚 ⑤：DB 恢复（仅双确认时执行）'
  if [ "$RESTORE_DB" = 1 ]; then
    [ "$CONFIRM_DB_RESTORE" = 1 ] || die '恢复 DB 必须 --confirm-db-restore 双确认（会覆盖生产库）'
    [ -f "$BACKUP_DIR/exam_system.sql.gz" ] || die '备份无 exam_system.sql.gz'
    warn "即将恢复 DB：${DB_NAME}（先停主进程与 dsh worker，恢复后按原顺序启动）"
    "$PM2_BIN" stop "$SERVER_NAME" >/dev/null 2>&1 || true
    "$PM2_BIN" stop "$DSH_GRADER_NAME" >/dev/null 2>&1 || true
    if [ -f "$DB_DEFAULTS_EXTRA_FILE" ]; then
      if [ -n "$DB_USER" ]; then gunzip -c "$BACKUP_DIR/exam_system.sql.gz" | "$MYSQL_BIN" --defaults-extra-file="$DB_DEFAULTS_EXTRA_FILE" -u "$DB_USER" "$DB_NAME"; else gunzip -c "$BACKUP_DIR/exam_system.sql.gz" | "$MYSQL_BIN" --defaults-extra-file="$DB_DEFAULTS_EXTRA_FILE" "$DB_NAME"; fi
    else
      if [ -n "$DB_USER" ]; then gunzip -c "$BACKUP_DIR/exam_system.sql.gz" | "$MYSQL_BIN" -u "$DB_USER" "$DB_NAME"; else gunzip -c "$BACKUP_DIR/exam_system.sql.gz" | "$MYSQL_BIN" "$DB_NAME"; fi
    fi
    "$PM2_BIN" start "$SERVER_NAME" >/dev/null 2>&1 || warn "请手工启动 $SERVER_NAME"
    "$PM2_BIN" start "$DSH_GRADER_NAME" >/dev/null 2>&1 || warn "请手工启动 $DSH_GRADER_NAME"
    "$PM2_BIN" save >/dev/null 2>&1 || true
    ok 'DB 恢复完成（务必 smoke：health/登录/评分队列）'
  else
    info '跳过（worker 迁移不改 schema，通常不需要）'
  fi
  hr
  info "回滚完成：$OLD_NAME=online，$NEW_NAME 已移除。"
  info '必做收尾：'
  info "  1) pm2 list 核对；pm2 logs $OLD_NAME 观察评分"
  info "  2) curl -s -o /dev/null -w '%{http_code}' $HEALTH_URL 应为 200"
  info '  3) 队列观察：submissions.status=submitted 是否被消费'
  info '  4) 记录到 DEPLOYMENT 文档，并保留备份目录（不要删）'
  hr
  return 0
}

# ================================================================ status
cmd_status() {
  hr
  info "status · $(date '+%Y-%m-%d %H:%M:%S %Z')"
  hr
  info 'PM2：'
  info "  $OLD_NAME         = $(pm2_status "$OLD_NAME")"
  info "  $NEW_NAME     = $(pm2_status "$NEW_NAME")"
  info "  $SERVER_NAME      = $(pm2_status "$SERVER_NAME")"
  info "  $DSH_GRADER_NAME = $(pm2_status "$DSH_GRADER_NAME")"
  info "回调：GET $HEALTH_URL ⇒ $(http_code GET "$HEALTH_URL")｜POST $CALLBACK_URL ⇒ $(http_code POST "$CALLBACK_URL")"
  if db_ready; then
    info "队列：submitted=$(queue_submitted)｜到期草稿=$(queue_drafts_expired)｜project=[$(queue_project_rows)]｜grading_jobs=[$(queue_grading_jobs)]"
  else
    warn '无 DB 凭据，跳过队列'
  fi
  local fm
  fm="$(free_mb_of "$BACKUP_ROOT" 2>/dev/null || true)"
  info "磁盘剩余：${fm:-?} MB（阈值 ${MIN_FREE_MB}）"
  info "最近备份：$(latest_backup || echo '(无)')"
  hr
}

# ================================================================ selftest（本地无害演练）
cmd_selftest() {
  need_cmd "$NODE_BIN"; need_cmd tar; need_cmd awk
  local t
  t="$(mktemp -d "${TMPDIR:-/tmp}/exam-worker-rollback-drill.XXXXXX")"
  trap "rm -rf '$t'" EXIT
  local st_fail=0
  st_pass() { printf '  [PASS] %s\n' "$1"; }
  st_bad()  { printf '  [FAIL] %s\n' "$1"; st_fail=$((st_fail + 1)); }
  hr
  info "selftest · 临时根：${t}（mock pm2/mysql/mysqldump/curl；不触碰真实 PM2/DB/生产）"
  hr
  mkdir -p "$t/bin" "$t/state" "$t/backups" "$t/old/server/src" "$t/new/server/src/infrastructure/worker" "$t/new/server/node_modules/@prisma/client"
  printf 'mock old worker' > "$t/old/server/src/worker.js"
  printf "console.log('mock new worker');\n" > "$t/new/server/src/worker.js"
  printf "const F = process.env.WORKER_ENABLE_PROJECT_SCAN;\nscanProjectSubmissions();\n" > "$t/new/server/src/infrastructure/worker/grading-worker.js"
  printf 'mock' > "$t/new/server/node_modules/@prisma/client/index.js"
  printf 'PORT=50001\nDATABASE_URL=mysql://u:OLD_FAKE_SECRET@127.0.0.1:3306/exam_system\n' > "$t/old/server/.env"
  printf 'PORT=3002\nINTERNAL_SECRET=NEW_FAKE_SECRET\nDATABASE_URL=mysql://u:NEW_FAKE_SECRET@127.0.0.1:3306/exam_system\n' > "$t/new/server/.env"
  printf '[client]\nuser=root\npassword=DB_FAKE_SECRET\n' > "$t/mysql.cnf"

  cat > "$t/bin/pm2" <<'MOCK_PM2'
#!/usr/bin/env bash
set -u
STATE="${MOCK_PM2_STATE:?}"; cmd="${1:-}"; shift || true
case "$cmd" in
  jlist)
    first=1; printf '['
    for f in "$STATE"/*.env; do
      [ -e "$f" ] || continue
      n="$(basename "$f" .env)"
      st="$(awk -F= '$1=="status"{print $2}' "$f")"
      pid="$(awk -F= '$1=="pid"{print $2}' "$f")"
      [ "$first" = 1 ] || printf ','
      first=0
      printf '{"name":"%s","pid":%s,"pm2_env":{"status":"%s"}}' "$n" "${pid:-0}" "$st"
    done
    printf ']\n' ;;
  describe) [ -f "$STATE/${1:-x}.env" ] || exit 1; echo "describing ${1:-}" ;;
  pid) f="$STATE/${1:-x}.env"; [ -f "$f" ] || exit 1; [ "$(awk -F= '$1=="status"{print $2}' "$f")" = online ] || exit 1; awk -F= '$1=="pid"{print $2}' "$f" ;;
  start)
    name=""; cwd=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --name) name="${2:-}"; shift 2 ;;
        --cwd) cwd="${2:-}"; shift 2 ;;
        --only) name="${2:-}"; shift 2 ;;
        --update-env) shift ;;
        *) shift ;;
      esac
    done
    [ -n "$name" ] || { echo 'mock pm2: no name' >&2; exit 2; }
    printf 'status=online\npid=4242\ncwd=%s\n' "${cwd:-}" > "$STATE/$name.env"
    echo "mock started $name" ;;
  stop) f="$STATE/${1:-x}.env"; [ -f "$f" ] || exit 0; awk -F= '$1=="status"{print "status=stopped";next}{print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"; echo "mock stopped ${1:-}" ;;
  delete) rm -f "$STATE/${1:-x}.env"; echo "mock deleted ${1:-}" ;;
  save|resurrect) echo "mock $cmd" ;;
  list) echo 'mock pm2 list' ;;
  logs) printf '{"level":30,"msg":"评分 Worker 已启动"}\n' ;;
  *) echo "mock pm2: unsupported $cmd" >&2; exit 2 ;;
esac
MOCK_PM2
  chmod +x "$t/bin/pm2"

  cat > "$t/bin/mysql" <<'MOCK_MYSQL'
#!/usr/bin/env bash
sql=""
while [ $# -gt 0 ]; do case "$1" in -e) sql="${2:-}"; shift 2 ;; *) shift ;; esac; done
case "$sql" in
  *"SELECT 1"*) echo 1 ;;
  *"status='draft'"*) echo "${MOCK_DRAFTS:-0}" ;;
  *"status='submitted'"*) echo "${MOCK_SUBMITTED:-0}" ;;
  *project_submissions*) echo "" ;;
  *grading_jobs*) echo "" ;;
  *) echo 0 ;;
esac
MOCK_MYSQL
  chmod +x "$t/bin/mysql"

  cat > "$t/bin/mysqldump" <<'MOCK_DUMP'
#!/usr/bin/env bash
echo '-- mock mysqldump'
head -c 4000 /dev/urandom | base64
MOCK_DUMP
  chmod +x "$t/bin/mysqldump"

  cat > "$t/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
url=""
for a in "$@"; do case "$a" in http://*|https://*) url="$a" ;; esac; done
case "$url" in
  */api/health) printf '200' ;;
  */api/internal/graded) printf '403' ;;
  *) printf '000' ;;
esac
MOCK_CURL
  chmod +x "$t/bin/curl"

  local self
  self="$0"
  case "$self" in /*) ;; *) self="$PWD/$self" ;; esac
  local node_dir
  node_dir="$(cd "$(dirname "$(command -v "$NODE_BIN")")" && pwd)"
  mock_run() {
    env -i PATH="$t/bin:$node_dir:/usr/bin:/bin:/usr/sbin:/sbin" HOME="$t" MOCK_PM2_STATE="$t/state" MOCK_SUBMITTED=0 MOCK_DRAFTS=0 OLD_ROOT="$t/old/server" NEW_ROOT="$t/new/server" BACKUP_ROOT="$t/backups" DB_DEFAULTS_EXTRA_FILE="$t/mysql.cnf" EXPECTED_PORT=3002 HEALTH_URL="http://127.0.0.1:3002/api/health" CALLBACK_URL="http://127.0.0.1:3002/api/internal/graded" PM2_DUMP_FILE="$t/pm2-dump.pm2" WAIT_SECONDS=5 DRAIN_SECONDS=1 bash "$self" "$@" --allow-nonroot
  }
  printf 'status=online\npid=1111\n' > "$t/state/exam-worker.env"
  printf 'status=online\npid=2222\n' > "$t/state/exam-server-new.env"
  printf 'status=online\npid=3333\n' > "$t/state/dsh-grader-worker.env"
  local out="$t/out"

  if mock_run backup --apply --confirm --backup-dir "$t/backups/b1" > "$out.backup" 2>&1; then st_pass 'backup --apply 成功'; else st_bad 'backup --apply 失败'; tail -n 20 "$out.backup"; fi
  [ -f "$t/backups/b1/MANIFEST.sha256" ] && st_pass 'MANIFEST.sha256 存在' || st_bad 'MANIFEST.sha256 缺失'
  [ -s "$t/backups/b1/old-worker-src.tgz" ] && st_pass 'old-worker-src.tgz 非空' || st_bad 'old-worker-src.tgz 空/缺失'
  [ -s "$t/backups/b1/exam_system.sql.gz" ] && st_pass 'exam_system.sql.gz 非空' || st_bad 'DB dump 空/缺失'
  if grep -q 'FAKE_SECRET' "$out.backup"; then st_bad 'backup 输出泄漏 secret'; else st_pass 'backup 输出无 secret'; fi
  local perms
  perms="$(ls -ld "$t/backups/b1" | awk '{print $1}' | cut -c1-10)"
  case "$perms" in drwx------) st_pass "备份目录权限 $perms" ;; *) st_bad "备份目录权限 ${perms}（期望 700）" ;; esac

  if mock_run preflight --backup-dir "$t/backups/b1" > "$out.pre" 2>&1; then st_pass 'preflight PASS'; else st_bad 'preflight FAIL'; grep -E '\[FAIL\]' "$out.pre" | head -5; fi
  if grep -q 'FAKE_SECRET' "$out.pre"; then st_bad 'preflight 输出泄漏 secret'; else st_pass 'preflight 输出无 secret'; fi

  if mock_run switch --backup-dir "$t/backups/b1" > "$out.switchdry" 2>&1; then st_pass 'switch dry-run 退出 0'; else st_bad 'switch dry-run 非 0'; fi
  [ "$(awk -F= '$1=="status"{print $2}' "$t/state/exam-worker.env")" = online ] && st_pass 'dry-run 后旧 worker 仍 online' || st_bad 'dry-run 改了旧 worker 状态'
  [ -f "$t/state/exam-worker-next.env" ] && st_bad 'dry-run 启动了新 worker' || st_pass 'dry-run 未启动新 worker'

  if mock_run switch --apply --confirm --backup-dir "$t/backups/b1" > "$out.switch" 2>&1; then st_pass 'switch --apply 成功'; else st_bad 'switch --apply 失败'; tail -n 30 "$out.switch"; fi
  [ "$(awk -F= '$1=="status"{print $2}' "$t/state/exam-worker.env")" = stopped ] && st_pass 'switch 后旧 worker stopped（串行）' || st_bad 'switch 后旧 worker 未 stopped'
  [ "$(awk -F= '$1=="status"{print $2}' "$t/state/exam-worker-next.env")" = online ] && st_pass 'switch 后新 worker online' || st_bad 'switch 后新 worker 未 online'
  [ "$(awk -F= '$1=="status"{print $2}' "$t/state/dsh-grader-worker.env")" = online ] && st_pass 'dsh-grader-worker 未被触碰' || st_bad 'dsh-grader-worker 被误动'

  if mock_run rollback --apply --confirm --backup-dir "$t/backups/b1" > "$out.rollback" 2>&1; then st_pass 'rollback --apply 成功'; else st_bad 'rollback --apply 失败'; tail -n 30 "$out.rollback"; fi
  [ "$(awk -F= '$1=="status"{print $2}' "$t/state/exam-worker.env")" = online ] && st_pass 'rollback 后旧 worker online' || st_bad 'rollback 后旧 worker 未 online'
  [ -f "$t/state/exam-worker-next.env" ] && st_bad 'rollback 后新 worker 仍在' || st_pass 'rollback 后新 worker 已移除'

  hr
  if [ "$st_fail" -gt 0 ]; then info "selftest：FAIL（$st_fail 项）"; return 1; fi
  info 'selftest：PASS（全部通过；未触碰真实 PM2/DB/生产）'
  hr
  return 0
}

# ================================================================ main
SELF="$0"
case "${1:-}" in
  -h|--help|help) usage; exit 0 ;;
esac
sub="${1:-}"
[ -n "$sub" ] || { usage; exit 2; }
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --dry-run) APPLY=0; shift ;;
    --confirm) CONFIRM=1; shift ;;
    --allow-nonroot) ALLOW_NONROOT=1; shift ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    --backup-dir=*) BACKUP_DIR="${1#*=}"; shift ;;
    --skip-preflight) SKIP_PREFLIGHT=1; shift ;;
    --no-auto-rollback) AUTO_ROLLBACK=0; shift ;;
    --allow-missing-scan-flag) ALLOW_MISSING_SCAN_FLAG=1; shift ;;
    --restore-old-env) RESTORE_OLD_ENV=1; shift ;;
    --restore-old-dir) RESTORE_OLD_DIR=1; shift ;;
    --restore-pm2-dump) RESTORE_PM2_DUMP=1; shift ;;
    --restore-db) RESTORE_DB=1; shift ;;
    --confirm-db-restore) CONFIRM_DB_RESTORE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1（子命令 ${sub}）" ;;
  esac
done
case "$sub" in
  backup)    cmd_backup ;;
  preflight) cmd_preflight ;;
  switch)    cmd_switch ;;
  rollback)  cmd_rollback ;;
  status)    cmd_status ;;
  selftest)  cmd_selftest ;;
  *) die "未知子命令：${sub}（backup|preflight|switch|rollback|status|selftest）" ;;
esac
