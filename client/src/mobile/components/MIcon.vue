<script setup>
/**
 * MIcon —— 移动端线性图标（内联 SVG，零外部资源 / 零依赖）
 *
 * 图标数据迁移自设计稿 docs/mobile-app/preview/assets/screen.js 的 ICONS（24x24，stroke 1.8）。
 * 用法：
 *   <MIcon name="back" />
 *   <MIcon name="search" size="sm" />
 *   <MIcon name="check-circle" label="已完成" />
 * 约定：默认 aria-hidden（装饰性）；传入 label 时 role="img" + aria-label（语义图标）。
 * 注意：图标不响应主题，颜色跟随父级 color（stroke: currentColor）。
 */
import { computed } from 'vue';

const MOBILE_ICON_NAMES = [
  "back",
  "chevron-right",
  "chevron-down",
  "chevron-up",
  "close",
  "more",
  "search",
  "bell",
  "plus",
  "minus",
  "check",
  "home",
  "assignments",
  "review",
  "user",
  "users",
  "scores",
  "chart",
  "activity",
  "clock",
  "calendar",
  "filter",
  "download",
  "upload",
  "refresh",
  "share",
  "code",
  "qr",
  "copy",
  "edit",
  "trash",
  "star",
  "alert",
  "info",
  "wifi-off",
  "logout",
  "moon",
  "sun",
  "settings",
  "eye",
  "link",
  "file",
  "folder",
  "message",
  "arrow-right",
  "arrow-left",
  "arrow-up",
  "lock",
  "play",
  "grid",
  "sort",
  "external",
  "book",
  "zap",
  "logo",
  "x-circle",
  "check-circle",
  "inbox",
  "archive",
  "pin",
  "rotate-ccw"
];

const ICONS = {
  "back": [["path",{"d":"M15 18l-6-6 6-6"}]],
  "chevron-right": [["path",{"d":"M9 18l6-6-6-6"}]],
  "chevron-down": [["path",{"d":"M6 9l6 6 6-6"}]],
  "chevron-up": [["path",{"d":"M6 15l6-6 6 6"}]],
  "close": [["path",{"d":"M6 6l12 12M18 6L6 18"}]],
  "more": [["path",{"d":"M5 12h.01M12 12h.01M19 12h.01"}]],
  "search": [["circle",{"cx":11,"cy":11,"r":7}],["path",{"d":"M20 20l-3.6-3.6"}]],
  "bell": [["path",{"d":"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"}],["path",{"d":"M10.3 21a2 2 0 0 0 3.4 0"}]],
  "plus": [["path",{"d":"M12 5v14M5 12h14"}]],
  "minus": [["path",{"d":"M5 12h14"}]],
  "check": [["path",{"d":"M20 6L9 17l-5-5"}]],
  "home": [["path",{"d":"M3 10.5L12 3l9 7.5"}],["path",{"d":"M5 9.5V21h14V9.5"}],["path",{"d":"M9.5 21v-6h5v6"}]],
  "assignments": [["rect",{"x":4,"y":4,"width":16,"height":17,"rx":2.5}],["path",{"d":"M8 9.5h8M8 14h8M8 18.5h5"}]],
  "review": [["rect",{"x":5,"y":4,"width":14,"height":17,"rx":2.5}],["path",{"d":"M9 3.5h6v3H9z"}],["path",{"d":"M8.5 13l2.5 2.5 4.5-5"}]],
  "user": [["circle",{"cx":12,"cy":8,"r":4}],["path",{"d":"M4.5 21c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6"}]],
  "users": [["circle",{"cx":9,"cy":8,"r":3.5}],["path",{"d":"M2.5 20c.5-3.2 3.1-5 6.5-5s6 1.8 6.5 5"}],["path",{"d":"M16 4.6a3.5 3.5 0 0 1 0 6.8"}],["path",{"d":"M18.5 15.4c1.7.6 2.8 2 3 4.6"}]],
  "scores": [["circle",{"cx":12,"cy":9,"r":5}],["path",{"d":"M8.5 13.5L7 22l5-3 5 3-1.5-8.5"}]],
  "chart": [["path",{"d":"M3 20h18"}],["path",{"d":"M6 20v-6M11 20V10M16 20v-4M21 20V6"}]],
  "activity": [["path",{"d":"M3 12h4l3-8 4 16 3-8h4"}]],
  "clock": [["circle",{"cx":12,"cy":12,"r":9}],["path",{"d":"M12 7v5l3 2"}]],
  "calendar": [["rect",{"x":3,"y":5,"width":18,"height":16,"rx":2.5}],["path",{"d":"M3 10h18M8 3v4M16 3v4"}]],
  "filter": [["path",{"d":"M3 5h18l-7 8v6l-4 2v-8z"}]],
  "download": [["path",{"d":"M12 3v12"}],["path",{"d":"M7 10l5 5 5-5"}],["path",{"d":"M4 21h16"}]],
  "upload": [["path",{"d":"M12 21V9"}],["path",{"d":"M7 14l5-5 5 5"}],["path",{"d":"M4 3h16"}]],
  "refresh": [["path",{"d":"M20 11a8 8 0 1 0-2.3 5.7"}],["path",{"d":"M20 4v7h-7"}]],
  "share": [["circle",{"cx":6,"cy":12,"r":2.5}],["circle",{"cx":18,"cy":6,"r":2.5}],["circle",{"cx":18,"cy":18,"r":2.5}],["path",{"d":"M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"}]],
  "code": [["path",{"d":"M9 18l-6-6 6-6"}],["path",{"d":"M15 6l6 6-6 6"}]],
  "qr": [["rect",{"x":3,"y":3,"width":7,"height":7,"rx":1}],["rect",{"x":14,"y":3,"width":7,"height":7,"rx":1}],["rect",{"x":3,"y":14,"width":7,"height":7,"rx":1}],["path",{"d":"M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4"}]],
  "copy": [["rect",{"x":9,"y":9,"width":11,"height":11,"rx":2}],["path",{"d":"M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"}]],
  "edit": [["path",{"d":"M12 20h9"}],["path",{"d":"M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"}]],
  "trash": [["path",{"d":"M3 6h18"}],["path",{"d":"M8 6V4h8v2"}],["path",{"d":"M6 6l1 14h10l1-14"}],["path",{"d":"M10 11v5M14 11v5"}]],
  "star": [["path",{"d":"M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z"}]],
  "alert": [["path",{"d":"M12 3L2 21h20L12 3z"}],["path",{"d":"M12 9v6M12 18h.01"}]],
  "info": [["circle",{"cx":12,"cy":12,"r":9}],["path",{"d":"M12 11v5M12 8h.01"}]],
  "wifi-off": [["path",{"d":"M2 2l20 20"}],["path",{"d":"M8.5 8.5a10 10 0 0 1 12 3"}],["path",{"d":"M5 12a10 10 0 0 1 3.4-2.4"}],["path",{"d":"M9 15.5a5 5 0 0 1 6 0"}],["path",{"d":"M12 19h.01"}]],
  "logout": [["path",{"d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}],["path",{"d":"M16 17l5-5-5-5"}],["path",{"d":"M21 12H9"}]],
  "moon": [["path",{"d":"M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"}]],
  "sun": [["circle",{"cx":12,"cy":12,"r":4.2}],["path",{"d":"M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"}]],
  "settings": [["circle",{"cx":12,"cy":12,"r":3}],["path",{"d":"M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"}]],
  "eye": [["path",{"d":"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"}],["circle",{"cx":12,"cy":12,"r":3}]],
  "link": [["path",{"d":"M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"}],["path",{"d":"M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"}]],
  "file": [["path",{"d":"M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"}],["path",{"d":"M14 3v6h6"}]],
  "folder": [["path",{"d":"M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"}]],
  "message": [["path",{"d":"M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"}]],
  "arrow-right": [["path",{"d":"M4 12h16"}],["path",{"d":"M14 6l6 6-6 6"}]],
  "arrow-left": [["path",{"d":"M20 12H4"}],["path",{"d":"M10 6l-6 6 6 6"}]],
  "arrow-up": [["path",{"d":"M12 20V4"}],["path",{"d":"M6 10l6-6 6 6"}]],
  "lock": [["rect",{"x":4,"y":10,"width":16,"height":11,"rx":2.5}],["path",{"d":"M8 10V7a4 4 0 0 1 8 0v3"}]],
  "play": [["path",{"d":"M8 5l12 7-12 7V5z"}]],
  "grid": [["rect",{"x":3,"y":3,"width":7,"height":7,"rx":1.5}],["rect",{"x":14,"y":3,"width":7,"height":7,"rx":1.5}],["rect",{"x":3,"y":14,"width":7,"height":7,"rx":1.5}],["rect",{"x":14,"y":14,"width":7,"height":7,"rx":1.5}]],
  "sort": [["path",{"d":"M7 4v16M3 8l4-4 4 4"}],["path",{"d":"M17 20V4M13 16l4 4 4-4"}]],
  "external": [["path",{"d":"M14 3h7v7"}],["path",{"d":"M21 3l-9 9"}],["path",{"d":"M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"}]],
  "book": [["path",{"d":"M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4V4z"}],["path",{"d":"M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3V4z"}]],
  "zap": [["path",{"d":"M13 2L4 14h7l-1 8 9-12h-7l1-8z"}]],
  "logo": [["path",{"d":"M4 5h9a6.5 6.5 0 0 1 0 13H4V5z"}],["path",{"d":"M8 9h5a2.5 2.5 0 0 1 0 5H8V9z"}]],
  "x-circle": [["circle",{"cx":12,"cy":12,"r":9}],["path",{"d":"M9 9l6 6M15 9l-6 6"}]],
  "check-circle": [["circle",{"cx":12,"cy":12,"r":9}],["path",{"d":"M8 12.5l2.5 2.5L16 9.5"}]],
  "inbox": [["path",{"d":"M4 4h16v16H4z","opacity":0}],["path",{"d":"M3 13h4l2 3h6l2-3h4"}],["path",{"d":"M5 5h14l2 8v6H3v-6l2-8z"}]],
  "archive": [["rect",{"x":3,"y":4,"width":18,"height":5,"rx":1.5}],["path",{"d":"M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"}],["path",{"d":"M10 13h4"}]],
  "pin": [["path",{"d":"M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"}],["circle",{"cx":12,"cy":10,"r":2.5}]],
  "rotate-ccw": [["path",{"d":"M4 11a8 8 0 1 0 2.3-5.7"}],["path",{"d":"M4 4v7h7"}]],
};

const props = defineProps({
  /** 图标名（见 MOBILE_ICON_NAMES） */
  name: { type: String, required: true },
  /** 尺寸档：''(22px) | 'sm'(18) | 'lg'(26) | 'xl'(32) */
  size: { type: String, default: '' },
  /** 有语义的图标传入 label（会设置 role="img" + aria-label） */
  label: { type: String, default: '' },
});

const shapes = computed(() => ICONS[props.name] || []);
const sizeClass = computed(() => (props.size ? 'icon--' + props.size : ''));

// 开发期提示：拼错图标名不会静默渲染空白（生产构建无此分支）
if (import.meta.env && import.meta.env.DEV && !ICONS[props.name]) {
  console.warn('[MIcon] 未知图标：' + props.name + '；可用：' + MOBILE_ICON_NAMES.join(', '));
}
</script>

<template>
  <svg
    class="icon"
    :class="sizeClass"
    viewBox="0 0 24 24"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <component :is="shape[0]" v-for="(shape, index) in shapes" :key="index" v-bind="shape[1]" />
  </svg>
</template>
