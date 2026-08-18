/**
 * experiment-variance.test.js — Team C 单测（离线）：
 * 1) summarizeVariance 样本统计纯函数（空数组/单值/常规，断言 mean/std/min/max/range）；
 * 2) computeRuleVersionHash 评分规则版本冻结纯函数（activeVersionId / 规则 sha1 / 无规则兼容）。
 * 说明：computeRuleVersionHash 来自 projectGrading.js，该模块链路含 tree-sitter 原生模块
 * （ruleExecutor），主 jest 进程隔离此类测试（见 package.json test 脚本）——
 * 故用 jest.unstable_mockModule 打桩 ruleExecutor 后再动态 import，避免原生模块进主进程。
 */
import { jest } from '@jest/globals';
import { summarizeVariance } from '../../../scripts/experiment-variance.mjs';

describe('summarizeVariance — 样本统计（样本标准差）', () => {
  it('空数组 → mean/std=0，min/max/range=null（无样本约定）', () => {
    expect(summarizeVariance([])).toEqual({ mean: 0, std: 0, min: null, max: null, range: null });
  });

  it('单值 → mean=该值，std=0（n=1 样本方差无定义按 0），range=0', () => {
    expect(summarizeVariance([85])).toEqual({ mean: 85, std: 0, min: 85, max: 85, range: 0 });
  });

  it('常规样本 → mean 与样本标准差正确', () => {
    const r = summarizeVariance([87, 92, 76, 94, 83]);
    // mean = 432/5 = 86.4
    expect(r.mean).toBeCloseTo(86.4, 10);
    // 样本标准差 = sqrt(Σ(x-mean)²/(n-1)) = sqrt(209.2/4) = sqrt(52.3) ≈ 7.2319
    expect(r.std).toBeCloseTo(7.2319, 3);
    expect(r.min).toBe(76);
    expect(r.max).toBe(94);
    expect(r.range).toBe(18);
  });

  it('非数值项被过滤，不污染统计', () => {
    const r = summarizeVariance([80, null, 'x', 90, undefined, NaN]);
    expect(r.mean).toBe(85);
    expect(r.std).toBeCloseTo(7.0711, 3);
    expect(r.min).toBe(80);
    expect(r.max).toBe(90);
  });
});

// 冻结版本 hash：mock 掉 tree-sitter 依赖链（ruleExecutor），再动态 import projectGrading
jest.unstable_mockModule('../../../src/services/ruleExecutor.js', () => ({
  runRules: jest.fn(),
}));

const { computeRuleVersionHash } = await import('../../../src/services/projectGrading.js');

describe('computeRuleVersionHash — 评分规则版本冻结', () => {
  it('checkerMeta.activeVersionId 存在 → 返回 vN（与 checkerService versions 标签一致）', () => {
    expect(computeRuleVersionHash({ checkerMeta: { activeVersionId: 3 } })).toBe('v3');
    expect(computeRuleVersionHash({ checkerMeta: { activeVersionId: 0 } })).toBe('v0');
  });

  it('无 activeVersionId 但有规则 JSON → 规则 JSON sha1 前 12 位', () => {
    const rules = '{"max_score":100,"objective_items":[]}';
    const h = computeRuleVersionHash({ checkerMeta: null, checkerScript: rules });
    expect(h).toMatch(/^[0-9a-f]{12}$/);
    // 规则内容变更 → hash 变更（改规则不影响历史成绩的版本归属）
    expect(computeRuleVersionHash({ checkerScript: rules + ' ' })).not.toBe(h);
  });

  it('无规则 → null（LLM 直评遗留/旧记录兼容）', () => {
    expect(computeRuleVersionHash({ checkerScript: null })).toBeNull();
    expect(computeRuleVersionHash({ checkerScript: '   ' })).toBeNull();
    expect(computeRuleVersionHash(null)).toBeNull();
  });

  it('checkerMeta 存在但 activeVersionId 为空（默认 meta）→ 走规则 sha1', () => {
    const h = computeRuleVersionHash({
      checkerMeta: { rounds: 0, rules: null, versions: [], activeVersionId: null },
      checkerScript: '{"max_score":100,"objective_items":[{"id":"a1","item":"x","rule_type":"file_exists","params":{"path":"p"},"max_score":100}]}',
    });
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });
});
