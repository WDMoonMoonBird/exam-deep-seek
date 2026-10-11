/**
 * index.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 1-29）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

/**
 * ruleExecutor.js —— 确定性评分规则执行器（规则驱动评分的执行端）。
 *
 * 实训题评分规则化方案：AI 只生成 JSON 评分规则（把教师评分标准翻译成可检查参数），
 * 计分由本执行器确定性完成 —— 同样的规则 + 同样的工程 → 永远得到同样的分数，
 * 杜绝 LLM 评分的随机性。规则先在标准工程包上校准通过（应得满分）再用于批量批改。
 *
 * 铁律：
 *   - 纯执行器：仅依赖 node:fs / node:path，外加 tree-sitter（语法检查）与 factExtractor（事实提取），零其他依赖；
 *   - 得分一律钳制：score = max(0, min(max_score, 计算得分))，永不超上限；
 *   - 路径统一解析到工程根之下（resolveProjectRoot 的结果），防穿越：path.resolve 后
 *     必须位于工程根内，否则该项 0 分；
 *   - 文件读取失败（不存在/权限）→ 该项 0 分 + 证据，绝不抛错影响整批评分。
 */

import { resolveProjectRoot } from '../../services/factExtractors/common.js';

export { RULE_TYPES, FACT_OPS } from '../../domain/services/rule/constants.js';
export { globToRegExp } from '../../domain/services/rule/evaluators.js';
export { validateRules } from '../../domain/services/rule/validate.js';
export { extOf, collectFiles, resolveWithinRoot, readFileUtf8 } from './file-access.js';
export { runRules } from './executor.js';

// F-1 循环依赖拆解（round 2）：resolveProjectRoot 的实现已下沉到 factExtractors/common.js，
// 此处再导出以保持既有对外导出面逐字不变（checkerService.js / ruleMutator.js 从此处 import）。
export { resolveProjectRoot };
