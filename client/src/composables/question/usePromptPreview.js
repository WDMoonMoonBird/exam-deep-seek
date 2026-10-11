/**
 * usePromptPreview.js —— 由 client/src/views/teacher/QuestionEdit.vue 的 <script setup> 拆分而来
 * （step 6 / 批次 B4，源行 387-391 / 393-407）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * 注意：本页有两种题型形态（主观题 / 客观题），由 questionKind/sqKind 运行期状态驱动；
 *      形态真值源唯一（U3），本文件不得自行创建第二份。
 * 主观题专属（模板 :307 按钮 v-if=isEdit && questionKind===subjective）；无 watch / 无 hook。
 */
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';

export function usePromptPreview({ editId }) {
// AI 提示词预览（编辑页：模板预览，与实评共用构建函数）
const promptModalOpen = ref(false);
const promptLoading = ref(false);
const promptPreviewData = ref(null);
const promptActiveKeys = ref([]);

async function showPromptPreview() {
  if (!editId) return;
  promptModalOpen.value = true;
  promptLoading.value = true;
  promptPreviewData.value = null;
  try {
    const r = await request.get('/teacher/questions/' + editId + '/prompt-preview');
    promptPreviewData.value = r.data;
    promptActiveKeys.value = (r.data.subs || []).map(s => s.id);
  } catch (e) {
    message.error('获取提示词失败：' + (e.response?.data?.message || e.message));
  } finally {
    promptLoading.value = false;
  }
}

  return { promptModalOpen, promptLoading, promptPreviewData, promptActiveKeys, showPromptPreview };
}

export default usePromptPreview;
