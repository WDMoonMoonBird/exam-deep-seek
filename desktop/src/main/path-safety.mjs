/**
 * path-safety.mjs —— 本地内容服务的路径规范化、SPA fallback 分类与目录穿越防护。
 *
 * 纯函数、零依赖（只用 node:path），可在 node 下直接 import 单测。
 * 口径与 Web 端 nginx-exam.conf 的 location 规则对齐（计划 §2.3/§7.2）：
 *   · /exam（无尾斜杠）→ 301 /exam/；'/' 同样 301 到 /exam/（桌面壳只暴露 /exam/ 前缀）
 *   · /exam/api/**、/exam/socket.io/** → 交给反代（socket.io 的 polling 也是普通 HTTP）
 *   · 已知 SPA 前缀（login/teacher/student/admin/m/doc）→ index.html；
 *     未知路径或缺失的文件型路径 → 404（不把未知路径兜成 200 外壳）
 *   · 静态文件先解码 + 规范化 + 限制在 rootDir 内，拒绝 ..、控制字符、反斜杠
 */
import path from 'node:path';

export const APP_BASE = '/exam/';
export const APP_BASE_BARE = '/exam';
export const API_PREFIX = '/exam/api';
export const SOCKET_PREFIX = '/exam/socket.io';
export const INDEX_FILE = 'index.html';
export const NOT_FOUND_PAGE = 'error-pages/404.html';

/** 与 nginx 的精确匹配 location 对齐 */
const SPA_EXACT = new Set([APP_BASE, '/exam/login', '/exam/change-password', '/exam/doc', '/exam/doc/demos']);
/** 与 nginx 的 ^/exam/(teacher|student|admin)(/|$) 与 ^/exam/m(/|$) 对齐 */
export const SPA_PREFIXES = Object.freeze(['/exam/teacher', '/exam/student', '/exam/admin', '/exam/m']);

export function isApiPath(pathname) {
  return pathname === API_PREFIX || pathname.startsWith(API_PREFIX + '/');
}

/** 内部回调端点：公网一律 404（与 nginx ^~ /exam/api/internal/ 同口径） */
export function isInternalApiPath(pathname) {
  return pathname === API_PREFIX + '/internal' || pathname.startsWith(API_PREFIX + '/internal/');
}

export function isSocketPath(pathname) {
  return pathname === SOCKET_PREFIX || pathname.startsWith(SOCKET_PREFIX + '/');
}

/** 形似文件（末段含扩展名）⇒ 缺失时 404，而不是回 SPA 外壳 */
export function isFileLike(pathname) {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return last !== '' && !last.startsWith('.') && last.includes('.');
}

export function isSpaRoute(pathname) {
  if (SPA_EXACT.has(pathname)) return true;
  return SPA_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

/**
 * 解析请求 URL：返回 { ok:true, pathname(已解码/规范化), search } 或 { ok:false, status, reason }。
 * 任何编码非法、控制字符、反斜杠、.. 段一律 400（在进入静态查找前拒绝）。
 */
export function normalizeRequestUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl === '') return { ok: false, status: 400, reason: '请求 URL 为空' };
  // ★WHATWG URL 解析会**先规范化**点段（含 %2e%2e）⇒ 必须在解析前对原始 request-target 判定点段，
  //   否则「/exam/%2e%2e/x」会被静默折叠成「/x」而丢掉"穿越尝试"语义（仍安全，但应明确 400）。
  const rawPath = String(rawUrl).split('?')[0].split('#')[0].replace(/%2e/gi, '.');
  if (rawPath.split('/').some((segment) => segment === '..' || segment === '.')) {
    return { ok: false, status: 400, reason: 'URL 含目录穿越' };
  }
  // 本地 origin 服务器只接受 path 形式（origin-form）；'//x' 必须按路径处理而不是被当成 authority，
  // 绝对形式（http://…）直接拒绝，避免把本服务当成转发代理。
  const target = String(rawUrl);
  if (!target.startsWith('/')) return { ok: false, status: 400, reason: '请求目标必须是 path 形式' };
  let url;
  try {
    url = new URL('http://127.0.0.1' + target);
  } catch {
    return { ok: false, status: 400, reason: '请求 URL 非法' };
  }
  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return { ok: false, status: 400, reason: 'URL 编码非法' };
  }
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return { ok: false, status: 400, reason: 'URL 含控制字符' };
  if (decoded.includes('\\')) return { ok: false, status: 400, reason: 'URL 含反斜杠' };
  const withSlash = decoded.startsWith('/') ? decoded : '/' + decoded;
  const pathname = withSlash.replace(/\/{2,}/g, '/');
  if (pathname.split('/').some((segment) => segment === '..')) {
    return { ok: false, status: 400, reason: 'URL 含目录穿越' };
  }
  return { ok: true, pathname, search: url.search || '' };
}

/** 去掉 /exam/ 前缀得到静态相对路径；不在 base 下或为空返回 null */
export function staticRelativePath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith(APP_BASE)) return null;
  const rel = pathname.slice(APP_BASE.length);
  return rel === '' ? null : rel;
}

/** 在 rootDir 内解析相对路径；越界/含 .. 返回 null（第二道防线） */
export function safeResolve(rootDir, relativePath) {
  if (typeof rootDir !== 'string' || rootDir === '') return null;
  if (typeof relativePath !== 'string' || relativePath === '') return null;
  if (relativePath.includes('\u0000') || relativePath.includes('\\')) return null;
  if (relativePath.split('/').some((segment) => segment === '..')) return null;
  const root = path.resolve(rootDir);
  const abs = path.resolve(root, relativePath);
  if (abs === root) return null;
  if (!abs.startsWith(root + path.sep)) return null;
  return abs;
}

/**
 * 请求分类（纯函数）：redirect | proxy-http | spa | static | notfound。
 * content-server 据 type 决定处理方式，避免把路由判断散落在 I/O 代码里。
 */
export function classifyRequestPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return { type: 'notfound' };
  if (pathname === APP_BASE_BARE) return { type: 'redirect', status: 301, location: APP_BASE };
  if (pathname === '/') return { type: 'redirect', status: 301, location: APP_BASE };
  if (!pathname.startsWith(APP_BASE)) return { type: 'notfound' };
  // source map 永不外发（与 Web 端 nginx 的 .map → 404 口径一致，防源码泄露）
  if (/\.map$/i.test(pathname)) return { type: 'notfound' };
  if (isInternalApiPath(pathname)) return { type: 'notfound' };
  if (isApiPath(pathname) || isSocketPath(pathname)) return { type: 'proxy-http' };
  if (isSpaRoute(pathname)) return { type: 'spa' };
  if (isFileLike(pathname)) return { type: 'static' };
  return { type: 'notfound' };
}
