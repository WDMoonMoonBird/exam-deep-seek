/**
 * dshRunArchiver.js —— R2-B23：运行结束后的**证据归档 + 落库摘要 + run-root 策略**。
 *
 * 归档到 `<DSH_GRADER_RUNS_ROOT>/<jobId>/`（默认 /srv/grader/runs）：
 *   run-teardown.json（装置产出的 teardown 证据）、device.stdout.log / device.stderr.log（尾部截断）、
 *   run.log（尾部）、comparability.json（若有）、evidence-summary.json（逐份 slug→分数/不可量原因）。
 * 策略：**成功 ⇒ 删 run-root**（省 /tmp）；**失败 ⇒ 保留 run-root** + 归档副本。
 * 落库：`grading_job_runs`（job_id 唯一）——服务端不做 prisma generate，故用**原始 SQL** 写。
 */
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

export const RUNS_ROOT_ENV = 'DSH_GRADER_RUNS_ROOT';
export const DEFAULT_RUNS_ROOT = '/srv/grader/runs';
export const TEARDOWN_NAME = 'run-teardown.json';
export const EVIDENCE_SUMMARY_NAME = 'evidence-summary.json';
export const MAX_TAIL_BYTES = 64 * 1024;

export function resolveRunsRoot(env = process.env) {
  const v = String(env[RUNS_ROOT_ENV] || '').trim();
  return v || DEFAULT_RUNS_ROOT;
}

/** 读文件尾部（最多 maxBytes，按行边界回退） */
export function tailText(file, maxBytes = MAX_TAIL_BYTES) {
  try {
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    return (start > 0 ? '…[truncated ' + start + ' bytes]\n' : '') + text;
  } catch { return null; }
}

/** 逐份证据摘要：从 measurable.json / results/*.model.json 提取 slug→分数/不可量原因 */
export function buildEvidenceSummary(runRoot) {
  const outDir = path.join(runRoot, 'out');
  const slugs = new Map();
  const put = (slug, patch) => { const cur = slugs.get(slug) || { slug }; slugs.set(slug, { ...cur, ...patch }); };
  try {
    const mf = path.join(outDir, 'diagnostics', 'measurable.json');
    if (fs.existsSync(mf)) {
      const doc = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const arr = Array.isArray(doc) ? doc : (doc.submissions || doc.items || []);
      for (const it of arr) {
        const slug = it.slug || it.id || it.name;
        if (!slug) continue;
        put(String(slug), { measurable: it.measurable !== false, reason: it.reason || it.unmeasurable_reason || null });
      }
    }
  } catch { /* 证据缺失 ⇒ 不阻断 */ }
  try {
    const resDir = path.join(outDir, 'results');
    if (fs.existsSync(resDir)) {
      for (const f of fs.readdirSync(resDir).sort()) {
        if (!f.endsWith('.model.json')) continue;
        const slug = f.replace(/\.model\.json$/, '');
        try {
          const doc = JSON.parse(fs.readFileSync(path.join(resDir, f), 'utf8'));
          const score = doc.score ?? doc.total_score ?? doc.total ?? null;
          put(slug, { score });
        } catch { put(slug, { parseError: true }); }
      }
    }
  } catch { /* ignore */ }
  const list = [...slugs.values()].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  return {
    schema_version: 'evidence-summary/1',
    run_root: runRoot,
    n: list.length,
    measurable: list.filter((x) => x.measurable !== false && x.score !== undefined).length,
    unmeasurable: list.filter((x) => x.measurable === false).length,
    submissions: list,
  };
}


// ===== ★R2-B27（路线 2）：会话销毁上移到 worker 编排层 =====
// 装置侧把 teardown 挂到 run.sh 的 EXIT trap 会与「预期非 0 退出」场景（R3.5-B S3 篡改 ⇒ exit 3）交互（t76/t79/t80 三轮实测）。
// 因此：装置保持既有能力（run.sh 与 HEAD 逐字节一致 ⇒ selftest 天然 82/0），会话销毁由 worker 用 run-root 完成，语义与 A 方案一致。
export const KEEP_SCENE_NAME = '.keep-scene';
export const DEFAULT_SCENE_KEEP_DAYS = 3;

/** 会话统计：home/sessions/** + home/storages/session_projcache/** ⇒ {files, bytes} */
export function sessionStats(runRoot) {
  const home = path.join(String(runRoot), 'home');
  let files = 0;
  let bytes = 0;
  const walk = (dir) => {
    let items = [];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const abs = path.join(dir, it.name);
      if (it.isSymbolicLink()) continue;
      if (it.isDirectory()) walk(abs);
      else if (it.isFile()) { files += 1; try { bytes += fs.statSync(abs).size; } catch { /* ignore */ } }
    }
  };
  for (const d of [path.join(home, 'sessions'), path.join(home, 'storages', 'session_projcache')]) walk(d);
  return { files, bytes };
}

/** ★R2-B27：run-root 级 teardown（成功⇒销毁会话+凭据、保留骨架；失败⇒现场+.keep-scene；凭据任何情况必删）。
 *  早期退出防御：<run-root>/out 不可用 ⇒ 只打印 RUN_TEARDOWN_SKIPPED 并返回（无副作用）。 */
export function purgeRunRootSessions({ runRoot, exitCode = 0, purge = true, keepDays = DEFAULT_SCENE_KEEP_DAYS, log = console } = {}) {
  const teardownFile = 'run-teardown.json';   // ★R2-B27：内联字面量（避免作用域/未定义导致写入被 catch 吞掉）
  const outDir = path.join(String(runRoot), 'out');
  const home = path.join(String(runRoot), 'home');
  if (!runRoot || !fs.existsSync(outDir)) {
    log.log('RUN_TEARDOWN_SKIPPED reason=out_dir_unavailable path=' + String(runRoot));
    return { skipped: 'out_dir_unavailable', sessionsPurged: false, keepScene: false };
  }
  const homeExistsBefore = fs.existsSync(home) ? 'yes' : 'no';
  const before = sessionStats(runRoot);
  let credentialsRemoved = 'yes';
  const credPath = path.join(home, '.credentials.yaml');
  if (fs.existsSync(credPath)) {
    try { fs.rmSync(credPath, { force: true }); } catch { /* ignore */ }
    credentialsRemoved = fs.existsSync(credPath) ? 'no' : 'yes';
  }
  let sessionsPurged = false;
  let keepScene = false;
  let purged = false;
  if (exitCode === 0 && purge) {
    purged = true;
    for (const rel of ['sessions', path.join('storages', 'session_projcache')]) {
      try { fs.rmSync(path.join(home, rel), { recursive: true, force: true }); } catch { /* ignore */ }
    }
    sessionsPurged = sessionStats(runRoot).files === 0;
    if (!sessionsPurged) log.log('TEARDOWN_FAIL reason=session_residue_after_purge run_root=' + runRoot);
  } else {
    keepScene = true;
    if (exitCode !== 0) {
      try {
        fs.mkdirSync(home, { recursive: true });
        const NL = String.fromCharCode(10);
        const body = 'keep_scene=yes' + NL + 'keep_days=' + keepDays + NL + 'reason=non-zero-exit' + NL + 'ts=' + new Date().toISOString() + NL;
        fs.writeFileSync(path.join(home, KEEP_SCENE_NAME), body);
      } catch { /* ignore */ }
    }
  }
  const after = sessionStats(runRoot);
  const evidence = {
    isolated_home: home,
    home_exists_before: homeExistsBefore,
    credentials_removed: credentialsRemoved,
    session_files_before: before.files,
    session_bytes: before.bytes,
    sessions_purged: sessionsPurged,
    home_exists_after: fs.existsSync(home) ? 'yes' : 'no',
    session_files_after: after.files,
    home_policy: 'sessions+credentials',
    purge_policy: 'purge_home=' + (purge ? 1 : 0) + ' keep_days=' + keepDays + ' exit=' + exitCode,
    keep_scene: keepScene,
    source: 'worker',
    ts: new Date().toISOString(),
  };
  const tail = String.fromCharCode(10);   // ★R2-B28 根因修复：R2-B27 曾引用未定义的 LF（ReferenceError）⇒ 证据写入被 catch 吞掉
  try { fs.writeFileSync(path.join(outDir, teardownFile), JSON.stringify(evidence, null, 2) + tail); } catch (err) { log.log('TEARDOWN_FAIL reason=evidence_write_failed err=' + String(err && err.message).slice(0, 160)); }
  log.log('RUN_TEARDOWN=' + JSON.stringify(evidence));
  logger.info({ runRoot, ...evidence }, 'R2-B27：run-root teardown（会话销毁 + 凭据清理）');
  return { evidence, sessionsPurged, keepScene, purged };
}

/** 安全护栏：只允许删 `/tmp/r2b4-job-<jobId>-*` 形态的 run-root */
export function isPrunableRunRoot(runRoot, jobId) {
  const resolved = path.resolve(runRoot);
  const base = path.basename(resolved);
  return resolved.startsWith('/tmp/') && base.startsWith('r2b4-job-' + jobId + '-');
}

/**
 * 归档 + 策略处理。
 * @returns {Promise<{dir:string|null,bytes:number,files:string[],pruned:boolean,skipped?:string}>}
 */
export async function archiveRun({ runRoot, jobId, success, runsRoot = DEFAULT_RUNS_ROOT, log = console }) {
  const result = { dir: null, bytes: 0, files: [], pruned: false };
  if (!runRoot || !fs.existsSync(runRoot)) { result.skipped = 'run_root_missing'; return result; }
  const dir = path.join(runsRoot, String(jobId));
  try { fs.mkdirSync(dir, { recursive: true }); } catch { result.skipped = 'runs_root_unwritable'; return result; }
  const copy = (rel, name) => {
    const src = path.join(runRoot, rel);
    if (!fs.existsSync(src)) return;
    const dst = path.join(dir, name);
    fs.copyFileSync(src, dst);
    result.files.push(name);
    result.bytes += fs.statSync(dst).size;
  };
  const writeTail = (rel, name) => {
    const text = tailText(path.join(runRoot, rel));
    if (text === null) return;
    fs.writeFileSync(path.join(dir, name), text);
    result.files.push(name);
    result.bytes += Buffer.byteLength(text);
  };
  copy(path.join('out', TEARDOWN_NAME), TEARDOWN_NAME);
  writeTail(path.join('out', 'device.stdout.log'), 'device.stdout.log');
  writeTail(path.join('out', 'device.stderr.log'), 'device.stderr.log');
  writeTail('run.log', 'run.log');
  copy(path.join('out', 'comparability.json'), 'comparability.json');
  try {
    const summary = buildEvidenceSummary(runRoot);
    fs.writeFileSync(path.join(dir, EVIDENCE_SUMMARY_NAME), JSON.stringify(summary, null, 2) + '\n');
    result.files.push(EVIDENCE_SUMMARY_NAME);
    result.bytes += fs.statSync(path.join(dir, EVIDENCE_SUMMARY_NAME)).size;
  } catch { /* ignore */ }
  result.dir = dir;
  if (success && isPrunableRunRoot(runRoot, jobId)) {
    try { fs.rmSync(runRoot, { recursive: true, force: true }); result.pruned = !fs.existsSync(runRoot); } catch { result.pruned = false; }
  }
  logger.info({ jobId, dir, bytes: result.bytes, pruned: result.pruned }, 'R2-B23：运行证据已归档');
  log.log('RUN_ARCHIVED dir=' + dir + ' bytes=' + result.bytes + ' pruned_run_root=' + (result.pruned ? 'yes' : 'no') + ' files=' + result.files.length);
  return result;
}

/** 落库摘要（原始 SQL，job_id 唯一；缺 prisma 能力时返回落库失败不抛） */
export async function persistJobRun({ prisma, jobId, assignmentId, checkerId = null, startedAt = null, finishedAt = new Date(), deviceExit = null, measured = 0, unmeasurable = 0, skipped = 0, written = 0, teardown = null, runDir = null, logStdout = null, logStderr = null }) {
  if (!prisma || typeof prisma.$executeRawUnsafe !== 'function') return { persisted: false, reason: 'prisma_raw_unavailable' };
  const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 23).replace('T', ' ') : null);
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO grading_job_runs (job_id, assignment_id, checker_id, started_at, finished_at, device_exit, measured, unmeasurable, skipped, written, teardown_json, run_dir, log_stdout, log_stderr, created_at, updated_at) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) '
      + 'ON DUPLICATE KEY UPDATE finished_at = VALUES(finished_at), device_exit = VALUES(device_exit), measured = VALUES(measured), '
      + 'unmeasurable = VALUES(unmeasurable), skipped = VALUES(skipped), written = VALUES(written), teardown_json = VALUES(teardown_json), '
      + 'run_dir = VALUES(run_dir), log_stdout = VALUES(log_stdout), log_stderr = VALUES(log_stderr), updated_at = UTC_TIMESTAMP(3)',
      Number(jobId), Number(assignmentId), checkerId, fmt(startedAt), fmt(finishedAt), deviceExit === null ? null : Number(deviceExit),
      Number(measured) || 0, Number(unmeasurable) || 0, Number(skipped) || 0, Number(written) || 0,
      teardown ? JSON.stringify(teardown) : null, runDir, logStdout, logStderr,
    );
    return { persisted: true };
  } catch (err) {
    logger.warn({ jobId, err: String(err && err.message).slice(0, 200) }, 'R2-B23：运行摘要落库失败（不阻断 job 终态）');
    return { persisted: false, reason: String(err && err.message).slice(0, 200) };
  }
}
