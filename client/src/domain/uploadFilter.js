// 上传前过滤依赖/构建产物/二进制，重打包为纯代码 zip（前端路径层过滤，服务端 uploadFilter 权威兜底）

import JSZip from 'jszip';
import { getLanguage } from './fileLang.js';

// ==================== 过滤清单（与服务端 Set 强规则对齐） ====================

/** 忽略目录（依赖/构建产物/IDE 等） */
export const IGNORED_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.idea', '.vscode',
  '.DS_Store', 'venv', '.venv', 'env', '.env', 'build', 'dist',
  'target', '.next', '.nuxt',
  'vendor', 'third_party', 'thirdparty',
  '.gradle', '.dart_tool', '.pytest_cache', '.mypy_cache',
  'Pods', 'DerivedData', 'CMakeFiles', 'conan', '.cache',
]);

/** 忽略扩展名（二进制/编译产物/图片/文档等） */
export const IGNORED_EXTENSIONS = new Set([
  '.class', '.jar', '.war', '.exe', '.dll', '.so', '.dylib',
  '.o', '.obj', '.pyc', '.pyo', '.pyd', '.bin', '.dat',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.db', '.sqlite', '.sqlite3',
]);

/** 单文件内容预览上限：超过折叠为占位（与服务端 MAX_TEXT_BYTES 对齐） */
const MAX_PREVIEW_BYTES = 1024 * 1024;

/** 大文件预览占位 */
export function largeFilePlaceholder(size) {
  return `// 文件过大（${(size / 1024 / 1024).toFixed(2)} MB），已折叠预览\n`;
}

// ==================== zip 条目名智能解码（GBK 兼容） ====================

const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });
const GBK_DECODER = new TextDecoder('gbk');

function robustZipFileName(bytes) {
  try {
    return UTF8_STRICT.decode(bytes);
  } catch {
    return GBK_DECODER.decode(bytes);
  }
}

// ==================== 路径清洗（与服务端 sanitizeSegment 对齐） ====================

function sanitizeZipSegment(seg) {
  let s = String(seg).normalize('NFC');
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\:]/g, '_').replace(/\.+$/g, '').trim();
  return s.length ? s : '_';
}

function sanitizeZipPath(p) {
  return p.split('/').filter(Boolean).map(sanitizeZipSegment).join('/');
}

// ==================== 过滤 + 重打包 ====================

// 过滤并重打包 zip：解析 → 跳过依赖/二进制 → 重打包为纯代码 zip
export async function filterAndRepackZip(file) {
  const zip = await JSZip.loadAsync(file, { decodeFileName: robustZipFileName });
  /** @type {{path:string,name:string,content:Buffer}[]} */
  const kept = [];
  let keptBytes = 0;

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    // AppleDouble 垃圾条目（Mac 压缩残留）跳过；目录条目在树构建时按路径推导
    if (rawPath.startsWith('__MACOSX/') || entry.dir) continue;
    const path = sanitizeZipPath(rawPath);
    if (!path) continue;
    const segs = path.split('/');
    if (segs.some((s) => IGNORED_DIRS.has(s))) continue;
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext && IGNORED_EXTENSIONS.has('.' + ext)) continue;

    // 读真实内容（重打包必需；单个文件大小上限由服务端 200MB 展开预算兜底）
    // 注意：必须用 'uint8array'（浏览器/Node 双环境支持），'nodebuffer' 是 Node 专用，
    // 浏览器会抛 "nodebuffer is not supported by this platform"
    let content;
    try {
      content = await entry.async('uint8array');
    } catch {
      continue; // 损坏条目跳过，不影响整体
    }
    if (!content || content.length === 0) continue; // 空文件不保留（与重打包语义一致）
    keptBytes += content.length;
    kept.push({ path, name: path.split('/').pop(), content });
  }

  // 构建过滤后文件树 + 内容 Map
  const tree = [];
  const dirMap = { '': { children: tree, name: '/', type: 'directory' } };
  const fileContents = new Map();
  const ensureDir = (rel) => {
    if (!rel) return dirMap[''];
    const parts = rel.split('/');
    let parent = dirMap[''];
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(0, i + 1).join('/');
      if (!dirMap[key]) {
        const node = { name: parts[i], path: key, type: 'directory', children: [] };
        parent.children.push(node);
        dirMap[key] = node;
      }
      parent = dirMap[key];
    }
    return parent;
  };
  for (const k of kept) {
    ensureDir(k.path.split('/').slice(0, -1).join('/')).children.push({
      name: k.name,
      path: k.path,
      type: 'file',
      isLeaf: true,
      language: getLanguage(k.path),
    });
    fileContents.set(
      k.path,
      k.content.length > MAX_PREVIEW_BYTES ? largeFilePlaceholder(k.content.length) : new TextDecoder('utf-8').decode(k.content)
    );
  }

  // 重打包纯代码 zip
  const newZip = new JSZip();
  for (const k of kept) newZip.file(k.path, k.content);
  const blob = await newZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const baseName = (file.name || 'project.zip').replace(/\.zip$/i, '');
  return {
    blob,
    name: baseName + '-code.zip',
    tree,
    fileContents,
    keptBytes,
    keptCount: kept.length,
  };
}
