<script setup>
/**
 * 教师作业列表（Tab 2）—— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7.5、05-page-specs 屏 19、09 §4 教师作业降级口径。
 * 数据：GET /teacher/assignments?page&pageSize&status&keyword（真实分页/筛选/提交进度/待审数）
 *      + PUT /teacher/assignments/:id/lock（锁定/解锁）
 * 延期项（均分/催交/编辑/删除）不请求、不渲染；「复制链接」复制的是需登录的移动端作业地址。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import {
  MChips, MEmpty, MIcon, MProgress, MSheet, MSkeleton, MStatusTag,
} from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { formatDateTime, timeStatus } from '../../../domain/format.js';
import { withAppBase } from '../../../domain/appPath.js';

const router = useRouter();
const toast = useMobileToast();
const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'MobileTeacherAssignments.vue', action: '加载作业' });

const list = ref([]);
const total = ref(0);
const page = ref(1);
const PAGE_SIZE = 20;
const loading = ref(false);
const loadingMore = ref(false);
const errorText = ref('');
const keyword = ref('');
const statusFilter = ref('');
const badges = ref({});
const sheetOpen = ref(false);
const actionTarget = ref(null);
const lockConfirmOpen = ref(false);
const lockSubmitting = ref(false);

const statusOptions = [
  { label: '全部', value: '' },
  { label: '进行中', value: 'ongoing' },
  { label: '未开始', value: 'upcoming' },
  { label: '已结束', value: 'ended' },
  { label: '已锁定', value: 'locked' },
];

const hasFilter = computed(() => !!keyword.value.trim() || !!statusFilter.value);
const hasMore = computed(() => list.value.length < total.value);

let searchTimer = null;
watch(keyword, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => reload(), 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

function classText(item) {
  const names = (item.assignmentClasses || []).map((ac) => ac.class && ac.class.name).filter(Boolean);
  if (!names.length) return '未关联班级';
  if (names.length <= 2) return names.join(' / ');
  return names.slice(0, 2).join(' / ') + ' 等 ' + names.length + ' 个班';
}

function progressOf(item) {
  const totalCount = item.expectedCount || 0;
  const done = item.submissionCount || 0;
  return { done, total: totalCount, percent: totalCount > 0 ? Math.min(100, Math.round((done / totalCount) * 100)) : 0 };
}

function rowStatus(item) {
  if (item.locked) return { text: '已锁定', type: 'neutral' };
  const s = timeStatus(item.startTime, item.endTime);
  if (s === 'upcoming') return { text: '未开始', type: 'neutral' };
  if (s === 'ended') return { text: '已结束', type: 'neutral' };
  return { text: '进行中', type: 'success' };
}

function deadlineText(item) {
  return formatDateTime(item.endTime) || '未设置';
}

async function loadBadge() {
  const r = await safeLoad(() => request.get('/teacher/pending-summary', { silent: true }), { notify: false });
  if (!r.error) badges.value = { review: (r.data && r.data.pendingReview) || 0 };
}

async function fetchList(append) {
  if (append) loadingMore.value = true;
  else loading.value = true;
  errorText.value = '';
  const params = { page: page.value, pageSize: PAGE_SIZE };
  if (keyword.value.trim()) params.keyword = keyword.value.trim();
  if (statusFilter.value) params.status = statusFilter.value;
  const r = await safeLoad(() => request.get('/teacher/assignments', { params }));
  loading.value = false;
  loadingMore.value = false;
  if (r.error) {
    if (append) page.value = Math.max(1, page.value - 1);
    errorText.value = r.message || '作业加载失败，请重试';
    return;
  }
  const d = r.data || {};
  list.value = append ? list.value.concat(d.list || []) : (d.list || []);
  total.value = d.total || 0;
}

function reload() {
  page.value = 1;
  fetchList(false);
}

function loadMore() {
  if (loading.value || loadingMore.value) return;
  page.value += 1;
  fetchList(true);
}

function resetFilter() {
  keyword.value = '';
  statusFilter.value = '';
  reload();
}

function openActions(item) {
  actionTarget.value = item;
  sheetOpen.value = true;
}

function askToggleLock() {
  if (!actionTarget.value) return;
  const target = actionTarget.value;
  sheetOpen.value = false;
  actionTarget.value = target;
  lockConfirmOpen.value = true;
}

async function toggleLock() {
  const target = actionTarget.value;
  if (!target || lockSubmitting.value) return;
  lockSubmitting.value = true;
  const r = await safeSubmit(() => request.put('/teacher/assignments/' + target.id + '/lock'));
  lockSubmitting.value = false;
  if (r.error) return;
  const nextLocked = !target.locked;
  const row = list.value.find((item) => item.id === target.id);
  if (row) row.locked = nextLocked;
  lockConfirmOpen.value = false;
  toast.show(nextLocked ? '已锁定作业' : '已解除锁定');
}

async function copyLink() {
  const target = actionTarget.value;
  if (!target) return;
  const url = window.location.origin + withAppBase('/m/teacher/assignments/' + target.id);
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      ok = true;
    }
  } catch { /* 回退旧接口 */ }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { ok = false; }
  }
  sheetOpen.value = false;
  toast.show(ok ? '已复制作业链接，可在电脑登录后打开' : '复制失败，请长按链接手动复制');
}

onMounted(() => {
  fetchList(false);
  loadBadge();
});
</script>

<template>
  <MobileLayout role="teacher" active="assignments" bottom="tabbar" :badges="badges">
    <MobileAppBar align="left">
      <template #right>
        <button type="button" class="iconbtn" aria-label="布置作业" @click="router.push('/m/teacher/assign/new')">
          <MIcon name="plus" />
        </button>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <h1 class="sr-only">作业</h1>
      <div class="page mt8">
        <label class="searchbar">
          <MIcon name="search" />
          <input v-model="keyword" type="search" placeholder="搜索作业名称" aria-label="搜索作业名称" enterkeyhint="search" />
        </label>
      </div>

      <div class="chips-wrap">
        <MChips v-model="statusFilter" :options="statusOptions" label="状态筛选" @update:model-value="reload" />
      </div>

      <div class="page">
        <MSkeleton v-if="loading && !list.length" variant="card" :count="3" />
        <div v-else-if="errorText" class="banner banner--danger" role="alert">
          <MIcon name="alert" />
          <div>{{ errorText }}<button type="button" class="banner-link" @click="reload">重试</button></div>
        </div>
        <MEmpty
          v-else-if="!list.length"
          icon="assignments"
          title="暂无作业"
          :description="hasFilter ? '没有符合筛选条件的作业' : '布置第一份作业后，学生会在这里看到'"
        >
          <button v-if="hasFilter" type="button" class="btn btn--secondary" @click="resetFilter">清空筛选</button>
          <button v-else type="button" class="btn btn--primary" @click="router.push('/m/teacher/assign/new')">布置作业</button>
        </MEmpty>

        <div v-else class="stack">
          <article v-for="item in list" :key="item.id" class="card">
            <div class="card-head">
              <div class="grow">
                <div class="card-title">
                  <router-link class="title-link" :to="'/m/teacher/assignments/' + item.id">{{ item.title }}</router-link>
                </div>
                <div class="card-sub">{{ classText(item) }} · {{ (item._count && item._count.assignmentQuestions) || 0 }} 题</div>
              </div>
              <div class="head-tags">
                <MStatusTag :type="rowStatus(item).type">{{ rowStatus(item).text }}</MStatusTag>
                <MStatusTag v-if="item.pendingReviewCount" type="warning" dot>待审核 {{ item.pendingReviewCount }}</MStatusTag>
              </div>
            </div>

            <div class="meta-row">
              <MIcon name="clock" size="sm" />
              <span>截止 {{ deadlineText(item) }}</span>
            </div>

            <div class="progress-row">
              <MProgress :value="progressOf(item).done" :max="progressOf(item).total || 1" label="提交进度" />
              <span class="progress-num">{{ progressOf(item).done }} / {{ progressOf(item).total }}</span>
            </div>

            <div class="card-foot">
              <span class="foot-note">{{ item.locked ? '已锁定，学生无法提交' : (item.allowResubmit ? '允许重交' : '不允许重交') }}</span>
              <div class="row g8">
                <button type="button" class="iconbtn action-btn" :aria-label="'更多操作：' + item.title" @click="openActions(item)">
                  <MIcon name="more" />
                </button>
                <router-link class="btn btn--sm btn--secondary" :to="'/m/teacher/assignments/' + item.id">查看详情</router-link>
              </div>
            </div>
          </article>

          <button v-if="hasMore" type="button" class="btn btn--secondary btn--block" :disabled="loadingMore" @click="loadMore">
            {{ loadingMore ? '加载中…' : '加载更多' }}
          </button>
        </div>
      </div>
    </main>

    <MSheet v-model:open="sheetOpen" :title="actionTarget ? actionTarget.title : '作业操作'" subtitle="手机端不支持编辑/删除作业">
      <div v-if="actionTarget" class="list">
        <button type="button" class="rowitem rowitem--tap" @click="askToggleLock">
          <span class="rowicon" :class="{ 'rowicon--warning': !actionTarget.locked, 'rowicon--neutral': actionTarget.locked }" aria-hidden="true">
            <MIcon name="lock" />
          </span>
          <span class="row-main">
            <span class="row-title">{{ actionTarget.locked ? '解除锁定' : '锁定作业' }}</span>
            <span class="row-sub">{{ actionTarget.locked ? '解锁后学生可以继续提交' : '锁定后学生将无法继续提交' }}</span>
          </span>
        </button>
        <button type="button" class="rowitem rowitem--tap" @click="copyLink">
          <span class="rowicon rowicon--neutral" aria-hidden="true"><MIcon name="link" /></span>
          <span class="row-main">
            <span class="row-title">复制作业链接</span>
            <span class="row-sub">电脑登录后可打开该作业</span>
          </span>
        </button>
      </div>
      <p class="help mt12">编辑作业、删除作业请在电脑端完成（移动端暂无对应接口）。</p>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" @click="sheetOpen = false">取消</button>
      </template>
    </MSheet>

    <MSheet v-model:open="lockConfirmOpen" :title="actionTarget && actionTarget.locked ? '解除锁定？' : '锁定作业？'" :subtitle="actionTarget ? actionTarget.title : ''">
      <div class="banner banner--warning">
        <MIcon name="alert" />
        <div v-if="actionTarget && actionTarget.locked">解锁后学生可以继续提交或修改，已提交内容不受影响。</div>
        <div v-else>锁定后学生将无法继续提交或修改，已提交内容不受影响；可随时解锁。</div>
      </div>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" :disabled="lockSubmitting" @click="lockConfirmOpen = false">取消</button>
        <button type="button" class="btn btn--primary btn--block" :disabled="lockSubmitting" @click="toggleLock">
          {{ lockSubmitting ? '处理中…' : (actionTarget && actionTarget.locked ? '确认解锁' : '确认锁定') }}
        </button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
.chips-wrap { margin-top: 12px; }
.title-link { color: inherit; }
.title-link:active { color: var(--text-link); }
.head-tags { display: flex; flex-direction: column; align-items: flex-end; flex: none; margin-left: 8px; }
.head-tags .tag + .tag { margin-top: 6px; }
.meta-row {
  display: flex;
  align-items: center;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.meta-row .icon { width: 14px; height: 14px; margin-right: 5px; color: var(--text-tertiary); }
.progress-row { display: flex; align-items: center; margin-top: 12px; }
.progress-row .bar { margin-right: 10px; }
.progress-num { flex: none; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.foot-note { font-size: 12px; color: var(--text-tertiary); }
.action-btn { width: 38px; height: 38px; color: var(--text-secondary); }
</style>
