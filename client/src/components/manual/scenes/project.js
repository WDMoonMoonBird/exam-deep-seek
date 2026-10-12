/**
 * 场景：实训题 · 新建与 AI 评审（手册第 7 节「实训题管理」）
 *
 * 约定：场景文件只放「文案 + 步骤脚本 + 演示假数据」，不放界面（界面在 sections/ProjectSection.vue）。
 * 文案只对齐真实视图的标签（不 import 任何业务组件）：ProjectQuestionEdit.vue（编辑页）、
 * ProjectReviewNew.vue（教师评审页）、ReviewDetail.vue（底部「保存审核 / 发布成绩」操作条）。
 * 假数据直接写在这里：手册是公开路由，不调接口、不依赖登录态。
 */
export const project = {
  id: 'project',
  title: '实训题 · 新建与 AI 评审',
  caption: '填题目信息 → 上传标准工程包 → 出现文件树 → 教师看 AI 评分卡 → 发布成绩',
  // 读屏用户听到的就是这句：动画层 aria-hidden，剧情与「不是真的」都要在这里讲清
  ariaLabel:
    '实训题新建与 AI 评审演示，共 5 步：第 1 步是实训题编辑页，左边填题目名称、难度、满分与评分标准，右边是工程代码区缩略；' +
    '第 2 步点「点击上传标准工程包」；第 3 步上传完成后，右侧 IDE 出现资源管理器文件树与代码，题目下方显示已上传的 zip 与文件数；' +
    '第 4 步切到教师评审视角，评分面板显示 AI 评分 88 分、三项分项得分与点评、优点与问题、总体评语，以及最终分数与教师评语；' +
    '第 5 步点底部「发布成绩」，状态变为已发布、成绩锁定不可修改。' +
    '以上全部是演示用的假数据：不会真的上传文件、不会真的调用 AI 评分，也不会真的发布成绩。',
  steps: [
    { label: '实训题编辑页：左题目信息 + 右代码区缩略', dwell: 1500 },
    { label: '点「点击上传标准工程包」', dwell: 1700 },
    { label: '上传后出现文件树与代码', dwell: 1700 },
    { label: '教师评审视角：AI 评分卡（分数 + 评语）', dwell: 2400 },
    { label: '点「发布成绩」', dwell: 2200 },
  ],

  // ↓↓↓ 演示假数据（真实界面里这些来自接口） ↓↓↓

  /** 题目信息（编辑页顶部 + 题目信息卡） */
  question: {
    title: '用户管理系统（前端）',
    difficulty: '中等',
    maxScore: 100,
    rubric: '功能完整性 50% + 代码规范 25% + 健壮性 25%（默认标准）',
  },

  /** 标准工程包（ProjectZipUploader：圆形 + 按钮 + 提示文案） */
  zip: { name: 'user-management.zip', files: 24, hint: '点击上传标准工程包' },

  /** 编辑页底部的开放性题目说明（真实文案，演示里截短） */
  openHint: '本项可选：不上传标准工程包即为开放性题目，AI 只依据评分标准做评价式评分。',

  /** 资源管理器文件树（扁平化 + depth，便于演示里缩进渲染） */
  tree: [
    { name: 'user-management', depth: 0, dir: true },
    { name: 'src', depth: 1, dir: true },
    { name: 'components', depth: 2, dir: true },
    { name: 'UserTable.vue', depth: 3 },
    { name: 'UserForm.vue', depth: 3 },
    { name: 'App.vue', depth: 2, active: true },
    { name: 'main.js', depth: 2 },
    { name: 'package.json', depth: 1 },
    { name: 'README.md', depth: 1 },
  ],

  /** 假代码区（不用真实 Monaco，纯文本行） */
  code: [
    '<template>',
    '  <div class="user-page">',
    '    <UserTable :list="users" @edit="onEdit" />',
    '    <UserForm v-if="editing" :user="editing" @save="onSave" />',
    '  </div>',
    '</template>',
    '',
    '<script setup>',
    "import { ref, onMounted } from 'vue'",
    "import { fetchUsers } from './api/user'",
    'const users = ref([])',
    'const editing = ref(null)',
    'function onEdit(user) { editing.value = user }',
    'onMounted(async () => {',
    '  users.value = await fetchUsers()',
    '})',
    '</script>',
  ],

  /** 学生与 AI 评分结果（评审页） */
  student: { name: '张三', no: '2023001' },
  ai: {
    score: 88,
    breakdown: [
      { item: '功能完整性', kind: '主观', score: 45, max: 50, comment: '增删改查齐全；分页与搜索未实现' },
      { item: '代码规范', kind: '主观', score: 22, max: 25, comment: '组件拆分清晰，命名统一' },
      { item: '健壮性', kind: '主观', score: 21, max: 25, comment: '接口失败时没有提示与重试' },
    ],
    highlights: [
      'UserTable / UserForm 职责单一，组合关系清楚',
      '接口调用集中在 api/user.js，没有散落各组件',
    ],
    issues: [
      '删除操作缺少二次确认',
      '列表为空时没有兜底展示',
    ],
    overallComment:
      '整体完成度较高：用户列表与新增/编辑表单功能可用，代码结构清晰、命名规范。建议补充删除二次确认与接口异常提示；分页与搜索可作为下一版迭代。',
    finalScore: 88,
    teacherFeedback: '【AI 评语】整体完成度较高：用户列表与新增/编辑表单功能可用……',
  },
};
