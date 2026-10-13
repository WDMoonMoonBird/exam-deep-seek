/**
 * ReviewUseCases —— 评分/审核用例（应用层）。
 * 迁移来源：reviewController 的 regradeSubmission / updateScore / reviewSubmission。
 * 依赖注入仓储与 AI 网关端口；不依赖 HTTP/Prisma。
 */

import { DomainError, EntityNotFoundError } from '../../domain/errors.js';
import { checkScoreRange, checkScoreSyntax, statusAfterReview } from '../../domain/services/finalScore.js';

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

    // R3-D5（G3）：已发布的提交重评后**保持 published**（不得打回 ai_graded 把学生端分数藏起来）
    await this.submissionRepo.update(sub.id, {
      aiScore: score, aiFeedback: feedback, status: statusAfterReview(sub.status) === 'published' ? 'published' : 'ai_graded',
    });
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
    // R3-D5（G2）：先做语法校验（不依赖题目上下文）—— 负数/NaN/小数/字符串一律可读文案拒绝
    const syntax = checkScoreSyntax(finalScore);
    if (!syntax.ok) throw new DomainError(syntax.message, 'INVALID_SCORE');

    const sub = await this.submissionRepo.findScoreContext(submissionId);
    if (!sub) throw new EntityNotFoundError('提交不存在');

    // 再按题目满分做范围校验（超范围同样 400，不再静默夹取）
    const ranged = checkScoreRange(syntax.value, sub.question?.maxScore);
    if (!ranged.ok) throw new DomainError(ranged.message, 'INVALID_SCORE');
    finalScore = ranged.value;

    const data = { finalScore: +finalScore };

    // R3-D5（G3）：仅 ai_graded / submitted 需要推进状态；published 已是学生可见态（保持不动）
    if (sub.status === 'ai_graded' || sub.status === 'submitted') {
      data.status = 'reviewed';
      data.reviewedAt = new Date();
      if (sub.status === 'ai_graded' && sub.question?.type !== 'project' && !sub.teacherFeedback) {
        data.teacherFeedback = sub.aiFeedback || '';
      }
    }

    const updated = await this.submissionRepo.update(submissionId, data);
    return { id: submissionId, finalScore: updated.finalScore, status: updated.status, teacherFeedback: updated.teacherFeedback };
  }

  /**
   * 教师审核通过（等价 reviewSubmission）：置 reviewed + 可选 finalScore/teacherFeedback。
   * @param {{submissionId: number, finalScore?: number, teacherFeedback?: string}} cmd
   */
  async review({ submissionId, finalScore, teacherFeedback }) {
    const hasScore = !(finalScore === undefined || finalScore === null || finalScore === '');
    let score = null;
    if (hasScore) {
      // R3-D5（G2）：传了分值就必须合法（NaN/小数/超范围 → 可读文案 + 400，不再 500）
      const syntax = checkScoreSyntax(finalScore);
      if (!syntax.ok) throw new DomainError(syntax.message, 'INVALID_SCORE');
      score = syntax.value;
    }
    const sub = await this.submissionRepo.findScoreContext(submissionId);
    if (hasScore) {
      const ranged = checkScoreRange(score, sub?.question?.maxScore);
      if (!ranged.ok) throw new DomainError(ranged.message, 'INVALID_SCORE');
      score = ranged.value;
    }
    // R3-D5（G3）：状态机 —— published 保持 published（学生端即时可见新分），其余 reviewed
    const data = { status: statusAfterReview(sub?.status), reviewedAt: new Date() };
    if (hasScore) data.finalScore = score;
    if (teacherFeedback !== undefined) data.teacherFeedback = teacherFeedback;
    await this.submissionRepo.update(submissionId, data);
  }
}