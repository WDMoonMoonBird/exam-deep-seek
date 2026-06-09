import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// ===================== 作业列表 =====================

export const getAssignments = async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
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

    const [list, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        select: {
          id: true, title: true, description: true, startTime: true, endTime: true, allowResubmit: true, createdAt: true, deletedAt: true, mode: true, locked: true,
          _count: { select: { assignmentQuestions: true } },
          submissions: {
            where: { studentId },
            select: { status: true, id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      prisma.assignment.count({ where }),
    ]);

    res.json({ code: 0, message: 'ok', data: { list, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取作业列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 提交答案 =====================

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

    // 查已有提交
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: +req.params.id, studentId: req.user.id },
    });

    // 未发布的提交不返回评分/评语，但练习模式例外
    const isPractice = assignment.mode === 'practice';
    const safeSubmissions = submissions.map((s) => {
      if (s.status === 'published') return s;
      if (isPractice && (s.status === 'ai_graded' || s.status === 'reviewed')) return s;
      return { ...s, aiScore: null, aiFeedback: null, finalScore: null, teacherFeedback: null };
    });

    res.json({ code: 0, message: 'ok', data: { assignment, submissions: safeSubmissions } });
  } catch (err) {
    logger.error({ err }, '获取作业详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const submitAnswer = async (req, res) => {
  try {
    const assignmentId = +req.params.id;
    const { questionId, subQuestionId, answer, force } = req.body;

    // 检查作业状态
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { endTime: true, allowResubmit: true, mode: true, maxAttempts: true, locked: true } });
    if (!assignment) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });

    if (assignment.locked) {
      return res.status(403).json({ code: 1003, message: '作业已被锁定，无法提交', data: null });
    }

    const isExpired = new Date() > new Date(assignment.endTime);

    const where = { assignmentId, studentId: req.user.id, questionId: +questionId };
    if (subQuestionId) where.subQuestionId = +subQuestionId;
    let submission = await prisma.submission.findFirst({ where });

    // 已过期且非强制提交 → 拒绝
    if (isExpired && !force) {
      return res.status(400).json({ code: 1001, message: '已过截止时间，不可提交', data: null });
    }

    // 已提交且不允许补交 → 拒绝
    if (submission && submission.status !== 'draft' && !assignment.allowResubmit && !force) {
      return res.status(400).json({ code: 1001, message: '已提交，不可重复提交', data: null });
    }

    // 练习模式：检查提交次数
    if (assignment.mode === 'practice' && assignment.maxAttempts != null) {
      const currentCount = submission?.attemptCount || 0;
      if (currentCount >= assignment.maxAttempts) {
        return res.status(400).json({ code: 1001, message: `已达最大提交次数（${assignment.maxAttempts}次）`, data: null });
      }
    }

    const data = { answer, status: 'submitted', submittedAt: new Date() };
    if (submission) {
      data.attemptCount = { increment: 1 };
    } else {
      data.attemptCount = 1;
    }
    if (subQuestionId) data.subQuestionId = +subQuestionId;

    if (submission) {
      await prisma.submission.update({ where: { id: submission.id }, data });
    } else {
      await prisma.submission.create({
        data: { assignmentId, studentId: req.user.id, questionId: +questionId, ...data },
      });
    }

    const msg = force ? '时间已截止，已自动提交' : '提交成功';
    res.json({ code: 0, message: msg, data: null });
  } catch (err) {
    logger.error({ err }, '提交答案失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const saveDraft = async (req, res) => {
  try {
    const assignmentId = +req.params.id;
    const { questionId, subQuestionId, answer } = req.body;

    // 检查作业是否过期
    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { endTime: true, locked: true } });
    if (!assignment) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });
    if (assignment.locked) {
      return res.status(403).json({ code: 1003, message: '作业已被锁定', data: null });
    }
    if (new Date() > new Date(assignment.endTime)) {
      return res.json({ code: 0, message: '已过截止时间，跳过草稿', data: null });
    }

    const where = { assignmentId, studentId: req.user.id, questionId: +questionId };
    if (subQuestionId) where.subQuestionId = +subQuestionId;
    let submission = await prisma.submission.findFirst({ where });

    if (submission && submission.status !== 'draft') {
      return res.json({ code: 0, message: '已提交，跳过草稿', data: null });
    }

    if (submission) {
      await prisma.submission.update({ where: { id: submission.id }, data: { answer } });
    } else {
      await prisma.submission.create({
        data: { assignmentId, studentId: req.user.id, questionId: +questionId, subQuestionId: subQuestionId ? +subQuestionId : null, answer, status: 'draft' },
      });
    }

    res.json({ code: 0, message: '草稿已保存', data: null });
  } catch (err) {
    logger.error({ err }, '保存草稿失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 查看成绩 =====================

export const getScores = async (req, res) => {
  try {
    // 查已发布 + 练习模式已评分
    const submissions = await prisma.submission.findMany({
      where: {
        studentId: req.user.id,
        OR: [
          { status: 'published' },
          { status: { in: ['ai_graded', 'reviewed'] }, assignment: { mode: 'practice' } },
        ],
      },
      include: {
        question: { select: { id: true, title: true, maxScore: true } },
        subQuestion: { select: { id: true, title: true } },
        assignment: { select: { id: true, title: true, mode: true } },
      },
      orderBy: { reviewedAt: 'desc' },
    });
    // 按作业汇总
    const assignMap = new Map();
    for (const s of submissions) {
      const key = s.assignmentId;
      if (!assignMap.has(key)) {
        assignMap.set(key, {
          assignmentId: key,
          assignmentTitle: s.assignment.title,
          mode: s.assignment.mode || 'exam',
          questionTitle: s.question.title,
          totalScore: 0,
          maxScore: s.question.maxScore,
          bestScore: s.bestScore,
          attemptCount: s.attemptCount,
          subItems: [],
        });
      }
      const agg = assignMap.get(key);
      agg.totalScore += s.finalScore ?? s.aiScore ?? 0;
      agg.subItems.push({
        title: s.subQuestion?.title || s.question.title,
        score: s.finalScore ?? s.aiScore,
        feedback: s.teacherFeedback || s.aiFeedback,
      });
    }
    res.json({ code: 0, message: 'ok', data: [...assignMap.values()] });
  } catch (err) {
    logger.error({ err }, '获取成绩失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getProfile = async (req, res) => {
  try {
    const scs = await prisma.studentClass.findMany({
      where: { studentId: req.user.id },
      include: { class: { include: { school: { select: { id: true, name: true } } } } },
    });
    const classes = scs.map(sc => ({ className: sc.class.name, schoolName: sc.class.school?.name }));
    res.json({ code: 0, data: { realName: req.user.realName, username: req.user.username, classes } });
  } catch (err) {
    logger.error({ err }, '获取学生信息失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
