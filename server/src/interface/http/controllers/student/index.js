/**
 * student/index.js —— 学生端控制器 barrel（R2-B65）。
 *
 * 对外导出与拆分前的 controllers/studentController.js **完全一致**（routes/student.js 只改 1 行 import 路径）：
 * 10 个 handler 名称、语义与顺序不变。
 */

export { getAssignments, getAssignmentDetail } from './assignments.js';
export { submitAnswer, saveDraft, retryAssignment } from './submission.js';
export { getScores, getProfile } from './scores.js';
export { getProjectQuestion } from './project-question.js';
export { submitProject, submitProjectCore } from './project-submit.js';
