<script setup>
/**
 * 批量审核 · 确认与执行 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7.4、05-page-specs 屏 26、09 §4 批量降级口径。
 * 流程：选中 ids（来自 ?ids=）→ 逐条 PUT /teacher/submissions/:id/review（并发 3）
 *      → 成功项一次 PUT /teacher/submissions/publish { submissionIds }。
 * 不承诺原子：显示进度、失败原因并支持重试失败项；不含「含教师评语 N 份」等延期统计。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import { MEmpty, MIcon, MProgress, MSkeleton, MStatusTag } from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { formatDateTime } from '../../../domain/format.js';

const CONCURRENCY = 3;
const route = useRoute();
const router = useRouter();
const toast = useMobileToast();
const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'MobileTeacherBatchConfirm.vue', action: '批量审核' });

const listLoading = ref(false);
const listError = ref('');
const submissions = ref([]);
const missingIds = ref([]);
const phase = ref('idle');
const results = ref([]);
const publishError = ref('');
const publishDone = ref(false);
const assignment = ref(null);
const assignmentLoading = ref(false);
const assignmentError = ref('');

const ids = computed(() => {
  const raw = route.query.ids;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const seen = {};
  const out = [];
  raw.split(',').forEach((part) => {
    const n = Number(part);
    if (Number.isInteger(n) && n > 0 && !seen[n]) {
      seen[n] = true;
      out.push(n);
    }
  });
  return out;
});
const assignmentId = computed(() => {
  const n = Number(route.query.assignmentId);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
});
const classId = computed(() => {
  const n = Number(route.query.classId);
  return Number.isInteger(n) && n > 0 ? Number(n) : null;
});
// 契约 §6/§7：实训题不得走通用 PUT review；有 assignmentId 时先查题目 type，含 project 一律拒绝批量。
const hasProject = computed(() => {
  const rows = (assignment.value && assignment.value.assignmentQuestions) || [];
  return rows.some((aq) => aq && aq.question && aq.question.type === 'project');
});
const guardBlocked = computed(() => !assignmentId.value || assignmentLoading.value || !!assignmentError.value || hasProject.value);
const guardTitle = computed(() => (hasProject.value ? '该作业含实训题，不能批量审核' : '未指定作业，不能批量审核'));
const guardDescription = computed(() => (hasProject.value
  ? '批量入口会走通用评分类接口，无法覆盖实训题的评分规则与教师评语要求；请返回审核队列逐份审核。'
  : '请从具体作业进入批量审核，以便确认作业是否含实训题。'));
const selected = computed(() => submissions.value);
const lowScore = computed(() => selected.value.filter((item) => Number(item.aiScore) < 60));
const total = computed(() => selected.value.length);
const reviewedCount = computed(() => results.value.filter((item) => item.ok).length);
const failedItems = computed(() => results.value.filter((item) => !item.ok));
const isRunning = computed(() => phase.value === 'reviewing' || phase.value === 'publishing');
const isDone = computed(() => phase.value === 'done');
const backToBatch = computed(() => {
  const query = {};
  if (ids.value.length) query.ids = ids.value.join(',');
  if (assignmentId.value) query.assignmentId = assignmentId.value;
  if (classId.value) query.classId = String(classId.value);
  return { path: '/m/teacher/batch', query };
});
const backToQueue = computed(() => {
  const query = {};
  if (assignmentId.value) query.assignmentId = assignmentId.value;
  if (classId.value) query.classId = String(classId.value);
  return { path: '/m/teacher/review', query };
});

function displayNo(no) {
  const text = String(no || '');
  const at = text.indexOf('@');
  return at > 0 ? text.slice(0, at) : text;
}

function resultOf(id) {
  return results.value.find((item) => item.id === id) || null;
}

function resultText(item) {
  const result = resultOf(item.id);
  if (!result) return phase.value === 'idle' ? '待处理' : '等待中';
  if (result.ok) return '已通过';
  return result.reason || '处理失败';
}

function resultType(item) {
  const result = resultOf(item.id);
  if (!result) return 'neutral';
  return result.ok ? 'success' : 'danger';
}

async function loadAssignmentGuard() {
  if (!assignmentId.value) return false;
  assignmentLoading.value = true;
  assignmentError.value = '';
  const r = await safeLoad(
    () => request.get('/teacher/assignments/' + assignmentId.value, { silent: true }),
    { notify: false }
  );
  assignmentLoading.value = false;
  if (r.error) {
    assignmentError.value = r.message || '作业信息加载失败，无法确认是否含实训题';
    return false;
  }
  assignment.value = r.data || null;
  return true;
}

async function retryGuard() {
  const ok = await loadAssignmentGuard();
  if (ok && !hasProject.value) resolveSubmissions();
}

async function resolveSubmissions() {
  if (guardBlocked.value) return;
  listLoading.value = true;
  listError.value = '';
  const params = { status: 'ai_graded', page: 1, pageSize: 100 };
  if (assignmentId.value) params.assignmentId = assignmentId.value;
  if (classId.value) params.classId = classId.value;
  const r = await safeLoad(() => request.get('/teacher/submissions', { params }));
  listLoading.value = false;
  if (r.error) {
    listError.value = r.message || '选中的提交加载失败';
    return;
  }
  const rows = ((r.data && r.data.list) || []).filter((item) => ids.value.indexOf(item.id) >= 0);
  const found = {};
  rows.forEach((item) => { found[item.id] = true; });
  missingIds.value = ids.value.filter((id) => !found[id]);
  submissions.value = rows;
}

async function runPool(items, worker, concurrency) {
  const queue = items.slice();
  const workers = [];
  const count = Math.max(1, Math.min(concurrency, queue.length));
  for (let i = 0; i < count; i += 1) {
    workers.push((async () => {
      while (queue.length) {
        const item = queue.shift();
        // eslint 规则只查缺陷；顺序处理由 worker 自己保证
        await worker(item);
      }
    })());
  }
  await Promise.all(workers);
}

async function runReviewFor(item) {
  if (guardBlocked.value) return; // 双保险：守卫未通过时绝不发起通用 review（尤其实训题）
  if (item.aiScore == null) {
    results.value.push({ id: item.id, ok: false, reason: '缺少 AI 分数，请逐份审核' });
    return;
  }
  const r = await safeSubmit(
    () => request.put('/teacher/submissions/' + item.id + '/review', { finalScore: item.aiScore }, { silent: true }),
    { notify: false, action: '审核通过' }
  );
  results.value.push({ id: item.id, ok: !r.error, reason: r.error ? (r.message || '审核失败') : '' });
}

async function publishReviewed() {
  const successIds = results.value.filter((item) => item.ok).map((item) => item.id);
  if (!successIds.length) {
    publishDone.value = false;
    publishError.value = '没有成功审核的提交，未执行发布';
    phase.value = 'done';
    return;
  }
  phase.value = 'publishing';
  publishError.value = '';
  const r = await safeSubmit(
    () => request.put('/teacher/submissions/publish', { submissionIds: successIds }, { silent: true }),
    { notify: false, action: '发布成绩' }
  );
  if (r.error) {
    publishError.value = r.message || '发布失败，可重试发布（已通过的提交不会丢失）';
    phase.value = 'done';
    return;
  }
  publishDone.value = true;
  phase.value = 'done';
  toast.show('已通过并发布 ' + successIds.length + ' 份提交');
}

async function startConfirm() {
  if (guardBlocked.value || isRunning.value || !total.value) return;
  results.value = [];
  publishError.value = '';
  publishDone.value = false;
  phase.value = 'reviewing';
  await runPool(selected.value, runReviewFor, CONCURRENCY);
  await publishReviewed();
}

async function retryFailed() {
  if (isRunning.value) return;
  const failed = failedItems.value.slice();
  if (!failed.length) return;
  const items = selected.value.filter((item) => failed.some((f) => f.id === item.id));
  if (!items.length) return;
  results.value = results.value.filter((item) => item.ok);
  phase.value = 'reviewing';
  await runPool(items, runReviewFor, CONCURRENCY);
  await publishReviewed();
}

async function retryPublish() {
  if (isRunning.value) return;
  await publishReviewed();
}

function finish() {
  router.replace(backToQueue.value);
}

onMounted(async () => {
  if (!assignmentId.value) return;
  const ok = await loadAssignmentGuard();
  if (ok && !hasProject.value) resolveSubmissions();
});
</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="批量审核" back :back-to="backToBatch">
      <template #right>
        <button type="button" class="iconbtn iconbtn--text" @click="router.push(backToQueue)">关闭</button>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <div v-if="guardBlocked" class="page mt8">
        <MSkeleton v-if="assignmentLoading" variant="card" :count="2" />
        <div v-else-if="assignmentError" class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ assignmentError }}<button type="button" class="banner-link" @click="retryGuard">重试</button></div>
        </div>
        <MEmpty v-else icon="alert" :title="guardTitle" :description="guardDescription">
          <button type="button" class="btn btn--primary" @click="router.push(backToQueue)">返回审核队列</button>
        </MEmpty>
      </div>

      <template v-else>
      <div v-if="listLoading" class="page mt8"><MSkeleton variant="card" :count="2" /></div>
      <div v-else-if="listError" class="page mt8">
        <div class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ listError }}<button type="button" class="banner-link" @click="resolveSubmissions">重试</button></div>
        </div>
      </div>

      <div v-else-if="!selected.length" class="page mt8">
        <MEmpty
          icon="inbox"
          title="没有可处理的提交"
          description="选中的提交可能已被其他操作处理，或已不在待审核状态。请返回队列重新选择。"
        >
          <button type="button" class="btn btn--primary" @click="router.push(backToQueue)">返回审核队列</button>
        </MEmpty>
      </div>

      <template v-else>
        <div class="page mt8">
          <div class="card">
            <div class="card-title">本次批量</div>
            <div class="hit-row">
              <b class="hit-number">{{ total }}</b>
              <span class="hit-unit">份提交</span>
              <MStatusTag v-if="isDone && publishDone" type="success">已发布</MStatusTag>
              <MStatusTag v-else-if="isDone" type="warning">部分完成</MStatusTag>
              <MStatusTag v-else type="warning">待确认</MStatusTag>
            </div>
            <p class="hit-sub">逐条审核通过后，统一发布成绩；发布后学生立即可见，且不可撤销。</p>
          </div>

          <div v-if="missingIds.length" class="banner banner--warning mt12">
            <MIcon name="alert" />
            <div>{{ missingIds.length }} 份提交已不在待审核状态，已自动跳过（不会重复处理）。</div>
          </div>

          <div v-if="lowScore.length" class="banner banner--danger mt12">
            <MIcon name="alert" />
            <div><b>{{ lowScore.length }} 份 AI 分数低于 60</b>，建议先逐份复核再批量通过。</div>
          </div>

          <section v-if="isRunning || isDone" class="card mt12">
            <div class="between">
              <div class="card-title">{{ phase === 'publishing' ? '正在发布成绩' : (isDone ? '处理结果' : '正在逐条审核') }}</div>
              <span class="tnum progress-text">{{ results.length }} / {{ total }}</span>
            </div>
            <div class="mt12"><MProgress :value="results.length" :max="total || 1" label="批量处理进度" /></div>
            <p class="help mt8">
              <template v-if="phase === 'reviewing'">正在并发 {{ CONCURRENCY }} 条提交审核，请勿离开页面。</template>
              <template v-else-if="phase === 'publishing'">正在发布 {{ reviewedCount }} 份已通过的成绩。</template>
              <template v-else>成功 {{ reviewedCount }} 份 · 失败 {{ failedItems.length }} 份<span v-if="publishDone"> · 已发布</span></template>
            </p>
            <div v-if="publishError" class="banner banner--danger mt12" role="alert">
              <MIcon name="alert" />
              <div>{{ publishError }}
                <button v-if="reviewedCount" type="button" class="banner-link" @click="retryPublish">重试发布</button>
              </div>
            </div>
          </section>

          <div class="list mt12">
            <div v-for="item in selected" :key="item.id" class="rowitem batch-result-row">
              <span class="avatar avatar--sm" aria-hidden="true">{{ String((item.student && item.student.realName) || '?').slice(0, 1) }}</span>
              <span class="row-main">
                <span class="row-title">{{ (item.student && item.student.realName) || '未知学生' }}</span>
                <span class="row-sub">{{ displayNo(item.student && item.student.username) }} · {{ (item.assignment && item.assignment.title) || '未知作业' }}</span>
                <span class="row-sub">提交于 {{ formatDateTime(item.submittedAt) || '未知时间' }}</span>
              </span>
              <span class="row-side result-side">
                <span class="result-score">{{ item.aiScore == null ? '--' : item.aiScore }}<small>AI 分</small></span>
                <MStatusTag :type="resultType(item)">{{ resultText(item) }}</MStatusTag>
              </span>
            </div>
          </div>

          <div class="banner banner--danger mt12">
            <MIcon name="alert" />
            <div><b>发布后学生立即可见，且不可撤销。</b>批量操作不保证原子：失败项可在本页重试，成功项不会重复处理。</div>
          </div>

          <button v-if="isDone && failedItems.length" type="button" class="btn btn--secondary btn--block mt12" :disabled="isRunning" @click="retryFailed">
            重试失败项（{{ failedItems.length }}）
          </button>
        </div>
      </template>
      </template>
    </main>

    <div v-if="guardBlocked" class="actionbar">
      <button type="button" class="btn btn--primary btn--block" @click="router.push(backToQueue)">返回审核队列</button>
    </div>

    <div v-else class="actionbar">
      <button type="button" class="btn btn--secondary" :disabled="isRunning" @click="router.push(backToQueue)">返回</button>
      <button v-if="!isDone" type="button" class="btn btn--primary" :disabled="isRunning || !selected.length" @click="startConfirm">
        {{ isRunning ? '处理中…' : '确认通过并发布 (' + total + ')' }}
      </button>
      <button v-else type="button" class="btn btn--primary" @click="finish">完成</button>
    </div>
  </MobileLayout>
</template>

<style scoped>
.hit-row { display: flex; align-items: flex-end; margin-top: 14px; }
.hit-number { font-size: 46px; line-height: 0.95; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.hit-unit { margin: 0 0 6px 6px; font-size: 14px; color: var(--text-tertiary); }
.hit-row .tag { margin: 0 0 6px auto; }
.hit-sub { margin-top: 8px; font-size: 12.5px; line-height: 1.55; color: var(--text-secondary); }
.progress-text { font-size: 12px; color: var(--text-tertiary); }
.batch-result-row { width: 100%; text-align: left; align-items: flex-start; }
.result-side { flex-direction: column; align-items: flex-end; }
.result-score { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.result-score small { display: block; margin-top: 1px; font-size: 10.5px; font-weight: 400; color: var(--text-tertiary); }
.result-side .tag { margin-top: 6px; max-width: 120px; white-space: normal; text-align: right; height: auto; min-height: 23px; padding-top: 3px; padding-bottom: 3px; line-height: 1.3; }
</style>
