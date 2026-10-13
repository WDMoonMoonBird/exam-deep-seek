/**
 * infrastructure/dsh/runs/archive-fs.js —— 归档目录的**只读**访问层（R2-B65：从 controllers/adminGradingRunsController.js 原样拆出）。
 *
 * 职责：归档根解析、目录名白名单/防穿越、sk- 脱敏、归档内文件（含行窗口）读取、teardown JSON、归档目录枚举。
 * ★只读：本文件不含任何写路径（无 fs.writeFile/mkdir/rm、无 $executeRaw*），仅 fs 读 + readdir。
 * 安全口径与拆分前逐字一致：目录名单层且纯 [A-Za-z0-9._-]，resolve 后必须在根内；脱敏先于开窗。
 */
import fs from 'node:fs';
import path from 'node:path';
import logger from '../../../utils/logger.js';
import { DEFAULT_RUNS_ROOT, RUNS_ROOT_ENV } from './dshRunArchiver.js';

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

/** 读归档内的文件（白名单目录 + 固定文件名），带行数截断/行窗口与脱敏（★先脱敏再开窗） */
export function readArchiveFile(dirName, fileName, { maxLines = null, offset = null, limit = null, root = null } = {}) {
  const dir = safeArchiveDir(dirName, { root });
  if (!dir) return { ok: false, reason: 'invalid_archive_dir' };
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) return { ok: false, reason: 'invalid_file_name' };
  const file = path.join(dir, fileName);
  if (!file.startsWith(dir + path.sep)) return { ok: false, reason: 'invalid_file_name' };
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing' };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const masked = maskSecrets(raw);   // ★R2-B38：脱敏在开窗之前完成 —— 窗口内绝不出现原文
    const NL = String.fromCharCode(10);
    if (maxLines === null && offset === null && limit === null) return { ok: true, text: masked };
    const lines = masked.split(NL);
    const total = lines.length;
    if (offset !== null || limit !== null) {
      // ★R2-B38：行窗口（offset 从 0 起、limit=行数）——不带窗口参数=全量；窗口用于分页查看大日志
      const from = Math.max(0, Number.isFinite(Number(offset)) ? Number(offset) : 0);
      const to = limit === null ? total : from + Math.max(0, Number(limit));
      return {
        ok: true,
        text: lines.slice(from, Math.max(from, to)).join(NL),
        total_lines: total,
        offset: from,
        limit: limit === null ? null : Number(limit),
        truncated: from > 0 || to < total,
        more: to < total,
      };
    }
    const tail = lines.slice(-maxLines);
    return { ok: true, text: tail.join(NL), truncated: total > maxLines, total_lines: total };
  } catch (err) {
    return { ok: false, reason: 'read_failed:' + String(err && err.message).slice(0, 120) };
  }
}

export function readJsonSafe(dirName, fileName) {
  const r = readArchiveFile(dirName, fileName);
  if (!r.ok) return null;
  try { return JSON.parse(r.text); } catch { return null; }
}

export function parseTeardown(dirName) {
  const d = readJsonSafe(dirName, 'run-teardown.json');
  if (!d) return null;
  return { ...d, sessions_purged: d.sessions_purged === true, keep_scene: d.keep_scene === true };
}

/** 归档目录枚举：worker（<jobId>，纯数字）与造尺（build-<assignmentId>-<ts>） */
export function listArchiveDirs({ root = null } = {}) {
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
