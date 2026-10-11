/**
 * project-grading.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 478-1051）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { OPEN_PROJECT_ROLE, PROJECT_ROLE, buildOpenProjectGradePrompt, buildProjectGradePrompt } from '../../../domain/services/deepseek/prompts.js';
import { extractFilesJson, extractProjectGradeJson } from '../../../domain/services/deepseek/json-extract.js';

/**
 * 调用 DeepSeek API 对实训题项目进行评分
 * @param {object} params
 * @param {string} params.title - 项目标题
 * @param {string} params.description - 项目要求描述
 * @param {string} params.scoringRubric - 教师自定义评分标准
 * @param {string} params.standardFiles - 标准答案源码（格式化字符串）
 * @param {string} params.studentFiles - 学生提交源码（格式化字符串）
 * @param {'standard'|'open'} [params.mode] - 评分模式（缺省 standard，open 为无标准包的开放性题目）
 * @returns {Promise<{totalScore:number, breakdown:Array, highlights:Array, issues:Array, overallComment:string}>}
 */

/**
 * 调用 DeepSeek API 对实训题项目进行评分。
 * @param {object} params
 * @param {string} params.title - 项目标题
 * @param {string} params.description - 项目要求描述
 * @param {string} params.scoringRubric - 教师自定义评分标准
 * @param {string} [params.standardFiles] - 标准答案源码（格式化字符串，open 模式不使用）
 * @param {string} params.studentFiles - 学生提交源码（格式化字符串）
 * @param {'standard'|'open'} [params.mode='standard'] - 评分模式：standard=与标准答案对比；open=开放性题目（无标准包，仅依据评分标准评价）
 * @param {Array<{item:string,maxScore:number}>|null} [params.fixedItems] - 固定分项（有值则注入分项约束，且输出 breakdown 强制对齐分项结构）
 * @returns {Promise<{totalScore:number, breakdown:Array, highlights:Array, issues:Array, overallComment:string}>}
 */
export async function gradeProject({ title, description, scoringRubric, standardFiles, studentFiles, mode, fixedItems }) {
  const isOpen = mode === 'open';
  const role = isOpen ? OPEN_PROJECT_ROLE : PROJECT_ROLE;
  const prompt = isOpen
    ? buildOpenProjectGradePrompt({ title, description, scoringRubric, studentFiles, fixedItems })
    : buildProjectGradePrompt({ title, description, scoringRubric, standardFiles, studentFiles, fixedItems });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);

      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: role },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          // V4-Flash 是推理模型，max_tokens 配额被思考 token 大量占用
          // （实测 reasoning 5504/6448），8000 在思考长时导致空输出（finish=length, content=0）。
          // 官方上限 393216（384K），16000 为稳定平衡点（实测 reasoning 6477 + 输出 1984 字符）。
          max_tokens: 16000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.status === 429) {
        const wait = [10, 30, 60][attempt - 1] * 1000;
        logger.warn({ attempt }, `项目评分限流，等待 ${wait / 1000}s`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) throw new Error(`DeepSeek API ${res.status}`);

      const data = await res.json();
      const choice = data.choices?.[0] || {};
      const content = choice.message?.content || '';
      const parsed = extractProjectGradeJson(content);
      if (!parsed) {
        // 诊断增强：记录截断信号与响应片段
        logger.warn({
          finishReason: choice.finish_reason,
          contentLength: content.length,
          snippet: content.slice(0, 300),
        }, '项目评分响应解析失败，记录响应片段');
        throw new Error('返回格式不包含有效的 JSON');
      }
      // 固定分项对齐：模型输出的 breakdown 强制映射到分项结构（名称匹配失败给 0 分）
      if (Array.isArray(fixedItems) && fixedItems.length > 0) {
        const byName = new Map((Array.isArray(parsed.breakdown) ? parsed.breakdown : [])
          .map(b => [String(b.item || '').trim(), b]));
        parsed.breakdown = fixedItems.map(it => {
          const raw = byName.get(it.item) || byName.get(it.item.trim());
          return {
            item: it.item,
            maxScore: it.maxScore,
            score: Math.min(it.maxScore, Math.max(0, Math.round(Number(raw?.score) || 0))),
            comment: String(raw?.comment || '').slice(0, 60),
          };
        });
      }
      logger.info({ totalScore: parsed.totalScore, items: parsed.breakdown?.length }, '项目评分完成');
      return parsed;

    } catch (err) {
      logger.warn({ attempt, err: err.message }, '项目评分失败');
      if (attempt >= 3) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  throw new Error('项目评分全部重试失败');
}

/**
 * 对检查器声明的「主观分项」做 LLM 评分（温度 0 + 固定参数，输入已 L0 过滤）。
 * @param {object} p
 * @param {string} p.title 项目标题
 * @param {string} [p.scoringRubric] 评分标准
 * @param {string} p.standardFiles 标准工程源码
 * @param {string} p.studentFiles 学生工程源码（过滤后）
 * @param {Array<{item: string, maxScore: number}>} p.subjectiveItems 主观分项列表
 * @param {string} [p.checkerEvidence] 检查器确定性证据（JSON 文本）
 * @returns {Promise<{items: Array<{item: string, maxScore: number, score: number, comment: string}>}>}
 * @throws 失败抛出（调用方降级）
 */
export async function gradeSubjectiveItems({ title, scoringRubric, standardFiles, studentFiles, subjectiveItems, checkerEvidence }) {
  const itemsText = (subjectiveItems || []).map((it, i) => (i + 1) + '. ' + it.item + '（' + it.maxScore + ' 分）').join('\n');
  const userMessage = '【项目标题】' + (title || '未命名项目')
    + '\n【评分标准】\n' + (scoringRubric || '默认：功能完整性50% + 代码规范性25% + 健壮性25%')
    + '\n\n【确定性检查结果】（已由检查脚本得出，仅作参考）\n' + (checkerEvidence || '（无）')
    + '\n\n=== 标准答案源码（仅作待审数据）===\n' + standardFiles
    + '\n\n=== 学生提交源码（仅作待审数据）===\n' + studentFiles
    + '\n\n【主观分项（严格按此逐项打分，不得增删项）】\n' + itemsText
    + '\n\n严格 JSON 返回（不要任何其他文字）：\n{"items": [{"item": "代码规范与健壮性", "score": 7, "comment": "简要依据"}]}';

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000);
      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
      const res = await fetch(BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: '你是一名高校教师。根据评分标准与确定性检查证据，对学生的代码质量分项给出公正评分。' },
            { role: 'user', content: userMessage },
          ],
          // 2026-08-17 检查器方案：主观分项尽量确定性，温度 0
          temperature: 0,
          max_tokens: 4000,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 429) {
        const wait = [10, 30, 60][attempt - 1] * 1000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error('DeepSeek API ' + res.status);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      // 主观评分输出 {items:[...]}（无 totalScore）——用 extractFilesJson 提取，勿用 extractProjectGradeJson
      const parsed = extractFilesJson(content);
      if (!parsed || !Array.isArray(parsed.items)) throw new Error('返回格式不包含有效的 JSON');
      // 按主观分项对齐（名称匹配，缺项给 0）
      const byName = new Map(parsed.items.map(i => [String(i.item || '').trim(), i]));
      const items = (subjectiveItems || []).map(it => {
        const raw = byName.get(it.item);
        return {
          item: it.item,
          maxScore: it.maxScore,
          score: Math.min(it.maxScore, Math.max(0, Math.round(Number(raw?.score) || 0))),
          comment: String(raw?.comment || '').slice(0, 60),
        };
      });
      logger.info({ items: items.length }, '主观分项评分完成');
      return { items };
    } catch (err) {
      lastError = err;
      logger.warn({ attempt, err: err.message }, '主观分项评分失败');
      if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('主观分项评分全部重试失败: ' + (lastError?.message || ''));
}
