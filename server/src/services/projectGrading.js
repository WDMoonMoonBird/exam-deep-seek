/**
 * projectGrading.js — 新实训题流程（Submission.type=project）的异步 AI 评分服务
 *
 * 与 legacy 体系B（ProjectSubmission + gradingWorker.scanProjectSubmissions）完全解耦：
 * 本服务只处理写入 Submission 表的实训题提交，状态机为
 *   submitted → ai_graded → reviewed/published（复用既有 SubmissionStatus 枚举）。
 *
 * 铁律：
 *   R5  评分在提交后异步触发，不阻塞提交响应（由调用方 setImmediate 调起）。
 *   R6  评分失败对学生透明（status 回退/保持 submitted，grading.state=failed），
 *       绝不让提交接口崩溃，也绝不回显内部错误。
 *   R7  每次评只针对「某个版本目录」，版本目录不可变，评分结果写入 Submission 行。
 *
 * 并发：信号量限制最多 3 个评分任务并行（D6）。
 */

import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { gradeProject } from './deepseek.js';
import { ABNORMAL_FEEDBACK } from '../constants.js';
import { standardDir, submissionDir } from '../utils/projectPaths.js';
import { parseProjectAnswer, serializeProjectAnswer } from '../utils/projectView.js';
import { MAX_TEXT_BYTES } from '../utils/projectArchive.js';
import { isIgnored } from '../utils/fileTree.js';

// ===================== 并发信号量（D6：上限 3） =====================
let activeCount = 0;
const MAX_CONCURRENT = 3;
const waiters = [];

function acquire() {
  return new Promise((resolve) => {
    if (activeCount < MAX_CONCURRENT) {
      activeCount += 1;
      resolve();
    } else {
      waiters.push(resolve);
    }
  });
}

function release() {
  activeCount = Math.max(0, activeCount - 1);
  if (waiters.length && activeCount < MAX_CONCURRENT) {
    activeCount += 1;
    const next = waiters.shift();
    next();
  }
}

// ===================== 文件收集（标准包 + 学生版本） =====================

function readDirFiles(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const walk = (base, rel = '') => {
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isIgnored(entry.name)) continue;
        walk(path.join(base, entry.name), rel + entry.name + '/');
      } else if (entry.isFile()) {
        if (isIgnored(entry.name)) continue;
        const abs = path.join(base, entry.name);
        const relPath = rel + entry.name;
        try {
          const { size } = fs.statSync(abs);
          if (size > MAX_TEXT_BYTES) {
            out.push(`// 文件过大（${relPath}，${(size / 1024 / 1024).toFixed(2)} MB），已跳过评分内容`);
            continue;
          }
          out.push(`// 文件名: ${relPath}\n${fs.readFileSync(abs, 'utf-8')}`);
        } catch {
          // 单个文件读取失败不影响整体
        }
      }
    }
  };
  walk(dir);
  return out;
}

// ===================== 评分核心 =====================

/**
 * 提交后异步入队评分（R5：fire-and-forget）。
 * 仅接收 submissionId，自行查库取出 questionId/studentId/当前版本号，
 * 通过 setImmediate 让出事件循环，保证 submit 响应不被 AI 调用阻塞。
 * 任何异常都被吞掉并记录日志，绝不让 submit 接口崩溃（R6）。
 *
 * @param {number} submissionId
 */
export function enqueueProjectGrade(submissionId) {
  setImmediate(() => {
    (async () => {
      try {
        const sub = await prisma.submission.findUnique({
          where: { id: submissionId },
          select: { questionId: true, studentId: true, answer: true, status: true },
        });
        if (!sub) return;
        if (sub.status !== 'submitted') return; // 仅对刚提交/未评分的触发
        const env = parseProjectAnswer(sub.answer);
        const version = env.currentVersion;
        if (!version || version < 1) return;
        await gradeProjectSubmission({ submissionId, questionId: sub.questionId, studentId: sub.studentId, version });
      } catch (err) {
        logger.error({ err, submissionId }, '实训题评分入队失败');
      }
    })();
  });
}

/**
 * 对一条实训题提交做 AI 评分并写回。
 * @param {object} ctx
 * @param {number} ctx.submissionId  Submission 行 id
 * @param {number} ctx.questionId
 * @param {number} ctx.studentId
 * @param {number} ctx.version       已落盘的学生版本号
 */
export async function gradeProjectSubmission({ submissionId, questionId, studentId, version }) {
  await acquire();
  const start = Date.now();
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { question: { select: { id: true, title: true, material: true, scoringRubric: true, maxScore: true, type: true } } },
    });
    if (!sub) {
      logger.warn({ submissionId }, '实训题评分：提交记录不存在，跳过');
      return;
    }
    if (sub.question?.type !== 'project') {
      logger.warn({ submissionId, type: sub.question?.type }, '实训题评分：非 project 类型，跳过');
      return;
    }
    // 幂等保护：若已被教师审核/发布，不再用 AI 结果覆盖最终分
    if (sub.status === 'reviewed' || sub.status === 'published') {
      logger.info({ submissionId, status: sub.status }, '实训题评分：已审核/发布，跳过');
      return;
    }

    const stdDir = standardDir(questionId);
    const stuDir = submissionDir(questionId, studentId, version);
    const standardFiles = readDirFiles(stdDir).join('\n\n');
    const studentFiles = readDirFiles(stuDir).join('\n\n');

    if (!studentFiles) {
      logger.warn({ submissionId, stuDir }, '实训题评分：学生版本无可读文件，标记失败');
      await markFailed(submissionId, '学生提交无可读源文件');
      return;
    }

    let result;
    try {
      result = await gradeProject({
        title: sub.question.title || '未命名项目',
        description: sub.question.material || '',
        scoringRubric: sub.question.scoringRubric || '',
        standardFiles,
        studentFiles,
      });
    } catch (aiErr) {
      logger.error({ err: aiErr, submissionId }, '实训题评分：AI 调用失败，标记失败');
      await markFailed(submissionId, 'AI 评分服务异常');
      return;
    }

    // gradeProject 返回 { totalScore, breakdown[], highlights[], issues[], overallComment }
    const aiScore = Math.max(0, Math.min(sub.question.maxScore || 100, Math.round(Number(result.totalScore) || 0)));
    const aiFeedback = JSON.stringify({
      breakdown: Array.isArray(result.breakdown) ? result.breakdown : [],
      highlights: Array.isArray(result.highlights) ? result.highlights : [],
      issues: Array.isArray(result.issues) ? result.issues : [],
      overallComment: result.overallComment || '',
    });

    await updateEnvelopeGrading(submissionId, (env) => {
      env.grading = { ...env.grading, state: 'done', version, finishedAt: new Date().toISOString(), error: null };
      return env;
    });

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        aiScore,
        aiFeedback,
        status: 'ai_graded',
        bestScore: Math.max(sub.bestScore ?? 0, aiScore),
      },
    });

    logger.info(
      { submissionId, aiScore, elapsed: `${Date.now() - start}ms` },
      '实训题 AI 评分完成',
    );
  } catch (err) {
    logger.error({ err, submissionId }, '实训题评分异常，标记失败');
    await markFailed(submissionId, '评分流程异常').catch(() => {});
  } finally {
    release();
  }
}

// ===================== 内部辅助 =====================

async function markFailed(submissionId, error) {
  try {
    await updateEnvelopeGrading(submissionId, (env) => {
      env.grading = { ...env.grading, state: 'failed', finishedAt: new Date().toISOString(), error: String(error || 'unknown') };
      return env;
    });
    // 保持 submitted，不向学生暴露失败细节（R6）
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'submitted',
        aiScore: 0,
        aiFeedback: ABNORMAL_FEEDBACK,
      },
    });
  } catch (e) {
    logger.error({ err: e, submissionId }, '标记实训题评分失败记录时出错');
  }
}

async function updateEnvelopeGrading(submissionId, mutator) {
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { answer: true },
  });
  const env = parseProjectAnswer(sub?.answer);
  const next = mutator(env);
  await prisma.submission.update({
    where: { id: submissionId },
    data: { answer: serializeProjectAnswer(next) },
  });
}
