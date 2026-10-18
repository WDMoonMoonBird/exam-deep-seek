/**
 * dshMaterialsResolver.js —— R2-B21：**按 job 的 assignmentId** 解析该作业自己的物料目录与提交份数。
 *
 * 背景：上云后生产有多个项目型作业，而装置参数在 **worker 启动时写死**（`--source-dir`/`--submissions` 只有一份全局值）
 *   ⇒ 多作业场景要么永远批改仓库里的 `实验/` 夹具（错料），要么每个作业重启一次 worker（不可行）。
 * 约定：env `DSH_GRADER_MATERIALS_ROOT` 非空时，物料目录 = `<ROOT>/<assignmentId>`；
 *   · 目录**不存在或为空** ⇒ **fail-closed**（不回落装置默认 `实验/`、不写分）；
 *   · 份数优先取该目录 `export-manifest.json` 的 `n_submissions`，缺失时回退「目录内 `*.zip` 数 − 1（标准件）」。
 * 未设该 env ⇒ `mode='device-default'`，行为与既有完全一致（向后兼容）。
 */
import fsBase from 'fs';
import path from 'path';
import { DEVICE_NAMES } from './materialsExporter.js';

export const MATERIALS_ROOT_ENV = 'DSH_GRADER_MATERIALS_ROOT';
export const EXPORT_MANIFEST_NAME = 'export-manifest.json';

/** 解析结果：{ok:true, dir, submissions, source} | {ok:false, reason, dir} | {ok:false, reason:'materials_root_unset', mode:'device-default'} */
export function resolveMaterialsForAssignment({ materialsRoot, assignmentId, fsImpl = fsBase } = {}) {
  const root = String(materialsRoot || '').trim();
  if (!root) return { ok: false, reason: 'materials_root_unset', mode: 'device-default' };
  const dir = path.resolve(root, String(assignmentId));
  let entries = [];
  try {
    if (!fsImpl.existsSync(dir)) return { ok: false, reason: 'materials_missing_for_assignment:' + assignmentId, dir };
    entries = fsImpl.readdirSync(dir);
  } catch {
    return { ok: false, reason: 'materials_missing_for_assignment:' + assignmentId, dir };
  }
  if (!entries || entries.length === 0) return { ok: false, reason: 'materials_missing_for_assignment:' + assignmentId, dir };

  let submissions = null;
  let source = null;
  const manifestPath = path.join(dir, EXPORT_MANIFEST_NAME);
  if (entries.includes(EXPORT_MANIFEST_NAME) && fsImpl.existsSync(manifestPath)) {
    try {
      const man = JSON.parse(fsImpl.readFileSync(manifestPath, 'utf8'));
      const n = Number(man && man.n_submissions);
      if (Number.isFinite(n) && n >= 0) { submissions = n; source = 'manifest'; }
    } catch { /* 坏清单 ⇒ 走 zipcount 回退 */ }
  }
  if (submissions === null) {
    const zipCount = entries.filter((f) => String(f).toLowerCase().endsWith('.zip')).length;
    // ★OP-1：只有存在标准工程包时才减 1（开放题导出的目录没有标准件，固定减 1 会少算一份）
    const hasStandardZip = entries.includes(DEVICE_NAMES.standard);
    submissions = Math.max(0, zipCount - (hasStandardZip ? 1 : 0));
    source = 'zipcount';
  }
  return { ok: true, dir, submissions, source };
}

/** 打印行 */
export function formatMaterialsResolved({ assignmentId, dir, submissions, source }) {
  return 'MATERIALS_RESOLVED assignment=' + assignmentId + ' dir=' + dir + ' submissions=' + submissions + ' source=' + source;
}
export function formatMaterialsMissing({ assignmentId, dir }) {
  return 'MATERIALS_MISSING assignment=' + assignmentId + ' path=' + dir;
}
export function formatMaterialsRoot(value) {
  const v = String(value || '').trim();
  return 'materials_root=' + (v || '(unset:device-default)');
}

const PATH_FLAGS = new Set(['--source-dir', '--submissions']);

/** ★把解析出的物料覆盖进装置参数：先剥掉启动时写死的旧值，再追加（保证「后者生效」且不受装置解析顺序影响） */
export function withMaterialsArgs(args = [], { dir, submissions } = {}) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (PATH_FLAGS.has(a)) { i += 1; continue; }              // 丢弃旧值（含其取值）
    if (typeof a === 'string' && a.startsWith('--source-dir=')) continue;
    if (typeof a === 'string' && a.startsWith('--submissions=')) continue;
    out.push(a);
  }
  if (dir) out.push('--source-dir', String(dir));
  if (submissions !== undefined && submissions !== null) out.push('--submissions', String(submissions));
  return out;
}
