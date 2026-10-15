/**
 * PromptBuilder —— AI Prompt 构建（纯函数，零依赖）。
 * 迁移来源：server/src/services/deepseek.js 全部 prompt 常量与构建函数。
 */

// ★L4：system 提示的单一真源在 domain（含静态 system + 教师标准数据块），infra 侧不再各写一份语义
import { buildSystemPrompt as domainBuildSystemPrompt, buildCriteriaDataBlock as domainCriteriaBlock, DEFAULT_CRITERIA as domainDefaultCriteria, PARSE_ROLE as domainParseRole, PARSE_RULES as domainParseRules, ROLE as domainRole, OUTPUT_FORMAT as domainOutputFormat, DEFAULT_PROJECT_CRITERIA as domainDefaultProjectCriteria, PROJECT_REVIEW_SYSTEM as domainProjectReviewSystem } from '../../domain/services/deepseek/prompts.js';

/**
 * 评分默认标准 —— ★W2-D2（t41）：**委托 domain 的单一真源**（此前是本地字面量，与 domain 那份仅差两字：
 *   「混合题：按题目【各部分】要求重要性分配权重」vs「混合题：按题目要求重要性分配权重」；同 141 字符 ⇒
 *   长度与肉眼检查都发现不了，导致「作业评分/预览链路」与「编程题链路」在教师未自定义标准时默认标准不同）。
 *   原注释写的「等价 deepseek.js DEFAULT_CRITERIA」这一假设早已不成立 —— 本修法让"等价"由**同一份定义**保证。
 */
export const DEFAULT_CRITERIA = domainDefaultCriteria;

/**
 * ★W2-D2（t41）：ROLE / OUTPUT_FORMAT / DEFAULT_PROJECT_CRITERIA 三份本地副本改为 **re-export domain 单一真源**。
 *   为什么是 re-export 而非删除：`server/src` 全扫描显示无**生产**消费者，但 `server/test/unit/infrastructure/prompt-builder.test.js`
 *   仍 import 这三个名字（**测试侧消费者**，属 C 的写域、本任务不改）⇒ 删除会破坏其加载（实测 SyntaxError: does not provide an export）。
 *   re-export 保留导出面、让三处常量重新同源；三者在改动前本就逐字节相同 ⇒ 内容零变化。
 */
export const ROLE = domainRole;
export const OUTPUT_FORMAT = domainOutputFormat;
export const DEFAULT_PROJECT_CRITERIA = domainDefaultProjectCriteria;

/**
 * 构建评分 system prompt（等价 buildSystemPrompt）。
 * @param {string} [scoringCriteria] 自定义评分标准
 * @returns {string}
 */
/**
 * ★L4（W2-P3）：system 提示**静态化**（原先把教师自定义标准拼进来 ⇒ 半可信输入可改写系统指令）。
 *   教师标准改由 buildGradingUserMessage 作为 **user 段分隔数据**追加；本函数委托 domain 的单一真源。
 * @returns {string}
 */
export function buildSystemPrompt() {
  return domainBuildSystemPrompt();
}

/** ★L4：教师评分标准数据块（委托 domain 的单一真源） */
export const buildCriteriaDataBlock = domainCriteriaBlock;

/**
 * 构建评分 user message（等价 gradeSubmission 内 parts 逻辑）。
 * @param {object} p
 * @param {string} [p.material] 大题材料（可选）
 * @param {string} [p.subQuestionTitle] 小题标题
 * @param {string} p.subQuestionContent 小题题目内容
 * @param {string} p.referenceAnswer 参考答案
 * @param {string} p.studentAnswer 学生答案
 * @param {number} p.maxScore 满分
 * @returns {string}
 */
export function buildGradingUserMessage({ material, subQuestionTitle, subQuestionContent, referenceAnswer, studentAnswer, maxScore, scoringCriteria }) {
  const parts = [];
  if (material && material.replace(/<[^>]*>/g, '').trim()) {
    parts.push('## 题目材料\n' + material);
  }
  parts.push(
    '## ' + (subQuestionTitle || '题目') + '\n' + subQuestionContent
    + '\n\n## 参考答案\n' + referenceAnswer
    + '\n\n## 学生提交的答案\n' + studentAnswer
    + '\n\n## 评分要求\n满分：' + maxScore + ' 分\n请判断题目类型（编程题/理论题/混合题），选择合适的评分标准，根据参考答案对学生答案进行评分。'
  );
  // ★L4：教师标准不再进 system —— 作为 user 段的分隔数据块追加（缺省回落 DEFAULT_CRITERIA，标准始终进入 prompt）
  parts.push(buildCriteriaDataBlock(scoringCriteria || DEFAULT_CRITERIA));
  return parts.join('\n\n');
}

// ★W2-D2（t41）：PARSE_ROLE 改为**委托 domain**（此前本地副本无漂移但属双份定义）。
export const PARSE_ROLE = domainParseRole;

/** 试卷解析铁律（等价 deepseek.js PARSE_RULES，逐行迁移） */
// ★W2-D2（t41）：PARSE_RULES 改为**委托 domain** —— 原 infra 副本与 domain 已漂移（2085 vs 2084，
//   多一个全角括号；肉眼与长度检查都看不出），而 deepseek-gateway.js:9 正消费该副本 ⇒ 委托后两条链路重新同源。
export const PARSE_RULES = domainParseRules;

/** 项目评分默认标准（等价 deepseek.js DEFAULT_PROJECT_CRITERIA） */

/** 项目评审 system prompt（等价迁移自 projectGrader.gradeAI） */
// ★W2-D3（t44）：改为 **re-export domain 单一真源**（含 PROJECT_SECURITY_CLAUSE）；此前本地字面量不含条款，
//   而 sidecar 不可达/open/fixedItems 时会降级到它 ⇒ 活路径上的无防护评分。
export const PROJECT_REVIEW_SYSTEM = domainProjectReviewSystem;

/**
 * 构建项目评审 user message（等价迁移自 gradeAI）。
 * @param {object} p
 * @param {string} p.standardFiles 标准工程文件列表
 * @param {string} p.submissionFiles 学生提交文件列表
 * @param {string} [p.promptExtra] 教师自定义提示词
 * @returns {string}
 */
export function buildProjectReviewUserMessage({ standardFiles, submissionFiles, promptExtra }) {
  return '## 标准工程文件结构\n'
    + (standardFiles || '(无标准工程)')
    + '\n\n## 学生提交文件结构\n'
    + (submissionFiles || '(无文件)')
    + '\n\n## 评分要求\n请根据以下维度评分（满分100分）：\n- 代码质量（40分）：代码是否规范、命名是否合理、是否有适当的注释\n- 设计规范（30分）：项目结构是否合理、是否遵循设计模式\n- 功能完整性（30分）：是否实现了标准工程的核心功能\n\n'
    + (promptExtra ? '## 教师附加要求\n' + promptExtra + '\n\n' : '')
    + '请严格按以下 JSON 格式返回，不要包含任何其他文字：\n{"score": <0-100之间的整数>, "feedback": "详细的评语和改进建议..."}';
}

/** 构建试卷解析 user message（等价 parseExamPaper 内逻辑） */
export function buildParseUserMessage(paperText) {
  return '现在开始提取以下试卷内容：\n---\n' + paperText + '\n---';
}