<template>
  <PageShell
    title="批改记录"
    description="每次批改/造尺运行的只读留档：计数口径、会话销毁证据与逐份结果。本页只读，不触发写操作。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <StatusTag :tone="loading ? 'neutral' : 'success'" :text="`共 ${total} 条`" />
      <a-button size="small" :loading="loading" @click="load">刷新</a-button>
    </template>
    <a-card size="small" class="filter-card">
      <a-space wrap>
        <a-input-number v-model:value="filters.assignmentId" placeholder="作业ID" style="width: 120px" :min="1" />
        <a-select v-model:value="filters.type" placeholder="类型" style="width: 150px" allowClear :options="typeOptions" />
        <a-select v-model:value="filters.sessions_purged" placeholder="会话销毁" style="width: 170px" allowClear :options="purgeOptions" />
        <a-select v-model:value="filters.status" placeholder="状态" style="width: 140px" allowClear :options="statusOptions" />
        <a-button type="primary" size="small" @click="reload">查询</a-button>
        <a-button size="small" @click="reset">重置</a-button>
      </a-space>
    </a-card>
    <a-card size="small">
      <a-table :columns="cols" :dataSource="items" rowKey="id" size="small" :loading="loading"
        :pagination="pagination" :scroll="{ x: 1180 }" @change="onTableChange">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'archive'">
            <a class="link" @click="openDetail(record)">{{ record.archive || '—' }}</a>
            <div class="muted">{{ record.id }}</div>
          </template>
          <template v-else-if="column.key === 'type'">
            <StatusTag :tone="record.type === 'build' ? 'neutral' : 'success'" :text="record.type" dot />
          </template>
          <template v-else-if="column.key === 'sessions_purged'">
            <StatusTag :tone="purgeTone(record.sessions_purged)" :text="purgeText(record.sessions_purged)" dot />
          </template>
          <template v-else-if="column.key === 'counts'">
            <span class="mono">m={{ record.measured ?? '—' }} u={{ record.unmeasurable ?? '—' }} f={{ record.failed ?? '—' }} s={{ record.skipped ?? '—' }} w={{ record.written ?? '—' }}</span>
          </template>
          <template v-else-if="column.key === 'elapsed_ms'">{{ fmtElapsed(record.elapsed_ms) }}</template>
        </template>
      </a-table>
      <a-empty v-if="!loading && !items.length" :image="false"
        description="暂无批改记录：可能尚未运行过批改，或归档根不可读（接口会返回空列表而非报错）" />
    </a-card>
    <a-drawer v-model:open="detailOpen" :width="920" title="运行详情（只读）" placement="right">
      <a-spin :spinning="detailLoading">
        <a-alert v-if="detailError" type="error" show-icon :message="detailError" />
        <template v-else-if="detail">
          <a-descriptions size="small" bordered :column="2" title="运行概览">
            <a-descriptions-item label="归档">{{ detail.run.archive || '—' }}</a-descriptions-item>
            <a-descriptions-item label="类型">{{ detail.run.type }}</a-descriptions-item>
            <a-descriptions-item label="作业">{{ detail.run.assignment_id ?? '—' }} {{ detail.run.assignment_title || '' }}</a-descriptions-item>
            <a-descriptions-item label="尺子ID">{{ detail.run.checker_id || '—' }}</a-descriptions-item>
            <a-descriptions-item label="计数">{{ countsText }}</a-descriptions-item>
            <a-descriptions-item label="device_exit">{{ detail.run.device_exit ?? '—' }}</a-descriptions-item>
            <a-descriptions-item label="耗时">{{ fmtElapsed(detail.run.elapsed_ms) }}</a-descriptions-item>
            <a-descriptions-item label="时间">{{ detail.run.created_at || '—' }}</a-descriptions-item>
          </a-descriptions>
          <a-card size="small" title="🔒 会话销毁证据" class="mt">
            <a-alert :type="purgeAlertType" show-icon :message="purgeHeadline" :description="purgeHint" class="mb" />
            <a-descriptions size="small" bordered :column="2">
              <a-descriptions-item label="home_policy">{{ ev.home_policy || '—' }}</a-descriptions-item>
              <a-descriptions-item label="sessions_purged">
                <StatusTag :tone="purgeTone(ev.sessions_purged)" :text="purgeText(ev.sessions_purged)" dot />
              </a-descriptions-item>
              <a-descriptions-item label="session_files_before → after">{{ filesText }}</a-descriptions-item>
              <a-descriptions-item label="session_bytes">{{ ev.session_bytes ?? '—' }}</a-descriptions-item>
              <a-descriptions-item label="credentials_removed">{{ ev.credentials_removed || '—' }}</a-descriptions-item>
              <a-descriptions-item label="home_exists_after">{{ ev.home_exists_after || '—' }}</a-descriptions-item>
              <a-descriptions-item label="purge_policy">{{ ev.purge_policy || '—' }}</a-descriptions-item>
              <a-descriptions-item label="source">{{ ev.source || detail.run.source || '—' }}</a-descriptions-item>
              <a-descriptions-item label="ts">{{ ev.ts || '—' }}</a-descriptions-item>
            </a-descriptions>
            <p class="muted note">口径说明：证据来自本次运行的 run-teardown.json（装置侧不写、由 worker/造尺包装产出）。计数为 0 不等于「没问题」：可能表示本次没有会话文件（如复用/量尺零 LLM），也可能是未采集（na/—）——请结合 source 与 purge_policy 判断来源。</p>
          </a-card>
          <a-card size="small" title="逐份结果" class="mt">
            <a-table :columns="subCols" :dataSource="submissions" rowKey="slug" size="small" :pagination="{ pageSize: 8 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'slug'">
                  <span class="mono">{{ record.slug }}</span>
                  <div v-if="String(record.slug).startsWith('unknown-')" class="muted">未留产物（不可量/失败/未量尺）</div>
                </template>
                <template v-else-if="column.key === 'state'">
                  <StatusTag :tone="stateTone(record)" :text="stateText(record)" dot />
                </template>
              </template>
            </a-table>
            <a-empty v-if="!submissions.length" :image="false" description="无逐份条目（该运行未产出结果文件；总数以顶部计数为准）" />
          </a-card>
          <a-card size="small" title="日志" class="mt">
            <a-space class="mb">
              <a-button size="small" @click="loadLog('stdout')">stdout 尾部</a-button>
              <a-button size="small" @click="loadLog('stderr')">stderr 尾部</a-button>
              <a-button size="small" @click="loadLog('run')">run.log</a-button>
            </a-space>
            <a-alert v-if="logMissing" type="info" show-icon class="mb" :message="`该通道日志缺失（present=false，reason=${logMissing}）—— 不是接口错误`" />
            <pre v-if="logText" class="log">{{ logText }}</pre>
            <p v-if="!logText && !logMissing" class="muted">点击上方按钮查看该运行的三通道日志（stdout / stderr / run）。</p>
          </a-card>
        </template>
      </a-spin>
    </a-drawer>
  </PageShell>
</template>
<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import 'ant-design-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import StatusTag from '../../components/StatusTag.vue';

const loading = ref(false);
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const filters = reactive({ assignmentId: null, type: undefined, status: undefined, sessions_purged: undefined });
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref(null);
const detailError = ref('');
const logText = ref('');
const logMissing = ref('');

const typeOptions = [{ value: 'worker', label: 'worker（批改）' }, { value: 'build', label: 'build（造尺）' }];
const purgeOptions = [{ value: 'yes', label: '已销毁' }, { value: 'no', label: '未销毁（需关注）' }];
const statusOptions = [{ value: 'done', label: 'done' }, { value: 'failed', label: 'failed' }, { value: 'pending', label: 'pending' }, { value: 'running', label: 'running' }];

const cols = [
  { title: '归档 / 运行', key: 'archive', width: 190 },
  { title: '类型', key: 'type', width: 100 },
  { title: '作业', dataIndex: 'assignment_id', width: 90 },
  { title: '状态', dataIndex: 'status', width: 100 },
  { title: '计数 m/u/f/s/w', key: 'counts', width: 260 },
  { title: '耗时', key: 'elapsed_ms', width: 110 },
  { title: 'device_exit', dataIndex: 'device_exit', width: 100 },
  { title: '会话销毁', key: 'sessions_purged', width: 150 },
  { title: '创建时间', dataIndex: 'created_at', width: 190 },
];
const subCols = [
  { title: 'slug', key: 'slug', width: 200 },
  { title: '状态', key: 'state', width: 160 },
  { title: '分数', dataIndex: 'score', width: 80 },
  { title: '命中', dataIndex: 'hits', width: 70 },
  { title: '原因', dataIndex: 'reason', width: 220 },
  { title: '学生', dataIndex: 'student', width: 120 },
];

const ev = computed(() => (detail.value && detail.value.teardown_json) || {});
const submissions = computed(() => (detail.value && detail.value.submissions) || []);
const countsText = computed(() => {
  const r = (detail.value && detail.value.run) || {};
  return `measured=${r.measured ?? '—'} unmeasurable=${r.unmeasurable ?? '—'} failed=${r.failed ?? '—'} skipped=${r.skipped ?? '—'} written=${r.written ?? '—'}`;
});
const filesText = computed(() => {
  const e = ev.value;
  return `${e.session_files_before ?? '—'} → ${e.session_files_after ?? '—'}`;
});
const purgeAlertType = computed(() => {
  if (ev.value.sessions_purged === true) return 'success';
  if (ev.value.sessions_purged === false) return 'warning';
  return 'info';
});
const purgeHeadline = computed(() => {
  if (ev.value.sessions_purged === true) return '会话已销毁（sessions_purged=true）';
  if (ev.value.sessions_purged === false) return '会话未销毁（sessions_purged=false）—— 关注：失败保留现场，或未执行 teardown';
  return '无销毁证据（旧运行，或装置侧未产出证据）';
});
const purgeHint = computed(() => {
  const e = ev.value;
  return `home_exists_after=${e.home_exists_after ?? '—'} ｜ credentials_removed=${e.credentials_removed ?? '—'} ｜ session_files ${e.session_files_before ?? '—'} → ${e.session_files_after ?? '—'} ｜ bytes=${e.session_bytes ?? '—'} ｜ source=${e.source || '—'}`;
});

function purgeTone(v) { return v === true ? 'success' : (v === false ? 'danger' : 'neutral'); }
function purgeText(v) { return v === true ? '已销毁' : (v === false ? '未销毁' : '无证据'); }
function stateTone(r) {
  if (r.failed === true) return 'danger';
  if (r.measurable === false) return 'warning';
  return 'success';
}
function stateText(r) {
  if (r.failed === true) return '无法评分（failed）';
  if (r.measurable === false) return '不可量';
  return '已量尺';
}
function fmtElapsed(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(Number(ms) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
}

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
  filters.assignmentId = null; filters.type = undefined; filters.status = undefined; filters.sessions_purged = undefined;
  reload();
}
function onTableChange(pg) { page.value = pg.current || 1; pageSize.value = pg.pageSize || 20; load(); }

async function openDetail(record) {
  detailOpen.value = true; detailLoading.value = true; detailError.value = ''; detail.value = null; logText.value = ''; logMissing.value = '';
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(record.id)}`);
    const data = (res && res.data) || res;
    if (!data || !data.run) detailError.value = '该运行没有可展示的详情（归档缺失或已被清理）';
    else detail.value = data;
  } catch (err) {
    detailError.value = '读取详情失败：' + (err && err.message ? err.message : String(err));
  } finally {
    detailLoading.value = false;
  }
}

async function loadLog(kind) {
  logText.value = ''; logMissing.value = '';
  const id = detail.value && detail.value.run ? detail.value.run.id : null;
  if (!id) return;
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(id)}/log`, { params: { kind }, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof res === 'string' ? res : ((res && res.data) || '');
    if (String(text).indexOf('# 日志缺失') === 0) logMissing.value = (String(text).match(/reason=([^\s]+)/) || [])[1] || 'missing';
    else logText.value = String(text).slice(-8000);
  } catch (err) {
    logMissing.value = 'request_failed:' + (err && err.message ? err.message : String(err));
  }
}

onMounted(load);
</script>
<style scoped>
.filter-card { margin-bottom: 12px; }
.mt { margin-top: 12px; }
.mb { margin-bottom: 8px; }
.muted { color: var(--color-text-secondary, #888); font-size: 12px; }
.mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
.log { max-height: 320px; overflow: auto; background: var(--color-bg-subtle, #fafafa); padding: 8px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; }
.note { margin-top: 8px; margin-bottom: 0; }
.link { cursor: pointer; }
</style>
