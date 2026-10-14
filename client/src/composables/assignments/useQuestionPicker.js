/**
 * useQuestionPicker.js —— 由 client/src/views/teacher/Assignments.vue 拆分而来（R2-B64 / t4）
 * 职责：布置作业弹窗的「② 题目」区 —— 题目检索、单选（radio 与整行点击共用）、选择列的可访问名称补写。
 * 源：:476-505（题目态 + labelQuestionRadios + onUpdated/watch）、:526-532（qCols）、:551-573（search/onQSelect/questionRow/changeQuestion）。
 * 行为不变：请求路径与 params（pageSize 100）、selection 语义、列定义、aria-label 写法、onUpdated 时机逐字保持。
 */
import { ref, computed, onUpdated, watch, nextTick, h } from 'vue';
import request from '../../api/request.js';
import { useSafeRequest } from '../useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡

export function useQuestionPicker({ visible }) {
  const { safeLoad } = useSafeRequest({ tag: 'useQuestionPicker.js' });
  const questions = ref([]);
  const qKeyword = ref('');
  const selectedQIds = ref([]);
  const pickTouched = ref(false);
  /** 源 :438-439 —— 已选题目记录：选中后题目区收成一张卡（可「换一题」），避免表格滚出视野后看不到选了什么 */
  const selectedQ = ref(null);

  /** 源 :482-483 —— ⑥ 选择列的只读屏列标题（VNode：antd 的 columnTitle 支持 string|VNode；用隐藏 span 保证视觉零变化） */
  const qSelectColumnTitle = h('span', { class: 'visually-hidden' }, '选择题目');

  /* 源 :526-532 —— 补「类型 / 满分」两列：字段来自弹窗已在取的 GET /teacher/questions（type / maxScore） */
  const qCols = [
    { title: '标题', dataIndex: 'title', width: 260, ellipsis: true },
    { title: '类型', dataIndex: 'type', width: 96 },
    { title: '难度', dataIndex: 'difficulty', width: 88 },
    { title: '满分', dataIndex: 'maxScore', width: 88, align: 'right' },
  ];

  /** 源 :485-503 —— antd Table 内部渲染的选择列拿不到声明式入口 ⇒ 弹窗渲染后按行标题把 aria-label 补到 input 上 */
  function labelQuestionRadios() {
    if (!visible.value) return;
    const rows = document.querySelectorAll('.assign-modal .ant-table-tbody > tr.ant-table-row');
    rows.forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      const title = (tds[1] ? tds[1].innerText : '').replace(/\s+/g, ' ').trim();
      const input = tr.querySelector('.ant-table-selection-column input[type="radio"], .ant-table-selection-column .ant-radio-input');
      if (!input || !title) return;
      const name = '选择题目：' + title.slice(0, 40);
      if (input.getAttribute('aria-label') !== name) input.setAttribute('aria-label', name);
    });
  }
  onUpdated(labelQuestionRadios);
  watch(visible, async (v) => { if (v) { await nextTick(); labelQuestionRadios(); } });

  async function searchQuestions() {
    const r = await safeLoad(() => request.get('/teacher/questions', { params: { keyword: qKeyword.value, pageSize: 100 } }), { action: '搜索题目' });
    if (r.error) return;   // ★失败就地提示：保留上一次结果，不把弹窗/页面打崩
    questions.value = (r.data && r.data.list) || [];
  }

  /** 源 :556-561 —— 单选：radio 点选与整行点击共用（原来点行不选中，必须精确点中圆点） */
  function onQSelect(keys, rows) {
    selectedQIds.value = keys;
    selectedQ.value = (rows && rows[0]) || questions.value.find((q) => q.id === keys[0]) || null;
    pickTouched.value = true;
  }
  /** 整行可点：把行点击接到同一个选择函数上 */
  function questionRow(record) {
    return {
      onClick: () => onQSelect([record.id], [record]),
      style: { cursor: 'pointer' },
    };
  }
  function changeQuestion() {
    selectedQIds.value = [];
    selectedQ.value = null;
    pickTouched.value = false;
  }

  /** 源 :445 —— 未选题目提示（原在表单校验区；状态归本题库，判定逐字未改） */
  const pickError = computed(() => pickTouched.value && !selectedQIds.value.length);

  return { questions, qKeyword, selectedQIds, selectedQ, pickTouched, pickError, qSelectColumnTitle, qCols, searchQuestions, onQSelect, questionRow, changeQuestion, labelQuestionRadios };
}
