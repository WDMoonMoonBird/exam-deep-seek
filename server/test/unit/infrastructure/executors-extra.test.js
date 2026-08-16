/**
 * executors-extra.test.js — 执行器补充测试（Java 编译路径 / AST 各分支评分）。
 * 现有 executors.test.js 覆盖 python 编译 + AST 基础；本文件补：
 *   - javac 存在时 Java 编译通过/失败/优先级；javac 缺失时整体优雅跳过并标记
 *   - AstAnalyzer 文件数/代码行/空行率/注释率各分支与 score 上限
 *   - buildFileList 空目录/不存在、findSourceFiles 忽略 .git
 * 使用 os.tmpdir() 临时目录，不触碰 server/uploads/。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CompileExecutor } from '../../../src/infrastructure/execution/compile-executor.js';
import { AstAnalyzer } from '../../../src/infrastructure/execution/ast-analyzer.js';
import { findSourceFiles, buildFileList } from '../../../src/infrastructure/execution/project-file-utils.js';

const logger = { error() {}, info() {}, warn() {} };

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grader-extra-'));
}

/** javac 可用性探测：不可用则 Java 相关 describe 整体跳过（标记而非失败） */
let hasJavac = true;
try {
  execFileSync('javac', ['-version'], { stdio: 'pipe' });
} catch {
  hasJavac = false;
}

describe('CompileExecutor — Java 编译路径' + (hasJavac ? '' : '（javac 缺失，跳过）'), () => {
  const skip = hasJavac ? describe : describe.skip;

  skip('Java 编译通过 → passed=true', () => {
    it('合法 Main.java → 编译通过', async () => {
      const dir = tmpdir();
      fs.writeFileSync(path.join(dir, 'Main.java'), 'class Main { public static void main(String[] args) {} }\n');
      const r = await new CompileExecutor({ logger }).compileCheck(dir);
      expect(r.passed).toBe(true);
      expect(r.score).toBe(100);
      expect(r.feedback).toContain('编译通过 (1 个 Java 文件)');
      expect(r.details.compiled).toBe(1);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('非法 Java → passed=false 且 details.error 非空', async () => {
      const dir = tmpdir();
      fs.writeFileSync(path.join(dir, 'Broken.java'), 'class Broken {\n');
      const r = await new CompileExecutor({ logger }).compileCheck(dir);
      expect(r.passed).toBe(false);
      expect(r.score).toBe(0);
      expect(r.feedback).toContain('编译失败');
      expect(r.details.error.length).toBeGreaterThan(0);
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('Java 与 Python 共存 → Java 优先', async () => {
      const dir = tmpdir();
      fs.writeFileSync(path.join(dir, 'Main.java'), 'class Main { public static void main(String[] args) {} }\n');
      fs.writeFileSync(path.join(dir, 'main.py'), 'def main():\n    pass\n');
      const r = await new CompileExecutor({ logger }).compileCheck(dir);
      expect(r.feedback).toContain('Java 文件');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});

describe('CompileExecutor — Python 补充', () => {
  it('语法错误 → details.error 含 stderr 摘要', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'bad.py'), 'def broken(::\n');
    const r = await new CompileExecutor({ logger }).compileCheck(dir);
    expect(r.passed).toBe(false);
    expect(r.details.error.length).toBeGreaterThan(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('AstAnalyzer — 文件数/代码行分支', () => {
  it('1 个代码文件 → 「文件较少」', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'A.java'), 'class A {}\n');
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.feedback).toContain('文件较少');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('25 个代码文件 → 「文件较多」', async () => {
    const dir = tmpdir();
    for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(dir, 'F' + i + '.java'), 'class F' + i + ' {}\n');
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.feedback).toContain('文件较多');
    expect(r.stats.codeFiles).toBe(25);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('代码行 < 50 → 「代码较少」', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'A.java'), 'int x = 1;\n');
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.feedback).toContain('代码较少');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('代码行 > 5000 → 「代码较多」', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'Big.java'), Array.from({ length: 5100 }, () => 'x = 1;').join('\n'));
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.feedback).toContain('代码较多');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('AstAnalyzer — 空行率/注释率分支与 score 上限', () => {
  it('空行率 < 5% → +5 分并提示「空行较少」', async () => {
    const dir = tmpdir();
    // 40 行代码 + 1 行空行 → 空行率 ≈ 2.4% < 5%
    const lines = [...Array.from({ length: 40 }, () => 'int v' + Math.random() + ';'), ''];
    fs.writeFileSync(path.join(dir, 'A.java'), lines.join('\n'));
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.feedback).toContain('空行较少');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('注释率 > 20% → +5 分并提示「注释较多」', async () => {
    const dir = tmpdir();
    // 10 行代码 + 4 行注释 → 注释率 ≈ 28.6% > 20%
    const lines = ['// c1', '// c2', '// c3', '// c4', 'int a;', 'int b;', 'int c;', 'int d;', 'int e;', 'int f;', 'int g;', 'int h;', 'int i;', 'int j;'];
    fs.writeFileSync(path.join(dir, 'A.java'), lines.join('\n'));
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.feedback).toContain('注释较多');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('综合良好指标 → score=100 封顶（60+10+10+10+10）', async () => {
    const dir = tmpdir();
    // 3 个文件 × 每文件 30 行代码 + 3 行空行 + 3 行注释 → 各项命中满分区间
    // （空行率 = 3/36 ≈ 8.3% ∈ [5%,25%]，注释率 = 3/36 ≈ 8.3% ∈ [5%,20%]）
    for (let i = 0; i < 3; i++) {
      const lines = [];
      for (let j = 0; j < 30; j++) lines.push('int v' + j + ' = ' + j + ';');
      lines.push('', '', '', '// comment 1', '// comment 2', '// comment 3');
      fs.writeFileSync(path.join(dir, 'F' + i + '.java'), lines.join('\n'));
    }
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.score).toBe(100);
    expect(r.feedback).toContain('文件数量合理');
    expect(r.feedback).toContain('代码行数合理');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('score 永不超 100（上限截断）', async () => {
    const dir = tmpdir();
    for (let i = 0; i < 20; i++) {
      const lines = [];
      for (let j = 0; j < 100; j++) lines.push('int v' + j + ' = ' + j + ';');
      lines.push('', '// c');
      fs.writeFileSync(path.join(dir, 'G' + i + '.java'), lines.join('\n'));
    }
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.score).toBeLessThanOrEqual(100);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('未检测到代码文件 → stats.totalFiles 记录全部文件数', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'readme.md'), 'x');
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.feedback).toContain('未检测到代码文件');
    expect(r.stats.totalFiles).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('project-file-utils — 补充', () => {
  it('buildFileList 空目录 → (空目录)', () => {
    const dir = tmpdir();
    expect(buildFileList(dir)).toBe('(空目录)');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('buildFileList 目录不存在 → (目录不存在)', () => {
    expect(buildFileList('/nonexistent-dir-xyz')).toBe('(目录不存在)');
  });

  it('findSourceFiles 过滤 .git 目录（IGNORED_DIRS）', () => {
    const dir = tmpdir();
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'config'), '[core]');
    fs.writeFileSync(path.join(dir, 'Main.java'), 'class Main {}');
    const files = findSourceFiles(dir);
    expect(files).toContain('Main.java');
    expect(files.some(f => f.includes('.git'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('findSourceFiles 目录不存在 → 空数组', () => {
    expect(findSourceFiles('/nonexistent-dir-xyz')).toEqual([]);
  });
});
