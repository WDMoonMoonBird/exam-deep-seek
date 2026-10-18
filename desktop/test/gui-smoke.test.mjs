/**
 * gui-smoke.test.mjs —— Round 3 Electron GUI 冒烟测试（R3-2）。
 *
 * 用 playwright-core 的 _electron 驱动 dev Electron（不下载浏览器、不打包）：
 *   启动 desktop/ 应用 → 等待 BrowserWindow → 断言加载 http://127.0.0.1:47821/exam/ →
 *   页面非白屏/主进程窗口数正确 → 无未捕获异常（忽略远端 API 不可达噪音）→
 *   截图 reports/desktop/test/gui-smoke.png → 关闭并确认进程退出 + 端口释放。
 *
 * 关键环境约束：
 *   · 本机默认导出 ELECTRON_RUN_AS_NODE=1，必须从子进程 env 删除，否则 Electron 会以 Node 模式运行
 *     （表现为 import 'electron' 无 BrowserWindow 导出 / 无窗口）；
 *   · 应用要求 <userData>/config.json 有合法 serverUrl；测试临时写入不可达但合法的 SMOKE_SERVER 并在结束后恢复；
 *   · 无 GUI / 无 dist-desktop / dev Electron binary / playwright-core / 端口被占用时 **skip，不 fail**；
 *   · 远端 API 网络错误允许忽略（本轮不接生产账号）；截图与日志写入 reports/desktop/test/。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { acquireGuiLock } from './helpers.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(DESKTOP_DIR, '..');
const DIST_INDEX = path.join(REPO_DIR, 'dist-desktop', 'index.html');
const PNG_PATH = path.join(REPO_DIR, 'reports', 'desktop', 'test', 'gui-smoke.png');
const ELECTRON_DIR = path.join(DESKTOP_DIR, 'node_modules', 'electron', 'dist');
// 固定的本地 origin（端口由产品固定值决定，不能随机换）
const LOCAL_HOST = '127.0.0.1';
const LOCAL_PORT = 47821;
const LOCAL_URL_PREFIX = 'http://' + LOCAL_HOST + ':' + LOCAL_PORT + '/exam/';
// 合法的不可达 origin：只验证壳链路，不触碰生产账号/网络
const SMOKE_SERVER = 'https://127.0.0.1:8443';
const IS_DARWIN = process.platform === 'darwin';
// 与应用 index.mjs 的 userData 路径口径一致（macOS）
const USER_DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Deadpan-Exam-Desktop');
const CONFIG_PATH = path.join(USER_DATA_DIR, 'config.json');

// 允许忽略：dev-only Electron 安全警告、远端 API 不可达网络错误
const IGNORED_CONSOLE = [
  /Electron Security Warning/i,
  /net::ERR/i,
  /Failed to load resource/i,
  /ERR_CONNECTION/i,
  /ERR_NAME_NOT_RESOLVED/i,
  /ERR_INTERNET_DISCONNECTED/i,
  /ERR_FAILED/i,
  /Network ?Error/i,
  /Failed to fetch/i,
  /ECONNREFUSED/i,
  /timeout of/i,
];
const IGNORED_STDERR = [
  /sandbox_extension_issue_file/i,
  /Debugger (listening|attached|ending)/i,
  /For help, see/i,
  /Electron Security Warning/i,
  /net::ERR/i,
  /ERR_/i,
];
const FATAL_PATTERN = /Uncaught|Unhandled|Cannot find module|SyntaxError|ReferenceError|TypeError|is not a function|FATAL/i;

function isPortOpen(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: LOCAL_HOST, port });
    const done = (value) => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(timeoutMs, () => done(false));
  });
}

async function waitPortClosed(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port, 300))) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

function filterOut(entries, patterns) {
  return entries.filter((entry) => !patterns.some((pattern) => pattern.test(entry)));
}

async function waitChildExit(child, timeoutMs) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
}

/** playwright-core 缺失时应 skip 而非 fail（动态 import） */
async function loadElectron() {
  try {
    const playwright = await import('playwright-core');
    return { electron: playwright._electron || null, error: null };
  } catch (err) {
    return { electron: null, error: err };
  }
}

const skipReason = !IS_DARWIN
  ? 'GUI 冒烟仅在本机 macOS（darwin）环境验证'
  : !fs.existsSync(DIST_INDEX)
    ? 'dist-desktop 缺失：先运行 node desktop/scripts/build-dist.mjs'
    : !fs.existsSync(ELECTRON_DIR)
      ? 'dev Electron binary 缺失：先 cd desktop && node node_modules/electron/install.js'
      : false;

test('GUI 冒烟：Electron 启动 → /exam/ 窗口就绪 → 无未捕获异常 → 截图 → 进程退出', { skip: skipReason, timeout: 60000 }, async (t) => {
  const { electron, error } = await loadElectron();
  if (!electron) {
    t.skip('playwright-core 不可用：' + (error && error.message ? error.message : 'import 失败'));
    return;
  }
  // R4-2：与 packaged-app 冒烟串行（node --test 并行跑文件，两者竞争固定端口与 userData config）
  const guiLock = await acquireGuiLock();
  if (!guiLock) {
    t.skip('GUI 测试锁等待超时（其他 GUI 测试占用中）');
    return;
  }
  if (await isPortOpen(LOCAL_PORT)) {
    guiLock.release();
    t.skip('端口 ' + LOCAL_PORT + ' 已被占用（可能有其他桌面实例运行；禁止 kill 其他进程）');
    return;
  }

  const configBackup = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : null;
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    serverUrl: SMOKE_SERVER,
    port: LOCAL_PORT,
    externalOrigins: [],
    caFile: null,
  }, null, 2));

  let electronApp = null;
  let child = null;
  const consoleMessages = [];
  const pageErrors = [];
  const stderrChunks = [];
  const stdoutChunks = [];
  let skipped = false;

  try {
    const env = { ...process.env };
    // 本机默认 ELECTRON_RUN_AS_NODE=1：必须删除，否则 electron 二进制以 Node 模式运行、不会创建窗口
    delete env.ELECTRON_RUN_AS_NODE;

    electronApp = await electron.launch({
      executablePath: require('electron'),
      args: [DESKTOP_DIR],
      env,
      timeout: 45000,
    });
    child = electronApp.process();
    child.stdout?.on('data', (chunk) => stdoutChunks.push(String(chunk)));
    child.stderr?.on('data', (chunk) => stderrChunks.push(String(chunk)));

    const attached = new WeakSet();
    const attachWindow = (win) => {
      if (attached.has(win)) return;
      attached.add(win);
      win.on('console', (message) => {
        if (message.type() === 'error') consoleMessages.push('console.error: ' + message.text());
        else if (message.type() === 'warning') consoleMessages.push('console.warn: ' + message.text());
      });
      win.on('pageerror', (err) => pageErrors.push(String((err && err.message) || err)));
    };
    electronApp.on('window', attachWindow);

    const window = await electronApp.firstWindow({ timeout: 30000 });
    attachWindow(window);
    await window.waitForLoadState('domcontentloaded', { timeout: 20000 });

    // 1) 主进程确实创建了窗口
    const mainWindowCount = await electronApp.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    assert.ok(mainWindowCount >= 1, '主进程 BrowserWindow 数量应为 1，实际 ' + mainWindowCount);

    // 2) 加载的是本地 loopback 内容服务 /exam/
    const url = window.url();
    assert.match(url, new RegExp('^' + LOCAL_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '窗口 URL 应为 ' + LOCAL_URL_PREFIX + '，实际 ' + url);
    assert.equal(new URL(url).origin, 'http://' + LOCAL_HOST + ':' + LOCAL_PORT);

    // 3) 标题 + 页面 ready + 非白屏（#app 已挂载）
    const title = await window.title();
    assert.ok(title.trim().length > 0, '页面标题不应为空');
    assert.match(title, /Deadpan|判题/i, '页面标题应含产品名，实际 ' + title);
    await window.waitForFunction(() => {
      if (document.readyState !== 'complete') return false;
      const body = document.body;
      if (!body) return false;
      const text = (body.innerText || '').trim();
      const app = document.querySelector('#app');
      return text.length > 0 || (app && app.children.length > 0);
    }, { timeout: 30000 });
    const snapshot = await window.evaluate(() => ({
      readyState: document.readyState,
      textLen: (document.body && document.body.innerText ? document.body.innerText.trim().length : -1),
      appChildren: document.querySelector('#app') ? document.querySelector('#app').children.length : -1,
      htmlLen: document.documentElement ? document.documentElement.outerHTML.length : -1,
    }));
    assert.equal(snapshot.readyState, 'complete');
    assert.ok(snapshot.textLen > 50 || snapshot.appChildren > 0, '页面疑似白屏：' + JSON.stringify(snapshot));
    assert.ok(snapshot.htmlLen > 1000, '页面 HTML 异常偏小：' + snapshot.htmlLen);

    // 4) Electron 版本（dev binary）与主进程确实非 Node 模式运行
    const appInfo = await electronApp.evaluate(async ({ app }) => ({
      name: app.getName(),
      version: app.getVersion(),
      runAsNode: process.env.ELECTRON_RUN_AS_NODE,
      electron: process.versions.electron,
    }));
    assert.equal(appInfo.electron, '44.9.0');
    assert.equal(appInfo.runAsNode, undefined, 'Electron 主进程不应以 ELECTRON_RUN_AS_NODE 模式运行');

    // 5) 无未捕获异常（pageerror 必须为 0；console 仅允许已知 dev/网络噪音）
    assert.deepEqual(pageErrors, [], '存在未捕获页面异常：' + pageErrors.join('\n'));
    const unexpectedConsole = filterOut(consoleMessages, IGNORED_CONSOLE);
    const fatalConsole = unexpectedConsole.filter((entry) => FATAL_PATTERN.test(entry));
    assert.deepEqual(fatalConsole, [], '存在致命 console 错误：' + fatalConsole.join('\n'));

    // 6) 主进程 stderr 无致命启动错误（忽略 macOS sandbox/Debugger/网络噪音）
    const stderrText = stderrChunks.join('');
    const unexpectedStderr = filterOut(stderrText.split('\n'), IGNORED_STDERR).filter((line) => line.trim() !== '');
    const fatalStderr = unexpectedStderr.filter((line) => FATAL_PATTERN.test(line));
    assert.deepEqual(fatalStderr, [], '主进程 stderr 存在致命错误：' + fatalStderr.join('\n'));

    // 7) 截图（交付物）
    fs.mkdirSync(path.dirname(PNG_PATH), { recursive: true });
    await window.screenshot({ path: PNG_PATH });
    assert.equal(fs.existsSync(PNG_PATH), true, '截图未生成：' + PNG_PATH);
    assert.ok(fs.statSync(PNG_PATH).size > 10 * 1024, '截图文件异常偏小：' + fs.statSync(PNG_PATH).size);

    // 8) 关闭并确认进程退出 + 端口释放
    await electronApp.close();
    electronApp = null;
    const exitCode = await waitChildExit(child, 15000);
    assert.notEqual(exitCode, null, 'Electron 主进程 15s 内未退出');
    const portReleased = await waitPortClosed(LOCAL_PORT, 10000);
    assert.equal(portReleased, true, '应用退出后本地端口 ' + LOCAL_PORT + ' 未释放');

    t.diagnostic('GUI 冒烟通过：url=' + url + ' title=' + title + ' electron=' + appInfo.electron
      + ' textLen=' + snapshot.textLen + ' appChildren=' + snapshot.appChildren
      + ' consoleMessages=' + consoleMessages.length + ' screenshotBytes=' + fs.statSync(PNG_PATH).size);
  } catch (err) {
    const message = String((err && err.message) || err);
    // 仅把"环境不可用"类错误转成 skip；产品启动/窗口失败仍是 fail
    if (/Failed to launch|spawn ENOENT|X display|WindowServer|Unable to find Electron app|not supported|EACCES|cannot open/i.test(message)) {
      t.skip('GUI 环境不可用（skip）：' + message.slice(0, 300));
      skipped = true;
    } else {
      assert.fail('Electron GUI 冒烟失败：' + message + '\nstderr:\n' + stderrChunks.join('').slice(-3000));
    }
  } finally {
    if (!skipped) {
      try { if (electronApp) await electronApp.close(); } catch { /* 已关闭 */ }
      if (child && child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGTERM'); } catch { /* 忽略 */ }
      }
    }
    // 恢复原 userData 配置（避免污染本机桌面配置）
    try {
      if (configBackup === null) fs.rmSync(CONFIG_PATH, { force: true });
      else fs.writeFileSync(CONFIG_PATH, configBackup);
    } catch { /* 恢复失败不影响测试结论 */ }
    guiLock.release();
  }
});
