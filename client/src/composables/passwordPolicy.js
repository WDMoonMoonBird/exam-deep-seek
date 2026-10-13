/**
 * passwordPolicy.js —— R2-B58：自助改密码的**前端同口径**规则与文案（必须与后端 authController.validateSelfServicePassword 一字不差）。
 *   后端仍是权威（400 + 明确中文消息）；本模块只做**提交前本地拦截**与规则提示，避免无谓请求、提示更即时。
 *   规则：① ≥8 位 ② 同时含字母与数字 ③ 不得与原密码相同（另加前端表单自身的两次一致校验）。
 *   零依赖、无 Vue 相关调用 ⇒ 可在 node 下直接 import 断言（verify-frontend ⑪b）。
 */
export const PWD_MIN_LEN = 8;
export const PASSWORD_RULE_TEXT = '密码至少 8 位，且需同时包含字母和数字';

export const PWD_MSG = {
  tooShort: '新密码至少 8 位',
  needLetterDigit: '新密码需同时包含字母和数字',
  sameAsOld: '新密码不能与原密码相同',
  mismatch: '两次新密码不一致',
  empty: '请填写密码',
};

/**
 * 提交前本地校验：返回**第一条**不满足的中文提示（无问题返回空串）。
 * 与后端顺序一致：非空 ⇒ 长度 ⇒ 字母+数字 ⇒ 与原密码不同 ⇒ 两次一致。
 */
export function localPasswordIssue({ oldPassword = '', newPassword = '', confirmPassword = '' } = {}) {
  if (!oldPassword || !newPassword) return PWD_MSG.empty;
  if (String(newPassword).length < PWD_MIN_LEN) return PWD_MSG.tooShort;
  if (!/[A-Za-z]/.test(String(newPassword)) || !/[0-9]/.test(String(newPassword))) return PWD_MSG.needLetterDigit;
  if (String(newPassword) === String(oldPassword)) return PWD_MSG.sameAsOld;
  if (String(newPassword) !== String(confirmPassword)) return PWD_MSG.mismatch;
  return '';
}

export default { PWD_MIN_LEN, PASSWORD_RULE_TEXT, PWD_MSG, localPasswordIssue };