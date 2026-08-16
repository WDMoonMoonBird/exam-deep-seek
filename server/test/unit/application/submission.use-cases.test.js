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

  it('questionId/subQuestionId 字符串 → 强转为数字落库', async () => {
    let created = null;
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async (d) => { created = d; return d; } }) });
    await uc.submit({ ...baseCmd, questionId: '3', subQuestionId: '5' });
    expect(created.questionId).toBe(3);
    expect(created.subQuestionId).toBe(5);
    expect(created.assignmentId).toBe(1);
    expect(created.studentId).toBe(2);
  });

  it('不带 subQuestionId → create 不含 subQuestionId 字段', async () => {
    let created = null;
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async (d) => { created = d; return d; } }) });
    await uc.submit(baseCmd);
    expect(created.subQuestionId).toBeUndefined();
  });

  it('已提交且不允许补交 → DomainError(已提交，不可重复提交)', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findByAssignmentAndQuestion: async () => ({ id: 9, status: 'submitted', attemptCount: 1 }) }) });
    await expect(uc.submit(baseCmd)).rejects.toThrow('已提交，不可重复提交');
  });

  it('已提交 + force → 绕过防重复校验，attemptCount 递增（update 路径）', async () => {
    let updated = null;
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'submitted', attemptCount: 2 }),
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      }),
    });
    const r = await uc.submit({ ...baseCmd, force: true });
    expect(r.message).toBe('时间已截止，已自动提交');
    expect(updated.attemptCount).toBe(3);
  });

  it('allowResubmit=true + 已提交 → 允许重复提交', async () => {
    let updated = null;
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => ({ ...assignment, allowResubmit: true }),
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'submitted', attemptCount: 1 }),
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      }),
    });
    const r = await uc.submit(baseCmd);
    expect(r.message).toBe('提交成功');
    expect(updated.attemptCount).toBe(2);
  });

  it('截止后非 force → DomainError；force → 成功且消息为自动提交', async () => {
    const expired = { ...assignment, endTime: new Date('2000-01-01') };
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => expired }) });
    await expect(uc.submit(baseCmd)).rejects.toThrow('已过截止时间');
    const r = await uc.submit({ ...baseCmd, force: true });
    expect(r.message).toBe('时间已截止，已自动提交');
  });

  it('截止检查先于防重复检查：过期且已提交（非 force）→ 报截止而非重复提交', async () => {
    const expired = { ...assignment, endTime: new Date('2000-01-01') };
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => expired,
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'submitted', attemptCount: 1 }),
      }),
    });
    await expect(uc.submit(baseCmd)).rejects.toThrow('已过截止时间，不可提交');
  });

  it('过期 + 已提交 + force → 允许提交，attemptCount 递增', async () => {
    let updated = null;
    const expired = { ...assignment, endTime: new Date('2000-01-01') };
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => expired,
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'submitted', attemptCount: 1 }),
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      }),
    });
    const r = await uc.submit({ ...baseCmd, force: true });
    expect(r.message).toBe('时间已截止，已自动提交');
    expect(updated.attemptCount).toBe(2);
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

  it('练习模式 maxAttempts=0 且无历史提交 → 拒绝（0>=0）', async () => {
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => ({ ...assignment, mode: 'practice', maxAttempts: 0 }),
      }),
    });
    await expect(uc.submit(baseCmd)).rejects.toThrow('已达最大提交次数（0次）');
  });

  it('练习模式未达上限 → 允许提交', async () => {
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => ({ ...assignment, mode: 'practice', maxAttempts: 5, allowResubmit: true }),
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'draft', attemptCount: 1 }),
      }),
    });
    const r = await uc.submit(baseCmd);
    expect(r.message).toBe('提交成功');
  });

  it('已有提交（attemptCount 为空）→ attemptCount 兜底为 1', async () => {
    let updated = null;
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'draft', attemptCount: null }),
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      }),
    });
    await uc.submit(baseCmd);
    expect(updated.attemptCount).toBe(1);
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

  it('force=true 但未过期 → 成功但消息仍为「时间已截止，已自动提交」（记录为轻微缺陷证据）', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo() });
    const r = await uc.submit({ ...baseCmd, force: true });
    expect(r.message).toBe('时间已截止，已自动提交'); // 与事实不符：作业并未过期
  });

  it('作业不存在 → EntityNotFoundError', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => null }) });
    await expect(uc.submit(baseCmd)).rejects.toThrow(EntityNotFoundError);
  });

  it('仓储 create 抛错 → 异常原样传播', async () => {
    const boom = new Error('db down');
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async () => { throw boom; } }) });
    await expect(uc.submit(baseCmd)).rejects.toBe(boom);
  });

  it('仓储 update 抛错 → 异常原样传播', async () => {
    const boom = new Error('db down');
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'draft', attemptCount: 1 }),
        update: async () => { throw boom; },
      }),
    });
    await expect(uc.submit(baseCmd)).rejects.toBe(boom);
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
  it('保存草稿成功（无历史提交 → create）', async () => {
    let created = null;
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async (d) => { created = d; return d; } }) });
    const r = await uc.saveDraft(baseCmd);
    expect(r.message).toBe('草稿已保存');
    expect(created.status).toBe('draft');
    expect(created.subQuestionId).toBeNull(); // 无 subQuestionId → 显式 null
  });
  it('已有草稿 → 走 update 路径仅更新 answer', async () => {
    let updated = null;
    let created = false;
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findByAssignmentAndQuestion: async () => ({ id: 9, status: 'draft', attemptCount: 1 }),
        update: async (id, data) => { updated = { id, ...data }; return updated; },
        create: async () => { created = true; return {}; },
      }),
    });
    const r = await uc.saveDraft({ ...baseCmd, answer: 'print(2)' });
    expect(r.message).toBe('草稿已保存');
    expect(updated).toEqual({ id: 9, answer: 'print(2)' });
    expect(created).toBe(false);
  });
  it('带 subQuestionId → create 强转为数字', async () => {
    let created = null;
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async (d) => { created = d; return d; } }) });
    await uc.saveDraft({ ...baseCmd, subQuestionId: '7' });
    expect(created.subQuestionId).toBe(7);
    expect(created.questionId).toBe(3);
  });
  it('作业不存在 → EntityNotFoundError', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => null }) });
    await expect(uc.saveDraft(baseCmd)).rejects.toThrow(EntityNotFoundError);
  });
  it('作业锁定 → DomainError code=LOCKED', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => ({ ...assignment, locked: true }) }) });
    try {
      await uc.saveDraft(baseCmd);
      throw new Error('应抛出');
    } catch (e) {
      expect(e instanceof DomainError).toBe(true);
      expect(e.code).toBe('LOCKED');
    }
  });
  it('仓储 create 抛错 → 异常原样传播', async () => {
    const boom = new Error('db down');
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ create: async () => { throw boom; } }) });
    await expect(uc.saveDraft(baseCmd)).rejects.toBe(boom);
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
  it('作业不存在 → EntityNotFoundError', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => null }) });
    await expect(uc.retry({ assignmentId: 9, studentId: 2 })).rejects.toThrow(EntityNotFoundError);
  });
  it('作业锁定 → DomainError code=LOCKED', async () => {
    const uc = new SubmissionUseCases({ submissionRepo: makeRepo({ findAssignmentContext: async () => ({ ...assignment, locked: true }) }) });
    try {
      await uc.retry({ assignmentId: 1, studentId: 2 });
      throw new Error('应抛出');
    } catch (e) {
      expect(e instanceof DomainError).toBe(true);
      expect(e.code).toBe('LOCKED');
    }
  });
  it('仓储 resetByAssignment 抛错 → 异常原样传播', async () => {
    const boom = new Error('db down');
    const uc = new SubmissionUseCases({
      submissionRepo: makeRepo({
        findAssignmentContext: async () => ({ ...assignment, mode: 'practice' }),
        resetByAssignment: async () => { throw boom; },
      }),
    });
    await expect(uc.retry({ assignmentId: 1, studentId: 2 })).rejects.toBe(boom);
  });
});
