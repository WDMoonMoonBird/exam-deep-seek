/**
 * useProjectUpload — 工程包上传逻辑（组合式函数，无 UI）
 *
 * 封装层级：
 *   domain/uploadFilter.js（纯函数：过滤/重打包）
 *     → useProjectUpload.js（本文件：状态 + 流程）
 *     → ProjectZipUploader.vue（UI 组件，界面与基线 9c4a2fc 一致）
 *     → 使用方页面（教师建题页 / 学生做题页）
 *
 * 职责：选文件 → 前端过滤重打包（依赖不上传）→ 大小校验 → 产出
 *   { packageFile, tree, fileContents, keptBytes, keptCount }
 * 上传动作由使用方决定（教师页立即传服务端拿 tempId；学生页提交时传）。
 */
import { ref } from 'vue';
import { filterAndRepackZip } from '../domain/uploadFilter.js';

export function useProjectUpload(options = {}) {
  const sizeLimitMB = options.sizeLimitMB ?? 50;

  /** 过滤中 */
  const processing = ref(false);
  /** 错误提示（解析失败/超限/无代码文件） */
  const errorMsg = ref('');
  /** 过滤后文件树（内部） */
  const tree = ref([]);
  /** 过滤后待上传的包 { blob, name } */
  const packageFile = ref(null);

  /** 选择并处理 zip 文件；成功返回产出，失败返回 null（错误信息在 errorMsg） */
  async function selectFile(file) {
    if (!file) return null;
    processing.value = true;
    errorMsg.value = '';
    try {
      const r = await filterAndRepackZip(file);
      if (r.keptBytes > sizeLimitMB * 1024 * 1024) {
        errorMsg.value = `过滤后代码文件仍超过 ${sizeLimitMB}MB（${(r.keptBytes / 1024 / 1024).toFixed(1)}MB，共 ${r.keptCount} 个文件），无法上传`;
        return null;
      }
      if (r.keptCount === 0) {
        errorMsg.value = '未在压缩包中找到可用的代码文件';
        return null;
      }
      tree.value = r.tree;
      packageFile.value = { blob: r.blob, name: r.name };
      return {
        tree: r.tree,
        fileContents: r.fileContents,
        keptBytes: r.keptBytes,
        keptCount: r.keptCount,
      };
    } catch (err) {
      errorMsg.value = '解析失败：' + (err.message || '未知错误');
      return null;
    } finally {
      processing.value = false;
    }
  }

  /** 重置状态（重新进入页面/重新选择时） */
  function reset() {
    processing.value = false;
    errorMsg.value = '';
    tree.value = [];
    packageFile.value = null;
  }

  return { processing, errorMsg, tree, packageFile, selectFile, reset };
}
