/**
 * use-cases-contract.test.js —— 用例服务接口形状断言。
 *
 * 验证 controllers 经 app.locals 调用的用例方法（reviewUseCases / questionUseCases /
 * submissionUseCases）与组合根 compose.js 装配结果一致：
 *   - 方法存在、类型为 function、单参数（cmd 对象）
 *   - 控制器调用形状（字段名）能被用例方法接受（用 stub prisma 构造 compose，行为级验证
 *     不触达 DB / 不调用真实 AI）
 *
 * controllers 只读，本测试仅验证形状与装配一致性。
 */

import { compose } from '../../src/infrastructure/bootstrap/compose.js';

function makeStub() {
  const handler = {
    get(_t, prop) {
      if (prop === 'then' || prop === Symbol.toPrimitive || prop === Symbol.iterator) return undefined;
      return makeStub();
    },
    apply() {
      return Promise.resolve(null);
    },
  };
  return new Proxy(function () {}, handler);
}
const stubPrisma = makeStub();

describe('用例服务 ↔ compose.js 装配一致性', () => {
  const composed = compose({ prisma: stubPrisma, logger: console });

  it('compose 导出 3 个用例服务，且 controllers 依赖的方法齐全', () => {
    for (const name of ['reviewUseCases', 'questionUseCases', 'submissionUseCases']) {
      expect(typeof composed[name]).toBe('object');
    }
    expect(typeof composed.reviewUseCases.regrade).toBe('function');
    expect(typeof composed.reviewUseCases.manualAdjust).toBe('function');
    expect(typeof composed.reviewUseCases.review).toBe('function');
    expect(typeof composed.questionUseCases.create).toBe('function');
    expect(typeof composed.submissionUseCases.submit).toBe('function');
    expect(typeof composed.submissionUseCases.saveDraft).toBe('function');
    expect(typeof composed.submissionUseCases.retry).toBe('function');
  });

  it('用例方法均为单参数（cmd 对象）签名', () => {
    expect(composed.reviewUseCases.regrade.length).toBe(1);
    expect(composed.reviewUseCases.manualAdjust.length).toBe(1);
    expect(composed.reviewUseCases.review.length).toBe(1);
    expect(composed.questionUseCases.create.length).toBe(1);
    expect(composed.submissionUseCases.submit.length).toBe(1);
    expect(composed.submissionUseCases.saveDraft.length).toBe(1);
    expect(composed.submissionUseCases.retry.length).toBe(1);
  });
});

describe('控制器调用形状 ↔ 用例方法接受度（行为级，零 DB / 零 AI）', () => {
  const composed = compose({ prisma: stubPrisma, logger: console });

  it('reviewController.regradeSubmission → reviewUseCases.regrade({submissionId})：提交不存在 → EntityNotFoundError', async () => {
    await expect(composed.reviewUseCases.regrade({ submissionId: 999 })).rejects.toMatchObject({ name: 'EntityNotFoundError' });
  });

  it('reviewController.updateScore → reviewUseCases.manualAdjust({submissionId, finalScore})：提交不存在 → EntityNotFoundError', async () => {
    await expect(composed.reviewUseCases.manualAdjust({ submissionId: 999, finalScore: 90 })).rejects.toMatchObject({ name: 'EntityNotFoundError' });
  });

  it('reviewController.reviewSubmission → reviewUseCases.review({submissionId, finalScore?, teacherFeedback?})：可接受并走 update', async () => {
    // review 不做存在性预检，直接 update；stub prisma 返回 null 不会抛错
    await expect(composed.reviewUseCases.review({ submissionId: 999, finalScore: 90, teacherFeedback: 'x' })).resolves.toBeUndefined();
  });

  it('studentController.submitAnswer → submissionUseCases.submit({assignmentId, studentId, questionId, subQuestionId, answer, force})：作业不存在 → EntityNotFoundError', async () => {
    await expect(composed.submissionUseCases.submit({
      assignmentId: 1, studentId: 2, questionId: 3, subQuestionId: undefined, answer: 'x', force: undefined,
    })).rejects.toMatchObject({ name: 'EntityNotFoundError' });
  });

  it('studentController.saveDraft → submissionUseCases.saveDraft({assignmentId, studentId, questionId, subQuestionId, answer})：作业不存在 → EntityNotFoundError', async () => {
    await expect(composed.submissionUseCases.saveDraft({
      assignmentId: 1, studentId: 2, questionId: 3, subQuestionId: undefined, answer: 'x',
    })).rejects.toMatchObject({ name: 'EntityNotFoundError' });
  });

  it('studentController.retryAssignment → submissionUseCases.retry({assignmentId, studentId})：作业不存在 → EntityNotFoundError', async () => {
    await expect(composed.submissionUseCases.retry({ assignmentId: 1, studentId: 2 })).rejects.toMatchObject({ name: 'EntityNotFoundError' });
  });

  it('teacherController.createQuestion(code 分支) → questionUseCases.create({teacherId, title, maxScore, difficulty, material, attachmentUrl, objectiveSettings, subQuestions})：参数缺失 → DomainError(INVALID_ARGUMENT)', async () => {
    await expect(composed.questionUseCases.create({ teacherId: 1 })).rejects.toMatchObject({ name: 'DomainError', code: 'INVALID_ARGUMENT' });
    await expect(composed.questionUseCases.create({ teacherId: 1, title: 't' })).rejects.toMatchObject({ name: 'DomainError', code: 'INVALID_ARGUMENT' });
  });

  it('questionUseCases.create 校验分值：subQuestions 缺分 → InvalidScoreError（Controller 映射 400/1001）', async () => {
    await expect(composed.questionUseCases.create({
      teacherId: 1, title: 't', subQuestions: [{ title: 'sq', score: null }],
    })).rejects.toMatchObject({ name: 'InvalidScoreError' });
  });
});

describe('用例方法返回 Promise（控制器 await 的前提）', () => {
  const composed = compose({ prisma: stubPrisma, logger: console });

  it('全部 7 个用例方法调用后返回 Promise 实例', async () => {
    const calls = [
      composed.reviewUseCases.regrade({ submissionId: 999 }),
      composed.reviewUseCases.manualAdjust({ submissionId: 999, finalScore: 1 }),
      composed.reviewUseCases.review({ submissionId: 999 }),
      composed.questionUseCases.create({ teacherId: 1 }),
      composed.submissionUseCases.submit({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' }),
      composed.submissionUseCases.saveDraft({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' }),
      composed.submissionUseCases.retry({ assignmentId: 1, studentId: 2 }),
    ];
    for (const p of calls) {
      expect(p).toBeInstanceOf(Promise);
      await p.catch(() => {}); // 吸收预期的领域错误
    }
  });
});
