/**
 * project-tree-read.js — 实训题版本目录读取（标准包 + 学生版本）
 *
 * B1 行为不变拆分：自 services/projectGrading.js 原样搬出（:90-125 readDirFiles / :129-153 readFileSafe + readKeptFiles）。
 * readFileSafe / readKeptFiles 原为模块私有，拆分后在本模块内 export（仅同层调用方 project-grading-context 使用），逻辑逐字未改。
 */
import fs from 'fs';
import path from 'path';
import { MAX_TEXT_BYTES } from '../../utils/projectArchive.js';
import { isIgnored } from '../../utils/fileTree.js';

// ===================== 文件收集（标准包 + 学生版本） =====================

export function readDirFiles(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const walk = (base, rel = '') => {
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnored(entry.name)) continue;
        walk(path.join(base, entry.name), rel + entry.name + '/');
      } else if (entry.isFile()) {
        if (isIgnored(entry.name)) continue;
        const abs = path.join(base, entry.name);
        const relPath = rel + entry.name;
        try {
          const { size } = fs.statSync(abs);
          if (size > MAX_TEXT_BYTES) {
            out.push(`// 文件过大（${relPath}，${(size / 1024 / 1024).toFixed(2)} MB），已跳过评分内容`);
            continue;
          }
          out.push(`// 文件名: ${relPath}\n${fs.readFileSync(abs, 'utf-8')}`);
        } catch {
          // 单个文件读取失败不影响整体
        }
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * 读取单个文件内容（不抛错；失败返回空字符串）。
 */
export function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * 按 kept 列表读取文件正文（fold 折叠为占位行），与实评 readDirFiles 的格式保持一致。
 * @param {Array<{path, fold, size}>} kept filterProjectFiles 的 kept 输出（仅文件）
 * @param {string} base 根目录绝对路径
 * @returns {string}
 */
export function readKeptFiles(kept, base) {
  return kept
    .filter(f => !f.dir)
    .map(f => (f.fold
      ? "// 文件过大（" + f.path + "，" + (f.size / 1024 / 1024).toFixed(2) + " MB），已跳过评分内容"
      : "// 文件名: " + f.path + "\n" + readFileSafe(path.join(base, f.path))))
    .join('\n\n');
}
