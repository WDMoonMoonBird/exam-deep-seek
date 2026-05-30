<template>
  <a-config-provider :theme="theme" :locale="zhCN">
    <router-view v-slot="{ Component, route }">
      <transition :name="route.meta.transition || 'page-fade'" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </a-config-provider>
</template>

<script setup>
import zhCN from 'ant-design-vue/locale/zh_CN';

const theme = {
  token: {
    borderRadius: 8,
    colorPrimary: '#0066cc',
    fontFamily: "SF Pro Text, system-ui, -apple-system, sans-serif",
    fontSize: 15,
  },
  components: {
    Button: { borderRadius: 8, primaryShadow: 'none' },
    Card: { borderRadiusLG: 18 },
    Modal: { borderRadiusLG: 18 },
    Table: { borderRadiusLG: 18 },
    Tag: { borderRadiusSM: 9999 },
  },
};
</script>
