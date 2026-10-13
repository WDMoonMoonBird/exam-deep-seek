/**
 * projectReviewPure.js —— 由 client/src/views/teacher/ProjectReviewNew.vue 拆分而来（R2-B64 / t4）
 * 纯函数与常量：无 Vue 依赖、无 I/O。函数体逐字搬移；唯一改动是把原来直接读 computed .value 的地方
 * 改为显式入参（status / student），等价于拆分前的求值结果。
 */

/** 源 :293-294 —— a-tag 配色 → StatusTag tone（与 statusColor 一一对应，状态判断未改） */
export const STATUS_TONE = { blue: 'brand', green: 'success', orange: 'warning', red: 'danger', default: 'neutral' };

/** 源 :347-354 —— statusColor（判定分支逐字未改；入参 = 拆分前的 submission.value.status） */
export function statusColorOf(status) {
  const s = status;
  if (s === 'published') return 'green';
  if (s === 'reviewed') return 'blue';
  if (s === 'ai_graded') return 'green';
  if (s === 'submitted') return 'orange';
  return 'default';
}

/** 源 :355-358 —— statusText（入参 = 拆分前的 status computed，即 submission.value.status || ''） */
export function statusTextOf(status) {
  const s = status;
  return { submitted: '待评分', ai_graded: 'AI 已评分', reviewed: '已审核', published: '已发布' }[s] || s || '未知';
}

/** 源 :359-363 —— displayNo（学号去 @ 后缀；入参 = 拆分前的 student.value） */
export function displayNoOf(student) {
  const no = student?.username || '';
  const at = no.lastIndexOf('@');
  return at > 0 ? no.substring(0, at) : no;
}

/** 源 :444-451 —— 收集全部目录节点 path，用于「全展开」（切源后仍生效） */
export function collectDirKeys(nodes, acc = []) {
  for (const n of nodes || []) {
    if (n.type === 'directory') acc.push(n.path);
    if (n.children?.length) collectDirKeys(n.children, acc);
  }
  return acc;
}

/** 源 :481-490 —— 首个文件节点（第一眼看到学生答案：自动打开第一个文件） */
export function findFirstFile(nodes) {
  for (const n of nodes || []) {
    if (n.type === 'file') return n;
    if (n.children?.length) {
      const f = findFirstFile(n.children);
      if (f) return f;
    }
  }
  return null;
}
