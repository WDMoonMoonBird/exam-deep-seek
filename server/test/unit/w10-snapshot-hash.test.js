/**
 * W10（R2-B2 / W3）：哈希口径与 scripts/dsh-checker/validate.py 逐位对拍（不得另写一套）。
 * 对拍方式：同一输入分别用 JS 实现与 python3 validate.py 计算，断言完全相等。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSha256, dirSha256, standardPackSha256, textSha256, isIgnored, walkFiltered } from '../../src/utils/snapshotHash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const CHECKER_DIR = path.join(REPO, 'scripts', 'dsh-checker');

function py(expr) {
  const res = spawnSync('python3', ['-c', 'import sys; sys.path.insert(0, ' + JSON.stringify(CHECKER_DIR) + '); import validate as V; ' + expr], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error('python failed: ' + res.stderr);
  return res.stdout.trim();
}

describe('W10 哈希口径对齐（validate.py）', () => {
  it('W10-1 contentSha256 === python V.content_sha256（同一文件）', () => {
    const file = path.join(CHECKER_DIR, 'check.py');
    const expected = py('print(V.content_sha256(' + JSON.stringify(file) + '))');
    expect(contentSha256(file)).toBe(expected);
  });

  it('W10-2 dirSha256 === python V.dir_sha256（含嵌套目录与多文件，ignore 为空）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w10-dir-'));
    fs.mkdirSync(path.join(root, 'sub'));
    fs.mkdirSync(path.join(root, 'b-dir'));
    fs.writeFileSync(path.join(root, 'a.txt'), 'alpha');
    fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'beta');
    fs.writeFileSync(path.join(root, 'b-dir', 'c.txt'), 'gamma');
    const expected = py('print(V.dir_sha256(' + JSON.stringify(root) + ', ())[0])');
    expect(dirSha256(root, []).digest).toBe(expected);
    expect(dirSha256(root, []).entries).toBe(3);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('W10-3 textSha256（平台 rubric 文本）=== python 同口径内容哈希', () => {
    const text = '标准A：1) 组件拆分 2) 路由配置';
    const expected = py('import hashlib; print("sha256:" + hashlib.sha256(' + JSON.stringify(text) + '.encode("utf-8")).hexdigest())');
    expect(textSha256(text)).toBe(expected);
  });

  it('W10-4 目录不存在 ⇒ sha256:absent（与 python 一致）；standardPackSha256 不抛错', () => {
    const missing = path.join(os.tmpdir(), 'w10-missing-' + Date.now());
    expect(py('print(V.dir_sha256(' + JSON.stringify(missing) + ', ())[0])')).toBe('sha256:absent');
    expect(dirSha256(missing, []).digest).toBe('sha256:absent');
    expect(standardPackSha256(999999999)).toBe('sha256:absent');
  });

  it('W10-5 遍历排序与忽略规则（支持 x/** 与任意深度同名）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'w10-order-'));
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'node_modules', 'skip.js'), 'x');
    fs.writeFileSync(path.join(root, 'z.txt'), 'z');
    fs.writeFileSync(path.join(root, 'a.txt'), 'a');
    expect(walkFiltered(root, []).map((e) => e.rel)).toEqual(['a.txt', 'node_modules/skip.js', 'z.txt']);
    expect(walkFiltered(root, ['node_modules/**']).map((e) => e.rel)).toEqual(['a.txt', 'z.txt']);
    // python fnmatch 把 'node_modules/**' 翻译成 'node_modules/.*.*' ⇒ 子孙文件同样命中（JS 实现已与之一致）
    expect(isIgnored('node_modules/x.js', ['node_modules/**'])).toBe(true);
    expect(isIgnored('deep/node_modules', ['**/node_modules'])).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
