/**
 * 场景：评分审核 · 改分与发布（第 11 节）
 *
 * 约定：场景文件只放「文案 + 步骤脚本 + 演示用假数据」，不放界面（界面在 sections/*.vue）。
 * 假数据直接写在这里 —— 手册是公开路由，不调接口、不依赖登录态、不 import 任何业务组件。
 * 数值与标签文案对齐真实界面：views/teacher/Review.vue（评分审核列表）
 * 与 views/teacher/ReviewDetail.vue（逐份批改：左=学生答案，右=评分面板，底部=保存审核/发布成绩）。
 */

export const review = {
  id: 'review',
  title: '评分审核',
  caption: '点「审核」→ 看 AI 评分与评语 → 把 85 改成 92 → 写教师评语 → 发布',
  // 读屏用户听到的就是这句：动画层 aria-hidden，界面上的零散节点不会被念出来
  ariaLabel:
    '评分审核演示，共五步。第一步：评分审核列表，每行是一份作业和一个班级，主列显示作业标题与班级、作答区间，' +
    '后面依次是 AI 状态、审核状态、已交与未交的迷你进度条，行尾有「审核」和「导出」按钮。' +
    '第二步：点「审核」进入批改详情页，左侧题目导航，中间是学生答案与代码，右侧评分面板显示 AI 评分 85 分和 AI 评语。' +
    '第三步：教师把最终分输入框里的 85 改成 92，AI 评分仍保留 85 分供对照。' +
    '第四步：在教师评语里写上「思路正确，建议了解三次翻转的 O(n) 解法」。' +
    '第五步：点右下角「发布成绩」，审核状态标签变成「已发布」，并提示「已发布，学生可见」。' +
    '仅为演示，页面与数据都是假的，不会真的改分、保存或发布任何成绩。',
  steps: [
    { label: '点「审核」进入批改', dwell: 1500 },
    { label: '看 AI 评分与评语', dwell: 1600 },
    { label: '把最终分改成 92', dwell: 1500 },
    { label: '写教师评语', dwell: 1400 },
    { label: '点「发布成绩」', dwell: 1600 },
  ],
};

/** 列表页文案（对齐 Review.vue 的列标题与筛选器） */
export const reviewListMeta = {
  pageTitle: '评分审核',
  pageDesc: '按班级查看作业的 AI 评分与审核进度；点「审核」进入学生提交逐份批改。',
  classFilter: '选择班级',
  totalText: '共 3 份作业',
  columns: ['作业 / 班级', 'AI状态', '审核状态', '已交/未交', '操作'],
  foot: '第 1 页 · 每页 20 条',
};

/**
 * 列表行（字段名照抄 /teacher/review-summary 的返回结构：title / className /
 * startTime~endTime / totalStudents / submittedCount / aiPending / abnormal / reviewPending / allReviewed）
 */
export const reviewRows = [
  {
    id: 'a2401-101',
    title: '第三章 循环与数组',
    className: '软件工程 1 班',
    startText: '10-06 ~ 10-13',
    totalStudents: 50,
    submittedCount: 50,
    aiPending: 0,
    abnormal: 0,
    reviewPending: 3,
    allReviewed: false,
  },
  {
    id: 'a2402-101',
    title: '第四章 函数与递归',
    className: '软件工程 1 班',
    startText: '10-13 ~ 10-20',
    totalStudents: 50,
    submittedCount: 43,
    aiPending: 4,
    abnormal: 1,
    reviewPending: 12,
    allReviewed: false,
  },
  {
    id: 'a2403-201',
    title: '第五章 字符串与指针',
    className: '软件工程 2 班',
    startText: '10-08 ~ 10-15',
    totalStudents: 48,
    submittedCount: 48,
    aiPending: 0,
    abnormal: 0,
    reviewPending: 0,
    allReviewed: true,
  },
];

/**
 * AI状态 / 审核状态列（与 Review.vue 第 51~67 行的分支一致）
 * 返回 { text, tone, dot }；没有提交时返回 null（界面上显示 —）
 */
export function aiStatusOf(row) {
  if (!row.submittedCount) return null;
  if (row.aiPending === 0 && row.abnormal > 0) return { text: `评分异常 ${row.abnormal} 人`, tone: 'danger', dot: true };
  if (row.aiPending === 0) return { text: '已评分', tone: 'success', dot: true };
  const tail = row.abnormal > 0 ? `，异常 ${row.abnormal} 人` : '';
  return { text: `待评分 ${row.aiPending} 人${tail}`, tone: 'neutral', dot: true };
}

export function reviewStatusOf(row) {
  if (!row.submittedCount) return null;
  if (row.allReviewed) return { text: '已审核', tone: 'success', dot: true };
  return { text: `待审核 ${row.reviewPending} 人`, tone: 'warning', dot: true };
}

/** 已交占比（照抄 Review.vue 的 progressPercent：0 人班级按 0% 处理，避免除零） */
export function progressPercent(row) {
  const total = row.totalStudents || 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((row.submittedCount / total) * 100));
}

/** 批改详情页（对齐 ReviewDetail.vue：题目导航 / 学生答案 / 评分面板 / 底部审核 bar） */
export const reviewDetail = {
  questionTitle: '第三章 循环与数组',
  studentName: '林晓',
  studentNo: '2024010101',
  maxScore: 100,
  aiScore: 85,
  /** 教师改分的目标值（第 2 步之后显示） */
  finalScore: 92,
  aiFeedback:
    '思路正确：循环边界与交换逻辑都对，样例全过。可优化点：双重循环是 O(n²)，本题 n 最大 10^5；' +
    '建议了解「三次翻转」的 O(n) 解法。',
  teacherFeedback: '思路正确，代码规范。建议了解三次翻转的 O(n) 解法，课后可以补一版对比。',
  codeLang: 'cpp',
  codeLines: [
    [['kw', 'void'], ['txt', ' '], ['fn', 'rotateRight'], ['txt', '(vector<int>& a, int n, int k) {']],
    [['txt', '  k %= n;']],
    [['txt', '  for (int i = 0; i < k; i++) {']],
    [['txt', '    int t = a[n - 1];']],
    [['txt', '    for (int j = n - 1; j > 0; j--) a[j] = a[j - 1];']],
    [['txt', '    a[0] = t;']],
    [['txt', '  }']],
    [['txt', '}']],
  ],
  answerNote: '学生答案 · 第 1 小题 · 编程题 · 40 分',
};
