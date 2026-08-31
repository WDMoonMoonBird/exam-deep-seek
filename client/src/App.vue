<template>
  <StyleProvider :hash-priority="legacyMode ? 'high' : 'low'"
                 :transformers="legacyMode ? [legacyLogicalPropertiesTransformer] : []">
    <a-config-provider :theme="theme" :locale="zhCN">
      <router-view v-slot="{ Component, route }">
        <transition :name="route.meta.transition || 'page-fade'" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </a-config-provider>
  </StyleProvider>
</template>

<script setup>
import zhCN from 'ant-design-vue/locale/zh_CN';
import { StyleProvider, legacyLogicalPropertiesTransformer } from 'ant-design-vue';
import { isLegacyBrowser } from './domain/browserCompat';
import './legacy-patch.css';

// 现代浏览器（支持 :where）用默认 low 模式：antd 样式低优先级，自定义样式天然覆盖，
// 行为与未加 StyleProvider 时完全一致（还原头部导航栏等自定义样式）。
// 旧浏览器（Chrome < 88）:where 不可用，antd 默认样式会被浏览器丢弃，
// 需 high 模式注入；副作用是 antd 默认样式可能反覆盖自定义样式，
// 由 legacy-patch.css 用 !important 兜底关键样式（静态加载，规则以 html.legacy
// 为前缀，仅对旧浏览器匹配生效）。
const legacyMode = isLegacyBrowser();

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
