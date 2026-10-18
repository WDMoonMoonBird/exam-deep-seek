/**
 * helpers.mjs —— C 测试专用工具（临时目录 / fake HTTP 响应 / HTTP 客户端 / fake Electron 对象）。
 * 说明：本文件不含 test()，被 node --test 直接加载时按 0 用例通过；正式命令用 *.test.mjs glob。
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PassThrough } from 'node:stream';

const createdTempDirs = [];

/** 创建临时目录并登记清理；测试结束统一 cleanupTempDirs() */
export function makeTempDir(prefix = 'desktop-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdTempDirs.push(dir);
  return dir;
}

/** 清理本测试进程创建的所有临时目录 */
export function cleanupTempDirs() {
  while (createdTempDirs.length > 0) {
    const dir = createdTempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不致命 */ }
  }
}

/** 批量写文件：{ 'rel/path': content }，自动建目录；返回 rootDir */
export function writeFiles(rootDir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(rootDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return rootDir;
}

/** fake ServerResponse：可收集 writeHead 状态/头 + body，并支持 stream.pipe */
export function createFakeRes() {
  const res = new PassThrough();
  res.statusCode = null;
  res.headers = null;
  res.headersSent = false;
  res.body = Buffer.alloc(0);
  res.writeHead = (status, headers) => {
    res.statusCode = status;
    res.headers = headers || {};
    res.headersSent = true;
  };
  res.on('data', (chunk) => { res.body = Buffer.concat([res.body, chunk]); });
  return res;
}

/** 等待 fake res 写完（res.end() 触发 finish） */
export function waitForFinish(res) {
  return new Promise((resolve) => {
    if (res.writableFinished) return resolve();
    res.once('finish', resolve);
  });
}

/** 真实 HTTP 请求（agent:false，避免 keep-alive 影响 server.close） */
export function httpRequest(port, requestPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: requestPath, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('http request timeout: ' + requestPath)));
    req.end();
  });
}

/** 原始 WebSocket upgrade 请求：返回服务端写回的完整响应文本 */
export function rawUpgradeRequest(port, requestPath, { extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      const lines = [
        'GET ' + requestPath + ' HTTP/1.1',
        'Host: 127.0.0.1:' + port,
        ...Object.entries(extraHeaders).map(([name, value]) => name + ': ' + value),
        '',
        '',
      ];
      socket.write(lines.join('\r\n'));
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('close', () => resolve(data));
    socket.on('error', reject);
    socket.setTimeout(10000, () => { socket.destroy(); resolve(data); });
  });
}

/** fake DOM Event（preventDefault 记录） */
export function createFakeEvent() {
  return {
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}

/** fake Electron WebContents：记录事件监听器 + windowOpenHandler */
export function createFakeWebContents() {
  const handlers = new Map();
  return {
    handlers,
    windowOpenHandler: null,
    on(event, fn) {
      const list = handlers.get(event) || [];
      list.push(fn);
      handlers.set(event, list);
      return this;
    },
    setWindowOpenHandler(fn) {
      this.windowOpenHandler = fn;
      return this;
    },
    emit(event, ...args) {
      for (const fn of handlers.get(event) || []) fn(...args);
    },
    callWindowOpen(url) {
      if (typeof this.windowOpenHandler !== 'function') throw new Error('windowOpenHandler 未注册');
      return this.windowOpenHandler({ url });
    },
  };
}

/** fake Electron Session：记录 handler + will-download 监听器 */
export function createFakeSession() {
  const handlers = new Map();
  const session = {
    handlers,
    permissionRequestHandler: null,
    permissionCheckHandler: null,
    devicePermissionHandler: null,
    setPermissionRequestHandler(fn) { session.permissionRequestHandler = fn; },
    setPermissionCheckHandler(fn) { session.permissionCheckHandler = fn; },
    setDevicePermissionHandler(fn) { session.devicePermissionHandler = fn; },
    on(event, fn) {
      const list = handlers.get(event) || [];
      list.push(fn);
      handlers.set(event, list);
      return session;
    },
    emit(event, ...args) {
      for (const fn of handlers.get(event) || []) fn(...args);
    },
  };
  return session;
}

/** 收集日志的 fake logger（log/info/warn/error 各自 push 到数组） */
export function createFakeLog() {
  const entries = { log: [], info: [], warn: [], error: [] };
  return {
    entries,
    log(message) { entries.log.push(String(message)); },
    info(message) { entries.info.push(String(message)); },
    warn(message) { entries.warn.push(String(message)); },
    error(message) { entries.error.push(String(message)); },
  };
}

const GUI_LOCK_PATH = path.join(os.tmpdir(), 'deadpan-desktop-gui-smoke.lock');

/**
 * GUI 冒烟跨进程互斥锁（R4-2）：node --test 默认并行跑测试文件，dev 冒烟（gui-smoke）与
 * packaged 冒烟（packaged-app）会竞争固定端口 47821 与 userData config；用文件锁串行化。
 * 返回 { release() }；等待超时返回 null（调用方应 skip 而非失败）。超过 staleMs 的锁视为陈旧并清理。
 */
export async function acquireGuiLock({ timeoutMs = 90_000, staleMs = 5 * 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(GUI_LOCK_PATH, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return {
        path: GUI_LOCK_PATH,
        release() {
          try {
            if (fs.readFileSync(GUI_LOCK_PATH, 'utf8').trim() === String(process.pid)) {
              fs.rmSync(GUI_LOCK_PATH, { force: true });
            }
          } catch { /* 已释放 */ }
        },
      };
    } catch (err) {
      if (err && err.code !== 'EEXIST') throw err;
      try {
        const stat = fs.statSync(GUI_LOCK_PATH);
        if (Date.now() - stat.mtimeMs > staleMs) {
          fs.rmSync(GUI_LOCK_PATH, { force: true });
          continue;
        }
      } catch { /* 锁刚被释放，重试 */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return null;
}
