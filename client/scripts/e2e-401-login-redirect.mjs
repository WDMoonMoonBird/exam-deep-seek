#!/usr/bin/env node
/**
 * e2e-401-login-redirect.mjs —— ★W8（t10/F1/F2）**真浏览器**复核：401 必须落到应用内登录页，且不离开 SPA。
 *
 * 为什么需要它：静态门禁只能证明"代码里没有裸根跳转"，证明不了"用户真的落在应用内登录页、文案真的看得见"。
 *   本脚本用真实产物（vite preview，base=/exam/）+ 真实浏览器跑一遍完整链路，并用 **window 标记存活**
 *   证明全程是 SPA 内导航（没有整页跳转 ⇒ antd message 不会被销毁 ⇒ F2 的文案可见）。
 *
 * 依赖（都不新增包，仓库里已有）：client/devDependencies 的 @playwright/test（chromium 由 playwright 提供）、
 *   vite（preview）；**不需要后端**——API 用 playwright 路由拦截伪造 401（/api/** ⇒ 401 + code 1002），
 *   因此不需要改 server/、也不需要数据库。
 *
 * 用法：node client/scripts/e2e-401-login-redirect.mjs [--port=4178] [--headed] [--shot=/tmp/x.png]
 * 退出码：0=全部断言通过；1=有断言失败；3=前置缺失（dist 未构建 / 浏览器不可用）⇒ 跳过并打印原因。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(__dirname, '..');
const DIST = path.join(CLIENT, 'dist');
const argv = process.argv.slice(2);
const portArg = argv.find((a) => a.startsWith('--port='));
const PORT = Number(portArg ? portArg.slice('--port='.length) : 4178) || 4178;
const headed = argv.includes('--headed');
const shotArg = argv.find((a) => a.startsWith('--shot='));
const SHOT = shotArg ? shotArg.slice('--shot='.length) : '/tmp/t10-401-login.png';
const ORIGIN = 'http://127.0.0.1:' + PORT;
const BASE = '/exam/';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : ''));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return true;
    } catch { /* 还没起来 */ }
    await sleep(300);
  }
  return false;
}

async function main() {
  // ── 前置检查（缺前置 ⇒ 跳过，退出码 3；不影响常规门禁）────────────────────────────────
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('SKIP 前置缺失：dist/index.html 不存在（先跑 node client/scripts/verify-frontend.mjs 构建）');
    process.exit(3);
  }
  let chromium;
  try { ({ chromium } = await import('@playwright/test')); }
  catch { console.log('SKIP 前置缺失：@playwright/test 不可导入'); process.exit(3); }
  let browser = null;
  try {
    browser = await chromium.launch({ headless: !headed });
  } catch (e) {
    console.log('SKIP 前置缺失：chromium 启动失败（可执行 npx playwright install chromium）：' + String(e.message).slice(0, 120));
    process.exit(3);
  }

  // ── 起真实产物服务（vite preview，base=/exam/）──────────────────────────────────────
  const viteBin = path.join(CLIENT, 'node_modules', '.bin', 'vite');
  // ★--host 127.0.0.1：vite preview 默认只绑 localhost（macOS 上可能只监听 ::1），显式绑 IPv4 才能被 fetch 命中
  const previewArgs = ['preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'];
  const server = spawn(fs.existsSync(viteBin) ? viteBin : 'npx', fs.existsSync(viteBin) ? previewArgs : ['vite', ...previewArgs], { cwd: CLIENT, stdio: 'ignore' });
  const stop = () => { try { server.kill('SIGTERM'); } catch { /* ignore */ } };
  process.on('exit', stop);

  let page = null;
  try {
    const up = await waitForServer(ORIGIN + BASE + 'login', 45000);
    if (!up) { check('预览服务可启动（vite preview /exam/）', false, ORIGIN + BASE + 'login 未就绪'); return; }

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    // 真 401：任何 /api/** 都回 401 + code 1002（与 server/src/middleware/auth.js 同形态；三种文案轮换亦可）
    await page.route('**/api/**', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ code: 1002, message: '未登录或 Token 过期', data: null }),
    }));
    // ★只统计 401 专用目标（带 ?expired=1）——脚本自己的 goto（无 query）不计入，避免把"测试脚本的导航"算成"应用的跳转"
    const loginNavs = [];
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame() && frame.url().includes(BASE + 'login?expired=1')) loginNavs.push(frame.url()); });
    // ★整页刷新判别：'load' 事件只在**整文档加载**时触发（SPA 内 history 变化不触发）——用它数文档加载次数
    let loadCount = 0;
    page.on('load', () => { loadCount += 1; });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 120)));

    // ① 登录页本身：HTTP 200（base 感知目标真实存在）
    const respLogin = await page.goto(ORIGIN + BASE + 'login', { waitUntil: 'domcontentloaded' });
    check('① 应用内登录页可达（' + BASE + 'login ⇒ HTTP 200）', respLogin && respLogin.status() === 200, 'status=' + (respLogin && respLogin.status()));

    // 对照：旧实现的裸根目标（站点根 /login）**不是**应用页 —— 这就是 F1 把用户踢到 404 的原因
    const respBare = await page.goto(ORIGIN + '/login', { waitUntil: 'domcontentloaded' }).catch(() => null);
    const bareStatus = respBare ? respBare.status() : '(导航失败)';
    const bareIsApp = respBare ? (await page.locator('.login-title').count()) > 0 : false;
    check('①′ 对照：裸根 /login 不是应用页（status=' + bareStatus + '，应用外壳=' + bareIsApp + '）', !bareIsApp, 'F1 缺陷证据：裸根目标 = ' + bareStatus);

    // ② 注入失效 token 后进管理页 ⇒ 接口真 401 ⇒ 应落在应用内登录页，且**不整页刷新**
    await page.goto(ORIGIN + BASE + 'login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('token', 'invalid-token-for-e2e');
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'e2e', role: 'super_admin' }));
    });
    await page.goto(ORIGIN + BASE + 'admin/teachers', { waitUntil: 'load' });
    const loadsBefore401 = loadCount;   // 进入管理页后的文档加载次数基准
    let landed = false;
    try {
      await page.waitForURL(new RegExp(BASE.replace(/\//g, '\\/') + 'login'), { timeout: 10000 });
      landed = true;
    } catch { landed = false; }
    const urlAfter = page.url();
    check('② 401 后落在**应用内登录页**（' + BASE + 'login，而非站点根 /login ⇒ 不是 404 页）',
      landed && urlAfter.includes(BASE + 'login'),
      'url=' + urlAfter);

    // ★不离开 SPA 的判据：401 前后**没有多出一次整文档加载**（SPA 内 router.push 不会触发 load 事件）
    const extraLoads = loadCount - loadsBefore401;
    const notices = await page.locator('.ant-message-notice').allInnerTexts();
    check('②′ 全程**不离开 SPA**（401 前后无新增整文档加载 ⇒ 不是 location 整页跳转，toast 不会被销毁）',
      extraLoads === 0,
      JSON.stringify({ loadsBefore401, loadCount, extraLoads, notices }));

    // ③ 统一文案可见（两种通道都查：antd toast 与登录页 ?expired=1 的常驻提示）
    const inline = page.locator('#login-expired');
    const inlineText = (await inline.count()) ? (await inline.first().innerText()).trim() : '';
    const toastCount = await page.locator('.ant-message-notice').count();
    const toastText = toastCount ? (await page.locator('.ant-message-notice').first().innerText()).trim() : '';
    check('③ 统一文案「登录已过期，请重新登录」真实可见（登录页常驻提示 或 toast）',
      inlineText === '登录已过期，请重新登录' || toastText.includes('登录已过期，请重新登录'),
      JSON.stringify({ inline: inlineText, toast: toastText, toastCount }));

    // ④ 并发 401：只跳一次（多个 401 由 handleAuthExpired 的"只处置一次"合并）
    //   提示条数只作**观察值**：antd 的 message 容器在过渡期可能残留 1~2 个节点，真正的不变量是
    //   "统一文案的条数 ≤ 1"（同一次失败由 WeakSet 去重 ⇒ 不会出现两条同名提示）
    const unifiedToastCount = notices.filter((t) => String(t).includes('登录已过期，请重新登录')).length;
    check('④ 并发 401 只跳一次（?expired=1 导航事件 = 1）且统一文案提示不重复（≤1 条）',
      loginNavs.length === 1 && unifiedToastCount <= 1,
      JSON.stringify({ loginNavs: loginNavs.length, unifiedToastCount, notices }));
    check('④′ 无未捕获页面异常（错误边界未被触发 ⇒ 整页没被替换）', pageErrors.length === 0, JSON.stringify(pageErrors));

    // ⑤ 冷启动复核：401 实际使用的那个地址（带 ?expired=1）整页打开也是 HTTP 200 + 文案常驻
    const respCold = await page.goto(ORIGIN + BASE + 'login?expired=1', { waitUntil: 'domcontentloaded' });
    // 等 Vue 挂载出常驻提示（domcontentloaded 时脚本可能还没执行完 —— 直接读会假红）
    await page.waitForSelector('#login-expired', { timeout: 8000 }).catch(() => null);
    const coldInline = (await page.locator('#login-expired').count()) ? (await page.locator('#login-expired').first().innerText()).trim() : '';
    check('⑤ 冷启动（' + BASE + 'login?expired=1 ⇒ HTTP 200）且登录页常驻文案 = 统一口径',
      respCold && respCold.status() === 200 && coldInline === '登录已过期，请重新登录',
      JSON.stringify({ status: respCold && respCold.status(), coldInline }));

    await page.screenshot({ path: SHOT, fullPage: false });
    console.log('截图：' + SHOT);
  } finally {
    try { if (page) await page.context().close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
    stop();
  }
}

try {
  await main();
} catch (e) {
  console.error('执行错误：' + (e && e.message));
  process.exit(1);
}
const failed = results.filter((r) => !r.ok);
console.log('');
console.log('SUMMARY e2e-401 checks=' + results.length + ' failed=' + failed.length + (failed.length ? ' :: ' + failed.map((f) => f.name).join(' | ') : ''));
process.exit(failed.length ? 1 : 0);
