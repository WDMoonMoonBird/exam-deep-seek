/**
 * materialsExporter.js —— R2-B20 物料导出器的**库实现**（B2 纯搬运：从 ops 脚本 r2b20-export-materials.mjs 逐行搬入）。
 *
 * 装置契约（scripts/dsh-grader/prepare_materials.py 已核实，本模块不改装置）：源目录必须含
 *   ① `标准工程包.zip` ② `评分标准.md` ③ `题目描述.md`；学生提交为源目录下的 `*.zip`（文件名即装置 manifest 的 id）。
 *
 * 只读：不写平台 DB、不改 `server/uploads/**`；只写调用方给的 `outDir`。
 * CLI（参数解析 / DB 护栏 / main）仍在 `server/scripts/` 的 r2b20 薄壳（9 个导出不变）。
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SUBMISSIONS_ROOT, UPLOADS_ROOT, standardDir, hasStandardPackage } from '../../../utils/projectPaths.js';
import { readZipEntries, zipDirectory } from '../../execution/deterministic-zip.js';
import { resolveSnapshot } from '../../../services/assignmentSnapshot.js';

export const DEVICE_NAMES = {
  standard: '标准工程包.zip',
  rubric: '评分标准.md',
  assignment: '题目描述.md',
};
export const EXPORT_MANIFEST_NAME = 'export-manifest.json';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** ★R2-B21（低）：库不可达等连接类错误归一为专用 reason，便于排障（其余仍 `unhandled:<msg>`） */
export function normalizeExportError(err) {
  const msg = String((err && err.message) || err || '');
  const code = String((err && err.code) || '');
  if (code === 'P1001' || code === 'P1002' || code === 'P1000' || code === 'P1017') return 'db_unreachable';
  if (/Can't reach database server|Connection refused|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|connect ETIMEDOUT/i.test(msg)) return 'db_unreachable';
  return 'unhandled:' + msg;
}

/** ★护栏：连接前先判库名（沿用既有 REFUSE_* 口径） */
export function assertExportAuthorized({ dbUrl, allowDb = null, allowProd = false } = {}) {
  let dbName = '';
  try { dbName = new URL(String(dbUrl)).pathname.replace(/^\//, ''); } catch { dbName = ''; }
  if (!dbName) return { ok: false, rc: 2, reason: 'db_url_invalid' };
  if (dbName === 'exam_system_test') return { ok: true, rc: 0, dbName };
  if (!allowDb || allowDb !== dbName) return { ok: false, rc: 2, reason: 'allow_db_required:' + dbName };
  if (!allowProd) return { ok: false, rc: 2, reason: 'allow_prod_required:' + dbName };
  return { ok: true, rc: 0, dbName, prod: true };
}

/** ★命名：主命名 `<real_name>.zip`；重名追加 `-<username>`；仍冲突则再追加序号（确定性） */
export function resolveStudentZipName(realName, username, used = new Set()) {
  const base = (String(realName || '').trim() || String(username || '').trim() || 'unknown');
  const safe = base.replace(/[\\/:*?"<>|]/g, '_');
  let name = safe + '.zip';
  if (!used.has(name)) { used.add(name); return name; }
  const uname = String(username || '').trim() || 'dup';
  name = safe + '-' + uname + '.zip';
  let i = 2;
  while (used.has(name)) { name = safe + '-' + uname + '-' + i + '.zip'; i += 1; }
  used.add(name);
  return name;
}

/** uploads 根重定位（测试/演练用）：把 projectPaths 解析出的绝对路径映射到 override 根下同名相对路径 */
export function reroot(absPath, uploadsRoot) {
  if (!uploadsRoot) return absPath;
  const rel = path.relative(UPLOADS_ROOT, absPath);
  if (rel.startsWith('..')) return absPath;
  return path.join(path.resolve(uploadsRoot), rel);
}

/** 学生提交源目录：优先 SUBMISSIONS_ROOT/<qid>/<sid>/<version>（取字典序最大版本），否则退化为 <qid>/<sid> 本身 */
export function resolveSubmissionSource(questionId, studentId, uploadsRoot = null) {
  const base = reroot(path.join(SUBMISSIONS_ROOT, String(questionId), String(studentId)), uploadsRoot);
  if (!fs.existsSync(base)) return { dir: base, exists: false, files: 0 };
  const subs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (subs.length > 0) {
    const dir = path.join(base, subs[subs.length - 1]);
    return { dir, exists: true, version: subs[subs.length - 1], files: countFiles(dir) };
  }
  return { dir: base, exists: true, files: countFiles(base) };
}

function countFiles(dir) {
  let n = 0;
  const walk = (d) => {
    for (const it of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, it.name);
      if (it.isSymbolicLink()) continue;
      if (it.isDirectory()) walk(abs);
      else if (it.isFile()) n += 1;
    }
  };
  walk(dir);
  return n;
}

/** 题面 markdown（确定性：标题 + material 原文，不做时间戳） */
export function buildAssignmentMd({ title, material }) {
  return '# ' + String(title || '').trim() + '\n\n' + String(material || '').trim() + '\n';
}

/**
 * 核心导出（可注入 prisma，便于测试）。
 *
 * ★OP-1（D1）：开放题（无标准工程包）支持 —— 不再报 standard_package_missing：
 *   · 标准题（有包）路径与产物形状**完全不变**（缺包仍 fail-closed）；
 *   · 开放题跳过「标准工程包.zip」与标准目录检查，其余（评分标准/题目描述/学生 zip）照常导出，
 *     manifest 增 { mode:'open', standard:null }（snapshot.standard_hash='sha256:absent' 如实记录）。
 *   判据：hasStandardPackage()（与 AI 实评/布置确认同源）+ 本次导出根下标准目录实际存在性
 *   （uploadsRoot 重定位/演练夹具时允许标准包位于重定位根内，避免把标准题误判成开放题）。
 * @returns {{ok:true, open:boolean, out:string, n:number, questionId:number, standardSha256:string|null, rubricLen:number, manifest:object} | {ok:false, reason:string}}
 */
export async function exportMaterials({ prisma, assignmentId, outDir, uploadsRoot = null, now = new Date().toISOString() }) {
  try {
    return await exportMaterialsInner({ prisma, assignmentId, outDir, uploadsRoot, now });
  } catch (err) {
    return { ok: false, reason: normalizeExportError(err) };
  }
}

async function exportMaterialsInner({ prisma, assignmentId, outDir, uploadsRoot = null, now = new Date().toISOString() }) {
  const assignment = await prisma.assignment.findUnique({ where: { id: Number(assignmentId) } });
  if (!assignment) return { ok: false, reason: 'assignment_not_found:' + assignmentId };
  const links = await prisma.assignmentQuestion.findMany({ where: { assignmentId: Number(assignmentId) }, select: { questionId: true } });
  const qids = links.map((l) => Number(l.questionId));
  if (qids.length === 0) return { ok: false, reason: 'no_question_bound' };
  const questions = await prisma.question.findMany({ where: { id: { in: qids } } });
  const projects = questions.filter((q) => q.type === 'project');
  if (projects.length !== 1) return { ok: false, reason: 'project_question_not_unique:' + projects.length };
  const question = projects[0];

  // ★R2-B35：物料与**发布冻结快照**同源（snapshot ?? live）——内容指纹 content_key 由快照推导（assignmentSnapshot.resolveSnapshot 同口径）；
  //   导出若取活值，改题后会出现「同一 content_key 对应两种物料」⇒ 复用命中却 stale/needs_rerun（同内容两把尺/两物料）。
  let link = null;
  try {
    link = await prisma.assignmentQuestion.findUnique({
      where: { assignmentId_questionId: { assignmentId: Number(assignmentId), questionId: Number(question.id) } },
      select: { rubricSnapshot: true, materialSnapshot: true, standardHash: true, snapshotOrigin: true },
    });
  } catch { link = null; }
  const snapshot = resolveSnapshot(link, question);

  const stdDir = reroot(standardDir(question.id), uploadsRoot);
  let stdDirPresent = false;
  try { stdDirPresent = fs.existsSync(stdDir) && countFiles(stdDir) > 0; } catch { stdDirPresent = false; }
  // 开放/标准唯一判据（详见函数头）：hasStandardPackage 为 DB/真实根口径；stdDirPresent 兼容上传根重定位
  const stdPackage = hasStandardPackage(question.id, question.attachmentUrl) === true || stdDirPresent;
  const open = !stdPackage;
  if (!open && !stdDirPresent) return { ok: false, reason: 'standard_package_missing:' + stdDir };

  const submissions = await prisma.submission.findMany({
    where: { assignmentId: Number(assignmentId), questionId: question.id },
    select: { id: true, studentId: true },
    orderBy: { id: 'asc' },
  });
  const studentIds = [...new Set(submissions.map((s) => Number(s.studentId)))];
  const users = await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, realName: true, username: true } });
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  fs.mkdirSync(outDir, { recursive: true });
  // 开放题：没有标准工程包 ⇒ 不写标准件（其余文件照常；标准题路径逐字节不变）
  const standardZip = open ? null : zipDirectory(stdDir);
  if (!open) fs.writeFileSync(path.join(outDir, DEVICE_NAMES.standard), standardZip);
  const rubricBuf = Buffer.from(String(snapshot.rubric ?? ''), 'utf8');
  fs.writeFileSync(path.join(outDir, DEVICE_NAMES.rubric), rubricBuf);
  const assignmentBuf = Buffer.from(buildAssignmentMd({ title: question.title, material: snapshot.material }), 'utf8');
  fs.writeFileSync(path.join(outDir, DEVICE_NAMES.assignment), assignmentBuf);

  const used = new Set(Object.values(DEVICE_NAMES));
  const items = [];
  const skipped = [];
  for (const sub of submissions) {
    const u = userById.get(Number(sub.studentId)) || {};
    const src = resolveSubmissionSource(question.id, sub.studentId, uploadsRoot);
    if (!src.exists || src.files === 0) { skipped.push({ submissionId: sub.id, studentId: Number(sub.studentId), reason: 'no_source_files', source: src.dir }); continue; }
    const zipName = resolveStudentZipName(u.realName, u.username, used);
    const buf = zipDirectory(src.dir);
    fs.writeFileSync(path.join(outDir, zipName), buf);
    items.push({
      submissionId: sub.id, studentId: Number(sub.studentId), username: u.username || null, realName: u.realName || null,
      zip: zipName, source: src.dir, sourceVersion: src.version || null, sourceFileCount: src.files,
      sha256: sha256(buf), bytes: buf.length,
    });
  }

  const manifest = {
    schema_version: 'materials-export/1',
    // 仅开放题增字段（标准题 manifest 形状逐字节不变）
    ...(open ? { mode: 'open' } : {}),
    generated_at: now,
    assignment_id: Number(assignmentId),
    assignment_title: assignment.title,
    question_id: Number(question.id),
    question_title: question.title,
    source: { uploads_root: uploadsRoot ? path.resolve(uploadsRoot) : UPLOADS_ROOT, standard_dir: open ? null : stdDir },
    standard: open ? null : { file: DEVICE_NAMES.standard, sha256: sha256(standardZip), bytes: standardZip.length, entries: readZipEntries(standardZip).map((e) => e.name) },
    rubric: { file: DEVICE_NAMES.rubric, sha256: sha256(rubricBuf), chars: rubricBuf.length },
    // ★R2-B35：物料来源（发布冻结快照 vs 活值）——内容指纹口径须与此一致（snapshot ?? live）
    snapshot: { from_snapshot: snapshot.fromSnapshot, origin: snapshot.origin || null, standard_hash: snapshot.standardHash || null, rubric_sha256: snapshot.rubricSha256 || null },
    assignment_doc: { file: DEVICE_NAMES.assignment, sha256: sha256(assignmentBuf), chars: assignmentBuf.length },
    n_submissions: items.length,
    submissions: items,
    skipped,
  };
  fs.writeFileSync(path.join(outDir, EXPORT_MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
  return { ok: true, open, out: outDir, n: items.length, questionId: Number(question.id), standardSha256: open ? null : sha256(standardZip), rubricLen: rubricBuf.length, manifest };
}
