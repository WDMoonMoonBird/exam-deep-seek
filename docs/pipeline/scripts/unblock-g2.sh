#!/usr/bin/env bash
# G-2 解阻脚本：建立/对齐测试库 → 跑后端全量回归 → 供冻结基线
# 用法：bash docs/pipeline/scripts/unblock-g2.sh
# 安全：只读 server/.env 派生测试库 URL；全程不打印凭据；只在 exam_system_test 上写（setup.js 护栏同样强制）
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1
# 日志目录可用 LOG_DIR 覆盖（拆分专项走 docs/split，避免污染 pipeline 轮次归档）
LOG_DIR="${LOG_DIR:-docs/pipeline}"
# 日志按轮次命名（O-4：原先硬编码 test-round-00.log，第二轮会覆盖第一轮归档）
ROUND="${ROUND:-00}"
LOG="${LOG_DIR}/test-round-${ROUND}.log"
mkdir -p "$LOG_DIR"
if [ -s "$LOG" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "⛔ 归档已存在且非空：$LOG"
  echo "   轮次归档不可覆盖（规范 §三.3 分轮独立归档）。"
  echo "   换轮次：ROUND=02 bash $0   ｜ 确要覆盖：FORCE=1 ROUND=${ROUND} bash $0"
  exit 4
fi

if [ ! -f server/.env ]; then echo "❌ 缺少 server/.env"; exit 1; fi

# ── 1. 从 server/.env 派生测试库连接串（只换库名，凭据原样保留，绝不回显）
TEST_URL="$(node -e '
const fs=require("fs");
const t=fs.readFileSync("server/.env","utf8");
const m=t.match(/^DATABASE_URL=(.*)$/m);
if(!m){process.exit(1)}
const raw=m[1].trim().replace(/^"|"$/g,"");
try{const u=new URL(raw);u.pathname="/exam_system_test";process.stdout.write(u.toString());}catch(e){process.exit(2)}
')" || { echo "❌ 无法从 server/.env 解析 DATABASE_URL"; exit 1; }

# 只回显脱敏形态
echo "→ 测试库: $(node -e 'const u=new URL(process.argv[1]);console.log(u.hostname+":"+(u.port||"3306")+u.pathname)' "$TEST_URL")"

# ── 2. 连通性预检（失败即给出明确指引，而不是让 jest 抛一堆栈）
if ! node -e '
const net=require("net");const u=new URL(process.argv[1]);
const s=net.connect({host:u.hostname,port:Number(u.port||3306)});
s.setTimeout(3000);
s.on("connect",()=>{s.destroy();process.exit(0)});
s.on("timeout",()=>{s.destroy();process.exit(1)});
s.on("error",()=>process.exit(1));
' "$TEST_URL"; then
  echo "⛔ MySQL 未在监听 —— 请先启动官方 MySQL 8："
  echo "   GUI : 系统设置 → MySQL → Start MySQL Server"
  echo "   终端: sudo launchctl load -w /Library/LaunchDaemons/com.oracle.oss.mysql.mysqld.plist"
  echo "   （或：sudo /usr/local/mysql/support-files/mysql.server start）"
  exit 2
fi
echo "✓ 端口可达"

# ── 3. 对齐 schema（迁移链不完整，按 docs/test-baseline.md 用 db push；跳过 generate 以免改动 node_modules）
#     prisma db push 会在库不存在时自动创建。
( cd server && DATABASE_URL="$TEST_URL" npx --no-install prisma db push --skip-generate ) || {
  echo "❌ prisma db push 失败（检查凭据/权限）"; exit 3; }
echo "✓ schema 对齐"

# ── 4. 跑全量回归（setup.js 会自行清理+seed，且护栏强制库名必须为 exam_system_test）
echo "→ 开始回归（--runInBand，耗时较长）…"
( cd server && DATABASE_URL="$TEST_URL" npm test ) > "$LOG" 2>&1
EXIT_CODE=$?
echo "→ 退出码: $EXIT_CODE ｜ 完整日志: $LOG"

# ── 5. 提取可冻结的基线数字
echo "── 基线摘要 ──"
grep -E "^Tests:|^Test Suites:|^Snapshots:|^Time:" "$LOG" | sed 's/^/   /' || true
if ! grep -qE "^Tests:" "$LOG"; then
  echo "   ⚠️ 日志中没有 jest 摘要行 —— 说明 jest 未真正执行，检查:"
  tail -20 "$LOG" | sed 's/^/     /'
fi
echo
echo "把上面的 failed 数写入 pipeline-status.md 的 baseline_fail 即完成 G-2。"
