/**
 * file-access.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 139-219）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import fs from 'node:fs';
import path from 'node:path';
import { SKIP_DIRS } from '../../domain/services/rule/constants.js';

/**
 * 取文件扩展名（小写，无扩展名返回空串）。
 * @param {string} absPath - 绝对路径
 * @returns {string}
 */
export function extOf(absPath) {
  const name = path.basename(absPath);
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx + 1).toLowerCase();
}

/**
 * 递归收集目录下全部普通文件（跳过隐藏项与 SKIP_DIRS）。
 * @param {string} dir - 绝对目录路径
 * @returns {string[]} 绝对路径列表
 */
export function collectFiles(dir) {
  const out = [];
  const walk = (abs) => {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childAbs = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(childAbs);
      } else if (e.isFile()) {
        out.push(childAbs);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * 把相对路径解析到工程根内；防穿越：path.resolve 后必须位于工程根内（含根自身），否则返回 null。
 * 绝对路径参数（params.path 以 / 开头）会被 path.resolve 直接采用，同样落入越界检查。
 * @param {string} projectRoot - 工程根（resolveProjectRoot 结果）
 * @param {string} relPath - 规则参数里的相对路径
 * @returns {string|null} 合法绝对路径；越界/非法返回 null
 */
export function resolveWithinRoot(projectRoot, relPath) {
  if (typeof relPath !== 'string' || relPath.length === 0) return null;
  const root = path.resolve(projectRoot);
  const abs = path.resolve(root, relPath);
  if (abs === root || abs.startsWith(root + path.sep)) return abs;
  return null;
}

/**
 * 读取 UTF-8 文件内容；失败返回 { ok: false, error }（不抛错）。
 * @param {string} absPath - 绝对路径
 * @returns {{ok: boolean, content?: string, error?: string}}
 */
export function readFileUtf8(absPath) {
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: (err && err.code) || (err && err.message) || String(err) };
  }
}
