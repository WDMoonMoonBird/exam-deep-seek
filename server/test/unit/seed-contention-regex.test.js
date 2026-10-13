/**
 * seed-contention-regex.test.js —— R3-D8（t16 / C4 定位的「套件红但 0 例」根因）回归锁定：
 *   test/setup.js 的 SEED_CONTENTION_RE 必须覆盖「并发 seed 争用」的全部已知文案（含 Prisma 包装措辞），
 *   同时**不得**误判非争用错误（否则会掩盖真缺陷：把 SQL 语法错/连接断开当成争用反复重试）。
 *
 * 说明：本文件只断言正则的匹配集合，不触发任何 seed/DB 写操作（setup.js 已由 setupFiles 加载并缓存，
 *       此处 import 拿到同一模块实例 ⇒ 不会二次 seed）。
 */
import { SEED_CONTENTION_RE } from '../setup.js';

/** 应判定为「DB 争用」（⇒ 重试） */
const CONTENTION = [
  // Prisma 包装文案（★C4 实测：并发 seed 撞 users.username 唯一键时的真实文案）
  'Unique constraint failed on the fields: (' + String.fromCharCode(96) + 'username' + String.fromCharCode(96) + ')',
  'Foreign key constraint violated on the constraint: submissions_assignment_id_fkey',
  // MySQL 原生文案（Prisma 之外的直连路径）
  'Duplicate entry test_stu_01 for key users.username',
  'Cannot add or update a child row: a foreign key constraint fails',
  'ER_LOCK_DEADLOCK: Deadlock found when trying to get lock; try restarting transaction',
  'Lock wait timeout exceeded; try restarting transaction',
];

/** 不得判定为争用（⇒ 原样抛出，绝不掩盖真缺陷） */
const NOT_CONTENTION = [
  'Unknown column foo in field list',
  'Table exam_system_test.nope doesn t exist',
  'You have an error in your SQL syntax; check the manual',
  'connect ECONNREFUSED 127.0.0.1:3306',
  'Invalid prisma.user.update() invocation: Record to update not found.',
  '⛔ 拒绝执行：DATABASE_URL 库名不在测试库白名单内，疑似生产/重要库，已中止',
];

describe('SEED_CONTENTION_RE —— 只对明确争用签名重试', () => {
  it.each(CONTENTION)('争用文案命中：%s', (msg) => {
    expect(SEED_CONTENTION_RE.test(msg)).toBe(true);
  });

  it.each(NOT_CONTENTION)('非争用文案不命中：%s', (msg) => {
    expect(SEED_CONTENTION_RE.test(msg)).toBe(false);
  });
});
