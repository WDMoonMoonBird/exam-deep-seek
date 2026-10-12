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
export function decideStale({ storedRubricHash, storedStandardHash, currentRubricHash, currentStandardHash } = {}) {
  const reasons = [];
  if (storedRubricHash && currentRubricHash && storedRubricHash !== currentRubricHash) reasons.push('rubric_hash_mismatch');
  if (storedStandardHash && currentStandardHash && storedStandardHash !== currentStandardHash) reasons.push('standard_hash_mismatch');
  return { stale: reasons.length > 0, reasons: reasons.sort() };
}
