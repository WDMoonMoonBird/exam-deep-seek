/**
 * useEditorLazyMount.js —— 由 client/src/views/student/Submit.vue 的 <script setup> 拆分而来（step 2 / 批次 B2，源行 554-556 / 558-592（另含 retryPractice:394-395 两行））。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 */

import { reactive, nextTick } from 'vue';

export function useEditorLazyMount({ answers }) {

// ===================== 编辑器懒挂载 =====================

const editorMounted = reactive({});
const editorRefs = reactive({});
let editorObserver = null;

/** 惰性创建 IntersectionObserver：占位块注册时若 observer 尚未创建则即时创建（V5 首帧竞态修复） */
function ensureEditorObserver() {
  if (editorObserver) return;
  editorObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const sqId = entry.target._sqId;
        if (sqId != null) {
          mountEditor(sqId);
          editorObserver.unobserve(entry.target);
        }
      }
    }
  }, { rootMargin: '400px' });
}

function setupEditorObserve(el, sqId) {
  if (!el) return;
  el._sqId = sqId;                 // 先写标记再观察（原实现在 observer 未就绪时提前 return，标记也丢了）
  ensureEditorObserver();
  editorObserver.observe(el);
}

function mountEditor(sqId) {
  if (!editorMounted[sqId]) {
    editorMounted[sqId] = true;
    nextTick(() => {
      if (!answers[sqId]) answers[sqId] = '';
    });
  }
}

function formatEditor(sqId) {
  editorRefs[sqId]?.format?.();
}

/** 卸载旧的编辑器状态以便重新挂载（源 retryPractice :394-395 两行原样搬入） */
function resetEditors() {
        for (const key in editorRefs) delete editorRefs[key];
        for (const key in editorMounted) editorMounted[key] = false;
}

/** 清理编辑器实例（onUnmounted 集中调用；顺序与源 :1203-1204 一致） */
function disconnectEditorObserver() {
  editorObserver?.disconnect();
}

  return {
    editorMounted, editorRefs, ensureEditorObserver, setupEditorObserve,
    mountEditor, formatEditor, resetEditors, disconnectEditorObserver,
  };
}
