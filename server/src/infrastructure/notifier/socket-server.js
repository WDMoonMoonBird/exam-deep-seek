import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { getJwtSecret } from '../../config/jwtSecret.js';

let io = null;

/**
 * ★H2：cors.origin 显式白名单 —— 原 `origin: '*'` 允许任意站点携带浏览器凭据建连。
 *   优先 SOCKET_CORS_ORIGIN，其次复用 CORS_ORIGIN；两者皆空时**只放行本机开发源**。
 */
function resolveCorsOrigin() {
  const raw = (process.env.SOCKET_CORS_ORIGIN || process.env.CORS_ORIGIN || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (raw.length) return raw;
  return [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
}

/** ★H2：握手令牌来源（浏览器 auth 载荷优先，兼容 Authorization 头与 query）。 */
function tokenOf(handshake) {
  const authToken = handshake && handshake.auth && handshake.auth.token;
  if (authToken) return String(authToken);
  const header = (handshake && handshake.headers && handshake.headers.authorization) || '';
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '');
  const queryToken = handshake && handshake.query && handshake.query.token;
  return queryToken ? String(queryToken) : '';
}

export function initSocket(server) {
  io = new Server(server, {
    cors: { origin: resolveCorsOrigin() },
    pingTimeout: 60000,
  });

  // ★H2：握手期校验 JWT —— 未带令牌/令牌无效/用户不存在/改密后旧令牌，一律拒绝建连
  //   （与 middleware/auth.js 同口径：deletedAt 过滤 + passwordChangedAt 秒级失效）。
  io.use(async (socket, next) => {
    try {
      const token = tokenOf(socket.handshake);
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, getJwtSecret());
      const user = await prisma.user.findFirst({
        where: { id: payload.id, deletedAt: null },
        select: { id: true, passwordChangedAt: true },
      });
      if (!user) return next(new Error('unauthorized'));
      if (user.passwordChangedAt) {
        const changedSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
        const issuedSec = Number(payload && payload.iat);
        if (Number.isFinite(issuedSec) && issuedSec < changedSec) return next(new Error('unauthorized'));
      }
      // ★H2：schoolId **只从服务端派生**（该教师所属学校）—— 客户端传值一律不采信
      const rows = await prisma.teacherSchool.findMany({
        where: { teacherId: user.id },
        select: { schoolId: true },
      });
      socket.data.userId = user.id;
      socket.data.schoolIds = [...new Set(rows.map(r => r.schoolId))];
      return next();
    } catch (err) {
      logger.warn({ err: err && err.message }, 'WebSocket 握手鉴权失败，已拒绝连接');
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    logger.info({ id: socket.id, userId: socket.data.userId }, 'WebSocket 已连接');

    socket.on('join-school', (schoolId) => {
      // ★H2：room 由服务端派生集合决定；客户端参数仅用于留痕，不作为入房依据
      const allowed = Array.isArray(socket.data.schoolIds) ? socket.data.schoolIds : [];
      if (schoolId != null && !allowed.includes(+schoolId)) {
        logger.warn({ id: socket.id, userId: socket.data.userId }, '忽略与登录态不符的 join-school 目标（按服务端派生学校入房）');
      }
      for (const sid of allowed) socket.join(`school-${sid}`);
      if (allowed.length) logger.info({ id: socket.id, schoolIds: allowed }, '加入学校房间');
    });

    socket.on('leave-school', () => {
      const allowed = Array.isArray(socket.data.schoolIds) ? socket.data.schoolIds : [];
      for (const sid of allowed) socket.leave(`school-${sid}`);
    });

    socket.on('disconnect', () => {
      logger.info({ id: socket.id }, 'WebSocket 已断开');
    });
  });

  logger.info('WebSocket 服务已启动');
}

export function notifyGraded(schoolId, data) {
  if (!io || !schoolId) return;
  io.to(`school-${schoolId}`).emit('graded', data);
}
