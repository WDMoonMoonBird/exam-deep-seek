import { ref } from 'vue';

// 模块级 store，跨组件生命周期持久化排序和分页状态
export const savedSortField = ref('');
export const savedSortOrder = ref('');
export const savedPage = ref(1);
