/**
 * 场景：实训题 · 新建与 AI 评审（手册第 7 节「实训题管理」）
 *
 * 约定：场景文件只放「文案 + 步骤脚本 + 演示假数据」，不放界面（界面在 sections/ProjectSection.vue）。
 * 文案与结构逐条对齐真实视图（不 import 任何业务组件）：
 *   · ProjectQuestionEdit.vue —— 新建实训题页（compact 页头 / 一行 meta-row / 整块 ide-stage，
 *     阶段一 = 居中圆形「+」上传入口 + 开放性题目说明；阶段二 = 左文件树 + 右标签页与代码）
 *   · ProjectReviewNew.vue —— 教师评审页（顶栏状态徽标 / 三栏 IDE / 右侧评分面板：
 *     AI 评分 → 评分标准（折叠）→ 优点与问题 → AI 评语 + 引用到教师评语 → 最终分数 → 教师评语 →
 *     底部提示 + 主按钮「审核通过」（已审核后变「更新审核」）；成绩发布后同页锁定不可修改）
 * 假数据直接写在这里：手册是公开路由，不调接口、不依赖登录态。
 */
export const project = {
  id: 'project',
  title: '实训题 · 新建与 AI 评审',
  caption: '新建实训题（返回 + 一行 meta-row + 居中大圆形「+」）→ 上传标准工程包 → 阶段二文件树与代码 → 教师评审页 → 点「审核通过」→ 成绩发布后锁定',
  // 读屏用户听到的就是这句：动画层 aria-hidden，剧情与「不是真的」都要在这里讲清
  ariaLabel:
    '实训题新建与 AI 评审演示，共 6 步（全部是演示用的假数据）：' +
    '第 1 步是新建实训题页 —— 左上角只有一行「← 返回题库管理」，下面一行信息条依次是题目名输入框（空白，占位符「新建实训题」）、BETA 标签、难度「中等」、「满分」和数字 100，' +
    '右端是同行的「题目描述」「评分标准」「保存」三个按钮；页面主体是整整一块居中的大圆形「+」按钮，下面写着「点击上传标准工程包」，' +
    '再下面是灰色小字说明「不上传标准工程包即为开放性题目」；' +
    '第 2 步点这个大圆形「+」，显示「正在解析中...」与包名 user-management.zip，随后显示「已解析 24 个代码文件」；' +
    '第 3 步进入阶段二：左侧是资源管理器文件树（选中 App.vue），右侧是标签页与带行号、带语法着色的代码区；' +
    '第 4 步切到教师评审页：顶部是题目名、实训题与 BETA 标签、学生张三 / 2023001、状态「AI 已评分」，' +
    '右侧评分面板自上而下是 AI 评分 88 / 100 与「重新评分」「查看提示词」按钮、折叠的「评分标准（3 项）」、优点与问题、' +
    'AI 评语与「引用到教师评语」、最终分数 88、教师评语输入框，底部提示「审核通过后学生即可看到分数与评语」与主按钮「审核通过」；' +
    '第 5 步点「审核通过」，顶部状态变为「已审核」，底部提示变为「已审核，可修改后重新提交」，主按钮变成「更新审核」，并弹出提示「审核通过，学生已可见成绩」；' +
    '第 6 步是成绩发布之后同一页的锁定态：状态「已发布」，底部提示「成绩已发布，不可修改」，审核按钮不可再点。' +
    '以上都是演示：不会真的上传文件、不会真的调用 AI 评分、不会真的保存审核，也不会真的发布成绩。',
  steps: [
    { label: '新建实训题页：左上角返回 + 一行 meta-row + 居中的大圆形「+」上传入口', dwell: 2800 },
    { label: '点「+」上传标准工程包：正在解析中… → 已解析 24 个代码文件', dwell: 2900 },
    { label: '阶段二：左文件树（选中 App.vue）+ 右标签页与代码', dwell: 3000 },
    { label: '教师评审页：AI 评分 88/100 + AI 评语 + 最终分数 + 教师评语', dwell: 3600 },
    { label: '点「审核通过」→ 状态「已审核」，按钮变「更新审核」', dwell: 3000 },
    { label: '成绩发布后的锁定态：已发布 · 成绩已发布，不可修改', dwell: 2800 },
  ],

  // ↓↓↓ 演示假数据（真实界面里这些来自接口） ↓↓↓

  /** 题目信息（meta-row：难度下拉当前值 / 满分；标题输入框在新建态是空的） */
  question: {
    title: '用户管理系统（前端）',
    titlePlaceholder: '新建实训题',
    difficulty: '中等',
    maxScore: 100,
  },

  /** 标准工程包（ProjectZipUploader：圆形 + 按钮 + 提示；keptCount = 过滤后代码文件数） */
  zip: { name: 'user-management.zip', files: 24, hint: '点击上传标准工程包' },

  /** 阶段一的开放性题目说明（ProjectQuestionEdit.vue 的真实文案，演示里同样居中灰字、可截断） */
  openHint:
    '本项可选：不上传标准工程包即为开放性题目 —— AI 将只依据上方评分标准对学生工程做评价式评分，不与参考答案对比。建议在评分标准中逐条写明必须完成的功能及分值。',

  /** 资源管理器文件树（扁平化 + depth，便于演示里缩进渲染；active = 当前选中） */
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

  /** 假代码区（不用真实 Monaco，纯文本行 + 行号 + 关键字着色） */
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

  /** 学生（顶栏「姓名 / 学号」：displayNo = username 去掉 @ 后缀） */
  student: { name: '张三', no: '2023001' },

  /** AI 评分结果（评审页右栏；文案对齐 ProjectReviewNew.vue 的 AI 区） */
  ai: {
    score: 88,
    /** 评分标准：默认折叠（真实页 a-collapse 未设默认展开） */
    breakdown: [
      { item: '功能完整性', kind: '主观', score: 45, max: 50, comment: '增删改查齐全；分页与搜索未实现' },
      { item: '代码规范', kind: '主观', score: 22, max: 25, comment: '组件拆分清晰，命名统一' },
      { item: '健壮性', kind: '主观', score: 21, max: 25, comment: '接口失败时没有提示与重试' },
    ],
    highlights: [
      'UserTable / UserForm 职责单一，组合关系清楚',
      '接口调用集中在 api/user.js，没有散落各组件',
    ],
    issues: ['删除操作缺少二次确认', '列表为空时没有兜底展示'],
    overallComment:
      '整体完成度较高：用户列表与新增/编辑表单功能可用，代码结构清晰、命名规范。建议补充删除二次确认与接口异常提示；分页与搜索可作为下一版迭代。',
    finalScore: 88,
    /** 教师评语输入框的 placeholder（真实文案，逐字照抄） */
    feedbackPlaceholder: '审核后对学生可见；AI 评语不会自动下发，可点左侧「引用到教师评语」',
  },
};
