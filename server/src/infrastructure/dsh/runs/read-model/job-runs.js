/**
 * infrastructure/dsh/runs/read-model/job-runs.js —— grading_job_runs 的**只读取数**（B3 纯搬运：从 read-model.js 原样搬出）。
 *
 * ★只读：仅 SELECT（$queryRawUnsafe）；failed 列缺失（差量建表）时回退无该列 SELECT，并如实标注。
 */
import defaultPrisma from '../../../../utils/prisma.js';
import defaultLogger from '../../../../utils/logger.js';

/**
 * ★R2-B37 兼容层：`grading_job_runs.failed` 在**差量建表的库**里可能不存在（prisma diff 漏建列）。
 * 先带 failed 查；报 Unknown column 'failed' 时**回退到无该列**的 SELECT（并如实标注），绝不因缺列让整页退化。
 * @returns {{rows:Array, failed_column:boolean}}
 */
export async function selectJobRuns({ whereSql = '', params = [], orderBy = 'created_at', dir = 'DESC', limit = 500, single = false, prisma: prismaClient = defaultPrisma, log = defaultLogger } = {}) {
  const base = ' FROM grading_job_runs' + whereSql + ' ORDER BY ' + orderBy + ' ' + dir + (single ? ' LIMIT 1' : ' LIMIT ' + Number(limit));
  const withFailed = 'SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, failed, created_at, updated_at';
  const withoutFailed = 'SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, created_at, updated_at';
  try {
    const rows = await prismaClient.$queryRawUnsafe(withFailed + base, ...params);
    return { rows: rows || [], failed_column: true };
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (!/Unknown column 'failed'/i.test(msg)) throw err;
    log.warn({}, 'R2-B37：grading_job_runs.failed 列缺失（差量建表）⇒ 回退无该列 SELECT，failed 取 teardown 证据');
    const rows = await prismaClient.$queryRawUnsafe(withoutFailed + base, ...params);
    return { rows: rows || [], failed_column: false };
  }
}

export const SORTABLE = { created_at: 'created_at', finished_at: 'finished_at', job_id: 'job_id' };
