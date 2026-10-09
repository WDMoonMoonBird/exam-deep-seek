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
import { createAntdTheme } from './styles/antd-theme';

// 现代浏览器（支持 :where）用默认 low 模式：antd 样式低优先级，自定义样式天然覆盖，
// 行为与未加 StyleProvider 时完全一致（还原头部导航栏等自定义样式）。
// 旧浏览器（Chrome < 88）:where 不可用，antd 默认样式会被浏览器丢弃，
// 需 high 模式注入；副作用是 antd 默认样式可能反覆盖自定义样式，
// 由 legacy-patch.css 用 !important 兜底关键样式（静态加载，规则以 html.legacy
// 为前缀，仅对旧浏览器匹配生效）。
const legacyMode = isLegacyBrowser();

// 主题值统一来自设计令牌（styles/tokens.css → styles/antd-theme.js）。
// Wave 0 的取值与改造前逐项一致（含 fontSize 15 / 圆角 18 / 标签胶囊），因此视觉零变化；
// 切换到新尺度是 Wave 1 的显式动作，见 antd-theme.js 中的 WAVE1 标注。
const theme = createAntdTheme();
</script>
