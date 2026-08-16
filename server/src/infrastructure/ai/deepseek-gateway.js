/**
 * DeepSeekGateway —— AI 网关适配器（实现 domain/ports/gateways.js 的 AiGateway 契约）。
 * 行为等价迁移自 server/src/services/deepseek.js 的 gradeSubmission / parseExamPaper：
 *   grade       → 3 次重试 / 60s 超时 / 429 退避 [5,15,30]s / JSON 提取 / score 截断 [0,maxScore] / 兜底 {0, 请联系老师}
 *   parsePaper  → 2 次重试 / 120s 超时 / temperature 0 / max_tokens 16000
 * 依赖注入（configRepo / logger / fetchImpl）便于测试；原 deepseek.js 保持不动，P3 切换后删除。
 */

import { buildSystemPrompt, buildGradingUserMessage, PARSE_ROLE, PARSE_RULES, buildParseUserMessage, PROJECT_REVIEW_SYSTEM, buildProjectReviewUserMessage } from './prompt-builder.js';

export const ABNORMAL_FEEDBACK = '请联系老师';

const GRADE_RETRIES = 3;
const GRADE_TIMEOUT_MS = 60000;
const GRADE_429_WAITS_MS = [5, 15, 30]; // 秒；grade 内 ×1000 得毫秒
const PARSE_RETRIES = 2;
const PARSE_TIMEOUT_MS = 120000;

export class DeepSeekGateway {
  /**
   * @param {object} deps
   * @param {object} deps.configRepo SystemConfigRepository（getApiKey/getBaseUrl/getModel）
   * @param {object} [deps.logger] pino/console
   * @param {Function} [deps.fetchImpl] fetch 实现（默认 globalThis.fetch）
   */
  constructor({ configRepo, logger = console, fetchImpl = globalThis.fetch }) {
    this.configRepo = configRepo;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
  }

  async #request({ model, messages, temperature, maxTokens, timeoutMs }) {
    const [baseUrl, apiKey] = await Promise.all([this.configRepo.getBaseUrl(), this.configRepo.getApiKey()]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(baseUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      return { res, controller, timer };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * 评分（等价 gradeSubmission）。
   * @param {object} req
   * @param {string} [req.material]
   * @param {string} [req.subQuestionTitle]
   * @param {string} req.subQuestionContent
   * @param {string} req.referenceAnswer
   * @param {string} req.studentAnswer
   * @param {number} req.maxScore
   * @param {string} [req.scoringCriteria]
   * @returns {Promise<{score: number, feedback: string}>}
   */
  async grade(req) {
    const userMessage = buildGradingUserMessage(req);
    let lastError = null;

    for (let attempt = 1; attempt <= GRADE_RETRIES; attempt++) {
      try {
        const model = await this.configRepo.getModel();
        const { res, controller, timer } = await this.#request({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(req.scoringCriteria) },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          maxTokens: 2000,
          timeoutMs: GRADE_TIMEOUT_MS,
        });

        if (res.status === 429) {
          const wait = GRADE_429_WAITS_MS[attempt - 1] * 1000;
          this.logger.warn({ attempt }, 'DeepSeek API 限流，等待 ' + wait / 1000 + 's 后重试');
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          clearTimeout(timer);
          throw new Error('DeepSeek API 返回 ' + res.status);
        }

        const data = await res.json();
        clearTimeout(timer);
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*"score"[\s\S]*"feedback"[\s\S]*\}/);
        if (!jsonMatch) throw new Error('返回格式不包含有效的 JSON');

        const parsed = JSON.parse(jsonMatch[0]);
        const score = Math.max(0, Math.min(req.maxScore, parseInt(parsed.score) || 0));
        return { score, feedback: parsed.feedback || '无评语' };
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError') this.logger.warn({ attempt }, 'DeepSeek API 超时，重试中');
        else this.logger.warn({ attempt, err: err.message }, 'DeepSeek API 调用失败，重试中');
        if (attempt < GRADE_RETRIES) await new Promise((r) => setTimeout(r, 2000));
      }
    }

    this.logger.error({ err: lastError }, 'DeepSeek 评分全部重试失败，返回兜底分数');
    return { score: 0, feedback: ABNORMAL_FEEDBACK };
  }

  /**
   * 试卷解析（等价 parseExamPaper）。
   * @param {string} paperText
   * @returns {Promise<{questions: Array}>}
   */
  async parsePaper(paperText) {
    const userMessage = buildParseUserMessage(paperText);

    for (let attempt = 1; attempt <= PARSE_RETRIES; attempt++) {
      try {
        const model = await this.configRepo.getModel();
        const { res, controller, timer } = await this.#request({
          model,
          messages: [
            { role: 'system', content: PARSE_ROLE + '\n\n' + PARSE_RULES },
            { role: 'user', content: userMessage },
          ],
          temperature: 0,
          maxTokens: 16000,
          timeoutMs: PARSE_TIMEOUT_MS,
        });

        if (!res.ok) {
          const errText = await res.text();
          clearTimeout(timer);
          throw new Error('DeepSeek API ' + res.status + ': ' + errText.slice(0, 200));
        }

        const data = await res.json();
        clearTimeout(timer);
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
        if (!jsonMatch) throw new Error('返回格式不包含有效的 JSON');

        const parsed = JSON.parse(jsonMatch[0]);
        const questions = parsed.questions || [];
        this.logger.info({ count: questions.length }, '试卷解析完成');
        return { questions };
      } catch (err) {
        if (err.name === 'AbortError') this.logger.warn({ attempt }, '试卷解析超时');
        else this.logger.warn({ attempt, err: err.message }, '试卷解析失败，重试中');
        if (attempt >= PARSE_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    throw new Error('试卷解析全部重试失败');
  }

  /**
   * 项目评审（等价迁移自 projectGrader.gradeAI，走 SystemConfigRepository 配置）。
   * @param {object} p
   * @param {string} p.standardFiles 标准工程文件列表（buildFileList 输出）
   * @param {string} p.submissionFiles 学生提交文件列表
   * @param {string} [p.promptExtra]
   * @returns {Promise<{score: number, feedback: string}>} 失败时返回兜底（不抛出）
   */
  async gradeProject({ standardFiles, submissionFiles, promptExtra }) {
    try {
      const apiKey = await this.configRepo.getApiKey();
      if (!apiKey) {
        return { score: 0, feedback: 'AI 评审不可用：未配置 API Key' };
      }
      const model = await this.configRepo.getModel();
      const { res, controller, timer } = await this.#request({
        model,
        messages: [
          { role: 'system', content: PROJECT_REVIEW_SYSTEM },
          { role: 'user', content: buildProjectReviewUserMessage({ standardFiles, submissionFiles, promptExtra }) },
        ],
        temperature: 0.3,
        maxTokens: 4000,
        timeoutMs: 120000,
      });
      if (!res.ok) {
        clearTimeout(timer);
        throw new Error('DeepSeek API 返回 ' + res.status);
      }
      const data = await res.json();
      clearTimeout(timer);
      const content = data.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*"score"[\s\S]*"feedback"[\s\S]*\}/);
      if (!jsonMatch) throw new Error('返回格式不包含有效的 JSON');
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Math.max(0, Math.min(100, parseInt(parsed.score) || 0));
      return { score, feedback: parsed.feedback || '无评语' };
    } catch (err) {
      this.logger.error({ err }, 'AI评审异常');
      return { score: 0, feedback: 'AI 评审失败: ' + (err.message || '未知错误') };
    }
  }
}