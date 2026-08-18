<template>
  <div class="rule-summary">
    <div class="rs-head">
      <span class="rs-title">规则摘要（{{ totalCount }} 条客观规则 + {{ subjectiveCount }} 条主观项 · 共 {{ totalPoints }} 分）</span>
      <span class="rs-hint">点击分组展开逐条规则；失分项请在下方体检报告处理</span>
    </div>
    <a-collapse v-model:activeKey="activeGroups" ghost>
      <a-collapse-panel v-for="g in groups" :key="g.group" :header="groupHeader(g)">
        <a-table :columns="columns" :data-source="g.items" :pagination="false" size="small" row-key="id">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'type'">
              <a-tag color="blue">{{ RULE_TYPE_LABELS[record.rule_type] || record.rule_type }}</a-tag>
            </template>
            <template v-else-if="column.key === 'params'">
              <span class="rs-params">{{ formatParams(record) }}</span>
            </template>
            <template v-else-if="column.key === 'score'">
              <span>{{ record.score }}<span v-if="record.max_score !== record.score" class="rs-max">/{{ record.max_score }}</span></span>
            </template>
            <template v-else-if="column.key === 'visibility'">
              <a-tag v-if="record.hidden" color="orange" size="small">隐藏</a-tag>
              <a-tag v-else size="small">{{ SHOW_MESSAGE_LABELS[record.show_message] || '失败时显示' }}</a-tag>
            </template>
          </template>
        </a-table>
      </a-collapse-panel>
    </a-collapse>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { RULE_TYPE_LABELS, SHOW_MESSAGE_LABELS } from '../../api/checker.js';

const props = defineProps({
  rules: { type: Object, default: null }, // { max_score, objective_items, subjective_items }
});

const activeGroups = ref([]);

const groups = computed(() => {
  const items = props.rules?.objective_items || [];
  const map = {};
  for (const it of items) {
    if (!map[it.group]) map[it.group] = { group: it.group, items: [] };
    map[it.group].items.push(it);
  }
  return Object.values(map);
});

const totalCount = computed(() => props.rules?.objective_items?.length || 0);
const subjectiveCount = computed(() => props.rules?.subjective_items?.length || 0);
const totalPoints = computed(() => props.rules?.max_score || 0);

const columns = [
  { title: '规则类型', dataIndex: 'rule_type', key: 'type', width: 100 },
  { title: '判定参数', dataIndex: 'params', key: 'params' },
  { title: '分值', dataIndex: 'score', key: 'score', width: 70 },
  { title: '学生可见性', dataIndex: 'hidden', key: 'visibility', width: 100 },
];

function groupHeader(g) {
  const points = g.items.reduce((s, x) => s + (x.max_score ?? x.score), 0);
  return `${g.group}（${g.items.length} 条 · ${points} 分）`;
}

function formatParams(record) {
  const p = record.params || {};
  try {
    return JSON.stringify(p);
  } catch (e) {
    return String(p);
  }
}
</script>

<style scoped>
.rule-summary { border: 1px solid #e5e6eb; border-radius: 8px; padding: 10px 12px; background: #fff; }
.rs-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.rs-title { font-weight: 600; font-size: 13px; }
.rs-hint { font-size: 12px; color: #999; }
.rs-params { font-size: 12px; color: #555; font-family: ui-monospace, MonacoDSH, monospace; word-break: break-all; }
.rs-max { color: #999; font-size: 12px; }
</style>
