/**
 * assignmentSnapshot.js —— W2（R2-B2）发布时快照：写值构造 + 评分读路径解析。
 *
 * 数据形状（批 1 新增的 4 列，assignment_questions）：
 *   rubric_snapshot   JSON      → { rubric, rubricItems, rubricSha256, capturedAt }
 *   material_snapshot TEXT      → 发布时的题目材料文本
 *   standard_hash     VARCHAR   → 标准工程包目录哈希（口径见 utils/snapshotHash.js）
 *   snapshot_origin   VARCHAR   → 'publish'（发布写入）| 'backfill'（历史回填）
 *
 * 读路径铁律：snapshot ?? live —— 有快照用快照，无快照（历史作业）回落题目活值，
 * 保证「已发布作业不随题库变化」，且历史行为不变。
 */
import { textSha256, standardPackSha256 } from '../utils/snapshotHash.js';

export const SNAPSHOT_ORIGIN_PUBLISH = 'publish';
export const SNAPSHOT_ORIGIN_BACKFILL = 'backfill';

/** 发布时（创建作业）构造 assignment_questions 的快照写值 */
export function buildPublishSnapshot(question) {
  const rubric = question?.scoringRubric ?? '';
  return {
    rubricSnapshot: {
      rubric,
      rubricItems: question?.rubricItems ?? null,
      rubricSha256: textSha256(rubric),
      capturedAt: new Date().toISOString(),
    },
    materialSnapshot: question?.material ?? null,
    standardHash: standardPackSha256(question?.id),
    snapshotOrigin: SNAPSHOT_ORIGIN_PUBLISH,
  };
}

/** 评分/显示读路径：snapshot ?? live */
export function resolveSnapshot(row, question) {
  const snap = row && row.rubricSnapshot && typeof row.rubricSnapshot === 'object' ? row.rubricSnapshot : null;
  return {
    fromSnapshot: !!snap,
    origin: row?.snapshotOrigin ?? null,
    rubric: snap?.rubric ?? question?.scoringRubric ?? '',
    rubricItems: snap?.rubricItems ?? question?.rubricItems ?? null,
    material: row?.materialSnapshot ?? question?.material ?? '',
    standardHash: row?.standardHash ?? null,
    rubricSha256: snap?.rubricSha256 ?? null,
  };
}

/**
 * ★W3-D2（N12）：标准哈希的**来源标签**（单一真源）—— `'publish'`/`'backfill'` = 冻结快照哈希；
 *   `null` = 无快照行 ⇒ 当时用的是**活值**（`standardPackSha256(questionId)` 的当次结果）。
 *   为什么必须单一真源：写入侧（`services/projectGrading.js:325`）与读取侧（`infrastructure/review/project-review-ops.js`）
 *   若各写一遍，就会出现"冻结哈希 vs 活值哈希"两个不同口径的值被当作"标准已变化"来比较 ⇒ **与事实相反的 stale 误报**。
 *   （写入侧当前是**等价内联表达式**；本函数即其提取，语义/值域完全一致 —— 待 t59 一并切到本函数以彻底单一真源。）
 */
export function snapshotSourceOf(std) {
  return (std && (std.origin || (std.fromSnapshot ? SNAPSHOT_ORIGIN_PUBLISH : null))) || null;
}

/** 取作业-题目链接上的快照行（评分链路用；assignmentId/questionId 为复合主键） */
export async function loadAssignmentSnapshot(prisma, assignmentId, questionId) {
  if (!assignmentId || !questionId) return null;
  try {
    return await prisma.assignmentQuestion.findUnique({
      where: { assignmentId_questionId: { assignmentId: +assignmentId, questionId: +questionId } },
      select: { rubricSnapshot: true, materialSnapshot: true, standardHash: true, snapshotOrigin: true },
    });
  } catch {
    return null; // 迁移未落地的库（无快照列）→ 回落 live，行为与批 2 之前一致
  }
}

/**
 * W3（R2-B2）stale 判定（纯函数，可单测）：本次评分的标准哈希 vs 当前活值哈希。
 *  - 未记录哈希（历史行）⇒ stale=false（不因缺失而判陈旧，历史行为不变）
 *  - 相同 ⇒ stale=false；不同 ⇒ stale=true + reasons（可判定，供重评接口返回需确认）
 */
export function decideStale({
  storedRubricHash, storedStandardHash, currentRubricHash, currentStandardHash,
  // ★W3-D2（N12）：两侧**来源标签**（见 snapshotSourceOf）。默认 null ⇒ 与改动前完全同行为（既有调用/单测零影响）。
  storedStandardSource = null, currentStandardSource = null,
} = {}) {
  const reasons = [];
  const skipped = [];
  if (storedRubricHash && currentRubricHash && storedRubricHash !== currentRubricHash) reasons.push('rubric_hash_mismatch');
  // ★W3-D2（N12）：标准哈希**只在两侧同口径时可比** —— 「冻结快照哈希」与「无快照时的目录活值哈希」是两种值，
  //   来源（冻结 ⇔ 非冻结）不同时它们天然可能不等 ⇒ **跳过比较**（否则会以"标准已变化"误报 409），并如实回传 skipped 供审计。
  //   注意：两侧都为 null = 两次都无快照（都是活值）⇒ **可比**（此时比的是"当时的目录 vs 现在的目录"，是有意义的信号）。
  const frozenStored = (storedStandardSource || null) !== null;
  const frozenCurrent = (currentStandardSource || null) !== null;
  if (frozenStored !== frozenCurrent) {
    if (storedStandardHash && currentStandardHash) skipped.push('standard_hash_source_mismatch');
  } else if (storedStandardHash && currentStandardHash && storedStandardHash !== currentStandardHash) {
    reasons.push('standard_hash_mismatch');
  }
  const out = { stale: reasons.length > 0, reasons: reasons.sort() };
  // ★形状约束：skipped **仅在非空时出现** —— server/test/unit/w11-snapshot-freeze.test.js:77/83/84/85 用
  //   toEqual({ stale, reasons }) 钉住了返回对象形状；无条件加字段会把那 4 条断言判红。
  if (skipped.length) out.skipped = skipped;
  return out;
}
