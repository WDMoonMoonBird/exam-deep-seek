/**
 * SocketNotifier —— 实时通知适配器（实现 domain/ports/gateways.js 的 NotificationPort 契约）。
 * 转发至 socket.js 的 notifyGraded（io.to(school-x).emit('graded')）；
 * 未来可替换为事件总线订阅方式而不影响调用方。
 */

import { notifyGraded as emitGraded } from './socket-server.js';

export class SocketNotifier {
  async notifyGraded(schoolId, payload) {
    emitGraded(schoolId, payload);
  }

  async notifyProjectGraded(schoolId, payload) {
    emitGraded(schoolId, payload);
  }
}