<template>
  <PageShell
    title="作业管理"
    description="布置作业、跟踪提交与评分进度；AI 评分完成后会自动推送到「评分审核」。"
  >
    <template #actions>
      <a-button @click="fetch">刷新</a-button>
      <a-button type="primary" @click="openAdd">布置作业</a-button>
    </template>

    <!-- KPI：只用后端真实返回的数据（docs/ui-redesign/06-api-gap.md §5 已剔除示意数字） -->
    <template #kpi>
      <section class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">作业总数</div>
          <div class="kpi-value tnum">{{ pagination.total }}<small>份</small></div>
          <div class="kpi-sub">{{ hasFilter ? '当前筛选结果' : '全部作业' }}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">待审核提交</div>
          <div class="kpi-value tnum tone-warn">{{ summary.pendingReview }}<small>份</small></div>
          <div class="kpi-sub">与「评分审核」页数字同源</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">AI 评分中</div>
          <div class="kpi-value tnum">{{ summary.aiPending }}<small>份</small></div>
          <div class="kpi-sub">{{ summary.abnormal ? summary.abnormal + ' 份评分异常' : '无异常' }}</div>
        </div>
      </section>
    </template>

    <!-- 服务端分页 + 服务端筛选：/teacher/assignments 支持 page / pageSize / keyword / classId / status -->
    <ListPage
      :columns="columns"
      :data-source="list"
      :loading="loading"
      row-key="id"
      :total="pagination.total"
      :current="pagination.current"
      :page-size="pagination.pageSize"
      :empty-title="hasFilter ? '没有符合条件的作业' : '还没有布置过作业'"
      :empty-desc="hasFilter ? '换个关键词或清空筛选后再试。' : '从题库选择题目并指定班级，学生即可在作业列表中看到它。'"
      :empty-action-text="hasFilter ? '清空筛选' : '布置第一份作业'"
      @page-change="onPageChange"
      @empty-action="onEmptyAction"
    >
      <template #toolbar>
        <a-input-search
          v-model:value="filters.keyword"
          placeholder="搜索作业名称"
          allow-clear
          class="w-260"
          @search="applyFilters"
        />
        <!-- T5-A2：无可见 label；placeholder 不算可访问名称，aria-label 又落不到 combobox 上 → 隐藏 label + for/id -->
        <label for="tch-assign-class-filter" class="visually-hidden">按班级筛选</label>
        <a-select
          id="tch-assign-class-filter"
          v-model:value="filters.classId"
          placeholder="全部班级"
          allow-clear
          class="w-200"
          :options="classOptions"
          @change="applyFilters"
        />
        <label for="tch-assign-status-filter" class="visually-hidden">按状态筛选</label>
        <a-select
          id="tch-assign-status-filter"
          v-model:value="filters.status"
          placeholder="全部状态"
          allow-clear
          class="w-160"
          :options="statusOptions"
          @change="applyFilters"
        />
        <a-button v-if="hasFilter" type="link" @click="resetFilters">重置</a-button>
      </template>

      <template #toolbar-right>
        <span class="muted">共 {{ pagination.total }} 份</span>
      </template>

      <template #bodyCell="{ column, record }">
        <!-- 主键列：两行式（主 = 作业标题；次 = 共 N 题）。练习/锁定徽标留在主行原位——
             徽标是 inline-flex，不改变标题行的行盒高度，故行高与其它两行单元格一致 -->
        <template v-if="column.key === 'title'">
          <span class="lp-stack">
            <b :title="record.title">{{ record.title }} <StatusTag v-if="record.mode === 'practice'" tone="accent" text="练习" /><lock-outlined v-if="record.locked" class="lock-icon" title="已锁定" /></b>
            <span>共 {{ record._count?.assignmentQuestions || 0 }} 题</span>
          </span>
        </template>

        <template v-else-if="column.key === 'classes'">
          <StatusTag v-for="ac in visibleClasses(record)" :key="ac.classId" tone="neutral" :text="ac.class?.name" />
          <span v-if="hiddenClassCount(record) > 0" class="chip-more">+{{ hiddenClassCount(record) }}</span>
          <span v-if="!record.assignmentClasses?.length" class="muted">—</span>
        </template>

        <!-- 提交进度：迷你进度条 + 精确值（全部提交 → track 转绿 is-ok）；口径仍由 progressOf 决定，数字未改 -->
        <template v-else-if="column.key === 'progress'">
          <span class="lp-progress">
            <span class="lp-track" :class="{ 'is-ok': allSubmitted(record) }"><i :style="{ width: progressOf(record).percent + '%' }"></i></span>
            <span class="lp-num">{{ progressOf(record).done }}<u>/{{ progressOf(record).total }}</u></span>
          </span>
        </template>

        <template v-else-if="column.key === 'status'">
          <StatusTag :tone="rowStatus(record).tone" :text="rowStatus(record).text" dot />
          <router-link
            v-if="record.pendingReviewCount > 0"
            class="tag-link"
            :to="{ path: '/teacher/review' }"
          ><StatusTag tone="warning" :text="'待审核 ' + record.pendingReviewCount" /></router-link>
        </template>

        <!-- 截止时间：日期 + 时间固定两行（与「创建时间」列同款 is-plain）；时间维度的语义由「状态」列承担 -->
        <template v-else-if="column.key === 'deadline'">
          <span class="lp-stack is-plain">
            <b>{{ splitDateTime(record.endTime).date }}</b>
            <span>{{ splitDateTime(record.endTime).time }}</span>
          </span>
        </template>

        <template v-else-if="column.key === 'action'">
          <div class="lp-actions">
            <a-button type="link" size="small" @click="toggleLock(record)">
              {{ record.locked ? '解锁' : '锁定' }}
            </a-button>
          </div>
        </template>
      </template>
    </ListPage>

    <a-modal title="布置作业" :open="visible" @cancel="visible = false" :width="820" :footer="null" :destroyOnClose="true" wrap-class-name="assign-modal">
      <a-steps :current="step" class="steps">
        <a-step title="选题" /><a-step title="选班" /><a-step title="设置时间" />
      </a-steps>

      <div v-if="step === 0">
        <a-input-search v-model:value="qKeyword" placeholder="搜索题目" class="mb20" @search="searchQuestions" />
        <!-- B3-1 ⑥：rowSelection.columnTitle 给 antd 自动生成的选择列一个「只读屏」列标题 →
             消除 axe empty-table-header（<th class="ant-table-selection-column"> 改前为空）。视觉零变化。 -->
        <a-table :columns="qCols" :dataSource="questions" rowKey="id" size="small" :scroll="{ x: 'max-content' }" :rowSelection="{ selectedRowKeys: selectedQIds, onChange: onQSelect, type: 'radio', columnTitle: qSelectColumnTitle }" :pagination="false">
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'difficulty'">{{ difficultyText(record.difficulty) }}</template>
          </template>
        </a-table>
      </div>

      <div v-if="step === 1" class="class-pick">
        <div class="pick-panel">
          <div class="pick-panel-title">可选班级</div>
          <a-input-search v-model:value="classSearch" placeholder="搜索班级" size="small" />
          <div class="pick-list">
            <div v-for="c in filteredClasses" :key="c.id"
              :class="['pick-item', { on: selectedCIds.includes(c.id) }]"
              @click="toggleClass(c.id)">
              <span>{{ c.name }}<StatusTag v-if="c.isTeamClass" tone="accent" text="团队" /></span>
              <CheckOutlined v-if="selectedCIds.includes(c.id)" class="pick-check" />
            </div>
            <a-empty v-if="!filteredClasses.length" :image="false" description="无匹配班级" />
          </div>
        </div>
        <div class="pick-panel">
          <div class="pick-panel-title">已选 {{ selectedCIds.length }} 个班</div>
          <div class="pick-list">
            <!-- T4-F2 类别收口：团队班走 purple 预置色（暗 3.39:1）→ 团队班加 .tag-accent；普通班 blue 亮 5.50 / 暗 4.91 达标保持预置色 -->
            <a-tag v-for="cid in selectedCIds" :key="cid" closable @close="toggleClass(cid)" :color="classTeamMap[cid] ? 'purple' : 'blue'" :class="classTeamMap[cid] ? 'tag-accent' : null">
              {{ classNameMap[cid] }}
              <span v-if="classTeamMap[cid]" class="pick-team"> · {{ classTeamMap[cid] }}</span>
            </a-tag>
            <a-empty v-if="!selectedCIds.length" :image="false" description="请从左侧选择" />
          </div>
        </div>
      </div>

      <div v-if="step === 2">
        <a-form :model="timeForm" layout="vertical">
          <a-form-item label="作业标题"><a-input v-model:value="timeForm.title" /></a-form-item>
          <a-form-item label="作业说明"><a-textarea v-model:value="timeForm.description" :rows="3" /></a-form-item>
          <a-form-item label="起止时间"><a-range-picker v-model:value="timeForm.timeRange" show-time :locale="dateLocale" /></a-form-item>
          <a-form-item label="练习模式"><a-switch :checked="timeForm.isPractice" @change="onPracticeToggle" /></a-form-item>
          <a-form-item v-if="timeForm.isPractice" label="允许提交次数">
            <a-input-number v-model:value="timeForm.maxAttempts" :min="1" placeholder="不限" class="w-120" />
            <span class="hint-inline">留空为不限次数</span>
          </a-form-item>
          <a-form-item v-if="!timeForm.isPractice" label="允许补交"><a-switch v-model:checked="timeForm.allowResubmit" /></a-form-item>
        </a-form>
      </div>

      <div class="step-actions">
        <a-button v-if="step > 0" @click="step--">上一步</a-button>
        <a-button v-if="step < 2" type="primary" @click="nextStep">下一步</a-button>
        <a-button v-if="step === 2" type="primary" :loading="submitting" @click="submit">提交</a-button>
      </div>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUpdated, nextTick, h } from 'vue';
import { message } from 'ant-design-vue';
import { CheckOutlined, LockOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import dateLocale from 'ant-design-vue/es/date-picker/locale/zh_CN';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { useConfirm } from '../../composables/useConfirm.js';
import { splitDateTime, difficultyText, timeStatus } from '../../domain/format.js';

dayjs.locale('zh-cn');

/** 命令式确认框（Wave 2 构件 useConfirm）：替代原 antd 命令式调用，行为等价 */
const { confirm } = useConfirm();

// ===================== 列表（Wave 1 试点：服务端筛选 + 真实进度 + 状态语义） =====================
const loading = ref(false);
const list = ref([]);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
const filters = reactive({ keyword: '', classId: undefined, status: undefined });
/** 待审核汇总：与「评分审核」页同源（Batch1 GET /teacher/pending-summary） */
const summary = reactive({ pendingReview: 0, aiPending: 0, abnormal: 0 });
const hasFilter = computed(() => !!(filters.keyword || filters.classId || filters.status));

/** 状态筛选取值必须与后端 buildAssignmentStatusWhere 的语义一致（时间维度与锁定维度互相独立） */
const statusOptions = [
  { value: 'ongoing', label: '进行中' },
  { value: 'upcoming', label: '未开始' },
  { value: 'ended', label: '已结束' },
  { value: 'locked', label: '已锁定' },
];

// 列表样式 v2：主键列两行式（标题 + 共 N 题，题数列已并入次行）；提交进度改迷你进度条；
// 截止时间固定两行；状态/班级沿用既有标签写法（仅列宽收敛）
const columns = [
  { title: '作业名称', key: 'title', width: 260 },
  { title: '班级', key: 'classes', width: 180, responsive: ['xl'] },
  { title: '提交进度', key: 'progress', width: 190 },
  // 状态列宽保持 170：150 时「已结束 + 待审核 N」两枚标签差 2px 放不下会折成两行（行高 75 > 70），
  // 实测 170 → 实际列宽 180 / 内容区 148 > 所需 132，稳定单行
  { title: '状态', key: 'status', width: 170 },
  { title: '截止时间', key: 'deadline', width: 120 },
  { title: '操作', key: 'action', width: 100, align: 'right' },
];

/** 行状态：锁定优先，其次按时间；「待审核 N」单独一枚标签（数据源= pendingReviewCount） */
function rowStatus(record) {
  if (record.locked) return { text: '已锁定', tone: 'neutral' };
  const s = timeStatus(record.startTime, record.endTime);
  if (s === 'upcoming') return { text: '未开始', tone: 'neutral' };
  if (s === 'ended') return { text: '已结束', tone: 'neutral' };
  return { text: '进行中', tone: 'success' };
}

/**
 * 提交进度：分子 submissionCount 与分母 expectedCount 同 population（作业全部关联班级）——
 * 口径由后端保证，前端不要与 pendingReviewCount 混用（后者仅统计教师可见班级）。
 */
function progressOf(record) {
  const done = record.submissionCount || 0;
  const total = record.expectedCount || 0;
  return { done, total, percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0 };
}

/** 全部提交（进度条 track 转绿 is-ok）：应交 0 人的作业不算「已全交」，避免空进度条显示为完成色 */
function allSubmitted(record) {
  const { done, total } = progressOf(record);
  return total > 0 && done >= total;
}

function visibleClasses(record) {
  return (record.assignmentClasses || []).slice(0, 2);
}
function hiddenClassCount(record) {
  return Math.max(0, (record.assignmentClasses || []).length - 2);
}

async function fetchSummary() {
  try {
    const r = await request.get('/teacher/pending-summary');
    Object.assign(summary, r.data || {});
  } catch {
    // KPI 是辅助信息，失败不阻塞列表（错误提示由 request 拦截器统一处理）
  }
}

async function fetch() {
  loading.value = true;
  try {
    const params = { page: pagination.current, pageSize: pagination.pageSize };
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.classId) params.classId = filters.classId;
    if (filters.status) params.status = filters.status;
    const [r] = await Promise.all([request.get('/teacher/assignments', { params }), fetchSummary()]);
    list.value = r.data.list || [];
    pagination.total = r.data.total || 0;
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  pagination.current = 1;
  fetch();
}
function resetFilters() {
  filters.keyword = '';
  filters.classId = undefined;
  filters.status = undefined;
  applyFilters();
}
function onPageChange(page) {
  pagination.current = page;
  fetch();
}

/** 空态按钮：有筛选 → 清空筛选；无数据 → 布置第一份作业 */
function onEmptyAction() {
  if (hasFilter.value) resetFilters();
  else openAdd();
}

// ===================== 布置作业向导（逻辑未改动） =====================
const visible = ref(false);
const step = ref(0);
const submitting = ref(false);
const questions = ref([]);
const qKeyword = ref('');
const selectedQIds = ref([]);
const avalClasses = ref([]);
const selectedCIds = ref([]);
const classSearch = ref('');
/** ⑥ 选择列的只读屏列标题（VNode：antd 的 columnTitle 支持 string|VNode；用隐藏 span 保证视觉零变化） */
const qSelectColumnTitle = h('span', { class: 'visually-hidden' }, '选择题目');

/**
 * ⑥ 行内「单选」的可访问名称（改前 axe label 命中 = 每个题目行 1 处，9 行即 9 处）：
 * antd 的 Radio 把透传 attrs 渲染到外层 <label class="ant-radio-wrapper">（CDP 实测 aria-label 落不到
 * role=radio 的 input），而选择列由 antd Table 内部渲染、页面拿不到声明式入口 → 在弹窗渲染后按行标题
 * 把 aria-label 补到 input 上（与 t11/t12 对 antd 内部控件的做法一致：先试声明式，落不到才补 DOM）。
 * 只写 aria-label 属性：勾选行为、受控状态与视觉完全不变。
 */
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

const filteredClasses = computed(() => {
  if (!classSearch.value) return avalClasses.value;
  const kw = classSearch.value.toLowerCase();
  return avalClasses.value.filter(c => c.name.toLowerCase().includes(kw));
});
const classNameMap = computed(() => {
  const m = {};
  avalClasses.value.forEach(c => { m[c.id] = c.name; });
  return m;
});
const classTeamMap = computed(() => {
  const m = {};
  avalClasses.value.forEach(c => { if (c.isTeamClass) m[c.id] = c.ownerTeacherName; });
  return m;
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
const timeForm = reactive({ title: '', description: '', timeRange: [], allowResubmit: false, isPractice: false, maxAttempts: null });

const qCols = [
  { title: '标题', dataIndex: 'title', width: 250, ellipsis: true },
  { title: '难度', dataIndex: 'difficulty', width: 80 },
];

async function openAdd() {
  step.value = 0;
  submitting.value = false;
  selectedQIds.value = [];
  selectedCIds.value = [];
  Object.assign(timeForm, { title: '', description: '', timeRange: [], allowResubmit: false, isPractice: false, maxAttempts: null });
  await Promise.all([searchQuestions(), loadClasses()]);
  visible.value = true;
}

async function searchQuestions() {
  const r = await request.get('/teacher/questions', { params: { keyword: qKeyword.value, pageSize: 100 } });
  questions.value = r.data.list;
}

function onQSelect(keys) { selectedQIds.value = keys; }
async function loadClasses() { const r = await request.get('/teacher/classes'); avalClasses.value = r.data; }

function nextStep() {
  if (step.value === 0 && !selectedQIds.value.length) return message.warn('请选题');
  if (step.value === 1 && !selectedCIds.value.length) return message.warn('请选班');
  step.value++;
}

/** 提交布置作业请求；confirmWithoutStandardPackage=true 表示教师已在确认框点「确认布置」（开放性题目） */
async function createAssignment(confirmWithoutStandardPackage) {
  const payload = {
    title: timeForm.title, description: timeForm.description,
    startTime: timeForm.timeRange[0].toISOString(), endTime: timeForm.timeRange[1].toISOString(),
    allowResubmit: timeForm.isPractice ? true : timeForm.allowResubmit,
    mode: timeForm.isPractice ? 'practice' : 'exam',
    maxAttempts: timeForm.isPractice ? (timeForm.maxAttempts || null) : null,
    questionIds: selectedQIds.value, classIds: selectedCIds.value,
  };
  if (confirmWithoutStandardPackage) payload.confirmWithoutStandardPackage = true;
  await request.post('/teacher/assignments', payload);
  message.success('布置成功');
  visible.value = false;
  fetch();
}

/**
 * 布置作业（Q9 软警告）：
 * 题目未上传标准工程包时后端返回 code=1007 + data.warnings（不创建作业），
 * 这里用确认框列出这些题目并说明将按开放性题目评分；确认后带
 * confirmWithoutStandardPackage=true 重新提交，取消则不创建。
 * 有标准包的题目后端直接创建，不会走到确认框。
 */
async function submit() {
  if (!timeForm.title || !timeForm.timeRange.length) return message.warn('请填写完整');
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

async function toggleLock(record) {
  try {
    await request.put('/teacher/assignments/' + record.id + '/lock');
    record.locked = !record.locked;
    message.success(record.locked ? '已锁定' : '已解锁');
  } catch { message.error('操作失败'); }
}

function onPracticeToggle(checked) {
  if (!checked) { timeForm.isPractice = false; return; }

  const items = [
    { title: '学生可重复提交', desc: '在设定的次数范围内，学生可多次提交答案' },
    { title: '自动出分，跳过审核', desc: '学生提交后，系统自动评分并直接显示分数和评语，无需教师审核和发布' },
    { title: '保留最高分', desc: '多次提交中，系统自动保留最高的一次成绩' },
    { title: '教师仍可查看', desc: '练习模式下教师仍可查看学生答题情况和系统评分' },
  ];

  const content = h('div', { style: 'padding:4px 0' }, [
    h('p', { style: 'margin:0 0 16px;color:var(--text-secondary);font-size:var(--fs-body)' }, '开启后，该作业将变为练习模式：'),
    ...items.map((item, i) =>
      h('div', { style: 'display:flex;align-items:flex-start;gap:12px;margin-bottom:' + (i < items.length - 1 ? '12px' : '0') }, [
        h('span', { style: 'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--status-success-fg);color:var(--text-inverse);font-size:var(--fs-caption);font-weight:700;flex-shrink:0' }, i + 1),
        h('div', { style: 'line-height:1.5' }, [
          h('div', { style: 'font-weight:600;font-size:var(--fs-body-sm);color:var(--text-primary)' }, item.title),
          h('div', { style: 'font-size:var(--fs-caption);color:var(--text-tertiary)' }, item.desc),
        ]),
      ])
    ),
    h('div', { style: 'margin-top:16px;padding:10px 12px;background:var(--status-warning-bg);border-radius:var(--radius-sm);border:1px solid var(--status-warning-bd);font-size:var(--fs-body-sm);color:var(--status-warning-fg)' },
      '开启后将无法切换回考试模式。确定开启练习模式吗？'
    ),
  ]);

  confirm({
    title: '开启练习模式',
    content,
    okText: '开启练习模式',
    cancelText: '取消',
    danger: true,   // 开启后无法切回考试模式（不可逆）
    onOk: () => { timeForm.isPractice = true; },
  });
}

/** 首屏同时拉列表与班级下拉（班级复用向导接口，无新增请求） */
onMounted(async () => {
  await Promise.all([fetch(), loadClasses()]);
});
</script>

<style scoped>
/* ===== KPI 行（外壳 PageShell 只负责位置，卡片样式在本页） ===== */
.kpi-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4); }
.kpi { padding: 16px 18px; background: var(--card-bg); border: 1px solid var(--card-bd); border-radius: var(--card-radius); }
.kpi-label { font-size: var(--fs-body-sm); color: var(--text-secondary); }
.kpi-value { margin-top: 6px; font-size: var(--fs-display-2); line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; color: var(--text-strong); }
.kpi-value.tone-warn { color: var(--status-warning-fg); }
.kpi-value small { margin-left: 4px; font-size: var(--fs-body-sm); font-weight: 400; color: var(--text-tertiary); }
.kpi-sub { margin-top: 4px; font-size: var(--fs-caption); color: var(--text-tertiary); }

.w-260 { width: 260px; }
.w-200 { width: 200px; }
.w-160 { width: 160px; }
.w-120 { width: 120px; }
.hint-inline { margin-left: var(--space-2); color: var(--text-tertiary); font-size: var(--fs-body-sm); }
.muted { color: var(--text-tertiary); font-size: var(--fs-caption); }
.tnum { font-variant-numeric: tabular-nums; }
.lock-icon { color: var(--status-danger-fg); font-size: var(--fs-caption); }

/* 超出 2 个班级后的「+N」计数片（不是状态，走描边样式） */
.chip-more { display: inline-flex; align-items: center; height: var(--tag-h); padding: 0 var(--tag-pad-x); margin-right: 4px; border-radius: var(--tag-radius); border: 1px solid var(--border-strong); color: var(--text-secondary); font-size: var(--tag-fs); white-space: nowrap; }
.tag-link { text-decoration: none; }
.tag-link:hover { filter: brightness(0.96); }

@media (max-width: 1100px) {
  .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* ===== 向导弹窗内部（scoped 可覆盖，因为内容渲染在组件自身 DOM 内） ===== */
.steps { margin-bottom: 32px; }
.mb20 { margin-bottom: 20px; }
.step-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }
.class-pick { display: flex; gap: 12px; }
.pick-panel { flex: 1; min-width: 0; }
.pick-panel-title { font-weight: 600; margin-bottom: 8px; font-size: var(--fs-body); }
.pick-list { margin-top: 8px; max-height: 260px; overflow-y: auto; }
.pick-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; cursor: pointer; border-radius: var(--radius-xs); font-size: var(--fs-body-sm); }
.pick-item:hover { background: var(--bg-selected); }
.pick-item.on { background: var(--bg-selected); color: var(--text-brand); }
.pick-check { font-size: var(--fs-caption); }
.pick-team { font-size: var(--fs-caption); }
/* B2-10：本页原有一份 scoped .visually-hidden 副本已删除 —— 全局工具类（src/style.css）是唯一属主，
   值逐字相同；scoped 副本反而会遮蔽全局类（[data-v-*] 优先级更高）。 */
</style>
