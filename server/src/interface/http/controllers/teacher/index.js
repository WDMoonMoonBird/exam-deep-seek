/**
 * index.js —— interface/http/controllers/teacher 的汇总出口（由 server/src/controllers/teacherController.js 拆分而来，step 9）。
 * 只做 re-export：不 import、不实现任何逻辑；★ 绝不 re-export infrastructure/ 的任何名字
 * （check-layers 与 cycle-check 对 export…from 双双失明，只有 scripts/gates/bind-check.mjs 能验它）。
 * 层级：interface（落层依据见 docs/split/teacherController-plan.md §2）。
 */

export { switchSchool } from './school.js';
export { getQuestions, getQuestion, getProjectFiles, createQuestion, updateQuestion, deleteQuestion } from './questions.js';
export { getPendingSummary, getAssignments, getAssignment, createAssignment, lockAssignment } from './assignments.js';
export { getAllTeachers } from './teachers.js';
export { getMySchools, getAllClasses, createClass, updateClass, deleteClass, switchClassSchool } from './classes.js';
export { getMyStudents, getMyClasses, updateStudent, deleteStudent, resetStudentPassword, addStudent, batchAddStudents } from './students.js';
