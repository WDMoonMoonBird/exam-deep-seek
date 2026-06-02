<template>
  <div class="page">
    <div class="page-header">
      <h2>服务器监控</h2>
      <a-space>
        <a-tag :color="autoRefresh ? 'green' : 'default'">自动刷新 {{ autoRefresh ? '开' : '关' }}</a-tag>
        <a-switch v-model:checked="autoRefresh" size="small" />
        <a-button size="small" @click="fetch" :loading="loading">手动刷新</a-button>
      </a-space>
    </div>

    <!-- 系统信息 -->
    <a-card title="🖥️ 系统信息" size="small" class="monitor-card">
      <a-row :gutter="[16, 8]">
        <a-col :span="6"><span class="label">主机名</span><span class="value">{{ data.system.hostname || '—' }}</span></a-col>
        <a-col :span="6"><span class="label">系统</span><span class="value">{{ data.system.platform || '—' }}</span></a-col>
        <a-col :span="6"><span class="label">CPU 核数</span><span class="value">{{ data.system.cpus || '—' }}</span></a-col>
        <a-col :span="6"><span class="label">运行时长</span><span class="value">{{ data.system.uptime || '—' }}</span></a-col>
        <a-col :span="6"><span class="label">总内存</span><span class="value">{{ data.system.totalMem || '—' }}</span></a-col>
        <a-col :span="6"><span class="label">空闲内存</span><span class="value" :class="{ 'mem-low': isMemLow }">{{ data.system.freeMem || '—' }}</span></a-col>
        <a-col :span="12"><span class="label">负载</span><span class="value">{{ (data.system.loadAvg || []).join(' / ') }}</span></a-col>
      </a-row>
    </a-card>

    <!-- PM2 进程 -->
    <a-card title="📦 PM2 进程" size="small" class="monitor-card">
      <a-table
        :columns="procCols"
        :dataSource="data.processes"
        rowKey="name"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <a-badge :status="record.status === 'online' ? 'success' : 'error'" :text="record.status" />
          </template>
          <template v-if="column.key === 'cpu'">{{ record.cpu }}%</template>
        </template>
      </a-table>
      <a-empty v-if="!data.processes.length" description="无 PM2 进程数据（本地开发环境正常）" :image="false" />
    </a-card>

    <!-- 错误日志 -->
    <a-card title="📋 近期错误日志" size="small" class="monitor-card">
      <div class="log-viewer" ref="logRef">
        <pre v-if="data.logs && data.logs !== '(日志目录不存在)'">{{ data.logs }}</pre>
        <a-empty v-else description="暂无日志" :image="false" />
      </div>
    </a-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import request from '../../api/request.js';

const loading = ref(false);
const autoRefresh = ref(true);
const data = reactive({
  system: {}, processes: [], logs: '', errors: [],
});

const isMemLow = computed(() => {
  const free = parseFloat(data.system.freeMem);
  const total = parseFloat(data.system.totalMem);
  return free && total && free / total < 0.15;
});

const procCols = [
  { title: '进程名', dataIndex: 'name', width: 140 },
  { title: '状态', key: 'status', width: 80 },
  { title: 'CPU', key: 'cpu', width: 70 },
  { title: '内存', dataIndex: 'memory', width: 100 },
  { title: '运行时长', dataIndex: 'uptime', width: 100 },
  { title: '重启次数', dataIndex: 'restarts', width: 80 },
  { title: 'PID', dataIndex: 'pid', width: 70 },
];

let timer = null;

async function fetch() {
  loading.value = true;
  try {
    const r = await request.get('/admin/monitor');
    Object.assign(data, r.data);
  } catch {
    data.errors = ['获取监控数据失败'];
  }
  loading.value = false;
}

onMounted(() => {
  fetch();
  timer = setInterval(() => { if (autoRefresh.value) fetch(); }, 30000);
});

onUnmounted(() => { clearInterval(timer); });
</script>

<style scoped>
.page { max-width: 1400px; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-shrink: 0; }
.page-header h2 { font-size: 28px; margin: 0; }

.monitor-card { margin-bottom: 16px; }
.monitor-card:last-child { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.monitor-card:last-child :deep(.ant-card-body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.label { display: block; font-size: 12px; color: #999; margin-bottom: 2px; }
.value { font-size: 14px; color: #333; font-weight: 500; }
.mem-low { color: #ff4d4f; font-weight: 700; }

.log-viewer {
  flex: 1; min-height: 0; overflow: auto;
  background: #1e1e1e; border-radius: 8px; padding: 16px;
}
.log-viewer pre {
  color: #d4d4d4; font-size: 13px; line-height: 1.7;
  margin: 0; white-space: pre-wrap; word-break: break-all;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}
</style>
