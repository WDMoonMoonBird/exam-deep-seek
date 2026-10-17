#!/usr/bin/env node
/**
 * backfill-ruler-status.mjs —— 一次性把「尺子已写分但 status 仍是 submitted」的提交推进到 ai_graded。
 *
 * 背景：R2-B35 的 DSH 消费端（dshCheckerConsumer.buildWriteback）原先只写 aiScore/aiFeedback/
 *   checkerId/canonicalSha256，不写 status ⇒ 教师端 summary 仍按 submitted 计「待评分」，
 *   实际分数已落库却看不见（实验 2 的 80 份就是此状态）。
 *
 * 本脚本只改 status，不碰分数；默认 dry-run，必须显式 --apply 才写库。
 *
 * 用法（从 server/ 运行）：
 *   node scripts/backfill-ruler-status.mjs                 # dry-run，只报数量
 *   node scripts/backfill-ruler-status.mjs --apply         # 真写（仅 status）
 *   node scripts/backfill-ruler-status.mjs --apply --db-url 'mysql://...'
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const o = { apply: false, dbUrl: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false; // 显式 dry-run（缺省即 dry-run；两者同时给时以最后一个为准）
    else if (a === '--db-url') o.dbUrl = String(argv[++i] || '');
    else if (a === '--help') {
      console.log('usage: node scripts/backfill-ruler-status.mjs [--dry-run|--apply] [--db-url <url>]');
      console.log('  --dry-run   只统计候选行数（缺省行为，不写库）');
      console.log('  --apply     真写：仅把匹配行 status 推进到 ai_graded（分数/评语/checker_id 不动）');
      process.exit(0);
    } else {
      console.log('RESULT=USAGE_ERROR unknown_arg=' + a);
      process.exit(2);
    }
  }
  return o;
}

function resolveDbUrl(explicit) {
  if (explicit) return explicit;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = fs.readFileSync(path.join(SERVER, '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.*)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

const opts = parseArgs(process.argv.slice(2));
const url = resolveDbUrl(opts.dbUrl);
if (!url) { console.log('RESULT=NO_DB_URL'); process.exit(3); }
const dbName = (() => { try { return new URL(url).pathname.replace(/^\//, ''); } catch { return '(unknown)'; } })();
console.log('BACKFILL_TARGET db=' + dbName + ' apply=' + (opts.apply ? 'yes' : 'no'));

const prisma = new PrismaClient({ datasources: { db: { url } } });
let exitCode = 0;
try {
  // 只匹配「尺子已写分但状态没推进」的行：分数/评语/checker_id 都是既有值，本脚本只动 status。
  const where = {
    status: 'submitted',
    aiScore: { not: null },
    checkerId: { not: null },
    aiFeedback: { contains: 'dsh-checker' },
  };
  const count = await prisma.submission.count({ where });
  console.log('BACKFILL_CANDIDATES n=' + count + '（仅 status: submitted + 有 ai_score/checker_id + dsh-checker 回写）');
  if (!opts.apply) {
    console.log('BACKFILL dry_run=yes would_update=' + count + '（加 --apply 才写库）');
  } else {
    const res = await prisma.submission.updateMany({ where, data: { status: 'ai_graded' } });
    console.log('BACKFILL updated=' + (res && res.count) + '（分数/评语/checker_id 均未改动）');
  }
} catch (err) {
  exitCode = 4;
  console.log('BACKFILL_FAIL reason=' + String((err && err.message) || err).slice(0, 240));
} finally {
  await prisma.$disconnect().catch(() => {});
}
process.exit(exitCode);
