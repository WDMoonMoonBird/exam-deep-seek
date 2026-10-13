/**
 * csp-static-harness.mjs —— R2-B69 真浏览器验证用的**静态托管夹具**（零数据库依赖）。
 *
 * 目的：把 `client/dist` 按生产口径挂在 `/exam/**`（含 SPA fallback），并挂上**真实的**
 *   `server/src/middleware/csp.js`，从而在不动数据库、不部署的前提下验证「CSP 不破坏 SPA」。
 * 用法：`node test/e2e/csp-static-harness.mjs`（env: CSP_MODE=off|report-only|enforce，默认 report-only；PORT 默认 4599）
 * 配套：`node test/e2e/csp-browser-check.mjs`（Playwright/chromium 逐页采集 CSP 违规与控制台证据）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { cspMiddleware } from '../../src/middleware/csp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DIST_DIR 可覆盖（默认 client/dist）——用于「冻结一份产物」后验证，避免与并发中的 client 构建相互干扰
const DIST = path.resolve(process.env.DIST_DIR || path.resolve(__dirname, '../../../client/dist'));
const PORT = Number(process.env.PORT || 4599);
const MODE = process.env.CSP_MODE || 'report-only';

const app = express();
app.use(cspMiddleware());                       // ← 真实中间件（开关取 env.CSP_MODE）
app.disable('x-powered-by');

// API 兜底：夹具不连库；/exam/api/** 一律返回最小结构（页面渲染即可，断言只看 CSP）
app.all(/^\/exam\/api\/.*|^\/api\/.*/, (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { list: [], items: [], total: 0, page: 1, pageSize: 20 } });
});

app.use('/exam', express.static(DIST));
app.get(/^\/exam(\/.*)?$/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));   // SPA fallback

const server = app.listen(PORT, () => {
  console.log('CSP_HARNESS_READY port=' + PORT + ' mode=' + MODE + ' dist=' + DIST);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
