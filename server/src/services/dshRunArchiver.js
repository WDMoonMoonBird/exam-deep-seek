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
import { captureSessionUsage, summarizeUsageForEvidence, USAGE_REL_PATH } from './dshSessionUsage.js';

export const RUNS_ROOT_ENV = 'DSH_GRADER_RUNS_ROOT';
export const DEFAULT_RUNS_ROOT = '/srv/grader/runs';
export const TEARDOWN_NAME = 'run-teardown.json';
export const EVIDENCE_SUMMARY_NAME = 'evidence-summary.json';
/** ★R2-B36：会话用量取证产物名（<run-root>/out/session-usage.json ⇒ 归档同名） */
export const USAGE_NAME = 'session-usage.json';
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
  let skippedArtifacts = 0;
  // ★R2-B38（t6）：按类型计数（诊断/审计用）——**不改变** skipped_artifacts 的既有口径（总数仍是同一个累加器）
  const skippedKinds = { 'grading-result:non_json': 0, 'grading-result:not_result': 0, 'grading-result:parse_error': 0, 'grading-results-index:no_slug': 0, 'measure:entry': 0, 'results:non_json': 0, 'results:not_result': 0, 'results:parse_error': 0 };
  const skip = (kind) => { skippedArtifacts += 1; skippedKinds[kind] += 1; };
  const numOf = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  // 只把「看起来是逐份结果」的 JSON 当 submission（避免 coverage/matrix 之类的干扰产物被计入）
  const looksLikeResult = (doc) => !!doc && (doc.totals !== undefined || doc.score !== undefined || doc.total_score !== undefined
    || doc.submission !== undefined || (Array.isArray(doc.items) && doc.items.length > 0) || doc.checker_id !== undefined);
  const shapeItem = (slug, doc) => ({
    slug,
    student: doc.student_name || doc.student || (doc.submission && (doc.submission.student_name || doc.submission.studentName || doc.submission.name)) || null,
    score: numOf(doc.score ?? doc.total_score ?? (doc.totals && doc.totals.score) ?? doc.total),
    hits: Array.isArray(doc.items) ? doc.items.length : numOf(doc.hits ?? doc.hit_count),
    measurable: doc.unmeasurable !== true && doc.measurable !== false,
    failed: doc.failed === true || doc.status === 'failed',
    reason: doc.reason || doc.unmeasurable_reason || doc.error_reason || null,
  });
  try {
    const mf = path.join(outDir, 'diagnostics', 'measurable.json');
    if (fs.existsSync(mf)) {
      const doc = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const arr = Array.isArray(doc) ? doc : (doc.submissions || doc.items || []);
      for (const it of arr) {
        const slug = it.slug || it.id || it.name;
        if (!slug) continue;
        put(String(slug), { measurable: it.measurable !== false && it.unmeasurable !== true, reason: it.reason || it.unmeasurable_reason || null });
      }
    }
  } catch { /* 证据缺失 ⇒ 不阻断 */ }
  // ① ★R2-B32（云上 job 5 实测修正）：逐份结果在 out/grading-result/<slug>.json；
  //    早前读的 out/measure/*.json 是 coverage/matrix **干扰产物**（不是逐份结果）⇒ 不再当 submission、不再产 parseError 占位。
  try {
    const perDir = path.join(outDir, 'grading-result');
    if (fs.existsSync(perDir)) {
      for (const f of fs.readdirSync(perDir).sort()) {
        if (!f.endsWith('.json')) { skip('grading-result:non_json'); continue; }
        const slug = f.replace(/\.json$/, '');
        try {
          const doc = JSON.parse(fs.readFileSync(path.join(perDir, f), 'utf8'));
          if (!looksLikeResult(doc)) { skip('grading-result:not_result'); continue; }
          put(slug, shapeItem(slug, doc));
        } catch { skip('grading-result:parse_error'); }
      }
    }
  } catch { /* ignore */ }
  // ② 索引 out/grading-results.json（数组或 {results|submissions|items:[…]}）
  try {
    const idxFile = path.join(outDir, 'grading-results.json');
    if (fs.existsSync(idxFile)) {
      const doc = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
      const arr = Array.isArray(doc) ? doc : (doc.results || doc.submissions || doc.items || []);
      for (const it of arr) {
        const slug = it.slug || (it.submission && (it.submission.slug || it.submission.id)) || it.id || it.name;
        if (!slug) { skip('grading-results-index:no_slug'); continue; }
        put(String(slug), shapeItem(String(slug), it));
      }
    }
  } catch { /* ignore */ }
  // ★R2-B33：out/measure/ 在真机里是 coverage/matrix 干扰产物 ⇒ **始终扫描但只计数**（不产 parseError、绝不进 submissions）
  try {
    const noiseDir = path.join(outDir, 'measure');
    if (fs.existsSync(noiseDir)) {
      // ★R2-B34（F-T78-2 口径裁定）：out/measure 是**非结果产物目录**（云上实证 = coverage/matrix）
      //   ⇒ 该目录顶层**每个文件**都计 1（口径=文件数、范围=out/measure 顶层），不再用 looksLikeResult 判定
      //   （此前把含 checker_id 的文件当结果 ⇒ 计数恒 0，与记录里「可恢复 >=2」不符）。
      for (const f of fs.readdirSync(noiseDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (!f.isFile()) { skip('measure:entry'); continue; }   // 子目录也计 1（按「条目数」口径）
        skip('measure:entry');
      }
    }
  } catch { /* ignore */ }
  // ③ 旧布局兜底（仅当前两源都没收到条目时）：out/results/*.json，且只收「看起来是结果」的文件。
  //    注：out/measure/*.json 在云上真例里是 coverage/matrix 干扰产物 ⇒ 本实现刻意不把它当结果源（由主源 grading-result 负责）。
  try {
    const resDir = path.join(outDir, 'results');
    // ★R2-CAP3（C 在 t7 抓到 F-T7-1）：此处原写 `items.size`，但本作用域内**没有 items 绑定**
    //   （Map 名为 slugs）⇒ ReferenceError 被本块外层空 catch 静默吞掉 ⇒ 整段旧布局兜底是死代码：
    //   ① 仅含 out/results 的历史运行拿不到逐份 submissions；② 新增的 results:non_json|not_result|
    //   parse_error 三键恒 0 永不可达。修为 slugs.size。
    if (slugs.size === 0 && fs.existsSync(resDir)) {
      for (const f of fs.readdirSync(resDir).sort()) {
        if (!f.endsWith('.json')) { skip('results:non_json'); continue; }
        const slug = f.replace(/\.[a-z0-9_]*\.?model\.json$/, '').replace(/\.json$/, '');
        try {
          const doc = JSON.parse(fs.readFileSync(path.join(resDir, f), 'utf8'));
          if (!looksLikeResult(doc)) { skip('results:not_result'); continue; }
          put(slug, shapeItem(slug, doc));
        } catch { skip('results:parse_error'); }
      }
    }
  } catch { /* ignore */ }
  // ④ ★R2-B33：份数口径补全 —— 装置自报行是**权威份数**（N/MEASURED/FAILED/UNMEASURABLE）。
  //    不可量/失败/未量尺的提交可能没有 grading-result 文件，也必须进 submissions[]（measurable:false + reason），
  //    否则 summary 的 n/failed 会小于 RUN_COUNTS（云上 job 6：summary n=3/failed=0 vs 真机 total=4/failed=1）。
  let deviceN = null; let deviceFailed = null; let deviceUnmeasurable = null;
  try {
    const devFile = path.join(outDir, 'device.stdout.log');
    const devText = fs.existsSync(devFile) ? fs.readFileSync(devFile, 'utf8') : '';
    const devLine = devText.split(String.fromCharCode(10)).reverse().find((l) => l.includes('ASSIGNMENT_RESULT=')) || '';
    const pick = (k) => { const rr = new RegExp('(?:^|[^A-Z_])' + k + '=(-?\\d+)').exec(devLine); return rr ? Number(rr[1]) : null; };
    if (devLine) { deviceN = pick('N'); deviceFailed = pick('FAILED'); deviceUnmeasurable = pick('UNMEASURABLE'); }
    const slugsMatch = /ASSIGNMENT_UNMEASURABLE_SLUGS=([^\s]*)/.exec(devText);
    if (slugsMatch && slugsMatch[1] && /^[A-Za-z0-9_,-]+$/.test(slugsMatch[1])) {
      for (const s of slugsMatch[1].split(/[,\s]+/).filter(Boolean)) {
        if (!slugs.has(s)) put(s, { measurable: false, failed: false, reason: 'unmeasurable' });
      }
    }
  } catch { /* ignore */ }
  // comparability.json 的逐份条目（真实产物之一；只补缺失的 slug）
  try {
    const cj = path.join(outDir, 'assignment', 'comparability.json');
    if (fs.existsSync(cj)) {
      const doc = JSON.parse(fs.readFileSync(cj, 'utf8'));
      const arr = Array.isArray(doc) ? doc : (doc.submissions || doc.items || doc.entries || []);
      for (const it of arr) {
        const slug = it.slug || it.id || it.name;
        if (!slug || slugs.has(String(slug))) continue;
        const un = it.unmeasurable === true || (it.ok === false && it.failed !== true);
        put(String(slug), { measurable: un !== true, failed: it.failed === true, reason: it.reason || (it.failed === true ? 'failed' : null) });
      }
    }
  } catch { /* ignore */ }
  // 仍缺的份数（自报 N 与实际条目数之差）⇒ 用明确 reason 的占位条目补齐（不发明成功/分数）
  if (deviceN !== null && Number.isFinite(deviceN) && deviceN > slugs.size) {
    let missing = deviceN - slugs.size;
    let failLeft = deviceFailed === null ? 0 : deviceFailed - [...slugs.values()].filter((x) => x.failed === true).length;
    let unLeft = deviceUnmeasurable === null ? 0 : deviceUnmeasurable - [...slugs.values()].filter((x) => x.measurable === false).length;
    for (let i = 0; i < missing; i += 1) {
      const isFailed = failLeft > 0;
      const isUn = !isFailed && unLeft > 0;
      if (isFailed) failLeft -= 1;
      if (isUn) unLeft -= 1;
      put('unknown-' + String(i + 1).padStart(2, '0'), { measurable: false, failed: isFailed, reason: isFailed ? 'failed' : (isUn ? 'unmeasurable' : 'no_result_artifact') });
    }
  }
  const list = [...slugs.values()].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  return {
    schema_version: 'evidence-summary/2',   // ★R2-B32：改为「逐份结果」口径（附 failed 与 skipped_artifacts）
    run_root: runRoot,
    n: list.length,
    measurable: list.filter((x) => x.measurable !== false && x.failed !== true).length,
    unmeasurable: list.filter((x) => x.measurable === false && x.failed !== true).length,   // ★R2-B33：失败份数不重复计入不可量
    failed: list.filter((x) => x.failed === true).length,
    skipped_artifacts: skippedArtifacts,
    // ★R2-B38（t6）：按类型计数（键固定全量给出，便于断言与看板；总数口径不变 = skipped_artifacts）
    skipped_kinds: { ...skippedKinds },
    submissions: list,
  };
}



// ===== ★R2-B31：run-root 生命周期共享 helper（批改与造尺两条路径共用，禁止各自再实现一遍）=====
//   teardown（会话销毁 + 凭据必删 + 证据 <run-root>/out/run-teardown.json）
//   → 归档（<runsRoot>/<dirName>：teardown/日志/证据）→ 成功时清理 run-root（由 archiveRun 完成）。
//   ★本函数**永不抛**、**永不改调用方退出码**（fail-soft）；source：批改 'worker'／造尺 'build'。
export async function finalizeRunRoot({
  runRoot, success = false, exitCode = null, source = 'worker', jobId = null, dirName = null,
  runsRoot = DEFAULT_RUNS_ROOT, purge = true, keepDays = DEFAULT_SCENE_KEEP_DAYS, archive = true, failed = null, log = console,
} = {}) {
  const out = { teardown: null, archive: null, error: null };
  if (!runRoot) return out;
  try {
    out.teardown = purgeRunRootSessions({ runRoot, exitCode: exitCode === null ? (success ? 0 : 1) : exitCode, purge, keepDays, source, failed, log });
  } catch (err) { out.error = 'teardown:' + String(err && err.message).slice(0, 160); }
  try {
    // ★R2-B32：jobId 必须透传（否则归档日志 jobId=null 且剪枝形状护栏失配 ⇒ 成功也不剪枝）
    if (archive) out.archive = await archiveRun({ runRoot, jobId, success, runsRoot, log, dirName });
  } catch (err) { out.error = (out.error ? out.error + ';' : '') + 'archive:' + String(err && err.message).slice(0, 160); }
  return out;
}

// ★R2-B31：造尺路径包装（归档 build-<assignmentId>-<ts>/；teardown 证据 source=build；不动退出码）
export async function finalizeBuildRunRoot({ runRoot, assignmentId, exitCode = 0, success = null, runsRoot = DEFAULT_RUNS_ROOT, purge = true, keepDays = DEFAULT_SCENE_KEEP_DAYS, log = console } = {}) {
  if (!runRoot) return { skipped: 'no_run_root' };
  const ok = success === null ? Number(exitCode) === 0 : !!success;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dirName = 'build-' + String(assignmentId) + '-' + stamp;
  const res = await finalizeRunRoot({ runRoot, success: ok, exitCode, source: 'build', dirName, runsRoot, purge, keepDays, log });
  const ev = res.teardown && res.teardown.evidence ? res.teardown.evidence : null;
  log.log('BUILD_RUN_FINALIZED dir=' + (res.archive && res.archive.dir ? res.archive.dir : '(none)')
    + ' sessions_purged=' + (ev ? ev.sessions_purged : 'na') + ' session_files_after=' + (ev ? ev.session_files_after : 'na')
    + ' credentials_removed=' + (ev ? ev.credentials_removed : 'na') + ' keep_scene=' + (ev ? ev.keep_scene : 'na')
    + ' source=build' + (res.error ? ' error=' + res.error : ''));
  return res;
}

// ===== ★R2-B30：run 计数映射（口径权威来源优先级；修 t87 前暴露的 measured/unmeasurable 恒 0 缺陷）=====
//
// 计数口径（写死为契约，勿再靠兜底默认值）：
//   measured     = **成功量尺**的份数（有分且判为可量）
//   unmeasurable = **C8 预检/量尺判定为不可量**的份数
//   skipped      = **未写入分数**的份数（失败/不可量/缺产物）
//   written      = **实际写入分数行**数（正常 ≤ measured；两者相等表示「量到即写入」）
//
// 权威来源优先级（越靠前越可信）：
//   ① 装置自报行：日志里的 `ASSIGNMENT_RESULT=<...> N=<n> MEASURED=<m> UNMEASURABLE=<u>`
//   ② out/assignment/comparability.json 的 ok/failed/unmeasurable
//   ③ evidence-summary（out/diagnostics/measurable.json + out/results/*.model.json 汇总）
//   ④ deviceExit/消费侧返回值（仅用于 skipped 兜底）
export function resolveRunCounts({ deviceTail = '', summary = null, comparability = null, deviceExit = null, total = null, writtenHint = null, skippedHint = null } = {}) {
  const counts = { measured: null, unmeasurable: null, skipped: null, written: null, failed: null, result: null, source: [] };
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  // ① 装置自报行
  // ★R2-B31：容忍字段顺序与可选 FAILED —— 逐字段抓取 ASSIGNMENT_RESULT= 行里的 KEY=VAL（云上真例含 FAILED=1）
  const line = String(deviceTail || '')
    .split(String.fromCharCode(10)).reverse().find((l) => l.includes('ASSIGNMENT_RESULT=')) || '';
  let selfTotal = null;
  if (line) {
    const pick = (k) => { const r = new RegExp('(?:^|[\\s,])' + k + '=(-?\\d+)').exec(line); return r ? num(r[1]) : null; };
    const rWords = /ASSIGNMENT_RESULT=([A-Z_]+)/.exec(line);
    if (rWords) { counts.result = rWords[1]; counts.source.push('device_line'); }
    selfTotal = pick('N');
    counts.measured = pick('MEASURED');
    counts.unmeasurable = pick('UNMEASURABLE');
    counts.failed = pick('FAILED');
    if (counts.measured === null) counts.source.pop();
  }
  // ② comparability.json
  if (counts.measured === null && comparability && typeof comparability === 'object') {
    const ok = num(comparability.ok ?? comparability.measured);
    const un = num(comparability.unmeasurable);
    if (ok !== null) { counts.measured = ok; counts.source.push('comparability'); }
    if (un !== null) { counts.unmeasurable = un; if (!counts.source.includes('comparability')) counts.source.push('comparability'); }
  }
  // ③ evidence-summary
  if (summary && typeof summary === 'object') {
    if (counts.measured === null && num(summary.measurable) !== null) { counts.measured = num(summary.measurable); counts.source.push('evidence_summary'); }
    if (counts.unmeasurable === null && num(summary.unmeasurable) !== null) { counts.unmeasurable = num(summary.unmeasurable); counts.source.push('evidence_summary'); }
    if (selfTotal === null && num(summary.n) !== null) selfTotal = num(summary.n);
  }
  const n = selfTotal !== null ? selfTotal : num(total);
  // written：优先消费侧提示，其次 = measured（量到即写入）
  if (writtenHint !== null && num(writtenHint) !== null) { counts.written = num(writtenHint); counts.source.push('written_hint'); }
  else if (counts.measured !== null) counts.written = counts.measured;
  // skipped：优先消费侧提示，其次 = N − written
  if (skippedHint !== null && num(skippedHint) !== null) { counts.skipped = num(skippedHint); counts.source.push('skipped_hint'); }
  else if (n !== null && counts.written !== null) counts.skipped = Math.max(0, n - counts.written);
  // deviceExit 非 0 且无任何权威计数 ⇒ 全量视为未写入（不假装成功）
  if (deviceExit !== null && num(deviceExit) !== 0 && counts.written === null) {
    counts.measured = counts.measured === null ? 0 : counts.measured;
    counts.unmeasurable = counts.unmeasurable === null ? 0 : counts.unmeasurable;
    counts.written = 0;
    counts.skipped = n !== null ? n : 0;
    counts.source.push('device_failed');
  }
  return {
    measured: counts.measured === null ? 0 : counts.measured,
    unmeasurable: counts.unmeasurable === null ? 0 : counts.unmeasurable,
    skipped: counts.skipped === null ? 0 : counts.skipped,
    written: counts.written === null ? 0 : counts.written,
    failed: counts.failed === null ? 0 : counts.failed,   // ★R2-B31：无法评分份数（页面要显示）
    result: counts.result || null,
    total: n === null ? null : n,
    source: counts.source.join('+') || 'none',
  };
}

/** 从 run-root 收集计数的输入（日志尾部 + comparability + 证据汇总）；全部缺失时返回空对象，由 resolveRunCounts 兜底 */
export function collectRunCountInputs(runRoot) {
  const out = { deviceTail: '', comparability: null, summary: null };
  try {
    // ★R2-B31（云上实测修正）：装置自报行实际写在 <run-root>/out/device.stdout.log（原候选漏了 out/ ⇒ 解析未命中）
    const cands = [
      path.join(runRoot, 'out', 'device.stdout.log'),
      path.join(runRoot, 'device.stdout.log'),
      path.join(runRoot, 'out', 'device.stderr.log'),
      path.join(runRoot, 'out', 'logs', 'grade.stdout.log'),
      path.join(runRoot, 'out', 'run.log'),
    ];
    try {
      const logDir = path.join(runRoot, 'out', 'logs');
      if (fs.existsSync(logDir)) {
        for (const f of fs.readdirSync(logDir).sort()) if (!cands.some((c) => c.endsWith(f))) cands.push(path.join(logDir, f));
      }
    } catch { /* ignore */ }
    for (const c of cands) {
      if (!fs.existsSync(c)) continue;
      const t = tailText(c, 16384);
      if (t && t.includes('ASSIGNMENT_RESULT=')) { out.deviceTail = t; break; }
      if (t) out.deviceTail = out.deviceTail || t;
    }
  } catch { /* ignore */ }
  try {
    const cj = path.join(runRoot, 'out', 'assignment', 'comparability.json');
    if (fs.existsSync(cj)) out.comparability = JSON.parse(fs.readFileSync(cj, 'utf8'));
  } catch { /* ignore */ }
  try { out.summary = buildEvidenceSummary(runRoot); } catch { /* ignore */ }
  return out;
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
export function purgeRunRootSessions({ runRoot, exitCode = 0, purge = true, keepDays = DEFAULT_SCENE_KEEP_DAYS, source = 'worker', failed = null, log = console } = {}) {
  const teardownFile = 'run-teardown.json';   // ★R2-B27：内联字面量（避免作用域/未定义导致写入被 catch 吞掉）
  const outDir = path.join(String(runRoot), 'out');
  const home = path.join(String(runRoot), 'home');
  if (!runRoot || !fs.existsSync(outDir)) {
    log.log('RUN_TEARDOWN_SKIPPED reason=out_dir_unavailable path=' + String(runRoot));
    return { skipped: 'out_dir_unavailable', sessionsPurged: false, keepScene: false };
  }
  const homeExistsBefore = fs.existsSync(home) ? 'yes' : 'no';
  const before = sessionStats(runRoot);
  // ★R2-B36：**取证阶段**（销毁会话之前）抽取用量 ⇒ <run-root>/out/session-usage.json（随 run-root 归档）。
  //   幂等：worker/造尺脚本已在销毁前抽取过（用 DB 价目表算费）则直接复用文件，不重算。
  let usageSummary = null;
  try {
    const cap = captureSessionUsage({ runRoot, log });
    if (cap && cap.usage) usageSummary = summarizeUsageForEvidence(cap.usage);
  } catch (err) {
    log.log('SESSION_USAGE=failed reason=' + String(err && err.message).slice(0, 160));
  }
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
    // ★R2-B36：用量摘要（tokens/缓存命中/费用/工具调用；零 LLM 运行 no_model_session=yes 且全 0）
    usage: usageSummary,
    failed: failed === null ? 0 : Number(failed) || 0,   // ★R2-B31：无法评分份数（与 measured/unmeasurable 并列，页面显示用）
    source: source,          // ★R2-B31：批改 source=worker；造尺 source=build（字段与批改完全一致）
    ts: new Date().toISOString(),
  };
  const tail = String.fromCharCode(10);   // ★R2-B28 根因修复：R2-B27 曾引用未定义的 LF（ReferenceError）⇒ 证据写入被 catch 吞掉
  try { fs.writeFileSync(path.join(outDir, teardownFile), JSON.stringify(evidence, null, 2) + tail); } catch (err) { log.log('TEARDOWN_FAIL reason=evidence_write_failed err=' + String(err && err.message).slice(0, 160)); }
  log.log('RUN_TEARDOWN=' + JSON.stringify(evidence));
  logger.info({ runRoot, ...evidence }, 'R2-B27：run-root teardown（会话销毁 + 凭据清理）');
  return { evidence, sessionsPurged, keepScene, purged };
}

/**
 * ★R2-B34：递归补写位（非 root 删除只读目录树的前置步骤）。
 * 只对传入目录内部生效；任何错误都吞掉（删除阶段仍会给出明确 prune_skipped 原因）。
 */
export function makeTreeWritable(dir) {
  const fix = (p, isDir) => {
    try { fs.chmodSync(p, isDir ? 0o700 : 0o600); } catch { /* 无权限改位则跳过，交由 rm 决定 */ }
  };
  const walk = (p) => {
    let entries = [];
    try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { fix(p, true); return; }
    for (const it of entries) {
      const abs = path.join(p, it.name);
      if (it.isDirectory()) { walk(abs); fix(abs, true); }
      else { fix(abs, false); }
    }
    fix(p, true);
  };
  try { walk(dir); } catch { /* ignore */ }
}

/** 安全护栏：只允许删 `/tmp/r2b4-job-<jobId>-*` 形态的 run-root */
export function isPrunableRunRoot(runRoot, jobId) {
  const resolved = path.resolve(runRoot);
  const base = path.basename(resolved);
  if (!resolved.startsWith('/tmp/')) return false;
  // ★R2-B31：造尺 run-root（/tmp/r2b7-checker-*）与批改 run-root（/tmp/r2b4-job-<id>-*）都受同一安全形状约束
  if (base.startsWith('r2b7-checker-')) return true;
  return base.startsWith('r2b4-job-' + jobId + '-');
}

/**
 * 归档 + 策略处理。
 * @returns {Promise<{dir:string|null,bytes:number,files:string[],pruned:boolean,skipped?:string}>}
 */
/**
 * ★R2-B42（CAP-BF-3）：把 run-root 的**逐份分项**投影聚合为归档 grading-results.json 的统一样式：
 *   `[{ submission_id, student_name?, totals?, items:[…], source }]`（按 submission_id 稳定排序，便于逐字节对拍）。
 * 读取优先级与消费侧一致：`out/grading-result/<slug>.json` > `out/grading-result.json`（单份/条目数组）。
 * 只读、幂等；任何坏文件跳过（绝不因聚合失败阻断归档）。
 */
export function aggregateDetailResults(runRoot) {
  const rows = [];
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const push = (slug, studentName, items, totals, source) => {
    if (!Array.isArray(items) || items.length === 0) return;
    rows.push({ submission_id: slug ? String(slug) : null, student_name: studentName || null, totals: totals || null, items, source });
  };
  const perDir = path.join(runRoot, 'out', 'grading-result');
  if (fs.existsSync(perDir)) {
    for (const f of fs.readdirSync(perDir).sort()) {
      if (!f.endsWith('.json')) continue;
      const rel = 'out/grading-result/' + f;
      const doc = readJson(path.join(perDir, f));
      if (!doc) continue;
      if (Array.isArray(doc)) { push(f.replace(/\.json$/, ''), null, doc, null, rel); continue; }
      const sub = (doc && doc.submission) || {};
      push((sub.id || doc.slug || f.replace(/\.json$/, '')), sub.student_name || sub.studentName || doc.student_name || null, doc.items, doc.totals, rel);
    }
  }
  const single = path.join(runRoot, 'out', 'grading-result.json');
  if (fs.existsSync(single)) {
    const doc = readJson(single);
    if (doc) {
      const rel = 'out/grading-result.json';
      if (Array.isArray(doc)) {
        // 条目数组（每条一份）优先；否则视为单份 items 数组
        const perSubmission = doc.some((e) => e && (Array.isArray(e.items) || e.submission_id !== undefined || e.submission !== undefined));
        if (perSubmission) {
          for (const e of doc) {
            const sub = (e && e.submission) || {};
            push(e && (e.submission_id || sub.id || e.slug), (e && (e.student_name || sub.student_name || sub.studentName)) || null, e && e.items, e && e.totals, rel);
          }
        } else {
          push(null, null, doc, null, rel);
        }
      } else {
        const sub = doc.submission || {};
        push(sub.id || doc.slug || null, sub.student_name || sub.studentName || doc.student_name || null, doc.items, doc.totals, rel);
      }
    }
  }
  return rows.sort((a, b) => String(a.submission_id || '').localeCompare(String(b.submission_id || '')) || String(a.source).localeCompare(String(b.source)));
}

export async function archiveRun({ runRoot, jobId, success, runsRoot = DEFAULT_RUNS_ROOT, log = console, dirName = null }) {
  const result = { dir: null, bytes: 0, files: [], pruned: false };
  if (!runRoot || !fs.existsSync(runRoot)) { result.skipped = 'run_root_missing'; return result; }
  // ★R2-B31：归档目录名可定制（批改 <jobId>/；造尺 build-<assignmentId>-<ts>/）
  const dir = path.join(runsRoot, dirName ? String(dirName) : String(jobId));
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
  // ★R2-B36：会话用量取证产物（销毁前抽取）随归档落地 ⇒ 事后可逐项复核 tokens/费用/工具调用
  copy(USAGE_REL_PATH, USAGE_NAME);
  // ★R2-B31（云上实测修正）：把比较性/结果产物一并归档，便于事后审计（存在才复制）
  copy(path.join('out', 'assignment', 'comparability.json'), 'comparability.json');
  copy(path.join('out', 'grading-results.json'), 'grading-results.json');
  // ★R2-B50（B49-F2）：会话内总评产物随归档落地（**平铺为 summaries.json**，与 session-usage.json/grading-results.json 同风格）
  //   ⇒ 批改记录页三态（未生成/缓存命中/本次生成）在 usage_json 缺字段的**老数据**上也能由归档 meta 精确推导；
  //   字节原样复制（不重序列化）。读取侧兼容 out/summaries.json 与 summaries.json 两种位置。
  copy(path.join('out', 'summaries.json'), 'summaries.json');
  // ★R2-B42（CAP-BF-3）：**复用运行**（measure-only、零 LLM）里装置不写 out/grading-results.json
  //   ⇒ 归档缺「逐份分项」。此处把 run-root 的逐份分项投影（out/grading-result/<slug>.json 等）聚合为
  //   **与 build 路径同形**的 grading-results.json；device 已写过则一行不改（逐字节保留）。
  if (!result.files.includes('grading-results.json')) {
    try {
      const agg = aggregateDetailResults(runRoot);
      if (agg.length) {
        const dst = path.join(dir, 'grading-results.json');
        fs.writeFileSync(dst, JSON.stringify(agg, null, 2) + String.fromCharCode(10));
        result.files.push('grading-results.json');
        result.bytes += fs.statSync(dst).size;
        log.log('RUN_DETAIL_AGGREGATED=yes count=' + agg.length + ' source=out/grading-result');
      } else {
        log.log('RUN_DETAIL_AGGREGATED=no count=0（run-root 无逐份分项投影 ⇒ 不写空文件）');
      }
    } catch (err) {
      log.log('RUN_DETAIL_AGGREGATED=error reason=' + String(err && err.message).slice(0, 120));   // 聚合失败不得阻断归档
    }
  }
  copy(path.join('out', 'diagnostics', 'measurable.json'), 'measurable.json');
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
  // ★R2-B32：剪枝失败/不剪枝必须给出**明确原因**（不得静默）
  if (!success) {
    result.prune_reason = 'not_success';
  } else if (!isPrunableRunRoot(runRoot, jobId)) {
    result.prune_reason = 'shape_guard(jobId=' + String(jobId) + ')';
  } else {
    try {
      // ★R2-B34（F-T78-1）：装置把 materials/ 置只读（dr-xr-xr-x）⇒ 非 root 下 rmSync 会 ENOTEMPTY。
      //   先递归补写位再删（仅针对本次要删的 run-root 内部，不碰其它路径）。
      makeTreeWritable(runRoot);
      fs.rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      result.pruned = !fs.existsSync(runRoot);
      if (!result.pruned) result.prune_reason = 'rm_residual';
    } catch (err) { result.pruned = false; result.prune_reason = 'rm_failed:' + String(err && err.message).slice(0, 120); }
  }
  logger.info({ jobId, dir, bytes: result.bytes, pruned: result.pruned, prune_reason: result.prune_reason || null }, 'R2-B23：运行证据已归档');
  log.log('RUN_ARCHIVED dir=' + dir + ' bytes=' + result.bytes + ' jobId=' + (jobId === null || jobId === undefined ? 'null' : String(jobId))
    + ' pruned_run_root=' + (result.pruned ? 'yes' : 'no') + (result.pruned ? '' : ' prune_skipped=' + String(result.prune_reason || 'unknown')) + ' files=' + result.files.length);
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
