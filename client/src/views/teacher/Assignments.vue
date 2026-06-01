<template>
  <div class="page">
    <div class="page-header">
      <h2>作业管理</h2>
      <a-button type="primary" @click="openAdd">布置作业</a-button>
    </div>

    <DataTable
      :columns="columns"
      :dataSource="list"
      rowKey="id"
      :loading="loading"
      v-model:current="pagination.current"
      :pageSize="pagination.pageSize"
      :total="pagination.total"
      @page-change="onPageChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'qCount'">{{ record._count?.assignmentQuestions || 0 }}</template>
        <template v-if="column.key === 'sCount'">{{ record._count?.submissions || 0 }}</template>
        <template v-if="column.key === 'time'">{{ record.startTime }} ~ {{ record.endTime }}</template>
      </template>
    </DataTable>

    <a-modal title="布置作业" :open="visible" @cancel="visible = false" :width="1040" :footer="null" :destroyOnClose="true" wrap-class-name="assign-modal">
      <a-steps :current="step" class="steps">
        <a-step title="选题" /><a-step title="选班" /><a-step title="设置时间" />
      </a-steps>

      <div v-if="step === 0">
        <a-input-search v-model:value="qKeyword" placeholder="搜索题目" class="mb20" @search="searchQuestions" />
        <a-table :columns="qCols" :dataSource="questions" rowKey="id" size="small" :scroll="{ x: 'max-content' }" :rowSelection="{ selectedRowKeys: selectedQIds, onChange: onQSelect, type: 'radio' }" :pagination="false" />
      </div>

      <div v-if="step === 1" class="class-pick">
        <div class="pick-panel">
          <div class="pick-panel-title">可选班级</div>
          <a-input-search v-model:value="classSearch" placeholder="搜索班级" size="small" />
          <div class="pick-list">
            <div v-for="c in filteredClasses" :key="c.id"
              :class="['pick-item', { on: selectedCIds.includes(c.id) }]"
              @click="toggleClass(c.id)">
              <span>{{ c.name }}<a-tag v-if="c.isTeamClass" color="purple" size="small" style="margin-left:4px;font-size:10px;">团队</a-tag></span>
              <CheckOutlined v-if="selectedCIds.includes(c.id)" class="pick-check" />
            </div>
            <a-empty v-if="!filteredClasses.length" :image="false" description="无匹配班级" />
          </div>
        </div>
        <div class="pick-panel">
          <div class="pick-panel-title">已选 {{ selectedCIds.length }} 个班</div>
          <div class="pick-list">
            <a-tag v-for="cid in selectedCIds" :key="cid" closable @close="toggleClass(cid)" :color="classTeamMap[cid] ? 'purple' : 'blue'">
              {{ classNameMap[cid] }}
              <span v-if="classTeamMap[cid]" style="font-size:10px;"> · {{ classTeamMap[cid] }}</span>
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
          <a-form-item label="允许补交"><a-switch v-model:checked="timeForm.allowResubmit" /></a-form-item>
        </a-form>
      </div>

      <div class="step-actions">
        <a-button v-if="step > 0" @click="step--">上一步</a-button>
        <a-button v-if="step < 2" type="primary" @click="nextStep">下一步</a-button>
        <a-button v-if="step === 2" type="primary" :loading="submitting" @click="submit">提交</a-button>
      </div>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { CheckOutlined } from '@ant-design/icons-vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import dateLocale from 'ant-design-vue/es/date-picker/locale/zh_CN';
import request from '../../api/request.js';
import { useUserStore } from '../../stores/user.js';
import DataTable from '../../components/DataTable.vue';

dayjs.locale('zh-cn');

const userStore = useUserStore();
const loading = ref(false);
const list = ref([]);
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
const visible = ref(false);
const step = ref(0);
const submitting = ref(false);
const questions = ref([]);
const qKeyword = ref('');
const selectedQIds = ref([]);
const avalClasses = ref([]);
const selectedCIds = ref([]);
const classSearch = ref('');
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

function toggleClass(id) {
  const idx = selectedCIds.value.indexOf(id);
  if (idx >= 0) selectedCIds.value.splice(idx, 1);
  else selectedCIds.value.push(id);
}
const timeForm = reactive({ title: '', description: '', timeRange: [], allowResubmit: false });

const qCols = [
  { title: '标题', dataIndex: 'title', width: 250, ellipsis: true },
  { title: '难度', dataIndex: 'difficulty', width: 80 },
];
const columns = [
  { title: '标题', dataIndex: 'title', width: 220, ellipsis: true },
  { title: '题目数', key: 'qCount', width: 80 },
  { title: '提交数', key: 'sCount', width: 80 },
  { title: '时间', key: 'time', width: 220, ellipsis: true },
  { title: '创建时间', dataIndex: 'createdAt', width: 170 },
];

async function fetch() {
  loading.value = true;
  const r = await request.get('/teacher/assignments', { params: { page: pagination.current, pageSize: pagination.pageSize } });
  list.value = r.data.list;
  pagination.total = r.data.total;
  loading.value = false;
}

function onPageChange(page) {
  pagination.current = page;
  fetch();
}

async function openAdd() {
  step.value = 0;
  submitting.value = false;
  selectedQIds.value = [];
  selectedCIds.value = [];
  Object.assign(timeForm, { title: '', description: '', timeRange: [], allowResubmit: false });
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

async function submit() {
  if (!timeForm.title || !timeForm.timeRange.length) return message.warn('请填写完整');
  submitting.value = true;
  try {
    await request.post('/teacher/assignments', {
      title: timeForm.title, description: timeForm.description,
      startTime: timeForm.timeRange[0].toISOString(), endTime: timeForm.timeRange[1].toISOString(),
      allowResubmit: timeForm.allowResubmit,
      questionIds: selectedQIds.value, classIds: selectedCIds.value,
    });
    message.success('布置成功');
    visible.value = false;
    fetch();
  } finally { submitting.value = false; }
}

onMounted(fetch);
</script>

<style scoped>
.page {
  max-width: 1400px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.page-header h2 {
  font-size: 28px;
  margin: 0;
}
.steps { margin-bottom: 32px; }
.mb20 { margin-bottom: 20px; }
.step-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; }
.class-pick { display: flex; gap: 12px; }
.pick-panel { flex: 1; min-width: 0; }
.pick-panel-title { font-weight: 600; margin-bottom: 8px; font-size: 14px; }
.pick-list { margin-top: 8px; max-height: 260px; overflow-y: auto; }
.pick-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; cursor: pointer; border-radius: 4px; font-size: 13px; }
.pick-item:hover { background: #f0f5ff; }
.pick-item.on { background: #e6f4ff; color: var(--blue); }
.pick-check { font-size: 12px; }
</style>
<style>
.assign-modal .ant-modal { max-width: 1040px; }
</style>
