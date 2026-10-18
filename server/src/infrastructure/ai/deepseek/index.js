/**
 * index.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 1-1051）。
 * 逐字搬移：本文件不含函数体，仅承载源文件原有 21 名对外导出面（9 条 re-export）。
 */
// ★R3-LLM-FIX：domain builder 需要 CSPRNG nonce（domain 禁 node:crypto）⇒ 对外导出面在此包一层自动注入，
//   保证 projectReviewController（预览/实评同源）等所有消费者拿到的都是随机围栏 prompt。
import { createFenceNonce } from '../prompt-injection-guard.js';
import {
  PROJECT_ROLE as domainProjectRole,
  OPEN_PROJECT_ROLE as domainOpenProjectRole,
  buildProjectGradePrompt as domainBuildProjectGradePrompt,
  buildOpenProjectGradePrompt as domainBuildOpenProjectGradePrompt,
} from '../../../domain/services/deepseek/prompts.js';
export const PROJECT_ROLE = domainProjectRole;
export const OPEN_PROJECT_ROLE = domainOpenProjectRole;
export function buildProjectGradePrompt(params) {
  return domainBuildProjectGradePrompt(params, createFenceNonce());
}
export function buildOpenProjectGradePrompt(params) {
  return domainBuildOpenProjectGradePrompt(params, createFenceNonce());
}
export { extractFilesJson } from '../../../domain/services/deepseek/json-extract.js';
export { clearConfigCache, getConfig, getProjectContextMode, getApiKey, getBaseUrl, getModel, getConcurrency } from './config.js';
export { gradeSubmission } from './submission-grading.js';
export { parseExamPaper, parseExamPaperStream } from './exam-parsing.js';
export { generateReferenceAnswer } from './reference-answer.js';
export { gradeProject, gradeSubjectiveItems } from './project-grading.js';
export { selectImportantFiles } from './file-selection.js';
export { normalizeRubricItems, summarizeRubricItems } from './rubric-items.js';
