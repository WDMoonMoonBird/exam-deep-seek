/**
 * executor.js —— 由 server/src/services/ruleExecutor.js 拆分而来（step 1，源行 778-1010）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { extractFacts } from '../../services/factExtractor.js';
import { resolveProjectRoot } from '../../services/factExtractors/common.js';
import logger from '../../utils/logger.js';
import { buildGroupSummary, clampScore, errorSummary, execFact } from '../../domain/services/rule/evaluators.js';
import { validateRules } from '../../domain/services/rule/validate.js';
import { execAstPattern, execSyntaxCheck } from './syntax.js';
import { execContainsRegex, execContainsText, execCountImports, execCountRegex, execDirContainsFile, execFileCountInDir, execFileExists, execNormalizedText } from './executors.js';

/**
 * 按 rule_type 分派到对应执行器。
 * @param {object} item - 规则项（已通过校验）
 * @param {string} projectRoot - 工程根
 * @param {object} [facts] - fact 规则用的工程事实（由 runRules 提前提取并缓存于本次调用）
 * @returns {{score: number, evidence: string}}
 */
function executeItem(item, projectRoot, facts) {
  const params = item.params || {};
  switch (item.rule_type) {
    case 'file_exists':
      return execFileExists(item, params, projectRoot);
    case 'dir_contains_file':
      return execDirContainsFile(item, params, projectRoot);
    case 'contains_text':
      return execContainsText(item, params, projectRoot);
    case 'count_regex':
      return execCountRegex(item, params, projectRoot);
    case 'contains_regex':
      return execContainsRegex(item, params, projectRoot);
    case 'file_count_in_dir':
      return execFileCountInDir(item, params, projectRoot);
    case 'syntax_check':
      return execSyntaxCheck(item, params, projectRoot);
    case 'fact':
      return execFact(item, params, facts);
    case 'ast_pattern':
      return execAstPattern(item, params, projectRoot);
    case 'count_imports':
      return execCountImports(item, params, projectRoot);
    case 'normalized_text':
      return execNormalizedText(item, params, projectRoot);
    default:
      // 已通过 validateRules，理论不可达；防御性兜底
      return { score: 0, evidence: '不支持的规则类型：' + String(item.rule_type) };
  }
}

/**
 * 执行评分（核心）：先 validateRules（不通过抛错拒绝执行），再解析工程根，
 * 逐项执行 objective_items，返回客观分合计 + 明细 + 主观项 + 分组汇总。
 *
 * 强制约束：
 *   - 每项 score = max(0, min(max_score, 计算得分))，永不超上限；
 *   - totalScore = 客观项得分之和（不超客观项总分；不包含 subjective）；
 *   - 含 fact 规则时，每次 runRules 只执行一次 extractFacts，结果缓存于本次调用
 *     （多条 fact 规则共享同一份事实）；提取失败 → 该项 0 分 + 证据，绝不抛错。
 *
 * @param {object} rules - 评分规则 JSON（须通过 validateRules）
 * @param {string} rootDir - 解压根目录
 * @returns {
 *   totalScore: number,
 *   items: Array<{id: string, group?: string, item: string, max_score: number, score: number, pass: boolean, evidence: string}>,
 *   subjective: Array<{id: string, item: string, max_score: number}>,
 *   groupSummary: Array<{group: string, score: number, maxScore: number}>,
 * }}
 * @throws {Error} 规则校验不通过时抛错（拒绝执行）
 */
export function runRules(rules, rootDir) {
  const v = validateRules(rules);
  if (!v.ok) {
    logger.error({ error: v.error }, '评分规则校验失败，拒绝执行');
    throw new Error('规则校验失败：' + v.error);
  }

  const projectRoot = resolveProjectRoot(rootDir);
  const items = [];
  let totalScore = 0;
  let facts;          // undefined = 尚未提取；null = 提取失败
  let factError = null;

  for (const item of rules.objective_items) {
    let r;
    if (item.rule_type === 'fact') {
      // 每次 runRules 只提取一次事实，缓存于本次调用（多条 fact 规则共享）
      if (facts === undefined) {
        try {
          facts = extractFacts(projectRoot);
        } catch (err) {
          facts = null;
          factError = errorSummary(err);
        }
      }
      r = facts === null
        ? { score: 0, evidence: '事实提取失败：' + (factError || '未知错误') }
        : executeItem(item, projectRoot, facts);
    } else {
      r = executeItem(item, projectRoot);
    }
    const score = clampScore(r.score, item.max_score);
    totalScore += score;
    items.push({
      id: item.id,
      group: item.group,
      item: item.item,
      max_score: item.max_score,
      score,
      pass: score === item.max_score,
      evidence: r.evidence,
    });
  }

  // 客观分合计不超客观项总分（每项已钳制，这里再兜底一次）
  const objectiveMax = rules.objective_items.reduce((s, i) => s + i.max_score, 0);
  totalScore = Math.min(totalScore, objectiveMax);

  const subjective = rules.subjective_items.map((s) => ({
    id: s.id,
    item: s.item,
    max_score: s.max_score,
  }));

  return {
    totalScore,
    items,
    subjective,
    groupSummary: buildGroupSummary(items),
  };
}
