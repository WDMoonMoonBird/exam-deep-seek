import { Router } from 'express';
import * as projectCtrl from '../controllers/projectController.js';
import * as subCtrl from '../controllers/projectSubmissionController.js';

const router = Router();

// ==================== 实训任务 CRUD ====================

// 上传标准工程包（独立于任务，先于 /:id 路由）
router.post('/upload-package', projectCtrl.uploadPackage);

// 任务列表
router.get('/', projectCtrl.listProjects);

// 创建任务
router.post('/', projectCtrl.createProject);

// 任务详情
router.get('/:id', projectCtrl.getProject);

// 更新任务
router.put('/:id', projectCtrl.updateProject);

// 删除任务（软删除）
router.delete('/:id', projectCtrl.deleteProject);

// ==================== 提交与评分 ====================

// 提交列表
router.get('/:id/submissions', subCtrl.listSubmissions);

// 提交详情
router.get('/:id/submissions/:submissionId', subCtrl.getSubmissionDetail);

// 获取文件内容
router.get('/:id/submissions/:submissionId/file', subCtrl.getFileContent);

// 保存评分
router.put('/:id/submissions/:submissionId/review', subCtrl.reviewSubmission);

// 重新评分
router.post('/:id/submissions/:submissionId/regrade', subCtrl.regradeSubmission);

export default router;
