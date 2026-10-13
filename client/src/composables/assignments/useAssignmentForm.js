/**
 * useAssignmentForm.js —— 由 client/src/views/teacher/Assignments.vue 拆分而来（R2-B64 / t4）
 * 职责：布置作业弹窗 —— 弹窗态、四组 touched/error、草稿（localStorage）、班级点选、时间预设、
 *       创建/提交（含 Q9 软警告二次确认）、放弃确认。
 * 源：:423-474（弹窗态/校验/派生/「套用上次」）、:476-524（表单数据、班级点选、下拉选项）、:534-549（openAdd）、
 *     :574-632（预设/套用上次/草稿）、:633-709（取消/班级加载/创建/提交）。
 * 行为不变：接口路径与请求体（mode='exam'、maxAttempts=null、confirmWithoutStandardPackage 二次提交）、
 *          草稿 key assign-draft-v1、全部提示文案与 h() 结构、submitting 复位、确认框文案逐字保持。
 * 偏差（与 D1 §1.2 分组的偏差，行为不受影响）：pickError 归 useQuestionPicker（状态属题库），
 *          toggleLock 归 useAssignmentsList（行操作），missing/deadlineText 保留为 computed（不做纯函数改写）。
 */
import { ref, reactive, computed, onBeforeUnmount, h } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import request from '../../api/request.js';
import { useConfirm } from '../useConfirm.js';
import { classCount } from './assignmentsPure.js';
import { useQuestionPicker } from './useQuestionPicker.js';

dayjs.locale('zh-cn');   // 源 :311（原在 setup 首行；模块级一次性设定，效果与拆分前一致）

export function useAssignmentForm({ list, onSaved }) {
  /** 命令式确认框（Wave 2 构件 useConfirm）：替代原 antd 命令式调用，行为等价 */
  const { confirm } = useConfirm();   // 源 :313-314

  // ===================== 布置作业向导（逻辑未改动） =====================
  const visible = ref(false);   // 源 :424

  const {
    questions, qKeyword, selectedQIds, selectedQ, pickTouched, pickError,
    qSelectColumnTitle, qCols, searchQuestions, onQSelect, questionRow, changeQuestion,
  } = useQuestionPicker({ visible });

  /* ===== 布置作业 v2：一页式表单 + 右侧实时摘要（约束：只改 UI · 题目单选 · 模式 UI 暂不显示） ===== */
  /** ≤768 时弹窗改为全屏 sheet（宽度走 prop，避免用 !important 盖 antd 的行内宽度；高度/圆角见文件末尾非 scoped 段） */
  const narrowMq = window.matchMedia('(max-width: 768px)');
  const isNarrow = ref(narrowMq.matches);
  const onNarrowChange = (e) => { isNarrow.value = e.matches; };
  narrowMq.addEventListener('change', onNarrowChange);
  onBeforeUnmount(() => narrowMq.removeEventListener('change', onNarrowChange));
  const modalWidth = computed(() => (isNarrow.value ? '100%' : 1040));
  const titleTouched = ref(false);
  const timeTouched = ref(false);
  const classTouched = ref(false);
  const draftRestored = ref(false);
  const DRAFT_KEY = 'assign-draft-v1';

  const titleError = computed(() => titleTouched.value && !timeForm.title.trim());
  const timeError = computed(() => timeTouched.value && !(timeForm.timeRange && timeForm.timeRange.length));
  const classError = computed(() => classTouched.value && !selectedCIds.value.length);
  /** 未就绪项：主按钮据此禁用，摘要卡据此显示「还差：…」（替代点提交才 toast「请填写完整」） */
  const missing = computed(() => {
    const m = [];
    if (!selectedQIds.value.length) m.push('题目');
    if (!selectedCIds.value.length) m.push('班级');
    if (!timeForm.title.trim()) m.push('作业标题');
    if (!(timeForm.timeRange && timeForm.timeRange.length)) m.push('起止时间');
    return m;
  });
  const deadlineText = computed(() => {
    const r = timeForm.timeRange;
    return r && r.length >= 2 ? r[1].format('MM-DD HH:mm') : '—';
  });
  const totalStudents = computed(() => selectedCIds.value.reduce((sum, id) => {
    const c = avalClasses.value.find((x) => x.id === id);
    return sum + classCount(c);
  }, 0));
  /** 「套用上次」：取自列表页已加载的最近一条作业（assignmentClasses[].classId / startTime / endTime） */
  const lastAssignment = computed(() => list.value[0] || null);
  const lastClasses = computed(() => ((lastAssignment.value && lastAssignment.value.assignmentClasses) || [])
    .map((ac) => ac.classId)
    .filter((id) => avalClasses.value.some((c) => c.id === id)));
  const lastTime = computed(() => {
    const a = lastAssignment.value;
    return a && a.startTime && a.endTime ? [dayjs(a.startTime), dayjs(a.endTime)] : null;
  });
  const submitting = ref(false);
  const avalClasses = ref([]);
  const selectedCIds = ref([]);
  const classSearch = ref('');

  const filteredClasses = computed(() => {
    if (!classSearch.value) return avalClasses.value;
    const kw = classSearch.value.toLowerCase();
    return avalClasses.value.filter(c => c.name.toLowerCase().includes(kw));
  });
  /** 班级筛选下拉：复用向导已加载的班级列表，避免重复请求 */
  const classOptions = computed(() => avalClasses.value.map(c => ({
    value: c.id,
    label: c.isTeamClass ? c.name + '（团队）' : c.name,
  })));

  function toggleClass(id) {
    const idx = selectedCIds.value.indexOf(id);
    if (idx >= 0) selectedCIds.value.splice(idx, 1);
    else selectedCIds.value.push(id);
  }
  /* 模式 UI 暂不显示 → 去掉了 isPractice / maxAttempts；提交口径仍是 mode='exam'、maxAttempts=null */
  const timeForm = reactive({ title: '', description: '', timeRange: [], allowResubmit: false });

  async function openAdd() {
    submitting.value = false;
    selectedQIds.value = [];
    selectedCIds.value = [];
    selectedQ.value = null;
    Object.assign(timeForm, { title: '', description: '', timeRange: [], allowResubmit: false });
    titleTouched.value = false;
    timeTouched.value = false;
    pickTouched.value = false;
    classTouched.value = false;
    draftRestored.value = false;
    // 先取题目与班级，草稿恢复需要两份列表做校验（只认仍然存在的题目/班级）
    await Promise.all([searchQuestions(), loadClasses()]);
    if (!restoreDraft()) applyPreset(0);   // 没有草稿 → 默认「今天 18:00 ~ 一周后 23:59」
    visible.value = true;
  }

  /** 时间快捷预设（纯前端计算） */
  function applyPreset(i) {
    const now = dayjs();
    timeForm.timeRange = i === 0
      ? [now.hour(18).minute(0).second(0), now.add(7, 'day').hour(23).minute(59).second(0)]
      : [now.add(1, 'day').hour(8).minute(0).second(0), now.add(3, 'day').hour(23).minute(59).second(0)];
    timeTouched.value = true;
  }
  function applyLastClasses() {
    const ids = lastClasses.value;
    if (!ids.length) return;
    selectedCIds.value = ids.slice();
    classTouched.value = true;
  }
  function applyLastTime() {
    if (!lastTime.value) return;
    timeForm.timeRange = lastTime.value;
    timeTouched.value = true;
  }
  /* ===== 草稿（纯 localStorage，不涉及后端）===== */
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        title: timeForm.title,
        description: timeForm.description,
        allowResubmit: timeForm.allowResubmit,
        timeRange: (timeForm.timeRange || []).map((d) => d.toISOString()),
        classIds: selectedCIds.value.slice(),
        questionIds: selectedQIds.value.slice(),
        savedAt: Date.now(),
      }));
    } catch { /* 隐私模式等写不进去：静默忽略，不影响主流程 */ }
  }
  function saveDraftAndClose() {
    saveDraft();
    message.success('已存为草稿');
    visible.value = false;
  }
  function restoreDraft() {
    let raw = null;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch { return false; }
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      timeForm.title = d.title || '';
      timeForm.description = d.description || '';
      timeForm.allowResubmit = !!d.allowResubmit;
      timeForm.timeRange = (d.timeRange || []).map((s) => dayjs(s));
      selectedCIds.value = (d.classIds || []).filter((id) => avalClasses.value.some((c) => c.id === id));
      selectedQIds.value = (d.questionIds || []).filter((id) => questions.value.some((q) => q.id === id));
      selectedQ.value = questions.value.find((q) => q.id === selectedQIds.value[0]) || null;
      draftRestored.value = true;
      return true;
    } catch { return false; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* 同上 */ }
    draftRestored.value = false;
  }
  /** 关闭弹窗：有未保存内容先确认一次（原实现 destroyOnClose 直接丢弃） */
  function onCancel() {
    const dirty = !!(timeForm.title.trim() || timeForm.description.trim() || selectedQIds.value.length || selectedCIds.value.length);
    if (!dirty) { visible.value = false; return; }
    confirm({
      title: '放弃这次布置？',
      content: '已填写的内容不会保存（也可以选「存为草稿」下次继续）。',
      okText: '放弃',
      okType: 'danger',
      cancelText: '继续编辑',
      onOk: () => { visible.value = false; },
    });
  }
  async function loadClasses() { const r = await request.get('/teacher/classes'); avalClasses.value = r.data; }

  /** 提交布置作业请求；confirmWithoutStandardPackage=true 表示教师已在确认框点「确认布置」（开放性题目） */
  async function createAssignment(confirmWithoutStandardPackage) {
    const payload = {
      title: timeForm.title, description: timeForm.description,
      startTime: timeForm.timeRange[0].toISOString(), endTime: timeForm.timeRange[1].toISOString(),
      // 模式 UI 暂不显示：口径与改前「非练习态」完全一致（mode='exam'、maxAttempts=null）
      allowResubmit: timeForm.allowResubmit,
      mode: 'exam',
      maxAttempts: null,
      questionIds: selectedQIds.value.slice(), classIds: selectedCIds.value.slice(),
    };
    if (confirmWithoutStandardPackage) payload.confirmWithoutStandardPackage = true;
    await request.post('/teacher/assignments', payload);
    message.success('布置成功');
    clearDraft();          // 布置成功即清掉草稿，避免下次误恢复
    visible.value = false;
    onSaved();
  }

  /**
   * 布置作业（Q9 软警告）：
   * 题目未上传标准工程包时后端返回 code=1007 + data.warnings（不创建作业），
   * 这里用确认框列出这些题目并说明将按开放性题目评分；确认后带
   * confirmWithoutStandardPackage=true 重新提交，取消则不创建。
   * 有标准包的题目后端直接创建，不会走到确认框。
   */
  async function submit() {
    // 主按钮在未就绪时是禁用的；这里再兜一层，并把未就绪项说清楚（原来的提示只有「请填写完整」）
    titleTouched.value = true;
    timeTouched.value = true;
    pickTouched.value = true;
    classTouched.value = true;
    if (missing.value.length) return message.warn('还差：' + missing.value.join('、'));
    if (submitting.value) return;
    submitting.value = true;
    try {
      await createAssignment(false);
    } catch (err) {
      const resp = err?.response?.data;
      // 非「需确认」类错误（参数错误/网络错误等）由 request 拦截器统一提示
      if (resp?.code !== 1007 || !resp?.data?.requiresConfirmation) return;
      const warnings = resp.data.warnings || [];
      const names = warnings.map(w => w.title).join('、');
      confirm({
        title: '确认按开放性题目布置',
        content: h('div', { style: 'line-height:1.7' }, [
          h('div', '以下题目未上传标准工程包，AI 将仅依据评分标准做评价式评分（不与参考答案对比）：' + names + '。确认按开放性题目布置？'),
          h('ul', { style: 'margin:8px 0 0;padding-left:18px;color:var(--text-tertiary);font-size:var(--fs-body-sm)' },
            warnings.filter(w => w.message).map(w => h('li', w.message))),
        ]),
        okText: '确认布置',
        cancelText: '取消',
        onOk: async () => {
          try {
            await createAssignment(true);
          } catch {
            // 二次提交失败：原因已由 request 拦截器提示；吞掉 rejection 关闭确认框，避免重复提交
          }
        },
      });
    } finally { submitting.value = false; }
  }

  return {
    visible, modalWidth, timeForm, titleTouched, timeTouched, pickTouched, classTouched,
    titleError, timeError, pickError, classError, missing, deadlineText, totalStudents,
    lastClasses, lastTime, submitting, draftRestored, selectedQ,
    avalClasses, selectedCIds, classSearch, filteredClasses, classOptions, toggleClass,
    questions, qKeyword, qCols, qSelectColumnTitle, selectedQIds, searchQuestions, onQSelect, questionRow, changeQuestion,
    openAdd, onCancel, submit, saveDraftAndClose, clearDraft, loadClasses, applyPreset,
    applyLastClasses, applyLastTime,
  };
}
