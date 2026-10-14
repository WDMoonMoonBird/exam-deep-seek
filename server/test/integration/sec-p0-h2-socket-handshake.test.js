/**
 * ★H2（P0）回归断言：Socket.IO 握手无鉴权 + 信任客户端 schoolId
 *
 * 断言的是「**被拒绝/不在房内**」：
 *   H2-1 匿名握手（不带 token）⇒ 服务端回 CONNECT_ERROR(unauthorized)，**不得**出现建连确认
 *   H2-2 合法教师令牌 ⇒ 建连成功（正对照，证明 H2-1 的红不是"所有连接都失败"）
 *   H2-3 join-school 传**非本校本 id** ⇒ 不在 school-<他人id> 房内（收不到 graded）；
 *        同连接对自己学校仍能收到（正对照，证明探针通道有效）
 *
 * 用真实 WS 客户端（ws，engine.io/socket.io 的传递依赖）走 raw EIO=4 协议，
 * 不带 socket.io-client（本仓未安装）。
 * 修复前（HEAD）：无握手中间件 + join-school 直接 join 客户端给的 id ⇒ 匿名可连、可进任意房间。
 */
import http from 'node:http';
import { WebSocket } from 'ws';
import app from '../../src/app.js';
import { initSocket, notifyGraded } from '../../src/infrastructure/notifier/socket-server.js';
import { getTestData, loginAsTeacher } from './helpers.js';

const FOREIGN_SCHOOL_ID = 987654321;   // 本进程教师一定不属于的学校（房号 school-987654321）

let server; let port; let teacherToken; let ownSchoolId;

function connect() {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/socket.io/?EIO=4&transport=websocket');
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const text = String(raw);
    const w = waiters.shift();
    if (w) w(text); else queue.push(text);
  });
  const opened = new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', (err) => reject(new Error('ws error: ' + (err && err.message))));
  });
  // 注意：以下必须是普通函数（不是箭头函数）—— 箭头函数不绑定 this，drain 里调 this.next 会炸
  const next = (timeoutMs = 4000) => new Promise((resolve) => {
    if (queue.length) return resolve(queue.shift());
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let wrapped;
    const timer = setTimeout(() => {
      const i = waiters.indexOf(wrapped);
      if (i >= 0) waiters.splice(i, 1);
      finish(null);
    }, timeoutMs);
    wrapped = (v) => { clearTimeout(timer); finish(v); };
    waiters.push(wrapped);
  });
  const drain = async (ms = 700) => {
    const seen = [];
    const deadline = Date.now() + ms;
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      const p = await next(Math.max(60, left));
      if (p == null) break;
      seen.push(p);
    }
    return seen;
  };
  return { opened, send: (p) => ws.send(p), next, drain, close: () => { try { ws.close(); } catch { /* noop */ } } };
}

/** 打开引擎会话并取 OPEN 包（'0{...}'） */
async function openEngineSession() {
  const c = connect();
  await c.opened;
  const open = await c.next();
  expect(String(open).startsWith('0')).toBe(true);
  return c;
}

beforeAll(async () => {
  teacherToken = await loginAsTeacher();
  ownSchoolId = getTestData().schoolId;
  server = http.createServer(app);
  initSocket(server);                                    // 覆盖模块级 io ⇒ notifyGraded 打在本 server 上
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('★H2（P0）：Socket 握手/入房鉴权', () => {
  it('H2-1 匿名握手 ⇒ CONNECT_ERROR(unauthorized)，不得出现建连确认', async () => {
    const c = await openEngineSession();
    c.send('40');                                        // socket.io CONNECT（无 auth 载荷）
    const reply = await c.next(5000);
    c.close();
    expect(reply).not.toBeNull();
    expect(String(reply).startsWith('44')).toBe(true);    // 4=message, 4=CONNECT_ERROR
    expect(String(reply)).toContain('unauthorized');
    expect(String(reply).startsWith('40')).toBe(false);   // 绝不能被确认建连
  }, 15000);

  it('H2-2 合法教师令牌 ⇒ 建连成功（正对照）', async () => {
    const c = await openEngineSession();
    c.send('40' + JSON.stringify({ token: teacherToken }));
    const ack = await c.next(5000);
    c.close();
    expect(String(ack).startsWith('40')).toBe(true);
  }, 15000);

  it('H2-3 传入非校本 schoolId 不入房：收不到其 graded；自己学校仍收得到（正对照）', async () => {
    const c = await openEngineSession();
    c.send('40' + JSON.stringify({ token: teacherToken }));
    expect(String(await c.next(5000)).startsWith('40')).toBe(true);

    c.send('42' + JSON.stringify(['join-school', FOREIGN_SCHOOL_ID]));
    await new Promise((resolve) => setTimeout(resolve, 400));   // 等入房处理

    notifyGraded(FOREIGN_SCHOOL_ID, { probe: 'foreign-room' });
    const foreign = await c.drain(900);
    expect(foreign.filter((p) => String(p).includes('foreign-room'))).toEqual([]);

    notifyGraded(ownSchoolId, { probe: 'own-room' });
    const own = await c.drain(2500);
    c.close();
    expect(own.some((p) => String(p).includes('own-room'))).toBe(true);
  }, 20000);
});
