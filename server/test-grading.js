import 'dotenv/config';
import prisma from './src/utils/prisma.js';
import logger from './src/utils/logger.js';
import { gradeSubmission } from './src/services/deepseek.js';

const mode = process.argv[2]; // 'serial' or 'parallel'
if (!mode) {
  console.log('Usage: node test-grading.js <serial|parallel>');
  process.exit(1);
}

const MAX_CONCURRENT = mode === 'parallel' ? 8 : 1;

async function gradeOne(sub) {
  const start = Date.now();
  try {
    const { score, feedback } = await gradeSubmission({
      language: sub.question.language,
      questionContent: sub.question.content,
      referenceAnswer: sub.question.referenceAnswer,
      studentAnswer: sub.answer || '',
      maxScore: sub.question.maxScore,
    });

    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: score, aiFeedback: feedback, status: 'ai_graded' },
    });

    return { id: sub.id, score, elapsed: Date.now() - start };
  } catch (err) {
    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: 0, aiFeedback: 'AI 评分异常', status: 'ai_graded' },
    });
    return { id: sub.id, score: 0, elapsed: Date.now() - start, error: err.message };
  }
}

async function runSerial(submissions) {
  const results = [];
  for (const sub of submissions) {
    const r = await gradeOne(sub);
    results.push(r);
  }
  return results;
}

async function runParallel(submissions, concurrency) {
  // Process in batches of `concurrency`
  const results = [];
  for (let i = 0; i < submissions.length; i += concurrency) {
    const batch = submissions.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(gradeOne));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  logger.info(`=== 测试开始：${mode.toUpperCase()} 模式，并发数=${MAX_CONCURRENT} ===`);

  // 1. Reset all submissions for assignment 19
  logger.info('重置测试数据...');
  const resetResult = await prisma.submission.updateMany({
    where: { assignmentId: 19 },
    data: { aiScore: null, aiFeedback: null, status: 'submitted' },
  });
  const totalCount = resetResult.count;
  logger.info({ count: totalCount }, '已重置提交状态');

  // 2. Fetch all submissions with needed relations
  const submissions = await prisma.submission.findMany({
    where: { assignmentId: 19, status: 'submitted' },
    include: {
      question: { select: { content: true, referenceAnswer: true, maxScore: true, language: true } },
      student: { include: { studentClasses: { include: { class: { select: { schoolId: true } } } } } },
    },
    orderBy: { submittedAt: 'asc' },
  });

  logger.info({ count: submissions.length }, '获取待评分提交');

  // 3. Start grading
  const globalStart = Date.now();
  let results;

  if (mode === 'serial') {
    results = await runSerial(submissions);
  } else {
    results = await runParallel(submissions, MAX_CONCURRENT);
  }

  const totalElapsed = Date.now() - globalStart;

  // 4. Summary
  const successCount = results.filter(r => !r.error).length;
  const failCount = results.filter(r => r.error).length;
  const avgTime = results.length > 0 ? results.reduce((s, r) => s + r.elapsed, 0) / results.length : 0;
  const minTime = Math.min(...results.map(r => r.elapsed));
  const maxTime = Math.max(...results.map(r => r.elapsed));

  const summary = {
    mode,
    maxConcurrent: MAX_CONCURRENT,
    totalSubmissions: totalCount,
    successCount,
    failCount,
    totalElapsedMs: totalElapsed,
    totalElapsedSec: (totalElapsed / 1000).toFixed(2),
    avgApiTimeMs: Math.round(avgTime),
    minApiTimeMs: minTime,
    maxApiTimeMs: maxTime,
  };

  logger.info(summary, '=== 测试完成 ===');
  console.log('\n===== TEST RESULT =====');
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
