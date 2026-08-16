import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { buildTree, isIgnored } from "../utils/fileTree.js";
import prisma from '../utils/prisma.js';
import { DomainError, EntityNotFoundError } from '../domain/errors.js';
import logger from '../utils/logger.js';
import { submissionDir } from '../utils/projectPaths.js';
import { toStudentView, parseProjectAnswer, serializeProjectAnswer } from '../utils/projectView.js';
import { extractZipSafely, decodeUploadName, MAX_TEXT_BYTES } from '../utils/projectArchive.js';
import { enqueueProjectGrade } from '../services/projectGrading.js';

// ===================== 实训题提交并发串行化 =====================

/**
 * 进程内互斥锁表：以 (assignmentId, studentId, questionId) 为键，串行化同一键的实训题提交。
 *
 * 【为什么不用 SELECT ... FOR UPDATE】
 * 提交临界区不止读写数据库——还包含版本目录 rmSync 与 zip 解压等本地文件操作，
 * 数据库事务锁无法覆盖文件系统。进程内 Promise 链锁能把「读库算版本 + 落盘 + 写库」
 * 整段串行化，双击/压测下不再出现相同 version 互删目录或 P2002 冲突。
 * 本服务为单实例部署，进程内锁即可正确工作，且不改变对外行为与错误返回。
 */
const submitLocks = new Map();

/**
 * 获取以 key 为键的互斥锁并执行 task，串行化同一键的提交。
 *
 * @param {string} key 锁键（如 "12:3:4"，即 assignmentId:studentId:questionId）
 * @param {() => Promise<any>} task 临界区任务
 * @returns {Promise<any>} task 的结果；task 抛错时原样向上抛出，由调用方 try/catch 处理
 */
async function withSubmitLock(key, task) {
  // 前一个请求无论成功/失败都已结束（或正在结束），用 .then(task, task) 等它完成再执行本次任务
  const prev = submitLocks.get(key) || Promise.resolve();
  const run = prev.then(task, task);
  // 本请求结束后若仍是最新锁则清除，避免 Map 无限增长；真实结果仍由 run 承载
  const settle = () => {
    if (submitLocks.get(key) === run) submitLocks.delete(key);
  };
  run.then(settle, settle);
  submitLocks.set(key, run);
  return run;
}

// ===================== 作业列表 =====================

export const getAssignments = async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const studentId = req.user.id;

    // 查学生所属班级
    const classIds = (await prisma.studentClass.findMany({
      where: { studentId },
      select: { classId: true },
    })).map((c) => c.classId);

    if (classIds.length === 0) {
      return res.json({ code: 0, message: 'ok', data: { list: [], total: 0 } });
    }

    // 找到这些班级的所有作业（包括已删除的）
    const acs = await prisma.assignmentClass.findMany({
      where: { classId: { in: classIds } },
      select: { assignmentId: true },
    });
    const assignmentIds = [...new Set(acs.map((a) => a.assignmentId))];

    // 查该学生有提交的作业
    const mySubs = await prisma.submission.findMany({
      where: { studentId, assignmentId: { in: assignmentIds } },
      select: { assignmentId: true },
      distinct: ['assignmentId'],
    });
    const submittedIds = [...new Set(mySubs.map(s => s.assignmentId))];

    // 构建 OR 条件：未删除的 + 已删除但有提交的
    const orConditions = [{ deletedAt: null }];
    if (submittedIds.length > 0) {
      orConditions.push({ id: { in: submittedIds } });
    }

    const where = {
      id: { in: assignmentIds },
      OR: orConditions,
    };

    const [list, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        select: {
          id: true, title: true, description: true, startTime: true, endTime: true, allowResubmit: true, createdAt: true, deletedAt: true, mode: true, locked: true,
          _count: { select: { assignmentQuestions: true } },
          assignmentQuestions: { select: { question: { select: { id: true, type: true } } } },
          submissions: {
            where: { studentId },
            select: { status: true, id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
      }),
      prisma.assignment.count({ where }),
    ]);

    res.json({ code: 0, message: 'ok', data: { list, total, page: +page, pageSize: +pageSize } });
  } catch (err) {
    logger.error({ err }, '获取作业列表失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};

// ===================== 提交答案 =====================

function mapSubmissionError(res, err) {
  if (err instanceof EntityNotFoundError) return res.status(404).json({ code: 1004, message: err.message, data: null });
  if (err instanceof DomainError) {
    if (err.code === 'LOCKED') return res.status(403).json({ code: 1003, message: err.message, data: null });
    return res.status(400).json({ code: 1001, message: err.message, data: null });
  }
  return null;
}

export const getAssignmentDetail = async (req, res) => {
  try {
    // 允许查看已删除的作业（只要学生曾提交过）
    const assignment = await prisma.assignment.findFirst({
      where: { id: +req.params.id },
      include: {
        assignmentQuestions: {
          include: { question: { include: { subQuestions: { orderBy: { sortOrder: 'asc' } } } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!assignment) return res.status(404).json({ code: 1004, message: '作业不存在', data: null });

    // 锁定检查
    if (assignment.locked) {
      return res.status(403).json({ code: 1003, message: '作业已被锁定，无法查看', data: null });
    }

    // 查已有提交
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: +req.params.id, studentId: req.user.id },
    });

    // 未发布的提交不返回评分/评语，但练习模式例外
    const isPractice = assignment.mode === 'practice';
    const safeSubmissions = submissions.map((s) => {
      if (s.status === 'published') return s;
      if (isPractice && (s.status === 'ai_graded' || s.status === 'reviewed')) return s;
      return { ...s, aiScore: null, aiFeedback: null, finalScore: null, teacherFeedback: null };
    });

    // 学生有权看答案的条件 → 考试已发布 或 练习已评分
    const canSeeAnswers = safeSubmissions.some(s =>
      s.status === 'published' ||
      (isPractice && (s.status === 'ai_graded' || s.status === 'reviewed'))
    );

    // strip 敏感字段：未出分时隐藏参考答案
    if (!canSeeAnswers) {
      for (const aq of assignment.assignmentQuestions) {
        const subQuestions = aq.question?.subQuestions || [];
        for (const sq of subQuestions) {
          sq.referenceAnswer = null;
          sq.scoringCriteria = null;
          if (sq.objectiveItems) {
            sq.objectiveItems = sq.objectiveItems.map(item => ({ ...item, answer: null }));
          }
        }
      }
    }

    res.json({ code: 0, message: 'ok', data: { assignment, submissions: safeSubmissions } });
  } catch (err) {
    logger.error({ err }, '获取作业详情失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};

export const submitAnswer = async (req, res) => {
  try {
    const { message } = await req.app.locals.submissionUseCases.submit({
      assignmentId: +req.params.id,
      studentId: req.user.id,
      questionId: req.body.questionId,
      subQuestionId: req.body.subQuestionId,
      answer: req.body.answer,
      force: req.body.force,
    });
    res.json({ code: 0, message, data: null });
  } catch (err) {
    const mapped = mapSubmissionError(res, err);
    if (mapped) return mapped;
    logger.error({ err }, '提交答案失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};

export const saveDraft = async (req, res) => {
  try {
    const { message } = await req.app.locals.submissionUseCases.saveDraft({
      assignmentId: +req.params.id,
      studentId: req.user.id,
      questionId: req.body.questionId,
      subQuestionId: req.body.subQuestionId,
      answer: req.body.answer,
    });
    res.json({ code: 0, message, data: null });
  } catch (err) {
    const mapped = mapSubmissionError(res, err);
    if (mapped) return mapped;
    logger.error({ err }, '保存草稿失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};

export const retryAssignment = async (req, res) => {
  try {
    const { message } = await req.app.locals.submissionUseCases.retry({
      assignmentId: +req.params.id,
      studentId: req.user.id,
    });
    logger.info({ assignmentId: +req.params.id, studentId: req.user.id }, '练习重新答题');
    res.json({ code: 0, message, data: null });
  } catch (err) {
    const mapped = mapSubmissionError(res, err);
    if (mapped) return mapped;
    logger.error({ err }, '重新答题失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};

// ===================== 查看成绩 =====================

export const getScores = async (req, res) => {
  try {
    // 查已发布 + 练习模式已评分
    const submissions = await prisma.submission.findMany({
      where: {
        studentId: req.user.id,
        OR: [
          { status: 'published' },
          { status: { in: ['ai_graded', 'reviewed'] }, assignment: { mode: 'practice' } },
        ],
      },
      include: {
        question: { select: { id: true, title: true, maxScore: true } },
        subQuestion: { select: { id: true, title: true } },
        assignment: { select: { id: true, title: true, mode: true } },
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
      agg.totalScore += s.finalScore ?? s.aiScore ?? 0;
      agg.subItems.push({
        title: s.subQuestion?.title || s.question.title,
        score: s.finalScore ?? s.aiScore,
        feedback: s.teacherFeedback || s.aiFeedback,
      });
    }
    res.json({ code: 0, message: 'ok', data: [...assignMap.values()] });
  } catch (err) {
    logger.error({ err }, '获取成绩失败');
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
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
    res.status(500).json({ code: 2001, message: "服务器错误: " + (err.message || "未知"), data: null });
  }
};

// ===================== 实训题 =====================

/**
 * 读取版本目录下所有文本文件内容。
 *
 * 复用 fileTree 的过滤规则（跳过 node_modules / 二进制后缀等），
 * 超过 MAX_TEXT_BYTES 的文件折叠为占位提示，避免响应体膨胀。
 *
 * @param {string} dir 版本目录绝对路径
 * @returns {Record<string, string>} 相对路径 → 文件内容
 */
function readVersionContents(dir) {
  /** @type {Record<string, string>} */
  const contents = {};
  if (!dir || !fs.existsSync(dir)) return contents;

  const walk = (base, rel = '') => {
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(base, entry.name);
      const relPath = rel + entry.name;
      if (entry.isDirectory()) {
        if (isIgnored(entry.name)) continue;
        walk(abs, relPath + '/');
        continue;
      }
      if (!entry.isFile()) continue;
      if (isIgnored(entry.name)) continue;

      try {
        const { size } = fs.statSync(abs);
        if (size > MAX_TEXT_BYTES) {
          contents[relPath] = `// 文件过大（${(size / 1024 / 1024).toFixed(2)} MB），已折叠不予预览`;
          continue;
        }
        contents[relPath] = fs.readFileSync(abs, 'utf-8');
      } catch {
        // 单个文件读失败不影响整体预览
      }
    }
  };

  walk(dir);
  return contents;
}

/**
 * 安全构建文件树，失败返回空数组。
 *
 * @param {string} dir 目录绝对路径
 * @returns {Array<object>} 文件树节点数组
 */
function buildTreeSafe(dir) {
  try {
    return buildTree(dir, { skipBaseDir: true });
  } catch {
    return [];
  }
}

/**
 * 读取某个版本的文件树与内容。
 *
 * @param {number} questionId 题目 ID
 * @param {number} studentId 学生 ID
 * @param {number} version 版本号
 * @returns {{tree: Array<object>, contents: Record<string, string>}|null} 目录不存在时返回 null
 */
function readVersionFiles(questionId, studentId, version) {
  if (!Number.isInteger(version) || version < 1) return null;
  let dir;
  try {
    dir = submissionDir(questionId, studentId, version);
  } catch {
    return null;
  }
  if (!fs.existsSync(dir)) return null;
  return { tree: buildTreeSafe(dir), contents: readVersionContents(dir) };
}

/**
 * 校验学生是否属于该作业所覆盖的班级，并返回作业记录。
 *
 * 防止学生通过篡改 URL 里的 assignmentId 访问不属于自己的作业。
 *
 * @param {number} assignmentId 作业 ID
 * @param {number} studentId 学生 ID
 * @returns {Promise<{ok: true, assignment: object}|{ok: false, code: number, message: string}>} 校验结果
 */
async function assertStudentInAssignment(assignmentId, studentId) {
  if (!Number.isInteger(assignmentId) || assignmentId < 1) {
    return { ok: false, code: 1001, message: '作业参数非法' };
  }

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId },
    select: { id: true, title: true, locked: true, mode: true, startTime: true, endTime: true, allowResubmit: true, maxAttempts: true },
  });
  if (!assignment) return { ok: false, code: 1004, message: '作业不存在' };
  if (assignment.locked) return { ok: false, code: 1003, message: '作业已被锁定' };

  // 学生必须在该作业所投放的某个班级内
  const classIds = (await prisma.studentClass.findMany({
    where: { studentId },
    select: { classId: true },
  })).map((c) => c.classId);

  if (classIds.length === 0) {
    return { ok: false, code: 1003, message: '无权访问该作业' };
  }

  const linked = await prisma.assignmentClass.findFirst({
    where: { assignmentId, classId: { in: classIds } },
    select: { assignmentId: true },
  });
  if (!linked) return { ok: false, code: 1003, message: '无权访问该作业' };

  return { ok: true, assignment };
}

/**
 * 校验题目属于该作业且为实训题。
 *
 * @param {number} assignmentId 作业 ID
 * @param {number} questionId 题目 ID
 * @returns {Promise<object|null>} 题目记录，不匹配时返回 null
 */
async function findProjectQuestionInAssignment(assignmentId, questionId) {
  if (!Number.isInteger(questionId) || questionId < 1) return null;

  const link = await prisma.assignmentQuestion.findFirst({
    where: { assignmentId, questionId },
    select: { assignmentId: true },
  });
  if (!link) return null;

  // 只取展示所需字段。绝不 include subQuestions（内含 referenceAnswer 标准答案）
  return prisma.question.findFirst({
    where: { id: questionId, type: 'project', deletedAt: null },
    select: {
      id: true,
      title: true,
      difficulty: true,
      maxScore: true,
      material: true,
      scoringRubric: true,
      type: true,
    },
  });
}

/**
 * GET /student/assignments/:assignmentId/project/:questionId
 *
 * 学生查看实训题：返回题面 + 本人最新提交（经 toStudentView 脱敏）+ 文件树。
 */
export const getProjectQuestion = async (req, res) => {
  try {
    const assignmentId = +req.params.assignmentId;
    const questionId = +req.params.questionId;
    const studentId = req.user.id;

    const guard = await assertStudentInAssignment(assignmentId, studentId);
    if (!guard.ok) {
      return res.status(guard.code === 1004 ? 404 : 403)
        .json({ code: guard.code, message: guard.message, data: null });
    }

    const question = await findProjectQuestionInAssignment(assignmentId, questionId);
    if (!question) {
      return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
    }

    // 该生在本作业本题下的提交（唯一键保证至多一行）
    const submission = await prisma.submission.findFirst({
      where: { assignmentId, studentId, questionId, subQuestionId: null },
    });

    let files = null;
    let studentView = null;

    if (submission) {
      // R2/R3/R4/R6：所有对外字段一律经 toStudentView 白名单裁剪
      studentView = toStudentView(submission, question);

      const envelope = parseProjectAnswer(submission.answer);
      if (submission.status !== 'draft' && envelope.currentVersion > 0) {
        files = readVersionFiles(questionId, studentId, envelope.currentVersion);
      }
    }

    res.json({
      code: 0,
      message: 'ok',
      data: {
        question: {
          id: question.id,
          title: question.title,
          difficulty: question.difficulty,
          maxScore: question.maxScore,
          material: question.material,
          scoringRubric: question.scoringRubric,
        },
        submission: studentView,
        files,
      },
    });
  } catch (err) {
    logger.error({ err }, '获取实训题失败');
    res.status(500).json({ code: 2001, message: '服务器错误: ' + (err.message || '未知'), data: null });
  }
};

/**
 * POST /student/assignments/:assignmentId/project/:questionId/submit
 *
 * 学生提交实训题压缩包。
 *
 * 关键语义：
 *   - R7：每次提交生成**新版本目录**，绝不删除历史版本
 *   - 同步返回文件树，**不等待 AI 评分**（评分触发属于 T03）
 *   - 解压失败 / 含穿越路径 → 整包拒收并回滚已创建的版本目录
 */
export const submitProject = (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      // multer 错误中文化
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE' ? '文件过大（超过 50MB 上限）' : uploadErr.message;
      return res.status(400).json({ code: 1001, message: msg, data: null });
    }
    if (!req.file) {
      return res.status(400).json({ code: 1001, message: '未选择文件', data: null });
    }
    return submitProjectCore(req, res);
  });
};

/**
 * submitProject 核心逻辑（multer 已解析出 req.file）。
 * 抽出便于测试，不改变路由注册与对外行为。
 */
export async function submitProjectCore(req, res) {
  /** 解压目标目录，失败时用于回滚 */
  let versionDir = null;

    try {
      const assignmentId = +req.params.assignmentId;
      const questionId = +req.params.questionId;
      const studentId = req.user.id;

      const guard = await assertStudentInAssignment(assignmentId, studentId);
      if (!guard.ok) {
        return res.status(guard.code === 1004 ? 404 : 403)
          .json({ code: guard.code, message: guard.message, data: null });
      }

      // ---- Q5：提交窗口校验（startTime ≤ now ≤ endTime，超时提交返回 403）----
      const submitNow = new Date();
      if (submitNow < new Date(guard.assignment.startTime)) {
        return res.status(403).json({ code: 1003, message: '作业尚未开始，不可提交', data: null });
      }
      if (submitNow > new Date(guard.assignment.endTime)) {
        return res.status(403).json({ code: 1003, message: '已过截止时间，不可提交', data: null });
      }

      const question = await findProjectQuestionInAssignment(assignmentId, questionId);
      if (!question) {
        return res.status(404).json({ code: 1004, message: '题目不存在', data: null });
      }

      // ---- 并发串行化：同一 (assignmentId, studentId, questionId) 的提交互斥执行 ----
      // 双击/压测下两个请求若同时走到「读旧提交 → 算版本号」，会得到相同 version：
      // 后到者 rmSync 掉先到者正在写入的版本目录，且 update/create 相互覆盖（P2002 冲突）。
      // 锁内重新读取已有提交，保证版本号计算与写库基于最新状态。实现说明见模块顶部。
      const lockKey = `${assignmentId}:${studentId}:${questionId}`;
      await withSubmitLock(lockKey, async () => {
        // 锁内重新读取已有提交：前一个请求可能刚创建/更新过，必须基于最新状态计算版本号
        const existing = await prisma.submission.findFirst({
          where: { assignmentId, studentId, questionId, subQuestionId: null },
        });
        const prevEnvelope = parseProjectAnswer(existing?.answer);
        const version = prevEnvelope.currentVersion + 1;

        // ---- Q5：审核锁定——reviewed / published 后禁止重交（教师撤回重审后重新开放）----
        if (existing && (existing.status === 'reviewed' || existing.status === 'published')) {
          return res.status(403).json({ code: 1003, message: '成绩已发布，如需重交请联系老师', data: null });
        }

        // ---- Q5：次数上限校验 ----
        // allowResubmit=false：已有正式提交（status !== 'draft'）即不可再交
        if (!guard.assignment.allowResubmit && existing && existing.status !== 'draft') {
          return res.status(403).json({ code: 1003, message: '该作业不允许重复提交', data: null });
        }
        // maxAttempts > 0：attemptCount 达到上限即拒绝
        if (
          guard.assignment.maxAttempts != null &&
          guard.assignment.maxAttempts > 0 &&
          (existing?.attemptCount ?? 0) >= guard.assignment.maxAttempts
        ) {
          return res.status(403).json({ code: 1003, message: `已达最大提交次数（${guard.assignment.maxAttempts}次）`, data: null });
        }

        // ---- 解压到版本目录（R7：新目录，不动旧版本）----
        versionDir = submissionDir(questionId, studentId, version);
        if (fs.existsSync(versionDir)) {
          // 理论上不该发生；若磁盘残留同版本目录，清掉重来以保证内容干净。
          // 注意这里删的是「本次要写的新版本目录」，不是历史版本。
          fs.rmSync(versionDir, { recursive: true, force: true });
        }

        const stats = extractZipSafely(req.file.buffer, versionDir);

        // ---- 组装版本信封 ----
        const now = new Date();
        const historyEntry = {
          version,
          submittedAt: now.toISOString(),
          originalName: decodeUploadName(req.file.originalname),
          fileCount: stats.fileCount,
          byteSize: stats.byteSize,
        };
        const envelope = {
          kind: 'project',
          currentVersion: version,
          history: [...prevEnvelope.history, historyEntry],
          grading: { state: 'pending', version, startedAt: null, finishedAt: null, error: null },
        };

        // ---- 写库（upsert：唯一键为 assignmentId+studentId+questionId+subQuestionId）----
        const payload = {
          status: 'submitted',
          answer: serializeProjectAnswer(envelope),
          attemptCount: version,
          submittedAt: now,
          // Q5：新提交清空旧分（防止审核放分后旧分残留）
          aiScore: null,
          finalScore: null,
          teacherFeedback: null,
        };

        const saved = existing
          ? await prisma.submission.update({ where: { id: existing.id }, data: payload })
          : await prisma.submission.create({
              data: { assignmentId, studentId, questionId, subQuestionId: null, ...payload },
            });

        logger.info(
          { assignmentId, questionId, studentId, version, fileCount: stats.fileCount },
          '实训题已提交'
        );

        // ---- 异步触发 AI 评分（R5：fire-and-forget，不阻塞返回）----
        enqueueProjectGrade(saved.id);

        // ---- 同步返回文件树，AI 评分在后台进行 ----
        res.json({
          code: 0,
          message: '提交成功',
          data: {
            submission: toStudentView(saved, question),
            files: { tree: buildTreeSafe(versionDir), contents: readVersionContents(versionDir) },
            version,
            status: 'submitted',
            submittedAt: now.toISOString(),
          },
        });
      });
    } catch (err) {
      // 解压/校验失败 → 回滚本次版本目录，避免留下半包
      if (versionDir) {
        try {
          fs.rmSync(versionDir, { recursive: true, force: true });
        } catch (rollbackErr) {
          logger.error({ err: rollbackErr, versionDir }, '回滚版本目录失败');
        }
      }

      // 路径穿越与压缩包非法属于客户端错误，返回 400 且不回显内部细节
      const msg = err?.message || '未知错误';
      const isClientError =
        msg.includes('Path traversal denied') ||
        msg.includes('压缩包') ||
        msg.includes('Invalid path segment');

      logger.error({ err }, '实训题提交失败');

      if (isClientError) {
        const safeMsg = msg.includes('Path traversal denied') || msg.includes('Invalid path segment')
          ? '压缩包内容非法'
          : msg;
        return res.status(400).json({ code: 1001, message: safeMsg, data: null });
      }
      res.status(500).json({ code: 2001, message: '服务器错误: ' + msg, data: null });
    }
}

/** 学生提交包上传：内存暂存，单包上限 50MB，仅允许 zip */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  defParamCharset: 'utf8',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') return cb(new Error('仅支持 zip 文件'));
    cb(null, true);
  },
});
