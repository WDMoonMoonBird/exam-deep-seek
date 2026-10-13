import fs from 'fs';
import path from 'path';
import { buildTree, isIgnored } from '../../utils/fileTree.js';

/**
 * projectFiles.js — 实训题文件读写共享工具（T03/T04 共用）
 *
 * 学生提交目录 / 标准答案目录结构一致，统一在此提供：
 *   - readProjectTree(dir) → { tree, contents }，供前端双栏预览
 *   - formatProjectFiles(dir) → 拼接为 AI 评分用的字符串
 *
 * 与 fileTree 共用忽略规则（跳过 node_modules / 二进制后缀等），
 * 超大文本文件折叠为占位提示，避免响应体 / AI prompt 膨胀。
 */

export const MAX_TEXT_BYTES = 1024 * 1024;

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.flac',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dll', '.so', '.dylib', '.class',
]);

/**
 * 读取目录下所有文本文件，返回文件树 + 内容映射。
 * 目录不存在或为空时返回 { tree: [], contents: {} }。
 *
 * @param {string} dir 目录绝对路径
 * @returns {{tree: Array, contents: Record<string, string>}}
 */
export function readProjectTree(dir) {
  /** @type {Record<string, string>} */
  const contents = {};
  if (!dir || !fs.existsSync(dir)) return { tree: [], contents };

  const walk = (base, rel = '') => {
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(base, entry.name);
      const relPath = rel + entry.name;
      if (entry.isDirectory()) {
        if (isIgnored(entry.name)) continue;
        walk(abs, relPath + '/');
        continue;
      }
      if (!entry.isFile() || isIgnored(entry.name)) continue;

      try {
        const stat = fs.statSync(abs);
        if (stat.size > MAX_TEXT_BYTES) {
          contents[relPath] = `// 文件过大（${(stat.size / 1024 / 1024).toFixed(2)} MB），已折叠不予预览`;
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXT.has(ext)) {
          contents[relPath] = `// 二进制文件（${ext}），跳过预览`;
          continue;
        }
        contents[relPath] = fs.readFileSync(abs, 'utf-8');
      } catch {
        // 单个文件读失败不影响整体
      }
    }
  };

  walk(dir);

  let tree = [];
  try {
    tree = buildTree(dir, { skipBaseDir: true });
  } catch {
    tree = [];
  }

  return { tree, contents };
}

/**
 * 将目录内文件拼接为 AI 评分用的字符串。
 * 空目录返回 ''。
 *
 * @param {string} dir 目录绝对路径
 * @returns {string}
 */
export function formatProjectFiles(dir) {
  const { contents } = readProjectTree(dir);
  if (!contents || Object.keys(contents).length === 0) return '';
  return Object.entries(contents)
    .map(([p, c]) => `// 文件名: ${p}\n${c}`)
    .join('\n\n');
}
