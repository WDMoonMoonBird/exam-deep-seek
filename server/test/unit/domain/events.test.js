import { DomainEventType } from '../../../src/domain/events.js';

describe('DomainEventType 事件类型常量', () => {
  it('三种事件类型（点分字符串），常量不可变', () => {
    expect(DomainEventType).toEqual({
      SUBMISSION_GRADED: 'submission.graded',
      PROJECT_GRADED: 'project.graded',
      SUBMISSION_SUBMITTED: 'submission.submitted',
    });
    expect(Object.isFrozen(DomainEventType)).toBe(true);
  });

  it('载荷形状为 JSDoc 契约、无运行时校验（见 DSGN：事件载荷无校验/无工厂）', () => {
    // events.js 仅导出类型常量；GradingCompletedPayload 形状只存在于注释 typedef
    expect(typeof DomainEventType.SUBMISSION_GRADED).toBe('string');
    expect(typeof DomainEventType.PROJECT_GRADED).toBe('string');
    expect(typeof DomainEventType.SUBMISSION_SUBMITTED).toBe('string');
  });
});
