/**
 * prompt-builder.test.js — Prompt 构建纯函数单元测试（零依赖，离线）。
 * 覆盖：各 prompt 模板分支（默认/自定义评分标准、材料有无、标题缺省、
 * 项目评审 promptExtra 有无、解析 prompt 包裹），以及全部导出常量非空。
 */
import {
  DEFAULT_CRITERIA,
  ROLE,
  OUTPUT_FORMAT,
  buildSystemPrompt,
  buildCriteriaDataBlock,
  buildGradingUserMessage,
  PARSE_ROLE,
  PARSE_RULES,
  buildParseUserMessage,
  DEFAULT_PROJECT_CRITERIA,
  PROJECT_REVIEW_SYSTEM,
  buildProjectReviewUserMessage,
} from '../../../src/infrastructure/ai/prompt-builder.js';

// ★L4（W2-C9）：旧语义是"默认/自定义标准出现在 **system**"；现已改为
//   system **恒定**（无参）、教师标准一律经 buildCriteriaDataBlock 进 **user 段**。
// ★W2-D3（t44）+ ★W2-C10：system 现为 `ROLE + 输出格式 + 面向散文答案的防注入条款`（`prompts.js:31`）。
//   该条款常量 `ANSWER_SECURITY_CLAUSE`（prompts.js:21）是 **domain 模块内常量、未导出** ⇒
//   **不为写断言而要求生产侧导出**（那属生产改动）。故等式形态改为"**恒定前缀逐字节等式** +
//   **尾部安全条款（标记 + 非空 + 多次调用逐字节恒定）**"，见下方注释与报告 §2 的取舍说明。
describe('buildSystemPrompt — 评分 system（★L4：恒定、不含任何评分标准）', () => {
  it('无参 → ROLE + 输出格式 + 防注入条款；**不含**任何标准；且前缀逐字节恒定', () => {
    const p = buildSystemPrompt();
    const EXPECTED_PREFIX = `${ROLE}\n\n${OUTPUT_FORMAT}\n\n`;
    expect(p).toContain(ROLE);
    expect(p).toContain(OUTPUT_FORMAT);
    // ★判别力（旧断言恰相反：曾断言 system 含 '代码正确性（60%）'）
    expect(p).not.toContain('代码正确性（60%）');
    expect(p).not.toContain(DEFAULT_CRITERIA);
    // ★逐字节：恒定前缀必须完全一致 —— 任何"把标准/教师内容拼进 system"的改动都会破坏它
    expect(p.startsWith(EXPECTED_PREFIX)).toBe(true);
    const tail = p.slice(EXPECTED_PREFIX.length);
    // ★W2-C10：尾部 = t44 追加的防注入条款（未导出 ⇒ 不跨层比常量，改用语义 + 恒定性双重锁定）
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.startsWith('【安全要求】')).toBe(true);   // 条款标记（prompts.js:21 字面量开头）
    expect(buildSystemPrompt()).toBe(p);                 // 恒定：同 API 两次调用逐字节相同
    expect(buildSystemPrompt(undefined)).toBe(p);        // 无参 / 显式 undefined 同口径
    // 尾部不得含任何教师可控内容（防御"把标准塞到条款后面"）
    expect(tail).not.toContain('只看正确性：100%');
    expect(tail).not.toContain('代码正确性（60%）');
  });

  it('★旧语义不得回归：即便传入 scoringCriteria，system 依然恒定（该参数已从实现移除）', () => {
    const p = buildSystemPrompt('只看正确性：100%');
    expect(p).not.toContain('只看正确性：100%');
    expect(p).not.toContain('代码正确性（60%）');
    expect(p).toBe(buildSystemPrompt());
  });
});

describe('buildCriteriaDataBlock — 标准经此进 user 段（★L4）', () => {
  it('缺省 ⇒ 回落 DEFAULT_CRITERIA，且被 CRITERIA_DATA 围栏 + 「非指令」声明包裹', () => {
    const b = buildCriteriaDataBlock();
    expect(b).toContain('<<<CRITERIA_DATA');
    expect(b).toContain('CRITERIA_DATA>>>');
    expect(b).toContain('非指令');
    const inner = b.slice(b.indexOf('<<<CRITERIA_DATA'), b.indexOf('CRITERIA_DATA>>>'));
    // 注：barrel 的 DEFAULT_CRITERIA（prompt-builder.js:10）与 domain 同名常量（prompts.js:6）**并非同一字符串**
    //   （实测同为 141 字符但内容不同）⇒ 此处断言稳定的语义子串，而不是逐字节比对某一侧的常量。
    expect(inner).toContain('代码正确性（60%）');
    expect(inner).toContain('评分标准');
  });

  it('自定义 ⇒ **替换**默认（围栏内是自定义文本、且不含默认标准）', () => {
    const b = buildCriteriaDataBlock('只看正确性：100%');
    expect(b).toContain('只看正确性：100%');
    expect(b).not.toContain('代码正确性（60%）');
    const inner = b.slice(b.indexOf('<<<CRITERIA_DATA'), b.indexOf('CRITERIA_DATA>>>'));
    expect(inner).toContain('只看正确性：100%');
  });

  it('空字符串 ⇒ 回落默认（与缺省**逐字节同口径**）', () => {
    expect(buildCriteriaDataBlock('')).toBe(buildCriteriaDataBlock());
    expect(buildCriteriaDataBlock('')).toContain('代码正确性（60%）');
  });
});

// ★W2-C9：把"标准必须真的进 user message"这一环也钉住（否则 system 静态化后标准可能谁都不到）
describe('buildGradingUserMessage — 标准块确实进 user 段（★L4 闭环）', () => {
  const req = {
    material: null, subQuestionTitle: '小题1', subQuestionContent: '<p>题目</p>',
    referenceAnswer: 'print(1)', studentAnswer: 'print(2)', maxScore: 100,
  };
  it('缺省标准 ⇒ user 段含 CRITERIA_DATA 围栏与 DEFAULT_CRITERIA', () => {
    const u = buildGradingUserMessage({ ...req });
    expect(u).toContain('<<<CRITERIA_DATA');
    expect(u).toContain(DEFAULT_CRITERIA);
  });
  it('自定义标准 ⇒ user 段含自定义文本且不含默认标准（替换语义）', () => {
    const u = buildGradingUserMessage({ ...req, scoringCriteria: '只看正确性：100%' });
    expect(u).toContain('只看正确性：100%');
    expect(u).not.toContain('代码正确性（60%）');
  });
});

describe('buildGradingUserMessage — 评分 user message 分支', () => {
  const base = {
    subQuestionTitle: '小题1',
    subQuestionContent: '<p>题目内容</p>',
    referenceAnswer: 'print(1)',
    studentAnswer: 'print(2)',
    maxScore: 30,
  };

  it('无 material → 不含材料段', () => {
    const p = buildGradingUserMessage({ ...base, material: null });
    expect(p).not.toContain('## 题目材料');
    expect(p).toContain('## 小题1');
  });

  it('有文本 material → 含材料段且带原文', () => {
    const p = buildGradingUserMessage({ ...base, material: '<p>闭卷考试</p>' });
    expect(p).toContain('## 题目材料');
    expect(p).toContain('闭卷考试');
  });

  it('material 为纯 HTML 空标签 → 不含材料段（去标签后空白）', () => {
    const p = buildGradingUserMessage({ ...base, material: '<p>  </p><div></div>' });
    expect(p).not.toContain('## 题目材料');
  });

  it('subQuestionTitle 缺省 → 使用默认标题「题目」', () => {
    const p = buildGradingUserMessage({ ...base, subQuestionTitle: '' });
    expect(p).toContain('## 题目');
    expect(p).not.toContain('## 小题1');
  });

  it('完整消息包含参考答案/学生答案/评分要求/满分', () => {
    const p = buildGradingUserMessage(base);
    expect(p).toContain('## 参考答案');
    expect(p).toContain('print(1)');
    expect(p).toContain('## 学生提交的答案');
    expect(p).toContain('print(2)');
    expect(p).toContain('满分：30 分');
    expect(p).toContain('## 评分要求');
  });

  it('分段以空行连接（\n\n）', () => {
    const p = buildGradingUserMessage({ ...base, material: '<p>材料</p>' });
    expect(p).toContain('## 题目材料\n<p>材料</p>\n\n## 小题1');
  });
});

describe('buildParseUserMessage — 试卷解析 prompt 包裹', () => {
  it('包裹试卷文本', () => {
    const p = buildParseUserMessage('第一题…\n第二题…');
    expect(p).toContain('现在开始提取以下试卷内容：');
    expect(p).toContain('---\n第一题…\n第二题…\n---');
  });
});

describe('buildProjectReviewUserMessage — 项目评审 user message 分支', () => {
  it('standardFiles/submissionFiles 缺省 → 占位提示', () => {
    const p = buildProjectReviewUserMessage({ standardFiles: null, submissionFiles: null });
    expect(p).toContain('(无标准工程)');
    expect(p).toContain('(无文件)');
  });

  it('正常文件列表 → 原样拼入', () => {
    const p = buildProjectReviewUserMessage({ standardFiles: 'src/Main.java', submissionFiles: 'src/Student.java' });
    expect(p).toContain('## 标准工程文件结构\nsrc/Main.java');
    expect(p).toContain('## 学生提交文件结构\nsrc/Student.java');
  });

  it('promptExtra 有值 → 含教师附加要求段', () => {
    const p = buildProjectReviewUserMessage({ standardFiles: 'a', submissionFiles: 'b', promptExtra: '重点看健壮性' });
    expect(p).toContain('## 教师附加要求');
    expect(p).toContain('重点看健壮性');
  });

  it('promptExtra 缺省 → 不含教师附加要求段', () => {
    const p = buildProjectReviewUserMessage({ standardFiles: 'a', submissionFiles: 'b' });
    expect(p).not.toContain('## 教师附加要求');
  });

  it('结尾含 0-100 JSON 格式约束', () => {
    const p = buildProjectReviewUserMessage({ standardFiles: 'a', submissionFiles: 'b' });
    expect(p).toContain('{"score": <0-100之间的整数>, "feedback": "详细的评语和改进建议..."}');
    expect(p).toContain('代码质量（40分）');
    expect(p).toContain('设计规范（30分）');
    expect(p).toContain('功能完整性（30分）');
  });
});

describe('prompt-builder 导出常量', () => {
  it('评分常量均非空且含关键语义', () => {
    expect(DEFAULT_CRITERIA).toContain('评分标准');
    expect(ROLE).toContain('高校教师');
    expect(OUTPUT_FORMAT).toContain('"score"');
    expect(DEFAULT_PROJECT_CRITERIA).toContain('功能完整性（50%）');
    expect(PROJECT_REVIEW_SYSTEM).toContain('评分范围 0-100');
  });

  it('PARSE_ROLE 与 PARSE_RULES 非空且铁律完整', () => {
    expect(PARSE_ROLE).toContain('试卷内容提取工具');
    expect(PARSE_RULES).toContain('铁律');
    expect(PARSE_RULES).toContain('优先级1');
    expect(PARSE_RULES).toContain('"questions"');
  });
});
