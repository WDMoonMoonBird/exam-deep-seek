/**
 * socketConfig.js —— R2-B53：教师端实时通道（socket.io）的**统一端点与可观测性**（两处页面共用）。
 *
 * 实机证据（浏览器控制台）：反复出现
 *   WebSocket connection to 'wss://deadpan.asia/socket.io/?EIO=4&transport=websocket' failed
 * ⇒ 客户端打的是**根路径** /socket.io，而云上 nginx **没有**对应 location；真正可用的是
 *   location /exam/socket.io/ { proxy_pass http://127.0.0.1:3002/socket.io/; }
 * （nginx 按**最长前缀**匹配 ⇒ /exam/socket.io/ 优先于静态块的 location /exam/ ⇒ 不会拿到 SPA HTML）。
 *
 * 本模块只做两件事（纯函数 + 注入，便于在 node 下测试）：
 *   ① resolveSocketEndpoint(env)：给出 url 与 options（path 默认 '/exam/socket.io'，可经 VITE_WS_PATH 覆盖）
 *   ② attachSocketLogging(socket, hooks)：connect / connect_error **各只提示一次**（不刷屏），且绝不抛
 */
export const DEFAULT_SOCKET_PATH = '/exam/socket.io';

/** 读取 Vite 注入的环境变量（非 Vite 环境/未定义时安全回落空对象 ⇒ 本模块可在 node 下直接 import） */
function envOf(env) {
  if (env && typeof env === 'object') return env;
  try {
    const meta = import.meta;
    return (meta && meta.env) ? meta.env : {};
  } catch { return {}; }
}

/** 解析 socket 端点：url 缺省=同源（由 nginx/Vite 代理承担），path 默认与生产一致 */
export function resolveSocketEndpoint(env, { defaultPath = DEFAULT_SOCKET_PATH } = {}) {
  const e = envOf(env);
  const path = String(e.VITE_WS_PATH || '').trim() || defaultPath;
  const url = String(e.VITE_WS_URL || '').trim() || undefined;   // undefined ⇒ 连当前源（同源代理）
  return { url, options: { transports: ['websocket', 'polling'], path } };
}

/** 一次性提示（不刷屏）：同一 socket 实例的 connect / connect_error 各提示一次 */
const LOGGED = new WeakSet();
export function attachSocketLogging(socket, { log = console, path = DEFAULT_SOCKET_PATH } = {}) {
  if (!socket || typeof socket.on !== 'function') return false;
  if (LOGGED.has(socket)) return true;      // 幂等：重复调用不重复挂/不重复打印
  LOGGED.add(socket);
  let connected = false;
  let failed = false;
  try {
    socket.on('connect', () => {
      if (!connected) { connected = true; log.info('[socket] 已连接（path=' + path + '）'); }
    });
    socket.on('connect_error', (err) => {
      if (!failed) {
        failed = true;
        // 失败只提示一次；**不抛出、不阻塞渲染**（调用方在 try/catch 内创建连接）
        log.warn('[socket] 连接失败（path=' + path + '）：' + ((err && err.message) || err) + ' —— 页面功能不受影响（实时刷新降级为手动刷新）');
      }
    });
  } catch { /* 观测失败绝不影响页面 */ }
  return true;
}

/** 便捷封装：解析端点 + 建连 + 挂一次性日志；任何异常都被吞掉（返回值可能为 null） */
export function createTeacherSocket(io, { env = undefined, log = console, onConnect = null } = {}) {
  const { url, options } = resolveSocketEndpoint(env);
  try {
    const socket = io(url, options);
    attachSocketLogging(socket, { log, path: options.path });
    if (typeof onConnect === 'function') socket.on('connect', onConnect);
    return socket;
  } catch (err) {
    try { log.warn('[socket] 初始化失败（页面功能不受影响）：' + ((err && err.message) || err)); } catch { /* ignore */ }
    return null;
  }
}

export default { DEFAULT_SOCKET_PATH, resolveSocketEndpoint, attachSocketLogging, createTeacherSocket };
