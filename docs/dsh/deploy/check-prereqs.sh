#!/usr/bin/env bash
# 云上部署 · 前置自检（★只读：不写库、不启动装置、不改任何状态）
# 用法：bash docs/dsh/deploy/check-prereqs.sh [--source-dir 实验] [--db-url <url>]
# ★R3-WORKER-ARGS：不推荐 --db-url（argv 同机可见）；未传时依次读 $DATABASE_URL → server/.env（推荐 export DATABASE_URL）
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC_DIR="实验"
DB_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --source-dir) SRC_DIR="$2"; shift 2 ;;
    --db-url) DB_URL="$2"; shift 2 ;;
    -h|--help) sed -n '2,4p' "$0"; exit 0 ;;
    *) echo "未知参数：$1"; exit 2 ;;
  esac
done
FAIL=0; WARN=0
ok(){   printf '  [PASS] %s\n' "$1"; }
bad(){  printf '  [FAIL] %s\n' "$1"; FAIL=$((FAIL+1)); }
warn(){ printf '  [WARN] %s\n' "$1"; WARN=$((WARN+1)); }

echo "仓库根：$REPO"
echo
echo '① Node.js'
if command -v node >/dev/null 2>&1; then
  V="$(node -v)"; M="${V#v}"; M="${M%%.*}"
  if [ "$M" -ge 20 ]; then ok "node $V"; else bad "node $V 过低（需 >= 20）"; fi
else bad 'node 未安装'; fi

echo '② 仓库布局与依赖'
for f in scripts/dsh-grader/run.sh scripts/dsh-grader/lib.sh scripts/dsh-grader/lib_assignment.sh server/prisma/schema.prisma; do
  [ -f "$REPO/$f" ] && ok "存在 $f" || bad "缺少 $f"
done
[ -d "$REPO/scripts/dsh-checker" ] && ok '存在 scripts/dsh-checker/' || bad '缺少 scripts/dsh-checker/'
[ -d "$REPO/server/node_modules/@prisma/client" ] && ok 'server 依赖已安装（@prisma/client）' || bad 'server/node_modules 缺失 ⇒ 先在 server/ 执行 npm ci'

echo '③ DSH CLI（装置要调它）'
BIN="${DSH_GRADER_BIN:-/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh}"
if [ -x "$BIN" ]; then ok "可执行：$BIN"; else bad "不可执行：$BIN ⇒ 在 service/worker.env 设 DSH_GRADER_BIN=<Linux 上的 dsh 路径>"; fi

echo '④ 物料来源（★已知缺口，见 README §7）'
D="$REPO/$SRC_DIR"
if [ -d "$D" ]; then N=$(find "$D" -maxdepth 1 -name '*.zip' | wc -l | tr -d ' '); ok "$SRC_DIR 存在，zip=$N"; warn '云上真实使用前必须把「该作业的学生提交」导出到该目录（尚未实现，见 README §7）'; else bad "$SRC_DIR 不存在（用 --source-dir 指定）"; fi

echo '⑤ 数据库连通性'
# ★R3-WORKER-ARGS：--db-url 仅为兼容旧用法；推荐 `export DATABASE_URL=…`（不进 argv）
if [ -z "$DB_URL" ] && [ -n "${DATABASE_URL:-}" ]; then DB_URL="$DATABASE_URL"; fi
if [ -z "$DB_URL" ] && [ -f "$REPO/server/.env" ]; then DB_URL="$(grep -m1 '^DATABASE_URL=' "$REPO/server/.env" | cut -d= -f2-)"; fi
if [ -z "$DB_URL" ]; then warn '未提供 DATABASE_URL/--db-url 且 server/.env 无 DATABASE_URL ⇒ 跳过'; else
  DBN="$(node -e 'try{console.log(new URL(process.argv[1]).pathname)}catch(e){console.log("?")}' "$DB_URL")"
  ( cd "$REPO/server" && DATABASE_URL="$DB_URL" node -e 'const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$queryRaw`SELECT 1`.then(()=>{console.log("DB_OK");return p.$disconnect()}).catch(e=>{console.log("DB_FAIL "+e.message.split("\n")[0]);process.exit(1)})' ) >/tmp/prereq-db.log 2>&1
  if grep -q DB_OK /tmp/prereq-db.log; then ok "可连通，库=${DBN}"; [ "$DBN" = "/exam_system" ] && warn '指向生产库：worker 需 --allow-db exam_system --allow-prod 双开关（本自检不会写库）' || true; else bad "连接失败：$(tail -1 /tmp/prereq-db.log)"; fi
fi

echo '⑦ 时钟一致性（★回收器按 UTC 判据：跨机漂移会让僵尸回收失效）'
if [ -z "$DB_URL" ]; then warn '无 DB 连接信息 ⇒ 跳过时钟对拍'; else
  ( cd "$REPO/server" && DATABASE_URL="$DB_URL" node -e 'const{PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.$queryRawUnsafe("SELECT UNIX_TIMESTAMP() AS ts").then(r=>{const db=Number(r[0].ts);const host=Math.floor(Date.now()/1000);console.log("CLOCK_DRIFT="+Math.floor(Math.abs(db-host)));return p.$disconnect()}).catch(e=>{console.log("CLOCK_FAIL "+e.message.split("\n")[0]);process.exit(1)})' ) >/tmp/prereq-clock.log 2>&1
  if grep -q CLOCK_DRIFT /tmp/prereq-clock.log; then
    D=$(grep CLOCK_DRIFT /tmp/prereq-clock.log | cut -d= -f2)
    if [ "${D:-9999}" -le 60 ]; then ok "DB(UTC) 与宿主机时钟差 ${D}s（<=60s）"; else bad "时钟差 ${D}s（>60s）⇒ 回收器判据会失真；先校准 NTP"; fi
    warn '部署前另请对拍：mysql -e "SELECT UTC_TIMESTAMP(3)" 与 date -u（跨机场景）'
  else bad "时钟对拍失败：$(tail -1 /tmp/prereq-clock.log)"; fi
fi
echo '⑥ 磁盘（run-root 每次 24MB 级；成功现场可清、失败现场留证）'
FREE_MB=$(df -Pm /tmp | awk 'NR==2{print $4}')
if [ "${FREE_MB:-0}" -ge 5120 ]; then ok "/tmp 可用 ${FREE_MB}MB"; else warn "/tmp 可用仅 ${FREE_MB}MB（建议 >= 5GB 并配清理策略）"; fi
[ -w /tmp ] && ok '/tmp 可写' || bad '/tmp 不可写'

echo
echo "结果：FAIL=$FAIL  WARN=$WARN"
[ "$FAIL" -eq 0 ] && { echo '前置自检通过（WARN 项见上）'; exit 0; } || { echo '存在 FAIL 项，先修再装'; exit 1; }