import { Router } from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import * as student from '../controllers/studentController.js';

const router = Router();
router.use(auth, requireRole('student'));

// 作业
router.get('/assignments', student.getAssignments);

// 实训题（必须挂在 Assignment 下：submissions 唯一键含 assignmentId，
// 否则提交无法落库。路由段数与 /assignments/:id 不同，不存在匹配歧义）
router.get('/assignments/:assignmentId/project/:questionId', student.getProjectQuestion);
router.post('/assignments/:assignmentId/project/:questionId/submit', student.submitProject);

router.get('/assignments/:id', student.getAssignmentDetail);
router.post('/assignments/:id/submit', student.submitAnswer);
router.put('/assignments/:id/draft', student.saveDraft);
router.post('/assignments/:id/retry', student.retryAssignment);

// 成绩
router.get('/scores', student.getScores);

// 个人信息
router.get('/profile', student.getProfile);

export default router;
