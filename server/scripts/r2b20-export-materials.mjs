/**
 * r2b20-export-materials.mjs —— R2-B20：把平台的作业数据导出成**装置能直接吃的物料源目录**。
 *
 * 装置契约（scripts/dsh-grader/prepare_materials.py 已核实，本脚本不改装置）：源目录必须含
 *   ① `标准工程包.zip` ② `评分标准.md` ③ `题目描述.md`；学生提交为源目录下的 `*.zip`（文件名即装置 manifest 的 id）。
 *
 * 用法：node scripts/r2b20-export-materials.mjs --assignment <id> --out <dir> [--db-url <url>] [--allow-db <name>] [--allow-prod]
 *      （测试/演练可加 `--uploads-root <dir>` 把 uploads 根重定位到夹具目录）
 * 只读：不写平台 DB、不改 `server/uploads/**`；只写 `--out`。
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SUBMISSIONS_ROOT, UPLOADS_ROOT, standardDir } from '../src/utils/projectPaths.js';
import { readZipEntries, zipDirectory } from '../src/services/deterministicZip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER = path.resolve(__dirname, '..');

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
 * @returns {{ok:true, out:string, n:number, questionId:number, standardSha256:string, rubricLen:number, manifest:object} | {ok:false, reason:string}}
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

  const stdDir = reroot(standardDir(question.id), uploadsRoot);
  if (!fs.existsSync(stdDir) || countFiles(stdDir) === 0) return { ok: false, reason: 'standard_package_missing:' + stdDir };

  const submissions = await prisma.submission.findMany({
    where: { assignmentId: Number(assignmentId), questionId: question.id },
    select: { id: true, studentId: true },
    orderBy: { id: 'asc' },
  });
  const studentIds = [...new Set(submissions.map((s) => Number(s.studentId)))];
  const users = await prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, realName: true, username: true } });
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  fs.mkdirSync(outDir, { recursive: true });
  const standardZip = zipDirectory(stdDir);
  fs.writeFileSync(path.join(outDir, DEVICE_NAMES.standard), standardZip);
  const rubricBuf = Buffer.from(String(question.scoringRubric || ''), 'utf8');
  fs.writeFileSync(path.join(outDir, DEVICE_NAMES.rubric), rubricBuf);
  const assignmentBuf = Buffer.from(buildAssignmentMd({ title: question.title, material: question.material }), 'utf8');
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
    generated_at: now,
    assignment_id: Number(assignmentId),
    assignment_title: assignment.title,
    question_id: Number(question.id),
    question_title: question.title,
    source: { uploads_root: uploadsRoot ? path.resolve(uploadsRoot) : UPLOADS_ROOT, standard_dir: stdDir },
    standard: { file: DEVICE_NAMES.standard, sha256: sha256(standardZip), bytes: standardZip.length, entries: readZipEntries(standardZip).map((e) => e.name) },
    rubric: { file: DEVICE_NAMES.rubric, sha256: sha256(rubricBuf), chars: rubricBuf.length },
    assignment_doc: { file: DEVICE_NAMES.assignment, sha256: sha256(assignmentBuf), chars: assignmentBuf.length },
    n_submissions: items.length,
    submissions: items,
    skipped,
  };
  fs.writeFileSync(path.join(outDir, EXPORT_MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
  return { ok: true, out: outDir, n: items.length, questionId: Number(question.id), standardSha256: sha256(standardZip), rubricLen: rubricBuf.length, manifest };
}

// ===== CLI（仅在直接执行时运行）
function parseArgs(argv) {
  const o = { assignment: null, out: null, dbUrl: null, allowDb: null, allowProd: false, uploadsRoot: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--assignment') o.assignment = next();
    else if (a === '--out') o.out = next();
    else if (a === '--db-url') o.dbUrl = next();
    else if (a === '--allow-db') o.allowDb = next();
    else if (a === '--allow-prod') o.allowProd = true;
    else if (a === '--uploads-root') o.uploadsRoot = next();
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log('usage: node scripts/r2b20-export-materials.mjs --assignment <id> --out <dir> [--db-url <url>] [--allow-db <name>] [--allow-prod]'); process.exit(0); }
  if (!opts.assignment || !opts.out) { console.log('EXPORT_FAIL reason=missing_args:need_--assignment_and_--out'); process.exit(2); }
  let dbUrl = opts.dbUrl || process.env.DATABASE_URL;
  if (!dbUrl) {
    try {
      const envText = fs.readFileSync(path.join(SERVER, '.env'), 'utf8');
      const m = envText.match(/^DATABASE_URL=(.*)$/m);
      if (m) dbUrl = m[1].trim();
    } catch { /* ignore */ }
  }
  const auth = assertExportAuthorized({ dbUrl, allowDb: opts.allowDb, allowProd: opts.allowProd });
  if (!auth.ok) { console.log('EXPORT_FAIL reason=' + auth.reason); process.exit(auth.rc); }
  console.log('EXPORT_TARGET db=' + auth.dbName + (auth.prod ? ' prod=yes' : ''));

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const res = await exportMaterials({ prisma, assignmentId: Number(opts.assignment), outDir: path.resolve(opts.out), uploadsRoot: opts.uploadsRoot ? path.resolve(opts.uploadsRoot) : null });
    if (!res.ok) { console.log('EXPORT_FAIL reason=' + res.reason); process.exit(3); }
    console.log('EXPORT_OK n=' + res.n + ' question=' + res.questionId + ' standard_sha256=' + res.standardSha256 + ' rubric_len=' + res.rubricLen + ' out=' + res.out);
    if (res.manifest.skipped.length) console.log('EXPORT_SKIPPED n=' + res.manifest.skipped.length + ' reasons=' + [...new Set(res.manifest.skipped.map((s) => s.reason))].join(','));
    process.exit(0);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedDirectly) {
  main().catch((err) => { console.log('EXPORT_FAIL reason=' + normalizeExportError(err)); process.exit(4); });
}
