<template>
  <div class="app-shell" data-density="compact">
    <!-- B3-1 ⑤ 跳过导航直达主内容（默认视觉隐藏=不参与布局；Tab 聚焦时出现在左上角） -->
    <a class="skip-link" href="#main-content">跳到主内容</a>
    <a-layout class="layout">
        <!-- role=complementary：antd 的 a-layout 渲染为 <section>，HTML-AAM 会把 section 内的 <aside> 降级为 generic
             （CDP 实测 role=generic）→ 显式补 landmark，region 违规才消除；aria-label 给地标命名。 -->
        <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="SIDER_WIDTH" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg" role="complementary" aria-label="侧栏">
            <div class="logo">
                <img src="../../assets/logo.svg" class="logo-img" alt="logo" />
                <span v-show="!collapsed" class="logo-text"><span class="logo-line1">Deadpan</span><span class="logo-line2">判题</span></span>
            </div>
            <a-menu ref="navMenuRef" v-model:selectedKeys="selectedKeys" theme="dark" mode="inline" @click="onMenuClick">
                <!-- 导航分组与顺序：docs/ui-redesign/01-information-architecture.md §2.2
                     分组标题不用 a-menu-item-group：它渲染出的 li/ul 无 role，会打断 menuitem 的 ARIA 父子链，
                     产生 axe 的 aria-required-children / aria-required-parent / list / listitem 四类违规
                     （证据：tests/ui-redesign-verify/artifacts/T5-a11y.json，targets=.ant-menu 与 li[data-menu-id]）。
                     antd 的 Menu 会原样渲染 slot 子节点（es/menu/src/Menu.js 的 flattenChildren），
                     故改用 role=presentation 的标题 div（沿用 antd 的标题类名以保持视觉不变）。 -->
                <div key="g-teaching" role="presentation" class="ant-menu-item-group-title">教学</div>
                    <a-menu-item key="/teacher/assignments"><template #icon>
                            <FileTextOutlined />
                        </template><span>作业管理</span></a-menu-item>
                    <a-menu-item key="/teacher/review"><template #icon>
                            <SafetyCertificateOutlined />
                        </template><span>评分审核</span>
                        <span v-if="pendingReview > 0" class="sider-badge tnum" :title="pendingTitle">{{ pendingBadge }}</span>
                    </a-menu-item>
                    <!-- 规则质量（来自 feature/rule-driven-scoring 的合并：按其原意归入「教学」组，紧跟评分审核） -->
                    <a-menu-item key="/teacher/rule-quality"><template #icon>
                            <LineChartOutlined />
                        </template><span>规则质量</span></a-menu-item>
                    <a-menu-item key="/teacher/questions"><template #icon>
                            <DatabaseOutlined />
                        </template><span>题库管理</span></a-menu-item>
                <div key="g-organization" role="presentation" class="ant-menu-item-group-title">组织</div>
                    <a-menu-item key="/teacher/classes"><template #icon>
                            <AppstoreOutlined />
                        </template><span>班级管理</span></a-menu-item>
                    <a-menu-item key="/teacher/students"><template #icon>
                            <IdcardOutlined />
                        </template><span>学生管理</span></a-menu-item>
                    <a-menu-item key="/teacher/teams"><template #icon>
                            <TeamOutlined />
                        </template><span>教学团队</span></a-menu-item>
            </a-menu>
        </a-layout-sider>
        <a-layout>
            <!-- role=banner：同上，<section> 内的 <header> 被降级为 sectionheader（CDP 实测）→ 显式补 banner 地标 -->
            <a-layout-header class="topbar app-topbar" role="banner">
                <div class="topbar-left">
                    <MenuUnfoldOutlined v-if="collapsed" class="trigger" @click="collapsed = false" />
                    <MenuFoldOutlined v-else class="trigger" @click="collapsed = true" />
                </div>
                <ThemeToggle />
                <a-dropdown>
                    <div class="user-area">
                        <a-avatar size="small" class="user-avatar">{{ user?.realName?.charAt(0) }}</a-avatar>
                        <span class="user-name"><span v-if="userStore.currentSchool">{{ userStore.currentSchool.name }}
                                ·
                            </span>教师</span>
                        <CaretDownOutlined class="user-caret" />
                    </div>
                    <template #overlay>
                        <a-menu @click="handleMenu">
                            <a-menu-item key="profile"><UserOutlined /> 我的信息</a-menu-item>
                            <a-sub-menu key="switch" title="切换单位" v-if="userStore.teacherSchools.length > 1">
                                <template #icon><UserSwitchOutlined /></template>
                                <a-menu-item v-for="s in userStore.teacherSchools" :key="'school-' + s.id"
                                    @click="switchSchool(s)">{{ s.name }}</a-menu-item>
                            </a-sub-menu>
                            <a-menu-item key="flow"><NodeIndexOutlined /> AI 评分流程</a-menu-item>
                            <a-menu-item key="doc"><BookOutlined /> 使用文档</a-menu-item>
                            <a-sub-menu key="theme" title="主题">
                                <template #icon><BulbOutlined /></template>
                                <a-menu-item key="theme-light">浅色{{ themeMode === 'light' ? ' ✓' : '' }}</a-menu-item>
                                <a-menu-item key="theme-dark">深色{{ themeMode === 'dark' ? ' ✓' : '' }}</a-menu-item>
                                <a-menu-item key="theme-system">跟随系统{{ themeMode === 'system' ? ' ✓' : '' }}</a-menu-item>
                            </a-sub-menu>
                            <a-menu-item key="logout"><PoweroffOutlined /> 退出登录</a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>
            </a-layout-header>
            <a-layout-content class="content" id="main-content" ref="mainRef">
                <!-- B3-1 ⑤ 页面 H1：镜像当前页真实标题（页内标题元素 → 侧栏菜单名兜底；非通用词），视觉隐藏 -->
                <h1 v-if="pageTitle" class="visually-hidden">{{ pageTitle }}</h1>
                <router-view v-slot="{ Component }">
                    <transition name="tab-fade" mode="out-in">
                        <component :is="Component" />
                    </transition>
                </router-view>
            </a-layout-content>
        </a-layout>
    </a-layout>

    <a-modal v-model:open="showProfile" :width="480" :footer="null" :destroyOnClose="true" @cancel="resetPwdForm">
      <div class="profile-card">
        <a-avatar :size="56" class="profile-avatar">{{ user?.realName?.charAt(0) }}</a-avatar>
        <div class="profile-row"><span class="profile-label">姓名</span><span>{{ user?.realName }}</span></div>
        <div class="profile-row"><span class="profile-label">工号</span><span>{{ user?.username }}</span></div>
        <div class="profile-row"><span class="profile-label">当前单位</span><span>{{ userStore.currentSchool?.name || '未绑定' }}</span></div>
        <a-divider />
        <a-collapse v-model:activeKey="pwdActiveKey" :bordered="false" style="background:transparent;">
          <a-collapse-panel key="pwd" header="修改密码">
            <a-form layout="vertical" :model="pwdForm" size="small">
              <a-form-item label="原密码"><a-input-password v-model:value="pwdForm.oldPassword" /></a-form-item>
              <a-form-item label="新密码"><a-input-password v-model:value="pwdForm.newPassword" /></a-form-item>
              <a-form-item label="确认新密码"><a-input-password v-model:value="pwdForm.confirmPassword" /></a-form-item>
              <a-button type="primary" :loading="changingPwd" block @click="changePassword">确认修改</a-button>
            </a-form>
          </a-collapse-panel>
        </a-collapse>
      </div>
    </a-modal>

    <!-- 工作流/内容型弹窗：captain 2026-10-09 定案作为第四档 1040 保留。
             与页面下方非 scoped 的 .flow-modal-wrap 规则成对维护：改这里的 :width 必须同步改那条 max-width
             （对齐 views/teacher/Assignments.vue 的 .assign-modal 写法） -->
    <a-modal v-model:open="showFlowModal" :width="1040" :footer="null" :destroyOnClose="true" @cancel="flowStep = 0" :bodyStyle="{ padding: 'var(--space-4) var(--space-6)' }" wrap-class-name="flow-modal-wrap">
      <template #title>
        <QuestionCircleOutlined class="flow-title-icon" />AI 评分流程
      </template>
      <a-steps :current="flowStep" size="small" :items="flowItems" class="flow-steps" />
      <div class="flow-content" :class="{ 'step-center': flowStep !== 2 }">{{ flowSteps[flowStep].content }}</div>
      <div class="flow-actions">
        <a-button v-if="flowStep > 0" @click="flowStep--">上一步</a-button>
        <a-button v-if="flowStep < flowSteps.length - 1" type="primary" @click="flowStep++">下一步</a-button>
        <a-button v-if="flowStep === flowSteps.length - 1" type="primary" @click="showFlowModal = false; flowStep = 0;">完成</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUpdated, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user.js';
import request from '../../api/request.js';
import { message } from 'ant-design-vue';
import { useConfirm } from '../../composables/useConfirm.js';
import { useTheme } from '../../composables/useTheme.js';
import ThemeToggle from '../../components/ThemeToggle.vue';
import { QuestionCircleOutlined, UserOutlined, NodeIndexOutlined, UserSwitchOutlined, PoweroffOutlined, AppstoreOutlined, IdcardOutlined, DatabaseOutlined, FileTextOutlined, SafetyCertificateOutlined, TeamOutlined, BookOutlined, ExperimentOutlined, BulbOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CaretDownOutlined, LineChartOutlined } from '@ant-design/icons-vue';

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const { confirm } = useConfirm();
const { mode: themeMode, setMode } = useTheme();
const user = userStore.user;
const collapsed = ref(false);

/* ===== B3-1 ⑤ 无障碍骨架：页面 H1 + 地标 + skip-link =====
 * page-has-heading-one（改前每页 1 命中）：Layout 不自造标题，而是**镜像当前页的真实标题**——
 *   ① 优先读主内容区里的页内标题元素（PageShell 的 .page-title / 详情页的 .rp-title/.pr-title/.sp-title）；
 *   ② 取不到时退化为侧栏菜单里当前路由那一条的菜单名（仍是真实标题，不是「页面」「内容」这类通用词）。
 * 隐藏方式复用全局 .visually-hidden（不参与布局 → 几何与截图不变）。 */
const mainRef = ref(null);
const pageTitle = ref('');
const MENU_TITLES = {
  '/teacher/assignments': '作业管理', '/teacher/review': '评分审核', '/teacher/questions': '题库管理',
  '/teacher/classes': '班级管理', '/teacher/students': '学生管理', '/teacher/teams': '教学团队',
  '/teacher/rule-quality': '规则质量',
};
function syncPageTitle() {
  // a-layout-content 是 antd 组件：模板 ref 拿到组件实例，$el 才是它渲染的 <main> 元素
  const root = (mainRef.value && mainRef.value.$el) || mainRef.value;
  if (!root || typeof root.querySelector !== 'function') return;
  const el = root.querySelector('.page-title, .rp-title, .pr-title, .sp-title, h1:not(.visually-hidden), h2:not(.visually-hidden)');
  let t = el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  if (!t) {
    const seg = '/' + route.path.split('/').filter(Boolean).slice(0, 2).join('/');
    t = MENU_TITLES[seg] || '';
  }
  pageTitle.value = t.slice(0, 60);
}

/** 侧栏宽度取自令牌：232 / 折叠 64（docs/ui-redesign/03-components.md §3.4） */
const SIDER_WIDTH = 'var(--layout-sider-w)';
const SIDER_COLLAPSED_WIDTH = 'var(--layout-sider-w-collapsed)';
/** <992px 时侧栏完全收起（保持原有响应式行为，宽度仍由令牌决定） */
const sidebarCollapsedWidth = ref(window.innerWidth < 992 ? 0 : SIDER_COLLAPSED_WIDTH);
window.addEventListener('resize', () => { sidebarCollapsedWidth.value = window.innerWidth < 992 ? 0 : SIDER_COLLAPSED_WIDTH; });
const selectedKeys = ref([route.path]);
const showFlowModal = ref(false);
const showProfile = ref(false);
const pwdActiveKey = ref([]);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const changingPwd = ref(false);

// ===== 侧栏「评分审核」待审核徽标 =====
/**
 * 数据源：GET /teacher/pending-summary（Batch1 P0-1，与「评分审核」页、作业管理 KPI 同源）。
 * Wave 2 t13 / R-1：徽标是辅助信息，失败不得弹提示打断教师 —— 走统一请求入口 + silent 开关
 * （api/request.js 的响应拦截器对 silent 请求只 reject、不弹全局 message）。
 */
const pendingReview = ref(0);
const pendingBadge = computed(() => (pendingReview.value > 99 ? '99+' : String(pendingReview.value)));
const pendingTitle = computed(() => `待审核 ${pendingReview.value} 条`);

/** 进入 Layout 拉取一次 + 每次路由切换后刷新；失败保留上一次数值并静默 */
async function refreshPendingReview() {
  try {
    const r = await request.get('/teacher/pending-summary', { silent: true });
    pendingReview.value = Number(r.data?.pendingReview) || 0;
  } catch (e) { /* 静默：不弹提示、不打断当前页面 */ }
}

onMounted(() => { refreshPendingReview(); });

/**
 * T7-O2（QA §3.4「侧栏键盘不可达」）：antd 把菜单项渲染成 li[role=menuitem][tabindex=-1]，
 * 而 ul.ant-menu 默认不可聚焦 → 实测 Tab 循环为 body → 主题按钮 → 筛选框 → 分页 → body，
 * 侧栏 0 命中（按键轨迹见 tests/ui-redesign-verify/b2-contrast/raw/before.json 的 T7O2.tabTrace）。
 * 最小修复：① 菜单容器给一个 Tab 停靠点 + 可读名称；② 容器获得焦点后方向键在菜单项间移动焦点
 * （Enter/Space 激活仍由菜单项自身处理，实测可导航到目标路由）。
 * 不改 DOM 结构、不改 ARIA 角色，菜单项维持 roving tabindex=-1（与 role=menu 模式一致）。
 * 为何用 ref 写属性：tabindex 是 antd Menu 的具名 prop（es/menu/src/Menu.js:42）且组件内部未使用，
 * 写在模板里会被这个 prop 吸收、透传不到 ul。
 */
const navMenuRef = ref(null);
/** ⑤ 标题镜像：挂载后、每次更新后、路由变化后各同步一次（查询很轻，无副作用） */
onMounted(() => { syncPageTitle(); });
onUpdated(syncPageTitle);
watch(() => route.path, () => nextTick(syncPageTitle));

onMounted(() => {
  const el = navMenuRef.value && navMenuRef.value.$el;
  if (!el || !el.setAttribute) return;
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', '主导航菜单');
  el.addEventListener('keydown', onMenuKeydown);
});
function onMenuKeydown(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.prototype.slice.call((e.currentTarget || e.target).querySelectorAll('.ant-menu-item:not(.ant-menu-item-disabled)'));
  if (!items.length) return;
  e.preventDefault();
  const cur = items.indexOf(document.activeElement);
  const step = e.key === 'ArrowDown' ? 1 : -1;
  const next = cur < 0 ? (step > 0 ? 0 : items.length - 1) : (cur + step + items.length) % items.length;
  items[next].focus();
}

function resetPwdForm() {
  pwdActiveKey.value = [];
  pwdForm.oldPassword = '';
  pwdForm.newPassword = '';
  pwdForm.confirmPassword = '';
}
async function changePassword() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) return message.warn('请填写密码');
  if (pwdForm.newPassword !== pwdForm.confirmPassword) return message.warn('两次新密码不一致');
  changingPwd.value = true;
  try {
    await request.put('/auth/password', { oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
    message.success('密码修改成功');
    resetPwdForm();
  } catch (e) {
    message.error(e?.response?.data?.message || '修改失败');
  } finally { changingPwd.value = false; }
}

const flowStep = ref(0);
const flowSteps = [
  { title: '学生提交', content: '学生在答题页选择语言、编写代码后提交，状态变为"待评分"。' },
  { title: 'Worker 获取', content: '评分 Worker 每 2 秒轮询数据库，批量获取最多 8 条待评分提交，以 8 并发方式并行调用 AI。' },
  { title: '构建提示词', content: 'System:\n你是一名高校计算机专业教师。你需要根据题目要求、参考答案和学生提交的代码，给出公正的评分和具体的改进意见。\n\n评分标准：\n{教师自定义 或 默认三标准}\n\nUser:\n## 题目材料（如有）\n{材料内容}\n\n## {小题标题}\n{小题内容}\n\n## 参考答案\n{参考答案代码}\n\n## 学生提交的代码\n{学生代码}\n\n## 评分要求\n满分：{分值} 分' },
  { title: 'AI 评分', content: 'AI 返回 JSON 包含 score（分数）和 feedback（评语），解析后存入数据库，状态变为"AI 已评分"。' },
  { title: '实时推送', content: '评分完成后通过内部 HTTP 回调通知主进程，主进程通过 WebSocket 推送给教师审核页面，无需手动刷新。' },
  { title: '教师审核', content: '教师可在审核页面查看 AI 评分，支持修改最终分数并填写评语，审核通过后发布给学生。' },
];
const flowItems = flowSteps.map(s => ({ key: s.title, title: s.title }));
watch(() => route.path, (p) => {
  // 评分审核和题库编辑的子页面保持父级菜单选中
  if (p.startsWith('/teacher/review')) selectedKeys.value = ['/teacher/review'];
  else if (p.startsWith('/teacher/questions/')) selectedKeys.value = ['/teacher/questions'];
  else if (p.startsWith('/teacher/teams')) selectedKeys.value = ['/teacher/teams'];
  else if (p.startsWith('/teacher/projects')) selectedKeys.value = ['/teacher/projects'];
  else selectedKeys.value = [p];
  collapsed.value = p.includes('/teacher/questions/') || p.includes('/teacher/review/') || p.includes('/teacher/projects/');
  // 路由切换后刷新待审核数
  refreshPendingReview();
});
function onMenuClick ({ key }) {
  router.push(key);
  if (window.innerWidth < 992) collapsed.value = true;
}

async function switchSchool (school) {
    await request.put('/teacher/switch-school', { schoolId: school.id });
    userStore.setCurrentSchool(school);
    router.go(0);
}

function handleMenu ({ key }) {
    if (key === 'theme-light') { setMode('light'); return; }
    if (key === 'theme-dark') { setMode('dark'); return; }
    if (key === 'theme-system') { setMode('system'); return; }
    if (key === 'flow') { showFlowModal.value = true; return; }
    if (key === 'doc') { window.open('/exam/doc', '_blank'); return; }
    if (key === 'profile') {
        showProfile.value = true;
    } else if (key === 'logout') {
        confirm({
            title: '确定退出登录？',
            content: '退出后需重新输入用户名和密码',
            okText: '退出登录',
            cancelText: '取消',
            onOk: () => { userStore.logout(); router.push('/login'); },
        });
    }
}
</script>

<style scoped>
.layout {
    height: 100vh;
    overflow: hidden;
}

.layout :deep(.ant-layout) {
    overflow: hidden;
    position: relative;
}

.layout :deep(.ant-layout-sider) {
    overflow-y: auto;
}

.logo {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--layout-topbar-h);
    padding: 0 var(--space-6);
    overflow: hidden;
    white-space: nowrap;
}

.logo-img {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
}

.logo-text {
    color: var(--text-inverse);
    font-family: var(--font-display);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--tracking-tight);
    display: flex; flex-direction: column; line-height: 1.2;
}
.logo-line1 { font-size: var(--fs-body); opacity: 0.85; }
.logo-line2 { font-size: var(--fs-title-2); }

.topbar {
    background: var(--topbar-bg);
    border-bottom: 1px solid var(--topbar-bd);
    /* R-2：容器色令牌化（折叠按钮/分隔点等继承它；现代与 html.legacy 计算值一致，见 18-wave4-verify 证据） */
    color: var(--text-primary);
    padding: 0 var(--space-6);
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--layout-topbar-h);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-topbar);
    transform: translate3d(0, 0, 0);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    backdrop-filter: saturate(180%) blur(20px);
}
@supports not (backdrop-filter: blur(1px)) {
    .topbar {
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
    }
}

.topbar-left {
    display: flex;
    align-items: center;
}

.trigger {
    color: var(--text-primary);
    font-size: var(--fs-title-2);
    line-height: var(--layout-topbar-h);
    padding: 0 var(--space-3);
    cursor: pointer;
    transition: var(--transition-control);
}

.trigger:hover {
    color: var(--text-link);
}

.user-area {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
}

.user-avatar {
    background: var(--brand-600);
    flex-shrink: 0;
}

.user-name {
    font-size: var(--fs-body);
    color: var(--text-primary);
}

.user-school {
    color: var(--text-tertiary);
}

.user-caret {
    font-size: var(--fs-caption);
    color: var(--text-tertiary);
}

.content {
    padding: calc(var(--layout-topbar-h) + var(--space-6)) var(--space-12) var(--space-10);
    background: var(--bg-canvas);
    overflow-y: auto;
    height: 100%;
}

/* 侧栏徽标：待审核数（深色侧栏上的 danger 三元组，见 03-components.md §3.4）
   T4-F5：暗色的 --status-danger-bg 是半透明（rgba(217,45,32,.16)），直接叠在「选中项」实底
   （antd 派生主色 rgb(3,90,176)）上会把背景提亮 → 实测 3.90:1（12px/600 需 4.5:1）。
   这里先铺一层不透明 --sider-bg（侧栏在两种主题下都是深色面），再用同色平铺渐变把半透明层叠上去，
   使合成结果与父级底色无关（暗色 8.88:1）；浅色下 --status-danger-bg 本身不透明（= --red-50），
   底板被完全覆盖 → 视觉零变化（实测仍 6.05:1）。 */
.sider-badge {
    flex: none;
    margin-inline-start: auto;
    min-width: var(--tag-h);
    height: var(--tag-h);
    padding: 0 var(--tag-pad-x);
    border-radius: var(--radius-pill);
    background-color: var(--sider-bg);
    background-image: linear-gradient(var(--status-danger-bg), var(--status-danger-bg));
    color: var(--status-danger-fg);
    font-size: var(--tag-fs);
    line-height: var(--tag-h);
    font-weight: var(--fw-semibold);
    text-align: center;
}
/* 折叠态：与文字一起隐藏（antd 会把 title-content 置为透明，这里对徽标兜底） */
.layout :deep(.ant-layout-sider-collapsed .sider-badge) { display: none; }

.flow-title-icon { color: var(--text-brand); margin-right: var(--space-2); }
.flow-steps { margin: var(--space-3) 0 var(--space-4); }

.flow-content {
  padding: var(--space-6) var(--space-4); min-height: 80px;
  background: var(--bg-surface-2); border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm); font-size: var(--fs-body-sm); color: var(--text-secondary); line-height: var(--lh-body);
  white-space: pre-wrap; font-family: inherit;
}
.flow-content.step-center {
  display: flex; align-items: center; justify-content: center;
  text-align: center;
}
.flow-actions { display: flex; gap: var(--space-2); margin-top: var(--space-4); }

.profile-card { text-align: center; }
.profile-avatar { background: var(--brand-600); font-size: var(--fs-display-2); margin-bottom: var(--space-4); }
.profile-row { display: flex; justify-content: space-between; padding: var(--space-2) 0; font-size: var(--fs-body); }
.profile-label { color: var(--text-tertiary); }
.profile-card :deep(.ant-collapse-header) { text-align: left; color: var(--text-link); font-size: var(--fs-body); }

@media (max-width: 768px) {
  .topbar { padding: 0 var(--space-3); }
  .content { padding: calc(var(--layout-topbar-h) + var(--space-4)) var(--space-3) var(--space-6); }
  .user-name { display: none; }
}
</style>
<style>
.flow-modal-wrap .ant-modal { max-width: 1040px; }
@media (max-width: 768px) {
  .flow-modal-wrap .ant-modal { max-width: 100vw; }
}
</style>
