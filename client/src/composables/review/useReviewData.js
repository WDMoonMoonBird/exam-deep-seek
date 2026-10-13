/**
 * useReviewData.js —— 由 client/src/views/teacher/ReviewDetail.vue 的 <script setup> 拆分而来
 * （step 7 / 批次 B2，源行 259-282 / 323 / 439-465 / 595-613）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动（导出集中在文末）。
 * ★R3-D9（t17 / F-C4-2）：本页**不再有「模式」真值源** —— 原先的 isPracticeMode（读 assignment.mode）
 *      已删除：控件显隐不再由作业模式决定（历史「练习」作业同样要显示保存审核/发布成绩/批量按钮），
 *      行为差异统一由三开关（是否允许重交+次数 / 计分口径 / 答案可见性）与提交状态表达。
 * 注意：本页仍有多条形态轴（code/objective × narrow × 数据状态族）。
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
    materialText, safeMaterial, totalAiScore, displayStudentNo, getSub, fetch,
  };
}

export default useReviewData;
