import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { gradeSubmission, getConcurrency } from './deepseek.js';
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
let MAX_CONCURRENT = 16;
let lastConcurrencyRefresh = 0;

export function stop() {
  running = false;
}

async function gradeOne(sub) {
  const start = Date.now();
  try {
    const sq = sub.subQuestionId
      ? sub.question?.subQuestions?.find(s => s.id === sub.subQuestionId)
      : sub.question?.subQuestions?.[0];
    const sqData = sq || {};

    // 找不到小题 → 直接 0 分
    if (!sq) {
      logger.warn({ submissionId: sub.id, subQuestionId: sub.subQuestionId }, '找不到对应小题，给 0 分');
      await prisma.submission.update({
        where: { id: sub.id },
        data: { aiScore: 0, aiFeedback: '系统错误：找不到题目信息', status: 'ai_graded' },
      });
      return;
    }

    let score, feedback;

    // 客观题：逐小问比对答案
    if (sqData.type === 'objective') {
      const items = sqData.objectiveItems || [];
      const answers = (() => { try { return JSON.parse(sub.answer || '[]'); } catch { return []; } })();
      const sqScore = sqData.score || 0;
      const itemCount = items.length;
      let totalScore = 0;
      let correctCount = 0;
      const feedbackParts = [];

      for (const item of items) {
        const studentItem = answers.find(a => a.key === item.key) || {};
        const studentAns = studentItem.answer || '';
        const itemScore = item.score ?? Math.round(sqScore / itemCount * 100) / 100;

        if (item.type === 'choice') {
          // 单选：直接比对
          const correct = studentAns.trim() === (item.answer || '').trim();
          if (correct) { totalScore += itemScore; correctCount++; }
          feedbackParts.push(`第${item.key + 1}问：${correct ? '✓' : '✗'}（你的答案: ${studentAns || '未作答'}，正确答案: ${item.answer}）`);
        } else if (item.type === 'multi_choice') {
          // 多选
          const studentSet = new Set((studentAns || '').split(',').map(s => s.trim()).filter(Boolean));
          const answerSet = new Set((Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim()));
          const correctOpts = [...studentSet].filter(s => answerSet.has(s)).length;
          const wrongOpts = [...studentSet].filter(s => !answerSet.has(s)).length;
          const missingOpts = [...answerSet].filter(s => !studentSet.has(s)).length;
          const settings = sub.question?.objectiveSettings || {};
          if (studentSet.size === 0) {
            feedbackParts.push(`第${item.key + 1}问：✗（未作答）`);
          } else if (correctOpts === answerSet.size && wrongOpts === 0) {
            totalScore += itemScore; correctCount++;
            feedbackParts.push(`第${item.key + 1}问：✓（全对）`);
          } else {
            // 给分方式
            const scoring = settings.multiChoiceScoring || 'partial';
            if (scoring === 'partial') {
              const partial = Math.round(itemScore * correctOpts / answerSet.size * 100) / 100;
              totalScore += Math.max(0, partial - wrongOpts);
              feedbackParts.push(`第${item.key + 1}问：△ 部分正确（对${correctOpts}错${wrongOpts}漏${missingOpts}，得${Math.max(0, partial - wrongOpts)}/${itemScore}分）`);
            } else {
              feedbackParts.push(`第${item.key + 1}问：✗（答案: ${studentAns}，正确: ${item.answer}）`);
            }
          }
        } else if (item.type === 'judge') {
          const correct = String(studentAns).trim() === String(item.answer).trim();
          if (correct) { totalScore += itemScore; correctCount++; }
          feedbackParts.push(`第${item.key + 1}问：${correct ? '✓' : '✗'}（你的答案: ${studentAns || '未作答'}，正确答案: ${item.answer === 'true' ? '对' : '错'}）`);
        } else if (item.type === 'fill') {
          const refAnswers = String(item.answer || '').split(',').map(s=>s.trim());
          const stuAnswers = String(studentAns || '').split(',').map(s=>s.trim());
          const blankCount = Math.max(refAnswers.length, stuAnswers.length, 1);
          const perBlankScore = blankCount > 0 ? itemScore / blankCount : itemScore;
          let correctBlanks = 0;
          for (let b = 0; b < blankCount; b++) {
            const sa = String(stuAnswers[b] || '').trim();
            const ra = String(refAnswers[b] || '').trim();
            if (sa.toLowerCase() === ra.toLowerCase()) correctBlanks++;
          }
          const score = correctBlanks * perBlankScore;
          totalScore += score;
          if (correctBlanks === blankCount) correctCount++;
          feedbackParts.push(`第${item.key + 1}问：${correctBlanks}/${blankCount}空正确（得分 ${score}/${Math.round(itemScore)}）`);
        }
      }
      score = Math.round(totalScore);
      feedback = `${correctCount}/${itemCount} 正确，得分 ${totalScore} / ${sqScore}\n` + feedbackParts.join('\n');
      logger.info({ submissionId: sub.id, type: 'objective', correct: correctCount, total: itemCount }, '客观题自动评分');
    } else if (sqData.type === 'choice' || sqData.type === 'multi_choice' || sqData.type === 'judge' || sqData.type === 'fill') {
      const sa = (sub.answer || '').trim();
      const ra = (sqData.referenceAnswer || '').trim();
      let correct = false;
      if (sqData.type === 'multi_choice') {
        const sSet = new Set(sa.split(',').map(s => s.trim()).filter(Boolean));
        const aSet = new Set(ra.split(',').map(s => s.trim()).filter(Boolean));
        correct = sSet.size === aSet.size && [...sSet].every(s => aSet.has(s));
        feedback = correct ? '正确' : `错误，正确答案：${ra}`;
      } else if (sqData.type === 'fill') {
        const refAnswers = ra.split(',').map(s=>s.trim());
        const stuAnswers = sa.split(',').map(s=>s.trim());
        const blankCount = Math.max(refAnswers.length, stuAnswers.length, 1);
        correct = blankCount <= 1 ? sa.toLowerCase() === ra.toLowerCase() : false; // 多空不走简单比对
        feedback = refAnswers.length > 1 ? `多空题（${blankCount}空）请查看详情` : (correct ? '正确' : `错误，参考答案：${ra}`);
      } else {
        correct = sa === ra;
        feedback = correct ? '正确' : `错误，正确答案：${ra}`;
      }
      score = correct ? (sqData.score || 0) : 0;
      logger.info({ submissionId: sub.id, type: sqData.type, correct }, '扁平客观题自动评分');
    } else {
      // 编程题：AI 评分
      logger.info({ submissionId: sub.id, questionId: sub.questionId, concurrency: MAX_CONCURRENT }, '开始 AI 评分');
      const result = await gradeSubmission({
        material: sub.question?.material || null,
        subQuestionTitle: sqData.title || '',
        subQuestionContent: sqData.content || '',
        referenceAnswer: sqData.referenceAnswer || '',
        studentAnswer: sub.answer || '',
        maxScore: sqData.score || 0,
        scoringCriteria: sqData.scoringCriteria || null,
      });
      score = result.score;
      // 安全网：AI 有时返回 0-100 分制，按百分制缩放到满分
      const max = sqData.score || 10;
      if (score > max * 2 && max < 100) {
        score = Math.round(score * max / 100);
        logger.info({ submissionId: sub.id, rawScore: result.score, normalized: score, max, concurrency: MAX_CONCURRENT }, 'AI 分数已归一化');
      }
      feedback = result.feedback;
      logger.info({ submissionId: sub.id, score, elapsed: `${Date.now() - start}ms`, concurrency: MAX_CONCURRENT }, 'AI 评分完成');
    }

    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: score, aiFeedback: feedback, status: 'ai_graded' },
    });

    const schoolId = sub.student?.studentClasses?.[0]?.class?.schoolId;
    const classId = sub.student?.studentClasses?.[0]?.classId;
    if (schoolId) {
      notifyGradedViaHttp(schoolId, { id: sub.id, aiScore: score, aiFeedback: feedback, status: 'ai_graded', assignmentId: sub.assignmentId, classId });
    }

    logger.info({ submissionId: sub.id, score, elapsed: `${Date.now() - start}ms`, concurrency: MAX_CONCURRENT }, 'AI 评分完成');
  } catch (err) {
    logger.error({ err, submissionId: sub.id, concurrency: MAX_CONCURRENT }, 'AI 评分异常');
    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: 0, aiFeedback: ABNORMAL_FEEDBACK, status: 'ai_graded' },
    });
  }
}

export async function start() {
  // 首次读取并发配置
  MAX_CONCURRENT = await getConcurrency();
  logger.info({ maxConcurrent: MAX_CONCURRENT }, '评分 Worker 已启动');

  while (running) {
    try {
      // 每 60 秒刷新一次并发配置
      if (Date.now() - lastConcurrencyRefresh > 60_000) {
        const newConcurrency = await getConcurrency();
        if (newConcurrency !== MAX_CONCURRENT) {
          logger.info({ old: MAX_CONCURRENT, new: newConcurrency }, 'Worker 并发配置已更新');
          MAX_CONCURRENT = newConcurrency;
        }
        lastConcurrencyRefresh = Date.now();
      }

      const submissions = await prisma.submission.findMany({
        where: { status: 'submitted' },
        include: {
          question: { select: { material: true, objectiveSettings: true, subQuestions: { orderBy: { sortOrder: 'asc' } } } },
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
