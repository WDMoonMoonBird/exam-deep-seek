import { DeepSeekGateway } from '../../../src/infrastructure/ai/deepseek-gateway.js';
import { CachingAiGateway } from '../../../src/infrastructure/ai/caching-ai-gateway.js';
import { ABNORMAL_FEEDBACK } from '../../../src/constants.js';

function makeConfigRepo(overrides = {}) {
  return {
    getBaseUrl: async () => 'https://api.deepseek.com',
    getApiKey: async () => 'test-key',
    getModel: async () => 'test-model',
    ...overrides,
  };
}

function okFetch(content) {
  return async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
}

const gradeReq = {
  subQuestionTitle: '小题1',
  subQuestionContent: '<p>题目</p>',
  referenceAnswer: 'print(1)',
  studentAnswer: 'print(1)',
  maxScore: 100,
};

describe('DeepSeekGateway.grade（行为等价迁移自 deepseek.js gradeSubmission）', () => {
  it('正常评分 → 返回 {score, feedback}', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('{"score":85,"feedback":"很好"}'),
    });
    const r = await gw.grade(gradeReq);
    expect(r).toEqual({ score: 85, feedback: '很好' });
  });

  it('JSON 前后带杂质文本 → 仍可提取', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('好的，以下是评分：{"score":80,"feedback":"ok"} 谢谢'),
    });
    const r = await gw.grade(gradeReq);
    expect(r).toEqual({ score: 80, feedback: 'ok' });
  });

  it('★M9/H8：AI 分数超过满分 ⇒ **越界即拒**（重试 3 次 ⇒ ABNORMAL_FEEDBACK），不再截断到 maxScore', async () => {
    let calls = 0;
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"score":150,"feedback":"过高"}' } }] }) }; },
    });
    const r = await gw.grade({ ...gradeReq, maxScore: 50 });
    expect(calls).toBe(3);                                  // 3 次重试后放弃
    expect(r).toEqual({ score: 0, feedback: ABNORMAL_FEEDBACK });
    expect(r.score).not.toBe(50);                           // ★旧语义（clamp 到满分）不得回归
  }, 30000);

  it('★M9/H8：AI 分数为负 ⇒ **越界即拒**（落 ABNORMAL_FEEDBACK，而非"截断到 0 且保留评语"）', async () => {
    let calls = 0;
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"score":-20,"feedback":"负分"}' } }] }) }; },
    });
    const r = await gw.grade(gradeReq);
    // 旧断言只看 score=0（clamp 与 reject 都会得到 0）⇒ 判别力不足；此处钉住"是拒绝路径"
    expect(r).toEqual({ score: 0, feedback: ABNORMAL_FEEDBACK });
    expect(r.feedback).not.toBe('负分');
    expect(calls).toBe(3);
  }, 30000);

  it('feedback 缺失 → 默认无评语', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('{"score":60,"feedback":null}'),
    });
    const r = await gw.grade(gradeReq);
    expect(r).toEqual({ score: 60, feedback: '无评语' });
  });

  it('3 次全部失败 → 兜底 {0, 请联系老师}', async () => {
    let calls = 0;
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: async () => { calls++; throw new Error('network down'); },
    });
    const r = await gw.grade(gradeReq);
    expect(r).toEqual({ score: 0, feedback: '请联系老师' });
    expect(calls).toBe(3);
  });

  it('429 限流后重试成功', async () => {
    let calls = 0;
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 429 };
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"score":90,"feedback":"ok"}' } }] }) };
      },
    });
    const r = await gw.grade(gradeReq);
    expect(r.score).toBe(90);
    expect(calls).toBe(2);
  });
});

describe('DeepSeekGateway.parsePaper（行为等价迁移自 parseExamPaper）', () => {
  it('正常解析 → 返回 questions', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('{"questions":[{"type":"choice","stem":"1+1=?"}]}'),
    });
    const r = await gw.parsePaper('试卷文本');
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].type).toBe('choice');
  });

  it('返回非 JSON → 重试后仍失败则抛出', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('不是 JSON'),
    });
    await expect(gw.parsePaper('试卷')).rejects.toThrow('返回格式不包含有效的 JSON');
  });
});

describe('DeepSeekGateway.gradeProject（等价迁移自 projectGrader.gradeAI）', () => {
  it('正常评审 → 返回 {score, feedback} 并截断到 0-100', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('{"score":88,"feedback":"代码规范"}'),
    });
    const r = await gw.gradeProject({ standardFiles: 'a.java', submissionFiles: 'b.java' });
    expect(r).toEqual({ score: 88, feedback: '代码规范' });
  });
  it('★M9/H8：gradeProject 分数超 100 ⇒ **越界即拒**（落 ABNORMAL_FEEDBACK），不再截断到 100', async () => {
    let calls = 0;
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"score":150,"feedback":"x"}' } }] }) }; },
    });
    const r = await gw.gradeProject({ standardFiles: 'a', submissionFiles: 'b' });
    // gradeProject 的既有失败口径：**单次调用、不重试**，catch 后返回显式失败反馈（非 ABNORMAL_FEEDBACK）
    expect(calls).toBe(1);
    expect(r.score).toBe(0);
    expect(r.score).not.toBe(100);                          // ★旧语义（clamp 到 100）不得回归
    expect(r.feedback).toContain('AI 评审失败');             // 显式报错，而非静默采用非法分数
    expect(r.feedback).toContain('返回格式不包含有效的 JSON');
  }, 30000);
  it('未配置 API Key → 返回不可用提示（不抛出）', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo({ getApiKey: async () => null }),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('{}'),
    });
    const r = await gw.gradeProject({ standardFiles: 'a', submissionFiles: 'b' });
    expect(r.feedback).toContain('未配置 API Key');
  });
  it('返回非 JSON → 兜底失败反馈（不抛出）', async () => {
    const gw = new DeepSeekGateway({
      configRepo: makeConfigRepo(),
      logger: { warn() {}, error() {}, info() {} },
      fetchImpl: okFetch('not json'),
    });
    const r = await gw.gradeProject({ standardFiles: 'a', submissionFiles: 'b' });
    expect(r.feedback).toContain('AI 评审失败');
  });
});

describe('CachingAiGateway（装饰器：避免重复扣费）', () => {
  it('相同请求命中缓存，内层只调用一次', async () => {
    let innerCalls = 0;
    const inner = {
      grade: async () => { innerCalls++; return { score: 88, feedback: 'ok' }; },
      parsePaper: async (t) => ({ questions: [{ stem: t }] }),
    };
    const cached = new CachingAiGateway(inner);
    const r1 = await cached.grade(gradeReq);
    const r2 = await cached.grade(gradeReq);
    expect(r1).toEqual(r2);
    expect(innerCalls).toBe(1);
  });

  it('不同请求不命中缓存', async () => {
    let innerCalls = 0;
    const inner = {
      grade: async () => { innerCalls++; return { score: 50, feedback: 'x' }; },
      parsePaper: async () => ({ questions: [] }),
    };
    const cached = new CachingAiGateway(inner);
    await cached.grade(gradeReq);
    await cached.grade({ ...gradeReq, studentAnswer: 'print(2)' });
    expect(innerCalls).toBe(2);
  });
});