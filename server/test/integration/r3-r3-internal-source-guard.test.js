/**
 * R3-R3（P1）回归断言：内部回调 /api/internal/graded 的暴露面收口
 *
 * 依据：reports/fix/round3/TICKETS/R3-R3.md §3 验收断言；D 实现：
 *   · 网关层 nginx-exam.conf：location ^~ /exam/api/internal/ { return 404; }
 *   · 应用层 server/src/app.js：INTERNAL_SECRET 强度校验 + 携带任一代理头即视为公网入口拒绝
 *     （本机 worker 直连 loopback、不带代理头，不受影响）
 *
 * 可测性说明：isTrustedInternalSource 未导出纯函数 ⇒ 用行为级断言：
 *   ① 子进程：弱值/短值/生产短值 ⇒ 拒绝启动（fail-closed），强值 ⇒ 正常启动；
 *   ② supertest：正确 Bearer + 代理头 ⇒ 403；无代理头 + 正确 Bearer ⇒ 200（正控制）。
 *      supertest 对端恒为回环，无法伪造 remoteAddress；但代理头判定可在应用层直接验证。
 *   ③ 静态：nginx 404 块存在且位于通用 /exam/api/ 之前；worker 直连不带代理头；测试注入值满足下限。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import app from '../../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const ENTRY = path.join(SERVER_ROOT, 'src', 'app.js');

/** 同步跑一次入口进程，收集 stdout+stderr（用于 fail-closed 负例） */
function runEntry(extraEnv) {
  const res = spawnSync(process.execPath, [ENTRY], {
    cwd: SERVER_ROOT,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, PORT: '0', ...extraEnv },
  });
  return String(res.stdout || '') + String(res.stderr || '');
}

/** 异步启动入口进程，等到「HTTP 服务已启动」后 SIGTERM（用于强值正例） */
function startEntry(extraEnv, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      cwd: SERVER_ROOT,
      env: { ...process.env, PORT: '0', ...extraEnv },
    });
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('启动超时（未出现 HTTP 服务已启动）:: ' + out.slice(-600)));
    }, timeoutMs);
    const onData = (d) => {
      out += String(d);
      if (out.includes('HTTP 服务已启动')) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        resolve(out);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      if (!out.includes('HTTP 服务已启动')) {
        clearTimeout(timer);
        reject(new Error('进程提前退出 code=' + code + ' :: ' + out.slice(-600)));
      }
    });
  });
}

const postGraded = (authHeader, extraHeaders = {}, body = { schoolId: 1, jobId: 1 }) => {
  let req = request(app).post('/api/internal/graded');
  if (authHeader !== undefined) req = req.set('Authorization', authHeader);
  for (const [name, value] of Object.entries(extraHeaders)) req = req.set(name, value);
  return req.send(body);
};

describe('R3-R3 · INTERNAL_SECRET 强度校验（子进程 fail-closed）', () => {
  it('已知弱值 ***REDACTED*** ⇒ 拒绝启动且提示强度不足', () => {
    const out = runEntry({ INTERNAL_SECRET: '***REDACTED***' });
    expect(out).toMatch(/INTERNAL_SECRET/);
    expect(out).toMatch(/强度不足/);
    expect(out).not.toContain('HTTP 服务已启动');
  }, 30000);

  it('长度不足（15 < 非生产下限 16）⇒ 拒绝启动', () => {
    const out = runEntry({ INTERNAL_SECRET: 'short-secret-15' });
    expect(out).toMatch(/强度不足/);
    expect(out).not.toContain('HTTP 服务已启动');
  }, 30000);

  it('生产模式（20 < 32）⇒ 拒绝启动（用强 JWT_SECRET 排除前置校验干扰，不打印任何密钥值）', () => {
    const out = runEntry({
      NODE_ENV: 'production',
      JWT_SECRET: 'J'.repeat(64),
      INTERNAL_SECRET: 'a'.repeat(20),
    });
    expect(out).toMatch(/强度不足/);
    expect(out).not.toContain('HTTP 服务已启动');
  }, 30000);

  it('强值（>=32 字符随机风格）⇒ 正常启动（正控制）', async () => {
    const strong = 'C3r3-Strong-' + 'k9Qz'.repeat(8);   // 44 字符
    const out = await startEntry({ INTERNAL_SECRET: strong });
    expect(out).toContain('HTTP 服务已启动');
  }, 30000);
});

describe('R3-R3 · 应用层：携带代理头 = 公网入口，一律拒绝（纵深）', () => {
  const SECRET = process.env.INTERNAL_SECRET;
  const PROXY_HEADERS = [
    ['X-Forwarded-For', '203.0.113.10'],
    ['X-Real-IP', '203.0.113.10'],
    ['X-Forwarded-Proto', 'https'],
    ['X-Forwarded-Host', 'evil.example'],
    ['Forwarded', 'for=203.0.113.10'],
  ];

  it('正控制：无代理头 + 正确 Bearer（本机直连）⇒ 200', async () => {
    expect(SECRET).toBeTruthy();
    const res = await postGraded('Bearer ' + SECRET);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it.each(PROXY_HEADERS)('正确 Bearer + %s（nginx 反代场景）⇒ 403(code 1003)', async (name, value) => {
    const res = await postGraded('Bearer ' + SECRET, { [name]: value });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
  });

  it('错误 Bearer + 代理头 ⇒ 403', async () => {
    const res = await postGraded('Bearer definitely-not-the-secret', { 'X-Forwarded-For': '203.0.113.10' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
  });

  it('无 Authorization + 代理头 ⇒ 403', async () => {
    const res = await postGraded(undefined, { 'X-Forwarded-For': '203.0.113.10' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
  });
});

describe('R3-R3 · 静态：网关封禁 + worker 直连链路 + 测试注入值', () => {
  it('nginx 对 /exam/api/internal/ 返回 404，且位于通用 /exam/api/ 之前（不用 internal; 语义）', () => {
    const nginx = fs.readFileSync(path.join(REPO_ROOT, 'nginx-exam.conf'), 'utf8');
    const internalIdx = nginx.search(/location\s+\^~\s+\/exam\/api\/internal\/\s*\{\s*return\s+404\s*;\s*\}/);
    expect(internalIdx).toBeGreaterThan(-1);
    const genericIdx = nginx.indexOf('location /exam/api/');
    expect(genericIdx).toBeGreaterThan(-1);
    expect(internalIdx).toBeLessThan(genericIdx);
    // 不得使用 internal; 指令（语义易误读；票面明确要求 return 404）
    expect(nginx).not.toMatch(/location\s+\^~\s+\/exam\/api\/internal\/\s*\{[^}]*\binternal\s*;/);
  });

  it('评分 worker 直连 127.0.0.1 且不携带任何代理头（不受新判定影响）', () => {
    const worker = fs.readFileSync(
      path.join(SERVER_ROOT, 'src/infrastructure/worker/grading-worker.js'),
      'utf8',
    );
    expect(worker).toMatch(/http:\/\/127\.0\.0\.1:/);
    expect(worker).toContain('Authorization');
    expect(worker).not.toMatch(/x-forwarded-for|x-forwarded-proto|x-real-ip|forwarded/i);
  });

  it('测试注入的 INTERNAL_SECRET 兜底值满足非生产下限（≥16）', () => {
    for (const rel of ['test/setup.js', 'test/setup-env.js']) {
      const src = fs.readFileSync(path.join(SERVER_ROOT, rel), 'utf8');
      const m = src.match(/process\.env\.INTERNAL_SECRET\s*=\s*'([^']+)'/);
      expect(m).not.toBeNull();
      expect(m[1].length).toBeGreaterThanOrEqual(16);
    }
    const pw = fs.readFileSync(path.join(SERVER_ROOT, 'test/e2e/playwright.config.js'), 'utf8');
    expect(pw).toMatch(/crypto\.randomBytes\(32\)/);
  });
});
