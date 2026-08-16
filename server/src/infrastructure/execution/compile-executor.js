/**
 * CompileExecutor —— 机器校验执行器（等价迁移自 projectGrader.js gradeMachine 及编译检查）。
 * 实现 ExecutorPort.checkCompile 契约；child_process 参数数组方式（不经 shell，防注入）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findSourceFiles } from './project-file-utils.js';

export class CompileExecutor {
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  /**
   * P0 编译检查：检测 Java/Python 文件并尝试编译（等价 gradeMachine）。
   * @param {string} dir 提交目录路径
   * @param {object} [config] { checkCompile: boolean }
   * @returns {Promise<{passed: boolean, score: number, feedback: string, details: object}>}
   */
  async compileCheck(dir, config = {}) {
    const checkCompile = config.checkCompile !== false;
    if (!checkCompile) {
      return { passed: true, score: 100, feedback: '编译检查已跳过', details: {} };
    }

    if (!fs.existsSync(dir)) {
      return { passed: false, score: 0, feedback: '提交目录不存在', details: { error: 'directory not found' } };
    }

    try {
      const sourceFiles = findSourceFiles(dir);
      const javaFiles = sourceFiles.filter(f => f.endsWith('.java'));
      const pyFiles = sourceFiles.filter(f => f.endsWith('.py'));

      if (javaFiles.length === 0 && pyFiles.length === 0) {
        return {
          passed: false,
          score: 0,
          feedback: '未检测到 Java 或 Python 源文件',
          details: { totalFiles: sourceFiles.length },
        };
      }

      if (javaFiles.length > 0) return await this.#checkJavaCompile(dir, javaFiles);
      if (pyFiles.length > 0) return await this.#checkPythonCompile(dir, pyFiles);

      return { passed: false, score: 0, feedback: '无法确定编译方式', details: {} };
    } catch (err) {
      this.logger.error({ err }, '机器校验异常');
      return { passed: false, score: 0, feedback: '校验异常: ' + (err.message || '未知错误'), details: { error: err.message } };
    }
  }

  async #checkJavaCompile(dir, javaFiles) {
    const tempDir = '/tmp/javac_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      const fileArgs = javaFiles.map(f => path.resolve(dir, f));
      const stdout = execFileSync('javac', ['-d', tempDir, ...fileArgs], {
        timeout: 15000,
        encoding: 'utf-8',
      });
      fs.rmSync(tempDir, { recursive: true, force: true });
      return {
        passed: true,
        score: 100,
        feedback: '编译通过 (' + javaFiles.length + ' 个 Java 文件)',
        details: { compiled: javaFiles.length, output: stdout || '' },
      };
    } catch (err) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
      const stderr = err.stderr || err.stdout || err.message || '';
      return {
        passed: false,
        score: 0,
        feedback: '编译失败: ' + stderr.slice(0, 500),
        details: { error: stderr.slice(0, 1000), files: javaFiles.length },
      };
    }
  }

  async #checkPythonCompile(dir, pyFiles) {
    try {
      const fileArgs = pyFiles.map(f => path.resolve(dir, f));
      execFileSync('python3', ['-m', 'py_compile', ...fileArgs], {
        timeout: 15000,
        encoding: 'utf-8',
      });
      return {
        passed: true,
        score: 100,
        feedback: '语法检查通过 (' + pyFiles.length + ' 个 Python 文件)',
        details: { compiled: pyFiles.length },
      };
    } catch (err) {
      const stderr = err.stderr || err.stdout || err.message || '';
      return {
        passed: false,
        score: 0,
        feedback: '语法检查失败: ' + stderr.slice(0, 500),
        details: { error: stderr.slice(0, 1000), files: pyFiles.length },
      };
    }
  }
}