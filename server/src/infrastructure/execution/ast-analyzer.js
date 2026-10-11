/**
 * AstAnalyzer —— AST 启发式分析器（等价迁移自 projectGrader.js gradeAST）。
 * 纯文件统计 + 启发式评分，无外部依赖。
 */

import fs from 'node:fs';
import path from 'node:path';
import { findSourceFiles } from './project-file-utils.js';

export class AstAnalyzer {
  constructor({ logger = console } = {}) {
    this.logger = logger;
  }

  /**
   * 启发式 AST 分析（等价 gradeAST）。
   * @param {string} dir 提交目录路径
   * @param {string} [language] 编程语言（当前实现不依赖）
   * @returns {Promise<{score: number, feedback: string, stats: object}>}
   */
  async analyze(dir) {
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

        const classMatches = content.match(/\bclass\s+\w+/g);
        if (classMatches) classCount += classMatches.length;

        const funcMatches = content.match(/\b(?:def|function|public|private|protected|static|void|int|String|boolean|double|float|char)\s+\w+\s*\(/g);
        if (funcMatches) funcCount += funcMatches.length;
      }

      const blankRate = totalLines > 0 ? totalBlankLines / totalLines : 0;
      const commentRate = totalLines > 0 ? totalCommentLines / totalLines : 0;

      let score = 60;
      const details = [];

      if (codeFiles.length >= 3 && codeFiles.length <= 20) {
        score += 10;
        details.push('文件数量合理 (' + codeFiles.length + ')');
      } else if (codeFiles.length < 3) {
        details.push('文件较少 (' + codeFiles.length + ')');
      } else {
        details.push('文件较多 (' + codeFiles.length + ')');
      }

      if (totalCodeLines >= 50 && totalCodeLines <= 5000) {
        score += 10;
        details.push('代码行数合理 (' + totalCodeLines + ')');
      } else if (totalCodeLines < 50) {
        details.push('代码较少 (' + totalCodeLines + '行)');
      } else {
        details.push('代码较多 (' + totalCodeLines + '行)');
      }

      if (blankRate >= 0.05 && blankRate <= 0.25) {
        score += 10;
      } else if (blankRate < 0.05) {
        score += 5;
        details.push('空行较少，可读性可能不佳');
      }

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
        feedback: '代码分析完成。' + (details.join('；') || '结构基本合理'),
        stats,
      };
    } catch (err) {
      this.logger.error({ err }, 'AST分析异常');
      return { score: 0, feedback: '分析异常: ' + (err.message || '未知错误'), stats: {} };
    }
  }
}