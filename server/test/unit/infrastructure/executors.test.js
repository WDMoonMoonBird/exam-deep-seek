import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CompileExecutor } from '../../../src/infrastructure/execution/compile-executor.js';
import { AstAnalyzer } from '../../../src/infrastructure/execution/ast-analyzer.js';
import { findSourceFiles, buildFileList } from '../../../src/infrastructure/execution/project-file-utils.js';

const logger = { error() {}, info() {}, warn() {} };

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grader-test-'));
}

describe('project-file-utils（等价迁移自 projectGrader 工具函数）', () => {
  it('findSourceFiles 递归收集并跳过忽略目录', () => {
    const dir = tmpdir();
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'Main.java'), 'class Main {}');
    fs.writeFileSync(path.join(dir, 'node_modules', 'x.js'), 'x');
    fs.writeFileSync(path.join(dir, 'README.md'), 'r');
    const files = findSourceFiles(dir);
    expect(files).toContain('src/Main.java');
    expect(files.some(f => f.includes('node_modules'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('buildFileList 超 100 文件截断', () => {
    const dir = tmpdir();
    for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(dir, 'f' + i + '.java'), 'x');
    const list = buildFileList(dir);
    expect(list).toContain('还有 20 个文件');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('CompileExecutor.compileCheck（等价 gradeMachine）', () => {
  it('目录不存在 → passed=false', async () => {
    const r = await new CompileExecutor({ logger }).compileCheck('/nonexistent-dir-xyz');
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain('提交目录不存在');
  });
  it('checkCompile=false → 跳过', async () => {
    const r = await new CompileExecutor({ logger }).compileCheck('/nonexistent', { checkCompile: false });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });
  it('无源文件 → 未检测到', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'readme.md'), 'x');
    const r = await new CompileExecutor({ logger }).compileCheck(dir);
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain('未检测到');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('python 语法正确 → passed=true', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'main.py'), 'def main():\n    print(1)\n');
    const r = await new CompileExecutor({ logger }).compileCheck(dir);
    expect(r.passed).toBe(true);
    expect(r.feedback).toContain('语法检查通过');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('python 语法错误 → passed=false', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'bad.py'), 'def broken(::\n');
    const r = await new CompileExecutor({ logger }).compileCheck(dir);
    expect(r.passed).toBe(false);
    expect(r.feedback).toContain('语法检查失败');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('AstAnalyzer.analyze（等价 gradeAST）', () => {
  it('空目录 → score=0', async () => {
    const dir = tmpdir();
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.score).toBe(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('代码文件统计类/函数并给基础分', async () => {
    const dir = tmpdir();
    fs.writeFileSync(path.join(dir, 'Main.java'), 'class Main {\n  void run() {}\n}\n// comment\n');
    const r = await new AstAnalyzer({ logger }).analyze(dir);
    expect(r.stats.classCount).toBe(1);
    expect(r.stats.funcCount).toBeGreaterThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(60);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('directory 不存在 → 提交目录不存在', async () => {
    const r = await new AstAnalyzer({ logger }).analyze('/nonexistent-ast-xyz');
    expect(r.feedback).toContain('提交目录不存在');
  });
});