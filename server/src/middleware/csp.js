/**
 * csp.js —— R2-B69（WAVE4）：内容安全策略（CSP）**开关 + 保守策略**（默认只报告、不拦截）。
 *
 * 三态（env `CSP_MODE`）：`off`（不发任何 CSP 头）| `report-only`（Content-Security-Policy-Report-Only，**默认**）
 *   | `enforce`（Content-Security-Policy，真拦截）。非法/空值 ⇒ 回落 `report-only` 并告警（绝不静默变 enforce）。
 * ★回滚方式：把 `CSP_MODE` 改成 `off`（或删除该变量）即恢复「无 CSP 头」，无需改代码、无需重新构建、无需重启以外的操作。
 *
 * 策略依据（对 `client/dist` 产物与运行期实测，证据见 docs/dsh/R2-B69-实施记录.md）：
 *   · `client/dist/index.html` 有 **5 段内联脚本**（首帧主题、Vite 现代浏览器探测、legacy 兼容分流、
 *     nomodule 探测、legacy 入口 System.import）⇒ script-src 必须放行 `'unsafe-inline'`（本波不改 client/，
 *     故不用 nonce/hash；后续波次可在构建期改写成 nonce 后收紧）；
 *   · Vue 运行时/ant-design-vue 行内样式 ⇒ style-src 必须放行 `'unsafe-inline'`；
 *   · monaco 为**本站资产**（/exam/monaco/vs，AMD 运行时 + worker）⇒ script-src 'self'、worker-src blob:；
 *   · socket.io 实时通道 ⇒ connect-src 'self' + ws:/wss:；
 *   · 图片/图标含 data:、文件图标字体 ⇒ img-src/font-src 放行 data:。
 * 明确**不放**的：`*`（通配）与任何外部 CDN 源（`http(s)://…`）；`frame-ancestors` 收口为 `'self'`（防点击劫持）。
 *
 * ★R3-NGX-HEADERS（P2，R9/R10，2026-10-18）：**与 nginx 的口径关系（部署前必读）**
 *   · 线上 HTML 由 nginx 直供 ⇒ enforce 的**单一真源是 nginx**（nginx-exam.conf 的 map $exam_csp_policy；
 *     安全头自本票起集中于 security-headers.inc，禁止在各 location 手抄）。策略串仍需与本文件 buildCspDirectives() 同步。
 *   · 本中间件只作用于 **API 响应**；默认 report-only 时 API 响应会与 nginx 的 enforce 并存（浏览器按更严执行），
 *     但审计/排障会看到「双口径」两个头。**部署口径**：nginx enforce 生效后，API 进程应设 `CSP_MODE=off`
 *     （具体 env 由 R3-ENV 统一决定；本票只登记关系与现状，**不改默认值**以免破坏既有测试/行为）。
 *   · R9 分签（不得写成已修）：`'unsafe-inline'` 移除 **blocked:build-nonce**（client/dist/index.html 有 5 段
 *     构建期内联脚本，需构建期 nonce/hash 化，属独立专项，登记 DEPLOY-CHECKLIST 计划项）；`'unsafe-eval'`
 *     移除需浏览器实测 ant-design-vue CSS-in-JS 探测的降级影响，未实测前**不修改策略串**。
 */
import helmet from 'helmet';

export const CSP_MODES = ['off', 'report-only', 'enforce'];
export const CSP_DEFAULT_MODE = 'report-only';
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';
export const CSP_ENFORCE_HEADER = 'Content-Security-Policy';

/** 解析开关：默认 report-only；非法值回落默认并告警（可注入 env/warn 便于单测）。 */
export function resolveCspMode(env = process.env, { warn = console } = {}) {
  const raw = String((env && env.CSP_MODE) || '').trim().toLowerCase();
  if (!raw) return CSP_DEFAULT_MODE;
  if (CSP_MODES.includes(raw)) return raw;
  try {
    if (warn && typeof warn.warn === 'function') {
      warn.warn('[CSP] CSP_MODE 取值非法（' + String(env.CSP_MODE).slice(0, 32) + '）⇒ 回落 ' + CSP_DEFAULT_MODE + '；可选值：' + CSP_MODES.join(' | '));
    }
  } catch { /* 告警失败不影响启动 */ }
  return CSP_DEFAULT_MODE;
}

/**
 * 构造指令集（纯函数，便于单测与审计）。
 * `CSP_REPORT_URI` 可选：填了才带 report-uri（默认不带 ⇒ 违规只进浏览器控制台，不引 404 上报）。
 */
export function buildCspDirectives(env = process.env) {
  const directives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    frameSrc: ["'self'"],
    formAction: ["'self'"],
    manifestSrc: ["'self'"],
    // ★实测必需（chromium + 生产产物，证据见 docs/dsh/R2-B69-实施记录.md 与 test/e2e/csp-browser-check.mjs）：
    //   · 'unsafe-inline'：index.html 的 5 段构建期内联脚本（首帧主题 / Vite 探测与 legacy 分流 / nomodule 探测 / legacy 入口）；
    //   · 'unsafe-eval'：ant-design-vue(CSS-in-JS) 的**特性探测** `new Function("a?.b")`（产物 index-*.js 内 1 处，
    //     被 try/catch 包住）——若拦截则该探测判为“老浏览器”⇒ 静态样式退化到兼容路径（静默降级，非崩溃）；
    //   · data:：Vite 的现代浏览器探测 `import 'data:text/javascript,...'`——若拦截则 `__vite_is_modern_browser` 为 false
    //     ⇒ 浏览器改载 legacy 包（功能可用但体积/性能劣化，实测 app.js 走 index-legacy-*.js）；
    //   · blob:：monaco worker（AMD 运行时按需创建）。
    //   退出路径：client 侧构建期消除上述探测（nonce/hash 化内联脚本、替换 antd 探测）后可逐项回收。
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'data:', 'blob:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'ws:', 'wss:'],
    workerSrc: ["'self'", 'blob:'],
    childSrc: ["'self'", 'blob:'],
  };
  const reportUri = String((env && env.CSP_REPORT_URI) || '').trim();
  if (reportUri) directives.reportUri = [reportUri];
  return directives;
}

/**
 * Express 中间件：按开关下发 CSP 头。
 * - off：完全透传（不发任何 CSP 头，等于回滚）；
 * - report-only：helmet `reportOnly: true` ⇒ 只发 Report-Only 头，浏览器**只报告不拦截**；
 * - enforce：发强制头。
 * 其余 helmet 头（HSTS / nosniff / referrer 等）由 app.js 的 helmet() 继续承担（其 CSP 已关闭，避免双头）。
 */
export function cspMiddleware({ env = process.env, helmetImpl = helmet } = {}) {
  const mode = resolveCspMode(env);
  if (mode === 'off') return (_req, _res, next) => next();
  const options = {
    contentSecurityPolicy: {
      useDefaults: false,
      reportOnly: mode === 'report-only',
      directives: buildCspDirectives(env),
    },
  };
  const mw = helmetImpl(options);
  // 便于排障/测试读取实际模式（不改行为）
  mw.cspMode = mode;
  return mw;
}

export default cspMiddleware;
