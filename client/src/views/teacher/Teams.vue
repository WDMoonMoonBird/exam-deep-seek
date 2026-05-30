<template>
  <div class="page">
    <div class="page-header">
      <h2>教学团队</h2>
      <a-button type="primary" @click="openCreate">创建团队</a-button>
    </div>
    <a-card class="page-card">
      <a-table :columns="columns" :dataSource="list" rowKey="id" :loading="loading" :scroll="{ x: 'max-content' }" :pagination="false">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'creator'">{{ record.creator?.realName }}</template>
          <template v-if="column.key === 'counts'">{{ record._count?.teachers || 0 }} 教师 / {{ record._count?.classes || 0 }} 班级</template>
          <template v-if="column.key === 'action'">
            <a-space>
              <a-button type="link" @click="$router.push(`/teacher/teams/${record.id}`)">管理</a-button>
              <a-popconfirm v-if="record.createdBy === userStore.user?.id" title="确定删除该团队？" ok-text="确定" cancel-text="取消" @confirm="del(record.id)">
                <a-button type="link" danger>删除</a-button>
              </a-popconfirm>
              <a-popconfirm v-else title="确定退出该团队？" ok-text="确定" cancel-text="取消" @confirm="leave(record.id)">
                <a-button type="link">退出</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal title="创建团队" :open="createVisible" @ok="handleCreate" @cancel="createVisible = false" ok-text="确定" cancel-text="取消" :width="400" wrap-class-name="form-modal">
      <a-form><a-form-item label="团队名称"><a-input v-model:value="createName" /></a-form-item></a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import { useUserStore } from '../../stores/user.js';

const userStore = useUserStore();
const loading = ref(false); const list = ref([]);
const createVisible = ref(false); const createName = ref('');

const columns = [
  { title: '团队名称', dataIndex: 'name', width: 200, ellipsis: true },
  { title: '创建者', key: 'creator', width: 100 },
  { title: '成员', key: 'counts', width: 160 },
  { title: '创建时间', dataIndex: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 160 },
];

async function fetch() {
  loading.value = true;
  const r = await request.get('/teacher/teams', { params: { schoolId: userStore.currentSchool?.id } });
  list.value = r.data || [];
  loading.value = false;
}
function openCreate() { createName.value = ''; createVisible.value = true; }
async function handleCreate() {
  if (!createName.value) return message.warn('请输入团队名称');
  await request.post('/teacher/teams', { name: createName.value }, { params: { schoolId: userStore.currentSchool?.id } });
  message.success('创建成功');
  createVisible.value = false; fetch();
}
async function del(id) { await request.delete(`/teacher/teams/${id}`); message.success('删除成功'); fetch(); }
async function leave(id) { await request.post(`/teacher/teams/${id}/leave`); message.success('已退出团队'); fetch(); }
onMounted(fetch);
</script>

<style scoped>
.page { max-width: 1400px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.page-header h2 { font-size: 28px; }
.page-card { border: 1px solid var(--hairline); }
</style>
