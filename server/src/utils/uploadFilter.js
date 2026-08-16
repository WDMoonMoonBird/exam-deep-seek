/**
 * uploadFilter.js — 统一上传过滤引擎（教学批改只落代码文件）
 *
 * 三层识别：
 *   1. Set 强规则层   — fileTree.js 的 IGNORED_DIRS（主流生态目录）/ IGNORED_EXTENSIONS（二进制扩展名）
 *   2. ignore 规则层  — server/config/upload-ignore.rules（可选，gitignore 语法，如 vendor/、*.exe）
 *   3. 内容层         — magic-bytes.js 魔数识别已知二进制格式；不确定时 8KB 采样 NUL 比例兜底
 *
 * 解压端（projectArchive.extractZipSafely）与读取端共用：
 *   路径层判断用 shouldIgnorePath，内容层判断用 isBinaryContent，
 *   解压端组合用 shouldIgnorePathWithContent。依赖/构建产物/二进制文件不落盘。
 *
 * 边界：
 *   - 规则文件不存在/读取失败 → loadIgnoreRules 返回 null（不抛错），Set 强规则兜底，系统照常工作
 *   - magic-bytes 对文本（UTF-8 的 .java/.js 等）返回空数组；对 tiny buffer 也可能命中魔数
 *     （如 2 字节 MZ 即返回 exe）——统一交 NUL 兜底裁决（纯文本无 NUL，不会被误杀）
 *   - 内容检测只采样前 8KB，不得全量扫描
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ignore from 'ignore';
import { filetypeinfo } from 'magic-bytes.js';
import { IGNORED_DIRS, IGNORED_EXTENSIONS } from '../utils/fileTree.js';

// ==================== 内容层常量 ====================

/** 内容检测采样字节数：只取文件头 8KB，不扫描全量 */
const SAMPLE_BYTES = 8192;

/** NUL 字节比例阈值：8KB 内占比 > 0.05%（约 4 个 NUL）即判二进制（迁移自 projectArchive.js 旧 isBinaryContent） */
const NUL_RATIO_THRESHOLD = 0.0005;

/**
 * magic-bytes.js 可能命中的文本类格式：这些签名命中不算"明确二进制"，
 * 交给 NUL 兜底（文本源码几乎无 NUL，不会被误杀）。
 * 其余命中（zip/jar/class/ELF/exe/图片/音频/归档等）一律视为二进制。
 */
const TEXT_LIKE_MAGIC_TYPES = new Set([
  'xml', 'SVG', 'Json', 'txt', 'rtf', 'ps', 'SubRip', 'WebVTT', 'EML',
]);

// ==================== ignore 规则层 ====================

/** 规则文件固定路径：server/config/upload-ignore.rules（相对本模块解析，与 cwd 无关） */
const RULES_FILE = fileURLToPath(new URL('../../config/upload-ignore.rules', import.meta.url));

/** 规则缓存 TTL：60s 内不重复读盘（含 null 结果，避免文件缺失时反复 stat） */
const RULES_TTL_MS = 60_000;

let _rulesCache = null; // { matcher: object|null, loadedAt: number }

/**
 * 读取并编译 upload-ignore.rules（gitignore 语法）为 ignore matcher。
 * 文件不存在或读取失败返回 null（不抛错），由 Set 强规则兜底。
 * 模块级缓存 + 60s TTL。
 *
 * @returns {import('ignore').Ignore|null} 编译后的 matcher；无规则文件时为 null
 */
export function loadIgnoreRules() {
  const now = Date.now();
  if (_rulesCache && now - _rulesCache.loadedAt < RULES_TTL_MS) {
    return _rulesCache.matcher;
  }
  try {
    const text = fs.readFileSync(RULES_FILE, 'utf8');
    const matcher = ignore().add(text);
    _rulesCache = { matcher, loadedAt: now };
    return matcher;
  } catch {
    // 文件不存在 / 读取失败：不抛错，Set 强规则兜底
    _rulesCache = { matcher: null, loadedAt: now };
    return null;
  }
}

// ==================== 路径层判断 ====================

/**
 * 路径层判断：任一路径段命中 IGNORED_DIRS → true；
 * 任一路径段扩展名命中 IGNORED_EXTENSIONS → true；
 * ignore 规则 matcher 存在且 .ignores(relPath) → true。
 *
 * @param {string} relPath 相对路径（zip 内路径或磁盘相对路径，'/' 或 '\\' 分隔均可）
 * @returns {boolean}
 */
export function shouldIgnorePath(relPath) {
  if (!relPath) return false;
  const normalized = String(relPath).replace(/\\/g, '/');
  const segs = normalized.split('/');
  for (const seg of segs) {
    // 空段（目录条目尾 '/'）不参与判断
    if (!seg) continue;
    if (IGNORED_DIRS.has(seg)) return true;
    const segExt = path.extname(seg).toLowerCase();
    if (IGNORED_EXTENSIONS.has(segExt)) return true;
  }
  const matcher = loadIgnoreRules();
  if (matcher && matcher.ignores(normalized)) return true;
  return false;
}

// ==================== 内容层判断 ====================

/** 计算 8KB 采样内 NUL 字节占比 */
function nulRatio(sample) {
  let nulCount = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nulCount++;
  }
  return nulCount / sample.length;
}

/**
 * 内容层判断：先魔数识别，再 NUL 兜底。
 *   - magic-bytes 明确命中非文本二进制格式（zip/jar/class/executable/image/archive 等）→ true
 *   - 命中文本类格式或未命中（文本源码、tiny buffer）→ 不视为二进制，走 NUL 兜底
 *   - UTF-16/32 BOM（FF FE / FE FF）开头：magic-bytes 会把 BOM 误报为 class 等二进制，
 *     且中文 UTF-16 无 NUL，须跳过魔数直接走 NUL 兜底，与旧逻辑行为一致
 *
 * @param {Buffer|Uint8Array} content 文件内容（只采样前 8KB）
 * @returns {boolean}
 */
export function isBinaryContent(content) {
  if (!content || content.length === 0) return false;
  const sample = content.subarray(0, Math.min(content.length, SAMPLE_BYTES));

  // UTF-16/32 BOM：跳过魔数（避免误报 class/executable），直接 NUL 兜底
  const head = sample[0];
  if (head === 0xff || head === 0xfe) {
    return nulRatio(sample) > NUL_RATIO_THRESHOLD;
  }

  const detected = filetypeinfo(sample);
  if (detected.length > 0) {
    const hasBinaryHit = detected.some((t) => !TEXT_LIKE_MAGIC_TYPES.has(t.typename));
    if (hasBinaryHit) return true;
  }
  // 不确定（文本类/未命中）→ NUL 兜底
  return nulRatio(sample) > NUL_RATIO_THRESHOLD;
}

// ==================== 组合判断 ====================

/**
 * 组合判断（供解压端使用）：路径层 || 内容层。
 *
 * @param {string} relPath 相对路径
 * @param {Buffer|Uint8Array} content 文件内容
 * @returns {boolean}
 */
export function shouldIgnorePathWithContent(relPath, content) {
  return shouldIgnorePath(relPath) || isBinaryContent(content);
}
