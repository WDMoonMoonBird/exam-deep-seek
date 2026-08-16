/**
 * cleanup-uploads.js — 清理上传目录中的依赖/构建产物/二进制文件
 *
 * 用途：教学批改只关注代码。extractZipSafely 现在落盘时就过滤，
 * 本脚本用于清理历史已落盘的 target/.idea/node_modules/.jar 等文件，
 * 以及上传失败残留的 temp_* 临时目录。
 * 用法: node scripts/cleanup-uploads.js [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isIgnored } from '../src/utils/fileTree.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.resolve(__dirname, '../uploads');
const dryRun = process.argv.includes('--dry-run');
let removedDirs = 0, removedFiles = 0, freedBytes = 0;

function rmDir(dir) {
  let size = 0;
  try { size = fs.statSync(dir).size; } catch {}
  if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });
  removedDirs++;
  freedBytes += size;
  console.log(`  删目录: ${path.relative(UPLOADS, dir)} (${(size / 1024).toFixed(0)}KB)`);
}

function cleanDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (isIgnored(e.name)) { rmDir(full); continue; }
      cleanDir(full); // 递归（target 等可能嵌套）
    } else if (e.isFile()) {
      if (isIgnored(e.name)) {
        let size = 0;
        try { size = fs.statSync(full).size; } catch {}
        if (!dryRun) fs.rmSync(full, { force: true });
        removedFiles++;
        freedBytes += size;
      }
    }
  }
}

const roots = [];
for (const sub of ['project-questions', 'project-submissions', 'projects']) {
  const p = path.join(UPLOADS, sub);
  if (!fs.existsSync(p)) continue;
  for (const id of fs.readdirSync(p)) {
    const idDir = path.join(p, id);
    if (!fs.statSync(idDir).isDirectory()) continue;
    // temp_* 残留直接清
    if (id.startsWith('temp_')) { rmDir(idDir); continue; }
    if (sub === 'projects') continue; // 正式项目工作区不动
    roots.push(idDir);
  }
}
for (const r of roots) cleanDir(r);

console.log(`\n[dry-run=${dryRun}] 清理完成：目录 ${removedDirs} 个，文件 ${removedFiles} 个，释放约 ${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
