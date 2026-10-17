<script setup>
/**
 * 教师审核详情 · 评分 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7.3、05-page-specs 屏 22、09 §4 教师审核降级口径。
 * 数据：
 *   · GET /teacher/submissions/:id                       提交详情（学生/题目/作业/AI 总分/整段评语）
 *   · GET /teacher/submissions/:id/project               仅实训题：AI 分项 breakdown（通用题不请求）
 *   · PUT /teacher/submissions/:id/review                通用题审核通过（finalScore + teacherFeedback）
 *   · PUT /teacher/submissions/:id/project/review        实训题审核通过（需显式教师评语）
 *   · PUT /teacher/submissions/:id/score                 仅保存改分（不推进审核/发布）
 * v1 无「打回」、无班均/最高分/排名、通用题无 AI 分项。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import {
  MField, MIcon, MScore, MSheet, MSkeleton, MStatusTag,
} from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { useMobileToast } from '../../composables/useMobileToast.js';
import { formatDateTime } from '../../../domain/format.js';

const AB_NORMAL_FEEDBACK = '请联系老师';
const route = useRoute();
const router = useRouter();
const toast = useMobileToast();
const submissionId = computed(() => Number(route.params.submissionId));
const queryAssignmentId = computed(() => {
  const n = Number(route.query.assignmentId);
  return Number.isInteger(n) && n > 0 ? String(n) : '';
});
const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'MobileTeacherReviewDetail.vue', action: '加载审核详情' });

const submission = ref(null);
const loading = ref(false);
const loadError = ref('');
const project = ref(null);
const projectLoading = ref(false);
const projectError = ref('');
const scoreInput = ref('');
const feedback = ref('');
const scoreTouched = ref(false);
const feedbackTouched = ref(false);
const saving = ref(false);
const passing = ref(false);
const publishing = ref(false);
const confirmOpen = ref(false);
const publishConfirmOpen = ref(false);
const actionError = ref('');
const quoteApplied = ref(false);

const question = computed(() => (submission.value && submission.value.question) || {});
const isProject = computed(() => question.value.type === 'project');
const maxScore = computed(() => {
  const fromProject = project.value && project.value.question && project.value.question.maxScore;
  const value = fromProject != null ? fromProject : question.value.maxScore;
  return Number(value) > 0 ? Number(value) : 100;
});
const student = computed(() => (submission.value && submission.value.student) || {});
const assignment = computed(() => (submission.value && submission.value.assignment) || {});
const statusKey = computed(() => (submission.value && submission.value.status) || '');
const isPublished = computed(() => statusKey.value === 'published');
const isReadyToPublish = computed(() => statusKey.value === 'reviewed');
const abnormal = computed(() => !!(submission.value && submission.value.aiFeedback === AB_NORMAL_FEEDBACK));
const statusInfo = computed(() => {
  const map = {
    submitted: { text: 'AI 评分中', type: 'info' },
    ai_graded: { text: '待审核', type: 'warning' },
    reviewed: { text: '已审核', type: 'success' },
    published: { text: '已发布', type: 'success' },
  };
  return map[statusKey.value] || { text: statusKey.value || '未知状态', type: 'neutral' };
});
const aiComment = computed(() => {
  if (isProject.value) {
    const result = project.value && project.value.aiResult;
    return (result && result.overallComment) || '';
  }
  const raw = submission.value && submission.value.aiFeedback;
  if (!raw || raw === AB_NORMAL_FEEDBACK) return '';
  return raw;
});
const projectBreakdown = computed(() => {
  const result = project.value && project.value.aiResult;
  const list = result && Array.isArray(result.breakdown) ? result.breakdown : [];
  return list.map((item, index) => ({
    key: (item && (item.title || item.item)) || '分项 ' + (index + 1),
    title: (item && (item.title || item.item)) || '分项 ' + (index + 1),
    score: item && item.score != null ? item.score : 0,
    maxScore: item && item.maxScore != null ? item.maxScore : null,
    comment: (item && item.comment) || '',
  }));
});
const backTo = computed(() => {
  const query = queryAssignmentId.value ? '?assignmentId=' + queryAssignmentId.value : '';
  return '/m/teacher/review' + query;
});
const parsedScore = computed(() => {
  const text = String(scoreInput.value).trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > maxScore.value) return null;
  return value;
});
const scoreErrorText = computed(() => {
  const text = String(scoreInput.value).trim();
  if (!text) return '请填写教师评分';
  if (!/^\d+$/.test(text)) return '分数需为整数（0 – ' + maxScore.value + '）';
  if (parsedScore.value == null) return '分数需在 0 – ' + maxScore.value + ' 之间';
  return '';
});
const feedbackError = computed(() => {
  if (isProject.value && !String(feedback.value).trim()) return '实训题需填写教师评语后再通过审核';
  return '';
});

function displayNo(no) {
  const text = String(no || '');
  const at = text.indexOf('@');
  return at > 0 ? text.slice(0, at) : text;
}

function applyQuoteFromRoute() {
  const quote = route.query.quote;
  if (typeof quote !== 'string' || !quote.trim()) return;
  const text = quote.trim();
  feedback.value = feedback.value ? feedback.value.replace(/\s+$/, '') + '\n' + text : text;
  quoteApplied.value = true;
  const nextQuery = { ...route.query };
  delete nextQuery.quote;
  router.replace({ path: route.path, query: nextQuery });
}

async function loadDetail() {
  loading.value = true;
  loadError.value = '';
  const r = await safeLoad(() => request.get('/teacher/submissions/' + submissionId.value));
  loading.value = false;
  if (r.error) {
    loadError.value = r.message || '提交详情加载失败';
    return;
  }
  submission.value = r.data || null;
  scoreInput.value = submission.value && submission.value.finalScore != null
    ? String(submission.value.finalScore)
    : (submission.value && submission.value.aiScore != null ? String(submission.value.aiScore) : '');
  feedback.value = (submission.value && submission.value.teacherFeedback) || '';
  applyQuoteFromRoute();
  if (isProject.value) loadProject();
}

async function loadProject() {
  projectLoading.value = true;
  projectError.value = '';
  const r = await safeLoad(
    () => request.get('/teacher/submissions/' + submissionId.value + '/project'),
    { notify: false, action: '加载实训题分项' }
  );
  projectLoading.value = false;
  if (r.error) {
    projectError.value = r.message || 'AI 分项加载失败';
    return;
  }
  project.value = r.data || null;
}

function useAiComment() {
  if (!aiComment.value) return;
  feedback.value = aiComment.value;
  feedbackTouched.value = true;
  toast.show('已采用 AI 评语，可继续编辑');
}

async function saveScore() {
  scoreTouched.value = true;
  if (scoreErrorText.value) return;
  if (saving.value) return;
  saving.value = true;
  actionError.value = '';
  const r = await safeSubmit(() => request.put('/teacher/submissions/' + submissionId.value + '/score', {
    finalScore: parsedScore.value,
  }), { action: '保存改分' });
  saving.value = false;
  if (r.error) {
    actionError.value = r.message || '保存改分失败';
    return;
  }
  if (submission.value) {
    submission.value.finalScore = parsedScore.value;
    if (r.data && r.data.status) submission.value.status = r.data.status;
  }
  toast.show('分数已保存，审核状态已更新');
}

function openConfirm() {
  actionError.value = '';
  scoreTouched.value = true;
  feedbackTouched.value = true;
  if (scoreErrorText.value || feedbackError.value) return;
  confirmOpen.value = true;
}

async function confirmPass() {
  if (passing.value) return;
  passing.value = true;
  actionError.value = '';
  const payload = { finalScore: parsedScore.value, teacherFeedback: String(feedback.value || '') };
  const url = isProject.value
    ? '/teacher/submissions/' + submissionId.value + '/project/review'
    : '/teacher/submissions/' + submissionId.value + '/review';
  const r = await safeSubmit(() => request.put(url, payload), { action: '通过审核' });
  passing.value = false;
  if (r.error) {
    confirmOpen.value = false;
    actionError.value = r.message || '审核通过失败';
    return;
  }
  confirmOpen.value = false;
  if (submission.value && !isPublished.value) submission.value.status = 'reviewed';
  toast.show(isPublished.value ? '已保存审核' : '已通过审核，发布后学生可见');
}

async function publishSubmission() {
  if (publishing.value) return;
  publishing.value = true;
  actionError.value = '';
  const r = await safeSubmit(
    () => request.put('/teacher/submissions/publish', { submissionIds: [submissionId.value] }),
    { action: '发布成绩' }
  );
  publishing.value = false;
  if (r.error) {
    publishConfirmOpen.value = false;
    actionError.value = r.message || '发布失败，请重试';
    return;
  }
  if (submission.value) submission.value.status = 'published';
  publishConfirmOpen.value = false;
  toast.show('已发布，学生现在可以看到成绩');
  window.setTimeout(() => {
    router.replace({
      path: '/m/teacher/review',
      query: queryAssignmentId.value ? { assignmentId: queryAssignmentId.value } : {},
    });
  }, 500);
}

function goCode() {
  const query = queryAssignmentId.value ? { assignmentId: queryAssignmentId.value } : {};
  router.push({ path: '/m/teacher/review/' + submissionId.value + '/code', query });
}

function goDiff() {
  const query = queryAssignmentId.value ? { assignmentId: queryAssignmentId.value } : {};
  router.push({ path: '/m/teacher/review/' + submissionId.value + '/diff', query });
}

onMounted(loadDetail);
</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="审核详情" back :back-to="backTo">
      <template #right>
        <button type="button" class="iconbtn iconbtn--text" @click="router.push(backTo)">队列</button>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <div v-if="loading" class="page mt8"><MSkeleton variant="card" :count="2" /></div>
      <div v-else-if="loadError" class="page mt8">
        <div class="banner banner--danger" role="alert">
          <MIcon name="alert" />
          <div>{{ loadError }}<button type="button" class="banner-link" @click="loadDetail">重试</button></div>
        </div>
        <button type="button" class="btn btn--secondary btn--block mt16" @click="router.push(backTo)">返回审核队列</button>
      </div>

      <template v-else-if="submission">
        <div class="page mt8">
          <div class="card student-bar">
            <span class="avatar" aria-hidden="true">{{ String(student.realName || '?').slice(0, 1) }}</span>
            <div class="grow student-info">
              <div class="between">
                <div class="student-name">{{ student.realName || '未知学生' }}</div>
                <MStatusTag :type="statusInfo.type">{{ statusInfo.text }}</MStatusTag>
              </div>
              <p class="student-sub">{{ displayNo(student.username) }}<span class="dot-sep">{{ assignment.title || '未知作业' }}</span></p>
              <p class="student-sub">提交于 {{ formatDateTime((submission && submission.submittedAt)) || '未知时间' }}<span v-if="submission.subQuestion"> · {{ submission.subQuestion.title }}</span></p>
            </div>
          </div>

          <div v-if="isReadyToPublish" class="banner banner--info mt12">
            <MIcon name="info" />
            <div><b>已通过审核，尚未发布</b>：学生暂不可见分数与评语，发布后立即可见。</div>
          </div>

          <div class="card mt12">
            <div class="between">
              <div class="card-title">AI 建议分</div>
              <MStatusTag :type="statusInfo.type">{{ statusInfo.text }}</MStatusTag>
            </div>
            <div class="score-row">
              <MScore :value="submission.aiScore != null ? submission.aiScore : null" :total="maxScore" size="hero" />
              <span class="score-total">AI 初评 · 满分 {{ maxScore }}</span>
            </div>

            <div v-if="abnormal" class="banner banner--danger mt12">
              <MIcon name="alert" />
              <div><b>AI 评分异常</b>：该提交需要人工确认分数与评语后再通过。</div>
            </div>
            <div v-if="isPublished" class="banner banner--warning mt12">
              <MIcon name="alert" />
              <div>该提交已发布：修改分数或评语会立即对学生生效。</div>
            </div>

            <MField
              label="教师评分"
              for-id="review-score"
              required
              :hint="'0 – ' + maxScore + ' 分，默认采用 AI 建议分；通过审核时以该分数为准。'"
              :error="scoreTouched ? scoreErrorText : ''"
            >
              <input
                id="review-score"
                v-model="scoreInput"
                class="input score-input"
                type="text"
                inputmode="numeric"
                :aria-invalid="scoreTouched && !!scoreErrorText ? 'true' : 'false'"
                @blur="scoreTouched = true"
              />
            </MField>
            <div v-if="!isProject" class="save-row">
              <button type="button" class="btn btn--sm btn--secondary" :disabled="saving" @click="saveScore">
                {{ saving ? '保存中…' : '保存改分' }}
              </button>
              <span class="save-hint">只保存分数，仍需「审核通过」才会进入已审核状态</span>
            </div>
          </div>

          <div v-if="isProject" class="card mt12">
            <div class="between">
              <div class="card-title">AI 分项</div>
              <MStatusTag type="accent">实训题</MStatusTag>
            </div>
            <div v-if="projectLoading" class="mt12"><MSkeleton variant="line" :count="4" /></div>
            <div v-else-if="projectError" class="banner banner--danger mt12" role="alert">
              <MIcon name="alert" /><div>{{ projectError }}<button type="button" class="banner-link" @click="loadProject">重试</button></div>
            </div>
            <p v-else-if="!projectBreakdown.length" class="help mt8">AI 未返回分项明细，请结合整段评语人工评分。</p>
            <div v-else class="breakdown mt8">
              <div v-for="item in projectBreakdown" :key="item.key" class="breakdown-row">
                <div class="between">
                  <span class="breakdown-title">{{ item.title }}</span>
                  <span class="breakdown-score">{{ item.score }}<small v-if="item.maxScore != null"> / {{ item.maxScore }}</small></span>
                </div>
                <p v-if="item.comment" class="breakdown-comment">{{ item.comment }}</p>
              </div>
            </div>
          </div>

          <div class="card mt12">
            <div class="card-title">AI 评语</div>
            <div v-if="aiComment" class="ai-note mt12">
              <div class="ai-note-head"><MIcon name="zap" />AI 评语</div>
              <p>{{ aiComment }}</p>
            </div>
            <p v-else class="help mt8">该提交没有可展示的 AI 整段评语。</p>
            <div v-if="aiComment" class="row mt12">
              <button type="button" class="btn btn--sm btn--soft" @click="useAiComment">采用 AI 评语</button>
            </div>
          </div>

          <div class="card mt12">
            <MField
              label="教师评语（学生可见）"
              for-id="review-feedback"
              :hint="isProject ? '实训题必须填写教师评语后再通过（不会回退到 AI 评语）' : '未填写时学生端将看到 AI 评语；通过后随成绩展示。'"
              :error="feedbackTouched ? feedbackError : ''"
            >
              <textarea
                id="review-feedback"
                v-model="feedback"
                class="textarea"
                maxlength="1000"
                placeholder="填写给学生的评语，例如：分页逻辑正确；补充说明大数组下的索引取舍。"
                :aria-invalid="feedbackTouched && !!feedbackError ? 'true' : 'false'"
                @blur="feedbackTouched = true"
              ></textarea>
            </MField>
            <div class="counter">{{ feedback.length }} / 1000</div>
            <div v-if="quoteApplied" class="banner banner--info mt8">
              <MIcon name="message" />
              <div>已从代码页引用选中内容到教师评语。</div>
            </div>
          </div>

          <div class="card mt12">
            <div class="card-title">代码与参考</div>
            <p class="help mt8">{{ isProject ? '查看学生提交文件与标准工程包；手机端只读。' : '只读查看学生作答；手机端不提供代码编辑。' }}</p>
            <div class="row g8 mt12">
              <button type="button" class="btn btn--sm btn--secondary" @click="goCode"><MIcon name="code" />查看代码</button>
              <button v-if="isProject" type="button" class="btn btn--sm btn--secondary" @click="goDiff"><MIcon name="file" />代码差异</button>
              <button type="button" class="btn btn--sm btn--ghost" @click="router.push(backTo)">返回队列</button>
            </div>
          </div>

          <div v-if="actionError" class="banner banner--danger mt12" role="alert">
            <MIcon name="alert" /><div>{{ actionError }}</div>
          </div>
        </div>
      </template>
    </main>

    <div class="actionbar">
      <template v-if="isReadyToPublish">
        <button type="button" class="btn btn--secondary" @click="router.push(backTo)">返回队列</button>
        <button type="button" class="btn btn--primary" :disabled="publishing" @click="publishConfirmOpen = true">
          {{ publishing ? '发布中…' : '发布成绩' }}
        </button>
      </template>
      <template v-else>
        <button v-if="!isProject" type="button" class="btn btn--secondary" :disabled="saving || !submission" @click="saveScore">
          {{ saving ? '保存中…' : '保存改分' }}
        </button>
        <button type="button" class="btn btn--primary" :disabled="passing || !submission" @click="openConfirm">
          {{ passing ? '提交中…' : (isPublished ? '保存审核' : '审核通过') }}
        </button>
      </template>
    </div>

    <MSheet v-model:open="confirmOpen" title="确认通过审核？" :subtitle="(student.realName || '') + ' · ' + (assignment.title || '')">
      <div class="card">
        <div class="kv"><span class="k">教师评分</span><span class="v">{{ parsedScore == null ? '未填写' : parsedScore + ' / ' + maxScore }}</span></div>
        <div class="kv"><span class="k">教师评语</span><span class="v">{{ String(feedback).trim() ? '已填写' : '未填写' }}</span></div>
        <div class="kv"><span class="k">当前状态</span><span class="v">{{ statusInfo.text }}</span></div>
      </div>
      <div class="banner banner--info mt12">
        <MIcon name="info" />
        <div v-if="isPublished">通过后保持已发布状态，修改会立即对学生生效。</div>
        <div v-else>通过后状态变为「已审核」。成绩需在发布后才对学生可见。</div>
      </div>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" :disabled="passing" @click="confirmOpen = false">取消</button>
        <button type="button" class="btn btn--primary btn--block" :disabled="passing" @click="confirmPass">
          {{ passing ? '提交中…' : '确认通过' }}
        </button>
      </template>
    </MSheet>

    <MSheet v-model:open="publishConfirmOpen" title="发布该份成绩？" :subtitle="(student.realName || '') + ' · ' + (assignment.title || '')">
      <div class="card">
        <div class="kv"><span class="k">教师评分</span><span class="v">{{ submission && submission.finalScore != null ? submission.finalScore + ' / ' + maxScore : (parsedScore == null ? '未填写' : parsedScore + ' / ' + maxScore) }}</span></div>
        <div class="kv"><span class="k">教师评语</span><span class="v">{{ String(feedback).trim() ? '已填写' : '未填写' }}</span></div>
        <div class="kv"><span class="k">发布后状态</span><span class="v">学生可见</span></div>
      </div>
      <div class="banner banner--danger mt12">
        <MIcon name="alert" />
        <div><b>发布后学生立即可见，且不可撤销。</b>如需修改，只能重新评分并再次发布通知。</div>
      </div>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" :disabled="publishing" @click="publishConfirmOpen = false">取消</button>
        <button type="button" class="btn btn--primary btn--block" :disabled="publishing" @click="publishSubmission">
          {{ publishing ? '发布中…' : '确认发布' }}
        </button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
.student-bar { display: flex; align-items: flex-start; }
.student-info { margin-left: 12px; }
.student-name { font-size: 16px; font-weight: 650; }
.student-sub { margin-top: 3px; font-size: 12px; color: var(--text-tertiary); }
.score-row { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 14px; }
.score-total { margin-bottom: 6px; font-size: 12px; color: var(--text-tertiary); }
.score-input { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
.save-row { display: flex; align-items: center; margin-top: 12px; }
.save-hint { margin-left: 10px; font-size: 12px; color: var(--text-tertiary); line-height: 1.45; }
.breakdown-row { padding: 10px 0; }
.breakdown-row + .breakdown-row { border-top: 1px solid var(--border-subtle); }
.breakdown-title { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.breakdown-score { font-size: 14px; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.breakdown-score small { font-size: 11px; font-weight: 400; color: var(--text-tertiary); }
.breakdown-comment { margin-top: 4px; font-size: 12px; line-height: 1.55; color: var(--text-secondary); }
</style>
