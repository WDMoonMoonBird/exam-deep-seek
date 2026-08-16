/**
 * 领域事件与事件总线契约。
 * 应用层在用例边界发布事件；基础设施层（SocketNotifier 等）订阅并推送。
 */

/** 事件类型常量 */
export const DomainEventType = Object.freeze({
  SUBMISSION_GRADED: 'submission.graded',
  PROJECT_GRADED: 'project.graded',
  SUBMISSION_SUBMITTED: 'submission.submitted',
});

/**
 * 领域事件基类。
 * @typedef {object} DomainEvent
 * @property {string} type 事件类型（DomainEventType 常量）
 * @property {number|string} occurredAt 发生时间戳（ms）
 * @property {object} payload 业务载荷
 */

/**
 * 评分完成事件载荷。
 * @typedef {object} GradingCompletedPayload
 * @property {number} schoolId 学校 ID（用于按学校推送）
 * @property {number|string} submissionId 提交 ID
 * @property {number} score 得分
 * @property {string} feedback 评语
 * @property {string} [status] 评分后状态
 */

/**
 * 事件总线契约（由基础设施层实现，如内存版/可观测版）。
 * @typedef {object} EventBus
 * @property {(e: DomainEvent) => Promise<void>} publish 发布事件
 * @property {(type: string, handler: (e: DomainEvent) => Promise<void>) => () => void} subscribe 订阅；返回退订函数
 */