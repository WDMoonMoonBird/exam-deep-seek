/**
 * R3-D1（t2）单元测试：计分口径 / 答案可见性 / 三开关题型默认值 + 迁移文件形状。
 *
 * 覆盖 US-B1（题型默认值 + 历史默认不变）、US-B4（取最高/取最后、教师分不被覆盖）、
 * US-B2（可见性开关）与「迁移只加列可回滚」。
 * 纯逻辑不触库；迁移断言只读文件（不执行任何 DDL）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  SCORE_POLICIES, DEFAULT_SCORE_POLICY, normalizeScorePolicy, resolveScorePolicy,
  pickMachineScore, pickCountedScore,
} from '../../../src/domain/services/scorePolicy.js';
import {
  ANSWER_VISIBILITIES, DEFAULT_ANSWER_VISIBILITY, normalizeAnswerVisibility,
  resolveAnswerVisibility, canSeeAnswerAndAnalysis,
} from '../../../src/domain/services/answerVisibility.js';
import { assignmentSwitchDefaults, resolveAssignmentSwitches } from '../../../src/domain/services/assignmentSwitches.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MIG = path.join(ROOT, 'prisma/migrations/20261014100000_r3_d1_assignment_switches');
/** 反引号（避免测试自身被转义规则干扰） */
const BT = String.fromCharCode(96);

describe('R3-D1 scorePolicy：取最高 / 取最后 / 未配置', () => {
  it('口径集合与默认值：仅 best|last，未配置 ⇒ last（既有行为）', () => {
    expect(SCORE_POLICIES).toEqual(['best', 'last']);
    expect(DEFAULT_SCORE_POLICY).toBe('last');
    expect(normalizeScorePolicy('best')).toBe('best');
    expect(normalizeScorePolicy('foo')).toBeNull();
    expect(resolveScorePolicy(null)).toBe('last');
    expect(resolveScorePolicy({ scorePolicy: null })).toBe('last');
    expect(resolveScorePolicy({ scorePolicy: 'bogus' })).toBe('last');
  });

  it('取最高：机器分 = bestScore（无 bestScore 的历史行回落 aiScore）', () => {
    expect(pickMachineScore({ scorePolicy: 'best', aiScore: 78, bestScore: 85 })).toBe(85);
    expect(pickMachineScore({ scorePolicy: 'best', aiScore: 78, bestScore: null })).toBe(78);
  });

  it('取最后：机器分 = 最新 aiScore（不回落 bestScore，保持既有口径）', () => {
    expect(pickMachineScore({ scorePolicy: 'last', aiScore: 78, bestScore: 85 })).toBe(78);
    expect(pickMachineScore({ scorePolicy: 'last', aiScore: null, bestScore: 85 })).toBeNull();
    expect(pickMachineScore({ aiScore: 78, bestScore: 85 })).toBe(78);
  });

  it('0 是合法分（不被当成空值）', () => {
    expect(pickMachineScore({ scorePolicy: 'best', aiScore: 70, bestScore: 0 })).toBe(0);
    expect(pickMachineScore({ scorePolicy: 'last', aiScore: 0, bestScore: 90 })).toBe(0);
  });

  it('US-B4 AC3：教师分 finalScore 不被机器分覆盖（任何口径下都是权威值）', () => {
    expect(pickCountedScore({ scorePolicy: 'best', finalScore: 90, aiScore: 78, bestScore: 85 })).toBe(90);
    expect(pickCountedScore({ scorePolicy: 'last', finalScore: 90, aiScore: 78, bestScore: 85 })).toBe(90);
    expect(pickCountedScore({ scorePolicy: 'best', finalScore: null, aiScore: 78, bestScore: 85 })).toBe(85);
  });
});

describe('R3-D1 answerVisibility：提交后立即 / 发布后可见', () => {
  it('默认与归一化：非法/未配置 ⇒ after_publish（安全默认 = 既有行为）', () => {
    expect(ANSWER_VISIBILITIES).toEqual(['immediate', 'after_publish']);
    expect(DEFAULT_ANSWER_VISIBILITY).toBe('after_publish');
    expect(resolveAnswerVisibility(undefined)).toBe('after_publish');
    expect(resolveAnswerVisibility({ answerVisibility: 'nope' })).toBe('after_publish');
    expect(normalizeAnswerVisibility('immediate')).toBe('immediate');
  });

  it('after_publish：未发布不下发答案；published 可见', () => {
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'after_publish', status: 'ai_graded' })).toBe(false);
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'after_publish', status: 'reviewed' })).toBe(false);
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'after_publish', status: 'published' })).toBe(true);
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'after_publish', status: 'submitted' })).toBe(false);
  });

  it('immediate：评分完成即可见，未出分仍不可见', () => {
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'immediate', status: 'ai_graded' })).toBe(true);
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'immediate', status: 'reviewed' })).toBe(true);
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'immediate', status: 'submitted' })).toBe(false);
  });

  it('R3-D4（US-B5）：不再有 mode/isPractice 后门 —— 未配置可见性一律仅发布后可见', () => {
    expect(canSeeAnswerAndAnalysis({ status: 'ai_graded' })).toBe(false);
    // isPractice 参数已失效（调用方若仍传，也不改变口径）
    expect(canSeeAnswerAndAnalysis({ status: 'ai_graded', isPractice: true })).toBe(false);
    expect(canSeeAnswerAndAnalysis({ status: 'published', isPractice: true })).toBe(true);
    expect(canSeeAnswerAndAnalysis({ status: 'submitted', isPractice: true })).toBe(false);
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'after_publish', status: 'reviewed', isPractice: true })).toBe(false);
    // 练习等价形态要用开关复现（不限次 + 提交后可见答案），而不是靠 mode：
    expect(canSeeAnswerAndAnalysis({ answerVisibility: 'immediate', status: 'ai_graded' })).toBe(true);
  });
});

describe('R3-D1 三开关题型默认值（D2）', () => {
  it('编程题：允许重交 + 不限次 + 取最高 + 提交后可见', () => {
    expect(assignmentSwitchDefaults({ hasProject: false }))
      .toEqual({ allowResubmit: true, maxAttempts: null, scorePolicy: 'best', answerVisibility: 'immediate' });
  });

  it('实训题：1 次 + 取最后 + 发布后可见', () => {
    expect(assignmentSwitchDefaults({ hasProject: true }))
      .toEqual({ allowResubmit: true, maxAttempts: 1, scorePolicy: 'last', answerVisibility: 'after_publish' });
  });

  it('教师显式传值优先于题型默认值', () => {
    expect(resolveAssignmentSwitches({ hasProject: true, allowResubmit: false, maxAttempts: 3, scorePolicy: 'best', answerVisibility: 'immediate' }))
      .toEqual({ allowResubmit: false, maxAttempts: 3, scorePolicy: 'best', answerVisibility: 'immediate' });
  });

  it('未传 ⇒ 题型默认；null/非正数/非法值 ⇒ 不限次；非法口径 ⇒ 题型默认', () => {
    expect(resolveAssignmentSwitches({ hasProject: true }).maxAttempts).toBe(1);
    expect(resolveAssignmentSwitches({ hasProject: true, maxAttempts: null }).maxAttempts).toBeNull();
    expect(resolveAssignmentSwitches({ hasProject: true, maxAttempts: 0 }).maxAttempts).toBeNull();
    expect(resolveAssignmentSwitches({ hasProject: true, maxAttempts: -2 }).maxAttempts).toBeNull();
    expect(resolveAssignmentSwitches({ hasProject: true, maxAttempts: 'abc' }).maxAttempts).toBeNull();
    expect(resolveAssignmentSwitches({ hasProject: false, maxAttempts: '2' }).maxAttempts).toBe(2);
    expect(resolveAssignmentSwitches({ hasProject: false, scorePolicy: 'zzz' }).scorePolicy).toBe('best');
    expect(resolveAssignmentSwitches({ hasProject: true, answerVisibility: 'zzz' }).answerVisibility).toBe('after_publish');
  });
});

describe('R3-D1 迁移形状：只加列 + 可回滚（未执行生产迁移）', () => {
  const read = (f) => fs.readFileSync(path.join(MIG, f), 'utf8');
  /** 去掉 -- 注释行后剩下的可执行 DDL（注释里出现 DROP 字样不算 DDL） */
  const ddlOf = (sql) => sql.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('--')).join(String.fromCharCode(10));
  const migrationDdl = ddlOf(read('migration.sql'));
  const rollbackDdl = ddlOf(read('rollback.sql'));

  it('migration.sql 仅两条 ADD COLUMN（nullable + 默认值 = 历史行为）', () => {
    expect(migrationDdl.match(/ADD COLUMN/g) || []).toHaveLength(2);
    expect(migrationDdl).toContain(BT + 'score_policy' + BT + " VARCHAR(16) NULL DEFAULT 'last'");
    expect(migrationDdl).toContain(BT + 'answer_visibility' + BT + " VARCHAR(16) NULL DEFAULT 'after_publish'");
    // 只加列：不得出现 DROP / MODIFY / CHANGE / TRUNCATE / DELETE / RENAME / UPDATE / INSERT 等破坏性 DDL
    expect(migrationDdl).not.toMatch(/DROP\s|MODIFY\s|CHANGE\s|TRUNCATE\s|DELETE\s|RENAME|UPDATE\s|INSERT\s/i);
  });

  it('rollback.sql 精确回滚这两列（DROP COLUMN × 2）', () => {
    expect(rollbackDdl.match(/DROP COLUMN/g) || []).toHaveLength(2);
    expect(rollbackDdl).toContain(BT + 'score_policy' + BT);
    expect(rollbackDdl).toContain(BT + 'answer_visibility' + BT);
    expect(rollbackDdl).not.toMatch(/ADD\s|MODIFY\s|UPDATE\s|DELETE\s/i);
  });

  it('schema.prisma 与迁移一致：两列可空且带默认值', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('scorePolicy      String?  @default("last") @map("score_policy")');
    expect(schema).toContain('answerVisibility String?  @default("after_publish") @map("answer_visibility")');
  });
});
