/**
 * grade.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 159-218 · 1322-1336）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import { generateReferenceAnswer } from '../ai/deepseek/index.js';

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
    // ★M6（W2-P2b）：响应固定文案，err.message 只进日志（上方已记）
    res.status(500).json({ code: 2001, message: 'AI 生成失败，请稍后重试', data: null });
  }
};
