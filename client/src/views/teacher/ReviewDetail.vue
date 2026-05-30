<template>
  <div class="lc-page" v-if="data">
    <div class="lc-page-inner">
      <div class="lc-main" v-if="currentSq" :style="{ '--slide-dir': slideDir }">
        <!-- 左：大题 + 小题 -->
        <div class="lc-left">
          <div class="lc-q-header">
            <a-button type="link" size="small" @click="$router.back()">← 返回</a-button>
            <h3 class="lc-q-title">{{ q.title }}</h3>
            <span class="q-student">{{ studentName }} / {{ studentNo }}</span>
            <a-tag>总分 {{ q.maxScore }} 分</a-tag>
          </div>
          <div v-if="materialText" class="material-bar" @click="showMaterial = !showMaterial">
            <span>题目材料</span>
            <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
          </div>
          <Transition name="collapse">
            <div v-if="showMaterial && materialText" class="material-body">
              <div class="material-body-inner q-content" v-html="safeMaterial" />
            </div>
          </Transition>

          <div class="lc-left-tabs">
            <span v-for="(sq, i) in subQuestions" :key="sq.id"
              :class="['sq-tab', { active: activeSq === i }]"
              @click="switchSq(i)">
              第{{ i + 1 }}小题
            </span>
          </div>

          <div class="lc-left-body">
            <Transition name="panel-switch" mode="out-in">
              <div :key="activeSq" class="panel-wrap">
                <div class="sq-title-row">
                  <span class="sq-title">{{ currentSq.title || '第' + (activeSq + 1) + '小题' }}</span>
                  <a-tag v-if="currentSq.score" color="purple" size="small">{{ currentSq.score }} 分</a-tag>
                  <a-tag v-if="currentSub" :color="statusColor(currentSub.status, currentSub.aiFeedback)">{{ statusText(currentSub.status, currentSub.aiFeedback) }}</a-tag>
                </div>
                <div class="q-content" v-html="safeContent" />
              </div>
            </Transition>
          </div>
        </div>

        <!-- 右：学生代码 + 审核 -->
        <div class="lc-right">
          <div class="lc-editor-header">
            <span class="lc-editor-label"><CodeOutlined /> 学生答案</span>
            <Transition name="tag-switch" mode="out-in">
              <a-tag color="blue" style="margin-left:6px;" :key="activeSq">第 {{ activeSq + 1 }} 小题</a-tag>
            </Transition>
            <div class="lc-editor-actions">
              <span style="font-size:13px;color:#888;">{{ currentSq.language || 'cpp' }}</span>
            </div>
          </div>
          <div class="lc-editor-wrap">
            <Transition name="panel-switch" mode="out-in">
              <div :key="activeSq" class="panel-wrap" style="height:100%;">
                <CodeEditor :modelValue="currentAnswer" :language="currentSq.language || 'cpp'" readOnly :height="0" />
              </div>
            </Transition>
          </div>
          <div class="lc-footer">
            <div class="review-panel">
              <div class="rp-total">
                <span class="rp-total-label">总分</span>
                <span class="rp-total-score">{{ aiTotal }} / {{ q.maxScore || 0 }}</span>
              </div>
              <div class="rp-section">
                <span class="rp-label">AI 评分</span>
                <div class="rp-score-row">
                  <span class="rp-score">{{ currentSub?.aiScore ?? '—' }} / {{ currentSq.score || 0 }} 分</span>
                  <a-button v-if="currentSub" size="small" :loading="regrading[currentSq.id]" @click="regrade(currentSq)">重新评分</a-button>
                </div>
                <p class="rp-feedback">{{ currentSub?.aiFeedback || '暂无评语' }}</p>
              </div>
              <div class="rp-section" v-if="currentSub">
                <span class="rp-label">最终分数</span>
                <a-input-number v-model:value="reviewScores[currentSq.id]" :min="0" :max="currentSq.score" size="small" style="width:100px;" />
                <a-textarea v-model:value="reviewFeedbacks[currentSq.id]" :rows="2" size="small" placeholder="教师评语（选填）" style="margin-top:6px;" />
                <div class="rp-actions">
                  <a-button type="primary" size="small" :loading="saving[currentSq.id]" @click="saveReview(currentSq)">审核</a-button>
                  <a-button v-if="currentSub.status !== 'published'" size="small" :loading="publishing[currentSq.id]" @click="publishOne(currentSq)">发布</a-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import { CodeOutlined } from '@ant-design/icons-vue';
import DOMPurify from 'dompurify';
import request from '../../api/request.js';
import CodeEditor from '../../components/CodeEditor.vue';

const route = useRoute();
const data = ref(null);
const studentName = ref('');
const studentNo = ref('');
const q = ref({});
const subQuestions = ref([]);
const activeSq = ref(0);
const slideDir = ref(1);
const showMaterial = ref(true);

const subMap = ref({});
const reviewScores = reactive({});
const reviewFeedbacks = reactive({});
const saving = reactive({});
const publishing = reactive({});
const regrading = reactive({});

const currentSq = computed(() => subQuestions.value[activeSq.value] || {});
const aiTotal = computed(() => {
  let sum = 0;
  for (const key in subMap.value) {
    sum += subMap.value[key].aiScore || 0;
  }
  return sum;
});
const currentSub = computed(() => subMap.value[currentSq.value.id] || null);
const currentAnswer = computed(() => currentSub.value?.answer || '');

const safeMaterial = computed(() => DOMPurify.sanitize(q.value.material || ''));
const safeContent = computed(() => DOMPurify.sanitize((currentSq.value || {}).content || ''));
const materialText = computed(() => {
  const m = q.value.material || '';
  return m.replace(/<[^>]*>/g, '').trim();
});

function statusColor(s, fb) {
  if (fb === '请联系老师') return 'red';
  if (s === 'published') return 'green';
  if (s === 'reviewed') return 'blue';
  if (s === 'ai_graded') return 'green';
  return 'default';
}
function statusText(s, fb) {
  if (fb === '请联系老师') return '评分异常';
  if (s === 'published') return '已发布';
  if (s === 'reviewed') return '已审核';
  if (s === 'ai_graded') return 'AI已评分';
  if (s === 'submitted') return '待评分';
  return s;
}

function switchSq(index) {
  if (index === activeSq.value) return;
  slideDir.value = index > activeSq.value ? 1 : -1;
  activeSq.value = index;
}

async function regrade(sq) {
  const sub = subMap.value[sq.id];
  if (!sub) return;
  regrading[sq.id] = true;
  try {
    const r = await request.post(`/teacher/submissions/${sub.id}/regrade`);
    sub.aiScore = r.data.aiScore;
    sub.aiFeedback = r.data.aiFeedback;
    sub.status = 'ai_graded';
    reviewScores[sq.id] = r.data.aiScore;
    message.success('重新评分完成');
  } catch { message.error('重新评分失败'); }
  finally { regrading[sq.id] = false; }
}

async function saveReview(sq) {
  const sub = subMap.value[sq.id];
  if (!sub) return;
  saving[sq.id] = true;
  try {
    if (!reviewFeedbacks[sq.id]) reviewFeedbacks[sq.id] = sub.aiFeedback || '';
    const fb = reviewFeedbacks[sq.id];
    await request.put(`/teacher/submissions/${sub.id}/review`, {
      finalScore: reviewScores[sq.id],
      teacherFeedback: fb,
    });
    sub.status = 'reviewed';
    sub.finalScore = reviewScores[sq.id];
    message.success('审核已保存');
  } finally {
    saving[sq.id] = false;
  }
}

async function publishOne(sq) {
  const sub = subMap.value[sq.id];
  if (!sub) return;
  publishing[sq.id] = true;
  try {
    await request.put('/teacher/submissions/publish', { submissionIds: [sub.id] });
    sub.status = 'published';
    message.success('已发布');
  } finally {
    publishing[sq.id] = false;
  }
}

async function fetch() {
  const r = await request.get(`/teacher/submissions/${route.params.id}`);
  data.value = r.data;
  studentName.value = r.data.student?.realName || '';
  studentNo.value = r.data.student?.username || '';
  q.value = r.data.question || {};
  subQuestions.value = q.value.subQuestions || [];

  // build sub map from allSubmissions
  const map = {};
  (r.data.allSubmissions || []).forEach(s => {
    const key = s.subQuestionId || s.questionId;
    map[key] = s;
    reviewScores[key] = s.finalScore ?? s.aiScore ?? 0;
    reviewFeedbacks[key] = s.teacherFeedback || '';
  });
  subMap.value = map;

  activeSq.value = 0;
}

onMounted(fetch);
</script>

<style scoped>
.lc-page {
  display: flex; flex-direction: column;
  height: calc(100vh - 52px);
  margin: -28px -48px -40px;
  padding: 0;
  background: var(--canvas-parchment);
}
.lc-page-inner { flex: 1; display: flex; flex-direction: column; padding: 12px; min-height: 0; }
.lc-main { flex: 1; display: flex; overflow: hidden; gap: 12px; min-height: 0; }

/* 左 */
.lc-left {
  width: 50%; min-width: 380px;
  background: #fff; border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden; display: flex; flex-direction: column; min-height: 0;
}
.lc-q-header {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px; border-bottom: 1px solid var(--hairline);
  background: #fafafa; flex-shrink: 0;
}
.lc-q-title { font-size: 18px; font-weight: 700; margin: 0; }
.q-student { font-size: 13px; color: #888; flex: 1; }

.material-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; font-size: 13px; font-weight: 500; color: #666;
  cursor: pointer; user-select: none;
  border-bottom: 1px solid var(--hairline); background: #fafafa;
}
.material-bar:hover { background: #f0f0f0; }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform 0.2s; }
.material-arrow.open { transform: rotate(180deg); }
.material-body { overflow: hidden; border-bottom: 1px solid var(--hairline); }
.material-body-inner { padding: 16px 20px; }

.lc-left-tabs {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 16px; border-bottom: 1px solid var(--hairline);
  background: #fafafa; flex-shrink: 0; overflow-x: auto;
}
.sq-tab {
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 12px;
  border: 1px solid transparent; border-radius: 6px;
  background: transparent; cursor: pointer;
  font-size: 13px; color: #666; white-space: nowrap;
  transition: all 0.15s;
}
.sq-tab:hover { background: #e8e8e8; }
.sq-tab.active {
  background: #fff; border-color: #d9d9d9;
  color: #1677ff; font-weight: 500;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}

.lc-left-body { padding: 16px 20px; flex: 1; overflow-y: auto; min-height: 0; }
.panel-wrap { flex: 1; min-height: 0; }
.sq-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.sq-title { font-size: 18px; font-weight: 600; }
.q-content { font-size: 15px; line-height: 1.8; }

/* 右 */
.lc-right {
  flex: 1; display: flex; flex-direction: column;
  background: #fff; min-width: 400px;
  border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  overflow: hidden; min-height: 0;
}
.lc-editor-header {
  display: flex; align-items: center;
  padding: 0 16px; height: 36px;
  border-bottom: 1px solid var(--hairline);
  background: #fafafa; flex-shrink: 0;
}
.lc-editor-label { font-size: 13px; font-weight: 600; color: var(--ink-muted); }
.lc-editor-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.lc-editor-wrap { flex: 1; overflow: hidden; min-height: 0; }

.lc-footer {
  flex-shrink: 0; padding: 0;
  border-top: 1px solid var(--hairline);
  background: #fafafa;
}
.review-panel { padding: 12px 16px; }
.rp-total {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 12px; margin-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}
.rp-total-label { font-size: 13px; font-weight: 600; color: #999; }
.rp-total-score { font-size: 22px; font-weight: 700; color: #1677ff; }
.rp-section { margin-bottom: 12px; }
.rp-section:last-child { margin-bottom: 0; }
.rp-label { font-size: 12px; font-weight: 600; color: #999; display: block; margin-bottom: 4px; }
.rp-score { font-size: 20px; font-weight: 700; color: #1677ff; }
.rp-score-row { display: flex; align-items: center; gap: 12px; }
.rp-feedback { font-size: 13px; color: #555; margin: 4px 0 0; line-height: 1.6; }
.rp-row { display: flex; align-items: center; gap: 8px; }
.rp-actions { display: flex; gap: 8px; margin-top: 8px; }

/* 动画 */
.collapse-enter-active, .collapse-leave-active { transition: all 0.25s ease; }
.collapse-enter-from, .collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to, .collapse-leave-from { opacity: 1; max-height: 600px; }

.tag-switch-enter-active, .tag-switch-leave-active { transition: all 0.15s ease; }
.tag-switch-enter-from { opacity: 0; transform: translateX(calc(-12px * var(--slide-dir))); }
.tag-switch-leave-to { opacity: 0; transform: translateX(calc(12px * var(--slide-dir))); }

.panel-switch-enter-active, .panel-switch-leave-active { transition: all 0.15s ease; }
.panel-switch-enter-from { opacity: 0; transform: translateX(calc(8px * var(--slide-dir))); }
.panel-switch-leave-to { opacity: 0; transform: translateX(calc(-8px * var(--slide-dir))); }
</style>
