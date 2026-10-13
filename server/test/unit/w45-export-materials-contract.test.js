/**
 * W45（R2-B20）：物料导出器的契约/单元面 —— 装置常量一致性、命名规则、护栏、确定性 zip。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEVICE_NAMES, assertExportAuthorized, buildAssignmentMd, resolveStudentZipName } from '../../scripts/r2b20-export-materials.mjs';
import { buildZip, readZipEntries, zipDirectory } from '../../src/infrastructure/execution/deterministic-zip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');

describe('W45 导出器契约与命名', () => {
  it('★W45-1 三个必备文件名与装置 prepare_materials.py 的常量逐字一致', () => {
    const src = fs.readFileSync(path.join(REPO, 'scripts/dsh-grader/prepare_materials.py'), 'utf8');
    const pick = (name) => (src.match(new RegExp(name + " = '([^']+)'")) || [])[1];
    expect(pick('STANDARD_NAME')).toBe(DEVICE_NAMES.standard);
    expect(pick('RUBRIC_NAME')).toBe(DEVICE_NAMES.rubric);
    expect(pick('ASSIGNMENT_NAME')).toBe(DEVICE_NAMES.assignment);
    expect(DEVICE_NAMES.assignment).toBe('题目描述.md');   // 装置只认这个文件名
  });

  it('★W45-2 命名：real_name 为主；重名追加 -username；仍冲突再追加序号；非法字符替换', () => {
    const used = new Set();
    expect(resolveStudentZipName('丁静45', '202600001', used)).toBe('丁静45.zip');
    expect(resolveStudentZipName('丁静45', '202600002', used)).toBe('丁静45-202600002.zip');
    expect(resolveStudentZipName('丁静45', '202600002', used)).toBe('丁静45-202600002-2.zip');
    expect(resolveStudentZipName('', '202600003', new Set())).toBe('202600003.zip');
    expect(resolveStudentZipName('a/b:c', 'u', new Set())).toBe('a_b_c.zip');
  });

  it('★W45-3 护栏：生产库缺开关 ⇒ 连接前拒绝；测试库放行；非法 URL 拒绝', () => {
    const prod = 'mysql://u:p@127.0.0.1:3306/exam_system';
    expect(assertExportAuthorized({ dbUrl: prod })).toMatchObject({ ok: false, rc: 2, reason: 'allow_db_required:exam_system' });
    expect(assertExportAuthorized({ dbUrl: prod, allowDb: 'exam_system' })).toMatchObject({ ok: false, rc: 2, reason: 'allow_prod_required:exam_system' });
    expect(assertExportAuthorized({ dbUrl: prod, allowDb: 'other' })).toMatchObject({ ok: false, reason: 'allow_db_required:exam_system' });
    expect(assertExportAuthorized({ dbUrl: prod, allowDb: 'exam_system', allowProd: true })).toMatchObject({ ok: true, prod: true });
    expect(assertExportAuthorized({ dbUrl: 'mysql://u:p@127.0.0.1:3306/exam_system_test' })).toMatchObject({ ok: true });
    expect(assertExportAuthorized({ dbUrl: 'not-a-url' })).toMatchObject({ ok: false, reason: 'db_url_invalid' });
  });

  it('★W45-4 确定性 zip：两次构建逐字节相同；条目顺序无关；可解析回原文；固定时间戳', () => {
    const a = buildZip([{ name: 'b.txt', data: 'hello' }, { name: 'a/c.txt', data: 'world' }]);
    const b = buildZip([{ name: 'a/c.txt', data: 'world' }, { name: 'b.txt', data: 'hello' }]);
    expect(a.equals(b)).toBe(true);
    const parsed = readZipEntries(a);
    expect(parsed.map((e) => e.name)).toEqual(['a/c.txt', 'b.txt']);
    expect(parsed.map((e) => e.data.toString('utf8'))).toEqual(['world', 'hello']);
    expect(a.readUInt16LE(10)).toBe(0);        // 固定 DOS time
    expect(a.readUInt16LE(12)).toBe(0x0021);   // 固定 DOS date（1980-01-01）
    const tmp = fs.mkdtempSync('/tmp/w45-zip-');
    fs.mkdirSync(path.join(tmp, 'x', 'y'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'x', 'y', 'z.txt'), 'zz');
    const z1 = zipDirectory(tmp);
    const z2 = zipDirectory(tmp);
    expect(z1.equals(z2)).toBe(true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('W45-5 题面 markdown 确定性（标题 + material 原文，无时间戳）', () => {
    const md = buildAssignmentMd({ title: '作业A', material: '要求…' });
    expect(md).toBe('# 作业A\n\n要求…\n');
    expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
