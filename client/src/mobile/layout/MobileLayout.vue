<script setup>
/**
 * MobileLayout —— /m 所有页面的根布局（契约 §4）
 *
 * props:
 *   role   '' | 'student' | 'teacher'  有值时渲染底部 TabBar
 *   active string                      TabBar 激活项 key（home / assignments / scores / re view / me）
 *   bottom 'tabbar' | 'actionbar' | 'none'
 *          底部占位模式；缺省时 role 有值 -> tabbar，否则 none。
 *   badges object                      TabBar 角标，如 { review: 12 }
 *
 * 结构（契约）：
 *   <div class="m-screen" data-bottom="...">
 *     <div class="app"><slot /></div>
 *     <MobileTabBar v-if="role" ... />
 *   </div>
 *
 * 页面用法：
 *   <MobileLayout role="student" active="home" bottom="tabbar">
 *     <header class="appbar">…</header>
 *     <main class="scroll">…</main>
 *   </MobileLayout>
 *
 * 注意：移动端样式（移动令牌 + 设计稿 screen.css 迁移）在这里按需引入：
 * 只有访问 /m 页面、加载本组件时才会加载对应 CSS chunk，桌面端不加载、零回归。
 */
import { computed } from 'vue';
import '../styles/mobile-tokens.css';
import '../styles/mobile.css';
import MobileTabBar from './MobileTabBar.vue';

const props = defineProps({
  role: { type: String, default: '' },
  active: { type: String, default: '' },
  bottom: { type: String, default: '' },
  badges: { type: Object, default: () => ({}) },
});

const resolvedBottom = computed(() => {
  if (props.bottom === 'tabbar' || props.bottom === 'actionbar' || props.bottom === 'none') {
    return props.bottom;
  }
  return props.role ? 'tabbar' : 'none';
});
</script>

<template>
  <div class="m-screen" :data-bottom="resolvedBottom">
    <div class="app">
      <!-- 页面进入动效：包在 MobileLayout 的 slot 上，不包路由组件（避免 ⑨a 路由过渡死锁） -->
      <Transition name="m-page" appear>
        <div class="m-page">
          <slot />
        </div>
      </Transition>
    </div>
    <MobileTabBar v-if="role" :role="role" :active="active" :badges="badges" />
  </div>
</template>
