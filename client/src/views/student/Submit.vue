<template>
  <div class="lc-page" v-if="data">
    <div class="lc-page-inner">
      <div class="lc-main" v-if="currentSq" :style="{ '--slide-dir': slideDir }">
        <!-- 左：大题 + 小题 -->
        <div class="lc-left">
          <div class="lc-q-header">
            <a-button type="link" @click="$router.back()" class="back-btn"><ArrowLeftOutlined /> 返回</a-button>
            <h3 class="lc-q-title">{{ q.title }}</h3>
            <a-tag v-if="totalScore > 0" color="green" size="small">得分 {{ totalScore }} / {{ q.maxScore }}</a-tag>
            <a-tag color="orange">总分 {{ q.maxScore }} 分</a-tag>
          </div>
          <div v-if="q.material && materialText" class="material-bar" @click="showMaterial = !showMaterial">
            <span>题目材料</span>
            <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
          </div>
          <Transition name="collapse">
            <div v-if="showMaterial && materialText" class="material-body">
              <div class="material-body-inner q-content" v-html="safeMaterial" />
            </div>
          </Transition>

          <div class="lc-left-tabs">
            <TransitionGroup name="sq-list">
              <span v-for="(sq, i) in subQuestions" :key="sq.id || i"
                :class="['sq-tab', { active: activeSq === i }]"
                @click="switchSq(i)">
                第{{ i + 1 }}小题
              </span>
            </TransitionGroup>
          </div>

          <div class="lc-left-body">
            <Transition name="panel-switch" mode="out-in">
              <div :key="activeSq" class="panel-wrap">
                <div class="sq-title-row">
                  <span class="sq-title">{{ currentSq.title || '第' + (activeSq + 1) + '小题' }}</span>
                  <a-tag v-if="sqStatus" :color="sqStatusColor" size="small">{{ sqStatusText }}</a-tag>
                  <a-tag v-if="currentSq.score" color="purple" size="small" style="margin-left:4px;">{{ currentSq.score }} 分</a-tag>
                </div>
                <div class="q-content" v-html="safeContent" />
                <div v-if="currentFeedback" class="lc-feedback">
                  <div class="fb-label">评语</div>
                  <div class="fb-body">{{ currentFeedback.teacherFeedback || currentFeedback.aiFeedback }}</div>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- 右：根据题型动态切换 -->
        <div class="lc-right">
          <div class="lc-editor-header">
            <span class="lc-editor-label">{{ sqTypeLabel }}</span>
            <a-tag color="blue" style="margin-left:6px;">第 {{ activeSq + 1 }} 小题</a-tag>
            <div class="lc-editor-actions" v-if="currentSq.type === 'code' || !currentSq.type">
              <a-select :value="editorLang" @change="setLang" size="small" style="width:120px;" :disabled="sqReadonly">
                <a-select-option v-for="l in langs" :key="l" :value="l">{{ l }}</a-select-option>
              </a-select>
              <a-button size="small" type="text" @click="formatCode" :disabled="sqReadonly" title="格式化代码">
                <template #icon><span style="font-size:14px;">&#x26A1;</span></template>
              </a-button>
            </div>
          </div>
          <div class="lc-editor-wrap">
            <div :key="activeSq" class="panel-wrap" style="height:100%; display:flex; flex-direction:column;">

              <!-- 编程题 -->
              <template v-if="currentSq.type==='code'||!currentSq.type">
                <CodeEditor ref="codeEditorRef" v-model="answers[subQId]" :language="editorLang" :readOnly="sqReadonly" :height="0" style="flex:1;" />
              </template>

              <!-- 模式A：扁平单选 -->
              <div v-else-if="currentSq.type==='choice'" style="flex:1;padding:16px;overflow-y:auto;">
                <a-radio-group v-model:value="answers[subQId]" :disabled="sqReadonly" style="display:flex;flex-direction:column;gap:10px;">
                  <a-radio v-for="opt in (currentSq.flatOptions||currentSq.options||[])" :key="opt.key" :value="opt.key">{{opt.key}}. {{opt.text}}</a-radio>
                </a-radio-group>
              </div>

              <!-- 模式A：扁平多选 -->
              <div v-else-if="currentSq.type==='multi_choice'" style="flex:1;padding:16px;overflow-y:auto;">
                <a-checkbox-group v-model:value="multiFlatAnswer" :disabled="sqReadonly" style="display:flex;flex-direction:column;gap:10px;" @change="onMultiFlatChange">
                  <a-checkbox v-for="opt in (currentSq.flatOptions||currentSq.options||[])" :key="opt.key" :value="opt.key">{{opt.key}}. {{opt.text}}</a-checkbox>
                </a-checkbox-group>
              </div>

              <!-- 模式A：扁平判断 -->
              <div v-else-if="currentSq.type==='judge'" style="flex:1;padding:20px;">
                <a-radio-group v-model:value="answers[subQId]" :disabled="sqReadonly" style="display:flex;gap:24px;">
                  <a-radio value="true" style="font-size:16px;">✓ 正确</a-radio>
                  <a-radio value="false" style="font-size:16px;">✗ 错误</a-radio>
                </a-radio-group>
              </div>

              <!-- 模式A：扁平填空 -->
              <div v-else-if="currentSq.type==='fill'" style="flex:1;padding:16px;">
                <a-textarea v-model:value="answers[subQId]" :disabled="sqReadonly" placeholder="请输入答案" :rows="3" />
              </div>

              <!-- 客观题：小问列表 -->
              <div v-else-if="currentSq.type === 'objective'" style="flex:1;padding:16px;overflow-y:auto;">
                <div v-for="item in (currentSq.objectiveItems || [])" :key="item.key" style="margin-bottom:20px;padding:12px;border:1px solid #f0f0f0;border-radius:8px;">
                  <div style="font-weight:600;font-size:14px;margin-bottom:8px;">
                    {{ item.key + 1 }}. <a-tag size="small">{{ itemTypeLabel(item.type) }}</a-tag>
                    <span v-if="sqReadonly && itemAnswers[getItemKey(item.key)]?.correct !== undefined" style="margin-left:8px;font-size:12px;">
                      <span v-if="itemAnswers[getItemKey(item.key)].correct" style="color:#52c41a;">✓ 正确</span>
                      <span v-else style="color:#ff4d4f;">✗ 错误</span>
                    </span>
                  </div>
                  <div class="preview-stem" :class="{ 'preview-stem-code': isCodeStem(item.stem) }" style="margin-bottom:8px;">{{ item.stem }}</div>

                  <!-- 选项（单选/多选） -->
                  <div v-if="item.type === 'choice' || item.type === 'multi_choice'">
                    <a-radio-group v-if="item.type === 'choice'" v-model:value="itemAnswers[getItemKey(item.key)].answer" :disabled="sqReadonly" style="display:flex;flex-direction:column;gap:6px;">
                      <a-radio v-for="opt in item.options" :key="opt.key" :value="opt.key">{{ opt.key }}. {{ opt.text }}</a-radio>
                    </a-radio-group>
                    <a-checkbox-group v-else v-model:value="multiAnswerBind[item.key]" :disabled="sqReadonly" style="display:flex;flex-direction:column;gap:6px;" @change="onMultiChange(item.key, $event)">
                      <a-checkbox v-for="opt in item.options" :key="opt.key" :value="opt.key">{{ opt.key }}. {{ opt.text }}</a-checkbox>
                    </a-checkbox-group>
                  </div>

                  <!-- 判断题 -->
                  <a-radio-group v-else-if="item.type === 'judge'" v-model:value="itemAnswers[getItemKey(item.key)].answer" :disabled="sqReadonly" style="display:flex;gap:24px;">
                    <a-radio value="true">✓ 正确</a-radio>
                    <a-radio value="false">✗ 错误</a-radio>
                  </a-radio-group>

                  <!-- 填空题 -->
                  <a-input v-else-if="item.type === 'fill'" v-model:value="itemAnswers[getItemKey(item.key)].answer" :disabled="sqReadonly" :placeholder="'请输入答案'" :style="{ fontFamily: 'monospace' }" />

                  <div v-if="sqReadonly && item.score" style="font-size:11px;color:var(--ink-muted);margin-top:4px;">分值: {{ item.score }} 分</div>
                </div>
              </div>

              <div class="lc-footer">
                <a-button type="primary" size="large" :loading="submitting[subQId]"
                  :disabled="sqReadonly" @click="submitCurrent">
                  {{ isExpired ? '已过期' : sqStatus && allowResubmit ? '重新提交' : sqReadonly ? '已提交' : submitBtnText }}
                </a-button>
                <span v-if="sqReadonly && sqScore != null" class="lc-score">
                  得分：<strong>{{ sqScore }} / {{ currentSq.score || 0 }}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { CodeOutlined, ArrowLeftOutlined } from '@ant-design/icons-vue';
import DOMPurify from 'dompurify';
import request from '../../api/request.js';
import CodeEditor from '../../components/CodeEditor.vue';

const route = useRoute();
const data = ref(null);
const q = ref({});
const subQuestions = ref([]);
const activeSq = ref(0);
const editorLang = ref('cpp');
const codeEditorRef = ref(null);
const slideDir = ref(1);
const showMaterial = ref(true);
const answers = reactive({});
const submitting = reactive({});
const subStatuses = reactive({});
const subScores = reactive({});
const subFeedbacks = reactive({});
const allowResubmit = ref(false);
const endTime = ref(null);
let draftTimer = null;
let deadlineTimer = null;

const langs = ['c', 'cpp', 'csharp', 'java', 'python', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'shell', 'r', 'scala', 'perl'];

const currentSq = computed(() => subQuestions.value[activeSq.value] || {});
const subQId = computed(() => currentSq.value.id);

const materialText = computed(() => {
  const m = q.value.material || '';
  return m.replace(/<[^>]*>/g, '').trim();
});
const safeMaterial = computed(() => DOMPurify.sanitize(q.value.material || ''));
const safeContent = computed(() => DOMPurify.sanitize((currentSq.value || {}).content || ''));

const sqTypeLabel = computed(() => {
  const t = currentSq.value.type;
  if (t === 'objective') return '客观题';
  return '代码';
});
const submitBtnText = computed(() => {
  const t = currentSq.value.type;
  if (t === 'objective') return '提交答案';
  return '提交代码';
});

// 客观题：每个小问独立作答状态
const itemAnswers = reactive({});  // key -> { answer: '', correct: true/false }
const multiAnswerBind = reactive({}); // key -> string[] for checkboxes
function getItemKey(itemKey) { return `${subQId.value}_${itemKey}`; }
function isCodeStem(stem) {
  if (!stem) return false;
  return stem.includes('```') || stem.includes('{') || stem.includes('function') || stem.includes('class ') || stem.includes('def ');
}
const multiFlatAnswer = ref([]);
function onMultiFlatChange(values) {
  answers[subQId.value] = (values || []).join(',');
}
watch(multiFlatAnswer, (v) => { answers[subQId.value] = (v || []).join(','); });

function onMultiChange(itemKey, values) {
  itemAnswers[getItemKey(itemKey)].answer = (values || []).join(',');
}
function itemTypeLabel(type) {
  const map = { choice: '单选', multi_choice: '多选', judge: '判断', fill: '填空' };
  return map[type] || type;
}

// 初始化/恢复客观题答案
function initObjectiveAnswers(items, existingSubmissions) {
  for (const item of (items || [])) {
    const k = getItemKey(item.key);
    if (!itemAnswers[k]) {
      itemAnswers[k] = { answer: item.type === 'judge' ? '' : '', correct: undefined };
      if (item.type === 'multi_choice') multiAnswerBind[item.key] = [];
    }
  }
  // 恢复已有提交
  (existingSubmissions || []).forEach(s => {
    try {
      const ans = JSON.parse(s.answer || '[]');
      for (const a of (ans || [])) {
        const k = getItemKey(a.key);
        if (a.key !== undefined && itemAnswers[k]) {
          itemAnswers[k].answer = a.answer || '';
          if (multiAnswerBind[a.key] !== undefined) {
            multiAnswerBind[a.key] = String(a.answer || '').split(',').map(s => s.trim()).filter(Boolean);
          }
        }
      }
    } catch { /* ignore */ }
  });
}

const sqStatus = computed(() => subStatuses[subQId.value]);
const isExpired = computed(() => endTime.value ? Date.now() > new Date(endTime.value).getTime() : false);
const sqReadonly = computed(() => {
  if (isExpired.value) return true;
  if (allowResubmit.value) return false;
  const s = sqStatus.value;
  return s === 'submitted' || s === 'ai_graded' || s === 'reviewed' || s === 'published';
});
const sqScore = computed(() => subScores[subQId.value] ?? null);
const totalScore = computed(() => {
  let sum = 0;
  for (const key in subScores) sum += subScores[key] || 0;
  return sum;
});
const currentFeedback = computed(() => subFeedbacks[subQId.value] || null);

const sqStatusColor = computed(() => {
  const s = sqStatus.value;
  if (s === 'published') return 'green';
  if (s === 'submitted' || s === 'ai_graded' || s === 'reviewed') return 'blue';
  return 'default';
});
const sqStatusText = computed(() => {
  const s = sqStatus.value;
  if (s === 'published') return '已出分';
  if (s === 'submitted' || s === 'ai_graded' || s === 'reviewed') return '已提交';
  return '';
});

function setLang(lang) { editorLang.value = lang; }
function formatCode() { codeEditorRef.value?.format(); }

async function saveDraft(sqKey) {
  if (!route.params.id) return;
  const key = sqKey || subQId.value;
  if (!answers[key]?.trim()) return;
  try { await request.put(`/student/assignments/${route.params.id}/draft`, { questionId: q.value.id, subQuestionId: key, answer: answers[key] }); } catch {/* ignore */}
}

async function switchSq(index) {
  if (index === activeSq.value) return;
  await saveDraft(subQId.value);
  slideDir.value = index > activeSq.value ? 1 : -1;
  activeSq.value = index;
  editorLang.value = currentSq.value.language || 'cpp';
}

async function fetch() {
  const r = await request.get(`/student/assignments/${route.params.id}`);
  data.value = r.data;
  const ass = r.data.assignment;
  if (ass) {
    allowResubmit.value = !!ass.allowResubmit;
    endTime.value = ass.endTime;
  }
  const aq = ass?.assignmentQuestions?.[0];
  if (!aq) return;
  q.value = aq.question || {};
  subQuestions.value = q.value.subQuestions || [];
  if (subQuestions.value.length) {
    editorLang.value = subQuestions.value[0].language || 'cpp';
  }

  (r.data.submissions || []).forEach(s => {
    const key = s.subQuestionId || s.questionId;
    const sq = subQuestions.value.find(sq => sq.id === key);
    if (sq?.type === 'objective') {
      initObjectiveAnswers(sq.objectiveItems || [], [s]);
    } else if (sq?.type === 'multi_choice') {
      answers[key] = s.answer || '';
      multiFlatAnswer.value = (s.answer || '').split(',').filter(Boolean);
    } else {
      answers[key] = s.answer || '';
    }
    subStatuses[key] = s.status;
    if (s.status === 'published') subScores[key] = s.finalScore ?? s.aiScore;
    if (s.status === 'published') subFeedbacks[key] = { aiFeedback: s.aiFeedback, teacherFeedback: s.teacherFeedback };
  });
  subQuestions.value.forEach(sq => {
    if (!answers[sq.id]) answers[sq.id] = '';
    if (sq.type === 'objective') initObjectiveAnswers(sq.objectiveItems || [], []);
  });

  // 设置截止时间强制提交定时器
  if (endTime.value) {
    const remaining = new Date(endTime.value).getTime() - Date.now();
    if (remaining > 0) {
      clearTimeout(deadlineTimer);
      deadlineTimer = setTimeout(() => forceSubmitAll(), remaining);
    }
  }
}

function buildObjectiveAnswer(sq) {
  const arr = [];
  for (const item of (sq.objectiveItems || [])) {
    const k = getItemKey(item.key);
    arr.push({ key: item.key, answer: itemAnswers[k]?.answer || '' });
  }
  return JSON.stringify(arr);
}

function hasObjectiveAnswer(sq) {
  for (const item of (sq.objectiveItems || [])) {
    if ((itemAnswers[getItemKey(item.key)]?.answer || '').trim()) return true;
  }
  return false;
}

async function forceSubmitAll() {
  for (const sq of subQuestions.value) {
    const key = sq.id;
    const hasAnswer = sq.type === 'objective' ? hasObjectiveAnswer(sq) : (answers[key]?.trim());
    if (hasAnswer && subStatuses[key] !== 'submitted' && subStatuses[key] !== 'published') {
      try {
        const answer = sq.type === 'objective' ? buildObjectiveAnswer(sq) : answers[key];
        await request.post(`/student/assignments/${route.params.id}/submit`, {
          questionId: q.value.id, subQuestionId: key, answer, force: true,
        });
        subStatuses[key] = 'submitted';
      } catch {/* ignore */}
    }
  }
  message.warning('时间已截止，已自动提交');
}

async function submitCurrent() {
  const sq = currentSq.value;
  const key = sq.id;
  const isObjective = sq.type === 'objective';
  const hasAnswer = isObjective ? hasObjectiveAnswer(sq) : (answers[key]?.trim());
  if (!hasAnswer) return message.warn(isObjective ? '请先作答' : '请先编写代码');

  const confirmMsg = allowResubmit.value
    ? '允许补交，确定提交当前答案？'
    : '提交后不可修改，确定提交？';
  Modal.confirm({
    title: '确认提交',
    content: confirmMsg,
    okText: '确定',
    cancelText: '取消',
    onOk: async () => {
      submitting[key] = true;
      try {
        const answer = isObjective ? buildObjectiveAnswer(sq) : answers[key];
        await request.post(`/student/assignments/${route.params.id}/submit`, {
          questionId: q.value.id, subQuestionId: sq.id, answer,
        });
        message.success('提交成功');
        subStatuses[key] = 'submitted';
      } finally { submitting[key] = false; }
    },
  });
}

onMounted(() => {
  fetch().then(() => {
    draftTimer = setInterval(() => {
      if (!sqReadonly.value && answers[subQId.value]?.trim()) {
        saveDraft(subQId.value);
      }
    }, 3000);
  });
});

onUnmounted(() => {
  clearInterval(draftTimer);
  clearTimeout(deadlineTimer);
  if (subQId.value && answers[subQId.value]?.trim()) {
    saveDraft(subQId.value);
  }
});
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
  padding: 16px 20px; border-bottom: 1px solid var(--hairline);
  background: #fafafa; flex-shrink: 0;
}
.lc-q-title { font-size: 20px; font-weight: 700; margin: 0; flex: 1; }
.back-btn { padding: 0 8px 0 0; font-size: 14px; flex-shrink: 0; }
.material-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; font-size: 13px; font-weight: 500; color: #666;
  cursor: pointer; user-select: none;
  border-bottom: 1px solid var(--hairline);
  background: #fafafa;
}
.material-bar:hover { background: #f0f0f0; }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform 0.2s; }
.material-arrow.open { transform: rotate(180deg); }
.material-body {
  overflow: hidden; border-bottom: 1px solid var(--hairline);
}
.material-body-inner { padding: 16px 20px; }
.collapse-enter-active, .collapse-leave-active { transition: all 0.25s ease; }
.collapse-enter-from, .collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to, .collapse-leave-from { opacity: 1; max-height: 600px; }

.lc-left-tabs {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 16px; position: relative;
  border-bottom: 1px solid var(--hairline);
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
.lc-feedback {
  margin-top: 24px; padding: 16px; background: #f9f9f9; border-radius: 8px;
  border-left: 3px solid var(--blue);
}
.fb-label { font-weight: 600; margin-bottom: 8px; }
.fb-body { font-size: 14px; color: var(--ink-muted); line-height: 1.7; }

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
.lc-left :deep(.monaco-editor) { border: none !important; }

.lc-footer {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px; border-top: 1px solid var(--hairline);
  background: #fafafa; flex-shrink: 0;
}
.lc-score { font-size: 16px; }
.lc-score strong { color: var(--blue); }

/* 动画 */
.tag-switch-enter-active, .tag-switch-leave-active { transition: all 0.15s ease; }
.tag-switch-enter-from { opacity: 0; transform: translateX(calc(-12px * var(--slide-dir))); }
.tag-switch-leave-to { opacity: 0; transform: translateX(calc(12px * var(--slide-dir))); }

.panel-switch-enter-active, .panel-switch-leave-active { transition: all 0.15s ease; }
.panel-switch-enter-from { opacity: 0; transform: translateX(calc(8px * var(--slide-dir))); }
.panel-switch-leave-to { opacity: 0; transform: translateX(calc(-8px * var(--slide-dir))); }

.sq-list-enter-active, .sq-list-leave-active, .sq-list-move { transition: all 0.2s ease; }
.sq-list-enter-from { opacity: 0; transform: scale(0.8); }
.sq-list-leave-to { opacity: 0; transform: scale(0.8); }
.sq-list-leave-active { position: absolute; }
</style>
