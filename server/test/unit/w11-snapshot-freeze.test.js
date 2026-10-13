/**
 * W11（R2-B2）：快照写值/读路径（snapshot ?? live）与两条纯决策表（W1 冻结判定、W3 stale 判定）。
 */
import { buildPublishSnapshot, decideStale, resolveSnapshot, SNAPSHOT_ORIGIN_PUBLISH } from '../../src/services/assignmentSnapshot.js';
import { RUBRIC_FROZEN_CODE, classifyRubricFreeze } from '../../src/domain/services/rubric-freeze.js';
import { textSha256 } from '../../src/utils/snapshotHash.js';

const past = new Date(Date.now() - 3600_000).toISOString();
const future = new Date(Date.now() + 3600_000).toISOString();
const ref = (id, endTime, title = 't' + id) => ({ assignmentId: id, assignment: { id, title, endTime } });

describe('W11 快照（W2）', () => {
  it('W11-1 buildPublishSnapshot：rubric/material/rubricItems/哈希/来源齐备', () => {
    const q = { id: 4242, scoringRubric: '标准A', material: '材料A', rubricItems: [{ item: '拆分', maxScore: 40 }] };
    const s = buildPublishSnapshot(q);
    expect(s.rubricSnapshot.rubric).toBe('标准A');
    expect(s.rubricSnapshot.rubricItems).toEqual([{ item: '拆分', maxScore: 40 }]);
    expect(s.rubricSnapshot.rubricSha256).toBe(textSha256('标准A'));
    expect(s.materialSnapshot).toBe('材料A');
    expect(s.standardHash).toMatch(/^sha256:(absent|[0-9a-f]{64})$/);
    expect(s.snapshotOrigin).toBe(SNAPSHOT_ORIGIN_PUBLISH);
    expect(typeof s.rubricSnapshot.capturedAt).toBe('string');
  });

  it('W11-2 resolveSnapshot：有快照用快照（冻结），无快照回落活值（历史不变）', () => {
    const q = { id: 1, scoringRubric: '新标准', material: '新材料', rubricItems: [{ item: 'N', maxScore: 1 }] };
    const row = { rubricSnapshot: { rubric: '旧标准', rubricItems: [] }, materialSnapshot: '旧材料', standardHash: 'sha256:abcd', snapshotOrigin: 'publish' };
    const withSnap = resolveSnapshot(row, q);
    expect(withSnap.fromSnapshot).toBe(true);
    expect(withSnap.rubric).toBe('旧标准');
    expect(withSnap.material).toBe('旧材料');
    expect(withSnap.rubricItems).toEqual([]);
    const live = resolveSnapshot(null, q);
    expect(live.fromSnapshot).toBe(false);
    expect(live.rubric).toBe('新标准');
    expect(live.material).toBe('新材料');
    expect(live.rubricItems).toEqual([{ item: 'N', maxScore: 1 }]);
    const backfill = resolveSnapshot({ rubricSnapshot: { rubric: '回填' }, snapshotOrigin: 'backfill' }, q);
    expect(backfill.origin).toBe('backfill');
    expect(backfill.material).toBe('新材料'); // 回填行 material_snapshot 为空 → 回落
  });
});

describe('W11 冻结决策（W1）', () => {
  it('W11-3 未改 rubric ⇒ allow（零影响）', () => {
    const d = classifyRubricFreeze({ rubricChanged: false, refs: [ref(1, past)] });
    expect(d.action).toBe('allow');
    expect(d.force).toBe(false);
    expect(d.warn).toBe(false);
  });

  it('W11-4 被已截止作业引用且未 force ⇒ block + 可判定 code', () => {
    const d = classifyRubricFreeze({ rubricChanged: true, refs: [ref(7, past)] });
    expect(d.action).toBe('block');
    expect(d.code).toBe(RUBRIC_FROZEN_CODE);
    expect(d.ended.map((r) => r.assignmentId)).toEqual([7]);
  });

  it('W11-5 被已截止引用但 force=1 ⇒ allow + force（留痕由控制器写）', () => {
    const d = classifyRubricFreeze({ rubricChanged: true, refs: [ref(7, past)], force: true });
    expect(d.action).toBe('allow');
    expect(d.force).toBe(true);
    expect(d.warn).toBe(false);
  });

  it('W11-6 仅被进行中作业引用 ⇒ allow + warn（放行告警）', () => {
    const d = classifyRubricFreeze({ rubricChanged: true, refs: [ref(9, future)] });
    expect(d.action).toBe('allow');
    expect(d.force).toBe(false);
    expect(d.warn).toBe(true);
    expect(d.running.map((r) => r.assignmentId)).toEqual([9]);
  });
});

describe('W11 stale 判定（W3）', () => {
  it('W11-7 未记录哈希（历史行）⇒ 不判陈旧（历史行为不变）', () => {
    expect(decideStale({ currentRubricHash: textSha256('a'), currentStandardHash: 'sha256:x' })).toEqual({ stale: false, reasons: [] });
  });

  it('W11-8 哈希一致 ⇒ 不陈旧；任一变化 ⇒ stale + 可判定 reasons', () => {
    const r = textSha256('a');
    const s = 'sha256:std';
    expect(decideStale({ storedRubricHash: r, storedStandardHash: s, currentRubricHash: r, currentStandardHash: s })).toEqual({ stale: false, reasons: [] });
    expect(decideStale({ storedRubricHash: r, storedStandardHash: s, currentRubricHash: textSha256('b'), currentStandardHash: s })).toEqual({ stale: true, reasons: ['rubric_hash_mismatch'] });
    expect(decideStale({ storedRubricHash: r, storedStandardHash: s, currentRubricHash: textSha256('b'), currentStandardHash: 'sha256:other' }).reasons)
      .toEqual(['rubric_hash_mismatch', 'standard_hash_mismatch']);
  });
});
