import { Router } from 'express';
import auth from '../middleware/auth.js';
import requireRole from '../middleware/role.js';
import * as admin from '../controllers/adminController.js';

const router = Router();
router.use(auth, requireRole('super_admin'));

// 学校（只读，数据来自教育部）
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

// 学生
router.get('/students', admin.getStudents);
router.post('/students', admin.createStudent);

// 服务器监控
router.get('/monitor', admin.getMonitor);

export default router;
