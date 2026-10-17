<script setup>
/**
 * MobileTabBar —— 底部主导航（契约 §4 · 角色固定 4 个 Tab）
 *
 * props:
 *   role   'student' | 'teacher'  （'' 时不渲染，通常由 MobileLayout 控制）
 *   active 当前 Tab key：home / assignments / scores|review / me
 *   badges 角标对象，如 { assignments: 2, review: 12 }（0 / 空不显示）
 *
 * 说明：Tab 目标固定为 /m 路由；页面只需传 active，不需要自己拼导航。
 * 无障碍：<nav aria-label="主导航">，当前项 aria-current="page"；角标同时给 aria-label。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MIcon from '../components/MIcon.vue';

const TABS = {
  student: [
    { key: 'home', label: '首页', icon: 'home', to: '/m/student/home' },
    { key: 'assignments', label: '作业', icon: 'assignments', to: '/m/student/assignments' },
    { key: 'scores', label: '成绩', icon: 'scores', to: '/m/student/scores' },
    { key: 'me', label: '我的', icon: 'user', to: '/m/student/profile' },
  ],
  teacher: [
    { key: 'home', label: '工作台', icon: 'home', to: '/m/teacher/home' },
    { key: 'assignments', label: '作业', icon: 'assignments', to: '/m/teacher/assignments' },
    { key: 'review', label: '审核', icon: 'review', to: '/m/teacher/review' },
    { key: 'me', label: '我的', icon: 'user', to: '/m/teacher/profile' },
  ],
};

const props = defineProps({
  role: { type: String, default: '' },
  active: { type: String, default: '' },
  badges: { type: Object, default: () => ({}) },
});

const route = useRoute();
const tabs = computed(() => TABS[props.role] || []);

function isActive(tab) {
  if (props.active) return props.active === tab.key;
  return route.path === tab.to || route.path.indexOf(tab.to + '/') === 0;
}

function badgeOf(tab) {
  const value = props.badges ? props.badges[tab.key] : '';
  if (value === 0 || value === '' || value == null || value === false) return '';
  return String(value);
}
</script>

<template>
  <nav class="tabbar" aria-label="主导航">
    <router-link
      v-for="tab in tabs"
      :key="tab.key"
      :to="tab.to"
      class="tabbar-item"
      :class="{ active: isActive(tab) }"
      :aria-current="isActive(tab) ? 'page' : undefined"
    >
      <MIcon :name="tab.icon" />
      <span>{{ tab.label }}</span>
      <span v-if="badgeOf(tab)" class="tabbar-badge" :aria-label="badgeOf(tab) + ' 项待办'">{{ badgeOf(tab) }}</span>
    </router-link>
  </nav>
</template>
