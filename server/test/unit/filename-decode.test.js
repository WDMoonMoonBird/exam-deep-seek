import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import {
  decodeEntryName,
  sanitizeSegment,
  extractZipSafely,
} from '../../src/utils/projectArchive.js';

/** GBK 编码的「我」= 0xCE 0xD2 */
const GBK_WO = Buffer.from([0xce, 0xd2]);

describe('decodeEntryName — zip 条目名智能解码', () => {
  it('D1: GBK 字节（非法 UTF-8）→ 回退 GBK 解码为「我」', () => {
    expect(decodeEntryName(GBK_WO)).toBe('我');
  });

  it('D2: 合法 UTF-8 字节 → 直接 UTF-8 解出「测试」', () => {
    expect(decodeEntryName(Buffer.from('测试', 'utf-8'))).toBe('测试');
  });

  it('D3: 纯 ASCII → 原样返回，无副作用', () => {
    expect(decodeEntryName(Buffer.from('src/Main.java', 'utf-8'))).toBe('src/Main.java');
  });

  it('D4: 任何输入都不抛错（空 Buffer）', () => {
    expect(() => decodeEntryName(Buffer.alloc(0))).not.toThrow();
    expect(decodeEntryName(Buffer.alloc(0))).toBe('');
  });

  it('D5: GBK 中文全名「我的作业.txt」正确还原', () => {
    const raw = Buffer.concat([
      Buffer.from([0xce, 0xd2, 0xb5, 0xc4, 0xd7, 0xf7, 0xd2, 0xb5]), // 我的作业
      Buffer.from('.txt', 'ascii'),
    ]);
    expect(decodeEntryName(raw)).toBe('我的作业.txt');
  });
});

describe('sanitizeSegment — 文件名分段清洗', () => {
  it('S1: 穿越段 ".." 被清洗为占位符 "_"', () => {
    expect(sanitizeSegment('..')).toBe('_');
  });

  it('S2: 段内路径分隔符被转义为下划线', () => {
    expect(sanitizeSegment('/a/b')).toBe('_a_b');
    expect(sanitizeSegment('a\\b')).toBe('a_b');
  });

  it('S3: 去除首尾空白', () => {
    expect(sanitizeSegment('  x.txt ')).toBe('x.txt');
  });

  it('S4: 去除控制字符与 NUL', () => {
    expect(sanitizeSegment('a\u0000b\u001fc\u007f.txt')).toBe('abc.txt');
  });

  it('S5: 空串与纯点串兜底为 "_"', () => {
    expect(sanitizeSegment('')).toBe('_');
    expect(sanitizeSegment('...')).toBe('_');
  });

  it('S6: 正常中文名保持不变（NFC 规范化后语义一致）', () => {
    expect(sanitizeSegment('我的作业.txt')).toBe('我的作业.txt');
  });

  it('S7: 前导点保留 —— ".git" 不被洗成 "git"（关键回归：IGNORED_DIRS 依赖原名过滤）', () => {
    expect(sanitizeSegment('.git')).toBe('.git');
  });

  it('S8: 前导点保留 —— ".env"（密钥文件名，必须能被忽略规则命中）', () => {
    expect(sanitizeSegment('.env')).toBe('.env');
  });

  it('S9: 前导点保留 —— ".vscode" / ".idea" 等 IDE 隐藏目录', () => {
    expect(sanitizeSegment('.vscode')).toBe('.vscode');
    expect(sanitizeSegment('.idea')).toBe('.idea');
  });

  it('S10: "..foo" 前导点保留且不误判为穿越段（该名本身非穿越）', () => {
    expect(sanitizeSegment('..foo')).toBe('..foo');
  });

  it('S11: 尾部点仍被去除（Windows 习惯：file. / file..）', () => {
    expect(sanitizeSegment('file.')).toBe('file');
    expect(sanitizeSegment('file..')).toBe('file');
  });

  it('S12: 段内分隔符仍转义（旧语义保持）', () => {
    expect(sanitizeSegment('a/b')).toBe('a_b');
  });

  it('S13: 纯点段兜底为 "_"（"." 与 ".." 均不可作路径段）', () => {
    expect(sanitizeSegment('.')).toBe('_');
    expect(sanitizeSegment('..')).toBe('_');
  });
});

describe('extractZipSafely — GBK 文件名回归用例', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-gbk-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  /**
   * 构造一个条目名为原始 GBK 字节的内存 zip（模拟 Windows 中文版打包、
   * 未置 UTF-8 标志位的场景）。
   *
   * 实现说明：adm-zip 的 rawEntryName 只有 getter；但 entryName 的 setter 走
   * Utils.toBuffer(val, encoder)，传入 Buffer 时原样存入 _entryName，
   * 因此赋值 Buffer 即可写入未经 utf-8 编码的原始字节。
   *
   * @param {Buffer} rawName 条目名原始字节
   * @param {string} content 文件内容
   * @returns {Buffer} zip 二进制
   */
  function buildZipWithRawName(rawName, content) {
    const zip = new AdmZip();
    zip.addFile('placeholder.txt', Buffer.from(content, 'utf-8'));
    const entry = zip.getEntries()[0];
    entry.entryName = rawName; // 传 Buffer：绕过 utf-8 编码，写入原始字节
    return zip.toBuffer();
  }

  it('E1: GBK 文件名的 zip 解压后落盘为中文名，而非 U+FFFD（核心回归）', () => {
    const rawName = Buffer.concat([GBK_WO, Buffer.from('.txt', 'ascii')]); // 我.txt
    const buf = buildZipWithRawName(rawName, 'hello gbk');

    const result = extractZipSafely(buf, tmpDir);

    const names = fs.readdirSync(tmpDir);
    expect(names).toContain('我.txt');
    expect(names.join('')).not.toContain('\uFFFD');
    expect(result.fileCount).toBe(1);
    expect(fs.readFileSync(path.join(tmpDir, '我.txt'), 'utf-8')).toBe('hello gbk');
  });

  it('E2: GBK 目录+文件名的多级路径同样正确还原', () => {
    // 「作业/我.txt」：作业 = 0xD7 0xF7 0xD2 0xB5
    const rawName = Buffer.concat([
      Buffer.from([0xd7, 0xf7, 0xd2, 0xb5]),
      Buffer.from('/', 'ascii'),
      GBK_WO,
      Buffer.from('.txt', 'ascii'),
    ]);
    const buf = buildZipWithRawName(rawName, 'nested');

    extractZipSafely(buf, tmpDir);

    expect(fs.existsSync(path.join(tmpDir, '作业', '我.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, '作业', '我.txt'), 'utf-8')).toBe('nested');
  });

  it('E3: UTF-8 文件名的 zip 不受影响（无二次转码）', () => {
    const zip = new AdmZip();
    zip.addFile('测试/说明.md', Buffer.from('# utf8', 'utf-8'));

    const result = extractZipSafely(zip.toBuffer(), tmpDir);

    expect(result.fileCount).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, '测试', '说明.md'))).toBe(true);
  });

  it('E4: 路径穿越条目整包拒收（Zip-Slip 防护保持）', () => {
    const buf = buildZipWithRawName(Buffer.from('../evil.txt', 'ascii'), 'pwn');

    expect(() => extractZipSafely(buf, tmpDir)).toThrow('Path traversal denied');
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'evil.txt'))).toBe(false);
  });

  it('E6: ".git/config" 解压后目录名仍带前导点，未被洗成 "git"（隐藏目录过滤语义恢复）', () => {
    const buf = buildZipWithRawName(Buffer.from('.git/config', 'ascii'), '[core]\n');

    const result = extractZipSafely(buf, tmpDir);

    // 关键断言：磁盘目录名保留前导点，IGNORED_DIRS.has('.git') 才能重新命中
    expect(fs.existsSync(path.join(tmpDir, '.git'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'git'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.git', 'config'))).toBe(true);
    expect(fs.readdirSync(tmpDir)).toContain('.git');
    expect(result.fileCount).toBe(1);
  });

  it('E5: 空 Buffer 与无可读文件的包按原契约抛错', () => {
    expect(() => extractZipSafely(Buffer.alloc(0), tmpDir)).toThrow('压缩包为空');
    const emptyZip = new AdmZip();
    emptyZip.addFile('empty/', Buffer.alloc(0));
    expect(() => extractZipSafely(emptyZip.toBuffer(), tmpDir)).toThrow('压缩包内没有可读文件');
  });
});
