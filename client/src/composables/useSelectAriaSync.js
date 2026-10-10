// useSelectAriaSync.js — antd Select 的 aria 运行时同步器（B3-6 / 任务 t21）
//
// 背景（antd 4.2.6 上游行为；根因与实测见 docs/reports/B3-antd上游aria调查-2026-10-10.md §1/§2）：
//   ① role=combobox 的 input 在「首次打开下拉前」完全没有 aria-expanded
//      —— BaseSelect.js:240-244 的 mergedOpen 初值 undefined，经 Selector/index.js → Single/MultipleSelector
//         传到 Selector/Input.js:31-34、119 时仍为 undefined，而 Vue 对 undefined 不渲染属性；
//      → axe aria-required-attr（critical：ARIA 1.2 要求 combobox 必须带 aria-expanded）。
//   ② input 上的 aria-activedescendant 在弹层未渲染时指向不存在的选项 DOM
//      —— Select.js:482 无条件算 \`\${id}_list_\${index}\`，而选项 DOM 只在弹层里渲染；
//      → axe aria-valid-attr-value（critical：ID 引用必须解析）。
//   两者都只出现在「首开前的窗口期」：用户首次打开任一下拉后，antd 自己会写回 true/false 与有效 AD。
//
// 本同步器（不改 antd 源码、不加依赖、不碰交互）：
//   · 以 .ant-select-open 这个「视觉真源」为准，把 input 的 aria-expanded 同步为 "true"/"false"
//     （缺失则补，值不符则改）——因此**首开前就是正确的 "false"**；
//   · aria-activedescendant 维持「打开时指向真实存在的选项、关闭时不留悬空引用」：
//       打开态且 AD 缺失/悬空 → 补写成当前真实渲染的选项 id（优先 antd 的活动项 .ant-select-item-option-active）；
//       关闭态且 AD 悬空 → 移除；只要 AD 仍能解析就一律保留（不覆盖 antd 的有效值，不参与其渲染竞争）；
//   · MutationObserver 观察 class 与子树变化，**只处理与 .ant-select / .ant-select-dropdown 相关的变更**
//     （其余变更立即返回），同一批变更在一个微任务里合并刷新（每个 select 每批只同步一次）；
//   · stop() 供卸载/HMR 断开（App.vue 的 onBeforeUnmount 与 import.meta.hot.dispose 都会调用）；
//     dispose 后 observer 不再回调，统计里的 observers 归 0。
//
// 只读统计（性能复核/验收用，非业务逻辑）：window.__selectAriaSyncStats
//   { callbacks, mutationsSeen, mutationsRelevant, selectsTouched, expandedWritten, adRemoved, adWritten, flushes, flushMs, observers, stopped }
import { onBeforeUnmount } from 'vue';

// 旧内核兼容（本仓 browserslist = chrome >= 69）：queueMicrotask 是 Chrome 71+；
// 缺失时退到 Promise.then（Chrome 69 有 Promise，plugin-legacy 也带 Promise polyfill）。
const scheduleMicrotask = typeof queueMicrotask === 'function'
  ? queueMicrotask
  : (cb) => { Promise.resolve().then(cb); };

const OPEN_CLASS = 'ant-select-open';
const DROPDOWN_CLASS = 'ant-select-dropdown';
const LIST_SUFFIX = '_list';

const stats = {
  callbacks: 0,          // MutationObserver 回调次数
  mutationsSeen: 0,      // 回调里看到的 MutationRecord 总数
  mutationsRelevant: 0,  // 其中与 select 相关、真正进入同步的条数
  selectsTouched: 0,     // syncSelect 执行次数（去重后）
  expandedWritten: 0,    // aria-expanded 实际写入次数（含首次补 "false"）
  adRemoved: 0,          // 移除悬空 aria-activedescendant 的次数
  adWritten: 0,          // 打开态补写 aria-activedescendant（指向真实渲染的选项）的次数
  flushes: 0,            // 合并刷新批次数
  flushMs: 0,            // 刷新累计耗时（ms，performance.now 差）
  observers: 0,          // 当前存活的 observer 数（应为 0/1）
  stopped: false,
};

/**
 * 找「当前真实渲染的选项 id」：优先 antd 的活动项（.ant-select-item-option-active），
 * 否则该 select 已渲染的第一个选项（id 形如 \`<inputId>_list_<n>\`，与 antd 自己算 AD 的规则一致）。
 * 目的：下拉打开时 AD 必须指向一个真实存在的选项（而不是缺失）。
 */
function renderedOptionId(input) {
  const prefix = input.id ? input.id + LIST_SUFFIX + '_' : null;
  if (!prefix) return null;
  const dropdown = document.getElementById(input.id + LIST_SUFFIX);
  const scope = dropdown || document;
  const active = scope.querySelector('.ant-select-item-option-active');
  if (active && active.id) return active.id;
  if (dropdown) {
    const first = dropdown.querySelector('[id^="' + prefix + '"]');
    if (first && first.id) return first.id;
  }
  const any = document.querySelector('[id^="' + prefix + '"]');
  return any && any.id ? any.id : null;
}

/**
 * 同步单个 .ant-select：
 *   · aria-expanded 始终等于视觉真源（.ant-select-open → "true" / 否则 "false"）；
 *   · 打开态：AD 缺失或悬空 → 补写成真实渲染的选项 id（语义正确，读屏能报出活动项）；
 *   · 关闭态：AD 悬空（指向已卸载的选项）→ 移除；仍能解析的值一律保留（不与 antd 争抢）。
 */
function syncSelect(selectEl) {
  if (!selectEl || !selectEl.isConnected) return;
  const open = selectEl.classList.contains(OPEN_CLASS);
  const wantExpanded = open ? 'true' : 'false';
  const inputs = selectEl.querySelectorAll('input[role="combobox"]');
  for (const input of inputs) {
    if (input.getAttribute('aria-expanded') !== wantExpanded) {
      input.setAttribute('aria-expanded', wantExpanded);
      stats.expandedWritten++;
    }
    const ad = input.getAttribute('aria-activedescendant');
    const adResolves = !!(ad && document.getElementById(ad));
    if (open) {
      if (!adResolves) {
        const target = renderedOptionId(input);
        if (target) {
          input.setAttribute('aria-activedescendant', target);
          stats.adWritten++;
        }
      }
    } else if (ad && !adResolves) {
      input.removeAttribute('aria-activedescendant');
      stats.adRemoved++;
    }
  }
  stats.selectsTouched++;
}

/** 由任意节点向上找最近的 .ant-select（找不到返回 null） */
function nearestSelect(node) {
  if (!node || node.nodeType !== 1) return null;
  if (node.classList && node.classList.contains('ant-select')) return node;
  return node.closest ? node.closest('.ant-select') : null;
}

/** 弹层（.ant-select-dropdown#<inputId>_list）→ 反查它对应的 .ant-select（弹层是 select 的兄弟/外部节点） */
function selectOfDropdown(dropdown) {
  if (!dropdown || !dropdown.id || !dropdown.id.endsWith(LIST_SUFFIX)) return null;
  const input = document.getElementById(dropdown.id.slice(0, -LIST_SUFFIX.length));
  return input ? nearestSelect(input) : null;
}

export function useSelectAriaSync() {
  const pending = new Set();
  let scheduled = false;
  let stopped = false;

  function flush() {
    scheduled = false;
    if (!pending.size) return;
    const t0 = performance.now();
    for (const sel of pending) syncSelect(sel);
    pending.clear();
    stats.flushes++;
    stats.flushMs += performance.now() - t0;
  }

  function schedule(selectEl) {
    if (!selectEl) return;
    pending.add(selectEl);
    if (!scheduled) {
      scheduled = true;
      scheduleMicrotask(flush);
    }
  }

  /** 只处理与 select 相关的变更：class 变化、select 子树变化、select 弹层子树变化 */
  function onMutations(mutations) {
    stats.callbacks++;
    for (const m of mutations) {
      stats.mutationsSeen++;
      if (m.type === 'attributes') {
        if (m.attributeName !== 'class') continue;
        const sel = nearestSelect(m.target);
        if (!sel) continue;
        stats.mutationsRelevant++;
        schedule(sel);
        continue;
      }
      if (m.type === 'childList') {
        // 一条 record 里可能同时命中多个分支：合并成一次「相关」计数，避免统计口径虚高
        const touched = [];
        // 开关下拉时弹层内的选项会挂载/卸载 → 先处理弹层所在 subtree
        const dd = [m.target, ...m.addedNodes, ...m.removedNodes].find(
          (n) => n && n.nodeType === 1 && n.classList && n.classList.contains(DROPDOWN_CLASS),
        ) || (m.target && m.target.nodeType === 1 && m.target.closest ? m.target.closest('.' + DROPDOWN_CLASS) : null);
        const fromDropdown = selectOfDropdown(dd);
        if (fromDropdown) touched.push(fromDropdown);
        for (const n of m.addedNodes) {
          if (!n || n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('ant-select')) touched.push(n);
          if (n.querySelectorAll) {
            const inner = n.querySelectorAll('.ant-select');
            for (const s of inner) touched.push(s);
          }
          // 新增节点落在某个 select 内部（例如输入框/图标重渲染）→ 该 select 也需要校准
          const owner = nearestSelect(n);
          if (owner) touched.push(owner);
        }
        const targetSel = nearestSelect(m.target);
        if (targetSel) touched.push(targetSel);
        if (touched.length) {
          stats.mutationsRelevant++;
          for (const s of touched) schedule(s);
        }
      }
    }
  }

  /** 全量校准（挂载时跑一次；也可在需要时手动调用） */
  function syncAll() {
    const all = document.querySelectorAll('.ant-select');
    for (const sel of all) syncSelect(sel);
    return all.length;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    pending.clear();
    stats.observers = 0;
    stats.stopped = true;
  }

  const observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  });
  stats.observers++;
  stats.stopped = false;

  syncAll();                        // 首屏既有 select：立刻给出正确的 "false" / 清掉悬空 AD
  window.__selectAriaSyncStats = stats;   // 只读统计（性能复核与验收用）

  onBeforeUnmount(stop);
  // HMR：模块被替换前断开，避免旧 observer 泄漏（dev server 下每次热更新都会走到这里）
  if (import.meta.hot) import.meta.hot.dispose(() => stop());

  return { stop, syncAll, stats };
}

export default useSelectAriaSync;
