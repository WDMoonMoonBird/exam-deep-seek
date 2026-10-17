<script setup>
/**
 * Profile.vue —— 学生「我的」（Tab 4）· /m/student/profile
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #17、10-v1-implementation-contract.md §3/§6/§7
 * 设计参照：docs/mobile-app/preview/screens/student-profile.html（只读）
 * 数据：GET /student/profile（姓名/学号/班级/学校） + GET /student/assignments、GET /student/scores（统计已提交/已出分）。
 * v1 降级：不显示平均分/排名（D1）；通知/推送设置属于 D6 延期项，不渲染死 UI。
 * 主题开关使用现有 useTheme（真实切换 html[data-theme]，修设计稿 P1-1）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MEmpty from '../../components/MEmpty.vue';
import MIcon from '../../components/MIcon.vue';
import MSheet from '../../components/MSheet.vue';
import MSkeleton from '../../components/MSkeleton.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { useTheme } from '../../../composables/useTheme.js';
import { useUserStore } from '../../../stores/user.js';
import { errorText, hasPublishedSubmission, hasRealSubmission } from './studentPure.js';
import { safeGet } from './studentRequests.js';

/* 字号偏好（与教师「我的」同口径：localStorage m-font-size → 注入 .m-screen 令牌，桌面不受影响） */
const FONT_KEY = 'm-font-size';
const FONT_SCALES = {
  standard: { body: '15px', sm: '13px', caption: '12px', label: '标准' },
  large: { body: '16.5px', sm: '14px', caption: '13px', label: '大' },
  xlarge: { body: '18px', sm: '15px', caption: '14px', label: '特大' },
};

const router = useRouter();
const userStore = useUserStore();
const toast = useMobileToast();
const { resolved, setMode } = useTheme();

const profile = ref(null);
const assignments = ref([]);
const scores = ref([]);
const loading = ref(true);
const error = ref('');
const statsFailed = ref(false);
const logoutOpen = ref(false);
const fontSheetOpen = ref(false);
const fontChoice = ref('standard');

const storedUser = computed(() => userStore.user || {});
const realName = computed(() => (profile.value && profile.value.realName) || storedUser.value.realName || '同学');
const username = computed(() => (profile.value && profile.value.username) || storedUser.value.username || '');
const classNames = computed(() => {
  const classes = (profile.value && profile.value.classes) || [];
  return classes.map((item) => item && item.className).filter(Boolean);
});
const schoolName = computed(() => {
  const classes = (profile.value && profile.value.classes) || [];
  const first = classes[0];
  return first && first.schoolName ? first.schoolName : '';
});
const initial = computed(() => String(realName.value || '同学').slice(0, 1));
const isDark = computed(() => resolved.value === 'dark');
const themeSub = computed(() => (isDark.value ? '当前深色 · 深色环境更省电' : '当前浅色 · 深色环境更省电'));
const fontLabel = computed(() => (FONT_SCALES[fontChoice.value] || FONT_SCALES.standard).label);

const submittedCount = computed(() => assignments.value.filter((a) => hasRealSubmission(a) || hasPublishedSubmission(a)).length);
const gradedCount = computed(() => scores.value.length);

function readFontChoice() {
  try {
    const stored = localStorage.getItem(FONT_KEY);
    return stored && FONT_SCALES[stored] ? stored : 'standard';
  } catch { return 'standard'; }
}

/** 只作用于 .m-screen（移动端根节点），不影响桌面令牌；教师端同款实现（共享能力缺口已报 Lead） */
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
  el.textContent = '.m-screen{--m-fs-body:' + scale.body + ';--m-fs-body-sm:' + scale.sm + ';--m-fs-caption:' + scale.caption + ';}';
  if (persist) {
    try { localStorage.setItem(FONT_KEY, key); } catch { /* 隐私模式：仅本次生效 */ }
  }
}

function chooseFont(choice) {
  fontChoice.value = FONT_SCALES[choice] ? choice : 'standard';
  applyFont(fontChoice.value, true);
  fontSheetOpen.value = false;
  toast.show('字号已切换为「' + fontLabel.value + '」');
}

function toggleTheme() {
  setMode(isDark.value ? 'light' : 'dark');
  toast.show(isDark.value ? '已切换为深色主题' : '已切换为浅色主题');
}
function goDoc() {
  router.push('/m/doc');
}
function openLogout() {
  logoutOpen.value = true;
}
function confirmLogout() {
  logoutOpen.value = false;
  userStore.logout();
  router.push('/m/login');
}

async function load() {
  loading.value = true;
  error.value = '';
  statsFailed.value = false;
  // 并行取数；safeGet 失败就地返回 { ok:false,error }，个人资料失败进错误态、统计失败只降级
  const [profileRes, assignRes, scoreRes] = await Promise.all([
    safeGet('/student/profile', { silent: true }),
    safeGet('/student/assignments', { params: { page: 1, pageSize: 100 }, silent: true }),
    safeGet('/student/scores', { silent: true }),
  ]);
  if (!profileRes.ok) {
    error.value = errorText(profileRes.error);
    profile.value = null;
    loading.value = false;
    return;
  }
  profile.value = profileRes.data || null;
  if (assignRes.ok) {
    const data = assignRes.data || {};
    assignments.value = Array.isArray(data.list) ? data.list : [];
  } else {
    assignments.value = [];
    statsFailed.value = true;
  }
  if (scoreRes.ok) {
    scores.value = scoreRes.data || [];
  } else {
    scores.value = [];
    statsFailed.value = true;
  }
  loading.value = false;
}

onMounted(() => {
  fontChoice.value = readFontChoice();
  applyFont(fontChoice.value, false);
  load();
});
</script>

<template>
  <MobileLayout role="student" active="me" bottom="tabbar">
    <main class="scroll">
      <div v-if="loading" class="page mt16">
        <MSkeleton variant="card" :count="3" />
      </div>

      <div v-else-if="error" class="page mt16">
        <MEmpty icon="alert" title="个人信息加载失败" :description="error">
          <button type="button" class="btn btn--primary" @click="load">重新加载</button>
        </MEmpty>
      </div>

      <template v-else>
        <header class="pf-head">
          <span class="avatar avatar--xl avatar--brand" aria-hidden="true">{{ initial }}</span>
          <div class="pf-id">
            <h1 class="pf-name">{{ realName }}<MStatusTag type="info">学生</MStatusTag></h1>
            <p v-if="username" class="pf-sub">学号 {{ username }}</p>
            <p v-if="classNames.length" class="pf-sub">{{ classNames.join('、') }}</p>
            <p v-if="schoolName" class="pf-sub">{{ schoolName }}</p>
            <p v-if="!username && !classNames.length" class="pf-sub">暂无班级信息</p>
          </div>
        </header>

        <div class="page">
          <div class="stats stats--2 pf-stats">
            <div class="stat">
              <div class="v tnum">{{ statsFailed ? '—' : submittedCount }}</div>
              <div class="k">已提交作业</div>
            </div>
            <div class="stat">
              <div class="v tnum">{{ statsFailed ? '—' : gradedCount }}</div>
              <div class="k">已出分成绩</div>
            </div>
          </div>
          <button v-if="statsFailed" type="button" class="pf-retry" @click="load">统计数据加载失败，点击重试</button>
        </div>

        <div class="pf-group-title">偏好设置</div>
        <div class="page">
          <div class="list">
            <div class="rowitem pf-row">
              <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon :name="isDark ? 'moon' : 'sun'" /></span>
              <span class="row-main">
                <span class="row-title">深色主题</span>
                <span class="row-sub">{{ themeSub }}</span>
              </span>
              <button
                type="button"
                class="switch"
                :class="{ on: isDark }"
                role="switch"
                :aria-checked="isDark ? 'true' : 'false'"
                aria-label="深色主题"
                @click="toggleTheme"
              ></button>
            </div>
            <button
              type="button"
              class="rowitem rowitem--tap pf-row"
              :aria-label="'字号大小，当前' + fontLabel"
              @click="fontSheetOpen = true"
            >
              <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="eye" /></span>
              <span class="row-main">
                <span class="row-title">字号大小</span>
                <span class="row-sub">影响正文与列表文字</span>
              </span>
              <span class="pf-value">{{ fontLabel }}</span>
              <MIcon name="chevron-right" class="chevron" />
            </button>
          </div>
        </div>

        <div class="pf-group-title">更多</div>
        <div class="page">
          <div class="list">
            <button type="button" class="rowitem rowitem--tap pf-row" aria-label="使用文档" @click="goDoc">
              <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="book" /></span>
              <span class="row-main">
                <span class="row-title">使用文档</span>
                <span class="row-sub">作答、提交与查看成绩的说明</span>
              </span>
              <MIcon name="chevron-right" class="chevron" />
            </button>
            <div class="rowitem pf-row">
              <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="info" /></span>
              <span class="row-main">
                <span class="row-title">关于 Exam-DeepSeek</span>
                <span class="row-sub">AI 评分 · 教学评测平台</span>
              </span>
              <span class="pf-value">移动端 v1</span>
            </div>
          </div>
        </div>

        <div class="pf-foot">
          <button type="button" class="btn btn--danger-soft btn--block pf-logout" @click="openLogout">
            <MIcon name="logout" />退出登录
          </button>
          <p class="pf-foot-note">退出后需重新登录；未提交的作答草稿保存在服务器。</p>
        </div>
      </template>
    </main>

    <MSheet v-model:open="logoutOpen" title="确定退出登录？" subtitle="退出后需重新输入账号和密码">
      <div class="banner banner--neutral" role="note">
        <MIcon name="info" />
        <div>已提交的作业与成绩不会丢失；未交卷的草稿已自动保存，重新登录后可继续作答。</div>
      </div>
      <template #foot>
        <button type="button" class="btn btn--danger btn--block" @click="confirmLogout">退出登录</button>
        <button type="button" class="btn btn--secondary btn--block" @click="logoutOpen = false">取消</button>
      </template>
    </MSheet>

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
  </MobileLayout>
</template>

<style scoped>
.pf-head { display: flex; align-items: flex-start; padding: 16px var(--m-gutter) 16px; }
.pf-id { flex: 1; min-width: 0; margin-left: 14px; }
.pf-name { display: flex; align-items: center; flex-wrap: wrap; font-size: 21px; line-height: 1.3; font-weight: var(--m-fw-bold); letter-spacing: var(--m-tracking-tight); color: var(--text-strong); }
.pf-name .tag { margin-left: 8px; height: 21px; font-size: 11px; }
.pf-sub { margin-top: 3px; font-size: var(--m-fs-body-sm); color: var(--text-secondary); line-height: 1.5; }
.pf-stats { margin-top: 2px; }
.pf-stats .stat { padding: 12px; }
.pf-stats .stat .v { font-size: 21px; }
.pf-stats .stat .k { white-space: normal; line-height: 1.4; }
.pf-retry { display: block; width: 100%; min-height: var(--m-touch-min); margin-top: 8px; text-align: left; font-size: 12px; color: var(--status-danger-fg); }
.pf-row { width: 100%; text-align: left; }
.pf-row .row-main { display: flex; flex-direction: column; }
.pf-row .row-sub { display: block; }
.pf-row .switch { margin-left: 12px; flex: none; }
.pf-value { flex: none; margin-left: auto; padding-left: 10px; font-size: 13.5px; color: var(--text-tertiary); }
.pf-group-title { display: flex; align-items: center; font-size: 12px; font-weight: var(--m-fw-semibold); color: var(--text-tertiary); padding: 0 var(--m-gutter); margin: 22px 0 8px; letter-spacing: 0.02em; }
.pf-foot { margin: 20px var(--m-gutter) 8px; }
.pf-logout .icon { margin-right: 6px; }
.pf-foot-note { margin-top: 10px; text-align: center; font-size: 11.5px; line-height: 1.6; color: var(--text-tertiary); }
.font-option-main { display: flex; flex-direction: column; align-items: flex-start; margin-left: 12px; }
.font-option-label { font-size: 15px; font-weight: var(--m-fw-semibold); }
.font-option-sub { margin-top: 2px; font-size: 12px; color: var(--text-tertiary); }
.option { align-items: center; }
.option .radio { margin-top: 0; }
/* 共享 sheet-close 命中区补宽：设计稿 32px 视觉 + 44px 命中（QA P1-3） */
:deep(.sheet-close)::after { left: -6px; right: -6px; }
</style>
