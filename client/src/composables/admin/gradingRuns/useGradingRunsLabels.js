/**
 * client/src/composables/admin/gradingRuns/useGradingRunsLabels.js —— 批改记录页的**中文化标签与格式化函数**（B3 纯搬运：从 GradingRuns.vue 原样搬出）。
 *
 * 无状态纯函数（不依赖 Vue 响应式）；口径与拆分前逐字一致：不可得显示 '—'（不伪造 0/假值），英文原键进 tooltip。
 */
/** ★R2-B37b 中文化映射（中文为主；英文原键放 tooltip，便于与日志/DB 对照） */
const TYPE_LABELS = { worker: '批改运行', build: '造尺运行', ruler: '存量尺子记录' };
/** ★D2：运行类型（自动造尺链路的 build/reuse 是作业级记录的关键口径） */
const RUN_KIND_LABELS = { open: '开放评价（open）', build: '造尺（build）', reuse: '复用（reuse）', worker: '普通批改', ruler: '存量尺子（ruler）' };
const SOURCE_LABELS = { worker: '批改 worker', build: '造尺脚本' };
const HOME_POLICY_LABELS = { 'sessions+credentials': '会话文件 + 凭据（保留 home 骨架）' };
const STATUS_LABELS = { done: '完成', failed: '失败', pending: '排队中', running: '运行中', needs_rerun: '需重跑', ready: '就绪（ready）' };
const TIER_LABELS = { peak: '高峰', idle: '空闲', mixed: '跨时段', na: '不适用（无模型调用）' };
/** ★R2-B38：时段档中文化 —— 零 LLM 时后端给 na ⇒ 与命中率 na 口径统一显示「不适用（无模型调用）」 */
export function tierLabel(t) { return TIER_LABELS[t] || (t || '—'); }
export function typeLabel(t) { return TYPE_LABELS[t] || (t || '—'); }
/** ★D2：运行类型中文化 + 兜底（checker_id 仍是 __AUTO_BUILD__ 哨兵时显示「自动造尺（未对齐）」） */
export function runKindLabel(k) { return RUN_KIND_LABELS[k] || (k || '—'); }
export function runKindTone(k) {
  // ★OP-1：开放题自动评价 job（无标准包/无尺子）单独一种色调，便于在批改运行页一眼区分
  if (k === 'open') return 'brand';
  if (k === 'build' || k === 'reuse') return 'success';
  if (k === 'ruler') return 'neutral';
  return 'neutral';
}
export function checkerLabel(run) {
  if (!run) return '—';
  return run.checker_label || run.checker_id || '—';
}
export function sourceLabel(s) { return SOURCE_LABELS[s] || (s || '—'); }
export function homePolicyLabel(v) { return HOME_POLICY_LABELS[v] || (v || '—'); }
export function statusLabel(s) { return STATUS_LABELS[s] || (s || '—'); }

/** 运行标识：job:<id> ⇒ 批改任务 #id；build:<作业ID>:<目录> ⇒ 造尺（作业 #ID） */
export function runRefLabel(key) {
  const s = String(key || '');
  if (!s) return '—';
  if (s.startsWith('job:')) return '批改任务 #' + s.slice(4);
  if (s.startsWith('build:')) {
    const seg = s.split(':');
    return '造尺（作业 #' + (seg[1] || '?') + (seg[2] ? '，目录 ' + seg[2] : '') + '）';
  }
  return s;
}
/** 本地时间（北京时间，浏览器本地）显示；原 UTC 串放 tooltip */
export function fmtLocalTime(v) {
  if (!v) return '—';
  const t = new Date(v);
  if (!Number.isFinite(t.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
}
export function utcTooltip(v) {
  if (!v) return '';
  const t = new Date(v);
  return Number.isFinite(t.getTime()) ? 'UTC: ' + t.toISOString() : String(v);
}
/** 字节数：≥1024 显示 KB/MB */
export function fmtBytes(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}
/** 装置退出码：0=正常，其余标注（原键 device_exit） */
export function exitLabel(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n === 0 ? '0（正常）' : String(n);
}


export function purgeTone(v) { return v === true ? 'success' : (v === false ? 'danger' : 'neutral'); }
export function purgeText(v) { return v === true ? '已销毁' : (v === false ? '未销毁' : '无证据'); }
export function stateTone(r) {
  if (r.failed === true) return 'danger';
  if (r.measurable === false) return 'warning';
  return 'success';
}
export function stateText(r) {
  if (r.failed === true) return '无法评分（failed）';
  if (r.measurable === false) return '不可量';
  return '已量尺';
}
/** 命中率：null ⇒ '—'（无输入时不得显示 0%/100% 假值） */
export function fmtRate(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return (n * 100).toFixed(2) + '%';
}

/** 命中率（中文化 na 语义）：无模型调用 ⇒ 「不适用（无模型调用）」 */
export function fmtRateNa(v, noModelSession) {
  if (v === null || v === undefined || v === '') return noModelSession === true ? '不适用（无模型调用）' : '—';
  return fmtRate(v);
}
/** 原始 JSON 展开文本（只读展示，不改写字段名） */
export function jsonText(v) {
  if (v === null || v === undefined) return '（无数据）';
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
/** token 数：null ⇒ '—'；否则千分位 */
export function fmtTokens(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}
export function fmtElapsed(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(Number(ms) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
}
