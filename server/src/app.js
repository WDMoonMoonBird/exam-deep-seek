import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import logger from './utils/logger.js';
import prisma from './utils/prisma.js';
import { initSocket, notifyGraded } from './socket.js';
import { compose } from './infrastructure/bootstrap/compose.js';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import teacherRoutes from './routes/teacher.js';
import studentRoutes from './routes/student.js';
import projectRoutes from './routes/projects.js';
import auth from './middleware/auth.js';
import requireRole from './middleware/role.js';
import projectAssetGuard from './middleware/projectAssetGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ---- 组合根：依赖装配集中在 infrastructure/bootstrap/compose.js，结果挂 app.locals ----
Object.assign(app.locals, compose({ prisma, logger }));

// 未配置 JWT_SECRET 时启动期生成随机密钥（重启即全员重登），
// 杜绝硬编码兜底密钥被伪造身份；配置了 JWT_SECRET 则保持稳定
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  logger.warn('JWT_SECRET 未配置，已生成随机密钥（重启后所有登录将失效）；建议在 server/.env 中配置固定 JWT_SECRET');
}

// 关键配置校验
if (!process.env.DEEPSEEK_API_KEY) logger.warn('DEEPSEEK_API_KEY 未配置，AI 评分将不可用');
if (!process.env.JWT_SECRET) logger.warn('JWT_SECRET 未配置，使用默认密钥不安全');

// 安全中间件
app.use(helmet({ contentSecurityPolicy: false })); // CSP 由 Vite 处理
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

// 统一错误处理
app.use((err, _req, res, _next) => {
  logger.error({ err }, '服务器内部错误');
  res.status(500).json({ code: 2001, message: '服务器内部错误', data: null });
});

// 启动服务
async function start() {
  // 迁移明文密码 → bcrypt
  const plainUsers = await prisma.user.findMany({
    where: { password: { not: { startsWith: '$2' } } },
  });
  for (const u of plainUsers) {
    await prisma.user.update({
      where: { id: u.id },
      data: { password: bcrypt.hashSync(u.password, 10) },
    });
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
