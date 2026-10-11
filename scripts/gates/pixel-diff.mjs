#!/usr/bin/env node
/**
 * 像素门禁（client 侧拆分的视觉零回归护栏 · Phase 1 / P1-1）
 * ===========================================================================
 * 用法：
 *   node scripts/gates/pixel-diff.mjs --before <commit> --after <commit|worktree|dir> [--json]
 *
 * 参数：
 *   --before <ref>     改前树：git ref / 已存在的目录（含 client/ 子目录）
 *   --after  <ref>     改后树：git ref / 目录 / 字面量 worktree（= 当前活工作树，含未提交与未跟踪改动）
 *   --json             机器可读输出（stdout 只含 JSON）
 *   --keep             保留中间产物（源码树 + dist）；logs/ 恒保留供取证
 *   --port-base <n>    静态服务起始端口，默认 3110（逐端口探测占用，显式跳过 3000/5173）
 *   --timeout <ms>     单区域导航/就绪超时，默认 30000
 *   --regions <file>   覆盖默认区域表（JSON 数组，字段见 DEFAULT_REGION_AREAS）
 *   --workdir <dir>    中间产物根目录，默认 /tmp/pixel-gate
 *
 * 退出码：
 *   0 = 全部区域像素 sha1 相等（PASS）
 *   1 = 存在不等区域（FAIL，逐区域列出）
 *   2 = 无法判定 / 执行错误（构建失败、区域缺失、夹具漏网、构建不确定、client/dist 被触碰…）
 *       ★ 设计意图：「无法判定」绝不能退化成 0。任何装置异常都必须显式失败，
 *         否则门禁会变成永远绿灯。
 *
 * ---------------------------------------------------------------------------
 * 【本仓踩过的坑 —— 判据口径，改脚本前先读】
 *
 * 1. 禁用 asset 文件名 / 字节哈希判等。Vite 的 content hash 让产物文件名随源码一字节
 *    变化而变（实证：改前 index-B7EtbyWX.css 对 改后 index-BH2_SreE.css）。拿产物文件名
 *    或 dist 目录摘要去比「有没有变化」，只能证明「源码变了」，完全不能证明「渲染变了」
 *    → 必然假阳性。本门禁只比渲染像素。
 *    （diff -rq 只用于「同源两次构建是否 byte-identical」的构建确定性自检，
 *      那是装置自检，不是改前/改后的判据 —— 两者不得混用。）
 *
 * 2. 先冻结再测（constraints 3.7）。改前一律 git archive <commit> 导出到仓库外再构建，
 *    绝不读活树当基线。改后才允许构建活树。
 *
 * 3. 构建一律 --outDir 到仓库外（constraints 1）。严禁重建 client/dist；
 *    本脚本在构建前后对 client/dist 取 mtime 指纹并断言未变，变了即 exit 2。
 *
 * 4. 端口（constraints 14）。只绑 127.0.0.1 的 31xx 段，显式拒绝 3000 / 5173，
 *    起服务前逐端口 bind 探测占用；退出时统一关闭并复核端口已释放。
 *
 * 5. 同源两次构建必须 byte-identical，否则像素判等不可信。本脚本对同一棵树独立构建两次
 *    并 diff -rq；若不一致 → 打印警告，且即使像素全等也不判 PASS（退化为 exit 2 无法判定）。
 *
 * 6. 构建不确定性会伪装成回归（constraints 15 偶发超时同理）：单次不等不等于回归，
 *    隔离复跑一次仍不等才算 —— 这是使用者的责任，脚本只保证口径可复现。
 *
 * ---------------------------------------------------------------------------
 * 【装置形态】
 *
 *   改前树 --vite build--> dist_before --静态服务(:31xx)--+
 *                                                        +-- Playwright 同视口同数据截图
 *   改后树 --vite build--> dist_after  --静态服务(:31xx)--+
 *
 *   · 两棵树的 node_modules 由软链指向本仓 client/node_modules（不复制 456MB）；
 *     仓库外目录里的 client/ 因此无需 npm install（本门禁不联网、不装包）。
 *   · 无后端依赖：/api/** 由静态服务内建的夹具表应答，两侧拿到逐字节相同的 JSON
 *     → 数据差异被彻底排除，观测到的像素差异只可能来自源码。
 *     （本仓 MySQL 未启动时后端不可用，故不采用真后端装置；代价见「已知局限」。）
 *   · 夹具表不允许漏网：任何未命中夹具的 /api/** 请求都会返回 500 并被记录，
 *     只要出现一条，门禁即 exit 2 并列出该路径 —— 防止「白屏 对 白屏」的假绿。
 *   · 亮/暗互异自检：同一侧 light 与 dark 的像素若相同，说明主题没生效
 *     （data-theme 未落），该区域等于白测一半 → 直接判「无法判定」。
 *
 * 【区域划分】（默认 2 主题 × 3 区域 = 6 个区域；--regions 可覆盖）
 *   主题 light / dark（localStorage['ui-theme']，经 useTheme 写到 <html data-theme>）
 *   区域 sider   侧栏底盘      .ant-layout-sider      （布局骨架，零数据依赖）
 *        content 主内容区      #main-content          （/exam/teacher/classes 页面正文）
 *        modal   弹窗          .ant-modal-content     （点「新增班级」打开）
 *   依据：round 2（docs/pipeline/test-round-02.md 7.4）已实证该划分可执行；
 *   计划书 5 的「4 组」字面形态（亮/暗 × 舒适/紧凑）在本仓不可执行 ——
 *   data-density 是各 Layout 硬编码，无全局密度开关，同一路由无法在两种密度下渲染。
 *   故采用「每主题各自改前/改后全等」这一可执行形态。
 *
 * 【必须知道它抓不到什么】（详见 docs/split/pixel-gate-report.md「已知局限」）
 *   · 只截 3 个区域 × 1 条路由 → 不覆盖被拆分的具体文件（Submit.vue / Doc.vue …）。
 *     拆某个 .vue 时，必须用 --regions 把该文件所在路由补进来，否则本门禁对它近乎盲区。
 *   · 用夹具而非真数据 → 不覆盖真实数据形态（长文本、空态、异常态）下的渲染。
 *   · 静态像素：抓不到交互时序、键盘可达性、请求行为、控制台报错。
 *     a11y 与行为需另有门禁（axe / 行为对拍），像素全等不等于功能无回归。
 * ===========================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '../..');
const EXIT = { PASS: 0, DIFF: 1, ERROR: 2 };

// ── 禁止端口（constraints 1：用户实例）与视口
const FORBIDDEN_PORTS = new Set([3000, 5173]);
const VIEWPORT = { width: 1440, height: 900 };

// ── 夹具：两侧完全相同的应答（数据差异必须为 0）
const FIXTURE_USER = {
  id: 9001,
  username: 'pixel_gate_teacher',
  realName: '像素门禁',
  role: 'teacher',
  currentSchool: { id: 1, name: '示范大学' },
  teacherSchools: [{ id: 1, name: '示范大学' }],
};
const FIXTURE_CLASSES = [
  { id: 1, name: '软件工程 2024 级 1 班', schoolId: 1, school: { id: 1, name: '示范大学' }, isTeamClass: false, _count: { studentClasses: 42 }, createdAt: '2026-09-01T08:30:00.000Z' },
  { id: 2, name: '计算机科学与技术 2024 级 2 班', schoolId: 1, school: { id: 1, name: '示范大学' }, isTeamClass: false, _count: { studentClasses: 38 }, createdAt: '2026-09-02T09:15:00.000Z' },
];
const FIXTURES = [
  { method: 'GET', path: /^\/api\/teacher\/pending-summary$/, body: { code: 0, data: { pendingReview: 3 } } },
  { method: 'GET', path: /^\/api\/teacher\/classes$/, body: { code: 0, data: FIXTURE_CLASSES } },
  { method: 'GET', path: /^\/api\/teacher\/teams$/, body: { code: 0, data: [{ id: 11, name: '算法教学组', creator: { realName: '张老师' } }] } },
];

// ── 默认区域表（--regions 可整体覆盖；JSON 结构与此一致）
const ROUTE_CLASSES = '/exam/teacher/classes';
const DEFAULT_REGION_AREAS = [
  {
    area: 'sider', selector: '.ant-layout-sider', url: ROUTE_CLASSES,
    ready: '.ant-layout-sider .ant-menu-item',
    witness: { selector: '.ant-layout-sider .ant-menu-item', min: 6, label: '侧栏菜单项' },
  },
  {
    area: 'content', selector: '#main-content', url: ROUTE_CLASSES,
    ready: '.ant-table-row',
    witness: { selector: '.ant-table-row', min: 2, label: '班级表格行' },
  },
  {
    area: 'modal', selector: '.ant-modal-content:visible', url: ROUTE_CLASSES,
    // ready 必须是「弹窗打开之前」就存在的选择器（页面已就绪的标记），
    // 弹窗自身的就绪由 open.waitFor 保证 —— 两者混用会让弹窗区域永远等不到元素。
    ready: '.ant-table-row', open: { selector: 'button:has-text("新增班级")', waitFor: '.ant-modal-content form' },
    witness: { selector: '.ant-modal-content .ant-form-item', min: 2, label: '弹窗表单项' },
  },
];
const DEFAULT_REGIONS = ['light', 'dark'].flatMap((theme) =>
  DEFAULT_REGION_AREAS.map((a) => Object.assign({ id: theme + '.' + a.area, theme }, a))
);

// ───────────────────────────────────────────────────────────── 小工具
const now = () => new Date().toISOString();
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const short = (s, n) => String(s).slice(0, n === undefined ? 10 : n);

function parseArgs(argv) {
  const out = { json: false, keep: false, portBase: 3110, timeout: 30000, regions: null, workdir: '/tmp/pixel-gate' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(a + ' 缺少取值'); return v; };
    if (a === '--before') out.before = next();
    else if (a === '--after') out.after = next();
    else if (a === '--json') out.json = true;
    else if (a === '--keep') out.keep = true;
    else if (a === '--port-base') out.portBase = Number(next());
    else if (a === '--timeout') out.timeout = Number(next());
    else if (a === '--regions') out.regions = next();
    else if (a === '--workdir') out.workdir = next();
    else if (a === '-h' || a === '--help') { console.log(HELP); process.exit(EXIT.PASS); }
    else throw new Error('未知参数：' + a);
  }
  if (!out.before || !out.after) throw new Error('必须同时提供 --before 与 --after（用法见文件头注释）');
  return out;
}
const HELP = [
  '像素门禁 pixel-diff —— 用法：',
  '  node scripts/gates/pixel-diff.mjs --before <commit> --after <commit|worktree|dir> [--json] [--keep]',
  '                                  [--port-base 3110] [--timeout 30000] [--regions <file.json>] [--workdir <dir>]',
  '',
  '  退出码：0 全区域像素 sha1 相等 / 1 存在不等区域 / 2 无法判定或执行错误',
  '  口径：只比渲染像素，禁用 asset 文件名与字节哈希（content hash 必变 → 假阳性）',
].join('\n');

/** 端口空闲探测（真实 bind 一次再放掉） */
function isPortFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}
async function pickPort(base, taken) {
  for (let p = base; p < base + 60; p++) {
    if (FORBIDDEN_PORTS.has(p) || taken.has(p)) continue;
    if (await isPortFree(p)) return p;
  }
  throw new Error('在 ' + base + ' 起的 60 个端口里找不到空闲端口');
}
function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => s.close(() => resolve(false)));
    s.listen(port, '127.0.0.1');
  });
}

// ───────────────────────────────────────────────────────────── 源码树
/** 与 client/.gitignore 对齐的「非源」目录。**不要**笼统跳过点目录：
 *  client/.vscode/extensions.json 是**被跟踪的源文件**（.gitignore 里 !.vscode/extensions.json），
 *  一概跳过点目录会让导出树的文件集比活树少一个 → sameSource 误判（本脚本踩过）。 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-ssr', '.qa-dist', '.verify-dist', '.vite', 'coverage', 'logs', '.git', 'uploads', '.idea']);
const skipDirName = (name) => SKIP_DIRS.has(name) || name.startsWith('dist-');

/**
 * 列出源码树里的源文件。
 * 优先走 git 清单（tracked + 未被忽略的未跟踪）：这样 .gitignore 掉的 dist-* / .qa-dist /
 * node_modules 天然被排除，而**新增的未跟踪源文件（拆分产生的 composable）会被计入** —— 两者都必要。
 * 非 git 目录（git archive 导出树）退化为遍历。
 */
function listSourceFiles(clientDir) {
  const g = cp.spawnSync('git', ['-C', clientDir, 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (g.status === 0 && g.stdout) {
    return g.stdout.split('\0').filter(Boolean).filter((rel) => fs.existsSync(path.join(clientDir, rel))).sort();
  }
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name);
      // 软链目录（本脚本往导出树里塞的 node_modules 软链）按目录处理，不能当文件计入
      let isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) { try { isDir = fs.statSync(p).isDirectory(); } catch { isDir = false; } }
      if (isDir) { if (!skipDirName(e.name)) walk(p); continue; }
      if (e.name === '.DS_Store') continue;
      out.push(path.relative(clientDir, p));
    }
  };
  walk(clientDir);
  return out.sort();
}

/** 对源码树做内容指纹：判定「两棵树是否同源」，并作为报告锚点 */
function fingerprintClient(clientDir) {
  const h = crypto.createHash('sha256');
  for (const rel of listSourceFiles(clientDir)) {
    const p = path.join(clientDir, rel);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) { h.update('L|' + rel + '|' + fs.readlinkSync(p) + '\n'); continue; }
    h.update('F|' + rel + '|' + sha1(fs.readFileSync(p)) + '\n');
  }
  return h.digest('hex');
}

/**
 * 把 --before/--after 的取值落地成 { clientDir, fingerprint, label, commit }
 *   'worktree' → 活工作树（含未提交/未跟踪改动）
 *   git ref    → git archive 导出到仓库外（先冻结再测）
 *   已存在目录 → 直接当源码树用（便于对「故意改坏的副本」做负向自测）
 */
function materialize(arg, destDir) {
  if (arg === 'worktree') {
    const clientDir = path.join(ROOT, 'client');
    return { kind: 'worktree', label: 'worktree（活树）', clientDir, commit: null, fingerprint: fingerprintClient(clientDir) };
  }
  const asPath = path.resolve(ROOT, arg);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isDirectory()) {
    const clientDir = path.join(asPath, 'client');
    if (!fs.existsSync(clientDir)) throw new Error('目录不含 client/ 子目录：' + asPath);
    ensureNodeModulesLink(asPath);
    return { kind: 'dir', label: asPath, clientDir, commit: null, fingerprint: fingerprintClient(clientDir) };
  }
  const rev = cp.spawnSync('git', ['rev-parse', '--verify', arg + '^{commit}'], { cwd: ROOT, encoding: 'utf8' });
  if (rev.status !== 0) throw new Error('无法解析 git ref：' + arg);
  const commit = rev.stdout.trim();
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  const tar = cp.spawnSync('git', ['archive', commit], { cwd: ROOT, maxBuffer: 1024 * 1024 * 1024 });
  if (tar.status !== 0) throw new Error('git archive 失败：' + String(tar.stderr).slice(0, 400));
  const untar = cp.spawnSync('tar', ['-x', '-C', destDir], { input: tar.stdout, maxBuffer: 1024 * 1024 * 1024 });
  if (untar.status !== 0) throw new Error('tar 解包失败：' + String(untar.stderr).slice(0, 400));
  ensureNodeModulesLink(destDir);
  const clientDir = path.join(destDir, 'client');
  return { kind: 'commit', label: arg, commit, short: short(commit, 8), clientDir, fingerprint: fingerprintClient(clientDir) };
}

/** 仓库外导出的树没有 node_modules：软链到本仓（不复制、不联网、不装包） */
function ensureNodeModulesLink(treeDir) {
  const src = path.join(ROOT, 'client', 'node_modules');
  const dst = path.join(treeDir, 'client', 'node_modules');
  if (!fs.existsSync(src)) throw new Error('本仓 client/node_modules 不存在，无法软链（本门禁不联网、不安装依赖）');
  if (fs.existsSync(dst)) return;
  fs.symlinkSync(src, dst, 'dir');
}

function countFiles(dir) {
  let n = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else n++; } };
  if (fs.existsSync(dir)) walk(dir);
  return n;
}

function buildTree(tree, outDir, logFile) {
  const viteBin = path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) throw new Error('找不到 vite 可执行文件：' + viteBin);
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [viteBin, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: tree.clientDir,
    env: Object.assign({}, process.env, { VITE_API_BASE_URL: '/api', VITE_WS_URL: '' }),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const log = (r.stdout || '') + (r.stderr || '');
  fs.writeFileSync(logFile, log);
  if (r.status !== 0) throw new Error('vite build 失败（exit ' + r.status + '），日志尾部：\n' + log.slice(-1500));
  return { ms: Date.now() - t0, files: countFiles(outDir), outDir, logTail: log.trim().split('\n').slice(-2).join(' / ') };
}

function diffDirs(a, b) {
  const r = cp.spawnSync('diff', ['-rq', a, b], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const outText = ((r.stdout || '') + (r.stderr || '')).trim();
  return { byteIdentical: r.status === 0, lines: outText ? outText.split('\n').length : 0, out: outText };
}

// ───────────────────────────────────────────────────────────── 静态服务（内建 /api 夹具）
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.pdf': 'application/pdf',
};

function startStaticServer(opts) {
  const distDir = opts.distDir;
  const unmocked = [];
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { pathname = req.url; }

    // /api/** → 夹具表；未命中一律 500 + 记录（防「白屏 对 白屏」假绿）
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const hit = FIXTURES.find((f) => f.method === req.method && f.path.test(pathname));
      if (!hit) {
        unmocked.push(req.method + ' ' + pathname);
        res.writeHead(500, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ code: 500, message: 'PIXEL-GATE-UNMOCKED ' + pathname }));
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(hit.body));
    }
    // socket.io：本装置不用，直接 200 空体（避免长轮询噪声）
    if (pathname.startsWith('/socket.io')) { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(''); }

    // 静态资源（构建 base = /exam/）
    let p = pathname;
    if (p.startsWith('/exam/')) p = p.slice('/exam'.length);
    if (p === '/' || p === '') p = '/index.html';
    let file = path.join(distDir, p);
    if (!file.startsWith(distDir)) { res.writeHead(403); return res.end('forbidden'); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => resolve({ server, port: opts.port, side: opts.side, unmocked, url: 'http://127.0.0.1:' + opts.port }));
  });
}

// ───────────────────────────────────────────────────────────── 浏览器侧
async function loadPlaywright() {
  const req = createRequire(path.join(ROOT, 'client', 'package.json'));
  const entry = req.resolve('playwright');
  const mod = await import(pathToFileURL(entry).href);
  const pw = mod.chromium ? mod : mod.default;
  if (!pw || !pw.chromium) throw new Error('playwright 已解析但取不到 chromium 导出：' + entry);
  return { chromium: pw.chromium, entry };
}

async function captureRegion(browser, baseUrl, region, timeout) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: region.theme === 'dark' ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await ctx.addInitScript((init) => {
    localStorage.setItem('ui-theme', init.theme);
    localStorage.setItem('token', init.token);
    localStorage.setItem('user', JSON.stringify(init.user));
  }, { theme: region.theme, token: 'pixel-gate-token', user: FIXTURE_USER });

  try {
    await page.goto(baseUrl + region.url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForSelector(region.ready, { state: 'attached', timeout });
    if (region.open) {
      await page.locator(region.open.selector).first().click({ timeout });
      await page.waitForSelector(region.open.waitFor, { state: 'visible', timeout });
    }
    await page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : null);
    await page.waitForTimeout(600);

    const loc = page.locator(region.selector).first();
    await loc.waitFor({ state: 'visible', timeout });

    // 见证断言：区域必须真的有内容，否则等同白屏对白屏
    const w = region.witness;
    const witness = w
      ? await page.evaluate((sel) => document.querySelectorAll(sel).length, w.selector).then((c) => ({ count: c, min: w.min, label: w.label }))
      : { count: null, min: 0, label: '-' };
    const witnessOk = !w || witness.count >= w.min;

    // 主题必须真的生效（否则 dark 区域退化成 light 的副本，覆盖丢一半）
    const appliedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

    const png = await loc.screenshot({ animations: 'disabled', timeout });
    const box = await loc.boundingBox();
    return { png, sha1: sha1(png), bytes: png.length, box, witness, witnessOk, appliedTheme, error: null };
  } catch (e) {
    return { png: null, sha1: null, bytes: 0, box: null, witness: null, witnessOk: false, appliedTheme: null, error: String((e && e.message) || e).slice(0, 300) };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ───────────────────────────────────────────────────────────── 主流程
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workdir = args.workdir;
  const report = {
    gate: 'pixel-diff', startedAt: now(), root: ROOT, args: { before: args.before, after: args.after },
    before: {}, after: {}, builds: {}, determinism: {}, servers: {}, regions: [], unmockedApi: [], guards: {}, warnings: [],
  };

  fs.rmSync(workdir, { recursive: true, force: true });
  fs.mkdirSync(path.join(workdir, 'logs'), { recursive: true });

  // 0. client/dist 护栏指纹（constraints 1：严禁重建）
  const distDir = path.join(ROOT, 'client', 'dist');
  const distStamp = () => fs.existsSync(distDir)
    ? fs.statSync(distDir).mtimeMs + ':' + (fs.existsSync(path.join(distDir, 'index.html')) ? fs.statSync(path.join(distDir, 'index.html')).mtimeMs : 'noindex')
    : 'absent';
  const distBeforeStamp = distStamp();

  // 1. 冻结 / 定位两棵树
  report.before = materialize(args.before, path.join(workdir, 'tree-before'));
  report.after = materialize(args.after, path.join(workdir, 'tree-after'));
  const sameSource = report.before.fingerprint === report.after.fingerprint;

  // 2. 构建（全部 --outDir 到仓库外）
  report.builds.before = buildTree(report.before, path.join(workdir, 'dist-before'), path.join(workdir, 'logs/build-before.log'));
  report.builds.after = buildTree(report.after, path.join(workdir, 'dist-after'), path.join(workdir, 'logs/build-after.log'));

  // 3. 构建确定性（同一棵树两次独立构建须 byte-identical）
  // ★ 判定「同一棵树」不能用源码指纹相等：指纹按 .gitignore 口径忽略 .DS_Store 等非源文件，
  //   但 vite 会把 public/ 整目录拷进 dist —— 活树的 public/.DS_Store 会进产物，
  //   git archive 导出树没有这两个文件。若拿「HEAD 构建」与「活树构建」互当确定性对照，
  //   就会误报「构建不确定」（本脚本实测踩到：diff 恰为 2 行 .DS_Store）→ 假 INCONCLUSIVE。
  //   故只有两边确为同一棵树（同 commit / 同目录 / 都是活树）时才让两次构建互为对照。
  const sameTree = report.before.kind === report.after.kind && (
    (report.before.kind === 'commit' && report.before.commit === report.after.commit) ||
    report.before.kind === 'worktree' ||
    (report.before.kind === 'dir' && report.before.clientDir === report.after.clientDir)
  );
  const detDirA = path.join(workdir, 'dist-before');
  let detDirB;
  if (sameTree) {
    detDirB = path.join(workdir, 'dist-after');
    report.determinism.note = '改前/改后是同一棵树 → 两次独立构建互为确定性对照';
  } else {
    detDirB = path.join(workdir, 'dist-before-b');
    report.builds.beforeSecond = buildTree(report.before, detDirB, path.join(workdir, 'logs/build-before-2nd.log'));
    report.determinism.note = '改前/改后是两棵不同的树 → 另建一次改前树作确定性对照（不与改后构建互比）';
  }
  report.determinism.sameTree = sameTree;
  report.determinism.sameFingerprint = sameSource;
  Object.assign(report.determinism, diffDirs(detDirA, detDirB));
  if (!report.determinism.byteIdentical) {
    report.warnings.push('同源两次构建 NOT byte-identical（diff -rq ' + report.determinism.lines + ' 行）→ 像素判等不可信：' + report.determinism.out.split('\n').slice(0, 5).join(' | '));
  }

  // 4. client/dist 未被触碰
  report.guards.clientDistUntouched = distStamp() === distBeforeStamp;
  if (!report.guards.clientDistUntouched) throw new Error('client/dist 在构建期间发生变化（违反「严禁重建 client/dist」）');

  // 5. 两个静态服务（31xx，先探测占用）
  const taken = new Set();
  const pBefore = await pickPort(args.portBase, taken); taken.add(pBefore);
  const pAfter = await pickPort(args.portBase, taken); taken.add(pAfter);
  const detDirAfter = path.join(workdir, 'dist-after');
  const sBefore = await startStaticServer({ distDir: detDirA, port: pBefore, side: 'before' });
  const sAfter = await startStaticServer({ distDir: detDirAfter, port: pAfter, side: 'after' });
  report.servers = { before: pBefore, after: pAfter, bound: '127.0.0.1', distBefore: detDirA, distAfter: detDirAfter };

  try {
    const pw = await loadPlaywright();
    report.playwright = pw.entry;
    const regions = args.regions ? JSON.parse(fs.readFileSync(args.regions, 'utf8')) : DEFAULT_REGIONS;
    const browser = await pw.chromium.launch({ headless: true });
    try {
      for (const region of regions) {
        const b = await captureRegion(browser, sBefore.url, region, args.timeout);
        const a = await captureRegion(browser, sAfter.url, region, args.timeout);
        const row = {
          id: region.id, theme: region.theme, area: region.area, url: region.url, selector: region.selector,
          before: { sha1: b.sha1, bytes: b.bytes, box: b.box, theme: b.appliedTheme, witness: b.witness, error: b.error },
          after: { sha1: a.sha1, bytes: a.bytes, box: a.box, theme: a.appliedTheme, witness: a.witness, error: a.error },
          pixelEqual: b.sha1 !== null && a.sha1 !== null && b.sha1 === a.sha1,
          geometryEqual: b.box !== null && a.box !== null && JSON.stringify(b.box) === JSON.stringify(a.box),
        };
        row.equal = row.pixelEqual && row.geometryEqual;
        if (b.error || a.error) row.error = 'before=' + (b.error || '-') + ' after=' + (a.error || '-');
        if (!b.witnessOk || !a.witnessOk) row.witnessFail = 'before=' + JSON.stringify(b.witness) + ' after=' + JSON.stringify(a.witness);
        if (b.appliedTheme !== region.theme || a.appliedTheme !== region.theme) row.themeFail = 'before=' + b.appliedTheme + ' after=' + a.appliedTheme;
        report.regions.push(row);
        if (b.png) fs.writeFileSync(path.join(workdir, 'logs', region.id + '.before.png'), b.png);
        if (a.png) fs.writeFileSync(path.join(workdir, 'logs', region.id + '.after.png'), a.png);
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    await new Promise((r) => sBefore.server.close(r));
    await new Promise((r) => sAfter.server.close(r));
  }

  report.unmockedApi = Array.from(new Set(sBefore.unmocked.concat(sAfter.unmocked))).sort();

  // 6. 判定
  // 优先级：未能截图的区域 > 已实测到的像素差异 > 其它装置异常 > PASS
  // ★ 没测到的区域绝不能当成「测出来不一样」：捕获失败是「无法判定」，不是回归。
  //   （反之，「测出来一样」也绝不能在没有装置自检背书时当成 PASS —— 见 guardFail。）
  const measuredDiffs = report.regions.filter((r) => r.before.sha1 && r.after.sha1 && !r.pixelEqual);
  const unrunnable = report.regions.filter((r) => !r.before.sha1 || !r.after.sha1 || r.error || r.witnessFail || r.themeFail);
  const geoDiffs = report.regions.filter((r) => r.pixelEqual && !r.geometryEqual);
  const errors = unrunnable;
  const themeCollisions = [];
  for (const area of Array.from(new Set(report.regions.map((r) => r.area)))) {
    const rows = report.regions.filter((r) => r.area === area);
    const l = rows.find((r) => r.theme === 'light'), d = rows.find((r) => r.theme === 'dark');
    if (l && d && l.before.sha1 && d.before.sha1 && l.before.sha1 === d.before.sha1) themeCollisions.push(area);
  }
  report.guards.themeActuallyDiffers = themeCollisions.length === 0;
  report.guards.geometryDiffs = geoDiffs.map((r) => r.id);
  report.summary = {
    regions: report.regions.length,
    pixelEqual: report.regions.length - measuredDiffs.length,
    pixelDiff: measuredDiffs.map((r) => r.id),
    unrunnable: unrunnable.map((r) => r.id),
    geometryOnlyDiff: geoDiffs.map((r) => r.id),
    errored: errors.map((r) => r.id),
    themeCollisions,
    unmockedApi: report.unmockedApi,
    determinismByteIdentical: !!report.determinism.byteIdentical,
    sameTree: report.determinism.sameTree,
    sameFingerprint: sameSource,
  };

  const guardFail = report.unmockedApi.length > 0 || !report.guards.themeActuallyDiffers || !report.determinism.byteIdentical;
  report.verdict = unrunnable.length > 0 ? 'INCONCLUSIVE'
    : (measuredDiffs.length > 0 ? 'FAIL'
      : (guardFail ? 'INCONCLUSIVE' : 'PASS'));
  report.exitCode = report.verdict === 'PASS' ? EXIT.PASS : (report.verdict === 'FAIL' ? EXIT.DIFF : EXIT.ERROR);
  if (report.verdict === 'INCONCLUSIVE' && measuredDiffs.length === 0 && !report.determinism.byteIdentical) {
    report.warnings.push('像素全等但构建不确定 → 不判 PASS（无法区分「真无差异」与「构建抖动」）');
  }
  report.finishedAt = now();

  if (!args.keep) {
    fs.rmSync(path.join(workdir, 'tree-before'), { recursive: true, force: true });
    fs.rmSync(path.join(workdir, 'tree-after'), { recursive: true, force: true });
  }

  // 7. 端口复核（收尾必须为空）
  report.portsReleased = {};
  report.portsReleased[pBefore] = !(await portBusy(pBefore));
  report.portsReleased[pAfter] = !(await portBusy(pAfter));

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  process.exit(report.exitCode);
}

function printHuman(r) {
  const anchor = (t) => t.kind === 'commit' ? (t.short + '  ' + t.label) : (t.kind === 'worktree' ? 'worktree（活树）' : t.label);
  console.log('像素门禁（client 视觉零回归）');
  console.log('  改前 before = ' + anchor(r.before) + '   fp=' + short(r.before.fingerprint, 12));
  console.log('  改后 after  = ' + anchor(r.after) + '   fp=' + short(r.after.fingerprint, 12));
  console.log('  构建 before = ' + (r.builds.before.ms / 1000).toFixed(1) + 's / ' + r.builds.before.files + ' 文件  → ' + r.servers.distBefore);
  console.log('  构建 after  = ' + (r.builds.after.ms / 1000).toFixed(1) + 's / ' + r.builds.after.files + ' 文件  → ' + r.servers.distAfter);
  console.log('  确定性      = ' + (r.determinism.byteIdentical ? '✓ 同源两次构建 byte-identical（diff -rq 0 行）' : '✗ NOT byte-identical（diff -rq ' + r.determinism.lines + ' 行）'));
  console.log('  服务端口    = before :' + r.servers.before + '  after :' + r.servers.after + '（绑 127.0.0.1；/api 由内建夹具应答）');
  console.log('  区域（' + r.summary.regions + ' 个 = 2 主题 × 侧栏/内容区/弹窗）：');
  for (const g of r.regions) {
    const captured = !!(g.before.sha1 && g.after.sha1);
    if (!captured) {
      console.log('    ! ' + String(g.id).padEnd(14) + '未能截图（无法判定，不是差异）  ' + (g.error || g.witnessFail || g.themeFail || ''));
      continue;
    }
    const box = g.before.box ? Math.round(g.before.box.width) + 'x' + Math.round(g.before.box.height) : '-';
    console.log('    ' + (g.pixelEqual ? '✓' : '✗') + ' ' + String(g.id).padEnd(14) + short(g.before.sha1, 12) + (g.pixelEqual ? ' == ' : ' != ') + short(g.after.sha1, 12)
      + '   box=' + box
      + (g.geometryEqual ? '' : '  ⚠几何不等')
      + (g.witnessFail ? '  ⚠见证失败 ' + g.witnessFail : '')
      + (g.themeFail ? '  ⚠主题未生效 ' + g.themeFail : ''));
  }
  console.log('  夹具漏网 API    = ' + (r.unmockedApi.length ? r.unmockedApi.join(', ') : '无'));
  console.log('  亮/暗互异自检   = ' + (r.guards.themeActuallyDiffers ? '✓ 亮暗像素确实不同（主题真的生效）' : '✗ 亮暗像素相同 → 主题未生效，覆盖不成立'));
  console.log('  client/dist     = ' + (r.guards.clientDistUntouched ? '✓ 未被触碰（mtime 指纹未变）' : '✗ 被改动'));
  console.log('  端口收尾        = ' + Object.keys(r.portsReleased).map((p) => ':' + p + (r.portsReleased[p] ? ' 已释放' : ' 仍占用')).join('  '));
  for (const w of r.warnings) console.log('  ⚠ ' + w);
  console.log('结论：' + r.verdict
    + (r.summary.pixelDiff.length ? '（不等区域：' + r.summary.pixelDiff.join(', ') + '）' : '')
    + (r.summary.unrunnable.length ? '（未能截图、无法判定：' + r.summary.unrunnable.join(', ') + '）' : ''));
}

try { await main(); }
catch (e) { console.error('门禁执行错误：' + ((e && e.message) ? e.message : e)); process.exit(EXIT.ERROR); }
