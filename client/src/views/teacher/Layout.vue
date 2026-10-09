<template>
  <div class="app-shell" data-density="compact">
    <a-layout class="layout">
        <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="SIDER_WIDTH" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg">
            <div class="logo">
                <img src="../../assets/logo.svg" class="logo-img" alt="logo" />
                <span v-show="!collapsed" class="logo-text"><span class="logo-line1">Deadpan</span><span class="logo-line2">判题</span></span>
            </div>
            <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline" @click="onMenuClick">
                <!-- 导航分组与顺序：docs/ui-redesign/01-information-architecture.md §2.2 -->
                <a-menu-item-group key="teaching" title="教学">
                    <a-menu-item key="/teacher/assignments"><template #icon>
                            <FileTextOutlined />
                        </template><span>作业管理</span></a-menu-item>
                    <a-menu-item key="/teacher/review"><template #icon>
                            <SafetyCertificateOutlined />
                        </template><span>评分审核</span>
                        <span v-if="pendingReview > 0" class="sider-badge tnum" :title="pendingTitle">{{ pendingBadge }}</span>
                    </a-menu-item>
                    <a-menu-item key="/teacher/questions"><template #icon>
                            <DatabaseOutlined />
                        </template><span>题库管理</span></a-menu-item>
                </a-menu-item-group>
                <a-menu-item-group key="organization" title="组织">
                    <a-menu-item key="/teacher/classes"><template #icon>
                            <AppstoreOutlined />
                        </template><span>班级管理</span></a-menu-item>
                    <a-menu-item key="/teacher/students"><template #icon>
                            <IdcardOutlined />
                        </template><span>学生管理</span></a-menu-item>
                    <a-menu-item key="/teacher/teams"><template #icon>
                            <TeamOutlined />
                        </template><span>教学团队</span></a-menu-item>
                </a-menu-item-group>
            </a-menu>
        </a-layout-sider>
        <a-layout>
            <a-layout-header class="topbar app-topbar">
                <div class="topbar-left">
                    <MenuUnfoldOutlined v-if="collapsed" class="trigger" @click="collapsed = false" />
                    <MenuFoldOutlined v-else class="trigger" @click="collapsed = true" />
                </div>
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
                            <a-menu-item key="logout"><PoweroffOutlined /> 退出登录</a-menu-item>
                        </a-menu>
                    </template>
                </a-dropdown>
            </a-layout-header>
            <a-layout-content class="content">
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
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user.js';
import request from '../../api/request.js';
import { message } from 'ant-design-vue';
import { useConfirm } from '../../composables/useConfirm.js';
import { QuestionCircleOutlined, UserOutlined, NodeIndexOutlined, UserSwitchOutlined, PoweroffOutlined, AppstoreOutlined, IdcardOutlined, DatabaseOutlined, FileTextOutlined, SafetyCertificateOutlined, TeamOutlined, BookOutlined, ExperimentOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CaretDownOutlined } from '@ant-design/icons-vue';

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const { confirm } = useConfirm();
const user = userStore.user;
const collapsed = ref(false);

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

/* 侧栏徽标：待审核数（深色侧栏上的 danger 三元组，见 03-components.md §3.4） */
.sider-badge {
    flex: none;
    margin-inline-start: auto;
    min-width: var(--tag-h);
    height: var(--tag-h);
    padding: 0 var(--tag-pad-x);
    border-radius: var(--radius-pill);
    background: var(--status-danger-bg);
    color: var(--status-danger-fg);
    font-size: var(--tag-fs);
    line-height: var(--tag-h);
    font-weight: var(--fw-semibold);
    text-align: center;
}
/* 折叠态：与文字一起隐藏（antd 会把 title-content 置为透明，这里对徽标兜底） */
.layout :deep(.ant-layout-sider-collapsed .sider-badge) { display: none; }

.flow-title-icon { color: var(--brand-600); margin-right: var(--space-2); }
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
