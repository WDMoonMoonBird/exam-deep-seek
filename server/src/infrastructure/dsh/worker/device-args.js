/**
 * worker/device-args.js —— 装置参数改写：--workdir、复用尺子、相对路径绝对化、尺子落位。
 *
 * R2-B65：从 services/dshGradingJobWorker.js（582 行）原样拆出；导出名与语义逐字保留（见 ./index.js barrel）。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** server/ 目录（相对装置参数的次级基准：平台自带脚本如 scripts/stub-device.mjs）
 *  ★R2-B65：本文件下移到 infrastructure/dsh/worker/ ⇒ 上溯层级由 '../..' 调整为 '../../../..'（仍指向 server/）。 */
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** R2-B10②：复用模式常量与装置约定路径（以 scripts/dsh-grader 代码为准：
 *  run.sh 在 measure-only-reuse 下**不清 out/**，并按 --checker 复制到 out/checker/checker.json；
 *  lib_assignment.sh 的作业级流程读 out/assignment/checker.frozen.json。 */
export const REUSE_CHECKER_MODE = 'measure-only-reuse';
export const BUILD_CHECKER_MODE = 'build-and-measure';
export const CHECKER_FROZEN_REL = 'out/assignment/checker.frozen.json';
export const CHECKER_JSON_REL = 'out/checker/checker.json';

/** R2-B12①：把**本次 run-root** 作为 `--workdir` 传给装置。
 *  装置 run.sh 不读 GRADER_RUN_ROOT（未给 --workdir 时自己 mktemp -d）⇒ 产物会落到别处、
 *  frozen 尺子也不在装置的 workdir 里 ⇒ 闸判不合格（exit 5）。本函数剥掉已有 --workdir 再追加本次 run-root。 */
export function withWorkdirArg(args = [], workdir) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workdir') { i++; continue; }
    out.push(args[i]);
  }
  return [...out, '--workdir', String(workdir)];
}

/** 复用模式的装置参数：剥掉已有的 --checker/--checker-mode，再追加复用两项（顺序稳定，便于断言） */
export function withReuseCheckerArgs(args = [], checkerPath) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--checker') { i++; continue; }
    if (args[i] === '--checker-mode') { i++; continue; }
    out.push(args[i]);
  }
  return [...out, '--checker', checkerPath, '--checker-mode', REUSE_CHECKER_MODE];
}

/** 自动造尺模式的装置参数：剥掉已有的 --checker/--checker-mode，再追加 build-and-measure。
 *  背景：run.sh 默认 CHECKER_MODE=per-submission；worker 原参数没有 --checker-mode ⇒ 「无尺则本次造尺」
 *  在真装置上实际走的是 per-submission 流程（永远不会造出作业级尺子）。自动评分 job 必须显式切到 build-and-measure。 */
export function withBuildCheckerArgs(args = []) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--checker') { i++; continue; }
    if (a === '--checker-mode') { i++; continue; }
    if (typeof a === 'string' && a.startsWith('--checker=')) continue;
    if (typeof a === 'string' && a.startsWith('--checker-mode=')) continue;
    out.push(a);
  }
  return [...out, '--checker-mode', BUILD_CHECKER_MODE];
}

/** R2-B11：装置参数里的**相对路径**绝对化（相对仓库根解析；仅当目标确实存在时才替换，避免误改普通值）。
 *  背景：worker 曾未给子进程传 cwd ⇒ 相对路径 `scripts/dsh-grader/run.sh` 在 server/ 下解析失败 ⇒ bash exit 127。
 *  本函数与 cwd 双保险：即使调用方 cwd 不对，脚本路径也不会再解析错。 */
export const DEVICE_PATH_FLAGS = new Set(['--workdir', '--checker', '--source-dir', '--checker-out', '--out', '--manifest']);

export function absolutizeDeviceArgs(args = [], repoRoot, extraBases = [SERVER_DIR]) {
  // 基准顺序：仓库根优先（装置脚本 scripts/dsh-grader/… 以仓库根为准），其次 server/（平台自带脚本 scripts/stub-device.mjs）
  const bases = [path.resolve(repoRoot || process.cwd()), ...extraBases.map((b) => path.resolve(b))];
  const resolveRel = (p) => {
    for (const b of bases) { try { if (fs.existsSync(path.join(b, p))) return path.join(b, p); } catch { /* ignore */ } }
    return null;
  };
  const exists = (p) => resolveRel(p) !== null;
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (DEVICE_PATH_FLAGS.has(a) && i + 1 < args.length) {
      const v = args[i + 1];
      out.push(a, path.isAbsolute(v) ? v : (resolveRel(v) || v));
      i++;
      continue;
    }
    if (!a.startsWith('-') && !path.isAbsolute(a)) { const abs = exists(a) ? resolveRel(a) : null; if (abs) { out.push(abs); continue; } }
    out.push(a);
  }
  return out;
}

/** 把已入库的尺子落位到 run-root（两条路径都写；返回传给 --checker 的路径） */
export function placeCheckerFiles({ runRoot, checkerJson }) {
  const body = typeof checkerJson === 'string' ? checkerJson : JSON.stringify(checkerJson, null, 2);
  const frozen = path.join(runRoot, CHECKER_FROZEN_REL);
  fs.mkdirSync(path.dirname(frozen), { recursive: true });
  fs.writeFileSync(frozen, body);
  const plain = path.join(runRoot, CHECKER_JSON_REL);
  fs.mkdirSync(path.dirname(plain), { recursive: true });
  fs.writeFileSync(plain, body);
  return frozen;
}
