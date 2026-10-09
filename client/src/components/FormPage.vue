<template>
  <PageShell :title="title" :description="description">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>

    <!-- 返回条：优先 back 插槽（页面自带上文：对象名 / 状态徽标），否则用 back prop -->
    <div v-if="$slots.back || (back && back.text)" class="fp-back">
      <slot name="back">
        <a-button type="link" class="fp-back-btn" @click="goBack">← {{ back.text }}</a-button>
      </slot>
    </div>

    <div class="fp-body">
      <div class="fp-main">
        <slot />
      </div>
      <aside v-if="$slots.panel" class="fp-panel">
        <slot name="panel" />
      </aside>
    </div>

    <!-- 可选底部动作条：保存草稿 / 保存并发布 / 自动保存状态文本都放这里 -->
    <div v-if="$slots.actionbar" class="fp-actionbar">
      <slot name="actionbar" />
    </div>
  </PageShell>
</template>

<script setup>
import { useRouter } from 'vue-router';
import PageShell from './PageShell.vue';

/**
 * FormPage —— 表单编辑页模板（Wave 2 构件，契约见 docs/ui-redesign/11-wave2-brief.md §2）
 *
 * <FormPage title="编辑题目" description="…" :back="{ text: '返回题库管理', to: '/teacher/questions' }">
 *   <template #actions>…保存 / 发布按钮…</template>
 *   <template #panel>…右侧属性面板（sticky 320px）…</template>
 *   <template #actionbar>…底部动作条…</template>
 *   …默认插槽 = 左侧内容编辑区…
 * </FormPage>
 *
 * 结构：PageShell（Wave 1 组件）+ 返回条 + 两栏主体（内容 + #panel）+ 可选 #actionbar。
 * 断点：≥1200px 两栏（#panel 固定 320px 且 sticky）；<1200px 面板移到内容下方（单列）。
 * 说明：不传 #panel 时自动退化为单栏（AiConfig 这类单栏表单页直接用）。
 */
const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  /** 返回上下文：{ text, to }（to 为 vue-router 的 location，字符串或对象） */
  back: { type: Object, default: null },
});

const router = useRouter();

function goBack() {
  if (props.back && props.back.to) router.push(props.back.to);
}
</script>

<style scoped>
/* ===== 返回条 ===== */
.fp-back {
  margin-bottom: var(--space-3);
}
.fp-back-btn {
  padding-left: 0;
}

/* ===== 主体：移动优先的单列；≥1200px 起两栏 ===== */
.fp-body {
  display: block;
}
.fp-panel {
  margin-top: var(--space-5);
}

@media (min-width: 1200px) {
  .fp-body {
    display: flex;
    align-items: flex-start;
    gap: var(--space-5);
  }
  .fp-main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .fp-panel {
    flex: 0 0 320px;
    width: 320px;
    margin-top: 0;
    align-self: flex-start;
    /* 吸附基线与 .content 的内容盒顶部一致（内容区 padding-top 之下），故 top: 0 即落在顶栏之下 */
    position: sticky;
    top: 0;
  }
}

/* ===== 底部动作条（可选）：滚动时停在内容区底部 ===== */
.fp-actionbar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--actionbar-h);
  margin-top: var(--space-5);
  padding: 0 var(--space-6);
  background: var(--actionbar-bg);
  border: 1px solid var(--actionbar-bd);
  border-radius: var(--card-radius);
  box-shadow: var(--actionbar-shadow);
}
</style>
