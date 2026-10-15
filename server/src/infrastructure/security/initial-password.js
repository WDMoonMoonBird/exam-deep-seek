/**
 * initial-password.js —— ★H6（W2-P2c）：**一次性初始口令的唯一生成器**（单一真源）。
 *
 * 为什么单独成模块：审查报告 H6 的根因是「建号/重置口令 = 工号/学号」——口令可从公开信息推得。
 * 修复口径 = **随机临时口令 + 首登强制改密**（改密成功即清零标志）。于是"生成口令"从一个顺手的表达式
 * （`bcrypt.hashSync(username, 10)`）变成一个**安全原语**，必须：
 *   · 只有一个实现 —— 否则各处各写一份随机逻辑，强度/字符集迟早分叉（本波已有两次常量漂移事故）；
 *   · 用 CSPRNG（`crypto.randomInt`，内部拒绝采样 ⇒ 无取模偏差），**不用 `Math.random`**（可预测 ⇒ 口令可枚举）；
 *   · 输出恒满足自助改密的强度口径（含字母与数字；长度 12 > 该口径的 8 位下限）——
 *     ★刻意**不复制** `authController.PWD_MIN_LEN`：那是"用户新口令"的策略常量，复制即分叉；
 *     本生成器恒 ≥12 位（严格强于该下限），二者不需要同步；绑定关系由探针断言（见 W2-P2c 报告 §6）。
 *
 * 字符集刻意去掉易混字符（0/O/o、1/l/I、连字符、空格）⇒ 管理员/教师可安全地口头或抄写转达。
 * 熵：12 字符 × log2(56) ≈ 69.6 bit（在线暴力破解不可行，且登录侧另有 H5 三维限流）。
 *
 * 调用方职责（本模块不落库、不写日志）：
 *   ① 返回值**只回显一次**给创建者/管理员（响应 `message` + `data.initialPassword`，批量 `data.credentials`）；
 *   ② 库里**只存 bcrypt 哈希**；**禁止**把返回值写进任何 logger（凭据 ⇒ P0 级泄密面）。
 */

import crypto from 'crypto';

/** 去混淆字母表（无 0/O/o、1/l/I） */
export const INITIAL_PWD_LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export const INITIAL_PWD_DIGITS = '23456789';
const INITIAL_PWD_ALL = INITIAL_PWD_LETTERS + INITIAL_PWD_DIGITS;

/** 默认长度（≥ 自助改密策略下限 8 位） */
export const INITIAL_PWD_LEN = 12;

/**
 * 生成一次性初始口令（必含至少 1 个字母与 1 个数字）。
 * @param {number} [length] 目标长度（默认 12；非法/过小值回落默认，绝不生成短于 12 位的口令）
 * @returns {string}
 */
export function generateInitialPassword(length = INITIAL_PWD_LEN) {
  const want = Math.floor(Number(length));
  const n = Math.max(INITIAL_PWD_LEN, Number.isFinite(want) ? want : INITIAL_PWD_LEN);
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(INITIAL_PWD_LETTERS), pick(INITIAL_PWD_DIGITS)];
  while (chars.length < n) chars.push(pick(INITIAL_PWD_ALL));
  // Fisher–Yates 洗牌：字母/数字的**位置**也不可预测（不然首两位恒为"字母+数字"）
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const t = chars[i]; chars[i] = chars[j]; chars[j] = t;
  }
  return chars.join('');
}
