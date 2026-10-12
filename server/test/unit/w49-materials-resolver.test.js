/**
 * W49（R2-B21）：物料解析纯函数 + 导出器错误归一（unit 面）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MATERIALS_ROOT_ENV, formatMaterialsMissing, formatMaterialsRoot, formatMaterialsResolved, resolveMaterialsForAssignment, withMaterialsArgs } from '../../src/services/dshMaterialsResolver.js';
import { normalizeExportError } from '../../scripts/r2b20-export-materials.mjs';

describe('W49 物料解析与错误归一', () => {
  it('★W49-1 未设 ROOT ⇒ mode=device-default（调用方保持既有行为）', () => {
    expect(MATERIALS_ROOT_ENV).toBe('DSH_GRADER_MATERIALS_ROOT');
    for (const v of ['', null, undefined, '   ']) {
      expect(resolveMaterialsForAssignment({ materialsRoot: v, assignmentId: 311 })).toMatchObject({ ok: false, reason: 'materials_root_unset', mode: 'device-default' });
    }
  });

  it('★W49-2 目录缺失/为空 ⇒ materials_missing_for_assignment:<id>；有内容 ⇒ ok 且绝对路径', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w49-'));
    expect(resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: 7 })).toMatchObject({ ok: false, reason: 'materials_missing_for_assignment:7' });
    const emptyDir = path.join(root, '8');
    fs.mkdirSync(emptyDir);
    expect(resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: 8 })).toMatchObject({ ok: false, reason: 'materials_missing_for_assignment:8' });
    const dir9 = path.join(root, '9');
    fs.mkdirSync(dir9);
    fs.writeFileSync(path.join(dir9, '标准工程包.zip'), 'x');
    const r = resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: 9 });
    expect(r.ok).toBe(true);
    expect(path.isAbsolute(r.dir)).toBe(true);
    expect(r.dir).toBe(dir9);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('★W49-3 manifest 缺失 ⇒ 回退 zipcount（目录内 *.zip 数 − 1）；manifest 存在 ⇒ source=manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w49b-'));
    const dir = path.join(root, '11');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '标准工程包.zip'), 's');
    fs.writeFileSync(path.join(dir, '甲.zip'), 'a');
    fs.writeFileSync(path.join(dir, '乙.zip'), 'b');
    fs.writeFileSync(path.join(dir, '题目描述.md'), 'm');
    const zc = resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: 11 });
    expect(zc).toMatchObject({ ok: true, submissions: 2, source: 'zipcount' });
    fs.writeFileSync(path.join(dir, 'export-manifest.json'), JSON.stringify({ n_submissions: 59 }));
    const mf = resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: 11 });
    expect(mf).toMatchObject({ ok: true, submissions: 59, source: 'manifest' });
    fs.writeFileSync(path.join(dir, 'export-manifest.json'), '{ 坏 JSON');
    expect(resolveMaterialsForAssignment({ materialsRoot: root, assignmentId: 11 })).toMatchObject({ source: 'zipcount', submissions: 2 });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('★W49-4 withMaterialsArgs：剥掉启动时写死的旧值再追加（覆盖语义，两种写法都覆盖）', () => {
    expect(withMaterialsArgs(['run.sh', '--submissions', '63', '--allow-identical'], { dir: '/r/311', submissions: 59 }))
      .toEqual(['run.sh', '--allow-identical', '--source-dir', '/r/311', '--submissions', '59']);
    expect(withMaterialsArgs(['run.sh', '--source-dir=/old', '--submissions=1', '--x'], { dir: '/r/9', submissions: 3 }))
      .toEqual(['run.sh', '--x', '--source-dir', '/r/9', '--submissions', '3']);
    expect(withMaterialsArgs(['run.sh'], {})).toEqual(['run.sh']);
  });

  it('W49-5 打印行格式（可观测性契约）', () => {
    expect(formatMaterialsRoot('')).toBe('materials_root=(unset:device-default)');
    expect(formatMaterialsRoot('/var/lib/mat')).toBe('materials_root=/var/lib/mat');
    expect(formatMaterialsResolved({ assignmentId: 311, dir: '/m/311', submissions: 59, source: 'manifest' }))
      .toBe('MATERIALS_RESOLVED assignment=311 dir=/m/311 submissions=59 source=manifest');
    expect(formatMaterialsMissing({ assignmentId: 311, dir: '/m/311' })).toBe('MATERIALS_MISSING assignment=311 path=/m/311');
  });

  it('★W49-6 导出器错误归一：连接类 ⇒ db_unreachable；其它 ⇒ unhandled:<msg>', () => {
    expect(normalizeExportError({ code: 'P1001', message: 'x' })).toBe('db_unreachable');
    expect(normalizeExportError(new Error("Can't reach database server at 127.0.0.1:1"))).toBe('db_unreachable');
    expect(normalizeExportError(new Error('connect ECONNREFUSED 127.0.0.1:1'))).toBe('db_unreachable');
    expect(normalizeExportError(new Error('some other failure'))).toBe('unhandled:some other failure');
  });
});
