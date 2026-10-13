import 'dotenv/config';
import express from 'express';
import http from 'http';
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
app.use('/api/auth/login', async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (await app.locals.rateLimiter.isBlocked(ip)) {
    return res.status(429).json({ code: 1003, message: '登录失败次数过多，请 5 分钟后再试', data: null });
  }
  // 捕获响应，判断登录是否成功
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode === 200 && body?.code === 0) {
      app.locals.rateLimiter.recordSuccess(ip); // 登录成功，重置计数
    } else if (res.statusCode === 400 || body?.code === 1001) {
      app.locals.rateLimiter.recordFailure(ip);
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
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '***REDACTED***';
app.post('/api/internal/graded', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${INTERNAL_SECRET}`) {
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

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: bcrypt.hashSync('***REDACTED***', 10), realName: '超级管理员', role: 'super_admin' },
  });
  logger.info({ adminId: admin.id }, '超级管理员账号已就绪');

  const server = http.createServer(app);
  initSocket(server);
  server.listen(PORT, () => {
    logger.info({ port: PORT }, `HTTP 服务已启动 → http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  logger.error({ err }, '启动失败');
  process.exit(1);
});

export default app;
