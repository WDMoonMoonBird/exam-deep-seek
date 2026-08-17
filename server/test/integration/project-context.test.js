/**
 * project-context.test.js — 实训题评分上下文构建（L0 过滤 / 两阶段降级）。
 * buildGradingContext 为纯文件操作（不查库），直接 import 调用。
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildGradingContext } from '../../src/services/projectGrading.js';

function makeProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

const QUESTION = { id: 1, title: '上下文测试题', material: '要求说明', scoringRubric: '' };

describe('buildGradingContext（上下文构建）', () => {
  it('off 模式：全量注入，不过滤', async () => {
    const dir = makeProject({
      'src/main.js': 'console.log(1)',
      'src/data.txt': 'x'.repeat(100),
    });
    try {
      const ctx = await buildGradingContext({ mode: 'off', stdDir: dir, stuDir: dir, question: QUESTION });
      expect(ctx.info.mode).toBe('off');
      expect(ctx.studentFiles).toContain('main.js');
      expect(ctx.studentFiles).toContain('data.txt'); // 全量含非白名单
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('filter 模式：白名单外文件被过滤', async () => {
    const dir = makeProject({
      'src/main.js': 'console.log(1)',
      'src/logo.png': 'PNGDATA',
      'node_modules/lodash/index.js': 'module.exports = {}',
      'src/readme.md': '说明文档',
    });
    try {
      const ctx = await buildGradingContext({ mode: 'filter', stdDir: dir, stuDir: dir, question: QUESTION });
      expect(ctx.studentFiles).toContain('main.js');
      expect(ctx.studentFiles).not.toContain('logo.png');
      expect(ctx.studentFiles).not.toContain('lodash');
      expect(ctx.studentFiles).not.toContain('readme.md');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('filter 模式：超大文件折叠为占位', async () => {
    const big = 'const a = 1;\n'.repeat(40000); // > 256KB
    const dir = makeProject({ 'src/big.js': big, 'src/small.js': 'console.log(2)' });
    try {
      const ctx = await buildGradingContext({ mode: 'filter', stdDir: dir, stuDir: dir, question: QUESTION });
      expect(ctx.studentFiles).toContain('文件过大');
      expect(ctx.studentFiles).not.toContain('const a = 1;');
      expect(ctx.studentFiles).toContain('small.js');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('未知模式：安全降级为全量注入', async () => {
    const dir = makeProject({ 'src/main.js': 'console.log(1)' });
    try {
      const ctx = await buildGradingContext({ mode: 'invalid-mode', stdDir: dir, stuDir: dir, question: QUESTION });
      expect(ctx.info.mode).toBe('off');
      expect(ctx.info.note).toContain('降级');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('空目录：降级全量（不抛错）', async () => {
    const dir = makeProject({});
    try {
      const ctx = await buildGradingContext({ mode: 'filter', stdDir: dir, stuDir: dir, question: QUESTION });
      expect(ctx.info.mode).toBe('off');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('two-stage：文件树为空时不触发选择调用，降级不抛错', async () => {
    const dir = makeProject({});
    try {
      const ctx = await buildGradingContext({ mode: 'two-stage', stdDir: dir, stuDir: dir, question: QUESTION });
      expect(ctx.info.mode).toBe('off');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});