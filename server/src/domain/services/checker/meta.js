/**
 * meta.js —— 由 server/src/services/checkerService.js 拆分而来（step 3，源行 43-44 · 628-641 · 684-700 · 702-710 · 712-729）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

/** 就绪置信度阈值：标准包得分 ≥ 阈值即进入 review（教师确认），不再要求必须满分（2026-08-18 §4.1） */
const DEFAULT_THRESHOLD = 90;

/**
 * 把负例验证结果（weakRules）挂载到校准反馈对象上（纯函数，供单测）。
 * 只在 lastFeedback 生成处调用；weakRules 为空数组时不添加任何段落（prompt 按空判断）。
 * @param {object|null} lastFeedback 上一轮反馈（{ result, deductions, defectItems } 或 { error }）
 * @param {Array|null} weakRules 负例验证弱规则 [{id, item, reason}]；非数组视为空
 * @returns {object} 携带 weakRules 的新反馈对象（不修改入参）
 */
export function attachNegativeFeedback(lastFeedback, weakRules) {
  const base = lastFeedback && typeof lastFeedback === 'object' && !Array.isArray(lastFeedback)
    ? { ...lastFeedback }
    : {};
  base.weakRules = Array.isArray(weakRules) ? weakRules : [];
  return base;
}

/** 追加规则版本记录（rules 全文快照，支持回滚）；status: 'draft' | 'active' */
function appendVersion(meta, rulesText, status, reason) {
  const list = Array.isArray(meta.versions) ? meta.versions : [];
  const maxId = list.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0);
  const id = maxId + 1;
  list.push({
    id,
    version: 'v' + id,
    status,
    reason,
    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    rules: rulesText,
  });
  meta.versions = list;
  if (status === 'active') meta.activeVersionId = id;
  return id;
}

/** 报告项标记：标准包未包含该文件（缺陷候选，交教师转主观/豁免/接受） */
function markDefectReportItems(meta, missingPathIds) {
  if (!meta.report || !missingPathIds || missingPathIds.size === 0) return;
  for (const it of meta.report.items || []) {
    if (missingPathIds.has(it.id)) {
      it.note = '标准包未包含该文件（缺陷候选：评分标准要求但标准包未实现，可转主观/豁免/接受失分）';
    }
  }
}

/** 由 runRules 结果构建标准包体检报告（失分项 → 教师处理：转主观/豁免/接受失分） */
function buildReport(meta, rules, resultItems, maxScore) {
  const deductions = (Array.isArray(resultItems) ? resultItems : [])
    .filter((it) => it.score < it.max_score);
  meta.report = {
    score: maxScore - deductions.reduce((s, it) => s + (it.max_score - it.score), 0),
    max_score: maxScore,
    threshold: meta.threshold || DEFAULT_THRESHOLD,
    items: deductions.map((it) => ({
      id: it.id,
      group: it.group || '',
      ruleLabel: it.item || ('规则 ' + it.id),
      deduction: it.max_score - it.score,
      status: 'pending',
      note: (it.evidence || '').slice(0, 120) || '标准包未满足该规则',
    })),
  };
}

export { DEFAULT_THRESHOLD, appendVersion, markDefectReportItems, buildReport };
