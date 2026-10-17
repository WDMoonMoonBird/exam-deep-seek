#!/usr/bin/env node
/**
 * 移动端设计稿截图工具（设计验收用，非生产代码）
 *
 * 用法：
 *   node docs/mobile-app/preview/tools/shot.mjs <screen-id> <out.png> [--theme dark] [--platform android] [--base http://127.0.0.1:8123] [--width 390] [--height 844] [--scale 2]
 *   node docs/mobile-app/preview/tools/shot.mjs <screen-id>            # 默认输出 preview/shots/<id>.png
 *
 * 依赖：本机 client/node_modules/playwright（仓库已有），静态服务用仓库根目录：
 *   python3 -m http.server 8123 --bind 127.0.0.1
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(path.join(repoRoot, 'client', 'package.json'));

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flags = {};
for (const a of args) {
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    flags[k] = v === undefined ? true : v;
  }
}
const screen = positional[0];
if (!screen) {
  console.error('用法: node shot.mjs <screen-id> [out.png] [--theme dark] [--platform android]');
  process.exit(1);
}
const id = screen.replace(/\.html$/, '');
const out = positional[1] || path.resolve(__dirname, '../shots', id + '.png');
const theme = flags.theme === 'dark' ? 'dark' : 'light';
const platform = flags.platform === 'android' ? 'android' : 'ios';
const base = flags.base || 'http://127.0.0.1:8123';
const width = Number(flags.width || 390);
const height = Number(flags.height || 844);
const scale = Number(flags.scale || 2);

const screenPath = path.resolve(__dirname, '../screens', id + '.html');
if (!fs.existsSync(screenPath)) {
  console.error('找不到屏幕文件:', screenPath);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });

const { chromium } = require('playwright');
const url = base + '/docs/mobile-app/preview/screens/' + id + '.html?theme=' + theme + '&platform=' + platform;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: scale,
  isMobile: true,
  hasTouch: true,
  colorScheme: theme,
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(350);
await page.screenshot({ path: out });
await browser.close();

if (errors.length) {
  console.log('截图完成（有控制台错误）:', out);
  for (const e of errors.slice(0, 5)) console.log('  ✗', e);
  process.exitCode = 2;
} else {
  console.log('截图完成:', out);
}
