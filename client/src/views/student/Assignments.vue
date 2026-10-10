<template>
  <!-- 卡片式列表变体（docs/ui-redesign/05-page-specs.md §2 #21）：保留行点击进入与四态筛选，不改成表格 -->
  <PageShell
    title="我的作业"
    description="查看作业要求与截止时间；点击作业卡片进入作答或查看反馈。"
    :max-width="'var(--layout-content-max)'"
  >
    <div class="card">
      <div class="toolbar">
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索作业标题"
          allow-clear
          class="w-280"
          @search="fetch"
          @change="onSearchChange"
        />
        <a-radio-group v-model:value="activeFilter" button-style="solid" size="small" @change="onFilterChange">
          <a-radio-button v-for="f in filters" :key="f.key" :value="f.key">{{ f.label }}</a-radio-button>
        </a-radio-group>
        <span class="toolbar-right muted">共 {{ filteredList.length }} 项</span>
      </div>
    </div>

    <a-spin :spinning="loading">
      <div v-if="filteredList.length" class="assign-list">
        <div
          v-for="record in pagedList"
          :key="record.id"
          class="assign"
          :class="{ 'is-enterable': canEnter(record) }"
          :role="canEnter(record) ? 'button' : null"
          :tabindex="canEnter(record) ? 0 : null"
          :aria-disabled="canEnter(record) ? null : 'true'"
          @click="goDetail(record)"
          @keydown.enter="goDetail(record)"
          @keydown.space.prevent="goDetail(record)"
        >
          <div class="assign-main">
            <h3 class="assign-title">
              <span class="ellipsis" :title="record.title">{{ record.title }}</span>
              <StatusTag :tone="statusTone(record)" :text="statusText(record)" dot />
              <StatusTag v-if="record.mode === 'practice'" tone="accent" text="练习" />
              <LockOutlined v-if="record.locked" class="lock-icon" title="已锁定" />
            </h3>
            <div class="assign-meta">
              <span>共 <span class="meta-v tnum">{{ record._count?.assignmentQuestions || 0 }}</span> 题</span>
              <span>开始 <span class="meta-v tnum">{{ formatDateTime(record.startTime) }}</span></span>
              <span>
                截止 <span class="meta-v tnum">{{ formatDateTime(record.endTime) }}</span>
                <span v-if="deadlineOf(record).text" class="countdown" :class="'tone-' + deadlineOf(record).tone">
                  （{{ deadlineOf(record).text }}）
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 空态三件套：无搜索结果 → 清空筛选；无数据 → 刷新 -->
      <div v-else-if="!loading" class="empty">
        <div class="empty-title">{{ hasFilter ? '没有符合条件的作业' : '还没有收到作业' }}</div>
        <div class="empty-desc">
          {{ hasFilter ? '换个关键词或清空筛选后再试。' : '老师布置作业后，这里会显示作业要求与截止时间。' }}
        </div>
        <a-button v-if="hasFilter" @click="resetFilters">清空筛选</a-button>
        <a-button v-else @click="fetch">刷新</a-button>
      </div>
    </a-spin>

    <!-- 前端切片分页（/student/assignments 对 keyword 命中结果全量返回）：与改前 DataTable 行为一致，仅在超过一页时出现 -->
    <!-- TODO(P1-7): 接口支持服务端分页后切换（/student/assignments 目前全量返回，沿用前端切片） -->
    <div v-if="filteredList.length > listPage.pageSize" class="card table-foot">
      <span>第 {{ listPage.current }} 页 · 每页 {{ listPage.pageSize }} 条</span>
      <a-pagination
        :current="listPage.current"
        :page-size="listPage.pageSize"
        :total="filteredList.length"
        :show-size-changer="false"
        size="small"
        @change="onPageChange"
      />
    </div>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import request from '../../api/request.js';
import { LockOutlined } from '@ant-design/icons-vue';
import PageShell from '../../components/PageShell.vue';
import StatusTag from '../../components/StatusTag.vue';
import { formatDateTime, deadlineInfo } from '../../domain/format.js';

const router = useRouter();
const list = ref([]);
const listPage = reactive({ current: 1, pageSize: 20 });
const loading = ref(false);
const keyword = ref('');
const activeFilter = ref('all');
const now = ref(Date.now());
let nowTimer = null;

const filters = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '未完成' },
  { key: 'done', label: '已完成' },
  { key: 'published', label: '已出分' },
];

/** 是否处于筛选/搜索态（决定空态文案走「无搜索结果」还是「无数据」） */
const hasFilter = computed(() => !!keyword.value || activeFilter.value !== 'all');

function isNotStarted(a) { return now.value < new Date(a.startTime).getTime(); }
function isExpired(a) { return now.value > new Date(a.endTime).getTime(); }
function hasRealSubmit(a) { return (a.submissions || []).some(s => s.status !== 'draft'); }
/** 实训题作业判定：仅实训题使用"已批改"文案，编程题保持原语义 */
function isProjectAssignment(a) {
  return (a.assignmentQuestions || []).some(q => q.question?.type === 'project');
}

function statusColor(a) {
  if (isNotStarted(a) && !hasRealSubmit(a)) return 'orange';
  const s = a.submissions?.[0]?.status;
  if (s === 'published') return 'success';
  // 实训题：已批改（reviewed）绿色；编程题保持 processing
  if (s === 'reviewed') return isProjectAssignment(a) ? 'success' : 'processing';
  if (s === 'submitted' || s === 'ai_graded') return 'processing';
  if (isExpired(a) && !hasRealSubmit(a)) return 'red';
  if (s === 'draft') return 'default';
  return 'default';
}

function statusText(a) {
  if (isNotStarted(a) && !hasRealSubmit(a)) return '未开始';
  const s = a.submissions?.[0]?.status;
  if (s === 'published') return '已出分';
  // 实训题：审核通过（reviewed）即已批改放分；编程题保持"已提交"
  if (s === 'reviewed') return isProjectAssignment(a) ? '已批改' : '已提交';
  if (s === 'submitted' || s === 'ai_graded') return '已提交';
  if (isExpired(a) && !hasRealSubmit(a)) return '已过期';
  if (s === 'draft') return '草稿';
  return '未提交';
}

/** a-tag 配色 → StatusTag tone（一一对应，状态判断逻辑未改） */
const STATUS_TONE = {
  orange: 'warning',
  success: 'success',
  processing: 'brand',
  red: 'danger',
  default: 'neutral',
};
function statusTone(a) { return STATUS_TONE[statusColor(a)] || 'neutral'; }

/** 截止语义（剩 N 天 / 剩 N 小时 / 已截止）：随下方 10s 定时器一起刷新 */
function deadlineOf(a) { return deadlineInfo(a.endTime); }

function canEnter(a) { return !a.locked && !isNotStarted(a) && !(isExpired(a) && !hasRealSubmit(a)); }

let timer = null;
function onSearchChange() { listPage.current = 1; clearTimeout(timer); timer = setTimeout(fetch, 300); }
function onFilterChange() { listPage.current = 1; fetch(); }
function onPageChange(page) { listPage.current = page; }
function resetFilters() { keyword.value = ''; activeFilter.value = 'all'; onFilterChange(); }

const filteredList = computed(() => {
  let result = list.value;
  if (activeFilter.value !== 'all') {
    result = result.filter(a => {
      const s = a.submissions?.length ? a.submissions[0]?.status : null;
      if (activeFilter.value === 'published') return s === 'published';
      if (activeFilter.value === 'done') return s === 'submitted' || s === 'ai_graded' || s === 'reviewed';
      if (activeFilter.value === 'todo') return !s || s === 'draft';
      return true;
    });
  }
  return result;
});

/** 前端切片：与改前 DataTable 的 clientPagination 行为一致（每页 20 条） */
const pagedList = computed(() => {
  const start = (listPage.current - 1) * listPage.pageSize;
  return filteredList.value.slice(start, start + listPage.pageSize);
});

function goDetail(record) {
  if (!canEnter(record)) return;
  const projectQ = record.assignmentQuestions?.find(aq => aq.question?.type === 'project');
  if (projectQ) {
    router.push(`/student/assignments/${record.id}/project/${projectQ.question.id}`);
  } else {
    router.push(`/student/assignments/${record.id}`);
  }
}

async function fetch() {
  loading.value = true;
  const r = await request.get('/student/assignments', { params: { keyword: keyword.value || undefined } });
  list.value = r.data.list || [];
  loading.value = false;
}

onMounted(() => {
  fetch();
  nowTimer = setInterval(() => { now.value = Date.now(); }, 10000);
});
onUnmounted(() => { clearInterval(nowTimer); });
</script>

<style scoped>
/* ===== 工具栏 ===== */
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-bd);
  border-radius: var(--card-radius);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 12px var(--card-pad);
  flex-wrap: wrap;
}
.toolbar-right {
  margin-left: auto;
}
.w-280 {
  width: 280px;
}
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tnum {
  font-variant-numeric: tabular-nums;
}

/* ===== 卡片式列表（样式取自 docs/ui-redesign/preview/index.html 的 .assign-*，全部走令牌） ===== */
.assign-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.assign {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--card-pad);
  background: var(--card-bg);
  border: 1px solid var(--card-bd);
  border-radius: var(--card-radius);
  transition: var(--transition-surface);
}
.assign.is-enterable {
  cursor: pointer;
}
.assign.is-enterable:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}
.assign:not(.is-enterable) {
  cursor: not-allowed;
}
.assign-main {
  min-width: 0;
  flex: 1;
}
.assign-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 6px;
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.assign-title .ellipsis {
  max-width: 460px;
}
.assign-meta {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  font-size: var(--fs-caption);
  color: var(--text-tertiary);
}
.assign-meta .meta-v {
  font-weight: var(--fw-medium);
  color: var(--text-secondary);
}
.assign-meta .tone-overdue {
  color: var(--status-danger-fg);
  font-weight: var(--fw-medium);
}
.assign-meta .tone-urgent {
  color: var(--status-danger-fg);
  font-weight: var(--fw-medium);
}
.assign-meta .tone-soon {
  color: var(--status-warning-fg);
}
.assign-meta .tone-normal {
  color: var(--text-tertiary);
}
.lock-icon {
  color: var(--status-danger-fg);
  font-size: var(--fs-caption);
}

/* ===== 空态 ===== */
.empty {
  padding: var(--space-8) var(--space-4);
  margin-top: var(--space-4);
  text-align: center;
  background: var(--card-bg);
  border: 1px solid var(--card-bd);
  border-radius: var(--card-radius);
}
.empty-title {
  font-size: var(--fs-title-3);
  font-weight: var(--fw-semibold);
  color: var(--text-primary);
}
.empty-desc {
  margin: 6px 0 16px;
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
}

/* ===== 底部分页栏（仅在超过一页时出现） ===== */
.table-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px var(--card-pad);
  margin-top: var(--space-4);
  font-size: var(--fs-caption);
  color: var(--text-tertiary);
}
</style>
