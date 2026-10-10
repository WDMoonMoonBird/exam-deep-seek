<template>
  <div class="sp-page" v-if="data">
    <!-- 顶栏 -->
    <div class="sp-top">
      <a-button type="link" size="small" @click="$router.back()">
        <ArrowLeftOutlined /> 返回
      </a-button>
      <h3 class="sp-title">{{ q.title }}</h3>
      <a-tag v-if="isPracticeMode" class="tag-success" size="small">练习 · 第 {{ currentAttempt }} 次</a-tag>
      <a-tag v-if="isPracticeMode && maxAttempts" size="small">可提交 {{ remainingAttempts }} 次</a-tag>
      <a-tag class="tag-warning">总分 {{ q.maxScore }} 分</a-tag>
      <a-tag v-if="totalScored > 0" class="tag-success">得分 {{ totalScored }} / {{ q.maxScore }}</a-tag>
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
                  role="button"
                  tabindex="0"
                  :aria-label="boxLabel(i, undefined, getSqResult(sq))"
                  :aria-current="isActiveAnchor('sq-' + sq.id) ? 'true' : null"
                  @click="activateAnchor('sq-' + sq.id); scrollTo('sq-' + sq.id)"
                  @keydown="onBoxKeydown($event, i, undefined)"
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
                  role="button"
                  tabindex="0"
                  :aria-label="boxLabel(i, item.key, getItemResult(sq.id, item.key))"
                  :aria-current="isActiveAnchor('sq-' + sq.id + '-item-' + item.key) ? 'true' : null"
                  @click="activateAnchor('sq-' + sq.id + '-item-' + item.key); scrollTo('sq-' + sq.id + '-item-' + item.key)"
                  @keydown="onBoxKeydown($event, i, item.key)"
                >{{ item.key + 1 }}</div>
              </div>
            </div>
          </template>
        </div>
        <div class="sp-nav-footer">
          <span v-if="dirtyCount" class="dirty-hint">{{ dirtyCount }} 题未保存</span>
          <span v-else-if="draftNoticeText" class="draft-note">{{ draftNoticeText }}</span>
          <span v-else class="sync-ok">草稿已同步</span>
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
            <a-tag v-if="sq.type === 'objective'" class="tag-accent" size="small">
              {{ getNavLabel(sq, i).replace('第' + (i + 1) + '小题 ', '') || '客观题' }}
            </a-tag>
            <a-tag v-else color="blue" size="small">编程题</a-tag>
            <span class="sq-score">{{ sq.score }} 分</span>
            <span class="sq-status-spacer"></span>
            <a-tag v-if="subStatuses[sq.id] === 'published' || (isPracticeMode && (subStatuses[sq.id] === 'ai_graded' || subStatuses[sq.id] === 'reviewed'))" class="tag-success" size="small">
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
              <!-- T5-A2：语言选择器没有可见 label；placeholder 不算可访问名称、aria-label 又会被 antd
                   渲染到外层 .ant-select div（落不到 role=combobox 的 input）→ 视觉隐藏 label + for/id（与 t7 同法） -->
              <label :for="'sq-lang-' + sq.id" class="visually-hidden">第 {{ i + 1 }} 题代码语言</label>
              <a-select
                :id="'sq-lang-' + sq.id"
                :value="editorLangs[sq.id] || sq.language || 'cpp'"
                @change="(v) => editorLangs[sq.id] = v"
                size="small" class="lang-select"
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
                <a-tag :color="itemTypeColor(item.type)" :class="itemTypeClass(item.type)" size="small">{{ itemTypeLabel(item.type) }}</a-tag>
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
                  class="oi-answer-col"
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
                  class="oi-answer-col"
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
                  :style="{ fontFamily: 'var(--font-mono)' }"
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
        <div class="sp-submit-bar is-center" v-if="practiceAllGraded">
          <a-button type="primary" size="large" @click="retryPractice">重新答题</a-button>
        </div>

        <!-- 底部提交栏 -->
        <div class="sp-submit-bar" v-else-if="!allSubmitted && !isExpired">
          <div class="sp-submit-info">
            <template v-if="unsubmittedCount === 0">
              <span class="sync-ok">✓ 全部已提交</span>
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
          <span class="ended-hint">考试已结束</span>
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
import { useConfirm } from '../../composables/useConfirm.js';

const route = useRoute();
const { confirm } = useConfirm();

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
  // 危险操作（清空全部作答）→ danger=true；ok 文案动词化（R-15）
  confirm({
    title: '重新答题',
    content: '将清空当前所有答案，之前的高分记录会被保留。',
    okText: '重新答题',
    cancelText: '取消',
    danger: true,
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
        await loadAssignment();
      } catch { message.error('操作失败'); }
    },
  });
}

function itemTypeColor(type) {
  // 题型徽标：antd 预置色在某一主题下不达 AA（judge orange 亮 3.34、fill green 亮 3.37、multi_choice purple 暗 3.39）
  // → 这三类走 B2-2 的语义类（见 itemTypeClass）；choice 的 blue 实测亮 5.50 / 暗 4.91 已达标，维持预置色。
  const map = { choice: 'blue' };
  return map[type] || 'default';
}

// 与 style.css 的 .tag-* 语义类配套：只对「预置色不达标」的三类返回类名（0-2-1 接管三色，不动盒模型）
function itemTypeClass(type) {
  if (type === 'judge') return 'tag-warning';
  if (type === 'fill') return 'tag-success';
  if (type === 'multi_choice') return 'tag-accent';
  return '';
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

// ===================== 题号方块：a11y 与键盘导航（05-page-specs T4） =====================
/** 与 DOM 顺序一致的方块索引表（客观题按 objectiveItems 顺序，编程题为单个方块） */
const boxIndex = computed(() => {
  const list = [];
  subQuestions.value.forEach((sq, i) => {
    if (sq.type === 'code' || !sq.type) {
      list.push({ sqId: sq.id, itemKey: undefined, anchor: 'sq-' + sq.id, sqIndex: i });
    } else {
      (sq.objectiveItems || []).forEach(item => {
        list.push({ sqId: sq.id, itemKey: item.key, anchor: 'sq-' + sq.id + '-item-' + item.key, sqIndex: i });
      });
    }
  });
  return list;
});

const BOX_RESULT_TEXT = { correct: '正确', wrong: '错误', partial: '部分正确', done: '已作答', empty: '未作答' };

/** 方块的可读名称（aria-label）：「第 N 小题 [第 M 问]，状态」 */
function boxLabel(sqIndex, itemKey, result) {
  const base = itemKey == null ? `第 ${sqIndex + 1} 小题` : `第 ${sqIndex + 1} 小题 第 ${itemKey + 1} 问`;
  return `${base}，${BOX_RESULT_TEXT[result] || '未作答'}`;
}

function isActiveAnchor(anchor) { return activeAnchor.value === anchor; }

function focusBoxAt(index) {
  const el = document.querySelectorAll('.n-box')[index];
  if (el && typeof el.focus === 'function') el.focus();
}

/** 激活第 idx 个方块：展开所在小节 → 定位 + 高亮 → 焦点跟随（点击与键盘等价） */
function activateBoxAt(idx) {
  const target = boxIndex.value[idx];
  if (!target) return;
  if (collapsedSqs.has(target.sqId)) collapsedSqs.delete(target.sqId);
  activateAnchor(target.anchor);
  scrollTo(target.anchor);
  nextTick(() => focusBoxAt(idx));
}

/** 方向键在方块间移动；Enter/Space 等价点击（无障碍：方块可 Tab 聚焦 + 方向键切换） */
function onBoxKeydown(e, sqIndex, itemKey) {
  const idx = boxIndex.value.findIndex(x => x.sqIndex === sqIndex && x.itemKey === itemKey);
  if (idx < 0) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    activateBoxAt(idx);
    return;
  }
  let target = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = Math.min(idx + 1, boxIndex.value.length - 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = Math.max(idx - 1, 0);
  else return;
  e.preventDefault();
  activateBoxAt(target);
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

/** 惰性创建 IntersectionObserver：占位块注册时若 observer 尚未创建则即时创建（V5 首帧竞态修复） */
function ensureEditorObserver() {
  if (editorObserver) return;
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
}

function setupEditorObserve(el, sqId) {
  if (!el) return;
  el._sqId = sqId;                 // 先写标记再观察（原实现在 observer 未就绪时提前 return，标记也丢了）
  ensureEditorObserver();
  editorObserver.observe(el);
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
// D3：服务端对「已提交 / 已过截止」的草稿会返回 HTTP 200 + 「跳过草稿」（不入库）。
// 前端若仍按请求成功显示「草稿已同步」，用户刷新后编辑会静默丢失 —— 故单独记账并如实呈现。
const draftNotice = ref('');   // '' | 'submitted' | 'expired'
const draftNoticeText = computed(() => {
  if (draftNotice.value === 'submitted') return '已提交，改动仅在重新提交时保存';
  if (draftNotice.value === 'expired') return '已过截止时间，改动不再保存';
  return '';
});

function getToken() {
  try { return localStorage.getItem('token') || ''; } catch { return ''; }
}

async function saveAllDrafts() {
  if (dirtySet.size === 0) return;
  const assignmentId = route.params.id;
  if (!assignmentId) return;
  const questionId = q.value.id;

  const tasks = [];
  const skipped = [];   // 服务端明确跳过（200 但未入库）的题
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
      // 逐条记录成败（请求形状不变）：失败不清脏，留待下一轮重试（V4）
      request.put(`/student/assignments/${assignmentId}/draft`, {
        questionId, subQuestionId: sqId, answer,
      }).then((r) => {
        // D3：HTTP 200 不等于已入库 —— 识别服务端的「跳过」语义
        const msg = r?.message || '';
        if (msg.includes('跳过草稿')) skipped.push(msg.includes('已提交') ? 'submitted' : 'expired');
        return true;
      }, () => false)
    );
  }
  if (tasks.length === 0) return;
  const results = await Promise.allSettled(tasks);
  // 只有全部成功才清脏：任一失败都保留脏标记，下一轮（防抖 / 30s 定时）自动重试（V4）
  const allSaved = results.every(r => r.status === 'fulfilled' && r.value === true);
  if (allSaved) clearDirty();
  else markDirty();
  // D3：状态区文案以「是否真的入库」为准，而不是以 HTTP 是否成功为准
  if (skipped.length) draftNotice.value = skipped.includes('submitted') ? 'submitted' : 'expired';
  else if (allSaved) draftNotice.value = '';
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
  } else {
    // 回到前台：按当前时刻重新校准截止计时（后台节流后不再依赖旧延迟）
    recalibrateDeadline();
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
    // 显式走 window.fetch：keepalive 通道不受同模块作用域影响（V3）
    window.fetch(`/api/student/assignments/${assignmentId}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ questionId, subQuestionId: sq.id, answer }),
      keepalive: true,
    }).catch(() => {});
  }
}

// ===================== 截止倒计时调度（P-1 修复） =====================
// setTimeout 的延迟超过 2^31-1 会被 ToInt32 截断/回绕（≈24.86 天）：
// 远期作业会出现「打开即强制提交」或「回绕成正小值而提前提交」。此处统一约定：
//   ① 延迟上限钳制到 MAX_TIMEOUT_MS；
//   ② 回调内按当前时刻重算 remaining（不依赖闭包旧值），未到期则重新武装；
//   ③ 提交前做「与 isExpired 同判据」的即时二次校验，时钟跳变/截断误差都不会误提交；
//   ④ endTime 为空/非法/解析失败（NaN）时不建计时器 —— 安全降级为不强制提交。
const MAX_TIMEOUT_MS = 2147483647; // 2^31-1：浏览器计时器延迟上限（≈24.86 天）

function clearDeadlineTimer() {
  if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null; }
}

// 截止时间戳（毫秒）；空值/非法/解析失败一律 NaN，调用方据此不建计时器
function deadlineTimestamp() {
  if (!endTime.value) return NaN;
  const ts = new Date(endTime.value).getTime();
  return Number.isFinite(ts) ? ts : NaN;
}

// 到期二次校验（即时求值）：isExpired 是依赖 endTime 的缓存 computed，在计时器回调里读到的是
// 旧快照（依赖未变化就不会重算）→ 会退化成「每秒空转、永不提交」；这里用与 isExpired 同一判据的即时版本。
function isDeadlineExpired() {
  const ts = deadlineTimestamp();
  return Number.isFinite(ts) && Date.now() > ts;
}

// 武装计时（页面加载与回到前台时的校准入口）；已到期或时间非法时不提交、不建计时器
function armDeadlineTimer() {
  clearDeadlineTimer();
  const ts = deadlineTimestamp();
  if (!Number.isFinite(ts)) return;
  const remaining = ts - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return;
  deadlineTimer = setTimeout(onDeadlineTick, Math.min(remaining, MAX_TIMEOUT_MS));
}

// 到点回调：忽略闭包里的旧值，按当前时刻重算 —— 只有确认到期才强制提交
function onDeadlineTick() {
  deadlineTimer = null;
  const ts = deadlineTimestamp();
  if (!Number.isFinite(ts)) return;              // 时间被改脏：停止调度，不强制提交
  const remaining = ts - Date.now();
  if (remaining > 0) {                           // 钳制分段/时钟回拨：重新武装到真实截止时刻
    deadlineTimer = setTimeout(onDeadlineTick, Math.min(remaining, MAX_TIMEOUT_MS));
    return;
  }
  if (!isDeadlineExpired()) {                    // 到期二次校验未通过（恰好落在边界）→ 稍后再判
    deadlineTimer = setTimeout(onDeadlineTick, 1000);
    return;
  }
  forceSubmitAll();
}

// 回到前台：按当前时刻重新校准（后台节流/休眠可能让计时器晚到或未按时触发）
function recalibrateDeadline() {
  const ts = deadlineTimestamp();
  if (!Number.isFinite(ts)) { clearDeadlineTimer(); return; }
  const remaining = ts - Date.now();
  if (remaining > 0) {
    clearDeadlineTimer();
    deadlineTimer = setTimeout(onDeadlineTick, Math.min(remaining, MAX_TIMEOUT_MS));
    return;
  }
  // 已到期且计时器仍挂起（后台被节流未触发）→ 立即收敛到统一回调
  if (deadlineTimer) { clearTimeout(deadlineTimer); deadlineTimer = null; onDeadlineTick(); }
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

  confirm({
    title,
    content,
    okText: isUnfinished ? '仍要提交' : '提交全部',
    cancelText: '返回继续作答',
    danger: isUnfinished,
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
        draftNotice.value = '';   // 答案已随提交入库，此前的「改动仅在重新提交时保存」提示随之失效
        currentAttempt.value += 1;
        submittedAttempts.value += 1;
        if (isPracticeMode.value) startPolling();
      } else message.warning(`${ok} 题成功，${fail} 题失败`);
    },
  });
}

// ===================== 数据加载 =====================
/** 数据加载器。注意：函数名不得叫 fetch —— 同模块内的函数声明会遮蔽全局 fetch，
 *  曾导致 onBeforeUnload 的 keepalive 落盘实际发出 GET 列表请求（V3）。 */
async function loadAssignment() {
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

  // 截止时间强制提交（延迟钳制 + 回调内重算 + 到期二次校验，见 armDeadlineTimer）
  armDeadlineTimer();

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
    let anyTransitioned = false;
    for (const s of subs) {
      const key = s.subQuestionId || s.questionId;
      const sq = subQuestions.value.find(sq => sq.id === key);
      const prevStatus = subStatuses[key];
      subStatuses[key] = s.status;
      if (s.status === 'submitted') {
        anyGrading = true;
      } else if (s.status === 'ai_graded' || s.status === 'reviewed') {
        if (prevStatus !== s.status) {
          anyTransitioned = true;
          subScores[key] = s.finalScore ?? s.aiScore;
          if (sq?.type === 'code' || !sq?.type) {
            subFeedbacks[key] = s.teacherFeedback || s.aiFeedback || '';
          }
          if (sq?.type === 'objective') {
            markObjectiveCorrect(sq, s);
          }
          if (s.bestScore != null && (bestScore.value == null || s.bestScore > bestScore.value)) {
            bestScore.value = s.bestScore;
          }
        }
      }
    }
    // 评分完成时刷新题目数据以获取参考答案（API 出分后才返回）
    if (!anyGrading && anyTransitioned) {
      const aq = r.data.assignment?.assignmentQuestions?.[0];
      if (aq) {
        const freshSubs = aq.question?.subQuestions || [];
        for (const freshSq of freshSubs) {
          const existing = subQuestions.value.find(sq => sq.id === freshSq.id);
          if (existing) {
            existing.referenceAnswer = freshSq.referenceAnswer;
            if (freshSq.objectiveItems) {
              existing.objectiveItems = freshSq.objectiveItems;
            }
          }
        }
      }
    }
    if (!anyGrading) stopPolling();
  } catch { stopPolling(); }
}

// ===================== 生命周期 =====================
onMounted(() => {
  loadAssignment().then(() => {
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

    // IntersectionObserver：编辑器懒挂载（创建逻辑见 ensureEditorObserver，惰性且幂等）
    ensureEditorObserver();
  });

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', onBeforeUnload);
});

onUnmounted(() => {
  stopPolling();
  clearInterval(draftTimer);
  clearTimeout(saveDebounce);
  clearDeadlineTimer();
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
  /* 顶格到 topbar 下沿，并抵消 student/Layout.vue 内容区的内距（topbar+space-6 / space-12 / space-10） */
  height: calc(100vh - var(--layout-topbar-h));
  margin: calc(-1 * var(--space-6)) calc(-1 * var(--space-12)) calc(-1 * var(--space-10));
  padding: 0;
  overflow: hidden;
  background: var(--bg-canvas);
}

/* 顶栏（T4 顶部信息条：返回 + 考试名 + 状态标签） */
.sp-top {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2) var(--space-5);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.sp-title { font-size: var(--fs-title-2); font-weight: var(--fw-bold); margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-expired-tag {
  font-size: var(--fs-caption); color: var(--status-danger-fg);
  border: 1px solid var(--status-danger-fg); border-radius: var(--radius-xs); padding: 0 var(--space-2);
}

/* 主体：左侧题号导航 + 右侧作答区 */
.sp-main {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

/* 左侧导航 */
.sp-nav {
  width: 220px; flex-shrink: 0;
  background: var(--bg-surface-2); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; overflow: hidden;
}
.sp-nav-title {
  padding: var(--space-3) var(--space-3) var(--space-2);
  font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.sp-nav-list {
  flex: 1; overflow-y: auto; padding: var(--space-2) var(--space-3) var(--space-4);
}
.sp-nav-footer {
  padding: var(--space-2) var(--space-3); font-size: var(--fs-caption);
  border-top: 1px solid var(--border-subtle); flex-shrink: 0;
}
.dirty-hint { color: var(--status-warning-fg); }
.sync-ok { color: var(--status-success-fg); }
/* T5-A2：无可见 label 的控件用「视觉隐藏 label + for/id」补可访问名称（与 t7 同实现） */
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
/* D3：服务端跳过草稿（未入库）时的如实提示 —— 与「未保存」同一警示色 */
.draft-note { color: var(--status-warning-fg); }
/* T4-F2 本页份额：语义警示标签改用 B2-2 的全局类 .tag-warning（定义在 style.css，
   值 = --status-warning-* 三元组）；本页不再自带局部实现，避免两套并存 */
.ended-hint { color: var(--text-tertiary); font-size: var(--fs-body); }

/* 小节标题（可点击折叠） */
.n-section-head {
  display: flex; align-items: center; gap: 6px;
  margin: var(--space-3) 0 var(--space-2); padding: 6px 4px;
  cursor: pointer; user-select: none;
  font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-secondary);
  transition: var(--transition-control);
  border-radius: var(--radius-sm);
}
.n-section-head:first-child { margin-top: 0; }
.n-section-head:hover { color: var(--text-link); }
.n-section-arrow {
  font-size: var(--fs-body); width: 16px; flex-shrink: 0;
  color: var(--text-tertiary); margin-right: 2px;
  transition: transform var(--duration-base) var(--ease-out);
}
.n-section-arrow.collapsed { transform: rotate(-90deg); }
.n-section-head:hover .n-section-arrow { color: var(--text-link); }
.n-section-label { flex: 1; }
.n-section-count {
  /* T4-F3：承载信息（分区题型/问数）而非禁用态 → --text-secondary（亮 5.91:1 / 暗 8.52:1） */
  font-size: 10px; font-weight: var(--fw-regular); color: var(--text-secondary);
  background: var(--bg-sunken); padding: 0 5px; border-radius: var(--radius-pill);
}

/* 方块网格容器（折叠动画） */
.n-grid-wrap {
  max-height: none;
  overflow: visible;
  transition: max-height var(--duration-slow) var(--ease-out), opacity var(--duration-base) var(--ease-out);
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

/* 方块（状态色走 --status-* 三元组） */
.n-box {
  width: 30px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm); font-size: var(--fs-caption); font-weight: var(--fw-semibold);
  cursor: pointer; transition: var(--transition-control);
  border: 2px solid transparent;
  user-select: none;
  flex-shrink: 0;
}

/* 已答（未出分） */
.n-box-done {
  background: var(--status-info-bg); border-color: var(--status-info-bd); color: var(--status-info-fg);
}
/* 正确 */
.n-box-correct {
  background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg);
}
/* 错误 */
.n-box-wrong {
  background: var(--status-danger-bg); border-color: var(--status-danger-bd); color: var(--status-danger-fg);
}
/* 部分正确 */
.n-box-partial {
  background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg);
}
/* 未答（格子里的题号是可读信息，不是禁用文本） */
.n-box-empty {
  /* T4-F3：--text-disabled 误用 → --text-secondary（亮 6.75:1 / 暗 8.07:1） */
  background: var(--bg-surface); border-color: var(--border-default); color: var(--text-secondary);
}

/* 当前激活（规则置于各状态色之后：同优先级即可覆盖，无需提升优先级） */
.n-box-active {
  border-color: var(--brand-600);
  background: var(--bg-selected);
  color: var(--brand-600);
  box-shadow: var(--ring-focus);
}

/* 右侧答题区 */
.sp-content {
  flex: 1; min-width: 0; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  padding: 0 var(--space-6) var(--space-6);
}

/* 材料 */
.sp-material-bar {
  display: flex; align-items: center; gap: var(--space-2);
  margin-top: var(--space-4); padding: var(--space-3) var(--space-4);
  font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-secondary);
  cursor: pointer; user-select: none;
  background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);
}
.sp-material-bar:hover { background: var(--bg-hover); }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform var(--duration-base) var(--ease-out); }
.material-arrow.open { transform: rotate(180deg); }
.sp-material-body { overflow: hidden; }
.sp-material-inner { padding: var(--space-3) var(--space-4); background: var(--bg-surface-2); border-radius: 0 0 var(--radius-md) var(--radius-md); }
.collapse-enter-active, .collapse-leave-active { transition: all var(--duration-base) var(--ease-out); }
.collapse-enter-from, .collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to, .collapse-leave-from { opacity: 1; max-height: 800px; }

/* 题目区段 */
.sq-section {
  margin-top: var(--space-6); padding: var(--space-5) var(--space-6);
  background: var(--card-bg); border-radius: var(--card-radius);
  border: 1px solid var(--card-bd);
  box-shadow: var(--card-shadow);
  scroll-margin-top: var(--space-4);
}
.sq-header {
  display: flex; align-items: center; gap: var(--space-3);
  padding-bottom: var(--space-3); margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}
.sq-num { font-size: var(--fs-title-3); font-weight: var(--fw-bold); color: var(--text-primary); }
.sq-score { margin-left: auto; font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-link); }
.sq-status-spacer { flex: 1; }
.sq-stem { margin-bottom: 16px; }

/* 编辑器 */
.sq-editor-toolbar {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 6px var(--space-3); background: var(--bg-surface-2);
  border: 1px solid var(--border-default); border-bottom: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.lang-select { width: 110px; }
.sq-editor-wrap {
  border: 1px solid var(--border-default); border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  overflow: hidden;
}
.sq-editor-wrap :deep(.monaco-editor) { border: none; }
.sq-editor-placeholder {
  border: 1px solid var(--border-default); border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}
.placeholder-inner {
  height: 280px; display: flex; align-items: center; justify-content: center;
  /* T4-F3：占位文案 → --text-tertiary（亮 4.71:1 / 暗 4.65:1，均 ≥4.5） */
  background: var(--bg-surface-2); color: var(--text-tertiary); font-size: var(--fs-body);
}

/* 客观题小问卡片 */
.oi-card {
  margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4);
  border: 2px solid var(--border-subtle); border-radius: var(--radius-md);
  scroll-margin-top: var(--space-4);
  transition: var(--transition-control);
}
.oi-card:hover { border-color: var(--border-strong); }
.oi-card.oi-correct { border-color: var(--status-success-bd); background: var(--status-success-bg); }
.oi-card.oi-wrong { border-color: var(--status-danger-bd); background: var(--status-danger-bg); }
.oi-card:last-child { margin-bottom: 0; }
.oi-head {
  display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);
}
.oi-num { font-weight: var(--fw-bold); font-size: var(--fs-body); }
.oi-score { font-size: var(--fs-caption); color: var(--text-link); font-weight: var(--fw-semibold); }
.oi-judge { margin-left: auto; font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
.oi-judge.correct { color: var(--status-success-fg); }
.oi-judge.wrong { color: var(--status-danger-fg); }
.oi-stem { font-size: var(--fs-body); line-height: 1.7; margin-bottom: var(--space-2); white-space: pre-wrap; }
.oi-stem-code { font-family: var(--font-mono); font-size: var(--fs-body-sm); background: var(--bg-sunken); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
.oi-answer { margin-top: var(--space-2); }
.oi-answer-col { display: flex; flex-direction: column; gap: 6px; }

/* 评语 */
.sq-feedback {
  margin-top: var(--space-4); padding: var(--space-3) var(--space-4);
  background: var(--bg-sunken); border-radius: var(--radius-md);
  border-left: 3px solid var(--brand-600);
}
.fb-label { font-weight: var(--fw-semibold); font-size: var(--fs-body-sm); margin-bottom: 4px; }
.fb-body { font-size: var(--fs-body-sm); color: var(--text-secondary); line-height: 1.7; }

/* 参考答案（仅出分后 + 接口返回 referenceAnswer 时渲染） */
.sq-reference {
  margin-top: var(--space-4); padding: var(--space-3) var(--space-4);
  background: var(--status-success-bg); border: 1px solid var(--status-success-bd); border-radius: var(--radius-md);
  max-height: 360px; overflow: auto;
}
.reference-code {
  margin: var(--space-2) 0 0; font-size: var(--fs-body-sm); line-height: 1.7;
  white-space: pre-wrap; word-break: break-all;
  font-family: var(--font-mono);
  color: var(--text-primary);
}
.oi-reference {
  margin-top: var(--space-2); padding: 6px 10px;
  background: var(--status-warning-bg); border: 1px solid var(--status-warning-bd); border-radius: var(--radius-sm);
  font-size: var(--fs-body-sm); color: var(--status-warning-fg);
}

/* 底部提交栏 */
.sp-submit-bar {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: var(--space-6); margin-bottom: var(--space-10);
  padding: var(--space-4) var(--space-6);
  background: var(--bg-surface); border-radius: var(--card-radius);
  border: 1px solid var(--card-bd);
  box-shadow: var(--shadow-sm);
  position: sticky; bottom: 0; z-index: var(--z-sticky);
}
.sp-submit-bar.is-center { justify-content: center; }
.sp-submit-info { font-size: var(--fs-body); color: var(--text-tertiary); }

/* 通用 */
.q-content { font-size: var(--fs-body-lg); line-height: 1.8; }

.spinner-dot {
  display: inline-block; width: 8px; height: 8px;
  border: 2px solid var(--brand-300); border-top-color: var(--brand-600);
  border-radius: 50%; animation: spin .8s linear infinite;
  vertical-align: middle; margin-right: 2px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== <1200px：左侧题号导航折叠为顶部横向滚动条（T4 窄屏形态），条内自滚动、不产生横向溢出 ===== */
@media (max-width: 1199px) {
  .sp-main { flex-direction: column; }
  .sp-nav {
    width: 100%; flex-direction: row; align-items: center;
    border-right: 0; border-bottom: 1px solid var(--border-subtle);
    overflow: hidden;
  }
  .sp-nav-title { display: none; }
  .sp-nav-list {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: var(--space-3);
    overflow-x: auto; overflow-y: hidden;
    padding: var(--space-2) var(--space-3);
  }
  .n-section-head { margin: 0; flex: 0 0 auto; }
  .n-grid-wrap { flex: 0 0 auto; }
  .n-grid-wrap.collapsed { display: none; }
  .n-grid { flex-wrap: nowrap; padding: 0; }
  .sp-nav-footer { border-top: 0; border-left: 1px solid var(--border-subtle); }
}

/* ===== ≤768px：与 student/Layout.vue 的 ≤768 内距一致，保证负边距不产生横向溢出 ===== */
@media (max-width: 768px) {
  .sp-page {
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-3)) calc(-1 * var(--space-6));
  }
  .sp-content { padding: 0 var(--space-3) var(--space-4); }
  .sq-section { padding: var(--space-4); }
}
</style>
