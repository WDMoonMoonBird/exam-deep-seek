import { QuestionUseCases } from '../../../src/application/use-cases/question.use-cases.js';
import { DomainError, InvalidScoreError } from '../../../src/domain/errors.js';

function makeRepo(overrides = {}) {
  return {
    create: async (data) => ({ id: 1, ...data }),
    ...overrides,
  };
}

const validCmd = {
  teacherId: 7,
  title: '测试题',
  difficulty: 'easy',
  subQuestions: [{ title: '题1', content: '<p>c</p>', referenceAnswer: 'a', score: 100, language: 'python' }],
};

describe('QuestionUseCases.create（等价 createQuestion code 分支）', () => {
  it('成功：maxScore 取小题分值之和', async () => {
    let saved = null;
    const uc = new QuestionUseCases({ questionRepo: makeRepo({ create: async (d) => { saved = d; return { id: 9, ...d }; } }) });
    const r = await uc.create(validCmd);
    expect(r.id).toBe(9);
    expect(saved.maxScore).toBe(100);
    expect(saved.teacherId).toBe(7);
    expect(saved.subQuestions[0].score).toBe(100); // resolved 透传（sortOrder 由仓储映射）
  });

  it('多小题：maxScore 为各小题分值之和，且入参 maxScore 被忽略（始终重算）', async () => {
    let saved = null;
    const uc = new QuestionUseCases({
      questionRepo: makeRepo({ create: async (d) => { saved = d; return d; } }),
    });
    const r = await uc.create({
      ...validCmd,
      maxScore: 999, // 显式传入 maxScore，应被忽略
      subQuestions: [
        { title: '小题1', score: 30, language: 'python' },
        { title: '小题2', score: 70, language: 'java' },
      ],
    });
    expect(saved.maxScore).toBe(100);
    expect(r.maxScore).toBe(100);
    expect(saved.subQuestions).toHaveLength(2);
  });

  it('成功：透传 difficulty/material/attachmentUrl/objectiveSettings 与小题扩展字段', async () => {
    let saved = null;
    const uc = new QuestionUseCases({
      questionRepo: makeRepo({ create: async (d) => { saved = d; return d; } }),
    });
    await uc.create({
      ...validCmd,
      difficulty: 'hard',
      material: '<p>材料</p>',
      attachmentUrl: '/uploads/q.pdf',
      objectiveSettings: { allowPartial: true },
      subQuestions: [{ title: '题1', score: 50, language: 'python', hint: '提示' }],
    });
    expect(saved.difficulty).toBe('hard');
    expect(saved.material).toBe('<p>材料</p>');
    expect(saved.attachmentUrl).toBe('/uploads/q.pdf');
    expect(saved.objectiveSettings).toEqual({ allowPartial: true });
    expect(saved.subQuestions[0].hint).toBe('提示'); // resolved 为 { ...sq } 展开，扩展字段保留
  });

  it('缺少 teacherId 不校验：原样透传仓储（记录为设计观察，不做断言拦截）', async () => {
    let saved = null;
    const uc = new QuestionUseCases({ questionRepo: makeRepo({ create: async (d) => { saved = d; return d; } }) });
    const { teacherId, ...noTeacher } = validCmd;
    await uc.create(noTeacher);
    expect(saved.teacherId).toBeUndefined();
  });

  it('缺 title 或 subQuestions → DomainError(参数错误)', async () => {
    const uc = new QuestionUseCases({ questionRepo: makeRepo() });
    await expect(uc.create({ ...validCmd, title: '' })).rejects.toThrow('参数错误');
    await expect(uc.create({ ...validCmd, subQuestions: [] })).rejects.toThrow('参数错误');
    await expect(uc.create({ ...validCmd, subQuestions: undefined })).rejects.toThrow('参数错误');
  });

  it('title 超长 → DomainError', async () => {
    const uc = new QuestionUseCases({ questionRepo: makeRepo() });
    await expect(uc.create({ ...validCmd, title: 'x'.repeat(201) })).rejects.toThrow('标题不能超过200字');
  });

  it('material 超长 → DomainError', async () => {
    const uc = new QuestionUseCases({ questionRepo: makeRepo() });
    await expect(uc.create({ ...validCmd, material: 'x'.repeat(50001) })).rejects.toThrow('题目材料过长');
  });

  it('小题缺分值 → InvalidScoreError（消息透传）', async () => {
    const uc = new QuestionUseCases({ questionRepo: makeRepo() });
    await expect(uc.create({ ...validCmd, subQuestions: [{ title: 't', score: null }] })).rejects.toThrow(InvalidScoreError);
    await expect(uc.create({ ...validCmd, subQuestions: [{ title: 't' }] })).rejects.toThrow(InvalidScoreError);
  });

  it('小题分值为 0 或负数 → InvalidScoreError（必须大于 0）', async () => {
    const uc = new QuestionUseCases({ questionRepo: makeRepo() });
    await expect(uc.create({ ...validCmd, subQuestions: [{ title: 't', score: 0 }] })).rejects.toThrow(InvalidScoreError);
    await expect(uc.create({ ...validCmd, subQuestions: [{ title: 't', score: -5 }] })).rejects.toThrow(InvalidScoreError);
    await expect(uc.create({ ...validCmd, subQuestions: [{ title: 't', score: 0 }] })).rejects.toThrow('第1小题分值必须大于 0');
  });

  it('仓储 create 抛错 → 异常原样传播（不吞不包装）', async () => {
    const boom = new Error('db down');
    const uc = new QuestionUseCases({ questionRepo: makeRepo({ create: async () => { throw boom; } }) });
    await expect(uc.create(validCmd)).rejects.toBe(boom);
  });

  it('DomainError 类型可被 controller instanceof 判定', async () => {
    const uc = new QuestionUseCases({ questionRepo: makeRepo() });
    try {
      await uc.create({ ...validCmd, title: '' });
    } catch (e) {
      expect(e instanceof DomainError).toBe(true);
      expect(e.code).toBe('INVALID_ARGUMENT');
    }
  });
});
