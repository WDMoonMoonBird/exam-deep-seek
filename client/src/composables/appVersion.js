/**
 * appVersion.js —— R2-B59：SPA 入口版本探测（发现新版本 ⇒ 非打断式提示刷新）+ 当前版本短码（排障可见）。
 *
 * 方案与理由：
 *   · 版本指纹 = 入口 chunk 的构建哈希。运行中版本取自当前文档 script[type=module][src] 的文件名哈希（即浏览器实际加载的那份代码，可自证）；
 *     线上版本 = 拉取 index.html（cache: no-store）后从其中同一个 script 标签解析出的哈希 ⇒ 两者不同即代表服务端已发新版。
 *   · 不另设 version.json：少一个部署面（不必保证新文件不被缓存/不被发布脚本漏传），index.html 天然要求不缓存（B52 运维建议亦如此）。
 *   · 不在构建期把最终哈希注入 JS：哈希在产物生成后才确定（自引用循环）；运行时可直接从自身 script 标签读到。
 *   · 构建期仍注入构建时间戳 __BUILD_VERSION__（vite define），展示成 v-<yyyyMMddHHmm>-<哈希前 7 位>。
 *
 * 健壮性（全部静默）：请求失败/离线/HTML 异常/解析不出哈希 ⇒ status=ignored（不抛、不提示、不影响渲染）；
 *   同一版本只提示一次（storage 记 version-notified:<hash>）；请求去抖（默认 60s 内不重复）+ 轮询间隔默认 5 分钟，切前台/恢复网络时补一次。
 *   外部依赖（fetch/document/storage/notify）全部可注入 ⇒ 可在 node 下用桩件做四态测试（verify-frontend ⑫c）。
 */

export const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000;   // 轮询间隔：5 分钟
export const MIN_CHECK_GAP_MS = 60 * 1000;                // 去抖：60s 内不重复发请求
export const THROTTLE_KEY = 'version-check-at';

export function buildStamp() {
  try { return typeof __BUILD_VERSION__ !== 'undefined' && __BUILD_VERSION__ ? String(__BUILD_VERSION__) : 'dev'; } catch { return 'dev'; }
}

export function entryHashOf(src) {
  const m = String(src || '').match(/-([A-Za-z0-9_]{6,})\.js(?:\?|$)/);
  return m ? m[1] : null;
}

export function entrySrcFromHtml(html) {
  const t = String(html || '');
  const a = t.match(/<script[^>]+type=["']module["'][^>]*\ssrc=["']([^"']+)["']/i);
  if (a) return a[1];
  const b = t.match(/<script[^>]+\ssrc=["']([^"']+\.js)["'][^>]*type=["']module["']/i);
  return b ? b[1] : null;
}

export function currentEntrySrc(doc) {
  try {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.querySelector) return null;
    const el = d.querySelector('script[type="module"][src]');
    return el ? el.getAttribute('src') : null;
  } catch { return null; }
}

export function appVersionLabel(doc) {
  const stamp = buildStamp();
  const hash = entryHashOf(currentEntrySrc(doc));
  return hash ? stamp + '-' + hash.slice(0, 7) : stamp;
}

// 单次探测（从不抛）：{ status: 'same' | 'newer' | 'ignored' | 'throttled', ... }
export async function checkForNewVersion({
  fetchImpl = null, doc = null, storage = null, notify = null,
  url = 'index.html', now = () => Date.now(), minGapMs = MIN_CHECK_GAP_MS,
} = {}) {
  const t = now();
  let last = 0;
  try { last = Number(storage && storage.getItem ? storage.getItem(THROTTLE_KEY) : 0) || 0; } catch { last = 0; }
  if (last && t - last < minGapMs) return { status: 'throttled', sinceMs: t - last };
  try { if (storage && storage.setItem) storage.setItem(THROTTLE_KEY, String(t)); } catch { /* 只失去去抖能力 */ }

  const mine = entryHashOf(currentEntrySrc(doc));
  let html = null;
  try {
    const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return { status: 'ignored', reason: 'no_fetch' };
    const res = await f(url, { cache: 'no-store' });
    if (!res || res.ok === false) return { status: 'ignored', reason: 'http' };
    html = await res.text();
  } catch { return { status: 'ignored', reason: 'network' }; }

  const theirs = entryHashOf(entrySrcFromHtml(html));
  if (!mine || !theirs) return { status: 'ignored', reason: 'unparsable' };
  if (mine === theirs) return { status: 'same', version: mine };

  const key = 'version-notified:' + theirs;
  let already = false;
  try { already = storage && storage.getItem ? storage.getItem(key) === '1' : false; } catch { already = false; }
  if (already) return { status: 'newer', notified: false, reason: 'already_notified', version: theirs };
  try { if (storage && storage.setItem) storage.setItem(key, '1'); } catch { /* ignore */ }
  if (typeof notify === 'function') { try { notify({ version: theirs }); } catch { /* 提示失败不影响渲染 */ } }
  return { status: 'newer', notified: true, version: theirs };
}

export function installVersionWatcher({
  doc = null, win = null, fetchImpl = null, storage = null, notify = null,
  intervalMs = DEFAULT_CHECK_INTERVAL_MS, minGapMs = MIN_CHECK_GAP_MS,
} = {}) {
  const run = () => { checkForNewVersion({ fetchImpl, doc, storage, notify, minGapMs }).catch(() => {}); };
  let timer = null;
  try {
    run();
    if (win && win.setInterval) timer = win.setInterval(run, intervalMs);
    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', () => { if (!doc.hidden) run(); });
    if (win && win.addEventListener) win.addEventListener('online', run);
  } catch { /* 观测失败绝不影响应用 */ }
  return { stop: () => { try { if (timer && win && win.clearInterval) win.clearInterval(timer); } catch { /* ignore */ } } };
}

export default {
  DEFAULT_CHECK_INTERVAL_MS, MIN_CHECK_GAP_MS, THROTTLE_KEY,
  buildStamp, entryHashOf, entrySrcFromHtml, currentEntrySrc, appVersionLabel, checkForNewVersion, installVersionWatcher,
};