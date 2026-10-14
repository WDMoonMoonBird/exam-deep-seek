/**
 * _guard.mjs —— E2E 脚本共用守卫（R3-E1 / 计划 §11.5）
 * ① 非 localhost 目标默认拒绝（需 E2E_ALLOW_REMOTE=1）
 * ② 启动时打印将写入的库名（读 server/.env 的 DATABASE_URL）
 * ③ --i-know（或 E2E_I_KNOW=1）确认；本机开发库 exam_system 之外的库一律要求确认
 * ④ 素材目录支持 E2E_MATERIALS_DIR 覆盖
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_MATERIALS = '/Users/you/My Projects/My Spring/第六章 Spring MVC 数据绑定和响应/第六章实验';

export function materialsDir() { return process.env.E2E_MATERIALS_DIR || DEFAULT_MATERIALS; }

export function targetDb() {
  try {
    const txt = fs.readFileSync(path.join(REPO, 'server', '.env'), 'utf8');
    const url = new URL(/^DATABASE_URL=(.*)$/m.exec(txt)[1].trim());
    return { name: decodeURIComponent(url.pathname.replace(/^\//, '')), host: url.hostname, url: url.toString() };
  } catch { return { name: '(unknown)', host: '(unknown)', url: '' }; }
}

/** 从 server/node_modules 解析依赖（scripts/ 下没有自己的 node_modules） */
export function serverRequire(name) {
  return createRequire(path.join(REPO, 'server', 'package.json'))(name);
}

export function prismaClient() {
  const require = createRequire(path.join(REPO, 'server', 'package.json'));
  const { PrismaClient } = require('@prisma/client');
  const db = targetDb();
  return new PrismaClient({ datasources: { db: { url: db.url } } });
}

/**
 * @param {{base:string, requireIKnow?:boolean}} opts
 */
export function guard({ base, requireIKnow = false } = {}) {
  const u = new URL(base);
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  const db = targetDb();
  const approvedDev = local && db.name === 'exam_system';
  console.log('[E2E][guard] base=' + base + ' | 将写入库=' + db.name + ' @' + db.host + ' | 本机目标=' + local + ' | 已批准的本地开发库=' + approvedDev);
  if (!local && process.env.E2E_ALLOW_REMOTE !== '1') {
    console.error('[E2E][guard] ⛔ 目标主机不是 localhost ⇒ 默认拒绝运行。如确需远程，请设 E2E_ALLOW_REMOTE=1 并加 --i-know。');
    process.exit(2);
  }
  const needKnow = requireIKnow || !approvedDev;
  const acked = process.argv.includes('--i-know') || process.env.E2E_I_KNOW === '1';
  if (needKnow && !acked) {
    console.error('[E2E][guard] ⛔ 需要确认：请加 --i-know（或 E2E_I_KNOW=1）以确认将写入库 ' + db.name);
    process.exit(3);
  }
  return { local, dbName: db.name, approvedDev, acked };
}

/** fetch 封装：json */
export function makeApi(base) {
  const api = async (method, p, token, body) => {
    const res = await fetch(base + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch { /* 非 JSON */ }
    return { status: res.status, j, txt };
  };
  const upload = async (p, token, filePath, field = 'file') => {
    const buf = fs.readFileSync(filePath);
    const fd = new FormData();
    fd.append(field, new Blob([buf]), path.basename(filePath));
    const res = await fetch(base + p, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: fd });
    const txt = await res.text();
    let j = null; try { j = JSON.parse(txt); } catch { /* 非 JSON */ }
    return { status: res.status, j, txt };
  };
  return { api, upload, login: async (username, password, schoolCode) => { const r = await api('POST', '/auth/login', null, { username, password, ...(schoolCode ? { schoolCode } : {}) }); return r; } };
}

export class Report {
  constructor(name) { this.name = name; this.rows = []; }
  add(id, verdict, detail = '', extra = {}) { this.rows.push({ id, verdict, detail: String(detail).slice(0, 400), ...extra }); console.log('[' + verdict + '] ' + id + (detail ? ' :: ' + String(detail).slice(0, 220) : '')); }
  pass(id, d, e) { this.add(id, 'PASS', d, e); }
  fail(id, d, e) { this.add(id, 'FAIL', d, e); }
  skip(id, d, e) { this.add(id, 'SKIP', d, e); }
  summary() { const c = (v) => this.rows.filter((r) => r.verdict === v).length; return { total: this.rows.length, pass: c('PASS'), fail: c('FAIL'), skip: c('SKIP') }; }
  write(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ name: this.name, generatedAt: new Date().toISOString(), db: targetDb().name, summary: this.summary(), rows: this.rows }, null, 2)); return file; }
}
