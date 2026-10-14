/**
 * loss-breakdown-item.test.js —— R3-S5（t30）失分项形状与 status 推导的口径锁定。
 *
 * 覆盖：
 *   A 组 deriveItemStatus / normalizeLossItem（domain 层唯一口径：写入端补齐用）；
 *   B 组 读取端兜底与 domain 规则的**一致性表**（读取端因零 import 契约内联同规则，必须防漂移）；
 *   C 组 四种形态（带 status / legacy 形状 / 混合 / 坏数据）在失分项分布聚合里的表现——
 *       未知项仍计 unknown、分母仍为 hit+miss（口径不放宽）。
 */
import { deriveItemStatus, normalizeLossItem, buildLossBreakdown, ITEM_STATUS } from '../../../src/domain/services/lossBreakdownItem.js';
import { deriveStatusFromScore, aggregateLossByItem, parseLossBreakdown } from '../../../src/application/queries/classLossDistribution.js';

describe('A · deriveItemStatus —— 唯一推导口径（不猜、不折算）', () => {
  it.each([
    ['满分', 10, 10, 'hit'],
    ['超出满分', 12, 10, 'hit'],
    ['0 分', 0, 10, 'miss'],
    ['负分', -1, 10, 'miss'],
    ['部分得分 ⇒ 未知', 6, 10, null],
    ['maxScore 缺失(0) ⇒ 未知', 0, 0, null],
    ['maxScore 负数 ⇒ 未知', 0, -5, null],
    ['score 非数字 ⇒ 未知', Number.NaN, 10, null],
    ['maxScore 非数字 ⇒ 未知', 10, Number.NaN, null],
  ])('%s：score=%p maxScore=%p ⇒ %p', (_n, s, m, want) => {
    expect(deriveItemStatus(s, m)).toBe(want);
  });
});

describe('A · normalizeLossItem —— 写入端形状（legacy 补齐 title/status）', () => {
  it('legacy 输入（无 title/status）⇒ 补齐：title 取 name、status 由分数推导', () => {
    const it = normalizeLossItem({ item: 'P01', name: '命名规范', score: 0, maxScore: 10, comment: 'x' }, { commentLimit: 60 });
    expect(it).toEqual({ item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10, comment: 'x' });
  });
  it('显式 status 优先（即使与分数矛盾也不改写）', () => {
    expect(normalizeLossItem({ item: 'P02', status: 'hit', score: 0, maxScore: 10 }).status).toBe('hit');
    expect(normalizeLossItem({ item: 'P03', status: 'unknown', score: 10, maxScore: 10 }).status).toBe('unknown');
  });
  it('部分得分 ⇒ status=null（未知），仍保留 score/maxScore', () => {
    const it = normalizeLossItem({ item: 'P04', score: 6, maxScore: 10 });
    expect(it.status).toBeNull();
    expect(it.score).toBe(6);
    expect(it.maxScore).toBe(10);
  });
  it('截断与别名：item ≤50、title ≤80、comment 按 commentLimit、max_score 驼峰兼容、非对象安全', () => {
    const it = normalizeLossItem({ item: 'i'.repeat(80), title: 't'.repeat(120), score: 10, max_score: 10, comment: 'c'.repeat(200) }, { commentLimit: 60 });
    expect(it.item).toHaveLength(50);
    expect(it.title).toHaveLength(80);
    expect(it.comment).toHaveLength(60);
    expect(it.maxScore).toBe(10);
    expect(it.status).toBe('hit');
    expect(normalizeLossItem(null)).toMatchObject({ item: '', title: '', status: null, score: 0, maxScore: 0 });
    expect(normalizeLossItem(undefined, { withComment: false })).not.toHaveProperty('comment');
  });
});

describe('A · buildLossBreakdown —— 写入端投影（★修法 A：legacy 写回不再只写 item/score/maxScore/comment）', () => {
  it('评分器旧形状（无 title/status）经投影 ⇒ 落库形状带 title/status（满分=hit、0 分=miss、部分=null）', () => {
    const out = buildLossBreakdown([
      { item: 'P01', name: '命名规范', score: 0, maxScore: 10, comment: '没写命名' },
      { item: 'P02', score: 10, maxScore: 10 },
      { item: 'P03', score: 4, maxScore: 10 },
    ], { commentLimit: 60 });
    expect(out).toEqual([
      { item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10, comment: '没写命名' },
      { item: 'P02', title: '', status: 'hit', score: 10, maxScore: 10, comment: '' },
      { item: 'P03', title: '', status: null, score: 4, maxScore: 10, comment: '' },
    ]);
  });
  it('显式 status 保留；maxItems 截断；非数组安全', () => {
    expect(buildLossBreakdown([{ item: 'A', status: 'unknown', score: 0, maxScore: 1 }])[0].status).toBe('unknown');
    expect(buildLossBreakdown([{ item: 'A' }, { item: 'B' }, { item: 'C' }].map((x) => ({ ...x, score: 1, maxScore: 1 })), { maxItems: 2 })).toHaveLength(2);
    expect(buildLossBreakdown(null)).toEqual([]);
  });
  it('projectGrading 写入端确实使用该投影（源码断言：不再自建 clampBreakdown 字段表）', async () => {
    const fs = await import('node:fs');
    const url = await import('node:url');
    const p = url.fileURLToPath(new URL('../../../src/services/projectGrading.js', import.meta.url));
    const txt = fs.readFileSync(p, 'utf8');
    expect(/buildLossBreakdown\(\[b\], \{ commentLimit: 60 \}\)/.test(txt)).toBe(true);
    expect(/clampBreakdown = \(b\) => \(\{[^}]*item: String\(b\.item/.test(txt)).toBe(false);
  });
});

describe('B · 一致性表：domain 规则 ≡ 读取端内联规则（防两处漂移）', () => {
  const cases = [[10, 10], [0, 10], [6, 10], [0, 0], [-1, 10], [12, 10], [Number.NaN, 10], [10, Number.NaN], [3.5, 7]];
  it.each(cases)('score=%p maxScore=%p 两侧一致', (s, m) => {
    expect(deriveItemStatus(s, m)).toBe(deriveStatusFromScore(s, m));
  });
  it('ITEM_STATUS 常量与聚合口径一致（hit/miss 字面量）', () => {
    expect(ITEM_STATUS).toEqual({ hit: 'hit', miss: 'miss' });
  });
});

describe('C · 四种形态的失分项分布（口径不放宽）', () => {
  const doc = (rows) => JSON.stringify({ source: 'dsh-checker', breakdown: rows });

  it('① 带 status（新形状）：hit/miss 直接生效', () => {
    const agg = aggregateLossByItem([
      { aiFeedback: doc([{ item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10 }, { item: 'P02', status: 'hit', score: 10, maxScore: 10 }]) },
    ]);
    expect(agg.items.find((i) => i.item === 'P01')).toMatchObject({ miss: 1, hit: 0, unknown: 0, numerator: 1, denominator: 1, lossRate: 1 });
    expect(agg.items.find((i) => i.item === 'P02')).toMatchObject({ hit: 1, miss: 0, denominator: 1, lossRate: 0 });
    expect(agg.totals).toMatchObject({ hits: 1, misses: 1, unknown: 0 });
  });

  it('② legacy 形状（无 status，有 score/maxScore）：由分数推导 hit/miss，不再全落 unknown', () => {
    const agg = aggregateLossByItem([
      { aiFeedback: doc([{ item: 'P01', score: 0, maxScore: 10, comment: '没写命名' }, { item: 'P02', score: 10, maxScore: 10 }, { item: 'P03', score: 4, maxScore: 10 }]) },
    ]);
    expect(agg.items.find((i) => i.item === 'P01')).toMatchObject({ miss: 1, hit: 0, unknown: 0, lossRate: 1 });
    expect(agg.items.find((i) => i.item === 'P02')).toMatchObject({ hit: 1, miss: 0, unknown: 0, lossRate: 0 });
    // 部分得分 ⇒ 未知（不进分母）
    expect(agg.items.find((i) => i.item === 'P03')).toMatchObject({ hit: 0, miss: 0, unknown: 1, denominator: 0, lossRate: null });
    expect(agg.totals).toMatchObject({ hits: 1, misses: 1, unknown: 1 });
  });

  it('③ 两代混合（同一班两次批改）：同一项的新旧形状都计入同一行', () => {
    const agg = aggregateLossByItem([
      { aiFeedback: doc([{ item: 'P01', title: '命名规范', status: 'miss', score: 0, maxScore: 10 }]) },
      { aiFeedback: doc([{ item: 'P01', score: 10, maxScore: 10 }]) },
    ]);
    expect(agg.items).toHaveLength(1);
    expect(agg.items[0]).toMatchObject({ item: 'P01', title: '命名规范', hit: 1, miss: 1, unknown: 0, numerator: 1, denominator: 2, lossRate: 0.5 });
    expect(agg.totals).toMatchObject({ submissionsScanned: 2, submissionsWithItems: 2, hits: 1, misses: 1, unknown: 0 });
  });

  it('④ 坏数据降级：json 坏 / 非对象 / 缺 score-maxScore / 非数组 breakdown ⇒ 不抛、不猜（unknown 或直接跳过）', () => {
    const agg = aggregateLossByItem([
      { aiFeedback: '{坏 json' },
      { aiFeedback: '[]' },
      { aiFeedback: JSON.stringify({ breakdown: 'oops' }) },
      { aiFeedback: doc([{ item: 'P01' }, { item: '', score: 0, maxScore: 5 }, null, 'x']) },
      null,
    ]);
    // 只有最后一条合法 JSON 里的 P01（无 score/maxScore ⇒ 不可判定 ⇒ unknown）与空 item（跳过）被处理
    expect(agg.items).toHaveLength(1);
    expect(agg.items[0]).toMatchObject({ item: 'P01', hit: 0, miss: 0, unknown: 1, denominator: 0, lossRate: null });
    expect(agg.totals).toMatchObject({ submissionsScanned: 4, submissionsWithItems: 1, unknown: 1 });
    expect(parseLossBreakdown('{坏 json').ok).toBe(false);
  });
});
