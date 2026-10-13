/**
 * infrastructure/dsh/runs/run-meta.js —— 运行**元信息 / 标准工程包 / JSON 列安全解析**（R2-B65：从 read-model.js 再拆出）。
 *
 * 拆分理由：read-model.js 首版 637 行（>500 观察带），把「与单次运行的元信息装配强相关」的三块下沉到本文件，
 *   使每个文件都在 500 行以内（判据集合中不新增 >500 文件）。纯搬移，无行为变化。
 * ★只读：无任何写路径；快照优先（rubric/material/standard_hash 走发布冻结快照，保证日后改名改标准可还原）。
 */
import fs from 'node:fs';
import path from 'node:path';
import defaultPrisma from '../../../utils/prisma.js';
import { EXPORT_MANIFEST_NAME, MATERIALS_ROOT_ENV, resolveMaterialsForAssignment } from '../materials/dshMaterialsResolver.js';
import { standardPackSha256 } from '../../../utils/snapshotHash.js';
import { readJsonSafe } from './archive-fs.js';

export const parseJsonCol = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : (v === undefined ? null : v); } catch { return null; } };

/** 短 sha（前 12 位 hex）+ 原值；非 hex 形态照原样返回前 12 字符 */
export function shortSha(v) {
  if (!v) return null;
  const s = String(v);
  const hex = s.startsWith('sha256:') ? s.slice(7) : s;
  if (hex === 'absent') return 'absent';
  return hex.slice(0, 12);
}

/** 标准工程包展示块（短 sha + 文件名 + 可折叠 manifest 摘要；不提供下载） */
export function shapeStandardPackage({ question = {}, link = {}, exportManifest = null } = {}) {
  const snapshotHash = link.standardHash || null;
  let sha = snapshotHash;
  let source = snapshotHash ? 'publish_snapshot' : 'unknown';
  if (!sha) {
    try { sha = standardPackSha256(question.id); source = sha === 'sha256:absent' ? 'absent' : 'live_dir'; } catch { sha = null; source = 'unknown'; }
  }
  const fileName = (() => {
    const url = question.attachmentUrl ? String(question.attachmentUrl) : '';
    const base = url ? url.split(/[\\/]/).pop() : '';
    return base || (exportManifest && exportManifest.standard && exportManifest.standard.file) || '标准工程包.zip';
  })();
  const manifest = exportManifest
    ? {
      source: 'export_manifest',
      file: exportManifest.standard && exportManifest.standard.file,
      sha256: exportManifest.standard && exportManifest.standard.sha256,
      bytes: exportManifest.standard && exportManifest.standard.bytes,
      entries: Array.isArray(exportManifest.standard && exportManifest.standard.entries) ? exportManifest.standard.entries.length : null,
      rubric_chars: exportManifest.rubric && exportManifest.rubric.chars,
      assignment_doc_chars: exportManifest.assignment_doc && exportManifest.assignment_doc.chars,
      n_submissions: exportManifest.n_submissions,
      generated_at: exportManifest.generated_at || null,
    }
    : {
      source: 'snapshot',
      standard_hash: sha,
      standard_hash_source: source,
      snapshot_origin: link.snapshotOrigin || null,
      captured_at: (() => { const s = parseJsonCol(link.rubricSnapshot); return (s && s.capturedAt) || null; })(),
      rubric_sha256: (() => { const s = parseJsonCol(link.rubricSnapshot); return (s && s.rubricSha256) || null; })(),
      material_chars: link.materialSnapshot ? String(link.materialSnapshot).length : null,
      rubric_chars: (() => { const s = parseJsonCol(link.rubricSnapshot); return s && s.rubric ? String(s.rubric).length : null; })(),
    };
  return {
    sha256: sha || null,
    short_sha256: shortSha(sha),
    file_name: fileName,
    source,
    download: false, // 明确：不提供下载
    manifest,
  };
}

/** 元信息块：老师 / 班级（全部）/ 作业 / 标准工程包 / 题目描述 / 评分标准（快照优先，保证日后改名改标准可还原） */
export async function loadRunMeta({ assignmentId, archive = null, prisma: prismaClient = defaultPrisma } = {}) {
  const meta = {
    assignment: { id: assignmentId === null || assignmentId === undefined ? null : Number(assignmentId), title: null },
    teacher: null,
    classes: [],
    standard_package: null,
    description: null,
    rubric: null,
    questions: [],
    snapshot: { used: false, origin: null },
    warnings: [],
  };
  if (!assignmentId) { meta.warnings.push('assignment_id_missing'); return meta; }
  try {
    const a = await prismaClient.assignment.findUnique({
      where: { id: Number(assignmentId) },
      select: { id: true, title: true, teacherId: true, startTime: true, endTime: true },
    });
    if (a) {
      meta.assignment.title = a.title;
      try {
        const t = await prismaClient.user.findUnique({ where: { id: Number(a.teacherId) }, select: { id: true, username: true, realName: true } });
        meta.teacher = t ? { id: t.id, name: safeName(t.realName || t.username || ('user-' + t.id)), username: t.username ? safeName(t.username) : null } : null;
      } catch { meta.warnings.push('teacher_lookup_failed'); }
    } else {
      meta.warnings.push('assignment_not_found');
    }
    // 班级（全部：assignment_classes → classes）
    try {
      const links = await prismaClient.assignmentClass.findMany({ where: { assignmentId: Number(assignmentId) }, select: { classId: true } });
      const ids = links.map((x) => Number(x.classId)).filter((n) => Number.isFinite(n));
      if (ids.length) {
        const cls = await prismaClient.class.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, schoolId: true } });
        meta.classes = cls.map((c) => ({ id: c.id, name: c.name || ('class-' + c.id), school_id: c.schoolId ?? null }));
      }
    } catch { meta.warnings.push('classes_lookup_failed'); }
    // 题目 + 发布冻结快照（rubric/material/standard_hash）
    // 导出清单（标准工程包/评分标准/题面 的字节级摘要）：①归档内 ②平台物料根 <materialsRoot>/<assignmentId>/export-manifest.json
    let exportManifest = null;
    if (archive) {
      const exp = readJsonSafe(archive, EXPORT_MANIFEST_NAME);
      if (exp) exportManifest = exp;
    }
    if (!exportManifest) {
      try {
        const root = String(process.env[MATERIALS_ROOT_ENV] || '').trim();
        if (root) {
          const m = resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: Number(assignmentId) });
          const p = m && m.dir ? path.join(String(m.dir), EXPORT_MANIFEST_NAME) : null;
          if (p && fs.existsSync(p)) exportManifest = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch { /* 物料根不可读 ⇒ 回落快照摘要（不影响元信息主体） */ }
    }
    try {
      const links = await prismaClient.assignmentQuestion.findMany({
        where: { assignmentId: Number(assignmentId) },
        select: { questionId: true, rubricSnapshot: true, materialSnapshot: true, standardHash: true, snapshotOrigin: true, sortOrder: true },
        orderBy: { questionId: 'asc' },
      });
      const qids = links.map((l) => Number(l.questionId));
      const qs = qids.length ? await prismaClient.question.findMany({ where: { id: { in: qids } }, select: { id: true, title: true, type: true, material: true, scoringRubric: true, attachmentUrl: true } }) : [];
      const qById = new Map(qs.map((q) => [Number(q.id), q]));
      for (const link of links) {
        const q = qById.get(Number(link.questionId)) || {};
        const snap = parseJsonCol(link.rubricSnapshot);
        const rubricText = (snap && snap.rubric !== undefined && snap.rubric !== null) ? String(snap.rubric) : String(q.scoringRubric || '');
        const materialText = link.materialSnapshot !== null && link.materialSnapshot !== undefined ? String(link.materialSnapshot) : String(q.material || '');
        const std = shapeStandardPackage({ question: q, link, exportManifest });
        meta.questions.push({
          question_id: Number(link.questionId),
          question_title: q.title || null,
          question_type: q.type || null,
          from_snapshot: !!(snap || link.materialSnapshot),
          snapshot_origin: link.snapshotOrigin || null,
          standard_package: std,
          description: { text: materialText, chars: materialText.length, from_snapshot: link.materialSnapshot !== null && link.materialSnapshot !== undefined },
          rubric: { text: rubricText, chars: rubricText.length, from_snapshot: !!(snap && snap.rubric), rubric_sha256: (snap && snap.rubricSha256) || null },
        });
      }
      // 顶层面板取 type=project 的那道（与 r2b20/grading 口径一致）；没有则取第一道
      const primary = meta.questions.find((x) => x.question_type === 'project') || meta.questions[0] || null;
      if (primary) {
        meta.standard_package = primary.standard_package;
        meta.description = primary.description;
        meta.rubric = primary.rubric;
        meta.snapshot = { used: !!primary.from_snapshot, origin: primary.snapshot_origin };
      } else {
        meta.warnings.push('no_question_bound');
      }
    } catch (err) {
      meta.warnings.push('questions_lookup_failed:' + String(err && err.message).slice(0, 80));
    }
  } catch (err) {
    meta.warnings.push('meta_lookup_failed:' + String(err && err.message).slice(0, 80));
  }
  return meta;
}

/** 老师/班级名含邮箱样式时的轻脱敏（保留可读性，去掉域名部分） */
export function safeName(v) {
  const s = String(v || '');
  return s.length > 64 ? s.slice(0, 64) : s;
}
