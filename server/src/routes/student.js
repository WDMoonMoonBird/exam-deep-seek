import { Router } from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import * as student from '../interface/http/controllers/student/index.js';
import { createRateLimitMiddleware } from '../infrastructure/rate-limit/rate-limit-middleware.js';   // ★P2-RATE-b

const router = Router();
router.use(auth, requireRole('student'));

// ★P2-RATE-b（R3-RATE 残余 / A batch2 复核）：学生提交限流**移到鉴权之后**——
//   键 = user:<id>（同 NAT/机房多学生同时交卷不再互相误伤）；阈值 10 次/分钟/人。
const submitProjectRateLimit = createRateLimitMiddleware({ max: 10, windowMs: 60000, message: '提交过于频繁，请稍后再试' });

// 作业
router.get('/assignments', student.getAssignments);

// 实训题（必须挂在 Assignment 下：submissions 唯一键含 assignmentId，
// 否则提交无法落库。路由段数与 /assignments/:id 不同，不存在匹配歧义）
router.get('/assignments/:assignmentId/project/:questionId', student.getProjectQuestion);
router.post('/assignments/:assignmentId/project/:questionId/submit', submitProjectRateLimit, student.submitProject);

router.get('/assignments/:id', student.getAssignmentDetail);
router.post('/assignments/:id/submit', student.submitAnswer);
router.put('/assignments/:id/draft', student.saveDraft);
router.post('/assignments/:id/retry', student.retryAssignment);

// 成绩
router.get('/scores', student.getScores);

// 个人信息
router.get('/profile', student.getProfile);

export default router;
