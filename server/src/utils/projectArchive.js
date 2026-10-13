import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { shouldIgnorePath, shouldIgnorePathWithContent } from '../utils/uploadFilter.js';

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

/** 上传包校验上限 */
const MAX_ZIP_FILE_COUNT = 2000;                  // 解压后文件数上限
const MAX_ZIP_EXPANDED_BYTES = 200 * 1024 * 1024; // 解压总展开大小上限 200MB（防 zip 炸弹）
const MAX_ZIP_DIR_DEPTH = 20;                     // 目录层级上限（路径 segments 数）

/**
 * 判断 zip 条目是否为 Unix 符号链接（符号链接条目跳过，不写盘）。
 *
 * ZIP 外部文件属性（externalAttr，即 adm-zip 的 entry.header.attr）高 16 位为
 * Unix 文件模式；类型位 S_IFMT = 0xF000，符号链接 S_IFLNK = 0xA000。
 * adm-zip 对 symlink 的表现为 entry.isDirectory() === false 且 getData() 返回
 * 链接目标路径字符串——若不识别，会把目标路径当普通文件内容落盘。
 * 普通文件类型位 0x8000、目录 0x4000，均不会误判为符号链接。
 *
 * @param {object} entry adm-zip 条目
 * @returns {boolean} 是否为符号链接
 */
function isSymlinkEntry(entry) {
  const mode = (entry.header.attr >>> 16) & 0xffff;
  return (mode & 0xf000) === 0xa000;
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
 * 上传包校验：解压前先做预算统计（文件数 ≤ 2000 / 展开大小 ≤ 200MB /
 * 目录层级 ≤ 20），超限整包拒收且不写任何文件；符号链接条目跳过不写盘。
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

  // ★O-C4-1（t16）：非 zip / 损坏压缩包 —— adm-zip 会抛出内部文案
  //   （如 "Invalid or unsupported zip format. No END header found"），该文案不得外泄到客户端。
  //   统一转成可读的客户端错误：调用方按 '压缩包' 前缀映射为 400 +「压缩包内容非法」。
  let zip;
  let entries;
  try {
    zip = new AdmZip(buffer);
    entries = zip.getEntries();
  } catch {
    throw new Error('压缩包内容非法');
  }

  // ---- 预算校验：解压前先遍历全部条目统计，超限整包拒收（不写任何文件）----
  // 统计口径：目录条目不落盘、不计文件数与展开大小；符号链接跳过不占预算；
  // 展开大小以中央目录声明的未压缩大小 header.size 为准（解压前唯一依据）。
  let budgetFileCount = 0;
  let budgetBytes = 0;
  let maxDepth = 0;
  for (const entry of entries) {
    if (isSymlinkEntry(entry)) continue;
    const decoded = decodeEntryName(entry.rawEntryName).replace(/\\/g, '/');
    // 穿越检查前置（与解压循环一致）：ignore 包对含 '..' 的非规范路径会抛 RangeError（Node 22），
    // 必须先于 shouldIgnorePath 拦截，保证 Zip-Slip 整包拒收语义
    const segsClean = decoded.split('/').filter(Boolean);
    if (segsClean.some((s) => s === '..')) throw new Error('Path traversal denied');
    // 预算只统计"将落盘"的条目：依赖/构建产物/二进制（shouldIgnorePath 命中）不计入，
    // 与解压过滤一致——大项目带 node_modules 也不会被预算误拒（前端已过滤重打包，此为兜底）
    if (shouldIgnorePath(decoded)) continue;
    const depth = decoded.split('/').filter(Boolean).length;
    if (depth > maxDepth) maxDepth = depth;
    if (decoded.endsWith('/')) continue; // 目录条目不计文件数与大小
    budgetFileCount += 1;
    budgetBytes += entry.header.size || 0;
  }
  if (budgetFileCount > MAX_ZIP_FILE_COUNT) throw new Error('压缩包文件数超过上限（2000）');
  if (budgetBytes > MAX_ZIP_EXPANDED_BYTES) throw new Error('压缩包过大（解压后超过 200MB）');
  if (maxDepth > MAX_ZIP_DIR_DEPTH) throw new Error('压缩包目录层级超过上限（20）');

  let fileCount = 0;
  let byteSize = 0;
  const MAX_EXPANDED_BYTES = 200 * 1024 * 1024; // 与预算一致：写盘时按实际字节二次限流（防声明大小欺骗）

  for (const entry of entries) {
    // 符号链接条目跳过，不写盘（避免把链接目标路径字符串当文件内容落盘）
    if (isSymlinkEntry(entry)) continue;
    const decoded = decodeEntryName(entry.rawEntryName).replace(/\\/g, '/');
    // 穿越校验基于未清洗的 decoded，避免清洗把 '..' 变成 '_' 后校验失效（整包拒收语义不变）
    // 注意：目录条目尾部 '/' 会产生空段（'demo/' → ['demo','']），空段不算穿越；文件条目保留原空段检查
    const segs = decoded.split('/');
    const segsClean = segs.filter(Boolean);
    if (segsClean.some((s) => s === '..')) {
      throw new Error('Path traversal denied');
    }
    if (!decoded.endsWith('/') && segs.some((s) => s === '')) {
      throw new Error('Path traversal denied');
    }
    // 教学批改只关注代码：统一上传过滤引擎路径层（Set 强规则 + ignore 规则文件），
    // 跳过依赖/构建产物目录与二进制扩展名（node_modules、.git、target、.idea、.jar/.class/.png 等），
    // 与读取端 buildTree/isIgnored 规则一致，磁盘只落代码文件
    if (shouldIgnorePath(decoded)) continue;
    const rel = decoded.split('/').map(sanitizeSegment).join('/');
    // 清洗后复检（E 终审建议 C）：node_modules. / env. 等会被清洗成被忽略名，防止绕过
    if (shouldIgnorePath(rel)) continue;
    if (decoded.endsWith('/')) {
      // 目录项仅校验，不单独落盘（文件写入时自动建父目录）
      continue;
    }
    const abs = path.resolve(targetDir, rel);
    if (abs !== targetDir && !abs.startsWith(targetDir + path.sep)) {
      throw new Error('Path traversal denied');
    }
    // 同 O-C4-1：条目数据损坏（deflate 流非法等）也绝不能把 adm-zip 内部文案抛给客户端；
    // 穿越/清理类校验在此行之前已完成，故此处异常一律视为「压缩包内容非法」。
    let content;
    try {
      content = entry.getData();
    } catch {
      throw new Error('压缩包内容非法');
    }
    // 内容层检测（魔数 + NUL 兜底，跨生态依赖识别）：文本源码才落盘，二进制依赖无论扩展名一律跳过
    if (shouldIgnorePathWithContent(decoded, content)) continue;
    // 空文件也必须写盘并计数：Buffer.byteLength === 0 的文件同样落盘，不能因 content.length === 0 被丢弃
    if (content) {
      byteSize += content.length;
      // 写盘前按实际解压字节二次限流（E 终审建议 H）：header.size 声明可被恶意包欺骗
      if (byteSize > MAX_EXPANDED_BYTES) throw new Error('压缩包过大（实际解压超过 200MB）');
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      fileCount += 1;
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
