<template>
  <div class="dt-root">
    <!-- 工具栏区域 -->
    <div v-if="$slots['toolbar-left'] || $slots['toolbar-right'] || $slots.toolbar" class="dt-toolbar">
      <slot v-if="$slots.toolbar" name="toolbar" />
      <template v-else>
        <div class="dt-toolbar-left">
          <slot name="toolbar-left" />
        </div>
        <div class="dt-toolbar-right">
          <slot name="toolbar-right" />
        </div>
      </template>
    </div>

    <!-- 表格卡片 -->
    <a-card ref="cardRef" :class="['dt-card', { 'dt-center': centerContent, 'dt-paging': paging }]">
      <a-table
        :columns="columns"
        :dataSource="displayData"
        :rowKey="rowKey"
        :loading="loading"
        :pagination="false"
        :scroll="scrollConfig"
        :sticky="true"
        :size="size"
        :locale="tableLocale"
        :customRow="customRow"
        @change="(p, f, s) => $emit('change', p, f, s)"
      >
        <template v-for="slotName in passthroughSlots" :key="slotName" #[slotName]="slotData">
          <slot :name="slotName" v-bind="slotData || {}" />
        </template>
      </a-table>

      <!-- 固定底部分页栏 -->
      <div v-if="showPagination && effectiveTotal > 0" class="dt-footer">
        <slot name="footer-left" />
        <a-pagination
          :current="current"
          :total="effectiveTotal"
          :pageSize="pageSize"
          :showTotal="showTotal"
          :showSizeChanger="showSizeChanger"
          :pageSizeOptions="pageSizeOptions"
          @change="onPageChange"
          @showSizeChange="onShowSizeChange"
        />
        <slot name="footer-right" />
      </div>
    </a-card>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick, useSlots } from 'vue';

// 默认中文排序提示
const DEFAULT_LOCALE = {
  triggerAsc: '点击升序',
  triggerDesc: '点击降序',
  cancelSort: '取消排序',
  filterConfirm: '确定',
  filterReset: '重置',
};

const props = defineProps({
  columns: { type: Array, required: true },
  dataSource: { type: Array, required: true },
  rowKey: { type: [String, Function], default: 'id' },
  loading: { type: Boolean, default: false },
  current: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
  showPagination: { type: Boolean, default: undefined },
  showTotal: { type: Function, default: undefined },
  showSizeChanger: { type: Boolean, default: false },
  centerContent: { type: Boolean, default: true },
  pageSizeOptions: { type: Array, default: undefined },
  scrollX: { type: [String, Number], default: 'max-content' },
  scrollOffset: { type: Number, default: 90 },
  customRow: { type: Function, default: undefined },
  locale: { type: Object, default: undefined },
  clientPagination: { type: Boolean, default: false },
  size: { type: String, default: 'small' },
});

const emit = defineEmits([
  'update:current',
  'update:pageSize',
  'page-change',
  'change',
]);

// 排序提示默认中文，可通过 props 覆盖
const tableLocale = computed(() => props.locale ?? DEFAULT_LOCALE);

const slots = useSlots();

// 过滤出需要透传给 a-table 的 slots
const OWN_SLOTS = ['toolbar', 'toolbar-left', 'toolbar-right', 'footer-left', 'footer-right', 'footer-extra'];
const passthroughSlots = computed(() =>
  Object.keys(slots).filter(k => !OWN_SLOTS.includes(k))
);

// 有效 total：客户端分页时用 dataSource 长度，否则用 props.total
const effectiveTotal = computed(() =>
  props.clientPagination ? props.dataSource.length : props.total
);

// 客户端分页：对 dataSource 切片
const displayData = computed(() => {
  if (props.clientPagination && effectiveTotal.value > props.pageSize) {
    const start = (props.current - 1) * props.pageSize;
    return props.dataSource.slice(start, start + props.pageSize);
  }
  return props.dataSource;
});

// 是否显示分页栏
const showPagination = computed(() => {
  if (props.showPagination !== undefined) return props.showPagination;
  return effectiveTotal.value > props.pageSize;
});

// 动态滚动高度
const scrollY = ref(400);
const scrollConfig = computed(() => ({
  x: props.scrollX,
  y: scrollY.value,
}));

const cardRef = ref(null);
let observer = null;

function updateScrollY() {
  nextTick(() => {
    const card = cardRef.value?.$el || cardRef.value;
    if (!card) return;
    scrollY.value = Math.max(200, card.clientHeight - props.scrollOffset);
  });
}

// 翻页动效状态
const paging = ref(false);

// 监听外部页码变化（v-model:current）
let prevPage = props.current;
watch(() => props.current, (next) => {
  if (next !== prevPage) { prevPage = next; triggerPageAnim(); }
});

function triggerPageAnim() {
  paging.value = true;
  nextTick(() => {
    const body = cardRef.value?.$el?.querySelector('.ant-table-body');
    if (body) body.scrollTop = 0;
  });
  setTimeout(() => { paging.value = false; }, 350);
}

function onPageChange(page, pageSize) {
  emit('update:current', page);
  emit('page-change', page, pageSize);
}

function onShowSizeChange(current, size) {
  emit('update:current', 1);
  emit('update:pageSize', size);
  emit('page-change', 1, size);
}

onMounted(() => {
  nextTick(() => {
    const card = cardRef.value?.$el || cardRef.value;
    if (card) {
      observer = new ResizeObserver(() => updateScrollY());
      observer.observe(card);
    }
    updateScrollY();
  });
});

onUnmounted(() => {
  if (observer) observer.disconnect();
});

defineExpose({ updateScrollY });
</script>

<style scoped>
.dt-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dt-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
  justify-content: space-between;
}

.dt-toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dt-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.dt-card {
  flex: 1;
  min-height: 0;
  border-radius: 12px;
  overflow: clip;
  border: 1px solid var(--hairline);
}

.dt-card :deep(.ant-card-body) {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 表格撑满卡片 */
.dt-card :deep(.ant-table-wrapper) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dt-card :deep(.ant-spin-nested-loading) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dt-card :deep(.ant-spin-container) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dt-card :deep(.ant-table) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dt-card :deep(.ant-table-container) {
  flex: 1;
  min-height: 0;
}
.dt-card :deep(.ant-table-header) {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  position: relative;
  z-index: 3;
  flex-shrink: 0;
}

/* 表头、内容居中（可通过 centerContent prop 关闭） */
.dt-card.dt-center :deep(.ant-table-thead > tr > th) {
  text-align: center !important;
}
.dt-card.dt-center :deep(.ant-table-tbody > tr > td) {
  text-align: center !important;
}

/* 表体滚动 */
.dt-card :deep(.ant-table-body) {
  overflow-y: scroll !important;
}

/* 无单元格底边框 */
.dt-card :deep(.ant-table-cell) {
  border-bottom: none !important;
}

/* 翻页动效：行淡入上移 */
.dt-card.dt-paging :deep(.ant-table-tbody > tr) {
  animation: dt-row-in .35s ease-out both;
}
.dt-card.dt-paging :deep(.ant-table-tbody > tr:nth-child(1)) { animation-delay: 0.02s; }
.dt-card.dt-paging :deep(.ant-table-tbody > tr:nth-child(2)) { animation-delay: 0.04s; }
.dt-card.dt-paging :deep(.ant-table-tbody > tr:nth-child(3)) { animation-delay: 0.06s; }
.dt-card.dt-paging :deep(.ant-table-tbody > tr:nth-child(4)) { animation-delay: 0.08s; }
.dt-card.dt-paging :deep(.ant-table-tbody > tr:nth-child(5)) { animation-delay: 0.10s; }

@keyframes dt-row-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 底部分页栏 */
.dt-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 16px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.06);
  position: relative;
  z-index: 2;
  flex-shrink: 0;
}
</style>
