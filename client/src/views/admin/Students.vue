<template>
  <PageShell
    title="学生管理"
    description="维护学生账号，并把学生分配到班级。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <a-button type="primary" @click="openAdd">新增学生</a-button>
    </template>

    <!-- TODO(P1-7): 接口支持服务端分页后切换（/admin/students 目前全量返回，暂由前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      empty-title="还没有学生"
      empty-desc="新增学生后，即可把学生加入班级并参加作业。"
      empty-action-text="新增学生"
      @page-change="onPageChange"
      @empty-action="openAdd"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'classes'">
          <template v-for="c in record.studentClasses" :key="c.classId">
            <StatusTag v-if="c.class" tone="neutral" :text="c.class.name" />
          </template>
          <span v-if="!record.studentClasses?.length" class="muted">—</span>
        </template>
        <template v-else-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</template>
      </template>
    </ListPage>

    <a-modal title="新增学生" :open="visible" @ok="handleOk" @cancel="visible = false" ok-text="确定" cancel-text="取消">
      <a-form :model="form">
        <a-form-item label="学号"><a-input v-model:value="form.username" /></a-form-item>
        <a-form-item label="姓名"><a-input v-model:value="form.realName" /></a-form-item>
        <a-form-item label="班级">
          <a-select v-model:value="form.classIds" mode="multiple" placeholder="选择班级">
            <a-select-option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { formatDateTime } from '../../domain/format.js';
const loading = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const classes = ref([]);
const visible = ref(false);
const form = reactive({ username: '', realName: '', classIds: [] });

const columns = [
  { title: '学号', dataIndex: 'username', width: 130, ellipsis: true },
  { title: '姓名', dataIndex: 'realName', width: 120, ellipsis: true },
  { title: '班级', key: 'classes', width: 180 },
  { title: '创建时间', key: 'createdAt', width: 170, ellipsis: true },
];

/** /admin/students 目前全量返回 → 保持前端切片分页（见模板 TODO(P1-7)） */
const pagedList = computed(() => {
  const start = (page.current - 1) * page.pageSize;
  return list.value.slice(start, start + page.pageSize);
});

function onPageChange(p) {
  page.current = p;
}

async function fetch() {
  loading.value = true;
  const r = await request.get('/admin/students');
  list.value = r.data;
  loading.value = false;
}

async function openAdd() {
  form.username = ''; form.realName = ''; form.classIds = [];
  const r = await request.get('/admin/classes');
  classes.value = r.data;
  visible.value = true;
}

async function handleOk() {
  await request.post('/admin/students', { ...form });
  visible.value = false; fetch();
}

onMounted(fetch);
</script>

<style scoped>
.muted {
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
}
</style>
