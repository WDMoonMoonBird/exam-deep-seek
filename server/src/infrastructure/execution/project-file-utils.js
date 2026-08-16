/**
 * project-file-utils —— 项目文件扫描工具（共享于 CompileExecutor / AstAnalyzer）。
 * 等价迁移自 projectGrader.js 工具函数（findSourceFiles / buildFileList）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { isIgnored } from '../../utils/fileTree.js';

/** 递归查找目录中的源文件（等价原 findSourceFiles） */
export function findSourceFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(currentDir, baseDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (isIgnored(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        walk(fullPath, baseDir);
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }

  walk(dir, dir);
  return results;
}

/** 构建文件列表字符串（用于 AI prompt，等价原 buildFileList） */
export function buildFileList(dir) {
  if (!fs.existsSync(dir)) return '(目录不存在)';
  const files = findSourceFiles(dir);
  if (files.length === 0) return '(空目录)';
  const display = files.slice(0, 100);
  let result = display.join('\n');
  if (files.length > 100) result += '\n... 还有 ' + (files.length - 100) + ' 个文件';
  return result;
}