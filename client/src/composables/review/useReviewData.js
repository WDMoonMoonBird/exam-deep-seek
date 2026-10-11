/**
 * useReviewData.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B2，源行 259-282 / 323 / 439-465 / 595-613）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * 注意：本页有四条形态轴（practice/exam × code/objective × narrow × 数据状态族）；
 *      模式真值源唯一（U2 的 data/isPracticeMode），本文件不得自行创建第二份。
 * 数据所有权唯一（方案 §1.5-A1）：data/isPracticeMode 是模式真值源，跨单元一律以参数注入同一引用。
 * fetch 的 route.params.id 读取位置逐字保留在函数体内（不得提升为 setup 期常量、不得改形参）；
 * fetch 与浏览器全局同名 —— ④ 自由标识符扫描对它全盲（方案 §4.4-B-1），由 ⑤ T9 兜住。
 */
import { ref, reactive, computed } from 'vue';
import DOMPurify from 'dompurify';
import request from '../../api/request.js';

export function useReviewData({ route }) {

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

// ===================== 辅助 =====================
const materialText = computed(() => {
  const m = q.value.material || '';
  return m.replace(/<[^>]*>/g, '').trim();
});
const safeMaterial = computed(() => DOMPurify.sanitize(q.value.material || ''));
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

function getSub(sqId) { return subMap.value[sqId] || null; }

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

  return {
    pageStatus, data, studentName, studentNo, schoolName, q, subQuestions, showMaterial,
    subMap, reviewScores, reviewFeedbacks, regrading, reviewingAll, publishingAll,
    materialText, safeMaterial, totalAiScore, isPracticeMode, displayStudentNo, getSub, fetch,
  };
}

export default useReviewData;
