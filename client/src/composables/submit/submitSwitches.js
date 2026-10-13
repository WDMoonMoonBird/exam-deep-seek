/**
 * submitSwitches.js —— 学生提交页的「开关驱动」纯逻辑（R3 / US-B1·B2·B6·C2 前端部分）。
 * 无 Vue 依赖、无 I/O：次数/上限态、答案可见性、分数标签全部在这里，组件只做绑定与渲染。
 *
 * ★数据来源（均为后端既有返回，不新增接口）：
 *   GET /student/assignments/:id → { assignment: { allowResubmit, maxAttempts, scorePolicy, answerVisibility },
 *                                    submissions: [{ status, attemptCount, finalScore, bestScore, teacherFeedback }] }
 *   - maxAttempts: null = 不限次；'best'|'last' = 计分口径；'immediate'|'after_publish' = 答案可见性
 *   - 后端已按可见性裁剪：不可见时不下发 finalScore / bestScore / referenceAnswer / objectiveItems[].answer
 */

export const SCORE_POLICY = { BEST: 'best', LAST: 'last' };
export const ANSWER_VISIBILITY = { IMMEDIATE: 'immediate', AFTER_PUBLISH: 'after_publish' };

/** 第 k 次提交：已提交 k-1 次时，本次是第 k 次（US-B6 AC1） */
export function attemptLabel({ submittedAttempts = 0, currentAttempt = 1 } = {}) {
  const done = Math.max(0, Number(submittedAttempts) || 0);
  const now = Math.max(1, Number(currentAttempt) || 1);
  if (done <= 0) return '第 1 次提交';
  return `已提交 ${done} 次 · 本次为第 ${now} 次`;
}

/** 剩余可提交次数文案；未配置上限 ⇒ null（不限次） */
export function remainingText({ maxAttempts = null, submittedAttempts = 0 } = {}) {
  if (maxAttempts == null || maxAttempts <= 0) return null;
  const left = Math.max(0, maxAttempts - (Number(submittedAttempts) || 0));
  return left > 0 ? `还可提交 ${left} 次` : '次数已用完';
}

/** 是否已达提交次数上限（US-C2 AC2：达上限 ⇒ 禁止提交并说明原因） */
export function limitReached({ maxAttempts = null, submittedAttempts = 0 } = {}) {
  if (maxAttempts == null || maxAttempts <= 0) return false;
  return (Number(submittedAttempts) || 0) >= maxAttempts;
}

/** 上限态的原因文案（后端同口径：已达提交次数上限（最多 N 次）） */
export function limitText(maxAttempts) {
  return `已达提交次数上限（最多 ${maxAttempts} 次）`;
}

/**
 * 答题/评分状态 → 是否「已出分」（后端可见性规则不变：published 恒可见；
 * ai_graded / reviewed 仅在后端按开关/历史规则下发分数时才有值 ⇒ 前端以「分数是否存在」为准）
 */
export function hasScore(value) {
  return value !== null && value !== undefined && value !== '';
}

/**
 * 标准答案/解析的展示门（答案可见性开关，US-B2）：
 *   - published：恒可见；
 *   - immediate：评分完成（ai_graded / reviewed）即可见；
 *   - after_publish（含历史作业默认）：未发布不可见。
 * 注：后端是裁剪权威（不可见时不下发 referenceAnswer / item.answer），本函数用于
 *     「有内容才渲染 + 无内容时给出可读原因」，两侧同口径，不做二次隐藏。
 */
export function answerVisibleByPolicy({ answerVisibility = 'after_publish', status = '' } = {}) {
  if (status === 'published') return true;
  const graded = status === 'ai_graded' || status === 'reviewed';
  if (!graded) return false;
  return answerVisibility === ANSWER_VISIBILITY.IMMEDIATE;
}

/** 已提交/已评分但当前不能看答案时的说明文案（无 => 不显示） */
export function answerPendingHint({ answerVisibility = 'after_publish', status = '' } = {}) {
  const graded = status === 'ai_graded' || status === 'reviewed';
  if (!graded) return '';
  if (answerVisibility === ANSWER_VISIBILITY.IMMEDIATE) return '';
  return '参考答案与解析将在作业发布后可见';
}

/** 分数标签：口径=取最高时点明「当前计入分」（US-B6 AC2） */
export function scoreTagText({ scorePolicy = 'last', bestScore = null, maxScore = null } = {}) {
  if (!hasScore(bestScore)) return '';
  // 后端显示 null 不下发，这里数值来源也一律不下发字段名
  const tail = maxScore != null ? ` / ${maxScore}` : '';
  return scorePolicy === SCORE_POLICY.BEST ? `计入分（最高）${bestScore}${tail}` : `最高分 ${bestScore}${tail}`;
}
