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
  buildGradingUserMessage,
  PARSE_ROLE,
  PARSE_RULES,
  buildParseUserMessage,
  DEFAULT_PROJECT_CRITERIA,
  PROJECT_REVIEW_SYSTEM,
  buildProjectReviewUserMessage,
} from '../../../src/infrastructure/ai/prompt-builder.js';

describe('buildSystemPrompt — 评分 system prompt 分支', () => {
  it('无参 → 含 ROLE + 默认评分标准 + 输出格式约束', () => {
    const p = buildSystemPrompt();
    expect(p).toContain(ROLE);
    expect(p).toContain('代码正确性（60%）');
    expect(p).toContain(OUTPUT_FORMAT);
  });

  it('自定义 scoringCriteria → 替换默认标准', () => {
    const p = buildSystemPrompt('只看正确性：100%');
    expect(p).toContain('只看正确性：100%');
    expect(p).not.toContain('代码正确性（60%）');
  });

  it('空字符串 scoringCriteria → 回退默认标准', () => {
    const p = buildSystemPrompt('');
    expect(p).toContain('代码正确性（60%）');
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
