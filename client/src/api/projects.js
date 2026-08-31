import request from './request.js';

/**
 * 实训任务 API 封装
 * 所有请求基于 /api/teacher/projects
 */

/** 获取任务列表 */
export function getProjects(params = {}) {
  return request.get('/teacher/projects', { params });
}

/** 创建任务 */
export function createProject(data) {
  return request.post('/teacher/projects', data);
}

/** 获取任务详情 */
export function getProject(id) {
  return request.get(`/teacher/projects/${id}`);
}

/** 更新任务 */
export function updateProject(id, data) {
  return request.put(`/teacher/projects/${id}`, data);
}

/** 删除任务（软删除） */
export function deleteProject(id) {
  return request.delete(`/teacher/projects/${id}`);
}

/** 上传标准工程包 */
export function uploadPackage(formData) {
  return request.post('/teacher/projects/upload-package', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/** 获取提交列表 */
export function getSubmissions(projectId, params = {}) {
  return request.get(`/teacher/projects/${projectId}/submissions`, { params });
}

/** 获取提交详情 */
export function getSubmissionDetail(projectId, submissionId) {
  return request.get(`/teacher/projects/${projectId}/submissions/${submissionId}`);
}

/** 获取文件内容 */
export function getFileContent(projectId, submissionId, filePath) {
  return request.get(`/teacher/projects/${projectId}/submissions/${submissionId}/file`, {
    params: { path: filePath },
  });
}

/** 保存教师评分 */
export function saveReview(projectId, submissionId, data) {
  return request.put(`/teacher/projects/${projectId}/submissions/${submissionId}/review`, data);
}

/** 手动重新评分 */
export function regrade(projectId, submissionId) {
  return request.post(`/teacher/projects/${projectId}/submissions/${submissionId}/regrade`);
}

// ===================== 新实训题流程（Submission.type=project）审核 =====================

/** 获取新流程实训题提交的三栏审核数据（标准包 + 学生版本 + AI 结构化评语） */
export function getProjectReview(submissionId) {
  return request.get(`/teacher/project-submission/${submissionId}`);
}

/** 保存/发布审核结果（专用 project 审核接口，teacherFeedback 由教师手动填写，R3 不泄漏 AI 评语） */
export function saveProjectReview(submissionId, data) {
  return request.put(`/teacher/submissions/${submissionId}/project/review`, data);
}

/** 教师一键重评实训题（评分异常后重试） */
export function regradeProjectSubmission(submissionId) {
  return request.post(`/teacher/submissions/${submissionId}/project/regrade`);
}
