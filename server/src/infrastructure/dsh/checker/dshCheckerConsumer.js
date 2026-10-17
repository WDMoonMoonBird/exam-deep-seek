/**
 * dshCheckerConsumer.js —— R2-B3（W6）平台消费装置产物。
 *
 * 铁律：
 *  1) 校验**复用** scripts/dsh-checker/validate.py 的口径（子进程调用，不另写哈希/校验逻辑）；
 *  2) **不写分语义**：score === null（装置 exit 6 / unsupported）或 stale === true 或 reconciliation.unsupported 非空
 *     ⇒ 一律不写分，并显式标记为 needs_rerun（需重跑/人工）——绝不静默当 0 分或失败分；
 *  3) 回写必须带 checker_id + canonical_sha256 + grading_stale（审计与零 LLM 复用依据）；
 *  4) 重评 = 重跑已入库 checker 的产物（零 LLM），不重新造尺。
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import logger from '../../../utils/logger.js';
import { listMeasureResults, loadGradingResultIndex, normalizeDetailDoc } from './measure-results.js';   // ★R2-B65 破环：产物只读叶子（原在本文件 + dshSummarySession）
// ★R2-B65：下列两个名称的**实现**已下沉到 measure-results.js，此处原样再导出 ⇒ 对外 API 逐字不变。
export { listMeasureResults, loadGradingResultIndex, normalizeDetailDoc };

export const NO_SCORE_STATUS = 'needs_rerun'; // 需重跑/人工（显式呈现，不写分）

/** 解析 validate.py 输出（纯函数，可单测）：VIOLATION 行 + checker_id= + VALID=yes|no */
export function parseValidateOutput(stdout) {
  const lines = String(stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const violations = lines.filter((l) => l.startsWith('VIOLATION ')).map((l) => l.slice('VIOLATION '.length));
  const idLine = lines.find((l) => l.startsWith('checker_id='));
  const validLine = lines.find((l) => l.startsWith('VALID='));
  return {
    checkerId: idLine ? idLine.slice('checker_id='.length) : null,
    valid: validLine ? validLine.slice('VALID='.length) === 'yes' : false,
    violations,
  };
}

/**
 * ★不写分语义（纯函数，R2-B3 的核心判据）：
 * 任一「不合格/不可用/陈旧」信号 ⇒ write=false + needs_rerun，绝不落 0 分或失败分。
 */
export function decideScoreWrite({ score, stale, unsupported, exitCode } = {}) {
  if (Number(exitCode) === 6) return { write: false, status: NO_SCORE_STATUS, reason: 'device_exit_6_unsupported' };
  if (stale === true) return { write: false, status: NO_SCORE_STATUS, reason: 'stale_true' };
  if (Array.isArray(unsupported) && unsupported.length > 0) {
    return { write: false, status: NO_SCORE_STATUS, reason: 'unsupported_items:' + unsupported.length };
  }
  if (score === null || score === undefined) return { write: false, status: NO_SCORE_STATUS, reason: 'score_null' };
  const n = Number(score);
  if (!Number.isFinite(n)) return { write: false, status: NO_SCORE_STATUS, reason: 'score_not_finite' };
  return { write: true, status: 'graded', reason: 'ok', score: n };
}

/** 回写载荷（审计字段齐备）。★status：尺子量完后把提交推进到 ai_graded（已发布/已审核的不降级）。 */
export function buildWriteback({ result, score, previousFeedback = null, currentStatus = null }) {
  const items = Array.isArray(result?.items) ? result.items : [];
  // ★R2-B41：逐项依据（title/status/reason）来自 grading-result 投影；缺失 ⇒ 退化为原 items 的 comment/reason（不崩、不改分）
  const detail = (result && (result.grading_detail || result.detail)) || null;
  const detailItems = Array.isArray(detail && detail.items) ? detail.items : [];
  const detailById = new Map();
  for (const d of detailItems) {
    const k = String((d && (d.id ?? d.name)) ?? '');
    if (k && !detailById.has(k)) detailById.set(k, d);
  }
  // ★F-R2C4-2：ai_score 是 INT 列 ⇒ 小数分会被静默截断。把原始分与取整口径一并写进 aiFeedback，
  // 使 62.5 这类分数可追溯（raw_score=62.5 / score_int=62 / score_rounding=trunc）。
  const rawScore = result?.totals?.score;
  const rawNum = rawScore === null || rawScore === undefined ? null : Number(rawScore);
  const scoreInt = Number.isFinite(Number(score)) ? Math.trunc(Number(score)) : null; // 显式截断（口径见 aiFeedback.score_rounding）
  // ★R2-B48（最高优先兼容点）：本函数**整体重建** ai_feedback（重评路径同样走它）——
  //   若本次没有新总评（无 summaries/超预算/会话失败/坏 JSON），必须把**既有 summary 原样带过来**，否则重评会抹掉总评。
  const prevDoc = (() => {
    const raw = previousFeedback || (result && result.previous_feedback) || null;
    if (!raw) return null;
    try { const d = JSON.parse(String(raw)); return d && typeof d === 'object' ? d : null; } catch { return null; }
  })();
  const summaryOut = (result && result.summary) || (prevDoc && prevDoc.summary) || null;
  // ★最后一公里：原实现只写 aiScore/aiFeedback，不改 status ⇒ 教师端 summary 仍按 submitted 计「待评分」，
  //   实际分数已落库但界面看不见。已审核/已发布的重评不得降级。
  // ★repair-2（A2/C1）：草稿（draft）不是「已提交」状态 ⇒ 不得被 AI 回写推成 ai_graded（否则教师端把未提交算成待审核）。
  //   只保留 reviewed/published/draft；其余（submitted/null/ai_graded）才推进到 ai_graded。
  const KEEP_STATUSES = ['reviewed', 'published', 'draft'];
  const nextStatus = KEEP_STATUSES.includes(currentStatus) ? currentStatus : 'ai_graded';
  return {
    aiScore: scoreInt,
    status: nextStatus,
    aiFeedback: JSON.stringify({
      source: 'dsh-checker',
      raw_score: rawNum,
      raw_max_score: result?.totals?.max_score ?? null,
      score_int: Number.isFinite(scoreInt) ? scoreInt : null,
      score_rounding: 'trunc(ai_score INT 列；原始分见 raw_score)',
      checker_id: result?.checker_id ?? null,
      canonical_sha256: result?.canonical_sha256 ?? null,
      // ★R2-B41：依据来源留痕（审计：分数来源 vs 依据来源；缺失 ⇒ null）
      detail_source: (detail && detail.source) || null,
      detail_items: detailItems.length || 0,
      max_score: result?.totals?.max_score ?? null,
      aggregate: result?.totals?.aggregate ?? null,
      // ★R2-B41：逐项**依据**合并 —— 从装置 grading-result 投影按 item id 取 title/status/reason；
      //   分数/满分**只取原来源**（result.items）⇒ 判定与分数路径零改动。
      breakdown: items.map((it) => {
        const key = String(it?.id || it?.name || '');
        const rich = detailById.get(key) || (detailItems.length === 1 && items.length === 1 ? detailItems[0] : null);
        return {
          item: String(it.id || it.name || '').slice(0, 50),
          title: String((rich && rich.title) || '').slice(0, 80),                     // ★新增：分项名（≤80）
          status: rich && rich.status !== undefined && rich.status !== null ? String(rich.status).slice(0, 24) : null, // ★新增：hit/miss…
          score: Number(it.score) || 0,                                              // ★原来源
          maxScore: Number(it.max_score ?? it.maxScore) || 0,                        // ★原来源
          comment: String((rich && (rich.comment || rich.reason)) || it.comment || it.reason || '').slice(0, 300), // ★上限 60→300（保住「证据: <路径>」）
          kind: 'checker',
        };
      }).slice(0, 200),
      // ★R2-B48：总评（会话内产出；缺失 ⇒ 不写该键 ⇒ 教师页回落旧面板）
      ...(summaryOut ? { summary: summaryOut } : {}),
    }),
    checkerId: result?.checker_id ?? null,
    canonicalSha256: result?.canonical_sha256 ?? null,
    gradingStale: !!result?.stale,
  };
}

/** 定位 checker.json（装置实际落在 out/checker/checker.json，兼容旧布局 out/checker.json） */
export function resolveCheckerPath(runRoot) {
  for (const rel of ['out/checker/checker.json', 'out/checker.json', 'out/assignment/checker.frozen.json']) {
    const p = path.join(runRoot, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 调 validate.py（口径复用；不重写校验） */
export function validateCheckerWithValidatePy(checkerPath, { repoRoot, spawnImpl = spawnSync, python = 'python3' } = {}) {
  const script = path.join(repoRoot, 'scripts', 'dsh-checker', 'validate.py');
  const res = spawnImpl(python, [script, checkerPath], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const parsed = parseValidateOutput(res.stdout);
  return { ...parsed, exitCode: res.status, script };
}

/** W6-1：消费 checker.json ⇒ 入库 grading_checkers（同 checker_id 幂等 upsert） */
export async function consumeChecker({ prisma, runRoot, assignmentId, questionId = null, repoRoot, generatedSessionId = null, spawnImpl }) {
  const checkerPath = resolveCheckerPath(runRoot);
  if (!checkerPath) return { ok: false, reason: 'checker_json_not_found', runRoot };
  const check = validateCheckerWithValidatePy(checkerPath, { repoRoot, spawnImpl });
  if (!check.valid || !check.checkerId) {
    return { ok: false, reason: 'checker_invalid', violations: check.violations, checkerId: check.checkerId };
  }
  const raw = JSON.parse(fs.readFileSync(checkerPath, 'utf8'));
  const ar = raw.assignment_ref || {};
  const row = await prisma.gradingChecker.upsert({
    where: { checkerId: check.checkerId },
    update: { status: 'ready', checkerJson: raw },
    create: {
      checkerId: check.checkerId,
      assignmentId: +assignmentId,
      questionId: questionId != null ? +questionId : null,
      versionHash: check.checkerId, // 与 checker_id 同口径（validate.py 的规范 JSON 哈希）
      rubricHash: String(ar.rubric_hash || ''),
      standardHash: String(ar.standard_hash || ''),
      status: 'ready',
      checkerJson: raw,
      generatedSessionId,
    },
  });
  logger.info({ assignmentId, checkerId: check.checkerId, checkerPath }, 'W6：checker 已入库');
  return { ok: true, checkerId: check.checkerId, storedId: row.id, checkerPath };
}

/**
 * W6-2：消费量尺产物并（按不写分语义）回写。
 * 返回逐份判定，便于审计；不写分的份给出 needs_rerun 原因。
 */
export async function consumeMeasureResults({ prisma, runRoot, assignmentId = null, dryRun = false, submissionIdBySlug = null, logImpl = logger }) {
  // ★F-R2C4-1：slug → 平台提交 id。显式 map 优先；否则从 run-root manifest 派生（装置真实产物命名即 slug）。
  let slugMap = submissionIdBySlug;
  let mapInfo = null;
  if (!slugMap && prisma && assignmentId) {
    mapInfo = await deriveSlugMapFromRunRoot({ prisma, runRoot, assignmentId });
    slugMap = mapInfo.map;
  }
  slugMap = slugMap || {};

  const rows = [];
  let written = 0; // ★只在 update 成功后 +1
  for (const { path: p, result } of listMeasureResults(runRoot)) {
    const slug = result?.submission?.id ?? null;
    const unsupported = (result.reconciliation || {}).unsupported || [];
    const decision = decideScoreWrite({ score: result?.totals?.score, stale: result?.stale, unsupported, exitCode: result?.run_meta?.exit_code });
    const subId = resolveSubmissionId(slug, slugMap);
    const row = {
      submissionSlug: slug,
      submissionId: subId,
      checkerId: result?.checker_id ?? null,
      canonicalSha256: result?.canonical_sha256 ?? null,
      score: result?.totals?.score ?? null,
      write: false,
      status: decision.status,
      reason: decision.reason,
      source: path.relative(runRoot, p),
    };
    if (!decision.write) { rows.push(row); continue; }
    if (subId === null) {
      row.reason = 'unmapped_submission_id:' + slug; // ★未映射 ⇒ needs_rerun（绝不报成功）
      row.status = NO_SCORE_STATUS;
      rows.push(row);
      continue;
    }
    if (dryRun) { row.reason = 'dry_run'; rows.push(row); continue; }
    try {
      // ★R2-B48：读-改-写——取既有 ai_feedback 传入，保证「本次没有新总评」时**既有 summary 不被抹掉**
      let previousFeedback = null;
      let currentStatus = null;
      try {
        const prev = await prisma.submission.findUnique({ where: { id: subId }, select: { aiFeedback: true, status: true } });
        previousFeedback = (prev && prev.aiFeedback) || null;
        currentStatus = (prev && prev.status) || null;
      } catch { previousFeedback = null; currentStatus = null; }
      await prisma.submission.update({ where: { id: subId }, data: buildWriteback({ result, score: decision.score, previousFeedback, currentStatus }) });
      row.write = true;
      written += 1;
    } catch (err) {
      row.reason = 'update_failed:' + (err && err.message);
      row.status = NO_SCORE_STATUS;
    }
    rows.push(row);
  }
  const skipped = rows.filter((r) => !r.write);
  logImpl.info(
    { assignmentId, total: rows.length, written, skipped: skipped.length, map_reason: (mapInfo && mapInfo.reason) || (submissionIdBySlug ? 'explicit_map' : 'none'), unmatched: (mapInfo && mapInfo.unmatched && mapInfo.unmatched.length) || 0 },
    'W6：量尺产物消费完成（written=实际写入行数）');
  return { rows, written, skipped, mapInfo };
}

/** W6-3：重评 = 重跑已入库 checker 的产物（零 LLM）——用同一结果文件重放，回写仍带 checker_id + canonical_sha256 */
export async function regradeWithStoredChecker({ prisma, submissionId, resultPath }) {
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const unsupported = (result.reconciliation || {}).unsupported || [];
  const decision = decideScoreWrite({ score: result?.totals?.score, stale: result?.stale, unsupported, exitCode: result?.run_meta?.exit_code });
  if (!decision.write) {
    return { ok: false, status: decision.status, reason: decision.reason };
  }
  let currentStatus = null;
  try {
    const prev = await prisma.submission.findUnique({ where: { id: +submissionId }, select: { status: true } });
    currentStatus = (prev && prev.status) || null;
  } catch { currentStatus = null; }
  await prisma.submission.update({ where: { id: +submissionId }, data: buildWriteback({ result, score: decision.score, currentStatus }) });
  return { ok: true, checkerId: result?.checker_id ?? null, canonicalSha256: result?.canonical_sha256 ?? null, score: decision.score };
}

/** 解析真实产物里的 submission.id：显式映射优先，其次有限数字（stub/平台 id 命名） */
export function resolveSubmissionId(slug, submissionIdBySlug = {}) {
  const key = String(slug);
  if (submissionIdBySlug && Object.prototype.hasOwnProperty.call(submissionIdBySlug, key)) {
    const v = Number(submissionIdBySlug[key]);
    return Number.isFinite(v) ? v : null;
  }
  const direct = Number(key);
  return Number.isFinite(direct) ? direct : null;
}

/**
 * 从 run-root manifest 派生 slug→平台提交 id 映射（★F-R2C4-1）：
 *  manifest submissions[].id 是源目录名（如「丁静45」）；与平台 students 对齐优先级：
 *  realName 精确 → username 精确 → 源 id 以 realName 开头且候选唯一。
 *  歧义/未命中一律留空 ⇒ 消费时记 needs_rerun/unmapped_submission_id:<slug>（绝不假成功）。
 */
export function matchSlugToSubmissions({ manifestSubmissions = [], platformSubmissions = [] } = {}) {
  const map = {};
  const unmatched = [];
  const used = new Set();
  for (const s of manifestSubmissions) {
    const slug = String(s && s.slug ? s.slug : "");
    const srcId = String(s && s.id ? s.id : "");
    let hit = null;
    const cands = platformSubmissions.filter((ps) => !used.has(ps.id));
    hit = cands.find((ps) => ps.realName && ps.realName === srcId) || null;
    if (!hit) hit = cands.find((ps) => ps.username && ps.username === srcId) || null;
    if (!hit && srcId) {
      const prefix = cands.filter((ps) => ps.realName && srcId.startsWith(ps.realName));
      if (prefix.length === 1) hit = prefix[0];
    }
    if (hit) { map[slug] = hit.id; used.add(hit.id); } else { unmatched.push({ slug, id: srcId }); }
  }
  return { map, unmatched };
}

/** 读 run-root manifest + 平台提交，返回 { map, unmatched, reason } */
export async function deriveSlugMapFromRunRoot({ prisma, runRoot, assignmentId }) {
  try {
    // ★R2-B14③：锚点缺失时回退读装置**两种模式都会写**的 materials/materials-manifest.json
    //   （其 submissions[].id 同样是「源目录名/学生名」⇒ 可沿用 matchSlugToSubmissions 对齐）；
    //   两者皆缺 ⇒ 仍 manifest_missing（fail-closed，不猜）。
    const manifestPath = path.join(runRoot, "out", "assignment", "assignment-manifest.json");
    const materialsPath = path.join(runRoot, "materials", "materials-manifest.json");
    let manifest = null;
    let reason = "manifest";
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } else if (fs.existsSync(materialsPath)) {
      manifest = JSON.parse(fs.readFileSync(materialsPath, "utf8"));
      reason = "materials_manifest";
    } else {
      return { map: {}, unmatched: [], reason: "manifest_missing" };
    }
    const subs = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId },
      select: { id: true, student: { select: { username: true, realName: true } } },
      orderBy: { id: "asc" },
    });
    const platform = subs.map((s) => ({ id: s.id, username: (s.student && s.student.username) || "", realName: (s.student && s.student.realName) || "" }));
    return Object.assign(matchSlugToSubmissions({ manifestSubmissions: manifest.submissions || [], platformSubmissions: platform }), { reason });
  } catch (err) {
    return { map: {}, unmatched: [], reason: "manifest_error:" + (err && err.message) };
  }
}
