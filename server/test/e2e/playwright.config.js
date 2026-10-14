import { defineConfig } from '@playwright/test';
import crypto from 'crypto';
import { E2E_WEB_PORT, E2E_CLIENT_PORT } from './e2e-env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ★W0-C：C2 修复后服务端**要求** INTERNAL_SECRET 显式配置（缺失即拒绝启动）。
// 该 webServer 由本配置拉起 ⇒ 注入一次运行内稳定的随机值；不得写成仓库字面量默认值。
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || crypto.randomBytes(32).toString('hex');

// e2e 数据隔离铁律：从 server/.env 派生测试库 URL，webServer 强制注入。
// 严禁让 e2e 服务加载 .env 默认的开发库（exam_system）——setup/spec 会写库。
function testDbUrl() {
  const envPath = path.resolve(__dirname, '../../.env');
  const m = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('server/.env 缺少 DATABASE_URL，无法派生测试库 URL');
  const u = new URL(m[1].trim());
  u.pathname = '/exam_system_test';
  return u.toString();
}
const DBURL_TEST = testDbUrl();

export default defineConfig({
  testDir: '.',
  // ★W1-C6：**整轮总超时保护**（此前无任何机制阻止单用例把门禁拖到 180s×N；retries=1 会再翻倍）。
  //   默认 15 分钟，可用 E2E_GLOBAL_TIMEOUT_MS 覆盖（非正数 ⇒ 0 = 交由 Playwright 默认，不设上限）。
  globalTimeout: (() => {
    const raw = process.env.E2E_GLOBAL_TIMEOUT_MS;
    if (raw === undefined || raw === '') return 900000;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })(),
  // BUG-002 处置：默认收集排除公网生产用例（prod-*.spec.js 为生产环境手工执行）与安全探测脚本
  testIgnore: ['**/prod*.spec.js', '**/security-prod-test.js'],
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:' + E2E_CLIENT_PORT,
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
  },

  webServer: [
    {
      // DATABASE_URL 内联进 shell 命令（实测 webServer env 选项在部分版本不生效，
      // 不内联会导致 server 加载 .env 连开发库，污染非测试环境——BUG-E2E-06）
      command: 'cd .. && DATABASE_URL=' + JSON.stringify(DBURL_TEST) + ' INTERNAL_SECRET=' + JSON.stringify(INTERNAL_SECRET)
        + ' PORT=' + JSON.stringify(String(E2E_WEB_PORT)) + ' npm start',
      port: E2E_WEB_PORT,
      timeout: 10000,
      reuseExistingServer: false,
    },
    {
      // ★W1-C6：`client/vite.config.js:165` 的开发代理**硬编码** `target: http://localhost:3000`（不在本任务写域）。
      //   后端一旦不在 3000（用户 dev server 常驻），浏览器侧 /api 会被代理回 3000 的**开发库** ⇒ UI 用例全红。
      //   处置：仅当后端端口不是 3000 时，给 vite 注入 `VITE_API_BASE_URL`（`client/src/api/request.js:29` 支持），
      //   让浏览器**直连**本次 E2E 的后端（后端 CORS 放行任意 localhost 源 ⇒ 跨源可用）。
      //   默认端口（3000）时**不注入** ⇒ 不设环境变量时行为与现状逐字一致。
      //   同理第二条代理规则 `/exam/socket.io → http://127.0.0.1:3002` 也写死（socket 路径见
      //   `client/src/composables/socketConfig.js` 的 `VITE_WS_URL`/`VITE_WS_PATH`）⇒ 备用端口下一并直连
      //   E2E 后端；**当前没有任何 E2E 用例使用 socket.io**（`grep -rl socket server/test/e2e/*.js` = 0），
      //   故该注入属**预防性**、本轮未被用例触发（覆盖盲区已在报告 §5 显式声明）。
      command: 'cd ../../../client && '
        + (E2E_WEB_PORT === 3000 ? '' : 'VITE_API_BASE_URL=' + JSON.stringify('http://localhost:' + E2E_WEB_PORT + '/api') + ' ')
        + (E2E_WEB_PORT === 3000 ? '' : 'VITE_WS_URL=' + JSON.stringify('http://localhost:' + E2E_WEB_PORT) + ' VITE_WS_PATH=/socket.io ')
        + 'npx vite --port ' + E2E_CLIENT_PORT + ' --strictPort',
      port: E2E_CLIENT_PORT,
      timeout: 15000,
      reuseExistingServer: true,
    },
  ],

  globalSetup: './global.setup.js',
});
