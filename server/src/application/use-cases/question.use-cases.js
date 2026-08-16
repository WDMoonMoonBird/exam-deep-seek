/**
 * QuestionUseCases —— 题库用例（应用层）。
 * 迁移来源：teacherController.createQuestion 的 code 分支（校验 + 创建）。
 */

import { DomainError } from '../../domain/errors.js';
import { resolveSubQuestionScores } from '../../domain/services/scoring.service.js';

export class QuestionUseCases {
  constructor({ questionRepo, logger = console }) {
    this.questionRepo = questionRepo;
    this.logger = logger;
  }

  /**
   * 创建编程题（等价 createQuestion code 分支）：参数校验 → 分值校验 → 落库。
   * @param {object} cmd
   * @param {number} cmd.teacherId
   * @param {string} cmd.title
   * @param {Array} cmd.subQuestions 小题（score 必填且 >0）
   * @param {number} [cmd.maxScore]
   * @param {string} [cmd.difficulty]
   * @param {string} [cmd.material]
   * @param {string} [cmd.attachmentUrl]
   * @param {object} [cmd.objectiveSettings]
   * @returns {Promise<object>} 创建的题目（含小题）
   * @throws {DomainError} 参数不合法（controller 映射 400/1001）
   * @throws {InvalidScoreError} 分值不合法（controller 映射 400/1001）
   */
  async create({ teacherId, title, maxScore, difficulty, material, attachmentUrl, objectiveSettings, subQuestions }) {
    if (!title || !subQuestions?.length) throw new DomainError('参数错误', 'INVALID_ARGUMENT');
    if (title.length > 200) throw new DomainError('标题不能超过200字', 'INVALID_ARGUMENT');
    if (material?.length > 50000) throw new DomainError('题目材料过长', 'INVALID_ARGUMENT');

    const { resolved, totalScore } = resolveSubQuestionScores(subQuestions);
    return this.questionRepo.create({
      teacherId,
      title,
      maxScore: totalScore,
      difficulty,
      material,
      attachmentUrl,
      objectiveSettings,
      subQuestions: resolved,
    });
  }
}