/**
 * W0-C · admin 凭据夹具自检 + 默认口令字面量守卫（防回归）
 *
 * 锁定四件事：
 *   ① 环境变量优先，且**只读**（不触碰数据库）；
 *   ② 非本机库 fail-closed（绝不把测试管理员建到远端/生产库）；
 *   ③ 自建口令为随机值（仓库内不存在任何默认口令字面量）；
 *   ④ server/test/** 全树不得再出现被 C1 移除的默认超管口令字面量。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_TEST_ADMIN_USERNAME, ENV_KEYS, generateTestPassword,
  getEnvAdminCredentials, isLocalDatabaseUrl,
} from '../fixtures/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = path.resolve(__dirname, '..');
// 拼接构造：本文件自身不得出现该字面量（否则守卫会误报自己）
const REMOVED_DEFAULT_SECRET = 'admin' + '123';
// 运行期产物（.gitignore:17 已忽略；由 e2e/global.setup.js 每次重写，不属于仓库字面量）
const RUNTIME_ARTIFACTS = new Set(['.e2e-state.json']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs|json|ts)$/.test(entry.name) && !RUNTIME_ARTIFACTS.has(entry.name)) out.push(full);
  }
  return out;
}

describe('W0-C admin 夹具', () => {
  const saved = {
    user: process.env[ENV_KEYS.username],
    pass: process.env[ENV_KEYS.password],
    altUser: process.env[ENV_KEYS.altUsername],
    altPass: process.env[ENV_KEYS.altPassword],
  };

  beforeEach(() => {
    delete process.env[ENV_KEYS.username];
    delete process.env[ENV_KEYS.password];
    delete process.env[ENV_KEYS.altUsername];
    delete process.env[ENV_KEYS.altPassword];
  });

  afterAll(() => {
    for (const [key, envKey] of [[saved.user, ENV_KEYS.username], [saved.pass, ENV_KEYS.password],
      [saved.altUser, ENV_KEYS.altUsername], [saved.altPass, ENV_KEYS.altPassword]]) {
      if (key === undefined) delete process.env[envKey];
      else process.env[envKey] = key;
    }
  });

  it('未配置环境变量 ⇒ 不返回任何凭据（必须走自建分支，而非猜测默认口令）', () => {
    expect(getEnvAdminCredentials()).toBeNull();
  });

  it('配置 TEST_ADMIN_PASSWORD ⇒ 只读返回该凭据（用户名缺省 admin）', () => {
    process.env[ENV_KEYS.password] = 'env-only-pw';
    expect(getEnvAdminCredentials()).toEqual({ username: 'admin', password: 'env-only-pw', source: 'env' });
  });

  it('TEST_ADMIN_USERNAME 生效；兼容 BOOTSTRAP_ADMIN_* 命名', () => {
    process.env[ENV_KEYS.username] = 'sec_admin';
    process.env[ENV_KEYS.password] = 'env-only-pw';
    expect(getEnvAdminCredentials().username).toBe('sec_admin');

    delete process.env[ENV_KEYS.username];
    delete process.env[ENV_KEYS.password];
    process.env[ENV_KEYS.altUsername] = 'boot_admin';
    process.env[ENV_KEYS.altPassword] = 'boot-pw';
    expect(getEnvAdminCredentials()).toEqual({ username: 'boot_admin', password: 'boot-pw', source: 'env' });
  });

  it('只有密码、没有用户名 ⇒ 用户名回落 admin；只有用户名 ⇒ null（fail-closed）', () => {
    process.env[ENV_KEYS.password] = 'env-only-pw';
    expect(getEnvAdminCredentials().username).toBe('admin');

    delete process.env[ENV_KEYS.password];
    process.env[ENV_KEYS.username] = 'sec_admin';
    expect(getEnvAdminCredentials()).toBeNull();
  });

  it('isLocalDatabaseUrl：本机 true；远端/空/非法 false（fail-closed）', () => {
    expect(isLocalDatabaseUrl('mysql://u:p@localhost:3306/exam_system_test')).toBe(true);
    expect(isLocalDatabaseUrl('mysql://u:p@127.0.0.1:3306/exam_system_test')).toBe(true);
    expect(isLocalDatabaseUrl('mysql://u:p@db.internal:3306/exam_system')).toBe(false);
    expect(isLocalDatabaseUrl('mysql://u:p@10.0.0.7:3306/exam_system')).toBe(false);
    expect(isLocalDatabaseUrl('')).toBe(false);
    expect(isLocalDatabaseUrl('not-a-url')).toBe(false);
  });

  it('自建口令为随机强口令：长度≥16、含大小写/数字/符号，且两次不同', () => {
    const a = generateTestPassword();
    const b = generateTestPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/[0-9]/);
    expect(a).toMatch(/[^A-Za-z0-9]/);
    expect(a).not.toContain(REMOVED_DEFAULT_SECRET);
  });

  it('server/test/** 全树不再硬编码被 C1 移除的默认超管口令', () => {
    const offenders = walk(TEST_ROOT)
      .filter((f) => fs.readFileSync(f, 'utf8').includes(REMOVED_DEFAULT_SECRET))
      .map((f) => path.relative(TEST_ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('自建分支只在缺省用户名下使用（默认名不得撞 seed 清理前缀之外的既有账号）', () => {
    expect(DEFAULT_TEST_ADMIN_USERNAME).toBe('test_admin');
  });
});
