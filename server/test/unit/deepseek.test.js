import { gradeSubmission, gradeProject } from '../../src/infrastructure/ai/deepseek/index.js';
import { ABNORMAL_FEEDBACK } from '../../src/constants.js';
import { parsePairedFence, normalizeFenceNonces } from '../helpers/prompt-fence.js';

// Mock 全局 fetch
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetch(response) {
  global.fetch = async () => response;
}

function mockJsonRes(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

// ==================== 提示词构建测试（通过捕获 fetch 参数验证） ====================

describe('gradeSubmission — 提示词构建', () => {
  let lastFetchArgs = null;

  function captureFetch() {
    global.fetch = async (url, init) => {
      lastFetchArgs = { url, init };
      return mockJsonRes({
        choices: [{ message: { content: '{"score":85,"feedback":"不错"}' } }],
      });
    };
  }

  beforeEach(() => {
    lastFetchArgs = null;
  });

  // D1: 无材料时提示词不含材料
  it('D1: 无材料时 userMessage 不含材料段', async () => {
    captureFetch();
    await gradeSubmission({
      material: null,
      subQuestionTitle: '题目1',
      subQuestionContent: '<p>写个排序</p>',
      referenceAnswer: 'sorted(arr)',
      studentAnswer: 'arr.sort()',
      maxScore: 30,
    });
    const userMsg = lastFetchArgs.init.body.match(/"role":"user","content":"([^"]+)"/)?.[1];
    // 直接检查 body 中的 JSON 字符串
    const body = JSON.parse(lastFetchArgs.init.body);
    const userContent = body.messages[1].content;
    expect(userContent).not.toContain('## 题目材料');
    expect(userContent).toContain('## 题目1');
  });

  // D3: 有文本材料时包含
  it('D3: 有文本材料时 userMessage 包含材料段', async () => {
    captureFetch();
    await gradeSubmission({
      material: '<p>闭卷考试</p>',
      subQuestionTitle: '题目1',
      subQuestionContent: '<p>写个排序</p>',
      referenceAnswer: 'sorted(arr)',
      studentAnswer: 'arr.sort()',
      maxScore: 30,
    });
    const body = JSON.parse(lastFetchArgs.init.body);
    const userContent = body.messages[1].content;
    expect(userContent).toContain('## 题目材料');
    expect(userContent).toContain('闭卷考试');
  });

  // D2: 空 HTML 材料跳过
  it('D2: 空HTML材料时 userMessage 不含材料段', async () => {
    captureFetch();
    await gradeSubmission({
      material: '<p></p>',
      subQuestionTitle: '题目1',
      subQuestionContent: '<p>写个排序</p>',
      referenceAnswer: 'sorted(arr)',
      studentAnswer: 'arr.sort()',
      maxScore: 30,
    });
    const body = JSON.parse(lastFetchArgs.init.body);
    const userContent = body.messages[1].content;
    expect(userContent).not.toContain('## 题目材料');
  });

  // D4: 默认评分标准（★L4：system 完全静态，标准下沉到 user 段的数据围栏内）
  it('D4: 未指定 scoringCriteria ⇒ system 不含任何标准、默认三标准由 user 段 CRITERIA_DATA 携带', async () => {
    captureFetch();
    await gradeSubmission({
      material: null,
      subQuestionTitle: '题目1',
      subQuestionContent: '<p>写个排序</p>',
      referenceAnswer: 'sorted(arr)',
      studentAnswer: 'arr.sort()',
      maxScore: 30,
    });
    const body = JSON.parse(lastFetchArgs.init.body);
    const systemContent = body.messages[0].content;
    const userContent = body.messages[1].content;
    // 旧语义（本用例原本固化）：默认三标准出现在 **system** —— L4 已移除，不得回归
    expect(systemContent).not.toContain('代码正确性（60%）');
    expect(systemContent).not.toContain('代码效率（20%）');
    expect(systemContent).not.toContain('代码可读性（20%）');
    // 新语义：默认标准在 **user** 段，且被随机 nonce 数据围栏包裹（含"非指令"声明）
    const fence = parsePairedFence(userContent, 'CRITERIA_DATA');
    expect(fence).not.toBeNull();
    expect(fence.inner).toContain('代码正确性（60%）');
    expect(fence.inner).toContain('代码效率（20%）');
    expect(fence.inner).toContain('代码可读性（20%）');
  });

  // ★R3-LLM-INJ：两次请求 nonce 必须不同（CSPRNG）；除 nonce 外结构必须相等
  it('★R3-LLM-INJ：两次评分请求 CRITERIA_DATA nonce 不同、除 nonce 外结构相等', async () => {
    const req = {
      material: null, subQuestionTitle: '题目1', subQuestionContent: '<p>写个排序</p>',
      referenceAnswer: 'sorted(arr)', studentAnswer: 'arr.sort()', maxScore: 30,
    };
    captureFetch();
    await gradeSubmission(req);
    const first = JSON.parse(lastFetchArgs.init.body).messages[1].content;
    captureFetch();
    await gradeSubmission(req);
    const second = JSON.parse(lastFetchArgs.init.body).messages[1].content;
    const f1 = parsePairedFence(first, 'CRITERIA_DATA');
    const f2 = parsePairedFence(second, 'CRITERIA_DATA');
    expect(f1).not.toBeNull();
    expect(f2).not.toBeNull();
    expect(f1.nonce).not.toBe(f2.nonce);
    expect(normalizeFenceNonces(first)).toBe(normalizeFenceNonces(second));
  });

  // D5: 自定义评分标准（★L4：仍不进 system；在 user 段**替换**默认标准而非叠加）
  it('D5: 自定义 scoringCriteria ⇒ system 仍静态、自定义标准进 user 段并替换默认标准', async () => {
    captureFetch();
    await gradeSubmission({
      material: null,
      subQuestionTitle: '题目1',
      subQuestionContent: '<p>写个排序</p>',
      referenceAnswer: 'sorted(arr)',
      studentAnswer: 'arr.sort()',
      maxScore: 30,
      scoringCriteria: '自定义评分标准：只看正确性',
    });
    const body = JSON.parse(lastFetchArgs.init.body);
    const systemContent = body.messages[0].content;
    const userContent = body.messages[1].content;
    // 旧语义：自定义标准出现在 system —— L4 已移除
    expect(systemContent).not.toContain('自定义评分标准');
    expect(systemContent).not.toContain('代码正确性（60%）');
    // 新语义：自定义标准进 user 段的随机 nonce 数据围栏，且**替换**默认标准
    expect(userContent).toContain('自定义评分标准：只看正确性');
    const fence = parsePairedFence(userContent, 'CRITERIA_DATA');
    expect(fence).not.toBeNull();
    expect(fence.inner).toContain('自定义评分标准：只看正确性');
    expect(userContent).not.toContain('代码正确性（60%）');
  });

  // D6: 小题标题缺省
  it('D6: 小题标题为空时显示默认标题', async () => {
    captureFetch();
    await gradeSubmission({
      material: null,
      subQuestionTitle: '',
      subQuestionContent: '<p>写个排序</p>',
      referenceAnswer: 'sorted(arr)',
      studentAnswer: 'arr.sort()',
      maxScore: 30,
    });
    const body = JSON.parse(lastFetchArgs.init.body);
    const userContent = body.messages[1].content;
    expect(userContent).toContain('## 题目');
  });
});

// ==================== API 返回解析测试 ====================

describe('gradeSubmission — API 返回解析', () => {
  // D7: 正常评分返回
  it('D7: 正常评分返回合法 JSON → {score, feedback}', async () => {
    mockFetch(mockJsonRes({
      choices: [{ message: { content: '{"score":85,"feedback":"代码正确，但可优化"}' } }],
    }));
    const result = await gradeSubmission({
      material: null,
      subQuestionTitle: '题',
      subQuestionContent: '<p>内容</p>',
      referenceAnswer: '答案',
      studentAnswer: '学生答案',
      maxScore: 100,
    });
    expect(result.score).toBe(85);
    expect(result.feedback).toBe('代码正确，但可优化');
  });

  // D11: JSON 含多余文本
  it('D11: JSON含多余文本 → 正确解析', async () => {
    mockFetch(mockJsonRes({
      choices: [{ message: { content: '得分：\n{"score":90,"feedback":"很好"}' } }],
    }));
    const result = await gradeSubmission({
      material: null,
      subQuestionTitle: '题',
      subQuestionContent: '<p>内容</p>',
      referenceAnswer: '答案',
      studentAnswer: '学生答案',
      maxScore: 100,
    });
    expect(result.score).toBe(90);
    expect(result.feedback).toBe('很好');
  });

  // D12: 分数超上限（★M9/H8：越界即拒，不再 clamp）
  it('★D12: 分数超上限 ⇒ **越界即拒**（ABNORMAL_FEEDBACK），不再 clamp到maxScore', async () => {
    mockFetch(mockJsonRes({
      choices: [{ message: { content: '{"score":150,"feedback":"完美"}' } }],
    }));
    const result = await gradeSubmission({
      material: null,
      subQuestionTitle: '题',
      subQuestionContent: '<p>内容</p>',
      referenceAnswer: '答案',
      studentAnswer: '学生答案',
      maxScore: 100,
    });
    expect(result).toEqual({ score: 0, feedback: ABNORMAL_FEEDBACK });
    expect(result.score).not.toBe(100);   // ★旧语义（clamp 到满分）不得回归
  });

  // D13: 负数分数（★M9/H8：越界即拒；旧断言只看 score=0，clamp 与 reject 都会得 0 ⇒ 判别力不足，此处钉住拒绝路径）
  it('★D13: 负数分数 ⇒ **越界即拒**（ABNORMAL_FEEDBACK），不只是"截断到 0"', async () => {
    mockFetch(mockJsonRes({
      choices: [{ message: { content: '{"score":-5,"feedback":"完全错误"}' } }],
    }));
    const result = await gradeSubmission({
      material: null,
      subQuestionTitle: '题',
      subQuestionContent: '<p>内容</p>',
      referenceAnswer: '答案',
      studentAnswer: '学生答案',
      maxScore: 100,
    });
    expect(result).toEqual({ score: 0, feedback: ABNORMAL_FEEDBACK });
    expect(result.feedback).not.toBe('完全错误');
  });
});

// ==================== 重试与兜底测试 ====================

describe('gradeSubmission — 重试与兜底', () => {
  // D9: 429 限流后重试成功
  it('D9: 429限流2次后第3次成功', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      if (callCount < 3) {
        return { status: 429, ok: false, json: async () => ({}) };
      }
      return mockJsonRes({
        choices: [{ message: { content: '{"score":75,"feedback":"还行"}' } }],
      });
    };
    const result = await gradeSubmission({
      material: null,
      subQuestionTitle: '题',
      subQuestionContent: '<p>内容</p>',
      referenceAnswer: '答案',
      studentAnswer: '学生答案',
      maxScore: 100,
    });
    expect(callCount).toBe(3);
    expect(result.score).toBe(75);
    expect(result.feedback).toBe('还行');
  }, 35000);

  // D8: API 返回无 JSON (3次重试后兜底)
  it('D8: API返回纯文本无JSON → 3次重试后兜底', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      return mockJsonRes({
        choices: [{ message: { content: '这是一段纯文本评语，不含JSON' } }],
      });
    };
    const result = await gradeSubmission({
      material: null,
      subQuestionTitle: '题',
      subQuestionContent: '<p>内容</p>',
      referenceAnswer: '答案',
      studentAnswer: '学生答案',
      maxScore: 100,
    });
    expect(callCount).toBe(3);
    expect(result.score).toBe(0);
    expect(result.feedback).toBe(ABNORMAL_FEEDBACK);
  }, 15000);

  // D10: API 超时 → 兜底
  it('D10: API超时 → 3次重试后兜底', async () => {
    let callCount = 0;
    global.fetch = async () => {
      callCount++;
      // 模拟超时：通过 AbortController abort
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    };
    const result = await gradeSubmission({
      material: null,
      subQuestionTitle: '题',
      subQuestionContent: '<p>内容</p>',
      referenceAnswer: '答案',
      studentAnswer: '学生答案',
      maxScore: 100,
    });
    // 超时时，fetch 会在 60s 后超时，但每次都会 throw AbortError
    // 重试 3 次后返回兜底
    expect(callCount).toBeGreaterThanOrEqual(1);
    expect(result.score).toBe(0);
    expect(result.feedback).toBe(ABNORMAL_FEEDBACK);
  }, 15000);
});

// ==================== gradeProject — 解析增强（2026-08-16 生产问题修复） ====================

describe('gradeProject — 解析增强', () => {
  const gradeArgs = {
    title: '用户管理系统',
    description: '前端项目',
    scoringRubric: '',
    standardFiles: '// 标准源码',
    studentFiles: '// 学生源码',
  };

  const okRes = (content, finishReason = 'stop') => mockJsonRes({
    choices: [{ message: { content }, finish_reason: finishReason }],
  });

  it('G1: 正常裸 JSON → 解析成功', async () => {
    mockFetch(okRes('{"totalScore":85,"breakdown":[],"highlights":[],"issues":[],"overallComment":"不错"}'));
    const r = await gradeProject(gradeArgs);
    expect(r.totalScore).toBe(85);
  });

  it('G2: markdown 代码块包裹 → 解析成功', async () => {
    mockFetch(okRes('```json\n{"totalScore":72,"breakdown":[],"highlights":[],"issues":[],"overallComment":"尚可"}\n```'));
    const r = await gradeProject(gradeArgs);
    expect(r.totalScore).toBe(72);
  });

  it('G3: 前后带说明文字 → 解析成功', async () => {
    mockFetch(okRes('评分结果如下：\n{"totalScore":66,"breakdown":[],"highlights":[],"issues":[],"overallComment":"及格"}\n以上为最终结果'));
    const r = await gradeProject(gradeArgs);
    expect(r.totalScore).toBe(66);
  });

  it('G4: JSON 被截断（无尾括号，finish_reason=length）→ 补全解析成功', async () => {
    mockFetch(okRes('{"totalScore":58,"breakdown":[{"item":"功能"', 'length'));
    const r = await gradeProject(gradeArgs);
    expect(r.totalScore).toBe(58);
  });

  it('G5: 纯文本响应（无 totalScore）→ 重试后抛错', async () => {
    mockFetch(okRes('这是一段纯文本评语，模型拒绝输出 JSON'));
    await expect(gradeProject(gradeArgs)).rejects.toThrow('返回格式不包含有效的 JSON');
  }, 12000);

  it('G6: 有 JSON 但无 totalScore 字段（结构不符）→ 抛错', async () => {
    mockFetch(okRes('{"score":80,"comment":"别的结构"}'));
    await expect(gradeProject(gradeArgs)).rejects.toThrow('返回格式不包含有效的 JSON');
  }, 12000);
});
