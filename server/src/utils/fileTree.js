/**
 * fileTree.js — 递归目录遍历工具
 *
 * 功能：
 * - buildTree(rootPath) → 同步递归读目录返回 FileTreeNode[] 树形JSON
 * - getLanguageByExt(filename) → 根据文件后缀返回 Monaco 语言ID
 * - FILTER_IGNORED → 目录名/文件后缀过滤列表
 */

import fs from 'fs';
import path from 'path';

// ==================== 过滤规则 ====================

/** 需要跳过的目录名
 * 主流生态 + 跨生态通用依赖/构建产物语义（vendor/deps/obj/Pods/.gradle 等），
 * 不依赖具体生态清单；二进制内容由 uploadFilter.isBinaryContent 在解压层兜底识别。
 * 注意：lib/packages 等可能存放源码的目录不在此列，避免误伤。
 * 导出供 uploadFilter.js 统一上传过滤引擎引用（Set 强规则层）。
 */
export const IGNORED_DIRS = new Set([
  // 主流生态（dist/out 已移至规则文件根锚定 /dist/ /out/，避免 src/dist 等源码目录误伤；
  // build/target 为构建产物强信号，接受任意深度，见 E 终审权衡）
  'node_modules', '.git', '__pycache__', '.idea', '.vscode',
  '.DS_Store', 'venv', '.venv', 'env', '.env', 'build',
  'target', '.next', '.nuxt',
  // 跨生态通用语义（依赖/第三方/缓存/中间产物）
  // 注意：deps/external/caches/artifacts/out/dist/obj/Debug/Release 等通用词可能命中源码
  // 包名（如 src/external、lib/debug），一律不放入 Set 强规则（E 终审实证误伤），
  // 由规则文件根锚定（/out/ /dist/ 等）+ 内容层处理
  'vendor', 'third_party', 'thirdparty',
  '.gradle', '.dart_tool', '.pytest_cache', '.mypy_cache',
  'Pods', 'DerivedData', 'CMakeFiles', 'conan', '.cache',
]);

/** 需要跳过的文件后缀（二进制/编译产物）；导出供 uploadFilter.js 引用 */
export const IGNORED_EXTENSIONS = new Set([
  '.class', '.jar', '.war', '.exe', '.dll', '.so', '.dylib',
  '.o', '.obj', '.pyc', '.pyo', '.pyd', '.bin', '.dat',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.db', '.sqlite', '.sqlite3',
]);

/** 组合过滤：对外暴露的过滤判断函数 */
export function isIgnored(entryName) {
  const ext = path.extname(entryName).toLowerCase();
  return IGNORED_DIRS.has(entryName) || IGNORED_EXTENSIONS.has(ext);
}

/** 需要跳过的目录名列表（用于外部引用） */
export const FILTER_IGNORED = [...IGNORED_DIRS];

// ==================== 文件后缀 → 语言映射 ====================

const EXT_TO_LANG = {
  '.java':      'java',
  '.py':        'python',
  '.js':        'javascript',
  '.jsx':       'javascript',
  '.mjs':       'javascript',
  '.ts':        'typescript',
  '.tsx':       'typescript',
  '.cpp':       'cpp',
  '.cc':        'cpp',
  '.cxx':       'cpp',
  '.c':         'c',
  '.h':         'c',
  '.hpp':       'cpp',
  '.cs':        'csharp',
  '.go':        'go',
  '.rs':        'rust',
  '.rb':        'ruby',
  '.php':       'php',
  '.swift':     'swift',
  '.kt':        'kotlin',
  '.scala':     'scala',
  '.html':      'html',
  '.jsp':       'html',
  '.jspx':      'html',
  '.htm':       'html',
  '.css':       'css',
  '.scss':      'scss',
  '.less':      'less',
  '.json':      'json',
  '.xml':       'xml',
  '.yml':       'yaml',
  '.yaml':      'yaml',
  '.md':        'markdown',
  '.markdown':  'markdown',
  '.sql':       'sql',
  '.sh':        'shell',
  '.bash':      'shell',
  '.properties': 'ini',
  '.gradle':    'groovy',
  '.cfg':       'ini',
  '.ini':       'ini',
  '.txt':       'plaintext',
  '.gitignore': 'plaintext',
  '.dockerfile':'dockerfile',
};

/**
 * 根据文件名获取 Monaco Editor 语言 ID
 * @param {string} filename - 文件名（如 "App.java"）
 * @returns {string} Monaco 语言 ID
 */
export function getLanguageByExt(filename) {
  const ext = '.' + filename.split('.').pop().toLowerCase();
  return EXT_TO_LANG[ext] || 'plaintext';
}

// ==================== 树构建 ====================

/**
 * 同步递归读取目录，构建文件树 JSON
 * @param {string} dirPath - 目录绝对路径
 * @param {string} basePath - 用于计算相对路径的基准（首次调用时与 dirPath 相同）
 * @returns {Array<{name: string, type: 'file'|'directory', path: string, language?: string, size?: number, children?: Array}>}
 */
function readDirRecursive(dirPath, basePath) {
  /** @type {Array} */
  const result = [];

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    // 目录不存在或无权限，返回空
    return result;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(basePath, fullPath).replace(/\\/g, '/');

    // 跳过被过滤的目录/文件
    if (IGNORED_DIRS.has(entry.name)) continue;
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORED_EXTENSIONS.has(ext)) continue;
    }

    if (entry.isDirectory()) {
      const children = readDirRecursive(fullPath, basePath);
      result.push({
        name: entry.name,
        type: 'directory',
        path: relPath,
        children: children.length > 0 ? children : [],
      });
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = fs.statSync(fullPath).size;
      } catch {
        // 忽略 stat 失败
      }
      result.push({
        name: entry.name,
        type: 'file',
        path: relPath,
        language: getLanguageByExt(entry.name),
        size,
      });
    }
    // 不处理 symlink 等其他类型
  }

  // 排序：目录在前，文件在后；同类按名称排序
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

/**
 * 构建文件树
 * @param {string} rootPath - 根目录绝对路径
 * @param {object} [options]
 * @param {boolean} [options.skipBaseDir] - 是否跳过根目录本身，直接返回子节点
 * @returns {Array<{name: string, type: 'file'|'directory', path: string, language?: string, size?: number, children?: Array}>}
 */
export function buildTree(rootPath, options = {}) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return [];
  }

  const stat = fs.statSync(rootPath);
  if (!stat.isDirectory()) {
    // 如果是文件，返回单个节点
    return [{
      name: path.basename(rootPath),
      type: 'file',
      path: '',
      language: getLanguageByExt(rootPath),
      size: stat.size,
    }];
  }

  if (options.skipBaseDir) {
    return readDirRecursive(rootPath, rootPath);
  }

  // 返回包含根目录的树
  const children = readDirRecursive(rootPath, rootPath);
  return [{
    name: path.basename(rootPath),
    type: 'directory',
    path: '',
    children,
  }];
}

/**
 * 递归展开文件树为扁平列表
 * @param {Array} tree - buildTree 返回的树形结构
 * @returns {Array<{name: string, type: string, path: string, language?: string, size?: number, parentPath?: string}>}
 */
export function flattenTree(tree) {
  /** @type {Array} */
  const result = [];
  function walk(nodes, parentPath) {
    for (const node of nodes) {
      const flat = {
        name: node.name,
        type: node.type,
        path: node.path,
        language: node.language || null,
        size: node.size || null,
        parentPath: parentPath || null,
      };
      result.push(flat);
      if (node.children && node.children.length > 0) {
        walk(node.children, node.path);
      }
    }
  }
  walk(tree, null);
  return result;
}
