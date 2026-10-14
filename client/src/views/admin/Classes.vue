<template>
  <PageShell
    title="班级管理"
    description="维护各学校的班级，并为班级指定任课教师。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <a-button type="primary" @click="openAdd">新增班级</a-button>
    </template>

    <!-- TODO(P1-7): 接口支持服务端分页后切换（/admin/classes 目前全量返回，暂由前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      empty-title="还没有班级"
      empty-desc="创建班级后，就可以把教师和学生分配进去。"
      empty-action-text="新增班级"
      @page-change="onPageChange"
      @empty-action="openAdd"
    >
      <template #bodyCell="{ column, record }">
        <!-- 班级名称：两行式（班级名 + 所属学校）；学校不再单列，无学校时沿用改前的「—」 -->
        <template v-if="column.key === 'name'">
          <span class="lp-stack">
            <b>{{ record.name }}</b>
            <span>{{ record.school?.name || '—' }}</span>
          </span>
        </template>
        <template v-else-if="column.key === 'createdAt'">{{ formatDate(record.createdAt) }}</template>
        <template v-else-if="column.key === 'action'">
          <div class="lp-actions">
            <a-button type="link" @click="openEdit(record)">编辑</a-button>
            <a-popconfirm title="确认删除该班级？" description="删除后该班级的学生/教师关联与作业布置记录一并移除，不可撤销。" ok-text="删除班级" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="del(record.id)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </div>
        </template>
      </template>
    </ListPage>

    <a-modal :title="modalTitle" :open="visible" @ok="handleOk" @cancel="visible = false" :ok-text="isEdit ? '保存修改' : '新增班级'" cancel-text="取消" :width="640" wrap-class-name="form-modal">
      <a-form :model="form">
        <a-form-item label="班级名称" html-for="admin-class-name">
          <a-input id="admin-class-name" v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="所属学校" html-for="admin-class-school">
          <a-select id="admin-class-school" v-model:value="form.schoolId" placeholder="选择学校">
            <a-select-option v-for="s in schools" :key="s.id" :value="s.id">{{ s.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="指定教师" html-for="admin-class-teachers">
          <a-select id="admin-class-teachers" v-model:value="form.teacherIds" mode="multiple" placeholder="可多选">
            <a-select-option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.realName }}（{{ t.username }}）</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import request from '../../api/request.js';
import { useSafeRequest } from '../../composables/useSafeRequest.js';   // ★W1（t1）：失败就地提示、不冒泡
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import { formatDate } from '../../domain/format.js';

const { safeLoad, safeSubmit } = useSafeRequest({ tag: 'admin/Classes.vue' });
const loading = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const schools = ref([]);
const teachers = ref([]);
const visible = ref(false);
const modalTitle = ref('');
const isEdit = ref(false);
const editId = ref(null);
const form = reactive({ name: '', schoolId: undefined, teacherIds: [] });

// 列表样式 v2：班级名称列两行式（班级名 + 所属学校，原「所属学校」列并入次行）；操作列右对齐紧凑
const columns = [
  { title: '班级名称', key: 'name', dataIndex: 'name', width: '1fr' },
  { title: '创建时间', key: 'createdAt', width: 120, responsive: ['xl'] },
  { title: '操作', key: 'action', width: 120, align: 'right' },
];

/** /admin/classes 目前全量返回 → 保持前端切片分页（见模板 TODO(P1-7)） */
const pagedList = computed(() => {
  const start = (page.current - 1) * page.pageSize;
  return list.value.slice(start, start + page.pageSize);
});

function onPageChange(p) {
  page.current = p;
}

async function fetch() {
  loading.value = true;
  try {
    const r = await safeLoad(() => request.get('/admin/classes'), { action: '加载班级列表' });
    if (!r.error) list.value = r.data || [];
  } finally {
    loading.value = false;
  }
}

async function loadOptions() {
  const [s, t] = await Promise.all([
    safeLoad(() => request.get('/admin/schools'), { action: '加载学校列表' }),
    safeLoad(() => request.get('/admin/teachers'), { action: '加载教师列表' }),
  ]);
  if (!s.error) schools.value = s.data || [];
  if (!t.error) teachers.value = t.data || [];
}

function openAdd() {
  isEdit.value = false; modalTitle.value = '新增班级';
  form.name = ''; form.schoolId = undefined; form.teacherIds = [];
  loadOptions(); visible.value = true;
}

function openEdit(record) {
  isEdit.value = true; editId.value = record.id; modalTitle.value = '编辑班级';
  form.name = record.name; form.schoolId = record.schoolId;
  form.teacherIds = (record.teacherClasses || []).map(tc => tc.teacherId).filter(Boolean);
  loadOptions(); visible.value = true;
}

async function handleOk() {
  const d = { name: form.name, schoolId: form.schoolId, teacherIds: form.teacherIds };
  // ★W1（t1）：提交走 safeSubmit ⇒ 400/500 只就地提示，弹窗不关、列表不消失（旧写法会让整页被错误页替换）
  const r = await safeSubmit(
    () => (isEdit.value ? request.put(`/admin/classes/${editId.value}`, d) : request.post('/admin/classes', d)),
    { action: isEdit.value ? '保存' : '新增' },
  );
  if (r.error) return;
  visible.value = false;
  fetch();
}

async function del(id) {
  const r = await safeSubmit(() => request.delete(`/admin/classes/${id}`), { action: '删除' });
  if (r.error) return;
  fetch();
}

onMounted(fetch);
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
.row-actions {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
}
</style>
