/**
 * exam-parse.js —— 由 server/src/controllers/teacherController.js 拆分而来（step 9，源行 372-422）。
 * 逐字搬移：除 import 行（含函数体内的动态 import 规格符）外，函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 层级：infrastructure（落层依据见 docs/split/teacherController-plan.md §2）。
 */

import { parseExamPaper, parseExamPaperStream } from '../ai/deepseek/index.js';

// ===================== AI 试卷解析 =====================

export const parseExam = async (req, res) => {
  try {
    const { content } = req.body;
    console.log('[parseExam] 收到请求，字符数:', content?.length || 0);
    if (!content?.trim()) return res.status(400).json({ code: 1001, message: '请提供试卷内容', data: null });

    const limit = 80000;
    const trimmed = content.length > limit ? content.slice(0, limit) : content;
    if (content.length > limit) console.log('[parseExam] 内容截断:', content.length, '→', limit);

    console.log('[parseExam] 开始调用 DeepSeek...');
    const result = await parseExamPaper(trimmed);
    console.log('[parseExam] DeepSeek 返回题目数:', result.questions?.length);

    res.json({ code: 0, message: `解析完成，共提取 ${result.questions.length} 道题`, data: result });
  } catch (err) {
    console.error('[parseExam] 失败:', err.message);
    res.status(500).json({ code: 2001, message: 'AI 解析失败: ' + (err.message || '未知错误'), data: null });
  }
};

export const parseExamStream = async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ code: 1001, message: '请提供试卷内容', data: null });

  const limit = 80000;
  const trimmed = content.length > limit ? content.slice(0, limit) : content;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ phase: 'start', totalChars: trimmed.length });
    const result = await parseExamPaperStream(trimmed, (progress) => send(progress));
    send({ phase: 'done', questions: result.questions, count: result.questions.length });
  } catch (err) {
    console.error('[parseExamStream] 失败:', err.message);
    send({ phase: 'error', message: 'AI 解析失败: ' + (err.message || '未知错误') });
  } finally {
    res.end();
  }
};
