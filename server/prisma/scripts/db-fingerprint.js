#!/usr/bin/env node
/**
 * W8/R2-B1 辅助：**只读**数据库指纹（跑测试/迁移前后的逐位比对用）。
 * 只执行 SELECT / SHOW；不写库、不打印口令。
 * 用法：node server/prisma/scripts/db-fingerprint.js [--url <mysql url>] [--label before|after]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(__dirname, '../../.env');

const TABLES = ['users', 'questions', 'assignments', 'assignment_questions', 'submissions', 'system_configs'];
const ID_COL = { users: 'id', questions: 'id', assignments: 'id', submissions: 'id', system_configs: 'id' };

export function readEnvUrl() {
  const txt = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const m = txt.match(/^DATABASE_URL=(.*)$/m);
  return m ? m[1].trim() : '';
}

export function dbNameOf(url) {
  try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; }
}

export function parseArgs(argv) {
  const o = { url: '', label: 'fp' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') o.url = argv[++i] || '';
    else if (argv[i] === '--label') o.label = argv[++i] || 'fp';
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = opts.url || process.env.DATABASE_URL || readEnvUrl();
  if (!url) { console.log('RESULT=USAGE_ERROR reason=no_db_url'); return 4; }
  const conn = await mysql.createConnection(url);
  try {
    const lines = [];
    lines.push('FINGERPRINT label=' + opts.label + ' DB=' + dbNameOf(url));
    for (const t of TABLES) {
      const [rows] = await conn.query('SELECT COUNT(*) AS n FROM ' + t);
      const n = Number(rows[0].n);
      let extra = '';
      if (ID_COL[t]) {
        const [mx] = await conn.query('SELECT COALESCE(MAX(' + ID_COL[t] + '),0) AS m FROM ' + t);
        extra += ' max_id=' + Number(mx[0].m);
      }
      if (t === 'submissions') {
        const [ms] = await conn.query('SELECT COALESCE(MAX(submitted_at),\'1970-01-01 00:00:00\') AS m FROM submissions');
        extra += ' max_submitted=' + String(ms[0].m);
      }
      if (t === 'assignment_questions') {
        const [cols] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'assignment_questions'");
        extra += ' columns=' + Number(cols[0].c);
      }
      lines.push('TABLE ' + t + ' count=' + n + extra);
    }
    const [mig] = await conn.query('SELECT migration_name, CASE WHEN rolled_back_at IS NULL AND finished_at IS NOT NULL THEN \'ok\' ELSE \'other\' END AS st FROM _prisma_migrations ORDER BY migration_name');
    for (const m of mig) lines.push('MIGRATION ' + m.migration_name + ' ' + m.st);
    const [tbl] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE()");
    lines.push('TABLE_COUNT=' + Number(tbl[0].c));
    console.log(lines.join('\n'));
    console.log('FINGERPRINT_OK');
    return 0;
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('db-fingerprint.js')) {
  main().then((c) => process.exit(c)).catch((e) => { console.error('FP_ERROR ' + (e && e.message)); process.exit(1); });
}
