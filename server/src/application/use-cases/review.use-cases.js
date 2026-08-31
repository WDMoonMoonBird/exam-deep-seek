/**
 * ReviewUseCases —— 评分/审核用例（应用层）。
 * 迁移来源：reviewController 的 regradeSubmission / updateScore / reviewSubmission。
 * 依赖注入仓储与 AI 网关端口；不依赖 HTTP/Prisma。
 */

import { DomainError, EntityNotFoundError } from '../../domain/errors.js';

export class ReviewUseCases {
  /**
   * @param {object} deps
   * @param {object} deps.submissionRepo SubmissionRepository 端口
   * @param {object} deps.aiGateway AiGateway 端口
   * @param {object} [deps.logger]
   */
  constructor({ submissionRepo, aiGateway, logger = console }) {
    this.submissionRepo = submissionRepo;
    this.aiGateway = aiGateway;
    this.logger = logger;
  }

  /**
   * 重新评分（等价 regradeSubmission）：取提交+题目 → AI 评分 → 更新 aiScore/aiFeedback/status。
   * @param {{submissionId: number}} cmd
   * @returns {Promise<{aiScore: number, aiFeedback: string}>}
   * @throws {EntityNotFoundError} 提交不存在
   */
  async regrade({ submissionId }) {
    const sub = await this.submissionRepo.findById(submissionId);
    if (!sub) throw new EntityNotFoundError('提交不存在');

    const sq = sub.subQuestion || sub.question?.subQuestions?.[0] || {};
    const { score, feedback } = await this.aiGateway.grade({
      material: sub.question?.material || null,
      subQuestionTitle: sq.title || '',
      subQuestionContent: sq.content || '',
      referenceAnswer: sq.referenceAnswer || '',
      studentAnswer: sub.answer || '',
      maxScore: sq.score || 100,
      scoringCriteria: sq.scoringCriteria || null,
    });

    await this.submissionRepo.update(sub.id, { aiScore: score, aiFeedback: feedback, status: 'ai_graded' });
    return { aiScore: score, aiFeedback: feedback };
  }

  /**
   * 教师手动改分（等价 updateScore）：finalScore + 状态机（ai_graded/submitted → reviewed）+ R3 规则
   * （实训题 AI 评语绝不透传给学生，须由教师手动填写 teacherFeedback）。
   * @param {{submissionId: number, finalScore: number}} cmd
   * @returns {Promise<{id: number, finalScore: number, status: string, teacherFeedback: string|null}>}
   * @throws {EntityNotFoundError} 提交不存在
   */
  async manualAdjust({ submissionId, finalScore }) {
    // 分值必须为有限非负数，拒绝负数/NaN/字符串注入
    const scoreNum = Number(finalScore);
    if (!Number.isFinite(scoreNum) || scoreNum < 0) {
      throw new DomainError('分数不合法：必须是有限非负数', 'INVALID_SCORE');
    }
    finalScore = scoreNum;
    const sub = await this.submissionRepo.findScoreContext(submissionId);
    if (!sub) throw new EntityNotFoundError('提交不存在');

    const data = { finalScore: +finalScore };

    if (sub.status === 'ai_graded') {
      data.status = 'reviewed';
      data.reviewedAt = new Date();
      if (sub.question?.type !== 'project' && !sub.teacherFeedback) {
        data.teacherFeedback = sub.aiFeedback || '';
      }
    }

    if (sub.status === 'submitted') {
      data.status = 'reviewed';
      data.reviewedAt = new Date();
    }

    const updated = await this.submissionRepo.update(submissionId, data);
    return { id: submissionId, finalScore: updated.finalScore, status: updated.status, teacherFeedback: updated.teacherFeedback };
  }

  /**
   * 教师审核通过（等价 reviewSubmission）：置 reviewed + 可选 finalScore/teacherFeedback。
   * @param {{submissionId: number, finalScore?: number, teacherFeedback?: string}} cmd
   */
  async review({ submissionId, finalScore, teacherFeedback }) {
    const data = { status: 'reviewed', reviewedAt: new Date() };
    if (finalScore !== undefined) data.finalScore = finalScore;
    if (teacherFeedback !== undefined) data.teacherFeedback = teacherFeedback;
    await this.submissionRepo.update(submissionId, data);
  }
}