/**
 * csp-browser-check.mjs —— R2-B69 真浏览器验证：逐页采集 **CSP 违规 / 控制台错误 / 页面异常**。
 *
 * 做法：临时拉起 `csp-static-harness.mjs`（真实 csp 中间件 + client/dist 静态托管，零数据库），
 *   用 Playwright/Chromium 依次打开关键页面，通过 `securitypolicyviolation` 事件 + 控制台 + requestfailed
 *   三路取证，并断言：
 *     · 无 CSP 违规（report-only 与 enforce 两种模式下都必须为 0）；
 *     · Vite 现代浏览器探测未被拦（window.__vite_is_modern_browser === true，否则会误落 legacy 包）；
 *     · SPA 已挂载（#app 有内容）且无未捕获异常。
 * 用法：`node test/e2e/csp-browser-check.mjs`（env: CSP_MODES 逗号分隔，默认 'report-only,enforce'）
 * 产物：`CSP_REPORT_OUT`（默认 /tmp/csp-browser-report.json）+ 截图 `CSP_SHOT_DIR`（默认 /tmp/csp-shots）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(__dirname, 'csp-static-harness.mjs');
const PORT = Number(process.env.PORT || 4599);
const BASE = 'http://127.0.0.1:' + PORT + '/exam';
const MODES = String(process.env.CSP_MODES || 'report-only,enforce').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = process.env.CSP_REPORT_OUT || '/tmp/csp-browser-report.json';
const SHOTS = process.env.CSP_SHOT_DIR || '/tmp/csp-shots';

// 关键页面：公开页 / 教师工作台 / 管理端 / 学生端 / 学生提交页 / 教师实训审核（Monaco）
const PAGES = [
  { name: 'login', path: '/login', role: null, expect: '登录' },
  { name: 'teacher-classes', path: '/teacher/classes', role: 'teacher', expect: null },
  { name: 'admin-grading-runs', path: '/admin/grading-runs', role: 'super_admin', expect: null },
  { name: 'student-assignments', path: '/student/assignments', role: 'student', expect: null },
  { name: 'student-submit', path: '/student/assignments/1', role: 'student', expect: null },
  { name: 'teacher-project-review-new', path: '/teacher/review/project/1', role: 'teacher', expect: null },
  { name: 'doc-manual', path: '/doc', role: null, expect: null },
];

function startHarness(mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HARNESS], { env: { ...process.env, CSP_MODE: mode, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const onData = (d) => { out += String(d); if (out.includes('CSP_HARNESS_READY')) resolve(child); };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('exit', (code) => reject(new Error('harness exited early code=' + code + ' out=' + out.slice(0, 400))));
    setTimeout(() => reject(new Error('harness start timeout: ' + out.slice(0, 400))), 15000);
  });
}

async function checkMode(browser, mode) {
  const child = await startHarness(mode);
  const results = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      const consoleMsgs = [];
      const failed = [];
      const pageErrors = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text()); });
      page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
      page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + ((r.failure() && r.failure().errorText) || '')));
      await page.addInitScript((role) => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__cspViolations.push({
            directive: e.effectiveDirective || e.violatedDirective,
            blockedURI: e.blockedURI,
            source: String(e.sourceFile || '') + ':' + (e.lineNumber || 0) + ':' + (e.columnNumber || 0),
          });
        });
        try {
          localStorage.setItem('token', 'csp-check-token');
          localStorage.setItem('ui-theme', 'light');
          if (role) localStorage.setItem('user', JSON.stringify({ id: 1, username: 'csp-check', realName: 'CSP Check', role, currentSchool: { id: 1, name: 'CSP School' } }));
          else { localStorage.removeItem('user'); localStorage.removeItem('token'); }
        } catch { /* ignore */ }
      }, p.role);
      // socket.io 不搭服务（非 CSP 关注点）：直接中止，避免噪声
      await page.route('**/socket.io/**', (r) => r.abort());
      let httpStatus = null;
      try {
        const resp = await page.goto(BASE + p.path, { waitUntil: 'load', timeout: 25000 });
        httpStatus = resp ? resp.status() : null;
      } catch (e) { pageErrors.push('goto: ' + String(e && e.message)); }
      await page.waitForTimeout(900);   // 让懒加载路由 + Monaco 初始化跑一会儿
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => ({
        violations: window.__cspViolations || [],
        modernProbe: window.__vite_is_modern_browser === true,
        appHtmlLen: (document.getElementById('app') || {}).innerHTML ? document.getElementById('app').innerHTML.length : 0,
        monacoMounted: !!document.querySelector('.monaco-editor'),
        antdStyled: document.querySelectorAll('[class*="ant-"]').length,
        legacyLoaded: !!(performance.getEntriesByType('resource').some((r) => r.name.includes('index-legacy')))
          || !!document.querySelector('script[src*="index-legacy"]'),
        title: document.title,
        url: location.href,
        bodyText: (document.body.innerText || '').slice(0, 160),
      }));
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, mode + '-' + p.name + '.png'), fullPage: false });
      const cspConsole = consoleMsgs.filter((m) => /Content Security Policy|Refused to|violates the following/i.test(m));
      results.push({
        page: p.name, path: p.path, role: p.role, httpStatus,
        cspViolations: info.violations, cspConsole, modernProbe: info.modernProbe,
        monacoMounted: info.monacoMounted, antdStyled: info.antdStyled, legacyLoaded: info.legacyLoaded,
        appHtmlLen: info.appHtmlLen, pageErrors, consoleErrorCount: consoleMsgs.length,
        consoleSample: consoleMsgs.slice(0, 5), requestFailedSample: failed.filter((u) => !u.includes('socket.io')).slice(0, 5),
        title: info.title, url: info.url, bodyText: info.bodyText,
      });
      await page.close();
    }
    await ctx.close();
  } finally {
    child.kill('SIGTERM');
  }
  return results;
}

const browser = await chromium.launch({ headless: true });
const report = { mode: [], generatedAt: new Date().toISOString(), base: BASE, pages: PAGES.map((p) => p.path) };
let blocking = 0;
try {
  for (const mode of MODES) {
    const rows = await checkMode(browser, mode);
    report[mode] = rows;
    for (const r of rows) {
      const bad = r.cspViolations.length > 0 || r.cspConsole.length > 0 || r.pageErrors.length > 0 || r.appHtmlLen === 0 || r.modernProbe !== true || r.legacyLoaded === true;
      if (bad) blocking += 1;
      console.log('[' + mode + '] ' + r.page.padEnd(26) + ' http=' + r.httpStatus + ' cspViolations=' + r.cspViolations.length + ' cspConsole=' + r.cspConsole.length + ' modernProbe=' + r.modernProbe + ' legacy=' + r.legacyLoaded + ' monaco=' + r.monacoMounted + ' appHtml=' + r.appHtmlLen + ' pageErrors=' + r.pageErrors.length + (bad ? '  ← 见报告' : ''));
    }
  }
} finally {
  await browser.close();
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('CSP_BROWSER_REPORT=' + OUT + ' blockingPages=' + blocking);
process.exit(blocking > 0 ? 2 : 0);
