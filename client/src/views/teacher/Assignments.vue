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

    <!-- 布置作业（一页式两栏 —— 左分区表单 / 右实时摘要）
         约束：只改 UI（数据全部取自现有接口：班级人数 _count.studentClasses、题目 type/maxScore、
         上次作业 assignmentClasses[].classId + startTime/endTime）· 题目单选 · 考试/练习模式 UI 暂不显示
         （提交口径不变：mode='exam'、maxAttempts=null）。 -->
    <a-modal
      :open="visible"
      title="布置作业"
      :width="modalWidth"
      :footer="null"
      :destroyOnClose="true"
      wrap-class-name="assign-modal"
      @cancel="onCancel"
    >
      <div v-if="draftRestored" class="draft-bar">
        <span>已恢复上次未提交的草稿</span>
        <button type="button" class="linkbtn" @click="clearDraft">清除草稿</button>
      </div>

      <div class="assign-body">
        <div class="assign-main">
          <!-- ① 基本信息 -->
          <section class="ablk">
            <div class="ablk-h"><b>① 基本信息</b><span class="ablk-n">学生端显示这个标题</span></div>
            <div class="ablk-b">
              <div class="afld">
                <label for="assign-title">作业标题</label>
                <a-input
                  id="assign-title"
                  v-model:value="timeForm.title"
                  placeholder="例如：第三章 循环与数组"
                  :status="titleError ? 'error' : undefined"
                  @blur="titleTouched = true"
                />
                <div v-if="titleError" class="afld-err" role="alert">⚠ 请填写作业标题</div>
              </div>
              <div class="afld">
                <label for="assign-desc">作业说明（可选）</label>
                <a-textarea id="assign-desc" v-model:value="timeForm.description" :rows="2" placeholder="要提醒学生注意什么？可留空" />
              </div>
            </div>
          </section>

          <!-- ② 题目（单选；整行可点） -->
          <section class="ablk">
            <div class="ablk-h"><b>② 题目</b><span class="ablk-n">单选 · 点整行即可选中</span></div>
            <div v-if="selectedQ" class="picked">
              <StatusTag :tone="selectedQ.type === 'project' ? 'accent' : 'brand'" :text="selectedQ.type === 'project' ? '实训题' : '编程题'" />
              <b>{{ selectedQ.title }}</b>
              <span class="picked-meta">{{ difficultyText(selectedQ.difficulty) }} · {{ selectedQ.maxScore }} 分</span>
              <a-button type="link" size="small" @click="changeQuestion">换一题</a-button>
            </div>
            <template v-else>
              <div class="ablk-b ablk-b--tight">
                <a-input-search v-model:value="qKeyword" placeholder="搜索题目标题" allow-clear @search="searchQuestions" />
              </div>
              <!-- B3-1 ⑥：rowSelection.columnTitle 给 antd 自动生成的选择列一个「只读屏」列标题 →
                   消除 axe empty-table-header。customRow 让整行可点（原实现必须精确点中圆点）。 -->
              <a-table
                :columns="qCols"
                :dataSource="questions"
                rowKey="id"
                size="small"
                :scroll="{ x: 'max-content' }"
                :pagination="false"
                :rowSelection="{ selectedRowKeys: selectedQIds, onChange: onQSelect, type: 'radio', columnTitle: qSelectColumnTitle }"
                :customRow="questionRow"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.dataIndex === 'type'">
                    <StatusTag :tone="record.type === 'project' ? 'accent' : 'brand'" :text="record.type === 'project' ? '实训题' : '编程题'" />
                  </template>
                  <template v-else-if="column.dataIndex === 'difficulty'">{{ difficultyText(record.difficulty) }}</template>
                  <template v-else-if="column.dataIndex === 'maxScore'">
                    <span class="lp-num">{{ record.maxScore }}<u>分</u></span>
                  </template>
                </template>
              </a-table>
            </template>
            <div v-if="pickError" class="afld-err afld-err--block" role="alert">⚠ 请选择一道题目</div>
          </section>

          <!-- ③ 班级（点选 + 人数，数据来自班级列表的 _count.studentClasses） -->
          <section class="ablk">
            <div class="ablk-h">
              <b>③ 班级</b><span class="ablk-n">可多选</span>
              <button v-if="lastClasses.length" type="button" class="linkbtn linkbtn--right" @click="applyLastClasses">套用上次班级</button>
            </div>
            <div class="ablk-b">
              <a-input-search v-if="avalClasses.length > 8" v-model:value="classSearch" size="small" placeholder="搜索班级" class="mb12" />
              <div class="classlist">
                <button
                  v-for="c in filteredClasses"
                  :key="c.id"
                  type="button"
                  class="cbtn"
                  :class="{ 'is-on': selectedCIds.includes(c.id) }"
                  :aria-pressed="selectedCIds.includes(c.id) ? 'true' : 'false'"
                  @click="toggleClass(c.id)"
                >
                  <CheckOutlined v-if="selectedCIds.includes(c.id)" />
                  <span class="cbtn-name">{{ c.name }}</span>
                  <span v-if="c.isTeamClass" class="cbtn-team">团队</span>
                  <span class="cbtn-cnt">{{ classCount(c) }} 人</span>
                </button>
              </div>
              <div class="ahint">已选 {{ selectedCIds.length }} 个班 · 合计 {{ totalStudents }} 人</div>
            </div>
            <div v-if="classError" class="afld-err afld-err--block" role="alert">⚠ 请至少选择一个班级</div>
          </section>

          <!-- ④ 起止时间（默认已填 + 快捷预设；「允许补交」保留为考试态下的独立选项） -->
          <section class="ablk">
            <div class="ablk-h">
              <b>④ 起止时间</b><span class="ablk-n">已默认填好，可修改</span>
              <button v-if="lastTime" type="button" class="linkbtn linkbtn--right" @click="applyLastTime">套用上次时间</button>
            </div>
            <div class="ablk-b">
              <div class="afld" role="group" aria-labelledby="assign-range-label">
                <label id="assign-range-label" for="assign-range">起止时间</label>
                <a-range-picker
                  id="assign-range"
                  v-model:value="timeForm.timeRange"
                  show-time
                  :locale="dateLocale"
                  class="w-full"
                  @change="timeTouched = true"
                />
                <div class="ahint">
                  快捷：
                  <button type="button" class="qbtn" @click="applyPreset(0)">今天 18:00 ~ 一周后 23:59</button>
                  <button type="button" class="qbtn" @click="applyPreset(1)">明天 08:00 ~ 三天后 23:59</button>
                </div>
                <div v-if="timeError" class="afld-err" role="alert">⚠ 请选择起止时间</div>
              </div>
              <div class="afld">
                <label>允许补交</label>
                <div class="switch-row"><span>截止后仍可提交（记为补交）</span><a-switch v-model:checked="timeForm.allowResubmit" /></div>
              </div>
            </div>
          </section>
        </div>

        <aside class="assign-side">
          <div class="asum">
            <h4>将布置</h4>
            <dl class="asum-dl">
              <div class="kv"><dt>题目</dt><dd>{{ selectedQIds.length }} 题</dd></div>
              <div class="kv"><dt>班级</dt><dd>{{ selectedCIds.length }} 个 · {{ totalStudents }} 人</dd></div>
              <div class="kv"><dt>截止</dt><dd>{{ deadlineText }}</dd></div>
            </dl>
          </div>
          <div class="aready" :class="missing.length ? 'is-warn' : 'is-ok'" role="status">
            {{ missing.length ? '⚠ 还差：' + missing.join('、') : '✓ 信息齐了，可以布置' }}
          </div>
          <a-button type="primary" block :disabled="missing.length > 0" :loading="submitting" @click="submit">立即布置</a-button>
          <a-button block @click="onCancel">取消</a-button>
          <button type="button" class="linkbtn linkbtn--full" @click="saveDraftAndClose">存为草稿并关闭</button>
        </aside>
      </div>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUpdated, onBeforeUnmount, nextTick, h } from 'vue';
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
const pickTouched = ref(false);
const classTouched = ref(false);
/** 已选题目记录：选中后题目区收成一张卡（可「换一题」），避免表格滚出视野后看不到选了什么 */
const selectedQ = ref(null);
const draftRestored = ref(false);
const DRAFT_KEY = 'assign-draft-v1';

const titleError = computed(() => titleTouched.value && !timeForm.title.trim());
const timeError = computed(() => timeTouched.value && !(timeForm.timeRange && timeForm.timeRange.length));
const pickError = computed(() => pickTouched.value && !selectedQIds.value.length);
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
/** 班级人数：来自 GET /teacher/classes 每行的 _count.studentClasses（现有接口已返回，无需后端改动） */
function classCount(c) { return c && c._count ? (c._count.studentClasses || 0) : 0; }
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

/* 补「类型 / 满分」两列：字段来自弹窗已在取的 GET /teacher/questions（type / maxScore） */
const qCols = [
  { title: '标题', dataIndex: 'title', width: 260, ellipsis: true },
  { title: '类型', dataIndex: 'type', width: 96 },
  { title: '难度', dataIndex: 'difficulty', width: 88 },
  { title: '满分', dataIndex: 'maxScore', width: 88, align: 'right' },
];

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

async function searchQuestions() {
  const r = await request.get('/teacher/questions', { params: { keyword: qKeyword.value, pageSize: 100 } });
  questions.value = r.data.list;
}

/** 单选：radio 点选与整行点击共用（原来点行不选中，必须精确点中圆点） */
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

async function toggleLock(record) {
  try {
    await request.put('/teacher/assignments/' + record.id + '/lock');
    record.locked = !record.locked;
    message.success(record.locked ? '已锁定' : '已解锁');
  } catch { message.error('操作失败'); }
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
.w-full { width: 100%; }
.mb12 { margin-bottom: var(--space-3); }
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
/* ===== 布置作业 v2：一页式两栏（左分区表单 / 右实时摘要） ===== */
.assign-body { display: grid; grid-template-columns: minmax(0, 1fr) 268px; gap: var(--space-4); align-items: start; }
.assign-main { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.assign-side { display: flex; flex-direction: column; gap: var(--space-2); position: sticky; top: 0; }

.ablk { border: 1px solid var(--border-default); border-radius: var(--radius-lg); overflow: hidden; background: var(--card-bg); }
.ablk-h { display: flex; align-items: center; gap: var(--space-2); padding: 10px var(--space-3); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); }
.ablk-h b { font-size: var(--fs-body-sm); color: var(--text-primary); }
.ablk-n { font-size: var(--fs-caption); color: var(--text-tertiary); }
.ablk-b { padding: var(--space-3); }
.ablk-b--tight { padding: var(--space-3) var(--space-3) var(--space-2); }

.afld { margin-bottom: var(--space-3); }
.afld:last-child { margin-bottom: 0; }
.afld label { display: block; margin-bottom: 5px; font-size: var(--fs-caption); font-weight: 500; color: var(--text-secondary); }
.afld-err { margin-top: 5px; font-size: var(--fs-caption); color: var(--status-danger-fg); }
.afld-err--block { padding: 0 var(--space-3) var(--space-3); }
.ahint { margin-top: 5px; font-size: var(--fs-caption); color: var(--text-tertiary); }
.qbtn { border: 0; background: transparent; padding: 0 2px; color: var(--text-brand); font-size: var(--fs-caption); cursor: pointer; }
.qbtn:hover { text-decoration: underline; }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); font-size: var(--fs-body-sm); color: var(--text-secondary); }

/* 已选题卡（单选：选中后收起表格，避免选项滚出视野） */
.picked { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3); }
.picked b { flex: 1; min-width: 0; font-size: var(--fs-body-sm); color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picked-meta { flex: none; font-size: var(--fs-caption); color: var(--text-tertiary); }

/* 班级点选按钮：带人数（_count.studentClasses） */
.classlist { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.cbtn { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 10px; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--card-bg); color: var(--text-secondary); font-size: var(--fs-body-sm); cursor: pointer; transition: var(--transition-control); }
.cbtn:hover { border-color: var(--brand-600); color: var(--text-brand); }
.cbtn.is-on { border-color: var(--brand-600); background: var(--bg-selected); color: var(--text-brand); }
.cbtn-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cbtn-team { font-size: var(--fs-caption); color: var(--text-tertiary); }
.cbtn-cnt { font-size: var(--fs-caption); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.cbtn.is-on .cbtn-cnt { color: var(--text-brand); }

.linkbtn { border: 0; background: transparent; padding: 2px 4px; border-radius: var(--radius-sm); color: var(--text-brand); font-size: var(--fs-caption); cursor: pointer; }
.linkbtn:hover { background: var(--bg-hover); }
.linkbtn--right { margin-left: auto; }
.linkbtn--full { width: 100%; padding: var(--space-2) 0; }

/* 右栏：实时摘要 + 就绪提示 + 主/次操作 */
.asum { padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--bg-surface-2); }
.asum h4 { margin: 0 0 var(--space-2); font-size: var(--fs-body-sm); color: var(--text-primary); }
.asum-dl { margin: 0; }
.kv { display: flex; justify-content: space-between; gap: var(--space-2); padding: 5px 0; font-size: var(--fs-body-sm); border-bottom: 1px dashed var(--border-subtle); }
.kv:last-child { border-bottom: 0; }
.kv dt { color: var(--text-tertiary); }
.kv dd { margin: 0; color: var(--text-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
.aready { padding: 9px 10px; border-radius: var(--radius-md); border: 1px solid; font-size: var(--fs-caption); line-height: 1.5; }
.aready.is-ok { background: var(--status-success-bg); border-color: var(--status-success-bd); color: var(--status-success-fg); }
.aready.is-warn { background: var(--status-warning-bg); border-color: var(--status-warning-bd); color: var(--status-warning-fg); }
.draft-bar { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); padding: 8px 10px; border-radius: var(--radius-md); background: var(--status-info-bg); border: 1px solid var(--status-info-bd); color: var(--status-info-fg); font-size: var(--fs-caption); }

/* 手机端：单列 + 摘要栏移到内容之后（弹窗外壳的全屏化见文件末尾非 scoped 段） */
@media (max-width: 768px) {
  .assign-body { grid-template-columns: minmax(0, 1fr); }
  .assign-side { position: static; }
  .cbtn { min-height: 44px; }
  .cbtn-name { max-width: none; }
}
/* B2-10：本页原有一份 scoped .visually-hidden 副本已删除 —— 全局工具类（src/style.css）是唯一属主，
   值逐字相同；scoped 副本反而会遮蔽全局类（[data-v-*] 优先级更高）。 */
</style>

<!-- 弹窗外壳：antd Modal 会被 teleport 到 body，scoped 样式够不到；
     选择器统一带 .assign-modal 前缀，避免规则外溢到其它页面的弹窗。 -->
<style>
@media (max-width: 768px) {
  .assign-modal .ant-modal { top: 0; margin: 0; padding-bottom: 0; }
  .assign-modal .ant-modal-content { min-height: 100vh; border-radius: 0; }
  .assign-modal .ant-modal-header { border-radius: 0; }
  .assign-modal .ant-modal-body { max-height: calc(100vh - 64px); overflow: auto; padding: var(--space-3); }
}
</style>
