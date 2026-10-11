/**
 * index.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 1-1051）。
 * 逐字搬移：本文件不含函数体，仅承载源文件原有 21 名对外导出面（9 条 re-export）。
 */
export { PROJECT_ROLE, OPEN_PROJECT_ROLE, buildProjectGradePrompt, buildOpenProjectGradePrompt } from '../../../domain/services/deepseek/prompts.js';
export { extractFilesJson } from '../../../domain/services/deepseek/json-extract.js';
export { clearConfigCache, getConfig, getProjectContextMode, getApiKey, getBaseUrl, getModel, getConcurrency } from './config.js';
export { gradeSubmission } from './submission-grading.js';
export { parseExamPaper, parseExamPaperStream } from './exam-parsing.js';
export { generateReferenceAnswer } from './reference-answer.js';
export { gradeProject, gradeSubjectiveItems } from './project-grading.js';
export { selectImportantFiles } from './file-selection.js';
export { normalizeRubricItems, summarizeRubricItems } from './rubric-items.js';
