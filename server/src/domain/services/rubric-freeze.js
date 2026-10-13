/**
 * rubricFreeze.js —— W1（R2-B2）改题拦截的**纯决策函数**（可单测，控制器只负责 IO 与响应）。
 *
 * 语义（与 docs/dsh/R2-A-施工单.md W1 一致）：
 *   - 未被任何作业引用 ⇒ allow（放行）
 *   - 被**已截止**作业引用且未 force ⇒ block（409 + 可判定 code）
 *   - 被已截止作业引用但 force=1 ⇒ allow 且 force=true（控制器写审计日志留痕）
 *   - 仅被**进行中**作业引用 ⇒ allow 且 warn=true（放行 + 告警）
 */
export const RUBRIC_FROZEN_CODE = 'RUBRIC_FROZEN_BY_ENDED_ASSIGNMENT';

export function classifyRubricFreeze({ rubricChanged, refs = [], now = Date.now(), force = false } = {}) {
  if (!rubricChanged) return { action: 'allow', force: false, warn: false, ended: [], running: [] };
  const isEnded = (r) => !!(r && r.assignment && new Date(r.assignment.endTime).getTime() < now);
  const ended = refs.filter(isEnded);
  const running = refs.filter((r) => r && r.assignment && !isEnded(r));
  if (ended.length && !force) {
    return { action: 'block', code: RUBRIC_FROZEN_CODE, force: false, warn: false, ended, running };
  }
  return { action: 'allow', force: !!(ended.length && force), warn: !ended.length && running.length > 0, ended, running };
}
