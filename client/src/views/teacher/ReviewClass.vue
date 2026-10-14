<template>
  <PageShell :title="assignmentTitle || '加载中...'" :description="pageDesc">
    <template #actions>
      <a-button type="link" @click="$router.push('/teacher/review')">← 返回评分审核</a-button>
      <!-- ★R2-B68（WAVE3）：按班看失分项分布（只读抽屉；口径=既有批改结果投影 breakdown） -->
      <a-button :disabled="!assignmentId" @click="lossOpen = true">失分项分布</a-button>
    </template>

    <!-- ★R2-B47（U-1）：错态（请求失败/异常）必须有可读提示 + 重试入口 ⇒ 任何情况下不白屏 -->
    <a-alert
      v-if="loadError"
      type="error" show-icon :message="'加载失败：' + loadError"
      description="可点击右侧「重试」重新拉取；也可返回上一页后再进入。"
      style="margin-bottom:12px;"
    >
      <template #action><a-button size="small" @click="fetch">重试</a-button></template>
    </a-alert>

    <ListPage
      :columns="columns"
      :data-source="list"
      :loading="loading"
      row-key="id"
      :total="pagination.total"
      :current="pagination.current"
      :page-size="pagination.pageSize"
      empty-title="没有符合条件的学生"
      empty-desc="换个筛选条件或清空搜索词后再试。"
      empty-action-text="清空筛选"
      @page-change="onPageChange"
      @empty-action="resetFilters"
      @change="onTableChange"
    >
      <template #toolbar>
        <a-input-search v-model:value="keyword" placeholder="搜索学生姓名" allow-clear class="w-240"
          @search="fetch" @change="onSearchChange" />
        <a-radio-group v-model:value="filter" button-style="solid" size="small" @change="fetch">
          <a-radio-button value="all">全部</a-radio-button>
          <a-radio-button value="submitted">已交</a-radio-button>
          <a-radio-button value="not_submitted">未交</a-radio-button>
          <a-radio-button value="pending_review">待审核</a-radio-button>
          <a-radio-button value="abnormal">异常</a-radio-button>
        </a-radio-group>
      </template>

      <template #toolbar-right>
        <!-- ★R3-D9（t17 / F-C4-2）：批量控件不再按作业模式隐藏 —— 历史「练习」作业同样需要一键审核/发布 -->
        <a-button type="primary" @click="batchReview" :loading="reviewing">一键审核全班</a-button>
        <a-button @click="batchPublish" :loading="publishing">一键发布全班</a-button>
        <a-button @click="exportXlsx">导出 Excel</a-button>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'studentName'">
          {{ record.studentName }}
        </template>
        <template v-else-if="column.key === 'studentNo'">
          {{ formatStudentNo(record.studentNo, record.schoolName) }}
        </template>
        <template v-else-if="column.key === 'aiScore'">{{ record.aiScore ?? '—' }}</template>
        <template v-else-if="column.key === 'finalScore'">
          <template v-if="!record.submitted"><span class="dim-text">—</span></template>
          <template v-else-if="editingId === record.id">
            <input
              ref="scoreInputRef"
              v-model.number="editValue"
              class="score-input"
              @blur="saveScore(record)"
              @keydown.enter="saveScore(record)"
              @keydown.escape="cancelEdit"
            />
          </template>
          <template v-else>
            <span class="score-val" @click="startEdit(record)" :title="record.finalScore != null ? '点击修改分数' : '点击设置分数'">
              {{ record.finalScore != null ? record.finalScore : '—' }}
            </span>
          </template>
        </template>
        <template v-else-if="column.key === 'status'">
          <StatusTag v-if="record.status === 'not_submitted'" tone="neutral" text="未交" />
          <StatusTag
            v-else
            :tone="statusTone(record.status)"
            :text="statusText(record.status)"
            :dot="record.status === 'submitted'"
          />
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button v-if="record.submitted" type="link" @click="openReview(record)">审核</a-button>
            <span v-else class="dim-text">—</span>
          </div>
        </template>
      </template>
    </ListPage>

    <LossDistributionDrawer v-model:open="lossOpen" :assignment-id="assignmentId" :class-id="classId" role="teacher" />
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { io } from 'socket.io-client';
import { createTeacherSocket } from '../../composables/socketConfig.js';   // ★R2-B53：端点（默认 /exam/socket.io）与一次性日志
import request from '../../api/request.js';
import { useSafeRequest } from '../../composables/useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡
import { useUserStore } from '../../stores/user.js';
import { savedSortField, savedSortOrder, savedPage } from '../../stores/reviewStore.js';
import { exportReviewXlsx } from '../../infrastructure/export.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import LossDistributionDrawer from '../../components/LossDistributionDrawer.vue';   // ★R2-B68：按班失分项分布抽屉
import { useConfirm } from '../../composables/useConfirm.js';

/** ★R2-B54：UI 文案固定友好；原始错误只进 console（⑨e 会抽取本函数体执行断言） */
function friendlyLoadError(err) {
  // eslint-disable-next-line no-console
  console.error('[R2-B54] ReviewClass.vue 数据加载失败（原始错误只进 console，不进 UI）', err);
  return '数据加载失败，请重试';
}

/** 命令式确认框（Wave 2 构件 useConfirm）：替代原 antd 命令式调用，行为等价 */
const { confirm } = useConfirm();

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'teacher/ReviewClass.vue' });
/**
 * ★R2-B47（U-1）：路由参数一律**在请求时**从 route 读取（computed，不再是 setup 期一次性捕获的旧值）
 * ⇒ 路由重入 / 换班 / 带不同 query 返回时，请求用的永远是**当前**路由的参数。
 */
const classId = computed(() => +route.params.classId);
const assignmentId = computed(() => (route.query.assignmentId === undefined || route.query.assignmentId === '' ? null : +route.query.assignmentId));

const loading = ref(false);
const loadError = ref('');     // ★错态（不为空 ⇒ 模板显示错误 + 重试入口，绝不白屏）
const lossOpen = ref(false);   // ★R2-B68：失分项分布抽屉（打开时才请求；空/错态由抽屉自己兜底）
const list = ref([]);
const keyword = ref('');
const filter = ref('all');
const reviewing = ref(false);
const publishing = ref(false);
const assignmentTitle = ref('');
const className = ref('');
const pagination = reactive({ current: savedPage.value, pageSize: 20, total: 0 });

// 分页变化时同步到模块变量
watch(() => pagination.current, (v) => { savedPage.value = v; });

const sortField = savedSortField;
const sortOrder = savedSortOrder;

function openReview(record) {
  if (record.projectSubmissionId) {
    router.push(`/teacher/review/project/${record.projectSubmissionId}`);
  } else {
    router.push(`/teacher/review/${record.id}`);
  }
}

/** 表头排序：写回 reviewStore 并带参重新取数（与改前的 onTableChange 逐字一致） */
function onTableChange(_p, _f, sorter) {
  sortField.value = sorter.order ? sorter.field : '';
  sortOrder.value = sorter.order || '';
  fetch();
}

const editingId = ref(null);
const editValue = ref(0);
const scoreInputRef = ref(null);

function startEdit(record) {
  editingId.value = record.id;
  editValue.value = record.finalScore ?? record.aiScore ?? 0;
  nextTick(() => scoreInputRef.value?.focus());
}
function cancelEdit() { editingId.value = null; }
async function saveScore(record) {
  const val = editValue.value;
  editingId.value = null;
  if (val == null || val === record.finalScore) return;
  try {
    const r = await request.put(`/teacher/submissions/${record.id}/score`, { finalScore: val });
    Object.assign(record, { finalScore: r.data.finalScore, status: r.data.status, teacherFeedback: r.data.teacherFeedback || record.teacherFeedback });
    message.success('分数已更新');
  } catch { message.error('修改失败'); }
}

const columns = computed(() => [
  { title: '姓名', key: 'studentName', width: 120 },
  { title: '学号', dataIndex: 'studentNo', key: 'studentNo', width: 140, sorter: (a, b) => (a.studentNo || '').localeCompare(b.studentNo || ''), defaultSortOrder: sortField.value === 'studentNo' ? sortOrder.value : undefined },
  { title: 'AI评分', dataIndex: 'aiScore', key: 'aiScore', width: 90, sorter: (a, b) => (a.aiScore || 0) - (b.aiScore || 0), defaultSortOrder: sortField.value === 'aiScore' ? sortOrder.value : undefined, responsive: ['xl'] },
  { title: '最终分', dataIndex: 'finalScore', key: 'finalScore', width: 90, sorter: (a, b) => (a.finalScore || 0) - (b.finalScore || 0), defaultSortOrder: sortField.value === 'finalScore' ? sortOrder.value : undefined },
  { title: '状态', key: 'status', width: 120, sorter: (a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0) },
  { title: '操作', key: 'action', width: 80, align: 'right' },
]);

const statusOrder = { not_submitted: 0, submitted: 1, abnormal: 2, ai_graded: 3, reviewed: 4, published: 5 };
/** 状态色调（取值语义与改前的 a-tag 配色一致：green→success / blue→brand / red→danger / default→neutral） */
function statusTone(s) {
  if (s === 'published') return 'success';
  if (s === 'reviewed') return 'brand';
  if (s === 'abnormal') return 'danger';
  if (s === 'ai_graded') return 'success';
  return 'neutral';
}
function statusText(s) {
  if (s === 'published') return '已发布';
  if (s === 'reviewed') return '已审核';
  if (s === 'abnormal') return '评分异常';
  if (s === 'ai_graded') return 'AI已评分';   // ★R3-D9：不再按模式改写状态文案
  if (s === 'submitted') return '待评分';
  return s;
}

/** 页头副标题：班级名（★R3-D9：不再追加「练习模式」等由 mode 派生的字样） */
const pageDesc = computed(() => {
  const parts = [];
  if (className.value) parts.push(className.value);
  return parts.join(' · ');
});

function formatStudentNo(studentNo, schoolName) {
  if (!studentNo) return '';
  const at = studentNo.lastIndexOf('@');
  if (at > 0 && schoolName) {
    return studentNo.substring(0, at) + '@' + schoolName;
  }
  // 没有学校名但有@ → 只显示学号
  if (at > 0) return studentNo.substring(0, at);
  return studentNo;
}

let timer = null;
function onSearchChange() { clearTimeout(timer); timer = setTimeout(fetch, 300); }

function resetFilters() {
  keyword.value = '';
  filter.value = 'all';
  pagination.current = 1;
  fetch();
}

async function fetch() {
  loading.value = true;
  loadError.value = '';
  try {
    const params = { assignmentId: assignmentId.value, page: pagination.current, pageSize: pagination.pageSize, filter: filter.value };
    if (sortField.value) { params.sortField = sortField.value; params.sortOrder = sortOrder.value; }
    if (keyword.value) params.keyword = keyword.value;
    const r = await request.get(`/teacher/review-class/${classId.value}`, { params });
    const rows = (r.data && r.data.list) || [];
    list.value = rows;
    pagination.total = (r.data && r.data.total) || 0;
    if (rows.length && !assignmentTitle.value) {
      const first = rows.find(i => i.assignmentTitle);
      if (first) {
        assignmentTitle.value = first.assignmentTitle || '';
        className.value = first.className || '';
      }
    }
  } catch (e) {
    // ★U-1：请求失败 ⇒ 清空 + 进入**错态**，绝不停在"加载中/空白"；★R2-B54：UI 只放固定友好文案（原始错误进 console）
    list.value = [];
    pagination.total = 0;
    loadError.value = friendlyLoadError(e);
  } finally {
    loading.value = false;     // ★任何路径都必须复位 loading（旧代码在请求之后裸置；抛错则永不复位 ⇒ 白屏）
  }
}

function onPageChange(page, size) {
  pagination.current = page;
  pagination.pageSize = size || pagination.pageSize;
  fetch();
}

async function batchReview() {
  reviewing.value = true;
  try {
    // ★W1（t1）：原 try/finally 无 catch ⇒ 失败冒泡到错误边界；现失败就地提示、列表保持可用
    const r = await safeSubmit(
      () => request.post('/teacher/submissions/batch-review', { schoolId: userStore.currentSchool?.id, classId: classId.value, assignmentId: assignmentId.value }),
      { action: '一键审核全班' },
    );
    if (r.error) return;
    message.success((r.res && r.res.message) || '已一键审核'); fetch();
  } finally { reviewing.value = false; }
}
async function batchPublish() {
  confirm({
    title: '确认一键发布全班？',
    content: '发布后全班学生将能看到分数和评语；分数仍可修改，改完重新发布即可。',
    okText: '发布全班成绩',
    cancelText: '取消',
    danger: true,   // 全班成绩公开（批量发布）
    onOk: async () => {
      publishing.value = true;
      try {
        // ★W1（t1）：同上 —— 发布失败只提示，页面/列表不受影响
        const r = await safeSubmit(
          () => request.post('/teacher/submissions/batch-publish', { schoolId: userStore.currentSchool?.id, classId: classId.value, assignmentId: assignmentId.value }),
          { action: '发布全班成绩' },
        );
        if (r.error) return;
        message.success((r.res && r.res.message) || '已发布全班成绩'); fetch();
      } finally { publishing.value = false; }
    },
  });
}
async function exportXlsx() {
  // ★W1（t1）：导出失败只就地提示（原裸 await ⇒ 失败会把整页替换成错误页）
  const r = await safeLoad(() => request.get('/teacher/export-review', { params: { classId: classId.value, assignmentId: assignmentId.value } }), { action: '导出成绩' });
  if (r.error) return;
  exportReviewXlsx(r.data, className.value, assignmentTitle.value);
}

let socket = null;
/**
 * ★R2-B53：与 Review.vue 同款 —— 端点由 composables/socketConfig.js 统一解析（默认 path=/exam/socket.io，
 *   可经 VITE_WS_PATH / VITE_WS_URL 覆盖）。旧注释「socket 挂根路径 /socket.io」**有误**：
 *   nginx 按**最长前缀**匹配，云上 location /exam/socket.io/ 优先于静态块 location /exam/ ⇒ 该路径可用；
 *   而根路径 /socket.io/ 在 nginx 上无 location ⇒ 必然连不上（实机控制台已证实）。
 * 连接失败**不得影响渲染**：创建包在 try/catch 内，且不阻塞挂载（不在 setup 顶层 await）。
 */
function connectSocket() {
  try {
    socket = createTeacherSocket(io);
    if (!socket) return;
    socket.on('connect', () => { socket.emit('join-school', userStore.currentSchool?.id); });
    let lastRefresh = 0;
    socket.on('graded', () => {
      const now = Date.now();
      if (now - lastRefresh > 3000) { lastRefresh = now; fetch(); }
    });
  } catch (err) {
    console.warn('[socket] 初始化异常（页面功能不受影响）：', err && err.message);
  }
}

/** ★R2-B47（U-1）：路由参数变化（同组件复用/带新 query 重入）⇒ 重置页码并重建数据 */
watch(() => [route.params.classId, route.query.assignmentId], () => {
  pagination.current = 1;
  assignmentTitle.value = '';
  fetch();
});

onMounted(() => {
  fetch();               // ★computed 参数 ⇒ 挂载时读到的就是当前路由（返回后重入也会重新拉取）
  connectSocket();
});
onUnmounted(() => {
  if (socket) { socket.emit('leave-school', userStore.currentSchool?.id); socket.disconnect(); }
});
</script>

<style scoped>
.w-240 {
  width: 240px;
}
.dim-text {
  color: var(--text-tertiary);
}
.row-actions {
  display: flex;
  justify-content: flex-end;
}

/* 行内改分：点击分数进入编辑（交互未改动） */
.score-val {
  cursor: pointer;
  border-bottom: 1px dashed transparent;
}
.score-val:hover {
  border-bottom-color: var(--brand-600);
}
.score-input {
  width: 60px;
  height: var(--control-h-sm);
  text-align: center;
  border: 1px solid var(--border-focus);
  border-radius: var(--radius-xs);
  outline: none;
  font-size: var(--fs-body);
}
</style>
