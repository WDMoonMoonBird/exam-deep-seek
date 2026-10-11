/**
 * rubric-items.js —— 由 server/src/services/deepseek.js 拆分而来（step 4，源行 858-972）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import logger from '../../../utils/logger.js';
import { getBaseUrl, getApiKey, getModel } from './config.js';
import { AUTOMATION_LEVELS, RUBRIC_ROLE } from '../../../domain/services/deepseek/prompts.js';

/**
 * 校验并规整分项列表：合计强制等于 maxScore（差额调整最后一项），非法项丢弃。
 * 每项附加 automation_level 三分类（deterministic/semi/subjective）：
 * 旧数据（无 automation_level）或非法值按 deterministic 兜底，保证缓存兼容。
 * @param {Array} items 模型返回的分项数组 [{item, maxScore, automation_level?}]
 * @param {number} maxScore 满分
 * @returns {Array|null} 规整后的 [{item, maxScore, automation_level}]；为空返回 null
 */
export function normalizeRubricItems(items, maxScore = 100) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const out = [];
  let sum = 0;
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const name = String(it.item || '').trim().slice(0, 20);
    const score = Math.max(1, Math.round(Number(it.maxScore) || 0));
    if (!name) continue;
    const automation_level = AUTOMATION_LEVELS.includes(it.automation_level) ? it.automation_level : 'deterministic';
    out.push({ item: name, maxScore: score, automation_level });
    sum += score;
  }
  if (out.length === 0) return null;
  if (sum !== maxScore) {
    out[out.length - 1].maxScore += maxScore - sum;
    if (out[out.length - 1].maxScore < 1) {
      // 极端差额：重新按比例缩放
      const scale = maxScore / sum;
      let acc = 0;
      for (let i = 0; i < out.length; i++) {
        const v = i === out.length - 1 ? maxScore - acc : Math.max(1, Math.round(out[i].maxScore * scale));
        out[i].maxScore = v;
        acc += v;
      }
    }
  }
  return out;
}

/**
 * 从评分标准文本提炼固定分项（一次轻量调用；失败抛错由调用方降级）。
 * 每个分项附带 automation_level 三分类（deterministic/semi/subjective）：
 * - deterministic：可静态检查证据化（文件/目录存在性、是否使用某库如 Router/Pinia、
 *   CRUD/API 调用存在性、数量阈值、语法检查）
 * - subjective：依赖人工判断（代码设计合理、可读性、用户体验、架构清晰、美观）
 * - semi：介于两者（组件复用程度、健壮性等）
 * 比例引导（prompt 提示，不硬约束）：确定性 70%~85%、主观 15%~30%。
 * @param {string} rubricText 教师评分标准（可空 → 默认维度）
 * @param {number} maxScore 满分
 * @returns {Promise<Array<{item: string, maxScore: number, automation_level: string}>|null>}
 */
export async function summarizeRubricItems(rubricText, maxScore = 100) {
  const userMessage = '【评分标准原文】\n' + (rubricText || '（无，请使用通用维度：功能完整性/代码规范性/健壮性）')
    + '\n\n【满分】' + maxScore + ' 分\n'
    + '请将评分标准精简为 3~12 个分项，并为每个分项标注 automation_level 自动化分类：\n'
    + '- deterministic（确定性）：可静态检查证据化的项，如文件/目录是否存在、是否使用某库（Router/Pinia 等）、CRUD/API 调用是否存在、数量阈值、语法检查等\n'
    + '- subjective（主观）：依赖人工判断的项，如代码设计合理、可读性、用户体验、架构清晰、美观等\n'
    + '- semi（半确定）：介于两者之间的项，如组件复用程度、健壮性等\n'
    + '- 比例引导（仅供参考，不强求精确）：确定性 70%~85%，主观 15%~30%，其余为半确定\n'
    + '- item 用简洁名称（不超过 12 字）\n'
    + '- maxScore 为正整数，各项之和必须恰好等于 ' + maxScore + '\n'
    + '- 覆盖评分标准中的全部评分维度，不得合并关键项，不得新增标准外的项\n'
    + '- 原文无结构时使用通用维度\n\n'
    + '严格 JSON 返回（不要任何其他文字）：\n'
    + '{"items": [{"item": "项目初始化", "maxScore": 10, "automation_level": "deterministic"}, {"item": "界面美观", "maxScore": 10, "automation_level": "subjective"}]}';

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const [BASE_URL, API_KEY, MODEL] = await Promise.all([getBaseUrl(), getApiKey(), getModel()]);
      const res = await fetch(BASE_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: RUBRIC_ROLE },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 429) {
        const wait = [5, 15][attempt - 1] * 1000;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error('DeepSeek API ' + res.status);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      let parsed = null;
      try {
        const m = content.match(/\{[\s\S]*"items"[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      } catch { /* 围栏剥离重试 */ }
      if (!parsed) {
        const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
        try { parsed = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)); } catch { parsed = null; }
      }
      const items = normalizeRubricItems(parsed?.items, maxScore);
      if (!items) throw new Error('分项解析失败');
      logger.info({ items: items.length }, '评分标准分项提炼完成');
      return items;
    } catch (err) {
      lastError = err;
      logger.warn({ attempt, err: err.message }, '评分标准分项提炼失败');
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('评分标准分项提炼全部重试失败: ' + (lastError?.message || ''));
}
