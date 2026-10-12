<template>
  <!-- 参考实现：PageShell + ListPage + StatusTag（其余 13 个列表页照此抄写） -->
  <PageShell
    title="题库管理"
    description="管理你的编程题与实训题；布置作业时从这里选题。"
    :max-width="'var(--layout-content-max)'"
  >
    <template #actions>
      <!-- 新增题目菜单：与欢迎页演示控制台同款（图标 + 主标题 + 副说明两行；展开时箭头旋转 180°）。
           菜单会被 teleport 到 body，故两行排版写在全局 styles/overrides.css 的 .new-q-menu 块里。 -->
      <a-dropdown v-model:open="newQOpen" overlay-class-name="new-q-menu" placement="bottomRight">
        <a-button type="primary">新增题目 <DownOutlined class="new-q-caret" :class="{ up: newQOpen }" /></a-button>
        <template #overlay>
          <a-menu @click="onNewQuestion">
            <a-menu-item key="code">
              <span class="nq-row">
                <CodeOutlined class="nq-ico" />
                <span class="nq-txt"><b>编程题</b><span class="nq-sub">在线作答 · AI 评分</span></span>
              </span>
            </a-menu-item>
            <a-menu-item key="project">
              <span class="nq-row">
                <FolderOpenOutlined class="nq-ico" />
                <span class="nq-txt">
                  <b>实训题 <a-tag class="tag-warning" size="small">BETA</a-tag></b>
                  <span class="nq-sub">上传标准工程包 · 评价式评分</span>
                </span>
              </span>
            </a-menu-item>
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
        <!-- 主键列：两行式（主文案 + 类型·小题数），保持列内上下对齐，横向比较不受影响 -->
        <template v-if="column.key === 'title'">
          <span class="lp-stack">
            <b>{{ record.title }}</b>
            <span>{{ (record.type === 'project' ? '实训题' : '编程题') + (record._count?.subQuestions ? ' · ' + record._count.subQuestions + ' 个小题' : '') }}</span>
          </span>
        </template>

        <template v-else-if="column.key === 'type'">
          <StatusTag
            :tone="record.type === 'project' ? 'accent' : 'brand'"
            :text="record.type === 'project' ? '实训题' : '编程题'"
          />
        </template>

        <template v-else-if="column.dataIndex === 'difficulty'">
          <StatusTag :tone="difficultyTone(record.difficulty)" :text="difficultyText(record.difficulty)" dot />
        </template>

        <template v-else-if="column.dataIndex === 'maxScore'">
          <span class="lp-num">{{ record.maxScore }}<u>分</u></span>
        </template>

        <template v-else-if="column.key === 'createdAt'">
          <span class="lp-stack is-plain">
            <b>{{ splitDateTime(record.createdAt).date }}</b>
            <span>{{ splitDateTime(record.createdAt).time }}</span>
          </span>
        </template>

        <template v-else-if="column.key === 'action'">
          <div class="lp-actions">
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
import { DownOutlined, CodeOutlined, FolderOpenOutlined } from '@ant-design/icons-vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';
import { splitDateTime, difficultyText } from '../../domain/format.js';

const router = useRouter();

const loading = ref(false);
/** 「新增题目」下拉是否展开：只用于把按钮上的箭头转 180°（与欢迎页演示一致） */
const newQOpen = ref(false);
const list = ref([]);
const keyword = ref('');
const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
const hasFilter = computed(() => !!keyword.value);

// 列表样式 v2：主键列两行式（标题 + 类型·小题数）；日期列固定两行；数字右对齐带单位
const columns = [
  { title: '标题', key: 'title', width: 260 },
  { title: '类型', key: 'type', width: 96 },
  { title: '难度', dataIndex: 'difficulty', width: 92, responsive: ['xl'] },
  { title: '满分', dataIndex: 'maxScore', width: 90, align: 'right' },
  { title: '创建时间', key: 'createdAt', width: 130, responsive: ['xl'] },
  { title: '操作', key: 'action', width: 120, align: 'right' },
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
/* 新增题目：展开时箭头旋转 180°（过渡与菜单同一时长） */
.new-q-caret {
  transition: transform var(--duration-fast) var(--ease-out);
}
.new-q-caret.up {
  transform: rotate(180deg);
}
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
