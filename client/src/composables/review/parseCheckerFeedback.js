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
  };
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
