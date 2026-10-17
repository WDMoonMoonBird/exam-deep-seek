/**
 * assignmentGradingController.js —— R2-B3（W7）作业级批改触发。
 *
 * 幂等（★R1 起 **DB 强制**）：活动态（pending/running）每 assignmentId 至多一行
 *   （迁移 20261017123000_r1_grading_jobs_active_assignment：生成列 active_assignment_key + UNIQUE；
 *    旧 active_key（assignment,checker）保留）⇒ 同作业重复触发（含并发、不同 checker）只可能留下一个活动 job。
 * 并发/竞态由 DB 唯一键兜底（P2002 时返回既有 job）；**不**插入逐份提交入口（studentController:745 保持原样）。
 */
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { resolveRulerForAssignment } from '../infrastructure/dsh/ruler/dshRulerAssignment.js';
import { setJobContentKey } from '../infrastructure/dsh/ruler/dshRulerStore.js';
import { AUTO_BUILD_CHECKER } from '../infrastructure/dsh/worker/autoBuild.js';

/** 活动态（占用「活动键」的状态）：每 (assignment, checker) 至多一行 */
export const ACTIVE_JOB_STATUSES = ['pending', 'running'];
/** 新建 job 的初始状态 */
export const JOB_STATUS_INITIAL = 'pending';

/** R2-B35：内容指纹解析失败 ⇒ 触发闸的可判定 code（与 CHECKER_NOT_READY 同属「暂不可批改」） */
export const RULER_BLOCK_CODES = {
  bind_conflict: 'RULER_BIND_CONFLICT',
  wait_timeout: 'RULER_BUILDING',
  wait_failed: 'RULER_FAILED',
  failed: 'RULER_FAILED',
  ruler_failed: 'RULER_FAILED',
  missing: 'RULER_NOT_READY',
  no_ruler_source: 'RULER_NOT_READY',
  ruler_store_unavailable: 'RULER_NOT_READY',
};

export const triggerAssignmentGrading = async (req, res) => {
  try {
    const assignmentId = +req.params.id;
    const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, teacherId: req.user.id, deletedAt: null }, select: { id: true, title: true } });
    if (!assignment) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });

    // ★R2-B35：按**内容指纹**解析尺子（只读、零 LLM）——同一 content_key 跨班/跨教师复用；
    //   无发布快照/无标准包/迁移未落地 ⇒ 回落旧的「按 assignment 找 ready checker」路径（行为不变）。
    let ruler = null;
    let contentKey = null;
    let rulerBlock = null;
    try {
      const rr = await resolveRulerForAssignment({ prisma, assignmentId, mode: 'reuse', waitTimeoutMs: 0, log: console, jobTag: 'trigger' });
      if (rr.ok) {
        ruler = rr.ruler;
        contentKey = rr.contentKey;
      } else if (rr.contentOk) {
        rulerBlock = rr;
      } else {
        logger.info({ assignmentId, reason: rr.reason }, 'R2-B35：内容指纹不可解析 ⇒ 回落按作业查找 ready checker');
      }
    } catch (err) {
      logger.warn({ assignmentId, err: err && err.message }, 'R2-B35：内容指纹解析异常 ⇒ 回落按作业查找 ready checker');
    }
    // 无 ready 尺子 / 造尺失败 ⇒ 建「自动造尺」job，由 worker 走 build 流程（F6）；
    //   正在造尺 / 绑定冲突仍拒绝（避免重复造尺、避免静默换尺）。
    let shouldBuild = false;
    if (rulerBlock) {
      const code = RULER_BLOCK_CODES[rulerBlock.reason] || RULER_BLOCK_CODES[rulerBlock.status] || 'RULER_NOT_READY';
      const reasonText = String(rulerBlock.reason || '');
      // 可重试的「没有可用尺子」：缺行 / 无来源 / 上次造尺失败（store 的失败原因带 ruler_failed: 前缀）
      const buildable = ['missing', 'no_ruler_source', 'failed', 'ruler_failed'].includes(reasonText)
        || reasonText.startsWith('ruler_failed:');
      if (buildable) {
        shouldBuild = true;
        contentKey = rulerBlock.contentKey || contentKey;
      } else {
        const message = code === 'RULER_BUILDING'
          ? '该内容的尺子正在生成中（并发去重），请稍后重试'
          : (code === 'RULER_BIND_CONFLICT'
            ? '该作业已绑定另一把尺子（内容与绑定不一致）⇒ 已 fail-closed，需人工处置（不得静默换尺）'
            : '该内容尺子不可用（reason=' + (reasonText || 'unknown') + '），需人工处置');
        logger.warn({ assignmentId, code, reason: reasonText, contentKey: rulerBlock.contentKey }, 'R2-B35：内容尺子不可用 ⇒ 拒绝触发');
        return res.status(409).json({
          code: 1011,
          message,
          data: { requiresChecker: true, code, reason: reasonText, contentKey: rulerBlock.contentKey, rulerStatus: rulerBlock.status || null },
        });
      }
    }

    // 解析出的 checker：内容尺子优先；否则回落「按 assignment 找 ready checker」（历史作业/迁移未落地）
    let checkerId = ruler && ruler.checkerId ? ruler.checkerId : null;
    if (!checkerId && !shouldBuild) {
      const checker = await prisma.gradingChecker.findFirst({
        where: { assignmentId, status: 'ready' },
        orderBy: { id: 'desc' },
        select: { checkerId: true },
      });
      if (!checker) {
        if (!contentKey) {
          return res.status(409).json({
            code: 1011,
            message: '该作业缺少发布冻结快照/标准工程包，无法自动造尺；请重新发布作业后再触发',
            data: { requiresChecker: true, code: 'RULER_NOT_READY', reason: 'snapshot_missing' },
          });
        }
        shouldBuild = true;
      } else {
        checkerId = checker.checkerId;
      }
    }
    if (shouldBuild) checkerId = AUTO_BUILD_CHECKER;
    const build = shouldBuild;

    // ★R2-B12②：活动态（pending/running）**按作业**至多一个（自动造尺与手动评分共享同一把坑）；
    // 终态（done/failed/needs_rerun）可多行共存 ⇒ 幂等查询按活动态判定。
    const activeWhere = { assignmentId, status: { in: ACTIVE_JOB_STATUSES } };
    const key = { assignmentId, checkerId, status: JOB_STATUS_INITIAL };
    const existing = await prisma.gradingJob.findFirst({ where: activeWhere, orderBy: { id: 'desc' }, select: { id: true, createdAt: true, status: true, checkerId: true } });
    if (existing) {
      logger.info({ assignmentId, checkerId, jobId: existing.id }, 'W7：重复触发命中既有 pending job（幂等）');
      return res.json({
        code: 0,
        message: '已存在进行中的作业级批改任务',
        data: {
          jobId: existing.id,
          checkerId: existing.checkerId === AUTO_BUILD_CHECKER ? null : existing.checkerId,
          reused: true,
          build: existing.checkerId === AUTO_BUILD_CHECKER,
        },
      });
    }
    let job;
    try {
      job = await prisma.gradingJob.create({ data: key, select: { id: true } });
    } catch (err) {
      if (err?.code === 'P2002') { // 竞态：DB 唯一键兜底（R1 active_assignment_key / 旧 active_key 任一命中）
        const again = await prisma.gradingJob.findFirst({ where: activeWhere, orderBy: { id: 'desc' }, select: { id: true, checkerId: true } });
        return res.json({
          code: 0,
          message: '已存在进行中的作业级批改任务',
          data: {
            jobId: again?.id ?? null,
            checkerId: again && again.checkerId === AUTO_BUILD_CHECKER ? null : ((again && again.checkerId) || null),
            reused: true,
            build: !!(again && again.checkerId === AUTO_BUILD_CHECKER),
          },
        });
      }
      throw err;
    }
    // ★R2-B35：把内容指纹钉进 job（审计 + 复用命中统计；迁移未落地 ⇒ 失败不致命）
    if (contentKey) {
      const stamped = await setJobContentKey({ prisma, jobId: job.id, contentKey });
      if (!stamped.ok) logger.warn({ assignmentId, jobId: job.id, contentKey }, 'R2-B35：grading_jobs.content_key 回填失败（迁移未落地？）');
    }
    logger.info({ assignmentId, checkerId, jobId: job.id, contentKey, build }, 'W7：作业级批改任务已创建');
    res.json({
      code: 0,
      message: build ? '已创建作业级批改任务（将自动造尺）' : '已创建作业级批改任务',
      data: { jobId: job.id, checkerId: build ? null : checkerId, reused: false, contentKey, build },
    });
  } catch (err) {
    logger.error({ err }, '作业级批改触发失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
