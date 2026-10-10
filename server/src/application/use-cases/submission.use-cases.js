/**
 * SubmissionUseCases —— 学生提交用例（应用层）。
 * 迁移来源：studentController 的 submitAnswer / saveDraft / retryAssignment。
 */

import { DomainError, EntityNotFoundError } from '../../domain/errors.js';

export class SubmissionUseCases {
  constructor({ submissionRepo, logger = console }) {
    this.submissionRepo = submissionRepo;
    this.logger = logger;
  }

  /**
   * 载入作业上下文并做**班级归属守卫**（round 6）：
   *   ① 作业不存在 → EntityNotFoundError（404 形状不变）
   *   ② 作业未投放给该生班级 → DomainError('无权访问该作业', 'LOCKED') ⇒ 既有映射 403 + code 1003
   *   ③ 命中 → 落回原业务分支（锁定/截止/重复/次数）
   *
   * 归属判定下沉到仓储（findAssignmentContext 的第二参数），故 studentController 保持 **0 行改动**
   * （该文件实测 799 行，GodFile 阈值 800）。越权判定优先于业务分支，避免「是否锁定/是否截止」
   * 成为作业存在性与投放状态的预言机。
   *
   * @throws {EntityNotFoundError|DomainError}
   */
  async _loadOwnedAssignment(assignmentId, studentId) {
    const assignment = await this.submissionRepo.findAssignmentContext(assignmentId, studentId);
    if (assignment) return assignment;
    const exists = await this.submissionRepo.findAssignmentContext(assignmentId);
    if (!exists) throw new EntityNotFoundError('作业不存在');
    throw new DomainError('无权访问该作业', 'LOCKED');
  }

  /**
   * 提交答案（等价 submitAnswer）：锁定/截止/防重复/练习次数校验 → 落库（attemptCount 递增）。
   * @param {object} cmd
   * @param {number} cmd.assignmentId
   * @param {number} cmd.studentId
   * @param {number} cmd.questionId
   * @param {number} [cmd.subQuestionId]
   * @param {string} cmd.answer
   * @param {boolean} [cmd.force] 截止后强制提交（worker 自动提交用）
   * @returns {Promise<{message: string}>}
   * @throws {EntityNotFoundError} 作业不存在（404）
   * @throws {DomainError} code=LOCKED（403）/ 其余（400）
   */
  async submit({ assignmentId, studentId, questionId, subQuestionId, answer, force }) {
    const assignment = await this._loadOwnedAssignment(assignmentId, studentId);

    if (assignment.locked) throw new DomainError('作业已被锁定，无法提交', 'LOCKED');

    const isExpired = new Date() > new Date(assignment.endTime);
    const submission = await this.submissionRepo.findByAssignmentAndQuestion(assignmentId, studentId, +questionId, subQuestionId ? +subQuestionId : null);

    if (isExpired && !force) throw new DomainError('已过截止时间，不可提交');
    if (submission && submission.status !== 'draft' && !assignment.allowResubmit && !force) {
      throw new DomainError('已提交，不可重复提交');
    }
    if (assignment.mode === 'practice' && assignment.maxAttempts != null) {
      const currentCount = submission?.attemptCount || 0;
      if (currentCount >= assignment.maxAttempts) throw new DomainError('已达最大提交次数（' + assignment.maxAttempts + '次）');
    }

    const data = { answer, status: 'submitted', submittedAt: new Date() };
    data.attemptCount = submission ? (submission.attemptCount || 0) + 1 : 1;
    if (subQuestionId) data.subQuestionId = +subQuestionId;

    if (submission) {
      await this.submissionRepo.update(submission.id, data);
    } else {
      await this.submissionRepo.create({ assignmentId, studentId, questionId: +questionId, ...data });
    }

    return { message: force ? '时间已截止，已自动提交' : '提交成功' };
  }

  /**
   * 保存草稿（等价 saveDraft）：过期/已提交 → 跳过（不报错）。
   * @returns {Promise<{message: string}>}
   * @throws {EntityNotFoundError} 作业不存在
   * @throws {DomainError} code=LOCKED
   */
  async saveDraft({ assignmentId, studentId, questionId, subQuestionId, answer }) {
    const assignment = await this._loadOwnedAssignment(assignmentId, studentId);
    if (assignment.locked) throw new DomainError('作业已被锁定', 'LOCKED');
    if (new Date() > new Date(assignment.endTime)) return { message: '已过截止时间，跳过草稿' };

    const submission = await this.submissionRepo.findByAssignmentAndQuestion(assignmentId, studentId, +questionId, subQuestionId ? +subQuestionId : null);
    if (submission && submission.status !== 'draft') return { message: '已提交，跳过草稿' };

    if (submission) {
      await this.submissionRepo.update(submission.id, { answer });
    } else {
      await this.submissionRepo.create({
        assignmentId, studentId, questionId: +questionId, subQuestionId: subQuestionId ? +subQuestionId : null, answer, status: 'draft',
      });
    }
    return { message: '草稿已保存' };
  }

  /**
   * 练习模式重新答题（等价 retryAssignment）：重置全部提交为草稿。
   * @returns {Promise<{message: string}>}
   * @throws {EntityNotFoundError} 作业不存在
   * @throws {DomainError} code=LOCKED 或非练习模式
   */
  async retry({ assignmentId, studentId }) {
    const assignment = await this._loadOwnedAssignment(assignmentId, studentId);
    if (assignment.locked) throw new DomainError('作业已被锁定', 'LOCKED');
    if (assignment.mode !== 'practice') throw new DomainError('仅练习模式支持重新答题');
    await this.submissionRepo.resetByAssignment(assignmentId, studentId);
    return { message: '已重置' };
  }
}