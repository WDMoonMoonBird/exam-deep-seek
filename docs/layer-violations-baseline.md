# 分层依赖违规基线（P0 快照）

> 生成时间：2026-08-16T09:30:50.718Z　扫描文件数：34　违规总数：0
> 目标：随 P1–P8 逐步清零。每阶段结束后重跑 `node server/scripts/check-layers.mjs` 对比。

## 按规则统计

| 规则 | 数量 | 含义 |
|---|---|---|

## 明细


## 未分层文件（待迁移清单）

> 以下文件位于 server/src 根目录，尚未归入四层；迁移到层目录后即受规则约束，本清单随迁移逐步清零。

- `app.js`
- `constants.js`
- `controllers/adminController.js`
- `controllers/authController.js`
- `controllers/projectController.js`
- `controllers/projectReviewController.js`
- `controllers/projectSubmissionController.js`
- `controllers/reviewController.js`
- `controllers/studentController.js`
- `controllers/teacherController.js`
- `controllers/teamController.js`
- `middleware/auth.js`
- `middleware/projectAssetGuard.js`
- `middleware/role.js`
- `routes/admin.js`
- `routes/auth.js`
- `routes/projects.js`
- `routes/student.js`
- `routes/teacher.js`
- `services/deepseek.js`
- `services/gradingWorker.js`
- `services/projectGrader.js`
- `services/projectGrading.js`
- `socket.js`
- `utils/fileTree.js`
- `utils/logger.js`
- `utils/prisma.js`
- `utils/projectArchive.js`
- `utils/projectFiles.js`
- `utils/projectPaths.js`
- `utils/projectView.js`
- `utils/scoring.js`
- `utils/uploadFilter.js`
- `worker.js`
