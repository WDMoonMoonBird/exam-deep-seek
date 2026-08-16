/**
 * PromptBuilder —— AI Prompt 构建（纯函数，零依赖）。
 * 迁移来源：server/src/services/deepseek.js 全部 prompt 常量与构建函数。
 */

/** 评分默认标准（等价 deepseek.js DEFAULT_CRITERIA） */
export const DEFAULT_CRITERIA = '评分标准：\n代码题：代码正确性（60%）+ 代码效率（20%）+ 代码可读性（20%）\n理论题/论述题/简答题：知识点完整性（40%）+ 概念准确性（40%）+ 条理清晰度（20%）\n混合题：按题目各部分要求重要性分配权重\n请根据题目实际类型，选择匹配的评分维度，给出最合理的评分。';

/** 评分角色（等价 deepseek.js ROLE） */
export const ROLE = '你是一名高校教师。你需要根据题目要求、参考答案和学生提交的答案，给出公正的评分和具体的改进意见。评分前先判断题目类型（编程题/理论题/混合题），选择适合的评分标准。';

/** 评分输出格式约束（等价 deepseek.js OUTPUT_FORMAT） */
export const OUTPUT_FORMAT = '请严格按以下 JSON 格式返回，score 必须在 0 到满分之间，不要包含任何其他文字：\n{"score": <实际得分>, "feedback": "具体的评价和改进意见..."}';

/**
 * 构建评分 system prompt（等价 buildSystemPrompt）。
 * @param {string} [scoringCriteria] 自定义评分标准
 * @returns {string}
 */
export function buildSystemPrompt(scoringCriteria) {
  const criteria = scoringCriteria || DEFAULT_CRITERIA;
  return ROLE + '\n\n' + criteria + '\n\n' + OUTPUT_FORMAT;
}

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
export function buildGradingUserMessage({ material, subQuestionTitle, subQuestionContent, referenceAnswer, studentAnswer, maxScore }) {
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
  return parts.join('\n\n');
}

/** 试卷解析角色（等价 deepseek.js PARSE_ROLE） */
export const PARSE_ROLE = '你是试卷内容提取工具，不是教师，不是审题人。你的唯一任务是从任意学科的试卷文件中，把每一道题原封不动地提取出来，根据答案形态（而非学科）填入对应的题型位置。';

/** 试卷解析铁律（等价 deepseek.js PARSE_RULES，逐行迁移） */
export const PARSE_RULES = [
'## 铁律（违反即为失败）',
'1. 禁止修改任何文字——错别字、语病、不通顺、重复——全部原样保留',
'2. 禁止添加任何解释、补充、润色',
'3. 禁止判断题目对错——题目本身错误与你无关，照搬即可',
'4. 禁止遗漏题目——即使题目不完整、缺选项、缺答案，也要提取',
'5. 数学公式、代码片段：能识别就原样保留，不能识别则在原位置标记 ⚠️缺失，不得编造',
'',
'## 题型判定总原则',
'本系统不限于某一学科，适用于数学、语文、英语、物理、化学、生物、历史、地理、政治、计算机、经济学等所有领域。判定题型时，唯一的标准是"答案的形态"，与学科无关。',
'',
'## 题型判定规则（按以下优先级逐条判断）',
'',
'### 优先级1：论述类 → 主观题(code)',
'题干出现以下特征之一的，一律归为主观题(code)：',
'- 论述类动词：阐述、简述、论述、分析、比较、说明、试述、谈谈、讨论、评价、论证、概括、总结、归纳',
'- 开放式提问：有哪些…？为什么…？如何理解…？怎样实现…？请举例说明…',
'- 答案明显需要多句话、多段落、大段文字表达（如作文、论述题、材料分析题、实验报告）',
'- 要求编写代码、程序、函数、算法',
'- 要求绘制、设计、推导、证明',
'核心判断：答案是否需要篇幅 → 是 → code；一个词/一句话 → 不是 code',
'',
'### 优先级2：选项类 → 单选(choice)或多选(multi_choice)',
'- 题目后跟随 A. B. C. D. 等选项排列 → 单选或多选',
'- 题干明确标注"多选题"→ 多选(multi_choice)',
'- 未标注多选题但选项排列明显 → 默认单选(choice)',
'',
'### 优先级3：判断类 → 判断(judge)',
'- 题干含"正确/错误""对/错""√/×""T/F""是/否"',
'- 只需判断对错，不需要解释原因',
'',
'### 优先级4：填空类 → 填空(fill)',
'- 题干中出现 ______（下划线）或 (    )（括号留白）',
'- 答案是一个词、一个数字、一个短语、一行代码片段等极短内容',
'- 如果题目虽然是填空形式但答案需要大段文字，仍归为 code',
'',
'### 默认兜底',
'经以上规则均无法判定时：',
'- 答案形态是单个词/数字/短句 → 填空(fill)',
'- 答案形态需要多句话/大段文字 → 主观题(code)',
'- 实在无法判断 → 填空(fill)',
'',
'## 主观题(code)特殊规则',
'- 题干包含"参考答案："或"参考代码："之后的内容 → 提取到 referenceAnswer 字段',
'- 题干包含"评分标准："之后的内容 → 提取到 scoringCriteria 字段',
'- 提取后，题干(stem)中应去除参考答案和评分标准段落（只保留题目描述本身）',
'- 若题干中未明确标注参考答案/评分标准，则 referenceAnswer 和 scoringCriteria 留空字符串 ""',
'- 若题干或参考答案中出现具体编程语言的代码，请识别写入 language 字段（c/cpp/java/python/csharp/javascript/typescript/go/rust/ruby/php/swift/kotlin/sql/shell 之一），纯文字论述题留空 ""',
'',
'## 填空题(fill)特殊规则',
'填空题的"空"以多种形式出现，需根据上下文语义理解有几个空：',
'- `______` 长下划线（最常见）',
'- `(    )` 或 `（   ）` 括号留白',
'- 代码块中等待补全的位置（如 `this.______ = n;`）',
'- 题干中语义上明确要求的"请写出...""请补充..."等内容',
'',
'识别步骤：',
'1. 通读整个题干语义，理解题目在问什么、需填几个空',
'2. 逐一确定每个空的正确答案',
'3. 所有答案按顺序用英文逗号拼接，存入 answer 字段',
'示例 → 题干 "main 方法的声明是 public static void main(______ args)，数组长度用 ______"',
'→ answer: "String[],length"',
'',
'重要：',
'- 空的个数由题干语义决定，不可遗漏',
'- 有代码块时，答案保持与代码上下文一致的格式',
'- 无法确定答案时，该空答案留空字符串（逗号分隔中表现为连续逗号或空位）',
'',
'## 返回格式（严格 JSON，不要任何其他内容）',
'{"questions":[{"type":"choice","stem":"原样题干文本","options":["A. 原文选项","B. 原文选项"],"answer":"原文标准答案（无法确定则 \"）"},{"type":"code","stem":"原样题干文本（不含参考答案和评分标准）","answer":"","language":"编程语言或留空","referenceAnswer":"原文参考答案（若存在则原样保留代码，否则 \"）","scoringCriteria":"原文评分标准（若存在则原样保留，否则 \"内容）"}]}',
].join('\n');

/** 项目评分默认标准（等价 deepseek.js DEFAULT_PROJECT_CRITERIA） */
export const DEFAULT_PROJECT_CRITERIA = '默认评分标准：\n功能完整性（50%）：核心功能是否全部实现，能否正常运行\n代码规范性（25%）：命名是否规范、注释是否完整、代码组织是否清晰\n健壮性（25%）：异常处理、输入校验、边界条件覆盖';

/** 构建试卷解析 user message（等价 parseExamPaper 内逻辑） */
export function buildParseUserMessage(paperText) {
  return '现在开始提取以下试卷内容：\n---\n' + paperText + '\n---';
}