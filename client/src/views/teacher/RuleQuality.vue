<template>
  <div class="page">
    <div class="page-header">
      <span style="font-size:var(--fs-title-2);font-weight:var(--fw-bold);">规则质量</span>
      <span style="font-size:var(--fs-body-sm);color:var(--text-secondary);">
        基于教师审核改分信号（finalScore ≠ aiScore）聚合，识别过严/过松的规则组
      </span>
      <a-button size="small" @click="load">刷新</a-button>
    </div>

    <!-- 汇总 -->
    <div class="rq-stats">
      <a-statistic title="改分信号总数" :value="summary.totalSignals" :value-style="{ color: 'var(--text-brand)' }" />
      <a-statistic title="活跃规则数" :value="summary.activeRules" />
      <a-statistic title="待处理建议" :value="summary.suggestions" :value-style="{ color: summary.suggestions ? 'var(--status-warning-fg)' : 'var(--status-success-fg)' }" />
    </div>

    <a-alert
      v-if="summary.suggestions"
      type="warning" show-icon class="rq-alert"
      message="以下规则组被教师频繁改分，判定可能过严或过松，建议重新生成后重新确认（走自动评分器向导第 3 步）"
    />

    <a-table :columns="columns" :data-source="rows" :pagination="false" size="middle" row-key="id" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'avgDelta'">
          <span :class="record.avgDelta < 0 ? 'delta-neg' : 'delta-pos'">
            {{ record.avgDelta > 0 ? '+' : '' }}{{ record.avgDelta }}
          </span>
        </template>
        <template v-else-if="column.key === 'suggest'">
          <!-- 合并带回的 antd 预置色不达 AA（橙亮 3.34 / 绿亮 3.37）→ 改用我方语义类 -->
          <a-tag v-if="record.suggest" class="tag-warning">⚠ 建议重生成</a-tag>
          <a-tag v-else class="tag-success">正常</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space size="4">
            <a-button size="small" type="link" @click="openQuestion(record)">查看规则</a-button>
            <a-button size="small" type="link" @click="ignore(record)">忽略</a-button>
          </a-space>
        </template>
      </template>
      <template #emptyText><a-empty description="暂无改分信号，规则质量良好" :image="false" /></template>
    </a-table>

    <div class="rq-note">
      说明：改分信号在教师审核保存 finalScore 时自动采集（零额外操作）；「查看规则」将进入该题自动评分器向导第 3 步重新确认。
      <a-divider type="vertical" />
      数据来源：grading_override_signals（重构方案 §4.3）
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { getRuleQuality, mockRuleQuality } from '../../api/checker.js';
import { useSafeRequest } from '../../composables/useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡

const mock = true; // 原型阶段；后端就绪后置 false
const router = useRouter();
const { safeLoad } = useSafeRequest({ tag: 'teacher/RuleQuality.vue' });
const loading = ref(false);
const summary = ref({ totalSignals: 0, activeRules: 0, suggestions: 0 });
const rows = ref([]);

const columns = [
  { title: '题目', dataIndex: 'question', key: 'question', width: 180 },
  { title: '规则组', dataIndex: 'group', key: 'group', width: 110 },
  { title: '规则数', dataIndex: 'ruleCount', key: 'ruleCount', width: 70 },
  { title: '满分', dataIndex: 'points', key: 'points', width: 70 },
  { title: '被改分次数', dataIndex: 'overrideCount', key: 'overrideCount', width: 100 },
  { title: '平均 Δ', dataIndex: 'avgDelta', key: 'avgDelta', width: 90 },
  { title: '建议', dataIndex: 'suggest', key: 'suggest', width: 120 },
  { title: '操作', key: 'action', width: 130 },
];

async function load() {
  loading.value = true;
  try {
    if (mock) {
      const d = mockRuleQuality();
      summary.value = d.summary;
      rows.value = d.rows.map((r, i) => ({ ...r, id: i + 1 }));
      return;
    }
    // ★W1（t1）：safeLoad ⇒ 加载失败只就地提示（原 try/finally 无 catch ⇒ 失败会把整页替换成错误页）
    const r = await safeLoad(() => getRuleQuality(), { action: '加载规则质量' });
    if (r.error) return;
    const d = r.data || {};
    summary.value = d.summary || summary.value;
    rows.value = (d.rows || []).map((x, i) => ({ ...x, id: i + 1 }));
  } finally {
    loading.value = false;
  }
}

function openQuestion(record) {
  // 原型：跳转到题库并提示；正式版带 query 自动打开自动评分器向导第 3 步
  router.push({ path: '/teacher/questions' });
  message.info('正式版将打开题目 ' + record.questionId + ' 的自动评分器向导（第 3 步确认）');
}

function ignore(record) {
  record.suggest = false;
  summary.value.suggestions = Math.max(0, summary.value.suggestions - 1);
  message.success('已忽略：' + record.group + '（30 天内不再提示）');
}

onMounted(load);
</script>

<style scoped>
.rq-stats { display: flex; gap: 24px; margin: 12px 0 16px; }
.rq-alert { margin-bottom: 12px; }
.delta-neg { color: var(--status-danger-fg); font-weight: var(--fw-semibold); }
.delta-pos { color: var(--status-success-fg); font-weight: var(--fw-semibold); }
.rq-note { margin-top: 14px; font-size: var(--fs-caption); color: var(--text-secondary); }
</style>
