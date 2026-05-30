import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { gradeSubmission } from './deepseek.js';
import { ABNORMAL_FEEDBACK } from '../constants.js';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '***REDACTED***';
function notifyGradedViaHttp(schoolId, data) {
  const port = process.env.PORT || 3000;
  fetch(`http://localhost:${port}/api/internal/graded`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${INTERNAL_SECRET}` },
    body: JSON.stringify({ schoolId, ...data }),
  }).catch(err => logger.warn({ err: err.message }, '通知主进程失败'));
}

let running = true;
const MAX_CONCURRENT = 8;

export function stop() {
  running = false;
}

async function gradeOne(sub) {
  const start = Date.now();
  try {
    logger.info({ submissionId: sub.id, questionId: sub.questionId }, '开始 AI 评分');

    const sq = sub.subQuestionId
      ? sub.question?.subQuestions?.find(s => s.id === sub.subQuestionId)
      : sub.question?.subQuestions?.[0];
    const sqData = sq || {};
    const { score, feedback } = await gradeSubmission({
      material: sub.question?.material || null,
      subQuestionTitle: sqData.title || '',
      subQuestionContent: sqData.content || '',
      referenceAnswer: sqData.referenceAnswer || '',
      studentAnswer: sub.answer || '',
      maxScore: sqData.score || 100,
      scoringCriteria: sqData.scoringCriteria || null,
    });

    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: score, aiFeedback: feedback, status: 'ai_graded' },
    });

    const schoolId = sub.student?.studentClasses?.[0]?.class?.schoolId;
    const classId = sub.student?.studentClasses?.[0]?.classId;
    if (schoolId) {
      notifyGradedViaHttp(schoolId, { id: sub.id, aiScore: score, aiFeedback: feedback, status: 'ai_graded', assignmentId: sub.assignmentId, classId });
    }

    logger.info({ submissionId: sub.id, score, elapsed: `${Date.now() - start}ms` }, 'AI 评分完成');
  } catch (err) {
    logger.error({ err, submissionId: sub.id }, 'AI 评分异常');
    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: 0, aiFeedback: ABNORMAL_FEEDBACK, status: 'ai_graded' },
    });
  }
}

export async function start() {
  logger.info({ maxConcurrent: MAX_CONCURRENT }, '评分 Worker 已启动');

  while (running) {
    try {
      const submissions = await prisma.submission.findMany({
        where: { status: 'submitted' },
        include: {
          question: { select: { material: true, subQuestions: { orderBy: { sortOrder: 'asc' } } } },
          student: { include: { studentClasses: { include: { class: { select: { schoolId: true } } } } } },
        },
        orderBy: { submittedAt: 'asc' },
        take: MAX_CONCURRENT,
      });

      if (submissions.length === 0) {
        // 兜底：扫描已过期的草稿，强制提交
        const expiredDrafts = await prisma.submission.findMany({
          where: {
            status: 'draft',
            assignment: { endTime: { lt: new Date() } },
          },
          take: MAX_CONCURRENT,
        });
        if (expiredDrafts.length > 0) {
          await prisma.submission.updateMany({
            where: { id: { in: expiredDrafts.map(s => s.id) } },
            data: { status: 'submitted', submittedAt: new Date() },
          });
          logger.info({ count: expiredDrafts.length }, '到期草稿已自动提交');
        }
        await sleep(2000);
        continue;
      }

      // 真正并行：全部同时启动
      await Promise.all(submissions.map(gradeOne));
    } catch (err) {
      logger.error({ err }, 'Worker 轮询异常');
      await sleep(5000);
    }
  }

  logger.info('评分 Worker 已停止');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
