<script setup>
/**
 * MobileAppBar —— 顶部导航栏（契约 §4）
 *
 * props:
 *   title / subtitle   标题 / 副标题（title 渲染为页面唯一 h1；也可用 #title 插槽）
 *   back               是否显示返回按钮（aria-label="返回"）
 *   backTo             返回目标路由；缺省时走 router.back()
 *   align              'center'(默认) | 'left'（左对齐大标题，用于列表/首页）
 *   solid              纯实色背景（默认 true）
 *   border             底部发丝线（默认 true）
 *   transparent        透明背景（首页大图/渐变头）
 *   inverse            反色（浅色文字，配合透明背景）
 * 插槽：#left / #right / #title
 *
 * 用法：<MobileAppBar title="作业详情" back back-to="/m/student/assignments" />
 *       <MobileAppBar title="我的成绩" align="left">
 *         <template #right><button class="iconbtn" aria-label="筛选">…</button></template>
 *       </MobileAppBar>
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import MIcon from '../components/MIcon.vue';

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  back: { type: Boolean, default: false },
  backTo: { type: String, default: '' },
  align: { type: String, default: 'center' },
  solid: { type: Boolean, default: true },
  border: { type: Boolean, default: true },
  transparent: { type: Boolean, default: false },
  inverse: { type: Boolean, default: false },
});

const router = useRouter();

const classes = computed(() => ({
  'appbar--left': props.align === 'left',
  'appbar--solid': props.solid && !props.transparent,
  'appbar--bordered': props.border,
  'appbar--transparent': props.transparent,
  'appbar--inverse': props.inverse,
}));

function goBack() {
  if (props.backTo) {
    router.push(props.backTo);
    return;
  }
  if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/m');
}
</script>

<template>
  <header class="appbar" :class="classes">
    <div class="appbar-side">
      <button v-if="back" type="button" class="iconbtn" aria-label="返回" @click="goBack">
        <MIcon name="back" />
      </button>
      <slot name="left" />
    </div>
    <h1 v-if="title && !$slots.title" class="appbar-title">
      {{ title }}
      <small v-if="subtitle">{{ subtitle }}</small>
    </h1>
    <div v-else class="appbar-title">
      <slot name="title" />
    </div>
    <div class="appbar-actions">
      <slot name="right" />
    </div>
  </header>
</template>
