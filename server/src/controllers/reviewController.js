import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { gradeSubmission } from '../services/deepseek.js';
import { ABNORMAL_FEEDBACK } from '../constants.js';
import { getVisibleClassIds } from './teamController.js';
import { parseProjectAnswer, toTeacherView } from '../utils/projectView.js';
import { submissionDir, standardDir, ROOT } from '../utils/projectPaths.js';
import { readProjectTree } from '../utils/projectFiles.js';

/** 根据学校/班级/题目构建筛选条件 */
async function buildFilter({ schoolId, classId, questionId, assignmentId, status }) {
  const where = {};
  if (status) where.status = status.includes(',') ? { in: status.split(',') } : status;
  if (questionId) where.questionId = +questionId;
  if (assignmentId) where.assignmentId = +assignmentId;

  if (classId) {
    const ids = (await prisma.studentClass.findMany({ where: { classId: +classId }, select: { studentId: true } })).map(s => s.studentId);
    where.studentId = { in: ids };
  } else if (schoolId) {
    const classIds = (await prisma.class.findMany({ where: { schoolId: +schoolId }, select: { id: true } })).map(c => c.id);
    const ids = (await prisma.studentClass.findMany({ where: { classId: { in: classIds } }, select: { studentId: true } })).map(s => s.studentId);
    where.studentId = { in: ids };
  }
  return where;
}

/** 查学生及所在学校 */
async function enrichWithSchool(list) {
  const studentIds = [...new Set(list.map(s => s.student?.id).filter(Boolean))];
  if (!studentIds.length) return list;
  const scs = await prisma.studentClass.findMany({
    where: { studentId: { in: studentIds } },
    include: { class: { include: { school: { select: { id: true, name: true } } } } },
  });
  const map = {};
  for (const sc of scs) {
    if (!map[sc.studentId]) map[sc.studentId] = sc.class?.school?.name;
  }
  return list.map(s => ({ ...s, schoolName: map[s.student?.id] || '' }));
}

export const getSubmissions = async (req, res) => {
  try {
    const { schoolId, classId, questionId, status, page = 1, pageSize = 20 } = req.query;
    const where = await buildFilter({ schoolId, classId, questionId, status });

    const [list, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        select: {
          id: true, status: true, aiScore: true, finalScore: true, submittedAt: true,
          student: { select: { id: true, username: true, realName: true } },
          question: { select: { id: true, title: true, maxScore: true } },
          assignment: { select: { id: true, title: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      prisma.submission.count({ where }),
    ]);
    const enriched = await enrichWithSchool(list);
    res.json({ code: 0, message: 'ok', data: { list: enriched, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取提交列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getReviewQuestions = async (req, res) => {
  try {
    const { classId } = req.query;
    let where = {};
    if (classId) {
      const studentIds = (await prisma.studentClass.findMany({ where: { classId: +classId }, select: { studentId: true } })).map(s => s.studentId);
      where = { studentId: { in: studentIds }, status: { not: 'draft' } };
    }
    const subs = await prisma.submission.findMany({
      where,
      select: { question: { select: { id: true, title: true } } },
      distinct: ['questionId'],
      orderBy: { questionId: 'asc' },
    });
    res.json({ code: 0, message: 'ok', data: subs.map(s => s.question) });
  } catch (err) {
    logger.error({ err }, '获取可审题目失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getSubmissionDetail = async (req, res) => {
  try {
    const s = await prisma.submission.findUnique({
      where: { id: +req.params.id },
      include: {
        student: { select: { id: true, username: true, realName: true } },
        question: { include: { subQuestions: { orderBy: { sortOrder: 'asc' } } } },
        subQuestion: true,
        assignment: { select: { id: true, title: true, mode: true } },
      },
    });
    if (!s) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });

    const allSubs = await prisma.submission.findMany({
      where: {
        assignmentId: s.assignmentId,
        studentId: s.studentId,
        questionId: s.questionId,
      },
      include: { subQuestion: true },
    });

    // 查学生所在学校
    let schoolName = '';
    if (s.studentId) {
      const sc = await prisma.studentClass.findFirst({
        where: { studentId: s.studentId },
        include: { class: { include: { school: { select: { name: true } } } } },
      });
      schoolName = sc?.class?.school?.name || '';
    }

    res.json({ code: 0, message: 'ok', data: { ...s, allSubmissions: allSubs, schoolName } });
  } catch (err) {
    logger.error({ err }, '获取提交详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const regradeSubmission = async (req, res) => {
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: +req.params.id },
      include: {
        question: { select: { material: true, subQuestions: { orderBy: { sortOrder: 'asc' } } } },
        subQuestion: true,
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });

    const sq = sub.subQuestion || sub.question?.subQuestions?.[0] || {};
    const { score, feedback } = await gradeSubmission({
      material: sub.question?.material || null,
      subQuestionTitle: sq.title || '',
      subQuestionContent: sq.content || '',
      referenceAnswer: sq.referenceAnswer || '',
      studentAnswer: sub.answer || '',
      maxScore: sq.score || 100,
      scoringCriteria: sq.scoringCriteria || null,
    });

    await prisma.submission.update({
      where: { id: sub.id },
      data: { aiScore: score, aiFeedback: feedback, status: 'ai_graded' },
    });

    res.json({ code: 0, message: '重新评分完成', data: { aiScore: score, aiFeedback: feedback } });
  } catch (err) {
    logger.error({ err }, '重新评分失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateScore = async (req, res) => {
  try {
    const id = +req.params.id;
    const { finalScore } = req.body;

    const sub = await prisma.submission.findUnique({
      where: { id },
      select: { status: true, aiScore: true, aiFeedback: true, teacherFeedback: true, question: { select: { type: true } } },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });

    const data = { finalScore: +finalScore };

    if (sub.status === 'ai_graded') {
      data.status = 'reviewed';
      data.reviewedAt = new Date();
      // R3：实训题 AI 评语绝不透传给学生，必须由教师手动填写 teacherFeedback
      if (sub.question?.type !== 'project' && !sub.teacherFeedback) {
        data.teacherFeedback = sub.aiFeedback || '';
      }
    }

    if (sub.status === 'submitted') {
      data.status = 'reviewed';
      data.reviewedAt = new Date();
    }

    const updated = await prisma.submission.update({ where: { id }, data });
    res.json({ code: 0, message: '分数已更新', data: { id, finalScore: updated.finalScore, status: updated.status, teacherFeedback: updated.teacherFeedback } });
  } catch (err) {
    logger.error({ err }, '修改分数失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const reviewSubmission = async (req, res) => {
  try {
    const { finalScore, teacherFeedback } = req.body;
    const data = { status: 'reviewed', reviewedAt: new Date() };
    if (finalScore !== undefined) data.finalScore = finalScore;
    if (teacherFeedback !== undefined) data.teacherFeedback = teacherFeedback;
    await prisma.submission.update({ where: { id: +req.params.id }, data });
    res.json({ code: 0, message: '审核成功', data: null });
  } catch (err) {
    logger.error({ err }, '审核提交失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const batchReview = async (req, res) => {
  try {
    const { schoolId, classId, assignmentId } = req.body;
    if (!schoolId) return res.status(400).json({ code: 1001, message: '请选择学校', data: null });

    const assignment = await prisma.assignment.findUnique({ where: { id: +assignmentId }, select: { mode: true } });
    if (assignment?.mode === 'practice') return res.status(400).json({ code: 1001, message: '练习模式无需审核', data: null });

    const classStudents = await prisma.studentClass.findMany({ where: { classId: +classId }, select: { studentId: true } });
    const studentIds = classStudents.map(cs => cs.studentId);

    const subs = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId, studentId: { in: studentIds } },
      select: { id: true, studentId: true, status: true, aiScore: true, aiFeedback: true, teacherFeedback: true, question: { select: { type: true } } },
    });
    const studentSubs = new Map();
    for (const s of subs) {
      if (!studentSubs.has(s.studentId)) studentSubs.set(s.studentId, []);
      studentSubs.get(s.studentId).push(s);
    }
    const toReview = [];
    const reviewedStudentIds = new Set();
    for (const [sid, ss] of studentSubs) {
      if (ss.some(s => s.status === 'submitted')) continue;
      if (ss.some(s => s.status === 'ai_graded')) {
        toReview.push(...ss);
        reviewedStudentIds.add(sid);
      }
    }
    let count = 0;
    if (toReview.length) {
      for (const s of toReview) {
        const isProject = s.question?.type === 'project';
        await prisma.submission.update({
          where: { id: s.id },
          // R3：实训题不把 AI 评语当作教师评语透传给学生
          data: { status: 'reviewed', reviewedAt: new Date(), finalScore: s.aiScore, teacherFeedback: isProject ? (s.teacherFeedback || '') : (s.aiFeedback || '') },
        });
        count++;
      }
    }
    res.json({ code: 0, message: `已审核 ${reviewedStudentIds.size} 名学生`, data: { count: reviewedStudentIds.size } });
  } catch (err) {
    logger.error({ err }, '批量审核失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const batchPublish = async (req, res) => {
  try {
    const { schoolId, classId, assignmentId } = req.body;
    if (!schoolId) return res.status(400).json({ code: 1001, message: '请选择学校', data: null });

    const assignment = await prisma.assignment.findUnique({ where: { id: +assignmentId }, select: { mode: true } });
    if (assignment?.mode === 'practice') return res.status(400).json({ code: 1001, message: '练习模式无需发布', data: null });

    const classStudents = await prisma.studentClass.findMany({ where: { classId: +classId }, select: { studentId: true } });
    const studentIds = classStudents.map(cs => cs.studentId);

    const subs = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId, studentId: { in: studentIds } },
      select: { id: true, studentId: true, status: true },
    });
    const studentSubs = new Map();
    for (const s of subs) {
      if (!studentSubs.has(s.studentId)) studentSubs.set(s.studentId, []);
      studentSubs.get(s.studentId).push(s);
    }
    const toPublishIds = [];
    const publishedStudentIds = new Set();
    for (const [sid, ss] of studentSubs) {
      if (ss.every(s => s.status === 'reviewed')) {
        toPublishIds.push(...ss.map(s => s.id));
        publishedStudentIds.add(sid);
      }
    }
    if (toPublishIds.length) {
      await prisma.submission.updateMany({
        where: { id: { in: toPublishIds } },
        data: { status: 'published' },
      });
    }
    res.json({ code: 0, message: `已发布 ${publishedStudentIds.size} 名学生`, data: { count: publishedStudentIds.size } });
  } catch (err) {
    logger.error({ err }, '批量发布失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const publishScores = async (req, res) => {
  try {
    const { submissionIds } = req.body;
    if (!submissionIds?.length) return res.status(400).json({ code: 1001, message: '请选择提交', data: null });
    await prisma.submission.updateMany({
      where: { id: { in: submissionIds.map(Number) }, status: 'reviewed' },
      data: { status: 'published' },
    });
    res.json({ code: 0, message: '发布成功', data: null });
  } catch (err) {
    logger.error({ err }, '发布成绩失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getReviewSummary = async (req, res) => {
  try {
    const schoolId = req.query.schoolId ? +req.query.schoolId : null;
    if (!schoolId) return res.json({ code: 0, data: [] });

    const { classId } = req.query;
    const visibleIds = await getVisibleClassIds(req.user.id, schoolId);
    const classWhere = { schoolId, id: { in: visibleIds } };
    if (classId) classWhere.id = +classId;

    const classes = await prisma.class.findMany({
      where: classWhere,
      include: {
        assignmentClasses: { include: { assignment: { select: { id: true, title: true, startTime: true, endTime: true, mode: true, locked: true, deletedAt: true } } } },
        studentClasses: true,
      },
      orderBy: { name: 'asc' },
    });

    const rows = [];
    for (const c of classes) {
      const studentIds = c.studentClasses.map(sc => sc.studentId);
      for (const ac of c.assignmentClasses) {
        const a = ac.assignment;
        if (a.deletedAt) continue;
        const totalStudents = c.studentClasses.length;
        const subs = await prisma.submission.findMany({
          where: { assignmentId: a.id, studentId: { in: studentIds } },
          select: { studentId: true, status: true, aiFeedback: true },
        });
        const studentSubMap = new Map();
        for (const s of subs) {
          if (s.status === 'draft') continue; // draft 不算已交
          if (!studentSubMap.has(s.studentId)) studentSubMap.set(s.studentId, []);
          studentSubMap.get(s.studentId).push({ status: s.status, feedback: s.aiFeedback });
        }
        const submittedStudents = studentSubMap.size;
        let aiPending = 0;
        let reviewPending = 0;
        let abnormal = 0;
        for (const [, items] of studentSubMap) {
          if (items.some(i => i.status === 'submitted')) aiPending++;
          else if (items.some(i => i.feedback === ABNORMAL_FEEDBACK)) abnormal++;
          else if (items.some(i => i.status === 'ai_graded')) reviewPending++;
        }
        const isPractice = a.mode === 'practice';
        const allAiDone = submittedStudents > 0 && aiPending === 0;
        const allReviewed = submittedStudents > 0 && aiPending === 0 && reviewPending === 0 && abnormal === 0;
        rows.push({
          assignmentId: a.id, title: a.title, classId: c.id, className: c.name,
          startTime: a.startTime, endTime: a.endTime,
          mode: a.mode || 'exam', locked: a.locked,
          totalStudents, submittedCount: submittedStudents,
          aiPending, reviewPending: isPractice ? 0 : reviewPending, abnormal,
          aiCompleted: isPractice ? reviewPending : 0,
          allAiDone, allReviewed,
        });
      }
    }
    // 最新作业排在最前面
    rows.sort((a, b) => b.assignmentId - a.assignmentId);
    res.json({ code: 0, data: rows });
  } catch (err) {
    logger.error({ err }, '获取审核汇总失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getReviewByClass = async (req, res) => {
  try {
    const classId = +req.params.classId;
    const { assignmentId, keyword, page = 1, pageSize = 20, filter, sortField, sortOrder } = req.query;

    const studentRecords = await prisma.studentClass.findMany({
      where: { classId },
      include: { student: true, class: { include: { school: { select: { name: true } } } } },
      orderBy: { student: { username: 'asc' } },
    });

    let filtered = studentRecords;
    if (keyword) filtered = filtered.filter(sc => sc.student.realName.includes(keyword));

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId, studentId: { in: filtered.map(sc => sc.studentId) } },
      include: {
        question: { select: { title: true, type: true } },
        subQuestion: { select: { id: true, score: true } },
        assignment: { select: { title: true, mode: true } },
      },
    });
    const studentSubsMap = new Map();
    for (const s of submissions) {
      if (!studentSubsMap.has(s.studentId)) studentSubsMap.set(s.studentId, []);
      studentSubsMap.get(s.studentId).push(s);
    }

    const statusOrder = { draft: 0, submitted: 1, ai_graded: 2, reviewed: 3, published: 4 };
    let rows = filtered.map(sc => {
      const subs = studentSubsMap.get(sc.studentId);
      // 过滤掉草稿记录 — draft 不算正式提交
      const realSubs = subs ? subs.filter(s => s.status !== 'draft') : [];
      if (realSubs.length) {
        const aiTotal = realSubs.reduce((sum, s) => sum + (s.aiScore ?? 0), 0);
        const finalTotal = realSubs.reduce((sum, s) => sum + (s.finalScore ?? 0), 0);
        const hasAbnormal = realSubs.some(s => s.aiFeedback === ABNORMAL_FEEDBACK);
        const worstStatus = hasAbnormal ? 'abnormal'
          : realSubs.reduce((worst, s) =>
              (statusOrder[s.status] ?? 0) < (statusOrder[worst] ?? 0) ? s.status : worst, realSubs[0].status);
        // 新实训题流程（Submission.type=project）：透出项目提交 id，供前端跳转三栏审核（R4 成绩门禁在审核后开放）
        const projectSub = realSubs.find(s => s.question?.type === 'project');
        return {
          id: realSubs[0].id, studentId: sc.studentId,
          studentName: sc.student.realName, studentNo: sc.student.username,
          schoolName: sc.class?.school?.name || '',
          className: sc.class?.name || '', assignmentTitle: realSubs[0].assignment?.title || '',
          mode: realSubs[0].assignment?.mode || 'exam',
          aiScore: aiTotal, finalScore: finalTotal > 0 ? finalTotal : null,
          status: worstStatus, submitted: true,
          projectSubmissionId: projectSub ? projectSub.id : null,
        };
      }
      return {
        id: `ns-${sc.studentId}`, studentId: sc.studentId,
        studentName: sc.student.realName, studentNo: sc.student.username,
        schoolName: sc.class?.school?.name || '',
        className: sc.class?.name || '', assignmentTitle: '', mode: 'exam',
        aiScore: null, finalScore: null, status: 'not_submitted', submitted: false,
      };
    });

    if (filter === 'submitted') rows = rows.filter(r => r.submitted);
    else if (filter === 'not_submitted') rows = rows.filter(r => !r.submitted);
    else if (filter === 'pending_review') rows = rows.filter(r => r.status === 'ai_graded');
    else if (filter === 'abnormal') rows = rows.filter(r => r.status === 'abnormal');

    if (sortField && sortOrder) {
      const dir = sortOrder === 'ascend' ? 1 : -1;
      rows.sort((a, b) => {
        const va = a[sortField] != null ? a[sortField] : (typeof b[sortField] === 'string' ? '' : 0);
        const vb = b[sortField] != null ? b[sortField] : (typeof a[sortField] === 'string' ? '' : 0);
        if (typeof va === 'string') return va.localeCompare(vb) * dir;
        return (va - vb) * dir;
      });
    }

    const total = rows.length;
    const start = (+page - 1) * +pageSize;
    const paged = rows.slice(start, start + +pageSize);
    res.json({ code: 0, data: { list: paged, total } });
  } catch (err) {
    logger.error({ err }, '获取班级提交列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const exportReviewData = async (req, res) => {
  try {
    const { classId, assignmentId } = req.query;
    if (!classId || !assignmentId) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const students = await prisma.studentClass.findMany({
      where: { classId: +classId },
      include: { student: true, class: { include: { school: { select: { name: true } } } } },
      orderBy: { student: { username: 'asc' } },
    });

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: +assignmentId, studentId: { in: students.map(s => s.studentId) } },
      include: { subQuestion: true },
    });

    const subQuestions = await prisma.subQuestion.findMany({
      where: { question: { assignmentQuestions: { some: { assignmentId: +assignmentId } } } },
      orderBy: { sortOrder: 'asc' },
    });

    // 构建学生提交映射：studentId → { sqId: { score, status, answer } }
    const subMap = new Map();
    for (const s of submissions) {
      const sid = s.studentId;
      if (!subMap.has(sid)) subMap.set(sid, {});
      const sqKey = s.subQuestionId || s.questionId;
      subMap.get(sid)[sqKey] = {
        score: s.finalScore ?? s.aiScore,
        status: s.status,
        answer: s.answer,
      };
    }

    // 为每个小题生成表头单元（扁平列表）
    // 客观题：每个小问一列；主观题：每个小题一列
    const headerCells = [];
    for (const sq of subQuestions) {
      if (sq.type === 'objective') {
        const items = sq.objectiveItems || [];
        for (const item of items) {
          headerCells.push({
            sqId: sq.id,
            itemKey: item.key,
            label: (item.stem || `第${item.key + 1}问`).replace(/<[^>]*>/g, '').slice(0, 60),
            maxScore: item.score || 0,
            type: item.type,
            answer: item.answer,
            options: item.options,
          });
        }
      } else {
        const label = (sq.content || sq.title || '').replace(/<[^>]*>/g, '').slice(0, 60);
        headerCells.push({
          sqId: sq.id,
          itemKey: null,
          label: label || `第${sq.sortOrder}小题`,
          maxScore: sq.score || 0,
          type: 'code',
        });
      }
    }

    // 计算每道客观小问的学生得分
    function scoreItem(item, studentAnswer) {
      const answers = (() => { try { return JSON.parse(studentAnswer || '[]'); } catch { return []; } })();
      const a = answers.find(x => x.key === item.itemKey) || {};
      const sAns = (a.answer || '').trim();
      if (!sAns) return 0;

      const refAnswer = item.answer;
      if (item.type === 'choice') {
        return sAns === String(refAnswer).trim() ? item.maxScore : 0;
      } else if (item.type === 'multi_choice') {
        const sSet = new Set(sAns.split(',').map(s => s.trim()).filter(Boolean));
        const aSet = new Set((Array.isArray(refAnswer) ? refAnswer : String(refAnswer).split(',')).map(s => s.trim()));
        const ok = [...sSet].filter(s => aSet.has(s)).length;
        return ok === aSet.size && sSet.size === aSet.size ? item.maxScore : 0;
      } else if (item.type === 'judge') {
        return sAns === String(refAnswer).trim() ? item.maxScore : 0;
      } else if (item.type === 'fill') {
        const ra = String(refAnswer || '').split(',').map(s => s.trim());
        const sa = String(sAns).split(',').map(s => s.trim());
        const correct = ra.every((r, bi) => String(sa[bi] || '').toLowerCase() === r.toLowerCase());
        return correct ? item.maxScore : 0;
      }
      return 0;
    }

    const rows = students.map(sc => {
      const studentSubs = subMap.get(sc.studentId) || {};
      let totalScore = 0;

      const cellScores = headerCells.map(h => {
        if (h.itemKey == null) {
          // 主观题：取整题分
          const s = studentSubs[h.sqId];
          const sc = s?.score ?? null;
          if (sc != null) totalScore += sc;
          return {
            label: h.label,
            maxScore: h.maxScore,
            score: sc,
            submitted: !!s?.status,
          };
        } else {
          // 客观题小问：从答案比对算分
          const sqSub = studentSubs[h.sqId];
          const submitted = !!sqSub?.status;
          let itemScore = null;
          if (submitted) {
            itemScore = scoreItem(h, sqSub.answer || '');
            if (itemScore != null) totalScore += itemScore;
          }
          return {
            label: h.label,
            maxScore: h.maxScore,
            score: itemScore,
            submitted,
          };
        }
      });

      return {
        studentName: sc.student.realName,
        studentNo: sc.student.username,
        schoolName: sc.class.school?.name || '',
        className: sc.class.name,
        submitted: cellScores.some(c => c.submitted),
        cellScores,
        totalScore: cellScores.every(c => !c.submitted) ? null : totalScore,
      };
    });

    res.json({
      code: 0,
      data: {
        rows,
        headerCells: headerCells.map(h => ({ label: h.label, maxScore: h.maxScore })),
      },
    });
  } catch (err) {
    logger.error({ err }, '导出审核数据失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 实训题（体系C）教师审核 =====================

/**
 * 读取标准答案文件树：优先 project-standards/{questionId}，
 * 兼容历史上传（question.attachmentUrl）。
 */
async function readStandardTree(question) {
  const newDir = standardDir(question.id);
  if (fs.existsSync(newDir)) {
    const t = readProjectTree(newDir);
    if (t.tree.length || Object.keys(t.contents).length) return t;
  }
  if (question.attachmentUrl) {
    const legacyDir = path.join(ROOT, 'uploads', question.attachmentUrl);
    if (fs.existsSync(legacyDir)) return readProjectTree(legacyDir);
  }
  return { tree: [], contents: {} };
}

/**
 * GET /teacher/submissions/:id/project
 *
 * 教师查看实训题提交详情：双栏所需数据（标准答案 + 学生提交 + AI 结果）。
 * 仅面向教师，含 AI 原始评语（R3 不约束教师端）。
 */
export const getProjectReview = async (req, res) => {
  try {
    const id = +req.params.id;
    const sub = await prisma.submission.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, username: true, realName: true } },
        question: { select: { id: true, title: true, material: true, scoringRubric: true, maxScore: true, attachmentUrl: true, type: true } },
        assignment: { select: { id: true, title: true, teacherId: true } },
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    if (sub.question.type !== 'project') return res.status(400).json({ code: 1001, message: '非实训题提交', data: null });
    // R6：仅作业所属教师可查看实训提交（作业/班级/学校归属校验）
    if (sub.assignment.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    const env = parseProjectAnswer(sub.answer);
    const version = env.currentVersion;

    const studentFiles = version ? readProjectTree(submissionDir(sub.questionId, sub.studentId, version)) : { tree: [], contents: {} };
    const standardFiles = await readStandardTree(sub.question);

    let aiResult = null;
    if (sub.aiFeedback) {
      try {
        aiResult = JSON.parse(sub.aiFeedback);
      } catch {
        aiResult = { overallComment: sub.aiFeedback };
      }
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        submission: toTeacherView(sub),
        question: sub.question,
        assignment: sub.assignment,
        student: sub.student,
        version,
        studentFiles,
        standardFiles,
        aiResult,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取实训题审核详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * PUT /teacher/submissions/:id/project/review
 *
 * 教师审核通过实训题提交。R3：教师必须显式提供评语（teacherFeedback），
 * 绝不回退到 AI 评语。审核后状态置 reviewed → 学生可见分数（D3）。
 */
export const reviewProjectSubmission = async (req, res) => {
  try {
    const id = +req.params.id;
    const { finalScore, teacherFeedback } = req.body;

    const sub = await prisma.submission.findUnique({
      where: { id },
      include: {
        question: { select: { type: true, maxScore: true } },
        assignment: { select: { teacherId: true } },
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    if (sub.question.type !== 'project') return res.status(400).json({ code: 1001, message: '非实训题提交', data: null });
    // R6：仅作业所属教师可审核实训提交
    if (sub.assignment.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    const data = { status: 'reviewed', reviewedAt: new Date() };
    if (finalScore !== undefined) {
      const max = sub.question.maxScore || 100;
      data.finalScore = Math.max(0, Math.min(max, Number(finalScore)));
    }
    // R3：教师评语以显式传入为准；未传则保留已有（初始为空），绝不取 AI 评语
    data.teacherFeedback = teacherFeedback !== undefined ? String(teacherFeedback || '') : (sub.teacherFeedback || '');

    const updated = await prisma.submission.update({ where: { id }, data });
    res.json({
      code: 0,
      message: '审核成功',
      data: { id, status: updated.status, finalScore: updated.finalScore, teacherFeedback: updated.teacherFeedback },
    });
  } catch (err) {
    logger.error({ err }, '实训题审核失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
