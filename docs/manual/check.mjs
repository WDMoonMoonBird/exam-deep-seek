
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
// 关键：播放器是「进入视口才自动播放」（IntersectionObserver threshold 0.4）。
// 手册页很高，非首个演示一开始不在视口内 —— 必须先把它滚到视口中间（这也正是真实用户看到演示的方式），
// 否则 running 恒为 false、step 恒为 0，会出现 advanced/pausedHeld/resumed 三项假失败。
await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
await page.waitForFunction((s) => document.querySelector(s)?.dataset.running === 'true', sel, { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(300);
const read = () => page.evaluate((s) => {
  const ms = document.querySelector(s);
  return { ready: ms.dataset.ready, running: ms.dataset.running, step: +ms.dataset.step,
    count: (ms.querySelector('.ms-count') || {}).textContent,
    dfW: ms.querySelector('.df') ? Math.round(ms.querySelector('.df').getBoundingClientRect().width) : null,
    overflow: document.documentElement.scrollWidth - window.innerWidth };
}, sel);
const pin = () => page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
await pin();
const t0 = await read();
await page.waitForTimeout(2500); const t1 = await read();
await pin(); await page.locator(sel + ' .ms-play').click(); await page.waitForTimeout(800); const t2 = await read();
await page.waitForTimeout(1500); const t3 = await read();
await pin(); await page.locator(sel + ' .ms-play').click(); await page.waitForTimeout(300); const t4 = await read();
// 等它真正播到终态（长 dwell 场景 9 秒可能还没走完），最多 20 秒
await pin();
await page.waitForFunction((sel) => { const ms = document.querySelector(sel); return ms && ms.dataset.running === 'false' && +ms.dataset.step >= (+(ms.querySelector('.ms-count')?.textContent || '1/1').split('/')[1].trim() - 1); }, sel, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(200); const t5 = await read();
await page.locator(sel).screenshot({ path: '/tmp/manual/check-' + (anchor || 'all') + '-end.png' }).catch(() => {});
await pin(); await page.locator(sel + ' .ms-replay').click(); await page.waitForTimeout(300); const t6 = await read();
// 截图用元素级 API（自带滚动与边界计算），避免视口坐标在小视口/滚动后裁错
await page.locator(sel).screenshot({ path: '/tmp/manual/check-' + (anchor || 'all') + '.png' }).catch(async (e) => {
  console.warn('[warn] 元素截图失败，改用视口截图：' + String(e.message).slice(0, 80));
  await page.screenshot({ path: '/tmp/manual/check-' + (anchor || 'all') + '.png' });
});
await ctx.close(); await b.close();
const ok = { ready: t0.ready === 'true', advanced: t1.step > t0.step, pausedHeld: t3.step === t2.step,
  resumed: t4.running === 'true', finished: t5.step > 0, replayed: t6.step <= 1, noOverflow: t0.overflow === 0, noErrors: errs.length === 0 };
console.log(JSON.stringify({ anchor, width, snapshots: { t0, t1, t2, t3, t4, t5, t6 }, ok, errors: errs, shot: '/tmp/manual/check-' + (anchor || 'all') + '.png' }, null, 1));
process.exitCode = Object.values(ok).every(Boolean) ? 0 : 1;
