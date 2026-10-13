/**
 * dshRulerContentKey.js —— R2-B35（P0）：尺子的**内容指纹** content_key（纯函数层，不碰 DB）。
 *
 * 口径（已批准）：
 *   content_key = sha256hex( canonical )   —— 64 位小写十六进制
 *   canonical   = 'standard_sha256=' + norm(standardSha) + '\n'
 *               + 'rubric='          + norm(rubric)      + '\n'
 *               + 'description='     + norm(description)
 *   norm(s)     = 统一换行（CRLF/CR → LF）+ 去首尾空白
 *
 * 三个组成与「装置实际读到的字节」同源（装置侧零注入，本模块只读平台数据/上传目录）：
 *   · 评分标准  = 装置 materials/评分标准.md 的字节 = question.scoringRubric（导出器原文写入，不 trim）
 *                 ⇒ rubric_hash 用 textSha256() 口径（'sha256:'+hex，与 utils/snapshotHash.js / 装置 check.py 同口径）
 *   · 题目描述  = 装置 materials/题目描述.md 的字节 = buildAssignmentDescription()（≡ r2b20 buildAssignmentMd，
 *                 会 trim 标题与材料 ⇒ 绝不能用裸 question.material，否则规范化边界不符）
 *   · 标准包    = 装置 materials/标准工程包.zip 的字节 sha（确定性 zip，见 services/deterministicZip.js）
 *                 ★同源取 zip：标准包目录缺失/为空/不可读 ⇒ **fail-closed**（reason=standard_package_*，
 *                 该作业不参与内容化复用，回落旧的按作业路径）——**禁止**回落 assignment_questions.standard_hash，
 *                 否则同一份内容在「目录在/不在」两种情形下会算出两个 content_key ⇒ 同内容两把尺。
 *
 * ★为什么不用装置侧 standard.extract_digest：那是 dir_sha256(ignore=['node_modules/**','.git/**','dist/**'])，
 *   平台侧不可复算（且与导出 zip 不是同一物）；也不作为内容指纹的一部分，只作为锚点证据（见实施记录）。
 *
 * 复算示例（记录里逐字给出）：
 *   node -e 'const c=require("crypto");const n=s=>String(s??"").replace(/\r\n?/g,"\n").trim();
 *            console.log(c.createHash("sha256").update("standard_sha256="+n(S)+"\n"+"rubric="+n(R)+"\n"+"description="+n(D)).digest("hex"))'
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { zipDirectory } from '../../execution/deterministic-zip.js';
import { dirSha256 } from '../utils/snapshotHash.js';
import { standardDir, UPLOADS_ROOT } from '../utils/projectPaths.js';

/** 规范化的三段拼接口径版本（改口径必须换 key ⇒ 由记录与测试锁定） */
export const RULER_CONTENT_KEY_SCHEMA = 'ruler-content-key/1';
/** content_key 长度（sha256 hex） */
export const CONTENT_KEY_LEN = 64;

/** 统一换行（CRLF/CR → LF）+ 去首尾空白（UTF-8 语义） */
export function normalizeRulerText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

/** sha256 hex（小写，无前缀）。★Buffer/字节数组按**字节**哈希（标准包 zip 就是字节），其余按 UTF-8 文本。 */
export function sha256Hex(value) {
  const buf = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? Buffer.from(value)
    : Buffer.from(String(value ?? ''), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 评分标准哈希（与 utils/snapshotHash.textSha256 同口径：'sha256:'+hex） */
export function rubricContentSha256(rubricText) {
  return 'sha256:' + sha256Hex(String(rubricText ?? ''));
}

/** 题目描述哈希（同上口径，便于审计/对拍） */
export function descriptionContentSha256(descriptionText) {
  return 'sha256:' + sha256Hex(String(descriptionText ?? ''));
}

/**
 * 题目描述全文（≡ server/scripts/r2b20-export-materials.mjs:buildAssignmentMd 的字节）。
 * 刻意与导出脚本同式实现并**由测试逐字节对拍**（不 import 脚本，避免服务层依赖 scripts/）。
 */
export function buildAssignmentDescription({ title, material } = {}) {
  return '# ' + String(title || '').trim() + '\n\n' + String(material || '').trim() + '\n';
}

/** 规范化后的三段拼接（可读、可逐字复算；换行分隔 + 标签前缀 ⇒ 段间边界无歧义） */
export function canonicalContentKeyInput({ standardSha, rubric, description } = {}) {
  return 'standard_sha256=' + normalizeRulerText(standardSha) + '\n'
    + 'rubric=' + normalizeRulerText(rubric) + '\n'
    + 'description=' + normalizeRulerText(description);
}

/** ★content_key = sha256hex(规范化三段) */
export function computeContentKey(input = {}) {
  return sha256Hex(canonicalContentKeyInput(input));
}

/**
 * 复算/审计用解释器：返回 content_key + 规范化串 + 三段原始值与哈希 + 可粘贴的复算命令。
 * 记录（docs/dsh/R2-B35-实施记录.md）里给出的示例即由本函数产出。
 */
export function explainContentKey({ standardSha, rubric, description } = {}) {
  const canonical = canonicalContentKeyInput({ standardSha, rubric, description });
  const contentKey = sha256Hex(canonical);
  const q = (s) => JSON.stringify(String(s ?? ''));
  return {
    schema: RULER_CONTENT_KEY_SCHEMA,
    contentKey,
    canonical,
    parts: {
      standardSha: normalizeRulerText(standardSha),
      rubric: normalizeRulerText(rubric),
      description: normalizeRulerText(description),
      // ★rubricSha256/descriptionSha256 是**装置口径**（原始字节，不规范化）——用于与 checker.assignment_ref.rubric_hash 对拍
      rubricSha256: rubricContentSha256(rubric),
      descriptionSha256: descriptionContentSha256(description),
    },
    recompute: 'printf %s ' + q(canonical) + ' | shasum -a 256',
  };
}

function walkSignature(dir) {
  const h = crypto.createHash('sha256');
  let files = 0;
  const walk = (cur, rel) => {
    let items = [];
    try { items = fs.readdirSync(cur, { withFileTypes: true }); } catch { return; }
    items.sort((a, b) => Buffer.compare(Buffer.from(a.name, 'utf8'), Buffer.from(b.name, 'utf8')));
    for (const it of items) {
      const abs = path.join(cur, it.name);
      const r = rel ? rel + '/' + it.name : it.name;
      if (it.isSymbolicLink()) { h.update('L' + r + '\n'); continue; }
      if (it.isDirectory()) { h.update('D' + r + '\n'); walk(abs, r); continue; }
      let st;
      try { st = fs.statSync(abs); } catch { h.update('U' + r + '\n'); continue; }
      files += 1;
      h.update('F' + r + '\n' + st.size + '\n' + Math.floor(st.mtimeMs) + '\n');
    }
  };
  walk(dir, '');
  return { signature: h.digest('hex'), files };
}

/** 进程内缓存：同一 (questionId, 目录签名) 不重复压缩（HTTP 触发路径在请求内解析指纹，绝不能每次压包） */
const standardZipCache = new Map();
export const STANDARD_ZIP_CACHE_MAX = 32;

/** 仅供测试：清空标准包 zip 指纹缓存 */
export function resetStandardZipCache() {
  standardZipCache.clear();
}

/** 标准包目录（uploads/project-questions/<qid>/standard；uploadsRoot 重定位语义与 r2b20-export-materials.reroot 完全一致：
 *  相对 **UPLOADS_ROOT** 的相对路径挂到 override 根下 ⇒ `--uploads-root` 与 `DSH_GRADER_UPLOADS_ROOT` 同义） */
export function resolveStandardPackageDir(questionId, { uploadsRoot = null } = {}) {
  const dir = standardDir(String(questionId));
  if (!uploadsRoot) return dir;
  const root = path.resolve(uploadsRoot);
  const rel = path.relative(UPLOADS_ROOT, dir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return dir;
  return path.join(root, rel);
}

/** 上传根重定位环境变量（与装置物料根 DSH_GRADER_MATERIALS_ROOT 对称；缺省=平台真实 uploads） */
export const UPLOADS_ROOT_ENV = 'DSH_GRADER_UPLOADS_ROOT';

/** 从 env 解析上传根重定位（空 ⇒ null = 平台真实 uploads/） */
export function resolveUploadsRoot(env = process.env) {
  const v = env && env[UPLOADS_ROOT_ENV] !== undefined ? String(env[UPLOADS_ROOT_ENV]).trim() : '';
  return v || null;
}

/**
 * ★标准包组成（**同源取 zip**，无静默降级）：sha256hex(标准工程包.zip 的字节)。
 * 目录缺失/为空/不可读 ⇒ { ok:false, reason }（调用方 fail-closed：该作业不参与内容化复用）。
 * @returns {{ok:true, sha256:string, dir:string, files:number, bytes?:number, cached?:boolean} | {ok:false, reason:string, dir?:string}}
 */
export function resolveStandardPackageSha256({ questionId, uploadsRoot = null } = {}) {
  if (questionId === undefined || questionId === null || questionId === '') {
    return { ok: false, reason: 'standard_package_missing', dir: null };
  }
  let dir;
  try { dir = resolveStandardPackageDir(questionId, { uploadsRoot }); } catch { return { ok: false, reason: 'standard_package_unreadable', dir: null }; }
  let sig;
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { ok: false, reason: 'standard_package_missing', dir };
    sig = walkSignature(dir);
  } catch { return { ok: false, reason: 'standard_package_unreadable', dir }; }
  if (!sig.files) return { ok: false, reason: 'standard_package_empty', dir };
  const cacheKey = String(questionId) + ':' + sig.signature;
  const hit = standardZipCache.get(cacheKey);
  if (hit) return { ok: true, sha256: hit, dir, files: sig.files, cached: true };
  try {
    const zip = zipDirectory(dir);
    const sha = sha256Hex(zip);
    standardZipCache.set(cacheKey, sha);
    if (standardZipCache.size > STANDARD_ZIP_CACHE_MAX) {
      standardZipCache.delete(standardZipCache.keys().next().value);
    }
    return { ok: true, sha256: sha, dir, files: sig.files, bytes: zip.length };
  } catch {
    return { ok: false, reason: 'standard_package_unreadable', dir };
  }
}

/** 装置口径：按 ignore 列表复算标准包目录摘要（与 validate.py/check.py 的 dir_sha256 同算法，见 utils/snapshotHash） */
export function standardDirDigest(dir, ignore = []) {
  return dirSha256(dir, ignore).digest;
}
