/**
 * useAssignmentsPage.js —— 接线根：由 client/src/views/teacher/Assignments.vue 拆分而来（R2-B64 / t4）
 * 把「列表」「布置作业表单（内含题目选择）」「纯函数」接成一个门面：.vue 只调用本函数一次，
 * 模板绑定的名字与拆分前逐一相同 ⇒ <template> 与两段 <style> 零改动。
 * 源：:719-722（首屏并发取数）。
 * 依赖方向：page → {list, form} → picker/pure → api·domain；无反向边（openAdd 以延迟回调注入，避免成环）。
 */
import { onMounted } from 'vue';
import { useAssignmentsList } from './useAssignmentsList.js';
import { useAssignmentForm } from './useAssignmentForm.js';

export function useAssignmentsPage() {
  // 延迟引用：onEmptyAction 只在用户点击空态按钮时才需要 openAdd（此时 formApi 已就绪）
  let formApi = null;
  const listApi = useAssignmentsList({ openAdd: () => formApi.openAdd() });
  formApi = useAssignmentForm({ list: listApi.list, onSaved: listApi.fetch });

  /** 源 :719-722 —— 首屏同时拉列表与班级下拉（班级复用向导接口，无新增请求） */
  onMounted(async () => {
    await Promise.all([listApi.fetch(), formApi.loadClasses()]);
  });

  return { ...listApi, ...formApi };
}
