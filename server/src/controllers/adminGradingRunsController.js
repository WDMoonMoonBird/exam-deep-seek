/**
 * 管理员「批改记录」只读控制器（R2-B24 / t91）
 *
 * ★只读：本文件不含任何写路径（无 create/update/delete/$executeRaw*）；只 SELECT + 读归档文件。
 * 数据来源：①表 grading_job_runs（worker 路径）②归档目录 <DSH_GRADER_RUNS_ROOT>/<jobId>/（worker）
 *          ③归档目录 <DSH_GRADER_RUNS_ROOT>/build-<assignmentId>-<ts>/（造尺路径，无表行 ⇒ 由目录合成行）。
 * 安全：日志/证据输出前做 sk- 脱敏；归档目录名白名单 + 前缀校验（防目录穿越）。
 */
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { DEFAULT_RUNS_ROOT, RUNS_ROOT_ENV } from '../services/dshRunArchiver.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const LOG_LINE_LIMIT = 200;

/** 归档根目录（可经 env 覆盖，与 worker 同口径） */
export function runsRootDir() {
  const env = process.env[RUNS_ROOT_ENV];
  return env && String(env).trim() ? String(env).trim() : DEFAULT_RUNS_ROOT;
}

/** ★目录名白名单 + 前缀校验（防目录穿越）：只允许单层、纯 [A-Za-z0-9._-]、且 resolve 后仍在根内 */
export function safeArchiveDir(name, { root = null } = {}) {
  const base = root || runsRootDir();
  if (typeof name !== 'string' || !name) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  if (name === '.' || name === '..') return null;
  const resolved = path.resolve(base, name);
  const rootResolved = path.resolve(base);
  if (resolved !== path.join(rootResolved, name)) return null;
  if (!resolved.startsWith(rootResolved + path.sep)) return null;
  return resolved;
}

/** ★sk- 扫描/脱敏（日志与证据输出前必须过这一层） */
export function maskSecrets(text) {
  if (text === null || text === undefined) return text;
  return String(text).replace(/sk-[A-Za-z0-9_-]{4,}/g, 'sk-****');
}

/** 读归档内的文件（白名单目录 + 固定文件名），带行数截断与脱敏 */
function readArchiveFile(dirName, fileName, { maxLines = null, root = null } = {}) {
  const dir = safeArchiveDir(dirName, { root });
  if (!dir) return { ok: false, reason: 'invalid_archive_dir' };
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) return { ok: false, reason: 'invalid_file_name' };
  const file = path.join(dir, fileName);
  if (!file.startsWith(dir + path.sep)) return { ok: false, reason: 'invalid_file_name' };
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing' };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const masked = maskSecrets(raw);
    if (maxLines === null) return { ok: true, text: masked };
    const lines = masked.split(String.fromCharCode(10));
    const tail = lines.slice(-maxLines);
    return { ok: true, text: tail.join(String.fromCharCode(10)), truncated: lines.length > maxLines, total_lines: lines.length };
  } catch (err) {
    return { ok: false, reason: 'read_failed:' + String(err && err.message).slice(0, 120) };
  }
}

function readJsonSafe(dirName, fileName) {
  const r = readArchiveFile(dirName, fileName);
  if (!r.ok) return null;
  try { return JSON.parse(r.text); } catch { return null; }
}

function parseTeardown(dirName) {
  const d = readJsonSafe(dirName, 'run-teardown.json');
  if (!d) return null;
  return { ...d, sessions_purged: d.sessions_purged === true, keep_scene: d.keep_scene === true };
}

/** 归档目录枚举：worker（<jobId>，纯数字）与造尺（build-<assignmentId>-<ts>） */
function listArchiveDirs({ root = null } = {}) {
  const base = root || runsRootDir();
  let names = [];
  try { names = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (err) {
    logger.warn({ err, base }, 'R2-B24：归档根不可读（返回空列表，不 500）');
    return [];
  }
  const out = [];
  for (const n of names.sort()) {
    if (/^\d+$/.test(n)) out.push({ type: 'worker', jobId: Number(n), archive: n });
    else if (/^build-\d+-\d{8}T\d{6}Z$/.test(n)) out.push({ type: 'build', assignmentId: Number(n.split('-')[1]), archive: n });
  }
  return out;
}

function shapeRow(row, { teardown = null, type = 'worker', archive = null, assignmentTitle = null } = {}) {
  const ev = teardown || {};
  const started = row && row.started_at ? new Date(row.started_at).getTime() : null;
  const finished = row && row.finished_at ? new Date(row.finished_at).getTime() : null;
  return {
    id: type === 'worker' ? 'job-' + row.job_id : 'archive-' + archive,
    type,
    archive: archive || (row ? String(row.job_id) : null),
    job_id: row ? row.job_id : null,
    assignment_id: row ? row.assignment_id : null,
    assignment_title: assignmentTitle,
    checker_id: row && row.checker_id ? maskSecrets(String(row.checker_id)).slice(0, 24) : null,
    status: row ? row.status || null : null,
    measured: row ? Number(row.measured) : (ev.session_files_before === undefined ? null : null),
    unmeasurable: row ? Number(row.unmeasurable) : null,
    skipped: row ? Number(row.skipped) : null,
    written: row ? Number(row.written) : null,
    failed: row ? Number(row.failed || 0) : null,
    device_exit: row ? row.device_exit : null,
    elapsed_ms: started !== null && finished !== null ? Math.max(0, finished - started) : null,
    sessions_purged: ev.sessions_purged === undefined ? null : ev.sessions_purged,
    keep_scene: ev.keep_scene === undefined ? null : ev.keep_scene,
    home_policy: ev.home_policy || null,
    source: ev.source || (type === 'build' ? 'build' : 'worker'),
    created_at: row ? row.created_at : null,
  };
}

const SORTABLE = { created_at: 'created_at', finished_at: 'finished_at', job_id: 'job_id' };

/** GET /api/admin/grading-runs —— 列表（worker 表行 ∪ 造尺归档） */
export const listGradingRuns = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
    const assignmentId = req.query.assignmentId ? Number(req.query.assignmentId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const archiveType = req.query.type ? String(req.query.type) : null;
    const purgeFlag = req.query.sessions_purged ? String(req.query.sessions_purged) : null;
    const order = SORTABLE[String(req.query.order_by || 'created_at')] || 'created_at';
    const dir = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    let rows = [];
    try {
      const where = [];
      const params = [];
      if (assignmentId && Number.isFinite(assignmentId)) { where.push('assignment_id = ?'); params.push(assignmentId); }
      if (status) { where.push('status = ?'); params.push(status); }
      const sql = 'SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, failed, created_at, updated_at FROM grading_job_runs'
        + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + order + ' ' + dir + ' LIMIT 500';
      rows = await prisma.$queryRawUnsafe(sql, ...params);
    } catch (err) {
      logger.warn({ err }, 'R2-B24：grading_job_runs 读取失败（退化为仅归档视图，不 500）');
      rows = [];
    }
    const archives = listArchiveDirs();
    const byJob = new Map(rows.map((r) => [String(r.job_id), r]));
    const items = [];
    for (const a of archives) {
      if (a.type === 'worker') {
        const row = byJob.get(String(a.jobId)) || { job_id: a.jobId };
        items.push(shapeRow(row, { teardown: parseTeardown(a.archive), type: 'worker', archive: a.archive }));
        byJob.delete(String(a.jobId));
      } else {
        items.push(shapeRow({ job_id: null, assignment_id: a.assignmentId }, { teardown: parseTeardown(a.archive), type: 'build', archive: a.archive }));
      }
    }
    for (const row of byJob.values()) items.push(shapeRow(row, { teardown: null, type: 'worker', archive: String(row.job_id) }));
    let list = items;
    if (assignmentId && Number.isFinite(assignmentId)) list = list.filter((x) => Number(x.assignment_id) === assignmentId);
    if (archiveType) list = list.filter((x) => x.type === archiveType);
    if (purgeFlag === 'no') list = list.filter((x) => x.sessions_purged === false);
    if (purgeFlag === 'yes') list = list.filter((x) => x.sessions_purged === true);
    const total = list.length;
    const start = (page - 1) * pageSize;
    res.json({ code: 0, message: 'ok', data: { items: list.slice(start, start + pageSize), total, page, pageSize, source: { table: 'grading_job_runs', archives_root: runsRootDir() } } });
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** GET /api/admin/grading-runs/:id —— 详情（含 teardown 全量、逐份摘要、日志尾部） */
export const getGradingRun = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    let type = null; let archive = null; let jobId = null;
    if (/^job-\d+$/.test(id)) { type = 'worker'; jobId = Number(id.slice(4)); archive = String(jobId); }
    else if (/^archive-build-\d+-\d{8}T\d{6}Z$/.test(id)) { type = 'build'; archive = id.slice('archive-'.length); }
    else if (/^\d+$/.test(id)) { type = 'worker'; jobId = Number(id); archive = String(jobId); }
    else return res.status(400).json({ code: 1001, message: 'id 形式非法（应为 job-<n> 或 archive-build-…）', data: null });
    if (!safeArchiveDir(archive)) return res.status(400).json({ code: 1001, message: '归档目录名非法', data: null });
    let row = null;
    if (type === 'worker') {
      try {
        const rs = await prisma.$queryRawUnsafe('SELECT job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, failed, created_at, updated_at FROM grading_job_runs WHERE job_id = ? LIMIT 1', jobId);
        row = (rs && rs[0]) || { job_id: jobId };
      } catch (err) { row = { job_id: jobId }; }
    } else {
      row = { job_id: null, assignment_id: Number(archive.split('-')[1]) };
    }
    const teardown = parseTeardown(archive);
    const summary = readJsonSafe(archive, 'evidence-summary.json');
    const stdout = readArchiveFile(archive, 'device.stdout.log', { maxLines: LOG_LINE_LIMIT });
    const stderr = readArchiveFile(archive, 'device.stderr.log', { maxLines: LOG_LINE_LIMIT });
    let title = null;
    try {
      if (row.assignment_id) {
        const a = await prisma.assignment.findUnique({ where: { id: Number(row.assignment_id) }, select: { title: true } }).catch(() => null);
        title = a ? a.title : null;
      }
    } catch { /* 标题可选 */ }
    res.json({ code: 0, message: 'ok', data: {
      run: shapeRow(row, { teardown, type, archive, assignmentTitle: title }),
      teardown_json: teardown,
      submissions: summary && Array.isArray(summary.submissions) ? summary.submissions : [],
      submission_counts: summary ? { n: summary.n, measurable: summary.measurable, unmeasurable: summary.unmeasurable } : null,
      logs: {
        stdout: { present: stdout.ok, tail: stdout.ok ? stdout.text : null, truncated: !!stdout.truncated, missing_reason: stdout.ok ? null : stdout.reason },
        stderr: { present: stderr.ok, tail: stderr.ok ? stderr.text : null, truncated: !!stderr.truncated, missing_reason: stderr.ok ? null : stderr.reason },
      },
      read_only: true,
    } });
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/** GET /api/admin/grading-runs/:id/log?kind=stdout|stderr|run —— text/plain 下载（脱敏） */
export const getGradingRunLog = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const kind = String(req.query.kind || 'stdout');
    const fileMap = { stdout: 'device.stdout.log', stderr: 'device.stderr.log', run: 'run.log' };
    const fileName = fileMap[kind];
    if (!fileName) return res.status(400).json({ code: 1001, message: 'kind 只允许 stdout|stderr|run', data: null });
    let archive = null;
    if (/^job-\d+$/.test(id) || /^\d+$/.test(id)) archive = String(id.replace(/^job-/, ''));
    else if (/^archive-/.test(id)) archive = id.slice('archive-'.length);
    if (!safeArchiveDir(archive)) return res.status(400).json({ code: 1001, message: '归档目录名非法', data: null });
    const r = readArchiveFile(archive, fileName);
    if (!r.ok) {
      res.type('text/plain; charset=utf-8');
      return res.status(200).send('# 日志缺失\nreason=' + r.reason + '\narchive=' + archive + '\nkind=' + kind + '\n#');
    }
    res.type('text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="' + archive + '.' + kind + '.log"');
    res.send(r.text);
  } catch (err) {
    logger.error({ err }, 'R2-B24：批改记录日志读取失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export default { listGradingRuns, getGradingRun, getGradingRunLog };
