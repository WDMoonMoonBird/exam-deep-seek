/**
 * autoBuild.js —— 自动造尺作业的共享常量（截止触发 / 会话归属）。
 *
 * 约定：自动评分 job 在拿到真实 checker 之前，用哨兵 checker_id 占住「每作业一个活动 job」的坑；
 *   worker 看到哨兵后走 build 流程（必要时为本次作业造尺），造完再把 job.checker_id 对齐到真实尺子。
 * 这样既不新增表/迁移，也不影响既有「活动键每 (assignment, checker) 至多一行」的语义。
 */
export const AUTO_BUILD_CHECKER = '__AUTO_BUILD__';

export function isAutoBuildChecker(value) {
  return String(value || '') === AUTO_BUILD_CHECKER;
}

/** 供日志/审计使用的会话作用域（该作业属于哪个教师、哪些班级） */
export function formatSessionScope({ assignmentId, teacherId, classIds, title } = {}) {
  const classes = Array.isArray(classIds) && classIds.length ? classIds.join(',') : '(none)';
  return 'SESSION_SCOPE assignment=' + assignmentId + ' teacher=' + (teacherId ?? '(unknown)')
    + ' classes=' + classes + (title ? ' title=' + JSON.stringify(String(title).slice(0, 80)) : '');
}
