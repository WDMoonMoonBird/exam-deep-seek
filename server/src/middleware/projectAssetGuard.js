/**
 * projectAssetGuard.js — 实训资产静态访问封禁中间件
 *
 * 标准答案 / 学生提交 / 项目工作区 一律禁止匿名静态托管，
 * 必须注册在 express.static('/uploads') 之前，改走带鉴权的 API 通道。
 *
 * 采用「全封 + 内容走鉴权 API」策略，而非在静态服务里做鉴权——
 * 后者需解析 token 并映射 URL→资源归属，复杂且易漏，无法审计。
 *
 * ★R3-R1（P0，2026-10-18）：**点段（. / ..）绕过** —— 原 normalize 只做
 *   decode / 折叠多斜杠 / 去尾斜杠 / 小写，**不消解点段**；而 express.static 底层的
 *   send 会先 path.normalize 再落盘 ⇒ /uploads/./project-questions/x 在前缀比对时
 *   "不像"封禁目录（被放行），到 static 却被规范化成封禁目录并真实返回文件。
 *   /uploads/%2e/...（编码点段）、/uploads/x/../project-questions/...（中间点段）同理可绕过。
 *   修复口径：
 *     ① 解码（含重复解码，覆盖 %2e / %252e 双重编码）+ 反斜杠归一 + 去 NUL；
 *     ② 任何**整段等于 . 或 ..** 的路径一律封禁（URL 中点段只有路径穿越语义，
 *        不可能是合法资源名；按「段」比对，不误伤 a.json 这类文件名）；
 *     ③ 无点段路径再做前缀匹配，同时保留 M7（W2-P2）的大小写归一化与非点段变体逻辑。
 */

const BLOCKED_PREFIXES = [
  '/uploads/project-standards',
  '/uploads/project-questions',
  '/uploads/project-submissions',
  '/uploads/projects',
];

/**
 * 重复解码至稳定（最多 3 轮）：
 *   · %2e ⇒ .、%2e%2e ⇒ .. —— 单次 decode 即覆盖；
 *   · %252e 一类双重编码需第二轮才露出 .，故循环；
 *   · 解码失败（畸形百分号）保留原样：下游 express.static/send 同样会拒绝畸形编码，
 *     不存在"守卫解码失败、静态层却能解码"的放行路径。
 */
function decodeRepeatedly(rawPath) {
  let p = rawPath;
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(p);
      if (decoded === p) break;
      p = decoded;
    } catch {
      break;
    }
  }
  return p;
}

/**
 * 解码 + 归一化，返回是否含点段（供守卫判定）。
 * 点段判定放在折叠斜杠/去尾斜杠之前：段边界取解码后的原始分段即可。
 */
function normalize(urlPath) {
  const raw = typeof urlPath === 'string' ? urlPath : '';
  // 反斜杠按目录分隔符处理（Windows/NTFS 部署场景；与 M7 的跨平台加固同源）
  const decoded = decodeRepeatedly(raw).replace(/\\/g, '/').replace(/\0/g, '');
  const hasDotSegment = decoded.split('/').some((seg) => seg === '.' || seg === '..');
  let p = decoded.replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return { path: p.toLowerCase(), hasDotSegment };
}

export default function projectAssetGuard(req, res, next) {
  const { path: p, hasDotSegment } = normalize(req.path);
  // ★R3-R1：点段一律 403（覆盖 . / .. / %2e / %252e / 反斜杠 / 中间点段）
  if (hasDotSegment) {
    return res.status(403).json({ code: 1003, message: '无权访问该资源', data: null });   // ★R2-B61（P1-8）：统一 body 形状
  }
  for (const prefix of BLOCKED_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + '/')) {
      return res.status(403).json({ code: 1003, message: '无权访问该资源', data: null });   // ★R2-B61（P1-8）：统一 body 形状
    }
  }
  next();
}
