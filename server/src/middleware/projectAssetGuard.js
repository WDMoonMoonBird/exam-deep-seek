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
  '/uploads/project-questions',
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
  // ★M7（W2-P2）：**比较前统一小写** —— 前缀比对原本区分大小写，而 Windows/NTFS 大小写不敏感 ⇒
  //   `/uploads/PROJECTS/xxx` 在开发机（Windows）可绕过封禁（生产 Linux 是否同样取决于文件系统）。
  //   保留既有 decode / 折叠多斜杠 / 去尾斜杠逻辑，仅追加归一化。
  p = p.toLowerCase();
  return p;
}

export default function projectAssetGuard(req, res, next) {
  const p = normalize(req.path);
  for (const prefix of BLOCKED_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + '/')) {
      return res.status(403).json({ code: 1003, message: '无权访问该资源', data: null });   // ★R2-B61（P1-8）：统一 body 形状
    }
  }
  next();
}
