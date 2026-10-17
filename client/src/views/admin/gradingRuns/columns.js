/**
 * client/src/views/admin/gradingRuns/columns.js —— 批改记录页的**筛选选项 / 表格列定义**（B3 纯搬运：从 GradingRuns.vue 原样搬出）。
 *
 * 纯常量（无响应式依赖）：列 title/key/width/tooltip 与拆分前逐字一致；英文原键保留在 tooltip 供与 DB/日志对照。
 */
// ★R2-B37b：表头中文化（英文原键放列 tooltip，便于与日志/DB 字段对照）
export const cols = [
  { title: '归档 / 运行', key: 'archive', width: 200, tooltip: '原键：archive / id' },
  { title: '类型', key: 'type', width: 110, tooltip: '原键：type（worker=批改运行 / build=造尺运行 / ruler=存量尺子记录）' },
  { title: '运行类型', key: 'run_kind_col', width: 130, tooltip: '原键：run_kind（build=本次造尺 / reuse=复用量尺 / worker=普通批改 / ruler=存量尺子）' },
  { title: '作业', key: 'assignment', width: 150, tooltip: '原键：assignment_id / assignment_title' },
  { title: '老师', key: 'teacher', width: 120, tooltip: '原键：teacher_name / teacher_id（列表按作业归属补齐）' },
  { title: '班级', key: 'classes', width: 170, tooltip: '原键：classes[].name / class_count（作业关联班级）' },
  { title: '尺子', key: 'checker', width: 150, tooltip: '原键：checker_id；__AUTO_BUILD__ ⇒ 自动造尺（未对齐）' },
  { title: '状态', key: 'status_col', width: 100, tooltip: '原键：status' },
  { title: '已量尺', key: 'measured', width: 80, tooltip: '原键：measured（成功量尺份数）' },
  { title: '不可量', key: 'unmeasurable', width: 80, tooltip: '原键：unmeasurable（C8 预检/量尺判不可量）' },
  { title: '无法评分', key: 'failed', width: 90, tooltip: '原键：failed' },
  { title: '未写分', key: 'skipped', width: 80, tooltip: '原键：skipped（未写入分数的份数）' },
  { title: '已写分', key: 'written', width: 80, tooltip: '原键：written（实际写入分数行数）' },
  { title: '费用', key: 'cost', width: 110, tooltip: '原键：cost_total / cost_currency（按 system_configs.llm_prices 分档）' },
  { title: '命中率', key: 'cache_hit_rate_col', width: 110, tooltip: '原键：cache_hit_rate = cache_read/(cache_read+uncached_input)' },
  { title: '会话销毁', key: 'sessions_purged', width: 130, tooltip: '原键：sessions_purged' },
  { title: '时间', key: 'created_at_col', width: 190, tooltip: '原键：created_at（本地时间；UTC 见悬浮提示）' },
];
export const subCols = [
  { title: 'slug', key: 'slug', width: 200 },
  { title: '状态', key: 'state', width: 160 },
  { title: '分数', dataIndex: 'score', width: 80 },
  { title: '命中', dataIndex: 'hits', width: 70 },
  { title: '原因', dataIndex: 'reason', width: 220 },
  { title: '学生', dataIndex: 'student', width: 120 },
];

export const toolCols = [
  { title: '工具', dataIndex: 'name', width: 160, tooltip: '原键：tools[].name（会话日志 tool/call + 内层 dispatch）' },
  { title: '次数', dataIndex: 'count', width: 80, tooltip: '原键：tools[].count' },
  { title: '耗时', key: 'ms', width: 110, tooltip: '原键：tools[].ms（调用→返回墙钟差累计）' },
  { title: '失败', dataIndex: 'errors', width: 70, tooltip: '原键：tools[].errors（isError 计数）' },
];
