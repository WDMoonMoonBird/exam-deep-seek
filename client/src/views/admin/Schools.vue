<template>
  <PageShell
    title="学校管理"
    :description="`数据来源：教育部全国高等学校名单，共 ${total} 所`"
    :max-width="'var(--layout-content-max)'"
  >
    <!-- 只读列表：学校数据由部署时导入的教育部名单生成，本页不提供增删改入口 -->
    <!-- TODO(P1-7): 接口支持服务端分页后切换（/admin/schools 目前全量返回，暂由前端切片） -->
    <!-- T5-A2（B2-7）：「每页条数」选择器由 ListPage 内部的 a-pagination 渲染（antd 生成的
         <input role="combobox">，自身既无 id 也无名称，是 axe label 规则在本页的唯一命中点）。
         这里按 t7 既有做法补「视觉隐藏 label + for/id 关联」；该 input 不由本页渲染，
         id 在挂载/更新后由 script 的 labelPageSizeSelect() 写到它身上。 -->
    <label for="schools-page-size" class="visually-hidden">每页条数</label>
    <ListPage
      ref="listRef"
      :columns="columns"
      :data-source="pagedList"
      :loading="loading"
      row-key="id"
      :total="total"
      :current="schoolPage.current"
      :page-size="schoolPage.pageSize"
      :show-size-changer="true"
      :page-size-options="pageSizeOptions"
      empty-title="还没有学校数据"
      empty-desc="学校名单由部署时导入「教育部全国高等学校名单」生成，导入后这里会列出全部院校。"
      @page-change="onPageChange"
      @size-change="onPageSizeChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'province'">{{ record.province || '—' }}</template>
        <template v-else-if="column.key === 'city'">{{ record.city || '—' }}</template>
        <template v-else-if="column.key === 'level'">
          <StatusTag v-if="record.level" :tone="levelTone(record.level)" :text="record.level" />
          <span v-else>—</span>
        </template>
        <template v-else-if="column.key === 'code'">{{ record.officialCode || '—' }}</template>
      </template>
    </ListPage>
  </PageShell>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUpdated } from 'vue';
import request from '../../api/request.js';
import PageShell from '../../components/PageShell.vue';
import ListPage from '../../components/ListPage.vue';
import StatusTag from '../../components/StatusTag.vue';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const schoolPage = reactive({ current: 1, pageSize: 50 });

/** 每页条数选项（20/50/100/200，与改前 DataTable 一致）—— 交给 ListPage 的每页条数切换渲染 */
const pageSizeOptions = [20, 50, 100, 200];

const columns = [
  { title: '院校代码', key: 'code', width: 140, responsive: ['xl'] },
  { title: '学校名称', dataIndex: 'name', width: 220, ellipsis: true },
  { title: '省份', key: 'province', width: 120 },
  { title: '城市', key: 'city', width: 120 },
  { title: '层次', key: 'level', width: 80, responsive: ['xl'] },
];

/** 层次 → 状态色调（取值语义与改前一致，只做视觉分层，不新增取值） */
function levelTone(level) {
  return level === '本科' ? 'brand' : 'neutral';
}

/** /admin/schools 目前全量返回 → 保持前端切片分页（见模板 TODO(P1-7)） */
const pagedList = computed(() => {
  const start = (schoolPage.current - 1) * schoolPage.pageSize;
  return list.value.slice(start, start + schoolPage.pageSize);
});

function onPageChange(p) {
  schoolPage.current = p;
}

/** 每页条数变化：写入新条数并回到第 1 页（与改前 DataTable 的 showSizeChange 行为一致） */
function onPageSizeChange(size, page) {
  schoolPage.pageSize = size;
  schoolPage.current = page || 1;
}

async function fetch() {
  loading.value = true;
  const r = await request.get('/admin/schools');
  list.value = r.data;
  total.value = r.data.length;
  loading.value = false;
}

const listRef = ref(null);

/**
 * T5-A2（B2-7）：a-pagination 的「每页条数」select 由 ListPage（共享组件，不在本任务范围）渲染，
 * 页面侧拿不到它的 input 做声明式关联 → 按 t7 既有做法补「视觉隐藏 label + for/id」：
 * 挂载后与每次更新后把固定 id 写到那个 input 上（若 antd 重渲染把 id 改回自动值，这里会立即纠正）。
 * 只写 id 属性：控件、取值与行为（20/50/100/200 → size-change → 前端切片）完全不变。
 */
const PAGE_SIZE_SELECT_ID = 'schools-page-size';
function labelPageSizeSelect() {
  const input = listRef.value?.$el?.querySelector('.table-foot .ant-select-selection-search-input');
  if (input && input.id !== PAGE_SIZE_SELECT_ID) input.id = PAGE_SIZE_SELECT_ID;
}

onMounted(() => {
  fetch();
  labelPageSizeSelect();
});
onUpdated(labelPageSizeSelect);
</script>

<style scoped>
/* 视觉隐藏但保留给读屏（T5-A2 既有实现，与 t7 各页逐字一致） */
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
