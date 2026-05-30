const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ code: 1003, message: '无权限', data: null });
    }
    next();
  };
};

export default requireRole;
