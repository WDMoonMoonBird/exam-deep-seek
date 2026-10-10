<template>
  <FormPage
    :title="team.name || '教学团队'"
    description="维护团队成员与共享班级；改动会自动保存。"
    :back="{ text: '返回教学团队', to: '/teacher/teams' }"
  >
    <a-card class="team-card" :bodyStyle="{ padding: 'var(--space-6)' }">
      <a-tabs v-model:activeKey="tab">
        <a-tab-pane key="teachers" tab="教师管理">
          <div class="mb16">
            <!-- T5-A2：无可见 label；aria-label 会被 antd 渲染到外层 div，故用隐藏 label + for/id -->
            <label for="tch-team-teachers" class="visually-hidden">搜索并添加同校教师</label>
            <a-select
              id="tch-team-teachers"
              v-model:value="selectedTeachers"
              mode="multiple"
              showSearch
              placeholder="搜索并添加同校教师"
              class="w-full"
              :filterOption="filterTeacher"
              :options="teacherOptions"
              :maxTagCount="0"
              :maxTagPlaceholder="() => `已选 ${selectedTeachers.length} 人`"
              @select="onTeacherSelect"
            />
          </div>
          <a-table :columns="tCols" :dataSource="team.teachers || []" rowKey="teacherId" size="small" :pagination="false">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">{{ record.teacher?.realName }}</template>
              <template v-else-if="column.key === 'username'">{{ record.teacher?.username }}</template>
              <template v-else-if="column.key === 'role'">{{ record.teacherId === team.createdBy ? '创建者' : '教师' }}</template>
              <template v-else-if="column.key === 'action'">
                <a-popconfirm title="确定移除该教师？" ok-text="移除" cancel-text="取消" @confirm="removeTeacher(record.teacherId)" :disabled="record.teacherId === team.createdBy">
                  <a-button type="link" danger size="small" :disabled="record.teacherId === team.createdBy">移除</a-button>
                </a-popconfirm>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="classes" tab="班级管理">
          <div class="mb16">
            <label for="tch-team-classes" class="visually-hidden">搜索并添加班级</label>
            <a-select
              id="tch-team-classes"
              v-model:value="selectedClasses"
              mode="multiple"
              showSearch
              placeholder="搜索并添加班级"
              class="w-full"
              :filterOption="filterClass"
              :options="classOptions"
              :maxTagCount="0"
              :maxTagPlaceholder="() => `已选 ${selectedClasses.length} 个`"
              @select="onClassSelect"
            />
          </div>
          <a-table :columns="cCols" :dataSource="team.classes || []" rowKey="classId" size="small" :pagination="false">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'cname'">{{ record.class?.name }}</template>
              <template v-else-if="column.key === 'cowner'">
                <StatusTag v-if="record.classId && !myClassIds.includes(record.classId)" tone="accent" text="他人" />
                <span v-else class="dim-text">自己</span>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-popconfirm title="确定移除该班级？" ok-text="移除" cancel-text="取消" @confirm="removeClass(record.classId)">
                  <a-button type="link" danger size="small">移除</a-button>
                </a-popconfirm>
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <template #actionbar>
      <span class="save-status" role="status" aria-live="polite">{{ statusText }}</span>
    </template>
  </FormPage>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { useUserStore } from '../../stores/user.js';
import { useConfirm } from '../../composables/useConfirm.js';
import { useDraftAutosave } from '../../composables/useDraftAutosave.js';
import FormPage from '../../components/FormPage.vue';
import StatusTag from '../../components/StatusTag.vue';

const route = useRoute();
const userStore = useUserStore();
const { confirm } = useConfirm();
const team = reactive({ name: '', teachers: [], classes: [], createdBy: null });
const tab = ref('teachers');

const allTeachers = ref([]);
const selectedTeachers = ref([]);
const teacherOptions = computed(() => allTeachers.value.filter(t => t.id !== team.createdBy).map(t => ({ value: t.id, label: `${t.realName}（${t.username}）` })));
function filterTeacher(input, option) { return option.label.toLowerCase().includes(input.toLowerCase()); }

const avalClasses = ref([]);
const selectedClasses = ref([]);
const myClassIds = ref([]);
const classOptions = computed(() => avalClasses.value.map(c => ({ value: c.id, label: c.name })));
function filterClass(input, option) { return option.label.toLowerCase().includes(input.toLowerCase()); }

const tCols = [
  { title: '姓名', key: 'name', width: 120 },
  { title: '工号', key: 'username', width: 140 },
  { title: '角色', key: 'role', width: 80 },
  { title: '操作', key: 'action', width: 80, align: 'right' },
];
const cCols = [
  { title: '班级名称', key: 'cname', width: 180, ellipsis: true },
  { title: '归属教师', key: 'cowner', width: 100 },
  { title: '操作', key: 'action', width: 80, align: 'right' },
];

async function fetch() {
  const r = await request.get(`/teacher/teams/${route.params.id}`);
  Object.assign(team, r.data);
  selectedTeachers.value = (team.teachers || []).filter(t => t.teacherId !== team.createdBy).map(t => t.teacherId);
  selectedClasses.value = (team.classes || []).map(c => c.classId);
}
async function loadTeachers() {
  const r = await request.get('/teacher/teachers', { params: { schoolId: userStore.currentSchool?.id } });
  allTeachers.value = r.data || [];
}
async function loadClasses() {
  const r = await request.get('/teacher/classes');
  avalClasses.value = r.data || [];
  myClassIds.value = (r.data || []).filter(c => !c.isTeamClass).map(c => c.id);
}

/** 教师名单保存（原 300ms 防抖 → useDraftAutosave，delay 原样保留） */
async function saveTeachers() {
  const ids = [...new Set([team.createdBy, ...selectedTeachers.value])];
  await request.put(`/teacher/teams/${route.params.id}`, { teacherIds: ids });
  message.success('教师已更新');
  fetch();
}
const teacherSaver = useDraftAutosave({ save: saveTeachers, delay: 300 });

/** 共享班级保存（同上） */
async function saveClasses() {
  await request.put(`/teacher/teams/${route.params.id}`, { classIds: selectedClasses.value });
  message.success('班级已更新');
  fetch();
}
const classSaver = useDraftAutosave({ save: saveClasses, delay: 300 });

function scheduleSaveTeachers() { teacherSaver.schedule(); }
function scheduleSaveClasses() { classSaver.schedule(); }

function removeTeacher(tid) {
  selectedTeachers.value = selectedTeachers.value.filter(id => id !== tid);
  scheduleSaveTeachers();
}

function removeClass(cid) {
  selectedClasses.value = selectedClasses.value.filter(id => id !== cid);
  scheduleSaveClasses();
}

function onTeacherSelect() { scheduleSaveTeachers(); }
function onClassSelect() { scheduleSaveClasses(); }

/** 动作条状态文本：任一通道同步中/失败优先，否则显示最近一次成功时间 */
const statusText = computed(() => {
  const states = [teacherSaver.status.value, classSaver.status.value];
  if (states.includes('saving')) return '同步中…';
  if (states.includes('error')) return '同步失败';
  const last = [teacherSaver.lastSavedAt.value, classSaver.lastSavedAt.value].filter(Boolean).sort((a, b) => b - a)[0];
  if (last) return '已同步 ' + last.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return '改动会自动保存';
});

function teacherLabel(id) {
  return (team.teachers || []).find(t => t.teacherId === id)?.teacher?.realName
    || allTeachers.value.find(t => t.id === id)?.realName
    || '该教师';
}
function classLabel(id) {
  return (team.classes || []).find(c => c.classId === id)?.class?.name
    || avalClasses.value.find(c => c.id === id)?.name
    || '该班级';
}

// 拦截下拉框取消选中，弹确认后走表格移除逻辑
watch(selectedTeachers, (nv, ov) => {
  if (nv.length < ov.length) {
    const removed = ov.find(id => !nv.includes(id));
    if (removed) {
      selectedTeachers.value = ov; // 先恢复
      confirm({
        title: '移除团队教师',
        content: `将把「${teacherLabel(removed)}」移出本团队，其对团队共享班级与题库的权限立即失效（可随时重新添加）。`,
        okText: '移除教师',
        cancelText: '取消',
        danger: true,
        onOk: () => { removeTeacher(removed); },
      });
    }
  }
});
watch(selectedClasses, (nv, ov) => {
  if (nv.length < ov.length) {
    const removed = ov.find(n => !nv.includes(n));
    if (removed) {
      selectedClasses.value = ov;
      confirm({
        title: '移除共享班级',
        content: `将把「${classLabel(removed)}」移出本团队，团队教师不再共享该班级的数据（可随时重新添加）。`,
        okText: '移除班级',
        cancelText: '取消',
        danger: true,
        onOk: () => { removeClass(removed); },
      });
    }
  }
});

onMounted(() => { fetch(); loadTeachers(); loadClasses(); });
</script>

<style scoped>
.team-card {
  border: 1px solid var(--card-bd);
}
.mb16 {
  margin-bottom: var(--space-4);
}
.w-full {
  width: 100%;
}
.dim-text {
  color: var(--text-tertiary);
}
.save-status {
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
}
/* 仅供读屏的字段标签（T5-A2）：视觉不可见，为控件提供可访问名称 */
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
