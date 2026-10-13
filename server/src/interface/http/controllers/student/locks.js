/**
 * student/locks.js —— 实训题提交的**进程内串行化锁**（R2-B65：从 controllers/studentController.js 原样拆出）。
 *
 * ★锁表必须是**模块级单例**：拆到多个文件会各自 new Map ⇒ 互斥失效。
 * 本模块只被 project-submit.js 使用（同一模块实例），语义与拆分前逐字一致。
 */

// ===================== 实训题提交并发串行化 =====================

/**
 * 进程内互斥锁表：以 (assignmentId, studentId, questionId) 为键，串行化同一键的实训题提交。
 *
 * 【为什么不用 SELECT ... FOR UPDATE】
 * 提交临界区不止读写数据库——还包含版本目录 rmSync 与 zip 解压等本地文件操作，
 * 数据库事务锁无法覆盖文件系统。进程内 Promise 链锁能把「读库算版本 + 落盘 + 写库」
 * 整段串行化，双击/压测下不再出现相同 version 互删目录或 P2002 冲突。
 * 本服务为单实例部署，进程内锁即可正确工作，且不改变对外行为与错误返回。
 */
const submitLocks = new Map();

/**
 * 获取以 key 为键的互斥锁并执行 task，串行化同一键的提交。
 *
 * @param {string} key 锁键（如 "12:3:4"，即 assignmentId:studentId:questionId）
 * @param {() => Promise<any>} task 临界区任务
 * @returns {Promise<any>} task 的结果；task 抛错时原样向上抛出，由调用方 try/catch 处理
 */
export async function withSubmitLock(key, task) {
  // 前一个请求无论成功/失败都已结束（或正在结束），用 .then(task, task) 等它完成再执行本次任务
  const prev = submitLocks.get(key) || Promise.resolve();
  const run = prev.then(task, task);
  // 本请求结束后若仍是最新锁则清除，避免 Map 无限增长；真实结果仍由 run 承载
  const settle = () => {
    if (submitLocks.get(key) === run) submitLocks.delete(key);
  };
  run.then(settle, settle);
  submitLocks.set(key, run);
  return run;
}
