/**
 * prompts.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 72-83 · 85-90 · 92-96 · 98-103 · 105-112 · 114-121 · 123-129 · 131-136 · 138-146 · 148-157 · 529-570 · 572-624）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { RULE_TYPES } from '../../../domain/services/checker/parsers.js';

/** 规则 JSON 格式说明（prompt 注入，禁止注释） */
const RULES_FORMAT = [
  '{',
  '  "max_score": 100,',
  '  "objective_items": [',
  '    { "id": "a1", "group": "评分标准分项名", "item": "规则中文描述", "rule_type": "file_exists", "params": { "path": "package.json" }, "max_score": 2 }',
  '  ],',
  '  "subjective_items": [',
  '    { "id": "s1", "item": "主观项中文描述", "max_score": 5 }',
  '  ]',
  '}',
].join('\n');

/** 固定分项 automation_level 分类中文标签（prompt 固定分项段渲染用；旧数据缺失 → 无标注） */
const AUTOMATION_LEVEL_LABELS = {
  deterministic: '确定性',
  semi: '半确定',
  subjective: '主观',
};

/** 固定分项渲染分类标注：deterministic →（确定性）、semi →（半确定）、subjective →（主观）；缺失 → 空串（旧数据兜底） */
function automationLabel(item) {
  const label = AUTOMATION_LEVEL_LABELS[item && item.automation_level];
  return label ? '（' + label + '）' : '';
}

/** 公共 fact 字段（所有语言可用；prompt 注入） */
const FACTS_SCHEMA_COMMON = [
  'language(字符串: "javascript"/"java"/"python"/... 工程语言) / framework(字符串: 框架名)',
  'dependencies(字符串数组: 清单文件依赖名) / entryFiles(字符串数组)',
  'syntaxErrors(数字: 语法错误数) / syntaxErrorFiles(字符串数组)',
].join('\n');

/** JS/Vue 语言 fact 字段（P0-1 起按语言注入） */
const FACTS_SCHEMA_JS = [
  'hasPackageJson(布尔)',
  'vueFiles(数字: Vue 文件数) / jsFiles(数字: JS 文件数) / components(字符串数组)',
  'routes(数字: 路由数) / routePaths(字符串数组) / hasCreateRouter(布尔) / hasVueRouter(布尔)',
  'hasPinia(布尔) / stores(字符串数组) / apiCalls(数字: 接口调用次数)',
  'hasAxiosWrapper(布尔: axios 封装) / hasAxios(布尔)',
].join('\n');

/** Java 语言 fact 字段（P0-1） */
const FACTS_SCHEMA_JAVA = [
  'javaFiles(数字: Java 文件数) / javaClasses(字符串数组: 类名) / javaImports(字符串数组: import 包路径)',
  'packageNames(字符串数组: 包名) / controllers(字符串数组: @RestController/@Controller 类名)',
  'apiMappings(字符串数组: @GetMapping/@PostMapping/@RequestMapping 等路径)',
  'hasSpringBoot(布尔) / hasSpringMvc(布尔) / hasMyBatis(布尔) / hasJpa(布尔) / hasLombok(布尔)',
  'hasPomXml(布尔) / hasGradle(布尔)',
].join('\n');

/** Python 语言 fact 字段（P0-1） */
const FACTS_SCHEMA_PYTHON = [
  'pyFiles(数字: Python 文件数) / pyClasses(字符串数组: 类名) / pyFunctions(字符串数组: 函数名)',
  'pyImports(字符串数组: import 模块名) / flaskRoutes(字符串数组: @app.route 路径)',
  'hasFlask(布尔) / hasDjango(布尔) / hasFastAPI(布尔) / hasPydantic(布尔)',
  'hasRequirementsTxt(布尔) / hasPyproject(布尔)',
].join('\n');

/** 按语言选择 fact 字段清单（未知语言回退 JS 清单，兼容旧题） */
function factsSchemaFor(language) {
  if (language === 'java') return FACTS_SCHEMA_COMMON + '\n' + FACTS_SCHEMA_JAVA;
  if (language === 'python') return FACTS_SCHEMA_COMMON + '\n' + FACTS_SCHEMA_PYTHON;
  return FACTS_SCHEMA_COMMON + '\n' + FACTS_SCHEMA_JS;
}

/** 生成规则的系统提示词（只产 JSON 参数，不产代码 —— 2026-08-17 教训 1） */
const GENERATE_SYSTEM = '你是一个高校实训题评分规则生成器。你的任务是根据评分标准与标准工程包文件树，'
  + '生成一份确定性的评分规则 JSON（只包含规则参数，不写任何可执行代码）。\n'
  + '铁律：\n'
  + '- 只输出 JSON 本身，不要任何解释、代码块围栏或多余文字；\n'
  + '- 字段名必须是 item（规则中文描述），绝对不要用 name；subjective_items 必须输出（无主观项时输出空数组 []）；\n'
  + '- rule_type 只能使用白名单类型；params 必须真实可执行（文件路径必须来自标准包文件树，不得猜测）；\n'
  + '- 客观项必须能通过静态文件检查确定性判定；无法确定性判定的项才放入 subjective_items；\n'
  + '- 客观项总分 + 主观项总分必须恰好等于 max_score。';

/** 规则 JSON 完整示例（格式锚点，防止模型字段漂移） */
const RULES_EXAMPLE = [
  '{',
  '  "max_score": 100,',
  '  "objective_items": [',
  '    { "id": "a1", "group": "项目初始化与运行", "item": "存在 pom.xml", "rule_type": "file_exists", "params": { "path": "pom.xml" }, "max_score": 10 }',
  '  ],',
  '  "subjective_items": []',
  '}',
].join('\n');

/**
 * 构建第 1 轮「生成规则」用户提示词：题目描述 + 评分标准全文 + 满分 + 规则格式 + 白名单 + 文件树。
 * 要求输出严格 JSON（{ max_score, objective_items, subjective_items }），只输出 JSON。
 * @param {string} rubric 教师评分标准
 * @param {number} maxScore 满分
 * @param {Array|null} fixedItems 固定分项（rubricItems 注入）
 * @param {string} stdFileTree 标准包文件树文本
 * @param {string} description 题目描述（2026-08-18 起参与生成）
 * @param {string} [language] 工程语言（javascript/java/python；P0-1 按语言注入 fact 字段，缺省 JS 兼容旧题）
 * @returns {string}
 */
export function buildGenerateUserPrompt(rubric, maxScore, fixedItems, stdFileTree, description, language) {
  const fixed = (Array.isArray(fixedItems) && fixedItems.length > 0)
    ? '\n\n【固定分项（必须逐项覆盖，不得增删改；满分合计 ' + maxScore + ' 分）】\n'
      + fixedItems.map((it, i) => (i + 1) + '. ' + it.item + automationLabel(it) + '（' + it.maxScore + ' 分）').join('\n')
    : '';
  const treeSection = stdFileTree
    ? '\n\n【标准工程包文件树（事实依据，请据此确定文件路径，不要猜测）】\n' + stdFileTree + '\n'
    : '';
  const descSection = (description && String(description).trim())
    ? '【题目描述】\n' + String(description).trim() + '\n\n'
    : '';
  return '【评分标准】\n' + rubric + '\n\n'
    + '【满分】' + maxScore + ' 分' + fixed + '\n\n'
    + descSection
    + treeSection + '\n\n'
    + '【规则格式（严格 JSON，仅此一种输出）】\n' + RULES_FORMAT + '\n\n'
    + '【示例（仅格式参考）】\n' + RULES_EXAMPLE + '\n\n'
    + '【fact 规则可用字段（params: {fact, op, value}，op: >= > <= < == != includes not_includes）】\n' + factsSchemaFor(language) + '\n'
    + '要求：\n'
    + '- 输出严格 JSON：{ max_score, objective_items, subjective_items }；只输出 JSON 本身，不要任何解释、代码块围栏或多余文字\n'
    + '- 字段名必须是 item（规则中文描述），绝对不要用 name；subjective_items 必须输出，无主观项时输出空数组 []\n'
    + '- objective_items 覆盖所有可确定性检查的评分点，每项含 id/group/item/rule_type/params/max_score；params 必须具体可执行（真实文件路径、正则表达式等）\n'
    + '- rule_type 只能使用白名单类型：' + RULE_TYPES.join(' / ') + '\n'
    + '- P0-2 语义级规则优先（抗格式差异）：ast_pattern{path, pattern} 按 AST 节点类型链匹配（如 "class_declaration > method_declaration"，无视空格/换行/引号差异，适合检查类/方法/接口是否存在）；count_imports{path, module, min} 统计 import/require/from/include 行中模块出现次数（无视引号风格，适合检查依赖是否引入）；normalized_text{path, text} 归一化（去空白）后包含匹配（适合检查声明/配置内容）；仅当语义级规则无法表达时才用 contains_text/contains_regex/count_regex 文本级规则\n'
    + '- 分组：评分标准的每个分项用 group 字段关联；多个客观项可同 group，group 内 max_score 之和必须等于该分项满分\n'
    + '- 分项必须严格来自评分标准，按评分标准自然拆分，不要人为合并或压缩；禁止自创评分标准未提及的检查项（如 README/test/eslint 等）\n'
    + '- 只有无法通过静态文件检查确定分数的项才放入 subjective_items，不要用规则判断主观项\n'
    + '- 分类标注为（主观）的固定分项禁止生成 objective 规则，必须原样放入 subjective_items；分类标注为（确定性）的固定分项必须全部生成可执行客观规则（objective_items）；分类标注为（半确定）的固定分项允许客观规则与主观评分混合\n'
    + '- objective_items 总分 + subjective_items 总分必须恰好等于 max_score\n'
    + '- 只输出 JSON。';
}

/**
 * 构建第 2 轮起「校准修正规则」用户提示词。
 * 分两种情况：规则解析/执行失败（反馈错误信息）与执行成功但未达标（反馈扣分项）。
 * 模型修正规则参数（rule_type/params/max_score），不是重写代码。
 * @param {{result?: object, deductions?: Array, error?: string}} feedback 上一轮反馈
 * @param {string} stdFileTree 标准包文件树文本
 * @param {Array|null} fixedItems 固定分项
 * @param {object|null} prevRules 上一轮有效规则（供模型基于它修正）
 * @returns {string}
 */
function buildCalibrateUserPrompt(feedback, stdFileTree, fixedItems, prevRules) {
  const treeSection = stdFileTree
    ? '\n\n【标准工程包文件树（事实依据：标准包实际存在的文件，请据此修正路径/正则等参数）】\n' + stdFileTree + '\n'
    : '';
  const fixedSection = Array.isArray(fixedItems) && fixedItems.length > 0
    ? '\n\n【固定分项（必须严格逐项覆盖，不得增删改）】\n' + fixedItems.map((it, i) => (i + 1) + '. ' + it.item + automationLabel(it) + '（' + it.maxScore + ' 分）').join('\n') + '\n'
    : '';
  const prevRulesSection = prevRules
    ? '\n\n【上一版规则（请基于它修正 rule_type/params/max_score，不要改写成代码）】\n' + JSON.stringify(prevRules, null, 2) + '\n'
    : '';
  const PATH_RULES = '铁律：params.path/params.dir 必须来自【标准工程包文件树】中真实存在的文件/目录，绝对禁止编造文件路径；'
    + '正则匹配不到时，先依据文件片段调整正则或改用其他检查方式（如 contains_text 关键字），不要重复同一写法。';
  if (feedback && feedback.error) {
    return '以下评分规则在标准工程包上检查失败。请基于上一版规则修正规则参数（rule_type/params/max_score 等），不要改写成代码，也不要新增评分标准未提及的检查项。\n'
      + PATH_RULES + '\n'
      + '【错误】' + String(feedback.error).slice(0, 1200) + '\n'
      + prevRulesSection + fixedSection + treeSection + '\n'
      + '只输出修正后的完整规则 JSON。';
  }
  const failedItems = (feedback && Array.isArray(feedback.deductions) ? feedback.deductions : [])
    .filter((it) => it.score < it.max_score)
    .map((it) => {
      let line = '- ' + it.item + '：应得 ' + it.max_score + ' 分，实得 ' + it.score + ' 分，证据：' + (it.evidence || '');
      if (it.snippet) line += '；文件开头片段：「' + it.snippet + '」';
      return line;
    })
    .join('\n');
  const defectSection = (feedback && Array.isArray(feedback.defectItems) && feedback.defectItems.length > 0)
    ? '\n【标准包缺陷候选（保留项，不要修改或删除）】以下规则引用的文件在标准包中不存在。若评分标准确实要求这些能力，请保留这些规则原样（标准包自身未实现，将交由教师确认处理）；它们不计入校准扣分。\n'
      + feedback.defectItems.map((x, i) => (i + 1) + '. ' + x).join('\n') + '\n'
    : '';
  // 负例验证（Team A）：弱规则（区分度不足）进入修复反馈（Rule Repair）
  const weakRulesSection = (feedback && Array.isArray(feedback.weakRules) && feedback.weakRules.length > 0)
    ? '\n【弱规则（区分度不足）】以下规则在缺陷变体上仍通过，无法区分真实实现与表面实现，请改为更具体的检查（更精确的路径/内容/组合条件），不要删除该评分项：\n'
      + feedback.weakRules.map((w) => '- ' + (w.item || ('规则 ' + w.id)) + '（' + w.id + '）：' + (w.reason || '')).join('\n') + '\n'
    : '';
  return '以下评分规则在标准工程包上检查未得满分（缺陷候选除外）。标准工程包不应被扣分，说明其余规则参数有误（路径/正则/匹配方式/评分比例等）。'
    + '请基于上一版规则修正 rule_type/params/max_score，只针对以下扣分项调整，其他已正确的检查项不要改动，也不要改写成代码。\n'
    + PATH_RULES + '\n'
    + '【扣分项】\n' + (failedItems || '（无扣分项，请检查 max_score 合计）') + defectSection + weakRulesSection
    + prevRulesSection + fixedSection + treeSection + '\n'
    + '输出修正后的完整规则 JSON（规则格式与满分合计保持不变）。';
}

export { GENERATE_SYSTEM, buildCalibrateUserPrompt };
