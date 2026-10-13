/**
 * W68（R2-B60）JWT 密钥快速失败：缺失/空/弱值/过短 ⇒ 抛错；生产不允许放宽；告警不泄漏密钥。
 */
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import {
  MIN_SECRET_LEN, MIN_SECRET_LEN_DEV, KNOWN_WEAK_SECRETS,
  resolveJwtSecret, getJwtSecret, __resetJwtSecretCache,
} from '../../src/config/jwtSecret.js';

const ok32 = 'Zx9'.repeat(11);              // 33 字符（≥32）
const dev27 = 'dev-secret-1234567890abcde'; // 27 字符（≥16 且 <32）

describe('W68 密钥解析：缺失/空/弱值 ⇒ 抛错', () => {
  test('常量与弱值清单（含历史兜底串）', () => {
    expect(MIN_SECRET_LEN).toBe(32);
    expect(MIN_SECRET_LEN_DEV).toBe(16);
    expect(KNOWN_WEAK_SECRETS).toContain('exam_system_fallback_secret');
  });

  test('缺失 / 空 / 纯空白 ⇒ 抛错且提示配置', () => {
    for (const env of [{}, { JWT_SECRET: '' }, { JWT_SECRET: '   ' }, { JWT_SECRET: 123 }]) {
      expect(() => resolveJwtSecret(env, { warn: { warn() {} } })).toThrow(/JWT_SECRET/);
    }
    expect(() => resolveJwtSecret({}, { warn: { warn() {} } })).toThrow(/未配置/);
  });

  test('历史兜底值/常见弱值 ⇒ 任何环境都拒绝（含 production）', () => {
    for (const weak of ['exam_system_fallback_secret', 'secret', 'CHANGEME']) {
      expect(() => resolveJwtSecret({ JWT_SECRET: weak }, { warn: { warn() {} } })).toThrow(/弱值|默认/);
      expect(() => resolveJwtSecret({ JWT_SECRET: weak, NODE_ENV: 'production' }, { warn: { warn() {} } })).toThrow(/弱值|默认/);
    }
  });

  test('短密钥边界：非生产 <16 拒、16~31 放行但**必须告警**；生产 <32 一律拒（生产不放宽）', () => {
    expect(() => resolveJwtSecret({ JWT_SECRET: 'a'.repeat(MIN_SECRET_LEN_DEV - 1) }, { warn: { warn() {} } })).toThrow(/过短/);
    const warns = [];
    const devOk = resolveJwtSecret({ JWT_SECRET: dev27 }, { warn: { warn: (m) => warns.push(m) } });
    expect(devOk).toBe(dev27);
    expect(warns.length).toBe(1);
    expect(warns[0]).toMatch(/安全告警/);
    expect(warns[0]).toMatch(/32/);
    expect(warns[0]).not.toContain(dev27);                     // ★告警不得泄漏密钥
    expect(() => resolveJwtSecret({ JWT_SECRET: dev27, NODE_ENV: 'production' }, { warn: { warn() {} } })).toThrow(/过短/);
  });

  test('≥32 ⇒ 通过且无告警；抛错消息不含密钥本身', () => {
    const warns = [];
    expect(resolveJwtSecret({ JWT_SECRET: ok32 }, { warn: { warn: (m) => warns.push(m) } })).toBe(ok32);
    expect(warns.length).toBe(0);
    try { resolveJwtSecret({ JWT_SECRET: 'x'.repeat(8) }, { warn: { warn() {} } }); } catch (e) {
      expect(e.message).not.toContain('xxxxxxxx');
    }
  });

  test('getJwtSecret 进程内缓存同一值（签发与校验拿到同一密钥）；重置钩子有效', () => {
    __resetJwtSecretCache();
    const a = getJwtSecret({ JWT_SECRET: ok32 });
    const b = getJwtSecret({ JWT_SECRET: 'other-value-should-be-ignored-abcdef' });
    expect(a).toBe(ok32);
    expect(b).toBe(ok32);
    __resetJwtSecretCache();
  });

  test('★签发的令牌能用同一密钥校验通过（签发/校验共用一处解析）', () => {
    const secret = resolveJwtSecret({ JWT_SECRET: ok32 }, { warn: { warn() {} } });
    const token = jwt.sign({ id: 1 }, secret, { expiresIn: '1m' });
    expect(jwt.verify(token, secret).id).toBe(1);
    expect(() => jwt.verify(token, 'another-secret-1234567890abcdefgh')).toThrow();
  });
});

describe('W68 仓库静态断言：不再存在硬编码兜底', () => {
  test('server/src/** 无 `JWT_SECRET ||` 兜底写法；历史兜底串只出现在 config/jwtSecret.js 的弱值清单里', () => {
    const root = path.resolve(process.cwd(), 'src');
    const files = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    };
    walk(root);
    // ★先剥注释再扫：注释里引用旧写法不算违规（违规指的是**可执行代码**里的兜底）
    const codeOf = (p) => fs.readFileSync(p, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const fallback = files.filter((p) => /process\.env\.JWT_SECRET\s*\|\|/.test(codeOf(p)));
    expect(fallback).toEqual([]);
    const weakHits = files.filter((p) => codeOf(p).includes('exam_system_fallback_secret'));
    expect(weakHits.map((p) => path.relative(root, p))).toEqual(['config/jwtSecret.js']);
    const authSrc = fs.readFileSync(path.join(root, 'middleware', 'auth.js'), 'utf8');
    const loginSrc = fs.readFileSync(path.join(root, 'controllers', 'authController.js'), 'utf8');
    expect(authSrc).toContain('getJwtSecret');
    expect(loginSrc).toContain('getJwtSecret');
  });
});