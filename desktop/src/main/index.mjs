/**
 * index.mjs —— Electron main 组合根：单实例、启动本地内容服务 + 固定远端反代、secure BrowserWindow、退出清理。
 *
 * 只做生命周期与装配（A 基线 §3.1：目标 ≤200 行）：配置校验/路径分类/CSP/代理头/安全决策全部在叶模块。
 * 依赖方向：index → { config, content-server, proxy, security, security-policy }，任何模块不 import 本文件。
 */
import { app, BrowserWindow, dialog, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SERVER_URL, MIN_MACOS_MAJOR, configPath, ensureConfigFile, isInsecureServerUrl,
  isPlatformSupported, loadConfig, readCaPem,
} from './config.mjs';
import { startContentServer } from './content-server.mjs';
import { createProxy } from './proxy.mjs';
import { createSecurityPolicy, secureWebPreferences } from './security-policy.mjs';
import { applySecurity } from './security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..');
const APP_NAME = 'Deadpan 判题';
/** userData 固定目录名：替换 DMG 不清登录态/配置（计划 §2.5/§4.4） */
const USER_DATA_DIR = path.join(app.getPath('appData'), 'Deadpan-Exam-Desktop');
/** sandbox:true 下 preload 必须是 CommonJS（A 基线 §3.4） */
const PRELOAD_PATH = path.join(DESKTOP_ROOT, 'src', 'preload', 'index.cjs');

let services = null; // { proxy, content }
let activePolicy = null;
let mainWindow = null;

function createLogger() {
  const stamp = () => new Date().toISOString();
  return {
    info: (message) => console.log('[' + stamp() + '] ' + message),
    warn: (message) => console.warn('[' + stamp() + '] ' + message),
    error: (message) => console.error('[' + stamp() + '] ' + message),
  };
}

const log = createLogger();

/** 安全基线（显式）：contextIsolation:true、sandbox:true、nodeIntegration:false、webSecurity:true。
 *  具体值由 security-policy.WEB_PREFERENCES 单一持有，经 secureWebPreferences 装配（F7：无死 import/重复逻辑）。 */
function webPreferences() {
  return secureWebPreferences({ preload: PRELOAD_PATH, devTools: !app.isPackaged });
}

function resolveContentRoot() {
  // 打包后：extraResources 把 dist-desktop 映射到 Resources/dist；开发态：仓库根 dist-desktop
  return app.isPackaged ? path.join(process.resourcesPath, 'dist') : path.join(REPO_ROOT, 'dist-desktop');
}

function explainListenError(err, port) {
  if (err && err.code === 'EADDRINUSE') {
    return '端口 ' + port + ' 被占用：请关闭占用该端口的程序，或修改 config.json 的 port。'
      + '（固定端口决定 localStorage origin，不能静默更换）\n\n配置文件：' + configPath(USER_DATA_DIR);
  }
  return (err && err.message) || String(err);
}

function fail(title, detail) {
  log.error(title + '：' + detail);
  try { dialog.showErrorBox(title, detail); } catch { /* 对话框失败时至少已落日志 */ }
  app.quit();
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: APP_NAME,
    backgroundColor: '#ffffff',
    webPreferences: webPreferences(),
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { mainWindow = null; });
  win.webContents.on('render-process-gone', (_event, details) => log.error('render-process-gone：' + details.reason));
  win.webContents.on('unresponsive', () => log.warn('窗口无响应（等待 Chromium 恢复）'));
  win.loadURL(services.content.url).catch((err) => log.error('加载本地页面失败：' + ((err && err.message) || err)));
}

async function bootstrap() {
  const platform = process.platform;
  const systemVersion = process.getSystemVersion();
  log.info('平台：' + platform + ' ' + systemVersion + '（Electron ' + process.versions.electron + '）');

  // 平台感知检查（HOTFIX-2）：只有 macOS 才做 macOS 版本判断；Windows/Linux 直接放行
  if (!isPlatformSupported(platform, systemVersion)) {
    if (platform === 'darwin') {
      fail('系统版本过低', '需要 macOS ' + MIN_MACOS_MAJOR + ' 或更高（当前 ' + systemVersion + '）。');
    } else {
      fail('平台不受支持', '当前平台 “' + platform + '” 不在支持范围（支持 macOS ' + MIN_MACOS_MAJOR + '+ / Windows 10+）。');
    }
    return;
  }

  const ensured = ensureConfigFile({ userDataDir: USER_DATA_DIR });
  if (ensured.created) log.info('已生成配置模板：' + ensured.filePath);
  if (ensured.repaired) {
    log.warn('config.json 的 serverUrl 为空，已自动写入默认值 ' + DEFAULT_SERVER_URL + '（' + ensured.filePath + '）');
  }
  const loaded = loadConfig({ userDataDir: USER_DATA_DIR });
  if (!loaded.ok) {
    fail('服务器配置无效', loaded.filePath + '\n\n' + loaded.errors.join('\n'));
    return;
  }
  const config = loaded.config;
  // F9：明文 http 启动告警（生产分发必须 https；开发联调允许但留痕）
  if (isInsecureServerUrl(config.serverUrl)) {
    log.warn('serverUrl 使用明文 http：令牌/数据将明文传输，生产分发必须使用 https（' + loaded.filePath + '）');
  }

  const ca = readCaPem(config.caFile);
  if (!ca.ok) log.warn(ca.reason + '（继续使用系统信任链）');

  services = { proxy: createProxy({ serverUrl: config.serverUrl, tlsCa: ca.ca, log }) };
  try {
    services.content = await startContentServer({
      rootDir: resolveContentRoot(),
      port: config.port,
      proxy: services.proxy,
      env: process.env,
      log,
    });
  } catch (err) {
    fail('本地服务启动失败', explainListenError(err, config.port));
    return;
  }

  activePolicy = createSecurityPolicy({
    appOrigin: services.content.origin,
    externalOrigins: config.externalOrigins,
  });
  applySecurity({ session: session.defaultSession, policy: activePolicy, log });

  app.on('web-contents-created', (_event, contents) => {
    if (!activePolicy) return;
    applySecurity({
      webContents: contents,
      policy: activePolicy,
      openExternal: (url) => shell.openExternal(url),
      childWindowOptions: webPreferences(),
      log,
    });
  });

  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
  log.info('桌面壳已启动：' + services.content.url + ' → ' + config.serverUrl);
}

app.setPath('userData', USER_DATA_DIR);
app.setName(APP_NAME);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady()
    .then(bootstrap)
    .catch((err) => fail('桌面壳启动失败', (err && err.stack) || String(err)));

  app.on('window-all-closed', () => app.quit());

  app.on('will-quit', () => {
    if (services && services.content) services.content.close().catch(() => {});
    if (services && services.proxy) services.proxy.close().catch(() => {});
    services = null;
  });
}

process.on('uncaughtException', (err) => log.error('uncaughtException：' + ((err && err.stack) || err)));
process.on('unhandledRejection', (reason) => log.error('unhandledRejection：' + ((reason && reason.stack) || reason)));
