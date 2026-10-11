#!/usr/bin/env bash
# scripts/dsh-verify/facts-a.sh —— 独立复算 A 的凭据来源/并发数事实（只读 SELECT + LIMIT 1）
# 只打印长度与等价性布尔；绝不打印明文 key。临时 my.cnf chmod 600，用完即删。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/vlib.sh"
OUT="${V_EV}/facts"; mkdir -p "$OUT"
python3 - "$DSH_REPO_ROOT" "$OUT/db-facts.txt" <<'PY'
import hashlib, os, re, subprocess, sys, urllib.parse

repo, outp = sys.argv[1], sys.argv[2]
envp = os.path.join(repo, 'server', '.env')
url = ''
if os.path.isfile(envp):
    for line in open(envp, encoding='utf-8', errors='replace'):
        if line.startswith('DATABASE_URL='):
            url = line.split('=', 1)[1].strip().strip('"').strip("'")
u = urllib.parse.urlparse(url)
cnf = os.path.join('/tmp', 'dsh-verify-facts.cnf')
with open(cnf, 'w', encoding='utf-8') as f:
    f.write('[client]\nuser=%s\npassword=%s\nhost=%s\nport=%s\nconnect-timeout=8\n' % (
        u.username or '', u.password or '', u.hostname or '127.0.0.1', u.port or 3306))
os.chmod(cnf, 0o600)

def q(sql):
    try:
        r = subprocess.run(['mysql', '--defaults-extra-file=' + cnf, (u.path or '/').lstrip('/'),
                            '-N', '-s', '-e', sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=20)
        if r.returncode != 0:
            return 'QUERY_ERROR:' + r.stderr.decode('utf-8', 'replace').strip()[:120]
        return r.stdout.decode('utf-8', 'replace').strip()
    except Exception as exc:
        return 'QUERY_EXC:' + str(exc)[:100]

def md5(s):
    return hashlib.md5(s.encode('utf-8')).hexdigest()[:12]

BT = chr(96)
db_key = q("SELECT value FROM system_configs WHERE %skey%s = 'deepseek_api_key' LIMIT 1;" % (BT, BT))
conc = q("SELECT value FROM system_configs WHERE %skey%s = 'ai_concurrency' LIMIT 1;" % (BT, BT))
rowcount = q("SELECT COUNT(*) FROM system_configs LIMIT 1;")
keylist = q("SELECT %skey%s FROM system_configs ORDER BY %skey%s LIMIT 8;" % (BT, BT, BT, BT))

env_key = ''
for line in open(envp, encoding='utf-8', errors='replace') if os.path.isfile(envp) else []:
    if line.startswith('DEEPSEEK_API_KEY='):
        env_key = line.split('=', 1)[1].strip().strip('"').strip("'")
dsh_key = ''
p = os.path.expanduser('~/.dsh/.credentials.yaml')
if os.path.isfile(p):
    for line in open(p, encoding='utf-8', errors='replace'):
        if line.strip().startswith('DEEPSEEK_API_KEY:'):
            dsh_key = line.split(':', 1)[1].strip().strip('"').strip("'")

lines = [
    'db.rowcount=%s keys=%s' % (rowcount, keylist.replace(chr(10), ',')),
    'db.system_configs.ai_concurrency=%s (type=int:%s)' % (conc or '<empty>', conc.isdigit()),
    'db.system_configs.deepseek_api_key present=%s len=%d md5_12=%s' % (bool(db_key), len(db_key), md5(db_key) if db_key else '-'),
    'server/.env DEEPSEEK_API_KEY present=%s len=%d md5_12=%s' % (bool(env_key), len(env_key), md5(env_key) if env_key else '-'),
    '~/.dsh/.credentials.yaml DEEPSEEK_API_KEY present=%s len=%d md5_12=%s' % (bool(dsh_key), len(dsh_key), md5(dsh_key) if dsh_key else '-'),
    'same_db_vs_env=%s same_db_vs_dsh=%s same_env_vs_dsh=%s' % (
        bool(db_key) and db_key == env_key, bool(db_key) and db_key == dsh_key, bool(env_key) and env_key == dsh_key),
    'sk_shape_db=%s' % bool(re.match(r'^sk-', db_key or '')),
]
open(outp, 'w', encoding='utf-8').write(chr(10).join(lines) + chr(10))
os.remove(cnf)
print(chr(10).join(lines))
PY
echo "FACTS_DB_DONE"; cat "$OUT/db-facts.txt"
