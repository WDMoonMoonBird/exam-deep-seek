/**
 * R2-B41（t14）：解析装置「dsh-checker 形状」的 aiFeedback，供教师复审侧渲染**AI 评分依据**分项表。
 *
 * 纯函数 + 模块级解析缓存（本仓库复审页禁止在视图内引入响应式原语 ⇒ 用 memo 保持模板简洁且不重复解析）。
 * 兼容性铁律：
 *  · 只有 `source === 'dsh-checker'` 且 `breakdown` 是数组时才走分项表；
 *  · 旧的自然语言评语 / 其它 JSON / 坏 JSON ⇒ `kind: 'text'` 原样展示（绝不改写、绝不报错）；
 *  · 空串/null ⇒ `kind: 'empty'`（调用方显示「暂无评语」）。
 */
const CACHE = new Map();
const CACHE_MAX = 200;

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

export function parseCheckerFeedbackText(raw) {
  const text = raw === null || raw === undefined ? '' : String(raw);
  if (!text.trim()) return { kind: 'empty' };
  const t = text.trim();
  if (t[0] !== '{') return { kind: 'text', text };
  let doc = null;
  try { doc = JSON.parse(t); } catch { return { kind: 'text', text }; }   // 坏 JSON ⇒ 安全降级（原样文本）
  if (!doc || typeof doc !== 'object' || doc.source !== 'dsh-checker' || !Array.isArray(doc.breakdown)) {
    return { kind: 'text', text };                                       // 非 dsh-checker 形状 ⇒ 原样展示
  }
  const rows = doc.breakdown.map((b) => {
    const score = Number.isFinite(Number(b && b.score)) ? Number(b.score) : null;
    const maxScore = Number.isFinite(Number(b && b.maxScore)) ? Number(b.maxScore) : null;
    const status = b && b.status !== undefined && b.status !== null ? String(b.status) : null;
    let ok = null;
    if (status) ok = ['hit', 'pass', 'ok', 'true', 'met'].includes(status.toLowerCase());
    else if (score !== null && maxScore !== null) ok = maxScore > 0 ? score >= maxScore : score >= 0;
    return {
      item: String((b && b.item) || ''),
      title: String((b && (b.title || b.item)) || ''),
      score, maxScore, status, ok,
      comment: String((b && b.comment) || ''),
    };
  });
  const hits = rows.filter((r) => r.ok === true).length;
  const sumScore = rows.reduce((a, r) => a + (r.score || 0), 0);
  const sumMax = rows.reduce((a, r) => a + (r.maxScore || 0), 0);
  const scoreNum = Number.isFinite(Number(doc.score_int)) ? Number(doc.score_int)
    : (Number.isFinite(Number(doc.raw_score)) ? Number(doc.raw_score) : sumScore);
  const maxNum = Number.isFinite(Number(doc.max_score)) ? Number(doc.max_score) : sumMax;
  // ★R2-B43：自然语言总评（脚本写入 ai_feedback.summary）——缺失时保持旧渲染（分项面板）
  const rawSummary = doc.summary && typeof doc.summary === 'object' && doc.summary.text ? doc.summary : null;
  const failedItems = rows.filter((r) => r.ok === false).map((r) => r.item || r.title).filter(Boolean);
  const factsFailed = rawSummary && rawSummary.facts && Array.isArray(rawSummary.facts.failed_items) && rawSummary.facts.failed_items.length
    ? rawSummary.facts.failed_items.map((x) => String(x))
    : failedItems;
  const basisScore = rawSummary && rawSummary.facts && Number.isFinite(Number(rawSummary.facts.score)) ? Number(rawSummary.facts.score) : scoreNum;
  return {
    kind: 'checker',
    rows,
    hits,
    total: rows.length,
    score: scoreNum,
    max: maxNum,
    scoreText: fmtNum(scoreNum),
    maxText: fmtNum(maxNum),
    checkerId: doc.checker_id || null,
    hasEvidence: rows.some((r) => /证据[:：]/.test(r.comment)),
    // ★总评 + 一行依据（缺失 ⇒ summary=null ⇒ 视图回落旧分项面板）
    summary: rawSummary ? {
      text: String(rawSummary.text),
      truncated: rawSummary.truncated === true,
      model: rawSummary.model || null,
      generatedAt: rawSummary.generated_at || null,
      tokens: rawSummary.tokens || null,
      facts: rawSummary.facts || null,
    } : null,
    failedItems: factsFailed.slice(0, 12),
    basisText: buildBasisText({ hits, total: rows.length, score: basisScore, max: maxNum, failedItems: factsFailed }),
  };
}

/** 一行依据：本次 N 分 ｜ M 项检查通过 K 项 ｜ 失分：P06、P24… */
export function buildBasisText({ hits = 0, total = 0, score = null, max = null, failedItems = [] } = {}) {
  const parts = [];
  if (score !== null && score !== undefined) parts.push('本次 ' + fmtNum(Number(score)) + (max === null || max === undefined ? ' 分' : ' / ' + fmtNum(Number(max)) + ' 分'));
  parts.push(total + ' 项检查通过 ' + hits + ' 项');
  const failed = (Array.isArray(failedItems) ? failedItems : []).filter(Boolean);
  if (failed.length) {
    const shown = failed.slice(0, 6).join('、');
    parts.push('失分：' + shown + (failed.length > 6 ? ' 等 ' + failed.length + ' 项' : ''));
  } else if (total > 0) {
    parts.push('无失分项');
  }
  return parts.join(' ｜ ');
}

/** 带缓存的入口（模板里可安全多次调用） */
export function parseCheckerFeedback(raw) {
  const key = raw === null || raw === undefined ? '' : String(raw);
  if (CACHE.has(key)) return CACHE.get(key);
  const parsed = parseCheckerFeedbackText(key);
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(key, parsed);
  return parsed;
}

export default { parseCheckerFeedback, parseCheckerFeedbackText };
