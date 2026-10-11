/**
 * index.js —— infrastructure/review 的汇总出口（由 server/src/controllers/reviewController.js 拆分而来，step 8）。
 * 只做 re-export：不 import、不实现任何逻辑；★ 绝不 re-export infrastructure/ 的任何名字
 * （check-layers 与 cycle-check 对 export…from 双双失明，只有 scripts/gates/bind-check.mjs 能验它）。
 * 层级：infrastructure（落层依据见 docs/split/reviewController-plan.md §2）。
 */

export { isStudentVisibleToTeacher } from './scope.js';
export { getSubmissionDetail, regradeSubmission, updateScore, reviewSubmission } from './submission.js';
export { getProjectReview, reviewProjectSubmission } from './project.js';
export { getQuestionPromptPreview, getSubmissionPrompt } from './prompts.js';
