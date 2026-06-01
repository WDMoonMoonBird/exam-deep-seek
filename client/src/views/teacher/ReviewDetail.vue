<template>
  <div class="rp-page" v-if="data">
    <!-- 顶栏 -->
    <div class="rp-top">
      <a-button type="link" size="small" @click="$router.back()">
        ← 返回
      </a-button>
      <h3 class="rp-title">{{ q.title }}</h3>
      <span class="rp-student">{{ studentName }} / {{ studentNo }}</span>
      <a-tag color="orange">总分 {{ q.maxScore }} 分</a-tag>
      <a-tag v-if="totalAiScore > 0" color="green">AI 评分 {{ totalAiScore }} / {{ q.maxScore }}</a-tag>
    </div>

    <!-- 主体 -->
    <div class="rp-main">
      <!-- 左侧导航 -->
      <nav class="rp-nav">
        <div class="rp-nav-title">题目导航</div>
        <div class="rp-nav-list">
          <template v-for="(sq, i) in subQuestions" :key="sq.id">
            <div class="n-section-head" @click="toggleCollapse(sq.id)">
              <span class="n-section-arrow" :class="{ collapsed: collapsedSqs.has(sq.id) }">▾</span>
              <span class="n-section-label">{{ getNavLabel(sq, i) }}</span>
              <span class="n-section-count">{{ sq.type === 'objective' ? (sq.objectiveItems || []).length + '问' : '编程' }}</span>
            </div>

            <div v-if="sq.type === 'code' || !sq.type" class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div :class="sqBoxClass(sq.id, undefined, sqResultColor(sq))" @click="activateAnchor('sq-' + sq.id); scrollTo('sq-' + sq.id)">1</div>
              </div>
            </div>

            <div v-else class="n-grid-wrap" :class="{ collapsed: collapsedSqs.has(sq.id) }">
              <div class="n-grid">
                <div
                  v-for="item in sq.objectiveItems" :key="item.key"
                  :class="sqBoxClass(sq.id, item.key, itemResultColor(sq.id, item))"
                  :title="itemTypeLabel(item.type)"
                  @click="activateAnchor('sq-' + sq.id + '-item-' + item.key); scrollTo('sq-' + sq.id + '-item-' + item.key)"
                >{{ item.key + 1 }}</div>
              </div>
            </div>
          </template>
        </div>
        <div class="rp-nav-footer">
          <span v-if="totalAiScore > 0">AI 总分 {{ totalAiScore }} / {{ q.maxScore }}</span>
          <span v-else style="color:#999;">未评分</span>
        </div>
      </nav>

      <!-- 右侧：流式阅卷区 -->
      <div class="rp-content" ref="contentRef">
        <!-- 材料 -->
        <div v-if="materialText" class="rp-material-bar" @click="showMaterial = !showMaterial">
          <span>题目材料</span>
          <span class="material-arrow" :class="{ open: showMaterial }">▼</span>
        </div>
        <Transition name="collapse">
          <div v-if="showMaterial && materialText" class="rp-material-body">
            <div class="rp-material-inner q-content" v-html="safeMaterial" />
          </div>
        </Transition>

        <!-- 题目流 -->
        <div
          v-for="(sq, i) in subQuestions" :key="sq.id"
          :data-section="'sq-' + sq.id"
          :id="'sq-' + sq.id"
          class="sq-section"
        >
          <div class="sq-header">
            <span class="sq-num">第 {{ i + 1 }} 小题</span>
            <a-tag v-if="sq.type === 'objective'" color="purple" size="small">
              {{ getNavLabel(sq, i).replace('第' + (i + 1) + '小题 ', '') || '客观题' }}
            </a-tag>
            <a-tag v-else color="blue" size="small">编程题</a-tag>
            <span class="sq-score">{{ sq.score }} 分</span>
            <span class="sq-status-spacer"></span>
            <a-tag v-if="getSub(sq.id)" :color="subStatusColor(getSub(sq.id))">
              {{ subStatusText(getSub(sq.id)) }}
            </a-tag>
          </div>

          <div class="sq-stem q-content" v-html="safeSqContent(sq)" />

          <!-- 主观题：学生代码 + 参考答案 -->
          <template v-if="sq.type === 'code' || !sq.type">
            <div class="sq-answer-label">
              <span class="label-text">学生答案</span>
              <span style="font-size:12px;color:#888;">{{ sq.language || 'cpp' }}</span>
              <a-button size="small" style="margin-left:8px;" @click="formatCode(sq.id)">格式化</a-button>
            </div>
            <div class="sq-editor-wrap">
              <CodeEditor
                :ref="(el) => setEditorRef(sq.id, el)"
                :modelValue="getSub(sq.id)?.answer || ''"
                :language="sq.language || 'cpp'"
                readOnly
                :height="220"
              />
            </div>

            <div v-if="getSub(sq.id)" class="sq-review-box">
              <div class="sq-review-bar">
                <span class="sq-review-label">AI 评分</span>
                <span class="sq-review-score">{{ getSub(sq.id)?.aiScore ?? '—' }} / {{ sq.score }} 分</span>
                <a-button size="small" :loading="regrading[sq.id]" @click="regrade(sq)">重新评分</a-button>
                <a-button size="small" @click="useAiFeedback(sq.id)">使用 AI 评语</a-button>
                <a-input-number
                  v-model:value="reviewScores[sq.id]"
                  :min="0" :max="sq.score"
                  size="small" style="width:90px;margin-left:auto;"
                />
                <span style="font-size:12px;color:#999;">最终分</span>
              </div>
              <div class="sq-review-fb-row">
                <div class="sq-review-fb-col">
                  <span class="sq-review-fb-label">AI 评语</span>
                  <div class="sq-review-fb-ai">{{ getSub(sq.id)?.aiFeedback || '暂无评语' }}</div>
                </div>
                <div class="sq-review-fb-col">
                  <span class="sq-review-fb-label">教师评语</span>
                  <a-textarea
                    v-model:value="reviewFeedbacks[sq.id]"
                    size="small" placeholder="教师评语（选填）"
                    class="teacher-fb-textarea"
                  />
                </div>
              </div>
            </div>
          </template>

          <!-- 客观题：小问列表 -->
          <div v-else class="oi-section">
            <div
              v-for="item in (sq.objectiveItems || [])" :key="item.key"
              :data-section="'sq-' + sq.id + '-item-' + item.key"
              :id="'sq-' + sq.id + '-item-' + item.key"
              class="oi-card"
              :class="{ 'oi-correct': isItemCorrect(sq.id, item), 'oi-wrong': !isItemCorrect(sq.id, item) && isItemAnswered(sq.id, item) }"
            >
              <div class="oi-head">
                <span class="oi-num">{{ item.key + 1 }}.</span>
                <a-tag :color="itemTypeColor(item.type)" size="small">{{ itemTypeLabel(item.type) }}</a-tag>
                <span v-if="item.score" class="oi-score">+{{ item.score }} 分</span>
                <span v-if="isItemAnswered(sq.id, item)" class="oi-judge" :class="{ correct: isItemCorrect(sq.id, item), wrong: !isItemCorrect(sq.id, item) }">
                  {{ isItemCorrect(sq.id, item) ? '✓ 正确' : '✗ 错误' }}
                </span>
                <span v-else class="oi-judge unanswered">（未作答）</span>
              </div>
              <div class="oi-stem" :class="{ 'oi-stem-code': isCodeStem(item.stem) }">{{ item.stem }}</div>

              <div class="oi-compare">
                <div class="oi-compare-row">
                  <span class="oi-compare-tag student">作答</span>
                  <span :class="{ 'oi-wrong-text': !isItemCorrect(sq.id, item) && isItemAnswered(sq.id, item) }">
                    {{ getItemStudentStr(sq.id, item) }}
                  </span>
                </div>
                <div class="oi-compare-row">
                  <span class="oi-compare-tag correct">答案</span>
                  <span>{{ getItemRefStr(item) }}</span>
                </div>
              </div>
            </div>

            <!-- 客观题得分摘要 -->
            <div v-if="getSub(sq.id)" class="sq-obj-score-bar">
              <span style="font-size:13px;color:#888;">自动评分</span>
              <span class="sq-review-score">{{ getSub(sq.id)?.aiScore ?? '—' }} / {{ sq.score }} 分</span>
            </div>
          </div>
        </div>

        <!-- 底部审核 bar -->
        <div class="rp-submit-bar">
          <div class="rp-submit-info">
            <span>共 {{ subQuestions.length }} 题，AI 总分 {{ totalAiScore }} / {{ q.maxScore }}</span>
          </div>
          <a-button type="primary" size="large" :loading="reviewingAll" @click="reviewAll">保存审核</a-button>
          <a-button size="large" :loading="publishingAll" @click="publishAll">发布成绩</a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import DOMPurify from 'dompurify';
import request from '../../api/request.js';
import CodeEditor from '../../components/CodeEditor.vue';

const route = useRoute();

// ===================== 数据 =====================
const data = ref(null);
const studentName = ref('');
const studentNo = ref('');
const q = ref({});
const subQuestions = ref([]);
const showMaterial = ref(true);

const subMap = ref({});
const reviewScores = reactive({});
const reviewFeedbacks = reactive({});
const regrading = reactive({});
const reviewingAll = ref(false);
const publishingAll = ref(false);

// ===================== 导航 =====================
const contentRef = ref(null);
const activeAnchor = ref('');
const collapsedSqs = reactive(new Set());

function toggleCollapse(sqId) {
  if (collapsedSqs.has(sqId)) collapsedSqs.delete(sqId);
  else collapsedSqs.add(sqId);
}

function getNavLabel(sq, i) {
  const n = `第${i + 1}小题`;
  const settings = q.value.objectiveSettings || {};
  if (sq.type === 'code' || !sq.type) return n;
  if (settings.classificationMode === 'flat') {
    const items = sq.objectiveItems || [];
    const firstType = items[0]?.type;
    return firstType ? `${n} ${itemTypeLabel(firstType)}` : n;
  }
  return n;
}

function itemTypeLabel(type) {
  const map = { choice: '单选', multi_choice: '多选', judge: '判断', fill: '填空' };
  return map[type] || type;
}

function itemTypeColor(type) {
  const map = { choice: 'blue', multi_choice: 'purple', judge: 'orange', fill: 'green' };
  return map[type] || 'default';
}

function getSub(sqId) { return subMap.value[sqId] || null; }

function getItemKey(sqId, itemKey) { return `${sqId}_${itemKey}`; }

// 解析学生客观题答案
const parsedAnswers = computed(() => {
  const map = {};
  for (const sq of subQuestions.value) {
    if (sq.type !== 'objective') continue;
    const sub = getSub(sq.id);
    if (!sub?.answer) continue;
    try { map[sq.id] = JSON.parse(sub.answer); } catch { map[sq.id] = []; }
  }
  return map;
});

function getStudentItem(sqId, itemKey) {
  const items = parsedAnswers.value[sqId] || [];
  return items.find(a => a.key === itemKey) || null;
}

function isItemAnswered(sqId, item) {
  const a = getStudentItem(sqId, item.key);
  return a && (a.answer || '').trim().length > 0;
}

function isItemCorrect(sqId, item) {
  const a = getStudentItem(sqId, item.key);
  if (!a || !(a.answer || '').trim()) return false;
  if (item.type === 'choice') {
    return String(a.answer).trim() === String(item.answer).trim();
  } else if (item.type === 'multi_choice') {
    const sSet = new Set(String(a.answer).split(',').map(s => s.trim()).filter(Boolean));
    const aSet = new Set((Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim()));
    return sSet.size === aSet.size && [...sSet].every(s => aSet.has(s));
  } else if (item.type === 'judge') {
    return String(a.answer).trim() === String(item.answer).trim();
  } else if (item.type === 'fill') {
    const ra = String(item.answer || '').split(',').map(s => s.trim());
    const sa = String(a.answer || '').split(',').map(s => s.trim());
    return ra.every((r, bi) => String(sa[bi] || '').toLowerCase() === r.toLowerCase());
  }
  return false;
}

function getItemStudentStr(sqId, item) {
  const a = getStudentItem(sqId, item.key);
  if (!a || !(a.answer || '').trim()) return '（未作答）';
  if (item.type === 'choice') {
    const o = (item.options || []).find(opt => opt.key === a.answer);
    return o ? `${a.answer}. ${o.text}` : a.answer;
  } else if (item.type === 'multi_choice') {
    const keys = String(a.answer).split(',').map(s => s.trim()).filter(Boolean);
    return keys.map(k => {
      const o = (item.options || []).find(opt => opt.key === k);
      return o ? `${k}. ${o.text}` : k;
    }).join(', ') || '（未作答）';
  } else if (item.type === 'judge') {
    return a.answer === 'true' ? '正确' : a.answer === 'false' ? '错误' : a.answer;
  }
  return a.answer || '';
}

function getItemRefStr(item) {
  if (item.type === 'choice') {
    const o = (item.options || []).find(opt => opt.key === item.answer);
    return o ? `${item.answer}. ${o.text}` : item.answer;
  } else if (item.type === 'multi_choice') {
    const keys = (Array.isArray(item.answer) ? item.answer : String(item.answer).split(',')).map(s => s.trim());
    return keys.map(k => {
      const o = (item.options || []).find(opt => opt.key === k);
      return o ? `${k}. ${o.text}` : k;
    }).join(', ');
  } else if (item.type === 'judge') {
    return item.answer === 'true' ? '正确' : item.answer === 'false' ? '错误' : item.answer;
  }
  return item.answer || '';
}

// 导航方块颜色
function sqResultColor(sq) {
  const sub = getSub(sq.id);
  if (!sub || sub.aiScore == null) return 'empty';
  const ratio = (sub.aiScore || 0) / (sq.score || 1);
  if (ratio >= 0.8) return 'correct';
  if (ratio >= 0.4) return 'partial';
  return 'wrong';
}

function itemResultColor(sqId, item) {
  if (!isItemAnswered(sqId, item)) return 'empty';
  return isItemCorrect(sqId, item) ? 'correct' : 'wrong';
}

function sqBoxClass(sqId, itemKey, result) {
  const anchor = itemKey != null ? `sq-${sqId}-item-${itemKey}` : `sq-${sqId}`;
  return {
    'n-box': true,
    'n-box-correct': result === 'correct',
    'n-box-wrong': result === 'wrong',
    'n-box-partial': result === 'partial',
    'n-box-empty': result === 'empty',
    'n-box-active': activeAnchor.value === anchor,
  };
}

// ===================== 滚动 =====================
function scrollTo(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function activateAnchor(anchor) {
  activeAnchor.value = anchor;
}

// ===================== 辅助 =====================
const materialText = computed(() => {
  const m = q.value.material || '';
  return m.replace(/<[^>]*>/g, '').trim();
});
const safeMaterial = computed(() => DOMPurify.sanitize(q.value.material || ''));
function safeSqContent(sq) { return DOMPurify.sanitize((sq || {}).content || ''); }
const totalAiScore = computed(() => {
  let sum = 0;
  for (const key in subMap.value) sum += subMap.value[key].aiScore || 0;
  return sum;
});

function isCodeStem(stem) {
  if (!stem) return false;
  return stem.includes('```') || stem.includes('{') || stem.includes('function') || stem.includes('class ') || stem.includes('def ');
}

function subStatusColor(sub) {
  if (sub?.aiFeedback === '请联系老师') return 'red';
  if (sub?.status === 'published') return 'green';
  if (sub?.status === 'reviewed') return 'blue';
  if (sub?.status === 'ai_graded') return 'green';
  return 'default';
}

function subStatusText(sub) {
  if (sub?.aiFeedback === '请联系老师') return '评分异常';
  if (sub?.status === 'published') return '已发布';
  if (sub?.status === 'reviewed') return '已审核';
  if (sub?.status === 'ai_graded') return 'AI已评分';
  if (sub?.status === 'submitted') return '待评分';
  return sub?.status || '';
}

// ===================== 审核操作 =====================
// 格式化代码
const editorRefs = {};
function setEditorRef(sqId, el) {
  if (el) editorRefs[sqId] = el;
}
function formatCode(sqId) {
  const ed = editorRefs[sqId];
  if (ed?.format) ed.format();
}

function useAiFeedback(sqId) {
  const sub = subMap.value[sqId];
  if (!sub?.aiFeedback) return message.warn('暂无 AI 评语');
  reviewFeedbacks[sqId] = sub.aiFeedback;
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

async function reviewAll() {
  const subs = Object.values(subMap.value);
  if (!subs.length) return message.warn('无提交记录');

  reviewingAll.value = true;
  try {
    const tasks = subs.map(s => {
      const key = s.subQuestionId || s.questionId;
      return request.put(`/teacher/submissions/${s.id}/review`, {
        finalScore: reviewScores[key],
        teacherFeedback: reviewFeedbacks[key] || s.aiFeedback || '',
      }).then(() => {
        s.status = 'reviewed';
        s.finalScore = reviewScores[key];
        return true;
      });
    });
    const results = await Promise.allSettled(tasks);
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.filter(r => r.status === 'rejected').length;
    if (fail === 0) message.success(`全部 ${ok} 题审核已保存`);
    else message.warning(`${ok} 题成功，${fail} 题失败`);
  } finally { reviewingAll.value = false; }
}

function publishAll() {
  const subs = Object.values(subMap.value);
  if (!subs.length) return message.warn('无提交记录');

  Modal.confirm({
    title: '确认发布成绩？',
    content: '发布后学生将能看到分数和评语。发布后仍可修改分数，修改后重新发布即可。',
    okText: '确定发布',
    cancelText: '取消',
    onOk: async () => {
      const ids = subs.map(s => s.id);
      publishingAll.value = true;
      try {
        await request.put('/teacher/submissions/publish', { submissionIds: ids });
        subs.forEach(s => { s.status = 'published'; });
        message.success('全部已发布');
      } catch { message.error('发布失败'); }
      finally { publishingAll.value = false; }
    },
  });
}

// ===================== 数据加载 =====================
async function fetch() {
  const r = await request.get(`/teacher/submissions/${route.params.id}`);
  data.value = r.data;
  studentName.value = r.data.student?.realName || '';
  studentNo.value = r.data.student?.username || '';
  q.value = r.data.question || {};
  subQuestions.value = q.value.subQuestions || [];

  const map = {};
  (r.data.allSubmissions || []).forEach(s => {
    const key = s.subQuestionId || s.questionId;
    map[key] = s;
    reviewScores[key] = s.finalScore ?? s.aiScore ?? 0;
    reviewFeedbacks[key] = s.teacherFeedback || '';
  });
  subMap.value = map;
}

onMounted(fetch);
</script>

<style scoped>
.rp-page {
  display: flex; flex-direction: column;
  height: calc(100vh - 52px);
  margin: -28px -48px -40px;
  padding: 0;
  background: var(--canvas-parchment);
}

/* 顶栏 */
.rp-top {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
}
.rp-title { font-size: 18px; font-weight: 700; margin: 0; }
.rp-student { font-size: 13px; color: #888; flex: 1; }

/* 主体 */
.rp-main {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

/* 左侧导航 */
.rp-nav {
  width: 220px; flex-shrink: 0;
  background: #fafafa; border-right: 1px solid var(--hairline);
  display: flex; flex-direction: column; overflow: hidden;
}
.rp-nav-title {
  padding: 14px 14px 10px;
  font-size: 13px; font-weight: 600; color: #999;
  border-bottom: 1px solid #f0f0f0; flex-shrink: 0;
}
.rp-nav-list {
  flex: 1; overflow-y: auto; padding: 8px 12px;
}
.rp-nav-footer {
  padding: 8px 14px; font-size: 12px;
  border-top: 1px solid #f0f0f0; flex-shrink: 0;
}

/* 小节标题 */
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
  transition: transform .25s ease;
  color: #999; margin-right: 2px;
}
.n-section-head:hover .n-section-arrow { color: #1677ff; }
.n-section-arrow.collapsed { transform: rotate(-90deg); }
.n-section-label { flex: 1; }
.n-section-count {
  font-size: 10px; font-weight: 400; color: #bbb;
  background: #f0f0f0; padding: 0 5px; border-radius: 8px;
}

/* 折叠动画 */
.n-grid-wrap {
  overflow: hidden;
  max-height: 400px;
  transition: max-height .3s ease, opacity .2s ease;
  opacity: 1;
}
.n-grid-wrap.collapsed {
  max-height: 0;
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
  cursor: pointer;
  border: 2px solid transparent;
  user-select: none;
  flex-shrink: 0;
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
/* 未答/未评分：灰色 */
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

/* 右侧阅卷区 */
.rp-content {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 0 24px 24px;
}

/* 材料 */
.rp-material-bar {
  display: flex; align-items: center; gap: 8px;
  margin-top: 16px; padding: 10px 16px;
  font-size: 13px; font-weight: 500; color: #666;
  cursor: pointer; user-select: none;
  background: #fff; border-radius: 8px; border: 1px solid #f0f0f0;
}
.rp-material-bar:hover { background: #f5f5f5; }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform .2s; }
.material-arrow.open { transform: rotate(180deg); }
.rp-material-body { overflow: hidden; }
.rp-material-inner { padding: 12px 16px; background: #fafafa; border-radius: 0 0 8px 8px; }
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

/* 学生答案标签 */
.sq-answer-label {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; background: #fafafa;
  border: 1px solid #e8e8e8; border-bottom: none;
  border-radius: 6px 6px 0 0;
}
.label-text { font-size: 13px; font-weight: 600; color: #888; }

/* 编辑器 */
.sq-editor-wrap {
  border: 1px solid #e8e8e8; border-radius: 0 0 6px 6px;
  overflow: hidden;
}
.sq-editor-wrap :deep(.monaco-editor) { border: none !important; }

/* 客观题小问卡片 */
.oi-card {
  margin-bottom: 14px; padding: 14px 16px;
  border: 2px solid #f0f0f0; border-radius: 8px;
  scroll-margin-top: 16px;
  transition: border-color .2s;
}
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
.oi-judge.unanswered { color: #ccc; }
.oi-stem { font-size: 14px; line-height: 1.7; margin-bottom: 10px; white-space: pre-wrap; }
.oi-stem-code { font-family: monospace; font-size: 13px; background: #f5f5f5; padding: 8px 12px; border-radius: 6px; }

/* 答案对比 */
.oi-compare { margin-top: 8px; padding-top: 10px; border-top: 1px dashed #f0f0f0; }
.oi-compare-row {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 13px; line-height: 1.6; margin-bottom: 4px;
}
.oi-compare-row:last-child { margin-bottom: 0; }
.oi-compare-tag {
  flex-shrink: 0; font-size: 10px; font-weight: 600;
  padding: 1px 6px; border-radius: 4px;
}
.oi-compare-tag.student { background: #fff2f0; color: #cf1322; }
.oi-compare-tag.correct { background: #f6ffed; color: #389e0d; }
.oi-wrong-text { color: #ff4d4f; font-weight: 600; }

/* 主观题审核区 */
.sq-review-box {
  margin-top: 12px; padding: 12px 14px;
  background: #fafafa; border-radius: 8px;
  border: 1px solid #f0f0f0;
}
.sq-review-bar {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}
.sq-review-label { font-size: 12px; font-weight: 600; color: #999; }
.sq-review-score { font-size: 18px; font-weight: 700; color: #1677ff; }
.sq-review-fb-row {
  display: flex; gap: 14px; margin-top: 10px;
  align-items: stretch;
}
.sq-review-fb-col {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
}
.sq-review-fb-label {
  display: block; font-size: 11px; font-weight: 600; color: #999;
  margin-bottom: 4px; flex-shrink: 0;
}
.sq-review-fb-ai {
  flex: 1; font-size: 13px; color: #555; line-height: 1.7;
  white-space: pre-wrap; overflow-y: auto;
  padding: 8px 10px; background: #fff; border-radius: 4px;
  border: 1px solid #eee;
  min-height: 0;
}
.sq-review-fb-col :deep(.teacher-fb-textarea) {
  flex: 1; display: flex;
}
.sq-review-fb-col :deep(.teacher-fb-textarea textarea) {
  flex: 1;
}

/* 客观题得分摘要 */
.sq-obj-score-bar {
  display: flex; align-items: center; gap: 8px;
  margin-top: 12px; padding: 8px 12px;
  background: #fafafa; border-radius: 6px;
  border: 1px solid #f0f0f0;
}
.sq-review-label { font-size: 12px; font-weight: 600; color: #999; }
.sq-review-score { font-size: 18px; font-weight: 700; color: #1677ff; }
.sq-review-inline .ant-input-number { flex-shrink: 0; }

/* 底部审核 bar */
.rp-submit-bar {
  display: flex; align-items: center; gap: 16px;
  margin-top: 24px; margin-bottom: 40px;
  padding: 16px 24px;
  background: #fff; border-radius: 12px;
  border: 1px solid #f0f0f0;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
  position: sticky; bottom: 0; z-index: 10;
}
.rp-submit-info { flex: 1; font-size: 14px; color: #888; }

/* 通用 */
.q-content { font-size: 15px; line-height: 1.8; }
</style>
