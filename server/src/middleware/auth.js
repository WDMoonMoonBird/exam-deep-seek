import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import { getJwtSecret } from '../config/jwtSecret.js';   // ★R2-B60：密钥唯一解析点（缺失/过短/弱值 ⇒ 启动即失败）

const JWT_SECRET = getJwtSecret();   // 模块加载期即校验：不带病启动

/**
 * ★H6（W2-P2c）：强制改密期间**唯一白名单** —— 只有"修改口令"这一个端点可被拦截中的用户访问。
 *   白名单漏放行 ⇒「必须先改密」×「改密端点也被拦」= **双向锁死**（不可自愈），故此处显式且可单测。
 *   判据用 `req.originalUrl`（Express 从不改写它）而非 `req.path`：后者在 router 挂载点下已被剥离前缀
 *   （/api/auth + /password ⇒ '/password'），在 app 级挂载点下却是完整路径 ⇒ 单一判据会随挂载方式漂移。
 *   路径按小写比对：Express 路由默认**大小写不敏感**，这里不跟着折叠会让 /API/auth/password 这类
 *   大小写变体"路由能命中却被闸门拦"（只会更严、不会放行，但属不必要的假 403）。
 *   带/不带 /api 前缀两种形态均接受（nginx 将 /exam/api/* 重写为 /api/*，见 app.js 的 404 注释）。
 */
export function isPasswordChangeAllowed(req) {
  if (!req || req.method !== 'PUT') return false;
  const raw = String(req.originalUrl || req.url || '');
  const p = raw.split('?')[0].replace(/\/+$/, '').toLowerCase() || '/';
  return p === '/api/auth/password' || p === '/auth/password';
}

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1002, message: '未登录或 Token 过期', data: null });
  }

  try {
    const token = header.split(' ')[1];
    // ★L1（W2-P2）：**显式固定算法**（拒绝 alg 混淆 / none 攻击面）；签发侧同样显式 HS256（见 authController/localAuth）。
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = await prisma.user.findFirst({ where: { id: payload.id, deletedAt: null } });
    if (!user) {
      return res.status(401).json({ code: 1002, message: '用户不存在', data: null });
    }
    // ★R2-B67（WAVE2·安全）：改密/重置后**旧令牌立即失效**（方案 A：password_changed_at + JWT iat 比对）。
    //   边界与理由（**秒**级，不用毫秒）：
    //     · iat 是 JWT 标准声明，单位秒且**向下取整**；因此「改密的同一秒内签发的令牌」与库值的秒分量相等；
    //     · 判定用**严格小于**（issuedSec < changedSec）⇒ 同秒令牌视为**新令牌**予以放行：
    //       若改成 <=，则「改密后立刻重新登录」（同一秒完成）会签出一个立即失效的令牌 ⇒ 用户被锁在登录页（假 401）；
    //     · 代价是**最多 1 秒**的窗口内，同秒签发的旧令牌仍可用——这是秒级精度的固有下界，且窗口有界（≤1s）；
    //     · password_changed_at 为 NULL（历史行/从未改密）⇒ 完全不判定，行为与本批之前一致（不产生回归）。
    if (user.passwordChangedAt) {
      const changedSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
      const issuedSec = Number(payload && payload.iat);
      if (Number.isFinite(issuedSec) && issuedSec < changedSec) {
        return res.status(401).json({ code: 1002, message: '登录状态已失效（密码已变更），请重新登录', data: null });
      }
    }
    req.user = user;
    // ★H6（W2-P2c）：**强制改密闸门** —— 落在唯一鉴权出口内 ⇒ 构造上覆盖全部已认证路由（含未来新增路由），
    //   且每请求**零额外查询**（user 本就在上面载入过）。判定：must_change_password === true
    //   （建号/重置置 1；改密成功与 password_changed_at **同一条 update** 清 0，见 authController.changePassword）。
    //   白名单只放行改密端点本身（isPasswordChangeAllowed）⇒ 拦截期间用户仍能完成改密、自解拦截。
    //   不改既有未登录语义：缺令牌/坏令牌/用户不存在仍走上方 401 分支（未认证者不进入本判定）。
    //   ★W3 回退（用户裁定，测试期）：闸门**只对非学生生效** —— 学生初始口令已按用户裁定回到「口令 = 学号」
    //   （见 teacher/students.js 与 adminController 的学生落点），故学生不存在「待强制改密」状态；
    //   教师/管理员仍走随机临时口令 + 强制改密（H6 的收益保留在员工账号上）。
    //   为何按 role 判定而非"学生不置标志即可"：标志是**数据**、闸门是**代码** —— 若只靠数据自觉，
    //   任何一处未来又给角色写标志就会让学生被拦在一个前端零消费该标志、因而没有改密引导的界面上。
    if (user.role !== 'student' && user.mustChangePassword === true && !isPasswordChangeAllowed(req)) {
      return res.status(403).json({ code: 1005, message: '请先修改初始密码后再使用其它功能', data: null });
    }
    next();
  } catch {
    return res.status(401).json({ code: 1002, message: '未登录或 Token 过期', data: null });
  }
};

export default auth;
