/**
 * useReviewLayout.js —— 由 client/src/views/teacher/ProjectReviewNew.vue 拆分而来（R2-B64 / t4）
 * 职责：Workbench 壳的**纯布局**状态（narrow / panelOpen / collapsed）+ matchMedia 生命周期。
 * 源：:285-291（collapsed/narrow/panelOpen/onShellMq）、:661-664 与 :668-671（matchMedia 生命周期）。
 * 行为不变：<1200px 右栏抽屉化、≥1200px 常驻；不改任何交互与请求。
 * 注意：源 :258-268 的 goBack 仍留在 SFC —— w64-3 从 SFC 抽取该函数体执行（属结构断言依赖，不迁出）。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue';

export function useReviewLayout() {
  const collapsed = ref(false);

  /** Workbench 壳：<1200px 时右栏评分面板抽屉化（纯布局，不改任何交互与请求） */
  const narrow = ref(false);
  const panelOpen = ref(false);
  let shellMq = null;
  function onShellMq(e) { narrow.value = e.matches; if (!e.matches) panelOpen.value = false; }

  // ★goBack 保留在 SFC（源 :258-268 逐字未动）：w64-3 会从 ProjectReviewNew.vue **抽取该函数体**在 sandbox 里执行，
  //   抽走即破坏该源码契约断言；它只有 7 行路由胶水，留在页面更贴合"结构断言不变"。

  // 源 :661-664（拆分前与 fetchData 同处一个 onMounted；此处独立注册，二者互不依赖）
  onMounted(() => {
    shellMq = window.matchMedia('(max-width: 1199px)');
    narrow.value = shellMq.matches;
    if (shellMq.addEventListener) shellMq.addEventListener('change', onShellMq);
    else shellMq.addListener(onShellMq);
  });

  // 源 :668-671
  onBeforeUnmount(() => {
    if (shellMq) {
      if (shellMq.removeEventListener) shellMq.removeEventListener('change', onShellMq);
      else shellMq.removeListener(onShellMq);
    }
  });

  return { narrow, panelOpen, collapsed };
}
