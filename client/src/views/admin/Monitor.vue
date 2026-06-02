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

    <!-- AI 配置 -->
    <a-card title="🤖 AI 配置" size="small" class="monitor-card">
      <a-form layout="inline" style="flex-wrap:wrap;gap:12px;">
        <a-form-item label="API Key">
          <a-input-password
            v-model:value="aiForm.apiKey"
            placeholder="输入 DeepSeek API Key"
            style="width:320px;"
            :visibilityToggle="true"
          />
        </a-form-item>
        <a-form-item label="模型">
          <a-select
            v-model:value="aiForm.model"
            style="width:200px;"
            :options="modelOptions"
          />
        </a-form-item>
        <a-form-item label="Base URL">
          <a-input v-model:value="aiForm.baseUrl" placeholder="https://api.deepseek.com" style="width:280px;" />
        </a-form-item>
        <a-form-item>
          <a-button type="primary" :loading="savingAi" @click="saveAiConfig">保存配置</a-button>
        </a-form-item>
      </a-form>
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
import { message } from 'ant-design-vue';
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

// AI 配置
const savingAi = ref(false);
const aiForm = reactive({ apiKey: '', model: '', baseUrl: '' });
const modelOptions = [
  { label: 'deepseek-v4-flash（推荐，快速）', value: 'deepseek-v4-flash' },
  { label: 'deepseek-chat', value: 'deepseek-chat' },
  { label: 'deepseek-reasoner', value: 'deepseek-reasoner' },
];

async function loadAiConfig() {
  try {
    const r = await request.get('/admin/settings');
    const d = r.data;
    aiForm.apiKey = d.deepseek_api_key || '';
    aiForm.model = d.deepseek_model || 'deepseek-v4-flash';
    aiForm.baseUrl = d.deepseek_base_url || 'https://api.deepseek.com';
  } catch { /* ignore */ }
}

async function saveAiConfig() {
  savingAi.value = true;
  try {
    await request.put('/admin/settings', {
      deepseek_api_key: aiForm.apiKey || undefined,
      deepseek_model: aiForm.model,
      deepseek_base_url: aiForm.baseUrl,
    });
    message.success('AI 配置已保存，1分钟内生效');
    await loadAiConfig(); // 重新加载脱敏后的值
  } catch {
    message.error('保存失败');
  }
  savingAi.value = false;
}

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
  loadAiConfig();
  timer = setInterval(() => { if (autoRefresh.value) fetch(); }, 30000);
});

onUnmounted(() => { clearInterval(timer); });
</script>

<style scoped>
.page { max-width: 1400px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-shrink: 0; }
.page-header h2 { font-size: 28px; margin: 0; }

.monitor-card { margin-bottom: 16px; }
.monitor-card:last-child :deep(.ant-card-body) { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.label { display: block; font-size: 12px; color: #999; margin-bottom: 2px; }
.value { font-size: 14px; color: #333; font-weight: 500; }
.mem-low { color: #ff4d4f; font-weight: 700; }

.log-viewer {
  max-height: 500px; overflow: auto;
  background: #1e1e1e; border-radius: 8px; padding: 16px;
}
.log-viewer pre {
  color: #d4d4d4; font-size: 13px; line-height: 1.7;
  margin: 0; white-space: pre-wrap; word-break: break-all;
  font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
}
</style>
