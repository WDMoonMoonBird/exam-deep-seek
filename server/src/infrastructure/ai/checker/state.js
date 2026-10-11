/**
 * state.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 645-661）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import prisma from '../../../utils/prisma.js';
import { DEFAULT_THRESHOLD } from '../../../domain/services/checker/meta.js';

/**
 * 读取题目评分规则生成状态。
 * @param {number|string} questionId 题目 id
 * @returns {Promise<{status: string, script: string|null, meta: object}>}
 */
export async function getCheckerState(questionId) {
  const q = await prisma.question.findUnique({
    where: { id: +questionId },
    select: { checkerScript: true, checkerStatus: true, checkerMeta: true },
  });
  if (!q) return { status: 'none', script: null, meta: null };
  const meta = q.checkerMeta || {
    rounds: 0, rules: null, items: [], subjective: [], log: [], error: null,
    report: null, versions: [], inputsSnapshot: null, threshold: DEFAULT_THRESHOLD, activeVersionId: null,
  };
  return { status: q.checkerStatus || 'none', script: q.checkerScript, meta };
}
