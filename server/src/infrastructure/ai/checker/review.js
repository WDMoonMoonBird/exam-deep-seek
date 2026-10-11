/**
 * review.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 1163-1251 · 1253-1280）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import prisma from '../../../utils/prisma.js';
import logger from '../../../utils/logger.js';
import { validateRules } from '../../rule/index.js';
import { getCheckerState } from './state.js';
import { generateChecker } from './generator.js';

/**
 * 教师确认操作（review 态）：
 * - confirm：确认启用（ready，当前草稿版本转 active）
 * - to_subjective：将失分规则项移入 subjective_items（AI 主观评分），重写 checker_script
 * - exempt / accept：标记体检报告失分项（豁免/接受），不改变规则
 * - update_rules：高级模式编辑规则 JSON 后保存（重新校验）
 * - regenerate：重新触发生成（fire-and-forget）
 * @param {number|string} questionId
 * @param {{action: string, itemIds?: Array, rules?: object}} body
 * @returns {Promise<{status: string, script: string|null, meta: object}|null>}
 */
export async function confirmChecker(questionId, body) {
  const id = +questionId;
  const { action, itemIds, rules: newRules } = body || {};
  const q = await prisma.question.findUnique({
    where: { id },
    select: { checkerScript: true, checkerStatus: true, checkerMeta: true },
  });
  if (!q) return null;
  const meta = q.checkerMeta || {};
  let script = q.checkerScript;
  let nextStatus = q.checkerStatus;

  if (action === 'regenerate') {
    generateChecker(id).catch((err) => logger.error({ err, questionId: id }, '自动评分器重新生成异常'));
    return { status: 'generating', script, meta };
  }

  if (action === 'update_rules') {
    if (!newRules || typeof newRules !== 'object') return { status: q.checkerStatus, script, meta };
    const v = validateRules(newRules);
    if (!v.ok) return { status: q.checkerStatus, script, meta, error: v.error };
    script = JSON.stringify(newRules);
    meta.rules = newRules;
    nextStatus = 'review';
  }

  if (action === 'confirm') {
    const list = Array.isArray(meta.versions) ? meta.versions : [];
    const latest = list[list.length - 1];
    if (latest) {
      list.forEach((x) => {
        x.status = x.id === latest.id ? 'active' : (x.status === 'active' ? 'archived' : x.status);
      });
      meta.activeVersionId = latest.id;
    }
    nextStatus = 'ready';
    meta.error = null;
  }

  if ((action === 'to_subjective' || action === 'exempt' || action === 'accept') && Array.isArray(itemIds)) {
    const report = meta.report || { items: [] };
    let rules = null;
    if (script) { try { rules = JSON.parse(script); } catch { rules = null; } }
    for (const itemId of itemIds) {
      const rep = report.items.find((i) => String(i.id) === String(itemId));
      if (!rep) continue;
      if (action === 'to_subjective' && rules) {
        const idx = rules.objective_items.findIndex((o) => String(o.id) === String(itemId));
        if (idx >= 0) {
          const [obj] = rules.objective_items.splice(idx, 1);
          rules.subjective_items.push({
            id: 's' + (rules.subjective_items.length + 1),
            item: obj.item,
            max_score: obj.max_score,
            reason: '教师转主观',
          });
          script = JSON.stringify(rules);
        }
        rep.status = 'subjective';
        rep.note = '已转主观（AI 单次评分，温度 0）';
      } else if (action === 'exempt') {
        rep.status = 'exempt';
        rep.note = '教师豁免（不计入校准失分，规则仍对学生生效）';
      } else if (action === 'accept') {
        rep.status = 'accept';
        rep.note = '接受失分（保留扣分）';
      }
    }
    if (rules) meta.rules = rules;
    meta.report = report;
  }

  await prisma.question.update({
    where: { id },
    data: { checkerScript: script, checkerStatus: nextStatus, checkerMeta: meta },
  });
  return getCheckerState(id);
}

/**
 * 回滚到历史规则版本（版本快照存 checkerMeta.versions，阶段 1 迁移 RuleVersion 表）。
 * @param {number|string} questionId
 * @param {number} versionId
 * @returns {Promise<{status: string, script: string|null, meta: object}|null>}
 */
export async function rollbackChecker(questionId, versionId) {
  const id = +questionId;
  const q = await prisma.question.findUnique({
    where: { id },
    select: { checkerScript: true, checkerStatus: true, checkerMeta: true },
  });
  if (!q) return null;
  const meta = q.checkerMeta || {};
  const list = Array.isArray(meta.versions) ? meta.versions : [];
  const v = list.find((x) => Number(x.id) === Number(versionId));
  if (!v || !v.rules) return null;
  list.forEach((x) => {
    if (Number(x.id) === Number(versionId)) x.status = 'active';
    else if (x.status === 'active') x.status = 'archived';
  });
  meta.activeVersionId = Number(versionId);
  await prisma.question.update({
    where: { id },
    data: { checkerScript: v.rules, checkerStatus: 'ready', checkerMeta: meta },
  });
  return getCheckerState(id);
}
