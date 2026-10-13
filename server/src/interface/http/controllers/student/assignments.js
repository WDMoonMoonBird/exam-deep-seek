/**
 * student/assignments.js —— 学生端作业列表与作业详情（R2-B65：从 controllers/studentController.js 原样拆出）。
 *
 * 涵盖：GET /student/assignments（列表 + 得分可见性整形）、GET /student/assignments/:id（详情 + 未出分剥离参考答案）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { toStudentSubmissionView } from './view.js';
import { pickCountedScore } from '../../../../domain/services/scorePolicy.js';
import { canSeeAnswerAndAnalysis } from '../../../../domain/services/answerVisibility.js';

// ===================== 作业列表 =====================

export const getAssignments = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query;
    const studentId = req.user.id;

    // 查学生所属班级
    const classIds = (await prisma.studentClass.findMany({
      where: { studentId },
      select: { classId: true },
    })).map((c) => c.classId);

    if (classIds.length === 0) {
      return res.json({ code: 0, message: 'ok', data: { list: [], total: 0 } });
    }

    // 找到这些班级的所有作业（包括已删除的）
    const acs = await prisma.assignmentClass.findMany({
      where: { classId: { in: classIds } },
      select: { assignmentId: true },
    });
    const assignmentIds = [...new Set(acs.map((a) => a.assignmentId))];

    // 查该学生有提交的作业
    const mySubs = await prisma.submission.findMany({
      where: { studentId, assignmentId: { in: assignmentIds } },
      select: { assignmentId: true },
      distinct: ['assignmentId'],
    });
    const submittedIds = [...new Set(mySubs.map(s => s.assignmentId))];

    // 构建 OR 条件：未删除的 + 已删除但有提交的
    const orConditions = [{ deletedAt: null }];
    if (submittedIds.length > 0) {
      orConditions.push({ id: { in: submittedIds } });
    }

    const where = {
      id: { in: assignmentIds },
      OR: orConditions,
    };
    // keyword 按 title 模糊过滤（前端早已在传，旧实现服务端未读）
    const kw = typeof keyword === 'string' ? keyword.trim() : '';
    if (kw) where.title = { contains: kw };

    const [rawList, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        select: {
          id: true, title: true, description: true, startTime: true, endTime: true, allowResubmit: true, createdAt: true, deletedAt: true, mode: true, locked: true,
          // R3-D1（US-B1/US-B6）：学生端渲染「剩余次数 / 当前计入分」所需的三开关配置（非敏感配置项）
          maxAttempts: true, scorePolicy: true, answerVisibility: true,
          _count: { select: { assignmentQuestions: true } },
          assignmentQuestions: { select: { question: { select: { id: true, type: true, maxScore: true } } } },
          submissions: {
            where: { studentId },
            select: { id: true, status: true, submittedAt: true, finalScore: true, aiScore: true, attemptCount: true, bestScore: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      prisma.assignment.count({ where }),
    ]);

    const list = rawList.map((a) => {
      const isPractice = a.mode === 'practice';
      const subs = a.submissions || [];
      const realSubs = subs.filter((s) => s.status !== 'draft'); // draft 不算已交/已答

      // 最近一次非 draft 提交时间
      let lastSubmittedAt = null;
      for (const s of realSubs) {
        if (!s.submittedAt) continue;
        if (!lastSubmittedAt || new Date(s.submittedAt).getTime() > new Date(lastSubmittedAt).getTime()) {
          lastSubmittedAt = s.submittedAt;
        }
      }

      // 得分可见性（与 /student/assignments/:id、/student/scores 同口径）：
      // exam 模式仅 published 可见；practice 模式 ai_graded/reviewed 亦可见（现有规则不变）。
      const scoreVisible = realSubs.filter((s) =>
        s.status === 'published' || (isPractice && (s.status === 'ai_graded' || s.status === 'reviewed')));
      // R14/R3-D1：取值口径与 /student/scores 的 totalScore 完全一致 = 「计入分」
      //   = finalScore（教师分，权威）?? 按作业计分口径的机器分（best ⇒ bestScore / last ⇒ 最新 aiScore）
      // 未配置口径的历史作业 ⇒ 'last'，与 R14 的 finalScore ?? aiScore 逐字等价。
      // aiScore/bestScore 仅作数值来源，字段名依然不下发。
      const scoreValues = scoreVisible
        .map((s) => pickCountedScore({ scorePolicy: a.scorePolicy, finalScore: s.finalScore, aiScore: s.aiScore, bestScore: s.bestScore }))
        .filter((v) => v != null);

      const { submissions, ...rest } = a;
      return {
        ...rest,
        // 显式白名单：提交行只保留 id/status，aiScore/aiFeedback 等内部列一律不下发
        submissions: submissions.map((s) => ({ id: s.id, status: s.status })),
        submittedAt: lastSubmittedAt ? new Date(lastSubmittedAt).toISOString() : null,
        answeredCount: realSubs.length,
        finalScore: scoreValues.length ? scoreValues.reduce((sum, v) => sum + v, 0) : null,
        maxScore: (a.assignmentQuestions || []).reduce((sum, aq) => sum + (aq.question?.maxScore || 0), 0),
        attemptCount: subs.reduce((sum, s) => sum + (s.attemptCount || 0), 0),
      };
    });

    res.json({ code: 0, message: 'ok', data: { list, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取作业列表失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};

export const getAssignmentDetail = async (req, res) => {
  try {
    // 允许查看已删除的作业（只要学生曾提交过）
    const assignment = await prisma.assignment.findFirst({
      where: { id: +req.params.id },
      include: {
        assignmentQuestions: {
          include: { question: { include: { subQuestions: { orderBy: { sortOrder: 'asc' } } } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!assignment) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });

    // 锁定检查
    if (assignment.locked) {
      return res.status(403).json({ code: 1003, message: '作业已被锁定，无法查看', data: null });
    }

    // 归属校验（S-6 / A4）：作业必须投放到该生所在班级；单查询等价于 assertStudentInAssignment:493-506 的 studentClass ∩ assignmentClass
    const linked = await prisma.assignmentClass.findFirst({ where: { assignmentId: +req.params.id, class: { studentClasses: { some: { studentId: req.user.id } } } }, select: { assignmentId: true } });
    if (!linked) return res.status(403).json({ code: 1003, message: '无权访问该作业', data: null });

    // 查已有提交（同 handler 内的等价单行形态，为守住 GodFile ≤800 门禁折行）
    const submissions = await prisma.submission.findMany({ where: { assignmentId: +req.params.id, studentId: req.user.id } });

    // 未发布的提交不返回评分/评语，但练习模式例外。
    // 旧实现 published 分支直接 return s（整行下发，含 aiScore/aiFeedback）——已改为白名单裁剪。
    const isPractice = assignment.mode === 'practice';
    const safeSubmissions = submissions.map((s) => toStudentSubmissionView(s, isPractice, assignment.scorePolicy));

    // R3-D1（US-B2）：是否下发标准答案/解析 —— 由可见性开关驱动
    //   'immediate' 评分完成即可见 / 'after_publish' 仅发布后可见（默认）；
    //   历史作业（列默认 'after_publish'）与 practice 旧规则（已评分即可见）均保持原行为。
    const canSeeAnswers = safeSubmissions.some((s) => canSeeAnswerAndAnalysis({
      answerVisibility: assignment.answerVisibility,
      status: s.status,
      isPractice,
    }));

    // strip 敏感字段：未出分时隐藏参考答案
    if (!canSeeAnswers) {
      for (const aq of assignment.assignmentQuestions) {
        const subQuestions = aq.question?.subQuestions || [];
        for (const sq of subQuestions) {
          sq.referenceAnswer = null;
          sq.scoringCriteria = null;
          if (sq.objectiveItems) {
            sq.objectiveItems = sq.objectiveItems.map(item => ({ ...item, answer: null }));
          }
        }
      }
    }

    res.json({ code: 0, message: 'ok', data: { assignment, submissions: safeSubmissions } });
  } catch (err) {
    logger.error({ err }, '获取作业详情失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};
