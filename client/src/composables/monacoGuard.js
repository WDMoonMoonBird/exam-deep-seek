/**
 * monacoGuard.js —— ★W1-r2（t4）：Monaco 初始化失败的**统一就地兜底**（safe* 式约定，配套 verify-frontend ⑮ 口径）。
 *
 * 背景（同类缺陷）：代码编辑器是**重资产**（loader 动态取 monaco/vs 的 AMD 入口 + worker 脚本），
 *   校园网/离线/资源 404 时 \`loader.init()\` 会 reject。若调用处直接 \`await initMonaco()\`，失败会冒泡到
 *   调用它的页面流程（严重时被错误边界整页替换，或把"编辑器挂了"误报成"加载失败/提交失败"）。
 * 约定：所有 \`await initMonaco()\` 一律改走 \`safeInitMonaco(initMonaco, { tag })\`：
 *   · 成功 ⇒ 返回 true；
 *   · 失败 ⇒ **永不抛**：原始错误只进 console，界面**只提示一次**（一次故障不因多个入口弹多次），
 *     并返回 false ⇒ 页面骨架降级（没有编辑器，其余内容照常可见可用）。
 * 自检：verify-frontend ⑮i 用注入桩件跑三态（成功 / 失败只提示一次 / 复位后可再提示）。
 */
import { message } from 'ant-design-vue';

/** 已提示标记：一次页面生命周期内只提示一次（复位见 resetMonacoNotice，供自检使用） */
let noticeShown = false;

/** 提示文案固定（面向用户，不含任何原始错误原文） */
export const MONACO_FALLBACK_TEXT = '代码编辑器加载失败，本页其余内容仍可查看；刷新页面可重试';

/**
 * 记录并提示一次"编辑器不可用"。返回 true 表示**本次真的提示了**（用于自检断言"只提示一次"）。
 * @param {unknown} err 原始错误（只进 console）
 * @param {{tag?: string, log?: {error?: Function}, notify?: Function}} opts 自检可注入 log/notify
 */
export function noteMonacoUnavailable(err, { tag = 'Monaco', log = console, notify = null } = {}) {
  try { log.error('[W1-r2] ' + tag + '：代码编辑器加载失败（页面骨架降级，其余内容仍可用）', { err }); } catch { /* 日志失败不影响业务 */ }
  if (noticeShown) return false;
  noticeShown = true;
  try {
    if (typeof notify === 'function') notify(MONACO_FALLBACK_TEXT);
    else message.warning(MONACO_FALLBACK_TEXT);
  } catch { /* 提示失败不影响业务 */ }
  return true;
}

/**
 * 包一层 Monaco 初始化：失败**不抛**（页面骨架降级），成功返回 true。
 * 用法：\`if (editorContainerRef.value) await safeInitMonaco(initMonaco, { tag: 'useZipUpload.js' });\`
 */
export async function safeInitMonaco(initFn, opts = {}) {
  try {
    if (typeof initFn === 'function') await initFn();
    return true;
  } catch (err) {
    noteMonacoUnavailable(err, opts);
    return false;
  }
}

/** 自检用：复位"已提示"标记（真实运行不需要调用） */
export function resetMonacoNotice() { noticeShown = false; }

/** 自检用：当前是否已提示过 */
export function isMonacoNoticeShown() { return noticeShown; }

export default { MONACO_FALLBACK_TEXT, noteMonacoUnavailable, safeInitMonaco, resetMonacoNotice, isMonacoNoticeShown };
