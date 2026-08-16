/**
 * projectReviewController.js — 新实训题流程（Submission.type=project）的教师审核端点
 *
 * 与 legacy 体系B（ProjectSubmission + views/teacher/ProjectReview.vue）完全解耦：
 * 本控制器只服务写入 Submission 表的实训题提交，提供「标准答案包 + 学生版本 + AI 结构化评语」
 * 的三栏审核数据。成绩放行的唯一开关仍是 reviewed/published（R4），AI 评语绝不向学生透传（R3）。
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { standardDir, submissionDir } from '../utils/projectPaths.js';
import { toTeacherView, parseProjectAnswer, serializeProjectAnswer } from '../utils/projectView.js';
import { enqueueProjectGrade } from '../services/projectGrading.js';
import { buildTree, isIgnored } from '../utils/fileTree.js';
import { MAX_TEXT_BYTES } from '../utils/projectArchive.js';
import fs from 'fs';
import path from 'path';

// ===================== 文件收集（复用 fileTree 的忽略规则） =====================

function collectFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return { tree: [], contents: {} };
  try {
    const tree = buildTree(dir, { skipBaseDir: true });
    const contents = {};
    const walk = (base, rel = '') => {
      let entries;
      try {
        entries = fs.readdirSync(base, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        // 与 buildTree 共用忽略规则（IGNORED_DIRS / IGNORED_EXTENSIONS）：
        // node_modules/.git/二进制/编译产物等一律不读，避免把整包内容拖进响应与 AI 上下文
        if (isIgnored(entry.name)) continue;
        const abs = path.join(base, entry.name);
        const relPath = rel + entry.name;
        if (entry.isDirectory()) {
          walk(abs, relPath + '/');
        } else if (entry.isFile()) {
          try {
            // 超大文件折叠为占位，避免整段读进内存/响应膨胀（上限与项目其它预览一致）
            const { size } = fs.statSync(abs);
            if (size > MAX_TEXT_BYTES) {
              contents[relPath] = `// 文件过大（${(size / 1024 / 1024).toFixed(2)} MB，超过 ${MAX_TEXT_BYTES} 字节上限），内容已折叠，请下载查看`;
              continue;
            }
            contents[relPath] = fs.readFileSync(abs, 'utf-8');
          } catch {
            contents[relPath] = '// 无法读取文件内容';
          }
        }
      }
    };
    walk(dir);
    return { tree, contents };
  } catch (e) {
    logger.warn({ err: e.message, dir }, '收集实训题文件失败');
    return { tree: [], contents: {} };
  }
}

// ===================== 审核数据 =====================

export const getProjectReview = async (req, res) => {
  try {
    const id = +req.params.id;
    const sub = await prisma.submission.findUnique({
      where: { id },
      include: {
        student: { select: { id: true, username: true, realName: true } },
        question: { select: { id: true, title: true, material: true, scoringRubric: true, maxScore: true, type: true } },
        assignment: { select: { id: true, title: true, mode: true } },
      },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    if (sub.question?.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '该提交不是实训题', data: null });
    }

    const env = parseProjectAnswer(sub.answer);
    const version = env.currentVersion;

    // 学生版本文件（按版本目录隔离，R7）
    const studentFiles = version > 0
      ? collectFiles(submissionDir(sub.questionId, sub.studentId, version))
      : { tree: [], contents: {} };

    // 标准答案包（教师上传，绝不可对学生暴露，R2/R3；这里仅向教师审核通道提供）
    const standardFiles = collectFiles(standardDir(sub.questionId));

    // AI 结构化评语（存于 aiFeedback，JSON；不在学生视图出现，R3）
    let aiResult = null;
    try {
      aiResult = sub.aiFeedback ? JSON.parse(sub.aiFeedback) : null;
    } catch {
      aiResult = { overallComment: sub.aiFeedback || '' };
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        submission: toTeacherView(sub),
        question: {
          id: sub.question.id,
          title: sub.question.title,
          material: sub.question.material,
          scoringRubric: sub.question.scoringRubric,
          maxScore: sub.question.maxScore,
        },
        assignment: sub.assignment,
        student: sub.student,
        version,
        standardFiles,
        studentFiles,
        aiResult,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取实训题审核数据失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};


// ===================== 重试评分（Q1 定案：教师一键重评） =====================

/**
 * POST /teacher/submissions/:id/project/regrade
 * 教师一键重试/重评实训题：
 *   - 仅允许 submitted（含评分异常 grading.state=failed）与 ai_graded 状态；
 *   - 重评前清空旧分（aiScore/aiFeedback/finalScore），状态回 submitted，grading 重置 pending；
 *   - 复用 enqueueProjectGrade 异步投递（信号量并发 3、内部重试 2 次，R5 不阻塞响应）。
 */
export const regradeProjectSubmission = async (req, res) => {
  try {
    const id = +req.params.id;
    const sub = await prisma.submission.findUnique({
      where: { id },
      include: { question: { select: { type: true } } },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    if (sub.question?.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '非实训题提交', data: null });
    }
    if (sub.status !== 'submitted' && sub.status !== 'ai_graded') {
      return res.status(400).json({ code: 1001, message: '当前状态不可重评（仅待评分/已评分可重评）', data: null });
    }

    // 重置版本信封的评分任务态
    const env = parseProjectAnswer(sub.answer);
    env.grading = { state: 'pending', version: env.currentVersion, startedAt: null, finishedAt: null, error: null };

    await prisma.submission.update({
      where: { id },
      data: {
        status: 'submitted',
        aiScore: null,
        aiFeedback: null,
        finalScore: null,
        answer: serializeProjectAnswer(env),
      },
    });

    // 异步投递（fire-and-forget，R5）
    enqueueProjectGrade(id);

    logger.info({ submissionId: id }, '实训题已重新触发评分');
    res.json({ code: 0, message: '已重新触发评分', data: null });
  } catch (err) {
    logger.error({ err }, '实训题重评失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};
