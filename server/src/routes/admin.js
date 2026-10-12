import { Router } from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import * as admin from '../controllers/adminController.js';
// ★R2-B24b（t93 裁定）：管理员「批改记录」只读子路由（列表/详情/日志下载；挂在本文件既有鉴权链之下）
import adminGradingRunsRoutes from '../interface/http/routes/admin.js';

const router = Router();
router.use(auth, requireRole('super_admin'));

// 学校（只读，数据来自教育部）
// ★R2-B24b（t93 裁定）：先挂子路由（继承上面 router.use(auth, requireRole('super_admin')) 的鉴权）
router.use('/grading-runs', adminGradingRunsRoutes);

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
