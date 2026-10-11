/**
 * grade.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 159-218 · 1322-1336）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import fs from 'fs';
import path from 'path';
import prisma from '../../utils/prisma.js';
import logger from '../../utils/logger.js';
import { hasStandardPackage, UPLOADS_ROOT } from '../../utils/projectPaths.js';
import { generateReferenceAnswer } from '../ai/deepseek/index.js';

const gradeProject = async (req, res) => {
  try {
    const id = +req.params.id;
    const q = await prisma.question.findFirst({
      where: { id, teacherId: req.user.id, type: 'project', deletedAt: null },
    });
    if (!q) return res.status(404).json({ code: 1004, message: '题目不存在', data: null });

    // 读取标准项目文件
    const readDirFiles = (dir) => {
      const result = [];
      if (!fs.existsSync(dir)) return result;
      const walk = (base, rel = '') => {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(path.join(base, entry.name), rel + entry.name + '/');
          else if (entry.isFile()) {
            const fpath = rel + entry.name;
            try {
              result.push({ path: fpath, content: fs.readFileSync(path.join(base, entry.name), 'utf-8') });
            } catch {}
          }
        }
      };
      walk(dir);
      return result;
    };

    // R6：开放性题目（attachmentUrl 为空且标准包目录无文件）本就没有标准答案可比对，试评不适用
    const isOpenProject = !hasStandardPackage(q.id, q.attachmentUrl);
    const standardDir = q.attachmentUrl ? path.join(UPLOADS_ROOT, q.attachmentUrl) : '';
    const standardFiles = readDirFiles(standardDir)
      .map(f => `// 文件名: ${f.path}\n${f.content}`).join('\n\n');

    // 读取学生提交文件：仅允许读取标准包目录，不接受任何外部路径（封堵任意文件读取）
    const studentDir = standardDir;
    const studentFiles = readDirFiles(studentDir)
      .map(f => `// 文件名: ${f.path}\n${f.content}`).join('\n\n');

    if (!standardFiles) {
      // 开放性题目：明确提示「无标准工程包」，避免「未找到标准项目文件」被误读为上传失败；
      // 有包但读不到内容（历史数据/目录丢失）仍保留原提示。
      const message = isOpenProject ? '开放性题目无标准工程包，无法试评' : '未找到标准项目文件';
      return res.status(400).json({ code: 1001, message, data: null });
    }

    const { gradeProject: doGrade } = await import('../ai/deepseek/index.js');
    const result = await doGrade({
      title: q.title,
      description: q.material || '',
      scoringRubric: q.scoringRubric || '',
      standardFiles,
      studentFiles,
    });

    res.json({ code: 0, message: '评分完成', data: result });
  } catch (err) {
    logger.error({ err }, '项目评分失败');
    res.status(500).json({ code: 2001, message: '评分失败: ' + (err.message || '未知错误'), data: null });
  }
};
// ===================== AI 生成参考答案 =====================

export const generateReference = async (req, res) => {
  try {
    const { material, stem, scoringCriteria } = req.body;
    if (!stem?.trim()) return res.status(400).json({ code: 1001, message: '请提供题目内容', data: null });
    console.log('[generateReference] 开始生成参考答案...');
    const answer = await generateReferenceAnswer({ material, stem, scoringCriteria });
    console.log('[generateReference] 生成完成，长度:', answer.length);
    res.json({ code: 0, message: '参考答案已生成', data: { answer } });
  } catch (err) {
    console.error('[generateReference] 失败:', err.message);
    res.status(500).json({ code: 2001, message: 'AI 生成失败: ' + (err.message || '未知错误'), data: null });
  }
};
