/**
 * student/version-files.js —— 版本目录的只读预览（文件树 + 文本内容折叠）。
 *
 * R2-B65：从 controllers/studentController.js（原 391-472 行）原样拆出；过滤规则复用 utils/fileTree.js，
 * 超过 MAX_TEXT_BYTES 折叠为占位提示的文案与阈值不变。
 */

import fs from 'fs';
import path from 'path';
import { buildTree, isIgnored } from '../../../../utils/fileTree.js';
import { submissionDir } from '../../../../utils/projectPaths.js';
import { MAX_TEXT_BYTES } from '../../../../utils/projectArchive.js';

/**
 * 读取版本目录下所有文本文件内容。
 *
 * 复用 fileTree 的过滤规则（跳过 node_modules / 二进制后缀等），
 * 超过 MAX_TEXT_BYTES 的文件折叠为占位提示，避免响应体膨胀。
 *
 * @param {string} dir 版本目录绝对路径
 * @returns {Record<string, string>} 相对路径 → 文件内容
 */
export function readVersionContents(dir) {
  /** @type {Record<string, string>} */
  const contents = {};
  if (!dir || !fs.existsSync(dir)) return contents;

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
      if (!entry.isFile()) continue;
      if (isIgnored(entry.name)) continue;

      try {
        const { size } = fs.statSync(abs);
        if (size > MAX_TEXT_BYTES) {
          contents[relPath] = `// 文件过大（${(size / 1024 / 1024).toFixed(2)} MB），已折叠不予预览`;
          continue;
        }
        contents[relPath] = fs.readFileSync(abs, 'utf-8');
      } catch {
        // 单个文件读失败不影响整体预览
      }
    }
  };

  walk(dir);
  return contents;
}

/**
 * 安全构建文件树，失败返回空数组。
 *
 * @param {string} dir 目录绝对路径
 * @returns {Array<object>} 文件树节点数组
 */
export function buildTreeSafe(dir) {
  try {
    return buildTree(dir, { skipBaseDir: true });
  } catch {
    return [];
  }
}

/**
 * 读取某个版本的文件树与内容。
 *
 * @param {number} questionId 题目 ID
 * @param {number} studentId 学生 ID
 * @param {number} version 版本号
 * @returns {{tree: Array<object>, contents: Record<string, string>}|null} 目录不存在时返回 null
 */
export function readVersionFiles(questionId, studentId, version) {
  if (!Number.isInteger(version) || version < 1) return null;
  let dir;
  try {
    dir = submissionDir(questionId, studentId, version);
  } catch {
    return null;
  }
  if (!fs.existsSync(dir)) return null;
  return { tree: buildTreeSafe(dir), contents: readVersionContents(dir) };
}
