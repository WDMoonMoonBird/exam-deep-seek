/**
 * caching-ai-gateway.test.js — CachingAiGateway 装饰器行为专项（顺序/透传/异常）。
 * 覆盖：缓存命中/未命中、key 内容敏感、LRU 淘汰、clear、parsePaper 缓存、
 * 内层异常透传且不缓存、grade/parsePaper 缓存隔离。
 */
import { CachingAiGateway } from '../../../src/infrastructure/ai/caching-ai-gateway.js';

const gradeReq = {
  subQuestionTitle: '小题1',
  subQuestionContent: '<p>题目</p>',
  referenceAnswer: 'print(1)',
  studentAnswer: 'print(1)',
  maxScore: 100,
};

function makeInner(overrides = {}) {
  let gradeCalls = 0;
  let parseCalls = 0;
  const inner = {
    grade: async (req) => { gradeCalls++; return { score: 88, feedback: 'ok', req }; },
    parsePaper: async (t) => { parseCalls++; return { questions: [{ stem: t }] }; },
    ...overrides,
  };
  return {
    inner,
    calls: () => ({ grade: gradeCalls, parse: parseCalls }),
  };
}

describe('CachingAiGateway.grade — 命中/未命中', () => {
  it('相同请求命中缓存：内层只调用一次且返回同一结果对象', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner);
    const r1 = await cached.grade(gradeReq);
    const r2 = await cached.grade(gradeReq);
    expect(calls().grade).toBe(1);
    expect(r2).toBe(r1); // 缓存返回原对象引用
  });

  it('请求内容不同（含 scoringCriteria 变化）→ 不命中', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner);
    await cached.grade(gradeReq);
    await cached.grade({ ...gradeReq, scoringCriteria: 'custom' });
    await cached.grade({ ...gradeReq, studentAnswer: 'print(2)' });
    expect(calls().grade).toBe(3);
  });

  it('key 基于内容而非对象引用：等价内容对象命中', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner);
    await cached.grade({ ...gradeReq, studentAnswer: 'x' });
    await cached.grade({ ...gradeReq, studentAnswer: 'x' });
    expect(calls().grade).toBe(1);
  });
});

describe('CachingAiGateway — LRU 淘汰与 clear', () => {
  it('超过 maxEntries 淘汰最旧条目（LRU）', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner, { maxEntries: 2 });
    await cached.grade({ ...gradeReq, studentAnswer: 'a' });
    await cached.grade({ ...gradeReq, studentAnswer: 'b' });
    await cached.grade({ ...gradeReq, studentAnswer: 'c' }); // 淘汰最旧 'a'
    expect(calls().grade).toBe(3);
    await cached.grade({ ...gradeReq, studentAnswer: 'b' }); // 'b' 仍缓存 → 命中
    expect(calls().grade).toBe(3);
    await cached.grade({ ...gradeReq, studentAnswer: 'a' }); // 'a' 已被淘汰 → 重新调用内层
    expect(calls().grade).toBe(4);
  });

  it('clear() 清空缓存：后续请求重新调用内层', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner);
    await cached.grade(gradeReq);
    cached.clear();
    await cached.grade(gradeReq);
    expect(calls().grade).toBe(2);
  });
});

describe('CachingAiGateway — parsePaper 缓存与隔离', () => {
  it('相同 paperText 命中缓存，内层只调用一次', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner);
    const r1 = await cached.parsePaper('试卷A');
    const r2 = await cached.parsePaper('试卷A');
    expect(calls().parse).toBe(1);
    expect(r2).toBe(r1);
  });

  it('不同 paperText 不命中', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner);
    await cached.parsePaper('试卷A');
    await cached.parsePaper('试卷B');
    expect(calls().parse).toBe(2);
  });

  it('grade 与 parsePaper 缓存 key 隔离（互不串扰）', async () => {
    const { inner, calls } = makeInner();
    const cached = new CachingAiGateway(inner);
    await cached.grade(gradeReq);
    await cached.parsePaper('试卷A');
    // 再次 grade 命中 grade 缓存；再次 parsePaper 命中 parsePaper 缓存
    await cached.grade(gradeReq);
    await cached.parsePaper('试卷A');
    expect(calls().grade).toBe(1);
    expect(calls().parse).toBe(1);
  });
});

describe('CachingAiGateway — 异常透传', () => {
  it('内层抛错 → 异常原样透传且失败结果不被缓存', async () => {
    let fail = true;
    const inner = {
      grade: async () => { if (fail) throw new Error('inner down'); return { score: 1, feedback: 'ok' }; },
      parsePaper: async () => ({ questions: [] }),
    };
    const cached = new CachingAiGateway(inner);
    await expect(cached.grade(gradeReq)).rejects.toThrow('inner down');
    fail = false;
    // 失败未入缓存 → 再次调用进入内层并成功
    const r = await cached.grade(gradeReq);
    expect(r.score).toBe(1);
  });
});
