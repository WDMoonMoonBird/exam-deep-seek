/**
 * extensibility.test.js —— 开放封闭演练（可扩展性证明）。
 *
 * 核心命题：新增适配器只需改 compose.js，不动任何 use-case。
 * 做法：用「第二个 AI 网关替身」与「第二个仓储替身」替换 compose 装配中对应适配器，
 *       断言 use-case 行为不变（与真实适配器路径等价）。
 *
 * 关键：第二个实现类【不继承】真实适配器、【不实现】契约文档中未被应用层使用的方法
 *       （如 save/findByAssignmentAndStudent/listByAssignment），use-case 依然工作
 *       ——证明实际运行契约是「应用层使用的方法集」，端口文档宽度大于使用面。
 */

import { ReviewUseCases } from '../../src/application/use-cases/review.use-cases.js';
import { QuestionUseCases } from '../../src/application/use-cases/question.use-cases.js';
import { SubmissionUseCases } from '../../src/application/use-cases/submission.use-cases.js';
import { DeepSeekGateway } from '../../src/infrastructure/ai/deepseek-gateway.js';
import { SubmissionRepository } from '../../src/infrastructure/persistence/submission.repository.js';
import { QuestionRepository } from '../../src/infrastructure/persistence/question.repository.js';

/** 第二个 AI 网关替身：独立类，实现 AiGateway 使用面（grade/parsePaper），评分恒为 42 */
class SecondAiGateway {
  async grade(req) {
    return { score: 42, feedback: 'stub-ai' };
  }
  async parsePaper(text) {
    return { questions: [] };
  }
}

/** 第二个提交仓储替身：进程内 Map 实现应用层使用的方法集（不含契约文档中的 save/listByAssignment 等） */
class SecondSubmissionRepository {
  constructor(seed = {}) {
    this.subs = new Map();
    this.assignments = new Map();
    this.nextId = 1;
    if (seed.assignments) for (const [k, v] of Object.entries(seed.assignments)) this.assignments.set(+k, v);
    if (seed.submissions) for (const s of seed.submissions) this.subs.set(s.id, { ...s });
  }

  async findById(id) { return this.subs.get(id) || null; }
  async findScoreContext(id) { return this.subs.get(id) || null; }
  async findAssignmentContext(assignmentId) { return this.assignments.get(assignmentId) || null; }
  async findByAssignmentAndQuestion(assignmentId, studentId, questionId, subQuestionId) {
    for (const s of this.subs.values()) {
      if (s.assignmentId === assignmentId && s.studentId === studentId && s.questionId === questionId
        && (subQuestionId == null ? s.subQuestionId == null : s.subQuestionId === subQuestionId)) return s;
    }
    return null;
  }
  async update(id, data) {
    const cur = this.subs.get(id) || { id };
    this.subs.set(id, { ...cur, ...data });
    return this.subs.get(id);
  }
  async create(data) {
    const rec = { id: this.nextId++, ...data };
    this.subs.set(rec.id, rec);
    return rec;
  }
  async resetByAssignment(assignmentId, studentId) {
    for (const s of this.subs.values()) {
      if (s.assignmentId === assignmentId && s.studentId === studentId) {
        Object.assign(s, { status: 'draft', answer: '', aiScore: null, aiFeedback: null, finalScore: null, teacherFeedback: null });
      }
    }
    return { count: 0 };
  }
}

/** 第二个题目仓储替身：独立类，实现 create（应用层使用面） */
class SecondQuestionRepository {
  async create(data) {
    return { id: 1, ...data };
  }
}

/** 组装替代：与 compose.js 相同装配逻辑，但替换适配器（模拟「只改 compose.js」） */
function composeAlt({ aiGateway = new SecondAiGateway(), submissionRepo = new SecondSubmissionRepository(), questionRepo = new SecondQuestionRepository() } = {}) {
  return {
    reviewUseCases: new ReviewUseCases({ submissionRepo, aiGateway, logger: console }),
    questionUseCases: new QuestionUseCases({ questionRepo, logger: console }),
    submissionUseCases: new SubmissionUseCases({ submissionRepo, logger: console }),
  };
}

/** 通用作业参数 */
const openAssignment = { id: 1, endTime: new Date(Date.now() + 86400000), allowResubmit: false, mode: 'exam', maxAttempts: null, locked: false };

describe('可扩展性：第二个 AI 网关替身（替换 DeepSeekGateway）', () => {
  it('替身是独立类，与真实网关无继承关系', () => {
    const alt = new SecondAiGateway();
    expect(alt).not.toBeInstanceOf(DeepSeekGateway);
    expect(typeof alt.grade).toBe('function');
    expect(typeof alt.parsePaper).toBe('function');
  });

  it('ReviewUseCases 行为不变：regrade 返回 {aiScore, aiFeedback} 并落库 ai_graded', async () => {
    const repo = new SecondSubmissionRepository({
      submissions: [{
        id: 1, answer: 'print(1)', subQuestion: { title: 'sq', content: 'c', referenceAnswer: 'r', score: 10, scoringCriteria: null },
        question: { material: 'm', subQuestions: [{ title: 'sq', content: 'c', referenceAnswer: 'r', score: 10 }] },
      }],
    });
    const alt = composeAlt({ aiGateway: new SecondAiGateway(), submissionRepo: repo });
    const result = await alt.reviewUseCases.regrade({ submissionId: 1 });
    expect(result).toEqual({ aiScore: 42, aiFeedback: 'stub-ai' });
    expect(repo.subs.get(1).status).toBe('ai_graded');
    expect(repo.subs.get(1).aiScore).toBe(42);
  });

  it('manualAdjust 状态机不变：ai_graded → reviewed + teacherFeedback 回填 AI 评语', async () => {
    const repo = new SecondSubmissionRepository({
      submissions: [{ id: 1, status: 'ai_graded', aiFeedback: 'stub-ai', question: { type: 'code' }, teacherFeedback: null }],
    });
    const alt = composeAlt({ submissionRepo: repo });
    const r = await alt.reviewUseCases.manualAdjust({ submissionId: 1, finalScore: 88 });
    expect(r).toMatchObject({ id: 1, finalScore: 88, status: 'reviewed', teacherFeedback: 'stub-ai' });
  });

  it('review 审核通过不变：置 reviewed + finalScore/teacherFeedback', async () => {
    const repo = new SecondSubmissionRepository({ submissions: [{ id: 1, status: 'ai_graded' }] });
    const alt = composeAlt({ submissionRepo: repo });
    await alt.reviewUseCases.review({ submissionId: 1, finalScore: 95, teacherFeedback: 'good' });
    expect(repo.subs.get(1)).toMatchObject({ status: 'reviewed', finalScore: 95, teacherFeedback: 'good' });
  });
});

describe('可扩展性：第二个提交仓储替身（替换 SubmissionRepository）', () => {
  it('替身是独立类，且【不实现】契约文档中未被使用的方法', () => {
    const alt = new SecondSubmissionRepository();
    expect(alt).not.toBeInstanceOf(SubmissionRepository);
    for (const unused of ['save', 'findByAssignmentAndStudent', 'listByAssignment', 'findByIds', 'search']) {
      expect(typeof alt[unused]).toBe('undefined');
    }
  });

  it('submit 正常路径不变：新建提交 attemptCount=1，返回「提交成功」', async () => {
    const repo = new SecondSubmissionRepository({ assignments: { 1: openAssignment } });
    const alt = composeAlt({ submissionRepo: repo });
    const r = await alt.submissionUseCases.submit({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' });
    expect(r).toEqual({ message: '提交成功' });
    const saved = [...repo.subs.values()][0];
    expect(saved).toMatchObject({ status: 'submitted', attemptCount: 1, answer: 'x' });
  });

  it('submit 重复提交拦截不变：已提交且不允许重交 → DomainError', async () => {
    const repo = new SecondSubmissionRepository({
      assignments: { 1: openAssignment },
      submissions: [{ id: 9, assignmentId: 1, studentId: 2, questionId: 3, status: 'submitted', attemptCount: 1 }],
    });
    const alt = composeAlt({ submissionRepo: repo });
    await expect(alt.submissionUseCases.submit({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'y' }))
      .rejects.toMatchObject({ name: 'DomainError', message: '已提交，不可重复提交' });
  });

  it('submit 锁定拦截不变：locked → DomainError(LOCKED)', async () => {
    const repo = new SecondSubmissionRepository({ assignments: { 1: { ...openAssignment, locked: true } } });
    const alt = composeAlt({ submissionRepo: repo });
    await expect(alt.submissionUseCases.submit({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' }))
      .rejects.toMatchObject({ code: 'LOCKED' });
  });

  it('submit 截止拦截不变：已过期非 force → DomainError；force → 自动提交', async () => {
    const expired = { ...openAssignment, endTime: new Date(Date.now() - 1000) };
    const repo = new SecondSubmissionRepository({ assignments: { 1: expired } });
    const alt = composeAlt({ submissionRepo: repo });
    await expect(alt.submissionUseCases.submit({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' }))
      .rejects.toMatchObject({ message: '已过截止时间，不可提交' });
    const r2 = await alt.submissionUseCases.submit({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x', force: true });
    expect(r2.message).toContain('自动提交');
  });

  it('submit 次数拦截不变：maxAttempts 达上限 → DomainError（R3-D1 文案）', async () => {
    const practice = { ...openAssignment, mode: 'practice', maxAttempts: 2 };
    const repo = new SecondSubmissionRepository({
      assignments: { 1: practice },
      submissions: [{ id: 9, assignmentId: 1, studentId: 2, questionId: 3, status: 'draft', attemptCount: 2 }],
    });
    const alt = composeAlt({ submissionRepo: repo });
    await expect(alt.submissionUseCases.submit({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'x' }))
      .rejects.toMatchObject({ message: '已达提交次数上限（最多 2 次）' });
  });

  it('saveDraft 不变：新建草稿 / 已提交跳过 / 过期跳过', async () => {
    const repo = new SecondSubmissionRepository({ assignments: { 1: openAssignment } });
    const alt = composeAlt({ submissionRepo: repo });
    expect(await alt.submissionUseCases.saveDraft({ assignmentId: 1, studentId: 2, questionId: 3, answer: 'd' }))
      .toEqual({ message: '草稿已保存' });
    expect([...repo.subs.values()][0].status).toBe('draft');
  });

  // R3-D4（US-B5）：retry 门禁由开关驱动（允许重交 + 不限次 = 旧练习形态的等价能力），不再看 mode
  it('retry 开关化：允许重交+不限次可重置；不允许重交或已限次拒绝', async () => {
    const repo = new SecondSubmissionRepository({
      assignments: {
        1: openAssignment,                                                              // allowResubmit=false
        2: { ...openAssignment, allowResubmit: true, maxAttempts: null },               // = 旧练习形态
        3: { ...openAssignment, allowResubmit: true, maxAttempts: 2 },                  // 限次 ⇒ 拒绝
      },
    });
    const alt = composeAlt({ submissionRepo: repo });
    await expect(alt.submissionUseCases.retry({ assignmentId: 1, studentId: 2 }))
      .rejects.toMatchObject({ message: '该作业不支持重新答题（需允许重交且不限次）' });
    await expect(alt.submissionUseCases.retry({ assignmentId: 2, studentId: 2 })).resolves.toEqual({ message: '已重置' });
    await expect(alt.submissionUseCases.retry({ assignmentId: 3, studentId: 2 }))
      .rejects.toMatchObject({ message: '该作业不支持重新答题（需允许重交且不限次）' });
  });
});

describe('可扩展性：第二个题目仓储替身（替换 QuestionRepository）', () => {
  it('替身是独立类，且不实现契约文档中的 findByIds/save/search', () => {
    const alt = new SecondQuestionRepository();
    expect(alt).not.toBeInstanceOf(QuestionRepository);
    for (const unused of ['findByIds', 'save', 'search']) {
      expect(typeof alt[unused]).toBe('undefined');
    }
  });

  it('create 行为不变：分值解析 + 总分落库', async () => {
    const repo = new SecondQuestionRepository();
    const alt = composeAlt({ questionRepo: repo });
    const q = await alt.questionUseCases.create({
      teacherId: 1, title: 't', subQuestions: [{ score: 30 }, { score: 30 }, { score: 40 }],
    });
    expect(q.maxScore).toBe(100);
    expect(q.subQuestions.map(s => s.score)).toEqual([30, 30, 40]);
  });

  it('create 校验不变：非法分值 → InvalidScoreError', async () => {
    const alt = composeAlt({ questionRepo: new SecondQuestionRepository() });
    await expect(alt.questionUseCases.create({ teacherId: 1, title: 't', subQuestions: [{ score: 0 }] }))
      .rejects.toMatchObject({ name: 'InvalidScoreError' });
  });
});

describe('可扩展性结论：适配器替换只改装配（compose.js），use-case 零改动', () => {
  it('composeAlt（替身装配）与 compose（真实装配）产出相同形状的用例服务', () => {
    const alt = composeAlt();
    expect(typeof alt.reviewUseCases.regrade).toBe('function');
    expect(typeof alt.reviewUseCases.manualAdjust).toBe('function');
    expect(typeof alt.questionUseCases.create).toBe('function');
    expect(typeof alt.submissionUseCases.submit).toBe('function');
    expect(typeof alt.submissionUseCases.saveDraft).toBe('function');
    expect(typeof alt.submissionUseCases.retry).toBe('function');
  });
});
