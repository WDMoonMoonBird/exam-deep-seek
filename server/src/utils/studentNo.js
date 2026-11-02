/**
 * studentNo.js —— 评分审核「展示用学号」归一化（纯函数，不碰账号真值）。
 *
 * 背景：
 *   - 学生账号 users.username 的存储格式是「学号@院校代码」（多校隔离；登录/唯一性/
 *     查重/建号/限流键都依赖它），见 teacher/students.js、adminController.js、authController.js。
 *   - 评分审核页面与导出 Excel 需要的是**纯学号**：学校教务系统按纯学号匹配学生，
 *     带「@院校代码」后缀的 Excel 导入会匹配不到人。
 *   - 因此只在评分审核类接口的**响应出口**做一次只读投影：去掉末尾「@院校代码」后缀；
 *     无 @ 的历史账号原样返回。
 *
 * 约束：
 *   - 只用于响应展示字段；**禁止**回写数据库，也**禁止**用于登录/唯一性/权限判定。
 *   - 账号真值（users.username）保持「学号@院校代码」不变。
 */

/**
 * @param {unknown} username users.username（形如 `2024001@4145013830`）
 * @returns {string} 展示用纯学号；空值返回 ''
 */
export function toDisplayStudentNo(username) {
  const s = String(username ?? '');
  const at = s.lastIndexOf('@');
  return at > 0 ? s.slice(0, at) : s;
}

export default toDisplayStudentNo;
