/**
 * r13-redact-log-line.test.js — R13 redactLogLine 专用单测（含 13 位 epoch 收窄语义）
 * 依据：TICKETS/R3-R13.md §3 + A batch2/batch3 复核 P2-R13-a 二轮收敛：
 *   ≥11 位长数字**一律**掩码（取消「首位必须 1」限制），仅 13 位 epoch（首位 1 且 ∈ [1.5e12, 2.1e12]）保留。
 */
import { redactLogLine } from '../../src/controllers/adminController.js';

describe('R13 · 敏感键多值全脱敏（token/password/Authorization）', () => {
  it('同一行两个 token= 都替换，且不只处理首处', () => {
    const out = redactLogLine('请求失败 token=aaa token=bbb 结束');
    expect(out).not.toContain('aaa');
    expect(out).not.toContain('bbb');
    expect((out.match(/<redacted>/g) || []).length).toBe(2);
  });

  it('query 形式 password=x&password=y ⇒ 两段都替换且保留 & 分隔', () => {
    const out = redactLogLine('body password=x&password=y&other=1');
    expect(out).not.toMatch(/password=x/);
    expect(out).not.toMatch(/password=y/);
    expect((out.match(/<redacted>/g) || []).length).toBe(2);
  });

  it('Authorization: Bearer <credential> ⇒ 掩码真正凭据（不是只掩到 Bearer）', () => {
    const out = redactLogLine('Authorization: Bearer abc123def');
    expect(out).not.toContain('abc123def');
    expect(out).toContain('Bearer <redacted>');
  });

  it('正常日志文本不被误伤', () => {
    const line = '用户 test_teacher 登录成功，耗时 120ms';
    expect(redactLogLine(line)).toBe(line);
  });
});

describe('R13 · 数字掩码（≥11 位一律 3+****+后4；仅 13 位 epoch 保留 —— P2-R13-a 二轮收敛）', () => {
  it('11 位数字（任意首位）掩码；多段同号都掩码', () => {
    expect(redactLogLine('手机 13800000000')).toBe('手机 138****0000');
    expect(redactLogLine('13800000000 13900000000')).toBe('138****0000 139****0000');
    expect(redactLogLine('order 29999999999')).toBe('order 299****9999');
  });
  it('12 位 / 18 位长数字（任意首位）一律掩码（旧「首位必须 1」限制已取消）', () => {
    expect(redactLogLine('id=876543210987')).toBe('id=876****0987');
    expect(redactLogLine('id=987654321098765432')).toBe('id=987****5432');
    expect(redactLogLine('id=123456789012')).toBe('id=123****9012');
  });
  it('13 位 epoch 毫秒（首位 1 且 1.5e12–2.1e12）保留：日志时间线可用', () => {
    expect(redactLogLine('ts=1700000000000')).toBe('ts=1700000000000');
    expect(redactLogLine('ts=1999999999999')).toBe('ts=1999999999999');
  });
  it('非 epoch 的 13 位（首位非 1，或越出 epoch 区间）照常掩码', () => {
    expect(redactLogLine('id=9999999999999')).toBe('id=999****9999');
    expect(redactLogLine('id=1400000000000')).toBe('id=140****0000');
    expect(redactLogLine('id=2100000000000')).toBe('id=210****0000');
    expect(redactLogLine('id=2100000000001')).toBe('id=210****0001');
  });
  it('10 位及以下短数字不误伤（端口/状态码/耗时）', () => {
    expect(redactLogLine('耗时 1234567ms')).toBe('耗时 1234567ms');
    expect(redactLogLine('127.0.0.1:3000 status=404')).toBe('127.0.0.1:3000 status=404');
  });
});
