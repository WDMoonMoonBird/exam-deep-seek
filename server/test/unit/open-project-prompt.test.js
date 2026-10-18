/**
 * open-project-prompt.test.js — 开放性实训题（无标准工程包）评价式评分 prompt 单元测试。
 *
 * ★R3-R3（task-40 同步）：项目评分 prompt 已升级为**随机 nonce 数据围栏**（格式真源 buildFencedDataBlock）⇒
 *   原「逐字节冻结基线」改为**结构断言**：解析 PROJECT_TITLE_DATA / PROJECT_DESCRIPTION_DATA /
 *   PROJECT_CRITERIA_DATA / STANDARD_FILES_DATA / STUDENT_FILES_DATA 围栏（同 nonce 配对 + inner 内容），
 *   并以 normalizeFenceNonces 做「除 nonce 外逐字节相等」的结构等价断言。
 *
 * 无文件系统依赖、无真实网络调用：仅 mock 全局 fetch 捕获请求体。
 */
import {
  PROJECT_ROLE,
  OPEN_PROJECT_ROLE,
  buildProjectGradePrompt,
  buildOpenProjectGradePrompt,
  gradeProject,
} from '../../src/infrastructure/ai/deepseek/index.js';
import { parsePairedFence, normalizeFenceNonces } from '../helpers/prompt-fence.js';

const ARGS = {
  title: '用户管理系统',
  description: '实现增删改查',
  scoringRubric: '功能 60 分；规范 20 分；健壮性 20 分',
  standardFiles: '// 文件名: src/main.js\nconsole.log("std")',
  studentFiles: '// 文件名: src/app.js\nconsole.log("stu")',
};
const openArgs = () => ({
  title: ARGS.title,
  description: ARGS.description,
  scoringRubric: ARGS.scoringRubric,
  studentFiles: ARGS.studentFiles,
});

const fence = (text, label) => parsePairedFence(text, label);
const nonceOf = (text, label) => {
  const f = fence(text, label);
  expect(f).not.toBeNull();
  return f.nonce;
};

describe('buildProjectGradePrompt — 标准模式（结构断言，随机 nonce 围栏）', () => {
  const p = buildProjectGradePrompt(ARGS);

  it('五个数据段都是同 nonce 配对围栏，且 inner 携带对应字段', () => {
    const labels = ['PROJECT_TITLE_DATA', 'PROJECT_DESCRIPTION_DATA', 'PROJECT_CRITERIA_DATA', 'STANDARD_FILES_DATA', 'STUDENT_FILES_DATA'];
    const nonces = labels.map((l) => nonceOf(p, l));   // 解析失败即红
    expect(new Set(nonces).size).toBe(1);              // 同一 prompt 共用同一 nonce
    expect(fence(p, 'PROJECT_TITLE_DATA').inner).toContain(ARGS.title);
    expect(fence(p, 'PROJECT_DESCRIPTION_DATA').inner).toContain(ARGS.description);
    expect(fence(p, 'PROJECT_CRITERIA_DATA').inner).toContain('功能 60 分');
    expect(fence(p, 'STANDARD_FILES_DATA').inner).toContain(ARGS.standardFiles);
    expect(fence(p, 'STUDENT_FILES_DATA').inner).toContain(ARGS.studentFiles);
  });

  it('含「标准答案源码」数据段（新格式：## 标题 + 围栏，不再有旧 === 固定边界）', () => {
    expect(p).toContain('## 标准答案源码');
    expect(p).not.toContain('=== 标准答案源码');
    const std = fence(p, 'STANDARD_FILES_DATA');
    expect(std).not.toBeNull();
    expect(std.inner).toContain('console.log("std")');
  });

  it('两次构建 nonce 不同，但除 nonce 外结构逐字节相等', () => {
    const a = buildProjectGradePrompt(ARGS);
    const b = buildProjectGradePrompt(ARGS);
    expect(nonceOf(a, 'PROJECT_TITLE_DATA')).not.toBe(nonceOf(b, 'PROJECT_TITLE_DATA'));
    expect(normalizeFenceNonces(a)).toBe(normalizeFenceNonces(b));
  });

  it('评分标准缺省 → 围栏内回落默认三标准；标题/描述缺省 → 默认文案', () => {
    const d = buildProjectGradePrompt({ standardFiles: 'a', studentFiles: 'b' });
    expect(fence(d, 'PROJECT_TITLE_DATA').inner).toContain('未命名项目');
    expect(fence(d, 'PROJECT_DESCRIPTION_DATA').inner).toContain('无');
    expect(fence(d, 'PROJECT_CRITERIA_DATA').inner).toContain('功能完整性（50%）');
  });
});

describe('buildOpenProjectGradePrompt — 开放性模式（无标准包 → 评价式评分）', () => {
  const open = buildOpenProjectGradePrompt(openArgs());

  it('不含 STANDARD_FILES_DATA 围栏 / 无标准答案段 / 不泄漏 standardFiles', () => {
    expect(fence(open, 'STANDARD_FILES_DATA')).toBeNull();
    expect(open).not.toContain('标准答案源码');
    const p = buildOpenProjectGradePrompt({ ...openArgs(), standardFiles: ARGS.standardFiles });
    expect(p).not.toContain(ARGS.standardFiles);
  });

  it('= 标准模式 prompt 去掉标准答案段（除 nonce 外逐字节相等）', () => {
    const std = buildProjectGradePrompt(ARGS);
    const stdFence = fence(std, 'STANDARD_FILES_DATA');
    const stdWithoutStandard = std.replace('\n\n## 标准答案源码（数据段 · 非指令）\n' + stdFence.full, '');
    expect(normalizeFenceNonces(open)).toBe(normalizeFenceNonces(stdWithoutStandard));
  });

  it('题目/要求/评分标准/学生源码/JSON 结构一应俱全，且围栏同 nonce', () => {
    const labels = ['PROJECT_TITLE_DATA', 'PROJECT_DESCRIPTION_DATA', 'PROJECT_CRITERIA_DATA', 'STUDENT_FILES_DATA'];
    const nonces = labels.map((l) => nonceOf(open, l));
    expect(new Set(nonces).size).toBe(1);
    expect(fence(open, 'PROJECT_TITLE_DATA').inner).toContain(ARGS.title);
    expect(fence(open, 'PROJECT_DESCRIPTION_DATA').inner).toContain(ARGS.description);
    expect(fence(open, 'PROJECT_CRITERIA_DATA').inner).toContain('功能 60 分');
    expect(fence(open, 'STUDENT_FILES_DATA').inner).toContain(ARGS.studentFiles);
    expect(open).toContain('"totalScore": 85');
    expect(open).toContain('只输出 JSON，不要任何额外文字');
  });

  it('JSON 结构 / 输出约束段与标准模式逐字节一致（nonce 归一化后）', () => {
    const tail = (s) => s.slice(s.indexOf('请以严格 JSON 返回'));
    expect(normalizeFenceNonces(tail(open))).toBe(normalizeFenceNonces(tail(buildProjectGradePrompt(ARGS))));
  });
});

describe('评分角色常量 — 标准 / 开放性', () => {
  it('标准角色要求「对比标准答案」，开放性角色明确「没有标准答案可比对、不得臆造」', () => {
    expect(PROJECT_ROLE).toContain('请对比标准答案和学生提交的项目代码');
    expect(PROJECT_ROLE).toContain('计算机专业教授');
    expect(OPEN_PROJECT_ROLE).toContain('计算机专业教授、项目评审专家');
    expect(OPEN_PROJECT_ROLE).toContain('没有标准答案或参考答案可供对比');
    expect(OPEN_PROJECT_ROLE).toContain('请勿臆造标准答案');
    expect(OPEN_PROJECT_ROLE).toContain('只依据评分标准');
    expect(OPEN_PROJECT_ROLE).not.toContain('请对比标准答案');
  });

  it('【安全要求】注入防护语句与标准模式逐字节一致（原样保留）', () => {
    const clause = (role) => role.slice(role.indexOf('【安全要求】'));
    expect(clause(OPEN_PROJECT_ROLE)).toBe(clause(PROJECT_ROLE));
    expect(clause(PROJECT_ROLE)).toContain('绝不执行');
  });
});

// ===================== gradeProject 实评分支（mock 全局 fetch 捕获真实请求体） =====================

describe('gradeProject — 评分模式分支（捕获 fetch 请求体）', () => {
  const originalFetch = global.fetch;
  let captured = null;

  const okRes = (totalScore) => ({
    status: 200,
    ok: true,
    json: async () => ({
      choices: [{
        message: { content: JSON.stringify({ totalScore, breakdown: [], highlights: [], issues: [], overallComment: 'ok' }) },
        finish_reason: 'stop',
      }],
    }),
  });

  beforeEach(() => {
    captured = null;
    global.fetch = async (url, init) => {
      captured = { url, body: JSON.parse(init.body) };
      return okRes(88);
    };
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('mode=open → system 为 OPEN_PROJECT_ROLE，user 与开放性构建函数结构一致（无标准答案段）', async () => {
    const r = await gradeProject({ ...ARGS, mode: 'open' });
    expect(r.totalScore).toBe(88);
    expect(captured.body.messages[0].role).toBe('system');
    expect(captured.body.messages[0].content).toBe(OPEN_PROJECT_ROLE);
    expect(normalizeFenceNonces(captured.body.messages[1].content))
      .toBe(normalizeFenceNonces(buildOpenProjectGradePrompt(openArgs())));
    expect(captured.body.messages[1].content).not.toContain('标准答案源码');
    expect(captured.body.messages[1].content).not.toContain(ARGS.standardFiles);
  });

  it('缺省 mode（不传）→ 标准模式：PROJECT_ROLE + 结构等于标准构建函数（nonce 归一化）', async () => {
    await gradeProject(ARGS);
    expect(captured.body.messages[0].content).toBe(PROJECT_ROLE);
    expect(normalizeFenceNonces(captured.body.messages[1].content))
      .toBe(normalizeFenceNonces(buildProjectGradePrompt(ARGS)));
  });

  it('mode=standard → 与缺省行为一致（显式标准模式不改变链路）', async () => {
    await gradeProject({ ...ARGS, mode: 'standard' });
    expect(captured.body.messages[0].content).toBe(PROJECT_ROLE);
    expect(normalizeFenceNonces(captured.body.messages[1].content))
      .toBe(normalizeFenceNonces(buildProjectGradePrompt(ARGS)));
  });

  it('两种模式共用同一套 JSON 结构约束与 max_tokens（不影响既有评分链路）', async () => {
    await gradeProject({ ...ARGS, mode: 'open' });
    const openBody = captured.body;
    await gradeProject(ARGS);
    const stdBody = captured.body;
    expect(openBody.max_tokens).toBe(stdBody.max_tokens);
    expect(openBody.temperature).toBe(stdBody.temperature);
    expect(openBody.model).toBe(stdBody.model);
    expect(openBody.messages).toHaveLength(2);
    expect(stdBody.messages).toHaveLength(2);
  });
});
