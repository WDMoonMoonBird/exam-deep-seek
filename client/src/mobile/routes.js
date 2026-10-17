/**
 * /m 移动端 v1 路由表（契约：docs/mobile-app/10-v1-implementation-contract.md §3）
 *
 * 范围（v1 · 零后端）：
 *   公共/平台 9 条：
 *     /m、/m/login、/m/doc、/m/404、/m/403、/m/500、
 *     /m/platform/install、/m/platform/splash、/m/platform/states
 *   学生 8 条（覆盖 11 实体屏；答题卡/交卷确认是 Answer 页内 Sheet，无独立路由）：
 *     /m/student/home、/assignments、/assignments/:id、/assignments/:id/answer、
 *     /assignments/:id/done、/scores、/scores/:assignmentId、/profile
 *   教师 14 条（覆盖 14 实体屏）：
 *     /m/teacher/home、/assignments、/assignments/:id、/review、
 *     /review/:submissionId、/review/:submissionId/code、/review/:submissionId/diff、
 *     /batch、/batch/confirm、/assign/new、/questions、/classes/:classId、/profile、
 *     /code/unsupported
 *   + /m/** 兜底 404（保证 /m/unknown 进移动 404，而不是被桌面 catch-all 重定向到 /login）。
 *   合计 31 条契约路由 + 1 条 /m 兜底；34 个占位页面（学生 3 个 Answer 内状态屏不单独注册路由）。
 *
 * 约定：
 *   · 全部懒加载（() => import(...)），页面 chunk 独立，桌面入口不加载移动页面与移动 CSS；
 *   · meta.mobile = true 供守卫识别；meta.public = true 为未登录可访问；
 *   · meta.role 为受保护页所需角色（student / teacher），角色不符由全局守卫跳 /m/403；
 *   · 不注册任何 /m/admin/** 路由（管理端 v1 后置 D12）。超管访问 /m 由守卫引导到 /m/403?reason=admin。
 *   · 组件命名与页面 Agent 交付文件一一对应（PascalCase.vue），不移动文件、不擅自改名。
 */
export const mobileRoutes = [
  /* ---------------------------------------------------------------- 公共与认证（6 屏） */
  {
    path: '/m',
    name: 'MobileLanding',
    component: () => import('./views/public/Landing.vue'),
    meta: { mobile: true, public: true, title: '移动端' },
  },
  {
    path: '/m/login',
    name: 'MobileLogin',
    component: () => import('./views/public/Login.vue'),
    meta: { mobile: true, public: true, title: '登录' },
  },
  {
    path: '/m/doc',
    name: 'MobileDoc',
    component: () => import('./views/public/Doc.vue'),
    meta: { mobile: true, public: true, title: '使用文档' },
  },
  {
    path: '/m/404',
    name: 'MobileError404',
    component: () => import('./views/public/Error404.vue'),
    meta: { mobile: true, public: true, title: '页面不存在' },
  },
  {
    path: '/m/403',
    name: 'MobileError403',
    component: () => import('./views/public/Error403.vue'),
    meta: { mobile: true, public: true, title: '无权限' },
  },
  {
    path: '/m/500',
    name: 'MobileError500',
    component: () => import('./views/public/Error500.vue'),
    meta: { mobile: true, public: true, title: '服务异常' },
  },

  /* ---------------------------------------------------------------- 平台与状态（3 屏） */
  {
    path: '/m/platform/install',
    name: 'MobilePlatformInstall',
    component: () => import('./views/platform/PlatformInstall.vue'),
    meta: { mobile: true, public: true, title: '安装到主屏' },
  },
  {
    path: '/m/platform/splash',
    name: 'MobilePlatformSplash',
    component: () => import('./views/platform/PlatformSplash.vue'),
    meta: { mobile: true, public: true, title: '启动屏' },
  },
  {
    path: '/m/platform/states',
    name: 'MobilePlatformStates',
    component: () => import('./views/platform/StatesOverview.vue'),
    meta: { mobile: true, public: true, title: '状态体系' },
  },

  /* ---------------------------------------------------------------- 学生端（8 路由 / 11 实体屏） */
  {
    path: '/m/student/home',
    name: 'MobileStudentHome',
    component: () => import('./views/student/StudentHome.vue'),
    meta: { mobile: true, role: 'student', title: '学生首页' },
  },
  {
    path: '/m/student/assignments',
    name: 'MobileStudentAssignments',
    component: () => import('./views/student/Assignments.vue'),
    meta: { mobile: true, role: 'student', title: '我的作业' },
  },
  {
    path: '/m/student/assignments/:id',
    name: 'MobileStudentAssignmentDetail',
    component: () => import('./views/student/AssignmentDetail.vue'),
    meta: { mobile: true, role: 'student', title: '作业详情' },
  },
  {
    path: '/m/student/assignments/:id/answer',
    name: 'MobileStudentAnswer',
    component: () => import('./views/student/Answer.vue'),
    meta: { mobile: true, role: 'student', title: '作答' },
  },
  {
    path: '/m/student/assignments/:id/done',
    name: 'MobileStudentDone',
    component: () => import('./views/student/Done.vue'),
    meta: { mobile: true, role: 'student', title: '已提交' },
  },
  {
    path: '/m/student/scores',
    name: 'MobileStudentScores',
    component: () => import('./views/student/Scores.vue'),
    meta: { mobile: true, role: 'student', title: '我的成绩' },
  },
  {
    path: '/m/student/scores/:assignmentId',
    name: 'MobileStudentScoreDetail',
    component: () => import('./views/student/ScoreDetail.vue'),
    meta: { mobile: true, role: 'student', title: '成绩详情' },
  },
  {
    path: '/m/student/profile',
    name: 'MobileStudentProfile',
    component: () => import('./views/student/Profile.vue'),
    meta: { mobile: true, role: 'student', title: '我的' },
  },

  /* ---------------------------------------------------------------- 教师端（14 路由 / 14 实体屏） */
  {
    path: '/m/teacher/home',
    name: 'MobileTeacherHome',
    component: () => import('./views/teacher/Home.vue'),
    meta: { mobile: true, role: 'teacher', title: '工作台' },
  },
  {
    path: '/m/teacher/assignments',
    name: 'MobileTeacherAssignments',
    component: () => import('./views/teacher/Assignments.vue'),
    meta: { mobile: true, role: 'teacher', title: '作业' },
  },
  {
    path: '/m/teacher/assignments/:id',
    name: 'MobileTeacherAssignmentDetail',
    component: () => import('./views/teacher/AssignmentDetail.vue'),
    meta: { mobile: true, role: 'teacher', title: '作业详情' },
  },
  {
    path: '/m/teacher/review',
    name: 'MobileTeacherReviewQueue',
    component: () => import('./views/teacher/ReviewQueue.vue'),
    meta: { mobile: true, role: 'teacher', title: '评分审核' },
  },
  {
    path: '/m/teacher/review/:submissionId',
    name: 'MobileTeacherReviewDetail',
    component: () => import('./views/teacher/ReviewDetail.vue'),
    meta: { mobile: true, role: 'teacher', title: '审核详情' },
  },
  {
    path: '/m/teacher/review/:submissionId/code',
    name: 'MobileTeacherReviewCode',
    component: () => import('./views/teacher/ReviewCode.vue'),
    meta: { mobile: true, role: 'teacher', title: '代码只读' },
  },
  {
    path: '/m/teacher/review/:submissionId/diff',
    name: 'MobileTeacherReviewDiff',
    component: () => import('./views/teacher/ReviewDiff.vue'),
    meta: { mobile: true, role: 'teacher', title: '代码差异' },
  },
  {
    path: '/m/teacher/batch',
    name: 'MobileTeacherBatchSelect',
    component: () => import('./views/teacher/BatchSelect.vue'),
    meta: { mobile: true, role: 'teacher', title: '批量审核' },
  },
  {
    path: '/m/teacher/batch/confirm',
    name: 'MobileTeacherBatchConfirm',
    component: () => import('./views/teacher/BatchConfirm.vue'),
    meta: { mobile: true, role: 'teacher', title: '确认批量审核' },
  },
  {
    path: '/m/teacher/assign/new',
    name: 'MobileTeacherAssignWizard',
    component: () => import('./views/teacher/AssignWizard.vue'),
    meta: { mobile: true, role: 'teacher', title: '布置作业' },
  },
  {
    path: '/m/teacher/questions',
    name: 'MobileTeacherQuestions',
    component: () => import('./views/teacher/Questions.vue'),
    meta: { mobile: true, role: 'teacher', title: '题库' },
  },
  {
    path: '/m/teacher/classes/:classId',
    name: 'MobileTeacherClass',
    component: () => import('./views/teacher/Class.vue'),
    meta: { mobile: true, role: 'teacher', title: '班级详情' },
  },
  {
    path: '/m/teacher/profile',
    name: 'MobileTeacherProfile',
    component: () => import('./views/teacher/Profile.vue'),
    meta: { mobile: true, role: 'teacher', title: '我的' },
  },
  {
    path: '/m/teacher/code/unsupported',
    name: 'MobileTeacherCodeUnsupported',
    component: () => import('./views/teacher/CodeUnsupported.vue'),
    meta: { mobile: true, role: 'teacher', title: '手机编辑说明' },
  },

  /* ---------------------------------------------------------------- /m 兜底 404（必须在最后；不匹配 /m/admin 的注册路由） */
  {
    path: '/m/:pathMatch(.*)*',
    name: 'MobileNotFound',
    component: () => import('./views/public/Error404.vue'),
    meta: { mobile: true, public: true, title: '页面不存在' },
  },
];

/** /m 下的公开路径（未登录可访问；守卫用） */
export const MOBILE_PUBLIC_PATHS = [
  '/m',
  '/m/login',
  '/m/doc',
  '/m/404',
  '/m/403',
  '/m/500',
  '/m/platform/install',
  '/m/platform/splash',
  '/m/platform/states',
];

/** 角色首页（登录成功 / 越权重定向目标） */
export function mobileHomePath(role) {
  if (role === 'student') return '/m/student/home';
  if (role === 'teacher') return '/m/teacher/home';
  return '/m';
}

export default mobileRoutes;
