/**
 * student/scores.js —— 成绩汇总与个人信息（R2-B65：从 controllers/studentController.js 原样拆出）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { pickCountedScore } from '../../../../domain/services/scorePolicy.js';

// ===================== 查看成绩 =====================

export const getScores = async (req, res) => {
  try {
    // 查**已出分**的提交：仅 published（R3-D4 / US-B5：移除「练习模式已评分即可见」分支，
    // 与 /student/assignments、/student/assignments/:id 同口径 —— 未发布一律不出现在成绩页）
    const submissions = await prisma.submission.findMany({
      where: {
        studentId: req.user.id,
        status: 'published',
      },
      include: {
        question: { select: { id: true, title: true, maxScore: true } },
        subQuestion: { select: { id: true, title: true } },
        assignment: { select: { id: true, title: true, mode: true, scorePolicy: true } },
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
      // R3-D1（US-B4）：计入分 = finalScore（教师分，权威）?? 按作业口径的机器分
      //（best ⇒ bestScore / last ⇒ 最新 aiScore；未配置 ⇒ last = 改动前口径）。与 /student/assignments 一致。
      const counted = pickCountedScore({
        scorePolicy: s.assignment?.scorePolicy,
        finalScore: s.finalScore,
        aiScore: s.aiScore,
        bestScore: s.bestScore,
      });
      agg.totalScore += counted ?? 0;
      agg.subItems.push({
        title: s.subQuestion?.title || s.question.title,
        score: counted,
        feedback: s.teacherFeedback || s.aiFeedback,
      });
    }
    res.json({ code: 0, message: 'ok', data: [...assignMap.values()] });
  } catch (err) {
    logger.error({ err }, '获取成绩失败');
    // ★M6（W2-P2b）：响应固定文案，err.message 只进日志
    res.status(500).json({ code: 2001, message: "服务器内部错误", data: null });
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
    // ★M6（W2-P2b）：响应固定文案，err.message 只进日志
    res.status(500).json({ code: 2001, message: "服务器内部错误", data: null });
  }
};
