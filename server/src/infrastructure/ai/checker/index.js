/**
 * index.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 1-23（文件头 JSDoc））。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 本文件仅承载对外导出面（10 个名字，逐字不变），不含任何实现；文件头 JSDoc 逐字保留作溯源注释。
 */

/**
 * checkerService.js — AI 生成 JSON 评分规则 + 自举校准服务（规则驱动）
 *
 * 实训题评分方案（2026-08-17 规则驱动版）：教师评分标准 → AI 生成 JSON 评分规则
 * （确定性检查学生工程，rule_type 白名单）→ 在标准工程包上运行校准（标准包应得满分，
 * 扣分则反馈证据让 AI 修正规则参数，循环 ≤3 轮）→ 就绪后评分链路用 ruleExecutor
 * 计算硬性分项，主观分项留给 LLM。
 *
 * 2026-08-18 重构（方案 docs/plan/2026-08-18-refactor-plan.md §4.1/§4.2/§4.3）：
 * - 标准包角色降级：校准终止改为「置信度阈值（默认 ≥90）→ review」，不再要求满分；
 * - 新增 review 状态（校准达标待教师确认）与体检报告（失分项：转主观/豁免/接受失分）；
 * - 规则版本化（checkerMeta.versions 全文快照，支持回滚；阶段 1 迁移 RuleVersion 表）；
 * - 输入快照 inputsSnapshot（评分标准/满分/描述/标准包指纹），保存守卫判断脚本是否过期；
 * - 题目描述参与第 1 轮生成提示词。
 *
 * 规则格式（生成目标，也是 questions.checkerScript 字段的存储内容，字段名不变前端兼容）：
 *   {
 *     "max_score": 100,
 *     "objective_items": [{ "id": "a1", "group": "...", "item": "...", "rule_type": "...", "params": {...}, "max_score": 2 }],
 *     "subjective_items": [{ "id": "s1", "item": "...", "max_score": 10 }]
 *   }
 * 执行与校验委托给 ruleExecutor.js（validateRules / runRules）。
 */

export { parseCheckerResult, parseCheckerRules, findMisplacedSubjective } from '../../../domain/services/checker/parsers.js';
export { attachNegativeFeedback } from '../../../domain/services/checker/meta.js';
export { runCheckerScript } from './legacy-script.js';
export { buildGenerateUserPrompt } from './prompts.js';
export { getCheckerState } from './state.js';
export { generateChecker } from './generator.js';
export { confirmChecker, rollbackChecker } from './review.js';
