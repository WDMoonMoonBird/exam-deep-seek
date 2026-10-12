#!/usr/bin/env node
/**
 * docs/manual/shots.mjs —— 教师使用手册「演示配图」批量生成器（Playwright）
 * =============================================================================
 * 产出两类 PNG（都落到 client/public/doc-img/，且只新增 demo-* 前缀文件）：
 *
 *   A) fallback 兜底图：打开真实页面 → 等就绪 → 截「指定区域」→ 归一到宽 1200（≈演示框 1200×720）
 *      文件名：demo-<key>-light.png / demo-<key>-dark.png
 *      ⚠ 命名不是随便取的：Doc.vue 里写死了
 *          fallback: '/exam/doc-img/demo-' + meta.anchor + '-light.png'
 *        所以 key 必须等于手册章节的 anchor（quickstart / classes / students / teams /
 *        questions / assignments / review / project …）才能被自动兜底命中。
 *
 *   B) focus 定位图：只截「要点容器」——四周压暗（半透明遮罩挖空）+ 2px 品牌描边 +
 *      序号气泡（带中文标签），用来替代"太大太全"的旧整页截图。
 *      文件名：demo-<key>-focus-light.png / demo-<key>-focus-dark.png
 *
 * 用法
 *   node docs/manual/shots.mjs                       # 全部场景 × 亮/暗 × 两类
 *   node docs/manual/shots.mjs --list                # 只打印场景清单
 *   node docs/manual/shots.mjs --only classes,teams  # 只跑指定 key
 *   node docs/manual/shots.mjs --kind focus          # fallback | focus | both（默认 both）
 *   node docs/manual/shots.mjs --theme dark          # light | dark | both（默认 both）
 *   node docs/manual/shots.mjs --out /tmp/x          # 换输出目录（默认 client/public/doc-img）
 *   node docs/manual/shots.mjs --base http://localhost:5173/exam
 *
 * 前置条件（脚本不代劳，缺了会明确报错）
 *   1) 前端 dev server 已起（默认 http://localhost:5173，vite base = /exam/）
 *   2) 后端已起（登录走 dev server 的 /api 代理；账号见 ACCOUNTS）
 *   3) client/node_modules 里有 playwright（本脚本不装依赖、不改 package.json）
 *
 * 边界（硬约束，勿越线）
 *   · 只读浏览：除「登录换 token」外不写任何数据；脚本不会点任何保存/提交/删除类按钮
 *     （"布置作业"只用来打开弹窗，不点弹窗里的"立即布置"）
 *   · 不改 client/src 下任何文件；不改后端；不 git；不装依赖
 *   · 落盘文件一律在 --out 目录内、且文件名以 demo- 开头（非 demo- 前缀一律拒绝写）
 *
 * 增删场景：只改下面的 SCENARIOS 数组；字段含义见数组上方注释与 README.md。
 */

import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/* ------------------------------------------------------------------ 环境常量 */

/** playwright 从 client/package.json 解析（用 client 下装的那一份；可用 SHOTS_REQUIRE_FROM 覆盖） */
const CLIENT_PACKAGE_JSON = process.env.SHOTS_REQUIRE_FROM || path.join(REPO_ROOT, 'client', 'package.json');
const require = createRequire(CLIENT_PACKAGE_JSON);

const BASE_URL = process.env.SHOTS_BASE_URL || 'http://localhost:5173/exam';
/** 登录接口：走 dev server 的 /api 代理，避免 CORS */
const API_URL = process.env.SHOTS_API_URL || BASE_URL.replace(/\/exam\/?$/, '') + '/api';

/** 演示框是 1200×720；页面截图默认给「侧栏之外的主区域」725 高，缩到 1200 宽后正好 ≈1200×720 */
const DEFAULT_VIEWPORT = { width: 1440, height: 725 };
const TARGET_WIDTH = 1200;         // 统一归一到这个宽度（只缩不放）
const SIZE_BUDGET = 200 * 1024;    // 单张体积预算（超了用 sips 继续缩，直到达标或触底）

/** 演示账号（手册是公开路由，但截图要看真实数据，所以脚本必须登录） */
const ACCOUNTS = {
  teacher: { username: 'e2e_teacher', password: 'e2e_teacher' },
  student: { username: '202600001', password: '202600001' },
  admin: { username: 'admin', password: '***REDACTED***' },
};

/* ============================================================== 场景配置数组
 * 字段：
 *   key       必填。文件名片段；**要能被 Doc.vue 兜底命中就必须等于手册 anchor**
 *   title     说明用（清单 / manifest 里显示）
 *   url       必填。路由（相对 BASE_URL，如 '/teacher/classes'）
 *   login     必填。'teacher' | 'student' | 'admin' | 'none'（none = 游客，如登录页）
 *   selector  必填。fallback 的截取区域（一般是 '.content' = 侧栏右侧主区域）
 *   padding   focus 图四周留白（CSS 像素；默认 44；要放序号气泡就别低于 36）
 *   highlight focus 的「要点容器」：[{ selector, label }]；label 画进序号气泡
 *   before    截图前的准备动作（可选，顺序执行）：
 *               { clickText: '布置作业' }          按可见按钮文字点
 *               { click: '.content .ant-select' }  按选择器点
 *               { pickOption: { index: 0 } }       在已展开的下拉里选第 N 项（或 { text: '…' }）
 *               { waitFor: '选择器' } / { wait: 500 }
 *   ready     就绪选择器（可选，默认取 selector）
 *   viewport  覆盖默认视口（可选；无侧栏的登录页用 1200×720 与演示框 1:1）
 *   settle    就绪后再等的毫秒（可选，默认 500）
 *   note      manifest 备注
 */
const SCENARIOS = [
  {
    key: 'quickstart',
    title: '2. 快速入门 · 登录页',
    url: '/login',
    login: 'none',
    viewport: { width: 1200, height: 720 },
    selector: 'body',
    padding: 48,
    ready: '.login-card',
    highlight: [{ selector: '.login-card', label: '工号 + 密码登录' }],
    note: '公开页，游客态；无侧栏故用 1200×720 视口（与演示框 1:1）',
  },
  {
    key: 'classes',
    title: '3. 班级管理 · 班级列表',
    url: '/teacher/classes',
    login: 'teacher',
    selector: '.content',
    ready: '.ant-table-tbody > tr.ant-table-row',
    highlight: [
      { selector: '.page-head', label: '新增班级' },
      { selector: '.ant-table-thead', label: '班级 / 人数 / 操作列' },
    ],
    note: '教师 e2e_teacher / test_university',
  },
  {
    key: 'students',
    title: '4. 学生管理 · 班级名单',
    url: '/teacher/students',
    login: 'teacher',
    selector: '.content',
    ready: '.content .ant-select',
    before: [
      { click: '.content .ant-select' },
      { pickOption: { index: 0 } },
      { waitFor: '.ant-table-tbody > tr.ant-table-row' },
    ],
    highlight: [
      { selector: '.page-head', label: '单个新增 / 批量导入' },
      { selector: '.content .ant-select', label: '先选班级' },
    ],
    note: '该页必须先选班级才出名单，故 before 里展开下拉选第 1 项',
  },
  {
    key: 'teams',
    title: '5. 教学团队 · 团队列表',
    url: '/teacher/teams',
    login: 'teacher',
    selector: '.content',
    ready: '.ant-table-tbody > tr.ant-table-row',
    highlight: [
      { selector: '.page-head', label: '创建团队' },
      { selector: '.ant-table-thead', label: '团队 / 成员 / 操作列' },
    ],
  },
  {
    key: 'questions',
    title: '6. 题库管理 · 题目列表',
    url: '/teacher/questions',
    login: 'teacher',
    selector: '.content',
    ready: '.ant-table-tbody > tr.ant-table-row',
    highlight: [
      { selector: '.page-head', label: '新增题目' },
      { selector: '.ant-table-thead', label: '标题 / 类型 / 难度 / 满分' },
    ],
  },
  {
    key: 'assignments',
    title: '8. 作业管理 · 作业列表',
    url: '/teacher/assignments',
    login: 'teacher',
    selector: '.content',
    ready: '.ant-table-tbody > tr.ant-table-row',
    highlight: [
      { selector: '.page-head', label: '布置作业' },
      { selector: '.kpi-row', label: '作业概况（含待审核）' },
    ],
  },
  {
    key: 'assignments-modal',
    title: '8. 作业管理 · 布置作业弹窗',
    url: '/teacher/assignments',
    login: 'teacher',
    selector: '.ant-modal-content',
    padding: 40,
    ready: '.ant-table-tbody > tr.ant-table-row',
    before: [
      { clickText: '布置作业' },
      { waitFor: '.ant-modal-content' },
      { wait: 400 },
    ],
    highlight: [{ selector: '.assign-side', label: '布置概要 · 立即布置' }],
    note: '扩展键（非 anchor）：弹窗高 1171 > 视口 725，只截视口内那一段；只开弹窗不提交',
  },
  {
    key: 'project',
    title: '7. 实训题 · 新建实训题',
    url: '/teacher/questions/new/project',
    login: 'teacher',
    selector: '.content',
    ready: '.meta-row',
    highlight: [
      { selector: '.page-head', label: '返回题库管理' },
      { selector: '.meta-row', label: '难度 / 满分 / 题目描述 / 保存' },
    ],
    note: '扩展键（对应 anchor=project 的兜底位）：新建页，只读不保存',
  },
  {
    key: 'review',
    title: '11. 评分审核 · 审核列表',
    url: '/teacher/review',
    login: 'teacher',
    selector: '.content',
    ready: '.ant-table-tbody > tr.ant-table-row',
    highlight: [
      { selector: '.content .toolbar', label: '按班级筛选' },
      { selector: '.ant-table-thead', label: 'AI状态 / 审核状态 / 已交未交' },
    ],
  },
];

/* ------------------------------------------------------------------ 小工具 */

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (n) => (n / 1024).toFixed(1) + 'KB';

function parseArgs(argv) {
  const out = {
    kind: 'both',
    theme: 'both',
    only: null,
    out: path.join(REPO_ROOT, 'client', 'public', 'doc-img'),
    base: BASE_URL,
    list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--list') out.list = true;
    else if (a === '--only') out.only = String(next()).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--kind') out.kind = next();
    else if (a === '--theme') out.theme = next();
    else if (a === '--out') out.out = path.resolve(next());
    else if (a === '--base') out.base = next().replace(/\/$/, '');
    else if (a === '-h' || a === '--help') out.help = true;
    else throw new Error('未知参数：' + a + '（--help 看用法）');
  }
  if (!['both', 'fallback', 'focus'].includes(out.kind)) throw new Error('--kind 只能是 fallback|focus|both');
  if (!['both', 'light', 'dark'].includes(out.theme)) throw new Error('--theme 只能是 light|dark|both');
  return out;
}

/** 截图前注入：冻结动画/过渡、隐藏瞬时提示、去掉焦点圈 —— 保证可复现 */
const FREEZE_CSS = [
  '*, *::before, *::after {',
  '  animation-duration: 0s !important;',
  '  animation-delay: 0s !important;',
  '  animation-iteration-count: 1 !important;',
  '  transition-duration: 0s !important;',
  '  transition-delay: 0s !important;',
  '  caret-color: transparent !important;',
  '}',
  '.ant-message, .ant-notification { display: none !important; }',
  '.ant-spin-spinning { display: none !important; }',
].join('\n');

async function loginAs(role, apiBase) {
  if (role === 'none') return null;
  const acc = ACCOUNTS[role];
  if (!acc) throw new Error('未知 login 角色：' + role);
  const res = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(acc),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.code !== 0 || !body.data) {
    throw new Error('登录失败（' + role + ' / ' + acc.username + '）：HTTP ' + res.status + ' ' + JSON.stringify(body).slice(0, 200));
  }
  return body.data;   // { token, user }
}

async function fileSize(file) { return (await stat(file)).size; }

/** sips 等比缩放到指定宽度（只缩不放）；macOS 自带，失败不致命 */
async function sipsResizeWidth(file, width) {
  try {
    await execFileAsync('sips', ['--resampleWidth', String(Math.round(width)), file], { maxBuffer: 1 << 24 });
    return true;
  } catch (e) {
    log('   ⚠ sips 缩放失败（忽略）：' + String(e.message).slice(0, 120));
    return false;
  }
}

/** 压到预算内：先归一到 TARGET_WIDTH，再按 12% 递减宽度，直到达标（宽度下限 900） */
async function fitToBudget(file, budget = SIZE_BUDGET) {
  let size = await fileSize(file);
  let width = TARGET_WIDTH;
  while (size > budget && width > 900) {
    width = Math.round(width * 0.88);
    if (!(await sipsResizeWidth(file, width))) break;
    size = await fileSize(file);
  }
  return { size, width, over: size > budget };
}

/* --------------------------------------------------- 页面动作 / 就绪 / 覆盖层 */

async function gotoReady(page, scn, base) {
  await page.goto(base + scn.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const readySel = scn.ready || scn.selector;
  await page.waitForSelector(readySel, { state: 'visible', timeout: 20000 });
  await page.waitForSelector('.ant-spin-spinning', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())).catch(() => {});
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.waitForTimeout(scn.settle == null ? 500 : scn.settle);
}

async function runBefore(page, scn) {
  for (const step of scn.before || []) {
    if (step.wait) { await page.waitForTimeout(step.wait); continue; }
    if (step.waitFor) {
      await page.waitForSelector(step.waitFor, { state: 'visible', timeout: 20000 });
      await page.waitForTimeout(300);
      continue;
    }
    if (step.clickText) {
      const byRole = page.getByRole('button', { name: step.clickText });
      if (await byRole.count()) await byRole.first().click({ timeout: 10000 });
      else await page.locator('button:has-text("' + step.clickText + '")').first().click({ timeout: 10000 });
      await page.waitForTimeout(350);
      continue;
    }
    if (step.click) {
      await page.locator(step.click).first().click({ timeout: 10000 });
      await page.waitForTimeout(350);
      continue;
    }
    if (step.pickOption) {
      const dd = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
      await dd.first().waitFor({ state: 'visible', timeout: 10000 });
      const opts = dd.first().locator('.ant-select-item-option');
      const n = await opts.count();
      if (!n) throw new Error('下拉里没有可选项（' + scn.key + '）');
      const idx = step.pickOption.index != null ? Math.min(step.pickOption.index, n - 1) : 0;
      await opts.nth(idx).click();
      await page.waitForTimeout(400);
      continue;
    }
    throw new Error('不支持的 before 步骤：' + JSON.stringify(step));
  }
  // 点过的按钮会留焦点圈：截图前 blur 掉，并确保窗口没滚动（clip 用视口坐标）
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

/** 量取截图区域：fallback = selector 区域；focus = 所有 highlight 的并集 + padding。都截断到视口内 */
async function measure(page, scn, kind) {
  return page.evaluate(({ scn, kind }) => {
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const rectOf = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const clamp = (r) => {
      const x1 = Math.max(0, r.x);
      const y1 = Math.max(0, r.y);
      const x2 = Math.min(vp.w, r.x + r.w);
      const y2 = Math.min(vp.h, r.y + r.h);
      return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
    };
    if (kind === 'fallback') {
      const raw = scn.selector === 'body' ? { x: 0, y: 0, w: vp.w, h: vp.h } : rectOf(scn.selector);
      if (!raw) throw new Error('selector 量不到：' + scn.selector);
      return { clip: clamp(raw), targets: [], vp, pad: 0 };
    }
    const pad = scn.padding == null ? 44 : scn.padding;
    const targets = (scn.highlight || []).map((h) => {
      const r = rectOf(h.selector);
      if (!r) throw new Error('highlight 量不到：' + h.selector);
      return { x: r.x, y: r.y, w: r.w, h: r.h, label: h.label || h.selector };
    });
    if (!targets.length) throw new Error('focus 需要至少一个 highlight');
    let ux1 = Infinity;
    let uy1 = Infinity;
    let ux2 = -Infinity;
    let uy2 = -Infinity;
    for (const t of targets) {
      ux1 = Math.min(ux1, t.x);
      uy1 = Math.min(uy1, t.y);
      ux2 = Math.max(ux2, t.x + t.w);
      uy2 = Math.max(uy2, t.y + t.h);
    }
    const clip = clamp({ x: ux1 - pad, y: uy1 - pad, w: (ux2 - ux1) + pad * 2, h: (uy2 - uy1) + pad * 2 });
    return { clip, targets, vp, pad };
  }, { scn, kind });
}

/** focus 的「压暗 + 描边 + 序号气泡」覆盖层：全部画在页面里（不碰任何源文件） */
async function drawFocusOverlay(page, measured) {
  await page.evaluate(({ clip, targets }) => {
    const old = document.getElementById('__shots_overlay');
    if (old) old.remove();
    const cs = getComputedStyle(document.documentElement);
    const BRAND = cs.getPropertyValue('--brand-600').trim() || '#0066cc';
    const dark = document.documentElement.dataset.theme === 'dark';
    const DIM = dark ? 'rgba(0,0,0,0.62)' : 'rgba(15,23,42,0.52)';
    const root = document.createElement('div');
    root.id = '__shots_overlay';
    root.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;');
    // 必须先挂进文档：detached 元素的 getBoundingClientRect() 全是 0，会让下面的落点判定全部误判
    document.body.appendChild(root);
    const band = (x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      const d = document.createElement('div');
      d.setAttribute('style', 'position:absolute;background:' + DIM + ';left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;');
      root.appendChild(d);
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    band(0, 0, vw, clip.y);
    band(0, clip.y + clip.h, vw, vh - (clip.y + clip.h));
    band(0, clip.y, clip.x, clip.h);
    band(clip.x + clip.w, clip.y, vw - (clip.x + clip.w), clip.h);
    const chips = [];
    targets.forEach((t, i) => {
      const ring = document.createElement('div');
      ring.setAttribute('style', 'position:absolute;box-sizing:border-box;border:2px solid ' + BRAND + ';border-radius:8px;'
        + 'left:' + (t.x - 3) + 'px;top:' + (t.y - 3) + 'px;width:' + (t.w + 6) + 'px;height:' + (t.h + 6) + 'px;'
        + 'box-shadow:0 0 0 1px rgba(255,255,255,.55), 0 0 0 4px ' + (dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)') + ';');
      root.appendChild(ring);
      const chip = document.createElement('div');
      chip.textContent = (i + 1) + ' · ' + t.label;
      chip.setAttribute('style', 'position:absolute;display:inline-block;white-space:nowrap;'
        + 'font:600 12px/1.5 -apple-system,"PingFang SC",system-ui,sans-serif;color:#fff;background:' + BRAND + ';'
        + 'padding:2px 8px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.35);');
      root.appendChild(chip);
      chips.push(chip);
    });
    // 气泡落点：目标上方留白 → 目标下方留白 → 目标内部左上角（避开别的要点容器、且不许飘出截图区）
    chips.forEach((chip, i) => {
      const t = targets[i];
      const box = () => chip.getBoundingClientRect();
      const hits = (r) => targets.some((o, j) => j !== i && r.left < o.x + o.w + 6 && r.right + 6 > o.x && r.top < o.y + o.h + 6 && r.bottom + 6 > o.y);
      const fits = (r) => r.left >= clip.x + 4 && r.top >= clip.y + 4 && r.right <= clip.x + clip.w - 4 && r.bottom <= clip.y + clip.h - 4;
      const place = (x, y) => { chip.style.left = x + 'px'; chip.style.top = y + 'px'; };
      const h = box().height || 22;
      place(t.x, t.y - h - 6);
      if (!fits(box()) || hits(box())) {
        place(t.x, t.y + t.h + 6);
        if (!fits(box()) || hits(box())) place(t.x + 6, t.y + 6);
      }
    });
    // 气泡互撞：按顺序比较，撞了整体右移；最后夹在截图区内
    const boxes = chips.map((c) => c.getBoundingClientRect());
    for (let i = 0; i < chips.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = boxes[j];
        const b = chips[i].getBoundingClientRect();
        if (b.left < a.right + 6 && b.right + 6 > a.left && b.top < a.bottom && b.bottom > a.top) {
          chips[i].style.left = (a.right + 8) + 'px';
          boxes[i] = chips[i].getBoundingClientRect();
        }
      }
      const b = chips[i].getBoundingClientRect();
      if (b.right > clip.x + clip.w - 4) chips[i].style.left = Math.max(clip.x + 4, clip.x + clip.w - 4 - b.width) + 'px';
      if (b.left < clip.x + 4) chips[i].style.left = (clip.x + 4) + 'px';
    }
  }, measured);
}

/* ------------------------------------------------------------------- 主流程 */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    const src = await readFile(fileURLToPath(import.meta.url), 'utf8');
    log(src.slice(0, src.indexOf('*/') + 2));
    return;
  }
  if (args.list) {
    for (const s of SCENARIOS) log([s.key.padEnd(18), s.login.padEnd(8), s.url.padEnd(34), s.title].join(' '));
    return;
  }

  const { chromium } = require('playwright');
  await mkdir(args.out, { recursive: true });

  // 先按角色登录一次（省时，也提前暴露"后端没起"这类问题）
  const sessions = {};
  for (const role of new Set(SCENARIOS.map((s) => s.login))) {
    if (role === 'none') continue;
    sessions[role] = await loginAs(role, API_URL);
    const u = sessions[role].user;
    log('登录成功：' + role.padEnd(8) + '→ ' + (u.realName || u.username) + '（' + u.role + '，' + ((u.currentSchool && u.currentSchool.name) || '-') + '）');
  }

  const wanted = SCENARIOS.filter((s) => !args.only || args.only.includes(s.key));
  if (!wanted.length) throw new Error('--only 没匹配到任何场景；用 --list 看可用 key');
  const themes = args.theme === 'both' ? ['light', 'dark'] : [args.theme];
  const kinds = args.kind === 'both' ? ['fallback', 'focus'] : [args.kind];

  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];
  try {
    for (const scn of wanted) {
      for (const theme of themes) {
        for (const kind of kinds) {
          const name = 'demo-' + scn.key + (kind === 'focus' ? '-focus' : '') + '-' + theme + '.png';
          if (!name.startsWith('demo-')) throw new Error('拒绝写非 demo- 前缀文件：' + name);
          const file = path.join(args.out, name);
          const shotErrors = [];
          const ctx = await browser.newContext({
            viewport: scn.viewport || DEFAULT_VIEWPORT,
            deviceScaleFactor: 1,
            locale: 'zh-CN',
            reducedMotion: 'reduce',
          });
          try {
            if (scn.login !== 'none') {
              const s = sessions[scn.login];
              await ctx.addInitScript(([token, user, th]) => {
                localStorage.setItem('token', token);
                localStorage.setItem('user', user);
                localStorage.setItem('ui-theme', th);
              }, [s.token, JSON.stringify(s.user), theme]);
            } else {
              await ctx.addInitScript((th) => { localStorage.setItem('ui-theme', th); }, theme);
            }
            const page = await ctx.newPage();
            page.on('console', (m) => { if (m.type() === 'error') shotErrors.push('console: ' + m.text().slice(0, 160)); });
            page.on('pageerror', (e) => shotErrors.push('pageerror: ' + String(e.message).slice(0, 160)));
            page.on('response', (r) => { if (r.status() >= 400) shotErrors.push('HTTP ' + r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)); });

            await gotoReady(page, scn, args.base);
            const applied = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
            if (applied !== theme) shotErrors.push('主题未生效：期望 ' + theme + ' 实际 ' + applied);
            await runBefore(page, scn);

            const m = await measure(page, scn, kind);
            if (kind === 'focus') await drawFocusOverlay(page, m);
            const clip = { x: Math.round(m.clip.x), y: Math.round(m.clip.y), width: Math.round(m.clip.w), height: Math.round(m.clip.h) };
            if (clip.width < 8 || clip.height < 8) throw new Error('截取区域太小：' + JSON.stringify(clip));
            await page.screenshot({ path: file, clip, animations: 'disabled' });
            await page.evaluate(() => { const o = document.getElementById('__shots_overlay'); if (o) o.remove(); });

            const rawBytes = await fileSize(file);
            // 只有明显超宽才动 sips：1208→1200 这种纯对齐缩放会因 sips 重编码把文件反而压大
            if (clip.width > TARGET_WIDTH * 1.05) await sipsResizeWidth(file, TARGET_WIDTH);
            const fit = await fitToBudget(file);
            results.push({
              key: scn.key, kind, theme, file: path.relative(REPO_ROOT, file),
              bytes: fit.size, rawBytes, clip, labels: m.targets.map((t) => t.label), over: fit.over, errors: shotErrors,
            });
            log((fit.over ? '⚠ ' : '✓ ') + name.padEnd(40) + kb(fit.size).padStart(9)
              + '  clip=' + clip.width + '×' + clip.height
              + '  (' + kb(rawBytes) + ' 原始)' + (shotErrors.length ? '  errors=' + shotErrors.length : ''));
            for (const e of shotErrors.slice(0, 4)) log('     · ' + e);
          } catch (e) {
            failures.push(scn.key + ' / ' + kind + ' / ' + theme + ' → ' + String(e.message).slice(0, 300));
            log('✗ ' + name + ' 失败：' + String(e.message).slice(0, 300));
          } finally {
            await ctx.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  /* ------------------- manifest：key → 文件 → 用途（顺带打印可贴进 README 的 markdown） */
  const rows = [];
  for (const scn of SCENARIOS) {
    for (const kind of ['fallback', 'focus']) {
      for (const theme of ['light', 'dark']) {
        const r = results.find((x) => x.key === scn.key && x.kind === kind && x.theme === theme);
        if (!r) continue;
        let usage;
        if (kind === 'fallback') {
          usage = theme === 'light'
            ? '演示兜底图（Doc.vue 自动引用 /exam/doc-img/demo-' + scn.key + '-light.png）'
            : '演示兜底图（暗色主题，Doc.vue 暂未自动引用）';
        } else {
          usage = '定位图（要点：' + (r.labels.join(' + ') || '-') + '；四周压暗 + 2px 品牌描边 + 序号气泡）';
        }
        rows.push({ key: scn.key, kind, theme, file: r.file, bytes: r.bytes, usage });
      }
    }
  }
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const manifest = {
    generatedAt: new Date().toISOString(),
    base: args.base,
    outDir: path.relative(REPO_ROOT, args.out),
    camera: { viewport: DEFAULT_VIEWPORT, targetWidth: TARGET_WIDTH, sizeBudgetBytes: SIZE_BUDGET },
    counts: { shots: rows.length, overBudget: rows.filter((r) => r.bytes > SIZE_BUDGET).length, totalBytes: total },
    shots: rows.map((r) => ({ key: r.key, kind: r.kind, theme: r.theme, file: r.file, bytes: r.bytes, kb: Number((r.bytes / 1024).toFixed(1)), usage: r.usage })),
  };
  log('\n================ manifest（key → 文件 → 用途）================');
  log(JSON.stringify(manifest, null, 2));
  log('\n---- markdown 表（可直接贴进 docs/manual/README.md）----');
  log('| key | 类型 | 主题 | 文件 | 体积 | 用途 |');
  log('| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) log('| ' + [r.key, r.kind, r.theme, r.file, kb(r.bytes), r.usage].join(' | ') + ' |');
  log('\n合计 ' + rows.length + ' 张 / ' + (total / 1024 / 1024).toFixed(2) + 'MB；超预算（>200KB）' + manifest.counts.overBudget + ' 张');
  if (failures.length) {
    log('\n失败 ' + failures.length + ' 项：');
    for (const f of failures) log('  · ' + f);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('致命错误：' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
