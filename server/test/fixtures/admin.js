/**
 * server/test/fixtures/admin.js —— 管理员测试凭据统一夹具（W0-C，C1 修复的前置件）
 *
 * 背景：C1 修复后 server/src/app.js 不再在启动期 upsert 硬编码默认超管
 * （初始口令改读 BOOTSTRAP_ADMIN_PASSWORD，缺失则**不自动建超管**）。
 * 因此测试不能再假设「服务一启动就存在 admin/<默认口令>」。
 *
 * 本夹具是 **测试侧唯一的 admin 账号来源**，两级策略：
 *
 *   1) 环境变量优先（只读，绝不改库）：
 *        TEST_ADMIN_USERNAME / TEST_ADMIN_PASSWORD
 *        兼容：BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD
 *      命中即直接返回 ⇒ 云端/已有管理员口令保持不变（符合 AGENTS §7 C1 裁定）。
 *
 *   2) 缺省自建/复用专用测试管理员（仅限**本机库**，fail-closed）：
 *        用户名：TEST_ADMIN_USERNAME 或 DEFAULT_TEST_ADMIN_USERNAME
 *        口令  ：每次进程启动随机生成（bcrypt 落库），因此**仓库里不存在任何默认口令字面量**
 *      实现为幂等 upsert：不存在则建、存在则复用（并把口令对齐到本次随机值）。
 *      DATABASE_URL 指向非本机主机时**直接抛错**，防止误改生产账号。
 *
 * 用法（jest 集成测试 / 可 await 的脚本）：
 *   import { ensureAdminAccount } from '../fixtures/admin.js';
 *   const { username, password } = await ensureAdminAccount();
 *
 * 用法（不可写库的远端脚本，如 security-prod-test.js）：
 *   import { getEnvAdminCredentials } from '../fixtures/admin.js';
 *   const creds = getEnvAdminCredentials();   // 未配置时返回 null（调用方自行跳过并提示）
 *
 * 注意：HTTP 脚本（stress / setup-test-data）需与被测服务使用**同一个 DATABASE_URL**；
 * 未设置时本夹聚会尝试加载 server/.env。
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

/** 环境变量键名（env 优先，其次兼容 bootstrap 命名） */
export const ENV_KEYS = {
  username: 'TEST_ADMIN_USERNAME',
  password: 'TEST_ADMIN_PASSWORD',
  altUsername: 'BOOTSTRAP_ADMIN_USERNAME',
  altPassword: 'BOOTSTRAP_ADMIN_PASSWORD',
};

/** 自建测试管理员用户名（仅当未设置 TEST_ADMIN_USERNAME 时使用） */
export const DEFAULT_TEST_ADMIN_USERNAME = 'test_admin';

/** 进程内缓存键（jest --runInBand 同进程多文件共用一次 upsert） */
const CACHE_KEY = Symbol.for('w0c.adminFixture.v1');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '203.0.113.10']);

/**
 * 判断连接串是否指向本机库（自建/改密策略的前置条件，fail-closed）。
 * @param {string} [url] 默认取 process.env.DATABASE_URL
 * @returns {boolean} 可解析且主机为本机时 true；空值/非法/远端一律 false
 */
export function isLocalDatabaseUrl(url = process.env.DATABASE_URL) {
  if (!url) return false;
  try {
    const host = new URL(String(url)).hostname.replace(/^\[|\]$/g, '');
    return LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * 只读地取环境变量里的管理员凭据；未配置（或只配了一半）时返回 null。
 * @returns {{username: string, password: string, source: 'env'} | null}
 */
export function getEnvAdminCredentials() {
  const username = (process.env[ENV_KEYS.username] || process.env[ENV_KEYS.altUsername] || '').trim();
  const password = process.env[ENV_KEYS.password] || process.env[ENV_KEYS.altPassword] || '';
  if (!password) return null;
  return { username: username || 'admin', password, source: 'env' };
}

/**
 * 生成符合常见口令策略（长度 + 大小写 + 数字 + 符号）的随机测试口令。
 * 随机 ⇒ 仓库内不会有默认口令字面量被复用。
 * @returns {string}
 */
export function generateTestPassword() {
  return 'Ta' + crypto.randomBytes(12).toString('hex') + '#7';
}

/**
 * 确保存在一个可登录的测试超级管理员，返回其凭据。
 *
 * 顺序：① 环境变量 → 只读返回；② 本机库 → upsert 专用测试管理员（随机口令）。
 * @returns {Promise<{username: string, password: string, source: 'env'|'fixture', userId?: number}>}
 */
export async function ensureAdminAccount() {
  const cached = globalThis[CACHE_KEY];
  if (cached) return cached;

  const pending = (async () => {
    const envCreds = getEnvAdminCredentials();
    if (envCreds) return envCreds;

    // 未配置 DATABASE_URL 时尝试加载 server/.env（HTTP 脚本从仓库根运行时也要能连本机库）
    if (!process.env.DATABASE_URL) {
      try {
        const dotenv = await import('dotenv');
        dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
      } catch {
        /* 无 .env 时继续走下面的 fail-closed 判定 */
      }
    }

    if (!isLocalDatabaseUrl()) {
      const masked = String(process.env.DATABASE_URL || '(未设置)').replace(/(:\/\/[^:\/?#]+):[^@]*@/, '$1:***@');
      throw new Error(
        '测试 admin 夹具拒绝在非本机库上自建账号（fail-closed）：' + masked + '。'
        + '请显式设置 ' + ENV_KEYS.password + '（与既有管理员口令一致）后重跑。',
      );
    }

    const username = (process.env[ENV_KEYS.username] || DEFAULT_TEST_ADMIN_USERNAME).trim();
    const password = generateTestPassword();
    const { default: prisma } = await import('../../src/utils/prisma.js');

    await prisma.user.upsert({
      where: { username },
      update: {
        password: bcrypt.hashSync(password, 10),
        realName: '测试超级管理员',
        role: 'super_admin',
        deletedAt: null,
        // 固定为「过去」：避免 JWT iat（秒精度）与改密时刻同秒导致旧令牌判定为失效
        passwordChangedAt: new Date(Date.now() - 3600000),
      },
      create: {
        username,
        password: bcrypt.hashSync(password, 10),
        realName: '测试超级管理员',
        role: 'super_admin',
        passwordChangedAt: new Date(Date.now() - 3600000),
      },
      select: { id: true, role: true, deletedAt: true },
    });

    const admin = await prisma.user.findUnique({ where: { username }, select: { id: true, role: true, deletedAt: true } });
    if (!admin || admin.role !== 'super_admin' || admin.deletedAt) {
      throw new Error('测试 admin 夹具自检失败：' + username + ' 不是可用的 super_admin');
    }

    return { username, password, source: 'fixture', userId: admin.id };
  })();

  globalThis[CACHE_KEY] = pending;
  return pending;
}
