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
import { useUserStore } from '../stores/user.js';   // ★H2：只读既有登录态（不新建存储、不改写入语义）

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

/**
 * ★H2：读取当前登录态令牌 —— 优先 pinia store；node / 无 pinia 实例时回落**同一份**既有持久化值。
 *   只读取值，不新建存储、不改写入语义；任何异常都回落空串（本模块必须保持「node 下可 import」的性质）。
 */
export function defaultGetToken() {
  try {
    const store = useUserStore();
    if (store && store.token) return store.token;
  } catch { /* 无 pinia 实例（node）⇒ 回落 localStorage */ }
  try { return localStorage.getItem('token') || ''; } catch { return ''; }
}

/**
 * ★H2：令牌失效 ⇒ **停止重连**并断开。
 *   背景：socket.io 默认 reconnectionAttempts = Infinity，握手被服务端拒绝（unauthorized）时会后台无限重连。
 *   运行时口径（socket.io-client 4.8.3 实测）：Manager 的重连开关是**方法** `socket.io.reconnection(false)`，
 *   仅改 `socket.io.opts.reconnection` 对已构造的 Manager 无效（opts 初值实测为 undefined）——故二者都设，方法优先。
 *   观感：connect_error 的「只提示一次」由 attachSocketLogging 负责，本函数不重复打印。
 */
function attachAuthGuard(socket) {
  try {
    socket.on('connect_error', (err) => {
      if (((err && err.message) || '') !== 'unauthorized') return;   // 网络类错误保留重连（退避见建连参数）
      try { if (socket.io && typeof socket.io.reconnection === 'function') socket.io.reconnection(false); } catch { /* ignore */ }
      try { if (socket.io && socket.io.opts) socket.io.opts.reconnection = false; } catch { /* ignore */ }
      try { socket.disconnect(); } catch { /* ignore */ }
    });
  } catch { /* 观测失败绝不影响页面 */ }
  return true;
}

/** 便捷封装：解析端点 + 建连（携带登录态 JWT）+ 挂一次性日志；任何异常都被吞掉（返回值可能为 null） */
export function createTeacherSocket(io, { env = undefined, log = console, onConnect = null, getToken = defaultGetToken } = {}) {
  const { url, options } = resolveSocketEndpoint(env);
  // ★H2：无 token ⇒ **不建连**（服务端握手必然拒绝）。调用方已有 `if (!socket) return;` 兜底 ⇒ UI 零变化
  let token = '';
  try { token = getToken() || ''; } catch { token = ''; }
  if (!token) {
    try { log.warn('[socket] 未登录（无 token），跳过实时通道建连 —— 页面功能不受影响（实时刷新降级为手动刷新）'); } catch { /* ignore */ }
    return null;
  }
  try {
    const socket = io(url, {
      ...options,
      // ★H2：**函数式** auth —— socket.io 每次（重）连都重新求值 ⇒ 重连自动带最新 token（零轮询、零额外请求）
      auth: (cb) => { let t = ''; try { t = getToken() || ''; } catch { t = ''; } cb({ token: t }); },
      reconnectionAttempts: 5,        // 放弃策略：有限重试（默认 Infinity）
      reconnectionDelay: 1000,        // 退避起点
      reconnectionDelayMax: 30000,    // 退避上限（指数退避封顶，避免刷屏）
    });
    attachSocketLogging(socket, { log, path: options.path });
    attachAuthGuard(socket);
    if (typeof onConnect === 'function') socket.on('connect', onConnect);
    return socket;
  } catch (err) {
    try { log.warn('[socket] 初始化失败（页面功能不受影响）：' + ((err && err.message) || err)); } catch { /* ignore */ }
    return null;
  }
}

export default { DEFAULT_SOCKET_PATH, resolveSocketEndpoint, attachSocketLogging, createTeacherSocket };
