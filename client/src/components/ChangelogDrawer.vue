<template>
  <a-drawer
    :open="open"
    placement="right"
    :width="drawerWidth"
    :body-style="{ padding: 0 }"
    :title="null"
    root-class-name="clog-root"
    @close="close"
  >
    <template #title>
      <div class="clog-head">
        <h3>更新日志</h3>
        <p>{{ CHANGELOG_SINCE }}以来 · {{ CHANGELOG.length }} 次大更新 / {{ CHANGELOG_COMMITS }} 次提交</p>
      </div>
    </template>

    <div class="clog-filters" role="tablist" aria-label="按类别筛选">
      <button
        v-for="f in filters"
        :key="f.key"
        type="button"
        class="clog-chip"
        :class="{ 'is-on': activeFilter === f.key }"
        role="tab"
        :aria-selected="activeFilter === f.key"
        @click="activeFilter = f.key"
      >{{ f.label }} {{ f.count }}</button>
    </div>

    <div class="clog-body">
      <p v-if="!visible.length" class="clog-empty">这个类别下暂无更新</p>
      <ol v-else class="clog-timeline">
        <li v-for="it in visible" :key="it.title" class="clog-item" :class="{ 'is-hot': it.hot }">
          <span class="clog-dot" aria-hidden="true" />
          <div class="clog-meta">
            <b>{{ it.label }}</b>
            <span class="clog-pill" :class="'is-' + tone(it.category)">{{ it.category }}</span>
            <span v-for="t in it.tags" :key="t" class="clog-tag">{{ t }}</span>
          </div>
          <h4>
            {{ it.title }}
            <span v-if="it.hot && isLatest(it)" class="clog-new">新</span>
          </h4>
          <p>{{ it.summary }}</p>
          <div v-if="it.detail" class="clog-detail">
            <b>实测数据</b>
            <p>{{ it.detail }}</p>
          </div>
        </li>
      </ol>
      <p class="clog-more">只展示影响使用的更新 · 完整提交记录见仓库</p>
    </div>
  </a-drawer>
</template>

<script setup>
/**
 * 欢迎页「更新日志」抽屉
 * - 数据：client/src/data/changelog.js（静态，不调接口）
 * - antd Drawer 自带遮罩/Esc/焦点管理；手机端宽度 100%
 * - 打开即写入 localStorage['changelog:lastSeen']，供入口红点判断未读
 */
import { computed, ref, watch } from 'vue';
import { CHANGELOG, CHANGELOG_SINCE, CHANGELOG_COMMITS, CHANGELOG_LATEST } from '../data/changelog.js';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['update:open']);

const activeFilter = ref('all');
const drawerWidth = computed(() => (typeof window !== 'undefined' && window.innerWidth <= 768 ? '100%' : 520));
const toneMap = { 评分: 'brand', 移动端: 'purple', 作业: 'brand', 手册: 'ok', 错误页: 'warn', 安全: 'danger', 列表: 'ok', 个人: 'brand', 欢迎页: 'ok' };
const tone = (c) => toneMap[c] || 'mute';

const filters = computed(() => {
  const counts = new Map();
  for (const it of CHANGELOG) counts.set(it.category, (counts.get(it.category) || 0) + 1);
  return [{ key: 'all', label: '全部', count: CHANGELOG.length }].concat(
    [...counts].map(([k, v]) => ({ key: k, label: k, count: v })),
  );
});
const visible = computed(() => (activeFilter.value === 'all' ? CHANGELOG : CHANGELOG.filter((it) => it.category === activeFilter.value)));
const isLatest = (it) => it.date === CHANGELOG_LATEST;
function close() { emit('update:open', false); }

watch(() => props.open, (v) => {
  if (!v) return;
  activeFilter.value = 'all';
  try { localStorage.setItem('changelog:lastSeen', CHANGELOG_LATEST); } catch { /* 忽略 */ }
});
</script>

<style scoped>
.clog-head h3 { margin: 0 0 4px; font-size: var(--fs-title-2); color: var(--text-strong); }
.clog-head p { margin: 0; font-size: var(--fs-caption); color: var(--text-tertiary); }
.clog-filters { display: flex; gap: 8px; padding: 12px 20px; overflow-x: auto; border-bottom: 1px solid var(--border-subtle); }
.clog-chip { flex: none; height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--card-bd);
  background: var(--bg-surface-2); color: var(--text-secondary); font-size: var(--fs-caption); cursor: pointer; }
.clog-chip:hover { border-color: var(--brand-500); color: var(--text-brand); }
.clog-chip.is-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; font-weight: 500; }
.clog-body { padding: 18px 20px 26px; }
.clog-empty { margin: 0; padding: 32px 0; text-align: center; font-size: var(--fs-body-sm); color: var(--text-tertiary); }
.clog-timeline { list-style: none; margin: 0; padding: 0 0 0 18px; position: relative; }
.clog-timeline::before { content: ''; position: absolute; left: 4px; top: 6px; bottom: 6px; width: 2px; background: var(--border-subtle); }
.clog-item { position: relative; padding: 0 0 20px 4px; }
.clog-item .clog-dot { position: absolute; left: -18px; top: 5px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--card-bg); border: 2px solid var(--brand-600); }
.clog-item.is-hot .clog-dot { background: var(--brand-600); box-shadow: 0 0 0 4px rgba(0, 102, 204, 0.14); }
.clog-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; flex-wrap: wrap; }
.clog-meta b { font-size: var(--fs-caption); color: var(--text-tertiary); font-variant-numeric: tabular-nums; letter-spacing: 0.3px; }
.clog-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 500; }
.clog-pill.is-brand { background: var(--brand-50); color: var(--brand-700); }
.clog-pill.is-ok { background: var(--green-50, #f0fdf4); color: var(--status-success-fg); }
.clog-pill.is-warn { background: var(--amber-50, #fffbeb); color: var(--status-warning-fg); }
.clog-pill.is-danger { background: var(--red-50, #fef2f2); color: var(--status-danger-fg); }
.clog-pill.is-purple { background: #f5f3ff; color: #6d28d9; }
.clog-pill.is-mute { background: var(--bg-sunken); color: var(--text-tertiary); }
.clog-tag { font-size: 11px; color: var(--text-tertiary); border: 1px dashed var(--border-default); border-radius: 999px; padding: 1px 7px; }
.clog-item h4 { margin: 0 0 4px; font-size: var(--fs-body); color: var(--text-strong); line-height: 1.45; }
.clog-item p { margin: 0; font-size: var(--fs-body-sm); line-height: 1.7; color: var(--text-secondary); }
.clog-new { margin-left: 8px; font-size: 10px; font-weight: 700; color: #fff; background: var(--status-danger-fg);
  border-radius: 4px; padding: 1px 5px; vertical-align: 2px; }
.clog-detail { margin-top: 8px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle); }
.clog-detail b { display: block; margin-bottom: 3px; font-size: 11.5px; color: var(--text-tertiary); }
.clog-detail p { font-size: var(--fs-caption); }
.clog-more { margin: 6px 0 0; font-size: 11.5px; color: var(--text-tertiary); text-align: center; }
</style>
