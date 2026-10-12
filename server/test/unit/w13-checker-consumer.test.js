/**
 * W13（R2-B3 / W6）：装置产物消费 —— 校验口径委托 validate.py、★不写分语义、回写字段齐备。
 * 全部用假 prisma + 临时 runRoot：不触库、不起服务。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  NO_SCORE_STATUS,
  buildWriteback,
  consumeMeasureResults,
  decideScoreWrite,
  parseValidateOutput,
  resolveCheckerPath,
} from '../../src/services/dshCheckerConsumer.js';

const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'w13-runroot-'));

function writeMeasure(runRoot, name, obj) {
  const d = path.join(runRoot, 'out', 'measure');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), JSON.stringify(obj));
}

const measure = (id, score, extra = {}) => ({
  schema_version: 'checker-result/1',
  checker_id: 'sha256:' + 'a'.repeat(64),
  canonical_sha256: 'sha256:' + 'b'.repeat(64),
  submission: { id, root_rel: '.', digest: 'sha256:x', file_count: 3 },
  totals: { score, max_score: 100, aggregate: 'sum_clamped' },
  items: [{ id: 'p1', score: score ?? 0, max_score: 40, comment: 'ok' }],
  reconciliation: { expected_items: 1, evaluated_items: 1, unsupported: extra.unsupported || [] },
  stale: extra.stale,
  run_meta: extra.run_meta,
});

describe('W13 校验口径（委托 validate.py）', () => {
  it('W13-1 parseValidateOutput：VIOLATION / checker_id / VALID 三要素', () => {
    const good = parseValidateOutput('checker_id=sha256:abc\nVALID=yes\n');
    expect(good).toEqual({ checkerId: 'sha256:abc', valid: true, violations: [] });
    const bad = parseValidateOutput('VIOLATION schema_version 缺失\nchecker_id=sha256:abc\nVALID=no\n');
    expect(bad.valid).toBe(false);
    expect(bad.violations).toEqual(['schema_version 缺失']);
  });

  it('W13-2 resolveCheckerPath：优先 out/checker/checker.json，兼容旧布局与 frozen', () => {
    const root = tmpRoot();
    expect(resolveCheckerPath(root)).toBe(null);
    fs.mkdirSync(path.join(root, 'out', 'checker'), { recursive: true });
    fs.writeFileSync(path.join(root, 'out', 'checker', 'checker.json'), '{}');
    expect(resolveCheckerPath(root)).toBe(path.join(root, 'out', 'checker', 'checker.json'));
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('W13 ★不写分语义（decideScoreWrite）', () => {
  it('W13-3 装置 exit 6（unsupported）⇒ 不写分 + needs_rerun', () => {
    const d = decideScoreWrite({ score: null, exitCode: 6 });
    expect(d.write).toBe(false);
    expect(d.status).toBe(NO_SCORE_STATUS);
    expect(d.reason).toBe('device_exit_6_unsupported');
  });

  it('W13-4 score===null / stale===true / unsupported 非空 ⇒ 一律不写分', () => {
    expect(decideScoreWrite({ score: null }).reason).toBe('score_null');
    expect(decideScoreWrite({ score: 88, stale: true }).reason).toBe('stale_true');
    expect(decideScoreWrite({ score: 88, unsupported: ['p9'] }).reason).toBe('unsupported_items:1');
    expect(decideScoreWrite({ score: 'abc' }).reason).toBe('score_not_finite');
    for (const d of [decideScoreWrite({ score: null }), decideScoreWrite({ stale: true, score: 1 }), decideScoreWrite({ score: 1, unsupported: ['x'] })]) {
      expect(d.write).toBe(false);
      expect(d.status).toBe(NO_SCORE_STATUS);
    }
  });

  it('W13-5 正常份（score 有限、非 stale、unsupported 空）⇒ 写分', () => {
    const d = decideScoreWrite({ score: 62, stale: false, unsupported: [] });
    expect(d.write).toBe(true);
    expect(d.score).toBe(62);
    expect(d.status).toBe('graded');
  });

  it('W13-6 不写分的份绝不落 0 分：完整链路（假 prisma）只对可写份 update', async () => {
    const root = tmpRoot();
    writeMeasure(root, 'a-ok.json', measure(1101, 62));
    writeMeasure(root, 'b-null.json', measure(1102, null));
    writeMeasure(root, 'c-stale.json', measure(1103, 70, { stale: true }));
    writeMeasure(root, 'd-unsupported.json', measure(1104, 90, { unsupported: ['p3'] }));
    const updates = [];
    const prisma = { submission: { update: async ({ where, data }) => { updates.push({ id: where.id, data }); return { id: where.id }; } } };
    const out = await consumeMeasureResults({ prisma, runRoot: root, assignmentId: 7 });
    expect(out.rows).toHaveLength(4);
    expect(out.written).toBe(1);
    expect(out.skipped.map((r) => r.reason).sort()).toEqual(['score_null', 'stale_true', 'unsupported_items:1']);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe(1101);
    expect(updates[0].data.checkerId).toMatch(/^sha256:/);
    expect(updates[0].data.canonicalSha256).toMatch(/^sha256:/);
    expect(updates[0].data.gradingStale).toBe(false);
    // 不写分的份：不得出现 aiScore=0 的回写
    expect(updates.every((u) => Number(u.data.aiScore) > 0)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W13-7 buildWriteback：审计字段齐备（checker_id/canonical_sha256/stale）', () => {
    const p = buildWriteback({ result: measure(9, 55), score: 55 });
    expect(JSON.parse(p.aiFeedback).checker_id).toBe('sha256:' + 'a'.repeat(64));
    expect(p.canonicalSha256).toBe('sha256:' + 'b'.repeat(64));
    expect(p.gradingStale).toBe(false);
    expect(JSON.parse(p.aiFeedback).breakdown[0].kind).toBe('checker');
  });
});
