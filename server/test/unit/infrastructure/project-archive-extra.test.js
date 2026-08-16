/**
 * project-archive-extra.test.js — projectArchive 扩展测试（离线，内存 zip）。
 * 现有 filename-decode.test.js 覆盖智能解码/清洗/基础解压；本文件补：
 *   - Q7 预算：文件数上限 2000 / 目录层级上限 20 / 深度校验在写盘前整包拒收
 *   - 空文件必须落盘并计数；反斜杠路径归一；.env 与二进制内容过滤；混合包只落代码
 *   - decodeUploadName 清洗与截断
 * 全部使用 os.tmpdir() 临时目录，禁止写 server/uploads/。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { extractZipSafely, decodeUploadName, MAX_TEXT_BYTES } from '../../../src/utils/projectArchive.js';

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zip-extra-'));
}

describe('extractZipSafely — Q7 预算（超限整包拒收，不写任何文件）', () => {
  it('文件数超过 2000 → 拒收', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    for (let i = 0; i < 2001; i++) zip.addFile('f' + i + '.txt', Buffer.from('x'));
    expect(() => extractZipSafely(zip.toBuffer(), dir)).toThrow('压缩包文件数超过上限（2000）');
    expect(fs.readdirSync(dir)).toEqual([]); // 未写任何文件
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('目录层级超过 20 → 拒收（预算阶段拦截）', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    const deep = Array.from({ length: 22 }, (_, i) => 'd' + i).join('/') + '/file.txt';
    zip.addFile(deep, Buffer.from('x'));
    expect(() => extractZipSafely(zip.toBuffer(), dir)).toThrow('压缩包目录层级超过上限（20）');
    expect(fs.readdirSync(dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('恰好 20 层 → 允许（边界不误伤）', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    const path20 = Array.from({ length: 19 }, (_, i) => 'd' + i).join('/') + '/file.txt'; // 20 segments
    zip.addFile(path20, Buffer.from('x'));
    const r = extractZipSafely(zip.toBuffer(), dir);
    expect(r.fileCount).toBe(1);
    expect(fs.existsSync(path.join(dir, path20))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('extractZipSafely — 空文件/路径归一/过滤语义', () => {
  it('空文件必须落盘并计数（fileCount=1, byteSize=0）', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    zip.addFile('empty.txt', Buffer.alloc(0));
    const r = extractZipSafely(zip.toBuffer(), dir);
    expect(r.fileCount).toBe(1);
    expect(r.byteSize).toBe(0);
    expect(fs.existsSync(path.join(dir, 'empty.txt'))).toBe(true);
    expect(fs.statSync(path.join(dir, 'empty.txt')).size).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('反斜杠路径归一为子目录落盘（Windows 包）', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    zip.addFile('src\\main\\App.java', Buffer.from('class App {}'));
    const r = extractZipSafely(zip.toBuffer(), dir);
    expect(r.fileCount).toBe(1);
    expect(fs.existsSync(path.join(dir, 'src', 'main', 'App.java'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('反斜杠穿越 ..\\evil.txt → 拒收（归一后检出）', () => {
    // 6④ 裁决（2026-08-16）：adm-zip addFile 会把 '..\\' 当作路径归一化（条目名变 evil.txt），
    // 构造无效；改用原始字节注入（entryName=Buffer，同 E4 构造法）还原真实攻击面
    const dir = tmpdir();
    const zip = new AdmZip();
    zip.addFile('placeholder.txt', Buffer.from('x'));
    const entry = zip.getEntries()[0];
    entry.entryName = Buffer.from('..\\evil.txt', 'ascii');
    expect(() => extractZipSafely(zip.toBuffer(), dir)).toThrow('Path traversal denied');
    expect(fs.existsSync(path.join(path.dirname(dir), 'evil.txt'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('.env 密钥文件被路径层过滤 → 全部过滤后抛无可读文件', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    zip.addFile('.env', Buffer.from('SECRET=xxx'));
    expect(() => extractZipSafely(zip.toBuffer(), dir)).toThrow('压缩包内没有可读文件');
    expect(fs.existsSync(path.join(dir, '.env'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('二进制内容（MZ 头伪装 .java）→ 内容层过滤不落盘', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    const mz = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(8192 - 4)]);
    zip.addFile('fake.java', mz);
    expect(() => extractZipSafely(zip.toBuffer(), dir)).toThrow('压缩包内没有可读文件');
    expect(fs.readdirSync(dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('混合包：只落合法代码，跳过 node_modules / .git / 二进制', () => {
    const dir = tmpdir();
    const zip = new AdmZip();
    zip.addFile('src/Main.java', Buffer.from('class Main {}'));
    zip.addFile('node_modules/express/index.js', Buffer.from('module.exports = 1;'));
    zip.addFile('.git/config', Buffer.from('[core]'));
    zip.addFile('img/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]));
    const r = extractZipSafely(zip.toBuffer(), dir);
    expect(r.fileCount).toBe(1);
    expect(fs.existsSync(path.join(dir, 'src', 'Main.java'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.git'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'img'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('decodeUploadName — 上传包名清洗', () => {
  it('正常名字 → 原样（trim）', () => {
    expect(decodeUploadName('  my-project.zip ')).toBe('my-project.zip');
  });
  it('超过 200 字符 → 截断到 200', () => {
    expect(decodeUploadName('a'.repeat(300))).toHaveLength(200);
  });
  it('非字符串 / 空 → 返回空串', () => {
    expect(decodeUploadName(null)).toBe('');
    expect(decodeUploadName(undefined)).toBe('');
    expect(decodeUploadName(123)).toBe('');
    expect(decodeUploadName('')).toBe('');
  });
});

describe('projectArchive 导出常量', () => {
  it('MAX_TEXT_BYTES = 1MB', () => {
    expect(MAX_TEXT_BYTES).toBe(1024 * 1024);
  });
});
