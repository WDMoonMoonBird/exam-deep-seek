import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

/** 文本文件预览体积上限，超过折叠为占位提示（与 studentController 共用） */
export const MAX_TEXT_BYTES = 1024 * 1024;

const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });

/** GBK 解码器单例缓存；null 表示尚未初始化（见 getGbkDecoder） */
let _gbkDecoder = null;

/**
 * 惰性获取 GBK 解码器，带 latin1 回退。
 *
 * 【为何必须惰性】Node 若以 small-icu（默认最小构建）编译，`new TextDecoder('gbk')`
 * 会抛 RangeError。原实现在模块顶层实例化，导致 import 期直接崩溃、整个服务起不来。
 * 改为首次真正需要 GBK 解码时才实例化，并在不支持时降级为 latin1，
 * 使 small-icu 环境下模块可正常加载（GBK 名退化为 latin1，语义与原兜底一致）。
 *
 * 结果被缓存，后续调用零开销。
 *
 * @returns {TextDecoder} GBK 解码器；small-icu 环境下为 latin1 解码器
 */
function getGbkDecoder() {
  if (_gbkDecoder) return _gbkDecoder;
  try {
    _gbkDecoder = new TextDecoder('gbk');
  } catch {
    // small-icu 构建不含 gbk 编码表，降级为 latin1（始终可用，且不抛错）
    _gbkDecoder = new TextDecoder('latin1');
  }
  return _gbkDecoder;
}

/**
 * 智能解码 zip 条目原始文件名字节：先 UTF-8 严格（合法 UTF-8 包/带 0x0800 标志位），
 * 失败（Windows 中文版 GBK 打包、未置标志位）回退 GBK，再失败兜底 latin1，保证不抛错。
 *
 * @param {Buffer} buf zip 条目原始文件名字节（adm-zip 的 entry.rawEntryName）
 * @returns {string}
 */
export function decodeEntryName(buf) {
  try { return UTF8_STRICT.decode(buf); }
  catch { try { return getGbkDecoder().decode(buf); } catch { return buf.toString('latin1'); } }
}

/**
 * 文件名分段清洗：NFC 规范化 + 去除控制字符/NUL + 路径分隔符转义 + 去尾部点与首尾空白。
 * 不改变语义，仅保证落盘文件名各 OS 下安全、可重建。
 *
 * 【前导点必须保留】：`.git` / `.env` / `.vscode` / `.idea` 等隐藏目录名依赖前导点，
 * fileTree.js 的 IGNORED_DIRS 按目录原名过滤。若清洗掉前导点（`.git`→`git`），
 * 过滤规则将失配，导致 .git 内容乃至密钥文件进入文件树与 AI 评分 prompt 外泄。
 *
 * @param {string} seg 单个路径分段
 * @returns {string}
 */
export function sanitizeSegment(seg) {
  let s = seg.normalize('NFC');
  s = s.replace(/[\u0000-\u001f\u007f]/g, '');   // 控制字符与 DEL
  s = s.replace(/[\\/]/g, '_');                  // 路径分隔符转义，防穿越
  s = s.replace(/\.+$/g, '');                    // 仅去尾部点（Windows file. / file..），【保留前导点】以维持 .git/.env 等隐藏名
  s = s.trim();                                  // 去首尾空白
  if (s === '.' || s === '..') s = '_';          // 防御：纯点段不可作路径段
  return s.length ? s : '_';
}

/**
 * 安全解压内存 zip 到目标目录（R7：版本目录隔离由调用方负责）。
 * 逐 entry 做路径穿越校验，含穿越则整包拒收并抛错。
 *
 * 文件名编码：不再直接用 adm-zip 已按默认 utf-8 解码的 entryName
 * （无 UTF-8 标志位的 GBK 包会被解成 U+FFFD 并写坏落盘文件名），
 * 改为取 entry.rawEntryName 原始字节后走 decodeEntryName 智能解码
 * （UTF-8 严格 → GBK 兜底 → latin1），再逐段 sanitizeSegment 清洗。
 *
 * @param {Buffer} buffer 压缩包二进制
 * @param {string} targetDir 绝对路径，应来自 projectPaths.submissionDir
 * @returns {{fileCount:number, byteSize:number}}
 */
export function extractZipSafely(buffer, targetDir) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('压缩包为空');
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  let fileCount = 0;
  let byteSize = 0;

  for (const entry of entries) {
    const decoded = decodeEntryName(entry.rawEntryName).replace(/\\/g, '/');
    const rel = decoded.split('/').map(sanitizeSegment).join('/');
    if (decoded.endsWith('/')) {
      // 目录项仅校验，不单独落盘（文件写入时自动建父目录）
      // 校验用未清洗的 decoded，保证 '..' 段仍被识别并整包拒收
      if (decoded.split('/').some((s) => s === '..')) throw new Error('压缩包内容非法');
      continue;
    }
    // 穿越校验基于未清洗的 decoded，避免清洗把 '..' 变成 '_' 后校验失效（整包拒收语义不变）
    const segs = decoded.split('/');
    if (segs.some((s) => s === '..' || s === '')) {
      throw new Error('Path traversal denied');
    }
    const abs = path.resolve(targetDir, rel);
    if (abs !== targetDir && !abs.startsWith(targetDir + path.sep)) {
      throw new Error('Path traversal denied');
    }
    const content = entry.getData();
    if (content && content.length) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      fileCount += 1;
      byteSize += content.length;
    }
  }

  if (fileCount === 0) throw new Error('压缩包内没有可读文件');
  return { fileCount, byteSize };
}

/**
 * 解码上传包原始文件名（zip 包名，非内部文件名）。
 * busboy/multer 通常已给出可读字符串，这里只做去空白与长度截断，
 * 避免对已是 UTF-8 的名字二次转码造成乱码。
 */
export function decodeUploadName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().slice(0, 200);
}
