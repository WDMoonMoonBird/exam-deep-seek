/**
 * 场景：班级管理 · 新建班级与查看人数（对应手册 3.1 创建班级 / 3.2 指定教学团队 / 3.3 团队共享标识）
 *
 * 约定（见 manual/README.md）：场景文件只放「文案 + 步骤脚本 + 假数据」，不放界面（界面在 sections/ClassesSection.vue）。
 * 假数据照 client/src/views/teacher/Classes.vue 的字段形状写（name / school.name / _count.studentClasses /
 * createdAt / isTeamClass / ownerTeacherName），但不 import 任何业务模块 —— 手册是公开路由，不调接口、不依赖登录态。
 * 要改演示节奏改这里的 dwell；要改讲解改 caption / ariaLabel / steps[].label。
 */

/** 班级列表（假数据；学校、班级名、创建时间均为虚构，人数对应「学生数」列） */
export const classRows = [
  { name: '软件工程 1 班', school: '示例大学 · 计算机学院', count: 50, createdAt: '2026-03-12', team: '' },
  { name: '软件工程 2 班', school: '示例大学 · 计算机学院', count: 48, createdAt: '2026-03-12', team: '' },
  { name: '计算机科学与技术 3 班', school: '示例大学 · 计算机学院', count: 46, createdAt: '2026-03-18', team: '团队共享 · 李老师' },
];

/**
 * 新增班级表单（第 2 步填入、第 3 步提交后落在列表第一行）
 * okText / cancelText / toast 逐字对齐 Classes.vue：新增态按钮文案是「新增班级」，
 * 提交后 message.success('创建成功')；新建的班级还没有学生，所以是 0 人。
 */
export const newClass = {
  modalTitle: '新增班级',
  name: '人工智能 1 班',
  namePlaceholder: '例如：软件工程 2024 级 1 班',
  teamPlaceholder: '可选，将班级加入指定团队',
  okText: '新增班级',
  cancelText: '取消',
  toast: '创建成功',
  school: '示例大学 · 计算机学院',
  createdAt: '2026-10-12',
};

export const classesScene = {
  id: 'classes',
  title: '班级管理 · 新建与查看人数',
  caption: '看列表 → 点「新增班级」→ 填班级名称 → 点「新增班级」确定 → 新行插入列表顶部 → 人数随学生变化',
  // 读屏用户听到的就是这句 —— 动画层整体 aria-hidden，可访问名全在这里
  ariaLabel:
    '班级管理演示：列表有四列，依次是班级名称、人数、创建时间、操作；班级名称是两行式 —— 上行班级名' +
    '（团队共享的班级会在名字后跟一个「团队共享 · 教师姓名」标签），下行是所属学校。' +
    '第一步先看这份列表：软件工程 1 班 50 人、软件工程 2 班 48 人、计算机科学与技术 3 班 46 人（团队共享）。' +
    '第二步点右上角「新增班级」按钮，弹出模态框；第三步在「班级名称」里输入「人工智能 1 班」，' +
    '「指定教学团队」留空表示不加入任何团队；第四步点弹窗右下角的「新增班级」按钮（就是确定），' +
    '列表顶部随即插入这一行，同时提示「创建成功」，班级总数变成 4。' +
    '第五步提示人数这一列：它来自该班级的学生名单，新班级先显示 0 人，导入学生后数字会跟着变化。' +
    '仅为演示，不会真的创建班级，也不会写入任何数据。',
  steps: [
    { label: '看班级列表：班级名称 / 人数 / 创建时间 / 操作', dwell: 1900 },
    { label: '点右上角「新增班级」', dwell: 1600 },
    { label: '在弹窗里填写班级名称', dwell: 2100 },
    { label: '点「新增班级」确定 → 新行插入列表顶部', dwell: 1900 },
    { label: '人数列：学生加入后会变化', dwell: 2100 },
  ],
};
