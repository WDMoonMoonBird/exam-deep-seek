/**
 * infrastructure/dsh/worker/index.js —— DSH 评分 worker barrel（R2-B65：拆分自 services/dshGradingJobWorker.js）。
 *
 * R2-B65：从 services/dshGradingJobWorker.js（582 行）原样拆出；导出名与语义逐字保留（见 ./index.js barrel）。
 * 对外导出名与拆分前**完全一致**（22 个具名导出），调用方只改 import 路径。
 */

export { withRulerPrefix, readTeardownEvidence, runOnce } from './run-once.js';
export {
  JOB_STATUS, DEFAULT_MAX_ATTEMPTS, createGate, buildClaimSql, claimJobAtomic, finishJob,
} from './claim.js';
export {
  REUSE_CHECKER_MODE, BUILD_CHECKER_MODE, CHECKER_FROZEN_REL, CHECKER_JSON_REL, DEVICE_PATH_FLAGS,
  withWorkdirArg, withReuseCheckerArgs, withBuildCheckerArgs, absolutizeDeviceArgs, placeCheckerFiles,
} from './device-args.js';
export { AUTO_BUILD_CHECKER, isAutoBuildChecker, formatSessionScope } from './autoBuild.js';
export { findDueAssignments, resolveAutoGradeConfig, scanDueAssignments } from './dueAssignmentScanner.js';
export {
  DEVICE_LOG_FILES, redactSecrets, tailTruncate, persistDeviceLogs, errorTail,
} from './device-logs.js';
