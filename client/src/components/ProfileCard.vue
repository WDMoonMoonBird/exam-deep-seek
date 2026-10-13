<template>
  <div class="pc">
    <!-- 名片区：只承担「这是谁」——头像 + 姓名 + 角色徽标。
         单位 / 班级 / 学校一律交给下方资料区（用户 2026-10-12 定案：下方已有，且长校名会挤破名片） -->
    <header class="pc-hero">
      <span class="pc-avatar" aria-hidden="true">{{ initial }}</span>
      <h3 class="pc-name">{{ name }}</h3>
      <StatusTag :tone="roleTone" :text="roleText" />
    </header>

    <dl class="pc-grid">
      <div class="pc-f">
        <dt>姓名</dt>
        <dd><span class="pc-v">{{ name }}</span></dd>
      </div>

      <div v-if="idValue" class="pc-f">
        <dt>{{ idLabel }}</dt>
        <dd>
          <span class="pc-v pc-mono">{{ idValue }}</span>
          <button type="button" class="pc-copy" :aria-label="'复制' + idLabel" @click="copyId">⧉</button>
        </dd>
      </div>

      <!-- 学生端：班级是复数（多班），用 chip 列表，避免同一标签重复 N 行 -->
      <div v-if="classes && classes.length" class="pc-f">
        <dt>班级</dt>
        <dd>
          <span class="pc-chips">
            <span v-for="c in classes" :key="c" class="pc-chip">{{ c }}</span>
          </span>
        </dd>
      </div>
      <div v-else-if="unitValue" class="pc-f">
        <dt>{{ unitLabel }}</dt>
        <dd><span class="pc-v">{{ unitValue }}</span></dd>
      </div>

      <!-- ★R2-B59：构建版本短码（小字）—— 用户与排障者一眼看清「浏览器跑的是哪一版」 -->
      <div class="pc-f pc-ver">
        <dt>版本</dt>
        <dd><span class="pc-v pc-mono">{{ versionLabel }}</span></dd>
      </div>

      <div v-if="school" class="pc-f">
        <dt>学校</dt>
        <dd><span class="pc-v">{{ school }}</span></dd>
      </div>
    </dl>

    <section class="pc-sec">
      <button
        ref="secHeadEl"
        type="button"
        class="pc-sec-head"
        :aria-expanded="open ? 'true' : 'false'"
        @click="open = !open"
      >
        <span class="pc-chev" :class="{ 'is-open': open }" aria-hidden="true">›</span>
        <span class="pc-sec-t">修改密码</span>
        <span class="pc-sec-d">{{ hint }}</span>
      </button>
      <!-- 折叠动效：高度 0 → 内容高 + 淡入（dur/ease 取自项目动效令牌）；
           prefers-reduced-motion: reduce 时钩子直接返回 → 瞬间展开/收起 -->
      <Transition
        name="pc-fold"
        @enter="foldEnter"
        @after-enter="foldAfterEnter"
        @leave="foldLeave"
        @after-leave="foldAfterLeave"
      >
        <div v-if="open" ref="formEl" class="pc-form">
          <slot />
        </div>
      </Transition>
    </section>

    <!-- 复制结果用 aria-live 播报，视觉上不占位 -->
    <p class="visually-hidden" role="status" aria-live="polite">{{ copiedMsg }}</p>
  </div>
</template>

<script setup>
/**
 * ProfileCard —— 「我的信息」名片（列表样式 v2 同期改造）
 *
 * 结构：名片区（头像 + 姓名 + 角色徽标）/ 资料区（两列「标签在上」）/ 安全区（折叠 + 密码表单插槽）。
 * 契约：
 *   props  name / role('teacher'|'student'|'admin') / idLabel / idValue / unitLabel / unitValue / school / classes[] / hint
 *          open（v-model:open，控制安全区展开，父组件 resetPwdForm 时收起）
 *   slot   默认插槽 = 密码表单（沿用各页原有表单与请求逻辑，本组件不碰请求）
 * 说明：名片区**不放**单位/班级/学校 —— 下方资料区已有同样信息，且长校名会把名片撑破或被迫省略。
 *      学号/工号的复制按钮带 aria-label，结果用 aria-live 播报；无剪贴板 API 时回退到 textarea 方案。
 */
import { computed, ref } from 'vue';
import StatusTag from './StatusTag.vue';
import { appVersionLabel } from '../composables/appVersion.js';   // ★R2-B59：构建版本短码（排障可见）

const versionLabel = appVersionLabel();

const props = defineProps({
  name: { type: String, default: '' },
  role: { type: String, default: 'teacher' },
  idLabel: { type: String, default: '工号' },
  idValue: { type: String, default: '' },
  unitLabel: { type: String, default: '当前单位' },
  unitValue: { type: String, default: '' },
  school: { type: String, default: '' },
  classes: { type: Array, default: null },
  hint: { type: String, default: '' },
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['update:open']);

const open = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
});

// ★R2-B56：role 增加 admin ⇒ 文案「管理员」；teacher/student 两分支返回值**逐字不变**
const roleText = computed(() => (props.role === 'student' ? '学生' : (props.role === 'admin' ? '管理员' : '教师')));
const roleTone = computed(() => (props.role === 'student' ? 'accent' : 'brand'));   // ★R2-B56：admin 与 teacher 同色调（brand）
const initial = computed(() => (props.name || props.idValue || '?').charAt(0));

/* ---------- 折叠动效（高度动画，内容多高都准） ---------- */
const formEl = ref(null);
const secHeadEl = ref(null);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 取项目动效令牌的真实值构造 transition（避免把 var() 塞进 transition 简写） */
function foldTransition(el) {
  const cs = getComputedStyle(el);
  const dur = cs.getPropertyValue('--duration-base').trim() || '220ms';
  const ease = cs.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.16, 1, 0.3, 1)';
  return 'height ' + dur + ' ' + ease + ', opacity ' + dur + ' ' + ease;
}

function foldEnter(el) {
  if (prefersReducedMotion()) return;
  const target = el.scrollHeight;
  el.style.transition = 'none';
  el.style.height = '0px';
  el.style.opacity = '0';
  void el.offsetHeight; // 强制回流，让起始值成为动画起点
  el.style.willChange = 'height';
  el.style.transition = foldTransition(el);
  el.style.height = target + 'px';
  el.style.opacity = '1';
}
function foldAfterEnter(el) {
  el.style.transition = '';
  el.style.willChange = '';
  el.style.height = 'auto'; // 收尾回 auto：内容变化（如校验提示）不会再被固定高度裁掉
  el.style.opacity = '';
}
function foldLeave(el) {
  if (prefersReducedMotion()) return;
  // 焦点若在表单里，先挪回标题按钮（元素马上要被卸载）
  if (el.contains(document.activeElement) && secHeadEl.value) secHeadEl.value.focus();
  el.style.height = el.scrollHeight + 'px';
  el.style.opacity = '1';
  void el.offsetHeight;
  el.style.willChange = 'height';
  el.style.transition = foldTransition(el);
  el.style.height = '0px';
  el.style.opacity = '0';
}
function foldAfterLeave(el) {
  el.style.transition = '';
  el.style.willChange = '';
  el.style.height = '';
  el.style.opacity = '';
}

const copiedMsg = ref('');
let timer = null;
function flash(msg) {
  copiedMsg.value = msg;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { copiedMsg.value = ''; }, 2400);
}

/** 复制学号/工号：优先 Clipboard API（https / localhost），否则回退 textarea + execCommand */
async function copyId() {
  const text = props.idValue;
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    flash('已复制' + props.idLabel);
  } catch {
    flash('复制失败，请手动选择' + props.idLabel);
  }
}
</script>

<style scoped>
/* 名片区 */
.pc-hero {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) 0 var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}
.pc-avatar {
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-pill);
  display: grid;
  place-items: center;
  font-size: var(--fs-display-2);
  font-weight: var(--fw-semibold);
  background: var(--brand-600);
  color: #fff;
}
.pc-name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--fs-title-2);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 资料区：标签在上（12 灰）/ 值在下（15/500），长值可省略 */
.pc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4) var(--space-5);
  margin: 0;
  padding: var(--space-4) 0 var(--space-5);
}
.pc-f { min-width: 0; }
.pc-f dt {
  margin-bottom: 3px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-regular);
  color: var(--text-tertiary);
  letter-spacing: var(--tracking-wide);
}
.pc-f dd {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  min-width: 0;
}
.pc-v {
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-mono { font-family: var(--font-mono); font-weight: var(--fw-regular); }
/* 复制按钮：hover/键盘聚焦才显形；触屏设备常显（见下方 media） */
.pc-copy {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  font-size: var(--fs-caption);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
.pc-f:hover .pc-copy,
.pc-copy:focus-visible { opacity: 1; }
.pc-copy:hover { background: var(--bg-hover); color: var(--text-brand); }
.pc-copy:focus-visible { outline: 2px solid var(--brand-500); outline-offset: 1px; }
.pc-chips { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.pc-chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: var(--fs-caption);
}

/* 安全区：分区卡片（与列表 v2 同一套语言） */
.pc-ver dd .pc-v { font-size: var(--fs-caption); color: var(--text-tertiary); }

.pc-sec {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--bg-surface-2);
  overflow: hidden;
}
.pc-sec-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.pc-sec-head:hover { background: var(--bg-hover); }
.pc-sec-head:focus-visible { outline: 2px solid var(--brand-500); outline-offset: -2px; }
.pc-chev {
  color: var(--text-tertiary);
  font-size: var(--fs-body);
  line-height: 1;
  transition: transform var(--duration-base) var(--ease-out);
}
.pc-chev.is-open { transform: rotate(90deg); }
.pc-sec-t { flex: 1; font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-primary); }
.pc-sec-d { font-size: var(--fs-caption); color: var(--text-tertiary); }
.pc-form {
  padding: 0 var(--space-3) var(--space-3);
  border-top: 1px solid var(--border-subtle);
  overflow: hidden;   /* 高度动画期间裁掉溢出内容（will-change 由 JS 仅动画期间挂） */
}

/* 动效开关：系统「减少动态效果」时不做高度/透明度动画（JS 钩子同时短路） */
@media (prefers-reduced-motion: reduce) {
  .pc-chev { transition: none; }
}

/* 手机端：两列会挤断长校名 → 单列；复制按钮常显（没有 hover） */
@media (max-width: 480px) {
  .pc-grid { grid-template-columns: 1fr; gap: var(--space-4); }
  .pc-copy { opacity: 1; width: 32px; height: 32px; }
  .pc-name { font-size: var(--fs-title-3); }
}
@media (hover: none) {
  .pc-copy { opacity: 1; }
}
</style>
