#!/usr/bin/env node
/**
 * p5-db-query.mjs —— P5 平台复算：只读查询平台 DB（绝不写库）。
 * 用法: node docs/pipeline/scripts/p5-db-query.mjs "<SQL>"
 * 连接串来自 server/.env 的 DATABASE_URL（不打印）。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(repoRoot, 'server', 'package.json'));
const mysql = require('mysql2/promise');

const envText = fs.readFileSync(path.join(repoRoot, 'server', '.env'), 'utf8');
const line = envText.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
if (!line) { console.error('DATABASE_URL not found'); process.exit(2); }
const raw = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
const u = new URL(raw);

const sql = process.argv[2];
if (!sql) { console.error('usage: p5-db-query.mjs "<SQL>"'); process.exit(2); }
if (/\b(insert|update|delete|drop|alter|create|truncate|replace)\b/i.test(sql)) {
  console.error('READ-ONLY GUARD: 拒绝非 SELECT 语句');
  process.exit(3);
}

const conn = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 3306),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
});
const [rows] = await conn.query(sql);
console.log(JSON.stringify(rows, null, 1));
await conn.end();
