/**
 * security-path-guards.test.js — 非功能测试（安全）：路径类防护的回归取证。
 *
 * 覆盖对象（均只读、纯逻辑、无 DB/网络）：
 *   1) middleware/projectAssetGuard.js —— 实训资产静态访问封禁（编码/多斜杠/尾斜杠绕过）
 *   2) utils/projectPaths.js 的 safeSegment / assertInside —— 路径段白名单 + 越界拦截
 *
 * 用途：为「越权矩阵 + 路径穿越防线」提供可回归的自动化证据（agent-nonfunc 交付）。
 */
import fs from 'fs';
import path from 'path';
import projectAssetGuard from '../../src/middleware/projectAssetGuard.js';
import { safeSegment, assertInside, standardDir, hasStandardPackage, STANDARDS_ROOT } from '../../src/utils/projectPaths.js';

/** 构造 (req,res,next) 三元组并同步执行 guard，返回 next 是否被调用 */
function runGuard(urlPath) {
  let calledNext = false;
  let status = null;
  let body = null;
  const req = { path: urlPath };
  const res = {
    status: (s) => { status = s; return res; },
    json: (b) => { body = b; return res; },
  };
  projectAssetGuard(req, res, () => { calledNext = true; });
  return { calledNext, status, body };
}

describe('projectAssetGuard — 四个敏感前缀一律封禁（含绕过变体）', () => {
  const blocked = [
    '/uploads/project-standards',
    '/uploads/project-questions',
    '/uploads/project-submissions',
    '/uploads/projects',
  ];
  const bypassVariants = [
    '/uploads/%70roject-standards',      // 首字母百分号编码
    '/uploads/project-standards/',       // 尾斜杠
    '/uploads//project-standards',       // 双斜杠
    '/uploads/project%2Dstandards',      // 连字符编码
    '/uploads/project-standards%2F',     // 编码尾斜杠
    '/uploads/projects%2F1/submissions', // 编码斜杠后接子路径
    '/uploads/project-standards/../x',   // 尾部 ..（decode 后前缀仍命中）
  ];

  it.each(blocked)('精确命中前缀 %s → 403 且不 next', (p) => {
    const r = runGuard(p);
    expect(r.calledNext).toBe(false);
    expect(r.status).toBe(403);
  });

  it.each(bypassVariants)('绕过变体 %s → 仍被 403 拦截', (p) => {
    const r = runGuard(p);
    expect(r.calledNext).toBe(false);
    expect(r.status).toBe(403);
  });

  it('非敏感路径放行（uploads/materials 等静态资源不受影响）', () => {
    for (const p of ['/uploads/materials/abc.zip', '/api/health', '/', '/uploads/avatar/x.png']) {
      const r = runGuard(p);
      expect(r.calledNext).toBe(true);
    }
  });
});

describe('projectPaths.safeSegment — 路径段白名单', () => {
  it('合法段（字母/数字/_-）通过', () => {
    expect(safeSegment('123')).toBe('123');
    expect(safeSegment('abc_1-x')).toBe('abc_1-x');
  });
  it('穿越/分隔符/空串一律拒绝', () => {
    expect(() => safeSegment('..')).toThrow();
    expect(() => safeSegment('a/b')).toThrow();
    expect(() => safeSegment('')).toThrow();
    expect(() => safeSegment('a\b')).toThrow();
    expect(() => safeSegment('../../etc/passwd')).toThrow();
    expect(() => safeSegment(undefined)).toThrow();
  });
});

describe('projectPaths.assertInside — 越界拦截', () => {
  it('base 内路径放行', () => {
    const base = '/tmp/nonfunc-base';
    expect(assertInside(base, 'a', 'b')).toBe('/tmp/nonfunc-base/a/b');
    expect(assertInside(base, 'a')).toBe('/tmp/nonfunc-base/a');
  });
  it('.. 逃逸到 base 外 → 拒绝', () => {
    const base = '/tmp/nonfunc-base';
    expect(() => assertInside(base, '..')).toThrow('Path traversal denied');
    expect(() => assertInside(base, 'a', '..', '..')).toThrow('Path traversal denied');
  });
  it('绝对路径段 → 拒绝', () => {
    expect(() => assertInside('/tmp/nonfunc-base', '/etc')).toThrow('Path traversal denied');
  });
});

describe('projectPaths.hasStandardPackage — 有无标准工程包的唯一判据（Q9 软警告 / 提示词预览 / AI 实评共用）', () => {
  const qid = 'test999999';
  const dir = standardDir(qid);

  afterAll(() => {
    // 只清理本用例创建的目录：先确认目标确实位于 uploads/project-questions 之内
    const questionDir = path.dirname(dir);
    if (questionDir.startsWith(STANDARDS_ROOT + path.sep)) {
      fs.rmSync(questionDir, { recursive: true, force: true });
    }
  });

  it('attachmentUrl 非空 → true（教师建题时上传过标准包）', () => {
    expect(hasStandardPackage(qid, 'project-questions/1/standard')).toBe(true);
  });

  it('attachmentUrl 为空且标准包目录无文件 → false（开放性题目）', () => {
    expect(fs.existsSync(dir)).toBe(false);
    expect(hasStandardPackage(qid, null)).toBe(false);
    expect(hasStandardPackage(qid, undefined)).toBe(false);
  });

  it('attachmentUrl 为空但标准包目录有文件 → true（兼容历史数据）', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.py'), 'print(1)');
    expect(hasStandardPackage(qid, null)).toBe(true);
  });

  it('非法题目 ID → false（safeSegment 抛错被兜住，不炸请求）', () => {
    expect(hasStandardPackage('../etc', null)).toBe(false);
    expect(hasStandardPackage('', null)).toBe(false);
  });
});
