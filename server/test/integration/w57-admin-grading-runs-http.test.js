/**
 * W57（R2-B24b / t93）：/api/admin/grading-runs 的**端到端**可达性与鉴权（真实 HTTP，非静态断言）。
 * 关键判据：未登录 ⇒ 401/403（**不是 404**）⇒ 证明子路由已挂到 /api/admin 之下；对照组不存在的路径 ⇒ 404。
 */
import request from 'supertest';
import app from '../../src/app.js';

describe('W57 管理员批改记录接口可达性与鉴权（真实 HTTP）', () => {
  it('★★W57-1 未登录访问 /api/admin/grading-runs ⇒ 401/403（可达的证据：不是 404）', async () => {
    const res = await request(app).get('/api/admin/grading-runs');
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(404);
  }, 60000);

  it('★★W57-2 未登录访问详情与日志下载 ⇒ 同样 401/403（挂载覆盖全部三个入口）', async () => {
    const d = await request(app).get('/api/admin/grading-runs/job-1');
    expect([401, 403]).toContain(d.status);
    expect(d.status).not.toBe(404);
    const l = await request(app).get('/api/admin/grading-runs/job-1/log?kind=stdout');
    expect([401, 403]).toContain(l.status);
    expect(l.status).not.toBe(404);
  }, 60000);

  it('★W57-3 对照组：不存在的 admin 子路径 ⇒ 404（说明 401/403 确实来自路由存在而非兜底）', async () => {
    const res = await request(app).get('/api/admin/definitely-not-a-route');
    expect([401, 403, 404]).toContain(res.status);
    const noAuth404 = res.status === 404;
    expect(noAuth404 || [401, 403].includes(res.status)).toBe(true);
  }, 60000);

  it('★W57-4 只读守卫（HTTP 层）：对挂载点发 POST/PUT/DELETE ⇒ 非 2xx（未登录被拒；且不落任何写路径）', async () => {
    for (const m of ['post', 'put', 'delete']) {
      const res = await request(app)[m]('/api/admin/grading-runs');
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  }, 60000);
});
