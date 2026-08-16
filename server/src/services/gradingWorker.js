import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { gradeSubmission, getConcurrency } from './deepseek.js';
import { ABNORMAL_FEEDBACK } from '../constants.js';
import { gradeMachine, gradeAST, gradeAI, calculateTotal } from './projectGrader.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_UPLOAD_DIR = path.join(__dirname, '../../uploads/projects');

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

// ==================== 现有提交评分 ====================

async function gradeOne(sub) {
  const start = Date.now();
  try {
    const sq = sub.subQuestionId
      ? sub.question?.subQuestions?.find(s => s.id === sub.subQuestionId)
      : sub.question?.subQuestions?.[0];
    const sqData = sq || {};

    if (!sq) {
      logger.warn({ submissionId: sub.id, subQuestionId: sub.subQuestionId }, '找不到对应小题，给 0 分');
      await prisma.submission.update({
        where: { id: sub.id },
        data: { aiScore: 0, aiFeedback: '系统错误：找不到题目信息', status: 'ai_graded' },
      });
      return;
    }

    let score, feedback;

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
          const correct = studentAns.trim() === (item.answer || '').trim();
          if (correct) { totalScore += itemScore; correctCount++; }
          feedbackParts.push(`第${item.key + 1}问：${correct ? '✓' : '✗'}（你的答案: ${studentAns || '未作答'}，正确答案: ${item.answer}）`);
        } else if (item.type === 'multi_choice') {
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
          const s = correctBlanks * perBlankScore;
          totalScore += s;
          if (correctBlanks === blankCount) correctCount++;
          feedbackParts.push(`第${item.key + 1}问：${correctBlanks}/${blankCount}空正确（得分 ${s}/${Math.round(itemScore)}）`);
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
        correct = blankCount <= 1 ? sa.toLowerCase() === ra.toLowerCase() : false;
        feedback = refAnswers.length > 1 ? `多空题（${blankCount}空）请查看详情` : (correct ? '正确' : `错误，参考答案：${ra}`);
      } else {
        correct = sa === ra;
        feedback = correct ? '正确' : `错误，正确答案：${ra}`;
      }
      score = correct ? (sqData.score || 0) : 0;
      logger.info({ submissionId: sub.id, type: sqData.type, correct }, '扁平客观题自动评分');
    } else {
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
      const max = sqData.score || 10;
      if (score > max * 2 && max < 100) {
        score = Math.round(score * max / 100);
        logger.info({ submissionId: sub.id, rawScore: result.score, normalized: score, max, concurrency: MAX_CONCURRENT }, 'AI 分数已归一化');
      }
      feedback = result.feedback;
    }

    const existingSub = await prisma.submission.findUnique({ where: { id: sub.id }, select: { bestScore: true } });
    const newBest = existingSub?.bestScore != null ? Math.max(existingSub.bestScore, score) : score;

    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: score, aiFeedback: feedback, status: 'ai_graded', bestScore: newBest },
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

// ==================== 现有提交扫描 ====================

async function scanSubmissions() {
  const submissions = await prisma.submission.findMany({
    // 排除实训题（type=project）：实训题无 subQuestions，评分由 projectGrading.js 负责，
    // 若被此处误捞会报"找不到题目信息"并抢先给 0 分（Worker 双路径竞争 bug）
    where: { status: 'submitted', question: { type: { not: 'project' } } },
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
    return;
  }

  await Promise.all(submissions.map(gradeOne));
}

// ==================== 实训项目提交扫描 ====================

async function scanProjectSubmissions() {
  try {
    const subs = await prisma.projectSubmission.findMany({
      where: { status: 'submitted' },
      include: { project: true },
      orderBy: { submittedAt: 'asc' },
      take: 5, // 项目评分较重，限制并发
    });

    if (subs.length === 0) {
      // 也处理 grading 状态（regrade 触发的）
      const gradingSubs = await prisma.projectSubmission.findMany({
        where: { status: 'grading' },
        include: { project: true },
        orderBy: { submittedAt: 'asc' },
        take: 3,
      });
      if (gradingSubs.length > 0) {
        await Promise.all(gradingSubs.map(gradeOneProject));
      }
      return;
    }

    await Promise.all(subs.map(gradeOneProject));
  } catch (err) {
    logger.error({ err }, '项目提交扫描异常');
  }
}

async function gradeOneProject(sub) {
  const start = Date.now();
  try {
    const projectId = sub.projectId;
    const submissionId = sub.id;

    const submissionDir = path.join(PROJECTS_UPLOAD_DIR, String(projectId), 'submissions', String(submissionId));
    const standardDir = path.join(PROJECTS_UPLOAD_DIR, String(projectId), 'standard');

    logger.info({ submissionId, projectId }, '开始项目评分');

    // 并行执行三方评分
    const [machineResult, astResult, aiResult] = await Promise.all([
      gradeMachine(submissionDir, sub.project.machineConfig || {}),
      gradeAST(submissionDir, 'java'),
      gradeAI(standardDir, submissionDir, sub.project.aiPromptExtra || ''),
    ]);

    const totalScore = calculateTotal(
      machineResult.score, astResult.score, aiResult.score,
      {
        machine: sub.project.machineWeight || 0.3,
        ast: sub.project.astWeight || 0.3,
        ai: sub.project.aiWeight || 0.4,
      }
    );

    await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: {
        machineScore: machineResult.score,
        machineFeedback: machineResult.feedback,
        astScore: astResult.score,
        astFeedback: astResult.feedback,
        aiScore: aiResult.score,
        aiFeedback: aiResult.feedback,
        totalScore,
        status: 'graded',
      },
    });

    logger.info({ submissionId, totalScore, machineScore: machineResult.score, astScore: astResult.score, aiScore: aiResult.score, elapsed: `${Date.now() - start}ms` }, '项目评分完成');
  } catch (err) {
    logger.error({ err, submissionId: sub.id }, '项目评分异常');
    // 评分失败：不覆盖已有分数、不置为 graded；保持 submitted 由轮询自动重试或教师重评，
    // 仅在各反馈字段记录错误信息便于排查（下次成功评分会覆盖）
    const errorMsg = `评分异常：${err?.message || '未知错误'}`;
    await prisma.projectSubmission.update({
      where: { id: sub.id },
      data: {
        machineFeedback: errorMsg,
        astFeedback: errorMsg,
        aiFeedback: errorMsg,
        status: 'submitted',
      },
    });
  }
}

// ==================== 主循环 ====================

export async function start() {
  MAX_CONCURRENT = await getConcurrency();
  logger.info({ maxConcurrent: MAX_CONCURRENT }, '评分 Worker 已启动');

  while (running) {
    try {
      if (Date.now() - lastConcurrencyRefresh > 60_000) {
        const newConcurrency = await getConcurrency();
        if (newConcurrency !== MAX_CONCURRENT) {
          logger.info({ old: MAX_CONCURRENT, new: newConcurrency }, 'Worker 并发配置已更新');
          MAX_CONCURRENT = newConcurrency;
        }
        lastConcurrencyRefresh = Date.now();
      }

      await Promise.all([
        scanSubmissions(),
        scanProjectSubmissions(),
      ]);
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
