/**
 * assignmentsPure.js —— 由 client/src/views/teacher/Assignments.vue 拆分而来（R2-B64 / t4）
 * 纯函数与静态表：无 Vue 依赖、无 I/O。函数体/表体逐字搬移（行内注释一并保留）。
 */
import { timeStatus } from '../../domain/format.js';

/** 源 :325-331 —— 状态筛选取值必须与后端 buildAssignmentStatusWhere 的语义一致（时间维度与锁定维度互相独立） */
export const statusOptions = [
  { value: 'ongoing', label: '进行中' },
  { value: 'upcoming', label: '未开始' },
  { value: 'ended', label: '已结束' },
  { value: 'locked', label: '已锁定' },
];

// 源 :333-344 —— 列表样式 v2：主键列两行式（标题 + 共 N 题，题数列已并入次行）；提交进度改迷你进度条；
// 截止时间固定两行；状态/班级沿用既有标签写法（仅列宽收敛）
export const columns = [
  { title: '作业名称', key: 'title', width: 260 },
  { title: '班级', key: 'classes', width: 180, responsive: ['xl'] },
  { title: '提交进度', key: 'progress', width: 190 },
  // 状态列宽保持 170：150 时「已结束 + 待审核 N」两枚标签差 2px 放不下会折成两行（行高 75 > 70），
  // 实测 170 → 实际列宽 180 / 内容区 148 > 所需 132，稳定单行
  { title: '状态', key: 'status', width: 170 },
  { title: '截止时间', key: 'deadline', width: 120 },
  { title: '操作', key: 'action', width: 100, align: 'right' },
];

/** 源 :346-353 —— 行状态：锁定优先，其次按时间；「待审核 N」单独一枚标签（数据源= pendingReviewCount） */
export function rowStatus(record) {
  if (record.locked) return { text: '已锁定', tone: 'neutral' };
  const s = timeStatus(record.startTime, record.endTime);
  if (s === 'upcoming') return { text: '未开始', tone: 'neutral' };
  if (s === 'ended') return { text: '已结束', tone: 'neutral' };
  return { text: '进行中', tone: 'success' };
}

/**
 * 源 :355-363 —— 提交进度：分子 submissionCount 与分母 expectedCount 同 population（作业全部关联班级）——
 * 口径由后端保证，前端不要与 pendingReviewCount 混用（后者仅统计教师可见班级）。
 */
export function progressOf(record) {
  const done = record.submissionCount || 0;
  const total = record.expectedCount || 0;
  return { done, total, percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0 };
}

/** 源 :365-369 —— 全部提交（进度条 track 转绿 is-ok）：应交 0 人的作业不算「已全交」，避免空进度条显示为完成色 */
export function allSubmitted(record) {
  const { done, total } = progressOf(record);
  return total > 0 && done >= total;
}

/** 源 :371-376 */
export function visibleClasses(record) {
  return (record.assignmentClasses || []).slice(0, 2);
}
export function hiddenClassCount(record) {
  return Math.max(0, (record.assignmentClasses || []).length - 2);
}

/** 源 :460-461 —— 班级人数：来自 GET /teacher/classes 每行的 _count.studentClasses（现有接口已返回，无需后端改动） */
export function classCount(c) { return c && c._count ? (c._count.studentClasses || 0) : 0; }
