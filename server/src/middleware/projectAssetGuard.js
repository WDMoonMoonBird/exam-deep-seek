/**
 * projectAssetGuard.js — 实训资产静态访问封禁中间件
 *
 * 标准答案 / 学生提交 / 项目工作区 一律禁止匿名静态托管，
 * 必须注册在 express.static('/uploads') 之前，改走带鉴权的 API 通道。
 *
 * 采用「全封 + 内容走鉴权 API」策略，而非在静态服务里做鉴权——
 * 后者需解析 token 并映射 URL→资源归属，复杂且易漏，无法审计。
 */

const BLOCKED_PREFIXES = [
  '/uploads/project-standards',
  '/uploads/project-submissions',
  '/uploads/projects',
];

/** 解码 + 折叠多斜杠 + 去尾斜杠，防 %70roject / 多斜杠 等绕过手法 */
function normalize(urlPath) {
  let p = urlPath;
  try {
    p = decodeURIComponent(p);
  } catch {
    // 解码失败保留原样，下面前缀匹配仍能拦住
  }
  p = p.replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export default function projectAssetGuard(req, res, next) {
  const p = normalize(req.path);
  for (const prefix of BLOCKED_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + '/')) {
      return res.status(403).json({ error: 'forbidden' });
    }
  }
  next();
}
