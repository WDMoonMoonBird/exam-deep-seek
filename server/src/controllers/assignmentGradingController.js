/**
 * assignmentGradingController.js —— R2-B3（W7）作业级批改触发。
 *
 * 幂等：唯一键 (assignmentId, checkerId, status='pending') ⇒ 同作业重复触发只产生一个 pending job；
 * 并发/竞态由唯一键兜底（P2002 时返回既有 job）；**不**插入逐份提交入口（studentController:745 保持原样）。
 */
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

export const triggerAssignmentGrading = async (req, res) => {
  try {
    const assignmentId = +req.params.id;
    const assignment = await prisma.assignment.findFirst({ where: { id: assignmentId, teacherId: req.user.id, deletedAt: null }, select: { id: true, title: true } });
    if (!assignment) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });

    // 取当前 ready 的 checker（同一作业多个时取最新）
    const checker = await prisma.gradingChecker.findFirst({
      where: { assignmentId, status: 'ready' },
      orderBy: { id: 'desc' },
      select: { checkerId: true },
    });
    if (!checker) {
      return res.status(409).json({
        code: 1011,
        message: '该作业还没有可用的 checker（装置尚未产出/未入库），无法作业级评分',
        data: { requiresChecker: true, code: 'CHECKER_NOT_READY' },
      });
    }

    const key = { assignmentId, checkerId: checker.checkerId, status: 'pending' };
    const existing = await prisma.gradingJob.findFirst({ where: key, select: { id: true, createdAt: true } });
    if (existing) {
      logger.info({ assignmentId, checkerId: checker.checkerId, jobId: existing.id }, 'W7：重复触发命中既有 pending job（幂等）');
      return res.json({ code: 0, message: '已存在进行中的作业级批改任务', data: { jobId: existing.id, checkerId: checker.checkerId, reused: true } });
    }
    let job;
    try {
      job = await prisma.gradingJob.create({ data: key, select: { id: true } });
    } catch (err) {
      if (err?.code === 'P2002') { // 竞态：唯一键兜底
        const again = await prisma.gradingJob.findFirst({ where: key, select: { id: true } });
        return res.json({ code: 0, message: '已存在进行中的作业级批改任务', data: { jobId: again?.id ?? null, checkerId: checker.checkerId, reused: true } });
      }
      throw err;
    }
    logger.info({ assignmentId, checkerId: checker.checkerId, jobId: job.id }, 'W7：作业级批改任务已创建');
    res.json({ code: 0, message: '已创建作业级批改任务', data: { jobId: job.id, checkerId: checker.checkerId, reused: false } });
  } catch (err) {
    logger.error({ err }, '作业级批改触发失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
