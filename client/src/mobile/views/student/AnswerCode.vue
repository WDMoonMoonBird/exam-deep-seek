<script setup>
/**
 * AnswerCode.vue —— 作答页「编程题 / 实训题」分支（Answer.vue 的子组件，无独立路由）
 *
 * 依据：docs/mobile-app/05-page-specs.md §3.2 #11；设计参照 student-answer-code.html（只读）
 * v1 铁律：手机端不提供代码编辑器；只读展示已保存内容 + 复制链接（电脑登录后继续）。
 * 不出现「免登录 / 10 分钟有效 / 已同步到电脑」等 D8 延期项文案。
 */
import { computed } from 'vue';
import MIcon from '../../components/MIcon.vue';
import MStatusTag from '../../components/MStatusTag.vue';

const props = defineProps({
  unit: { type: Object, default: () => ({}) },
  savedAnswer: { type: String, default: '' },
  status: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  link: { type: String, default: '' },
});

const emit = defineEmits(['copy']);

const isProject = computed(() => props.unit && props.unit.type === 'project');
const isSubmitted = computed(() => !!props.status && props.status !== 'draft');
const hasSaved = computed(() => String(props.savedAnswer || '').trim() !== '');
const title = computed(() => (isProject.value ? '在电脑上提交工程包' : '在电脑上继续作答'));
const linkTip = computed(() => (isProject.value
  ? '实训题需要在电脑端上传工程包。复制链接到电脑浏览器，登录同一账号后继续提交。'
  : '手机端不提供代码编辑器。复制链接到电脑浏览器，登录同一账号后继续作答。'));
</script>

<template>
  <div class="ac-block">
    <div v-if="hasSaved" class="ac-saved">
      <div class="between ac-saved-head">
        <span class="ac-saved-title">{{ isProject ? '已提交的工程包' : '我的作答（只读）' }}</span>
        <MStatusTag v-if="isSubmitted" type="success">已提交</MStatusTag>
      </div>
      <div v-if="!isProject" class="codebox ac-codebox">
        <pre class="ac-pre">{{ savedAnswer }}</pre>
      </div>
      <p v-else class="ac-saved-note">工程包文件请在电脑端查看，手机端不展示文件列表。</p>
    </div>

    <article class="card ac-handoff" aria-labelledby="ac-handoff-title">
      <div class="between">
        <h3 id="ac-handoff-title" class="card-title">{{ title }}</h3>
        <MStatusTag type="accent">{{ isProject ? '电脑端提交' : '推荐' }}</MStatusTag>
      </div>
      <p class="card-sub">{{ linkTip }}</p>

      <div class="ac-url" role="note" aria-label="电脑端链接">
        <MIcon name="link" />
        <span class="ac-url-text">{{ link }}</span>
      </div>

      <button type="button" class="ac-copy" @click="emit('copy')">
        <MIcon name="copy" />复制链接
      </button>

      <p class="ac-note-text">
        链接需登录后访问；请在电脑端完成{{ isProject ? '工程包提交' : '本题作答' }}，手机端不会代为提交。
      </p>
    </article>

    <div class="banner banner--neutral ac-tip" role="note">
      <MIcon name="info" />
      <div>可以先把客观题做完并交卷；本题在电脑端完成后再单独提交即可。</div>
    </div>
  </div>
</template>

<style scoped>
.ac-block { margin-top: 14px; }
.ac-saved { margin-bottom: 12px; }
.ac-saved-head { margin-bottom: 8px; }
.ac-saved-title { font-size: 13px; font-weight: var(--m-fw-semibold); color: var(--text-secondary); }
.ac-codebox { margin-top: 2px; }
.ac-pre { margin: 0; padding: 12px; color: #cdd6e4; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.7; white-space: pre; overflow-x: auto; }
.ac-saved-note { margin-top: 4px; font-size: 12.5px; color: var(--text-tertiary); line-height: 1.55; }
.ac-handoff { border-color: var(--border-subtle); }
.ac-handoff .card-sub { margin-top: 6px; }
.ac-url { display: flex; align-items: center; margin-top: 12px; padding: 9px 12px; border-radius: 10px; background: var(--bg-sunken); color: var(--text-secondary); font-family: var(--font-mono); font-size: 12px; }
.ac-url .icon { width: 15px; height: 15px; margin-right: 6px; flex: none; color: var(--text-tertiary); }
.ac-url-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-copy { display: flex; align-items: center; justify-content: center; width: 100%; min-height: var(--m-touch-min); margin-top: 10px; border-radius: 12px; background: var(--bg-selected); color: var(--text-brand); font-size: 14px; font-weight: var(--m-fw-semibold); }
.ac-copy .icon { width: 16px; height: 16px; margin-right: 6px; }
.ac-copy:active { opacity: 0.8; }
.ac-note-text { margin-top: 8px; font-size: 12px; line-height: 1.55; color: var(--text-tertiary); }
.ac-tip { margin-top: 12px; }
</style>
