import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma.js';
import { DomainError } from '../domain/errors.js';
import logger from '../utils/logger.js';
import { DEFAULT_MAX_SCORE } from '../constants.js';
import { resolveSubQuestionScores } from '../utils/scoring.js';
import { getVisibleClassIds, getTeamTeacherIds } from './teamController.js';
import { parseExamPaper, parseExamPaperStream, generateReferenceAnswer } from '../services/deepseek.js';

/** 获取教师当前学校ID（从 query 参数） */
function getSchoolId(req) { return req.query.schoolId ? +req.query.schoolId : null; }

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

    const standardDir = q.attachmentUrl ? path.join(__dirname, '../../uploads', q.attachmentUrl) : '';
    const standardFiles = readDirFiles(standardDir)
      .map(f => `// 文件名: ${f.path}\n${f.content}`).join('\n\n');

    // 读取学生提交文件：仅允许读取标准包目录，不接受任何外部路径（封堵任意文件读取）
    const studentDir = standardDir;
    const studentFiles = readDirFiles(studentDir)
      .map(f => `// 文件名: ${f.path}\n${f.content}`).join('\n\n');

    if (!standardFiles) {
      return res.status(400).json({ code: 1001, message: '未找到标准项目文件', data: null });
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

export const getAssignments = async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const schoolId = getSchoolId(req);
    const visibleIds = await getVisibleClassIds(req.user.id, schoolId);
    const where = { deletedAt: null, assignmentClasses: { some: { classId: { in: visibleIds } } } };
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

    // 去重统计已提交学生数（排除 draft）
    const assignmentIds = list.map(a => a.id);
    if (assignmentIds.length) {
      const subs = await prisma.submission.findMany({
        where: { assignmentId: { in: assignmentIds }, status: { not: 'draft' } },
        select: { assignmentId: true, studentId: true },
      });
      const countMap = {};
      const seen = new Set();
      for (const s of subs) {
        const key = `${s.assignmentId}_${s.studentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          countMap[s.assignmentId] = (countMap[s.assignmentId] || 0) + 1;
        }
      }
      for (const a of list) {
        a.submissionCount = countMap[a.id] || 0;
      }
    } else {
      for (const a of list) a.submissionCount = 0;
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
    // P4 缺陷修复：作业详情不露出软删除题目（to-one include 不支持 where，JS 层过滤）
    a.assignmentQuestions = (a.assignmentQuestions || []).filter(aq => aq.question && !aq.question.deletedAt);
    res.json({ code: 0, message: 'ok', data: a });
  } catch (err) {
    logger.error({ err }, '获取作业详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

export const createAssignment = async (req, res) => {
  try {
    const { title, description, startTime, endTime, allowResubmit, questionIds, classIds, mode, maxAttempts } = req.body;
    if (!title || !startTime || !endTime || !questionIds?.length || !classIds?.length) {
      return res.status(400).json({ code: 1001, message: '参数错误', data: null });
    }

    // Q9 强校验：作业包含实训题（type=project）时，该题必须已上传非空标准工程包，否则拒绝创建作业
    // 缺陷修复（P4）：查询过滤软删除题目；已删题目不可被选入新作业
    const questions = await prisma.question.findMany({ where: { id: { in: questionIds }, deletedAt: null } });
    if (questions.length !== questionIds.length) {
      return res.status(400).json({ code: 1001, message: '部分题目不存在或已删除，无法布置', data: null });
    }
    for (const q of questions) {
      if (q.type !== 'project') continue;
      const standardDir = path.join(__dirname, '../../uploads/project-questions', String(q.id), 'standard');
      let hasStandardPackage = false;
      if (fs.existsSync(standardDir)) {
        try {
          hasStandardPackage = fs.readdirSync(standardDir).length > 0;
        } catch {
          hasStandardPackage = false;
        }
      }
      if (!hasStandardPackage) {
        return res.status(400).json({ code: 1001, message: `题目「${q.title}」未上传标准工程包，无法布置`, data: null });
      }
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
