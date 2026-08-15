/**
 * projectGrader.js — 三方评分引擎
 *
 * - gradeMachine(dir, config)    → 机器校验（编译检查）
 * - gradeAST(dir, language)      → AST 启发式分析
 * - gradeAI(standardDir, subDir) → AI 评审
 * - calculateTotal(m, a, ai, w)  → 加权总分
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { getLanguageByExt, isIgnored } from '../utils/fileTree.js';

// ==================== 机器校验 ====================

/**
 * P0 编译检查：检测 Java/Python 文件并尝试编译
 * @param {string} dir - 提交目录路径
 * @param {object} [config] - 机器校验配置 { checkCompile: true }
 * @returns {Promise<{passed: boolean, score: number, feedback: string, details: object}>}
 */
export async function gradeMachine(dir, config = {}) {
  const checkCompile = config.checkCompile !== false; // 默认开启
  if (!checkCompile) {
    return { passed: true, score: 100, feedback: '编译检查已跳过', details: {} };
  }

  if (!fs.existsSync(dir)) {
    return { passed: false, score: 0, feedback: '提交目录不存在', details: { error: 'directory not found' } };
  }

  try {
    // 扫描目录中的源文件
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

    // Java 编译检查
    if (javaFiles.length > 0) {
      return await checkJavaCompile(dir, javaFiles);
    }

    // Python 编译检查
    if (pyFiles.length > 0) {
      return await checkPythonCompile(dir, pyFiles);
    }

    return { passed: false, score: 0, feedback: '无法确定编译方式', details: {} };
  } catch (err) {
    logger.error({ err }, '机器校验异常');
    return { passed: false, score: 0, feedback: '校验异常: ' + (err.message || '未知错误'), details: { error: err.message } };
  }
}

async function checkJavaCompile(dir, javaFiles) {
  const tempDir = `/tmp/javac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // 构建 javac 命令，只编译根目录下的 .java 文件
    const fileArgs = javaFiles.map(f => path.resolve(dir, f)).join(' ');
    const cmd = `javac -d "${tempDir}" ${fileArgs}`;

    const stdout = execSync(cmd, {
      timeout: 15000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      passed: true,
      score: 100,
      feedback: `编译通过 (${javaFiles.length} 个 Java 文件)`,
      details: { compiled: javaFiles.length, output: stdout || '' },
    };
  } catch (err) {
    // 清理临时目录
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }

    const stderr = err.stderr || err.stdout || err.message || '';
    return {
      passed: false,
      score: 0,
      feedback: `编译失败: ${stderr.slice(0, 500)}`,
      details: { error: stderr.slice(0, 1000), files: javaFiles.length },
    };
  }
}

async function checkPythonCompile(dir, pyFiles) {
  try {
    const fileArgs = pyFiles.map(f => path.resolve(dir, f)).join(' ');
    const cmd = `python3 -m py_compile ${fileArgs}`;

    execSync(cmd, {
      timeout: 15000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      passed: true,
      score: 100,
      feedback: `语法检查通过 (${pyFiles.length} 个 Python 文件)`,
      details: { compiled: pyFiles.length },
    };
  } catch (err) {
    const stderr = err.stderr || err.stdout || err.message || '';
    return {
      passed: false,
      score: 0,
      feedback: `语法检查失败: ${stderr.slice(0, 500)}`,
      details: { error: stderr.slice(0, 1000), files: pyFiles.length },
    };
  }
}

// ==================== AST 启发式分析 ====================

/**
 * P0 启发式 AST 分析
 * @param {string} dir - 提交目录路径
 * @param {string} [language] - 编程语言
 * @returns {Promise<{score: number, feedback: string, stats: object}>}
 */
export async function gradeAST(dir, language = 'java') {
  if (!fs.existsSync(dir)) {
    return { score: 0, feedback: '提交目录不存在', stats: {} };
  }

  try {
    const sourceFiles = findSourceFiles(dir);
    const codeFiles = sourceFiles.filter(f => f.endsWith('.java') || f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.ts'));

    if (codeFiles.length === 0) {
      return { score: 0, feedback: '未检测到代码文件', stats: { totalFiles: sourceFiles.length } };
    }

    let totalLines = 0;
    let totalCodeLines = 0;
    let totalCommentLines = 0;
    let totalBlankLines = 0;
    let classCount = 0;
    let funcCount = 0;

    for (const file of codeFiles) {
      const fullPath = path.resolve(dir, file);
      let content;
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      totalLines += lines.length;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') {
          totalBlankLines++;
        } else if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
          totalCommentLines++;
        } else {
          totalCodeLines++;
        }
      }

      // 统计类和函数数量（正则）
      const classMatches = content.match(/\bclass\s+\w+/g);
      if (classMatches) classCount += classMatches.length;

      const funcMatches = content.match(/\b(?:def|function|public|private|protected|static|void|int|String|boolean|double|float|char)\s+\w+\s*\(/g);
      if (funcMatches) funcCount += funcMatches.length;
    }

    // 计算指标
    const blankRate = totalLines > 0 ? totalBlankLines / totalLines : 0;
    const commentRate = totalLines > 0 ? totalCommentLines / totalLines : 0;

    // 评分逻辑（简单规则）
    let score = 60; // 基础分
    const details = [];

    // 文件数量合理（3-20个）
    if (codeFiles.length >= 3 && codeFiles.length <= 20) {
      score += 10;
      details.push(`文件数量合理 (${codeFiles.length})`);
    } else if (codeFiles.length < 3) {
      details.push(`文件较少 (${codeFiles.length})`);
    } else {
      details.push(`文件较多 (${codeFiles.length})`);
    }

    // 代码行数合理（50-5000）
    if (totalCodeLines >= 50 && totalCodeLines <= 5000) {
      score += 10;
      details.push(`代码行数合理 (${totalCodeLines})`);
    } else if (totalCodeLines < 50) {
      details.push(`代码较少 (${totalCodeLines}行)`);
    } else {
      details.push(`代码较多 (${totalCodeLines}行)`);
    }

    // 空行率合理（5%-25%）
    if (blankRate >= 0.05 && blankRate <= 0.25) {
      score += 10;
    } else if (blankRate < 0.05) {
      score += 5;
      details.push('空行较少，可读性可能不佳');
    }

    // 注释率（建议 5%-20%）
    if (commentRate >= 0.05 && commentRate <= 0.20) {
      score += 10;
    } else if (commentRate > 0.20) {
      score += 5;
      details.push('注释较多');
    }

    score = Math.min(100, Math.max(0, score));

    const stats = {
      totalFiles: sourceFiles.length,
      codeFiles: codeFiles.length,
      totalLines,
      codeLines: totalCodeLines,
      commentLines: totalCommentLines,
      blankLines: totalBlankLines,
      blankRate: (blankRate * 100).toFixed(1) + '%',
      commentRate: (commentRate * 100).toFixed(1) + '%',
      classCount,
      funcCount,
    };

    return {
      score,
      feedback: `代码分析完成。${details.join('；') || '结构基本合理'}`,
      stats,
    };
  } catch (err) {
    logger.error({ err }, 'AST分析异常');
    return { score: 0, feedback: '分析异常: ' + (err.message || '未知错误'), stats: {} };
  }
}

// ==================== AI 评审 ====================

/**
 * AI 评审 — 调用 DeepSeek API 对比标准工程与学生提交
 * @param {string} standardDir - 标准工程目录
 * @param {string} submissionDir - 学生提交目录
 * @param {string} [promptExtra] - 教师自定义提示词
 * @returns {Promise<{score: number, feedback: string}>}
 */
export async function gradeAI(standardDir, submissionDir, promptExtra = '') {
  try {
    // 读取标准工程文件列表
    const standardFiles = buildFileList(standardDir);
    const submissionFiles = buildFileList(submissionDir);

    // 构建 prompt
    const systemPrompt = `你是一名高校教师，正在进行工程项目批改。请根据标准工程和学生提交的代码，从代码质量、设计规范、功能完整性三个角度给出评分和评语。评分范围 0-100。`;

    const userPrompt = `## 标准工程文件结构
${standardFiles || '(无标准工程)'}

## 学生提交文件结构
${submissionFiles || '(无文件)'}

## 评分要求
请根据以下维度评分（满分100分）：
- 代码质量（40分）：代码是否规范、命名是否合理、是否有适当的注释
- 设计规范（30分）：项目结构是否合理、是否遵循设计模式
- 功能完整性（30分）：是否实现了标准工程的核心功能

${promptExtra ? `## 教师附加要求\n${promptExtra}` : ''}

请严格按以下 JSON 格式返回，不要包含任何其他文字：
{"score": <0-100之间的整数>, "feedback": "详细的评语和改进建议..."}`;

    // 调用 DeepSeek API
    const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

    if (!API_KEY) {
      return { score: 0, feedback: 'AI 评审不可用：未配置 API Key' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`DeepSeek API 返回 ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*"score"[\s\S]*"feedback"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('返回格式不包含有效的 JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(100, parseInt(parsed.score) || 0));

    return { score, feedback: parsed.feedback || '无评语' };
  } catch (err) {
    logger.error({ err }, 'AI评审异常');
    return { score: 0, feedback: 'AI 评审失败: ' + (err.message || '未知错误') };
  }
}

// ==================== 加权计算 ====================

/**
 * 计算加权总分
 * @param {number} machineScore - 机器校验得分
 * @param {number} astScore - AST分析得分
 * @param {number} aiScore - AI评审得分
 * @param {{machine: number, ast: number, ai: number}} weights - 权重
 * @returns {number} 加权总分（保留1位小数）
 */
export function calculateTotal(machineScore, astScore, aiScore, weights = { machine: 0.3, ast: 0.3, ai: 0.4 }) {
  const total = (machineScore || 0) * (weights.machine || 0.3)
    + (astScore || 0) * (weights.ast || 0.3)
    + (aiScore || 0) * (weights.ai || 0.4);
  return Math.round(total * 10) / 10; // 保留1位小数
}

// ==================== 工具函数 ====================

/**
 * 递归查找目录中的源文件
 */
function findSourceFiles(dir) {
  /** @type {string[]} */
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(currentDir, baseDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (isIgnored(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(baseDir, fullPath);
      if (entry.isDirectory()) {
        walk(fullPath, baseDir);
      } else if (entry.isFile()) {
        results.push(relPath);
      }
    }
  }

  walk(dir, dir);
  return results;
}

/**
 * 构建文件列表字符串（用于 AI prompt）
 */
function buildFileList(dir) {
  if (!fs.existsSync(dir)) return '(目录不存在)';
  const files = findSourceFiles(dir);
  if (files.length === 0) return '(空目录)';
  // 最多显示前100个文件
  const display = files.slice(0, 100);
  let result = display.join('\n');
  if (files.length > 100) result += `\n... 还有 ${files.length - 100} 个文件`;
  return result;
}
