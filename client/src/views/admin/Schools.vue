<template>
  <PageShell
    title="学校管理"
    :description="`数据来源：教育部全国高等学校名单，共 ${total} 所`"
    :max-width="'var(--layout-content-max)'"
  >
    <!-- 只读列表：学校数据由部署时导入的教育部名单生成，本页不提供增删改入口 -->
    <!-- TODO(P1-7): 接口支持服务端分页后切换（/admin/schools 目前全量返回，暂由前端切片） -->
    <ListPage
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
import { ref, reactive, computed, onMounted } from 'vue';
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
  { title: '院校代码', key: 'code', width: 140 },
  { title: '学校名称', dataIndex: 'name', width: 220, ellipsis: true },
  { title: '省份', key: 'province', width: 120 },
  { title: '城市', key: 'city', width: 120 },
  { title: '层次', key: 'level', width: 80 },
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

onMounted(fetch);
</script>
