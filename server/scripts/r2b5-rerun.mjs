#!/usr/bin/env node
/**
 * r2b5-rerun.mjs —— R2-B5：needs_rerun / failed 的重跑入口（可判定 + 幂等 + 留痕）。
 *
 * 用法（从 server/ 运行）：
 *   node scripts/r2b5-rerun.mjs --job <id> [--job <id>...] --actor <who> --reason <why>
 *   node scripts/r2b5-rerun.mjs --assignment <id> --actor <who> --reason <why>
 *   node scripts/r2b5-rerun.mjs --dry-run --assignment <id>       # 只看候选（不写）
 *
 * 语义：只把 needs_rerun / failed 置回 pending（**不动 done / pending / running**）；重复调用 0 变更（幂等）；
 *       留痕写进 last_error（rerun_by=<actor>@<iso>::<reason>）；重跑不绕过「不写分」语义。
 * 退出码：0 成功（打印 requeued 计数）；2 库名断言失败；3 无候选；4 用法错误。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { RERUNNABLE, buildRerunMarker, rerunJobs } from '../src/infrastructure/dsh/worker/dshGradingRerun.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const o = { jobIds: [], assignmentId: null, actor: 'cli', reason: 'manual', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--job') o.jobIds.push(Number(argv[++i]));
    else if (a === '--assignment') o.assignmentId = Number(argv[++i]);
    else if (a === '--actor') o.actor = String(argv[++i] || 'cli');
    else if (a === '--reason') o.reason = String(argv[++i] || 'manual');
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help') { console.log('usage: node scripts/r2b5-rerun.mjs --job <id>|--assignment <id> [--actor who] [--reason why] [--dry-run]'); process.exit(0); }
    else { console.log('RESULT=USAGE_ERROR unknown_arg=' + a); process.exit(4); }
  }
  return o;
}

function testDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.join(SERVER, '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  return m ? m[1].trim().replace('/exam_system', '/exam_system_test') : '';
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.jobIds.length && !opts.assignmentId) { console.log('RESULT=USAGE_ERROR need_job_or_assignment'); process.exit(4); }
const url = testDbUrl();
if (!url) { console.log('RESULT=NO_DB_URL'); process.exit(4); }
const dbName = new URL(url).pathname.replace(/^\//, '');
if (dbName !== 'exam_system_test') { console.log('REFUSE ' + dbName); process.exit(2); }

const prisma = new PrismaClient({ datasources: { db: { url } } });
const where = { status: { in: RERUNNABLE } };
if (opts.jobIds.length) where.id = { in: opts.jobIds };
if (opts.assignmentId) where.assignmentId = opts.assignmentId;
const candidates = await prisma.gradingJob.findMany({ where, select: { id: true, status: true, attempts: true, lastError: true } });
console.log('CANDIDATES=' + candidates.map((c) => c.id + ':' + c.status + ':attempts=' + c.attempts).join(',') );
if (!candidates.length) { console.log('RERUN_RESULT=none（无可重跑 job：只允许 ' + RERUNNABLE.join('/') + '）'); await prisma.$disconnect(); process.exit(3); }

if (opts.dryRun) {
  console.log('DRY_RUN_OK would_requeue=' + candidates.length + ' marker=' + buildRerunMarker({ actor: opts.actor, reason: opts.reason }));
  await prisma.$disconnect();
  process.exit(0);
}
const out = await rerunJobs({ prisma, jobIds: opts.jobIds.length ? opts.jobIds : null, assignmentId: opts.assignmentId, actor: opts.actor, reason: opts.reason, log: console });
console.log('RERUN_OK requeued=' + out.requeued + ' jobIds=' + out.jobIds.join(',') + ' marker=' + out.marker);
await prisma.$disconnect();
process.exit(0);
