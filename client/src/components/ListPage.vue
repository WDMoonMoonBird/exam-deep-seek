<template>
  <div ref="cardRef" class="card" :class="{ 'is-stuck': stuck }">
    <div v-if="$slots.toolbar || $slots['toolbar-right']" class="toolbar">
      <div class="toolbar-main">
        <slot name="toolbar" />
      </div>
      <div class="toolbar-right">
        <slot name="toolbar-right" />
      </div>
    </div>

    <a-table
      class="tbl"
      :columns="columns"
      :data-source="errorMessage ? [] : dataSource"
      :row-key="rowKey"
      :loading="loading"
      :pagination="false"
      :sticky="stickyConfig"
      :scroll="TABLE_SCROLL"
      @change="onTableChange"
    >
      <template #bodyCell="cellProps">
        <slot name="bodyCell" v-bind="cellProps || {}" />
      </template>

      <!-- 错误态优先（传 error 才出现；表头保留、表体换成「错误文案 + 重试」），
           未传 error 时走下面的空态三件套，与 Wave 1 行为完全一致 -->
      <template #emptyText>
        <template v-if="errorMessage">
          <slot name="error" :message="errorMessage" :retry="retry">
            <div class="errored" role="alert">
              <div class="errored-title">{{ errorMessage }}</div>
              <div class="errored-desc">数据加载失败，可重试或稍后再试。</div>
              <a-button @click="retry">重试</a-button>
            </div>
          </slot>
        </template>

        <!-- 空态三件套（标题 / 描述 / 主操作），emptyActionText 为空时只显示文案 -->
        <div v-else class="empty">
          <div class="empty-title">{{ emptyTitle }}</div>
          <div v-if="emptyDesc" class="empty-desc">{{ emptyDesc }}</div>
          <a-button v-if="emptyActionText" type="primary" @click="emit('empty-action')">
            {{ emptyActionText }}
          </a-button>
        </div>
      </template>
    </a-table>

    <div v-if="showFoot" class="table-foot">
      <span>第 {{ current }} 页 · 每页 {{ pageSize }} 条</span>
      <!-- T5-A2（B2-8）：「每页条数」select 由 antd 在 a-pagination 内部渲染，自身既无 id 也无名称
           （axe label 规则会命中它）。属主在这里 → 组件自己给一条视觉隐藏 label，并把唯一 id
           写到那个 input 上（labelSizeChanger，挂载后 + 每次更新后）。
           仅 showSizeChanger 开启时渲染：未开启时 antd 不渲染该 select，这里也不留悬空 label。 -->
      <label v-if="showSizeChanger" :for="sizeSelectId" class="visually-hidden">每页条数</label>
      <a-pagination
        ref="paginationRef"
        :current="current"
        :page-size="pageSize"
        :total="total"
        :show-size-changer="showSizeChanger"
        :page-size-options="pageSizeOptions"
        size="small"
        @change="onPageChange"
        @showSizeChange="onSizeChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUpdated, onBeforeUnmount, useId } from 'vue';

/**
 * ListPage —— 列表页容器（Wave 1 骨架组件）
 * 契约见 docs/ui-redesign/09-wave1-brief.md §2；样式逐字取自 Wave 0 试点页
 * views/teacher/Assignments.vue 的 .card / .toolbar / .tbl / .table-foot / .empty。
 *
 * props：columns / dataSource / loading / rowKey / total / current / pageSize
 *        / emptyTitle / emptyDesc / emptyActionText
 *        / stickyContainer（选择器字符串 或 HTMLElement；默认 null → 解析 '.content'）
 *        / showSizeChanger（每页条数切换，默认 false）· pageSizeOptions（默认 [20,50,100]）
 *        / hideOnSinglePage（单页时整条分页栏不渲染，默认 false）
 *        / error（Wave 2 R-10：传错误文案即启用页内错误态 + 重试，空/不传 = 关闭）
 * slots：toolbar(左) / toolbar-right(右) / bodyCell(原样透传给 a-table)
 *        / error（错误态自定义，作用域参数 { message, retry }）
 * events：page-change(页码) / empty-action / change(a-table 的 pagination, filters, sorter 原样透传)
 *        / size-change(新每页条数, 新页码) · update:pageSize(支持 v-model:page-size) · retry(错误态重试)
 *
 * **向后兼容**：showSizeChanger / hideOnSinglePage / error 三项默认关闭，13 个列表页不传即保持
 * Wave 1 行为（分页栏常显、无每页条数切换、空态三件套不变）。
 * 说明：**不内置任何请求逻辑**，只通过 @page-change 抛出页码，由页面自行取数。
 *
 * 粘性表头：走 antd 的 :sticky，显式传 getContainer（本应用滚动宿主是 Layout 的
 * main.ant-layout-content.content，window 根本不滚；默认解析 '.content'，可用 stickyContainer 覆盖）
 * + offsetHeader（吸附线 = 顶栏下沿，详见 computeStickyOffset 的实测说明）。
 * 不设 scroll.y、不做表体内部滚动、不引入页面级高度链。下滚后加 .is-stuck 投影
 * （--table-sticky-shadow），回到顶部自动移除。13 个列表页无需任何配置即生效。
 */
const props = defineProps({
  columns: { type: Array, required: true },
  dataSource: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  rowKey: { type: [String, Function], default: 'id' },
  total: { type: Number, default: 0 },
  current: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  emptyTitle: { type: String, default: '暂无数据' },
  emptyDesc: { type: String, default: '' },
  emptyActionText: { type: String, default: '' },
  /** 粘性表头的滚动宿主：选择器字符串 / HTMLElement / null（默认 null → 解析 '.content'） */
  stickyContainer: { type: [String, Object], default: null },
  /** 每页条数切换（R-9）：默认 false —— 13 个列表页现状不变 */
  showSizeChanger: { type: Boolean, default: false },
  /** 可选每页条数（R-9）；admin/Schools 传 [20, 50, 100, 200] 即接回原页面的兜底 a-select */
  pageSizeOptions: { type: Array, default: () => [20, 50, 100] },
  /** 单页时隐藏整条分页栏（R-9）：默认 false —— 现状不变 */
  hideOnSinglePage: { type: Boolean, default: false },
  /**
   * 错误态（R-10）：传错误文案（字符串）或 true 即启用「表体换错误提示 + 重试按钮」，表头保留；
   * 空字符串 / 不传 = 关闭，行为与 Wave 1 完全一致。配合 request 的 { silent: true } 使用。
   */
  error: { type: [String, Boolean], default: '' },
});

const emit = defineEmits(['page-change', 'size-change', 'empty-action', 'change', 'retry', 'update:pageSize']);

/**
 * R-23（组件侧）：表格窄屏横向滚动**只在表体内发生**，不再把溢出传导到 .content。
 * 必须走 antd 的 scroll.x —— 它会把表头放进 .ant-table-sticky-holder（body 的兄弟节点），
 * 表体单独 overflow-x: auto，并用 StickyScrollBar 同步表头/表体的横向滚动；
 * 自己加 CSS overflow 会（a）让粘性表头改成相对该盒子吸附而失效，（b）横滚时表头与表体错位。
 * 只设 x、不设 y：竖向仍是页面滚动 + 粘性表头（Wave 1 方案 a 的竖向行为不变）。
 */
const TABLE_SCROLL = { x: 'max-content' };

function onPageChange(page) {
  emit('page-change', page);
}

/** 每页条数变化：抛 update:pageSize（支持 v-model:page-size）与 size-change(size, page) 供页面同步 */
function onSizeChange(page, size) {
  emit('update:pageSize', size);
  emit('size-change', size, page);
}

/** 错误态文案：字符串取原文案，true 取通用文案，其余（空串/false）视为未启用 */
const errorMessage = computed(() => {
  if (typeof props.error === 'string') return props.error.trim();
  return props.error ? '数据加载失败' : '';
});

/** 单页时隐藏分页栏（hideOnSinglePage 关闭时恒为 true，保持现状） */
const showFoot = computed(() => !(props.hideOnSinglePage && props.total <= props.pageSize));

/** 错误态重试：只抛事件，不内置请求逻辑 */
function retry() {
  emit('retry');
}

/** a-table 的 change 原样透传（排序/筛选）：(pagination, filters, sorter) 三参不改写 */
function onTableChange(pagination, filters, sorter) {
  emit('change', pagination, filters, sorter);
}

/* =============== 分页「每页条数」的可访问名称（T5-A2 / B2-8） =============== */
/**
 * a-pagination 的「每页条数」select 是 antd 内部渲染的 <input role="combobox">，既没有 id 也没有
 * 可访问名称（11 个列表页里只有 admin/Schools 开启 showSizeChanger，故此前只有它被 axe label 命中）。
 * 该控件的属主是本组件 → 由本组件渲染隐藏 label（模板中的 .visually-hidden + :for），
 * 并在挂载后与每次更新后把这个「每实例唯一」的 id 写到它的 input 上；antd 若重渲染把 id 改回自动值，
 * 下一次更新会立即纠正。页面侧因此无需任何 DOM 补丁（曾于 B2-7 在 admin/Schools 临时补过，B2-8 已删）。
 * 只写 id 属性：分页行为、showSizeChanger 默认值（false）与切换逻辑完全不变。
 */
const paginationRef = ref(null);
/** 每实例唯一：一个页面可能出现多个 ListPage（当前 12 个页面均只用一个，此处仍按多实例设计） */
const sizeSelectId = `list-page-size-changer-${useId()}`;

function labelSizeChanger() {
  if (!props.showSizeChanger) return;                        // 未开启时 antd 不渲染该 select
  const input = paginationRef.value?.$el?.querySelector?.('input[role="combobox"]');
  if (input && input.id !== sizeSelectId) input.id = sizeSelectId;
}

/* ===================== 粘性表头（antd sticky + 滚动阴影） ===================== */
const cardRef = ref(null);
const stuck = ref(false);
/** 实际解析出的滚动宿主（HTMLElement）；未命中时为 null，交给 getContainer 每次重新解析 */
const resolvedContainer = ref(null);
const stickyOffset = ref(0);

/** 顶栏高度（.topbar 是 position:absolute;top:0 覆盖在内容区顶部，故吸附线要下移一个顶栏高度） */
function topbarOffset() {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--layout-topbar-h');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 56;
}

/**
 * 解析滚动宿主。兜底顺序：HTMLElement 入参 > 选择器命中 > window。
 * ① 选择器一律走 document 级解析（Layout 壳先挂载，页面在 router-view 内渲染，探测时 .content 必已在 DOM 中）；
 *    禁止「从 ListPage 自身根元素向上 closest」——首次 render 时自身 DOM 未挂载会返回 null，
 *    而 antd 的 stickyState 是依赖 sticky 配置身份的 computed，会把该回退缓存到组件生命周期结束。
 */
function resolveStickyContainer() {
  if (typeof document === 'undefined') return null;
  const custom = props.stickyContainer;
  if (custom && typeof custom === 'object' && custom.nodeType === 1) return custom;
  const selector = typeof custom === 'string' && custom ? custom : '.content';
  return document.querySelector(selector) || window;
}

/**
 * antd 渲染的是 position:sticky + 内联 top:<offsetHeader>px，该 top 相对「滚动宿主的吸附基线」计算。
 * 实测（Chromium + 本应用布局）：.content 的吸附基线是它的**内容盒顶部**（不是视口顶部，容器 padding-top=80px
 * = 顶栏 56 + --space-6 24），而顶栏覆盖在容器顶部 56px 处 —— 两者以 .content 顶边为原点，故：
 *   offsetHeader = 顶栏高 - 容器 padding-top = 56 - 80 = -24  →  吸附线正好落在顶栏下沿（实测 top=56）。
 * 只依赖两个「一开始就稳定」的 CSS 值（令牌 + padding），不吃首帧布局抖动；容器退化为 window 时
 * （整页滚动）基线即视口顶部，offsetHeader 取顶栏高本身。
 */
function computeStickyOffset(container) {
  const line = topbarOffset();
  if (!container || typeof container.getBoundingClientRect !== 'function') return line;
  const padTop = parseFloat(getComputedStyle(container).paddingTop) || 0;
  return Math.round(line - padTop);
}

/** 解析容器 + 重算吸附偏移（挂载、resize、stickyContainer 变化时调用） */
function syncStickyContext() {
  const c = resolveStickyContainer();
  resolvedContainer.value = c === window ? null : c;
  stickyOffset.value = computeStickyOffset(c);
}

/** 配置对象随 resolvedContainer / stickyOffset 变化而换身份，确保 antd 的 stickyState 重新求值 */
const stickyConfig = computed(() => ({
  getContainer: () => resolvedContainer.value || resolveStickyContainer(),
  offsetHeader: stickyOffset.value,
}));

let raf = 0;

/**
 * 表头是否已吸附：未吸附时表头与表格顶边同线，吸附后停在吸附线（顶栏下沿）之下。
 * 只比较表头与表格的相对位移，因此不关心具体滚动容器（.content / 窗口 / 弹窗内滚动都成立）。
 */
function updateStuck() {
  const root = cardRef.value;
  if (!root) return;
  const head = root.querySelector('.ant-table-thead');
  const table = root.querySelector('.tbl') || root;
  if (!head) {
    stuck.value = false;
    return;
  }
  stuck.value = head.getBoundingClientRect().top - table.getBoundingClientRect().top > 1;
}

function onScroll() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    updateStuck();
  });
}

onMounted(() => {
  syncStickyContext();
  updateStuck();
  labelSizeChanger();
  // 滚动事件不冒泡：捕获阶段监听才能收到任意滚动容器（实际是 Layout 的 .content）的滚动
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('resize', onResize);
});

/** 视口尺寸变化会改变内容区 padding（<768px 断点），吸附偏移随之重算 */
function onResize() {
  syncStickyContext();
  onScroll();
}

/** 页面显式换了滚动宿主时重新解析 */
watch(() => props.stickyContainer, syncStickyContext);

/** 任何重渲染后重新确认「每页条数」的 id 关联（数据/页码/每页条数变化都会走到这里） */
onUpdated(labelSizeChanger);

onBeforeUnmount(() => {
  document.removeEventListener('scroll', onScroll, { capture: true });
  window.removeEventListener('resize', onResize);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<style scoped>
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-bd);
  border-radius: var(--card-radius);
}

/* ===== 工具栏：左筛选 / 右次要操作 ===== */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 12px var(--card-pad);
  border-bottom: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}
.toolbar-main {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  flex-wrap: wrap;
}

/* ===== 表格（去竖线、表头左对齐、行高/hover 走令牌） ===== */
.tbl :deep(.ant-table) {
  background: transparent;
}
.tbl :deep(.ant-table-thead > tr > th) {
  background: var(--table-header-bg);
  color: var(--table-header-fg);
  font-size: var(--fs-body-sm);
  font-weight: 600;
  text-align: left;
  border-bottom: 1px solid var(--border-default);
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
}
.tbl :deep(.ant-table-thead > tr > th::before) {
  display: none;
}
/* 粘性表头：位置由 antd 的 :sticky（.ant-table-sticky-holder）负责，吸附线 = 顶栏下沿 */
.tbl :deep(.ant-table-sticky-holder) {
  z-index: 2;
}
/* 下滚后投影；回顶部由 JS 摘掉 .is-stuck */
.card.is-stuck .tbl :deep(.ant-table-sticky-holder) {
  box-shadow: var(--table-sticky-shadow);
}
.tbl :deep(.ant-table-tbody > tr > td) {
  padding: var(--table-cell-pad-y) var(--table-cell-pad-x);
  border-bottom: 1px solid var(--table-bd);
  vertical-align: middle;
}
.tbl :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--table-row-hover);
}
/* 选中态：行选择（13 个列表页暂未启用，令牌先行，暗色下同样成立） */
.tbl :deep(.ant-table-tbody > tr.ant-table-row-selected > td) {
  background: var(--table-row-selected);
}
.tbl :deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: 0;
}

/* ===== 底部分页栏 ===== */
.table-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px var(--card-pad);
  border-top: 1px solid var(--border-subtle);
  font-size: var(--fs-caption);
  color: var(--text-tertiary);
}

/* ===== 错误态（R-10：请求失败的表体占位，与 .empty 同排版、标题用危险色） ===== */
.errored {
  padding: 32px 16px;
  text-align: center;
}
.errored-title {
  font-size: var(--fs-title-3);
  font-weight: 600;
  color: var(--status-danger-fg);
}
.errored-desc {
  margin: 6px 0 16px;
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
}

/* ===== 空态（无数据 / 无搜索结果共用，文案由页面按场景传入） ===== */
.empty {
  padding: 32px 16px;
  text-align: center;
}
.empty-title {
  font-size: var(--fs-title-3);
  font-weight: 600;
  color: var(--text-primary);
}
.empty-desc {
  margin: 6px 0 16px;
  font-size: var(--fs-body-sm);
  color: var(--text-tertiary);
}
</style>
