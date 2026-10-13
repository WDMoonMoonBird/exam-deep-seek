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
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ code: 1002, message: '未登录或 Token 过期', data: null });
  }
};

export default auth;
