/**
 * 时间格式化工具 — 全项目统一使用
 */
export function formatDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : '';
}

export function formatTime(d) {
  return d ? new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
}
