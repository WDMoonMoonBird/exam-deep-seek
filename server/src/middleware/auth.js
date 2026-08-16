import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';

const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1002, message: '未登录或 Token 过期', data: null });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'exam_system_fallback_secret');
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
