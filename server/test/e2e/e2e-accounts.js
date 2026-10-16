/**
 * e2e-accounts.js —— E2E 夹具账号的**唯一事实源**（★W2-C15）
 *
 * ★W3 回退（用户裁定，测试期）：**学生侧** H6 已回退 ⇒
 *   · **教师**：建号/重置仍返回**一次性随机临时口令**（`data.initialPassword`）⇒ 走「临时口令登录 → 改密为已知口令 → 重登」，
 *     这条路径同时真实覆盖 H6 的首登改密流程（含闸门 403/1005 与改密白名单）；
 *   · **学生**：初始口令 = **学号**（`PUT /teacher/students/:id/reset-password` 现在只把它写进 **message 文本**、
 *     `data` 为 null）⇒ 夹具按「口令 = 用户名 @ 前部分」取，**无需改密**（学生已不在闸门作用域内）。
 * ⇒ 分叉点见 §②；教师分支的"红线"仍然有效：**教师侧**严禁按「口令 = 工号」取。
 */

/** 取用户名主体（@ 前部分）—— 学生的初始口令语义（★W3 回退后） */
function sidOf(username) {
  return String(username || '').split('@')[0];
}

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
      trace.reset = reset;
      // ★W3 回退：学生重置后口令 = 学号，而该端点**只把学号写进 message、data 为 null**
      //   ⇒ 既兼容旧实现（data.initialPassword），也兼容新实现（message 文本）。
      temp = reset?.data?.initialPassword
        || (typeof reset?.message === 'string' && reset.message.match(/为学号[：:]\s*(\S+)/)?.[1])
        || null;
    }
    // ★W3 回退兜底：学生的口令语义 = 学号（@ 前部分）⇒ 建号/重置后均可直接推出，
    //   无需依赖响应回显（e2e_admin_stu_* 这类"建号后只拿到 id"的路径也据此可用）。
    if (typeof temp !== 'string' || !temp) temp = sidOf(username);
  }
  if (typeof temp !== 'string' || !temp) {
    throw new Error('E2E 夹具：未拿到可用口令（教师须为一次性临时口令；学生应可由学号推出）:: ' + username + ' :: ' + JSON.stringify(trace));
  }

  // ③ 用 temp 登录
  const tempLogin = await request('POST', '/auth/login', { username, password: temp });
  if (tempLogin?.code !== 0) throw new Error('E2E 夹具：口令登录失败 :: ' + JSON.stringify(tempLogin));

  if (kind === 'teacher') {
    // ★教师侧（H6 保留）：首登改密闸门生效 ⇒ 必须先改密才能用其它接口
    if (tempLogin.data?.user?.mustChangePassword !== true) {
      throw new Error('E2E 夹具：H6 标志未置位（教师预期 mustChangePassword=true）:: ' + username);
    }
    const changed = await request('PUT', '/auth/password', { oldPassword: temp, newPassword: password }, tempLogin.data.token);
    if (changed?.code !== 0) throw new Error('E2E 夹具：首登改密失败（白名单是否放行？）:: ' + JSON.stringify(changed));
  } else {
    // ★学生侧（W3 回退）：无强制改密 ⇒ 若 temp 已等于目标已知口令，则无需改密；
    //   否则（如 temp=学号 而目标是 E2E_STUDENT_PASSWORD）主动改密一次，让 spec 能用稳定口令登录。
    if (temp === password) return { token: tempLogin.data.token, id, password, viaChange: false };
    const changed = await request('PUT', '/auth/password', { oldPassword: temp, newPassword: password }, tempLogin.data.token);
    if (changed?.code !== 0) throw new Error('E2E 夹具：学生改密失败 :: ' + JSON.stringify(changed));
  }

  // ④ 已知口令重新登录（改密后旧令牌失效）
  const relogin = await request('POST', '/auth/login', { username, password });
  if (relogin?.code !== 0) throw new Error('E2E 夹具：改密后重新登录失败 :: ' + JSON.stringify(relogin));
  return { token: relogin.data.token, id, password, viaChange: true };
}
