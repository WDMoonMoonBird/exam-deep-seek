import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
// server/src/utils/projectPaths.js -> server/
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const UPLOADS_ROOT = path.join(ROOT, 'uploads');
const STANDARDS_ROOT = path.join(UPLOADS_ROOT, 'project-questions');
const SUBMISSIONS_ROOT = path.join(UPLOADS_ROOT, 'project-submissions');
const PROJECTS_ROOT = path.join(UPLOADS_ROOT, 'projects');

/**
 * 入参白名单：题目/学生/版本等 ID 只允许基础字符，
 * 在路径拼接最外层截断非法输入，配合 assertInside 形成纵深防御。
 */
function safeSegment(seg) {
  if (typeof seg !== 'string' || seg.length === 0 || !/^[A-Za-z0-9_-]+$/.test(seg)) {
    throw new Error('Invalid path segment: ' + String(seg));
  }
  return seg;
}

/**
 * 解析并确保最终路径严格位于 base 内，否则抛错（防路径穿越）。
 */
function assertInside(base, ...segments) {
  const joined = path.resolve(base, ...segments);
  if (joined !== base && !joined.startsWith(base + path.sep)) {
    throw new Error('Path traversal denied');
  }
  return joined;
}

/** 标准工程包目录（教师上传，绝不可对学生暴露）：uploads/project-questions/{questionId}/standard */
export function standardDir(questionId) {
  return assertInside(STANDARDS_ROOT, safeSegment(String(questionId)), 'standard');
}

/**
 * 是否已上传非空标准工程包（Q9 布置作业软警告 / 提示词预览 / AI 实评共用的唯一判据）。
 *
 * 判据与 services/projectGrading.js 一致：
 *   1) attachmentUrl 非空 → 视为有标准包（教师建题时上传过）；
 *   2) 兼容历史数据：attachmentUrl 为空但标准包目录仍有文件 → 同样视为有标准包，
 *      避免把老数据误判成开放性题目。
 * 两者皆无才是开放性题目（open）。
 *
 * @param {number|string} questionId 题目 ID
 * @param {string|null|undefined} attachmentUrl 题目记录上的标准包相对路径
 * @returns {boolean}
 */
export function hasStandardPackage(questionId, attachmentUrl) {
  if (attachmentUrl) return true;
  try {
    const dir = standardDir(questionId);
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** 学生提交版本目录：project-submissions/{questionId}/{studentId}/{version} */
export function submissionDir(questionId, studentId, version) {
  return assertInside(
    SUBMISSIONS_ROOT,
    safeSegment(String(questionId)),
    safeSegment(String(studentId)),
    safeSegment(String(version)),
  );
}

/** 体系 B 项目工作区目录（冻结，静态访问已被 guard 封禁） */
export function projectDir(projectId) {
  return assertInside(PROJECTS_ROOT, safeSegment(String(projectId)));
}

export {
  ROOT,
  UPLOADS_ROOT,
  STANDARDS_ROOT,
  SUBMISSIONS_ROOT,
  PROJECTS_ROOT,
  assertInside,
  safeSegment,
};
