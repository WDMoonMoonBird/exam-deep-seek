import { createRouter, createWebHistory } from 'vue-router';
import { mobileRoutes, MOBILE_PUBLIC_PATHS, mobileHomePath } from '../mobile/routes.js';

const routes = [
  // 欢迎 / 介绍主页：公开路由（见下方 beforeEach 的白名单）。未登录可浏览；
  // 已登录也留在本页（主按钮由「教师登录」变为「进入控制台」，按角色进各自首页），不强制跳走。
  { path: '/', component: () => import('../views/Landing.vue') },
  { path: '/login', component: () => import('../views/Login.vue') },
  {
    path: '/admin',
    component: () => import('../views/admin/Layout.vue'),
    meta: { role: 'super_admin' },
    children: [
      { path: '', redirect: '/admin/schools' },
      { path: 'schools', component: () => import('../views/admin/Schools.vue') },
      { path: 'classes', component: () => import('../views/admin/Classes.vue') },
      { path: 'teachers', component: () => import('../views/admin/Teachers.vue') },
      { path: 'students', component: () => import('../views/admin/Students.vue') },
      { path: 'monitor', component: () => import('../views/admin/Monitor.vue') },
      { path: 'grading-runs', component: () => import('../views/admin/GradingRuns.vue') },
      { path: 'ai-config', component: () => import('../views/admin/AiConfig.vue') },
    ],
  },
  {
    path: '/teacher',
    component: () => import('../views/teacher/Layout.vue'),
    meta: { role: 'teacher' },
    children: [
      { path: '', redirect: '/teacher/classes' },
      { path: 'classes', component: () => import('../views/teacher/Classes.vue') },
      { path: 'students', component: () => import('../views/teacher/Students.vue') },
      { path: 'questions', component: () => import('../views/teacher/Questions.vue') },
      { path: 'assignments', component: () => import('../views/teacher/Assignments.vue') },
      { path: 'questions/new/project', name: 'TeacherQuestionProjectNew', component: () => import('../views/teacher/ProjectQuestionEdit.vue') },
      { path: 'questions/:id/edit-project', name: 'TeacherQuestionProjectEdit', component: () => import('../views/teacher/ProjectQuestionEdit.vue') },
      { path: 'questions/new', component: () => import('../views/teacher/QuestionEdit.vue') },
      { path: 'questions/:id/edit', component: () => import('../views/teacher/QuestionEdit.vue') },
      { path: 'review', component: () => import('../views/teacher/Review.vue') },
      { path: 'review/class/:classId', component: () => import('../views/teacher/ReviewClass.vue') },
      { path: 'teams', component: () => import('../views/teacher/Teams.vue') },
      { path: 'teams/:id', component: () => import('../views/teacher/TeamEdit.vue') },
      { path: 'review/:id', component: () => import('../views/teacher/ReviewDetail.vue') },
      { path: 'review/project/:submissionId', name: 'TeacherProjectReviewNew', component: () => import('../views/teacher/ProjectReviewNew.vue') },
      // 规则质量：2026-10-11 按用户要求【暂时取消】→ 改为重定向，直接输入 URL 也不会打开该页。
      // 恢复：删掉本行 redirect，还原为
      //   { path: 'rule-quality', name: 'TeacherRuleQuality', component: () => import('../views/teacher/RuleQuality.vue') },
      { path: 'rule-quality', redirect: '/teacher/review' },
    ],
  },
  {
    path: '/student',
    component: () => import('../views/student/Layout.vue'),
    meta: { role: 'student' },
    children: [
      { path: '', redirect: '/student/assignments' },
      { path: 'assignments', component: () => import('../views/student/Assignments.vue') },
      { path: 'assignments/:id', component: () => import('../views/student/Submit.vue') },
      { path: 'assignments/:assignmentId/project/:questionId', name: 'StudentProjectQuestion', component: () => import('../views/teacher/ProjectQuestionEdit.vue'), props: { mode: 'student' } },
      { path: 'scores', component: () => import('../views/student/Scores.vue') },
    ],
  },
  { path: '/doc', component: () => import('../views/Doc.vue') },
  // 手册交互演示预览（公开：把所有 manual/sections 列出来，便于逐个验收）
  { path: '/doc/demos', component: () => import('../views/DocDemoPreview.vue') },
  // /m 移动端 v1 路由（全部懒加载；不注册任何 /m/admin/**，管理端 v1 后置 D12）。
  // 必须位于桌面 catch-all 之前：/m 的未知路径由 mobileRoutes 内的 /m/:pathMatch 兜底到移动 404。
  ...mobileRoutes,
  { path: '/:pathMatch(.*)*', redirect: '/login' },
];

const router = createRouter({
  history: createWebHistory('/exam/'),
  routes,
});

/**
 * 读取登录态（口径与桌面守卫一致：token + user 同时存在才算已登录；localStorage 不可用视为未登录）
 */
function readAuthState() {
  let token = null;
  let user = null;
  try {
    token = localStorage.getItem('token');
    user = JSON.parse(localStorage.getItem('user'));
  } catch { /* localStorage 不可用 */ }
  return { token, user: user && typeof user === 'object' ? user : null };
}

/**
 * /m 移动端守卫（只对 /m 路径生效；桌面路由/守卫行为不变）。
 *
 * 契约（10-v1-implementation-contract.md §3）：
 *   · 未登录访问受保护页 -> /m/login，并带 redirect 以便登录后回跳；
 *   · 角色不符 -> /m/403（保留登录态，不踢回桌面 /login）；
 *   · 超级管理员访问 /m -> /m/403?reason=admin（移动端不提供管理端，提示使用电脑端）；
 *   · /m 未知路径 -> mobileRoutes 内的 /m/:pathMatch 兜底 404（公开，不会被桌面 catch-all 吞掉）。
 */
function resolveMobileNavigation(to) {
  const { token, user } = readAuthState();
  const role = user && user.role ? user.role : '';
  const isLoggedIn = !!(token && user);

  // 已登录超管：不提供移动管理端；/m/403 自身放行避免重定向循环
  if (isLoggedIn && role === 'super_admin') {
    if (to.path === '/m/403') return true;
    return { path: '/m/403', query: { reason: 'admin' } };
  }

  // /m 兜底 404：公开（未登录也能看到「页面不存在」，而不是被重定向到登录页）
  if (to.name === 'MobileNotFound') return true;

  // 公开页（官网/登录/文档/错误页/平台状态页）
  if (MOBILE_PUBLIC_PATHS.indexOf(to.path) >= 0) {
    // 已登录学生/教师访问 /m/login：回自己的移动首页；带 redirect 时仅接受 /m/ 站内地址（防开放重定向）
    if (to.path === '/m/login' && isLoggedIn && (role === 'student' || role === 'teacher')) {
      const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '';
      const safeRedirect = redirect.indexOf('/m/') === 0 && redirect.indexOf('/m/login') !== 0 ? redirect : '';
      return safeRedirect || mobileHomePath(role);
    }
    return true;
  }

  // 受保护页：未登录 -> 移动登录页（带目标地址回跳）
  if (!isLoggedIn) {
    return { path: '/m/login', query: { redirect: to.fullPath } };
  }
  // 未知角色（非学生/教师）-> 403
  if (role !== 'student' && role !== 'teacher') {
    return { path: '/m/403' };
  }
  // 角色不匹配（学生访问教师页 / 教师访问学生页）-> 403
  if (to.meta && to.meta.role && to.meta.role !== role) {
    return { path: '/m/403' };
  }
  return true;
}

router.beforeEach((to) => {
  // /m 移动端单独一套守卫；两侧互不影响（桌面 entry 永远不进入本分支）
  if (to.path === '/m' || to.path.indexOf('/m/') === 0) {
    return resolveMobileNavigation(to);
  }

  let token = null;
  let user = null;
  try {
    token = localStorage.getItem('token');
    user = JSON.parse(localStorage.getItem('user'));
  } catch { /* localStorage 不可用 */ }

  if (to.path === '/login') {
    if (token && user) {
      return `/${user.role === 'super_admin' ? 'admin' : user.role}`;
    }
    return true;
  }

  // 公开页：欢迎页与使用文档不需要登录态（欢迎页自身按登录态切换主按钮文案/去向）
  if (to.path === '/' || to.path === '/doc' || to.path === '/doc/demos') {
    return true;
  }

  if (!token || !user) {
    return '/login';
  }

  if (to.meta.role && to.meta.role !== user.role) {
    return '/login';
  }

  return true;
});

export default router;
