/**
 * W67（R2-B58）自助改密码策略：纯函数层单测（强度校验 + 原密码错误限速）。
 * 仅测策略函数本身（不碰数据库、不发请求）；API 层在 test/integration/w67-password-policy-api.test.js。
 */
import {
  PWD_MIN_LEN, PWD_FAIL_THRESHOLD, PWD_LOCK_MS,
  validateSelfServicePassword, noteOldPasswordFailure, lockRemainingMs, clearOldPasswordFailures, __resetPasswordGuard,
} from '../../src/controllers/authController.js';

describe('W67 强度校验（≥8 位 / 含字母与数字 / 不得与原密码相同）', () => {
  test('常量：8 位 / 5 次 / 15 分钟', () => {
    expect(PWD_MIN_LEN).toBe(8);
    expect(PWD_FAIL_THRESHOLD).toBe(5);
    expect(PWD_LOCK_MS).toBe(15 * 60 * 1000);
  });

  test('长度边界：7 位拒（含明确文案）、8 位过', () => {
    const short = validateSelfServicePassword('old-pwd-1', 'Ab1cdef');
    expect(short.ok).toBe(false);
    expect(short.reason).toBe('too_short');
    expect(short.message).toBe('新密码至少 8 位');
    expect(validateSelfServicePassword('old-pwd-1', 'Ab1cdefg').ok).toBe(true);
  });

  test('纯字母 / 纯数字均拒（须同时含字母与数字）', () => {
    expect(validateSelfServicePassword('x', 'Abcdefgh')).toMatchObject({ ok: false, reason: 'need_letter_digit', message: '新密码需同时包含字母和数字' });
    expect(validateSelfServicePassword('x', '12345678')).toMatchObject({ ok: false, reason: 'need_letter_digit' });
    expect(validateSelfServicePassword('x', 'Ab1cdefg').ok).toBe(true);
  });

  test('不得与原密码相同', () => {
    expect(validateSelfServicePassword('Ab1cdefg', 'Ab1cdefg')).toMatchObject({ ok: false, reason: 'same_as_old', message: '新密码不能与原密码相同' });
    expect(validateSelfServicePassword('Ab1cdefg', 'Ab1cdefh').ok).toBe(true);
  });

  test('缺省/非字符串/空值 ⇒ 按长度不足处理（不抛）', () => {
    expect(validateSelfServicePassword(undefined, undefined)).toMatchObject({ ok: false, reason: 'too_short' });
    expect(validateSelfServicePassword('', '')).toMatchObject({ ok: false, reason: 'too_short' });
    expect(validateSelfServicePassword('a1b2c3d4', null)).toMatchObject({ ok: false, reason: 'too_short' });
    expect(validateSelfServicePassword('a1b2c3d4', 12345678)).toMatchObject({ ok: false, reason: 'too_short' });
  });

  test('★强度校验是纯函数：反复调用不改变限速计数', () => {
    __resetPasswordGuard();
    const uid = 990001;
    for (let i = 0; i < 10; i += 1) validateSelfServicePassword('old-1', '123');
    expect(lockRemainingMs(uid)).toBe(0);
    expect(noteOldPasswordFailure(uid).fails).toBe(1);
  });
});

describe('W67 原密码错误限速（5 次 ⇒ 锁 15 分钟；成功清零；重启清零）', () => {
  test('4 次不锁、第 5 次锁并给出剩余时间', () => {
    __resetPasswordGuard();
    const uid = 990002;
    for (let i = 1; i <= 4; i += 1) {
      const st = noteOldPasswordFailure(uid);
      expect(st.locked).toBe(false);
      expect(st.fails).toBe(i);
      expect(lockRemainingMs(uid)).toBe(0);
    }
    const fifth = noteOldPasswordFailure(uid);
    expect(fifth.locked).toBe(true);
    expect(fifth.retryAfterMs).toBe(PWD_LOCK_MS);
    expect(lockRemainingMs(uid)).toBe(PWD_LOCK_MS);
  });

  test('锁定窗口到期 ⇒ 自动解锁（注入 now，不依赖真实等待）', () => {
    __resetPasswordGuard();
    const uid = 990003;
    const t0 = 1700000000000;
    for (let i = 0; i < PWD_FAIL_THRESHOLD; i += 1) noteOldPasswordFailure(uid, t0);
    expect(lockRemainingMs(uid, t0 + 1)).toBeGreaterThan(0);
    expect(lockRemainingMs(uid, t0 + PWD_LOCK_MS - 1)).toBe(1);
    expect(lockRemainingMs(uid, t0 + PWD_LOCK_MS + 1)).toBe(0);
  });

  test('成功一次即清零', () => {
    __resetPasswordGuard();
    const uid = 990004;
    noteOldPasswordFailure(uid); noteOldPasswordFailure(uid); noteOldPasswordFailure(uid);
    clearOldPasswordFailures(uid);
    expect(lockRemainingMs(uid)).toBe(0);
    expect(noteOldPasswordFailure(uid).fails).toBe(1);
  });

  test('重启即清零：__resetPasswordGuard 清空后无锁定（内存实现的取舍）', () => {
    const uid = 990005;
    for (let i = 0; i < PWD_FAIL_THRESHOLD; i += 1) noteOldPasswordFailure(uid);
    expect(lockRemainingMs(uid)).toBeGreaterThan(0);
    __resetPasswordGuard();
    expect(lockRemainingMs(uid)).toBe(0);
  });
});