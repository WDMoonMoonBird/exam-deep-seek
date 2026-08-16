import { SubmissionUseCases } from '../../../src/application/use-cases/submission.use-cases.js';
import { DomainError, EntityNotFoundError } from '../../../src/domain/errors.js';

const assignment = { id: 1, endTime: new Date('2099-01-01'), allowResubmit: false, mode: 'exam', maxAttempts: null, locked: false };

function makeRepo(overrides = {}) {
  return {
    findAssignmentContext: async () => assignment,
    findByAssignmentAndQuestion: async () => null,
    update: async (id, data) => ({ id, ...data }),
    create: async (data) => ({ id: 1, ...data }),
    resetByAssignment: async () => ({ count: 2 }),
    ...overrides,
  };
}

const baseCmd = { assignmentId: 1, studentId: 2, questionId: 3, answer: 'print(1)' };

describe('SubmissionUseCases.submit（等价 submitAnswer）', () => {
  it('新提交成功 → attemptCount=1，消息提交成功', async () => {
    let created = null;
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async (d) => { created = d; return d; } }) });
    const r = await uc.submit(baseCmd);
    expect(r.message).toBe('提交成功');
    expect(created.attemptCount).toBe(1);
    expect(created.status).toBe('submitted');
  });

  it('已提交且不允许补交 → DomainError(已提交，不可重复提交)', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findByAssignmentAndQuestion: async () => ({ id: 9, status: 'submitted', attemptCount: 1 }) }) });
    await expect(uc.submit(baseCmd)).rejects.toThrow('已提交，不可重复提交');
  });

  it('截止后非 force → DomainError；force → 成功且消息为自动提交', async () => {
    const expired = { ...assignment, endTime: new Date('2000-01-01') };
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => expired }) });
    await expect(uc.submit(baseCmd)).rejects.toThrow('已过截止时间');
    const r = await uc.submit({ ...baseCmd, force: true });
    expect(r.message).toBe('时间已截止，已自动提交');
  });

  it('作业锁定 → DomainError code=LOCKED', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => ({ ...assignment, locked: true }) }) });
    try {
      await uc.submit(baseCmd);
      throw new Error('应抛出');
    } catch (e) {
      expect(e instanceof DomainError).toBe(true);
      expect(e.code).toBe('LOCKED');
    }
  });

  it('练习模式达到最大次数 → 拒绝', async () => {
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => ({ ...assignment, mode: 'practice', maxAttempts: 2, allowResubmit: true }),
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'draft', attemptCount: 2 }),
      }),
    });
    await expect(uc.submit(baseCmd)).rejects.toThrow('已达最大提交次数');
  });

  it('已有提交 → attemptCount 递增', async () => {
    let updated = null;
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'draft', attemptCount: 1 }),
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      }),
    });
    await uc.submit(baseCmd);
    expect(updated.attemptCount).toBe(2);
  });

  it('作业不存在 → EntityNotFoundError', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => null }) });
    await expect(uc.submit(baseCmd)).rejects.toThrow(EntityNotFoundError);
  });
});

describe('SubmissionUseCases.saveDraft（等价 saveDraft）', () => {
  it('过期 → 跳过草稿（不报错）', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => ({ ...assignment, endTime: new Date('2000-01-01') }) }) });
    const r = await uc.saveDraft(baseCmd);
    expect(r.message).toBe('已过截止时间，跳过草稿');
  });
  it('已提交 → 跳过草稿', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findByAssignmentAndQuestion: async () => ({ id: 9, status: 'submitted' }) }) });
    const r = await uc.saveDraft(baseCmd);
    expect(r.message).toBe('已提交，跳过草稿');
  });
  it('保存草稿成功', async () => {
    let created = null;
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async (d) => { created = d; return d; } }) });
    const r = await uc.saveDraft(baseCmd);
    expect(r.message).toBe('草稿已保存');
    expect(created.status).toBe('draft');
  });
});

describe('SubmissionUseCases.retry（等价 retryAssignment）', () => {
  it('非练习模式 → DomainError', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo() });
    await expect(uc.retry({ assignmentId: 1, studentId: 2 })).rejects.toThrow('仅练习模式支持重新答题');
  });
  it('练习模式 → 重置提交', async () => {
    let reset = null;
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => ({ ...assignment, mode: 'practice' }),
        resetByAssignment: async (a, s) => { reset = { a, s }; return { count: 1 }; },
      }),
    });
    const r = await uc.retry({ assignmentId: 1, studentId: 2 });
    expect(r.message).toBe('已重置');
    expect(reset).toEqual({ a: 1, s: 2 });
  });
});