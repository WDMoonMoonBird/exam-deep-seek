/**
 * E2E 运行期环境 —— **端口的唯一事实源**（W1-C6）
 *
 * 背景（门禁不可无人值守）：`playwright.config.js` 的 webServer 用
 * `{ port, reuseExistingServer: false }`，任何**活跃的 dev server** 占用该端口都会让
 * E2E 直接失败（t6 实测：`http://localhost:3000 is already used`）⇒ 用备用端口即可绕开。
 *
 * 契约：
 *   · `E2E_WEB_PORT`    后端（`server/src/app.js`）端口，**默认 3000**（与历史行为一致）
 *   · `E2E_CLIENT_PORT` 前端（vite dev）端口，**默认 5173**（同上）
 *   · `E2E_WEB_HOST` / `E2E_CLIENT_HOST` 默认 `localhost`
 *   · 非法取值 ⇒ **显式抛错**（fail-loud），绝不静默回落到默认端口
 *
 * 目的之一也是消除"同一个常量在 7 个文件里各写一遍"——历史缺陷 `acct:<u>` 那类
 * 「两侧各写一遍 ⇒ 改名即失配」的同型问题。
 */
function portOf(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(name + ' 非法：' + JSON.stringify(raw) + '（应为 1..65535 的整数端口）');
  }
  return n;
}

export const E2E_WEB_PORT = portOf('E2E_WEB_PORT', 3000);
export const E2E_CLIENT_PORT = portOf('E2E_CLIENT_PORT', 5173);
export const E2E_WEB_HOST = process.env.E2E_WEB_HOST || 'localhost';
export const E2E_CLIENT_HOST = process.env.E2E_CLIENT_HOST || 'localhost';

/** 后端 API 基址（例：http://localhost:3000/api） */
export const E2E_API_BASE = 'http://' + E2E_WEB_HOST + ':' + E2E_WEB_PORT + '/api';
/** 前端基址（例：http://localhost:5173，不含 /exam 前缀） */
export const E2E_CLIENT_BASE = 'http://' + E2E_CLIENT_HOST + ':' + E2E_CLIENT_PORT;
