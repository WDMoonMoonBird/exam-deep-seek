<template>
  <StyleProvider :hash-priority="legacyMode ? 'high' : 'low'"
                 :transformers="legacyMode ? [legacyLogicalPropertiesTransformer] : []">
    <a-config-provider :theme="theme" :locale="zhCN">
      <!-- ★R2-B54：移除顶层**路由过渡**（原 <transition :name="route.meta.transition||'page-fade'" mode="out-in">）——
           路由过渡是外观收益，却带来两类硬故障：①mode="out-in" 在"进入组件解析失败"时停 out ⇒ 整块空白；
           ②导航/异步组件中途过渡操作已移除节点 ⇒ 「Cannot read properties of null (reading 'parentNode')」竞态。
           元素级动画（tab-fade/page-fade 等 CSS 类）不受影响；错误边界仍位于 router-view **之外**。 -->
      <ErrorBoundary>
        <!-- ★R2-B54（C40-O2）：路由页**自身**抛错也要进边界 UI ⇒ 在 v-slot 内再包一层 **keyed** ErrorBoundary
             （reset-key=当前路由 ⇒ 换路由自动复位，不会一直停在错误页；此处同样**不得**加 transition） -->
        <router-view v-slot="{ Component, route }">
          <ErrorBoundary :reset-key="route.fullPath">
            <component :is="Component" />
          </ErrorBoundary>
        </router-view>
      </ErrorBoundary>
    </a-config-provider>
  </StyleProvider>
</template>

<script setup>
// 必须走 es/ 路径：包根 'ant-design-vue/locale/zh_CN' 是 CJS 文件，经 Vite 的 CJS interop 后
// 默认导入拿到的是包装对象 { default: 真实 locale }，ConfigProvider 取不到 locale.Pagination 等键，
// 全站 antd 内置文案会静默回落英文（分页「/ page」与「跳至」、Table「No data」、DatePicker 占位、
// Empty / Select「No Data」…）。es 版的默认导出就是 locale 对象，与仓库其余 antd locale 导入
// （views/teacher/Assignments.vue 的 dateLocale）保持一致。
import { computed } from 'vue';
import ErrorBoundary from './components/ErrorBoundary.vue';   // ★R2-B54：顶层错误边界（在 router-view 之外）
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import { StyleProvider, legacyLogicalPropertiesTransformer } from 'ant-design-vue';
import { isLegacyBrowser } from './domain/browserCompat';
import './legacy-patch.css';
import { createAntdTheme } from './styles/antd-theme';
import { useTheme } from './composables/useTheme';
// B3-6（t21）：antd Select 的 aria 运行时同步器（补 aria-expanded、清悬空 aria-activedescendant）——
// 全站挂一次即可（根组件）。根因与实测见 docs/reports/B3-antd上游aria调查-2026-10-10.md §1/§2。
import { useSelectAriaSync } from './composables/useSelectAriaSync';

// 现代浏览器（支持 :where）用默认 low 模式：antd 样式低优先级，自定义样式天然覆盖，
// 行为与未加 StyleProvider 时完全一致（还原头部导航栏等自定义样式）。
// 旧浏览器（Chrome < 88）:where 不可用，antd 默认样式会被浏览器丢弃，
// 需 high 模式注入；副作用是 antd 默认样式可能反覆盖自定义样式，
// 由 legacy-patch.css 用强制优先级规则兜底关键样式（该文件约定允许，静态加载，
// 规则以 html.legacy 为前缀，仅对旧浏览器匹配生效）。
const legacyMode = isLegacyBrowser();

// 主题值统一来自设计令牌（styles/tokens.css → styles/antd-theme.js）。
// Wave 0 的取值与改造前逐项一致（含 fontSize 15 / 圆角 18 / 标签胶囊），因此视觉零变化；
// 切换到新尺度是 Wave 1 的显式动作，见 antd-theme.js 中的 WAVE1 标注。
// Wave 5 · t31：主题随 useTheme().resolved 重新派生（darkAlgorithm/defaultAlgorithm + 重新读 CSS 变量）
const { resolved: themeResolved } = useTheme();
const theme = computed(() => createAntdTheme(themeResolved.value));

// aria 同步器：挂载时全量校准一次，之后由 MutationObserver 按 .ant-select-open 增量同步；
// 卸载/HMR 由 composable 内部（onBeforeUnmount + import.meta.hot.dispose）断开 observer。
useSelectAriaSync();
</script>
