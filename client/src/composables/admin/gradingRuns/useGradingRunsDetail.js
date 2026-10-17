/**
 * client/src/composables/admin/gradingRuns/useGradingRunsDetail.js —— 批改记录页的**详情抽屉状态 + 取数/日志/下载 + 展示块**（B3 纯搬运：从 GradingRuns.vue 原样搬出）。
 *
 * 依赖注入：request（既有 axios 实例）由页面传入；URL 保持既有字面量 '/admin/grading-runs'（行为不变）；
 * 三块面板（用量/元信息/工具）与销毁证据的计算口径、错误文案、10s 内联 objectURL 下载行为与拆分前逐字一致。
 */
import { ref, computed } from 'vue';

export function useGradingRunsDetail({ request }) {
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref(null);
const detailError = ref('');
const logText = ref('');
const logMissing = ref('');
const logDownloading = ref(false);   // ★R2-B38：全量日志下载中（走既有 axios 实例 + Blob，不产生裸根 URL）


/** ★R2-B37：三块面板数据（不可得 ⇒ null + 明确语义，不显示假 0） */
const usage = computed(() => (detail.value && detail.value.usage) || null);
const usageInfo = computed(() => (detail.value && detail.value.usage_info) || {});
const meta = computed(() => (detail.value && detail.value.meta) || null);
const tools = computed(() => (detail.value && detail.value.tools) || []);
const toolsInfo = computed(() => (detail.value && detail.value.tools_info) || {});
const toolsAvailable = computed(() => toolsInfo.value.available === true && Array.isArray(detail.value && detail.value.tools));

const usageAlertType = computed(() => {
  if (usage.value && usage.value.no_model_session === true) return 'info';
  return usage.value ? 'success' : 'warning';
});
const usageEmptyText = computed(() => '用量不可得（reason=' + (usageInfo.value.reason || 'unknown') + '）：该运行没有落库的用量记录（旧运行，或迁移未落地）');
const manifestText = computed(() => JSON.stringify((meta.value && meta.value.standard_package && meta.value.standard_package.manifest) || {}, null, 2));
const ev = computed(() => (detail.value && detail.value.teardown_json) || {});
const submissions = computed(() => (detail.value && detail.value.submissions) || []);
const filesText = computed(() => {
  const e = ev.value;
  return `${e.session_files_before ?? '—'} → ${e.session_files_after ?? '—'}`;
});
const purgeAlertType = computed(() => {
  if (ev.value.sessions_purged === true) return 'success';
  if (ev.value.sessions_purged === false) return 'warning';
  return 'info';
});
const purgeHeadline = computed(() => {
  if (ev.value.sessions_purged === true) return '会话已销毁（sessions_purged=true）';
  if (ev.value.sessions_purged === false) return '会话未销毁（sessions_purged=false）—— 关注：失败保留现场，或未执行 teardown';
  return '无销毁证据（旧运行，或装置侧未产出证据）';
});
const purgeHint = computed(() => {
  const e = ev.value;
  return `home_exists_after=${e.home_exists_after ?? '—'} ｜ credentials_removed=${e.credentials_removed ?? '—'} ｜ session_files ${e.session_files_before ?? '—'} → ${e.session_files_after ?? '—'} ｜ bytes=${e.session_bytes ?? '—'} ｜ source=${e.source || '—'}`;
});

async function openDetail(record) {
  detailOpen.value = true; detailLoading.value = true; detailError.value = ''; detail.value = null; logText.value = ''; logMissing.value = '';
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(record.id)}`);
    const data = (res && res.data) || res;
    if (!data || !data.run) detailError.value = '该运行没有可展示的详情（归档缺失或已被清理）';
    else detail.value = data;
  } catch (err) {
    // ★R2-B54：UI 只放固定友好文案；原始错误进 console（不得透出到界面）
    console.error('[R2-B54] admin/GradingRuns.vue 读取运行详情失败', err);
    detailError.value = '读取详情失败，请重试';
  } finally {
    detailLoading.value = false;
  }
}

async function loadLog(kind) {
  logText.value = ''; logMissing.value = '';
  const id = detail.value && detail.value.run ? detail.value.run.id : null;
  if (!id) return;
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(id)}/log`, { params: { kind }, responseType: 'text', transformResponse: [(d) => d] });
    const text = typeof res === 'string' ? res : ((res && res.data) || '');
    if (String(text).indexOf('# 日志缺失') === 0) logMissing.value = (String(text).match(/reason=([^\s]+)/) || [])[1] || 'missing';
    else logText.value = String(text).slice(-8000);
  } catch (err) {
    console.error('[R2-B54] admin/GradingRuns.vue 读取日志失败', err);
    logMissing.value = '日志暂不可得，请稍后重试';
  }
}

/** ★R2-B38（t6）：下载**全量**日志（后端 download=1 + 不带窗口参数 ⇒ 整份文件；脱敏在服务端完成）。
 *  走既有 axios 实例（带鉴权头），Blob + 临时 objectURL 触发下载 ⇒ 不引入任何裸根资源路径。 */
async function downloadLog(kind) {
  const id = detail.value && detail.value.run ? detail.value.run.id : null;
  if (!id) return;
  logDownloading.value = true;
  try {
    const res = await request.get(`/admin/grading-runs/${encodeURIComponent(id)}/log`, {
      params: { kind, download: 1 }, responseType: 'blob',
    });
    const blob = (res && res.data) || (res && res instanceof Blob ? res : null);
    if (!blob) { logMissing.value = 'download_failed:empty'; return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = String(id) + '.' + kind + '.log';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error('[R2-B54] admin/GradingRuns.vue 下载日志失败', err);
    logMissing.value = '日志下载失败，请稍后重试';
  } finally {
    logDownloading.value = false;
  }
}

  return {
    detailOpen, detailLoading, detail, detailError,
    logText, logMissing, logDownloading,
    openDetail, loadLog, downloadLog,
    usage, usageInfo, meta, tools, toolsInfo, toolsAvailable,
    usageAlertType, usageEmptyText, manifestText,
    ev, submissions, filesText, purgeAlertType, purgeHeadline, purgeHint,
  };
}
