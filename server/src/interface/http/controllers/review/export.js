/**
 * export.js —— 由 server/src/controllers/reviewController.js 拆分而来（step 8，源行 608-761）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/reviewController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { resolveVisibleClassScope } from './class-scope.js';
import { pickCountedScore } from '../../../../domain/services/scorePolicy.js';
import { toDisplayStudentNo } from '../../../../utils/studentNo.js';

export const exportReviewData = async (req, res) => {
  try {
    const { classId, assignmentId } = req.query;
    if (!classId || !assignmentId) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    // t6：答案导出越权收敛——classId 必须命中教师可见集合（跨校/同校不可见班级一律 403），
    // 失败响应体不含任何姓名、学号、答案、分数
    const scope = await resolveVisibleClassScope(req.user.id, { schoolId: req.query.schoolId, classId });
    if (!scope.ok) return res.status(403).json({ code: 1003, message: '无权访问该班级', data: null });
    const cid = scope.classIds[0];
    const aid = +assignmentId;
    if (!Number.isInteger(aid) || aid <= 0) return res.status(400).json({ code: 1001, message: '参数错误', data: null });

    const students = await prisma.studentClass.findMany({
      where: { classId: cid },
      include: { student: true, class: { include: { school: { select: { name: true } } } } },
      orderBy: { student: { username: 'asc' } },
    });

    const submissions = await prisma.submission.findMany({
      where: { assignmentId: aid, studentId: { in: students.map(s => s.studentId) } },
      // R3-D1（US-B4）：导出分与学生端同口径 —— 需要作业的计分口径
      include: { subQuestion: true, assignment: { select: { scorePolicy: true } } },
    });

    const subQuestions = await prisma.subQuestion.findMany({
      where: { question: { assignmentQuestions: { some: { assignmentId: aid } } } },
      orderBy: { sortOrder: 'asc' },
    });

    // 构建学生提交映射：studentId → { sqId: { score, status, answer } }
    const subMap = new Map();
    for (const s of submissions) {
      const sid = s.studentId;
      if (!subMap.has(sid)) subMap.set(sid, {});
      const sqKey = s.subQuestionId || s.questionId;
      subMap.get(sid)[sqKey] = {
        // R3-D1（US-B4）：计入分 = finalScore（教师分，权威）?? 按作业口径的机器分
        //（best ⇒ bestScore / last ⇒ 最新 aiScore；未配置 ⇒ last = 改动前 finalScore ?? aiScore）
        score: pickCountedScore({
          scorePolicy: s.assignment?.scorePolicy,
          finalScore: s.finalScore,
          aiScore: s.aiScore,
          bestScore: s.bestScore,
        }),
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
        // ★展示投影：导出 Excel 的「学号」列只出纯学号（教务系统按纯学号匹配学生）；
        //   账号真值 users.username 仍为「学号@院校代码」。
        studentNo: toDisplayStudentNo(sc.student.username),
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
