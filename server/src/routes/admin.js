import { Router } from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import * as admin from '../controllers/adminController.js';
// ★R2-B24b（t93 裁定）：管理员「批改记录」只读子路由（列表/详情/日志下载；挂在本文件既有鉴权链之下）
import adminGradingRunsRoutes from '../interface/http/routes/admin.js';
// ★R3-D5（G5 / US-A3 AC2）：管理员侧实训题重评/改分（任意班级；复用 infrastructure/review 的 ops）
//   注：handler 落 infrastructure —— interface 层不得 import infrastructure（check-layers）；本文件按既有约定做组装
import * as adminReviewIo from '../infrastructure/review/index.js';

const router = Router();
router.use(auth, requireRole('super_admin'));

// ★R2-B24b（t93 裁定）：先挂子路由（继承上面 router.use(auth, requireRole('super_admin')) 的鉴权）
router.use('/grading-runs', adminGradingRunsRoutes);

// 实训题重评 / 改分（super_admin；契约与教师端同形，见 infrastructure/review/admin-project-review.js）
// ★R3-D5：管理员不按「教师可见班级」收窄，可操作任意班级的实训提交
router.post('/submissions/:id/project/regrade', adminReviewIo.adminRegradeProjectSubmission);
router.put('/submissions/:id/project/review', adminReviewIo.adminReviewProjectSubmission);

router.get('/schools', admin.getSchools);

// 班级
router.get('/classes', admin.getClasses);
router.post('/classes', admin.createClass);
router.put('/classes/:id', admin.updateClass);
router.delete('/classes/:id', admin.deleteClass);

// 教师
router.get('/teachers', admin.getTeachers);
router.post('/teachers', admin.createTeacher);
router.put('/teachers/:id', admin.updateTeacher);
router.put('/teachers/:id/reset-password', admin.resetTeacherPassword);
router.delete('/teachers/:id', admin.deleteTeacher);

// 学生
router.get('/students', admin.getStudents);
router.post('/students', admin.createStudent);

// 服务器监控
router.get('/monitor', admin.getMonitor);

// AI 配置
router.get('/settings', admin.getSettings);
router.put('/settings', admin.updateSettings);
router.post('/settings/test-connection', admin.testConnection);

export default router;
