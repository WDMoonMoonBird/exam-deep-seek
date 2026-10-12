/**
 * W43（R2-B18）：回收器时钟口径回归 —— ①判据与写方同源（SQL 侧会话时钟）②夹具走**生产领取语句**③判据对 UTC/生产两种口径敏感
 * ④回归守卫（SQL 必须用 NOW(3)/CURRENT_TIMESTAMP(3)，不得出现客户端字面量比较）⑤timeout ≥ 阈值告警。
 * 仅测试库；探针自清理；零模型调用。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import { buildClaimSql } from '../../src/services/dshGradingJobWorker.js';
import { STALE_CLOCK_SQL, WRITER_CLOCK_SQL, buildStaleSelectSql, buildStaleUpdateSql, checkTimeoutVsStale, reclaimStaleRunning, staleSeconds } from '../../src/services/dshStaleJobReclaimer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.resolve(__dirname, '../../scripts/r2b5-worker.mjs');
const tag = 'w43-clock-' + Date.now();
let assignmentId = null;
let questionId = null;

/** 走**生产领取语句**把 pending 行置为 running（写方时钟 = CURRENT_TIMESTAMP(3)） */
async function claimLikeProduction(jobId) {
  const affected = await prisma.$executeRawUnsafe(buildClaimSql({ hasDbGate: false }), jobId);
  expect(Number(affected)).toBe(1);
  return prisma.gradingJob.findUnique({ where: { id: jobId }, select: { status: true } });
}
async function mkJob(suffix) {
  return prisma.gradingJob.create({ data: { assignmentId, checkerId: tag + '-' + suffix, status: 'pending' } });
}

describe('W43 回收器时钟口径', () => {
  beforeAll(async () => {
    const teacher = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true } });
    const q = await prisma.question.create({ data: { teacherId: teacher.id, title: tag, type: 'project', difficulty: 'medium', material: 'm', scoringRubric: 'r', maxScore: 100 } });
    questionId = q.id;
    const a = await prisma.assignment.create({ data: { teacherId: teacher.id, title: tag, startTime: new Date('2026-05-01'), endTime: new Date('2099-01-01') } });
    assignmentId = a.id;
    await prisma.assignmentQuestion.create({ data: { assignmentId, questionId, sortOrder: 1 } });
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
  }, 60000);

  afterAll(async () => {
    await prisma.gradingJob.deleteMany({ where: { assignmentId } });
    await prisma.assignmentQuestion.deleteMany({ where: { assignmentId } });
    await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
  }, 60000);

  it('W43-1 ★生产口径僵尸可回收：领取语句写入 running ⇒ 按会话时钟回填 30 分钟 ⇒ 回收命中', async () => {
    const job = await mkJob('prod');
    await claimLikeProduction(job.id);
    const claimed = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, attempts: true } });
    expect(claimed.status).toBe('running');
    // 回填：与写方同一会话时钟（SQL 侧 NOW(3)）
    await prisma.$executeRawUnsafe('UPDATE grading_jobs SET updated_at = (UTC_TIMESTAMP(3) - INTERVAL ? MINUTE) WHERE id = ?', 30, job.id);
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, maxAttempts: 3 });
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, lastError: true } });
    expect(after.status).toBe('pending');
    expect(after.lastError).toBe('stale_running_reclaimed');
    expect(r.details.some((d) => d.id === job.id)).toBe(true);
    expect(r.staleSec).toBe(900);
  }, 60000);

  it('★W43-2 判据对口径敏感（决定性，负向）：会话时钟写的「30 分钟前」在 UTC 判据下看起来在未来 ⇒ 不被回收（证明写方与判据必须同口径）', async () => {
    const job = await mkJob('clock');
    await claimLikeProduction(job.id);
    // 负向对照：用**会话时钟**回填「30 分钟前」（即旧写方 CURRENT_TIMESTAMP(3) 的口径）
    await prisma.$executeRawUnsafe('UPDATE grading_jobs SET updated_at = (NOW(3) - INTERVAL ? MINUTE) WHERE id = ?', 30, job.id);
    const rows = await prisma.$queryRawUnsafe(
      'SELECT TIMESTAMPDIFF(SECOND, updated_at, UTC_TIMESTAMP(3)) AS utc_age, TIMESTAMPDIFF(SECOND, updated_at, NOW(3)) AS session_age FROM grading_jobs WHERE id = ?', job.id,
    );
    const utcAge = Number(rows[0].utc_age);
    const sessionAge = Number(rows[0].session_age);
    console.log('W43-2 session_age=' + sessionAge + ' utc_age=' + utcAge + ' diff=' + (sessionAge - utcAge));
    expect(sessionAge).toBeGreaterThan(1700);        // 会话口径看：确实是 30 分钟前
    expect(sessionAge).toBeLessThan(1900);
    expect(utcAge).toBeLessThan(0);                  // ★UTC 口径看：它在「未来」（差一个时区偏移）⇒ 旧写方 + UTC 判据 = 永不命中
    expect(sessionAge - utcAge).toBeGreaterThanOrEqual(28795);   // 差值 ≈ +28800（UTC+8 环境）
    expect(sessionAge - utcAge).toBeLessThanOrEqual(28805);
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, maxAttempts: 3 });
    const after = await prisma.gradingJob.findUnique({ where: { id: job.id }, select: { status: true, lastError: true } });
    // ★R2-B19 后语义强化：会话时钟写的行相对 UTC 属「未来」⇒ 被识别为**时钟异常**并处置（不再静默不动）
    expect(after.status).toBe('pending');
    expect(after.lastError).toBe('stale_running_clock_ahead');
    expect(r.details.find((d) => d.id === job.id).phase).toBe('clock_ahead');
    await prisma.gradingJob.update({ where: { id: job.id }, data: { status: 'failed', lastError: 'cleanup' } });
  }, 60000);

  it('★W43-6 两个写方（Prisma @updatedAt 与生产领取语句）在修复后都是 UTC ⇒ 新行一律不会被误回收', async () => {
    const viaPrisma = await prisma.gradingJob.create({ data: { assignmentId, checkerId: tag + '-prisma', status: 'running' } });
    const viaClaim = await mkJob('claimwrite');
    await claimLikeProduction(viaClaim.id);
    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, TIMESTAMPDIFF(SECOND, updated_at, UTC_TIMESTAMP(3)) AS utc_age FROM grading_jobs WHERE id IN (?, ?)',
      viaPrisma.id, viaClaim.id,
    );
    for (const row of rows) {
      console.log('W43-6 id=' + row.id + ' utc_age=' + Number(row.utc_age));
      expect(Math.abs(Number(row.utc_age))).toBeLessThan(5);   // 两个写方都落在 UTC 口径的「现在」
    }
    const r = await reclaimStaleRunning({ prisma, staleMs: 15 * 60 * 1000, maxAttempts: 3 });
    expect(r.details.some((d) => d.id === viaPrisma.id)).toBe(false);
    expect(r.details.some((d) => d.id === viaClaim.id)).toBe(false);
    const after = await prisma.gradingJob.findUnique({ where: { id: viaPrisma.id }, select: { status: true, lastError: true } });
    expect(after.status).toBe('running');
    expect(after.lastError).toBe(null);
    await prisma.gradingJob.update({ where: { id: viaPrisma.id }, data: { status: 'failed', lastError: 'cleanup' } });
    await prisma.gradingJob.update({ where: { id: viaClaim.id }, data: { status: 'failed', lastError: 'cleanup' } });
  }, 60000);

  it('W43-3 偏移量证据：会话时钟与 UTC 的差（TIMESTAMPDIFF(NOW(3), UTC_TIMESTAMP(3))）', async () => {
    const rows = await prisma.$queryRawUnsafe('SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), NOW(3)) AS off, @@session.time_zone AS tz');
    const off = Number(rows[0].off);
    const tz = rows[0].tz;
    console.log('W43-3 offset_seconds=' + off + ' session_tz=' + tz);
    expect(Number.isFinite(off)).toBe(true);
    expect(Math.abs(off)).toBeGreaterThanOrEqual(3600); // 本环境 UTC+8 ⇒ 28800
    expect(Math.abs(off) % 900).toBe(0);
  }, 30000);

  it('★W43-4 回归守卫：判据 SQL 与写方 SQL 必须用同一类会话时钟函数（不得出现客户端字面量比较）', () => {
    const sel = buildStaleSelectSql();
    const upd = buildStaleUpdateSql();
    const claim = buildClaimSql({ hasDbGate: false });
    expect(STALE_CLOCK_SQL).toBe('UTC_TIMESTAMP(3)');
    expect(WRITER_CLOCK_SQL).toBe('UTC_TIMESTAMP(3)');
    expect(sel).toContain('UTC_TIMESTAMP(3) - INTERVAL ? SECOND');
    expect(upd).toContain('UTC_TIMESTAMP(3) - INTERVAL ? SECOND');
    expect(claim).toContain('UTC_TIMESTAMP(3)');
    expect(claim).not.toContain('CURRENT_TIMESTAMP(3)');   // 旧混合时钟形状（会话本地）一律禁止
    expect(claim).not.toContain('NOW(3)');
    // 旧缺陷的形状：把客户端字面量与列直接比较 ⇒ 一律禁止
    expect(sel).not.toContain('updated_at < ?');
    expect(upd).not.toContain('updated_at < ?');
    expect(staleSeconds(15 * 60 * 1000)).toBe(900);
    expect(staleSeconds(1501)).toBe(2);
  });

  it('W43-5 ★timeout ≥ 阈值 ⇒ 显式告警（helper + CLI 实测）', () => {
    expect(checkTimeoutVsStale({ timeoutMs: 600000, staleMs: 900000 })).toBe(null);
    const w = checkTimeoutVsStale({ timeoutMs: 900000, staleMs: 900000 });
    expect(w && w.warn).toBe(true);
    expect(w.message).toContain('timeout_ms_ge_stale_ms');
    // CLI：不可达测试库 URL ⇒ 打印告警后回收 fail-soft（skipped=reclaim_failed），不拦窗口
    const res = spawnSync(process.execPath, [
      WORKER, '--once', '--db-url', 'mysql://u:p@127.0.0.1:1/exam_system_test', '--timeout-ms', '999999999',
    ], { encoding: 'utf8', timeout: 60000, env: { ...process.env } });
    const out = (res.stdout || '') + (res.stderr || '');
    expect(out).toContain('WARN=timeout_ms_ge_stale_ms');
    expect(out).toContain('skipped=reclaim_failed');
    expect(out).toContain('STALE_RECLAIMED n=0');
  }, 90000);
});
