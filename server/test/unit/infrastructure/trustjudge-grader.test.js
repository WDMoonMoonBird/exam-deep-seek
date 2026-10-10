/**
 * trustjudge-grader.test.js — TrustJudge sidecar 接入契约测试
 *
 * 覆盖（全程 mock，不发真实请求 / 不消耗 LLM 额度）：
 *   1. 入参转发：POST /grade 的 body 组装（title/rubric/maxScore/标准/学生/推导 items）；
 *   2. 响应组装：totalScore/breakdown/highlights/issues/overallComment 字段齐全，round/clamp 行为；
 *   3. 分项推导：parseRubricItems（“第一项…N 分”分段、40 字截断、无标题 → []）；
 *   4. 降级路径：sidecar 5xx / 网络不可达 / 4xx / 畸形响应 → 重试后降级调用 legacy gradeProject。
 *
 * 实现：jest.unstable_mockModule 对 src/services/deepseek.js 打桩（避免降级时真实调 API），
 *       mock globalThis.fetch 模拟 sidecar。
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/services/deepseek.js', () => ({
  gradeProject: jest.fn(),
}));

const grader = await import('../../../src/services/trustJudgeGrader.js');
const { gradeProject } = await import('../../../src/services/deepseek.js');

const FIX_RUBRIC = '评分标准（总分 100 分）\n第一项，项目初始化与可运行，10 分。能正常启动即可。\n第二项，登录功能，20 分。用户名密码校验正确。';

const SIDE_OK = {
  totalScore: 88.4,
  breakdown: [
    { id: 'i1', item: '项目初始化与可运行', maxScore: 10, score: 9.6 },
    { id: 'i2', item: '登录功能', maxScore: 20, score: 19.9 },
  ],
};

function httpResp(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const gradeArgs = {
  title: '作业：用户管理系统（前端）',
  description: '实现前端页面与状态管理',
  scoringRubric: FIX_RUBRIC,
  standardFiles: '标准工程文件……',
  studentFiles: '学生提交代码……',
};

describe('parseRubricItems（分项推导）', () => {
  it('按“第一项…N 分”自然分段解析出 {item, maxScore}', () => {
    const items = grader.parseRubricItems(FIX_RUBRIC);
    expect(items).toEqual([
      { item: '项目初始化与可运行', maxScore: 10 },
      { item: '登录功能', maxScore: 20 },
    ]);
  });

  it('描述超 40 字截断到 40 字', () => {
    const longDesc = '第一项，' + '很长的功能描述'.repeat(10) + '，15 分。';
    const items = grader.parseRubricItems(longDesc);
    expect(items).toHaveLength(1);
    expect(items[0].item.length).toBeLessThanOrEqual(40);
    expect(items[0].maxScore).toBe(15);
  });

  it('无标题分段 / 空文本 → []（仅评总分）', () => {
    expect(grader.parseRubricItems('整体完成度与代码质量给分。')).toEqual([]);
    expect(grader.parseRubricItems('')).toEqual([]);
    expect(grader.parseRubricItems(null)).toEqual([]);
  });
});

describe('assembleTrustJudgeResult（响应信封组装）', () => {
  it('字段齐全：totalScore/breakdown/highlights/issues/overallComment 均存在，总分 round', () => {
    const r = grader.assembleTrustJudgeResult(SIDE_OK);
    expect(Object.keys(r).sort()).toEqual(['breakdown', 'highlights', 'issues', 'overallComment', 'totalScore']);
    expect(r.totalScore).toBe(88); // Math.round(88.4)
    expect(r.highlights).toEqual([]);
    expect(r.issues).toEqual([]);
    expect(r.overallComment).toBe('');
    expect(r.breakdown).toHaveLength(2);
    expect(r.breakdown[0]).toEqual({ item: '项目初始化与可运行', score: 10, maxScore: 10, comment: '' });
    expect(r.breakdown[1]).toEqual({ item: '登录功能', score: 20, maxScore: 20, comment: '' });
  });

  it('clamp：totalScore 超 100/负值截断，item score 不超自身 maxScore', () => {
    const r = grader.assembleTrustJudgeResult({
      totalScore: 250,
      breakdown: [
        { id: 'a', item: 'x', maxScore: 10, score: 99.4 },
        { id: 'b', item: 'y', maxScore: 20, score: -5 },
      ],
    });
    expect(r.totalScore).toBe(100);
    expect(r.breakdown[0].score).toBe(10);
    expect(r.breakdown[1].score).toBe(0);
  });

  it('comment 缺省 → 空串；非法 totalScore → 0 兜底', () => {
    const r = grader.assembleTrustJudgeResult({ totalScore: 'abc', breakdown: [] });
    expect(r.totalScore).toBe(0);
  });
});

describe('gradeProjectTrustJudge（sidecar HTTP 契约与降级）', () => {
  const realFetch = globalThis.fetch;
  let fetchMock;

  beforeAll(() => {
    // 测试加速：把重试退避 2s/5s 压成 0，避免真实等待（生产默认不变）
    process.env.TRUSTJUDGE_BACKOFF_MS = '0,0';
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    gradeProject.mockReset();
    gradeProject.mockResolvedValue({
      totalScore: 90,
      breakdown: [{ item: 'legacy-item', score: 90, maxScore: 100, comment: 'legacy' }],
      highlights: ['h'],
      issues: [],
      overallComment: 'legacy comment',
    });
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    delete process.env.TRUSTJUDGE_BACKOFF_MS;
  });

  it('入参转发正确：POST /grade + body（title/rubric/maxScore=100/双端文件/推导 items）', async () => {
    fetchMock.mockResolvedValue(httpResp(200, SIDE_OK));
    const r = await grader.gradeProjectTrustJudge(gradeArgs);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8901/grade');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.title).toBe(gradeArgs.title);
    expect(body.rubric).toBe(FIX_RUBRIC);
    expect(body.maxScore).toBe(100);
    expect(body.standardFiles).toBe(gradeArgs.standardFiles);
    expect(body.studentFiles).toBe(gradeArgs.studentFiles);
    expect(body.items).toEqual([
      { id: 'i1', item: '项目初始化与可运行', maxScore: 10 },
      { id: 'i2', item: '登录功能', maxScore: 20 },
    ]);
    expect(r.totalScore).toBe(88);
  });

  it('无分段标准 → items=[]（仅评总分），成功响应正常返回', async () => {
    fetchMock.mockResolvedValue(httpResp(200, { totalScore: 72.1, breakdown: [] }));
    const r = await grader.gradeProjectTrustJudge({ ...gradeArgs, scoringRubric: '没有分项的整分标准。' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items).toEqual([]);
    expect(r.totalScore).toBe(72);
    expect(r.breakdown).toEqual([]);
  });

  it('sidecar 5xx → 重试 2 次（共 3 次）后降级调用 legacy gradeProject，返回其结果', async () => {
    fetchMock.mockResolvedValue(httpResp(500, {}));
    const r = await grader.gradeProjectTrustJudge(gradeArgs);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(gradeProject).toHaveBeenCalledTimes(1);
    expect(gradeProject).toHaveBeenCalledWith(gradeArgs);
    expect(r.totalScore).toBe(90);
    expect(r.overallComment).toBe('legacy comment');
    expect(r.highlights).toEqual(['h']);
  });

  it('sidecar 不可达（fetch 抛网络错误）→ 重试 2 次后降级 legacy', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('fetch failed')));
    const r = await grader.gradeProjectTrustJudge(gradeArgs);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(gradeProject).toHaveBeenCalledTimes(1);
    expect(r.breakdown[0].item).toBe('legacy-item');
  });

  it('4xx（确定性失败）→ 不重试、直接降级 legacy', async () => {
    fetchMock.mockResolvedValue(httpResp(422, { detail: 'validation error' }));
    const r = await grader.gradeProjectTrustJudge(gradeArgs);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(gradeProject).toHaveBeenCalledTimes(1);
    expect(r.totalScore).toBe(90);
  });

  it('响应畸形（缺 totalScore）→ 重试 2 次后降级 legacy', async () => {
    fetchMock.mockResolvedValue(httpResp(200, { breakdown: [] }));
    const r = await grader.gradeProjectTrustJudge(gradeArgs);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(gradeProject).toHaveBeenCalledTimes(1);
    expect(r.overallComment).toBe('legacy comment');
  });

  it('首次 5xx、重试成功 → 返回 trustjudge 组装结果且不触发降级', async () => {
    fetchMock
      .mockResolvedValueOnce(httpResp(500, {}))
      .mockResolvedValueOnce(httpResp(200, SIDE_OK));
    const r = await grader.gradeProjectTrustJudge(gradeArgs);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(gradeProject).not.toHaveBeenCalled();
    expect(r.totalScore).toBe(88);
    expect(r.breakdown).toHaveLength(2);
  });
});
