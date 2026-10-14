/**
 * projectReviewController.js — 新实训题流程（Submission.type=project）的教师审核端点
 *
 * 与 legacy 体系B（ProjectSubmission + views/teacher/ProjectReview.vue）完全解耦：
 * 本控制器只服务写入 Submission 表的实训题提交，提供「标准答案包 + 学生版本 + AI 结构化评语」
 * 的三栏审核数据。成绩放行的唯一开关仍是 reviewed/published（R4），AI 评语绝不向学生透传（R3）。
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { standardDir, submissionDir, hasStandardPackage } from '../utils/projectPaths.js';
import { toTeacherView, parseProjectAnswer } from '../domain/services/project-view.js';
import { PROJECT_ROLE, OPEN_PROJECT_ROLE, buildProjectGradePrompt, buildOpenProjectGradePrompt } from '../infrastructure/ai/deepseek/index.js';
import { buildFileTree, filterProjectFiles } from '../services/projectContextBuilder.js';
import { buildTree, isIgnored } from '../utils/fileTree.js';
// t6：复用 reviewController 的统一归属校验助手（教师可见班级范围），避免同一防线两处实现漂移
import { isStudentVisibleToTeacher } from '../infrastructure/review/scope.js';
import { regradeProjectSubmissionCore } from '../infrastructure/review/project-review-ops.js';
import { MAX_TEXT_BYTES } from '../utils/projectArchive.js';
import fs from 'fs';
import path from 'path';
import { loadAssignmentSnapshot, resolveSnapshot } from '../services/assignmentSnapshot.js';

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

// ===================== 提示词预览用过滤读取（与实评 L0 过滤一致，所见即所用） =====================

function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf-8');
  } catch {
    return '';
  }
}

/** 按 L0 过滤（白名单/大小/未知探测）后的文件正文拼接，与实评 buildGradingContext 语义一致 */
function readFilteredDir(dir) {
  if (!dir || !fs.existsSync(dir)) return '';
  const tree = buildFileTree(dir);
  const { kept } = filterProjectFiles(tree, dir);
  return kept
    .filter(f => !f.dir)
    .map(f => (f.fold
      ? '// 文件过大（' + f.path + '，已跳过评分内容）'
      : '// 文件名: ' + f.path + '\n' + readFileSafe(path.join(dir, f.path))))
    .join('\n\n');
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
    // W2（R2-B2）：本条提交所属作业-题目的评分标准快照（读不到则回落活值）
    const std = resolveSnapshot(await loadAssignmentSnapshot(prisma, sub.assignmentId, sub.questionId), sub.question);
    if (sub.question?.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '该提交不是实训题', data: null });
    }
    // t6：按 id 直取入口的归属校验——学生必须在该教师可见班级内，否则 403 且不含学生文件/标准包/AI 评语
    if (!(await isStudentVisibleToTeacher(req.user.id, sub.studentId))) {
      return res.status(403).json({ code: 1003, message: '无权访问该提交', data: null });
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
          // W2：显示与评分同源（snapshot ?? live）
          material: std.material,
          scoringRubric: std.rubric,
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


// ===================== 重新评分（与编程题对齐：任意状态可重评） =====================

/**
 * POST /teacher/submissions/:id/project/regrade
 * 教师重新评分实训题（与编程题「重新评分」对齐）：
 *   - 任意状态（submitted / ai_graded / reviewed / published）均可重评；
 *   - 保留 status 与 finalScore（教师手动定案分不被清空），仅清 aiScore/aiFeedback，
 *     grading 重置 pending 并记录 prevStatus 供 Worker 完成后恢复；
 *   - 复用 enqueueProjectGrade 异步投递（信号量并发 3、内部重试 2 次，R5 不阻塞响应）。
 */
export const regradeProjectSubmission = async (req, res) => {
  try {
    // 行为全部下沉到 project-review-ops（教师端与管理员端同一实现；可见性=教师可见班级）
    const r = await regradeProjectSubmissionCore({
      submissionId: +req.params.id,
      confirm: String(req.query?.confirm ?? '') === '1',
      actorId: req.user?.id,
    });
    res.status(r.status).json(r.body);
  } catch (err) {
    logger.error({ err }, '实训题重评失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

// ===================== 实训题 AI 提示词查看（与实评共用构建函数） =====================

/**
 * GET /api/teacher/questions/:id/project-prompt-preview — 实训题提示词模板预览（编辑页用）。
 * 展示 system（角色）+ user 模板（标准包真实内容，学生代码占位）。
 * R6：预览必须等于实评——按题目有无标准工程包选择角色与 prompt 构建函数：
 *   standard → PROJECT_ROLE + buildProjectGradePrompt（含标准答案源码段）
 *   open     → OPEN_PROJECT_ROLE + buildOpenProjectGradePrompt（开放性题目，无标准答案段）
 * 判据与 services/projectGrading.js 一致：attachmentUrl 为空且标准包目录无文件即视为 open。
 */
export const getProjectQuestionPromptPreview = async (req, res) => {
  try {
    const q = await prisma.question.findUnique({
      where: { id: +req.params.id },
      select: { id: true, teacherId: true, title: true, material: true, scoringRubric: true, type: true, attachmentUrl: true },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    if (q.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '该题目不是实训题', data: null });
    }
    // t6：提示词模板含标准包源码/评分标准，仅题目归属教师可预览；拒绝响应体不含任何内容
    if (q.teacherId !== req.user.id) {
      return res.status(403).json({ code: 1003, message: '无权访问该题目', data: null });
    }

    const isOpen = !hasStandardPackage(q.id, q.attachmentUrl);
    const studentFiles = '【学生提交的工程文件将在此拼接（自动过滤依赖目录）】';
    // 预览与实评一致，标准包走 L0 过滤
    const user = isOpen
      ? buildOpenProjectGradePrompt({
        title: q.title,
        description: q.material || '',
        scoringRubric: q.scoringRubric || '',
        studentFiles,
      })
      : buildProjectGradePrompt({
        title: q.title,
        description: q.material || '',
        scoringRubric: q.scoringRubric || '',
        standardFiles: readFilteredDir(standardDir(q.id)),
        studentFiles,
      });
    res.json({
      code: 0,
      message: 'ok',
      data: { type: 'project', mode: isOpen ? 'open' : 'standard', system: isOpen ? OPEN_PROJECT_ROLE : PROJECT_ROLE, user },
    });
  } catch (err) {
    logger.error({ err }, '获取实训题提示词模板失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

/**
 * GET /api/teacher/review/:submissionId/project/prompt — 该次评分的实际实训题提示词（审核页用）。
 * R6：同样按有无标准工程包选择角色与 prompt 构建函数（预览必须等于实评）。
 */
export const getProjectSubmissionPrompt = async (req, res) => {
  try {
    const id = +req.params.id;
    const sub = await prisma.submission.findUnique({
      where: { id },
      include: { question: { select: { id: true, title: true, material: true, scoringRubric: true, type: true, attachmentUrl: true } } },
    });
    if (!sub) return res.status(404).json({ code: 1004, message: '提交不存在', data: null });
    if (sub.question?.type !== 'project') {
      return res.status(400).json({ code: 1001, message: '该提交不是实训题', data: null });
    }
    // t6：提示词含学生工程文件与标准包源码 → 先过归属校验
    if (!(await isStudentVisibleToTeacher(req.user.id, sub.studentId))) {
      return res.status(403).json({ code: 1003, message: '无权访问该提交', data: null });
    }

    const env = parseProjectAnswer(sub.answer);
    const version = env.currentVersion;
    const isOpen = !hasStandardPackage(sub.questionId, sub.question.attachmentUrl);
    // 预览与实评一致，标准包/学生版本均走 L0 过滤
    const studentFiles = version > 0
      ? readFilteredDir(submissionDir(sub.questionId, sub.studentId, version))
      : '【学生尚未提交有效版本】';
    const user = isOpen
      ? buildOpenProjectGradePrompt({
        title: sub.question.title,
        description: sub.question.material || '',
        scoringRubric: sub.question.scoringRubric || '',
        studentFiles,
      })
      : buildProjectGradePrompt({
        title: sub.question.title,
        description: sub.question.material || '',
        scoringRubric: sub.question.scoringRubric || '',
        standardFiles: readFilteredDir(standardDir(sub.questionId)),
        studentFiles,
      });
    res.json({
      code: 0,
      message: 'ok',
      data: { type: 'project', mode: isOpen ? 'open' : 'standard', system: isOpen ? OPEN_PROJECT_ROLE : PROJECT_ROLE, user },
    });
  } catch (err) {
    logger.error({ err }, '获取实训题提交提示词失败');
    res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
  }
};

