<template>
  <div class="gen-progress">
    <!-- generating -->
    <div v-if="status === 'generating'" class="gp-phase">
      <a-spin size="small" />
      <span>正在生成规则（AI 仅产出 JSON 参数，非思考模式，max_tokens 16000）…</span>
    </div>

    <!-- calibrating -->
    <div v-else-if="status === 'calibrating'" class="gp-phase">
      <a-spin size="small" />
      <span>标准包校准中：第 <b>{{ logs.length || 1 }}</b> 轮，最新得分
        <b :class="latestScore !== null && latestScore >= 90 ? 'ok' : 'warn'">{{ latestScore !== null ? latestScore + '/' + (report.max_score || 100) : '—' }}</b>
        （阈值 ≥{{ report.threshold ?? 90 }} 即就绪）</span>
      <a-progress v-if="latestScore !== null" :percent="latestScore" size="small" :show-info="false" stroke-color="#1677ff" />
    </div>

    <!-- failed -->
    <a-alert v-if="status === 'failed'" type="error" show-icon :message="error || '规则生成/校准失败，请重试'" style="margin-top:8px;" />

    <!-- 校准日志（沿用现有样式） -->
    <div v-if="logs.length" class="gp-log-list">
      <div v-for="(log, i) in logs" :key="i" class="gp-log-item">
        <span class="gp-log-round">第 {{ log.round }} 轮</span>
        <span :class="(log.totalScore ?? log.score) >= 90 ? 'gp-log-ok' : 'gp-log-warn'">得分 {{ log.totalScore ?? log.score }}/{{ report.max_score || 100 }}</span>
        <span v-if="log.feedback" class="gp-log-fb">{{ log.feedback }}</span>
      </div>
    </div>

    <!-- 体检报告（实时刷新，只读；hideReport 时由外层提供可操作版） -->
    <HealthReportTable
      v-if="!hideReport && report && report.items && report.items.length && status !== 'failed'"
      :report="report"
      :threshold="report.threshold"
      style="margin-top:12px;"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import HealthReportTable from './HealthReportTable.vue';

const props = defineProps({
  status: { type: String, default: 'generating' },
  logs: { type: Array, default: () => [] },
  report: { type: Object, default: null },
  error: { type: String, default: '' },
  hideReport: { type: Boolean, default: false }, // Step2 完成态展示可操作报告时隐藏内置只读版
});

const latestScore = computed(() => {
  const last = props.logs[props.logs.length - 1];
  return last ? (last.totalScore ?? last.score) : null;
});
</script>

<style scoped>
.gp-phase { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 4px 0; }
.gp-phase .ok { color: #52c41a; }
.gp-phase .warn { color: #fa8c16; }
.gp-log-list { margin-top: 12px; border: 1px solid #f0f0f0; border-radius: 6px; padding: 8px 12px; max-height: 180px; overflow: auto; background: #fafafa; }
.gp-log-item { font-size: 12px; padding: 2px 0; display: flex; gap: 8px; }
.gp-log-round { color: #888; width: 52px; }
.gp-log-ok { color: #52c41a; font-weight: 600; }
.gp-log-warn { color: #fa8c16; font-weight: 600; }
.gp-log-fb { color: #999; }
</style>
