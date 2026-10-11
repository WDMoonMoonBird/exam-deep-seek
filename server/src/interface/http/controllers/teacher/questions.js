/**
 * questions.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 83-158 · 219-370）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import fs from 'fs';
import path from 'path';
import prisma from '../../../../utils/prisma.js';
import { DomainError } from '../../../../domain/errors.js';
import logger from '../../../../utils/logger.js';
import { resolveSubQuestionScores } from '../../../../utils/scoring.js';
import { UPLOADS_ROOT, PROJECTS_ROOT, STANDARDS_ROOT } from '../../../../utils/projectPaths.js';

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

    const dir = path.join(UPLOADS_ROOT, q.attachmentUrl);
    if (!fs.existsSync(dir)) return res.json({ code: 0, message: 'ok', data: { tree: [] } });

    // 动态导入 fileTree（ESM 兼容）
    const { buildTree, flattenTree } = await import('../../../../utils/fileTree.js');
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
        const projectsRoot = PROJECTS_ROOT;
        const srcDir = path.resolve(projectsRoot, String(tempId));
        if (!srcDir.startsWith(projectsRoot + path.sep)) {
          return res.status(400).json({ code: 1001, message: '非法临时目录标识', data: null });
        }
        const destDir = path.join(STANDARDS_ROOT, String(q.id));
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
