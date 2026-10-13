/**
 * socket-notifier.test.js — SocketNotifier 委托测试（mock socket.js 模块）。
 * 验证：notifyGraded / notifyProjectGraded 将参数原样委托给 socket.js 的
 * notifyGraded（io.to(school-x).emit('graded') 的封装），不初始化真实 io。
 * 使用 jest.unstable_mockModule 对 ESM 模块打桩，全程无真实 Socket.IO 连接。
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/infrastructure/notifier/socket-server.js', () => ({
  notifyGraded: jest.fn(),
}));

const { SocketNotifier } = await import('../../../src/infrastructure/notifier/socket-notifier.js');
const { notifyGraded } = await import('../../../src/infrastructure/notifier/socket-server.js');

beforeEach(() => {
  notifyGraded.mockClear();
});

describe('SocketNotifier（NotificationPort 契约）', () => {
  it('notifyGraded → 委托 emitGraded(schoolId, payload)', async () => {
    const notifier = new SocketNotifier();
    const payload = { submissionId: 's1', score: 88, feedback: 'ok' };
    await notifier.notifyGraded(10001, payload);
    expect(notifyGraded).toHaveBeenCalledTimes(1);
    expect(notifyGraded).toHaveBeenCalledWith(10001, payload);
  });

  it('notifyProjectGraded → 同样委托 emitGraded(schoolId, payload)', async () => {
    const notifier = new SocketNotifier();
    const payload = { submissionId: 'p1', projectId: 7 };
    await notifier.notifyProjectGraded(10001, payload);
    expect(notifyGraded).toHaveBeenCalledTimes(1);
    expect(notifyGraded).toHaveBeenCalledWith(10001, payload);
  });

  it('两个方法互不影响（独立调用各自委托一次）', async () => {
    const notifier = new SocketNotifier();
    await notifier.notifyGraded(1, { a: 1 });
    await notifier.notifyProjectGraded(2, { b: 2 });
    expect(notifyGraded).toHaveBeenCalledTimes(2);
    expect(notifyGraded).toHaveBeenNthCalledWith(1, 1, { a: 1 });
    expect(notifyGraded).toHaveBeenNthCalledWith(2, 2, { b: 2 });
  });
});
