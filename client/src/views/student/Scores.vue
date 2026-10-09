<template>
  <PageShell
    title="我的成绩"
    description="每次作业的最终得分与提交次数；成绩由教师发布后显示。"
    :max-width="'var(--layout-content-max)'"
  >
    <!-- TODO(P1-7): 接口支持服务端分页后切换（当前 /student/scores 全量返回，前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="assignmentId"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      empty-title="暂无成绩"
      empty-desc="完成作业并等老师发布成绩后，这里会显示每次作业的得分与提交次数。"
      empty-action-text="查看我的作业"
      @page-change="onPageChange"
      @empty-action="goAssignments"
    >
      <template #toolbar-right>
        <span class="muted">共 {{ list.length }} 条</span>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'assignment'">
          {{ record.assignmentTitle }}
          <StatusTag v-if="record.mode === 'practice'" tone="accent" text="练习" />
        </template>
        <template v-else-if="column.key === 'attemptCount'">
          <span class="tnum">{{ record.attemptCount || 1 }}</span> 次
        </template>
        <template v-else-if="column.key === 'score'">
          <strong class="tnum" :class="scoreBand(record)">{{ record.totalScore }}</strong>
          <span class="tnum score-max">/ {{ record.maxScore }}</span>
          <span v-if="record.bestScore != null && record.mode === 'practice'" class="tnum score-best">（最高 {{ record.bestScore }}）</span>
        </template>
      </template>
    </ListPage>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';

const router = useRouter();
const list = ref([]);
const loading = ref(false);
const page = reactive({ current: 1, pageSize: 20 });

const columns = [
  { title: '作业', key: 'assignment', width: 220, ellipsis: true },
  { title: '提交次数', key: 'attemptCount', width: 90 },
  { title: '分数', key: 'score', width: 140 },
];

/** 前端切片：接口全量返回，行为与改前 DataTable 的 clientPagination 一致（每页 20 条） */
const pagedList = computed(() => {
  const start = (page.current - 1) * page.pageSize;
  return list.value.slice(start, start + page.pageSize);
});

function onPageChange(next) {
  page.current = next;
}

/** 空态主操作：去作业列表（成绩只能由教师发布产生，页面本身无创建入口） */
function goAssignments() {
  router.push('/student/assignments');
}

/**
 * 分数语义色（阈值见 docs/ui-redesign/03-components.md §Progress）：
 * ≥90 优秀 / 75–89 良好 / 60–74 及格 / <60 不及格；分数或满分缺失时不着色。
 */
function scoreBand(record) {
  if (record.totalScore == null || record.maxScore == null) return '';
  const total = Number(record.totalScore);
  const max = Number(record.maxScore);
  if (!Number.isFinite(total) || !Number.isFinite(max) || max <= 0) return '';
  const percent = (total / max) * 100;
  if (percent >= 90) return 'is-excellent';
  if (percent >= 75) return 'is-good';
  if (percent >= 60) return 'is-pass';
  return 'is-fail';
}

async function fetch() {
  loading.value = true;
  const r = await request.get('/student/scores');
  list.value = r.data || [];
  loading.value = false;
}

onMounted(fetch);
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
.tnum {
  font-variant-numeric: tabular-nums;
}
.score-max {
  margin-left: 4px;
  color: var(--text-tertiary);
}
.score-best {
  margin-left: 4px;
  color: var(--text-tertiary);
  font-size: var(--fs-body-sm);
}
.is-excellent {
  color: var(--score-excellent);
}
.is-good {
  color: var(--score-good);
}
.is-pass {
  color: var(--score-pass);
}
.is-fail {
  color: var(--score-fail);
}
</style>
