/**
 * student/project-submit.js —— 实训题压缩包提交（R2-B65：从 controllers/studentController.js 原样拆出）。
 *
 * 关键语义（与拆分前逐字一致）：
 *   - R2-B61：超限 413 + code1403；其它 multer 错误 400 + 可读 message；
 *   - R7：每次提交生成**新版本目录**，绝不删除历史版本；解压失败/含穿越路径整包拒收并回滚；
 *   - 同步返回文件树，AI 评分 fire-and-forget（enqueueProjectGrade）；
 *   - 并发串行化经 ./locks.js 的模块级单例锁表。
 */

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import prisma from '../../../../utils/prisma.js';
import logger from '../../../../utils/logger.js';
import { submissionDir } from '../../../../utils/projectPaths.js';
import { toStudentView, parseProjectAnswer, serializeProjectAnswer } from '../../../../domain/services/project-view.js';
import { extractZipSafely, decodeUploadName } from '../../../../utils/projectArchive.js';
import { enqueueProjectGrade } from '../../../../services/projectGrading.js';
import { withSubmitLock } from './locks.js';
import { assertStudentInAssignment, findProjectQuestionInAssignment } from './project-question.js';
import { buildTreeSafe, readVersionContents } from './version-files.js';

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
      // ★R2-B61（P1-4）：与教师侧**同口径** —— 超限 413 + code1403；其它 multer 错误 400 + 可读 message
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ code: 1403, message: '文件超过大小限制', data: null });
      }
      return res.status(400).json({ code: 1001, message: uploadErr.message, data: null });
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

      // ---- 提交窗口校验（startTime ≤ now ≤ endTime，超时提交返回 403）----
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

        // ---- 审核锁定——reviewed / published 后禁止重交（教师撤回重审后重新开放）----
        if (existing && (existing.status === 'reviewed' || existing.status === 'published')) {
          return res.status(403).json({ code: 1003, message: '成绩已发布，如需重交请联系老师', data: null });
        }

        // ---- 次数上限校验（US-C2 AC1：文案必须明确为「已达提交次数上限」）----
        // ★判定顺序：显式配置了次数上限（maxAttempts > 0）时**先按次数拦截**，
        //   否则「次数=1」的作业会先命中下一段的 allowResubmit 分支，给出泛化的
        //   「该作业不允许重复提交」，与 US-B1 AC2 / US-C2 AC1 要求的提示不一致。
        if (
          guard.assignment.maxAttempts != null &&
          guard.assignment.maxAttempts > 0 &&
          (existing?.attemptCount ?? 0) >= guard.assignment.maxAttempts
        ) {
          return res.status(403).json({ code: 1003, message: `已达提交次数上限（最多 ${guard.assignment.maxAttempts} 次）`, data: null });
        }
        // allowResubmit=false：已有正式提交（status !== 'draft'）即不可再交（未配置次数上限时的既有行为）
        if (!guard.assignment.allowResubmit && existing && existing.status !== 'draft') {
          return res.status(403).json({ code: 1003, message: '该作业不允许重复提交', data: null });
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
          // 新提交清空旧分（防止审核放分后旧分残留）
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
