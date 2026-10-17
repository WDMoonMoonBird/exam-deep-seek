/**
 * studentPure.js —— 学生端 v1 页面公用的纯函数（无 Vue 依赖、无 I/O）
 *
 * 依据：
 *   docs/mobile-app/10-v1-implementation-contract.md（§6 API 白名单 / §7 v1 数据规则）
 *   docs/mobile-app/09-v1-scope-and-deferred-backlog.md（v1 降级：不显示排名/均分/等级/构成）
 *   docs/mobile-app/05-page-specs.md §3.2（学生 11 屏逐屏规范）
 *
 * 只做「由现有接口字段推导显示状态」的纯逻辑，不发请求、不伪造数据：
 *   - 作业状态由 submissions（逐小题提交行）与 startTime/endTime 推导（与桌面 views/student/Assignments.vue 同口径）；
 *   - 作答单位 = 小题（subQuestion）；客观题答案字符串沿用桌面 <=> 后端的 JSON 数组格式；
 *   - 编程题/实训题在 v1 手机端只读 + 复制链接（无编辑器、无免登录接力）。
 */

/* ------------------------------------------------------------------ 基础 */

/** SDK/拦截器响应体 -> 业务 data（request.js resolve 的是 { code, message, data }） */
export function payload(res) {
  if (res && typeof res === 'object' && !Array.isArray(res) && Object.prototype.hasOwnProperty.call(res, 'data')) {
    return res.data;
  }
  return res;
}

/** 失败 -> 面向用户文案（request.js 已把 ApiError.message 归一为友好文案） */
export function errorText(err) {
  const text = err && typeof err.message === 'string' ? err.message.trim() : '';
  return text || '加载失败，请稍后重试';
}

export function pad2(n) {
  const v = Number(n) || 0;
  return (v < 10 ? '0' : '') + v;
}

/** 剩余毫秒 -> 倒计时短文案：42:18 / 1:05:22（作答页顶部用） */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return hours + ':' + pad2(minutes) + ':' + pad2(seconds);
  return pad2(minutes) + ':' + pad2(seconds);
}

/** 剩余毫秒 -> 中文短文案：7 小时 27 分 / 9 分钟 / 已截止 */
export function formatRemaining(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (total <= 0) return '已截止';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return hours > 0 ? days + ' 天 ' + hours + ' 小时' : days + ' 天';
  if (hours > 0) return minutes > 0 ? hours + ' 小时 ' + minutes + ' 分' : hours + ' 小时';
  if (minutes > 0) return minutes + ' 分钟';
  return '不足 1 分钟';
}

/** 截止时间语义（可注入 now，便于列表随定时器刷新；tone: normal | soon | urgent | danger） */
export function deadlineInfoAt(endTime, nowTs) {
  if (!endTime) return { text: '', tone: 'normal' };
  const target = new Date(endTime).getTime();
  if (!Number.isFinite(target)) return { text: '', tone: 'normal' };
  const now = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const diff = target - now;
  if (diff <= 0) return { text: '已截止', tone: 'danger' };
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return { text: '剩 ' + Math.max(1, Math.floor(diff / 60000)) + ' 分钟', tone: 'urgent' };
  if (hours < 6) return { text: '剩 ' + hours + ' 小时', tone: 'urgent' };
  if (hours < 24) return { text: '剩 ' + hours + ' 小时', tone: 'soon' };
  const days = Math.floor(hours / 24);
  if (days <= 7) return { text: '剩 ' + days + ' 天', tone: 'normal' };
  return { text: formatDateAt(endTime), tone: 'normal' };
}

/** 截止时刻的人话：今天 23:59 截止 / 明天 09:00 截止 / 10 月 20 日 09:00 截止 */
export function deadlineLabel(endTime, nowTs) {
  if (!endTime) return '';
  const target = new Date(endTime);
  if (Number.isNaN(target.getTime())) return '';
  const now = new Date(Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now());
  const hhmm = pad2(target.getHours()) + ':' + pad2(target.getMinutes());
  const sameDay = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
  if (sameDay) return '今天 ' + hhmm + ' 截止';
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (target.getFullYear() === tomorrow.getFullYear()
    && target.getMonth() === tomorrow.getMonth()
    && target.getDate() === tomorrow.getDate()) {
    return '明天 ' + hhmm + ' 截止';
  }
  return (target.getMonth() + 1) + ' 月 ' + target.getDate() + ' 日 ' + hhmm + ' 截止';
}

/** YYYY-MM-DD（时间无效时返回空串） */
export function formatDateAt(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** YYYY-MM-DD HH:mm（时间无效时返回空串） */
export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return formatDateAt(value) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** 去掉小数末尾的 0：96.5 -> 96.5、100.0 -> 100 */
export function niceNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return String(Math.round(num * 100) / 100);
}

/* ------------------------------------------------------------------ 作业列表状态推导 */

/** 是否有正式提交（submit 后的任意非 draft 状态） */
export function hasRealSubmission(assignment) {
  const subs = (assignment && assignment.submissions) || [];
  return subs.some((s) => s && s.status && s.status !== 'draft');
}

/** 是否已发布出分（仅 published 可见分数） */
export function hasPublishedSubmission(assignment) {
  const subs = (assignment && assignment.submissions) || [];
  return subs.some((s) => s && s.status === 'published');
}

export function hasDraftSubmission(assignment) {
  const subs = (assignment && assignment.submissions) || [];
  return subs.some((s) => s && s.status === 'draft');
}

/**
 * 作业状态（列表/首页共用；与桌面 student/Assignments.vue 同口径，另补「锁定」文案）：
 *   locked 已锁定 / graded 已出分 / submitted 待评分 / upcoming 未开始 / expired 已截止 / active 进行中
 * canEnter 为桌面「卡片可进入」同口径：锁定、未开始、已截止且从未提交 => 不可进入。
 */
export function assignmentState(assignment, nowTs) {
  const a = assignment || {};
  const now = Number.isFinite(Number(nowTs)) ? Number(nowTs) : Date.now();
  const start = a.startTime ? new Date(a.startTime).getTime() : NaN;
  const end = a.endTime ? new Date(a.endTime).getTime() : NaN;
  const real = hasRealSubmission(a);
  const published = hasPublishedSubmission(a);
  const notStarted = Number.isFinite(start) && now < start && !real;
  const expired = Number.isFinite(end) && now > end;

  if (a.locked) return { key: 'locked', text: '已锁定', tone: 'danger', canEnter: false };
  if (published) return { key: 'graded', text: '已出分', tone: 'success', canEnter: true };
  if (real) return { key: 'submitted', text: '待评分', tone: 'warning', canEnter: true };
  if (notStarted) return { key: 'upcoming', text: '未开始', tone: 'neutral', canEnter: false };
  if (expired) return { key: 'expired', text: '已截止', tone: 'danger', canEnter: false };
  return { key: 'active', text: '进行中', tone: 'info', canEnter: true };
}

/** 状态所属筛选组：todo（未完成）/ submitted（待评分）/ graded（已评分）/ ''（不进筛选） */
export function filterGroupOf(state) {
  if (!state) return '';
  if (state.key === 'active' || state.key === 'upcoming') return 'todo';
  if (state.key === 'submitted') return 'submitted';
  if (state.key === 'graded') return 'graded';
  return '';
}

/** 列表筛选计数（只统计当前已加载列表） */
export function assignmentCounts(list, nowTs) {
  const counts = { all: 0, todo: 0, submitted: 0, graded: 0 };
  (list || []).forEach((a) => {
    counts.all += 1;
    const group = filterGroupOf(assignmentState(a, nowTs));
    if (group) counts[group] += 1;
  });
  return counts;
}

/** 是否已过提交次数上限（未配置 maxAttempts = 不限次） */
export function limitInfo(assignment, submissions) {
  const maxAttempts = assignment && assignment.maxAttempts != null ? Number(assignment.maxAttempts) : null;
  let submittedAttempts = 0;
  (submissions || []).forEach((s) => {
    if (s && Number(s.attemptCount) > submittedAttempts) submittedAttempts = Number(s.attemptCount);
  });
  if (maxAttempts == null || maxAttempts <= 0) return { maxAttempts: null, submittedAttempts, reached: false, text: '' };
  const left = Math.max(0, maxAttempts - submittedAttempts);
  return {
    maxAttempts,
    submittedAttempts,
    reached: left <= 0,
    text: left <= 0 ? '已达提交次数上限（最多 ' + maxAttempts + ' 次）' : '还可提交 ' + left + ' 次',
  };
}

/* ------------------------------------------------------------------ 作答单位（小题粒度） */

/** 提交行 -> 作答单位 key（project 的 subQuestionId 为 null） */
export function unitKeyOfSubmission(sub) {
  if (!sub) return '';
  return sub.subQuestionId ? 'q' + sub.questionId + '_s' + sub.subQuestionId : 'q' + sub.questionId;
}

/**
 * 把 GET /student/assignments/:id 的详情拍平成「作答单位」列表。
 * 单位 = 小题（subQuestion）；project 题（实训题）没有小题时按题目本身一个单位（手机端只读引导）。
 * 每个单位：{ key, q, sq, qIndex, type('objective'|'code'|'project'), title, content, score, language }
 */
export function buildUnits(detail) {
  const assignment = (detail && detail.assignment) || {};
  const submissions = (detail && detail.submissions) || [];
  const byKey = {};
  submissions.forEach((s) => {
    const key = unitKeyOfSubmission(s);
    if (key && !byKey[key]) byKey[key] = s;
  });

  const units = [];
  const questions = assignment.assignmentQuestions || [];
  questions.forEach((aq, qIndex) => {
    const q = aq && aq.question ? aq.question : null;
    if (!q) return;
    const subs = Array.isArray(q.subQuestions) ? q.subQuestions : [];
    const isProject = q.type === 'project';
    if (isProject || subs.length === 0) {
      units.push({
        key: 'q' + q.id,
        q,
        sq: null,
        qIndex,
        type: isProject ? 'project' : (q.type === 'objective' ? 'objective' : 'code'),
        title: q.title || '第 ' + (units.length + 1) + ' 题',
        questionTitle: q.title || '',
        content: q.material || '',
        score: q.maxScore,
        language: '',
      });
      return;
    }
    subs.forEach((sq) => {
      units.push({
        key: 'q' + q.id + '_s' + sq.id,
        q,
        sq,
        qIndex,
        type: sq.type === 'objective' ? 'objective' : 'code',
        title: sq.title || q.title || '第 ' + (units.length + 1) + ' 题',
        questionTitle: q.title || '',
        content: sq.content || '',
        score: sq.score != null ? sq.score : q.maxScore,
        language: sq.language || '',
      });
    });
  });

  return { assignment, submissions, byKey, units };
}

/** 客观题答案字符串（桌面同格式） -> [{ key, answer }]；非法 JSON 返回空数组 */
export function parseObjectiveAnswer(answer) {
  if (!answer) return [];
  try {
    const parsed = JSON.parse(String(answer));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 客观题小问列表里是否有任一答案（用于「已答」判定） */
export function objectiveHasAnswer(items, answers) {
  const list = items || [];
  const map = answers || {};
  return list.some((item) => String(map[item.key] == null ? '' : map[item.key]).trim() !== '');
}

/** 生成提交/草稿用的客观题答案字符串（覆盖全部小问，空答案也带 key） */
export function buildObjectiveAnswer(items, answers) {
  const list = items || [];
  const map = answers || {};
  return JSON.stringify(list.map((item) => ({
    key: item.key,
    answer: String(map[item.key] == null ? '' : map[item.key]),
  })));
}

/** 小数按满分归一到 0-100（缺失/非法时返回 null） */
export function scorePercent(score, max) {
  const s = Number(score);
  const m = Number(max);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null;
  return Math.max(0, Math.min(100, (s / m) * 100));
}

/* ------------------------------------------------------------------ 剪贴板 / 并发 */

/** 复制文本（优先 navigator.clipboard，旧内核/非 https 回退 execCommand）；返回是否成功 */
export async function copyText(text) {
  const value = String(text == null ? '' : text);
  if (!value) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* 无权限 / 非安全上下文：走回退 */ }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 受限并发执行（v1 交卷逐题提交：并发 3，避免手机弱网下大量并发） */
export async function runLimited(items, limit, worker) {
  const list = items || [];
  const max = Math.max(1, Number(limit) || 1);
  const results = new Array(list.length);
  let cursor = 0;
  async function next() {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(max, list.length); i += 1) workers.push(next());
  await Promise.all(workers);
  return results;
}
