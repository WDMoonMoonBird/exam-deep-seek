/**
 * 场景：学生管理 · 添加学生与重置密码
 *
 * 约定：场景文件只放「文案 + 步骤脚本 + 假数据」，不放界面（界面在 sections/StudentsSection.vue）。
 * 假数据照 client/src/views/teacher/Students.vue 的字段形状写（_displaySid / realName / 班级 / 学校），
 * 但不 import 任何业务模块 —— 手册是公开路由，不调接口、不依赖登录态。
 * 要改演示节奏改这里的 dwell；要改讲解改 caption / ariaLabel / steps[].label。
 */

/** 学生名单（假数据；学号形如 2025010xx，姓名/学校均为虚构） */
export const students = [
  { sid: '2025010101', name: '陈嘉懿', className: '软件工程 1 班', school: 'Deadpan 大学', createdAt: '2025-09-01' },
  { sid: '2025010102', name: '林小雨', className: '软件工程 1 班、计算机科学与技术 3 班 +1', school: 'Deadpan 大学', createdAt: '2025-09-01' },
  { sid: '2025010103', name: '赵子涵', className: '软件工程 2 班', school: 'Deadpan 大学', createdAt: '2025-09-02' },
];

/** 新增学生表单（第 2 步填入、第 3 步提交后落成新的一行） */
export const newStudent = {
  modalTitle: '新增学生',
  sid: '2025010104',
  name: '周予安',
  className: '软件工程 2 班',
  school: 'Deadpan 大学',
  createdAt: '2025-09-02',
};

/** 「重置密码」的二次确认文案（对齐真实界面的 a-popconfirm 文案） */
export const resetConfirm = {
  title: '确认将该学生密码重置为学号？',
  desc: '重置后旧密码立即失效。',
  okText: '重置为学号',
  cancelText: '取消',
  toast: '密码已重置为学号',
};

export const studentsScene = {
  id: 'students',
  title: '学生管理 · 添加学生与重置密码',
  caption: '点「新增学生」→ 填学号/姓名/班级 → 确定 → 新行出现 → 重置密码 → 确认',
  // 读屏用户听到的就是这句：把"剧情"讲清楚（动画层 aria-hidden，不会念出一堆无意义节点）
  ariaLabel:
    '学生管理演示：学生列表里每行是学号（等宽字体）、姓名（24 像素首字头像 + 班级副行）、学校和操作。' +
    '第一步点右上角「新增学生」按钮，弹出表单；第二步填入学号、姓名并选择班级；第三步点「新增学生」确定，' +
    '新学生出现在名单第一行；第四步点这一行的「重置密码」；第五步在确认框里点「重置为学号」，' +
    '提示「密码已重置为学号」。仅为演示，不会真的新增学生或重置任何密码。',
  // dwell 之和 8700ms：自证脚本 t4 点击后只等 9000ms 就断言终态（finished），
  // 求和必须 < 9000，否则演示「还没播完」被误判为失败。
  steps: [
    { label: '认识学生列表（学号/姓名/学校/操作）', dwell: 1700 },
    { label: '点「新增学生」打开表单', dwell: 1300 },
    { label: '填学号、姓名，选班级', dwell: 1700 },
    { label: '点「新增学生」确定 → 新行出现', dwell: 1500 },
    { label: '点「重置密码」→ 确认重置为学号', dwell: 2500 },
  ],
};
