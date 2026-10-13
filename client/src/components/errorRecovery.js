/**
 * errorRecovery.js —— R2-B52：懒加载 chunk 失败**自愈** + 全局错误**可见**（零依赖，便于在 node 下用桩件测试）。
 *
 * 症状（用户实测）：审核学生后点「返回」或点任何左侧菜单 ⇒ 右侧整块空白，必须硬刷新才恢复。
 * 根因链：① 部署 rsync --delete + 资源哈希 ⇒ 旧标签页取旧 chunk **404**（动态 import 拒绝）
 *        ② 路由懒加载失败**无人接管**（无 router.onError）⇒ 组件永不解析
 *        ③ <transition mode="out-in"> 在"进入组件解析失败"时停在 out 阶段 ⇒ 右侧永久空白；此后任何菜单点击同样空白。
 * 处置：①动态导入失败 ⇒ **整页 reload 一次**（sessionStorage 键 chunk-reload:<fullPath> 防循环；第二次不再 reload）
 *       ②错误边界（ErrorBoundary.vue，位于 transition **之外**）⇒ 渲染错误显示「页面加载失败 + 重试/刷新」
 *       ③app.config.errorHandler + window.unhandledrejection ⇒ 可见提示 + console 带路由信息（不静默）
 *       ④去掉了两个 Layout 的 mode="out-in"（见 R2-B52 记录的取舍说明）
 *
 * 本模块**不 import Ant/Vue/Vue-Router**（只接收注入的 router/app/notify/storage/reload）⇒ 可用桩件直接单测。
 */

/** 动态导入失败的已知信号（打包器/浏览器/网络三类措辞，宁多勿漏；命中即视为可自愈） */
export const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \S+ failed/i,
  /loading css chunk \S+ failed/i,
  /dynamically imported module/i,
];

export const RELOAD_PREFIX = 'chunk-reload:';

/** 是否为"可自愈的 chunk 加载失败"（非此类错误 ⇒ 交给错误边界/全局提示，不刷新页面） */
export function isChunkLoadError(err) {
  const text = [err && err.message, err && err.name, err && err.stack, String(err || '')].filter(Boolean).join(' | ');
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(text));
}

export function reloadKeyOf(fullPath, prefix = RELOAD_PREFIX) {
  return String(prefix) + String(fullPath || '(unknown)');
}

function storageGet(storage, key) { try { return storage ? storage.getItem(key) : null; } catch { return null; } }
function storageSet(storage, key, val) { try { if (storage) storage.setItem(key, val); } catch { /* 隐私模式/配额 ⇒ 退化为"每次都允许一次"，仍优于永久空白 */ } }
function storageDel(storage, key) { try { if (storage) storage.removeItem(key); } catch { /* ignore */ } }

/** 清掉某路径的自愈标记（错误边界的"重试"按钮用：允许再次尝试 reload-once） */
export function clearChunkReloadMark(fullPath, { storage = null, prefix = RELOAD_PREFIX } = {}) {
  storageDel(storage, reloadKeyOf(fullPath, prefix));
}

/**
 * 处理一次"路由级错误"：chunk 失败 ⇒ 至多 reload 一次；否则交给 notify（可见提示）且不刷新。
 * 返回 { handled, reloaded, reason }（自愈与防循环的全部判定都在这一个纯函数里，便于注入桩件测试）。
 */
export function handleRouterError(err, to, { storage = null, reload = null, notify = null, prefix = RELOAD_PREFIX } = {}) {
  const fullPath = (to && (to.fullPath || to.path)) || '(unknown)';
  if (!isChunkLoadError(err)) {
    if (notify) notify('页面加载出错了，请重试（路由：' + fullPath + '）');   // ★R2-B55：UI 固定友好 + 保留路由；原始错误已 console.error
    return { handled: false, reloaded: false, reason: 'not_chunk_error' };
  }
  const key = reloadKeyOf(fullPath, prefix);
  if (storageGet(storage, key)) {
    // ★第二次仍失败 ⇒ 不再刷新（防循环），显示错误 UI（由 ErrorBoundary/页面兜底），并提示可手动刷新
    if (notify) notify('页面资源加载失败，请手动刷新（' + fullPath + '）');
    return { handled: true, reloaded: false, reason: 'already_reloaded' };
  }
  storageSet(storage, key, String(Date.now()));
  if (typeof reload === 'function') reload();
  return { handled: true, reloaded: true, reason: 'reload_once' };
}

/** 当前路由描述（用于日志与提示"带路由信息"） */
export function describeRoute(router) {
  try {
    const r = router && router.currentRoute && router.currentRoute.value;
    return (r && (r.fullPath || r.path)) || '(unknown)';
  } catch { return '(unknown)'; }
}

/** 挂 router.onError（懒加载/解析失败）—— 在 main.js 里于 mount 之前调用 */
export function installRouterErrorHandling(router, opts = {}) {
  if (!router || typeof router.onError !== 'function') return false;
  router.onError((err, to) => {
    const res = handleRouterError(err, to, opts);
    // eslint-disable-next-line no-console
    console.error('[R2-B52] router.onError', { to: (to && to.fullPath) || describeRoute(router), handled: res.handled, reloaded: res.reloaded, reason: res.reason, err });
    return res;
  });
  return true;
}

/** 挂全局错误处理：app.config.errorHandler + window unhandledrejection ⇒ 可见提示 + 带路由信息的日志（不静默） */
export function installGlobalErrorHandling(app, { router = null, win = null, notify = null } = {}) {
  if (app && app.config) {
    app.config.errorHandler = (err, instance, info) => {
      // eslint-disable-next-line no-console
      console.error('[R2-B52] app.config.errorHandler', { route: describeRoute(router), info, err });
      if (notify) notify('页面出错了，请重试（路由：' + describeRoute(router) + '）');   // ★R2-B55
    };
  }
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('unhandledrejection', (event) => {
      const reason = event && event.reason;
      // eslint-disable-next-line no-console
      console.error('[R2-B52] unhandledrejection', { route: describeRoute(router), reason });
      if (isChunkLoadError(reason)) {
        // 未捕获的 chunk 失败同样走自愈（例如非路由上下文的手动 import()）
        handleRouterError(reason, { fullPath: describeRoute(router) }, { storage: win.sessionStorage || null, reload: () => win.location && win.location.reload() });
      } else if (notify) {
        notify('页面出错了，请重试（路由：' + describeRoute(router) + '）');   // ★R2-B55
      }
    });
  }
  return true;
}

/** 一步安装（main.js 调用）：默认用 window.sessionStorage + location.reload（可用桩件覆盖，便于测试） */
export function installErrorRecovery({ app = null, router = null, win = (typeof window !== 'undefined' ? window : null), storage = null, reload = null, notify = null, prefix = RELOAD_PREFIX } = {}) {
  const useStorage = storage || (win && win.sessionStorage) || null;
  const useReload = reload || (() => { if (win && win.location) win.location.reload(); });
  const opts = { storage: useStorage, reload: useReload, notify, prefix };
  const routerOk = router ? installRouterErrorHandling(router, opts) : false;
  const globalOk = installGlobalErrorHandling(app, { router, win, notify });
  return { routerInstalled: routerOk, globalInstalled: globalOk };
}

/** 错误边界的状态推导（纯函数；ErrorBoundary.vue 与测试共用同一口径） */
export function boundaryState(err, fullPath = '') {
  const chunk = isChunkLoadError(err);
  return {
    failed: true,
    chunk,
    title: '页面加载失败',
    message: chunk
      ? '页面资源加载失败（可能是应用刚更新、缓存过期）。可点「重试」或刷新页面。'
      : '页面渲染出错，请重试（路由：' + (fullPath || '(unknown)') + '）',   // ★R2-B55：不再拼原始 message
    route: fullPath || '(unknown)',
    canRetry: true,
  };
}

export default {
  CHUNK_ERROR_PATTERNS, RELOAD_PREFIX, isChunkLoadError, reloadKeyOf, clearChunkReloadMark, handleRouterError,
  describeRoute, installRouterErrorHandling, installGlobalErrorHandling, installErrorRecovery, boundaryState,
};
