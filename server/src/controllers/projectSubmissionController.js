import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { getLanguageByExt } from '../utils/fileTree.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS_UPLOAD_DIR = path.join(__dirname, '../../uploads/projects');

// ==================== 提交列表 ====================

/** GET /:id/submissions — 获取提交列表（按班级分组） */
export const listSubmissions = async (req, res) => {
  try {
    const projectId = +req.params.id;
    const { status } = req.query;
    // ★L8（W2-P2）：**分页夹紧** —— 原实现把 pageSize 直接送进 take（无上限 ⇒ 可一次拉全表）与 skip（可为负）。
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));

    // 验证任务存在
    const project = await prisma.project.findFirst({
      where: { id: projectId, teacherId: req.user.id, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!project) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });

    const where = { projectId };
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      prisma.projectSubmission.findMany({
        where,
        select: {
          id: true, projectId: true, studentId: true,
          machineScore: true, astScore: true, aiScore: true,
          totalScore: true, finalScore: true, teacherFeedback: true,
          status: true, submittedAt: true, reviewedAt: true,
          student: { select: { id: true, username: true, realName: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.projectSubmission.count({ where }),
    ]);

    // 统计已提交/已评分/未提交
    const [submittedCount, gradedCount, totalStudents] = await Promise.all([
      prisma.projectSubmission.count({ where: { projectId, status: { not: 'draft' } } }),
      prisma.projectSubmission.count({ where: { projectId, status: { in: ['graded', 'reviewed', 'published'] } } }),
      (async () => {
        const classes = await prisma.projectClass.findMany({
          where: { projectId },
          select: { classId: true },
        });
        const classIds = classes.map(c => c.classId);
        if (!classIds.length) return 0;
        return prisma.studentClass.count({ where: { classId: { in: classIds } } });
      })(),
    ]);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        list,
        total,
        page: +page,
        pageSize: +pageSize,
        stats: {
          submitted: submittedCount,
          unsubmitted: Math.max(0, totalStudents - submittedCount),
          graded: gradedCount,
          totalStudents,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, '获取提交列表失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ==================== 提交详情 ====================

/** GET /:id/submissions/:submissionId — 获取提交详情（含文件树） */
export const getSubmissionDetail = async (req, res) => {
  try {
    const projectId = +req.params.id;
    const submissionId = +req.params.submissionId;

    // R6：校验任务归属（与 listSubmissions 一致）
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!project) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });
    if (project.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    const sub = await prisma.projectSubmission.findFirst({
      where: { id: submissionId, projectId },
      include: {
        student: { select: { id: true, username: true, realName: true } },
        files: true,
        project: { select: { id: true, title: true, machineWeight: true, astWeight: true, aiWeight: true } },
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });

    // 将 files 转为树形
    const fileTree = filesToTree(sub.files);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        ...sub,
        fileTree,
        files: undefined,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取提交详情失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ==================== 文件内容 ====================

/** GET /:id/submissions/:submissionId/file — 获取文件内容 */
export const getFileContent = async (req, res) => {
  try {
    const projectId = +req.params.id;
    const submissionId = +req.params.submissionId;
    const { path: filePath } = req.query;

    // R6：校验任务归属（与 listSubmissions 一致）
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!project) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });
    if (project.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    if (!filePath) {
      return res.status(400).json({ code: 1001, message: '缺少 path 参数', data: null });
    }

    // 防目录穿越
    if (filePath.includes('..')) {
      return res.status(400).json({ code: 1001, message: '非法路径', data: null });
    }

    // 清除开头的 /
    const safePath = filePath.replace(/^\/+/, '');

    // 构造磁盘完整路径
    const submissionDir = path.join(PROJECTS_UPLOAD_DIR, String(projectId), 'submissions', String(submissionId));
    const fullPath = path.resolve(submissionDir, safePath);

    // 再次验证在 submissionDir 内
    // ★L7（W2-P2）：改用 **path.relative** 判定 —— startsWith(resolve(dir)) 缺 path.sep 边界，
    //   形如 <dir>-evil/x 的同前缀兄弟目录会被误放行（与 projectController.resolveTempDir 同口径）。
    const rel = path.relative(path.resolve(submissionDir), fullPath);
    if (rel !== "" && (rel.startsWith(".." + path.sep) || rel === ".." || path.isAbsolute(rel))) {
      return res.status(400).json({ code: 1001, message: '非法路径', data: null });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ code: 1004, message: '文件不存在', data: null });
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return res.status(400).json({ code: 1001, message: '不能读取目录', data: null });
    }

    const language = getLanguageByExt(safePath);
    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      content = '[二进制文件，无法预览]';
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        path: safePath,
        language,
        content,
        size: stat.size,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取文件内容失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ==================== 评分保存 ====================

/** PUT /:id/submissions/:submissionId/review — 保存教师评分 */
export const reviewSubmission = async (req, res) => {
  try {
    const projectId = +req.params.id;
    const submissionId = +req.params.submissionId;
    const { finalScore, teacherFeedback, status = 'reviewed' } = req.body;

    // R6：校验任务归属（与 listSubmissions 一致）
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!project) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });
    if (project.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    if (finalScore === undefined || finalScore === null) {
      return res.status(400).json({ code: 1001, message: '请填写最终分数', data: null });
    }

    // ★M3（W2-P2）：**成绩完整性** —— 非有限数字直接拒；合法数字**夹紧 0..100**（与既有评分 clamp 同口径，未改阈值）；
    //   status 走**枚举白名单**（ProjectSubmissionStatus 里属于「教师审核放分」的两个），其余（draft/submitted/grading/graded）
    //   是系统态，教师端不得直接写入。
    const scoreNumRaw = Number(finalScore);
    if (!Number.isFinite(scoreNumRaw)) {
      return res.status(400).json({ code: 1001, message: "最终分数必须是数字", data: null });
    }
    const scoreNum = Math.min(100, Math.max(0, scoreNumRaw));
    const ALLOWED_REVIEW_STATUS = ["reviewed", "published"];
    if (!ALLOWED_REVIEW_STATUS.includes(status)) {
      return res.status(400).json({ code: 1001, message: "状态不合法", data: null });
    }

    const sub = await prisma.projectSubmission.findFirst({
      where: { id: submissionId, projectId },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });

    const updated = await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: {
        finalScore: scoreNum,
        teacherFeedback: teacherFeedback || null,
        status,
        reviewedAt: status === 'published' || status === 'reviewed' ? new Date() : undefined,
      },
    });

    logger.info({ submissionId, finalScore, status }, '评分已保存');
    res.json({ code: 0, message: '保存成功', data: updated });
  } catch (err) {
    logger.error({ err }, '保存评分失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ==================== 重新评分 ====================

/** POST /:id/submissions/:submissionId/regrade — 手动触发重新评分 */
export const regradeSubmission = async (req, res) => {
  try {
    const projectId = +req.params.id;
    const submissionId = +req.params.submissionId;

    // R6：校验任务归属（与 listSubmissions 一致）
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, teacherId: true },
    });
    if (!project) return res.status(404).json({ code: 1004, message: '任务不存在', data: null });
    if (project.teacherId !== req.user.id) return res.status(403).json({ code: 1003, message: '无权操作', data: null });

    const sub = await prisma.projectSubmission.findFirst({
      where: { id: submissionId, projectId },
      include: { project: true },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });

    // 设为 grading 状态，Worker 会扫描到并重新评分
    await prisma.projectSubmission.update({
      where: { id: submissionId },
      data: { status: 'grading' },
    });

    // P0 同步评分：直接在此处调用评分引擎
    try {
      const { gradeMachine, gradeAST, gradeAI, calculateTotal } = await import('../services/projectGrader.js');
      const submissionDir = path.join(PROJECTS_UPLOAD_DIR, String(projectId), 'submissions', String(submissionId));

      const [machineResult, astResult, aiResult] = await Promise.all([
        gradeMachine(submissionDir, sub.project.machineConfig || {}),
        gradeAST(submissionDir, 'java'),
        (async () => {
          const standardDir = path.join(PROJECTS_UPLOAD_DIR, String(projectId), 'standard');
          return gradeAI(standardDir, submissionDir, sub.project.aiPromptExtra || '');
        })(),
      ]);

      const totalScore = calculateTotal(
        machineResult.score, astResult.score, aiResult.score,
        { machine: sub.project.machineWeight, ast: sub.project.astWeight, ai: sub.project.aiWeight }
      );

      await prisma.projectSubmission.update({
        where: { id: submissionId },
        data: {
          machineScore: machineResult.score,
          machineFeedback: machineResult.feedback,
          astScore: astResult.score,
          astFeedback: astResult.feedback,
          aiScore: aiResult.score,
          aiFeedback: aiResult.feedback,
          totalScore,
          status: 'graded',
        },
      });

      logger.info({ submissionId, totalScore }, '重新评分完成');
    } catch (gradeErr) {
      logger.error({ err: gradeErr, submissionId }, '重新评分失败，保持原状态');
      await prisma.projectSubmission.update({
        where: { id: submissionId },
        data: { status: sub.status }, // 恢复原状态
      });
      return res.status(500).json({ code: 2001, message: '评分失败: ' + (gradeErr.message || '未知错误'), data: null });
    }

    res.json({ code: 0, message: '重新评分完成', data: { status: 'graded' } });
  } catch (err) {
    logger.error({ err }, '重新评分失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ==================== 工具函数 ====================

/**
 * 将扁平文件列表转为树形 JSON
 */
function filesToTree(files) {
  if (!files || files.length === 0) return [];

  /** @type {Map<string, any>} */
  const nodeMap = new Map();
  /** @type {Array} */
  const roots = [];

  for (const f of files) {
    if (f.type === 'directory') {
      nodeMap.set(f.path, {
        name: f.name,
        type: 'directory',
        path: f.path,
        children: [],
      });
    }
  }

  for (const f of files) {
    if (f.type === 'file') {
      const node = {
        name: f.name,
        type: 'file',
        path: f.path,
        language: f.language || 'plaintext',
        size: f.size || 0,
      };
      const parent = f.parentPath ? nodeMap.get(f.parentPath) : null;
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  for (const f of files) {
    if (f.type === 'directory') {
      const node = nodeMap.get(f.path);
      if (!node) continue;
      const parent = f.parentPath ? nodeMap.get(f.parentPath) : null;
      if (parent && parent.children) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };
  sortNodes(roots);

  return roots;
}
