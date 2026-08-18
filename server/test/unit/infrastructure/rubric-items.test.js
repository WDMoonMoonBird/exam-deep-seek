/**
 * rubric-items.test.js — 评分标准固定分项（normalizeRubricItems 纯函数）。
 */
import { normalizeRubricItems } from '../../../src/services/deepseek.js';

describe('normalizeRubricItems（分项规整）', () => {
  it('正常列表 → 原样保留（旧数据无 automation_level → 按 deterministic 兜底）', () => {
    const r = normalizeRubricItems([{ item: '初始化', maxScore: 10 }, { item: '登录', maxScore: 20 }], 30);
    expect(r).toEqual([
      { item: '初始化', maxScore: 10, automation_level: 'deterministic' },
      { item: '登录', maxScore: 20, automation_level: 'deterministic' },
    ]);
  });
  it('合计不等于满分 → 最后一项补齐差额', () => {
    const r = normalizeRubricItems([{ item: 'A', maxScore: 10 }, { item: 'B', maxScore: 20 }], 100);
    expect(r[1].maxScore).toBe(90);
    expect(r[0].maxScore + r[1].maxScore).toBe(100);
  });
  it('非法项（空名丢弃；零分规整为 1 分）', () => {
    const r = normalizeRubricItems([{ item: '', maxScore: 10 }, { item: 'ok', maxScore: 0 }, { item: 'good', maxScore: 5 }], 6);
    expect(r).toEqual([
      { item: 'ok', maxScore: 1, automation_level: 'deterministic' },
      { item: 'good', maxScore: 5, automation_level: 'deterministic' },
    ]);
    expect(r.reduce((s, x) => s + x.maxScore, 0)).toBe(6);
  });
  it('空数组/非数组 → null', () => {
    expect(normalizeRubricItems([], 100)).toBeNull();
    expect(normalizeRubricItems(null, 100)).toBeNull();
  });
  it('分项合计超满分 → 缩放兜底（最后一项仍保证合计=满分）', () => {
    const r = normalizeRubricItems([{ item: 'a', maxScore: 40 }, { item: 'b', maxScore: 40 }, { item: 'c', maxScore: 40 }], 100);
    expect(r.length).toBe(3);
    expect(r.reduce((s, x) => s + x.maxScore, 0)).toBe(100);
  });
});

describe('normalizeRubricItems — automation_level 三分类归一化（Team B 2026-08-18）', () => {
  it('带 automation_level 的分项原样保留（deterministic/semi/subjective）', () => {
    const r = normalizeRubricItems([
      { item: '初始化', maxScore: 10, automation_level: 'deterministic' },
      { item: '组件复用', maxScore: 10, automation_level: 'semi' },
      { item: '界面美观', maxScore: 10, automation_level: 'subjective' },
    ], 30);
    expect(r).toEqual([
      { item: '初始化', maxScore: 10, automation_level: 'deterministic' },
      { item: '组件复用', maxScore: 10, automation_level: 'semi' },
      { item: '界面美观', maxScore: 10, automation_level: 'subjective' },
    ]);
  });

  it('旧数据无 automation_level → 按 deterministic 兜底（rubricItems 缓存兼容）', () => {
    const r = normalizeRubricItems([{ item: '登录功能', maxScore: 40 }], 40);
    expect(r[0]).toEqual({ item: '登录功能', maxScore: 40, automation_level: 'deterministic' });
  });

  it('非法 automation_level → deterministic 兜底', () => {
    const r = normalizeRubricItems([{ item: 'A', maxScore: 10, automation_level: 'magic' }], 10);
    expect(r[0].automation_level).toBe('deterministic');
  });

  it('合计差额调整最后一项后 automation_level 保留', () => {
    const r = normalizeRubricItems([
      { item: 'A', maxScore: 10, automation_level: 'subjective' },
      { item: 'B', maxScore: 20, automation_level: 'deterministic' },
    ], 100);
    expect(r[0].automation_level).toBe('subjective');
    expect(r[1].automation_level).toBe('deterministic');
    expect(r[1].maxScore).toBe(90);
    expect(r.reduce((s, x) => s + x.maxScore, 0)).toBe(100);
  });
});