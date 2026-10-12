
// 手册演示自证脚本：node /tmp/manual/check.mjs <anchor> [width]
import { createRequire } from 'node:module';
const reqClient = createRequire('/Users/you/My Projects/My Vue/Exam-DeepSeek/client/package.json');
const { chromium } = reqClient('playwright');
const [anchor = '', widthArg = '1280'] = process.argv.slice(2);
const width = +widthArg;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
await page.goto('http://localhost:5173/exam/doc/demos', { waitUntil: 'networkidle' });
let sel = anchor ? '#demo-' + anchor + ' .ms' : '.ms';
// anchor 不存在时回退到第一个演示（并提示），避免因为写错 id 白等 20 秒
try { await page.waitForSelector(sel + '[data-ready="true"]', { timeout: 8000 }); }
catch { console.warn('[warn] 未找到 ' + sel + '，回退到第一个演示'); sel = '.ms'; await page.waitForSelector(sel + '[data-ready="true"]', { timeout: 15000 }); }
await page.waitForTimeout(300);
const read = () => page.evaluate((s) => {
  const ms = document.querySelector(s);
  return { ready: ms.dataset.ready, running: ms.dataset.running, step: +ms.dataset.step,
    count: (ms.querySelector('.ms-count') || {}).textContent,
    dfW: ms.querySelector('.df') ? Math.round(ms.querySelector('.df').getBoundingClientRect().width) : null,
    overflow: document.documentElement.scrollWidth - window.innerWidth };
}, sel);
const t0 = await read();
await page.waitForTimeout(2500); const t1 = await read();
await page.locator(sel + ' .ms-play').click(); await page.waitForTimeout(800); const t2 = await read();
await page.waitForTimeout(1500); const t3 = await read();
await page.locator(sel + ' .ms-play').click(); await page.waitForTimeout(300); const t4 = await read();
await page.waitForTimeout(9000); const t5 = await read();
await page.locator(sel + ' .ms-replay').click(); await page.waitForTimeout(300); const t6 = await read();
const box = await page.locator(sel).boundingBox();
await page.screenshot({ path: '/tmp/manual/check-' + (anchor || 'all') + '.png', clip: { x: box.x - 8, y: box.y - 8, width: Math.min(box.width + 16, width), height: Math.min(box.height + 16, 900) } });
await ctx.close(); await b.close();
const ok = { ready: t0.ready === 'true', advanced: t1.step > t0.step, pausedHeld: t3.step === t2.step,
  resumed: t4.running === 'true', finished: t5.step > 0, replayed: t6.step <= 1, noOverflow: t0.overflow === 0, noErrors: errs.length === 0 };
console.log(JSON.stringify({ anchor, width, snapshots: { t0, t1, t2, t3, t4, t5, t6 }, ok, errors: errs, shot: '/tmp/manual/check-' + (anchor || 'all') + '.png' }, null, 1));
process.exitCode = Object.values(ok).every(Boolean) ? 0 : 1;
