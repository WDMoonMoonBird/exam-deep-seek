/**
 * useZipUpload.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B4，源行 223-226 / 582-630）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { ref, nextTick } from 'vue';
import { message } from 'ant-design-vue';
import { uploadPackage } from '../../api/projects.js';
import { findFirstFile } from './zipEntry.js';

export function useZipUpload({ form, isTeacher, externalTree, fileContents, editorContainerRef, resetModels, initMonaco, openFile, isCheckerLoaded, getCheckerStatus, checkerStale }) {

const hasUploaded = ref(false);
/** 上传过滤统计（"已过滤依赖，保留 X 个文件"，阶段二展示 + 成功 message） */
const uploadKeptCount = ref(0);
const uploadKeptBytes = ref(0);

// ===== 上传组件回调（ProjectZipUploader） =====

/** 过滤完成：填充内容预览、教师立刻上传服务端拿 tempId、打开第一个文件 */
async function onZipReady({ tree, fileContents: fc, keptCount, keptBytes }) {
  // 重新选择文件时释放旧 Monaco model
  resetModels();
  fileContents.clear();
  fc.forEach((v, k) => fileContents.set(k, v));
  // 传给阶段二 sidebar 组件显示（外部树优先，picker 自动隐藏）
  externalTree.value = tree;
  // 记录过滤统计（上传/提交成功 message 用）
  uploadKeptCount.value = keptCount;
  uploadKeptBytes.value = keptBytes;
  hasUploaded.value = true;

  if (isTeacher.value && form.packageFile) {
    await teacherUpload(form.packageFile.blob, form.packageFile.name);
  }

  // 标准工程包更换 → 已有自动评分器视为过期（保存守卫拦截并引导重新生成）
  if (isCheckerLoaded() && getCheckerStatus() && getCheckerStatus() !== 'none') {
    checkerStale.value = true;
  }

  await nextTick();
  await new Promise(r => setTimeout(r, 300));
  if (editorContainerRef.value) await initMonaco();
  const first = findFirstFile(tree);
  if (first) openFile(first.path, first.name, first.language);
}

/** 点击树节点：打开 Monaco tab */
function onZipSelect({ path, name, language }) {
  openFile(path, name, language);
}

/** 教师上传过滤后的包到服务端（拿 tempId；上传动作由页面决定，组件不感知） */
async function teacherUpload(blob, name) {
  try {
    const formData = new FormData();
    formData.append('file', blob, name);
    const r = await uploadPackage(formData);
    form.tempId = r.data?.tempId || '';
    message.success(`上传成功（已过滤依赖），保留 ${uploadKeptCount.value} 个代码文件 ${(uploadKeptBytes.value / 1024).toFixed(0)}KB`);
  } catch (err) {
    form.tempId = '';
    message.error('上传失败：' + (err.response?.data?.message || err.message) + '（可重试上传；也可不上传，直接保存为开放性题目）');
  }
}

  return { hasUploaded, uploadKeptCount, uploadKeptBytes, onZipReady, onZipSelect };
}

export default useZipUpload;
