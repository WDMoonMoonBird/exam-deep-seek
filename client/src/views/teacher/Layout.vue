<template>
  <div>
    <a-layout class="layout">
        <a-layout-sider v-model:collapsed="collapsed" :trigger="null" collapsible :width="160" :collapsedWidth="sidebarCollapsedWidth" breakpoint="lg">
            <div class="logo">
                <img src="../../assets/logo.svg" class="logo-img" alt="logo" />
                <span v-show="!collapsed" class="logo-text"><span class="logo-line1">Deadpan</span><span class="logo-line2">判题</span></span>
            </div>
            <a-menu v-model:selectedKeys="selectedKeys" theme="dark" mode="inline" @click="onMenuClick">
                <a-menu-item key="/teacher/classes"><template #icon>
                        <AppstoreOutlined />
                    </template><span>班级管理</span></a-menu-item>
                <a-menu-item key="/teacher/students"><template #icon>
                        <IdcardOutlined />
                    </template><span>学生管理</span></a-menu-item>
                <a-menu-item key="/teacher/teams"><template #icon>
                        <TeamOutlined />
                    </template><span>教学团队</span></a-menu-item>
                <a-menu-item key="/teacher/questions"><template #icon>
                        <DatabaseOutlined />
                    </template><span>题库管理</span></a-menu-item>
                <a-menu-item key="/teacher/assignments"><template #icon>
                        <FileTextOutlined />
                    </template><span>作业管理</span></a-menu-item>
                <a-menu-item key="/teacher/review"><template #icon>
                        <SafetyCertificateOutlined />
                    </template><span>评分审核</span></a-menu-item>
                <a-menu-item key="/teacher/projects"><template #icon>
                        <ExperimentOutlined />
                    </template><span>实训任务</span></a-menu-item>
            </a-menu>
        </a-layout-sider>
        <a-layout>
            <a-layout-header class="topbar">
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

    <a-modal v-model:open="showProfile" :width="420" :footer="null" :destroyOnClose="true" @cancel="resetPwdForm">
      <div class="profile-card">
        <a-avatar :size="56" style="background:var(--blue);font-size:24px;margin-bottom:16px;">{{ user?.realName?.charAt(0) }}</a-avatar>
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

    <a-modal v-model:open="showFlowModal" :width="1040" :footer="null" :destroyOnClose="true" @cancel="flowStep = 0" :bodyStyle="{ padding: '16px 24px' }" wrap-class-name="flow-modal-wrap">
      <template #title>
        <QuestionCircleOutlined style="color:#1677ff;margin-right:8px;" />AI 评分流程
      </template>
      <a-steps :current="flowStep" size="small" :items="flowItems" style="margin:12px 0 16px;" />
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
import { ref, reactive, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/user.js';
import request from '../../api/request.js';
import { Modal, message } from 'ant-design-vue';
import { QuestionCircleOutlined, UserOutlined, NodeIndexOutlined, UserSwitchOutlined, PoweroffOutlined, AppstoreOutlined, IdcardOutlined, DatabaseOutlined, FileTextOutlined, SafetyCertificateOutlined, TeamOutlined, BookOutlined, ExperimentOutlined, MenuFoldOutlined, MenuUnfoldOutlined, CaretDownOutlined } from '@ant-design/icons-vue';

const router = useRouter(); const route = useRoute(); const userStore = useUserStore();
const user = userStore.user;
const collapsed = ref(false);
const sidebarCollapsedWidth = ref(window.innerWidth < 992 ? 0 : 80);
window.addEventListener('resize', () => { sidebarCollapsedWidth.value = window.innerWidth < 992 ? 0 : 80; });
const selectedKeys = ref([route.path]);
const showFlowModal = ref(false);
const showProfile = ref(false);
const pwdActiveKey = ref([]);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const changingPwd = ref(false);

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
        Modal.confirm({ title: '确定退出登录？', content: '退出后需重新输入用户名和密码', okText: '确定', cancelText: '取消', onOk: () => { userStore.logout(); router.push('/login'); } });
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
    gap: 10px;
    height: 64px;
    padding: 0 24px;
    overflow: hidden;
    white-space: nowrap;
}

.logo-img {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
}

.logo-text {
    color: #fff;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: -0.28px;
    display: flex; flex-direction: column; line-height: 1.2;
}
.logo-line1 { font-size: 14px; opacity: 0.85; }
.logo-line2 { font-size: 18px; }

.topbar {
    background: rgba(255, 255, 255, 0.92);
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.15);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
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
    font-size: 18px;
    line-height: 52px;
    padding: 0 12px;
    cursor: pointer;
    transition: color 0.3s;
}

.trigger:hover {
    color: var(--blue);
}

.user-area {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
}

.user-avatar {
    background: var(--blue);
    flex-shrink: 0;
}

.user-name {
    font-size: 14px;
    color: var(--ink);
}

.user-school {
    color: var(--ink-muted);
}

.user-caret {
    font-size: 10px;
    color: var(--ink-muted);
}

.content {
    padding: 80px 48px 40px;
    background: var(--canvas-parchment);
    overflow-y: auto;
    height: 100%;
}

.flow-content {
  padding: 24px 16px; min-height: 80px;
  background: #fafafa; border: 1px dashed #e9e9e9;
  border-radius: 6px; font-size: 13px; color: #555; line-height: 1.8;
  white-space: pre-wrap; font-family: inherit;
}
.flow-content.step-center {
  display: flex; align-items: center; justify-content: center;
  text-align: center;
}
.flow-actions { display: flex; gap: 8px; margin-top: 16px; }

.profile-card { text-align: center; }
.profile-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
.profile-label { color: var(--ink-muted); }
.profile-card :deep(.ant-collapse-header) { text-align: left; color: var(--blue); font-size: 14px; }

@media (max-width: 768px) {
  .topbar { padding: 0 12px; }
  .content { padding: 72px 12px 24px; }
  .user-name { display: none; }
  .ant-table { font-size: 13px; }
}
</style>
<style>
.flow-modal-wrap .ant-modal { max-width: 1040px; }
@media (max-width: 768px) {
  .flow-modal-wrap .ant-modal { max-width: 100vw; }
}
</style>
