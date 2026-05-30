import { Router } from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import * as teacher from '../controllers/teacherController.js';
import * as review from '../controllers/reviewController.js';
import * as team from '../controllers/teamController.js';

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

// 题库
router.get('/questions', teacher.getQuestions);
router.get('/questions/:id', teacher.getQuestion);
router.post('/questions', teacher.createQuestion);
router.put('/questions/:id', teacher.updateQuestion);
router.delete('/questions/:id', teacher.deleteQuestion);
router.post('/upload-material', teacher.uploadMaterial);

// 作业
router.get('/assignments', teacher.getAssignments);
router.get('/assignments/:id', teacher.getAssignment);
router.post('/assignments', teacher.createAssignment);

// 评分审核
router.get('/review-summary', review.getReviewSummary);
router.get('/review-class/:classId', review.getReviewByClass);
router.get('/review-questions', review.getReviewQuestions);
router.get('/submissions', review.getSubmissions);
router.get('/submissions/:id', review.getSubmissionDetail);
router.put('/submissions/:id/score', review.updateScore);
router.put('/submissions/:id/review', review.reviewSubmission);
router.post('/submissions/:id/regrade', review.regradeSubmission);
router.put('/submissions/publish', review.publishScores);
router.post('/submissions/batch-review', review.batchReview);
router.post('/submissions/batch-publish', review.batchPublish);
router.get('/export-review', review.exportReviewData);

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
router.delete('/students/:id', teacher.deleteStudent);

export default router;
