/**
 * packaged-app.test.mjs —— Round 4 packaged app 冒烟测试（R4-2）。
 *
 * 与 gui-smoke.test.mjs（dev Electron + 仓库 dist-desktop）互补：
 *   直接启动 **打包后** 的 `release/mac-arm64/Deadpan 判题.app/Contents/MacOS/Deadpan 判题`，
 *   验证 packaged 环境下 app.isPackaged=true、Resources/dist 内嵌资源加载、窗口/页面/异常/退出行为。
 *
 * 关键点：
 *   · 必须删除子进程 env 的 ELECTRON_RUN_AS_NODE（本机默认=1，否则以 Node 模式运行、无窗口）；
 *   · 应用 userData 固定为 `~/Library/Application Support/Deadpan-Exam-Desktop`：测试临时写入不可达但合法的
 *     serverUrl 配置（备份/恢复），不接生产账号；
 *   · 与 gui-smoke 通过 helpers.acquireGuiLock() 串行（固定端口 47821 + 同一 userData 配置）；
 *   · 缺失 packaged app / 非 darwin / 无 GUI / playwright-core 缺失 / 端口占用 ⇒ **skip 不 fail**；
 *   · 截图写 reports/desktop/test/packaged-app.png；HOTFIX-1 起断言打包 app 版本与 package.json 一致（HOTFIX-2 起为 0.1.2）。
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
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_DIR, 'package.json'), 'utf8'));
const PNG_PATH = path.join(REPO_DIR, 'reports', 'desktop', 'test', 'packaged-app.png');
const PACKAGED_BIN = path.join(DESKTOP_DIR, 'release', 'mac-arm64', 'Deadpan 判题.app', 'Contents', 'MacOS', 'Deadpan 判题');
const LOCAL_HOST = '127.0.0.1';
const LOCAL_PORT = 47821;
const LOCAL_URL_PREFIX = 'http://' + LOCAL_HOST + ':' + LOCAL_PORT + '/exam/';
const SMOKE_SERVER = 'https://127.0.0.1:8443';
const IS_DARWIN = process.platform === 'darwin';
const USER_DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Deadpan-Exam-Desktop');
const CONFIG_PATH = path.join(USER_DATA_DIR, 'config.json');

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

async function loadElectron() {
  try {
    const playwright = await import('playwright-core');
    return { electron: playwright._electron || null, error: null };
  } catch (err) {
    return { electron: null, error: err };
  }
}

const skipReason = !IS_DARWIN
  ? 'packaged app 冒烟仅在本机 macOS（darwin）环境验证'
  : !fs.existsSync(PACKAGED_BIN)
    ? 'packaged app 缺失：' + PACKAGED_BIN + '（先执行 R2-1/R3-1 的 mac 打包）'
    : false;

test('packaged 冒烟：打包后 app 启动 → /exam/ 窗口就绪 → 无未捕获异常 → 截图 → 进程退出', { skip: skipReason, timeout: 60000 }, async (t) => {
  const { electron, error } = await loadElectron();
  if (!electron) {
    t.skip('playwright-core 不可用：' + (error && error.message ? error.message : 'import 失败'));
    return;
  }
  // R4-2：与 gui-smoke 串行（固定端口 47821 + 同一 userData config）
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
  let skipped = false;

  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    // packaged app：executablePath 直接指向 .app 主可执行文件，args 为空（app.asar 由 Electron 自动加载）
    electronApp = await electron.launch({
      executablePath: PACKAGED_BIN,
      args: [],
      env,
      timeout: 45000,
    });
    child = electronApp.process();
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

    // 1) packaged 态：app.isPackaged=true、resourcesPath 指向 .app/Contents/Resources
    const appInfo = await electronApp.evaluate(async ({ app }) => ({
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      runAsNode: process.env.ELECTRON_RUN_AS_NODE,
      electron: process.versions.electron,
    }));
    assert.equal(appInfo.isPackaged, true, '打包后 app 的 app.isPackaged 应为 true');
    assert.equal(appInfo.runAsNode, undefined, 'Electron 主进程不应以 ELECTRON_RUN_AS_NODE 模式运行');
    assert.equal(appInfo.electron, '44.9.0');
    assert.equal(appInfo.version, pkg.version, '打包 app 版本应与 package.json 一致');
    assert.equal(pkg.version, '0.1.2', 'HOTFIX-2 版本快照应为 0.1.2');
    assert.match(appInfo.resourcesPath, /Deadpan 判题\.app[\\/]Contents[\\/]Resources$/);
    assert.equal(fs.existsSync(path.join(appInfo.resourcesPath, 'dist', 'index.html')), true, 'packaged app 内 Resources/dist/index.html 缺失');

    // 2) 窗口加载本地 loopback 内容服务 /exam/
    const mainWindowCount = await electronApp.evaluate(async ({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    assert.ok(mainWindowCount >= 1, '主进程 BrowserWindow 数量应为 1，实际 ' + mainWindowCount);

    const url = window.url();
    assert.match(url, new RegExp('^' + LOCAL_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '窗口 URL 应为 ' + LOCAL_URL_PREFIX + '，实际 ' + url);
    assert.equal(new URL(url).origin, 'http://' + LOCAL_HOST + ':' + LOCAL_PORT);

    // 3) 标题 + ready + 非白屏
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

    // 4) 无未捕获异常（packaged 态不应有 dev-only Electron 安全警告）
    assert.deepEqual(pageErrors, [], '存在未捕获页面异常：' + pageErrors.join('\n'));
    const unexpectedConsole = filterOut(consoleMessages, IGNORED_CONSOLE);
    const fatalConsole = unexpectedConsole.filter((entry) => FATAL_PATTERN.test(entry));
    assert.deepEqual(fatalConsole, [], '存在致命 console 错误：' + fatalConsole.join('\n'));
    assert.equal(unexpectedConsole.some((entry) => /Electron Security Warning/i.test(entry)), false,
      'packaged 态不应出现 dev-only Electron 安全警告');

    // 5) 主进程 stderr 无致命启动错误
    const stderrText = stderrChunks.join('');
    const unexpectedStderr = filterOut(stderrText.split('\n'), IGNORED_STDERR).filter((line) => line.trim() !== '');
    const fatalStderr = unexpectedStderr.filter((line) => FATAL_PATTERN.test(line));
    assert.deepEqual(fatalStderr, [], '主进程 stderr 存在致命错误：' + fatalStderr.join('\n'));

    // 6) 截图
    fs.mkdirSync(path.dirname(PNG_PATH), { recursive: true });
    await window.screenshot({ path: PNG_PATH });
    assert.equal(fs.existsSync(PNG_PATH), true, '截图未生成：' + PNG_PATH);
    assert.ok(fs.statSync(PNG_PATH).size > 10 * 1024, '截图文件异常偏小：' + fs.statSync(PNG_PATH).size);

    // 7) 关闭并确认进程退出 + 端口释放
    await electronApp.close();
    electronApp = null;
    const exitCode = await waitChildExit(child, 15000);
    assert.notEqual(exitCode, null, 'packaged app 主进程 15s 内未退出');
    const portReleased = await waitPortClosed(LOCAL_PORT, 10000);
    assert.equal(portReleased, true, '应用退出后本地端口 ' + LOCAL_PORT + ' 未释放');

    t.diagnostic('packaged 冒烟通过：url=' + url + ' title=' + title + ' isPackaged=' + appInfo.isPackaged
      + ' version=' + appInfo.version + ' electron=' + appInfo.electron
      + ' textLen=' + snapshot.textLen + ' appChildren=' + snapshot.appChildren
      + ' screenshotBytes=' + fs.statSync(PNG_PATH).size);
  } catch (err) {
    const message = String((err && err.message) || err);
    if (/Failed to launch|spawn ENOENT|X display|WindowServer|Unable to find Electron app|not supported|EACCES|cannot open|killed/i.test(message)) {
      t.skip('packaged app GUI 环境不可用（skip）：' + message.slice(0, 300));
      skipped = true;
    } else {
      assert.fail('packaged app 冒烟失败：' + message + '\nstderr:\n' + stderrChunks.join('').slice(-3000));
    }
  } finally {
    if (!skipped) {
      try { if (electronApp) await electronApp.close(); } catch { /* 已关闭 */ }
      if (child && child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGTERM'); } catch { /* 忽略 */ }
      }
    }
    try {
      if (configBackup === null) fs.rmSync(CONFIG_PATH, { force: true });
      else fs.writeFileSync(CONFIG_PATH, configBackup);
    } catch { /* 恢复失败不影响测试结论 */ }
    guiLock.release();
  }
});
