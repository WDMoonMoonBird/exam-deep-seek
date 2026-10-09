<template>
  <PageShell
    title="服务器监控"
    description="服务器运行状态、PM2 进程与近期错误日志；开启自动刷新后每 30 秒拉取一次。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <StatusTag :tone="autoRefresh ? 'success' : 'neutral'" :text="`自动刷新 ${autoRefresh ? '开' : '关'}`" />
      <a-switch v-model:checked="autoRefresh" size="small" aria-label="自动刷新" />
      <a-button size="small" @click="fetch" :loading="loading">手动刷新</a-button>
    </template>

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
            <StatusTag :tone="record.status === 'online' ? 'success' : 'danger'" :text="record.status" dot />
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
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import StatusTag from '../../components/StatusTag.vue';

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
.monitor-card {
  margin-bottom: var(--space-4);
}
.monitor-card:last-child :deep(.ant-card-body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.label {
  display: block;
  font-size: var(--fs-caption);
  color: var(--text-tertiary);
  margin-bottom: var(--space-1);
}
.value {
  font-size: var(--fs-body);
  color: var(--text-primary);
  font-weight: var(--fw-medium);
}
.mem-low {
  color: var(--status-danger-fg);
  font-weight: var(--fw-bold);
}

/* 深色日志区：用 --code-bg / --code-fg（定义见 tokens.css:183-187 浅色语义层、:403-405 深色块显式重声明），
   语义 = 「无论主题都必须保持深色的内容面」；浅色与暗色下取值一致（实测底色 11/15/22、文字 72% 白）。
   不沿用 --bg-inverse/--text-inverse-muted 的理由是语义不同——--bg-inverse 表示「当前面的反色」（浅色主题下服务侧栏/浮层），
   而非修暗色缺陷：tokens.css:388 起的「深色主题的组件级修正（必须放在组件令牌之后）」块在 :391 显式重声明 --bg-inverse 为深色值（与浅色主题同值），
   与前面的 [data-theme="dark"] 块同优先级、后写者胜，故暗色下它同样保持深色；本注释此前「暗色会变浅底」的结论不成立，据此更正。 */
.log-viewer {
  max-height: 500px;
  overflow: auto;
  background: var(--code-bg);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}
.log-viewer pre {
  color: var(--code-fg);
  font-size: var(--fs-code);
  line-height: var(--lh-code);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--font-mono);
}
</style>
