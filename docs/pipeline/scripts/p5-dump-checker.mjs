#!/usr/bin/env node
/** p5-dump-checker.mjs —— 只读导出题目 353 的 checker_script / checker_meta 到指定文件（不打印连接串）。 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(repoRoot, 'server', 'package.json'));
const mysql = require('mysql2/promise');

const envText = fs.readFileSync(path.join(repoRoot, 'server', '.env'), 'utf8');
const line = envText.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
const conn = await mysql.createConnection({
  host: u.hostname, port: Number(u.port || 3306),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ''),
});
const [[q]] = await conn.query('SELECT id, title, max_score, scoring_rubric, rubric_items, checker_script, checker_meta, material FROM questions WHERE id = ?', [Number(process.argv[3] || 353)]);
const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });
const meta = typeof q.checker_meta === 'string' ? JSON.parse(q.checker_meta) : q.checker_meta;
fs.writeFileSync(path.join(outDir, 'checker_script.json'), q.checker_script || '', 'utf8');
fs.writeFileSync(path.join(outDir, 'checker_meta.json'), JSON.stringify(meta, null, 1), 'utf8');
fs.writeFileSync(path.join(outDir, 'rubric.txt'), q.scoring_rubric || '', 'utf8');
fs.writeFileSync(path.join(outDir, 'rubric_items.json'), JSON.stringify(typeof q.rubric_items === 'string' ? JSON.parse(q.rubric_items) : q.rubric_items, null, 1), 'utf8');
fs.writeFileSync(path.join(outDir, 'material.txt'), q.material || '', 'utf8');
fs.writeFileSync(path.join(outDir, 'question.json'), JSON.stringify({ id: q.id, title: q.title, max_score: q.max_score }, null, 1), 'utf8');
console.log(JSON.stringify({
  id: q.id, title: q.title, max_score: q.max_score,
  writeCount: Array.isArray(meta.log) ? meta.log.length : 0,
  status: meta.error === null ? 'ok' : String(meta.error).slice(0, 200),
  metaKeys: Object.keys(meta),
  rounds: meta.rounds, threshold: meta.threshold,
  itemsInMeta: Array.isArray(meta.items) ? meta.items.length : 0,
  subjectiveInMeta: Array.isArray(meta.subjective) ? meta.subjective.length : 0,
}, null, 1));
await conn.end();
