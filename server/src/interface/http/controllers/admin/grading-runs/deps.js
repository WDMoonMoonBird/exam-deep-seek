/**
 * grading-runs/deps.js —— 读模型**端口**（接口层取用基础设施的唯一通道）。
 *
 * ★分层铁律：interface 层禁止 import infrastructure（check-layers 对静态与动态 import() 都查）。
 *   因此本目录**不** import '../infrastructure/dsh/runs/read-model.js'，而是：
 *     ① 生产：组合根 infrastructure/bootstrap/compose.js 装配 dshRuns 并挂 app.locals.dshRuns（与 reviewUseCases 同范式）；
 *     ② 直调（单测直接调 handler，无 req.app）：调用 setDshRunsReadModel() 显式注入一次。
 * 两种来源都取不到 ⇒ 显式抛错（fail-fast，绝不静默返回空列表）。
 */
let injected = null;

/** 显式注入读模型（直调 handler 的测试/嵌入场景）；返回注入值便于链式使用。 */
export function setDshRunsReadModel(readModel) {
  injected = readModel;
  return readModel;
}

/** 取读模型：优先 req.app.locals.dshRuns（组合根装配），其次显式注入；都没有 ⇒ 抛错。 */
export function dshRunsOf(req) {
  const fromApp = req && req.app && req.app.locals ? req.app.locals.dshRuns : null;
  const readModel = fromApp || injected;
  if (!readModel) {
    const err = new Error('dshRuns 读模型未装配：应由 compose() 挂 app.locals.dshRuns，或调用 setDshRunsReadModel() 注入');
    err.code = 'DSH_RUNS_NOT_WIRED';
    throw err;
  }
  return readModel;
}
