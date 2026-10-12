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
import logger from '../utils/logger.js';

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

/** 回写载荷（审计字段齐备） */
export function buildWriteback({ result, score }) {
  const items = Array.isArray(result?.items) ? result.items : [];
  return {
    aiScore: Number(score),
    aiFeedback: JSON.stringify({
      source: 'dsh-checker',
      checker_id: result?.checker_id ?? null,
      canonical_sha256: result?.canonical_sha256 ?? null,
      max_score: result?.totals?.max_score ?? null,
      aggregate: result?.totals?.aggregate ?? null,
      breakdown: items.map((it) => ({
        item: String(it.id || it.name || '').slice(0, 50),
        score: Number(it.score) || 0,
        maxScore: Number(it.max_score ?? it.maxScore) || 0,
        comment: String(it.comment || it.reason || '').slice(0, 60),
        kind: 'checker',
      })).slice(0, 200),
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

/** 读量尺产物（out/measure/*.json 优先，兼容 out/results/*.json） */
export function listMeasureResults(runRoot) {
  const out = [];
  for (const dir of ['out/measure', 'out/results']) {
    const d = path.join(runRoot, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort()) {
      if (!f.endsWith('.json')) continue;
      if (dir.endsWith('measure') && (f.startsWith('matrix-') || f.startsWith('coverage-'))) continue;
      const p = path.join(d, f);
      try { out.push({ path: p, result: JSON.parse(fs.readFileSync(p, 'utf8')) }); } catch { /* 跳过坏文件 */ }
    }
  }
  return out;
}

/**
 * W6-2：消费量尺产物并（按不写分语义）回写。
 * 返回逐份判定，便于审计；不写分的份给出 needs_rerun 原因。
 */
export async function consumeMeasureResults({ prisma, runRoot, assignmentId = null, dryRun = false }) {
  const rows = [];
  for (const { path: p, result } of listMeasureResults(runRoot)) {
    const unsupported = (result.reconciliation || {}).unsupported || [];
    const decision = decideScoreWrite({ score: result?.totals?.score, stale: result?.stale, unsupported, exitCode: result?.run_meta?.exit_code });
    rows.push({
      submissionId: result?.submission?.id ?? null,
      checkerId: result?.checker_id ?? null,
      canonicalSha256: result?.canonical_sha256 ?? null,
      score: result?.totals?.score ?? null,
      write: decision.write,
      status: decision.status,
      reason: decision.reason,
      source: path.relative(runRoot, p),
    });
    if (decision.write && !dryRun && result?.submission?.id) {
      const subId = Number(result.submission.id);
      if (Number.isFinite(subId)) {
        await prisma.submission.update({ where: { id: subId }, data: buildWriteback({ result, score: decision.score }) });
      }
    }
  }
  const written = rows.filter((r) => r.write).length;
  const skipped = rows.filter((r) => !r.write);
  logger.info({ assignmentId, total: rows.length, written, skipped: skipped.length }, 'W6：量尺产物消费完成');
  return { rows, written, skipped };
}

/** W6-3：重评 = 重跑已入库 checker 的产物（零 LLM）——用同一结果文件重放，回写仍带 checker_id + canonical_sha256 */
export async function regradeWithStoredChecker({ prisma, submissionId, resultPath }) {
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const unsupported = (result.reconciliation || {}).unsupported || [];
  const decision = decideScoreWrite({ score: result?.totals?.score, stale: result?.stale, unsupported, exitCode: result?.run_meta?.exit_code });
  if (!decision.write) {
    return { ok: false, status: decision.status, reason: decision.reason };
  }
  await prisma.submission.update({ where: { id: +submissionId }, data: buildWriteback({ result, score: decision.score }) });
  return { ok: true, checkerId: result?.checker_id ?? null, canonicalSha256: result?.canonical_sha256 ?? null, score: decision.score };
}
