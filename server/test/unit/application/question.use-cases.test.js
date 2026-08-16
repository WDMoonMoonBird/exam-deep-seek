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

  it('缺 title 或 subQuestions → DomainError(参数错误)', async () => {
    const uc = new QuestionUseCases({ questionRepo: makeRepo() });
    await expect(uc.create({ ...validCmd, title: '' })).rejects.toThrow('参数错误');
    await expect(uc.create({ ...validCmd, subQuestions: [] })).rejects.toThrow('参数错误');
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