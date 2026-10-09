<template>
  <FormPage
    title="AI 配置"
    description="配置 AI 评分所用的模型与并发数；并发数修改后自动保存，约 1 分钟内生效。"
  >
    <!-- 保存反馈：页内 aria-live 状态区（05-page-specs.md §admin/AiConfig 要求），不再依赖全局 message -->
    <template #actions>
      <span class="save-status" :class="'is-' + saveFeedback.kind" role="status" aria-live="polite">{{ saveFeedback.text }}</span>
    </template>

    <div class="config-body">
      <!-- 模型配置 -->
      <a-card title="🤖 模型配置" size="small" class="config-card">
        <a-form layout="vertical" style="max-width:600px;">
          <a-form-item label="API Key">
            <a-input-password
              v-model:value="form.apiKey"
              placeholder="输入 DeepSeek API Key"
              :visibilityToggle="true"
              style="width:380px;"
            />
          </a-form-item>
          <a-form-item label="模型">
            <a-select
              v-model:value="form.model"
              :options="modelOptions"
            />
          </a-form-item>
          <a-form-item label="Base URL">
            <a-input v-model:value="form.baseUrl" placeholder="https://api.deepseek.com" />
          </a-form-item>
          <a-form-item>
            <a-space>
              <a-button type="primary" :loading="saving" @click="saveModel">保存配置</a-button>
              <a-button :loading="testing" @click="testConnection">测试连接</a-button>
            </a-space>
          </a-form-item>
        </a-form>
      </a-card>

      <!-- 并发设置 -->
      <a-card title="⚡ AI 评分并发" size="small" class="config-card">
        <a-form layout="vertical" style="max-width:600px;">
          <a-form-item label="并发数">
            <a-select
              v-model:value="form.concurrency"
              :options="concurrencyOptions"
              @change="onConcurrencyChange"
              style="width:220px;"
            />
          </a-form-item>
          <a-form-item>
            <span class="hint">
              当前生效并发数：<b class="hint-strong">{{ form.concurrency }}</b> |
              修改后自动保存，约 1 分钟内生效（Worker 每 60 秒刷新配置）
            </span>
          </a-form-item>
        </a-form>
      </a-card>

      <!-- 预估时间 -->
      <a-card title="⏱️ 评分耗时预估" size="small" class="config-card">
        <p class="est-note">
          按每题 AI 评分平均耗时 <b>5 秒</b> 估算（含网络往返 + 模型推理）。实际时间受网络波动、DeepSeek 服务端负载影响。
        </p>
        <a-table
          :columns="timeColumns"
          :dataSource="timeData"
          :pagination="false"
          size="small"
          :rowClassName="(r) => r.key === +form.concurrency ? 'concurrency-active-row' : ''"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key !== 'label'">
              <span>{{ record[column.dataIndex] }}</span>
            </template>
          </template>
        </a-table>
        <a-alert
          :type="concurrencyLevel.type"
          :show-icon="true"
          style="margin-top:16px;"
        >
          <template #message>{{ concurrencyLevel.message }}</template>
        </a-alert>
      </a-card>
    </div>
  </FormPage>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { Modal } from 'ant-design-vue';
import request from '../../api/request.js';
import FormPage from '../../components/FormPage.vue';

const saving = ref(false);
const testing = ref(false);
const form = reactive({ apiKey: '', model: '', baseUrl: '', concurrency: '16' });
const sysInfo = reactive({ cpus: 2, totalMemGB: 4, recommended: 16 });

/** 保存反馈（页内 aria-live）：kind = idle | saved | error，text 直接播报 */
const saveFeedback = reactive({ kind: 'idle', text: '' });
function setFeedback(kind, text) {
  saveFeedback.kind = kind;
  saveFeedback.text = text;
}

const modelOptions = [
  { label: 'deepseek-v4-flash（推荐，快速）', value: 'deepseek-v4-flash' },
  { label: 'deepseek-chat', value: 'deepseek-chat' },
  { label: 'deepseek-reasoner', value: 'deepseek-reasoner' },
];

// 并发选项动态生成，根据服务器配置标记推荐
const concurrencyOptions = computed(() => {
  const levels = [1, 8, 16, 32, 64, 128];
  const rec = sysInfo.recommended;
  const closest = levels.reduce((prev, cur) => Math.abs(cur - rec) < Math.abs(prev - rec) ? cur : prev);
  return levels.map(v => ({
    label: v === 1 ? '串行（1）' : v === closest ? `${v} 并发（推荐）` : `${v} 并发`,
    value: String(v),
  }));
});

// 根据服务器配置动态计算负载等级
const concurrencyLevel = computed(() => {
  const c = +form.concurrency;
  const cpus = sysInfo.cpus;
  const perCore = c / cpus;

  if (perCore > 16) {
    return {
      type: 'warning',
      message: `⚠️ 高并发模式（${c} 并发 / ${cpus} 核 = 每核 ${perCore} 并发）：将对服务器 CPU 产生较大压力，建议仅在批量评分高峰期临时使用。DeepSeek API 支持最高 2,500 并发，瓶颈在服务器 CPU 而非 API。`,
    };
  }
  if (perCore > 8) {
    return {
      type: 'info',
      message: `ℹ️ 中等并发（${c} 并发 / ${cpus} 核 = 每核 ${perCore} 并发）：适合常规批量评分场景，当前 ${cpus} 核 ${sysInfo.totalMemGB}GB 服务器可稳定运行。`,
    };
  }
  return {
    type: 'success',
    message: `✅ 低负载模式（${c} 并发 / ${cpus} 核 = 每核 ${perCore} 并发）：服务器负载极低，适合日常零星提交场景。如需加速批量评分，可适当提高并发。`,
  };
});

const timeColumns = [
  { title: '并发级别', dataIndex: 'label', key: 'label', width: 120 },
  { title: '50 份', dataIndex: 'd50', key: 'd50', align: 'center' },
  { title: '100 份', dataIndex: 'd100', key: 'd100', align: 'center' },
  { title: '200 份', dataIndex: 'd200', key: 'd200', align: 'center' },
  { title: '500 份', dataIndex: 'd500', key: 'd500', align: 'center' },
];

const AVG_SEC = 5;
const LEVELS = [1, 8, 16, 32, 64, 128];
const DATA_KEYS = ['d50', 'd100', 'd200', 'd500'];
const COUNTS = [50, 100, 200, 500];

function fmtDuration(totalSec) {
  if (totalSec < 60) return Math.round(totalSec) + ' 秒';
  if (totalSec < 3600) return (totalSec / 60).toFixed(1) + ' 分';
  return (totalSec / 3600).toFixed(1) + ' 时';
}

const timeData = computed(() => {
  return LEVELS.map((conc) => {
    const row = { key: conc, label: conc === 1 ? '串行' : `${conc} 并发` };
    COUNTS.forEach((count, idx) => {
      const batches = Math.ceil(count / conc);
      row[DATA_KEYS[idx]] = fmtDuration(batches * AVG_SEC);
    });
    return row;
  });
});

async function loadConfig() {
  try {
    const r = await request.get('/admin/settings');
    const d = r.data;
    form.apiKey = d.deepseek_api_key || '';
    form.model = d.deepseek_model || 'deepseek-v4-flash';
    form.baseUrl = d.deepseek_base_url || 'https://api.deepseek.com';
    form.concurrency = String(d.ai_concurrency || d.recommended_concurrency || 16);
    sysInfo.cpus = d.cpus || 2;
    sysInfo.totalMemGB = d.totalMemGB || 4;
    sysInfo.recommended = d.recommended_concurrency || 16;
  } catch { /* ignore */ }
}

async function saveModel() {
  saving.value = true;
  try {
    await request.put('/admin/settings', {
      deepseek_api_key: form.apiKey || undefined,
      deepseek_model: form.model,
      deepseek_base_url: form.baseUrl,
    });
    setFeedback('saved', '模型配置已保存，1 分钟内生效');
  } catch {
    setFeedback('error', '保存失败');
  }
  saving.value = false;
}

async function testConnection() {
  testing.value = true;
  try {
    const r = await request.post('/admin/settings/test-connection');
    const d = r.data;
    if (d.ok) {
      Modal.success({
        title: '连接成功 ✅',
        content: `DeepSeek API 连接正常，响应延时 ${d.latency}。`,
        width: 480,
      });
    } else {
      Modal.error({
        title: '连接失败 ❌',
        content: `无法连接 DeepSeek API。\n\n错误：${d.error}\n延时：${d.latency || '—'}`,
        width: 480,
      });
    }
  } catch {
    Modal.error({ title: '测试失败', content: '请求发送失败，请检查网络。', width: 480 });
  }
  testing.value = false;
}

async function onConcurrencyChange(val) {
  try {
    await request.put('/admin/settings', { ai_concurrency: +val });
    setFeedback('saved', `并发数已设为 ${val}，约 1 分钟内生效`);
  } catch {
    setFeedback('error', '保存失败');
  }
}

onMounted(loadConfig);
</script>

<style scoped>
/* 页面主体阅读宽度：保持改前 1000px（FormPage 契约不含 maxWidth prop，组件属 T12 边界） */
.config-body {
  max-width: 1000px;
}

/* 保存反馈：页头右上角的 aria-live 状态文本 */
.save-status {
  font-size: var(--fs-caption);
  color: var(--text-tertiary);
}
.save-status.is-saved {
  color: var(--status-success-fg);
}
.save-status.is-error {
  color: var(--status-danger-fg);
}

.config-card {
  margin-bottom: var(--space-4);
}

.hint {
  font-size: var(--fs-caption);
  color: var(--text-tertiary);
}
.hint-strong {
  color: var(--text-primary);
}
.est-note {
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
  margin-bottom: var(--space-4);
}

/* 当前并发行高亮：原为非 scoped 全局样式（含十六进制色值与强制覆盖，05-page-specs.md 点名问题），
   现收进 scoped 并用 :deep() + --table-row-selected 令牌 */
:deep(.concurrency-active-row > td) {
  background: var(--table-row-selected);
  font-weight: var(--fw-semibold);
}
</style>
