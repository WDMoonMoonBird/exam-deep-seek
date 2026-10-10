<template>
  <div class="rp-page wb-shell" v-if="data" :class="{ 'wb-drawer-open': panelOpen }">
    <!-- 顶栏：返回条 + 对象名 + 状态徽标（Workbench 壳） -->
    <div class="rp-top wb-top">
      <a-button type="link" size="small" @click="$router.back()">
        ← 返回
      </a-button>
      <h3 class="rp-title">{{ q.title }}</h3>
      <StatusTag v-if="isPracticeMode" tone="success" text="练习模式" />
      <span class="rp-student">{{ studentName }} / {{ displayStudentNo }}</span>
      <StatusTag tone="neutral" :text="'总分 ' + q.maxScore + ' 分'" />
      <StatusTag v-if="totalAiScore > 0" tone="brand" :text="'AI 评分 ' + totalAiScore + ' / ' + q.maxScore" />
      <StatusTag :tone="pageStatus.tone" :text="pageStatus.text" dot />
    </div>

    <!-- 主体 -->
    <div class="rp-main wb-body">
      <!-- 左侧导航 -->
      <nav class="rp-nav wb-left">
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
          <span v-else style="color:var(--text-tertiary);">未评分</span>
        </div>
      </nav>

      <!-- 右侧：流式阅卷区 -->
      <div class="rp-content wb-mid" ref="contentRef">
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
            <!-- T4-F2 类别收口：antd purple 预置色在暗色下 3.39:1 → 走全局语义类 .tag-accent（亮 5.60 / 暗 7.90） -->
            <a-tag v-if="sq.type === 'objective'" class="tag-accent" size="small">
              {{ getNavLabel(sq, i).replace('第' + (i + 1) + '小题 ', '') || '客观题' }}
            </a-tag>
            <a-tag v-else color="blue" size="small">编程题</a-tag>
            <span class="sq-score">{{ sq.score }} 分</span>
            <span class="sq-status-spacer"></span>
            <a-tag v-if="getSub(sq.id)" :color="subStatusColor(getSub(sq.id))" :class="subStatusTagClass(getSub(sq.id))">
              {{ subStatusText(getSub(sq.id)) }}
            </a-tag>
          </div>

          <div class="sq-stem q-content" v-html="safeSqContent(sq)" />

          <!-- 主观题：学生代码 + 参考答案 -->
          <template v-if="sq.type === 'code' || !sq.type">
            <div class="sq-answer-label">
              <span class="label-text">学生答案</span>
              <span style="font-size:var(--fs-caption);color:var(--text-tertiary);">{{ sq.language || 'cpp' }}</span>
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
                <a-tag :color="itemTypeColor(item.type)" :class="itemTypeTagClass(item.type)" size="small">{{ itemTypeLabel(item.type) }}</a-tag>
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
              <span style="font-size:var(--fs-body-sm);color:var(--text-tertiary);">自动评分</span>
              <span class="sq-review-score">{{ getSub(sq.id)?.aiScore ?? '—' }} / {{ sq.score }} 分</span>
            </div>
          </div>
        </div>

        <!-- 底部审核 bar -->
        <div v-if="!isPracticeMode" class="rp-submit-bar">
          <div class="rp-submit-info">
            <span>共 {{ subQuestions.length }} 题，AI 总分 {{ totalAiScore }} / {{ q.maxScore }}</span>
          </div>
          <a-button type="primary" size="large" :loading="reviewingAll" @click="reviewAll">保存审核</a-button>
          <a-button size="large" :loading="publishingAll" @click="publishAll">发布成绩</a-button>
        </div>
      </div>

      <!-- 右侧评分面板（Workbench 壳：≥1200px 常驻右栏；<1200px 抽屉化） -->
      <aside class="wb-right" :class="{ open: panelOpen, 'is-collapsed': collapsed }" aria-label="评分面板">
        <div class="wb-right-head">
          <span class="wb-right-title">评分面板</span>
          <button
            type="button"
            class="wb-collapse-btn"
            :aria-expanded="collapsed ? 'false' : 'true'"
            aria-controls="rp-score-panel"
            :aria-label="collapsed ? '展开评分面板' : '收起评分面板'"
            @mousedown.prevent
            @click="collapsed = !collapsed"
          >{{ collapsed ? '展开' : '收起' }}</button>
          <a-button v-if="narrow" type="link" size="small" @click="panelOpen = false">关闭</a-button>
        </div>
        <Transition name="wb-panel">
        <div v-show="!collapsed" id="rp-score-panel" class="wb-right-body">
          <template v-for="(sq, i) in subQuestions" :key="'pn-' + sq.id">
            <div v-if="(sq.type === 'code' || !sq.type) && getSub(sq.id)" class="wb-panel-section">
              <div class="wb-panel-head">第 {{ i + 1 }} 小题 · {{ sq.score }} 分</div>
              <div class="sq-review-box">
                <div class="sq-review-bar">
                  <span class="sq-review-label">AI 评分</span>
                  <span class="sq-review-score">{{ getSub(sq.id)?.aiScore ?? '—' }} / {{ sq.score }} 分</span>
                  <a-button size="small" :loading="regrading[sq.id]" @click="regrade(sq)">重新评分</a-button>
                  <a-button size="small" @click="showPrompt(sq)">提示词</a-button>
                  <a-button size="small" @click="useAiFeedback(sq.id)">使用 AI 评语</a-button>
                  <a-input-number
                    v-model:value="reviewScores[sq.id]"
                    :min="0" :max="sq.score"
                    size="small" class="wb-final-score"
                  />
                  <span class="wb-final-label">最终分</span>
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
            </div>
          </template>
        </div>
        </Transition>
      </aside>

      <button v-if="narrow" type="button" class="wb-drawer-toggle" aria-controls="rp-score-panel" :aria-expanded="panelOpen ? 'true' : 'false'" @click="panelOpen = !panelOpen">
        {{ panelOpen ? '收起评分面板' : '评分面板' }}
      </button>
    </div>
  </div>

  <!-- AI 提示词（该次评分的实际提示词，含学生答案） -->
  <a-modal v-model:open="promptModalOpen" :title="'AI 提示词 — ' + (promptSubTitle || '')" :footer="null" :width="820">
    <a-spin :spinning="promptLoading">
      <template v-if="promptData">
        <div class="prompt-block">
          <div class="prompt-role-label">System（角色设定）</div>
          <pre class="prompt-pre">{{ promptData.system }}</pre>
          <div class="prompt-role-label">User（评分任务，含学生提交的答案）</div>
          <pre class="prompt-pre">{{ promptData.user }}</pre>
        </div>
      </template>
      <a-empty v-else-if="!promptLoading" description="暂无数据" :image="false" />
    </a-spin>
  </a-modal>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import DOMPurify from 'dompurify';
import request from '../../api/request.js';
import CodeEditor from '../../components/CodeEditor.vue';
import StatusTag from '../../components/StatusTag.vue';
import { useConfirm } from '../../composables/useConfirm.js';

const route = useRoute();
const { confirm } = useConfirm();

/** Workbench 壳：<1200px 时右栏评分面板抽屉化（纯布局，不改任何交互与请求） */
const narrow = ref(false);
const panelOpen = ref(false);
/** 右栏评分面板折叠（≥1200px 生效；宽度方向过渡，终值 384 → 44） */
const collapsed = ref(false);
let shellMq = null;
function onShellMq(e) { narrow.value = e.matches; if (!e.matches) panelOpen.value = false; }

/** 页级状态徽标（展示既有提交状态，不新增语义） */
const pageStatus = computed(() => {
  const subs = Object.values(subMap.value || {});
  if (!subs.length) return { tone: 'neutral', text: '无提交' };
  if (subs.every(s => s.status === 'published')) return { tone: 'success', text: '已发布' };
  if (subs.every(s => s.status === 'reviewed')) return { tone: 'brand', text: '已审核' };
  return { tone: 'warning', text: '待审核' };
});

// ===================== 数据 =====================
const data = ref(null);
const studentName = ref('');
const studentNo = ref('');
const schoolName = ref('');
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
/** T4-F2 类别收口（动态预置色）：题型徽标里 judge→orange 亮 3.34:1、fill→green 亮 3.37:1、
    multi_choice→purple 暗 3.39:1 均不达 AA → 走全局语义类（style.css，0-2-1 接管三色）；
    choice→blue 亮 5.50 / 暗 4.91 达标，保持预览色。 */
function itemTypeTagClass(type) {
  const map = { judge: 'tag-warning', fill: 'tag-success', multi_choice: 'tag-accent' };
  return map[type] || null;
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

const isPracticeMode = computed(() => {
  return data.value?.assignment?.mode === 'practice';
});

const displayStudentNo = computed(() => {
  const no = studentNo.value;
  if (!no) return '';
  const at = no.lastIndexOf('@');
  if (at > 0 && schoolName.value) {
    return no.substring(0, at) + '@' + schoolName.value;
  }
  if (at > 0) return no.substring(0, at);
  return no;
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
/** T4-F2 类别收口：提交状态徽标里 green（已发布 / AI 已评分）亮 3.37:1 不达 AA → tag-success；
    red 亮 5.07 / 暗 4.54、blue 亮 5.50 / 暗 4.91 达标，保持预置色。 */
function subStatusTagClass(sub) { return subStatusColor(sub) === 'green' ? 'tag-success' : null; }

function subStatusText(sub) {
  if (sub?.aiFeedback === '请联系老师') return '评分异常';
  if (sub?.status === 'published') return '已发布';
  if (sub?.status === 'reviewed') return '已审核';
  if (sub?.status === 'ai_graded') return 'AI已评分';
  if (sub?.status === 'submitted') return '待评分';
  return sub?.status || '';
}

// ===================== AI 提示词查看 =====================
const promptModalOpen = ref(false);
const promptLoading = ref(false);
const promptData = ref(null);
const promptSubTitle = ref('');

async function showPrompt(sq) {
  const sub = getSub(sq.id);
  if (!sub) return;
  promptSubTitle.value = (sq.title || '') + '（' + sub.id + '）';
  promptModalOpen.value = true;
  promptLoading.value = true;
  promptData.value = null;
  try {
    const r = await request.get('/teacher/submissions/' + sub.id + '/prompt');
    promptData.value = r.data;
  } catch (e) {
    message.error('获取提示词失败：' + (e.response?.data?.message || e.message));
  } finally {
    promptLoading.value = false;
  }
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

  confirm({
    title: '确认发布成绩？',
    content: '发布后学生将能看到分数和评语。发布后仍可修改分数，修改后重新发布即可。',
    okText: '发布成绩',
    cancelText: '取消',
    danger: true,
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
  schoolName.value = r.data.schoolName || '';
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

onMounted(() => {
  fetch();
  shellMq = window.matchMedia('(max-width: 1199px)');
  narrow.value = shellMq.matches;
  if (shellMq.addEventListener) shellMq.addEventListener('change', onShellMq);
  else shellMq.addListener(onShellMq);
});

onUnmounted(() => {
  if (!shellMq) return;
  if (shellMq.removeEventListener) shellMq.removeEventListener('change', onShellMq);
  else shellMq.removeListener(onShellMq);
});
</script>

<style scoped>
/* AI 提示词预览 */
.prompt-block { margin-bottom: 12px; }
.prompt-role-label { font-size:var(--fs-caption); font-weight: 600; color: var(--text-secondary); margin: 8px 0 4px; }
.prompt-pre {
  margin: 0; padding: 10px 12px;
  background: var(--bg-sunken); border: 1px solid var(--border-default); border-radius:var(--radius-sm);
  font-size:var(--fs-caption); line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 400px; overflow: auto;
}

.rp-page {
  display: flex; flex-direction: column;
  height: calc(100vh - 52px);
  margin: -28px -48px -40px;
  padding: 0;
  background: var(--bg-canvas);
}

/* 顶栏 */
.rp-top {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.rp-title { font-size:var(--fs-title-2); font-weight: 700; margin: 0; }
.rp-student { font-size:var(--fs-body-sm); color: var(--text-tertiary); flex: 1; }

/* 主体 */
.rp-main {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}

/* 左侧导航 */
.rp-nav {
  width: 220px; flex-shrink: 0;
  background: var(--bg-surface-2); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; overflow: hidden;
}
.rp-nav-title {
  padding: 14px 14px 10px;
  font-size:var(--fs-body-sm); font-weight: 600; color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.rp-nav-list {
  flex: 1; overflow-y: auto; padding: 8px 12px 16px;
}
.rp-nav-footer {
  padding: 8px 14px; font-size:var(--fs-caption);
  border-top: 1px solid var(--border-subtle); flex-shrink: 0;
}

/* 小节标题 */
.n-section-head {
  display: flex; align-items: center; gap: 6px;
  margin: 14px 0 8px; padding: 6px 4px;
  cursor: pointer; user-select: none;
  font-size:var(--fs-body-sm); font-weight: 600; color: var(--text-secondary);
  transition: color .15s;
  border-radius:var(--radius-sm);
}
.n-section-head:first-child { margin-top: 0; }
.n-section-head:hover { color: var(--brand-600); }
.n-section-arrow {
  font-size:var(--fs-body); width: 16px; flex-shrink: 0;
  transition: transform .25s ease;
  color: var(--text-tertiary); margin-right: 2px;
}
.n-section-head:hover .n-section-arrow { color: var(--brand-600); }
.n-section-arrow.collapsed { transform: rotate(-90deg); }
.n-section-label { flex: 1; }
.n-section-count {
  /* T4-F3 同源（学生作答页同类名族的遗留实例）：这里承载的是信息（第几小题/问数）而非禁用态，
     原 --text-disabled 实测亮 2.00:1 / 暗 1.98:1（背景 --border-subtle）→ 取与学生页修复同一令牌 --text-secondary。 */
  font-size: 10px; font-weight: 400; color: var(--text-secondary);
  background: var(--border-subtle); padding: 0 5px; border-radius:var(--radius-md);
}

/* 折叠动画 */
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
  border-radius:var(--radius-xs); font-size:var(--fs-caption); font-weight: 600;
  cursor: pointer;
  border: 2px solid transparent;
  user-select: none;
  flex-shrink: 0;
}

/* 正确：绿色 */
.n-box-correct {
  background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg);
}
/* 错误：红色 */
.n-box-wrong {
  background: var(--status-danger-bg); border-color: var(--status-danger-bd); color: var(--status-danger-fg);
}
/* 部分正确：橙色 */
.n-box-partial {
  background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg);
}
/* 未答/未评分：灰色 */
.n-box-empty {
  background: var(--bg-surface); border-color: var(--border-default); color: var(--text-disabled);
}

/* 当前激活 */
.n-box.n-box-active {
  border-color: var(--brand-600);
  background: var(--brand-50);
  color: var(--brand-600);
  box-shadow: var(--ring-focus);
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
  font-size:var(--fs-body-sm); font-weight: 500; color: var(--text-secondary);
  cursor: pointer; user-select: none;
  background: var(--bg-surface); border-radius:var(--radius-md); border: 1px solid var(--border-subtle);
}
.rp-material-bar:hover { background: var(--bg-sunken); }
.material-arrow { margin-left: auto; font-size: 10px; transition: transform .2s; }
.material-arrow.open { transform: rotate(180deg); }
.rp-material-body { overflow: hidden; }
.rp-material-inner { padding: 12px 16px; background: var(--bg-surface-2); border-radius: 0 0 8px 8px; }
.collapse-enter-active, .collapse-leave-active { transition: all .25s ease; }
.collapse-enter-from, .collapse-leave-to { opacity: 0; max-height: 0; }
.collapse-enter-to, .collapse-leave-from { opacity: 1; max-height: 800px; }

/* 题目区段 */
.sq-section {
  margin-top: 24px; padding: 20px 24px;
  background: var(--bg-surface); border-radius:var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-xs);
  scroll-margin-top: 16px;
}
.sq-header {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 12px; margin-bottom: 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.sq-num { font-size:var(--fs-title-3); font-weight: 700; color: var(--text-primary); }
.sq-score { margin-left: auto; font-size:var(--fs-body); font-weight: 600; color: var(--brand-600); }
.sq-status-spacer { flex: 1; }
.sq-stem { margin-bottom: 16px; }

/* 学生答案标签 */
.sq-answer-label {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; background: var(--bg-surface-2);
  border: 1px solid var(--border-default); border-bottom: none;
  border-radius:var(--radius-sm) 6px 0 0;
}
.label-text { font-size:var(--fs-body-sm); font-weight: 600; color: var(--text-tertiary); }

/* 编辑器 */
.sq-editor-wrap {
  border: 1px solid var(--border-default); border-radius: 0 0 6px 6px;
  overflow: hidden;
}
.sq-editor-wrap :deep(.monaco-editor) { border: none; }

/* 客观题小问卡片 */
.oi-card {
  margin-bottom: 14px; padding: 14px 16px;
  border: 2px solid var(--border-subtle); border-radius:var(--radius-md);
  scroll-margin-top: 16px;
  transition: border-color .2s;
}
.oi-card.oi-correct { border-color: var(--status-success-bd); background: var(--status-success-bg); }
.oi-card.oi-wrong { border-color: var(--status-danger-bd); background: var(--status-danger-bg); }
.oi-card:last-child { margin-bottom: 0; }
.oi-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
}
.oi-num { font-weight: 700; font-size:var(--fs-body); }
.oi-score { font-size:var(--fs-caption); color: var(--brand-600); font-weight: 600; }
.oi-judge { margin-left: auto; font-size:var(--fs-body-sm); font-weight: 600; }
.oi-judge.correct { color: var(--status-success-fg); }
.oi-judge.wrong { color: var(--status-danger-fg); }
.oi-judge.unanswered { color: var(--text-disabled); }
.oi-stem { font-size:var(--fs-body); line-height: 1.7; margin-bottom: 10px; white-space: pre-wrap; }
.oi-stem-code { font-family: monospace; font-size:var(--fs-body-sm); background: var(--bg-sunken); padding: 8px 12px; border-radius:var(--radius-sm); }

/* 答案对比 */
.oi-compare { margin-top: 8px; padding-top: 10px; border-top: 1px dashed var(--border-subtle); }
.oi-compare-row {
  display: flex; align-items: flex-start; gap: 8px;
  font-size:var(--fs-body-sm); line-height: 1.6; margin-bottom: 4px;
}
.oi-compare-row:last-child { margin-bottom: 0; }
.oi-compare-tag {
  flex-shrink: 0; font-size: 10px; font-weight: 600;
  padding: 1px 6px; border-radius:var(--radius-xs);
}
.oi-compare-tag.student { background: var(--status-danger-bg); color: var(--status-danger-fg); }
.oi-compare-tag.correct { background: var(--status-success-bg); color: var(--status-success-fg); }
.oi-wrong-text { color: var(--status-danger-fg); font-weight: 600; }

/* 主观题审核区 */
.sq-review-box {
  margin-top: 12px; padding: 12px 14px;
  background: var(--bg-surface-2); border-radius:var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.sq-review-bar {
  display: flex; align-items: center; gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.sq-review-label { font-size:var(--fs-caption); font-weight: 600; color: var(--text-tertiary); }
.sq-review-score { font-size:var(--fs-title-2); font-weight: 700; color: var(--brand-600); }
.sq-review-fb-row {
  display: flex; gap: 14px; margin-top: 10px;
  align-items: stretch;
}
.sq-review-fb-col {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
}
.sq-review-fb-label {
  display: block; font-size: 11px; font-weight: 600; color: var(--text-tertiary);
  margin-bottom: 4px; flex-shrink: 0;
}
.sq-review-fb-ai {
  flex: 1; font-size:var(--fs-body-sm); color: var(--text-secondary); line-height: 1.7;
  white-space: pre-wrap; overflow-y: auto;
  padding: 8px 10px; background: var(--bg-surface); border-radius:var(--radius-xs);
  border: 1px solid var(--border-subtle);
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
  background: var(--bg-surface-2); border-radius:var(--radius-sm);
  border: 1px solid var(--border-subtle);
}
.sq-review-label { font-size:var(--fs-caption); font-weight: 600; color: var(--text-tertiary); }
.sq-review-score { font-size:var(--fs-title-2); font-weight: 700; color: var(--brand-600); }
.sq-review-inline .ant-input-number { flex-shrink: 0; }

/* 底部审核 bar */
.rp-submit-bar {
  display: flex; align-items: center; gap: 16px;
  margin-top: 24px; margin-bottom: 40px;
  padding: 16px 24px;
  background: var(--bg-surface); border-radius:var(--radius-lg);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
  position: sticky; bottom: 0; z-index: 10;
}
.rp-submit-info { flex: 1; font-size:var(--fs-body); color: var(--text-tertiary); }

/* 通用 */
.q-content { font-size:var(--fs-body-lg); line-height: 1.8; }
/* ===== Workbench 壳（Wave 3 / 05-page-specs T3）：≥1200px 三栏，<1200px 右栏抽屉 ===== */
.wb-shell { position: relative; }
.wb-body { align-items: stretch; }
.wb-left { flex: 0 0 220px; }
.wb-mid { flex: 1 1 auto; min-width: 0; }
.wb-right {
  flex: 0 0 384px; width: 384px; min-width: 0;
  transition: flex-basis var(--duration-base) var(--ease-out), width var(--duration-base) var(--ease-out);
  display: flex; flex-direction: column;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-default);
  overflow: hidden;
}
.wb-right-head {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.wb-right-title { font-size: var(--fs-body-sm); font-weight: 600; color: var(--text-secondary); }
.wb-right-head .ant-btn { margin-left: auto; }
.wb-right-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-3); }
.wb-right.is-collapsed { flex: 0 0 44px; width: 44px; }
.wb-right.is-collapsed .wb-right-head { flex-direction: column; align-items: center; padding: 10px 6px; }
.wb-right.is-collapsed .wb-right-title { display: none; }
.wb-collapse-btn {
  margin-left: auto;
  height: var(--control-h-sm);
  padding: 0 var(--space-2);
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  cursor: pointer;
}
.wb-collapse-btn:hover { background: var(--bg-hover); }
.wb-panel-enter-active, .wb-panel-leave-active { transition: opacity var(--duration-base) var(--ease-out); }
.wb-panel-enter-from, .wb-panel-leave-to { opacity: 0; }
.wb-panel-section + .wb-panel-section { margin-top: var(--space-3); }
.wb-panel-head { margin-bottom: 6px; font-size: var(--fs-caption); font-weight: 600; color: var(--text-tertiary); }
.wb-final-score { width: 90px; margin-left: auto; }
.wb-final-label { font-size: var(--fs-caption); color: var(--text-tertiary); }
/* 384px 栏宽内竖排（纯布局，不改任何交互与请求） */
.wb-right-body .sq-review-fb-row { flex-direction: column; }
.wb-drawer-toggle { display: none; }
@media (max-width: 1199px) {
  .wb-right {
    position: fixed; top: var(--layout-topbar-h); right: 0; bottom: 0;
    width: 384px; max-width: 92vw; z-index: var(--z-drawer);
    transform: translateX(100%);
    transition: transform var(--duration-base) var(--ease-out);
    box-shadow: var(--shadow-lg);
  }
  .wb-right.open { transform: translateX(0); }
  .wb-right.is-collapsed { flex: none; width: 384px; }
  .wb-right.is-collapsed .wb-right-head { flex-direction: row; align-items: center; padding: 10px 14px; }
  .wb-right.is-collapsed .wb-right-title { display: inline; }
  .wb-drawer-toggle {
    display: inline-flex; align-items: center; gap: var(--space-1);
    position: fixed; right: var(--space-4); bottom: var(--space-4); z-index: var(--z-sticky);
    height: var(--control-h-lg); padding: 0 var(--space-4);
    background: var(--btn-primary-bg); color: var(--btn-primary-fg);
    border: none; border-radius: var(--radius-pill); cursor: pointer;
    font-size: var(--fs-body); box-shadow: var(--shadow-md);
  }
}
</style>
