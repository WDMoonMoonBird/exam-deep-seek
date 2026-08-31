// 时间/难度显示格式化工具（全项目统一使用）
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

/** 难度等级中文映射（枚举值保持 easy/medium/hard，仅显示层中文化） */
export const DIFFICULTY_TEXT = { easy: '简单', medium: '中等', hard: '困难' };

export function difficultyText(d) {
  return DIFFICULTY_TEXT[d] || d || '';
}
