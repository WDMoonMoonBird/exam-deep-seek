/**
 * autoBuildSession.js —— 自动造尺 job 的「会话准备」三件事（从 run-once.js 拆出；纯函数块，不改行为）：
 *   1) ensureMaterialsForAssignment：与 ops 的 r2b20 同源导出该作业物料（tmp → rename；失败 fail-closed）；
 *   2) logSessionScope：SESSION_SCOPE（作业/教师/班级）可审计日志；
 *   3) alignJobCheckerId：job.checker_id 从 '__AUTO_BUILD__' 哨兵对齐到真实尺子（重试一次）。
 *
 * 拆分依据：A1 t1 审查（refactor-request.md）建议的拆分点；run-once 主链路（finalizeRunRoot/persistJobRun 顺序）
 * 不动 —— 有测试读 run-once.js 源码文本断言该顺序（见 w51/w55）。
 */
import fs from 'fs';
import path from 'path';
import { exportMaterials } from '../materials/materialsExporter.js';
import { formatSessionScope } from './autoBuild.js';

/** 装置契约要求的三件套（与 infrastructure/dsh/materials/materialsExporter.js 的 DEVICE_NAMES 同源） */
export const MATERIALS_REQUIRED_FILES = ['标准工程包.zip', '评分标准.md', '题目描述.md'];
/** 强制重导出开关（重新发布作业后使用） */
export const REEXPORT_ENV = 'DSH_GRADER_MATERIALS_REEXPORT';

/** 物料目录是否已可用（存在 + 非空 + 三件套齐全；与 resolveMaterialsForAssignment 的 fail-closed 口径一致） */
export function materialsDirReady(dir, fsImpl = fs) {
  try {
    if (!fsImpl.existsSync(dir)) return false;
    const entries = fsImpl.readdirSync(dir);
    if (!entries || entries.length === 0) return false;
    return MATERIALS_REQUIRED_FILES.every((name) => entries.includes(name));
  } catch { return false; }
}

/**
 * 自动造尺前置：把该作业的物料导出到 <materialsRoot>/<assignmentId>（先写 tmp 目录，再 rename 换位）。
 *
 * 背景：worker 原流程只「解析」已有物料目录，遇到全新作业必然 materials_missing ⇒ fail-closed。
 * 用户流程要求「截止后自动为该作业造尺」，所以自动造尺 job 必须能自己从平台数据导出物料。
 * 导出内容与 ops 脚本 r2b20 完全同源（发布冻结快照 + 确定性 zip），保证 content_key 与装置读到的字节一致。
 *
 * 边界（F4）：
 *   · 只由自动造尺 job 调用（run-once 里 autoBuild 分支）——普通/复用 job 的既有语义（物料必须先由运维导出）不变；
 *   · 目标目录**已存在且三件套齐全** ⇒ 跳过（不覆盖运维已导出件）；重新发布作业后设
 *     DSH_GRADER_MATERIALS_REEXPORT=1 强制重导出；
 *   · 导出失败 ⇒ 返回 ok:false，调用方 fail-closed（job needs_rerun，不写分）；
 *   · rename 前把旧目录改名备份、成功后删除备份（Windows/跨设备不可 rename 时的失败也能回滚）。
 */
export async function ensureMaterialsForAssignment({ prisma, materialsRoot, assignmentId, jobId, log = console, force = false } = {}) {
  const root = String(materialsRoot || '').trim();
  if (!root) return { ok: true, skipped: 'materials_root_unset' };
  const outDir = path.resolve(root, String(assignmentId));
  const logFn = (line) => { try { (log.info || log.log || (() => {}))(line); } catch { /* ignore */ } };
  // 兼容老测试/精简 fake prisma：没有 assignment/question/submission/user 能力 ⇒ 不导出，走既有 materials_missing 语义
  const canExport = !!(prisma
    && prisma.assignment && typeof prisma.assignment.findUnique === 'function'
    && prisma.assignmentQuestion && typeof prisma.assignmentQuestion.findMany === 'function'
    && prisma.question && typeof prisma.question.findMany === 'function'
    && prisma.submission && typeof prisma.submission.findMany === 'function'
    && prisma.user && typeof prisma.user.findMany === 'function');
  if (!canExport) return { ok: true, skipped: 'prisma_capability_missing', dir: outDir };
  if (!force && materialsDirReady(outDir)) {
    logFn('MATERIALS_PREEXISTING assignment=' + assignmentId + ' dir=' + outDir + '（已存在完整物料，跳过导出）');
    return { ok: true, skipped: 'preexisting', dir: outDir };
  }
  const stamp = jobId + '-' + Date.now();
  const tmpDir = outDir + '.tmp-' + stamp;
  const bakDir = outDir + '.bak-' + stamp;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const exp = await exportMaterials({ prisma, assignmentId, outDir: tmpDir });
    if (!exp.ok) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return { ok: false, reason: exp.reason || 'export_failed' };
    }
    fs.mkdirSync(path.dirname(outDir), { recursive: true });
    let backedUp = false;
    if (fs.existsSync(outDir)) {
      fs.rmSync(bakDir, { recursive: true, force: true });
      fs.renameSync(outDir, bakDir);
      backedUp = true;
    }
    try {
      fs.renameSync(tmpDir, outDir);
    } catch (err) {
      if (backedUp) { try { fs.renameSync(bakDir, outDir); } catch { /* 回滚失败：保留 tmp/bak 现场供排障 */ } }
      throw err;
    }
    if (backedUp) { try { fs.rmSync(bakDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    logFn('MATERIALS_EXPORTED assignment=' + assignmentId + ' n=' + exp.n + ' question=' + exp.questionId + ' out=' + outDir + (backedUp ? ' replaced=yes' : ''));
    return { ok: true, dir: outDir, n: exp.n, questionId: exp.questionId };
  } catch (err) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return { ok: false, reason: 'export_failed:' + String((err && err.message) || err).slice(0, 160) };
  }
}

/**
 * 日志：本次会话归属（教师/班级/作业）—— 满足「该会话全权负责该老师该班级该作业」的可审计性（F7）。
 * 统一走 autoBuild.formatSessionScope（单一事实源，避免日志格式分叉）。
 */
export async function logSessionScope({ prisma, job, log = console } = {}) {
  try {
    if (!prisma || !prisma.assignment || typeof prisma.assignment.findUnique !== 'function') return;
    const a = await prisma.assignment.findUnique({
      where: { id: job.assignmentId },
      select: { teacherId: true, title: true, assignmentClasses: { select: { classId: true } } },
    });
    if (!a) return;
    const classIds = (a.assignmentClasses || []).map((x) => x.classId);
    const line = formatSessionScope({ assignmentId: job.assignmentId, teacherId: a.teacherId, classIds, title: a.title }) + ' job=' + job.id;
    (log.info || log.log || (() => {}))(line);
  } catch { /* 作用域日志失败不影响批改 */ }
}

/**
 * 把自动 job 的 checker_id 从哨兵对齐到真实尺子（幂等；失败重试一次）。
 * ★R2（A1 复核）：对齐失败会把 job.checker_id 留在 '__AUTO_BUILD__'，调用方必须把失败原因
 * 带进 job.last_error（D2 管理员页据此显示兜底文案），不得静默只剩哨兵。
 */
export async function alignJobCheckerId({ prisma, jobId, to, log = console } = {}) {
  const target = String(to || '');
  if (!target) return { ok: false, reason: 'checker_id_missing' };
  const emit = (line) => { try { (log.info || log.log || (() => {}))(line); } catch { /* ignore */ } };
  let lastReason = 'unknown';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await prisma.gradingJob.update({ where: { id: jobId }, data: { checkerId: target } });
      emit('RULER_JOB_CHECKER_ALIGNED job=' + jobId + ' to=' + target + (attempt > 1 ? ' attempt=' + attempt : ''));
      return { ok: true };
    } catch (err) {
      lastReason = String((err && err.message) || err).slice(0, 160);
      emit('RULER_JOB_CHECKER_ALIGN_FAILED job=' + jobId + ' to=' + target + ' attempt=' + attempt + ' reason=' + lastReason);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return { ok: false, reason: lastReason };
}
