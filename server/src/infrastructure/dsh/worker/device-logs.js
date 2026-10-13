/**
 * worker/device-logs.js —— 装置日志脱敏 / 截断 / 落盘 / 可诊断尾巴。
 *
 * R2-B65：从 services/dshGradingJobWorker.js（582 行）原样拆出；导出名与语义逐字保留（见 ./index.js barrel）。
 */

import fs from 'fs';
import path from 'path';

/** 装置输出的落盘文件名（R2-B13②：失败可诊断，不必手工复现） */
export const DEVICE_LOG_FILES = { stdout: 'out/device.stdout.log', stderr: 'out/device.stderr.log' };

/** 凭据兜底脱敏：任何形如 sk-xxxx 的串都替换为 [redacted:sk-***]（沿用既有 sk- 扫描口径） */
export function redactSecrets(text) {
  return String(text ?? '').replace(/sk-[A-Za-z0-9_-]{6,}/g, '[redacted:sk-***]');
}

/** 只保留尾部 capBytes 字节（避免大日志撑爆磁盘；保留尾部因为错误在末尾） */
export function tailTruncate(text, capBytes = 262144) {
  const s = String(text ?? '');
  if (Buffer.byteLength(s, 'utf8') <= capBytes) return s;
  return '…[truncated head]…' + String.fromCharCode(10) + Buffer.from(s, 'utf8').subarray(-capBytes).toString('utf8');
}

/** ★R2-B13②：把装置 stdout/stderr 落盘到 run-root（out/device.{stdout,stderr}.log），返回路径 */
export function persistDeviceLogs({ runRoot, stdout = '', stderr = '', capBytes = 262144 } = {}) {
  const dir = path.join(runRoot, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const paths = { stdout: path.join(runRoot, DEVICE_LOG_FILES.stdout), stderr: path.join(runRoot, DEVICE_LOG_FILES.stderr) };
  fs.writeFileSync(paths.stdout, tailTruncate(redactSecrets(stdout), capBytes));
  fs.writeFileSync(paths.stderr, tailTruncate(redactSecrets(stderr), capBytes));
  return paths;
}

/** ★R2-B13②：从装置输出提取「可诊断尾巴」（优先 stderr 末 N 行非空行，回退 stdout），供 last_error 使用 */
export function errorTail({ stderr = '', stdout = '', lines = 2, maxChars = 300 } = {}) {
  const pick = (t) => String(redactSecrets(t ?? '')).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(-lines).join(' | ');
  const tail = pick(stderr) || pick(stdout);
  return tail.length > maxChars ? tail.slice(-maxChars) : tail;
}
