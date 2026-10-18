/**
 * r14-student-import-reason.test.js — R14 批量导入错误安全文案 + 客户端文案静态校验
 * 依据：TICKETS/R3-R14.md §3（内部串不回显 / 学生语境文案如实）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { safeStudentImportErrorReason } from '../../src/interface/http/controllers/teacher/students.js';

const REPO_ROOT = path.resolve(process.cwd(), '..');

describe('R14 · safeStudentImportErrorReason（Prisma 错误码 → 安全中文文案）', () => {
  it('P2002 重复用户名 ⇒ 固定文案，不含 Prisma/字段/表名/constraint', () => {
    const out = safeStudentImportErrorReason({
      code: 'P2002',
      message: 'Unique constraint failed on the fields: (username)',
    });
    expect(out).toBe('学号已存在（用户名重复）');
    expect(out).not.toMatch(/Prisma|constraint|username|User\./i);
  });

  it('P2003/外键 ⇒ 班级不存在；P2025 ⇒ 目标不存在；P2000/超长 ⇒ 数据不合法', () => {
    expect(safeStudentImportErrorReason({ code: 'P2003' })).toBe('班级不存在或已被删除');
    expect(safeStudentImportErrorReason({ code: 'P2025' })).toBe('目标记录不存在');
    expect(safeStudentImportErrorReason({ code: 'P2000' })).toBe('数据不合法（长度或取值超限）');
    expect(safeStudentImportErrorReason({ message: 'Data too long for column' })).toBe('数据不合法（长度或取值超限）');
  });

  it('未知错误 ⇒ 通用文案，绝不回显原始 message', () => {
    const out = safeStudentImportErrorReason({
      message: 'PrismaClientKnownRequestError: Invalid prisma.user.create() invocation in /srv/app/src/x.js',
    });
    expect(out).toBe('该行数据不合法，请检查后重试');
    expect(out).not.toMatch(/Prisma|invocation|\/srv/);
    expect(safeStudentImportErrorReason(null)).toBe('该行数据不合法，请检查后重试');
  });

  it('批量导入 errors[].reason 使用安全函数（源码接线静态断言）', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'server/src/interface/http/controllers/teacher/students.js'), 'utf8');
    expect(src).toContain('safeStudentImportErrorReason');
    expect(src).toMatch(/reason:\s*safeStudentImportErrorReason\(/);
  });
});

describe('R14 · 学生语境文案如实（静态）', () => {
  it('教师端学生管理不再写「首次登录后必须修改」，改为如实表述', () => {
    const vue = fs.readFileSync(path.join(REPO_ROOT, 'client/src/views/teacher/Students.vue'), 'utf8');
    expect(vue).not.toContain('首次登录后必须修改');
    expect(vue).toContain('系统不强制首登改密');
    expect(vue).toContain('初始口令即为学号');
  });
});
