<template>
  <figure
    ref="figureEl"
    class="ms"
    :data-ready="ready ? 'true' : 'false'"
    :data-running="running ? 'true' : 'false'"
    :data-step="step"
    :aria-label="ariaLabel"
  >
    <!-- 截图兜底：JS/动效不可用、或尚未就绪时显示（渐进增强，照搬 DSH 官网做法） -->
    <img v-if="fallback && fallbackOk" class="ms-fallback" :src="fallback" :alt="fallbackAlt" loading="lazy" @error="fallbackOk = false" />

    <div class="ms-canvas" aria-hidden="true">
      <slot :step="step" :running="running" :total="total" />
    </div>

    <div class="ms-bar">
      <button class="ms-play" type="button" :aria-label="running ? '暂停演示' : '播放演示'" @click="toggle">
        <svg v-if="running" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
        <svg v-else viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3.4 12.4 8 5 12.6z" fill="currentColor"/></svg>
      </button>
      <span class="ms-count">{{ Math.min(step + 1, total) }} / {{ total }}</span>
      <span class="ms-caption">{{ caption }}</span>
      <button class="ms-replay" type="button" @click="replay">重播</button>
    </div>
    <div class="ms-progress" aria-hidden="true"><i :style="{ width: ((step + 1) / total) * 100 + '%' }" /></div>
  </figure>
</template>

<script setup>
/**
 * ManualStep —— 教师手册的「可播放演示」播放器（手册底座，冻结 API）
 *
 * 设计参考 deepseek.com/harness 的能力演示：真实 DOM 复刻 + 播放/暂停，而不是视频。
 * 机制：**步骤驱动**——播放器按 steps 里的 dwell 依次把 step 从 0 推到 total-1；
 *       场景组件通过插槽参数 step 渲染对应状态，状态之间用 CSS transition 过渡。
 *       播放中 figure 带 data-running="true"，场景里若有 keyframes 动画会随
 *       animation-play-state 一起暂停/继续（见本组件样式里的全局规则）。
 *
 * props
 *   steps       Array   [{ label?: string, dwell?: number }]  每步停留毫秒（默认 1500）
 *   caption     String  演示说明（一行，显示在控制条上）
 *   ariaLabel   String  必填：把整段"剧情"讲清楚（读屏用户听到的就是这句，动画层 aria-hidden）
 *   fallback    String  可选：截图兜底路径（public 下的绝对路径，如 '/exam/doc-img/xx.webp'）
 *   fallbackAlt String  兜底图 alt
 *   autoplay    Boolean 默认 true：进入视口自动播放一次
 *
 * 行为
 *   · 进入视口（≥40% 可见）自动从头播放一次；离开视口暂停（省性能）
 *   · 播放/暂停：按钮（含 aria-label「播放演示 / 暂停演示」）
 *   · 重播：回到第 1 步重新播放
 *   · prefers-reduced-motion: reduce → 不自动播放，直接显示**终态**，只保留「重播」
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  steps: { type: Array, required: true },
  caption: { type: String, default: '' },
  ariaLabel: { type: String, required: true },
  fallback: { type: String, default: '' },
  fallbackAlt: { type: String, default: '' },
  autoplay: { type: Boolean, default: true },
});

const total = computed(() => Math.max(props.steps.length, 1));
const step = ref(0);
const running = ref(false);
const ready = ref(false);
const fallbackOk = ref(true);   // 兜底图缺失/加载失败时自动隐藏，不影响复刻界面显示
const figureEl = ref(null);

let timer = null;
let observer = null;
let playedOnce = false;

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
}

/** 推进到下一步；到最后一步停住（终态保留在画面上） */
function schedule() {
  clearTimer();
  timer = setTimeout(() => {
    if (!running.value) return;
    if (step.value >= total.value - 1) { running.value = false; return; }
    step.value += 1;
    schedule();
  }, props.steps[step.value]?.dwell || 1500);
}

function play() {
  if (reduceMotion()) return;      // 尊重系统设置：不动画
  running.value = true;
  schedule();
}
function pause() {
  running.value = false;
  clearTimer();
}
function toggle() {
  if (running.value) pause();
  else { if (step.value >= total.value - 1) step.value = 0; play(); }
}
function replay() {
  clearTimer();
  step.value = 0;
  running.value = false;
  // 让场景先回到第 1 步的状态，再开始播（否则会和上一次的终态糊在一起）
  requestAnimationFrame(() => play());
}

onMounted(() => {
  // data-ready 由下一帧置位：兜底图先显示，DOM 画布就绪后接管
  requestAnimationFrame(() => { ready.value = true; });
  if (reduceMotion()) { step.value = total.value - 1; return; }   // 直接给终态
  if (!props.autoplay || !figureEl.value) return;
  observer = new IntersectionObserver((entries) => {
    const e = entries[0];
    if (e.isIntersecting) {
      if (!playedOnce) { playedOnce = true; play(); }
      else if (!running.value && step.value < total.value - 1) play();
    } else { pause(); }
  }, { threshold: 0.4 });
  observer.observe(figureEl.value);
});
onBeforeUnmount(() => { clearTimer(); if (observer) observer.disconnect(); });
</script>

<style scoped>
.ms { margin: 0; }
.ms-fallback { display: block; width: 100%; height: auto; border: 1px solid var(--border-default); border-radius: var(--radius-lg); }
.ms[data-ready='true'] .ms-fallback { display: none; }
.ms-canvas { display: none; }
.ms[data-ready='true'] .ms-canvas { display: block; }

.ms-bar { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); font-size: var(--fs-caption); color: var(--text-tertiary); }
.ms-play { display: inline-grid; place-items: center; width: 26px; height: 26px; flex: none; border: 1px solid var(--border-default); border-radius: var(--radius-pill); background: var(--card-bg); color: var(--text-brand); cursor: pointer; transition: var(--transition-control); }
.ms-play:hover { border-color: var(--brand-600); background: var(--bg-selected); }
.ms-count { flex: none; font-variant-numeric: tabular-nums; }
.ms-caption { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-replay { border: 0; background: transparent; padding: 2px 4px; border-radius: var(--radius-sm); color: var(--text-brand); font-size: var(--fs-caption); cursor: pointer; }
.ms-replay:hover { background: var(--bg-hover); }
.ms-progress { height: 2px; margin-top: 6px; border-radius: var(--radius-pill); background: var(--border-subtle); overflow: hidden; }
.ms-progress i { display: block; height: 100%; background: var(--brand-600); transition: width var(--duration-base) var(--ease-out); }

/* 播放器暂停时，场景内部的 keyframes 动画也一起冻结（DSH 官网同款机制） */
.ms[data-running='false'] .ms-canvas :deep(*) { animation-play-state: paused !important; }
.ms[data-running='true'] .ms-canvas :deep(*) { animation-play-state: running; }
@media (prefers-reduced-motion: reduce) {
  .ms-canvas :deep(*) { animation: none !important; transition: none !important; }
}
</style>
