<script setup>
/**
 * 布置作业 · 4 步向导 —— v1 零后端版
 *
 * 依据：10-v1-implementation-contract §3/§6/§7、05-page-specs 屏 27、09 §4 降级口径。
 * 数据：
 *   · GET /teacher/questions?page&pageSize&keyword   选题（题型 chips 前端过滤，无服务端 type 参数）
 *   · GET /teacher/classes                           投放班级（可见班级）
 *   · POST /teacher/assignments                      创建作业；1007 软警告二次确认后带
 *     confirmWithoutStandardPackage:true 重发。
 * 无存草稿接口（不渲染假按钮）；编辑/删除作业为延期项。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MobileLayout from '../../layout/MobileLayout.vue';
import MobileAppBar from '../../layout/MobileAppBar.vue';
import {
  MEmpty, MField, MIcon, MChips, MSheet, MSkeleton, MStatusTag,
} from '../../components/index.js';
import request from '../../../api/request.js';
import { useSafeRequest } from '../../../composables/useSafeRequest.js';
import { errorCopyOf } from '../../../composables/errorCopy.js';
import { useMobileToast } from '../../composables/useMobileToast.js';

const router = useRouter();
const toast = useMobileToast();
const { safeLoad } = useSafeRequest({ tag: 'MobileTeacherAssignWizard.vue', action: '布置作业' });

const steps = [
  { no: 1, label: '基本信息' },
  { no: 2, label: '选题' },
  { no: 3, label: '班级' },
  { no: 4, label: '确认' },
];
const step = ref(1);
const stepError = ref('');
const submitting = ref(false);
const submitError = ref('');
const softSheetOpen = ref(false);
const softWarning = ref(null);
const titleTouched = ref(false);
const timeTouched = ref(false);

const TYPE_OPTIONS = [
  { label: '全部', value: '' },
  { label: '编程题', value: 'code' },
  { label: '实训题', value: 'project' },
];

function pad(n) {
  return String(n).padStart(2, '0');
}
function toLocalInput(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
function defaultStart() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30 - (d.getMinutes() % 30), 0, 0);
  return toLocalInput(d);
}
function defaultEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d);
}

const form = reactive({
  title: '',
  description: '',
  startTime: defaultStart(),
  endTime: defaultEnd(),
});

const questions = ref([]);
const questionTotal = ref(0);
const questionPage = ref(1);
const QUESTION_PAGE_SIZE = 50;
const questionsLoading = ref(false);
const questionsLoadingMore = ref(false);
const questionsError = ref('');
const questionKeyword = ref('');
const questionType = ref('');
const selectedQuestions = ref([]);
const questionsLoaded = ref(false);

const classes = ref([]);
const classesLoading = ref(false);
const classesError = ref('');
const selectedClassIds = ref([]);
const classesLoaded = ref(false);

const titleError = computed(() => {
  const title = form.title.trim();
  if (!title) return '请填写作业名称';
  if (title.length > 200) return '作业名称不能超过 200 字';
  return '';
});
const timeError = computed(() => {
  if (!form.startTime || !form.endTime) return '请选择开始与截止时间';
  const start = Date.parse(form.startTime);
  const end = Date.parse(form.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '时间格式不正确';
  if (end <= start) return '截止时间需晚于开始时间';
  return '';
});
const effectiveTitleError = computed(() => (titleTouched.value ? titleError.value : ''));
const effectiveTimeError = computed(() => (timeTouched.value ? timeError.value : ''));
const filteredQuestions = computed(() => {
  if (!questionType.value) return questions.value;
  return questions.value.filter((item) => (item.type || 'code') === questionType.value);
});
const selectedScore = computed(() => selectedQuestions.value.reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0));
const hasMoreQuestions = computed(() => questions.value.length < questionTotal.value);
const selectedClassNames = computed(() => classes.value
  .filter((item) => selectedClassIds.value.indexOf(item.id) >= 0)
  .map((item) => item.name)
  .join(' / '));
const submitTimeText = computed(() => {
  if (timeError.value) return '待完善';
  return form.startTime.replace('T', ' ') + ' 至 ' + form.endTime.replace('T', ' ');
});

let searchTimer = null;
watch(questionKeyword, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    questionPage.value = 1;
    loadQuestions(false);
  }, 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

function typeLabel(type) {
  return type === 'project' ? '实训题' : '编程题';
}

function questionIndex(id) {
  return selectedQuestions.value.findIndex((item) => item.id === id);
}

function toggleQuestion(item) {
  const at = questionIndex(item.id);
  if (at >= 0) {
    selectedQuestions.value.splice(at, 1);
    return;
  }
  selectedQuestions.value.push({
    id: item.id,
    title: item.title,
    type: item.type || 'code',
    maxScore: item.maxScore,
  });
}

function toggleClass(item) {
  const at = selectedClassIds.value.indexOf(item.id);
  if (at >= 0) selectedClassIds.value.splice(at, 1);
  else selectedClassIds.value.push(item.id);
}

function isClassSelected(id) {
  return selectedClassIds.value.indexOf(id) >= 0;
}

async function loadQuestions(append) {
  if (append) questionsLoadingMore.value = true;
  else questionsLoading.value = true;
  questionsError.value = '';
  const params = { page: questionPage.value, pageSize: QUESTION_PAGE_SIZE };
  if (questionKeyword.value.trim()) params.keyword = questionKeyword.value.trim();
  const r = await safeLoad(() => request.get('/teacher/questions', { params }));
  questionsLoading.value = false;
  questionsLoadingMore.value = false;
  if (r.error) {
    questionsError.value = r.message || '题库加载失败';
    return;
  }
  const d = r.data || {};
  const rows = d.list || [];
  questions.value = append ? questions.value.concat(rows) : rows;
  questionTotal.value = d.total || 0;
  questionsLoaded.value = true;
}

function loadMoreQuestions() {
  if (questionsLoading.value || questionsLoadingMore.value) return;
  questionPage.value += 1;
  loadQuestions(true);
}

async function loadClasses() {
  if (classesLoaded.value || classesLoading.value) return;
  classesLoading.value = true;
  classesError.value = '';
  const r = await safeLoad(() => request.get('/teacher/classes'));
  classesLoading.value = false;
  if (r.error) {
    classesError.value = r.message || '班级加载失败';
    return;
  }
  classes.value = Array.isArray(r.data) ? r.data : ((r.data && r.data.list) || []);
  classesLoaded.value = true;
}

function validateStep(no) {
  stepError.value = '';
  if (no === 1) {
    titleTouched.value = true;
    timeTouched.value = true;
    if (titleError.value) { stepError.value = titleError.value; return false; }
    if (timeError.value) { stepError.value = timeError.value; return false; }
    return true;
  }
  if (no === 2) {
    if (!selectedQuestions.value.length) { stepError.value = '请至少选择一道题目'; return false; }
    return true;
  }
  if (no === 3) {
    if (!selectedClassIds.value.length) { stepError.value = '请至少选择一个班级'; return false; }
    return true;
  }
  return true;
}

function ensureStepData(no) {
  if (no === 2 && !questionsLoaded.value) loadQuestions(false);
  if (no === 3) loadClasses();
}

function goStep(target) {
  if (target === step.value) return;
  stepError.value = '';
  if (target > step.value) {
    for (let no = step.value; no < target; no += 1) {
      if (!validateStep(no)) {
        if (no !== step.value) {
          step.value = no;
          ensureStepData(no);
        }
        return;
      }
    }
  }
  step.value = target;
  ensureStepData(target);
}

function next() {
  stepError.value = '';
  if (!validateStep(step.value)) return;
  if (step.value >= 4) return;
  step.value += 1;
  ensureStepData(step.value);
}

function prev() {
  if (step.value <= 1) return;
  stepError.value = '';
  step.value -= 1;
}

function firstInvalidStep() {
  if (titleError.value || timeError.value) return 1;
  if (!selectedQuestions.value.length) return 2;
  if (!selectedClassIds.value.length) return 3;
  return 0;
}

async function submit(confirmWithoutStandardPackage) {
  if (submitting.value) return;
  const invalid = firstInvalidStep();
  if (invalid) {
    step.value = invalid;
    stepError.value = invalid === 1
      ? (titleError.value || timeError.value)
      : (invalid === 2 ? '请至少选择一道题目' : '请至少选择一个班级');
    if (invalid === 1) {
      titleTouched.value = true;
      timeTouched.value = true;
    }
    ensureStepData(invalid);
    return;
  }
  submitting.value = true;
  submitError.value = '';
  const payload = {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    startTime: new Date(form.startTime).toISOString(),
    endTime: new Date(form.endTime).toISOString(),
    questionIds: selectedQuestions.value.map((item) => item.id),
    classIds: selectedClassIds.value.slice(),
  };
  if (confirmWithoutStandardPackage === true) payload.confirmWithoutStandardPackage = true;
  try {
    const res = await request.post('/teacher/assignments', payload);
    const created = (res && res.data) || {};
    submitting.value = false;
    softSheetOpen.value = false;
    toast.show('作业已创建');
    router.replace('/m/teacher/assignments/' + created.id);
  } catch (err) {
    submitting.value = false;
    const body = err && err.response && err.response.data;
    if (err && err.code === 1007 && body && body.data && body.data.requiresConfirmation) {
      softWarning.value = {
        message: errorCopyOf(err, { tag: '移动端布置作业', action: '创建作业' }),
        warnings: body.data.warnings || [],
      };
      softSheetOpen.value = true;
      return;
    }
    submitError.value = errorCopyOf(err, { tag: '移动端布置作业', action: '创建作业' });
  }
}

function closeSoftSheet() {
  softSheetOpen.value = false;
}

</script>

<template>
  <MobileLayout role="" active="" bottom="actionbar">
    <MobileAppBar title="布置作业" back back-to="/m/teacher/assignments">
      <template #right>
        <MStatusTag v-if="submitting" type="info">创建中</MStatusTag>
      </template>
    </MobileAppBar>

    <main class="scroll">
      <div class="steps-wrap">
        <div class="steps" role="group" aria-label="布置作业步骤">
          <template v-for="(item, index) in steps" :key="item.no">
            <button
              type="button"
              class="step"
              :class="{ active: step === item.no, done: step > item.no }"
              :aria-current="step === item.no ? 'step' : undefined"
              :aria-label="'第 ' + item.no + ' 步 ' + item.label"
              @click="goStep(item.no)"
            >
              <span class="stepdot">
                <MIcon v-if="step > item.no" name="check" />
                <template v-else>{{ item.no }}</template>
              </span>
              <span class="steplabel">{{ item.label }}</span>
            </button>
            <span v-if="index < steps.length - 1" class="stepline" :class="{ done: step > item.no }"></span>
          </template>
        </div>
      </div>

      <section v-if="step === 1" class="page">
        <MField label="作业名称" for-id="wiz-title" required :error="effectiveTitleError">
          <input id="wiz-title" v-model="form.title" class="input" maxlength="200" placeholder="例如：数据结构实验三：图的最短路径" @blur="titleTouched = true" />
        </MField>
        <MField label="作业说明" for-id="wiz-desc" hint="选填，学生端可见">
          <textarea id="wiz-desc" v-model="form.description" class="textarea" maxlength="500" placeholder="说明提交要求、评分关注点（选填）"></textarea>
        </MField>
        <MField label="开始时间" for-id="wiz-start" required :error="timeTouched && !form.startTime ? '请选择开始时间' : ''">
          <input id="wiz-start" v-model="form.startTime" type="datetime-local" class="input" @blur="timeTouched = true" />
        </MField>
        <MField label="截止时间" for-id="wiz-end" required :error="effectiveTimeError">
          <input id="wiz-end" v-model="form.endTime" type="datetime-local" class="input" @blur="timeTouched = true" />
        </MField>
        <div class="banner banner--info mt12">
          <MIcon name="info" />
          <div>时间按本机时区填写，截止时间必须晚于开始时间。创建后可回到作业列表锁定或复制作业链接。</div>
        </div>
      </section>

      <section v-else-if="step === 2" class="page">
        <label class="searchbar">
          <MIcon name="search" />
          <input v-model="questionKeyword" type="search" placeholder="搜索题目名称" aria-label="搜索题目名称" enterkeyhint="search" />
        </label>
        <div class="chips-wrap">
          <MChips v-model="questionType" :options="TYPE_OPTIONS" label="题型筛选" />
        </div>

        <div class="pick-summary">
          <MIcon name="check-circle" />
          <span class="pick-summary-text">已选 {{ selectedQuestions.length }} 题 · 合计 {{ selectedScore }} 分</span>
          <button v-if="selectedQuestions.length" type="button" class="pick-clear" @click="selectedQuestions = []">清空</button>
        </div>

        <MSkeleton v-if="questionsLoading && !questions.length" variant="card" :count="3" />
        <div v-else-if="questionsError" class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ questionsError }}<button type="button" class="banner-link" @click="loadQuestions(false)">重试</button></div>
        </div>
        <MEmpty
          v-else-if="!filteredQuestions.length"
          icon="book"
          :title="questions.length ? '当前筛选没有题目' : '题库还没有题目'"
          :description="questions.length ? '切换题型筛选，或到电脑端新建题目' : '请先在电脑端新建题目，再回到手机布置作业'"
        />
        <div v-else class="stack">
          <button
            v-for="item in filteredQuestions"
            :key="item.id"
            type="button"
            class="pick-card"
            :class="{ selected: questionIndex(item.id) >= 0 }"
            :aria-pressed="questionIndex(item.id) >= 0"
            @click="toggleQuestion(item)"
          >
            <span class="pick-index" :class="{ on: questionIndex(item.id) >= 0 }">
              <template v-if="questionIndex(item.id) >= 0">{{ questionIndex(item.id) + 1 }}</template>
              <MIcon v-else name="plus" />
            </span>
            <span class="pick-main">
              <span class="pick-title">{{ item.title }}</span>
              <span class="pick-sub">
                <MStatusTag :type="item.type === 'project' ? 'accent' : 'info'">{{ typeLabel(item.type) }}</MStatusTag>
                <span class="pick-score">{{ item.maxScore }} 分</span>
                <span v-if="item._count && item._count.subQuestions" class="pick-score">· {{ item._count.subQuestions }} 小题</span>
              </span>
            </span>
            <span class="check" :class="{ on: questionIndex(item.id) >= 0 }" aria-hidden="true"><MIcon name="check" /></span>
          </button>
          <button v-if="hasMoreQuestions" type="button" class="btn btn--secondary btn--block" :disabled="questionsLoadingMore" @click="loadMoreQuestions">
            {{ questionsLoadingMore ? '加载中…' : '加载更多' }}
          </button>
        </div>
        <p v-if="stepError" class="error-text mt12" role="alert"><MIcon name="alert" />{{ stepError }}</p>
      </section>

      <section v-else-if="step === 3" class="page">
        <p class="form-block-title">选择投放班级（可多选）</p>
        <MSkeleton v-if="classesLoading" variant="line" :count="4" />
        <div v-else-if="classesError" class="banner banner--danger" role="alert">
          <MIcon name="alert" /><div>{{ classesError }}<button type="button" class="banner-link" @click="classesLoaded = false; loadClasses()">重试</button></div>
        </div>
        <MEmpty v-else-if="!classes.length" icon="users" title="没有可用班级" description="请联系管理员分配班级后再布置作业" />
        <div v-else class="list">
          <button
            v-for="item in classes"
            :key="item.id"
            type="button"
            class="rowitem rowitem--tap"
            :aria-pressed="isClassSelected(item.id)"
            @click="toggleClass(item)"
          >
            <span class="rowicon" aria-hidden="true"><MIcon name="users" /></span>
            <span class="row-main">
              <span class="row-title">{{ item.name }}</span>
              <span class="row-sub">{{ (item._count && item._count.studentClasses) || 0 }} 名学生<template v-if="item.school && item.school.name"> · {{ item.school.name }}</template></span>
            </span>
            <span class="check" :class="{ on: isClassSelected(item.id) }" aria-hidden="true"><MIcon name="check" /></span>
          </button>
        </div>
        <p class="help mt12">已选 {{ selectedClassIds.length }} 个班级<template v-if="selectedClassNames">：{{ selectedClassNames }}</template></p>
        <p v-if="stepError" class="error-text" role="alert"><MIcon name="alert" />{{ stepError }}</p>
      </section>

      <section v-else class="page">
        <div class="card">
          <div class="card-title">确认作业信息</div>
          <div class="kv mt12"><span class="k">作业名称</span><span class="v">{{ form.title || '未填写' }}</span></div>
          <div class="kv"><span class="k">时间</span><span class="v">{{ submitTimeText }}</span></div>
          <div class="kv"><span class="k">班级</span><span class="v">{{ selectedClassNames || '未选择' }}</span></div>
          <div class="kv"><span class="k">题目</span><span class="v">{{ selectedQuestions.length }} 题 · {{ selectedScore }} 分</span></div>
          <div v-if="form.description" class="kv"><span class="k">作业说明</span><span class="v">{{ form.description }}</span></div>
        </div>

        <div class="card mt12">
          <div class="card-title mb8">已选题目</div>
          <div v-for="(item, index) in selectedQuestions" :key="item.id" class="confirm-q">
            <span class="confirm-q-index">{{ index + 1 }}</span>
            <span class="grow confirm-q-title">{{ item.title }}</span>
            <span class="confirm-q-score">{{ item.maxScore }} 分</span>
          </div>
        </div>

        <div v-if="submitError" class="banner banner--danger mt12" role="alert">
          <MIcon name="alert" /><div>{{ submitError }}</div>
        </div>
        <div class="banner banner--info mt12">
          <MIcon name="info" />
          <div>创建后学生可在开放时间进入作业；如需修改，请在电脑端操作。</div>
        </div>
      </section>
    </main>

    <div class="actionbar">
      <button type="button" class="btn btn--secondary" :disabled="step === 1 || submitting" @click="prev">上一步</button>
      <button v-if="step < 4" type="button" class="btn btn--primary" @click="next">下一步</button>
      <button v-else type="button" class="btn btn--primary" :disabled="submitting" @click="submit(false)">
        {{ submitting ? '创建中…' : '创建作业' }}
      </button>
    </div>

    <MSheet v-model:open="softSheetOpen" title="需要确认后布置" subtitle="存在未上传标准工程包的实训题">
      <p class="soft-message">{{ softWarning ? softWarning.message : '' }}</p>
      <div v-if="softWarning && softWarning.warnings.length" class="list mt12">
        <div v-for="item in softWarning.warnings" :key="item.questionId" class="rowitem">
          <span class="rowicon rowicon--warning" aria-hidden="true"><MIcon name="alert" /></span>
          <span class="row-main">
            <span class="row-title">{{ item.title }}</span>
            <span class="row-sub">{{ item.message }}</span>
          </span>
        </div>
      </div>
      <template #foot>
        <button type="button" class="btn btn--secondary btn--block" :disabled="submitting" @click="closeSoftSheet">取消</button>
        <button type="button" class="btn btn--primary btn--block" :disabled="submitting" @click="submit(true)">
          {{ submitting ? '创建中…' : '确认按开放性题目布置' }}
        </button>
      </template>
    </MSheet>
  </MobileLayout>
</template>

<style scoped>
.steps-wrap { padding: 4px 0 2px; }
.steps { padding: 4px var(--m-gutter) 14px; }
.step {
  display: flex;
  align-items: center;
  flex: none;
  min-height: 44px;
  color: inherit;
}
.stepdot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--bg-sunken);
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.stepdot .icon { width: 13px; height: 13px; }
.step.active .stepdot { background: var(--brand-600); color: var(--text-on-brand); }
.step.done .stepdot { background: var(--bg-selected); color: var(--text-brand); }
.steplabel { margin-left: 7px; font-size: 12.5px; color: var(--text-tertiary); white-space: nowrap; }
.step.active .steplabel { color: var(--text-primary); font-weight: 600; }
.stepline { flex: 1; height: 2px; background: var(--border-default); margin: 0 8px; border-radius: 2px; }
.stepline.done { background: var(--brand-400); }
.chips-wrap { margin-top: 12px; }
.pick-summary {
  display: flex;
  align-items: center;
  margin: 4px 0 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg-selected);
  color: var(--text-brand);
  font-size: 13px;
  font-weight: 500;
}
.pick-summary .icon { width: 16px; height: 16px; margin-right: 7px; }
.pick-summary-text { flex: 1; min-width: 0; }
.pick-clear { flex: none; margin-left: 8px; font-size: 12.5px; font-weight: 600; color: var(--text-brand); }
.pick-card {
  display: flex;
  align-items: center;
  width: 100%;
  text-align: left;
  padding: 13px 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-surface);
  color: inherit;
}
.pick-card + .pick-card { margin-top: 10px; }
.pick-card.selected { border-color: var(--brand-600); background: var(--bg-selected); }
.pick-index {
  flex: none;
  width: 26px;
  height: 26px;
  margin-right: 12px;
  border-radius: 8px;
  border: 1px dashed var(--border-strong);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.pick-index .icon { width: 15px; height: 15px; }
.pick-index.on { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-on-brand); }
.pick-main { flex: 1; min-width: 0; }
.pick-title { display: block; font-size: 14.5px; font-weight: 500; line-height: 1.4; }
.pick-sub { display: flex; align-items: center; flex-wrap: wrap; margin-top: 4px; font-size: 12px; color: var(--text-tertiary); }
.pick-sub .tag { margin-right: 8px; }
.pick-score { margin-right: 8px; }
.pick-card .check { margin-left: 12px; }
.pick-card .check.on { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-on-brand); }
.rowitem .check { margin-left: 10px; }
.rowitem .check.on { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-on-brand); }
.rowitem { width: 100%; text-align: left; }
.confirm-q { display: flex; align-items: baseline; padding: 7px 0; font-size: 13.5px; }
.confirm-q + .confirm-q { border-top: 1px solid var(--border-subtle); }
.confirm-q-index { flex: none; width: 22px; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.confirm-q-title { min-width: 0; color: var(--text-primary); }
.confirm-q-score { flex: none; margin-left: 10px; color: var(--text-tertiary); font-size: 12.5px; }
.soft-message { font-size: 13.5px; line-height: 1.6; color: var(--text-secondary); }
</style>
