/**
 * legacy-script.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 39-39 · 45-46 · 47-48 · 419-454）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseCheckerResult } from '../../../domain/services/checker/parsers.js';

const execFileAsync = promisify(execFile);

/** 脚本执行超时（毫秒，仅旧脚本沙箱执行 runCheckerScript 使用） */
const SCRIPT_TIMEOUT_MS = 30000;

/** 脚本输出缓冲上限（20MB，防脚本刷屏拖垮进程） */
const SCRIPT_MAX_BUFFER = 20 * 1024 * 1024;

/**
 * 在子进程中沙箱执行旧检查脚本（module.exports = { check(rootDir) }），返回解析后的结果。
 * 超时/异常时抛错（错误信息含 stderr 片段）。
 * @param {string} script 脚本源码
 * @param {string} rootDir 学生/标准工程根目录
 * @returns {Promise<{totalScore: number, items: Array, subjective: Array}>}
 */
export async function runCheckerScript(script, rootDir) {
  const scriptPath = path.join(
    os.tmpdir(),
    'checker-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.cjs',
  );
  fs.writeFileSync(scriptPath, script);
  const runner = [
    'const m = require(' + JSON.stringify(scriptPath) + ');',
    'const rootDir = process.argv[1];',
    'Promise.resolve(m.check(rootDir)).then((result) => {',
    '  process.stdout.write(JSON.stringify(result));',
    '}).catch((err) => { console.error(err && err.stack ? err.stack : String(err)); process.exit(1); });',
  ].join('\n');
  try {
    const { stdout } = await execFileAsync(process.execPath, ['-e', runner, rootDir], {
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: SCRIPT_MAX_BUFFER,
    });
    const result = parseCheckerResult(stdout);
    if (!result) throw new Error('检查脚本输出不是合法结果 JSON');
    return result;
  } catch (err) {
    if (err && err.killed) throw new Error('检查脚本执行超时（' + SCRIPT_TIMEOUT_MS + 'ms）');
    const stderr = String((err && err.stderr) || (err && err.message) || err).slice(0, 500);
    throw new Error('检查脚本执行失败：' + stderr);
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (e) { /* 忽略清理失败 */ }
  }
}
