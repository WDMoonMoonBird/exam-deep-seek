/**
 * projectGrader.js —— 三方评分引擎组合入口（P6 拆分后）。
 * 机器校验 → CompileExecutor（infrastructure/execution）；AST 启发式 → AstAnalyzer；
 * 加权计算 → 领域层 weightedTotal；AI 评审保留本文件（TODO P6b：迁移 DeepSeekGateway + SystemConfigRepository）。
 * 对外 API 与拆分前完全一致（gradeMachine / gradeAST / gradeAI / calculateTotal）。
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { getLanguageByExt, isIgnored } from '../utils/fileTree.js';
import { CompileExecutor } from '../infrastructure/execution/compile-executor.js';
import { AstAnalyzer } from '../infrastructure/execution/ast-analyzer.js';
import { buildFileList } from '../infrastructure/execution/project-file-utils.js';
import { weightedTotal } from '../domain/services/scoring.service.js';

const compileExecutor = new CompileExecutor({ logger });
const astAnalyzer = new AstAnalyzer({ logger });

/**
 * P0 编译检查（委托 CompileExecutor，行为等价）。
 * @param {string} dir - 提交目录路径
 * @param {object} [config] - 机器校验配置 { checkCompile: true }
 * @returns {Promise<{passed: boolean, score: number, feedback: string, details: object}>}
 */
export async function gradeMachine(dir, config = {}) {
  return compileExecutor.compileCheck(dir, config);
}

/**
 * P0 启发式 AST 分析（委托 AstAnalyzer，行为等价）。
 * @param {string} dir - 提交目录路径
 * @param {string} [language] - 编程语言
 * @returns {Promise<{score: number, feedback: string, stats: object}>}
 */
export async function gradeAST(dir, language = 'java') {
  return astAnalyzer.analyze(dir, language);
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
    const systemPrompt = '你是一名高校教师，正在进行工程项目批改。请根据标准工程和学生提交的代码，从代码质量、设计规范、功能完整性三个角度给出评分和评语。评分范围 0-100。';

    const userPrompt = '## 标准工程文件结构\n'
      + (standardFiles || '(无标准工程)')
      + '\n\n## 学生提交文件结构\n'
      + (submissionFiles || '(无文件)')
      + '\n\n## 评分要求\n请根据以下维度评分（满分100分）：\n- 代码质量（40分）：代码是否规范、命名是否合理、是否有适当的注释\n- 设计规范（30分）：项目结构是否合理、是否遵循设计模式\n- 功能完整性（30分）：是否实现了标准工程的核心功能\n\n'
      + (promptExtra ? '## 教师附加要求\n' + promptExtra + '\n\n' : '')
      + '请严格按以下 JSON 格式返回，不要包含任何其他文字：\n{"score": <0-100之间的整数>, "feedback": "详细的评语和改进建议..."}';

    // 调用 DeepSeek API（TODO P6b：改走 DeepSeekGateway + SystemConfigRepository，支持 DB 配置优先）
    const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

    if (!API_KEY) {
      return { score: 0, feedback: 'AI 评审不可用：未配置 API Key' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(BASE_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + API_KEY,
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
      throw new Error('DeepSeek API 返回 ' + res.status);
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
 * 计算加权总分（委托领域层 weightedTotal，等价迁移）。
 * @param {number} machineScore - 机器校验得分
 * @param {number} astScore - AST分析得分
 * @param {number} aiScore - AI评审得分
 * @param {{machine: number, ast: number, ai: number}} weights - 权重
 * @returns {number} 加权总分（保留1位小数）
 */
export const calculateTotal = weightedTotal;