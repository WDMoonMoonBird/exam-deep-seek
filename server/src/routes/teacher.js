import { Router } from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import * as teacherHttp from '../interface/http/controllers/teacher/index.js';
import * as teacherIo from '../infrastructure/teacher/index.js';
const teacher = { ...teacherHttp, ...teacherIo };
import * as reviewHttp from '../interface/http/controllers/review/index.js';
import * as reviewIo from '../infrastructure/review/index.js';
const review = { ...reviewHttp, ...reviewIo };
import * as projectReview from '../controllers/projectReviewController.js';
import * as checker from '../controllers/checkerController.js';
import * as team from '../controllers/teamController.js';
import * as assignmentGrading from '../controllers/assignmentGradingController.js';

const router = Router();
router.use(auth, requireRole('teacher'));

// 学校切换
router.put('/switch-school', teacher.switchSchool);
router.get('/my-schools', teacher.getMySchools);

// 班级
router.get('/classes', teacher.getAllClasses);
router.post('/classes', teacher.createClass);
router.put('/classes/:id', teacher.updateClass);
router.delete('/classes/:id', teacher.deleteClass);
router.put('/classes/:id/switch-school', teacher.switchClassSchool);

// 题库
router.get('/questions', teacher.getQuestions);
router.get('/questions/:id/project-files', teacher.getProjectFiles);
router.get('/questions/:id/prompt-preview', review.getQuestionPromptPreview);
router.get('/questions/:id/project-prompt-preview', projectReview.getProjectQuestionPromptPreview);
router.get('/questions/:id/checker', checker.getChecker);
router.post('/questions/:id/checker/generate', checker.generateCheckerHandler);
router.post('/questions/:id/checker/confirm', checker.confirmCheckerHandler);
router.post('/questions/:id/checker/rollback', checker.rollbackCheckerHandler);
router.get('/questions/:id', teacher.getQuestion);
router.post('/questions', teacher.createQuestion);
router.put('/questions/:id', teacher.updateQuestion);
router.delete('/questions/:id', teacher.deleteQuestion);
router.post('/parse-exam', teacher.parseExam);
router.post('/parse-exam-stream', teacher.parseExamStream);
router.post('/generate-reference', teacher.generateReference);
router.post('/upload-material', teacher.uploadMaterial);

// 作业
router.get('/assignments', teacher.getAssignments);
router.get('/assignments/:id', teacher.getAssignment);
router.post('/assignments', teacher.createAssignment);
router.put('/assignments/:id/lock', teacher.lockAssignment);

// 评分审核
// 教师端待审核汇总（侧栏徽标 / KPI）：范围=可见班级（getVisibleClassIds），口径与 review-summary 一致
router.get('/pending-summary', teacher.getPendingSummary);
router.get('/review-summary', review.getReviewSummary);
router.get('/review-class/:classId', review.getReviewByClass);
router.get('/review-questions', review.getReviewQuestions);
router.get('/submissions', review.getSubmissions);
router.get('/submissions/:id', review.getSubmissionDetail);
router.get('/submissions/:id/prompt', review.getSubmissionPrompt);
router.get('/submissions/:id/project/prompt', projectReview.getProjectSubmissionPrompt);
router.put('/submissions/:id/score', review.updateScore);
router.put('/submissions/:id/review', review.reviewSubmission);
// 新实训题流程审核（Submission.type=project）：三栏审核数据
router.get('/project-submission/:id', projectReview.getProjectReview);
router.post('/submissions/:id/regrade', review.regradeSubmission);
router.put('/submissions/publish', review.publishScores);
router.post('/submissions/batch-review', review.batchReview);
router.post('/submissions/batch-publish', review.batchPublish);
router.get('/export-review', review.exportReviewData);
// 实训题（体系C）教师双栏审核
router.get('/submissions/:id/project', review.getProjectReview);
router.put('/submissions/:id/project/review', review.reviewProjectSubmission);
router.post('/submissions/:id/project/regrade', projectReview.regradeProjectSubmission);
router.post('/assignments/:id/grade', assignmentGrading.triggerAssignmentGrading); // W7：作业级批改触发（幂等）
// ★R2-B68（WAVE3）：按班看失分项分布（只读；classId 需命中可见集合，未传则收敛到可见班级并集）
router.get('/assignments/:id/loss-distribution', teacher.getAssignmentLossDistribution);

// 教学团队
router.get('/teams', team.getTeams);
router.get('/teams/:id', team.getTeam);
router.post('/teams', team.createTeam);
router.put('/teams/:id', team.updateTeam);
router.delete('/teams/:id', team.deleteTeam);
router.post('/teams/:id/leave', team.leaveTeam);

// 教师列表
router.get('/teachers', teacher.getAllTeachers);

// 学生管理
router.get('/students', teacher.getMyStudents);
router.post('/students', teacher.addStudent);
router.post('/students/batch', teacher.batchAddStudents);
router.put('/students/:id', teacher.updateStudent);
router.put('/students/:id/reset-password', teacher.resetStudentPassword);
router.delete('/students/:id', teacher.deleteStudent);

export default router;
