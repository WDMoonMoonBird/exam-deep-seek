/**
 * assignmentSwitches.js —— 布置作业「三个正交开关」的纯逻辑（R3 / US-B1 前端部分）。
 * 无 Vue 依赖、无 I/O：题型判定、题型默认值、校验、文案、请求体拼装都在这里，
 * 表单（useAssignmentForm）与模板（Assignments.vue）只做绑定 ⇒ 可单测、可复用。
 *
 * ★字段名与后端**逐字一致**（server/src/interface/http/controllers/teacher/assignments.js
 *   + server/src/domain/services/assignmentSwitches.js 的入参契约）：
 *   allowResubmit     boolean                      —— 允许重交（false = 每人只能提交一次）
 *   maxAttempts       number | null                —— 提交次数上限（null = 不限次）
 *   scorePolicy       'best' | 'last'              —— 计分口径（取最高 / 取最后）
 *   answerVisibility  'immediate' | 'after_publish'—— 答案可见性（提交后立即 / 发布后）
 *
 * ★题型默认值（需求 v1.0 · D2，与后端 assignmentSwitchDefaults 一致）：
 *   编程题（type='code'）   ：允许重交、不限次、取最高、提交后可看答案解析
 *   实训题（type='project'）：1 次、取最后、发布后可见
 *
 * ★口径作用域：只作用**机器分**；教师给的总分（finalScore）始终是权威值（后端保证）。
 */

export const CODE = 'code';
export const PROJECT = 'project';

/** 题型 → 三开关默认值（与后端逐字一致；未知题型按编程题处理） */
export const TYPE_DEFAULTS = {
  [CODE]: { allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'immediate' },
  [PROJECT]: { allowResubmit: true, maxAttempts: 1, scorePolicy: 'last', answerVisibility: 'after_publish' },
};

export const SCORE_POLICY_OPTIONS = [
  { value: 'best', label: '取最高（历次最高分）' },
  { value: 'last', label: '取最后（最新一次）' },
];

export const ANSWER_VISIBILITY_OPTIONS = [
  { value: 'immediate', label: '提交后立即可见' },
  { value: 'after_publish', label: '发布后可见' },
];

/** US-B1 AC4：实训题的成本提示（文案与需求文档逐字一致） */
export const COST_TIP = '每次提交都会触发评分流程（耗时数分钟并产生模型费用），建议设置次数上限';

/** 题目类型判定：只有 type='project' 是实训题，其余（'code' / 缺省 / null）按编程题处理 */
export function questionKind(question) {
  return question && question.type === PROJECT ? PROJECT : CODE;
}

export function isProjectQuestion(question) {
  return questionKind(question) === PROJECT;
}

/** 题型默认值的**副本**（避免调用方改到常量表） */
export function switchDefaultsFor(kind) {
  return { ...(TYPE_DEFAULTS[kind] || TYPE_DEFAULTS[CODE]) };
}

/**
 * 题型变化时该套用哪组开关值（表单 watcher 的唯一决策点，纯函数便于单测）：
 *   - 教师已手改（touched=true）⇒ 原样保留，**不覆盖**教师的显式选择
 *   - 未手改 ⇒ 换成该题型的默认值（US-B1 AC1：按题型预填）
 */
export function nextSwitchesForKind({ current = {}, kind = CODE, touched = false } = {}) {
  return touched ? { ...current } : switchDefaultsFor(kind);
}

/** 次数上限归一：空 / 0 / 负数 / 非数值 ⇒ null（不限次）；其余取整 */
export function normalizeMaxAttempts(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/**
 * 次数上限校验（前端拦截，避免后端静默归一化成「不限次」）。
 * @returns {string|null} 可读文案；合法时为 null
 */
export function maxAttemptsError({ allowResubmit, maxAttempts } = {}) {
  if (!allowResubmit) return null;                                        // 不允许重交时该输入被禁用
  if (maxAttempts === null || maxAttempts === undefined || maxAttempts === '') return null;
  const n = Number(maxAttempts);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return '次数上限需为不小于 1 的整数（留空 = 不限次）';
  return null;
}

/** 表单 → 请求体（字段名与后端一致；对齐 POST /teacher/assignments 的入参） */
export function buildSwitchPayload(switches = {}) {
  return {
    allowResubmit: !!switches.allowResubmit,
    maxAttempts: normalizeMaxAttempts(switches.maxAttempts),
    scorePolicy: switches.scorePolicy === 'best' ? 'best' : 'last',
    answerVisibility: switches.answerVisibility === 'immediate' ? 'immediate' : 'after_publish',
  };
}

export function scorePolicyHint(scorePolicy) {
  return scorePolicy === 'best'
    ? '多次提交时该题机器分取历次最高；教师给的总分优先。'
    : '多次提交时该题机器分取最新一次；教师给的总分优先。';
}

export function answerVisibilityHint(answerVisibility) {
  return answerVisibility === 'immediate'
    ? '评分完成后学生即可查看参考答案与解析。'
    : '作业发布后学生才能查看参考答案与解析。';
}

/** 右栏摘要用的口语化标签 */
export function scorePolicyLabel(scorePolicy) {
  return scorePolicy === 'best' ? '取最高' : '取最后';
}

export function answerVisibilityLabel(answerVisibility) {
  return answerVisibility === 'immediate' ? '提交后可见' : '发布后可见';
}
