/**
 * r2b20-export-materials.mjs —— R2-B20：把平台的作业数据导出成**装置能直接吃的物料源目录**（ops CLI 薄壳）。
 *
 * B2 纯搬运：库实现已搬到 `server/src/infrastructure/dsh/materials/materialsExporter.js`（逐行搬入，行为不变）；
 * 本脚本只保留 CLI（参数解析 / DB 护栏 / main），并继续导出原有 9 个名字（测试与调用方 import 路径不变）。
 *
 * 装置契约（scripts/dsh-grader/prepare_materials.py 已核实，本脚本不改装置）：源目录必须含
 *   ① `标准工程包.zip` ② `评分标准.md` ③ `题目描述.md`；学生提交为源目录下的 `*.zip`（文件名即装置 manifest 的 id）。
 *
 * 用法：node scripts/r2b20-export-materials.mjs --assignment <id> --out <dir> [--db-url <url>] [--allow-db <name>] [--allow-prod]
 *      （测试/演练可加 `--uploads-root <dir>` 把 uploads 根重定位到夹具目录）
 * 只读：不写平台 DB、不改 `server/uploads/**`；只写 `--out`。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEVICE_NAMES, EXPORT_MANIFEST_NAME, normalizeExportError, assertExportAuthorized,
  resolveStudentZipName, reroot, resolveSubmissionSource, buildAssignmentMd, exportMaterials,
} from '../src/infrastructure/dsh/materials/materialsExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER = path.resolve(__dirname, '..');

// B2：薄壳继续导出原有 9 个名字（签名/行为不变；测试与调用方仍从本脚本 import）
export {
  DEVICE_NAMES, EXPORT_MANIFEST_NAME, normalizeExportError, assertExportAuthorized,
  resolveStudentZipName, reroot, resolveSubmissionSource, buildAssignmentMd, exportMaterials,
};

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
