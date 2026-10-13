import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import { getJwtSecret } from '../config/jwtSecret.js';   // ★R2-B60：密钥唯一解析点（缺失/过短/弱值 ⇒ 启动即失败）

const JWT_SECRET = getJwtSecret();   // 模块加载期即校验：不带病启动

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1002, message: '未登录或 Token 过期', data: null });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
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
    next();
  } catch {
    return res.status(401).json({ code: 1002, message: '未登录或 Token 过期', data: null });
  }
};

export default auth;
