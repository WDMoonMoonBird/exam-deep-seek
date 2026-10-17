<script setup>
/**
 * AnswerObjective.vue —— 作答页「客观题」分支（Answer.vue 的子组件，无独立路由）
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #10；设计参照 student-answer-objective.html（只读）
 * 题型沿用题库 objectiveItems：choice 单选 / multi_choice 多选 / judge 判断 / fill 填空。
 * 答案格式与桌面一致：小问答案字符串，多选用英文逗号连接（父组件统一序列化为 JSON 提交）。
 */
import { computed } from 'vue';
import MIcon from '../../components/MIcon.vue';
import MStatusTag from '../../components/MStatusTag.vue';
import { niceNumber } from './studentPure.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  answers: { type: Object, default: () => ({}) },
  readonly: { type: Boolean, default: false },
});

const emit = defineEmits(['update']);

const TYPE_META = {
  choice: { label: '单选', tone: 'info' },
  multi_choice: { label: '多选', tone: 'accent' },
  judge: { label: '判断', tone: 'warning' },
  fill: { label: '填空', tone: 'success' },
};

const JUDGE_OPTIONS = [
  { key: 'true', text: '正确' },
  { key: 'false', text: '错误' },
];

function typeLabel(type) {
  return (TYPE_META[type] && TYPE_META[type].label) || '客观题';
}
function typeTone(type) {
  return (TYPE_META[type] && TYPE_META[type].tone) || 'neutral';
}
function optionsOf(item) {
  if (item.type === 'judge') return JUDGE_OPTIONS;
  return Array.isArray(item.options) ? item.options : [];
}
function answerOf(item) {
  const value = props.answers ? props.answers[item.key] : '';
  return String(value == null ? '' : value);
}
function hasAnswer(item) {
  return answerOf(item).trim() !== '';
}
function selectedKeys(item) {
  const raw = answerOf(item);
  if (item.type === 'multi_choice') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return raw ? [raw] : [];
}
function isSelected(item, key) {
  return selectedKeys(item).indexOf(key) >= 0;
}
function choose(item, key) {
  if (props.readonly) return;
  if (item.type === 'multi_choice') {
    const next = selectedKeys(item);
    const at = next.indexOf(key);
    if (at >= 0) next.splice(at, 1);
    else next.push(key);
    emit('update', item.key, next.join(','));
    return;
  }
  emit('update', item.key, key);
}
function onFillInput(item, event) {
  if (props.readonly) return;
  emit('update', item.key, event.target.value);
}
function fillPlaceholder(item) {
  const blanks = Array.isArray(item._blankParts) ? item._blankParts.length : 0;
  return blanks > 1 ? '多个空用英文逗号分隔' : '请输入答案';
}
function groupLabel(index) {
  return '第 ' + (index + 1) + ' 问';
}
const totalScore = computed(() => props.items.reduce((sum, item) => sum + (Number(item.score) || 0), 0));
</script>

<template>
  <div v-if="!items.length" class="oi-empty" role="note">本题暂未配置可作答的小问，如有疑问请联系任课教师。</div>
  <div v-else class="oi-list">
    <p v-if="items.length > 1" class="oi-total">共 {{ items.length }} 小问<span v-if="totalScore"> · 合计 {{ niceNumber(totalScore) }} 分</span></p>
    <section
      v-for="(item, index) in items"
      :key="item.key"
      class="oi-card"
      :class="{ 'oi-card--done': hasAnswer(item), 'oi-card--readonly': readonly }"
      :aria-label="groupLabel(index)"
    >
      <div class="oi-head">
        <span class="oi-num" aria-hidden="true">{{ index + 1 }}.</span>
        <MStatusTag :type="typeTone(item.type)">{{ typeLabel(item.type) }}</MStatusTag>
        <span v-if="item.score" class="oi-score tnum">+{{ niceNumber(item.score) }} 分</span>
        <span v-if="hasAnswer(item)" class="oi-done"><MIcon name="check-circle" />已作答</span>
      </div>

      <div v-if="item.stem" class="oi-stem">{{ item.stem }}</div>

      <div
        v-if="item.type === 'choice' || item.type === 'judge'"
        class="options"
        role="radiogroup"
        :aria-label="groupLabel(index) + ' 选项'"
      >
        <button
          v-for="opt in optionsOf(item)"
          :key="opt.key"
          type="button"
          class="option"
          :class="{ selected: isSelected(item, opt.key) }"
          role="radio"
          :aria-checked="isSelected(item, opt.key) ? 'true' : 'false'"
          :disabled="readonly"
          @click="choose(item, opt.key)"
        >
          <span class="radio" :class="{ on: isSelected(item, opt.key) }" aria-hidden="true"></span>
          <span v-if="item.type !== 'judge'" class="oi-key" aria-hidden="true">{{ opt.key }}</span>
          <span class="oi-opt-text">{{ opt.text || '（待填写）' }}</span>
        </button>
      </div>

      <div
        v-else-if="item.type === 'multi_choice'"
        class="options"
        role="group"
        :aria-label="groupLabel(index) + ' 多选选项'"
      >
        <button
          v-for="opt in optionsOf(item)"
          :key="opt.key"
          type="button"
          class="option option--multi"
          :class="{ selected: isSelected(item, opt.key) }"
          role="checkbox"
          :aria-checked="isSelected(item, opt.key) ? 'true' : 'false'"
          :disabled="readonly"
          @click="choose(item, opt.key)"
        >
          <span class="check" :class="{ on: isSelected(item, opt.key) }" aria-hidden="true">
            <MIcon v-if="isSelected(item, opt.key)" name="check" />
          </span>
          <span class="oi-key" aria-hidden="true">{{ opt.key }}</span>
          <span class="oi-opt-text">{{ opt.text || '（待填写）' }}</span>
        </button>
      </div>

      <div v-else class="oi-fill-wrap">
        <input
          class="input oi-fill"
          type="text"
          :value="answerOf(item)"
          :placeholder="fillPlaceholder(item)"
          :disabled="readonly"
          :aria-label="groupLabel(index) + ' 答案'"
          autocomplete="off"
          @input="onFillInput(item, $event)"
        />
        <span class="help">多个空按顺序用英文逗号分隔（例：答案1,答案2）。</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.oi-empty { padding: 18px 0; font-size: 13.5px; line-height: 1.6; color: var(--text-tertiary); }
.oi-total { margin: 0 0 10px; font-size: 12px; color: var(--text-tertiary); }
.oi-list > .oi-card + .oi-card { margin-top: 12px; }
.oi-card { padding: 14px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--bg-surface-2); }
.oi-card--done { border-color: var(--status-info-bd); }
.oi-head { display: flex; align-items: center; flex-wrap: wrap; }
.oi-num { font-size: 14px; font-weight: var(--m-fw-semibold); color: var(--text-secondary); margin-right: 6px; font-variant-numeric: tabular-nums; }
.oi-score { margin-left: 8px; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.oi-done { margin-left: auto; display: inline-flex; align-items: center; font-size: 12px; color: var(--status-success-fg); }
.oi-done .icon { width: 13px; height: 13px; margin-right: 3px; }
.oi-stem { margin-top: 8px; font-size: 15px; line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; word-break: break-word; }
.oi-key { width: 18px; flex: none; font-size: 14px; font-weight: var(--m-fw-semibold); color: var(--text-tertiary); margin-right: 8px; }
.option.selected .oi-key { color: var(--text-brand); }
.oi-opt-text { flex: 1; min-width: 0; }
.option { min-height: 52px; align-items: center; }
.option[disabled] { opacity: 0.85; cursor: default; }
.option--multi .check { margin-right: 12px; }
.oi-fill-wrap { margin-top: 10px; }
.oi-fill { background: var(--bg-surface); }
</style>
