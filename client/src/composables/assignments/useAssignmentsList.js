/**
 * useAssignmentsList.js —— 由 client/src/views/teacher/Assignments.vue 拆分而来（R2-B64 / t4）
 * 职责：列表态（服务端分页 + 服务端筛选）、KPI 汇总、行操作（锁定/解锁）。
 * 源：:316-421（列表态与取数）、:711-717（toggleLock）。
 * 行为不变：接口路径与 params 拼装、loading 复位、空态按钮语义、锁定行的乐观更新与文案逐字保持。
 * 说明（与 D1 §1.2 分组的偏差）：toggleLock 归列表（行操作）而非表单；pure 只收 record 级纯函数。
 */
import { ref, reactive, computed } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';

export function useAssignmentsList({ openAdd }) {
  // ===================== 列表（Wave 1 试点：服务端筛选 + 真实进度 + 状态语义） =====================
  const loading = ref(false);
  const list = ref([]);
  const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
  const filters = reactive({ keyword: '', classId: undefined, status: undefined });
  /** 待审核汇总：与「评分审核」页同源（Batch1 GET /teacher/pending-summary） */
  const summary = reactive({ pendingReview: 0, aiPending: 0, abnormal: 0 });
  const hasFilter = computed(() => !!(filters.keyword || filters.classId || filters.status));

  async function fetchSummary() {
    try {
      const r = await request.get('/teacher/pending-summary');
      Object.assign(summary, r.data || {});
    } catch {
      // KPI 是辅助信息，失败不阻塞列表（错误提示由 request 拦截器统一处理）
    }
  }

  async function fetch() {
    loading.value = true;
    try {
      const params = { page: pagination.current, pageSize: pagination.pageSize };
      if (filters.keyword) params.keyword = filters.keyword;
      if (filters.classId) params.classId = filters.classId;
      if (filters.status) params.status = filters.status;
      const [r] = await Promise.all([request.get('/teacher/assignments', { params }), fetchSummary()]);
      list.value = r.data.list || [];
      pagination.total = r.data.total || 0;
    } finally {
      loading.value = false;
    }
  }

  function applyFilters() {
    pagination.current = 1;
    fetch();
  }
  function resetFilters() {
    filters.keyword = '';
    filters.classId = undefined;
    filters.status = undefined;
    applyFilters();
  }
  function onPageChange(page) {
    pagination.current = page;
    fetch();
  }

  /** 源 :417-421 —— 空态按钮：有筛选 → 清空筛选；无数据 → 布置第一份作业（openAdd 由调用方注入，避免与表单成环） */
  function onEmptyAction() {
    if (hasFilter.value) resetFilters();
    else openAdd();
  }

  /** 源 :711-717 —— 行操作：锁定/解锁 */
  async function toggleLock(record) {
    try {
      await request.put('/teacher/assignments/' + record.id + '/lock');
      record.locked = !record.locked;
      message.success(record.locked ? '已锁定' : '已解锁');
    } catch { message.error('操作失败'); }
  }

  return { loading, list, pagination, filters, summary, hasFilter, fetch, fetchSummary, applyFilters, resetFilters, onPageChange, onEmptyAction, toggleLock };
}
