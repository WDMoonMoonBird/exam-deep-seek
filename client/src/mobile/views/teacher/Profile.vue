<script setup>
/**
 * 教师 · 我的（Tab 4）—— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7、05-page-specs 屏 30、09 §4 教师「我的」降级口径。
 * 数据：localStorage user/currentSchool（stores/user.js）+ useTheme + 本地字号偏好；
 * 通知偏好（D6）不渲染、不请求。桌面版跳转整页、字号偏好本地持久化。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import { MIcon, MSheet, MStatusTag } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { useUserStore } from '../../../stores/user.js';
import { useTheme } from '../../../composables/useTheme.js';
import { withAppBase } from '../../../domain/appPath.js';

const FONT_KEY = 'm-font-size';
const FONT_SCALES = {
  standard: { body: '15px', sm: '13px', caption: '12px', label: '标准' },
  large: { body: '16.5px', sm: '14px', caption: '13px', label: '大' },
  xlarge: { body: '18px', sm: '15px', caption: '14px', label: '特大' },
};

const router = useRouter();
const toast = useMobileToast();
const userStore = useUserStore();
const { resolved, toggle } = useTheme();
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherProfile.vue', action: '加载我的' });

const badges = ref({});
const fontSheetOpen = ref(false);
const desktopSheetOpen = ref(false);
const logoutSheetOpen = ref(false);
const fontChoice = ref('standard');

const teacherName = computed(() => {
  const u = userStore.user || {};
  return u.realName || u.username || '老师';
});
const teacherNo = computed(() => {
  const u = userStore.user || {};
  return u.username || '未设置工号';
});
const schoolName = computed(() => (userStore.currentSchool && userStore.currentSchool.name) || '未设置学校');
const isDark = computed(() => resolved.value === 'dark');
const fontLabel = computed(() => (FONT_SCALES[fontChoice.value] || FONT_SCALES.standard).label);

function readFontChoice() {
  try {
    const stored = localStorage.getItem(FONT_KEY);
    return stored && FONT_SCALES[stored] ? stored : 'standard';
  } catch { return 'standard'; }
}

function applyFont(choice, persist) {
  const key = FONT_SCALES[choice] ? choice : 'standard';
  const scale = FONT_SCALES[key];
  if (typeof document === 'undefined') return;
  let el = document.getElementById('m-font-size-style');
  if (!el) {
    el = document.createElement('style');
    el.id = 'm-font-size-style';
    document.head.appendChild(el);
  }
  // 只作用于 .m-screen（移动端根节点），不影响桌面令牌；foundation 若后续把字号档位收进
  // MobileLayout，本段可整体删除（已作为共享能力缺口报给 Lead）。
  el.textContent = '.m-screen{--m-fs-body:' + scale.body + ';--m-fs-body-sm:' + scale.sm + ';--m-fs-caption:' + scale.caption + ';}';
  if (persist) {
    try { localStorage.setItem(FONT_KEY, key); } catch { /* 隐私模式下仅本次生效 */ }
  }
}

function chooseFont(choice) {
  fontChoice.value = FONT_SCALES[choice] ? choice : 'standard';
  applyFont(fontChoice.value, true);
  fontSheetOpen.value = false;
  toast.show('字号已切换为「' + fontLabel.value + '」');
}

function onThemeToggle() {
  toggle();
}

function openDesktop() {
  desktopSheetOpen.value = true;
}

function goDesktop() {
  try { localStorage.setItem('ui:layout', 'desktop'); } catch { /* 忽略 */ }
  desktopSheetOpen.value = false;
  window.location.assign(withAppBase('/teacher/assignments'));
}

function openLogout() {
  logoutSheetOpen.value = true;
}

function doLogout() {
  logoutSheetOpen.value = false;
  userStore.logout();
  router.replace('/m/login');
}

async function loadBadge() {
  const r = await safeLoad(() => request.get('/teacher/pending-summary', { silent: true }), { notify: false });
  if (!r.error) badges.value = { review: (r.data && r.data.pendingReview) || 0 };
}

onMounted(() => {
  fontChoice.value = readFontChoice();
  applyFont(fontChoice.value, false);
  loadBadge();
});
</script>

<template>
  <MobileLayout role="teacher" active="me" bottom="tabbar" :badges="badges">
    <main class="scroll">
      <h1 class="sr-only">我的</h1>
      <div class="page mt8">
        <div class="card identity-card">
          <span class="avatar avatar--xl avatar--brand" aria-hidden="true">{{ teacherName.slice(0, 1) }}</span>
          <div class="grow identity-main">
            <div class="identity-name">{{ teacherName }}<MStatusTag type="info">教师</MStatusTag></div>
            <div class="identity-sub">工号 {{ teacherNo }}</div>
            <div class="identity-sub">{{ schoolName }}</div>
          </div>
        </div>
      </div>

      <div class="sec"><h2>设置</h2></div>
      <div class="page">
        <div class="list">
          <div class="rowitem">
            <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="moon" /></span>
            <span class="row-main">
              <span class="row-title">深色主题</span>
              <span class="row-sub">切换立即生效，仅影响本机移动端</span>
            </span>
            <button
              type="button"
              class="switch"
              :class="{ on: isDark }"
              role="switch"
              :aria-checked="isDark ? 'true' : 'false'"
              aria-label="深色主题"
              @click="onThemeToggle"
            ></button>
          </div>
          <button type="button" class="rowitem rowitem--tap" @click="fontSheetOpen = true">
            <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="book" /></span>
            <span class="row-main">
              <span class="row-title">字号大小</span>
              <span class="row-sub">影响正文与列表文字</span>
            </span>
            <span class="row-side">{{ fontLabel }}</span>
            <MIcon name="chevron-right" class="chevron" />
          </button>
          <button type="button" class="rowitem rowitem--tap" @click="openDesktop">
            <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="external" /></span>
            <span class="row-main">
              <span class="row-title">切换到桌面版</span>
              <span class="row-sub">大屏编辑、批量导出更高效</span>
            </span>
            <MIcon name="chevron-right" class="chevron" />
          </button>
          <button type="button" class="rowitem rowitem--tap" @click="router.push('/m/doc')">
            <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="info" /></span>
            <span class="row-main">
              <span class="row-title">关于与帮助</span>
              <span class="row-sub">使用文档 · 反馈问题</span>
            </span>
            <MIcon name="chevron-right" class="chevron" />
          </button>
        </div>

        <button type="button" class="btn btn--danger-soft btn--block mt16" @click="openLogout">
          <MIcon name="logout" />退出登录
        </button>
        <p class="version-text">Deadpan 判题 · 移动端 v1</p>
      </div>
    </main>

    <MSheet v-model:open="fontSheetOpen" title="字号大小" subtitle="全局生效，无需重启">
      <div class="options">
        <button
          v-for="(scale, key) in FONT_SCALES"
          :key="key"
          type="button"
          class="option"
          :class="{ selected: fontChoice === key }"
          :aria-pressed="fontChoice === key"
          @click="chooseFont(key)"
        >
          <span class="radio" :class="{ on: fontChoice === key }" aria-hidden="true"></span>
          <span class="font-option-main">
            <span class="font-option-label">{{ scale.label }}</span>
            <span class="font-option-sub">正文 {{ scale.body }} · 辅助 {{ scale.sm }}</span>
          </span>
        </button>
      </div>
      <p class="help mt12">字号偏好保存在本机；桌面端不受影响。</p>
    </MSheet>

    <MSheet v-model:open="desktopSheetOpen" title="切换到桌面版" :subtitle="withAppBase('/teacher/assignments')">
      <div class="banner banner--info">
        <MIcon name="external" />
        <div>将跳转到电脑端教师工作台（桌面版）。当前登录状态会保留，适合批量评分、导出成绩与题目编辑。</div>
      </div>
      <div class="link-box mt12">
        <MIcon name="link" />
        <span class="link-text">{{ withAppBase('/teacher/assignments') }}</span>
      </div>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" @click="desktopSheetOpen = false">取消</button>
        <button type="button" class="btn btn--primary btn--block" @click="goDesktop">前往桌面版</button>
      </template>
    </MSheet>

    <MSheet v-model:open="logoutSheetOpen" title="退出登录？" subtitle="退出后需重新输入账号密码">
      <div class="banner banner--warning">
        <MIcon name="alert" />
        <div>退出后本地登录态会被清除；已提交的审核结果不受影响。</div>
      </div>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" @click="logoutSheetOpen = false">取消</button>
        <button type="button" class="btn btn--danger btn--block" @click="doLogout">确认退出</button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
.identity-card { display: flex; align-items: center; padding: 18px var(--m-card-pad); }
.identity-main { margin-left: 14px; min-width: 0; }
.identity-name { font-size: 20px; font-weight: 700; letter-spacing: var(--m-tracking-tight); }
.identity-name .tag { margin-left: 7px; vertical-align: 3px; }
.identity-sub { margin-top: 3px; font-size: 12.5px; color: var(--text-secondary); }
.rowitem { width: 100%; text-align: left; }
.row-side { font-size: 13px; color: var(--text-tertiary); }
.version-text { margin: 18px 0 6px; text-align: center; font-size: 11.5px; color: var(--text-tertiary); }
.font-option-main { display: flex; flex-direction: column; margin-left: 12px; }
.font-option-label { font-size: 15px; font-weight: 600; }
.font-option-sub { margin-top: 2px; font-size: 12px; color: var(--text-tertiary); }
.font-option-main { align-items: flex-start; }
.option { align-items: center; }
.option .radio { margin-top: 0; }
.link-box {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-sunken);
  color: var(--text-secondary);
  font-size: 12px;
}
.link-box .icon { width: 15px; height: 15px; margin-right: 8px; flex: none; }
.link-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
