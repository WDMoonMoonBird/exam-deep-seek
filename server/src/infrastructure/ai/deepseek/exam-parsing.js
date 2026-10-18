/**
 * exam-parsing.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 233-373）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import crypto from 'crypto';   // ★L5：只输出长度/哈希摘要，绝不落模型原文
import logger from '../../../utils/logger.js';
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { PARSE_ROLE, PARSE_RULES } from '../../../domain/services/deepseek/prompts.js';
import { schemaQuestions } from '../../../domain/services/deepseek/model-output-schema.js';   // ★M9
import { fencedDataBlock } from '../prompt-injection-guard.js';   // ★R3-LLM-FIX：试卷全文 = 数据段 ⇒ 随机 nonce 围栏

/** ★M10：请求与流式读取的统一超时口径（沿用非流式分支原有的 120s；流式用「停滞」口径，见下） */
const REQUEST_TIMEOUT_MS = 120000;

/** ★L5：模型原文一律不出日志 —— 只给长度与 sha256 前 12 位（可对账、不可还原教学内容） */
function contentDigest(text) {
  const s = String(text == null ? '' : text);
  return { length: s.length, sha256_12: crypto.createHash('sha256').update(s).digest('hex').slice(0, 12) };
}

/**
 * 调用 DeepSeek API 解析试卷
 * @param {string} paperText - 试卷文本内容
 * @returns {Promise<{questions: Array}>}
 */
export async function parseExamPaper(paperText) {
  // ★R3-LLM-FIX：消除固定 `---` 分隔（R21）—— 试卷全文以随机 nonce 围栏包裹
  const userMessage = '现在开始提取以下试卷内容：\n' + fencedDataBlock('PAPER_TEXT_DATA', paperText || '');

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log('[parseExamPaper] 第', attempt, '次尝试，字符数:', paperText.length);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: `${PARSE_ROLE}\n\n${PARSE_RULES}` },
            { role: 'user', content: userMessage },
          ],
          temperature: 0,
          max_tokens: 16000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('[parseExamPaper] 原始响应摘要:', JSON.stringify(contentDigest(content)));   // ★L5：原为「前 300 字符」原文（含题干）
      const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
      if (!jsonMatch) { console.error('[parseExamPaper] JSON匹配失败，响应摘要:', JSON.stringify(contentDigest(content))); throw new Error('返回格式不包含有效的 JSON'); }   // ★L5

      const parsed = JSON.parse(jsonMatch[0]);
      if (!schemaQuestions(parsed)) throw new Error('返回格式不包含有效的 JSON');   // ★M9：形状/题型枚举校验，失败走既有分支
      const questions = parsed.questions || [];
      console.log('[parseExamPaper] 解析成功，题目数:', questions.length);
      // ★L5：原为逐题打印 type + 题干前 30 字（教学数据外泄）⇒ 改为题型分布统计，不含任何题干内容
      const typeTally = questions.reduce((acc, q) => { const k = String((q && q.type) || 'unknown'); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
      console.log('[parseExamPaper] 题型分布:', JSON.stringify(typeTally));
      logger.info({ count: questions.length }, '试卷解析完成');
      return { questions };

    } catch (err) {
      if (err.name === 'AbortError') {
        logger.warn({ attempt }, '试卷解析超时');
      } else {
        logger.warn({ attempt, err: err.message }, '试卷解析失败，重试中');
      }
      if (attempt >= 2) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw new Error('试卷解析全部重试失败');
}

/**
 * 流式解析试卷 — SSE 逐 token 推送，永不超时
 * @param {string} paperText
 * @param {function} onProgress - (progressData) => void
 * @returns {Promise<{questions: Array}>}
 */
export async function parseExamPaperStream(paperText, onProgress) {
  // ★R3-LLM-FIX：消除固定 `---` 分隔（R21）—— 试卷全文以随机 nonce 围栏包裹
  const userMessage = '现在开始提取以下试卷内容：\n' + fencedDataBlock('PAPER_TEXT_DATA', paperText || '');
  const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);

  onProgress({ phase: 'connecting' });

  // ★M10：流式分支也要能中止 —— 原实现无 AbortController/超时（注释自述「永不超时」），
  //   reader.read() 一旦挂起就长期占用连接与并发额度。这里用**停滞口径**：每收到一段数据就重置计时，
  //   120s 内无任何数据即 abort（与上面非流式分支同一个 REQUEST_TIMEOUT_MS 口径）。
  const controller = new AbortController();
  let stallTimer = null;
  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  };
  const disarm = () => { if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; } };
  armStallTimer();

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: `${PARSE_ROLE}\n\n${PARSE_RULES}` },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 16000,
      stream: true,
    }),
    signal: controller.signal,   // ★M10
  });

  if (!res.ok) {
    disarm();   // ★M10：失败路径也要撤计时器（挂起的 setTimeout 会白白 keep-alive）
    const errText = await res.text();
    throw new Error(`DeepSeek API ${res.status}: ${errText.slice(0, 200)}`);
  }

  onProgress({ phase: 'streaming' });

  let content = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // ★M10：把 read() 包一层 —— abort 触发时 read() 会 reject，这里换成明确的超时错误，并在错误路径撤计时器
  const readWithStallGuard = async () => {
    try { return await reader.read(); } catch (err) {
      if (controller.signal.aborted) { disarm(); throw new Error('流式解析超时：' + REQUEST_TIMEOUT_MS + 'ms 内未收到任何数据（已中止）'); }
      disarm(); throw err;
    }
  };
  while (true) {
    const { done, value } = await readWithStallGuard();
    armStallTimer();   // ★M10：有数据即重置停滞计时
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          onProgress({ phase: 'token', contentLength: content.length });
        }
      } catch { /* skip unparseable chunks */ }
    }
  }

  disarm();   // ★M10：流结束即撤计时器
  onProgress({ phase: 'parsing', contentLength: content.length });
  console.log('[parseExamPaperStream] 流式接收完成，长度:', content.length);

  const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[parseExamPaperStream] JSON匹配失败，响应摘要:', JSON.stringify(contentDigest(content)));   // ★L5
    throw new Error('返回格式不包含有效的 JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!schemaQuestions(parsed)) throw new Error('返回格式不包含有效的 JSON');   // ★M9（流式分支）
  const questions = parsed.questions || [];
  console.log('[parseExamPaperStream] 解析成功，题目数:', questions.length);
  logger.info({ count: questions.length }, '试卷流式解析完成');
  return { questions };
}
