/**
 * useChecker.js —— 由 client/src/views/teacher/ProjectQuestionEdit.vue 的 <script setup> 拆分而来
 * （step 5 / 批次 B3，源行 234-255 / 266-372）。
 * 逐字搬移：本文件内的函数体与源文件对应区间字节相同，未做任何逻辑改动。
 * ⚠️ 双模式：本文件服务教师端与学生端两条路由，模式常量由接线根唯一创建（不得自行 computed）。
 */

import { errorCopyOf } from '../errorCopy.js';   // ★R2-B55：UI 文案统一出口（固定友好 + 原始错误只进 console）
import { ref, computed, watch } from 'vue';
import { message } from 'ant-design-vue';
import request from '../../api/request.js';

export function useChecker({ route }) {

// AI 提示词预览（编辑页模板，与实评共用构建函数）
const promptModalOpen = ref(false);
const promptLoading = ref(false);
const promptPreview = ref(null);
/** 开放性题目（无标准工程包）的 user prompt 不含标准答案源码段，标题随之区分（R6） */
const promptUserPartLabel = computed(() => (promptPreview.value?.mode === 'open' ? '开放性题目，无标准答案源码' : '含标准工程源码'));

async function showPromptPreview() {
  const id = route.params.id;
  if (!id) return;
  promptModalOpen.value = true;
  promptLoading.value = true;
  promptPreview.value = null;
  try {
    const r = await request.get('/teacher/questions/' + id + '/project-prompt-preview');
    promptPreview.value = r.data;
  } catch (e) {
    message.error(errorCopyOf(e, { tag: 'useChecker.js 获取提示词', action: '获取提示词' }));
  } finally {
    promptLoading.value = false;
  }
}

// ===== 自动评分器（checker）=====
/** 功能开关：自动评分器**入口按钮**。2026-10-11 按用户要求【暂时取消】→ false = 隐藏手动入口。
 *  ⚠️ 注意：保存守卫在「评分器缺失/过期/未确认」时仍会调用 openCheckerModal() 作为逃生通道，本次未改动
 *  （否则教师将无法保存这类实训题）。恢复：改回 true 即恢复按钮。 */
const FEATURE_CHECKER_ENTRY = false;

const checkerOpen = ref(false);
const checkerLoading = ref(false);
const checkerData = ref({ status: 'none', script: '', meta: { rounds: 0, items: [], subjective: [], error: '', log: [] } });
const checkerTimer = ref(null);

const checkerStatus = computed(() => checkerData.value.status || 'none');
const checkerMeta = computed(() => checkerData.value.meta || { rounds: 0, items: [], subjective: [], error: '', log: [] });
// 生成/校准期间禁用 ESC（右上角 X 始终可用）；避免生成中误按键盘关闭
const checkerCanClose = computed(() => checkerStatus.value !== 'generating' && checkerStatus.value !== 'calibrating');
// 评分器状态是否已从后端加载（页面加载即拉取，供头部状态与保存守卫使用）
let checkerLoadedOnce = false;
// 标准工程包更换后评分器过期标记（重新生成时清除）
const checkerStale = ref(false);

/** 页面加载时拉取一次评分器状态（后端真实数据；重进页面无需重新生成评分器） */
async function ensureCheckerState() {
  const id = route.params.id;
  if (!id) return;
  try {
    await fetchChecker();
    checkerLoadedOnce = true;
    if (checkerStatus.value === 'generating' || checkerStatus.value === 'calibrating') startCheckerPoll();
  } catch { /* 后端未就绪时忽略 */ }
}

/** 向导状态回调：同步头部按钮状态；重新生成时清除标准包过期标记 */
function onCheckerStatusChange(s) {
  checkerData.value.status = s;
  if (s === 'generating') checkerStale.value = false;
}
const checkerLogs = computed(() => checkerMeta.value.log || []);

async function fetchChecker() {
  const id = route.params.id;
  if (!id) return;
  try {
    const r = await request.get('/teacher/questions/' + id + '/checker');
    if (!r.data) return;
    checkerData.value = {
      ...checkerData.value,
      ...r.data,
      meta: { ...checkerData.value.meta, ...(r.data.meta || {}) },
    };
    if (checkerStatus.value !== 'generating') stopCheckerPoll();
  } catch (e) {
    message.error(errorCopyOf(e, { tag: 'useChecker.js 获取自动评分器状态', action: '获取自动评分器状态' }));
    stopCheckerPoll();
  }
}

function startCheckerPoll() {
  stopCheckerPoll();
  checkerTimer.value = setInterval(fetchChecker, 3000);
}

function stopCheckerPoll() {
  if (checkerTimer.value) {
    clearInterval(checkerTimer.value);
    checkerTimer.value = null;
  }
}

async function openCheckerModal() {
  // §十一 改造：状态与轮询移交 CheckerWizard 管理（含 mock 流程）
  checkerOpen.value = true;
}

async function handleGenerateChecker() {
  const id = route.params.id;
  if (!id) return;
  checkerLoading.value = true;
  try {
    const r = await request.post('/teacher/questions/' + id + '/checker/generate');
    if (r.data) {
      checkerData.value = {
        ...checkerData.value,
        ...r.data,
        meta: { ...checkerData.value.meta, ...(r.data.meta || {}) },
      };
    } else {
      checkerData.value.status = 'generating';
    }
    startCheckerPoll();
  } catch (e) {
    message.error(errorCopyOf(e, { tag: 'useChecker.js 生成评分器', action: '生成' }));
  } finally {
    checkerLoading.value = false;
  }
}

async function copyScript() {
  try {
    await navigator.clipboard.writeText(checkerData.value.script || '');
    message.success('已复制');
  } catch {
    message.error('复制失败，请手动选择复制');
  }
}

// 模态框关闭时停止轮询
watch(checkerOpen, (open) => { if (!open) stopCheckerPoll(); });

  return {
    // K1：必须是普通 const（不是 ref）—— 模板 :38 的 && 依赖它的布尔值
    FEATURE_CHECKER_ENTRY,
    checkerOpen, checkerLoading, checkerData, checkerTimer, checkerStatus, checkerMeta, checkerCanClose, checkerStale, checkerLogs,
    ensureCheckerState, onCheckerStatusChange, fetchChecker, startCheckerPoll, stopCheckerPoll,
    openCheckerModal, handleGenerateChecker, copyScript,
    // getter：checkerLoadedOnce 是非响应式 let，跨单元只能以访问器共享（源 §1.3-2 单实例语义）
    isLoaded: () => checkerLoadedOnce,
    status: () => checkerData.value.status,
    promptModalOpen, promptLoading, promptPreview, promptUserPartLabel, showPromptPreview,
  };
}

export default useChecker;
