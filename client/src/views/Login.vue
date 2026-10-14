<template>
    <!-- 页面主内容用 <main> 承载（landmark）：既给登录页补上缺失的主地标，也让下面的
         视觉隐藏 label 等元素不再被 axe 的 region 规则计为「无地标内容」 -->
    <main class="login-page">
        <div class="login-card">
            <img src="../assets/logo.svg" class="login-logo" alt="logo" />
            <h1 class="login-title">Deadpan 判题</h1>
            <p class="login-desc">请登录以继续</p>

            <!-- ★W8（t10/F2）：登录态过期被送回登录页时常驻展示统一文案 ——
                 应用内跳转时 toast 仍可见（此处是第二保险）；整页兜底跳转会销毁 toast ⇒ 这里就是唯一可见处 -->
            <p v-if="expiredNotice" id="login-expired" class="login-expired" role="alert">{{ expiredNotice }}</p>

            <!-- 多学校选择 -->
            <template v-if="schoolOptions.length">
              <p class="login-desc" style="font-size:var(--fs-body-lg);color:var(--text-tertiary);margin-bottom:var(--space-4);">
                学号「{{ username }}」存在于多个学校，请选择您的学校
              </p>
              <a-form layout="vertical" class="login-form">
                <a-form-item>
                  <!-- 无可见 label（说明文字在表单上方）；antd 会把 aria-label 渲染到外层 .ant-select div，
                       故用「视觉隐藏 label + for/id 关联」给出可访问名称；错误时与错误区联动 -->
                  <label for="login-school" class="visually-hidden">请选择学校</label>
                  <a-select
                    id="login-school"
                    v-model:value="selectedCode"
                    placeholder="请选择学校"
                    size="large"
                    :aria-invalid="!!errorMsg"
                    :aria-describedby="errorMsg ? 'login-error' : undefined"
                  >
                    <a-select-option v-for="s in schoolOptions" :key="s.officialCode" :value="s.officialCode">
                      {{ s.name }}
                    </a-select-option>
                  </a-select>
                </a-form-item>
                <a-form-item>
                  <a-button type="primary" :loading="loading" block size="large" @click="handleSelectSchool">确认登录</a-button>
                </a-form-item>
                <a-form-item>
                  <a-button type="link" block @click="schoolOptions = []">返回重新输入</a-button>
                </a-form-item>
              </a-form>
            </template>

            <!-- 正常登录表单 -->
            <a-form v-else layout="vertical" class="login-form">
                <a-form-item>
                    <label for="login-username" class="visually-hidden">用户名（工号/学号）</label>
                    <a-input
                        id="login-username"
                        ref="usernameInputRef"
                        v-model:value="username"
                        placeholder="用户名（工号/学号）"
                        size="large"
                        :aria-invalid="!!errorMsg"
                        :aria-describedby="errorMsg ? 'login-error' : undefined"
                        @pressEnter="handleLogin"
                    />
                </a-form-item>
                <a-form-item>
                    <label for="login-password" class="visually-hidden">密码</label>
                    <a-input-password
                        id="login-password"
                        ref="passwordInputRef"
                        v-model:value="password"
                        placeholder="密码"
                        size="large"
                        :aria-invalid="!!errorMsg"
                        :aria-describedby="errorMsg ? 'login-error' : undefined"
                        @pressEnter="handleLogin"
                    />
                </a-form-item>
                <a-form-item>
                    <a-button type="primary" :loading="loading" block size="large" @click="handleLogin">登录</a-button>
                </a-form-item>
            </a-form>
            <!-- T5-A3：错误提示带读屏语义（role=alert 隐含 aria-live=assertive + aria-atomic），
                 稳定 id 供输入框 aria-describedby 关联；容器用 v-if，出现即播报 -->
            <p v-if="errorMsg" id="login-error" class="login-error" role="alert">{{ errorMsg }}</p>
        </div>
    </main>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import request from '../api/request.js';
import { AUTH_EXPIRED_MESSAGE } from '../api/apiError.js';   // ★W8（t10/F2）：与 401 统一文案**同源**，避免两处各写一句
import { useUserStore } from '../stores/user.js';

const router = useRouter();
const route = useRoute();

/** ★W8（t10/F2）：401 跳转带的 ?expired=1 ⇒ 登录页常驻提示（文案与 request.js 的 toast 完全一致） */
const expiredNotice = computed(() => (route.query.expired ? AUTH_EXPIRED_MESSAGE : ''));
const userStore = useUserStore();
const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');
const schoolOptions = ref([]);
const selectedCode = ref('');
/** 焦点策略用到的输入框引用（见 handleLogin 注释） */
const usernameInputRef = ref(null);
const passwordInputRef = ref(null);

/**
 * 焦点策略（T5-A3）：
 *  ① 客户端校验失败（缺用户名/密码）→ 焦点移到第一个为空的输入框：错误与某个字段一一对应，
 *     用户接下来的动作就是改它，直接落焦比让用户自己 Tab 更省事；错误本身由 role=alert 播报。
 *  ② 服务端失败（如「用户名或密码错误」）→ **不移动焦点**：错误不属于单个字段，role=alert 已播报；
 *     焦点留在「登录」按钮上，键盘用户按 Enter 即可重试（避免被抢焦点后还要再 Tab 回来）。
 *  两条分支的输入框都带 aria-invalid / aria-describedby（指向 #login-error），
 *  重新聚焦任一字段时读屏会再念一次错误。
 */
async function handleLogin () {
    if (!username.value || !password.value) {
        errorMsg.value = '请输入用户名和密码';
        await nextTick();
        const target = !username.value ? usernameInputRef.value : passwordInputRef.value;
        target?.focus?.();
        return;
    }
    errorMsg.value = '';
    loading.value = true;
    try {
        const res = await request.post('/auth/login', { username: username.value, password: password.value });
        if (res.code === 1002) {
            // 多学校 → 显示选择页
            schoolOptions.value = res.data.schools;
            selectedCode.value = res.data.schools[0]?.officialCode || '';
            return;
        }
        userStore.setAuth(res.data.token, res.data.user);
        router.push(res.data.user.role === 'super_admin' ? '/admin' : `/${res.data.user.role}`);
    } catch (err) {
        errorMsg.value = err?.response?.data?.message || '登录失败';
    } finally {
        loading.value = false;
    }
}

async function handleSelectSchool() {
    if (!selectedCode.value) { errorMsg.value = '请选择学校'; return; }
    errorMsg.value = '';
    loading.value = true;
    try {
        const res = await request.post('/auth/login', {
            username: username.value,
            password: password.value,
            schoolCode: selectedCode.value,
        });
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
    color: var(--text-tertiary);
    margin-bottom: 40px;
}

.login-form {
    text-align: left;
}

/* ★W8（t10/F2）：登录态过期提示（与 .login-error 同区、不同色：这是"说明"不是"你输错了"） */
.login-expired {
    margin: -24px 0 20px;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    background: var(--status-warning-bg, rgba(250, 173, 20, 0.12));
    color: var(--status-warning-fg, #ad6800);
    font-size: var(--fs-body-sm);
}

.login-error {
    color: var(--status-danger-fg);
    font-size: var(--fs-body);
    margin-top: 16px;
}
</style>
