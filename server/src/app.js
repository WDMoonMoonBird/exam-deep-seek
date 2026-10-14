import 'dotenv/config';
import express from 'express';
import http from 'http';
import crypto from 'crypto';   // ★C2：/api/internal/graded 密钥恒定时间比较
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';   // ★R2-B61（P1-6）：错误页存在性检查
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import prisma from './utils/prisma.js';
import { initSocket, notifyGraded } from './infrastructure/notifier/socket-server.js';
import { compose } from './infrastructure/bootstrap/compose.js';

import authRoutes from './routes/auth.js';
import { loginRateLimitIdentity } from './controllers/authController.js';   // ★F-1：与登录侧共用的身份判定（唯一实现）
import adminRoutes from './routes/admin.js';
import teacherRoutes from './routes/teacher.js';
import studentRoutes from './routes/student.js';
import projectRoutes from './routes/projects.js';
import auth from './middleware/auth.js';
import requireRole from './middleware/role.js';
import projectAssetGuard from './middleware/projectAssetGuard.js';
import { cspMiddleware } from './middleware/csp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ★H5：信任 1 层反向代理（nginx）⇒ req.ip 取 X-Forwarded-For 中的真实客户端 IP；
//   不设置时 Express 取直连地址（网关后恒为回环）⇒ 限流按「同一个 nginx」计数，形同虚设。
//   可用 TRUST_PROXY 收窄：纯数字 = 跳数；loopback / false / 具体 IP 原样交给 Express 解析。
app.set('trust proxy', process.env.TRUST_PROXY
  ? (/^\d+$/.test(process.env.TRUST_PROXY) ? +process.env.TRUST_PROXY : process.env.TRUST_PROXY)
  : 1);

// ---- 组合根：依赖装配集中在 infrastructure/bootstrap/compose.js，结果挂 app.locals ----
Object.assign(app.locals, compose({ prisma, logger }));

// ★R2-B69（WAVE4）：**删除**历史上「未配置 JWT_SECRET 则启动期生成随机密钥」的兜底段。
//   它已由 config/jwtSecret.js 的启动期断言取代且**不可达**（C47 实测）：ESM 先求值被导入模块，
//   middleware/auth.js 在模块加载期调用 getJwtSecret() ⇒ 缺/弱/短密钥当场抛错，进程直接退出，
//   永远不会走到这里生成随机值。删除后仍保证「缺密钥 ⇒ 快速失败」，且**不再写入 process.env**（零副作用）。
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 未配置：拒绝启动（不再生成随机密钥；请在 server/.env 配置 ≥32 字符随机密钥）');
}

// 关键配置校验
if (!process.env.DEEPSEEK_API_KEY) logger.warn('DEEPSEEK_API_KEY 未配置，AI 评分将不可用');

// 安全中间件
// 其余安全头交给 helmet；CSP 单独由 middleware/csp.js 承担（CSP_MODE=off|report-only|enforce，默认 report-only）
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cspMiddleware());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [/^http:\/\/localhost:\d+$/],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// 登录失败限流（防暴力破解）—— 逻辑已迁移至 InMemoryRateLimiter（RateLimiterPort），经 app.locals.rateLimiter 取用
// ★H5：账号 + IP 维度 —— 只按 IP 时，同一出口（NAT/网关）后的攻击者刷满即锁死所有用户；
//   只按账号时，攻击者可换 IP 无限猜。任一维命中即拦；**成功登录清账号维度**，IP 维度保持"仅失败累积"。
// ★N11（H5 追加）：账号维度**三键并存** —— `ip:<ip>` / `acct:<username>@<schoolCode>` / 全局 `acct#global:<username>`。
//   原因：带 schoolCode 的键可被轮换（每换一个 schoolCode = 一批新键）从而绕开账号维度；全局键与 schoolCode 解耦，堵住该面。
// ★t24（撞键消歧）：全局键用 **`acct#global:` 命名空间** —— 因 username 自身可含 `@`（学生名形如 `10001@4145013830`），
//   旧的 `acct:<username>` 会与逐校键 `acct:<u>@<code>` 相撞（如 `u@a` 的全局键 == `u`+code `a` 的逐校键）⇒ 两账号共用一把计数（过聚合）。
//   `#` 不在白名单字符集 `[A-Za-z0-9_.@-]` / `[A-Za-z0-9_-]` 内 ⇒ 结构上不可能再撞。逐校键形态保持不变。
app.use('/api/auth/login', async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // ★F-1（A 复现的类型混淆）：账号键必须与 authController.login 的账号解析**同源** —— 直接复用登录侧
  //   导出的同一判定函数 loginRateLimitIdentity（String 强转 + NFKC + trim + toLowerCase + 白名单）。
  //   通过白名单 ⇒ 该输入可能定位到账号 ⇒ 记账号键；不通过 ⇒ 不产生账号键（它进不了查库与口令比对）。
  const identity = loginRateLimitIdentity(req.body);
  const ipKey = `ip:${ip}`;
  // 账号维度键与 authController 的 lookupUsername 同构（username[@schoolCode]）；白名单外输入不产生账号键
  const acctKey = identity ? `acct:${identity.username}@${identity.schoolCode}` : null;
  // ★N11/t24：与 schoolCode 解耦的全局账号键（`acct#global:` 命名空间 ⇒ 不与逐校键/username 内容撞键）
  const userKey = identity ? `acct#global:${identity.username}` : null;
  if (await app.locals.rateLimiter.isBlocked(ipKey)
    || (acctKey && await app.locals.rateLimiter.isBlocked(acctKey))
    || (userKey && await app.locals.rateLimiter.isBlocked(userKey))) {
    return res.status(429).json({ code: 1003, message: '登录失败次数过多，请 5 分钟后再试', data: null });
  }
  // 捕获响应，判断登录是否成功
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode === 200 && body?.code === 0) {
      // ★N11：成功登录清**两条账号键**（本 schoolCode 键 + 全局键）；IP 键保持"仅失败累积"
      if (acctKey) app.locals.rateLimiter.recordSuccess(acctKey);
      if (userKey) app.locals.rateLimiter.recordSuccess(userKey);
    } else if (res.statusCode === 400 || body?.code === 1001) {
      app.locals.rateLimiter.recordFailure(ipKey);
      if (acctKey) app.locals.rateLimiter.recordFailure(acctKey);
      if (userKey) app.locals.rateLimiter.recordFailure(userKey);   // ★N11：失败三键齐记
    }
    return originalJson(body);
  };
  next();
});
// 定期清理过期记录
setInterval(() => app.locals.rateLimiter.cleanup(), 600000);

// 请求日志
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, '→');
  next();
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'running' } });
});

// Worker 评分完成回调（内部用，需要共享密钥）
// ★C2：**无字面量兜底** —— 未配置即拒绝启动（与 JWT_SECRET 断言同风格）；
//   原「INTERNAL_SECRET || 硬编码默认值」让密钥随源码公开，且该端点经 /exam/api/ 公网可达 ⇒ 等同无鉴权。
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  throw new Error('INTERNAL_SECRET 未配置：拒绝启动（不再回落到硬编码默认值；请在 server/.env 配置随机密钥）');
}

/**
 * ★C2：内部回调来源白名单 —— 仅回环地址，或 INTERNAL_ALLOWED_IPS 显式列出的可信代理。
 *   判定用**直连对端地址**（socket.remoteAddress）而非 req.ip：后者受 trust proxy 影响，
 *   会变成 X-Forwarded-For 里的客户端 IP（可伪造），不能作为来源凭据。
 */
function isTrustedInternalSource(req) {
  const addr = (req.socket && req.socket.remoteAddress) || '';
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') return true;
  const allow = (process.env.INTERNAL_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  return allow.includes(addr);
}

app.post('/api/internal/graded', (req, res) => {
  if (!isTrustedInternalSource(req)) {
    return res.status(403).json({ code: 1003, message: '禁止访问', data: null });
  }
  const authHeader = req.headers.authorization;
  const provided = Buffer.from(authHeader || '');
  const expected = Buffer.from(`Bearer ${INTERNAL_SECRET}`);
  // 长度不等先拒（timingSafeEqual 要求等长）；等长时恒定时间比较，杜绝逐字节计时侧信道
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(403).json({ code: 1003, message: '禁止访问', data: null });
  }
  const { schoolId, ...data } = req.body;
  notifyGraded(schoolId, data);
  res.json({ code: 0 });
});

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/teacher/projects', auth, requireRole('teacher'), projectRoutes);
app.use('/api/student', studentRoutes);

// 实训资产（标准答案 / 学生提交 / 项目工作区）禁止匿名静态访问，
// 必须注册在 express.static 之前，改走带鉴权的 API 通道。
app.use(projectAssetGuard);

// 生产环境：服务前端静态文件
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '../../client/dist');
  app.use(express.static(distDir));
  // SPA fallback（Express 5 兼容）
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ★R2-B61（P0-3）：/api 未命中 ⇒ 统一 JSON 404。
//   位置：**所有路由之后、错误中间件之前**；nginx 将 /exam/api/* 前缀改写为 /api/* 后，公网路径同样命中这里
//   （此前无该中间件 ⇒ Express 默认 HTML 404「Cannot GET /api/xxx」——这正是公网看到 HTML 的原因）。
app.use('/api', (_req, res) => res.status(404).json({ code: 1404, message: '接口不存在', data: null }));

/**
 * ★R2-B61（P1-6）：统一错误中间件 —— 按 Accept 分流（json / html）。
 *   HTML 请求 ⇒ 尝试 sendFile(<errorPagesDir>/<status>.html)；**文件（或目录）不存在 ⇒ 回落 JSON**，绝不再抛、状态码不变；
 *   其余（含通配 Accept 或不带 Accept）⇒ 保持既有 JSON 契约 { code, message, data } 不变。
 *   导出为工厂（可注入 errorPagesDir/logger）⇒ 便于单测「HTML 分支」「不存在回落」两类路径。
 */
export function makeErrorMiddleware({ errorPagesDir = path.join(__dirname, '../../client/public/error-pages'), log = logger } = {}) {
  return (err, req, res, _next) => {
    const status = Number((err && err.status) || (err && err.statusCode)) || 500;
    try { log.error({ err }, '服务器内部错误'); } catch { /* 日志失败不得影响响应 */ }
    const wants = typeof req.accepts === 'function' ? req.accepts(['html', 'json']) : 'json';
    if (wants === 'html') {
      const file = path.join(errorPagesDir, String(status) + '.html');
      try { if (fs.existsSync(file)) return res.status(status).sendFile(file); } catch { /* 回落 JSON */ }
    }
    const body = status === 500
      ? { code: 2001, message: '服务器内部错误', data: null }
      : { code: 1404, message: '请求处理失败', data: null };
    return res.status(status).json(body);
  };
}

// 统一错误处理（Accept 分流见 makeErrorMiddleware）
app.use(makeErrorMiddleware());

// 启动服务
async function start() {
  // 迁移明文密码 → bcrypt
  const plainUsers = await prisma.user.findMany({
    where: { password: { not: { startsWith: '$2' } } },
  });
  for (const u of plainUsers) {
    try {
      await prisma.user.update({
        where: { id: u.id },
        data: { password: bcrypt.hashSync(u.password, 10) },
      });
    } catch (err) {
      // ★R3-D8（t16）：并发下该用户可能已被删除（测试库 seed/清理并行；生产亦有极小概率）⇒ P2025。
      //   明文迁移是**尽力而为**的启动期运维动作，单个用户消失不应阻断服务启动
      //   （否则 start() reject ⇒ process.exit(1)，表现为「整套件红但 0 例」的假红，见 t16/D8 报告）。
      //   其它错误（连接断开 / 权限 / 语法等）仍原样抛出，不掩盖真缺陷。
      if (!err || err.code !== 'P2025') throw err;
      logger.warn({ userId: u.id, username: u.username }, '启动期明文密码迁移跳过：该用户已不存在');
    }
  }
  if (plainUsers.length > 0) logger.info({ count: plainUsers.length }, '已迁移明文密码 → bcrypt');

  // ★C1：**删除**启动期「硬编码口令 upsert 超管」——仓库内不再保留任何默认特权凭据。
  //   现行口径：仅当 BOOTSTRAP_ADMIN_PASSWORD 已配置**且** admin 账号不存在时才建号（一次性引导）；
  //   已存在的账号一律**不 update**（不重置/不覆盖任何现存账号的口令，含云端管理员）。
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!bootstrapPassword) {
    logger.warn('BOOTSTRAP_ADMIN_PASSWORD 未配置：跳过超管引导建号（不创建、也不修改任何账号）');
  } else {
    const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
    if (existingAdmin) {
      logger.info({ adminId: existingAdmin.id }, '超管账号已存在，跳过引导建号（不改动其口令）');
    } else {
      const admin = await prisma.user.create({
        data: { username: 'admin', password: bcrypt.hashSync(bootstrapPassword, 10), realName: '超级管理员', role: 'super_admin' },
        select: { id: true },
      });
      logger.info({ adminId: admin.id }, '超级管理员账号已按 BOOTSTRAP_ADMIN_PASSWORD 创建（一次性引导）');
    }
  }

  const server = http.createServer(app);
  initSocket(server);
  // ★H11：**只绑回环** —— 公网流量必须经 nginx 网关收敛（TLS/HSTS/CSP/限流/静态资源都在网关侧），
  //   直连 203.0.113.10 会绕过网关的全部加固，也让 /api/internal/graded 暴露在公网。
  server.listen(PORT, '127.0.0.1', () => {
    logger.info({ port: PORT, host: '127.0.0.1' }, 'HTTP 服务已启动（仅回环监听，须经网关访问）');
  });
}

start().catch((err) => {
  logger.error({ err }, '启动失败');
  process.exit(1);
});

export default app;
