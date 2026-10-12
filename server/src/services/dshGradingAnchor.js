/**
 * dshGradingAnchor.js —— R2-B14/B16：作业锚点（assignment-manifest + checker 原始字节）的持久化 / 回填。
 *
 * 背景：复用（measure-only-reuse）的 run-root 缺 out/assignment/assignment-manifest.json ⇒ 装置 ASSIGNMENT_FROZEN_SHA256=na 且消费侧映射失败；
 *   而「只存 JSON 再序列化回填」会破坏**字节级**冻结一致性 ⇒ 装置 frozen_intact 判 tampered ⇒ exit 3（R2-B16）。
 * 因此：①入库持久化 anchor_json（语义）+ checker_raw（字节，ingest 时 out/checker/checker.json 的原始内容）；
 *      ②回填时**原样写出 raw 字节**（不序列化），manifest 的 frozen_sha256 保持锚点原值；
 *      ③历史行无 raw ⇒ **拒绝回填**（reason=raw_bytes_unavailable，不写任何文件），让装置按既有行为自行重建。
 * 存储读写走**原始 SQL**（不依赖 Prisma Client 的模型生成）。
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const ASSIGNMENT_MANIFEST_REL = 'out/assignment/assignment-manifest.json';
export const MATERIALS_MANIFEST_REL = 'materials/materials-manifest.json';
export const CHECKER_FROZEN_REL = 'out/assignment/checker.frozen.json';
export const CHECKER_JSON_REL = 'out/checker/checker.json';

const sha256Of = (buf) => 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');

/** 读 run-root 的锚点素材：assignment-manifest（语义）+ checker 原始字节（字节级） */
export function readAnchorFromRunRoot(runRoot) {
  const manifestPath = path.join(runRoot, ASSIGNMENT_MANIFEST_REL);
  const materialsPath = path.join(runRoot, MATERIALS_MANIFEST_REL);
  const checkerCandidates = [path.join(runRoot, CHECKER_JSON_REL), path.join(runRoot, CHECKER_FROZEN_REL)];
  let anchor = null;
  let materials = null;
  try { if (fs.existsSync(manifestPath)) anchor = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { anchor = null; }
  try { if (fs.existsSync(materialsPath)) materials = JSON.parse(fs.readFileSync(materialsPath, 'utf8')); } catch { materials = null; }
  const checkerRawPath = checkerCandidates.find((p) => fs.existsSync(p)) || null;
  const checkerRaw = checkerRawPath ? fs.readFileSync(checkerRawPath) : null;
  const materialsBuf = fs.existsSync(materialsPath) ? fs.readFileSync(materialsPath) : null;
  const submissions = (anchor && anchor.submissions) || (materials && materials.submissions) || [];
  return {
    anchor, materials, checkerRaw, checkerRawPath,
    checkerRawSha256: checkerRaw ? sha256Of(checkerRaw) : null,
    frozenSha256: (anchor && anchor.frozen_sha256) || (checkerRaw ? sha256Of(checkerRaw) : null),
    materialsManifestDigest: materialsBuf ? sha256Of(materialsBuf) : null,
    nSubmissions: submissions.length,
    submissions,
  };
}

function hasRaw(prisma) { return !!(prisma && typeof prisma.$executeRawUnsafe === 'function' && typeof prisma.$queryRawUnsafe === 'function'); }

/** ★R2-B14①/B16②：入库时持久化锚点（语义 + checker 原始字节；upsert 幂等） */
export async function persistAnchor({ prisma, assignmentId, checkerId, runRoot }) {
  const info = readAnchorFromRunRoot(runRoot);
  if (!info.anchor && !info.materials) return { persisted: false, reason: 'no_manifest_in_run_root' };
  if (!hasRaw(prisma)) return { persisted: false, reason: 'anchor_store_unavailable' };
  const anchorJson = info.anchor || {
    schema_version: 'assignment-manifest/1', assignment_id: +assignmentId, checker_id: checkerId,
    frozen_sha256: info.frozenSha256, materials_manifest_digest: info.materialsManifestDigest,
    n_submissions: info.nSubmissions, submissions: info.submissions, derived_from: 'materials_manifest',
  };
  await prisma.$executeRawUnsafe(
    'INSERT INTO grading_assignment_anchors (assignment_id, checker_id, frozen_sha256, materials_manifest_digest, n_submissions, submissions_json, anchor_json, checker_raw, created_at, updated_at) '
    + 'VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)) '
    + 'ON DUPLICATE KEY UPDATE frozen_sha256 = VALUES(frozen_sha256), materials_manifest_digest = VALUES(materials_manifest_digest), '
    + 'n_submissions = VALUES(n_submissions), submissions_json = VALUES(submissions_json), anchor_json = VALUES(anchor_json), '
    + 'checker_raw = COALESCE(VALUES(checker_raw), checker_raw), updated_at = CURRENT_TIMESTAMP(3)',
    +assignmentId, checkerId, info.frozenSha256 || null, info.materialsManifestDigest || null, info.nSubmissions,
    JSON.stringify(info.submissions), JSON.stringify(anchorJson), info.checkerRaw || null,
  );
  return {
    persisted: true, frozenSha256: info.frozenSha256, nSubmissions: info.nSubmissions,
    rawBytes: info.checkerRaw ? info.checkerRaw.length : 0, rawSha256: info.checkerRawSha256,
  };
}

/**
 * ★R2-B14②/B16③④：把持久化锚点回填到 run-root。
 *  - 有 raw：写 out/checker/checker.json + out/assignment/checker.frozen.json（**原始字节**）+ manifest（frozen_sha256 保持锚点原值）；
 *  - 无 raw（历史行）：**不写任何文件**，返回 materialized:false reason=raw_bytes_unavailable（装置自行重建，避免 exit 3）。
 */
export async function materializeAnchor({ prisma, assignmentId, checkerId, runRoot }) {
  if (!hasRaw(prisma)) return { materialized: false, reason: 'anchor_store_unavailable' };
  let rows = [];
  try {
    rows = await prisma.$queryRawUnsafe(
      'SELECT anchor_json, frozen_sha256, n_submissions, checker_raw FROM grading_assignment_anchors WHERE assignment_id = ? AND checker_id = ? LIMIT 1',
      +assignmentId, checkerId,
    );
  } catch { rows = []; }
  const row = rows && rows[0];
  if (!row) return { materialized: false, reason: 'no_persisted_anchor' };
  const rawBuf = row.checker_raw ? Buffer.from(row.checker_raw) : null;
  if (!rawBuf || rawBuf.length === 0) {
    return { materialized: false, reason: 'raw_bytes_unavailable' }; // 历史锚点：绝不半成品回填
  }
  const anchorJson = typeof row.anchor_json === 'string' ? JSON.parse(row.anchor_json) : row.anchor_json;
  const frozenTarget = path.join(runRoot, CHECKER_FROZEN_REL);
  fs.mkdirSync(path.dirname(frozenTarget), { recursive: true });
  fs.writeFileSync(frozenTarget, rawBuf);
  const plainTarget = path.join(runRoot, CHECKER_JSON_REL);
  fs.mkdirSync(path.dirname(plainTarget), { recursive: true });
  fs.writeFileSync(plainTarget, rawBuf);
  const manifestTarget = path.join(runRoot, ASSIGNMENT_MANIFEST_REL);
  fs.mkdirSync(path.dirname(manifestTarget), { recursive: true });
  fs.writeFileSync(manifestTarget, JSON.stringify(anchorJson, null, 2));
  const writtenSha = sha256Of(fs.readFileSync(plainTarget));
  return {
    materialized: true, target: manifestTarget, frozenPath: frozenTarget,
    bytes: rawBuf.length, sha256: writtenSha,
    frozenSha256: row.frozen_sha256, nSubmissions: Number(row.n_submissions),
    shaMatchesAnchor: writtenSha === row.frozen_sha256,
  };
}

/** 读回已持久化的锚点行（供测试/诊断；不存在返回 null） */
export async function loadAnchor({ prisma, assignmentId, checkerId }) {
  if (!hasRaw(prisma)) return null;
  const rows = await prisma.$queryRawUnsafe(
    'SELECT assignment_id, checker_id, frozen_sha256, materials_manifest_digest, n_submissions, submissions_json, anchor_json, checker_raw FROM grading_assignment_anchors WHERE assignment_id = ? AND checker_id = ? LIMIT 1',
    +assignmentId, checkerId,
  );
  const row = rows && rows[0];
  if (!row) return null;
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const raw = row.checker_raw ? Buffer.from(row.checker_raw) : null;
  return {
    assignmentId: Number(row.assignment_id), checkerId: row.checker_id,
    frozenSha256: row.frozen_sha256, materialsManifestDigest: row.materials_manifest_digest,
    nSubmissions: Number(row.n_submissions), submissionsJson: parse(row.submissions_json), anchorJson: parse(row.anchor_json),
    checkerRawBytes: raw ? raw.length : 0, checkerRawSha256: raw ? sha256Of(raw) : null, checkerRaw: raw,
  };
}
