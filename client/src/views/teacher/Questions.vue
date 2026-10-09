<template>
  <!-- 参考实现：PageShell + ListPage + StatusTag（其余 13 个列表页照此抄写） -->
  <PageShell
    title="题库管理"
    description="管理你的编程题与实训题；布置作业时从这里选题。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <a-dropdown>
        <a-button type="primary">新增题目 <DownOutlined /></a-button>
        <template #overlay>
          <a-menu @click="onNewQuestion">
            <a-menu-item key="code">编程题</a-menu-item>
            <a-menu-item key="project"><span>实训题 <a-tag color="orange" size="small">BETA</a-tag></span></a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </template>

    <!-- 服务端分页 + 服务端关键字筛选：/teacher/questions 支持 page / pageSize / keyword -->
    <ListPage
      :columns="columns"
      :data-source="list"
      :loading="loading"
      row-key="id"
      :total="pagination.total"
      :current="pagination.current"
      :page-size="pagination.pageSize"
      :empty-title="hasFilter ? '没有符合条件的题目' : '还没有创建过题目'"
      :empty-desc="hasFilter ? '换个关键词再试，或清空筛选查看全部题目。' : '创建编程题或实训题后，布置作业时就能选用它们。'"
      :empty-action-text="hasFilter ? '清空筛选' : '新建编程题'"
      @page-change="onPageChange"
      @empty-action="onEmptyAction"
    >
      <template #toolbar>
        <a-input-search
          v-model:value="keyword"
          placeholder="搜索题目标题"
          allow-clear
          class="w-260"
          @search="applyFilters"
        />
      </template>

      <template #toolbar-right>
        <span class="muted">共 {{ pagination.total }} 道</span>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <StatusTag
            :tone="record.type === 'project' ? 'accent' : 'brand'"
            :text="record.type === 'project' ? '实训题' : '编程题'"
          />
        </template>

        <template v-else-if="column.dataIndex === 'difficulty'">
          <StatusTag :tone="difficultyTone(record.difficulty)" :text="difficultyText(record.difficulty)" />
        </template>

        <template v-else-if="column.key === 'createdAt'">
          <span class="tnum">{{ formatDateTime(record.createdAt) }}</span>
        </template>

        <template v-else-if="column.key === 'action'">
          <div class="row-actions">
            <a-button type="link" @click="editQuestion(record)">编辑</a-button>
            <a-popconfirm title="确认删除该题目？" description="删除后该题目将从题库移除，已布置作业中的历史记录保留。" ok-text="删除题目" :ok-button-props="{ danger: true }" cancel-text="取消" @confirm="del(record.id)">
              <a-button type="link" danger>删除</a-button>
            </a-popconfirm>
          </div>
        </template>
      </template>
    </ListPage>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { DownOutlined } from '@ant-design/icons-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { formatDateTime, difficultyText } from '../../domain/format.js';

const router = useRouter();

const loading = ref(false);
const list = ref([]);
const keyword = ref('');
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
const hasFilter = computed(() => !!keyword.value);

const columns = [
  { title: '标题', dataIndex: 'title', width: 250, ellipsis: true },
  { title: '类型', key: 'type', width: 90 },
  { title: '难度', dataIndex: 'difficulty', width: 80 },
  { title: '满分', dataIndex: 'maxScore', width: 80, align: 'right' },
  { title: '创建时间', key: 'createdAt', width: 170 },
  { title: '操作', key: 'action', width: 160, align: 'right' },
];

/** 难度 → 状态色调（取值语义与改前的 a-tag 配色一致：easy 绿 / medium 橙 / 其余红） */
function difficultyTone(difficulty) {
  return difficulty === 'easy' ? 'success' : difficulty === 'medium' ? 'warning' : 'danger';
}

async function fetch() {
  loading.value = true;
  try {
    const params = { page: pagination.current, pageSize: pagination.pageSize };
    if (keyword.value) params.keyword = keyword.value;
    const r = await request.get('/teacher/questions', { params });
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
  keyword.value = '';
  applyFilters();
}

function onPageChange(page) {
  pagination.current = page;
  fetch();
}

/** 空态按钮：无搜索结果 → 清空筛选；无数据 → 去创建 */
function onEmptyAction() {
  if (hasFilter.value) resetFilters();
  else router.push('/teacher/questions/new');
}

async function del(id) {
  await request.delete(`/teacher/questions/${id}`);
  message.success('删除成功');
  fetch();
}

function editQuestion(record) {
  if (record.type === 'project') {
    router.push(`/teacher/questions/${record.id}/edit-project`);
  } else {
    router.push(`/teacher/questions/${record.id}/edit`);
  }
}

onMounted(fetch);

function onNewQuestion({ key }) {
  if (key === 'code') {
    router.push('/teacher/questions/new');
  } else {
    router.push('/teacher/questions/new/project');
  }
}
</script>

<style scoped>
.w-260 {
  width: 260px;
}
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
