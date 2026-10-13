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

/**
 * R3-D1（t4 / US-A1 AC2）：最终分取值 —— 支持「只改评语不改分」。
 * 输入为空（教师清空）⇒ 回落该提交**已保存**的最终分（分值不变）；都没有 ⇒ null（首次给分必须填）。
 * @returns {{score: number|null, source: 'input'|'saved'|'missing'}}
 */
export function resolveScoreToSave({ input, saved } = {}) {
  const hasInput = input !== null && input !== undefined && input !== '';
  if (hasInput) return { score: Number(input), source: 'input' };
  const hasSaved = saved !== null && saved !== undefined && saved !== '';
  if (hasSaved) return { score: Number(saved), source: 'saved' };
  return { score: null, source: 'missing' };
}

/**
 * R3-D1（t4 / G2）：分值合法性前端拦截 —— 返回可读文案（null = 合法）。
 * 口径：有限数字 + 整数（submissions.final_score 为整型）+ 0 ≤ 分 ≤ 满分。
 */
export function scoreIssue({ score, maxScore } = {}) {
  if (score === null || score === undefined || score === '') return '请填写最终分数';
  const n = Number(score);
  if (!Number.isFinite(n)) return '最终分数需为数字';
  if (!Number.isInteger(n)) return '最终分数需为整数';
  if (n < 0) return '最终分数不能小于 0';
  if (maxScore != null && n > maxScore) return `最终分数不能超过满分 ${maxScore}`;
  return null;
}

/**
 * R3-D1（t4 / US-B4 AC4）：口径=取最高时，若历次最高分高于最近一次 AI 分，
 * 则「计入分」与下方 AI 明细**不同源** ⇒ 返回提示（避免分数 85 但明细来自 78 那次）。
 */
export function bestScoreNotice({ aiScore, bestScore } = {}) {
  const latest = aiScore ?? null;
  const best = bestScore ?? null;
  if (best == null || latest == null || best <= latest) return null;
  return {
    best,
    latest,
    text: `计入分 ${best} 分（历次最高）；下方 AI 明细来自最近一次评分（${latest} 分）—— 两者不一致时以计入分为准`,
  };
}

/** R3-D1（t4）：多次提交且尚未定案 ⇒ 「有新提交，建议复核」（US-B4 冲突 3 的审核页提示） */
export function newSubmissionNotice({ attemptCount, status } = {}) {
  const n = Number(attemptCount) || 0;
  if (n < 2) return null;
  if (status === 'reviewed' || status === 'published') return null;
  return `该生已提交 ${n} 次，最近一次尚未定案：有新提交，建议复核后再给分`;
}

/** R3-D1（t4 / G4）：教师区提示 —— 已发布不再锁死，改为明示「立即生效」 */
export function reviewHintOf(status) {
  if (status === 'published') return '已发布：改分/评语保存后学生端立即生效';
  if (status === 'reviewed') return '已审核，可修改后再次保存（学生端立即生效）';
  return '审核通过后学生即可看到分数与评语';
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
