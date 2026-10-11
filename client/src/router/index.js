import { createRouter, createWebHistory } from 'vue-router';

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
  { path: '/:pathMatch(.*)*', redirect: '/login' },
];

const router = createRouter({
  history: createWebHistory('/exam/'),
  routes,
});

router.beforeEach((to) => {
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
  if (to.path === '/' || to.path === '/doc') {
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
