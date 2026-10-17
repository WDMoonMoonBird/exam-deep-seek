/**
 * C8（t23）R1 回归：DB 级「每 assignment 至多一个活动 job」+ preflight 纯函数 + 迁移/回滚证据。
 *
 * 覆盖契约 ①~⑤：
 *   ① 测试库已应用迁移时：同 assignment 第二个活动 job（不同 checker）⇒ Prisma create P2002；置 done 后可再建；
 *   ② 两个终态行可共存（active_assignment_key 为 NULL ⇒ 唯一索引允许多 NULL）；
 *   ③ check-r1-active-jobs.mjs 纯函数 findDuplicateActiveAssignments：重复/干净/BigInt/camelCase/排序；
 *   ④ 迁移 guard 在重复数据上 fail-closed：临时表 PK 复现 1062（不动测试库既有迁移），并静态核对 migration.sql /
 *      rollback.sql 的顺序与内容（先 guard → ADD COLUMN → CREATE UNIQUE INDEX；回滚先 DROP INDEX 再 DROP COLUMN，保留旧 active_key）；
 *   ⑤ 只写测试库：显式断言 DATABASE_URL 库名 = exam_system_test（fail-closed），不触碰生产库。
 *
 * 数据库：仅 exam_system_test；夹具自清理。运行必须带 --forceExit（仓库级 app.js 常驻句柄，见 REGRESSION.md）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../src/utils/prisma.js';
import {
  ACTIVE_STATUSES,
  R1_COLUMN_NAME,
  R1_INDEX_NAME,
  R1_MIGRATION_NAME,
  findDuplicateActiveAssignments,
} from '../../scripts/check-r1-active-jobs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '../..');
const MIGRATION_DIR = path.join(SERVER, 'prisma', 'migrations', R1_MIGRATION_NAME);
const MIGRATION_SQL = path.join(MIGRATION_DIR, 'migration.sql');
const ROLLBACK_SQL = path.join(MIGRATION_DIR, 'rollback.sql');

const TAG = 'c8-r1-' + Date.now();
const CHK_A = TAG + '-a';
const CHK_B = TAG + '-b';
const cleanup = { assignmentIds: [] };
let teacherId = null;

async function mkAssignment(suffix) {
  const a = await prisma.assignment.create({
    data: { teacherId, title: TAG + '-' + suffix, startTime: new Date(Date.now() - 86400e3), endTime: new Date(Date.now() + 86400e3) },
  });
  cleanup.assignmentIds.push(a.id);
  return a.id;
}

beforeAll(async () => {
  const td = global.__testData || {}; // test/setup.js seed（不 import helpers，避免拉起 app/server）
  teacherId = td.teacherId;
  if (!teacherId) {
    const t = await prisma.user.findFirst({ where: { role: 'teacher' }, select: { id: true }, orderBy: { id: 'asc' } });
    teacherId = t && t.id;
  }
  if (!teacherId) throw new Error('seed_missing: teacher');
  // 幂等清理本套件命名空间（异常中断重跑）
  const old = await prisma.assignment.findMany({ where: { title: { startsWith: TAG } }, select: { id: true } });
  for (const a of old) await prisma.gradingJob.deleteMany({ where: { assignmentId: a.id } });
  if (old.length) await prisma.assignment.deleteMany({ where: { id: { in: old.map((a) => a.id) } } });
}, 60000);

afterAll(async () => {
  for (const aid of cleanup.assignmentIds) {
    await prisma.gradingJob.deleteMany({ where: { assignmentId: aid } });
    await prisma.assignment.deleteMany({ where: { id: aid } });
  }
  await prisma.$disconnect().catch(() => {});
}, 60000);

describe('C8-1 DB 唯一：每 assignment 至多一个活动 job（P2002）', () => {
  it('C8-1-1 同 assignment 第二个活动 job（不同 checker）被 DB 拒绝；第一个置 done 后可再建', async () => {
    const assignmentId = await mkAssignment('active');
    const first = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK_A, status: 'pending' } });
    expect(first.id).toBeGreaterThan(0);

    // ① Prisma create（不同 checker 也不行：新约束按 assignment 唯一）
    let err = null;
    try {
      await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK_B, status: 'pending' } });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe('P2002');
    const errText = String(err.message || '') + ' ' + JSON.stringify(err.meta || {});
    expect(errText).toContain(R1_INDEX_NAME);
    const activeCount = await prisma.gradingJob.count({ where: { assignmentId, status: { in: ACTIVE_STATUSES } } });
    expect(activeCount).toBe(1);

    // ② 原始 SQL INSERT 同样被 DB 拒绝（证明是 DB 约束而非 ORM 层拦截）
    let rawErr = null;
    try {
      await prisma.$executeRawUnsafe(
        'INSERT INTO grading_jobs (assignment_id, checker_id, status, created_at, updated_at) VALUES (?,?,?,NOW(3),NOW(3))',
        assignmentId, CHK_B, 'running',
      );
    } catch (e) { rawErr = e; }
    expect(rawErr).toBeTruthy();
    expect(String(rawErr.message || '') + ' ' + JSON.stringify(rawErr.meta || {})).toMatch(/1062|Duplicate entry|uniq_grading_jobs_active_assignment/);

    // ③ 首个置 done（终态 ⇒ 生成列 NULL）后可再建
    await prisma.gradingJob.update({ where: { id: first.id }, data: { status: 'done' } });
    const second = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK_B, status: 'pending' } });
    expect(second.id).toBeGreaterThan(0);
    const after = await prisma.gradingJob.count({ where: { assignmentId, status: { in: ACTIVE_STATUSES } } });
    expect(after).toBe(1);
    const doneCount = await prisma.gradingJob.count({ where: { assignmentId, status: 'done' } });
    expect(doneCount).toBe(1);
  }, 60000);

  it('C8-1-2 两个终态行可共存（done/failed/needs_rerun；active_assignment_key=NULL 允许多行）', async () => {
    const assignmentId = await mkAssignment('terminal');
    const a = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK_A, status: 'done' } });
    const b = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK_B, status: 'failed' } });
    const c = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK_A, status: 'needs_rerun' } });
    expect([a.id, b.id, c.id].every((id) => id > 0)).toBe(true);
    const terminal = await prisma.gradingJob.count({ where: { assignmentId, status: { notIn: ACTIVE_STATUSES } } });
    expect(terminal).toBe(3);
    const keys = await prisma.$queryRawUnsafe('SELECT id, active_assignment_key FROM grading_jobs WHERE assignment_id = ?', assignmentId);
    expect(keys).toHaveLength(3);
    expect(keys.every((r) => r.active_assignment_key === null)).toBe(true);
    // 终态后仍可再建活动 job（NULL 不占坑）
    const active = await prisma.gradingJob.create({ data: { assignmentId, checkerId: CHK_B, status: 'pending' } });
    expect(active.id).toBeGreaterThan(0);
  }, 60000);
});

describe('C8-2 preflight 纯函数 findDuplicateActiveAssignments', () => {
  it('C8-2-1 重复样本：按 assignment 分组、组内 id 升序、按 count 降序 + assignment_id 升序', () => {
    const rows = [
      { id: 10, assignment_id: 1, checker_id: 'a', status: 'pending' },
      { id: 9, assignment_id: 1, checker_id: 'b', status: 'running' },
      { id: 20, assignment_id: 2, checker_id: 'c', status: 'pending' },
      { id: 21, assignment_id: 2, checker_id: 'd', status: 'pending' },
      { id: 22, assignment_id: 2, checker_id: 'e', status: 'running' },
      { id: 30, assignment_id: 3, checker_id: 'f', status: 'pending' },
    ];
    const groups = findDuplicateActiveAssignments(rows);
    expect(groups.map((g) => [g.assignment_id, g.count])).toEqual([[2, 3], [1, 2]]);
    expect(groups[1].ids).toEqual([9, 10]);              // 组内按 id 升序
    expect(groups[1].checkers).toEqual(['b', 'a']);
    expect(groups[0].ids).toEqual([20, 21, 22]);
  });

  it('C8-2-2 干净样本 / 空值 / 非法行 ⇒ 空数组；BigInt 与 camelCase 键同样归一', () => {
    expect(findDuplicateActiveAssignments([])).toEqual([]);
    expect(findDuplicateActiveAssignments([{ id: 1, assignment_id: 7, checker_id: 'a' }])).toEqual([]);
    expect(findDuplicateActiveAssignments([null, undefined, 42, 'x', { assignment_id: 0 }])).toEqual([]);
    // BigInt（MySQL BIGINT 列）+ camelCase 键
    const groups = findDuplicateActiveAssignments([
      { id: 101n, assignmentId: 9n, checkerId: 'a', status: 'pending' },
      { id: 102n, assignmentId: 9n, checkerId: 'b', status: 'running' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].assignment_id).toBe(9);
    expect(groups[0].ids).toEqual([101, 102]);
    expect(groups[0].checkers).toEqual(['a', 'b']);
  });
});

describe('C8-3 迁移 guard/回滚：fail-closed 证据 + schema 已应用', () => {
  it('C8-3-1 迁移 guard 机制：临时表 PK=assignment_id，重复数据 ⇒ 1062（结构零改动、无残留）', async () => {
    // 用同一连接（交互事务）复现 migration.sql 的 guard 语义：PK 冲突 ⇒ 1062；不动 grading_jobs 结构与数据
    const out = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS `_c8_guard_sim`');
      await tx.$executeRawUnsafe('CREATE TEMPORARY TABLE `_c8_guard_sim` (`assignment_id` INT UNSIGNED NOT NULL, PRIMARY KEY (`assignment_id`)) ENGINE=MEMORY');
      await tx.$executeRawUnsafe('INSERT INTO `_c8_guard_sim` (`assignment_id`) VALUES (?)', 101);
      let dup = null;
      try { await tx.$executeRawUnsafe('INSERT INTO `_c8_guard_sim` (`assignment_id`) VALUES (?)', 101); } catch (e) { dup = e; }
      let clean = null;
      try { await tx.$executeRawUnsafe('INSERT INTO `_c8_guard_sim` (`assignment_id`) VALUES (?)', 102); } catch (e) { clean = e; }
      const left = await tx.$queryRawUnsafe('SELECT COUNT(*) AS n FROM `_c8_guard_sim`');
      await tx.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS `_c8_guard_sim`');
      return { dup, clean, rows: Number(left[0].n) };
    }, { timeout: 30000 });
    expect(out.dup).toBeTruthy();
    expect(String(out.dup.message || '') + ' ' + JSON.stringify(out.dup.meta || {})).toMatch(/1062|Duplicate entry/);
    expect(out.clean).toBe(null);   // 不重复的数据不会误伤
    expect(out.rows).toBe(2);       // 101 + 102（重复 101 未插入）
    // 真实迁移 guard 表不得残留（TEMPORARY 随连接消失）
    const tmp = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '_r1_active_guard'");
    expect(Number(tmp[0].n)).toBe(0);
  }, 60000);

  it('C8-3-2 迁移已应用且结构正确：生成列 STORED + 新唯一索引 + 旧 active_key 索引保留', async () => {
    const col = await prisma.$queryRawUnsafe(
      'SELECT column_name AS c, extra AS e, generation_expression AS g FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
      'grading_jobs', R1_COLUMN_NAME,
    );
    expect(col).toHaveLength(1);
    expect(String(col[0].e)).toContain('STORED GENERATED');
    expect(String(col[0].g)).toContain("pending");
    expect(String(col[0].g)).toContain("running");
    expect(String(col[0].g)).toContain('assignment_id');
    expect(String(col[0].g).toLowerCase()).toContain('else null');

    const idx = await prisma.$queryRawUnsafe(
      'SELECT index_name AS n, non_unique AS nu FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name IN (?, ?)',
      'grading_jobs', R1_INDEX_NAME, 'uniq_grading_jobs_active_key',
    );
    const byName = new Map(idx.map((x) => [x.n, Number(x.nu)]));
    expect(byName.get(R1_INDEX_NAME)).toBe(0);
    expect(byName.get('uniq_grading_jobs_active_key')).toBe(0); // 旧约束保留（两层防御）

    const mig = await prisma.$queryRawUnsafe(
      'SELECT migration_name AS n, finished_at AS f, rolled_back_at AS r FROM _prisma_migrations WHERE migration_name = ? ORDER BY started_at DESC LIMIT 1',
      R1_MIGRATION_NAME,
    );
    expect(mig).toHaveLength(1);
    expect(mig[0].n).toBe(R1_MIGRATION_NAME);
    expect(mig[0].f).toBeTruthy();
    expect(mig[0].r).toBe(null);
  }, 60000);

  it('C8-3-3 migration.sql / rollback.sql 顺序与内容：先 guard → 生成列 → 唯一索引；回滚先 DROP INDEX 再 DROP COLUMN 且保留旧 active_key', () => {
    const mig = fs.readFileSync(MIGRATION_SQL, 'utf8');
    const rb = fs.readFileSync(ROLLBACK_SQL, 'utf8');
    // guard：TEMPORARY 表 + PK(assignment_id) + INSERT SELECT 活动态
    expect(mig).toContain('CREATE TEMPORARY TABLE `_r1_active_guard`');
    expect(mig).toContain('PRIMARY KEY (`assignment_id`)');
    const guardInsertAt = mig.indexOf('INSERT INTO `_r1_active_guard`');
    const guardSelectAt = mig.indexOf("SELECT `assignment_id` FROM `grading_jobs` WHERE `status` IN ('pending', 'running')");
    expect(guardInsertAt).toBeGreaterThan(-1);
    expect(guardSelectAt).toBeGreaterThan(guardInsertAt);
    // 顺序：guard 先于结构变更；ADD COLUMN 先于 CREATE UNIQUE INDEX
    const guardAt = mig.indexOf('INSERT INTO `_r1_active_guard`');
    const addAt = mig.indexOf('ADD COLUMN `active_assignment_key`');
    const idxAt = mig.indexOf('CREATE UNIQUE INDEX `uniq_grading_jobs_active_assignment`');
    expect(guardAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(guardAt);
    expect(idxAt).toBeGreaterThan(addAt);
    expect(mig).toContain('GENERATED ALWAYS AS');
    expect(mig).toContain('STORED');
    // rollback：先删索引再删列；不得删旧 active_key/旧唯一索引
    const dropIdxAt = rb.indexOf('DROP INDEX `uniq_grading_jobs_active_assignment`');
    const dropColAt = rb.indexOf('DROP COLUMN `active_assignment_key`');
    expect(dropIdxAt).toBeGreaterThan(-1);
    expect(dropColAt).toBeGreaterThan(dropIdxAt);
    expect(rb).not.toContain('DROP COLUMN `active_key`');
    expect(rb).not.toContain('DROP INDEX `uniq_grading_jobs_active_key`');
  });
});

describe('C8-4 只写测试库（fail-closed）', () => {
  it('C8-4-1 DATABASE_URL 库名必须是 exam_system_test；生产库（exam_system）拒绝执行', () => {
    const url = String(process.env.DATABASE_URL || '');
    expect(url).toBeTruthy();
    const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    expect(dbName).toBe('exam_system_test');
    expect(dbName).not.toBe('exam_system');
  });
});
