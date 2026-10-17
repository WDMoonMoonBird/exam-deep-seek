<script setup>
/**
 * SubmitConfirm.vue —— 交卷确认 Sheet 的内容（Answer.vue 页内 Sheet，无独立路由）
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #13；设计参照 student-submit-confirm.html（只读）
 * 数据全部来自 Answer.vue 的前端状态（无接口）：未答数量/剩余时间/提交结果统计。
 * v1：只提交已作答内容；失败不关闭 Sheet，可重试失败项。
 */
import { computed } from 'vue';
import MIcon from '../../components/MIcon.vue';

const props = defineProps({
  answered: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  unanswered: { type: Array, default: () => [] },
  remainingText: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  progress: { type: Object, default: () => ({ done: 0, total: 0 }) },
  result: { type: Object, default: null },
  expired: { type: Boolean, default: false },
  limitText: { type: String, default: '' },
});

defineEmits(['confirm', 'retry', 'continue']);

const shownUnanswered = computed(() => props.unanswered.slice(0, 5));
const moreCount = computed(() => Math.max(0, props.unanswered.length - shownUnanswered.value.length));
const hasFailure = computed(() => !!(props.result && props.result.fail > 0));
const progressPercent = computed(() => {
  const total = Number(props.progress && props.progress.total) || 0;
  const done = Number(props.progress && props.progress.done) || 0;
  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
});
</script>

<template>
  <div class="sc-body">
    <div v-if="expired" class="banner banner--danger sc-warn" role="alert">
      <MIcon name="alert" />
      <div><b>已过截止时间</b>：不能再提交答案，可返回查看已作答内容。</div>
    </div>
    <div v-else-if="limitText" class="banner banner--danger sc-warn" role="alert">
      <MIcon name="alert" />
      <div><b>{{ limitText }}</b>：无法继续提交，如需增加次数请联系任课教师。</div>
    </div>
    <div v-else-if="unanswered.length" class="banner banner--warning sc-warn" role="alert">
      <MIcon name="alert" />
      <div><b>还有 {{ unanswered.length }} 题未作答</b>：未作答的题按 0 分计，提交后不可修改。</div>
    </div>
    <div v-else class="banner banner--success sc-warn" role="status">
      <MIcon name="check-circle" />
      <div><b>全部题目已作答</b>：请确认后提交，提交后不可修改。</div>
    </div>

    <div class="stats stats--2 sc-stats">
      <div class="stat">
        <div class="v tnum">{{ answered }}</div>
        <div class="k">已答题数 · 共 {{ total }} 题</div>
      </div>
      <div class="stat" :class="{ 'stat--warn': unanswered.length > 0 }">
        <div class="v tnum">{{ unanswered.length }}</div>
        <div class="k">未答题数</div>
      </div>
    </div>

    <div class="sc-left">
      <span class="t"><MIcon name="clock" />剩余时间</span>
      <span class="sc-left-v tnum">{{ remainingText }}</span>
    </div>

    <div v-if="unanswered.length" class="list sc-unanswered" aria-label="未作答题目">
      <div v-for="(unit, index) in shownUnanswered" :key="index" class="rowitem">
        <span class="row-main">
          <span class="row-title">{{ unit.title }}</span>
          <span class="row-sub">{{ unit.typeLabel }}<span v-if="unit.score != null"> · {{ unit.score }} 分</span></span>
        </span>
        <span class="row-side"><span class="tag tag--warning">未作答</span></span>
      </div>
      <div v-if="moreCount" class="sc-more">还有 {{ moreCount }} 题未作答，可在答题卡查看。</div>
    </div>

    <div v-if="submitting" class="sc-progress" role="status">
      <div class="between">
        <span>正在提交已作答题目</span>
        <span class="tnum">{{ progress.done }} / {{ progress.total }}</span>
      </div>
      <div class="bar mt8" role="progressbar" aria-label="提交进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="progressPercent">
        <i :style="{ width: progressPercent + '%' }"></i>
      </div>
    </div>

    <div v-if="result" class="sc-result" role="status">
      <div class="banner" :class="hasFailure ? 'banner--danger' : 'banner--success'">
        <MIcon :name="hasFailure ? 'alert' : 'check-circle'" />
        <div>
          <b>{{ hasFailure ? '部分题目提交失败' : '提交成功' }}</b>：
          成功 {{ result.ok }} 题<span v-if="hasFailure">，失败 {{ result.fail }} 题（可重试失败项）</span>。
        </div>
      </div>
      <div v-if="hasFailure" class="list sc-failures" aria-label="提交失败的题目">
        <div v-for="(fail, index) in result.failures" :key="index" class="rowitem">
          <span class="row-main">
            <span class="row-title">{{ fail.title }}</span>
            <span class="row-sub">{{ fail.message }}</span>
          </span>
        </div>
      </div>
    </div>

    <p class="sc-tip">
      <MIcon name="lock" />
      <span>提交后不可修改，也未提供撤回入口；成绩将在教师评分并发布后可见。</span>
    </p>
  </div>
</template>

<style scoped>
.sc-body { padding-bottom: 4px; }
.sc-warn { align-items: flex-start; }
.sc-warn .icon { margin-top: 1px; }
.sc-stats { margin-top: 14px; }
.sc-stats .stat { padding: 12px 14px; }
.sc-stats .stat .v { font-size: 26px; }
.sc-stats .stat .k { margin-top: 2px; white-space: normal; }
.sc-left { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding: 11px 14px; border-radius: 12px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); font-size: 13px; color: var(--text-secondary); }
.sc-left .t { display: inline-flex; align-items: center; }
.sc-left .t .icon { width: 16px; height: 16px; margin-right: 6px; color: var(--status-warning-fg); }
.sc-left-v { color: var(--status-warning-fg); font-weight: var(--m-fw-semibold); }
.sc-unanswered { margin-top: 12px; }
.sc-unanswered .rowitem { min-height: 48px; padding: 10px 12px; }
.sc-unanswered .row-main { display: flex; flex-direction: column; }
.sc-unanswered .row-title { font-size: 13.5px; }
.sc-unanswered .row-sub { font-size: 12px; }
.sc-more { padding: 10px 12px; font-size: 12px; color: var(--text-tertiary); border-top: 1px solid var(--border-subtle); }
.sc-progress { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); font-size: 13px; color: var(--text-secondary); }
.sc-result { margin-top: 14px; }
.sc-failures { margin-top: 10px; }
.sc-failures .rowitem { min-height: 48px; padding: 10px 12px; }
.sc-failures .row-main { display: flex; flex-direction: column; }
.sc-failures .row-title { font-size: 13.5px; }
.sc-failures .row-sub { font-size: 12px; color: var(--status-danger-fg); }
.sc-tip { display: flex; align-items: flex-start; margin-top: 14px; font-size: 12px; line-height: 1.55; color: var(--text-tertiary); }
.sc-tip .icon { width: 14px; height: 14px; margin-right: 6px; margin-top: 1px; flex: none; }
</style>
