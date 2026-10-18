<template>
    <!-- ★R3-R5（P1）：首登 / 密码被管理员重置后的**强制改密页**。
         独立于三端 Layout（不挂载侧栏/业务接口）：被 403/1005 闸门拦住的用户也能完成改密、自解拦截。
         普通用户也可从「我的信息」弹窗自愿改密（既有入口保留），本页对两者均可用。 -->
    <main class="cp-page">
        <div class="cp-card">
            <h1 class="cp-title">修改密码</h1>
            <!-- 强制改密（required=1）时说明原因；普通进入只做建议文案 -->
            <p v-if="required" id="cp-required" class="cp-notice" role="alert">
                出于安全要求，首次登录或密码被重置后，需要先修改初始密码才能继续使用其它功能。
            </p>
            <p v-else class="cp-desc">建议定期更换密码。</p>

            <a-form layout="vertical" :model="form" class="cp-form" @submit.prevent>
                <a-form-item>
                    <label for="cp-old" class="visually-hidden">原密码</label>
                    <a-input-password
                        id="cp-old"
                        v-model:value="form.oldPassword"
                        placeholder="原密码（初始密码）"
                        size="large"
                        :aria-describedby="required ? 'cp-required' : undefined"
                        @pressEnter="submit"
                    />
                </a-form-item>
                <a-form-item>
                    <label for="cp-new" class="visually-hidden">新密码</label>
                    <a-input-password
                        id="cp-new"
                        v-model:value="form.newPassword"
                        placeholder="新密码"
                        size="large"
                        @pressEnter="submit"
                    />
                </a-form-item>
                <a-form-item>
                    <label for="cp-confirm" class="visually-hidden">确认新密码</label>
                    <a-input-password
                        id="cp-confirm"
                        v-model:value="form.confirmPassword"
                        placeholder="确认新密码"
                        size="large"
                        @pressEnter="submit"
                    />
                </a-form-item>
                <!-- 规则提示与后端同口径（本地拦截只是提示，后端仍是权威） -->
                <p class="cp-rule">{{ PASSWORD_RULE_TEXT }}</p>
                <a-button type="primary" block size="large" :loading="loading" @click="submit">确认修改</a-button>
                <a-button v-if="!required" type="link" block @click="goHome">返回</a-button>
            </a-form>
            <p v-if="errorMsg" id="cp-error" class="cp-error" role="alert">{{ errorMsg }}</p>
        </div>
    </main>
</template>

<script setup>
/**
 * ChangePassword.vue —— ★R3-R5：强制改密页（P1）
 *
 * 背景：后端闸门（server/src/middleware/auth.js:62）对非学生账号在 mustChangePassword=true 时，
 *   拒绝除 PUT /api/auth/password 外的全部已认证请求（HTTP 403 + code 1005）；登录响应带
 *   user.mustChangePassword（server/src/controllers/authController.js:181）。
 *   桌面端修复前零消费 ⇒ 进业务页后接口连环 403、无统一引导。本页就是统一引导的落点：
 *   · Login.vue：登录成功且 flag=true ⇒ 直接 router.replace 到本页（?required=1）；
 *   · api/request.js：任何业务请求收到 403/1005 ⇒ 去重后跳本页（会话中被管理员重置的场景）；
 *   · 本页只调用白名单端点 PUT /auth/password，因此能在被拦截状态下正常工作。
 *
 * 成功后：后端同一条 update 已清 must_change_password（authController.js 自助改密分支）⇒
 *   本地同步 userStore.user.mustChangePassword=false，并复位 request.js 的 1005 去重标记，
 *   再回角色首页（此后业务请求不再被闸门拦截）。
 */
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import request, { resetPasswordChangeHandled } from '../api/request.js';
import { useUserStore } from '../stores/user.js';
import { PASSWORD_RULE_TEXT, localPasswordIssue } from '../composables/passwordPolicy.js';   // ★R2-B58：与后端同口径
import { errorCopyOf } from '../composables/errorCopy.js';   // ★R2-B55：UI 文案统一出口

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

/** 是否「被强制改密」（Login 跳转 / 1005 兜底都带 required=1）；否 = 用户自愿进入 */
const required = route.query.required === '1';
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const loading = ref(false);
const errorMsg = ref('');

/** 角色首页（与 router 的登录守卫口径一致：super_admin ⇒ /admin，其余 ⇒ /<role>） */
function homePath(user) {
    const role = user && user.role ? user.role : '';
    if (role === 'super_admin') return '/admin';
    return role ? `/${role}` : '/login';
}

function goHome() {
    router.replace(homePath(userStore.user));
}

async function submit() {
    if (loading.value) return;
    // 提交前本地拦截（顺序与后端一致：非空 ⇒ 长度 ⇒ 字母+数字 ⇒ 不得与原密码相同 ⇒ 两次一致）
    const issue = localPasswordIssue(form);
    if (issue) {
        errorMsg.value = issue;
        return;
    }
    errorMsg.value = '';
    loading.value = true;
    try {
        await request.put('/auth/password', { oldPassword: form.oldPassword, newPassword: form.newPassword });
        // 本地同步已清标志（token 不变），避免后续请求/守卫仍按旧标志引导
        userStore.setUser({ ...(userStore.user || {}), mustChangePassword: false });
        // 复位 1005 去重标记：同一会话内管理员后续再次重置时，仍能重新引导到本页
        resetPasswordChangeHandled();
        message.success('密码修改成功');
        router.replace(homePath(userStore.user));
    } catch (e) {
        errorMsg.value = errorCopyOf(e, { tag: 'ChangePassword.vue 修改密码', action: '修改' });
    } finally {
        loading.value = false;   // ⑥a：loading 必须有复位路径
    }
}
</script>

<style scoped>
.cp-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--canvas-parchment);
}

.cp-card {
    width: 380px;
    text-align: center;
}

.cp-title {
    font-size: 32px;
    font-weight: 600;
    margin-bottom: 8px;
}

.cp-desc {
    font-size: var(--fs-body);
    color: var(--text-tertiary);
    margin-bottom: 24px;
}

.cp-notice {
    margin: 0 0 24px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: var(--status-warning-bg);
    color: var(--status-warning-fg);
    font-size: var(--fs-body-sm);
    text-align: left;
}

.cp-form {
    text-align: left;
}

.cp-rule {
    margin: -8px 0 16px;
    font-size: var(--fs-body-sm);
    color: var(--text-tertiary);
}

.cp-error {
    margin-top: 16px;
    color: var(--status-danger-fg);
    font-size: var(--fs-body);
}
</style>
