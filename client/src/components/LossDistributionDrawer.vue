<template>
  <a-drawer
    :open="open"
    title="失分项分布（按班 × 判据项）"
    :width="760"
    :destroyOnClose="true"
    @close="close"
  >
    <a-spin :spinning="loading">
      <!-- ★错误态：固定友好文案（errorCopyOf 口径）+ 重试入口；原始错误只进 console，绝不上屏 -->
      <a-alert
        v-if="error"
        type="error" show-icon :message="error"
        description="可点击「重试」重新拉取；也可以关闭后重开。"
        style="margin-bottom:12px;"
      >
        <template #action><a-button size="small" @click="load">重试</a-button></template>
      </a-alert>

      <template v-else>
        <div v-if="data" class="loss-meta">
          <span>参与统计：{{ data.totals.submissionsWithItems }} / {{ data.totals.submissionsScanned }} 份提交</span>
          <span v-if="data.classId">班级 #{{ data.classId }}</span>
          <span>判据项 {{ data.totals.items }} 个 · 命中 {{ data.totals.hits }} · 未命中 {{ data.totals.misses }} · 未判定 {{ data.totals.unknown }}</span>
        </div>

        <!-- ★空态：数据为空（无提交/无可解析的批改结果）时给可读说明，不白屏 -->
        <a-empty
          v-if="data && !data.items.length"
          :image="false"
          description="暂无失分分布数据：该作业（或该班）还没有可用的批改结果。"
        />

        <a-table
          v-else-if="data"
          :columns="columns"
          :data-source="data.items"
          row-key="item"
          size="small"
          :pagination="false"
          :scroll="{ y: 420 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'item'">
              <b>{{ record.item }}</b><span v-if="record.title" class="loss-title">{{ record.title }}</span>
            </template>
            <template v-else-if="column.key === 'loss'">
              <span class="loss-num">{{ record.numerator }}<u>/{{ record.denominator }}</u></span>
              <span v-if="record.unknown" class="loss-unknown">（未判定 {{ record.unknown }}）</span>
            </template>
            <template v-else-if="column.key === 'rate'">
              <a-progress
                v-if="record.lossRate !== null"
                :percent="Math.round(record.lossRate * 100)"
                size="small"
                :stroke-color="record.lossRate >= 0.5 ? 'var(--status-danger-fg)' : 'var(--brand-600)'"
              />
              <span v-else class="loss-none">—</span>
            </template>
            <template v-else-if="column.key === 'avg'">
              <span v-if="record.avgScore !== null">{{ record.avgScore }} / {{ record.maxScoreSum / (record.denominator || 1) }}</span>
              <span v-else class="loss-none">—</span>
            </template>
          </template>
        </a-table>

        <div v-if="data && data.versions.length" class="loss-versions">
          批改版本：
          <span v-for="v in data.versions" :key="(v.checkerId || '') + (v.canonicalSha256 || '')" class="loss-ver">
            {{ v.checkerId || '（无 checker_id）' }} · {{ shortHash(v.canonicalSha256) }} · {{ v.submissions }} 份
          </span>
        </div>
      </template>
    </a-spin>
  </a-drawer>
</template>

<script setup>
/**
 * LossDistributionDrawer.vue —— R2-B68（WAVE3）：按班看失分项分布的只读抽屉。
 * 数据源：GET /teacher/assignments/:id/loss-distribution（教师端，班级受可见范围约束）
 *        GET /admin/grading-runs/loss-distribution（管理员端，全量只读）
 * 口径：后端复用既有批改结果投影（Submission.aiFeedback.breakdown），本组件只做展示（分子/分母/失分率）。
 * 纪律：错误文案统一走 errorCopyOf（禁止 err.message 上屏）；空数据给可读空态，不白屏。
 */
import { ref, watch } from 'vue';
import request from '../api/request.js';
import { errorCopyOf } from '../composables/errorCopy.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  assignmentId: { type: Number, default: null },
  classId: { type: Number, default: null },
  role: { type: String, default: 'teacher' },   // 'teacher' | 'admin'
});
const emit = defineEmits(['update:open']);

const loading = ref(false);
const error = ref('');
const data = ref(null);

const columns = [
  { title: '判据项', key: 'item', width: 260 },
  { title: '失分（分子/分母）', key: 'loss', width: 160 },
  { title: '失分率', key: 'rate', width: 180 },
  { title: '平均得分', key: 'avg', width: 140 },
];

const shortHash = (h) => (h ? String(h).slice(0, 12) + '…' : '（无指纹）');
const close = () => emit('update:open', false);

async function load() {
  if (!props.assignmentId) {
    error.value = '请先选择作业后再查看失分项分布';
    data.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const r = props.role === 'admin'
      ? await request.get('/admin/grading-runs/loss-distribution', {
        params: { assignmentId: props.assignmentId, ...(props.classId ? { classId: props.classId } : {}) },
      })
      : await request.get('/teacher/assignments/' + props.assignmentId + '/loss-distribution', {
        params: props.classId ? { classId: props.classId } : {},
      });
    data.value = r.data || null;
  } catch (e) {
    error.value = errorCopyOf(e, { tag: 'LossDistributionDrawer.vue 加载失分分布', action: '加载' });
    data.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.open, (v) => { if (v) load(); });
</script>

<style scoped>
.loss-meta { display:flex; flex-wrap:wrap; gap:16px; margin-bottom:12px; font-size:var(--fs-caption); color:var(--text-tertiary); }
.loss-title { margin-left:8px; color:var(--text-tertiary); font-size:var(--fs-caption); }
.loss-num { font-variant-numeric: tabular-nums; }
.loss-num u { text-decoration:none; color:var(--text-tertiary); }
.loss-unknown { margin-left:6px; color:var(--text-tertiary); font-size:var(--fs-caption); }
.loss-none { color:var(--text-disabled); }
.loss-versions { margin-top:12px; font-size:var(--fs-caption); color:var(--text-tertiary); }
.loss-ver { margin-left:8px; }
</style>
