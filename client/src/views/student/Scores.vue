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
        <!-- 作业：两行式（主 = 作业标题；次 = 题型 · 满分[ · 最高分]），宽度 1fr -->
        <template v-if="column.key === 'assignment'">
          <span class="lp-stack">
            <b>{{ record.assignmentTitle }}</b>
            <span>{{ assignmentSub(record) }}</span>
          </span>
        </template>

        <!-- 提交次数：右对齐等宽数字，单位写在 u 里自动弱化 -->
        <template v-else-if="column.key === 'attemptCount'">
          <span class="lp-num">{{ record.attemptCount || 1 }}<u>次</u></span>
        </template>

        <!-- 分数（本页视觉重点）：大字号 + 三档语义色；未出分显示「—」（次要色） -->
        <template v-else-if="column.key === 'score'">
          <span class="lp-num score-num" :class="scoreBand(record)">
            <template v-if="record.totalScore == null">—</template>
            <template v-else>{{ record.totalScore }}<u v-if="record.maxScore != null">/{{ record.maxScore }}</u></template>
          </span>
        </template>

        <!-- 状态：R3-D1（US-B5 前端部分）不再按「练习模式」分支 —— /student/scores 只返回**已出分**的行
              （已发布；或历史 practice 作业已评分），故统一显示「已出分」；色调沿用全站 success 口径。
              后端补 status/口径字段后可再细分（见交付报告的已知缺口）。 -->
        <template v-else-if="column.key === 'status'">
          <StatusTag tone="success" text="已出分" dot />
        </template>
      </template>
    </ListPage>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import request from '../../api/request.js';
import { useSafeRequest } from '../../composables/useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';

const router = useRouter();
const { safeLoad } = useSafeRequest({ tag: 'student/Scores.vue' });
const list = ref([]);
const loading = ref(false);
const page = reactive({ current: 1, pageSize: 20 });

// 列表样式 v2：主列两行式；数字列右对齐（单位走 u）；分数列大字号分档着色（见 scoped 样式）
const columns = [
  { title: '作业', key: 'assignment', width: '1fr' },
  { title: '提交次数', key: 'attemptCount', width: 110, align: 'right' },
  { title: '分数', key: 'score', width: 150, align: 'right' },
  { title: '状态', key: 'status', width: 140 },
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
 * 作业列次行：满分[ · 最高分]，全部沿用现有字段。
 * R3-D1（US-B5 前端部分）：不再渲染「练习/考试」题型词（mode 不再是行为开关）；缺失段自动跳过。
 */
function assignmentSub(record) {
  const parts = [];
  if (record.maxScore != null) parts.push('满分 ' + record.maxScore);
  if (record.bestScore != null) parts.push('最高 ' + record.bestScore);
  return parts.join(' · ');
}

/**
 * 分数分档语义色（class 定义在本页 scoped 样式，不动全局类）：
 * 得分率 ≥90 绿 / ≥60 品牌蓝 / <60 红；未出分（totalScore 为空）走 is-empty（次要色 + 「—」）。
 * 满分缺失或非正数时不着色（沿用主色），避免除零产生错误分档。
 */
function scoreBand(record) {
  if (record.totalScore == null) return 'is-empty';
  const max = Number(record.maxScore);
  if (!Number.isFinite(max) || max <= 0) return '';
  const percent = (Number(record.totalScore) / max) * 100;
  if (percent >= 90) return 'is-high';
  if (percent >= 60) return 'is-mid';
  return 'is-low';
}

async function fetch() {
  loading.value = true;
  try {
    const r = await safeLoad(() => request.get('/student/scores'), { action: '加载成绩' });
    if (!r.error) list.value = r.data || [];
  } finally {
    loading.value = false;
  }
}

onMounted(fetch);
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}

/* 分数列：本页视觉重点 —— 大字号（19px）+ 三档语义色。
   .lp-num 是全局工具类，故用「双类」提高优先级，只覆盖本页这一处，不改全局样式；
   单位（/满分）由 .lp-num > u 自动弱化，不受这里的颜色影响。 */
.lp-num.score-num {
  font-size: 19px;
  font-weight: var(--fw-semibold);
}
.lp-num.score-num.is-high {
  color: var(--green-600);
}
.lp-num.score-num.is-mid {
  color: var(--brand-600);
}
.lp-num.score-num.is-low {
  color: var(--red-600);
}
.lp-num.score-num.is-empty {
  color: var(--text-tertiary);
  font-weight: var(--fw-regular);
}
</style>
