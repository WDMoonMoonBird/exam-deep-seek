/**
 * config.mjs —— 桌面端配置（纯逻辑，可被 node 直接 import 单测；不依赖 Electron）。
 *
 * 配置文件：<userData>/config.json（userData 目录由调用方传入，本模块不碰 Electron）。
 * 字段：
 *   · serverUrl        固定远端服务器 origin（必填，如 https://deadpan.asia）
 *   · port             本地 loopback 固定端口（默认 47821；origin 含端口 ⇒ 端口进 localStorage 的 key）
 *   · externalOrigins  允许用系统浏览器打开的外链 origin 白名单（默认空 = 全拒）
 *   · caFile           可选：内网 CA 的 PEM 文件（相对路径按 config.json 所在目录解析）
 *
 * 硬约束（计划 §2.5/§7.2）：serverUrl 只接受 http(s) origin（无凭证/路径/查询）；端口固定，
 * 被占用时明确报错而不是静默换端口；本模块不提供任何"跳过证书校验"开关。
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PORT = 47821;
export const MIN_PORT = 1024;
export const MAX_PORT = 65535;
/** 开发期保留端口：Vite(5173)/后端 Express(3000) 不得被桌面壳占用（协作硬约束） */
export const RESERVED_PORTS = Object.freeze([3000, 5173]);
export const CONFIG_FILE_NAME = 'config.json';
/** 首启/修复默认服务器（HOTFIX-1：首启模板不再写空串，避免启动即失败） */
export const DEFAULT_SERVER_URL = 'https://deadpan.asia';
/** macOS 最低支持版本（计划 §4.1；Electron 44 基线） */
export const MIN_MACOS_MAJOR = 13;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** config.json 的绝对路径 */
export function configPath(userDataDir) {
  if (typeof userDataDir !== 'string' || userDataDir === '') throw new TypeError('configPath: userDataDir 必填');
  return path.join(userDataDir, CONFIG_FILE_NAME);
}

/** 解析 http(s) origin：拒绝凭证/路径/查询/锚点；非法返回 null */
function parseOrigin(raw) {
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** 校验/规范化 serverUrl：返回 { ok:true, value } 或 { ok:false, reason } */
export function normalizeServerUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'serverUrl 不能为空（例：https://deadpan.asia）' };
  }
  const origin = parseOrigin(raw);
  if (!origin) {
    return { ok: false, reason: 'serverUrl 只接受 http(s) origin（不能带凭证/路径/查询串）：' + raw.trim().slice(0, 120) };
  }
  return { ok: true, value: origin };
}

/** 校验端口：整数、1024-65535、避开保留端口；返回 { ok:true, value } 或 { ok:false, reason } */
export function normalizePort(raw) {
  const num = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof num !== 'number' || !Number.isInteger(num)) {
    return { ok: false, reason: 'port 必须是整数（当前 ' + String(raw).slice(0, 32) + '）' };
  }
  if (num < MIN_PORT || num > MAX_PORT) {
    return { ok: false, reason: 'port 必须在 ' + MIN_PORT + '-' + MAX_PORT + ' 之间（当前 ' + num + '）' };
  }
  if (RESERVED_PORTS.includes(num)) {
    return { ok: false, reason: 'port 不能占用开发期保留端口 ' + num + '（Web/后端并行开发）' };
  }
  return { ok: true, value: num };
}

/** 校验外链白名单：origin 数组（去重）；非法项整体拒绝（fail-closed） */
export function normalizeExternalOrigins(raw) {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, value: [], reason: 'externalOrigins 必须是数组' };
  const values = [];
  const errors = [];
  for (const item of raw) {
    const origin = typeof item === 'string' ? parseOrigin(item) : null;
    if (!origin) {
      errors.push('externalOrigins 含非法 origin：' + String(item).slice(0, 120));
      continue;
    }
    if (!values.includes(origin)) values.push(origin);
  }
  if (errors.length > 0) return { ok: false, value: values, reason: errors.join('；') };
  return { ok: true, value: values };
}

/** 校验/解析 CA 文件路径（不校验文件是否存在；存在性由调用方读取时判断） */
export function normalizeCaFile(raw, baseDir = process.cwd()) {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, value: null, reason: 'caFile 必须是字符串路径' };
  const abs = path.isAbsolute(raw) ? raw : path.resolve(baseDir, raw);
  return { ok: true, value: abs };
}

/** 首次启动写入的配置模板（serverUrl 留空 ⇒ 启动时明确报错并给出文件路径） */
export function configTemplate() {
  return {
    _comment: 'serverUrl 默认 https://deadpan.asia（可改）；port 默认 47821，修改后需重启；externalOrigins/caFile 可留空。',
    serverUrl: DEFAULT_SERVER_URL,
    port: DEFAULT_PORT,
    externalOrigins: [],
    caFile: null,
  };
}

/**
 * 配置迁移（纯函数，HOTFIX-1）：已存在 config 的 serverUrl 缺失/空白时补默认值，
 * 其余字段（port/externalOrigins/caFile/_comment 及未知字段）原样保留。
 * 返回 { changed, config }；非对象或无需迁移时 changed=false。
 */
export function migrateConfig(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return { changed: false, config: raw };
  const current = typeof raw.serverUrl === 'string' ? raw.serverUrl.trim() : '';
  if (current !== '') return { changed: false, config: raw };
  return { changed: true, config: { ...raw, serverUrl: DEFAULT_SERVER_URL } };
}

/** 解析配置对象（纯函数）：返回 { ok, config, errors[] }；未知字段忽略 */
export function parseConfig(raw, { baseDir = process.cwd() } = {}) {
  const errors = [];
  let source = {};
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    errors.push('config.json 根节点必须是对象');
  } else if (raw != null) {
    source = raw;
  }

  const server = normalizeServerUrl(source.serverUrl);
  if (!server.ok) errors.push(server.reason);

  const port = hasOwn(source, 'port') ? normalizePort(source.port) : { ok: true, value: DEFAULT_PORT };
  if (!port.ok) errors.push(port.reason);

  const external = normalizeExternalOrigins(source.externalOrigins);
  if (!external.ok) errors.push(external.reason);

  const ca = normalizeCaFile(source.caFile, baseDir);
  if (!ca.ok) errors.push(ca.reason);

  return {
    ok: errors.length === 0,
    config: {
      serverUrl: server.ok ? server.value : '',
      port: port.ok ? port.value : DEFAULT_PORT,
      externalOrigins: external.value || [],
      caFile: ca.ok ? ca.value : null,
    },
    errors,
  };
}

/** 读取配置文件：不存在不算错误（exists:false）；JSON 非法返回 ok:false */
export function readConfigFile(filePath, { fsImpl = fs } = {}) {
  let text;
  try {
    text = fsImpl.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true, exists: false, raw: null };
    return { ok: false, exists: false, raw: null, reason: '读取 config.json 失败：' + ((err && err.message) || err) };
  }
  try {
    return { ok: true, exists: true, raw: JSON.parse(text) };
  } catch (err) {
    return { ok: false, exists: true, raw: null, reason: 'config.json 不是合法 JSON：' + ((err && err.message) || err) };
  }
}

/** 写配置文件（临时文件 + rename，避免半写坏配置） */
export function writeConfigFile(filePath, config, { fsImpl = fs } = {}) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  fsImpl.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  fsImpl.renameSync(tmpPath, filePath);
  return filePath;
}

/**
 * 首次启动确保 config.json 存在；对已存在但 serverUrl 缺失/空白的旧配置做**迁移修复**
 * （保留其它字段，原子写；HOTFIX-1）。返回 { filePath, created, repaired }。
 * JSON 非法时不覆盖用户文件（交给 loadConfig 报明确错误）。
 */
export function ensureConfigFile({ userDataDir, fsImpl = fs } = {}) {
  const filePath = configPath(userDataDir);
  const read = readConfigFile(filePath, { fsImpl });
  if (!read.exists) {
    writeConfigFile(filePath, configTemplate(), { fsImpl });
    return { filePath, created: true, repaired: false };
  }
  if (!read.ok) return { filePath, created: false, repaired: false };
  const migration = migrateConfig(read.raw);
  if (!migration.changed) return { filePath, created: false, repaired: false };
  writeConfigFile(filePath, migration.config, { fsImpl });
  return { filePath, created: false, repaired: true };
}

/** 加载并校验配置：返回 { ok, filePath, exists, config, errors[] } */
export function loadConfig({ userDataDir, fsImpl = fs } = {}) {
  const filePath = configPath(userDataDir);
  const read = readConfigFile(filePath, { fsImpl });
  if (!read.ok) return { ok: false, filePath, exists: read.exists, config: null, errors: [read.reason] };
  if (!read.exists) {
    return {
      ok: false,
      filePath,
      exists: false,
      config: parseConfig(null).config,
      errors: ['配置文件不存在，请先填写 serverUrl：' + filePath],
    };
  }
  const parsed = parseConfig(read.raw, { baseDir: path.dirname(filePath) });
  return { ok: parsed.ok, filePath, exists: true, config: parsed.config, errors: parsed.errors };
}

/**
 * 读取可选内网 CA（PEM）：返回 { ok, ca, reason }；失败不阻断启动（回落系统信任链）。
 * 放在 config 模块，避免组合根直读文件（A 基线 §3.1：index 不 fs 直读）。
 */
export function readCaPem(caFile, { fsImpl = fs } = {}) {
  if (!caFile) return { ok: true, ca: null };
  try {
    return { ok: true, ca: fsImpl.readFileSync(caFile, 'utf8') };
  } catch (err) {
    return { ok: false, ca: null, reason: '读取 caFile 失败：' + ((err && err.message) || err) };
  }
}

/** serverUrl 是否为明文 http（生产分发必须 https；仅用于启动告警，不阻断开发联调） */
export function isInsecureServerUrl(serverUrl) {
  try {
    return new URL(String(serverUrl || '')).protocol === 'http:';
  } catch {
    return false;
  }
}

/** 本地内容服务固定 origin（端口决定 localStorage origin，必须固定） */
export function runtimeOrigin(port = DEFAULT_PORT) {
  return 'http://127.0.0.1:' + port;
}

/** macOS 主版本是否达到最低要求（低于时明确提示并退出，计划 §4.1） */
export function isMacosVersionSupported(version, minimumMajor = MIN_MACOS_MAJOR) {
  const major = Number(String(version == null ? '' : version).split('.')[0]);
  return Number.isInteger(major) && major > 0 && major >= minimumMajor;
}
