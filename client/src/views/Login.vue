<template>
    <div class="login-page">
        <div class="login-card">
            <img src="../assets/logo.svg" class="login-logo" alt="logo" />
            <h1 class="login-title">Deadpan 判题</h1>
            <p class="login-desc">请登录以继续</p>
            <a-form layout="vertical" class="login-form">
                <a-form-item>
                    <a-input v-model:value="username" placeholder="用户名（工号/学号）" size="large" @pressEnter="handleLogin" />
                </a-form-item>
                <a-form-item>
                    <a-input-password v-model:value="password" placeholder="密码" size="large"
                        @pressEnter="handleLogin" />
                </a-form-item>
                <a-form-item>
                    <a-button type="primary" :loading="loading" block size="large" @click="handleLogin">登录</a-button>
                </a-form-item>
            </a-form>
            <p v-if="errorMsg" class="login-error">{{ errorMsg }}</p>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import request from '../api/request.js';
import { useUserStore } from '../stores/user.js';

const router = useRouter();
const userStore = useUserStore();
const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');

async function handleLogin () {
    if (!username.value || !password.value) { errorMsg.value = '请输入用户名和密码'; return; }
    errorMsg.value = '';
    loading.value = true;
    try {
        const res = await request.post('/auth/login', { username: username.value, password: password.value });
        userStore.setAuth(res.data.token, res.data.user);
        router.push(res.data.user.role === 'super_admin' ? '/admin' : `/${res.data.user.role}`);
    } catch (err) {
        errorMsg.value = err?.response?.data?.message || '登录失败';
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--canvas-parchment);
}

.login-card {
    width: 380px;
    text-align: center;
}

.login-logo {
    width: 56px;
    height: 56px;
    margin-bottom: 16px;
}

.login-title {
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.28px;
    margin-bottom: 8px;
}

.login-desc {
    font-size: 21px;
    font-weight: 400;
    color: var(--ink-muted);
    margin-bottom: 40px;
}

.login-form {
    text-align: left;
}

.login-error {
    color: #ff3b30;
    font-size: 14px;
    margin-top: 16px;
}
</style>
