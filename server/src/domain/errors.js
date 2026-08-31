// 领域错误体系 —— 领域层唯一错误出口。
// 应用层捕获 DomainError 并映射为 HTTP 错误码；基础设施层不得直接抛出领域错误。

export class DomainError extends Error {
  constructor(message, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

// 分值不合法（未设置 / 非正数 / 超出上限）
export class InvalidScoreError extends DomainError {
  constructor(message) {
    super(message, 'INVALID_SCORE');
    this.name = 'InvalidScoreError';
  }
}

// 提交窗口已关闭（未开始 / 已截止）
export class SubmissionClosedError extends DomainError {
  constructor(message) {
    super(message, 'SUBMISSION_CLOSED');
    this.name = 'SubmissionClosedError';
  }
}

// 同一学生同一作业重复提交
export class DuplicateSubmissionError extends DomainError {
  constructor(message) {
    super(message, 'DUPLICATE_SUBMISSION');
    this.name = 'DuplicateSubmissionError';
  }
}

// 聚合/实体不存在
export class EntityNotFoundError extends DomainError {
  constructor(message) {
    super(message, 'ENTITY_NOT_FOUND');
    this.name = 'EntityNotFoundError';
  }
}

// 非法状态流转（如已评分后再次评分）
export class IllegalStateError extends DomainError {
  constructor(message) {
    super(message, 'ILLEGAL_STATE');
    this.name = 'IllegalStateError';
  }
}
