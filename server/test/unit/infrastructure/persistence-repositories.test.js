/**
 * persistence-repositories.test.js — 仓储适配器纯逻辑测试（离线，mock prisma）。
 * 只验证「调用参数形状」与「数据映射逻辑」（软删除过滤属查询语义由 DB 决定，
 * 已留待集成 Agent 在 exam_system_test 上验证）。不触碰任何真实数据库。
 */
import { QuestionRepository } from '../../../src/infrastructure/persistence/question.repository.js';
import { SubmissionRepository } from '../../../src/infrastructure/persistence/submission.repository.js';

/** 捕获全部 prisma 调用的替身 */
function capturePrisma() {
  const calls = [];
  const prisma = {
    question: {
      findUnique: async (args) => { calls.push(['question.findUnique', args]); return { id: 'q1' }; },
      create: async (args) => { calls.push(['question.create', args]); return { id: 'q1' }; },
    },
    submission: {
      findUnique: async (args) => { calls.push(['submission.findUnique', args]); return { id: 's1' }; },
      findFirst: async (args) => { calls.push(['submission.findFirst', args]); return { id: 's1' }; },
      update: async (args) => { calls.push(['submission.update', args]); return { id: 's1' }; },
      updateMany: async (args) => { calls.push(['submission.updateMany', args]); return { count: 1 }; },
      create: async (args) => { calls.push(['submission.create', args]); return { id: 's1' }; },
    },
    assignment: {
      findUnique: async (args) => { calls.push(['assignment.findUnique', args]); return { id: 'a1' }; },
    },
  };
  return { prisma, calls };
}

describe('QuestionRepository — 查询与创建映射', () => {
  it('findById → 透传 where + include(subQuestions 升序)', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new QuestionRepository({ prisma });
    await repo.findById('q-123');
    expect(calls[0][0]).toBe('question.findUnique');
    expect(calls[0][1]).toEqual({
      where: { id: 'q-123' },
      include: { subQuestions: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('create → 小题默认值映射（sortOrder 1..n / title / type / language / scoringCriteria）', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new QuestionRepository({ prisma });
    await repo.create({
      teacherId: 't1', title: '题', maxScore: 100, difficulty: 'easy',
      subQuestions: [
        { score: 30 },
        { score: 70, title: '小题2', type: 'code', content: '<p>c</p>', referenceAnswer: 'ans', language: 'python', scoringCriteria: 'crit' },
      ],
    });
    const createArgs = calls[0][1];
    expect(createArgs.data.teacherId).toBe('t1');
    expect(createArgs.data.subQuestions.create).toHaveLength(2);
    const [sq1, sq2] = createArgs.data.subQuestions.create;
    // 默认值
    expect(sq1).toMatchObject({ sortOrder: 1, title: '', type: 'code', language: 'cpp', scoringCriteria: null });
    expect(sq1.score).toBe(30);
    // 显式值保留
    expect(sq2).toMatchObject({
      sortOrder: 2, title: '小题2', type: 'code', content: '<p>c</p>',
      referenceAnswer: 'ans', language: 'python', scoringCriteria: 'crit',
    });
    expect(createArgs.include).toEqual({ subQuestions: { orderBy: { sortOrder: 'asc' } } });
  });

  it('create → objectiveItems 存在时透传，不存在时不带（undefined 被忽略）', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new QuestionRepository({ prisma });
    await repo.create({
      teacherId: 't1', title: '题', maxScore: 10, difficulty: 'easy',
      subQuestions: [
        { score: 10, objectiveItems: [{ text: 'A' }] },
        { score: 10 },
      ],
    });
    const creates = calls[0][1].data.subQuestions.create;
    expect(creates[0].objectiveItems).toEqual([{ text: 'A' }]);
    // 6① 裁决（2026-08-16）：实现以 undefined 值携带键（hasOwnProperty=true），
    // JSON 序列化下与缺键等价——改为值断言
    expect(creates[1].objectiveItems).toBeUndefined();
  });

  it('create → objectiveSettings 传空对象时置 undefined（不写入）', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new QuestionRepository({ prisma });
    await repo.create({
      teacherId: 't1', title: '题', maxScore: 10, difficulty: 'easy',
      objectiveSettings: {}, subQuestions: [{ score: 10 }],
    });
    // 6① 裁决：空对象为 truthy，实现原样透传（既有行为）；仅 null/undefined 兜底为 undefined
    expect(calls[0][1].data.objectiveSettings).toEqual({});
  });
});

describe('SubmissionRepository — 查询形状与更新映射', () => {
  it('findById → include question(材料+小题) + subQuestion', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    await repo.findById('s-1');
    expect(calls[0][1]).toEqual({
      where: { id: 's-1' },
      include: {
        question: { select: { material: true, subQuestions: { orderBy: { sortOrder: 'asc' } } } },
        subQuestion: true,
      },
    });
  });

  it('findScoreContext → select 白名单形状', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    await repo.findScoreContext('s-1');
    expect(calls[0][1]).toEqual({
      where: { id: 's-1' },
      select: {
        status: true, aiScore: true, aiFeedback: true, teacherFeedback: true,
        // ★R3-D8（t16 / F-C4-1）：R3-D5（t12 的 48cfd7b）为 G2 范围校验新增 question.maxScore，
        //   本断言未同步 ⇒ npm test 必红。今后改仓储 select 请同时跑本套件（不能只跑 integration）。
        question: { select: { type: true, maxScore: true } },
      },
    });
  });

  it('findByAssignmentAndQuestion 带 subQuestionId → where 含该字段', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    await repo.findByAssignmentAndQuestion('a1', 'st1', 'q1', 'sq1');
    expect(calls[0][1]).toEqual({ where: { assignmentId: 'a1', studentId: 'st1', questionId: 'q1', subQuestionId: 'sq1' } });
  });

  it('findByAssignmentAndQuestion 不带 subQuestionId → where 不含该字段', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    await repo.findByAssignmentAndQuestion('a1', 'st1', 'q1');
    const where = calls[0][1].where;
    expect(where).toEqual({ assignmentId: 'a1', studentId: 'st1', questionId: 'q1' });
    expect(Object.prototype.hasOwnProperty.call(where, 'subQuestionId')).toBe(false);
  });

  it('findAssignmentContext → select 形状', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    await repo.findAssignmentContext('a1');
    expect(calls[0][1]).toEqual({
      where: { id: 'a1' },
      select: { endTime: true, allowResubmit: true, mode: true, maxAttempts: true, locked: true },
    });
  });

  it('update → {where, data} 透传', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    await repo.update('s-1', { status: 'reviewed', finalScore: 90 });
    expect(calls[0][1]).toEqual({ where: { id: 's-1' }, data: { status: 'reviewed', finalScore: 90 } });
  });

  it('create → data 原样透传', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    const data = { assignmentId: 'a1', studentId: 'st1', questionId: 'q1', answer: 'x' };
    await repo.create(data);
    expect(calls[0][1]).toEqual({ data });
  });

  it('resetByAssignment → 重置为草稿的数据形状（评分字段清空）', async () => {
    const { prisma, calls } = capturePrisma();
    const repo = new SubmissionRepository({ prisma });
    await repo.resetByAssignment('a1', 'st1');
    expect(calls[0][1]).toEqual({
      where: { assignmentId: 'a1', studentId: 'st1' },
      data: {
        status: 'draft', answer: '', aiScore: null, aiFeedback: null,
        finalScore: null, teacherFeedback: null, submittedAt: null, reviewedAt: null,
      },
    });
  });
});
