/**
 * appPath.js —— ★W8（t10/F1）：**base 感知的站内地址**唯一口径（零依赖，可在 node 下直接断言）。
 *
 * 为什么必须统一：本应用固定挂在 Vite base = '/exam/' 之下（client/vite.config.js 的 base、router 的
 *   createWebHistory('/exam/')），部署在网关的 /exam/ 前缀后。写死裸根路径（如 '/login'）在浏览器里
 *   会请求 **站点根**（http://host/login）——dev 落到 vite 的 base 提示页，生产 nginx 只注册了
 *   '= /exam/login' ⇒ 用户被踢到默认 404 页（W5/t7 的 F1 就是这条）。
 *   本仓既有的 withBase 口径见 client/src/views/Landing.vue（BASE = BASE_URL 去尾斜杠 + 拼路径）；
 *   本模块把同一条公式抽成唯一出口，供 request.js（401 跳登录的兜底整页跳转）、ErrorBoundary.vue
 *   （回首页兜底）等**非路由上下文**使用；路由内的跳转一律用 router.push（vue-router 自带 base）。
 *
 * 口径：
 *   · withAppBase('/login')  ⇒ '/exam/login'（base='/' ⇒ '/login'；base='/exam/' ⇒ '/exam/login'）
 *   · withAppBase('login')   ⇒ 同上（自动补前导斜杠）
 *   · withAppBase('/')       ⇒ '/exam/'（保留 base 的尾斜杠，供"回首页"用）
 *   · 非浏览器/无 BASE_URL 环境（node 自检）⇒ base 退化为 ''，与 vite 在 base='/' 下的行为一致。
 */

/** 应用基准路径（去尾斜杠；'/' ⇒ ''）。vite 会在构建期把 import.meta.env 静态替换；node 下退化为 '' */
export function appBase() {
  try {
    const raw = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
    return String(raw).replace(/\/+$/, '');
  } catch { return ''; }
}

/** base 感知的站内地址（唯一出口；等价于 Landing.vue 的 withBase） */
export function withAppBase(path) {
  const p = String(path == null ? '' : path);
  const base = appBase();
  if (!p) return base + '/';
  return base + (p.startsWith('/') ? p : '/' + p);
}

/** 是否为"裸根"字面量目标（以 / 开头的纯字符串/模板串字面量）—— 供门禁与自检复用 */
export function isBareRootTarget(expr) {
  const text = String(expr == null ? '' : expr).trim();
  const m = /^(['"`])([\s\S]*?)\1$/.exec(text);
  if (!m) return false;
  return m[2].startsWith('/');
}

export default { appBase, withAppBase, isBareRootTarget };
