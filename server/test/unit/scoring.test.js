import { resolveSubQuestionScores } from '../../src/utils/scoring.js';

describe('resolveSubQuestionScores', () => {
  // S1: 3 小题全不填分，满分 100 — 均分
  it('S1: 3小题全不填分，满分100 → 均分 [33,33,34]', () => {
    const input = [{ score: null }, { score: null }, { score: null }];
    const result = resolveSubQuestionScores(input, 100);
    expect(result).toHaveLength(3);
    expect(result[0].score).toBe(33);
    expect(result[1].score).toBe(33);
    expect(result[2].score).toBe(34);
    // 总和应等于满分
    const sum = result.reduce((s, sq) => s + sq.score, 0);
    expect(sum).toBe(100);
  });

  // S2: 4 小题全不填分，满分 100 — 均分
  it('S2: 4小题全不填分，满分100 → 均分 [25,25,25,25]', () => {
    const input = [
      { score: null }, { score: null }, { score: null }, { score: null },
    ];
    const result = resolveSubQuestionScores(input, 100);
    expect(result).toHaveLength(4);
    expect(result[0].score).toBe(25);
    expect(result[1].score).toBe(25);
    expect(result[2].score).toBe(25);
    expect(result[3].score).toBe(25);
    const sum = result.reduce((s, sq) => s + sq.score, 0);
    expect(sum).toBe(100);
  });

  // S3: 全填分且总和正确 → 原值返回
  it('S3: 全填分且总和正确 → 原值返回', () => {
    const input = [
      { score: 30, title: 'a' },
      { score: 30, title: 'b' },
      { score: 40, title: 'c' },
    ];
    const result = resolveSubQuestionScores(input, 100);
    expect(result[0].score).toBe(30);
    expect(result[1].score).toBe(30);
    expect(result[2].score).toBe(40);
    expect(result[0].title).toBe('a'); // 保留原有字段
  });

  // S4: 全填分但总和不等于满分 → throw
  it('S4: 全填分但总和不等于满分 → throw Error', () => {
    const input = [
      { score: 20 }, { score: 20 }, { score: 20 },
    ];
    expect(() => resolveSubQuestionScores(input, 100)).toThrow('小题分值总和(60)不等于总分(100)');
  });

  // S5: 部分填分（未填默认 0）→ throw
  it('S5: 部分填分（未填默认0），总和≠满分 → throw Error', () => {
    const input = [
      { score: 30 }, { score: null }, { score: null },
    ];
    // 30 + 0 + 0 = 30 ≠ 100
    expect(() => resolveSubQuestionScores(input, 100)).toThrow('小题分值总和(30)不等于总分(100)');
  });

  // S6: 2 小题不填分，满分 50 → 均分
  it('S6: 2小题不填分，满分50 → 均分 [25,25]', () => {
    const input = [{ score: null }, { score: null }];
    const result = resolveSubQuestionScores(input, 50);
    expect(result[0].score).toBe(25);
    expect(result[1].score).toBe(25);
    const sum = result.reduce((s, sq) => s + sq.score, 0);
    expect(sum).toBe(50);
  });

  // S7: 1 小题不填分，满分 100 → 均分给唯一小题
  it('S7: 1小题不填分，满分100 → [{score:100}]', () => {
    const input = [{ score: null }];
    const result = resolveSubQuestionScores(input, 100);
    expect(result[0].score).toBe(100);
    const sum = result.reduce((s, sq) => s + sq.score, 0);
    expect(sum).toBe(100);
  });

  // 附加：0 分边界
  it('附加: 全不填分，满分0 → 所有小题0分', () => {
    const input = [{ score: null }, { score: null }];
    const result = resolveSubQuestionScores(input, 0);
    expect(result[0].score).toBe(0);
    expect(result[1].score).toBe(0);
  });
});
