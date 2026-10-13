/**
 * assignments.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 424-809）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { ABNORMAL_FEEDBACK } from '../../../../constants.js';
import { getVisibleClassIds } from '../../../../controllers/teamController.js';
import { hasStandardPackage } from '../../../../utils/projectPaths.js';
import { getSchoolId, canTeacherManageClasses } from './guards.js';
import { buildPublishSnapshot } from '../../../../services/assignmentSnapshot.js';
import { resolveAssignmentSwitches } from '../../../../domain/services/assignmentSwitches.js';

// ===================== 作业管理 =====================

// ===================== 待审核口径（与 review-summary 严格一致） =====================
// 判定顺序照抄 server/src/controllers/reviewController.js:315-331（getReviewSummary 的学生 rollup）：
//   1) 以 (作业 × 班级) 行为单位取该班花名册，逐生 rollup（draft 不计已交，同 reviewController:309）；
//   2) 该生在此作业下存在 status === 'submitted'  → aiPending++
//      否则存在 aiFeedback === ABNORMAL_FEEDBACK   → abnormal++
//      否则存在 status === 'ai_graded'             → reviewPending++
//   3) mode === 'practice' 的行 reviewPending 恒为 0（practice 的「待审核」语义是 AI 已完成）。
// 改动这里必须同步 reviewController.getReviewSummary，否则侧栏徽标数字与审核页对不上。
function rollupRow(byStudent, roster) {
  let aiPending = 0;
  let reviewPending = 0;
  let abnormal = 0;
  for (const studentId of roster) {
    const items = byStudent.get(studentId);
    if (!items || items.length === 0) continue;
    if (items.some(i => i.status === 'submitted')) aiPending++;
    else if (items.some(i => i.aiFeedback === ABNORMAL_FEEDBACK)) abnormal++;
    else if (items.some(i => i.status === 'ai_graded')) reviewPending++;
  }
  return { aiPending, reviewPending, abnormal };
}

/**
 * 批量计算 (作业 × 班级) 行的学生 rollup，并按 assignmentId 汇总。
 * 只投影必要列（assignmentId/studentId/status/aiFeedback）+ 一次 IN 查询后内存 rollup，
 * 不调用 review-summary 全量接口、不拉 submission 全表。
 *
 * @param {Array<{assignmentId:number, mode:string|null, roster:number[]}>} rows
 * @returns {Promise<Map<number, {aiPending:number, reviewPending:number, abnormal:number}>>}
 *          practice 行对 reviewPending 的贡献恒为 0；roster 为空的行贡献 0。
 */
async function rollupPendingByAssignment(rows) {
  const result = new Map();
  if (!rows.length) return result;

  const assignmentIds = new Set();
  const studentIds = new Set();
  for (const row of rows) {
    assignmentIds.add(row.assignmentId);
    for (const sid of row.roster) studentIds.add(sid);
  }
  if (!studentIds.size) return result;

  const subs = await prisma.submission.findMany({
    where: {
      assignmentId: { in: [...assignmentIds] },
      studentId: { in: [...studentIds] },
      status: { not: 'draft' },
    },
    select: { assignmentId: true, studentId: true, status: true, aiFeedback: true },
  });

  // assignmentId -> (studentId -> 该生在此作业下的非 draft 提交行)
  const byAssignment = new Map();
  for (const s of subs) {
    let byStudent = byAssignment.get(s.assignmentId);
    if (!byStudent) { byStudent = new Map(); byAssignment.set(s.assignmentId, byStudent); }
    let items = byStudent.get(s.studentId);
    if (!items) { items = []; byStudent.set(s.studentId, items); }
    items.push(s);
  }

  for (const row of rows) {
    const byStudent = byAssignment.get(row.assignmentId) || new Map();
    const r = rollupRow(byStudent, row.roster);
    const acc = result.get(row.assignmentId) || { aiPending: 0, reviewPending: 0, abnormal: 0 };
    acc.aiPending += r.aiPending;
    acc.abnormal += r.abnormal;
    acc.reviewPending += row.mode === 'practice' ? 0 : r.reviewPending;
    result.set(row.assignmentId, acc);
  }
  return result;
}

/**
 * 作业列表 status 筛选语义（服务端生效；时间维度与锁定维度互相独立）：
 *   ongoing / not_started / ended 只按时间判定，不考虑 locked；
 *   locked 只看 locked === true。
 * 未识别的值不筛选（前端灰度期兼容），并记一条 warn 便于排查。
 */
function buildAssignmentStatusWhere(status) {
  const now = new Date();
  switch (status) {
    case 'ongoing': return { startTime: { lte: now }, endTime: { gt: now } };
    case 'upcoming':
    case 'not_started': return { startTime: { gt: now } };
    case 'ended': return { endTime: { lte: now } };
    case 'locked': return { locked: true };
    default:
      if (status) logger.warn({ status }, '作业列表 status 筛选值未识别，已忽略');
      return null;
  }
}

// ===================== 教师端待审核汇总（侧栏徽标 / KPI） =====================
// GET /api/teacher/pending-summary?schoolId=&classId=
// → { code: 0, message: 'ok', data: { pendingReview, aiPending, abnormal, updatedAt } }
// 口径与 GET /api/teacher/review-summary 完全一致（见 rollupPendingByAssignment）。
// 硬约束：统计范围恒为 getVisibleClassIds(req.user.id, schoolId)；不传 schoolId 时也必须
// 收敛到该教师可见班级，任何分支都不得退化成全库计数。
export const getPendingSummary = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const classIdParam = req.query.classId ? +req.query.classId : null;

    // R5：非法 schoolId（如 ?schoolId=abc / 0 / 小数）与 review-summary 一致 fail-closed → 全 0，
    //     绝不因解析失败退化成「不限学校」的全量统计
    if (req.query.schoolId && (!Number.isInteger(schoolId) || schoolId <= 0)) {
      return res.json({ code: 0, message: 'ok', data: { pendingReview: 0, aiPending: 0, abnormal: 0, updatedAt: new Date().toISOString() } });
    }

    const visibleIds = await getVisibleClassIds(req.user.id, schoolId);
    // classId 只允许在可见集合内进一步收窄；请求不可见班级 → 空范围（返回全 0，不报错、不越权）
    const scopeClassIds = classIdParam ? (visibleIds.includes(classIdParam) ? [classIdParam] : []) : visibleIds;

    const totals = { pendingReview: 0, aiPending: 0, abnormal: 0 };
    if (scopeClassIds.length) {
      const classWhere = { id: { in: scopeClassIds } };
      if (schoolId) classWhere.schoolId = schoolId; // 与 review-summary 的班级过滤保持同一集合
      const classes = await prisma.class.findMany({
        where: classWhere,
        select: {
          studentClasses: { select: { studentId: true } },
          assignmentClasses: { select: { assignment: { select: { id: true, mode: true, deletedAt: true } } } },
        },
      });

      const rows = [];
      for (const c of classes) {
        const roster = c.studentClasses.map(sc => sc.studentId);
        for (const ac of c.assignmentClasses) {
          const a = ac.assignment;
          if (!a || a.deletedAt) continue; // 软删作业不参与统计（同 review-summary）
          rows.push({ assignmentId: a.id, mode: a.mode, roster });
        }
      }

      const byAssignment = await rollupPendingByAssignment(rows);
      for (const acc of byAssignment.values()) {
        totals.aiPending += acc.aiPending;
        totals.abnormal += acc.abnormal;
        totals.pendingReview += acc.reviewPending;
      }
    }

    res.json({ code: 0, message: 'ok', data: { ...totals, updatedAt: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, '获取待审核汇总失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getAssignments = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, classId, status, keyword } = req.query;
    const schoolId = getSchoolId(req);
    const visibleIds = await getVisibleClassIds(req.user.id, schoolId);
    const where = { deletedAt: null, assignmentClasses: { some: { classId: { in: visibleIds } } } };

    // 班级筛选：只允许在可见班级集合内收窄；不可见/非法 classId → 空集（fail-closed，不越权）
    if (classId !== undefined && classId !== '') {
      const cid = +classId;
      const scope = Number.isInteger(cid) && visibleIds.includes(cid) ? [cid] : [];
      where.assignmentClasses = { some: { classId: { in: scope } } };
    }
    // 标题模糊搜索（trim 后为空则忽略）
    const kw = typeof keyword === 'string' ? keyword.trim() : '';
    if (kw) where.title = { contains: kw };
    // 状态筛选（语义见 buildAssignmentStatusWhere）
    const statusWhere = buildAssignmentStatusWhere(status);
    if (statusWhere) Object.assign(where, statusWhere);
    const [list, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        select: {
          id: true, title: true, startTime: true, endTime: true, createdAt: true,
          mode: true, maxAttempts: true, locked: true,
          // R3-D1（US-B1）：列表回显三开关，供前端编辑/展示（历史行为不变：仅多回显字段）
          allowResubmit: true, scorePolicy: true, answerVisibility: true,
          teacher: { select: { realName: true } },
          assignmentClasses: { include: { class: { select: { id: true, name: true } } } },
          _count: { select: { assignmentQuestions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      prisma.assignment.count({ where }),
    ]);

    // ===== 统计口径 ===== 
    // submissionCount  : 该作业已提交学生数（去重、排除 draft）—— 改前是「拉全部提交再内存去重」，
    //                    现在走 SQL GROUP BY(assignment_id, student_id)，数值口径不变；
    // expectedCount    : 应交人数 = assignmentClasses → studentClass 学生去重数（跨班同生只算一次）；
    // pendingReviewCount: 待审核数，逐 (作业 × 班级) 行学生 rollup（同 review-summary），practice 恒 0；
    // latestSubmittedAt: 最新一次非 draft 提交时间（无则 null）。
    // 三者统计范围均为「该作业的全部关联班级」，与既有 submissionCount 的范围保持一致（不做可见性收窄）。
    const assignmentIds = list.map(a => a.id);
    const submissionCountMap = new Map();
    const latestSubmittedMap = new Map();
    const expectedCountMap = new Map();
    const pendingReviewMap = new Map();

    if (assignmentIds.length) {
      // 1) 已提交学生数：SQL 聚合去重（GROUP BY assignment_id, student_id）
      const groupedSubs = await prisma.submission.groupBy({
        by: ['assignmentId', 'studentId'],
        where: { assignmentId: { in: assignmentIds }, status: { not: 'draft' } },
      });
      for (const g of groupedSubs) {
        submissionCountMap.set(g.assignmentId, (submissionCountMap.get(g.assignmentId) || 0) + 1);
      }

      // 2) 最新一次非 draft 提交时间：SQL MAX(submitted_at)
      const maxRows = await prisma.submission.groupBy({
        by: ['assignmentId'],
        where: { assignmentId: { in: assignmentIds }, status: { not: 'draft' } },
        _max: { submittedAt: true },
      });
      for (const m of maxRows) {
        if (m._max && m._max.submittedAt) latestSubmittedMap.set(m.assignmentId, m._max.submittedAt);
      }

      // 3) 花名册：列出页作业涉及班级的学生（两列投影）
      const classIdSet = new Set();
      for (const a of list) for (const ac of a.assignmentClasses) classIdSet.add(ac.classId);
      const rosterByClass = new Map();
      if (classIdSet.size) {
        const scRows = await prisma.studentClass.findMany({
          where: { classId: { in: [...classIdSet] } },
          select: { classId: true, studentId: true },
        });
        for (const sc of scRows) {
          let roster = rosterByClass.get(sc.classId);
          if (!roster) { roster = []; rosterByClass.set(sc.classId, roster); }
          roster.push(sc.studentId);
        }
      }

      // 4) 待审核数 + 应交人数：逐 (作业 × 班级) 行 rollup，与 review-summary 行口径严格一致
      //    （同一学生同时在多班时 pendingReviewCount 会按行各计一次，与 review-summary 各行之和相等）
      // R10：pendingReviewCount 只统计「教师可见班级」的行（对齐侧栏徽标 / review-summary 可见行之和）；
      //      expectedCount 仍是「作业全部关联班级」的学生去重数 —— 提交进度的分子分母同 population。
      //      两者范围差异是有意为之：待审核数要能与审核页/徽标对上，提交进度要覆盖作业实际投放范围。
      const visibleClassSet = new Set(visibleIds);
      const rollupRows = [];
      for (const a of list) {
        const expectedStudents = new Set();
        for (const ac of a.assignmentClasses) {
          const roster = rosterByClass.get(ac.classId) || [];
          for (const sid of roster) expectedStudents.add(sid);
          if (visibleClassSet.has(ac.classId)) rollupRows.push({ assignmentId: a.id, mode: a.mode, roster });
        }
        expectedCountMap.set(a.id, expectedStudents.size);
      }

      const pendingByAssignment = await rollupPendingByAssignment(rollupRows);
      for (const [aid, acc] of pendingByAssignment) pendingReviewMap.set(aid, acc.reviewPending);
    }

    for (const a of list) {
      a.submissionCount = submissionCountMap.get(a.id) || 0;
      a.expectedCount = expectedCountMap.get(a.id) || 0;
      a.pendingReviewCount = pendingReviewMap.get(a.id) || 0;
      const latest = latestSubmittedMap.get(a.id);
      a.latestSubmittedAt = latest ? new Date(latest).toISOString() : null;
    }

    res.json({ code: 0, message: 'ok', data: { list, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取作业列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getAssignment = async (req, res) => {
  try {
    const a = await prisma.assignment.findFirst({
      where: { id: +req.params.id, teacherId: req.user.id, deletedAt: null },
      include: {
        assignmentQuestions: { include: { question: true } },
        assignmentClasses: { include: { class: true } },
      },
    });
    if (!a) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });
    // 作业详情不露出软删除题目（to-one include 不支持 where，JS 层过滤）
    a.assignmentQuestions = (a.assignmentQuestions || []).filter(aq => aq.question && !aq.question.deletedAt);
    res.json({ code: 0, message: 'ok', data: a });
  } catch (err) {
    logger.error({ err }, '获取作业详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createAssignment = async (req, res) => {
  try {
    // R3-D1（US-B1）：三开关入参 ②计分口径 scorePolicy ③答案可见性 answerVisibility
    //（①允许重交/次数上限 = 既有 allowResubmit/maxAttempts，本次只做题型默认值归一化，零新增列）
    const { title, description, startTime, endTime, allowResubmit, questionIds, classIds, mode, maxAttempts, scorePolicy, answerVisibility, confirmWithoutStandardPackage } = req.body;
    if (!title || !startTime || !endTime || !questionIds?.length || !classIds?.length) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }
    // 内容校验（round 7 · R-1 收口，A §2.1 #38）：投放班级必须 ⊆ 本人可见班级（直连 ∪ 团队）。
    // 前置到任何查库/写库动作之前 ⇒ 越权请求零写入；403 契约与同文件其余 body 目标守卫一致。
    // 空集合不在此判（上方 :721 已把空 classIds 归入既有 400/1001 分支，语义不变）。
    if (!(await canTeacherManageClasses(req.user.id, classIds, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    // Q9（2026-08 甲方定案，本次经甲方确认放宽为软警告）：
    // 作业含实训题（type=project）但该题没有标准工程包时，不再直接 400 拒绝，
    // 而是返回 warnings 软警告请教师确认；只有显式确认
    // （body.confirmWithoutStandardPackage === true，即前端确认框点「确认布置」）才继续创建，
    // 这类题目按开放性题目评分（AI 仅依据评分标准做评价式评分，不与参考答案对比）。
    // 有标准包的题目零影响：不产生警告、直接创建（与改动前完全一致）。
    // 「有无标准包」判据与 AI 实评一致：hasStandardPackage()。
    // 查询过滤软删除题目；已删题目不可被选入新作业
    const questions = await prisma.question.findMany({ where: { id: { in: questionIds }, deletedAt: null, teacherId: req.user.id } });
    if (questions.length !== questionIds.length) {
      return res.status(400).json({ code: 1001, message: '部分题目不存在或已删除，无法布置', data: null });
    }
    const openProjectWarnings = [];
    for (const q of questions) {
      if (q.type !== 'project') continue;
      if (hasStandardPackage(q.id, q.attachmentUrl)) continue;
      openProjectWarnings.push({
        questionId: q.id,
        title: q.title,
        message: `题目「${q.title}」未上传标准工程包，将按开放性题目布置：AI 仅依据评分标准做评价式评分，不与参考答案对比`,
      });
    }
    if (openProjectWarnings.length && confirmWithoutStandardPackage !== true) {
      const titles = openProjectWarnings.map(w => w.title).join('、');
      logger.info({ questionIds: openProjectWarnings.map(w => w.questionId) }, '布置作业待教师确认：存在未上传标准工程包的题目');
      return res.status(400).json({
        code: 1007,
        message: `以下题目未上传标准工程包，AI 将仅依据评分标准做评价式评分（不与参考答案对比）：${titles}。确认按开放性题目布置？`,
        data: { requiresConfirmation: true, warnings: openProjectWarnings },
      });
    }
    if (openProjectWarnings.length) {
      logger.warn({ questionIds: openProjectWarnings.map(w => w.questionId) }, '按开放性题目布置作业（教师已确认无标准工程包）');
    }

    // R3-D1 / D2 题型默认值：题目里含实训题（type='project'）⇒ 1 次 + 取最后 + 发布后可见；
    // 纯编程题 ⇒ 不限次 + 取最高 + 提交后可看答案解析。教师显式传值优先（见 resolveAssignmentSwitches）。
    // 历史作业不经过此处：迁移列默认值 'last'/'after_publish' 即既有行为（US-B1 AC3）。
    const hasProject = questions.some((q) => q.type === 'project');
    const sw = resolveAssignmentSwitches({ hasProject, allowResubmit, maxAttempts, scorePolicy, answerVisibility });

    const assignment = await prisma.assignment.create({
      data: {
        teacherId: req.user.id,
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        mode: mode || 'exam',
        // practice 形态沿用既有强制开重交（US-B5 前保持等价），其余按三开关走
        allowResubmit: mode === 'practice' ? true : sw.allowResubmit,
        maxAttempts: sw.maxAttempts,
        scorePolicy: sw.scorePolicy,
        answerVisibility: sw.answerVisibility,
        assignmentQuestions: {
          create: questionIds.map((qid, i) => ({ questionId: +qid, sortOrder: i + 1 })),
        },
        assignmentClasses: {
          create: classIds.map((cid) => ({ classId: +cid })),
        },
      },
    });
    // W2（R2-B2 · 评分标准冻结）：发布即快照 —— 创建后把 rubric/material/rubricItems 与标准包哈希
    // 写入 assignment_questions 的 4 个快照列（不改动 create 的既有入参形状）。
    // 快照写入失败（例如库上迁移未落地）只告警不阻断：评分读路径会回落 live，行为与批 2 之前一致。
    let snapshotWritten = 0;
    for (const q of questions) {
      if (q.type !== 'project') continue;
      try {
        await prisma.assignmentQuestion.update({
          where: { assignmentId_questionId: { assignmentId: assignment.id, questionId: q.id } },
          data: buildPublishSnapshot(q),
        });
        snapshotWritten += 1;
      } catch (err) {
        logger.warn({ err, assignmentId: assignment.id, questionId: q.id }, '发布时快照写入失败（已按 live 语义继续）');
      }
    }
    logger.info({ assignmentId: assignment.id, snapshotWritten }, '作业已创建（含发布时快照）');
    res.json({ code: 0, message: '创建成功', data: assignment });
  } catch (err) {
    logger.error({ err }, '创建作业失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const lockAssignment = async (req, res) => {
  try {
    const id = +req.params.id;
    const a = await prisma.assignment.findUnique({ where: { id }, select: { teacherId: true, locked: true } });
    if (!a) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });
    if (a.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    const updated = await prisma.assignment.update({
      where: { id },
      data: { locked: !a.locked },
      select: { id: true, locked: true },
    });
    res.json({ code: 0, message: updated.locked ? '已锁定' : '已解锁', data: updated });
  } catch (err) {
    logger.error({ err }, '锁定/解锁作业失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
