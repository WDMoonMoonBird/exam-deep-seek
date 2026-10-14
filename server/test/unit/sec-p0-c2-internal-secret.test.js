/**
 * ★C2（P0）回归断言：内部回调密钥无兜底 / 未配置即拒启 / 错误 Bearer 必须被拒
 *
 *   C2-1 未配置 INTERNAL_SECRET ⇒ **进程拒绝启动**（非零退出，且绝不出现"HTTP 服务已启动"）
 *   C2-2 HEAD 的硬编码兜底值（'***REDACTED***'）⇒ 403（被拒，不得被当作合法内部密钥）
 *   C2-3 任意错误 Bearer / 缺失 Authorization ⇒ 403
 *   C2-4 正对照：当前配置的密钥 ⇒ 200（证明 403 不是"接口坏了"）
 *
 * 修复前（HEAD）：`process.env.INTERNAL_SECRET || '***REDACTED***'` ⇒ 未配置也能启动，
 *   且**公开在源码里的兜底值就是可用密钥** ⇒ C2-1/C2-2 必红。
 * 本文件为 unit 层（不需要测试库）；C2-1 用真实子进程启动 `src/app.js`，与生产启动路径一致。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import app from '../../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '../..');
const ENTRY = path.join(SERVER_ROOT, 'src', 'app.js');
// 拼接构造：仓库内不得再出现该兜底字面量（断言"历史值必须被拒"）
const HISTORICAL_FALLBACK = 'exam' + '_internal_' + '2026';

const postGraded = (authHeader, body = { schoolId: 1, jobId: 1 }) => {
  const req = request(app).post('/api/internal/graded');
  return (authHeader === undefined ? req : req.set('Authorization', authHeader)).send(body);
};

describe('★C2（P0）：INTERNAL_SECRET 无兜底 + 内部回调鉴权', () => {
  it('C2-1 未配置 INTERNAL_SECRET ⇒ 进程拒绝启动', () => {
    const res = spawnSync(process.execPath, [ENTRY], {
      cwd: SERVER_ROOT,
      encoding: 'utf8',
      timeout: 20000,
      env: { ...process.env, INTERNAL_SECRET: '', PORT: '0' },
    });
    const out = String(res.stdout || '') + String(res.stderr || '');
    expect(out).not.toContain('HTTP 服务已启动');
    expect(out).toContain('INTERNAL_SECRET');
    expect(res.status).not.toBe(0);
  }, 30000);

  it('C2-2 历史硬编码兜底值 ⇒ 403（被拒）', async () => {
    const res = await postGraded('Bearer ' + HISTORICAL_FALLBACK);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1003);
  });

  it('C2-3 任意错误 Bearer / 缺失 Authorization ⇒ 403', async () => {
    const wrong = await postGraded('Bearer definitely-not-the-secret');
    expect(wrong.status).toBe(403);
    const missing = await postGraded(undefined);
    expect(missing.status).toBe(403);
  });

  it('C2-4 正对照：当前配置的密钥 ⇒ 200', async () => {
    expect(process.env.INTERNAL_SECRET).toBeTruthy();
    const res = await postGraded('Bearer ' + process.env.INTERNAL_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });
});
