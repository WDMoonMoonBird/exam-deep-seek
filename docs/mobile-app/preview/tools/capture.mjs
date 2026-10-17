#!/usr/bin/env node
/**
 * 设计稿截图总控：Gallery 总览 + 37 屏单屏 + 深色 + 分组图 + 拼版 contact sheet
 * 前置：仓库根目录起静态服务：python3 -m http.server 8123 --bind 127.0.0.1
 * 运行：node docs/mobile-app/preview/tools/capture.mjs [--base http://127.0.0.1:8123]
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(path.join(repoRoot, 'client', 'package.json'));
const { chromium } = require('playwright');

const flags = {};
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); flags[k] = v === undefined ? true : v; }
}
const base = flags.base || 'http://127.0.0.1:8123';
const shots = path.resolve(__dirname, '../shots');
const screensDir = path.join(shots, 'screens');
const darkDir = path.join(shots, 'screens-dark');
const androidDir = path.join(shots, 'screens-android');
fs.mkdirSync(screensDir, { recursive: true });
fs.mkdirSync(darkDir, { recursive: true });
fs.mkdirSync(androidDir, { recursive: true });

const registry = (await import(path.join(shots, '../assets/screens.js'))).default || {};
const screens = registry.screens || [];
const groups = registry.groups || [];
const darkScreens = ['teacher-home', 'teacher-review-queue', 'teacher-review-code', 'teacher-assignments', 'teacher-batch-confirm', 'student-home', 'student-answer-objective', 'student-score-detail', 'public-login', 'admin-monitor'];
const androidScreens = ['teacher-home', 'student-home', 'public-login'];

async function scrollAll(page) {
  // 逐屏滚动触发懒加载 iframe，直到页面高度不再变化
  let lastH = 0;
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.scrollBy(0, 620));
    await page.waitForTimeout(140);
    const h = await page.evaluate(() => document.body.scrollHeight);
    const y = await page.evaluate(() => window.scrollY);
    if (y + 1300 >= h && h === lastH) break;
    lastH = h;
  }
  await page.waitForTimeout(1800);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

async function captureGallery(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/docs/mobile-app/preview/index.html', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(1200);
  await scrollAll(page);
  await page.screenshot({ path: path.join(shots, 'hero-light.png') });
  await page.screenshot({ path: path.join(shots, 'overview-light.png'), fullPage: true });
  for (const id of ['design-system', 'prototype', 'ia', 'quality', 'docs', 'platform']) {
    try {
      const el = page.locator('#' + id);
      if (await el.count()) await el.screenshot({ path: path.join(shots, 'gallery-' + id + '.png') });
    } catch (e) { console.log('skip section', id, e.message); }
  }
  for (const g of groups) {
    try {
      const el = page.locator('#group-' + g.id);
      if (await el.count()) await el.screenshot({ path: path.join(shots, 'group-' + g.id + '.png') });
    } catch (e) { console.log('skip group', g.id, e.message); }
  }

  // 深色总览
  await page.evaluate(() => localStorage.setItem('mds-gallery-theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await page.waitForTimeout(1000);
  await scrollAll(page);
  await page.screenshot({ path: path.join(shots, 'hero-dark.png') });
  await page.screenshot({ path: path.join(shots, 'overview-dark.png'), fullPage: true });
  for (const id of ['prototype', 'quality']) {
    try {
      const el = page.locator('#' + id);
      if (await el.count()) await el.screenshot({ path: path.join(shots, 'gallery-' + id + '-dark.png') });
    } catch (e) { /* ignore */ }
  }
  await ctx.close();
  return errors;
}

async function shotScreen(browser, id, theme, platform, outDir) {
  const file = path.join(__dirname, '../screens', id + '.html');
  if (!fs.existsSync(file)) return false;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, colorScheme: theme
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/docs/mobile-app/preview/screens/' + id + '.html?theme=' + theme + '&platform=' + platform, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, id + '.png') });
  await ctx.close();
  if (errors.length) return errors[0];
  return true;
}

async function captureScreens(browser) {
  const report = { ok: 0, missing: [], errors: [] };
  for (const s of screens) {
    const r = await shotScreen(browser, s.id, 'light', 'ios', screensDir);
    if (r === false) report.missing.push(s.id);
    else if (r !== true) report.errors.push(s.id + ': ' + r);
    else report.ok++;
  }
  for (const id of darkScreens) {
    if (fs.existsSync(path.join(__dirname, '../screens', id + '.html'))) await shotScreen(browser, id, 'dark', 'ios', darkDir);
  }
  for (const id of androidScreens) {
    if (fs.existsSync(path.join(__dirname, '../screens', id + '.html'))) await shotScreen(browser, id, 'light', 'android', androidDir);
  }
  return report;
}

async function captureContactSheet(browser) {
  const items = screens.filter((s) => fs.existsSync(path.join(screensDir, s.id + '.png')));
  const byGroup = groups.map((g) => ({ g, list: items.filter((s) => s.group === g.id) }));
  let html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>37 屏拼版</title>' +
    '<style>' +
    'body{margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#141922;padding:36px 40px 44px}' +
    'h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}.sub{font-size:13px;color:#6b7280;margin:0 0 28px}' +
    '.gsec h2{font-size:15px;margin:26px 0 12px;letter-spacing:-.01em}.gsec h2 span{color:#6b7280;font-weight:400;font-size:12px;margin-left:6px}' +
    '.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-gap:14px}' +
    '.card{background:#fff;border:1px solid #e2e5ea;border-radius:10px;padding:7px 7px 9px}' +
    '.card img{display:block;width:100%;border-radius:6px;border:1px solid #eef0f4}' +
    '.cap{margin-top:6px;font-size:10.5px;font-weight:600;color:#141922;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.id{font-family:ui-monospace,Menlo,monospace;font-size:8.5px;color:#8b929e;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '</style></head><body><h1>Deadpan 判题 · 移动端 37 屏</h1><p class="sub">390 × 844 · 2× DPR · 真实 HTML 渲染 · branch feat/mobile-app</p>';
  for (const { g, list } of byGroup) {
    if (!list.length) continue;
    html += '<section class="gsec"><h2>' + g.name + '<span>' + list.length + ' 屏 · ' + g.role + '</span></h2><div class="grid">';
    for (const s of list) {
      html += '<div class="card"><img src="screens/' + s.id + '.png" alt="' + s.title + '"><div class="cap">' + s.title + '</div><div class="id">' + s.id + '</div></div>';
    }
    html += '</div></section>';
  }
  html += '</body></html>';
  const file = path.join(shots, 'contact-sheet.html');
  fs.writeFileSync(file, html);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto(base + '/docs/mobile-app/preview/shots/contact-sheet.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, 'contact-sheet.png'), fullPage: true });
  await ctx.close();
  return items.length;
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  console.log('— 单屏截图');
  let report = { ok: 0, missing: [], errors: [] };
  if (!flags['skip-screens']) {
    report = await captureScreens(browser);
    console.log('  完成', report.ok, '屏；缺失', report.missing.length, report.missing.join(', '));
    if (report.errors.length) console.log('  页面错误', report.errors.slice(0, 8));
  } else {
    console.log('  (skip-screens)');
  }
  console.log('— Gallery 截图');
  const gerrs = await captureGallery(browser);
  if (gerrs.length) console.log('  gallery 页面错误', gerrs.slice(0, 5));
  console.log('— 拼版');
  const n = await captureContactSheet(browser);
  await browser.close();
  console.log('全部完成：', n, '屏拼版；用时', ((Date.now() - t0) / 1000).toFixed(1) + 's');
})();
