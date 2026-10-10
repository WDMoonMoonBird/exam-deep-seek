import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import { DomainError } from '../domain/errors.js';
import logger from '../utils/logger.js';
import { DEFAULT_MAX_SCORE, ABNORMAL_FEEDBACK } from '../constants.js';
import { resolveSubQuestionScores } from '../utils/scoring.js';
import { getVisibleClassIds, getTeamTeacherIds, getMyTeamIds } from './teamController.js';
import { hasStandardPackage } from '../utils/projectPaths.js';
import { parseExamPaper, parseExamPaperStream, generateReferenceAnswer } from '../services/deepseek.js';

/** 获取教师当前学校ID（从 query 参数） */
function getSchoolId(req) { return req.query.schoolId ? +req.query.schoolId : null; }

/**
 * 资源归属守卫（round 5 · 安全项 S-2）：写操作前校验目标班级是否落在教师的可见班级内。
 *
 * 语义来源与本文件读端点完全一致（getAllClasses:790 / getMyStudents:933 同款调用形态）：
 * getVisibleClassIds = 直连班级 ∪ 团队班级（teamController.js:146-166）；schoolId 为空时
 * 沿用其「不做学校过滤」的既有行为。403 契约与 lockAssignment:738 对齐。
 *
 * ⚠️ 调用方必须在**任何写库动作之前**调用本函数；未命中时立即 return —— 保证零写入。
 */
async function canTeacherManageClass(teacherId, classId, schoolId) {
  const visibleIds = await getVisibleClassIds(teacherId, schoolId);
  return visibleIds.includes(+classId);
}

/** 同上，目标为学生：学生必须属于教师可见的某个班级（班级来源同 assertStudentInAssignment 的口径）。 */
async function canTeacherManageStudent(teacherId, studentId, schoolId) {
  const visibleIds = await getVisibleClassIds(teacherId, schoolId);
  if (visibleIds.length === 0) return false;
  const link = await prisma.studentClass.findFirst({
    where: { studentId: +studentId, classId: { in: visibleIds } },
    select: { classId: true },
  });
  return !!link;
}

/**
 * 资源归属守卫（round 6 · body 目标资源）：目标班级**集合**必须全部落在教师可见班级内。
 *
 * 与 canTeacherManageClass 同源（getVisibleClassIds = 直连 ∪ 团队）；空集合 = 无目标资源 ⇒ 放行
 * （例如 updateClass 的 teamIds:[] 表示「清空团队关联」，不引入任何他人资源）。
 */
async function canTeacherManageClasses(teacherId, classIds, schoolId) {
  if (!classIds?.length) return true;
  const visibleIds = await getVisibleClassIds(teacherId, schoolId);
  return classIds.every(cid => visibleIds.includes(+cid));
}

/** 同上，目标为团队集合：teamIds 必须 ⊆ 本人所属团队（teamController.getMyTeamIds）。 */
async function canTeacherManageTeams(teacherId, teamIds) {
  if (!teamIds?.length) return true;
  const myTeamIds = await getMyTeamIds(teacherId);
  return teamIds.every(tid => myTeamIds.includes(+tid));
}

/** 教师是否属于该学校（schoolId 来自 query 的建资源类写端点用；判据同 switchClassSchool:922）。 */
async function isTeacherInSchool(teacherId, schoolId) {
  const link = await prisma.teacherSchool.findFirst({
    where: { teacherId, schoolId: +schoolId },
    select: { schoolId: true },
  });
  return !!link;
}

// ===================== 学校切换 =====================

export const switchSchool = async (req, res) => {
  try {
    const { schoolId } = req.body;
    await prisma.user.update({ where: { id: req.user.id }, data: { lastSchoolId: +schoolId } });
    const school = await prisma.school.findUnique({ where: { id: +schoolId } });
    res.json({ code: 0, message: '切换成功', data: school });
  } catch (err) {
    logger.error({ err }, '切换学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 题库管理 =====================

export const getQuestions = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, difficulty, keyword } = req.query;
    const where = { teacherId: req.user.id, deletedAt: null };
    if (difficulty) where.difficulty = difficulty;
    if (keyword) where.title = { contains: keyword };

    const [list, total] = await Promise.all([
      prisma.question.findMany({
        where,
        select: { id: true, title: true, type: true, difficulty: true, maxScore: true, createdAt: true, _count: { select: { subQuestions: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      prisma.question.count({ where }),
    ]);

    res.json({ code: 0, message: 'ok', data: { list, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取题库失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getQuestion = async (req, res) => {
  try {
    const q = await prisma.question.findFirst({
      where: { id: +req.params.id, teacherId: req.user.id, deletedAt: null },
      include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    res.json({ code: 0, message: 'ok', data: q });
  } catch (err) {
    logger.error({ err }, '获取题目详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getProjectFiles = async (req, res) => {
  try {
    const id = +req.params.id;
    const q = await prisma.question.findFirst({
      where: { id, teacherId: req.user.id, type: 'project', deletedAt: null },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    if (!q.attachmentUrl) return res.json({ code: 0, message: 'ok', data: { tree: [] } });

    const dir = path.join(__dirname, '../../uploads', q.attachmentUrl);
    if (!fs.existsSync(dir)) return res.json({ code: 0, message: 'ok', data: { tree: [] } });

    // 动态导入 fileTree（ESM 兼容）
    const { buildTree, flattenTree } = await import('../utils/fileTree.js');
    const tree = buildTree(dir, { skipBaseDir: true }); // 与上传预览(uploadPackage)/学生端一致：树根为 zip 内容而非存储目录名 standard
    const flatList = flattenTree(tree);

    // 读取文件内容
    const contents = {};
    for (const f of flatList) {
      if (f.type === 'file') {
        try {
          contents[f.path] = fs.readFileSync(path.join(dir, f.path), 'utf-8');
        } catch {
          contents[f.path] = '// 无法读取文件内容';
        }
      }
    }
    res.json({ code: 0, message: 'ok', data: { tree, contents } });
  } catch (err) {
    logger.error({ err }, '获取实训题文件树失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

const gradeProject = async (req, res) => {
  try {
    const id = +req.params.id;
    const q = await prisma.question.findFirst({
      where: { id, teacherId: req.user.id, type: 'project', deletedAt: null },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });

    // 读取标准项目文件
    const readDirFiles = (dir) => {
      const result = [];
      if (!fs.existsSync(dir)) return result;
      const walk = (base, rel = '') => {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(path.join(base, entry.name), rel + entry.name + '/');
          else if (entry.isFile()) {
            const fpath = rel + entry.name;
            try {
              result.push({ path: fpath, content: fs.readFileSync(path.join(base, entry.name), 'utf-8') });
            } catch {}
          }
        }
      };
      walk(dir);
      return result;
    };

    // R6：开放性题目（attachmentUrl 为空且标准包目录无文件）本就没有标准答案可比对，试评不适用
    const isOpenProject = !hasStandardPackage(q.id, q.attachmentUrl);
    const standardDir = q.attachmentUrl ? path.join(__dirname, '../../uploads', q.attachmentUrl) : '';
    const standardFiles = readDirFiles(standardDir)
      .map(f => `// 文件名: ${f.path}\n${f.content}`).join('\n\n');

    // 读取学生提交文件：仅允许读取标准包目录，不接受任何外部路径（封堵任意文件读取）
    const studentDir = standardDir;
    const studentFiles = readDirFiles(studentDir)
      .map(f => `// 文件名: ${f.path}\n${f.content}`).join('\n\n');

    if (!standardFiles) {
      // 开放性题目：明确提示「无标准工程包」，避免「未找到标准项目文件」被误读为上传失败；
      // 有包但读不到内容（历史数据/目录丢失）仍保留原提示。
      const message = isOpenProject ? '开放性题目无标准工程包，无法试评' : '未找到标准项目文件';
      return res.status(400).json({ code: 1001, message, data: null });
    }

    const { gradeProject: doGrade } = await import('../services/deepseek.js');
    const result = await doGrade({
      title: q.title,
      description: q.material || '',
      scoringRubric: q.scoringRubric || '',
      standardFiles,
      studentFiles,
    });

    res.json({ code: 0, message: '评分完成', data: result });
  } catch (err) {
    logger.error({ err }, '项目评分失败');
    res.status(500).json({ code: 2001, message: '评分失败: ' + (err.message || '未知错误'), data: null });
  }
};

export const createQuestion = async (req, res) => {
  try {
    const { title, difficulty = 'medium', type = 'code', material, attachmentUrl, objectiveSettings, subQuestions, scoringRubric, maxScore, tempId } = req.body;

    // 实训题（type=project）：不需要 subQuestions
    if (type === 'project') {
      if (!title) return res.status(400).json({ code: 1001, message: '参数错误', data: null });
      if (title.length > 200) return res.status(400).json({ code: 1001, message: '标题不能超过200字', data: null });
      if (material?.length > 50000) return res.status(400).json({ code: 1001, message: '题目材料过长', data: null });
      // 安全校验：tempId 仅接受服务端生成的临时目录标识（防路径穿越）
      if (tempId != null && !/^temp_\d+_[a-z0-9]+$/.test(String(tempId))) {
        return res.status(400).json({ code: 1001, message: '非法临时目录标识', data: null });
      }

      const q = await prisma.question.create({
        data: {
          teacherId: req.user.id,
          title,
          type: 'project',
          maxScore: maxScore || 100,
          difficulty,
          material: material || null,
          attachmentUrl: tempId ? `projects/${tempId}/standard` : null,
          scoringRubric: scoringRubric || null,
        },
      });

      // 将临时上传的 zip 文件移动到正式目录（校验 tempId 格式 + 目录不越界，封堵路径穿越）
      if (tempId) {
        const projectsRoot = path.resolve(__dirname, '../../uploads/projects');
        const srcDir = path.resolve(projectsRoot, String(tempId));
        if (!srcDir.startsWith(projectsRoot + path.sep)) {
          return res.status(400).json({ code: 1001, message: '非法临时目录标识', data: null });
        }
        const destDir = path.join(__dirname, '../../uploads/project-questions', String(q.id));
        if (fs.existsSync(srcDir)) {
          fs.mkdirSync(path.dirname(destDir), { recursive: true });
          fs.renameSync(srcDir, destDir);
        }
        await prisma.question.update({
          where: { id: q.id },
          data: { attachmentUrl: `project-questions/${q.id}/standard` },
        });
      }

      logger.info({ questionId: q.id, type: 'project' }, '实训题已创建');
      return res.json({ code: 0, message: '创建成功', data: q });
    }

    // 编程题（type=code）：校验与创建已迁移至 QuestionUseCases（application/use-cases）
    try {
      const q = await req.app.locals.questionUseCases.create({
        teacherId: req.user.id,
        title, maxScore, difficulty, material, attachmentUrl, objectiveSettings, subQuestions,
      });
      logger.info({ questionId: q.id }, '题目已创建');
      return res.json({ code: 0, message: '创建成功', data: q });
    } catch (err) {
      if (err instanceof DomainError) {
        return res.status(400).json({ code: 1001, message: err.message, data: null });
      }
      logger.error({ err }, '创建题目失败');
      return res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
    }
  } catch (err) {
    logger.error({ err }, '创建题目失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateQuestion = async (req, res) => {
  try {
    const id = +req.params.id;
    const existing = await prisma.question.findFirst({ where: { id, teacherId: req.user.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });

    const { title, difficulty = 'medium', material, attachmentUrl, objectiveSettings, subQuestions, scoringRubric, maxScore } = req.body;
    if (title?.length > 200) return res.status(400).json({ code: 1001, message: '标题不能超过200字', data: null });
    if (material?.length > 50000) return res.status(400).json({ code: 1001, message: '题目材料过长', data: null });

    // 实训题：直接更新，不处理 subQuestions
    if (existing.type === 'project') {
      // 安全校验：attachmentUrl 仅接受白名单格式（防路径穿越，getProjectFiles 会对其 path.join）
      if (attachmentUrl != null && !/^project-questions\/\d+\/standard$/.test(attachmentUrl)) {
        return res.status(400).json({ code: 1001, message: 'attachmentUrl 格式非法', data: null });
      }
      await prisma.question.update({
        where: { id },
        data: {
          title, maxScore: maxScore || existing.maxScore, difficulty,
          material, attachmentUrl, scoringRubric: scoringRubric ?? existing.scoringRubric,
          objectiveSettings: objectiveSettings || undefined,
          // 2026-08-17：评分标准变化 → 固定分项缓存失效（下次评分重新提炼）
          rubricItems: null,
        },
      });
      return res.json({ code: 0, message: '更新成功', data: null });
    }

    // 编程题：原有逻辑
    let resolved, totalScore;
    try {
      const result = resolveSubQuestionScores(subQuestions);
      resolved = result.resolved;
      totalScore = result.totalScore;
    } catch (e) {
      return res.status(400).json({ code: 1001, message: e.message, data: null });
    }

    await prisma.$transaction([
      prisma.subQuestion.deleteMany({ where: { questionId: id } }),
      prisma.question.update({
        where: { id },
        data: {
          title, maxScore: totalScore, difficulty, material, attachmentUrl, objectiveSettings: objectiveSettings || undefined,
          subQuestions: {
            create: resolved.map((sq, i) => ({
              sortOrder: i + 1,
              title: sq.title || '',
              type: sq.type || 'code',
              score: sq.score,
              content: sq.content || '',
              referenceAnswer: sq.referenceAnswer || '',
              language: sq.language || 'cpp',
              objectiveItems: sq.objectiveItems || undefined,
              scoringCriteria: sq.scoringCriteria || null,
            })),
          },
        },
      }),
    ]);
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新题目失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    const id = +req.params.id;
    const q = await prisma.question.findFirst({ where: { id, teacherId: req.user.id, deletedAt: null } });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });

    await prisma.question.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除题目失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== AI 试卷解析 =====================

export const parseExam = async (req, res) => {
  try {
    const { content } = req.body;
    console.log('[parseExam] 收到请求，字符数:', content?.length || 0);
    if (!content?.trim()) return res.status(400).json({ code: 1001, message: '请提供试卷内容', data: null });

    const limit = 80000;
    const trimmed = content.length > limit ? content.slice(0, limit) : content;
    if (content.length > limit) console.log('[parseExam] 内容截断:', content.length, '→', limit);

    console.log('[parseExam] 开始调用 DeepSeek...');
    const result = await parseExamPaper(trimmed);
    console.log('[parseExam] DeepSeek 返回题目数:', result.questions?.length);

    res.json({ code: 0, message: `解析完成，共提取 ${result.questions.length} 道题`, data: result });
  } catch (err) {
    console.error('[parseExam] 失败:', err.message);
    res.status(500).json({ code: 2001, message: 'AI 解析失败: ' + (err.message || '未知错误'), data: null });
  }
};

export const parseExamStream = async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ code: 1001, message: '请提供试卷内容', data: null });

  const limit = 80000;
  const trimmed = content.length > limit ? content.slice(0, limit) : content;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ phase: 'start', totalChars: trimmed.length });
    const result = await parseExamPaperStream(trimmed, (progress) => send(progress));
    send({ phase: 'done', questions: result.questions, count: result.questions.length });
  } catch (err) {
    console.error('[parseExamStream] 失败:', err.message);
    send({ phase: 'error', message: 'AI 解析失败: ' + (err.message || '未知错误') });
  } finally {
    res.end();
  }
};

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
    const { title, description, startTime, endTime, allowResubmit, questionIds, classIds, mode, maxAttempts, confirmWithoutStandardPackage } = req.body;
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

    const assignment = await prisma.assignment.create({
      data: {
        teacherId: req.user.id,
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        mode: mode || 'exam',
        allowResubmit: mode === 'practice' ? true : !!allowResubmit,
        maxAttempts: maxAttempts != null ? +maxAttempts : null,
        assignmentQuestions: {
          create: questionIds.map((qid, i) => ({ questionId: +qid, sortOrder: i + 1 })),
        },
        assignmentClasses: {
          create: classIds.map((cid) => ({ classId: +cid })),
        },
      },
    });
    logger.info({ assignmentId: assignment.id }, '作业已创建');
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

// ===================== 教师列表 =====================

export const getAllTeachers = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const where = { role: 'teacher', deletedAt: null };
    if (schoolId) where.teacherSchools = { some: { schoolId } };
    const list = await prisma.user.findMany({
      where,
      select: { id: true, username: true, realName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取教师列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 学校 & 班级管理（教师仅看自己的） =====================

export const getMySchools = async (req, res) => {
  try {
    const tss = await prisma.teacherSchool.findMany({
      where: { teacherId: req.user.id },
      include: { school: true },
    });
    res.json({ code: 0, message: 'ok', data: tss.map(ts => ts.school) });
  } catch (err) {
    logger.error({ err }, '获取我的学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getAllClasses = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ code: 0, message: 'ok', data: [] });
    const visibleIds = await getVisibleClassIds(req.user.id, schoolId);
    // 获取教师直连班级 ID
    const directIds = (await prisma.teacherClass.findMany({ where: { teacherId: req.user.id }, select: { classId: true } })).map(d => d.classId);
    const list = await prisma.class.findMany({
      where: { id: { in: visibleIds }, schoolId },
      include: { school: true, teacherClasses: { include: { teacher: { select: { id: true, username: true, realName: true } } } }, teamClasses: { select: { teamId: true } }, _count: { select: { studentClasses: true } } },
      orderBy: { createdAt: 'desc' },
    });
    // 标记团队班级和归属教师
    const result = list.map(c => ({
      ...c,
      isTeamClass: !directIds.includes(c.id),
      ownerTeacherName: c.teacherClasses?.[0]?.teacher?.realName || '',
    }));
    res.json({ code: 0, message: 'ok', data: result });
  } catch (err) {
    logger.error({ err }, '获取班级列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createClass = async (req, res) => {
  try {
    const { name, teamIds } = req.body;
    const schoolId = getSchoolId(req);
    if (!name || !schoolId) return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    // 归属校验（round 6）：① 不得在自己不属于的学校建班；② body.teamIds ⊆ 本人团队。均在任何写库动作之前
    if (!(await isTeacherInSchool(req.user.id, schoolId))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    if (!(await canTeacherManageTeams(req.user.id, teamIds))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    const cls = await prisma.class.create({
      data: { name, schoolId, teacherClasses: { create: { teacherId: req.user.id } } },
    });
    if (teamIds?.length) {
      await prisma.teamClass.createMany({
        data: teamIds.map(tid => ({ teamId: +tid, classId: cls.id })),
      });
    }
    logger.info({ classId: cls.id }, '教师创建了班级');
    res.json({ code: 0, message: '创建成功', data: cls });
  } catch (err) {
    logger.error({ err }, '创建班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, teamIds } = req.body;
    const schoolId = getSchoolId(req);
    // 归属校验（S-2）：必须在任何写库动作之前；未命中 → 403 零写入
    if (!(await canTeacherManageClass(req.user.id, id, schoolId))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    // 归属校验（round 6 · body 目标）：teamIds 必须 ⊆ 本人团队 —— 否则可把班级挂进他人团队，
    // 使该团队成员在 getVisibleClassIds 中获得写权限（C 实测 403→200 链的第一环）
    if (!(await canTeacherManageTeams(req.user.id, teamIds))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    await prisma.class.update({ where: { id: +id }, data: { name, schoolId } });
    if (teamIds !== undefined) {
      await prisma.teamClass.deleteMany({ where: { classId: +id } });
      if (teamIds.length > 0) {
        await prisma.teamClass.createMany({ data: teamIds.map(tid => ({ teamId: +tid, classId: +id })) });
      }
    }
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    logger.error({ err }, '更新班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteClass = async (req, res) => {
  try {
    const id = +req.params.id;
    // 归属校验（S-2）：必须在 $transaction 之外、之前完成；未命中 → 403 零写入
    if (!(await canTeacherManageClass(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    await prisma.$transaction([
      prisma.studentClass.deleteMany({ where: { classId: id } }),
      prisma.teacherClass.deleteMany({ where: { classId: id } }),
      prisma.assignmentClass.deleteMany({ where: { classId: id } }),
      prisma.class.delete({ where: { id } }),
    ]);
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const switchClassSchool = async (req, res) => {
  try {
    const classId = +req.params.id;
    const { newSchoolId } = req.body;
    if (!newSchoolId) return res.status(400).json({ code: 1001, message: '请选择目标学校', data: null });

    // 查班级 + 当前学校 + 教师权限
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { school: { select: { id: true, name: true } } },
    });
    if (!cls) return res.status(404).json({ code: 1004, message: '班级不存在', data: null });

    const oldSchoolId = cls.schoolId;
    if (oldSchoolId === newSchoolId) return res.status(400).json({ code: 1001, message: '目标学校与当前学校相同', data: null });

    // 验证教师属于当前班级
    const tc = await prisma.teacherClass.findFirst({ where: { teacherId: req.user.id, classId } });
    if (!tc) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    // 验证教师同时属于新旧两校
    const [oldBelongs, newBelongs] = await Promise.all([
      prisma.teacherSchool.findFirst({ where: { teacherId: req.user.id, schoolId: oldSchoolId } }),
      prisma.teacherSchool.findFirst({ where: { teacherId: req.user.id, schoolId: +newSchoolId } }),
    ]);
    if (!oldBelongs) return res.status(403).json({ code: 1003, message: '无权操作当前学校', data: null });
    if (!newBelongs) return res.status(403).json({ code: 1003, message: '你不属于目标学校', data: null });

    // 查目标学校信息
    const newSchool = await prisma.school.findUnique({ where: { id: +newSchoolId }, select: { id: true, name: true } });

    // 查出将被移除的团队
    const existingTeams = await prisma.teamClass.findMany({
      where: { classId },
      include: { team: { select: { name: true } } },
    });

    // 原子操作
    await prisma.$transaction([
      prisma.class.update({ where: { id: classId }, data: { schoolId: +newSchoolId } }),
      prisma.teamClass.deleteMany({ where: { classId } }),
    ]);

    const removedTeamNames = existingTeams.map(tc => tc.team.name);
    logger.info({ classId, oldSchoolId, newSchoolId, removedTeams: removedTeamNames }, '班级已切换学校');

    res.json({
      code: 0,
      message: `已从「${cls.school.name}」迁移至「${newSchool.name}」${removedTeamNames.length ? '，已退出团队：' + removedTeamNames.join('、') : ''}`,
      data: { oldSchoolId, newSchoolId: +newSchoolId, school: newSchool, removedTeams: removedTeamNames },
    });
  } catch (err) {
    logger.error({ err }, '切换班级学校失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 学生管理 =====================

export const getMyStudents = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { classId } = req.query;
    if (!schoolId) return res.json({ code: 0, message: 'ok', data: [] });

    // 查教师可见班级（直连+团队）
    let classIds = await getVisibleClassIds(req.user.id, schoolId);

    if (classId && classIds.includes(+classId)) {
      classIds = [+classId];
    }
    if (classIds.length === 0) return res.json({ code: 0, message: 'ok', data: [] });

    const { keyword } = req.query;
    const where = { role: 'student', studentClasses: { some: { classId: { in: classIds } } } };
    if (keyword) where.realName = { contains: keyword };

    const students = await prisma.user.findMany({
      where,
      select: {
        id: true, username: true, realName: true, createdAt: true,
        studentClasses: { include: { class: { include: { school: true } } } },
      },
      orderBy: { username: 'asc' },
    });
    res.json({ code: 0, message: 'ok', data: students });
  } catch (err) {
    logger.error({ err }, '获取学生列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const getMyClasses = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json({ code: 0, message: 'ok', data: [] });
    const list = await prisma.class.findMany({
      where: { schoolId },
      include: { school: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ code: 0, message: 'ok', data: list });
  } catch (err) {
    logger.error({ err }, '获取教师班级失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { realName, classId, newUsername } = req.body;

    // 先查当前学生
    const student = await prisma.user.findFirst({ where: { id: +id, role: 'student' } });
    if (!student) return res.status(404).json({ code: 1004, message: '学生不存在', data: null });
    // 归属校验（S-2）：既有 404 分支保持原位；此处必须在任何写库动作之前，未命中 → 403 零写入
    if (!(await canTeacherManageStudent(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    // 归属校验（round 6 · body 目标）：目标班级 classId ∈ 本人可见班级。
    // 源侧已由上方 canTeacherManageStudent 覆盖（不要求「全部源班级可见」= 保留多班共管语义）；
    // 缺此目标侧校验时，可把学生移入他人班级 ⇒ 他人教师即刻获得该生管理权（账号接管面）
    if (classId && !(await canTeacherManageClass(req.user.id, classId, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    const data = {};
    if (realName !== undefined) data.realName = realName;

    // 补全临时学号：如果当前用户名含 tmp_，且传入了新学号
    if (newUsername && student.username.startsWith('tmp_')) {
      const code = student.username.split('@')[1]; // 保留原学校代码
      const fullNew = newUsername.includes('@') ? newUsername : `${newUsername}@${code}`;

      // 显式查重，避免修改到已存在的学号
      const existing = await prisma.user.findUnique({ where: { username: fullNew } });
      if (existing && existing.id !== +id) {
        return res.status(400).json({ code: 1001, message: '该学号已被使用，无法保存', data: null });
      }

      data.username = fullNew;
      data.password = bcrypt.hashSync(newUsername.includes('@') ? newUsername.split('@')[0] : newUsername, 10);
    }

    // 如果姓名从"(待补全)"变为真实姓名，重置密码
    if (realName && student.realName === '(待补全)' && realName !== '(待补全)') {
      const sid = (data.username || student.username).split('@')[0];
      if (!sid.startsWith('tmp_')) {
        data.password = bcrypt.hashSync(sid, 10);
      }
    }

    await prisma.user.update({ where: { id: +id, role: 'student' }, data });
    // 更新班级
    if (classId) {
      await prisma.studentClass.deleteMany({ where: { studentId: +id } });
      await prisma.studentClass.create({ data: { studentId: +id, classId: +classId } });
    }
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '学号已存在', data: null });
    logger.error({ err }, '更新学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    // 归属校验（S-2）：必须在 $transaction 之外、之前完成；未命中 → 403 零写入
    if (!(await canTeacherManageStudent(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    // 软删除：移除班级关联 + 标记删除
    await prisma.$transaction([
      prisma.studentClass.deleteMany({ where: { studentId: +id } }),
      prisma.submission.deleteMany({ where: { studentId: +id } }),
      prisma.user.delete({ where: { id: +id, role: 'student' } }),
    ]);
    res.json({ code: 0, message: '删除成功', data: null });
  } catch (err) {
    logger.error({ err }, '删除学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const resetStudentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await prisma.user.findFirst({ where: { id: +id, role: 'student' } });
    if (!student) return res.status(404).json({ code: 1004, message: '学生不存在', data: null });
    // 归属校验（S-2）：越权判定优先于业务分支；未命中 → 403 零写入（不泄漏该生学号状态）
    if (!(await canTeacherManageStudent(req.user.id, id, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }

    // 密码重置为学号（去掉@学校代码部分）
    const sid = student.username.split('@')[0];
    if (sid.startsWith('tmp_')) {
      return res.status(400).json({ code: 1001, message: '该学生信息尚未补全，请先补全学号', data: null });
    }

    const newPassword = bcrypt.hashSync(sid, 10);
    await prisma.user.update({ where: { id: +id }, data: { password: newPassword } });
    logger.info({ studentId: id }, '学生密码已重置');
    res.json({ code: 0, message: `密码已重置为学号（${sid}）`, data: null });
  } catch (err) {
    logger.error({ err }, '重置学生密码失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const addStudent = async (req, res) => {
  try {
    const { username, realName, classId } = req.body;
    if (!username || !realName || !classId) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // 获取学校院校代码，拼接完整用户名
    const cls = await prisma.class.findUnique({ where: { id: +classId }, include: { school: true } });
    if (!cls) return res.status(400).json({ code: 1001, message: '班级不存在', data: null });
    // 归属校验（round 6 · body 目标）：目标班级必须落在本人可见班级内（既有 400 分支保持原位）
    if (!(await canTeacherManageClass(req.user.id, classId, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    const code = cls.school.officialCode || `school${cls.school.id}`;
    const fullUsername = username.includes('@') ? username : `${username}@${code}`;

    const student = await prisma.user.create({
      data: {
        username: fullUsername, realName, password: bcrypt.hashSync(username, 10), role: 'student',
        studentClasses: { create: { classId: +classId } },
      },
      select: { id: true, username: true, realName: true, role: true, createdAt: true },
    });
    logger.info({ studentId: student.id }, '学生已新增');
    res.json({ code: 0, message: '新增成功', data: student });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ code: 1001, message: '学号已存在', data: null });
    logger.error({ err }, '新增学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const batchAddStudents = async (req, res) => {
  try {
    const { classId, students } = req.body;
    if (!classId || !students?.length) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // 获取学校院校代码
    const cls = await prisma.class.findUnique({ where: { id: +classId }, include: { school: true } });
    if (!cls) return res.status(400).json({ code: 1001, message: '班级不存在', data: null });
    // 归属校验（round 6 · body 目标）：目标班级必须落在本人可见班级内（既有 400 分支保持原位）
    if (!(await canTeacherManageClass(req.user.id, classId, getSchoolId(req)))) {
      return res.status(403).json({ code: 1003, message: '无权操作', data: null });
    }
    const code = cls.school.officialCode || `school${cls.school.id}`;

    let success = 0;
    let errors = [];

    for (const s of students) {
      try {
        const sid = String(s.username ?? '').trim();
        const name = String(s.realName ?? '').trim();
        if (!sid && !name) continue; // 跳过空行

        // 只有姓名、缺学号 → 生成临时学号
        if (!sid && name) {
          const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const fullUsername = `${tmpId}@${code}`;
          const user = await prisma.user.create({
            data: {
              username: fullUsername,
              realName: name,
              password: bcrypt.hashSync('', 10), // 空密码hash，无法登录
              role: 'student',
            },
          });
          await prisma.studentClass.create({ data: { studentId: user.id, classId: +classId } });
          success++;
          continue;
        }

        // 只有学号、缺姓名 → 正常创建但姓名为"待补全"
        if (sid && !name) {
          const fullUsername = sid.includes('@') ? sid : `${sid}@${code}`;
          const user = await prisma.user.upsert({
            where: { username: fullUsername },
            update: {},
            create: {
              username: fullUsername,
              realName: '(待补全)',
              password: bcrypt.hashSync('', 10), // 空密码hash，无法登录
              role: 'student',
            },
          });
          await prisma.studentClass.upsert({
            where: { studentId_classId: { studentId: user.id, classId: +classId } },
            update: {},
            create: { studentId: user.id, classId: +classId },
          });
          success++;
          continue;
        }

        // 完整的学号+姓名
        const fullUsername = sid.includes('@') ? sid : `${sid}@${code}`;
        const user = await prisma.user.upsert({
          where: { username: fullUsername },
          update: { realName: name },
          create: {
            username: fullUsername,
            realName: name,
            password: bcrypt.hashSync(sid, 10),
            role: 'student',
          },
        });
        await prisma.studentClass.upsert({
          where: { studentId_classId: { studentId: user.id, classId: +classId } },
          update: {},
          create: { studentId: user.id, classId: +classId },
        });
        success++;
      } catch (e) {
        errors.push({ username: s.username, reason: e.message });
      }
    }

    logger.info({ classId, success, errors: errors.length }, '批量导入学生完成');
    res.json({ code: 0, message: `成功导入 ${success} 名，失败 ${errors.length} 名`, data: { success, errors } });
  } catch (err) {
    logger.error({ err }, '批量导入学生失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};


// ===================== 文件上传 =====================
import multer from 'multer';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../uploads/materials');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  defParamCharset: 'utf8',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') return cb(new Error('仅支持 zip 文件'));
    cb(null, true);
  },
});

export const uploadMaterial = (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ code: 1001, message: err.message, data: null });
    if (!req.file) return res.status(400).json({ code: 1001, message: '未选择文件', data: null });
    const url = `/uploads/materials/${req.file.filename}`;
    res.json({ code: 0, message: '上传成功', data: { url, name: req.file.originalname } });
  });
};

// ===================== AI 生成参考答案 =====================

export const generateReference = async (req, res) => {
  try {
    const { material, stem, scoringCriteria } = req.body;
    if (!stem?.trim()) return res.status(400).json({ code: 1001, message: '请提供题目内容', data: null });
    console.log('[generateReference] 开始生成参考答案...');
    const answer = await generateReferenceAnswer({ material, stem, scoringCriteria });
    console.log('[generateReference] 生成完成，长度:', answer.length);
    res.json({ code: 0, message: '参考答案已生成', data: { answer } });
  } catch (err) {
    console.error('[generateReference] 失败:', err.message);
    res.status(500).json({ code: 2001, message: 'AI 生成失败: ' + (err.message || '未知错误'), data: null });
  }
};
