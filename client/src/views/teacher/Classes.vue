<template>
  <PageShell
    title="班级管理"
    description="维护你名下的班级；班级可加入教学团队分享给同事，也能在多个学校之间迁移。"
  >
    <template #actions>
      <a-button type="primary" @click="openAdd">新增班级</a-button>
    </template>

    <!-- TODO(P1-7): 接口支持服务端分页后切换（/teacher/classes 目前全量返回，沿用前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      empty-title="还没有班级"
      empty-desc="创建班级后，就能导入学生名单、给学生布置作业。"
      empty-action-text="新增班级"
      @page-change="onPageChange"
      @empty-action="openAdd"
    >
      <template #toolbar-right>
        <span class="muted">共 {{ list.length }} 个班级</span>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          {{ record.name }}
          <StatusTag v-if="record.isTeamClass" tone="accent" :text="'团队共享 · ' + record.ownerTeacherName" />
        </template>
        <template v-else-if="column.key === 'school'">{{ record.school?.name }}</template>
        <template v-else-if="column.key === 'count'">{{ record._count?.studentClasses ?? 0 }}</template>
        <template v-else-if="column.key === 'createdAt'">
          <span class="tnum">{{ formatDateTime(record.createdAt) }}</span>
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button type="link" @click="openEdit(record)" :disabled="record.isTeamClass">编辑</a-button>
            <a-button v-if="mySchools.length > 1" type="link" @click="openSwitchSchool(record)" :disabled="record.isTeamClass">切换学校</a-button>
            <a-popconfirm title="确认删除该班级？" description="删除后该班级的学生/教师关联与作业布置记录一并移除，不可撤销。" ok-text="删除班级" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="del(record.id)" :disabled="record.isTeamClass">
              <a-button type="link" danger :disabled="record.isTeamClass">删除</a-button>
            </a-popconfirm>
          </div>
        </template>
      </template>
    </ListPage>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" :ok-text="isEdit ? '保存修改' : '新增班级'" cancel-text="取消" :width="640" wrap-class-name="form-modal">
      <a-form :model="form">
        <a-form-item label="班级名称" html-for="tch-class-name">
          <a-input id="tch-class-name" v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="指定教学团队" html-for="tch-class-teams">
          <a-select id="tch-class-teams" v-model:value="form.teamIds" mode="multiple" placeholder="可选，将班级加入指定团队">
            <a-select-option v-for="t in teams" :key="t.id" :value="t.id">{{ t.name }}（{{ t.creator?.realName }} 创建）</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal :title="switchTitle" :open="switchVisible" @ok="handleSwitch" @cancel="switchVisible = false" ok-text="切换学校" cancel-text="取消" :width="640">
      <div class="switch-body">
        <p>将班级 <strong>{{ switchingClass?.name }}</strong> 从</p>
        <p class="switch-pair">
          <StatusTag tone="warning" :text="switchingClass?.school?.name || ''" />
          <span class="switch-arrow">→</span>
          <StatusTag tone="success" :text="targetSchool?.name || '请选择'" />
        </p>
        <p class="switch-warn">切换后，该班级的作业和提交记录将迁移至新学校。如该班级已加入教学团队，将自动退出所有团队。</p>
        <label for="tch-class-target-school" class="visually-hidden">选择目标学校</label>
        <a-select id="tch-class-target-school" v-model:value="targetSchoolId" placeholder="选择目标学校" class="w-full" :options="otherSchoolOptions" />
      </div>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { useUserStore } from '../../stores/user.js';
import { formatDateTime } from '../../domain/format.js';
const loading = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const teams = ref([]);
const visible = ref(false);
const modalTitle = ref('');
const isEdit = ref(false);
const editId = ref(null);
const form = reactive({ name: '', teamIds: [] });

const userStore = useUserStore();
const mySchools = computed(() => userStore.teacherSchools || []);
const switchVisible = ref(false);
const switchingClass = ref(null);
const targetSchoolId = ref(undefined);
const targetSchool = computed(() => mySchools.value.find(s => s.id === targetSchoolId.value));
const switchTitle = computed(() => '切换学校 · ' + (switchingClass.value?.name || ''));
const otherSchoolOptions = computed(() =>
  mySchools.value
    .filter(s => s.id !== switchingClass.value?.schoolId)
    .map(s => ({ label: s.name, value: s.id }))
);

const columns = [
  { title: '班级名称', key: 'name', width: 200, ellipsis: true },
  { title: '所属学校', key: 'school', width: 200, ellipsis: true, responsive: ['xl'] },
  { title: '人数', key: 'count', width: 70 },
  { title: '创建时间', key: 'createdAt', width: 170, ellipsis: true, responsive: ['xl'] },
  { title: '操作', key: 'action', width: 160, align: 'right' },
];

/** 前端切片：接口全量返回（见上方 TODO(P1-7)） */
const pagedList = computed(() => list.value.slice((page.current - 1) * page.pageSize, page.current * page.pageSize));

async function fetch() {
  loading.value = true;
  const r = await request.get('/teacher/classes');
  list.value = r.data;
  loading.value = false;
}

async function loadTeams() {
  const r = await request.get('/teacher/teams');
  teams.value = r.data || [];
}

function openAdd() {
  isEdit.value = false; modalTitle.value = '新增班级';
  form.name = ''; form.teamIds = [];
  loadTeams(); visible.value = true;
}

function openEdit(record) {
  isEdit.value = true; editId.value = record.id; modalTitle.value = '编辑班级';
  form.name = record.name;
  form.teamIds = (record.teamClasses || []).map(tc => tc.teamId);
  loadTeams(); visible.value = true;
}

async function handleOk() {
  const d = { name: form.name, teamIds: form.teamIds };
  isEdit.value ? await request.put(`/teacher/classes/${editId.value}`, d) : await request.post('/teacher/classes', d);
  message.success(isEdit.value ? '修改成功' : '创建成功');
  visible.value = false; fetch();
}

async function del(id) { await request.delete(`/teacher/classes/${id}`); message.success('删除成功'); fetch(); }

function openSwitchSchool(record) {
  switchingClass.value = record;
  targetSchoolId.value = undefined;
  switchVisible.value = true;
}

async function handleSwitch() {
  if (!targetSchoolId.value) return message.warn('请选择目标学校');
  try {
    const r = await request.put(`/teacher/classes/${switchingClass.value.id}/switch-school`, { newSchoolId: targetSchoolId.value });
    message.success(r.message);
    switchVisible.value = false;
    fetch();
  } catch { message.error('切换失败'); }
}

/** 前端切片页码（ListPage 只抛出页码，不内置请求） */
function onPageChange(p) {
  page.current = p;
}

onMounted(fetch);
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
.tnum {
  font-variant-numeric: tabular-nums;
}
.row-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.switch-body {
  line-height: 1.8;
  font-size: var(--fs-body);
}
.switch-pair {
  text-align: center;
  font-size: var(--fs-title-3);
}
.switch-arrow {
  margin: 0 var(--space-2);
  color: var(--text-tertiary);
}
.switch-warn {
  margin-top: var(--space-3);
  color: var(--text-tertiary);
}
.w-full {
  width: 100%;
}
</style>
