/**
 * client/src/composables/admin/gradingRuns/useGradingRunsList.js —— 批改记录页的**列表状态 + 取数/分页/筛选**（B3 纯搬运：从 GradingRuns.vue 原样搬出）。
 *
 * 依赖注入：request（既有 axios 实例，带鉴权头）由页面传入；URL 保持既有字面量 '/admin/grading-runs'（行为不变）；
 * 请求参数/重置语义/分页对象与拆分前逐字一致。
 */
import { ref, reactive, computed } from 'vue';

export function useGradingRunsList({ request }) {
const loading = ref(false);
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({ assignmentId: null, type: undefined, runKind: undefined, status: undefined, sessions_purged: undefined });

const pagination = computed(() => ({
  current: page.value, pageSize: pageSize.value, total: total.value, showSizeChanger: true,
  showTotal: (t) => `共 ${t} 条`,
}));

async function load() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (filters.assignmentId) params.assignmentId = filters.assignmentId;
    if (filters.type) params.type = filters.type;
    if (filters.runKind) params.run_kind = filters.runKind;
    if (filters.status) params.status = filters.status;
    if (filters.sessions_purged) params.sessions_purged = filters.sessions_purged;
    const res = await request.get('/admin/grading-runs', { params });
    const data = (res && res.data) || res;
    items.value = (data && data.items) || [];
    total.value = (data && data.total) || 0;
  } catch (err) {
    items.value = []; total.value = 0;
  } finally {
    loading.value = false;
  }
}
function reload() { page.value = 1; load(); }
function reset() {
  filters.assignmentId = null; filters.type = undefined; filters.runKind = undefined; filters.status = undefined; filters.sessions_purged = undefined;
  reload();
}
function onTableChange(pg) { page.value = pg.current || 1; pageSize.value = pg.pageSize || 20; load(); }

  return {
    loading, items, total, page, pageSize, filters,
    load, reload, reset, onTableChange, pagination,
  };
}
