/**
 * e2e-accounts.js —— E2E 夹具账号的**唯一事实源**（★W2-C15）
 *
 * 背景（H6：随机临时口令 + 首登强制改密）：
 *   · 经 API 建号（/admin/teachers、/teacher/students…）返回的是**一次性随机临时口令**（`data.initialPassword`）；
 *   · 首次用它登录后，除 /api/auth/login 与 /api/auth/password 外的接口一律 403/code 1005（强制改密闸门）。
 * ⇒ E2E 夹具必须走「**临时口令登录 → 改密为已知口令 → 用已知口令重新登录**」，spec 才能用稳定口令登录；
 *   这条路径同时**真实覆盖 H6 的首登改密流程**，并顺带验证「改密端点属白名单」的防双向锁死设计。
 *
 * **红线**：严禁再按「口令 = 用户名/学号」取（那等于把 H6 修掉的缺陷种回测试）。
 */

/** 已知（改密后）口令：spec 与夹具共用；口令=用户名是**被 H6 移除的缺陷**，故这里刻意取不同的强口令 */
export const E2E_TEACHER = { username: 'e2e_teacher', password: 'E2e-Teacher-2026' };
export const E2E_STUDENT_PASSWORD = 'E2e-Student-2026';
/** 手工脚本（screenshots.js）沿用的教师账号（由 setup-test-data.js 创建） */
export const E2E_SEED_TEACHER = { username: 'testteacher1', password: 'E2e-Teacher-2026' };

/**
 * 确保账号最终可用已知口令登录，并返回可用 token。
 * 幂等：① 已知口令能登录 ⇒ 直接返回（第二次跑 E2E 的常态）；
 *      ② 否则建号或管理员重置 ⇒ 拿一次性临时口令 ⇒ 首登改密为已知口令 ⇒ 重新登录。
 * @param {object} o
 * @param {(method: string, url: string, body?: object, token?: string) => Promise<any>} o.request
 * @param {'teacher'|'student'} o.kind
 * @param {string} o.username 登录用用户名（学生为 @ 前部分或完整用户名均可，由调用方决定）
 * @param {string} o.password 目标已知口令
 * @param {string} [o.adminToken] 管理员 token（teacher 建号/重置用）
 * @param {string} [o.teacherToken] 教师 token（student 建号/重置用）
 * @param {number} [o.schoolId]
 * @param {number} [o.userId] 已知账号 id（省一次列表查询）
 * @param {string} [o.realName]
 * @returns {Promise<{token: string, id?: number, password: string, viaChange: boolean}>}
 */
export async function ensureLoginable(o) {
  const { request, kind, username, password } = o;
  // ① 已知口令直接登录（幂等快路径）
  const direct = await request('POST', '/auth/login', { username, password });
  if (direct?.code === 0) return { token: direct.data.token, password, viaChange: false };

  // ② 取一次性临时口令：建号（若不存在）或重置（已存在）
  let temp = null;
  let id = o.userId;
  const trace = {};   // ★诊断留痕：失败时把中间响应一并抛出（便于定位口径漂移）
  if (kind === 'teacher') {
    const created = await request('POST', '/admin/teachers', { username, realName: o.realName || username, schoolIds: o.schoolId ? [o.schoolId] : [] }, o.adminToken);
    trace.created = created;
    if (created?.code === 0) { temp = created.data?.initialPassword; id = created.data?.id; }
    else {
      if (!id) {
        const list = await request('GET', '/admin/teachers', undefined, o.adminToken);
        trace.listCount = Array.isArray(list?.data) ? list.data.length : list?.data;
        id = (list?.data || []).find((t) => t.username === username)?.id;
      }
      if (!id) throw new Error('E2E 夹具：教师既建不出也查不到 ' + username + ' :: ' + JSON.stringify(trace));
      // 路由方法为 **PUT**（routes/admin.js:34 router.put('/teachers/:id/reset-password')）——POST 会 1404
      const reset = await request('PUT', '/admin/teachers/' + id + '/reset-password', {}, o.adminToken);
      trace.reset = reset;
      temp = reset?.data?.initialPassword;
    }
  } else {
    const created = await request('POST', '/teacher/students', { username, realName: o.realName || username, classId: o.classId }, o.teacherToken);
    if (created?.code === 0) { temp = created.data?.initialPassword; id = created.data?.id; }
    else {
      if (!id) throw new Error('E2E 夹具：学生已存在但未提供 id，无法重置 ⇒ ' + JSON.stringify(created));
      const reset = await request('PUT', '/teacher/students/' + id + '/reset-password' + (o.schoolId ? '?schoolId=' + o.schoolId : ''), {}, o.teacherToken);
      temp = reset?.data?.initialPassword;
    }
  }
  if (typeof temp !== 'string' || !temp) {
    throw new Error('E2E 夹具：未拿到一次性临时口令（H6 之后不得再按"口令=用户名"取）:: ' + username + ' :: ' + JSON.stringify(trace));
  }

  // ③ 临时口令登录 → 首登改密（白名单放行改密端点）
  const tempLogin = await request('POST', '/auth/login', { username, password: temp });
  if (tempLogin?.code !== 0) throw new Error('E2E 夹具：临时口令登录失败 :: ' + JSON.stringify(tempLogin));
  if (tempLogin.data?.user?.mustChangePassword !== true) {
    throw new Error('E2E 夹具：H6 标志未置位（预期 mustChangePassword=true）:: ' + username);
  }
  const changed = await request('PUT', '/auth/password', { oldPassword: temp, newPassword: password }, tempLogin.data.token);
  if (changed?.code !== 0) throw new Error('E2E 夹具：首登改密失败（白名单是否放行？）:: ' + JSON.stringify(changed));

  // ④ 已知口令重新登录（改密后旧令牌失效）
  const relogin = await request('POST', '/auth/login', { username, password });
  if (relogin?.code !== 0) throw new Error('E2E 夹具：改密后重新登录失败 :: ' + JSON.stringify(relogin));
  return { token: relogin.data.token, id, password, viaChange: true };
}
