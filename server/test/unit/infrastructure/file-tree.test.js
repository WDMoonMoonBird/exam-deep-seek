/**
 * file-tree.test.js — utils/fileTree.js 单元测试（离线）。
 * 覆盖：getLanguageByExt 映射、isIgnored 过滤、buildTree 树构建/排序/skipBaseDir、
 * flattenTree 扁平化 parentPath。该模块同时被 uploadFilter 与执行器引用。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getLanguageByExt, isIgnored, buildTree, flattenTree } from '../../../src/utils/fileTree.js';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'filetree-'));
}

describe('getLanguageByExt — 扩展名→语言映射', () => {
  it('常见扩展名映射正确', () => {
    expect(getLanguageByExt('Main.java')).toBe('java');
    expect(getLanguageByExt('app.ts')).toBe('typescript');
    expect(getLanguageByExt('main.py')).toBe('python');
    expect(getLanguageByExt('a.cpp')).toBe('cpp');
    expect(getLanguageByExt('a.c')).toBe('c');
    expect(getLanguageByExt('a.go')).toBe('go');
    expect(getLanguageByExt('a.rs')).toBe('rust');
    expect(getLanguageByExt('index.html')).toBe('html');
    expect(getLanguageByExt('style.css')).toBe('css');
    expect(getLanguageByExt('data.json')).toBe('json');
  });
  it('扩展名大小写不敏感', () => {
    expect(getLanguageByExt('Main.JAVA')).toBe('java');
    expect(getLanguageByExt('App.TS')).toBe('typescript');
  });
  it('未知/无扩展名 → plaintext', () => {
    expect(getLanguageByExt('README')).toBe('plaintext');
    expect(getLanguageByExt('noextfile')).toBe('plaintext');
    expect(getLanguageByExt('.gitignore')).toBe('plaintext');
  });
});

describe('isIgnored — 目录/扩展名过滤', () => {
  it('忽略目录名与二进制扩展名', () => {
    expect(isIgnored('node_modules')).toBe(true);
    expect(isIgnored('.git')).toBe(true);
    expect(isIgnored('.env')).toBe(true);
    expect(isIgnored('a.class')).toBe(true);
    expect(isIgnored('a.png')).toBe(true);
    expect(isIgnored('a.jar')).toBe(true);
  });
  it('源码文件与普通目录不忽略', () => {
    expect(isIgnored('Main.java')).toBe(false);
    expect(isIgnored('src')).toBe(false);
    expect(isIgnored('pom.xml')).toBe(false);
  });
});

describe('buildTree — 树构建', () => {
  it('目录树：目录在前、文件在后、按名排序', () => {
    const dir = tmpdir();
    fs.mkdirSync(path.join(dir, 'zdir'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.java'), 'x');
    fs.writeFileSync(path.join(dir, 'b.md'), 'x');
    fs.writeFileSync(path.join(dir, 'zdir', 'c.py'), 'x');
    const tree = buildTree(dir);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe('directory');
    expect(tree[0].name).toBe(path.basename(dir));
    const kids = tree[0].children;
    expect(kids[0].name).toBe('zdir'); // 目录在前
    expect(kids[1].name).toBe('a.java');
    expect(kids[2].name).toBe('b.md');
    expect(kids[0].children[0].name).toBe('c.py');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skipBaseDir=true → 直接返回子节点', () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    const tree = buildTree(dir, { skipBaseDir: true });
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('a.txt');
    expect(tree[0].path).toBe('a.txt');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('根路径为文件 → 返回单文件节点', () => {
    const dir = tmpdir();
    const f = path.join(dir, 'single.java');
    fs.writeFileSync(f, 'x');
    const tree = buildTree(f);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe('file');
    expect(tree[0].name).toBe('single.java');
    expect(tree[0].language).toBe('java');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('目录不存在 → 空数组', () => {
    expect(buildTree('/nonexistent-filetree-xyz')).toEqual([]);
  });

  it('忽略 node_modules/.git/二进制文件', () => {
    const dir = tmpdir();
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'x.js'), 'x');
    fs.writeFileSync(path.join(dir, '.git', 'config'), 'x');
    fs.writeFileSync(path.join(dir, 'logo.png'), 'x');
    fs.writeFileSync(path.join(dir, 'Main.java'), 'x');
    const tree = buildTree(dir, { skipBaseDir: true });
    const names = tree.map(n => n.name);
    expect(names).toEqual(['Main.java']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('flattenTree — 扁平化', () => {
  it('嵌套树展开且 parentPath 正确', () => {
    const tree = [{
      name: 'root', type: 'directory', path: '',
      children: [
        { name: 'src', type: 'directory', path: 'src', children: [{ name: 'Main.java', type: 'file', path: 'src/Main.java' }] },
        { name: 'README.md', type: 'file', path: 'README.md' },
      ],
    }];
    // 6② 裁决（2026-08-16）：对齐既有实现——输出含 root 条目共 4 项；
    // parentPath 取父节点 path 字段（root.path='' → null），语义变更列入 DSGN 待办
    const flat = flattenTree(tree);
    expect(flat).toHaveLength(4);
    expect(flat[0]).toMatchObject({ name: 'root', parentPath: null });
    expect(flat[1]).toMatchObject({ name: 'src', parentPath: null });
    expect(flat[2]).toMatchObject({ name: 'Main.java', parentPath: 'src' });
    expect(flat[3]).toMatchObject({ name: 'README.md', parentPath: null });
  });

  it('空树 → 空数组', () => {
    expect(flattenTree([])).toEqual([]);
  });
});
