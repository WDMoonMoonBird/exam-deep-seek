/**
 * static-assets.mjs —— 本地内容服务的静态文件响应（MIME / 缓存策略 / 流式发送）。
 *
 * 职责单一：只管"给定文件路径如何安全地写进 HTTP 响应"；路由分类在 path-safety，服务生命周期在
 * content-server。fs 可注入，便于 node --test（不依赖 Electron/http server）。
 */
import fs from 'node:fs';
import path from 'node:path';

export const CACHE_LONG = 'public, max-age=31536000, immutable';
export const CACHE_MONACO = 'public, max-age=604800';
export const CACHE_DEFAULT = 'public, max-age=3600';
export const CACHE_NO_STORE = 'no-store';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
});

/** 静态文件 MIME（纯函数，单测用） */
export function mimeFor(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/** 缓存策略：hashed assets 长缓存；index.html no-store（发版即时生效） */
export function cacheControlFor(pathname, appBase = '/exam/') {
  const value = String(pathname || '');
  if (value.startsWith(appBase + 'assets/')) return CACHE_LONG;
  if (value.startsWith(appBase + 'monaco/')) return CACHE_MONACO;
  if (value === appBase || value.endsWith('/index.html')) return CACHE_NO_STORE;
  return CACHE_DEFAULT;
}

/**
 * 文件响应器：发送成功返回 true；文件缺失/非文件返回 false（调用方决定 404/500）。
 * @param {{ fsImpl?: object }} options fs 可注入（单测/故障注入）
 */
export function createFileResponder({ fsImpl = fs } = {}) {
  return function sendFile(req, res, filePath, { status = 200, cacheControl = CACHE_NO_STORE } = {}) {
    let stat;
    try {
      stat = fsImpl.statSync(filePath);
    } catch {
      return false;
    }
    if (!stat.isFile()) return false;
    res.writeHead(status, {
      'Content-Type': mimeFor(filePath),
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      'Last-Modified': stat.mtime.toUTCString(),
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    const stream = fsImpl.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('读取文件失败');
      } else {
        res.destroy();
      }
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
    return true;
  };
}
