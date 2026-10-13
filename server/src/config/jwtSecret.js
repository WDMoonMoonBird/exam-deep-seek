/**
 * jwtSecret.js —— R2-B60：JWT 密钥的**唯一解析点**（签发与校验共用；缺失/过短/弱值 ⇒ 直接抛错）。
 *
 * 背景：此前 `middleware/auth.js` 与 `controllers/authController.js` **各自**写 `process.env.JWT_SECRET || 'exam_system_fallback_secret'`
 *   ⇒ 环境变量缺失/拼错时会用**公开可知**的兜底值签发与校验 ⇒ 任何人都能伪造令牌。本模块消除该兜底：
 *   ①缺失/空 ⇒ 抛错（调用方在模块加载期调用 ⇒ **启动即失败**，不带病运行）；
 *   ②命中已知弱值（含旧兜底串） ⇒ 抛错（任何环境）；
 *   ③长度：生产（NODE_ENV=production）要求 ≥32 字符；非生产（本地/测试）放宽到 ≥16 并**打印醒目告警**（测试用例锁定该边界）；
 *   ④**从不打印密钥本身**（只打印长度与环境），也不把密钥写入日志/响应。
 *
 * 与 app.js 的关系：app.js 里原先那段「未配置则启动期生成随机密钥」的兜底**已删除**（R2-B69：改为零副作用
 *   `throw new Error('JWT_SECRET 未配置：拒绝启动')`，不再向 process.env 写任何值）。
 *   由于 ESM 先求值被导入的模块，本模块的启动期断言仍**先于** app.js 执行 ⇒ 缺密钥时进程直接退出（不会再用任何默认值）。
 */

export const MIN_SECRET_LEN = 32;       // 生产下限
export const MIN_SECRET_LEN_DEV = 16;   // 非生产下限（本地/测试）

// 已知弱值：命中即拒（含历史兜底串 —— 任何人可伪造）
export const KNOWN_WEAK_SECRETS = [
  'exam_system_fallback_secret', 'exam_system', 'secret', 'jwt_secret', 'jwtsecret',
  'changeme', 'change_me', 'password', 'passw0rd', 'test', 'dev', 'development', 'your_secret_here',
];

/**
 * 解析并校验 JWT 密钥（纯函数，env/warn 可注入 ⇒ 便于单测；**不缓存**）。
 * 成功返回密钥字符串；任何不合格情形都抛 Error（消息只含长度/环境，不含密钥本身）。
 */
export function resolveJwtSecret(env = process.env, { warn = console } = {}) {
  const raw = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET.trim() : '';
  if (!raw) {
    throw new Error('JWT_SECRET 未配置：拒绝启动。请在 server/.env 配置至少 ' + MIN_SECRET_LEN + ' 字符的随机密钥（不得使用任何默认/兜底值，否则任何人可伪造令牌）。');
  }
  if (KNOWN_WEAK_SECRETS.includes(raw.toLowerCase())) {
    throw new Error('JWT_SECRET 使用了已知弱值/默认兜底值（长度 ' + raw.length + '）：拒绝启动。请改为随机生成的强密钥。');
  }
  const isProd = env.NODE_ENV === 'production';
  const min = isProd ? MIN_SECRET_LEN : MIN_SECRET_LEN_DEV;
  if (raw.length < min) {
    throw new Error('JWT_SECRET 过短（长度 ' + raw.length + ' < ' + min + (isProd ? '，生产环境' : '，非生产环境下限') + '）：拒绝启动。建议使用 ≥' + MIN_SECRET_LEN + ' 字符的随机密钥。');
  }
  if (!isProd && raw.length < MIN_SECRET_LEN) {
    try {
      if (warn && typeof warn.warn === 'function') {
        warn.warn('[安全告警] JWT_SECRET 长度 ' + raw.length + ' < ' + MIN_SECRET_LEN + '（非生产环境放行，但不应用于线上）；请改为随机生成的 ≥' + MIN_SECRET_LEN + ' 字符密钥。');
      }
    } catch { /* 告警失败不影响启动 */ }
  }
  return raw;
}

let cached = null;

/** 进程内缓存（同一密钥贯穿签发与校验）；测试可用 __resetJwtSecretCache() 重置 */
export function getJwtSecret(env = process.env) {
  if (!cached) cached = resolveJwtSecret(env);
  return cached;
}

export function __resetJwtSecretCache() { cached = null; }

export default { MIN_SECRET_LEN, MIN_SECRET_LEN_DEV, KNOWN_WEAK_SECRETS, resolveJwtSecret, getJwtSecret, __resetJwtSecretCache };