/**
 * deepseek-gateway-contract.test.js — DeepSeekGateway 请求契约与补充失败路径。
 * 现有 deepseek-gateway.test.js 覆盖返回值语义；本文件补：
 *   1) 请求形状契约（URL/Authorization/body.messages/temperature/max_tokens）
 *   2) 非 429 错误码重试、AbortError 超时重试、缺 score 字段、choices 空等
 * 全部使用替身 fetch，禁止真实 DeepSeek 调用。
 */
import { DeepSeekGateway } from '../../../src/infrastructure/ai/deepseek-gateway.js';
import { PARSE_ROLE, PARSE_RULES, PROJECT_REVIEW_SYSTEM } from '../../../src/infrastructure/ai/prompt-builder.js';

const noopLogger = { warn() {}, error() {}, info() {} };

function makeConfigRepo(overrides = {}) {
  return {
    getBaseUrl: async () => 'https://api.deepseek.com',
    getApiKey: async () => 'test-key',
    getModel: async () => 'test-model',
    ...overrides,
  };
}

const gradeReq = {
  subQuestionTitle: '小题1',
  subQuestionContent: '<p>题目</p>',
  referenceAnswer: 'print(1)',
  studentAnswer: 'print(1)',
  maxScore: 100,
};

/** 捕获请求参数的 fetch 替身 */
function captureFetch({ respond }) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return respond(calls.length);
  };
  return { fetchImpl: impl, calls };
}

const okContent = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });

describe('DeepSeekGateway.grade — 请求形状契约', () => {
  it('URL/Authorization/model/messages/temperature/max_tokens 正确', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => okContent('{"score":80,"feedback":"ok"}') });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    await gw.grade(gradeReq);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('test-model');
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(2000);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('评分标准');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('## 参考答案');
    expect(init.signal).toBeDefined(); // 超时 AbortController 挂接
  });

  it('自定义 scoringCriteria → system prompt 采用自定义', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => okContent('{"score":80,"feedback":"ok"}') });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    await gw.grade({ ...gradeReq, scoringCriteria: '只看正确性' });
    const body = JSON.parse(calls[0].init.body);
    expect(body.messages[0].content).toContain('只看正确性');
    expect(body.messages[0].content).not.toContain('代码正确性（60%）');
  });
});

describe('DeepSeekGateway.grade — 补充失败路径', () => {
  it('非 429 错误码（500）→ 重试 3 次后兜底', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => ({ ok: false, status: 500 }) });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.grade(gradeReq);
    expect(calls).toHaveLength(3);
    expect(r).toEqual({ score: 0, feedback: '请联系老师' });
  });

  it('AbortError（模拟超时）→ 重试 3 次后兜底', async () => {
    const { fetchImpl, calls } = captureFetch({
      respond: () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; },
    });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.grade(gradeReq);
    expect(calls).toHaveLength(3);
    expect(r.score).toBe(0);
  });

  it('JSON score 为 null（正则命中但 parseInt 失败）→ ||0 → score 0，feedback 保留', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => okContent('{"score":null,"feedback":"只有评语"}') });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.grade(gradeReq);
    expect(r.score).toBe(0);
    expect(r.feedback).toBe('只有评语');
    expect(calls).toHaveLength(1); // 首次即成功解析，不重试
  });

  it('JSON 无 "score" 键（正则失配）→ 重试 3 次后兜底请联系老师', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => okContent('{"feedback":"只有评语"}') });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.grade(gradeReq);
    expect(calls).toHaveLength(3);
    expect(r).toEqual({ score: 0, feedback: '请联系老师' });
  });

  it('choices 为空数组 → 内容为空 → 重试后兜底', async () => {
    let n = 0;
    const fetchImpl = async () => { n++; return { ok: true, status: 200, json: async () => ({ choices: [] }) }; };
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.grade(gradeReq);
    expect(n).toBe(3);
    expect(r.feedback).toBe('请联系老师');
  });

  it('429 连续 3 次 → 全部重试耗尽后兜底（含退避等待）', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => ({ ok: false, status: 429 }) });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.grade(gradeReq);
    expect(calls).toHaveLength(3);
    expect(r.feedback).toBe('请联系老师');
  }, 60000);
});

describe('DeepSeekGateway.parsePaper — 请求形状与失败路径', () => {
  it('temperature=0 / max_tokens=16000 / system 含 PARSE_ROLE+PARSE_RULES', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => okContent('{"questions":[{"type":"fill"}]}') });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.parsePaper('试卷文本');
    expect(r.questions).toHaveLength(1);

    const body = JSON.parse(calls[0].init.body);
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(16000);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe(PARSE_ROLE + '\n\n' + PARSE_RULES);
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('试卷文本');
  });

  it('非 200（含 429）→ 不特殊处理，重试后抛出状态码错误', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => ({ ok: false, status: 429, text: async () => 'rate limited' }) });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    await expect(gw.parsePaper('试卷')).rejects.toThrow('DeepSeek API 429');
    expect(calls).toHaveLength(2); // PARSE_RETRIES = 2
  });
});

describe('DeepSeekGateway.gradeProject — 请求形状与兜底', () => {
  it('temperature=0.3 / max_tokens=4000 / system=PROJECT_REVIEW_SYSTEM', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => okContent('{"score":88,"feedback":"好"}') });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    await gw.gradeProject({ standardFiles: 'a.java', submissionFiles: 'b.java' });

    const body = JSON.parse(calls[0].init.body);
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(4000);
    expect(body.messages[0].content).toBe(PROJECT_REVIEW_SYSTEM);
    expect(body.messages[1].content).toContain('## 标准工程文件结构');
    expect(body.messages[1].content).toContain('a.java');
  });

  it('非 200 → 兜底失败反馈（不抛出）', async () => {
    const { fetchImpl, calls } = captureFetch({ respond: () => ({ ok: false, status: 500 }) });
    const gw = new DeepSeekGateway({ configRepo: makeConfigRepo(), logger: noopLogger, fetchImpl });
    const r = await gw.gradeProject({ standardFiles: 'a', submissionFiles: 'b' });
    expect(calls).toHaveLength(1); // gradeProject 不重试
    expect(r.feedback).toContain('AI 评审失败');
  });
});
