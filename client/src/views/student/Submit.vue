<template>
  <div class="sp-page" v-if="data">
    <!-- 顶栏 -->
    <div class="sp-top">
      <a-button type="link" size="small" @click="$router.back()">
        <ArrowLeftOutlined /> 返回
      </a-button>
      <h3 class="sp-title">{{ q.title }}</h3>
      <a-tag v-if="isPracticeMode" color="green" size="small">练习 · 第 {{ currentAttempt }} 次</a-tag>
      <a-tag v-if="isPracticeMode && maxAttempts" size="small">可提交 {{ remainingAttempts }} 次</a-tag>
      <a-tag color="orange">总分 {{ q.maxScore }} 分</a-tag>
      <a-tag v-if="totalScored > 0" color="green">得分 {{ totalScored }} / {{ q.maxScore }}</a-tag>
      <a-tag v-if="bestScore != null" color="blue">最高分 {{ bestScore }} / {{ q.maxScore }}</a-tag>
      <span v-if="isExpired" class="sp-expired-tag">已过期</span>
    </div>

    <!-- 主体 -->
    <div class="sp-main">
      <!-- 左侧导航 -->
      <nav class="sp-nav">
        <div class="sp-nav-title">题目导航</div>
        <div class="sp-nav-list">
          <template v-for="(sq, i) in subQuestions" :key="sq.id">
            <!-- 小节标题（可折叠） -->
            <div class="n-section-head" @click="toggleCollapse(sq.id)">
              <span class="n-section-arrow" :class="{ collapsed: collapsedSqs.has(sq.id) }">▾</span>
              <span class="n-section-label">{{ getNavLabel(sq, i) }}</span>
              <span class="n-section-count">{{ sq.type === 'objective' ? (sq.objectiveItems || []).length + '问' : '编程' }}</span>
            </div>

            <!-- 主观题：一个方块 -->
            <div v-if="sq.type === 'code' || !sq.type" class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div
                  :class="sqBoxClass(sq.id, undefined, getSqResult(sq))"
                  @click="activateAnchor('sq-' + sq.id); scrollTo('sq-' + sq.id)"
                >1</div>
              </div>
            </div>

            <!-- 客观题：每个小问一个方块，横向排列 -->
            <div v-else class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div
                  v-for="item in sq.objectiveItems" :key="item.key"
                  :class="sqBoxClass(sq.id, item.key, getItemResult(sq.id, item.key))"
                  :title="itemTypeLabel(item.type)"
                  @click="activateAnchor('sq-' + sq.id + '-item-' + item.key); scrollTo('sq-' + sq.id + '-item-' + item.key)"
                >{{ item.key + 1 }}</div>
              </div>
            </div>
          </template>
        </div>
        <div class="sp-nav-footer">
          <span v-if="dirtyCount" class="dirty-hint">{{ dirtyCount }} 题未保存</span>
          <span v-else style="color:#52c41a;">草稿已同步</span>
        </div>
      </nav>

      <!-- 右侧：流式答题区 -->
      <div class="sp-content" ref="contentRef">
        <!-- 材料 -->
        <div v-if="materialText" class="sp-material-bar" @click="showMaterial = !showMaterial">
          <span>题目材料</span>
          <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
        </div>
        <Transition name="collapse">
          <div v-if="showMaterial && materialText" class="sp-material-body">
            <div class="sp-material-inner q-content" v-html="safeMaterial" />
          </div>
        </Transition>

        <!-- 题目流 -->
        <div
          v-for="(sq, i) in subQuestions" :key="sq.id"
          :data-section="'sq-' + sq.id"
          :id="'sq-' + sq.id"
          class="sq-section"
        >
          <!-- 小题头部 -->
          <div class="sq-header">
            <span class="sq-num">第 {{ i + 1 }} 小题</span>
            <a-tag v-if="sq.type === 'objective'" color="purple" size="small">
              {{ getNavLabel(sq, i).replace('第' + (i + 1) + '小题 ', '') || '客观题' }}
            </a-tag>
            <a-tag v-else color="blue" size="small">编程题</a-tag>
            <span class="sq-score">{{ sq.score }} 分</span>
            <span class="sq-status-spacer"></span>
            <a-tag v-if="subStatuses[sq.id] === 'published' || (isPracticeMode && (subStatuses[sq.id] === 'ai_graded' || subStatuses[sq.id] === 'reviewed'))" color="green" size="small">
              得分 {{ subScores[sq.id] }} / {{ sq.score }}
            </a-tag>
            <a-tag v-else-if="subStatuses[sq.id] === 'submitted'" color="blue" size="small">
              <span class="spinner-dot"></span> 评分中...
            </a-tag>
            <a-tag v-else-if="subStatuses[sq.id] === 'ai_graded' || subStatuses[sq.id] === 'reviewed'" color="blue" size="small">
              <span class="spinner-dot"></span> 已提交
            </a-tag>
          </div>

          <!-- 题干 -->
          <div class="sq-stem q-content" v-html="safeSqContent(sq)" />

          <!-- 主观题：CodeEditor -->
          <template v-if="sq.type === 'code' || !sq.type">
            <div class="sq-editor-toolbar">
              <a-select
                :value="editorLangs[sq.id] || sq.language || 'cpp'"
                @change="(v) => editorLangs[sq.id] = v"
                size="small" style="width:110px"
                :disabled="isSqReadonly(sq.id)"
              >
                <a-select-option v-for="l in langs" :key="l" :value="l">{{ l }}</a-select-option>
              </a-select>
              <a-button size="small" type="text" :disabled="isSqReadonly(sq.id)" @click="formatEditor(sq.id)">
                ⚡ 格式化
              </a-button>
            </div>
            <div v-if="editorMounted[sq.id]" class="sq-editor-wrap" @click="activateAnchor('sq-' + sq.id)">
              <CodeEditor
                :ref="(el) => { if (el) editorRefs[sq.id] = el; }"
                v-model="answers[sq.id]"
                :language="editorLangs[sq.id] || sq.language || 'cpp'"
                :readOnly="isSqReadonly(sq.id)"
                :height="560"
              />
            </div>
            <div
              v-else
              :ref="(el) => setupEditorObserve(el, sq.id)"
              class="sq-editor-placeholder"
              @click="activateAnchor('sq-' + sq.id)"
            >
              <div class="placeholder-inner">
                <span>滚动至此加载编辑器</span>
              </div>
            </div>
          </template>

          <!-- 主观题参考答案（已出分后显示） -->
          <div v-if="sqHasScore(sq.id) && sq.referenceAnswer" class="sq-reference">
            <div class="fb-label">参考答案</div>
            <pre class="reference-code">{{ sq.referenceAnswer }}</pre>
          </div>

          <!-- 客观题：小问列表 -->
          <template v-else-if="sq.type === 'objective'">
            <div
              v-for="item in (sq.objectiveItems || [])" :key="item.key"
              :data-section="'sq-' + sq.id + '-item-' + item.key"
              :id="'sq-' + sq.id + '-item-' + item.key"
              class="oi-card"
              :class="oiCardClass(sq.id, item)"
              @click="activateAnchor('sq-' + sq.id + '-item-' + item.key)"
            >
              <div class="oi-head">
                <span class="oi-num">{{ item.key + 1 }}.</span>
                <a-tag :color="itemTypeColor(item.type)" size="small">{{ itemTypeLabel(item.type) }}</a-tag>
                <span v-if="item.score" class="oi-score">+{{ item.score }} 分</span>
                <span v-if="isSqReadonly(sq.id) && itemAnswers[getItemKey(sq.id, item.key)]?.correct !== undefined" class="oi-judge" :class="{ correct: itemAnswers[getItemKey(sq.id, item.key)].correct, wrong: !itemAnswers[getItemKey(sq.id, item.key)].correct }">
                  {{ itemAnswers[getItemKey(sq.id, item.key)].correct ? '✓ 正确' : '✗ 错误' }}
                </span>
              </div>
              <div class="oi-stem" :class="{ 'oi-stem-code': isCodeStem(item.stem) }">{{ item.stem }}</div>

              <!-- 单选 -->
              <div v-if="item.type === 'choice'" class="oi-answer">
                <a-radio-group
                  v-model:value="itemAnswers[getItemKey(sq.id, item.key)].answer"
                  :disabled="isSqReadonly(sq.id)"
                  style="display:flex;flex-direction:column;gap:6px;"
                >
                  <a-radio v-for="opt in item.options" :key="opt.key" :value="opt.key">
                    {{ opt.key }}. {{ opt.text || '(待填写)' }}
                  </a-radio>
                </a-radio-group>
              </div>

              <!-- 多选 -->
              <div v-else-if="item.type === 'multi_choice'" class="oi-answer">
                <a-checkbox-group
                  v-model:value="multiAnswerBind[getItemKey(sq.id, item.key)]"
                  :disabled="isSqReadonly(sq.id)"
                  style="display:flex;flex-direction:column;gap:6px;"
                  @change="onMultiBindChange(sq.id, item.key)"
                >
                  <a-checkbox v-for="opt in item.options" :key="opt.key" :value="opt.key">
                    {{ opt.key }}. {{ opt.text || '(待填写)' }}
                  </a-checkbox>
                </a-checkbox-group>
              </div>

              <!-- 判断 -->
              <div v-else-if="item.type === 'judge'" class="oi-answer">
                <a-radio-group
                  v-model:value="itemAnswers[getItemKey(sq.id, item.key)].answer"
                  :disabled="isSqReadonly(sq.id)"
                  style="display:flex;gap:24px;"
                >
                  <a-radio value="true">✓ 正确</a-radio>
                  <a-radio value="false">✗ 错误</a-radio>
                </a-radio-group>
              </div>

              <!-- 填空 -->
              <div v-else-if="item.type === 'fill'" class="oi-answer">
                <a-input
                  v-model:value="itemAnswers[getItemKey(sq.id, item.key)].answer"
                  :disabled="isSqReadonly(sq.id)"
                  placeholder="请输入答案"
                  :style="{ fontFamily: 'monospace' }"
                />
              </div>

              <!-- 已出分：显示正确答案 -->
              <div v-if="sqHasScore(sq.id) && item.answer != null" class="oi-reference">
                正确答案：{{ formatItemAnswer(item) }}
              </div>
            </div>
          </template>

          <!-- 评语（已出分时显示） -->
          <div v-if="subFeedbacks[sq.id]" class="sq-feedback">
            <div class="fb-label">评语</div>
            <div class="fb-body">{{ subFeedbacks[sq.id] || '暂无反馈' }}</div>
          </div>
        </div>

        <!-- 底部：练习模式全部出分 → 重新答题 -->
        <div class="sp-submit-bar" v-if="practiceAllGraded" style="justify-content:center">
          <a-button type="primary" size="large" @click="retryPractice">重新答题</a-button>
        </div>

        <!-- 底部提交栏 -->
        <div class="sp-submit-bar" v-else-if="!allSubmitted && !isExpired">
          <div class="sp-submit-info">
            <template v-if="unsubmittedCount === 0">
              <span style="color:#52c41a;">✓ 全部已提交</span>
            </template>
            <template v-else>
              <span>共 {{ subQuestions.length }} 题，{{ unsubmittedCount }} 题未提交</span>
            </template>
          </div>
          <a-button
            type="primary" size="large"
            :loading="submittingAll"
            :disabled="submitDisabled"
            @click="submitAll"
          >
            {{ submitDisabled && !allowResubmit ? '已提交' : '提交全部' }}
          </a-button>
        </div>
        <div class="sp-submit-bar" v-else-if="allowResubmit && !isExpired">
          <a-button type="primary" size="large" @click="submitAll" :loading="submittingAll">
            全部重新提交
          </a-button>
        </div>
        <div class="sp-submit-bar" v-else-if="isExpired">
          <span style="color:#999;font-size:14px;">考试已结束</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { ArrowLeftOutlined } from '@ant-design/icons-vue';
import DOMPurify from 'dompurify';
import request from '../../api/request.js';
import CodeEditor from '../../components/CodeEditor.vue';

const route = useRoute();

// ===================== 数据 =====================
const data = ref(null);
const q = ref({});
const subQuestions = ref([]);
const allowResubmit = ref(false);
const endTime = ref(null);
const showMaterial = ref(true);
const isPracticeMode = ref(false);
const maxAttempts = ref(null);
const currentAttempt = ref(1);
const submittedAttempts = ref(0);
const bestScore = ref(null);

const answers = reactive({});         // sqId → code string
const itemAnswers = reactive({});     // "sqId_itemKey" → { answer, correct }
const multiAnswerBind = reactive({}); // "sqId_itemKey" → string[] (多选复选框)
const subStatuses = reactive({});     // sqId → status
const subScores = reactive({});       // sqId → score
const subFeedbacks = reactive({});    // sqId → string (来自教师或系统反馈)
const editorLangs = reactive({});     // sqId → language string

const submittingAll = ref(false);
let draftTimer = null;
let deadlineTimer = null;

const langs = ['c', 'cpp', 'csharp', 'java', 'python', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql', 'shell', 'r', 'scala', 'perl'];

// ===================== 导航 =====================
const contentRef = ref(null);
const activeAnchor = ref('');
const collapsedSqs = reactive(new Set()); // 折叠状态
const dirtyCount = ref(0);
let dirtySet = new Set();

function getNavLabel(sq, i) {
  const n = `第${i + 1}小题`;
  const settings = q.value.objectiveSettings || {};
  if (sq.type === 'code' || !sq.type) return n;
  if (settings.classificationMode === 'flat') {
    const items = sq.objectiveItems || [];
    const firstType = items[0]?.type;
    return firstType ? `${n} ${itemTypeLabel(firstType)}` : n;
  }
  return n; // group 模式只显示小题号
}

function itemTypeLabel(type) {
  const map = { choice: '单选', multi_choice: '多选', judge: '判断', fill: '填空' };
  return map[type] || type;
}

function sqHasScore(sqId) {
  const s = subStatuses[sqId];
  return s === 'published' || (isPracticeMode.value && (s === 'ai_graded' || s === 'reviewed'));
}

function formatItemAnswer(item) {
  if (!item) return '';
  if (item.type === 'choice' || item.type === 'judge') {
    if (item.type === 'judge') return item.answer === 'true' ? '正确' : '错误';
    const opt = (item.options || []).find(o => o.key === item.answer);
    return opt ? `${item.answer}. ${opt.text}` : item.answer;
  } else if (item.type === 'multi_choice') {
    const keys = (Array.isArray(item.answer) ? item.answer : String(item.answer || '').split(',')).map(s => s.trim());
    return keys.map(k => {
      const opt = (item.options || []).find(o => o.key === k);
      return opt ? `${k}. ${opt.text}` : k;
    }).join('；');
  }
  return item.answer || '';
}

async function retryPractice() {
  Modal.confirm({
    title: '重新答题',
    content: '将清空当前所有答案，之前的高分记录会被保留。确定重新开始吗？',
    okText: '确定',
    cancelText: '取消',
    onOk: async () => {
      try {
        await request.post(`/student/assignments/${route.params.id}/retry`);
        // 清空本地状态
        for (const key in answers) answers[key] = '';
        for (const key in itemAnswers) {
          itemAnswers[key].answer = '';
          itemAnswers[key].correct = undefined;
        }
        for (const key in multiAnswerBind) multiAnswerBind[key] = [];
        for (const key in subStatuses) subStatuses[key] = null;
        for (const key in subScores) subScores[key] = null;
        for (const key in subFeedbacks) subFeedbacks[key] = '';
        bestScore.value = null;
        stopPolling();
        dirtySet.clear();
        dirtyCount.value = 0;
        // 卸载旧的编辑器状态以便重新挂载
        for (const key in editorRefs) delete editorRefs[key];
        for (const key in editorMounted) editorMounted[key] = false;
        // 重新加载
        await nextTick();
        await fetch();
      } catch { message.error('操作失败'); }
    },
  });
}

function itemTypeColor(type) {
  const map = { choice: 'blue', multi_choice: 'purple', judge: 'orange', fill: 'green' };
  return map[type] || 'default';
}

function getItemKey(sqId, itemKey) { return `${sqId}_${itemKey}`; }

function isSqAnswered(sq) {
  if (sq.type === 'objective') {
    return (sq.objectiveItems || []).some(item =>
      (itemAnswers[getItemKey(sq.id, item.key)]?.answer || '').trim()
    );
  }
  return (answers[sq.id] || '').trim().length > 0;
}

// 主观题方块状态：出分后按得分率着色，否则只看是否作答
function getSqResult(sq) {
  const key = sq.id;
  const status = subStatuses[key];
  // 考试已发布 或 练习已评分 → 按得分率着色
  if (status === 'published' || (isPracticeMode.value && (status === 'ai_graded' || status === 'reviewed'))) {
    const ratio = (subScores[key] || 0) / (sq.score || 1);
    if (ratio >= 0.8) return 'correct';
    if (ratio >= 0.4) return 'partial';
    return 'wrong';
  }
  return isSqAnswered(sq) ? 'done' : 'empty';
}

// 客观题小问状态：出分后看对错，未出分看是否作答
function getItemResult(sqId, itemKey) {
  const k = getItemKey(sqId, itemKey);
  const entry = itemAnswers[k];
  if (!entry || !(entry.answer || '').trim()) return 'empty';
  if (entry.correct === true) return 'correct';
  if (entry.correct === false) return 'wrong';
  return 'done';
}

// 客观题卡片 class（出分后显示对错框色）
function oiCardClass(sqId, item) {
  const subStatus = subStatuses[sqId];
  const isScored = subStatus === 'published' || (isPracticeMode.value && (subStatus === 'ai_graded' || subStatus === 'reviewed'));
  if (!isScored) return { 'oi-readonly': isSqReadonly(sqId) };
  const entry = itemAnswers[getItemKey(sqId, item.key)];
  if (!entry || !(entry.answer || '').trim()) return {};
  return {
    'oi-correct': entry.correct === true,
    'oi-wrong': entry.correct === false,
  };
}

// 方块 class
function sqBoxClass(sqId, itemKey, result) {
  const anchor = itemKey != null ? `sq-${sqId}-item-${itemKey}` : `sq-${sqId}`;
  return {
    'n-box': true,
    'n-box-correct': result === 'correct',
    'n-box-wrong': result === 'wrong',
    'n-box-partial': result === 'partial',
    'n-box-done': result === 'done',
    'n-box-empty': result === 'empty',
    'n-box-active': activeAnchor.value === anchor,
  };
}

function toggleCollapse(sqId) {
  if (collapsedSqs.has(sqId)) collapsedSqs.delete(sqId);
  else collapsedSqs.add(sqId);
}

function scrollTo(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function activateAnchor(anchor) {
  activeAnchor.value = anchor;
}

// ===================== 编辑器懒挂载 =====================
const editorMounted = reactive({});
const editorRefs = reactive({});
let editorObserver = null;

function setupEditorObserve(el, sqId) {
  if (!el || !editorObserver) return;
  editorObserver.observe(el);
  el._sqId = sqId;
}

function mountEditor(sqId) {
  if (!editorMounted[sqId]) {
    editorMounted[sqId] = true;
    nextTick(() => {
      if (!answers[sqId]) answers[sqId] = '';
    });
  }
}

function formatEditor(sqId) {
  editorRefs[sqId]?.format?.();
}

// ===================== 辅助 =====================
const materialText = computed(() => {
  const m = q.value.material || '';
  return m.replace(/<[^>]*>/g, '').trim();
});
const safeMaterial = computed(() => DOMPurify.sanitize(q.value.material || ''));
function safeSqContent(sq) { return DOMPurify.sanitize((sq || {}).content || ''); }

const isExpired = computed(() => endTime.value ? Date.now() > new Date(endTime.value).getTime() : false);

const remainingAttempts = computed(() => {
  if (!maxAttempts.value) return '不限';
  const rem = maxAttempts.value - submittedAttempts.value;
  return Math.max(0, rem);
});

function isSqReadonly(sqId) {
  if (isExpired.value) return true;
  const s = subStatuses[sqId];
  // 练习模式已评分 → 锁定只读，显示答案
  if (isPracticeMode.value && (s === 'ai_graded' || s === 'reviewed' || s === 'published')) return true;
  if (!allowResubmit.value) {
    return s === 'submitted' || s === 'ai_graded' || s === 'reviewed' || s === 'published';
  }
  return false;
}

const totalScored = computed(() => {
  let sum = 0;
  for (const key in subScores) sum += subScores[key] || 0;
  return sum;
});

const unsubmittedCount = computed(() => {
  let count = 0;
  for (const sq of subQuestions.value) {
    const s = subStatuses[sq.id];
    if (!s || s === 'draft') count++;
  }
  return count;
});

const allSubmitted = computed(() => unsubmittedCount.value === 0);

// 不允许补交时，一旦有题已提交就不能再交
const submitDisabled = computed(() => {
  if (allSubmitted.value) return true;
  if (!allowResubmit.value) {
    for (const sq of subQuestions.value) {
      const s = subStatuses[sq.id];
      if (s && s !== 'draft') return true;
    }
  }
  return false;
});

const practiceAllGraded = computed(() => {
  if (!isPracticeMode.value) return false;
  // 只检查已提交的小题是否全部评分完毕
  const submitted = subQuestions.value.filter(sq => {
    const s = subStatuses[sq.id];
    return s === 'submitted' || s === 'ai_graded' || s === 'reviewed' || s === 'published';
  });
  if (!submitted.length) return false;
  return submitted.every(sq => {
    const s = subStatuses[sq.id];
    return s === 'ai_graded' || s === 'reviewed' || s === 'published';
  });
});

function isCodeStem(stem) {
  if (!stem) return false;
  return stem.includes('```') || stem.includes('{') || stem.includes('function') || stem.includes('class ') || stem.includes('def ');
}

// ===================== 多选双向绑定 =====================
function onMultiBindChange(sqId, itemKey) {
  const k = getItemKey(sqId, itemKey);
  itemAnswers[k].answer = (multiAnswerBind[k] || []).join(',');
  markDirty();
}

// ===================== 客观题答案初始化 =====================
function initObjectiveAnswers(sqId, items, existingSubmissions) {
  for (const item of (items || [])) {
    const k = getItemKey(sqId, item.key);
    if (!itemAnswers[k]) {
      itemAnswers[k] = { answer: item.type === 'judge' ? '' : '', correct: undefined };
      if (item.type === 'multi_choice') multiAnswerBind[k] = [];
    }
  }
  (existingSubmissions || []).forEach(s => {
    try {
      const ans = JSON.parse(s.answer || '[]');
      for (const a of (ans || [])) {
        const k = getItemKey(sqId, a.key);
        if (a.key !== undefined && itemAnswers[k]) {
          itemAnswers[k].answer = a.answer || '';
          if (multiAnswerBind[k] !== undefined) {
            multiAnswerBind[k] = String(a.answer || '').split(',').map(s => s.trim()).filter(Boolean);
          }
        }
      }
    } catch { /* ignore */ }
  });
}

// 比对客观题每个小问的正确性
function markObjectiveCorrect(sq, sub) {
  const items = sq.objectiveItems || [];
  let answers = [];
  try { answers = JSON.parse(sub.answer || '[]'); } catch {}
  for (const item of items) {
    const a = answers.find(x => x.key === item.key) || {};
    const sAns = (a.answer || '').trim();
    if (!sAns) continue;
    const k = getItemKey(sq.id, item.key);
    if (!itemAnswers[k]) continue;
    if (item.type === 'choice') {
      itemAnswers[k].correct = sAns === String(item.answer || '').trim();
    } else if (item.type === 'multi_choice') {
      const sSet = new Set(sAns.split(',').map(s => s.trim()).filter(Boolean));
      const aSet = new Set((Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim()));
      itemAnswers[k].correct = sSet.size === aSet.size && [...sSet].every(s => aSet.has(s));
    } else if (item.type === 'judge') {
      itemAnswers[k].correct = sAns === String(item.answer || '').trim();
    } else if (item.type === 'fill') {
      const ra = String(item.answer || '').split(',').map(s => s.trim());
      const sa = String(sAns).split(',').map(s => s.trim());
      itemAnswers[k].correct = ra.every((r, bi) => String(sa[bi] || '').toLowerCase() === r.toLowerCase());
    }
  }
}

function buildObjectiveAnswer(sq) {
  const arr = [];
  for (const item of (sq.objectiveItems || [])) {
    const k = getItemKey(sq.id, item.key);
    arr.push({ key: item.key, answer: itemAnswers[k]?.answer || '' });
  }
  return JSON.stringify(arr);
}

// 客观题是否有部分小问答了、部分没答
function hasPartialOmissions(sq) {
  const items = sq.objectiveItems || [];
  if (!items.length) return false;
  const answered = items.filter(item =>
    (itemAnswers[getItemKey(sq.id, item.key)]?.answer || '').trim()
  ).length;
  return answered > 0 && answered < items.length;
}

function hasObjectiveAnswer(sq) {
  for (const item of (sq.objectiveItems || [])) {
    if ((itemAnswers[getItemKey(sq.id, item.key)]?.answer || '').trim()) return true;
  }
  return false;
}

// ===================== 脏标记 =====================
function markDirty() {
  dirtySet.add('__any__');
  dirtyCount.value = dirtySet.size;
}

function clearDirty() {
  dirtySet.clear();
  dirtyCount.value = 0;
}

// ===================== 草稿保存 =====================
function getToken() {
  try { return localStorage.getItem('token') || ''; } catch { return ''; }
}

async function saveAllDrafts() {
  if (dirtySet.size === 0) return;
  const assignmentId = route.params.id;
  if (!assignmentId) return;
  const questionId = q.value.id;

  const tasks = [];
  for (const sq of subQuestions.value) {
    const sqId = sq.id;
    if (isSqReadonly(sqId)) continue;
    let answer;
    if (sq.type === 'objective') {
      if (!hasObjectiveAnswer(sq)) continue;
      answer = buildObjectiveAnswer(sq);
    } else {
      if (!answers[sqId]?.trim()) continue;
      answer = answers[sqId];
    }
    tasks.push(
      request.put(`/student/assignments/${assignmentId}/draft`, {
        questionId, subQuestionId: sqId, answer,
      }).catch(() => {})
    );
  }
  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
  clearDirty();
}

// 防抖保存
let saveDebounce = null;
function scheduleSave() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(saveAllDrafts, 1500);
}

// 页面可见性变化时立即保存
function onVisibilityChange() {
  if (document.hidden) {
    clearTimeout(saveDebounce);
    saveAllDrafts();
  }
}

// 关闭/崩溃时用 keepalive 保存
function onBeforeUnload() {
  clearTimeout(saveDebounce);
  const assignmentId = route.params.id;
  if (!assignmentId) return;
  const questionId = q.value.id;
  const token = getToken();

  for (const sq of subQuestions.value) {
    if (isSqReadonly(sq.id)) continue;
    let answer;
    if (sq.type === 'objective') {
      if (!hasObjectiveAnswer(sq)) continue;
      answer = buildObjectiveAnswer(sq);
    } else {
      if (!answers[sq.id]?.trim()) continue;
      answer = answers[sq.id];
    }
    fetch(`/api/student/assignments/${assignmentId}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId, subQuestionId: sq.id, answer }),
      keepalive: true,
    }).catch(() => {});
  }
}

// ===================== 提交全部 =====================
async function forceSubmitAll() {
  const submitted = [];
  const dropped = [];
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
        submitted.push(sq);
      } catch {/* ignore */}
    } else if (!hasAnswer) {
      dropped.push(sq);
    }
  }

  Modal.info({
    title: '考试时间已截止',
    content: `作答时间已到，系统已自动提交。\n已提交 ${submitted.length} 道题，${dropped.length} 道未作答的题目已视为弃答。`,
    okText: '知道了',
    onOk: () => {},
  });
}

async function submitAll() {
  const fullyDone = [];  // 全部答完的题
  const partial = [];    // 只答了部分的题
  const unanswered = []; // 完全没答的题

  for (const sq of subQuestions.value) {
    if (isSqReadonly(sq.id) && !allowResubmit.value) continue;
    const hasAnswer = sq.type === 'objective' ? hasObjectiveAnswer(sq) : (answers[sq.id]?.trim());
    if (!hasAnswer) {
      unanswered.push(sq);
    } else if (sq.type === 'objective' && hasPartialOmissions(sq)) {
      partial.push(sq);
    } else {
      fullyDone.push(sq);
    }
  }

  const toSubmit = [...fullyDone, ...partial];
  if (!toSubmit.length) {
    return message.warn('没有可提交的答案');
  }

  const total = subQuestions.value.length;
  const isUnfinished = unanswered.length > 0 || partial.length > 0;
  const title = isUnfinished ? '部分题目未作答' : '确认提交全部';
  let content;
  if (isUnfinished) {
    const parts = [];
    const names = (list) => list.map(sq => {
      const idx = subQuestions.value.indexOf(sq);
      return idx >= 0 ? `第${idx + 1}题` : '';
    }).filter(Boolean).join('、');
    if (unanswered.length) parts.push(`${unanswered.length} 题未作答（${names(unanswered)}）`);
    if (partial.length) parts.push(`${partial.length} 题作答不完整（${names(partial)}）`);
    content = `共 ${total} 题，${parts.join('；')}。\n\n仅已作答完整的内容会被提交，提交后不可修改。确定继续？`;
  } else {
    content = `将提交全部 ${toSubmit.length} 道小题的答案，提交后不可修改。确定继续？`;
  }

  Modal.confirm({
    title,
    content,
    okText: isUnfinished ? '仍要提交' : '确定提交',
    cancelText: '返回继续作答',
    okButtonProps: isUnfinished ? { danger: true } : {},
    onOk: async () => {
      submittingAll.value = true;
      const results = await Promise.allSettled(
        toSubmit.map(sq => {
          const answer = sq.type === 'objective' ? buildObjectiveAnswer(sq) : answers[sq.id];
          return request.post(`/student/assignments/${route.params.id}/submit`, {
            questionId: q.value.id, subQuestionId: sq.id, answer,
          }).then(() => { subStatuses[sq.id] = 'submitted'; return true; });
        })
      );
      submittingAll.value = false;
      const ok = results.filter(r => r.status === 'fulfilled').length;
      const fail = results.filter(r => r.status === 'rejected').length;
      if (fail === 0) {
        message.success(`全部 ${ok} 题提交成功`);
        currentAttempt.value += 1;
        submittedAttempts.value += 1;
        if (isPracticeMode.value) startPolling();
      } else message.warning(`${ok} 题成功，${fail} 题失败`);
    },
  });
}

// ===================== 数据加载 =====================
async function fetch() {
  const r = await request.get(`/student/assignments/${route.params.id}`);
  data.value = r.data;
  const ass = r.data.assignment;
  if (ass) {
    allowResubmit.value = !!ass.allowResubmit;
    endTime.value = ass.endTime;
    isPracticeMode.value = ass.mode === 'practice';
    maxAttempts.value = ass.maxAttempts || null;
  }
  const aq = ass?.assignmentQuestions?.[0];
  if (!aq) return;
  q.value = aq.question || {};
  subQuestions.value = q.value.subQuestions || [];

  (subQuestions.value || []).forEach(sq => {
    if (!answers[sq.id]) answers[sq.id] = '';
    editorLangs[sq.id] = sq.language || 'cpp';
  });

  // 恢复已有提交
  (r.data.submissions || []).forEach(s => {
    const key = s.subQuestionId || s.questionId;
    const sq = subQuestions.value.find(sq => sq.id === key);
    if (sq?.type === 'objective') {
      initObjectiveAnswers(sq.id, sq.objectiveItems || [], [s]);
    } else {
      answers[key] = s.answer || '';
    }
    subStatuses[key] = s.status;
    // 已发布 或 练习模式已评分 → 显示分数
    const isScored = s.status === 'published' || (isPracticeMode.value && (s.status === 'ai_graded' || s.status === 'reviewed'));
    if (isScored) {
      subScores[key] = s.finalScore ?? s.aiScore;
      if (sq?.type === 'code' || !sq?.type) {
        subFeedbacks[key] = s.teacherFeedback || s.aiFeedback || '';
      }
      if (sq?.type === 'objective') {
        markObjectiveCorrect(sq, s);
      }
    }
  });

  // 初始化未提交小题
  subQuestions.value.forEach(sq => {
    if (sq.type === 'objective') {
      const existing = (r.data.submissions || []).filter(s => (s.subQuestionId || s.questionId) === sq.id);
      initObjectiveAnswers(sq.id, sq.objectiveItems || [], existing);
    }
    if (!answers[sq.id]) answers[sq.id] = '';
  });

  // 截止时间强制提交
  if (endTime.value) {
    const remaining = new Date(endTime.value).getTime() - Date.now();
    if (remaining > 0) {
      clearTimeout(deadlineTimer);
      deadlineTimer = setTimeout(() => forceSubmitAll(), remaining);
    }
  }

  // 统计已提交次数和最高分
  let best = null;
  let maxAttemptCount = 0;
  (r.data.submissions || []).forEach(s => {
    if (s.bestScore != null && (best == null || s.bestScore > best)) best = s.bestScore;
    if (s.attemptCount > maxAttemptCount) maxAttemptCount = s.attemptCount;
  });
  bestScore.value = best;
  submittedAttempts.value = maxAttemptCount;
  currentAttempt.value = maxAttemptCount + 1;

  // 练习模式：如果有正在评分中的提交，开启轮询
  if (isPracticeMode.value) {
    const hasGrading = (r.data.submissions || []).some(s => s.status === 'submitted');
    if (hasGrading) startPolling();
  }
}

// ===================== 评分轮询 =====================
let pollTimer = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollStatus, 2000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollStatus() {
  try {
    const r = await request.get(`/student/assignments/${route.params.id}`);
    const subs = r.data.submissions || [];
    let anyGrading = false;
    for (const s of subs) {
      const key = s.subQuestionId || s.questionId;
      const sq = subQuestions.value.find(sq => sq.id === key);
      const prevStatus = subStatuses[key];
      subStatuses[key] = s.status;
      if (s.status === 'submitted') {
        anyGrading = true;
      } else if (s.status === 'ai_graded' || s.status === 'reviewed') {
        if (prevStatus !== s.status) {
          subScores[key] = s.finalScore ?? s.aiScore;
          if (sq?.type === 'code' || !sq?.type) {
            subFeedbacks[key] = s.teacherFeedback || s.aiFeedback || '';
          }
          if (sq?.type === 'objective') {
            markObjectiveCorrect(sq, s);
          }
          // 更新最高分
          if (s.bestScore != null && (bestScore.value == null || s.bestScore > bestScore.value)) {
            bestScore.value = s.bestScore;
          }
        }
      }
    }
    if (!anyGrading) stopPolling();
  } catch { stopPolling(); }
}

// ===================== 生命周期 =====================
onMounted(() => {
  fetch().then(() => {
    // 定时兜底保存
    draftTimer = setInterval(() => {
      if (dirtySet.size > 0) saveAllDrafts();
    }, 30000);

    // 监听答案变化 → 防抖保存
    watch(
      () => [answers, itemAnswers, multiAnswerBind],
      () => { markDirty(); scheduleSave(); },
      { deep: true }
    );

    // IntersectionObserver：编辑器懒挂载
    editorObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const sqId = entry.target._sqId;
          if (sqId != null) {
            mountEditor(sqId);
            editorObserver.unobserve(entry.target);
          }
        }
      }
    }, { rootMargin: '400px' });

  });

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onUnmounted(() => {
  stopPolling();
  clearInterval(draftTimer);
  clearTimeout(saveDebounce);
  clearTimeout(deadlineTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('beforeunload', onBeforeUnload);
  // 离开页面前最后一次保存
  saveAllDrafts();
  // 清理编辑器
  Object.values(editorRefs).forEach(ref => ref?.dispose?.());
  editorObserver?.disconnect();
});
</script>

<style scoped>
.sp-page {
  display: flex; flex-direction: column;
  height: calc(100vh - 52px);
  margin: -28px -48px -40px;
  padding: 0;
  background: var(--canvas-parchment);
}

/* 顶栏 */
.sp-top {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
}
.sp-title { font-size: 18px; font-weight: 700; margin: 0; flex: 1; }
.sp-expired-tag {
  font-size: 12px; color: #ff4d4f;
  border: 1px solid #ff4d4f; border-radius: 4px; padding: 0 8px;
}

/* 主体 */
.sp-main {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

/* 左侧导航 */
.sp-nav {
  width: 220px; flex-shrink: 0;
  background: #fafafa; border-right: 1px solid var(--hairline);
  display: flex; flex-direction: column; overflow: hidden;
}
.sp-nav-title {
  padding: 14px 14px 10px;
  font-size: 13px; font-weight: 600; color: #999;
  border-bottom: 1px solid #f0f0f0; flex-shrink: 0;
}
.sp-nav-list {
  flex: 1; overflow-y: auto; padding: 8px 12px 16px;
}
.sp-nav-footer {
  padding: 8px 14px; font-size: 12px;
  border-top: 1px solid #f0f0f0; flex-shrink: 0;
}
.dirty-hint { color: #faad14; }

/* 小节标题（可点击折叠） */
.n-section-head {
  display: flex; align-items: center; gap: 6px;
  margin: 14px 0 8px; padding: 6px 4px;
  cursor: pointer; user-select: none;
  font-size: 13px; font-weight: 600; color: #666;
  transition: color .15s;
  border-radius: 6px;
}
.n-section-head:first-child { margin-top: 0; }
.n-section-head:hover { color: #1677ff; }
.n-section-arrow {
  font-size: 14px; width: 16px; flex-shrink: 0;
  color: #999; margin-right: 2px;
  transition: transform .25s ease;
}
.n-section-arrow.collapsed { transform: rotate(-90deg); }
.n-section-head:hover .n-section-arrow { color: #1677ff; }
.n-section-label { flex: 1; }
.n-section-count {
  font-size: 10px; font-weight: 400; color: #bbb;
  background: #f0f0f0; padding: 0 5px; border-radius: 8px;
}

/* 方块网格容器（折叠动画） */
.n-grid-wrap {
  max-height: none;
  overflow: visible;
  transition: max-height .3s ease, opacity .2s ease;
  opacity: 1;
}
.n-grid-wrap.collapsed {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
}

/* 方块网格 */
.n-grid {
  display: flex; flex-wrap: wrap; gap: 5px;
  padding: 4px 2px;
}

/* 方块 */
.n-box {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 5px; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .15s, border-color .15s, color .15s;
  border: 2px solid transparent;
  user-select: none;
  flex-shrink: 0;
}

/* 已答（未出分）：暖黄 */
.n-box-done {
  background: #fff7e6; border-color: #ffd591; color: #d46b08;
}
/* 正确：绿色 */
.n-box-correct {
  background: #f6ffed; border-color: #b7eb8f; color: #389e0d;
}
/* 错误：红色 */
.n-box-wrong {
  background: #fff2f0; border-color: #ffccc7; color: #cf1322;
}
/* 部分正确：橙色 */
.n-box-partial {
  background: #fffbe6; border-color: #ffe58f; color: #d48806;
}
/* 未答：灰色 */
.n-box-empty {
  background: #fff; border-color: #e8e8e8; color: #bbb;
}

/* 当前激活 */
.n-box-active {
  border-color: #1677ff !important;
  background: #e6f4ff !important;
  color: #1677ff !important;
  box-shadow: 0 0 0 3px rgba(22,119,255,.15);
}

/* 右侧答题区 */
.sp-content {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 0 24px 24px;
}

/* 材料 */
.sp-material-bar {
  display: flex; align-items: center; gap: 8px;
  margin-top: 16px; padding: 10px 16px;
  font-size: 13px; font-weight: 500; color: #666;
  cursor: pointer; user-select: none;
  background: #fff; border-radius: 8px; border: 1px solid #f0f0f0;
}
.sp-material-bar:hover { background: #f5f5f5; }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform .2s; }
.material-arrow.open { transform: rotate(180deg); }
.sp-material-body { overflow: hidden; }
.sp-material-inner { padding: 12px 16px; background: #fafafa; border-radius: 0 0 8px 8px; }
.collapse-enter-active, .collapse-leave-active { transition: all .25s ease; }
.collapse-enter-from, .collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to, .collapse-leave-from { opacity: 1; max-height: 800px; }

/* 题目区段 */
.sq-section {
  margin-top: 24px; padding: 20px 24px;
  background: #fff; border-radius: 12px;
  border: 1px solid #f0f0f0;
  box-shadow: 0 1px 4px rgba(0,0,0,.04);
  scroll-margin-top: 16px;
}
.sq-header {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 12px; margin-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}
.sq-num { font-size: 16px; font-weight: 700; color: #333; }
.sq-score { margin-left: auto; font-size: 14px; font-weight: 600; color: #1677ff; }
.sq-status-spacer { flex: 1; }
.sq-stem { margin-bottom: 16px; }

/* 编辑器 */
.sq-editor-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; background: #fafafa;
  border: 1px solid #e8e8e8; border-bottom: none;
  border-radius: 6px 6px 0 0;
}
.sq-editor-wrap {
  border: 1px solid #e8e8e8; border-radius: 0 0 6px 6px;
  overflow: hidden;
}
.sq-editor-wrap :deep(.monaco-editor) { border: none !important; }
.sq-editor-placeholder {
  border: 1px solid #e8e8e8; border-radius: 0 0 6px 6px;
}
.placeholder-inner {
  height: 280px; display: flex; align-items: center; justify-content: center;
  background: #fafafa; color: #bbb; font-size: 14px;
}

/* 客观题小问卡片 */
.oi-card {
  margin-bottom: 16px; padding: 14px 16px;
  border: 2px solid #f0f0f0; border-radius: 8px;
  scroll-margin-top: 16px;
  transition: border-color .2s;
}
.oi-card:hover { border-color: #d9d9d9; }
.oi-card.oi-correct { border-color: #b7eb8f; background: #fcfff5; }
.oi-card.oi-wrong { border-color: #ffccc7; background: #fffbfb; }
.oi-card:last-child { margin-bottom: 0; }
.oi-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.oi-num { font-weight: 700; font-size: 14px; }
.oi-score { font-size: 12px; color: #1677ff; font-weight: 600; }
.oi-judge { margin-left: auto; font-size: 13px; font-weight: 600; }
.oi-judge.correct { color: #52c41a; }
.oi-judge.wrong { color: #ff4d4f; }
.oi-stem { font-size: 14px; line-height: 1.7; margin-bottom: 10px; white-space: pre-wrap; }
.oi-stem-code { font-family: monospace; font-size: 13px; background: #f5f5f5; padding: 8px 12px; border-radius: 6px; }
.oi-answer { margin-top: 8px; }

/* 评语 */
.sq-feedback {
  margin-top: 16px; padding: 12px 16px;
  background: #f9f9f9; border-radius: 8px;
  border-left: 3px solid #1677ff;
}
.fb-label { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.fb-body { font-size: 13px; color: #555; line-height: 1.7; }

/* 参考答案 */
.sq-reference {
  margin-top: 16px; padding: 12px 16px;
  background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 8px;
  max-height: 360px; overflow: auto;
}
.reference-code {
  margin: 8px 0 0; font-size: 13px; line-height: 1.7;
  white-space: pre-wrap; word-break: break-all;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  color: #333;
}
.oi-reference {
  margin-top: 8px; padding: 6px 10px;
  background: #fff7e6; border: 1px solid #ffd591; border-radius: 6px;
  font-size: 13px; color: #ad6800;
}

/* 底部提交栏 */
.sp-submit-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 24px; margin-bottom: 40px;
  padding: 16px 24px;
  background: #fff; border-radius: 12px;
  border: 1px solid #f0f0f0;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
  position: sticky; bottom: 0; z-index: 10;
}
.sp-submit-info { font-size: 14px; color: #888; }

/* 通用 */
.q-content { font-size: 15px; line-height: 1.8; }

.spinner-dot {
  display: inline-block; width: 8px; height: 8px;
  border: 2px solid #91caff; border-top-color: #1677ff;
  border-radius: 50%; animation: spin .8s linear infinite;
  vertical-align: middle; margin-right: 2px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
