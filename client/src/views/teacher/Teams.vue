<template>
  <PageShell
    title="教学团队"
    description="把班级和同事编入团队，团队内的班级、题库可共享给成员。"
  >
    <template #actions>
      <a-button type="primary" @click="openCreate">创建团队</a-button>
    </template>

    <!-- TODO(P1-7): 接口支持服务端分页后切换（/teacher/teams 目前全量返回，沿用前端切片） -->
    <ListPage
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="list.length"
      :current="page.current"
      :page-size="page.pageSize"
      empty-title="还没有教学团队"
      empty-desc="创建团队后，可把班级加入团队，与同事共享班级和题库。"
      empty-action-text="创建团队"
      @page-change="onPageChange"
      @empty-action="openCreate"
    >
      <template #toolbar-right>
        <span class="muted">共 {{ list.length }} 个团队</span>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'creator'">{{ record.creator?.realName }}</template>
        <template v-else-if="column.key === 'counts'">
          {{ record._count?.teachers || 0 }} 教师 / {{ record._count?.classes || 0 }} 班级
        </template>
        <template v-else-if="column.key === 'createdAt'">
          <span class="tnum">{{ formatDateTime(record.createdAt) }}</span>
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button type="link" @click="$router.push(`/teacher/teams/${record.id}`)">管理</a-button>
            <a-popconfirm v-if="record.createdBy === userStore.user?.id" title="确定删除该团队？" ok-text="确定" cancel-text="取消" @confirm="del(record.id)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
            <a-popconfirm v-else title="确定退出该团队？" ok-text="确定" cancel-text="取消" @confirm="leave(record.id)">
              <a-button type="link">退出</a-button>
            </a-popconfirm>
          </div>
        </template>
      </template>
    </ListPage>

    <a-modal title="创建团队" :open="createVisible" @ok="handleCreate" @cancel="createVisible = false" ok-text="确定" cancel-text="取消" :width="400" wrap-class-name="form-modal">
      <a-form><a-form-item label="团队名称"><a-input v-model:value="createName" /></a-form-item></a-form>
    </a-modal>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import { useUserStore } from '../../stores/user.js';
import { formatDateTime } from '../../domain/format.js';

const userStore = useUserStore();
const loading = ref(false);
const list = ref([]);
const page = reactive({ current: 1, pageSize: 20 });
const createVisible = ref(false);
const createName = ref('');

const columns = [
  { title: '团队名称', dataIndex: 'name', width: 200, ellipsis: true },
  { title: '创建者', key: 'creator', width: 100 },
  { title: '成员', key: 'counts', width: 160 },
  { title: '创建时间', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 160, align: 'right' },
];

/** 前端切片：接口全量返回（见上方 TODO(P1-7)） */
const pagedList = computed(() => list.value.slice((page.current - 1) * page.pageSize, page.current * page.pageSize));

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
</style>
