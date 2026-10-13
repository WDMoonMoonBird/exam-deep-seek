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

  it('grade 参数完整：material/subQuestionTitle/subQuestionContent/referenceAnswer/maxScore/scoringCriteria 对齐 AiGateway 端口契约', async () => {
    let gradeArgs = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findById: async () => makeSub({
          answer: 'print(2)',
          question: { material: '材料A', subQuestions: [{ id: 11, title: '小题A', content: '<p>题干A</p>', referenceAnswer: '答案A', score: 60, scoringCriteria: '按步骤给分' }] },
        }),
      }),
      aiGateway: { grade: async (args) => { gradeArgs = args; return { score: 60, feedback: 'ok' }; } },
    });
    await uc.regrade({ submissionId: 1 });
    expect(gradeArgs).toEqual({
      material: '材料A',
      subQuestionTitle: '小题A',
      subQuestionContent: '<p>题干A</p>',
      referenceAnswer: '答案A',
      studentAnswer: 'print(2)',
      maxScore: 60,
      scoringCriteria: '按步骤给分',
    });
  });

  it('sub.subQuestion 优先于 question.subQuestions[0]（两者都存在时取 subQuestion）', async () => {
    let gradeArgs = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findById: async () => makeSub({
          subQuestion: { id: 20, title: '子小题', content: '子内容', referenceAnswer: '子答案', score: 30, scoringCriteria: null },
        }),
      }),
      aiGateway: { grade: async (args) => { gradeArgs = args; return { score: 30, feedback: 'ok' }; } },
    });
    await uc.regrade({ submissionId: 1 });
    expect(gradeArgs.subQuestionTitle).toBe('子小题');
    expect(gradeArgs.maxScore).toBe(30);
    expect(gradeArgs.referenceAnswer).toBe('子答案');
  });

  it('answer 为空串/缺失 → studentAnswer 传空串（|| 兜底分支）', async () => {
    let gradeArgs = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ findById: async () => makeSub({ answer: '' }) }),
      aiGateway: { grade: async (args) => { gradeArgs = args; return { score: 0, feedback: '' }; } },
    });
    await uc.regrade({ submissionId: 1 });
    expect(gradeArgs.studentAnswer).toBe('');
  });

  it('AI 网关抛错 → 异常原样传播（不吞不包装）', async () => {
    const boom = new Error('ai down');
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ findById: async () => makeSub() }),
      aiGateway: { grade: async () => { throw boom; } },
    });
    await expect(uc.regrade({ submissionId: 1 })).rejects.toBe(boom);
  });

  it('仓储 update 抛错 → 异常原样传播', async () => {
    const boom = new Error('db down');
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ findById: async () => makeSub(), update: async () => { throw boom; } }),
      aiGateway: { grade: async () => ({ score: 1, feedback: 'f' }) },
    });
    await expect(uc.regrade({ submissionId: 1 })).rejects.toBe(boom);
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

  it('ai_graded 且已有 teacherFeedback → 不覆盖教师手填评语', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'ai_graded', aiScore: 80, aiFeedback: 'AI评语', teacherFeedback: '教师手填', question: { type: 'code' } }),
        update: async (id, data) => { updateData = data; return { id, finalScore: 70, status: data.status, teacherFeedback: '教师手填' }; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.manualAdjust({ submissionId: 1, finalScore: 70 });
    expect(updateData.teacherFeedback).toBeUndefined(); // 未写入 → 仓储保留原值
  });

  it('ai_graded 且 aiFeedback 为空 → teacherFeedback 兜底为空串（|| 分支）', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'ai_graded', aiScore: null, aiFeedback: null, teacherFeedback: null, question: { type: 'code' } }),
        update: async (id, data) => { updateData = data; return { id, finalScore: 50, status: data.status, teacherFeedback: data.teacherFeedback }; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.manualAdjust({ submissionId: 1, finalScore: 50 });
    expect(updateData.teacherFeedback).toBe('');
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

  it('project + submitted 改分 → reviewed，且不写入 teacherFeedback（R3 覆盖所有路径）', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'submitted', aiScore: null, aiFeedback: 'AI评语', teacherFeedback: null, question: { type: 'project' } }),
        update: async (id, data) => { updateData = data; return { id, finalScore: 80, status: data.status, teacherFeedback: null }; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    const r = await uc.manualAdjust({ submissionId: 1, finalScore: 80 });
    expect(r.status).toBe('reviewed');
    expect(updateData.teacherFeedback).toBeUndefined();
  });

  it('其他状态（draft）改分 → 仅更新 finalScore，不触发状态机', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'draft', aiScore: null, aiFeedback: null, teacherFeedback: null, question: { type: 'code' } }),
        update: async (id, data) => { updateData = data; return { id, finalScore: 40, status: 'draft' }; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    const r = await uc.manualAdjust({ submissionId: 1, finalScore: 40 });
    expect(r.status).toBe('draft');
    expect(updateData.status).toBeUndefined();
    expect(updateData.reviewedAt).toBeUndefined();
    expect(updateData.finalScore).toBe(40);
  });

  it('finalScore 为字符串 → 强转为数字后传给仓储', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'ai_graded', aiScore: 80, aiFeedback: 'AI评语', teacherFeedback: null, question: { type: 'code' } }),
        update: async (id, data) => { updateData = data; return { id, finalScore: 90, status: data.status, teacherFeedback: data.teacherFeedback }; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.manualAdjust({ submissionId: 1, finalScore: '90' });
    expect(updateData.finalScore).toBe(90);
  });

  it('manualAdjust 分值校验（BUG-017 修复）：负数/NaN 被拒绝，不落库', async () => {
    const received = [];
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'ai_graded', aiScore: 80, aiFeedback: 'AI评语', teacherFeedback: null, question: { type: 'code' } }),
        update: async (id, data) => { received.push(data.finalScore); return { id, finalScore: data.finalScore, status: 'reviewed' }; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    await expect(uc.manualAdjust({ submissionId: 1, finalScore: -10 })).rejects.toThrow('分数不合法');
    await expect(uc.manualAdjust({ submissionId: 1, finalScore: 'abc' })).rejects.toThrow('分数不合法');
    await expect(uc.manualAdjust({ submissionId: 1 })).rejects.toThrow('分数不合法');
    expect(received).toHaveLength(0); // 未触达仓储
  });

  it('提交不存在 → 抛 EntityNotFoundError', async () => {
    const uc = new ReviewUseCases({ submissionRepo: makeRepo(), aiGateway: { grade: async () => ({}) } });
    await expect(uc.manualAdjust({ submissionId: 9, finalScore: 1 })).rejects.toThrow(EntityNotFoundError);
  });

  it('仓储 update 抛错 → 异常原样传播', async () => {
    const boom = new Error('db down');
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({
        findScoreContext: async () => ({ status: 'submitted', aiScore: null, aiFeedback: null, teacherFeedback: null, question: { type: 'code' } }),
        update: async () => { throw boom; },
      }),
      aiGateway: { grade: async () => ({}) },
    });
    await expect(uc.manualAdjust({ submissionId: 1, finalScore: 60 })).rejects.toBe(boom);
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
  it('finalScore=0 合法：0 !== undefined 必须写入', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ update: async (id, data) => { updateData = data; return data; } }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.review({ submissionId: 2, finalScore: 0 });
    expect(updateData.finalScore).toBe(0);
  });
  it('teacherFeedback=null 显式传入 → 写入 null（null !== undefined）', async () => {
    let updateData = null;
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ update: async (id, data) => { updateData = data; return data; } }),
      aiGateway: { grade: async () => ({}) },
    });
    await uc.review({ submissionId: 2, teacherFeedback: null });
    expect(updateData.teacherFeedback).toBeNull();
  });
  // ★R3-D5 契约变更：review 现在会读取提交上下文 —— G2 需要题目满分做范围校验、G3 需要当前状态决定
  //   「published 保持 published」；不再像改动前那样「只 update、不查询」。提交不存在时仍不新增 404 语义
  //   （findScoreContext → null ⇒ 状态按默认 reviewed 落库，错误仍由仓储 update 自然抛出）。
  it('R3-D5：review 会读取提交上下文（findScoreContext）—— 满分范围校验 + published 保持', async () => {
    let looked = 0;
    let updated = null;
    const uc = new ReviewUseCases({
      submissionRepo: {
        findScoreContext: async () => { looked += 1; return { status: 'published', question: { type: 'code', maxScore: 100 } }; },
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      },
      aiGateway: { grade: async () => ({}) },
    });
    await uc.review({ submissionId: 999, finalScore: 90 });
    expect(looked).toBe(1);
    expect(updated).toMatchObject({ status: 'published', finalScore: 90 });   // G3：published 不被降级
  });

  it('R3-D5：提交不存在（findScoreContext → null）⇒ 状态按默认 reviewed 落库（不新增 404 语义）', async () => {
    let updated = null;
    const uc = new ReviewUseCases({
      submissionRepo: {
        findScoreContext: async () => null,
        update: async (id, data) => { updated = { id, ...data }; return updated; },
      },
      aiGateway: { grade: async () => ({}) },
    });
    await uc.review({ submissionId: 999 });
    expect(updated).toMatchObject({ status: 'reviewed' });
  });
  it('仓储 update 抛错 → 异常原样传播', async () => {
    const boom = new Error('db down');
    const uc = new ReviewUseCases({
      submissionRepo: makeRepo({ update: async () => { throw boom; } }),
      aiGateway: { grade: async () => ({}) },
    });
    await expect(uc.review({ submissionId: 2 })).rejects.toBe(boom);
  });
});
