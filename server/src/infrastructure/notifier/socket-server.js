import { Server } from 'socket.io';
import logger from './utils/logger.js';

let io = null;

export function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000,
  });

  io.on('connection', (socket) => {
    logger.info({ id: socket.id }, 'WebSocket 已连接');

    socket.on('join-school', (schoolId) => {
      if (schoolId) {
        socket.join(`school-${schoolId}`);
        logger.info({ id: socket.id, schoolId }, '加入学校房间');
      }
    });

    socket.on('leave-school', (schoolId) => {
      if (schoolId) {
        socket.leave(`school-${schoolId}`);
      }
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
