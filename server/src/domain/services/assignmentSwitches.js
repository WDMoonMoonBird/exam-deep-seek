/**
 * assignmentSwitches.js —— 作业三个正交开关的**题型默认值**与写入归一化（US-B1）。
 *
 * 三开关（D1）：
 *   ① 能否重复提交 / 次数上限：allowResubmit + maxAttempts（既有列，本次只做归一化）
 *   ② 计分口径：scorePolicy（scorePolicy.js）
 *   ③ 答案可见性：answerVisibility（answerVisibility.js）
 *
 * 题型默认值（D2，需求 v1.0）：
 *   - 编程题（不含实训题）：允许重交、不限次、取最高、提交后可看答案解析
 *   - 实训题（含 type='project' 的题）：1 次、取最后、发布后可见
 *
 * 归一化规则（写入前唯一入口，保证落库值合法）：
 *   - 显式传值 ⇒ 采用（口径/可见性非法值回落题型默认值，与既有 mode 写法同样宽松）
 *   - 未传 / null ⇒ 采用题型默认值（口径/可见性为 null 时也走题型默认，不落 NULL）
 *   - maxAttempts ≤ 0 / 非数值 ⇒ null（不限次）—— 与提交侧「maxAttempts > 0 才拦截」判据一致
 *
 * 历史数据（迁移前的行）不经过本函数：列默认值 'last' / 'after_publish' = 既有行为（US-B1 AC3）。
 *
 * 领域层纯函数：只 import 同层模块（check-layers 允许 domain 内部相对引用）。
 */

import { normalizeScorePolicy } from './scorePolicy.js';
import { normalizeAnswerVisibility } from './answerVisibility.js';

/**
 * 题型默认值。
 * @param {{hasProject?: boolean}} input
 * @returns {{allowResubmit: boolean, maxAttempts: number|null, scorePolicy: 'best'|'last', answerVisibility: 'immediate'|'after_publish'}}
 */
export function assignmentSwitchDefaults({ hasProject } = {}) {
  return hasProject
    ? { allowResubmit: true, maxAttempts: 1, scorePolicy: 'last', answerVisibility: 'after_publish' }
    : { allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'immediate' };
}

/** 次数上限归一化：非正数 / 非数值 ⇒ null（不限次） */
function normalizeMaxAttempts(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/**
 * 解析作业写入用的三开关取值。
 * @param {{hasProject?: boolean, allowResubmit?: unknown, maxAttempts?: unknown, scorePolicy?: unknown, answerVisibility?: unknown}} input
 * @returns {{allowResubmit: boolean, maxAttempts: number|null, scorePolicy: 'best'|'last', answerVisibility: 'immediate'|'after_publish'}}
 */
export function resolveAssignmentSwitches({ hasProject, allowResubmit, maxAttempts, scorePolicy, answerVisibility } = {}) {
  const d = assignmentSwitchDefaults({ hasProject });
  return {
    allowResubmit: allowResubmit === undefined || allowResubmit === null ? d.allowResubmit : !!allowResubmit,
    maxAttempts: maxAttempts === undefined ? d.maxAttempts : normalizeMaxAttempts(maxAttempts),
    scorePolicy: normalizeScorePolicy(scorePolicy) ?? d.scorePolicy,
    answerVisibility: normalizeAnswerVisibility(answerVisibility) ?? d.answerVisibility,
  };
}
