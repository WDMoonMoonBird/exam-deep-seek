import { ReviewUseCases } from '../../../src/application/use-cases/review.use-cases.js';
import { EntityNotFoundError } from '../../../src/domain/errors.js';

function makeRepo(overrides = {}) {
  return {
    findById: async () => null,
    findScoreContext: async () => null,
    update: async (id, data) => ({ id, ...data }),
    ...overrides,
  };
}

const makeSub = (overrides = {}) => ({
  id: 1,
  answer: 'print(1)',
  question: { material: null, subQuestions: [{ id: 10, title: '小题1', content: '<p>c</p>', referenceAnswer: 'print(1)', score: 100, scoringCriteria: null }] },
  subQuestion: null,
  ...overrides,
});

describe('ReviewUseCases.regrade（等价 regradeSubmission）', () => {
  it('成功：调用 AI 评分并更新 aiScore/aiFeedback/status', async () => {
    const sub = makeSub();
    let updated = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findById: async () => sub,
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      }),
      aiGateway: { grade: async () => ({ score: 88, feedback: '很好' }) },
    });
    const r = await uc.regrade({ submissionId: 1 });
    expect(r).toEqual({ aiScore: 88, aiFeedback: '很好' });
    expect(updated).toEqual({ id: 1, aiScore: 88, aiFeedback: '很好', status: 'ai_graded' });
  });

  it('提交不存在 → 抛 EntityNotFoundError', async () => {
    const uc = new ReviewUseCases({ submissionRepo: makeRepo(), aiGateway: { grade: async () => ({ score: 0, feedback: '' }) } });
    await expect(uc.regrade({ submissionId: 99 })).rejects.toThrow(EntityNotFoundError);
  });

  it('无小题时用空对象兜底并传默认 maxScore 100', async () => {
    let gradeArgs = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ findById: async () => makeSub({ question: null, subQuestion: null }) }),
      aiGateway: { grade: async (args) => { gradeArgs = args; return { score: 50, feedback: 'f' }; } },
    });
    await uc.regrade({ submissionId: 1 });
    expect(gradeArgs.maxScore).toBe(100);
    expect(gradeArgs.studentAnswer).toBe('print(1)');
  });
});

describe('ReviewUseCases.manualAdjust（等价 updateScore，含 R3 规则）', () => {
  it('ai_graded 提交改分 → reviewed + 透传 AI 评语（非项目题）', async () => {
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'ai_graded', aiScore: 80, aiFeedback: 'AI评语', teacherFeedback: null, question: { type: 'code' } }),
        update: async (id, data) => ({ id, finalScore: 90, status: data.status, teacherFeedback: data.teacherFeedback }),
      }),
      aiGateway: { grade: async () => ({}) },
    });
    const r = await uc.manualAdjust({ submissionId: 1, finalScore: 90 });
    expect(r.status).toBe('reviewed');
    expect(r.teacherFeedback).toBe('AI评语');
  });

  it('项目题（project）改分 → 不透传 AI 评语（R3）', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'ai_graded', aiScore: 80, aiFeedback: 'AI评语', teacherFeedback: null, question: { type: 'project' } }),
        update: async (id, data) => { updateData = data; return { id, finalScore: 90, status: data.status, teacherFeedback: null }; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.manualAdjust({ submissionId: 1, finalScore: 90 });
    expect(updateData.teacherFeedback).toBeUndefined();
  });

  it('submitted 提交改分 → reviewed', async () => {
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'submitted', aiScore: null, aiFeedback: null, teacherFeedback: null, question: { type: 'code' } }),
        update: async (id, data) => ({ id, finalScore: 60, status: data.status, teacherFeedback: data.teacherFeedback }),
      }),
      aiGateway: { grade: async () => ({}) },
    });
    const r = await uc.manualAdjust({ submissionId: 1, finalScore: 60 });
    expect(r.status).toBe('reviewed');
  });

  it('提交不存在 → 抛 EntityNotFoundError', async () => {
    const uc = new ReviewUseCases({ submissionRepo: makeRepo(), aiGateway: { grade: async () => ({}) } });
    await expect(uc.manualAdjust({ submissionId: 9, finalScore: 1 })).rejects.toThrow(EntityNotFoundError);
  });
});

describe('ReviewUseCases.review（等价 reviewSubmission）', () => {
  it('审核通过：置 reviewed + 可选字段', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ update: async (id, data) => { updateData = data; return data; } }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.review({ submissionId: 2, finalScore: 95, teacherFeedback: '通过' });
    expect(updateData.status).toBe('reviewed');
    expect(updateData.finalScore).toBe(95);
    expect(updateData.teacherFeedback).toBe('通过');
    expect(updateData.reviewedAt).toBeInstanceOf(Date);
  });
  it('仅审核不改分：无 finalScore/teacherFeedback 时不写入', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ update: async (id, data) => { updateData = data; return data; } }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.review({ submissionId: 2 });
    expect(updateData.finalScore).toBeUndefined();
    expect(updateData.teacherFeedback).toBeUndefined();
  });
});