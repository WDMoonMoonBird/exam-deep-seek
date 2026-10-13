/**
 * W70（R2-B69 / WAVE4）：CSP 三态开关 + 策略保守性 + 死代码删除后的「缺密钥快速失败」。
 *
 * 覆盖：
 *  ① `resolveCspMode` 三态（off / report-only / enforce）与默认值、非法值回落；
 *  ② 策略指令集：self + 必要 inline/blob/data 最小集；**不含** 'unsafe-eval' 与通配 '*'；
 *  ③ 中间件三态行为（真 express + supertest）：off 不发头 / report-only 只发 Report-Only / enforce 发强制头；
 *  ④ 真 app.js 默认态 = report-only（集成）；
 *  ⑤ ★死代码清除：app.js 不再有 randomBytes 兜底；子进程在**未配置 JWT_SECRET** 时快速失败（非 0 退出 + 明确报错）。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import {
  CSP_MODES, CSP_DEFAULT_MODE, resolveCspMode, buildCspDirectives, cspMiddleware,
} from '../../src/middleware/csp.js';
import app from '../../src/app.js';

const SERVER_DIR = path.resolve(process.cwd());

function mkApp(opts) {
  const a = express();
  a.use(cspMiddleware(opts));
  a.get('/ping', (_req, res) => res.json({ ok: true }));
  return a;
}

describe('W70-1 CSP 开关解析（三态 + 默认 + 非法回落）', () => {
  test('默认 = report-only；显式三态原样返回；大小写/空白不敏感', () => {
    expect(CSP_DEFAULT_MODE).toBe('report-only');
    expect(CSP_MODES).toEqual(['off', 'report-only', 'enforce']);
    expect(resolveCspMode({})).toBe('report-only');
    expect(resolveCspMode({ CSP_MODE: '' })).toBe('report-only');
    expect(resolveCspMode({ CSP_MODE: 'off' })).toBe('off');
    expect(resolveCspMode({ CSP_MODE: ' Report-Only ' })).toBe('report-only');
    expect(resolveCspMode({ CSP_MODE: 'ENFORCE' })).toBe('enforce');
  });

  test('非法值 ⇒ 回落 report-only 并告警（绝不静默变 enforce）', () => {
    const warns = [];
    expect(resolveCspMode({ CSP_MODE: 'enforced' }, { warn: { warn: (m) => warns.push(m) } })).toBe('report-only');
    expect(warns.length).toBe(1);
    expect(warns[0]).toMatch(/CSP_MODE/);
  });
});

describe('W70-2 策略指令集（保守可解释）', () => {
  const d = buildCspDirectives({});
  test('基础收口：default-src self、object-src none、frame-ancestors self、base-uri self', () => {
    expect(d.defaultSrc).toEqual(["'self'"]);
    expect(d.objectSrc).toEqual(["'none'"]);
    expect(d.frameAncestors).toEqual(["'self'"]);
    expect(d.baseUri).toEqual(["'self'"]);
  });
  test('SPA 必需的最小放行集：script/style unsafe-inline、worker blob:、connect ws/wss、img/font data:', () => {
    expect(d.scriptSrc).toContain("'self'");
    expect(d.scriptSrc).toContain("'unsafe-inline'");     // 首帧主题等 5 段构建期内联脚本（client/ 本波不改）
    expect(d.styleSrc).toContain("'unsafe-inline'");      // Vue 运行时行内样式
    expect(d.workerSrc).toContain('blob:');               // monaco worker
    expect(d.connectSrc).toContain('ws:');
    expect(d.connectSrc).toContain('wss:');
    expect(d.imgSrc).toContain('data:');
    expect(d.fontSrc).toContain('data:');
  });
  test('★放宽项必须是「有证据的最小集」：无通配 *、无外部 CDN 源；unsafe-eval/data: 均有可溯源证据', () => {
    const flat = Object.values(d).flat().join(' ');
    expect(flat).not.toContain('*');
    expect(flat).not.toMatch(/https?:\/\//);
    // 两处“不安全但必需”的放行（chromium 实测来源，见 csp.js 注释与 R2-B69 记录）：
    //   ① ant-design-vue 的 CSS 特性探测 `new Function("a?.b")`；② Vite 的 `data:text/javascript` 现代浏览器探测。
    expect(d.scriptSrc).toContain("'unsafe-eval'");
    expect(d.scriptSrc).toContain('data:');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src', 'middleware', 'csp.js'), 'utf8');
    expect(src).toMatch(/new Function\("a\?\.b"\)/);      // 证据锚点①（antd 探测）
    expect(src).toMatch(/data:text\/javascript/);            // 证据锚点②（Vite 探测）
  });
  test('report-uri 仅在显式配置 CSP_REPORT_URI 时出现（默认不引 404 上报）', () => {
    expect(d.reportUri).toBeUndefined();
    expect(buildCspDirectives({ CSP_REPORT_URI: 'https://example.test/csp' }).reportUri).toEqual(['https://example.test/csp']);
  });
});

describe('W70-3 中间件三态行为（真 HTTP）', () => {
  test('off ⇒ 不发任何 CSP 头（= 一键回滚）', async () => {
    const res = await request(mkApp({ env: { CSP_MODE: 'off' } })).get('/ping');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['content-security-policy-report-only']).toBeUndefined();
  });
  test('report-only ⇒ 只发 Report-Only 头（不拦截）', async () => {
    const res = await request(mkApp({ env: { CSP_MODE: 'report-only' } })).get('/ping');
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['content-security-policy-report-only']).toMatch(/default-src 'self'/);
  });
  test('enforce ⇒ 发强制头，且含默认收口与最小放行集', async () => {
    const res = await request(mkApp({ env: { CSP_MODE: 'enforce' } })).get('/ping');
    expect(res.headers['content-security-policy-report-only']).toBeUndefined();
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'self'/);
    // 两处“不安全但必需”的放行（antd new Function 探测 / Vite data: 探测）**保留且已溯源**；
    // 但绝不允许通配与外部源混进来（本测试守住这条线）。
    expect(csp).not.toContain('*');
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).toMatch(/'unsafe-eval'/);
    expect(csp).toMatch(/data:/);
  });
});

describe('W70-4 真 app 默认态与死代码清除', () => {
  test('真 app（默认 env）⇒ Report-Only 头，且接口契约不受影响', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.headers['content-security-policy-report-only']).toMatch(/default-src 'self'/);
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  test('★app.js 已无随机兜底死代码（无 randomBytes / 不写 process.env.JWT_SECRET）', () => {
    const src = fs.readFileSync(path.join(SERVER_DIR, 'src', 'app.js'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/randomBytes/);
    expect(code).not.toMatch(/process\.env\.JWT_SECRET\s*=/);   // 绝不生成/写入兜底值
    expect(code).toMatch(/throw new Error\('JWT_SECRET 未配置/); // 保留零副作用显式失败点
  });

  test('★缺密钥 ⇒ 子进程快速失败（非 0 退出 + 明确报错；绝不带病启动）', () => {
    // 隔离手法：显式把 JWT_SECRET 置空。**不能**靠「cwd 无 .env」——实测 @prisma/client 运行期会加载
    // server/.env（dotenv 默认不覆盖已存在的键）⇒ 置空即可稳定复现「缺密钥」。
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: os.tmpdir(), NODE_ENV: 'test', JWT_SECRET: '' };
    const modulePath = path.join(SERVER_DIR, 'src', 'app.js');
    const r = spawnSync(process.execPath, ['-e', 'import(' + JSON.stringify(modulePath) + ').then(() => { console.log("LOADED"); }).catch((e) => { console.error("ERR:" + e.message); process.exit(3); })'], {
      cwd: os.tmpdir(), env, encoding: 'utf8', timeout: 30000,
    });
    expect(r.stdout).not.toContain('LOADED');                     // 绝不带病启动
    expect(r.status).not.toBe(0);
    expect(String(r.stderr)).toMatch(/JWT_SECRET/);
  });
});
