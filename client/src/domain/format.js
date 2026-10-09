// 时间/难度显示格式化工具（全项目统一使用）
/**
 * 日期时间（全站统一，R-4）：YYYY-MM-DD HH:mm —— 月/日/时/分零填充。
 * 空值 → ''（同改前）；无法解析的输入沿用 toLocale* 的原有输出（Invalid Date），行为与改前一致。
 */
export function formatDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) {
    // 无效日期：保持改前输出（toLocaleDateString / toLocaleTimeString 对 Invalid Date 的结果）
    return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 日期（仅日期，全站统一）：YYYY-MM-DD —— 月/日零填充。
 * 空值 → ''（同改前）；无法解析的输入沿用 toLocaleDateString 的原有输出（Invalid Date），行为与改前一致。
 */
export function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return date.toLocaleDateString('zh-CN');
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 日期时间（带秒）：YYYY-MM-DD HH:mm:ss —— 供确实需要秒级精度的场景（实训提交时间）复用，
 * 与 formatDateTime 同族（零填充 + 同一无效输入回退策略）。
 */
export function formatDateTimeSec(d) {
  if (!d) return '';
  const date = new Date(d);
  // 无效输入：保持被替换掉的页面本地实现（toLocaleString）的原有输出
  if (Number.isNaN(date.getTime())) return date.toLocaleString('zh-CN', { hour12: false });
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatTime(d) {
  return d ? new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
}

/**
 * 截止时间语义（列表页统一使用）：返回 { text, tone }
 *   tone: overdue 已截止 / urgent <6h / soon <24h / normal 其余
 * 纯前端派生值 —— 后端已返回 endTime，无需新增接口（见 docs/ui-redesign/06-api-gap.md §4）。
 */
export function deadlineInfo(endTime) {
  if (!endTime) return { text: '', tone: 'normal' };
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return { text: '已截止', tone: 'overdue' };
  const hours = Math.floor(diff / 3600000);
  if (hours < 6) return { text: '剩 ' + hours + ' 小时', tone: 'urgent' };
  if (hours < 24) return { text: '剩 ' + hours + ' 小时', tone: 'soon' };
  const days = Math.floor(hours / 24);
  if (days <= 7) return { text: '剩 ' + days + ' 天', tone: 'normal' };
  return { text: formatDate(endTime) + ' 截止', tone: 'normal' };
}

/** 作业的时间状态（不含锁定/待审核，那些由页面结合 record 判断） */
export function timeStatus(startTime, endTime) {
  const now = Date.now();
  if (startTime && new Date(startTime).getTime() > now) return 'upcoming';
  if (endTime && new Date(endTime).getTime() <= now) return 'ended';
  return 'ongoing';
}

/** 难度等级中文映射（枚举值保持 easy/medium/hard，仅显示层中文化） */
export const DIFFICULTY_TEXT = { easy: '简单', medium: '中等', hard: '困难' };

export function difficultyText(d) {
  return DIFFICULTY_TEXT[d] || d || '';
}
