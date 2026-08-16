import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  // BUG-002 处置：默认收集排除公网生产用例（prod-*.spec.js 为生产环境手工执行）与安全探测脚本
  testIgnore: ['**/prod*.spec.js', '**/security-prod-test.js'],
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    ignoreHTTPSErrors: true,
  },

  webServer: [
    {
      // DATABASE_URL 内联进 shell 命令（实测 webServer env 选项在部分版本不生效，
      // 不内联会导致 server 加载 .env 连开发库，污染非测试环境——BUG-E2E-06）
      command: 'cd .. && DATABASE_URL=' + JSON.stringify(DBURL_TEST) + ' npm start',
      port: 3000,
      timeout: 10000,
      reuseExistingServer: false,
    },
    {
      command: 'cd ../../../client && npx vite --port 5173 --strictPort',
      port: 5173,
      timeout: 15000,
      reuseExistingServer: true,
    },
  ],

  globalSetup: './global.setup.js',
});
